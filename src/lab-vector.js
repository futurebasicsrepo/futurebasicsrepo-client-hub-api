// Artwork the way a decorator takes it: vector paths for a screen printer, a stitch file for an embroidery machine.
//   traceVector(png, {colours, widthIn})  → { svg, colours: [{hex, pantone, share, paths}], paths } — one filled path per ink, traced from the pixels
//   stitchPlan(png, {widthIn, ...})        → { stitches, colours, jumps, widthMm, heightMm, plan } — a tatami fill per thread colour, in 0.1 mm
//   dstOf(plan, name)                      → a Tajima .dst file (the format every embroidery machine and digitising program reads)
//   stitchPreview(plan)                    → an SVG of the stitches, for a look before the file goes out
// Both are a starting point: a screen printer still checks the separations, and a digitiser tunes the stitch file (underlay, pull compensation,
// satin columns for lettering) before production. The colours are the artwork's own, matched to Pantone C.
import sharp from 'sharp';
import { artColours } from './art.js';

const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// the artwork's inks, and each opaque pixel given to the nearest one
async function inkMap(png, { maxSide = 700, width = null, height = null, colours = null, max = 8 } = {}) {
  const meta = await sharp(png).metadata(), k = width ? 1 : Math.min(1, maxSide / Math.max(meta.width || 1, meta.height || 1));
  const W = width || Math.max(1, Math.round((meta.width || 1) * k)), H = height || Math.max(1, Math.round((meta.height || 1) * k));
  const { data } = await sharp(png).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const inks = (colours && colours.length ? colours : (await artColours(png, { max: 12 })).filter(c => c.share >= .02).slice(0, max)).map(c => ({ hex: c.hex, pantone: c.code || c.pantone || '', share: c.share || 0, rgb: hexRgb(c.hex) }));
  const idx = new Int8Array(W * H).fill(-1), count = new Array(inks.length).fill(0);
  if (inks.length) for (let i = 0; i < W * H; i++) {
    if (data[i * 4 + 3] < 128) continue; let best = 0, bd = Infinity;
    for (let j = 0; j < inks.length; j++) { const c = inks[j].rgb, d = (data[i * 4] - c[0]) ** 2 + (data[i * 4 + 1] - c[1]) ** 2 + (data[i * 4 + 2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } }
    idx[i] = best; count[best]++;
  }
  return { W, H, idx, inks, count };
}

// ---- vector: the outline of every region of one ink, followed along the pixel edges, then simplified and smoothed ----
function loopsOf(idx, W, H, j) {
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
const closedSimplify = (loop, tol) => { const h = Math.floor(loop.length / 2); return [...simplify(loop.slice(0, h + 1), tol).slice(0, -1), ...simplify([...loop.slice(h), loop[0]], tol).slice(0, -1)]; };
const n2 = v => +v.toFixed(2);
// a closed shape as quadratic curves through the midpoints of its sides: corners of the pixel stair become smooth
function smoothPath(pts) {
  if (pts.length < 3) return ''; const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s = m(pts[pts.length - 1], pts[0]);
  let d = `M${n2(s[0])} ${n2(s[1])}`; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = m(p, pts[(i + 1) % pts.length]); d += `Q${n2(p[0])} ${n2(p[1])} ${n2(q[0])} ${n2(q[1])}`; }
  return d + 'Z';
}
export async function traceVector(png, { colours = null, widthIn = null, tolerance = .9, name = 'Graphic' } = {}) {
  const { W, H, idx, inks, count } = await inkMap(png, { colours });
  const out = [], total = count.reduce((a, b) => a + b, 0) || 1; let paths = 0;
  for (let j = 0; j < inks.length; j++) {
    if (!count[j]) continue;
    const loops = loopsOf(idx, W, H, j).map(l => closedSimplify(l, tolerance)).filter(l => l.length >= 3), d = loops.map(smoothPath).join('');
    paths += loops.length; out.push({ hex: inks[j].hex, pantone: inks[j].pantone, share: Math.round(count[j] / total * 1000) / 1000, paths: loops.length, d });
  }
  const size = widthIn ? ` width="${n2(widthIn)}in" height="${n2(widthIn * H / W)}in"` : ` width="${W}" height="${H}"`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>\n<title>${String(name).replace(/[<&>]/g, '')} · traced by the Future Basics Design Lab</title>\n`
    + out.map(c => `<g id="${c.pantone ? c.pantone.replace(/[^A-Za-z0-9]+/g, '_') : c.hex.slice(1)}" data-pantone="${c.pantone}"><path fill="${c.hex}" fill-rule="evenodd" d="${c.d}"/></g>`).join('\n') + '\n</svg>\n';
  return { svg, width: W, height: H, paths, colours: out.map(({ d, ...c }) => c) };
}

// ---- embroidery: a tatami fill per thread colour ----
// rows 0.4 mm apart (the usual fill density), stitches up to 3.5 mm long, the row's needle points staggered over three rows so the
// fill shows no lines; a jump wherever a row crosses empty ground; colours sewn largest first. Units are 0.1 mm, the centre is 0,0.
export async function stitchPlan(png, { widthIn = 4, rowMm = .4, stitchMm = 3.5, colours = null, max = 6 } = {}) {
  const pxMm = .2, meta = await sharp(png).metadata(), wMm = widthIn * 25.4, hMm = wMm * (meta.height || 1) / (meta.width || 1);
  const W = Math.max(4, Math.round(wMm / pxMm)), H = Math.max(4, Math.round(hMm / pxMm));
  const { idx, inks, count } = await inkMap(png, { width: W, height: H, colours, max });
  const order = inks.map((c, j) => j).filter(j => count[j] > 20).sort((a, b) => count[b] - count[a]);
  const step = Math.max(1, Math.round(rowMm / pxMm)), len = stitchMm / pxMm, to01 = (x, y) => [Math.round((x - W / 2) * pxMm * 10), Math.round((y - H / 2) * pxMm * 10)];
  const blocks = [];
  for (const j of order) {
    const pts = []; let row = 0;
    for (let y = 0; y < H; y += step, row++) {
      const runs = []; let x0 = -1;
      for (let x = 0; x <= W; x++) { const on = x < W && idx[y * W + x] === j; if (on && x0 < 0) x0 = x; if (!on && x0 >= 0) { if (x - x0 >= 2) runs.push([x0, x - 1]); x0 = -1; } }
      if (row % 2) runs.reverse();
      for (const [a0, a1] of runs) {
        const [s, e] = row % 2 ? [a1, a0] : [a0, a1], dir = Math.sign(e - s) || 1, off = (row % 3) * len / 3;
        pts.push({ p: to01(s, y), jump: true });
        // needle points at a fixed grid across the piece (staggered by row), so neighbouring rows interlock
        const xs = []; for (let gx = Math.ceil((Math.min(s, e) - off) / len) * len + off; gx < Math.max(s, e); gx += len) if (gx > Math.min(s, e) + 1) xs.push(gx);
        if (dir < 0) xs.reverse(); for (const gx of xs) pts.push({ p: to01(gx, y) }); pts.push({ p: to01(e, y) });
      }
    }
    if (pts.length) blocks.push({ hex: inks[j].hex, pantone: inks[j].pantone, pts });
  }
  const stitches = blocks.reduce((n, b) => n + b.pts.filter(p => !p.jump).length, 0), jumps = blocks.reduce((n, b) => n + b.pts.filter(p => p.jump).length, 0);
  return { widthMm: Math.round(wMm * 10) / 10, heightMm: Math.round(hMm * 10) / 10, stitches, jumps, colours: blocks.map(b => ({ hex: b.hex, pantone: b.pantone, stitches: b.pts.filter(p => !p.jump).length })), plan: blocks };
}

// ---- the Tajima DST file: a 512-byte header, then each move as three bytes (±121 units of 0.1 mm per record) ----
function record(dx, dy, kind) {
  if (kind === 'end') return [0, 0, 0xf3];
  let x = dx, y = -dy, b0 = 0, b1 = 0, b2 = kind === 'jump' ? 0x83 : kind === 'color' ? 0xc3 : 0x03;
  if (x > 40) { b2 |= 0x04; x -= 81; } if (x < -40) { b2 |= 0x08; x += 81; } if (x > 13) { b1 |= 0x04; x -= 27; } if (x < -13) { b1 |= 0x08; x += 27; }
  if (x > 4) { b0 |= 0x04; x -= 9; } if (x < -4) { b0 |= 0x08; x += 9; } if (x > 1) { b1 |= 0x01; x -= 3; } if (x < -1) { b1 |= 0x02; x += 3; }
  if (x > 0) { b0 |= 0x01; x -= 1; } if (x < 0) { b0 |= 0x02; x += 1; }
  if (y > 40) { b2 |= 0x20; y -= 81; } if (y < -40) { b2 |= 0x10; y += 81; } if (y > 13) { b1 |= 0x20; y -= 27; } if (y < -13) { b1 |= 0x10; y += 27; }
  if (y > 4) { b0 |= 0x20; y -= 9; } if (y < -4) { b0 |= 0x10; y += 9; } if (y > 1) { b1 |= 0x80; y -= 3; } if (y < -1) { b1 |= 0x40; y += 3; }
  if (y > 0) { b0 |= 0x80; y -= 1; } if (y < 0) { b0 |= 0x40; y += 1; }
  return [b0, b1, b2];
}
export function dstOf(p, name = 'graphic') {
  const recs = []; let cx = 0, cy = 0, minX = 0, maxX = 0, minY = 0, maxY = 0, st = 0;
  const move = (x, y, kind) => { // long moves are split into steps a record can hold
    let dx = x - cx, dy = y - cy; const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 121));
    for (let i = 1; i <= n; i++) { const nx = cx + Math.round(dx * i / n) - Math.round(dx * (i - 1) / n), ny = cy + Math.round(dy * i / n) - Math.round(dy * (i - 1) / n); recs.push(record(nx - cx, ny - cy, i < n || kind === 'jump' ? 'jump' : 'stitch')); cx = nx; cy = ny; }
    if (kind !== 'jump') st++; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
  };
  p.plan.forEach((b, i) => { if (i) recs.push(record(0, 0, 'color')); for (const q of b.pts) move(q.p[0], q.p[1], q.jump ? 'jump' : 'stitch'); });
  recs.push(record(0, 0, 'end'));
  const pad = (v, n) => String(v).padStart(n, ' '), sign = v => (v < 0 ? '-' : '+') + String(Math.abs(v)).padStart(5, ' ');
  const head = `LA:${String(name).replace(/[^\x20-\x7e]/g, '').slice(0, 16).padEnd(16, ' ')}\rST:${pad(recs.length, 7)}\rCO:${pad(Math.max(0, p.plan.length - 1), 3)}\r+X:${pad(maxX, 5)}\r-X:${pad(-minX, 5)}\r+Y:${pad(-minY, 5)}\r-Y:${pad(maxY, 5)}\rAX:${sign(cx)}\rAY:${sign(-cy)}\rMX:+    0\rMY:+    0\rPD:******\r\x1a`;
  const header = Buffer.alloc(512, 0x20); header.write(head, 0, 'latin1');
  return { file: Buffer.concat([header, Buffer.from(recs.flat())]), records: recs.length, stitches: st };
}
// reading one back (for the tests, and to check a file before it goes out): → [{x, y, kind}]
export function readDst(buf) {
  const out = []; let x = 0, y = 0; const bit = (b, m) => (b & m ? 1 : 0);
  for (let i = 512; i + 2 < buf.length; i += 3) {
    const [b0, b1, b2] = [buf[i], buf[i + 1], buf[i + 2]]; if (b2 === 0xf3 && !b0 && !b1) { out.push({ x, y, kind: 'end' }); break; }
    const dx = bit(b0, 1) - bit(b0, 2) + 9 * (bit(b0, 4) - bit(b0, 8)) + 3 * (bit(b1, 1) - bit(b1, 2)) + 27 * (bit(b1, 4) - bit(b1, 8)) + 81 * (bit(b2, 4) - bit(b2, 8));
    const dy = bit(b0, 0x80) - bit(b0, 0x40) + 9 * (bit(b0, 0x20) - bit(b0, 0x10)) + 3 * (bit(b1, 0x80) - bit(b1, 0x40)) + 27 * (bit(b1, 0x20) - bit(b1, 0x10)) + 81 * (bit(b2, 0x20) - bit(b2, 0x10));
    x += dx; y -= dy; out.push({ x, y, kind: (b2 & 0xc3) === 0xc3 ? 'color' : (b2 & 0x83) === 0x83 ? 'jump' : 'stitch' });
  }
  return out;
}
// the stitches drawn: thread colour by colour, jumps left out, on a pale cloth
export function stitchPreview(p, { px = 900 } = {}) {
  const all = p.plan.flatMap(b => b.pts.map(q => q.p)), xs = all.map(q => q[0]), ys = all.map(q => q[1]);
  const x0 = Math.min(...xs, 0) - 20, y0 = Math.min(...ys, 0) - 20, w = Math.max(...xs, 0) - x0 + 20, h = Math.max(...ys, 0) - y0 + 20;
  const lines = p.plan.map(b => { let d = '', pen = false; for (const q of b.pts) { d += `${q.jump || !pen ? 'M' : 'L'}${q.p[0]} ${q.p[1]}`; pen = true; } return `<path d="${d}" fill="none" stroke="${b.hex}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${px}" height="${Math.round(px * h / w)}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ecebe6"/>${lines}</svg>`;
}
