// Does the pattern make the garment? The construction check takes a drafted pattern (src/lab-pattern.js) and proves it three ways, by
// measurement, with no AI and no picture:
//   1. the seams: every two edges sewn together walked against each other, the same length within an eighth of an inch, or eased within the
//      range a factory sews (a sleeve cap into its armhole, a rib stretched onto a neckline, a cuff onto a sleeve);
//   2. the garment: measured off the pieces as they are sewn (the chest 1 in below the armhole, the length from the high point of the shoulder,
//      the waist, the hip, the rise, the inseam…) against the measurements the piece is specified at, within the tolerances a factory works to;
//   3. the cut table: every piece laid on its cloth at the cloth's width, the yardage and how much of the cloth is used, nothing wider than it.
// It walks the block a garment is built from (pat.block: one side of the front and the back, the sleeve, each leg, before a yoke, a panel or
// a pocket divides them; dividing a piece does not change a seam's length or the garment's size), and the rib, cuff and band pieces as cut.
// A bag is checked by its assembly (the list of every seam, zip and finished edge its drafting gives): each seam's two sides, each zip in
// its opening, that no edge is left unsewn or sewn twice, that what is sewn on a panel lies on it, and its body against its size.
// The same file runs in the page and on the service: no DOM, no Node.
import { layoutOf, boundsOf } from './lab-pattern.js';

const r8 = v => Math.round(v * 8) / 8, r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (pts, p) => { let k = -1, d = Infinity; pts.forEach((q, i) => { const e = dist(q, p); if (e < d) { d = e; k = i; } }); return d < .06 ? k : -1; };
// the run of an outline between two of its corners that passes none of its other labelled corners (an outline may run either way round)
function edge(blk, a, b) {
  const P = blk.sew, n = P.length, idx = Object.fromEntries(Object.entries(blk.at).map(([k, p]) => [k, near(P, p)])), i = idx[a], j = idx[b];
  if (i < 0 || j < 0) return null;
  const others = new Set(Object.entries(idx).filter(([k, v]) => k !== a && k !== b && v >= 0).map(([, v]) => v));
  const walk = (s, e) => { let L = 0, k = s, hit = false; const run = [P[s]]; for (let t = 0; t < n && k !== e; t++) { const nx = (k + 1) % n; L += dist(P[k], P[nx]); k = nx; run.push(P[k]); if (k !== e && others.has(k)) hit = true; } return { L, hit, run }; };
  const f = walk(i, j), r = walk(j, i), w = !f.hit ? f : !r.hit ? r : f.L <= r.L ? f : r;
  if (RUNS) RUNS.push({ block: blk, pts: w.run });
  return w.L;
}
// the edges walked since the last seam: kept (when asked for) so a drawing can show the two sides of each seam alike
let RUNS = null;
// where a horizontal line at y crosses an outline: its widest span
function spanAt(P, y) { const xs = []; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } return xs.length ? [Math.min(...xs), Math.max(...xs)] : null; }
function lowAt(P, x) { const ys = []; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; if ((x1 <= x) !== (x2 <= x)) ys.push(y1 + (x - x1) / (x2 - x1) * (y2 - y1)); } return ys.length ? Math.max(...ys) : null; }
const piece = (pat, id) => pat.pieces.find(q => q.id === id);
const lengthOf = q => (q ? boundsOf(q.sew).w : null);

// a seam: the two sides' lengths and whether they meet as they should
function seam(name, a, b, { ease = [-.125, .125], why = '' } = {}) {
  const edges = RUNS ? RUNS.splice(0) : undefined;
  if (a == null || b == null) return { name, ok: null, why: 'not labelled on the pattern yet' };
  const d = r2(b - a), ok = d >= ease[0] - 1e-6 && d <= ease[1] + 1e-6;
  return { name, a: r2(a), b: r2(b), diff: d, range: ease, ok, why, ...(edges?.length ? { edges } : {}) };
}
// a measurement of the made garment against its spec
function measure(name, got, want, tol = .5) {
  if (RUNS) RUNS.length = 0;
  if (got == null || want == null) return { name, ok: null, why: 'not measurable on the pattern yet' };
  const d = r2(got - want); return { name, got: r8(got), want: r8(want), diff: d, tol, ok: Math.abs(d) <= tol + 1e-6 };
}

