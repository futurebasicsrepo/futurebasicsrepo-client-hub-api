// Design Lab footwear: the last a shoe is built on, its size run, and the pattern of its upper, drafted on the last's standard (the flattened side
// of the last). The same file runs in the page (served as /lab/lab-footwear.js) and on the service (the files), so it uses neither the DOM nor Node.
//   lastOf(spec, size)        → the last: its length, girths, widths, heel height and toe spring, and its side, bottom and top views (inches)
//   sizeRun(spec)             → every size in the run: last length, ball girth, the other size systems, which outsole mould it shares
//   footwearPattern(spec, s)  → a pattern (src/lab-pattern.js shape): the upper's pieces as they are cut and as they sit on the shoe (the side
//                               view), the linings, foams and stiffeners, the insole and sockliner, and the moulded sole unit as components
//   footwearChecks, tooling   → what to look at before a sample, and what the lasts and the sole moulds take
// Lengths are inches; on the side view x runs from the back of the heel to the toe and y up is negative. The last and the pattern are a
// first draft from the size and the style: a last maker and a pattern engineer true them up on the first fitting sample.
import { piece, cubic, tidy, blob, boundsOf, areaOf } from './lab-pattern.js';

const r3 = v => Math.round(v * 1000) / 1000, r8 = v => Math.round(v * 8) / 8, r1 = v => Math.round(v * 10) / 10;
export const FW_STYLES = {
  sneaker: { label: 'Court sneaker (low)', heel: .45, spring: .55, collar: 2.7, laced: true, throat: .4, sole: 'cupsole', toe: 'round' },
  hightop: { label: 'High-top sneaker', heel: .5, spring: .55, collar: 5.2, laced: true, throat: .26, sole: 'cupsole', toe: 'round', shaft: true },
  runner: { label: 'Runner', heel: .4, spring: .7, collar: 2.9, laced: true, throat: .36, sole: 'midsole', toe: 'round' },
  derby: { label: 'Derby', heel: 1, spring: .45, collar: 2.4, laced: true, throat: .45, sole: 'stitched', toe: 'almond' },
  loafer: { label: 'Penny loafer', heel: .9, spring: .4, collar: 2.15, laced: false, throat: .58, sole: 'stitched', toe: 'almond' },
  chelsea: { label: 'Chelsea boot', heel: 1.25, spring: .45, collar: 6, laced: false, throat: .3, sole: 'stitched', toe: 'round', shaft: true },
  boot: { label: 'Lace-up boot (6 in)', heel: 1.25, spring: .5, collar: 6.5, laced: true, throat: .2, sole: 'stitched', toe: 'round', shaft: true },
  hiker: { label: 'Hiking boot', heel: 1, spring: .6, collar: 5.5, laced: true, throat: .22, sole: 'midsole', toe: 'round', shaft: true }
};
export const TOES = { round: { label: 'Round', allowance: .5 }, almond: { label: 'Almond', allowance: .75 }, square: { label: 'Square', allowance: .6 }, pointed: { label: 'Pointed', allowance: 1.25 } };
export const SYSTEMS = { 'us-m': "US men's", 'us-w': "US women's", uk: 'UK', eu: 'EU (Paris points)', mm: 'Mondopoint (foot length, mm)' };
export const WIDTHS = { 'us-m': ['B', 'C', 'D', 'E', 'EE', 'EEEE'], 'us-w': ['AA', 'A', 'B', 'C', 'D', 'E'] };
export const UPPERS = { leather: 'Full-grain leather', suede: 'Suede', nubuck: 'Nubuck', canvas: 'Canvas', mesh: 'Engineered mesh', synthetic: 'Synthetic leather' };
export const LININGS = { leather: 'Leather lining', textile: 'Textile lining', mesh: 'Mesh lining' };
const MEDIUM = { 'us-m': 'D', 'us-w': 'B' };

