// A shoe's tech flats from its pattern (shared by the Pattern page and the service; no DOM, no Node): the outside (lateral) and the inside
// (medial) from the side, from above, and the sole from below, in inches.
//   footwearViews(pat, {colours})  → { lateral, medial, top, bottom }: each { svg (markup in its own inches, toe right; the medial one toe left),
//                                    box {x0, y0, x1, y1}, name }
//   flatsSheet(pat, {title})       → the four views on one sheet with the shoe's details (an SVG document, 1:1 in inches)
// The side views are the pattern's pieces as they show on the shoe, drawn round the last's heel curve and toe (the side view the pattern is
// drafted on is square at both ends), on the sole unit as it is moulded (flared at the heel, bevelled, rocked at the toe, with its outsole), with
// the overlays' stitching, the eyelets and the laces. The top view carries the same pieces up onto the last's surface (src/lab-last-shell.js)
// and looks down on them; the bottom view is the outsole.
import { shellOf, onSurface } from './lab-last-shell.js';
import { boundsOf } from './lab-pattern.js';
import { strokesSvg } from './lab-sketch.js';
import { lookDefs } from './lab-looks.js';

const r3 = v => Math.round(v * 1000) / 1000, P = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L') + ' Z', L_ = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L');
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INSIDE = /lining|foam|counter|puff|insole|sockliner/;
// corners cut: a smooth outline from a polygon (twice round, a quarter in from each end of each edge)
const chaikin = (pts, n = 2, closed = true) => { let a = pts; for (let k = 0; k < n; k++) { const out = closed ? [] : [a[0]]; const m = closed ? a.length : a.length - 1; for (let i = 0; i < m; i++) { const p = a[i], q = a[(i + 1) % a.length]; out.push([p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25], [p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75]); } if (!closed) out.push(a[a.length - 1]); a = out; } return a; };
// points every `step` inches along each edge, so a bent outline bends smoothly
const dense = (pts, step = .2, closed = true) => { const out = [], m = closed ? pts.length : pts.length - 1; for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let t = 0; t < k; t++) out.push([a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k]); } if (!closed) out.push(pts[pts.length - 1]); return out; };
// a running average round a closed outline (k either side): steadies an outline carried onto the last where the top is flat
const steady = (pts, k = 3) => pts.map((_, i) => { let x = 0, y = 0; for (let d = -k; d <= k; d++) { const q = pts[(i + d + pts.length) % pts.length]; x += q[0]; y += q[1]; } return [x / (2 * k + 1), y / (2 * k + 1)]; });
const signedArea = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// an outline moved inward by d (for the stitching inside an overlay's edge)
function inset(pts, d) {
  const n = pts.length, sg = signedArea(pts) > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) { const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const nx = (-e1[1] / l1 - e2[1] / l2) * sg, ny = (e1[0] / l1 + e2[0] / l2) * sg, nl = Math.hypot(nx, ny) || 1; out.push([b[0] + nx / nl * d, b[1] + ny / nl * d]); }
  return out;
}
const COLOURS = { mesh: '#f4f4f2', leather: '#f1eee8', synthetic: '#f0efeb', canvas: '#ece8de', suede: '#cdbba3', nubuck: '#d6c6ad' };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
function palette(pat, given = {}) {
  const c = { ...(pat.spec.colours || {}), ...given }, upper = c.upper || COLOURS[pat.spec.upper] || '#f1f0ec';
  return { upper, overlay: c.overlay || shade(upper, .9), sole: c.sole || '#f3f0e8', outsole: c.outsole || shade(c.sole || '#f3f0e8', .78), lining: c.lining || shade(upper, .94), lace: c.lace || c.upper || upper, line: '#2b2a28', stitch: '#5d5a55' };
}