function checkTop(pat, m, style, knit) {
  if (pat.block?.tailored) { // a tailored jacket or coat: front, side body and back; a two-piece sleeve
    const T = pat.block, seams = [], meas = [];
    seams.push(seam('Front to side body', edge(T.front, 'aEnd', 'sideH'), edge(T.side, 'f0', 'fH')));
    seams.push(seam('Side body to back', edge(T.side, 'b0', 'bH'), edge(T.back, 'ua', 'h')));
    seams.push(seam('Shoulder: front to back', edge(T.front, 'n0', 'sp'), edge(T.back, 'nk', 'sp'), { ease: [.125, .5], why: 'the back shoulder eased onto the front, ⅛ to ½ in' }));
    if (T.top && T.under) { const arm = edge(T.front, 'sp', 'aEnd') + edge(T.side, 'f0', 'b0') + edge(T.back, 'sp', 'ua'), cap = edge(T.top, 'b', 'top') + edge(T.top, 'top', 'f') + edge(T.under, 'b', 'f');
      seams.push(seam('Sleeve cap into the armhole', arm, cap, { ease: [.5, 1.5], why: 'a tailored sleeve: ½ to 1½ in of ease in the cap' }));
      seams.push(seam('Sleeve front seam: top to under', edge(T.top, 'f', 'fH'), edge(T.under, 'f', 'fH')));
      seams.push(seam('Sleeve back seam: top to under', edge(T.top, 'b', 'bH'), edge(T.under, 'b', 'bH')));
      meas.push(measure('Sleeve length from the shoulder point', T.top.at.fH[1], m.sleeve, .5)); }
    const y = T.ua[1] + 1, sf = spanAt(T.front.sew, y), ss = spanAt(T.side.sew, y), sb = spanAt(T.back.sew, y);
    meas.push(measure('Chest, 1 in below the armhole (flat)', sf && ss && sb ? sf[1] + (ss[1] - ss[0]) + sb[1] : null, m.chest, .5)); // the front from the centre, the side body, the back from the centre
    meas.push(measure('Body length from the high point of the shoulder', T.back.at.h[1], m.length, .75));
    meas.push(measure('Shoulder, seam to seam', 2 * T.front.at.sp[0], m.shoulder, .375));
    return { seams, meas };
  }
  if (pat.block?.brief) { // a bikini: the brief's side seams and its crotch, front to back; the top's band to its size; the set's length
    const { front: Fb, back: Bb } = pat.block.brief, ub = piece(pat, 'underband'), seams = [], meas = [];
    seams.push(seam('Brief side seam: front to back', edge(Fb, 'sideTop', 'sideBot'), edge(Bb, 'sideTop', 'sideBot')));
    seams.push(seam('Brief crotch: front to back', edge(Fb, 'crotchL', 'crotchR'), edge(Bb, 'crotchL', 'crotchR')));
    if (ub) meas.push(measure('Top width under the cups (flat, the band at rest)', lengthOf(ub) / 2 / .9, m.chest, .5));
    meas.push(measure('Set height, top of the strap to the bottom of the brief', Math.max(...Fb.sew.map(([, y]) => y)), m.length, .5));
    return { seams, meas };
  }
  const B = pat.block || {}, F = B.front, Bk = B.back, S = B.sleeve, seams = [], meas = [];
  if (!F || !Bk) return { seams: [{ name: 'Body', ok: null, why: 'this block (tailored) is not labelled yet' }], meas: [] };
  const e = (blk, a, b) => (blk ? edge(blk, a, b) : null);
  const ribH = q => (q ? boundsOf(q.sew).h / (q.fabric === 'rib' ? 2 : 1) : 0), chestAt = () => { const y = (F.at.ua || F.at.topSide)[1] + 1, sf = spanAt(F.sew, y), sb = spanAt(Bk.sew, y); return sf && sb ? sf[1] + sb[1] : null; };
  if (F.topCut) { // a strapless or strappy body: its top edge, its side seams, its size
    seams.push(seam('Side seam: front to back', e(F, 'topSide', 'hemSide'), e(Bk, 'topSide', 'hemSide')));
    meas.push(measure('Chest, 1 in below the top of the side seam (flat)', chestAt(), m.chest, .5));
    meas.push(measure(['bodysuit', 'swimsuit'].includes(style) ? 'Body length to the crotch' : 'Body length', Math.max(...F.sew.map(([, y]) => y)) + ribH(piece(pat, 'hem-rib')), m.length, .5));
    return { seams, meas };
  }
  if (F.raglan) { // raglan: the body's raglan seams walked against the sleeve's, front and back
    if (S?.raglan) { seams.push(seam('Raglan seam, front: body to sleeve', e(F, 'rag', 'ua'), e(S, 'neckF', 'uaF'), { ease: [-.25, .25], why: 'within ¼ in, eased' }));
      seams.push(seam('Raglan seam, back: body to sleeve', e(Bk, 'rag', 'ua'), e(S, 'uaB', 'neckB'), { ease: [-.25, .25], why: 'within ¼ in, eased' }));
      seams.push(seam('Sleeve seam: front to back', e(S, 'uaF', 'hemF'), e(S, 'hemB', 'uaB'))); }
    seams.push(seam('Side seam: front to back', e(F, 'ua', 'hemSide'), e(Bk, 'ua', 'hemSide')));
    meas.push(measure('Chest, 1 in below the armhole (flat)', chestAt(), m.chest, .5));
    meas.push(measure('Body length (centre front)', Math.max(...F.sew.map(([, y]) => y)) + ribH(piece(pat, 'hem-rib')), m.length, .75));
    return { seams, meas };
  }
  const fArm = e(F, 'sp', 'ua'), bArm = e(Bk, 'sp', 'ua');
  seams.push(seam('Shoulder: front to back', e(F, 'hps', 'sp'), e(Bk, 'hps', 'sp'), { ease: [-.125, .375], why: 'the back may be eased up to ⅜ in onto the front' }));
  seams.push(seam('Side seam: front to back', e(F, 'ua', 'hemSide'), e(Bk, 'ua', 'hemSide')));
  if (S) {
    const cap = e(S, 'uaB', 'top') + e(S, 'top', 'uaF'), arm = fArm + bArm, drop = pat.construction?.sleeve === 'drop';
    seams.push(seam('Sleeve cap into the armhole', arm, cap, { ease: knit || drop ? [-.25, .75] : [.25, 1.5], why: knit || drop ? 'a knit or a dropped shoulder: the cap within ¾ in of the armhole' : 'a set-in woven sleeve: ¼ to 1½ in of ease in the cap' }));
    seams.push(seam('Sleeve seam: front to back', e(S, 'uaF', 'hemF'), e(S, 'hemB', 'uaB')));
  }
  const neckline = 2 * (e(F, 'cfNeck', 'hps') + e(Bk, 'cfNeck', 'hps')) + (F.ext ? 0 : 0), rib = piece(pat, 'neck-rib');
  // a collar, a stand, a hood: the edge it is sewn on by (measured off its own outline as drafted) against the neckline it is sewn to, front
  // edge to front edge or centre front to centre front, less what is designed to turn back at an opening
  const ext = F.ext || 0;
  for (const q of pat.pieces) { if (!q.cut || !q.neck) continue; const want = q.neck.to === 'edge' ? neckline : neckline - 2 * ext, got = q.neck.len * (q.neck.pair ? 2 : 1) - (q.neck.extra || 0), knitC = q.fabric === 'rib';
    seams.push(seam(`${q.name} onto the neckline`, want, got, { ease: knitC ? [-want * .1, .125] : [-.25, .25], why: (q.neck.why ? q.neck.why + '; ' : '') + (knitC ? 'a knit collar may be up to 10% shorter, stretched on' : 'within ¼ in') })); }
  if (rib) seams.push(seam('Neck rib onto the neckline (stretched)', neckline, lengthOf(rib), { ease: [-neckline * .22, -neckline * .08], why: 'a rib is cut 8–22% shorter than the neckline it is stretched onto' }));
  const cuff = piece(pat, 'cuff'), hemS = S ? edge(S, 'hemF', 'hemB') : null;
  if (cuff && hemS) { const w = lengthOf(cuff), shirt = style === 'shirt'; const full = pat.construction?.collar === 'shearling'; seams.push(seam(shirt ? 'Cuff onto the sleeve (pleated in)' : full ? 'Cuff onto the full sleeve (gathered in)' : 'Cuff rib onto the sleeve (stretched)', hemS, w, { ease: shirt ? [-hemS * .5, .5] : full ? [-hemS * .6, -hemS * .05] : [-hemS * .3, -hemS * .05], why: shirt ? 'a shirt cuff takes up the sleeve in its pleats and placket' : full ? 'a full sleeve is gathered into its cuff' : 'a rib cuff is cut 5–30% shorter than the opening' })); }
  const hr = piece(pat, 'hem-rib'), hemB = 2 * (e(F, 'hemSide', 'cfHem') + e(Bk, 'hemSide', 'cfHem'));
  if (hr) seams.push(seam('Hem band onto the hem', hemB, lengthOf(hr), { ease: [-hemB * .2, 0], why: 'a hem rib is cut up to 20% shorter than the hem (a shearling band eased, not stretched)' }));
  // the garment, as sewn
  const ua = F.at.ua[1], chestY = ua + 1, sf = spanAt(F.sew, chestY), sb = spanAt(Bk.sew, chestY);
  const chest = sf && sb ? (sf[1] + sb[1]) : null; // each block is half the front or the back from the centre line: front half + back half = half the chest round = the chest flat
  meas.push(measure('Chest, 1 in below the armhole (flat)', chest, m.chest, .5));
  const hemRib = hr ? boundsOf(hr.sew).h / (hr.fabric === 'rib' ? 2 : 1) : 0, len = ['bodysuit', 'swimsuit'].includes(style) ? Math.max(...F.sew.map(([, y]) => y)) : lowAt(F.sew, F.at.hps[0] + .01); // a bodysuit's to its crotch
  meas.push(measure('Body length from the high point of the shoulder', len != null ? len + hemRib : null, m.length, .5));
  meas.push(measure('Shoulder, seam to seam', 2 * F.at.sp[0], m.shoulder, .375));
  meas.push(measure('Neck width, seam to seam', 2 * F.at.hps[0], m.neckWidth, .25));
  meas.push(measure('Front neck drop', F.at.cfNeck[1], m.neckDropFront, .25));
  if (S) {
    const cuffH = cuff ? boundsOf(cuff.sew).h / (style === 'shirt' ? 1 : 2) : 0, sl = Math.max(...S.sew.map(([, y]) => y)) + cuffH;
    meas.push(measure('Sleeve length from the shoulder point', sl, m.sleeve, .5));
    meas.push(measure('Sleeve opening (flat)', cuff ? lengthOf(cuff) / (style === 'shirt' ? 2.1 : 1.76) : hemS / 2, m.sleeveOpening, .375));
  }
  return { seams, meas };
}

