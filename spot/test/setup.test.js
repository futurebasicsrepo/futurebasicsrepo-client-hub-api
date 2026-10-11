// The first-sign-in setup: /account sends someone new to /setup, once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const SHIP = { name: 'Riley Park', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701' };

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { call };
}

async function signIn(call, email = 'riley@example.com') {
  const start = await call('POST', '/v1/auth/start', { email });
  const cookie = (await call('POST', '/v1/auth/verify', { email, code: start.body.code })).headers['set-cookie'].split(';')[0];
  return (m, u, p) => call(m, u, p, { cookie });
}

test('signed out, /setup asks you to sign in first', async (t) => {
  const { call } = app(t);
  const r = await call('GET', '/setup');
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/signin?next=/setup');
});

test('someone new lands on /setup, fills it in, and is done', async (t) => {
  const { call } = app(t);
  const as = await signIn(call);
  const acct = await as('GET', '/account');
  assert.equal(acct.status, 302);
  assert.equal(acct.headers.location, '/setup');
  // Mid-task sign-ins and the account page's own links aren't held up.
  assert.equal((await as('GET', '/account?skip_setup=1')).status, 200);
  assert.equal((await as('GET', '/account?add=card')).status, 200);

  const page = await as('GET', '/setup');
  assert.equal(page.status, 200);
  assert.match(page.body, /What should I call you\?/);

  let me = (await as('GET', '/v1/me')).body;
  assert.deepEqual(me.setup, { done: false, skipped: false, needed: true, name: false, shipping: false, sizes: false, ai: false, card: false });

  assert.equal((await as('POST', '/v1/me', { name: 'Riley' })).status, 200);
  const bad = await as('POST', '/v1/me', { shipping: { ...SHIP, postal_code: '7870' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /ZIP/, 'the server’s reason is shown on the step');
  assert.equal((await as('POST', '/v1/me', { shipping: SHIP })).status, 200);
  assert.equal((await as('POST', '/v1/me', { sizes: { tops: 'M', bottoms: '32x30', shoes: 'US 10.5' } })).status, 200);

  me = (await as('GET', '/v1/me')).body;
  assert.equal(me.user.name, 'Riley');
  assert.equal(me.user.shipping.email, 'riley@example.com', 'receipts go to the sign-in email by default');
  assert.deepEqual(me.user.sizes, { tops: 'M', bottoms: '32x30', shoes: 'US 10.5' });
  assert.equal(me.setup.needed, false, 'a name and an address are enough');
  assert.equal(me.setup.done, false);

  const done = await as('POST', '/v1/me', { setup_done: true });
  assert.ok(done.body.user.setup_at);
  assert.equal(done.body.user.setup_skipped, false);
  assert.equal((await as('GET', '/account')).status, 200);
});

test('skipping the whole thing stops the redirect, and setup_at survives later saves', async (t) => {
  const { call } = app(t);
  const as = await signIn(call);
  const skip = await as('POST', '/v1/me', { setup_done: true, setup_skipped: true });
  const at = skip.body.user.setup_at;
  assert.ok(at);
  assert.equal(skip.body.user.setup_skipped, true);
  assert.equal((await as('GET', '/account')).status, 200, 'no name or address, but they said later');

  await as('POST', '/v1/me', { name: 'Riley' });
  await as('POST', '/v1/me', { sizes: { tops: 'S' } });
  const me = (await as('GET', '/v1/me')).body;
  assert.equal(me.user.setup_at, at);
  assert.equal(me.setup.done, true);
  assert.equal(me.setup.skipped, true, 'the account page still offers to finish');
  assert.equal((await as('GET', '/account')).status, 200);

  // Finishing it later clears the skip but keeps the first date.
  const fin = await as('POST', '/v1/me', { setup_done: true });
  assert.equal(fin.body.user.setup_at, at);
  assert.equal(fin.body.user.setup_skipped, false);
});

test('an account that already has a name and an address is never sent to /setup', async (t) => {
  const { call } = app(t);
  const as = await signIn(call);
  await as('POST', '/v1/me', { name: 'Riley Park', shipping: SHIP });
  assert.equal((await as('GET', '/account')).status, 200);
  assert.equal((await as('GET', '/v1/me')).body.setup.needed, false);
  // /setup still opens for them, e.g. from the account page.
  assert.equal((await as('GET', '/setup')).status, 200);
});

test('setup survives adding a phone, and merging in another account', async (t) => {
  const { call } = app(t);
  const as = await signIn(call);
  await as('POST', '/v1/me', { setup_done: true });
  const start = await as('POST', '/v1/me/link/start', { phone: '+1 512 555 0100', sms_consent: true });
  await as('POST', '/v1/me/link/verify', { phone: '+1 512 555 0100', code: start.body.code });
  assert.ok((await as('GET', '/v1/me')).body.user.setup_at, 'adding a phone rebuilds the doc and keeps it');

  // A brand-new phone account that adds the set-up email gets its setup too.
  const phone = '+1 512 555 0199';
  const s = await call('POST', '/v1/auth/start', { phone, sms_consent: true });
  const cookie = (await call('POST', '/v1/auth/verify', { phone, code: s.body.code })).headers['set-cookie'].split(';')[0];
  const as2 = (m, u, p) => call(m, u, p, { cookie });
  assert.equal((await as2('GET', '/account')).headers.location, '/setup');
  const l = await as2('POST', '/v1/me/link/start', { email: 'riley@example.com' });
  assert.equal((await as2('POST', '/v1/me/link/verify', { email: 'riley@example.com', code: l.body.code })).body.merged, true);
  assert.equal((await as2('GET', '/account')).status, 200);
});
