import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { shopDomain, appConfig, authorizeUrl, verifyOAuthQuery, signOAuthQuery, verifyWebhook, newState, exchangeCode, sealer, merchantExec, UNINSTALL_WEBHOOK } from '../src/shopify-merchant.js';

const SECRET = 'app-secret';

test('a shop address is accepted only as a myshopify.com name', () => {
  assert.equal(shopDomain('My-Store.myshopify.com'), 'my-store.myshopify.com');
  assert.equal(shopDomain('https://my-store.myshopify.com/admin/products'), 'my-store.myshopify.com');
  assert.equal(shopDomain('my-store'), 'my-store.myshopify.com');
  for (const bad of ['', null, 'evil.com', 'my-store.myshopify.com.evil.com', 'a b.myshopify.com', '-x.myshopify.com', 'my_store.myshopify.com', 'https://evil.com/my-store.myshopify.com', 'x@evil.com'])
    assert.equal(shopDomain(bad), null, String(bad));
});

test('the app is configured only with both a client id and a secret; scopes default to products', () => {
  assert.equal(appConfig({}).ready, false);
  assert.equal(appConfig({ SHOPIFY_APP_CLIENT_ID: 'x' }).ready, false);
  const c = appConfig({ SHOPIFY_APP_CLIENT_ID: 'x', SHOPIFY_APP_CLIENT_SECRET: 'y' });
  assert.equal(c.ready, true); assert.deepEqual(c.scopes, ['read_products', 'write_products']);
  assert.deepEqual(appConfig({ SHOPIFY_APP_CLIENT_ID: 'x', SHOPIFY_APP_CLIENT_SECRET: 'y', SHOPIFY_APP_SCOPES: 'read_products, write_products ,write_inventory' }).scopes, ['read_products', 'write_products', 'write_inventory']);
});

test('the authorize link carries the client id, scopes, redirect and state, on the shop itself', () => {
  const u = new URL(authorizeUrl({ shop: 'a.myshopify.com', clientId: 'cid', scopes: ['read_products', 'write_products'], redirectUri: 'https://api/v1/shopify/callback', state: 'st' }));
  assert.equal(u.host, 'a.myshopify.com'); assert.equal(u.pathname, '/admin/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), 'cid'); assert.equal(u.searchParams.get('scope'), 'read_products,write_products'); assert.equal(u.searchParams.get('state'), 'st'); assert.equal(u.searchParams.get('redirect_uri'), 'https://api/v1/shopify/callback');
});

test('the callback query is trusted only when Shopify signed exactly these parameters with our secret', () => {
  const q = { code: 'abc', shop: 'a.myshopify.com', state: 'st', timestamp: '1700000000', host: 'YWRtaW4=' };
  const good = { ...q, hmac: signOAuthQuery(q, SECRET) };
  assert.equal(verifyOAuthQuery(good, SECRET), true);
  assert.equal(verifyOAuthQuery({ ...good, code: 'other' }, SECRET), false, 'a changed parameter');
  assert.equal(verifyOAuthQuery({ ...good, shop: 'b.myshopify.com' }, SECRET), false, 'a changed shop');
  assert.equal(verifyOAuthQuery({ ...good, extra: '1' }, SECRET), false, 'an added parameter');
  assert.equal(verifyOAuthQuery(good, 'wrong-secret'), false);
  assert.equal(verifyOAuthQuery(q, SECRET), false, 'no hmac');
  assert.equal(verifyOAuthQuery({ ...q, hmac: 'zz' }, SECRET), false, 'garbage hmac');
  assert.equal(verifyOAuthQuery(good, ''), false, 'no secret configured');
  assert.equal(verifyOAuthQuery(null, SECRET), false);
});

test('a webhook is trusted only with the base64 HMAC of the raw body', () => {
  const raw = Buffer.from('{"id":1}'), sig = createHmac('sha256', SECRET).update(raw).digest('base64');
  assert.equal(verifyWebhook(raw, sig, SECRET), true);
  assert.equal(verifyWebhook(Buffer.from('{"id":2}'), sig, SECRET), false);
  assert.equal(verifyWebhook(raw, sig, 'other'), false);
  assert.equal(verifyWebhook(raw, '', SECRET), false); assert.equal(verifyWebhook(null, sig, SECRET), false); assert.equal(verifyWebhook(raw, sig, ''), false);
});

test('states are long, random and different every time', () => {
  const a = newState(), b = newState(); assert.notEqual(a, b); assert.ok(a.length >= 30 && /^[A-Za-z0-9_-]+$/.test(a));
});

test('the code is traded for a token, and a refusal is said plainly', async () => {
  let seen;
  const ok = await exchangeCode({ shop: 'a.myshopify.com', code: 'c1', clientId: 'cid', secret: 's', origin: 'https://a.myshopify.com', fetchImpl: async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ access_token: 'shpat_1', scope: 'read_products,write_products' }) }; } });
  assert.deepEqual(ok, { token: 'shpat_1', scope: 'read_products,write_products' });
  assert.equal(seen.url, 'https://a.myshopify.com/admin/oauth/access_token'); assert.deepEqual(seen.body, { client_id: 'cid', client_secret: 's', code: 'c1' });
  await assert.rejects(exchangeCode({ shop: 'a', code: 'c', clientId: 'x', secret: 's', origin: 'https://a', fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error_description: 'code expired' }) }) }), /code expired/);
  await assert.rejects(exchangeCode({ shop: 'a', code: 'c', clientId: 'x', secret: 's', origin: 'https://a', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) }), /did not accept/);
});