function checkBottom(pat, m, K) {
  const B = pat.block || {}, F = B.front, Bk = B.back, seams = [], meas = [];
  if (!F || !Bk) return { seams: [{ name: 'Legs', ok: null, why: 'not labelled yet' }], meas: [] };
  if (F.skirt) { // a skirt: front and back panels, the side seams, the band; pleats laid in (measured as the skirt shows)
    seams.push(seam('Side seam: front to back', edge(F, 'waistR', 'hemR'), edge(Bk, 'waistR', 'hemR')));
    const waist = edge(F, 'waistL', 'waistR'), wbP = piece(pat, 'waistband'), el = K.waist && K.waist !== 'fixed';
    if (wbP && !el) seams.push(seam('Waistband onto the waist', 2 * waist, lengthOf(wbP), { ease: [1, 2.25], why: 'the waist round plus 1–2¼ in to overlap at the zip' }));
    const sp = y => { const q = spanAt(F.sew, y); return q ? q[1] - q[0] : null; };
    meas.push(measure('Waist (flat)', waist, m.waist, .5)); meas.push(measure('Hip (flat)', sp(F.at.hipR[1]), m.hip, .5));
    meas.push(measure('Sweep, the hem (flat)', dist(F.at.hemL, F.at.hemR), Math.max(m.sweep, m.hip) * (K.leg === 'flare' ? 1.45 : 1), .5));
    meas.push(measure('Length from the top of the waistband', F.at.hemR[1] + (m.waistband || 0), m.length, .5));
    return { seams, meas };
  }
  seams.push(seam('Inseam: front to back', edge(F, 'crotch', 'hemIn'), edge(Bk, 'crotch', 'hemIn'), { ease: [-.375, .125], why: 'the back inseam may be up to ⅜ in shorter, stretched to the front' }));
  seams.push(seam('Side seam: front to back', edge(F, 'hemOut', 'sideTop'), edge(Bk, 'hemOut', 'sideTop')));
  const fw = edge(F, 'sideTop', 'cfTop'), bw = edge(Bk, 'sideTop', 'cfTop'), wbP = piece(pat, 'waistband'), elastic = K.waist && K.waist !== 'fixed', pleats = (K.pleats || 0) * 1.25;
  if (wbP && elastic) { const round = 2 * (fw + bw) + (K.panels === 'side-panel' ? 5 : 0), band = lengthOf(wbP);
    seams.push(seam('Elastic casing onto the waist', round, band, { ease: [-.375, .5], why: 'the casing is the legs\' top edge round, gathered by the elastic inside it' }));
    seams.push(seam('Pulls on over the hip', 2 * (m.hip || 0) * .95, band, { ease: [0, 99], why: 'a pull-on waist opens to at least the hip round (less 5% stretch)' })); }
  if (wbP && !elastic) seams.push(seam('Waistband onto the waist', 2 * (fw + bw) - 2 * pleats - 2 * (Bk.dart || 0) + (K.panels === 'side-panel' ? 5 : 0), lengthOf(wbP), { ease: [1, 2.25], why: 'the band is the waist round plus 1–2¼ in to overlap at the fly' }));
  const pw = K.panels === 'side-panel' ? 2.5 : 0; // a side panel down each side: 1¼ in taken off each leg, the panel 2½ in wide
  const dart = Bk.dart || 0; // a back dart takes its width out of the waist
  const el = (pat.trims || []).find(t => t.item === 'Elastic'), elLen = el ? parseFloat(String(el.qty)) : null;
  meas.push(elastic ? measure('Waist relaxed (flat, on the elastic)', elLen ? elLen / .9 / 2 : null, m.waist, .5) : measure('Waist (flat)', fw + bw - pleats - dart + pw, m.waist, .5));
  const hipY = Math.min(7, F.at.crotch[1] * .7), hf = spanAt(F.sew, hipY), hb = spanAt(Bk.sew, hipY); // 7 in down, or the hip line of a short rise
  meas.push(measure('Hip, 7 in below the waistband, or at the hip line (flat)', hf && hb ? (hf[1] - hf[0]) + (hb[1] - hb[0]) + pw : null, m.hip, .5));
  meas.push(measure('Front rise, waistband included', edge(F, 'cfTop', 'crotch') + (m.waistband || 0), m.rise, .375));
  meas.push(measure('Inseam', edge(F, 'crotch', 'hemIn'), m.inseam, .5));
  const ty = F.at.crotch[1] + 1, tf = spanAt(F.sew, ty), tb = spanAt(Bk.sew, ty);
  meas.push(measure('Thigh, 1 in below the crotch (flat)', tf && tb ? ((tf[1] - tf[0]) + (tb[1] - tb[0]) + pw) / 2 : null, m.thigh, .5));
  meas.push(measure('Leg opening (flat)', (dist(F.at.hemIn, F.at.hemOut) + dist(Bk.at.hemIn, Bk.at.hemOut) + pw) / 2, m.legOpening, .375)); // straight across the hem, as it is laid flat and measured
  return { seams, meas };
}

