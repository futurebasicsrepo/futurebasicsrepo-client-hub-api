// Notifications without a texting service: web push to the devices an
// account turned on, and the account's email when a text can't go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { createNotifier, pushFrom } from '../src/notify.js';
import { encrypt, okEndpoint, vapidAuth, vapidKeys } from '../src/webpush.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMPU1L';

// A browser: its key pair and auth secret, and how it reads a push.
function browser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    sub: { endpoint: ENDPOINT, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } },
    read(body) {
      const salt = body.subarray(0, 16);
      assert.equal(body.readUInt32BE(16), 4096);
      const asPublic = body.subarray(21, 21 + body[20]);
      const data = body.subarray(21 + body[20]);
      const shared = ecdh.computeSecret(asPublic);
      const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]), 32));
      const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
      const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
      const d = createDecipheriv('aes-128-gcm', cek, nonce);
      d.setAuthTag(data.subarray(-16));
      const plain = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]);
      assert.equal(plain.at(-1), 2, 'last-record delimiter');
      return JSON.parse(plain.subarray(0, -1).toString());
    },
  };
}

test('a push only that browser can read, signed with Spot’s key', () => {
  const b = browser();
  assert.deepEqual(b.read(encrypt(JSON.stringify({ title: 'Spot', body: 'hi' }), b.sub.keys)), { title: 'Spot', body: 'hi' });
  const keys = vapidKeys();
  const header = vapidAuth(ENDPOINT, keys, { now: Date.UTC(2026, 9, 12) });
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [h, p, sig] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, 'https://web.push.apple.com');
  const raw = Buffer.from(keys.publicKey, 'base64url');
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  assert.equal(okEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(okEndpoint('https://evil.example/push'), false, 'only real push services');
  assert.equal(okEndpoint('http://web.push.apple.com/x'), false);
});

test('a text as a notification: no "Spot:", the link is the tap', () => {
  assert.deepEqual(pushFrom({ sms: 'Spot: Mom paid for your Nike order (Dunk). Confirm your address: https://spotmeplease.com/c/abc?k=1' }), { title: 'Spot', body: 'Mom paid for your Nike order (Dunk). Confirm your address', url: 'https://spotmeplease.com/c/abc?k=1', tag: undefined });
  assert.equal(pushFrom({ subject: '📦 Your order shipped', text: 'Track it: https://x.com/t' }).body, '📦 Your order shipped', 'email-only: the subject');
});

test('turn on notifications, get a test push; a gone device is dropped', async (t) => {
  const pushes = [];
  let status = 201;
  const db = openDb(':memory:');
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'off' }, pushFetch: async (url, init) => (pushes.push({ url, init }), new Response('', { status })) });
  t.after(() => a.close());
  const post = (url, payload, headers) => a.inject({ method: 'POST', url, payload, headers });
  const start = (await post('/v1/auth/start', { email: 'kyle@example.com' })).json();
  const v = await post('/v1/auth/verify', { email: 'kyle@example.com', code: start.code });
  const H = { cookie: v.headers['set-cookie'].split(';')[0] };
  const b = browser();
  assert.equal((await post('/v1/me/push', { subscription: b.sub })).statusCode, 401, 'signed in only');
  assert.equal((await post('/v1/me/push', { subscription: { ...b.sub, endpoint: 'https://evil.example/p' } }, H)).statusCode, 400);
  const on = await post('/v1/me/push', { subscription: b.sub }, H);
  assert.equal(on.statusCode, 200);
  assert.equal(on.json().devices, 1);
  const key = (await a.inject({ method: 'GET', url: '/v1/push/key' })).json().key;
  assert.equal(Buffer.from(key, 'base64url').length, 65);
  assert.equal((await a.inject({ method: 'GET', url: '/v1/push/key' })).json().key, key, 'made once, kept');
  assert.equal((await post('/v1/me/push/test', {}, H)).json().status, 'sent');
  assert.equal(pushes[0].url, ENDPOINT);
  assert.equal(pushes[0].init.headers['content-encoding'], 'aes128gcm');
  assert.match(pushes[0].init.headers.authorization, new RegExp(`^vapid t=.+, k=${key}$`));
  assert.match(b.read(pushes[0].init.body).body, /Notifications are on/);
  const sw = await a.inject({ method: 'GET', url: '/sw.js' });
  assert.match(sw.headers['content-type'], /javascript/);
  assert.match(sw.body, /showNotification/);
  // The push service says the device is gone: Spot forgets it.
  status = 410;
  assert.equal((await post('/v1/me/push/test', {}, H)).json().status, 'gone');
  assert.equal(db.pushSubs.ofUser(db.users.byEmail('kyle@example.com').id).length, 0);
});

test('a phone-only account still hears about its Spot, on its devices', async () => {
  const pushed = [];
  const n = createNotifier({ env: {}, push: { toUser: async (uid, m) => (pushed.push([uid, m]), 'sent') } });
  const out = await n.send({ phone: '+15125550100', userId: 'u1' }, { subject: '🎉 Mom spotted you!', html: '<p>x</p>', sms: 'Spot: Mom paid for your Nike order. Confirm: https://s.co/c/1' });
  assert.equal(out.text, 'not_configured', 'no texting service yet');
  assert.equal(out.push, 'sent');
  assert.deepEqual(pushed[0], ['u1', { title: 'Spot', body: 'Mom paid for your Nike order. Confirm', url: 'https://s.co/c/1', tag: undefined }]);
});

test('an AI’s finish link to a phone falls back to the account’s email while texts can’t go', async () => {
  const mail = [];
  const n = createNotifier({ env: { RESEND_API_KEY: 're_test' }, fetchImpl: async (url, init) => (mail.push(JSON.parse(init.body)), new Response('{}', { status: 200 })) });
  const cart = { kind: 'goods', items: [{ title: 'Dunk' }], merchant: { name: 'Nike' }, total_cents: 12000 };
  const out = await n.sendFinishLink(cart, 'https://s.co/c/1', { phone: '+15125550100', fallbackEmail: 'kyle@example.com' });
  assert.equal(out.text, 'not_configured');
  assert.equal(out.email, 'sent');
  assert.deepEqual(mail[0].to, ['kyle@example.com']);
  assert.match(mail[0].html, /https:\/\/s\.co\/c\/1/);
  // With an email given, no fallback is needed.
  const both = await n.sendFinishLink(cart, 'https://s.co/c/1', { email: 'me@example.com', phone: '+15125550100', fallbackEmail: 'kyle@example.com' });
  assert.equal(mail.length, 2);
  assert.deepEqual(mail[1].to, ['me@example.com']);
  assert.equal(both.email, 'sent');
});
