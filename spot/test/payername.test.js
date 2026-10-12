// Paid at the store: whoever paid is the one thanked, never the requester.
// A checkout the requester opens on their own page is theirs; the payer
// always gets a fresh one with their own name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 0, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const env = { RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', PUBLIC_URL: 'https://spotmeplease.com' };
const SHIP = { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'kyle@example.com' };

function app(t) {
  const emails = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, notifyFetch });
  t.after(() => a.close());
  // The store's checkout: one per start; completes when told.
  const store = { n: 0, done: new Set() };
  a.spot.direct = {
    supports: async () => true,
    verify: async (cart) => ({ ok: true, items: cart.items }),
    quote: async () => null,
    start: async () => ({ checkout_id: `co_${++store.n}`, endpoint: 'https://store.example/ucp', continue_url: `https://store.example/c/${store.n}`, total_cents: 2300 }),
    status: async (d) => (store.done.has(d.checkout_id) ? { status: 'completed', order_number: '1001', order_url: null, order_id: 'ord_1', total_cents: 2300 } : { status: 'open', total_cents: 2300 }),
  };
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.json() };
  };
  const make = async () => {
    const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Sports Basement', url: 'https://www.sportsbasement.com' }, items: [{ title: '49ers tee', price_cents: 2300, url: 'https://www.sportsbasement.com/products/tee' }], settle: 'direct' })).body;
    assert.ok(made.cart, JSON.stringify(made));
    const prep = await call('POST', `/v1/carts/${made.cart.token}/manage/prepare`, { k: made.manage_key, shipping: SHIP });
    assert.equal(prep.status, 200, JSON.stringify(prep.body));
    return { id: a.spot.load(made.cart.token).id, token: made.cart.token, k: made.manage_key };
  };
  const finish = async (token) => {
    store.done.add(a.spot.load(token).direct.checkout_id);
    return (await call('GET', `/v1/carts/${token}/direct/status`)).body;
  };
  return { a, call, emails, make, finish };
}

test('the requester opens the store checkout on their own page; the payer then pays on a fresh one with their own name', async (t) => {
  const { a, call, make, finish } = app(t);
  const { token, k } = await make();
  const mine = await call('POST', `/v1/carts/${token}/direct/start`, { k, email: SHIP.email, name: SHIP.name });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.equal(a.spot.load(token).direct.payer_name, null, 'the requester is never recorded as the payer');
  const theirs = await call('POST', `/v1/carts/${token}/direct/start`, { name: 'Danielle' });
  assert.notEqual(theirs.body.continue_url, mine.body.continue_url, 'not the requester’s checkout');
  assert.equal(a.spot.load(token).direct.payer_name, 'Danielle');
  await finish(token);
  const cart = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(cart.status, 'completed');
  assert.equal(cart.payer_name, 'Danielle');
  assert.equal(cart.can_thank, true);
  assert.equal(a.spot.load(token).fulfillment.order_id, 'ord_1', 'kept for tracking');
});

test('the requester pays it on their own page: nobody to thank', async (t) => {
  const { call, make, finish } = app(t);
  const { token, k } = await make();
  await call('POST', `/v1/carts/${token}/direct/start`, { k, email: SHIP.email, name: SHIP.name });
  await finish(token);
  const cart = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(cart.payer_name, null);
  assert.equal(cart.can_thank, false);
});

test('an order recorded before the fix with the requester’s own name: no name shown, and the thank-you isn’t emailed back to them', async (t) => {
  const { a, call, emails, make, finish } = app(t);
  const { id, token, k } = await make();
  await call('POST', `/v1/carts/${token}/direct/start`, { name: 'Danielle' });
  await finish(token);
  // What the old code recorded when the payer paid on the requester's checkout.
  a.spot.patch(id, (c) => ({ ...c, payer: { name: 'Kyle Riggle' }, payer_contact: { email: 'kyle@example.com' } }));
  const cart = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(cart.payer_name, null, 'not “Kyle spotted you”');
  assert.equal(cart.can_thank, true, 'the thank-you still shows on the payer’s receipt');
  const r = await call('POST', `/v1/carts/${token}/manage/thanks`, { k, message: 'Thank you so much', emoji: '🙏' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await new Promise((done) => setTimeout(done, 50));
  assert.ok(!emails.some((m) => /says thanks/.test(m.subject)), 'not sent to the requester’s own inbox');
});
