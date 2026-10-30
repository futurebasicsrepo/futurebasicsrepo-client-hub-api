// Embroidery digitizing: a graphic turned into a stitch file an embroidery machine sews, the way a digitiser builds one.
//   digitize(png, opts)   → { plan, objects, stats, threads, widthMm, heightMm, settings }   units 0.1 mm, the design centred on 0,0
//   dstOf(d, name)        → a Tajima .dst (every commercial machine reads it)        expOf(d) → a Melco .exp
//   readDst(buf)          → the moves back out of a .dst, to check one
//   stitchSvg(d, opts)    → the stitches drawn as thread, for a look before it goes out
//   Each plan point is { p: [x, y] } plus what it is: jump, trim, tie (a lock stitch), u (underlay), run (a travel run inside a shape), and o
//   (the index of its shape in `objects`); the sew-out render and the review (src/lab-sewout.js) read these.
// How a design is built:
//   1. The graphic is separated into thread colours (src/lab-separate.js): every colour that fills an area of its own, however small, keeps its
//      thread; soft edges go to the nearer thread; a thread the colour of the garment is left unsewn (the garment shows through). Specks under
//      0.6 mm² are folded into what surrounds them.
//   2. Each colour is cut into shapes. A shape no wider than `satinMaxMm` (lettering, outlines, thin marks) is sewn as satin: stitches that cross the
//      shape from edge to edge, with a centre-walk underlay and pull compensation on both edges. A straight stroke takes one angle, the one that
//      crosses it shortest. Where rows at one angle would run along the stroke (a ring, an O, script, an arc) the satin turns with it: the shape is
//      thinned to its centre line, traced into columns (split at junctions, where strokes that run straight through stay one column and the others
//      stop at its edge, and at sharp corners, which are mitred), and each column is walked with every stitch square to the line, its ends found by
//      casting out to the shape's edge. The rows are spaced on the outside of a curve; on the inside, a needle point that would land on the last
//      one is pulled in to a short stitch. When the centre line cannot be traced cleanly, the one angle is kept.
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
  return Object.fromEntries(Object.entries({ fillAngle: n(b.fillAngle, 0, 179), rowMm: n(b.rowMm, .25, 1), satinMaxMm: n(b.satinMaxMm, 2, 10), pullMm: n(b.pullMm, 0, .6), stitchMm: n(b.stitchMm, 2, 6), maxThreads: n(b.maxThreads, 1, 15), trimMm: n(b.trimMm, 1, 12), underlay: b.underlay === undefined ? undefined : Boolean(b.underlay) }).filter(([, v]) => v !== undefined));
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
  return { width: 2 * max, box: [x0, y0, x1, y1], dt: { d, w, h, x0: x0 - 1, y0: y0 - 1 } };
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

