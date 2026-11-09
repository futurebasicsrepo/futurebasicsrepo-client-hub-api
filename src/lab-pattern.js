// Design Lab patterns: a piece as the pattern pieces it is cut from. Garments are drafted from the flats' own measurements (src/lab-flats.js),
// so the pattern grades with the size run. Plush is drafted from a few choices (the shape, the height, the ears, the limbs). Every piece has a
// sew line, a seam allowance, a grain line, notches, how many to cut and from what. Each piece also knows where it sits on the product
// (for the exploded view, which lifts the pieces off the product and lays them out flat) and where it goes in the cutting layout.
// The same file runs in the page (served as /lab/pattern.js) and on the service (the DXF and the SVG), so it uses neither the DOM nor Node.
// All lengths are inches; y runs down. A pattern from here is a first block from the measurements: a pattern maker trues it up on the sample.
import { dxfR12 } from './lab-dxf.js';
import { STYLES, measurementsFor, SIZES, drawnLegs, followDrawing } from './lab-flats.js';
import { constructionOf } from './lab-construction.js';
import { cleanSketches, VIEWS_OF } from './lab-sketch.js';
import { cleanLogos } from './lab-logos.js';

const r3 = v => Math.round(v * 1000) / 1000;
const r8 = v => Math.round(v * 8) / 8;
const cubic = (a, c1, c2, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; });
const tail = pts => pts.slice(1);
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
const FABRIC_NAMES = { self: 'Self (main fabric)', rib: 'Rib', shearling: 'Shearling (or faux shearling)', lining: 'Lining', fusing: 'Fusing', insulation: 'Insulation (batting or down)', pocketing: 'Pocketing', board: 'Board', knit: 'Knit (to shape)', pile: 'Plush pile', leather: 'Leather', felt: 'Felt', contrast: 'Contrast', upper: 'Upper', overlay: 'Overlays', foam: 'Foam', elastic: 'Elastic gore', stiffener: 'Stiffener (thermoplastic)', rubber: 'Rubber (moulded)', eva: 'EVA (moulded)', reinforcement: 'Reinforcement (non-woven backer)', membrane: 'Waterproof membrane', strobel: 'Strobel sock (non-woven)' };
export const fabricName = f => FABRIC_NAMES[f] || f;
function piece(id, name, sew, o = {}) {
  const s = tidy(sew), b = boundsOf(s);
  return { id, name, fabric: o.fabric || 'self', cut: o.cut ?? 1, ...(o.cut === 0 && /-2$/.test(id) ? { twin: true } : {}), pair: Boolean(o.pair), fold: Boolean(o.fold), sew: s, grain: o.grain || [[(b.x0 + b.x1) / 2, b.y0 + b.h * .2], [(b.x0 + b.x1) / 2, b.y1 - b.h * .2]], notches: o.notches || [], notes: o.notes || [], place: { view: 'front', x: 0, y: 0, rot: 0, flip: false, z: 0, ...(o.place || {}) }, sa: o.sa ?? null, marks: o.marks || [], ...(o.shown ? { shown: tidy(o.shown) } : {}), ...(o.component ? { component: true } : {}), ...(o.hidden ? { hidden: true } : {}) };
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
  const dbl = K.breasted === 'double', peak = K.lapel ? K.lapel === 'peak' : dbl, trims = [], pieces = [];
  const half = m.chest / 2, nw = m.neckWidth / 2, sh = Math.max(m.shoulder / 2, nw + 2), slope = 1.1, L = m.length, SP = [sh, slope];
  const UA = [half, slope + m.armhole], ext = dbl ? 3.25 : 1, breakY = dbl ? UA[1] + 1.5 : UA[1] + 3.5, waistY = Math.min(L - 6, UA[1] + 6.5);
  const sideX = half * .72; // the front's side seam to the side body (forward of the side, under the arm)
  const armhole = cubic(SP, [SP[0] - .4, SP[1] + (UA[1] - SP[1]) * .55], [UA[0] - 1.3, UA[1] - .1], UA), aF = armhole.filter(([x]) => x <= sideX + .01), aEnd = aF[aF.length - 1];
  // the lapel as cut: past the roll line (from the neck point to the break), its edge to the notch, the gorge back to the neck
  const lapW = dbl ? 3.75 : 3.25, notchY = 2.6, N0 = [nw - .1, 0], B = [-ext, breakY];
  const lapTip = peak ? [-ext - lapW * .62, notchY - 2.3] : [-ext - lapW * .55, notchY + .1], notchIn = peak ? [-ext - lapW * .18, notchY + .35] : [-ext - lapW * .2, notchY + .65];
  const lapelEdge = [B, ...tail(cubic(B, [-ext - lapW * .55, breakY * .6], [-ext - lapW * .85, notchY + 3], lapTip)), notchIn, [nw * .35, notchY - .3], N0];
  const frontSew = [[-ext, L], ...lapelEdge.slice(), ...tail(cubic(N0, [nw * .6, -.1], [sh * .7, SP[1] * .4], SP)), ...tail(aF), [sideX, waistY], [sideX - .2, L + .35]];
  // on the product: the front's face with its lapel folded back over it (the roll line from the neck to the break)
  const roll = [[nw - .2, .25], B], fold = ([x, y]) => { const [a, b] = roll, dx = b[0] - a[0], dy = b[1] - a[1], t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), px = a[0] + t * dx, py = a[1] + t * dy; return [2 * px - x, 2 * py - y]; };
  const lapelSeen = [B, ...lapelEdge.slice(1, -1).map(fold), [nw - .2, .25]];
  const faceSeen = [[-ext, L], B, [nw - .2, .25], ...tail(cubic(N0, [nw * .6, -.1], [sh * .7, SP[1] * .4], SP)), ...tail(armhole), [half, waistY], [half + .3, L + .35]];
  pieces.push(piece('front', 'Front', frontSew, { cut: 2, pair: true, shown: faceSeen, notches: [B, [sideX, waistY]], notes: [`Lapel cut in one with the front, rolled from the neck to the break ${r8(breakY)} in down; ${dbl ? '3¼ in double-breasted overlap' : '1 in button stand'} past the centre front`, 'Fused, with a floating chest canvas and a bridle tape on the roll line'], place: { view: 'front', x: 0, y: 0, z: 1 } }),
    { ...twin('front-2', 'Front', frontSew, { view: 'front', flip: true, z: dbl ? 2 : 1 }), shown: faceSeen });
  for (const [id, fl] of [['lapel', false], ['lapel-2', true]]) pieces.push({ ...piece(id, peak ? 'Peak lapel' : 'Notch lapel', lapelSeen, { cut: 0, shown: lapelSeen, place: { view: 'front', x: 0, y: 0, ...(fl ? { flip: true } : {}), z: fl && dbl ? 4 : 3 } }), twin: true, copy: true, of: 'front' });
  // the side body: under the arm, between the front and the back
  const sbW = (half - sideX) * 2 + 1, side = [[0, UA[1] - (aEnd ? aEnd[1] - UA[1] : 0)], ...tail(cubic([0, aEnd ? aEnd[1] : UA[1]], [sbW * .3, UA[1] + .9], [sbW * .7, UA[1] + .9], [sbW, UA[1] - .3])), [sbW - .3, waistY], [sbW - .1, L + .3], [.2, L + .35], [.3, waistY]];
  pieces.push(piece('side-body', 'Side body', side.map(([x, y]) => [x, y - UA[1]]), { cut: 2, pair: true, hidden: true, notes: ['Under the arm, between the front and the back; shaped at the waist'], place: { view: 'back', x: half + 2, y: UA[1], z: -1 } }));
  // the back, seamed down the centre and shaped into the waist; a centre vent (or two side vents)
  const nb = cubic([0, 1], [nw * .55, 1], [nw, .5], [nw, 0]), back = [[0, 1], ...tail(nb), [SP[0], SP[1]], ...tail(armhole), [half - .5, waistY], [half - .2, L + .35], [0, L + .35], [.45, waistY]];
  pieces.push(piece('back', 'Back', back, { cut: 2, pair: true, notes: ['Centre-back seam, shaped ½ in in at the waist; a 9 in centre vent'], place: { view: 'back', x: 0, y: 0 } }), twin('back-2', 'Back', back, { view: 'back', flip: true }));
  // the collar: the top collar (self) and the under collar (melton, on the bias), stand and fall, meeting the lapel at the notch
  const neckLen = lenOf(nb) * 2 + lenOf(cubic(N0, [nw * .6, -.1], [nw * .9, -.05], [nw, 0])) * 2 + 2;
  const collar = [[-neckLen / 2, 0], ...tail(cubic([-neckLen / 2, 0], [-neckLen / 4, -.4], [neckLen / 4, -.4], [neckLen / 2, 0])), [neckLen / 2 + 1.1, 2.6], [neckLen / 2 + .2, 3.2], ...tail(cubic([neckLen / 2 + .2, 3.2], [neckLen / 4, 3.6], [-neckLen / 4, 3.6], [-neckLen / 2 - .2, 3.2])), [-neckLen / 2 - 1.1, 2.6]];
  // the collar as the front shows it: a band round the back of the neck (seen inside the opening), over the shoulder and down the gorge to the notch
  const nIn = fold(notchIn), tipC = [nIn[0] + (peak ? .35 : .75), nIn[1] - (peak ? .1 : .55)], collarSeen = [[0, .95], [nw * .55, .7], [nw - .2, .25], nIn, tipC, [nw + 1.1, -.35], [nw * .5, -.85], [0, -.9]];
  pieces.push(piece('top-collar', 'Top collar', collar, { cut: 1, hidden: true, notes: ['Self; stand and fall, the fall ½ in deeper at the back'], place: { view: 'front', x: 0, y: -1.2, z: -1 } }),
    piece('under-collar', 'Under collar', collar, { fabric: 'melton', cut: 2, hidden: true, notes: ['Melton or felt on the bias, seamed at the centre back; pad-stitched'], place: { view: 'front', x: 0, y: -1.2, z: -1 } }));
  for (const [id, fl] of [['collar-end', false], ['collar-end-2', true]]) pieces.push({ ...piece(id, 'Collar', collarSeen, { cut: 0, shown: collarSeen, place: { view: 'front', x: 0, y: 0, ...(fl ? { flip: true } : {}), z: 5 } }), twin: true, copy: true, of: 'top-collar' });
  // the facing: the lapel and the front edge, self, so the lapel shows self cloth when it rolls
  const facing = [...lapelEdge.slice().reverse(), ...tail(cubic(N0, [nw * .6, -.1], [nw + 1.2, .3], [nw + 1.6, .8])), [2.2, breakY + 2], [1.4, L], [-ext, L]];
  pieces.push(piece('facing', 'Front facing', facing, { cut: 2, pair: true, hidden: true, notes: ['Self, fused; the lapel turned at the roll line'], place: { view: 'front', x: 0, y: 0, z: -2 } }));
  // the two-piece sleeve: a top sleeve and an under sleeve, with a cuff vent and buttons
  if (m.sleeve > 0) {
    const A = lenOf(armhole) * 2, ch = Math.max(5.5, (UA[1] - SP[1]) * .62), bw = A / 2.2, so = m.sleeveOpening || 5.5, Ls = m.sleeve;
    const top = [[0, 0], ...tail(cubic([0, 0], [bw * .32, -.1], [bw * .62, ch * .45], [bw * .66, ch])), [so * .62, Ls], [-so * .5, Ls], [-bw * .38, ch], ...tail(cubic([-bw * .38, ch], [-bw * .36, ch * .55], [-bw * .25, .25], [0, 0])).slice(0, -1)];
    const under = [[-bw * .34, ch], ...tail(cubic([-bw * .34, ch], [-bw * .2, ch + .9], [bw * .2, ch + .9], [bw * .3, ch + .2])), [so * .45, Ls], [-so * .45, Ls]];
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
    piece('flap', 'Pocket flap', rect(6.25, 2.5), { cut: 4, pair: true, notes: ['Self and lining; over a jetted pocket, set level at the waist'], shown: flap, place: { view: 'front', x: half * .2, y: waistY + 3.2, z: 3 } }),
    { ...twin('flap-2', 'Pocket flap', flap, { view: 'front', x: -half * .2 - 6.25, y: waistY + 3.2, z: 3 }), shown: flap },
    piece('pocket-bag', 'Pocket bag', rect(7.5, 15), { fabric: 'pocketing', cut: 6, hidden: true, notes: ['Two to each flap pocket, two for the chest welt'], place: { view: 'front', x: half * .3, y: waistY + 3, z: -3 } }));
  // the buttons as the front shows them
  const btn = [[-.35, 0], [0, -.35], [.35, 0], [0, .35]], rows = dbl ? [breakY + .5, breakY + 3.5, breakY + 6.5] : [breakY + .25, breakY + 4.75], cols = dbl ? [ext - .9, -(ext - .9)] : [-0];
  let n = 0; for (const y of rows) for (const x of cols) pieces.push({ ...piece(`button-${++n}`, 'Button', btn, { cut: 0, shown: btn, place: { view: 'front', x, y, z: 6 } }), twin: true, copy: true, of: 'front' });
  trims.push({ item: 'Front buttons', spec: `${dbl ? '24L' : '32L'} (${dbl ? '15' : '20'} mm) horn or corozo, four-hole`, qty: dbl ? 6 : 2, where: dbl ? 'Two columns of three; the middle pair fastens, the top pair is for show' : 'Two, the top one fastens' },
    { item: 'Chest canvas', spec: 'Hair canvas with a felt chest piece, floating', qty: 2, where: 'Fronts' }, { item: 'Fusing', spec: 'Lightweight weft fusible', qty: 'Fronts, facings, top collar, flaps, welts', where: 'Throughout' },
    { item: 'Shoulder pads', spec: `${K.sleeve === 'drop' ? '¼' : '½'} in, set-in`, qty: 2, where: 'Shoulders' }, { item: 'Bridle tape', spec: '¼ in cotton tape', qty: `${r8(Math.hypot(B[0] - N0[0], B[1] - N0[1]) * 2)} in`, where: 'Along each roll line' });
  // the lining: front (less the facing), back with a pleat, sleeves
  pieces.push(piece('front-lining', 'Front lining', [[2.2, breakY + 2], ...tail(cubic(N0, [nw + 1.2, .3], [nw + 1.4, .6], [nw + 1.6, .8])).map(([x, y]) => [x + .2, y]), [SP[0], SP[1]], ...tail(aF), [sideX, L - .5], [1.4, L - .5]], { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['Bagged; an inside welt pocket on each side'], place: { view: 'front', x: 0, y: 0, z: -4 } }),
    piece('back-lining', 'Back lining', back.map(([x, y]) => [x + (x < .1 ? -.5 : 0), y]), { fabric: 'lining', cut: 2, pair: true, hidden: true, notes: ['1 in pleat at the centre back'], place: { view: 'back', x: 0, y: 0, z: -4 } }),
    piece('sleeve-lining', 'Sleeve lining', rect(r8((m.sleeveOpening || 5.5) * 2 + 4), r8(m.sleeve + .5)), { fabric: 'lining', cut: 4, hidden: true, notes: ['Top and under sleeve lining, ½ in longer for a jump pleat'], place: { view: 'front', x: sh, y: SP[1], z: -4 } }));
  trims.push({ item: 'Lining', spec: 'Bemberg cupro or viscose twill', qty: `${r8(m.length / 36 * 2 + .4)} yd`, where: 'Body and sleeves' });
  pieces.trims = trims; return pieces;
}
function topPieces(S, m, o, style) {
  if ((style === 'jacket' || style === 'coat') && o.K?.collar === 'lapel') return tailoredPieces(S, m, o, style, o.K);
  // how it is built (src/lab-construction.js): what was set, what the sketch's name says, or the style's own
  const K = o.K || {}, pk = K.pockets || [], has = t => pk.includes(t), count = t => pk.filter(x => x === t).length;
  o = { ...o, drop: Boolean(o.drop || K.sleeve === 'drop') };
  const hood = K.hood ?? Boolean(S.hood), zip = K.opening ? K.opening === 'zip' : Boolean(S.zip), raglan = K.sleeve === 'raglan' && m.sleeve > 0;
  const buttons = K.opening === 'buttons' || K.opening === 'snaps', trims = [];
  // what the sketch draws that changes the cut: a shearling collar, hem band and cuffs (an aviator), a stand or a shirt collar on a jacket
  const tpl = String(o.template || ''), outer = ['jacket', 'coat', 'vest'].includes(style), shearling = K.collar === 'shearling' && outer;
  const jacketCollar = shearling ? 'shearling' : style === 'jacket' && ['stand', 'funnel'].includes(K.collar) ? 'stand' : style === 'jacket' && K.collar === 'shirt' ? 'shirt' : style === 'jacket' && K.collar === 'lapel' ? 'lapel' : null;
  let SLV = null; // where the sleeve sits on the front, so its cuff is drawn on its end
  let SLEEVE = null, WELT = null; // the sleeve as cut ({ sew, b, ch, Ls }): its lining is drafted from it
  const half = m.chest / 2, nw = m.neckWidth / 2, drop = o.drop ? 2.25 : 0, sh = Math.max(m.shoulder / 2, nw + 2), slope = o.drop ? .75 : 1.25;
  const L = m.length - (m.hemRib || 0), SP = [sh, slope], UA = [half, slope + m.armhole + drop * .3], depth = UA[1] - SP[1];
  const neck = nd => cubic([0, nd], [nw * .55, nd], [nw, nd * .65], [nw, 0]);
  const armhole = cubic(SP, [SP[0] - .35, SP[1] + depth * .5], [UA[0] - 1.1, UA[1] - .1], UA);
  // half the body, from the centre-front neck round to the centre-front hem; the whole body is it and its mirror
  // a raglan seam runs from a point on the neckline, about a quarter of the way in from the shoulder, down to the underarm
  const ragOf = nd => { const nk = neck(nd), i = Math.max(1, Math.round((nk.length - 1) * .7)), R = nk[i]; return { nk: nk.slice(0, i + 1), R, line: cubic(R, [R[0] + (UA[0] - R[0]) * .3, R[1] + (UA[1] - R[1]) * .2], [UA[0] - 1.7, UA[1] - 2.4], UA) }; };
  const halfOf = (nd, ext = 0) => { if (raglan) { const r = ragOf(nd); return [[-ext, nd], ...r.nk, ...tail(r.line), [half, L], [-ext, L]]; } return [[-ext, nd], ...neck(nd), [SP[0], SP[1]], ...tail(armhole), [half, L], [-ext, L]]; };
  const whole = nd => { const h = halfOf(nd); return [...h, ...mirrorX(h).reverse()]; };
  const pieces = [], open = zip || buttons || ['shirt', 'shirtss', 'jacket', 'coat', 'vest'].includes(style);
  const ext = ['shirt', 'shirtss', 'coat'].includes(style) || (buttons && outer) ? .75 : 0; // the button stand past the centre front
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
    const nf = neck(m.neckDropFront), ext0 = ext, yk = [[-ext0, Math.min(m.neckDropFront, fy)], ...nf.filter(([, y]) => y <= fy), [SP[0], SP[1]], [SP[0] + .1, fy], ...(west ? [[half * .45, fy + 1.6]] : []), [-ext0, fy]];
    pieces.push(piece('front-yoke', 'Front yoke', open ? yk : [...yk, ...mirrorX(yk).reverse()], { cut: open ? 2 : 1, ...(open ? { pair: true } : { fold: true }), notes: [west ? 'Pointed western yoke, topstitched; piping optional' : 'Seamed to the front, topstitched'], place: { view: 'front', x: 0, y: 0, z: 1 } }),
      ...(open ? [twin('front-yoke-2', 'Front yoke', yk, { view: 'front', flip: true, z: 1 })] : []));
  }
  // the sleeve: its cap eases into the armhole; a dropped shoulder has a flatter cap
  if (m.sleeve > 0) {
    const A = lenOf(armhole), ch = o.drop ? Math.max(1.5, depth * .28) : Math.max(2.5, depth * .55), b = Math.sqrt(Math.max(((A + .25) / 1.04) ** 2 - ch * ch, 4)), Ls = Math.max(m.sleeve - (m.cuffRib || 0), 2), so = Math.min(Math.max(m.sleeveOpening, 2), b);
    // an aviator's sleeve is full: it keeps most of its width to the wrist and is gathered into a narrower cuff, its sides bowing out
    const full = shearling && m.cuffRib > 0, soB = full ? Math.max(so, b * .74) : so;
    const capR = cubic([0, 0], [b * .45, 0], [b * .72, ch * .55], [b, ch]), side = full ? tail(cubic([b, ch], [b * 1.04, ch + (Ls - ch) * .45], [soB * 1.12, Ls * .86], [soB, Ls])) : [[so, Ls]];
    let sew = [...mirrorX(capR).reverse(), ...tail(capR), ...side, ...mirrorX(side).reverse()];
    if (raglan) { const rf = ragOf(m.neckDropFront), rb = ragOf(m.neckDropBack), tf = lenOf(neck(m.neckDropFront)) - lenOf(rf.nk), tb = lenOf(neck(m.neckDropBack)) - lenOf(rb.nk);
      const Lf = lenOf(rf.line), Lb = lenOf(rb.line), hf = Math.sqrt(Math.max(Lf ** 2 - (b - tf) ** 2, 4)), hb = Math.sqrt(Math.max(Lb ** 2 - (b - tb) ** 2, 4)), Lu = Math.max(Ls - ch, 4) + Math.max(hf, hb);
      const fr = cubic([tf, 0], [tf + (b - tf) * .55, hf * .2], [b - .4, hf * .75], [b, hf]), bk = cubic([-tb, 0], [-tb - (b - tb) * .55, hb * .2], [-b + .4, hb * .75], [-b, hb]);
      sew = [[-tb, 0], [tf, 0], ...tail(fr), [so, Lu], [-so, Lu], ...bk.slice().reverse().slice(0, -1)]; }
    SLEEVE = { sew, b, ch, Ls };
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
    if (m.sleeve > 12) {
      // a long sleeve, seen as the flats draw it: hanging close to the body, not held out. Laid flat, a set-in sleeve pinned at both the shoulder
      // point and the underarm can only sit splayed out; on a flat the cap rounds over the shoulder and the sleeve falls nearly straight, its
      // inner edge from the underarm down beside the body, its end square to it. Drawn in the front's own inches (the right sleeve; the left
      // is its mirror); the cut piece is unchanged
      const al = (full ? 7 : 10) * Math.PI / 180, d = [Math.sin(al), Math.cos(al)], n = [Math.cos(al), -Math.sin(al)];
      const wTop = b * (full ? .42 : .38), wEnd = full ? Math.max(m.sleeveOpening * 1.12, 4) : Math.max(m.sleeveOpening, 3.25), Li = Math.max(Ls - ch, 4);
      const I = [UA[0] + d[0] * Li, UA[1] + d[1] * Li], O = [I[0] + n[0] * wEnd, I[1] + n[1] * wEnd], T = [UA[0] + wTop, UA[1] - depth * .08];
      const bow = full ? 1.6 : .35, len = Math.hypot(O[0] - T[0], O[1] - T[1]), at = (P, k, off) => [P[0] + d[0] * k + n[0] * off, P[1] + d[1] * k + n[1] * off];
      const cap = cubic(SP, [SP[0] + wTop * .55, SP[1] - .25], [T[0] + .15, T[1] - depth * .5], T), outer = cubic(T, at(T, len * .38, bow), at(O, -len * .3, bow * (full ? .9 : .4)), O);
      const inner = cubic(I, at(I, -Li * .3, full ? -.35 : 0), at(UA, Li * .3, full ? -.25 : 0), UA), seam = armhole.slice().reverse();
      shownP = [...cap, ...tail(outer), ...tail(inner), ...tail(seam)].map(([x, y]) => [x - SP[0], y - SP[1]]);
      placeR = { view: 'front', x: SP[0], y: SP[1], rot: 0, z: -1 }; placeL = { view: 'front', x: -SP[0], y: SP[1], rot: 0, flip: true, z: -1 };
      SLV = { hang: true, rot: -al * 180 / Math.PI, end: [(O[0] + I[0]) / 2, (O[1] + I[1]) / 2], so: wEnd / 2, Ls, full };
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
    pieces.push(piece('cuff', name, sew, { fabric: fab, cut: shirt ? 4 : 2, shown, notes: [shirt ? 'Fused on the outer cuff' : shearling ? 'Shearling, pile out; the cut edge turned in at the sleeve seam' : 'Folded in half, stretched onto the sleeve'], place: end(1) }),
      { ...piece('cuff-2', name, sew, { cut: 0, shown, place: end(-1), fabric: fab }), twin: true });
  }
  // the band is cut as one strip round the whole hem; on the product only the front's share of it shows
  if (m.hemRib) {
    const band = shearling ? rect(r8(m.chest * 2 * .96), m.hemRib) : rect(r8(m.chest * 2 * .88), m.hemRib * 2), w = band[1][0];
    pieces.push(piece('hem-rib', shearling ? 'Shearling hem band' : 'Hem rib', band.map(([x, y]) => [x - w / 2, y]), { fabric: shearling ? 'shearling' : 'rib', shown: [[-half, 0], [half, 0], [half, m.hemRib], [-half, m.hemRib]], notes: [shearling ? 'Shearling, pile out, eased (not stretched) onto the hem; split at the zip' : 'Folded in half, stretched about 12% onto the hem'], place: { view: 'front', x: 0, y: L, z: 2 } }));
  }
  if (hood) {
    const hn = (lenOf(neck(m.neckDropFront)) + lenOf(neck(m.neckDropBack))), H = 13.5, D = Math.max(hn + .4, 9.5);
    const side = [[0, 0], ...tail(cubic([0, 0], [D * .55, -1.1], [D + .9, .6], [D + .6, H * .45])), ...tail(cubic([D + .6, H * .45], [D + .4, H * .7], [D, H - .5], [D - .3, H])), ...tail(cubic([D - .3, H], [D * .6, H - .1], [D * .25, H + .25], [.4, H]))];
    pieces.push(piece('hood', 'Hood side', side, { cut: 2, pair: true, notes: [`The neck edge (${r8(hn)} in) meets half the neckline`, o.drawcord !== false ? 'Drawcord channel along the front edge, two eyelets' : 'No drawcord'], place: { view: 'back', x: .1, y: -H + 1, z: -2 } }), twin('hood-2', 'Hood side', side, { view: 'back', x: -.1, y: -H + 1, flip: true, z: -2 }));
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
    } else if (jacketCollar === 'stand') pieces.push(piece('collar', 'Stand collar', rect(r8(neckLen + 1), 5).map(([x, y]) => [x - (neckLen + 1) / 2, y]), { cut: 2, shown: [[-m.neckWidth / 2 - .2, -1.6], [m.neckWidth / 2 + .2, -1.6], [m.neckWidth / 2 + .2, .9], [-m.neckWidth / 2 - .2, .9]], notes: ['Folded at the top edge to a 2 1/2 in stand; fused'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
    else pieces.push(piece('collar', 'Collar', [[-nl, 0], [nl, 0], [nl + .9, 3.25], [-nl - .9, 3.25]], { cut: 2, shown: [[-m.neckWidth / 2 - 1.6, -1], [m.neckWidth / 2 + 1.6, -1], [m.neckWidth / 2 + 2, 1.6], [.6, ndf + .4], [-.6, ndf + .4], [-m.neckWidth / 2 - 2, 1.6]], notes: ['Top collar and under collar; fused under collar'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
  }
  // a jacket's welt pockets: slanted at the hip, the welt and its bag (pocketing) behind it
  if ((style === 'jacket' || style === 'coat' || style === 'vest') && (has('welt') || has('flap-welt'))) {
    const slant = /aviator|shearling|bomber|blouson|biker|moto/.test(tpl) ? 55 : 80, len = 6.5, cx = half * .58, cy = L * .62; WELT = { len, cx, cy, slant };
    const welt = [[-len / 2, -.5], [len / 2, -.5], [len / 2, .5], [-len / 2, .5]];
    pieces.push(piece('welt', 'Pocket welt', rect(len + 1, 2.5), { cut: 2, pair: true, shown: welt, notes: ['Folded to a 1 in welt, fused; bartack both ends'], place: { view: 'front', x: cx, y: cy, rot: slant, z: 3 } }),
      { ...piece('welt-2', 'Pocket welt', rect(len + 1, 2.5), { cut: 0, shown: welt, place: { view: 'front', x: -cx, y: cy, rot: -slant, flip: true, z: 3 } }), twin: true },
      piece('pocket-bag', 'Pocket bag', [[0, 0], [len + 1, 0], [len + 1.5, 7], ...tail(cubic([len + 1.5, 7], [len + 1.5, 9.5], [1, 10], [0, 8.5]))], { fabric: 'pocketing', cut: 4, pair: true, hidden: true, notes: ['Two to each pocket, bagged out behind the welt'], place: { view: 'front', x: cx - len / 2, y: cy, z: -4 } }));
  }
  if (style === 'shirt' || style === 'shirtss') {
    pieces.push(piece('collar', 'Collar', [[-neckLen / 2, 0], [neckLen / 2, 0], [neckLen / 2 + .6, 2.75], [-neckLen / 2 - .6, 2.75]], { cut: 2, notes: ['Top collar and under collar; fused top collar'], place: { view: 'front', x: 0, y: -1.2, z: 4 } }));
    pieces.push(piece('stand', 'Collar stand', [[-neckLen / 2 - .75, 0], ...tail(cubic([-neckLen / 2 - .75, 0], [-neckLen / 4, -.35], [neckLen / 4, -.35], [neckLen / 2 + .75, 0])), [neckLen / 2 + .75, 1.25], [-neckLen / 2 - .75, 1.25]], { cut: 2, notes: ['Fused; the buttonhole at the centre front'], place: { view: 'front', x: 0, y: 0, z: 3 } }));
  }
  if (style === 'polo' || (K.collar === 'polo' && !['shirt', 'shirtss'].includes(style))) {
    if (!K.opening || K.opening === 'none' || K.opening === 'placket') pieces.push(piece('placket', 'Placket', rect(1.25, 6), { cut: 2, notes: ['Fused; 2 buttons'], place: { view: 'front', x: -.625, y: m.neckDropFront, z: 3 } }));
    pieces.push(piece('collar', 'Knit collar', rect(r8(neckLen), 3), { fabric: 'rib', notes: ['Flat-knit collar, knitted to size'], place: { view: 'front', x: -neckLen / 2, y: -1, z: 4 } }));
  }
  if (style === 'coat') pieces.push(piece('collar', 'Collar', [[-neckLen / 2, 0], [neckLen / 2, 0], [neckLen / 2 + 1.2, 3.5], [-neckLen / 2 - 1.2, 3.5]], { cut: 2, notes: ['Fused under collar'], place: { view: 'front', x: 0, y: -1.5, z: 4 } }), piece('facing', 'Front facing', [[0, 0], [3, 0], [3, L], [0, L]], { cut: 2, pair: true, notes: ['Fused'], place: { view: 'front', x: 0, y: 0, z: -3 }, fabric: 'self' }));
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
    pieces.push(piece('collar', 'Stand collar', rect(r8(nl + (K.opening && K.opening !== 'none' ? 1 : 0)), 5), { fabric: K.opening === 'half-zip' || K.opening === 'quarter-zip' ? 'self' : 'rib', cut: 1, notes: ['Folded to 2½ in'], place: { view: 'front', x: 0, y: 0, z: 4 } })); }
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
  if (m.sleeve === 0) pieces.push(piece('binding', 'Armhole and neck binding', rect(r8(lenOf(armhole) * 4 * .92 + neckLen * .9), 1.25), { fabric: 'self', cut: 1, notes: ['Bias or cross-grain strip, cut into lengths'], place: { view: 'front', x: -half, y: L + 1, z: 2 } }));
  return pieces;
}
function bottomPieces(S, m, o, style) {
  const K = o.K || {}, pk = K.pockets || [], has = t => pk.includes(t), trims = [];
  const wb = m.waistband, pieces = [];
  if (S.skirt) {
    const w = m.waist / 2, hip = m.hip / 2, L = m.length - wb, sw = Math.max(m.sweep, m.hip) / 2 * (K.leg === 'flare' ? 1.45 : 1), hy = Math.min(7, L * .45);
    const pleated = (K.pleats || 0) > 0;
    const panel = [[-w, 0], [w, 0], ...tail(cubic([w, 0], [hip, hy * .4], [hip, hy * .8], [hip, hy])), [sw, L], [-sw, L], ...tail(cubic([-hip, hy], [-hip, hy * .8], [-hip, hy * .4], [-w, 0])).slice(0, -1)];
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
    pieces.trims = trims; return pieces;
  }
  const rd = m.rise - wb, Hc = m.hip * 2, hipY = Math.min(7.5, rd * .7), inseam = m.inseam, Hy = rd + inseam;
  const leg = (back) => {
    const k = back ? 1 : -1, hipW = m.hip / 2 + (back ? .5 : -.5), waistW = m.waist / 2 + (back ? .25 : -.25), ext = back ? Hc / 10 : Hc / 16;
    // a side panel takes 1¼ in off each leg at the side seam; front pleats add their depth to the front's waist
    const panel = K.panels === 'side-panel' ? 1.25 : 0, pleat = back ? 0 : (K.pleats || 0) * 1.25;
    const sideX = -hipW + panel, crease = (ext + sideX) / 2, cbRaise = back ? 1 : 0;
    const legK = o.legsDrawn ? 1 : { flare: 1.7, wide: 1.45, taper: .82, balloon: .9 }[K.leg] || 1, // a leg opening read from the sketch is already as wide as the leg is drawn
      hemW = m.legOpening * (back ? 1.1 : .9) * legK, kneeY = rd + inseam * .48;
    // the knee: a flare narrows to it, a balloon fills out at it; otherwise as the sketch draws it (its knee in proportion to its hem), or a
    // straight line from the hip to the hem when there is no sketch to read
    const kneeW = K.leg === 'flare' ? m.legOpening * (back ? 1.1 : .9) * .92 : K.leg === 'balloon' ? (hipW + ext) * .95 : o.kneeRatio ? Math.min(hemW * o.kneeRatio, hipW + ext * .6) : null;
    const crotch = cubic([0, rd * .55], [0, rd * .85], [ext * .35, rd], [ext, rd]);
    const knee = side => kneeW ? [[crease + side * kneeW / 2, kneeY]] : [];
    const sideCurve = tail(cubic([sideX, hipY], [sideX, hipY * .5], [-waistW - pleat - .2 + panel, hipY * .2], [-waistW - pleat + panel, 0]));
    // a curved (running) hem: it rises to the side seam, the side shorter than the inseam
    const lift = K.hem === 'curved' ? Math.min(2.25, inseam * .35) : 0, hemOut = (xi, xo) => lift ? tail(cubic([xi - (xi - xo) * .45, Hy], [xo + (xi - xo) * .12, Hy], [xo, Hy - lift * .45], [xo, Hy - lift])) : [[xo, Hy]];
    const sew = [[0, -cbRaise], ...crotch, ...knee(1), [crease + hemW / 2, Hy], ...(lift ? [[crease + hemW / 2 - hemW * .45, Hy]] : []), ...hemOut(crease + hemW / 2, crease - hemW / 2), ...knee(-1), [sideX, hipY], ...sideCurve];
    // on the product the leg is seen from the centre line out: its crotch extension tucks under the other leg, the two meet at the centre
    // laid flat, the legs meet at the centre: a leg too wide to sit either side of its crease there moves out, at its full width (it is not cut
    // narrower than it is: a straight or wide leg shows as wide as it is cut)
    const inX = x => Math.min(x, -.35), sideSeen = tail(cubic([sideX, hipY], [sideX, hipY * .5], [-waistW - .2 + panel, hipY * .2], [-waistW + panel, 0]));
    const flat = (w, y) => { const i = inX(crease + w / 2); return [[i, y], [i - w, y]]; }, [kIn, kOut] = kneeW ? flat(kneeW, kneeY) : [], [hIn, hOut] = flat(hemW, Hy);
    const shown = [[0, 0], [0, rd], ...(kIn ? [kIn] : []), hIn, ...(lift ? [[hIn[0] - hemW * .45, Hy]] : []), ...hemOut(hIn[0], hOut[0]), ...(kOut ? [kOut] : []), [sideX, hipY], ...sideSeen];
    void k; return { sew, shown, crease, ext, kneeY, sideX, hipW, hemW, hIn, hOut, lift };
  };
  const F = leg(false), B = leg(true);
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
  pieces.push(piece('back', 'Back leg', B.sew, { cut: 2, pair: true, grain: [[B.crease, hipY + 2], [B.crease, Hy - 3]], notches: [[B.ext, rd], [B.ext - .5, rd], [-(m.hip / 2 + .5), hipY]], notes: ['Two notches mark the back; dart or seat seam at the waist'], place: { view: 'back', x: 0, y: wb } }));
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
  pieces.push(piece('waistband', elastic ? 'Waistband (elastic channel)' : 'Waistband', rect(r8(m.waist * 2 + (elastic ? 0 : 1.5)), wb * 2), { shown: [[m.waist + .75 - m.waist / 2, 0], [m.waist + .75 + m.waist / 2, 0], [m.waist + .75 + m.waist / 2, wb], [m.waist + .75 - m.waist / 2, wb]], notes: [elastic ? `Elastic ${r8(wb - .25)} in wide${drawcord ? ', drawcord through two eyelets' : ''}` : 'Fused, 1½ in overlap for the button'], place: { view: 'front', x: -m.waist - .75, y: 0, z: 2 } }));
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
  pieces.trims = trims;
  return pieces;
}
function capPieces(S, m, o) {
  const pieces = [];
  if (S.bucket) {
    const C = 23, r = C / (2 * Math.PI), bandH = m.crownHeight + .25, flare = .75, brim = m.brimLength;
    pieces.push(piece('crown', 'Crown top', ellipse(r * 1.08, r * .92, 48), { cut: 2, notes: ['Outer and lining'], place: { view: 'front', x: 0, y: -m.crownHeight, z: 1 } }));
    pieces.push(piece('band', 'Side band', [[0, 0], [C / 2, 0], [C / 2 + flare, bandH], [-flare, bandH]], { cut: 4, notes: ['Two halves, outer and lining'], place: { view: 'front', x: -C / 4, y: -m.crownHeight, z: 0 } }));
    pieces.push(piece('brim', 'Brim', [[0, 0], [C / 2, 0], [C / 2 + 3, brim], [-3, brim]], { cut: 4, notes: ['Two halves, top and under; rows of topstitching every ¼ in'], place: { view: 'front', x: -C / 4, y: 0, z: 2 } }));
    return pieces;
  }
  const C = 22.75 + (m.crownWidth - 8.5) * 2, base = C / 6, ph = m.crownHeight * 1.42;
  const panel = [[-.12, 0], [.12, 0], ...tail(cubic([.12, 0], [base * .36, ph * .2], [base * .52, ph * .6], [base / 2, ph])), [-base / 2, ph], ...tail(cubic([-base / 2, ph], [-base * .52, ph * .6], [-base * .36, ph * .2], [-.12, 0])).slice(0, -1)];
  // on the product every panel hangs from the button at the top of the crown, turned out round it: the fronts a little, the sides further
  const PANELS = [['front', 'Front panel', 'Fused with buckram for structure', 13, 1], ['side', 'Side panel', 'One embroidered eyelet', 38, 0], ['back', 'Back panel', 'The back opening (2¼ × 1½ in) cut from the bottom edge', 13, 1]];
  for (const [id, nm, note, rot, z] of PANELS) {
    const view = id === 'back' ? 'back' : 'front', at = { view, x: 0, y: -ph * .97, z };
    pieces.push(piece(`panel-${id}`, nm, panel, { cut: 2, pair: true, notes: [note], place: { ...at, rot: -rot } }), twin(`panel-${id}-2`, nm, panel, { ...at, rot, flip: true }));
  }
  const bw = m.brimWidth / 2, bl = m.brimLength, inner = C * .19;
  const brim = [...cubic([-inner, 0], [-inner * .4, -.55], [inner * .4, -.55], [inner, 0]), ...tail(cubic([inner, 0], [bw + .4, bl * .25], [bw * .7, bl * 1.05], [0, bl])), ...tail(cubic([0, bl], [-bw * .7, bl * 1.05], [-bw - .4, bl * .25], [-inner, 0])).slice(0, -1)];
  pieces.push(piece('brim', 'Brim', brim, { cut: 2, notes: ['Top and under, over a board insert; 8 rows of stitching'], place: { view: 'front', x: 0, y: .1, z: 3 } }));
  pieces.push(piece('brim-board', 'Brim board', offsetOf(tidy(brim), -.25), { fabric: 'board', cut: 1, notes: ['0.8 mm plastic board'], place: { view: 'front', x: 0, y: .1, z: 2 }, sa: 0 }));
  pieces.push(piece('sweatband', 'Sweatband', rect(r8(C), 1.25), { fabric: 'self', cut: 1, notes: ['Cotton or moisture-wicking tape; the main label sewn at the centre back'], place: { view: 'back', x: -C / 2, y: -.6, z: 2 }, sa: 0 }));
  return pieces;
}
function beaniePieces(m) {
  return [piece('body', 'Knit body', rect(r8(m.width * 2), r8(m.height + m.cuff)), { fabric: 'knit', cut: 1, notes: ['Knitted to shape on a flatbed: 1×1 rib, the crown closed with decreases, linked at the back', `The cuff (${m.cuff} in) turns up`], place: { view: 'front', x: -m.width, y: 0 }, sa: 0 })];
}
function totePieces(m) {
  const w = m.width, H = m.height, hl = r8(m.handleDrop * 2 + 3);
  return [piece('body', 'Body', [[0, 0], [w, 0], [w, H * 2], [0, H * 2]], { cut: 1, notes: ['Folded at the bottom; side seams French-seamed', '1½ in turn-back at the top'], place: { view: 'front', x: -w / 2, y: 0 } }),
    piece('handle', 'Handle', rect(hl, r8(m.handleWidth * 4)), { cut: 2, notes: ['Folded in four and edge-stitched; box-stitched to the body'], place: { view: 'front', x: -w * .45, y: -m.handleDrop, z: 1 } })];
}

// the pattern of a garment, from its flats' params, at one size
export function garmentPattern(p, size = p.size || 'M') {
  const S = STYLES[p.style]; if (!S) return null;
  const K = constructionOf(p), m = measurementsFor(p, size), o = { ...(p.options || {}), template: p.template, K };
  const pieces = S.kind === 'top' ? topPieces(S, m, o, p.style) : S.kind === 'bottom' ? bottomPieces(S, m, o, p.style) : S.kind === 'cap' ? capPieces(S, m, o) : S.kind === 'beanie' ? beaniePieces(m) : totePieces(m), trims = pieces.trims || [];
  const knit = ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'tank', 'bodysuit', 'swimsuit', 'bikini', 'bra', 'leggings', 'beanie'].includes(p.style);
  return { kind: 'garment', style: p.style, label: S.label, size: S.oneSize ? 'One size' : size, sa: knit ? .375 : .5, construction: K, pieces: [...pieces], trims, notes: [knit ? 'Knit: ⅜ in seam allowance, overlocked' : 'Woven: ½ in seam allowance', 'A first block from the measurements: true it up on the first sample'] };
}

// ---- plush ----
// the body types a plush is drafted on (the kit): each takes the parts below, so a fox is a four-legged sitting body with a long snout, pointed
// ears and a bushy tail, a unicorn the same body with a horn and a mane, a whale a sea body with a fluke
export const PLUSH_SHAPES = { bear: 'Standing upright: bear, monkey, bunny on two legs… (head, body, arms, legs)', quad: 'Four-legged, sitting: dog, cat, fox, lion, horse, unicorn, dinosaur…', elephant: 'Elephant (sitting: trunk, big ears, four legs, tail)', sea: 'Sea creature: whale, shark, dolphin, fish…', bean: 'Round: bean character, chick, ghost… (one body, a base)', bunny: 'Bunny (bean body, long ears)', pillow: 'Pillow character (front, back, side gusset)' };
// each body type's name, short, for a label or a sentence
export const PLUSH_TYPE = { bear: 'Bear', quad: 'Four-legged sitting', elephant: 'Elephant', sea: 'Sea creature', bean: 'Bean character', bunny: 'Bunny', pillow: 'Pillow character' };
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
  return { shape: PLUSH_SHAPES[shape] ? shape : 'bear', height: shape === 'pillow' ? 14 : shape === 'sea' ? 16 : 12, ears: shape === 'bunny' ? 'long' : shape === 'pillow' || shape === 'quad' ? 'pointed' : shape === 'elephant' ? 'big' : shape === 'sea' ? 'none' : 'round', arms: shape !== 'pillow' && shape !== 'sea' && shape !== 'quad', legs: ['bear', 'elephant', 'quad'].includes(shape), tail: ['bunny', 'elephant', 'quad', 'sea'].includes(shape), fabric: 'minky', eyes: 'embroidered', age: '0+', fill: 'polyester fibre', depth: shape === 'pillow' ? 3 : 0,
    snout: shape === 'quad' || shape === 'bear' ? 'short' : 'none', horn: 'none', mane: 'none', wings: false, spikes: false, dorsal: shape === 'sea', tailType: shape === 'sea' ? 'fluke' : 'long', head: 1 };
}
export function cleanPlush(input = {}) {
  const d = plushDefaults(PLUSH_SHAPES[input.shape] ? input.shape : 'bear'), num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? r8(Math.min(Math.max(n, lo), hi)) : def; };
  return { shape: d.shape, height: num(input.height, 4, 48, d.height), ears: PLUSH_EARS[input.ears] ? input.ears : d.ears, arms: input.arms == null ? d.arms : Boolean(input.arms), legs: input.legs == null ? d.legs : Boolean(input.legs), tail: input.tail == null ? d.tail : Boolean(input.tail),
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
export function plushPattern(input = {}) {
  const s = cleanPlush(input), h = s.height, pieces = [], notes = [], ears = s.ears !== 'none';
  if (s.shape === 'bear') {
    const hh = h * .42 * s.head, hw = hh * 1.05, bh = h * .44, bw = bh * .78, legH = h * .26, armL = h * .3, mz = s.snout === 'long' ? 1.45 : 1;
    // the head: two sides and a centre gusset from the nose over the crown to the back of the neck
    // a head side is the head in profile, the nose at x = 0: the two sides meet at the nose, either side of the gusset
    const headSide = blob([[0, hh * .6], [hw * .12, hh * .22], [hw * .42, 0], [hw * .62, hh * .28], [hw * .6, hh * .78], [hw * .28, hh * .98], [hw * .06, hh * .84]], .75);
    pieces.push(piece('head-side', 'Head side', headSide, { cut: 2, pair: true, notches: [[0, hh * .6]], notes: ['The nose point meets the gusset'], place: { view: 'front', x: -hw * .1, y: 0, flip: true, z: 2 } }));
    pieces.push(piece('head-side-2', 'Head side', headSide, { cut: 0, place: { view: 'front', x: hw * .1, y: 0, z: 2 } }));
    pieces.push(piece('gusset', 'Head gusset', blob([[0, 0], [hw * .16, hh * .25], [hw * .2, hh * .9], [0, hh * 1.25], [-hw * .2, hh * .9], [-hw * .16, hh * .25]], .9), { cut: 1, notes: ['From the nose over the crown to the back of the neck'], place: { view: 'front', x: 0, y: hh * .05, z: 3 } }));
    if (s.snout !== 'none') pieces.push(piece('muzzle', 'Muzzle', ellipse(hw * .2 * mz, hh * .14 * mz, 32), { cut: 1, fabric: 'contrast', notes: [s.snout === 'long' ? 'A long muzzle: darted to stand out from the face, stuffed firm' : 'Contrast fabric', 'The nose embroidered with satin stitch'], place: { view: 'front', x: 0, y: hh * .66, z: 5 } }));
    const bodyFront = blob([[0, 0], [bw * .32, 0], [bw * .52, bh * .45], [bw * .48, bh * .9], [0, bh]], .7).filter(q => q[0] >= -1e-6);
    pieces.push(piece('body-front', 'Body front', [...bodyFront], { cut: 2, pair: true, notes: ['Centre-front seam'], place: { view: 'front', x: 0, y: hh * .92, z: 1 } }), piece('body-front-2', 'Body front', bodyFront, { cut: 0, place: { view: 'front', x: 0, y: hh * .92, flip: true, z: 1 }, hidden: true }));
    const bodyBack = bodyFront.map(([x, y]) => [x * 1.06, y]);
    pieces.push(piece('body-back', 'Body back', bodyBack, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, h * .22))} in opening in the centre-back seam to stuff, closed by hand with a ladder stitch`], place: { view: 'back', x: 0, y: hh * .92 } }), piece('body-back-2', 'Body back', bodyBack, { cut: 0, place: { view: 'back', x: 0, y: hh * .92, flip: true } }));
    if (s.arms) { const arm = blob([[0, 0], [armL * .32, 0], [armL * .36, armL * .78], [armL * .18, armL], [-armL * .02, armL * .8]], .8); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'arm' : 'arm-2', 'Arm', arm, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two pairs: inner and outer'] : [], place: { view: 'front', x: sg * bw * .42, y: hh * 1.02, rot: sg * -28, flip: sg < 0, z: 4 }, hidden: sg < 0 })); }
    if (s.legs) { const leg = blob([[0, 0], [legH * .45, 0], [legH * .5, legH * .7], [legH * .75, legH], [0, legH]], .8); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'leg' : 'leg-2', 'Leg', leg, { cut: sg > 0 ? 4 : 0, pair: true, place: { view: 'front', x: sg * bw * .08 + (sg < 0 ? -legH * .75 : 0), y: hh * .92 + bh * .78, flip: sg < 0, z: 5 }, hidden: sg < 0 }));
      pieces.push(piece('foot-pad', 'Foot pad', ellipse(legH * .28, legH * .2, 28), { cut: 2, fabric: 'contrast', notes: ['Contrast, set into the bottom of each leg'], place: { view: 'back', x: 0, y: h * .96, z: 3 } })); }
    if (ears) { const ew = hh * (s.ears === 'long' ? .22 : .32), ear = earOf(s.ears, ew); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two outer, two inner (inner in contrast if you like)', 'Set into a slit in the head side, or sewn on by hand'] : [], place: { view: 'front', x: sg * hw * .42, y: s.ears === 'long' ? -ew * 2.5 : -ew * .5, rot: sg * 12, z: 1 }, hidden: sg < 0 })); }
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, about ${r8(hh * .3)} in apart, on the line ${r8(hh * .52)} in below the top of the head`);
  } else if (s.shape === 'elephant') {
    // a sitting elephant: the head in two sides with a gusset from the brow over the crown, the trunk cut in one with the head sides (their
    // front edges join down its underside, the gusset runs down its top); big ears in self, lined in contrast; a body in two sides and an
    // underbody gusset; four legs, each in two, on contrast foot pads; a tail with a tuft
    const hh = h * .46, hw = hh, tr = h * .34, bh = h * .58, bw = h * .62, legF = h * .3, legH = h * .22;
    const headSide = blob([[0, hh * .5], [hw * .1, hh * .16], [hw * .4, 0], [hw * .66, hh * .14], [hw * .72, hh * .5], [hw * .5, hh * .86], [hw * .22, hh * .9], [hw * .1, hh * .9 + tr * .5], [hw * .06, hh * .9 + tr], [-hw * .1, hh * .9 + tr * .98], [-hw * .02, hh * .9 + tr * .5], [-hw * .04, hh * .78]], .7);
    pieces.push(piece('head-side', 'Head side and trunk', headSide, { cut: 2, pair: true, notches: [[0, hh * .5], [-hw * .04, hh * .78]], notes: ['Cut in one with the trunk: the two sides meet down the underside of the trunk', 'Notches: where the gusset starts, where the trunk leaves the face'], place: { view: 'front', x: -hw * .08, y: 0, flip: true, z: 3 } }));
    pieces.push(piece('head-side-2', 'Head side and trunk', headSide, { cut: 0, place: { view: 'front', x: hw * .08, y: 0, z: 3 }, hidden: true }));
    pieces.push(piece('gusset', 'Head and trunk gusset', blob([[0, 0], [hw * .2, hh * .3], [hw * .22, hh * .8], [hw * .1, hh + tr * .6], [0, hh + tr * .95], [-hw * .1, hh + tr * .6], [-hw * .22, hh * .8], [-hw * .2, hh * .3]], .9), { cut: 1, notes: ['From the back of the head over the crown, down the brow and the top of the trunk to its tip'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
    const earW = hw * .9, ear = blob([[0, 0], [earW * .42, -earW * .12], [earW * .78, earW * .12], [earW * .82, earW * .62], [earW * .5, earW * 1.02], [earW * .12, earW * .9], [-earW * .04, earW * .5]], .85);
    for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: sg > 0 ? 2 : 0, pair: true, notes: sg > 0 ? ['Two in self (the backs)'] : [], place: { view: 'front', x: sg * hw * .42 + (sg < 0 ? -earW * .8 : 0), y: hh * .12, flip: sg < 0, z: 1 }, hidden: sg < 0 }));
    pieces.push(piece('ear-lining', 'Ear lining', ear.map(([x, y]) => [x * .96, y * .96]), { cut: 2, pair: true, fabric: 'contrast', notes: ['Contrast: the face of each ear; sewn to the back right sides together, turned, topstitched, then pleated into the head side seam'], place: { view: 'front', x: hw * .45, y: hh * .14, z: 2 }, hidden: true }));
    const bodySide = blob([[0, 0], [bw * .3, -bh * .02], [bw * .62, bh * .2], [bw * .74, bh * .6], [bw * .62, bh * .96], [bw * .2, bh], [-bw * .02, bh * .7], [-bw * .06, bh * .3]], .8);
    pieces.push(piece('body-side', 'Body side', bodySide, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, h * .2))} in opening in the back seam to stuff, closed by hand with a ladder stitch`], place: { view: 'back', x: -bw * .36, y: hh * .74, z: 1 } }));
    pieces.push(piece('underbody', 'Underbody gusset', blob([[0, 0], [bw * .16, bh * .08], [bw * .2, bh * .7], [0, bh * .82], [-bw * .2, bh * .7], [-bw * .16, bh * .08]], .9), { cut: 1, notes: ['From the chest between the front legs to the seat'], place: { view: 'front', x: 0, y: hh * .82, z: 1 } }));
    const legFr = blob([[0, 0], [legF * .44, 0], [legF * .48, legF], [-legF * .04, legF]], .6), legHi = blob([[0, 0], [legH * .6, -legH * .1], [legH * .8, legH * .7], [legH * .1, legH * .8]], .7);
    for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'leg-front' : 'leg-front-2', 'Front leg', legFr, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two pairs: inner and outer, the pad set in at the bottom'] : [], place: { view: 'front', x: sg * bw * .14 + (sg < 0 ? -legF * .44 : 0), y: h - legF, flip: sg < 0, z: 5 }, hidden: sg < 0 }));
    for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'leg-hind' : 'leg-hind-2', 'Hind leg', legHi, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two pairs; sewn to the body side at the haunch, the foot turned forward'] : [], place: { view: 'front', x: sg * bw * .36 + (sg < 0 ? -legH * .8 : 0), y: h - legH * .8, flip: sg < 0, z: 4 }, hidden: sg < 0 }));
    pieces.push(piece('foot-pad', 'Foot pad', ellipse(legF * .2, legF * .17, 28), { cut: 4, fabric: 'contrast', notes: ['Contrast, one in the bottom of each leg'], place: { view: 'back', x: 0, y: h * .96, z: 3 } }));
    if (s.tail) pieces.push(piece('tail', 'Tail', blob([[0, 0], [h * .03, 0], [h * .025, h * .16], [0, h * .16]], .4), { cut: 2, notes: ['Two strips, sewn and turned; the tuft is yarn knotted into the tip, sewn into the back seam'], place: { view: 'back', x: 0, y: hh * .74 + bh * .72, z: 2 } }));
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, about ${r8(hw * .44)} in apart, ${r8(hh * .45)} in below the top of the head, either side of the trunk`, 'The ears are the character: interfacing in the ear backs keeps them standing out from the head');
  } else if (s.shape === 'quad') {
    // four-legged, sitting (src/lab-plush-views.js draws it): the head in two sides and a gusset, the snout cut in one with the sides (their
    // front edges join under the chin), a nose in contrast; the body, legs and pads as the elephant's; the ears, tail and parts the kit asks for
    const hh = h * .42 * s.head, hw = hh, bh = h * .58, bw = h * .62, legF = h * .32, legH = h * .22, sl = { none: 0, short: .14, long: .32, broad: .3 }[s.snout] * hh;
    const headSide = blob(sl ? [[0, hh * .42], [hw * .12, hh * .12], [hw * .42, 0], [hw * .68, hh * .18], [hw * .72, hh * .55], [hw * .5, hh * .9], [hw * .2, hh * .94], [-sl * .7, hh * .82], [-sl, hh * .66], [-sl * .85, hh * .52]]
      : [[0, hh * .42], [hw * .12, hh * .12], [hw * .42, 0], [hw * .68, hh * .18], [hw * .72, hh * .55], [hw * .5, hh * .9], [hw * .2, hh * .94], [-hw * .02, hh * .72]], .75);
    pieces.push(piece('head-side', sl ? 'Head side and snout' : 'Head side', headSide, { cut: 2, pair: true, notches: [[0, hh * .42]], notes: [sl ? 'Cut in one with the snout: the two sides meet under the chin and the snout' : 'The two sides meet under the chin', 'Notch: where the gusset starts'], place: { view: 'front', x: -hw * .08, y: 0, flip: true, z: 3 } }));
    pieces.push(piece('head-side-2', sl ? 'Head side and snout' : 'Head side', headSide, { cut: 0, place: { view: 'front', x: hw * .08, y: 0, z: 3 }, hidden: true }));
    pieces.push(piece('gusset', 'Head gusset', blob([[0, 0], [hw * .18, hh * .3], [hw * .2, hh * .8], [hw * .08, hh + sl * .9], [0, hh + sl], [-hw * .08, hh + sl * .9], [-hw * .2, hh * .8], [-hw * .18, hh * .3]], .9), { cut: 1, notes: [`From the back of the head over the crown${sl ? ' and down the top of the snout to the nose' : ' to the brow'}`], place: { view: 'front', x: 0, y: 0, z: 4 } }));
    if (sl) pieces.push(piece('nose', 'Nose', ellipse(hw * .09, hw * .065, 24), { cut: 1, fabric: 'contrast', notes: ['Felt or leather, appliquéd on the tip of the snout before it is closed (or embroidered, satin stitch)'], place: { view: 'front', x: 0, y: hh * .62, z: 6 } }));
    const bodySide = blob([[0, 0], [bw * .3, -bh * .02], [bw * .62, bh * .2], [bw * .74, bh * .6], [bw * .62, bh * .96], [bw * .2, bh], [-bw * .02, bh * .7], [-bw * .06, bh * .3]], .8);
    pieces.push(piece('body-side', 'Body side', bodySide, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, h * .2))} in opening in the back seam to stuff, closed by hand with a ladder stitch`], place: { view: 'back', x: -bw * .36, y: hh * .74, z: 1 } }));
    pieces.push(piece('underbody', 'Underbody gusset', blob([[0, 0], [bw * .16, bh * .08], [bw * .2, bh * .7], [0, bh * .82], [-bw * .2, bh * .7], [-bw * .16, bh * .08]], .9), { cut: 1, notes: ['From the chest between the front legs to the seat'], place: { view: 'front', x: 0, y: hh * .82, z: 1 } }));
    const legFr = blob([[0, 0], [legF * .4, 0], [legF * .44, legF], [-legF * .04, legF]], .6), legHi = blob([[0, 0], [legH * .6, -legH * .1], [legH * .8, legH * .7], [legH * .1, legH * .8]], .7);
    for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'leg-front' : 'leg-front-2', 'Front leg', legFr, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two pairs: inner and outer, the pad set in at the bottom'] : [], place: { view: 'front', x: sg * bw * .14 + (sg < 0 ? -legF * .4 : 0), y: h - legF, flip: sg < 0, z: 5 }, hidden: sg < 0 }));
    for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'leg-hind' : 'leg-hind-2', 'Hind leg', legHi, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two pairs; sewn to the body side at the haunch, the foot turned forward'] : [], place: { view: 'front', x: sg * bw * .36 + (sg < 0 ? -legH * .8 : 0), y: h - legH * .8, flip: sg < 0, z: 4 }, hidden: sg < 0 }));
    pieces.push(piece('foot-pad', 'Foot pad', ellipse(legF * .18, legF * .15, 28), { cut: 4, fabric: 'contrast', notes: ['Contrast, one in the bottom of each leg'], place: { view: 'back', x: 0, y: h * .96, z: 3 } }));
    if (ears) { const ew = hh * (s.ears === 'long' ? .2 : s.ears === 'big' ? .5 : s.ears === 'floppy' ? .3 : .28), ear = earOf(s.ears, ew); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two outer in self, two inner in contrast', 'Set into the head side seam either side of the gusset'] : [], place: { view: 'front', x: sg * hw * .38, y: s.ears === 'floppy' ? hh * .2 : -ew * .6, rot: sg * 10, flip: sg < 0, z: 2 }, hidden: sg < 0 })); }
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, about ${r8(hw * .42)} in apart, ${r8(hh * .4)} in below the top of the head${sl ? ', above the snout' : ''}`);
  } else if (s.shape === 'sea') {
    // a sea creature, its length the size: two body sides from the nose to the tail stock, a belly gusset in contrast, the fins and tail in two
    // each (stitched, turned and topstitched so they stand flat); the size given is its length, nose to tail
    const L = h, bh = L * .42, bw = L * .36;
    const side = blob([[0, bh * .52], [L * .12, bh * .1], [L * .4, 0], [L * .66, bh * .14], [L * .82, bh * .36], [L * .84, bh * .55], [L * .66, bh * .78], [L * .4, bh * .9], [L * .14, bh * .86]], .8);
    pieces.push(piece('body-side', 'Body side', side, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, L * .16))} in opening in the top seam to stuff, closed by hand with a ladder stitch`], place: { view: 'front', x: -L * .42, y: 0, z: 2 } }));
    pieces.push(piece('belly', 'Belly gusset', blob([[0, 0], [bw * .3, L * .06], [bw * .36, L * .4], [bw * .2, L * .72], [0, L * .8], [-bw * .2, L * .72], [-bw * .36, L * .4], [-bw * .3, L * .06]], .9), { cut: 1, fabric: 'contrast', notes: ['Contrast: the pale underside, from under the chin to the tail stock'], place: { view: 'back', x: 0, y: 0, z: 1 } }));
    const fin = blob([[0, 0], [L * .1, L * .02], [L * .2, L * .1], [L * .06, L * .1]], .7);
    for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'fin' : 'fin-2', 'Side fin', fin, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two pairs, sewn, turned, topstitched; set into the body side seam'] : [], place: { view: 'front', x: sg * bw * .5 + (sg < 0 ? -L * .2 : 0), y: bh * .7, flip: sg < 0, z: 4 }, hidden: sg < 0 }));
    if (s.dorsal) pieces.push(piece('dorsal', 'Dorsal fin', blob([[0, 0], [L * .14, 0], [L * .1, -L * .1], [L * .02, -L * .12]], .6), { cut: 2, notes: ['Sewn, turned and stuffed lightly; set into the top seam'], place: { view: 'front', x: -L * .02, y: 0, z: 1 } }));
    if (s.tail) pieces.push(piece('tail', s.tailType === 'fin' ? 'Tail fin' : 'Tail fluke', s.tailType === 'fin' ? blob([[0, 0], [L * .14, -L * .12], [L * .1, 0], [L * .14, L * .12]], .5) : blob([[0, 0], [L * .1, -L * .16], [L * .14, -L * .14], [L * .06, 0], [L * .14, L * .14], [L * .1, L * .16]], .5), { cut: 2, notes: [s.tailType === 'fin' ? 'Upright, as a fish\'s or a shark\'s: sewn, turned, stuffed lightly, set into the tail stock' : 'Flat, as a whale\'s or a dolphin\'s: sewn, turned, topstitched, set across the tail stock'], place: { view: 'front', x: L * .4, y: bh * .36, z: 1 } }));
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, one either side of the head, ${r8(L * .14)} in back from the nose`, `The size is its length: ${r8(L)} in from the nose to the tail`);
  } else if (s.shape === 'pillow') {
    const w = h * .82, front = blob([[0, 0], [w * .45, h * .05], [w * .5, h * .55], [w * .3, h], [-w * .3, h], [-w * .5, h * .55], [-w * .45, h * .05]], .85);
    pieces.push(piece('front', 'Front', front, { cut: 1, notes: ['The face is embroidered before sewing'], place: { view: 'front', x: 0, y: 0, z: 2 } }));
    pieces.push(piece('back', 'Back', front, { cut: 1, notes: [`Opening of ${r8(Math.max(3, h * .25))} in in the bottom seam to stuff`], place: { view: 'back', x: 0, y: 0 } }));
    pieces.push(piece('gusset', 'Side gusset', rect(r8(lenOf([...tidy(front), tidy(front)[0]]) + .5), s.depth), { cut: 1, notes: [`${s.depth} in deep, joined at the bottom`], place: { view: 'front', x: -w * .5, y: h + .5, z: 0 } }));
    if (ears) { const ew = h * .22, ear = earOf(s.ears, ew); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: sg > 0 ? 4 : 0, pair: true, place: { view: 'front', x: sg * w * .3, y: -ew * .55, rot: sg * 10, z: 1 }, hidden: sg < 0 })); }
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}`);
  } else {
    // bean and bunny: one front, a back in two halves (the seam takes the opening), an oval base
    const w = h * .7, front = blob([[0, 0], [w * .34, h * .04], [w * .5, h * .4], [w * .46, h * .86], [w * .2, h], [-w * .2, h], [-w * .46, h * .86], [-w * .5, h * .4], [-w * .34, h * .04]], .85);
    pieces.push(piece('front', 'Front', front, { cut: 1, notes: ['The face is embroidered before sewing'], place: { view: 'front', x: 0, y: 0, z: 2 } }));
    const backHalf = front.filter(q => q[0] >= -1e-6);
    pieces.push(piece('back', 'Back', backHalf, { cut: 2, pair: true, notes: [`Opening of ${r8(Math.max(2.5, h * .22))} in in the centre-back seam to stuff`], place: { view: 'back', x: 0, y: 0 } }), piece('back-2', 'Back', backHalf, { cut: 0, place: { view: 'back', x: 0, y: 0, flip: true } }));
    pieces.push(piece('base', 'Base', ellipse(w * .4, w * .26, 40), { cut: 1, notes: ['Optionally a weighted pouch of polypellets sewn inside (3 years and up only)'], place: { view: 'back', x: 0, y: h, z: 1 } }));
    if (s.arms) { const arm = blob([[0, 0], [h * .1, h * .02], [h * .12, h * .16], [0, h * .2], [-h * .04, h * .1]], .9); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'arm' : 'arm-2', 'Arm nub', arm, { cut: sg > 0 ? 4 : 0, pair: true, place: { view: 'front', x: sg * w * .5 + (sg < 0 ? -h * .1 : 0), y: h * .48, rot: sg * -20, flip: sg < 0, z: 3 }, hidden: sg < 0 })); }
    if (ears) { const ew = h * (s.ears === 'long' ? .13 : .2), ear = earOf(s.ears, ew); for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'ear' : 'ear-2', 'Ear', ear, { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Outer in self, inner in contrast'] : [], place: { view: 'front', x: sg * w * .22, y: s.ears === 'long' ? -ew * 2.6 : -ew * .6, rot: sg * 8, z: 1 }, hidden: sg < 0 })); }
    if (s.tail) pieces.push(piece('tail', 'Tail', ellipse(h * .07, h * .07, 24), { cut: 1, fabric: 'contrast', notes: ['A gathered circle, stuffed'], place: { view: 'back', x: 0, y: h * .78, z: 2 } }));
    notes.push(`Face: ${PLUSH_EYES[s.eyes]}, about ${r8(w * .28)} in apart, ${r8(h * .38)} in below the top`);
  }
  // the kit's parts on the body types that take them (PLUSH_PARTS)
  const takes = k => PLUSH_PARTS[k].includes(s.shape), top = s.shape === 'sea' ? 0 : 0;
  if (takes('horn') && s.horn === 'one') pieces.push(piece('horn', 'Horn', blob([[0, 0], [h * .05, h * .16], [-h * .05, h * .16]], .3).map(([x, y]) => [x, y - h * .16]), { cut: 1, fabric: 'contrast', notes: ['Rolled into a cone and stuffed firm; a spiral of stitching wound up it; sewn into the gusset seam at the brow'], place: { view: 'front', x: 0, y: top - h * .02, z: 7 } }));
  if (takes('horn') && s.horn === 'two') for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'horn' : 'horn-2', 'Horn', blob([[0, 0], [h * .04, h * .1], [-h * .03, h * .1]], .4).map(([x, y]) => [x, y - h * .1]), { cut: sg > 0 ? 4 : 0, pair: true, fabric: 'contrast', notes: sg > 0 ? ['Two pairs: sewn, turned, stuffed firm; set into the head side seams'] : [], place: { view: 'front', x: sg * h * .08, y: top, rot: sg * 15, flip: sg < 0, z: 7 }, hidden: sg < 0 }));
  if (takes('horn') && s.horn === 'antlers') for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'antler' : 'antler-2', 'Antler', blob([[0, 0], [h * .03, 0], [h * .04, -h * .1], [h * .1, -h * .14], [h * .09, -h * .17], [h * .03, -h * .13], [h * .01, -h * .22], [-h * .02, -h * .21], [-h * .01, -h * .1]], .3), { cut: sg > 0 ? 4 : 0, pair: true, fabric: 'contrast', notes: sg > 0 ? ['Two pairs, interfaced so they stand: sewn, turned, stuffed with a pipe-cleaner-free firm fill, set into the head side seams'] : [], place: { view: 'front', x: sg * h * .1, y: top, flip: sg < 0, z: 7 }, hidden: sg < 0 }));
  if (takes('mane') && s.mane !== 'none') pieces.push(piece('mane', 'Mane', rect(r8(s.mane === 'ruff' ? h * .9 : h * .55), r8(h * .14)), { cut: 1, fabric: 'contrast', notes: [s.mane === 'ruff' ? 'Long-pile faux fur, the pile running away from the face: folded in half along its length and sewn into the seam round the face; brushed out after turning' : 'Long-pile faux fur (or yarn loops), folded in half along its length and sewn into the gusset seam from between the ears down the back of the neck; brushed out after turning'], place: { view: 'back', x: -h * .35, y: h * .05, z: 0 } }));
  if (takes('wings') && s.wings) for (const sg of [1, -1]) pieces.push(piece(sg > 0 ? 'wing' : 'wing-2', 'Wing', blob([[0, 0], [h * .22, -h * .1], [h * .3, h * .02], [h * .22, h * .1], [h * .12, h * .12], [h * .04, h * .1]], .6), { cut: sg > 0 ? 4 : 0, pair: true, notes: sg > 0 ? ['Two in self, two lined in contrast: sewn, turned, the feathers topstitched; interfaced so they stand; sewn to the back by hand'] : [], place: { view: 'back', x: sg * h * .12 + (sg < 0 ? -h * .3 : 0), y: h * .48, flip: sg < 0, z: 3 }, hidden: sg < 0 }));
  if (takes('spikes') && s.spikes) pieces.push(piece('spikes', 'Spikes', [[0, 0], ...Array.from({ length: 7 }, (_, i) => [[(i + .5) * h * .1, -h * .07], [(i + 1) * h * .1, 0]]).flat(), [h * .7, h * .03], [0, h * .03]], { cut: 2, fabric: 'contrast', notes: ['Sewn, turned and stuffed lightly, then set into the back seam (or the top of the gusset) from the head to the tail'], place: { view: 'back', x: -h * .35, y: h * .1, z: 4 } }));
  if (takes('tailType') && s.shape === 'quad' && s.tail) {
    const t = s.tailType === 'bushy' ? blob([[0, 0], [h * .07, -h * .02], [h * .1, h * .14], [h * .05, h * .32], [-h * .03, h * .28], [-h * .04, h * .1]], .8)
      : s.tailType === 'short' ? ellipse(h * .05, h * .06, 24) : s.tailType === 'hair' ? rect(r8(h * .1), r8(h * .3)) : blob([[0, 0], [h * .03, 0], [h * .028, s.tailType === 'tuft' ? h * .22 : h * .34], [0, s.tailType === 'tuft' ? h * .22 : h * .34]], .4);
    pieces.push(piece('tail', 'Tail', t, { cut: s.tailType === 'hair' ? 1 : 2, ...(s.tailType === 'hair' ? { fabric: 'contrast' } : {}), notes: [s.tailType === 'hair' ? 'Long-pile faux fur (or yarn), in the mane\'s colour: rolled and sewn into the back seam, brushed out' : s.tailType === 'bushy' ? 'Two pieces, the pile brushed long; the tip in contrast if you like; sewn into the back seam' : s.tailType === 'tuft' ? 'Two strips, sewn and turned; the tuft is yarn knotted into the tip; sewn into the back seam' : s.tailType === 'short' ? 'A stub: two pieces, sewn, turned, stuffed' : 'Two strips, sewn and turned, a pipe of fill down it; sewn into the back seam'], place: { view: 'back', x: 0, y: h * .75, z: 2 } }));
  }
  const firm = PLUSH_FIRM.includes(s.fabric);
  for (const q of pieces) if (q.fabric === 'self') q.fabric = firm ? 'leather' : 'pile';
  notes.push(...(firm ? [`${PLUSH_FABRICS[s.fabric]}: it does not stretch, so the pieces are eased and the curves notched; cut each piece from sound skin, the grain running down the toy`, '⅜ in seam allowance, sewn at 8–9 stitches an inch with a leather needle and bonded nylon thread; seams pressed open with a roller, not an iron', 'Stuffed firm and slowly: leather shows every lump']
    : [`${PLUSH_FABRICS[s.fabric]}: the pile runs down the grain arrow`, '¼ in seam allowance, sewn at 10–12 stitches an inch, backstitched at the opening']));
  return { kind: 'plush', spec: s, label: s.animal && !PLUSH_TYPE[s.shape].toLowerCase().startsWith(s.animal) ? `${s.animal[0].toUpperCase()}${s.animal.slice(1)} · ${PLUSH_TYPE[s.shape].toLowerCase()} body` : PLUSH_TYPE[s.shape], size: s.shape === 'sea' ? `${s.height} in long` : `${s.height} in tall`, sa: firm ? .375 : .25, pieces, notes, checks: plushChecks(s, pieces) };
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
  const area = front.reduce((s, q) => s + areaOf(q.sew) * (q.pair && !q.fold ? 2 : 1), 0) * .78, depth = pat.spec.shape === 'pillow' ? pat.spec.depth : pat.spec.height * .42;
  return Math.round(area * depth * .66 * .55); // ~0.55 g a cubic inch, firmly stuffed polyester fibre
}

// ---- the views ----
// where a piece sits on the product (its own coordinates turned and moved onto the front or back view)
export function placed(q, pts = q.shown || q.sew) { const pl = q.place || {}, a = (pl.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => { const xx = pl.flip ? -x : x; return [pl.x + xx * c - y * s, pl.y + xx * s + y * c]; }); }
// the cutting layout: pieces (each cut it takes, pairs flipped) packed in rows across the fabric width, by fabric; → [{ fabric, width, length, items:[{piece, n, x, y, flip}] }]
export function layoutOf(pat, { width = 58, widths = {}, sa = pat.sa, gap = .4 } = {}) { // `widths`: a cloth's own width, by the cloth (from the material on its part)
  const groups = new Map();
  for (const q of pat.pieces) { if (!q.cut) continue; // every piece cut, shown on the product or not (an ear lining, a pad under the foot)
    const cutl = offsetOf(q.sew, q.sa ?? sa), b = boundsOf(cutl); const g = groups.get(q.fabric) || []; for (let n = 0; n < q.cut; n++) g.push({ piece: q, n, flip: q.pair && n % 2 === 1, b }); groups.set(q.fabric, g); }
  const out = [];
  for (const [fabric, items] of groups) {
    items.sort((a, b) => b.b.h - a.b.h); let x = 0, y = 0, rowH = 0; const W = Math.max(Number(widths[fabric]) > 10 ? Number(widths[fabric]) : width, ...items.map(i => i.b.w + gap * 2));
    for (const it of items) { if (x + it.b.w > W) { x = 0; y += rowH + gap; rowH = 0; } it.x = x - it.b.x0; it.y = y - it.b.y0; x += it.b.w + gap; rowH = Math.max(rowH, it.b.h); }
    const length = y + rowH, used = items.reduce((s, it) => s + areaOf(offsetOf(it.piece.sew, it.piece.sa ?? sa)), 0);
    out.push({ fabric, name: fabricName(fabric), width: W, length: r8(length), yards: Math.round(length / 36 * 100) / 100, efficiency: Math.round(used / (W * Math.max(length, 1)) * 100), items });
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
  const H = m.rise + m.inseam, rows = [['hip', 'Hip, across', L.hip, across(wb + Math.min(7.5, (m.rise - wb) * .7))], ['thigh', 'Thigh, one leg', L.thigh, leg(m.rise + 1.5)], ...(L.knee ? [['knee', 'Knee, one leg', L.knee, leg(m.rise + m.inseam * .48)]] : []), ['hem', 'Hem, one leg', L.hem, leg(H - 2)]]
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
    list.push({ q, src, layer, n: it.n, tgt: q.sew.map(([x, y]) => [(it.flip ? -x + (it.b.x0 + it.b.x1) : x) + it.x + lx, y + it.y + goff.get(g)]) });
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
      const q = it.piece, tf = pts => pts.map(([x, y]) => [(it.flip ? -x + 0 : x) + it.x + (it.flip ? (it.b.x0 + it.b.x1) : 0), y + it.y + y0]);
      const sew = tf(q.sew), cutl = tf(offsetOf(q.sew, q.sa ?? sa)), gr = tf(q.grain), bb = boundsOf(sew), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      body += `<path d="${P(cutl)}" fill="#fff" stroke="#141416" stroke-width=".03"/><path d="${P(sew)}" fill="none" stroke="#141416" stroke-width=".02" stroke-dasharray=".18 .1"/>`;
      body += `<path d="M${r3(gr[0][0])} ${r3(gr[0][1])} L${r3(gr[1][0])} ${r3(gr[1][1])}" stroke="#17603a" stroke-width=".03" marker-start="url(#ga)" marker-end="url(#ga)"/>`;
      for (const n of tf(q.notches)) body += `<circle cx="${r3(n[0])}" cy="${r3(n[1])}" r=".09" fill="#141416"/>`;
      if (q.fold) body += `<path d="M${r3(it.x)} ${r3(bb.y0)} L${r3(it.x)} ${r3(bb.y1)}" stroke="#c8202a" stroke-width=".03" stroke-dasharray=".3 .15"/>`;
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
      const q = it.piece, tf = pts => pts.map(([x, y]) => [(it.flip ? -x + (it.b.x0 + it.b.x1) : x) + it.x, y + it.y + y0]);
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
      const cb = boundsOf(cutl), [ix, iy] = P([it.x, it.y + y0 + gy.get(g)]);
      d.insert(name, ix, iy, { x0: cb.x0 * k, x1: cb.x1 * k, y0: -cb.y1 * k, y1: -cb.y0 * k }, '1');
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
