// One order tracker: the store's own shipment status for orders Spot placed
// through agent checkout, or a tracking number pasted in; emails as it moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { carrierOf, fromOrder } from '../src/tracking.js';

const HOUR = 3_600_000;
const env = { RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', PUBLIC_URL: 'https://spotmeplease.com' };
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
};
const ev = (type, at, extra = {}) => ({ id: type, occurred_at: at, type, line_items: [{ id: 'li_0', quantity: 1 }], ...extra });

test('the carrier from the number’s shape', () => {
  assert.equal(carrierOf('1Z999AA10123456784').carrier, 'UPS');
  assert.equal(carrierOf('9400 1118 9922 3333 4444 55').carrier, 'USPS');
  assert.equal(carrierOf('123456789012').carrier, 'FedEx');
  assert.equal(carrierOf('1234567890').carrier, 'DHL');
  assert.deepEqual(carrierOf('ABCD12345XYZ'), { carrier: null, number: 'ABCD12345XYZ', url: null });
  assert.equal(carrierOf('<script>'), null);
  assert.equal(carrierOf(''), null);
});

test('the latest shipment from a store’s order events; tracking from whichever event has it', () => {
  const o = { fulfillment: { events: [ev('shipped', '2026-10-13T10:00:00Z', { carrier: 'UPS', tracking_number: '1Z9', tracking_url: 'https://ups.com/t/1Z9' }), ev('out_for_delivery', '2026-10-15T08:00:00Z', { description: 'Out for delivery' })] } };
  assert.deepEqual(fromOrder(o), { status: 'out_for_delivery', carrier: 'UPS', number: '1Z9', url: 'https://ups.com/t/1Z9', description: 'Out for delivery', at: Date.parse('2026-10-15T08:00:00Z'), source: 'store' });
  assert.equal(fromOrder({ fulfillment: { events: [ev('failed_attempt', '2026-10-15T08:00:00Z')] } }).status, 'problem');
  assert.equal(fromOrder({ fulfillment: { events: [ev('shipped', '2026-10-13T10:00:00Z', { tracking_url: 'javascript:alert(1)' })] } }).url, null);
  assert.equal(fromOrder({}), null);
});

function app(t) {
  const emails = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const orders = { events: [] };
  let reads = 0;
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env, notifyFetch, capture: { getOrder: async () => (reads++, { id: 'ord_1', fulfillment: { events: orders.events } }) } });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.json() };
  };
  const placed = async (orderId = 'ord_1') => {
    const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle', email: 'kyle@example.com' }, merchant: { name: 'Tecovas', url: 'https://www.tecovas.com' }, items: [{ title: 'The Cartwright', price_cents: 29500 }] })).body;
    await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
    const id = a.spot.load(made.cart.token).id;
    a.spot.patch(id, (c) => ({ ...c, fulfillment: { state: 'placed', order_number: '#T1001', ...(orderId ? { order_id: orderId } : {}), placed_at: Date.now() - HOUR } }));
    return { id, token: made.cart.token, k: made.manage_key };
  };
  return { a, call, emails, orders, placed, reads: () => reads };
}

