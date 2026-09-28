// A store's "Ask someone to pay" button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };

function app(t, extra = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_ALLOW_PRIVATE_FETCH: '1' }, ...extra });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { a, call };
}
const items = [{ title: 'Trail Jacket', variant: 'M', quantity: 1, price_cents: 18900, url: 'https://shop.example/p/jacket', image_url: 'https://cdn.example/j.png' }];

test('store button: register, ask from the store page, open in Spot, send', async (t) => {
  let served = '';
  const { a, call } = app(t, { merchantFetch: async (url) => (url === 'https://shop.example/.well-known/spot-merchant.txt' ? new Response(served) : new Response('', { status: 404 })) });
  const reg = await call('POST', '/v1/merchants', { domain: 'https://www.Shop.example/', name: 'Trailhead', email: 'owner@shop.example' });
  assert.equal(reg.status, 201);
  const { merchant_id, publishable_key: key, snippet, verify } = reg.body;
  assert.match(key, /^spk_/);
  assert.match(snippet, /embed\/button\.js/);
  assert.equal(verify.url, 'https://shop.example/.well-known/spot-merchant.txt');

  const js = await call('GET', '/embed/button.js');
  assert.match(js.headers['content-type'], /javascript/);
  assert.match(js.body, /Ask someone to pay/);

  // Only from the store's own pages.
  assert.equal((await call('POST', '/v1/merchant/asks', { key, items }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/v1/merchant/asks', { key, items }, { origin: 'https://evilshop.example' })).status, 403);
  assert.equal((await call('POST', '/v1/merchant/asks', { key: 'spk_nope', items }, { origin: 'https://shop.example' })).status, 401);
  assert.equal((await call('POST', '/v1/merchant/asks', { key, items: [{ title: 'x', price_cents: -1 }] }, { origin: 'https://shop.example' })).status, 400);
  const pre = await a.inject({ method: 'OPTIONS', url: '/v1/merchant/asks', headers: { origin: 'https://www.shop.example', 'access-control-request-method': 'POST' } });
  assert.equal(pre.statusCode, 204);

  const ask = await call('POST', '/v1/merchant/asks', { key, items: [...items, { title: 'Sticker', price_cents: 300, url: 'https://elsewhere.example/s' }], extras_cents: 1200 }, { origin: 'https://www.shop.example' });
  assert.equal(ask.status, 201, JSON.stringify(ask.body));
  assert.equal(ask.headers['access-control-allow-origin'], 'https://www.shop.example');
  assert.match(ask.body.url, /\/new\?draft=drf_/);

  const d = (await call('GET', `/v1/merchant/drafts/${ask.body.draft_id}`)).body;
  assert.equal(d.merchant.name, 'Trailhead');
  assert.equal(d.merchant.url, 'https://shop.example');
  assert.equal(d.items[1].url, null, 'links off the store are dropped');
  assert.equal(d.verified, false);

  // Verify the domain: the ✓ comes with it.
  assert.equal((await call('POST', '/v1/merchants/verify', { merchant_id })).status, 409);
  served = `# spot\n${verify.content}\n`;
  assert.equal((await call('POST', '/v1/merchants/verify', { merchant_id })).body.verified, true);

  // The shopper sends it; the store's items and prices win over the browser's.
  const made = await call('POST', '/v1/carts', { draft_id: ask.body.draft_id, requester: { name: 'Riley' }, items: [{ title: 'Trail Jacket', quantity: 1, price_cents: 1 }], settle: 'card' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.cart.items[0].price_cents, 18900);
  assert.equal(made.body.cart.merchant.name, 'Trailhead');
  assert.deepEqual(made.body.cart.source, { kind: 'store_button', name: 'Trailhead', verified: true });
  const page = await call('GET', `/c/${made.body.cart.token}`);
  assert.match(page.body, /sent from Trailhead’s checkout ✓/);

  // Editing the items drops the ✓.
  const k = made.body.manage_key;
  const edited = await call('POST', `/v1/carts/${made.body.cart.token}/manage/edit`, { k, cart: { merchant: made.body.cart.merchant, items: [{ title: 'Trail Jacket', quantity: 1, price_cents: 100 }] } });
  assert.equal(edited.body.cart.source.verified, false);

  assert.equal((await call('POST', '/v1/carts', { draft_id: 'drf_gone', requester: { name: 'Riley' } })).status, 404);
});

test('store button: registration checks', async (t) => {
  const { call } = app(t);
  assert.equal((await call('POST', '/v1/merchants', { domain: 'localhost', name: 'x', email: 'a@b.co' })).status, 400);
  assert.equal((await call('POST', '/v1/merchants', { domain: 'shop.example', name: '', email: 'a@b.co' })).status, 400);
  assert.equal((await call('POST', '/v1/merchants', { domain: 'shop.example', name: 'Shop', email: 'nope' })).status, 400);
});
