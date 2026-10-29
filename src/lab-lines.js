// Lines by hand and lines by the model, worked either way (shared by the Pattern page, the flats page and the service; no DOM, no Node).
// A hand-drawn line can be reshaped (bent where it is dragged, the rest following softly, as a pencil line is pushed), smoothed, given
// points or have them taken away, made a seam, or made one of the model's own lines (the vamp line, the collar…), which then moves the model.
// A model line can be dragged by its handle (the shoe is drafted again from where it is left), or traced into a hand line to rework freely.
//   bend(pts, i, to, reach)      → the line with point i moved to `to`; the points within `reach` (inches along the line) follow, less further off
//   smooth(pts, passes)          → the line evened out, its ends kept (a point's pressure is kept with it)
//   nearest(pts, p)              → { i, d }: the point of the line nearest p, and how far
//   insertAt(pts, p, closed)     → the line with a point put on the segment nearest p; { pts, i }
//   removeAt(pts, i, min)        → the line without point i (never fewer than min points)
//   handlesOf(pts, tol)          → the indices of the points that shape the line (its ends and its turns)
//   modelLines(pat)              → the model's lines on a shoe's side (pat.marks.lines) or a plush's height, each with a handle
//   moveLine(line, d)            → the spec change that moves a model line by d inches across itself (a partial spec)
//   fitLine(line, pts)           → the spec change that puts a model line where a hand-drawn line is
const r3 = v => Math.round(v * 1000) / 1000;
const seg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return { t, d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }; };

export function bend(pts, i, to, reach = .6) {
  if (!Array.isArray(pts) || !pts[i]) return pts;
  const dx = to[0] - pts[i][0], dy = to[1] - pts[i][1], along = [0];
  for (let k = 1; k < pts.length; k++) along.push(along[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  // a smooth bump: the dragged point moves the whole way, a point `reach` along the line not at all
  return pts.map((p, k) => { const u = reach > 0 ? Math.abs(along[k] - along[i]) / reach : (k === i ? 0 : 1), w = u >= 1 ? 0 : (1 - u * u) ** 2; return w ? [r3(p[0] + dx * w), r3(p[1] + dy * w), ...p.slice(2)] : p; });
}
export function smooth(pts, passes = 2) {
  let a = pts;
  for (let n = 0; n < passes; n++) a = a.map((p, k) => k === 0 || k === a.length - 1 ? p : [r3((a[k - 1][0] + 2 * p[0] + a[k + 1][0]) / 4), r3((a[k - 1][1] + 2 * p[1] + a[k + 1][1]) / 4), ...p.slice(2)]);
  return a;
}
export function nearest(pts, p) {
  let i = -1, d = Infinity;
  (pts || []).forEach((q, k) => { const e = Math.hypot(q[0] - p[0], q[1] - p[1]); if (e < d) { d = e; i = k; } });
  return { i, d };
}
export function insertAt(pts, p, closed = false) {
  const m = closed ? pts.length : pts.length - 1; let best = { k: -1, d: Infinity, t: 0 };
  for (let k = 0; k < m; k++) { const s = seg(p, pts[k], pts[(k + 1) % pts.length]); if (s.d < best.d) best = { k, d: s.d, t: s.t }; }
  if (best.k < 0) return { pts, i: -1 };
  const a = pts[best.k], b = pts[(best.k + 1) % pts.length], q = [r3(a[0] + (b[0] - a[0]) * best.t), r3(a[1] + (b[1] - a[1]) * best.t), ...a.slice(2)];
  return { pts: [...pts.slice(0, best.k + 1), q, ...pts.slice(best.k + 1)], i: best.k + 1 };
}
export const removeAt = (pts, i, min = 2) => pts.length > min && i >= 0 && i < pts.length ? pts.filter((_, k) => k !== i) : pts;
export function handlesOf(pts, tol = .05) {
  if (!pts || pts.length < 3) return (pts || []).map((_, k) => k);
  const keep = new Set([0, pts.length - 1]);
  const dp = (a, b) => { let dm = 0, at = -1; for (let k = a + 1; k < b; k++) { const d = seg(pts[k], pts[a], pts[b]).d; if (d > dm) { dm = d; at = k; } } if (dm > tol) { keep.add(at); dp(a, at); dp(at, b); } };
  dp(0, pts.length - 1);
  return [...keep].sort((a, b) => a - b);
}
const centre = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// the model's lines: a shoe draws them on its side (src/lab-footwear.js keeps them in pat.marks.lines, in the side view's inches), a plush has
// its height. Each line moves across itself (a vamp line along the shoe, a collar up and down): `axis`, and `per` turns inches into its setting.
export function modelLines(pat) {
  if (pat?.kind === 'footwear') return (pat.marks?.lines || []).filter(l => l.pts?.length >= 2).map(l => ({ ...l, handle: l.handle || l.pts[Math.floor(l.pts.length / 2)] }));
  if (pat?.kind === 'plush' && pat.spec?.height) return [{ key: 'height', label: 'Height', param: 'height', value: pat.spec.height, per: -1, min: 4, max: 48, step: .5, axis: 'y', view: 'front' }];
  return [];
}
const clampTo = (l, v) => { const s = l.step || .0625; return Math.min(l.max, Math.max(l.min, Math.round(v / s) * s)); };
export const moveLine = (l, d) => ({ [l.param]: clampTo(l, l.value + d * l.per) });
export function fitLine(l, pts) {
  if (!l?.pts || !pts?.length) return {};
  // the hand line's middle against the model line's, across the line; a collar is read at the back of the shoe, where it is measured
  const a = l.key === 'collar' ? pts.reduce((m, p) => p[0] < m[0] ? p : m, pts[0]) : centre(pts), b = l.key === 'collar' ? l.pts[0] : centre(l.pts);
  return moveLine(l, l.axis === 'x' ? a[0] - b[0] : a[1] - b[1]);
}
