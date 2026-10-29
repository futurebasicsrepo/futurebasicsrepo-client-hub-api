// A shoe last in 3D: a file the last maker or a scanner made (STL, OBJ or GLB), or one the 3D service (Meshy) made from the drafted last, is
// turned the way a last stands, measured the way a last maker measures, and its numbers and its shape then draft the upper (src/lab-footwear.js
// lastOf takes them as `last3d`).
//   readMesh(buffer, name)          → { pos, format }: every triangle's three corners (9 numbers a triangle), whatever the file
//   prepareLast(buffer, name, o)    → the last turned and measured: { pos (inches, x heel→toe, y up, z across), measures, units, scale, fitted }
//                                     o.units: 'auto' | 'mm' | 'cm' | 'in' | 'm';  o.fit: { length, ballGirth } scales a model with no units
//                                     (the 3D service's) to the size it was made for
//   measureLast(pos)                → the numbers: length, ball and instep girths, ball and heel widths, heel height, toe spring, back and toe
//                                     heights, volume; the side profile and the bottom outline, as lastOf wants them
//   loftLast(spec, size)            → a 3D last lofted from the drafted one (sections from its side and its bottom), to download or to show the
//                                     3D service what to make
//   renderViews(pos)                → shaded pictures of a last from the side, the other side, above and three-quarters (PNG), for the service
//   stlOf(pos)                      → a binary STL in millimetres, Z up, as CAD and the last makers' software expect
import sharp from 'sharp';
import './stl-viewer.js';
import { lastOf, cleanFootwear, cleanLast3d, sizeFromFoot, SIZE_LIMITS, TOES } from './lab-footwear.js';

const r3 = v => Math.round(v * 1000) / 1000, r8 = v => Math.round(v * 8) / 8;
export const MESH_UNITS = { mm: 1 / 25.4, cm: 1 / 2.54, in: 1, m: 1000 / 25.4 };
const FEATHER = .3; // the bottom outline is the section within this much of its lowest point (where the last's feather line runs)
const fail = msg => Object.assign(new Error(msg), { status: 422 });

// ---- reading the file ----
export function readMesh(buf, name = '') {
  if (!Buffer.isBuffer(buf) || buf.length < 40) throw fail('The file is empty or too small to be a 3D model.');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (globalThis.FBStl.isGlb(ab)) { let m; try { m = globalThis.FBStl.parseGlb(ab); } catch (e) { throw fail(e.message); } return { pos: m.positions, format: 'glb' }; }
  if (buf.length >= 84) {
    const n = buf.readUInt32LE(80);
    if (n > 0 && 84 + n * 50 === buf.length) { const pos = new Float32Array(n * 9); for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(o + k * 4); } return check({ pos, format: 'stl' }); }
  }
  const head = buf.subarray(0, 4096).toString('latin1');
  if (/^\s*solid/i.test(head) && /facet|endsolid/i.test(head + buf.subarray(-200).toString('latin1'))) {
    const v = [], re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, text = buf.toString('latin1'); let m;
    while ((m = re.exec(text))) v.push(+m[1], +m[2], +m[3]);
    if (!v.length || v.length % 9) throw fail('This STL file is broken: its triangles do not add up.');
    return check({ pos: Float32Array.from(v), format: 'stl' });
  }
  if (/\.obj$/i.test(name) || /^\s*(v|vn|vt|f|o|g|mtllib|usemtl)\s/m.test(head)) return check({ pos: readObj(buf.toString('latin1')), format: 'obj' });
  throw fail('Send the last as an STL, OBJ or GLB file.');
}
function readObj(text) {
  const V = [], T = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
    else if (line.startsWith('f ')) {
      const ids = line.trim().split(/\s+/).slice(1).map(t => { const i = parseInt(t.split('/')[0], 10); return i < 0 ? V.length + i : i - 1; });
      for (let k = 1; k + 1 < ids.length; k++) T.push(ids[0], ids[k], ids[k + 1]);
    }
  }
  if (!T.length) throw fail('This OBJ file has no faces.');
  const pos = new Float32Array(T.length * 3);
  T.forEach((i, j) => { const v = V[i]; if (!v) throw fail('This OBJ file points at corners it does not have.'); pos[j * 3] = v[0]; pos[j * 3 + 1] = v[1]; pos[j * 3 + 2] = v[2]; });
  return pos;
}
const check = m => { for (let i = 0; i < m.pos.length; i++) if (!Number.isFinite(m.pos[i])) throw fail('The file has corners that are not numbers.'); if (m.pos.length < 9 * 20) throw fail('That is too few triangles to be a last.'); return m; };

