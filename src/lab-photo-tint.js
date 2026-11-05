// Recolours a materials-library photo (src/material-photos, made by scripts/build-material-photos.mjs) to a material's colour: the grey close-up
// keeps the weave's light and shade, the colour sets the cloth. Works in linear light so dark cloth keeps its texture and pale cloth its shadows.
// Trim photos are in colour already and come back as they are. Results are kept in memory (the last 300).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { photoById } from './lab-photos.js';

const DIR = new URL('./material-photos/', import.meta.url), HEX = /^#?[0-9a-f]{6}$/i;
const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const ENC = new Uint8Array(4096).map((_, i) => { const v = i / 4095; return Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)); });
const enc = v => ENC[Math.max(0, Math.min(4095, Math.round(v * 4095)))];
const greys = new Map(), done = new Map();

function tint(g, hex) {
  const c = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16))), Y = .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  const lift = c.map(v => Math.max(v, .07) * 1.5 + .07 * (1 - Y)), out = Buffer.alloc(g.length * 3);
  for (let i = 0; i < g.length; i++) {
    const t = (g[i] - 128) / 128; // −1 (shade) … 1 (light)
    for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = enc(t >= 0 ? c[ch] + lift[ch] * t * .9 : c[ch] * (1 + t * .85));
  }
  return out;
}

// → JPEG Buffer, or null when there is no such photo
export async function photoJpeg(id, colour = '', size = 640) {
  const p = photoById(id); if (!p) return null;
  const px = [160, 320, 640].includes(Number(size)) ? Number(size) : 640, hex = HEX.test(String(colour)) ? `#${String(colour).replace('#', '').toLowerCase()}` : '#b9b4a8';
  const key = `${p.id}|${p.tint ? hex : ''}|${px}`; if (done.has(key)) return done.get(key);
  let file; try { file = readFileSync(new URL(`${p.id}.jpg`, DIR)); } catch { return null; }
  let buf;
  if (!p.tint) buf = await sharp(file).resize({ width: px, height: px, fit: 'cover' }).jpeg({ quality: 84 }).toBuffer();
  else {
    if (!greys.has(p.id)) greys.set(p.id, await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true }));
    const { data, info } = greys.get(p.id);
    buf = await sharp(tint(data.length === info.width * info.height ? data : data.filter((_, i) => i % info.channels === 0), hex), { raw: { width: info.width, height: info.height, channels: 3 } })
      .resize(px, px).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  }
  done.set(key, buf); if (done.size > 300) done.delete(done.keys().next().value);
  return buf;
}

// A close-up as a shading tile for a flat drawing (renderSvg's texture): grey, its weave spread evenly around a light mean so it can be multiplied
// over any colour without darkening it much, and mirrored four ways into one tile that repeats without seams. → JPEG Buffer, or null.
const shades = new Map();
export async function photoShade(id, size = 320) {
  const p = photoById(id); if (!p) return null;
  const px = [160, 320, 640].includes(Number(size)) ? Number(size) : 320, key = `${p.id}|${px}`; if (shades.has(key)) return shades.get(key);
  let file; try { file = readFileSync(new URL(`${p.id}.jpg`, DIR)); } catch { return null; }
  const half = px / 2, { data } = await sharp(file).greyscale().resize(half, half, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  const g = data.length === half * half ? data : data.filter((_, i) => i % (data.length / (half * half)) === 0);
  let m = 0; for (const v of g) m += v; m /= g.length; let sd = 0; for (const v of g) sd += (v - m) ** 2; sd = Math.sqrt(sd / g.length) || 1;
  const t = Buffer.alloc(g.length); for (let i = 0; i < g.length; i++) t[i] = Math.max(SHADE_MIN, Math.min(255, Math.round(SHADE_MEAN + SHADE_SPREAD * (g[i] - m) / sd)));
  const q = { raw: { width: half, height: half, channels: 1 } }, tl = await sharp(t, q).png().toBuffer();
  const [tr, bl, br] = await Promise.all([sharp(t, q).flop().png().toBuffer(), sharp(t, q).flip().png().toBuffer(), sharp(t, q).flip().flop().png().toBuffer()]);
  const buf = await sharp({ create: { width: px, height: px, channels: 3, background: '#ffffff' } })
    .composite([{ input: tl, left: 0, top: 0 }, { input: tr, left: half, top: 0 }, { input: bl, left: 0, top: half }, { input: br, left: half, top: half }]).greyscale().jpeg({ quality: 86 }).toBuffer();
  shades.set(key, buf); if (shades.size > 200) shades.delete(shades.keys().next().value);
  return buf;
}
// the tile's light mean and how far the weave spreads from it (one standard deviation), in 0–255: a colour under it keeps its own value
const SHADE_MEAN = 228, SHADE_SPREAD = 22, SHADE_MIN = 150;
