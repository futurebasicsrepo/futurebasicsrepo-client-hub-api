// The Spot app for Shopify: install by token exchange, a verified store,
// carts priced by Shopify (never by the page), and uninstall/privacy webhooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { verifySessionToken } from '../src/shopifyapp.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const CLIENT = 'client-abc';
const SECRET = 'shh-app-secret';
const SHOP = 'sklz-test.myshopify.com';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionToken({ shop = SHOP, aud = CLIENT, secret = SECRET, exp = Math.floor(Date.now() / 1000) + 60 } = {}) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ iss: `https://${shop}/admin`, dest: `https://${shop}`, aud, sub: '42', exp, nbf: Math.floor(Date.now() / 1000) - 1, iat: Math.floor(Date.now() / 1000), jti: 'j', sid: 's' });
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}

function fakeShopify({ currency = 'USD', variants } = {}) {
  const calls = [];
  const catalog = variants || {
    'gid://shopify/ProductVariant/111': { id: 'gid://shopify/ProductVariant/111', title: 'Default Title', price: '34.99', availableForSale: true, media: { nodes: [] }, product: { title: 'Pro Mini Hoop', handle: 'pro-mini-hoop', status: 'ACTIVE', onlineStoreUrl: 'https://sklz.com/products/pro-mini-hoop', featuredMedia: { preview: { image: { url: 'https://cdn.shopify.com/hoop.jpg' } } } } },
    'gid://shopify/ProductVariant/222': { id: 'gid://shopify/ProductVariant/222', title: 'Large', price: '12.00', availableForSale: true, media: { nodes: [] }, product: { title: 'Ball', handle: 'ball', status: 'ACTIVE', onlineStoreUrl: null, featuredMedia: null } },
    'gid://shopify/ProductVariant/333': { id: 'gid://shopify/ProductVariant/333', title: 'Default Title', price: '5.00', availableForSale: false, media: { nodes: [] }, product: { title: 'Gone', handle: 'gone', status: 'ACTIVE' } },
    'gid://shopify/ProductVariant/444': { id: 'gid://shopify/ProductVariant/444', title: 'Default Title', price: '5.00', availableForSale: true, media: { nodes: [] }, product: { title: 'Draft thing', handle: 'draft', status: 'DRAFT' } },
  };
  let issued = 0;
  let live = 'shpat_offline_1';
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body || '{}');
    calls.push({ url, body, headers: init.headers });
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
    if (url === `https://${SHOP}/admin/oauth/access_token`) return json({ access_token: (live = `shpat_offline_${++issued}`), scope: 'read_products' });
    if (url.startsWith(`https://${SHOP}/admin/api/`)) {
      if (init.headers['x-shopify-access-token'] !== live) return json({ errors: 'Invalid API key or access token' }, 401);
      if (body.query.includes('shop {')) return json({ data: { shop: { name: 'SKLZ', email: 'owner@sklz.com', contactEmail: 'help@sklz.com', currencyCode: currency, primaryDomain: { host: 'www.sklz.com' } } } });
      return json({ data: { nodes: body.variables.ids.map((id) => catalog[id] || null) } });
    }
    return json({ errors: ['unexpected'] }, 500);
  };
  return { fetchImpl, calls, revoke: () => (live = 'revoked') };
}

function app(t, opts = {}) {
  const db = openDb(':memory:');
  const shopify = fakeShopify(opts);
  const env = opts.env ?? { SHOPIFY_APP_CLIENT_ID: CLIENT, SHOPIFY_APP_CLIENT_SECRET: SECRET };
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env, shopifyFetch: shopify.fetchImpl });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, headers: r.headers, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { db, call, shopify };
}
const install = (call) => call('POST', '/shopify/api/setup', undefined, { authorization: `Bearer ${sessionToken()}` });
const ask = (call, lines, origin = 'https://sklz.com', shop = SHOP) => call('POST', '/v1/shopify/asks', { shop, lines, from: 'cart' }, { origin });

test('session tokens: signed by the app secret, for this app, not expired', () => {
  const ok = verifySessionToken(sessionToken(), { clientId: CLIENT, secret: SECRET });
  assert.equal(ok.shop, SHOP);
  assert.equal(verifySessionToken(sessionToken({ secret: 'other' }), { clientId: CLIENT, secret: SECRET }), null);
  assert.equal(verifySessionToken(sessionToken({ aud: 'other-app' }), { clientId: CLIENT, secret: SECRET }), null);
  assert.equal(verifySessionToken(sessionToken({ exp: Math.floor(Date.now() / 1000) - 60 }), { clientId: CLIENT, secret: SECRET }), null);
  assert.equal(verifySessionToken(sessionToken({ shop: 'evil.example.com' }), { clientId: CLIENT, secret: SECRET }), null);
});

