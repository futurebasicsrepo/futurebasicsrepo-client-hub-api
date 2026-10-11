// Pictures kept out of the pack JSON. A pack holds sketches, callout photos, renderings and artwork as base64 data URLs; a pack with forty callout photos was megabytes
// of JSON, rewritten whole on every autosave and copied again into every published version. Here each big picture is stored once, keyed by the hash of its bytes
// (pack_blobs), and the JSON holds a short reference in its place:  "fbblob:<sha256>".
//
// This is a layer at the database boundary, so the rest of the service does not change:
//   - writing: any plain-object query parameter has its big data URLs swapped for references (the bytes are stored first, once, however often they appear);
//   - reading: any json/jsonb column in a result has its references swapped back into the exact data URL that went in.
// The PDF, the check, the studio, the files folder and the loop read packs through the same queries as before and see the same strings.
//
// Exactness: the data URL is rebuilt byte-for-byte. A picture whose base64 does not survive decode and re-encode unchanged (odd padding, line breaks) is stored as the
// original text instead, so what is read back is always what was written.
import { createHash } from 'node:crypto';

export const BLOB_MIN_CHARS = 2000; // smaller data URLs (icons, swatches) stay where they are
const REF_PREFIX = 'fbblob:';
const REF_RE = /^fbblob:([0-9a-f]{64})$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const MIME_RE = /^image\/[a-z0-9.+-]+$/i;
const JSON_TYPES = new Set([114, 3802, 199, 3807]); // json, jsonb, json[], jsonb[]

export const isRef = v => typeof v === 'string' && REF_RE.test(v);