// ---- turning it the way a last stands ----
// the main axes (area-weighted, so a dense patch of the scan does not pull them), by Jacobi rotations of the 3×3 covariance
function axes(pos) {
  let A = 0; const c = [0, 0, 0];
  const n = pos.length / 9, area = new Float64Array(n), cen = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    const o = t * 9, ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2], vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2 + 1e-12; area[t] = a; A += a;
    for (let k = 0; k < 3; k++) { cen[t * 3 + k] = (pos[o + k] + pos[o + 3 + k] + pos[o + 6 + k]) / 3; c[k] += cen[t * 3 + k] * a; }
  }
  for (let k = 0; k < 3; k++) c[k] /= A;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let t = 0; t < n; t++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += area[t] * (cen[t * 3 + i] - c[i]) * (cen[t * 3 + j] - c[j]);
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(C[p][q]) < 1e-12) continue;
    const th = (C[q][q] - C[p][p]) / (2 * C[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), co = 1 / Math.sqrt(t * t + 1), si = t * co;
    for (let k = 0; k < 3; k++) { const a = C[k][p], b = C[k][q]; C[k][p] = co * a - si * b; C[k][q] = si * a + co * b; }
    for (let k = 0; k < 3; k++) { const a = C[p][k], b = C[q][k]; C[p][k] = co * a - si * b; C[q][k] = si * a + co * b; }
    for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = co * a - si * b; V[k][q] = si * a + co * b; }
  }
  const ev = [0, 1, 2].map(i => ({ val: C[i][i], vec: [V[0][i], V[1][i], V[2][i]] })).sort((a, b) => b.val - a.val);
  return { c, e: ev.map(x => x.vec) };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], neg = a => a.map(v => -v);
