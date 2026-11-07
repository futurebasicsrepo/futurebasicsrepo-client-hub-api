// Artwork the way a decorator takes it: vector paths for a screen printer, a stitch file for an embroidery machine.
//   traceVector(png, {colours, widthIn})  → { svg, colours: [{hex, pantone, share, paths}], paths } — one filled path per ink, traced from the pixels
//   stitchPlan(png, {widthIn, ...})        → the design digitized (src/lab-digitize.js): satin and fill, underlay, pull compensation, trims; in 0.1 mm
//   dstOf(plan, name) / expOf(plan)        → a Tajima .dst / Melco .exp file
//   stitchPreview(plan)                    → an SVG of the stitches as thread, for a look before the file goes out
// The colours are the artwork's own (src/lab-separate.js), matched to Pantone C.
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import './pantone-c.js';
import { separate } from './lab-separate.js';
import { digitize, dstOf, expOf, readDst, stitchSvg } from './lab-digitize.js';

// the artwork's inks (src/lab-separate.js: small colours keep their own, soft edges go to the nearer ink, a JPG's background is left out), and
// each pixel given to its ink
async function inkMap(png, { maxSide = 700, width = null, height = null, colours = null, max = 8, garment = '' } = {}) {
  const meta = await sharp(png).metadata(), k = width ? 1 : Math.min(1, maxSide / Math.max(meta.width || 1, meta.height || 1));
  const W = width || Math.max(1, Math.round((meta.width || 1) * k)), H = height || Math.max(1, Math.round((meta.height || 1) * k));
  const { data } = await sharp(png).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const sep = separate(data, W, H, { max, garment, inks: colours && colours.length ? colours : null }), P = globalThis.FBPantone;
  const idx = new Int8Array(W * H).fill(-1), count = new Array(sep.inks.length).fill(0);
  for (let i = 0; i < W * H; i++) { const j = sep.hard[i]; if (j >= 0 && !sep.inks[j].knockout) { idx[i] = j; count[j]++; } }
  const inks = sep.inks.map(c => ({ hex: c.hex, pantone: P ? P.code(c.hex) || '' : '', share: c.share, rgb: c.rgb }));
  return { W, H, idx, inks, count };
}

