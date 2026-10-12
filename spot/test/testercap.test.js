// Early access is a controlled group: while the site is gated, invited and
// staff accounts can make asks past the per-ask cap (up to the tester cap).
// Everyone else, and everyone once the gate is off, stays on the cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, testMaxCartCents: 2500000, expiresHours: 72 };
const SOFA = { title: 'Field Sofa', quantity: 1, price_cents: 189500, url: 'https://sofa.example/products/field' };
const LAMP = { title: 'Desk Lamp', quantity: 1, price_cents: 12900, url: 'https://lamp.example/products/lamp' };
const cart = (items) => ({ requester: { name: 'Pal' }, merchant: { name: 'Sofa Co', url: 'https://sofa.example' }, items, extras_cents: 0, settle: 'card', for: 'self' });

function app(t, env = {}) {
  const db = openDb(':memory:');
  const mail = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend.com')) mail.push(JSON.parse(init.body));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, notifyFetch, env: { SPOT_AGENT: 'off', SITE_GATE: 'on', RESEND_API_KEY: 're_test', ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const signIn = async (email) => {
    await a.inject({ method: 'POST', url: '/v1/auth/start', payload: { email } });
    const code = mail.at(-1)?.text?.match(/\b(\d{6})\b/)?.[1];
    const v = await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email, code } });
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  return { call, signIn };
}

test('gated: invited and staff accounts go past the cap; everyone else stays on it', async (t) => {
  const { call, signIn } = app(t);
  const staff = await signIn('kyle@thefuturebasics.com');
  assert.equal((await call('POST', '/v1/admin/invites', { emails: ['pal@example.com'] }, staff)).status, 200);
  const pal = await signIn('pal@example.com');
  const stranger = await signIn('stranger@example.com');

  assert.equal((await call('POST', '/v1/carts', cart([SOFA]), pal)).status, 201, 'invited');
  assert.equal((await call('POST', '/v1/carts', cart([SOFA]), staff)).status, 201, 'staff');
  const no = await call('POST', '/v1/carts', cart([SOFA]), stranger);
  assert.equal(no.status, 400);
  assert.match(no.body.error, /capped at \$500/);
  assert.equal((await call('POST', '/v1/carts', cart([SOFA]))).status, 400, 'signed out');
  assert.equal((await call('POST', '/v1/carts', cart([{ ...SOFA, price_cents: 2600000 }]), pal)).status, 400, 'the tester cap still holds');

  // The wallet quote, a multi-store ask, and the page's own limit follow suit.
  const stores = [{ merchant: { name: 'Sofa Co', url: 'https://sofa.example' }, items: [SOFA] }, { merchant: { name: 'Lamp Co', url: 'https://lamp.example' }, items: [LAMP] }];
  assert.equal((await call('POST', '/v1/quote', { stores: stores.slice(0, 1) }, pal)).status, 200);
  assert.equal((await call('POST', '/v1/quote', { stores: stores.slice(0, 1) }, stranger)).status, 400);
  assert.equal((await call('POST', '/v1/bundles', { requester: { name: 'Pal' }, stores, for: 'self' }, pal)).status, 201);
  assert.equal((await call('POST', '/v1/bundles', { requester: { name: 'Pal' }, stores, for: 'self' }, stranger)).status, 400);
  assert.match((await call('GET', '/new', undefined, pal)).body, /"max":2500000/);
  assert.match((await call('GET', '/new', undefined, staff)).body, /"max":2500000/);

  // Withdrawn: back on the cap.
  await call('POST', '/v1/admin/invites/revoke', { email: 'pal@example.com' }, staff);
  assert.equal((await call('POST', '/v1/carts', cart([SOFA]), pal)).status, 400);
});

test('at launch (gate off) everyone is on the cap again', async (t) => {
  const { call, signIn } = app(t, { SITE_GATE: 'off' });
  const staff = await signIn('kyle@thefuturebasics.com');
  assert.equal((await call('POST', '/v1/carts', cart([SOFA]), staff)).status, 400);
  assert.match((await call('GET', '/new', undefined, staff)).body, /"max":50000/);
});
