// Art files: what we make from a client's graphic so a factory can use it, without ever touching what they sent.
//   the original   kept exactly as uploaded (an asset of kind 'upload', in the files folder under "Your uploads")
//   a clean file   the same graphic on a transparent background, trimmed (a derived asset, under "Design files")
//   the colours    the inks the graphic is made of, each matched to a Pantone C chip
//   a print check  whether the file is big enough to print at the size it will be used (300 dpi is the usual ask)
// Everything here is deterministic pixel work: no model is asked to redraw the graphic, so the lettering stays exactly as the client drew it.
import sharp from 'sharp';
import './pantone-c.js';
import { nearestName, colourDistance } from './studio.js';

const hex2 = n => n.toString(16).padStart(2, '0');
const toHex = (r, g, b) => '#' + hex2(Math.round(r)) + hex2(Math.round(g)) + hex2(Math.round(b));
export const parseImage = uri => { const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(uri || '')); return m ? { buf: Buffer.from(m[2], 'base64'), type: m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase() } : null; };

// The plain colour the graphic sits on: the most common colour round the edge, when it really is most of the edge. null when the background is busy (a photo, a gradient).
function edgeBackground(rgba, w, h) {
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.02)), bins = new Map(); let n = 0, clear = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= ring && y >= ring && x < w - ring && y < h - ring) continue;
    const i = (y * w + x) * 4; n++; if (rgba[i + 3] < 128) { clear++; continue; }
    const k = (rgba[i] >> 4) << 8 | (rgba[i + 1] >> 4) << 4 | (rgba[i + 2] >> 4), b = bins.get(k) || [0, 0, 0, 0]; b[0] += rgba[i]; b[1] += rgba[i + 1]; b[2] += rgba[i + 2]; b[3]++; bins.set(k, b);
  }
  if (clear / n > 0.5) return { transparent: true };
  let best = null; for (const b of bins.values()) if (!best || b[3] > best[3]) best = b;
  if (!best || best[3] / n < 0.6) return null;
  return { rgb: [best[0] / best[3], best[1] / best[3], best[2] / best[3]], share: best[3] / n };
}

// → { png, width, height, background: '#rrggbb' | 'transparent' | null, changed }. changed: a clean file was made; false when the graphic already
// had a transparent background or its background is too busy to take out without guessing, in which case the original is all there is.
export async function cleanArt(input) {
  const img = Buffer.isBuffer(input) ? { buf: input } : parseImage(input); if (!img) throw new Error('No readable image');
  const { data, info } = await sharp(img.buf).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, bg = edgeBackground(data, w, h);
  if (!bg || bg.transparent) {
    const png = await sharp(img.buf).rotate().ensureAlpha().png().toBuffer();
    return { png, width: w, height: h, background: bg ? 'transparent' : null, changed: false };
  }
  const [br, bgc, bb] = bg.rgb, out = Buffer.alloc(w * h * 4), LO = 14, HI = 70;
  for (let k = 0; k < w * h; k++) {
    const i = k * 4, r = data[i], g = data[i + 1], b = data[i + 2], d = Math.hypot(r - br, g - bgc, b - bb);
    const a = d <= LO ? 0 : d >= HI ? 1 : (d - LO) / (HI - LO);
    // a soft edge keeps its anti-aliasing: the colour is the graphic's own, with the background's share taken back out
    const un = c => a > 0 && a < 1 ? Math.max(0, Math.min(255, Math.round((c.v - c.bg * (1 - a)) / a))) : c.v;
    out[i] = un({ v: r, bg: br }); out[i + 1] = un({ v: g, bg: bgc }); out[i + 2] = un({ v: b, bg: bb }); out[i + 3] = Math.round(a * data[i + 3]);
  }
  let png = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  try { png = await sharp(png).trim({ threshold: 1 }).extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(); } catch { /* nothing left to trim */ }
  const meta = await sharp(png).metadata();
  return { png, width: meta.width, height: meta.height, background: toHex(br, bgc, bb), changed: true };
}

