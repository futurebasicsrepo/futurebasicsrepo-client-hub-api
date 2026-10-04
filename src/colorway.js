// Colourway tiles: the reference photo recoloured to each colourway in the pack, panel by panel, with shading kept.
// Deterministic image work, no model. The product is separated from the background by an edge-bounded flood
// fill from the border, then split into its colour panels (k-means in Lab, smoothed so panels follow seams instead of noise). Each
// tile recolours the main panel to the colourway and shifts the other panels tonally so they stay distinct; white
// soles and trims and contrast accents keep their colour. With two or more swatches a "pack palette" tile also puts
// each colour on its own panel. Every pixel keeps its lightness relative to its panel, so seams and shading survive.
// Honest and instant; a concept visual for the client, never a factory reference.
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
export function productMask(rgb, w, h, { threshold = 34, edge = 6 } = {}) {
  const px = (x, y) => (y * w + x) * 3, strip = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const samples = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < strip || y < strip || x >= w - strip || y >= h - strip) { const i = px(x, y); samples[0].push(rgb[i]); samples[1].push(rgb[i + 1]); samples[2].push(rgb[i + 2]); }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const bg = [med(samples[0]), med(samples[1]), med(samples[2])];
  // a flat studio backdrop gets a tight tolerance, a busy or vignetted one keeps the loose default
  const spread = []; for (let k = 0; k < samples[0].length; k += 3) spread.push(Math.hypot(samples[0][k] - bg[0], samples[1][k] - bg[1], samples[2][k] - bg[2]));
  spread.sort((p, q) => p - q); const tol = Math.min(threshold, Math.max(10, spread[Math.floor(spread.length * 0.9)] * 3 + 4));
  const near = i => Math.hypot(rgb[i] - bg[0], rgb[i + 1] - bg[1], rgb[i + 2] - bg[2]) < tol;
  // outlines: a box-blurred luminance step across a few pixels. The fill can't cross them, so a light product on a
  // light backdrop (cream tee on white, stone cap on grey) stops at its own silhouette instead of being swallowed.
  const lum = new Float32Array(w * h), blur = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) lum[k] = rgb[k * 3] * 0.299 + rgb[k * 3 + 1] * 0.587 + rgb[k * 3 + 2] * 0.114;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += lum[yy * w + xx]; n++; } } blur[y * w + x] = s / n; }
  const wall = new Uint8Array(w * h);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { const k = y * w + x; if (Math.max(Math.abs(blur[k - 2] - blur[k + 2]), Math.abs(blur[k - 2 * w] - blur[k + 2 * w])) > edge) wall[k] = 1; }
  // thicken the walls so small gaps in a soft outline still close, then give that margin back once the fill is done
  const thick = new Uint8Array(w * h), r = Math.max(2, Math.round(Math.min(w, h) / 200));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (wall[y * w + x]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) thick[yy * w + xx] = 1; }
  const mask = new Uint8Array(w * h).fill(1), queue = [];
  const push = (x, y) => { const k = y * w + x; if (!mask[k] || thick[k] || !near(k * 3)) return; mask[k] = 0; queue.push(k); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (queue.length) { const k = queue.pop(), x = k % w, y = (k - x) / w; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let pass = 0; pass < r; pass++) { const grow = [];
    for (let k = 0; k < w * h; k++) { if (!mask[k] || wall[k] || !near(k * 3)) continue; const x = k % w; if ((x > 0 && !mask[k - 1]) || (x < w - 1 && !mask[k + 1]) || (k >= w && !mask[k - w]) || (k < w * h - w && !mask[k + w])) grow.push(k); }
    for (const k of grow) mask[k] = 0; }
  // stray outline fragments out in the backdrop (paper texture, vignette) aren't product: drop blobs under 0.3%
  const comp = new Int32Array(w * h).fill(-1), sizes = [];
  for (let s0 = 0; s0 < w * h; s0++) { if (!mask[s0] || comp[s0] >= 0) continue; const id = sizes.length, st = [s0]; comp[s0] = id; let n = 0;
    while (st.length) { const k = st.pop(), x = k % w; n++; for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) if (j >= 0 && j < w * h && mask[j] && comp[j] < 0) { comp[j] = id; st.push(j); } }
    sizes.push(n); }
  for (let k = 0; k < w * h; k++) if (mask[k] && sizes[comp[k]] < w * h * 0.003) mask[k] = 0;
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

