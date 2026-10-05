// A 3D model (STL) from the client's reference photo, made by an outside service (Meshy). Staff start it by hand: it spends credits and sends the
// photo to the vendor, so nothing runs it automatically.
//
// The result is a shape, not a measured part: the vendor's units are arbitrary, so the size we report is raw and the model says so until
// someone scales it against a measurement.
//
//   MESHY_API_KEY   turns it on          MESH_MODEL    (default meshy-6)      MESH_DISABLED=true   switches it off
//   AI_FIXTURE      (tests) the provider is a stand-in that returns a small valid STL
import sharp from 'sharp';
import { trackedFetch } from './telemetry.js';

const API = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const MAX_STL_BYTES = 80 * 1024 * 1024;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function meshConfig(env = process.env) {
  if (env.MESH_DISABLED === 'true') return { provider: 'off', configured: false, model: null, note: 'switched off (MESH_DISABLED)' };
  if (env.MESHY_API_KEY) return { provider: 'meshy', configured: true, model: env.MESH_MODEL || 'meshy-6' };
  if (env.AI_FIXTURE) return { provider: 'fixture', configured: true, model: 'fixture' };
  return { provider: 'none', configured: false, model: null };
}

// ---- STL: read it, measure it, refuse anything that is not one ----
// Binary STL: 80-byte header, uint32 triangle count, 50 bytes per triangle. ASCII STL starts with "solid" and lists "vertex x y z".
export function stlInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 84) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const see = (x, y, z) => { if (![x, y, z].every(Number.isFinite)) return false; [x, y, z].forEach((v, i) => { if (v < min[i]) min[i] = v; if (v > max[i]) max[i] = v; }); return true; };
  const n = buf.readUInt32LE(80);
  let triangles = 0;
  if (84 + n * 50 === buf.length && n > 0) {
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let v = 0; v < 3; v++) if (!see(buf.readFloatLE(o + v * 12), buf.readFloatLE(o + v * 12 + 4), buf.readFloatLE(o + v * 12 + 8))) return null; }
    triangles = n;
  } else if (/^\s*solid/i.test(buf.subarray(0, 64).toString('latin1'))) {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, text = buf.toString('latin1');
    let m, verts = 0;
    while ((m = re.exec(text))) { if (!see(Number(m[1]), Number(m[2]), Number(m[3]))) return null; verts++; }
    triangles = Math.floor(verts / 3);
    if (!triangles || verts % 3) return null;
  } else return null;
  const size = [0, 1, 2].map(i => max[i] - min[i]);
  if (!size.some(s => s > 0)) return null;
  return { triangles, size: size.map(s => Math.round(s * 1000) / 1000), format: 84 + n * 50 === buf.length ? 'binary' : 'ascii' };
}

// A tiny valid binary STL (a unit cube, 12 triangles) for the test stand-in.
export function fixtureStl() {
  const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const b = Buffer.alloc(84 + f.length * 50); b.write('fixture cube', 0, 'latin1'); b.writeUInt32LE(f.length, 80);
  f.forEach((tri, i) => { const o = 84 + i * 50; tri.forEach((vi, k) => v[vi].forEach((c, j) => b.writeFloatLE(c, o + 12 + k * 12 + j * 4))); });
  return b;
}
const FIXTURE_PNG = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#cccccc' } }).jpeg().toBuffer();

