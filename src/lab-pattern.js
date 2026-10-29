// Design Lab patterns: a piece as the pattern pieces it is cut from. Garments are drafted from the flats' own measurements (src/lab-flats.js),
// so the pattern grades with the size run. Plush is drafted from a few choices (the shape, the height, the ears, the limbs). Every piece has a
// sew line, a seam allowance, a grain line, notches, how many to cut and from what. Each piece also knows where it sits on the product
// (for the exploded view, which lifts the pieces off the product and lays them out flat) and where it goes in the cutting layout.
// The same file runs in the page (served as /lab/pattern.js) and on the service (the DXF and the SVG), so it uses neither the DOM nor Node.
// All lengths are inches; y runs down. A pattern from here is a first block from the measurements: a pattern maker trues it up on the sample.
import { STYLES, measurementsFor, SIZES } from './lab-flats.js';
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
const FABRIC_NAMES = { self: 'Self (main fabric)', rib: 'Rib', lining: 'Lining', fusing: 'Fusing', pocketing: 'Pocketing', board: 'Board', knit: 'Knit (to shape)', pile: 'Plush pile', leather: 'Leather', felt: 'Felt', contrast: 'Contrast', upper: 'Upper', overlay: 'Overlays', foam: 'Foam', elastic: 'Elastic gore', stiffener: 'Stiffener (thermoplastic)', rubber: 'Rubber (moulded)', eva: 'EVA (moulded)' };
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
function topPieces(S, m, o, style) {
  const half = m.chest / 2, nw = m.neckWidth / 2, drop = o.drop ? 2.25 : 0, sh = Math.max(m.shoulder / 2, nw + 2), slope = o.drop ? .75 : 1.25;
  const L = m.length - (m.hemRib || 0), SP = [sh, slope], UA = [half, slope + m.armhole + drop * .3], depth = UA[1] - SP[1];
  const neck = nd => cubic([0, nd], [nw * .55, nd], [nw, nd * .65], [nw, 0]);
  const armhole = cubic(SP, [SP[0] - .35, SP[1] + depth * .5], [UA[0] - 1.1, UA[1] - .1], UA);
  // half the body, from the centre-front neck round to the centre-front hem; the whole body is it and its mirror
  const halfOf = (nd, ext = 0) => [[-ext, nd], ...neck(nd), [SP[0], SP[1]], ...tail(armhole), [half, L], [-ext, L]];
  const whole = nd => { const h = halfOf(nd); return [...h, ...mirrorX(h).reverse()]; };
  const pieces = [], open = S.zip || ['shirt', 'shirtss', 'jacket', 'coat', 'vest'].includes(style);
  const ext = ['shirt', 'shirtss', 'coat'].includes(style) ? .75 : 0; // the button stand past the centre front
  if (open) {
    const sew = halfOf(m.neckDropFront, ext), note = ext ? `Button stand ${ext} in past the centre front, fused` : S.zip ? 'Zip set at the centre front' : 'Opens at the centre front';
    pieces.push(piece('front', 'Front', sew, { cut: 2, pair: true, notches: [[half, UA[1] + 2]], notes: [note], place: { view: 'front', x: 0, y: 0 } }), twin('front-2', 'Front', sew, { view: 'front', flip: true }));
  } else pieces.push(piece('front', 'Front', whole(m.neckDropFront), { cut: 1, fold: true, notches: [[half, UA[1] + 2], [-half, UA[1] + 2]], place: { view: 'front' } }));
  if (style === 'shirt' || style === 'shirtss') {
    const yokeY = SP[1] + 2.75, nb = neck(m.neckDropBack);
    const lower = whole(m.neckDropBack).map(([x, y]) => [x, Math.max(y, yokeY)]);
    pieces.push(piece('back', 'Back', lower, { cut: 1, fold: true, notes: ['Box pleat or two side pleats at the yoke seam'], place: { view: 'back' } }));
    pieces.push(piece('yoke', 'Back yoke', [[-SP[0], SP[1]], ...mirrorX(nb).reverse(), ...tail(nb), [SP[0], SP[1]], [SP[0] + .1, yokeY], [-SP[0] - .1, yokeY]], { cut: 2, fold: true, notes: ['Inside and outside yoke'], place: { view: 'back', z: 1 } }));
  } else pieces.push(piece('back', 'Back', whole(m.neckDropBack), { cut: 1, fold: true, notches: [[half, UA[1] + 2], [-half, UA[1] + 2], [half, UA[1] + 2.5]], place: { view: 'back' } }));
  // the sleeve: its cap eases into the armhole; a dropped shoulder has a flatter cap
  if (m.sleeve > 0) {
    const A = lenOf(armhole), ch = o.drop ? Math.max(1.5, depth * .28) : Math.max(2.5, depth * .55), b = Math.sqrt(Math.max(((A + .25) / 1.04) ** 2 - ch * ch, 4)), Ls = Math.max(m.sleeve - (m.cuffRib || 0), 2), so = Math.min(Math.max(m.sleeveOpening, 2), b);
    const capR = cubic([0, 0], [b * .45, 0], [b * .72, ch * .55], [b, ch]), sew = [...mirrorX(capR).reverse(), ...tail(capR), [so, Ls], [-so, Ls]];
    const ang = (o.drop ? 62 : m.sleeve > 12 ? 62 : 24) * Math.PI / 180;
    // where the sleeve sits on the front flat: the top of the cap at the shoulder point, the underarm corner at the underarm, so it hangs from
    // the armhole the way the flats draw it (of the two ways round, the one whose cuff points out and down)
    const tgt = Math.atan2(UA[1] - SP[1], UA[0] - SP[0]), turn = sx => { const a = tgt - Math.atan2(ch, sx * b), c = Math.cos(a), sn = Math.sin(a); return { a, end: [-Ls * sn, Ls * c] }; };
    const best = [turn(1), turn(-1)].filter(t => t.end[0] > 0 && t.end[1] > -1).sort((x, y) => Math.abs(Math.atan2(x.end[1], x.end[0]) - ang) - Math.abs(Math.atan2(y.end[1], y.end[0]) - ang))[0] || turn(1), rot = best.a * 180 / Math.PI;
    pieces.push(piece('sleeve', 'Sleeve', sew, { cut: 2, pair: true, notches: [[b * .55, ch * .3], [-b * .5, ch * .35], [-b * .58, ch * .4], [0, 0]], notes: ['One notch to the front, two to the back; the top notch meets the shoulder seam'], place: { view: 'front', x: SP[0], y: SP[1], rot, z: -1 } }),
      twin('sleeve-2', 'Sleeve', sew, { view: 'front', x: -SP[0], y: SP[1], rot: -rot, flip: true, z: -1 }));
  }
  const neckLen = lenOf(neck(m.neckDropFront)) * 2 + lenOf(neck(m.neckDropBack)) * 2;
  if (m.neckRib && !S.hood && !['shirt', 'shirtss', 'polo', 'coat'].includes(style)) pieces.push(piece('neck-rib', 'Neck rib', rect(r8(neckLen * .86), m.neckRib * 2), { fabric: 'rib', notes: [`Stretched about 14% onto the neckline (${r8(neckLen)} in), folded in half`], place: { view: 'front', x: -neckLen * .43, y: m.neckDropFront - .2, z: 2 } }));
  if (m.cuffRib) {
    const shirt = style === 'shirt', a = (m.sleeve > 12 || o.drop ? 62 : 24) * Math.PI / 180, cw = r8(m.sleeveOpening * 2 * (shirt ? 1.05 : .88)), chh = shirt ? m.cuffRib : m.cuffRib * 2;
    const at = sg => ({ view: 'front', x: sg * (SP[0] + Math.cos(a) * m.sleeve) - cw / 2, y: SP[1] + Math.sin(a) * m.sleeve - m.cuffRib, z: 2 });
    pieces.push(piece('cuff', shirt ? 'Cuff' : 'Cuff rib', rect(cw, chh), { fabric: shirt ? 'self' : 'rib', cut: shirt ? 4 : 2, notes: [shirt ? 'Fused on the outer cuff' : 'Folded in half, stretched onto the sleeve'], place: at(1) }), twin('cuff-2', shirt ? 'Cuff' : 'Cuff rib', rect(cw, chh), at(-1)));
    pieces[pieces.length - 1].fabric = shirt ? 'self' : 'rib';
  }
  if (m.hemRib) pieces.push(piece('hem-rib', 'Hem rib', rect(r8(m.chest * 2 * .88), m.hemRib * 2), { fabric: 'rib', notes: ['Folded in half, stretched about 12% onto the hem'], place: { view: 'front', x: -m.chest * .88, y: L, z: 2 } }));
  if (S.hood) {
    const hn = (lenOf(neck(m.neckDropFront)) + lenOf(neck(m.neckDropBack))), H = 13.5, D = Math.max(hn + .4, 9.5);
    const side = [[0, 0], ...tail(cubic([0, 0], [D * .55, -1.1], [D + .9, .6], [D + .6, H * .45])), ...tail(cubic([D + .6, H * .45], [D + .4, H * .7], [D, H - .5], [D - .3, H])), ...tail(cubic([D - .3, H], [D * .6, H - .1], [D * .25, H + .25], [.4, H]))];
    pieces.push(piece('hood', 'Hood side', side, { cut: 2, pair: true, notes: [`The neck edge (${r8(hn)} in) meets half the neckline`, o.drawcord !== false ? 'Drawcord channel along the front edge, two eyelets' : 'No drawcord'], place: { view: 'back', x: .1, y: -H + 1, z: -2 } }), twin('hood-2', 'Hood side', side, { view: 'back', x: -.1, y: -H + 1, flip: true, z: -2 }));
  }
  if (S.pocket === 'kangaroo' && !o.noPocket) { const pb = L - .5, pt = pb - 8; pieces.push(piece('pocket', 'Kangaroo pocket', [[-5.5, pt], [5.5, pt], ...tail(cubic([5.5, pt], [6.2, pt + 3], [7.6, pt + 4.5], [7.6, pb])), [-7.6, pb], ...tail(cubic([-7.6, pb], [-7.6, pt + 4.5], [-6.2, pt + 3], [-5.5, pt]))], { cut: 1, notes: ['Hand openings turned and topstitched'], place: { view: 'front', z: 3 } })); }
  if (o.chestPocket && !S.zip) pieces.push(piece('chest-pocket', 'Chest pocket', [[0, 0], [4.25, 0], [4.25, 5], [2.125, 5.7], [0, 5]], { cut: 1, notes: ['1 in turn-back at the opening'], place: { view: 'front', x: half * .28, y: 6.5, z: 3 } }));
  if (style === 'shirt' || style === 'shirtss') {
    pieces.push(piece('collar', 'Collar', [[-neckLen / 2, 0], [neckLen / 2, 0], [neckLen / 2 + .6, 2.75], [-neckLen / 2 - .6, 2.75]], { cut: 2, notes: ['Top collar and under collar; fused top collar'], place: { view: 'front', x: 0, y: -1.2, z: 4 } }));
    pieces.push(piece('stand', 'Collar stand', [[-neckLen / 2 - .75, 0], ...tail(cubic([-neckLen / 2 - .75, 0], [-neckLen / 4, -.35], [neckLen / 4, -.35], [neckLen / 2 + .75, 0])), [neckLen / 2 + .75, 1.25], [-neckLen / 2 - .75, 1.25]], { cut: 2, notes: ['Fused; the buttonhole at the centre front'], place: { view: 'front', x: 0, y: 0, z: 3 } }));
  }
  if (style === 'polo') {
    pieces.push(piece('placket', 'Placket', rect(1.25, 6), { cut: 2, notes: ['Fused; 2 buttons'], place: { view: 'front', x: -.625, y: m.neckDropFront, z: 3 } }));
    pieces.push(piece('collar', 'Knit collar', rect(r8(neckLen), 3), { fabric: 'rib', notes: ['Flat-knit collar, knitted to size'], place: { view: 'front', x: -neckLen / 2, y: -1, z: 4 } }));
  }
  if (style === 'coat') pieces.push(piece('collar', 'Collar', [[-neckLen / 2, 0], [neckLen / 2, 0], [neckLen / 2 + 1.2, 3.5], [-neckLen / 2 - 1.2, 3.5]], { cut: 2, notes: ['Fused under collar'], place: { view: 'front', x: 0, y: -1.5, z: 4 } }), piece('facing', 'Front facing', [[0, 0], [3, 0], [3, L], [0, L]], { cut: 2, pair: true, notes: ['Fused'], place: { view: 'front', x: 0, y: 0, z: -3 }, fabric: 'self' }));
  if (m.sleeve === 0) pieces.push(piece('binding', 'Armhole and neck binding', rect(r8(lenOf(armhole) * 4 * .92 + neckLen * .9), 1.25), { fabric: 'self', cut: 1, notes: ['Bias or cross-grain strip, cut into lengths'], place: { view: 'front', x: -half, y: L + 1, z: 2 } }));
  return pieces;
}
function bottomPieces(S, m, o, style) {
  const wb = m.waistband, pieces = [];
  if (S.skirt) {
    const w = m.waist / 2, hip = m.hip / 2, L = m.length - wb, sw = Math.max(m.sweep, m.hip) / 2, hy = Math.min(7, L * .45);
    const panel = [[-w, 0], [w, 0], ...tail(cubic([w, 0], [hip, hy * .4], [hip, hy * .8], [hip, hy])), [sw, L], [-sw, L], ...tail(cubic([-hip, hy], [-hip, hy * .8], [-hip, hy * .4], [-w, 0])).slice(0, -1)];
    pieces.push(piece('front', 'Front', [...panel.slice(0, 3), ...panel.slice(3)], { cut: 1, fold: true, place: { view: 'front', y: wb } }), piece('back', 'Back', panel, { cut: 1, fold: true, notes: ['Invisible zip at the centre back'], place: { view: 'back', y: wb } }));
    pieces.push(piece('waistband', 'Waistband', rect(r8(m.waist * 2 + 1.5), wb * 2), { notes: ['Folded, fused, 1½ in overlap'], place: { view: 'front', x: -m.waist - .75, y: 0, z: 2 } }));
    return pieces;
  }
  const rd = m.rise - wb, Hc = m.hip * 2, hipY = Math.min(7.5, rd * .7), inseam = m.inseam, Hy = rd + inseam;
  const leg = (back) => {
    const k = back ? 1 : -1, hipW = m.hip / 2 + (back ? .5 : -.5), waistW = m.waist / 2 + (back ? .25 : -.25), ext = back ? Hc / 10 : Hc / 16;
    const sideX = -hipW, crease = (ext + sideX) / 2, hemW = m.legOpening * (back ? 1.1 : .9), cbRaise = back ? 1 : 0;
    const crotch = cubic([0, rd * .55], [0, rd * .85], [ext * .35, rd], [ext, rd]);
    const sew = [[0, -cbRaise], ...crotch, [crease + hemW / 2, Hy], [crease - hemW / 2, Hy], [sideX, hipY], ...tail(cubic([sideX, hipY], [sideX, hipY * .5], [-waistW - .2, hipY * .2], [-waistW, 0]))];
    void k; return { sew, crease, ext };
  };
  const F = leg(false), B = leg(true);
  // on the flats the front of the right leg is drawn on the viewer's left: the pieces are placed as one leg each side, from the centre
  pieces.push(piece('front', 'Front leg', F.sew, { cut: 2, pair: true, grain: [[F.crease, hipY + 2], [F.crease, Hy - 3]], notches: [[F.ext, rd], [-(m.hip / 2 - .5), hipY]], notes: [S.label === 'Leggings' ? 'Four-way stretch' : 'Crease line is the grain'], place: { view: 'front', x: 0, y: wb, flip: true } }));
  pieces.push(twin('front-2', 'Front leg', F.sew, { view: 'front', x: 0, y: wb }));
  pieces.push(piece('back', 'Back leg', B.sew, { cut: 2, pair: true, grain: [[B.crease, hipY + 2], [B.crease, Hy - 3]], notches: [[B.ext, rd], [B.ext - .5, rd], [-(m.hip / 2 + .5), hipY]], notes: ['Two notches mark the back; dart or seat seam at the waist'], place: { view: 'back', x: 0, y: wb } }));
  pieces.push(twin('back-2', 'Back leg', B.sew, { view: 'back', x: 0, y: wb, flip: true }));
  const elastic = /jogger|sweat/.test(String(o.template || '')) || style === 'leggings';
  pieces.push(piece('waistband', elastic ? 'Waistband (elastic channel)' : 'Waistband', rect(r8(m.waist * 2 + (elastic ? 0 : 1.5)), wb * 2), { notes: [elastic ? `Elastic ${r8(wb - .25)} in wide${o.drawcord ? ', drawcord through two eyelets' : ''}` : 'Fused, 1½ in overlap for the button'], place: { view: 'front', x: -m.waist - .75, y: 0, z: 2 } }));
  if (style !== 'leggings') {
    pieces.push(piece('pocket-bag', 'Pocket bag', [[0, 0], [6.5, 0], [6.5, 9], ...tail(cubic([6.5, 9], [6.5, 11.5], [2, 11.5], [0, 10]))], { fabric: 'pocketing', cut: 4, pair: true, place: { view: 'front', x: m.waist / 2 - 5, y: wb, z: -1 } }));
    if (!elastic) pieces.push(piece('fly', 'Fly facing', [[0, 0], [1.75, 0], [1.75, 6], ...tail(cubic([1.75, 6], [1.75, 7.6], [.6, 7.8], [0, 7.8]))], { cut: 2, notes: ['Fused; a 7 in zip'], place: { view: 'front', x: -1.9, y: wb, z: 2 } }));
    pieces.push(piece('back-pocket', 'Back pocket', [[0, 0], [5, -.4], [4.8, 5.6], [2.6, 6.4], [.4, 5.8]], { cut: 2, notes: ['1 in turn-back at the opening'], place: { view: 'back', x: 1.8, y: wb + 1.8, z: 3 } }));
  }
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
  const m = measurementsFor(p, size), o = { ...(p.options || {}), template: p.template };
  const pieces = S.kind === 'top' ? topPieces(S, m, o, p.style) : S.kind === 'bottom' ? bottomPieces(S, m, o, p.style) : S.kind === 'cap' ? capPieces(S, m, o) : S.kind === 'beanie' ? beaniePieces(m) : totePieces(m);
  const knit = ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'tank', 'bodysuit', 'swimsuit', 'bikini', 'bra', 'leggings', 'beanie'].includes(p.style);
  return { kind: 'garment', style: p.style, label: S.label, size: S.oneSize ? 'One size' : size, sa: knit ? .375 : .5, pieces, notes: [knit ? 'Knit: ⅜ in seam allowance, overlocked' : 'Woven: ½ in seam allowance', 'A first block from the measurements: true it up on the first sample'] };
}