// a data URL → { ref, row } to store, or null when the string is not a big picture
export function toBlob(str) {
  if (typeof str !== 'string' || str.length < BLOB_MIN_CHARS || !str.startsWith('data:image/')) return null;
  const at = str.indexOf(';base64,'); if (at < 0) return null;
  const mime = str.slice(5, at), payload = str.slice(at + 8);
  if (!MIME_RE.test(mime) || !B64_RE.test(payload)) return null;
  const decoded = Buffer.from(payload, 'base64');
  const exact = decoded.toString('base64') === payload;
  const kind = exact ? 'bin' : 'text', bytes = exact ? decoded : Buffer.from(str, 'utf8');
  const hash = createHash('sha256').update(kind).update('\0').update(mime).update('\0').update(bytes).digest('hex');
  return { ref: REF_PREFIX + hash, row: { hash, mime, kind, bytes } };
}
export const fromBlob = ({ mime, kind, bytes }) => kind === 'text' ? Buffer.from(bytes).toString('utf8') : `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

// what a string is stored as: its reference when it would be moved out, itself otherwise (for comparing an incoming picture with a stored pack)
export const storedForm = str => toBlob(str)?.ref || str;

const plain = v => v !== null && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Date);

// → a copy of value with every big data URL replaced by its reference; the bytes to store are collected into `blobs` (hash → row). Untouched branches are shared, not copied.
export function externalize(value, blobs) {
  if (typeof value === 'string') { const b = toBlob(value); if (!b) return value; blobs.set(b.row.hash, b.row); return b.ref; }
  if (Array.isArray(value)) { let out = null; for (let i = 0; i < value.length; i++) { const n = externalize(value[i], blobs); if (n !== value[i]) { out = out || value.slice(); out[i] = n; } } return out || value; }
  if (plain(value)) { let out = null; for (const k of Object.keys(value)) { const n = externalize(value[k], blobs); if (n !== value[k]) { out = out || { ...value }; out[k] = n; } } return out || value; }
  return value;
}
export function collectRefs(value, into) {
  if (typeof value === 'string') { const m = REF_RE.exec(value); if (m) into.add(m[1]); return; }
  if (Array.isArray(value)) { for (const v of value) collectRefs(v, into); return; }
  if (plain(value)) for (const k of Object.keys(value)) collectRefs(value[k], into);
}
// replaces references in place (result rows are ours to change) and returns the value
export function resolveRefs(value, get) {
  if (typeof value === 'string') { const m = REF_RE.exec(value); return m ? get(m[1]) : value; }
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = resolveRefs(value[i], get); return value; }
  if (plain(value)) { for (const k of Object.keys(value)) value[k] = resolveRefs(value[k], get); return value; }
  return value;
}

// The store. rawQuery(text, values) → { rows } talks to the database without this layer (so it never recurses).
export function createBlobLayer(rawQuery, { cacheBytes = 96 * 1024 * 1024, log = console } = {}) {
  const known = new Set(), cache = new Map(); let cached = 0;
  const remember = (hash, row) => { if (cache.has(hash)) return; const size = row.bytes.length; cache.set(hash, row); cached += size; while (cached > cacheBytes && cache.size > 1) { const [h, r] = cache.entries().next().value; cache.delete(h); cached -= r.bytes.length; } };

  async function save(blobs) {
    for (const row of blobs.values()) {
      if (known.has(row.hash)) continue;
      await rawQuery(`insert into pack_blobs(hash,mime,kind,bytes,size) values($1,$2,$3,$4,$5) on conflict (hash) do nothing`, [row.hash, row.mime, row.kind, row.bytes, row.bytes.length]);
      known.add(row.hash); remember(row.hash, row);
    }
  }
  async function load(hashes) {
    const out = new Map(), missing = [];
    for (const h of hashes) { const c = cache.get(h); if (c) out.set(h, c); else missing.push(h); }
    if (missing.length) {
      const r = await rawQuery(`select hash,mime,kind,bytes from pack_blobs where hash = any($1::text[])`, [missing]);
      for (const row of r.rows) { out.set(row.hash, row); known.add(row.hash); remember(row.hash, row); }
    }
    return out;
  }

  // the parameters of a query, with big pictures swapped for references (bytes stored first)
  async function prepareParams(values) {
    if (!Array.isArray(values)) return values;
    let blobs = null, out = values;
    for (let i = 0; i < values.length; i++) {
      const p = values[i]; if (!plain(p) || Array.isArray(p)) continue; // a JS array is a Postgres array literal, not JSON
      blobs = blobs || new Map(); const n = externalize(p, blobs);
      if (n !== p) { if (out === values) out = values.slice(); out[i] = n; }
    }
    if (blobs && blobs.size) await save(blobs);
    return out;
  }
  // json/jsonb columns of a result, references swapped back into the data URLs they stand for
  async function hydrate(res) {
    for (const r of Array.isArray(res) ? res : [res]) {
      if (!r || !r.rows || !r.rows.length || !r.fields) continue;
      const cols = r.fields.map((f, i) => [f.name, i, JSON_TYPES.has(f.dataTypeID)]).filter(c => c[2]);
      if (!cols.length) continue;
      const cell = (row, c) => Array.isArray(row) ? row[c[1]] : row[c[0]], set = (row, c, v) => { if (Array.isArray(row)) row[c[1]] = v; else row[c[0]] = v; };
      const refs = new Set();
      for (const row of r.rows) for (const c of cols) { const v = cell(row, c); if (v !== null && typeof v === 'object') collectRefs(v, refs); }
      if (!refs.size) continue;
      const got = await load([...refs]);
      const get = h => { const b = got.get(h); if (b) return fromBlob(b); log.error(`pack picture ${h} is missing from pack_blobs`); return REF_PREFIX + h; };
      for (const row of r.rows) for (const c of cols) { const v = cell(row, c); if (v !== null && typeof v === 'object') set(row, c, resolveRefs(v, get)); }
    }
    return res;
  }
  // wraps a query function (pool.query or client.query) so parameters go in externalized and results come back hydrated
  function wrap(run) {
    return async function (...args) {
      if (typeof args[args.length - 1] === 'function') return run(...args); // callback style: not used by this service, left alone
      const first = args[0];
      if (first && typeof first === 'object' && !Array.isArray(first) && typeof first.text === 'string') args[0] = { ...first, values: await prepareParams(first.values) };
      else if (args.length > 1) args[1] = await prepareParams(args[1]);
      return hydrate(await run(...args));
    };
  }
  return { wrap, prepareParams, hydrate, save, load, stats: () => ({ cachedBytes: cached, cachedPictures: cache.size, known: known.size }) };
}
