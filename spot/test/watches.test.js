// "Watch this": price drops and restocks on products a signed-in shopper
// asked Spot to watch, sent to their own account only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { WATCH_MAX } from '../src/watches.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BOOTS = 'https://www.tecovas.com/products/the-cartwright';
const env = { RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', PUBLIC_URL: 'https://spotmeplease.com' };

function app(t) {
  const emails = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const store = { [BOOTS]: { cents: 29500, stock: 'in' } };
  const db = openDb(':memory:');
  const a = buildApp({
    db,
    provider: sandboxProvider(),
    cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 },
    logger: false,
    env,
    notifyFetch,
    capture: { watchPrice: async (i) => (store[i.url]?.cents ? { cents: store[i.url].cents, source: 'store' } : null), watchStock: async (i) => store[i.url]?.stock || 'unknown' },
  });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    // With email on, the code goes out by email: read it from there.
    const code = start.body.code || emails.filter((m) => m.to.includes(email) && /sign-in code/.test(m.subject)).at(-1)?.subject.match(/^(\S+) is your/)?.[1];
    const v = await call('POST', '/v1/auth/verify', { email, code });
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  return { a, db, call, signIn, emails, store };
}
const item = { url: BOOTS, title: 'The Cartwright', image_url: 'https://cdn.tecovas.com/c.jpg', variant: 'Bourbon / 10', price_cents: 27500, store: 'Tecovas', stock: 'in' };

test('watching needs an account; alerts go to it, not to anything typed in', async (t) => {
  const { call, signIn } = app(t);
  assert.equal((await call('POST', '/v1/me/watches', item)).status, 401);
  assert.equal((await call('GET', '/v1/me/watches')).status, 401);
  const H = await signIn('kyle@example.com');
  assert.equal((await call('POST', '/v1/me/watches', { ...item, url: 'javascript:alert(1)' }, H)).status, 400);
  assert.equal((await call('POST', '/v1/me/watches', { ...item, title: '' }, H)).status, 400);
  const r = await call('POST', '/v1/me/watches', { ...item, email: 'someone@else.com' }, H);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.watch.start_cents, 29500, 'watching starts at the store’s own price, not the search’s');
  assert.equal(r.body.watch.stock, 'in');
  const other = await signIn('mom@example.com');
  assert.equal((await call('GET', '/v1/me/watches', undefined, other)).body.watches.length, 0, 'theirs only');
  assert.equal((await call('POST', `/v1/me/watches/${r.body.watch.id}/stop`, {}, other)).status, 404, 'nobody else can stop it');
  assert.equal((await call('GET', '/v1/me/watches', undefined, H)).body.watches.length, 1);
});

test('a real drop is sent once, a smaller wobble isn’t, and the next alert is from the new low', async (t) => {
  const { a, call, signIn, emails, store } = app(t);
  const H = await signIn('kyle@example.com');
  const w = (await call('POST', '/v1/me/watches', item, H)).body.watch;
  const t0 = Date.now();
  const sent = () => emails.filter((m) => /less at Tecovas/.test(m.subject));

  store[BOOTS].cents = 29000; // $5 on $295: under 3%
  assert.equal(await a.watches.sweep(t0 + 13 * HOUR), 1);
  assert.equal(sent().length, 0);
  assert.equal(await a.watches.sweep(t0 + 14 * HOUR), 0, 'twice a day, not every run');

  store[BOOTS].cents = 24900;
  await a.watches.sweep(t0 + 26 * HOUR);
  assert.equal(sent().length, 1);
  assert.deepEqual(sent()[0].to, ['kyle@example.com']);
  assert.match(sent()[0].subject, /The Cartwright is \$46\.00 less at Tecovas/);
  assert.match(sent()[0].html, /spotmeplease\.com\/new\?url=https%3A%2F%2Fwww\.tecovas\.com/);
  await a.watches.sweep(t0 + 39 * HOUR);
  assert.equal(sent().length, 1, 'same price: not again');
  store[BOOTS].cents = 21900;
  await a.watches.sweep(t0 + 52 * HOUR);
  assert.equal(sent().length, 2);
  assert.match(sent()[1].subject, /\$30\.00 less/, 'from the last drop it told them about');
  const got = (await call('GET', '/v1/me/watches', undefined, H)).body.watches[0];
  assert.equal(got.low_cents, 21900);
  assert.equal(got.alerts.length, 2);
  assert.equal(got.id, w.id);
});

test('back in stock: told when the option they wanted returns', async (t) => {
  const { a, call, signIn, emails, store } = app(t);
  const H = await signIn('kyle@example.com');
  store[BOOTS].stock = 'out';
  await call('POST', '/v1/me/watches', { ...item, stock: 'in' }, H);
  assert.equal(emails.filter((m) => /back in stock/.test(m.subject)).length, 0, 'no alert for the first look');
  store[BOOTS].stock = 'in';
  await a.watches.sweep(Date.now() + 13 * HOUR);
  const m = emails.filter((x) => /back in stock/.test(x.subject));
  assert.equal(m.length, 1);
  assert.match(m[0].html, /Bourbon \/ 10/);
});

test('stopping, the 60-day end, and the per-person cap', async (t) => {
  const { a, db, call, signIn, store } = app(t);
  const H = await signIn('kyle@example.com');
  const w = (await call('POST', '/v1/me/watches', item, H)).body.watch;
  const uid = db.watches.byId(w.id).user_id;
  assert.equal((await call('POST', `/v1/me/watches/${w.id}/stop`, {}, H)).status, 200);
  assert.equal((await call('GET', '/v1/me/watches', undefined, H)).body.watches.length, 0);
  assert.equal(await a.watches.sweep(Date.now() + DAY), 0, 'stopped: never checked');

  await call('POST', '/v1/me/watches', item, H);
  store[BOOTS].cents = 9900;
  await a.watches.sweep(Date.now() + 61 * DAY);
  assert.equal((await call('GET', '/v1/me/watches', undefined, H)).body.watches.length, 0, 'ended after 60 days');

  for (let i = 0; i < WATCH_MAX; i++) await a.watches.start(uid, { ...item, url: `${BOOTS}?i=${i}` });
  const over = await call('POST', '/v1/me/watches', { ...item, url: `${BOOTS}?i=999` }, H);
  assert.equal(over.status, 409);
  assert.match(over.body.error, /watching 50 things/);
});
