// Spot's read on a shopper's taste, kept on their account and used as a
// gentle hint in new searches; Shop page clean-up; cached ratings for sorting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { cleanTaste, promptLine, summary } from '../src/taste.js';
import { lookupPrompt } from '../src/capture.js';

const TASTE = { v: 1, n: 12, stores: { Tecovas: 9, KitchenAid: 4.2, Shein: -6, x: 0.01 }, words: { leather: 5, boots: 3, 'cast iron': 2, plastic: -3 }, price: { sum: 25000 * 10, w: 10 } };

test('a taste is checked and summed up in a few words', () => {
  const t = cleanTaste({ ...TASTE, stores: { ...TASTE.stores, huge: 9999, ['a'.repeat(80)]: 3 }, n: -4, price: { sum: -1, w: 2 } });
  assert.equal(t.stores.huge, 50, 'weights clamped');
  assert.equal(t.stores.x, undefined, 'faded ones dropped');
  assert.equal(Object.keys(t.stores).some((k) => k.length > 60), false);
  assert.equal(t.n, 0);
  assert.deepEqual(t.price, { sum: 0, w: 0 });
  const s = summary(cleanTaste(TASTE));
  assert.deepEqual(s.stores, ['tecovas', 'kitchenaid']);
  assert.deepEqual(s.avoid_stores, ['shein']);
  assert.deepEqual(s.price, { low: 15000, high: 37500 });
  assert.equal(cleanTaste('nope'), null);
});

test('the hint for searches: only with enough to go on, and what they typed always wins', () => {
  assert.equal(promptLine(cleanTaste({ ...TASTE, n: 3 })), '');
  const line = promptLine(cleanTaste(TASTE));
  assert.match(line, /stores they like: tecovas, kitchenaid/);
  assert.match(line, /usually spend about \$150–\$375/);
  assert.match(line, /not for them: shein, plastic/);
  assert.match(line, /what they typed always wins/);
  assert.match(lookupPrompt({ text: 'boots', taste: line }), /stores they like: tecovas/);
  assert.doesNotMatch(lookupPrompt({ text: 'boots' }), /What Spot has learned/);
});

function app(t, extra = {}) {
  const db = openDb(':memory:');
  const a = buildApp({ db, provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {}, ...extra });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('application/json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    const v = await call('POST', '/v1/auth/verify', { email, code: start.body.code });
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  return { a, db, call, signIn };
}

test('taste on the account: theirs only, saved, read back, reset; and it reaches new searches', async (t) => {
  let seenOpts = null;
  const { db, call, signIn } = app(t, { capture: { stream: async (text, opts, write) => ((seenOpts = opts), write({ type: 'done', kind: 'products', count: 0 })) } });
  assert.equal((await call('GET', '/v1/me/taste')).status, 401);
  assert.equal((await call('POST', '/v1/me/taste', { taste: TASTE })).status, 401);
  const H = await signIn('kyle@example.com');
  assert.equal((await call('POST', '/v1/me/taste', { taste: 'x' }, H)).status, 400);
  const saved = await call('POST', '/v1/me/taste', { taste: TASTE }, H);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.summary.stores, ['tecovas', 'kitchenaid']);
  assert.equal((await call('GET', '/v1/me/taste', undefined, H)).body.taste.n, 12);
  const other = await signIn('mom@example.com');
  assert.equal((await call('GET', '/v1/me/taste', undefined, other)).body.taste, null, 'theirs only');

  await call('POST', '/v1/capture/stream', { text: 'boots' }, H);
  assert.match(seenOpts.taste, /stores they like: tecovas/);
  await call('POST', '/v1/capture/stream', { text: 'boots' });
  assert.equal(seenOpts.taste, undefined, 'signed out: no taste');

  assert.equal((await call('POST', '/v1/me/taste', { reset: true }, H)).status, 200);
  const uid = db.raw.prepare('SELECT id FROM users').all()[0].id;
  assert.equal(db.tastes.get(uid), null, 'forgotten');
});

test('Shop page clean-up: a whole collection or one product, their own page only', async (t) => {
  const { db, call, signIn } = app(t);
  const H = await signIn('kyle@example.com');
  const uid = [...db.raw.prepare('SELECT id FROM users').all()][0].id;
  const add = (url, asked) => db.seen.add(uid, url, { merchant: { name: 'S' }, item: { title: url, url, image_url: 'https://x/i.jpg' }, asked });
  add('https://a.com/p/1', 'cowboy boots');
  add('https://a.com/p/2', 'cowboy boots');
  add('https://b.com/p/3', 'pots and pans');
  assert.equal((await call('POST', '/v1/me/shop/remove', { asked: 'cowboy boots' })).status, 401);
  assert.equal((await call('POST', '/v1/me/shop/remove', {}, H)).status, 400);
  assert.deepEqual((await call('POST', '/v1/me/shop/remove', { asked: 'cowboy boots' }, H)).body, { removed: 2 });
  assert.deepEqual((await call('POST', '/v1/me/shop/remove', { url: 'https://b.com/p/3' }, H)).body, { removed: 1 });
  assert.equal((await call('GET', '/v1/me/shop', undefined, H)).body.products.length, 0);
});

test('ratings Spot already read, for sorting: never a new read', async (t) => {
  let reads = 0;
  const { db, call } = app(t, { capture: { reviews: async () => (reads++, null) } });
  db.reviews.set('https://a.com/p/1', { rating: 4.7, count: 210, fit: 'small', source_url: 'https://a.com/p/1' });
  db.reviews.set('https://a.com/p/2', { none: true });
  const r = await call('POST', '/v1/reviews/cached', { urls: ['https://a.com/p/1', 'https://a.com/p/2', 'https://a.com/p/3', 7] });
  assert.deepEqual(r.body.reviews, { 'https://a.com/p/1': { rating: 4.7, count: 210, fit: 'small' } });
  assert.equal(reads, 0);
});
