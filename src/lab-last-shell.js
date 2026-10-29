// The last's surface, and the upper's pieces flattened off it (shared by the Pattern page and the service; no DOM, no Node).
// A pattern drafted on the side view takes heights as they look from the side; over the instep and round the heel the surface turns away, so
// the real distance up it is longer. Here the last's side is a shell: each section from the feather line (where the side meets the bottom) up
// to the top centre, on the outside (lateral) and the inside (medial). Each half is flattened the way a last's side is taped and peeled
// (the forme), by a least-squares conformal map: angles kept, the stretch spread evenly and measured. Pieces drawn on the side view are
// carried onto the shell (a side-view point is the place on the surface that looks that way from the side) and off it, flat.
//   loftFrom(last)                  → a closed 3D last (triangles, inches: x heel→toe, y up, z across with the inside negative) from lastOf's
//                                     side profile and bottom outline
//   shellOf(last, {n, m})           → { lateral, medial } each { pts (3D grid: a row per section, feather → top), flat (the same grid, flattened,
//                                     lined up with the side view), stretch {max, rms} }
//   flattenPoint(half, [x, y])      → a side-view point (y downward, as lastOf draws) flattened
//   flattenPiece(piece, shell)      → the piece cut from its flattened outline (the side-view one kept as how it shows on the product)
//   splitPiece(piece, seam)         → the piece cut in two along a seam line (side-view points), or null when the line does not cross it
//   onSurface(half, [x, y])         → the 3D point a side-view point stands for (for drawing lines on the last)

const r3 = v => Math.round(v * 1000) / 1000;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---- the last in 3D, from its side profile and its bottom outline ----
// each section: its bottom and top from the side view, its width from the bottom view; flat underneath (widest at the feather line), rounder
// over the top
export function ringOf(last, x, m = 36) {
  const B = last.bottom, ys = [];
  for (let i = 0; i < B.length; i++) { const p = B[i], q = B[(i + 1) % B.length]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) ys.push(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])); }
  const [z0, z1] = ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 0];
  const yb = -last.lastBottom(x), yt = -last.crest(x), zc = (z0 + z1) / 2, hw = Math.max(.05, (z1 - z0) / 2), hh = Math.max(.05, (yt - yb) / 2), yc = (yb + yt) / 2;
  return Array.from({ length: m }, (_, i) => { const a = 2 * Math.PI * i / m, c = Math.cos(a), s = Math.sin(a), p = s < 0 ? 6 : 2.2, sp = v => Math.sign(v) * Math.abs(v) ** (2 / p);
    return [x, yc + hh * sp(s), zc + hw * (s > 0 ? 1 - .2 * s : 1) * sp(c)]; });
}
export function loftFrom(last) {
  const L = last.length, M = 36, N = 64, xs = Array.from({ length: N + 1 }, (_, k) => L * (1 - Math.cos(Math.PI * k / N)) / 2).map(x => Math.min(L - .005, Math.max(.005, x)));
  const R = xs.map(x => ringOf(last, x, M)), tri = [], put = (a, b, c) => tri.push(...a, ...b, ...c);
  for (let k = 0; k < N; k++) for (let i = 0; i < M; i++) { const a = R[k][i], b = R[k][(i + 1) % M], c = R[k + 1][(i + 1) % M], d = R[k + 1][i]; put(a, b, c); put(a, c, d); }
  const cap = (r, x, rev) => { const cy = r.reduce((s, p) => s + p[1], 0) / M, cz = r.reduce((s, p) => s + p[2], 0) / M, o = [x, cy, cz]; for (let i = 0; i < M; i++) { const a = r[i], b = r[(i + 1) % M]; if (rev) put(o, b, a); else put(o, a, b); } };
  cap(R[0], 0, true); cap(R[N], L, false);
  const pos = Float32Array.from(tri);
  let vol = 0; for (let t = 0; t < pos.length; t += 9) vol += pos[t] * (pos[t + 4] * pos[t + 8] - pos[t + 5] * pos[t + 7]) - pos[t + 1] * (pos[t + 3] * pos[t + 8] - pos[t + 5] * pos[t + 6]) + pos[t + 2] * (pos[t + 3] * pos[t + 7] - pos[t + 4] * pos[t + 6]);
  if (vol < 0) for (let t = 0; t < pos.length; t += 9) for (let k = 0; k < 3; k++) { const a = pos[t + 3 + k]; pos[t + 3 + k] = pos[t + 6 + k]; pos[t + 6 + k] = a; } // outward
  return pos;
}

