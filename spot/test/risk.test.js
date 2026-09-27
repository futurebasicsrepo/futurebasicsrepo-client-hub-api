import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const ADMIN = 'admin-token-0123456789';

function app(t, env = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_ADMIN_TOKEN: ADMIN, ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const admin = (method, url, payload) => call(method, url, payload, { authorization: `Bearer ${ADMIN}` });
  const make = async (price = 12000) => {
    const r = await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk', price_cents: price }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return { token: r.body.cart.token, k: r.body.manage_key };
  };
  const pay = (token, card) => call('POST', `/v1/carts/${token}/sandbox-pay`, { payer_name: 'Mom', test_card: card });
  const mine = async ({ token, k }) => (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  return { a, call, admin, make, pay, mine };
}

test('links per network per day are capped', async (t) => {
  const { make, call } = app(t, { SPOT_MAX_LINKS_PER_IP_DAY: '2' });
  await make();
  await make();
  const r = await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 100 }] });
  assert.equal(r.status, 429);
});

test('a blocked card is refunded at once and nothing is issued', async (t) => {
  const { admin, make, pay, mine } = app(t);
  assert.equal((await admin('POST', '/v1/admin/blocks', { kind: 'card', value: 'fp_stolen', reason: 'chargeback' })).status, 200);
  const c = await make();
  await pay(c.token, 'fp_stolen');
  const cart = await mine(c);
  assert.equal(cart.status, 'refunded');
  assert.equal(cart.card, null);
});

test('a card paying too many Spots is held until someone releases or refunds it', async (t) => {
  const { admin, make, pay, mine } = app(t, { SPOT_MAX_PAYMENTS_PER_CARD_DAY: '1' });
  const first = await make();
  await pay(first.token, 'fp_busy');
  assert.equal((await mine(first)).status, 'card_issued', 'first payment goes through');

  const second = await make();
  await pay(second.token, 'fp_busy');
  let cart = await mine(second);
  assert.equal(cart.status, 'paid');
  assert.equal(cart.held, true);
  assert.equal(cart.card, null, 'no card while held');

  const third = await make();
  await pay(third.token, 'fp_busy');

  const o = (await admin('GET', '/v1/admin/overview')).body;
  assert.equal(o.held.length, 2);
  assert.match(o.held[0].hold, /This card paid \d Spots in 24h/);
  assert.equal(o.held[0].fingerprint, 'fp_busy');

  const heldSecond = o.held.find((h) => h.token === second.token);
  assert.equal((await admin('POST', `/v1/admin/carts/${heldSecond.id}/release`, {})).status, 200);
  cart = await mine(second);
  assert.equal(cart.status, 'card_issued');
  assert.equal(cart.held, false);

  const heldThird = o.held.find((h) => h.token === third.token);
  assert.equal((await admin('POST', `/v1/admin/carts/${heldThird.id}/refund`, {})).status, 200);
  assert.equal((await mine(third)).status, 'refunded');
  assert.equal((await admin('POST', `/v1/admin/carts/${heldThird.id}/release`, {})).status, 409);
});

test('admin: off without a token, sign-in by cookie, JSON-only writes', async (t) => {
  const off = app(t, { SPOT_ADMIN_TOKEN: '' });
  assert.equal((await off.call('GET', '/admin')).status, 404);
  assert.equal((await off.call('GET', '/v1/admin/overview')).status, 404);

  const { call, a } = app(t);
  assert.match((await call('GET', '/admin')).body, /Paste the admin token/);
  assert.equal((await call('GET', '/v1/admin/overview')).status, 401);
  assert.equal((await call('POST', '/admin/login', { token: 'nope' })).status, 401);
  const ok = await call('POST', '/admin/login', { token: ADMIN });
  assert.equal(ok.status, 200);
  const cookie = ok.headers['set-cookie'].split(';')[0];
  assert.match(ok.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.ok(!cookie.includes(ADMIN), 'the cookie is not the token');
  assert.equal((await call('GET', '/v1/admin/overview', undefined, { cookie })).status, 200);
  assert.match((await call('GET', '/admin', undefined, { cookie })).body, /Needs you/);

  const form = await a.inject({ method: 'POST', url: '/v1/admin/blocks', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, payload: 'kind=card&value=x' });
  assert.equal(form.statusCode, 415, 'form posts (cross-site) are refused');

  const key = (await call('POST', '/v1/agent/keys', { email: 'dev@example.com' })).body;
  const revoked = await call('POST', `/v1/admin/keys/${key.name}/revoke`, {}, { cookie });
  assert.equal(revoked.status, 200);
  const use = await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: { authorization: `Bearer ${key.api_key}` }, payload: {} });
  assert.equal(use.statusCode, 401, 'revoked keys stop working');
});
