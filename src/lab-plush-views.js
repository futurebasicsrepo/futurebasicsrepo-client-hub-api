// A plush's tech flats from its choices (shared by the Pattern page and the service; no DOM, no Node): the toy as it is when it is stuffed and
// sewn, from the front, the back and the side, in inches (y downward, the top of the head at 0, the middle at x = 0).
//   plushViews(pat, {colours}) → { front, back, side }: each { svg, box {x0, y0, x1, y1}, name, key }
//   plushLayout(v, gap)        → the three in a row ({ items, box }, as the footwear views' layout, so the page draws either the same way)
//   plushSheet(pat, {title})   → the three on one sheet with the toy's details (an SVG document, 1:1 in inches)
// The shapes follow the pattern (src/lab-pattern.js plushPattern): its sizes, where the face sits, the ears, the arms and the legs. Each part is
// drawn filled out by its stuffing (rounder than the flat piece), with the seams that show as stitch lines, the face as the eyes chosen make it
// (embroidered, safety eyes or felt), the opening left to stuff closed with a ladder stitch, and the sewn-in law label in its seam.
import { strokesSvg } from './lab-sketch.js';
import { lookDefs } from './lab-looks.js';
import { logoMarkup } from './lab-logos.js';

const r3 = v => Math.round(v * 1000) / 1000, P = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L') + ' Z', L_ = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L');
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chaikin = (pts, n = 2, closed = true) => { let a = pts; for (let k = 0; k < n; k++) { const out = closed ? [] : [a[0]], m = closed ? a.length : a.length - 1; for (let i = 0; i < m; i++) { const p = a[i], q = a[(i + 1) % a.length]; out.push([p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25], [p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75]); } if (!closed) out.push(a[a.length - 1]); a = out; } return a; };
const ellipse = (cx, cy, rx, ry, n = 36, rot = 0) => { const c = Math.cos(rot), s = Math.sin(rot); return Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t); return [cx + x * c - y * s, cy + x * s + y * c]; }); };
const mirror = pts => pts.map(([x, y]) => [-x, y]);
// a closed outline through points given down one side, mirrored onto the other (the middle at x = 0)
const sym = half => chaikin([...half, ...mirror(half).reverse()], 3);
// a limb: a rounded capsule from a to b, r wide at a and rb at b
function capsule(a, b, r, rb = r, n = 10) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, out = [];
  for (let i = 0; i <= n; i++) { const t = Math.PI * i / n; out.push([b[0] + (nx * Math.cos(t) + ux * Math.sin(t)) * rb, b[1] + (ny * Math.cos(t) + uy * Math.sin(t)) * rb]); }
  for (let i = 0; i <= n; i++) { const t = Math.PI * i / n; out.push([a[0] + (-nx * Math.cos(t) - ux * Math.sin(t)) * r, a[1] + (-ny * Math.cos(t) - uy * Math.sin(t)) * r]); }
  return out;
};
const COLOURS = { minky: '#e9dccb', shortpile: '#e3cfb2', velboa: '#ead8bd', fleece: '#e6e1d6', fur: '#dcc39f', terry: '#efe7da', leather: '#a87a52', vegan: '#9a7350', suede: '#b89470', velvet: '#7d3b46', boucle: '#ece6da' };
// the surface a cloth shows on the flats when no material is on the part (src/lab-looks.js): a suede's or a velvet's nap, a leather's grain
const SURFACE = { suede: 'nap', velvet: 'nap', leather: 'pebble', vegan: 'pebble', boucle: 'knit', fur: 'fur' };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) / 255; };
function palette(pat, given = {}) { const c = { ...(pat.spec.colours || {}), ...given }, body = c.body || COLOURS[pat.spec.fabric] || '#e9dccb', contrast = c.contrast || shade(body, 1.06); return { body, contrast,
    // a mane in its own colour, read or chosen; else a pale body's in its contrast (a unicorn's), a darker one's a tone deeper (a lion's)
    mane: c.mane || (lum(body) > .78 ? contrast : shade(body, .72)), features: c.features || '#2b2724', line: '#2b2a28', stitch: '#6b655d', blush: '#f2c1b4', fur: pat.spec.fabric === 'fur' }; }

// ---- drawing ----
function painter(pat, C) {
  const fur = C.fur, parts = [];
  // a long-pile fur outline is tufted: the edge broken into short strokes of pile
  const edge = pts => fur ? pts.map((p, i) => { const q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, k = (i % 3 === 0 ? .09 : .04); return [p[0] + dy / l * k, p[1] - dx / l * k]; }) : pts;
  return {
    // a stuffed part: its cloth, the cloth's surface, then its volume (lit from the upper front, turning into shadow underneath and at the
    // back; a leather's sheen sharper), then its outline over all of it
    shape: (pts, fill = C.body, w = .03, flat = false) => { const e = P(edge(pts)), tk = C.tex?.[fill === C.body ? 'body' : fill === C.contrast ? 'contrast' : ''];
      parts.push(`<path d="${e}" fill="${fill}" stroke="none"/>` + (tk ? `<path d="${P(pts)}" fill="url(#lk-${tk}-${C.uid})"/>` : '') + (flat ? '' : `<path d="${e}" fill="url(#vol-${C.uid})"/>`) + `<path d="${e}" fill="none" stroke="${C.line}" stroke-width="${w}" stroke-linejoin="round"/>`); },
    // the soft shadow one part throws on what is behind it (a head on its body, an arm on its side)
    drop: (pts, dx, dy, op = .16) => parts.push(`<path d="${P(pts.map(([x, y]) => [x + dx, y + dy]))}" fill="#1d1712" opacity="${op}" filter="url(#soft-${C.uid})"/>`),
    seam: (pts, closed = false) => parts.push(`<path d="${closed ? P(pts) : L_(pts)}" fill="none" stroke="${C.stitch}" stroke-width=".018" stroke-dasharray=".08 .06" stroke-linecap="round"/>`),
    line: (pts, w = .04, col = C.features) => parts.push(`<path d="${L_(pts)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`),
    fill: (pts, col, op = 1) => parts.push(`<path d="${P(pts)}" fill="${col}" opacity="${op}" stroke="none"/>`),
    raw: s => parts.push(s),
    svg: () => parts.join('')
  };
}
// the eyes as they are made: embroidered (satin-stitched ovals), safety eyes (a 12 mm domed eye with its washer ring), or felt (sewn flat)
function eyes(d, C, eyeType, pts, size) {
  for (const [x, y] of pts) {
    if (eyeType === 'safety') { d.fill(ellipse(x, y, .236, .236), '#151413'); d.raw(`<circle cx="${r3(x)}" cy="${r3(y)}" r=".17" fill="none" stroke="#3b3835" stroke-width=".02"/><circle cx="${r3(x - .07)}" cy="${r3(y - .08)}" r=".05" fill="#fff"/>`); }
    else if (eyeType === 'felt') { d.shape(ellipse(x, y, size * 1.5, size * 1.6), '#fbfaf6', .02); d.fill(ellipse(x, y + size * .2, size * .8, size * .9), C.features); }
    else { d.fill(ellipse(x, y, size * .8, size), C.features); for (let k = -2; k <= 2; k++) d.line([[x + k * size * .28, y - size * .8], [x + k * size * .28, y + size * .8]], .006, '#000'); d.fill(ellipse(x - size * .25, y - size * .35, size * .22, size * .22), '#ffffff', .9); } // a stitched white glint, so the eye reads on any colour
  }
}
// the embroidered nose and mouth
function noseMouth(d, C, x, y, w) {
  const nose = chaikin([[x - w / 2, y], [x + w / 2, y], [x, y + w * .62]], 2); d.fill(nose, C.features);
  d.line([[x, y + w * .6], [x, y + w * 1.05]], w * .14); d.line(chaikin([[x - w * .55, y + w * 1.35], [x - w * .2, y + w * 1.3], [x, y + w * 1.05]], 1, false), w * .14); d.line(chaikin([[x + w * .55, y + w * 1.35], [x + w * .2, y + w * 1.3], [x, y + w * 1.05]], 1, false), w * .14);
}
// the stuffing opening: a stretch of seam closed by hand, the ladder stitch's rungs across it
function ladder(d, C, a, b) { const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / .25)); for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; d.line([[x - .07, y], [x + .07, y]], .02, C.stitch); } d.line([a, b], .015, C.stitch); }
// the law label, sewn into a side seam, its tail out
function lawLabel(d, x, y, side = 1) { d.raw(`<g transform="translate(${r3(x)} ${r3(y)}) rotate(${side * 8})"><rect x="${side > 0 ? 0 : -.75}" y="-.2" width=".75" height=".42" fill="#fff" stroke="#5d5a55" stroke-width=".015"/>${[0, 1, 2].map(k => `<line x1="${side > 0 ? .1 : -.65}" x2="${side > 0 ? .62 : -.13}" y1="${r3(-.08 + k * .11)}" y2="${r3(-.08 + k * .11)}" stroke="#a5a19a" stroke-width=".02"/>`).join('')}</g>`); }
function earShape(kind, w, cx, base, rot) {
  // an ear as it stands on the head: its outline, and the inner ear inside it
  const h = kind === 'long' ? w * 2.9 : kind === 'pointed' ? w * 1.05 : w * .85;
  const half = kind === 'long' ? [[0, -h], [w * .26, -h * .96], [w * .5, -h * .7], [w * .46, -h * .2], [w * .42, 0]] : kind === 'pointed' ? [[0, -h], [w * .1, -h * .92], [w * .38, -h * .35], [w * .5, 0]] : [[0, -h], [w * .32, -h * .92], [w * .5, -h * .45], [w * .46, 0]];
  const out = sym(half), inner = sym(half.map(([x, y]) => [x * .6, y * .78 - h * .03])), c = Math.cos(rot), s = Math.sin(rot), tf = p => [cx + p[0] * c - p[1] * s, base + p[0] * s + p[1] * c];
  return { out: out.map(tf), inner: inner.map(tf) };
}
// where an outline's edge is at a height, on one side
const edgeAt = (pts, y, side) => { let best = null; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if ((p[1] - y) * (q[1] - y) <= 0 && p[1] !== q[1]) { const x = p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]); if (best == null || x * side > best * side) best = x; } } return best ?? 0; };
const box = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
// a height dimension down the left of the front: the toy's height, as it is specified
function heightCallout(d, b, h) { const x = b.x0 - .7; d.raw(`<path d="M${r3(x)} ${r3(b.y0)} L${r3(x)} ${r3(b.y1)} M${r3(x - .15)} ${r3(b.y0)} L${r3(x + .15)} ${r3(b.y0)} M${r3(x - .15)} ${r3(b.y1)} L${r3(x + .15)} ${r3(b.y1)}" stroke="#727278" stroke-width=".02"/><text x="${r3(x - .2)}" y="${r3((b.y0 + b.y1) / 2)}" font-size=".38" fill="#55545a" text-anchor="middle" transform="rotate(-90 ${r3(x - .2)} ${r3((b.y0 + b.y1) / 2)})">${esc(`${h} in`)}</text>`); return x - .5; }