// ---- the side: the last's heel curve and toe drawn in (the pattern's side view is square at both ends) ----
// near the heel each height is moved in by how far the heel curve is from the back there: the seat rounded under, the heel point the
// furthest back about an inch up, the back leaning forward to the top
function warpOf(last) {
  const h = last.heelHeight, db = up => { const u = Math.max(0, up - h); return u < .9 ? .3 * (1 - u / .9) ** 2 : .26 * Math.min(1, (u - .9) / 2.6) ** 1.4; };
  return ([x, y]) => { const up = -y, wb = Math.max(0, 1 - x / 2.2) ** 2; return [x + wb * db(up), y]; };
}
// the side view's own inches from a point of the drawn side (the warp undone: it only moves points along x, by an amount that varies slowly)
export function unwarpOf(last) { const W = warpOf(last); return ([x, y]) => { let u = x; for (let k = 0; k < 4; k++) u -= W([u, y])[0] - x; return [u, y]; }; }
export { warpOf };
const cubicPts = (a, b, c, d, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [0, 1].map(k => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]); });
// the toe's nose: the top of the toe box rolling over to the tip (about two fifths up the toe) and back under to the sole; the upper is
// clipped to it, so every piece that reaches the toe ends on the same round
function noseOf(last) {
  const L = last.length, b = last.lastBottom(L), c = last.crest(L), x0 = L - 1.1, p0 = [x0, last.crest(x0)], slope = (last.crest(x0 + .1) - last.crest(x0 - .1)) / .2;
  const tip = [L - .02, b + (c - b) * .42], q = [L - .5, last.lastBottom(L - .5)];
  const top = cubicPts(p0, [x0 + .55, p0[1] + slope * .55], [tip[0], tip[1] - (tip[1] - p0[1]) * .75], tip), under = cubicPts(tip, [tip[0], tip[1] + (q[1] - tip[1]) * .6], [q[0] + .25, q[1]], q, 8).slice(1);
  return { edge: [...top, ...under], clip: [[-20, -40], [x0, -40], ...top, ...under, [q[0], 20], [-20, 20]] };
}
let SEQ = 0;
// the sole unit from the side: its top under the last, flared out past the heel; the ground under the tread, bevelled up at the heel and rocked
// up at the toe with the spring; the outsole a band along the bottom
function soleSide(pat, W) {
  const l = pat.last, L = l.length, g = pat.ground || .3, ball = l.ballFromHeel, xs = Array.from({ length: 41 }, (_, i) => L * i / 40);
  // a stitched sole is a thin sole following the last up through the waist, on a stacked heel with its breast square under the heel's front;
  // a cupsole or a midsole is one moulded unit, bevelled at the heel
  const stitched = pat.sole?.type === 'stitched', breast = l.F * .27, t = Math.max(.22, Math.min(.4, g));
  const top = xs.map(x => W([x, l.lastBottom(x) + .02])), bottomAt = x => stitched ? (x > ball ? g + l.lastBottom(x) - l.lastBottom(ball) : x > breast ? Math.min(g, l.lastBottom(x) + t) : g)
    : g + (x > ball ? l.lastBottom(x) - l.lastBottom(ball) : 0) - (x < 1.4 ? .3 * (1 - x / 1.4) ** 2 : 0);
  const bx = stitched ? [...xs, breast - .001, breast + .001].sort((p, q) => p - q) : xs, bot = bx.slice().reverse().map(x => [x, bottomAt(x)]), toe = top[top.length - 1], toeB = bot[0], heelT = top[0], heelB = bot[bot.length - 1];
  const nose = [[toe[0] + .12, (toe[1] * 2 + toeB[1]) / 3], [toeB[0] + .05, (toe[1] + toeB[1] * 2) / 3]], tail = [[heelB[0] - .14, (heelB[1] * 2 + heelT[1]) / 3], [heelT[0] - .2, (heelB[1] + heelT[1] * 2) / 3]];
  const outline = chaikin([...top, ...nose, ...bot, ...tail], stitched ? 1 : 3);
  const band = chaikin([...bot.map(([x, y]) => [x, y - .14]).reverse(), ...bot], 1).filter(p => p[0] > -.05 && p[0] < L + .02);
  // a stitched sole's welt: a strip standing out round the forepart from the heel's breast to the toe, stitched through to the sole
  let welt = null, weltStitch = null;
  if (stitched) { const wx = Array.from({ length: 31 }, (_, i) => breast - .2 + (L + .06 - breast + .2) * i / 30), up = wx.map(x => W([Math.min(x, L), l.lastBottom(Math.min(x, L)) - .05])), dn = wx.map(x => W([Math.min(x, L), l.lastBottom(Math.min(x, L)) + .1])); welt = [...up, ...dn.reverse()]; weltStitch = wx.slice(1, -1).map(x => W([Math.min(x, L - .05), l.lastBottom(Math.min(x, L - .05)) + .025])); }
  return { outline, outsole: band, welt, weltStitch };
}
// the part a piece is cut in (src/lab-materials-goods.js PARTS): its material's surface goes over its colour
const partOf = q => q.fabric === 'overlay' || /eyestay|toe-cap|heel-overlay|mudguard|back-tab/.test(q.id) ? 'overlay' : 'upper';
const surface = (C, q, d) => { const t = C.tex?.[partOf(q)]; return t ? `<path d="${d}" fill="url(#lk-${t}-${C.uid})" stroke="none" pointer-events="none"/>` : ''; };
const visibleOn = (q, side) => q.place.view === 'front' && q.shown && !q.component && !INSIDE.test(q.id) && (side === 'medial' ? !/-lat(-|$)/.test(q.id) && !(q.seamSide === 'lateral') : !/-med(-|$)/.test(q.id) && !(q.seamSide === 'medial'));
function sideView(pat, side, C) {
  const l = pat.last, W = warpOf(l), fill = q => q.fabric === 'overlay' ? C.overlay : q.fabric === 'lining' ? C.lining : C.upper;
  const pieces = pat.pieces.filter(q => visibleOn(q, side)).sort((a, b) => (a.place.z || 0) - (b.place.z || 0));
  const nose = noseOf(l), id = `fbn${++SEQ}`;
  let svg = `<clipPath id="${id}"><path d="${P(nose.clip)}"/></clipPath><g clip-path="url(#${id})">`;
  for (const q of pieces) {
    const pts = chaikin(steady(dense(q.shown, .12).map(W), 1), 2), over = q.fabric === 'overlay' || /eyestay|toe-cap|heel-overlay|mudguard|back-tab/.test(q.id);
    svg += `<path data-pid="${esc(q.id)}" class="pc" d="${P(pts)}" fill="${fill(q)}" stroke="${C.line}" stroke-width=".028" stroke-linejoin="round"/>` + surface(C, q, P(pts));
    if (over || q.id === 'vamp') svg += `<path d="${P(inset(pts, .075))}" fill="none" stroke="${C.stitch}" stroke-width=".014" stroke-dasharray=".07 .05"/>`;
    if (q.id === 'tongue') svg += `<path d="${L_(chaikin(dense(q.shown.slice(0, Math.ceil(q.shown.length / 2)), .2).map(W), 1, false))}" fill="none" stroke="${C.stitch}" stroke-width=".012" stroke-dasharray=".05 .05" opacity=".6"/>`;
  }
  svg += `</g><path d="${L_(chaikin(nose.edge, 1, false))}" fill="none" stroke="${C.line}" stroke-width=".028" stroke-linecap="round"/>`;
  const eye = (pat.marks?.eyelets || []).map(W);
  svg += eye.map(([x, y]) => `<circle cx="${r3(x)}" cy="${r3(y)}" r=".085" fill="#fff" stroke="${C.line}" stroke-width=".022"/>`).join('');
  // the laces: from each eyelet over the middle of the opening (on the far side of the tongue) towards the next; the bow at the top
  const mid = (pat.marks?.lace || []).map(W), lace = (a, c, b) => `<path d="M${r3(a[0])} ${r3(a[1])} Q${r3(c[0])} ${r3(c[1])} ${r3(b[0])} ${r3(b[1])}" fill="none" stroke="${shade(C.lace, .78)}" stroke-width=".11" stroke-linecap="round"/><path d="M${r3(a[0])} ${r3(a[1])} Q${r3(c[0])} ${r3(c[1])} ${r3(b[0])} ${r3(b[1])}" fill="none" stroke="${C.lace}" stroke-width=".07" stroke-linecap="round"/>`;
  for (let i = 0; i < eye.length - 1 && mid.length === eye.length; i++) { const a = eye[i], m = [(mid[i][0] + mid[i + 1][0]) / 2, (mid[i][1] + mid[i + 1][1]) / 2]; svg += lace(a, [(a[0] + m[0]) / 2 - .05, (a[1] + m[1]) / 2 - .08], m); }
  if (eye.length && mid.length) { const a = eye[0], m = mid[0]; svg += lace(a, [a[0] - .3, a[1] - .2], [m[0] - .35, m[1] + .1]) + lace([m[0] - .35, m[1] + .1], [m[0] - .9, m[1] + .3], [m[0] - .55, m[1] + 1.1]) + lace([m[0] - .35, m[1] + .1], [m[0] - .5, m[1] + .5], [m[0] - .2, m[1] + 1.25]); }
  const so = soleSide(pat, W);
  svg += `<path d="${P(so.outline)}" fill="${C.sole}" stroke="${C.line}" stroke-width=".03" stroke-linejoin="round"/>`;
  svg += `<path d="${P(so.outsole)}" fill="${C.outsole}" stroke="${C.line}" stroke-width=".02"/>`;
  if (so.welt) svg += `<path d="${P(so.welt)}" fill="${shade(C.sole, .93)}" stroke="${C.line}" stroke-width=".022"/><path d="${L_(so.weltStitch)}" fill="none" stroke="${C.stitch}" stroke-width=".016" stroke-dasharray=".06 .045"/>`;
  // drawn by hand on this side (or on the last on this side), over the shoe
  svg += strokesSvg((pat.spec?.sketches || []).filter(k => k.on === side), W);
  const pts = [...pieces.flatMap(q => q.shown.map(W)), ...so.outline], b = boundsOf(pts);
  const g = side === 'medial' ? `<g transform="translate(${r3(b.x0 + b.x1)} 0) scale(-1 1)">${svg}</g>` : svg;
  return { svg: g, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, name: side === 'medial' ? 'Medial (inside)' : 'Lateral (outside)' };
}

