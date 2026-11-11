// Design Lab footwear: the last a shoe is built on, its size run, and the pattern of its upper, drafted on the last's standard (the flattened side
// of the last). The same file runs in the page (served as /lab/lab-footwear.js) and on the service (the files), so it uses neither the DOM nor Node.
//   lastOf(spec, size)        → the last: its length, girths, widths, heel height and toe spring, and its side, bottom and top views (inches)
//   sizeRun(spec)             → every size in the run: last length, ball girth, the other size systems, which outsole mould it shares
//   footwearPattern(spec, s)  → a pattern (src/lab-pattern.js shape): the upper's pieces as they are cut and as they sit on the shoe (the side
//                               view), the linings, foams and stiffeners, the insole and sockliner, and the moulded sole unit as components
//   footwearChecks, tooling   → what to look at before a sample, and what the lasts and the sole moulds take
//   footwearAssembly(pat)     → does the pattern go together? every seam walked and every fit measured off the pieces and the last
//                               (docs/pattern-process.md); what fails is a finding in footwearChecks
// How many of each piece: `cut` is for a PAIR of shoes. A piece there is one of on a shoe is cut 2 (a vamp; a quarter, the second turned
// over for the other foot); a piece drawn for one side that goes on both sides of each shoe is cut 4 (a quarter lining, an eyestay).
// Lengths are inches; on the side view x runs from the back of the heel to the toe and y up is negative. The last and the pattern are a
// first draft from the size and the style: a last maker and a pattern engineer true them up on the first fitting sample.
import { cleanSketches, VIEWS_OF } from './lab-sketch.js';
import { cleanLogos } from './lab-logos.js';
import { piece, cubic, tidy, blob, boundsOf, areaOf, offsetOf } from './lab-pattern.js';
import { shellOf, flattenPiece, flattenPoint, splitPiece, ringOf } from './lab-last-shell.js';

const r3 = v => Math.round(v * 1000) / 1000, r8 = v => Math.round(v * 8) / 8, r1 = v => Math.round(v * 10) / 10;
export const FW_STYLES = {
  sneaker: { label: 'Court sneaker (low)', heel: .45, spring: .55, collar: 2.7, laced: true, throat: .4, sole: 'cupsole', toe: 'round' },
  hightop: { label: 'High-top sneaker', heel: .5, spring: .55, collar: 5.2, laced: true, throat: .26, sole: 'cupsole', toe: 'round', shaft: true },
  runner: { label: 'Runner', heel: .4, spring: .7, collar: 2.9, laced: true, throat: .36, sole: 'midsole', toe: 'round' },
  derby: { label: 'Derby', heel: 1, spring: .45, collar: 2.4, laced: true, throat: .45, sole: 'stitched', toe: 'almond' },
  loafer: { label: 'Penny loafer', heel: .9, spring: .4, collar: 2.15, laced: false, throat: .58, sole: 'stitched', toe: 'almond' },
  chelsea: { label: 'Chelsea boot', heel: 1.25, spring: .45, collar: 6, laced: false, throat: .3, sole: 'stitched', toe: 'round', shaft: true },
  boot: { label: 'Lace-up boot (6 in)', heel: 1.25, spring: .5, collar: 6.5, laced: true, throat: .2, sole: 'stitched', toe: 'round', shaft: true },
  hiker: { label: 'Hiking boot', heel: 1, spring: .6, collar: 5.5, laced: true, throat: .22, sole: 'midsole', toe: 'round', shaft: true },
  // backless and open footwear: a mule is a closed toe with no back (board-lasted like a loafer); a sandal is straps tucked under a footbed; a
  // footbed clog a closed vamp tucked under a cork or wooden footbed, no back; a moulded slide or clog is injected in one piece (no upper pulled
  // over a last: the only cut parts are a slide's strap)
  mule: { label: 'Mule (backless)', heel: .75, spring: .4, collar: 1.8, laced: false, throat: .42, sole: 'stitched', toe: 'almond', backless: true },
  sandal: { label: 'Sandal (straps on a footbed)', heel: .5, spring: .3, collar: 0, laced: false, throat: .5, sole: 'footbed', toe: 'round', open: 'sandal' },
  'footbed-clog': { label: 'Footbed clog (backless)', heel: .75, spring: .3, collar: 0, laced: false, throat: .42, sole: 'footbed', toe: 'round', open: 'clog' },
  moulded: { label: 'Moulded slide or clog', heel: .5, spring: .35, collar: 0, laced: false, throat: .45, sole: 'moulded', toe: 'round', open: 'moulded' }
};
// the ways each of those is made: what a variant changes from its style (the first is the style's own)
export const VARIANTS = {
  mule: { loafer: { label: 'Loafer mule (moc apron, leather sole)' }, heeled: { label: 'Heeled mule (block heel)', heel: 2.25, spring: .3, sole: 'stitched' }, sneaker: { label: 'Sneaker mule (laced, cupsole)', laced: true, sole: 'cupsole', toe: 'round', throat: .4, heel: .45, spring: .55 } },
  sandal: { 'two-strap': { label: 'Two-strap footbed sandal' }, thong: { label: 'Thong (flip-flop)', heel: .35, spring: .25 }, fisherman: { label: 'Fisherman sandal (woven straps, closed heel)', heel: .6 }, multi: { label: 'Multi-strap flat sandal', heel: .35 } },
  'footbed-clog': { suede: { label: 'Suede footbed clog (buckle strap)' }, wood: { label: 'Clog on a wooden base', heel: 1, spring: .35, base: 'wood' } },
  moulded: { slide: { label: 'Pool slide (moulded footbed, cut strap)' }, recovery: { label: 'Recovery slide (one piece, thick foam)', heel: .75 }, clog: { label: 'Moulded clog (vents, heel strap)', heel: .6 } }
};
const variantOf = (style, v) => { const V = VARIANTS[style]; return V ? (V[v] ? v : Object.keys(V)[0]) : null; };
export const TOES = { round: { label: 'Round', allowance: .5 }, almond: { label: 'Almond', allowance: .75 }, square: { label: 'Square', allowance: .6 }, pointed: { label: 'Pointed', allowance: 1.25 } };
export const SYSTEMS = { 'us-m': "US men's", 'us-w': "US women's", uk: 'UK', eu: 'EU (Paris points)', mm: 'Mondopoint (foot length, mm)' };
export const WIDTHS = { 'us-m': ['B', 'C', 'D', 'E', 'EE', 'EEEE'], 'us-w': ['AA', 'A', 'B', 'C', 'D', 'E'] };
export const UPPERS = { leather: 'Full-grain leather', suede: 'Suede', nubuck: 'Nubuck', canvas: 'Canvas', mesh: 'Engineered mesh', synthetic: 'Synthetic leather' };
export const LININGS = { leather: 'Leather lining', textile: 'Textile lining', mesh: 'Mesh lining', shearling: 'Shearling lining (or faux shearling)', insulated: 'Insulated textile lining (200 g)' };
// the padding each style carries, in mm: the collar foam (0 for a dress shoe or a Chelsea, whose leather lining sits close) and the tongue foam
export const PADDING = { sneaker: { collar: 6, tongue: 5 }, hightop: { collar: 8, tongue: 6 }, runner: { collar: 6, tongue: 4 }, derby: { collar: 0, tongue: 2 }, loafer: { collar: 0, tongue: 0 },
  chelsea: { collar: 0, tongue: 0 }, boot: { collar: 8, tongue: 6 }, hiker: { collar: 10, tongue: 8 }, mule: { collar: 0, tongue: 0 }, sandal: { collar: 0, tongue: 0 }, 'footbed-clog': { collar: 0, tongue: 0 }, moulded: { collar: 0, tongue: 0 } };