// The inks: the colours the graphic is made of, largest first, each with its Pantone C chip. Transparent and near-transparent pixels do not count.
export async function artColours(input, { max = 4 } = {}) {
  const buf = Buffer.isBuffer(input) ? input : parseImage(input)?.buf; if (!buf) return [];
  const { data, info } = await sharp(buf).ensureAlpha().resize({ width: 220, height: 220, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const bins = new Map(); let total = 0;
  for (let i = 0; i < info.width * info.height * 4; i += 4) {
    if (data[i + 3] < 200) continue; total++;
    const k = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3), b = bins.get(k) || [0, 0, 0, 0]; b[0] += data[i]; b[1] += data[i + 1]; b[2] += data[i + 2]; b[3]++; bins.set(k, b);
  }
  if (!total) return [];
  const sorted = [...bins.values()].map(b => ({ hex: toHex(b[0] / b[3], b[1] / b[3], b[2] / b[3]), n: b[3] })).sort((a, b) => b.n - a.n), merged = [];
  for (const c of sorted) { const near = merged.find(m => colourDistance(m.hex, c.hex) < 14); if (near) near.n += c.n; else merged.push({ ...c }); }
  const P = globalThis.FBPantone;
  return merged.filter(c => c.n / total >= 0.04).slice(0, max).map(c => { const name = nearestName(c.hex); return { hex: c.hex, name, share: Math.round(c.n / total * 1000) / 1000, code: P ? P.code(c.hex, { hint: name }) || '' : '' }; });
}

// Is the file big enough to print at the width it will be used? 300 dpi is the usual ask; 150 holds up for a bold, simple print; below that it will look soft.
export function printCheck({ widthPx, heightPx, widthIn = 4 }) {
  const w = Math.max(1, Math.round(widthPx)), h = Math.round(heightPx || 0), inch = widthIn > 0 ? widthIn : 4, dpi = Math.round(w / inch), maxIn = Math.floor(w / 300 * 10) / 10;
  const level = dpi >= 300 ? 'ok' : dpi >= 150 ? 'low' : 'poor', size = `${w} × ${h} px`;
  const message = level === 'ok' ? `${size}: sharp enough to print up to ${maxIn} in wide.`
    : level === 'low' ? `${size} is ${dpi} dpi at ${inch} in wide; print wants 300. It holds up to ${maxIn} in wide, or send a larger or vector file (AI, EPS, SVG).`
    : `${size} is only ${dpi} dpi at ${inch} in wide: too small to print cleanly. A vector file (AI, EPS, SVG) or a much larger image is needed.`;
  return { dpi, level, maxIn, widthPx: w, heightPx: h, widthIn: inch, message };
}

// A graphic found on a product in a photo: cropped out as a starting point. null when the box is missing, tiny, or most of the picture.
export async function graphicCrop(input, graphic, { pad = 0.04, max = 1200 } = {}) {
  const img = Buffer.isBuffer(input) ? { buf: input } : parseImage(input), b = graphic && graphic.present ? graphic.box : null; if (!img || !b) return null;
  const meta = await sharp(img.buf).rotate().metadata(), W = meta.width || 0, H = meta.height || 0; if (!W || !H) return null;
  const area = b.w * b.h; if (!(b.w > 0.04 && b.h > 0.04) || area < 0.01 || area > 0.65) return null;
  const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad), x1 = Math.min(1, b.x + b.w + pad), y1 = Math.min(1, b.y + b.h + pad);
  const left = Math.round(x0 * W), top = Math.round(y0 * H), width = Math.max(1, Math.round((x1 - x0) * W)), height = Math.max(1, Math.round((y1 - y0) * H));
  const out = await sharp(img.buf).rotate().extract({ left, top, width, height }).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return { image: `data:image/png;base64,${out.toString('base64')}`, width, height };
}
