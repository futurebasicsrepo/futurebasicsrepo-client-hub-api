import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export const VISIBILITIES = ['public', 'unlisted', 'private'];
export const FILTERS = ['none', 'terrace', 'matchday', 'floodlight', 'vintage', 'mono'];
export const SORTS = ['hot', 'new', 'top'];

export const MEDIA_TYPES = {
  'video/mp4': { kind: 'video', ext: '.mp4' },
  'video/webm': { kind: 'video', ext: '.webm' },
  'video/quicktime': { kind: 'video', ext: '.mov' },
  'image/jpeg': { kind: 'image', ext: '.jpg' },
  'image/png': { kind: 'image', ext: '.png' },
  'image/gif': { kind: 'image', ext: '.gif' },
  'image/webp': { kind: 'image', ext: '.webp' }
};
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MEDIA_KEY_RE = /^[A-Za-z0-9]{16,40}\.(mp4|webm|mov|jpg|png|gif|webp)$/;
export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const POST_ID_RE = /^[A-Za-z0-9]{10}$/;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Unbiased base62 id (rejection sampling: 248 = 62 * 4).
export function randomId(length = 10) {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const slugify = value => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

export const normalizeHandle = value => String(value || '').trim().toLowerCase().replace(/^@/, '');
export const normalizeEmail = value => String(value || '').trim().toLowerCase();

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, key] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const signMedia = (key, exp, secret) => createHmac('sha256', secret).update(`${key}:${exp}`).digest('base64url');

export function verifyMediaSig(key, exp, sig, secret, now = Date.now()) {
  if (!exp || !sig || !/^\d+$/.test(String(exp))) return false;
  if (Number(exp) * 1000 < now) return false;
  const expected = Buffer.from(signMedia(key, exp, secret));
  const actual = Buffer.from(String(sig));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Parses a single-range `Range` header. Returns null (no range), 'invalid', or { start, end }.
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid';
  let start, end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

const num = value => (value === null || value === '' ? null : Number(value));

// Validates the editable subset of a post. Only fields present in `body` are returned.
export function normalizePostEdit(body = {}, { duration = null } = {}) {
  const values = {};
  const errors = [];
  if ('title' in body) {
    values.title = String(body.title ?? '').trim().replace(/\s+/g, ' ');
    if (values.title.length > 120) errors.push('Title must be 120 characters or fewer.');
  }
  if ('description' in body) {
    values.description = String(body.description ?? '').trim();
    if (values.description.length > 2000) errors.push('Description must be 2000 characters or fewer.');
  }
  if ('fandom' in body) {
    const name = String(body.fandom ?? '').trim().replace(/\s+/g, ' ');
    if (name.length > 60) errors.push('Fandom must be 60 characters or fewer.');
    else if (name && !slugify(name)) errors.push('Fandom needs at least one letter or number.');
    values.fandom = name;
  }
  if ('filter' in body) {
    values.filter = String(body.filter);
    if (!FILTERS.includes(values.filter)) errors.push('Unknown filter.');
  }
  if ('visibility' in body) {
    values.visibility = String(body.visibility);
    if (!VISIBILITIES.includes(values.visibility)) errors.push('Visibility must be public, unlisted, or private.');
  }
  if ('duration' in body) {
    values.duration = num(body.duration);
    if (values.duration !== null && !(values.duration > 0 && values.duration < 86400)) errors.push('Invalid duration.');
    else duration = values.duration ?? duration;
  }
  if ('trimStart' in body || 'trimEnd' in body) {
    const start = num(body.trimStart);
    const end = num(body.trimEnd);
    if (start !== null && !(Number.isFinite(start) && start >= 0)) errors.push('Trim start must be zero or more seconds.');
    if (end !== null && !(Number.isFinite(end) && end > 0)) errors.push('Trim end must be a positive number of seconds.');
    if (start !== null && end !== null && end - start < 0.5) errors.push('Trimmed clip must be at least half a second.');
    if (duration && end !== null && end > duration + 0.05) errors.push('Trim end is past the end of the clip.');
    values.trimStart = start;
    values.trimEnd = end;
  }
  return { values, errors };
}

// Very small fixed-window limiter; good enough for a single API instance.
export function createLimiter({ windowMs, max }) {
  const hits = new Map();
  return key => {
    const now = Date.now();
    const current = hits.get(key);
    if (!current || now - current.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 50_000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}
