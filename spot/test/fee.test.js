// The Spot fee: $2 per ask (once, however many stores) plus the card
// processing on what the payer is charged, so Spot keeps $2 after Stripe.
// None when the payer pays the store directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { config } from '../src/cart.js';

const cfg = { ...config({}), maxCartCents: 50000, expiresHours: 72 };
const nike = { merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }] };
const rei = { merchant: { name: 'REI', url: 'https://www.rei.com' }, items: [{ title: 'Rain shell', quantity: 1, price_cents: 9900 }] };

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(() => a.close());
  return async (url, payload) => (await a.inject({ method: 'POST', url, payload })).json();
}

// What Spot keeps from a charge after Stripe's 2.9% + 30¢.
const kept = (fee, total) => fee - (total * 0.029 + 30);

test('the default fee is $2 plus card processing', () => {
  const c = config({});
  assert.equal(c.feeBps, 0);
  assert.equal(c.feeFixedCents, 200);
  assert.equal(c.cardPctBps, 290);
  assert.equal(c.cardFixedCents, 30);
  assert.equal(config({ SPOT_CARD_FEE_BPS: '0', SPOT_CARD_FEE_FIXED_CENTS: '0' }).cardPctBps, 0, 'can be absorbed instead');
});

test('Spot keeps $2 per ask after card processing: one store or several', async (t) => {
  const post = app(t);
  const one = (await post('/v1/carts', { requester: { name: 'Riley' }, ...nike })).cart;
  assert.equal(one.fee_cents, 598, '$2 + 2.9% + 30¢ on the $126.73 charged');
  assert.equal(one.total_cents, 11500 + 575 + 598);
  const k = kept(one.fee_cents, one.total_cents);
  assert.ok(k >= 200 && k < 202, `keeps ${k}`);

  const { bundle } = await post('/v1/bundles', { requester: { name: 'Riley' }, stores: [nike, rei] });
  assert.deepEqual(bundle.stores.map((s) => s.fee_cents), [598, 311], 'the $2 once; each store covers its own card %');
  const kb = kept(bundle.fee_cents, bundle.total_cents);
  assert.ok(kb >= 200 && kb < 203, `keeps ${kb} on one payment`);

  const direct = (await post('/v1/carts', { ...nike, settle: 'handoff', requester: { name: 'Riley', venmo: 'riley-p' } })).cart;
  assert.equal(direct.fee_cents, 0, 'nothing when the money never goes through Spot');
});