// ---- turning satin: the stroke's centre line, and stitches square to it as it curves ----
// the shape thinned to a line one pixel wide (Zhang-Suen), on the distance grid's box (an empty ring round it)
function thin({ d, w }) {
  const m = new Uint8Array(d.length); let list = []; for (let i = 0; i < d.length; i++) if (d[i]) { m[i] = 1; list.push(i); }
  const del = []; let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (const i of list) {
        if (!m[i]) continue; const n = [m[i - w], m[i - w + 1], m[i + 1], m[i + w + 1], m[i + w], m[i + w - 1], m[i - 1], m[i - w - 1]];
        let b = 0, a = 0; for (let k = 0; k < 8; k++) { b += n[k]; if (!n[k] && n[(k + 1) % 8]) a++; }
        if (b < 2 || b > 6 || a !== 1) continue;
        if (pass ? n[0] && n[2] && n[6] || n[0] && n[4] && n[6] : n[0] && n[2] && n[4] || n[2] && n[4] && n[6]) continue;
        del.push(i);
      }
      for (const i of del) m[i] = 0; if (del.length) changed = true;
    }
    list = list.filter(i => m[i]);
  }
  return { m, list };
}
// the centre line as columns: the skeleton traced into branches between its ends and junctions, short spurs pruned, and at each junction the
// branches that run on straight through it joined. → [{ pts: [[x, y]] px on the shape's grid, closed, cut: [start, end] (ends at a junction
// another column covers, trimmed back by its half width), free: [start, end] (a stroke end, run on to the edge) }]
function centreLines(dt) {
  const { d, w } = dt, { m, list } = thin(dt), N8 = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1];
  const cross = i => { let a = 0; for (let k = 0; k < 8; k++) if (!m[i + N8[k]] && m[i + N8[(k + 1) % 8]]) a++; return a; };
  const node = new Int32Array(m.length).fill(-1), nodes = [];
  for (const i of list) { if (node[i] >= 0 || cross(i) === 2) continue; const id = nodes.length, px = [i], st = [i]; node[i] = id; // a cluster of junction (or end) pixels
    while (st.length) { const p = st.pop(); for (const o of N8) { const q = p + o; if (m[q] && node[q] < 0 && cross(q) !== 2) { node[q] = id; px.push(q); st.push(q); } } }
    nodes.push({ px, r: Math.max(...px.map(p => d[p])) }); }
  const seen = new Uint8Array(m.length), edges = [];
  const walk = (from, s) => { const pts = [from, s]; seen[s] = 1; let p = s, prev = from;
    for (;;) { if (node[p] >= 0) return { a: node[from], b: node[p], pts };
      let nx = -1; for (const k of [0, 2, 4, 6, 1, 3, 5, 7]) { const q = p + N8[k]; if (q === prev || !m[q]) continue; if (node[q] >= 0 && node[q] !== node[from]) { nx = q; break; } if (node[q] >= 0 && pts.length > 3) { nx = q; break; } if (!seen[q] && node[q] < 0 && nx < 0) nx = q; }
      if (nx < 0) return { a: node[from], b: -1, pts }; if (node[nx] < 0) seen[nx] = 1; pts.push(nx); prev = p; p = nx; } };
  nodes.forEach(nd => { for (const p of nd.px) for (const o of N8) { const q = p + o; if (m[q] && node[q] < 0 && !seen[q]) edges.push(walk(p, q)); } });
  for (const i of list) if (!seen[i] && node[i] < 0) { seen[i] = 1; const e = walk(i, i); e.pts.shift(); e.loop = true; edges.push(e); } // a ring: no ends at all
  const ok = edges.filter(e => e.pts.length > 2 && e.b >= 0 || e.loop && e.pts.length > 8);
  // prune spurs: a branch from a loose end to a junction no longer than the stroke is deep there
  for (let round = 0; round < 3; round++) {
    const deg = new Int32Array(nodes.length); for (const e of ok) { if (e.loop) continue; deg[e.a]++; deg[e.b]++; }
    const cut = ok.filter(e => !e.loop && e.a !== e.b && (deg[e.a] === 1 && deg[e.b] >= 3 || deg[e.b] === 1 && deg[e.a] >= 3) && e.pts.length < 1.6 * nodes[deg[e.a] === 1 ? e.b : e.a].r + 3);
    if (!cut.length) break; for (const e of cut) ok.splice(ok.indexOf(e), 1);
  }
  const deg = new Int32Array(nodes.length); for (const e of ok) if (!e.loop) { deg[e.a]++; deg[e.b]++; } // a node left with one branch is a stroke end
  // join branches through each node: two always; at a junction the pairs that run on nearly straight
  const xy = i => [(i % w) + dt.x0 + .5, Math.floor(i / w) + dt.y0 + .5], ends = new Map(); // node → [{ e, at: 0 | 1, dir }]
  ok.forEach(e => { if (e.loop) return; const P = e.pts.map(xy); e.P = P; const k = Math.min(P.length - 1, Math.max(2, Math.round(nodes[e.a].r * 1.5)));
    for (const [at, nd, a, b] of [[0, e.a, P[0], P[k]], [1, e.b, P.at(-1), P.at(-1 - k)]]) { const v = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...v) || 1; if (!ends.has(nd)) ends.set(nd, []); ends.get(nd).push({ e, at, dir: [v[0] / L, v[1] / L] }); } });
  const link = new Map(), key = (e, at) => `${ok.indexOf(e)}:${at}`;
  for (const [nd, es] of ends) {
    const pairs = []; for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) pairs.push([es[i].dir[0] * es[j].dir[0] + es[i].dir[1] * es[j].dir[1], i, j]);
    pairs.sort((a, b) => a[0] - b[0]); const used = new Set();
    for (const [dot, i, j] of pairs) if (!used.has(i) && !used.has(j) && (!used.size || dot < -.6)) { used.add(i); used.add(j); link.set(key(es[i].e, es[i].at), es[j]); link.set(key(es[j].e, es[j].at), es[i]); }
    es.forEach((x, i) => { if (!used.has(i)) x.e[x.at ? 'cutB' : 'cutA'] = es.length > 1 ? nodes[nd].r : 0; });
  }
  const out = [], done = new Set();
  for (const e of ok) {
    if (done.has(e)) continue;
    if (e.loop) { done.add(e); out.push({ pts: e.pts.map(xy), closed: true, cut: [0, 0], free: [false, false], joins: [] }); continue; }
    // run back to the start of the chain, then forward along it
    let cur = { e, at: 0 }; for (let g = 0; g < ok.length; g++) { const nx = link.get(key(cur.e, cur.at)); if (!nx || nx.e === e) break; cur = { e: nx.e, at: 1 - nx.at }; }
    const chain = []; let c = { e: cur.e, at: cur.at }, closed = false;
    for (let g = 0; g <= ok.length; g++) { done.add(c.e); chain.push(c); const nx = link.get(key(c.e, 1 - c.at)); if (!nx) break; if (nx.e === chain[0].e && nx.at === chain[0].at) { closed = true; break; } if (done.has(nx.e)) break; c = { e: nx.e, at: nx.at }; }
    const pts = []; for (const { e: q, at } of chain) { const P = at ? q.P.slice().reverse() : q.P; pts.push(...(pts.length ? P.slice(1) : P)); }
    const f = chain[0], l = chain.at(-1), s = f.at ? 'B' : 'A', t = l.at ? 'A' : 'B';
    const joins = [...new Set(chain.flatMap(({ e: q }) => [q.a, q.b]))].filter(nd => deg[nd] >= 3).map(nd => ({ p: xy(nodes[nd].px[0]), r: nodes[nd].r })); // the junctions it runs through or stops at
    out.push({ pts, closed, cut: [f.e['cut' + s] || 0, l.e['cut' + t] || 0], free: [!closed && deg[f.at ? f.e.b : f.e.a] === 1, !closed && deg[l.at ? l.e.a : l.e.b] === 1], joins });
  }
  return out;
}
// a column cut where its centre line turns a sharp corner (over ~55° within the stroke's depth): each piece runs on to the corner's edge, the way
// a digitiser mitres a square corner instead of fanning the stitches round it
function corners(cl, depth) {
  const P = cl.pts, n = P.length, cyc = cl.closed, at = i => P[cyc ? (i % n + n) % n : Math.max(0, Math.min(n - 1, i))], ang = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = Math.max(3, Math.round(depth(P[i]))); if (!cyc && (i < k || i > n - 1 - k)) continue; const a = at(i - k), b = P[i], c = at(i + k);
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; ang[i] = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))); }
  const cuts = []; for (let i = 0; i < n; i++) { if (ang[i] < .96) continue; let j = i; while (j + 1 < n && ang[j + 1] >= .96) j++; let best = i; for (let q = i; q <= j; q++) if (ang[q] > ang[best]) best = q; cuts.push(best); i = j; }
  if (!cuts.length) return [cl];
  const out = [], seq = cyc ? [...cuts, cuts[0] + n] : [0, ...cuts, n - 1];
  for (let c = 0; c < seq.length - 1; c++) { const pts = []; for (let i = seq[c]; i <= seq[c + 1]; i++) pts.push(at(i));
    out.push({ pts, closed: false, cut: [!cyc && c === 0 ? cl.cut[0] : 0, !cyc && c === seq.length - 2 ? cl.cut[1] : 0], free: [cyc || c > 0 || cl.free[0], cyc || c < seq.length - 2 || cl.free[1]], joins: cl.joins }); }
  return out;
}
// one column of turning satin as needle points (px): its centre line smoothed and walked, at each step a ray out to either edge along the
// normal, a row each time an edge has moved on by `step`; the needle alternates edges. With the underlay, a walk along the centre line first
// and the satin back over it. → { pts, nu (the underlay's points, first) } or null
function turningColumn(cl, inside, depth, { step, pullPx, splitPx, underlay, walkPx, gapPx }) {
  let P = cl.pts; if (P.length < 3) return null;
  const n0 = P.length, cyc = cl.closed, r = Math.max(2, Math.round(Math.min(12, depth(P[n0 >> 1]) * .7))), fs = step / 3;
  for (let pass = 0; pass < 2; pass++) P = P.map((_, i) => { let sx = 0, sy = 0, c = 0; const k = cyc ? r : Math.min(r, i, n0 - 1 - i); for (let j = -k; j <= k; j++) { const q = P[cyc ? (i + j + n0) % n0 : i + j]; sx += q[0]; sy += q[1]; c++; } return [sx / c, sy / c]; });
  if (cyc) P = [...P, P[0]];
  // resampled finely by length, trimmed back where another column covers the junction; a thinned line bends off toward a corner in its last
  // half-width before a stroke end, so that part is dropped and the column runs on straight to the edge (below)
  const acc = [0]; for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = acc.at(-1), hw = Math.min(depth(P[n0 >> 1]) * 1.25, total * .3), s0 = cl.cut[0] * .8 + (cl.free[0] ? hw : 0), s1 = total - cl.cut[1] * .8 - (cl.free[1] ? hw : 0); if (s1 - s0 < step * 3) return null;
  const C = []; for (let s = s0, j = 0; s <= s1 + 1e-6; s += fs) { while (j < P.length - 2 && acc[j + 1] < s) j++; const u = (s - acc[j]) / (acc[j + 1] - acc[j] || 1); C.push([P[j][0] + (P[j + 1][0] - P[j][0]) * u, P[j][1] + (P[j + 1][1] - P[j][1]) * u]); }
  if (cyc) while (C.length > 2 && Math.hypot(C.at(-1)[0] - C[0][0], C.at(-1)[1] - C[0][1]) < fs * .9) C.pop();
  const n = C.length, kt = Math.max(1, Math.round(r / fs)), at = i => C[cyc ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const T = C.map((_, i) => { const a = at(i - kt), b = at(i + kt), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; });
  // from the centre out to either edge along the normal, no further than the stroke is deep there (so a ray does not run off along a join)
  const ray = (c, v, cap) => { let t = 0; while (t < cap && inside(c[0] + v[0] * (t + .5), c[1] + v[1] * (t + .5))) t += .5; return t; };
  const cast = (c, t, cap) => { const nv = [-t[1], t[0]], dc = 1.5 * depth(c) + 2; return [ray(c, nv, cap ? cap[0] : dc), ray(c, [-nv[0], -nv[1]], cap ? cap[1] : dc)]; };
  const AB = C.map((c, i) => cast(c, T[i])), med = k => { const v = AB.map(q => q[k]).sort((a, b) => a - b); return v[v.length >> 1] * 1.15 + 1; }, cap = [med(0), med(1)];
  // where it crosses or meets another column the column keeps its own width (a ray there would run off along the other stroke)
  for (const jn of cl.joins) for (let i = 0; i < n; i++) if (Math.hypot(C[i][0] - jn.p[0], C[i][1] - jn.p[1]) < jn.r * 2 + 2) AB[i] = cast(C[i], T[i], cap);
  // a stroke end (or a corner the column was cut at): the centre line runs on to the edge, the column keeping its own width there too. The
  // far end first, so the near end's indexes still hold
  for (const [k, end] of [[1, n - 1], [0, 0]]) { if (cyc || !cl.free[k]) continue; const t = T[end], sg = k ? 1 : -1, ext = [], near = depth(C[end]) * 1.2;
    for (let i = 0; i < n; i++) { const j = k ? n - 1 - i : i; if (Math.hypot(C[j][0] - C[end][0], C[j][1] - C[end][1]) > near) break; AB[j] = cast(C[j], T[j], cap); }
    for (let s = fs; s < 60; s += fs) { const q = [C[end][0] + t[0] * s * sg, C[end][1] + t[1] * s * sg]; if (!inside(q[0], q[1])) break; ext.push(q); }
    const ab = ext.map(q => cast(q, t, cap));
    if (k) { C.push(...ext); T.push(...ext.map(() => t)); AB.push(...ab); } else { C.unshift(...ext.reverse()); T.unshift(...ext.map(() => t)); AB.unshift(...ab.reverse()); } }
  // the edges eased along the column (the shape's edge is a staircase of pixels), then the rows: the next one where either edge has moved on
  // by the satin spacing, so the outside of a curve is as dense as a straight column
  const N = C.length, sm = AB.map((_, i) => { let a = 0, b = 0, c = 0; for (let j = -4; j <= 4; j++) { const q = AB[cyc ? (i + j + N) % N : i + j]; if (q) { a += q[0]; b += q[1]; c++; } } return [a / c, b / c]; });
  const edges = [], mix = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f], adv = (e, k) => Math.max(Math.hypot(e.L[0] - k.L[0], e.L[1] - k.L[1]), Math.hypot(e.R[0] - k.R[0], e.R[1] - k.R[1]));
  let kept = null, pv = null;
  for (let i = 0; i < N; i++) { const c = C[i], nv = [-T[i][1], T[i][0]], [a, b] = sm[i]; if (a + b < 1) continue;
    const e = { c, t: T[i], L: [c[0] + nv[0] * (a + pullPx), c[1] + nv[1] * (a + pullPx)], R: [c[0] - nv[0] * (b + pullPx), c[1] - nv[1] * (b + pullPx)] };
    if (!kept) { edges.push(kept = pv = e); continue; }
    // a row exactly the spacing on: between this sample and the one before
    while (adv(e, kept) >= step) { const a0 = adv(pv, kept), f = Math.max(0, Math.min(1, (step - a0) / (adv(e, kept) - a0 || 1))), r = { c: mix(pv.c, e.c, f), t: e.t, L: mix(pv.L, e.L, f), R: mix(pv.R, e.R, f) }; edges.push(kept = pv = r); }
    pv = e; }
  if (pv !== kept && adv(pv, kept) > step * .4) edges.push(pv);
  if (edges.length < 3) return null;
  const pts = [];
  if (underlay) { const u = [edges[0].c]; let s = 0; for (let i = 1; i < edges.length; i++) { s += Math.hypot(edges[i].c[0] - edges[i - 1].c[0], edges[i].c[1] - edges[i - 1].c[1]); if (s >= walkPx || i === edges.length - 1) { u.push(edges[i].c); s = 0; } } pts.push(...u); pts.nu = u.length; edges.reverse(); }
  // the zig-zag; on the inside of a turn a needle point that would not move on by `gapPx` from the last one on that edge is pulled in halfway
  // (a short stitch), so the inside does not bunch
  const last = [null, null], sg = underlay ? -1 : 1; let prev = null;
  edges.forEach((e, k) => {
    const side = k % 2, q = side ? e.R : e.L, lp = last[side]; let p = q;
    if (lp && sg * ((q[0] - lp[0]) * e.t[0] + (q[1] - lp[1]) * e.t[1]) < gapPx) p = [e.c[0] + (q[0] - e.c[0]) * .5, e.c[1] + (q[1] - e.c[1]) * .5];
    else last[side] = q;
    if (prev) { const L = Math.hypot(p[0] - prev[0], p[1] - prev[1]); if (L > splitPx) { const m = Math.ceil(L / splitPx), sh = side * .5 / m; for (let i = 1; i < m; i++) { const f = Math.min(.98, i / m + sh * (i < m - 1 ? 1 : 0)); pts.push([prev[0] + (p[0] - prev[0]) * f, prev[1] + (p[1] - prev[1]) * f]); } } }
    pts.push(p); prev = p;
  });
  return { pts, nu: pts.nu || 0 };
}
// a shape's turning satin as parts, or null when the centre line cannot be traced or the result covers the shape worse than one angle would
function turning(dt, opts, oneAngle) {
  const { d, w, h, x0, y0 } = dt, li = (x, y) => { const xi = Math.floor(x) - x0, yi = Math.floor(y) - y0; return xi >= 0 && yi >= 0 && xi < w && yi < h ? yi * w + xi : -1; };
  const inside = (x, y) => { const i = li(x, y); return i >= 0 && d[i] > 0; }, depth = q => { const i = li(q[0], q[1]); return i >= 0 ? d[i] : 0; };
  const parts = []; let longest = 0;
  for (const cl of centreLines(dt).flatMap(q => corners(q, depth))) {
    const col = turningColumn(cl, inside, depth, opts); if (!col) continue;
    for (let i = Math.max(1, col.nu); i < col.pts.length; i++) longest = Math.max(longest, Math.hypot(col.pts[i][0] - col.pts[i - 1][0], col.pts[i][1] - col.pts[i - 1][1]));
    const pts = col.pts; pts.nu = col.nu; parts.push({ pts, under: false, rev: !col.nu, nu: col.nu });
  }
  if (!parts.length || longest >= oneAngle) return null;
  // the stitches must cover the shape: each laid as thread 0.4 mm wide over the shape's grid
  const cov = new Uint8Array(d.length), rad = Math.max(1, opts.step);
  for (const { pts, nu } of parts) for (let i = Math.max(1, nu); i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1;
    for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const k = li(x + dx, y + dy); if (k >= 0) cov[k] = 1; } } }
  let all = 0, hit = 0; for (let i = 0; i < d.length; i++) if (d[i]) { all++; hit += cov[i]; }
  return hit >= all * .97 ? parts : null;
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
    pts.push(...u); pts.nu = u.length; rows.reverse();
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
    const { width, box, dt } = widthOf(r, W), widthMm = width * pxMm, satin = widthMm <= o.satinMaxMm;
    const shape = { rid, colour: c, kind: satin ? 'satin' : 'fill', widthMm: Math.round(widthMm * 10) / 10, areaMm2: Math.round(r.n * pxMm * pxMm), box: [box[0], box[1], box[2] + 1, box[3] + 1].map((v, k) => Math.round((v - (k % 2 ? H : W) / 2) * pxMm * 10)), pbox: box, parts: [] };
    if (satin) {
      const ang = crossAngle(mask, W, H, box, o.satinSpacingMm * mmPx), sc = scan(mask, W, H, box, ang, o.satinSpacingMm * mmPx, .5);
      // one angle serves a straight stroke; where its rows run along the stroke (a curve, a ring) the satin turns with the stroke instead
      let longest = 0; for (const l of sc.lines) for (const q of l.runs) longest = Math.max(longest, q[1] - q[0]);
      const turn = longest > 1.5 * width + 2 && turning(dt, { step: o.satinSpacingMm * mmPx, pullPx: o.pullMm * mmPx, splitPx: o.splitMm * mmPx, underlay: o.underlay && widthMm > 1.2, walkPx: 2 * mmPx, gapPx: .15 * mmPx }, longest);
      if (turn) { shape.parts.push(...turn); shape.turning = true; }
      else for (const s of sections(sc)) { const ul = o.underlay && widthMm > 1.2 && s.rows.length > 2, pts = satinSection(s, sc, { pullPx: o.pullMm * mmPx, splitPx: o.splitMm * mmPx, underlay: ul, walkPx: 2 * mmPx }); if (pts.length > 1) shape.parts.push({ pts, under: false, rev: !ul, nu: pts.nu || 0 }); }
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
  // shape runs there in small stitches, routed through the part not yet sewn so the top covers them (never across finished stitching, where
  // they would show); any other move over 1 mm jumps with a lock stitch either side, and trims when long ----
  const to01 = ([x, y]) => [Math.round((x - W / 2) * pxMm * 10), Math.round((y - H / 2) * pxMm * 10)];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const nearest = (list, from) => { let bi = 0, bd = Infinity, rev = false; list.forEach((q, i) => { const da = dist(from, q.pts[0]); if (da < bd) { bd = da; bi = i; rev = false; } if (q.rev) { const dz = dist(from, q.pts.at(-1)); if (dz < bd) { bd = dz; bi = i; rev = true; } } }); const q = list.splice(bi, 1)[0]; return { pts: rev ? q.pts.slice().reverse() : q.pts, under: q.under, nu: rev ? 0 : q.nu || 0 }; };
  // what the top stitching has covered so far, and a travel path that stays inside the shape and off it (bar the first and last mm)
  const sewn = new Uint8Array(W * H);
  const markR = Math.max(1, Math.ceil(Math.max(o.rowMm, .4) * .6 * mmPx)); // each stitch marked as wide as a row of thread, so the rows join up
  const mark = pts => { for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], L = dist(a, b), n = Math.max(1, Math.ceil(L)), ux = L ? -(b[1] - a[1]) / L : 0, uy = L ? (b[0] - a[0]) / L : 0;
    for (let i = 0; i <= n; i++) { const cx = a[0] + (b[0] - a[0]) * i / n, cy = a[1] + (b[1] - a[1]) * i / n; for (let j = -markR; j <= markR; j++) { const x = Math.floor(cx + ux * j), y = Math.floor(cy + uy * j); if (x >= 0 && y >= 0 && x < W && y < H) sewn[y * W + x] = 1; } } } };
  const clear = (a, b, rid) => { const L = dist(a, b), n = Math.max(1, Math.ceil(L / .7)); for (let i = 0; i <= n; i++) { const s = L * i / n, x = Math.floor(a[0] + (b[0] - a[0]) * i / n), y = Math.floor(a[1] + (b[1] - a[1]) * i / n); if (x < 0 || y < 0 || x >= W || y >= H || label[y * W + x] !== rid) return false; if (s > mmPx && s < L - mmPx && sewn[y * W + x]) return false; } return true; };
  const route = (a, b, rid, [bx0, by0, bx1, by1]) => { // breadth-first over 0.5 mm cells of the shape not yet sewn; null when there is no way through
    const c = Math.max(2, Math.round(.5 * mmPx)), gw = Math.floor((bx1 - bx0) / c) + 1, gh = Math.floor((by1 - by0) / c) + 1, cell = q => Math.min(gh - 1, Math.max(0, Math.floor((q[1] - by0) / c))) * gw + Math.min(gw - 1, Math.max(0, Math.floor((q[0] - bx0) / c)));
    const ctr = k => [bx0 + (k % gw) * c + c / 2, by0 + Math.floor(k / gw) * c + c / 2], from = cell(a), to = cell(b), back = new Int32Array(gw * gh).fill(-2), q = new Int32Array(gw * gh); let h = 0, t = 0;
    const free = k => { const [x, y] = ctr(k).map(Math.floor); return x < W && y < H && label[y * W + x] === rid && !sewn[y * W + x]; };
    back[from] = -1; q[t++] = from;
    while (h < t && back[to] === -2) { const k = q[h++], kx = k % gw, ky = (k - kx) / gw; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = kx + dx, ny = ky + dy, n = ny * gw + nx; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < gw && ny < gh && back[n] === -2 && (n === to || free(n))) { back[n] = k; q[t++] = n; } } }
    if (back[to] === -2) return null;
    const cells = []; for (let k = back[to]; k >= 0 && k !== from; k = back[k]) cells.unshift(ctr(k));
    const path = [a, ...cells, b], out = [a]; let i = 0;
    while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !clear(path[i], path[j], rid)) j--; out.push(path[j]); i = j; }
    return out;
  };
  const plan = []; let cur = [W / 2, H / 2], trims = 0, jumps = 0;
  const one = mmPx, trimPx = o.trimMm * mmPx, travelPx = 2.5 * mmPx;
  for (const c of order) {
    const block = { hex: sep.inks[c].hex, rgb: sep.inks[c].rgb, colour: c, pts: [] }, add = (q, extra = {}) => block.pts.push({ p: to01(q), ...extra });
    const left = objects.filter(s => s.colour === c); let first = true, prev = null;
    while (left.length) {
      let bi = 0, bd = Infinity; left.forEach((sh, i) => { for (const q of sh.parts) { const d = Math.min(dist(cur, q.pts[0]), q.rev ? dist(cur, q.pts.at(-1)) : Infinity); if (d < bd) { bd = d; bi = i; } } });
      const sh = left.splice(bi, 1)[0], under = sh.parts.filter(q => q.under), top = sh.parts.filter(q => !q.under), seq = [];
      while (under.length) seq.push(nearest(under, seq.length ? seq.at(-1).pts.at(-1) : cur));
      while (top.length) seq.push(nearest(top, seq.length ? seq.at(-1).pts.at(-1) : cur));
      const oi = objects.indexOf(sh);
      let way = null;
      for (const { pts, under: ul, nu } of seq) {
        const tag = i => (ul || i < nu ? { o: oi, u: true } : { o: oi });
        const start = pts[0], gap = dist(cur, start);
        if (first) { add(start, { jump: true, o: oi }); jumps++; tie(block.pts, to01(start), to01(pts[1] || start)); }
        else if (gap <= one) add(start, tag(0));
        else if (sh.rid === prev && (way = clear(cur, start, sh.rid) ? [cur, start] : route(cur, start, sh.rid, sh.pbox))) { for (let k = 1; k < way.length; k++) { const a = way[k - 1], b = way[k], n = Math.ceil(dist(a, b) / travelPx); for (let i = 1; i <= n; i++) add([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], { o: oi, run: true }); } }
        else { tie(block.pts, to01(cur), block.pts.at(-2)?.p); if (gap > trimPx) { block.pts.push({ p: to01(cur), trim: true }); trims++; } add(start, { jump: true, o: oi }); jumps++; tie(block.pts, to01(start), to01(pts[1] || start)); }
        let last = start; for (let i = 1; i < pts.length; i++) { const q = pts[i]; if (dist(q, last) < .3 * mmPx && i < pts.length - 1) continue; add(q, tag(i)); last = q; }
        if (!ul) mark(pts);
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
  return { plan, threads, objects: objects.map(({ parts, pbox, ...s }) => ({ ...s, thread: order.indexOf(s.colour) + 1 })), widthMm: Math.round(wMm * 10) / 10, heightMm: Math.round(hMm * 10) / 10, knockouts: sep.inks.filter(i => i.knockout).map(i => i.hex), settings: o,
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