// ---- panels ------------------------------------------------------------------------------------------------------
const srgbLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const labF = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
export function rgbToLab(r, g, b) {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b);
  const x = labF((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), y = labF(R * 0.2126 + G * 0.7152 + B * 0.0722), z = labF((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// Splits the product into colour panels. Returns a label per pixel (-1 = background) and one summary per panel:
// kind is 'white' (soles, trims), 'accent' (a small panel in a clearly different saturated colour), 'main' (the
// largest remaining panel) or 'tone' (every other panel).
export function segmentPanels(rgb, w, h, mask, { k = 6, iterations = 10, minShare = 0.015, mergeDE = 17 } = {}) {
  const n = w * h, lab = new Float32Array(n * 3), idx = [];
  for (let p = 0; p < n; p++) { if (!mask[p]) continue; const [L, A, B] = rgbToLab(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]); lab[p * 3] = L; lab[p * 3 + 1] = A; lab[p * 3 + 2] = B; idx.push(p); }
  const labels = new Int16Array(n).fill(-1); if (!idx.length) return { labels, panels: [] };
  const step = Math.max(1, Math.floor(idx.length / 24000)), sample = idx.filter((_, i) => i % step === 0), at = p => [lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]];
  // deterministic farthest-point seeding, then Lloyd iterations on the sample
  const centers = [at(sample[Math.floor(sample.length / 2)])];
  while (centers.length < Math.min(k, sample.length)) { let best = -1, bd = -1; for (const p of sample) { const v = at(p); let m = Infinity; for (const c of centers) m = Math.min(m, d2(v, c)); if (m > bd) { bd = m; best = p; } } if (bd < 16) break; centers.push(at(best)); }
  const nearest = v => { let bi = 0, bd = Infinity; for (let c = 0; c < centers.length; c++) { const dd = d2(v, centers[c]); if (dd < bd) { bd = dd; bi = c; } } return bi; };
  for (let it = 0; it < iterations; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of sample) { const v = at(p), c = nearest(v), s = sum[c]; s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; s[3]++; }
    sum.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  // clusters only a shading step apart (same fabric in light and shadow) are one panel
  const group = centers.map((_, i) => i), find = i => group[i] === i ? i : (group[i] = find(group[i]));
  for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) if (d2(centers[i], centers[j]) < mergeDE * mergeDE) group[find(j)] = find(i);
  for (const p of idx) labels[p] = find(nearest(at(p)));
  // majority smoothing so a panel follows its seams, not every highlight or shadow
  for (let pass = 0; pass < 3; pass++) {
    const next = Int16Array.from(labels), votes = new Int32Array(centers.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x; if (labels[p] < 0) continue; votes.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = labels[p + dy * w + dx]; if (q >= 0) votes[q]++; }
      let bi = labels[p], bv = votes[bi]; for (let c = 0; c < votes.length; c++) if (votes[c] > bv) { bv = votes[c]; bi = c; } next[p] = bi;
    }
    labels.set(next);
  }
  // fold tiny panels into their nearest neighbour in colour
  const area = new Array(centers.length).fill(0); for (const p of idx) area[labels[p]]++;
  const keep = area.map(a => a >= idx.length * minShare), remap = centers.map((c, i) => { if (keep[i]) return i; let bi = -1, bd = Infinity; centers.forEach((o, j) => { if (j !== i && keep[j] && d2(c, o) < bd) { bd = d2(c, o); bi = j; } }); return bi < 0 ? i : bi; });
  for (const p of idx) labels[p] = remap[labels[p]];
  const stats = centers.map(() => ({ area: 0, l: 0, s: 0, hx: 0, hy: 0, r: 0, g: 0, b: 0, L: 0, chroma: 0 }));
  for (const p of idx) { const st = stats[labels[p]], [hh, ss, ll] = rgbToHsl(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]); st.area++; st.l += ll; st.s += ss; st.hx += Math.cos(hh * 2 * Math.PI) * ss; st.hy += Math.sin(hh * 2 * Math.PI) * ss; st.r += rgb[p * 3]; st.g += rgb[p * 3 + 1]; st.b += rgb[p * 3 + 2]; st.L += lab[p * 3]; st.chroma += Math.hypot(lab[p * 3 + 1], lab[p * 3 + 2]); }
  const panels = stats.map((st, id) => st.area ? { id, area: st.area, share: st.area / idx.length, meanL: st.l / st.area, meanS: st.s / st.area, hue: ((Math.atan2(st.hy, st.hx) / (2 * Math.PI)) + 1) % 1, labL: st.L / st.area, chroma: st.chroma / st.area, rgb: [st.r, st.g, st.b].map(v => Math.round(v / st.area)) } : null).filter(Boolean);
  // the largest panel is the garment's own colour, even when that is white or ecru; a white part or a contrast accent
  // must stand clearly apart from it, otherwise it is just the same fabric in light or shadow
  panels.sort((a, b) => b.area - a.area); const main = panels[0]; main.kind = 'main';
  const far = pn => Math.sqrt(d2([pn.labL, 0, 0], [main.labL, 0, 0]) + (pn.chroma - main.chroma) ** 2) > 22 || (pn.chroma > 12 && main.chroma > 12 && hueDist(pn.hue, main.hue) > 0.1);
  for (const pn of panels.slice(1)) pn.kind = !far(pn) ? 'tone' : pn.labL > 78 && pn.chroma < 10 ? 'white' : pn.chroma > 20 && pn.share < 0.3 && (main.chroma < 12 || hueDist(pn.hue, main.hue) > 0.08) ? 'accent' : 'tone';
  return { labels, panels: panels.sort((a, b) => b.area - a.area) };
}