// how the upper is closed under the foot: board-lasted (cemented to an insole board) or strobel (sewn to a strobel sock; runners and hikers)
// (a sandal, a footbed clog or a moulded shoe is not lasted: its straps or vamp are tucked under the footbed, or it is moulded whole)
export const lastingOf = s => (FW_STYLES[s.style]?.open ? 'none' : FW_STYLES[s.style] && lineOf(s).sole === 'midsole' ? 'strobel' : 'board');
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
export function fwDefaults(style = 'sneaker', variant = null) { const v = variantOf(style, variant), S = { ...(FW_STYLES[style] || FW_STYLES.sneaker), ...(v ? VARIANTS[style][v] : {}) }; return { style: FW_STYLES[style] ? style : 'sneaker', ...(v ? { variant: v } : {}), system: 'us-m', size: 9, width: 'D', toe: S.toe, toeCap: style === 'sneaker' || style === 'boot', upper: style === 'runner' ? 'mesh' : style === 'footbed-clog' && v === 'suede' ? 'suede' : style === 'moulded' ? 'synthetic' : 'leather', lining: style === 'runner' ? 'mesh' : ['derby', 'loafer', 'chelsea', 'mule', 'sandal', 'footbed-clog'].includes(style) ? 'leather' : 'textile', membrane: style === 'hiker', heel: S.heel, spring: S.spring, runFrom: 7, runTo: 13, halves: style !== 'moulded' && style !== 'sandal' }; }
export function cleanFootwear(input = {}) {
  const d = fwDefaults(FW_STYLES[input.style] ? input.style : 'sneaker', input.variant), sys = SYSTEMS[input.system] ? input.system : d.system, [lo, hi] = SIZE_LIMITS[sys];
  const num = (v, a, b, def, step = .5) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(Math.max(n, a), b) / step) * step : def; };
  const defSize = sys === 'us-w' ? 7 : sys === 'uk' ? 8 : sys === 'eu' ? 42 : sys === 'mm' ? 265 : 9, widths = WIDTHS[sys] || WIDTHS['us-m'];
  const size = num(input.size, lo, hi, defSize, sys === 'eu' || sys === 'mm' ? 1 : .5);
  const runFrom = num(input.runFrom, lo, hi, sys === 'us-w' ? 5 : sys === 'eu' ? 39 : sys === 'mm' ? 240 : 7, sys === 'eu' || sys === 'mm' ? 1 : .5), runTo = num(input.runTo, runFrom, hi, Math.max(runFrom, sys === 'us-w' ? 11 : sys === 'eu' ? 46 : sys === 'mm' ? 300 : 13), sys === 'eu' || sys === 'mm' ? 1 : .5);
  return { style: d.style, ...(d.variant ? { variant: d.variant } : {}), system: sys, size, width: widths.includes(input.width) ? input.width : MEDIUM[sys] || 'D', toe: TOES[input.toe] ? input.toe : d.toe, toeCap: input.toeCap == null ? d.toeCap : Boolean(input.toeCap),
    upper: UPPERS[input.upper] ? input.upper : d.upper, lining: LININGS[input.lining] ? input.lining : d.lining, membrane: input.membrane == null ? d.membrane : Boolean(input.membrane), heel: num(input.heel, 0, 4, d.heel, .125), spring: num(input.spring, 0, 1.5, d.spring, .125), runFrom, runTo, halves: input.halves == null ? d.halves : Boolean(input.halves),
    // read from a picture (or set by hand): the lines and the sole, which otherwise come from the style
    ...cleanLines(input), ...(cleanLast3d(input.last3d) ? { last3d: cleanLast3d(input.last3d) } : {}), ...(cleanSeams(input.seams).length ? { seams: cleanSeams(input.seams) } : {}), ...(input.flatten === false ? { flatten: false } : {}),
    // drawn by hand on the views or on the last (src/lab-sketch.js)
    ...(cleanSketches(input.sketches, VIEWS_OF.footwear).length ? { sketches: cleanSketches(input.sketches, VIEWS_OF.footwear) } : {}),
    // our logos and graphics placed on its views (src/lab-logos.js)
    ...(cleanLogos(input.logos, 'footwear').length ? { logos: cleanLogos(input.logos, 'footwear') } : {}) };
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
// seams drawn on the last (the Pattern page's On the last view): side-view points along the line, the piece it cuts, which side it is on
export function cleanSeams(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 8).map((sm, k) => {
    if (!sm || typeof sm !== 'object' || !/^[a-z0-9-]{1,40}$/.test(String(sm.piece || '')) || !Array.isArray(sm.pts)) return null;
    const pts = sm.pts.slice(0, 60).filter(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(Number(v)) && Math.abs(Number(v)) < 40)).map(p => [r3(Number(p[0])), r3(Number(p[1]))]);
    return pts.length >= 2 ? { id: /^s[a-z0-9]{1,12}$/.test(String(sm.id || '')) ? String(sm.id) : `s${k + 1}`, n: k + 1, name: String(sm.name || `Seam ${k + 1}`).replace(/\s+/g, ' ').trim().slice(0, 40), side: sm.side === 'medial' ? 'medial' : 'lateral', piece: String(sm.piece), pts } : null;
  }).filter(Boolean);
}
// the sole unit's thickness at the heel: as read or set, or the heel height on the sole's usual thickness under the forefoot (a cupsole about
// ⅝ in, an EVA midsole about 1 in, a stitched sole about ¼ in)
export const soleHeightOf = (input = {}) => { const s = input.style && FW_STYLES[input.style] && input.heel != null ? input : cleanFootwear(input), S = lineOf(s); return s.soleHeight || r8(s.heel + (S.sole === 'cupsole' ? .65 : S.sole === 'midsole' ? .95 : S.sole === 'footbed' ? .55 : S.sole === 'moulded' ? .7 : .3)); };
// the size a foot length is in a system (the other way from footLength)
export function sizeFromFoot(system, F) { return system === 'us-w' ? F * 3 - 21 : system === 'uk' ? F * 3 - 23 : system === 'eu' ? (F + .55) * 2.54 * 1.5 : system === 'mm' ? F * 25.4 : F * 3 - 22; }
const HEX = /^#[0-9a-f]{6}$/i, opt = (v, a, b, step = .125) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(Math.max(n, a), b) / step) * step : null; };
export const SOLES = { cupsole: 'Cupsole (rubber, stitched or cemented)', midsole: 'EVA midsole and rubber outsole', stitched: 'Stitched leather or rubber sole and heel', footbed: 'Contoured footbed (cork and latex, or wood) on a rubber outsole', moulded: 'Injection-moulded EVA, in one piece' };
function cleanLines(i = {}) {
  const out = {}, put = (k, v) => { if (v != null) out[k] = v; };
  put('collar', opt(i.collar, 1.5, 10)); put('vamp', opt(i.vamp, .4, .75, .01)); put('throat', opt(i.throat, .1, .6, .01)); put('soleHeight', opt(i.soleHeight, .25, 2.5));
  put('eyelets', opt(i.eyelets, 3, 14, 1)); put('capLen', opt(i.capLen, 1.2, 4, .0625)); put('mudH', opt(i.mudH, .4, 1.6, .0625)); put('heelH', opt(i.heelH, 1, 3.5, .0625)); if (SOLES[i.sole]) out.sole = i.sole; if (typeof i.mudguard === 'boolean') out.mudguard = i.mudguard; if (typeof i.heelOverlay === 'boolean') out.heelOverlay = i.heelOverlay;
  const c = i.colours && typeof i.colours === 'object' ? Object.fromEntries(['upper', 'overlay', 'sole', 'outsole', 'lace', 'lining'].filter(k => HEX.test(String(i.colours[k] || ''))).map(k => [k, String(i.colours[k]).toLowerCase()])) : {}; if (Object.keys(c).length) out.colours = c;
  const p = i.picture; if (p && typeof p === 'object' && [p.imgW, p.imgH, p.x0, p.y0, p.x1, p.y1].every(v => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 20000) && Number(p.x1) > Number(p.x0) && Number(p.y1) > Number(p.y0))
    out.picture = { imgW: Math.round(p.imgW), imgH: Math.round(p.imgH), x0: Math.round(p.x0), y0: Math.round(p.y0), x1: Math.round(p.x1), y1: Math.round(p.y1), toeLeft: Boolean(p.toeLeft), at: String(p.at || '').slice(0, 30), ...(p.src === 'side' || p.src === 'drawing' ? { src: p.src } : {}) };
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
  // the toe box keeps its height well forward of the ball and rounds over at the tip (not a wedge down to it)
  const H = [[0, 3.35], [F * .3, 3.95], [F * .55, 2.95], [ball, 1.95], [L - 1.6, 1.55], [L - .55, 1.2], [L, .55]].map(([x, y]) => [x, y * k]);
  const heightAt = x => { for (let i = 1; i < H.length; i++) if (H[i][0] >= x) { const [a, b] = [H[i - 1], H[i]], t = (x - a[0]) / ((b[0] - a[0]) || 1), e = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * e; } return H[H.length - 1][1]; };
  const crest = x => lastBottom(x) - heightAt(x);
  const xs = n => Array.from({ length: n + 1 }, (_, i) => L * i / n);
  const side = [...xs(40).map(x => [x, lastBottom(x)]), ...xs(40).reverse().map(x => [x, crest(x)])];
  // the bottom view (the insole shape): x along the last, y across with the inside (medial) negative; the medial ball sits further forward
  const tip = { round: [[L * .95, -ballW * .28], [L, -ballW * .02], [L * .95, ballW * .26]], almond: [[L * .94, -ballW * .22], [L, -ballW * .05], [L * .94, ballW * .18]], square: [[L * .97, -ballW * .38], [L, -ballW * .1], [L * .99, ballW * .3]], pointed: [[L * .9, -ballW * .2], [L, -ballW * .02], [L * .9, ballW * .14]] }[s.toe];
  // (a smooth line through its points runs a little past the tip, about 1/10 in: the toe is drawn back in so the outline ends where the last
  // does, at its length; the insole, the strobel sock and the 3D last are all cut from this outline)
  const rawBottom = blob([[0, 0], [F * .12, -heelW / 2], [F * .45, -waistW * .32], [F * .73, -ballW * .55], tip[0], tip[1], tip[2], [F * .66, ballW * .45], [F * .45, waistW * .66], [F * .12, heelW / 2]], .75);
  const xTip = Math.max(...rawBottom.map(q => q[0])), x9 = L * .9, bottomView = rawBottom.map(([x, y]) => [x > x9 && xTip > L ? x9 + (x - x9) * (L - x9) / (xTip - x9) : x, y]);
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
const STROBEL_MARGIN = .2; // a strobel upper is not folded under: its edge lies 3/16 in under the last, where it meets the strobel sock's edge
const LINING_MARGIN = .4; // a lining, a counter and a toe puff are lasted with the upper but stop short of its edge, so the fold is not bulky
export const LAP = .375; // an underlay: how far one piece runs under the next (skived, cemented, then stitched): ⅜ in
const TOE_ROUND = .1; // the last 1/10 in of the last is the round of the toe: a piece cut whole is carried round it (src/lab-last-shell.js)
// as cut: the band with its bottom edge let down by the lasting allowance
const withMargin = (pts, bot, m = LAST_MARGIN) => pts.map(([x, y]) => Math.abs(y - bot(x)) < .02 ? [x, y + m] : [x, y]);
// a piece symmetrical about the crest (a vamp, a toe cap), as it is cut: its lower half (down its back edge, along the bottom with the lasting
// allowance, up the toe) mirrored over the line through its two crest ends
function symmetric(x0, x1, lean, crest, bot, margin = LAST_MARGIN, toTip = false) {
  const A = [x0 + lean, crest(x0 + lean)], B = [x1, crest(x1)], n = 20;
  const back = cubic(A, [A[0] - lean * .2, A[1] + (bot(x0) - A[1]) * .35], [x0 + lean * .1, bot(x0) - .3], [x0, bot(x0) + margin], 8);
  // (along the bottom a point at every 1/10 in from the heel, the same places on every piece cut whole: a toe puff's edge and its vamp's are
  // then drawn through the same sections, and one cannot stand outside the other between two of its points)
  const xs = [x1]; for (let k = Math.ceil(x1 * 10 - 1e-6) - 1; k / 10 > x0 + .02; k--) xs.unshift(k / 10); void n;
  const along = xs.map(x => [x, bot(x) + margin]);
  const front = cubic([x1, bot(x1) + margin], [x1 + .25, bot(x1)], [x1 + .2, B[1] + .3], B, 6).slice(1);
  const lower = [...back, ...along, ...front], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
  const refl = ([x, y]) => { const t = ((x - A[0]) * dx + (y - A[1]) * dy) / L2, px = A[0] + t * dx, py = A[1] + t * dy; return [2 * px - x, 2 * py - y]; };
  // the half kept: the piece is cut from it developed about its fold (src/lab-last-shell.js), not from this side-view outline. A piece that
  // runs to the toe is carried round the tip there (its half stops at the bottom edge); one that stops short closes up its own front
  return Object.assign([...lower, ...lower.slice(1, -1).reverse().map(refl)], { lower: toTip ? [...back, ...along] : lower });
}

// ---- open footwear: a sandal, a footbed clog, a moulded slide or clog ----
// Nothing is pulled over a last: the straps (or a clog's vamp) are cut flat, wrapped over the foot and tucked ⅝ in under the footbed, where they
// are cemented (or nailed, on a wooden base) between the footbed and the outsole. A strap's length is the way over the foot at its place: half
// round an ellipse as wide as the footbed and as high as the last, less a little so it sits snug. The footbed and the outsole are made, not cut
// (a cork-latex or wooden footbed, an EVA one for a thong); a moulded slide or clog is injected whole and only a slide's strap is cut.
const TUCK = .625;
function openPattern(s, last, S) {
  const { F, L, lastBottom: bot, crest } = last, V = s.variant, pieces = [], notes = [], marks = { eyelets: [], collar: [], lines: [], open: S.open };
  const sidePlace = z => ({ view: 'front', x: 0, y: 0, z }), bplace = z => ({ view: 'back', x: 0, y: 0, z });
  // the footbed's width at x (from the last's bottom outline), and the way over the foot there
  const widthAt = x => { const P = last.bottom; let lo = 0, hi = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { const y = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); lo = Math.min(lo, y); hi = Math.max(hi, y); } } return hi - lo || last.ballWidth; };
  const over = (x, snug = .12) => { const a = widthAt(x) / 2 + .08, b = Math.max(.35, bot(x) - crest(x) - snug); return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) / 2; };
  // a strap as cut: a strip with its ends eased round
  const strip = (len, w) => [[0, -w / 2], ...cubic([len - .2, -w / 2], [len, -w / 2], [len + .05, -w * .2], [len + .05, 0], 4), ...cubic([len + .05, 0], [len + .05, w * .2], [len, w / 2], [len - .2, w / 2], 4).slice(1), [0, w / 2], [-.05, 0]];
  const back = n => (s.lining && LININGS[s.lining] ? LININGS[s.lining].replace(' lining', '') : 'Leather') + ` backing, cemented to the face and the edges painted${n ? '; ' + n : ''}`;
  const strap = (id, name, sew, shown, o = {}) => {
    pieces.push(piece(id, name, sew, { shown, place: sidePlace(o.z ?? 2), cut: o.cut ?? 2, pair: o.pair ?? true, fabric: o.fabric || 'upper', sa: 0, notes: o.notes || [] }));
    if (o.lined !== false) pieces.push(piece(`${id}-lining`, `${name} lining`, sew, { shown, place: sidePlace(-3), cut: o.cut ?? 2, pair: o.pair ?? true, fabric: 'lining', hidden: true, sa: 0, notes: [back()] }));
  };
  // a strap across the foot at x, w wide, tucked under both edges; a buckle splits it on the outside (the long side punched for the tongue)
  const crossAt = (id, name, xc, w, o = {}) => {
    const run = over(xc, o.snug), shown = band(xc - w / 2, xc + w / 2, x => crest(x) + (o.snug ?? .12), bot, { n: 6 });
    if (o.buckle) {
      const longL = run * .62 + TUCK + 1.2, shortL = run * .38 + TUCK + .5;
      strap(`${id}-long`, `${name}, holed side`, strip(longL, w), shown, { ...o, notes: [`${r8(longL)} in, ${r8(TUCK)} in tucked under the inside edge; 5 holes ½ in apart from 1 in from the end`] });
      strap(`${id}-buckle`, `${name}, buckle side`, strip(shortL, w), shown, { ...o, z: (o.z ?? 2) + .1, notes: [`${r8(shortL)} in, ${r8(TUCK)} in tucked under the outside edge; folded over the buckle bar and stitched`] });
      return 2;
    }
    const len = run + 2 * TUCK; strap(id, name, strip(len, w), shown, { ...o, notes: [`${r8(len)} in long, ${r8(TUCK)} in tucked under the footbed at each side`, ...(o.notes || [])] }); return 0;
  };
  // a strap from a to b in the side view (a thong's, a heel strap), its shown outline a band w wide along the line
  const along = (a, b, w) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d * w / 2, ny = dx / d * w / 2; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; };
  let buckles = 0; const heelBack = x => bot(x) - 1.7 + x * .25;
  if (S.open === 'sandal') {
    if (V === 'thong') {
      // the post between the big toe and the next, and a strap from it down to each side of the footbed by the waist
      const post = [L * .83, crest(L * .83) + .45], side = [F * .5, bot(F * .5)], len = Math.hypot(post[0] - side[0], post[1] - side[1], widthAt(F * .5) / 2) * 1.06 + TUCK;
      strap('strap-lat', 'Strap, outside', strip(len, .7), along(post, side, .7), { z: 2, notes: [`${r8(len)} in: from the toe post to the footbed's outside edge, ${r8(TUCK)} in tucked under`] });
      strap('strap-med', 'Strap, inside', strip(len, .7), along(post, [F * .54, bot(F * .54)], .7), { z: 1, notes: ['As the outside, to the inside edge, a little further forward'] });
      pieces.push(piece('toe-post', 'Toe post', strip(1.4, .45), { shown: along(post, [post[0] + .1, bot(post[0])], .4), place: sidePlace(3), cut: 2, pair: true, fabric: 'upper', sa: 0, notes: ['Through a slot in the footbed and the outsole, locked under with a plug'] }));
      marks.post = [r3(post[0]), r3(post[1])];
    } else if (V === 'fisherman' || V === 'multi') {
      const xs = V === 'fisherman' ? [.64, .72, .8, .88, .95].map(k => L * k) : [F * .5, F * .63, F * .76, F * .89], w = V === 'fisherman' ? .5 : .55;
      xs.forEach((x, i) => crossAt(`strap-${i + 1}`, `Cross strap ${i + 1}`, Math.min(x, L - w), w, { z: 2 + i * .01 }));
      if (V === 'fisherman') strap('spine', 'Centre strap', strip(Math.hypot(L - .2 - F * .6, crest(L - .2) - crest(F * .6)) + .6, .5), band(F * .6, L - .2, crest, x => crest(x) + .5), { z: 4, cut: 2, notes: ['Laid along the top of the cross straps and stitched through each'] });
      // the heel strap round the back, and the ankle strap with its buckle
      const hl = last.heelWidth * Math.PI / 2 + 2 * F * .28 + 2 * TUCK;
      strap('heel-strap', 'Heel strap', strip(hl, 1.1), band(0, F * .3, heelBack, bot, { lean1: .3 }), { z: 3, notes: [`${r8(hl)} in round the heel, ${r8(TUCK)} in tucked under at each side; a heel counter between face and lining${V === 'fisherman' ? '' : ' (a light one)'}`] });
      const al = (last.instepGirth * .5 + 1.5);
      strap('ankle-strap', 'Ankle strap', strip(al, .6), along([F * .06, heelBack(F * .06) + .2], [F * .34, crest(F * .34) + .1], .6), { z: 4, notes: [`${r8(al)} in, through a loop at the top of the heel strap; 5 holes ½ in apart`] });
      strap('buckle-tab', 'Buckle tab', strip(2.2, .6), along([F * .3, heelBack(F * .3) + .5], [F * .38, heelBack(F * .38) + .55], .6), { z: 5, notes: ['Folded over the buckle bar, stitched to the heel strap on the outside'] });
      buckles = 1;
      // (the counter is one piece round the heel: the half that shows on the side and the same again the other side of the back)
      { const half = band(0, F * .26, x => heelBack(x) + .25, bot), one = half.slice(0, 2 * 18 + 9), round = [...one, ...one.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
        pieces.push(Object.assign(piece('counter', 'Heel counter', round, { shown: half, place: sidePlace(-5), cut: 2, pair: false, fabric: 'stiffener', hidden: true, sa: 0, notes: ['Thermoplastic, between the heel strap and its lining; cut in one round the back of the heel'] }), { on: 'whole' })); }
    } else {
      // two straps, each with a buckle on the outside
      buckles = crossAt('strap-toe', 'Toe strap', L * .74, 1.05, { buckle: true, z: 2 }) / 2 + crossAt('strap-instep', 'Instep strap', F * .47, 1.15, { buckle: true, z: 2.2 }) / 2;
    }
  } else if (S.open === 'clog') {
    // the vamp: the forefoot closed to just past the instep, cut whole, tucked under the footbed (nailed round a wooden base). It is cut
    // off the last as a closed shoe's vamp is (footwearPattern): from the side view alone, the half that shows mirrored, it was as wide as
    // the last is high, not as it is round, and came up nearly an inch short of the footbed's edge each side
    const vx = F * S.throat, wood = V === 'wood', vx0 = vx - .35, xTip = L - .02, sew = symmetric(vx0, xTip, .4, crest, bot, TUCK, true), shown = band(vx0, xTip, crest, bot, { lean0: .4 });
    const stations = [last.ballFromHeel, (last.ballFromHeel + L) / 2, L - 1].filter(x => x > vx0 + .7 && x < L - TOE_ROUND - .05), whole = (pc, half, st) => Object.assign(pc, { half, from: vx0 - .4, on: 'whole', ...(st ? { stations: st } : {}) });
    pieces.push(whole(piece('vamp', 'Vamp', sew, { shown, place: sidePlace(1), cut: 2, pair: true, fabric: 'upper', sa: 0, notes: ['Cut whole: as wide at every section as the last is round there, and the tuck each side; carried round the toe', wood ? `${r8(TUCK)} in turned under and nailed round the base with brass tacks ½ in apart` : `${r8(TUCK)} in tucked under the footbed and cemented`] }), sew.lower, stations));
    pieces.push(whole(piece('vamp-lining', 'Vamp lining', sew, { shown, place: sidePlace(-3), cut: 2, pair: true, fabric: 'lining', hidden: true, sa: 0, notes: [LININGS[s.lining] + (wood ? '; turned under with the vamp' : '')] }), sew.lower, stations));
    { const puff = symmetric(L - 2, xTip, .7, crest, bot, LINING_MARGIN, true); pieces.push(whole(piece('toe-puff', 'Toe puff', puff, { shown: band(L - 2, xTip, crest, bot, { lean0: .7 }), place: sidePlace(-5), cut: 2, pair: true, fabric: 'stiffener', hidden: true, sa: 0, notes: ['A light one: holds the toe off the foot; cut whole across the toe'] }), puff.lower, [L - 1])); }
    if (!wood) { buckles = crossAt('strap', 'Instep strap', vx + .9, .9, { buckle: true, z: 3, snug: -.06 }) / 2; notes.push('The instep strap sits over the vamp; it adjusts the fit, so the vamp is not stretched to fit'); }
    marks.vamp = r3(vx);
  } else {
    // moulded: a slide's strap is the only part cut; a recovery slide and a clog are injected whole (the clog's heel strap riveted on)
    if (V === 'slide') {
      const xc = F * .66, w = 2.4, len = over(xc, .05) + 2 * .5;
      strap('strap', 'Strap', strip(len, w), band(xc - w / 2, xc + w / 2, x => crest(x) + .05, bot, { n: 8 }), { z: 2, cut: 2, pair: true, fabric: 'upper', notes: [`${r8(len)} in, ½ in into a slot moulded in the footbed each side, cemented`, '3 mm foam between the face and the lining under the top'] });
    } else {
      const vx = V === 'clog' ? F * .38 : F * .52, x1 = V === 'clog' ? L - .02 : F * .82, shown = V === 'clog' ? band(vx - .2, x1, crest, bot, { lean0: .4 }) : band(vx, x1, x => crest(x) + .05, bot, { n: 10, lean0: .3, lean1: -.3 });
      pieces.push(Object.assign(piece('upper-moulded', V === 'clog' ? 'Shell (moulded with the sole)' : 'Strap (moulded with the footbed)', shown, { shown, place: sidePlace(1), cut: 0, component: true, fabric: 'eva', notes: ['Injected with the footbed in one shot: not cut'] }), { onShoe: true }));
      if (V === 'clog') {
        const hs = band(F * .02, F * .36, x => bot(x) - 1.55 + x * .2, x => bot(x) - .95 + x * .2, { n: 10 });
        pieces.push(Object.assign(piece('heel-strap', 'Heel strap (moulded, pivoting)', hs, { shown: hs, place: sidePlace(2), cut: 0, component: true, fabric: 'eva', notes: ['Moulded separately; riveted to the shell each side so it swings forward over the vamp'] }), { onShoe: true }));
        marks.vents = Array.from({ length: 7 }, (_, i) => [r3(F * .62 + (L - F * .62 - .9) * (i % 4) / 3), r3(crest(F * .62 + (L - F * .62 - .9) * (i % 4) / 3) + (i < 4 ? .55 : 1.05))]);
        notes.push('Vents: 13 round holes over the forefoot, moulded through the shell');
      }
    }
  }
  // under the foot: the footbed, its top cover, the outsole
  const sole = last.bottom, sh = soleHeightOf(s), under = Math.max(.2, sh - s.heel);
  const fb = S.open === 'moulded' ? (V === 'slide' ? 'Footbed (injected EVA, contoured, with a toe grip)' : V === 'clog' ? 'Clog (injected EVA, one piece)' : 'Slide (injected EVA, one piece, 35 mm at the heel)')
    : V === 'wood' ? 'Wooden base (alder, carved to the foot)' : V === 'thong' ? 'Footbed (EVA, die-cut and pressed)' : V === 'fisherman' || V === 'multi' ? 'Insole (board, with a 4 mm foam sock)' : 'Footbed (cork and latex, contoured: heel cup, arch, toe bar)';
  if (S.open !== 'moulded') pieces.push(piece('footbed-cover', V === 'wood' ? 'Footbed cover' : 'Footbed top cover', sole, { cut: 2, pair: true, fabric: 'lining', place: bplace(2), sa: 0, notes: [V === 'thong' ? 'Printed EVA or textile, laminated' : `${s.upper === 'suede' ? 'Suede' : 'Leather'} top cover, cemented over the footbed and the strap ends; the size and logo printed at the heel`] }));
  const soleSide = [...Array.from({ length: 31 }, (_, i) => { const x = -.1 + (L + .2) * i / 30; return [x, bot(Math.min(Math.max(x, 0), L)) + .05]; }), ...Array.from({ length: 31 }, (_, i) => { const x = L + .2 - (L + .3) * i / 30; const xx = Math.min(Math.max(x, 0), L); return [x, under + (xx <= last.ballFromHeel ? 0 : bot(xx) - bot(last.ballFromHeel))]; })];
  pieces.push(piece('sole', fb, soleSide, { cut: 0, component: true, fabric: S.open === 'moulded' || V === 'thong' ? 'eva' : 'rubber', place: { view: 'front', x: 0, y: 0, z: 7 }, notes: [S.open === 'moulded' ? 'One mould for each size' : V === 'wood' ? 'Carved and sanded, sealed; a rubber tread pad nailed under' : 'Moulded or pressed, then the outsole cemented under'] }));
  if (S.open !== 'moulded' && V !== 'wood') pieces.push(piece('outsole', V === 'thong' ? 'Outsole (rubber sheet, die-cut)' : 'Outsole (rubber)', sole, { cut: 2, pair: true, fabric: 'rubber', place: bplace(3), sa: 0, component: V !== 'thong', notes: [V === 'thong' ? 'Die-cut from 6 mm rubber sheet with the footbed' : 'Moulded, cemented under the footbed and the strap ends'] }));
  marks.lines = []; Object.assign(marks, { shaft: false, laced: false, throat: r3(F * S.throat), vamp: marks.vamp ?? r3(F * .6), leg: 0 });
  const where = S.open === 'moulded' ? 'Injection-moulded: the mould is cut from the last\'s 3D model; no lasting' : V === 'wood' ? 'Built on the wooden base: the vamp turned under and nailed' : 'Straps (or the vamp) tucked under the footbed and cemented; the top cover and the outsole close it';
  const pat = { kind: 'footwear', spec: s, label: S.label, flat: null, ground: r3(under), marks, open: S.open, sole: { type: S.sole, height: r3(sh) }, size: `${SYSTEMS[s.system].replace(/ \(.*$/, '')} ${last.size} ${s.width}`.trim(), sa: .25, pieces, last, views: { front: 'Side', back: 'Bottom' },
    notes: [`${UPPERS[s.upper]} ${S.open === 'moulded' ? 'strap' : S.open === 'clog' ? 'vamp' : 'straps'}${S.open === 'moulded' ? '' : `, ${LININGS[s.lining].toLowerCase()}`}`, where, ...(buckles ? [`${buckles * 2} buckles a pair`] : []), ...notes, 'A first draft on the last: the pattern engineer trues up each strap\'s length on the fitting sample'],
    components: components(s, last), tooling: tooling(s) };
  if (pieces.some(q => q.half) && s.flatten !== false) { const shell = shellOf(last); pat.flat = { lateral: shell.lateral.stretch, medial: shell.medial.stretch }; pat.pieces = pieces.map(q => (q.half ? flattenPiece(q, shell) : q)); pat.notes.splice(-1, 0, 'The vamp, its lining and the toe puff are cut whole off the last\'s surface; the straps are cut flat'); }
  for (const q of pat.pieces) { delete q.half; delete q.from; q.on = q.on || (q.component || !q.cut ? 'made' : 'side'); }
  pat.lasting = { how: 'none', allowance: S.open === 'clog' ? TUCK : 0, lining: S.open === 'clog' ? TUCK : 0, lap: LAP };
  pat.assembly = footwearAssembly(pat); pat.checks = footwearChecks(s, last, pat.assembly);
  return pat;
}

