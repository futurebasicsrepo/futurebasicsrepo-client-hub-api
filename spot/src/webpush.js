// Web Push: a notification on the shopper's phone or computer, no texting
// service needed. Works where Spot is installed from the browser (on iPhone:
// Share → Add to Home Screen, iOS 16.4+) and in desktop browsers.
//
// The browser gives Spot a subscription (an endpoint at Apple, Google or
// Mozilla, plus the keys to encrypt to). Spot signs each push with its own
// key pair (VAPID, RFC 8292) and encrypts the message so only that browser
// can read it (RFC 8291, aes128gcm). The key pair is made once and kept in
// the database (or SPOT_VAPID_PUBLIC_KEY / SPOT_VAPID_PRIVATE_KEY), so there
// is nothing to set up. Endpoints that say "gone" (404/410) are dropped.
//
// message = { title, body, url, tag? }
import { createECDH, createCipheriv, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');

// A P-256 key pair as base64url: the raw 65-byte public point and the 32-byte private scalar.
export function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])), privateKey: priv.d };
}

function privateKeyObject({ publicKey, privateKey }) {
  const raw = unb64u(publicKey);
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)), d: privateKey }, format: 'jwk' });
}

// The Authorization header for one push service: a JWT for its origin, signed ES256.
export function vapidAuth(endpoint, keys, { subject = 'mailto:hello@spotmeplease.com', now = Date.now() } = {}) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

// The message, encrypted to the browser's keys (one aes128gcm record).
export function encrypt(payload, { p256dh, auth }, { salt = randomBytes(16) } = {}) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  // A fresh key pair for every message.
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

// Only the push services browsers actually use: Spot never posts to an
// address a caller made up.
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/i;
export function okEndpoint(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

export function createPush({ db, env = process.env, fetchImpl = fetch, log = console, metrics = null } = {}) {
  const keys = () =>
    env.SPOT_VAPID_PUBLIC_KEY && env.SPOT_VAPID_PRIVATE_KEY
      ? { publicKey: env.SPOT_VAPID_PUBLIC_KEY, privateKey: env.SPOT_VAPID_PRIVATE_KEY }
      : JSON.parse(db.setting('vapid_keys', () => JSON.stringify(vapidKeys())));

  async function sendOne(sub, msg) {
    const body = encrypt(JSON.stringify(msg), sub);
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: { authorization: vapidAuth(sub.endpoint, keys()), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (res && (res.status === 404 || res.status === 410)) {
      db.pushSubs.remove(sub.endpoint);
      return 'gone';
    }
    if (!res?.ok) {
      log.warn?.({ status: res?.status }, 'push failed');
      metrics?.fail('webpush', `HTTP ${res?.status ?? 'error'}`);
      return 'failed';
    }
    metrics?.ok('webpush');
    return 'sent';
  }

  return {
    publicKey: () => keys().publicKey,
    // A browser's subscription, for this account.
    subscribe(userId, sub, ua = '') {
      const endpoint = String(sub?.endpoint || '');
      const p256dh = String(sub?.keys?.p256dh || '');
      const auth = String(sub?.keys?.auth || '');
      if (!okEndpoint(endpoint) || unb64u(p256dh).length !== 65 || unb64u(auth).length !== 16) return false;
      db.pushSubs.add({ endpoint, user_id: userId, p256dh, auth, ua: String(ua).slice(0, 200) });
      return true;
    },
    unsubscribe: (userId, endpoint) => db.pushSubs.removeFor(userId, String(endpoint || '')),
    devices: (userId) => db.pushSubs.ofUser(userId).length,
    // Every device the account turned on. 'none' when it has none.
    async toUser(userId, msg) {
      const subs = userId ? db.pushSubs.ofUser(userId) : [];
      if (!subs.length) return 'none';
      const clean = { title: String(msg.title || 'Spot').slice(0, 80), body: String(msg.body || '').slice(0, 240), url: String(msg.url || '/account'), tag: msg.tag ? String(msg.tag).slice(0, 60) : undefined };
      const out = await Promise.all(subs.map((s) => sendOne(s, clean).catch(() => 'failed')));
      return out.includes('sent') ? 'sent' : out[0];
    },
  };
}

// The service worker (served at /sw.js): shows the push, opens its link.
export const SERVICE_WORKER = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Spot', { body: m.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: m.tag, data: { url: m.url || '/account' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/account', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url === url && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
`;
