// Passkeys end to end in a real browser, with Chromium's virtual
// authenticator standing in for Face ID. Skipped where Chromium isn't installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath()) && !existsSync('/opt/pw-browsers/chromium')) chromium = null;
} catch {
  chromium = null;
}
const launch = () => chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: '/opt/pw-browsers/chromium' });

test('🔑 add a passkey on /account, sign out, sign back in with it', { skip: !chromium && 'no Chromium' }, async (t) => {
  const db = openDb(':memory:');
  const app = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env: {} });
  await app.listen({ port: 0, host: '127.0.0.1' });
  t.after(() => app.close());
  const base = `http://localhost:${app.server.address().port}`;
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId: auth } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  // Sign in with a code (test mode shows it and fills it in).
  await page.goto(`${base}/signin`);
  await page.fill('#email', 'kyle@example.com');
  await page.click('#sendBtn');
  await page.locator('#codeForm button.btn').click();
  await page.waitForURL(`${base}/account`);

  await page.click('[data-tab=signin]'); // passkeys live under the Sign-in tab
  await page.locator('#addPk').click();
  await page.locator('#pks .trav').waitFor();
  const user = db.users.byEmail('kyle@example.com');
  const saved = db.passkeys.ofUser(user.id);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'This device');

  await page.click('#out');
  await page.waitForURL(`${base}/`);
  assert.equal((await page.request.get(`${base}/v1/me`)).status(), 401);

  // Autofill (conditional UI): the saved passkey is offered in the email
  // box; the virtual authenticator picks it, and you're in.
  await page.goto(`${base}/signin`);
  await page.waitForURL(`${base}/account`);
  await page.click('#out');
  await page.waitForURL(`${base}/`);

  // The button, with autofill held back so it doesn't win first.
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: auth, enabled: false });
  await page.goto(`${base}/signin`);
  await page.locator('#pkBtn').waitFor();
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: auth, enabled: true });
  await page.locator('#pkBtn').click();
  await page.waitForURL(`${base}/account`);
  await page.locator('#who').filter({ hasText: 'kyle@example.com' }).waitFor();
  assert.ok(db.passkeys.get(saved[0].id).used_at, 'last-used is recorded');

  // Removing it: the next passkey sign-in is refused with a clear message.
  page.once('dialog', (d) => d.accept());
  await page.click('[data-tab=signin]');
  await page.locator('[data-pk]').click();
  await page.locator('#pks .trav').waitFor({ state: 'detached' });
  assert.equal(db.passkeys.ofUser(user.id).length, 0);
  await page.click('#out');
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/signin`);
  await page.locator('#pkBtn').click();
  await page.locator('#err').filter({ hasText: 'isn’t linked to a Spot account' }).waitFor();
});

test('🔑 passkey API: signed-in only, JSON only, challenges are single use', async (t) => {
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(() => app.close());
  const call = (url, payload, headers = {}) => app.inject({ method: 'POST', url, payload, headers });
  assert.equal((await call('/v1/me/passkeys/options', {})).statusCode, 401);
  assert.equal((await call('/v1/auth/passkey/options', 'x', { 'content-type': 'text/plain' })).statusCode, 415);
  const opt = (await call('/v1/auth/passkey/options', {})).json();
  assert.equal(opt.options.allowCredentials.length, 0, 'discoverable: no email needed first');
  const fake = { id: 'nope', rawId: 'nope', type: 'public-key', response: {}, clientExtensionResults: {} };
  const first = await call('/v1/auth/passkey/verify', { challenge_id: opt.challenge_id, response: fake });
  assert.equal(first.statusCode, 401);
  assert.match(first.json().error, /isn’t linked to a Spot account/);
  const again = await call('/v1/auth/passkey/verify', { challenge_id: opt.challenge_id, response: fake });
  assert.match(again.json().error, /took too long/, 'the challenge was used up');
});
