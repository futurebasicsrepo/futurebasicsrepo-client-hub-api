// The Spot app for Shopify: one-click install, and an "Ask someone to pay"
// block stores drag onto their product and cart pages in the theme editor
// (the block itself lives in spot/shopify-app/).
//
// Install uses Shopify managed installation: Shopify asks the merchant for
// the scopes in shopify.app.toml, then loads /shopify inside the admin. That
// page gets a session token from App Bridge, and Spot trades it for the
// store's offline access token (token exchange). On that first visit Spot
// makes the store a verified Spot merchant: Shopify vouches for the domain,
// so payers see "sent from Your Store's checkout ✓" with no text file.
//
// The block never sends prices. It sends variant ids and quantities, and
// Spot prices them from the store's own catalog, so a tampered page can't
// put a $1 jacket in a payer's cart.
//
//   GET  /shopify                the embedded admin page
//   POST /shopify/api/setup      (session token) install or refresh, then status
//   POST /shopify/webhooks       app/uninstalled and the privacy webhooks
//   POST /v1/shopify/asks        { shop, lines: [{ variant_id, quantity }] } from the storefront
//                                → { draft_id, url } (the same drafts the store button uses)
//
//   SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET  from the Dev Dashboard
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CartError } from './cart.js';

export const SHOPIFY_API_VERSION = '2026-07';
export const BLOCK_HANDLE = 'spot-button';
const SHOP = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function shopDomain(v) {
  const s = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return SHOP.test(s) ? s : null;
}

// App Bridge session token: an HS256 JWT signed with the app secret.
export function verifySessionToken(token, { clientId, secret, now = Date.now() }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString());
    claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256') return null;
  if (!safeEqual(sig, b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest()))) return null;
  const t = Math.floor(now / 1000);
  if (!(claims.exp > t - 5) || (claims.nbf && claims.nbf > t + 5)) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) return null;
  let shop;
  try {
    shop = shopDomain(new URL(claims.dest).hostname);
    if (!shop || new URL(claims.iss).hostname !== shop) return null;
  } catch {
    return null;
  }
  return { shop, user: claims.sub ? String(claims.sub) : null, claims };
}

// Webhooks: base64 HMAC-SHA256 of the raw body.
export function verifyWebhook(raw, hmac, secret) {
  if (!raw || !hmac) return false;
  return safeEqual(createHmac('sha256', secret).update(raw).digest('base64'), hmac);
}

// Offline tokens at rest: AES-256-GCM with a key from the app secret, so a
// copy of the database (a backup) doesn't hand out store access.
function sealer(secret) {
  const key = createHash('sha256').update(`spot-shopify-token:${secret}`).digest();
  return {
    seal(text) {
      if (!text) return null;
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
      return `v1.${b64url(iv)}.${b64url(c.getAuthTag())}.${b64url(body)}`;
    },
    open(sealed) {
      try {
        const [v, iv, tag, body] = String(sealed || '').split('.');
        if (v !== 'v1') return null;
        const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        d.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
      } catch {
        return null; // the secret changed: the store reconnects on its next admin visit
      }
    },
  };
}

