// One cart across stores, checked out once: the shop's cart is a
// multi-store ask paid by the shopper. One payment; each store gets its own
// Spot card for exactly its part, everything ships to one address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const store = (name, host, title, cents) => ({ merchant: { name, url: `https://${host}` }, items: [{ title, url: `https://${host}/p/${title.replace(/\W+/g, '-')}`, price_cents: cents, quantity: 1 }] });
const SHIP = { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'kyle@example.com' };

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'off' } });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call };
}

test('the shop has a cart: a button, a sheet, and the script that keeps it', async (t) => {
  const { call } = app(t);
  const page = (await call('GET', '/new')).body;
  assert.match(page, /id="cartBtn"/);
  assert.match(page, /id="cartSheet"/);
  const js = (await call('GET', '/client/home.js')).body;
  assert.match(js, /spot:cart/);
  assert.match(js, /data-act="add"/);
});

test('checking out a cart from three stores: one payment, a card per store for exactly its part', async (t) => {
  const { a, call } = app(t);
  const stores = [store('Nike', 'www.nike.com', 'Dunk Low', 11500), store('REI', 'www.rei.com', 'Rain shell', 9900), store('Sports Basement', 'www.sportsbasement.com', '49ers tee', 2300)];
  const made = await call('POST', '/v1/bundles', { requester: { name: 'Kyle' }, for: 'self', stores });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const { token } = made.body.bundle;
  const k = made.body.manage_key;
  // Their own: the address once for every store, then pay.
  const mine = await call('POST', `/v1/bundles/${token}/manage/prepare`, { k, shipping: SHIP });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  const paid = await call('POST', `/v1/bundles/${token}/sandbox-pay`, { payer_name: 'Kyle' });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.bundle.status, 'paid');
  const carts = paid.body.bundle.stores.map((s) => a.spot.load(s.token));
  assert.deepEqual(carts.map((c) => c.merchant.name), ['Nike', 'REI', 'Sports Basement']);
  for (const c of carts) {
    assert.equal(c.status, 'card_issued', `${c.merchant.name}: Spot’s card is ready`);
    assert.equal(c.for, 'self');
    assert.equal(c.requester.shipping.postal_code, '78701', 'ships to the one address');
  }
  assert.equal(new Set(carts.map((c) => c.card_ref)).size, 3, 'a card per store');
  assert.equal(carts.reduce((n, c) => n + c.total_cents, 0), paid.body.bundle.total_cents, 'the one payment is exactly the stores’ parts');
});

test('a cart from too many stores is turned away before anything is made', async (t) => {
  const { call } = app(t);
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => store(x.toUpperCase() + ' Co', `www.${x}shop.com`, 'Thing ' + x, 1000));
  const r = await call('POST', '/v1/bundles', { requester: { name: 'Kyle' }, for: 'self', stores: six });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Up to 5 stores/);
});

test('a signed-in shopper’s saved address comes with their multi-store order, to pre-fill it', async (t) => {
  const { a } = app(t);
  const post = (url, payload, headers) => a.inject({ method: 'POST', url, payload, headers });
  const start = (await post('/v1/auth/start', { email: 'kyle@example.com' })).json();
  const v = await post('/v1/auth/verify', { email: 'kyle@example.com', code: start.code });
  const H = { cookie: v.headers['set-cookie'].split(';')[0] };
  assert.equal((await post('/v1/me', { name: 'Kyle Riggle', shipping: SHIP }, H)).statusCode, 200);
  const stores = [store('Todd Snyder', 'www.toddsnyder.com', 'Merino crewneck', 14800), store('Clarks', 'www.clarks.com', 'Desert Boot', 15000)];
  const made = (await post('/v1/bundles', { requester: { name: 'Kyle' }, for: 'self', stores }, H)).json();
  const mine = await a.inject({ method: 'GET', url: `/v1/bundles/${made.bundle.token}/manage?k=${made.manage_key}`, headers: H });
  assert.equal(mine.json().profile.shipping.postal_code, '78701');
  // Someone else holding the link doesn't see it.
  const other = await a.inject({ method: 'GET', url: `/v1/bundles/${made.bundle.token}/manage?k=${made.manage_key}` });
  assert.equal(other.json().profile, null);
});
