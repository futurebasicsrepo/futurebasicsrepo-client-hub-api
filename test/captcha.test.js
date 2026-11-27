import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCaptcha, captchaConfig, CAPTCHA_WORDS } from '../src/captcha.js';

const KEYS = { TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key' };
const answer = out => async (url, opts) => { answer.last = { url, body: Object.fromEntries(opts.body) }; return { ok: true, json: async () => out }; };

test('the captcha is off until both keys are set, so the form and the check switch on together', async () => {
  assert.deepEqual(captchaConfig({}), { on: false });
  assert.deepEqual(captchaConfig({ TURNSTILE_SITE_KEY: 'site-key' }), { on: false }, 'a site key alone shows nothing');
  assert.deepEqual(captchaConfig({ TURNSTILE_SECRET_KEY: 'secret-key' }), { on: false }, 'a secret alone checks nothing');
  assert.equal(captchaConfig(KEYS).siteKey, 'site-key');
  let called = false;
  assert.deepEqual(await checkCaptcha('', '1.2.3.4', { env: {}, fetchImpl: async () => { called = true; } }), { ok: true, unchecked: true });
  assert.equal(called, false, 'with the captcha off nothing is sent to Cloudflare');
});

test('with the keys set, a brief needs an answer Cloudflare accepts', async () => {
  assert.deepEqual(await checkCaptcha('', '1.2.3.4', { env: KEYS, fetchImpl: answer({ success: true }) }), { ok: false, error: CAPTCHA_WORDS }, 'no answer is refused');
  assert.equal((await checkCaptcha('x'.repeat(3000), null, { env: KEYS, fetchImpl: answer({ success: true }) })).ok, false, 'an over-long answer is refused');
  const good = await checkCaptcha('token-1', '1.2.3.4', { env: KEYS, fetchImpl: answer({ success: true }) });
  assert.deepEqual(good, { ok: true });
  assert.match(answer.last.url, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/);
  assert.deepEqual(answer.last.body, { secret: 'secret-key', response: 'token-1', remoteip: '1.2.3.4' });
  const bad = await checkCaptcha('token-2', '1.2.3.4', { env: KEYS, fetchImpl: answer({ success: false, 'error-codes': ['invalid-input-response'] }) });
  assert.equal(bad.ok, false); assert.equal(bad.error, CAPTCHA_WORDS); assert.deepEqual(bad.codes, ['invalid-input-response']);
  assert.match(CAPTCHA_WORDS, /security check/, 'the refusal tells the person what to do');
});

test('when Cloudflare cannot be reached the brief goes on to the screening, not back to the person', async () => {
  const warned = [];
  const down = await checkCaptcha('token-3', null, { env: KEYS, fetchImpl: async () => { throw new Error('ECONNRESET'); }, log: { warn: (o, m) => warned.push(m) } });
  assert.deepEqual(down, { ok: true, unchecked: true });
  assert.equal(warned.length, 1);
  const err = await checkCaptcha('token-4', null, { env: KEYS, fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual(err, { ok: true, unchecked: true });
});
