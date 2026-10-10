import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };

function app(t, env = {}) {
  const db = openDb(':memory:');
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    const v = await call('POST', '/v1/auth/verify', { email, code: start.body.code });
    return { cookie: v.headers['set-cookie'].split(';')[0] };
  };
  return { a, db, call, signIn };
}

test('staff: a confirmed @thefuturebasics.com email opens /admin and the health dashboard', async (t) => {
  const { db, call, signIn } = app(t);
  // No admin token set: /admin still exists, and points staff at sign-in.
  assert.match((await call('GET', '/admin')).body, /Sign in with your @thefuturebasics\.com email/);
  assert.doesNotMatch((await call('GET', '/admin')).body, /Paste the admin token/, 'no token box without a token');
  assert.equal((await call('GET', '/v1/admin/health')).status, 401);

  const kyle = await signIn('Kyle@TheFutureBasics.com');
  assert.equal((await call('GET', '/v1/admin/overview', undefined, kyle)).status, 200);
  assert.equal((await call('GET', '/v1/admin/health', undefined, kyle)).status, 200);
  assert.doesNotMatch((await call('GET', '/admin', undefined, kyle)).body, /Sign in with your/);

  // Anyone else, or a lookalike domain, is not staff.
  for (const email of ['kyle@gmail.com', 'kyle@thefuturebasics.com.evil.io', 'kyle@notthefuturebasics.com']) {
    const h = await signIn(email);
    assert.equal((await call('GET', '/v1/admin/health', undefined, h)).status, 401, email);
  }

  // An account that shows a company email Spot never checked (e.g. from Facebook) isn't staff.
  db.users.create('u-fb', 'boss@thefuturebasics.com');
  const tok = 'x'.repeat(43);
  const { createHash } = await import('node:crypto');
  db.sessions.create(createHash('sha256').update(tok).digest('hex'), 'u-fb', Date.now() + 3600_000);
  assert.equal((await call('GET', '/v1/admin/health', undefined, { cookie: `spot_session=${tok}` })).status, 401);
});

test('staff see Admin and Health on their account page (on any device); everyone else doesn’t', async (t) => {
  const { call, signIn } = app(t);
  const kyle = await signIn('kyle@thefuturebasics.com');
  const me = (await call('GET', '/v1/me', undefined, kyle)).body;
  assert.deepEqual(me.staff, { admin_url: '/admin', health_url: '/admin/health' });
  const page = (await call('GET', '/account', undefined, kyle)).body;
  assert.match(page, /id="staffBar"[^>]*hidden/, 'shown by the page only when /v1/me says staff');
  assert.match(page, /localStorage\.setItem\('spot:staff','1'\)/, 'remembered for the site menu');
  const home = (await call('GET', '/', undefined, kyle)).body;
  assert.match(home, /id="navAdminM" hidden>Admin<\/a>/, 'Admin in the menu, shown only for staff');
  assert.match(home, /id="navHealthM" hidden>Health<\/a>/);
  const other = await signIn('kyle@gmail.com');
  assert.equal((await call('GET', '/v1/me', undefined, other)).body.staff, undefined);
});