// ---- plush ----
export const PLUSH_SHAPES = { bear: 'Bear (head, body, arms, legs)', elephant: 'Elephant (sitting: trunk, big ears, four legs, tail)', bean: 'Bean character (one body, a base)', bunny: 'Bunny (bean body, long ears)', pillow: 'Pillow character (front, back, side gusset)' };
export const PLUSH_EARS = { round: 'Round', pointed: 'Pointed', long: 'Long', big: 'Big and floppy (lined)', none: 'None' };
export const PLUSH_FABRICS = { minky: 'Minky, 3 mm pile', shortpile: 'Short-pile plush', velboa: 'Velboa', fleece: 'Anti-pill fleece', fur: 'Faux fur, 10 mm pile', terry: 'Terry', leather: 'Nappa lambskin, 0.7 mm', vegan: 'Vegan leather (PU), 0.8 mm', suede: 'Suede', velvet: 'Cotton velvet', boucle: 'Bouclé' };
// cloths with no stretch and a cut edge that shows: sewn with a wider allowance, the pieces eased, the pile (or the grain) not a factor
export const PLUSH_FIRM = ['leather', 'vegan', 'suede'];
export const PLUSH_EYES = { embroidered: 'Embroidered (any age)', safety: 'Safety eyes, 12 mm (3 years and up)', felt: 'Felt, sewn flat' };
export const PLUSH_AGES = { '0+': 'All ages, under 3 included', '3+': '3 years and up', '14+': 'Collectible, 14 and up' };
export function plushDefaults(shape = 'bear') { return { shape: PLUSH_SHAPES[shape] ? shape : 'bear', height: shape === 'pillow' ? 14 : 12, ears: shape === 'bunny' ? 'long' : shape === 'pillow' ? 'pointed' : shape === 'elephant' ? 'big' : 'round', arms: shape !== 'pillow', legs: shape === 'bear' || shape === 'elephant', tail: shape === 'bunny' || shape === 'elephant', fabric: 'minky', eyes: 'embroidered', age: '0+', fill: 'polyester fibre', depth: shape === 'pillow' ? 3 : 0 }; }
export function cleanPlush(input = {}) {
  const d = plushDefaults(PLUSH_SHAPES[input.shape] ? input.shape : 'bear'), num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? r8(Math.min(Math.max(n, lo), hi)) : def; };
  return { shape: d.shape, height: num(input.height, 4, 48, d.height), ears: PLUSH_EARS[input.ears] ? input.ears : d.ears, arms: input.arms == null ? d.arms : Boolean(input.arms), legs: input.legs == null ? d.legs : Boolean(input.legs), tail: input.tail == null ? d.tail : Boolean(input.tail),
    fabric: PLUSH_FABRICS[input.fabric] ? input.fabric : d.fabric, eyes: PLUSH_EYES[input.eyes] ? input.eyes : d.eyes, age: PLUSH_AGES[input.age] ? input.age : d.age, fill: String(input.fill || d.fill).slice(0, 60), depth: num(input.depth, 1, 12, d.depth || 3),
    // what the character is (an elephant, a fox…), in words: the shape it is drafted as is the nearest the pattern has
    ...(String(input.animal || '').trim() ? { animal: String(input.animal).replace(/[^a-zA-Z \-']/g, '').replace(/\s+/g, ' ').trim().slice(0, 30).toLowerCase() } : {}),
    // the body's and the contrast's colours, read from a picture or a concept's words (a material on the part, when chosen, wins over them)
    ...(input.colours && typeof input.colours === 'object' && ['body', 'contrast'].some(k => /^#[0-9a-f]{6}$/i.test(String(input.colours[k] || ''))) ? { colours: Object.fromEntries(['body', 'contrast'].filter(k => /^#[0-9a-f]{6}$/i.test(String(input.colours[k] || ''))).map(k => [k, String(input.colours[k]).toLowerCase()])) } : {}),
    ...(cleanSketches(input.sketches, VIEWS_OF.plush).length ? { sketches: cleanSketches(input.sketches, VIEWS_OF.plush) } : {}),
    ...(cleanLogos(input.logos, 'plush').length ? { logos: cleanLogos(input.logos, 'plush') } : {}) }; // drawn by hand on its views (src/lab-sketch.js)
}
function earOf(kind, w) {
  if (kind === 'long') return blob([[0, 0], [w * .55, -w * .4], [w * .5, -w * 2.4], [0, -w * 2.9], [-w * .5, -w * 2.4], [-w * .55, -w * .4]], .9).map(([x, y]) => [x, y + w * 2.9]);
  if (kind === 'pointed') return [[-w / 2, w], ...tail(cubic([-w / 2, w], [-w * .45, w * .45], [-w * .1, 0], [0, 0])), ...tail(cubic([0, 0], [w * .1, 0], [w * .45, w * .45], [w / 2, w]))];
  return [[-w / 2, w * .8], ...tail(cubic([-w / 2, w * .8], [-w * .62, 0], [w * .62, 0], [w / 2, w * .8]))];
}
export function plushPattern(input = {}) {
  const s = cleanPlush(input), h = s.height, pieces = [], notes = [], ears = s.ears !== 'none';
  if (s.shape === 'bear') {
    const hh = h * .42, hw = hh * 1.05, bh = h * .44, bw = bh * .78, legH = h * .26, armL = h * .3;
    // the head: two sides and a centre gusset from the nose over the crown to the back of the neck
    // a head side is the head in profile, the nose at x = 0: the two sides meet at the nose, either side of the gusset
    const headSide = blob([[0, hh * .6], [hw * .12, hh * .22], [hw * .42, 0], [hw * .62, hh * .28], [hw * .6, hh * .78], [hw * .28, hh * .98], [hw * .06, hh * .84]], .75);
    pieces.push(piece('head-side', 'Head side', headSide, { cut: 2, pair: true, notches: [[0, hh * .6]], notes: ['The nose point meets the gusset'], place: { view: 'front', x: -hw * .1, y: 0, flip: true, z: 2 } }));
    pieces.push(piece('head-side-2', 'Head side', headSide, { cut: 0, place: { view: 'front', x: hw * .1, y: 0, z: 2 } }));
    pieces.push(piece('gusset', 'Head gusset', blob([[0, 0], [hw * .16, hh * .25], [hw * .2, hh * .9], [0, hh * 1.25], [-hw * .2, hh * .9], [-hw * .16, hh * .25]], .9), { cut: 1, notes: ['From the nose over the crown to the back of the neck'], place: { view: 'front', x: 0, y: hh * .05, z: 3 } }));
    pieces.push(piece('muzzle', 'Muzzle', ellipse(hw * .2, hh * .14, 32), { cut: 1, fabric: 'contrast', notes: ['Contrast fabric; the nose embroidered with satin stitch'], place: { view: 'front', x: 0, y: hh * .66, z: 5 } }));
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
  const firm = PLUSH_FIRM.includes(s.fabric);
  for (const q of pieces) if (q.fabric === 'self') q.fabric = firm ? 'leather' : 'pile';
  notes.push(...(firm ? [`${PLUSH_FABRICS[s.fabric]}: it does not stretch, so the pieces are eased and the curves notched; cut each piece from sound skin, the grain running down the toy`, '⅜ in seam allowance, sewn at 8–9 stitches an inch with a leather needle and bonded nylon thread; seams pressed open with a roller, not an iron', 'Stuffed firm and slowly: leather shows every lump']
    : [`${PLUSH_FABRICS[s.fabric]}: the pile runs down the grain arrow`, '¼ in seam allowance, sewn at 10–12 stitches an inch, backstitched at the opening']));
  return { kind: 'plush', spec: s, label: s.animal && !PLUSH_SHAPES[s.shape].toLowerCase().startsWith(s.animal) ? `${s.animal[0].toUpperCase()}${s.animal.slice(1)} · drafted as: ${PLUSH_SHAPES[s.shape]}` : PLUSH_SHAPES[s.shape], size: `${s.height} in tall`, sa: firm ? .375 : .25, pieces, notes, checks: plushChecks(s, pieces) };
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
  const lx = B.x1 + 6, base = q => q.twin ? q.id.replace(/-2$/, '') : q.id, onProduct = new Map();
  // the outlines on the product a piece is cut for: itself, then its twin (the other side)
  for (const x of A.pieces) { const l = onProduct.get(base(x.piece)) || []; if (x.piece.twin) l.push(x); else l.unshift(x); onProduct.set(base(x.piece), l); }
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
  for (const x of A.pieces) if (!used.has(x) && !(x.piece.twin && (onProduct.get(base(x.piece)) || []).some(y => used.has(y)))) list.push({ q: x.piece, src: x, layer: 0, n: 0, tgt: null, uncut: true });
  // spread all the way, no two pieces may cover each other (on one view, or one view's against the other's beside it): they are nudged apart (their boxes, a little margin between) and the nudge grows
  // with the spread, so the product comes apart smoothly into pieces that can each be seen
  const full = list.map(x => x.src ? boundsOf(lift(x.src.piece, x.src.pts, x.layer, 1)) : null), off = list.map(() => [0, 0]);
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
// DXF (R12, inches): one block of polylines a piece, on layers a pattern system reads: CUT (the cutting line), SEW (the sew line), GRAIN, NOTCH, TEXT
export function patternDxf(pat, { width = 58 } = {}) {
  const lay = layoutOf(pat, { width }), out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '9', '$MEASUREMENT', '70', '0', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const poly = (pts, layer, closed = true) => { out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'); for (const [x, y] of pts) out.push('0', 'VERTEX', '8', layer, '10', String(r3(x)), '20', String(r3(-y))); out.push('0', 'SEQEND'); };
  const text = (x, y, s, h, layer = 'TEXT') => out.push('0', 'TEXT', '8', layer, '10', String(r3(x)), '20', String(r3(-y)), '40', String(r3(h)), '1', String(s).replace(/[\r\n]+/g, ' '));
  let y0 = 0;
  for (const g of lay) {
    for (const it of g.items) {
      const q = it.piece, tf = pts => pts.map(([x, y]) => [(it.flip ? -x + (it.b.x0 + it.b.x1) : x) + it.x, y + it.y + y0]);
      poly(tf(offsetOf(q.sew, q.sa ?? pat.sa)), 'CUT'); poly(tf(q.sew), 'SEW'); poly(tf(q.grain), 'GRAIN', false);
      for (const [x, y] of tf(q.notches)) poly([[x - .09, y], [x + .09, y]], 'NOTCH', false);
      const bb = boundsOf(tf(q.sew)); text(bb.x0 + .3, (bb.y0 + bb.y1) / 2, `${q.name} - ${cutWords(q)} - ${fabricName(q.fabric)} - ${pat.size}`, .25);
    }
    y0 += g.length + 3;
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
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
    const baseId = q.twin ? q.id.replace(/-2$/, '') : q.id; if (gone.has(baseId)) continue;
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
  const list = Array.isArray(pats) ? pats : [pats], k = units === 'mm' ? 25.4 : 1, f = v => String(r3(v * k)), out = [];
  const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$MEASUREMENT', '70', units === 'mm' ? '1' : '0', '0', 'ENDSEC'];
  const layers = ['1', '2', '3', '4', '7', '8', '14', '15'], tables = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.length), ...layers.flatMap(l => ['0', 'LAYER', '2', l, '70', '0', '62', '7', '6', 'CONTINUOUS']), '0', 'ENDTAB', '0', 'ENDSEC'];
  const blocks = ['0', 'SECTION', '2', 'BLOCKS'], ents = ['0', 'SECTION', '2', 'ENTITIES'];
  const text = (arr, x, y, s, h, layer = '1') => arr.push('0', 'TEXT', '8', layer, '10', f(x), '20', f(-y), '40', f(h), '1', String(s).replace(/[\r\n]+/g, ' ').slice(0, 250));
  const poly = (arr, pts, layer, closed = true) => { arr.push('0', 'POLYLINE', '8', layer, '66', '1', '10', '0', '20', '0', '70', closed ? '1' : '0'); for (const [x, y] of pts) arr.push('0', 'VERTEX', '8', layer, '10', f(x), '20', f(-y)); arr.push('0', 'SEQEND', '8', layer); };
  const line = (arr, a, b, layer) => arr.push('0', 'LINE', '8', layer, '10', f(a[0]), '20', f(-a[1]), '11', f(b[0]), '21', f(-b[1]));
  const sizes = [...new Set(list.map(p => p.size))];
  text(ents, 0, -3, `Style Name: ${style}`, .25); text(ents, 0, -2.6, `Sample Size: ${list[0]?.size ?? ''}`, .2); text(ents, 0, -2.25, `Units: ${units === 'mm' ? 'METRIC' : 'ENGLISH'}`, .2);
  text(ents, 0, -1.9, `Size List: ${sizes.join(' ')}`, .2); text(ents, 0, -1.55, `Author: ${author}`, .2); text(ents, 0, -1.2, `Creation Date: ${new Date().toISOString().slice(0, 10)}`, .2);
  let y0 = 0, n = 0;
  for (const pat of list) {
    const lay = layoutOf(pat, { width });
    for (const g of lay) for (const it of g.items) {
      if (it.n !== 0) continue; // one block a piece and a size; the quantity is in its text
      const q = it.piece, sa = q.sa ?? pat.sa, cutl = offsetOf(q.sew, sa), name = `${String(q.name).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 24)}_${String(pat.size).replace(/[^A-Za-z0-9.]+/g, '')}_${++n}`;
      blocks.push('0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '3', name);
      poly(blocks, cutl, '1'); for (const p of cutl) blocks.push('0', 'POINT', '8', '2', '10', f(p[0]), '20', f(-p[1]));
      poly(blocks, q.sew, '14'); line(blocks, q.grain[0], q.grain[1], '7');
      // a notch: a ¼ in cut in from the cutting line, square to the edge, at the notch on the sew line
      for (const nt of q.notches) { let bi = 0, bd = Infinity; for (let i = 0; i < q.sew.length; i++) { const d = Math.hypot(q.sew[i][0] - nt[0], q.sew[i][1] - nt[1]); if (d < bd) { bd = d; bi = i; } }
        const a = q.sew[(bi - 1 + q.sew.length) % q.sew.length], b = q.sew[(bi + 1) % q.sew.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
        line(blocks, [nt[0] + nx * sa, nt[1] + ny * sa], [nt[0] + nx * (sa - .25), nt[1] + ny * (sa - .25)], '4'); }
      const b = boundsOf(q.sew), cx = b.x0 + .2, cy = (b.y0 + b.y1) / 2;
      text(blocks, cx, cy - .45, `Piece Name: ${q.name}`, .18); text(blocks, cx, cy - .2, `Quantity: ${q.cut}${q.pair ? ' (pairs)' : ''}`, .16); text(blocks, cx, cy + .05, `Size: ${pat.size}`, .16);
      text(blocks, cx, cy + .3, `Material: ${fabricName(q.fabric).toUpperCase()}`, .16); if (q.fold) text(blocks, cx, cy + .55, 'Annotation: CUT ON FOLD', .14, '15');
      blocks.push('0', 'ENDBLK', '8', '0');
      ents.push('0', 'INSERT', '8', '1', '2', name, '10', f(it.x), '20', f(-(it.y + y0)));
    }
    y0 += lay.reduce((t, g) => t + g.length + 3, 0) + 4;
  }
  blocks.push('0', 'ENDSEC'); ents.push('0', 'ENDSEC');
  return [...head, ...tables, ...blocks, ...ents, '0', 'EOF'].join('\n') + '\n';
}

// what the pattern costs in cloth: yards of each fabric for one piece, from the layout
export const yardage = (pat, width = 58) => layoutOf(pat, { width }).map(g => ({ fabric: g.fabric, name: g.name, yards: g.yards, efficiency: g.efficiency }));
export { SIZES, piece, twin, cubic, tidy, blob, tail, mirrorX, lenOf };
