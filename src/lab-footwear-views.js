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
  return { upper, overlay: c.overlay || shade(upper, .9), sole: c.sole || '#f3f0e8', outsole: shade(c.sole || '#f3f0e8', .78), lining: c.lining || shade(upper, .94), lace: c.upper || upper, line: '#2b2a28', stitch: '#5d5a55' };
}

// ---- the side: the last's heel curve and toe drawn in (the pattern's side view is square at both ends) ----
// near the heel each height is moved in by how far the heel curve is from the back there: the seat rounded under, the heel point the
// furthest back about an inch up, the back leaning forward to the top; near the toe the same for the toe's rounding above and below its tip
function warpOf(last) {
  const L = last.length, h = last.heelHeight, sp = last.toeSpring;
  const db = up => { const u = Math.max(0, up - h); return u < .9 ? .3 * (1 - u / .9) ** 2 : .26 * Math.min(1, (u - .9) / 2.6) ** 1.4; };
  const df = up => { const v = up - sp; return Math.min(.55, 2.4 * (v - .25) ** 2); }; // the tip a quarter inch up, the toe rounding back above and below it
  return ([x, y]) => { const up = -y, wb = Math.max(0, 1 - x / 2.2) ** 2, wf = Math.max(0, 1 - (L - x) / 2) ** 2; return [x + wb * db(up) - wf * df(up), y]; };
}
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
  return { outline, outsole: band };
}
const visibleOn = (q, side) => q.place.view === 'front' && q.shown && !q.component && !INSIDE.test(q.id) && (side === 'medial' ? !/-lat(-|$)/.test(q.id) && !(q.seamSide === 'lateral') : !/-med(-|$)/.test(q.id) && !(q.seamSide === 'medial'));
function sideView(pat, side, C) {
  const l = pat.last, W = warpOf(l), fill = q => q.fabric === 'overlay' ? C.overlay : q.fabric === 'lining' ? C.lining : C.upper;
  const pieces = pat.pieces.filter(q => visibleOn(q, side)).sort((a, b) => (a.place.z || 0) - (b.place.z || 0));
  let svg = '';
  for (const q of pieces) {
    const pts = chaikin(steady(dense(q.shown, .12).map(W), 1), 2), over = q.fabric === 'overlay' || /eyestay|toe-cap|heel-overlay|mudguard|back-tab/.test(q.id);
    svg += `<path data-pid="${esc(q.id)}" class="pc" d="${P(pts)}" fill="${fill(q)}" stroke="${C.line}" stroke-width=".028" stroke-linejoin="round"/>`;
    if (over || q.id === 'vamp') svg += `<path d="${P(inset(pts, .075))}" fill="none" stroke="${C.stitch}" stroke-width=".014" stroke-dasharray=".07 .05"/>`;
    if (q.id === 'tongue') svg += `<path d="${L_(chaikin(dense(q.shown.slice(0, Math.ceil(q.shown.length / 2)), .2).map(W), 1, false))}" fill="none" stroke="${C.stitch}" stroke-width=".012" stroke-dasharray=".05 .05" opacity=".6"/>`;
  }
  const eye = (pat.marks?.eyelets || []).map(W);
  svg += eye.map(([x, y]) => `<circle cx="${r3(x)}" cy="${r3(y)}" r=".085" fill="#fff" stroke="${C.line}" stroke-width=".022"/>`).join('');
  // the laces: from each eyelet over the top to the next, as they show from the side
  for (let i = 0; i < eye.length - 1; i++) { const a = eye[i], b = eye[i + 1], top = W([(a[0] + b[0]) / 2 + .1, l.crest((a[0] + b[0]) / 2 + .1) + .06]); svg += `<path d="M${r3(a[0])} ${r3(a[1])} Q${r3(top[0] - .15)} ${r3(top[1])} ${r3(top[0] + .1)} ${r3(top[1] - .01)}" fill="none" stroke="${shade(C.lace, .82)}" stroke-width=".11" stroke-linecap="round"/><path d="M${r3(a[0])} ${r3(a[1])} Q${r3(top[0] - .15)} ${r3(top[1])} ${r3(top[0] + .1)} ${r3(top[1] - .01)}" fill="none" stroke="${C.lace}" stroke-width=".07" stroke-linecap="round"/>`; }
  if (eye.length) { const a = eye[0], k = W([a[0] - .1, l.crest(a[0]) - .05]); svg += `<path d="M${r3(a[0])} ${r3(a[1])} C${r3(k[0] - .3)} ${r3(k[1] - .2)} ${r3(k[0] - .6)} ${r3(k[1] + .5)} ${r3(k[0] - .2)} ${r3(k[1] + 1)}" fill="none" stroke="${C.line}" stroke-width=".09" stroke-linecap="round" opacity=".55"/><path d="M${r3(a[0])} ${r3(a[1])} C${r3(k[0] - .3)} ${r3(k[1] - .2)} ${r3(k[0] - .6)} ${r3(k[1] + .5)} ${r3(k[0] - .2)} ${r3(k[1] + 1)}" fill="none" stroke="${C.lace}" stroke-width=".055" stroke-linecap="round"/>`; }
  const so = soleSide(pat, W);
  svg += `<path d="${P(so.outline)}" fill="${C.sole}" stroke="${C.line}" stroke-width=".03" stroke-linejoin="round"/>`;
  svg += `<path d="${P(so.outsole)}" fill="${C.outsole}" stroke="${C.line}" stroke-width=".02"/>`;
  const pts = [...pieces.flatMap(q => q.shown.map(W)), ...so.outline], b = boundsOf(pts);
  const g = side === 'medial' ? `<g transform="translate(${r3(b.x0 + b.x1)} 0) scale(-1 1)">${svg}</g>` : svg;
  return { svg: g, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, name: side === 'medial' ? 'Medial (inside)' : 'Lateral (outside)' };
}

