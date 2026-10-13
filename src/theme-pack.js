// A Shopify theme we made, packed as the zip Shopify takes (Online Store, Themes, Add theme, Upload zip file), and a short-lived address Shopify can fetch it from
// when we send it to a client's store as an unpublished draft. The theme folders ship with the service (the Dockerfile copies them).
//   * Only the folders a theme may hold go in the zip (assets, config, layout, locales, sections, snippets, templates): notes and design docs stay out.
//   * No library: a zip is a few headers around deflated files, written here.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';

const ROOT = new URL('../themes/', import.meta.url).pathname;
export const THEMES = { 'common-ground': { name: 'Common Ground', dir: path.join(ROOT, 'common-ground') } };
const FOLDERS = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
export const themeKeys = () => Object.keys(THEMES).filter(k => existsSync(THEMES[k].dir));

// → [{ name: 'sections/hero.liquid', data: Buffer }] in a fixed order, so the same theme always makes the same zip
export function themeFiles(key, dir = THEMES[key]?.dir) {
  if (!dir || !existsSync(dir)) return [];
  const out = [], walk = (abs, rel) => { for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(abs, e.name), r); else if (e.isFile() && !e.name.startsWith('.')) out.push({ name: r, data: readFileSync(path.join(abs, e.name)) }); } };
  for (const f of FOLDERS) if (existsSync(path.join(dir, f)) && statSync(path.join(dir, f)).isDirectory()) walk(path.join(dir, f), f);
  return out;
}

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

// → Buffer: a zip of the files (each deflated when that is smaller)
export function zipOf(files, when = new Date('2026-01-01T00:00:00Z')) {
  const time = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1), date = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate();
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), raw = Buffer.from(f.data), def = deflateRawSync(raw), useDef = def.length < raw.length, body = useDef ? def : raw, crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDef ? 8 : 0, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDef ? 8 : 0, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    parts.push(lh, name, body); central.push(ch, name); offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// The address Shopify fetches the zip from: `<theme>.<expires>.<signature>`, good for a few minutes, for that theme only.
const sig = (secret, key, exp) => createHmac('sha256', String(secret)).update(`theme-zip:${key}:${exp}`).digest('base64url').slice(0, 32);
export const signThemeToken = (secret, key, ttlMs = 15 * 60_000, now = Date.now()) => { const exp = Math.floor((now + ttlMs) / 1000); return `${key}.${exp}.${sig(secret, key, exp)}`; };
export function readThemeToken(secret, token, now = Date.now()) {
  const m = /^([a-z0-9-]{1,40})\.(\d{9,11})\.([A-Za-z0-9_-]{32})$/.exec(String(token || '').replace(/\.zip$/, '')); if (!m) return null;
  const want = Buffer.from(sig(secret, m[1], m[2])), got = Buffer.from(m[3]); if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return Number(m[2]) * 1000 >= now && THEMES[m[1]] ? m[1] : null;
}