// the style's lines, with what was read from the picture (or set by hand) in their place
export const lineOf = s => { const V = VARIANTS[s.style]?.[s.variant] || {}, S = { ...FW_STYLES[s.style], ...V, label: V.label || FW_STYLES[s.style].label }; const collar = s.collar ?? S.collar; return { ...S, collar, throat: s.throat ?? S.throat, sole: s.sole ?? S.sole, shaft: Boolean(S.shaft) || collar > 4.5 }; };
export function footwearPattern(input = {}, size = null) {
  const s = cleanFootwear(input), last = lastOf(s, size ?? s.size), { F, L, lastBottom: bot, crest } = last, pieces = [], notes = [], S = lineOf(s), marks = { eyelets: [] };
  if (S.open) return openPattern(s, last, S);
  // a mule has no back: its quarters start a third of the way along, low at the back and rising to the throat; a loafer mule is cut as a loafer
  const MULE = Boolean(S.backless), LOAFER = s.style === 'loafer' || (MULE && s.variant === 'loafer'), CHEL = s.style === 'chelsea', qStart = MULE ? F * .3 : 0;
  const collarBack = bot(0) - S.collar, ankle = F * .28, open = S.laced ? .45 : 0;
  // the topline: the collar from the back down past the ankle bone, then the edge of the lace opening (half its width below the crest)
  // a shaft (a boot, a high-top): the collar runs level (a little lower at the front) from the back seam to the front of the leg, about a third
  // of the way along; the lace edge then comes down the front of the leg, steep at the top and easing into the instep
  // The lines are each set on their own (dragged by hand, or read off a picture), so they are made to agree here before anything is drawn:
  //  - on a low shoe the lacing (a slip-on's throat) starts ½ in or more in front of the ankle bone: behind it there is no collar left
  //  - a laced low shoe keeps 1⅛ in of lace edge behind the vamp line; the vamp line moves forward when there is no room for that
  //  - on a boot or a high-top the front of the leg is a fifth of the foot's length or more behind the vamp line, so the lace edge
  //    comes down the leg and over the instep before it meets the vamp
  // A line that had to move is said in the notes.
  const shaftTop = bot(0) - S.collar, legAsked = F * (S.throat + .13), throatMin = ankle + .5, LACE_MIN = 1.125;
  // where the vamp begins on top (a Chelsea's begins at the instep, in front of the leg: its front shaft is a piece of its own)
  const vampAsked = s.vamp ? (CHEL ? Math.max(F * s.vamp, legAsked + .6) : F * s.vamp) : LOAFER ? F * .5 : CHEL ? legAsked + F * .13 : F * .6;
  const vampX = S.laced && !S.shaft ? Math.max(vampAsked, throatMin + LACE_MIN) : vampAsked;
  const legX = CHEL ? legAsked : Math.min(legAsked, vampX - F * .2), instepX = legX + F * .13;
  // where the leg ends and where the instep has taken over (src/lab-last-shell.js): a boot's leg comes forward to its front, a low shoe's to the ankle bone
  const leg = (S.shaft ? [legX, instepX] : [ankle, ankle + F * .13]).map(r3);
  const throat0 = S.shaft ? legX - F * .13 : S.laced ? Math.min(Math.max(F * S.throat, throatMin), vampX - LACE_MIN) : Math.max(F * S.throat, throatMin);
  if (Math.abs(vampX - vampAsked) > .02) notes.push(`The vamp line was asked for ${r8(vampAsked)} in from the heel and is at ${r8(vampX)} in: the lacing needs ${r8(LACE_MIN)} in of edge in front of the ankle bone`);
  if (S.shaft && Math.abs(legX - legAsked) > .02) notes.push(`The front of the leg was asked for ${r8(legAsked)} in from the heel and is at ${r8(legX)} in: it stands a fifth of the foot's length behind the vamp line`);
  if (!S.shaft && Math.abs(throat0 - F * S.throat) > .02) notes.push(`${S.laced ? 'The lacing' : 'The throat'} was asked to start ${r8(F * S.throat)} in from the heel and starts at ${r8(throat0)} in: ${throat0 > F * S.throat ? 'in front of the ankle bone' : `${r8(LACE_MIN)} in behind the vamp line`}`);
  const topline = x => {
    if (S.shaft) {
      if (x <= legX) return shaftTop + .35 * (x / legX) ** 2;
      const yI = S.laced ? crest(instepX) + open : crest(instepX) + .1;
      if (x <= instepX) { const t = (x - legX) / (instepX - legX); return yI + (shaftTop + .35 - yI) * (1 - t) ** 2.2; }
      return S.laced ? crest(x) + open : crest(x) + .1;
    }
    const dip = collarBack + .45, tl = crest(throat0) + open;
    if (x <= ankle) { const t = x / ankle; return collarBack + (dip - collarBack) * (t * t * (3 - 2 * t)); }
    if (x <= throat0) { const t = (x - ankle) / (throat0 - ankle); return dip + (tl - dip) * (t * t * (3 - 2 * t)); }
    return S.laced ? crest(x) + open : crest(x) + .1;
  };
  const toplineC = topline, sideTop = MULE ? x => { const lo = bot(qStart) - .8, x1 = Math.max(throat0, qStart + 1.2); if (x >= x1) return toplineC(x); const t = Math.max(0, (x - qStart) / (x1 - qStart)), e = t * t * (3 - 2 * t); return lo + (toplineC(x1) - lo) * e; } : topline;
  // the inside collar dips ⅛ in under the ankle bone (a low shoe only): nothing at the back seam, where it must meet the outside quarter, the
  // whole ⅛ in at the ankle, and nothing again where the lacing starts, so the two lace edges stand the same height
  const ease = t => { const u = Math.min(Math.max(t, 0), 1); return u * u * (3 - 2 * u); }, dipEnd = Math.max(throat0, ankle + .5);
  const medDrop = x => (S.shaft || MULE ? 0 : x <= ankle ? .125 * ease(x / ankle) : .125 * (1 - ease((x - ankle) / (dipEnd - ankle)))), medTop = x => sideTop(x) + medDrop(x);
  const PAD = PADDING[s.style] || PADDING.sneaker, LASTING = lastingOf(s), STROBEL = LASTING === 'strobel', EDGE = STROBEL ? STROBEL_MARGIN : LAST_MARGIN; // the allowance under the foot
  const LIN = STROBEL ? EDGE : LINING_MARGIN; // what is lasted with the upper stops short of its edge; in a strobel shoe everything ends at the one edge that is sewn
  const up = s.upper, fabUp = 'upper', fabOv = s.toeCap || s.style === 'sneaker' ? 'overlay' : 'upper';
  const sidePlace = z => ({ view: 'front', x: 0, y: 0, z });
  // on: where the piece goes on a shoe. 'whole': one, across the centre (cut 2 a pair); 'side': one, on the side it is named for (cut 2);
  // 'each': drawn for one side and put on both (cut 4); 'centre': one, on the centre line (cut 2). A last is not the same shape inside
  // and out, so every piece off it is cut as a pair: the second turned over for the other foot
  let wholeFrom = 0; // where the sheet the whole pieces are cut from begins: just behind the vamp, the one sheet for all of them
  const add = (id, name, shown, o = {}) => { const sew = o.sew || withMargin(shown, bot, o.margin ?? EDGE), on = o.on || (sew.lower || o.fold ? 'whole' : 'side');
    const pc = piece(id, name, sew, { shown, place: sidePlace(o.z ?? 0), cut: o.cut ?? (on === 'each' ? 4 : 2), pair: o.pair ?? on !== 'centre', fabric: o.fabric || fabUp, notes: o.notes || [], grain: o.grain, ...(o.hidden ? { hidden: true } : {}) });
    if (sew.lower) { pc.half = sew.lower; pc.from = wholeFrom; if (o.stations) pc.stations = o.stations; }
    if (o.fold) pc.fold = o.fold; if (o.footed) pc.footed = true; if (o.at) pc.at = o.at; if (o.lines) pc.lines = o.lines; pc.on = on; pieces.push(pc); return pc; };
  // the end of a band as it is drawn (band(), above): from the bottom up to the top, leaning; and a band's corners, to walk its edges by
  const endOf = (x, lean, top) => { const a = [x, bot(x)], b = [x + lean, top(x + lean)]; return cubic(a, [a[0] + lean * .1, a[1] - (a[1] - b[1]) * .4], [b[0] - lean * .2, b[1] + (a[1] - b[1]) * .3], b, 8); };
  const cornersOf = (x0, x1, top, m, lean0 = 0, lean1 = 0) => ({ backEdge: [x0, bot(x0) + m], backFeather: [x0, bot(x0)], backTop: [x0 + lean0, top(x0 + lean0)], frontEdge: [x1, bot(x1) + m], frontFeather: [x1, bot(x1)], frontTop: [x1 + lean1, top(x1 + lean1)] });
  const featherOf = (x0, x1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const x = x0 + (x1 - x0) * i / n; return [x, bot(x)]; });
  // the quarters, outside and inside, run from the back seam to the vamp line and lap ⅜ in over the vamp, which is cut that much longer
  // (a Chelsea's back quarter stops at its gore)
  // (a Chelsea's back quarter stops at its gore; what laps over its vamp is its front shaft, which runs to the vamp line as a quarter does)
  const qEnd = CHEL ? F * .24 : vampX + .25, qLean = CHEL ? 0 : .4, q0Lean = MULE ? .25 : 0, fEnd = vampX + .25, fLean = .4, vx0 = fEnd - LAP, vLean = fLean, xTip = L - .02;
  // the notches a strobel upper and its sock are matched by: behind the round of the heel, and behind the round of the toe
  const xHeel = Math.min(1.25, F * .14), xToe = L - 1.5, onEdge = x => [x, bot(x) + EDGE];
  const stations = [last.ballFromHeel, (last.ballFromHeel + L) / 2, L - 1].filter(x => x > vx0 + vLean + .3 && x < L - TOE_ROUND - .05);
  wholeFrom = vx0 - .4;
  // the vamp: from the vamp line to the toe, the whole width of the forefoot, cut whole
  const vamp = band(vx0, xTip, crest, bot, { lean0: vLean, lean1: 0 }), qFront = [[fEnd, bot(fEnd) + EDGE], ...endOf(fEnd, fLean, CHEL ? crest : sideTop).slice(1)];
  add('vamp', 'Vamp', vamp, { z: 1, sew: symmetric(vx0, xTip, vLean, crest, bot, EDGE, true), stations, at: { backEdge: [vx0, bot(vx0) + EDGE], lapEdge: onEdge(fEnd), toeNotch: onEdge(xToe) }, lines: { lap: qFront },
    notes: ['Cut whole on its fold: as wide at every section as the last is round there, from the centre line to the feather line, and the allowance', STROBEL ? 'Strobel allowance 3/16 in; notched where the gathering round the toe starts' : 'Lasting allowance ⅝ in, skived; carried round the toe', `Runs ${r8(LAP)} in under the ${CHEL ? 'front shaft' : 'quarters'}`], grain: [[vampX + 1, crest(vampX) + 1], [L - 1.5, crest(L - 1.5) + 1]] });
  if (LOAFER) add('apron', 'Apron (moc plug)', band(vampX + .4, L - 1.1, crest, x => crest(x) + .85), { z: 3, margin: 0, sew: symmetric(vampX + .4, L - 1.1, 0, crest, x => crest(x) + .85, 0), notes: ['Hand-sewn moc seam round the apron'] });
  // a penny loafer's saddle: a strap across the vamp over the back of the apron, lasted with the upper at both ends, the penny slot cut in it
  if (LOAFER) { const x0 = vampX + .15, x1 = vampX + 1.15; add('saddle', 'Saddle strap', band(x0, x1, crest, bot), { z: 4, sew: symmetric(x0, x1, 0, crest, bot, EDGE), stations: [(x0 + x1) / 2], notes: ['Across the vamp over the back of the apron, stitched down both edges and lasted with the upper at each end', 'The penny slot: a 1⅛ × ¼ in cut-out on the centre line'] }); }
  const quarter = band(qStart, qEnd, sideTop, bot, { lean1: qLean, lean0: q0Lean }), quarterMed = band(qStart, qEnd, medTop, bot, { lean1: qLean, lean0: q0Lean });
  // a Chelsea: the elastic gore shows between the back quarter and the front shaft, and lies ¼ in under each; it stops 0.15 in under the
  // front shaft's step, where the shaft and the quarter meet below it
  // (the gore is 3⅜ in long on a 6 in collar, and the same share of a lower one: it stays above the foot)
  const xfb = F * .32, yg0 = shaftTop + .2, yg1 = yg0 + Math.min(3.4, S.collar * 3.4 / 6), ygs = yg1 - .15, goreLine = x => Array.from({ length: 7 }, (_, i) => [x, yg0 + (ygs - yg0) * i / 6]);
  const qAt = top => ({ ...cornersOf(qStart, qEnd, top, EDGE, q0Lean, qLean), ...(MULE ? {} : { heelNotch: onEdge(xHeel) }), ...(CHEL ? { goreTop: [qEnd, yg0], goreBottom: [qEnd, ygs] } : {}) });
  add('quarter-lat', CHEL ? 'Back quarter, outside' : MULE ? 'Side, outside' : 'Quarter, outside', quarter, { z: 2, at: qAt(sideTop), lines: { feather: featherOf(qStart, qEnd) }, notes: [MULE ? 'Its back edge bound and turned: a mule has no back seam' : 'Back seam closed and taped'] });
  add('quarter-med', CHEL ? 'Back quarter, inside' : MULE ? 'Side, inside' : 'Quarter, inside', quarterMed, { z: -1, at: qAt(medTop), lines: { feather: featherOf(qStart, qEnd) }, notes: S.shaft || MULE ? ['Cut as the outside, flattened off the inside of the last'] : ['The inside collar dips ⅛ in under the ankle bone; it is the outside\'s height again at the back seam and where the lacing starts'] });
  if (CHEL) {
    add('gore', 'Elastic gore', band(qEnd - .25, xfb + .25, () => yg0, () => yg1), { z: .5, margin: 0, on: 'each', fabric: 'elastic', lines: { back: goreLine(qEnd), front: goreLine(xfb) }, notes: ['Twin-needle stitched ¼ in under the back quarter and the front shaft'] });
    // the front shaft: from the gore forward to the centre front and from the collar down to the feather line, lapping over the vamp at the
    // vamp line as a quarter does; cut whole on a straight fold down the front of the leg, from the collar to the vamp line. Under the
    // gore it steps back and runs ⅜ in under the back quarter
    const Pt = [legX, topline(legX)], Pf = [fEnd + fLean, crest(fEnd + fLean)], sx0 = qEnd - LAP;
    const shaft = [...Array.from({ length: 7 }, (_, i) => { const x = xfb + (legX - xfb) * i / 6; return [x, topline(x)]; }), ...endOf(fEnd, fLean, crest).reverse().slice(0, -1), ...Array.from({ length: 13 }, (_, i) => onEdge(fEnd + (sx0 - fEnd) * i / 12)), [sx0, ygs], [xfb, ygs]];
    const sAt = { ...cornersOf(sx0, fEnd, crest, EDGE, 0, fLean), goreTop: [xfb, yg0], goreBottom: [xfb, ygs], stepBack: [sx0, ygs], topBack: shaft[0] };
    add('shaft-front', 'Front shaft', shaft, { z: 1.5, sew: shaft, fold: [Pt, Pf], footed: true, at: sAt, lines: { feather: featherOf(sx0, fEnd) }, notes: ['Cut whole on the fold down the centre front, a straight line from the collar to the vamp line', `Laps ${r8(LAP)} in over the vamp; under the gore it runs ${r8(LAP)} in under the back quarter; the gore is stitched under its back edge`] });
    add('shaft-front-lining', 'Front shaft lining', shaft, { z: -3, sew: shaft, fold: [Pt, Pf], footed: true, fabric: 'lining', hidden: true, notes: [LININGS[s.lining]] });
  }
  if (S.laced) {
    // the lace edge as a line (it comes down the front of a shaft, so it is measured along its length, not along x); the eyestay is a strip
    // ⅞ in wide inside it, the eyelets ⅜ in in and evenly spaced along it, and the laces cross over the middle of the opening
    // (a point every 1/20 in or so along it, 60 at most: closer than that an outline's points are taken for a doubled cut and tidied away,
    // and a short lace edge lost its whole length)
    const lace0 = S.shaft ? legX + .03 : throat0 + .05, nE = Math.min(60, Math.max(6, Math.floor((vampX + .2 - lace0) / .045))), edge = Array.from({ length: nE + 1 }, (_, i) => { const x = lace0 + (vampX + .2 - lace0) * i / nE; return [x, topline(x)]; });
    const along = [0]; for (let i = 1; i < edge.length; i++) along.push(along[i - 1] + Math.hypot(edge[i][0] - edge[i - 1][0], edge[i][1] - edge[i - 1][1]));
    const inward = i => { const a = edge[Math.max(0, i - 1)], b = edge[Math.min(edge.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; return [-dy / d, dx / d]; };
    const atLen = d => { let i = 1; while (i < along.length - 1 && along[i] < d) i++; const t = (d - along[i - 1]) / ((along[i] - along[i - 1]) || 1), n = inward(i); return { p: [edge[i - 1][0] + (edge[i][0] - edge[i - 1][0]) * t, edge[i - 1][1] + (edge[i][1] - edge[i - 1][1]) * t], n }; };
    const eyestay = [...edge, ...edge.map((p, i) => { const n = inward(i); return [p[0] + n[0] * .85, p[1] + n[1] * .85]; }).reverse()];
    // (eyelets are never closer than ⅜ in, centre to centre: a ¼ in eyelet needs the leather between it and the next)
    const laceLen = along[along.length - 1], run = laceLen - .55, room = Math.max(2, Math.floor(run / .375 + 1e-6) + 1), holes = Math.min(s.eyelets || Math.max(4, Math.round(run / .55) + 1), room);
    if (s.eyelets && holes < s.eyelets) notes.push(`${s.eyelets} pairs of eyelets were asked for; the lace edge (${r8(laceLen)} in) takes ${holes} at ⅜ in apart`);
    add('eyestay', 'Eyestay', eyestay, { z: 4, margin: 0, on: 'each', fabric: fabOv, notes: [`${holes} eyelets a side, ${r8(run / Math.max(holes - 1, 1))} in apart`] }).laceEnds = [edge[0], edge[edge.length - 1]].map(p => p.map(r3)); // on the side view
    notes.push(`Laces: ${holes} pairs of eyelets, about ${Math.round((holes * 2.6 + 18) / 6) * 6} in long`);
    marks.lace = []; marks.holes = holes;
    for (let k = 0; k < holes; k++) { const { p, n } = atLen(.3 + run * k / Math.max(holes - 1, 1)); marks.eyelets.push([r3(p[0] + n[0] * .3), r3(p[1] + n[1] * .3)]); marks.lace.push([r3(p[0] - n[0] * open), r3(p[1] - n[1] * open)]); }
    // the tongue: as long as the lace edge, with ⅜ in sewn under the vamp at its foot and 2 in standing above the top of the lace edge (the
    // collar at the front), on every laced style: a boot's is no longer 3½ in longer than that
    const stand = 2, tl = laceLen + LAP + stand, tw = 2.6;
    const tongue = [[-tw * .38, 0], [tw * .38, 0], ...cubic([tw * .38, 0], [tw * .55, -tl * .5], [tw * .55, -tl * .9], [tw * .3, -tl]).slice(1), ...cubic([-tw * .3, -tl], [-tw * .55, -tl * .9], [-tw * .55, -tl * .5], [-tw * .38, 0]).slice(0, -1)];
    // it shows in the throat between the eyestays, just above the laces, and stands a little above the collar at its top
    // (on a shaft it shows up the front of the leg, in front of the lace edge, and stands above the collar at the top)
    const shownT = S.shaft ? band(legX - .3, vampX + .3, x => Math.min(topline(Math.max(0, x - .4)) - .4, crest(x) - .12), x => Math.max(topline(x) + .3, crest(x) + .3), { n: 24, lean0: .1 })
      : band(throat0 - .5, vampX + .3, x => Math.max(crest(x) - .12, topline(x) - .5), x => crest(x) + .3, { n: 14, lean0: .2 });
    const tng = (id, name, sew, o) => { const pc = piece(id, name, sew, { shown: shownT, cut: 2, ...o }); pc.on = 'centre'; pc.lace = r3(laceLen); pieces.push(pc); };
    tng('tongue', 'Tongue', tongue, { place: sidePlace(0), fabric: s.style === 'runner' ? 'upper' : fabUp, notes: [PAD.tongue ? `Faced over ${PAD.tongue} mm foam, with a woven label at the top` : 'Unpadded, with a woven label at the top', `As long as the lace edge (${r8(laceLen)} in), ${r8(LAP)} in sewn under the vamp and ${stand} in standing above the collar`] });
    // its lining (the size and law label printed on it), cut to the tongue's own outline; and the foam between face and lining, inside the
    // tongue's outline all round so the edge stays thin. These lie flat: they are not on the last, and are not flattened off it
    tng('tongue-lining', 'Tongue lining', tongue, { place: sidePlace(-3), fabric: 'lining', hidden: true, notes: [`${LININGS[s.lining]}; the size and law label printed on it`] });
    if (PAD.tongue) tng('tongue-foam', 'Tongue foam', tongue.map(([x, y]) => [x * .8, y * .92 - tl * .02]), { place: sidePlace(-4), sa: 0, fabric: 'foam', hidden: true, notes: [`${PAD.tongue} mm open-cell foam, skived at the edges; stops ¼ in short of the edge`] });
  }
  const capLen = s.capLen ?? 2.4, mudH = s.mudH ?? .75, heelH = s.heelH ?? 2.1, heelTop = x => bot(x) - heelH + Math.max(0, x / (F * .23)) * .6;
  if (s.toeCap) { const tc = band(L - capLen, xTip, crest, bot, { lean0: .9 }); add('toe-cap', 'Toe cap', tc, { z: 5, sew: symmetric(L - capLen, xTip, .9, crest, bot, EDGE, true), fabric: fabOv, stations: [L - 1].filter(x => x > L - capLen + 1.1), notes: ['Cut whole on its fold, over the vamp; lasted with it'] }); }
  if (s.mudguard) add('mudguard', 'Mudguard', band(F * .2, xTip, x => bot(x) - mudH, bot, { lean0: .3 }), { z: 4, on: 'each', fabric: 'overlay', notes: ['A low overlay round the foot, lasted with the upper: one each side, butted at the centre of the toe'] });
  const heelOv = !MULE && (s.heelOverlay ?? ['sneaker', 'hightop', 'runner', 'boot', 'hiker'].includes(s.style));
  // the parts that wrap the back of the heel are cut in one, across the back seam: the overlay, the heel grip and the counter
  const backFold = (top, m) => [[0, bot(0) + m], [0, top(0)]];
  if (heelOv) add('heel-overlay', 'Heel overlay', band(0, F * .23, heelTop, bot, { lean1: .35 }), { z: 5, fabric: fabOv, fold: backFold(heelTop, EDGE), notes: ['Cut in one round the back of the heel, over the back seam'] });
  // the pull loop: a narrow tab standing ½ in above the collar, rounded at the top
  const tab = [[-.06, collarBack + .9], ...cubic([-.06, collarBack - .2], [-.06, collarBack - .52], [.1, collarBack - .56], [.21, collarBack - .56], 6), ...cubic([.21, collarBack - .56], [.32, collarBack - .56], [.48, collarBack - .5], [.48, collarBack - .2], 6), [.48, collarBack + .9]];
  if (!MULE) add('back-tab', 'Back tab', tab, { z: 6, margin: 0, on: 'centre', fabric: fabOv, notes: ['Pull loop, sewn into the back seam'] });
  // for the tech flats: the collar line from the back seam to the lace opening (to the vamp on a slip-on), and where the lines are
  { const x1 = S.shaft ? legX : S.laced ? throat0 + .2 : vampX + .1; marks.collar = Array.from({ length: 25 }, (_, i) => { const x = qStart + (x1 - qStart) * i / 24; return [r3(x), r3(sideTop(x))]; }); Object.assign(marks, { shaft: S.shaft, laced: S.laced, throat: r3(throat0), vamp: r3(vampX), leg: r3(legX), ...(MULE ? { backless: r3(qStart) } : {}) }); }
  // the model's own lines on the side, each with what moves it (src/lab-lines.js): dragged by hand, or put where a hand-drawn line is
  { const edge = (x, lean, top) => cubic([x, bot(x)], [x + lean * .1, bot(x) - (bot(x) - top(x + lean)) * .4], [x + lean * .8, top(x + lean) + (bot(x) - top(x + lean)) * .3], [x + lean, top(x + lean)], 8).map(p => [r3(p[0]), r3(p[1])]);
    const run = (x0, x1, f, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const x = x0 + (x1 - x0) * i / n; return [r3(x), r3(f(x))]; });
    const L1 = (key, label, param, value, per, min, max, axis, pts, step) => ({ key, label, param, value: r3(value), per, min, max, axis, pts, ...(step ? { step } : {}) });
    marks.lines = [
      L1('vamp', 'Vamp line', 'vamp', vampX / F, 1 / F, .4, .75, 'x', edge(vampX - .35, .4, crest), .01),
      ...(S.laced && !S.shaft ? [L1('throat', 'Where the lacing starts', 'throat', throat0 / F, 1 / F, .1, .6, 'x', run(Math.max(0, throat0 - .6), throat0 + .6, topline, 8), .01)] : []),
      ...(MULE ? [] : [L1('collar', 'Collar', 'collar', S.collar, -1, 1.5, 10, 'y', marks.collar.slice(0, 13), .125)]),
      ...(s.toeCap ? [L1('toeCap', 'Toe cap', 'capLen', capLen, -1, 1.2, 4, 'x', edge(L - capLen, .9, crest))] : []),
      ...(s.mudguard ? [L1('mudguard', 'Mudguard', 'mudH', mudH, -1, .4, 1.6, 'y', run(F * .25, L - .4, x => bot(x) - mudH))] : []),
      ...(heelOv ? [L1('heelOverlay', 'Heel overlay', 'heelH', heelH, -1, 1, 3.5, 'y', run(0, F * .23, heelTop, 10))] : [])]; }
  // inside: linings, the collar foam, the stiffeners
  add('quarter-lining', MULE ? 'Side lining' : 'Quarter lining', band(qStart, qEnd + .3, sideTop, bot, { lean0: q0Lean }), { z: -3, on: 'each', margin: LIN, fabric: 'lining', at: cornersOf(qStart, qEnd + .3, sideTop, LIN, q0Lean, 0), notes: [LININGS[s.lining], 'Cut alike for the outside and the inside; trimmed to the topline after it is closed'] });
  add('vamp-lining', 'Vamp lining', vamp, { z: -3, fabric: 'lining', sew: symmetric(vx0, xTip, vLean, crest, bot, LIN, true), stations, notes: ['Cut whole as the vamp'] });
  if (PAD.collar && !MULE) add('collar-foam', 'Collar foam', band(0, S.shaft ? legX : throat0, topline, x => topline(x) + (S.shaft ? 1.4 : 1)), { z: -4, on: 'each', margin: 0, fabric: 'foam', notes: [`${PAD.collar} mm open-cell foam, skived to nothing at the edges`] });
  // a heel grip: a pad of microsuede over the counter, inside the collar at the back, so the heel does not slip
  const gripTop = x => topline(x) + .15, gripBot = x => topline(x) + 1.9;
  if (!MULE) add('heel-grip', 'Heel grip', band(0, F * .17, gripTop, gripBot), { z: -2, margin: 0, fold: [[0, gripBot(0)], [0, gripTop(0)]], fabric: 'lining', notes: ['Microsuede, over the counter, ⅛ in below the collar edge; cut in one round the back'] });
  // backers: a non-woven doubler under the eyestay (it takes the lace pull) and under the quarters at the collar (it keeps the topline's shape)
  if (S.laced) add('eyestay-backer', 'Eyestay backer', band(S.shaft ? legX : throat0, vampX + .1, topline, x => topline(x) + .9), { z: -1, on: 'each', margin: 0, fabric: 'reinforcement', notes: ['Non-woven doubler, cemented under the eyestay before punching'] });
  // (it stops where the quarter it backs stops: a Chelsea's back quarter ends at its gore)
  add('collar-backer', MULE ? 'Topline backer' : 'Collar backer', band(qStart, Math.min(Math.max(S.shaft ? legX : throat0, qStart + 1.2), qEnd), sideTop, x => sideTop(x) + .6), { z: -1, on: 'each', margin: 0, fabric: 'reinforcement', notes: ['Non-woven doubler under the topline, skived'] });
  // warm and waterproof: an insulation layer cut as the linings, and a membrane bootie sewn and seam-taped between the upper and the lining
  if (s.lining === 'insulated') { add('quarter-insulation', 'Quarter insulation', band(qStart, qEnd + .3, sideTop, bot, { lean0: q0Lean }), { z: -2, on: 'each', margin: Math.min(.2, EDGE), fabric: 'insulation', notes: ['200 g synthetic insulation, laminated to the lining'] });
    add('vamp-insulation', 'Vamp insulation', vamp, { z: -2, fabric: 'insulation', sew: symmetric(vx0, xTip, vLean, crest, bot, Math.min(.2, EDGE), true) }); }
  if (s.membrane) { add('membrane-quarter', 'Membrane bootie, quarter', band(qStart, qEnd + .3, sideTop, bot, { lean0: q0Lean }), { z: -2, on: 'each', margin: Math.min(.3, EDGE), fabric: 'membrane', notes: ['Waterproof breathable membrane laminate; seams taped'] });
    add('membrane-vamp', 'Membrane bootie, vamp', vamp, { z: -2, fabric: 'membrane', sew: symmetric(vx0, xTip, vLean, crest, bot, Math.min(.3, EDGE), true), notes: ['Sewn to the quarters and the membrane sock under the foot; seams taped'] }); }
  // the stiffeners. The counter is cut in one round the heel and stays ⅜ in or more below the topline all the way (a low collar's dip under
  // the ankle would otherwise leave it standing above the edge); the toe puff is cut whole across the toe
  const counterTop = x => Math.max(bot(x) - 2.0, sideTop(x) + .375);
  if (!MULE) add('counter', 'Heel counter', band(0, F * .25, counterTop, bot), { z: -5, margin: LIN, fold: backFold(counterTop, LIN), fabric: 'stiffener', notes: ['Thermoplastic, moulded over the heel of the last; cut in one round the back'] });
  add('toe-puff', 'Toe puff', band(L - 2.2, xTip, crest, bot, { lean0: .7 }), { z: -5, sew: symmetric(L - 2.2, xTip, .7, crest, bot, LIN, true), fabric: 'stiffener', stations: [L - 1], notes: ['Holds the toe\'s shape; cut whole across the toe'] });
  // under the foot: the insole board and the sockliner are cut from the bottom of the last, developed: its outline with its length taken
  // along the bottom's curve (the heel is lifted and the toe sprung, so the bottom is longer than it looks from above: 7/16 in on a 2¼ in heel)
  const arcTo = (() => { const N = 400, A = [0]; for (let i = 1; i <= N; i++) A.push(A[i - 1] + Math.hypot(L / N, bot(L * i / N) - bot(L * (i - 1) / N))); return x => { const f = Math.min(Math.max(x / L, 0), 1) * N, i = Math.min(Math.floor(f), N - 1); return A[i] + (A[i + 1] - A[i]) * (f - i); }; })();
  const sole = tidy(last.bottom.map(([x, z]) => [arcTo(x), z]));
  // a strobel sock is that outline less the 3/16 in the upper's edge lies under the last, so the two edges meet and are stitched edge to edge
  const sockOf = () => tidy(offsetOf(sole, -STROBEL_MARGIN)), acrossAt = (P, X) => { const zs = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[0] - X) * (b[0] - X) <= 0 && a[0] !== b[0]) zs.push(a[1] + (b[1] - a[1]) * (X - a[0]) / (b[0] - a[0])); } return [Math.min(...zs), Math.max(...zs)]; };
  const notchesOn = P => { const [h0, h1] = acrossAt(P, arcTo(xHeel)), [t0, t1] = acrossAt(P, arcTo(xToe)); return { heelNotch: [r3(arcTo(xHeel)), r3(h1)], heelNotchM: [r3(arcTo(xHeel)), r3(h0)], toeNotch: [r3(arcTo(xToe)), r3(t1)], toeNotchM: [r3(arcTo(xToe)), r3(t0)] }; };
  const bplace = z => ({ view: 'back', x: 0, y: 0, z }), under = (id, name, sew, o) => { const pc = piece(id, name, sew, { cut: 2, pair: true, sa: 0, ...o }); pc.on = 'side'; pc.at = notchesOn(pc.sew); pieces.push(pc); };
  if (STROBEL) under('strobel', 'Strobel sock', sockOf(), { fabric: 'strobel', place: bplace(1), notes: ['Non-woven strobel sock: the bottom of the last less 3/16 in all round', 'The upper\'s edge is zig-zag stitched to its edge, matched at the four notches, closing the upper under the foot before it goes on the last', ...(s.membrane ? ['A membrane sock under it, seam-taped to the bootie'] : [])] });
  else under('insole', 'Insole board', sole, { fabric: 'board', place: bplace(1), notes: ['Cellulose board, 2 mm; the upper is lasted onto it'] });
  if (s.membrane) under('membrane-sock', 'Membrane sock', STROBEL ? sockOf() : sole, { fabric: 'membrane', place: bplace(1.5), hidden: true, notes: ['Waterproof breathable membrane laminate, under the foot; seam-taped to the bootie all round'] });
  under('sockliner', 'Sockliner', sole, { fabric: 'foam', place: bplace(2), notes: [s.lining === 'shearling' ? 'Shearling-covered foam, 6 mm' : s.style === 'hiker' ? '6 mm moulded foam with a printed top cover' : '4 mm foam with a printed top cover'] });
  // the sole unit: its full thickness at the heel (the heel height and the foam or rubber under the forefoot), so the shoe stands on it
  const sh = soleHeightOf(s), underSole = Math.max(.2, sh - s.heel), soleSide = [...Array.from({ length: 31 }, (_, i) => { const x = -.1 + (L + .2) * i / 30; return [x, bot(Math.min(Math.max(x, 0), L)) + .05]; }), ...Array.from({ length: 31 }, (_, i) => { const x = L + .2 - (L + .3) * i / 30; const xx = Math.min(Math.max(x, 0), L); return [x, underSole + (xx <= last.ballFromHeel ? 0 : bot(xx) - bot(last.ballFromHeel))]; })]; // the tread on the ground to the ball, then up with the toe spring
  if (MULE) notes.push('Backless: no counter and no heel grip; the sides\' back edges are bound, and the heel seat is padded so the foot does not slip');
  const soleName = S.sole === 'cupsole' ? 'Cupsole (rubber)' : S.sole === 'midsole' ? 'Midsole (EVA) and outsole' : 'Outsole and heel (rubber, stitched)';
  pieces.push(Object.assign(piece('sole', soleName, soleSide, { cut: 0, component: true, fabric: S.sole === 'midsole' ? 'eva' : 'rubber', place: { view: 'front', x: 0, y: 0, z: 7 }, notes: ['Moulded, not cut: one mould for each pair of half sizes'] }), { on: 'made' }));
  // seams drawn on the last cut a piece in two; then every piece of the upper is flattened off the last's surface (src/lab-last-shell.js),
  // its side-view outline kept for how it shows on the shoe
  for (const sm of s.seams || []) {
    const k = pieces.findIndex(q => q.id === sm.piece); if (k < 0) { notes.push(`The seam "${sm.name}" is on a piece the shoe no longer has`); continue; }
    const parts = pieces[k].half || pieces[k].fold ? null : splitPiece(pieces[k], sm); if (parts) pieces.splice(k, 1, ...parts.map(q => { const { at, lines, ...rest } = q; return { ...rest, cutBy: sm.id }; })); else notes.push(`The seam "${sm.name}" does not cross the ${pieces[k].name.toLowerCase()} from edge to edge`);
  }
  let flat = null;
  if (s.flatten !== false) {
    const shell = shellOf(last, { leg }); flat = { lateral: shell.lateral.stretch, medial: shell.medial.stretch };
    // (the tongue, its lining and its foam lie flat: they are drawn as they are cut, not on the last)
    for (let k = 0; k < pieces.length; k++) { const q = pieces[k]; if (q.place.view === 'front' && !q.component && q.cut > 0 && !/^tongue/.test(q.id)) pieces[k] = flattenPiece(q, shell); }
    notes.push(`The upper's pieces are flattened off the last's surface (the stretch in the flattening: ${Math.round(Math.max(flat.lateral.rms, flat.medial.rms) * 1000) / 10}% on average, ${Math.round(Math.max(flat.lateral.max, flat.medial.max) * 100)}% at most); the pieces cut whole are developed about their fold`);
  }
  for (const q of pieces) { delete q.half; delete q.from; delete q.footed; if (s.flatten === false) { delete q.fold; delete q.at; delete q.lines; delete q.stations; } }
  const pat = { kind: 'footwear', spec: s, label: S.label, flat, ...(MULE ? { backless: true } : {}), ground: r3(underSole), marks, sole: { type: S.sole, height: r3(sh) }, size: `${SYSTEMS[s.system].replace(/ \(.*$/, '')} ${last.size} ${s.width}`.trim(), sa: .25, pieces, last, views: { front: 'Side', back: 'Bottom' },
    leg, lasting: { how: LASTING, allowance: EDGE, lining: LIN, lap: LAP },
    notes: [`${UPPERS[s.upper]} upper, ${LININGS[s.lining].toLowerCase()}`, `Laps ${r8(LAP)} in: the vamp runs that far under the quarters, skived and cemented before stitching`,
      STROBEL ? 'Strobel-lasted: the upper\'s edge lies 3/16 in under the last and is zig-zag stitched edge to edge to the strobel sock, matched at four notches; the fullness round the heel is eased in and round the toe gathered (the edge turns under the last on a smaller circle than it is cut on)' : 'Board-lasted: the lasting allowance is ⅝ in, cemented to the insole board',
      'How many to cut is for a pair of shoes: 2 of a piece there is one of on a shoe (a pair of them turns the second over for the other foot), 4 of a piece that goes on both sides of each shoe',
      ...notes, 'A first draft on the standard of the last: the pattern engineer trues it up on the fitting sample'],
    components: components(s, last, { eyelets: marks.holes }), tooling: tooling(s) };
  pat.assembly = footwearAssembly(pat); pat.checks = footwearChecks(s, last, pat.assembly);
  return pat;
}

