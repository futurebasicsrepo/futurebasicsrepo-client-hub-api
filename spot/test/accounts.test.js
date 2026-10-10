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
  // One your AI made for someone else to pay shows there too, so you can send or pay it.
  await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Sports Basement' }, items: [{ title: '49ers Tee', price_cents: 2300 }] }, { authorization: `Bearer ${key.api_key}` });
  me = (await call('GET', '/v1/me', undefined, H)).body;
  assert.deepEqual(me.ready.map((c) => c.merchant.name).sort(), ['Delta', 'Sports Basement']);
  // A partner key's asks don't belong to anyone.
  await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 100 }], for: 'self' }, { authorization: 'Bearer s3cret' });
  assert.equal((await call('GET', '/v1/me', undefined, H)).body.ready.length, 2);

  // Disconnect the AI; sign out.
  assert.equal((await call('POST', `/v1/me/keys/${key.name}/revoke`, {}, H)).status, 200);
  assert.equal((await call('POST', '/v1/agent/asks', {}, { authorization: `Bearer ${key.api_key}` })).status, 401);
  await call('POST', '/v1/auth/logout', {}, H);
  assert.equal((await call('GET', '/v1/me', undefined, H)).status, 401);
});

test('sign in with a texted code: its own account, autofill line, STOP respected', async (t) => {
  const texts = [];
  const notifyFetch = async (url, init) => {
    texts.push(new URLSearchParams(String(init.body)).get('Body'));
    return new Response('{}', { status: 200 });
  };
  const twilio = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15125550000', PUBLIC_URL: 'https://spotmeplease.com' };
  const { call } = app(t, { notifyFetch, env: twilio });

  assert.equal((await call('POST', '/v1/auth/start', { phone: '12', sms_consent: true })).status, 400);
  const start = await call('POST', '/v1/auth/start', { phone: '(512) 555-0100', sms_consent: true });
  assert.deepEqual(start.body, { sent: 'text' }, 'the code is never in the response when texting works');
  const code = texts[0].match(/^Spot: (\d{6}) is your sign-in code/)[1];
  assert.match(texts[0], /Reply STOP to opt out\./);
  assert.ok(texts[0].endsWith(`@spotmeplease.com #${code}`), 'WebOTP line binds the code to the domain');

  const v = await call('POST', '/v1/auth/verify', { phone: '+1 512 555 0100', code });
  assert.equal(v.status, 200);
  const H = { cookie: v.headers['set-cookie'].split(';')[0] };
  let me = (await call('GET', '/v1/me', undefined, H)).body;
  assert.equal(me.user.phone, '+15125550100');
  assert.equal(me.user.email, null);

  // Receipts need an email: a phone-only account adds one with the address.
  const ship = { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701' };
  assert.equal((await call('POST', '/v1/me', { shipping: ship }, H)).status, 400);
  assert.equal((await call('POST', '/v1/me', { shipping: { ...ship, email: 'kyle@example.com' } }, H)).status, 200);
  me = (await call('GET', '/v1/me', undefined, H)).body;
  assert.equal(me.user.phone, '+15125550100', 'phone kept after saving');
  assert.equal((await call('POST', '/v1/me/keys', {}, H)).status, 201);

  // The same number later: the same account.
  await call('POST', '/v1/auth/start', { phone: '5125550100', sms_consent: true });
  const again = await call('POST', '/v1/auth/verify', { phone: '5125550100', code: texts.at(-1).match(/(\d{6})/)[1] });
  const H2 = { cookie: again.headers['set-cookie'].split(';')[0] };
  assert.equal((await call('GET', '/v1/me', undefined, H2)).body.user.shipping.postal_code, '78701');

});

test('texted code in test mode shows on screen; opted-out numbers are refused', async (t) => {
  const db = openDb(':memory:');
  const { call } = app(t, { db });
  const r = await call('POST', '/v1/auth/start', { phone: '5125550100', sms_consent: true });
  assert.equal(r.body.sent, 'screen');
  assert.match(r.body.code, /^\d{6}$/);
  // STOP normally arrives through the Twilio webhook.
  db.optouts.add('+15125550177');
  const stopped = await call('POST', '/v1/auth/start', { phone: '512-555-0177', sms_consent: true });
  assert.equal(stopped.status, 409);
  assert.match(stopped.body.error, /replied STOP/);
});

test('texts need the consent box ticked, and /texts shows the opt-in without signing in', async (t) => {
  const { call } = app(t);
  const no = await call('POST', '/v1/auth/start', { phone: '5125550123' });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /Tick the box/);
  assert.equal((await call('POST', '/v1/auth/start', { phone: '5125550123', sms_consent: 'yes' })).status, 400, 'only a real yes counts');
  assert.equal((await call('POST', '/v1/auth/start', { phone: '5125550123', sms_consent: true })).status, 200);

  const page = await call('GET', '/texts');
  assert.equal(page.status, 200);
  const html = String(page.body);
  assert.match(html, /<input type="tel" id="phone"[^>]*required/, 'the phone field shows without clicking anything');
  assert.match(html, /<label class="agree" id="smsOkBox"><input type="checkbox" id="smsOk" name="sms_consent" value="yes">/, 'an unticked box, not hidden');
  // One form holds both: the labeled phone field and the consent box (and no email field).
  const form = html.match(/<form class="f" id="emailForm" name="sms_optin">([\s\S]*?)<\/form>/)[1];
  assert.match(form, /<label for="phone"[^>]*>Mobile phone number<\/label><input type="tel" id="phone" name="phone"/);
  assert.match(form, /name="sms_consent"/);
  assert.doesNotMatch(form, /type="email"/);
  assert.match(html, /I agree to receive texts from Spot\..*Msg frequency varies\. Msg &amp; data rates may apply\. Reply HELP for help, STOP to opt out\./);
  assert.match(html, /href="\/terms#texts"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(String((await call('GET', '/signin')).body), /id="smsOkBox" hidden/, 'on /signin it shows with the Text option');
});
