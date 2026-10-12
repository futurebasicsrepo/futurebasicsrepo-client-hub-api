// Returns: the requester starts one from their order page and gets the
// store's own steps; the store's refund goes on to the payer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const DAY = 86_400_000;
const ADMIN = 'admin-token-0123456789';
const admin = { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' };
const env = { SPOT_ADMIN_TOKEN: ADMIN, RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', PUBLIC_URL: 'https://spotmeplease.com' };
const POLICY = { price_adjustment: null, returns_days: 30, free_returns: true, returns_how: 'Start at tecovas.com/returns with your order number and email; you get a free label.', returns_url: 'https://www.tecovas.com/returns', source_url: 'https://www.tecovas.com/pages/returns' };
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
};

function app(t) {
  const emails = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env, notifyFetch, capture: { policy: async () => POLICY, product: async () => null } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const ordered = async ({ ago = 3 * DAY } = {}) => {
    const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle', email: 'kyle@example.com' }, merchant: { name: 'Tecovas', url: 'https://www.tecovas.com' }, items: [{ title: 'The Cartwright', variant: 'Bourbon / 10', url: 'https://www.tecovas.com/products/the-cartwright', price_cents: 29500 }, { title: 'Belt', url: 'https://www.tecovas.com/products/belt', price_cents: 9500 }] })).body;
    await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom', payer_email: 'mom@example.com' });
    const id = a.spot.load(made.cart.token).id;
    a.spot.patch(id, (c) => ({ ...c, fulfillment: { state: 'placed', order_number: '#T1001', placed_at: Date.now() - ago } }));
    return { id, token: made.cart.token, k: made.manage_key };
  };
  return { a, call, emails, ordered };
}

test('a return: the store’s steps for the requester, on /admin for staff, and the store’s refund goes to the payer', async (t) => {
  const { a, call, emails, ordered } = app(t);
  const { id, token, k } = await ordered();
  const before = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(before.can_return, true);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/return`, { k: 'wrong', reason: 'doesnt_fit' })).status >= 400, true, 'their own order only');

  const r = await call('POST', `/v1/carts/${token}/manage/return`, { k, items: [0, 7, 0], reason: 'doesnt_fit', note: 'Too narrow' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ret = r.body.cart.return;
  assert.deepEqual(ret.items, [0], 'real items only, once');
  assert.equal(ret.reason, 'doesnt_fit');
  assert.equal(ret.policy.returns_url, 'https://www.tecovas.com/returns');
  assert.equal(ret.past_window, false);
  assert.equal(r.body.cart.can_return, false);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/return`, { k, reason: 'other' })).status, 409, 'one at a time');

  await until(() => emails.some((m) => /here’s how/.test(m.subject)), 'the steps email');
  const mail = emails.find((m) => /here’s how/.test(m.subject));
  assert.deepEqual(mail.to, ['kyle@example.com']);
  assert.match(mail.subject, /Sending back The Cartwright/);
  assert.match(mail.html, /order #T1001/);
  assert.match(mail.html, /tecovas\.com\/returns/);

  const listed = (await call('GET', '/v1/admin/overview', undefined, admin)).body.returns.find((x) => x.id === id);
  assert.equal(listed.ret.reason, 'doesnt_fit');
  assert.equal(listed.ret.note, 'Too narrow');
  assert.equal(listed.order_number, '#T1001');

  assert.equal((await call('POST', `/v1/carts/${token}/manage/return/shipped`, { k, tracking: '1Z999' })).body.cart.return.state, 'shipped');

  // The store refunds Spot's card: it goes to the payer, and the return is done.
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'capture', amount_cents: a.spot.byId(id).cart_cents });
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'refund', amount_cents: 29500 });
  const c = a.spot.byId(id);
  assert.equal(c.return.state, 'refunded');
  assert.equal(c.return.refunded_cents, 29500);
  assert.deepEqual(c.refunds.filter((x) => x.reason === 'store_refund').map((x) => [x.amount_cents, x.state]), [[29500, 'done']]);
  assert.equal((await call('GET', '/v1/admin/overview', undefined, admin)).body.returns.length, 0);
});

test('past the store’s window: allowed, flagged; staff can close one that ended another way', async (t) => {
  const { a, call, ordered } = app(t);
  const { id, token, k } = await ordered({ ago: 45 * DAY });
  const r = await call('POST', `/v1/carts/${token}/manage/return`, { k, reason: 'changed_mind' });
  assert.equal(r.body.cart.return.past_window, true);
  assert.equal((await call('POST', `/v1/admin/carts/${id}/return-close`, {})).status, 401);
  assert.equal((await call('POST', `/v1/admin/carts/${id}/return-close`, {}, admin)).status, 200);
  assert.equal(a.spot.byId(id).return.state, 'closed');
  assert.equal((await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart.can_return, true, 'can start again');
});

test('only an order Spot placed can be returned here', async (t) => {
  const { call } = app(t);
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Tecovas' }, items: [{ title: 'Belt', price_cents: 9500 }] })).body;
  const r = await call('POST', `/v1/carts/${made.cart.token}/manage/return`, { k: made.manage_key, reason: 'other' });
  assert.equal(r.status, 409);
});