// what goes into a pair that is not cut from the hide
export function components(input = {}, last = lastOf(input), extra = {}) {
  const s = cleanFootwear(input), S = lineOf(s), out = [];
  if (S.open) return openComponents(s, S);
  out.push({ name: S.sole === 'cupsole' ? 'Rubber cupsole' : S.sole === 'midsole' ? 'EVA midsole and rubber outsole' : 'Rubber outsole and stacked heel', qty: '1 pair', how: S.sole === 'stitched' ? 'Goodyear welted or Blake stitched' : 'Cemented and pressed' });
  if (S.laced) out.push({ name: 'Laces', qty: '1 pair', how: 'Flat or round, with aglets' }, { name: 'Eyelets', qty: extra.eyelets ? `${extra.eyelets * 4} a pair (${extra.eyelets} a side)` : 'see the eyestay', how: 'Metal or punched' }, { name: 'Woven label', qty: '1 pair', how: 'Sewn to the top of the tongue' });
  if (s.style === 'chelsea') out.push({ name: 'Elastic gore', qty: '4 panels', how: 'Twin-needle' });
  // (a loafer's saddle strap is cut from the hide: it is a piece of the pattern, not listed here)
  if (!S.backless) out.push({ name: 'Back seam tape', qty: '1 pair', how: 'Nylon tape, cemented over the closed back seam inside' });
  if (S.backless) out.push({ name: 'Edge binding', qty: '1 pair set', how: 'Folded leather or tape round the sides\' back edges' }, { name: 'Heel seat pad', qty: '1 pair', how: '4 mm foam under the heel of the sockliner' });
  // under the foot and inside: how it is lasted, the foams, the grip and the backers, and a warm or waterproof layer
  const P = PADDING[s.style] || PADDING.sneaker;
  out.push(lastingOf(s) === 'strobel' ? { name: 'Strobel sock', qty: '1 pair', how: 'Non-woven, zig-zag stitched to the upper' } : { name: 'Insole board', qty: '1 pair', how: 'Cellulose, 2 mm; the upper is cemented to it' },
    { name: 'Sockliner', qty: '1 pair', how: s.lining === 'shearling' ? 'Shearling-covered foam, 6 mm' : s.style === 'hiker' ? 'Moulded foam, 6 mm, printed top cover' : 'Foam, 4 mm, printed top cover' });
  if (P.collar || P.tongue) out.push({ name: 'Collar and tongue foam', qty: '1 pair', how: [P.collar ? `collar ${P.collar} mm` : '', P.tongue ? `tongue ${P.tongue} mm` : ''].filter(Boolean).join(', ') + ', open-cell, skived' });
  if (!S.backless) out.push({ name: 'Heel grip', qty: '1 pair', how: 'Microsuede, over the counter' }); out.push({ name: 'Backers', qty: '1 pair set', how: S.laced ? 'Non-woven, under the eyestay and the topline' : 'Non-woven, under the topline' });
  if (s.lining === 'insulated') out.push({ name: 'Insulation', qty: '1 pair set', how: '200 g synthetic, laminated to the lining' });
  if (s.membrane) out.push({ name: 'Waterproof membrane bootie', qty: '1 pair', how: 'Breathable laminate, sewn and seam-taped; a membrane sock under the foot' });
  out.push(S.backless ? { name: 'Toe puff', qty: '1 pair', how: 'Thermoplastic, activated in the lasting (a mule has no counter)' } : { name: 'Heel counter and toe puff', qty: '1 pair each', how: 'Thermoplastic, activated in the lasting' }, { name: 'Shank', qty: '1 pair', how: S.sole === 'stitched' ? 'Steel' : 'Fibreglass or none' }, { name: 'Size and law labels', qty: '1 pair', how: 'Printed on the tongue lining' }, { name: 'Box and tissue', qty: '1', how: '' });
  return out;
}
// what goes into a pair of open footwear that is not cut: the footbed or the mould, the outsole, the buckles, the post
function openComponents(s, S) {
  const V = s.variant, out = [];
  if (S.open === 'moulded') {
    out.push({ name: V === 'slide' ? 'Footbed' : V === 'clog' ? 'Clog shell and sole' : 'Slide', qty: '1 pair', how: `Injection-moulded EVA${V === 'recovery' ? ', a soft high-rebound compound' : ''}; one shot` });
    if (V === 'slide') out.push({ name: 'Strap', qty: '1 pair', how: 'Synthetic leather over 3 mm foam, lined; cemented into the footbed\'s slots' });
    if (V === 'clog') out.push({ name: 'Heel strap', qty: '1 pair', how: 'Moulded EVA' }, { name: 'Rivets', qty: '4', how: 'Plastic, through the shell and the heel strap' });
  } else {
    out.push({ name: V === 'wood' ? 'Wooden base' : V === 'thong' ? 'EVA footbed' : V === 'fisherman' || V === 'multi' ? 'Insole board and sock' : 'Cork and latex footbed', qty: '1 pair', how: V === 'wood' ? 'Alder, CNC carved to the foot and sanded, sealed' : V === 'thong' ? 'Die-cut and pressed, 15 mm' : V === 'fisherman' || V === 'multi' ? 'Board 2 mm, foam sock 4 mm; the straps lasted onto it' : 'Pressed in a footbed mould: heel cup, arch, toe bar' });
    out.push({ name: 'Top cover', qty: '1 pair', how: V === 'thong' ? 'Printed EVA or textile' : 'Suede or leather, cemented over the strap ends' });
    out.push({ name: V === 'wood' ? 'Rubber tread pad' : 'Outsole', qty: '1 pair', how: V === 'wood' ? 'Nailed and cemented under the base' : V === 'thong' ? 'Rubber sheet, die-cut with the footbed' : 'Moulded rubber, cemented' });
    const buckles = V === 'two-strap' ? 4 : V === 'suede' ? 2 : V === 'fisherman' || V === 'multi' ? 2 : 0;
    if (buckles) out.push({ name: 'Buckles', qty: `${buckles} a pair`, how: 'Metal, with a tongue; the holes punched ½ in apart' });
    if (V === 'thong') out.push({ name: 'Toe post plug', qty: '1 pair', how: 'Rubber, locks the post under the outsole' });
    if (V === 'wood') out.push({ name: 'Brass tacks', qty: 'about 60 a pair', how: 'Round the base, ½ in apart' });
    if (V === 'fisherman' || V === 'multi') out.push({ name: 'Heel counter', qty: '1 pair', how: 'Thermoplastic, in the heel strap' });
    if (S.open === 'clog') out.push({ name: 'Toe puff', qty: '1 pair', how: 'Light, thermoplastic' });
  }
  out.push({ name: 'Size and law labels', qty: '1 pair', how: S.open === 'moulded' ? 'Moulded into the footbed' : 'Printed on the top cover' }, { name: 'Box and tissue', qty: '1', how: S.open === 'moulded' ? 'Or a bag and a header card' : '' });
  return out;
}
// the tools a run takes: a pair of lasts for each size (and width), a sole mould for each pair of half sizes; rough costs and lead times
export function tooling(input = {}) {
  const s = cleanFootwear(input), S = lineOf(s), run = sizeRun(s), moulds = new Set(run.map(r => r.mould)).size;
  // open footwear: a moulded shoe takes an injection mould for each size (no lasts); a footbed takes a footbed press mould for each size and an
  // outsole mould (a wooden base a CNC program); a thong is die-cut (knives for each size)
  if (S.open) {
    const V = s.variant, n = run.length;
    if (S.open === 'moulded') return { sizes: n, lastPairs: 0, lastCost: [0, 0], moulds: n, mouldCost: [n * 3000, n * 6000], weeks: [6, 10], note: `${n} sizes: ${n} injection moulds (about $3,000–6,000 each, cut from the last's 3D model, oversize for the EVA's shrink); no lasts; about 6–10 weeks for the tools` };
    if (V === 'thong') return { sizes: n, lastPairs: 0, lastCost: [0, 0], moulds: n, mouldCost: [n * 150, n * 300], weeks: [2, 3], note: `${n} sizes: ${n} pairs of cutting knives for the footbed and the outsole (about $150–300 a size); about 2–3 weeks` };
    if (V === 'wood') return { sizes: n, lastPairs: n, lastCost: [n * 40, n * 90], moulds: 0, mouldCost: [600, 1500], weeks: [3, 5], note: `${n} sizes: a CNC program for the base in each size (about $600–1,500 in all), ${n} pairs of lasts to shape the vamp on; about 3–5 weeks` };
    return { sizes: n, lastPairs: n, lastCost: [n * 40, n * 90], moulds: moulds * 2, mouldCost: [moulds * 1400, moulds * 2800], weeks: [4, 7], note: `${n} sizes: ${n} pairs of lasts (to fit the ${S.open === 'clog' ? 'vamp' : 'straps'} on), ${moulds} footbed press moulds and ${moulds} outsole moulds (about $700–1,400 each); about 4–7 weeks` };
  }
  const mouldCost = S.sole === 'cupsole' ? [1800, 3500] : S.sole === 'midsole' ? [2500, 5000] : [900, 1800];
  return { sizes: run.length, lastPairs: run.length, lastCost: [run.length * 40, run.length * 90], moulds, mouldCost: [moulds * mouldCost[0], moulds * mouldCost[1]], weeks: S.sole === 'stitched' ? [3, 5] : [5, 8],
    note: `${run.length} sizes: ${run.length} pairs of lasts (plastic, about $40–90 a pair), ${moulds} sole moulds${S.sole === 'stitched' ? ' (or a stock sole, with no mould)' : ''}, about ${S.sole === 'stitched' ? '3–5' : '5–8'} weeks for the tools` };
}
// what to look at before a sample. `assembly`: the pattern's assembly check (footwearAssembly), when the pattern is already drafted;
// without it the pattern is drafted here, so the findings are the same wherever they are asked for
export function footwearChecks(input = {}, last = lastOf(input), assembly) {
  const s = cleanFootwear(input), S = lineOf(s), out = [];
  // does it go together? what the assembly check found wrong comes first: a seam whose two sides differ, an allowance that is not there
  const A = assembly === undefined ? footwearPattern(s, last.size).assembly : assembly;
  if (A) { for (const x of A.seams.filter(x => x.ok === false)) out.push({ level: 'fail', msg: `${x.name}: ${x.a} in against ${x.b} in (${x.diff > 0 ? '+' : ''}${x.diff} in; it may differ by ${x.range[0]} to ${x.range[1] > 0 ? '+' : ''}${x.range[1]}). ${x.why ? x.why[0].toUpperCase() + x.why.slice(1) + '.' : ''}`.trim() });
    for (const x of A.meas.filter(x => x.ok === false)) out.push({ level: 'fail', msg: `${x.name}: ${x.got} against ${x.want}${x.tol != null ? ` (within ${x.tol})` : ''}. ${x.rule ? x.rule[0].toUpperCase() + x.rule.slice(1) + '.' : ''}`.trim() });
    for (const x of A.missing) out.push({ level: 'fail', msg: `Missing: ${x.need} (${x.for}).` }); }
  const pitchRange = { sneaker: [.25, 1], hightop: [.25, 1], runner: [.2, .8], derby: [.6, 1.6], loafer: [.5, 1.4], chelsea: [.75, 1.75], boot: [.75, 2], hiker: [.5, 1.5], mule: [.25, 3], sandal: [0, 1.25], 'footbed-clog': [.25, 1.5], moulded: [.25, 1.25] }[s.style];
  if (s.heel < pitchRange[0] || s.heel > pitchRange[1]) out.push({ level: 'warn', msg: `A ${r8(s.heel)} in heel is outside what a ${S.label.toLowerCase()} usually takes (${pitchRange[0]}–${pitchRange[1]} in): check the last maker can build it and the pitch is comfortable.` });
  if (s.spring < s.heel * .25 && s.heel > 1) out.push({ level: 'warn', msg: 'A high heel with little toe spring rocks badly: add spring, about a third of the heel height.' });
  if (s.toe === 'pointed' && ['sneaker', 'hightop', 'runner', 'hiker'].includes(s.style)) out.push({ level: 'warn', msg: 'A pointed toe on an athletic last pinches: an almond or round toe is usual.' });
  if (S.collar < 4 && S.collar - .45 > 2.4 + (last.foot - 10.33) * .1) out.push({ level: 'warn', msg: 'The collar dips to just under the ankle bone: check it does not rub on the fitting sample.' });
  // open and backless footwear: what holds the foot instead of a back, and how the straps are trued up
  if (S.backless && s.heel > 1.5) out.push({ level: 'warn', msg: 'A backless shoe on a high heel slides forward: give it a deep heel seat and a snug vamp, and check the toe does not overshoot on the fitting sample.' });
  if (S.open === 'sandal') out.push({ level: 'info', msg: s.variant === 'thong' ? 'The toe post: check it sits between the first and second toe without rubbing, on a narrow and a wide foot.' : 'Strap lengths are drafted from the last: fit them on a low and a high instep; a buckle gives about ¾ in either way.' });
  if (S.open === 'moulded') out.push({ level: 'info', msg: 'EVA shrinks 1.5–3% out of the mould: the mould is cut oversize; check a moulded pair against the last before the run.' });
  if (S.open === 'clog') out.push({ level: 'info', msg: 'A clog holds the foot by the vamp alone: check the throat is snug enough that the heel lifts with the foot.' });
  if (s.upper === 'mesh' && s.toeCap === false && s.style !== 'runner') out.push({ level: 'info', msg: 'A mesh upper wants a toe bumper or cap to keep its shape.' });
  out.push({ level: 'info', msg: `Fitting sample in size ${s.size}${s.width ? ' ' + s.width : ''}, then a size-run sample (the smallest, the middle and the largest) before the moulds are cut.` });
  out.push({ level: 'info', msg: 'Tests: sole bond (peel), flex (Bally or Ross), abrasion, colour fastness, and the restricted-substances list (CA Prop 65 / REACH) for leather and rubber.' });
  return out;
}
// ---- does the pattern go together? ----
// The assembly check: every seam of the upper walked, and every fit measured, off the piece outlines as they are cut and off the last
// itself (its sections and its profile), not off the formulas that drafted them. It answers the questions a factory finds out the hard
// way: does the upper reach under the last with its allowance all round, does a strobel upper's edge meet its sock, are the two sides of
// the back seam the same length, is a lining or a foam bigger than what it sits in, does the counter stand above the collar, is the insole
// as long as the bottom it is cemented to, and are enough of each piece cut for a pair.
//   → { seams: [{ name, a, b, diff, range, ok, why }], meas: [{ name, got, want, tol | rule, ok }], missing: [{ need, for }], ok, passed, made, total }
// (ok: null on a seam or a measure means it could not be walked: a piece edited by hand, or cut in two by a seam drawn on the last)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), r2 = v => Math.round(v * 100) / 100, perimOf = P => P.reduce((t, p, i) => t + dist(p, P[(i + 1) % P.length]), 0), lineLen = P => P.reduce((t, p, i) => (i ? t + dist(p, P[i - 1]) : 0), 0);
const insidePoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
// where a point lies along a closed outline (the distance round to the nearest place on it), and how far off the outline it is
function placeOn(P, p) { let best = { d: Infinity, u: 0 }, u = 0; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, l = Math.sqrt(L2), t = L2 ? Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0), 1) : 0, d = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); if (d < best.d) best = { d, u: u + l * t }; u += l; } return best; }
const offOutline = (P, p) => placeOn(P, p).d;
// the run of an outline between two points on it: the shorter way round, or the way that passes `via`; null when a point is not on the outline
function runOn(P, a, b, via = null) { if (!P || !a || !b) return null; const A = placeOn(P, a), B = placeOn(P, b); if (A.d > .08 || B.d > .08) return null; const T = perimOf(P), f = ((B.u - A.u) % T + T) % T;
  if (via) { const V = placeOn(P, via), fv = ((V.u - A.u) % T + T) % T; return fv <= f ? f : T - f; } return Math.min(f, T - f); }
