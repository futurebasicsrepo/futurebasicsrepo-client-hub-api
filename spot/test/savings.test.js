// "Spot got you $X back": price drops the store paid back and promo codes
// Spot found, and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savingsOf } from '../src/savings.js';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cart = (patch) => ({ token: 't', status: 'completed', items: [{ title: 'Dunk Low' }], merchant: { name: 'Nike' }, refunds: [], fulfillment: null, ...patch });

test('only money Spot actually got back counts', () => {
  const s = savingsOf([
    cart({ token: 'a', refunds: [{ reason: 'price_adjustment', state: 'done', amount_cents: 1800, done_at: 3 }, { reason: 'unused', state: 'done', amount_cents: 700, at: 2 }] }),
    cart({ token: 'b', merchant: { name: 'REI' }, fulfillment: { state: 'placed', code_off_cents: 2500, code: 'SAVE20', placed_at: 5 } }),
    cart({ token: 'c', status: 'refunded', fulfillment: { state: 'placed', code_off_cents: 900 } }),
    cart({ token: 'd', refunds: [{ reason: 'price_adjustment', state: 'pending', amount_cents: 400 }] }),
    cart({ token: 'e', refunds: [{ reason: 'store_refund', state: 'done', amount_cents: 5000 }] }),
  ]);
  assert.equal(s.total_cents, 4300, 'the cushion coming back, a refunded order, a pending claim and a return don’t count');
  assert.equal(s.price_drops_cents, 1800);
  assert.equal(s.codes_cents, 2500);
  assert.deepEqual(s.items.map((i) => [i.kind, i.cents, i.store]), [['code', 2500, 'REI'], ['price_drop', 1800, 'Nike']], 'newest first');
  assert.equal(s.items[0].code, 'SAVE20');
  assert.deepEqual(savingsOf([]), { total_cents: 0, price_drops_cents: 0, codes_cents: 0, count: 0, items: [] });
});

test('the account page gets the total', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {} });
  t.after(() => a.close());
  const start = (await a.inject({ method: 'POST', url: '/v1/auth/start', payload: { email: 'kyle@example.com' } })).json();
  const v = await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email: 'kyle@example.com', code: start.code } });
  const me = (await a.inject({ method: 'GET', url: '/v1/me', headers: { cookie: v.headers['set-cookie'].split(';')[0] } })).json();
  assert.equal(me.savings.total_cents, 0);
  assert.deepEqual(me.savings.items, []);
});
