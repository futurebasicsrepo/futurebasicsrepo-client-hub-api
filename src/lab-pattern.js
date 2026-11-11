// Design Lab patterns: a piece as the pattern pieces it is cut from. Garments are drafted from the flats' own measurements (src/lab-flats.js),
// so the pattern grades with the size run. Plush is drafted from a few choices (the shape, the height, the ears, the limbs). Every piece has a
// sew line, a seam allowance, a grain line, notches, how many to cut and from what. Each piece also knows where it sits on the product
// (for the exploded view, which lifts the pieces off the product and lays them out flat) and where it goes in the cutting layout.
// The same file runs in the page (served as /lab/pattern.js) and on the service (the DXF and the SVG), so it uses neither the DOM nor Node.
// All lengths are inches; y runs down. A pattern from here is a first block from the measurements: a pattern maker trues it up on the sample.
import { dxfR12 } from './lab-dxf.js';
import { STYLES, measurementsFor, SIZES, drawnLegs, followDrawing, bodyProfile } from './lab-flats.js';
import { constructionOf } from './lab-construction.js';
import { cleanSketches, VIEWS_OF } from './lab-sketch.js';
import { cleanLogos } from './lab-logos.js';
import { buildPlush, cleanBuild, PLUSH_PRESETS } from './lab-plush-parts.js';

const r3 = v => Math.round(v * 1000) / 1000;
const r8 = v => Math.round(v * 8) / 8;
const cubic = (a, c1, c2, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; });
const tail = pts => pts.slice(1);
// a smooth line through points (Catmull-Rom, a few steps between each two), the first and the last kept exactly
function smoothThrough(P, n = 4) { if (P.length < 3) return P; const out = [P[0]];
  for (let i = 0; i + 1 < P.length; i++) { const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, P.length - 1)];
    for (let k = 1; k <= n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); } }
  return out; }
const mirrorX = pts => pts.map(([x, y]) => [-x, y]);
const lenOf = pts => pts.reduce((s, q, i) => i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);
export const areaOf = pts => Math.abs(pts.reduce((s, q, i) => { const n = pts[(i + 1) % pts.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0) / 2);
export function boundsOf(pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
const rect = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
// the outline's extent across at height y → [x0, x1] (null where it does not reach)
function spanOf(poly, y) { const xs = []; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null; }
// the band of a piece between two heights, following its sides
function bandOf(poly, y0, y1, steps = 6) { const L = [], R = []; for (let i = 0; i <= steps; i++) { const y = y0 + (y1 - y0) * i / steps, sp = spanOf(poly, y); if (sp) { L.push([sp[0], y]); R.push([sp[1], y]); } } return L.length > 1 ? [...R, ...L.reverse()] : null; }
const ellipse = (rx, ry, n = 40, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(2 * Math.PI * i / n), cy + ry * Math.sin(2 * Math.PI * i / n)]);
// a closed shape drawn round its own outline with smooth corners, from a list of control rings: used for plush, where every edge is a curve
const blob = (pts, k = .5) => { const out = []; for (let i = 0; i < pts.length; i++) { const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
  const c1 = [p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3], c2 = [p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3]; out.push(...cubic(p1, c1, c2, p2, 8).slice(0, -1)); } return out; };
// clean up: no repeated points, clockwise in screen space (y down) so the seam allowance always grows outward
function tidy(pts) {
  const out = []; for (const q of pts) { const p = [r3(q[0]), r3(q[1])], l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > .01) out.push(p); }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < .01) out.pop();
  // a corner that doubles straight back on itself over a short run (two cuts meeting a hair past each other) is cut away: an outline that
  // crosses itself cannot be cut, and a sliver under ¼ in is no piece of cloth
  for (let k = 0, changed = true; changed && out.length > 3 && k < 8; k++) { changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) { const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length], u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]], lu = Math.hypot(...u), lv = Math.hypot(...v);
      if (lu < .03 || lv < .03 || (Math.min(lu, lv) < .25 && (u[0] * v[0] + u[1] * v[1]) / lu / lv > .97)) { out.splice(i, 1); changed = true; i--; } } }
  const s = out.reduce((a, q, i) => { const n = out[(i + 1) % out.length]; return a + (q[0] * n[1] - n[0] * q[1]); }, 0);
  return s < 0 ? out.reverse() : out;
}
// the cutting line: the sew line grown outward by the seam allowance, corners mitred (and clipped where a mitre would spike)
export function offsetOf(pts, d) {
  if (!d) return pts.map(q => q.slice()); const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2]; // outward for a clockwise outline in y-down space
    let m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(...m);
    if (ml < 1e-6) { out.push([b[0] + n1[0] * d, b[1] + n1[1] * d]); continue; }
    m = [m[0] / ml, m[1] / ml]; const k = d / Math.max(m[0] * n1[0] + m[1] * n1[1], .35);
    if (k > d * 2.2) { out.push([b[0] + n1[0] * d, b[1] + n1[1] * d], [b[0] + n2[0] * d, b[1] + n2[1] * d]); } else out.push([b[0] + m[0] * k, b[1] + m[1] * k]);
  }
  return out.map(q => [r3(q[0]), r3(q[1])]);
}

// ---- the pieces ----
// a piece: { id, name, fabric, cut, pair, fold, sew (closed outline, the whole piece), grain [[x,y],[x,y]], notches [[x,y]], notes [], place {view, x, y, rot, flip, z} }
// fold: the piece is cut on the fold of the cloth along x = 0 (its own centre line); the drawing shows it whole and marks the fold
const FABRIC_NAMES = { self: 'Self (main fabric)', rib: 'Rib', shearling: 'Shearling (or faux shearling)', lining: 'Lining', fusing: 'Fusing', insulation: 'Insulation (batting or down)', pocketing: 'Pocketing', board: 'Board', knit: 'Knit (to shape)', pile: 'Plush pile', leather: 'Leather', felt: 'Felt', contrast: 'Contrast', mane: 'Long-pile faux fur (mane)', upper: 'Upper', overlay: 'Overlays', foam: 'Foam', elastic: 'Elastic gore', stiffener: 'Stiffener (thermoplastic)', rubber: 'Rubber (moulded)', eva: 'EVA (moulded)', reinforcement: 'Reinforcement (non-woven backer)', membrane: 'Waterproof membrane', strobel: 'Strobel sock (non-woven)' };
export const fabricName = f => FABRIC_NAMES[f] || f;
function piece(id, name, sew, o = {}) {
  const s = tidy(sew), b = boundsOf(s);
  return { id, name, fabric: o.fabric || 'self', cut: o.cut ?? 1, ...(o.cut === 0 && /-2$/.test(id) ? { twin: true } : {}), pair: Boolean(o.pair), fold: Boolean(o.fold), sew: s, grain: o.grain || [[(b.x0 + b.x1) / 2, b.y0 + b.h * .2], [(b.x0 + b.x1) / 2, b.y1 - b.h * .2]], notches: o.notches || [], notes: o.notes || [], place: { view: 'front', x: 0, y: 0, rot: 0, flip: false, z: 0, ...(o.place || {}) }, sa: o.sa ?? null, marks: o.marks || [], ...(o.shown ? { shown: tidy(o.shown) } : {}), ...(o.component ? { component: true } : {}), ...(o.hidden ? { hidden: true } : {}), ...(o.neck ? { neck: o.neck } : {}) };
}
// the other one of a pair: drawn on the product and in the exploded view, never cut twice (its cut count is on the first)
const twin = (id, name, sew, place) => ({ ...piece(id, name, sew, { cut: 0, place }), twin: true });
const cutWords = p => `Cut ${p.cut}${p.fold ? ' on the fold' : ''}${p.pair ? ' (a pair)' : ''}`;
export { cutWords };

// ---- garments, from the flats ----
// ---- a tailored jacket (a blazer, a sport coat, a tailored overcoat): the jacket cut as a tailor cuts it, not as a zip jacket with a lapel
// the body in three: the front (its lapel cut in one with it, folded back along the roll line), a side body under the arm, and a back seamed
// down the centre; a top collar and an under collar meeting the lapel at the notch (a peak lapel on a double-breasted); a two-piece sleeve;
// a chest welt and flap pockets; a facing, a full lining, canvas and fusing. Single-breasted: a 1 in stand, two buttons; double-breasted: a
// 3¼ in overlap, six buttons (two to fasten). No rib anywhere. Coordinates as the other tops: x out from the centre front, y down from the
// shoulder line; the half body, its mirror the other.
function tailoredPieces(S, m, o, style, K) {
  let TS_AT = null, US_AT = null;
  const dbl = K.breasted === 'double', peak = K.lapel ? K.lapel === 'peak' : dbl, trims = [], pieces = [];
  const half = m.chest / 2, nw = m.neckWidth / 2, sh = Math.max(m.shoulder / 2, nw + 2), slope = 1.1, L = m.length, SP = [sh, slope];
  const UA = [half, slope + m.armhole], ext = dbl ? 3.25 : 1, breakY = dbl ? UA[1] + 1.5 : UA[1] + 3.5, waistY = Math.min(L - 6, UA[1] + 6.5);
  let sideX; // the front's side seam to the side body: where it leaves the armhole, 70% of the way down it (set below)
  const armhole = cubic(SP, [SP[0] - .4, SP[1] + (UA[1] - SP[1]) * .55], [UA[0] - 1.3, UA[1] - .1], UA, 24), kA = Math.max(1, armhole.findIndex(([, y]) => y >= SP[1] + (UA[1] - SP[1]) * .9)), aF = armhole.slice(0, kA + 1), aEnd = aF[aF.length - 1];
  sideX = aEnd[0];
  // the lapel as cut: past the roll line (from the neck point to the break), its edge to the notch, the gorge back to the neck
  const lapW = dbl ? 3.75 : 3.25, notchY = 2.6, N0 = [nw - .1, 0], B = [-ext, breakY];
  const lapTip = peak ? [-ext - lapW * .62, notchY - 2.3] : [-ext - lapW * .55, notchY + .1], notchIn = peak ? [-ext - lapW * .18, notchY + .35] : [-ext - lapW * .2, notchY + .65];
  const lapelEdge = [B, ...tail(cubic(B, [-ext - lapW * .55, breakY * .6], [-ext - lapW * .85, notchY + 3], lapTip)), notchIn, [nw * .35, notchY - .3], N0];
  const shoulderF = cubic(N0, [N0[0] + (SP[0] - N0[0]) * .33, SP[1] * .25], [N0[0] + (SP[0] - N0[0]) * .67, SP[1] * .6], SP); // the shoulder: from the neck point out to the shoulder point, never back past the neck
  const frontSew = [[-ext, L], ...lapelEdge.slice(), ...tail(shoulderF), ...tail(aF), [sideX, waistY], [sideX - .2, L + .35]];
  // on the product: the front's face with its lapel folded back over it (the roll line from the neck to the break)
  const roll = [[nw - .2, .25], B], fold = ([x, y]) => { const [a, b] = roll, dx = b[0] - a[0], dy = b[1] - a[1], t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), px = a[0] + t * dx, py = a[1] + t * dy; return [2 * px - x, 2 * py - y]; };
  const lapelSeen = [B, ...lapelEdge.slice(1, -1).map(fold), [nw - .2, .25]];
  const faceSeen = [[-ext, L], B, [nw - .2, .25], ...tail(shoulderF), ...tail(armhole), [half, waistY], [half + .3, L + .35]];
  pieces.push(piece('front', 'Front', frontSew, { cut: 2, pair: true, shown: faceSeen, notches: [B, [sideX, waistY]], notes: [`Lapel cut in one with the front, rolled from the neck to the break ${r8(breakY)} in down; ${dbl ? '3¼ in double-breasted overlap' : '1 in button stand'} past the centre front`, 'Fused, with a floating chest canvas and a bridle tape on the roll line'], place: { view: 'front', x: 0, y: 0, z: 1 } }),
    { ...twin('front-2', 'Front', frontSew, { view: 'front', flip: true, z: dbl ? 2 : 1 }), shown: faceSeen });
  for (const [id, fl] of [['lapel', false], ['lapel-2', true]]) pieces.push({ ...piece(id, peak ? 'Peak lapel' : 'Notch lapel', lapelSeen, { cut: 0, shown: lapelSeen, place: { view: 'front', x: 0, y: 0, ...(fl ? { flip: true } : {}), z: fl && dbl ? 4 : 3 } }), twin: true, copy: true, of: 'front' });
  // the side body: under the arm, between the front and the back
  // a three-piece body: the front to its side seam (sideX), the side body under the arm, the back to its own side seam (backX); the three
  // across are the chest. The armhole runs over all three: the front's from the shoulder, the side body's under the arm, the back's to the shoulder
  const a0 = aEnd ? aEnd[1] : UA[1], sbW = (half - sideX) * 2 + 1, backX = m.chest - sideX - sbW, yb = UA[1] - 1;
  // the side body's top: the bottom of the armhole, leaving each seam at a cuttable angle (not a sliver)
  const sideTopC = cubic([0, a0], [sbW * .45, a0 + (UA[1] + .9 - a0) * .8], [sbW * .55, UA[1] + .9], [sbW, yb]);
  const side = [[0, a0], ...tail(sideTopC), [sbW - .3, waistY], [sbW - .1, L + .3], [.2, L + .35], [.3, waistY]];
  pieces.push(piece('side-body', 'Side body', side.map(([x, y]) => [x, y - UA[1]]), { cut: 2, pair: true, hidden: true, notes: ['Under the arm, between the front and the back; shaped at the waist'], place: { view: 'back', x: half + 2, y: UA[1], z: -1 } }));
  // the back, seamed down the centre and shaped into the waist; a centre vent (or two side vents)
  // the back's shoulder ⅜ in longer than the front's, eased onto it; its armhole curving down to its side seam above the underarm
  const fSh = lenOf(shoulderF), u = [SP[0] - nw, SP[1]], ul = Math.hypot(...u), SPb = [nw + u[0] / ul * (fSh + .375), u[1] / ul * (fSh + .375)];
  const bArm = cubic(SPb, [SPb[0] + .15, SPb[1] + (yb - SPb[1]) * .45], [backX + .7, yb - 1], [backX, yb]);
  const nb = cubic([0, 1], [nw * .55, 1], [nw, .5], [nw, 0]), back = [[0, 1], ...tail(nb), SPb, ...tail(bArm), [backX - .25, waistY], [backX - .1, L + .35], [0, L + .35], [.45, waistY]];
  pieces.push(piece('back', 'Back', back, { cut: 2, pair: true, notes: ['Centre-back seam, shaped ½ in in at the waist; a 9 in centre vent'], place: { view: 'back', x: 0, y: 0 } }), twin('back-2', 'Back', back, { view: 'back', flip: true }));
  if (K.yoke?.back) { const yy = SP[1] + 3.25, yk = [[-sh, SP[1]], [-nw, 0], [nw, 0], [sh, SP[1]], [sh + .15, yy], [-sh - .15, yy]]; // a back yoke (a biker, a trench's storm flap), across the shoulders
    pieces.push(piece('back-yoke', 'Back yoke', yk, { cut: 1, fold: true, notes: ['Across the shoulders, the back seamed to it and topstitched'], shown: yk, place: { view: 'back', x: 0, y: 0, z: 2 } })); }
  // the collar: the top collar (self) and the under collar (melton, on the bias), stand and fall, meeting the lapel at the notch
  const neckLen = lenOf(nb) * 2 + lenOf(cubic(N0, [nw * .6, -.1], [nw * .9, -.05], [nw, 0])) * 2 + 2;
  const collar = [[-neckLen / 2, 0], ...tail(cubic([-neckLen / 2, 0], [-neckLen / 4, -.4], [neckLen / 4, -.4], [neckLen / 2, 0])), [neckLen / 2 + 1.1, 2.6], [neckLen / 2 + .2, 3.2], ...tail(cubic([neckLen / 2 + .2, 3.2], [neckLen / 4, 3.6], [-neckLen / 4, 3.6], [-neckLen / 2 - .2, 3.2])), [-neckLen / 2 - 1.1, 2.6]];
  // the collar as the front shows it: a band round the back of the neck (seen inside the opening), over the shoulder and down the gorge to the notch
  const nIn = fold(notchIn), tipC = [nIn[0] + (peak ? .35 : .75), nIn[1] - (peak ? .1 : .55)], collarSeen = [[0, .95], [nw * .55, .7], [nw - .2, .25], nIn, tipC, [nw + 1.1, -.35], [nw * .5, -.85], [0, -.9]];
  pieces.push(piece('top-collar', 'Top collar', collar, { cut: 1, hidden: true, notes: ['Self; stand and fall, the fall ½ in deeper at the back'], place: { view: 'front', x: 0, y: -1.2, z: -1 } }),
    piece('under-collar', 'Under collar', collar, { fabric: 'melton', cut: 2, hidden: true, notes: ['Melton or felt on the bias, seamed at the centre back; pad-stitched'], place: { view: 'front', x: 0, y: -1.2, z: -1 } }));
  for (const [id, fl] of [['collar-end', false], ['collar-end-2', true]]) pieces.push({ ...piece(id, 'Collar', collarSeen, { cut: 0, shown: collarSeen, place: { view: 'front', x: 0, y: 0, ...(fl ? { flip: true } : {}), z: 5 } }), twin: true, copy: true, of: 'top-collar' });
  // the facing: the lapel and the front edge, self, so the lapel shows self cloth when it rolls
  const facing = [...lapelEdge, ...tail(cubic(N0, [nw + .5, .05], [nw + 1.2, .3], [nw + 1.6, .8])), [2.2, breakY + 2], [1.4, L], [-ext, L]];
  pieces.push(piece('facing', 'Front facing', facing, { cut: 2, pair: true, hidden: true, notes: ['Self, fused; the lapel turned at the roll line'], place: { view: 'front', x: 0, y: 0, z: -2 } }));
  // the two-piece sleeve: a top sleeve and an under sleeve, with a cuff vent and buttons
  if (m.sleeve > 0) {
    const sideTop = sideTopC, A = lenOf(aF) + lenOf(sideTop) + lenOf(bArm), ch = Math.max(5.5, (UA[1] - SP[1]) * .62), so = m.sleeveOpening || 5.5, Ls = m.sleeve;
    // the two caps (top and under) solved to the armhole round plus ¾ in of ease (src/lab-pattern-check.js walks it)
    const capLen = w => lenOf(cubic([0, 0], [w * .32, -.1], [w * .62, ch * .45], [w * .66, ch])) + lenOf(cubic([-w * .38, ch], [-w * .36, ch * .55], [-w * .25, .25], [0, 0])) + lenOf(cubic([-w * .34, ch], [-w * .2, ch + .9], [w * .2, ch + .9], [w * .3, ch + .2]));
    let bw = A / 2.2; for (let k = 0; k < 8; k++) bw *= (A + .75) / capLen(bw);
    const top = [[0, 0], ...tail(cubic([0, 0], [bw * .32, -.1], [bw * .62, ch * .45], [bw * .66, ch])), [so * .62, Ls], [-so * .5, Ls], [-bw * .38, ch], ...tail(cubic([-bw * .38, ch], [-bw * .36, ch * .55], [-bw * .25, .25], [0, 0])).slice(0, -1)];
    // the under sleeve's seams as long as the top sleeve's they are sewn to: its hem corners set down each seam to that length
    const tf = Math.hypot(so * .62 - bw * .66, Ls - ch), tb = Math.hypot(-so * .5 + bw * .38, Ls - ch), uF = [so * .45, ch + .2 + Math.sqrt(Math.max(tf ** 2 - (so * .45 - bw * .3) ** 2, 1))], uB = [-so * .45, ch + Math.sqrt(Math.max(tb ** 2 - (-so * .45 + bw * .34) ** 2, 1))];
    const under = [[-bw * .34, ch], ...tail(cubic([-bw * .34, ch], [-bw * .2, ch + .9], [bw * .2, ch + .9], [bw * .3, ch + .2])), uF, uB];
    TS_AT = { top: [0, 0], f: [r3(bw * .66), r3(ch)], fH: [r3(so * .62), r3(Ls)], bH: [r3(-so * .5), r3(Ls)], b: [r3(-bw * .38), r3(ch)] }; US_AT = { b: [r3(-bw * .34), r3(ch)], f: [r3(bw * .3), r3(ch + .2)], fH: [r3(uF[0]), r3(uF[1])], bH: [r3(uB[0]), r3(uB[1])] };
    const slSeen = [[0, 0], [bw * .5, ch * .35], [so * .55, Ls], [-so * .55, Ls], [-bw * .5, ch * .35]];
    pieces.push(piece('top-sleeve', 'Top sleeve', top, { cut: 2, pair: true, shown: slSeen, notes: ['Two-piece sleeve; the cap eased ¾ in; a 4 in cuff vent with four buttons'], place: { view: 'front', x: sh + .3, y: SP[1] + .2, rot: -14, z: 0 } }),
      { ...twin('top-sleeve-2', 'Top sleeve', top, { view: 'front', x: -(sh + .3), y: SP[1] + .2, rot: 14, flip: true, z: 0 }), shown: slSeen },
      piece('under-sleeve', 'Under sleeve', under, { cut: 2, pair: true, hidden: true, notes: ['The sleeve\'s back seam and inseam; the vent in the back seam'], place: { view: 'front', x: sh, y: SP[1], z: -1 } }));
    trims.push({ item: 'Sleeve buttons', spec: '20L (12.5 mm) horn or corozo, kissing', qty: 8, where: 'Four on each cuff vent' });
  }
  // from the back: the sleeves and the collar's fall
  for (const q of pieces.filter(x => x.id === 'top-sleeve' || x.id === 'top-sleeve-2')) pieces.push({ ...q, id: `${q.id}-back`, of: 'top-sleeve', cut: 0, twin: true, copy: true, place: { ...q.place, view: 'back', x: -q.place.x } });
  { const cb = [[-nw - .9, -.2], ...tail(cubic([-nw - .9, -.2], [-nw * .4, -.9], [nw * .4, -.9], [nw + .9, -.2])), [nw + .6, 1.6], ...tail(cubic([nw + .6, 1.6], [nw * .3, 2.1], [-nw * .3, 2.1], [-nw - .6, 1.6]))];
    pieces.push({ ...piece('collar-back', 'Collar', cb, { cut: 0, shown: cb, place: { view: 'back', x: 0, y: 0, z: 5 } }), twin: true, copy: true, of: 'top-collar' }); }
  // pockets: a chest welt (left breast) and two flap pockets (jetted, with flaps), as the product shows them
  const welt = [[0, 0], [4.25, -.5], [4.25, .5], [0, 1]], flap = [[0, 0], [6.25, 0], [6.25, 2.25], [0, 2.25]];
  pieces.push(piece('chest-welt', 'Chest welt', rect(4.25, 2.25), { cut: 1, notes: ['Left breast, angled ½ in up to the side; 1 in finished'], shown: welt, place: { view: 'front', x: half * .32, y: UA[1] - 1.2, z: 3 } }),
    ...((K.pockets || []).includes('patch-hip') ? (() => { const pp = [[0, 0], [6.75, 0], [6.75, 7], [.25, 7.25], [0, 7]]; // patch pockets, as a sport coat's or a chore coat's
      return [piece('patch-hip', 'Patch pocket', rect(7.75, 8.25), { cut: 2, pair: true, notes: ['Self, the top turned 1¼ in and topstitched; the corners rounded'], shown: pp, place: { view: 'front', x: half * .2, y: waistY + 2.4, z: 3 } }),
        { ...twin('patch-hip-2', 'Patch pocket', pp, { view: 'front', x: -half * .2 - 6.75, y: waistY + 2.4, z: 3 }), shown: pp }]; })()
    : [piece('flap', 'Pocket flap', rect(6.25, 2.5), { cut: 4, pair: true, notes: ['Self and lining; over a jetted pocket, set level at the waist'], shown: flap, place: { view: 'front', x: half * .2, y: waistY + 3.2, z: 3 } }),
      { ...twin('flap-2', 'Pocket flap', flap, { view: 'front', x: -half * .2 - 6.25, y: waistY + 3.2, z: 3 }), shown: flap }]),
    piece('pocket-bag', 'Pocket bag', rect(7.5, 15), { fabric: 'pocketing', cut: 6, hidden: true, notes: ['Two to each flap pocket, two for the chest welt'], place: { view: 'front', x: half * .3, y: waistY + 3, z: -3 } }));
  // a belt (a trench): with its loops and buckle, at the waist
  if (K.belt) { const bl = r8(m.chest * 2 + 16), band = [[-half - .6, 0], [half + .6, 0], [half + .6, 1.75], [-half - .6, 1.75]];
    pieces.push(piece('belt', 'Belt', rect(bl, 4), { cut: 1, notes: ['Folded to 1¾ in, fused, edge-stitched; a pointed end'], shown: band, place: { view: 'front', x: 0, y: waistY - .9, z: 7 } }), { ...piece('belt-back', 'Belt', rect(bl, 4), { cut: 0, shown: band, place: { view: 'back', x: 0, y: waistY - .9, z: 7 } }), of: 'belt', twin: true, copy: true },
      piece('belt-loop', 'Belt loop', rect(1.5, 3.5), { cut: 5, notes: ['Folded in four, edge-stitched; at the side seams and the back'], hidden: true, place: { view: 'front', x: half - 1, y: waistY, z: -1 } }));
    trims.push({ item: 'Buckle', spec: '1¾ in, covered or metal, with prong', qty: 1, where: 'Belt' }); }
  // the buttons as the front shows them
  const btn = [[-.35, 0], [0, -.35], [.35, 0], [0, .35]], rows = dbl ? [breakY + .5, breakY + 3.5, breakY + 6.5] : [breakY + .25, breakY + 4.75], cols = dbl ? [ext - .9, -(ext - .9)] : [-0];
  let n = 0; for (const y of rows) for (const x of cols) pieces.push({ ...piece(`button-${++n}`, 'Button', btn, { cut: 0, shown: btn, place: { view: 'front', x, y, z: 6 } }), twin: true, copy: true, of: 'front' });
  // a zip front (a biker): an asymmetric zip from the hem to under the lapel, the lapel snapped down; otherwise buttons
  trims.push(K.opening === 'zip' ? { item: 'Front zip', spec: `#8 metal, separating, ${Math.round(L - breakY + 4)} in${/biker|moto/.test(String(o.template || '')) ? ', set 3 in off the centre front (asymmetric)' : ''}`, qty: 1, where: 'Front edge, under the lapel; lapel snaps to hold it open' }
    : { item: 'Front buttons', spec: `${dbl ? '24L' : '32L'} (${dbl ? '15' : '20'} mm) horn or corozo, four-hole`, qty: dbl ? 6 : 2, where: dbl ? 'Two columns of three; the middle pair fastens, the top pair is for show' : 'Two, the top one fastens' },
    { item: 'Chest canvas', spec: 'Hair canvas with a felt chest piece, floating', qty: 2, where: 'Fronts' }, { item: 'Fusing', spec: 'Lightweight weft fusible', qty: 'Fronts, facings, top collar, flaps, welts', where: 'Throughout' },
    { item: 'Shoulder pads', spec: `${K.sleeve === 'drop' ? '¼' : '½'} in, set-in`, qty: 2, where: 'Shoulders' }, { item: 'Bridle tape', spec: '¼ in cotton tape', qty: `${r8(Math.hypot(B[0] - N0[0], B[1] - N0[1]) * 2)} in`, where: 'Along each roll line' });
  // the lining: front (less the facing), back with a pleat, sleeves
  pieces.push(piece('front-lining', 'Front lining', [[2.2, breakY + 2], ...tail(cubic(N0, [nw + 1.2, .3], [nw + 1.4, .6], [nw + 1.6, .8])).map(([x, y]) => [x + .2, y]), [SP[0], SP[1]], ...tail(aF), [sideX, L - .5], [1.4, L - .5]], { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['Bagged; an inside welt pocket on each side'], place: { view: 'front', x: 0, y: 0, z: -4 } }),
    piece('back-lining', 'Back lining', back.map(([x, y]) => [x + (x < .1 ? -.5 : 0), y]), { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['1 in pleat at the centre back'], place: { view: 'back', x: 0, y: 0, z: -4 } }),
    ...(() => { // the sleeve lining cut from the two sleeves themselves: the under sleeve's cap raised ½ in for reach, both ½ in longer for a jump pleat at the cuff
      const ts = pieces.find(q => q.id === 'top-sleeve'), us = pieces.find(q => q.id === 'under-sleeve'); if (!ts || !us) return [];
      const longer = (P, dy = 0) => { const b = boundsOf(P), mid = (b.y0 + b.y1) / 2; return P.map(([x, y]) => [x, y > mid ? y + .5 : y - dy]); };
      return [piece('sleeve-lining', 'Top sleeve lining', longer(ts.sew), { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['½ in longer than the top sleeve: a jump pleat at the cuff'], place: { ...ts.place, z: -4 } }),
        piece('under-sleeve-lining', 'Under sleeve lining', longer(us.sew, .5), { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['Its cap raised ½ in for reach; ½ in longer for the jump pleat', 'One sleeve-lining seam left open 6 in to bag the jacket through'], place: { ...us.place, z: -4 } })]; })());
  trims.push({ item: 'Lining', spec: 'Bemberg cupro or viscose twill', qty: `${r8(m.length / 36 * 2 + .4)} yd`, where: 'Body and sleeves' });
  // the block, labelled for the construction check (src/lab-pattern-check.js): the front, the side body, the back and the two-piece sleeve
  {
    pieces.block = { tailored: true, ua: [UA[0], UA[1] + .9], // the underarm: the bottom of the armhole, under the side body's top
      front: { sew: tidy(frontSew), at: { n0: N0, sp: SP, aEnd: aEnd || UA, sideW: [sideX, waistY], sideH: [sideX - .2, L + .35] } },
      side: { sew: tidy(pieces.find(q => q.id === 'side-body').sew.map(([x, y]) => [x, y + UA[1]])), at: { f0: [0, a0], b0: [sbW, yb], bH: [sbW - .1, L + .3], fH: [.2, L + .35] } },
      back: { sew: tidy(pieces.find(q => q.id === 'back').sew), at: { nk: [nw, 0], sp: SPb, ua: [backX, yb], h: [backX - .1, L + .35] } } };
    const ts = pieces.find(q => q.id === 'top-sleeve'), us = pieces.find(q => q.id === 'under-sleeve'); if (ts && us) Object.assign(pieces.block, { top: { sew: ts.sew, at: TS_AT }, under: { sew: us.sew, at: US_AT } }); }
  pieces.trims = trims; return pieces;
}
// a bikini: a top (two triangle cups, or a bandeau, or a scoop on an underband) and a brief, in one set. y from the top of the strap; the
// top sits in its upper two fifths, the brief from about three fifths down (higher for a high-waisted brief); x from the centre front
function bikiniPieces(m, o) {
  const tpl = String(o.template || ''), half = m.chest / 2, L = m.length, trims = [], pieces = [];
  const band = /bandeau|tube/.test(tpl), tri = !band && /triangle|string|halter|plunge/.test(tpl), high = /high-waist|boy-short/.test(tpl), boy = /boy-short/.test(tpl), halter = /halter/.test(tpl);
  const yb = L * .4, yt = high ? L * .52 : L * .62, crotch = 1.2, W = half * (high ? .92 : .96);
  // the top
  if (band) { const T = [[-half, yb - 5.25], [half, yb - 5.25], [half, yb], [-half, yb]];
    pieces.push(piece('bandeau', 'Bandeau', T.map(([x, y]) => [x, y - (yb - 5.25)]), { cut: 2, fold: true, notes: ['Self and lining, the centre front gathered 1 in (or a twist)'], shown: T, place: { view: 'front', x: 0, y: 0, z: 2 } })); }
  else { const cw = half * .96, cx = half * .5, ch = Math.max(yb - 1.5, 4.5) * (tri ? 1 : .85), cup = tri ? [[cx - cw / 2, yb - .75], [cx + cw / 2, yb - .75], [cx + .3, yb - .75 - ch]] : [[cx - cw / 2, yb - .75], [cx + cw / 2, yb - .75], [cx + cw / 2 - .4, yb - .75 - ch * .7], [cx, yb - .75 - ch], [cx - cw / 2 + .2, yb - .75 - ch * .55]];
    const b = boundsOf(cup), sew = cup.map(([x, y]) => [x - b.x0, y - b.y0]);
    pieces.push(piece('cup', tri ? 'Triangle cup' : 'Cup', sew, { cut: 2, pair: true, notes: ['Self and lining, the lower edge gathered ½ in onto the underband'], shown: cup, place: { view: 'front', x: 0, y: 0, z: 2 } }), { ...piece('cup-2', 'Cup', sew, { cut: 0, shown: cup, place: { view: 'front', x: 0, y: 0, flip: true, z: 2 } }), twin: true });
    const ub = [[-half, yb - .75], [half, yb - .75], [half, yb], [-half, yb]];
    pieces.push(piece('underband', 'Underband', rect(r8(m.chest * 2 * .9), 1.75), { cut: 1, notes: ['Folded over ⅜ in swim elastic, its ends tied (or a hook clasp at the back)'], shown: ub, place: { view: 'front', x: 0, y: 0, z: 3 } }));
    const ap = tri ? [cx + .3, yb - .75 - ch] : [cx, yb - .75 - ch], top = halter ? [.6, 0] : [Math.max(m.neckWidth / 2 + .6, ap[0] - .6), 0], w = .15;
    const st = [[ap[0] - w, ap[1]], [top[0] - w, top[1]], [top[0] + w, top[1]], [ap[0] + w, ap[1]]];
    pieces.push(piece('tie', halter ? 'Halter tie' : 'Strap', rect(1, 24), { cut: 2, notes: [halter ? 'Rouleau, tied at the neck' : 'Rouleau, tied (or slid) at the back'], shown: st, place: { view: 'front', x: 0, y: 0, z: 3 } }), { ...piece('tie-2', 'Strap', rect(1, 24), { cut: 0, shown: st, place: { view: 'front', x: 0, y: 0, flip: true, z: 3 } }), twin: true }); }
  // the brief: its top edge across the hips, the legs cut up to a narrow crotch (a boy short: straight down)
  const legs = boy ? [[W, L - .5], [W - .6, L], [crotch + 1.5, L]] : [[W, yt + 1.5], [W * .86, yt + (L - yt) * .5], [crotch + 1.1, L - 1.1], [crotch, L]];
  const halfB = [[0, yt], [W, yt], ...legs, [0, L]], whole = [...halfB, ...halfB.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  pieces.push(piece('brief-front', 'Brief front', whole.map(([x, y]) => [x, y - yt]), { cut: 1, fold: true, notes: ['Self and lining'], shown: whole, place: { view: 'front', x: 0, y: 0, z: 1 } }));
  // the back fuller through the seat only: its side seam and its crotch the front's, so they sew to them (src/lab-pattern-check.js walks them)
  const seat = y => y > yt + (boy ? .6 : 1.6) && y < L - .6 ? 1 + .25 * Math.sin(Math.PI * (y - yt - 1.6) / Math.max(L - yt - 2.2, 1)) : 1, bk = whole.map(([x, y]) => [x * Math.max(seat(y), 1), y]);
  const sideBot = boy ? [W, L - .5] : [W, yt + 1.5], cx = boy ? crotch + 1.5 : crotch;
  pieces.block = { brief: { front: { sew: tidy(whole), at: { sideTop: [W, yt], sideBot, crotchR: [cx, L], crotchL: [-cx, L] } }, back: { sew: tidy(bk), at: { sideTop: [W, yt], sideBot, crotchR: [cx, L], crotchL: [-cx, L] } } } };
  pieces.push(piece('brief-back', 'Brief back', bk.map(([x, y]) => [x, y - yt]), { cut: 1, fold: true, notes: ['Self and lining; fuller seat'], shown: bk, place: { view: 'back', x: 0, y: 0, z: 1 } }));
  if (o.K?.belt) { const bl = [[-W - .3, yt + .2], [W + .3, yt + .2], [W + .3, yt + 1.2], [-W - .3, yt + 1.2]]; // a belt round the brief's waist, its buckle at the front
    pieces.push(piece('belt', 'Belt', rect(1.75, r8(m.chest * 1.9)), { cut: 1, notes: ['Self, turned to 1 in, through a ring buckle at the centre front'], shown: bl, place: { view: 'front', x: 0, y: 0, z: 3 } }));
    trims.push({ item: 'Ring buckle', spec: '1 in, metal or resin', qty: 1, where: 'Centre front of the belt' }); }
  pieces.push({ ...piece('lining', 'Lining (top and brief)', whole.map(([x, y]) => [x, y - yt]), { fabric: 'lining', cut: 2, hidden: true, notes: ['Swim lining, the brief and each cup the same shapes'], place: { view: 'front', x: 0, y: 0, z: -2 } }) });
  trims.push({ item: 'Swim elastic', spec: '⅜ in chlorine-resistant elastic, the legs and the waist at 85%, the cup edges at 90%', qty: 'as cut', where: 'Every edge, turned and coverstitched' }, { item: 'Cups (optional)', spec: 'Removable foam cups, size M', qty: 1, where: 'Pocketed in the lining' });
  pieces.trims = trims; return pieces;
}
// a sleeve's cap, half its width b across at the cap's height ch, solved so the whole cap (both halves) is the armhole round (front and back,
// 2A) plus its ease: ¾ in into a set-in woven armhole, ¼ in for a knit or a dropped shoulder (src/lab-pattern-check.js walks it)
const KNIT_TOPS = ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'tank', 'bodysuit', 'swimsuit', 'bikini', 'bra'];
function fitCap(A, ch, ease) { let b = Math.sqrt(Math.max(((A + .25) / 1.04) ** 2 - ch * ch, 4)); for (let k = 0; k < 6; k++) { const L = 2 * lenOf(cubic([0, 0], [b * .45, 0], [b * .72, ch * .55], [b, ch])); b *= (2 * A + ease) / L; } return Math.max(b, 2); }
function topPieces(S, m, o, style) {
  if ((style === 'jacket' || style === 'coat') && o.K?.collar === 'lapel') return tailoredPieces(S, m, o, style, o.K);
  if (style === 'bikini') return bikiniPieces(m, o);
  // how it is built (src/lab-construction.js): what was set, what the sketch's name says, or the style's own
  const K = o.K || {}, pk = K.pockets || [], has = t => pk.includes(t), count = t => pk.filter(x => x === t).length;
  o = { ...o, drop: Boolean(o.drop || K.sleeve === 'drop') };
  const hood = K.hood ?? Boolean(S.hood), zip = K.opening ? K.opening === 'zip' : Boolean(S.zip), raglan = K.sleeve === 'raglan' && m.sleeve > 0;
  const buttons = K.opening === 'buttons' || K.opening === 'snaps', trims = [];
  // what the sketch draws that changes the cut: a shearling collar, hem band and cuffs (an aviator), a stand or a shirt collar on a jacket
  const tpl = String(o.template || ''), outer = ['jacket', 'coat', 'vest'].includes(style), shearling = K.collar === 'shearling' && outer;
  const jacketCollar = shearling ? 'shearling' : outer && ['stand', 'funnel'].includes(K.collar) ? 'stand' : outer && K.collar === 'shirt' ? 'shirt' : outer && K.collar === 'lapel' ? 'lapel' : null;
  let SLV = null; // where the sleeve sits on the front, so its cuff is drawn on its end
  let SLEEVE = null, WELT = null; // the sleeve as cut ({ sew, b, ch, Ls }): its lining is drafted from it
  const half = m.chest / 2, nw = m.neckWidth / 2, drop = o.drop ? 2.25 : 0, sh = Math.max(m.shoulder / 2, nw + 2), slope = o.drop ? .75 : 1.25;
  const L = m.length - (m.hemRib || 0), SP = [sh, slope], UA = [half, slope + m.armhole + drop * .3], depth = UA[1] - SP[1];
  const neck = nd => cubic([0, nd], [nw * .55, nd], [nw, nd * .65], [nw, 0]);
  const armhole = cubic(SP, [SP[0] - .35, SP[1] + depth * .5], [UA[0] - 1.1, UA[1] - .1], UA);
  // half the body, from the centre-front neck round to the centre-front hem; the whole body is it and its mirror
  // a raglan seam runs from a point on the neckline, about a quarter of the way in from the shoulder, down to the underarm
  const ragOf = nd => { const nk = neck(nd), i = Math.max(1, Math.round((nk.length - 1) * .7)), R = nk[i]; return { nk: nk.slice(0, i + 1), R, line: cubic(R, [R[0] + (UA[0] - R[0]) * .3, R[1] + (UA[1] - R[1]) * .2], [UA[0] - 1.7, UA[1] - 2.4], UA) }; };
  // the side seam from the underarm to the hem: straight down, or (a bodysuit, a dress) through the widths its sketch draws, the leg of a
  // bodysuit cut round to its crotch (bodyProfile)
  // the sketch's side seam, anchored at the chest: its width 1 in below the armhole is the chest the piece is specified at, the rest in proportion
  const prof0 = bodyProfile(style, o.template), fc = 1 / Math.max(m.length - (m.hemRib || 0) - (slope + m.armhole + (o.drop ? 2.25 : 0) * .3), 4), rc = prof0 ? (() => { const i = prof0.findIndex(([f]) => f >= fc); if (i <= 0) return 1; const [f0, r0] = prof0[i - 1], [f1, r1] = prof0[i]; return r0 + (r1 - r0) * (fc - f0) / (f1 - f0 || 1); })() : 1;
  const prof = prof0 ? prof0.map(([f, r], i) => [f, i ? r / rc : 1]) : null, legCut = style === 'bodysuit' || style === 'swimsuit', crotch = legCut ? Math.max(half * (prof0?.at(-1)?.[1] ?? .22), 1.1) : 0;
  let SIDE = prof ? smoothThrough(prof.map(([f, r], i) => [i === prof.length - 1 && crotch ? crotch : half * r, UA[1] + (L - UA[1]) * f])).slice(1) : [[half, L]];
  if (prof) { // measured where the chest is (1 in below the underarm) and scaled so it is the chest specified, the sketch's shape kept
    const run = [[half, UA[1]], ...SIDE], y = UA[1] + 1, i = run.findIndex(([, yy]) => yy >= y), xc = i > 0 ? run[i - 1][0] + (run[i][0] - run[i - 1][0]) * (y - run[i - 1][1]) / ((run[i][1] - run[i - 1][1]) || 1) : half;
    const k = half / (xc || half); SIDE = SIDE.map(([x, yy], j) => [j === SIDE.length - 1 && crotch ? x : x * k, yy]); }
  // the top edge of a piece with no shoulders: strapless (a bandeau, a bustier, a tube) straight across, its length measured from that edge;
  // on straps (a cami, a slip) above the bust, dipping to the centre front, the straps sewn on at the cups
  const topCut = m.sleeve > 0 ? null : /strapless|tube|bandeau/.test(tpl) || (/bustier|corset/.test(tpl) && style !== 'cami') ? 'strapless' : style === 'cami' || /cami|slip/.test(tpl) ? 'straps' : null;
  const topY = topCut === 'straps' ? Math.max(UA[1] - 4.5, 2.5) : .5, dip = topCut === 'straps' ? 1.25 : .5; // strapless: its length is taken from the top edge
  const halfOf = (nd, ext = 0) => { if (topCut) return [[-ext, topY + dip], [half * .55, topY], [half, Math.min(topY + .75, UA[1])], ...(topY + .75 < UA[1] ? [[half, UA[1]]] : []), ...SIDE, [-ext, L]];
    if (raglan) { const r = ragOf(nd); return [[-ext, nd], ...r.nk, ...tail(r.line), ...SIDE, [-ext, L]]; } return [[-ext, nd], ...neck(nd), [SP[0], SP[1]], ...tail(armhole), ...SIDE, [-ext, L]]; };
  const whole = nd => { const h = halfOf(nd); return [...h, ...mirrorX(h).reverse()]; };
  const pieces = [], open = zip || buttons || ['shirt', 'shirtss', 'jacket', 'coat', 'vest'].includes(style);
  const ext = ['shirt', 'shirtss', 'coat'].includes(style) || (buttons && outer) ? .75 : 0; // the button stand past the centre front
  // the block the garment is built from, before any detail divides it (a yoke, a panel, a pocket): one side of the front and of the back, with
  // the corners its seams run between, for the construction check (src/lab-pattern-check.js) to walk the seams and measure the garment
  const BLOCK = {}, lmark = (nd, e) => ({ cfNeck: [-e, nd], hps: [nw, 0], sp: [SP[0], SP[1]], ua: [UA[0], UA[1]], hemSide: SIDE.at(-1), cfHem: [-e, L] });
  if (!raglan && !topCut) { BLOCK.front = { sew: tidy(halfOf(m.neckDropFront, ext)), at: lmark(m.neckDropFront, ext), ext }; BLOCK.back = { sew: tidy(halfOf(m.neckDropBack, 0)), at: lmark(m.neckDropBack, 0), ext: 0 }; }
  // a raglan body: the neck runs to the raglan point, the raglan seam to the underarm; a body with no shoulders: its top edge to the side seam
  if (raglan && !topCut) { const rm = (nd, e) => ({ cfNeck: [-e, nd], rag: ragOf(nd).R, ua: [UA[0], UA[1]], hemSide: SIDE.at(-1), cfHem: [-e, L] });
    BLOCK.front = { sew: tidy(halfOf(m.neckDropFront, ext)), at: rm(m.neckDropFront, ext), ext, raglan: true }; BLOCK.back = { sew: tidy(halfOf(m.neckDropBack, 0)), at: rm(m.neckDropBack, 0), ext: 0, raglan: true }; }
  if (topCut) { const tm = e => ({ cfTop: [-e, topY + dip], topSide: [half, Math.min(topY + .75, UA[1])], hemSide: SIDE.at(-1), cfHem: [-e, L] });
    BLOCK.front = { sew: tidy(halfOf(m.neckDropFront, ext)), at: tm(ext), ext, topCut }; BLOCK.back = { sew: tidy(halfOf(m.neckDropBack, 0)), at: tm(0), ext: 0, topCut }; }
  if (open) {
    const sew = halfOf(m.neckDropFront, ext), note = ext ? `Button stand ${ext} in past the centre front, fused` : zip ? 'Zip set at the centre front' : 'Opens at the centre front';
    pieces.push(piece('front', 'Front', sew, { cut: 2, pair: true, notches: [[half, UA[1] + 2]], notes: [note], place: { view: 'front', x: 0, y: 0 } }), twin('front-2', 'Front', sew, { view: 'front', flip: true }));
  } else pieces.push(piece('front', 'Front', whole(m.neckDropFront), { cut: 1, fold: true, notches: [[half, UA[1] + 2], [-half, UA[1] + 2]], place: { view: 'front' } }));
  if (style === 'shirt' || style === 'shirtss' || (K.yoke?.back && !raglan)) {
    const yokeY = SP[1] + 2.75, nb = neck(m.neckDropBack);
    const lower = whole(m.neckDropBack).map(([x, y]) => [x, Math.max(y, yokeY)]);
    pieces.push(piece('back', 'Back', lower, { cut: 1, fold: true, notes: [style.startsWith('shirt') ? 'Box pleat or two side pleats at the yoke seam' : 'Seamed to the back yoke, topstitched'], place: { view: 'back' } }));
    pieces.push(piece('yoke', 'Back yoke', [[-SP[0], SP[1]], ...mirrorX(nb).reverse(), ...tail(nb), [SP[0], SP[1]], [SP[0] + .1, yokeY], [-SP[0] - .1, yokeY]], { cut: 2, fold: true, notes: ['Inside and outside yoke'], place: { view: 'back', z: 1 } }));
  } else pieces.push(piece('back', 'Back', whole(m.neckDropBack), { cut: 1, fold: true, notches: [[half, UA[1] + 2], [-half, UA[1] + 2], [half, UA[1] + 2.5]], place: { view: 'back' } }));
  if (K.yoke?.front && !raglan) {
    // a front yoke: the front cut across 3 in below the shoulder point (a western's pointed), the yoke a pair (or on the fold for a closed front)
    const fy = SP[1] + 3, west = /western/.test(tpl), cutY = (x, y) => Math.max(y, fy + (west ? Math.max(0, 1.6 - Math.abs(x - half * .45) * .45) : 0));
    for (const q of pieces.filter(x => x.id === 'front' || x.id === 'front-2')) q.sew = q.sew.map(([x, y]) => [x, cutY(x, y)]);
    const nf = neck(m.neckDropFront), ext0 = ext;
    // a neckline deeper than the yoke (a V, a vest's scoop): the yoke starts where the neck crosses its seam, not at the centre front
    const deep = m.neckDropFront > fy, cross = deep ? (() => { for (let i = 1; i < nf.length; i++) { const [a, b] = [nf[i - 1], nf[i]]; if ((a[1] - fy) * (b[1] - fy) <= 0 && a[1] !== b[1]) { const t = (fy - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, fy]; } } return null; })() : null;
    const yk = cross ? [cross, ...nf.filter(([, y]) => y < fy), [SP[0], SP[1]], [SP[0] + .1, fy], ...(west ? [[half * .45, fy + 1.6]] : [])]
      : [[-ext0, Math.min(m.neckDropFront, fy)], ...nf.filter(([, y]) => y <= fy), [SP[0], SP[1]], [SP[0] + .1, fy], ...(west ? [[half * .45, fy + 1.6]] : []), [-ext0, fy]];
    pieces.push(piece('front-yoke', 'Front yoke', open ? yk : [...yk, ...mirrorX(yk).reverse()], { cut: open ? 2 : 1, ...(open ? { pair: true } : { fold: true }), notes: [west ? 'Pointed western yoke, topstitched; piping optional' : 'Seamed to the front, topstitched'], place: { view: 'front', x: 0, y: 0, z: 1 } }),
      ...(open ? [twin('front-yoke-2', 'Front yoke', yk, { view: 'front', flip: true, z: 1 })] : []));
  }
  // the sleeve: its cap eases into the armhole; a dropped shoulder has a flatter cap
  if (m.sleeve > 0) {
    const A = lenOf(armhole), ch = o.drop ? Math.max(1.5, depth * .28) : Math.max(2.5, depth * .55), b = fitCap(A, ch, o.drop || KNIT_TOPS.includes(style) ? .25 : .75), Ls = Math.max(m.sleeve - (m.cuffRib || 0), 2), so = Math.min(Math.max(m.sleeveOpening, 2), b);
    // an aviator's sleeve is full: it keeps most of its width to the wrist and is gathered into a narrower cuff, its sides bowing out
    const full = shearling && m.cuffRib > 0, soB = full ? Math.max(so, b * .74) : so;
    const capR = cubic([0, 0], [b * .45, 0], [b * .72, ch * .55], [b, ch]), side = full ? tail(cubic([b, ch], [b * 1.04, ch + (Ls - ch) * .45], [soB * 1.12, Ls * .86], [soB, Ls])) : [[so, Ls]];
    let sew = [...mirrorX(capR).reverse(), ...tail(capR), ...side, ...mirrorX(side).reverse()];
    if (raglan) { const rf = ragOf(m.neckDropFront), rb = ragOf(m.neckDropBack), tf = lenOf(neck(m.neckDropFront)) - lenOf(rf.nk), tb = lenOf(neck(m.neckDropBack)) - lenOf(rb.nk);
      // each raglan curve solved to the length of the body's raglan seam it is sewn to (front Lf, back Lb), and the hem set so the front and
      // the back underarm seams are one length (src/lab-pattern-check.js walks them)
      const Lf = lenOf(rf.line), Lb = lenOf(rb.line), frOf = h => cubic([tf, 0], [tf + (b - tf) * .55, h * .2], [b - .4, h * .75], [b, h]), bkOf = h => cubic([-tb, 0], [-tb - (b - tb) * .55, h * .2], [-b + .4, h * .75], [-b, h]);
      const solve = (mk, L, h0) => { let h = h0; for (let k = 0; k < 8; k++) h = Math.max(2, h + (L - lenOf(mk(h)))); return h; };
      const hf = solve(frOf, Lf, Math.sqrt(Math.max(Lf ** 2 - (b - tf) ** 2, 4))), hb = solve(bkOf, Lb, Math.sqrt(Math.max(Lb ** 2 - (b - tb) ** 2, 4)));
      const Lu = Math.max(Ls - ch, 4) + Math.max(hf, hb), seamF = Math.hypot(b - so, Lu - hf), LuB = hb + Math.sqrt(Math.max(seamF ** 2 - (b - so) ** 2, 1));
      const fr = frOf(hf), bk = bkOf(hb);
      sew = [[-tb, 0], [tf, 0], ...tail(fr), [so, Lu], [-so, LuB], ...bk.slice().reverse().slice(0, -1)];
      BLOCK.sleeve = { sew: tidy(sew), raglan: true, at: { neckB: [-tb, 0], neckF: [tf, 0], uaF: [b, hf], hemF: [so, Lu], hemB: [-so, LuB], uaB: [-b, hb] } }; }
    SLEEVE = { sew, b, ch, Ls };
    if (!raglan) { const hem = side[side.length - 1]; BLOCK.sleeve = { sew: tidy(sew), at: { uaB: [-b, ch], top: [0, 0], uaF: [b, ch], hemF: [hem[0], hem[1]], hemB: [-hem[0], hem[1]] } }; }
    const ang = (o.drop ? 62 : m.sleeve > 12 ? 62 : 24) * Math.PI / 180;
    // where the sleeve sits on the front flat: the top of the cap at the shoulder point, the underarm corner at the underarm, so it hangs from
    // the armhole the way the flats draw it (of the two ways round, the one whose cuff points out and down)
    const tgt = Math.atan2(UA[1] - SP[1], UA[0] - SP[0]), turn = sx => { const a = tgt - Math.atan2(ch, sx * b), c = Math.cos(a), sn = Math.sin(a); return { a, end: [-Ls * sn, Ls * c] }; };
    const best = [turn(1), turn(-1)].filter(t => t.end[0] > 0 && t.end[1] > -1).sort((x, y) => Math.abs(Math.atan2(x.end[1], x.end[0]) - ang) - Math.abs(Math.atan2(y.end[1], y.end[0]) - ang))[0] || turn(1), rot = best.a * 180 / Math.PI;
    // on the product the sleeve is seen as a flat shows it: folded along its length, so half its width, hung from the same two points (the top
    // of the cap at the shoulder, the underarm at the underarm). Its outline is turned in its own frame so the piece's placement still holds
    const fold = sew.map(([x, y]) => [x * .5, y]), turnF = sx => tgt - Math.atan2(ch, sx * b * .5);
    const aF = [turnF(1), turnF(-1)].sort((x, y) => Math.abs(x - best.a) - Math.abs(y - best.a))[0], dA = aF - best.a, cD = Math.cos(dA), sD = Math.sin(dA);
    const shownS = fold.map(([x, y]) => [x * cD - y * sD, x * sD + y * cD]);
    SLV = { rot: aF * 180 / Math.PI, a: aF, Ls, so: full ? Math.min(soB * .5, Math.max(m.sleeveOpening / 2, 1.5)) : so * .5, x: SP[0], y: SP[1], full };
    let shownP = shownS, placeR = { view: 'front', x: SP[0], y: SP[1], rot, z: -1 }, placeL = { view: 'front', x: -SP[0], y: SP[1], rot: -rot, flip: true, z: -1 };
    if (m.sleeve > 12 || m.sleeve > 0 && !raglan) {
      // a long sleeve, seen as the flats draw it: hanging close to the body, not held out. Laid flat, a set-in sleeve pinned at both the shoulder
      // point and the underarm can only sit splayed out; on a flat the cap rounds over the shoulder and the sleeve falls nearly straight, its
      // inner edge from the underarm down beside the body, its end square to it. Drawn in the front's own inches (the right sleeve; the left
      // is its mirror); the cut piece is unchanged
      if (!full) {
        // as a flat draws it: the outer edge straight from the shoulder point at the sleeve's angle, its full length; the hem straight across,
        // the opening wide; the inner edge back to the underarm. A long sleeve hangs just clear of the body (the angle opened until its inner
        // corner is outside the side seam), a short one held out at the angle its sketch draws. The cut piece is unchanged
        const short = m.sleeve <= 12, wEnd = Math.max(m.sleeveOpening, 3.25);
        let al = (Number.isFinite(o.sleeveAngle) ? o.sleeveAngle : short ? 45 : 6) * Math.PI / 180;
        const at = a => { const d = [Math.sin(a), Math.cos(a)], e = [-Math.cos(a), Math.sin(a)], O = [SP[0] + d[0] * Ls, SP[1] + d[1] * Ls]; return { d, O, I: [O[0] + e[0] * wEnd, O[1] + e[1] * wEnd] }; };
        while (al < 1.3 && at(al).I[0] < UA[0] + .25) al += .01;
        const { d, O, I } = at(al), bow = short ? .1 : .25, mid = (P, Q, k) => [(P[0] + Q[0]) / 2 + d[1] * k, (P[1] + Q[1]) / 2 - d[0] * k];
        const outer = cubic(SP, mid(SP, O, bow * .6), mid(O, SP, bow * .6), O), inner = cubic(I, mid(I, UA, -bow * .4), mid(UA, I, -bow * .4), UA), seam = armhole.slice().reverse();
        shownP = [...outer, ...tail(inner), ...tail(seam)].map(([x, y]) => [x - SP[0], y - SP[1]]);
        placeR = { view: 'front', x: SP[0], y: SP[1], rot: 0, z: -1 }; placeL = { view: 'front', x: -SP[0], y: SP[1], rot: 0, flip: true, z: -1 };
        SLV = { hang: true, flat: true, O, I, d, rot: -al * 180 / Math.PI, end: [(O[0] + I[0]) / 2, (O[1] + I[1]) / 2], so: wEnd / 2, Ls, full };
      } else {
      const short = m.sleeve <= 12, al = (Number.isFinite(o.sleeveAngle) && !full ? o.sleeveAngle : full ? 7 : short ? 60 : 10) * Math.PI / 180 /* the angle the sketch draws the sleeve at (traced: src/lab-template-proportions.js) */, d = [Math.sin(al), Math.cos(al)], n = [Math.cos(al), -Math.sin(al)];
        const wTop = b * (full ? .42 : .38), wEnd = full ? Math.max(m.sleeveOpening * 1.12, 4) : Math.max(m.sleeveOpening, 3.25), Li = short ? Math.max(Ls - ch * .55, 1.5) : Math.max(Ls - ch, 4);
        const I = [UA[0] + d[0] * Li, UA[1] + d[1] * Li], O = [I[0] + n[0] * wEnd, I[1] + n[1] * wEnd], T = [UA[0] + wTop, UA[1] - depth * .08];
        const bow = full ? 1.6 : .35, len = Math.hypot(O[0] - T[0], O[1] - T[1]), at = (P, k, off) => [P[0] + d[0] * k + n[0] * off, P[1] + d[1] * k + n[1] * off];
        const cap = cubic(SP, [SP[0] + wTop * .55, SP[1] - .25], [T[0] + .15, T[1] - depth * .5], T), outer = cubic(T, at(T, len * .38, bow), at(O, -len * .3, bow * (full ? .9 : .4)), O);
        const inner = cubic(I, at(I, -Li * .3, full ? -.35 : 0), at(UA, Li * .3, full ? -.25 : 0), UA), seam = armhole.slice().reverse();
        shownP = [...cap, ...tail(outer), ...tail(inner), ...tail(seam)].map(([x, y]) => [x - SP[0], y - SP[1]]);
        placeR = { view: 'front', x: SP[0], y: SP[1], rot: 0, z: -1 }; placeL = { view: 'front', x: -SP[0], y: SP[1], rot: 0, flip: true, z: -1 };
        SLV = { hang: true, rot: -al * 180 / Math.PI, end: [(O[0] + I[0]) / 2, (O[1] + I[1]) / 2], so: wEnd / 2, Ls, full };
      }
    }
    if (raglan) { // the shoulder the raglan sleeve takes, seen on the product beside the body's raglan seam (front and back)
      for (const [v, nd] of [['front', m.neckDropFront], ['back', m.neckDropBack]]) { const r = ragOf(nd), wedge = [...r.nk.slice(-1), ...tail(neck(nd).slice(r.nk.length - 1)), [SP[0], SP[1]], ...tail(armhole), ...tail(r.line.slice().reverse())];
        for (const sg of [1, -1]) pieces.push({ ...piece(`raglan-${v}${sg < 0 ? '-2' : ''}`, 'Raglan shoulder', wedge, { cut: 0, shown: wedge, place: { view: v, x: 0, y: 0, ...(sg < 0 ? { flip: true } : {}), z: -1 } }), of: 'sleeve', twin: true, copy: true }); } }
    pieces.push(piece('sleeve', raglan ? 'Raglan sleeve' : 'Sleeve', sew, { cut: 2, pair: true, shown: shownP, notches: raglan ? [[0, 0]] : [[b * .55, ch * .3], [-b * .5, ch * .35], [-b * .58, ch * .4], [0, 0]], notes: [raglan ? 'Raglan: the front seam (shorter) and the back seam run to the neck; a shoulder dart, 4½ in long and ¾ in wide, from the top notch (or cut in two along it)' : 'One notch to the front, two to the back; the top notch meets the shoulder seam', ...(full ? [`Full sleeve: gathered (or two pleats) from ${r8(soB * 2)} in into the cuff`] : [])], place: placeR }),
      { ...piece('sleeve-2', 'Sleeve', sew, { cut: 0, shown: shownP, place: placeL }), twin: true });
  }
  const neckLen = lenOf(neck(m.neckDropFront)) * 2 + lenOf(neck(m.neckDropBack)) * 2;
  if (m.neckRib && !hood && !jacketCollar && K.collar !== 'polo' && K.collar !== 'stand' && !['shirt', 'shirtss', 'polo', 'coat'].includes(style)) { const o1 = [...mirrorX(neck(m.neckDropFront)).reverse(), ...tail(neck(m.neckDropFront))], rb = m.neckRib, nd = m.neckDropFront, shown = [...o1, ...o1.slice().reverse().map(([x, y]) => [x * (nw - rb * .5) / nw, y * Math.max(nd - rb, .3) / nd])]; // inside the neckline, tapering out at the shoulders
    pieces.push(piece('neck-rib', 'Neck rib', rect(r8(neckLen * .86), m.neckRib * 2), { fabric: 'rib', shown, notes: [`Stretched about 14% onto the neckline (${r8(neckLen)} in), folded in half`], place: { view: 'front', x: 0, y: 0, z: 2 } })); }
  if (m.cuffRib) {
    const shirt = style === 'shirt', a = (m.sleeve > 12 || o.drop ? 62 : 24) * Math.PI / 180, cw = r8(m.sleeveOpening * 2 * (shirt ? 1.05 : .88)), chh = shirt ? m.cuffRib : m.cuffRib * 2;
    // on the product the cuff sits on the end of the sleeve, turned with it, at its finished height and the sleeve's width there
    const fab = shirt ? 'self' : shearling ? 'shearling' : 'rib', name = shirt ? 'Cuff' : shearling ? 'Shearling cuff' : 'Cuff rib';
    const sew = [[-cw / 2, 0], [cw / 2, 0], [cw / 2, chh], [-cw / 2, chh]], half2 = SLV ? SLV.so : cw / 2, shown = [[-half2 - .15, 0], [half2 + .15, 0], [half2 + .15, m.cuffRib], [-half2 - .15, m.cuffRib]];
    const end = sg => SLV?.hang ? { view: 'front', x: sg * SLV.end[0], y: SLV.end[1], rot: sg * SLV.rot, ...(sg < 0 ? { flip: true } : {}), z: 2 } : SLV ? { view: 'front', x: sg * (SLV.x - SLV.Ls * Math.sin(SLV.a)), y: SLV.y + SLV.Ls * Math.cos(SLV.a), rot: sg * SLV.rot, ...(sg < 0 ? { flip: true } : {}), z: 2 } : { view: 'front', x: sg * (SP[0] + Math.cos(a) * m.sleeve), y: SP[1] + Math.sin(a) * m.sleeve - m.cuffRib, z: 2 };
    // a flat sleeve: the cuff on its end, carrying on along it
    const cs = SLV?.flat ? [SLV.O, SLV.I, [SLV.I[0] + SLV.d[0] * m.cuffRib, SLV.I[1] + SLV.d[1] * m.cuffRib], [SLV.O[0] + SLV.d[0] * m.cuffRib, SLV.O[1] + SLV.d[1] * m.cuffRib]] : null;
    pieces.push(piece('cuff', name, sew, { fabric: fab, cut: shirt ? 4 : 2, shown: cs || shown, notes: [shirt ? 'Fused on the outer cuff' : shearling ? 'Shearling, pile out; the cut edge turned in at the sleeve seam' : 'Folded in half, stretched onto the sleeve'], place: cs ? { view: 'front', x: 0, y: 0, z: 2 } : end(1) }),
      { ...piece('cuff-2', name, sew, { cut: 0, shown: cs || shown, place: cs ? { view: 'front', x: 0, y: 0, flip: true, z: 2 } : end(-1), fabric: fab }), twin: true });
  }
  // the band is cut as one strip round the whole hem; on the product only the front's share of it shows
  if (m.hemRib) {
    const band = shearling ? rect(r8(m.chest * 2 * .96), m.hemRib) : rect(r8(m.chest * 2 * .88), m.hemRib * 2), w = band[1][0];
    pieces.push(piece('hem-rib', shearling ? 'Shearling hem band' : 'Hem rib', band.map(([x, y]) => [x - w / 2, y]), { fabric: shearling ? 'shearling' : 'rib', shown: [[-half, 0], [half, 0], [half, m.hemRib], [-half, m.hemRib]], notes: [shearling ? 'Shearling, pile out, eased (not stretched) onto the hem; split at the zip' : 'Folded in half, stretched about 12% onto the hem'], place: { view: 'front', x: 0, y: L, z: 2 } }));
  }
  if (hood) {
    // the hood's neck edge is solved to half the neckline (the two sides meet at the centre front), its depth at the crown at least 9½ in
    const hn = (lenOf(neck(m.neckDropFront)) + lenOf(neck(m.neckDropBack))), H = 13.5, hoodNeck = D => lenOf(cubic([D - .3, H], [D * .6, H - .1], [D * .25, H + .25], [.4, H]));
    let D = hn + .4; for (let k = 0; k < 8; k++) D += hn - hoodNeck(D); D = Math.max(D, 9.5);
    const side = [[0, 0], ...tail(cubic([0, 0], [D * .55, -1.1], [D + .9, .6], [D + .6, H * .45])), ...tail(cubic([D + .6, H * .45], [D + .4, H * .7], [D, H - .5], [D - .3, H])), ...tail(cubic([D - .3, H], [D * .6, H - .1], [D * .25, H + .25], [.4, H]))];
    pieces.push(piece('hood', 'Hood side', side, { cut: 2, pair: true, neck: { len: hoodNeck(D), pair: true, to: 'cf' }, notes: [`The neck edge (${r8(hn)} in) meets half the neckline`, o.drawcord !== false ? 'Drawcord channel along the front edge, two eyelets' : 'No drawcord'], place: { view: 'back', x: .1, y: -H + 1, z: -2 } }), twin('hood-2', 'Hood side', side, { view: 'back', x: -.1, y: -H + 1, flip: true, z: -2 }));
  }
  if (has('kangaroo')) { const pb = L - .5, pt = pb - 8; pieces.push(piece('pocket', 'Kangaroo pocket', [[-5.5, pt], [5.5, pt], ...tail(cubic([5.5, pt], [6.2, pt + 3], [7.6, pt + 4.5], [7.6, pb])), [-7.6, pb], ...tail(cubic([-7.6, pb], [-7.6, pt + 4.5], [-6.2, pt + 3], [-5.5, pt]))], { cut: 1, notes: ['Hand openings turned and topstitched'], place: { view: 'front', z: 3 } })); }
  // a split kangaroo (a zip front): one pocket each side of the zip, the hand opening slanted
  if (has('split-kangaroo')) { const pb = L - .5, pt = pb - 7.5, sp = [[.6, pt], [4.2, pt], ...tail(cubic([4.2, pt], [5, pt + 3], [7.2, pt + 4.4], [7.6, pb])), [.6, pb]];
    pieces.push(piece('pocket', 'Split kangaroo pocket', sp, { cut: 2, pair: true, notes: ['One each side of the zip; hand openings turned and topstitched'], place: { view: 'front', x: 0, y: 0, z: 3 } }), twin('pocket-2', 'Split kangaroo pocket', sp, { view: 'front', x: 0, y: 0, flip: true, z: 3 })); }
  // chest pockets: one on the wearer's left, or a pair; a buttoned flap on a work or utility shirt, a trucker or a western
  const chest = count('chest') + count('chest-flap'), flapped = count('chest-flap') > 0;
  if (chest) { const pw = Math.min(5, half * .42), ph = pw * 1.15, cp = [[0, 0], [pw, 0], [pw, ph], [pw / 2, ph + .6], [0, ph]], at = sg => ({ view: 'front', x: sg * half * .3 + (sg > 0 ? 0 : -pw), y: Math.max(m.neckDropFront + 3, UA[1] - 5.5), z: 3 });
    for (const [k, sg] of [[0, 1], [1, -1]].slice(0, Math.min(chest, 2))) pieces.push(piece(k ? 'chest-pocket-2' : 'chest-pocket', 'Chest pocket', cp, { cut: k ? 0 : Math.min(chest, 2), notes: ['1 in turn-back at the opening, topstitched on', ...(flapped ? ['Flap above, one button'] : [])], place: at(sg) }));
    if (flapped) { const fp = [[-.25, -.1], [pw + .25, -.1], [pw + .25, 1.6], [pw / 2, 2.4], [-.25, 1.6]];
      for (const [k, sg] of [[0, 1], [1, -1]].slice(0, Math.min(chest, 2))) pieces.push(piece(k ? 'chest-flap-2' : 'chest-flap', 'Pocket flap', fp, { cut: k ? 0 : Math.min(chest, 2) * 2, notes: ['Outer and facing, the outer fused; buttonhole at the point'], place: { ...at(sg), y: at(sg).y - 2.3, z: 4 } })); } }
  // cargo pockets on a jacket: bellows pockets with flaps, low on the front
  if (count('cargo')) { const pw = Math.min(6.5, half * .5), ph = pw * .95, cg = [[0, 0], [pw, 0], [pw, ph], [0, ph]], fl = [[-.2, -1.1], [pw + .2, -1.1], [pw + .2, 1.6], [-.2, 1.6]], at = sg => ({ view: 'front', x: sg > 0 ? half * .2 : -half * .2 - pw, y: L - ph - 2, z: 3 });
    pieces.push(piece('cargo', 'Cargo pocket', rect(pw + 2, ph + 1), { cut: 2, pair: true, shown: cg, notes: ['1 in bellows each side and at the bottom'], place: at(1) }), { ...piece('cargo-2', 'Cargo pocket', rect(pw + 2, ph + 1), { cut: 0, shown: cg, place: at(-1) }), twin: true },
      piece('cargo-flap', 'Cargo pocket flap', rect(pw + .5, 3), { cut: 4, pair: true, shown: fl, notes: ['Outer and facing, the outer fused; a snap under'], place: { ...at(1), z: 4 } }), { ...piece('cargo-flap-2', 'Cargo pocket flap', rect(pw + .5, 3), { cut: 0, shown: fl, place: { ...at(-1), z: 4 } }), twin: true }); }
  // patch hip pockets (a chore coat)
  if (count('patch-hip')) { const pw = Math.min(7, half * .55), ph = pw * .95, hp = [[0, 0], [pw, 0], [pw, ph - .6], [pw - .6, ph], [.6, ph], [0, ph - .6]];
    pieces.push(piece('hip-pocket', 'Patch hip pocket', hp, { cut: 2, pair: true, notes: ['1¼ in turn-back at the opening, topstitched on with bartacks at the top corners'], place: { view: 'front', x: half * .22, y: L - ph - 2.2, z: 3 } }), twin('hip-pocket-2', 'Patch hip pocket', hp, { view: 'front', x: -half * .22, y: L - ph - 2.2, flip: true, z: 3 })); }
  // a jacket's collar, as the sketch draws it
  if (jacketCollar) {
    const nl = neckLen / 2, ndf = m.neckDropFront;
    if (jacketCollar === 'shearling') {
      // a big flat collar, one piece on the fold at the centre back: drafted as a crescent (its outer edge far longer than its neck edge, so it
      // lies over the shoulders), with rounded points. On the product it spreads to the shoulder points and its points rest high on the chest
      const halfC = [[0, 0], ...tail(cubic([0, 0], [nl * .55, 0], [nl * .9, .55], [nl, 1.5])), ...tail(cubic([nl, 1.5], [nl + .5, 3], [nl + 1.4, 4.9], [nl + 2.1, 5.9])),
        ...tail(cubic([nl + 2.1, 5.9], [nl + 2.5, 6.5], [nl + 1.9, 7.1], [nl + .9, 7.1])), ...tail(cubic([nl + .9, 7.1], [nl * .55, 7.2], [nl * .2, 5.6], [0, 5.25]))];
      const nw = m.neckWidth / 2, reach = Math.max(sh - .2, nw + 4.5);
      const ring = [[0, -2.6], [nw + 2.2, -2.2], [reach - .4, -.3], [reach, 1.6], [reach - 1, ndf + 1.6], [nw + 1.6, ndf + 3.1], [1.3, ndf + 3.3], [.3, ndf + .6], [nw * .55, ndf * .4], [nw * .85, -.3], [0, -.9]];
      const R = blob(ring, .55), shownRaw = [...R.filter(([x]) => x >= 0)], shown = [...shownRaw, ...mirrorX(shownRaw).reverse()];
      pieces.push(piece('collar', 'Shearling collar', [...halfC, ...mirrorX(halfC).reverse().slice(1, -1)], { fabric: 'shearling', cut: 1, fold: true, shown, notes: [`Top collar in shearling, pile out; neck edge ${r8(neckLen)} in, sewn to the neckline`, 'Under collar cut once more in self, fused; rounded points'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
      // the chest strap under the collar on the wearer's left, as the sketch draws it: pointed, four eyelets, its top tucked under the collar
      const st = [[0, 0], [1.75, 0], [1.75, 5.4], [.875, 6.2], [0, 5.4]];
      pieces.push(piece('strap', 'Chest strap', st, { cut: 2, shown: st.map(([x, y]) => [x - .875, y]), notes: ['Outer and facing, fused; edge-stitched', 'Four eyelets in two pairs; the top 1 in tucked under the collar'], place: { view: 'front', x: half * .3, y: ndf + 2.8, z: 3 } }));
    } else if (jacketCollar === 'stand') pieces.push(piece('collar', 'Stand collar', rect(r8(neckLen + 1), 5).map(([x, y]) => [x - (neckLen + 1) / 2, y]), { cut: 2, neck: { len: r8(neckLen + 1), extra: 1, to: 'cf', why: 'the band runs the neckline, ½ in turned back at each end' }, shown: [[-m.neckWidth / 2 - .2, -1.6], [m.neckWidth / 2 + .2, -1.6], [m.neckWidth / 2 + .2, .9], [-m.neckWidth / 2 - .2, .9]], notes: ['Folded at the top edge to a 2 1/2 in stand; fused'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
    else pieces.push(piece('collar', 'Collar', [[-nl, 0], [nl, 0], [nl + .9, 3.25], [-nl - .9, 3.25]], { cut: 2, neck: { len: 2 * nl, to: 'cf' }, shown: [[-m.neckWidth / 2 - 1.6, -1], [m.neckWidth / 2 + 1.6, -1], [m.neckWidth / 2 + 2, 1.6], [.6, ndf + .4], [-.6, ndf + .4], [-m.neckWidth / 2 - 2, 1.6]], notes: ['Top collar and under collar; fused under collar'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
  }
  // a jacket's welt pockets: slanted at the hip, the welt and its bag (pocketing) behind it
  if ((style === 'jacket' || style === 'coat' || style === 'vest') && (has('welt') || has('flap-welt'))) {
    const slant = /aviator|shearling|bomber|blouson|biker|moto/.test(tpl) ? 55 : 80, len = 6.5, cx = half * .58, cy = L * .62; WELT = { len, cx, cy, slant };
    const welt = [[-len / 2, -.5], [len / 2, -.5], [len / 2, .5], [-len / 2, .5]];
    pieces.push(piece('welt', 'Pocket welt', rect(len + 1, 2.5), { cut: 2, pair: true, shown: welt, notes: ['Folded to a 1 in welt, fused; bartack both ends'], place: { view: 'front', x: cx, y: cy, rot: slant, z: 3 } }),
      { ...piece('welt-2', 'Pocket welt', rect(len + 1, 2.5), { cut: 0, shown: welt, place: { view: 'front', x: -cx, y: cy, rot: -slant, flip: true, z: 3 } }), twin: true },
      piece('pocket-bag', 'Pocket bag', [[0, 0], [len + 1, 0], [len + 1.5, 7], ...tail(cubic([len + 1.5, 7], [len + 1.5, 9.5], [1, 10], [0, 8.5]))], { fabric: 'pocketing', cut: 4, pair: true, hidden: true, notes: ['Two to each pocket, bagged out behind the welt'], place: { view: 'front', x: cx - len / 2, y: cy, z: -4 } }));
  }
  if (style === 'shirt' || style === 'shirtss' || (K.collar === 'shirt' && !outer && style !== 'polo' && !pieces.some(q => q.id === 'collar'))) { // a shirt, or a shirt collar on a bodysuit, a dress, a tee
    const sx = ext; // the stand runs past the centre front as far as the button stand does (none on a top that does not open)
    pieces.push(piece('collar', 'Collar', [[-neckLen / 2, 0], [neckLen / 2, 0], [neckLen / 2 + .6, 2.75], [-neckLen / 2 - .6, 2.75]], { cut: 2, neck: { len: neckLen, to: 'cf', why: 'set into the stand between its centre-front marks' }, notes: ['Top collar and under collar; fused top collar'], place: { view: 'front', x: 0, y: -1.2, z: 4 } }));
    pieces.push(piece('stand', 'Collar stand', [[-neckLen / 2 - sx, 0], ...tail(cubic([-neckLen / 2 - sx, 0], [-neckLen / 4, -.35], [neckLen / 4, -.35], [neckLen / 2 + sx, 0])), [neckLen / 2 + sx, 1.25], [-neckLen / 2 - sx, 1.25]], { cut: 2, neck: { len: lenOf(cubic([-neckLen / 2 - sx, 0], [-neckLen / 4, -.35], [neckLen / 4, -.35], [neckLen / 2 + sx, 0])), to: 'edge', why: sx ? 'front edge to front edge: the button and the buttonhole on its ends' : 'the neckline round' }, notes: ['Fused; the buttonhole at the centre front'], place: { view: 'front', x: 0, y: 0, z: 3 } }));
  }
  if (style === 'polo' || (K.collar === 'polo' && !['shirt', 'shirtss'].includes(style))) {
    if (!K.opening || K.opening === 'none' || K.opening === 'placket') pieces.push(piece('placket', 'Placket', rect(1.25, 6), { cut: 2, notes: ['Fused; 2 buttons'], place: { view: 'front', x: -.625, y: m.neckDropFront, z: 3 } }));
    pieces.push(piece('collar', 'Knit collar', rect(r8(neckLen), 3), { fabric: 'rib', neck: { len: r8(neckLen), to: 'cf', why: 'placket centre to placket centre' }, notes: ['Flat-knit collar, knitted to size'], place: { view: 'front', x: -neckLen / 2, y: -1, z: 4 } }));
  }
  if (style === 'coat') pieces.push(piece('collar', 'Collar', [[-neckLen / 2, 0], [neckLen / 2, 0], [neckLen / 2 + 1.2, 3.5], [-neckLen / 2 - 1.2, 3.5]], { cut: 2, neck: { len: neckLen, to: 'cf' }, notes: ['Fused under collar'], place: { view: 'front', x: 0, y: -1.5, z: 4 } }), piece('facing', 'Front facing', [[0, 0], [3, 0], [3, L], [0, L]], { cut: 2, pair: true, notes: ['Fused'], place: { view: 'front', x: 0, y: 0, z: -3 }, fabric: 'self' }));
  // ---- the inside of a lined jacket or coat: facings, lining, fusing, the zip guard and the trims ----
  // Drafted from the shell's own lines, the way a pattern room does it: the facings follow the front edge and the back neck and are fused; the
  // lining is the shell less the facings (its front edge is the facing's inner edge), with a 1 in pleat at the centre back for reach, a ½ in
  // jump at the hem and the sleeve's underarm raised ½ in so the arm moves; pockets get a self facing over a pocketing bag, so the lining
  // never shows at the mouth. Every piece is net (the seam allowance is added when cut); hidden under the shell on the product
  const lined = (K.lined ?? ['jacket', 'coat', 'vest'].includes(style)) && !o.unlined;
  if (lined) {
    const ndf = m.neckDropFront, ndb = m.neckDropBack, fw = Math.max(nw - .25, 2.75) + ext, shY = x => slope * (x - nw) / (sh - nw);
    // front facing: the front edge to the hem, the neck and 1¼ in of the shoulder, its inner edge curving down to a straight 3 in band
    const fIn = cubic([nw + 1.25, shY(nw + 1.25)], [nw + 1.4, ndf * .9], [fw + .2, ndf + 2], [fw, ndf + 5]);
    const facing = [[-ext, ndf], ...tail(neck(ndf)), ...tail(fIn), [fw, L], [-ext, L]];
    pieces.push(piece('front-facing', 'Front facing', facing, { cut: 2, pair: true, hidden: true, notes: ['Self, fused; sewn to the front edge and the neck, the lining sewn to its inner edge', ...(S.zip || style === 'jacket' ? ['The zip tape caught between the front and the facing'] : [])], place: { view: 'front', x: 0, y: 0, z: -2 } }));
    pieces.push(piece('front-facing-fuse', 'Front facing fusing', facing, { fabric: 'fusing', cut: 2, pair: true, hidden: true, notes: ['Fused to the front facing'], place: { view: 'front', x: 0, y: 0, z: -3 } }));
    // back neck facing: the back neck, 1¼ in of each shoulder, 2½ in deep at the centre back
    const bD = ndb + 2.5, bIn = cubic([nw + 1.25, shY(nw + 1.25)], [nw + 1.1, bD * .7], [nw * .55, bD], [0, bD]);
    const bHalf = [[0, ndb], ...tail(neck(ndb)), ...tail(bIn)], bFacing = [...bHalf, ...mirrorX(bHalf).reverse().slice(1, -1)];
    pieces.push(piece('back-facing', 'Back neck facing', bFacing, { cut: 1, fold: true, hidden: true, notes: ['Self, fused; the main label sewn at its centre, 1 in below the neck seam', 'Hanger loop caught in the neck seam at the centre back'], place: { view: 'back', x: 0, y: 0, z: -2 } }));
    pieces.push(piece('back-facing-fuse', 'Back neck facing fusing', bFacing, { fabric: 'fusing', cut: 1, fold: true, hidden: true, notes: ['Fused to the back neck facing'], place: { view: 'back', x: 0, y: 0, z: -3 } }));
    // front lining: the front less the facing; to the hem band seam with a ½ in jump, or ½ in above a turned-up hem
    const jump = m.hemRib ? .5 : -.5, ll = L + jump;
    const fLining = [fIn[0], [SP[0], SP[1]], ...tail(armhole), [half, ll], [fw, ll], ...fIn.slice().reverse().slice(0, -1)];
    pieces.push(piece('front-lining', 'Front lining', fLining, { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: [m.hemRib ? `Sewn to the hem band seam with a ½ in jump pleat` : 'Hemmed ½ in above the shell hem: a 1 in jump pleat', 'Inside pocket on the wearer’s left'], place: { view: 'front', x: 0, y: 0, z: -4 } }));
    // back lining: the back less the neck facing, cut on the fold with 1 in more at the centre back for the pleat
    const bLining = [[-1, bD], ...bIn.slice().reverse(), [SP[0], SP[1]], ...tail(armhole), [half, ll], [-1, ll]];
    pieces.push(piece('back-lining', 'Back lining', bLining, { fabric: 'lining', cut: 1, fold: true, hidden: true, notes: ['1 in pleat at the centre back (2 in opened), stitched 2 in down from the neck and at the waist', m.hemRib ? 'Sewn to the hem band seam with a ½ in jump pleat' : 'A 1 in jump pleat at the hem', 'Care label in the left side seam, 4 in above the hem'], place: { view: 'back', x: 0, y: 0, z: -4 } }));
    if (SLEEVE) {
      // sleeve lining: the sleeve, its underarm raised ½ in, ½ in longer for a jump pleat at the cuff
      const { sew, b, ch, Ls } = SLEEVE, k = (x, y) => .5 * Math.min(1, Math.abs(x) / b) ** 3 * (y <= ch ? 1 : Math.max(0, 1 - (y - ch) / 3));
      const sl = sew.map(([x, y]) => [x, y >= Ls - .01 ? y + .5 : y - k(x, y)]);
      pieces.push(piece('sleeve-lining', 'Sleeve lining', sl, { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['Underarm raised ½ in for movement; ½ in jump pleat at the cuff', 'Bagged: one sleeve-lining seam left open 6 in to turn the jacket through'], ...(pieces.find(q => q.id === 'sleeve') ? { shown: pieces.find(q => q.id === 'sleeve').shown, place: { ...pieces.find(q => q.id === 'sleeve').place, z: -6 } } : { place: { view: 'front', x: 0, y: 0, z: -6 } }) }));
    }
    // zip guard (wind flap) behind the zip, the full front edge
    if (zip) {
      const zl = r8(L + (m.hemRib || 0) - ndf);
      pieces.push(piece('zip-guard', 'Zip guard', rect(2.5, zl), { cut: 2, hidden: true, notes: ['Self, fused, folded to 1¼ in; on the wearer’s right, behind the zip'], place: { view: 'front', x: -2.5, y: ndf, z: -2 } }),
        piece('zip-guard-fuse', 'Zip guard fusing', rect(1.25, zl), { fabric: 'fusing', cut: 1, hidden: true, notes: ['Half the guard'], place: { view: 'front', x: -1.25, y: ndf, z: -3 } }));
      const zip = Math.max(14, Math.round(zl - .5));
      trims.push({ item: 'Separating zip', spec: `#5 metal (or #8 on heavy cloth), open-end, ${zip} in (${Math.round(zip * 2.54)} cm), measured from the neck to the bottom of the ${m.hemRib ? 'hem band' : 'hem'}`, qty: 1, where: 'Centre front' }, { item: 'Zip puller', spec: 'Matching the zip', qty: 1, where: 'Centre front' });
    }
    // the welt pockets: the welt is fused; a self facing on the back bag so the lining never shows at the mouth; a stay tape along the mouth
    if (WELT) {
      pieces.push(piece('welt-fuse', 'Welt fusing', rect(WELT.len + 1, 1.25), { fabric: 'fusing', cut: 2, hidden: true, notes: ['Fused to the half of the welt that shows'], place: { view: 'front', x: WELT.cx, y: WELT.cy, rot: WELT.slant, z: -3 } }),
        piece('pocket-facing', 'Pocket facing', rect(WELT.len + 1, 2.5), { cut: 2, pair: true, hidden: true, notes: ['Self, on the back pocket bag behind the mouth'], place: { view: 'front', x: WELT.cx, y: WELT.cy, rot: WELT.slant, z: -3 } }));
      trims.push({ item: 'Stay tape', spec: '⅜ in (10 mm) fusible, straight grain', qty: `${r8((WELT.len + 1) * 2 + 2)} in`, where: 'Along both pocket mouths' });
    }
    // an inside pocket on the wearer's left, in the lining: a lining welt and a pocketing bag
    pieces.push(piece('inside-welt', 'Inside pocket welt', rect(6.5, 2), { fabric: 'lining', cut: 1, hidden: true, notes: ['Inside pocket on the wearer’s left, 1 in in from the facing, level with the underarm; a 5½ in opening'], place: { view: 'front', x: fw + 1, y: UA[1] - 1, z: -3 } }),
      piece('inside-bag', 'Inside pocket bag', [[0, 0], [6.5, 0], [6.5, 7], [0, 7]], { fabric: 'pocketing', cut: 2, hidden: true, notes: ['Pocketing; the back bag faced with lining'], place: { view: 'front', x: fw + 1, y: UA[1] - 1, z: -4 } }));
    // the collar: an under collar in self, fused, under the top collar
    const col = pieces.find(q => q.id === 'collar');
    if (col) pieces.push(piece('under-collar', 'Under collar', col.sew, { cut: 1, fold: col.fold, hidden: true, notes: ['Self, fused; rolled ⅛ in under the top collar so the seam does not show'], ...(col.shown ? { shown: col.shown } : {}), place: { ...col.place, z: (col.place.z || 0) - 1 } }),
      piece('under-collar-fuse', 'Under collar fusing', col.sew, { fabric: 'fusing', cut: 1, fold: col.fold, hidden: true, notes: ['Fused to the under collar'], ...(col.shown ? { shown: col.shown } : {}), place: { ...col.place, z: (col.place.z || 0) - 2 } }));
    if (pieces.some(q => q.id === 'strap')) { pieces.push(piece('strap-fuse', 'Chest strap fusing', [[0, 0], [1.75, 0], [1.75, 5.4], [.875, 6.2], [0, 5.4]], { fabric: 'fusing', cut: 1, hidden: true, notes: ['Fused to the outer strap'], shown: pieces.find(q => q.id === 'strap').shown, place: { ...pieces.find(q => q.id === 'strap').place, z: 1 } }));
      trims.push({ item: 'Eyelets', spec: '¼ in (6 mm) brass, with washers', qty: 4, where: 'Chest strap, two pairs' }); }
    trims.push({ item: 'Hanger loop', spec: '⅜ in twill tape, 7 in', qty: 1, where: 'Centre back neck seam' },
      { item: 'Main label', spec: 'Woven, folded end', qty: 1, where: 'Back neck facing, centre, 1 in below the neck seam' },
      { item: 'Size label', spec: 'Woven', qty: 1, where: 'Under the main label' },
      { item: 'Care and content label', spec: 'Printed satin', qty: 1, where: 'Left side seam of the lining, 4 in above the hem' },
      { item: 'Thread', spec: 'Tex 40 core-spun polyester for seams; Tex 60 for topstitching', qty: 'about 250 m', where: 'Throughout' });
    if (shearling) trims.push({ item: 'Seam tape', spec: '½ in leather or twill tape for shearling seams (butted and taped, no bulk)', qty: `${r8((m.chest * 2) + 4 * (m.sleeveOpening || 4) + neckLen + 6)} in`, where: 'Collar, cuff and hem band seams' });
  }
  // a half or quarter zip in a pullover: a zip placket at the centre front
  if (K.opening === 'half-zip' || K.opening === 'quarter-zip') { const zl = K.opening === 'half-zip' ? 10 : 7, nd = m.neckDropFront;
    pieces.push(piece('zip-placket', 'Zip placket', rect(2.5, zl + (K.collar === 'stand' ? 2.5 : 0)), { cut: 2, notes: ['Fused; the zip set between the plackets, its top to the collar edge'], shown: [[-.4, 0], [.4, 0], [.4, zl], [-.4, zl]], place: { view: 'front', x: 0, y: nd, z: 3 } }));
    trims.push({ item: 'Zip', spec: `#5 coil, closed-end, ${zl + (K.collar === 'stand' ? 2 : 0)} in`, qty: 1, where: 'Centre front placket' }); }
  // a stand collar on a pullover or a polo-less top (a quarter zip's, a mock neck)
  if (K.collar === 'stand' && !jacketCollar && !pieces.some(q => q.id === 'collar')) { const nl = neckLen;
    pieces.push(piece('collar', 'Stand collar', rect(r8(nl + (K.opening && K.opening !== 'none' ? 1 : 0)), 5), { neck: { len: r8(nl + (K.opening && K.opening !== 'none' ? 1 : 0)), extra: K.opening && K.opening !== 'none' ? 1 : 0, to: 'cf', why: K.opening && K.opening !== 'none' ? 'the neckline round, ½ in turned back at the zip each side' : 'the neckline round' }, fabric: K.opening === 'half-zip' || K.opening === 'quarter-zip' ? 'self' : 'rib', cut: 1, notes: ['Folded to 2½ in'], place: { view: 'front', x: 0, y: 0, z: 4 } })); }
  // collars as the flats draw them: a shirt collar's two leaves rise from the back neck over the shoulders to points on the chest; a stand
  // collar is a band round the neck with the neck's inside showing; a hood lies behind the neck on the front view
  const ndf0 = m.neckDropFront, leafR = [[0, -1.25], [nw * .6, -1.35], [nw + 1, -1.05], [nw + 1.9, .2], [nw + 1.55, ndf0 * .55], [nw * .55 + 1.1, ndf0 + 1.6], [.5, ndf0 + 2.1], [.15, ndf0 + .5], [nw * .55, ndf0 * .45], [nw * .8, -.15], [0, -.45]];
  const leaves = (() => { const R = blob(leafR, .3).filter(([x]) => x >= 0); return [...R, ...mirrorX(R).reverse()]; })();
  const band = (h, out = .3) => { const nk = neck(ndf0), rt = [...nk.slice().reverse()]; return [[-nw - out, -h], [nw + out, -h], [nw + out * .6, .15], ...rt.slice(1), ...mirrorX(nk).slice(1).map(([x, y]) => [x, y]), [-nw - out * .6, .15]]; };
  for (const q of pieces.filter(x => x.id === 'collar')) {
    if (/^Collar$|Top collar|Knit collar/.test(q.name) || (q.name === 'Collar' && !q.shown)) { q.shown = leaves; q.place = { ...q.place, x: 0, y: 0 }; }
    else if (/Stand collar/.test(q.name)) q.shown = band(2.4);
  }
  for (const q of pieces.filter(x => x.id === 'stand')) q.hidden = true;
  if (hood) { const rim = blob([[0, -7.4], [nw + 1.8, -6.8], [nw + 3.4, -3.2], [nw + 3.1, 1.3], [nw + 1, 2.2], [0, 1.6], [-nw - 1, 2.2], [-nw - 3.1, 1.3], [-nw - 3.4, -3.2], [-nw - 1.8, -6.8]], .5);
    pieces.push({ ...piece('hood-front', 'Hood', rim, { cut: 0, shown: rim, place: { view: 'front', x: 0, y: 0, z: -3 } }), of: 'hood', twin: true, copy: true }); }
  // flaps over the welt pockets
  if (has('flap-welt') && WELT) { const { len, cx: wx, cy: wy, slant } = WELT, fl = [[-len / 2 - .25, -2.6], [len / 2 + .25, -2.6], [len / 2 + .25, .35], [-len / 2 - .25, .35]];
    pieces.push(piece('flap', 'Pocket flap', rect(len + .5, 3), { cut: 4, pair: true, shown: fl, notes: ['Outer and facing, the outer fused; a snap under'], place: { view: 'front', x: wx, y: wy, rot: slant, z: 4 } }), { ...piece('flap-2', 'Pocket flap', rect(len + .5, 3), { cut: 0, shown: fl, place: { view: 'front', x: -wx, y: wy, rot: -slant, flip: true, z: 4 } }), twin: true });
    trims.push({ item: 'Snaps', spec: 'Ring snaps, 12 mm, for the pocket flaps', qty: 2, where: 'Under each flap' }); }
  // buttons down a shirt's front, or a placket's few (a polo, a henley): in the trims, and seen on the product
  if ((buttons || K.opening === 'placket' || ['shirt', 'shirtss'].includes(style) && K.opening !== 'zip' && K.opening !== 'none') && !outer) {
    const plk = K.opening === 'placket' || style === 'polo', n = plk ? 3 : Math.max(5, Math.min(8, Math.round((L - m.neckDropFront) / 3.75))), y0 = m.neckDropFront + .6, gap = plk ? 1.7 : (L - y0 - 2.5) / (n - 1);
    trims.push(K.opening === 'snaps' ? { item: 'Snaps', spec: '12 mm pearl snaps', qty: n, where: 'Down the centre front' } : { item: 'Buttons', spec: plk ? '18 L (11.5 mm) four-hole' : '18 L (11.5 mm) four-hole, plus one spare', qty: n + (plk ? 0 : 1), where: plk ? 'Down the placket' : `Down the centre front (${n})` });
    const btn = [[-.25, 0], [0, -.25], [.25, 0], [0, .25]]; for (let i = 0; i < n; i++) pieces.push({ ...piece(`button-${i + 1}`, 'Button', btn, { cut: 0, shown: btn, place: { view: 'front', x: 0, y: y0 + i * gap, z: 6 } }), twin: true, copy: true, of: 'front' }); }
  // buttons or snaps down the front of an outer piece (a cardigan, a varsity, a waistcoat)
  if (buttons && outer) { const n = Math.max(4, Math.min(8, Math.round((L - m.neckDropFront) / 4)));
    trims.push(K.opening === 'snaps' ? { item: 'Snaps', spec: '15 mm ring snaps (a varsity: pearl-capped)', qty: n, where: 'Down the centre front, the first 1 in below the neck' } : { item: 'Buttons', spec: '20 L (12.5 mm) four-hole', qty: n + 1, where: `Down the centre front (${n}), one spare on the care label` });
    for (const q of pieces.filter(x => x.id === 'front')) q.notes.push(K.opening === 'snaps' ? `${n} snaps down the front` : `${n} buttonholes on the wearer's left (womenswear: right), ${r8((L - m.neckDropFront - 2) / (n - 1))} in apart`); }
  // a belt with its loops and buckle
  if (K.belt) { const wy = Math.min(L - 3, UA[1] + 6.5), bl = r8(m.chest * 2 + 16), band = [[-half - .4, 0], [half + .4, 0], [half + .4, 1.75], [-half - .4, 1.75]];
    pieces.push(piece('belt', 'Belt', rect(bl, 4), { cut: 1, notes: ['Folded to 1¾ in, fused, edge-stitched; a pointed end'], shown: band, place: { view: 'front', x: 0, y: wy, z: 5 } }), { ...piece('belt-back', 'Belt', rect(bl, 4), { cut: 0, shown: band, place: { view: 'back', x: 0, y: wy, z: 5 } }), of: 'belt', twin: true, copy: true },
      piece('belt-loop', 'Belt loop', rect(1.5, 3.5), { cut: 5, notes: ['Folded in four, edge-stitched'], hidden: true, place: { view: 'front', x: half - 1, y: wy, z: -1 } }));
    trims.push({ item: 'Buckle', spec: '1¾ in, covered or metal, with prong', qty: 1, where: 'Belt' }); }
  // quilting (a puffer): the shell and lining channel-quilted through an insulation layer cut the same
  if (K.quilted) { const gap = 4;
    for (const q of pieces.filter(x => ['front', 'back', 'sleeve'].includes(x.id))) { q.notes.push(`Channel-quilted every ${gap} in`); pieces.push(piece(`${q.id}-fill`, `${q.name} insulation`, q.sew, { fabric: 'insulation', cut: q.cut, pair: q.pair, fold: q.fold, hidden: true, notes: ['Insulation, cut the same as the shell, quilted through'], place: { ...q.place, z: -7 } })); }
    for (const v of ['front', 'back']) for (let y = UA[1] - 4; y < L - 1; y += gap) pieces.push({ ...piece(`quilt-${v}-${Math.round(y)}`, 'Quilting line', [[-half, y], [half, y], [half, y + .07], [-half, y + .07]], { cut: 0, shown: [[-half, y], [half, y], [half, y + .07], [-half, y + .07]], place: { view: v, x: 0, y: 0, z: 1 } }), of: 'front', twin: true, copy: true });
    trims.push({ item: 'Insulation', spec: '120 g/m² synthetic batting (or 650 fill-power down in baffles, about 180 g)', qty: `${r8((m.chest * 2 + m.sleeve * 2) * (m.length + 2) / 36 / 36)} yd² approx.`, where: 'Body and sleeves' }); }
  // stripes and contrast panels
  if (K.panels === 'sleeve-stripe' && m.sleeve > 0) { trims.push({ item: 'Stripe tape', spec: '1¼ in woven tape (three stripes: ¼ in each with ¼ in gaps)', qty: `${r8((m.sleeve + 2) * 2)} in`, where: 'Down the outside of each sleeve, shoulder to cuff' }); for (const q of pieces.filter(x => x.id === 'sleeve')) q.notes.push('Stripe tape down the outside, centred on the top notch'); }
  if (K.panels === 'side-panel') { pieces.push(piece('side-panel', 'Side panel', rect(3.5, r8(L - UA[1])), { cut: 2, fabric: 'contrast', notes: ['Contrast; the front and back each take 1¾ in less at the side seam'], hidden: true, place: { view: 'front', x: half - 1.75, y: UA[1], z: -1 } })); }
  pieces.trims = trims;
  // the back view shows what wraps round to it, as the back flat draws it: the sleeves and cuffs, the hem band, and a shearling collar's back.
  // They are the same pieces seen from behind (not cut again): each names the piece it shows (`of`), so the cutting layout takes them from it
  if (pieces.some(q => q.place.view === 'back')) {
    for (const q of pieces.filter(x => ['sleeve', 'sleeve-2', 'cuff', 'cuff-2', 'hem-rib'].includes(x.id))) pieces.push({ ...q, id: `${q.id}-back`, of: q.id.replace(/-2$/, ''), cut: 0, twin: true, copy: true, place: { ...q.place, view: 'back' } });
    if (jacketCollar === 'shearling') { const W = m.neckWidth / 2 + 2.4, ring = [[0, -2.7], [W, -2.3], [W + .9, -.6], [W + .5, 1.6], [W - 1.2, 2.9], [0, 3.3]], R = blob(ring, .5), h = R.filter(([x]) => x >= 0);
      pieces.push({ ...piece('collar-back', 'Shearling collar', pieces.find(x => x.id === 'collar').sew, { fabric: 'shearling', cut: 0, shown: [...h, ...mirrorX(h).reverse()], place: { view: 'back', x: 0, y: 0, z: 4 } }), of: 'collar', twin: true, copy: true }); }
  }
  if (topCut === 'straps') { // straps: rouleau, from the top edge at the cups over the shoulder to the back
    const a = [half * .5, topY + .15], b = [nw + .9, .4], w = .19, nx = -(b[1] - a[1]), ny = b[0] - a[0], k = w / Math.hypot(nx, ny), st = [[a[0] - nx * k, a[1] - ny * k], [b[0] - nx * k, b[1] - ny * k], [b[0] + nx * k, b[1] + ny * k], [a[0] + nx * k, a[1] + ny * k]], len = r8(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2 + 2);
    pieces.push(piece('strap', 'Strap', rect(1.25, len), { cut: 2, notes: [`Rouleau, turned to ⅜ in; ${len} in each, adjusted at the back with a slider`], shown: st, place: { view: 'front', x: 0, y: 0, z: 3 } }), { ...piece('strap-2', 'Strap', rect(1.25, len), { cut: 0, shown: st, place: { view: 'front', x: 0, y: 0, flip: true, z: 3 } }), twin: true });
    trims.push({ item: 'Strap sliders and rings', spec: '10 mm, metal or nylon', qty: 2, where: 'Back of each strap' }); }
  if (topCut === 'strapless') trims.push({ item: 'Gripper elastic', spec: '⅝ in silicone-backed elastic', qty: `${r8(half * 4 * .9)} in`, where: 'Inside the top edge' }, ...(style === 'dress' || style === 'cami' ? [{ item: 'Boning', spec: '¼ in spiral steel or plastic', qty: '4 × 6 in', where: 'Side seams and princess lines, in casings' }] : []));
  if (style === 'swimsuit') { // swim: lined throughout, the legs and the edges finished with swim elastic, the crotch lined
    for (const id of ['front', 'back']) { const q = pieces.find(x => x.id === id); if (q) pieces.push({ ...piece(`${id}-lining`, `${q.name} lining`, q.sew, { fabric: 'lining', cut: 1, fold: true, hidden: true, notes: ['Swim lining (nylon/elastane tricot), the same shape'], place: { ...q.place, z: -2 } }) }); }
    const leg = lenOf(SIDE.filter(([, y]) => y >= UA[1] + (L - UA[1]) * .5)) * 2;
    trims.push({ item: 'Swim elastic', spec: `⅜ in rubber or chlorine-resistant elastic, ${r8(leg * .85)} in a leg, and round the neck and the armholes at 90%`, qty: 'as cut', where: 'Legs, neck, armholes; turned and coverstitched' }, { item: 'Cups (optional)', spec: 'Removable foam cups, size M', qty: 1, where: 'Pocketed in the front lining' }); }
  if (style === 'bodysuit') { // the crotch: a lined gusset snapped shut, the legs finished with elastic
    const g = [[-crotch, 0], [crotch, 0], [crotch + .6, 4.5], [-crotch - .6, 4.5]];
    pieces.push(piece('gusset', 'Crotch gusset', g, { cut: 2, fold: false, hidden: true, notes: ['Self and a cotton lining; the front end sewn to the front crotch, the back end to the back, each with a snap tape'], place: { view: 'front', x: 0, y: L - 4.5, z: 1 } }));
    const leg = lenOf(SIDE.filter(([, y]) => y >= UA[1] + (L - UA[1]) * .5)) * 2;
    trims.push({ item: 'Snap tape', spec: '3 snaps, 12 mm, on a ⅝ in tape', qty: 1, where: 'Across the crotch' }, { item: 'Leg elastic', spec: `⅜ in clear or knit elastic, ${r8(leg * .85)} in a leg (15% short of the ${r8(leg)} in opening)`, qty: 2, where: 'Round each leg, turned and coverstitched' }); }
  if (style === 'dress') { // a woven dress fitted through the waist: darts and a zip
    const waist = Math.min(...SIDE.filter(([, y]) => y < UA[1] + (L - UA[1]) * .45).map(([x]) => x)), sup = half - waist;
    if (sup > .4) for (const q of pieces.filter(x => x.id === 'front' || x.id === 'back')) q.notes = [...(q.notes || []), `Waist darts: two, ${r8(Math.min(sup * .5, 1.25))} in wide, ${q.id === 'front' ? 'from 1 in below the bust point to 4 in below the waist' : 'from the shoulder blade to 5 in below the waist'}`];
    if (zip) trims.push({ item: 'Zip', spec: `Exposed metal zip, separating, ${Math.round(L - m.neckDropFront)} in`, qty: 1, where: 'Centre front, neck to hem' });
    else if (K.opening !== 'buttons') trims.push({ item: 'Zip', spec: `Invisible zip, ${Math.round(Math.min(22, L * .55))} in`, qty: 1, where: 'Centre back' }); }
  if (m.sleeve === 0) pieces.push(piece('binding', 'Armhole and neck binding', rect(r8(lenOf(armhole) * 4 * .92 + neckLen * .9), 1.25), { fabric: 'self', cut: 1, hidden: true, /* a strip cut and bound round the edges: on the product it is the edge itself */ notes: ['Bias or cross-grain strip, cut into lengths'], place: { view: 'front', x: -half, y: L + 1, z: 2 } }));
  // a zip front on a piece the outerwear trims do not cover (a zip hoodie, a zip shirt): its separating zip in the trims
  if (zip && !trims.some(t => /zip/i.test(t.item))) trims.push({ item: 'Separating zip', spec: `#5 ${hood || style === 'ziphoodie' ? 'coil' : 'metal'}, ${Math.round(L - m.neckDropFront + (hood ? 0 : 1))} in`, qty: 1, where: 'Centre front, the hem to the neck' });
  pieces.block = BLOCK;
  return pieces;
}
function bottomPieces(S, m, o, style) {
  const K = o.K || {}, pk = K.pockets || [], has = t => pk.includes(t), trims = [];
  const wb = m.waistband, pieces = [];
  if (S.skirt) {
    const w = m.waist / 2, hip = m.hip / 2, L = m.length - wb, sw = Math.max(m.sweep, m.hip) / 2 * (K.leg === 'flare' ? 1.45 : 1), hy = Math.min(7, L * .45);
    const pleated = (K.pleats || 0) > 0;
    const panel = [[-w, 0], [w, 0], ...tail(cubic([w, 0], [hip, hy * .4], [hip, hy * .8], [hip, hy])), [sw, L], [-sw, L], ...tail(cubic([-hip, hy], [-hip, hy * .8], [-hip, hy * .4], [-w, 0])).slice(0, -1)];
    const SKIRT = { sew: tidy(panel), skirt: true, at: { waistR: [w, 0], hipR: [hip, hy], hemR: [sw, L], hemL: [-sw, L], waistL: [-w, 0] } };
    pieces.push(piece('front', 'Front', [...panel.slice(0, 3), ...panel.slice(3)], { cut: 1, fold: true, place: { view: 'front', y: wb } }), piece('back', 'Back', panel, { cut: 1, fold: true, notes: ['Invisible zip at the centre back'], place: { view: 'back', y: wb } }));
    pieces.push(piece('waistband', K.waist && K.waist !== 'fixed' ? 'Waistband (elastic channel)' : 'Waistband', rect(r8(m.waist * 2 + (K.waist && K.waist !== 'fixed' ? 0 : 1.5)), wb * 2), { shown: [[m.waist + .75 - w, 0], [m.waist + .75 + w, 0], [m.waist + .75 + w, wb], [m.waist + .75 - w, wb]], notes: [K.waist && K.waist !== 'fixed' ? `Elastic ${r8(wb - .25)} in wide` : 'Folded, fused, 1½ in overlap'], place: { view: 'front', x: -m.waist - .75, y: 0, z: 2 } }));
    if (K.leg === 'flare') for (const q of pieces.filter(x => x.id === 'front' || x.id === 'back')) q.notes.push('Flared: the sweep is 1½× the hip');
    // knife pleats all round: each panel cut three times as wide as it shows, the pleats pressed and edge-stitched to the hip
    if (pleated) for (const q of pieces.filter(x => x.id === 'front' || x.id === 'back')) { q.shown = q.sew.map(pt => pt.slice()); q.sew = q.sew.map(([x, y]) => [x * 3, y]); q.notes.push('Knife pleats all round, 1 in deep every 1½ in: cut 3× the width it shows; pressed, and edge-stitched from the waist to the hip'); }
    if (pleated) for (const v of ['front', 'back']) for (let x = -sw + 1.5; x < sw - .5; x += 1.5) { const t0 = x * (w / sw), ln = [[t0, 0], [t0 + .06, 0], [x + .06, L], [x, L]];
      pieces.push({ ...piece(`pleat-${v}-${Math.round(x * 10)}`, 'Pleat', ln, { cut: 0, shown: ln, place: { view: v, x: 0, y: wb, z: 1 } }), of: 'front', twin: true, copy: true }); }
    if (has('five-pocket') || has('cargo')) { const bag = [[0, 0], [6, 0], [6, 7.5], ...tail(cubic([6, 7.5], [6, 9.5], [2, 9.5], [0, 8.5]))];
      pieces.push(piece('pocket-bag', 'Pocket bag', bag, { fabric: 'pocketing', cut: 4, pair: true, hidden: true, notes: ['Scoop front pockets'], place: { view: 'front', x: w - 5, y: wb, z: -1 } }), piece('back-pocket', 'Back pocket', [[0, 0], [5, -.3], [4.8, 5.4], [2.5, 6.1], [.3, 5.6]], { cut: 2, notes: ['1 in turn-back at the opening'], place: { view: 'back', x: 1.5, y: wb + 1.6, z: 3 } }), twin('back-pocket-2', 'Back pocket', [[0, 0], [5, -.3], [4.8, 5.4], [2.5, 6.1], [.3, 5.6]], { view: 'back', x: -1.5, y: wb + 1.6, flip: true, z: 3 }));
      if (has('five-pocket')) pieces.push(piece('coin-pocket', 'Coin pocket', rect(3, 3.25), { cut: 1, notes: ['On the right front pocket facing'], place: { view: 'front', x: w * .45, y: wb + 1, z: 3 } }));
      if (has('cargo')) pieces.push(piece('cargo', 'Cargo pocket', rect(7, 7.5), { cut: 2, pair: true, notes: ['1 in bellows each side; flap above'], shown: [[0, 0], [5.5, 0], [5.5, 6], [0, 6]], place: { view: 'front', x: hip - 5.8, y: wb + Math.min(L * .45, 8), z: 3 } })); }
    pieces.trims = trims; pieces.block = { front: SKIRT, back: SKIRT }; return pieces;
  }
  const Hc = m.hip * 2, hipY = Math.min(7.5, (m.rise - wb) * .7);
  // a back dart when the back's waist is taken in much more than the front's (a pleated front holds its fullness, the back does not): up to
  // 1¼ in, so the back's side seam is shaped like the front's and the two walk together
  // a pull-on waist (elastic, drawcord): the leg is cut up to the waist as wide as the hip, so the waist opening passes over it, and the elastic
  // gathers it to the waist; a fixed waist is cut to the waist
  const pullOn = K.waist ? K.waist !== 'fixed' : (/jogger|sweat/.test(String(o.template || '')) || style === 'leggings');
  const supF = (m.hip / 2 - .5) - (m.waist / 2 - .25 + (K.pleats || 0) * 1.25), supB = (m.hip / 2 + .5) - (m.waist / 2 + .25), dartB = pullOn ? 0 : r8(Math.min(Math.max(supB - Math.max(supF, 0) - .75, 0), 1.25));
  let rd = m.rise - wb, inseam = m.inseam, Hy = rd + inseam, extK = 1, dropB = 0; // set below so the seams come out at the spec (fitted)
  const leg = (back) => {
    const hY = Math.min(7.5, rd * .7); // the hip line, 70% down the crotch depth as fitted (never below the crotch)
    const k = back ? 1 : -1, hipW = m.hip / 2 + (back ? .5 : -.5), waistW = pullOn ? m.hip / 2 + (back ? .5 : -.5) - .25 : m.waist / 2 + (back ? .25 + dartB : -.25), ext = (back ? Hc / 10 : Hc / 16) * extK, cd = back ? dropB : 0;
    // a side panel takes 1¼ in off each leg at the side seam; front pleats add their depth to the front's waist
    const panel = K.panels === 'side-panel' ? 1.25 : 0, pleat = back ? 0 : (K.pleats || 0) * 1.25;
    const sideX = -hipW + panel, crease = (ext + sideX) / 2, cbRaise = back ? 1 : 0;
    const legK = o.legsDrawn ? 1 : { flare: 1.7, wide: 1.45, taper: .82, balloon: .9 }[K.leg] || 1, // a leg opening read from the sketch is already as wide as the leg is drawn
      hemW = (m.legOpening - (K.panels === 'side-panel' ? 1.25 : 0)) * (back ? 1.1 : .9) * legK, kneeY = rd + inseam * .48; // (a side panel makes up the rest of the leg opening)
    // the knee: a flare narrows to it, a balloon fills out at it; otherwise as the sketch draws it (its knee in proportion to its hem), or a
    // straight line from the hip to the hem when there is no sketch to read
    const kneeW = K.leg === 'flare' ? m.legOpening * (back ? 1.1 : .9) * .92 : K.leg === 'balloon' ? (hipW + ext) * .95 : o.kneeRatio ? Math.min(hemW * o.kneeRatio, hipW + ext * .6) : null;
    const c0 = Math.max(rd * .55, Math.min(hY + .25, rd * .8)), crotch = cubic([0, c0], [0, c0 + (rd - c0) * .65], [ext * .35, rd + cd], [ext, rd + cd]); // from the hip line down // the back's dropped by cd, so its inseam is the front's
    const knee = side => kneeW ? [[crease + side * kneeW / 2, kneeY]] : [];
    const sideCurve = tail(cubic([sideX, hY], [sideX, hY * .5], [-waistW - pleat - .2 + panel, hY * .2], [-waistW - pleat + panel, 0]));
    // a curved (running) hem: it rises to the side seam, the side shorter than the inseam
    const lift = K.hem === 'curved' ? Math.min(2.25, inseam * .35) : 0, hemOut = (xi, xo) => lift ? tail(cubic([xi - (xi - xo) * .45, Hy], [xo + (xi - xo) * .12, Hy], [xo, Hy - lift * .45], [xo, Hy - lift])) : [[xo, Hy]];
    const sew = [[0, -cbRaise], ...crotch, ...knee(1), [crease + hemW / 2, Hy], ...(lift ? [[crease + hemW / 2 - hemW * .45, Hy]] : []), ...hemOut(crease + hemW / 2, crease - hemW / 2), ...knee(-1), [sideX, hY], ...sideCurve];
    // on the product the leg is seen from the centre line out: its crotch extension tucks under the other leg, the two meet at the centre
    // laid flat, the legs meet at the centre: a leg too wide to sit either side of its crease there moves out, at its full width (it is not cut
    // narrower than it is: a straight or wide leg shows as wide as it is cut)
    const inX = x => Math.min(x, -.35), sideSeen = tail(cubic([sideX, hY], [sideX, hY * .5], [-waistW - .2 + panel, hY * .2], [-waistW + panel, 0]));
    const flat = (w, y) => { const i = inX(crease + w / 2); return [[i, y], [i - w, y]]; }, [kIn, kOut] = kneeW ? flat(kneeW, kneeY) : [], [hIn, hOut] = flat(hemW, Hy);
    const shown = [[0, 0], [0, rd], ...(kIn ? [kIn] : []), hIn, ...(lift ? [[hIn[0] - hemW * .45, Hy]] : []), ...hemOut(hIn[0], hOut[0]), ...(kOut ? [kOut] : []), [sideX, hY], ...sideSeen];
    void k; return { sew, shown, crease, ext, cd, kneeY, sideX, hipW, hemW, hIn, hOut, lift };
  };
  // drafted to its seams: the rise and the inseam are specified along their seams (a curve, a slant), so the crotch depth and the inseam's drop
  // are set until the seams come out at the spec; the crotch extensions until the thigh (1 in below the crotch, flat) is the spec's; then the
  // back's crotch is dropped so its inseam walks the front's, and its side seam is balanced to the front's (src/lab-pattern-check.js walks them)
  const crotchAt = Lg => Lg.sew.findIndex(([x, y]) => x === Lg.ext && y === rd + Lg.cd), hemAt = Lg => Lg.sew.findIndex(([, y], i) => i > crotchAt(Lg) && y === Hy);
  const riseOf = Lg => lenOf(Lg.sew.slice(0, crotchAt(Lg) + 1)), insOf = Lg => lenOf(Lg.sew.slice(crotchAt(Lg), hemAt(Lg) + 1)), sideOf = Lg => lenOf(Lg.sew.slice(hemAt(Lg) + 1)) + Math.hypot(...[0, 1].map(k => Lg.sew[hemAt(Lg) + 1][k] - Lg.sew[hemAt(Lg)][k])) * 0;
  const across = (P, y) => { const xs = []; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; };
  let F, B;
  for (let it = 0; ; it++) {
    F = leg(false); B = leg(true);
    const dr = (m.rise - wb) - riseOf(F), di = m.inseam - insOf(F), dt = m.thigh ? m.thigh - (across(F.sew, rd + 1) + across(B.sew, rd + 1) + (K.panels === 'side-panel' ? 2.5 : 0)) / 2 : 0, db = insOf(B) - insOf(F);
    if (it >= 7 || (Math.abs(dr) < .03 && Math.abs(di) < .03 && Math.abs(dt) < .06 && Math.abs(db) < .05)) break; // the last legs drafted are the ones kept
    rd += dr; inseam = Math.max(.5, inseam + di); Hy = rd + inseam; extK = Math.min(Math.max(extK + 2 * dt / (Hc / 10 + Hc / 16), .45), 1.8); dropB = Math.min(Math.max(dropB + db, 0), 1);
  }
  // the back's side seam balanced to the front's: its top at the waist moved by the difference, so the two walk together
  { const sideRun = Lg => { const i = Lg.sew.findIndex(([x, y]) => Math.abs(x - (Lg.crease - Lg.hemW / 2)) < 1e-3 && Math.abs(y - (Hy - Lg.lift)) < 1e-3); return i < 0 ? null : lenOf(Lg.sew.slice(i)); };
    // the longer side's top is brought down (or, when that cannot shorten it enough, the shorter side's raised) until the two walk together
    const fit = (Lg, target) => { const t = Lg.sew[Lg.sew.length - 1].slice(), lo = Lg.sew[Lg.sew.length - 2][1] - .375; let best = 0, bd = Infinity; for (let d = -1.5; d <= 1.5; d += .01) { if (t[1] + d > lo) break; /* never below the point before it: the seam would hook back */ Lg.sew[Lg.sew.length - 1] = [t[0], t[1] + d]; const e = Math.abs(sideRun(Lg) - target); if (e < bd) { bd = e; best = d; } } Lg.sew[Lg.sew.length - 1] = [t[0], t[1] + best]; return bd; };
    const a = sideRun(F), b0 = sideRun(B); if (a && b0 && Math.abs(b0 - a) > .04 && fit(B, a) > .04 && fit(F, sideRun(B)) > .04) {
      // still apart: the longer leg's outer hem corner raised (or lowered) by the difference, its hem a little shaped
      const longer = sideRun(B) > sideRun(F) ? B : F, d = Math.abs(sideRun(B) - sideRun(F)), i = longer.sew.findIndex(([x, y]) => Math.abs(x - (longer.crease - longer.hemW / 2)) < 1e-3 && Math.abs(y - (Hy - longer.lift)) < 1e-3);
      if (i >= 0 && d < .75) { longer.sew[i] = [longer.sew[i][0], longer.sew[i][1] - d]; longer.hemRaise = d; } } }
  void sideOf;
  // the block (see topPieces): each leg as drafted, before a yoke or a pocket divides it, with the corners its seams run between
  const legMark = (Lg, back) => { const sw = tidy(Lg.sew), top = [r3(Lg.sew.at(-1)[0]), r3(Lg.sew.at(-1)[1])]; /* the side seam's top: the last point drafted */ return { sew: sw, at: { cfTop: [0, back ? -1 : 0], crotch: [Lg.ext, rd + Lg.cd], hemIn: [r3(Lg.crease + Lg.hemW / 2), r3(Hy)], hemOut: [r3(Lg.crease - Lg.hemW / 2), r3(Hy - Lg.lift - (Lg.hemRaise || 0))], sideTop: top } }; };
  const BLOCK = { front: legMark(F, false), back: { ...legMark(B, true), dart: dartB } };
  // the outer side of a leg as the product shows it, from the hem's outer corner up the side seam to the waist (a stripe or a panel follows it)
  const outerSide = Lg => { const P = Lg.shown, i = P.findIndex((q, k) => k > 2 && Math.abs(q[1] - (Hy - Lg.lift)) < .01 && q[0] <= Lg.hOut[0] + .01); return P.slice(i < 0 ? 0 : i).slice().sort((a, b) => b[1] - a[1]); };
  // a back yoke (jeans, work pants): the top of the back leg cut away along a seam 2½ in deep at the centre back and 1 in at the side, and
  // cut as its own piece; the seat shaping goes into the yoke seam, so the back leg has no dart
  let yokeB = null;
  if (K.yoke?.back) { const ln = [[.8, 2.75], [B.sideX - 1, 1.15]], cut = splitPiece(B.sew, ln), cutS = splitPiece(B.shown, ln), top = ps => ps && ps.slice().sort((a, b) => boundsOf(a).y1 - boundsOf(b).y1);
    if (cut && cutS) { const [ys, rest] = top(cut), [yh, restS] = top(cutS); B.sew = rest; B.shown = restS; yokeB = { sew: ys, shown: yh }; } }
  // on the flats the front of the right leg is drawn on the viewer's left: the pieces are placed as one leg each side, from the centre
  pieces.push(piece('front', 'Front leg', F.sew, { cut: 2, pair: true, grain: [[F.crease, hipY + 2], [F.crease, Hy - 3]], notches: [[F.ext, rd], [-(m.hip / 2 - .5), hipY]], notes: [S.label === 'Leggings' ? 'Four-way stretch' : 'Crease line is the grain'], place: { view: 'front', x: 0, y: wb, flip: true } }));
  pieces.push(twin('front-2', 'Front leg', F.sew, { view: 'front', x: 0, y: wb }));
  pieces[pieces.length - 2].shown = F.shown; pieces[pieces.length - 1].shown = F.shown;
  pieces.push(piece('back', 'Back leg', B.sew, { cut: 2, pair: true, grain: [[B.crease, hipY + 2], [B.crease, Hy - 3]], notches: [[B.ext, rd], [B.ext - .5, rd], [-(m.hip / 2 + .5), hipY]], notes: [dartB ? `Two notches mark the back; one dart at the waist, ${dartB} in wide and 3½ in long, 3 in from the centre back` : 'Two notches mark the back; dart or seat seam at the waist'], place: { view: 'back', x: 0, y: wb } }));
  pieces.push(twin('back-2', 'Back leg', B.sew, { view: 'back', x: 0, y: wb, flip: true }));
  pieces[pieces.length - 2].shown = B.shown; pieces[pieces.length - 1].shown = B.shown;
  if (yokeB) { pieces.find(x => x.id === 'back').notes = ['Two notches mark the back; the seat shaping is in the yoke seam'];
    pieces.push(piece('back-yoke', 'Back yoke', yokeB.sew, { cut: 2, pair: true, notes: ['Felled to the back leg, the seam topstitched twice'], place: { view: 'back', x: 0, y: wb, z: 1 } }));
    pieces.push(twin('back-yoke-2', 'Back yoke', yokeB.sew, { view: 'back', x: 0, y: wb, flip: true, z: 1 }));
    pieces[pieces.length - 2].shown = yokeB.shown; pieces[pieces.length - 1].shown = yokeB.shown; }
  const pleatOf = () => (K.pleats || 0) * 1.25;
  let coinShown = null;
  // the front pocket openings, seen on the product: a slash pocket a straight slant from the waist to the side seam, a jeans scoop a curve; as
  // thin shapes on each front leg (the pocket bags and facings are inside)
  { const wx = Math.min(...F.shown.filter(([, y]) => y < .01).map(([x]) => x)), sideAt = y => { const xs = []; const P = F.shown; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } return xs.length ? Math.min(...xs) : F.sideX; }, thin = pts => [...pts, ...pts.slice().reverse().map(([x, y]) => [x + .06, y + .06])];
    const open = has('five-pocket') ? thin([[wx + 3.6, 0], ...tail(cubic([wx + 3.6, 0], [wx + 3.4, 2.2], [wx + 1.6, 3.2], [sideAt(3.3) + .05, 3.3]))]) : has('slash') ? thin([[wx + 1.7, 0], [sideAt(6.5) + .05, 6.5]]) : null;
    if (open) for (const sg of [1, -1]) pieces.push({ ...piece(`pocket-opening${sg < 0 ? '-2' : ''}`, 'Pocket opening', open, { cut: 0, shown: open, place: { view: 'front', x: 0, y: wb, ...(sg > 0 ? { flip: true } : {}), z: 2 } }), of: 'front', twin: true, copy: true });
    // the coin pocket sits on the right front's pocket facing, inside the scoop; the carpenter's rule pocket down the right thigh, at the side,
    // and the hammer loop on the left, at the side seam below the hip
    if (has('five-pocket') && K.coinPocket !== false) coinShown = [[wx + .55, .55], [wx + 2.25, .45], [wx + 2.2, 2.25], [wx + .6, 2.35]];
    if (K.utility) { const ry = rd + 1.5, rx = sideAt(ry), rule = [[rx + .2, ry], [rx + 2.7, ry], [rx + 2.7, ry + 8], [rx + .2, ry + 8]], hy = rd - 1.5, hx = sideAt(hy), loop = [[hx - .2, hy], [hx + .9, hy], [hx + .9, hy + 5.5], [hx - .2, hy + 5.5]];
      pieces.push(piece('rule-pocket', 'Rule pocket', rect(3.25, 9), { cut: 1, notes: ['Patch, open at the top, on the right thigh at the side seam; bar-tacked'], shown: rule, place: { view: 'front', x: 0, y: wb, flip: true, z: 3 } }),
        piece('hammer-loop', 'Hammer loop', rect(2.25, 6.5), { cut: 1, notes: ['Folded double, caught into the left side seam and bar-tacked below'], shown: loop, place: { view: 'front', x: 0, y: wb, z: 3 } })); } }
  // pleat lines on the front, from the waist, the first on the crease
  if (K.pleats) for (let i = 0; i < K.pleats; i++) for (const sg of [1, -1]) { const x = F.crease - i * 1.6, ln = [[x, 0], [x + .07, 0], [x + .07, 3.2], [x, 3.2]];
    pieces.push({ ...piece(`pleat-${i}${sg < 0 ? '-2' : ''}`, 'Pleat', ln, { cut: 0, shown: ln, place: { view: 'front', x: 0, y: wb, ...(sg > 0 ? { flip: true } : {}), z: 2 } }), of: 'front', twin: true, copy: true }); }
  const elastic = K.waist ? K.waist !== 'fixed' : (/jogger|sweat/.test(String(o.template || '')) || style === 'leggings'), drawcord = K.waist === 'drawcord' || (elastic && o.drawcord);
  if (K.leg && K.leg !== 'straight') for (const q of pieces.filter(x => x.id === 'front' || x.id === 'back')) q.notes.push({ flare: 'Flared from the knee', wide: 'Wide leg: the hem 1½× the usual opening', taper: 'Tapered to the hem', balloon: 'Balloon leg: full at the knee, drawn in at the hem' }[K.leg]);
  if (K.pleats) { const f = pieces.find(x => x.id === 'front'); f.notes.push(`${K.pleats} forward pleat${K.pleats > 1 ? 's' : ''}, 1¼ in each, the first on the crease line`); }
  // a double knee: a second layer over the front knee, from 5 in above the knee to 6½ in below, open at the top for a pad
  if (K.knee === 'double') { const kp = bandOf(F.shown, Math.max(rd + 1, F.kneeY - 5), Math.min(Hy - 1, F.kneeY + 6.5));
    if (kp) pieces.push(piece('knee', 'Knee panel', bandOf(F.sew, Math.max(rd + 1, F.kneeY - 5), Math.min(Hy - 1, F.kneeY + 6.5)) || kp, { shown: kp, cut: 2, pair: true, notes: ['Second layer over the front knee, topstitched down the sides and across the bottom; open at the top (a knee pad slips in)'], place: { view: 'front', x: 0, y: wb, flip: true, z: 2 } }), { ...twin('knee-2', 'Knee panel', kp, { view: 'front', x: 0, y: wb, z: 2 }), shown: kp }); }
  // cargo pockets on the side of the thigh: a bellows pocket and a flap
  if (has('cargo') && inseam > 4) { const cw = 7, chh = Math.min(8, inseam * .45), cy = rd + Math.min(2.5, inseam * .1), cxp = F.sideX + .4, cg = [[cxp, cy], [cxp + cw * .8, cy], [cxp + cw * .8, cy + chh], [cxp, cy + chh]], fl = [[cxp - .2, cy - 1.2], [cxp + cw * .8 + .2, cy - 1.2], [cxp + cw * .8 + .2, cy + 1.6], [cxp - .2, cy + 1.6]];
    pieces.push(piece('cargo', 'Cargo pocket', rect(cw + 2, chh + 1.25), { cut: 2, pair: true, shown: cg, notes: ['1 in bellows each side and at the bottom; on the side seam of the thigh'], place: { view: 'front', x: 0, y: wb, flip: true, z: 3 } }), twin('cargo-2', 'Cargo pocket', rect(cw + 2, chh + 1.25), { view: 'front', x: 0, y: wb, z: 3 }),
      piece('cargo-flap', 'Cargo pocket flap', rect(cw + .5, 3), { cut: 4, pair: true, shown: fl, notes: ['Outer and facing, the outer fused; a snap or hook-and-loop under'], place: { view: 'front', x: 0, y: wb, flip: true, z: 4 } }), twin('cargo-flap-2', 'Cargo pocket flap', rect(cw + .5, 3), { view: 'front', x: 0, y: wb, z: 4 }));
    for (const q of pieces.filter(x => x.id === 'cargo' || x.id === 'cargo-2')) q.shown = cg; for (const q of pieces.filter(x => /^cargo-flap/.test(x.id))) q.shown = fl;
    trims.push({ item: 'Snaps', spec: 'Ring snaps, 15 mm, under the cargo flaps', qty: 2, where: 'Cargo pockets' }); }
  // a side stripe (tape) or a contrast side panel down the outseam
  if (K.panels === 'side-stripe') {
    // the tape seen down each outseam, front and back: from the waist down the side to the hem
    for (const [v, Lg] of [['front', F], ['back', B]]) { const side = outerSide(Lg), strip = [...side, ...side.slice().reverse().map(([x, y]) => [x + 1.1, y])];
      for (const sg of [1, -1]) pieces.push({ ...piece(`stripe-${v}${sg < 0 ? '-2' : ''}`, 'Stripe', strip, { fabric: 'contrast', cut: 0, shown: strip, place: { view: v, x: 0, y: wb, ...((v === 'front') === (sg > 0) ? { flip: true } : {}), z: 2 } }), of: 'front', twin: true, copy: true }); }
    trims.push({ item: 'Stripe tape', spec: '1¼ in woven tape', qty: `${r8((m.rise + inseam + 1) * 2)} in`, where: 'Down each side seam, waist to hem' }); for (const q of pieces.filter(x => x.id === 'front')) q.notes.push('Stripe tape down the side seam'); }
  if (K.panels === 'side-panel') { const side = outerSide(F), strip = [...side.map(([x, y]) => [x - 1.25, y]), ...side.slice().reverse().map(([x, y]) => [x + 1.25, y])];
    pieces.push(piece('side-panel', 'Side panel', [[-1.25, 0], [1.25, 0], [1.25, Hy], [-1.25, Hy]], { cut: 2, fabric: 'contrast', shown: strip, notes: ['Contrast; 2½ in wide, between the front and back legs at the side seam'], place: { view: 'front', x: 0, y: wb, flip: true, z: 1 } }), { ...twin('side-panel-2', 'Side panel', [[-1.25, 0], [1.25, 0], [1.25, Hy], [-1.25, Hy]], { view: 'front', x: 0, y: wb, z: 1 }), fabric: 'contrast', shown: strip }); }
  // the panel runs down the side, so it shows from the back as well
  if (K.panels === 'side-panel') { const side = outerSide(B), strip = [...side.map(([x, y]) => [x - 1.25, y]), ...side.slice().reverse().map(([x, y]) => [x + 1.25, y])];
    for (const [id, fl] of [['side-panel-back', false], ['side-panel-back-2', true]]) pieces.push({ ...piece(id, 'Side panel', strip, { cut: 0, fabric: 'contrast', shown: strip, place: { view: 'back', x: 0, y: wb, ...(fl ? { flip: true } : {}), z: 1 } }), twin: true, copy: true, of: 'side-panel' }); }
  // the ankle: a rib cuff (joggers), or elastic in a turned channel
  if (K.ankle === 'cuff' && inseam > 14) { const ch = 2.75, cuff = Lg => { const a = Lg.hIn[0] - .15, b = Lg.hOut[0] + .15; return [[a, Hy], [b, Hy], [b, Hy + ch], [a, Hy + ch]]; }, circ = r8((F.hemW + B.hemW) * .85);
    pieces.push(piece('cuff', 'Ankle cuff', rect(circ, ch * 2), { cut: 2, fabric: 'rib', notes: [`1x1 rib, folded; ${circ} in round, stretched onto the hem`], shown: cuff(F), place: { view: 'front', x: 0, y: wb, flip: true, z: 2 } }), { ...twin('cuff-2', 'Ankle cuff', cuff(F), { view: 'front', x: 0, y: wb, z: 2 }), shown: cuff(F) },
      { ...piece('cuff-back', 'Ankle cuff', cuff(B), { cut: 0, shown: cuff(B), place: { view: 'back', x: 0, y: wb, z: 2 } }), twin: true, copy: true, of: 'cuff' }, { ...piece('cuff-back-2', 'Ankle cuff', cuff(B), { cut: 0, shown: cuff(B), place: { view: 'back', x: 0, y: wb, flip: true, z: 2 } }), twin: true, copy: true, of: 'cuff' }); }
  if (K.ankle === 'elastic') { trims.push({ item: 'Ankle elastic', spec: '¾ in knitted elastic', qty: `${r8((F.hemW + B.hemW) * .8 * 2)} in`, where: 'In a turned channel at each hem' }); for (const q of pieces.filter(x => x.id === 'front' || x.id === 'back')) q.notes.push('Hem turned 1 in for the ankle elastic'); }
  if (K.hem === 'curved') for (const q of pieces.filter(x => x.id === 'front' || x.id === 'back')) q.notes.push('Curved hem: rises to the side seam, the hem bound or faced');
  if (drawcord) trims.push({ item: 'Drawcord', spec: '¼ in flat or round cord, tipped ends', qty: `${r8(m.waist * 2 + 22)} in`, where: 'Through the waistband' }, { item: 'Eyelets', spec: '¼ in, with washers (or two buttonholes)', qty: 2, where: 'Centre front of the waistband' });
  if (elastic) trims.push({ item: 'Elastic', spec: `${r8(wb - .25)} in knitted elastic`, qty: `${r8(m.waist * 2 * .9)} in`, where: 'In the waistband' });
  // belt loops: one strip, folded in four, cut into seven loops; shown on the band, front and back
  if (K.beltLoops && !elastic) { const lw = .5, lh = wb + .4, loop = x => [[x - lw / 2, -.2], [x + lw / 2, -.2], [x + lw / 2, lh - .2], [x - lw / 2, lh - .2]];
    pieces.push(piece('belt-loops', 'Belt loops', rect(2, 7 * (lh + 1.25)), { cut: 1, notes: ['One strip, folded in four and edge-stitched, cut into 7 loops: two at the front, one at each side, three at the back'], shown: loop(0), place: { view: 'front', x: -(m.waist / 2 - 3.4), y: 0, z: 5 } }));
    for (const [id, v, x] of [['belt-loop-2', 'front', m.waist / 2 - 3.4], ['belt-loop-3', 'back', -(m.waist / 2 - 1)], ['belt-loop-4', 'back', m.waist / 2 - 1], ['belt-loop-5', 'back', 0]]) pieces.push({ ...piece(id, 'Belt loop', loop(0), { cut: 0, shown: loop(0), place: { view: v, x, y: 0, z: 5 } }), twin: true, copy: true, of: 'belt-loops' });
    trims.push({ item: 'Belt loops', spec: `½ in finished, ${r8(lh)} in long, bar-tacked top and bottom`, qty: 7, where: 'Waistband' }); }
  const topRound = 2 * (Math.abs(BLOCK.front.at.sideTop[0]) + Math.abs(BLOCK.back.at.sideTop[0])); // the legs' top edge round (front and back, both legs)
  pieces.push(piece('waistband', elastic ? 'Waistband (elastic channel)' : 'Waistband', rect(r8(elastic ? topRound + (K.panels === 'side-panel' ? 5 : 0) : m.waist * 2 + 1.5), wb * 2), { shown: [[m.waist + .75 - m.waist / 2, 0], [m.waist + .75 + m.waist / 2, 0], [m.waist + .75 + m.waist / 2, wb], [m.waist + .75 - m.waist / 2, wb]], notes: [elastic ? `Elastic ${r8(wb - .25)} in wide${drawcord ? ', drawcord through two eyelets' : ''}` : 'Fused, 1½ in overlap for the button'], place: { view: 'front', x: -m.waist - .75, y: 0, z: 2 } }));
  { const w = pieces.find(x => x.id === 'waistband'); pieces.push({ ...piece('waistband-back', w.name, w.sew, { cut: 0, shown: w.shown, place: { ...w.place, view: 'back' } }), twin: true, copy: true, of: 'waistband' }); } // the same band, seen from the back
  if (style !== 'leggings') {
    pieces.push(piece('pocket-bag', 'Pocket bag', [[0, 0], [6.5, 0], [6.5, 9], ...tail(cubic([6.5, 9], [6.5, 11.5], [2, 11.5], [0, 10]))], { fabric: 'pocketing', cut: 4, pair: true, hidden: true, place: { view: 'front', x: m.waist / 2 - 7.2, y: wb, z: -1 } }));
    if (!elastic) pieces.push(piece('fly', 'Fly facing', [[0, 0], [1.75, 0], [1.75, 6], ...tail(cubic([1.75, 6], [1.75, 7.6], [.6, 7.8], [0, 7.8]))], { cut: 2, notes: ['Fused; a 7 in zip'], place: { view: 'front', x: -1.9, y: wb, z: 2 } }));
    // the back pockets: a jeans pocket (pointed), a square patch with rounded corners, or a welt (a slit with a facing, the bag inside)
    { const sq = [[0, 0], [5.75, 0], [5.75, 5.6], ...tail(cubic([5.75, 5.6], [5.75, 6.4], [5.4, 6.5], [4.8, 6.5])), [.95, 6.5], ...tail(cubic([.95, 6.5], [.35, 6.5], [0, 6.4], [0, 5.6]))], welt = [[0, 0], [5.25, 0], [5.25, .5], [0, .5]], py = wb + (K.yoke?.back ? 3.9 : 1.8);
      if (K.backPockets !== false && (K.backPocket === 'square' || K.backPocket === 'welt')) { const shp = K.backPocket === 'square' ? sq : welt, nm = K.backPocket === 'square' ? 'Back pocket' : 'Back welt';
        pieces.push(piece('back-pocket', nm, K.backPocket === 'square' ? sq : rect(6.25, 1.25), { cut: 2, notes: [K.backPocket === 'square' ? '1 in turn-back at the opening, the corners rounded' : 'Jetted: the welt 1/2 in finished, a bag of pocketing inside'], shown: shp, place: { view: 'back', x: 1.6, y: py, z: 3 } }), { ...twin('back-pocket-2', nm, shp, { view: 'back', x: -1.6, y: py, flip: true, z: 3 }), shown: shp });
        if (K.backPocket === 'welt') pieces.push(piece('back-pocket-bag', 'Back pocket bag', rect(6.5, 7.5), { fabric: 'pocketing', cut: 2, hidden: true, notes: ['Behind the welt'], place: { view: 'back', x: 1.6, y: py, z: -1 } })); }
      else if (K.backPockets !== false) { pieces.push(piece('back-pocket', 'Back pocket', [[0, 0], [5, -.4], [4.8, 5.6], [2.6, 6.4], [.4, 5.8]], { cut: 2, notes: ['1 in turn-back at the opening'], place: { view: 'back', x: 1.8, y: wb + (K.yoke?.back ? 3.9 : 1.8), z: 3 } }), twin('back-pocket-2', 'Back pocket', [[0, 0], [5, -.4], [4.8, 5.6], [2.6, 6.4], [.4, 5.8]], { view: 'back', x: -1.8, y: wb + (K.yoke?.back ? 3.9 : 1.8), flip: true, z: 3 })); } }
    if (has('five-pocket')) { if (coinShown) pieces.push(piece('coin-pocket', 'Coin pocket', rect(3, 3.25), { cut: 1, notes: ['On the right front pocket facing, double-needle topstitched'], shown: coinShown, place: { view: 'front', x: 0, y: wb, flip: true, z: 3 } }));
      trims.push({ item: 'Rivets', spec: 'Copper burr rivets, 9 mm', qty: 6, where: 'Front pocket corners and coin pocket' }, { item: 'Shank button', spec: '17 mm tack button', qty: 1, where: 'Waistband' }); if (!elastic) trims.push({ item: 'Fly zip', spec: '#4.5 metal, 7 in, closed-end', qty: 1, where: 'Fly' }); }
  }
  pieces.trims = trims; pieces.block = BLOCK;
  return pieces;
}
function capPieces(S, m, o) {
  const pieces = [];
  if (S.bucket) {
    // the head opening (23 in, one size) is the band's foot, where the brim is sewn; the band narrows by its flare to the crown, whose oval is
    // solved to the band's top; the brim's inner edge is the band's foot (src/lab-pattern-check.js walks each seam)
    const C = 23, bandH = m.crownHeight, flare = .75, brim = m.brimLength, topC = C - 4 * flare;
    let r = topC / (2 * Math.PI); for (let k = 0; k < 6; k++) r *= topC / lenOf([...ellipse(r * 1.08, r * .92, 48), ellipse(r * 1.08, r * .92, 48)[0]]);
    // seen from the front, as its sketch draws it: the band, a little wider at the brim; the crown's top a thin edge above it; the brim
    // sloping down and out all round
    const wt = C / Math.PI * .98, wb = wt + flare * 1.2, h = m.crownHeight, bo = brim * .78, bd = brim * .62, sp = (pts, n = 6) => pts, top = Array.from({ length: 13 }, (_, k) => { const a = Math.PI + k / 12 * Math.PI; return [Math.cos(a) * wt / 2, -h + Math.sin(a) * .35]; });
    void sp;
    pieces.push(piece('crown', 'Crown top', ellipse(r * 1.08, r * .92, 48), { cut: 2, notes: ['Outer and lining'], shown: [...top, ...top.slice().reverse().map(([x, y]) => [x, -h + (-h - y) * -.4 - .0])], place: { view: 'front', x: 0, y: 0, z: 1 } }));
    // The band and the brim are each a cone round the head, and a cone opens flat into part of a ring: its two curved edges the cone's two
    // rims, its straight ends the cone's slant. (Cut as a straight-sided trapezoid, its ends came out longer than its middle: a brim 2¼ in
    // at the front was 3¾ in at the side seams.) Half of each is cut, twice.
    const ring = (R1, R2, ang, n) => { const pt = (R, a) => [R * Math.sin(a), R * Math.cos(a) - R1], inn = Array.from({ length: n + 1 }, (_, i) => pt(R1, -ang / 2 + ang * i / n)), out = Array.from({ length: n + 1 }, (_, i) => pt(R2, ang / 2 - ang * i / n)); return { pts: [...inn, ...out], a0: inn[0], a1: inn[n], b1: out[0], b0: out[n] }; };
    // the band: its top rim the crown's round, its foot the head's, the crown's height up its slant
    const bR1 = bandH * topC / (C - topC), bandR = ring(bR1, bR1 + bandH, C / 2 / (bR1 + bandH), 16), bandP = bandR.pts;
    // the brim: its inner rim the head's round, reaching out 0.78 of its length (as its sketch draws it), its length down its slant
    const outC = C + 2 * Math.PI * .78 * brim, mR1 = brim * C / (outC - C), brimR = ring(mR1, mR1 + brim, C / 2 / mR1, 36), brimP = brimR.pts;
    pieces.push(piece('band', 'Side band', bandP, { cut: 4, notes: ['Two halves, outer and lining', 'Part of a ring: the curved edges are the crown seam and the brim seam'], shown: [[-wt / 2, -h], [wt / 2, -h], [wb / 2, 0], [-wb / 2, 0]], place: { view: 'front', x: 0, y: 0, z: 0 } }));
    pieces.push(piece('brim', 'Brim', brimP, { cut: 4, notes: ['Two halves, top and under; rows of topstitching every ¼ in', 'Half a ring: the inner edge is sewn to the band\'s foot'], shown: [[-wb / 2, 0], ...tail(cubic([-wb / 2, 0], [-wb * .2, .25], [wb * .2, .25], [wb / 2, 0])), [wb / 2 + bo, bd], ...tail(cubic([wb / 2 + bo, bd], [wb * .3, bd + .9], [-wb * .3, bd + .9], [-wb / 2 - bo, bd]))], place: { view: 'front', x: 0, y: 0, z: 2 } }));
    pieces.block = { crown: { sew: tidy(ellipse(r * 1.08, r * .92, 48)), at: {} }, band: { sew: tidy(bandP), at: { t0: bandR.a0, t1: bandR.a1, b1: bandR.b1, b0: bandR.b0 } }, brim: { sew: tidy(brimP), at: { i0: brimR.a0, i1: brimR.a1, o1: brimR.b1, o0: brimR.b0 } } };
    return pieces;
  }
  // the crown's six panels, each as long from the band to the button as a quarter of the dome (the head's round, the crown's height) is
  // around: solved, not guessed (src/lab-pattern-check.js measures the crown height back off the panel)
  // The dome is the head's round at its foot and the crown's height tall. A panel is a sixth of it: at every point of its length it is as
  // wide as a sixth of the dome is round there, so the six lie round the crown and meet in a point under the button. (Drawn as a free
  // curve it was too wide towards the top: the six together were 13½ in where the dome is 9½ in round.)
  const C = 22.75 + (m.crownWidth - 8.5) * 2, base = C / 6, qa = C / (2 * Math.PI), qb = m.crownHeight;
  const mer = Array.from({ length: 25 }, (_, i) => { const t = i / 24 * Math.PI / 2; return [qa * Math.sin(t), qb * (1 - Math.cos(t))]; });
  let run = 0; const gore = mer.map((q, i) => { if (i) run += Math.hypot(q[0] - mer[i - 1][0], q[1] - mer[i - 1][1]); return [Math.PI * q[0] / 6, run]; }), ph = run;
  const panel = [...gore, ...gore.slice(1).reverse().map(([x, y]) => [-x, y])];
  // a back panel: the back opening cut from its foot at the centre back seam, 1⅛ in across and 1½ in up (the two make the 2¼ in opening)
  const OH = 1.5, k = gore.findIndex(([, y]) => y >= ph - OH), ga = gore[k - 1], gb = gore[k], xr = ga[0] + (gb[0] - ga[0]) * (ph - OH - ga[1]) / (gb[1] - ga[1]), OW = 1.125 - (base / 2 - xr); // the foot ends 1⅛ in short of the panel's corner
  const backPanel = [...gore.slice(0, k), ...Array.from({ length: 7 }, (_, i) => { const a = i / 6 * Math.PI / 2; return [xr - OW * Math.sin(a), ph - OH * Math.cos(a)]; }), ...gore.slice(1).reverse().map(([x, y]) => [-x, y])];
  // on the product every panel hangs from the button at the top of the crown, turned out round it: the fronts a little, the sides further
  const PANELS = [['front', 'Front panel', 'Fused with buckram for structure', 13, 1], ['side', 'Side panel', 'One embroidered eyelet', 38, 0], ['back', 'Back panel', 'The back opening cut from its foot at the centre back: 1⅛ in across, 1½ in up (2¼ in across the two)', 13, 1]];
  // seen from the front, as its sketch draws it: a dome (the crown's width across, its height up), the two fronts meeting at the centre seam,
  // the sides showing at its edges; the back from behind the same, the opening at its foot
  const Wd = C / Math.PI * 1.08, Hd = m.crownHeight * 1.05, dome = x => -Hd * Math.sqrt(Math.max(0, 1 - (x / (Wd / 2)) ** 2)) ** .85, arc = (a, b) => Array.from({ length: 9 }, (_, k) => { const x = a + (b - a) * k / 8; return [x, dome(x)]; });
  const SEEN = { front: [...arc(0, Wd * .34), [Wd * .34, 0], [0, 0]], side: [...arc(Wd * .34, Wd / 2), [Wd * .34, 0]], back: [...arc(0, Wd * .34), [Wd * .34, 0], [1.1, 0], [1.1, -1.5], [0, -1.5]] };
  for (const [id, nm, note, , z] of PANELS) {
    const view = id === 'back' ? 'back' : 'front', at = { view, x: 0, y: 0, z };
    const out = id === 'back' ? backPanel : panel;
    pieces.push(piece(`panel-${id}`, nm, out, { cut: 2, pair: true, notes: [note], shown: SEEN[id], place: at }), { ...twin(`panel-${id}-2`, nm, out, { ...at, flip: true }), shown: SEEN[id] });
  }
  // the brim: its inner edge across the two front panels and onto the sides; its width and its length at the centre front (from the seam to
  // the edge) to the spec
  // (the inner and outer edges meet at the brim's widest points, so its inner edge spans the brim's width)
  // its inner edge bowed until it runs across the two front panels and an eighth of each side panel (src/lab-pattern-check.js walks it)
  const inner = m.brimWidth / 2, arcOf = c => lenOf(cubic([-inner, 0], [-inner * .4, c], [inner * .4, c], [inner, 0])), want = base * 2.25;
  let c0 = -3, c1 = 0; for (let k = 0; k < 40; k++) { const c = (c0 + c1) / 2; if (arcOf(c) > want) c0 = c; else c1 = c; } const cb = (c0 + c1) / 2, bow = cb * .75, bl = m.brimLength + bow;
  const brimOf = (iw, y0, tip) => [...cubic([-iw, y0], [-iw * .4, y0 + cb], [iw * .4, y0 + cb], [iw, y0]), ...tail(cubic([iw, y0], [iw, y0 + (tip - y0) * .35], [iw * .7, tip + (tip - y0) * .05], [0, tip])), ...tail(cubic([0, tip], [-iw * .7, tip + (tip - y0) * .05], [-iw, y0 + (tip - y0) * .35], [-iw, y0])).slice(0, -1)];
  // the board: the brim ¼ in in from its edge all round, its two points (where the brim narrows to nothing) left out
  const brim = brimOf(inner, 0, bl), clear = (p, P) => Math.min(...P.map((a, i) => { const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }));
  const inBrim = ([x, y]) => { let c = false; for (let i = 0, j = brim.length - 1; i < brim.length; j = i++) { const [xi, yi] = brim[i], [xj, yj] = brim[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const board = offsetOf(tidy(brim), -.25).filter(p => inBrim(p) && clear(p, brim) > .2);
  // the brim from the front: a visor, as wide as the brim, curving down below the crown
  const bw = m.brimWidth / 2, visor = [[-bw * .78, -.05], ...tail(cubic([-bw * .78, -.05], [-bw * .3, -.3], [bw * .3, -.3], [bw * .78, -.05])), ...tail(cubic([bw * .78, -.05], [bw * .95, .5], [bw * .4, bl * .36], [0, bl * .36])), ...tail(cubic([0, bl * .36], [-bw * .4, bl * .36], [-bw * .95, .5], [-bw * .78, -.05])).slice(0, -1)];
  pieces.push(piece('brim', 'Brim', brim, { cut: 2, notes: ['Top and under, over a board insert; 8 rows of stitching'], shown: visor, place: { view: 'front', x: 0, y: 0, z: 3 } }));
  pieces.push({ ...piece('brim-board', 'Brim board', board, { fabric: 'board', cut: 1, notes: ['0.8 mm plastic board'], hidden: true, shown: visor, place: { view: 'front', x: 0, y: 0, z: 2 }, sa: 0 }) });
  pieces.push(piece('sweatband', 'Sweatband', rect(r8(C - 2.25 + 1), 1.25), { fabric: 'self', cut: 1, notes: ['Cotton or moisture-wicking tape; the main label sewn at the centre back'], hidden: true, shown: [[-Wd / 2 + .2, -1], [Wd / 2 - .2, -1], [Wd / 2 - .2, -.2], [-Wd / 2 + .2, -.2]], place: { view: 'back', x: 0, y: 0, z: -1 }, sa: 0 }));
  // the front panels' buckram, the brim's board inside it; the block the check walks: a panel (the button at its top, the band at its foot) and the brim
  pieces.push(piece('front-buckram', 'Front panel buckram', panel, { fabric: 'fusing', cut: 2, pair: true, hidden: true, notes: ['Fused buckram, so the front stands'], place: { view: 'front', x: 0, y: 0, z: 0 } }));
  pieces.block = { panel: { sew: tidy(panel), at: { tl: [0, 0], tr: [0, 0], br: [base / 2, ph], bl: [-base / 2, ph] } }, brim: { sew: tidy(brim), at: { i0: [-inner, 0], i1: [inner, 0], tip: [0, bl] }, bow } };
  return pieces;
}
function beaniePieces(m) {
  // Knitted flat and linked at the back: twice the flat width round, the height and the cuff long. The crown is closed by decreases at four
  // points, so the top of the piece is four petals, each as tall as it is wide (they close into the round of the crown); the cuff's fold is
  // marked at each edge.
  const W = r8(m.width * 2), L = r8(m.height + m.cuff), pw = W / 4, ch = Math.min(pw, L * .4), top = [];
  for (let k = 0; k < 4; k++) for (let i = (k ? 1 : 0); i <= 10; i++) { const t = i / 10; top.push([k * pw + pw * t, ch * (1 - Math.sin(Math.PI * t))]); }
  const fold = L - m.cuff, body = piece('body', 'Knit body', [...top, [W, fold], [W, L], [0, L], [0, fold]], { fabric: 'knit', cut: 1, notches: [[0, fold], [W, fold]], notes: ['Knitted to shape on a flatbed: 1×1 rib, linked at the back', `The crown closed by decreases at four points: four petals, each ${r8(pw)} in wide and ${r8(ch)} in tall`, `The cuff (${m.cuff} in) turns up at the marked fold`], place: { view: 'front', x: -m.width, y: 0 }, sa: 0 });
  body.at = { foldL: [0, fold], foldR: [W, fold], hemL: [0, L], hemR: [W, L], tipL: [0, ch], tipR: [W, ch] };
  return [body];
}
function totePieces(m) {
  const w = m.width, H = m.height, hl = r8(m.handleDrop * 2 + 3);
  // one piece, folded at the bottom: twice the height, and 1½ in at each top edge to turn back
  const fold = H + 1.5, body = piece('body', 'Body', [[0, 0], [w, 0], [w, fold], [w, H * 2 + 3], [0, H * 2 + 3], [0, fold]], { cut: 1, notches: [[0, fold], [w, fold], [0, 1.5], [w, 1.5], [0, H * 2 + 1.5], [w, H * 2 + 1.5]], notes: ['Folded at the bottom (marked at each edge); side seams French-seamed', '1½ in turn-back at each top edge (marked)'], place: { view: 'front', x: -w / 2, y: 0 } });
  body.at = { tl: [0, 0], tr: [w, 0], fr: [w, fold], br: [w, H * 2 + 3], bl: [0, H * 2 + 3], fl: [0, fold] };
  return [body,
    piece('handle', 'Handle', rect(hl, r8(m.handleWidth * 4)), { cut: 2, notes: ['Folded in four and edge-stitched; box-stitched to the body'], place: { view: 'front', x: -w * .45, y: -m.handleDrop, z: 1 } })];
}

// the pattern of a garment, from its flats' params, at one size
// What every garment is made with beyond its shell, added where the drafting of its features has not already: the labels and the thread; a
// fly's zip and waist button and a fixed waistband's fusing; a skirt's zip; the fusing on a woven collar, stand, cuff and placket; a shirt's
// sleeve plackets; a hood's lining and its drawcord; a placket's buttons; a bra's elastics. src/lab-pattern-check.js (missingComponents)
// holds every garment to the same list.
function finishGarment(pieces, trims, { style, kind, m, K, knit, oneSize = false }) {
  const has = re => trims.some(t => re.test(t.item)), get = id => pieces.find(q => q.id === id && q.cut), add = (...q) => pieces.push(...q), T = (...t) => trims.push(...t);
  const fuse = (q, name, sew = q.sew) => piece(q.id + '-fuse', name, sew, { fabric: 'fusing', cut: q.cut, pair: q.pair, fold: q.fold, hidden: true, notes: [`Fused to the ${q.name.toLowerCase()}`], place: { ...q.place, z: (q.place?.z || 0) - 1 } });
  const swim = ['swimsuit', 'bikini'].includes(style), lab = kind === 'bottom' ? 'Centre back waistband, inside' : swim ? 'Left side seam, inside, 2 in above the leg' : kind === 'cap' ? 'Sweatband (or inside band), centre back' : kind === 'beanie' ? 'On the cuff, at the back seam' : kind === 'tote' ? 'Inside, below the top turn-back at one side seam' : 'Centre back neck, inside';
  if (!has(/^Main label$/)) T({ item: 'Main label', spec: swim || ['bra', 'leggings', 'bodysuit'].includes(style) ? 'Printed (heat transfer), tagless' : 'Woven, folded end', qty: 1, where: lab });
  if (!has(/^Size label$/) && !oneSize) T({ item: 'Size label', spec: swim || ['bra', 'leggings', 'bodysuit'].includes(style) ? 'Printed with the main label' : 'Woven', qty: 1, where: 'With the main label' });
  if (!has(/^Care and content label$/)) T({ item: 'Care and content label', spec: 'Printed satin, fibre content, care symbols and country of origin', qty: 1, where: kind === 'bottom' ? 'Left side seam, inside, 3 in below the waistband' : kind === 'cap' ? 'Inside, on the sweatband or a crown seam' : kind === 'beanie' ? 'Linked into the back seam, inside' : kind === 'tote' ? 'Side seam, inside' : 'Left side seam, inside, 4 in above the hem' });
  // headwear and a tote: what each is closed and finished with
  if (style === 'cap') { if (!has(/top button/i)) T({ item: 'Top button', spec: 'Fabric-covered metal button (squatchee), 18 mm', qty: 1, where: 'Crown, where the six panels meet' });
    if (!has(/strap|snap|buckle|closure/i)) T({ item: 'Back closure', spec: 'Plastic 7-position snap strap (or a cloth strap and metal slide buckle)', qty: 1, where: 'Back opening' });
    if (!has(/eyelet/i)) T({ item: 'Embroidered eyelets', spec: '6 mm, in the panel colour', qty: 6, where: 'One on each panel, 2 in below the button' });
    if (!has(/seam tape/i)) T({ item: 'Crown seam tape', spec: '½ in cotton herringbone, printed optional', qty: `${(pf => Math.ceil(6 * (pf.length ? (lenOf([...pf, pf[0]]) - boundsOf(pf).w) / 2 : 6.5) * 1.05))((pieces.find(q => q.id === 'panel-front') || {}).sew || [])} in`, where: 'Over the six crown seams, inside' }); }
  if (style === 'beanie' && !has(/yarn/i)) T({ item: 'Yarn', spec: '2/28 Nm acrylic (or merino), knitted 1×1 rib, 7 gauge', qty: `about ${Math.round((m.width * 2) * (m.height + m.cuff) * .0254 * .0254 * 2 * 300)} g`, where: 'The body, doubled at the cuff' });
  if (!has(/^Thread$/)) { // about a garment's thread: its seams (half the cut edges) times what each stitch takes, an overlock 14×, a lockstitch 2½×, a cover 18× on hems
    const seamIn = pieces.filter(q => q.cut && q.fabric !== 'fusing').reduce((a, q) => a + lenOf([...q.sew, q.sew[0]]) * q.cut / 2, 0), metres = Math.round(seamIn * .0254 * (knit ? 12 : 5) / 10) * 10;
    T({ item: 'Thread', spec: knit ? 'Tex 27 spun polyester for overlock and coverstitch; Tex 40 for lockstitch' : 'Tex 40 core-spun polyester for seams; Tex 60 for topstitching', qty: `about ${metres} m`, where: 'Throughout' }); }
  if (knit && (get('neck-rib') || get('hood')) && !has(/neck tape/i)) T({ item: 'Back neck tape', spec: '⅜ in herringbone cotton tape', qty: `${r8((m.neckWidth || 7) + 1.5)} in`, where: 'Over the back neck seam, shoulder to shoulder' });
  // the fly and the waistband
  const wb = get('waistband'), fixed = wb && !/elastic/i.test(wb.name);
  if (get('fly')) { if (!has(/zip/i)) T({ item: 'Fly zip', spec: '#4.5 YKK metal, closed-end, 7 in (a short fly 5 in)', qty: 1, where: 'Fly' });
    if (!has(/button|hook/i)) T({ item: 'Waistband button', spec: '24 L (15 mm) four-hole, plus a hook and bar inside', qty: 1, where: 'Waistband, centre front' });
    if (!get('fly-fuse')) add(fuse(get('fly'), 'Fly fusing')); }
  if (fixed && !get('waistband-fuse')) { const b = boundsOf(wb.sew); add(piece('waistband-fuse', 'Waistband fusing', rect(r8(b.w), r8(b.h / 2)), { fabric: 'fusing', cut: 1, hidden: true, notes: ['Fused to the outer half of the waistband'], place: { ...wb.place, z: (wb.place?.z || 0) - 1 } })); }
  if (style === 'skirt' && fixed && !get('fly') && !has(/zip/i)) T({ item: 'Invisible zip', spec: '#3 invisible, 8 in', qty: 1, where: 'Centre back (or left side)' }, { item: 'Hook and eye', spec: 'Trouser hook and bar', qty: 1, where: 'Top of the zip, on the waistband' });
  if (wb && !fixed && !has(/elastic/i)) T({ item: 'Elastic', spec: `${r8(Math.max(.75, (m.waistband || 1.5) - .25))} in woven knit-in elastic`, qty: `${r8(m.waist * 2 * .9)} in`, where: 'Waistband channel' });
  // fusing on woven collars, stands, cuffs and plackets
  for (const id of ['collar', 'stand']) { const q = get(id); if (q && q.fabric === 'self' && !/shearling/i.test(q.name) && !get(id + '-fuse') && !get('under-collar-fuse')) add({ ...fuse(q, `${q.name} fusing`), cut: Math.max(1, q.cut / 2) }); }
  const cf = get('cuff'); if (cf && cf.fabric === 'self' && ['shirt', 'shirtss'].includes(style) && !get('cuff-fuse')) add({ ...fuse(cf, 'Cuff fusing'), cut: Math.max(1, cf.cut / 2) });
  const pk = get('placket'); if (pk && !get('placket-fuse')) add(fuse(pk, 'Placket fusing'));
  if (pk && !has(/button|snap|zip/i)) T({ item: 'Buttons', spec: '18 L (11.5 mm) four-hole', qty: 3, where: 'Placket (two, and a spare on the care label)' });
  // a shirt's cuff opens at a sleeve placket: a tower placket over the slit, a bind under it
  if (cf && style === 'shirt' && !get('sleeve-placket')) add(piece('sleeve-placket', 'Sleeve placket', [[0, 0], [2.75, 0], [2.75, 6.5], [1.375, 7.5], [0, 6.5]], { cut: 2, pair: true, hidden: true, notes: ['Tower placket over a 5½ in slit, 1 in finished; a button at its middle'], place: { view: 'back', x: 0, y: 0, z: -1 } }),
    piece('placket-bind', 'Sleeve placket bind', rect(1.25, 6), { cut: 2, hidden: true, notes: ['Binds the under side of the slit'], place: { view: 'back', x: 0, y: 0, z: -1 } }));
  // a hood: lined (self on a sweatshirt, the lining on a jacket); its drawcord if it is drawn with one
  const hd = get('hood');
  if (hd && !get('hood-lining')) add(piece('hood-lining', 'Hood lining', hd.sew, { fabric: kind === 'top' && ['jacket', 'coat', 'vest'].includes(style) ? 'lining' : 'self', cut: hd.cut, pair: hd.pair, hidden: true, notes: ['Bagged to the hood along the front edge, the drawcord channel stitched through both'], place: { ...hd.place, z: (hd.place?.z || 0) - 1 } }));
  if (hd && hd.notes.some(n => /drawcord channel/i.test(n))) { if (!has(/drawcord/i)) T({ item: 'Drawcord', spec: '8 mm flat cotton, metal-tipped aglets', qty: `${r8(((m.neckWidth || 7) + 13.5) * 2 + 10)} in`, where: 'Hood channel' }); if (!has(/eyelet/i)) T({ item: 'Eyelets', spec: '10 mm metal, with a reinforcing patch behind', qty: 2, where: 'Hood front, either side of the neck' }); }
  if (style === 'bra' && !has(/elastic/i)) T({ item: 'Elastic', spec: '1 in plush-back underband elastic; ⅜ in picot elastic at the neck and armholes', qty: `${r8((m.chest || 16) * 2 * .85)} in underband, ${r8((m.chest || 16) * 2)} in picot`, where: 'Underband, neckline, armholes' });
}

export function garmentPattern(p, size = p.size || 'M') {
  const S = STYLES[p.style]; if (!S) return null;
  const K = constructionOf(p), m = measurementsFor(p, size), o = { ...(p.options || {}), template: p.template, K };
  const pieces = S.kind === 'top' ? topPieces(S, m, o, p.style) : S.kind === 'bottom' ? bottomPieces(S, m, o, p.style) : S.kind === 'cap' ? capPieces(S, m, o) : S.kind === 'beanie' ? beaniePieces(m) : totePieces(m), trims = pieces.trims || []; const block = pieces.block || null;
  const knit = ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'tank', 'bodysuit', 'swimsuit', 'bikini', 'bra', 'leggings', 'beanie'].includes(p.style);
  finishGarment(pieces, trims, { style: p.style, kind: S.kind, m, K, knit, oneSize: Boolean(S.oneSize) });
  return { kind: 'garment', style: p.style, label: S.label, size: S.oneSize ? 'One size' : size, sa: knit ? .375 : .5, construction: K, pieces: pieces.map(q => (q.sew ? { ...q, sew: tidy(q.sew) } : q)) /* every outline cut clean, however it was built */, trims, ...(block && Object.keys(block).length ? { block } : {}), notes: [knit ? 'Knit: ⅜ in seam allowance, overlocked' : 'Woven: ½ in seam allowance', 'A first block from the measurements: true it up on the first sample'] };
}

// ---- bags ----
// A bag drafted from its kind and size (src/lab-bags.js BAG_TYPES: width × height × depth of the body, inches): its panels, gussets, straps
// and handles, pockets, linings and the hardware, each as a factory cuts and builds it. On the product (front view) the panels and what is
// sewn on them sit where the bag's drawings put them: x from the centre, y down from the top of the body.
//
// A bag is drafted with how it goes together. Each piece of the shell and the lining labels its corners (`at`), and `assembly` lists every
// seam as the two runs of outline sewn together (a run: a piece, the corners it passes, and which copy when a piece is cut twice), every
// zip with the two edges it joins, every edge finished on its own, and everything sewn onto a panel with where it sits. Every gusset is
// sized from the edge it is sewn round, measured off that panel's outline. src/lab-pattern-check.js walks the list: the two sides of each
// seam, each zip in its opening, that no edge is left unsewn or sewn twice, and that what is sewn on a panel lies on it.
const roundRect = (w, h, r) => { r = Math.min(r, w / 2, h / 2); const q = (cx, cy, a0) => Array.from({ length: 5 }, (_, i) => { const a = a0 + i * Math.PI / 8; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  return [...q(w - r, r, -Math.PI / 2), ...q(w - r, h - r, 0), ...q(r, h - r, Math.PI / 2), ...q(r, r, Math.PI)]; };
const at0 = (pts, x, y) => pts.map(([a, b]) => [a + x, b + y]);
export const BAG_KINDS = ['rolltop', 'backpack', 'drawstring', 'sling', 'tote', 'helmet', 'briefcase', 'messenger', 'duffel', 'waist', 'pouch'];
const arcQ = (cx, cy, r, a0, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + i / n * Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
// a panel with a straight top (its two top corners square) and rounded bottom corners; `up`: carried up above the body (a roll, a turn-back)
function panelU(W, H, r, up = 0) { r = Math.max(.05, Math.min(r, W / 4, H / 4));
  return { pts: [[0, -up], [W, -up], ...arcQ(W - r, H - r, r, 0), [W / 2, H], ...arcQ(r, H - r, r, Math.PI / 2)], at: { tl: [0, -up], tr: [W, -up], bm: [W / 2, H] } }; }
// a panel rounded at all four corners (a clamshell): the base gusset comes `rise` up each side, the zip gusset runs over the top between
function panelO(W, H, r, rise) { r = Math.max(.05, Math.min(r, W / 4, H / 4)); const y = H - Math.min(Math.max(rise, r + .25), H - r - .25);
  return { pts: [[W / 2, 0], ...arcQ(W - r, r, r, -Math.PI / 2), [W, y], ...arcQ(W - r, H - r, r, 0), [W / 2, H], ...arcQ(r, H - r, r, Math.PI / 2), [0, y], ...arcQ(r, r, r, Math.PI)], at: { tm: [W / 2, 0], sr: [W, y], bm: [W / 2, H], sl: [0, y] } }; }
// a crescent (a sling, a waist bag): the zip runs over the top from side point to side point, the gusset round the belly
function panelC(W, H) { const top = cubic([0, H * .18], [W * .2, -H * .05], [W * .8, -H * .05], [W, H * .18]), rt = cubic([W, H * .18], [W * 1.02, H * .7], [W * .85, H], [W * .5, H]), lf = cubic([W * .5, H], [W * .15, H], [-W * .02, H * .7], [0, H * .18]);
  return { pts: [...top, ...tail(rt), ...tail(lf).slice(0, -1)], at: { l: top[0], tm: top[6], r: top[12], bm: [W * .5, H] } }; }
const stripOf = (len, w) => ({ pts: rect(len, w), at: { a: [0, 0], b: [len, 0], c: [len, w], d: [0, w] } });
// the length of a shape's outline from one labelled corner to another, by the run that passes none of its other labelled corners
function edgeRun(sh, a, b) { const P = sh.pts, n = P.length, ix = k => { let j = -1, d = Infinity; P.forEach((p, i) => { const e = Math.hypot(p[0] - sh.at[k][0], p[1] - sh.at[k][1]); if (e < d) { d = e; j = i; } }); return j; };
  const i = ix(a), j = ix(b), others = new Set(Object.keys(sh.at).filter(k => k !== a && k !== b).map(ix));
  const walk = (s, e) => { let L = 0, k = s, hit = false; for (let t = 0; t < n && k !== e; t++) { const nx = (k + 1) % n; L += Math.hypot(P[k][0] - P[nx][0], P[k][1] - P[nx][1]); k = nx; if (k !== e && others.has(k)) hit = true; } return { L, hit }; };
  const f = walk(i, j), r = walk(j, i); return (!f.hit ? f : !r.hit ? r : f.L <= r.L ? f : r).L; }
const pathOf = (sh, ...ks) => ks.slice(1).reduce((s, k, i) => s + edgeRun(sh, ks[i], k), 0);
const ZIP_SHOW = .5; // how much of a zip shows between the two edges it is sewn to
export function bagPattern(spec = {}) {
  const type = BAG_KINDS.includes(spec.type) ? spec.type : 'tote', DEF = { rolltop: [12, 18, 6], backpack: [12, 17, 5.5], drawstring: [12, 17, 6], sling: [10, 6.5, 3], tote: [16, 14, 5.5], helmet: [19, 20, 5], briefcase: [16, 11.5, 3.5], messenger: [15, 11, 4], duffel: [22, 11, 11], waist: [11, 5.5, 2.5], pouch: [7.5, 9.5, 2] }[type];
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d), W = num(spec.w, DEF[0]), H = num(spec.h, DEF[1]), D = num(spec.d, DEF[2]), hw = W / 2;
  const pieces = [], trims = [], asm = [], sa = .375;
  const pack = ['rolltop', 'backpack', 'drawstring'].includes(type), curved = ['sling', 'waist'].includes(type), round = type === 'duffel';
  const ziptop = ['helmet', 'briefcase', 'pouch'].includes(type), flat = D < 1.25; // flat: too shallow for a zip gusset in two halves
  // a piece of the shell or the lining: its outline and its labelled corners
  const add = (id, name, sh, o = {}) => { const q = piece(id, name, sh.pts, o); q.at = sh.at; pieces.push(q); return q; };
  const J = (name, a, b, o = {}) => asm.push({ name, a, b, ...o });           // a seam: two runs sewn together
  const F = (name, a, fin) => asm.push({ name, a, fin });                      // an edge finished on its own
  const Z = (name, a, b, zip, o = {}) => asm.push({ name, a, b, zip, ...o }); // a zip between two edges
  const ON = (name, id, on, at, o = {}) => asm.push({ name, id, on, at, ...o }); // a piece sewn onto a panel, its outline moved by `at`
  const zipTrim = (gauge, way, len, where) => { trims.push({ item: 'Zip', spec: `#${gauge} coil, ${way}, ${len} in`, qty: 1, where }); return len; };
  const half = Math.max(.375, r8((D - ZIP_SHOW) / 2)); // one side of a zip gusset: the two and the zip between them make the depth
  const zipLen = open => Math.max(2, r8(open - 1));     // a zip stops ½ in short of each end of its opening, under a tab
  let frontSh = null, linSh = null, roll = 0, turn = 0, shown;

  if (round) { // a barrel: one panel wrapped round two round ends, its two long edges meeting at the zip along the top
    const C = r8(Math.PI * H - ZIP_SHOW), wrap = stripOf(W, C), circle = { pts: Array.from({ length: 48 }, (_, i) => { const a = i / 48 * Math.PI * 2; return [H / 2 + Math.cos(a) * H / 2, H / 2 + Math.sin(a) * H / 2]; }), at: { e: [H, H / 2], w: [0, H / 2] } };
    add('body', 'Body', wrap, { cut: 1, notes: [`Wrapped round the ends; its two long edges meet at the zip along the top`], shown: at0(rect(W, H), -hw, 0), place: { view: 'front', x: 0, y: 0 } });
    add('end', 'End panel', circle, { cut: 2, notes: ['Round, the body sewn round it; piped'], hidden: true, place: { view: 'back', x: -H / 2, y: 0 } });
    add('lining', 'Lining body', wrap, { fabric: 'lining', cut: 1, hidden: true, notes: ['210D nylon or a coated taffeta'], place: { view: 'front', x: -hw, y: 0, z: -2 } });
    add('lining-end', 'Lining end', circle, { fabric: 'lining', cut: 2, hidden: true, notes: ['Sewn round as the outer end is'], place: { view: 'back', x: -H / 2, y: 0, z: -2 } });
    const zl = zipTrim(10, 'two-way', zipLen(W), 'Along the top');
    Z('Top zip', ['body', ['a', 'b']], ['body', ['d', 'c']], zl, { why: 'the body\'s two long edges, one to each side of the zip' });
    J('Body round one end panel', ['end', ['e', 'w', 'e'], 0], ['body', ['b', 'c']], { gap: ZIP_SHOW, why: 'the body and the zip between its edges go once round the end' });
    J('Body round the other end panel', ['end', ['e', 'w', 'e'], 1], ['body', ['d', 'a']], { gap: ZIP_SHOW });
    J('Lining body round one lining end', ['lining-end', ['e', 'w', 'e'], 0], ['lining', ['b', 'c']], { gap: ZIP_SHOW });
    J('Lining body round the other lining end', ['lining-end', ['e', 'w', 'e'], 1], ['lining', ['d', 'a']], { gap: ZIP_SHOW });
    J('Lining to the zip, one edge', ['body', ['a', 'b']], ['lining', ['a', 'b']], { caught: true, why: 'the lining is caught in the zip seam' });
    J('Lining to the zip, the other edge', ['body', ['d', 'c']], ['lining', ['d', 'c']], { caught: true });
    trims.push({ item: 'Piping', spec: '⅛ in cord, covered in self', qty: `${r8(2 * Math.PI * H + 2)} in`, where: 'Round each end panel' });
  } else {
    // the panels: the front and the back the same outline
    if (curved) frontSh = panelC(W, H);
    else if (type === 'backpack') frontSh = panelO(W, H, 1.25, H * .2);
    else { roll = type === 'rolltop' ? 8 : 0; turn = type === 'tote' ? 1.5 : 0; frontSh = panelU(W, H, type === 'pouch' || pack ? 1.25 : type === 'tote' || type === 'helmet' ? .25 : .75, roll + turn); }
    // the lining's panels: the outer's, except a tote's, which stops at the foot of the turned-back top
    linSh = type === 'tote' ? panelU(W, H - turn, .25) : frontSh;
    shown = at0(frontSh.pts, -hw, 0);
    add('front', 'Front panel', frontSh, { cut: 1, notes: [roll ? `Carried up ${roll} in above the body for the roll` : turn ? `The top ${turn} in turned to the inside and stitched` : 'Self, backed with foam or a bonded fusible'], shown, place: { view: 'front', x: 0, y: 0 } });
    add('back', pack ? 'Back panel (padded)' : 'Back panel', frontSh, { cut: 1, notes: [pack ? 'Spacer mesh over 8 mm foam; channels for air' : roll ? `Carried up ${roll} in for the roll` : turn ? `The top ${turn} in turned to the inside` : 'Self'], shown, place: { view: 'back', x: 0, y: 0 } });
    add('lining', 'Lining panel', linSh, { fabric: 'lining', cut: 2, hidden: true, notes: ['210D nylon or a coated taffeta; front and back'], place: { view: 'front', x: -hw, y: 0, z: -2 } });
    // the shell, and the lining built the same way: `ids` names each one's pieces
    const shell = (pre, sh, ids) => {
      const lin = Boolean(pre), n = lin ? 'Lining: ' : '', fab = lin ? { fabric: 'lining' } : {};
      const fr = ks => (lin ? [ids.panel, ks, 0] : ['front', ks]), bk = ks => (lin ? [ids.panel, ks, 1] : ['back', ks]);
      // an edge of the two panels closed by a zip: a zip gusset in two halves between them, the zip between the halves. `gid`: the gusset
      // whose two ends the halves cross. A bag too shallow for two halves has its zip sewn straight to the panels.
      const zipClose = (ks, gid, zid, zname, gauge, way, where, why) => {
        const open = r8(pathOf(sh, ...ks));
        if (flat) { if (!lin) Z(zname, fr(ks), bk(ks), zipTrim(gauge, way, zipLen(open), where), { why: 'the two panels, one to each side of the zip (too shallow for a zip gusset)' });
          else { J('Lining to the zip, front', ['front', ks], fr(ks), { caught: true, why: 'the lining is caught in the zip seam' }); J('Lining to the zip, back', ['back', ks], bk(ks), { caught: true }); }
          F(`${n}Gusset: one end`, [gid, ['b', 'c']], 'closed under the zip\'s end tab'); F(`${n}Gusset: the other end`, [gid, ['d', 'a']], 'closed under the zip\'s end tab'); return; }
        add(zid, `${n}${zid.includes('top') ? 'Top panel' : 'Zip gusset'}`, stripOf(open, half), { ...fab, cut: 2, notes: [`Two, each ${half} in wide, the zip between them`], hidden: true, place: { view: 'back', x: 0, y: 0 } });
        J(`${n}Front panel ${why}`, fr(ks), [zid, ['d', 'c'], 0], { why: 'one half of the zip gusset along the front panel' });
        J(`${n}Back panel ${why}`, bk(ks), [zid, ['d', 'c'], 1]);
        J(`${n}Zip gusset across one end of the gusset`, [gid, ['b', 'c']], [[zid, ['b', 'c'], 0], [zid, ['b', 'c'], 1]], { gap: ZIP_SHOW, why: `the two halves and the ${ZIP_SHOW} in of zip between them make the gusset's width` });
        J(`${n}Zip gusset across the other end`, [gid, ['d', 'a']], [[zid, ['d', 'a'], 0], [zid, ['d', 'a'], 1]], { gap: ZIP_SHOW });
        if (!lin) Z(zname, [zid, ['a', 'b'], 0], [zid, ['a', 'b'], 1], zipTrim(gauge, way, zipLen(open), where), { why: 'the two halves, one to each side of the zip' });
        else { const o = zid.replace(/^lining-/, '').replace(/^top$/, 'top-panel'); J('Lining to the zip, front half', [o, ['a', 'b'], 0], [zid, ['a', 'b'], 0], { caught: true, why: 'the lining is caught in the zip seam' }); J('Lining to the zip, back half', [o, ['a', 'b'], 1], [zid, ['a', 'b'], 1], { caught: true }); }
      };
      if (type === 'backpack') { // a clamshell: the zip gusset over the top and down the sides; the base gusset round the bottom
        const base = r8(pathOf(sh, 'sr', 'bm', 'sl'));
        add(ids.base, `${n}Base gusset`, stripOf(base, D), { ...fab, cut: 1, notes: [lin ? 'Round the bottom, as the outer' : 'Ballistic or a doubled base; across the bottom and up each side'], hidden: true, place: { view: 'back', x: 0, y: 0 } });
        J(`${n}Front panel round the base gusset`, fr(['sr', 'bm', 'sl']), [ids.base, ['a', 'b']], { why: 'across the bottom and up each side' });
        J(`${n}Back panel round the base gusset`, bk(['sr', 'bm', 'sl']), [ids.base, ['d', 'c']]);
        zipClose(['sl', 'tm', 'sr'], ids.base, ids.zip, 'Clamshell zip', 10, 'two-way', 'Clamshell, round the top and sides', 'over the top and down each side');
        return; }
      if (curved) { // a crescent: a zip gusset over the top, a gusset round the belly
        const belly = r8(pathOf(sh, 'r', 'bm', 'l'));
        add(ids.gusset, `${n}Gusset`, stripOf(belly, D), { ...fab, cut: 1, notes: ['Round the belly, side point to side point'], hidden: true, place: { view: 'back', x: 0, y: 0 } });
        J(`${n}Front panel's belly round the gusset`, fr(['r', 'bm', 'l']), [ids.gusset, ['a', 'b']], { why: 'side point, round the bottom, to side point' });
        J(`${n}Back panel's belly round the gusset`, bk(['r', 'bm', 'l']), [ids.gusset, ['d', 'c']]);
        zipClose(['l', 'tm', 'r'], ids.gusset, ids.zip, 'Top zip', type === 'waist' ? 5 : 8, 'one-way', 'Along the top', 'over the top, side point to side point');
        return; }
      // a box: one gusset down a side, across the bottom and up the other, as long as the panel's edge it is sewn round
      const u = r8(pathOf(sh, 'tr', 'bm', 'tl'));
      add(ids.gusset, `${n}Gusset`, stripOf(u, D), { ...fab, cut: 1, notes: [lin ? 'Sides and bottom in one, as the outer' : `Sides and bottom in one${roll ? ', carried up the roll' : turn ? ', carried up the turned-back top' : ''}; bound or turned seams`], hidden: true, place: { view: 'back', x: 0, y: 0 } });
      J(`${n}Front panel round the gusset`, fr(['tr', 'bm', 'tl']), [ids.gusset, ['a', 'b']], { why: 'down a side, across the bottom and up the other' });
      J(`${n}Back panel round the gusset`, bk(['tr', 'bm', 'tl']), [ids.gusset, ['d', 'c']]);
      if (ziptop) zipClose(['tl', 'tr'], ids.gusset, ids.top, 'Top zip', type === 'pouch' ? 5 : 8, type === 'briefcase' ? 'two-way' : 'one-way', type === 'helmet' ? 'Full width at the top, under a flap' : 'Along the top', 'along its top edge');
    };
    shell('', frontSh, { gusset: 'gusset', zip: 'zip-gusset', base: 'base-gusset', top: 'top-panel' });
    shell('lining-', linSh, { panel: 'lining', gusset: 'lining-gusset', zip: 'lining-zip-gusset', base: 'lining-base', top: 'lining-top' });
    // an open top: how the outer's top edge and the lining's meet, and what closes it
    if (!ziptop && !curved && type !== 'backpack') {
      const topRing = [['front', ['tl', 'tr']], ['gusset', ['b', 'c']], ['back', ['tl', 'tr']], ['gusset', ['d', 'a']]];
      if (type === 'drawstring') { // a drawcord channel sewn round the top, the lining caught in the same seam
        const ring = r8(2 * W + 2 * D), ch = stripOf(ring + 1, 3);
        add('channel', 'Drawcord channel', ch, { cut: 1, notes: ['Folded to 1¼ in round the top, its ends turned ½ in at the eyelets'], hidden: true, place: { view: 'back', x: 0, y: 0 } });
        J('Drawcord channel round the top', ['channel', ['a', 'b']], topRing, { ease: [-1.125, -.875], why: 'round the front, a gusset end, the back and the other gusset end; the channel 1 in longer, its ends turned ½ in at the eyelets' });
        F('Drawcord channel: its other long edge and its two ends', ['channel', ['b', 'c', 'd', 'a']], 'folded down onto its own seam; the ends turned');
        const lid = panelU(r8(W * .9), r8(D + Math.max(3, H * .2)), 1.5);
        add('lid', 'Lid flap', lid, { cut: 2, notes: [`Outer and lining; reaches across the ${D} in top and ${r8(Math.max(3, H * .2))} in down the front`, 'A zip pocket in the outer'], shown: at0(roundRect(W * .9, D * .4 + Math.max(3, H * .2), 1.5), -W * .45, -1), place: { view: 'front', x: 0, y: 0, z: 3 } });
        F('Lid flap: its top edge', ['lid', ['tl', 'tr']], 'stitched to the back panel 1 in below its top');
        F('Lid flap: its sides and front edge', ['lid', ['tr', 'bm', 'tl']], 'bagged out with its lining');
        asm.push({ name: 'Lid flap reaches across the top and down the front', reach: 'lid', over: D, min: 2.5 });
        trims.push({ item: 'Drawcord', spec: '4 mm braided', qty: `${r8(ring + 14)} in`, where: 'Channel' }, { item: 'Cord lock', spec: 'Single-hole, spring', qty: 1, where: 'Front' }, { item: 'Eyelet', spec: '6 mm, brass', qty: 2, where: 'Channel, centre front' }, { item: 'Side-release buckle', spec: '¾ in', qty: 2, where: 'Lid to front' }, { item: 'Webbing', spec: '¾ in nylon', qty: `${r8(4 * 6)} in`, where: 'Lid buckle straps' });
        J('Lining: its top edge into the channel seam', topRing, [['lining', ['tl', 'tr'], 0], ['lining-gusset', ['b', 'c']], ['lining', ['tl', 'tr'], 1], ['lining-gusset', ['d', 'a']]], { caught: true, why: 'the lining is caught in the channel seam' });
      } else {
        J('Lining to the outer round the top: front', ['front', ['tl', 'tr']], ['lining', ['tl', 'tr'], 0], { why: turn ? 'the lining sewn to the edge of the turned-back top' : 'the top edges sewn together and turned' });
        if (type === 'messenger') { // the flap sewn along the back's top edge, the lining caught under it
          const drop = r8(Math.max(3, H * .7)), fl = panelU(W, r8(D + drop), 1);
          add('flap', 'Flap', fl, { cut: 2, notes: [`Outer and lining; across the ${D} in top and ${drop} in down the front`], shown: at0(roundRect(W, drop + .6, 1), -hw, -.6), place: { view: 'front', x: 0, y: 0, z: 3 } });
          J('Flap along the back panel\'s top edge', ['back', ['tl', 'tr']], ['flap', ['tl', 'tr'], 0], { why: 'the flap hinges on the back\'s top edge' });
          J('Lining to the outer round the top: back', ['back', ['tl', 'tr']], ['lining', ['tl', 'tr'], 1], { caught: true, why: 'caught in the flap seam' });
          F('Flap: its sides and front edge', ['flap', ['tr', 'bm', 'tl'], 0], 'bagged out with its lining');
          F('Flap lining', ['flap', ['tl', 'tr', 'bm', 'tl'], 1], 'sewn round the flap and turned; its top edge closed in the flap seam');
          asm.push({ name: 'Flap reaches across the top and down the front', reach: 'flap', over: D, min: 3 });
          trims.push({ item: 'Side-release buckle', spec: '1 in, with a webbing tongue', qty: 2, where: 'Flap to front' }, { item: 'Webbing', spec: '1 in nylon', qty: `${r8(2 * (drop + 4))} in`, where: 'Flap buckle straps' }, { item: 'Hook-and-loop', spec: '2 in', qty: `${r8(W * .6)} in`, where: 'Under the flap' });
        } else J('Lining to the outer round the top: back', ['back', ['tl', 'tr']], ['lining', ['tl', 'tr'], 1]);
        J('Lining to the outer round the top: one gusset end', ['gusset', ['b', 'c']], ['lining-gusset', ['b', 'c']]);
        J('Lining to the outer round the top: the other gusset end', ['gusset', ['d', 'a']], ['lining-gusset', ['d', 'a']]);
        if (type === 'rolltop') trims.push({ item: 'Side-release buckle', spec: '1 in, acetal', qty: 2, where: 'The roll, to the sides' }, { item: 'Webbing', spec: '1 in nylon', qty: `${r8(H + 12)} in`, where: 'Side straps for the roll' }, { item: 'Stiffener', spec: 'HDPE strip, 1 in', qty: `${W} in`, where: 'In the roll edge' });
        if (type === 'tote') trims.push({ item: 'Magnetic snap', spec: '18 mm', qty: 1, where: 'Centre top, inside' }, { item: 'Base board', spec: 'HDPE, 1.5 mm', qty: `${r8(W - .25)} × ${r8(D - .25)} in`, where: 'Under the lining, on the bottom' });
      }
    }
    if (type === 'helmet') { const fl = rect(W, r8(D / 2 + 1)); pieces.push(piece('top-flap', 'Zip flap', fl, { cut: 2, notes: ['Outer and lining; sewn into the back top seam, over the top zip'], shown: at0(rect(W, 3.5), -hw, -.5), place: { view: 'front', x: 0, y: 0, z: 3 } })); }
    // a pocket on the front: a patch with a zip across its top, its outline inside the panel's
    if (['backpack', 'rolltop', 'briefcase', 'waist', 'helmet', 'sling'].includes(type)) {
      let pk, at;
      if (curved) { const k = .56, cx = W / 2, cy = H * .6; pk = frontSh.pts.map(([x, y]) => [(x - cx) * k + cx, (y - cy) * k + cy]); const b = boundsOf(pk); at = [b.x0, b.y0]; pk = pk.map(([x, y]) => [x - b.x0, y - b.y0]); }
      else { const pw = r8(W * .7), ph = r8(H * .38); pk = roundRect(pw, ph, .75); at = [(W - pw) / 2, H * .5]; }
      const pb = boundsOf(pk);
      pieces.push(piece('front-pocket', 'Front pocket', pk, { cut: 2, notes: ['Outer and its bag; zipped across the top'], shown: at0(pk, at[0] - hw, at[1]), place: { view: 'front', x: 0, y: 0, z: 2 } }));
      ON('Front pocket on the front panel', 'front-pocket', 'front', at);
      const pz = zipTrim(5, 'one-way', zipLen(pb.w), 'Front pocket'); asm.push({ name: 'Front pocket zip across the pocket', fits: pz, within: r8(pb.w) });
    }
    if (type === 'backpack' || type === 'briefcase') { const sw = r8(W - 1.5), sh = r8(H * .8), sl = rect(sw, sh);
      pieces.push(piece('sleeve', 'Laptop sleeve', sl, { cut: 2, hidden: true, notes: ['8 mm foam between; a hook-and-loop tab'], place: { view: 'back', x: 0, y: 0 } }));
      ON('Laptop sleeve on the back lining', 'sleeve', 'back', [.75, H * .1]);
      trims.push({ item: 'Foam', spec: '8 mm closed-cell', qty: `${sw} × ${sh} in`, where: 'Laptop sleeve' }, { item: 'Hook-and-loop', spec: '1 in', qty: '3 in', where: 'Sleeve tab' }); }
  }
  // how it is carried
  if (pack) { const sw = Math.min(3, r8(hw - 1.25)), L = r8(Math.min(20, Math.max(14, H))), st = [[0, 0], [sw, 0], [sw, L * .4], [sw * .8, L], [sw * .2, L], [0, L * .4]];
    const stShown = at0(st.map(([x, y]) => [x, y * Math.min(1, Math.max(4, H - 3) / L)]), -hw + 1, 1); // on the product the strap curves away to the base: drawn no longer than the back
    pieces.push(piece('strap', 'Shoulder strap', st, { cut: 4, pair: true, notes: ['Outer and spacer mesh, 10 mm foam between; bound edges', 'Its top sewn to the back panel under a box stitch; 1 in webbing from its foot to a ladder lock at the base'], shown: stShown, place: { view: 'back', x: 0, y: 0, z: 3 } }), { ...piece('strap-2', 'Shoulder strap', st, { cut: 0, shown: stShown, place: { view: 'back', x: 0, y: 0, flip: true, z: 3 } }), twin: true });
    const wl = Math.max(20, r8(H - L + 16)), gx = Math.max(.75, Math.min(2, hw - 1.75)); // the webbing from each strap's foot; where the grab handle's ends sit
    asm.push({ name: 'Shoulder strap tops on the back panel', on: 'back', boxes: [[1, 1, 1 + sw, 3], [W - 1 - sw, 1, W - 1, 3]], clear: .75 },
      { name: 'Grab handle ends on the back panel', on: 'back', boxes: [[hw - gx - .5, .75, hw - gx + .5, 1.75], [hw + gx - .5, .75, hw + gx + .5, 1.75]], clear: .5 },
      { name: 'Shoulder straps let out, past the back they span', straps: 'strap', webbing: wl, sewn: 2, span: r8(H - 3), min: 12 });
    trims.push({ item: 'Webbing', spec: '1 in nylon', qty: `2 × ${wl} in`, where: 'Strap ends, to the ladder locks' }, { item: 'Webbing', spec: '1 in nylon', qty: '2 × 4 in', where: 'Ladder lock tabs, sewn into the side seams at the base' }, { item: 'Ladder lock', spec: '1 in', qty: 2, where: 'Strap ends, at the base' },
      { item: 'Foam', spec: '10 mm closed-cell', qty: `2 × ${sw} × ${L} in`, where: 'Shoulder straps' }, { item: 'Spacer mesh', spec: '3 mm', qty: `${W} × ${H} in and the strap undersides`, where: 'Back panel and straps' }, { item: 'Foam', spec: '8 mm closed-cell', qty: `${r8(W - .5)} × ${r8(H - .5)} in`, where: 'Back panel' },
      { item: 'Webbing', spec: '1 in nylon', qty: '9 in', where: 'Grab handle' }); }
  if (['tote', 'helmet', 'briefcase', 'duffel'].includes(type)) {
    // a handle: its two ends stitched down `tail` in onto the panel, `spread` each side of the centre; long enough to rise `drop` when taut
    const drop = type === 'tote' ? 11 : type === 'briefcase' ? 5 : type === 'helmet' ? 8 : 9, spread = Math.max(1.5, Math.min(W * (type === 'briefcase' ? .18 : .25), hw - 1.75)), tail_ = 2, free = r8(2 * Math.hypot(drop, spread)), len = r8(free + 2 * tail_);
    const loop = sg => [[sg * spread - .5, .2], [sg * spread + .5, .2], [sg * spread * .45 + .5, -free * .32], [sg * spread * .45 - .5, -free * .32]];
    pieces.push(piece('handle', 'Handle', rect(2, len), { cut: 2, notes: [type === 'tote' ? 'Self, folded to 1 in and edge-stitched' : 'Webbing or self, folded to 1 in, wrapped at the grip', `${free} in between its two ends; each end stitched down ${tail_} in under a box stitch`], shown: loop(1), place: { view: 'front', x: 0, y: 0, z: 1 } }),
      { ...piece('handle-2', 'Handle', rect(2, len), { cut: 0, shown: loop(-1), place: { view: 'front', x: 0, y: 0, z: 1 } }), twin: true },
      { ...piece('handle-top', 'Handle', [[-.5, 0], [.5, 0], [.5, -free * .3], [-.5, -free * .3]], { cut: 0, shown: [[-spread, -free * .3], [spread, -free * .3], [spread * .9, -free * .34], [-spread * .9, -free * .34]], place: { view: 'front', x: 0, y: 0, z: 1 } }), twin: true });
    // where the ends land: on the front and back panels below the top (a duffel's on its body, each side of the zip)
    const y0 = round ? 2 : .75, bx = (sg, y) => [hw + sg * spread - .5, y, hw + sg * spread + .5, y + tail_];
    if (round) { const C = boundsOf(pieces.find(q => q.id === 'body').sew).h; asm.push({ name: 'Handle ends on the body, each side of the zip', on: 'body', boxes: [bx(-1, y0), bx(1, y0), bx(-1, C - y0 - tail_), bx(1, C - y0 - tail_)], clear: .5 }); }
    else asm.push({ name: 'Handle ends on the front panel', on: 'front', boxes: [bx(-1, y0), bx(1, y0)], clear: .5 }, { name: 'Handle ends on the back panel', on: 'back', boxes: [bx(-1, y0), bx(1, y0)], clear: .5 });
    asm.push( { name: 'Handle rises when taut', handle: 'handle', tails: tail_, spread, min: type === 'tote' ? 9 : 4 }); }
  if (['sling', 'messenger', 'briefcase', 'helmet', 'duffel', 'pouch'].includes(type)) { const wide = type === 'messenger' ? '1½' : '1', n = type === 'sling' ? 1 : 2;
    trims.push({ item: 'Webbing', spec: `${wide} in nylon`, qty: `${type === 'pouch' ? 48 : 52} in`, where: 'Shoulder strap' }, { item: type === 'sling' ? 'Side-release buckle' : 'Swivel hook', spec: `${wide} in, ${type === 'sling' ? 'acetal' : 'metal'}`, qty: n, where: 'Strap ends' }, { item: 'Slider', spec: `Tri-glide, ${wide} in`, qty: 1, where: 'Strap adjuster' });
    if (type === 'sling') trims.push({ item: 'Webbing', spec: '1 in nylon', qty: '2 × 4 in', where: 'Strap tabs, sewn into the gusset at each side point' });
    else trims.push({ item: 'D-ring', spec: `${wide} in, metal`, qty: 2, where: round ? 'The top of each end panel' : 'The top of each side, on the gusset' }, { item: 'Webbing', spec: `${wide} in nylon`, qty: '2 × 3 in', where: 'D-ring tabs, bartacked' }); }
  if (type === 'waist') trims.push({ item: 'Webbing', spec: '1 in nylon', qty: '42 in', where: 'Waist belt, sewn into the gusset at each side point' }, { item: 'Side-release buckle', spec: '1 in, acetal', qty: 1, where: 'Belt' }, { item: 'Ladder lock', spec: '1 in', qty: 1, where: 'Belt adjuster' });
  // one puller to each slider; binding for every inside seam of the shell
  const zips = trims.filter(t => t.item === 'Zip'); if (zips.length) trims.push({ item: 'Zip puller', spec: 'Cord or moulded, to the zip', qty: zips.reduce((s, t) => s + (/two-way/.test(t.spec) ? 2 : 1), 0), where: 'One to each slider' });
  const byId = Object.fromEntries(pieces.filter(q => q.at).map(q => [q.id, q])), lenOf = r => (Array.isArray(r[0]) ? r : [r]).reduce((s, [id, ks]) => s + pathOf({ pts: byId[id].sew, at: byId[id].at }, ...ks), 0);
  const bound = asm.filter(e => e.b && !e.zip && !e.caught && !/^Lining/.test(e.name)).reduce((s, e) => s + lenOf(e.a), 0);
  trims.push({ item: 'Binding tape', spec: '1 in grosgrain or nylon', qty: `${Math.ceil(bound * 1.08)} in`, where: 'Inside seams' }, { item: 'Thread', spec: 'Tex 70 bonded nylon', qty: 'about 120 m', where: 'Throughout' }, { item: 'Main label', spec: 'Woven, folded', qty: 1, where: 'Inside, top centre' });
  const ty = { rolltop: 'Rolltop backpack', backpack: 'Zip backpack', drawstring: 'Top-loader backpack', sling: 'Sling', tote: 'Tote', helmet: 'Helmet bag', briefcase: 'Work bag', messenger: 'Messenger', duffel: 'Duffel', waist: 'Waist bag', pouch: 'Shoulder pouch' }[type];
  // a piece not seen on the product (a gusset, a lining, a sleeve) sits under the panel there, inside its outline, so only the explode shows it
  for (const q of pieces) if (q.hidden && !q.shown) { const b = boundsOf(q.sew), sw = Math.min(b.w, W * .9), sh = Math.min(b.h, H * .9); q.shown = at0(rect(sw, sh), -sw / 2, .4); q.place = { ...q.place, x: 0, y: 0, z: -3 }; }
  pieces.trims = trims;
  return { kind: 'bag', style: type, label: ty, size: `${W} × ${H} × ${D} in`, sa, construction: {}, pieces: [...pieces], trims, assembly: asm, up: roll + turn, shell: Object.fromEntries(pieces.filter(q => q.at && q.fabric !== 'lining').map(q => [q.id, q])),
    notes: ['Bag: ⅜ in seam allowance, seams bound inside', 'Every gusset is as long as the panel edge it is sewn round; the Sews together panel walks each seam', 'A first block from the size: sample it, then true the panels to the drawing'] };
}

// ---- plush ----
// the body types a plush is drafted on (the kit): each takes the parts below, so a fox is a four-legged sitting body with a long snout, pointed
// ears and a bushy tail, a unicorn the same body with a horn and a mane, a whale a sea body with a fluke
export const PLUSH_SHAPES = { build: 'Built from parts: a body, a head, ears, a face, arms, legs, a tail and more, from the parts library (src/lab-plush-parts.js)', bear: 'Standing upright: bear, monkey, bunny on two legs… (head, body, arms, legs)', quad: 'Four-legged, sitting: dog, cat, fox, lion, horse, unicorn, dinosaur…', elephant: 'Elephant (sitting: trunk, big ears, four legs, tail)', sea: 'Sea creature: whale, shark, dolphin, fish…', bean: 'Round: bean character, chick, ghost… (one body, a base)', bunny: 'Bunny (bean body, long ears)', pillow: 'Pillow character (front, back, side gusset)' };
// each body type's name, short, for a label or a sentence
export const PLUSH_TYPE = { build: 'Built from parts', bear: 'Bear', quad: 'Four-legged sitting', elephant: 'Elephant', sea: 'Sea creature', bean: 'Bean character', bunny: 'Bunny', pillow: 'Pillow character' };
export const PLUSH_EARS = { round: 'Round', pointed: 'Pointed', long: 'Long', floppy: 'Floppy (hanging, a dog\'s)', big: 'Big and floppy (lined)', none: 'None' };
// the parts the kit puts on a body: which body types take each
export const PLUSH_SNOUTS = { none: 'None (a flat face)', short: 'Short (a cat, a lion, a bear)', long: 'Long and pointed (a dog, a fox, a dragon)', broad: 'Long and broad (a horse, a cow, a unicorn)' };
export const PLUSH_MANES = { none: 'None', ruff: 'A ruff round the face (a lion)', crest: 'A crest down the neck (a horse, a unicorn)' };
export const PLUSH_HORNS = { none: 'None', one: 'One horn (a unicorn)', two: 'Two horns (a goat, a dragon)', antlers: 'Antlers (a deer)' };
export const PLUSH_TAILS = { short: 'Short (a bear, a cat stub)', long: 'Long and thin (a cat, a monkey)', bushy: 'Bushy (a fox, a squirrel)', tuft: 'Tufted (a lion, a cow)', hair: 'Long hair (a horse, a unicorn)', fluke: 'Fluke (a whale, a dolphin)', fin: 'Tail fin (a fish, a shark)' };
export const PLUSH_PARTS = { snout: ['quad', 'bear'], horn: ['quad', 'bear', 'bean', 'bunny'], mane: ['quad'], wings: ['quad', 'bear', 'bean', 'bunny'], spikes: ['quad', 'sea'], dorsal: ['sea'], tailType: ['quad', 'sea'], head: ['quad', 'bear', 'sea'] };
export const PLUSH_FABRICS = { minky: 'Minky, 3 mm pile', shortpile: 'Short-pile plush', velboa: 'Velboa', fleece: 'Anti-pill fleece', fur: 'Faux fur, 10 mm pile', terry: 'Terry', leather: 'Nappa lambskin, 0.7 mm', vegan: 'Vegan leather (PU), 0.8 mm', suede: 'Suede', velvet: 'Cotton velvet', boucle: 'Bouclé' };
// cloths with no stretch and a cut edge that shows: sewn with a wider allowance, the pieces eased, the pile (or the grain) not a factor
export const PLUSH_FIRM = ['leather', 'vegan', 'suede'];
export const PLUSH_EYES = { embroidered: 'Embroidered (any age)', safety: 'Safety eyes, 12 mm (3 years and up)', felt: 'Felt, sewn flat' };
export const PLUSH_AGES = { '0+': 'All ages, under 3 included', '3+': '3 years and up', '14+': 'Collectible, 14 and up' };
export function plushDefaults(shape = 'bear') {
  if (shape === 'build') return { ...plushDefaults('bear'), shape: 'build', build: cleanBuild(PLUSH_PRESETS.bear.build) };
  return { shape: PLUSH_SHAPES[shape] ? shape : 'bear', height: shape === 'pillow' ? 14 : shape === 'sea' ? 16 : 12, ears: shape === 'bunny' ? 'long' : shape === 'pillow' || shape === 'quad' ? 'pointed' : shape === 'elephant' ? 'big' : shape === 'sea' ? 'none' : 'round', arms: shape !== 'pillow' && shape !== 'sea' && shape !== 'quad', legs: ['bear', 'elephant', 'quad'].includes(shape), tail: ['bunny', 'elephant', 'quad', 'sea'].includes(shape), fabric: 'minky', eyes: 'embroidered', age: '0+', fill: 'polyester fibre', depth: shape === 'pillow' ? 3 : 0,
    snout: shape === 'quad' || shape === 'bear' ? 'short' : 'none', horn: 'none', mane: 'none', wings: false, spikes: false, dorsal: shape === 'sea', tailType: shape === 'sea' ? 'fluke' : 'long', head: 1 };
}
export function cleanPlush(input = {}) {
  const d = plushDefaults(PLUSH_SHAPES[input.shape] ? input.shape : 'bear'), num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? r8(Math.min(Math.max(n, lo), hi)) : def; };
  return { shape: d.shape, ...(d.shape === 'build' ? { build: cleanBuild(input.build || d.build) } : {}), height: num(input.height, 4, 48, d.height), ears: PLUSH_EARS[input.ears] ? input.ears : d.ears, arms: input.arms == null ? d.arms : Boolean(input.arms), legs: input.legs == null ? d.legs : Boolean(input.legs), tail: input.tail == null ? d.tail : Boolean(input.tail),
    fabric: PLUSH_FABRICS[input.fabric] ? input.fabric : d.fabric, eyes: PLUSH_EYES[input.eyes] ? input.eyes : d.eyes, age: PLUSH_AGES[input.age] ? input.age : d.age, fill: String(input.fill || d.fill).slice(0, 60), depth: num(input.depth, 1, 12, d.depth || 3),
    // what the character is (an elephant, a fox…), in words: the shape it is drafted as is the nearest the pattern has
    ...(String(input.animal || '').trim() ? { animal: String(input.animal).replace(/[^a-zA-Z \-']/g, '').replace(/\s+/g, ' ').trim().slice(0, 30).toLowerCase() } : {}),
    // the body's and the contrast's colours, read from a picture or a concept's words (a material on the part, when chosen, wins over them)
    ...(input.colours && typeof input.colours === 'object' && ['body', 'contrast', 'mane'].some(k => /^#[0-9a-f]{6}$/i.test(String(input.colours[k] || ''))) ? { colours: Object.fromEntries(['body', 'contrast', 'mane'].filter(k => /^#[0-9a-f]{6}$/i.test(String(input.colours[k] || ''))).map(k => [k, String(input.colours[k]).toLowerCase()])) } : {}),
    // the kit's parts (src/lab-plush-views.js draws each on the body types that take it, PLUSH_PARTS)
    snout: PLUSH_SNOUTS[input.snout] ? input.snout : d.snout, horn: PLUSH_HORNS[input.horn] ? input.horn : d.horn, mane: input.mane === true ? 'ruff' : PLUSH_MANES[input.mane] ? input.mane : d.mane, wings: input.wings == null ? d.wings : Boolean(input.wings),
    spikes: input.spikes == null ? d.spikes : Boolean(input.spikes), dorsal: input.dorsal == null ? d.dorsal : Boolean(input.dorsal),
    tailType: PLUSH_TAILS[input.tailType] && (d.shape === 'sea') === ['fluke', 'fin'].includes(input.tailType) ? input.tailType : d.tailType, head: Number.isFinite(Number(input.head)) && input.head !== null && input.head !== '' ? Math.round(Math.min(1.3, Math.max(.8, Number(input.head))) * 20) / 20 : 1, // the head's size against the body's
    ...(cleanSketches(input.sketches, VIEWS_OF.plush).length ? { sketches: cleanSketches(input.sketches, VIEWS_OF.plush) } : {}),
    ...(cleanLogos(input.logos, 'plush').length ? { logos: cleanLogos(input.logos, 'plush') } : {}) }; // drawn by hand on its views (src/lab-sketch.js)
}
function earOf(kind, w) {
  if (kind === 'floppy') return blob([[0, 0], [w * .5, -w * .1], [w * .62, w * .7], [w * .4, w * 1.5], [0, w * 1.75], [-w * .4, w * 1.5], [-w * .62, w * .7], [-w * .5, -w * .1]], .9);
  if (kind === 'long') return blob([[0, 0], [w * .55, -w * .4], [w * .5, -w * 2.4], [0, -w * 2.9], [-w * .5, -w * 2.4], [-w * .55, -w * .4]], .9).map(([x, y]) => [x, y + w * 2.9]);
  if (kind === 'pointed') return [[-w / 2, w], ...tail(cubic([-w / 2, w], [-w * .45, w * .45], [-w * .1, 0], [0, 0])), ...tail(cubic([0, 0], [w * .1, 0], [w * .45, w * .45], [w / 2, w]))];
  return [[-w / 2, w * .8], ...tail(cubic([-w / 2, w * .8], [-w * .62, 0], [w * .62, 0], [w / 2, w * .8]))];
}
// ---- plush: the seven fixed body types, drafted with how they go together ----
// As a bag is: every piece that is sewn to another names the ends of the edge it is sewn by (`at`, with a notch where a factory needs one);
// every piece that depends on another is sized from the edge it is sewn to, measured off that piece's outline (a head gusset as long, tip to
// tip, as the head side's edge; a foot pad as far round as its leg's open end; a base as far round as the bottom edges; a body's neck the
// head's; a lining its ear); and `assembly` lists every seam as the two runs sewn together, every edge finished on its own, and the stuffing
// opening. src/lab-pattern-check.js walks the list. The toy is drafted, measured off its outlines, and drafted again until it stands the
// height asked for (a sea creature: its length).
const solveUp = (f, want, lo, hi) => { for (let k = 0; k < 48; k++) { const m = (lo + hi) / 2; if (f(m) < want) lo = m; else hi = m; } return (lo + hi) / 2; };
// an outline smoothed round its control points, the named ones kept as its corners: [x, y, name?]
const blobAt = (ctrl, k) => ({ pts: blob(ctrl.map(c => [c[0], c[1]]), k), at: Object.fromEntries(ctrl.filter(c => c[2]).map(c => [c[2], [c[0], c[1]]])) });
// the run of a named outline from corner a to corner b that passes none of its other corners → { pts (a first), L, step }
function cornerRun(sh, a, b) {
  const P = sh.pts, n = P.length, ix = p => { let j = 0, d = Infinity; P.forEach((q, i) => { const e = Math.hypot(q[0] - p[0], q[1] - p[1]); if (e < d) { d = e; j = i; } }); return j; };
  const i = ix(sh.at[a]), j = ix(sh.at[b]), others = new Set(Object.keys(sh.at).filter(k => k !== a && k !== b).map(k => ix(sh.at[k])));
  const walk = step => { const pts = [P[i]]; let k = i, hit = false; for (let t = 0; t < n && k !== j; t++) { k = (k + step + n) % n; pts.push(P[k]); if (k !== j && others.has(k)) hit = true; } return { pts, hit, L: lenOf(pts), step }; };
  const f = walk(1), r = walk(-1); return !f.hit ? f : !r.hit ? r : f.L <= r.L ? f : r;
}
// how far along the run from a to b the outline first meets `test`, and how far along it the outline comes nearest a point
const distWhere = (sh, a, b, test) => { const r = cornerRun(sh, a, b).pts; let d = 0; for (let i = 0; i < r.length; i++) { if (i) d += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); if (test(r[i])) return d; } return d; };
const distTo = (sh, a, b, pt) => { const r = cornerRun(sh, a, b).pts; let d = 0, best = Infinity, at = 0; for (let i = 0; i < r.length; i++) { if (i) d += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); const e = Math.hypot(r[i][0] - pt[0], r[i][1] - pt[1]); if (e < best) { best = e; at = d; } } return at; };
// the mean height of an outline along the runs through the corners given (where a seam that is not level sits, once it is sewn to one that is)
const levelOf = (sh, ...ks) => { let L = 0, m = 0; for (let i = 0; i + 1 < ks.length; i++) { const r = cornerRun(sh, ks[i], ks[i + 1]).pts; for (let j = 1; j < r.length; j++) { const d = Math.hypot(r[j][0] - r[j - 1][0], r[j][1] - r[j - 1][1]); L += d; m += d * (r[j][1] + r[j - 1][1]) / 2; } } return L ? m / L : 0; };
// corners named along the run from a to b, each so far in from a ([name, distance]): a point is put on the outline at each, so a seam can be
// walked to it and a notch cut there; the outline itself does not change
function markRun(sh, a, b, marks) {
  if (!marks.length) return sh;
  const r = cornerRun(sh, a, b), P = sh.pts, n = P.length, m = r.pts.length - 1; let i0 = 0, bd = Infinity; P.forEach((q, i) => { const e = Math.hypot(q[0] - sh.at[a][0], q[1] - sh.at[a][1]); if (e < bd) { bd = e; i0 = i; } });
  const ring = Array.from({ length: n }, (_, t) => P[((i0 + r.step * t) % n + n) % n]), ms = marks.map(([name, d]) => [name, Math.min(r.L, Math.max(0, d))]).sort((x, y) => x[1] - y[1]), out = []; let acc = 0, q = 0;
  for (let t = 0; t < n; t++) { const p = ring[t], nx = ring[(t + 1) % n]; out.push(p); if (t >= m) continue; const seg = Math.hypot(nx[0] - p[0], nx[1] - p[1]);
    while (q < ms.length && ms[q][1] <= acc + seg + 1e-9) { const f = seg ? (ms[q][1] - acc) / seg : 0, pt = f < 1e-6 ? p : f > 1 - 1e-6 ? nx : [p[0] + (nx[0] - p[0]) * f, p[1] + (nx[1] - p[1]) * f]; if (pt !== p && pt !== nx) out.push(pt); sh.at[ms[q][0]] = [pt[0], pt[1]]; q++; }
    acc += seg; }
  sh.pts = out; return sh;
}
// a gusset drafted along the seam it is sewn into: S the seam's length, `prof` its half width at distances along it ([s, w], from 0 at one
// tip to 0 at the other), `marks` the seam's notches ([name, distance]) → { pts, at }: its tips t0 and t1, and each mark on its right edge
// (nameR) and its left (nameL). Each edge is exactly S long, and each mark as far along it as it is along the seam.
function gussetAlong(S, prof, marks = []) {
  const N = 48, P = prof.filter((p, i) => !i || p[0] > prof[i - 1][0] + 1e-6), lin = s => { let i = 1; while (i < P.length - 1 && P[i][0] < s) i++; const [s0, w0] = P[i - 1], [s1, w1] = P[i]; return w0 + (w1 - w0) * Math.min(1, Math.max(0, (s - s0) / ((s1 - s0) || 1))); };
  let st = Array.from({ length: N + 1 }, (_, i) => [S * i / N, lin(S * i / N)]);
  for (let k = 0; k < 6; k++) st = st.map((p, i) => (i === 0 || i === N ? [p[0], 0] : [p[0], (st[i - 1][1] + 2 * p[1] + st[i + 1][1]) / 4]));
  const wAt = s => { const i = Math.min(N - 1, Math.max(0, Math.floor(s / S * N))), f = (s - st[i][0]) / (S / N); return st[i][1] + (st[i + 1][1] - st[i][1]) * f; };
  const all = [...st.map(p => [p[0], p[1], null]), ...marks.map(([name, d]) => { const s = Math.min(S, Math.max(0, d)); return [s, wAt(s), name]; })].sort((a, b) => a[0] - b[0]);
  const right = [], at = {}; let y = 0, ps = 0, pw = 0;
  for (const [s, w0, name] of all) { const ds = s - ps; let w = w0; if (Math.abs(w - pw) > ds * .95) w = pw + Math.sign(w - pw) * ds * .95; y += Math.sqrt(Math.max(0, ds * ds - (w - pw) ** 2)); right.push([w, y]); if (name) { at[name + 'R'] = [w, y]; at[name + 'L'] = [-w, y]; } ps = s; pw = w; }
  return { pts: [...right, ...right.slice(1, -1).reverse().map(([x, yy]) => [-x, yy])], at: { t0: [0, 0], t1: [0, y], ...at } };
}
// an oval as far round as the edges sewn to it, its ends and its sides named (a foot pad in a leg's open end, a base in a body's bottom edges)
function ovalRound(rx, ry, round, n, names) { const k = round / lenOf([...ellipse(rx, ry, n), [rx, 0]]); return { pts: ellipse(rx * k, ry * k, n), at: { [names[0]]: [rx * k, 0], [names[1]]: [0, ry * k], [names[2]]: [-rx * k, 0], [names[3]]: [0, -ry * k] } }; }
// an ear with the ends of the edge it is sewn in by (b0, b1) and its tip named
function earAt(kind, w) {
  return { pts: earOf(kind, w), at: kind === 'floppy' ? { b0: [w * .5, -w * .1], b1: [-w * .5, -w * .1], tip: [0, w * 1.75] } : kind === 'long' ? { b0: [w * .55, w * 2.5], b1: [-w * .55, w * 2.5], tip: [0, 0] }
    : kind === 'pointed' ? { b0: [w / 2, w], b1: [-w / 2, w], tip: [0, 0] } : { b0: [w / 2, w * .8], b1: [-w / 2, w * .8], tip: [0, w * .2] } };
}
// a four-legged body's tail, its base (b0 to b1) and its tip named
const tailAt = (type, h) => (type === 'bushy' ? blobAt([[0, 0, 'b0'], [h * .07, -h * .02, 'b1'], [h * .1, h * .14], [h * .05, h * .32, 'tip'], [-h * .03, h * .28], [-h * .04, h * .1]], .8)
  : type === 'short' ? (e => ({ pts: e, at: { b0: e[4], b1: e[8], tip: e[18] } }))(ellipse(h * .05, h * .06, 24))
  : type === 'hair' ? { pts: rect(r8(h * .1), r8(h * .3)), at: { b0: [0, 0], b1: [r8(h * .1), 0], tip: [r8(h * .1), r8(h * .3)] } }
  : (L => blobAt([[0, 0, 'b0'], [h * .03, 0, 'b1'], [h * .028, L], [0, L, 'tip']], .4))(type === 'tuft' ? h * .22 : h * .34));
// where a part's base goes in a seam: centred on c, kept ⅛ in (at 12 in) inside the stretch from lo to hi
const slotAt = (c, len, lo, hi, h) => { const m = h * .01; return hi - lo < len + 2 * m ? (lo + hi) / 2 : Math.min(hi - len / 2 - m, Math.max(lo + len / 2 + m, c)); };
// a stuffing opening `want` long, centred in the free stretch of a seam from d0 to d1, more than ⅜ in of seam sewn beyond each end
const openIn = (d0, d1, want) => { const len = Math.max(0, Math.min(want, d1 - d0 - .85)), c = (d0 + d1) / 2; return [c - len / 2, c + len / 2, len]; };
const SIDES = [[0, 'right', 'R'], [1, 'left', 'L']];
const SEAM_WORDS = { nose: 'the nose', trunk: 'the tip of the trunk', brow: 'the brow', root: 'the root of the trunk', back: 'the back of the head', nape: 'the back of the neck', top: 'the top', sh: 'the neck', nb: 'the neck', nc: 'the neck', crotch: 'the crotch', seat: 'the seat', hip: 'the hip notch', ch: 'the chest', lf: 'the front leg notch', hl: 'the hind leg notch',
  st: 'the tail stock', sb: 'the tail stock', bs: 'the base', br: 'the base', bl: 'the base', bc: 'the base', bm: 'the bottom', tm: 'the top', tl: 'the tail notch' };
const SLOT_WORDS = { e: 'the ear', a: 'the arm', d: 'the dorsal fin', f: 'the fin', tl: 'the tail', o: 'the opening' };
// the parts of a seam walked from mark to mark, in words: 'the nose to the ear', 'under the ear', 'the stuffing opening'
const partsOf = ks => ks.slice(1).map((b, i) => { const a = ks[i], sa = a.replace(/[01][ABRL]?$/, ''), sb = b.replace(/[01][ABRL]?$/, ''), slot = /[01][ABRL]?$/.test(a) && /[01][ABRL]?$/.test(b) && sa === sb && a !== b;
  const w = k => SEAM_WORDS[k.replace(/[ABRL]$/, '')] || SLOT_WORDS[k.replace(/[01][ABRL]?$/, '')] || k;
  return slot ? (sa === 'o' ? 'the stuffing opening (closed by hand)' : `under ${SLOT_WORDS[sa] || sa}`) : `${w(a)} to ${w(b)}`; });

function draftFixed(s, h) {
  const pieces = [], notes = [], asm = [], ears = s.ears !== 'none';
  // a piece with its corners named: each name is put on the nearest point of the outline as it is cut (tidied), so a seam is always walked
  // between two points of the outline itself, on the smallest toy as on the largest
  const add = (id, name, sh, o = {}) => { const q = piece(id, name, sh.pts, o), on = p => q.sew.reduce((m, v) => (Math.hypot(v[0] - p[0], v[1] - p[1]) < Math.hypot(m[0] - p[0], m[1] - p[1]) ? v : m), q.sew[0]).slice();
    q.at = Object.fromEntries(Object.entries(sh.at).map(([k, p]) => [k, on(p)])); q.notches = (o.notch || []).filter(k => q.at[k]).map(k => q.at[k]); pieces.push(q); return q; };
  const twin = (id, name, sh, o = {}) => pieces.push(piece(id, name, sh.pts, { ...o, cut: 0 }));
  const J = (name, a, b, o = {}) => asm.push({ name, a, b, ...o }), F = (name, a, fin) => asm.push({ name, a, fin });
  // one seam walked in parts, from mark to mark: the same marks along both sides
  const walk = (name, [ia, ka, ca], [ib, kb, cb], o = {}) => { const parts = partsOf(ka); for (let i = 0; i + 1 < ka.length; i++) J(ka.length > 2 ? `${name}: ${parts[i]}` : name, [ia, [ka[i], ka[i + 1]], ca], [ib, [kb[i], kb[i + 1]], cb], i ? {} : o); };
  // a gusset down a seam, walked each side: the host's corners along it, the gusset's marks named after them
  const gusseted = (name, host, hc, gid) => { for (const [k, sd, X] of SIDES) walk(`${name}, ${sd} side`, [host, hc, k], [gid, hc.map((c, i) => (i === 0 ? 't0' : i === hc.length - 1 ? 't1' : c + X)), 0]); };
  // a part in layers (an ear, an arm, a fin, a tail): sewn round from one end of its base to the other and turned, its base caught in a seam
  // between two notches (`take`: what a pleat takes up of the base)
  const caught = (what, id, copies, host, where, take = 0) => { if (copies.length > 1) J(`${what}: outer to inner`, [id, ['b0', 'tip', 'b1'], copies[0]], [id, ['b0', 'tip', 'b1'], copies[1]], { why: 'sewn round and turned through its base' });
    copies.forEach((c, i) => J(`${what} caught in ${where}${copies.length > 1 ? (i ? ' (inner layer)' : ' (outer layer)') : ''}`, host, [id, ['b0', 'b1'], c], { caught: true, ...(take ? { gap: -take } : {}), why: take ? `its base, less the ${r8(take)} in its pleat takes up, lies in the seam between the two notches` : 'its base lies in the seam between the two notches' })); };
  const open = (name, id, ks, len) => asm.push({ name, open: [id, [ks[1], ks[2]], 0], len: r3(len), ends: [[id, [ks[0], ks[1]], 0], [id, [ks[2], ks[3]], 0]] });
  const said = v => r8(Math.max(.125, v));
  let made = h;

  if (s.shape === 'bear') {
    const hh = h * .42 * s.head, hw = hh * 1.05, bh = h * .44, bw = bh * .78, legH = h * .26, armL = h * .3, mz = s.snout === 'long' ? 1.45 : 1;
    // the head: two sides (the head in profile, the nose at x = 0) and a gusset from the nose over the crown to the back of the neck, as long
    // as the head side's edge it is sewn along; the ears caught in the gusset seam
    const head = blobAt([[0, hh * .6, 'nose'], [hw * .12, hh * .22], [hw * .42, 0], [hw * .62, hh * .28], [hw * .6, hh * .78, 'nape'], [hw * .28, hh * .98], [hw * .06, hh * .84, 'throat']], .75);
    const ear = ears ? earAt(s.ears, hh * (s.ears === 'long' ? .22 : .32)) : null, eb = ear ? cornerRun(ear, 'b0', 'b1').L : 0, S = cornerRun(head, 'nose', 'nape').L, gm = [];
    if (ear) { const c = slotAt(distTo(head, 'nose', 'nape', [hw * .42, 0]) + eb * .25, eb, 0, S, h); gm.push(['e0', c - eb / 2], ['e1', c + eb / 2]); markRun(head, 'nose', 'nape', gm); }
    const gus = gussetAlong(S, [[0, 0], [S * .2, hw * .16], [S * .72, hw * .2], [S, 0]], gm), hc = ear ? ['nose', 'e0', 'e1', 'nape'] : ['nose', 'nape'];
    add('head-side', 'Head side', head, { cut: 2, pair: true, notch: ['nose', 'e0', 'e1', 'nape', 'throat'], notes: ['Notches: the nose point (the gusset\'s tip), the back of the neck (its other tip), the throat (where the chin seam ends)' + (ear ? ', and the two ear notches' : '')], place: { view: 'front', x: -hw * .1, y: 0, flip: true, z: 2 } });
    twin('head-side-2', 'Head side', head, { place: { view: 'front', x: hw * .1, y: 0, z: 2 } });
    add('gusset', 'Head gusset', gus, { cut: 1, notch: ['e0R', 'e1R', 'e0L', 'e1L'], notes: [`From the nose over the crown to the back of the neck: ${said(S)} in along each edge, as the head side's edge is`], shown: blob([[0, 0], [hw * .16, hh * .25], [hw * .2, hh * .9], [0, hh * 1.25], [-hw * .2, hh * .9], [-hw * .16, hh * .25]], .9), place: { view: 'front', x: 0, y: hh * .05, z: 3 } });
    gusseted('Head gusset to the head side', 'head-side', hc, 'gusset');
    J('Chin seam: head side to head side, nose to throat', ['head-side', ['nose', 'throat'], 0], ['head-side', ['nose', 'throat'], 1]);
    if (s.snout !== 'none') { const rx = hw * .2 * mz; add('muzzle', 'Muzzle', { pts: ellipse(rx, hh * .14 * mz, 32), at: { e: [rx, 0], w: [-rx, 0] } }, { cut: 1, fabric: 'contrast', notes: [s.snout === 'long' ? 'A long muzzle: darted to stand out from the face, stuffed firm' : 'Contrast fabric', 'The nose embroidered with satin stitch'], place: { view: 'front', x: 0, y: hh * .66, z: 5 } });
      F('Muzzle: appliquéd on the face', ['muzzle', ['e', 'w', 'e']], 'its edge turned under and stitched down over the nose point, across the chin seam'); }
    // the body: two fronts and two backs. Its neck is the head's: each quarter (sloping from the centre seam down to the shoulder) half of a
    // head side's neck edge. The back is 6% fuller than the front, its length trued so its side seam walks the front's.
    const nq = cornerRun(head, 'throat', 'nape').L / 2, half = (kx, ky) => { const sh = [nq * .92, nq * .392], cr = [0, bh * ky]; return { pts: [[0, 0], ...smoothThrough([sh, [bw * .52 * kx, bh * .45 * ky], [bw * .48 * kx, bh * .9 * ky], cr], 8)], at: { nc: [0, 0], sh, crotch: cr } }; };
    const front = half(1, 1), sideL = cornerRun(front, 'sh', 'crotch').L, ky = solveUp(k => cornerRun(half(1.06, k), 'sh', 'crotch').L, sideL, .7, 1.2), back = half(1.06, ky), sm = [];
    const arm = s.arms ? blobAt([[0, 0, 'b0'], [armL * .32, 0, 'b1'], [armL * .36, armL * .78], [armL * .18, armL, 'tip'], [-armL * .02, armL * .8]], .8) : null;
    if (arm) { const ab = cornerRun(arm, 'b0', 'b1').L; sm.push(['a0', h * .02], ['a1', h * .02 + ab]); }
    if (s.legs) sm.push(['hip', Math.max(distWhere(front, 'sh', 'crotch', p => p[1] >= bh * .78), (arm ? sm[1][1] : 0) + h * .02)]);
    markRun(front, 'sh', 'crotch', sm); markRun(back, 'sh', 'crotch', sm);
    const cb = cornerRun(back, 'nc', 'crotch').L, [o0, o1, ol] = openIn(0, cb, Math.max(2.5, h * .22)); markRun(back, 'nc', 'crotch', [['o0', o0], ['o1', o1]]);
    const sc = ['sh', ...sm.map(x => x[0]), 'crotch'];
    add('body-front', 'Body front', front, { cut: 2, pair: true, notch: sm.map(x => x[0]), notes: ['Centre-front seam', `The neck edge is half of a head side's neck edge (${said(nq)} in)`], place: { view: 'front', x: 0, y: hh * .92, z: 1 } });
    twin('body-front-2', 'Body front', front, { place: { view: 'front', x: 0, y: hh * .92, flip: true, z: 1 }, hidden: true });
    add('body-back', 'Body back', back, { cut: 2, pair: true, notch: [...sm.map(x => x[0]), 'o0', 'o1'], notes: [`Leave a ${said(ol)} in opening in the centre-back seam, between its two notches, to stuff; closed by hand with a ladder stitch`], place: { view: 'back', x: 0, y: hh * .92 } });
    twin('body-back-2', 'Body back', back, { place: { view: 'back', x: 0, y: hh * .92, flip: true } });
    for (const [k, sd] of SIDES) { J(`Head onto the neck, ${sd} side`, ['head-side', ['throat', 'nape'], k], [['body-front', ['nc', 'sh'], k], ['body-back', ['nc', 'sh'], k]], { why: 'a head side\'s neck edge onto a front\'s and a back\'s' });
      walk(`Side seam, ${sd}: front to back`, ['body-front', sc, k], ['body-back', sc, k]); }
    J('Centre-front seam', ['body-front', ['nc', 'crotch'], 0], ['body-front', ['nc', 'crotch'], 1]);
    walk('Centre-back seam', ['body-back', ['nc', 'o0', 'o1', 'crotch'], 0], ['body-back', ['nc', 'o0', 'o1', 'crotch'], 1]);
    open('Stuffing opening in the centre-back seam', 'body-back', ['nc', 'o0', 'o1', 'crotch'], ol);
    if (arm) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'arm' : 'arm-2', 'Arm', arm, { cut: 4, pair: true, notes: sg > 0 ? ['Two pairs: inner and outer', 'Its top caught in the side seam between the two arm notches'] : [], place: { view: 'front', x: sg * bw * .42, y: hh * 1.02, rot: sg * -28, flip: sg < 0, z: 4 }, hidden: sg < 0 });
      for (const [k, sd] of SIDES) caught(`Arm, ${sd}`, 'arm', [2 * k, 2 * k + 1], ['body-front', ['a0', 'a1'], k], 'the side seam'); }
    let leg = null;
    if (s.legs) { leg = blobAt([[0, 0, 't0'], [legH * .45, 0, 't1'], [legH * .5, legH * .7], [legH * .75, legH, 'toe'], [0, legH, 'heel']], .8); const round = 2 * cornerRun(leg, 'toe', 'heel').L, pad = ovalRound(legH * .28, legH * .2, round, 28, ['toe', 'out', 'heel', 'in']);
      for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'leg' : 'leg-2', 'Leg', leg, { cut: 4, pair: true, notes: sg > 0 ? ['Two pairs: inner and outer, the pad set into the open foot', 'Stuffed, its top closed and ladder-stitched to the body, its two top corners level with the hip notch (its rounded top laps the body above it)'] : [], place: { view: 'front', x: sg * bw * .08 + (sg < 0 ? -legH * .75 : 0), y: hh * .92 + bh * .78, flip: sg < 0, z: 5 }, hidden: sg < 0 });
      add('foot-pad', 'Foot pad', pad, { cut: 2, fabric: 'contrast', notch: ['toe', 'heel'], notes: [`Contrast, set into the bottom of each leg: ${said(round)} in round, as the leg's open foot is`, 'Notches: the toe and the heel, where the leg seams meet it'], place: { view: 'back', x: 0, y: h * .96, z: 3 } });
      for (const [k, sd] of SIDES) { J(`Leg, ${sd}: front seam, inner to outer`, ['leg', ['t1', 'toe'], 2 * k], ['leg', ['t1', 'toe'], 2 * k + 1]); J(`Leg, ${sd}: back seam, inner to outer`, ['leg', ['t0', 'heel'], 2 * k], ['leg', ['t0', 'heel'], 2 * k + 1]);
        J(`Foot pad into the ${sd} leg: outer half`, ['leg', ['toe', 'heel'], 2 * k], ['foot-pad', ['toe', 'out', 'heel'], k], { why: 'half the pad\'s round to each layer of the leg' }); J(`Foot pad into the ${sd} leg: inner half`, ['leg', ['toe', 'heel'], 2 * k + 1], ['foot-pad', ['heel', 'in', 'toe'], k]);
        for (const c of [2 * k, 2 * k + 1]) F(`Leg, ${sd}: its top`, ['leg', ['t0', 't1'], c], 'turned in, closed after stuffing and ladder-stitched to the body at the hip notch'); } }
    if (ear) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: 4, pair: true, notes: sg > 0 ? ['Two outer, two inner (inner in contrast if you like)', 'Its base caught in the gusset seam between the two ear notches'] : [], place: { view: 'front', x: sg * hw * .42, y: s.ears === 'long' ? -hh * .22 * 2.5 : -hh * .16, rot: sg * 12, z: 1 }, hidden: sg < 0 });
      for (const [k, sd] of SIDES) caught(`Ear, ${sd}`, 'ear', [2 * k, 2 * k + 1], ['head-side', ['e0', 'e1'], k], 'the gusset seam'); }
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, about ${r8(hh * .3)} in apart, on the line ${r8(hh * .52)} in below the top of the head`);
    // its height: the head above its neck seam, the body down to the hip notch and the leg below it, its top corners at the notch (or the
    // body alone, with no legs)
    made = levelOf(head, 'throat', 'nape') - boundsOf(head.pts).y0 - levelOf(front, 'nc', 'sh') + (leg ? front.at.hip[1] + boundsOf(leg.pts).y1 : boundsOf(front.pts).y1);
  } else if (s.shape === 'quad' || s.shape === 'elephant') {
    // sitting on its seat, four legs: the head in two sides with a gusset from the nose (an elephant's: the tip of its trunk) over the brow and
    // the crown to the back of the head; the body in two sides with an underbody gusset from the chest to the seat; the head sits on the
    // body's top and the top of its chest; front legs to the ground, hind legs on the haunch, every leg on a pad; a tail in the back seam
    const el = s.shape === 'elephant', hh = el ? h * .46 : h * .42 * s.head, hw = hh, tr = h * .34, bh = h * .58, bw = h * .62, legF = h * (el ? .3 : .32), legB = h * .22, sl = el ? 0 : { none: 0, short: .14, long: .32, broad: .3 }[s.snout] * hh;
    const head = el ? blobAt([[0, hh * .5, 'brow'], [hw * .1, hh * .16], [hw * .4, 0], [hw * .66, hh * .14], [hw * .72, hh * .5, 'back'], [hw * .5, hh * .86], [hw * .22, hh * .9, 'throat'], [hw * .1, hh * .9 + tr * .5], [hw * .06, hh * .9 + tr], [-hw * .1, hh * .9 + tr * .98, 'trunk'], [-hw * .02, hh * .9 + tr * .5], [-hw * .04, hh * .78, 'root']], .7)
      : blobAt(sl ? [[0, hh * .42, 'brow'], [hw * .12, hh * .12], [hw * .42, 0], [hw * .68, hh * .18], [hw * .72, hh * .55, 'back'], [hw * .5, hh * .9], [hw * .2, hh * .94, 'throat'], [-sl * .7, hh * .82], [-sl, hh * .66, 'nose'], [-sl * .85, hh * .52]]
        : [[0, hh * .42, 'nose'], [hw * .12, hh * .12], [hw * .42, 0], [hw * .68, hh * .18], [hw * .72, hh * .55, 'back'], [hw * .5, hh * .9], [hw * .2, hh * .94, 'throat'], [-hw * .02, hh * .72]], .75);
    // the gusset seam, from the nose: the marks before the crown, then the ears
    const nz = el ? 'trunk' : 'nose', g0 = el || sl ? 'brow' : 'nose', pre = el ? [['root', cornerRun(head, 'trunk', 'root').L], ['brow', cornerRun(head, 'trunk', 'root').L + cornerRun(head, 'root', 'brow').L]] : sl ? [['brow', cornerRun(head, 'nose', 'brow').L]] : [];
    const S0 = pre.length ? pre[pre.length - 1][1] : 0, S1 = cornerRun(head, g0, 'back').L, S = S0 + S1, earW = hw * .9, ew = hh * (s.ears === 'long' ? .2 : s.ears === 'big' ? .5 : s.ears === 'floppy' ? .3 : .28);
    const ear = el ? blobAt([[0, 0, 'b0'], [earW * .42, -earW * .12], [earW * .78, earW * .12], [earW * .82, earW * .62, 'tip'], [earW * .5, earW * 1.02], [earW * .12, earW * .9, 'b1'], [-earW * .04, earW * .5]], .85)
      : ears ? earAt(s.ears, ew) : null;
    const eb = ear ? cornerRun(ear, 'b0', 'b1').L : 0, pleat = el ? eb * .25 : 0, slot = eb - pleat, em = [];
    if (ear) { const c = slotAt(distTo(head, g0, 'back', [hw * (el ? .4 : .42), 0]) + slot * .25, slot, 0, S1, h); em.push(['e0', c - slot / 2], ['e1', c + slot / 2]); markRun(head, g0, 'back', em); }
    const gm = [...pre, ...em.map(([n, d]) => [n, S0 + d])], hc = [nz, ...gm.map(x => x[0]), 'back'];
    const gus = gussetAlong(S, el ? [[0, 0], [hw * .14, hw * .07], [pre[0][1] * .55, hw * .1], [pre[0][1], hw * .14], [S0 + S1 * .12, hw * .21], [S0 + S1 * .45, hw * .22], [S0 + S1 * .8, hw * .17], [S, 0]]
      : sl ? [[0, 0], [hw * .12, hw * .06], [S0 * .85, hw * .09], [S0 + S1 * .2, hw * .19], [S0 + S1 * .55, hw * .2], [S0 + S1 * .82, hw * .16], [S, 0]] : [[0, 0], [hw * .14, hw * .08], [S * .3, hw * .19], [S * .6, hw * .2], [S * .84, hw * .16], [S, 0]], gm);
    const hname = el ? 'Head side and trunk' : sl ? 'Head side and snout' : 'Head side';
    add('head-side', hname, head, { cut: 2, pair: true, notch: [nz, ...gm.map(x => x[0]), 'back', 'throat'], notes: [el ? 'Cut in one with the trunk: the two sides meet round the tip of the trunk and up its underside to the throat' : sl ? 'Cut in one with the snout: the two sides meet under the snout and the chin' : 'The two sides meet under the chin',
      `Notches: ${el ? 'the tip of the trunk (the gusset\'s tip), the root of the trunk, the brow' : sl ? 'the nose (the gusset\'s tip), the brow' : 'the brow (the gusset\'s tip)'}${ear ? ', the two ear notches' : ''}, the back of the head (the gusset's other tip), the throat`], place: { view: 'front', x: -hw * .08, y: 0, flip: true, z: 3 } });
    twin('head-side-2', hname, head, { place: { view: 'front', x: hw * .08, y: 0, z: 3 }, hidden: true });
    add('gusset', el ? 'Head and trunk gusset' : 'Head gusset', gus, { cut: 1, notch: gm.flatMap(x => [x[0] + 'R', x[0] + 'L']), notes: [`${el ? 'From the tip of the trunk up its top, over the brow and the crown to the back of the head' : sl ? 'From the nose up the top of the snout, over the brow and the crown to the back of the head' : 'From the brow over the crown to the back of the head'}: ${said(S)} in along each edge, as the head side's edge is`, 'Its notches match the head side\'s'],
      shown: el ? blob([[0, 0], [hw * .2, hh * .3], [hw * .22, hh * .8], [hw * .1, hh + tr * .6], [0, hh + tr * .95], [-hw * .1, hh + tr * .6], [-hw * .22, hh * .8], [-hw * .2, hh * .3]], .9) : blob([[0, 0], [hw * .18, hh * .3], [hw * .2, hh * .8], [hw * .08, hh + sl * .9], [0, hh + sl], [-hw * .08, hh + sl * .9], [-hw * .2, hh * .8], [-hw * .18, hh * .3]], .9), place: { view: 'front', x: 0, y: 0, z: 4 } });
    gusseted(el ? 'Head and trunk gusset to the head side' : 'Head gusset to the head side', 'head-side', hc, 'gusset');
    J(el ? 'Trunk seam: head side to head side, round the tip of the trunk and up its underside to the throat' : sl ? 'Chin seam: head side to head side, under the snout from the nose to the throat' : 'Chin seam: head side to head side, brow to throat', ['head-side', [nz, 'throat'], 0], ['head-side', [nz, 'throat'], 1]);
    if (sl) { const rx = Math.max(hw * .09, .2); add('nose', 'Nose', { pts: ellipse(rx, Math.max(hw * .065, .145), 24), at: { e: [rx, 0], w: [-rx, 0] } }, // no smaller than can be cut and stitched down
      { cut: 1, fabric: 'contrast', notes: ['Felt or leather, appliquéd on the tip of the snout before it is closed (or embroidered, satin stitch)'], place: { view: 'front', x: 0, y: hh * .62, z: 6 } });
      F('Nose: appliquéd on the tip of the snout', ['nose', ['e', 'w', 'e']], 'stitched down over the gusset\'s tip before the snout is closed'); }
    if (el) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: 2, pair: true, notes: sg > 0 ? ['Two in self (the backs)', `Its base pleated (${said(pleat)} in taken up) into the gusset seam between the two ear notches`] : [], place: { view: 'front', x: sg * hw * .42 + (sg < 0 ? -earW * .8 : 0), y: hh * .12, flip: sg < 0, z: 1 }, hidden: sg < 0 });
      add('ear-lining', 'Ear lining', { pts: ear.pts, at: ear.at }, { cut: 2, pair: true, fabric: 'contrast', notes: ['Contrast: the face of each ear, the size of the ear; sewn to the back right sides together, turned, topstitched, then pleated with it into the gusset seam'], place: { view: 'front', x: hw * .45, y: hh * .14, z: 2 }, hidden: true });
      for (const [k, sd] of SIDES) { J(`Ear, ${sd}: back to lining`, ['ear', ['b0', 'tip', 'b1'], k], ['ear-lining', ['b0', 'tip', 'b1'], k], { why: 'sewn round and turned through its base' });
        for (const id of ['ear', 'ear-lining']) J(`${id === 'ear' ? 'Ear' : 'Ear lining'}, ${sd}, pleated into the gusset seam`, ['head-side', ['e0', 'e1'], k], [id, ['b0', 'b1'], k], { caught: true, gap: -pleat, why: `its base, less the ${said(pleat)} in its pleat takes up, lies in the seam between the two ear notches` }); } }
    // the body: its neck opening is the head's neck edge, along its top and down the top of its chest; the chest seam below it; then the
    // underbody gusset, as long as the body's edge from the chest round under it to the seat
    const body = blobAt([[0, 0, 'top0'], [bw * .3, -bh * .02, 'nb'], [bw * .62, bh * .2], [bw * .74, bh * .6], [bw * .62, bh * .96, 'seat'], [bw * .2, bh], [-bw * .02, bh * .7], [-bw * .06, bh * .3]], .8);
    const legOf = ky => blobAt([[0, 0, 't0'], [legF * (el ? .44 : .4), 0, 't1'], [legF * (el ? .48 : .44), legF * ky, 'toe'], [-legF * .04, legF * ky, 'heel']], .6);
    const N = cornerRun(head, 'back', 'throat').L, under0 = cornerRun(body, 'top0', 'seat').L, ground = boundsOf(body.pts).y1;
    const dnf = Math.max(h * .02, N - cornerRun(body, 'nb', 'top0').L), dch = Math.max(distTo(body, 'top0', 'seat', [-bw * .06, bh * .3]), dnf + h * .03), dlf = Math.max(dch + h * .03, distWhere(body, 'top0', 'seat', p => p[1] >= ground - boundsOf(legOf(1).pts).y1));
    const dB5 = distTo(body, 'top0', 'seat', [bw * .2, bh]), dhl = Math.max(dlf + h * .03, dB5 + (under0 - dB5) * .45);
    markRun(body, 'top0', 'seat', [['nf', dnf], ['ch', dch], ['lf', dlf], ['hl', dhl]]);
    // the front leg is as long as the drop from its notch to the ground, so its sole is level with the seat; the hind foot is made as far
    // round as the front one, so one pad fits all four
    const lky = solveUp(k => boundsOf(legOf(k).pts).y1, ground - body.at.lf[1], .3, 2.5), legFr = legOf(lky), foot = cornerRun(legFr, 'toe', 'heel').L;
    const hind = kx => blobAt([[0, 0, 't0'], [legB * .6 * kx, -legB * .1, 't1'], [legB * .8 * kx, legB * .7, 'toe'], [legB * .1 * kx, legB * .8, 'heel']], .7), kx = solveUp(k => cornerRun(hind(k), 'toe', 'heel').L, foot, .5, 2.5), legHi = hind(kx);
    const US = under0 - dch, under = gussetAlong(US, [[0, 0], [US * .18, bw * .16], [US * .55, bw * .2], [US * .82, bw * .18], [US, 0]], [['lf', dlf - dch], ['hl', dhl - dch]]);
    const tail = !s.tail ? null : el ? blobAt([[0, 0, 'b0'], [h * .03, 0, 'b1'], [h * .025, h * .16], [0, h * .16, 'tip']], .4) : tailAt(s.tailType, h), tb = tail ? cornerRun(tail, 'b0', 'b1').L : 0;
    const backL = cornerRun(body, 'nb', 'seat').L, bmk = []; let free = backL;
    if (tail) { const c = slotAt(distWhere(body, 'nb', 'seat', p => p[1] >= bh * .74), tb, 0, backL, h); bmk.push(['tl0', c - tb / 2], ['tl1', c + tb / 2]); free = c - tb / 2; }
    const [o0, o1, ol] = openIn(0, free, Math.max(2.5, h * .2)); bmk.unshift(['o0', o0], ['o1', o1]); markRun(body, 'nb', 'seat', bmk);
    const bc = ['nb', ...bmk.map(x => x[0]), 'seat'];
    add('body-side', 'Body side', body, { cut: 2, pair: true, notch: ['nb', 'nf', 'ch', 'lf', 'hl', 'seat', ...bmk.map(x => x[0])], notes: [`Leave a ${said(ol)} in opening in the back seam, between its two notches, to stuff; closed by hand with a ladder stitch`,
      'Notches, from the neck down the front: the front of the neck, the chest (the underbody gusset\'s tip), the front leg, the hind leg, the seat (the gusset\'s other tip)' + (tail ? '; on the back seam, the opening and the tail' : '; on the back seam, the opening')], place: { view: 'back', x: -bw * .36, y: hh * .74, z: 1 } });
    add('underbody', 'Underbody gusset', under, { cut: 1, notch: ['lfR', 'lfL', 'hlR', 'hlL'], notes: [`From the chest between the front legs to the seat: ${said(US)} in along each edge, as the body side's edge is`, 'Its notches match the body side\'s leg notches'], shown: blob([[0, 0], [bw * .16, bh * .08], [bw * .2, bh * .7], [0, bh * .82], [-bw * .2, bh * .7], [-bw * .16, bh * .08]], .9), place: { view: 'front', x: 0, y: hh * .82, z: 1 } });
    for (const [k, sd] of SIDES) J(`Head onto the neck, ${sd} side`, ['head-side', ['back', 'throat'], k], ['body-side', ['nb', 'top0', 'nf'], k], { why: 'the head side\'s neck edge along the body side\'s top and down the top of its chest' });
    J('Chest seam: body side to body side, neck to chest', ['body-side', ['nf', 'ch'], 0], ['body-side', ['nf', 'ch'], 1]);
    gusseted('Underbody gusset to the body side', 'body-side', ['ch', 'lf', 'hl', 'seat'], 'underbody');
    walk('Back seam: body side to body side', ['body-side', bc, 0], ['body-side', bc, 1]);
    open('Stuffing opening in the back seam', 'body-side', bc.slice(0, 4), ol);
    // the legs: each in two, on a pad as far round as its open foot
    const pad = ovalRound(legF * (el ? .2 : .18), legF * (el ? .17 : .15), 2 * foot, 28, ['toe', 'out', 'heel', 'in']);
    for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'leg-front' : 'leg-front-2', 'Front leg', legFr, { cut: 4, pair: true, notes: sg > 0 ? ['Two pairs: inner and outer, the pad set into the open foot', 'Stuffed, its top closed and ladder-stitched to the body, its two top corners level with the front leg notch, so its sole is level with the seat'] : [], place: { view: 'front', x: sg * bw * .14 + (sg < 0 ? -legF * (el ? .44 : .4) : 0), y: h - legF * lky, flip: sg < 0, z: 5 }, hidden: sg < 0 });
    for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'leg-hind' : 'leg-hind-2', 'Hind leg', legHi, { cut: 4, pair: true, notes: sg > 0 ? ['Two pairs, the pad set into the open foot; stuffed, closed and sewn to the body side at the haunch, above the hind leg notch, the foot turned forward'] : [], place: { view: 'front', x: sg * bw * .36 + (sg < 0 ? -legB * .8 * kx : 0), y: h - legB * .8, flip: sg < 0, z: 4 }, hidden: sg < 0 });
    add('foot-pad', 'Foot pad', pad, { cut: 4, fabric: 'contrast', notch: ['toe', 'heel'], notes: [`Contrast, one in the bottom of each leg: ${said(2 * foot)} in round, as each leg's open foot is`, 'Notches: the toe and the heel, where the leg seams meet it'], place: { view: 'back', x: 0, y: h * .96, z: 3 } });
    for (const [li, id, word] of [[0, 'leg-front', 'Front leg'], [1, 'leg-hind', 'Hind leg']]) for (const [k, sd] of SIDES) { const o = 2 * k, i = 2 * k + 1, p = 2 * li + k;
      J(`${word}, ${sd}: front seam, inner to outer`, [id, ['t1', 'toe'], o], [id, ['t1', 'toe'], i]); J(`${word}, ${sd}: back seam, inner to outer`, [id, ['t0', 'heel'], o], [id, ['t0', 'heel'], i]);
      J(`Foot pad into the ${sd} ${word.toLowerCase()}: outer half`, [id, ['toe', 'heel'], o], ['foot-pad', ['toe', 'out', 'heel'], p], { why: 'half the pad\'s round to each layer of the leg' }); J(`Foot pad into the ${sd} ${word.toLowerCase()}: inner half`, [id, ['toe', 'heel'], i], ['foot-pad', ['heel', 'in', 'toe'], p]);
      for (const c of [o, i]) F(`${word}, ${sd}: its top`, [id, ['t0', 't1'], c], li ? 'turned in, closed after stuffing and ladder-stitched to the body side at the haunch' : 'turned in, closed after stuffing and ladder-stitched to the body at the front leg notch'); }
    if (ear && !el) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: 4, pair: true, notes: sg > 0 ? ['Two outer in self, two inner in contrast', 'Its base caught in the gusset seam between the two ear notches'] : [], place: { view: 'front', x: sg * hw * .38, y: s.ears === 'floppy' ? hh * .2 : -ew * .6, rot: sg * 10, flip: sg < 0, z: 2 }, hidden: sg < 0 });
      for (const [k, sd] of SIDES) caught(`Ear, ${sd}`, 'ear', [2 * k, 2 * k + 1], ['head-side', ['e0', 'e1'], k], 'the gusset seam'); }
    if (tail) { const hair = !el && s.tailType === 'hair', tuft = el || s.tailType === 'tuft';
      add('tail', 'Tail', tail, { cut: hair ? 1 : 2, ...(hair ? { fabric: 'contrast' } : {}), notes: [el ? 'Two strips, sewn and turned; the tuft is yarn knotted into the tip' : hair ? 'Long-pile faux fur (or yarn), in the mane\'s colour: rolled, brushed out' : s.tailType === 'bushy' ? 'Two pieces, the pile brushed long; the tip in contrast if you like' : tuft ? 'Two strips, sewn and turned; the tuft is yarn knotted into the tip' : s.tailType === 'short' ? 'A stub: two pieces, sewn, turned, stuffed' : 'Two strips, sewn and turned, a pipe of fill down it',
        'Its base caught in the back seam between the two tail notches'], place: { view: 'back', x: 0, y: el ? hh * .74 + bh * .72 : h * .75, z: 2 } });
      caught('Tail', 'tail', hair ? [0] : [0, 1], ['body-side', ['tl0', 'tl1'], 0], 'the back seam');
      if (hair) F('Tail: its long edges and its end', ['tail', ['b1', 'tip', 'b0']], 'rolled along its length and whipped; the pile covers the edge'); }
    notes.push(el ? `Face: ${PLUSH_EYES[s.eyes]}, about ${r8(hw * .44)} in apart, ${r8(hh * .45)} in below the top of the head, either side of the trunk` : `Face: ${PLUSH_EYES[s.eyes]}, about ${r8(hw * .42)} in apart, ${r8(hh * .4)} in below the top of the head${sl ? ', above the snout' : ''}`);
    if (el) notes.push('The ears are the character: interfacing in the ear backs keeps them standing out from the head');
    // its height, sitting: the head above its neck seam, the body below it down to the seat
    made = levelOf(head, 'back', 'throat') - boundsOf(head.pts).y0 + ground - levelOf(body, 'nb', 'top0', 'nf');
  } else if (s.shape === 'sea') {
    // a sea creature, its length the size: two body sides from the nose to the tail stock, a belly gusset in contrast as long as the body
    // side's belly edge, the side fins caught in the belly seam and the dorsal fin in the top seam, the tail's root as wide as the tail stock
    const L = h, bh = L * .42, bw = L * .36;
    const side = blobAt([[0, bh * .52, 'nose'], [L * .12, bh * .1], [L * .4, 0], [L * .66, bh * .14], [L * .82, bh * .36, 'st'], [L * .84, bh * .55, 'sb'], [L * .66, bh * .78], [L * .4, bh * .9], [L * .14, bh * .86]], .8);
    const topL = cornerRun(side, 'nose', 'st').L, bel = cornerRun(side, 'nose', 'sb').L, stock = cornerRun(side, 'st', 'sb').L, tm = []; let f0 = 0, f1 = topL;
    const dors = s.dorsal ? blobAt([[0, 0, 'b0'], [L * .14, 0, 'b1'], [L * .1, -L * .1, 'tip'], [L * .02, -L * .12]], .6) : null;
    if (dors) { const db = cornerRun(dors, 'b0', 'b1').L, c = slotAt(distWhere(side, 'nose', 'st', p => p[0] >= L * .47), db, 0, topL, h); tm.push(['d0', c - db / 2], ['d1', c + db / 2]); if (topL - c - db / 2 >= Math.max(2.5, L * .16) + .85 || topL - c - db / 2 > c - db / 2) f0 = c + db / 2; else f1 = c - db / 2; } // behind the dorsal fin when it fits there
    const [o0, o1, ol] = openIn(f0, f1, Math.max(2.5, L * .16)); tm.push(['o0', o0], ['o1', o1]); tm.sort((a, b) => a[1] - b[1]); markRun(side, 'nose', 'st', tm);
    const fin = blobAt([[0, 0, 'b0'], [L * .1, L * .02], [L * .2, L * .1, 'tip'], [L * .06, L * .1, 'b1']], .7), fb = cornerRun(fin, 'b0', 'b1').L, fc = slotAt(distWhere(side, 'nose', 'sb', p => p[0] >= L * .3), fb, 0, bel, h), fm = [['f0', fc - fb / 2], ['f1', fc + fb / 2]];
    markRun(side, 'nose', 'sb', fm);
    const belly = gussetAlong(bel, [[0, 0], [bel * .14, bw * .26], [bel * .5, bw * .36], [bel * .88, bw * .2], [bel, 0]], fm), tc = ['nose', ...tm.map(x => x[0]), 'st'];
    add('body-side', 'Body side', side, { cut: 2, pair: true, notch: ['nose', 'st', 'sb', 'f0', 'f1', ...tm.map(x => x[0])], notes: [`Leave a ${said(ol)} in opening in the top seam, between its two notches, to stuff; closed by hand with a ladder stitch`, `Notches: the nose and the tail stock (the belly gusset's tips), the side fin${dors ? ', the dorsal fin' : ''}, the opening`], place: { view: 'front', x: -L * .42, y: 0, z: 2 } });
    add('belly', 'Belly gusset', belly, { cut: 1, fabric: 'contrast', notch: ['f0R', 'f1R', 'f0L', 'f1L'], notes: [`Contrast: the pale underside, from under the chin to the tail stock: ${said(bel)} in along each edge, as the body side's belly edge is`, 'Its notches match the body side\'s fin notches'], place: { view: 'back', x: 0, y: 0, z: 1 } });
    walk('Top seam: body side to body side', ['body-side', tc, 0], ['body-side', tc, 1]);
    open('Stuffing opening in the top seam', 'body-side', (i => tc.slice(i - 1, i + 3))(tc.indexOf('o0')), ol);
    gusseted('Belly gusset to the body side', 'body-side', ['nose', 'f0', 'f1', 'sb'], 'belly');
    for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'fin' : 'fin-2', 'Side fin', fin, { cut: 4, pair: true, notes: sg > 0 ? ['Two pairs, sewn, turned, topstitched', 'Its base caught in the belly seam between the two fin notches'] : [], place: { view: 'front', x: sg * bw * .5 + (sg < 0 ? -L * .2 : 0), y: bh * .7, flip: sg < 0, z: 4 }, hidden: sg < 0 });
    for (const [k, sd] of SIDES) caught(`Side fin, ${sd}`, 'fin', [2 * k, 2 * k + 1], ['body-side', ['f0', 'f1'], k], 'the belly seam');
    if (dors) { add('dorsal', 'Dorsal fin', dors, { cut: 2, notes: ['Sewn, turned and stuffed lightly', 'Its base caught in the top seam between the two dorsal notches'], place: { view: 'front', x: -L * .02, y: 0, z: 1 } }); caught('Dorsal fin', 'dorsal', [0, 1], ['body-side', ['d0', 'd1'], 0], 'the top seam'); }
    let tail = null;
    if (s.tail) { const b = stock, upright = s.tailType === 'fin', mid = upright ? [[L * .14, -L * .12], [L * .1, 0], [L * .14, L * .12]] : [[L * .1, -L * .16], [L * .14, -L * .14], [L * .06, 0], [L * .14, L * .14], [L * .1, L * .16]];
      tail = { pts: smoothThrough([[0, -b / 2], ...mid, [0, b / 2]], 6), at: { b0: [0, -b / 2], b1: [0, b / 2], tip: mid[upright ? 0 : 1] } };
      add('tail', upright ? 'Tail fin' : 'Tail fluke', tail, { cut: 2, notes: [upright ? 'Upright, as a fish\'s or a shark\'s: sewn, turned, stuffed lightly' : 'Flat, as a whale\'s or a dolphin\'s: sewn, turned, topstitched', `Its root is as wide as the tail stock's end (${said(b)} in) and is caught in the seam across it`], place: { view: 'front', x: L * .41, y: bh * .455, z: 1 } });
      caught(upright ? 'Tail fin' : 'Tail fluke', 'tail', [0, 1], ['body-side', ['st', 'sb'], 0], 'the seam across the tail stock'); }
    J('Tail stock: body side to body side, across its end', ['body-side', ['st', 'sb'], 0], ['body-side', ['st', 'sb'], 1], { why: tail ? 'the tail\'s root lies between them' : 'closed across the end' });
    // its length: the body side from the nose to the tail stock's end, and the tail beyond it
    made = (side.at.st[0] + side.at.sb[0]) / 2 - boundsOf(side.pts).x0 + (tail ? boundsOf(tail.pts).x1 : 0);
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, one either side of the head, ${r8(L * .14)} in back from the nose`, `The size is its length: ${r8(made)} in from the nose to the ${tail ? 'tail' : 'tail stock'}`);
  } else if (s.shape === 'pillow') {
    // a pillow character: a front and a back the size asked for, and a side gusset as long as the front is round, joined at the bottom
    const w = h * .82, raw = blob([[0, 0], [w * .45, h * .05], [w * .5, h * .55], [w * .3, h], [-w * .3, h], [-w * .5, h * .55], [-w * .45, h * .05]], .85), rb = boundsOf(raw), fit = ([x, y]) => [(x - (rb.x0 + rb.x1) / 2) * w / rb.w, (y - rb.y0) * h / rb.h];
    const fpts = raw.map(fit), bm = fpts.reduce((m, q) => (q[1] > m[1] + 1e-9 || (Math.abs(q[1] - m[1]) <= 1e-9 && Math.abs(q[0]) < Math.abs(m[0])) ? q : m), fpts[0]), panel = () => ({ pts: fpts.map(q => q.slice()), at: { tm: fit([0, 0]), bm: bm.slice() } });
    const front = panel(), back = panel(), P = lenOf([...fpts, fpts[0]]), PA = cornerRun(front, 'tm', 'bm').L, ear = ears ? earAt(s.ears, h * .22) : null, eb = ear ? cornerRun(ear, 'b0', 'b1').L : 0, gm = [['ftm', PA]];
    if (ear) for (const X of ['A', 'B']) { const c = slotAt(distWhere(front, 'tm', 'bm', p => Math.abs(p[0]) >= w * .3), eb, 0, cornerRun(front, 'tm', 'bm').L, h); markRun(front, 'tm', 'bm', [['e0' + X, c - eb / 2], ['e1' + X, c + eb / 2]]);
      gm.push(...(X === 'A' ? [['fe1A', PA - c - eb / 2], ['fe0A', PA - c + eb / 2]] : [['fe0B', PA + c - eb / 2], ['fe1B', PA + c + eb / 2]])); }
    const ol = Math.max(0, Math.min(Math.max(3, h * .25), PA - 1.6)), om = [['o0', .75], ['o1', .75 + ol]]; markRun(back, 'bm', 'tm', om);
    const strip = stripOf(P, s.depth); markRun(strip, 'a', 'b', gm); markRun(strip, 'd', 'c', [['bo0', .75], ['bo1', .75 + ol], ['btm', cornerRun(back, 'bm', 'tm').L]]);
    add('front', 'Front', front, { cut: 1, notch: ['tm', 'bm', 'e0A', 'e1A', 'e0B', 'e1B'], notes: ['The face is embroidered before sewing', `${said(w)} in wide and ${said(h)} in tall`, 'Notches: the top and the bottom centre (where the gusset is joined)' + (ear ? ', and the two ear notches each side' : '')], place: { view: 'front', x: 0, y: 0, z: 2 } });
    add('back', 'Back', back, { cut: 1, notch: ['tm', 'bm', 'o0', 'o1'], notes: [`Opening of ${said(ol)} in in the bottom seam, between its two notches, to stuff`], place: { view: 'back', x: 0, y: 0 } });
    add('gusset', 'Side gusset', strip, { cut: 1, notch: [...gm.map(x => x[0]), 'bo0', 'bo1', 'btm'], notes: [`${s.depth} in deep and ${said(P)} in long, as the front is round; its two ends joined at the bottom centre`, 'Its notches match the front\'s and the back\'s'], place: { view: 'front', x: -w * .5, y: h + .5, z: 0 } });
    const fc = ear ? ['bm', 'e1A', 'e0A', 'tm', 'e0B', 'e1B', 'bm'] : ['bm', 'tm', 'bm'], gc = ear ? ['a', 'fe1A', 'fe0A', 'ftm', 'fe0B', 'fe1B', 'b'] : ['a', 'ftm', 'b'];
    walk('Front round the side gusset', ['front', fc, 0], ['gusset', gc, 0]);
    walk('Back round the side gusset', ['back', ['bm', 'o0', 'o1', 'tm', 'bm'], 0], ['gusset', ['d', 'bo0', 'bo1', 'btm', 'c'], 0]);
    open('Stuffing opening in the bottom seam, back to gusset', 'back', ['bm', 'o0', 'o1', 'tm'], ol);
    J('Side gusset: its two ends joined at the bottom', ['gusset', ['b', 'c']], ['gusset', ['a', 'd']]);
    if (ear) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: 4, pair: true, notes: sg > 0 ? ['Two outer, two inner', 'Its base caught in the seam between the front and the gusset, between the two ear notches'] : [], place: { view: 'front', x: sg * w * .3, y: -h * .22 * .55, rot: sg * 10, z: 1 }, hidden: sg < 0 });
      for (const [k, sd, , X] of [[0, 'right', 'R', 'A'], [1, 'left', 'L', 'B']]) caught(`Ear, ${sd}`, 'ear', [2 * k, 2 * k + 1], ['front', ['e0' + X, 'e1' + X], 0], 'the front seam'); }
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}`);
    made = boundsOf(fpts).h;
  } else {
    // bean and bunny: one front, a back in two halves (the centre-back seam takes the opening), and an oval base as far round as the bottom
    // edges it is sewn to; the ears and the arm nubs caught in the side seams
    const w = h * .7, front = blobAt([[0, 0, 'top'], [w * .34, h * .04], [w * .5, h * .4], [w * .46, h * .86, 'br'], [w * .2, h], [-w * .2, h], [-w * .46, h * .86, 'bl'], [-w * .5, h * .4], [-w * .34, h * .04]], .85);
    const hp = front.pts.filter(q => q[0] >= -1e-6), bcp = hp.reduce((m, q) => (Math.abs(q[0]) < 1e-6 && q[1] > m[1] ? q : m), [0, 0]), back = { pts: hp.map(q => q.slice()), at: { top: [0, 0], bs: [w * .46, h * .86], bc: [0, bcp[1]] } };
    const sideL = cornerRun(front, 'top', 'br').L, sm = [], ear = ears ? earAt(s.ears, h * (s.ears === 'long' ? .13 : .2)) : null, arm = s.arms ? blobAt([[0, 0, 'b0'], [h * .1, h * .02], [h * .12, h * .16, 'tip'], [0, h * .2, 'b1'], [-h * .04, h * .1]], .9) : null;
    if (ear) { const eb = cornerRun(ear, 'b0', 'b1').L, c = slotAt(distWhere(front, 'top', 'br', p => p[0] >= w * .22), eb, 0, sideL, h); sm.push(['e0', c - eb / 2], ['e1', c + eb / 2]); }
    if (arm) { const ab = cornerRun(arm, 'b0', 'b1').L, c = slotAt(distWhere(front, 'top', 'br', p => p[1] >= h * .58), ab, ear ? sm[1][1] : 0, sideL, h); sm.push(['a0', c - ab / 2], ['a1', c + ab / 2]); }
    markRun(front, 'top', 'br', sm.map(([n, d]) => [n + 'R', d])); markRun(front, 'top', 'bl', sm.map(([n, d]) => [n + 'L', d])); markRun(back, 'top', 'bs', sm);
    const fb = cornerRun(front, 'bl', 'br').L, bb = cornerRun(back, 'bs', 'bc').L, base = ovalRound(w * .4, w * .26, fb + 2 * bb, 40, ['e', 'f', 'w', 'b']); delete base.at.e; delete base.at.w;
    markRun(base, 'f', 'b', [['r', fb / 2]]); markRun(base, 'f', 'b', [['l', fb / 2]]);
    const cbL = cornerRun(back, 'top', 'bc').L, tl = s.tail ? h * .85 : 0, [o0, o1, ol] = openIn(0, tl ? tl - h * .03 : cbL, Math.max(2.5, h * .22)), cm = [['o0', o0], ['o1', o1], ...(tl ? [['tl', tl]] : [])]; markRun(back, 'top', 'bc', cm);
    const cc = ['top', ...cm.map(x => x[0]), 'bc'], pellets = s.age !== '0+';
    add('front', 'Front', front, { cut: 1, notch: ['top', 'br', 'bl', ...sm.flatMap(x => [x[0] + 'R', x[0] + 'L'])], notes: ['The face is embroidered before sewing', 'Notches: the top, and each side where the side seam stops and the base starts' + (sm.length ? `; the ${[ear && 'ear', arm && 'arm'].filter(Boolean).join(' and the ')} notches` : '')], place: { view: 'front', x: 0, y: 0, z: 2 } });
    add('back', 'Back', back, { cut: 2, pair: true, notch: ['bs', ...sm.map(x => x[0]), ...cm.map(x => x[0])], notes: [`Opening of ${said(ol)} in in the centre-back seam, between its two notches, to stuff`], place: { view: 'back', x: 0, y: 0 } });
    twin('back-2', 'Back', back, { place: { view: 'back', x: 0, y: 0, flip: true } });
    add('base', 'Base', base, { cut: 1, notch: ['f', 'b', 'l', 'r'], notes: [`${said(fb + 2 * bb)} in round, as the bottom edges it is sewn to are`, 'Notches: the centre front, the centre back, and the two side seams', pellets ? 'A pouch of polypellets, double-stitched shut, is tacked to the base inside (3 years and up only)' : 'No pellets in a toy for under-3s: fibre fill only'], place: { view: 'back', x: 0, y: h, z: 1 } });
    for (const [k, sd, X] of SIDES) walk(`Side seam, ${sd}: front to back`, ['front', ['top', ...sm.map(x => x[0] + X), k ? 'bl' : 'br'], 0], ['back', ['top', ...sm.map(x => x[0]), 'bs'], k]);
    walk('Centre-back seam', ['back', cc, 0], ['back', cc, 1]);
    open('Stuffing opening in the centre-back seam', 'back', cc.slice(0, 4), ol);
    J('Base into the front\'s bottom edge', ['front', ['bl', 'br'], 0], ['base', ['l', 'f', 'r'], 0], { why: 'from one side seam round the front to the other' });
    J('Base into the right back\'s bottom edge', ['back', ['bs', 'bc'], 0], ['base', ['r', 'b'], 0]); J('Base into the left back\'s bottom edge', ['back', ['bs', 'bc'], 1], ['base', ['b', 'l'], 0]);
    if (arm) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'arm' : 'arm-2', 'Arm nub', arm, { cut: 4, pair: true, notes: sg > 0 ? ['Two pairs: sewn, turned, stuffed lightly', 'Its base caught in the side seam between the two arm notches'] : [], place: { view: 'front', x: sg * w * .5 + (sg < 0 ? -h * .1 : 0), y: h * .48, rot: sg * -20, flip: sg < 0, z: 3 }, hidden: sg < 0 });
      for (const [k, sd, X] of SIDES) caught(`Arm nub, ${sd}`, 'arm', [2 * k, 2 * k + 1], ['front', ['a0' + X, 'a1' + X], 0], 'the side seam'); }
    if (ear) { for (const sg of [1, -1]) (sg > 0 ? add : twin)(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: 4, pair: true, notes: sg > 0 ? ['Outer in self, inner in contrast', 'Its base caught in the side seam between the two ear notches'] : [], place: { view: 'front', x: sg * w * .22, y: s.ears === 'long' ? -h * .13 * 2.6 : -h * .2 * .6, rot: sg * 8, z: 1 }, hidden: sg < 0 });
      for (const [k, sd, X] of SIDES) caught(`Ear, ${sd}`, 'ear', [2 * k, 2 * k + 1], ['front', ['e0' + X, 'e1' + X], 0], 'the side seam'); }
    if (s.tail) { const r = h * .07; add('tail', 'Tail', { pts: ellipse(r, r, 24), at: { e: [r, 0], w: [-r, 0] } }, { cut: 1, fabric: 'contrast', notes: ['A gathered circle, stuffed; sewn on by hand over the centre-back seam at the tail notch'], place: { view: 'back', x: 0, y: h * .78, z: 2 } });
      F('Tail: its edge', ['tail', ['e', 'w', 'e']], 'gathered, stuffed and ladder-stitched to the back at the tail notch'); }
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, about ${r8(w * .28)} in apart, ${r8(h * .38)} in below the top`);
    made = boundsOf(front.pts).h;
  }
  return { pieces, notes, asm, made, h };
}
// a fixed body type at the size asked for: drafted, its height measured off its outlines, and drafted again until it stands that height
function fixedPlush(s) { let d = draftFixed(s, s.height); for (let k = 0; k < 2 && Math.abs(d.made - s.height) > 1e-4; k++) d = draftFixed(s, d.h * s.height / d.made); return d; }
export function plushPattern(input = {}) {
  const s = cleanPlush(input), h = s.height, pieces = [], notes = [];
  let built = null, fixed = null;
  if (s.shape === 'build') {
    // bolted together from the parts library (src/lab-plush-parts.js): every part drafted to where it is sewn, each join recorded
    built = buildPlush(s);
    for (const q of built.pieces) pieces.push(piece(q.id, q.name, q.sew, q));
    notes.push(...built.notes, `Face: ${PLUSH_EYES[s.eyes]}`);
  } else {
    // one of the seven fixed body types: drafted with how it goes together (draftFixed), to the size asked for
    fixed = fixedPlush(s);
    pieces.push(...fixed.pieces); notes.push(...fixed.notes);
  }
  // the kit's parts on the body types that take them (PLUSH_PARTS)
  const takes = k => PLUSH_PARTS[k].includes(s.shape), top = s.shape === 'sea' ? 0 : 0;
  if (takes('horn') && s.horn === 'one') pieces.push(piece('horn', 'Horn', blob([[0, 0], [h * .05, h * .16], [-h * .05, h * .16]], .3).map(([x, y]) => [x, y - h * .16]), { cut: 1, fabric: 'contrast', notes: ['Rolled into a cone and stuffed firm; a spiral of stitching wound up it; sewn into the gusset seam at the brow'], place: { view: 'front', x: 0, y: top - h * .02, z: 7 } }));
  if (takes('horn') && s.horn === 'two') for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'horn' : 'horn-2', 'Horn', blob([[0, 0], [h * .04, h * .1], [-h * .03, h * .1]], .4).map(([x, y]) => [x, y - h * .1]), { cut: sg > 0 ? 4 : 0, pair: true, fabric: 'contrast', notes: sg > 0 ? ['Two pairs: sewn, turned, stuffed firm; set into the head side seams'] : [], place: { view: 'front', x: sg * h * .08, y: top, rot: sg * 15, flip: sg < 0, z: 7 }, hidden: sg < 0 }));
  if (takes('horn') && s.horn === 'antlers') for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'antler' : 'antler-2', 'Antler', blob([[0, 0], [h * .03, 0], [h * .04, -h * .1], [h * .1, -h * .14], [h * .09, -h * .17], [h * .03, -h * .13], [h * .01, -h * .22], [-h * .02, -h * .21], [-h * .01, -h * .1]], .3), { cut: sg > 0 ? 4 : 0, pair: true, fabric: 'contrast', notes: sg > 0 ? ['Two pairs, interfaced so they stand: sewn, turned, stuffed with a pipe-cleaner-free firm fill, set into the head side seams'] : [], place: { view: 'front', x: sg * h * .1, y: top, flip: sg < 0, z: 7 }, hidden: sg < 0 }));
  if (takes('mane') && s.mane !== 'none') pieces.push(piece('mane', 'Mane', rect(r8(s.mane === 'ruff' ? h * .9 : h * .55), r8(h * .14)), { cut: 1, fabric: 'contrast', notes: [s.mane === 'ruff' ? 'Long-pile faux fur, the pile running away from the face: folded in half along its length and sewn into the seam round the face; brushed out after turning' : 'Long-pile faux fur (or yarn loops), folded in half along its length and sewn into the gusset seam from between the ears down the back of the neck; brushed out after turning'], place: { view: 'back', x: -h * .35, y: h * .05, z: 0 } }));
  if (takes('wings') && s.wings) for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'wing' : 'wing-2', 'Wing', blob([[0, 0], [h * .22, -h * .1], [h * .3, h * .02], [h * .22, h * .1], [h * .12, h * .12], [h * .04, h * .1]], .6), { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two in self, two lined in contrast: sewn, turned, the feathers topstitched; interfaced so they stand; sewn to the back by hand'] : [], place: { view: 'back', x: sg * h * .12 + (sg < 0 ? -h * .3 : 0), y: h * .48, flip: sg < 0, z: 3 }, hidden: sg < 0 }));
  if (takes('spikes') && s.spikes) pieces.push(piece('spikes', 'Spikes', [[0, 0], ...Array.from({ length: 7 }, (_, i) => [[(i + .5) * h * .1, -h * .07], [(i + 1) * h * .1, 0]]).flat(), [h * .7, h * .03], [0, h * .03]], { cut: 2, fabric: 'contrast', notes: ['Sewn, turned and stuffed lightly, then set into the back seam (or the top of the gusset) from the head to the tail'], place: { view: 'back', x: -h * .35, y: h * .1, z: 4 } }));
  const firm = PLUSH_FIRM.includes(s.fabric);
  for (const q of pieces) if (q.fabric === 'self') q.fabric = firm ? 'leather' : 'pile';
  notes.push(...(firm ? [`${PLUSH_FABRICS[s.fabric]}: it does not stretch, so the pieces are eased and the curves notched; cut each piece from sound skin, the grain running down the toy`, '⅜ in seam allowance, sewn at 8–9 stitches an inch with a leather needle and bonded nylon thread; seams pressed open with a roller, not an iron', 'Stuffed firm and slowly: leather shows every lump']
    : [`${PLUSH_FABRICS[s.fabric]}: the pile runs down the grain arrow`, '¼ in seam allowance, sewn at 10–12 stitches an inch, backstitched at the opening']));
  return { kind: 'plush', spec: s, label: s.animal && !PLUSH_TYPE[s.shape].toLowerCase().startsWith(s.animal) ? `${s.animal[0].toUpperCase()}${s.animal.slice(1)} · ${PLUSH_TYPE[s.shape].toLowerCase()} body` : PLUSH_TYPE[s.shape], size: s.shape === 'sea' || built?.horizontal ? `${s.height} in long` : `${s.height} in tall`, sa: firm ? .375 : .25, pieces, notes, checks: plushChecks(s, pieces), ...(built ? { build: { joints: built.joints, views: built.views, lines: built.lines, face: built.face, opening: built.opening, horizontal: built.horizontal, parts: built.build } }
      // a fixed body type: how it goes together (every seam as its two runs, every edge finished on its own, the stuffing opening), and the pieces the seams are walked on
      : { assembly: fixed.asm, shell: Object.fromEntries(pieces.filter(q => q.at && q.cut).map(q => [q.id, q])) }), trims: plushTrims(s, pieces) };
}
// what a plush is made with besides its cloth: its fill, thread, eyes and nose, the sewn-in law label, and what its parts call for (a pouch
// of pellets on a bean's base, yarn for a tufted tail, interfacing behind what has to stand)
function plushTrims(s, pieces) {
  const g = fillGrams({ kind: 'plush', spec: s, pieces }), fixed = s.shape !== 'build', out = [{ item: 'Polyester fibre fill', spec: 'Siliconised hollow fibre, 7 denier, to EN 71-2 / ASTM F963', qty: `about ${g} g`, where: 'Stuffed through the opening' },
    { item: 'Thread', spec: 'Tex 40 core-spun polyester; Tex 70 bonded nylon for closing by hand', qty: `about ${Math.max(20, Math.round(pieces.reduce((a, q) => a + (q.cut || 0) * lenOf([...q.sew, q.sew[0]]), 0) * .0254 * 3 / 10) * 10)} m`, where: 'Throughout' },
    { item: 'Law label', spec: 'Printed satin: the fill content, the registration number, the age it is for', qty: 1, where: 'Sewn into a side or bottom seam' },
    s.eyes === 'safety' ? { item: 'Safety eyes', spec: '12 mm, with locking washers', qty: '1 pair', where: 'Set before the face is closed' } : { item: 'Embroidery floss', spec: s.eyes === 'felt' ? 'Felt circles for the eyes, appliquéd; 6-strand floss for the nose and mouth' : '6-strand cotton floss for the eyes, the nose and the mouth', qty: '1 skein', where: 'The face' }];
  if (pieces.some(q => q.id === 'curly-tail' || /pipe cleaner/.test((q.notes || []).join(' ')))) out.push({ item: 'Pipe cleaner', spec: 'Chenille stem, the ends turned in (3 years and up only)', qty: 1, where: 'In the curly tail' });
  if (pieces.some(q => /antenna/.test(q.id))) out.push({ item: 'Cord', spec: '3 mm cotton cord', qty: '2 × 6 in', where: 'Inside the antennae' });
  if (fixed) { const said = re => pieces.some(q => q.cut && (q.notes || []).some(n => re.test(n)));
    if (s.eyes === 'safety' && said(/embroidered/i)) out.push({ item: 'Embroidery floss', spec: '6-strand cotton floss for the nose and the mouth', qty: '1 skein', where: 'The face' });
    if (said(/pouch of polypellets/i)) out.push({ item: 'Polypellets', spec: 'PE pellets, 3 mm (3 years and up only)', qty: `about ${Math.max(20, Math.round(g * .25 / 5) * 5)} g`, where: 'In their pouch, on the base' }, { item: 'Pellet pouch', spec: 'Non-woven inner bag, double-stitched shut', qty: 1, where: 'Holds the pellets; tacked to the base inside' });
    if (said(/tuft is yarn/i)) out.push({ item: 'Yarn', spec: 'Acrylic or wool, in the body\'s colour', qty: '1 yd', where: 'The tail\'s tuft, knotted into its tip' });
    if (s.shape === 'elephant' || said(/interfaced/i)) out.push({ item: 'Interfacing', spec: 'Fusible non-woven, medium weight', qty: s.shape === 'elephant' ? '2 pieces, cut as the ear' : 'Cut as the pieces it backs', where: [s.shape === 'elephant' && 'The ear backs', said(/interfaced/i) && 'The antlers or the wings'].filter(Boolean).join('; ') }); }
  return out;
}
// the safety a plush is tested against (ASTM F963 and EN 71): what the choices mean for the age it is for
export function plushChecks(s, pieces = []) {
  const out = [], under3 = s.age === '0+';
  if (under3 && s.eyes === 'safety') out.push({ level: 'fail', msg: 'Safety eyes are a small part for under-3s: embroider the eyes (and the nose), or mark it 3 years and up.' });
  if (under3) out.push({ level: 'info', msg: 'Under 3: every part passes the small-parts cylinder (1¼ in), seams take a 15 lbf pull, nothing comes off in the torque and tension tests (ASTM F963 / EN 71-1).' });
  if (under3 && pieces.some(q => /tail/.test(q.id))) out.push({ level: 'warn', msg: 'The tail is small: sew it into a seam, not on by hand, so it passes the tension test.' });
  if (PLUSH_FIRM.includes(s.fabric) && under3) out.push({ level: 'warn', msg: 'Leather on a toy for under-3s: check it is chrome-free and passes the restricted-substances tests (azo dyes, chromium VI); most baby toys are made in pile instead.' });
  if (s.fabric === 'fur') out.push({ level: 'warn', msg: 'Long-pile fur sheds at the seams: brush the pile out of every seam after turning, and test for fibre loss.' });
  if (s.height < 6 && under3) out.push({ level: 'warn', msg: `At ${s.height} in, check the whole toy is not itself a choking hazard for under-3s.` });
  out.push({ level: 'info', msg: 'A sewn-in law label in a side seam (fill content and registration numbers for the states that ask), a CPSIA tracking label, and the age grading on the hang tag.' });
  return out;
}

// how much a plush takes to fill: its volume as a solid of its front outline, about two thirds of the bounding depth, at toy-firm fill
export function fillGrams(pat) {
  if (pat.kind !== 'plush') return 0; const front = pat.pieces.filter(q => !q.hidden && q.place.view === 'front' && q.cut > 0);
  // a sea creature's two body sides are the two faces of one body (counted once), as deep as its belly gusset is wide
  const sea = pat.spec.shape === 'sea', belly = sea && pat.pieces.find(q => q.id === 'belly');
  const area = front.reduce((s, q) => s + areaOf(q.sew) * (q.pair && !q.fold && !(sea && q.id === 'body-side') ? 2 : 1), 0) * .78, depth = pat.spec.shape === 'pillow' ? pat.spec.depth : belly ? boundsOf(belly.sew).w : pat.spec.height * .42;
  return Math.round(area * depth * .66 * .55); // ~0.55 g a cubic inch, firmly stuffed polyester fibre
}

// ---- the views ----
// where a piece sits on the product (its own coordinates turned and moved onto the front or back view)
export function placed(q, pts = q.shown || q.sew) { const pl = q.place || {}, a = (pl.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => { const xx = pl.flip ? -x : x; return [pl.x + xx * c - y * s, pl.y + xx * s + y * c]; }); }
// the cutting layout, a marker: every cut each piece takes (pairs: the second turned over), by cloth, laid at the cloth's width with its grain
// along the selvedge. Each piece is dropped, as on a cutting table, to the lowest place it fits by its outline (not its box), the right way up
// or turned end to end, so a leg's crotch sits beside the next leg's hem; the order and the rule that pack shortest are kept.
// → [{ fabric, name, width, length, yards, efficiency, items: [{ piece, n, flip, turn, b, x, y, at(pts) }] }]
// it.at(pts) puts a piece's own points where it lies on the cloth (b: its cut outline's box as drafted; x, y: kept for older readers)
export function layoutOf(pat, { width = 58, widths = {}, sa = pat.sa, gap = .4, res = .25 } = {}) { // `widths`: a cloth's own width, by the cloth (from the material on its part)
  const groups = new Map();
  for (const q of pat.pieces) { if (!q.cut) continue; // every piece cut, shown on the product or not (an ear lining, a pad under the foot)
    const cutl = offsetOf(q.sew, q.sa ?? sa), b = boundsOf(cutl); const g = groups.get(q.fabric) || []; for (let n = 0; n < q.cut; n++) g.push({ piece: q, n, flip: q.pair && n % 2 === 1, b, cutl, area: areaOf(cutl) }); groups.set(q.fabric, g); }
  // a piece's place: turned over (flip, about its box's middle), turned end to end (turn), then moved so its box's corner is at (ox, oy)
  const placer = (b, flip, turn, ox, oy) => pts => pts.map(([x, y]) => { let u = flip ? b.x1 - x : x - b.x0, v = y - b.y0; if (turn) { u = b.w - u; v = b.h - v; } return [ox + u, oy + v]; });
  // the columns an outline fills, as it lies: for each column (res wide) its top and bottom, a half gap round it
  const profile = pts => { const B = boundsOf(pts), nc = Math.max(1, Math.ceil((B.w + gap) / res)), top = new Float64Array(nc).fill(Infinity), bot = new Float64Array(nc).fill(-Infinity);
    const hit = (c, y) => { if (c >= 0 && c < nc) { if (y < top[c]) top[c] = y; if (y > bot[c]) bot[c] = y; } };
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x1, y2 - y1), k = Math.max(1, Math.ceil(L / (res / 2)));
      for (let t = 0; t <= k; t++) { const x = x1 + (x2 - x1) * t / k - B.x0 + gap / 2, y = y1 + (y2 - y1) * t / k - B.y0; hit(Math.floor(x / res), y); hit(Math.floor((x - gap / 2) / res), y); hit(Math.floor((x + gap / 2 - 1e-9) / res), y); } }
    for (let c = 0; c < nc; c++) if (top[c] === Infinity) { top[c] = 0; bot[c] = B.h; } // (an outline crosses every column it spans, top and bottom; a miss is taken as full)
    return { nc, top: top.map(v => v - gap / 2), bot: bot.map(v => v + gap / 2), h: B.h };
  };
  const out = [];
  for (const [fabric, items] of groups) {
    const W = Math.max(Number(widths[fabric]) > 10 ? Number(widths[fabric]) : width, ...items.map(i => i.b.w + gap * 2)), N = Math.floor(W / res);
    for (const it of items) it.forms = [false, true].map(turn => ({ turn, ...profile(placer(it.b, it.flip, turn, 0, 0)(it.cutl)) }));
    const pack = (order, rule) => { const S = new Float64Array(N), at = [];
      for (const it of order) { let best = null;
        for (const f of it.forms) for (let x = 0; x + f.nc <= Math.max(N, f.nc); x++) { let y = 0; for (let c = 0; c < f.nc; c++) { const v = (S[x + c] || 0) - f.top[c]; if (v > y) y = v; }
          const s = rule ? y + f.h : y; if (!best || s < best.s - 1e-9) best = { s, x, y, f }; }
        for (let c = 0; c < best.f.nc; c++) if (x0ok(best.x + c)) S[best.x + c] = Math.max(S[best.x + c], best.y + best.f.bot[c]);
        at.push({ it, x: best.x * res, y: best.y, turn: best.f.turn }); }
      return { at, length: Math.max(0, ...at.map(a => a.y + a.it.b.h)) };
      function x0ok(c) { return c >= 0 && c < N; } };
    const byArea = items.slice().sort((a, b) => b.area - a.area), byHeight = items.slice().sort((a, b) => b.b.h - a.b.h);
    // rows across the cloth, by the pieces' boxes (now and then the shortest, for a cloth of many small pieces)
    const rows = () => { let x = 0, y = 0, rowH = 0; const at = []; for (const it of byHeight) { if (x + it.b.w > W) { x = 0; y += rowH + gap; rowH = 0; } at.push({ it, x, y, turn: false }); x += it.b.w + gap; rowH = Math.max(rowH, it.b.h); } return { at, length: y + rowH }; };
    let best = rows(); for (const o of [byArea, byHeight]) for (const r of [0, 1]) { const p = pack(o, r); if (p.length < best.length - 1e-6) best = p; }
    const placedItems = items.map(it => { const a = best.at.find(z => z.it === it), at = placer(it.b, it.flip, a.turn, a.x, a.y);
      return { piece: it.piece, n: it.n, flip: it.flip, turn: a.turn, b: it.b, x: a.x - it.b.x0, y: a.y - it.b.y0, at }; });
    const length = best.length, used = items.reduce((s, it) => s + it.area, 0);
    out.push({ fabric, name: fabricName(fabric), width: W, length: r8(length), yards: Math.round(length / 36 * 100) / 100, efficiency: Math.round(used / (W * Math.max(length, 1)) * 100), items: placedItems });
  }
  return out;
}
// a closed outline as n points evenly spaced along it, so two outlines of a piece (as it sits on the product, as it is cut) can be blended
export function resample(pts, n = 64) {
  const ring = [...pts, pts[0]], seg = ring.slice(1).map((q, i) => Math.hypot(q[0] - ring[i][0], q[1] - ring[i][1])), total = seg.reduce((a, b) => a + b, 0) || 1, out = [];
  let i = 0, acc = 0; for (let k = 0; k < n; k++) { const d = total * k / n; while (i < seg.length - 1 && acc + seg[i] < d) { acc += seg[i]; i++; } const t = seg[i] ? (d - acc) / seg[i] : 0; out.push([ring[i][0] + (ring[i + 1][0] - ring[i][0]) * t, ring[i][1] + (ring[i + 1][1] - ring[i][1]) * t]); }
  return out;
}
// the product as its pieces: the front view, and the back view beside it; → { pieces: [{piece, pts}], bounds, backDx }
// a pair of trousers or shorts against its sketch: the pattern's front as it is put together (each leg laid flat, the legs meeting at the
// centre), measured where the sketch is: the hip across, each leg at the thigh, the knee and the hem. The legs' shape is the design, so a leg
// whose knee or hem, against its thigh, is more than about a seventh off the sketch's is flagged; the hip is said, not flagged (a sketch is drawn slimmer at the hip than a body is, and
// the pattern keeps the hip measurement). → { rows: [{ key, label, drawn, pattern, off }], legsOff, hipNote } or null
export function drawnCheck(p, pat, size = p.size || 'M') {
  const S = STYLES[p.style]; if (!S || S.kind !== 'bottom' || S.skirt || !pat) return null;
  const L = drawnLegs(p, size); if (!L) return null; const m = measurementsFor(p, size), wb = m.waistband || 1.5, A = assembled(pat);
  const legs = A.pieces.filter(x => /^(front|front-2|side-panel(-2)?)$/.test(x.piece.id)); // a contrast side panel is part of the leg's width
  const spans = (poly, y) => { const xs = []; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } xs.sort((a, b) => a - b); const o = []; for (let i = 0; i + 1 < xs.length; i += 2) o.push([xs[i], xs[i + 1]]); return o; };
  // the spans at a height, those that touch (a leg and its side panel) joined into one
  const joined = y => { const sp = legs.flatMap(x => spans(x.pts, y)).sort((a, b) => a[0] - b[0]), out = []; for (const q of sp) { const l = out[out.length - 1]; if (l && q[0] <= l[1] + .3) l[1] = Math.max(l[1], q[1]); else out.push([...q]); } return out; };
  const leg = y => { const q = joined(y).filter(q => q[0] < 0)[0]; return q ? r8(Math.min(q[1], 0) - q[0]) : null; };
  const across = y => { const sp = legs.flatMap(x => spans(x.pts, y)); return sp.length ? r8(Math.max(...sp.map(q => q[1])) - Math.min(...sp.map(q => q[0]))) : null; };
  // the heights on the pattern itself (the rise and the inseam are drafted along their seams, so the crotch and the hem sit a little higher than
  // the measurements laid straight down would put them)
  const lp = legs.flatMap(x => x.pts.map(q => q[1])), top = Math.min(...lp), H = Math.max(...lp), cr = pat.block?.front?.at?.crotch, cY = cr ? top + cr[1] : m.rise;
  const rows = [['hip', 'Hip, across', L.hip, across(wb + Math.min(7.5, (m.rise - wb) * .7))], ['thigh', 'Thigh, one leg', L.thigh, leg(cY + 1.5)], ...(L.knee ? [['knee', 'Knee, one leg', L.knee, leg(cY + (H - cY) * .48)]] : []), ['hem', 'Hem, one leg', L.hem, leg(H - 2)]]
    .filter(r => r[3] != null).map(([key, label, drawn, pattern]) => ({ key, label, drawn, pattern }));
  // the knee and the hem against the thigh, as the sketch has them: the widths themselves follow the hip measurement, the proportions the sketch
  const th = rows.find(r => r.key === 'thigh'); for (const r of rows) r.off = Boolean(th && (r.key === 'knee' || r.key === 'hem') && Math.abs(r.pattern / th.pattern - r.drawn / th.drawn) / (r.drawn / th.drawn) > .15);
  // the shape: does the leg run as the sketch's does, from the thigh to the hem (straight, tapered, widening)?
  const shape = (a, b) => (b && a ? b / a : null), dS = shape(L.thigh, L.hem), pS = shape(rows.find(r => r.key === 'thigh')?.pattern, rows.find(r => r.key === 'hem')?.pattern);
  const shapeOff = dS && pS && Math.abs(pS - dS) / dS > .15, hip = rows.find(r => r.key === 'hip');
  const shapeGap = dS && pS ? Math.abs(pS - dS) / dS : 0;
  return { rows, legsOff: shapeOff || rows.some(r => r.off), legsNear: !shapeOff && shapeGap > .05, shape: { drawn: dS && Math.round(dS * 100) / 100, pattern: pS && Math.round(pS * 100) / 100 }, legsDrawn: Boolean(p.options?.legsDrawn),
    hipNote: hip && Math.abs(hip.pattern - hip.drawn) / hip.drawn > .08 ? (hip.drawn < hip.pattern ? `The sketch is drawn slimmer at the hip (${hip.drawn} in) than the hip measurement makes it (${hip.pattern} in across the front): the pattern keeps the measurement.` : `The sketch is drawn fuller at the hip (${hip.drawn} in) than the hip measurement (${hip.pattern} in): raise the hip on the flats if it is meant to be.`) : '' };
}
// Follow the drawing: the legs' opening and knee from the sketch, then trued on the pattern itself (the first reading assumes the pattern's
// thigh; the drafted leg is measured and its opening scaled until the hem stands to the thigh as the sketch's does, within about 2%)
export function followTheDrawing(p, size = 'M') {
  let q = followDrawing(p); if (q === p) return p;
  for (let i = 0; i < 4; i++) {
    const c = drawnCheck(q, garmentPattern(q, size), size); if (!c?.shape?.drawn || !c.shape.pattern) break;
    const k = c.shape.drawn / c.shape.pattern; if (Math.abs(k - 1) < .02) break;
    q = { ...q, m: { ...q.m, legOpening: Math.round(Math.min(Math.max(q.m.legOpening * k, 4.5), 18) * 8) / 8 } };
  }
  return q;
}
export function assembled(pat) {
  const vis = pat.pieces, fb = boundsOf(vis.filter(q => q.place.view !== 'back').flatMap(q => placed(q))), bb = boundsOf(vis.filter(q => q.place.view === 'back').flatMap(q => placed(q)));
  const backDx = Number.isFinite(bb.x0) ? fb.x1 - bb.x0 + 5 : 0;
  const pieces = vis.map(q => ({ piece: q, pts: placed(q).map(([x, y]) => [x + (q.place.view === 'back' ? backDx : 0), y]) }));
  return { pieces, bounds: boundsOf(pieces.flatMap(x => x.pts)), backDx };
}
// the exploded view, t from 0 (the product) to 1 (the cutting layout): first the pieces lift off and spread out from the middle of their own
// view (to t = .45), then each flies flat to its place in the layout, beside the product → [{ piece, pts, n, of, layer }]
// Every cut the pattern takes is in it, at every t: a piece cut 4 (two pairs: inner and outer) is four outlines, the ones the product does
// not show (the inner pair, a lining under its face) lifting off from under the one that does, stacked a little behind it, so what is spread
// out is exactly what is cut; a piece that is not cut (a moulded sole) lifts off and stays by the product.
export function explodeAt(pat, t, layout = layoutOf(pat)) {
  const A = assembled(pat), B = A.bounds, spread = Math.min(Math.max(t, 0) / .45, 1), fly = Math.min(Math.max((t - .45) / .55, 0), 1), e = fly * fly * (3 - 2 * fly);
  const centre = view => { const ps = A.pieces.filter(x => (x.piece.place.view === 'back') === (view === 'back')).flatMap(x => x.pts), b = boundsOf(ps); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
  const C = { front: centre('front'), back: centre('back') }, goff = new Map(); let yo = B.y0; for (const g of layout) { goff.set(g, yo); yo += g.length + 3; }
  const lx = B.x1 + 6, base = q => q.twin ? q.of || q.id.replace(/-2$/, '') : q.id, onProduct = new Map();
  // the outlines on the product a piece is cut for: itself, then its twin (the other side)
  for (const x of A.pieces) { if (x.piece.copy) continue; const l = onProduct.get(base(x.piece)) || []; if (x.piece.twin) l.push(x); else l.unshift(x); onProduct.set(base(x.piece), l); }
  const lift = (q, pts, layer, spread) => { const pb = boundsOf(pts), c = C[q.place.view === 'back' ? 'back' : 'front'], dx = (pb.x0 + pb.x1) / 2 - c[0], dy = (pb.y0 + pb.y1) / 2 - c[1], d = Math.hypot(dx, dy) || 1;
    // spread from the middle in proportion (the further out, the further it goes), so pieces that overlap on the product come apart; a layer
    // under the outer one (the inner pair) comes off beside it, outward, so each cut reads as its own piece
    const push = (2.5 + Math.abs(q.place.z || 0) * .8 + d * .45) * spread, sx = layer * (pb.x1 - pb.x0 + .6) * (dx < 0 ? -1 : 1) * spread, sy = layer * .4 * spread;
    return pts.map(([x, y]) => [x + dx / d * push + sx, y + dy / d * push + sy]); };
  // every cut: where it comes from on the product, and where it lands in the layout
  const list = [], used = new Set();
  for (const g of layout) for (const it of g.items) {
    // a piece under another on the product (an ear's lining under its back) comes off one layer further out than what it is under
    const q = it.piece, srcs = onProduct.get(q.id) || [], src = srcs.length ? srcs[it.n % srcs.length] : null, layer = (srcs.length ? Math.floor(it.n / srcs.length) : 0) + (q.hidden && !q.twin ? 1 : 0);
    if (src) used.add(src);
    list.push({ q, src, layer, n: it.n, tgt: it.at(q.sew).map(([x, y]) => [x + lx, y + goff.get(g)]) });
  }
  // what is on the product but not cut (moulded parts) lifts off and stays
  for (const x of A.pieces) if (!x.piece.copy && !used.has(x) && !(x.piece.twin && (onProduct.get(base(x.piece)) || []).some(y => used.has(y)))) list.push({ q: x.piece, src: x, layer: 0, n: 0, tgt: null, uncut: true });
  // a piece seen again on the back view (a sleeve, the hem band) is on the product until the pieces lift apart; it is not cut again
  if (t < .3) for (const x of A.pieces) if (x.piece.copy) list.push({ q: x.piece, src: x, layer: 0, n: 0, tgt: null, uncut: true, copy: true });
  // spread all the way, no two pieces may cover each other (on one view, or one view's against the other's beside it): they are nudged apart (their boxes, a little margin between) and the nudge grows
  // with the spread, so the product comes apart smoothly into pieces that can each be seen
  const full = list.map(x => x.src && !x.copy ? boundsOf(lift(x.src.piece, x.src.pts, x.layer, 1)) : null), off = list.map(() => [0, 0]);
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = full[i], b = full[j]; if (!a || !b) continue;
      const m = .35, ox = Math.min(a.x1 + off[i][0], b.x1 + off[j][0]) - Math.max(a.x0 + off[i][0], b.x0 + off[j][0]) + m, oy = Math.min(a.y1 + off[i][1], b.y1 + off[j][1]) - Math.max(a.y0 + off[i][1], b.y0 + off[j][1]) + m;
      if (ox <= 0 || oy <= 0) continue; moved = true;
      const ca = [(a.x0 + a.x1) / 2 + off[i][0], (a.y0 + a.y1) / 2 + off[i][1]], cb = [(b.x0 + b.x1) / 2 + off[j][0], (b.y0 + b.y1) / 2 + off[j][1]];
      if (ox < oy) { const sg = ca[0] < cb[0] || (ca[0] === cb[0] && i < j) ? -1 : 1; off[i][0] += sg * ox / 2; off[j][0] -= sg * ox / 2; }
      else { const sg = ca[1] < cb[1] || (ca[1] === cb[1] && i < j) ? -1 : 1; off[i][1] += sg * oy / 2; off[j][1] -= sg * oy / 2; }
    }
    if (!moved) break;
  }
  const out = list.map((x, k) => {
    let from = x.src ? lift(x.src.piece, x.src.pts, x.layer, spread).map(([px, py]) => [px + off[k][0] * spread, py + off[k][1] * spread]) : x.tgt, tgt = x.tgt;
    if (x.uncut || e === 0) return { piece: x.q, pts: from, n: x.n, of: x.q.cut || 0, layer: x.layer, cut: !x.uncut };
    if (tgt.length !== from.length) { from = resample(from); tgt = resample(tgt); }
    return { piece: x.q, pts: from.map((m, i) => [m[0] * (1 - e) + tgt[i][0] * e, m[1] * (1 - e) + tgt[i][1] * e]), n: x.n, of: x.q.cut, layer: x.layer, cut: true };
  });
  return out;
}
// ---- the files ----
// SVG of the pieces, laid out flat at real size (1 in = 1 in when printed at 100%): sew line, cutting line, grain, notches, name and cut
export function patternSvg(pat, { width = 58, title = '' } = {}) {
  const lay = layoutOf(pat, { width }), sa = pat.sa; let y0 = 1.5, body = '';
  const P = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L') + ' Z', esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  for (const g of lay) {
    body += `<text x="0" y="${r3(y0 - .4)}" font-size=".45" font-family="Helvetica,Arial,sans-serif" font-weight="700">${esc(g.name)} · ${g.width} in wide · ${g.length} in long (${g.yards} yd) · ${g.efficiency}% used</text><rect x="0" y="${r3(y0)}" width="${g.width}" height="${r3(g.length)}" fill="none" stroke="#bbb" stroke-width=".02" stroke-dasharray=".2 .2"/>`;
    for (const it of g.items) {
      const q = it.piece, tf = pts => it.at(pts).map(([x, y]) => [x, y + y0]);
      const sew = tf(q.sew), cutl = tf(offsetOf(q.sew, q.sa ?? sa)), gr = tf(q.grain), bb = boundsOf(sew), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      body += `<path d="${P(cutl)}" fill="#fff" stroke="#141416" stroke-width=".03"/><path d="${P(sew)}" fill="none" stroke="#141416" stroke-width=".02" stroke-dasharray=".18 .1"/>`;
      body += `<path d="M${r3(gr[0][0])} ${r3(gr[0][1])} L${r3(gr[1][0])} ${r3(gr[1][1])}" stroke="#17603a" stroke-width=".03" marker-start="url(#ga)" marker-end="url(#ga)"/>`;
      for (const n of tf(q.notches)) body += `<circle cx="${r3(n[0])}" cy="${r3(n[1])}" r=".09" fill="#141416"/>`;
      if (q.fold) body += `<path d="M${r3(tf([[0, 0]])[0][0])} ${r3(bb.y0)} L${r3(tf([[0, 0]])[0][0])} ${r3(bb.y1)}" stroke="#c8202a" stroke-width=".03" stroke-dasharray=".3 .15"/>`;
      const fs = Math.min(.42, Math.max(.2, bb.w / 14));
      body += `<text x="${r3(cx)}" y="${r3(cy)}" text-anchor="middle" font-size="${r3(fs)}" font-family="Helvetica,Arial,sans-serif" font-weight="700">${esc(q.name)}</text><text x="${r3(cx)}" y="${r3(cy + fs * 1.2)}" text-anchor="middle" font-size="${r3(fs * .78)}" font-family="Helvetica,Arial,sans-serif">${esc(cutWords(q))} · ${esc(fabricName(q.fabric))} · ${esc(pat.size)}</text>`;
    }
    y0 += g.length + 2.5;
  }
  const W = Math.max(...lay.map(g => g.width), 20) + .5, H = y0;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}in" height="${r3(H)}in" viewBox="-.25 0 ${r3(W)} ${r3(H)}"><title>${esc(title || pat.label)} · pattern · ${esc(pat.size)}</title><defs><marker id="ga" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#17603a"/></marker></defs>${body}</svg>\n`;
}
// DXF (R12, inches): one set of polylines a cut, on layers a pattern system reads: CUT (the cutting line), SEW (the sew line), GRAIN, NOTCH,
// TEXT. Written whole (src/lab-dxf.js), so strict readers open it too.
export function patternDxf(pat, { width = 58 } = {}) {
  const lay = layoutOf(pat, { width }), d = dxfR12(), up = pts => pts.map(([x, y]) => [x, -y]);
  for (const [l, c] of [['CUT', 7], ['SEW', 8], ['GRAIN', 3], ['NOTCH', 1], ['TEXT', 5]]) d.layer(l, c);
  let y0 = 0;
  for (const g of lay) {
    for (const it of g.items) {
      const q = it.piece, tf = pts => it.at(pts).map(([x, y]) => [x, y + y0]);
      d.poly(d.ents, up(tf(offsetOf(q.sew, q.sa ?? pat.sa))), 'CUT'); d.poly(d.ents, up(tf(q.sew)), 'SEW'); d.poly(d.ents, up(tf(q.grain)), 'GRAIN', false);
      for (const [x, y] of tf(q.notches)) d.poly(d.ents, [[x - .09, -y], [x + .09, -y]], 'NOTCH', false);
      // the name, then how many and from what, inside the piece and sized to it, so neighbours' labels never run into each other
      const bb = boundsOf(tf(q.sew)), w = bb.x1 - bb.x0, cx = bb.x0 + w * .1, cy = (bb.y0 + bb.y1) / 2, l2 = `${cutWords(q)} - ${fabricName(q.fabric)} - ${pat.size}`;
      const h1 = Math.max(.08, Math.min(.25, w * .8 / (String(q.name).length * .7 || 1))), h2 = Math.max(.06, Math.min(.16, w * .8 / (l2.length * .7)));
      d.text(d.ents, cx, -cy, q.name, h1, 'TEXT'); d.text(d.ents, cx, -(cy + h1 * 1.6), l2, h2, 'TEXT');
    }
    y0 += g.length + 3;
  }
  return d.toString({ units: 'in' });
}


// ---- editing: a pattern engineer's changes, kept as overrides on the drafted pattern ----
// edits = { size, pieces: { [id]: { sew, notches, sa?, grain?, name?, cut?, fabric?, box: [x0, y0, w, h] } }, added: [piece-like], removed: [ids] }
// An edited piece keeps its outline at the size it was edited in; in another size of the run it is moved and scaled with the drafted
// piece (its box to the drafted piece's box): proportional grading, until grade rules are set point by point.
const fin = v => Number.isFinite(Number(v)), num3 = v => r3(Math.min(Math.max(Number(v), -400), 400));
const cleanPts = (a, n) => Array.isArray(a) ? a.slice(0, n).filter(q => Array.isArray(q) && fin(q[0]) && fin(q[1])).map(q => [num3(q[0]), num3(q[1])]) : [];
const SAS = [0, .125, .25, .375, .5, .625, .75, 1];
function cleanEditPiece(e = {}, id = '') {
  const sew = cleanPts(e.sew, 600); if (sew.length < 3) return null;
  const box = Array.isArray(e.box) && e.box.length === 4 && e.box.every(fin) && e.box[2] > 0 && e.box[3] > 0 ? e.box.map(num3) : (b => [b.x0, b.y0, b.w || 1, b.h || 1].map(num3))(boundsOf(sew));
  const out = { sew, notches: cleanPts(e.notches, 80), box };
  if (SAS.includes(Number(e.sa))) out.sa = Number(e.sa);
  if (fin(e.grain)) out.grain = Math.round(((Number(e.grain) % 360) + 360) % 360);
  if (e.name) out.name = String(e.name).replace(/\s+/g, ' ').trim().slice(0, 60);
  if (fin(e.cut)) out.cut = Math.min(Math.max(Math.round(Number(e.cut)), 0), 24);
  if (e.fabric && FABRIC_NAMES[e.fabric]) out.fabric = e.fabric;
  if (e.pair != null) out.pair = Boolean(e.pair);
  if (id) out.id = id;
  return out;
}
export function cleanPatternEdits(input) {
  if (!input || typeof input !== 'object') return null;
  const pieces = {}; for (const [id, e] of Object.entries(input.pieces || {}).slice(0, 80)) { if (!/^[a-z0-9-]{1,40}$/.test(id)) continue; const c = cleanEditPiece(e); if (c) pieces[id] = c; }
  const added = (Array.isArray(input.added) ? input.added : []).slice(0, 30).map((e, i) => cleanEditPiece(e, /^x[a-z0-9-]{1,30}$/.test(String(e?.id || '')) ? e.id : `x${i + 1}`)).filter(Boolean).map(e => ({ ...e, name: e.name || 'New piece', cut: e.cut ?? 1 }));
  const removed = (Array.isArray(input.removed) ? input.removed : []).filter(id => /^[a-z0-9-]{1,40}$/.test(String(id))).slice(0, 80);
  if (!Object.keys(pieces).length && !added.length && !removed.length) return null;
  return { size: String(input.size ?? '').slice(0, 12), pieces, added, removed };
}
// a point of an edit, carried from the box it was made in to the drafted piece's box now
const same = (from, to) => Math.abs(from[0] - to.x0) < .002 && Math.abs(from[1] - to.y0) < .002 && Math.abs(from[2] - to.w) < .002 && Math.abs(from[3] - to.h) < .002;
const carry = (from, to) => same(from, to) ? q => q.slice() : from[2] && from[3] ? ([x, y]) => [r3(to.x0 + (x - from[0]) * (to.w / from[2])), r3(to.y0 + (y - from[1]) * (to.h / from[3]))] : q => q;
const grainAt = (sew, deg) => { const b = boundsOf(sew), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, a = deg * Math.PI / 180, L = Math.max(b.h, b.w) * .3, dx = Math.sin(a) * L, dy = Math.cos(a) * L; return [[r3(cx - dx), r3(cy - dy)], [r3(cx + dx), r3(cy + dy)]]; };
export function applyEdits(pat, edits) {
  const E = edits && typeof edits === 'object' ? edits : null; if (!pat || !E) return pat;
  const gone = new Set(E.removed || []), pieces = [];
  for (const q of pat.pieces) {
    const baseId = q.twin ? q.of || q.id.replace(/-2$/, '') : q.id; if (gone.has(baseId)) continue;
    const e = E.pieces?.[baseId]; if (!e) { pieces.push(q); continue; }
    const now = boundsOf(q.sew), mv = carry(e.box, now), sew = e.sew.map(mv);
    const next = { ...q, sew, notches: e.notches.map(mv), edited: true, ...(e.sa != null ? { sa: e.sa } : {}), ...(e.name ? { name: e.name } : {}), ...(e.fabric ? { fabric: e.fabric } : {}), ...(e.pair != null && !q.twin ? { pair: e.pair } : {}), ...(e.cut != null && !q.twin ? { cut: e.cut } : {}) };
    next.grain = e.grain != null ? grainAt(sew, e.grain) : q.grain.map(mv);
    pieces.push(next);
  }
  for (const e of E.added || []) pieces.push({ ...piece(e.id, e.name, e.sew, { cut: e.cut ?? 1, pair: Boolean(e.pair), fabric: e.fabric || 'self', notches: e.notches, sa: e.sa ?? null, place: { view: 'back', x: 0, y: -2, z: 9 }, grain: e.grain != null ? grainAt(e.sew, e.grain) : undefined }), added: true });
  return { ...pat, pieces, edited: true };
}
// an outline with fewer points where they add nothing (Douglas–Peucker, closed): what a pattern engineer edits, not every sampled point
export function simplifyClosed(pts, tol = .02) {
  if (pts.length < 8) return pts.map(q => q.slice());
  const dp = (a) => { if (a.length < 3) return a; const [p, q] = [a[0], a[a.length - 1]], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; let k = 0, m = 0;
    for (let i = 1; i < a.length - 1; i++) { const d = Math.abs(dy * a[i][0] - dx * a[i][1] + q[0] * p[1] - q[1] * p[0]) / L; if (d > m) { m = d; k = i; } }
    return m > tol ? [...dp(a.slice(0, k + 1)).slice(0, -1), ...dp(a.slice(k))] : [p, q]; };
  // split at the point furthest from the first, so the two halves are each an open run
  let far = 0, fd = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  return [...dp(pts.slice(0, far + 1)).slice(0, -1), ...dp([...pts.slice(far), pts[0]]).slice(0, -1)];
}
// the length of an outline's run from point i to point j, going forward round it (a seam, for walking it against its pair)
export function runLength(pts, i, j) { let L = 0, k = i; const n = pts.length; for (let s = 0; s < n && k !== j; s++) { const nx = (k + 1) % n; L += Math.hypot(pts[nx][0] - pts[k][0], pts[nx][1] - pts[k][1]); k = nx; } return r3(L); }

// ---- AAMA / ASTM DXF: what Gerber, Lectra, Optitex and the cutting rooms read ----
// one BLOCK a piece (and a size): the cut line on layer 1 with its turn points on 2, notches on 4, the grain on 7, the sew line on 14, and
// the piece's text (Piece Name, Quantity, Size, Material); the file's own text (Style Name, Sample Size, Units); every block INSERTed
// where it lies in the layout. Inches or millimetres.
export function patternDxfAama(pats, { width = 58, units = 'in', style = 'Style', author = 'Future Basics Design Lab' } = {}) {
  const list = Array.isArray(pats) ? pats : [pats], k = units === 'mm' ? 25.4 : 1, d = dxfR12(), B = d.blocks, E = d.ents;
  // the pattern's inches (y down) to the file's units (y up)
  const P = ([x, y]) => [x * k, -y * k], Ps = pts => pts.map(P);
  for (const l of ['1', '2', '3', '4', '7', '8', '14', '15']) d.layer(l, 7);
  const sizes = [...new Set(list.map(p => p.size))];
  d.text(E, ...P([0, -3]), `Style Name: ${style}`, .25 * k, '1'); d.text(E, ...P([0, -2.6]), `Sample Size: ${list[0]?.size ?? ''}`, .2 * k, '1'); d.text(E, ...P([0, -2.25]), `Units: ${units === 'mm' ? 'METRIC' : 'ENGLISH'}`, .2 * k, '1');
  d.text(E, ...P([0, -1.9]), `Size List: ${sizes.join(' ')}`, .2 * k, '1'); d.text(E, ...P([0, -1.55]), `Author: ${author}`, .2 * k, '1'); d.text(E, ...P([0, -1.2]), `Creation Date: ${new Date().toISOString().slice(0, 10)}`, .2 * k, '1');
  let y0 = 0, n = 0;
  for (const pat of list) {
    const lay = layoutOf(pat, { width }), gy = new Map(); let acc = 0; for (const g of lay) { gy.set(g, acc); acc += g.length + 3; } // each cloth's layout below the last
    for (const g of lay) for (const it of g.items) {
      if (it.n !== 0) continue; // one block a piece and a size; the quantity is in its text
      const q = it.piece, sa = q.sa ?? pat.sa, cutl = offsetOf(q.sew, sa), name = `${String(q.name).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 24)}_${String(pat.size).replace(/[^A-Za-z0-9.]+/g, '')}_${++n}`;
      d.begin(name);
      d.poly(B, Ps(cutl), '1'); for (const p of cutl) d.point(B, P(p), '2');
      d.poly(B, Ps(q.sew), '14'); d.line(B, P(q.grain[0]), P(q.grain[1]), '7');
      // a notch: a 1/4 in cut in from the cutting line, square to the edge, at the notch on the sew line
      for (const nt of q.notches) { let bi = 0, bd = Infinity; for (let i = 0; i < q.sew.length; i++) { const dd = Math.hypot(q.sew[i][0] - nt[0], q.sew[i][1] - nt[1]); if (dd < bd) { bd = dd; bi = i; } }
        const a = q.sew[(bi - 1 + q.sew.length) % q.sew.length], b = q.sew[(bi + 1) % q.sew.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
        d.line(B, P([nt[0] + nx * sa, nt[1] + ny * sa]), P([nt[0] + nx * (sa - .25), nt[1] + ny * (sa - .25)]), '4'); }
      const b = boundsOf(q.sew), cx = b.x0 + .2, cy = (b.y0 + b.y1) / 2;
      d.text(B, ...P([cx, cy - .45]), `Piece Name: ${q.name}`, .18 * k, '1'); d.text(B, ...P([cx, cy - .2]), `Quantity: ${q.cut}${q.pair ? ' (pairs)' : ''}`, .16 * k, '1'); d.text(B, ...P([cx, cy + .05]), `Size: ${pat.size}`, .16 * k, '1');
      d.text(B, ...P([cx, cy + .3]), `Material: ${fabricName(q.fabric).toUpperCase()}`, .16 * k, '1'); if (q.fold) d.text(B, ...P([cx, cy + .55]), 'Annotation: CUT ON FOLD', .14 * k, '15');
      d.end();
      // where the marker lays it: turned end to end, the block goes in turned 180° about its origin, at the point its origin lands
      const cb = boundsOf(cutl), [ix, iy] = P(it.at([[0, 0]])[0].map((v, j) => j ? v + y0 + gy.get(g) : v));
      d.insert(name, ix, iy, { x0: cb.x0 * k, x1: cb.x1 * k, y0: -cb.y1 * k, y1: -cb.y0 * k }, '1', it.turn && !it.flip ? 180 : 0);
    }
    y0 += lay.reduce((t, g) => t + g.length + 3, 0) + 4;
  }
  return d.toString({ units });
}

// what the pattern costs in cloth: yards of each fabric for one piece, from the layout
export const yardage = (pat, width = 58) => layoutOf(pat, { width }).map(g => ({ fabric: g.fabric, name: g.name, yards: g.yards, efficiency: g.efficiency }));
export { SIZES, piece, twin, cubic, tidy, blob, tail, mirrorX, lenOf };

// ---- freehand editing of a piece (the pattern page's editor) -------------------------------------------------------------------------------
// A stroke drawn by hand (a mouse, a finger, a Pencil) is tidied before it touches a piece: the hand's wobble taken out (points closer than the
// tolerance to the line through their neighbours go), one pass of corner rounding, and every point on the sixteenth of an inch.
const r16 = v => Math.round(v * 16) / 16;
function rdp(pts, tol) { if (pts.length < 3) return pts.slice(); const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; let k = 0, d = -1;
  for (let i = 1; i < pts.length - 1; i++) { const e = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (e > d) { d = e; k = i; } }
  return d > tol ? [...rdp(pts.slice(0, k + 1), tol).slice(0, -1), ...rdp(pts.slice(k), tol)] : [a, b]; }
export function cleanStroke(pts, { tol = .05, closed = false } = {}) {
  const P = (Array.isArray(pts) ? pts : []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 4000); if (P.length < 2) return [];
  let s = rdp(P, tol); if (s.length > 2) { const out = [s[0]]; for (let i = 0; i < s.length - 1; i++) { const [a, b] = [s[i], s[i + 1]]; if (i) out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]); if (i < s.length - 2) out.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } out.push(s[s.length - 1]); s = out; }
  s = s.map(([x, y]) => [r16(x), r16(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (closed && s.length > 2 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < .2) s.pop();
  return s;
}
// the point on the outline nearest p: { k: the edge (from point k to k+1), t, at }
function nearestOn(sew, p) { let best = null; for (let k = 0; k < sew.length; k++) { const a = sew[k], b = sew[(k + 1) % sew.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0), 1), at = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(at[0] - p[0], at[1] - p[1]); if (!best || d < best.d) best = { k, t, at, d }; } return best; }
// put a point on the outline (or find the one already there) → [the outline, its index]
function insertOn(sew, p) { const n = nearestOn(sew, p), q = [r16(n.at[0]), r16(n.at[1])], k = n.k, j = (k + 1) % sew.length;
  for (const i of [k, j]) if (Math.hypot(sew[i][0] - q[0], sew[i][1] - q[1]) < .05) return [sew, i];
  const out = sew.slice(); out.splice(k + 1, 0, q); return [out, k + 1]; }
const runOf = (sew, i, j) => { const out = []; for (let k = i; ; k = (k + 1) % sew.length) { out.push(sew[k]); if (k === j) break; } return out; };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0), 1); return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); };
// how far a stroke lies from an open run of the outline, on average (to its edges, not only its corners)
const meanDist = (pts, line) => pts.reduce((a, p) => a + Math.min(...line.slice(0, -1).map((q, k) => segDist(p, q, line[k + 1]))), 0) / Math.max(pts.length, 1);
// redraw an edge: the stretch of the outline between where the stroke starts and ends (the side it was drawn along) takes the stroke's shape
export function replaceEdge(sew, stroke) {
  const s = cleanStroke(stroke); if (s.length < 2 || !Array.isArray(sew) || sew.length < 3) return null;
  let [o, i] = insertOn(sew, s[0]); const n0 = o.length; let j; [o, j] = insertOn(o, s[s.length - 1]); if (o.length > n0 && j <= i) i += 1;
  if (i === j) return null;
  const fwd = runOf(o, i, j), back = runOf(o, j, i), inner = s.slice(1, -1), probe = inner.length ? inner : s;
  // the stroke replaces the side of the outline it lies along; the other side stays
  const out = meanDist(probe, fwd) <= meanDist(probe, back) ? [o[i], ...inner, ...back.slice(0, -1)] : [o[j], ...inner.slice().reverse(), ...fwd.slice(0, -1)];
  return out.length >= 3 && areaOf(out) > .25 ? tidy(out) : null;
}
// cut a piece in two along a line drawn across it → [the piece on one side, the piece on the other] (each gets its own seam allowance when cut)
function crossings(sew, line) { const out = []; for (let s = 0; s < line.length - 1; s++) { const [p, q] = [line[s], line[s + 1]];
  for (let k = 0; k < sew.length; k++) { const a = sew[k], b = sew[(k + 1) % sew.length], d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]); if (Math.abs(d) < 1e-12) continue;
    const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ s, t, k, at: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] }); } }
  return out.sort((x, y) => x.s - y.s || x.t - y.t); }
export function splitPiece(sew, line) {
  const L = cleanStroke(line, { tol: .03 }); if (L.length < 2 || !Array.isArray(sew) || sew.length < 3) return null;
  const X = crossings(sew, L); if (X.length < 2) return null; const [c1, c2] = [X[0], X[1]];
  const seam = [c1.at, ...L.slice(c1.s + 1, c2.s + 1), c2.at].map(([x, y]) => [r16(x), r16(y)]);
  // A: from where the line enters, along it to where it leaves, then round the outline back; B: the rest
  const ring = (from, to) => { const out = []; for (let k = (from + 1) % sew.length; ; k = (k + 1) % sew.length) { out.push(sew[k]); if (k === to) break; } return out; };
  const A = [...seam, ...(c2.k === c1.k ? [] : ring(c2.k, c1.k))], B = [...seam.slice().reverse(), ...(c1.k === c2.k ? sew.slice() : ring(c1.k, c2.k))];
  const ok = P => P.length >= 3 && Math.abs(areaOf(P)) > .25;
  return ok(A) && ok(B) ? [tidy(A), tidy(B)] : null;
}
// a piece drawn freehand: a closed stroke → its outline, set on the sixteenth, with no less than three points and some area
export function drawnPiece(stroke) { const s = cleanStroke(stroke, { tol: .06, closed: true }); return s.length >= 3 && Math.abs(areaOf(s)) > .5 ? s : null; }