// ---- the bear ----
function bear(pat, C, view) {
  const s = pat.spec, h = s.height, hh = h * .42 * (s.head || 1), hw = hh * 1.05, bh = h * .44, bw = bh * .78, legH = h * .26, armL = h * .3, y0 = hh * .92, d = painter(pat, C), all = [];
  const ear = s.ears !== 'none' ? (s.ears === 'long' ? .22 : .32) * hh : 0, mzk = { none: 0, short: 1, long: 1.4, broad: 1.4 }[s.snout || 'short'];
  if (view === 'side') {
    // the bear from its left, facing left, in the round: what is on its far side first, a tone deeper (the far ear ahead of the near one on
    // the crown, the far arm and leg showing past the body), then the body; the near leg sewn on outside it at the hip, as a jointed bear's
    // is, the foot turned forward on its pad; the head over the body throwing its shadow on the chest; the arm hanging in front
    const far = shade(C.body, .8), hx = hw * .5, head = ellipse(hx, hh * .5, hw * .4, hh * .48, 48);
    // the muzzle: a rounded snout standing out of the face, its back blending into the cheek (no edge where it is sewn into the head)
    // a longer snout stands further out (its nose and mouth with it); with none, the nose sits on the face
    const sx = mzk ? -(hw * .21 * (mzk - 1) + hw * .12 * (mzk - 1)) : hw * .14, mcx = hx - hw * .37 + (mzk ? sx * .5 : 0), muzzle = mzk ? ellipse(mcx + sx * .5, hh * .655, hw * .21 * mzk, hh * .14 * Math.sqrt(mzk), 48, -.08) : [];
    const body = chaikin([[hx - bw * .2, y0 - hh * .04], [hx - bw * .5, y0 + bh * .28], [hx - bw * .52, y0 + bh * .68], [hx - bw * .3, y0 + bh * .98], [hx + bw * .14, y0 + bh], [hx + bw * .4, y0 + bh * .82], [hx + bw * .42, y0 + bh * .36], [hx + bw * .24, y0 + bh * .02]], 3);
    const lx = hx + bw * .04, legOf = (dx, dy = 0) => ({ leg: capsule([lx + dx, y0 + bh * .6 + dy], [lx - bw * .06 + dx, h - legH * .34 + dy], legH * .34, legH * .29),
      foot: chaikin([[lx - legH * .6, h - legH * .02], [lx - legH * .66, h - legH * .3], [lx - legH * .34, h - legH * .52], [lx + legH * .3, h - legH * .42], [lx + legH * .34, h], [lx - legH * .3, h + .02]].map(([x, y]) => [x + dx, y + dy]), 3),
      pad: chaikin([[lx - legH * .64, h - legH * .02], [lx - legH * .66, h - legH * .28], [lx - legH * .54, h - legH * .33], [lx - legH * .47, h - legH * .02]].map(([x, y]) => [x + dx, y + dy]), 2) });
    const armOf = (dx, dy = 0) => [[hx - bw * .1 + dx, y0 + bh * .1 + dy], [hx - bw * .36 + dx, y0 + armL * .86 + dy]];
    if (ear) { const e = earShape(s.ears, ear * .8, hx - hw * .06, hh * .1, .2); d.shape(e.out, far); all.push(...e.out); }
    if (s.wings) all.push(...wingPart(d, C, [hx + bw * .1, y0 + bh * .12], h * .4, 1, far));
    if (s.arms !== false) { const [a, b] = armOf(-bw * .1, -armL * .05), arm = capsule(a, b, armL * .19, armL * .2); d.shape(arm, far); all.push(...arm); }
    if (s.legs !== false) { const F = legOf(-legH * .2, -legH * .05); d.shape(F.foot, far); d.fill(F.pad, shade(C.contrast, .82)); d.shape(F.leg, far); all.push(...F.foot); }
    d.shape(body); d.seam(chaikin([[hx + bw * .14, y0 + bh * .02], [hx + bw * .3, y0 + bh * .5], [hx + bw * .1, y0 + bh * .98]], 2, false)); all.push(...body);
    if (s.legs !== false) { const N = legOf(0); d.drop(N.leg, .1, .06, .14); d.shape(N.leg); d.shape(N.foot); d.fill(N.pad, C.contrast); all.push(...N.leg, ...N.foot); }
    if (s.wings) all.push(...wingPart(d, C, [hx + bw * .16, y0 + bh * .16], h * .42, 1));
    if (ear) { const e = earShape(s.ears, ear * .8, hx + hw * .2, hh * .12, .55); d.shape(e.out); all.push(...e.out); }
    d.drop(head, .05, .18, .2); d.shape(head); d.seam(chaikin([[hx - hw * .3, hh * .44], [hx - hw * .12, hh * .08], [hx + hw * .2, hh * .04], [hx + hw * .38, hh * .32]], 2, false));
    if (mzk) { const mp = painter(pat, { ...C, line: 'none' }); mp.drop(muzzle, .03, .08, .14); mp.shape(muzzle, C.contrast, 0);
      d.raw(`<linearGradient id="mzf-${C.uid}" gradientUnits="userSpaceOnUse" x1="${r3(mcx + sx * .5 + hw * (.02 + .21 * (mzk - 1) * .9))}" y1="0" x2="${r3(mcx + sx * .5 + hw * (.19 + .21 * (mzk - 1)))}" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="mzm-${C.uid}" maskUnits="userSpaceOnUse" x="-999" y="-999" width="9999" height="9999"><rect x="-999" y="-999" width="9999" height="9999" fill="url(#mzf-${C.uid})"/></mask><g mask="url(#mzm-${C.uid})">${mp.svg()}</g>`);
      d.raw(`<path d="${L_(muzzle.filter(([x]) => x < mcx + sx * .5 + hw * (.03 + .21 * (mzk - 1) * .9)))}" fill="none" stroke="${C.line}" stroke-width=".025" stroke-linecap="round"/>`); }
    // the nose at the tip of the snout, the mouth under it
    const nx = ([x, y]) => [x + sx, y];
    d.fill(chaikin([[hx - hw * .6, hh * .6], [hx - hw * .52, hh * .575], [hx - hw * .5, hh * .64], [hx - hw * .57, hh * .66]].map(nx), 2), C.features);
    d.line(chaikin([[hx - hw * .545, hh * .655], [hx - hw * .53, hh * .72]].map(nx), 1, false), hh * .01);
    d.line(chaikin([[hx - hw * .53, hh * .72], [hx - hw * .47, hh * .755], [hx - hw * .4, hh * .745]].map(nx), 2, false), hh * .011);
    eyes(d, C, s.eyes, [[hx - hw * .2, hh * .44]], hh * .045);
    if (s.arms !== false) { const [a, b] = armOf(0), arm = capsule(a, b, armL * .2, armL * .21); d.drop(arm, .1, .08, .16); d.shape(arm); d.seam(capsule(a, b, armL * .1, armL * .11).slice(0, 11), false); all.push(...arm); }
    if (s.horn && s.horn !== 'none') all.push(...hornPart(d, C, s.horn, s.horn === 'one' ? [hx - hw * .12, hh * .04] : [hx + hw * .02, hh * .02], hh * (s.horn === 'one' ? .5 : .42), s.horn === 'one' ? -.3 : s.horn === 'two' ? .45 : .1));
    all.push(...head, ...muzzle);
    return { svg: d.svg(), pts: all };
  }
  // front and back: the legs behind the body, the arms at the shoulders, the head over the neck
  const head = sym([[0, 0], [hw * .3, hh * .03], [hw * .44, hh * .2], [hw * .5, hh * .5], [hw * .44, hh * .8], [hw * .26, hh * .96], [0, hh]]);
  const body = sym([[0, y0 - hh * .04], [bw * .3, y0], [bw * .46, y0 + bh * .18], [bw * .54, y0 + bh * .6], [bw * .46, y0 + bh * .9], [bw * .2, y0 + bh], [0, y0 + bh * 1.01]].map(([x, y]) => [x * (view === 'back' ? 1.04 : 1), y]));
  for (const sg of [1, -1]) { const top = [sg * bw * .24, y0 + bh * .7], foot = [sg * bw * .27, h - legH * .2]; const leg = chaikin([...capsule(top, foot, legH * .3, legH * .32)], 1); d.shape(leg); all.push(...leg);
    if (view === 'front') d.seam(capsule(top, foot, legH * .16, legH * .18).slice(0, 11), false); }
  if (ear) for (const sg of [1, -1]) { const e = earShape(s.ears, ear, sg * hw * .36, hh * .14, sg * .45); d.shape(e.out); if (view === 'front') d.shape(e.inner, C.contrast, .02); all.push(...e.out); }
  if (s.wings) for (const sg of [1, -1]) all.push(...wingPart(d, C, [sg * bw * .2, y0 + bh * .2], h * .4, sg, view === 'front' ? shade(C.body, .8) : C.body));
  d.shape(body); all.push(...body);
  d.seam(chaikin([[0, y0 + bh * .02], [0, y0 + bh * .98]], 1, false));
  if (view === 'back') { const op = Math.max(2.5, h * .22), m = y0 + bh * .5; ladder(d, C, [0, m - op / 2], [0, m + op / 2]); lawLabel(d, edgeAt(body, y0 + bh * .72, -1) + .05, y0 + bh * .72, -1); }
  for (const sg of [1, -1]) { const a = [sg * bw * .38, y0 + bh * .1], b = [sg * (bw * .4 + armL * .3), y0 + armL * .84], arm = capsule(a, b, armL * .21, armL * .23); d.shape(arm); all.push(...arm);
    d.seam(capsule(a, b, armL * .12, armL * .14).slice(0, 11), false); }
  d.shape(head); all.push(...head);
  if (s.horn && s.horn !== 'none') { if (s.horn === 'one') all.push(...hornPart(d, C, 'one', [0, hh * .04], hh * .5)); else for (const sg of [1, -1]) all.push(...hornPart(d, C, s.horn, [sg * hw * .2, hh * .05], hh * .42, sg * (s.horn === 'antlers' ? .5 : .35))); }
  if (view === 'front') {
    // the gusset's two seams from the nose up over the crown, the muzzle, the face
    for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .06, hh * .56], [sg * hw * .16, hh * .32], [sg * hw * .2, hh * .12], [sg * hw * .17, hh * .015]], 2, false));
    if (mzk) { const mk = Math.sqrt(mzk), mz = ellipse(0, hh * .68 + hh * .02 * (mzk - 1), hw * .21 * mk, hh * .15 * mk); d.drop(mz, .03, .06, .12); d.shape(mz, C.contrast, .025); d.seam(ellipse(0, hh * .68 + hh * .02 * (mzk - 1), hw * .17 * mk, hh * .11 * mk), true); }
    eyes(d, C, s.eyes, [[-hh * .15, hh * .5], [hh * .15, hh * .5]], hh * .045);
    noseMouth(d, C, 0, hh * .6, hw * .12);
  } else {
    // from the back: the gusset running down to the nape
    for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .17, hh * .02], [sg * hw * .2, hh * .4], [sg * hw * .12, hh * .9]], 2, false));
  }
  return { svg: d.svg(), pts: all };
}
// ---- the bean and the bunny ----
function bean(pat, C, view) {
  const s = pat.spec, h = s.height, w = h * .7, d = painter(pat, C), all = [], ears = s.ears !== 'none', ew = h * (s.ears === 'long' ? .13 : .2);
  if (view === 'side') {
    const dep = w * .62, body = chaikin([[0, h * .02], [dep * .32, h * .06], [dep * .5, h * .4], [dep * .52, h * .84], [dep * .36, h], [-dep * .4, h], [-dep * .56, h * .84], [-dep * .54, h * .4], [-dep * .34, h * .06]], 3);
    if (ears) { const e = earShape(s.ears, ew * .45, 0, h * .06, -.08); d.shape(e.out); all.push(...e.out); }
    d.shape(body); all.push(...body); d.seam(chaikin([[0, h * .03], [dep * .06, h * .5], [0, h * .97]], 2, false)); d.seam(chaikin([[-dep * .4, h * .97], [dep * .36, h * .97]], 1, false));
    if (s.wings) all.push(...wingPart(d, C, [dep * .1, h * .5], h * .42, 1));
    if (s.horn && s.horn !== 'none') all.push(...hornPart(d, C, s.horn, [-dep * .12, h * .04], h * (s.horn === 'one' ? .22 : .18), s.horn === 'one' ? -.2 : .3));
    eyes(d, C, s.eyes, [[-dep * .4, h * .38]], h * .02); d.fill(ellipse(-dep * .5, h * .45, h * .02, h * .015), C.features);
    if (s.arms) { const a = ellipse(-dep * .2, h * .56, h * .05, h * .08, 28, -.5); d.shape(a); all.push(...a); }
    if (s.tail) { const t = ellipse(dep * .56, h * .78, h * .07, h * .07, 24); d.shape(t, C.contrast); all.push(...t); }
    return { svg: d.svg(), pts: all };
  }
  const body = sym([[0, 0], [w * .34, h * .04], [w * .5, h * .4], [w * .46, h * .86], [w * .2, h], [0, h]]);
  if (ears) for (const sg of [1, -1]) { const e = earShape(s.ears, ew, sg * w * .22, h * .05, sg * (s.ears === 'long' ? .1 : .25)); d.shape(e.out); if (view === 'front') d.shape(e.inner, C.contrast, .02); all.push(...e.out); }
  if (s.wings) for (const sg of [1, -1]) all.push(...wingPart(d, C, [sg * w * .3, h * .52], h * .42, sg, view === 'front' ? shade(C.body, .8) : C.body));
  if (s.arms) for (const sg of [1, -1]) { const a = capsule([sg * w * .44, h * .5], [sg * w * .56, h * .62], h * .05, h * .055); d.shape(a); all.push(...a); }
  d.shape(body); all.push(...body);
  if (s.horn && s.horn !== 'none') { if (s.horn === 'one') all.push(...hornPart(d, C, 'one', [0, h * .03], h * .22)); else for (const sg of [1, -1]) all.push(...hornPart(d, C, s.horn, [sg * w * .14, h * .04], h * .18, sg * (s.horn === 'antlers' ? .5 : .35))); }
  d.seam(chaikin([[-w * .32, h * .96], [0, h * .985], [w * .32, h * .96]], 2, false)); // the base's seam, just showing at the bottom
  if (view === 'front') {
    eyes(d, C, s.eyes, [[-w * .14, h * .38], [w * .14, h * .38]], h * .025);
    d.fill(ellipse(0, h * .45, h * .028, h * .02), C.features); d.line(chaikin([[-h * .045, h * .48], [-h * .02, h * .5], [0, h * .475], [h * .02, h * .5], [h * .045, h * .48]], 1, false), h * .008);
    for (const sg of [1, -1]) d.fill(ellipse(sg * w * .26, h * .47, h * .045, h * .028), C.blush, .7);
  } else {
    const op = Math.max(2.5, h * .22); d.seam(chaikin([[0, h * .02], [0, h * .98]], 1, false)); ladder(d, C, [0, h * .55 - op / 2], [0, h * .55 + op / 2]);
    if (s.tail) { const t = ellipse(0, h * .78, h * .07, h * .07, 24); d.shape(t, C.contrast); }
    lawLabel(d, edgeAt(body, h * .7, -1) + .05, h * .7, -1);
  }
  return { svg: d.svg(), pts: all };
}
// ---- the pillow character ----
function pillow(pat, C, view) {
  const s = pat.spec, h = s.height, w = h * .82, d = painter(pat, C), all = [], ears = s.ears !== 'none', ew = h * .22;
  if (view === 'side') {
    // the side gusset sets its depth; filled, it is thickest in the middle
    const dep = s.depth, bulge = Math.min(h * .12, dep * .5), side = chaikin([[0, 0], [dep / 2 + bulge * .3, h * .04], [dep / 2 + bulge, h * .5], [dep / 2 + bulge * .3, h * .96], [0, h], [-dep / 2 - bulge * .3, h * .96], [-dep / 2 - bulge, h * .5], [-dep / 2 - bulge * .3, h * .04]], 3);
    if (ears) { const e = earShape(s.ears, ew * .4, 0, h * .03, 0); d.shape(e.out); all.push(...e.out); }
    d.shape(side); all.push(...side); for (const sg of [1, -1]) d.seam(chaikin([[sg * dep / 2, h * .02], [sg * (dep / 2 + bulge * .55), h * .5], [sg * dep / 2, h * .98]], 2, false));
    return { svg: d.svg(), pts: all };
  }
  const front = sym([[0, 0], [w * .45, h * .05], [w * .5, h * .55], [w * .3, h], [0, h]]);
  if (ears) for (const sg of [1, -1]) { const e = earShape(s.ears, ew, sg * w * .3, h * .07, sg * .18); d.shape(e.out); if (view === 'front') d.shape(e.inner, C.contrast, .02); all.push(...e.out); }
  d.shape(front); all.push(...front); d.seam(front.map(([x, y]) => [x * .97, h * .015 + y * .97]), true);
  if (view === 'front') { eyes(d, C, s.eyes, [[-w * .15, h * .42], [w * .15, h * .42]], h * .025); d.line(chaikin([[-h * .06, h * .5], [0, h * .54], [h * .06, h * .5]], 2, false), h * .01); for (const sg of [1, -1]) d.fill(ellipse(sg * w * .27, h * .5, h * .045, h * .028), C.blush, .7); }
  else { const op = Math.max(3, h * .25); ladder(d, C, [-op / 2, h * .985], [op / 2, h * .985]); lawLabel(d, edgeAt(front, h * .7, 1) - .05, h * .7, 1); }
  return { svg: d.svg(), pts: all };
}

