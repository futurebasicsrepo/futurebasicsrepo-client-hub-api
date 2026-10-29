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
function palette(pat, given = {}) { const c = { ...(pat.spec.colours || {}), ...given }, body = c.body || COLOURS[pat.spec.fabric] || '#e9dccb'; return { body, contrast: c.contrast || shade(body, 1.06), features: c.features || '#2b2724', line: '#2b2a28', stitch: '#6b655d', blush: '#f2c1b4', fur: pat.spec.fabric === 'fur' }; }

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
  const s = pat.spec, h = s.height, hh = h * .42, hw = hh * 1.05, bh = h * .44, bw = bh * .78, legH = h * .26, armL = h * .3, y0 = hh * .92, d = painter(pat, C), all = [];
  const ear = s.ears !== 'none' ? (s.ears === 'long' ? .22 : .32) * hh : 0;
  if (view === 'side') {
    // the bear from its left, facing left, in the round: what is on its far side first, a tone deeper (the far ear ahead of the near one on
    // the crown, the far arm and leg showing past the body), then the body; the near leg sewn on outside it at the hip, as a jointed bear's
    // is, the foot turned forward on its pad; the head over the body throwing its shadow on the chest; the arm hanging in front
    const far = shade(C.body, .8), hx = hw * .5, head = ellipse(hx, hh * .5, hw * .4, hh * .48, 48);
    const mz = chaikin([[hx - hw * .26, hh * .5], [hx - hw * .5, hh * .54], [hx - hw * .56, hh * .66], [hx - hw * .48, hh * .78], [hx - hw * .26, hh * .8]], 2, false), muzzle = chaikin([...mz, [hx - hw * .2, hh * .66]], 2);
    const body = chaikin([[hx - bw * .2, y0 - hh * .04], [hx - bw * .5, y0 + bh * .28], [hx - bw * .52, y0 + bh * .68], [hx - bw * .3, y0 + bh * .98], [hx + bw * .14, y0 + bh], [hx + bw * .4, y0 + bh * .82], [hx + bw * .42, y0 + bh * .36], [hx + bw * .24, y0 + bh * .02]], 3);
    const lx = hx + bw * .04, legOf = (dx, dy = 0) => ({ leg: capsule([lx + dx, y0 + bh * .6 + dy], [lx - bw * .06 + dx, h - legH * .34 + dy], legH * .34, legH * .29),
      foot: chaikin([[lx - legH * .6, h - legH * .02], [lx - legH * .66, h - legH * .3], [lx - legH * .34, h - legH * .52], [lx + legH * .3, h - legH * .42], [lx + legH * .34, h], [lx - legH * .3, h + .02]].map(([x, y]) => [x + dx, y + dy]), 3),
      pad: chaikin([[lx - legH * .64, h - legH * .02], [lx - legH * .66, h - legH * .28], [lx - legH * .54, h - legH * .33], [lx - legH * .47, h - legH * .02]].map(([x, y]) => [x + dx, y + dy]), 2) });
    const armOf = (dx, dy = 0) => [[hx - bw * .1 + dx, y0 + bh * .1 + dy], [hx - bw * .36 + dx, y0 + armL * .86 + dy]];
    if (ear) { const e = earShape(s.ears, ear * .8, hx - hw * .06, hh * .1, .2); d.shape(e.out, far); all.push(...e.out); }
    if (s.arms !== false) { const [a, b] = armOf(-bw * .1, -armL * .05), arm = capsule(a, b, armL * .19, armL * .2); d.shape(arm, far); all.push(...arm); }
    if (s.legs !== false) { const F = legOf(-legH * .2, -legH * .05); d.shape(F.foot, far); d.fill(F.pad, shade(C.contrast, .82)); d.shape(F.leg, far); all.push(...F.foot); }
    d.shape(body); d.seam(chaikin([[hx + bw * .14, y0 + bh * .02], [hx + bw * .3, y0 + bh * .5], [hx + bw * .1, y0 + bh * .98]], 2, false)); all.push(...body);
    if (s.legs !== false) { const N = legOf(0); d.drop(N.leg, .1, .06, .14); d.shape(N.leg); d.shape(N.foot); d.fill(N.pad, C.contrast); all.push(...N.leg, ...N.foot); }
    if (ear) { const e = earShape(s.ears, ear * .8, hx + hw * .2, hh * .12, .55); d.shape(e.out); all.push(...e.out); }
    d.drop(head, .05, .18, .2); d.shape(head); d.seam(chaikin([[hx - hw * .3, hh * .44], [hx - hw * .12, hh * .08], [hx + hw * .2, hh * .04], [hx + hw * .38, hh * .32]], 2, false));
    d.drop(muzzle, .03, .08, .14); d.shape(muzzle, C.contrast, .025); d.fill(chaikin([[hx - hw * .58, hh * .6], [hx - hw * .5, hh * .57], [hx - hw * .5, hh * .67]], 2), C.features);
    d.line(chaikin([[hx - hw * .5, hh * .72], [hx - hw * .42, hh * .76], [hx - hw * .34, hh * .74]], 1, false), hh * .012);
    eyes(d, C, s.eyes, [[hx - hw * .2, hh * .44]], hh * .045);
    if (s.arms !== false) { const [a, b] = armOf(0), arm = capsule(a, b, armL * .2, armL * .21); d.drop(arm, .1, .08, .16); d.shape(arm); d.seam(capsule(a, b, armL * .1, armL * .11).slice(0, 11), false); all.push(...arm); }
    all.push(...head, ...muzzle);
    return { svg: d.svg(), pts: all };
  }
  // front and back: the legs behind the body, the arms at the shoulders, the head over the neck
  const head = sym([[0, 0], [hw * .3, hh * .03], [hw * .44, hh * .2], [hw * .5, hh * .5], [hw * .44, hh * .8], [hw * .26, hh * .96], [0, hh]]);
  const body = sym([[0, y0 - hh * .04], [bw * .3, y0], [bw * .46, y0 + bh * .18], [bw * .54, y0 + bh * .6], [bw * .46, y0 + bh * .9], [bw * .2, y0 + bh], [0, y0 + bh * 1.01]].map(([x, y]) => [x * (view === 'back' ? 1.04 : 1), y]));
  for (const sg of [1, -1]) { const top = [sg * bw * .24, y0 + bh * .7], foot = [sg * bw * .27, h - legH * .2]; const leg = chaikin([...capsule(top, foot, legH * .3, legH * .32)], 1); d.shape(leg); all.push(...leg);
    if (view === 'front') d.seam(capsule(top, foot, legH * .16, legH * .18).slice(0, 11), false); }
  if (ear) for (const sg of [1, -1]) { const e = earShape(s.ears, ear, sg * hw * .36, hh * .14, sg * .45); d.shape(e.out); if (view === 'front') d.shape(e.inner, C.contrast, .02); all.push(...e.out); }
  d.shape(body); all.push(...body);
  d.seam(chaikin([[0, y0 + bh * .02], [0, y0 + bh * .98]], 1, false));
  if (view === 'back') { const op = Math.max(2.5, h * .22), m = y0 + bh * .5; ladder(d, C, [0, m - op / 2], [0, m + op / 2]); lawLabel(d, edgeAt(body, y0 + bh * .72, -1) + .05, y0 + bh * .72, -1); }
  for (const sg of [1, -1]) { const a = [sg * bw * .38, y0 + bh * .1], b = [sg * (bw * .4 + armL * .3), y0 + armL * .84], arm = capsule(a, b, armL * .21, armL * .23); d.shape(arm); all.push(...arm);
    d.seam(capsule(a, b, armL * .12, armL * .14).slice(0, 11), false); }
  d.shape(head); all.push(...head);
  if (view === 'front') {
    // the gusset's two seams from the nose up over the crown, the muzzle, the face
    for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .06, hh * .56], [sg * hw * .16, hh * .32], [sg * hw * .2, hh * .12], [sg * hw * .17, hh * .015]], 2, false));
    const mz = ellipse(0, hh * .68, hw * .21, hh * .15); d.shape(mz, C.contrast, .025); d.seam(ellipse(0, hh * .68, hw * .17, hh * .11), true);
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
    eyes(d, C, s.eyes, [[-dep * .4, h * .38]], h * .02); d.fill(ellipse(-dep * .5, h * .45, h * .02, h * .015), C.features);
    if (s.arms) { const a = ellipse(-dep * .2, h * .56, h * .05, h * .08, 28, -.5); d.shape(a); all.push(...a); }
    if (s.tail) { const t = ellipse(dep * .56, h * .78, h * .07, h * .07, 24); d.shape(t, C.contrast); all.push(...t); }
    return { svg: d.svg(), pts: all };
  }
  const body = sym([[0, 0], [w * .34, h * .04], [w * .5, h * .4], [w * .46, h * .86], [w * .2, h], [0, h]]);
  if (ears) for (const sg of [1, -1]) { const e = earShape(s.ears, ew, sg * w * .22, h * .05, sg * (s.ears === 'long' ? .1 : .25)); d.shape(e.out); if (view === 'front') d.shape(e.inner, C.contrast, .02); all.push(...e.out); }
  if (s.arms) for (const sg of [1, -1]) { const a = capsule([sg * w * .44, h * .5], [sg * w * .56, h * .62], h * .05, h * .055); d.shape(a); all.push(...a); }
  d.shape(body); all.push(...body);
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
    const cl = chaikin([[.21, .25], [.15, .325], [.112, .41], [.09, .48], [.075, .54], [.055, .59], [.02, .622], [-.02, .615], [-.042, .58], [-.048, .545]], 3, false);
    const wAt = t => .13 * (1 - t) ** 1.3 + .05 * t + .01 * Math.max(0, t - .9) / .1, edge = sg => cl.map((p, i) => { const q = cl[Math.min(i + 1, cl.length - 1)], o = cl[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = wAt(i / (cl.length - 1)) / 2; return [p[0] + sg * dy / l * w, p[1] - sg * dx / l * w]; });
    const front = edge(-1), back = edge(1), tip = cl[cl.length - 1];
    // the head and trunk in one: from under the jaw, round the back of the head, over the crown and brow, down the front of the trunk, round
    // its tip and back up its underside to the jaw
    // the end of the trunk: its centre, which way it points, and a round cap across it
    const [p1, p0] = [cl[cl.length - 1], cl[cl.length - 2]], dl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, dir = [(p1[0] - p0[0]) / dl, (p1[1] - p0[1]) / dl], wTip = wAt(1) / 2;
    const cap = [-.6, 0, .6].map(a => [tip[0] + dir[0] * wTip * .55 * Math.cos(a) - dir[1] * wTip * Math.sin(a), tip[1] + dir[1] * wTip * .55 * Math.cos(a) + dir[0] * wTip * Math.sin(a)]);
    const headTrunk = chaikin(Us([[.3, .4], [.42, .41], [.53, .33], [.57, .2], [.5, .07], [.37, .005], [.24, .03], [.165, .1], [.148, .16], [.146, .195],
      ...front.slice(3), ...(front[front.length - 1][0] < back[back.length - 1][0] ? cap : cap.slice().reverse()), ...back.slice().reverse().filter(([, y]) => y > .315), [.27, .33], [.29, .37]]), 3);
    const body = smooth([[.36, .4], [.52, .35], [.7, .42], [.83, .56], [.88, .74], [.83, .9], [.68, .985], [.46, .995], [.32, .92], [.28, .74], [.29, .55]]);
    const legFront = dx => smooth([[.215 + dx, .58], [.26 + dx, .5], [.34 + dx, .5], [.38 + dx, .58], [.375 + dx, .8], [.385 + dx, .965], [.37 + dx, .995], [.3 + dx, 1.0], [.21 + dx, .995], [.195 + dx, .965], [.205 + dx, .8]], 2);
    const sole = dx => smooth([[.2 + dx, .985], [.29 + dx, .978], [.385 + dx, .985], [.29 + dx, 1.004]], 2);
    const toes = dx => [[.222 + dx, .962], [.262 + dx, .968]].map(([x, y]) => smooth([[x - .015, y + .02], [x - .012, y + .004], [x, y - .004], [x + .012, y + .004], [x + .015, y + .02]], 2));
    const haunch = ellipse(.66 * h, .76 * h, .2 * h, .215 * h, 48, -.15);
    const hindLeg = dy => smooth([[.72, .84 + dy], [.6, .82 + dy], [.47, .83 + dy], [.415, .86 + dy], [.405, .93 + dy], [.43, .99 + dy], [.55, .998 + dy], [.7, .995 + dy]], 2);
    const pad = (dx, dy) => ellipse((.415 + dx) * h, (.912 + dy) * h, .028 * h, .072 * h, 32, .06);
    const ear = smooth([[.37, .11], [.47, .07], [.57, .11], [.625, .23], [.615, .37], [.55, .46], [.46, .47], [.4, .42], [.375, .32], [.36, .2]]);
    // far side first
    if (big) { const fe = ear.map(([x, y]) => [x + .025 * h, y - .035 * h]); d.shape(fe, far); all.push(...fe); }
    { const fl = legFront(.09); d.shape(fl, far); d.fill(sole(.09), farPad); all.push(...fl); }
    d.shape(pad(-.035, -.025), far); d.fill(pad(-.035, -.025).map(([x, y]) => [x - .004 * h, y]), farPad);
    if (s.tail) { const t = capsule([.86 * h, .72 * h], [.95 * h, .9 * h], h * .016, h * .012); d.shape(t, C.body, .03, true); for (let k = -2; k <= 2; k++) d.line([[.95 * h, .9 * h], [(.95 + k * .012) * h, .965 * h]], h * .012, C.contrast); all.push(...t); }
    d.shape(body); d.seam(open([[.36, .42], [.31, .6], [.33, .82], [.42, .99]]), false);
    d.drop(haunch, .08, .1, .14); d.shape(haunch); d.seam(ellipse(.66 * h, .76 * h, .155 * h, .17 * h, 48, -.15).slice(30, 48), false);
    const hl = hindLeg(0); d.drop(hl, .05, .05, .12); d.shape(hl); d.shape(pad(0, 0), C.contrast, .025); d.seam(ellipse(.415 * h, .912 * h, .02 * h, .058 * h, 32, .06), true);
    const fl = legFront(0); d.drop(fl, .08, .02, .14); d.shape(fl); d.fill(sole(0), C.contrast); for (const t of toes(0)) d.shape(t, nail, .015);
    d.seam(open([[.3, .56], [.3, .97]]), false);
    d.drop(headTrunk, .08, .2, .2); d.shape(headTrunk);
    // the trunk's tip: its end, in contrast, and the rings stitched across it
    { const ang = Math.atan2(dir[1], dir[0]) + Math.PI / 2, ex = (tip[0] + dir[0] * wTip * .12) * h, ey = (tip[1] + dir[1] * wTip * .12) * h; d.shape(ellipse(ex, ey, wTip * 1.02 * h, wTip * .45 * h, 28, ang), C.contrast, .025);
      for (const sg of [-1, 1]) d.fill(ellipse(ex + Math.cos(ang) * sg * wTip * .32 * h, ey + Math.sin(ang) * sg * wTip * .32 * h, wTip * .16 * h, wTip * .11 * h, 12, ang), shade(C.contrast, .55)); }
    for (let k = 3; k <= 6; k++) { const t = k / 11, i = Math.round(t * (cl.length - 1)), a = front[i], c = back[i]; d.line([[(a[0] + (c[0] - a[0]) * .2) * h, (a[1] + (c[1] - a[1]) * .2) * h], [(a[0] + (c[0] - a[0]) * .8) * h, (a[1] + (c[1] - a[1]) * .8) * h]], h * .004, C.stitch); }
    // the gusset seam over the crown, the brow, the eye, the smile under the trunk
    d.seam(open([[.165, .14], [.25, .04], [.4, .01], [.52, .1]]), false);
    d.line(open([[.24, .158], [.27, .146], [.3, .156]], 1), h * .004, shade(C.body, .7));
    eyes(d, C, s.eyes, [U([.265, .2])], h * .018);
    d.line(open([[.29, .355], [.315, .372], [.345, .362]], 1), h * .005, shade(C.body, .55));
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
    for (const sg of [1, -1]) { const leg = capsule([sg * bw * .15, y0 + bh * .3], [sg * bw * .16, h - h * .095], h * .085, h * .095); d.shape(leg); d.fill(ellipse(sg * bw * .16, h - h * .01, h * .085, h * .022), C.contrast); all.push(...leg); }
  } else {
    const op = Math.max(2.5, h * .2), m = y0 + bh * .42; d.seam(chaikin([[0, y0 + bh * .02], [0, h * .99]], 1, false)); ladder(d, C, [0, m - op / 2], [0, m + op / 2]); lawLabel(d, edgeAt(body, y0 + bh * .7, -1) + .05, y0 + bh * .7, -1);
    if (s.tail) { const t = capsule([0, y0 + bh * .7], [h * .03, y0 + bh * .9], h * .016, h * .014); d.shape(t); for (let k = -2; k <= 2; k++) d.line([[h * .03, y0 + bh * .9], [h * .03 + k * h * .012, y0 + bh * .9 + h * .06]], h * .012, C.contrast); }
  }
  d.shape(head); all.push(...head);
  if (view === 'front') {
    // the gusset's seams from the brow over the crown, the eyes either side of the trunk, the trunk hanging to the chest, its tip turned out
    for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .1, hh * .62], [sg * hw * .18, hh * .3], [sg * hw * .2, hh * .02]], 2, false));
    const trunk = chaikin([[-hw * .16, hh * .6], [-hw * .14, hh + tr * .4], [-hw * .08, hh + tr * .82], [-hw * .14, hh + tr * .96], [hw * .04, hh + tr], [hw * .14, hh + tr * .86], [hw * .12, hh + tr * .4], [hw * .16, hh * .6]], 3);
    d.shape(trunk); all.push(...trunk); for (let k = 1; k <= 5; k++) { const y = hh * .78 + tr * .15 * k; d.line([[-hw * .11, y], [hw * .11, y + tr * .01]], h * .004, C.stitch); }
    d.fill(ellipse(0, hh + tr * .97, hw * .1, hw * .04), C.contrast);
    eyes(d, C, s.eyes, [[-hw * .23, hh * .48], [hw * .23, hh * .48]], hh * .04);
  } else for (const sg of [1, -1]) d.seam(chaikin([[sg * hw * .2, hh * .02], [sg * hw * .22, hh * .4], [sg * hw * .14, hh * .9]], 2, false));
  return { svg: d.svg(), pts: all };
}

const DRAW = { bear, bean, bunny: bean, pillow, elephant };
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
    if (key === 'front') { const d = painter(pat, C); heightCallout(d, b, pat.spec.height); svg += d.svg(); b.x0 -= 1.3; }
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
