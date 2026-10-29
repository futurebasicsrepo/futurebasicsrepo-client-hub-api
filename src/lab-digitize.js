// Embroidery digitizing: a graphic turned into a stitch file an embroidery machine sews, the way a digitiser builds one.
//   digitize(png, opts)   → { plan, objects, stats, threads, widthMm, heightMm, settings }   units 0.1 mm, the design centred on 0,0
//   dstOf(d, name)        → a Tajima .dst (every commercial machine reads it)        expOf(d) → a Melco .exp
//   readDst(buf)          → the moves back out of a .dst, to check one
//   stitchSvg(d, opts)    → the stitches drawn as thread, for a look before it goes out
// How a design is built:
//   1. The graphic is separated into thread colours (src/lab-separate.js): every colour that fills an area of its own, however small, keeps its
//      thread; soft edges go to the nearer thread; a thread the colour of the garment is left unsewn (the garment shows through). Specks under
//      0.6 mm² are folded into what surrounds them.
//   2. Each colour is cut into shapes. A shape no wider than `satinMaxMm` (lettering, outlines, thin marks) is sewn as satin: stitches that cross the
//      shape from edge to edge, laid at the angle that crosses it shortest, with a centre-walk underlay and pull compensation on both edges.
//      Wider shapes are sewn as tatami fill: rows `rowMm` apart at `fillAngle`, needle points staggered over three rows so the fill shows no
//      lines, over a tatami underlay at right angles, and the edges pushed out by the pull compensation.
//   3. Shapes are cut into sections that can be sewn without crossing open ground, sewn nearest-first, each started and ended with a lock
//      stitch; a move over 1 mm is a jump, over `trimMm` a trim. Colours are sewn largest first, so the details sit on top.
// It is a production-grade starting file: a digitiser still looks it over (lettering under 5 mm, very dense overlaps) before a big run.
import sharp from 'sharp';
import { separate } from './lab-separate.js';

export const DIGITIZE_DEFAULTS = { widthIn: 4, rowMm: .4, satinSpacingMm: .22, stitchMm: 3.5, satinMaxMm: 7, splitMm: 7, pullMm: .2, underlay: true, fillAngle: 45, trimMm: 6, maxThreads: 12, garment: '' };

// the settings from a request, each held to what a machine can sew
export function digitizeOptions(b = {}) {
  const n = (v, a, z) => { const x = Number(v); return Number.isFinite(x) && v !== '' && v !== null ? Math.min(z, Math.max(a, x)) : undefined; };
  return Object.fromEntries(Object.entries({ fillAngle: n(b.fillAngle, 0, 179), rowMm: n(b.rowMm, .25, 1), satinMaxMm: n(b.satinMaxMm, 2, 10), pullMm: n(b.pullMm, 0, .6), stitchMm: n(b.stitchMm, 2, 6), maxThreads: n(b.maxThreads, 1, 15), underlay: b.underlay === undefined ? undefined : Boolean(b.underlay) }).filter(([, v]) => v !== undefined));
}

