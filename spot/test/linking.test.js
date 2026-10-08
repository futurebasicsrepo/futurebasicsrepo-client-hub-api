import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };

function app(t) {
  const db = openDb(':memory:');
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env: { SPOT_API_KEYS: 'partner:s3cret' } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (to) => {
    const start = await call('POST', '/v1/auth/start', to.phone ? { ...to, sms_consent: true } : to);
    const v = await call('POST', '/v1/auth/verify', { ...to, code: start.body.code });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  const link = async (cookie, to) => {
    const start = await call('POST', '/v1/me/link/start', to.phone ? { ...to, sms_consent: true } : to, cookie);
    assert.equal(start.status, 200, JSON.stringify(start.body));
    return call('POST', '/v1/me/link/verify', { ...to, code: start.body.code }, cookie);
  };
  return { db, call, signIn, link };
}

test('📱 add a phone to an email account; either one signs you in', async (t) => {
  const { call, signIn, link } = app(t);
  const me = await signIn({ email: 'kyle@example.com' });
  const r = await link(me, { phone: '(512) 555-0100' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.phone, '+15125550100');
  assert.equal(r.body.merged, false);
  const byText = await signIn({ phone: '512-555-0100' });
  assert.equal((await call('GET', '/v1/me', null, byText)).body.user.email, 'kyle@example.com', 'the text sign-in lands in the same account');
});

test('✉️ add an email to a text account', async (t) => {
  const { call, signIn, link } = app(t);
  const me = await signIn({ phone: '5125550100' });
  assert.equal((await link(me, { email: 'Kyle@Example.com' })).body.user.email, 'kyle@example.com');
  const byEmail = await signIn({ email: 'kyle@example.com' });
  assert.equal((await call('GET', '/v1/me', null, byEmail)).body.user.phone, '+15125550100');
});

test('🔗 linking an address that has its own account merges it in', async (t) => {
  const { db, call, signIn, link } = app(t);
  // Two accounts: one from a text sign-in with a Spot, a key and a name; one by email.
  const texter = await signIn({ phone: '5125550100' });
  await call('POST', '/v1/me', { name: 'Kyle R', travelers: [{ given_name: 'Kyle', family_name: 'Riggle' }] }, texter);
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk Low', price_cents: 11500 }] })).body;
  assert.equal((await call('POST', '/v1/me/claim', { links: [{ token: made.cart.token, k: made.manage_key }] }, texter)).body.claimed, 1);
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'claude' }, texter)).body.api_key;
  const emailer = await signIn({ email: 'kyle@example.com' });

  const r = await link(emailer, { phone: '512 555 0100' });
  assert.equal(r.body.merged, true);
  const mine = (await call('GET', '/v1/me', null, emailer)).body;
  assert.equal(mine.user.email, 'kyle@example.com');
  assert.equal(mine.user.phone, '+15125550100');
  assert.equal(mine.user.name, 'Kyle R', 'blank fields filled from the other account');
  assert.equal(mine.user.travelers.length, 1);
  assert.deepEqual(mine.carts.map((c) => c.items[0].title), ['Dunk Low']);
  assert.equal(mine.keys.length, 1);
  // The AI key now hands things to the merged account.
  await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Aritzia' }, items: [{ title: 'Super Puff', price_cents: 25000 }], for: 'self' }, { authorization: `Bearer ${key}` });
  assert.ok((await call('GET', '/v1/me', null, emailer)).body.ready.some((c) => c.items[0].title === 'Super Puff'));
  // The old text session now opens the merged account too.
  assert.equal((await call('GET', '/v1/me', null, texter)).body.user.email, 'kyle@example.com');
});

test('🔒 link codes are bound to the account and can’t sign anyone in', async (t) => {
  const { call, signIn } = app(t);
  const me = await signIn({ email: 'kyle@example.com' });
  const other = await signIn({ email: 'eve@example.com' });
  assert.equal((await call('POST', '/v1/me/link/start', { phone: '5125550100', sms_consent: true })).status, 401, 'signed-in only');
  const start = await call('POST', '/v1/me/link/start', { phone: '5125550100', sms_consent: true }, me);
  assert.equal((await call('POST', '/v1/auth/verify', { phone: '5125550100', code: start.body.code })).status, 401, 'not a sign-in code');
  assert.equal((await call('POST', '/v1/me/link/verify', { phone: '5125550100', code: start.body.code }, other)).status, 401, 'not usable from another account');
  assert.equal((await call('POST', '/v1/me/link/verify', { phone: '5125550100', code: start.body.code }, me)).status, 200);
  assert.equal((await call('POST', '/v1/me/link/start', { phone: '5125550100', sms_consent: true }, me)).status, 409, 'already on the account');
  assert.equal((await call('POST', '/v1/me/link/start', { email: 'nope' }, me)).status, 400);
});

test('📱 changing your phone: the old number stops signing you in', async (t) => {
  const { db, call, signIn, link } = app(t);
  const me = await signIn({ phone: '5125550100' });
  await link(me, { phone: '5125550199' });
  assert.equal((await call('GET', '/v1/me', null, me)).body.user.phone, '+15125550199');
  const id = db.identities.userId('phone', '+15125550199');
  assert.ok(id);
  assert.equal(db.identities.userId('phone', '+15125550100'), null);
});