// ---- from above (toe right, the outside at the bottom) ----
// the shoe's outline from above is the foot's, not the last's bottom: a near-straight inside (medial) edge, the outside curving out to the
// little toe, widest across the ball, a narrow round heel; the upper stands out over the waist, so it does not pinch in there as a sole does
const spline = (P, k = 8) => { const out = [], n = P.length; for (let i = 0; i < n; i++) { const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]; for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(d => .5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3))); } } return out; };
// where a vertical line at x crosses an outline: [least, most]
const across = (pts, x) => { const ys = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) ys.push(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])); } return ys.length ? [Math.min(...ys), Math.max(...ys)] : null; };
function planOf(pat) {
  const l = pat.last, L = l.length, W = l.ballWidth * 1.1, tf = { round: 1, almond: .84, square: 1.18, pointed: .68 }[pat.spec.toe] || 1;
  const med = [[.012, -.13], [.05, -.23], [.12, -.285], [.25, -.315], [.42, -.34], [.58, -.42], [.71, -.48], [.83, -.46], [.92, -.37 * tf], [.975, -.22 * tf], [1, -.05]];
  const lat = [[.995, .05 * tf], [.97, .17 * tf], [.91, .3 * Math.min(1, tf * 1.05)], [.81, .43], [.67, .5], [.56, .48], [.42, .41], [.27, .355], [.12, .31], [.055, .25], [.015, .15]];
  const outline = spline([[0, 0], ...med, ...lat].map(([x, z]) => [x * L, z * W]), 8);
  // each side's distance out from the centre line, every tenth of an inch
  const xs = Array.from({ length: 121 }, (_, i) => L * i / 120), tab = xs.map(x => across(outline, Math.min(Math.max(x, .01), L - .01)) || [0, 0]);
  const edge = (side, x) => { const t = Math.min(Math.max(x / L, 0), 1) * 120, i = Math.min(119, Math.floor(t)), f = t - i, k = side === 'medial' ? 0 : 1; return tab[i][k] * (1 - f) + tab[i + 1][k] * f; };
  // a point of the side view (x along, y down the side) carried onto the top: how far up the side it is (0 at the bottom, 1 on the crest)
  // sets how far in from the edge it shows, on a section that is upright at the sides and rounds over the top
  const proj = (side, [x, y]) => { const xc = Math.min(Math.max(x, 0), L), b = l.lastBottom(xc), c = l.crest(xc), h = Math.min(1, Math.max(0, (b - y) / ((b - c) || 1))); return [x, edge(side, x) * (1 - h ** 2.6) ** .42]; };
  return { outline, edge, proj, L };
}
// the laced opening from above: half the gap between the eyestays (wider at the top of the lacing), and the eyestay's width
const gapAt = (m, x) => .3 + .14 * Math.min(1, Math.max(0, (m.vamp - x) / Math.max(.5, m.vamp - m.throat)));
function topView(pat, C) {
  const l = pat.last, L = l.length, pl = planOf(pat), m = pat.marks || {}, type = pat.sole?.type, id = `fbt${++SEQ}`, line = w => `stroke="${C.line}" stroke-width="${w}" stroke-linejoin="round"`;
  const sole = inset(pl.outline, type === 'stitched' ? -.14 : type === 'midsole' ? -.26 : -.17);
  let svg = `<clipPath id="${id}"><path d="${P(pl.outline)}"/></clipPath><path d="${P(sole)}" fill="${C.sole}" ${line('.03')}/><path d="${P(pl.outline)}" fill="${C.upper}" ${line('.03')}/>${C.tex?.upper ? `<path d="${P(pl.outline)}" fill="url(#lk-${C.tex.upper}-${C.uid})"/>` : ''}`;
  // the pieces, each on its side; one cut whole (the vamp, the toe cap) on both, meeting along the top centre, where no line is drawn
  const pieces = pat.pieces.filter(q => q.place.view === 'front' && q.shown && !q.component && !INSIDE.test(q.id) && !['back-tab', 'tongue', 'eyestay'].includes(q.id)).sort((a, b) => (a.place.z || 0) - (b.place.z || 0));
  svg += `<g clip-path="url(#${id})">`;
  for (const q of pieces) {
    const sides = /-med(-|$)/.test(q.id) || q.seamSide === 'medial' ? ['medial'] : /-lat(-|$)/.test(q.id) || q.seamSide === 'lateral' ? ['lateral'] : ['lateral', 'medial'], over = q.fabric === 'overlay' || /toe-cap|heel-overlay|mudguard/.test(q.id);
    for (const sd of sides) {
      const pts = chaikin(dense(q.shown, .1).map(p => { const r = pl.proj(sd, p); return sides.length === 2 && p[1] <= l.crest(Math.min(Math.max(p[0], 0), L)) + .06 ? [r[0], 0] : r; }), 2); // a whole piece's top edge is on the centre line
      svg += `<path d="${P(pts)}" fill="${q.fabric === 'overlay' ? C.overlay : C.upper}" stroke="none"/>` + surface(C, q, P(pts));
      let d = ''; pts.forEach((p, i) => { const j = (i + 1) % pts.length; if (sides.length === 2 && (Math.abs(p[1]) < .32 || Math.abs(pts[j][1]) < .32 || p[0] > pl.L - .75)) return; d += `M${r3(p[0])} ${r3(p[1])} L${r3(pts[j][0])} ${r3(pts[j][1])} `; });
      svg += `<path d="${d}" fill="none" stroke="${C.line}" stroke-width=".026" stroke-linecap="round"/>`;
      if (over) { let st = ''; const ins = inset(pts, .07); ins.forEach((p, i) => { const j = (i + 1) % ins.length; if (Math.abs(p[1]) < .3 || Math.abs(ins[j][1]) < .3) return; st += `M${r3(p[0])} ${r3(p[1])} L${r3(ins[j][0])} ${r3(ins[j][1])} `; }); svg += `<path d="${st}" fill="none" stroke="${C.stitch}" stroke-width=".013" stroke-dasharray=".07 .05"/>`; }
    }
  }
  svg += '</g>';
  // the foot opening: the collar from the back seam round both sides, padded; inside it the lining wall and the sockliner
  const collar = m.collar || [];
  let open = null;
  if (m.shaft) { const a = (m.leg + .1) / 2, cx = a - .08, b = Math.min(1.3, Math.abs(pl.edge('medial', cx)) * .82); open = Array.from({ length: 48 }, (_, i) => { const t = i / 48 * 2 * Math.PI, c = Math.cos(t), s2 = Math.sin(t); return [cx + a * Math.sign(c) * Math.abs(c) ** .8, b * Math.sign(s2) * Math.abs(s2) ** .85]; }); }
  else if (collar.length) open = chaikin([...collar.map(p => pl.proj('lateral', p)), ...collar.slice().reverse().map(p => pl.proj('medial', p))], 2);
  if (open) {
    const rim = inset(open, -.13), wall = shade(C.lining, .8), bed = chaikin(inset(pl.outline, .3), 1), oid = `${id}o`;
    svg += `<path d="${P(rim)}" fill="${shade(C.upper, .97)}" ${line('.028')}/><path d="${P(open)}" fill="${wall}" ${line('.026')}/>`;
    svg += `<clipPath id="${oid}"><path d="${P(inset(open, m.shaft ? .28 : .12))}"/></clipPath><path d="${P(bed)}" clip-path="url(#${oid})" fill="${shade(C.lining, 1.03)}" stroke="${shade(C.line, 1.8)}" stroke-width=".02"/>`;
    svg += `<path d="${P(inset(rim, .065))}" fill="none" stroke="${C.stitch}" stroke-width=".012" stroke-dasharray=".06 .05" opacity=".8"/>`;
  }
  if (m.laced) {
    const e0 = m.shaft ? m.leg : m.throat + .05, e1 = m.vamp + .15, xs = Array.from({ length: 21 }, (_, i) => e0 + (e1 - e0) * i / 20);
    // the tongue: its padded top over the front of the opening, under the laces to the vamp
    const t0 = m.shaft ? m.leg - .35 : m.throat - .55, tw = x => .8 - .18 * Math.max(0, (x - t0) / (m.vamp - t0)), tx = Array.from({ length: 13 }, (_, i) => t0 + .25 + (m.vamp - t0 - .25) * i / 12);
    const tongue = chaikin([...tx.map(x => [x, tw(x)]), ...tx.slice().reverse().map(x => [x, -tw(x)]), ...cubicPts([t0 + .25, -tw(t0)], [t0 - .05, -tw(t0)], [t0 - .1, -.3], [t0 - .1, 0], 5), ...cubicPts([t0 - .1, 0], [t0 - .1, .3], [t0 - .05, tw(t0)], [t0 + .25, tw(t0)], 5).slice(1, -1)], 2);
    svg += `<path d="${P(tongue)}" fill="${shade(C.upper, 1.02)}" ${line('.026')}/><path d="${P(inset(tongue, .09))}" fill="none" stroke="${C.stitch}" stroke-width=".012" stroke-dasharray=".06 .05" opacity=".7"/>`;
    // the eyestays either side of the opening, the eyelets in them, the laces across
    for (const sg of [1, -1]) {
      const es = chaikin([...xs.map(x => [x, sg * gapAt(m, x)]), ...xs.slice().reverse().map(x => [x, sg * (gapAt(m, x) + .6 - .25 * Math.max(0, (x - e1 + .6) / .6))])], 2);
      svg += `<path d="${P(es)}" fill="${C.overlay}" ${line('.026')}/><path d="${P(inset(es, .07))}" fill="none" stroke="${C.stitch}" stroke-width=".013" stroke-dasharray=".07 .05"/>`;
    }
    const ex = (m.eyelets || pat.marks.eyelets || []).map(p => p[0]).map(x => Math.min(Math.max(x, e0 + .12), e1 - .3)).filter((x, i, all) => i === all.length - 1 || all[i + 1] - x > .3), // up a shaft the eyelets stand over each other: the top one of each stack shows
      at = (x, sg) => [x, sg * (gapAt(m, x) + .26)];
    const lace = (a, b) => `<path d="${L_([a, b])}" stroke="${shade(C.lace, .78)}" stroke-width=".12" stroke-linecap="round"/><path d="${L_([a, b])}" stroke="${C.lace}" stroke-width=".08" stroke-linecap="round"/>`;
    for (let i = ex.length - 1; i > 0; i--) svg += lace(at(ex[i], 1), at(ex[i - 1], -1)) + lace(at(ex[i], -1), at(ex[i - 1], 1));
    if (ex.length) { const a = at(ex[0], 1), b = at(ex[0], -1), k = [ex[0] - .1, 0]; svg += lace(a, b) + `<path d="M${r3(k[0])} 0 C${r3(k[0] - .7)} -.55 ${r3(k[0] - 1)} -.05 ${r3(k[0])} 0 C${r3(k[0] - 1)} .05 ${r3(k[0] - .7)} .55 ${r3(k[0])} 0 M${r3(k[0])} 0 C${r3(k[0] - .3)} .2 ${r3(k[0] - .6)} .25 ${r3(k[0] - 1.05)} .45 M${r3(k[0])} 0 C${r3(k[0] - .3)} -.15 ${r3(k[0] - .55)} -.3 ${r3(k[0] - .95)} -.42" fill="none" stroke="${C.lace}" stroke-width=".07" stroke-linecap="round"/>`; }
    svg += ex.flatMap(x => [at(x, 1), at(x, -1)]).map(([x, y]) => `<circle cx="${r3(x)}" cy="${r3(y)}" r=".075" fill="#fff" stroke="${C.line}" stroke-width=".02"/>`).join('');
  }
  svg += strokesSvg((pat.spec?.sketches || []).filter(k => k.on === 'top'));
  const b = boundsOf(sole);
  return { svg, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, name: 'Top' };
}

