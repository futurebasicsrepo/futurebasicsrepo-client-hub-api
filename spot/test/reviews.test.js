// Fit and reviews on a card: an AI's read of what buyers say, checked, kept
// two weeks, and turned into the shopper's own size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { createReviews, digestFrom, sizeFor } from '../src/reviews.js';

const DAY = 86_400_000;
const BOOTS = 'https://www.tecovas.com/products/the-cartwright';
const READ = { rating: 4.74, count: 2140, source_url: 'https://www.tecovas.com/products/the-cartwright#reviews', fit: 'small', advice: 'half_up', size_kind: 'shoes', fit_note: 'Most size up half', pros: ['Comfy out of the box', 'Great leather', 'Looks dressy'], cons: ['Stiff heel the first week'], summary: 'Buyers love the leather and comfort.' };

test('the answer is checked: numbers in range, words from the lists, a real source or nothing', () => {
  const d = digestFrom(READ);
  assert.equal(d.rating, 4.7);
  assert.equal(d.count, 2140);
  assert.equal(d.advice, 'half_up');
  assert.deepEqual(digestFrom({ ...READ, source_url: 'javascript:alert(1)' }), { none: true }, 'no source, nothing shown');
  assert.equal(digestFrom({ ...READ, rating: 7 }).rating, null);
  assert.equal(digestFrom({ ...READ, rating: 7 }).count, null, 'a count means nothing without a rating');
  assert.equal(digestFrom({ ...READ, fit: 'roomy', advice: 'two_up', size_kind: 'hats' }).fit, null);
  assert.equal(digestFrom({ ...READ, pros: ['a', 'b', 'c', 'd', 'e'] }).pros.length, 3);
  assert.deepEqual(digestFrom({ none: true }), { none: true });
  assert.equal(digestFrom('nope'), null);
});

test('their size, moved the way reviewers say', () => {
  assert.equal(sizeFor('10', 'half_up'), '10.5');
  assert.equal(sizeFor('10.5', 'half_up'), '11');
  assert.equal(sizeFor('US 9', 'down'), 'US 8');
  assert.equal(sizeFor('M', 'up'), 'L');
  assert.equal(sizeFor('m', 'down'), 'S');
  assert.equal(sizeFor('M', 'half_up'), null, 'no half sizes in letters');
  assert.equal(sizeFor('XXS', 'down'), null);
  assert.equal(sizeFor('10', 'true'), '10');
  assert.equal(sizeFor('', 'up'), null);
  assert.equal(sizeFor('32x30', 'up'), null, 'not a size it can move');
});

test('read once per product for two weeks; a page with no reviews is tried again tomorrow', async () => {
  const db = openDb(':memory:');
  let reads = 0;
  const r = createReviews({ db, read: async ({ url }) => (reads++, url === BOOTS ? digestFrom(READ) : { none: true }) });
  const t0 = Date.now();
  const [a, b] = await Promise.all([r.forShopper({ url: BOOTS }, { shoes: '10' }, t0), r.forShopper({ url: BOOTS }, {}, t0)]);
  assert.equal(reads, 1, 'two cards at once: one read');
  assert.equal(a.your_size, '10.5');
  assert.equal(a.saved_size, '10');
  assert.equal(b.your_size, null, 'no saved size, no guess');
  await r.forShopper({ url: BOOTS }, {}, t0 + 13 * DAY);
  assert.equal(reads, 1);
  await r.forShopper({ url: BOOTS }, {}, t0 + 15 * DAY);
  assert.equal(reads, 2);
  assert.deepEqual(await r.forShopper({ url: 'https://x.com/p' }, {}, t0), { none: true });
  await r.forShopper({ url: 'https://x.com/p' }, {}, t0 + 1000);
  assert.equal(reads, 3);
  await r.forShopper({ url: 'https://x.com/p' }, {}, t0 + DAY + 1);
  assert.equal(reads, 4);
});

test('POST /v1/reviews: a product link only; the signed-in shopper’s own size', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {}, capture: { reviews: async () => digestFrom(READ) } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.json(), headers: r.headers };
  };
  assert.equal((await call('POST', '/v1/reviews', { url: 'file:///etc/passwd' })).status, 400);
  const anon = await call('POST', '/v1/reviews', { url: BOOTS, title: 'The Cartwright' });
  assert.equal(anon.status, 200);
  assert.equal(anon.body.reviews.rating, 4.7);
  assert.equal(anon.body.reviews.your_size, null);
  const start = await call('POST', '/v1/auth/start', { email: 'kyle@example.com' });
  const v = await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: start.body.code });
  const H = { cookie: v.headers['set-cookie'].split(';')[0] };
  assert.equal((await call('POST', '/v1/me', { sizes: { shoes: '10' } }, H)).status, 200);
  const mine = (await call('POST', '/v1/reviews', { url: BOOTS }, H)).body.reviews;
  assert.equal(mine.saved_size, '10');
  assert.equal(mine.your_size, '10.5');
});