// ---- sizes ----
// foot length from a size (the Brannock scale: a full US size is ⅓ in), and back; EU is Paris points (⅔ cm each) on the last's length
export function footLength(system, size) {
  const s = Number(size);
  if (system === 'us-w') return (s + 21) / 3;
  if (system === 'uk') return (s + 23) / 3;
  if (system === 'eu') return s / 1.5 / 2.54 - .55;
  if (system === 'mm') return s / 25.4;
  return (s + 22) / 3;
}
const fromFoot = F => ({ usM: r1(F * 3 - 22), usW: r1(F * 3 - 21), uk: r1(F * 3 - 23), eu: Math.round((F + .55) * 2.54 * 1.5), mm: Math.round(F * 25.4) });
export const SIZE_LIMITS = { 'us-m': [3, 18], 'us-w': [4, 15], uk: [2, 17], eu: [33, 52], mm: [200, 330] };
export function fwDefaults(style = 'sneaker') { const S = FW_STYLES[style] || FW_STYLES.sneaker; return { style: FW_STYLES[style] ? style : 'sneaker', system: 'us-m', size: 9, width: 'D', toe: S.toe, toeCap: style === 'sneaker' || style === 'boot', upper: style === 'runner' ? 'mesh' : style === 'sneaker' ? 'leather' : 'leather', lining: style === 'runner' ? 'mesh' : 'textile', heel: S.heel, spring: S.spring, runFrom: 7, runTo: 13, halves: true }; }
export function cleanFootwear(input = {}) {
  const d = fwDefaults(FW_STYLES[input.style] ? input.style : 'sneaker'), sys = SYSTEMS[input.system] ? input.system : d.system, [lo, hi] = SIZE_LIMITS[sys];
  const num = (v, a, b, def, step = .5) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(Math.max(n, a), b) / step) * step : def; };
  const defSize = sys === 'us-w' ? 7 : sys === 'uk' ? 8 : sys === 'eu' ? 42 : sys === 'mm' ? 265 : 9, widths = WIDTHS[sys] || WIDTHS['us-m'];
  const size = num(input.size, lo, hi, defSize, sys === 'eu' || sys === 'mm' ? 1 : .5);
  const runFrom = num(input.runFrom, lo, hi, sys === 'us-w' ? 5 : sys === 'eu' ? 39 : sys === 'mm' ? 240 : 7, sys === 'eu' || sys === 'mm' ? 1 : .5), runTo = num(input.runTo, runFrom, hi, Math.max(runFrom, sys === 'us-w' ? 11 : sys === 'eu' ? 46 : sys === 'mm' ? 300 : 13), sys === 'eu' || sys === 'mm' ? 1 : .5);
  return { style: d.style, system: sys, size, width: widths.includes(input.width) ? input.width : MEDIUM[sys] || 'D', toe: TOES[input.toe] ? input.toe : d.toe, toeCap: input.toeCap == null ? d.toeCap : Boolean(input.toeCap),
    upper: UPPERS[input.upper] ? input.upper : d.upper, lining: LININGS[input.lining] ? input.lining : d.lining, heel: num(input.heel, 0, 4, d.heel, .125), spring: num(input.spring, 0, 1.5, d.spring, .125), runFrom, runTo, halves: input.halves == null ? d.halves : Boolean(input.halves),
    // read from a picture (or set by hand): the lines and the sole, which otherwise come from the style
    ...cleanLines(input), ...(cleanLast3d(input.last3d) ? { last3d: cleanLast3d(input.last3d) } : {}) };
}
// a measured 3D last in use (src/lab-last3d.js measures it): its numbers, its side profile (bottom and top, as the side view draws them: x from
// the heel's back, y downward, the ground under the ball at 0) and its bottom outline (x along, the inside negative), in inches
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cleanLast3d(i) {
  if (!i || typeof i !== 'object') return null;
  const n = (v, a, b) => { const x = Number(v); return v != null && v !== '' && Number.isFinite(x) && x >= a && x <= b ? r3(x) : null; };
  const pts = (a, max) => Array.isArray(a) && a.length >= 4 && a.length <= max && a.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(Number(v)) && Math.abs(Number(v)) < 40)) ? a.map(p => [r3(Number(p[0])), r3(Number(p[1]))]) : null;
  const o = { id: UUID.test(String(i.id || '')) ? String(i.id) : '', name: String(i.name || '').replace(/\s+/g, ' ').trim().slice(0, 80), source: ['upload', 'draft', 'photos'].includes(i.source) ? i.source : 'upload',
    footLen: n(i.footLen, 5, 16), length: n(i.length, 5, 18), ballFromHeel: n(i.ballFromHeel, 2, 14), ballGirth: n(i.ballGirth, 5, 16), instepGirth: n(i.instepGirth, 5, 17), ballWidth: n(i.ballWidth, 1.5, 6), heelWidth: n(i.heelWidth, 1, 4.5),
    heelHeight: n(i.heelHeight, 0, 5), toeSpring: n(i.toeSpring, 0, 2.5), whichFoot: i.whichFoot === 'left' ? 'left' : 'right', bottom: pts(i.bottom, 140), top: pts(i.top, 140), outline: pts(i.outline, 200) };
  return ['footLen', 'length', 'ballFromHeel', 'ballGirth', 'instepGirth', 'ballWidth', 'heelWidth', 'heelHeight', 'toeSpring', 'bottom', 'top', 'outline'].every(k => o[k] != null) ? o : null;
}
// the size a foot length is in a system (the other way from footLength)
export function sizeFromFoot(system, F) { return system === 'us-w' ? F * 3 - 21 : system === 'uk' ? F * 3 - 23 : system === 'eu' ? (F + .55) * 2.54 * 1.5 : system === 'mm' ? F * 25.4 : F * 3 - 22; }
const HEX = /^#[0-9a-f]{6}$/i, opt = (v, a, b, step = .125) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(Math.max(n, a), b) / step) * step : null; };
export const SOLES = { cupsole: 'Cupsole (rubber, stitched or cemented)', midsole: 'EVA midsole and rubber outsole', stitched: 'Stitched leather or rubber sole and heel' };
function cleanLines(i = {}) {
  const out = {}, put = (k, v) => { if (v != null) out[k] = v; };
  put('collar', opt(i.collar, 1.5, 10)); put('vamp', opt(i.vamp, .4, .75, .01)); put('throat', opt(i.throat, .1, .6, .01)); put('soleHeight', opt(i.soleHeight, .25, 2.5));
  put('eyelets', opt(i.eyelets, 3, 14, 1)); if (SOLES[i.sole]) out.sole = i.sole; if (typeof i.mudguard === 'boolean') out.mudguard = i.mudguard; if (typeof i.heelOverlay === 'boolean') out.heelOverlay = i.heelOverlay;
  const c = i.colours && typeof i.colours === 'object' ? Object.fromEntries(['upper', 'overlay', 'sole', 'lining'].filter(k => HEX.test(String(i.colours[k] || ''))).map(k => [k, String(i.colours[k]).toLowerCase()])) : {}; if (Object.keys(c).length) out.colours = c;
  const p = i.picture; if (p && typeof p === 'object' && [p.imgW, p.imgH, p.x0, p.y0, p.x1, p.y1].every(v => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 20000) && Number(p.x1) > Number(p.x0) && Number(p.y1) > Number(p.y0))
    out.picture = { imgW: Math.round(p.imgW), imgH: Math.round(p.imgH), x0: Math.round(p.x0), y0: Math.round(p.y0), x1: Math.round(p.x1), y1: Math.round(p.y1), toeLeft: Boolean(p.toeLeft), at: String(p.at || '').slice(0, 30) };
  return out;
}

