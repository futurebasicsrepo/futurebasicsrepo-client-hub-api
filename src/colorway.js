// Colourway tiles: the reference photo recoloured to each colourway in the pack, with shading kept.
// Deterministic image work, no model: the product is separated from the background by flood-filling the border
// colour, then either its dominant colour region (a product with a clear accent) or its whole body (a neutral product)
// is shifted to the target colour while every pixel keeps its lightness relative to the region. Honest and instant;
// a concept visual for the client, never a factory reference.
import sharp from 'sharp';

const clamp01 = v => Math.min(1, Math.max(0, v));
export function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; let h = 0, s = 0;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? ((b - r) / d + 2) : ((r - g) / d + 4); h /= 6; }
  return [h, s, l];
}
export function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

// 1 where the pixel is product, 0 where it is background reachable from the border. The background colour is the
// median of the border strip; anything close to it and connected to the edge is background, so a white logo inside
// the product stays product.
export function productMask(rgb, w, h, { threshold = 34 } = {}) {
  const px = (x, y) => (y * w + x) * 3, strip = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const samples = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < strip || y < strip || x >= w - strip || y >= h - strip) { const i = px(x, y); samples[0].push(rgb[i]); samples[1].push(rgb[i + 1]); samples[2].push(rgb[i + 2]); }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const bg = [med(samples[0]), med(samples[1]), med(samples[2])];
  const near = i => Math.hypot(rgb[i] - bg[0], rgb[i + 1] - bg[1], rgb[i + 2] - bg[2]) < threshold;
  const mask = new Uint8Array(w * h).fill(1), seen = new Uint8Array(w * h), queue = [];
  const push = (x, y) => { const k = y * w + x; if (seen[k]) return; seen[k] = 1; if (near(k * 3)) { mask[k] = 0; queue.push(k); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (queue.length) { const k = queue.pop(), x = k % w, y = (k - x) / w; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  return { mask, background: bg };
}

// Decide what to recolour: the dominant colour region when the product has a clear accent, the whole body otherwise.
export function recolorPlan(rgb, w, h, mask) {
  const bins = new Array(24).fill(0); let product = 0, saturated = 0;
  for (let k = 0; k < w * h; k++) { if (!mask[k]) continue; product++; const [hh, s, l] = rgbToHsl(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]); if (s > 0.28 && l > 0.1 && l < 0.92) { saturated++; bins[Math.floor(hh * 24) % 24]++; } }
  const satFrac = product ? saturated / product : 0, top = bins.indexOf(Math.max(...bins));
  return satFrac >= 0.3 ? { mode: 'accent', hue: (top + 0.5) / 24, satFrac, product } : { mode: 'body', hue: null, satFrac, product };
}

export function recolorPixels(rgb, w, h, mask, plan, targetHex) {
  const t = hexToRgb(targetHex); if (!t) return null;
  const [th, ts, tl] = rgbToHsl(...t);
  // body mode leaves near-white parts (soles, trims, highlights) and near-black outlines alone
  const inRegion = (hh, s, l) => plan.mode === 'accent' ? (s > 0.15 && hueDist(hh, plan.hue) < 0.085) : (l < 0.86 && l > 0.05);
  let sumL = 0, n = 0;
  for (let k = 0; k < w * h; k++) { if (!mask[k]) continue; const [hh, s, l] = rgbToHsl(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]); if (inRegion(hh, s, l)) { sumL += l; n++; } }
  const meanL = n ? sumL / n : 0.5, out = Buffer.from(rgb);
  // lightness keeps its distance from the region's mean, so seams, shadows and highlights survive the shift
  for (let k = 0; k < w * h; k++) {
    if (!mask[k]) continue; const i = k * 3, [hh, s, l] = rgbToHsl(rgb[i], rgb[i + 1], rgb[i + 2]); if (!inRegion(hh, s, l)) continue;
    const l2 = clamp01(tl + (l - meanL) * 0.9), s2 = clamp01(ts * (0.75 + 0.25 * Math.min(1, s / 0.5)));
    const [r, g, b] = hslToRgb(th, s2, l2); out[i] = r; out[i + 1] = g; out[i + 2] = b;
  }
  return { pixels: out, recolored: n, meanL };
}

const slug = s => String(s || 'colour').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'colour';
// photoDataUrl → one JPEG tile per colourway (those with a valid swatch), as data URLs ready for the pack's renderings.
export async function renderColorways(photoDataUrl, colorways, { max = 900, quality = 84, limit = 6 } = {}) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(photoDataUrl || '')); if (!m) return [];
  const src = sharp(Buffer.from(m[2], 'base64')).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' });
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, rgb = info.channels === 3 ? data : (() => { const o = Buffer.alloc(w * h * 3); for (let k = 0; k < w * h; k++) { o[k * 3] = data[k * info.channels]; o[k * 3 + 1] = data[k * info.channels + 1]; o[k * 3 + 2] = data[k * info.channels + 2]; } return o; })();
  const { mask } = productMask(rgb, w, h); const plan = recolorPlan(rgb, w, h, mask);
  if (!plan.product || plan.product < w * h * 0.02) return [];
  const tiles = [], seen = new Set();
  for (const c of (colorways || []).filter(c => hexToRgb(c?.swatch)).slice(0, limit)) {
    const id = `cw-${slug(c.name)}`; if (seen.has(id)) continue; seen.add(id);
    const r = recolorPixels(rgb, w, h, mask, plan, c.swatch); if (!r) continue;
    const jpg = await sharp(r.pixels, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality }).toBuffer();
    tiles.push({ id, name: c.name, swatch: c.swatch.toLowerCase(), image: `data:image/jpeg;base64,${jpg.toString('base64')}`, mode: plan.mode, recolored: r.recolored });
  }
  return tiles;
}
// Keep uploaded renderings, replace earlier generated tiles, respect the pack's limit.
export function mergeColorwayTiles(renderings, tiles, { limit = 6, note = 'Generated from the reference photo · concept visual, not a factory spec' } = {}) {
  const kept = (renderings || []).filter(r => !/^cw-/.test(String(r?.id || '')));
  return [...kept, ...tiles.map(t => ({ id: t.id, name: `Colourway — ${t.name}`, note, image: t.image }))].slice(0, limit);
}