// a cap, a bucket hat, a beanie, a tote: one size. A head opening is checked against a one-size head of 22¾ in (adjustable caps and bucket
// hats are sold to fit about 21½ to 24 in; a fitted 7¼ is 22¾ in), within ½ in
const HEAD = 22.75;
const inside = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const perimeter = P => P.reduce((a, q, i) => a + dist(q, P[(i + 1) % P.length]), 0);
function checkHeadwear(pat, m) {
  const B = pat.block || {}, seams = [], meas = [];
  if (B.panel) { // a six-panel cap: each panel's two sides, the brim across the front, the sweatband round the head opening
    const P = B.panel, base = dist(P.at.br, P.at.bl), head = 6 * base, /* the panel's foot is straight */ ph = P.at.br[1] - P.at.tl[1];
    seams.push(seam('Crown seams: panel to panel', edge(P, 'tl', 'bl'), edge(P, 'tr', 'br'), { why: 'the six panels are sewn side to side from the button to the band; every side the same length' }));
    if (B.brim) { const inner = edge(B.brim, 'i0', 'i1');
      seams.push(seam('Brim onto the crown', 2 * base, inner, { ease: [0, base], why: 'across the two front panels and up to half of each side panel' }));
      const sb = piece(pat, 'sweatband'); if (sb) seams.push(seam('Sweatband round the head opening', head - 2.25 + 1, lengthOf(sb), { ease: [-.25, .25], why: 'the head opening less the 2¼ in back opening, ½ in turned back at each end' }));
      const bd = piece(pat, 'brim-board'), bs = piece(pat, 'brim'); if (bd && bs) { const n = bd.sew.filter(q => inside(bs.sew, q)).length; seams.push({ name: 'Brim board inside the brim', ok: n === bd.sew.length, a: bd.sew.length, b: n, diff: n - bd.sew.length, range: [0, 0], why: 'every point of the board inside the brim it is sewn into' }); }
      // the brim's length at the centre front, from the seam (the inner edge, bowed toward the crown) to its edge; its width side to side
      const bb = boundsOf(B.brim.sew); meas.push(measure('Brim length at the centre front', B.brim.at.tip[1] - (B.brim.bow || 0), m.brimLength, .125)); meas.push(measure('Brim width', bb.w, m.brimWidth, .25)); }
    meas.push(measure('Head size (one size, before the strap)', head, HEAD, .5));
    // the crown's height back off the panel: the panel runs a quarter of the dome round, a quarter-ellipse of the head's radius and the height
    const a = head / (2 * Math.PI), q = b => Math.PI / 4 * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); let lo = .5, hi = 12; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (q(mid) < ph) lo = mid; else hi = mid; }
    meas.push(measure('Crown height', lo, m.crownHeight, .25));
  } else if (B.band) { // a bucket hat: the crown oval onto the band's top, the brim onto the band's foot
    const band = B.band, brim = B.brim, foot = 2 * dist(band.at.b0, band.at.b1); /* the band's foot is straight; each seam's edges walked inside its own call */
    seams.push(seam('Crown top onto the side band', perimeter(B.crown.sew), 2 * edge(band, 't0', 't1'), { ease: [-.25, .25], why: 'the oval crown eased into the band, within ¼ in' }));
    seams.push(seam('Side band seams', edge(band, 't0', 'b0'), edge(band, 't1', 'b1'), { why: 'the two halves of the band sewn at the sides' }));
    seams.push(seam('Brim onto the side band', 2 * edge(band, 'b0', 'b1'), 2 * edge(brim, 'i0', 'i1'), { why: 'the brim\'s inner edge is the band\'s foot' }));
    seams.push(seam('Brim seams', edge(brim, 'i0', 'o0'), edge(brim, 'i1', 'o1'), { why: 'the two halves of the brim sewn at the sides' }));
    meas.push(measure('Head size (at the brim seam)', foot, HEAD, .5)); meas.push(measure('Crown height', boundsOf(band.sew).h, m.crownHeight, .25)); meas.push(measure('Brim length', boundsOf(brim.sew).h, m.brimLength, .125));
  }
  return { seams, meas };
}
function checkBeanie(pat, m) {
  const b = piece(pat, 'body'), bb = boundsOf(b.sew), circ = bb.w;
  return { seams: [seam('Stretched onto the head', HEAD, circ, { ease: [-HEAD * .25, -HEAD * .1], why: 'a rib beanie is knitted 10 to 25% smaller round than the head it stretches onto' })],
    meas: [measure('Flat width', circ / 2, m.width, .25), measure('Length, the cuff turned up', bb.h - m.cuff, m.height, .25), measure('Cuff', m.cuff, m.cuff, .125)] };
}
function checkTote(pat, m) {
  const b = piece(pat, 'body'), h = piece(pat, 'handle'), bb = boundsOf(b.sew), hb = h ? boundsOf(h.sew) : null, seams = [], meas = [];
  seams.push(seam('Side seams: front to back', bb.h / 2, bb.h / 2, { why: 'one piece folded at the bottom, the two sides of each side seam the same length' }));
  meas.push(measure('Width', bb.w, m.width, .25), measure('Height, the top turned back', bb.h / 2 - 1.5, m.height, .25));
  if (hb) meas.push(measure('Handle drop', (hb.w - 3) / 2, m.handleDrop, .5), measure('Handle width, folded in four', hb.h / 4, m.handleWidth, .125));
  return { seams, meas };
}
// a plush built from parts (src/lab-plush-parts.js): every join between its parts walked (a head onto its neck, a pad into its leg, a base into
// its gores, a gusset along its seam; an ear, a limb or a tail no wider than the seam it is set into), and its size as drawn stuffed
function checkPlush(pat) {
  const B = pat.build, s = pat.spec, seams = B.joints.map(j => seam(j.name, j.a, j.b, { ease: j.ease, why: j.why })), meas = [];
  const pts = (B.views[B.horizontal ? 'side' : 'front'] || []).flatMap(i => i.pts);
  if (pts.length) { const b = boundsOf(pts), got = B.horizontal ? b.w : b.h, want = s.height; meas.push(measure(B.horizontal ? 'Length, nose to tail, stuffed' : 'Height, stuffed', got, want, Math.max(.5, want * .1))); }
  return { seams, meas };
}
// ---- a bag: its assembly walked (src/lab-pattern.js bagPattern lists it) ----
// a run: [piece id, the labelled corners it passes, which copy]; several runs end to end are a list of them
const runLen = (pat, [id, ks]) => { const q = piece(pat, id); if (!q?.at) return null; let L = 0; for (let i = 0; i < ks.length - 1; i++) { const e = edge(q, ks[i], ks[i + 1]); if (e == null) return null; L += e; } return L; };
const runsLen = (pat, r) => (Array.isArray(r[0]) ? r : [r]).reduce((s, x) => { const l = runLen(pat, x); return s == null || l == null ? null : s + l; }, 0);
const insideOf = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const toSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return dist(p, [a[0] + t * dx, a[1] + t * dy]); };
// how far inside an outline a point is: its distance to the nearest edge, negative when it is outside
const depthIn = (P, p) => (insideOf(P, p) ? 1 : -1) * Math.min(...P.map((a, i) => toSeg(p, a, P[(i + 1) % P.length])));
const perimOf = q => q.sew.reduce((s, p, i) => s + dist(p, q.sew[(i + 1) % q.sew.length]), 0);
// a measurement that has to reach a least value (a clearance, a reach, a length that must cover another)
function atLeast(name, got, min, why = '') { if (RUNS) RUNS.length = 0; if (got == null || !Number.isFinite(got)) return { name, ok: null, why: 'not measurable on the pattern yet' };
  return { name, got: r8(got), want: r8(min), diff: r2(got - min), tol: 0, rule: 'at least', ok: got >= min - 1e-6, ...(why ? { why } : {}) }; }
