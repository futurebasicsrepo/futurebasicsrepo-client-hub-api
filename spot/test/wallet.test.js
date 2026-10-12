// Apple Pay in one tap: the wallet's sheet shows a total before checkout has
// a street (or, on a product card, before there's a cart). It's priced for
// the city/state/ZIP the wallet shares, and the order is charged exactly that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const store = { merchant: { name: 'SKLZ', url: 'https://sklz.com' }, items: [{ title: 'Pro Mini Hoop', price_cents: 3499, quantity: 1 }] };
const zip = { city: 'Philadelphia', state: 'PA', postal_code: '19107' };
const ship = { name: 'Kyle R', line1: '1 Main St', city: 'Philadelphia', state: 'PA', postal_code: '19107', email: 'k@example.com', phone: '5555550100' };

function app(t, env = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'off', ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.json() };
  };
  return { a, call };
}

test('a product card: priced for the ZIP the wallet shares, and that is what the order is charged', async (t) => {
  const { a, call } = app(t);
  const asked = [];
  a.spot.quoter = async (cart, s) => (asked.push(s), { total_cents: 4589, subtotal_cents: 3499, shipping_cents: 750, tax_cents: 340 });
  a.spot.quotable = async () => true;

  const base = await call('POST', '/v1/quote', { stores: [store] });
  assert.equal(base.status, 200);
  assert.equal(base.body.quote_id, undefined, 'no address yet: just what the card says');
  assert.equal(base.body.publishable_key, null, 'no wallet in the sandbox');
  assert.equal(base.body.orderable, true, 'Spot can buy from it');
  a.spot.canOrder = async () => false;
  assert.equal((await call('POST', '/v1/quote', { stores: [store] })).body.orderable, false, 'no wallet button for a store Spot can’t buy from');
  a.spot.canOrder = async () => true;

  const q = await call('POST', '/v1/quote', { stores: [store], shipping: zip });
  assert.ok(q.body.quote_id);
  assert.ok(q.body.total_cents > base.body.total_cents, 'shipping and tax for that ZIP');
  assert.deepEqual([asked[0].state, asked[0].postal_code, asked[0].line1], ['PA', '19107', ''], 'the store is asked with what the wallet shared, no street');

  // Confirmed in the wallet: the cart, its address, the payment.
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, ...store, settle: 'card', for: 'self' })).body;
  await call('POST', `/v1/carts/${made.cart.token}/manage/prepare`, { k: made.manage_key, shipping: ship, quote_id: q.body.quote_id });
  const pay = await call('POST', `/v1/carts/${made.cart.token}/pay`, {});
  assert.equal(pay.status, 200);
  assert.equal(pay.body.total_cents, q.body.total_cents, 'the amount on the sheet is the amount charged');
  assert.equal(asked.length, 1, 'not priced again at checkout');
  assert.equal(a.spot.load(made.cart.token).quote.total_cents, 4589);

  // Another ZIP than the one priced: the quote doesn't carry over; checkout prices it.
  const other = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, ...store, settle: 'card', for: 'self' })).body;
  await call('POST', `/v1/carts/${other.cart.token}/manage/prepare`, { k: other.manage_key, shipping: { ...ship, postal_code: '19103' }, quote_id: q.body.quote_id });
  await call('POST', `/v1/carts/${other.cart.token}/pay`, {});
  assert.equal(asked.length, 2, 'priced for its own address');
  // A made-up id changes nothing.
  const third = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, ...store, settle: 'card', for: 'self' })).body;
  const before = a.spot.load(third.cart.token).total_cents;
  await call('POST', `/v1/carts/${third.cart.token}/manage/prepare`, { k: third.manage_key, shipping: ship, quote_id: 'nope' });
  assert.equal(a.spot.load(third.cart.token).total_cents, before);
});

test('a store that can price its checkout but doesn’t answer: the safe estimate, on the sheet and charged', async (t) => {
  const { a, call } = app(t);
  let asked = 0;
  a.spot.quoter = async () => (asked++, null);
  a.spot.quotable = async () => true;
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, ...store, settle: 'card', for: 'self' })).body;
  // On the cart's own page.
  const q = await call('POST', `/v1/carts/${made.cart.token}/manage/quote`, { k: made.manage_key, shipping: zip });
  assert.equal(q.status, 200);
  assert.ok(q.body.quote_id);
  assert.ok(q.body.total_cents > made.cart.total_cents);
  assert.equal((await call('POST', `/v1/carts/${made.cart.token}/manage/quote`, { k: 'wrong', shipping: zip })).status, 404, 'only its owner');
  await call('POST', `/v1/carts/${made.cart.token}/manage/prepare`, { k: made.manage_key, shipping: ship, quote_id: q.body.quote_id });
  const pay = await call('POST', `/v1/carts/${made.cart.token}/pay`, {});
  assert.equal(pay.body.total_cents, q.body.total_cents);
  assert.equal(asked, 1, 'the estimate stands at checkout');
  // A store that can't price its checkout: the cart's own total.
  a.spot.quotable = async () => false;
  const plain = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, ...store, settle: 'card', for: 'self' })).body;
  const p2 = await call('POST', `/v1/carts/${plain.cart.token}/manage/quote`, { k: plain.manage_key, shipping: zip });
  assert.deepEqual(p2.body, { total_cents: plain.cart.total_cents });
});

test('an outfit from several stores: one total, the same as the multi-store ask it becomes', async (t) => {
  const { call } = app(t);
  const two = [store, { merchant: { name: 'Gap', url: 'https://gap.com' }, items: [{ title: 'Linen pants', price_cents: 4990, quantity: 1 }] }];
  const q = await call('POST', '/v1/quote', { stores: two, shipping: zip });
  assert.equal(q.status, 200);
  assert.equal(q.body.quote_id, undefined, 'multi-store asks aren’t re-priced at checkout');
  const b = (await call('POST', '/v1/bundles', { requester: { name: 'Kyle' }, stores: two, for: 'self' })).body;
  assert.equal(q.body.total_cents, b.bundle.total_cents);
  assert.equal((await call('POST', '/v1/quote', { stores: [] })).status, 400);
  assert.equal((await call('POST', '/v1/quote', { stores: [store], shipping: { city: 'X', state: 'ZZ', postal_code: '1' } })).status, 400, 'a US state and ZIP');
});

test('with Stripe, the card gets the publishable key to show the wallet', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: { ...sandboxProvider(), name: 'stripe' }, cfg, logger: false, env: { SPOT_AGENT: 'off', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' } });
  t.after(() => a.close());
  const r = await a.inject({ method: 'POST', url: '/v1/quote', payload: { stores: [store] } });
  assert.equal(r.json().publishable_key, 'pk_test_x');
});