// One target colour per panel id; panels without an entry keep their pixels. Lightness keeps its distance from the
// panel's own mean, so seams, shadows and highlights survive.
export function recolorPanels(rgb, w, h, seg, targets) {
  const out = Buffer.from(rgb), byId = new Map(seg.panels.map(pn => [pn.id, pn])); let changed = 0;
  const plan = new Map();
  for (const [id, t] of targets) { const pn = byId.get(id); if (!pn || !t) continue; const [th, ts, tl] = rgbToHsl(...t); plan.set(id, { th, ts, tl, meanL: pn.meanL }); }
  for (let p = 0; p < w * h; p++) {
    const lb = seg.labels[p]; if (lb < 0) continue; const t = plan.get(lb); if (!t) continue;
    const i = p * 3, [, s, l] = rgbToHsl(rgb[i], rgb[i + 1], rgb[i + 2]);
    const l2 = clamp01(t.tl + (l - t.meanL) * 0.9), s2 = clamp01(t.ts * (0.8 + 0.2 * Math.min(1, s / 0.4)));
    const [r, g, b] = hslToRgb(t.th, s2, l2); out[i] = r; out[i + 1] = g; out[i + 2] = b; changed++;
  }
  return { pixels: out, recolored: changed };
}

// A colourway led by one colour: the main panel takes it; the other non-white, non-accent panels take tones of it
// that keep their original contrast with the main panel (flipped when the shift would run off black or white).
export function leadTargets(seg, hex) {
  const t = hexToRgb(hex); if (!t) return null; const [th, ts, tl] = rgbToHsl(...t), main = seg.panels.find(pn => pn.kind === 'main'); if (!main) return null;
  const targets = new Map([[main.id, t]]);
  for (const pn of seg.panels) {
    if (pn.kind !== 'tone') continue; const dl = pn.meanL - main.meanL; let l = tl + dl; if (l < 0.07 || l > 0.93) l = clamp01(tl - dl * 0.6);
    if (Math.abs(l - tl) < 0.06) l = clamp01(tl + (tl > 0.5 ? -0.12 : 0.12));
    targets.set(pn.id, hslToRgb(th, clamp01(ts * 0.85), l));
  }
  return targets;
}

// The pack's own palette across panels: first colour on the main panel, the next on the next-largest panel, and so on;
// a colour that reads as an accent (saturated) goes to the accent panel when there is one.
export function paletteTargets(seg, hexes) {
  const cols = hexes.map(hexToRgb).filter(Boolean); if (cols.length < 2) return null;
  const order = [...seg.panels.filter(pn => pn.kind === 'main'), ...seg.panels.filter(pn => pn.kind === 'tone')], accent = seg.panels.find(pn => pn.kind === 'accent');
  if (!order.length) return null; const targets = new Map(); const rest = [...cols];
  if (accent && rest.length > order.length) { const sat = rest.map(c => rgbToHsl(...c)[1]), ai = sat.indexOf(Math.max(...sat)); targets.set(accent.id, rest.splice(ai, 1)[0]); }
  order.forEach((pn, i) => { if (rest[i]) targets.set(pn.id, rest[i]); });
  return targets;
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
  const seg = segmentPanels(rgb, w, h, mask), tiles = [], seen = new Set();
  const encode = async px => `data:image/jpeg;base64,${(await sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality }).toBuffer()).toString('base64')}`;
  const valid = (colorways || []).filter(c => hexToRgb(c?.swatch));
  for (const c of valid.slice(0, limit)) {
    const id = `cw-${slug(c.name)}`; if (seen.has(id)) continue; seen.add(id);
    const targets = leadTargets(seg, c.swatch); const r = targets ? recolorPanels(rgb, w, h, seg, targets) : recolorPixels(rgb, w, h, mask, plan, c.swatch); if (!r) continue;
    tiles.push({ id, name: c.name, swatch: c.swatch.toLowerCase(), image: await encode(r.pixels), mode: targets ? 'panels' : plan.mode, recolored: r.recolored });
  }
  // the pack's whole palette, one colour per panel, when the photo has more than one panel to give it
  const uniq = [...new Map(valid.map(c => [c.swatch.toLowerCase(), c])).values()];
  const pal = seg.panels.filter(pn => pn.kind !== 'white' && pn.share >= 0.08).length > 1 && uniq.length > 1 ? paletteTargets(seg, uniq.map(c => c.swatch)) : null;
  if (pal && tiles.length < limit) { const r = recolorPanels(rgb, w, h, seg, pal); tiles.push({ id: 'cw-pack-palette', name: uniq.slice(0, 3).map(c => c.name).join(' / '), swatch: uniq[0].swatch.toLowerCase(), image: await encode(r.pixels), mode: 'palette', recolored: r.recolored }); }
  return tiles;
}
// Keep uploaded renderings, replace earlier generated tiles, respect the pack's limit.
export function mergeColorwayTiles(renderings, tiles, { limit = 6, note = 'Generated from the reference photo · concept visual, not a factory spec' } = {}) {
  const kept = (renderings || []).filter(r => !/^cw-/.test(String(r?.id || '')));
  return [...kept, ...tiles.map(t => ({ id: t.id, name: `Colourway — ${t.name}`, note, image: t.image }))].slice(0, limit);
}
