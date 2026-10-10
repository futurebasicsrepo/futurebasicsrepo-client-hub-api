// Launch pass: the quick start, the standards page, reporting a link, and the home page's paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const ADMIN = 'admin-token-0123456789';

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_ADMIN_TOKEN: ADMIN } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}, remoteAddress) => {
    const r = await a.inject({ method, url, payload, headers, ...(remoteAddress ? { remoteAddress } : {}) });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call };
}
const cart = { requester: { name: 'Kyle' }, merchant: { name: 'SKLZ', url: 'https://sklz.com' }, items: [{ title: 'Pro Mini Hoop', price_cents: 3499 }] };

test('home: two clear ways in, one use-case grid, standards, and no waitlist at the end', async (t) => {
  const { call } = app(t);
  const home = (await call('GET', '/')).body;
  assert.match(home, /class="btn primary" href="\/connect">Add Spot to your AI →/, 'the AI path goes to the quick start');
  assert.match(home, /href="\/new">Make a Spot/);
  assert.match(home, /id="ask"/);
  for (const s of ['Flights', 'Trains', 'Any store’s cart', 'Several stores, one link', 'Family']) assert.ok(home.includes(`<h3>${s}</h3>`), s);
  assert.doesNotMatch(home, /id="for-you"/, 'the second how-it-works is gone');
  assert.doesNotMatch(home, /Want in early/);
  assert.match(home, /Go ask for the thing/);
  assert.match(home, /Built on open standards/);
  assert.match(home, /href="\/standards#ucp">UCP <small>2026-08-25<\/small>/);
  assert.match(home, /href="\/standards#pap">PAP <small>draft 0\.1<\/small>/);
  assert.match(home, /<summary>See the 7 tools<\/summary>/);
  assert.doesNotMatch(home, /href="#join" data-kind/, 'API keys are self-serve, not a waitlist');
  assert.match(home, /href="\/connect">Add to your AI/, 'in the nav');
});

test('/connect: copy one link, paste it, Allow with caps, then tap a prompt', async (t) => {
  const { call } = app(t);
  const r = await call('GET', '/connect');
  assert.equal(r.status, 200);
  assert.match(r.body, /<code id="mcpLink">http:\/\/localhost(:80)?\/mcp<\/code>/);
  assert.match(r.body, /Add custom connector/);
  assert.match(r.body, /href="https:\/\/claude\.ai\/settings\/connectors"/);
  assert.match(r.body, /Developer mode/, 'ChatGPT steps');
  assert.match(r.body, /\$100 an order, \$500 a month/);
  assert.match(r.body, /data-copy="Find a highly rated over-the-door basketball hoop/);
  assert.match(r.body, /Your AI never sees a card number/);
});

test('/standards: every protocol with its version and a live link that works', async (t) => {
  const { call } = app(t);
  const r = await call('GET', '/standards');
  assert.equal(r.status, 200);
  for (const name of ['Model Context Protocol (MCP)', 'Universal Commerce Protocol (UCP)', 'Personal Agent Protocol (PAP)', 'HTTP Message Signatures (Web Bot Auth)', 'Signed approvals (JWS)', 'Passkeys (WebAuthn)']) assert.ok(r.body.includes(name), name);
  assert.match(r.body, /Draft 0\.1/, 'drafts are labeled as drafts');
  assert.match(r.body, /isn’t a certification/);
  const links = [...r.body.matchAll(/class="checks">([\s\S]*?)<\/div>/g)].flatMap((m) => [...m[1].matchAll(/href="([^"]+)"/g)].map((x) => x[1]));
  assert.ok(links.length >= 7);
  for (const href of links) {
    const res = await call('GET', href);
    assert.ok([200, 401, 405].includes(res.status), `${href} answers (${res.status})`);
  }
});

test('report a link: one report noted, two people pause it, Spot can clear it', async (t) => {
  const { call } = app(t);
  const made = (await call('POST', '/v1/carts', cart)).body.cart;
  const page = (await call('GET', `/c/${made.token}`)).body;
  assert.match(page, /Don’t know Kyle\? Report this link/);

  assert.deepEqual((await call('POST', `/v1/carts/${made.token}/report`, { reason: 'unknown_sender' }, {}, '203.0.113.5')).body, { ok: true, paused: false });
  assert.equal((await call('POST', `/v1/carts/${made.token}/report`, {}, {}, '203.0.113.5')).body.paused, false, 'the same person twice is one report');
  assert.equal((await call('POST', `/v1/carts/${made.token}/sandbox-pay`, {})).status, 200, 'still payable after one report');

  const other = (await call('POST', '/v1/carts', cart)).body.cart;
  await call('POST', `/v1/carts/${other.token}/report`, {}, {}, '203.0.113.5');
  assert.equal((await call('POST', `/v1/carts/${other.token}/report`, {}, {}, '198.51.100.7')).body.paused, true);
  const pay = await call('POST', `/v1/carts/${other.token}/sandbox-pay`, {});
  assert.equal(pay.status, 423);
  assert.match(pay.body.error, /paused while Spot checks it/);
  const paused = (await call('GET', `/c/${other.token}`)).body;
  assert.match(paused, /this link is paused/);
  assert.doesNotMatch(paused, /id="go"/, 'no pay button');

  const admin = { authorization: `Bearer ${ADMIN}` };
  const ov = (await call('GET', '/v1/admin/overview', undefined, admin)).body;
  const row = ov.reported.find((x) => x.token === other.token);
  assert.equal(row.reports, 2);
  assert.equal(row.paused, true);
  assert.equal((await call('POST', `/v1/admin/carts/${row.id}/clear-reports`, {}, { ...admin, 'content-type': 'application/json' })).status, 200);
  assert.equal((await call('POST', `/v1/carts/${other.token}/sandbox-pay`, {})).status, 200, 'payable again');

  const self = (await call('POST', '/v1/carts', { ...cart, for: 'self' })).body.cart;
  assert.equal((await call('POST', `/v1/carts/${self.token}/report`, {})).status, 400);
});

// iPhone Safari zooms in on any field under 16px when it's tapped, and the
// page then slides left and right. Every field on these pages is 16px or more.
test('phones: no text field small enough to make Safari zoom in', async (t) => {
  const { call } = app(t);
  const pages = ['/', '/integrations', '/connect', '/standards', '/new', '/signin', '/account', '/agent-card', '/texts', '/for-stores', `/admin?token=${ADMIN}`];
  for (const p of pages) {
    const html = (await call('GET', p)).body;
    for (const rule of html.match(/[^{}]*(?:^|[\s,>}(])(?:input|select|textarea)(?![-\w])[^{}]*\{[^}]*\}/g) || []) {
      const px = [...rule.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      for (const n of px) assert.ok(n >= 16, `${p}: ${rule.trim().slice(0, 90)}`);
    }
  }
});