// ---- from below: the outsole (the outside at the top, as the shoe turned over shows it) ----
function bottomView(pat, C) {
  const l = pat.last, L = l.length, pl = planOf(pat), type = pat.sole?.type, sole = inset(pl.outline, type === 'stitched' ? -.14 : type === 'midsole' ? -.26 : -.17), b = boundsOf(sole), ball = l.ballFromHeel, line = w => `stroke="${C.line}" stroke-width="${w}"`;
  let svg = `<path d="${P(sole)}" fill="${C.sole}" ${line('.03')}/>`;
  const cut = (pts, x0, x1) => { const xs = Array.from({ length: 25 }, (_, i) => x0 + (x1 - x0) * i / 24), w = xs.map(x => across(pts, x)).filter(Boolean); return w.length ? [...xs.slice(0, w.length).map((x, i) => [x, w[i][0]]), ...xs.slice(0, w.length).map((x, i) => [x, w[i][1]]).reverse()] : []; };
  if (type === 'stitched') {
    // a leather or rubber sole on a stacked heel: the heel's breast across, the stitching round the forepart
    const inner = inset(sole, .17), breast = l.F * .27, heel = chaikin(cut(sole, -.3, breast), 1), fore = inner.filter(p => p[0] > breast + .3);
    svg += `<path d="${P(heel)}" fill="${C.outsole}" ${line('.022')}/><path d="${L_(fore)}" fill="none" stroke="${C.stitch}" stroke-width=".016" stroke-dasharray=".06 .045"/>`;
  } else {
    // rubber pads under the forefoot and the heel; the midsole shows through the waist; flex grooves across the ball
    const pad = inset(sole, .12), fore = chaikin(cut(pad, ball - 2.6, L + 1), 1), heel = chaikin(cut(pad, -1, l.F * .3), 1);
    svg += `<path d="${P(fore)}" fill="${C.outsole}" ${line('.02')}/><path d="${P(heel)}" fill="${C.outsole}" ${line('.02')}/>`;
    for (const dx of [-1.6, -.9, -.2, .5, 1.2]) { const x = ball + dx, a = across(pad, x); if (a) svg += `<path d="M${r3(x - .12)} ${r3(a[0] + .22)} Q${r3(x + .05)} ${r3((a[0] + a[1]) / 2)} ${r3(x - .12)} ${r3(a[1] - .22)}" fill="none" ${line('.028')} opacity=".6"/>`; }
  }
  svg += strokesSvg((pat.spec?.sketches || []).filter(k => k.on === 'bottom'));
  return { svg: `<g transform="translate(0 ${r3(b.y0 + b.y1)}) scale(1 -1)">${svg}</g>`, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, name: 'Bottom' };
}