// ---- the last ----
export function lastOf(input = {}, size = null) {
  const s = cleanFootwear(input), sz = size ?? s.size, d = draftLast(s, sz);
  return s.last3d ? measuredLast(s, sz, d) : d;
}
// the last drafted from the size, the width, the toe, the heel and the spring
function draftLast(s, sz) {
  const S = FW_STYLES[s.style], F = footLength(s.system, sz), L = F + TOES[s.toe].allowance;
  const widths = WIDTHS[s.system] || WIDTHS['us-m'], wStep = widths.indexOf(s.width) - widths.indexOf(MEDIUM[s.system] || 'D');
  // girths, graded ¼ in a full size and a width (men's D at US 9 is 9⅜ in round the ball)
  const usEq = s.system === 'us-w' ? F * 3 - 21 - 1.5 : F * 3 - 22, G = 9.375 + (usEq - 9) * .25 + wStep * .25 - (s.system === 'us-w' ? .5 : 0);
  const ball = F * .72, ballW = G * .37, heelW = G * .25, waistW = G * .27, h = s.heel, sp = s.spring, k = G / 9.375;
  // the last's bottom on the side view: the heel seat lifted by the heel height, flat to the ball, rising by the toe spring to the tip
  const bottom = [[0, -h], ...cubic([F * .2, -h], [F * .42, -h * .9], [ball - F * .12, 0], [ball, 0]).slice(0), ...cubic([ball, 0], [ball + (L - ball) * .5, 0], [L - .6, -sp * .7], [L, -sp]).slice(1)];
  const at = (pts, x) => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const [a, b] = [pts[i - 1], pts[i]], t = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * t; } return pts[pts.length - 1][1]; };
  const lastBottom = x => x <= 0 ? -h : x <= F * .2 ? -h : at(bottom, x);
  // the last's height over its own bottom along the top (the cone, the instep, the ball, the toe), scaled to the girth
  const H = [[0, 3.35], [F * .3, 3.95], [F * .55, 2.95], [ball, 1.95], [L - .7, 1.05], [L, .5]].map(([x, y]) => [x, y * k]);
  const heightAt = x => { for (let i = 1; i < H.length; i++) if (H[i][0] >= x) { const [a, b] = [H[i - 1], H[i]], t = (x - a[0]) / ((b[0] - a[0]) || 1), e = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * e; } return H[H.length - 1][1]; };
  const crest = x => lastBottom(x) - heightAt(x);
  const xs = n => Array.from({ length: n + 1 }, (_, i) => L * i / n);
  const side = [...xs(40).map(x => [x, lastBottom(x)]), ...xs(40).reverse().map(x => [x, crest(x)])];
  // the bottom view (the insole shape): x along the last, y across with the inside (medial) negative; the medial ball sits further forward
  const tip = { round: [[L * .95, -ballW * .28], [L, -ballW * .02], [L * .95, ballW * .26]], almond: [[L * .94, -ballW * .22], [L, -ballW * .05], [L * .94, ballW * .18]], square: [[L * .97, -ballW * .38], [L, -ballW * .1], [L * .99, ballW * .3]], pointed: [[L * .9, -ballW * .2], [L, -ballW * .02], [L * .9, ballW * .14]] }[s.toe];
  const bottomView = blob([[0, 0], [F * .12, -heelW / 2], [F * .45, -waistW * .32], [F * .73, -ballW * .55], tip[0], tip[1], tip[2], [F * .66, ballW * .45], [F * .45, waistW * .66], [F * .12, heelW / 2]], .75);
  return { style: s.style, size: sz, system: s.system, foot: r3(F), length: r3(L), ballGirth: r8(G), instepGirth: r8(G + .25), ballWidth: r8(ballW), heelWidth: r8(heelW), heelHeight: h, toeSpring: sp, ballFromHeel: r8(ball), toeAllowance: TOES[s.toe].allowance,
    side: tidy(side), bottom: tidy(bottomView), lastBottom, crest, F, L, G, S, s };
}
// a measured last (a 3D file, or one the 3D service made), in its own size and graded to the others as the draft grades: its length by the
// draft's length from size to size, its sections by the draft's ball girth (¼ in a size)
function measuredLast(s, sz, d) {
  const m = s.last3d, base = draftLast(s, sizeFromFoot(s.system, m.footLen)), kx = d.L / base.L, dG = d.G - base.G, G = m.ballGirth + dG, kg = G / m.ballGirth;
  const at = (P, x) => { if (x <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (P[i][0] >= x) { const a = P[i - 1], b = P[i], t = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * t; } return P[P.length - 1][1]; };
  const L = m.length * kx, F = L - TOES[s.toe].allowance;
  const lastBottom = x => at(m.bottom, x / kx), crest = x => { const b = at(m.bottom, x / kx); return b + (at(m.top, x / kx) - b) * kg; };
  const xs = n => Array.from({ length: n + 1 }, (_, i) => L * i / n);
  const side = [...xs(40).map(x => [x, lastBottom(x)]), ...xs(40).reverse().map(x => [x, crest(x)])];
  return { ...d, foot: r3(F), length: r3(L), ballGirth: r8(G), instepGirth: r8(m.instepGirth + dG), ballWidth: r8(m.ballWidth * kg), heelWidth: r8(m.heelWidth * kg), heelHeight: r8(m.heelHeight), toeSpring: r8(m.toeSpring), ballFromHeel: r8(m.ballFromHeel * kx),
    side: tidy(side), bottom: tidy(m.outline.map(([x, z]) => [x * kx, z * kg])), lastBottom, crest, F, L, G, measured: { id: m.id, name: m.name, source: m.source, whichFoot: m.whichFoot } };
}
// every size in the run, and which outsole mould each shares (a mould is cut for two half sizes)
export function sizeRun(input = {}) {
  const s = cleanFootwear(input), step = s.system === 'eu' || s.system === 'mm' ? (s.system === 'mm' ? 5 : 1) : (s.halves ? .5 : 1), out = [];
  for (let v = s.runFrom; v <= s.runTo + 1e-9 && out.length < 40; v = Math.round((v + step) * 10) / 10) { const l = lastOf(s, v), eq = fromFoot(l.foot); out.push({ size: v, lastLength: r8(l.length), lastMm: Math.round(l.length * 25.4), ballGirth: l.ballGirth, ...eq, mould: s.system === 'eu' || s.system === 'mm' ? `${v}` : `${Math.floor(v)}–${Math.floor(v)}½` }); }
  return out;
}

// ---- the upper ----
// a band of the side view between two edges (the top and the bottom of the piece, functions of x) from x0 to x1; the ends are curves from the
// bottom up to the top, leaning forward or back by `lean`
function band(x0, x1, top, bot, { lean0 = 0, lean1 = 0, n = 18 } = {}) {
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + (x1 - x0) * i / n), end = (x, lean, up) => { const a = [x, bot(x)], b = [x + lean, top(x + lean)]; const c = cubic(a, [a[0] + lean * .1, a[1] - (a[1] - b[1]) * .4], [b[0] - lean * .2, b[1] + (a[1] - b[1]) * .3], b, 8); return up ? c : c.slice().reverse(); };
  return [...xs.map(x => [x, bot(x)]), ...end(x1, lean1, true).slice(1), ...xs.slice().reverse().map(x => [x, top(Math.min(Math.max(x, x0 + lean0), x1 + lean1))]).slice(1), ...end(x0, lean0, false).slice(1, -1)];
}
const LAST_MARGIN = .6; // the lasting allowance: what folds under the last and is cemented to the insole
// as cut: the band with its bottom edge let down by the lasting allowance
const withMargin = (pts, bot, m = LAST_MARGIN) => pts.map(([x, y]) => Math.abs(y - bot(x)) < .02 ? [x, y + m] : [x, y]);
// a piece symmetrical about the crest (a vamp, a toe cap), as it is cut: its lower half (down its back edge, along the bottom with the lasting
// allowance, up the toe) mirrored over the line through its two crest ends
function symmetric(x0, x1, lean, crest, bot, margin = LAST_MARGIN) {
  const A = [x0 + lean, crest(x0 + lean)], B = [x1, crest(x1)], n = 20;
  const back = cubic(A, [A[0] - lean * .2, A[1] + (bot(x0) - A[1]) * .35], [x0 + lean * .1, bot(x0) - .3], [x0, bot(x0) + margin], 8);
  const along = Array.from({ length: n + 1 }, (_, i) => { const x = x0 + (x1 - x0) * i / n; return [x, bot(x) + margin]; }).slice(1);
  const front = cubic([x1, bot(x1) + margin], [x1 + .25, bot(x1)], [x1 + .2, B[1] + .3], B, 6).slice(1);
  const lower = [...back, ...along, ...front], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
  const refl = ([x, y]) => { const t = ((x - A[0]) * dx + (y - A[1]) * dy) / L2, px = A[0] + t * dx, py = A[1] + t * dy; return [2 * px - x, 2 * py - y]; };
  return [...lower, ...lower.slice(1, -1).reverse().map(refl)];
}