// ---- the elephant, sitting ----
function elephant(pat, C, view) {
  const s = pat.spec, h = s.height, hh = h * .46, hw = hh, tr = h * .34, bh = h * .58, bw = h * .62, y0 = hh * .74, d = painter(pat, C), all = [], big = s.ears !== 'none';
  // a big ear as it hangs from the side of the head: a fan, its lining in contrast inside the rim
  const earOut = (sg, k = 1) => chaikin([[sg * hw * .32, hh * .14], [sg * hw * (.62 + .16 * k), -hh * .04], [sg * hw * (.98 + .12 * k), hh * .18], [sg * hw * (1.06 + .1 * k), hh * .56], [sg * hw * (.9 + .06 * k), hh * .9], [sg * hw * .58, hh * .98], [sg * hw * .36, hh * .74]], 3);
  const earIn = sg => earOut(sg).map(([x, y]) => [sg * hw * .36 + (x - sg * hw * .36) * .84, hh * .5 + (y - hh * .5) * .84]);
  if (view === 'side') {
    // from its left, facing left, sitting. Drawn on a unit of its height (the crown at 0, the ground at 1) so it keeps its proportions at any
    // size. The head and trunk are one outline, as they are cut (the head side runs on into the trunk): the domed crown, the brow over the eye,
    // the trunk dropping from the face, tapering, its tip curled out and showing its end. The big ear hangs off the side of the head behind
    // the eye, its fold and rim stitched. The body is a pear, sat back on a round haunch; the hind leg lies forward along the ground with its
    // sole pad facing out; the front leg is a column standing on its sole, two toenails at the front of each foot. What is on the far side
    // (an ear, a front leg, a hind foot) is a tone deeper, behind.
    const U = ([x, y]) => [x * h, y * h], Us = pts => pts.map(U), far = shade(C.body, .8), farPad = shade(C.contrast, .82), nail = '#efe6d2';
    const smooth = (pts, n = 3) => chaikin(Us(pts), n), open = (pts, n = 2) => chaikin(Us(pts), n, false);
    // the trunk: a centreline from the face to the tip, a width tapering along it, its two edges either side
    // its centreline: out of the face below the eye, sweeping out in front of the face, down, and curling back in to rest by the front leg
    const cl = chaikin([[.205, .24], [.13, .29], [.06, .36], [.015, .45], [-.005, .55], [.005, .64], [.04, .71], [.09, .745], [.14, .74], [.172, .712]], 3, false);
    const wAt = t => .16 * (1 - t) ** 1.2 + .068 * t + .012 * Math.max(0, t - .9) / .1, edge = sg => cl.map((p, i) => { const q = cl[Math.min(i + 1, cl.length - 1)], o = cl[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = wAt(i / (cl.length - 1)) / 2; return [p[0] + sg * dy / l * w, p[1] - sg * dx / l * w]; });
    const front = edge(-1), back = edge(1), tip = cl[cl.length - 1];
    // the head and trunk in one: from under the jaw, round the back of the head, over the crown and brow, down the front of the trunk, round
    // its tip and back up its underside to the jaw
    // the end of the trunk: its centre, which way it points, and a round cap across it
    const [p1, p0] = [cl[cl.length - 1], cl[cl.length - 2]], dl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, dir = [(p1[0] - p0[0]) / dl, (p1[1] - p0[1]) / dl], wTip = wAt(1) / 2;
    const cap = [[tip[0] + dir[0] * wTip * .5, tip[1] + dir[1] * wTip * .5]];
    const headTrunk = chaikin(Us([[.36, .405], [.44, .41], [.53, .33], [.57, .2], [.5, .07], [.37, .005], [.24, .03], [.185, .085],
      ...front.slice(2), ...cap, ...back.slice().reverse().filter(([x, y]) => !(y < .33 && x > .2)), [.255, .335], [.29, .37], [.325, .392]]), 3);
    const body = smooth([[.36, .4], [.52, .35], [.7, .42], [.83, .56], [.88, .74], [.83, .9], [.68, .985], [.46, .995], [.33, .93], [.265, .8], [.25, .62], [.29, .47]]);
    // the front leg comes down out of the shoulder, under the head: its top is inside the body, its front edge carries on the chest's line
    const legFront = dx => smooth([[.27 + dx, .44], [.4 + dx, .44], [.405 + dx, .62], [.39 + dx, .8], [.4 + dx, .965], [.385 + dx, .995], [.31 + dx, 1.0], [.235 + dx, .995], [.22 + dx, .965], [.232 + dx, .78], [.26 + dx, .64], [.275 + dx, .56]], 2);
    const sole = dx => smooth([[.226 + dx, .985], [.31 + dx, .978], [.395 + dx, .985], [.31 + dx, 1.004]], 2);
    const toes = dx => [[.246 + dx, .962], [.286 + dx, .968]].map(([x, y]) => smooth([[x - .015, y + .02], [x - .012, y + .004], [x, y - .004], [x + .012, y + .004], [x + .015, y + .02]], 2));
    const haunch = ellipse(.66 * h, .76 * h, .2 * h, .215 * h, 48, -.15);
    const hindLeg = dy => smooth([[.72, .84 + dy], [.6, .82 + dy], [.47, .83 + dy], [.415, .86 + dy], [.405, .93 + dy], [.43, .99 + dy], [.55, .998 + dy], [.7, .995 + dy]], 2);
    const pad = (dx, dy) => ellipse((.415 + dx) * h, (.912 + dy) * h, .028 * h, .072 * h, 32, .06);
    const ear = smooth([[.37, .11], [.47, .07], [.57, .11], [.625, .23], [.615, .37], [.55, .46], [.46, .47], [.4, .42], [.375, .32], [.36, .2]]);
    // far side first
    if (big) { const fe = ear.map(([x, y]) => [x + .025 * h, y - .035 * h]); d.shape(fe, far); all.push(...fe); }
    { const fl = legFront(.09); d.shape(fl, far); d.fill(sole(.09), farPad); all.push(...fl); }
    d.shape(pad(-.035, -.025), far); d.fill(pad(-.035, -.025).map(([x, y]) => [x - .004 * h, y]), farPad);
    if (s.tail) { const t = capsule([.86 * h, .72 * h], [.95 * h, .9 * h], h * .016, h * .012); d.shape(t, C.body, .03, true); for (let k = -2; k <= 2; k++) d.line([[.95 * h, .9 * h], [(.95 + k * .012) * h, .965 * h]], h * .012, C.contrast); all.push(...t); }
    d.shape(body);
    d.drop(haunch, .08, .1, .14); d.shape(haunch); d.seam(ellipse(.66 * h, .76 * h, .155 * h, .17 * h, 48, -.15).slice(30, 48), false);
    const hl = hindLeg(0); d.drop(hl, .05, .05, .12); d.shape(hl); d.shape(pad(0, 0), C.contrast, .025); d.seam(ellipse(.415 * h, .912 * h, .02 * h, .058 * h, 32, .06), true);
    // the near front leg: its cloth and volume fading in below the shoulder (so it grows out of the body, no line across the top), then
    // its outline down the front, round the sole and up the back
    const fl = legFront(0), legEdge = fl.filter(([x, y]) => y > (x < .31 * h ? .66 : .86) * h), lp = painter(pat, { ...C, line: 'none' }); lp.drop(fl, .1, .02, .12); lp.shape(fl, C.body, 0);
    d.raw(`<linearGradient id="lf-${C.uid}" gradientUnits="userSpaceOnUse" x1="0" y1="${r3(.5 * h)}" x2="0" y2="${r3(.63 * h)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="lm-${C.uid}" maskUnits="userSpaceOnUse" x="-999" y="-999" width="9999" height="9999"><rect x="-999" y="-999" width="9999" height="9999" fill="url(#lf-${C.uid})"/></mask><g mask="url(#lm-${C.uid})">${lp.svg()}</g>`);
    d.raw(`<path d="${L_(legEdge)}" fill="none" stroke="${C.line}" stroke-width=".03" stroke-linejoin="round" stroke-linecap="round"/>`);
    d.fill(sole(0), C.contrast); for (const t of toes(0)) d.shape(t, nail, .015);
    d.drop(headTrunk, .08, .2, .2); d.shape(headTrunk);
    // the trunk is a stuffed tube, not a flat strip: lit along its outer side, turning into shadow along its inner side and where it curls
    // under, each band kept inside the outline
    { const band = (f1, f2) => Us([...edge(1).map((_, i) => { const p = cl[i], q = cl[Math.min(i + 1, cl.length - 1)], o = cl[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = wAt(i / (cl.length - 1)) / 2; return [p[0] + f1 * dy / l * w, p[1] - f1 * dx / l * w]; }),
        ...edge(1).map((_, i) => { const p = cl[i], q = cl[Math.min(i + 1, cl.length - 1)], o = cl[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = wAt(i / (cl.length - 1)) / 2; return [p[0] + f2 * dy / l * w, p[1] - f2 * dx / l * w]; }).reverse()].slice(6));
      d.raw(`<clipPath id="tc-${C.uid}"><path d="${P(headTrunk)}"/></clipPath><g clip-path="url(#tc-${C.uid})"><path d="${P(band(-.85, -.3))}" fill="#fff" opacity="${C.tex?.body === 'pebble' ? .26 : .2}" filter="url(#soft-${C.uid})"/><path d="${P(band(.35, 1.2))}" fill="#1d1712" opacity=".2" filter="url(#soft-${C.uid})"/></g>`);
    }
    // the trunk's tip: its end, in contrast, and the rings stitched across it
    { const ang = Math.atan2(dir[1], dir[0]) + Math.PI / 2, ex = (tip[0] + dir[0] * wTip * .12) * h, ey = (tip[1] + dir[1] * wTip * .12) * h; d.shape(ellipse(ex, ey, wTip * 1.02 * h, wTip * .45 * h, 28, ang), C.contrast, .025);
      for (const sg of [-1, 1]) d.fill(ellipse(ex + Math.cos(ang) * sg * wTip * .32 * h, ey + Math.sin(ang) * sg * wTip * .32 * h, wTip * .16 * h, wTip * .11 * h, 12, ang), shade(C.contrast, .55)); }
    for (let k = 2; k <= 6; k++) { const t = k / 15, i = Math.round(t * (cl.length - 1)), a = front[i], c = back[i]; d.line([[(a[0] + (c[0] - a[0]) * .2) * h, (a[1] + (c[1] - a[1]) * .2) * h], [(a[0] + (c[0] - a[0]) * .8) * h, (a[1] + (c[1] - a[1]) * .8) * h]], h * .004, C.stitch); }
    // the gusset seam over the crown, the brow, the eye, the smile under the trunk
    d.seam(open([[.165, .14], [.25, .04], [.4, .01], [.52, .1]]), false);
    d.line(open([[.24, .158], [.27, .146], [.3, .156]], 1), h * .004, shade(C.body, .7));
    eyes(d, C, s.eyes, [U([.265, .2])], h * .018);
    d.line(open([[.268, .336], [.292, .356], [.322, .362], [.345, .352]], 2), h * .005, shade(C.body, .55));
    if (big) { d.drop(ear, .14, .12, .22); d.shape(ear); d.seam(ear.map(([x, y]) => [.49 * h + (x - .49 * h) * .88, .29 * h + (y - .29 * h) * .88]), true);
      // its fold, where it is pleated into the head seam
      d.line(open([[.39, .16], [.41, .28], [.4, .4]]), h * .005, shade(C.body, .66)); all.push(...ear); }
    all.push(...headTrunk, ...body, ...fl, ...haunch, ...hl);
    return { svg: d.svg(), pts: all };
  }
  // front and back: the ears either side of the head, the body below, the front legs straight down, the hind feet out in front showing their pads
  const head = sym([[0, -hh * .02], [hw * .3, hh * .03], [hw * .46, hh * .26], [hw * .46, hh * .56], [hw * .34, hh * .82], [hw * .16, hh * .94], [0, hh * .96]]);
  const body = sym([[0, y0], [bw * .34, y0 + bh * .05], [bw * .5, y0 + bh * .42], [bw * .52, y0 + bh * .84], [bw * .34, h], [0, h]]);
  if (big) for (const sg of [1, -1]) { const o = earOut(sg); d.shape(o); all.push(...o); if (view === 'front') { d.shape(earIn(sg), C.contrast, .02); d.seam(earIn(sg).map(([x, y]) => [sg * hw * .36 + (x - sg * hw * .36) * .94, hh * .5 + (y - hh * .5) * .94]), true); } else d.seam(o.map(([x, y]) => [sg * hw * .36 + (x - sg * hw * .36) * .9, hh * .5 + (y - hh * .5) * .9]), true); }
  d.shape(body); all.push(...body);
  if (view === 'front') {
    for (const sg of [1, -1]) { const foot = ellipse(sg * bw * .4, h - h * .075, h * .1, h * .075); d.shape(foot); d.fill(ellipse(sg * bw * .4, h - h * .075, h * .075, h * .055), C.contrast); all.push(...foot); }
    // the front legs come down out of the chest, as in the side view: their cloth fades in below the shoulder, no line across their tops;
    // each stands on its sole, three toenails at the front
    d.raw(`<linearGradient id="lff-${C.uid}" gradientUnits="userSpaceOnUse" x1="0" y1="${r3(.52 * h)}" x2="0" y2="${r3(.64 * h)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="lmf-${C.uid}" maskUnits="userSpaceOnUse" x="-999" y="-999" width="9999" height="9999"><rect x="-999" y="-999" width="9999" height="9999" fill="url(#lff-${C.uid})"/></mask>`);
    for (const sg of [1, -1]) {
      const c = sg * h * .1, w = h * .165, leg = chaikin([[c - w * .56, h * .46], [c + w * .56, h * .46], [c + w * .5, h * .62], [c + w * .47, h * .8], [c + w * .52, h * .965], [c + w * .44, h], [c - w * .44, h], [c - w * .52, h * .965], [c - w * .47, h * .8], [c - w * .5, h * .62]], 2);
      const lp = painter(pat, { ...C, line: 'none' }); lp.drop(leg, sg * .06, .02, .12); lp.shape(leg, C.body, 0); d.raw(`<g mask="url(#lmf-${C.uid})">${lp.svg()}</g>`);
      d.raw(`<path d="${L_(leg.filter(([, y]) => y > h * .66))}" fill="none" stroke="${C.line}" stroke-width=".03" stroke-linejoin="round"/>`);
      d.fill(ellipse(c, h - h * .008, w * .46, h * .018), C.contrast);
      for (const k of [-1, 0, 1]) d.shape(chaikin([[c + k * w * .24 - h * .016, h * .99], [c + k * w * .24 - h * .012, h * .97], [c + k * w * .24, h * .962], [c + k * w * .24 + h * .012, h * .97], [c + k * w * .24 + h * .016, h * .99]], 2), '#efe6d2', .015);
      all.push(...leg); }
  } else {
    const op = Math.max(2.5, h * .2), m = y0 + bh * .42; d.seam(chaikin([[0, y0 + bh * .02], [0, h * .99]], 1, false)); ladder(d, C, [0, m - op / 2], [0, m + op / 2]); lawLabel(d, edgeAt(body, y0 + bh * .7, -1) + .05, y0 + bh * .7, -1);
    if (s.tail) { const t = capsule([0, y0 + bh * .7], [h * .03, y0 + bh * .9], h * .016, h * .014); d.shape(t); for (let k = -2; k <= 2; k++) d.line([[h * .03, y0 + bh * .9], [h * .03 + k * h * .012, y0 + bh * .9 + h * .06]], h * .012, C.contrast); }
  }
  d.shape(head); all.push(...head);
  if (view === 'front') {
    // the gusset's seams from the brow over the crown, the eyes either side of the trunk, the trunk hanging to the chest, its tip turned out
    for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .1, hh * .62], [sg * hw * .18, hh * .3], [sg * hw * .2, hh * .02]], 2, false));
    // the trunk, as in the side view: out from between the eyes towards us, down, and curling to one side to rest by the front leg, its
    // end and nostrils turned up; a stuffed tube, lit on one side and in shadow on the other; its root fades into the face
    const cl = chaikin([[0, .25], [0, .36], [-.006, .46], [-.025, .56], [-.065, .645], [-.12, .69], [-.175, .675], [-.205, .63], [-.21, .59]].map(([x, y]) => [x * h, y * h]), 3, false);
    const wT = t => h * (.13 * (1 - t) ** 1.1 + .062 * t), side = f => cl.map((p, i) => { const q = cl[Math.min(i + 1, cl.length - 1)], o = cl[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = wT(i / (cl.length - 1)) / 2; return [p[0] + f * dy / l * w, p[1] - f * dx / l * w]; });
    const tp = cl[cl.length - 1], tq = cl[cl.length - 2], tl = Math.hypot(tp[0] - tq[0], tp[1] - tq[1]) || 1, td = [(tp[0] - tq[0]) / tl, (tp[1] - tq[1]) / tl], tw = wT(1) / 2;
    const trunk = chaikin([...side(-1), [tp[0] + td[0] * tw * .5, tp[1] + td[1] * tw * .5], ...side(1).reverse()], 2);
    d.raw(`<linearGradient id="tf-${C.uid}" gradientUnits="userSpaceOnUse" x1="0" y1="${r3(.25 * h)}" x2="0" y2="${r3(.31 * h)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="tm-${C.uid}" maskUnits="userSpaceOnUse" x="-999" y="-999" width="9999" height="9999"><rect x="-999" y="-999" width="9999" height="9999" fill="url(#tf-${C.uid})"/></mask>`);
    const tpn = painter(pat, C); tpn.drop(trunk, .06, .1, .16); tpn.shape(trunk);
    tpn.raw(`<clipPath id="tcf-${C.uid}"><path d="${P(trunk)}"/></clipPath><g clip-path="url(#tcf-${C.uid})"><path d="${P([...side(-.9), ...side(-.3).reverse()])}" fill="#fff" opacity=".2" filter="url(#soft-${C.uid})"/><path d="${P([...side(.35), ...side(1.2).reverse()])}" fill="#1d1712" opacity=".2" filter="url(#soft-${C.uid})"/></g>`);
    for (let k = 2; k <= 6; k++) { const i = Math.round(k / 15 * (cl.length - 1)), a = side(-1)[i], c = side(1)[i]; tpn.line([[a[0] + (c[0] - a[0]) * .2, a[1] + (c[1] - a[1]) * .2], [a[0] + (c[0] - a[0]) * .8, a[1] + (c[1] - a[1]) * .8]], h * .004, C.stitch); }
    { const ang = Math.atan2(td[1], td[0]) + Math.PI / 2, ex = tp[0] + td[0] * tw * .12, ey = tp[1] + td[1] * tw * .12; tpn.shape(ellipse(ex, ey, tw * 1.02, tw * .45, 28, ang), C.contrast, .025);
      for (const sg of [-1, 1]) tpn.fill(ellipse(ex + Math.cos(ang) * sg * tw * .32, ey + Math.sin(ang) * sg * tw * .32, tw * .16, tw * .11, 12, ang), shade(C.contrast, .55)); }
    d.raw(`<g mask="url(#tm-${C.uid})">${tpn.svg()}</g>`); all.push(...trunk);
    // the smile either side of the trunk's root
    for (const sg of [1, -1]) d.line(chaikin([[sg * h * .072, h * .372], [sg * h * .095, h * .388], [sg * h * .125, h * .382]], 2, false), h * .005, shade(C.body, .55));
    eyes(d, C, s.eyes, [[-hw * .23, hh * .48], [hw * .23, hh * .48]], hh * .04);
  } else for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .2, hh * .02], [sg * hw * .22, hh * .4], [sg * hw * .14, hh * .9]], 2, false));
  return { svg: d.svg(), pts: all };
}

