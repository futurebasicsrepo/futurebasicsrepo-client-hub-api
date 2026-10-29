// Hand sketching on a shoe's views (shared by the Pattern page and the service; no DOM, no Node). A designer draws freely, with a Pencil or a
// mouse, on any view: the outside, the inside, the top, the bottom, or on the last in 3D. The strokes are kept with the shoe (spec.sketches)
// as they were drawn, and are drawn into the tech flats and their SVG. A stroke on a side is kept on the side view's own inches (x from the
// heel's back, y downward), the coordinates the last's surface is mapped from, so a stroke drawn on the last shows on the flat side view and
// one drawn on the side view shows on the last. Any stroke on a side can be made a seam, which cuts the pieces it crosses.
//   cleanSketches(list)           → the strokes, bounded (what a page or a picture sends is never trusted)
//   strokesSvg(strokes, tf)       → the strokes as SVG, each point through tf (the view's own drawing of its coordinates)
//   hitStroke(strokes, pt, tol)   → the index of the stroke passing within tol of pt, the last drawn first (-1 when none)
//   simplify(pts, tol)            → a stroke thinned to the points that shape it (Douglas–Peucker), for a seam
export const SKETCH_VIEWS = ['lateral', 'medial', 'top', 'bottom'];
export const INKS = { graphite: '#3a3a3c', red: '#c2410c', blue: '#2a6df4', green: '#17603a', white: '#ffffff' };
export const SKETCH_LIMITS = { strokes: 300, points: 1500, total: 30000 };
const r3 = v => Math.round(v * 1000) / 1000, HEX = /^#[0-9a-f]{6}$/i;

export function cleanSketches(list) {
  if (!Array.isArray(list)) return [];
  const out = []; let total = 0;
  for (const s of list.slice(0, SKETCH_LIMITS.strokes)) {
    if (!s || typeof s !== 'object' || !SKETCH_VIEWS.includes(s.on) || !Array.isArray(s.pts)) continue;
    const pts = s.pts.slice(0, SKETCH_LIMITS.points).filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])) && Math.abs(p[0]) < 40 && Math.abs(p[1]) < 40)
      .map(p => [r3(Number(p[0])), r3(Number(p[1])), Math.round(Math.min(1, Math.max(.1, Number.isFinite(Number(p[2])) ? Number(p[2]) : 1)) * 100) / 100]);
    if (!pts.length || total + pts.length > SKETCH_LIMITS.total) continue;
    total += pts.length;
    const size = Number(s.size);
    out.push({ id: /^k[a-z0-9]{1,14}$/.test(String(s.id || '')) ? String(s.id) : `k${out.length + 1}`, on: s.on, pts, c: HEX.test(String(s.c || '')) ? String(s.c).toLowerCase() : INKS.graphite, size: Number.isFinite(size) ? r3(Math.min(.3, Math.max(.005, size))) : .03 });
  }
  return out;
}
// a stroke drawn as it was made: each step as wide as the pen pressed there, with round ends, so it reads as a pencil line
export function strokesSvg(strokes, tf = p => p) {
  let svg = '';
  for (const s of strokes || []) {
    const pts = s.pts.map(p => [...tf([p[0], p[1]]), p[2]]);
    if (pts.length === 1) { svg += `<circle cx="${r3(pts[0][0])}" cy="${r3(pts[0][1])}" r="${r3(s.size * pts[0][2] / 2)}" fill="${s.c}"/>`; continue; }
    // steps of about the same pressure go in one path, so a stroke is a few paths, not one per point
    let d = '', w = null;
    const flush = () => { if (d) svg += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${r3(s.size * w)}" stroke-linecap="round" stroke-linejoin="round"/>`; d = ''; };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], wi = Math.round((a[2] + b[2]) * 5) / 10;
      if (wi !== w) { flush(); w = wi; d = `M${r3(a[0])} ${r3(a[1])}`; }
      d += ` L${r3(b[0])} ${r3(b[1])}`;
    }
    flush();
  }
  return svg;
}
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
export function hitStroke(strokes, pt, tol = .12) {
  for (let k = strokes.length - 1; k >= 0; k--) { const s = strokes[k].pts, t = tol + strokes[k].size / 2; if (s.length === 1 ? Math.hypot(pt[0] - s[0][0], pt[1] - s[0][1]) <= t : s.some((p, i) => i > 0 && segDist(pt, s[i - 1], p) <= t)) return k; }
  return -1;
}
export function simplify(pts, tol = .04) {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
  let dmax = 0, at = 0; for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; at = i; } }
  if (dmax <= tol) return [[pts[0][0], pts[0][1]], [pts[pts.length - 1][0], pts[pts.length - 1][1]]];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}