// ---- vector: the outline of every region of one ink, followed along the pixel edges, then simplified and smoothed ----
export function loopsOf(idx, W, H, j) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && idx[y * W + x] === j, next = new Map(), key = (x, y) => y * (W + 1) + x;
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); if (!next.has(k)) next.set(k, []); next.get(k).push([bx, by]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) add(x, y, x + 1, y); if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!at(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, outs] of next) while (outs.length) {
    const sx = k0 % (W + 1), sy = Math.floor(k0 / (W + 1)), pts = [[sx, sy]]; let [cx, cy] = outs.pop();
    for (let guard = 0; !(cx === sx && cy === sy) && guard < 4e6; guard++) { pts.push([cx, cy]); const o = next.get(key(cx, cy)); if (!o || !o.length) break; [cx, cy] = o.pop(); }
    if (pts.length >= 4) loops.push(pts);
  }
  return loops;
}
function simplify(pts, tol) { // Douglas–Peucker on an open run
  if (pts.length < 3) return pts; const [a, b] = [pts[0], pts[pts.length - 1]]; let idx = 0, md = 0;
  for (let i = 1; i < pts.length - 1; i++) { const p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, d = Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > md) { md = d; idx = i; } }
  return md > tol ? [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)] : [a, b];
}
export const closedSimplify = (loop, tol) => { const h = Math.floor(loop.length / 2); return [...simplify(loop.slice(0, h + 1), tol).slice(0, -1), ...simplify([...loop.slice(h), loop[0]], tol).slice(0, -1)]; };
const n2 = v => +v.toFixed(2);
// a closed shape as quadratic curves through the midpoints of its sides: corners of the pixel stair become smooth
export function smoothPath(pts) {
  if (pts.length < 3) return ''; const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s = m(pts[pts.length - 1], pts[0]);
  // a real corner (the line turns sharply between two long sides) stays a corner; the rest are smoothed
  const N = pts.length, corner = i => { const a = pts[(i - 1 + N) % N], p = pts[i], b = pts[(i + 1) % N], ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    return lu > 4 && lv > 4 && (ux * vx + uy * vy) / (lu * lv) < .35; };
  let d = `M${n2(s[0])} ${n2(s[1])}`; for (let i = 0; i < N; i++) { const p = pts[i], q = m(p, pts[(i + 1) % N]); d += corner(i) ? `L${n2(p[0])} ${n2(p[1])}L${n2(q[0])} ${n2(q[1])}` : `Q${n2(p[0])} ${n2(p[1])} ${n2(q[0])} ${n2(q[1])}`; }
  return d + 'Z';
}
export async function traceVector(png, { colours = null, widthIn = null, tolerance = .9, name = 'Graphic', max = 8, maxSide = 700 } = {}) {
  const { W, H, idx, inks, count } = await inkMap(png, { colours, max, maxSide });
  const out = [], total = count.reduce((a, b) => a + b, 0) || 1; let paths = 0;
  for (let j = 0; j < inks.length; j++) {
    if (!count[j]) continue;
    const loops = loopsOf(idx, W, H, j).map(l => closedSimplify(l, tolerance)).filter(l => l.length >= 3), d = loops.map(smoothPath).join('');
    paths += loops.length; out.push({ hex: inks[j].hex, pantone: inks[j].pantone, share: Math.round(count[j] / total * 1000) / 1000, paths: loops.length, d });
  }
  const size = widthIn ? ` width="${n2(widthIn)}in" height="${n2(widthIn * H / W)}in"` : ` width="${W}" height="${H}"`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>\n<title>${String(name).replace(/[<&>]/g, '')} · traced by the Future Basics Design Lab</title>\n`
    + out.map(c => `<g id="${c.pantone ? c.pantone.replace(/[^A-Za-z0-9]+/g, '_') : c.hex.slice(1)}" data-pantone="${c.pantone}"><path fill="${c.hex}" fill-rule="evenodd" d="${c.d}"/></g>`).join('\n') + '\n</svg>\n';
  return { svg, width: W, height: H, paths, colours: out.map(({ d, ...c }) => c), inks: out };
}

// ---- embroidery: the digitizer (src/lab-digitize.js), in the shape the routes have always used ----
export async function stitchPlan(png, opts = {}) {
  const d = await digitize(png, opts), P = globalThis.FBPantone;
  return { ...d, stitches: d.stats.stitches, jumps: d.stats.jumps, colours: d.threads.map(t => ({ hex: t.hex, pantone: P ? P.code(t.hex) || '' : '', stitches: t.stitches })) };
}
export { dstOf, expOf, readDst };
export const stitchPreview = (p, o = {}) => stitchSvg(p, o);

// ---- the artwork as a vector PDF for a printer: page 1 the art in its inks, then one page per ink in black (a film positive), each with
// registration marks and its Pantone, all at the print width. inks: [{ hex, pantone, fill (path d), stroke: { d, w } }], box: the art's bounds ----
export function vectorPdf({ inks, box, widthIn = 10, name = 'Graphic' }) {
  const m = 54, k = (widthIn * 72) / Math.max(1, box.w), pw = widthIn * 72 + m * 2, ph = box.h * k + m * 2 + 28;
  const doc = new PDFDocument({ size: [pw, ph], margin: 0, info: { Title: `${name} · vector art`, Creator: 'Future Basics Design Lab' } }), parts = [];
  doc.on('data', c => parts.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(parts))); doc.on('error', rej); });
  const art = (list, colour) => {
    doc.save(); doc.translate(m, m); doc.scale(k); doc.translate(-box.x, -box.y);
    for (const ink of list) {
      const c = colour || ink.hex;
      if (ink.fill) doc.path(ink.fill).fill(c, 'even-odd');
      if (ink.stroke?.d && ink.stroke.w > 0) doc.path(ink.stroke.d).lineWidth(ink.stroke.w).lineJoin('round').lineCap('round').stroke(c);
    }
    doc.restore();
  };
  const reg = () => { const r = 9; for (const [x, y] of [[m / 2, m / 2], [pw - m / 2, m / 2], [m / 2, ph - m / 2 - 28], [pw - m / 2, ph - m / 2 - 28]]) { doc.save().lineWidth(.6).strokeColor('#000'); doc.circle(x, y, r * .6).stroke(); doc.moveTo(x - r, y).lineTo(x + r, y).moveTo(x, y - r).lineTo(x, y + r).stroke(); doc.restore(); } };
  const caption = t => doc.fillColor('#000').font('Helvetica').fontSize(8).text(t, m, ph - 30, { width: pw - m * 2, lineBreak: false });
  const by = new Map(); for (const ink of inks) { const key = ink.hex.toLowerCase(); if (!by.has(key)) by.set(key, { hex: ink.hex, pantone: ink.pantone || '', list: [] }); by.get(key).list.push(ink); }
  const plates = [...by.values()];
  art(inks); caption(`${name} · ${Math.round(widthIn * 100) / 100} in wide · ${plates.length} ink${plates.length === 1 ? '' : 's'}: ${plates.map(p => p.pantone || p.hex).join(', ')}`);
  plates.forEach((p, i) => { doc.addPage({ size: [pw, ph], margin: 0 }); reg(); art(p.list, '#000000'); caption(`Plate ${i + 1} of ${plates.length} · ${p.pantone || p.hex} (${p.hex}) · ${name} · ${Math.round(widthIn * 100) / 100} in wide · print in the order shown`); });
  doc.end(); return done;
}
