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
const COLOURS = { minky: '#e9dccb', shortpile: '#e3cfb2', velboa: '#ead8bd', fleece: '#e6e1d6', fur: '#dcc39f', terry: '#efe7da' };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
function palette(pat, given = {}) { const c = { ...(pat.spec.colours || {}), ...given }, body = c.body || COLOURS[pat.spec.fabric] || '#e9dccb'; return { body, contrast: c.contrast || shade(body, 1.06), features: c.features || '#2b2724', line: '#2b2a28', stitch: '#6b655d', blush: '#f2c1b4', fur: pat.spec.fabric === 'fur' }; }

// ---- drawing ----
function painter(pat, C) {
  const fur = C.fur, parts = [];
  // a long-pile fur outline is tufted: the edge broken into short strokes of pile
  const edge = pts => fur ? pts.map((p, i) => { const q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, k = (i % 3 === 0 ? .09 : .04); return [p[0] + dy / l * k, p[1] - dx / l * k]; }) : pts;
  return {
    shape: (pts, fill = C.body, w = .03) => parts.push(`<path d="${P(edge(pts))}" fill="${fill}" stroke="${C.line}" stroke-width="${w}" stroke-linejoin="round"/>` + (C.tex?.[fill === C.body ? 'body' : fill === C.contrast ? 'contrast' : ''] ? `<path d="${P(pts)}" fill="url(#lk-${C.tex[fill === C.body ? 'body' : 'contrast']}-${C.uid})"/>` : '')),
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
    else { d.fill(ellipse(x, y, size * .8, size), C.features); for (let k = -2; k <= 2; k++) d.line([[x + k * size * .28, y - size * .8], [x + k * size * .28, y + size * .8]], .006, '#000'); }
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
    // the head in profile is the head side as it is cut, filled out; the body deeper at the belly; an arm and a leg on the near side
    const head = chaikin([[0, hh * .62], [hw * .05, hh * .44], [hw * .14, hh * .22], [hw * .3, hh * .04], [hw * .46, 0], [hw * .6, hh * .14], [hw * .68, hh * .42], [hw * .62, hh * .74], [hw * .44, hh * .94], [hw * .2, hh * 1.0], [hw * .06, hh * .86], [-hw * .02, hh * .72]], 3);
    const cx = hw * .34, body = chaikin([[cx - bw * .3, y0 - hh * .02], [cx - bw * .44, y0 + bh * .3], [cx - bw * .46, y0 + bh * .66], [cx - bw * .3, y0 + bh * .95], [cx, y0 + bh], [cx + bw * .34, y0 + bh * .9], [cx + bw * .42, y0 + bh * .5], [cx + bw * .34, y0 + bh * .1], [cx + bw * .18, y0 - hh * .06]], 3);
    // the leg comes down from the hip, the foot turned forward, its pad on the sole
    const leg = capsule([cx + bw * .04, y0 + bh * .68], [cx - bw * .02, h - legH * .3], legH * .29, legH * .27), foot = ellipse(cx - legH * .2, h - legH * .18, legH * .4, legH * .18);
    const arm = capsule([cx - bw * .06, y0 + bh * .12], [cx - armL * .3, y0 + armL * .84], armL * .2, armL * .22);
    d.shape(body); d.seam(chaikin([[cx + bw * .2, y0 + bh * .05], [cx + bw * .36, y0 + bh * .5], [cx + bw * .26, y0 + bh * .94]], 2, false)); d.shape(leg); d.shape(foot); d.seam(chaikin([[cx - legH * .7, h - .1], [cx + legH * .2, h - .1]], 1, false)); d.fill(ellipse(cx - legH * .26, h - .04, legH * .42, .05), C.contrast);
    if (ear) { const e = earShape(s.ears, ear * .55, hw * .44, hh * .1, .35); d.shape(e.out); }
    d.shape(head); d.seam(chaikin([[hw * .02, hh * .55], [hw * .2, hh * .12], [hw * .46, hh * .03], [hw * .64, hh * .25], [hw * .66, hh * .6]], 2, false));
    const mz = ellipse(hw * .07, hh * .68, hw * .13, hh * .13); d.shape(mz, C.contrast, .02);
    d.fill(chaikin([[-hw * .04, hh * .6], [hw * .05, hh * .58], [hw * .04, hh * .67]], 2), C.features);
    eyes(d, C, s.eyes, [[hw * .2, hh * .5]], hh * .045);
    d.shape(arm); d.seam(capsule([cx - bw * .06, y0 + bh * .12], [cx - armL * .3, y0 + armL * .84], armL * .11, armL * .13).slice(0, 11), false);
    all.push(...head, ...body, ...leg, ...foot, ...arm);
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

const DRAW = { bear, bean, bunny: bean, pillow };
let SEQ = 0;
export function plushViews(pat, { colours = {}, tex = {} } = {}) {
  const C = { ...palette(pat, colours), tex, uid: `p${++SEQ}` }; if (tex.body === 'fur') C.fur = true;
  const defs = lookDefs(C.uid, tex), draw = DRAW[pat.spec.shape] || bean, out = {}, sk = pat.spec.sketches || [];
  for (const key of ['front', 'back', 'side']) {
    const r = draw(pat, C, key); let svg = r.svg;
    const b = box(r.pts);
    if (key === 'front') { const d = painter(pat, C); heightCallout(d, b, pat.spec.height); svg += d.svg(); b.x0 -= 1.3; }
    svg += strokesSvg(sk.filter(k => k.on === key)); // drawn by hand on this view
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
export function plushSheet(pat, { title = '', viewsMarkup, colours = {}, tex = {} }) {
  const lay = plushLayout(plushViews(pat, { colours, tex })), b = lay.box, W = b.x1 - b.x0 + 2, H = b.y1 - b.y0 + 3.2;
  const head = `<text x="${r3(b.x0)}" y="${r3(b.y0 - 1.6)}" font-size=".55" font-weight="700">${esc(title || pat.label)}</text><text x="${r3(b.x0)}" y="${r3(b.y0 - .9)}" font-size=".34" fill="#55545a">${esc(pat.label)} · ${esc(pat.size)} · tech flats, 1:1</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}in" height="${r3(H)}in" viewBox="${r3(b.x0 - 1)} ${r3(b.y0 - 2.4)} ${r3(W)} ${r3(H)}" font-family="Helvetica, Arial, sans-serif"><rect x="${r3(b.x0 - 1)}" y="${r3(b.y0 - 2.4)}" width="${r3(W)}" height="${r3(H)}" fill="#fff"/>${head}${viewsMarkup(lay)}</svg>\n`;
}
