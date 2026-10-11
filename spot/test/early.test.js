import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { gateOn } from '../src/early.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };

function app(t, env = {}) {
  const db = openDb(':memory:');
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'off', ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers: { accept: 'text/html', ...headers } });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    const v = await call('POST', '/v1/auth/verify', { email, code: start.body.code });
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  return { db, call, signIn };
}
const gated = (r) => r.status === 200 && /id="eaForm"/.test(r.body) && /Early access/.test(r.body);

test('gate switch: on for Railway unless SITE_GATE=off, off locally unless SITE_GATE=on', () => {
  assert.equal(gateOn({}, false), false);
  assert.equal(gateOn({}, true), true);
  assert.equal(gateOn({ SITE_GATE: 'off' }, true), false);
  assert.equal(gateOn({ SITE_GATE: 'on' }, false), true);
});

test('gate off: the full site, as before', async (t) => {
  const { call } = app(t);
  const home = await call('GET', '/');
  assert.equal(home.status, 200);
  assert.ok(!gated(home));
  assert.match(home.body, /yes button/);
});

test('gate on: marketing pages show early access; everything people need still works', async (t) => {
  const { call } = app(t, { SITE_GATE: 'on' });
  for (const p of ['/', '/new', '/connect', '/integrations', '/standards', '/agent-card', '/?ref=x']) assert.ok(gated(await call('GET', p)), `${p} is gated`);
  assert.match((await call('GET', '/')).headers['cache-control'], /no-store/);
  assert.match((await call('GET', '/')).body, /og:image" content="[^"]*\/assets\/og-early\.jpg\?v=/, 'its own link preview');
  const og = await call('GET', '/assets/og-early.jpg');
  assert.equal(og.status, 200);
  assert.equal(og.headers['content-type'], 'image/jpeg');

  // Pay links, sign-in, legal pages, the SMS opt-in page, health and the API stay open.
  const made = await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Shop', url: 'https://shop.example' }, items: [{ title: 'Hoodie', price_cents: 6400 }] });
  assert.equal(made.status, 201);
  const pay = await call('GET', `/c/${made.body.cart.token}`);
  assert.equal(pay.status, 200);
  assert.ok(!gated(pay));
  for (const p of ['/signin', '/terms', '/privacy', '/texts']) {
    const r = await call('GET', p);
    assert.equal(r.status, 200, p);
    assert.ok(!gated(r), `${p} stays open`);
  }
  assert.equal((await call('GET', '/health')).status, 200);
  assert.equal((await call('GET', '/.well-known/ucp')).status, 200);

  // The form's endpoint takes the signup.
  assert.equal((await call('POST', '/v1/waitlist', { email: 'friend@example.com', kind: 'agent' })).status, 200);
});

test('gate on: staff see the full site; a preview link opens it for one browser', async (t) => {
  const { call, signIn } = app(t, { SITE_GATE: 'on', SITE_PREVIEW_KEY: 'k'.repeat(24) });
  const staff = await signIn('kyle@thefuturebasics.com');
  assert.ok(!gated(await call('GET', '/', undefined, staff)), 'staff skip the gate');
  const someone = await signIn('someone@example.com');
  assert.ok(gated(await call('GET', '/', undefined, someone)), 'other accounts see early access');

  assert.ok(gated(await call('GET', '/?preview=wrong-key-wrong-key')), 'a wrong key does nothing');
  const go = await call('GET', `/connect?preview=${'k'.repeat(24)}&x=1`);
  assert.equal(go.status, 302);
  assert.equal(go.headers.location, '/connect?x=1', 'the key comes off the URL');
  const cookie = go.headers['set-cookie'].split(';')[0];
  assert.match(go.headers['set-cookie'], /HttpOnly/);
  assert.ok(!gated(await call('GET', '/', undefined, { cookie })), 'the browser with the cookie sees the site');
  assert.ok(gated(await call('GET', '/', undefined, { cookie: 'spot_preview=' + '0'.repeat(64) })), 'a made-up cookie does not');
});

test('gate on without a preview key: ?preview does nothing', async (t) => {
  const { call } = app(t, { SITE_GATE: 'on' });
  assert.ok(gated(await call('GET', '/?preview=anything-at-all-here')));
});