test('install: token exchange, a verified store, the token sealed at rest, theme editor links', async (t) => {
  const { db, call, shopify } = app(t);
  assert.equal((await call('POST', '/shopify/api/setup')).status, 401, 'needs a session token');
  const r = await install(call);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.name, 'SKLZ');
  assert.equal(r.body.domain, 'sklz.com');
  assert.equal(r.body.verified, true);
  assert.equal(r.body.currency_ok, true);
  assert.match(r.body.add_to_product, /^https:\/\/sklz-test\.myshopify\.com\/admin\/themes\/current\/editor\?template=product&addAppBlockId=client-abc%2Fspot-button/);
  const exchange = shopify.calls.find((c) => c.url.endsWith('/admin/oauth/access_token'));
  assert.equal(exchange.body.grant_type, 'urn:ietf:params:oauth:grant-type:token-exchange');
  assert.equal(exchange.body.requested_token_type, 'urn:shopify:params:oauth:token-type:offline-access-token');
  const row = db.shopify.get(SHOP);
  assert.ok(row.token.startsWith('v1.') && !row.token.includes('shpat'), 'never stored in the clear');
  const m = db.merchants.byId(row.merchant_id);
  assert.equal(m.domain, 'sklz.com');
  assert.ok(m.verified_at);
  // Opening the app again reuses the token and the same merchant.
  const again = await install(call);
  assert.equal(again.status, 200);
  assert.equal(shopify.calls.filter((c) => c.url.endsWith('/access_token')).length, 1);
  assert.equal(db.shopify.get(SHOP).merchant_id, row.merchant_id);
  // Shopify stops accepting the stored token: the next admin visit trades again.
  shopify.revoke();
  assert.equal((await install(call)).status, 200);
  assert.equal(shopify.calls.filter((c) => c.url.endsWith('/access_token')).length, 2);
});

test('the admin page can be framed by Shopify, and only by Shopify', async (t) => {
  const { call } = app(t);
  const r = await call('GET', `/shopify?shop=${SHOP}&host=abc&embedded=1`);
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-frame-options'], undefined);
  assert.match(r.headers['content-security-policy'], /frame-ancestors https:\/\/sklz-test\.myshopify\.com https:\/\/admin\.shopify\.com/);
  assert.match(r.body, /<meta name="shopify-api-key" content="client-abc">/);
  assert.match(r.body, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/);
  assert.equal((await call('GET', '/new')).headers['x-frame-options'], 'DENY', 'every other page still refuses framing');
});

test('asks: Shopify prices the cart, the page can’t, and the shopper lands in Spot', async (t) => {
  const { call } = app(t);
  assert.equal((await ask(call, [{ variant_id: 111, quantity: 1 }])).status, 404, 'not installed yet');
  await install(call);
  const r = await ask(call, [{ variant_id: 111, quantity: 2, price_cents: 1 }, { variant_id: 'gid://shopify/ProductVariant/222', quantity: 1 }]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.headers['access-control-allow-origin'], 'https://sklz.com');
  assert.match(r.body.url, /\/new\?draft=drf_/);
  const d = await call('GET', `/v1/merchant/drafts/${r.body.draft_id}`);
  assert.equal(d.body.verified, true);
  assert.deepEqual(d.body.merchant, { name: 'SKLZ', url: 'https://sklz.com' });
  assert.deepEqual(
    d.body.items.map((i) => [i.title, i.variant, i.quantity, i.price_cents, i.url]),
    [
      ['Pro Mini Hoop', null, 2, 3499, 'https://sklz.com/products/pro-mini-hoop?variant=111'],
      ['Ball', 'Large', 1, 1200, 'https://sklz.com/products/ball?variant=222'],
    ],
    'prices from Shopify, not the 1¢ the page sent',
  );
  assert.equal(d.body.items[0].image_url, 'https://cdn.shopify.com/hoop.jpg');
  // The shopper names themselves and it's a normal Spot from the store's checkout.
  const cart = await call('POST', '/v1/carts', { draft_id: r.body.draft_id, requester: { name: 'Kyle' } });
  assert.equal(cart.status, 201, JSON.stringify(cart.body));
  assert.equal(cart.body.cart.total_cents >= 3499 * 2 + 1200, true);
});

