// Spot covers the difference: a store total above the card (shipping over the
// estimate) can be paid by Spot, up to a cap, without charging the payer more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { COVER_MAX_CENTS, authLimitCents, cardLimitCents } from '../src/cart.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const ADMIN = 'admin-token-0123456789';
const admin = { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' };

function app(t) {
  const provider = sandboxProvider();
  const a = buildApp({ db: openDb(':memory:'), provider, cfg, logger: false, env: { SPOT_ADMIN_TOKEN: ADMIN } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call, provider };
}

test('the card limit: cart + cushion, plus what Spot covers, capped', () => {
  const cart = { cart_cents: 3499 };
  assert.equal(cardLimitCents(cart), authLimitCents(3499));
  assert.equal(cardLimitCents({ ...cart, cover_cents: 575 }), authLimitCents(3499) + 575);
  assert.equal(cardLimitCents({ ...cart, cover_cents: 99999 }), authLimitCents(3499) + COVER_MAX_CENTS, 'never past the cap');
  assert.equal(cardLimitCents({ ...cart, cover_cents: -500 }), authLimitCents(3499));
});

test('staff cover a $42.49 SKLZ total on a $36.74 card: the card can pay it, the payer pays nothing more', async (t) => {
  const { a, call, provider } = app(t);
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'SKLZ', url: 'https://sklz.com' }, items: [{ title: 'Pro Mini Hoop', price_cents: 3499 }] })).body;
  const { token } = made.cart;
  const k = made.manage_key;
  const notYet = await call('POST', `/v1/admin/carts/${a.spot.load(token).id}/cover`, { cents: 575 }, admin);
  assert.equal(notYet.status, 409, 'nothing to cover before it is paid');

  await call('POST', `/v1/carts/${token}/sandbox-pay`, { payer_name: 'Kyle' });
  const cart = a.spot.load(token);
  assert.equal(cart.status, 'card_issued');
  const paid = cart.total_cents;
  const tryPay = (amount_cents) => call('POST', '/v1/sandbox/authorize', { token, k, merchant_name: 'SKLZ', amount_cents });
  assert.equal((await tryPay(4249)).body.reason, 'over_limit', 'before: the store total is over the card');

  assert.equal((await call('POST', `/v1/admin/carts/${cart.id}/cover`, { cents: 575 })).status, 401, 'staff only');
  assert.equal((await call('POST', `/v1/admin/carts/${cart.id}/cover`, { cents: 2600 }, admin)).status, 400, 'over the cap');
  assert.equal((await call('POST', `/v1/admin/carts/${cart.id}/cover`, { cents: 0 }, admin)).status, 400);
  const r = await call('POST', `/v1/admin/carts/${cart.id}/cover`, { cents: 575 }, admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cart.cover_cents, 575);

  const after = a.spot.load(token);
  assert.equal(after.total_cents, paid, 'the payer isn’t charged more');
  assert.equal(provider.limits.get(after.card_ref), authLimitCents(3499) + 575, 'the card’s network limit went up too');
  assert.equal((await tryPay(authLimitCents(3499) + 575 + 1)).body.reason, 'over_limit', 'still capped');
  assert.equal((await tryPay(4249)).body.approved, true, 'after: the store total goes through');

  // The store charges the covered total: nothing flags, nothing is refunded.
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'capture', amount_cents: 4249 });
  const ov = (await call('GET', '/v1/admin/overview', undefined, admin)).body;
  const flagged = (ov.money || []).find((m) => m.id === cart.id);
  assert.ok(!flagged || !flagged.why.some((w) => /more than the/.test(w)), 'a covered charge isn’t "more than paid"');
});
