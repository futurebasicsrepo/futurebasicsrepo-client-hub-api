// Shopify's agent access (Dev Dashboard → Catalogs → API key): a client id
// and secret traded for a short-lived Bearer token. With it, a Shopify
// store's UCP endpoint serves Spot at the "Token" tier (checkout and order
// tools, highest limits) instead of as an anonymous agent. Every call made
// with it names the buyer's IP (Shopify-Buyer-IP), so it's only used when a
// person is on the page.
//
//   SHOPIFY_CATALOG_CLIENT_ID / SHOPIFY_CATALOG_CLIENT_SECRET
import { isIP } from 'node:net';

const TOKEN_URL = 'https://api.shopify.com/auth/access_token';

export function createShopifyAuth({ env = process.env, fetchImpl = fetch, now = Date.now, log = console, metrics = null } = {}) {
  const id = String(env.SHOPIFY_CATALOG_CLIENT_ID || '').trim();
  const secret = String(env.SHOPIFY_CATALOG_CLIENT_SECRET || '').trim();
  let cached = null; // { token, until }
  let pending = null;
  let failedAt = 0;

  async function token() {
    if (cached && cached.until > now()) return cached.token;
    if (now() - failedAt < 60_000) return null; // don't hammer it while it's failing
    pending ||= (async () => {
      try {
        const res = await fetchImpl(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
          signal: AbortSignal.timeout(8000),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.access_token) throw new Error(`Shopify token ${res.status}: ${body.error_description || body.error || 'no token'}`);
        // Docs say an hour; refresh a few minutes early whatever it says.
        const life = Math.min(Number(body.expires_in) || 3600, 3600) * 1000;
        cached = { token: body.access_token, until: now() + life - 5 * 60_000 };
        metrics?.ok('shopify_token');
        return cached.token;
      } catch (err) {
        failedAt = now();
        log.error?.('shopify token failed', err.message);
        metrics?.fail('shopify_token', err);
        return null;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  return {
    enabled: Boolean(id && secret),
    // Headers for a call to a Shopify store's UCP endpoint, or null to call it as before.
    async headersFor(endpoint, buyerIp) {
      if (!id || !secret || !buyerIp || !isIP(String(buyerIp))) return null;
      let host = '';
      try {
        host = new URL(endpoint).hostname;
      } catch {
        return null;
      }
      if (!host.endsWith('.myshopify.com')) return null;
      const t = await token();
      return t ? { authorization: `Bearer ${t}`, 'shopify-buyer-ip': String(buyerIp) } : null;
    },
  };
}