// the style's lines, with what was read from the picture (or set by hand) in their place
export const lineOf = s => { const S = FW_STYLES[s.style]; const collar = s.collar ?? S.collar; return { ...S, collar, throat: s.throat ?? S.throat, sole: s.sole ?? S.sole, shaft: Boolean(S.shaft) || collar > 4.5 }; };
export function footwearPattern(input = {}, size = null) {
  const s = cleanFootwear(input), last = lastOf(s, size ?? s.size), { F, L, lastBottom: bot, crest } = last, pieces = [], notes = [], S = lineOf(s);
  const collarBack = bot(0) - S.collar, ankle = F * .28, throat0 = F * S.throat, vampX = s.vamp ? F * s.vamp : s.style === 'loafer' ? F * .5 : s.style === 'chelsea' ? F * .3 : F * .6, open = S.laced ? .45 : 0;
  // the topline: the collar from the back down past the ankle bone, then the edge of the lace opening (half its width below the crest)
  const topline = x => {
    if (S.shaft) { const shaft = bot(0) - S.collar; return x <= throat0 ? shaft + (crest(throat0) + open - shaft) * Math.max(0, x / throat0) ** 3 : crest(x) + open; }
    const dip = collarBack + .45, tl = crest(throat0) + open;
    if (x <= ankle) { const t = x / ankle; return collarBack + (dip - collarBack) * (t * t * (3 - 2 * t)); }
    if (x <= throat0) { const t = (x - ankle) / (throat0 - ankle); return dip + (tl - dip) * (t * t * (3 - 2 * t)); }
    return S.laced ? crest(x) + open : crest(x) + .1;
  };
  const up = s.upper, fabUp = 'upper', fabOv = s.toeCap || s.style === 'sneaker' ? 'overlay' : 'upper';
  const sidePlace = z => ({ view: 'front', x: 0, y: 0, z });
  const add = (id, name, shown, o = {}) => { const sew = o.sew || withMargin(shown, bot, o.margin ?? LAST_MARGIN); pieces.push(piece(id, name, sew, { shown, place: sidePlace(o.z ?? 0), cut: o.cut ?? 2, pair: o.pair ?? true, fabric: o.fabric || fabUp, notes: o.notes || [], grain: o.grain })); };
  // the vamp: from the vamp line to the toe, the whole width of the forefoot; it runs ⅜ in under the quarters
  const vamp = band(vampX - .35, L - .02, crest, bot, { lean0: .4, lean1: 0 });
  add('vamp', s.style === 'chelsea' ? 'Front (vamp and shaft)' : 'Vamp', s.style === 'chelsea' ? band(throat0 + .2, L - .02, x => x < F * .3 ? bot(0) - S.collar + (crest(F * .3) - bot(0) + S.collar) * Math.max(0, (x - throat0) / (F * .3 - throat0)) ** 2 : crest(x), bot) : vamp,
    { z: 1, sew: symmetric(vampX - .35, L - .02, .4, crest, bot), pair: false, notes: ['Cut whole: the half on the standard mirrored over the centre line', 'Lasting allowance ⅝ in, skived'], grain: [[vampX + 1, crest(vampX) + 1], [L - 1.5, crest(L - 1.5) + 1]] });
  if (s.style === 'loafer') add('apron', 'Apron (moc plug)', band(vampX + .4, L - 1.1, crest, x => crest(x) + .85), { z: 3, margin: 0, sew: symmetric(vampX + .4, L - 1.1, 0, crest, x => crest(x) + .85, 0), pair: false, notes: ['Hand-sewn moc seam round the apron'] });
  // the quarters, outside and inside, from the back seam to past the vamp line (they lap over the vamp)
  const qEnd = s.style === 'chelsea' ? F * .28 : vampX + .25;
  const quarter = band(0, qEnd, topline, bot, { lean1: s.style === 'chelsea' ? 0 : .4 });
  add('quarter-lat', s.style === 'chelsea' ? 'Back quarter, outside' : 'Quarter, outside', quarter, { z: 2, notes: ['Back seam closed and taped'] });
  add('quarter-med', s.style === 'chelsea' ? 'Back quarter, inside' : 'Quarter, inside', quarter.map(([x, y]) => [x, y > topline(x) - .01 && y < topline(x) + .01 ? y + .15 : y]), { z: -1, notes: ['The inside collar sits ⅛ in lower, under the ankle bone'] });
  if (s.style === 'chelsea') { const g = band(F * .24, F * .32, x => bot(0) - S.collar + .2, x => bot(0) - S.collar + 3.6); add('gore', 'Elastic gore', g, { z: 3, margin: 0, cut: 4, fabric: 'elastic', notes: ['Twin-needle stitched under the quarter and the front'] }); }
  if (S.laced) {
    const eyestay = band(throat0 - .1, vampX + .2, topline, x => topline(x) + .85, { n: 16 });
    const holes = s.eyelets || Math.max(4, Math.round((vampX - throat0) / .55) + (S.shaft ? 3 : 0));
    add('eyestay', 'Eyestay', eyestay, { z: 4, margin: 0, cut: 4, fabric: fabOv, notes: [`${holes} eyelets a side, ${r8((vampX - throat0) / Math.max(holes - 1, 1))} in apart`] });
    notes.push(`Laces: ${holes} pairs of eyelets, about ${Math.round((holes * 2.6 + 18) / 6) * 6} in long`);
    // the tongue: from the vamp throat up past the collar, padded
    const tl = Math.hypot(vampX - throat0, crest(vampX) - crest(throat0)) + 2.6 + (s.style === 'boot' ? 3.5 : 0), tw = 2.6;
    const tongue = [[-tw * .38, 0], [tw * .38, 0], ...cubic([tw * .38, 0], [tw * .55, -tl * .5], [tw * .55, -tl * .9], [tw * .3, -tl]).slice(1), ...cubic([-tw * .3, -tl], [-tw * .55, -tl * .9], [-tw * .55, -tl * .5], [-tw * .38, 0]).slice(0, -1)];
    const shownT = band(throat0 - .7, vampX + .3, x => Math.max(crest(x) - .3, topline(x) - .8), x => crest(x) + .25, { n: 12 }); // it shows a little above the collar
    pieces.push(piece('tongue', 'Tongue', tongue, { shown: shownT, place: sidePlace(0), cut: 2, fabric: s.style === 'runner' ? 'upper' : fabUp, notes: ['Foam-padded, with a woven label at the top'] }));
  }
  if (s.toeCap) { const tc = band(L - 2.4, L - .02, crest, bot, { lean0: .9 }); add('toe-cap', 'Toe cap', tc, { z: 5, sew: symmetric(L - 2.4, L - .02, .9, crest, bot), pair: false, fabric: fabOv }); }
  if (s.mudguard) add('mudguard', 'Mudguard', band(F * .2, L - .02, x => bot(x) - .75, bot, { lean0: .3 }), { z: 4, fabric: 'overlay', notes: ['A low overlay round the foot, over the toe; lasted with the upper'] });
  if (s.heelOverlay ?? ['sneaker', 'hightop', 'runner', 'boot', 'hiker'].includes(s.style)) add('heel-overlay', 'Heel overlay', band(0, F * .23, x => bot(x) - 2.1 + Math.max(0, x / (F * .23)) * .6, bot, { lean1: -.5 }), { z: 5, fabric: fabOv });
  add('back-tab', 'Back tab', [[-.05, collarBack - .5], [.75, collarBack - .45], [.7, collarBack + 1.3], [-.05, collarBack + 1.3]], { z: 6, margin: 0, fabric: fabOv, notes: ['Pull loop, sewn into the back seam'] });
  // inside: linings, the collar foam, the stiffeners
  add('quarter-lining', 'Quarter lining', band(0, qEnd + .3, topline, bot), { z: -3, cut: 4, fabric: 'lining', notes: [LININGS[s.lining]] });
  add('vamp-lining', 'Vamp lining', vamp, { z: -3, fabric: 'lining', sew: symmetric(vampX - .35, L - .02, .4, crest, bot, .4), pair: false });
  if (S.collar < 7) add('collar-foam', 'Collar foam', band(0, throat0, topline, x => topline(x) + 1), { z: -4, cut: 4, margin: 0, fabric: 'foam', notes: ['6 mm open-cell foam, skived to nothing at the edges'] });
  add('counter', 'Heel counter', band(0, F * .25, x => bot(x) - 2.0, bot), { z: -5, margin: .4, fabric: 'stiffener', notes: ['Thermoplastic, moulded over the heel of the last'] });
  add('toe-puff', 'Toe puff', band(L - 2.2, L - .02, crest, bot, { lean0: .7 }), { z: -5, margin: .4, pair: false, fabric: 'stiffener', notes: ['Holds the toe\'s shape'] });
  // under the foot: the insole board and the sockliner are cut from the bottom view; the sole unit is moulded
  const sole = last.bottom, sock = sole;
  const bplace = z => ({ view: 'back', x: 0, y: 0, z });
  pieces.push(piece('insole', 'Insole board', sole, { cut: 2, pair: true, fabric: 'board', place: bplace(1), sa: 0, notes: ['Cellulose board, 2 mm; the upper is lasted onto it'] }));
  pieces.push(piece('sockliner', 'Sockliner', sock, { cut: 2, pair: true, fabric: 'foam', place: bplace(2), sa: 0, notes: ['4 mm foam with a printed top cover'] }));
  const sh = s.soleHeight || (S.sole === 'cupsole' ? 1.1 : S.sole === 'midsole' ? 1.35 : .55), soleSide = [...Array.from({ length: 31 }, (_, i) => { const x = -.1 + (L + .2) * i / 30; return [x, bot(Math.min(Math.max(x, 0), L)) + .05]; }), ...Array.from({ length: 31 }, (_, i) => { const x = L + .2 - (L + .3) * i / 30; const xx = Math.min(Math.max(x, 0), L); return [x, xx <= last.ballFromHeel ? 0 : bot(xx) - bot(last.ballFromHeel)]; })]; // the tread on the ground to the ball, then up with the toe spring
  const soleName = S.sole === 'cupsole' ? 'Cupsole (rubber)' : S.sole === 'midsole' ? 'Midsole (EVA) and outsole' : 'Outsole and heel (rubber, stitched)';
  pieces.push(piece('sole', soleName, soleSide, { cut: 0, component: true, fabric: S.sole === 'midsole' ? 'eva' : 'rubber', place: { view: 'front', x: 0, y: 0, z: 7 }, notes: ['Moulded, not cut: one mould for each pair of half sizes'] }));
  return { kind: 'footwear', spec: s, label: S.label, size: `${SYSTEMS[s.system].replace(/ \(.*$/, '')} ${last.size} ${s.width}`.trim(), sa: .25, pieces, last, views: { front: 'Side', back: 'Bottom' },
    notes: [`${UPPERS[s.upper]} upper, ${LININGS[s.lining].toLowerCase()}`, 'Overlaps ⅜ in, skived and cemented before stitching; the lasting allowance is ⅝ in', ...notes, 'A first draft on the standard of the last: the pattern engineer trues it up on the fitting sample'],
    checks: footwearChecks(s, last), components: components(s, last), tooling: tooling(s) };
}