function checkBag(pat) {
  const seams = [], meas = [], [W, H, D] = String(pat.size).match(/[\d.]+/g).map(Number), A = pat.assembly || [];
  // every run a seam, a zip or a finish uses, by piece (and copy): at the end each piece's outline must be used once, all of it
  const used = new Map(), quiet = f => { const keep = RUNS; RUNS = null; try { return f(); } finally { RUNS = keep; } };
  const use = r => { for (const [id, ks, k = 0] of (Array.isArray(r[0]) ? r : [r])) { const l = quiet(() => runLen(pat, [id, ks])); if (l != null) used.set(`${id}#${k}`, (used.get(`${id}#${k}`) || 0) + l); } };
  let sewn = 0;
  for (const e of A) {
    if (e.zip != null) { const a = runsLen(pat, e.a), b = runsLen(pat, e.b);
      seams.push(seam(`${e.name}: the two edges it joins`, a, b, { why: e.why }));
      seams.push(seam(`${e.name}: the zip in its opening`, quiet(() => runsLen(pat, e.a)), e.zip, { ease: [-2.5, 0], why: 'the zip stops short of each end of its opening, under a tab' }));
      use(e.a); use(e.b); }
    else if (e.b) { const a = runsLen(pat, e.a), b0 = runsLen(pat, e.b); seams.push(seam(e.name, a, b0 == null ? null : b0 + (e.gap || 0), { ease: e.ease, why: e.why }));
      if (!e.caught) { use(e.a); if (!/^Lining/.test(e.name) && a != null) sewn += a; } use(e.b); }
    else if (e.fin) use(e.a);
    else if (e.id && e.on) { const panel = piece(pat, e.on), q = piece(pat, e.id); meas.push(atLeast(`${e.name}, inside its edges`, panel && q ? Math.min(...q.sew.map(([x, y]) => depthIn(panel.sew, [x + e.at[0], y + e.at[1]]))) : null, .25)); }
    else if (e.boxes) { const panel = piece(pat, e.on); meas.push(atLeast(`${e.name}, clear of its edges`, panel ? Math.min(...e.boxes.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).map(p => depthIn(panel.sew, p))) : null, e.clear)); }
    else if (e.fits != null) seams.push(seam(e.name, e.within, e.fits, { ease: [-2.5, 0], why: 'the zip stops short of each end' }));
    else if (e.reach) { const q = piece(pat, e.reach); meas.push(atLeast(`${e.name} (how far down the front)`, q ? boundsOf(q.sew).h - e.over : null, e.min)); }
    else if (e.handle) { const q = piece(pat, e.handle), free = q ? boundsOf(q.sew).h - 2 * e.tails : null; meas.push(atLeast(`${e.name} (its rise over the top)`, free == null ? null : Math.sqrt(Math.max(0, (free / 2) ** 2 - e.spread ** 2)), e.min)); }
    else if (e.straps) { const q = piece(pat, e.straps); meas.push(atLeast(e.name, q ? boundsOf(q.sew).h + e.webbing - e.sewn - e.span : null, e.min)); }
  }
  let worst = 0, who = ''; for (const [key, l] of used) { const q = piece(pat, key.split('#')[0]), d = Math.abs(l - perimOf(q)); if (d > worst) { worst = d; who = q.name; } }
  if (used.size) meas.push(measure(`No edge left unsewn, none sewn twice${worst > .125 ? ` (out on the ${who.toLowerCase()})` : ''}`, worst, 0, .125));
  // its size, measured off the pieces
  const front = piece(pat, 'front'), body = piece(pat, 'body'), g = piece(pat, 'gusset') || piece(pat, 'base-gusset');
  if (front) { const b = boundsOf(front.sew); meas.push(measure('Width', b.w, W, .25)); meas.push(measure('Height', b.h - (pat.up || 0), H, .25)); if (g) meas.push(measure('Depth', boundsOf(g.sew).h, D, .25)); }
  if (body) { const end = piece(pat, 'end'); meas.push(measure('Length', boundsOf(body.sew).w, W, .25)); if (end) meas.push(measure('Diameter', boundsOf(end.sew).w, H, .25)); }
  // binding enough for the inside seams
  const tape = (pat.trims || []).find(t => t.item === 'Binding tape'), tapeIn = tape ? Number(String(tape.qty).match(/[\d.]+/)?.[0]) : null;
  if (sewn && tapeIn != null) meas.push(atLeast('Binding tape, against the inside seams it binds', tapeIn, sewn));
  return { seams, meas };
}

