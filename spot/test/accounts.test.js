import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };

function app(t, extra = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_API_KEYS: 'partner:s3cret' }, ...extra });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    const v = await call('POST', '/v1/auth/verify', { email, code: start.body.code });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    return v.headers['set-cookie'].split(';')[0];
  };
  return { a, call, signIn };
}

test('sign in with an emailed code; wrong codes and too many tries fail', async (t) => {
  const sent = [];
  const notifyFetch = async (url, init) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const { call } = app(t, { notifyFetch, env: { RESEND_API_KEY: 're_x' } });
  const start = await call('POST', '/v1/auth/start', { email: 'Kyle@Example.com' });
  assert.deepEqual(start.body, { sent: 'email' }, 'the code is never in the response when email works');
  const code = sent[0].subject.slice(0, 6);
  assert.match(code, /^\d{6}$/);
  assert.equal((await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: code === '000000' ? '111111' : '000000' })).status, 401);
  const ok = await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code });
  assert.equal(ok.status, 200);
  assert.match(ok.headers['set-cookie'], /^spot_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax/);
  assert.equal((await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code })).status, 401, 'codes work once');

  await call('POST', '/v1/auth/start', { email: 'kyle@example.com' });
  for (let i = 0; i < 5; i++) await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: '999999' });
  const real = sent.at(-1).subject.slice(0, 6);
  assert.equal((await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: real })).status, 401, 'locked after 5 tries');
});

test('an account holds your Spots, saved details, and asks from your own AI', async (t) => {
  const { a, call, signIn } = app(t);
  // A Spot made before signing in, kept on this device.
  const early = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 11500 }] })).body;

  const cookie = await signIn('kyle@example.com');
  const H = { cookie };
  assert.equal((await call('GET', '/v1/me')).status, 401);
  assert.equal((await call('GET', '/account')).status, 302);
  assert.equal((await call('GET', '/account', undefined, H)).status, 200);

  // Made while signed in → in the account; claim the earlier one.
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Aritzia' }, items: [{ title: 'Super Puff', price_cents: 25000 }] }, H)).body;
  assert.equal((await call('POST', '/v1/me/claim', { links: [{ token: early.cart.token, k: early.manage_key }, { token: 'nope', k: 'x' }] }, H)).body.claimed, 1);
  let me = (await call('GET', '/v1/me', undefined, H)).body;
  assert.deepEqual(me.carts.map((c) => c.merchant.name).sort(), ['Aritzia', 'Nike']);

  // The owner opens their Spot without the private key; others can't.
  assert.equal((await call('GET', `/v1/carts/${made.cart.token}/manage`, undefined, H)).status, 200);
  assert.equal((await call('GET', `/v1/carts/${made.cart.token}/manage`)).status, 404);
  const other = await signIn('someone@example.com');
  assert.equal((await call('GET', `/v1/carts/${made.cart.token}/manage`, undefined, { cookie: other })).status, 404);

  // Saved details come back to pre-fill checkout.
  const saved = await call('POST', '/v1/me', { name: 'Kyle Riggle', shipping: { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701' }, travelers: [{ given_name: 'Kyle', family_name: 'Riggle', born_on: '1990-04-02', gender: 'm' }] }, H);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const view = (await call('GET', `/v1/carts/${made.cart.token}/manage`, undefined, H)).body;
  assert.equal(view.profile.shipping.postal_code, '78701');
  assert.equal(view.profile.travelers[0].family_name, 'Riggle');
  const form = await a.inject({ method: 'POST', url: '/v1/me', headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' }, payload: 'name=x' });
  assert.equal(form.statusCode, 415, 'writes need JSON');

  // Connect an AI from the account: its "for me" asks land in "Ready for you".
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'Claude' }, H)).body;
  assert.match(key.api_key, /^spot_/);
  const ask = await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Delta' }, items: [{ title: 'AUS → SFO', price_cents: 24900 }], for: 'self' }, { authorization: `Bearer ${key.api_key}` });
  assert.equal(ask.status, 201);
  assert.match(ask.body.finish_link_note, /Ready for you/);
  me = (await call('GET', '/v1/me', undefined, H)).body;
  assert.equal(me.ready.length, 1);
  assert.equal(me.ready[0].merchant.name, 'Delta');
  // A partner key's asks don't belong to anyone.
  await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 100 }], for: 'self' }, { authorization: 'Bearer s3cret' });
  assert.equal((await call('GET', '/v1/me', undefined, H)).body.ready.length, 1);

  // Disconnect the AI; sign out.
  assert.equal((await call('POST', `/v1/me/keys/${key.name}/revoke`, {}, H)).status, 200);
  assert.equal((await call('POST', '/v1/agent/asks', {}, { authorization: `Bearer ${key.api_key}` })).status, 401);
  await call('POST', '/v1/auth/logout', {}, H);
  assert.equal((await call('GET', '/v1/me', undefined, H)).status, 401);
});