const cents = (money) => {
  const n = Number(money);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const gidNum = (gid) => String(gid || '').split('/').pop();

export function registerShopifyApp(app, { db, env, urlFor, cfg, fetchImpl = fetch, log = console, metrics = null }) {
  const clientId = String(env.SHOPIFY_APP_CLIENT_ID || '').trim();
  const secret = String(env.SHOPIFY_APP_CLIENT_SECRET || '').trim();
  const ready = () => Boolean(clientId && secret);
  const box = secret ? sealer(secret) : null;

  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) throw new CartError('Too many requests, slow down', 429);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  };
  const notSetUp = () => new CartError('The Spot Shopify app isn’t set up yet', 503);

  async function shopifyFetch(url, init) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  }

  async function exchange(shop, idToken) {
    const { res, body } = await shopifyFetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: secret,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: idToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      }),
    });
    if (!res.ok || !body.access_token) throw new Error(`Shopify token exchange ${res.status}: ${body.error_description || body.error || 'no token'}`);
    return body;
  }

  // Expiring offline tokens come with a refresh token; plain ones don't expire.
  async function refresh(row) {
    const rt = box.open(row.refresh);
    if (!rt) return null;
    const { res, body } = await shopifyFetch(`https://${row.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: secret, grant_type: 'refresh_token', refresh_token: rt }),
    });
    if (!res.ok || !body.access_token) return null;
    db.shopify.save({ ...row, ...tokenFields(body) });
    return body.access_token;
  }
  const tokenFields = (t) => ({
    token: box.seal(t.access_token),
    refresh: t.refresh_token ? box.seal(t.refresh_token) : null,
    token_expires_at: t.expires_in ? Date.now() + Number(t.expires_in) * 1000 : null,
    scopes: t.scope || null,
  });

  async function tokenFor(row) {
    if (!row || row.uninstalled_at || !row.token) return null;
    if (row.token_expires_at && row.token_expires_at < Date.now() + 60_000) return refresh(row);
    return box.open(row.token);
  }

  async function graphql(shop, token, query, variables = {}) {
    const { res, body } = await shopifyFetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-shopify-access-token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok || body.errors) {
      metrics?.fail('shopify_app', new Error(`Shopify ${res.status}`));
      const err = new Error(`Shopify Admin API ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    metrics?.ok('shopify_app');
    return body.data;
  }

  // Make (or refresh) the store's Spot merchant from what Shopify says.
  async function onboard(shop, token, existing) {
    const data = await graphql(shop, token, `{ shop { name email contactEmail currencyCode primaryDomain { host } } }`);
    const s = data.shop;
    const host = String(s.primaryDomain?.host || shop).toLowerCase().replace(/^www\./, '');
    const name = String(s.name || shop).slice(0, 60);
    const email = String(s.contactEmail || s.email || '').toLowerCase().slice(0, 200);
    let merchantId = existing?.merchant_id && db.merchants.byId(existing.merchant_id) ? existing.merchant_id : null;
    if (merchantId) db.merchants.update(merchantId, { domain: host, name, email });
    else {
      merchantId = `mer_${randomBytes(8).toString('hex')}`;
      db.merchants.add({ id: merchantId, domain: host, name, email, key: `spk_${randomBytes(18).toString('base64url')}` });
    }
    // Shopify serves the store from this domain, which proves it's theirs.
    if (!db.merchants.byId(merchantId).verified_at) db.merchants.verify(merchantId);
    return { merchant_id: merchantId, primary_host: host, name, email, currency: String(s.currencyCode || '').toUpperCase() };
  }

  const editorLink = (shop, template) => `https://${shop}/admin/themes/current/editor?template=${template}&addAppBlockId=${encodeURIComponent(`${clientId}/${BLOCK_HANDLE}`)}&target=mainSection`;

  // ─── The embedded admin page ────────────────────────────────────────────
  app.get('/shopify', async (req, reply) => {
    const shop = shopDomain(req.query?.shop);
    reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('content-security-policy', `frame-ancestors ${shop ? `https://${shop}` : 'https://*.myshopify.com'} https://admin.shopify.com; base-uri 'self'; object-src 'none'`);
    reply.embeddable = true;
    return adminPage({ clientId, ready: ready(), embedded: Boolean(req.query?.host || req.query?.embedded), shop });
  });

  app.post('/shopify/api/setup', async (req) => {
    if (!ready()) throw notSetUp();
    limit(`shopify-setup:${req.ip}`, 30, 600_000);
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const session = verifySessionToken(raw, { clientId, secret });
    if (!session) throw new CartError('Open Spot from your Shopify admin', 401);
    const { shop } = session;
    let row = db.shopify.get(shop);
    const fresh = async () => {
      const t = await exchange(shop, raw);
      db.shopify.save({ ...(row || {}), shop, ...tokenFields(t) });
      row = db.shopify.get(shop);
      log.info?.({ shop }, 'shopify app installed');
      return t.access_token;
    };
    let token = (await tokenFor(row)) || (await fresh());
    let info;
    try {
      info = await onboard(shop, token, row);
    } catch (err) {
      // A stored token Shopify no longer accepts (reinstalled while an
      // uninstall webhook was missed): trade the session token again.
      if (err.status !== 401) throw err;
      token = await fresh();
      info = await onboard(shop, token, row);
    }
    db.shopify.save({ ...row, ...info });
    const m = db.merchants.byId(info.merchant_id);
    return {
      shop,
      name: info.name,
      domain: info.primary_host,
      verified: Boolean(m?.verified_at),
      currency: info.currency,
      currency_ok: info.currency === 'USD',
      add_to_product: editorLink(shop, 'product'),
      add_to_cart: editorLink(shop, 'cart'),
    };
  });

  // ─── Webhooks ───────────────────────────────────────────────────────────
  app.post('/shopify/webhooks', async (req, reply) => {
    if (!ready()) throw notSetUp();
    if (!verifyWebhook(req.rawBody, req.headers['x-shopify-hmac-sha256'], secret)) return reply.code(401).send({ error: 'Bad signature' });
    const topic = String(req.headers['x-shopify-topic'] || '');
    const shop = shopDomain(req.headers['x-shopify-shop-domain'] || req.body?.shop_domain);
    metrics?.ok('shopify_webhook');
    if (!shop) return { ok: true };
    if (topic === 'app/uninstalled') db.shopify.uninstall(shop);
    // 48 hours after uninstalling: forget the store. Spot keeps no Shopify
    // customer data, so the customer privacy topics have nothing to do; the
    // carts shoppers chose to send are Spot's own records.
    else if (topic === 'shop/redact') db.shopify.remove(shop);
    log.info?.({ shop, topic }, 'shopify webhook');
    return { ok: true };
  });

  // ─── From the storefront block ──────────────────────────────────────────
  const originHosts = (row) => {
    const hosts = new Set([row.shop]);
    if (row.primary_host) hosts.add(row.primary_host).add(`www.${row.primary_host}`);
    return hosts;
  };
  const originOk = (row, origin) => {
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' && originHosts(row).has(u.hostname);
    } catch {
      return false;
    }
  };

  app.options('/v1/shopify/asks', async (req, reply) => {
    reply
      .header('access-control-allow-origin', String(req.headers.origin || '*'))
      .header('access-control-allow-methods', 'POST')
      .header('access-control-allow-headers', 'content-type')
      .header('access-control-max-age', '600')
      .header('vary', 'origin')
      .code(204)
      .send();
  });

  app.post('/v1/shopify/asks', async (req, reply) => {
    const origin = String(req.headers.origin || '');
    reply.header('vary', 'origin');
    if (!ready()) throw notSetUp();
    limit(`shopify-ask:${req.ip}`, 60, 600_000);
    const shop = shopDomain(req.body?.shop);
    const row = shop ? db.shopify.get(shop) : null;
    if (!row || row.uninstalled_at || !row.merchant_id) throw new CartError('This store hasn’t set up Spot', 404);
    if (!originOk(row, origin)) throw new CartError('This button only works on the store’s own pages', 403);
    reply.header('access-control-allow-origin', origin);
    limit(`shopify-ask-shop:${shop}`, 600, 600_000);
    if (row.currency && row.currency !== 'USD') throw new CartError('Spot works with stores that sell in US dollars for now', 409);

    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!lines.length) throw new CartError('Your cart is empty');
    if (lines.length > 25) throw new CartError('Up to 25 items');
    const qty = new Map();
    for (const l of lines) {
      const id = String(l?.variant_id ?? '').replace(/^gid:\/\/shopify\/ProductVariant\//, '');
      const q = Math.round(Number(l?.quantity ?? 1));
      if (!/^\d{1,20}$/.test(id)) throw new CartError('Bad item in the cart');
      if (!Number.isFinite(q) || q < 1 || q > 20) throw new CartError('Up to 20 of each item');
      qty.set(id, Math.min(20, (qty.get(id) || 0) + q));
    }

    const token = await tokenFor(row);
    if (!token) throw new CartError('This store needs to open the Spot app in Shopify again', 503);
    let data;
    try {
      data = await graphql(shop, token, VARIANTS_QUERY, { ids: [...qty.keys()].map((id) => `gid://shopify/ProductVariant/${id}`) });
    } catch (err) {
      log.error?.({ shop, err: err.message }, 'shopify variants failed');
      throw new CartError('Couldn’t read this store’s prices. Try again in a moment.', 502);
    }
    const base = `https://${row.primary_host || shop}`;
    const items = (data.nodes || []).map((v) => {
      if (!v?.id || v.product?.status !== 'ACTIVE') throw new CartError('Something in this cart isn’t for sale');
      if (v.availableForSale === false) throw new CartError(`${v.product.title} is sold out`);
      const price = cents(v.price);
      if (!Number.isFinite(price) || price < 1 || price > cfg.maxCartCents) throw new CartError(`Can’t price ${v.product.title}`);
      const id = gidNum(v.id);
      const img = v.media?.nodes?.[0]?.preview?.image?.url || v.product.featuredMedia?.preview?.image?.url || null;
      const page = v.product.onlineStoreUrl || `${base}/products/${v.product.handle}`;
      return {
        title: String(v.product.title).slice(0, 200),
        variant: v.title && v.title !== 'Default Title' ? String(v.title).slice(0, 80) : null,
        quantity: qty.get(id),
        price_cents: price,
        url: `${page}${page.includes('?') ? '&' : '?'}variant=${id}`,
        image_url: img && /^https:\/\//.test(img) ? img : null,
      };
    });
    if (items.length !== qty.size) throw new CartError('Something in this cart isn’t for sale');

    const id = `drf_${randomBytes(12).toString('base64url')}`;
    db.drafts.put(id, row.merchant_id, { merchant: { name: row.name || shop, url: base }, items, extras_cents: 0 });
    reply.code(201);
    return { draft_id: id, url: urlFor(req, `/new?draft=${id}`), expires_in: 3600 };
  });

  return { ready, installed: () => db.shopify.count() };
}

