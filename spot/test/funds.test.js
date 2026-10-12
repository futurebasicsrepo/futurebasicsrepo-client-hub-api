// Spot's card balance against what paid orders still need, and telling
// staff before it bites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { cardLimitCents } from '../src/cart.js';
import { committedCents, createFunds, fundsState } from '../src/funds.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const ask = (cents) => ({ requester: { name: 'Riley' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk', quantity: 1, price_cents: cents }] });

function app(t) {
  const db = openDb(':memory:');
  const provider = sandboxProvider();
  const mail = [];
  const notifyFetch = async (url, init) => (String(url).includes('resend') && mail.push(JSON.parse(init.body)), new Response('{}', { status: 200 }));
  const env = { RESEND_API_KEY: 're_test', SPOT_ALERT_EMAIL: 'ops@example.com' };
  const a = buildApp({ db, provider, cfg, logger: false, env, notifyFetch });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.json() };
  };
  const paid = async (cents) => {
    const r = await call('POST', '/v1/carts', ask(cents));
    const p = await call('POST', `/v1/carts/${r.body.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    return a.spot.load(r.body.cart.token);
  };
  return { a, db, provider, mail, env, call, paid };
}

test('states: short below what’s promised, low inside the headroom', () => {
  assert.equal(fundsState(null, 0, 100), null);
  assert.equal(fundsState(900, 1000, 500), 'short');
  assert.equal(fundsState(1200, 1000, 500), 'low');
  assert.equal(fundsState(2000, 1000, 500), 'ok');
});

test('promised money counts paid orders the store hasn’t charged; staff hear when it’s short, once', async (t) => {
  const { db, provider, mail, env, paid } = app(t);
  provider.issuingCents = 1_000_000;
  const one = await paid(12000);
  const two = await paid(8000);
  assert.equal(committedCents(db), cardLimitCents(one) + cardLimitCents(two));
  // The store charged one of them: it no longer counts.
  db.save({ ...db.byId(one.id), spent_at: Date.now() }, db.byId(one.id).status);
  assert.equal(committedCents(db), cardLimitCents(two));

  let at = 1_000;
  const funds = createFunds({ db, provider, notifier: { send: async (to, m) => mail.push({ to: [to.email], subject: m.subject }) }, env, now: () => at });
  provider.issuingCents = cardLimitCents(two) - 100;
  assert.equal((await funds.check()).state, 'short');
  assert.match(mail.at(-1).subject, /can’t cover paid orders/);
  const n = mail.length;
  await funds.check();
  assert.equal(mail.length, n, 'not again within six hours');
  at += 7 * 3_600_000;
  await funds.check();
  assert.equal(mail.length, n + 1);
  provider.issuingCents = cardLimitCents(two) + 1000;
  assert.equal((await funds.status()).state, 'low');
  provider.issuingCents = cardLimitCents(two) + 100_000;
  assert.equal((await funds.status()).state, 'ok');
});

test('a payer turned away for the balance tells staff', async (t) => {
  const { provider, mail, call } = app(t);
  provider.issuingCents = 1000;
  const r = await call('POST', '/v1/carts', ask(12000));
  const p = await call('POST', `/v1/carts/${r.body.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  assert.equal(p.status, 503, 'the payer is told before anything is held');
  await new Promise((done) => setTimeout(done, 20));
  const alert = mail.find((m) => m.to?.[0] === 'ops@example.com');
  assert.ok(alert, JSON.stringify(mail));
  assert.match(alert.subject, /payment was turned away/);
});