test('the store’s own status, about every six hours until delivered, with an email as it ships and lands', async (t) => {
  const { a, call, emails, orders, placed, reads } = app(t);
  const { id, token, k } = await placed();
  const t0 = Date.now();
  assert.equal(await a.tracker.sweep(t0), 1);
  assert.equal(a.spot.byId(id).tracking.status, undefined, 'nothing shipped yet');
  orders.events = [ev('shipped', '2026-10-13T10:00:00Z', { carrier: 'UPS', tracking_number: '1Z999AA10123456784', tracking_url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784' })];
  assert.equal(await a.tracker.sweep(t0 + HOUR), 0, 'not again so soon');
  await a.tracker.sweep(t0 + 7 * HOUR);
  assert.equal(a.spot.byId(id).tracking.status, 'shipped');
  await until(() => emails.some((m) => /is on its way/.test(m.subject)), 'shipped email');
  const m = emails.find((x) => /is on its way/.test(x.subject));
  assert.deepEqual(m.to, ['kyle@example.com']);
  assert.match(m.html, /ups\.com\/track/);
  const mine = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart.tracking;
  assert.equal(mine.carrier, 'UPS');
  orders.events.push(ev('delivered', '2026-10-15T18:00:00Z', { description: 'Left at front door' }));
  await a.tracker.sweep(t0 + 14 * HOUR);
  await until(() => emails.some((x) => /was delivered/.test(x.subject)), 'delivered email');
  const n = reads();
  await a.tracker.sweep(t0 + 30 * HOUR);
  assert.equal(reads(), n, 'delivered: no more checks');
  assert.equal(emails.filter((x) => /is on its way/.test(x.subject)).length, 1, 'each once');
});

test('a tracking number pasted in: the carrier and link, shipped, and only on their own order once it’s ordered', async (t) => {
  const { call, emails, placed } = app(t);
  const { token, k } = await placed(null);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/tracking`, { k, number: 'nope!' })).status, 400);
  assert.ok((await call('POST', `/v1/carts/${token}/manage/tracking`, { k: 'wrong', number: '1Z999AA10123456784' })).status >= 400);
  const r = await call('POST', `/v1/carts/${token}/manage/tracking`, { k, number: '1Z999AA10123456784' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cart.tracking.status, 'shipped');
  assert.equal(r.body.cart.tracking.carrier, 'UPS');
  assert.equal(r.body.cart.tracking.source, 'you');
  await until(() => emails.some((m) => /is on its way/.test(m.subject)), 'shipped email');

  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Tecovas' }, items: [{ title: 'Belt', price_cents: 9500 }] })).body;
  assert.equal((await call('POST', `/v1/carts/${made.cart.token}/manage/tracking`, { k: made.manage_key, number: '1Z999AA10123456784' })).status, 409);
});

test('paid on the store’s own checkout: Spot finds the order, follows it, and pushes to the requester’s devices as it ships', async (t) => {
  const pushes = [];
  const emails = [];
  const db = openDb(':memory:');
  let found = 0;
  const events = [];
  const a = buildApp({
    db,
    provider: sandboxProvider(),
    cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 },
    logger: false,
    env,
    notifyFetch: async (url, init) => (String(url).includes('resend') && emails.push(JSON.parse(String(init.body))), new Response('{}', { status: 200 })),
    pushFetch: async (url, init) => (pushes.push({ url, init }), new Response('', { status: 201 })),
    capture: { findOrderId: async (c) => (found++, c.direct?.checkout_id === 'co_7' ? 'ord_7' : null), getOrder: async (c) => (c.fulfillment.order_id === 'ord_7' ? { id: 'ord_7', fulfillment: { events } } : null) },
  });
  t.after(() => a.close());
  const post = (url, payload) => a.inject({ method: 'POST', url, payload });
  // Kyle's account, with notifications turned on in one browser.
  db.users.create('u_kyle', 'kyle@example.com');
  const { createECDH, randomBytes } = await import('node:crypto');
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  db.pushSubs.add({ endpoint: 'https://web.push.apple.com/abc', user_id: 'u_kyle', p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url'), ua: 'test' });
  const made = (await post('/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Sports Basement', url: 'https://www.sportsbasement.com' }, items: [{ title: '49ers tee', price_cents: 2300 }] })).json();
  a.spot.patch(a.spot.load(made.cart.token).id, (c) => ({ ...c, user_id: 'u_kyle' }));
  const id = a.spot.load(made.cart.token).id;
  await post(`/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Danielle' });
  // Completed on the store's checkout before Spot kept the store's order id.
  a.spot.patch(id, (c) => ({ ...c, direct: { checkout_id: 'co_7', endpoint: 'https://www.sportsbasement.com/ucp' }, fulfillment: { state: 'placed', method: 'direct', order_number: '1001', placed_at: Date.now() - HOUR } }));
  const mine = (await a.inject({ method: 'GET', url: `/v1/carts/${made.cart.token}/manage?k=${made.manage_key}` })).json().cart;
  assert.equal(mine.tracking_auto, true, 'the page says Spot is watching, not “paste a number”');
  const t0 = Date.now();
  await a.tracker.sweep(t0);
  assert.equal(found, 1);
  assert.equal(a.spot.byId(id).fulfillment.order_id, 'ord_7', 'kept, so it isn’t looked up again');
  events.push(ev('shipped', '2026-10-13T10:00:00Z', { carrier: 'UPS', tracking_number: '1Z999AA10123456784', tracking_url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784' }));
  await a.tracker.sweep(t0 + 7 * HOUR);
  assert.equal(found, 1);
  assert.equal(a.spot.byId(id).tracking.status, 'shipped');
  await until(() => pushes.length && emails.some((m) => /is on its way/.test(m.subject)), 'push and email');
  assert.equal(pushes[0].url, 'https://web.push.apple.com/abc', 'to the device they turned on');
});