test('asks: only from the store’s own pages, only things for sale, US dollars', async (t) => {
  const { call } = app(t);
  await install(call);
  assert.equal((await ask(call, [{ variant_id: 111 }], 'https://evil.example')).status, 403);
  assert.equal((await ask(call, [{ variant_id: 111 }], 'http://sklz.com')).status, 403, 'https only');
  assert.equal((await ask(call, [{ variant_id: 111 }], 'https://www.sklz.com')).status, 201);
  assert.equal((await ask(call, [{ variant_id: 111 }], `https://${SHOP}`)).status, 201, 'the myshopify domain (theme editor preview)');
  assert.match((await ask(call, [{ variant_id: 333 }])).body.error, /sold out/);
  assert.equal((await ask(call, [{ variant_id: 444 }])).status, 400, 'draft products aren’t for sale');
  assert.equal((await ask(call, [{ variant_id: 999 }])).status, 400, 'unknown variant');
  assert.equal((await ask(call, [])).status, 400);
  assert.equal((await ask(call, [{ variant_id: 'drop table' }])).status, 400);
  assert.equal((await ask(call, [{ variant_id: 111, quantity: 50 }])).status, 400);
  assert.equal((await ask(call, [{ variant_id: 111 }], 'https://sklz.com', 'other.myshopify.com')).status, 404);

  const { call: cad } = app(t, { currency: 'CAD' });
  const r = await install(cad);
  assert.equal(r.body.currency_ok, false);
  assert.equal((await ask(cad, [{ variant_id: 111 }])).status, 409);
});

test('webhooks: signed by Shopify; uninstall stops the button, shop/redact forgets the store', async (t) => {
  const { db, call } = app(t);
  await install(call);
  const hook = (topic, body, secret = SECRET) => {
    const raw = JSON.stringify(body);
    return call('POST', '/shopify/webhooks', raw, {
      'content-type': 'application/json',
      'x-shopify-topic': topic,
      'x-shopify-shop-domain': SHOP,
      'x-shopify-hmac-sha256': createHmac('sha256', secret).update(raw).digest('base64'),
    });
  };
  assert.equal((await hook('app/uninstalled', { id: 1 }, 'wrong')).status, 401);
  assert.equal((await hook('customers/data_request', { shop_domain: SHOP, customer: { id: 1 } })).status, 200);
  assert.equal((await hook('customers/redact', { shop_domain: SHOP, customer: { id: 1 } })).status, 200);
  assert.equal((await hook('app/uninstalled', { id: 1 })).status, 200);
  assert.equal(db.shopify.get(SHOP).token, null, 'the token is gone');
  assert.equal((await ask(call, [{ variant_id: 111 }])).status, 404);
  // Reinstalling works: a fresh token exchange.
  assert.equal((await install(call)).status, 200);
  assert.equal((await ask(call, [{ variant_id: 111 }])).status, 201);
  assert.equal((await hook('shop/redact', { shop_domain: SHOP })).status, 200);
  assert.equal(db.shopify.get(SHOP), null);
});

test('not set up: clear 503s and a plain page, no secrets needed', async (t) => {
  const { call } = app(t, { env: {} });
  assert.equal((await call('POST', '/shopify/api/setup', undefined, { authorization: `Bearer ${sessionToken()}` })).status, 503);
  assert.equal((await ask(call, [{ variant_id: 111 }])).status, 503);
  const page = await call('GET', '/shopify');
  assert.equal(page.status, 200);
  assert.match(page.body, /coming soon/);
  assert.doesNotMatch(page.body, /app-bridge/);
});

test('the theme block: valid schema, design settings, and it never sends prices', () => {
  const liquid = readFileSync(new URL('../shopify-app/extensions/spot-button/blocks/spot-button.liquid', import.meta.url), 'utf8');
  const schema = JSON.parse(liquid.match(/\{% schema %\}([\s\S]*)\{% endschema %\}/)[1]);
  assert.deepEqual(schema.enabled_on.templates, ['product', 'cart']);
  const ids = schema.settings.filter((s) => s.id).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['label', 'style', 'color', 'text_color', 'radius', 'size', 'full_width', 'align', 'theme_font']) assert.ok(ids.includes(id), id);
  assert.match(liquid, /Powered by Spot/);
  const js = readFileSync(new URL('../shopify-app/extensions/spot-button/assets/spot-button.js', import.meta.url), 'utf8');
  assert.match(js, /\/v1\/shopify\/asks/);
  assert.doesNotMatch(js, /price_cents|price:/, 'the storefront only sends variant ids and quantities');
  const toml = readFileSync(new URL('../shopify-app/shopify.app.toml', import.meta.url), 'utf8');
  assert.match(toml, /scopes = "read_products"/);
  assert.match(toml, /compliance_topics = \[ "customers\/data_request", "customers\/redact", "shop\/redact" \]/);
});
