import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { accessIssuer, staffGateConfig, createStaffGate, ACCESS_HEADER } from '../src/staff-gate.js';
import { configChecks } from '../src/platform.js';

const ENV = { CF_ACCESS_TEAM_DOMAIN: 'futurebasics', CF_ACCESS_AUD: 'aud-tag-123' };
const ISS = 'https://futurebasics.cloudflareaccess.com';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const other = await generateKeyPair('RS256');
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
const sign = ({ key = privateKey, iss = ISS, aud = ENV.CF_ACCESS_AUD, exp = '5m', email = 'kyle@thefuturebasics.com' } = {}) =>
  new SignJWT({ email }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(key);
const req = assertion => ({ headers: assertion ? { [ACCESS_HEADER]: assertion } : {}, url: '/v1/admin/dashboard' });

test('the team can be named by its short name, its host or its URL', () => {
  for (const v of ['futurebasics', 'futurebasics.cloudflareaccess.com', 'https://FutureBasics.cloudflareaccess.com/', ' futurebasics '])
    assert.equal(accessIssuer(v), ISS, v);
  assert.equal(accessIssuer(''), '');
});

test('the gate stays off until both values are set, and says when only one is', () => {
  assert.equal(createStaffGate({}), null);
  assert.equal(createStaffGate({ CF_ACCESS_TEAM_DOMAIN: 'futurebasics' }), null);
  assert.equal(staffGateConfig({ CF_ACCESS_AUD: 'x' }).partial, true);
  assert.equal(staffGateConfig(ENV).mode, 'enforce');
  assert.equal(staffGateConfig({ ...ENV, CF_ACCESS_MODE: 'LOG' }).mode, 'log');
  assert.equal(staffGateConfig({ ...ENV, CF_ACCESS_MODE: 'anything-else' }).mode, 'enforce');
});

test('a request Cloudflare Access signed for this application passes', async () => {
  const gate = createStaffGate(ENV, { jwks });
  assert.deepEqual(await gate.check(req(await sign())), { ok: true, email: 'kyle@thefuturebasics.com' });
});

test('a request that skipped Cloudflare, or carries someone else\'s assertion, is refused', async () => {
  const gate = createStaffGate(ENV, { jwks });
  assert.deepEqual(await gate.check(req()), { ok: false, reason: 'missing' });
  assert.equal((await gate.check(req('not-a-jwt'))).reason, 'invalid');
  assert.equal((await gate.check(req(await sign({ aud: 'another-app' })))).reason, 'invalid');
  assert.equal((await gate.check(req(await sign({ iss: 'https://someone-else.cloudflareaccess.com' })))).reason, 'invalid');
  assert.equal((await gate.check(req(await sign({ key: other.privateKey })))).reason, 'invalid');
  assert.equal((await gate.check(req(await sign({ exp: Math.floor(Date.now() / 1000) - 120 })))).reason, 'expired');
});

test('watch-only mode reports each kind of miss at most once a minute', () => {
  const lines = [], gate = createStaffGate({ ...ENV, CF_ACCESS_MODE: 'log' }, { jwks, log: { warn: (o, m) => lines.push([o, m]) } });
  assert.equal(gate.mode, 'log');
  gate.report(req(), 'missing'); gate.report(req(), 'missing'); gate.report(req(), 'expired');
  assert.deepEqual(lines.map(([o]) => o.staffGate), ['missing', 'expired']);
  assert.equal(lines[0][0].path, '/v1/admin/dashboard');
});

test('the settings page shows whether the gate is on', () => {
  const row = env => configChecks({ env, billing: { effective: false, mode: 'auto' }, shopifyConfigured: () => false }).find(r => r.id === 'staffgate');
  assert.equal(row({}).status, 'info');
  assert.equal(row({ CF_ACCESS_AUD: 'x' }).status, 'warn');
  assert.equal(row({ ...ENV, CF_ACCESS_MODE: 'log' }).status, 'warn');
  const on = row(ENV);
  assert.equal(on.status, 'ok');
  assert.match(on.detail, /futurebasics\.cloudflareaccess\.com/);
  assert.doesNotMatch(on.detail, /aud-tag-123/);
});
