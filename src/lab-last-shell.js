// The last's surface, and the upper's pieces flattened off it (shared by the Pattern page and the service; no DOM, no Node).
// A pattern drafted on the side view takes heights as they look from the side; over the instep and round the heel the surface turns away, so
// the real distance up it is longer. Here the last's side is a shell: each section from the feather line (where the side meets the bottom) up
// to the top centre, on the outside (lateral) and the inside (medial). Each half is flattened the way a last's side is taped and peeled
// (the forme): as near the surface's own lengths as a flat sheet can be (as rigid as possible), every section and the feather line held
// firmest, the stretch that is left measured. Pieces drawn on the side view are
// carried onto the shell (a side-view point is the place on the surface that looks that way from the side) and off it, flat.
//   loftFrom(last)                  → a closed 3D last (triangles, inches: x heel→toe, y up, z across with the inside negative) from lastOf's
//                                     side profile and bottom outline
//   shellOf(last, {n, m, leg})      → { lateral, medial } each { pts (3D grid: a row per section, feather → top), flat (the same grid, flattened,
//                                     lined up with the side view), stretch {max, rms} }
//   flattenPoint(half, [x, y])      → a side-view point (y downward, as lastOf draws) flattened
//   flattenPiece(piece, shell)      → the piece cut from its flattened outline (the side-view one kept as how it shows on the product); a
//                                     piece cut whole (piece.half) is developed about its fold, one that wraps the back or the front
//                                     (piece.fold) is its two flattened halves laid together; its labelled points (at) and lines come too
//   wholeOf(shell, from)            → the forepart flattened as one sheet, across the top, which the pieces cut whole are cut from
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
// ---- flattening ----
// A part of the last's surface is flattened the way a forme taped over a last is peeled: each section is first laid straight across a
// straight centre line, then the sheet is drawn as near the surface's own lengths as a flat sheet can be (as rigid as possible). No flat
// sheet lies true on a last, so what must be true is held firmest: every section its own length round the last (a piece then reaches the
// feather line with its allowance, and the two sides of the back seam, the back of the heel being a section, are the same length), the
// feather lines theirs (the upper's edge is then the length of the bottom it is lasted or sewn to), and the centre line over the top
// its own (a fold, a lace edge). What stretch is left lies in the body of the sheet, where an upper is drawn over the last in lasting. Each side of the last is one sheet (a quarter is cut
// from it); the forepart, the outside and the inside together across the top, is another (a vamp is cut whole from it).
// as-rigid-as-possible: from a flat sheet with no folds, each triangle's best turn, then every point where the turned
// triangles agree best (cotangent weights, solved by conjugate gradients), repeated; one point is held so the sheet does not drift
function asRigid(P, F0, tris, firm = () => 1, rounds = 12) {
  const V = P.length, N = tris.length * 3, ei = new Int32Array(N), ej = new Int32Array(N), ew = new Float64Array(N), qx = new Float64Array(N), qy = new Float64Array(N); let E = 0;
  for (const t of tris) { const p0 = P[t[0]], e = sub(P[t[1]], p0), f = sub(P[t[2]], p0), nn = cross(e, f), A2 = len(nn); if (A2 < 1e-12) continue;
    const le = len(e), ex = e.map(v => v / le), ey = cross(nn, ex).map(v => v / A2), q = [[0, 0], [le, 0], [dot(f, ex), dot(f, ey)]];
    // each edge, with the weight of the corner opposite it: half its cotangent (kept positive, so a thin triangle cannot pull backwards)
    for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], c = q[(k + 2) % 3], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
      ei[E] = t[(k + 1) % 3]; ej[E] = t[(k + 2) % 3]; ew[E] = Math.min(Math.max((ux * vx + uy * vy) / Math.abs(ux * vy - uy * vx) / 2, .02), 10) * firm(ei[E], ej[E]); qx[E] = b[0] - c[0]; qy[E] = b[1] - c[1]; E++; } }
  // the sheet's stiffness (a weighted Laplacian), row by row
  const diag = new Float64Array(V), nb = Array.from({ length: V }, () => new Map());
  for (let k = 0; k < E; k++) { const i = ei[k], j = ej[k], w = ew[k]; diag[i] += w; diag[j] += w; nb[i].set(j, (nb[i].get(j) || 0) + w); nb[j].set(i, (nb[j].get(i) || 0) + w); }
  const start = new Int32Array(V + 1); for (let i = 0; i < V; i++) start[i + 1] = start[i] + nb[i].size;
  const col = new Int32Array(start[V]), val = new Float64Array(start[V]); for (let i = 0, k = 0; i < V; i++) for (const e of nb[i]) { col[k] = e[0]; val[k] = e[1]; k++; }
  const pin = 0, big = 1e6; diag[pin] += big;
  const r = new Float64Array(V), p = new Float64Array(V), Ap = new Float64Array(V);
  const mul = (x, out) => { for (let i = 0; i < V; i++) { let s = diag[i] * x[i]; for (let k = start[i], e = start[i + 1]; k < e; k++) s -= val[k] * x[col[k]]; out[i] = s; } };
  const solve = (b, x) => { mul(x, Ap); let rr = 0; for (let i = 0; i < V; i++) { r[i] = b[i] - Ap[i]; p[i] = r[i]; rr += r[i] * r[i]; } const r0 = rr;
    for (let it = 0; it < 150 && rr > r0 * 1e-8 && rr > 1e-18; it++) { mul(p, Ap); let pAp = 0; for (let i = 0; i < V; i++) pAp += p[i] * Ap[i]; if (!pAp) break; const al = rr / pAp; let r1 = 0; for (let i = 0; i < V; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; r1 += r[i] * r[i]; } const be = r1 / rr; for (let i = 0; i < V; i++) p[i] = r[i] + be * p[i]; rr = r1; } };
  const X = Float64Array.from(F0, q => q[0]), Y = Float64Array.from(F0, q => q[1]), x0 = X[pin], y0 = Y[pin], bx = new Float64Array(V), by = new Float64Array(V);
  for (let round = 0; round < rounds; round++) {
    bx.fill(0); by.fill(0); bx[pin] = big * x0; by[pin] = big * y0;
    for (let k = 0; k < E; k += 3) { let c = 0, sn = 0; // the triangle's best turn, from its three edges as they lie now
      for (let e = k; e < k + 3; e++) { const ux = X[ei[e]] - X[ej[e]], uy = Y[ei[e]] - Y[ej[e]]; c += ew[e] * (ux * qx[e] + uy * qy[e]); sn += ew[e] * (uy * qx[e] - ux * qy[e]); }
      const d = Math.hypot(c, sn) || 1, co = c / d, si = sn / d;
      for (let e = k; e < k + 3; e++) { const rx = ew[e] * (co * qx[e] - si * qy[e]), ry = ew[e] * (si * qx[e] + co * qy[e]); bx[ei[e]] += rx; bx[ej[e]] -= rx; by[ei[e]] += ry; by[ej[e]] -= ry; } }
    solve(bx, X); solve(by, Y);
  }
  return Array.from({ length: V }, (_, k) => [X[k], Y[k]]);
}
const area2 = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
// P: R rows (sections) of C points each; `top`: the column that lies on the centre line (the last column of one side's sheet, the middle
// one of the forepart's)
function sheetOf(P, R, C, top, ws = 40, wf = 250, wc = 100, wo = 4) {
  const id = (r, c) => r * C + c, tris = []; for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) tris.push([id(r, c), id(r + 1, c), id(r + 1, c + 1)], [id(r, c), id(r + 1, c + 1), id(r, c + 1)]);
  // to start from: each section laid straight across a straight centre line, the sections as far apart as their tops are on the last
  let u = 0; const F0 = []; for (let r = 0; r < R; r++) { if (r) u += len(sub(P[id(r, top)], P[id(r - 1, top)])); const v = new Array(C).fill(0); for (let c = top - 1; c >= 0; c--) v[c] = v[c + 1] + len(sub(P[id(r, c)], P[id(r, c + 1)])); for (let c = top + 1; c < C; c++) v[c] = v[c - 1] - len(sub(P[id(r, c)], P[id(r, c - 1)])); for (let c = 0; c < C; c++) F0.push([u, v[c]]); }
  // the same hand as the surface's own triangles (each is laid in its own plane the same way round)
  { const t = tris[Math.floor(tris.length / 2)], e = sub(P[t[1]], P[t[0]]), f = sub(P[t[2]], P[t[0]]), nn = cross(e, f); void nn; if (area2(F0[t[0]], F0[t[1]], F0[t[2]]) < 0) for (const q of F0) q[1] = -q[1]; }
  // what is held firmest: each section (10 times the body of the sheet), the feather lines (60 times) and the centre line over the top (25 times)
  const firm = (a, b) => { const ra = Math.floor(a / C), rb = Math.floor(b / C), ca = a % C, cb = b % C; return ra === rb ? ws : ca !== cb ? wo : ca === top ? wc : ca === 0 || ca === C - 1 ? wf : wo; };
  return asRigid(P, F0, tris, firm, 24);
}
// one side of the sheet on its own, as a side piece is cut from it: turned (mirrored if it lies the other hand) and moved to lie over the
// side view as closely as it can; and how much each little triangle of it grew or shrank in the flattening
function layHalf(P, F, n, m) {
  const id = (i, j) => i * (m + 1) + j, tris = []; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
  const a3 = t => len(cross(sub(P[t[1]], P[t[0]]), sub(P[t[2]], P[t[0]]))) / 2;
  const S = P.map(p => [p[0], -p[1]]), sideA = tris.reduce((t, q) => t + area2(S[q[0]], S[q[1]], S[q[2]]), 0), flatA = tris.reduce((t, q) => t + area2(F[q[0]], F[q[1]], F[q[2]]), 0);
  if (Math.sign(sideA) !== Math.sign(flatA)) F = F.map(([u, v]) => [u, -v]);
  const cf = F.reduce((c, p) => [c[0] + p[0] / F.length, c[1] + p[1] / F.length], [0, 0]), cs = S.reduce((c, p) => [c[0] + p[0] / S.length, c[1] + p[1] / S.length], [0, 0]);
  let sc = 0, ss = 0; F.forEach((p, i) => { const a = [p[0] - cf[0], p[1] - cf[1]], b = [S[i][0] - cs[0], S[i][1] - cs[1]]; sc += a[0] * b[0] + a[1] * b[1]; ss += a[0] * b[1] - a[1] * b[0]; });
  const th = Math.atan2(ss, sc), co = Math.cos(th), si = Math.sin(th);
  F = F.map(([u, v]) => { const a = u - cf[0], b = v - cf[1]; return [r3(cs[0] + co * a - si * b), r3(cs[1] + si * a + co * b)]; });
  // (the hair-thin triangles where the sections crowd round the back of the heel and round the toe are left out: a ratio of two areas
  // that small says nothing; the body of the side, between them, is what a piece is cut from)
  let mx = 0, sq = 0, cnt = 0; for (const t of tris) { const A = a3(t), row = Math.floor(t[0] / (m + 1)); if (A < .004 || row < 4 || row >= n - 5) continue; const r = Math.abs(area2(F[t[0]], F[t[1]], F[t[2]])) / A - 1; mx = Math.max(mx, Math.abs(r)); sq += r * r; cnt++; }
  return { flat: F, stretch: { max: r3(mx), rms: r3(Math.sqrt(sq / (cnt || 1))) } };
}
// which way "under the last" lies in a flattened sheet, at each section: square to the feather line as it runs there (taken over the
// sections each side), away from the body of the sheet. The allowance below the feather line is carried that way: carried along each
// section's own line instead, the edge wandered with every section and came out 1/5 in longer than the feather line it follows
function underOf(F, R, C, c0, c1) { const out = []; for (let r = 0; r < R; r++) { const a = F[Math.max(r - 2, 0) * C + c0], b = F[Math.min(r + 2, R - 1) * C + c0], p = F[r * C + c0], q = F[r * C + c1], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let n = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d]; if ((p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] < 0) n = [-n[0], -n[1]]; out.push(n); } return out; }
// a section's outline pulled taut over its top (its convex hull), from one bottom corner to the other
function tapeOf(ring) {
  let lo = Infinity, z0 = Infinity, z1 = -Infinity; for (const p of ring) { lo = Math.min(lo, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  const pts = ring.map(p => [p[2], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), up = [[z0, lo]];
  for (const p of [...pts, [z1, lo]]) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) >= -1e-12) up.pop(); up.push(p); }
  let d = 0; for (let i = 1; i < up.length; i++) d += Math.hypot(up[i][0] - up[i - 1][0], up[i][1] - up[i - 1][1]); return d;
}
const SHOULDER = .85; // a section's side has left upright by more than about 30° where it rises less than this for each inch along it
const memo = new Map();
export function shellOf(last, { n = 44, m = 16, leg = null } = {}) {
  const base = shellBase(last, n, m), lg = (leg || [last.length * .27, last.length * .4]).map(r3), k2 = `${base.key}|${lg}`; if (LEGS.has(k2)) return LEGS.get(k2);
  // how far each section is under the leg: wholly, back to where the leg ends (`leg[0]`), easing to not at all where the instep has taken over (`leg[1]`)
  const ease = t => { const u = Math.min(Math.max(t, 0), 1); return u * u * (3 - 2 * u); }, cone = base.lateral.xs.map(x => 1 - ease((x - lg[0]) / Math.max(lg[1] - lg[0], .1)));
  const out = { ...base, base, lateral: { ...base.lateral, cone }, medial: { ...base.medial, cone } }; if (LEGS.size > 80) LEGS.clear(); LEGS.set(k2, out); return out;
}
const LEGS = new Map();
function shellBase(last, n, m) {
  const key = JSON.stringify([last.length, last.ballGirth, last.heelHeight, last.toeSpring, last.side?.length, last.side?.[5], last.side?.[60], last.bottom?.[3], last.bottom?.[30], n, m]);
  if (memo.has(key)) return memo.get(key);
  // the sections: evenly along the last, and close together at each end, where the surface turns round the back of the heel and round the
  // toe (a quarter's back edge is then the centre of the back, and a vamp's edge runs round the toe to its tip)
  const L = last.length, heel = [.005, .02, .05, .1], toe = [.1, .07, .04, .02, .005].map(d => L - d), mid = n + 1 - heel.length - toe.length;
  const xs = [...heel, ...Array.from({ length: mid }, (_, i) => .2 + (L - .4) * i / (mid - 1)), ...toe], rings = xs.map(x => ringOf(last, x, 96));
  const lo = rings.map(r => Math.min(...r.map(p => p[1]))), hi = rings.map(r => Math.max(...r.map(p => p[1]))); // each section's lowest and highest point
  // a tape over each section, from the edge of the bottom on one side over the top to the edge of the bottom on the other (the bottom's edge
  // is the insole's: the section's full width, at its lowest): what a piece cut whole has to be as wide as there, before its allowance
  const tape = xs.map(x => tapeOf(ringOf(last, x, 240)));
  // The cone of the last (its back, under the leg) is open at the top: an upper does not lie over it, it stands on up round the leg. So
  // above a section's shoulder (where its side has turned more than about 30° from upright) a height is carried straight on up the sheet,
  // not round over the top to the centre line: carried round, a 6 in collar was cut 6½ in high at the middle of the leg and 6⅛ in at the
  // back seam, so the collar bowed. How far forward the leg comes is the style's (shellOf's `leg`: a boot's leg comes further forward
  // than a low shoe's ankle); over the instep in front of it the surface under the upper is the last's own, to its centre line.
  const shoulderOf = P => xs.map((_, i) => { let j = m; while (j > 1 && (P[i * (m + 1) + j][1] - P[i * (m + 1) + j - 1][1]) / (len(sub(P[i * (m + 1) + j], P[i * (m + 1) + j - 1])) || 1) < SHOULDER) j--; return j; });
  const half = side => { const P = rings.flatMap(r => halfOf(r, side, m)), f = layHalf(P, sheetOf(P, n + 1, m + 1, m), n, m); return { side, n, m, xs, lo, shoulder: shoulderOf(P), pts: P.map(p => p.map(r3)), flat: f.flat, under: underOf(f.flat, n + 1, m + 1, 0, 1), over: underOf(f.flat, n + 1, m + 1, m, m - 1), stretch: f.stretch }; };
  const out = { key, lateral: half('lateral'), medial: half('medial'), length: L, tape, wall: hi[n] - lo[n] /* how high the last stands at the tip of the toe */ };
  if (memo.size > 40) memo.clear(); memo.set(key, out);
  return out;
}

