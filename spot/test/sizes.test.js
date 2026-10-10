// Saved sizes: on the account, in "What do you want?" lookups, and for your AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { cleanSizes, sizesLine } from '../src/accounts.js';
import { withPhoto } from '../src/capture.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };

function app(t) {
  const seen = [];
  const fromText = async (text, o = {}) => {
    seen.push({ text, sizes: o.sizes });
    return { source: 'lookup', merchant: { name: 'Salomon', url: 'https://www.salomon.com' }, items: [{ title: 'XT-6', variant: '10.5', quantity: 1, price_cents: 20000, image_url: null, url: 'https://www.salomon.com/xt6' }], needs_review: true };
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'on' }, capture: { fromText } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { call, seen };
}

async function signIn(call, email = 'riley@example.com') {
  const start = await call('POST', '/v1/auth/start', { email });
  const cookie = (await call('POST', '/v1/auth/verify', { email, code: start.body.code })).headers['set-cookie'].split(';')[0];
  return (m, u, p) => call(m, u, p, { cookie });
}

test('sizes are cleaned and summed up in one line', () => {
  assert.equal(cleanSizes(null), null);
  assert.equal(cleanSizes({ tops: '  ', evil: 'x' }), null, 'unknown and blank fields are dropped');
  const s = cleanSizes({ tops: ' M ', shoes: 'US  10.5', notes: 'x'.repeat(500), bottoms: 7 });
  assert.deepEqual(Object.keys(s), ['tops', 'shoes', 'notes']);
  assert.equal(s.shoes, 'US 10.5');
  assert.equal(s.notes.length, 200);
  assert.equal(sizesLine({ tops: 'M', shoes: 'US 10.5' }), 'tops M, shoes US 10.5');
});

test('saved sizes reach lookups and your AI', async (t) => {
  const { call, seen } = app(t);
  const anon = await call('POST', '/v1/capture', { text: 'salomon xt-6' });
  assert.equal(anon.status, 200);
  assert.equal(seen[0].sizes, '', 'signed out: no sizes');

  const as = await signIn(call);
  const saved = await as('POST', '/v1/me', { sizes: { tops: 'M', shoes: 'US 10.5', notes: 'wide feet' } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.user.sizes, { tops: 'M', shoes: 'US 10.5', notes: 'wide feet' });
  // Other saves keep them.
  await as('POST', '/v1/me', { name: 'Riley Park' });
  assert.equal((await as('GET', '/v1/me')).body.user.sizes.shoes, 'US 10.5');

  await as('POST', '/v1/capture', { text: 'salomon xt-6' });
  assert.equal(seen.at(-1).sizes, 'tops M, shoes US 10.5, notes wide feet');

  // The account's AI reads them, and its text asks use them.
  const key = (await as('POST', '/v1/me/keys', { agent_name: 'claude' })).body;
  const ai = (m, u, p) => call(m, u, p, { authorization: `Bearer ${key.api_key}` });
  const got = await ai('GET', '/v1/agent/sizes');
  assert.equal(got.status, 200);
  assert.equal(got.body.signed_in, true);
  assert.equal(got.body.summary, 'tops M, shoes US 10.5, notes wide feet');
  await ai('POST', '/v1/agent/asks', { requester: { name: 'Riley' }, text: 'salomon xt-6' });
  assert.equal(seen.at(-1).sizes, 'tops M, shoes US 10.5, notes wide feet');

  // Clearing them.
  await as('POST', '/v1/me', { sizes: {} });
  assert.equal((await ai('GET', '/v1/agent/sizes')).body.sizes, null);
});

test('the product photo is read off the page, best effort', async () => {
  const draft = { source: 'lookup', merchant: { name: 'S' }, items: [{ title: 'XT-6', url: 'https://s.com/x', image_url: null, price_cents: null }] };
  const ok = await withPhoto(draft, async () => ({ items: [{ image_url: 'https://s.com/x.jpg', price_cents: 20000 }] }));
  assert.equal(ok.items[0].image_url, 'https://s.com/x.jpg');
  assert.equal(ok.items[0].price_cents, 20000, 'fills a price search missed');
  assert.equal((await withPhoto(draft, async () => { throw new Error('blocked'); })).items[0].image_url, null);
  assert.equal((await withPhoto(draft, async () => ({ warning: 'bot wall', items: [{ image_url: 'https://s.com/robot.png' }] }))).items[0].image_url, null, 'a bot wall is not the product');
  const typed = { source: 'description', merchant: {}, items: [{ title: 'x', url: 'https://s.com/x' }] };
  let fetched = false;
  await withPhoto(typed, async () => { fetched = true; });
  assert.equal(fetched, false, 'only lookups');
});

test('the photo is of the colour asked for, when the store lists one per variant', async () => {
  const draft = { source: 'lookup', merchant: { name: 'Stanley' }, items: [{ title: 'Quencher | 40 OZ', variant: '40 OZ | Rose Quartz 2.0', url: 'https://stanley.example/products/quencher', image_url: null, price_cents: 4500 }] };
  const page = async () => ({ items: [{ image_url: 'https://stanley.example/purple.png' }] });
  const product = { title: 'Quencher | 40 OZ', variants: [
    { option1: 'Purple Dust', title: 'Purple Dust', featured_image: { src: '//cdn.example/purple.png' } },
    { option1: 'Peach Rose', title: 'Peach Rose', featured_image: { src: '//cdn.example/peach.png' } },
    { option1: 'Rose Quartz 2.0', title: 'Rose Quartz 2.0', available: false, featured_image: { src: '//cdn.example/rose.png' } },
  ] };
  assert.equal((await withPhoto(draft, page, async () => product)).items[0].image_url, 'https://cdn.example/rose.png', 'sold out still has its photo');
  // Sizes share a colour's photo; no single match falls back to the page's.
  const hoodie = { title: 'Hoodie', variants: ['S', 'M'].map((z) => ({ option1: 'Black', option2: z, title: `Black / ${z}`, featured_image: { src: 'https://cdn.example/black.png' } })) };
  assert.equal((await withPhoto({ ...draft, items: [{ ...draft.items[0], variant: 'Black' }] }, page, async () => hoodie)).items[0].image_url, 'https://cdn.example/black.png');
  assert.equal((await withPhoto({ ...draft, items: [{ ...draft.items[0], variant: 'Green' }] }, page, async () => hoodie)).items[0].image_url, 'https://stanley.example/purple.png');
  assert.equal((await withPhoto(draft, page, async () => { throw new Error('blocked'); })).items[0].image_url, 'https://stanley.example/purple.png');
});