// across a piece along a section marked on it (a line from beyond one edge, over the fold, to beyond the other): how much of the line
// lies inside the outline, measured both ways from the fold
function acrossOn(P, st) { const R = st.rib; if (!Array.isArray(R) || R.length < 3) return null; const mid = (R.length - 1) / 2; if (!Number.isInteger(mid) || !insidePoly([R[mid][0], R[mid][1] + 1e-4], P) && !insidePoly([R[mid][0], R[mid][1] - 1e-4], P)) return null;
  const out = step => { let d = 0; for (let i = mid; i + step >= 0 && i + step < R.length; i += step) { const a = R[i], b = R[i + step]; let t = Infinity;
      for (let k = 0; k < P.length; k++) { const c = P[k], e = P[(k + 1) % P.length], den = (b[0] - a[0]) * (e[1] - c[1]) - (b[1] - a[1]) * (e[0] - c[0]); if (Math.abs(den) < 1e-12) continue; const u = ((c[0] - a[0]) * (e[1] - c[1]) - (c[1] - a[1]) * (e[0] - c[0])) / den, w = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den; if (u > 1e-9 && u <= 1 && w >= 0 && w <= 1) t = Math.min(t, u); }
      if (t !== Infinity) return d + dist(a, b) * t; d += dist(a, b); } return d; };
  return out(1) + out(-1); }