// ---- carrying side-view points onto the shell and off it, flat ----
// a side-view point (x along, y downward) is the place on this side's surface that looks that way from the side: its section by x, its place up
// the section by height. Below the feather line (the lasting allowance, folded under) and past the ends it carries on straight.
function along(h, i, yu, clamp = false) {
  const r = alongSurface(h, i, yu, clamp), w = clamp ? 0 : h.cone?.[i] || 0; if (!w) return r;
  // in the cone, above the section's shoulder: straight on up the sheet the way the section runs at its shoulder
  const { m } = h, P = h.pts, F = h.flat, js = h.shoulder[i], a = P[i * (m + 1) + js]; if (yu <= a[1]) return r;
  const fa = F[i * (m + 1) + js], fb = F[i * (m + 1) + js - 1], d = Math.hypot(fa[0] - fb[0], fa[1] - fb[1]) || 1, k = yu - a[1], s = [fa[0] + (fa[0] - fb[0]) / d * k, fa[1] + (fa[1] - fb[1]) / d * k];
  return { f: [r.f[0] + (s[0] - r.f[0]) * w, r.f[1] + (s[1] - r.f[1]) * w], p: r.p };
}
function alongSurface(h, i, yu, clamp = false) {
  const { m } = h, P = h.pts, F = h.flat, at = j => i * (m + 1) + j;
  let j = 0; while (j < m - 1 && P[at(j + 1)][1] < yu) j++;
  const a = P[at(j)], b = P[at(j + 1)], fa = F[at(j)], fb = F[at(j + 1)];
  if (clamp) yu = Math.min(Math.max(yu, P[at(0)][1]), P[at(m)][1]);
  if (j === 0 && yu < a[1]) { const u = h.under[i], k = a[1] - yu; return { f: [fa[0] + u[0] * k, fa[1] + u[1] * k], p: [a[0], yu, a[2]] }; }
  // above the top of the section (a boot's shaft, a back tab over the collar) it carries straight on up, square to the centre line there, as far again as it is above
  if (j === m - 1 && yu > b[1]) { const u = h.over[i], k = yu - b[1]; return { f: [fb[0] + u[0] * k, fb[1] + u[1] * k], p: [b[0], yu, b[2]] }; }
  const tt = Math.min(Math.max((yu - a[1]) / ((b[1] - a[1]) || 1e-9), 0), 1);
  return { f: [fa[0] + (fb[0] - fa[0]) * tt, fa[1] + (fb[1] - fa[1]) * tt], p: [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt] };
}
function locate(h, [x, y], clamp = false) {
  const { xs, n } = h, yu = -y;
  // past either end of the last (a back tab stands a little behind the back seam) it carries on the way the sheet runs there, taken over
  // 0.3 in: the sections crowd at the ends, and carrying on from the last two of them flung the point far out
  if (x < xs[0] || x > xs[n]) { const e = x < xs[0] ? xs[0] : xs[n], a = locate(h, [e, y], clamp), b = locate(h, [e + (x < xs[0] ? .3 : -.3), y], clamp), d = Math.hypot(a.f[0] - b.f[0], a.f[1] - b.f[1]) || 1, k = Math.abs(x - e) / d; return { f: [a.f[0] + (a.f[0] - b.f[0]) * k, a.f[1] + (a.f[1] - b.f[1]) * k], p: [x, a.p[1], a.p[2]] }; }
  let i = 0; while (i < n - 1 && xs[i + 1] <= x) i++; // the sections are not evenly spaced: the one at or behind x
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  const A = along(h, i, yu, clamp), B = along(h, i + 1, yu, clamp);
  return { f: [A.f[0] + (B.f[0] - A.f[0]) * t, A.f[1] + (B.f[1] - A.f[1]) * t], p: [x, A.p[1] + (B.p[1] - A.p[1]) * t, A.p[2] + (B.p[2] - A.p[2]) * t] };
}
export const flattenPoint = (h, q) => locate(h, q).f.map(r3);
// clamp: kept on the surface (for drawing on the last), not carried past the feather line or the top
export const onSurface = (h, q, clamp = false) => locate(h, q, clamp).p;
const sideOf = pc => /-med(-|$)|inside/.test(pc.id) ? 'medial' : 'lateral';

