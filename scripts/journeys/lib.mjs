import { createRequire } from 'node:module'; import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path';
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const req = createRequire(join(REPO, 'package.json'));
export const sharp = req('sharp'); export const { SignJWT } = req('jose');
export const S = process.env.JOURNEY_TMP, DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/fbhub_tp';
export const stamp = Date.now().toString(36).slice(-5);
export const sql = q => execSync(`psql ${DB} -qAtc ${JSON.stringify(q)}`, { encoding: 'utf8' }).trim();
export const results = []; let cur = null, nChecks = 0, nBad = 0;
export const ok = (c, m, extra) => { nChecks++; if (!c) { nBad++; cur.fails.push(m + (extra !== undefined ? ` — got ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`.slice(0, 260) : '')); } cur.checks++; };
// JOURNEY_GATE=off runs the whole suite with the payment gate switched off for everyone. These journeys start from a locked pack, so
// they are skipped there (and only there): every other journey must pass with the gate on and with it off.
export const NEEDS_GATE_ON = new Set(['J08', 'J09', 'J26', 'J36', 'J37']);
export async function journey(id, title, fn) {
  if (process.env.JOURNEY_ONLY && !process.env.JOURNEY_ONLY.split(',').includes(id)) return; // JOURNEY_ONLY=J57,J48 runs just those
  if (process.env.JOURNEY_GATE === 'off' && NEEDS_GATE_ON.has(id)) { console.log(`skip ${id} ${title} (needs the payment gate on)`); return; }
  cur = { id, title, checks: 0, fails: [], ms: 0, error: null }; results.push(cur); const t = Date.now();
  try { await fn(); } catch (e) { cur.error = String(e.stack || e).split('\n').slice(0, 3).join(' | '); nBad++; }
  cur.ms = Date.now() - t; console.log(`${cur.fails.length || cur.error ? 'FAIL' : 'ok  '} ${id} ${title} (${cur.checks} checks, ${cur.ms}ms)`);
  for (const f of cur.fails) console.log('       ✗ ' + f); if (cur.error) console.log('       ! ' + cur.error);
}
export const summary = () => { console.log(`\n${results.length} journeys · ${nChecks} checks · ${nBad} problems`); return nBad; };
export function api(base) {
  return async (path, o = {}) => {
    const t = Date.now(), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), o.timeout || 30000);
    try {
      const headers = { ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}), ...(o.headers || {}) };
      let body = o.raw !== undefined ? o.raw : o.body !== undefined ? JSON.stringify(o.body) : undefined;
      if (o.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
      const r = await fetch(base + path, { method: o.method || (body !== undefined ? 'POST' : 'GET'), headers, body, signal: ctl.signal });
      const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch {}
      return { status: r.status, json, text, ms: Date.now() - t, ct: r.headers.get('content-type') || '' };
    } catch (e) { return { status: 0, json: {}, text: '', ms: Date.now() - t, err: e.name }; } finally { clearTimeout(to); }
  };
}
// A picture with real detail (the fixture product finder calls a flat image "blank"), drawn from SVG so nothing binary is committed.
const drawing = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f4f4f2"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8451f"/><stop offset="1" stop-color="#2a2a2e"/></linearGradient></defs>
  <path d="M${w * .12} ${h * .62} C${w * .15} ${h * .3} ${w * .5} ${h * .2} ${w * .62} ${h * .42} S${w * .92} ${h * .5} ${w * .9} ${h * .66} L${w * .9} ${h * .78} L${w * .12} ${h * .78} Z" fill="url(#g)" stroke="#111" stroke-width="${w / 120}"/>
  <rect x="${w * .1}" y="${h * .76}" width="${w * .82}" height="${h * .09}" rx="${h * .03}" fill="#3b3b40"/><circle cx="${w * .35}" cy="${h * .45}" r="${w * .05}" fill="#fff" opacity=".8"/><path d="M${w * .3} ${h * .6} L${w * .7} ${h * .55}" stroke="#fff" stroke-width="${w / 60}" fill="none"/></svg>`);
export const FX = join(S, 'fixtures');
mkdirSync(FX, { recursive: true });
writeFileSync(join(FX, 'runner.jpg'), await sharp(drawing(1200, 800)).jpeg({ quality: 88 }).toBuffer());
writeFileSync(join(FX, 'ig-screenshot.png'), await sharp(drawing(1170, 2532)).png().toBuffer());
writeFileSync(join(FX, 'pinterest-screenshot.png'), await sharp(drawing(1170, 2200)).png().toBuffer());
writeFileSync(join(FX, 'broken.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really a png, just the signature and then nonsense'.repeat(40))]));
writeFileSync(join(FX, 'notes.txt'), 'just some notes\n');
export const jpeg = () => `data:image/jpeg;base64,${readFileSync(join(FX, 'runner.jpg')).toString('base64')}`;
export const png = async (w, h, rgb = [255, 255, 255]) => `data:image/png;base64,${(await sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer()).toString('base64')}`;
// A textured picture of any size (random detail at 1/30 scale, blown up), so it is not "blank" to the product finder.
export const bigJpeg = async (w, h, fmt = 'jpeg', { div = 30, q = 70 } = {}) => { const sw = Math.max(8, Math.round(w / div)), sh = Math.max(8, Math.round(h / div)), raw = Buffer.alloc(sw * sh * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761 >>> 24) & 255;
  const img = sharp(raw, { raw: { width: sw, height: sh, channels: 3 } }).resize(w, h, { kernel: 'cubic' }); const out = fmt === 'png' ? await img.png().toBuffer() : await img.jpeg({ quality: q }).toBuffer(); return `data:image/${fmt};base64,${out.toString('base64')}`; };
// A PNG whose header claims 20000×20000: metadata() reads it, a decoder would need 1.6 GB.
import { crc32 } from 'node:zlib';
export const hugeHeaderPng = async () => { const b = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#888' } }).png().toBuffer(); b.writeUInt32BE(20000, 16); b.writeUInt32BE(20000, 20); b.writeUInt32BE(crc32(b.subarray(12, 29)) >>> 0, 29); return `data:image/png;base64,${b.toString('base64')}`; };
export const codeFrom = (log, email) => { const lines = readFileSync(log, 'utf8').trim().split('\n').reverse(); for (const l of lines) { try { const j = JSON.parse(l); if (j.email === email && j.code) return j.code; } catch {} } return null; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function waitAi(call, token, productId, ms = 25000) {
  const t = Date.now(); let last;
  while (Date.now() - t < ms) { last = await call(`/v1/products/${productId}/tech-pack/draft`, { token }); const st = last.json?.techPack?.aiStatus; if (st && st !== 'pending') return last; await sleep(400); }
  return last;
}
export const secret = new TextEncoder().encode('smoke-secret');
export const forge = async (claims, { exp = '7d', iss = 'future-basics-client-hub', key = secret } = {}) => new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer(iss).setIssuedAt().setExpirationTime(exp).sign(key);