// a tape over the last at x, from the edge of the bottom on one side over the top to the edge of the bottom on the other (the bottom's
// edge is the insole's: the section's full width, at its lowest): the section's outline pulled taut (its convex hull), less the bottom
function tapeOver(last, x, upTo = null) {
  const ring = ringOf(last, x, 240), ys = ring.map(p => p[1]), zs = ring.map(p => p[2]), lo = Math.min(...ys), hi = Math.max(...ys), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const pts = ring.map(p => [p[2], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const up = [[z0, lo]]; for (const p of [...pts, [z1, lo]]) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) >= -1e-12) up.pop(); up.push(p); } // the taut line over the top, from one bottom corner to the other
  if (upTo == null) return lineLen(up);
  // one side only, from the bottom's edge up to a height (a topline): up the taut line to that height, and straight on above the last
  let d = 0; for (let i = up.length - 1; i > 0; i--) { const a = up[i], b = up[i - 1]; if (b[1] <= a[1]) break; if (b[1] >= upTo) return d + dist(a, b) * (upTo - a[1]) / (b[1] - a[1]); d += dist(a, b); }
  return d + Math.max(0, upTo - hi);
}
// a length in inches as a factory reads it: 7 1/2, 9 3/16
const fr8 = v => { const e = Math.round(v * 16), w = Math.floor(e / 16); let n = e - w * 16, g = 16; while (n && n % 2 === 0) { n /= 2; g /= 2; } return n ? `${w ? w + ' ' : ''}${n}/${g}` : `${w}`; };
export function footwearAssembly(pat) {
  if (!pat || pat.kind !== 'footwear') return null;
  const last = pat.last, { L, lastBottom: bot, crest } = last, s = pat.spec, S = lineOf(s), P = id => pat.pieces.find(q => q.id === id && q.cut > 0), seams = [], meas = [], missing = [];
  const how = pat.lasting || { how: lastingOf(s), allowance: S.open === 'clog' ? TUCK : lastingOf(s) === 'strobel' ? STROBEL_MARGIN : LAST_MARGIN, lining: LINING_MARGIN, lap: LAP }, EDGE = how.allowance, strobel = how.how === 'strobel';
  const seam = (name, a, b, { range = [-.125, .125], why = '' } = {}) => { if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) { seams.push({ name, ok: null, why: 'not walked: an edge is not labelled on the pieces as they are now' }); return; } const d = r2(b - a); seams.push({ name, a: r2(a), b: r2(b), diff: d, range: range.map(r2), ok: d >= range[0] - 1e-6 && d <= range[1] + 1e-6, why }); };
  const measure = (name, got, want, tol, rule = '') => { if (got == null || want == null || Number.isNaN(got)) { meas.push({ name, ok: null, why: 'not measurable on the pieces as they are now' }); return; } const d = r2(got - want); meas.push({ name, got: r2(got), want: r2(want), diff: d, tol, ...(rule ? { rule } : {}), ok: Math.abs(got - want) <= tol + 1e-6 }); };
  const atLeast = (name, got, want, rule) => { if (got == null || Number.isNaN(got)) { meas.push({ name, ok: null, why: 'not measurable on the pieces as they are now' }); return; } meas.push({ name, got: r2(got), want: r2(want), diff: r2(got - want), rule, ok: got >= want - 1e-6 }); };
  const need = (ok, what, why) => { if (!ok) missing.push({ need: what, for: why }); };
  const flat = Boolean(pat.flat) || pat.pieces.some(q => q.flattened);
  // ---- how many of each: for a pair of shoes ----
  for (const q of pat.pieces) { if (!q.cut || q.component) continue;
    const oneSide = (q.flattened === 'lateral' || q.flattened === 'medial') && !/-(lat|med)(-|$)/.test(q.id) && q.on !== 'centre', want = q.on === 'each' || (oneSide && q.on !== 'side') ? 4 : 2;
    if (q.cut !== want) meas.push({ name: `${q.name}: how many are cut for a pair`, got: q.cut, want, diff: q.cut - want, rule: want === 4 ? 'drawn for one side of the shoe and put on both: 4 a pair' : 'one on each shoe: 2 a pair', ok: false }); }
  meas.push({ name: 'Cut counts: every piece cut for a pair of shoes', got: pat.pieces.filter(q => q.cut && !q.component).length - meas.length, want: pat.pieces.filter(q => q.cut && !q.component).length, diff: -meas.length, rule: '2 of a piece there is one of on a shoe, 4 of one that goes on both sides', ok: meas.length === 0 });
  // ---- what the shoe cannot be made without ----
  if (!S.open) { need(P('vamp'), 'Vamp', 'the forepart'); need(P('quarter-lat') && P('quarter-med') || pat.pieces.some(q => q.cutBy), 'Quarters, outside and inside', 'the sides and the back'); need(S.backless || P('counter'), 'Heel counter', 'the back of a shoe with a heel seat: without it the back collapses');
    need(P('toe-puff'), 'Toe puff', 'the toe keeps its shape'); need(P('insole') || P('strobel'), strobel ? 'Strobel sock' : 'Insole board', 'the upper is closed under the foot'); need(P('sockliner'), 'Sockliner', 'under the foot');
    if (S.laced) { need(P('tongue') && P('tongue-lining'), 'Tongue and its lining', 'a laced shoe'); need(P('eyestay'), 'Eyestays', 'the lacing'); }
    if (s.style === 'chelsea') { need(P('gore'), 'Elastic gores', 'a Chelsea boot'); need(P('shaft-front'), 'Front shaft', 'a Chelsea boot\'s leg, in front of the gore'); } }
  if (!flat) return finish();
  // ---- pieces cut whole: wide enough to reach under the last with their allowance, at every section and round the toe ----
  const wall = bot(L) - crest(L); // how high the last stands at the tip of the toe (the side view)
  const reach = (q, want, label) => { if (!q) return; if (!q.fold || !(q.stations || []).length && q.fold.length < 3) { meas.push({ name: `${q.name}: ${label} left`, ok: null, why: 'not measurable: the piece has no fold to measure from' }); return; }
    const u = [q.fold[1][0] - q.fold[0][0], q.fold[1][1] - q.fold[0][1]], ul = Math.hypot(...u) || 1, dir = [u[0] / ul, u[1] / ul], left = [];
    for (const st of q.stations || []) { const w = acrossOn(q.sew, st); if (w != null) left.push({ where: `${fr8(st.x)} in from the heel`, v: (w - tapeOver(last, st.x)) / 2 }); }
    if (q.fold.length === 3) { const tip = placeOn(q.sew, q.fold[2]); left.push({ where: 'the tip of the toe', v: (tip.d < .08 ? dist(q.fold[1], q.fold[2]) : -wall + 0 * tip.d) - wall }); }
    if (!left.length) { meas.push({ name: `${q.name}: ${label} left`, ok: null, why: 'not measurable: no section crosses the piece' }); return; }
    const lo = left.reduce((a, b) => (b.v < a.v ? b : a)), hi = left.reduce((a, b) => (b.v > a.v ? b : a)), worst = Math.abs(lo.v - want) >= Math.abs(hi.v - want) ? lo : hi;
    void worst; meas.push({ name: `${q.name}: ${label} left each side, at its least (${lo.where})`, got: r2(lo.v), want: r2(want), diff: r2(lo.v - want), most: r2(hi.v), tol: .0625, rule: `measured at ${left.length} places, along a section marked across the piece against a tape over the last there, and beyond the top of the toe: never more than 1/16 in short, and no more than ⅛ in over (a flat sheet laid over a round last is a little full)`, ok: lo.v >= want - .0625 - 1e-6 && hi.v <= want + .125 + 1e-6 }); };
  reach(P('vamp'), EDGE, S.open === 'clog' ? 'tuck' : strobel ? 'strobel allowance' : 'lasting allowance'); reach(P('toe-cap'), EDGE, strobel ? 'strobel allowance' : 'lasting allowance'); reach(P('saddle'), EDGE, 'lasting allowance');
  reach(P('vamp-lining'), how.lining, S.open === 'clog' ? 'tuck' : 'allowance'); reach(P('toe-puff'), S.open === 'clog' ? LINING_MARGIN : how.lining, 'allowance');
  // (the fold itself against the last's centre line: laid a little short, the leather being drawn forward over the toe; never long)
  // (the centre line runs over the top of the last, straight as seen from above from the top of the section it starts at to the top of
  // the toe: where the toe lies to one side of that section it is a little longer than the crest drawn on the side view. The last
  // 1/10 in is the round of the toe, taken straight)
  { const v = P('vamp'); if (v?.fold?.length === 3 && (v.stations || []).length) { const st = v.stations[0], N = 200, xr = L - TOE_ROUND, top = x => ringOf(last, x, 4)[1], dz = (top(xr)[2] - top(st.x)[2]) / N; let arc = TOE_ROUND; for (let i = 1; i <= N; i++) { const a = st.x + (xr - st.x) * (i - 1) / N, b = st.x + (xr - st.x) * i / N; arc += Math.hypot(b - a, crest(b) - crest(a), dz); }
    seam(`Vamp: its fold against the last's centre line, from ${fr8(st.x)} in to the toe`, arc, dist(st.at, v.fold[1]), { range: [-.08 * arc, .0625], why: 'the fold is laid up to 8% short of the centre line over the top of the last (the vamp is drawn forward as it is lasted), never longer than it' }); } }
  // ---- inside the vamp: its lining and the toe puff no bigger than it ----
  const within = (name, a, b, slack = .03) => { if (!a || !b) return; const n = a.sew.filter(p => insidePoly(p, b.sew) || offOutline(b.sew, p) <= slack).length; meas.push({ name, got: n, want: a.sew.length, diff: n - a.sew.length, rule: `every point of the ${a.name.toLowerCase()} inside the ${b.name.toLowerCase()}`, ok: n === a.sew.length }); };
  within('Vamp lining inside the vamp', P('vamp-lining'), P('vamp')); within('Toe puff inside the vamp', P('toe-puff'), P('vamp'));
  if (S.open) return finish();
  // ---- the quarters ----
  const ql = P('quarter-lat'), qm = P('quarter-med'), E = (q, a, b, via) => (q?.at ? runOn(q.sew, q.at[a], q.at[b], via ? q.at[via] : null) : null);
  if (!S.backless) seam('Back seam: outside quarter to inside quarter', E(ql, 'backTop', 'backEdge'), E(qm, 'backTop', 'backEdge'), { why: 'closed edge to edge and taped: the two sides the same length' });
  // each quarter from its topline down to its cut edge, against the last from the same height down to the edge of its bottom: what is left is the allowance
  for (const q of [ql, qm]) { if (!q) continue; if (!q.at || !q.shown) { meas.push({ name: `${q.name}: lasting allowance left`, ok: null, why: 'not measurable: the quarter is not labelled' }); continue; }
    const b = boundsOf(q.shown), left = [], x0 = b.x0 + .9, x1 = b.x1 - .9;
    for (const x of x1 - x0 > 1 ? [x0, (x0 + x1) / 2, x1] : [(b.x0 + b.x1) / 2]) { let yTop = Infinity; // three places along the piece, clear of its ends const Sh = q.shown; for (let i = 0; i < Sh.length; i++) { const a = Sh[i], c = Sh[(i + 1) % Sh.length]; if ((a[0] - x) * (c[0] - x) <= 0 && a[0] !== c[0]) yTop = Math.min(yTop, a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0])); }
      if (!Number.isFinite(yTop)) continue;
      // (measured from the topline, or from 6/10 of the way up the last where the topline is higher than that: near the flat top of a
      // section, and above the last, a height does not say how far round it a point is)
      yTop = Math.max(yTop, bot(x) - .6 * (bot(x) - crest(x)));
      const h = shellOf(last, { leg: pat.leg })[q.flattened === 'medial' ? 'medial' : 'lateral'], top = flattenPoint(h, [x, yTop]), fe = flattenPoint(h, [x, bot(x)]);
      // on the piece: from its topline to where the last's edge lies on it, and on to its cut edge; on the last: from that height down to the edge of the bottom
      if (!insidePoly(fe, q.sew)) { left.push({ where: `${fr8(x)} in from the heel`, v: -offOutline(q.sew, fe) + dist(top, fe) - tapeOver(last, x, -yTop) }); continue; }
      left.push({ where: `${fr8(x)} in from the heel`, v: offOutline(q.sew, fe) + dist(top, fe) - tapeOver(last, x, -yTop) }); }
    if (!left.length) continue; const lo = left.reduce((a, c) => (c.v < a.v ? c : a)), hi = left.reduce((a, c) => (c.v > a.v ? c : a));
    meas.push({ name: `${q.name}: ${strobel ? 'strobel' : 'lasting'} allowance left, at its least (${lo.where})`, got: r2(lo.v), want: r2(EDGE), diff: r2(lo.v - EDGE), most: r2(hi.v), tol: .125, rule: 'down the piece from its topline to the last\'s edge and on to its cut edge, against the last from the same height down to the edge of its bottom: within ⅛ in (a flattened side holds a length that well)', ok: lo.v >= EDGE - .125 - 1e-6 && hi.v <= EDGE + .125 + 1e-6 }); }
  // ---- a boot's or a high-top's leg: as high as cut as it is drawn ----
  // (round the leg the upper stands above the last, so nothing holds it but its own height: at three places from the back seam to the
  // front of the leg, the piece from its feather line up to its collar against the same on the side view. A collar that is higher at the
  // middle of the leg than at the back seam bows when the back seam is closed)
  if (S.shaft && pat.marks?.leg) for (const q of [ql, qm]) { if (!q?.shown) continue; const b = boundsOf(q.shown), x1 = Math.min(pat.marks.leg, b.x1) - .3, h = shellOf(last, { leg: pat.leg })[q.flattened === 'medial' ? 'medial' : 'lateral'], off = [];
    for (const x of x1 > 1.5 ? [.6, (x1 + .6) / 2, x1] : []) { let yTop = Infinity; const Sh = q.shown; for (let i = 0; i < Sh.length; i++) { const a = Sh[i], c = Sh[(i + 1) % Sh.length]; if ((a[0] - x) * (c[0] - x) <= 0 && a[0] !== c[0]) yTop = Math.min(yTop, a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0])); }
      if (!Number.isFinite(yTop)) continue;
      // on the piece: from where the feather line lies on it, up the section's own line, to the piece's edge at the collar
      const fe = flattenPoint(h, [x, bot(x)]), tp = flattenPoint(h, [x, yTop]), dx = tp[0] - fe[0], dy = tp[1] - fe[1]; let best = null;
      for (let i = 0; i < q.sew.length; i++) { const a = q.sew[i], c = q.sew[(i + 1) % q.sew.length], ex = c[0] - a[0], ey = c[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue; const t = ((a[0] - fe[0]) * ey - (a[1] - fe[1]) * ex) / den, u = ((a[0] - fe[0]) * dy - (a[1] - fe[1]) * dx) / den; if (u >= -1e-9 && u <= 1 + 1e-9 && t > .5 && (best == null || Math.abs(t - 1) < Math.abs(best - 1))) best = t; }
      if (best != null) off.push({ x, drawn: bot(x) - yTop, cut: best * Math.hypot(dx, dy) }); }
    if (off.length) { const w = off.reduce((a, c) => (Math.abs(c.cut - c.drawn) > Math.abs(a.cut - a.drawn) ? c : a)); measure(`${q.name}: the leg's height as it is cut against as it is drawn, where they differ most (${fr8(w.x)} in from the heel)`, w.cut, w.drawn, .125, `feather line to collar at ${off.length} places from the back seam to the front of the leg`); } }
  // ---- the quarters onto the vamp ----
  const v = P('vamp');
  if (v?.lines?.lap && s.style !== 'chelsea') { seam('Outside quarter onto the vamp: its front edge against the line it laps to', lineLen(v.lines.lap), E(ql, 'frontEdge', 'frontTop'), { why: `the quarter laps ${fr8(how.lap)} in over the vamp; its edge and the line marked on the vamp are the same length` });
    seam('Inside quarter onto the vamp: its front edge against the line it laps to', lineLen(v.lines.lapM), E(qm, 'frontEdge', 'frontTop'), { why: 'as the outside' }); }
  { const lin = P('quarter-lining'); if (lin && ql && !S.backless) seam('Quarter lining: its back edge against the outside quarter\'s, topline to feather line', E(ql, 'backTop', 'backFeather'), lin.at ? runOn(lin.sew, lin.at.backTop, lin.at.backFeather) : null, { why: 'the lining is closed at the back as the quarters are' }); }
  // ---- a Chelsea boot: the gore between the back quarter and the front shaft, the front shaft up to the collar and under the vamp ----
  if (s.style === 'chelsea') { const g = P('gore'), sf = P('shaft-front'), F2 = (a, b) => (sf?.at ? runOn(sf.sew, sf.at[a], sf.at[b]) : null);
    seam('Gore into the back quarter', g?.lines ? lineLen(g.lines.back) : null, E(ql, 'goreTop', 'goreBottom'), { why: 'the elastic is stitched flat (unstretched) under the quarter\'s edge' });
    seam('Gore into the front shaft', g?.lines ? lineLen(g.lines.front) : null, F2('goreTop', 'goreBottom'), { why: 'and under the front shaft\'s back edge' });
    seam('The collar level across the gore: how far the gore\'s top is below the back quarter\'s corner and the front shaft\'s', E(ql, 'frontTop', 'goreTop'), F2('topBack', 'goreTop'), { why: 'the front shaft reaches the collar as the back quarter does' });
    seam('Front shaft onto the vamp, outside: its front edge against the line it laps to', v?.lines?.lap ? lineLen(v.lines.lap) : null, F2('frontEdge', 'frontTop'), { why: `the front shaft laps ${fr8(how.lap)} in over the vamp` });
    seam('Front shaft onto the vamp, inside', v?.lines?.lapM ? lineLen(v.lines.lapM) : null, F2('frontEdgeM', 'frontTopM'), { why: 'as the outside' });
    seam('Front shaft under the back quarter, below the gore', E(ql, 'goreBottom', 'frontEdge'), F2('stepBack', 'backEdge'), { range: [-.125, .3], why: 'the quarter\'s edge from the foot of the gore to its lasting edge covers the front shaft\'s, which stops ⅛ in short of the gore\'s foot' });
  }
  // ---- a strobel upper: its edge against the sock's, between the notches ----
  if (strobel && !S.backless) { const sk = P('strobel'), A = (q, k) => q?.at?.[k];
    // (a Chelsea's edge is its back quarter's, its front shaft's less the ⅜ in that lies under the quarter, and its vamp's)
    const sf = s.style === 'chelsea' ? P('shaft-front') : null, mid = m => (s.style !== 'chelsea' ? 0 : sf?.at ? (r => (r == null ? null : r - how.lap))(runOn(sf.sew, sf.at['backEdge' + m], sf.at['frontEdge' + m])) : null);
    const side = (name, q, vm, m) => seam(name, sk?.at ? runOn(sk.sew, sk.at['heelNotch' + m], sk.at['toeNotch' + m]) : null, q?.at && v?.at ? (x => (x.some(y => y == null) ? null : x[0] + x[1] + x[2]))([runOn(q.sew, A(q, 'heelNotch'), A(q, 'frontEdge')), runOn(v.sew, A(v, 'lapEdge' + vm), A(v, 'toeNotch' + vm)), mid(m)]) : null, { range: [-.125, Math.max(.25, .04 * (sk?.at ? runOn(sk.sew, sk.at['heelNotch' + m], sk.at['toeNotch' + m]) || 0 : 0))], why: 'notch to notch along the side: the upper\'s edge is the sock\'s length or a little more, never ⅛ in short (a short upper puckers the sock); up to 4% of fullness (¼ in on a short side) is eased in as the seam is run' });
    side('Strobel seam, outside: heel notch to toe notch', ql, '', ''); side('Strobel seam, inside: heel notch to toe notch', qm, 'M', 'M');
    const turn = Math.PI * STROBEL_MARGIN; // the sock's edge lies 3/16 in inside the line the upper is cut from: round a half-turn that is π × 3/16 in shorter
    seam('Strobel seam round the heel: notch to notch', sk?.at ? runOn(sk.sew, sk.at.heelNotchM, sk.at.heelNotch) : null, ql?.at && qm?.at ? (x => (x.some(y => y == null) ? null : x[0] + x[1]))([runOn(ql.sew, ql.at.backEdge, ql.at.heelNotch), runOn(qm.sew, qm.at.backEdge, qm.at.heelNotch)]) : null, { range: [-.0625, turn + .125], why: `the upper's edge turns under the last on a smaller circle than it is cut on: up to π × 3/16 in (${r2(turn)} in) of fullness is eased in round the heel` });
    seam('Strobel seam round the toe: notch to notch', sk?.at ? runOn(sk.sew, sk.at.toeNotch, sk.at.toeNotchM) : null, v?.at ? runOn(v.sew, v.at.toeNotch, v.at.toeNotchM, v.fold?.[2]) : null, { range: [0, Math.PI * (2 * STROBEL_MARGIN + wall) + .125], why: `the vamp is cut the toe's height (${r2(wall)} in) and 3/16 in outside the feather line, and the sock 3/16 in inside it: round the half-turn of the toe that is π × (the toe's height and ⅜ in) (${r2(Math.PI * (2 * STROBEL_MARGIN + wall))} in) of fullness, gathered onto the sock before the seam is run` }); }
  else if (strobel) seams.push({ name: 'Strobel seam', ok: null, why: 'not walked on a backless shoe' });
  // ---- the tongue, its lining and its foam ----
  { const t = P('tongue'), tl = P('tongue-lining'), tf = P('tongue-foam');
    if (t && tl) seam('Tongue lining to the tongue, all round', perimOf(t.sew), perimOf(tl.sew), { why: 'bagged edge to edge: the lining is the tongue\'s own outline' });
    if (t && tf) { const n = tf.sew.filter(p => insidePoly(p, t.sew)).length; meas.push({ name: 'Tongue foam inside the tongue', got: n, want: tf.sew.length, diff: n - tf.sew.length, rule: 'every point of the foam inside the tongue it pads', ok: n === tf.sew.length }); }
    // the lace edge, measured off the eyestay as it shows on the shoe, between the two ends of it the eyestay is marked with (the other
    // way round the eyestay is its inner edge and its two ends: always the longer way)
    const es = P('eyestay');
    if (t && es) measure('Tongue: how far it stands above the top of the lace edge', es.shown && es.laceEnds ? (lace => (lace == null ? null : boundsOf(t.sew).h - lace - how.lap))(runOn(es.shown, es.laceEnds[0], es.laceEnds[1])) : null, 2, .125, 'as long as the lace edge (measured off the eyestay), ⅜ in under the vamp, 2 in standing above the collar'); }
  // ---- the counter: under the topline, and no further under the last than the upper ----
  { const c = P('counter'), q = pat.pieces.find(x => x.id === 'quarter-lat' && x.shown);
    if (c?.shown && q) { const topAt = x => { let y = Infinity; const Sh = q.shown; for (let i = 0; i < Sh.length; i++) { const a = Sh[i], e = Sh[(i + 1) % Sh.length]; if ((a[0] - x) * (e[0] - x) <= 0 && a[0] !== e[0]) y = Math.min(y, a[1] + (e[1] - a[1]) * (x - a[0]) / (e[0] - a[0])); } return y; };
      const gaps = c.shown.filter(p => p[1] < bot(Math.min(Math.max(p[0], 0), L)) - .3).map(p => p[1] - topAt(p[0])).filter(Number.isFinite);
      atLeast('Counter: how far it stays below the topline, at its least', gaps.length ? Math.min(...gaps) : null, .3125, 'on the side view: the counter\'s top against the quarter\'s topline above it, ⅜ in below it all the way (5/16 in at the least)'); }
    if (c?.fold && c.at?.backFeather && ql?.at) { const under = dist(c.fold[0], c.at.backFeather), upper = dist(ql.at.backEdge, ql.at.backFeather);
      if (strobel) measure('Counter: how far it reaches under the last, against the upper\'s edge', under, upper, .03, 'in a strobel shoe the counter ends where the upper\'s edge ends: both are caught in the one seam'); else atLeast('Counter: it stops short of the upper\'s lasting edge', upper - under, .125, 'lasted with the upper but ⅛ in or more short of its edge'); } }
  // ---- under the foot: as long and as wide as the bottom of the last ----
  { let arc = 0; const N = 800; for (let i = 1; i <= N; i++) arc += Math.hypot(L / N, bot(L * i / N) - bot(L * (i - 1) / N)); const lb = boundsOf(last.bottom);
    for (const id of ['insole', 'strobel', 'sockliner', 'membrane-sock']) { const q = P(id); if (!q) continue; const b = boundsOf(q.sew), inset = id === 'strobel' || (id === 'membrane-sock' && strobel) ? 2 * STROBEL_MARGIN : 0;
      measure(`${q.name}: its length against the bottom of the last, measured along its curve`, b.w, arc - inset, .0625, inset ? 'the developed bottom, less 3/16 in at each end' : 'the developed bottom'); measure(`${q.name}: its width against the bottom of the last`, b.h, lb.h - inset, .0625, inset ? 'the bottom at its widest, less 3/16 in each side' : 'the bottom at its widest'); } }
  return finish();
  function finish() { const all = [...seams, ...meas], made = all.filter(x => x.ok !== null); return { seams, meas, missing, ok: made.every(x => x.ok) && !missing.length, passed: made.filter(x => x.ok).length, made: made.length, total: all.length }; }
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
