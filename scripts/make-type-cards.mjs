// The Make page's bags and footwear cards (thefuturebasics.com/pages/make, "every product type"): six bags and six shoes from the Design
// Lab's own library (src/bag-templates, src/footwear-templates), each in a colourway of its own, as a designer would recolour them in the Studio.
//
//   node scripts/make-type-cards.mjs [out dir, default src/help-assets]
//
// Writes make-type-bags.webp and make-type-footwear.webp (1200 × 900, served at hub.thefuturebasics.com/help/assets/).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { shoeSvg } from '../src/lab-shoe-draw.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// a library drawing is in greys: light grey is the body, mid grey the second colour, dark grey the trim; cream (a sole) and near-white stay
function recolour(dw, { body, second, trim, sole }) {
  const panels = dw.panels.map(p => {
    const [r, g, b] = hex(p.fill), L = (r + g + b) / 3, warm = r - b > 8;
    let fill = p.fill;
    if (warm) fill = sole || p.fill; else if (L > 236) fill = p.fill; else if (L > 150) fill = body; else if (L > 95) fill = second; else if (L > 45) fill = trim; else fill = p.fill;
    return { ...p, fill };
  });
  return { ...dw, panels };
}
async function tile(file, view, cw, w, h) {
  const j = JSON.parse(readFileSync(file, 'utf8')), dw = recolour(j.views[view], cw);
  return sharp(Buffer.from(shoeSvg(dw, { width: w * 2 }))).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}
const BG = { r: 240, g: 241, b: 234 };
async function card(out, items, cols, W = 1200, H = 900, padX = 40, padY = 60) {
  const rows = Math.ceil(items.length / cols), cw = (W - 2 * padX) / cols, ch = (H - 2 * padY) / rows, comps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], w = Math.round(cw * (it.scale || .86)), h = Math.round(ch * (it.scale || .86));
    const buf = await tile(it.file, it.view, it.cw, w, h);
    comps.push({ input: buf, left: Math.round(padX + (i % cols) * cw + (cw - w) / 2), top: Math.round(padY + Math.floor(i / cols) * ch + (ch - h) / 2) });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(comps).webp({ quality: 82 }).toFile(out);
}
const B = id => `${ROOT}/src/bag-templates/${id}.json`, F = id => `${ROOT}/src/footwear-templates/${id}.json`;
const out = process.argv[2] || join(ROOT, 'src', 'help-assets');
await card(`${out}/make-type-bags.webp`, [
  { file: B('bag-rolltop'), view: 'front', cw: { body: '#5d6a45', second: '#2f3527', trim: '#1d1f1a' } },
  { file: B('bag-duffel'), view: 'front', cw: { body: '#b0743f', second: '#6b4122', trim: '#3a2516' }, scale: .9 },
  { file: B('bag-backpack'), view: 'front', cw: { body: '#2b3a55', second: '#1d273a', trim: '#121722' } },
  { file: B('bag-sling'), view: 'front', cw: { body: '#c4512b', second: '#7e2f17', trim: '#2a1a14' }, scale: .8 },
  { file: B('bag-tote'), view: 'front', cw: { body: '#e6dcc4', second: '#2b3a55', trim: '#1d273a' } },
  { file: B('bag-messenger'), view: 'front', cw: { body: '#242424', second: '#c4512b', trim: '#111111' }, scale: .9 },
], 3);
await card(`${out}/make-type-footwear.webp`, [
  { file: F('footwear-lifestyle-court-low'), view: 'lateral', cw: { body: '#f4f1ea', second: '#2b3a55', trim: '#1d273a' } },
  { file: F('footwear-running-daily'), view: 'lateral', cw: { body: '#c4512b', second: '#e9e4d8', trim: '#2a1a14' } },
  { file: F('footwear-boots-chelsea'), view: 'lateral', cw: { body: '#8a5a34', second: '#2a2420', trim: '#2a2420' } },
  { file: F('footwear-outdoor-hiker-mid'), view: 'lateral', cw: { body: '#5d6a45', second: '#8a5a34', trim: '#2f3527' } },
  { file: F('footwear-dress-penny-loafer'), view: 'lateral', cw: { body: '#3b2418', second: '#2a1a12', trim: '#1a110c' } },
  { file: F('footwear-lifestyle-terrace'), view: 'lateral', cw: { body: '#2f5c3b', second: '#f4f1ea', trim: '#173022' } },
], 2, 1200, 900, 40, 40);
console.log('ok');