// ---- from above: the pieces carried up onto the last and looked down on (toe right, the outside at the bottom) ----
function topView(pat, C) {
  const l = pat.last, sh = shellOf(l), plan = q => [q[0], q[2]], fill = q => q.fabric === 'overlay' ? C.overlay : C.upper;
  const sole = chaikin(inset(dense(l.bottom, .25), -.2), 2);
  let svg = `<path d="${P(sole)}" fill="${C.sole}" stroke="${C.line}" stroke-width=".03"/>`;
  // the upper's outline from above: the last at its widest, which is at the feather line (just inside the sole's flare)
  const silo = chaikin(inset(dense(l.bottom, .25), -.03), 2);
  svg += `<path d="${P(silo)}" fill="${C.upper}" stroke="${C.line}" stroke-width=".028"/>`;
  // each piece on its side of the last; one that crosses the top (the vamp, the toe cap, the tongue) on both, joined along the top centre, so
  // its outline is drawn everywhere but there. The back tab stands above the last and is not seen from above.
  const pieces = pat.pieces.filter(q => q.place.view === 'front' && q.shown && !q.component && !INSIDE.test(q.id) && q.id !== 'back-tab').sort((a, b) => (a.place.z || 0) - (b.place.z || 0));
  for (const q of pieces) {
    const sides = /-med(-|$)/.test(q.id) ? ['medial'] : /-lat(-|$)/.test(q.id) ? ['lateral'] : ['lateral', 'medial'], over = q.fabric === 'overlay' || /eyestay|toe-cap|heel-overlay|mudguard/.test(q.id);
    const src = dense(q.shown, .15), atTop = src.map(p => p[1] <= l.crest(Math.min(Math.max(p[0], 0), l.length)) + .03);
    for (const sd of sides) {
      // a point on the top edge is on the top centre: the two sides of a piece cut whole meet there
      const pts = steady(src.map((p, i) => { const c = l.crest(Math.min(Math.max(p[0], 0), l.length)); return plan(atTop[i] && sides.length === 2 ? onSurface(sh[sd], [p[0], c - .02]) : onSurface(sh[sd], [p[0], Math.max(p[1], c + .005)], true)); }));
      svg += `<path d="${P(chaikin(pts, 2))}" fill="${fill(q)}" stroke="none"/>`;
      let d = ''; pts.forEach((p, i) => { const j = (i + 1) % pts.length; if (sides.length === 2 && (atTop[i] && atTop[j] || p[0] > l.length - .35 && pts[j][0] > l.length - .35)) return; d += `M${r3(p[0])} ${r3(p[1])} L${r3(pts[j][0])} ${r3(pts[j][1])} `; });
      svg += `<path d="${d}" fill="none" stroke="${C.line}" stroke-width=".026" stroke-linecap="round"/>`;
      if (over && sides.length === 1) svg += `<path d="${P(inset(chaikin(pts, 2), .07))}" fill="none" stroke="${C.stitch}" stroke-width=".013" stroke-dasharray=".07 .05"/>`;
    }
  }
  // eyelets both sides, and the laces criss-crossing between them
  const eL = (pat.marks?.eyelets || []).map(p => plan(onSurface(sh.lateral, p, true))), eM = (pat.marks?.eyelets || []).map(p => plan(onSurface(sh.medial, p, true)));
  for (let i = 0; i < eL.length - 1; i++) for (const [a, b] of [[eL[i], eM[i + 1]], [eM[i], eL[i + 1]]]) svg += `<path d="${L_([a, b])}" stroke="${shade(C.lace, .8)}" stroke-width=".11" stroke-linecap="round"/><path d="${L_([a, b])}" stroke="${C.lace}" stroke-width=".07" stroke-linecap="round"/>`;
  if (eL.length) { const a = eL[0], b = eM[0]; svg += `<path d="${L_([a, b])}" stroke="${shade(C.lace, .8)}" stroke-width=".11" stroke-linecap="round"/><path d="${L_([a, b])}" stroke="${C.lace}" stroke-width=".07" stroke-linecap="round"/>`; }
  svg += [...eL, ...eM].map(([x, y]) => `<circle cx="${r3(x)}" cy="${r3(y)}" r=".08" fill="#fff" stroke="${C.line}" stroke-width=".02"/>`).join('');
  const b = boundsOf(sole);
  return { svg, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, name: 'Top' };
}

