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

// ─── Invites ─────────────────────────────────────────────────────────────────
function inviteApp(t, env = {}) {
  const db = openDb(':memory:');
  const mail = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend.com')) mail.push(JSON.parse(init.body));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, notifyFetch, env: { SPOT_AGENT: 'off', SITE_GATE: 'on', RESEND_API_KEY: 're_test', ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers: { accept: 'text/html', ...headers } });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    const code = start.body.code || mail.at(-1)?.text?.match(/\b(\d{6})\b/)?.[1];
    const v = await call('POST', '/v1/auth/verify', { email, code });
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  return { db, call, signIn, mail };
}
const cookieOf = (r) => r.headers['set-cookie'].split(';')[0];

test('invites: staff invite someone; the emailed link lets that browser past the gate', async (t) => {
  const { call, signIn, mail } = inviteApp(t);
  assert.equal((await call('POST', '/v1/admin/invites', { emails: ['friend@example.com'] })).status, 401, 'staff only');
  const staff = await signIn('kyle@thefuturebasics.com');
  const sent = await call('POST', '/v1/admin/invites', { emails: ['Friend@Example.com'] }, staff);
  assert.equal(sent.status, 200);
  const [r] = sent.body.results;
  assert.equal(r.email, 'friend@example.com');
  assert.equal(r.status, 'sent');
  const email = mail.find((m) => m.to[0] === 'friend@example.com');
  assert.match(email.subject, /You’re in/);
  assert.ok(email.html.includes(r.link) && email.text.includes(r.link), 'the link is in the email');
  assert.match(email.html, /assets\/email-spot\.gif\?v=/, 'with Spot waving');
  assert.match(email.html, /Sign in at spotmeplease\.com with <b>friend@example\.com<\/b>, the email your invite was approved for/, 'names the approved email');
  assert.equal((await call('POST', '/v1/admin/invites', { emails: ['friend@example.com'] }, staff)).body.results[0].status, 'already_invited');

  const path = new URL(r.link).pathname;
  const open = await call('GET', path);
  assert.equal(open.status, 302);
  assert.equal(open.headers.location, '/?welcome=1');
  assert.match(open.headers['set-cookie'], /spot_invite=.*HttpOnly/);
  assert.equal(open.headers['referrer-policy'], 'no-referrer', 'the token never leaks in a Referer');
  const cookie = cookieOf(open);
  assert.ok(!gated(await call('GET', '/', undefined, { cookie })), 'invited browser sees the site');
  assert.ok(gated(await call('GET', '/')), 'everyone else still sees early access');

  // The admin list shows it opened.
  const ov = await call('GET', '/v1/admin/overview', undefined, staff);
  const row = ov.body.signups.find((s) => s.email === 'friend@example.com');
  assert.equal(row.kind, 'invited directly');
  assert.ok(row.invite.opened_at);
});

test('invites: a link works on 3 devices; signing in with the invited email works anywhere; withdrawing turns it all off', async (t) => {
  const { call, signIn } = inviteApp(t);
  const staff = await signIn('kyle@thefuturebasics.com');
  const { link } = (await call('POST', '/v1/admin/invites', { emails: ['pal@example.com'] }, staff)).body.results[0];
  const path = new URL(link).pathname;
  const first = cookieOf(await call('GET', path));
  for (let i = 0; i < 2; i++) assert.equal((await call('GET', path)).status, 302);
  assert.equal((await call('GET', path, undefined, { cookie: first })).status, 302, 'reopening on the same browser is free');
  const fourth = await call('GET', path);
  assert.equal(fourth.status, 200);
  assert.match(fourth.body, /already been opened on a few devices/);
  assert.match(fourth.body, /p•••@example\.com/);

  const pal = await signIn('pal@example.com');
  assert.ok(!gated(await call('GET', '/', undefined, pal)), 'signed in with the invited email');

  // A resend is a fresh link; the old browser keeps working.
  const again = (await call('POST', '/v1/admin/invites', { emails: ['pal@example.com'], resend: true }, staff)).body.results[0];
  assert.notEqual(again.link, link);
  assert.ok(!gated(await call('GET', '/', undefined, { cookie: first })));

  assert.equal((await call('POST', '/v1/admin/invites/revoke', { email: 'pal@example.com' }, staff)).status, 200);
  assert.ok(gated(await call('GET', '/', undefined, { cookie: first })), 'withdrawn: the cookie stops working');
  assert.ok(gated(await call('GET', '/', undefined, pal)), 'withdrawn: signing in does too');
  assert.equal((await call('GET', new URL(again.link).pathname)).status, 404);
  assert.equal((await call('GET', '/invite/not-a-real-token')).status, 404);
});

