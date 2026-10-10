// A customer's own Shopify store, connected to their room: install by authorization code, the token sealed at rest, calls made with it, the uninstall webhook.
// Plain functions with the network passed in, so every rule here (who may start an install, what a callback must prove, how the token is kept) is tested without Shopify.
//
//   1. The hub asks for an install: a random single-use state is stored against the client and the shop, and the merchant is sent to the shop's authorize page.
//   2. Shopify sends the merchant back with a code and an HMAC. The callback proves the HMAC (our app secret signed it), the state (we made it, it is unused, it has not
//      expired, it is for this shop) and the shop's name, and only then trades the code for the store's offline access token.
//   3. The token is sealed (AES-256-GCM) before it touches the database. A copy of the database does not hand out access to anyone's store.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SHOPIFY_APP_SCOPES = ['read_products', 'write_products'];
const SHOP = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
const b64 = buf => Buffer.from(buf).toString('base64url');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// "My-Store.myshopify.com", "https://my-store.myshopify.com/admin" → "my-store.myshopify.com"; a bare "my-store" works too; anything else is null.
export function shopDomain(v) {
  let s = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
  if (/^[a-z0-9][a-z0-9-]{0,60}$/.test(s)) s += '.myshopify.com';
  return SHOP.test(s) ? s : null;
}

export const appConfig = (env = process.env) => ({ clientId: String(env.SHOPIFY_APP_CLIENT_ID || ''), secret: String(env.SHOPIFY_APP_CLIENT_SECRET || ''), ready: Boolean(env.SHOPIFY_APP_CLIENT_ID && env.SHOPIFY_APP_CLIENT_SECRET),
  scopes: String(env.SHOPIFY_APP_SCOPES || SHOPIFY_APP_SCOPES.join(',')).split(',').map(s => s.trim()).filter(Boolean) });

export const authorizeUrl = ({ shop, clientId, scopes, redirectUri, state }) =>
  `https://${shop}/admin/oauth/authorize?${new URLSearchParams({ client_id: clientId, scope: scopes.join(','), redirect_uri: redirectUri, state })}`;

// Shopify signs the callback's query string: every parameter but hmac, sorted, joined with &, HMAC-SHA256 in hex.
export function verifyOAuthQuery(query, secret) {
  const q = query || {}, got = String(q.hmac || ''); if (!got || !secret) return false;
  const msg = Object.keys(q).filter(k => k !== 'hmac' && k !== 'signature').sort().map(k => `${k}=${Array.isArray(q[k]) ? q[k].join(',') : q[k]}`).join('&');
  return safeEqual(createHmac('sha256', secret).update(msg).digest('hex'), got);
}
export const signOAuthQuery = (query, secret) => { const msg = Object.keys(query).sort().map(k => `${k}=${query[k]}`).join('&'); return createHmac('sha256', secret).update(msg).digest('hex'); }; // what Shopify does, for tests

// Webhooks: base64 HMAC-SHA256 of the raw body.
export const verifyWebhook = (raw, hmac, secret) => Boolean(raw && hmac && secret) && safeEqual(createHmac('sha256', secret).update(raw).digest('base64'), hmac);

export const newState = () => randomBytes(24).toString('base64url');

export async function exchangeCode({ shop, code, clientId, secret, origin, fetchImpl = fetch }) {
  const res = await fetchImpl(`${origin}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: secret, code }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw Object.assign(new Error(j.error_description || j.error || `Shopify did not accept the install (${res.status})`), { statusCode: 502 });
  return { token: String(j.access_token), scope: String(j.scope || '') };
}

// The token at rest. The key is SHOPIFY_TOKEN_KEY when set, else derived from the app secret; if either changes the stores reconnect (open() returns null, never throws).
export function sealer(env = process.env) {
  const material = env.SHOPIFY_TOKEN_KEY || env.SHOPIFY_APP_CLIENT_SECRET || '';
  const key = createHash('sha256').update(`shopify-merchant-token:${material}`).digest();
  return {
    ready: Boolean(material),
    seal(text) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return `v1.${b64(iv)}.${b64(c.getAuthTag())}.${b64(body)}`; },
    open(sealed) {
      try { const [v, iv, tag, body] = String(sealed || '').split('.'); if (v !== 'v1') return null; const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8'); } catch { return null; }
    }
  };
}

export const SHOP_INFO_QUERY = `query PackShopInfo { shop { name myshopifyDomain currencyCode } currentAppInstallation { accessScopes { handle } } }`;
export const UNINSTALL_WEBHOOK = `mutation PackAppUninstalledWebhook($uri: String!) {
  webhookSubscriptionCreate(topic: APP_UNINSTALLED, webhookSubscription: { uri: $uri, format: JSON }) { webhookSubscription { id } userErrors { field message } }
}`;

// exec(query, variables) → data, for one store. A refused token (401, 403) calls onRefused() so the store can be marked for reconnecting; throttling is retried once.
export function merchantExec({ shop, token, origin, version = '2026-07', fetchImpl = fetch, onRefused = null, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  return async function exec(query, variables = {}) {
    const go = () => fetchImpl(`${origin}/admin/api/${version}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }) });
    let res = await go();
    if (res.status === 429) { await sleep(Math.min(5000, Number(res.headers.get('retry-after') || 1) * 1000)); res = await go(); }
    if (res.status === 401 || res.status === 403) { if (onRefused) await onRefused(res.status); throw Object.assign(new Error(`${shop} no longer lets this app in. Reconnect the store from your hub.`), { statusCode: 409, refused: true }); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`Shopify (${shop}) answered ${res.status}`), { statusCode: 502 });
    if (j.errors?.length) throw Object.assign(new Error(j.errors.map(x => x.message).join('; ')), { statusCode: 502 });
    return j.data;
  };
}