// ---- the kit: parts that go on any body (src/lab-pattern.js PLUSH_PARTS), and the body types drawn from them ----
// a stuffed tube along a line (a tail, an antler's beam, a horn's curl): drawn as its outline, then its cloth, so it reads as one rounded piece
function tubeLine(d, C, pts, w, fill = C.body) {
  const pth = L_(pts); d.raw(`<path d="${pth}" fill="none" stroke="${C.line}" stroke-width="${r3(w + .06)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${pth}" fill="none" stroke="${fill}" stroke-width="${r3(w)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${pth}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="${r3(w * .3)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${r3(-w * .12)} ${r3(-w * .12)})"/>`);
}
// an edge offset to either side of a centre line, its width along it given by wAt(t), t from 0 to 1
function sides(cl, wAt, f) { return cl.map((p, i) => { const q = cl[Math.min(i + 1, cl.length - 1)], o = cl[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = wAt(i / (cl.length - 1)) / 2; return [p[0] + f * dy / l * w, p[1] - f * dx / l * w]; }); }
// a part that grows out of the body: its cloth faded in from y0 to y1 (no line across where it joins), then the outline below y1
function grownPart(d, C, pat, pts, y0, y1, edgeFrom = y1, key = 'g') {
  const id = `${key}-${C.uid}-${++C.n}`, lp = painter(pat, { ...C, line: 'none' }); lp.drop(pts, .08, .03, .12); lp.shape(pts, C.body, 0);
  d.raw(`<linearGradient id="lg${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${r3(y0)}" x2="0" y2="${r3(y1)}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="m${id}" maskUnits="userSpaceOnUse" x="-999" y="-999" width="9999" height="9999"><rect x="-999" y="-999" width="9999" height="9999" fill="url(#lg${id})"/></mask><g mask="url(#m${id})">${lp.svg()}</g>`);
  d.raw(`<path d="${L_(pts.filter(([, y]) => y > edgeFrom))}" fill="none" stroke="${C.line}" stroke-width=".03" stroke-linejoin="round"/>`);
}
// a horn (a unicorn's, rolled and stuffed, a spiral stitched up it), a pair of horns, or antlers; at a base point, leaning by `lean` radians
// from upright (0), `k` its size
function hornPart(d, C, kind, [bx, by], k, lean = 0, tone = C.contrast) {
  const at = (u, v) => [bx + u * Math.cos(lean) - v * Math.sin(lean), by + u * Math.sin(lean) + v * Math.cos(lean)];
  if (kind === 'one') {
    const L = k * 1, W = k * .26, cone = chaikin([at(-W / 2, 0), at(-W * .32, -L * .5), at(0, -L), at(W * .32, -L * .5), at(W / 2, 0)], 2);
    d.shape(cone, tone, .025); for (let i = 1; i <= 4; i++) { const t = i / 5; d.line([at(-W / 2 * (1 - t), -L * t + L * .05), at(W / 2 * (1 - t) * .9, -L * t - L * .07)], k * .018, shade(tone, .72)); }
    return cone;
  }
  if (kind === 'two') { const c = chaikin([at(-k * .1, 0), at(-k * .12, -k * .3), at(k * .06, -k * .55), at(k * .02, -k * .3), at(k * .1, 0)], 2); d.shape(c, tone, .025); return c; }
  // antlers: a beam curving up and back with three tines, as stuffed tubes
  const beam = chaikin([at(0, 0), at(k * .06, -k * .3), at(k * .2, -k * .55), at(k * .38, -k * .7)], 2, false), w = k * .08;
  tubeLine(d, C, beam, w, tone); for (const [t, a, l] of [[.35, -1.1, .22], [.62, -.9, .2], [.85, -.6, .14]]) { const p = beam[Math.round(t * (beam.length - 1))]; tubeLine(d, C, [p, [p[0] + Math.cos(lean + a) * k * l * .3, p[1] + Math.sin(lean + a) * k * l * .3 - k * l * .5], [p[0] + Math.cos(lean + a) * k * l * .45, p[1] - k * l]], w * .8, tone); }
  return beam.map(([x, y]) => [x, y - k * .1]);
}
// a wing, folded against the back: its leading edge arched, its trailing edge in three rounded feathers, lined in contrast; `dir` 1 sweeps it
// to the right, -1 to the left
function wingPart(d, C, [bx, by], k, dir = 1, tone = C.body) {
  const P2 = (u, v) => [bx + dir * u * k, by + v * k];
  const w = chaikin([P2(0, 0), P2(.18, -.42), P2(.52, -.62), P2(.86, -.56), P2(.8, -.38), P2(.66, -.4), P2(.7, -.22), P2(.52, -.24), P2(.5, -.06), P2(.3, -.1), P2(.2, .1)], 2);
  d.shape(w, tone); for (const [a, b] of [[[.24, -.12], [.62, -.44]], [[.3, -.04], [.5, -.2]]]) d.seam(chaikin([P2(...a), P2((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - .06), P2(...b)], 2, false));
  return w;
}
// a mane round the face and down the neck: a ruff of long pile, its edge in tufts
function manePart(d, C, [cx, cy], rx, ry, tone) {
  const n = 64, pts = Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n, r = 1 + .1 * Math.abs(Math.sin(t * 7)); return [cx + Math.cos(t) * rx * r, cy + Math.sin(t) * ry * r]; });
  const m = chaikin(pts, 1); d.shape(m, tone); for (let i = 0; i < 14; i++) { const t = 2 * Math.PI * (i + .5) / 14; d.line([[cx + Math.cos(t) * rx * .78, cy + Math.sin(t) * ry * .78], [cx + Math.cos(t) * rx * .98, cy + Math.sin(t) * ry * .98]], .02, shade(tone, .8)); }
  return m;
}
// spikes along a line (a dinosaur's back, a ridge), each standing out to the line's left as it runs
function spikesAlong(d, C, line, k, n = 6, tone = C.contrast) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i + .5) / n, j = Math.round(t * (line.length - 1)), p = line[j], q = line[Math.min(j + 1, line.length - 1)], o = line[Math.max(j - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, s = k * (.7 + .5 * Math.sin(Math.PI * t));
    const tri = chaikin([[p[0] - ux * s * .45, p[1] - uy * s * .45], [p[0] + uy * s - ux * s * .1, p[1] - ux * s - uy * s * .1], [p[0] + ux * s * .45, p[1] + uy * s * .45]], 1); d.shape(tri, tone, .025); out.push(...tri);
  }
  return out;
}
// a crest of mane along a line (a horse's, down the back of the neck): tufts standing off the line to its right as it runs
function crestPart(d, C, line, k, tone) {
  const n = line.length, out = [], left = [], right = [];
  for (let i = 0; i < n; i++) { const p = line[i], q = line[Math.min(i + 1, n - 1)], o = line[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = k * (.6 + .4 * Math.abs(Math.sin(i * 1.7))); left.push([p[0] + dy / l * k * .25, p[1] - dx / l * k * .25]); right.push([p[0] - dy / l * w, p[1] + dx / l * w]); }
  const c = chaikin([...left, ...right.reverse()], 2); d.shape(c, tone); for (let i = 1; i < n - 1; i += 2) d.line([line[i], right[n - 1 - i]], .018, shade(tone, .8)); out.push(...c); return out;
}
// spikes seen end on, down a back seen from behind: each a narrow plate standing up from the seam
function spikesEdgeOn(d, C, [x0, y0], [x1, y1], k, n = 6, tone = C.contrast) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = (i + .5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, s = k * (.7 + .5 * Math.sin(Math.PI * t)), tri = chaikin([[x - s * .22, y + s * .2], [x, y - s * .8], [x + s * .22, y + s * .2]], 1); d.shape(tri, tone, .025); out.push(...tri); }
  return out;
}
// an ear on a four-legged head, seen from the side or the front: its outline and the inner ear in contrast; floppy ears hang
function quadEar(d, C, kind, [x, y], k, view, sg = 1, far = false) {
  const tone = far ? shade(C.body, .8) : C.body;
  if (kind === 'none') return [];
  if (kind === 'floppy') {
    const e = chaikin([[x - k * .12 * sg, y], [x + k * .1 * sg, y - k * .04], [x + k * .2 * sg, y + k * .3], [x + k * .14 * sg, y + k * .62], [x - k * .02 * sg, y + k * .66], [x - k * .1 * sg, y + k * .34]], 3);
    d.drop(e, .06 * sg, .08, .16); d.shape(e, tone); d.seam(e.map(([a, b]) => [x + (a - x) * .8, y + k * .05 + (b - y) * .8]), true); return e;
  }
  const ek = kind === 'big' ? 'round' : kind, w = k * (kind === 'big' ? .62 : kind === 'long' ? .2 : kind === 'round' ? .32 : .3), e = earShape(ek, w, x, y, view === 'side' ? -.15 : sg * (kind === 'long' ? .08 : .3));
  d.shape(e.out, tone); if (!far && view !== 'back') d.shape(e.inner, C.contrast, .02); return e.out;
}
// the tail of a four-legged body from its root, as the kit asks (src/lab-pattern.js PLUSH_TAILS); `dir` 1 sweeps it right, -1 left
function quadTail(d, C, kind, [x, y], h, dir = 1, view = 'side') {
  if (kind === 'short') { const t = ellipse(x + dir * h * .02, y, h * .045, h * .05, 24); d.shape(t); return t; }
  if (kind === 'bushy') {
    const t = chaikin([[x, y + h * .02], [x + dir * h * .07, y - h * .02], [x + dir * h * .16, y - h * .14], [x + dir * h * .18, y - h * .3], [x + dir * h * .1, y - h * .38], [x + dir * h * .04, y - h * .3], [x + dir * h * .06, y - h * .16], [x - dir * h * .01, y - h * .04]], 3);
    d.drop(t, .06 * dir, .06, .14); d.shape(t); const tip = chaikin([[x + dir * h * .16, y - h * .27], [x + dir * h * .18, y - h * .3], [x + dir * h * .1, y - h * .38], [x + dir * h * .05, y - h * .32], [x + dir * h * .1, y - h * .28]], 2); d.shape(tip, C.contrast, .02);
    for (let i = 1; i <= 3; i++) d.line(chaikin([[x + dir * h * (.04 + i * .025), y - h * (.04 + i * .06)], [x + dir * h * (.08 + i * .025), y - h * (.06 + i * .07)]], 1, false), h * .004, shade(C.body, .7));
    return t;
  }
  if (kind === 'hair') { const line = view === 'side' ? chaikin([[x, y], [x + dir * h * .07, y + h * .06], [x + dir * h * .09, y + h * .16], [x + dir * h * .07, y + h * .26]], 2, false) : chaikin([[x, y], [x + dir * h * .03, y + h * .1], [x + dir * h * .01, y + h * .2]], 2, false); return crestPart(d, C, line, h * .06, C.mane); }
  if (kind === 'tuft') { const cl = chaikin([[x, y], [x + dir * h * .06, y + h * .1], [x + dir * h * .09, y + h * .2]], 2, false); tubeLine(d, C, cl, h * .022); const e = cl[cl.length - 1]; for (let k = -2; k <= 2; k++) d.line([e, [e[0] + k * h * .012, e[1] + h * .06]], h * .012, C.contrast); return cl; }
  // long: up and over in an S, its tip curling
  const cl = view === 'side' ? chaikin([[x, y], [x + dir * h * .08, y - h * .02], [x + dir * h * .12, y - h * .14], [x + dir * h * .1, y - h * .26], [x + dir * h * .15, y - h * .33], [x + dir * h * .2, y - h * .3]], 3, false)
    : chaikin([[x, y], [x + dir * h * .05, y - h * .06], [x + dir * h * .12, y - h * .1], [x + dir * h * .16, y - h * .2]], 3, false);
  tubeLine(d, C, cl, h * .035); return cl;
}