// ---- shapes ----
// 4-connected regions of one colour: [{ c, px: Int32Array of pixel indexes, n }]
function regionsOf(hard, W, H) {
  const seen = new Uint8Array(W * H), out = [], stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    const c = hard[s]; if (c < 0 || seen[s]) continue;
    let top = 0, n = 0; stack[top++] = s; seen[s] = 1; const px = [];
    while (top) { const p = stack[--top]; px.push(p); n++; const x = p % W, y = (p - x) / W;
      if (x > 0 && !seen[p - 1] && hard[p - 1] === c) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < W - 1 && !seen[p + 1] && hard[p + 1] === c) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && !seen[p - W] && hard[p - W] === c) { seen[p - W] = 1; stack[top++] = p - W; }
      if (y < H - 1 && !seen[p + W] && hard[p + W] === c) { seen[p + W] = 1; stack[top++] = p + W; } }
    out.push({ c, px: Int32Array.from(px), n });
  }
  return out;
}
// specks too small to sew go to the colour around them (or to nothing)
function despeck(hard, W, H, minPx) {
  for (const r of regionsOf(hard, W, H)) {
    if (r.n >= minPx) continue; const votes = new Map();
    for (const p of r.px) { const x = p % W; for (const q of [p - 1, p + 1, p - W, p + W]) { if (q < 0 || q >= W * H || (q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue; const c = hard[q]; if (c !== r.c) votes.set(c, (votes.get(c) || 0) + 1); } }
    let best = -1, bv = 0; for (const [c, v] of votes) if (v > bv) { bv = v; best = c; }
    for (const p of r.px) hard[p] = best;
  }
}
// the widest point of a shape (twice its deepest inside distance), in pixels: a two-pass chamfer distance inside the shape's box
function widthOf(r, W) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1; for (const p of r.px) { const x = p % W, y = (p - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const w = x1 - x0 + 3, h = y1 - y0 + 3, d = new Float32Array(w * h); // a ring of empty round the box
  for (const p of r.px) { const x = p % W, y = (p - x) / W; d[(y - y0 + 1) * w + (x - x0 + 1)] = 1e6; }
  const a = 1, b = Math.SQRT2;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], d[i - 1] + a, d[i - w] + a, d[i - w - 1] + b, d[i - w + 1] + b); }
  let max = 0;
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; if (!d[i]) continue; d[i] = Math.min(d[i], d[i + 1] + a, d[i + w] + a, d[i + w + 1] + b, d[i + w - 1] + b); if (d[i] > max) max = d[i]; }
  return { width: 2 * max, box: [x0, y0, x1, y1] };
}

// ---- runs: where lines at an angle cross a shape ----
// lines along `ang` (degrees), `step` px apart; each crossing is a run [t0, t1] along the line. → [{ o, runs: [[t0, t1]] }] in line order
function scan(mask, W, H, box, ang, step, h = .5) {
  const th = ang * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx, [x0, y0, x1, y1] = box;
  const cs = [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]], os = cs.map(([x, y]) => x * nx + y * ny), ts = cs.map(([x, y]) => x * dx + y * dy);
  const oMin = Math.min(...os), oMax = Math.max(...os), tMin = Math.min(...ts) - 1, tMax = Math.max(...ts) + 1, lines = [];
  const at = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); return xi >= x0 && yi >= y0 && xi <= x1 && yi <= y1 && mask[yi * W + xi] === 1; };
  for (let o = oMin + step / 2; o < oMax; o += step) {
    const runs = []; let start = null;
    for (let t = tMin; t <= tMax; t += h) { const on = at(o * nx + t * dx, o * ny + t * dy); if (on && start === null) start = t; if (!on && start !== null) { runs.push([start, t - h]); start = null; } }
    if (start !== null) runs.push([start, tMax]);
    lines.push({ o, runs: runs.filter(r => r[1] - r[0] >= h) });
  }
  return { lines, dir: [dx, dy], nrm: [nx, ny] };
}
// runs grouped into sections: runs on next-door lines that overlap belong to one section, which can be sewn back and forth without a jump
function sections(sc) {
  const done = [], open = [];
  sc.lines.forEach((ln, k) => {
    const next = [];
    for (const r of ln.runs) {
      const hits = open.filter(s => s.last[0] <= r[1] && r[0] <= s.last[1]);
      const sec = hits.length === 1 && !next.some(n => n === hits[0]) && ln.runs.filter(q => hits[0].last[0] <= q[1] && q[0] <= hits[0].last[1]).length === 1 ? hits[0] : null;
      if (sec) { sec.rows.push({ o: ln.o, r }); sec.last = r; next.push(sec); }
      else { const s = { rows: [{ o: ln.o, r }], last: r }; next.push(s); }
    }
    for (const s of open) if (!next.includes(s)) done.push(s);
    open.length = 0; open.push(...next);
  });
  done.push(...open);
  return done.filter(s => s.rows.length);
}
const pt = (sc, o, t) => [o * sc.nrm[0] + t * sc.dir[0], o * sc.nrm[1] + t * sc.dir[1]];
// the angle whose lines cross the shape shortest (for satin: stitches go across the stroke)
function crossAngle(mask, W, H, box, stepPx) {
  let best = 0, bl = Infinity;
  for (let a = 0; a < 180; a += 15) { const sc = scan(mask, W, H, box, a, stepPx * 4, 1); let n = 0, s = 0; for (const l of sc.lines) for (const r of l.runs) { s += r[1] - r[0]; n++; } const mean = n ? s / n : Infinity; if (mean < bl - .01) { bl = mean; best = a; } }
  return best;
}