// ---- from below: the outsole, with its flex grooves across the forefoot ----
function bottomView(pat, C) {
  const l = pat.last, sole = chaikin(inset(dense(l.bottom, .25), -.2), 2), pad = chaikin(inset(sole, .12), 1), b = boundsOf(sole), ball = l.ballFromHeel;
  const across = x => { const ys = []; for (let i = 0; i < sole.length; i++) { const p = sole[i], q = sole[(i + 1) % sole.length]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) ys.push(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])); } return ys.length ? [Math.min(...ys), Math.max(...ys)] : null; };
  let svg = `<path d="${P(sole)}" fill="${C.sole}" stroke="${C.line}" stroke-width=".03"/><path d="${P(pad)}" fill="${C.outsole}" stroke="${C.line}" stroke-width=".018"/>`;
  for (const dx of [-.9, -.3, .3, .9, 1.5]) { const x = ball + dx, a = across(x); if (a) svg += `<path d="M${r3(x - .1)} ${r3(a[0] + .3)} L${r3(x + .1)} ${r3(a[1] - .3)}" stroke="${C.line}" stroke-width=".03" opacity=".55"/>`; }
  return { svg: `<g transform="translate(0 ${r3(b.y0 + b.y1)}) scale(1 -1)">${svg}</g>`, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, name: 'Bottom' };
}

export function footwearViews(pat, { colours = {} } = {}) {
  const C = palette(pat, colours);
  return { lateral: sideView(pat, 'lateral', C), medial: sideView(pat, 'medial', C), top: topView(pat, C), bottom: bottomView(pat, C), colours: C };
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
export function flatsSheet(pat, { title = '', colours = {} } = {}) {
  const v = footwearViews(pat, { colours }), lay = viewsLayout(v), b = lay.box, W = b.x1 - b.x0 + 2, H = b.y1 - b.y0 + 3.2;
  const head = `<text x="${r3(b.x0)}" y="${r3(b.y0 - 1.6)}" font-size=".55" font-weight="700">${esc(title || pat.label)}</text><text x="${r3(b.x0)}" y="${r3(b.y0 - .9)}" font-size=".34" fill="#55545a">${esc(pat.label)} · ${esc(pat.size)} · ${esc(pat.notes[0] || '')} · tech flats, 1:1</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}in" height="${r3(H)}in" viewBox="${r3(b.x0 - 1)} ${r3(b.y0 - 2.4)} ${r3(W)} ${r3(H)}" font-family="Helvetica, Arial, sans-serif"><rect x="${r3(b.x0 - 1)}" y="${r3(b.y0 - 2.4)}" width="${r3(W)}" height="${r3(H)}" fill="#fff"/>${head}${viewsMarkup(lay)}</svg>\n`;
}