// → the corners in the last's own frame: x along the length (the heel's back at 0), y up (0 under the ball), z across; always a proper turn,
// never a mirror, so a left last stays a left last (measureLast says which foot it is)
export function orient(pos0, scale = 1, { heelHeight = null } = {}) {
  const { c, e } = axes(pos0), n = pos0.length / 3;
  // every way it could stand: the length either way along the main axis, either of the other two axes up, and up either way. Each is scored on
  // its true cross-sections, on what every last has (none of it upset by the lean the tall heel gives the main axis):
  //   the cone: the sections near the heel stand far taller than those near the toe
  //   the toe: across the toe it is wider than it is tall
  //   up: at the ball the section is wider near its bottom (the flat tread, the feather line) than near its top
  const tryWay = (ex, ey) => {
    const ez = cross(ex, ey), out = new Float32Array(pos0.length);
    for (let i = 0; i < n; i++) { const p = [(pos0[i * 3] - c[0]) * scale, (pos0[i * 3 + 1] - c[1]) * scale, (pos0[i * 3 + 2] - c[2]) * scale]; out[i * 3] = dot(p, ex); out[i * 3 + 1] = dot(p, ey); out[i * 3 + 2] = dot(p, ez); }
    const { x0, L } = extent(out), fs = [.12, .18, .24, .8, .85, .9, .64, .68, .72], S = sections(out, fs.map(f => x0 + f * L));
    const ext = (s, k) => { let a = Infinity, b = -Infinity; for (const p of s) { if (p[k] < a) a = p[k]; if (p[k] > b) b = p[k]; } return s.length ? b - a : 0; };
    const mean = a => a.reduce((t, v) => t + v, 0) / (a.length || 1);
    const cone = mean(S.slice(0, 3).map(s => ext(s, 0))) - mean(S.slice(3, 6).map(s => ext(s, 0)));
    const toe = mean(S.slice(3, 6).map(s => ext(s, 1) - ext(s, 0)));
    const up = mean(S.slice(6).map(s => { if (s.length < 6) return 0; let lo = Infinity, hi = -Infinity; for (const p of s) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; } const h = hi - lo, band = (a, b) => ext(s.filter(p => p[0] >= lo + a * h && p[0] <= lo + b * h), 1); return band(0, .25) - band(.75, 1); }));
    return { out, score: cone + toe + 2 * up };
  };
  let best = null;
  for (const ex of [e[0], neg(e[0])]) for (const up of [e[1], neg(e[1]), e[2], neg(e[2])]) { const w = tryWay(ex, up); if (!best || w.score > best.score) best = w; }
  const out = best.out;
  for (let pass = 0; pass < 4; pass++) { level(out); roll(out); yaw(out); }
  if (heelHeight != null && heelHeight >= 0) standOnHeel(out, heelHeight);
  return reground(out);
}
// turned about z the way a last stands on a flat with nothing under its heel spec: rocked until it rests on its ball (the forepart touches the
// floor about 68% of the length from the heel). The bottom is nearly flat round the ball, so without the heel height this is an estimate within
// a few degrees; with it (standOnHeel) the last stands exactly. Worked on the side outline of true sections, turned as a whole, so where it
// starts from does not matter; where a run of turns all rest it on the ball, the middle of the run.
const rotZ = (out, th) => { const co = Math.cos(th), si = Math.sin(th); for (let i = 0; i < out.length; i += 3) { const x = out[i], y = out[i + 1]; out[i] = co * x - si * y; out[i + 1] = si * x + co * y; } };
const lowOf = s => s.reduce((m, p) => Math.min(m, p[0]), Infinity);
const BALL_AT = .68;
export function ballOf(out) {
  const { x0, L } = extent(out), fs = Array.from({ length: 31 }, (_, k) => .55 + .3 * k / 30); let best = BALL_AT, w = -1;
  sections(out, fs.map(f => x0 + f * L)).forEach((s, k) => { if (!s.length) return; const lo = lowOf(s); let a = Infinity, b = -Infinity; for (const p of s) if (p[0] <= lo + FEATHER) { if (p[1] < a) a = p[1]; if (p[1] > b) b = p[1]; } if (b - a > w + 1e-6) { w = b - a; best = fs[k]; } });
  return { x: x0 + best * L, x0, L };
}
export function level(out) {
  for (let pass = 0; pass < 2; pass++) {
    const { x0, L } = extent(out), K = 240, xs = Array.from({ length: K }, (_, k) => x0 + L * (k + .5) / K), pts = [];
    sections(out, xs).forEach((s, k) => { if (!s.length) return; let lo = Infinity, hi = -Infinity; for (const p of s) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; } pts.push([xs[k], lo], [xs[k], hi]); });
    if (pts.length < 20) return;
    const miss = th => {
      const co = Math.cos(th), si = Math.sin(th); let a = Infinity, b = -Infinity; const R = pts.map(([x, y]) => { const u = co * x - si * y; if (u < a) a = u; if (u > b) b = u; return [u, si * x + co * y]; });
      let lo = Infinity, at = 0; for (const [u, v] of R) { const f = (u - a) / (b - a); if (f >= .35 && f <= .98 && v < lo) { lo = v; at = f; } }
      return Math.abs(at - BALL_AT);
    };
    const step = .25 * Math.PI / 180, tries = []; for (let d = -140; d <= 140; d++) tries.push([d * step, miss(d * step)]);
    const best = Math.min(...tries.map(t => t[1])), ok = new Set(tries.filter(t => t[1] <= best + .01).map(t => Math.round(t[0] / step)));
    const b0 = Math.round(tries.find(t => t[1] === best)[0] / step); let lo = b0, hi = b0; while (ok.has(lo - 1)) lo--; while (ok.has(hi + 1)) hi++;
    const th = (lo + hi) / 2 * step; if (Math.abs(th) < 1e-4) return; rotZ(out, th);
  }
}
// a known heel height (from the last maker's spec): rocked about the ball until the heel seat stands that high
function standOnHeel(out, h) {
  for (let pass = 0; pass < 8; pass++) {
    const { x: xb, x0, L } = ballOf(out), [hs, bs] = sections(out, [x0 + .1 * L, xb]); if (!hs.length || !bs.length) return;
    const now = lowOf(hs) - lowOf(bs), th = Math.atan((now - h) / (xb - x0 - .1 * L)); if (Math.abs(th) < 1e-4) return; rotZ(out, th);
  }
}
const extent = out => { let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < out.length; i += 3) { const x = out[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; } return { x0, L: x1 - x0 }; };
// turned about the length until the tread across the ball is level from side to side (the lowest point a quarter of the width in from each side)
function roll(out) {
  const { x0, L } = extent(out), slopes = [];
  for (const s of sections(out, [.62, .68, .74].map(f => x0 + f * L))) {
    if (s.length < 6) continue; let z0 = Infinity, z1 = -Infinity; for (const p of s) { if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
    const w = z1 - z0, zc = (z0 + z1) / 2; let a = [Infinity, 0], b = [Infinity, 0];
    for (const p of s) { if (p[1] < zc - .25 * w && p[0] < a[0]) a = p; if (p[1] > zc + .25 * w && p[0] < b[0]) b = p; }
    if (Number.isFinite(a[0]) && Number.isFinite(b[0]) && b[1] !== a[1]) slopes.push((b[0] - a[0]) / (b[1] - a[1]));
  }
  if (!slopes.length) return; slopes.sort((p, q) => p - q);
  const f = Math.atan(slopes[slopes.length >> 1]), co = Math.cos(f), si = Math.sin(f);
  for (let i = 0; i < out.length; i += 3) { const y = out[i + 1], z = out[i + 2]; out[i + 1] = co * y - si * z; out[i + 2] = si * y + co * z; }
}
// turned about the vertical until the middle of the heel seat and the toe's tip lie on the length (the last's own axis)
function yaw(out) {
  const { x0, L } = extent(out), [h, t] = sections(out, [x0 + .1 * L, x0 + .97 * L]); if (!h.length || !t.length) return;
  const low = Math.min(...h.map(p => p[0])), feather = h.filter(p => p[0] <= low + FEATHER), mid = s => (Math.min(...s.map(p => p[1])) + Math.max(...s.map(p => p[1]))) / 2;
  const f = Math.atan((mid(t) - mid(feather)) / (.87 * L)), co = Math.cos(f), si = Math.sin(f);
  for (let i = 0; i < out.length; i += 3) { const x = out[i], z = out[i + 2]; out[i] = si * z + co * x; out[i + 2] = co * z - si * x; }
}
// ---- measuring ----
// where the surface crosses the planes x = xs[j] (a cross-section of the last at each): → for each plane, its points as [y, z]
export function sections(pos, xs) {
  const out = xs.map(() => []), n = pos.length / 9, sorted = xs.map((x, j) => [x, j]).sort((a, b) => a[0] - b[0]), sx = sorted.map(s => s[0]);
  const lower = v => { let lo = 0, hi = sx.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sx[m] < v) lo = m + 1; else hi = m; } return lo; };
  for (let t = 0; t < n; t++) {
    const o = t * 9, a = [pos[o], pos[o + 1], pos[o + 2]], b = [pos[o + 3], pos[o + 4], pos[o + 5]], c = [pos[o + 6], pos[o + 7], pos[o + 8]];
    const lo = Math.min(a[0], b[0], c[0]), hi = Math.max(a[0], b[0], c[0]);
    for (let k = lower(lo); k < sx.length && sx[k] <= hi; k++) {
      const x = sx[k], j = sorted[k][1];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) { const dp = p[0] - x, dq = q[0] - x; if ((dp <= 0 && dq > 0) || (dp > 0 && dq <= 0)) { const s = dp / (dp - dq); out[j].push([p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s]); } }
    }
  }
  return out;
}
// a tape round a section follows its outside: the convex hull's perimeter
export function girthOf(pts) {
  if (pts.length < 3) return 0;
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const h = lo.slice(0, -1).concat(hi.slice(0, -1)); let s = 0; for (let i = 0; i < h.length; i++) { const p = h[i], q = h[(i + 1) % h.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  return s;
}
export function measureLast(pos) {
  const n = pos.length / 3; let L = 0; for (let i = 0; i < n; i++) if (pos[i * 3] > L) L = pos[i * 3];
  const N = 56, xs = Array.from({ length: N + 1 }, (_, k) => L * (.004 + .992 * k / N)), S = sections(pos, xs);
  const prof = S.map((pts, k) => {
    if (!pts.length) return null;
    let b = Infinity, t = -Infinity; for (const [y] of pts) { if (y < b) b = y; if (y > t) t = y; }
    let z0 = Infinity, z1 = -Infinity, w0 = Infinity, w1 = -Infinity; for (const [y, z] of pts) { if (z < w0) w0 = z; if (z > w1) w1 = z; if (y <= b + FEATHER) { if (z < z0) z0 = z; if (z > z1) z1 = z; } }
    return { x: xs[k], bottom: b, top: t, z0, z1, w0, w1 };
  });
  const ok = prof.filter(Boolean); if (ok.length < N * .7) throw fail('The model has holes or loose pieces: its sections do not close. Send a closed (watertight) last.');
  const at = (f, key) => { const x = L * f; let best = ok[0]; for (const p of ok) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; return best[key]; };
  const between = (a, b, fn) => ok.filter(p => p.x >= L * a && p.x <= L * b).map(fn);
  // the ball: the widest the bottom gets in the forefoot
  let ball = null; for (const p of ok) if (p.x >= L * .55 && p.x <= L * .85 && (!ball || p.z1 - p.z0 > ball.z1 - ball.z0)) ball = p;
  const ballX = ball.x, F = ballX / .72, med = a => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  const [ballS, instepS] = sections(pos, [ballX, F * .5]);
  const heelSeat = med(between(.05, .15, p => p.bottom));
  // which foot: the inside (medial) waist is cut in further from the line between the middle of the heel and the toe's tip than the outside
  const heelMid = (at(.1, 'z0') + at(.1, 'z1')) / 2, tipMid = (at(.97, 'w0') + at(.97, 'w1')) / 2, line = x => heelMid + (tipMid - heelMid) * (x - L * .1) / (L * .87);
  const w = ok.find(p => p.x >= L * .42) || ball, lowSide = line(w.x) - w.z0, highSide = w.z1 - line(w.x), medialLow = lowSide < highSide; // the medial side is the negative z one
  const zs = z => medialLow ? z : -z;
  const top = x => { let best = ok[0]; for (const p of ok) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; return best.top; };
  const pts = ok.map(p => ({ ...p, bottom: p.x < L * .1 ? heelSeat : p.bottom })); // the heel seat runs flat to the back, as on the side view
  let vol = 0; for (let t = 0; t < pos.length; t += 9) vol += (pos[t] * (pos[t + 4] * pos[t + 8] - pos[t + 5] * pos[t + 7]) - pos[t + 1] * (pos[t + 3] * pos[t + 8] - pos[t + 5] * pos[t + 6]) + pos[t + 2] * (pos[t + 3] * pos[t + 7] - pos[t + 4] * pos[t + 6])) / 6;
  const outline = [...pts.map(p => [r3(p.x), r3(zs(medialLow ? p.z0 : p.z1) - zs(line(p.x)))]), ...pts.slice().reverse().map(p => [r3(p.x), r3(zs(medialLow ? p.z1 : p.z0) - zs(line(p.x)))])];
  return {
    length: r3(L), foot: r3(F), ballFromHeel: r3(ballX), ballGirth: r3(girthOf(ballS)), instepGirth: r3(girthOf(instepS)), ballWidth: r3(ball.z1 - ball.z0), heelWidth: r3(at(F * .12 / L, 'z1') - at(F * .12 / L, 'z0')),
    heelHeight: r3(Math.max(0, heelSeat)), toeSpring: r3(Math.max(0, at(.975, 'bottom'))), backHeight: r3(top(L * .02)), toeHeight: r3(at(.9, 'top') - at(.9, 'bottom')), volume: r3(Math.abs(vol)), whichFoot: medialLow ? 'right' : 'left',
    // as the side view draws it (lastOf): x from the heel's back, y downward, the ground under the ball at 0
    bottom: [[0, r3(-pts[0].bottom)], ...pts.map(p => [r3(p.x), r3(-p.bottom)]), [r3(L), r3(-pts[pts.length - 1].bottom)]],
    top: [[0, r3(-pts[0].top)], ...pts.map(p => [r3(p.x), r3(-p.top)]), [r3(L), r3(-(pts[pts.length - 1].bottom + pts[pts.length - 1].top) / 2)]],
    outline
  };
}

// ---- the whole step: read, guess the units, turn, measure (and fit a model that has no units to its size) ----
export function guessUnits(longest) {
  if (longest >= 150 && longest <= 450) return 'mm'; if (longest >= 15 && longest <= 45) return 'cm'; if (longest >= 5.5 && longest <= 18) return 'in'; if (longest >= .15 && longest <= .45) return 'm';
  return null;
}
export function prepareLast(buf, name = '', { units = 'auto', fit = null, heelHeight = null } = {}) {
  const { pos: raw, format } = readMesh(buf, name), tris = raw.length / 9;
  if (tris > 2_000_000) throw fail('The model has more than two million triangles: decimate it to under a million first.');
  // its length in its own units, along its main axis: what says mm, cm, inches or metres
  const { c, e } = axes(raw); let a = Infinity, b = -Infinity; for (let i = 0; i < raw.length; i += 3) { const v = (raw[i] - c[0]) * e[0][0] + (raw[i + 1] - c[1]) * e[0][1] + (raw[i + 2] - c[2]) * e[0][2]; if (v < a) a = v; if (v > b) b = v; }
  const longest = b - a; let u = units && units !== 'auto' ? units : null, scale;
  if (fit?.length) { scale = fit.length / longest; u = 'fitted'; }
  else { u = u || guessUnits(longest); if (!u || !MESH_UNITS[u]) throw Object.assign(fail(`The model is ${Math.round(longest * 100) / 100} long in its own units, which is not a last in mm, cm, inches or metres. Say which units it is in.`), { code: 'units', longest }); scale = MESH_UNITS[u]; }
  const h = heelHeight == null || heelHeight === '' || !Number.isFinite(Number(heelHeight)) ? null : Math.min(Math.max(Number(heelHeight), 0), 5);
  let pos = orient(raw, scale, { heelHeight: h }), m = measureLast(pos), fitted = null;
  if (fit?.length) {
    // the service's model has the shape but no size: scaled to the size's length, then its sections scaled until the ball girth is the size's
    const k = fit.length / m.length; for (let i = 0; i < pos.length; i++) pos[i] *= k; m = measureLast(pos);
    const g = fit.ballGirth && m.ballGirth > 0 ? fit.ballGirth / m.ballGirth : 1; for (let i = 0; i < pos.length; i += 3) { pos[i + 1] *= g; pos[i + 2] *= g; }
    if (h != null) standOnHeel(pos, h);
    pos = reground(pos); m = measureLast(pos); fitted = { length: fit.length, ballGirth: fit.ballGirth || null, girthScale: r3(g) };
  }
  if (m.length < 5 || m.length > 18) throw fail(`At ${m.length} in long that is not a last. Check the units.`);
  const open = openShare(raw), warnings = [];
  if (open != null && open > .002) warnings.push(open > .05 ? 'The surface has large holes or loose pieces: the girths are taken round the outside and hold, but check the volume and send a closed (watertight) last for the factory.' : 'The surface has a few small holes, as scans often do: the measurements hold.');
  if (h == null) warnings.push('The heel height is estimated by standing the last on its ball. Give the heel height it was made for and it stands exactly.');
  return { pos, measures: { ...m, heelFrom: h == null ? 'estimated' : 'given' }, units: u, scale, fitted, format, triangles: tris, open: open == null ? null : r3(open), warnings };
}
// how open the surface is: the share of edges only one triangle uses (a closed last has none; a scan often has a few small holes, which the
// girths, taken round the outside, do not mind). Corners are welded on a fine grid first.
export function openShare(pos) {
  const n = pos.length / 9; if (n > 800000) return null;
  let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < pos.length; i++) { if (pos[i] < x0) x0 = pos[i]; if (pos[i] > x1) x1 = pos[i]; }
  const q = (x1 - x0) / 200000 || 1e-6, ids = new Map(), id = (x, y, z) => { const k = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`; let v = ids.get(k); if (v == null) { v = ids.size; ids.set(k, v); } return v; };
  const edges = new Map();
  for (let t = 0; t < n; t++) {
    const o = t * 9, v = [id(pos[o], pos[o + 1], pos[o + 2]), id(pos[o + 3], pos[o + 4], pos[o + 5]), id(pos[o + 6], pos[o + 7], pos[o + 8])];
    for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3]; if (a === b) continue; const key = a < b ? a * 4194304 + b : b * 4194304 + a; edges.set(key, (edges.get(key) || 0) + 1); }
  }
  let once = 0; for (const c of edges.values()) if (c === 1) once++;
  return edges.size ? once / edges.size : 1;
}
// the heel's back at x = 0, the ground under the ball at y = 0, z about the middle (after a turn or a scale)
function reground(out) {
  const { x0 } = extent(out), { x: xb } = ballOf(out), [s] = sections(out, [xb]), g = s.length ? lowOf(s) : 0; let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < out.length; i += 3) { const z = out[i + 2]; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  for (let i = 0; i < out.length; i += 3) { out[i] -= x0; out[i + 1] -= g; out[i + 2] -= (z0 + z1) / 2; }
  return out;
}

// ---- a last lofted from the drafted one: its side view gives the bottom and the top of each section, its bottom view the width ----
export function loftLast(spec, size = null) {
  const l = lastOf(spec, size), L = l.length, B = l.bottom, M = 36;
  const across = x => { const ys = []; for (let i = 0; i < B.length; i++) { const p = B[i], q = B[(i + 1) % B.length]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) ys.push(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])); } return ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 0]; };
  const N = 64, xs = Array.from({ length: N + 1 }, (_, k) => L * (1 - Math.cos(Math.PI * k / N)) / 2).map(x => Math.min(L - .005, Math.max(.005, x)));
  const ring = x => {
    const yb = -l.lastBottom(x), yt = -l.crest(x), [z0, z1] = across(x), zc = (z0 + z1) / 2, hw = Math.max(.05, (z1 - z0) / 2), hh = Math.max(.05, (yt - yb) / 2), yc = (yb + yt) / 2;
    return Array.from({ length: M }, (_, i) => { const a = 2 * Math.PI * i / M, c = Math.cos(a), s = Math.sin(a), p = s < 0 ? 6 : 2.2, sp = v => Math.sign(v) * Math.abs(v) ** (2 / p);
      return [x, yc + hh * sp(s), zc + hw * (s > 0 ? 1 - .2 * s : 1) * sp(c)]; });
  };
  const R = xs.map(ring), tri = [];
  const put = (a, b, c) => tri.push(...a, ...b, ...c);
  for (let k = 0; k < N; k++) for (let i = 0; i < M; i++) { const a = R[k][i], b = R[k][(i + 1) % M], c = R[k + 1][(i + 1) % M], d = R[k + 1][i]; put(a, b, c); put(a, c, d); }
  const cap = (r, x, rev) => { const cy = r.reduce((s, p) => s + p[1], 0) / M, cz = r.reduce((s, p) => s + p[2], 0) / M, o = [x, cy, cz]; for (let i = 0; i < M; i++) { const a = r[i], b = r[(i + 1) % M]; if (rev) put(o, b, a); else put(o, a, b); } };
  cap(R[0], 0, true); cap(R[N], L, false);
  const pos = Float32Array.from(tri);
  // outward: the volume comes out positive
  let vol = 0; for (let t = 0; t < pos.length; t += 9) vol += pos[t] * (pos[t + 4] * pos[t + 8] - pos[t + 5] * pos[t + 7]) - pos[t + 1] * (pos[t + 3] * pos[t + 8] - pos[t + 5] * pos[t + 6]) + pos[t + 2] * (pos[t + 3] * pos[t + 7] - pos[t + 4] * pos[t + 6]);
  if (vol < 0) for (let t = 0; t < pos.length; t += 9) for (let k = 0; k < 3; k++) { const a = pos[t + 3 + k]; pos[t + 3 + k] = pos[t + 6 + k]; pos[t + 6 + k] = a; }
  return pos;
}

// ---- files ----
// a binary STL in millimetres with Z up (x along the last, y across, z up): our frame turned a quarter about x, so nothing is mirrored
export function stlOf(pos, { name = 'Future Basics last' } = {}) {
  const n = pos.length / 9, b = Buffer.alloc(84 + n * 50); b.write(String(name).slice(0, 79), 0, 'latin1'); b.writeUInt32LE(n, 80);
  const mm = 25.4, P = i => [pos[i] * mm, -pos[i + 2] * mm, pos[i + 1] * mm];
  for (let t = 0; t < n; t++) {
    const a = P(t * 9), c1 = P(t * 9 + 3), c2 = P(t * 9 + 6), u = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]], v = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]], nn = cross(u, v), l = Math.hypot(...nn) || 1, o = 84 + t * 50;
    [nn[0] / l, nn[1] / l, nn[2] / l, ...a, ...c1, ...c2].forEach((x, k) => b.writeFloatLE(x, o + k * 4));
  }
  return b;
}

// ---- pictures of it, for the 3D service: a plain shaded last on white from four sides ----
export async function renderViews(pos, { size = 768 } = {}) {
  const turn = (yaw, pitch) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); return p => { const x = cy * p[0] + sy * p[2], z = -sy * p[0] + cy * p[2]; return [x, cp * p[1] - sp * z, sp * p[1] + cp * z]; }; };
  const views = [turn(0, 0), turn(Math.PI, 0), turn(0, Math.PI / 2), turn(-.6, .45)];
  const out = [];
  for (const view of views) {
    const n = pos.length / 3, P = new Float64Array(pos.length); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const q = view([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    const k = size * .86 / Math.max(x1 - x0, y1 - y0), ox = size / 2 - k * (x0 + x1) / 2, oy = size / 2 + k * (y0 + y1) / 2;
    const img = Buffer.alloc(size * size * 3, 255), zb = new Float64Array(size * size).fill(-Infinity), light = [-.35, .6, .72], ll = Math.hypot(...light);
    for (let t = 0; t < n / 3; t++) {
      const a = [ox + k * P[t * 9], oy - k * P[t * 9 + 1], P[t * 9 + 2]], b = [ox + k * P[t * 9 + 3], oy - k * P[t * 9 + 4], P[t * 9 + 5]], c = [ox + k * P[t * 9 + 6], oy - k * P[t * 9 + 7], P[t * 9 + 8]];
      const nn = cross([P[t * 9 + 3] - P[t * 9], P[t * 9 + 4] - P[t * 9 + 1], P[t * 9 + 5] - P[t * 9 + 2]], [P[t * 9 + 6] - P[t * 9], P[t * 9 + 7] - P[t * 9 + 1], P[t * 9 + 8] - P[t * 9 + 2]]), nl = Math.hypot(...nn) || 1;
      const shade = .38 + .62 * Math.abs(dot(nn, light)) / (nl * ll), col = [Math.round(214 * shade), Math.round(204 * shade), Math.round(186 * shade)];
      const bx0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), bx1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]))), by0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), by1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-9) continue;
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const w0 = ((b[1] - c[1]) * (x + .5 - c[0]) + (c[0] - b[0]) * (y + .5 - c[1])) / d, w1 = ((c[1] - a[1]) * (x + .5 - c[0]) + (a[0] - c[0]) * (y + .5 - c[1])) / d, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * size + x; if (z <= zb[i]) continue; zb[i] = z; img[i * 3] = col[0]; img[i * 3 + 1] = col[1]; img[i * 3 + 2] = col[2];
      }
    }
    out.push(await sharp(img, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer());
  }
  return out;
}
// the measured numbers next to what the size asks for
export function compareToDraft(m, spec, size = null) {
  const d = lastOf({ ...spec, last3d: null }, size);
  return [['length', 'Last length'], ['ballGirth', 'Ball girth'], ['instepGirth', 'Instep girth'], ['ballWidth', 'Ball width'], ['heelWidth', 'Heel width'], ['heelHeight', 'Heel height'], ['toeSpring', 'Toe spring']]
    .map(([k, label]) => ({ key: k, label, measured: m[k], drafted: d[k], diff: r3(m[k] - d[k]) }));
}
export const toeAllowance = toe => (TOES[toe] || TOES.round).allowance;
// the shoe drafted on a measured last: the last's numbers and shape go in, the size becomes the nearest one in the shoe's system (the foot is the
// last's length less the toe's allowance), and the heel height and toe spring are the last's
export function useLast(spec, m, { id = '', name = '', source = 'upload' } = {}) {
  const s = cleanFootwear(spec), footLen = m.length - toeAllowance(s.toe), [lo, hi] = SIZE_LIMITS[s.system], step = s.system === 'eu' || s.system === 'mm' ? 1 : .5;
  const size = Math.min(hi, Math.max(lo, Math.round(sizeFromFoot(s.system, footLen) / step) * step));
  const last3d = cleanLast3d({ ...m, id, name, source, footLen });
  if (!last3d) throw fail('The measured last is missing numbers the pattern needs. Measure it again.');
  return cleanFootwear({ ...s, last3d, size, heel: Math.min(4, Math.round(m.heelHeight * 8) / 8), spring: Math.min(1.5, Math.round(m.toeSpring * 8) / 8) });
}
export { r8 };