// ---- four-legged, sitting: the body, legs and pads as the elephant's (it sits the same way), the head and its parts from the kit ----
function quad(pat, C, view) {
  const s = pat.spec, h = s.height, d = painter(pat, C), all = [], k = s.head, far = shade(C.body, .8), farPad = shade(C.contrast, .82), maneTone = C.mane;
  C.n = C.n || 0;
  if (view === 'side') {
    // from its left, facing left, on a unit of its height; the head scaled about the neck by its size
    const U = ([x, y]) => [x * h, y * h], Us = pts => pts.map(U), smooth = (pts, n = 3) => chaikin(Us(pts), n), open = (pts, n = 2) => chaikin(Us(pts), n, false);
    const hd = ([x, y]) => [.44 + (x - .44) * k, .4 + (y - .4) * k], Hs = pts => pts.map(hd);
    const face = { none: [[.17, .1], [.14, .2], [.16, .3], [.21, .36], [.27, .38]], short: [[.17, .08], [.135, .15], [.125, .2], [.1, .215], [.078, .24], [.074, .272], [.09, .305], [.14, .33], [.2, .37]], long: [[.17, .12], [.13, .17], [.06, .21], [-.01, .25], [-.03, .29], [-.01, .325], [.08, .345], [.2, .38]], broad: [[.17, .1], [.14, .16], [.08, .2], [.02, .23], [-.02, .27], [-.025, .33], [.0, .37], [.08, .385], [.2, .4]] }[s.snout];
    const head = chaikin(Us(Hs([[.36, .405], [.44, .41], [.53, .33], [.57, .2], [.5, .07], [.38, .01], [.25, .03], ...face, [.32, .4]])), 3);
    const body = smooth([[.36, .4], [.52, .35], [.7, .42], [.83, .56], [.88, .74], [.83, .9], [.68, .985], [.46, .995], [.33, .93], [.265, .8], [.25, .62], [.29, .47]]);
    const legFront = dx => smooth([[.27 + dx, .44], [.4 + dx, .44], [.405 + dx, .62], [.39 + dx, .8], [.4 + dx, .965], [.385 + dx, .995], [.31 + dx, 1.0], [.235 + dx, .995], [.22 + dx, .965], [.232 + dx, .78], [.26 + dx, .64], [.275 + dx, .56]], 2);
    const haunch = ellipse(.66 * h, .76 * h, .2 * h, .215 * h, 48, -.15);
    const hindLeg = dy => smooth([[.72, .84 + dy], [.6, .82 + dy], [.47, .83 + dy], [.415, .86 + dy], [.405, .93 + dy], [.43, .99 + dy], [.55, .998 + dy], [.7, .995 + dy]], 2);
    const pad = (dx, dy) => ellipse((.415 + dx) * h, (.912 + dy) * h, .028 * h, .068 * h, 32, .06);
    const earAt = U(hd([.43, .04])), earFar = U(hd([.37, .03]));
    // far side first, a tone deeper
    if (s.wings) all.push(...wingPart(d, C, U([.5, .42]), h * .42, 1, far));
    quadEar(d, C, s.ears, earFar, h * .3 * k, 'side', 1, true);
    { const fl = legFront(.09); d.shape(fl, far); d.fill(ellipse(.33 * h, .997 * h, .08 * h, .012 * h), farPad); all.push(...fl); }
    if (s.tail) all.push(...quadTail(d, C, s.tailType, U([.86, .72]), h, 1, 'side'));
    d.shape(body); all.push(...body);
    if (s.spikes) all.push(...spikesAlong(d, C, open([[.46, .36], [.62, .37], [.74, .45], [.83, .57], [.875, .7]]), h * .07, 6));
    d.drop(haunch, .08, .1, .14); d.shape(haunch); d.seam(ellipse(.66 * h, .76 * h, .155 * h, .17 * h, 48, -.15).slice(30, 48), false);
    const hl = hindLeg(0); d.drop(hl, .05, .05, .12); d.shape(hl); d.shape(pad(0, 0), C.contrast, .025);
    const fl = legFront(0); grownPart(d, C, pat, fl, .5 * h, .63 * h, .66 * h, 'fl'); d.fill(ellipse(.31 * h, .997 * h, .085 * h, .012 * h), C.contrast);
    for (const x of [.25, .285]) d.line(open([[x, .955], [x, .995]], 1), h * .004, shade(C.body, .62));
    if (s.mane === 'ruff') all.push(...manePart(d, C, U(hd([.44, .24])), .2 * h * k, .25 * h * k, maneTone));
    d.drop(head, .08, .2, .2); d.shape(head); all.push(...head, ...body, ...fl, ...haunch, ...hl);
    if (s.mane === 'crest') all.push(...crestPart(d, C, chaikin(Us(Hs([[.36, .02], [.47, .04], [.55, .12], [.585, .25], [.6, .4]])), 2, false), h * .05 * k, maneTone));
    d.seam(open(Hs([[.17, .1], [.27, .03], [.4, .01], [.52, .1]])), false);
    // the face: the eye, the brow, the nose at the tip of the snout and the mouth under it
    const eyeAt = U(hd(s.snout === 'long' ? [.24, .155] : [.25, .16])); eyes(d, C, s.eyes, [eyeAt], h * .017 * k);
    if (s.snout === 'broad') { d.shape(ellipse(...U(hd([.005, .3])), .022 * h * k, .014 * h * k, 20, .4), C.features, .02); d.line(open(Hs([[-.015, .345], [.04, .36], [.1, .36]])), h * .005, shade(C.body, .55)); }
    else if (s.snout !== 'none') { const tip = s.snout === 'long' ? [-.025, .265] : [.075, .245]; d.shape(ellipse(...U(hd(tip)), .028 * h * k, .022 * h * k, 20, .3), C.features, .02);
      d.line(open(Hs(s.snout === 'long' ? [[-.015, .3], [.05, .335], [.12, .34]] : [[.085, .29], [.11, .318], [.15, .32]])), h * .005, shade(C.body, .55)); }
    else d.line(open(Hs([[.18, .3], [.21, .32], [.24, .315]])), h * .005, shade(C.body, .55));
    all.push(...quadEar(d, C, s.ears, earAt, h * .3 * k, 'side'));
    if (s.horn !== 'none') all.push(...hornPart(d, C, s.horn, U(hd(s.horn === 'one' ? [.24, .05] : [.38, .03])), h * (s.horn === 'one' ? .2 : .18) * k, s.horn === 'one' ? -.35 : s.horn === 'two' ? .5 : .1));
    if (s.wings) all.push(...wingPart(d, C, U([.56, .45]), h * .44, 1));
    return { svg: d.svg(), pts: all };
  }
  // front and back: the head over the chest, the front legs out of it, the hind feet out either side showing their pads
  const hy = .21, hr = .2 * k, head = sym([[0, hy - hr], [hr * .62, hy - hr * .9], [hr * .98, hy - hr * .3], [hr, hy + hr * .2], [hr * .8, hy + hr * .7], [hr * .4, hy + hr * .98], [0, hy + hr]].map(([x, y]) => [x * h, y * h]));
  const body = sym([[0, .33], [.2, .36], [.3, .52], [.32, .8], [.24, 1], [0, 1]].map(([x, y]) => [x * h, y * h]));
  if (s.wings) for (const sg of [1, -1]) all.push(...wingPart(d, C, [sg * h * .12, h * .5], h * .42, sg, view === 'front' ? far : C.body));
  d.shape(body); all.push(...body);
  if (view === 'back' && s.tail) all.push(...quadTail(d, C, s.tailType, [h * .02, h * .9], h, 1, 'back'));
  if (view === 'front') {
    for (const sg of [1, -1]) { const foot = ellipse(sg * h * .25, h * .93, h * .085, h * .065); d.shape(foot); d.fill(ellipse(sg * h * .25, h * .93, h * .06, h * .046), C.contrast); all.push(...foot); }
    for (const sg of [1, -1]) { const c = sg * h * .095, w = h * .15, leg = chaikin([[c - w * .56, h * .46], [c + w * .56, h * .46], [c + w * .5, h * .62], [c + w * .47, h * .8], [c + w * .52, h * .965], [c + w * .44, h], [c - w * .44, h], [c - w * .52, h * .965], [c - w * .47, h * .8], [c - w * .5, h * .62]], 2);
      grownPart(d, C, pat, leg, .52 * h, .64 * h, .66 * h, 'lf'); d.fill(ellipse(c, h * .992, w * .44, h * .016), C.contrast); for (const kx of [-.15, .15]) d.line([[c + kx * w, h * .955], [c + kx * w, h * .995]], h * .004, shade(C.body, .62)); all.push(...leg); }
  } else {
    if (s.spikes) all.push(...spikesEdgeOn(d, C, [0, h * .38], [0, h * .9], h * .06, 6));
    const op = Math.max(2.5, h * .2), m = h * .62; d.seam(chaikin([[0, h * .36], [0, h * .99]], 1, false)); ladder(d, C, [0, m - op / 2], [0, m + op / 2]); lawLabel(d, edgeAt(body, h * .72, -1) + .05, h * .72, -1);
  }
  if (s.mane === 'ruff') all.push(...manePart(d, C, [0, (hy + .02) * h], hr * 1.42 * h, hr * 1.35 * h, maneTone));
  if (s.ears !== 'floppy') for (const sg of [1, -1]) all.push(...quadEar(d, C, s.ears, [sg * hr * .62 * h, (hy - hr * .78) * h], h * .3 * k, view, sg));
  d.drop(head, .06, .16, .18); d.shape(head); all.push(...head);
  if (s.ears === 'floppy') for (const sg of [1, -1]) all.push(...quadEar(d, C, 'floppy', [sg * hr * .9 * h, (hy - hr * .62) * h], h * .3 * k, view, sg));
  if (s.mane === 'crest' && view === 'back') all.push(...crestPart(d, C, chaikin([[-h * .01, (hy - hr * .95) * h], [h * .01, (hy + hr * .2) * h], [0, (hy + hr * 1.25) * h]], 2, false), h * .045 * k, maneTone));
  if (s.mane === 'crest' && view === 'front') all.push(...manePart(d, C, [0, (hy - hr * .82) * h], hr * .32 * h, hr * .2 * h, maneTone));
  if (s.horn !== 'none') { if (s.horn === 'one') all.push(...hornPart(d, C, 'one', [0, (hy - hr * .82) * h], h * .2 * k)); else for (const sg of [1, -1]) all.push(...hornPart(d, C, s.horn, [sg * hr * .35 * h, (hy - hr * .9) * h], h * .18 * k, sg * (s.horn === 'antlers' ? .5 : .35))); }
  if (view === 'front') {
    for (const sg of [1, -1]) d.seam(chaikin([[sg * hr * .2 * h, (hy - hr * .98) * h], [sg * hr * .26 * h, (hy - hr * .3) * h], [sg * hr * .16 * h, (hy + hr * .2) * h]], 2, false));
    eyes(d, C, s.eyes, [[-hr * .42 * h, (hy - hr * .05) * h], [hr * .42 * h, (hy - hr * .05) * h]], h * .017 * k);
    if (s.snout !== 'none') { const lg = s.snout !== 'short', mw = hr * (s.snout === 'broad' ? .56 : s.snout === 'long' ? .4 : .42) * h, mh = hr * (lg ? .5 : .3) * h, my = (hy + hr * (lg ? .48 : .45)) * h;
      // a long snout seen end on narrows to the nose (a fox's, a dog's); a broad one stays wide (a horse's); a short one is a small round muzzle
      const mz = s.snout === 'long' ? chaikin([[-mw, my - mh * .7], [mw, my - mh * .7], [mw * .55, my + mh * .5], [0, my + mh * .9], [-mw * .55, my + mh * .5]], 3) : ellipse(0, my, mw, mh, 40);
      d.drop(mz, .03, .06, .12); d.shape(mz, shade(C.body, 1.05), .025); d.shape(ellipse(0, my - mh * .5, mw * .32, mh * .26, 20), C.features, .02); d.line(chaikin([[0, my - mh * .25], [0, my + mh * .2]], 1, false), h * .005, shade(C.body, .5));
      d.line(chaikin([[-mw * .5, my + mh * .25], [-mw * .2, my + mh * .45], [0, my + mh * .2], [mw * .2, my + mh * .45], [mw * .5, my + mh * .25]], 2, false), h * .005, shade(C.body, .5)); }
    else { d.fill(ellipse(0, (hy + hr * .35) * h, h * .018, h * .013), C.features); d.line(chaikin([[-h * .03, (hy + hr * .5) * h], [0, (hy + hr * .58) * h], [h * .03, (hy + hr * .5) * h]], 2, false), h * .005, shade(C.body, .5)); }
  } else for (const sg of [1, -1]) d.seam(chaikin([[sg * hr * .2 * h, (hy - hr * .98) * h], [sg * hr * .24 * h, (hy + hr * .3) * h], [sg * hr * .14 * h, (hy + hr * .95) * h]], 2, false));
  return { svg: d.svg(), pts: all };
}