// what goes into a pair that is not cut from the hide
export function components(input = {}, last = lastOf(input)) {
  const s = cleanFootwear(input), S = lineOf(s), out = [];
  out.push({ name: S.sole === 'cupsole' ? 'Rubber cupsole' : S.sole === 'midsole' ? 'EVA midsole and rubber outsole' : 'Rubber outsole and stacked heel', qty: '1 pair', how: S.sole === 'stitched' ? 'Goodyear welted or Blake stitched' : 'Cemented and pressed' });
  if (S.laced) out.push({ name: 'Laces', qty: '1 pair', how: 'Flat or round, with aglets' }, { name: 'Eyelets', qty: 'see the eyestay', how: 'Metal or punched' });
  if (s.style === 'chelsea') out.push({ name: 'Elastic gore', qty: '4 panels', how: 'Twin-needle' });
  if (s.style === 'loafer') out.push({ name: 'Saddle strap', qty: '2', how: 'Leather, set over the apron seam' });
  out.push({ name: 'Heel counter and toe puff', qty: '1 pair each', how: 'Thermoplastic, activated in the lasting' }, { name: 'Shank', qty: '1 pair', how: S.sole === 'stitched' ? 'Steel' : 'Fibreglass or none' }, { name: 'Size and law labels', qty: '1 pair', how: 'Printed on the tongue lining' }, { name: 'Box and tissue', qty: '1', how: '' });
  return out;
}
// the tools a run takes: a pair of lasts for each size (and width), a sole mould for each pair of half sizes; rough costs and lead times
export function tooling(input = {}) {
  const s = cleanFootwear(input), S = lineOf(s), run = sizeRun(s), moulds = new Set(run.map(r => r.mould)).size;
  const mouldCost = S.sole === 'cupsole' ? [1800, 3500] : S.sole === 'midsole' ? [2500, 5000] : [900, 1800];
  return { sizes: run.length, lastPairs: run.length, lastCost: [run.length * 40, run.length * 90], moulds, mouldCost: [moulds * mouldCost[0], moulds * mouldCost[1]], weeks: S.sole === 'stitched' ? [3, 5] : [5, 8],
    note: `${run.length} sizes: ${run.length} pairs of lasts (plastic, about $40–90 a pair), ${moulds} sole moulds${S.sole === 'stitched' ? ' (or a stock sole, with no mould)' : ''}, about ${S.sole === 'stitched' ? '3–5' : '5–8'} weeks for the tools` };
}
export function footwearChecks(input = {}, last = lastOf(input)) {
  const s = cleanFootwear(input), S = lineOf(s), out = [];
  const pitchRange = { sneaker: [.25, 1], hightop: [.25, 1], runner: [.2, .8], derby: [.6, 1.6], loafer: [.5, 1.4], chelsea: [.75, 1.75], boot: [.75, 2], hiker: [.5, 1.5] }[s.style];
  if (s.heel < pitchRange[0] || s.heel > pitchRange[1]) out.push({ level: 'warn', msg: `A ${r8(s.heel)} in heel is outside what a ${S.label.toLowerCase()} usually takes (${pitchRange[0]}–${pitchRange[1]} in): check the last maker can build it and the pitch is comfortable.` });
  if (s.spring < s.heel * .25 && s.heel > 1) out.push({ level: 'warn', msg: 'A high heel with little toe spring rocks badly: add spring, about a third of the heel height.' });
  if (s.toe === 'pointed' && ['sneaker', 'hightop', 'runner', 'hiker'].includes(s.style)) out.push({ level: 'warn', msg: 'A pointed toe on an athletic last pinches: an almond or round toe is usual.' });
  if (S.collar < 4 && S.collar - .45 > 2.4 + (last.foot - 10.33) * .1) out.push({ level: 'warn', msg: 'The collar dips to just under the ankle bone: check it does not rub on the fitting sample.' });
  if (s.upper === 'mesh' && s.toeCap === false && s.style !== 'runner') out.push({ level: 'info', msg: 'A mesh upper wants a toe bumper or cap to keep its shape.' });
  out.push({ level: 'info', msg: `Fitting sample in size ${s.size}${s.width ? ' ' + s.width : ''}, then a size-run sample (the smallest, the middle and the largest) before the moulds are cut.` });
  out.push({ level: 'info', msg: 'Tests: sole bond (peel), flex (Bally or Ross), abrasion, colour fastness, and the restricted-substances list (CA Prop 65 / REACH) for leather and rubber.' });
  return out;
}
// leather by the square foot (a hide is sold that way), with a quarter lost to the cutting round the hide's flaws
export function hideArea(pat) {
  const by = {}; for (const q of pat.pieces) { if (!q.cut || q.component || !['upper', 'overlay', 'lining'].includes(q.fabric)) continue; by[q.fabric] = (by[q.fabric] || 0) + areaOf(q.sew) * q.cut; }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 144 * 1.25 * 100) / 100]));
}
export function lastSvg(input = {}, size = null) {
  const l = lastOf(input, size), b1 = boundsOf(l.side), b2 = boundsOf(l.bottom), gap = 2.2, W = l.length + 4, y2 = b1.y1 - b1.y0 + gap + 2.4;
  const P = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L') + ' Z', esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = (x, y, txt, sz = .3, a = 'start') => `<text x="${r3(x)}" y="${r3(y)}" font-size="${sz}" text-anchor="${a}" font-family="Helvetica,Arial,sans-serif">${esc(txt)}</text>`;
  const dim = (x0, x1, y, txt) => `<path d="M${r3(x0)} ${r3(y)} L${r3(x1)} ${r3(y)}" stroke="#17603a" stroke-width=".02"/><path d="M${r3(x0)} ${r3(y - .12)} L${r3(x0)} ${r3(y + .12)} M${r3(x1)} ${r3(y - .12)} L${r3(x1)} ${r3(y + .12)}" stroke="#17603a" stroke-width=".02"/>${t((x0 + x1) / 2, y - .12, txt, .26, 'middle')}`;
  const H = y2 + b2.y1 - b2.y0 + 2.6;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}in" height="${r3(H)}in" viewBox="-1.5 ${r3(b1.y0 - 1.6)} ${r3(W)} ${r3(H)}">`
    + t(-1, b1.y0 - .9, `Last · ${l.S.label} · size ${l.size} ${l.s.width} · ${TOES[l.s.toe].label} toe`, .38)
    + `<path d="${P(l.side)}" fill="#efece4" stroke="#141416" stroke-width=".03"/>` + `<path d="M-.5 0 L${r3(l.length + .5)} 0" stroke="#999" stroke-width=".02"/>`
    + dim(0, l.length, .6, `last length ${r8(l.length)} in (${Math.round(l.length * 25.4)} mm)`) + dim(0, l.ballFromHeel, 1.1, `ball ${r8(l.ballFromHeel)} in from the heel`)
    + t(-1.3, -l.heelHeight / 2, `heel ${r8(l.heelHeight)} in`, .24) + t(l.length - 1.2, -l.toeSpring - .3, `toe spring ${r8(l.toeSpring)} in`, .24)
    + `<g transform="translate(0 ${r3(y2 - b2.y0)})"><path d="${P(l.bottom)}" fill="#efece4" stroke="#141416" stroke-width=".03"/>${t(-1, b2.y1 + .9, `ball girth ${r8(l.ballGirth)} in · instep girth ${r8(l.instepGirth)} in · ball width ${r8(l.ballWidth)} in · heel width ${r8(l.heelWidth)} in`, .26)}</g></svg>\n`;
}