// ---- stitches for one shape, as needle points (px, not yet 0.1 mm) ----
// a fill section: rows back and forth, needle points on a staggered grid so neighbouring rows interlock
function fillSection(sec, sc, { lenPx, pullPx, inset = 0 }) {
  const pts = [];
  sec.rows.forEach((row, k) => {
    let [a, b] = row.r; a -= pullPx - inset; b += pullPx - inset; if (b - a < 1) return;
    const fwd = k % 2 === 0, off = (k % 3) * lenPx / 3, xs = [a];
    for (let g = Math.ceil((a - off) / lenPx) * lenPx + off; g < b; g += lenPx) if (g > a + lenPx * .3 && g < b - lenPx * .3) xs.push(g);
    xs.push(b); if (!fwd) xs.reverse(); for (const t of xs) pts.push(pt(sc, row.o, t));
  });
  return pts;
}
// a satin section: the needle crosses the column from edge to edge, alternating sides; a stitch longer than the split length is split
function satinSection(sec, sc, { pullPx, splitPx, underlay, walkPx }) {
  const pts = [], rows = sec.rows;
  if (underlay && rows.length > 2) { // centre walk to the far end first, then the satin comes back over it
    const mids = rows.map(r => pt(sc, r.o, (r.r[0] + r.r[1]) / 2)), u = [mids[0]]; let acc = 0;
    for (let i = 1; i < mids.length; i++) { acc += Math.hypot(mids[i][0] - mids[i - 1][0], mids[i][1] - mids[i - 1][1]); if (acc >= walkPx || i === mids.length - 1) { u.push(mids[i]); acc = 0; } }
    pts.push(...u); rows.reverse();
  }
  rows.forEach((row, k) => {
    const a = row.r[0] - pullPx, b = row.r[1] + pullPx, from = k % 2 ? b : a, to = k % 2 ? a : b, L = Math.abs(to - from);
    pts.push(pt(sc, row.o, from));
    if (L > splitPx) { const n = Math.ceil(L / splitPx), sh = (k % 2) * .5 / n; for (let i = 1; i < n; i++) pts.push(pt(sc, row.o, from + (to - from) * Math.min(.98, i / n + sh * (i < n - 1 ? 1 : 0)))); }
    pts.push(pt(sc, row.o, to));
  });
  return pts;
}