test('the token is sealed at rest, opens only with the same key, and never throws on junk', () => {
  const a = sealer({ SHOPIFY_APP_CLIENT_SECRET: 'one' }), b = sealer({ SHOPIFY_APP_CLIENT_SECRET: 'two' });
  const sealed = a.seal('shpat_secret_token');
  assert.ok(!sealed.includes('shpat_secret_token')); assert.notEqual(a.seal('shpat_secret_token'), sealed, 'a fresh nonce every time');
  assert.equal(a.open(sealed), 'shpat_secret_token'); assert.equal(b.open(sealed), null, 'another key');
  const [v, iv, tag, body] = sealed.split('.'); assert.equal(a.open([v, iv, tag, body.slice(0, -2) + 'AA'].join('.')), null, 'tampered');
  for (const junk of ['', null, 'v1', 'v2.a.b.c', 'v1.a.b']) assert.equal(a.open(junk), null);
  assert.equal(sealer({}).ready, false); assert.equal(sealer({ SHOPIFY_TOKEN_KEY: 'k' }).ready, true);
  assert.equal(sealer({ SHOPIFY_TOKEN_KEY: 'k', SHOPIFY_APP_CLIENT_SECRET: 'one' }).open(sealer({ SHOPIFY_TOKEN_KEY: 'k', SHOPIFY_APP_CLIENT_SECRET: 'zzz' }).seal('t')), 't', 'the token key wins over the app secret');
});

const reply = (status, json, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => headers[k.toLowerCase()] ?? null }, json: async () => json });

test('calls carry the store token, return data, retry one throttle, and report errors', async () => {
  const calls = [];
  const exec = merchantExec({ shop: 'a.myshopify.com', token: 'tok', origin: 'https://a', fetchImpl: async (url, init) => { calls.push({ url, h: init.headers }); return calls.length === 1 ? reply(429, {}, { 'retry-after': '1' }) : reply(200, { data: { ok: 1 } }); }, sleep: async () => {} });
  assert.deepEqual(await exec('query X { a }', {}), { ok: 1 }); assert.equal(calls.length, 2);
  assert.equal(calls[0].h['X-Shopify-Access-Token'], 'tok'); assert.match(calls[0].url, /^https:\/\/a\/admin\/api\/[\d-]+\/graphql\.json$/);
  const bad = merchantExec({ shop: 's', token: 't', origin: 'https://a', fetchImpl: async () => reply(200, { errors: [{ message: 'Field x missing' }] }) });
  await assert.rejects(bad('q'), /Field x missing/);
  const down = merchantExec({ shop: 's', token: 't', origin: 'https://a', fetchImpl: async () => reply(500, {}) });
  await assert.rejects(down('q'), e => e.statusCode === 502);
});

test('a refused token marks the store for reconnecting and says so to the customer', async () => {
  for (const status of [401, 403]) {
    let refused = 0;
    const exec = merchantExec({ shop: 'a.myshopify.com', token: 't', origin: 'https://a', onRefused: () => { refused++; }, fetchImpl: async () => reply(status, {}) });
    await assert.rejects(exec('q'), e => e.statusCode === 409 && e.refused === true && /Reconnect the store/.test(e.message) && /a\.myshopify\.com/.test(e.message));
    assert.equal(refused, 1);
  }
});

test('the uninstall webhook is registered with a uri, as the Admin schema asks', () => {
  assert.match(UNINSTALL_WEBHOOK, /APP_UNINSTALLED/); assert.match(UNINSTALL_WEBHOOK, /uri:\s*\$uri/); assert.doesNotMatch(UNINSTALL_WEBHOOK, /callbackUrl/);
});