test('admin tables stack into cards on phones', async (t) => {
  const { call, signIn } = app(t);
  const page = (await call('GET', '/admin', undefined, await signIn('kyle@thefuturebasics.com'))).body;
  assert.match(page, /@media \(max-width:640px\)\{\n\.tw\{/);
  assert.match(page, /dataset\.label=hs\[i\]/, 'each cell carries its column name');
});

test('staff: SPOT_ADMIN_DOMAIN changes or turns off the domain', async (t) => {
  const other = app(t, { SPOT_ADMIN_DOMAIN: 'example.org' });
  const h = await other.signIn('ops@example.org');
  assert.equal((await other.call('GET', '/v1/admin/health', undefined, h)).status, 200);
  assert.equal((await other.call('GET', '/v1/admin/health', undefined, await other.signIn('kyle@thefuturebasics.com'))).status, 401);

  const off = app(t, { SPOT_ADMIN_DOMAIN: '' });
  assert.equal((await off.call('GET', '/admin')).status, 404);
});

test('health: stuck money, services, the $2 fee, Claude cost and traffic', async (t) => {
  const provider = sandboxProvider();
  // Spot's card is made before the hold; switching it on after the hold is
  // what can still fail once the payer has paid.
  let failIssue = false;
  const realActivate = provider.activateCard.bind(provider);
  provider.activateCard = async (ref, cents) => {
    if (failIssue) throw new Error('The v2 financial account id must be specified.');
    return realActivate(ref, cents);
  };
  const db = openDb(':memory:');
  const a = buildApp({ db, provider, cfg, logger: false, env: { STRIPE_SECRET_KEY: '', DUFFEL_ACCESS_TOKEN: 'duffel_live_x' } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const start = await call('POST', '/v1/auth/start', { email: 'ops@thefuturebasics.com' });
  const v = await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email: 'ops@thefuturebasics.com', code: start.body.code } });
  const staff = { cookie: v.headers['set-cookie'].split(';')[0] };
  const cart = { requester: { name: 'Kyle' }, merchant: { name: 'SKLZ', url: 'https://sklz.com' }, items: [{ title: 'Pro Mini Hoop', price_cents: 3499, url: 'https://sklz.com/products/pro-mini-hoop' }] };

  // One that went through (fee kept), one paid whose card never issued.
  const ok = (await call('POST', '/v1/carts', cart)).body.cart;
  assert.equal((await call('POST', `/v1/carts/${ok.token}/sandbox-pay`, { payer_name: 'Mom' })).status, 200);
  failIssue = true;
  const stuck = (await call('POST', '/v1/carts', cart)).body.cart;
  await call('POST', `/v1/carts/${stuck.token}/sandbox-pay`, {});
  db.raw.prepare("UPDATE carts SET doc = json_set(doc, '$.paid_at', ?) WHERE token = ?").run(Date.now() - 30 * 60_000, stuck.token);

  // Claude usage as capture.js reports it; a failing email service.
  a.metrics.ai('claude-opus-5-20261001', { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 3 } });
  a.metrics.ok('anthropic');
  a.metrics.fail('duffel', 'HTTP 401 for key sk_live_secret123');

  const page = await call('GET', '/admin/health', undefined, staff);
  assert.equal(page.status, 200);
  assert.match(page.body, /Spot health/);
  const h = (await call('GET', '/v1/admin/health', undefined, staff)).body;
  assert.equal(h.status, 'attention');
  assert.equal(h.stuck.length, 1);
  assert.equal(h.stuck[0].token, stuck.token);
  assert.match(h.stuck[0].why[0], /card wasn't issued: The v2 financial account id must be specified/);
  assert.equal(h.revenue.fee.cents, 200, "Spot's $2 on the one that went through");
  assert.equal(h.revenue.fee.asks, 1);
  const opus = h.ai.models.find((m) => m.model.startsWith('claude-opus-5'));
  assert.equal(opus.in, 1_000_000);
  assert.equal(Math.round(opus.cents), 500 + 250, '$5/M in + $25/M out');
  assert.equal(h.ai.web_searches, 3);
  assert.equal(Math.round(h.ai.cents), 753);
  const duffel = h.services.find((s) => s.name === 'duffel');
  assert.equal(duffel.state, 'failing');
  assert.match(duffel.error, /HTTP 401/);
  assert.doesNotMatch(duffel.error, /secret123/, 'keys never show');
  assert.equal(h.services.find((s) => s.name === 'stripe').state, 'off');
  assert.equal(h.services.find((s) => s.name === 'anthropic').state, 'off', 'not configured here, whatever was recorded');
  assert.ok(h.traffic.requests > 0, 'requests are counted');
  assert.equal(h.funnel.at(-1).made, 2);
  assert.doesNotMatch(JSON.stringify(h), /duffel_live_x|secret123/, 'no settings values in the report');
});

test('health records every service a purchase touches, and a card that failed to issue is retried on its own', async (t) => {
  const provider = sandboxProvider();
  let failIssue = true;
  const realActivate = provider.activateCard.bind(provider);
  provider.activateCard = async (ref, cents) => {
    if (failIssue) throw new Error('The v2 financial account id must be specified.');
    return realActivate(ref, cents);
  };
  const db = openDb(':memory:');
  const a = buildApp({ db, provider, cfg, logger: false, env: {} });
  t.after(() => a.close());
  const cart = { requester: { name: 'Kyle' }, merchant: { name: 'SKLZ', url: 'https://sklz.com' }, items: [{ title: 'Pro Mini Hoop', price_cents: 3499 }] };
  const made = (await a.inject({ method: 'POST', url: '/v1/carts', payload: cart })).json().cart;
  await a.inject({ method: 'POST', url: `/v1/carts/${made.token}/sandbox-pay`, payload: {} });
  let s = a.metrics.services();
  assert.ok(s.stripe.ok_at, 'the payment counts as Stripe payments');
  assert.ok(s.issuing.fail_at, 'the card counts as Stripe Issuing');
  assert.match(s.issuing.error, /v2 financial account/);

  // The provider is fixed; nobody opens the page; the sweeper finishes it.
  failIssue = false;
  db.raw.prepare("UPDATE cart_events SET at = at - 600000 WHERE kind = 'issue_failed'").run();
  await a.spot.sweepIssue();
  const after = (await a.inject({ method: 'GET', url: `/v1/carts/${made.token}` })).json().cart;
  assert.equal(after.status, 'card_issued');
  s = a.metrics.services();
  // Same-millisecond fail and retry are possible here; the dashboard reads a tie as working.
  assert.ok(s.issuing.ok_at >= s.issuing.fail_at, 'Issuing reads as working again');
});