// ---- a piece cut whole across the top of the last (a vamp, a toe cap, a toe puff, a vamp lining) ----
// Flattening one side and mirroring it over a straight line left the piece too narrow: the last's centre line does not flatten straight, and
// what lay beyond the straight line was lost twice over (up to 1/2 in a side at the toe box). A whole piece is cut from the forepart
// flattened as ONE sheet instead, the outside and the inside together across the top (from just behind where the piece begins: over the
// back of the last the upper is open, not joined across the top): it is as wide at every section as the last is round there. The sheet
// stops 0.1 in short of the tip: round the toe the edge is carried on as a round, as far forward of the toe's top as the toe is high, and
// the allowance.
const SHEETS = new WeakMap();
export function wholeOf(shell, from = 0) {
  const la = shell.lateral, me = shell.medial, { n, m, xs } = la, nc = n - 4; let i0 = 0; while (i0 < nc - 4 && xs[i0 + 1] <= from) i0++; i0 = Math.max(0, i0 - 1);
  const memo = SHEETS.get(shell.base || shell) || {}; if (memo[i0]) return memo[i0];
  const R = nc - i0 + 1, C = 2 * m + 1, id = (r, c) => r * C + c, P = [];
  for (let r = 0; r < R; r++) { const i = i0 + r; for (let c = 0; c <= m; c++) P.push(la.pts[i * (m + 1) + c]); for (let c = m + 1; c < C; c++) P.push(me.pts[i * (m + 1) + (2 * m - c)]); }
  let F = sheetOf(P, R, C, m);
  // laid with its centre line along x (from the back to the toe) and the outside at +y
  const o = F[id(0, m)], e = F[id(R - 1, m)], d = Math.hypot(e[0] - o[0], e[1] - o[1]) || 1, ux = (e[0] - o[0]) / d, uy = (e[1] - o[1]) / d;
  F = F.map(([x, y]) => [(x - o[0]) * ux + (y - o[1]) * uy, -(x - o[0]) * uy + (y - o[1]) * ux]); if (F[id(Math.floor(R / 2), 0)][1] < 0) F = F.map(([x, y]) => [x, -y]);
  // No flat sheet holds every section's length: round the toe box the flattening leaves a section up to 1/8 in a side short of the last
  // (more on a square toe). A piece cut whole is cut for the last, so its edge is carried out from the sheet's by what the section is
  // short of a tape over the last there (or in by what it is over), half each side, on top of the allowance; and the feather corner each
  // side stands a little above the bottom's edge, which the tape runs to. The correction eases to nothing over the last ½ in before the
  // round of the toe, where the edge is carried round as an arc.
  // The centre line is held firm, not exact: on a last with a high toe spring the sheet's came out 1/16 in longer than the last's own. A
  // fold is never cut longer than the centre line it lies on, so what the sheet is over is taken off before the round of the toe (`over`).
  // The last's centre line: over the tops of the sections, straight as seen from above from the sheet's first section to its last
  let centre = 0; { const T = r => la.pts[(i0 + r) * (m + 1) + m], span = (T(R - 1)[0] - T(0)[0]) || 1, dz = (T(R - 1)[2] - T(0)[2]) / span; for (let r = 1; r < R; r++) { const a = T(r - 1), b = T(r); centre += Math.hypot(b[0] - a[0], b[1] - a[1], dz * (b[0] - a[0])); } }
  const fit = { lateral: [], medial: [] };
  for (let r = 0; r < R; r++) { const i = i0 + r; let fl = 0; for (let c = 0; c < C - 1; c++) fl += Math.hypot(F[id(r, c + 1)][0] - F[id(r, c)][0], F[id(r, c + 1)][1] - F[id(r, c)][1]);
    const k = Math.min(Math.max((xs[nc] - xs[i]) / .5, 0), 1), short = (shell.tape[i] - fl) / 2;
    fit.lateral.push(k * (short - (la.pts[i * (m + 1)][1] - la.lo[i]))); fit.medial.push(k * (short - (me.pts[i * (m + 1)][1] - me.lo[i]))); }
  const out = { i0, nc, R, C, m, flat: F, xc: xs[nc], fit, over: Math.max(0, d - centre), under: { lateral: underOf(F, R, C, 0, 1), medial: underOf(F, R, C, C - 1, C - 2) } }; SHEETS.set(shell.base || shell, { ...memo, [i0]: out }); return out;
}
// a section of the sheet between two of its rows, as it lies flat: its points from the outside feather line over the top to the inside one
function sectionAt(shell, W, x) {
  const { xs } = shell.lateral, { i0, nc, C, flat } = W; let i = i0; while (i < nc - 1 && xs[i + 1] <= x) i++; const t = (x - xs[i]) / (xs[i + 1] - xs[i]), r = i - i0;
  return { i, t, pts: Array.from({ length: C }, (_, c) => { const a = flat[r * C + c], b = flat[(r + 1) * C + c]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }) };
}
// a side-view point on a whole piece → where it lies on the sheet, on the outside or the inside of the last (below the feather line it
// carries straight on; at or above the top of the section it is on the centre line)
export function developPoint(shell, W, [x, y], side = 'lateral') {
  const h = shell[side], { m } = h, yu = -y, S = sectionAt(shell, W, x), col = j => (side === 'lateral' ? j : 2 * m - j);
  const on = (k, pts) => { const P = h.pts, at = j => k * (m + 1) + j;
    if (yu <= P[at(0)][1]) { const a = pts(0), u = W.under[side][k - W.i0], d = P[at(0)][1] - yu, rise = P[at(0)][1] - h.lo[k], e = d + W.fit[side][k - W.i0] * (rise > 1e-6 ? Math.min(d / rise, 1) : 1); return [a[0] + u[0] * e, a[1] + u[1] * e]; } // (the correction comes in between the feather corner and the bottom's edge, so the edge has no step in it)
    if (yu >= P[at(m)][1]) return pts(m);
    let j = 0; while (j < m - 1 && P[at(j + 1)][1] < yu) j++; const tt = Math.min(Math.max((yu - P[at(j)][1]) / ((P[at(j + 1)][1] - P[at(j)][1]) || 1e-9), 0), 1), a = pts(j), b = pts(j + 1); return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]; };
  const r = S.i - W.i0, row = rr => j => W.flat[rr * W.C + col(j)], a = on(S.i, row(r)), b = on(S.i + 1, row(r + 1));
  return [a[0] + (b[0] - a[0]) * S.t, a[1] + (b[1] - a[1]) * S.t];
}
// the section at x as it lies on the piece: from 2 in beyond the feather line on the outside, over the top, to 2 in beyond it on the inside
function ribAt(shell, W, x) {
  const sec = sectionAt(shell, W, x), S = sec.pts, n = S.length, r = sec.i - W.i0, far = (p, side) => { const a = W.under[side][r], b = W.under[side][r + 1], u = [a[0] + (b[0] - a[0]) * sec.t, a[1] + (b[1] - a[1]) * sec.t]; return [p[0] + u[0] * 2, p[1] + u[1] * 2]; };
  return { at: S[(n - 1) / 2].map(r3), rib: [far(S[0], 'lateral'), ...S, far(S[n - 1], 'medial')].map(q => q.map(r3)) };
}
function wholePiece(pc, shell) {
  const W = wholeOf(shell, pc.from ?? Math.min(...pc.half.map(q => q[0])) - .3), xc = W.xc, L = shell.length, la = q => developPoint(shell, W, q, 'lateral'), me = q => developPoint(shell, W, q, 'medial'), R = q => q.map(r3);
  // the half on the side view, as far as where the toe's round begins, laid on the outside and on the inside of the sheet; then the round
  const H = pc.half, k = H.findIndex((q, i) => i && q[0] > xc && H[i - 1][0] <= xc), low = k > 0 ? [...H.slice(0, k), [xc, H[k - 1][1] + (H[k][1] - H[k - 1][1]) * (xc - H[k - 1][0]) / ((H[k][0] - H[k - 1][0]) || 1)]] : H.slice();
  const top = x => sectionAt(shell, W, x).pts[W.m], A = low.map(la), B = low.map(me), end = low.length - 1; A[0] = B[0] = top(low[0][0]); if (k < 0) A[end] = B[end] = top(low[end][0]); // its ends on the centre line (a height that near the flat top of a section does not say where across it)
  let sew, fold;
  if (k > 0) { // round the toe: an arc from the outside edge to the inside one, reaching forward of the toe's top by the toe's height and what the piece has under the last
    const sec = sectionAt(shell, W, xc).pts, drop = shell.lateral.pts[W.nc * (W.m + 1)][1] - shell.lateral.lo[W.nc], under = Math.hypot(A[end][0] - sec[0][0], A[end][1] - sec[0][1]) - drop;
    const c = [(A[end][0] + B[end][0]) / 2, (A[end][1] + B[end][1]) / 2], b = [A[end][0] - c[0], A[end][1] - c[1]], bl = Math.hypot(...b) || 1, f0 = [-b[1] / bl, b[0] / bl], sg = (A[0][0] - c[0]) * f0[0] + (A[0][1] - c[1]) * f0[1] > 0 ? -1 : 1, f = [f0[0] * sg, f0[1] * sg];
    const t0 = (sec[W.m][0] - c[0]) * f[0] + (sec[W.m][1] - c[1]) * f[1], toe = t0 + (L - xc) - W.over, tip = toe + shell.wall + under, round = Array.from({ length: 19 }, (_, q) => { const a = Math.PI * (q + 1) / 20; return [c[0] + b[0] * Math.cos(a) + f[0] * tip * Math.sin(a), c[1] + b[1] * Math.cos(a) + f[1] * tip * Math.sin(a)]; });
    sew = [...A, ...round, ...B.slice(1).reverse()].map(R); fold = [R(A[0]), R([c[0] + f[0] * toe, c[1] + f[1] * toe]), R([c[0] + f[0] * tip, c[1] + f[1] * tip])];
  } else { sew = [...A, ...B.slice(1, end).reverse()].map(R); fold = [R(A[0]), R(A[end])]; }
  const at = {}, lines = {}; for (const [name, q] of Object.entries(pc.at || {})) { at[name] = R(la(q)); at[name + 'M'] = R(me(q)); }
  for (const [name, pts] of Object.entries(pc.lines || {})) { lines[name] = pts.map(q => R(la(q))); lines[name + 'M'] = pts.map(q => R(me(q))); }
  const { half: _h, from: _f, ...rest } = pc;
  return { ...rest, shown: pc.shown || pc.sew, sew, grain: pc.grain.map(q => R(la(q))), notches: pc.notches.map(q => R(la(q))), flattened: 'whole', at, lines, fold, // the fold: the centre line from its back end to the top of the toe, and on to the tip of the piece
    stations: (pc.stations || []).map(x => ({ x, ...ribAt(shell, W, x) })) };
}
// ---- a piece that wraps the back of the heel, or the front of the leg, cut in one (a counter, a heel grip, a heel overlay, a front shaft) ----
// each half is flattened on its own side of the last; the inside half is then turned over and laid against the outside one along the line
// they share (pc.fold: the centre of the back, the centre front), which flattens straight (how far off straight it lies is kept, as `bow`)
function joinedPiece(pc, shell) {
  const S = pc.sew, n = S.length, [A, B] = pc.fold, dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
  const off = p => { const t = Math.min(Math.max(((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L2, 0), 1); return Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dy); }, on = S.map(p => off(p) < .004);
  let k = -1; for (let i = 0; i < n; i++) if (on[i] && !on[(i + 1) % n]) { k = i; break; } if (k < 0) return null;
  const path = [S[k]]; for (let i = (k + 1) % n, c = 0; c < n; i = (i + 1) % n, c++) { path.push(S[i]); if (on[i]) break; }
  const rest = []; for (let i = (k + 1 + path.length - 1) % n, c = 0; c < n - path.length; i = (i + 1) % n, c++) rest.push(S[i]); // what lies on the fold between its two ends
  const la = q => locate(shell.lateral, q).f, me = q => locate(shell.medial, q).f, Lp = path.map(la), Mp = path.map(me), end = Lp.length - 1;
  const frame = (o, e) => { const d = Math.hypot(e[0] - o[0], e[1] - o[1]) || 1, u = [(e[0] - o[0]) / d, (e[1] - o[1]) / d]; return { o, u, v: [-u[1], u[0]], d }; };
  // the two halves are laid together along the fold, the inside one made the outside one's length along it (they differ by a hair). A fold
  // that runs up above the last (pc.footed: the front of a leg, whose second end is its foot, on the last) is laid together at its foot and
  // not made to length: above the last the two flattened sides do not agree how long it is, and the outside's is taken
  const footEnd = pc.footed && Math.hypot(path[0][0] - B[0], path[0][1] - B[1]) > Math.hypot(path[end][0] - B[0], path[end][1] - B[1]) ? end : 0, other = end - footEnd;
  const FL = frame(Lp[footEnd], Lp[other]), FM = frame(Mp[footEnd], Mp[other]), k1 = pc.footed ? 1 : FL.d / FM.d;
  const over = q => { const a = ((q[0] - FM.o[0]) * FM.u[0] + (q[1] - FM.o[1]) * FM.u[1]) * k1, b = (q[0] - FM.o[0]) * FM.v[0] + (q[1] - FM.o[1]) * FM.v[1]; return [FL.o[0] + a * FL.u[0] - b * FL.v[0], FL.o[1] + a * FL.u[1] - b * FL.v[1]]; };
  const lineOff = (F, q) => Math.abs((q[0] - F.o[0]) * F.v[0] + (q[1] - F.o[1]) * F.v[1]), bow = Math.max(0, ...rest.map(q => Math.max(lineOff(FL, la(q)), lineOff(FM, me(q)))));
  const R = q => q.map(r3), sew = [...Lp.map(R), ...Mp.slice(1, end).reverse().map(q => R(over(q)))];
  const at = {}, lines = {}; for (const [name, q] of Object.entries(pc.at || {})) { at[name] = R(la(q)); at[name + 'M'] = R(over(me(q))); }
  for (const [name, pts] of Object.entries(pc.lines || {})) { lines[name] = pts.map(q => R(la(q))); lines[name + 'M'] = pts.map(q => R(over(me(q)))); }
  const { fold: _f, footed: _a, ...keep } = pc;
  return { ...keep, shown: pc.shown || pc.sew, sew, grain: pc.grain.map(q => R(la(q))), notches: pc.notches.map(q => R(la(q))), flattened: 'whole', at, lines, fold: [R(Lp[0]), R(Lp[end])], bow: r3(bow) };
}
// a piece cut from the flattened side of the last: its outline, grain, notches and labelled points carried over; a piece cut whole is
// developed about its fold (above)
export function flattenPiece(pc, shell) {
  if (pc.half) return wholePiece(pc, shell);
  if (pc.fold) { const j = joinedPiece(pc, shell); if (j) return j; }
  const h = shell[sideOf(pc)], fl = q => flattenPoint(h, q);
  const at = {}, lines = {}; for (const [name, q] of Object.entries(pc.at || {})) at[name] = fl(q); for (const [name, pts] of Object.entries(pc.lines || {})) lines[name] = pts.map(fl);
  const { fold: _f, ...rest } = pc;
  return { ...rest, shown: pc.shown || pc.sew, sew: pc.sew.map(fl), grain: pc.grain.map(fl), notches: pc.notches.map(fl), flattened: h.side, ...(pc.at ? { at } : {}), ...(pc.lines ? { lines } : {}) };
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