// ---- the photo, in a form the service accepts (jpeg or png, a sensible size) ----
export async function photoForMesh(dataUrl) {
  const m = /^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const jpeg = await sharp(Buffer.from(m[1], 'base64')).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

const headers = key => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const vendorError = async res => {
  let msg = ''; try { msg = (await res.json())?.message || ''; } catch {}
  const e = new Error(res.status === 402 ? 'Meshy is out of credits.' : res.status === 401 || res.status === 403 ? 'Meshy refused its key.' : res.status === 429 ? 'Meshy is busy: too many requests. Try again in a few minutes.' : `Meshy said no (${res.status})${msg ? ': ' + clip(msg, 160) : ''}.`);
  e.status = res.status; return e;
};

// → { taskId }
export async function startMesh({ imageDataUrl, cfg = meshConfig(), env = process.env }) {
  if (cfg.provider === 'fixture') return { taskId: 'fixture-' + Date.now().toString(36) };
  if (!cfg.configured) throw new Error('No 3D service is connected: set MESHY_API_KEY on the service.');
  const body = { image_url: imageDataUrl, ai_model: cfg.model, should_texture: env.MESH_TEXTURE === 'on', target_formats: ['stl'], image_enhancement: true, auto_size: true };
  const res = await trackedFetch('meshy', API, { method: 'POST', headers: headers(env.MESHY_API_KEY), body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw await vendorError(res);
  const out = await res.json(); const taskId = out.result || out.id;
  if (!taskId) throw new Error('Meshy did not return a task.');
  return { taskId: String(taskId) };
}

// → { status: 'running'|'done'|'failed', progress, stlUrl, thumbUrl, credits, error }
export async function pollMesh(taskId, { cfg = meshConfig(), env = process.env } = {}) {
  if (cfg.provider === 'fixture') {
    const t = Number(process.env.MESH_FIXTURE_MS) || 1200, born = parseInt(String(taskId).replace('fixture-', ''), 36) || 0;
    if (/fail/i.test(env.MESH_FIXTURE_MODE || '')) return { status: 'failed', progress: 0, error: 'Test fixture: the service could not make a model.' };
    return Date.now() - born < t ? { status: 'running', progress: 40 } : { status: 'done', progress: 100, stlUrl: 'fixture:stl', thumbUrl: 'fixture:thumb', credits: 0 };
  }
  const res = await trackedFetch('meshy', `${API}/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${env.MESHY_API_KEY}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw await vendorError(res);
  const t = await res.json(), st = String(t.status || '').toUpperCase();
  if (st === 'SUCCEEDED') return t.model_urls?.stl ? { status: 'done', progress: 100, stlUrl: t.model_urls.stl, thumbUrl: t.thumbnail_url || null, credits: t.consumed_credits ?? null } : { status: 'failed', progress: 100, error: 'Meshy finished but returned no STL file.' };
  if (st === 'FAILED' || st === 'CANCELED') return { status: 'failed', progress: Number(t.progress) || 0, error: clip(t.task_error?.message, 200) || 'Meshy could not make a model from this photo.' };
  return { status: 'running', progress: Math.max(0, Math.min(99, Number(t.progress) || 0)) };
}

// Downloads one file the service made. Only https links to the vendor's own hosts; a size cap; nothing is followed to anywhere else.
export async function fetchAsset(url, { kind = 'stl', cfg = meshConfig() } = {}) {
  if (cfg.provider === 'fixture') return kind === 'stl' ? fixtureStl() : FIXTURE_PNG();
  let u; try { u = new URL(url); } catch { throw new Error('The 3D service sent a bad link.'); }
  let res;
  for (let hop = 0; hop < 4; hop++) { // redirects are followed by hand so every hop stays on the vendor's own hosts
    if (u.protocol !== 'https:' || !/(^|\.)meshy\.ai$/i.test(u.hostname)) throw new Error('The 3D service sent a link we do not trust.');
    res = await trackedFetch('meshy', u.href, { signal: AbortSignal.timeout(120000), redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { try { u = new URL(res.headers.get('location'), u); } catch { throw new Error('The 3D service sent a bad link.'); } continue; }
    break;
  }
  if (!res || (res.status >= 300 && res.status < 400)) throw new Error('Could not download the model (too many redirects).');
  if (!res.ok) throw new Error(`Could not download the model (${res.status}).`);
  const len = Number(res.headers.get('content-length')) || 0; if (len > MAX_STL_BYTES) throw new Error('The model file is too large.');
  const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > MAX_STL_BYTES) throw new Error('The model file is too large.');
  return buf;
}
