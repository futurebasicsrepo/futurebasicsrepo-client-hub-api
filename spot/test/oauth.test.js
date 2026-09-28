import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const env = { GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', FACEBOOK_APP_ID: 'fbid', FACEBOOK_APP_SECRET: 'fbsecret', PUBLIC_URL: 'https://spotmeplease.com' };

// Stand-ins for Google's and Facebook's servers.
function providers({ google = {}, facebook = {} } = {}) {
  const calls = [];
  const oauthFetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, init, body: init.body ? new URLSearchParams(String(init.body)) : null });
    const ok = (b) => Response.json(b);
    if (u.href === 'https://oauth2.googleapis.com/token') return google.tokenFail ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : ok({ access_token: 'g_at', id_token: 'x' });
    if (u.href === 'https://openidconnect.googleapis.com/v1/userinfo') return ok({ sub: 'g-123', email: 'kyle@example.com', email_verified: true, name: 'Kyle Riggle', ...google.me });
    if (u.pathname.endsWith('/oauth/access_token')) return ok({ access_token: 'fb_at' });
    if (u.pathname.endsWith('/me')) return ok({ id: 'fb-9', name: 'Kyle R', email: 'kyle@example.com', ...facebook.me });
    return new Response('nope', { status: 404 });
  };
  return { calls, oauthFetch };
}

function app(t, opts = {}) {
  const fake = providers(opts);
  const a = buildApp({ db: opts.db || openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { ...env, ...opts.env }, oauthFetch: fake.oauthFetch });
  t.after(() => a.close());
  const get = (url, cookie) => a.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  const cookies = (r) => [r.headers['set-cookie']].flat().filter(Boolean).map((c) => c.split(';')[0]);
  // Start → provider → callback, like a browser would.
  const signIn = async (provider, { next = '/account', state, code = 'the-code' } = {}) => {
    const start = await get(`/auth/${provider}/start?next=${encodeURIComponent(next)}`);
    const to = new URL(start.headers.location);
    const flow = cookies(start).find((c) => c.startsWith('spot_oauth='));
    const cb = await get(`/auth/${provider}/callback?code=${code}&state=${state ?? to.searchParams.get('state')}`, flow);
    return { start, to, flow, cb, session: cookies(cb).find((c) => /^spot_session=.+/.test(c)) };
  };
  return { a, get, signIn, cookies, ...fake };
}

test('Google: redirect with PKCE, callback signs you in and lands on next', async (t) => {
  const { signIn, get, calls } = app(t);
  const { start, to, cb, session } = await signIn('google', { next: '/c/abc/manage' });
  assert.equal(start.statusCode, 302);
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('client_id'), 'gid');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://spotmeplease.com/auth/google/callback');
  assert.equal(to.searchParams.get('scope'), 'openid email profile');
  assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
  assert.match(start.headers['set-cookie'], /spot_oauth=.+; Path=\/auth; HttpOnly; SameSite=Lax; Max-Age=600; Secure/);

  assert.equal(cb.statusCode, 302);
  assert.equal(cb.headers.location, '/c/abc/manage');
  assert.ok(session, 'session cookie set');
  const tokenCall = calls.find((c) => c.url.href === 'https://oauth2.googleapis.com/token');
  const verifier = tokenCall.body.get('code_verifier');
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), to.searchParams.get('code_challenge'), 'PKCE verifier matches');
  assert.equal(tokenCall.body.get('client_secret'), 'gsecret');

  const me = (await get('/v1/me', session)).json();
  assert.equal(me.user.email, 'kyle@example.com');
  assert.equal(me.user.name, 'Kyle Riggle');
});

test('Facebook: same email reaches the same account; the app secret proof is sent', async (t) => {
  const { signIn, get, calls, a } = app(t);
  // First an email-code account.
  const start = await a.inject({ method: 'POST', url: '/v1/auth/start', payload: { email: 'kyle@example.com' } });
  const v = await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email: 'kyle@example.com', code: start.json().code } });
  const emailSession = v.headers['set-cookie'].split(';')[0];
  await a.inject({ method: 'POST', url: '/v1/carts', headers: { cookie: emailSession }, payload: { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 100 }] } });

  const fb = await signIn('facebook');
  assert.match(fb.to.href, /^https:\/\/www\.facebook\.com\/v[\d.]+\/dialog\/oauth\?/);
  assert.equal(fb.to.searchParams.get('scope'), 'email,public_profile');
  const me = (await get('/v1/me', fb.session)).json();
  assert.equal(me.carts.length, 1, 'the Spot made with the email code is there');
  const meCall = calls.find((c) => c.url.pathname.endsWith('/me'));
  assert.equal(meCall.url.searchParams.get('appsecret_proof'), createHmac('sha256', 'fbsecret').update('fb_at').digest('hex'));

  // Signing in with Google later: still the same account.
  const g = await signIn('google');
  assert.equal((await get('/v1/me', g.session)).json().carts.length, 1);
});

test('a returning Google user is found by their Google id even if the email changed', async (t) => {
  const db = openDb(':memory:');
  const first = app(t, { db });
  const before = (await first.get('/v1/me', (await first.signIn('google')).session)).json();
  const later = app(t, { db, google: { me: { email: 'new@example.com', name: 'K' } } });
  const after = (await later.get('/v1/me', (await later.signIn('google')).session)).json();
  assert.equal(after.user.email, before.user.email, 'same account');
  assert.equal(after.user.name, 'Kyle Riggle', 'an existing name is kept');
});

test('refusals: tampered or missing flow, wrong state, unverified email, no email, provider error, not configured', async (t) => {
  const { signIn, get } = app(t, { google: { me: { email_verified: false, email: 'someone@example.com', sub: 'g-new' } }, facebook: { me: { email: undefined, id: 'fb-noemail' } } });
  const wrongState = await signIn('facebook', { state: 'nope' });
  assert.match(wrongState.cb.headers.location, /^\/signin\?error=expired/);
  assert.equal(wrongState.session, undefined);

  const { to, flow } = await signIn('facebook');
  const tampered = flow.replace(/\.[\w-]+$/, '.AAAA');
  assert.match((await get(`/auth/facebook/callback?code=x&state=${to.searchParams.get('state')}`, tampered)).headers.location, /error=expired/);
  assert.match((await get(`/auth/facebook/callback?code=x&state=${to.searchParams.get('state')}`)).headers.location, /error=expired/, 'no flow cookie');

  assert.match((await signIn('google')).cb.headers.location, /error=no_email/, 'unverified Google email is not trusted');
  assert.match((await signIn('facebook')).cb.headers.location, /error=no_email/);
  assert.match((await get('/auth/google/callback?error=access_denied')).headers.location, /error=cancelled/);

  const bare = app(t, { env: { GOOGLE_CLIENT_ID: '', FACEBOOK_APP_ID: '' } });
  assert.match((await bare.get('/auth/google/start')).headers.location, /error=unavailable/);
  assert.ok(!(await bare.get('/signin')).body.includes('Continue with Google'), 'no buttons when not configured');
});

test('Google exchange failure and the sign-in page order', async (t) => {
  const { signIn, get } = app(t, { google: { tokenFail: true } });
  assert.match((await signIn('google')).cb.headers.location, /error=failed/);
  const page = (await get('/signin')).body;
  assert.ok(page.indexOf('id="emailForm"') < page.indexOf('Continue with Google'), 'email (passwordless) comes first');
  assert.ok(page.indexOf('Continue with Google') < page.indexOf('Continue with Facebook'));
});