// ---- the shell: each section from the feather line up to the top centre, both sides ----
// a section's points in order round it; one side's half from its feather corner (the outermost low point) up to its top, resampled evenly
function halfOf(ring, side, m) {
  let lo = Infinity, hi = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of ring) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  const zc = (z0 + z1) / 2, hw = (z1 - z0) / 2 || 1, h = hi - lo || 1, sgn = side === 'medial' ? -1 : 1;
  let fi = 0, best = -Infinity, ti = 0; ring.forEach((p, i) => { const sc = sgn * (p[2] - zc) / hw - (p[1] - lo) / h; if (sgn * (p[2] - zc) > 0 && p[1] < lo + h / 2 && sc > best) { best = sc; fi = i; } if (p[1] > ring[ti][1] + 1e-9) ti = i; });
  // walk from the feather corner to the top on this side (the ring turns counter-clockwise from +z: up the outside is forward, the inside backward)
  const n = ring.length, step = side === 'medial' ? -1 : 1, path = [ring[fi]];
  for (let i = fi; i !== ti; ) { i = (i + step + n) % n; path.push(ring[i]); if (path.length > n) break; }
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + len(sub(path[i], path[i - 1])));
  const T = cum[cum.length - 1];
  return Array.from({ length: m + 1 }, (_, j) => { const d = T * j / m; let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const a = path[k - 1], b = path[k], t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; });
}
// ---- flattening: least-squares conformal map of a grid, solved by conjugate gradients on the normal equations, from a plain unrolling ----
function lscm(P, n, m) {
  const V = (n + 1) * (m + 1), id = (i, j) => i * (m + 1) + j, rows = [];
  const tri = (a, b, c) => {
    const p0 = P[a], p1 = P[b], p2 = P[c], e = sub(p1, p0), f = sub(p2, p0), nn = cross(e, f), A2 = len(nn); if (A2 < 1e-10) return;
    const le = len(e), ex = e.map(v => v / le), ey = cross(nn, ex).map(v => v / A2), q = [[0, 0], [le, 0], [dot(f, ex), dot(f, ey)]], k = 1 / Math.sqrt(A2), vs = [a, b, c];
    const W = [0, 1, 2].map(t => [(q[(t + 2) % 3][0] - q[(t + 1) % 3][0]) * k, (q[(t + 2) % 3][1] - q[(t + 1) % 3][1]) * k]);
    rows.push(vs.flatMap((v, t) => [[2 * v, W[t][0]], [2 * v + 1, -W[t][1]]]), vs.flatMap((v, t) => [[2 * v, W[t][1]], [2 * v + 1, W[t][0]]]));
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { tri(id(i, j), id(i + 1, j), id(i + 1, j + 1)); tri(id(i, j), id(i + 1, j + 1), id(i, j + 1)); }
  // the start: each section unrolled up from its feather point, the sections spaced along the feather line
  const x = new Float64Array(2 * V); let u = 0;
  for (let i = 0; i <= n; i++) { if (i) u += len(sub(P[id(i, 0)], P[id(i - 1, 0)])); let v = 0; for (let j = 0; j <= m; j++) { if (j) v += len(sub(P[id(i, j)], P[id(i, j - 1)])); x[2 * id(i, j)] = u; x[2 * id(i, j) + 1] = v; } }
  // two pins (the heel and the toe at the feather line) fix where it lies; everything else moves. Rows are kept flat (six terms each) for speed.
  const R = rows.length, cols = new Int32Array(R * 6), vals = new Float64Array(R * 6), pin = new Uint8Array(2 * V);
  [2 * id(0, 0), 2 * id(0, 0) + 1, 2 * id(n, 0), 2 * id(n, 0) + 1].forEach(c => { pin[c] = 1; });
  rows.forEach((row, k) => row.forEach(([c, w], t) => { cols[k * 6 + t] = c; vals[k * 6 + t] = w; }));
  const Ax = (v, out) => { for (let k = 0; k < R; k++) { let s = 0; for (let t = k * 6; t < k * 6 + 6; t++) s += vals[t] * v[cols[t]]; out[k] = s; } return out; };
  const At = (r, out) => { out.fill(0); for (let k = 0; k < R; k++) { const rk = r[k]; for (let t = k * 6; t < k * 6 + 6; t++) { const c = cols[t]; if (!pin[c]) out[c] += vals[t] * rk; } } return out; };
  const res = Ax(x, new Float64Array(R)); for (let k = 0; k < R; k++) res[k] = -res[k];
  const s = At(res, new Float64Array(2 * V)), p = Float64Array.from(s), q = new Float64Array(R); let g = 0; for (const v of s) g += v * v; const g0 = g;
  let it = 0;
  for (; it < 400 && g > g0 * 1e-10; it++) {
    Ax(p, q); let qq = 0; for (let k = 0; k < R; k++) qq += q[k] * q[k]; if (!qq) break; const a = g / qq;
    for (let c = 0; c < x.length; c++) x[c] += a * p[c]; for (let k = 0; k < R; k++) res[k] -= a * q[k];
    At(res, s); let g1 = 0; for (const v of s) g1 += v * v; const b = g1 / g; for (let c = 0; c < p.length; c++) p[c] = s[c] + b * p[c]; g = g1;
  }
  lscm.iterations = it;
  return Array.from({ length: V }, (_, k) => [x[2 * k], x[2 * k + 1]]);
}
const area2 = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
function flattenHalf(P, n, m) {
  let F = lscm(P, n, m);
  const id = (i, j) => i * (m + 1) + j, tris = []; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
  const a3 = t => len(cross(sub(P[t[1]], P[t[0]]), sub(P[t[2]], P[t[0]]))) / 2;
  // the same area as the surface; then turned (mirrored if it came out the other hand) and moved to lie over the side view as closely as it can
  let A3 = 0, A2 = 0; for (const t of tris) { A3 += a3(t); A2 += area2(F[t[0]], F[t[1]], F[t[2]]); }
  const k = Math.sqrt(A3 / Math.abs(A2 || 1)); F = F.map(([u, v]) => [u * k, v * k]);
  const S = P.map(p => [p[0], -p[1]]), sideA = tris.reduce((t, q) => t + area2(S[q[0]], S[q[1]], S[q[2]]), 0), flatA = tris.reduce((t, q) => t + area2(F[q[0]], F[q[1]], F[q[2]]), 0);
  if (Math.sign(sideA) !== Math.sign(flatA)) F = F.map(([u, v]) => [u, -v]);
  const cf = F.reduce((c, p) => [c[0] + p[0] / F.length, c[1] + p[1] / F.length], [0, 0]), cs = S.reduce((c, p) => [c[0] + p[0] / S.length, c[1] + p[1] / S.length], [0, 0]);
  let sc = 0, ss = 0; F.forEach((p, i) => { const a = [p[0] - cf[0], p[1] - cf[1]], b = [S[i][0] - cs[0], S[i][1] - cs[1]]; sc += a[0] * b[0] + a[1] * b[1]; ss += a[0] * b[1] - a[1] * b[0]; });
  const th = Math.atan2(ss, sc), co = Math.cos(th), si = Math.sin(th);
  F = F.map(([u, v]) => { const a = u - cf[0], b = v - cf[1]; return [r3(cs[0] + co * a - si * b), r3(cs[1] + si * a + co * b)]; });
  // how much each little triangle grew or shrank in the flattening
  let mx = 0, sq = 0; for (const t of tris) { const r = Math.abs(area2(F[t[0]], F[t[1]], F[t[2]])) / (a3(t) || 1) - 1; mx = Math.max(mx, Math.abs(r)); sq += r * r; }
  return { flat: F, stretch: { max: r3(mx), rms: r3(Math.sqrt(sq / tris.length)) } };
}
const memo = new Map();
export function shellOf(last, { n = 40, m = 16 } = {}) {
  const key = JSON.stringify([last.length, last.ballGirth, last.heelHeight, last.toeSpring, last.side?.length, last.side?.[5], last.side?.[60], last.bottom?.[3], last.bottom?.[30], n, m]);
  if (memo.has(key)) return memo.get(key);
  const L = last.length, xs = Array.from({ length: n + 1 }, (_, i) => L * (.004 + .982 * i / n)), rings = xs.map(x => ringOf(last, x, 96));
  const half = side => { const P = rings.flatMap(r => halfOf(r, side, m)), f = flattenHalf(P, n, m); return { side, n, m, xs, pts: P.map(p => p.map(r3)), flat: f.flat, stretch: f.stretch }; };
  const out = { lateral: half('lateral'), medial: half('medial'), length: L };
  if (memo.size > 40) memo.clear(); memo.set(key, out);
  return out;
}

// ---- carrying side-view points onto the shell and off it, flat ----
// a side-view point (x along, y downward) is the place on this side's surface that looks that way from the side: its section by x, its place up
// the section by height. Below the feather line (the lasting allowance, folded under) and past the ends it carries on straight.
function along(h, i, yu, clamp = false) {
  const { m } = h, P = h.pts, F = h.flat, at = j => i * (m + 1) + j;
  let j = 0; while (j < m - 1 && P[at(j + 1)][1] < yu) j++;
  const a = P[at(j)], b = P[at(j + 1)], fa = F[at(j)], fb = F[at(j + 1)];
  if (clamp) yu = Math.min(Math.max(yu, P[at(0)][1]), P[at(m)][1]);
  if (j === 0 && yu < a[1]) { const d = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]) || 1, k = (a[1] - yu) / d; return { f: [fa[0] - (fb[0] - fa[0]) * k, fa[1] - (fb[1] - fa[1]) * k], p: [a[0], yu, a[2]] }; }
  // above the top of the section (a boot's shaft, a back tab over the collar) it carries straight on up, as far again as it is above
  if (j === m - 1 && yu > b[1]) { const d = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]) || 1, k = (yu - b[1]) / d; return { f: [fb[0] + (fb[0] - fa[0]) * k, fb[1] + (fb[1] - fa[1]) * k], p: [b[0], yu, b[2]] }; }
  const tt = Math.min(Math.max((yu - a[1]) / ((b[1] - a[1]) || 1e-9), 0), 1);
  return { f: [fa[0] + (fb[0] - fa[0]) * tt, fa[1] + (fb[1] - fa[1]) * tt], p: [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt] };
}
function locate(h, [x, y], clamp = false) {
  const { xs, n } = h, dx = xs[1] - xs[0], fi = (x - xs[0]) / dx, i = Math.min(Math.max(Math.floor(fi), 0), n - 1), t = fi - i, yu = -y;
  const A = along(h, i, yu, clamp), B = along(h, i + 1, yu, clamp);
  return { f: [A.f[0] + (B.f[0] - A.f[0]) * t, A.f[1] + (B.f[1] - A.f[1]) * t], p: [x, A.p[1] + (B.p[1] - A.p[1]) * t, A.p[2] + (B.p[2] - A.p[2]) * t] };
}
export const flattenPoint = (h, q) => locate(h, q).f.map(r3);
// clamp: kept on the surface (for drawing on the last), not carried past the feather line or the top
export const onSurface = (h, q, clamp = false) => locate(h, q, clamp).p;
const sideOf = pc => /-med(-|$)|inside/.test(pc.id) ? 'medial' : 'lateral';
// a piece cut from the flattened side of the last: its outline, grain and notches carried over; a piece cut whole (a vamp, a toe cap) is
// flattened on one side and mirrored over its flattened centre line
export function flattenPiece(pc, shell) {
  const h = shell[sideOf(pc)], fl = q => flattenPoint(h, q);
  let sew;
  if (pc.half) { const lower = pc.half.map(fl), A = lower[0], B = lower[lower.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
    const refl = ([x, y]) => { const t = ((x - A[0]) * dx + (y - A[1]) * dy) / L2, px = A[0] + t * dx, py = A[1] + t * dy; return [r3(2 * px - x), r3(2 * py - y)]; };
    sew = [...lower, ...lower.slice(1, -1).reverse().map(refl)]; }
  else sew = pc.sew.map(fl);
  const { half, ...rest } = pc;
  return { ...rest, shown: pc.shown || pc.sew, sew, grain: pc.grain.map(fl), notches: pc.notches.map(fl), flattened: h.side };
}

// ---- a seam drawn on the last: a piece cut in two along it ----
const segX = (p, q, a, b) => { const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]); if (Math.abs(d) < 1e-12) return null; const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, pt: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] } : null; };
const areaOf = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
// → [before, after] (the two outlines) or null. The line is carried on straight past its ends (up to 3 in) to meet the outline.
export function cutOutline(poly, line) {
  if (line.length < 2) return null;
  const ext = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [b[0] + (b[0] - a[0]) / d * 3, b[1] + (b[1] - a[1]) / d * 3]; };
  const L = [ext(line[1], line[0]), ...line, ext(line[line.length - 2], line[line.length - 1])], hits = [];
  for (let s = 0; s < L.length - 1; s++) for (let e = 0; e < poly.length; e++) { const h = segX(L[s], L[s + 1], poly[e], poly[(e + 1) % poly.length]); if (h) hits.push({ s, t: h.t, e, u: h.u, pt: h.pt }); }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.s - b.s || a.t - b.t);
  const a = hits[0], b = hits[hits.length - 1]; if (a.e === b.e && Math.abs(a.u - b.u) < 1e-9) return null;
  const mid = L.slice(a.s + 1, b.s + 1), cut = [a.pt, ...mid, b.pt], n = poly.length;
  // the outline's corners from just after one crossing round to the other: none when both are on one edge in that order, all of them when
  // it has to go the whole way round
  const walk = (fe, fu, te, tu) => { if (fe === te && tu >= fu) return []; const out = []; let e = fe; for (let k = 0; k < n; k++) { e = (e + 1) % n; out.push(poly[e]); if (e === te) break; } return out; };
  const A = [...cut, ...walk(b.e, b.u, a.e, a.u)], B = [...cut.slice().reverse(), ...walk(a.e, a.u, b.e, b.u)];
  return areaOf(A) > .2 && areaOf(B) > .2 ? [A, B] : null;
}
export function splitPiece(pc, seam) {
  const parts = cutOutline(pc.sew, seam.pts); if (!parts) return null;
  const shownParts = pc.shown ? cutOutline(pc.shown, seam.pts) : null, cx = pts => pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const order = parts.map((p, k) => ({ p, k, x: cx(p) })).sort((a, b) => a.x - b.x), ends = [seam.pts[0], seam.pts[seam.pts.length - 1]];
  return order.map(({ p, k }, idx) => {
    const sh = shownParts ? shownParts.slice().sort((a, b) => cx(a) - cx(b))[idx] : null, b = { x0: Math.min(...p.map(q => q[0])), x1: Math.max(...p.map(q => q[0])), y0: Math.min(...p.map(q => q[1])), y1: Math.max(...p.map(q => q[1])) };
    return { ...pc, id: `${pc.id}-${idx ? 'f' : 'b'}${seam.n || ''}`, name: `${pc.name} (${idx ? 'front' : 'back'})`, sew: p.map(q => q.map(r3)), shown: sh ? sh.map(q => q.map(r3)) : undefined, half: undefined,
      grain: [[(b.x0 + b.x1) / 2, b.y0 + (b.y1 - b.y0) * .2], [(b.x0 + b.x1) / 2, b.y1 - (b.y1 - b.y0) * .2]], notches: [...pc.notches.filter(q => p.some(r => Math.hypot(r[0] - q[0], r[1] - q[1]) < 3)), ...ends.filter(Boolean)], notes: [...pc.notes, `Seam drawn on the last: ${seam.name || 'a new seam'}`], seam: seam.id };
  });
}