// every piece cut is a clean outline: it never crosses itself (it could not be cut) and has no corner sharper than 20° between two edges
// longer than ⅛ in (a sliver no cutter follows and no machinist sews); → [{ piece, why }] for the ones that are not
const crosses = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(c, d, a) * o(c, d, b) < -1e-9 && o(a, b, c) * o(a, b, d) < -1e-9; };
export function outlineFaults(pat) {
  const out = [];
  for (const q of pat.pieces) { if (!q.cut || !Array.isArray(q.sew) || q.sew.length < 3) continue; const P = q.sew, n = P.length; let why = '';
    for (let i = 0; i < n && !why; i++) for (let j = i + 2; j < n && !why; j++) { if (i === 0 && j === n - 1) continue; if (crosses(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) why = 'its outline crosses itself'; }
    for (let i = 0; i < n && !why; i++) { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]], lu = Math.hypot(...u), lv = Math.hypot(...v);
      if (lu >= .125 && lv >= .125 && (u[0] * v[0] + u[1] * v[1]) / lu / lv > .94) why = `a corner of ${Math.round(Math.acos((u[0] * v[0] + u[1] * v[1]) / lu / lv) * 180 / Math.PI)}°, a sliver`; }
    if (why) out.push({ piece: q.name, why }); }
  return out;
}
// what every garment is made with, beyond its pieces: each feature the pattern has calls for the parts and trims a factory needs to make it
// (a fly calls for its zip and a waist button, a woven collar for its fusing, a hood for its lining); → [{ need, for }] for the ones missing
export function missingComponents(pat) {
  if (pat.kind === 'plush') { if (!pat.build) return []; const T = (pat.trims || []).map(t => t.item), out = [], need = (ok, what, why) => { if (!ok) out.push({ need: what, for: why }); };
    need(T.some(t => /fill/i.test(t)), 'Fibre fill', 'a stuffed toy'); need(T.includes('Thread'), 'Thread', 'every plush'); need(T.includes('Law label'), 'Law label', 'every stuffed toy sold (the fill content and registration)');
    need(T.some(t => /safety eyes|floss/i.test(t)), 'Eyes (safety eyes or floss)', 'the face');
    for (const c of pat.checks || []) if (c.level === 'fail') out.push({ need: 'A safe build for its age', for: c.msg });
    return out; }
  if (pat.kind === 'bag') { // a bag: what each of its zips, straps, pads and linings calls for
    const T = pat.trims || [], has = re => T.some(t => re.test(t.item)), count = re => T.filter(t => re.test(t.item)).reduce((n, t) => n + (Number(t.qty) || 0), 0), ids = new Set(pat.pieces.filter(q => q.cut).map(q => q.id)), out = [], need = (ok, what, why) => { if (!ok) out.push({ need: what, for: why }); };
    const pad = re => T.some(t => t.item === 'Foam' && re.test(t.where));
    need(has(/^Thread$/), 'Thread', 'every bag'); need(has(/^Main label$/), 'Main label', 'every bag'); need(has(/^Binding tape$/), 'Binding tape', 'the inside seams');
    const sliders = T.filter(t => t.item === 'Zip').reduce((n, t) => n + (/two-way/.test(t.spec) ? 2 : 1), 0); if (sliders) need(count(/^Zip puller$/) >= sliders, `${sliders} zip puller${sliders > 1 ? 's' : ''}`, 'one to each zip slider');
    const hooks = count(/^Swivel hook$/); if (hooks) need(count(/^D-ring$/) >= hooks, `${hooks} D-rings`, 'the swivel hooks of a detachable strap clip to them');
    if (T.some(t => t.item === 'Webbing' && /^Shoulder strap$/.test(t.where))) need(has(/^Slider$/), 'A strap slider', 'an adjustable shoulder strap');
    if (ids.has('strap')) { need(pad(/strap/i), 'Strap foam', 'padded shoulder straps'); need(pad(/back panel/i), 'Back panel foam', 'a padded back'); need(has(/^Ladder lock$/), 'Ladder locks', 'the shoulder straps adjust at the base'); need(has(/^Spacer mesh$/), 'Spacer mesh', 'the back panel and the strap undersides'); }
    if (ids.has('sleeve')) need(pad(/sleeve/i), 'Sleeve foam', 'a padded laptop sleeve');
    if (ids.has('lining')) need(['lining-gusset', 'lining-base', 'lining-end'].some(i => ids.has(i)), "The lining's gusset", 'a lining is its panels and the gusset between them');
    if (ids.has('channel')) { need(has(/^Drawcord$/), 'Drawcord', 'the channel'); need(has(/^Cord lock$/), 'Cord lock', 'the drawcord'); need(has(/^Eyelet$/), 'Eyelets', 'where the drawcord leaves the channel'); }
    if (['tote', 'helmet', 'briefcase', 'duffel'].includes(pat.style)) need(ids.has('handle'), 'Handles', 'how it is carried');
    if (pat.style === 'tote') need(has(/^Base board$/), 'Base board', 'a structured tote stands on its base');
    if (pat.style === 'duffel') need(has(/^Piping$/), 'Piping', 'the end panels are piped');
    return out; }
  if (pat.kind !== 'garment') return [];
  const ids = new Set(pat.pieces.filter(q => q.cut).map(q => q.id)), T = pat.trims.map(t => t.item), has = re => T.some(t => re.test(t)), out = [], need = (ok, what, why) => { if (!ok) out.push({ need: what, for: why }); };
  const pc = id => pat.pieces.find(q => q.id === id && q.cut);
  need(has(/^Main label$/), 'Main label', 'every garment'); if (pat.size !== 'One size') need(has(/^Size label$/), 'Size label', 'every sized garment'); need(has(/^Care and content label$/), 'Care and content label', 'every garment'); need(has(/^Thread$/), 'Thread', 'every garment');
  if (ids.has('fly')) { need(has(/zip/i), 'Fly zip', 'the fly'); need(has(/button|hook/i), 'A waist button (or hook and bar)', 'the fly'); }
  const wb = pc('waistband'); if (wb && !/elastic/i.test(wb.name)) need(ids.has('waistband-fuse'), 'Waistband fusing', 'a fixed waistband');
  if (wb && /elastic/i.test(wb.name)) need(has(/elastic/i), 'Elastic', 'an elastic waistband');
  if (wb && !/elastic/i.test(wb.name) && !ids.has('fly') && pat.style === 'skirt') need(has(/zip/i), 'A zip', 'a fixed-waist skirt');
  if (ids.has('placket')) { need(has(/button|snap|zip/i), 'Buttons (or snaps)', 'the placket'); need(ids.has('placket-fuse'), 'Placket fusing', 'the placket'); }
  for (const id of ['collar', 'stand']) { const q = pc(id); if (q && q.fabric === 'self' && !/shearling/i.test(q.name)) need(ids.has(id + '-fuse') || ids.has('under-collar-fuse'), `${q.name} fusing`, `a woven ${q.name.toLowerCase()}`); }
  const cf = pc('cuff'); if (cf && cf.fabric === 'self' && ['shirt', 'shirtss'].includes(pat.style)) need(ids.has('cuff-fuse'), 'Cuff fusing', 'a shirt cuff');
  if (ids.has('cuff') && pat.style === 'shirt') need(ids.has('sleeve-placket'), 'Sleeve plackets', 'a buttoned shirt cuff opens at a placket');
  if (ids.has('hood')) { need(ids.has('hood-lining'), 'Hood lining', 'the hood'); if (pc('hood').notes.some(n => /drawcord channel/i.test(n))) { need(has(/drawcord/i), 'Drawcord', 'the hood'); need(has(/eyelet/i), 'Eyelets', 'the drawcord'); } }
  if (pat.construction?.opening === 'zip' || ids.has('zip-placket') || ids.has('zip-guard')) need(has(/zip/i), 'A zip', 'the zip opening');
  if (pat.style === 'bra') need(has(/elastic/i), 'Elastic', 'a bra');
  if (pat.style === 'cap') { need(has(/top button/i), 'Top button', 'the crown, where the panels meet'); need(has(/strap|snap|buckle|closure/i), 'A back closure', 'the back opening'); need(has(/eyelet/i), 'Eyelets', 'a six-panel cap');
    need(has(/seam tape/i), 'Crown seam tape', 'the crown seams'); need(ids.has('front-buckram'), 'Front panel buckram', 'a structured front'); need(ids.has('brim-board'), 'Brim board', 'the brim'); need(ids.has('sweatband'), 'Sweatband', 'the head opening'); }
  if (pat.style === 'beanie') need(has(/yarn/i), 'Yarn', 'a knitted beanie');
  if (pat.style === 'tote') need(ids.has('handle'), 'Handles', 'a tote');
  if (ids.has('front-lining')) { need(ids.has('back-lining'), 'Back lining', 'a lined body'); if (ids.has('sleeve') || ids.has('top-sleeve')) need(ids.has('sleeve-lining'), 'Sleeve lining', 'a lined body with sleeves'); if (ids.has('top-sleeve')) need(ids.has('under-sleeve-lining'), 'Under sleeve lining', 'a two-piece sleeve'); }
  return out;
}
// → { seams, meas, table, cuts, missing, ok, coverage } ok: every check that could be made passed; coverage: how many could be made
// edges: true also gives each seam the runs of outline it walked ({ block, pts }, in the block's own coordinates)
export function constructionCheck(pat, { m = null, style = '', width = 58, edges = false } = {}) {
  if (!pat) return null;
  const knit = (pat.sa || 0) < .45, K = pat.construction || {};
  RUNS = edges ? [] : null;
  let r; try { r = pat.kind === 'plush' && pat.build ? checkPlush(pat) : pat.kind === 'bag' ? checkBag(pat) : ['cap', 'bucket'].includes(pat.style) ? checkHeadwear(pat, m || {}) : pat.style === 'beanie' ? checkBeanie(pat, m || {}) : pat.style === 'tote' ? checkTote(pat, m || {}) : pat.block?.front?.at?.crotch || pat.block?.front?.skirt || (m && ('inseam' in m || 'sweep' in m)) ? checkBottom(pat, m || {}, K) : checkTop(pat, m || {}, style || pat.style, knit); } finally { RUNS = null; }
  const lay = layoutOf(pat, { width }), table = lay.map(g => ({ fabric: g.name, width: g.width, length: g.length, yards: g.yards, efficiency: g.efficiency, pieces: g.items.length, fits: g.items.every(it => it.b.w <= g.width + 1e-6) }));
  const all = [...r.seams, ...r.meas], made = all.filter(x => x.ok !== null), cuts = outlineFaults(pat), missing = missingComponents(pat);
  return { ...r, table, cuts, missing, ok: made.length > 0 && made.every(x => x.ok) && table.every(t => t.fits) && !cuts.length && !missing.length, passed: made.filter(x => x.ok).length, made: made.length, total: all.length };
}
