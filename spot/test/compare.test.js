// Cheaper elsewhere: the same product at other stores, priced from each
// store's own data where possible, kept only when it's really less.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { checkOffers, createCompare } from '../src/compare.js';

const BOOTS = 'https://www.tecovas.com/products/the-cartwright';
const item = { url: BOOTS, title: 'The Cartwright', store: 'Tecovas', variant: 'Bourbon / 10', price_cents: 29500 };
const FOUND = [
  { store: 'Boot Barn', url: 'https://www.bootbarn.com/tecovas-the-cartwright/123.html', price: '$219.99', in_stock: true },
  { store: 'Tecovas outlet', url: 'https://shop.tecovas.com/products/the-cartwright', price: '$199' },
  { store: 'Sheplers', url: 'https://www.sheplers.com/search?q=cartwright', price: '$150' },
  { store: 'Cavender’s', url: 'https://www.cavenders.com/p/cartwright', price: '$289.00' },
  { store: 'Nordstrom', url: 'https://www.nordstrom.com/s/cartwright/1', price: '$240', in_stock: false },
  { store: 'Shady', url: 'http://cheap-boots.biz/p/1', price: '$20' },
  { store: 'Zappos', url: 'https://www.zappos.com/p/cartwright/2', price: '$260' },
];

test('offers: other stores only, real product pages, the store’s own price, at least $1 less, in stock, cheapest first', async () => {
  const price = async ({ url }) => (url.includes('zappos') ? { cents: 23900, source: 'store' } : null);
  const out = await checkOffers(FOUND, item, { price });
  assert.deepEqual(out.map((o) => [o.store, o.cents, o.verified]), [
    ['Boot Barn', 21999, false],
    ['Zappos', 23900, true],
    ['Cavender’s', 28900, false],
  ]);
  assert.equal((await checkOffers(FOUND, { ...item, price_cents: 23100 }, { price })).length, 1, 'only what beats this price by $1');
  assert.deepEqual(await checkOffers(null, item, { price }), []);
});

test('kept a day per product and price; two cards at once share one search', async () => {
  const db = openDb(':memory:');
  let finds = 0;
  const c = createCompare({ db, find: async () => (finds++, FOUND), price: async () => null });
  const t0 = Date.now();
  const [a, b] = await Promise.all([c.offers(item, t0), c.offers(item, t0)]);
  assert.equal(finds, 1);
  assert.equal(a.offers[0].store, 'Boot Barn');
  assert.deepEqual(a, b);
  await c.offers(item, t0 + 3_600_000);
  assert.equal(finds, 1);
  await c.offers(item, t0 + 86_400_001);
  assert.equal(finds, 2);
  await c.offers({ ...item, price_cents: 24900 }, t0);
  assert.equal(finds, 3, 'a different price is a different question');
});

test('POST /v1/compare: a product link and a name', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {}, capture: { compare: async () => FOUND, comparePrice: async () => null } });
  t.after(() => a.close());
  const call = async (payload) => {
    const r = await a.inject({ method: 'POST', url: '/v1/compare', payload });
    return { status: r.statusCode, body: r.json() };
  };
  assert.equal((await call({ ...item, url: 'ftp://x' })).status, 400);
  assert.equal((await call({ ...item, title: ' ' })).status, 400);
  const r = await call(item);
  assert.equal(r.status, 200);
  assert.equal(r.body.compare.offers.length, 3);
  assert.equal(r.body.compare.offers[0].url, 'https://www.bootbarn.com/tecovas-the-cartwright/123.html');
});
