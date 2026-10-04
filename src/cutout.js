import { trackedFetch } from './telemetry.js';
// Background removal for the reference photo. A hosted segmentation model (remove.bg by default, Photoroom as the
// alternative) returns the product with a transparent background; a quality gate decides whether the cut-out is good
// enough to use. The cut-out is never what the assistant reads — the original photo stays the reference, because a
// trimmed strap or lace would silently make the pack wrong — it is an extra view used for the cover and the
// colourway tiles. With CUTOUT_FIXTURE set, the flood-fill mask stands in for the model so tests run offline.
import sharp from 'sharp';
import { productMask } from './colorway.js';

export const cutoutProvider = () => process.env.CUTOUT_FIXTURE ? 'fixture' : (process.env.CUTOUT_PROVIDER || (process.env.REMOVE_BG_API_KEY ? 'removebg' : process.env.PHOTOROOM_API_KEY ? 'photoroom' : ''));
export const cutoutEnabled = () => Boolean(cutoutProvider());
const r3 = x => Math.round(x * 1000) / 1000;
const dataUrlBuffer = u => { const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(u || '')); if (!m) return null; const t = m[1].toLowerCase(); return { buf: Buffer.from(m[2], 'base64'), type: t === 'jpg' ? 'jpeg' : t }; };

async function viaRemoveBg(buf, type) {
  const fd = new FormData(); fd.append('image_file', new Blob([buf], { type: `image/${type}` }), `photo.${type}`); fd.append('size', 'auto'); fd.append('format', 'png');
  const r = await trackedFetch('cutout','https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': process.env.REMOVE_BG_API_KEY || '' }, body: fd, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { let msg = ''; try { msg = (await r.json()).errors?.[0]?.title || ''; } catch {} throw new Error(`remove.bg ${r.status}${msg ? ` — ${msg}` : ''}`); }
  return Buffer.from(await r.arrayBuffer());
}
async function viaPhotoroom(buf, type) {
  const fd = new FormData(); fd.append('image_file', new Blob([buf], { type: `image/${type}` }), `photo.${type}`); fd.append('format', 'png');
  const r = await trackedFetch('cutout','https://sdk.photoroom.com/v1/segment', { method: 'POST', headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY || '' }, body: fd, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Photoroom ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function viaFixture(buf) {
  const { data, info } = await sharp(buf).rotate().flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = info.channels, rgb = Buffer.alloc(w * h * 3);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = data[k * c]; rgb[k * 3 + 1] = data[k * c + 1]; rgb[k * 3 + 2] = data[k * c + 2]; }
  const { mask } = productMask(rgb, w, h), rgba = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { rgba[k * 4] = rgb[k * 3]; rgba[k * 4 + 1] = rgb[k * 3 + 1]; rgba[k * 4 + 2] = rgb[k * 3 + 2]; rgba[k * 4 + 3] = mask[k] ? 255 : 0; }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
// The product on a transparent background, as PNG.
export async function removeBackground(photoDataUrl) {
  const d = dataUrlBuffer(photoDataUrl); if (!d) throw new Error('No readable photo');
  const p = cutoutProvider(); if (!p) throw new Error('No cut-out provider configured');
  return p === 'fixture' ? viaFixture(d.buf) : p === 'photoroom' ? viaPhotoroom(d.buf, d.type) : viaRemoveBg(d.buf, d.type);
}
// Is the cut-out usable? Coverage of the frame, how solid the kept shape is, and how ragged its edge runs.
export async function cutoutQuality(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, on = (x, y) => data[(y * w + x) * 4 + 3] > 127;
  let area = 0, perim = 0, minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue; area++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) perim++;
  }
  const frame = w * h, coverage = area / frame, boxArea = maxX >= minX ? (maxX - minX + 1) * (maxY - minY + 1) : 0, fill = boxArea ? area / boxArea : 0, roughness = area ? perim / Math.sqrt(area) : 0;
  const reasons = [];
  if (coverage < 0.08) reasons.push('too little of the frame was kept');
  if (coverage > 0.97) reasons.push('nothing was removed');
  if (boxArea && fill < 0.2) reasons.push('the kept shape is mostly holes');
  if (roughness > 14) reasons.push('edges too ragged');
  return { ok: !reasons.length, coverage: r3(coverage), fill: r3(fill), roughness: r3(roughness), reasons, width: w, height: h };
}
// Trimmed to the product with a little air, on white, as a JPEG data URL for the pack.
export async function cutoutOnWhite(png, { max = 1600, quality = 88 } = {}) {
  let trimmed; try { trimmed = await sharp(png).trim({ threshold: 10 }).png().toBuffer(); } catch { trimmed = png; }
  const meta = await sharp(trimmed).metadata(), pad = Math.max(8, Math.round(Math.max(meta.width || 0, meta.height || 0) * 0.06));
  // two passes: flatten onto white first, then pad — in one pipeline sharp pads before it flattens and the air comes out black
  const onWhite = await sharp(trimmed).flatten({ background: '#ffffff' }).png().toBuffer();
  const jpg = await sharp(onWhite).extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' })
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}
export async function cutoutFromPhoto(photoDataUrl) {
  const png = await removeBackground(photoDataUrl), quality = await cutoutQuality(png);
  return { provider: cutoutProvider(), quality, image: quality.ok ? await cutoutOnWhite(png) : null };
}
// Put the cut-out into a pack: one 'Cut-out' view after the reference photo, and the cover rendering ahead of the tiles.
export function placeCutout(pack, cutout, { note } = {}) {
  const sketches = pack.sketches.filter(s => !/^cutout-/.test(String(s.id || '')));
  const view = { id: `cutout-${Date.now().toString(36)}`, view: 'detail', label: 'Cut-out · background removed', image: cutout.image, garmentWidthIn: null, callouts: [] };
  pack.sketches = [...sketches.slice(0, 1), view, ...sketches.slice(1)].slice(0, 12);
  const rend = { id: 'cutout-white', name: 'Cut-out on white', note: note || `Background removed from the reference photo (${cutout.provider}) · used for the cover and the colourway tiles`, image: cutout.image };
  pack.renderings = [rend, ...pack.renderings.filter(r => r.id !== 'cutout-white')].slice(0, 6);
  return pack;
}
