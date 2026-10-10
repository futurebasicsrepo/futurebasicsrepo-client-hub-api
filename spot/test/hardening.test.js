// Found in a QA pass: limits the caller can't dodge, addresses Spot won't
// fetch, sign-in codes that can't stand in for each other, and the like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { isPrivateAddress } from '../src/capture.js';
import { normalizeRules } from '../src/rules.js';
import { validateShipping } from '../src/fulfill/index.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const cart = (patch = {}) => ({ requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk', quantity: 1, price_cents: 1500 }], ...patch });

function app(t, env = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'on', ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { a, call };
}

test('IPv4 hidden in IPv6 is still a private address', () => {
  for (const ip of ['::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'fec0::1', 'fe90::1', 'fd00::1', '::1', '::', '198.18.0.1', 'nonsense']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8', '23.227.38.74']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('a made-up X-Forwarded-For doesn’t get around per-person limits', async (t) => {
  const { call } = app(t);
  let last;
  for (let i = 0; i < 22; i++) last = await call('POST', '/v1/carts', cart(), { 'x-forwarded-for': `10.0.0.${i}` });
  assert.equal(last.status, 429);
});

test('behind Railway, the edge’s X-Real-IP is who’s calling', async (t) => {
  const { call } = app(t, { RAILWAY_ENVIRONMENT_ID: 'env' });
  for (let i = 0; i < 21; i++) await call('POST', '/v1/carts', cart(), { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': `10.0.0.${i}` });
  assert.equal((await call('POST', '/v1/carts', cart(), { 'x-real-ip': '203.0.113.9' })).status, 429);
  assert.equal((await call('POST', '/v1/carts', cart(), { 'x-real-ip': '198.51.100.20' })).status, 201, 'someone else isn’t limited');
});

test('every response carries security headers; unknown pages get a page', async (t) => {
  const { call } = app(t, { RAILWAY_ENVIRONMENT_ID: 'env' });
  const r = await call('GET', '/');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.headers['strict-transport-security'], /max-age=/);
  const nf = await call('GET', '/no-such-page', undefined, { accept: 'text/html' });
  assert.equal(nf.status, 404);
  assert.match(nf.headers['content-type'], /text\/html/);
  assert.equal((await call('GET', '/fonts/constructor')).status, 404);
  assert.equal((await call('GET', '/site/__proto__')).status, 404);
  assert.equal((await call('GET', '/robots.txt')).status, 200);
  assert.equal((await call('GET', '/apple-touch-icon.png')).headers['content-type'], 'image/png');
});

test('add to home screen: a manifest, Spot as the icon, and the tags on every page', async (t) => {
  const { call } = app(t);
  const m = await call('GET', '/manifest.webmanifest');
  assert.equal(m.status, 200);
  assert.match(m.headers['content-type'], /application\/manifest\+json/);
  const man = typeof m.body === 'string' ? JSON.parse(m.body) : m.body;
  assert.equal(man.short_name, 'Spot');
  assert.equal(man.display, 'standalone');
  for (const icon of man.icons) {
    const r = await call('GET', icon.src);
    assert.equal(r.status, 200, icon.src);
    assert.equal(r.headers['content-type'], 'image/png');
  }
  assert.ok(man.icons.some((i) => i.purpose === 'maskable'));
  assert.equal((await call('GET', '/icon-999.png')).status, 404);
  assert.match((await call('GET', '/logo.svg')).body, /<svg[\s\S]*#ff5a36/);
  for (const path of ['/', '/new']) {
    const page = (await call('GET', path)).body;
    assert.match(page, /<link rel="manifest" href="\/manifest.webmanifest">/, path);
    assert.match(page, /apple-mobile-web-app-title" content="Spot"/, path);
  }
});

test('manage actions only take JSON from this site', async (t) => {
  const { call } = app(t);
  const made = (await call('POST', '/v1/carts', cart())).body;
  const url = `/v1/carts/${made.cart.token}/manage/cancel`;
  assert.equal((await call('POST', url, `k=${made.manage_key}`, { 'content-type': 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await call('POST', url, { k: made.manage_key }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', url, { k: made.manage_key }, { origin: 'http://localhost:80' })).status, 200);
});

test('quantities must be whole numbers, and store rules cover every item link', async (t) => {
  const { call } = app(t);
  const r = await call('POST', '/v1/carts', cart({ items: [{ title: 'Dunk', quantity: '20abc', price_cents: 1500 }] }));
  assert.equal(r.status, 400);
  assert.throws(() => normalizeRules({ stores: 'nike.com' }), /list of store domains/);
  assert.throws(() => normalizeRules({ stores: ['localhost'] }), /isn’t a store domain/);
  assert.throws(() => normalizeRules({ max_order_cents: 5000, monthly_cents: 1000 }), /monthly limit/);
  assert.deepEqual(normalizeRules({ stores: ['https://www.Nike.com/x', 'nike.com'] }).stores, ['nike.com']);
});

test('a sign-in code can’t be asked for an add-an-email key', async (t) => {
  const { call } = app(t);
  assert.equal((await call('POST', '/v1/auth/start', { email: 'link:abc:victim@example.com' })).status, 400);
});

test('addresses: US state and ZIP', () => {
  const base = { name: 'K R', line1: '1 Main', city: 'Austin', email: 'k@x.co' };
  assert.equal(validateShipping({ ...base, state: 'texas', postal_code: '78701' }).state, 'TX');
  assert.equal(validateShipping({ ...base, state: 'tx', postal_code: 78701 }).postal_code, '78701');
  assert.throws(() => validateShipping({ ...base, state: 'Narnia', postal_code: '78701' }), /US state/);
  assert.throws(() => validateShipping({ ...base, state: 'TX', postal_code: 'ABCDE' }), /ZIP/);
});

test('a decline’s name can’t carry a link into the requester’s email', async (t) => {
  const { a, call } = app(t);
  const made = (await call('POST', '/v1/carts', cart())).body;
  await call('POST', `/v1/carts/${made.cart.token}/decline`, { name: 'Spot Support: verify at evil.co/x' });
  assert.equal(a.spot.load(made.cart.token).declines[0].name, null);
  await call('POST', `/v1/carts/${made.cart.token}/decline`, { name: 'Mom' });
  assert.equal(a.spot.load(made.cart.token).declines[1].name, 'Mom');
});

test('a CSS-breaking image address is encoded', async (t) => {
  const { call } = app(t);
  const made = (await call('POST', '/v1/carts', cart({ items: [{ title: 'x', quantity: 1, price_cents: 100, image_url: "https://e.example/a');position:fixed;inset:0;background:url('https://e.example/b" }] }))).body;
  assert.doesNotMatch(made.cart.items[0].image_url, /['()]/);
  assert.doesNotMatch((await call('GET', `/c/${made.cart.token}`)).body, /url\('[^']*'\);position/, 'can’t close the url(…) and add styles');
});