test('invites: "invite the next 10" takes the list in signup order, once each', async (t) => {
  const { call, signIn, mail } = inviteApp(t);
  for (const e of ['one@example.com', 'two@example.com']) await call('POST', '/v1/waitlist', { email: e, kind: 'asker' });
  await call('POST', '/v1/waitlist', { email: 'one@example.com', kind: 'agent' });
  const staff = await signIn('kyle@thefuturebasics.com');
  assert.equal((await call('GET', '/v1/admin/overview', undefined, staff)).body.invite_waiting, 2);
  const r = await call('POST', '/v1/admin/invites', { next: 10 }, staff);
  assert.deepEqual(r.body.results.map((x) => x.email), ['one@example.com', 'two@example.com']);
  assert.equal(mail.filter((m) => /You’re in/.test(m.subject)).length, 2);
  assert.equal((await call('GET', '/v1/admin/overview', undefined, staff)).body.invite_waiting, 0);
  assert.equal((await call('POST', '/v1/admin/invites', { next: 10 }, staff)).status, 400, 'no one left');
});

test('invites: without email set up, the link comes back to share by hand', async (t) => {
  const { call, signIn } = inviteApp(t, { RESEND_API_KEY: '' });
  const staff = await signIn('kyle@thefuturebasics.com');
  const [r] = (await call('POST', '/v1/admin/invites', { emails: ['nomail@example.com'] }, staff)).body.results;
  assert.equal(r.status, 'not_configured');
  assert.match(r.link, /\/invite\/[A-Za-z0-9_-]{43}$/);
});

test('invites: once in, the account stays in on every device, however they sign in', async (t) => {
  const { call, signIn } = inviteApp(t);
  const staff = await signIn('kyle@thefuturebasics.com');
  const { link } = (await call('POST', '/v1/admin/invites', { emails: ['pal@example.com'] }, staff)).body.results[0];
  const invited = cookieOf(await call('GET', new URL(link).pathname));
  const byPhone = async (phone) => {
    const start = await call('POST', '/v1/auth/start', { phone, sms_consent: true });
    const v = await call('POST', '/v1/auth/verify', { phone, code: start.body.code });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  // Signed in by text (no email on the account) on the invited phone…
  const me = await byPhone('5125550101');
  assert.ok(gated(await call('GET', '/new', undefined, me)), 'not in yet on a fresh browser');
  assert.ok(!gated(await call('GET', '/new', undefined, { cookie: `${invited}; ${me.cookie}` })));
  // …and now on another device with no invite link (a passkey, a new browser).
  assert.ok(!gated(await call('GET', '/new', undefined, me)), 'the account is in now');
  assert.equal((await call('POST', '/v1/admin/invites/revoke', { email: 'pal@example.com' }, staff)).status, 200);
  assert.ok(gated(await call('GET', '/new', undefined, me)), 'withdrawn: the account is out too');
});

test('invites: joining two accounts keeps the confirmed email, so the gate still knows them', async (t) => {
  const { call, signIn } = inviteApp(t);
  const staff = await signIn('kyle@thefuturebasics.com');
  await call('POST', '/v1/admin/invites', { emails: ['pal@example.com'] }, staff);
  const link = async (cookie, to) => {
    const start = await call('POST', '/v1/me/link/start', { ...to, sms_consent: true }, cookie);
    assert.equal(start.status, 200, JSON.stringify(start.body));
    return call('POST', '/v1/me/link/verify', { ...to, code: start.body.code }, cookie);
  };
  // The email account adds a phone; a text-only account then adds that same
  // phone, so the email account is folded into the text-only one.
  const email = await signIn('pal@example.com');
  assert.equal((await link(email, { phone: '5125550102' })).status, 200);
  const start = await call('POST', '/v1/auth/start', { phone: '5125550103', sms_consent: true });
  const v = await call('POST', '/v1/auth/verify', { phone: '5125550103', code: start.body.code });
  const other = { cookie: v.headers['set-cookie'].split(';')[0] };
  const joined = await link(other, { phone: '5125550102' });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.merged, true);
  assert.equal(joined.body.user.email, 'pal@example.com');
  assert.ok(!gated(await call('GET', '/new', undefined, other)), 'still in after the accounts joined');
});