// → the design
export async function digitize(png, opts = {}) {
  const o = { ...DIGITIZE_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
  const meta = await sharp(png).metadata(), wMm = Math.max(10, Math.min(16 * 25.4, o.widthIn * 25.4)), hMm = wMm * (meta.height || 1) / (meta.width || 1);
  const pxMm = Math.max(.1, wMm / 2400), W = Math.max(8, Math.round(wMm / pxMm)), H = Math.max(8, Math.round(hMm / pxMm)), mmPx = 1 / pxMm;
  const { data } = await sharp(png).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const sep = separate(data, W, H, { max: o.maxThreads, garment: o.garment, softPx: 2 });
  const hard = sep.hard; for (let p = 0; p < W * H; p++) if (hard[p] >= 0 && sep.inks[hard[p]].knockout) hard[p] = -1;
  despeck(hard, W, H, Math.round(.6 * mmPx * mmPx));
  const regs = regionsOf(hard, W, H), area = new Array(sep.inks.length).fill(0), label = new Int32Array(W * H).fill(-1);
  regs.forEach((r, i) => { area[r.c] += r.n; for (const p of r.px) label[p] = i; });
  const order = sep.inks.map((_, j) => j).filter(j => area[j] > 0).sort((a, b) => area[b] - area[a]);
  const mask = new Uint8Array(W * H), objects = [];
  for (const c of order) for (const r of regs.filter(x => x.c === c)) {
    const rid = regs.indexOf(r);
    for (const p of r.px) mask[p] = 1;
    const { width, box } = widthOf(r, W), widthMm = width * pxMm, satin = widthMm <= o.satinMaxMm;
    const shape = { rid, colour: c, kind: satin ? 'satin' : 'fill', widthMm: Math.round(widthMm * 10) / 10, areaMm2: Math.round(r.n * pxMm * pxMm), parts: [] };
    if (satin) {
      const ang = crossAngle(mask, W, H, box, o.satinSpacingMm * mmPx), sc = scan(mask, W, H, box, ang, o.satinSpacingMm * mmPx, .5);
      for (const s of sections(sc)) { const ul = o.underlay && widthMm > 1.2 && s.rows.length > 2, pts = satinSection(s, sc, { pullPx: o.pullMm * mmPx, splitPx: o.splitMm * mmPx, underlay: ul, walkPx: 2 * mmPx }); if (pts.length > 1) shape.parts.push({ pts, under: false, rev: !ul }); }
      shape.angle = ang;
    } else {
      if (o.underlay) { const sc = scan(mask, W, H, box, o.fillAngle + 90, 2 * mmPx, .5); for (const s of sections(sc)) { const pts = fillSection(s, sc, { lenPx: 3 * mmPx, pullPx: 0, inset: .5 * mmPx }); if (pts.length > 1) shape.parts.push({ pts, under: true, rev: true }); } }
      const sc = scan(mask, W, H, box, o.fillAngle, o.rowMm * mmPx, .5);
      for (const s of sections(sc)) { const pts = fillSection(s, sc, { lenPx: o.stitchMm * mmPx, pullPx: o.pullMm * .75 * mmPx }); if (pts.length > 1) shape.parts.push({ pts, under: false, rev: true }); }
      shape.angle = o.fillAngle;
    }
    for (const p of r.px) mask[p] = 0;
    if (shape.parts.length) objects.push(shape);
  }
  // ---- sew it: colour by colour, the nearest shape next; in a shape its underlay, then its top, each section nearest-first. A move inside the same
  // shape runs there in small stitches (the top covers them); any other move over 1 mm jumps with a lock stitch either side, and trims when long ----
  const to01 = ([x, y]) => [Math.round((x - W / 2) * pxMm * 10), Math.round((y - H / 2) * pxMm * 10)];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const inside = (a, b, rid) => { const n = Math.ceil(dist(a, b) / .7); for (let i = 0; i <= n; i++) { const x = Math.floor(a[0] + (b[0] - a[0]) * i / n), y = Math.floor(a[1] + (b[1] - a[1]) * i / n); if (x < 0 || y < 0 || x >= W || y >= H || label[y * W + x] !== rid) return false; } return true; };
  const nearest = (list, from) => { let bi = 0, bd = Infinity, rev = false; list.forEach((q, i) => { const da = dist(from, q.pts[0]); if (da < bd) { bd = da; bi = i; rev = false; } if (q.rev) { const dz = dist(from, q.pts.at(-1)); if (dz < bd) { bd = dz; bi = i; rev = true; } } }); const q = list.splice(bi, 1)[0]; return rev ? q.pts.slice().reverse() : q.pts; };
  const plan = []; let cur = [W / 2, H / 2], trims = 0, jumps = 0;
  const one = mmPx, trimPx = o.trimMm * mmPx, travelPx = 2.5 * mmPx;
  for (const c of order) {
    const block = { hex: sep.inks[c].hex, rgb: sep.inks[c].rgb, colour: c, pts: [] }, add = (q, extra = {}) => block.pts.push({ p: to01(q), ...extra });
    const left = objects.filter(s => s.colour === c); let first = true, prev = null;
    while (left.length) {
      let bi = 0, bd = Infinity; left.forEach((sh, i) => { for (const q of sh.parts) { const d = Math.min(dist(cur, q.pts[0]), q.rev ? dist(cur, q.pts.at(-1)) : Infinity); if (d < bd) { bd = d; bi = i; } } });
      const sh = left.splice(bi, 1)[0], under = sh.parts.filter(q => q.under), top = sh.parts.filter(q => !q.under), seq = [];
      while (under.length) { const pts = nearest(under, seq.length ? seq.at(-1).at(-1) : cur); seq.push(pts); }
      while (top.length) { const pts = nearest(top, seq.length ? seq.at(-1).at(-1) : cur); seq.push(pts); }
      for (const pts of seq) {
        const start = pts[0], gap = dist(cur, start);
        if (first) { add(start, { jump: true }); jumps++; tie(block.pts, to01(start), to01(pts[1] || start)); }
        else if (gap <= one) add(start);
        else if (sh.rid === prev && inside(cur, start, sh.rid)) { const n = Math.ceil(gap / travelPx); for (let i = 1; i <= n; i++) add([cur[0] + (start[0] - cur[0]) * i / n, cur[1] + (start[1] - cur[1]) * i / n]); }
        else { tie(block.pts, to01(cur), block.pts.at(-2)?.p); if (gap > trimPx) { block.pts.push({ p: to01(cur), trim: true }); trims++; } add(start, { jump: true }); jumps++; tie(block.pts, to01(start), to01(pts[1] || start)); }
        let last = start; for (let i = 1; i < pts.length; i++) { const q = pts[i]; if (dist(q, last) < .3 * mmPx && i < pts.length - 1) continue; add(q); last = q; }
        cur = last; first = false; prev = sh.rid;
      }
    }
    tie(block.pts, to01(cur), block.pts.at(-2)?.p); block.pts.push({ p: to01(cur), trim: true }); trims++;
    plan.push(block);
  }
  const stitches = plan.reduce((n, b) => n + b.pts.filter(p => !p.jump && !p.trim).length, 0);
  const threadM = plan.reduce((s, b) => { let L = 0, pr = null; for (const q of b.pts) { if (pr && !q.jump && !q.trim) L += dist(pr, q.p); pr = q.p; } return s + L / 10000; }, 0);
  const minutes = stitches / 750 + plan.length * .3 + trims * .1;
  const threads = plan.map((b, i) => ({ n: i + 1, hex: b.hex, stitches: b.pts.filter(p => !p.jump && !p.trim).length, shapes: objects.filter(s => s.colour === b.colour).length, satin: objects.filter(s => s.colour === b.colour && s.kind === 'satin').length, fill: objects.filter(s => s.colour === b.colour && s.kind === 'fill').length }));
  const narrow = objects.filter(s => s.kind === 'satin' && s.widthMm < 1);
  return { plan, threads, objects: objects.map(({ parts, ...s }) => ({ ...s, thread: order.indexOf(s.colour) + 1 })), widthMm: Math.round(wMm * 10) / 10, heightMm: Math.round(hMm * 10) / 10, knockouts: sep.inks.filter(i => i.knockout).map(i => i.hex), settings: o,
    stats: { stitches, colours: plan.length, colourChanges: Math.max(0, plan.length - 1), trims, jumps, threadM: Math.round(threadM * 1.6 * 10) / 10, minutes: Math.round(minutes * 10) / 10, satin: objects.filter(s => s.kind === 'satin').length, fill: objects.filter(s => s.kind === 'fill').length },
    warnings: [...(narrow.length ? [`${narrow.length} shape${narrow.length > 1 ? 's are' : ' is'} under 1 mm wide: thin lines may not sew cleanly; thicken them or make the graphic bigger.`] : []), ...(stitches > 20000 ? [`${stitches.toLocaleString('en-US')} stitches is heavy for a garment: it will be stiff. A smaller design, an open fill or a patch is lighter.`] : [])] };
}
// three small stitches back and forth: the thread locks before a jump or trim, and when it starts again
function tie(pts, at, toward) {
  if (!at) return; const v = toward ? [toward[0] - at[0], toward[1] - at[1]] : [1, 0], L = Math.hypot(v[0], v[1]) || 1, d = [Math.round(v[0] / L * 5), Math.round(v[1] / L * 5)];
  const q = [at[0] + d[0], at[1] + d[1]]; pts.push({ p: q, tie: true }, { p: at, tie: true }, { p: q, tie: true }, { p: at, tie: true });
}

// ---- files ----
// Tajima DST: a 512-byte header, then each move as three bytes (±121 units of 0.1 mm a record); a trim is three empty jumps, the way machines read it
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
// the moves of a design in order: { dx, dy, kind: stitch | jump | color | end }, each fitting `lim` units
function moves(d, lim) {
  const out = []; let cx = 0, cy = 0, st = 0;
  const go = (x, y, kind) => { const dx = x - cx, dy = y - cy, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / lim));
    for (let i = 1; i <= n; i++) { const nx = cx + Math.round(dx * i / n) - Math.round(dx * (i - 1) / n), ny = cy + Math.round(dy * i / n) - Math.round(dy * (i - 1) / n); out.push({ dx: nx - cx, dy: ny - cy, kind: i < n || kind === 'jump' ? 'jump' : 'stitch' }); cx = nx; cy = ny; }
    if (kind === 'stitch') st++; };
  d.plan.forEach((b, i) => {
    if (i) out.push({ dx: 0, dy: 0, kind: 'color' });
    for (const q of b.pts) { if (q.trim) { for (let k = 0; k < 3; k++) out.push({ dx: 0, dy: 0, kind: 'jump' }); continue; } go(q.p[0], q.p[1], q.jump ? 'jump' : 'stitch'); }
  });
  out.push({ dx: 0, dy: 0, kind: 'end' });
  return { out, stitches: st };
}
export function dstOf(d, name = 'design') {
  const { out, stitches } = moves(d, 121); let x = 0, y = 0, minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const m of out) { x += m.dx; y += m.dy; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const recs = out.map(m => record(m.dx, m.dy, m.kind)), pad = (v, n) => String(v).padStart(n, ' '), sign = v => (v < 0 ? '-' : '+') + String(Math.abs(v)).padStart(5, ' ');
  const head = `LA:${String(name).replace(/[^\x20-\x7e]/g, '').slice(0, 16).padEnd(16, ' ')}\rST:${pad(recs.length, 7)}\rCO:${pad(Math.max(0, d.plan.length - 1), 3)}\r+X:${pad(maxX, 5)}\r-X:${pad(-minX, 5)}\r+Y:${pad(-minY, 5)}\r-Y:${pad(maxY, 5)}\rAX:${sign(x)}\rAY:${sign(-y)}\rMX:+    0\rMY:+    0\rPD:******\r\x1a`;
  const header = Buffer.alloc(512, 0x20); header.write(head, 0, 'latin1');
  return { file: Buffer.concat([header, Buffer.from(recs.flat())]), records: recs.length, stitches };
}
// Melco EXP: two signed bytes a stitch (y up); 0x80 0x04 before a jump, 0x80 0x01 for a colour change
export function expOf(d) {
  const { out } = moves(d, 127), b = [], s8 = v => (v < 0 ? 256 + v : v);
  for (const m of out) {
    if (m.kind === 'end') break;
    if (m.kind === 'color') { b.push(0x80, 0x01, 0, 0); continue; }
    if (m.kind === 'jump') b.push(0x80, 0x04);
    b.push(s8(m.dx), s8(-m.dy));
  }
  return { file: Buffer.from(b) };
}
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