const VARIANTS_QUERY = `query SpotVariants($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id title price availableForSale
      media(first: 1) { nodes { preview { image { url } } } }
      product { title handle status onlineStoreUrl featuredMedia { preview { image { url } } } }
    }
  }
}`;

function adminPage({ clientId, ready, embedded, shop }) {
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spot</title>${ready ? `<meta name="shopify-api-key" content="${esc(clientId)}"><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>` : ''}
<style>
:root{--ink:#1b1712;--muted:#6d655b;--line:#e6ded2;--card:#fff;--bg:#f6f6f7;--spot:#ff5a36;--ok:#1a7f4b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px;display:grid;gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
h1{font-size:20px;margin:0 0 4px;display:flex;align-items:center;gap:10px}h1 span{width:14px;height:14px;border-radius:50%;background:var(--spot);display:inline-block}
h2{font-size:16px;margin:0 0 8px}p{margin:0 0 10px;color:var(--muted)}ol{margin:0;padding-left:20px}li{margin:6px 0}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
a.btn{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:8px;background:var(--ink);color:#fff;text-decoration:none;font-weight:600}
a.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.ok{color:var(--ok);font-weight:600}.warn{color:#a86400;font-weight:600}.muted{color:var(--muted)}
</style></head><body><main>`;
  if (!ready || !embedded) {
    return `${head}<section class="card"><h1><span></span>Spot for Shopify</h1>
<p>Let shoppers send their cart to whoever’s paying (a parent, a partner, a friend) and you still get the order.</p>
<p>${ready ? 'Install Spot from the Shopify App Store, then open it from your Shopify admin.' : 'The Shopify app is coming soon.'} Until then, any store can add the button by hand: <a href="/integrations#stores" target="_top">see the integrations page</a>.</p></section></main></body></html>`;
  }
  return `${head}
<section class="card" id="status" aria-live="polite"><h1><span></span>Spot is installed</h1><p class="muted">Checking your store…</p></section>
<section class="card"><h2>Add the button to your store</h2>
<p>Put “Ask someone to pay” under your buy buttons, your cart, or both. You can change its text, colors, roundness, size and font in the theme editor.</p>
<div class="row"><a class="btn" id="addProduct" target="_top" href="#">Add to product pages</a><a class="btn ghost" id="addCart" target="_top" href="#">Add to the cart page</a></div>
<p class="muted" style="margin-top:12px">Then press <b>Save</b> in the theme editor.</p></section>
<section class="card"><h2>How it works</h2><ol>
<li>A shopper taps the button. Their cart, at your prices, opens in Spot.</li>
<li>They send it to whoever’s paying, by text or any messaging app.</li>
<li>The payer pays on your own checkout when your store supports agent checkout, so the order and the customer are yours and Spot takes no fee. Otherwise Spot buys it from you and ships it to the shopper.</li></ol>
<p style="margin-top:10px">Spot reads your product prices to build the cart, nothing else. <a href="/privacy" target="_blank" rel="noopener">Privacy</a> · <a href="/terms" target="_blank" rel="noopener">Terms</a> · <a href="mailto:hello@spotmeplease.com">hello@spotmeplease.com</a></p></section>
</main>
<script>
(async()=>{const st=document.getElementById('status');
try{const t=await shopify.idToken();const r=await fetch('/shopify/api/setup',{method:'POST',headers:{authorization:'Bearer '+t}});const j=await r.json();if(!r.ok)throw new Error(j.error||'Something went wrong');
document.getElementById('addProduct').href=j.add_to_product;document.getElementById('addCart').href=j.add_to_cart;
const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
st.innerHTML='<h1><span></span>Spot is on for '+e(j.name)+'</h1>'+(j.verified?'<p class="ok">✓ Verified: payers see “sent from '+e(j.name)+'’s checkout ✓”.</p>':'')+(j.currency_ok?'':'<p class="warn">Spot works with stores that sell in US dollars for now. Your store sells in '+e(j.currency)+'.</p>');
}catch(err){st.innerHTML='<h1><span></span>Spot</h1><p class="warn"></p>';st.querySelector('.warn').textContent=err.message+'. Reload to try again.'}})();
</script></body></html>`;
}
