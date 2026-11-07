// Tracing pixels into vector outlines, with no imports: the server's tracer (src/lab-vector.js) and the Studio's "Outlines" (a Pencil drawing on
// the picture or on the flats) both use it. The page loads it at /lab/lab-trace.js.
//
//   loopsOf(idx, W, H, j)              the outline of every region of ink j (idx: one ink index per pixel, −1 for none), along the pixel edges
//   closedSimplify(loop, tol)          a closed loop with fewer points (Douglas–Peucker)
//   smoothPath(pts)                    a closed loop as SVG path data: smooth curves, real corners kept sharp
//   outlines(rgba, W, H, { level })    a drawing (RGBA pixels) as one filled outline per ink: [{ hex, d, loops, share }]. Each level up is cleaner:
//                                      the pencil's grain closed up, specks dropped, the line simplified and smoothed (level 1 to 6)

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
// a closed shape as quadratic curves through the midpoints of its sides; a real corner (the line turns sharply between two long sides) stays one
export function smoothPath(pts) {
  if (pts.length < 3) return ''; const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], s = m(pts[pts.length - 1], pts[0]);
  const N = pts.length, corner = i => { const a = pts[(i - 1 + N) % N], p = pts[i], b = pts[(i + 1) % N], ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    return lu > 4 && lv > 4 && (ux * vx + uy * vy) / (lu * lv) < .35; };
  let d = `M${n2(s[0])} ${n2(s[1])}`; for (let i = 0; i < N; i++) { const p = pts[i], q = m(p, pts[(i + 1) % N]); d += corner(i) ? `L${n2(p[0])} ${n2(p[1])}L${n2(q[0])} ${n2(q[1])}` : `Q${n2(p[0])} ${n2(p[1])} ${n2(q[0])} ${n2(q[1])}`; }
  return d + 'Z';
}
// a closed loop rounded without more points: each point drawn a little toward its neighbours, once a pass (a hand's wobble smoothed out)
export function relax(pts, passes = 1) {
  let p = pts; for (let k = 0; k < passes && p.length >= 4; k++) p = p.map((q, i) => { const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length]; return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4]; });
  return p;
}
const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
const hexOf = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

// how each level cleans: grain closed up (blur radius), the threshold, specks dropped (in px²), the line simplified (px) and rounded (passes)
export const LEVELS = [
  { blur: 0, cut: 96, speck: 3, tol: .7, round: 0 },
  { blur: 1, cut: 90, speck: 10, tol: 1.1, round: 1 },
  { blur: 1, cut: 80, speck: 24, tol: 1.6, round: 1 },
  { blur: 2, cut: 76, speck: 48, tol: 2.2, round: 2 },
  { blur: 2, cut: 70, speck: 90, tol: 3, round: 2 },
  { blur: 3, cut: 64, speck: 160, tol: 4, round: 3 }
];
// the inks of a drawing: its colours, the near ones taken as one (anti-aliased edges and a pencil's grain are not inks of their own)
function inksOf(rgba, N, maxInks) {
  const hist = new Map();
  for (let i = 0; i < N; i++) { const a = rgba[i * 4 + 3]; if (a < 40) continue; const k = (rgba[i * 4] >> 4) << 8 | (rgba[i * 4 + 1] >> 4) << 4 | rgba[i * 4 + 2] >> 4, h = hist.get(k); if (h) { h.n++; h.r += rgba[i * 4]; h.g += rgba[i * 4 + 1]; h.b += rgba[i * 4 + 2]; } else hist.set(k, { n: 1, r: rgba[i * 4], g: rgba[i * 4 + 1], b: rgba[i * 4 + 2] }); }
  const buckets = [...hist.values()].sort((a, b) => b.n - a.n).map(h => ({ n: h.n, c: [h.r / h.n, h.g / h.n, h.b / h.n] })), inks = [];
  for (const b of buckets) { const near = inks.find(k => Math.hypot(k.c[0] - b.c[0], k.c[1] - b.c[1], k.c[2] - b.c[2]) < 70); if (near) { const t = near.n + b.n; near.c = near.c.map((v, i) => (v * near.n + b.c[i] * b.n) / t); near.n = t; } else if (inks.length < maxInks) inks.push({ ...b }); }
  return inks.filter(k => k.n > 4);
}
function blurAlpha(al, W, H, r) {
  if (!r) return al; const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += al[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / n; s += al[y * W + Math.min(W - 1, x + r + 1)] - al[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
export function outlines(rgba, W, H, { level = 1, maxInks = 6 } = {}) {
  const L = LEVELS[Math.min(LEVELS.length, Math.max(1, Math.round(level))) - 1], N = W * H, inks = inksOf(rgba, N, maxInks); if (!inks.length) return [];
  // each pixel to its nearest ink, with the coverage blurred (the grain closed up) before the cut
  const nearest = new Int8Array(N).fill(-1), al = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = rgba[i * 4 + 3]; if (!a) continue; al[i] = a; let best = 0, bd = Infinity; for (let j = 0; j < inks.length; j++) { const c = inks[j].c, d = (c[0] - rgba[i * 4]) ** 2 + (c[1] - rgba[i * 4 + 1]) ** 2 + (c[2] - rgba[i * 4 + 2]) ** 2; if (d < bd) { bd = d; best = j; } } nearest[i] = best; }
  const soft = blurAlpha(al, W, H, L.blur), idx = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (soft[i] >= L.cut) { let j = nearest[i]; if (j < 0) { // a pixel the blur filled in: the ink of its nearest drawn neighbour
      for (let r = 1; r <= L.blur + 1 && j < 0; r++) for (const o of [-r, r, -r * W, r * W]) { const k = i + o; if (k >= 0 && k < N && nearest[k] >= 0) { j = nearest[k]; break; } } }
    idx[i] = j < 0 ? 0 : j; }
  const total = inks.reduce((t, k) => t + k.n, 0) || 1, out = [];
  inks.forEach((k, j) => {
    const loops = loopsOf(idx, W, H, j).filter(l => area(l) >= L.speck).map(l => relax(closedSimplify(l, L.tol), L.round)).filter(l => l.length >= 3);
    if (loops.length) out.push({ hex: hexOf(...k.c), d: loops.map(smoothPath).join(''), loops: loops.length, share: Math.round(k.n / total * 1000) / 1000 });
  });
  return out;
}