// ---- a sea creature, its size its length: a body in two sides and a pale belly, fins either side, a dorsal fin, a fluke or a tail fin ----
function sea(pat, C, view) {
  const s = pat.spec, L = s.height, d = painter(pat, C), all = [], far = shade(C.body, .8), belly = C.contrast, k = s.head;
  C.n = C.n || 0;
  if (view === 'side') {
    // from its left, facing left; the body on a unit of its length, the head (the front third) scaled by its size
    const U = ([x, y]) => [x * L, y * L], Us = pts => pts.map(U), open = (pts, n = 2) => chaikin(Us(pts), n, false);
    const hz = ([x, y]) => x < .35 ? [.35 - (.35 - x) * k, .21 + (y - .21) * k] : [x, y];
    const bodyPts = Us([[0, .22], [.04, .12], [.14, .05], [.4, .0], [.62, .04], [.78, .12], [.88, .18], [.92, .2], [.88, .225], [.78, .27], [.62, .35], [.4, .41], [.18, .4], [.06, .33]].map(hz)), body = chaikin(bodyPts, 3);
    const tailAt = U([.9, .2]);
    if (s.tail) { const t = s.tailType === 'fin' ? chaikin([[tailAt[0] - L * .02, tailAt[1]], [tailAt[0] + L * .07, tailAt[1] - L * .16], [tailAt[0] + L * .11, tailAt[1] - L * .17], [tailAt[0] + L * .06, tailAt[1]], [tailAt[0] + L * .1, tailAt[1] + L * .14], [tailAt[0] + L * .07, tailAt[1] + L * .15]], 2)
        : chaikin([[tailAt[0] - L * .02, tailAt[1] - L * .015], [tailAt[0] + L * .1, tailAt[1] - L * .045], [tailAt[0] + L * .14, tailAt[1] - L * .035], [tailAt[0] + L * .09, tailAt[1]], [tailAt[0] + L * .14, tailAt[1] + L * .035], [tailAt[0] + L * .1, tailAt[1] + L * .045], [tailAt[0] - L * .02, tailAt[1] + L * .015]], 2);
      d.shape(t); all.push(...t); }
    if (s.dorsal) { const df = chaikin(Us([[.44, .02], [.52, -.1], [.56, -.11], [.57, .02]]), 2); d.shape(df); all.push(...df); }
    { const ff = chaikin(Us([[.22, .26], [.31, .33], [.34, .355], [.26, .32]].map(([x, y]) => [x + .04, y - .02])), 2); d.shape(ff, far); }
    d.drop(body, .06, .12, .14); d.shape(body); all.push(...body);
    // the pale belly, from under the chin to the tail stock, kept inside the outline
    d.raw(`<clipPath id="sb-${C.uid}"><path d="${P(body)}"/></clipPath><g clip-path="url(#sb-${C.uid})"><path d="${P(chaikin(Us([[-.05, .28], [.2, .3], [.5, .29], [.8, .22], [.95, .21], [.95, .5], [-.05, .5]].map(hz)), 2))}" fill="${belly}"/><path d="${L_(chaikin(Us([[-.05, .28], [.2, .3], [.5, .29], [.8, .22], [.95, .21]].map(hz)), 2, false))}" fill="none" stroke="${C.stitch}" stroke-width=".018" stroke-dasharray=".08 .06"/></g><path d="${P(body)}" fill="none" stroke="${C.line}" stroke-width=".03"/>`);
    if (s.spikes) all.push(...spikesAlong(d, C, open([[.2, .045], [.4, .005], [.62, .045], [.8, .135]]), L * .045, 6));
    const fin = chaikin(Us([[.22, .27], [.31, .34], [.34, .365], [.26, .33]]), 2); d.drop(fin, .04, .05, .14); d.shape(fin); all.push(...fin);
    eyes(d, C, s.eyes, [U(hz([.13, .17]))], L * .016 * k); d.line(open([[.02, .25], [.08, .275], [.15, .27]].map(hz)), L * .005, shade(C.body, .5));
    return { svg: d.svg(), pts: all };
  }
  // front and back: the round of its body, the belly paler below, fins out either side, the dorsal fin on top; from the back, its tail
  const W = L * .36, H = L * .42 * (k > 1 ? 1 + (k - 1) * .5 : 1), body = chaikin(ellipse(0, H / 2, W / 2, H / 2, 48), 1);
  if (s.dorsal) { const df = chaikin([[-W * .06, H * .06], [-W * .02, -H * .24], [W * .04, -H * .26], [W * .08, H * .06]], 2); d.shape(df); all.push(...df); }
  for (const sg of [1, -1]) { const f = chaikin([[sg * W * .4, H * .62], [sg * W * .72, H * .8], [sg * W * .76, H * .86], [sg * W * .46, H * .78]], 2); d.shape(f); all.push(...f); }
  const backTail = () => { if (view !== 'back' || !s.tail) return; const t = s.tailType === 'fin' ? chaikin([[0, H * .5], [-W * .04, H * .02], [W * .04, H * .02], [W * .02, H * .5], [W * .04, H * .98], [-W * .04, H * .98]], 2) : chaikin([[0, H * .48], [-W * .7, H * .32], [-W * .78, H * .4], [-W * .1, H * .6], [W * .1, H * .6], [W * .78, H * .4], [W * .7, H * .32]], 2); d.drop(t, .04, .08, .16); d.shape(t); all.push(...t); };
  d.shape(body); all.push(...body);
  d.raw(`<clipPath id="sbf-${C.uid}"><path d="${P(body)}"/></clipPath><g clip-path="url(#sbf-${C.uid})"><path d="${P(ellipse(0, H * 1.02, W * .62, H * .4, 40))}" fill="${belly}"/></g><path d="${P(body)}" fill="none" stroke="${C.line}" stroke-width=".03"/>`);
  backTail();
  if (view === 'front') {
    eyes(d, C, s.eyes, [[-W * .3, H * .38], [W * .3, H * .38]], L * .016 * k);
    d.line(chaikin([[-W * .22, H * .56], [0, H * .64], [W * .22, H * .56]], 2, false), L * .005, shade(C.body, .5));
  } else {
    if (s.spikes) all.push(...spikesEdgeOn(d, C, [0, H * .04], [0, H * .45], L * .04, 5));
    const op = Math.max(2.5, L * .16); d.seam(chaikin([[0, H * .02], [0, H * .62]], 1, false)); ladder(d, C, [0, H * .08], [0, H * .08 + Math.min(op, H * .45)]); lawLabel(d, edgeAt(body, H * .7, -1) + .05, H * .7, -1);
  }
  return { svg: d.svg(), pts: all };
}

