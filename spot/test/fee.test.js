// The Spot fee: a flat $2 per ask, once however many stores, and none when
// the payer pays the store directly.
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

test('the default fee is a flat $2', () => {
  assert.equal(config({}).feeBps, 0);
  assert.equal(config({}).feeFixedCents, 200);
});

test('one ask, one $2 fee: on a single store and across several', async (t) => {
  const post = app(t);
  const one = await post('/v1/carts', { requester: { name: 'Riley' }, ...nike });
  assert.equal(one.cart.fee_cents, 200);
  assert.equal(one.cart.total_cents, 11500 + 575 + 200);

  const { bundle } = await post('/v1/bundles', { requester: { name: 'Riley' }, stores: [nike, rei] });
  assert.deepEqual(bundle.stores.map((s) => s.fee_cents), [200, 0]);
  assert.equal(bundle.fee_cents, 200);
});