export function footwearViews(pat, { colours = {}, tex = {} } = {}) {
  const C = { ...palette(pat, colours), tex, uid: `v${++SEQ}` };
  const v = { lateral: sideView(pat, 'lateral', C), medial: sideView(pat, 'medial', C), top: topView(pat, C), bottom: bottomView(pat, C) };
  const defs = lookDefs(C.uid, tex);
  for (const k of Object.keys(v)) { v[k].key = k; if (defs) v[k].svg = `<defs>${defs}</defs>` + v[k].svg; }
  return { ...v, colours: C };
}
// the four views laid out: lateral at its own place (so a picture can be laid over it), medial to its right, top and bottom below
export function viewsLayout(v, gap = 1.6) {
  const L = v.lateral.box, M = v.medial.box, T = v.top.box, B = v.bottom.box, y2 = L.y1 + gap + 1 - T.y0, dxM = L.x1 + gap - M.x0, dxB = L.x1 + gap - B.x0, dxT = L.x0 - T.x0, y2b = L.y1 + gap + 1 - B.y0;
  const at = (view, dx, dy) => ({ ...view, dx, dy, box: { x0: view.box.x0 + dx, y0: view.box.y0 + dy, x1: view.box.x1 + dx, y1: view.box.y1 + dy } });
  const items = [at(v.lateral, 0, 0), at(v.medial, dxM, 0), at(v.top, dxT, y2), at(v.bottom, dxB, y2b)];
  const all = items.flatMap(i => [[i.box.x0, i.box.y0], [i.box.x1, i.box.y1 + .9]]);
  return { items, box: boundsOf(all) };
}
export function viewsMarkup(lay, { label = true, faint = -1 } = {}) {
  return lay.items.map((i, k) => `<g transform="translate(${r3(i.dx)} ${r3(i.dy)})"${k === faint ? ' opacity=".55"' : ''}>${i.svg}</g>${label ? `<text x="${r3(i.box.x0)}" y="${r3(i.box.y1 + .7)}" font-size=".42" fill="#727278">${esc(i.name)}</text>` : ''}`).join('');
}
export function flatsSheet(pat, { title = '', colours = {}, tex = {} } = {}) {
  const v = footwearViews(pat, { colours, tex }), lay = viewsLayout(v), b = lay.box, W = b.x1 - b.x0 + 2, H = b.y1 - b.y0 + 3.2;
  const head = `<text x="${r3(b.x0)}" y="${r3(b.y0 - 1.6)}" font-size=".55" font-weight="700">${esc(title || pat.label)}</text><text x="${r3(b.x0)}" y="${r3(b.y0 - .9)}" font-size=".34" fill="#55545a">${esc(pat.label)} · ${esc(pat.size)} · ${esc(pat.notes[0] || '')} · tech flats, 1:1</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}in" height="${r3(H)}in" viewBox="${r3(b.x0 - 1)} ${r3(b.y0 - 2.4)} ${r3(W)} ${r3(H)}" font-family="Helvetica, Arial, sans-serif"><rect x="${r3(b.x0 - 1)}" y="${r3(b.y0 - 2.4)}" width="${r3(W)}" height="${r3(H)}" fill="#fff"/>${head}${viewsMarkup(lay)}</svg>\n`;
}

// where a point drawn on a view (in the view's own coordinates, before the layout moves it) is kept: a side's in the side view's inches (the
// inside view is drawn mirrored), the bottom's in the plan (it is drawn turned over), the top's as it is
export function sketchPoint(pat, view, pt) {
  const b = view.box;
  if (view.key === 'lateral') return unwarpOf(pat.last)(pt);
  if (view.key === 'medial') return unwarpOf(pat.last)([b.x0 + b.x1 - pt[0], pt[1]]);
  if (view.key === 'bottom') return [pt[0], b.y0 + b.y1 - pt[1]];
  return pt;
}
