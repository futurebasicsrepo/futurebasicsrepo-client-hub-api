// Simulated process, done as index separations: full-colour art (a photo, a painting, soft gradients) printed with a handful of spot inks.
// Each pixel of the art at print resolution is given to one ink by error diffusion, so the inks print as square dots of one size side by
// side and the eye mixes them, the way a screen printer separates a photo-real graphic for a dark shirt. On a dark garment a white underbase
// goes under every ink but black (choked a pixel, so it never peeks out), and a highlight white prints last.
//
//   indexSeparate(png, { widthIn, garment, inks, dpi, name })
//     → { width, height, dpi, garment, dark, plates: [{ n, hex, pantone, coverage, role, png, film }], underbase: png | null, order: [..],
//         warnings: [..], files: [{ name, data }] }   plates in print order; png the ink in its colour on clear, film black on white
//   inks: how many colours (2–10) besides the garment's own; the palette is the art's own main colours (k-means), with white and black
//   added where the art has them, each matched to Pantone C
import sharp from 'sharp';
import './pantone-c.js';

const lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const hexOf = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgbOf = h => { const n = parseInt(String(h).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// a colour distance that weights green most and blue least, as the eye does (a cheap stand-in for ΔE)
const d2 = (a, b) => { const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; };

// the art's main colours, k-means on a sample of its solid pixels, started along its tones so the same art gives the same inks
export function paletteOf(px, N, k) {
  const pts = []; const step = Math.max(1, Math.floor(N / 30000));
  for (let i = 0; i < N; i += step) if (px[i * 4 + 3] > 128) pts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
  if (!pts.length) return [];
  const byTone = pts.slice().sort((a, b) => lum(...a) - lum(...b)); let C = Array.from({ length: k }, (_, j) => [...byTone[Math.min(byTone.length - 1, Math.floor((j + .5) / k * byTone.length))]]);
  for (let it = 0; it < 10; it++) {
    const S = C.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let b = 0, bd = Infinity; for (let j = 0; j < C.length; j++) { const d = d2(p, C[j]); if (d < bd) { bd = d; b = j; } } S[b][0] += p[0]; S[b][1] += p[1]; S[b][2] += p[2]; S[b][3]++; }
    C = C.map((c, j) => (S[j][3] ? [S[j][0] / S[j][3], S[j][1] / S[j][3], S[j][2] / S[j][3]] : c));
  }
  // near-duplicates merged
  const out = []; for (const c of C) if (!out.some(o => d2(o, c) < 900)) out.push(c); return out;
}

export async function indexSeparate(png, { widthIn = 10, garment = '#141416', inks = 6, dpi = 200, name = 'Graphic' } = {}) {
  const meta = await sharp(png).metadata(), W = Math.max(16, Math.min(3000, Math.round(widthIn * dpi))), H = Math.max(16, Math.round(W * (meta.height || 1) / (meta.width || 1)));
  const { data: px } = await sharp(png).ensureAlpha().resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const N = W * H, g = rgbOf(/^#[0-9a-f]{6}$/i.test(garment) ? garment : '#141416'), dark = lum(...g) < 128, P = globalThis.FBPantone;
  // the inks: the art's own colours; on a dark shirt a highlight white and a black are kept apart from the rest (they do different jobs)
  let pal = paletteOf(px, N, Math.max(2, Math.min(10, inks)));
  const hasLight = pal.some(c => lum(...c) > 242), hasDark = pal.some(c => lum(...c) < 40); // only near-white goes to the highlight white: a cream is an ink of its own
  pal = pal.filter(c => lum(...c) <= 242 && lum(...c) >= 40);
  if (hasLight) pal.push([255, 255, 255]); if (hasDark && dark === false) pal.push([20, 20, 22]); else if (hasDark && d2([20, 20, 22], g) > 2500) pal.push([20, 20, 22]);
  const list = [...pal, g]; // the garment last: a pixel given to it gets no ink (the shirt shows)
  // Floyd–Steinberg, in serpentine order (no worming), each pixel to its nearest ink and its error carried on
  const err = new Float32Array(N * 3), idx = new Int16Array(N).fill(-1);
  for (let y = 0; y < H; y++) {
    const ltr = y % 2 === 0;
    for (let xi = 0; xi < W; xi++) {
      const x = ltr ? xi : W - 1 - xi, i = y * W + x, a = px[i * 4 + 3] / 255; if (a < .5) continue;
      const c = [0, 1, 2].map(k => Math.max(0, Math.min(255, px[i * 4 + k] * a + g[k] * (1 - a) + err[i * 3 + k]))); let b = 0, bd = Infinity; // clamped: a colour the inks cannot reach must not pile error up and smear down the art
      for (let j = 0; j < list.length; j++) { const d = d2(c, list[j]); if (d < bd) { bd = d; b = j; } }
      idx[i] = b; const e = [0, 1, 2].map(k => (c[k] - list[b][k]) * .85), dir = ltr ? 1 : -1; // a little of the error let go, so it never runs away
      const push = (xx, yy, f) => { if (xx < 0 || xx >= W || yy >= H) return; const j = yy * W + xx; if (px[j * 4 + 3] < 128) return; for (let k = 0; k < 3; k++) err[j * 3 + k] += e[k] * f; };
      push(x + dir, y, 7 / 16); push(x - dir, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + dir, y + 1, 1 / 16);
    }
  }
  const gi = list.length - 1, counts = new Array(list.length).fill(0); let solid = 0; for (let i = 0; i < N; i++) if (idx[i] >= 0) { counts[idx[i]]++; solid++; }
  const isWhite = c => lum(...c) > 245, isBlack = c => lum(...c) < 30;
  // print order: the colours light to dark, the highlight white last (on a dark shirt; on a light one it is just another ink)
  const order = pal.map((c, j) => j).filter(j => counts[j] / (solid || 1) > .002).sort((a, b) => {
    if (dark && isWhite(pal[a]) !== isWhite(pal[b])) return isWhite(pal[a]) ? 1 : -1; return lum(...pal[b]) - lum(...pal[a]); });
  const mask = j => { const out = Buffer.alloc(N * 4); const [r, gg, bb] = pal[j]; for (let i = 0; i < N; i++) if (idx[i] === j) { out[i * 4] = r; out[i * 4 + 1] = gg; out[i * 4 + 2] = bb; out[i * 4 + 3] = 255; } return out; };
  const film = j => { const out = Buffer.alloc(N, 255); for (let i = 0; i < N; i++) if (idx[i] === j) out[i] = 0; return out; };
  const plates = [];
  for (const [n, j] of order.entries()) {
    const hex = hexOf(pal[j]), code = isWhite(pal[j]) ? 'White' : P ? P.code(hex) || '' : '';
    plates.push({ n: n + 1, hex, pantone: code, coverage: Math.round(counts[j] / N * 1000) / 1000, role: dark && isWhite(pal[j]) ? 'highlight white' : 'colour',
      png: await sharp(mask(j), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), film: await sharp(film(j), { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer() });
  }
  // the underbase: under every ink but black, choked one pixel so it never shows past the colour
  let underbase = null;
  if (dark) {
    const ub = new Uint8Array(N); for (let i = 0; i < N; i++) { const j = idx[i]; if (j >= 0 && j !== gi && !isBlack(list[j])) ub[i] = 1; }
    const ch = new Uint8Array(N); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; ch[i] = ub[i] && ub[i - 1] && ub[i + 1] && ub[i - W] && ub[i + W] ? 1 : 0; }
    const fb = Buffer.alloc(N, 255); for (let i = 0; i < N; i++) if (ch[i]) fb[i] = 0;
    underbase = await sharp(fb, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
  }
  const steps = [...(underbase ? ['White underbase', 'Flash'] : []), ...plates.map(p => `${p.pantone || p.hex}${p.role === 'highlight white' ? ' (highlight)' : ''}`)];
  const warnings = [];
  if (plates.length > 8) warnings.push(`${plates.length} screens: most presses take 6 to 8 colours plus the underbase.`);
  if (!dark) warnings.push('A light garment: simulated process is for dark shirts; on a light one, four-colour process or a few spot colours usually prints cleaner.');
  if (solid < N * .02) warnings.push('There is very little art to print.');
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graphic';
  const files = [...(underbase ? [{ name: `${slug}/00-underbase-white.png`, data: underbase }] : []),
    ...plates.map(p => ({ name: `${slug}/${String(p.n).padStart(2, '0')}-${(p.pantone || p.hex).replace(/[^A-Za-z0-9]+/g, '-')}.png`, data: p.film })),
    { name: `${slug}/job.txt`, data: Buffer.from([`${name}: simulated process (index separation)`, `${widthIn} in wide at ${dpi} dpi (${W} × ${H} px); every dot the same size, one pixel square`,
      `Garment ${hexOf(g)}${dark ? ' (dark: white underbase, flashed)' : ''}`, 'On the press, in this order:', ...steps.map((s, i) => `  ${i + 1}. ${s}`),
      'Films are black where the ink goes. Print at the size above, with no scaling; the index dots need a fine mesh (230 or finer).', ...warnings.map(w => `! ${w}`)].join('\n') + '\n') }];
  return { width: W, height: H, dpi, garment: hexOf(g), dark, plates, underbase, order: steps, warnings, files };
}
