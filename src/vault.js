// Encryption for the few things that must never sit in the database as plain text: a vendor's bank and tax details.
// AES-256-GCM with a key from the environment (VENDOR_DATA_KEY: 64 hex characters or 44 base64 characters, i.e. 32 random bytes).
// Stored as "v1:<iv>:<tag>:<ciphertext>" (base64url). Without a key nothing is stored: callers check vaultReady() and say so.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const keyFrom = (env = process.env) => {
  const raw = String(env.VENDOR_DATA_KEY || '').trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  if (/^[A-Za-z0-9+/]{43}=?$/.test(raw)) { const b = Buffer.from(raw, 'base64'); if (b.length === 32) return b; }
  return null;
};
export const vaultReady = env => Boolean(keyFrom(env));
const need = env => { const k = keyFrom(env); if (!k) throw Object.assign(new Error('Secure storage for bank details is not set up yet'), { statusCode: 503 }); return k; };
const b64 = buf => buf.toString('base64url');

export function seal(value, env) {
  const key = need(env), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return `v1:${b64(iv)}:${b64(c.getAuthTag())}:${b64(ct)}`;
}
export function open(text, env) {
  const key = need(env), m = /^v1:([\w-]+):([\w-]+):([\w-]+)$/.exec(String(text || ''));
  if (!m) throw new Error('Stored value is not readable');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(m[1], 'base64url')); d.setAuthTag(Buffer.from(m[2], 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(m[3], 'base64url')), d.final()]).toString('utf8'));
}
// A fingerprint of the bank details: tells staff the account changed without opening it. Keyed, so it cannot be guessed from the digits.
export const fingerprint = (parts, env) => createHmac('sha256', need(env)).update(parts.map(p => String(p || '').replace(/[\s-]/g, '').toUpperCase()).join('|')).digest('hex').slice(0, 32);