const DRAW = { bear, bean, bunny: bean, pillow, elephant, quad, sea };
let SEQ = 0;
export function plushViews(pat, { colours = {}, tex = {}, hrefs = {} } = {}) {
  const surf = { ...(SURFACE[pat.spec.fabric] && !tex.body ? { body: SURFACE[pat.spec.fabric] } : {}), ...tex }; tex = surf;
  const C = { ...palette(pat, colours), tex, uid: `p${++SEQ}` }; if (tex.body === 'fur') C.fur = true;
  const firm = /leather|vegan/.test(pat.spec.fabric || ''), vol = `<radialGradient id="vol-${C.uid}" cx=".36" cy=".3" r=".78" fx=".32" fy=".24"><stop offset="0" stop-color="#fff" stop-opacity="${firm ? .42 : .26}"/><stop offset="${firm ? .22 : .4}" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="${firm ? .3 : .24}"/></radialGradient>`
    + `<filter id="soft-${C.uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".12"/></filter><radialGradient id="gnd-${C.uid}"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
  const defs = lookDefs(C.uid, tex) + vol, draw = DRAW[pat.spec.shape] || bean, out = {}, sk = pat.spec.sketches || [];
  for (const key of ['front', 'back', 'side']) {
    const r = draw(pat, C, key), b = box(r.pts);
    // it stands (or sits) on the ground: a soft shadow under it
    let svg = `<ellipse cx="${r3((b.x0 + b.x1) / 2)}" cy="${r3(b.y1 - .05)}" rx="${r3((b.x1 - b.x0) * .52)}" ry="${r3(Math.max(.3, (b.x1 - b.x0) * .07))}" fill="url(#gnd-${C.uid})"/>` + r.svg;
    if (key === 'front') { const d = painter(pat, C); heightCallout(d, b, pat.spec.shape === 'sea' ? Math.round((b.y1 - b.y0) * 2) / 2 : pat.spec.height); svg += d.svg(); b.x0 -= 1.3; }
    svg += strokesSvg(sk.filter(k => k.on === key)); // drawn by hand on this view
    svg += logoMarkup(pat.spec.logos, key, p => p, hrefs); // our logos and graphics on it
    out[key] = { svg: (defs ? `<defs>${defs}</defs>` : '') + svg, box: b, key, name: { front: 'Front', back: 'Back', side: 'Side' }[key] };
  }
  return { ...out, colours: C };
}
export function plushLayout(v, gap = 1.8) {
  const order = ['front', 'back', 'side'], items = []; let x = 0;
  for (const k of order) { const view = v[k], dx = x - view.box.x0, dy = 0; items.push({ ...view, dx, dy, box: { x0: view.box.x0 + dx, y0: view.box.y0 + dy, x1: view.box.x1 + dx, y1: view.box.y1 + dy } }); x += view.box.x1 - view.box.x0 + gap; }
  const all = items.flatMap(i => [[i.box.x0, i.box.y0], [i.box.x1, i.box.y1 + .9]]);
  return { items, box: box(all) };
}
export function plushSheet(pat, { title = '', viewsMarkup, colours = {}, tex = {}, hrefs = {} }) {
  const lay = plushLayout(plushViews(pat, { colours, tex, hrefs })), b = lay.box, W = b.x1 - b.x0 + 2, H = b.y1 - b.y0 + 3.2;
  const head = `<text x="${r3(b.x0)}" y="${r3(b.y0 - 1.6)}" font-size=".55" font-weight="700">${esc(title || pat.label)}</text><text x="${r3(b.x0)}" y="${r3(b.y0 - .9)}" font-size=".34" fill="#55545a">${esc(pat.label)} · ${esc(pat.size)} · tech flats, 1:1</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}in" height="${r3(H)}in" viewBox="${r3(b.x0 - 1)} ${r3(b.y0 - 2.4)} ${r3(W)} ${r3(H)}" font-family="Helvetica, Arial, sans-serif"><rect x="${r3(b.x0 - 1)}" y="${r3(b.y0 - 2.4)}" width="${r3(W)}" height="${r3(H)}" fill="#fff"/>${head}${viewsMarkup(lay)}</svg>\n`;
}