// the stitches drawn as thread on the garment: each stitch a rounded line with a darker edge and a light sheen, jumps and trims left out
export function stitchSvg(d, { px = 900, garment = '#ecebe6', showJumps = false } = {}) {
  const all = d.plan.flatMap(b => b.pts.map(q => q.p)); if (!all.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"/>`;
  const xs = all.map(q => q[0]), ys = all.map(q => q[1]), m = 30, x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m, w = Math.max(...xs) - x0 + m, h = Math.max(...ys) - y0 + m;
  const shade = (rgb, k) => `rgb(${rgb.map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)).join(',')})`;
  const layers = d.plan.map(b => {
    let dd = '', pen = false, jd = '';
    for (const q of b.pts) { if (q.trim) { pen = false; continue; } if (q.jump) { if (pen && showJumps) jd += `M${dd.split(/[ML]/).pop()}L${q.p[0]} ${q.p[1]}`; pen = false; dd += `M${q.p[0]} ${q.p[1]}`; pen = true; continue; } dd += `${pen ? 'L' : 'M'}${q.p[0]} ${q.p[1]}`; pen = true; }
    const rgb = b.rgb || [128, 128, 128];
    return `<path d="${dd}" fill="none" stroke="${shade(rgb, -.35)}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${dd}" fill="none" stroke="${b.hex}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${dd}" fill="none" stroke="${shade(rgb, .45)}" stroke-width="1" stroke-linecap="round" opacity=".55" transform="translate(-.5 -.5)"/>${jd ? `<path d="${jd}" fill="none" stroke="#e0245e" stroke-width="1.5" stroke-dasharray="6 6"/>` : ''}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${px}" height="${Math.round(px * h / w)}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${garment}"/>${layers}</svg>`;
}
