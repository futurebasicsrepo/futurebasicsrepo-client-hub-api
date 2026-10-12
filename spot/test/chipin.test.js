// Chip in: several people pay part of one cart. Each part is a hold; the
// cart is bought once they cover it; nothing is charged if they don't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { splitCents } from '../src/cart.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const ask = { requester: { name: 'Riley' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }], note: 'birthday!' };

function app(t) {
  const provider = sandboxProvider();
  const a = buildApp({ db: openDb(':memory:'), provider, cfg, logger: false, env: {} });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const make = async () => {
    const r = await call('POST', '/v1/carts', ask);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const { token } = r.body.cart;
    const on = await call('POST', `/v1/carts/${token}/manage/chip`, { k: r.body.manage_key });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    return { token, k: r.body.manage_key, total: r.body.cart.total_cents };
  };
  return { a, call, provider, make };
}

test('split: whole cents, adding up exactly, in proportion', () => {
  assert.deepEqual(splitCents(1000, [5000, 5000]), [500, 500]);
  assert.deepEqual(splitCents(1001, [6000, 3000, 1000]), [601, 300, 100]);
  assert.deepEqual(splitCents(100, [1, 1, 1]), [34, 33, 33]);
  for (const [c, parts] of [[777, [123, 456, 789]], [1, [5, 5]], [12345, [1000, 2000, 3000, 4000]]]) assert.equal(splitCents(c, parts).reduce((n, x) => n + x, 0), c);
});

test('three people chip in; once it’s covered Spot buys it', async (t) => {
  const { a, call, make } = app(t);
  const { token, total } = await make();
  const page = await call('GET', `/c/${token}`);
  assert.match(page.body, /chip in/i);
  assert.equal((await call('POST', `/v1/carts/${token}/pay`, {})).status, 409, 'one path: chipping in');
  assert.equal((await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 100, name: 'Mom' })).status, 400, '$5 at least');
  assert.equal((await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: total + 1, name: 'Mom' })).status, 400, 'not more than is left');
  let r = await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 5000, name: 'Mom' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cart.status, 'open', 'nothing bought yet');
  assert.deepEqual(r.body.cart.chips, { raised_cents: 5000, left_cents: total - 5000, people: 1, names: ['Mom'] });
  r = await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 4000, name: 'Dad' });
  assert.equal(r.body.cart.chips.people, 2);
  r = await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: total - 9000, name: 'Sam' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cart = a.spot.load(token);
  assert.equal(cart.status, 'card_issued', 'covered: Spot’s card is ready to buy it');
  assert.equal(r.body.cart.payer_name, 'Mom, Dad + 1');
  assert.equal(cart.payment_ref, `chips:${cart.id}`);
  assert.equal((await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 500 })).status, 409, 'closed once covered');
  // The requester's page shows who chipped in.
  const ev = a.spot.events(cart).map((e) => e.kind);
  assert.ok(ev.includes('chip_held') && ev.includes('pay'));
});

test('nobody is charged if it never fills: holds go back on cancel', async (t) => {
  const { a, call, provider, make } = app(t);
  const { token, k } = await make();
  await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 3000, name: 'Mom' });
  await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 2000, name: 'Dad' });
  assert.equal((await call('POST', `/v1/carts/${token}/manage/edit`, { k, items: [{ title: 'Other', quantity: 1, price_cents: 9000 }] })).status, 409, 'can’t change under people');
  assert.equal((await call('POST', `/v1/carts/${token}/manage/cancel`, { k })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  const cart = a.spot.load(token);
  assert.equal(cart.status, 'canceled');
  assert.ok(cart.chips.every((c) => c.state === 'released'));
  const released = provider.refunds.filter((x) => x.released);
  assert.equal(released.length, 2, 'both holds let go, nothing charged');
  assert.equal(provider.captured.size, 0);
});

test('once bought: a refund splits across everyone by what they put in; one person can’t cancel for all', async (t) => {
  const { a, call, provider, make } = app(t);
  const { token, k, total } = await make();
  await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 6000, name: 'Mom' });
  await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: total - 6000, name: 'Dad' });
  let cart = a.spot.load(token);
  assert.equal(cart.status, 'card_issued');
  // Unused money (say the store charged $10 less) goes back to both, in proportion.
  const before = provider.refunds.length;
  cart = await a.spot.refundPart(cart.id, 1000, 'unused-test', 'unused');
  const parts = provider.refunds.slice(before);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.amount_cents), splitCents(1000, [6000, total - 6000]));
  assert.equal(new Set(parts.map((p) => p.key)).size, 2, 'a key per person, so neither repeats');
  // The requester cancels: everyone gets the rest of their part back.
  const r = await call('POST', `/v1/carts/${token}/manage/refund`, { k });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(a.spot.load(token).status, 'refunded');
  assert.equal(provider.refunds.slice(before + 2).length, 2);
});

test('two people pay the last part at once: the extra goes straight back', async (t) => {
  const { a, provider, make } = app(t);
  const { token, total } = await make();
  // Both start while the same amount is left, then both holds land.
  const x = await a.spot.startChip(token, { cents: total - 2000, name: 'Mom' });
  const y = await a.spot.startChip(token, { cents: total - 2000, name: 'Dad' });
  const z = await a.spot.startChip(token, { cents: 2000, name: 'Sam' });
  await a.spot.paymentSucceeded({ paymentRef: z.ref, amountCents: 2000, payer: {} });
  await a.spot.paymentSucceeded({ paymentRef: x.ref, amountCents: total - 2000, payer: {} });
  const cart0 = a.spot.load(token);
  assert.equal(cart0.status, 'card_issued');
  // Dad's hold lands after it's covered: it's let go.
  await a.spot.paymentSucceeded({ paymentRef: y.ref, amountCents: total - 2000, payer: {} });
  const cart = a.spot.load(token);
  const dad = cart.chips.find((c) => c.name === 'Dad');
  assert.equal(dad.state, 'released');
  assert.ok(provider.refunds.some((r) => r.key === `release-${dad.id}`));
  assert.equal(cart.chips.filter((c) => c.state === 'held').reduce((n, c) => n + c.cents, 0), total, 'exactly the total is held');
});
