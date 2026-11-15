// Wash and distressing for a garment: the finish a garment is given after it is sewn. Chosen in the Studio (Garment tab), kept on the
// flat's params ({ wash: { type, strength }, distress: { on, amount } }), drawn on the flats (washSvg), and written for the factory
// (washWords, washSteps) on the tech pack and in the picture prompt. Shared by the server and the page (/lab/lab-wash.js), so no imports.

// `look` is how a wash is drawn on the flat, at medium strength:
//   fade      an even lift towards white (0–1)          tint     a colour cast mixed in, and how much
//   mottle    cloudy lightening: [scale, amount]         marble   high-contrast veins, as acid wash: amount
//   speckle   small light spots, as snow wash: amount    points   lighter on the high points (front body, thighs, seat): amount
//   top       sun fade, lighter from the top down        edges    darker at the seams and edges, as garment and pigment dye
export const WASHES = [
  { id: 'none', label: 'No wash', group: 'None', how: 'No wash: as dyed and finished at the mill.', look: {} },
  { id: 'rinse', label: 'Rinse wash', group: 'Soft', how: 'Rinse wash: a short wash to remove size and pre-shrink; colour stays deep.', look: { fade: .03 } },
  { id: 'softener', label: 'Silicone softener wash', group: 'Soft', how: 'Silicone softener wash: soft hand, no change to the colour.', look: {} },
  { id: 'enzyme', label: 'Enzyme wash', group: 'Soft', how: 'Enzyme (cellulase) wash: softens the hand and lifts the colour slightly and evenly; less wear than stones.', look: { fade: .08, mottle: [.03, .08], ribs: .1 } },
  { id: 'garment-dye', label: 'Garment dye', group: 'Dye', how: 'Garment dyed after sewing: colour takes deeper at the seams, ribs and edges, with a soft washed-in look.', look: { fade: .05, edges: .32, ribs: .22 } },
  { id: 'pigment', label: 'Pigment dye wash', group: 'Dye', how: 'Pigment dyed and washed down: a chalky vintage colour, faded on the high points, darker at the seams, ribs and pocket edges.', look: { fade: .08, mottle: [.02, .05], top: .14, lit: .34, edges: .42, ribs: .32 } },
  { id: 'overdye', label: 'Overdye / tint', group: 'Dye', how: 'Overdyed or tinted in a second bath: a cast over the base colour.', look: { tint: ['#8a6a3a', .22] } },
  { id: 'dirty', label: 'Dirty wash / vintage tint', group: 'Dye', how: 'Dirty wash: a yellow-brown tint (often coffee or a mud dye) after a stone fade, settling darker in the seams and creases for a worn-in vintage look.', look: { fade: .06, tint: ['#9a8250', .12], mottle: [.025, .09], lit: .22, edges: .32, ribs: .22 } },
  { id: 'stone', label: 'Stone wash', group: 'Stone', how: 'Stone wash with pumice: worn, uneven fade, lighter on the high points, darker at the seams.', look: { fade: .1, mottle: [.025, .1], lit: .28, edges: .2, ribs: .12 } },
  { id: 'acid', label: 'Acid wash', group: 'Stone', how: 'Acid wash: pumice soaked in potassium permanganate (or bleach), tumbled dry for a marbled, high-contrast fade. Neutralise afterwards.', look: { fade: .14, marble: .7 } },
  { id: 'snow', label: 'Snow wash', group: 'Stone', how: 'Snow wash: small pumice soaked in potassium permanganate, tumbled for a speckled, frosty fade. Neutralise afterwards.', look: { fade: .1, speckle: .6, mottle: [.03, .08] } },
  { id: 'pp-spray', label: 'Potassium permanganate (PP) spray', group: 'Bleach', how: 'Potassium permanganate (PP) sprayed on the high points (front body or thighs and knees, seat), then neutralised: brighter wear just where it rubs.', look: { lit: .48, ribs: .08 } },
  { id: 'spray', label: 'Spray fade', group: 'Bleach', how: 'Spray fade: bleach or PP sprayed from the top and the centre outwards, so the shoulders, hood and chest fade and the ribs, cuffs and sides stay dark. The ombré vintage look.', look: { top: .32, lit: .3, edges: .25, ribs: .32 } },
  { id: 'bleach', label: 'Bleach wash', group: 'Bleach', how: 'Bleach wash (hypochlorite), neutralised: an even, strong lift of the colour.', look: { fade: .38, tint: ['#e8dcc0', .08] } },
  { id: 'mineral', label: 'Mineral wash', group: 'Bleach', how: 'Mineral wash: a cloudy, uneven fade with soft light patches; seams stay darker.', look: { fade: .1, mottle: [.012, .32], edges: .15 } },
  { id: 'ozone', label: 'Ozone fade', group: 'Low impact', how: 'Ozone fade: colour lifted with ozone instead of bleach, less water and chemicals; an even vintage cast.', look: { fade: .16, tint: ['#d9c9a0', .06] } },
  { id: 'laser', label: 'Laser fade', group: 'Low impact', how: 'Laser fade on the high points (and whiskers on jeans) instead of sandblasting or hand sanding (sandblasting is banned for worker safety).', look: { lit: .36, mottle: [.04, .08], whiskers: .5 } },
  { id: 'sun', label: 'Sun-faded / vintage', group: 'Low impact', how: 'Sun-faded vintage wash: lighter across the shoulders, hood and the top, fading down the body; ribs and cuffs stay darker.', look: { fade: .05, top: .4, lit: .14, edges: .2, ribs: .28 } }
];
export const WASH_IDS = WASHES.map(w => w.id);
export const STRENGTHS = [{ id: 'light', label: 'Light', k: .55 }, { id: 'medium', label: 'Medium', k: 1 }, { id: 'heavy', label: 'Heavy', k: 1.6 }];
export const washOf = id => WASHES.find(w => w.id === id) || WASHES[0];
// a wash with nothing small and sharp in it (all but the snow wash's speckles and the acid wash's veins): a picture of it can be drawn at a
// lower resolution and enlarged
export const washSoft = p => { const w = cleanWash(p.wash), L = w ? washOf(w.type).look : {}; return !L.speckle && !L.marble; };

// where distressing goes: everywhere, only the edges (collar, cuffs, hems, pocket openings), or only the body (holes and wear across it)
export const DISTRESS_FOCUS = [{ id: 'all', label: 'All over' }, { id: 'edges', label: 'Edges only' }, { id: 'body', label: 'Body only' }];
// what a slider of 0–100 asks for: chewed nicks along the edges, pinhole clusters, holes, rips (knees on trousers), worn patches, a
// ragged fringed hem, and on heavy wear, dirt
export function distressParts(amount = 0, focus = 'all') {
  const a = Math.max(0, Math.min(100, Number(amount) || 0)) / 100, edges = focus !== 'body', body = focus !== 'edges';
  return {
    nicks: edges ? Math.round(2 + a * 16) : 0,
    pinholes: a < .2 ? 0 : Math.round(a * 4),
    holes: body && a >= .35 ? Math.round((a - .25) * 6) : 0,
    rips: body && a >= .6 ? (a >= .85 ? 2 : 1) : 0,
    abrasion: body ? Math.round(a * 5) : 0,
    fringe: edges && a >= .15, fray: Math.round(4 + a * 14),
    dirt: a >= .75 ? Math.round((a - .6) * 30) : 0,
    level: a < .34 ? 'light' : a < .67 ? 'medium' : 'heavy'
  };
}

export function cleanWash(w) {
  if (!w || typeof w !== 'object') return null;
  const type = WASH_IDS.includes(w.type) ? w.type : 'none';
  return type === 'none' ? null : { type, strength: STRENGTHS.some(s => s.id === w.strength) ? w.strength : 'medium' };
}
export function cleanDistress(d) {
  if (!d || typeof d !== 'object') return null;
  const amount = Math.round(Math.max(0, Math.min(100, Number(d.amount ?? 40) || 0)));
  return { on: Boolean(d.on), amount, ...(DISTRESS_FOCUS.some(f => f.id === d.focus) && d.focus !== 'all' ? { focus: d.focus } : {}) };
}
// a top or a bottom, from the flat's style (the words name the right places)
const kindOf = p => p.kind || (/pant|short|jean|skirt|trouser|jogger|cargo|legging/.test(String(p.style || '')) ? 'bottom' : 'top');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// the parts in words, for the panel and the tech pack
export function distressList(d = {}, kind = 'top') {
  const k = distressParts(d.amount, d.focus || 'all');
  return [k.nicks ? `${plural(k.nicks, 'nick', 'nicks')} along the ${kind === 'bottom' ? 'pocket openings, waistband and hems' : 'collar, cuffs and hem'}` : '', k.pinholes ? `${plural(k.pinholes, 'cluster', 'clusters')} of pinholes` : '', k.holes ? plural(k.holes, 'hole', 'holes') : '', k.rips ? `${plural(k.rips, 'open rip', 'open rips')}${kind === 'bottom' ? ' at the knees' : ''} with loose threads across` : '', k.abrasion ? plural(k.abrasion, 'worn patch', 'worn patches') : '', k.fringe ? 'ragged, fringed hems' : '', k.dirt ? 'dirt marks' : ''].filter(Boolean);
}

// for people: the factory's words, one line each
// the pattern allowance a wash takes up (per cent, length and width): the spec's measurements are finished, after the wash
const SHRINK = { None: 0, 'Low impact': 1.5, Soft: 2, Stone: 3, Bleach: 3, Dye: 4 }, SHRINK_BY = { light: .75, medium: 1, heavy: 1.25 };
export function washShrink(p = {}) {
  const w = cleanWash(p.wash); if (!w) return 0;
  const g = SHRINK[washOf(w.type).group] ?? 2; return Math.round(g * (SHRINK_BY[w.strength] || 1) * 2) / 2;
}
export function washWords(p = {}) {
  const out = [], w = cleanWash(p.wash), d = cleanDistress(p.distress);
  if (w) out.push(`${washOf(w.type).label}, ${w.strength}. ${washOf(w.type).how}`);
  const sh = washShrink(p); if (sh) out.push(`Measurements in this pack are finished, taken after the wash. Allow about ${sh}% shrinkage in length and width in the pattern, and check a washed sample against the points of measure before bulk.`);
  if (d?.on && d.amount > 0) { const k = distressParts(d.amount, d.focus || 'all'), f = DISTRESS_FOCUS.find(x => x.id === (d.focus || 'all')); out.push(`Distressed, ${k.level} (${d.amount}/100${d.focus ? `, ${f.label.toLowerCase()}` : ''}): ${distressList(d, kindOf(p)).join(', ')}. Hand sanded, cut and picked before the wash so the edges fray in it; bartack any hole that could run.`); }
  return out;
}
// for the image model: a short phrase
export function washPrompt(p = {}) {
  const w = cleanWash(p.wash), d = cleanDistress(p.distress);
  return [w ? `${w.strength} ${washOf(w.type).label.toLowerCase()} finish` : '', d?.on && d.amount > 0 ? `${distressParts(d.amount, d.focus || 'all').level} distressing (${distressList(d, kindOf(p)).join(', ')})` : ''].filter(Boolean).join(', ');
}

// ---- drawing it on the flat ----
// `box` is the drawing's box in inches ({x0, y0, x1, y1}); `mask` the id of a mask that is white where the garment is (none: not masked, for the
// service to mask the wash itself); `geo` where the
// garment's edges are, in the same inches: a top { kind:'top', half, neckY, neckHalf, neckRib, neck (false: no ribbed neck to darken or wear),
// vNeck, hemY, hemRib, cuff, longSleeve }, a bottom { kind:'bottom', waistband, rise, hemY }, either with sil, the drawing's silhouette
// (a polygon), which every edge is then read off. Returns SVG laid over the drawing: wear inside the garment only, a fringe past the hem.
// `raster`: the SVG is for the service to turn into a picture (sharp, librsvg), not for a browser. The seams' darkening then erodes in two passes,
// across and then down, which gives the same pixels as one square erode: librsvg erodes a square naively, a 33 × 33 window a pixel at a flat
// picture's resolution, most of the 14 s a washed flat took. A browser keeps the single erode (a zero radius on one axis is not read the same
// everywhere).
const erode = (r, raster) => raster ? `<feMorphology in="SourceAlpha" operator="erode" radius="${r} 0"/><feMorphology operator="erode" radius="0 ${r}"/>` : `<feMorphology in="SourceAlpha" operator="erode" radius="${r}"/>`;
const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const n3 = v => Math.round(v * 1000) / 1000;
// an irregular hole: a jagged ring of points around (x, y)
function jag(r, x, y, rx, ry, n = 11) { let d = ''; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = .62 + r() * .5; d += `${i ? 'L' : 'M'} ${n3(x + Math.cos(a) * rx * k)} ${n3(y + Math.sin(a) * ry * k)} `; } return d + 'Z'; }
export function washSvg(p = {}, { box, mask, pid = 'w', kind = 'top', view = 'front', cloth = '#ffffff', geo = null, raster = false, layer = 'all', bleed = null } = {}) { // layer: 'all', or only the 'wash' or the 'distress' (each inside the garment) or the 'fringe' (past the hem)
  const w = cleanWash(p.wash), d = cleanDistress(p.distress); if (!box || (!w && !(d?.on && d.amount > 0))) return '';
  const { x0, y0, x1, y1 } = box, W = x1 - x0, H = y1 - y0, L = w ? washOf(w.type).look : {}, k = w ? STRENGTHS.find(s => s.id === w.strength).k : 0;
  const lum = (() => { const h = String(cloth).replace('#', ''); const n = parseInt(h.length === 6 ? h : 'ffffff', 16); return ((n >> 16 & 255) * .2126 + (n >> 8 & 255) * .7152 + (n & 255) * .0722) / 255; })();
  const lift = lum > .85 ? .5 : 1; // white cloth shows a wash less: it is drawn fainter
  // where things are. With the drawing's own outline (geo.sil: the sketch's silhouette in the same inches, as it is drawn) every edge is read
  // off it: the hem where the body ends, the cuffs where the sleeves end, the crotch where the legs part, each leg's hem, the hips. Without
  // one, from the measurements, or else guessed from the box.
  const G = geo || (kind === 'bottom' ? { kind, waistband: 1.5, rise: H * .3, hemY: y1 } : { kind: 'top', half: W * .3, neckY: 3, neckHalf: W * .1, hemY: y1, hemRib: 0, cuff: 0, longSleeve: false });
  const bottom = G.kind === 'bottom', cx = x0 + W / 2, sil = Array.isArray(G.sil) && G.sil.length > 2 ? G.sil : null;
  // where a line across the outline meets it: a vertical line x = v (axis 0) gives the ys, a horizontal one y = v (axis 1) the xs, in order
  const meets = (axis, v) => { const o = []; if (!sil) return o; for (let i = 0; i < sil.length; i++) { const a = sil[i], b = sil[(i + 1) % sil.length]; if ((a[axis] <= v) !== (b[axis] <= v)) o.push(a[1 - axis] + (v - a[axis]) / (b[axis] - a[axis]) * (b[1 - axis] - a[1 - axis])); } return o.sort((m, q) => m - q); };
  const spanAt = (y, x) => { const xs = meets(1, y); for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i] <= x && x <= xs[i + 1]) return [xs[i], xs[i + 1]]; return null; };
  const bottomAt = (x, fb) => { const ys = meets(0, x); return ys.length ? ys[ys.length - 1] : fb; }, topAt = (x, fb) => { const ys = meets(0, x); return ys.length ? ys[0] : fb; };
  // a band along an edge: from xa to xb, h deep above the edge at(x) and `below` past it (the garment's mask trims what is outside)
  const band = (xa, xb, at, h, below = .3) => { const n = 24, top = [], bot = []; for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n, y = at(x); top.push(`${n3(x)} ${n3(y - h)}`); bot.unshift(`${n3(x)} ${n3(y + below)}`); } return `M ${top.join(' L ')} L ${bot.join(' L ')} Z`; };
  const T = {}, B = {};
  if (!bottom) {
    // a top: the hem is the bottom of the body, which is as wide as the outline is just above the hem band (the sleeves hang apart from it
    // there; where they touch it, the chest's width)
    const half0 = G.half || W * .3; T.hem = G.hemY ?? y1;
    const sp = sil && spanAt(T.hem - Math.max(1, G.hemRib || 0) - .4, cx), ok = sp && (sp[1] - sp[0]) / 2 < half0 * 1.3;
    T.l = ok ? sp[0] : cx - half0; T.r = ok ? sp[1] : cx + half0; T.cx = (T.l + T.r) / 2;
    T.hemAt = x => bottomAt(Math.min(Math.max(x, T.l + .05), T.r - .05), T.hem);
    // the cuffs of long sleeves: the lowest the outline goes outside the body, and as wide as it stays near that low
    T.cuffs = [];
    if (G.longSleeve) for (const side of [-1, 1]) {
      if (!sil) { T.cuffs.push({ a: side < 0 ? x0 : cx + half0 + .6, b: side < 0 ? cx - half0 - .6 : x1, y: y1 }); continue; }
      const xs = sil.map(q => q[0]), ext = side < 0 ? Math.min(...xs) : Math.max(...xs), inside = x => (side < 0 ? x < T.l - .2 : x > T.r + .2);
      let best = null; for (let t = .05; t <= 6 && inside(ext - side * t); t += .1) { const y = bottomAt(ext - side * t, -Infinity); if (!best || y > best.y) best = { x: ext - side * t, y }; }
      if (!best || !(best.y > -Infinity)) continue;
      let a = best.x, b = best.x; while (inside(a - .1) && Math.abs(a - .1 - ext) < 6 && bottomAt(a - .1, -Infinity) > best.y - 1) a -= .1; while (inside(b + .1) && Math.abs(b + .1 - ext) < 6 && bottomAt(b + .1, -Infinity) > best.y - 1) b += .1;
      T.cuffs.push({ a, b, y: best.y });
    }
    // the neck: a round (or V) ribbed neck is darker and wears; a hood, a collar, a stand or an open neck has none of that (geo.neck false)
    T.neck = G.neck === false || G.hood ? null : { half: G.neckHalf || 3.5, drop: G.neckY || 3, rib: G.neckRib || .75, v: Boolean(G.vNeck) };
    T.neckAt = t => T.neck.v ? [T.cx + (t - .5) * 2 * T.neck.half, T.neck.drop * (1 - Math.abs(t - .5) * 2)] : [T.cx - Math.cos(Math.PI * t) * T.neck.half, T.neck.drop * Math.sin(Math.PI * t)]; // t 0 → 1, shoulder to shoulder
  } else {
    // a bottom: the waist at the top of the outline, the crotch where the centre line leaves it, each leg as wide as it is below the crotch;
    // a skirt has no crotch, and its two halves stand in for legs
    B.top = topAt(cx, 0); B.wb = G.waistband || 1.5;
    let crotch = null; if (sil) for (let y = B.top + 3; y < y1 - 1; y += .1) { const s = spanAt(y, cx); if (!s || s[1] - s[0] < 1.5) { crotch = y; break; } } // a drawcord hanging down the middle is a sliver, not the body
    B.crotch = crotch ?? G.rise ?? B.top + H * .3;
    const at = crotch != null ? meets(1, crotch + Math.min(1.5, (y1 - crotch) / 3)) : [];
    B.legs = at.length >= 4 ? [[at[0], at[1]], [at[at.length - 2], at[at.length - 1]]] : (() => { const s = sil && spanAt(B.crotch, cx); return s ? [[s[0], cx], [cx, s[1]]] : [[cx - W * .41, cx - W * .09], [cx + W * .09, cx + W * .41]]; })();
    B.legX = B.legs.map(([l, rr]) => (l + rr) / 2); B.legW = B.legs.map(([l, rr]) => rr - l);
    B.hemAt = x => bottomAt(x, G.hemY ?? y1); B.hem = B.legX.map(B.hemAt);
    B.knee = B.legX.map((lx, i) => B.hem[i] - B.crotch < 9 ? (B.top + B.wb + B.hem[i]) / 2 + .5 : B.crotch + (B.hem[i] - B.crotch) * .42); // a short leg has no knee: mid-thigh
    // each leg's hem, as wide as the leg is just above it
    B.hems = B.legX.map((lx, i) => { const s = sil && spanAt(B.hem[i] - .3, lx); return s || [lx - B.legW[i] / 2, lx + B.legW[i] / 2]; });
    const hp = sil && spanAt(B.top + B.wb + 1.5, cx); B.hips = hp || [cx - W * .45, cx + W * .45];
  }
  let defs = '', out = '', loose = '';
  // bleed: a box past `box` the layers that fill it are drawn to, the same inside it, for the service to cut at the box itself (renderSvg washOnly)
  const fb = bleed || box, rect = (fill, op, extra = '', rx0 = fb.x0, ry0 = fb.y0, rw = fb.x1 - fb.x0, rh = fb.y1 - fb.y0) => `<rect x="${n3(rx0)}" y="${n3(ry0)}" width="${n3(rw)}" height="${n3(rh)}" fill="${fill}" opacity="${n3(Math.min(1, op))}"${extra}/>`;
  if (w) {
    if (L.fade) out += rect('#ffffff', L.fade * k * lift);
    if (L.tint) out += rect(L.tint[0], L.tint[1] * k, ' style="mix-blend-mode:multiply"');
    if (L.mottle) { defs += `<filter id="${pid}-wm" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="${L.mottle[0] * 22}" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${n3(1.6 * L.mottle[1] * k * lift)} ${n3(-.35 * L.mottle[1] * k)}"/></filter>`; out += rect('#ffffff', 1, ` filter="url(#${pid}-wm)"`); }
    if (L.marble) { defs += `<filter id="${pid}-wa" x="0" y="0" width="1" height="1"><feTurbulence type="turbulence" baseFrequency=".22 .3" numOctaves="4" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -5 ${n3(1.05 + .1 * k)}"/><feComponentTransfer><feFuncA type="linear" slope="${n3(L.marble * k * lift)}"/></feComponentTransfer></filter>`; /* thin light veins where the turbulence is lowest */ out += rect('#ffffff', 1, ` filter="url(#${pid}-wa)"`); }
    if (L.speckle) { const r = rnd(11); let s = ''; const n = Math.round(240 * L.speckle * k * (W * H) / 400); for (let i = 0; i < Math.min(n, 1600); i++) s += `<circle cx="${n3(x0 + r() * W)}" cy="${n3(y0 + r() * H)}" r="${n3(.05 + r() * .13)}" opacity="${n3(.45 + r() * .55)}"/>`; out += `<g fill="#ffffff" opacity="${n3(.75 * lift)}">${s}</g>`; }
    if (L.top) { defs += `<linearGradient id="${pid}-wt" ${bleed ? `gradientUnits="userSpaceOnUse" x1="0" y1="${n3(y0)}" x2="0" y2="${n3(y1)}"` : 'x1="0" y1="0" x2="0" y2="1"'}><stop offset="0" stop-color="#ffffff" stop-opacity="${n3(Math.min(.8, L.top * k * lift))}"/><stop offset=".7" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`; out += rect(`url(#${pid}-wt)`, 1); }
    // the high points take the fade: a top's chest, hood and shoulders; a bottom's thighs and knees
    if (L.lit) {
      defs += `<radialGradient id="${pid}-wp"><stop offset="0" stop-color="#ffffff" stop-opacity="${n3(Math.min(.8, L.lit * k * lift))}"/><stop offset=".55" stop-color="#ffffff" stop-opacity="${n3(Math.min(.8, L.lit * k * lift) * .45)}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
      const half = G.half || W * .3, ny = G.neckY || 3;
      const spots = bottom ? B.legX.flatMap((lx, i) => [[lx, B.crotch + 3.5, Math.min(W * .13, B.legW[i] * .45), 4.5], [lx, B.knee[i], Math.min(W * .11, B.legW[i] * .4), 2.6]])
        : [[T.cx, Math.min(ny + 5.5, T.hem - 7), half * .75, 7], [T.cx, y0 + 2, W * .14, 3.5], [T.cx - half * .95, ny + 2, W * .1, 3], [T.cx + half * .95, ny + 2, W * .1, 3]];
      out += spots.map(([sx, sy, rx, ry]) => `<ellipse cx="${n3(sx)}" cy="${n3(sy)}" rx="${n3(rx)}" ry="${n3(ry)}" fill="url(#${pid}-wp)"/>`).join('');
    }
    // whiskers: thin faded lines fanning from the crotch across the upper thighs (jeans)
    if (L.whiskers && bottom) { const r = rnd(41); let s = ''; for (const side of [-1, 1]) for (let i = 0; i < 5; i++) { const leg = B.legs[side < 0 ? 0 : 1], yy = B.crotch - .4 + i * .7 + (r() - .5) * .3, xs = cx + side * (.5 + r() * .4), xe = (side < 0 ? leg[0] : leg[1]) - side * (.5 + r() * B.legW[side < 0 ? 0 : 1] * .2); s += `<path d="M ${n3(xs)} ${n3(yy)} Q ${n3((xs + xe) / 2)} ${n3(yy - .3 - r() * .3)} ${n3(xe)} ${n3(yy - .7 - r() * .4)}" stroke="#ffffff" stroke-width="${n3(.1 + r() * .1)}" fill="none" opacity="${n3(L.whiskers * k * (.25 + r() * .3))}" stroke-linecap="round"/>`; } out += `<g filter="url(#${pid}-wb)">${s}</g>`; defs += `<filter id="${pid}-wb"><feGaussianBlur stdDeviation=".12"/></filter>`; }
    // dye settles in the seams and edges: darker in a band inside the garment's outline (all of it but its core, eroded and softened: the
    // garment's mask keeps what is inside) and along the drawn seams and pocket edges (the sketch's lines, softened)
    if (L.edges) {
      defs += `<filter id="${pid}-we" x="-.05" y="-.05" width="1.1" height="1.1">${erode(.4, raster)}<feGaussianBlur stdDeviation=".3"/><feComponentTransfer><feFuncA type="table" tableValues="${n3(L.edges * k)} 0"/></feComponentTransfer></filter>`
        + `<filter id="${pid}-ws" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 1 0"/><feGaussianBlur stdDeviation=".2"/><feComponentTransfer><feFuncA type="linear" slope="${n3(L.edges * k * .9)}"/></feComponentTransfer></filter>`;
      out += `<use href="#${pid}-b" filter="url(#${pid}-we)"/><use href="#${pid}-b" filter="url(#${pid}-ws)"/>`;
    }
    // and the ribs stay darker than the faded body: the waistband and each leg's hem; the hem band, the cuffs and a ribbed neck
    if (L.ribs) {
      const dk = n3(Math.min(.55, L.ribs * k)); let s = '';
      const darken = (dd, op) => `<path d="${dd}" fill="#000000" opacity="${n3(op)}"/>`;
      if (bottom) { s += darken(band(B.hips[0] - 1, B.hips[1] + 1, x => topAt(x, B.top) + B.wb, B.wb + .3, 0), dk); B.hems.forEach(([l, rr]) => { s += darken(band(l - .3, rr + .3, x => B.hemAt(x), 1.2, .3), dk * .8); }); }
      else {
        s += G.hemRib ? darken(band(T.l - .3, T.r + .3, T.hemAt, G.hemRib, .2), dk) : darken(band(T.l - .3, T.r + .3, T.hemAt, 1, .1), dk * .7);
        for (const c of T.cuffs) s += sil ? darken(band(c.a - .4, c.b + .4, x => bottomAt(x, c.y), (G.cuff || 2.5) + .8, .8), dk) : rect('#000000', dk, '', c.a, c.y - (G.cuff || 2.5) - .8, c.b - c.a, (G.cuff || 2.5) + 1.6);
        if (T.neck) { const pts = []; for (let i = 0; i <= 24; i++) { const [nx, ny] = T.neckAt(i / 24); pts.push(`${n3(nx)} ${n3(ny + T.neck.rib / 2)}`); } s += `<path d="M ${pts.join(' L ')}" fill="none" stroke="#000000" stroke-width="${n3(T.neck.rib + .3)}" stroke-linejoin="round" opacity="${n3(dk * .7)}"/>`; }
      }
      defs += `<filter id="${pid}-wr" x="-.1" y="-.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation=".45"/></filter>`;
      out += `<g filter="url(#${pid}-wr)">${s}</g>`;
    }
  }
  const washDefs = defs, washOut = out;
  if (d?.on && d.amount > 0) {
    const P2 = distressParts(d.amount, d.focus || 'all'), a = d.amount / 100, r = rnd(view === 'back' ? 29 : 17), thread = lum > .7 ? '#d9d4c7' : '#efeadf';
    const hole = (x, y, rx, ry, threads = 0) => { let t = ''; for (let i = 0; i < threads; i++) { const ty = y - ry * .55 + (i + .5) * (ry * 1.1 / threads); t += `<path d="M ${n3(x - rx * .9)} ${n3(ty)} Q ${n3(x + (r() - .5) * rx * .4)} ${n3(ty + (r() - .5) * ry * .3)} ${n3(x + rx * .9)} ${n3(ty + (r() - .5) * .05)}" stroke="${thread}" stroke-width="${n3(.016 + r() * .012)}" fill="none" opacity=".9"/>`; } return `<path d="${jag(r, x, y, rx * 1.25, ry * 1.35)}" fill="#ffffff" opacity=".28"/><path d="${jag(r, x, y, rx, ry)}" fill="#141210" opacity=".88"/>${t}`; };
    const half = G.half || W * .3, ny = G.neckY || 3, onBody = y => Math.min(y, T.hem - 1.5); // a top's wear stays on its body, above the hem
    // the wear itself: sanded, lighter scuffing (knees and thighs on a bottom; hem and front body on a top)
    defs += `<filter id="${pid}-dn" x="-.2" y="-.2" width="1.4" height="1.4"><feTurbulence type="fractalNoise" baseFrequency=".8 5" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.4 -1.05"/><feComposite in2="SourceGraphic" operator="in"/></filter><radialGradient id="${pid}-dp"><stop offset="0" stop-color="#ffffff" stop-opacity=".34"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
    const wearAt = bottom ? [[B.legX[0], B.knee[0]], [B.legX[1], B.knee[1]], [B.legX[0], B.crotch + 3], [B.legX[1], B.crotch + 3], [B.legX[0], B.hem[0] - 3], [B.legX[1], B.hem[1] - 3]]
      : [[T.cx - half * .45, T.hem - 3.5], [T.cx + half * .5, T.hem - 2.5], [T.cx, onBody(ny + 6)], [T.cx - half * .7, onBody(ny + 9)], [T.cx + half * .3, onBody(ny + 12)]];
    for (let i = 0; i < (bottom ? P2.abrasion : Math.ceil(P2.abrasion / 2)); i++) { /* a top wears less in patches than a bottom: its wear is mostly holes and edges */ const [ax, ay] = wearAt[i % wearAt.length], x = ax + (r() - .5) * .8, y = ay + (r() - .5) * .8, rw = 1 + r() * 1.1, rh = .45 + r() * .5; out += `<ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(rw * 1.2)}" ry="${n3(rh * 1.3)}" fill="url(#${pid}-dp)"/><ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(rw)}" ry="${n3(rh)}" fill="#ffffff" filter="url(#${pid}-dn)" opacity="${bottom ? .85 : .55}"/>`; }
    // edges: chewed nicks on the edges themselves: a ribbed neck, the hem and the cuffs (a top), or the waistband, the pocket openings and
    // each leg's hem (a bottom)
    const edgePts = []; const n = P2.nicks;
    for (let i = 0; i < n; i++) {
      const pick = r();
      if (!bottom) {
        if (T.neck && pick < .4) { const [nx, ny2] = T.neckAt(.06 + r() * .88); edgePts.push([nx, ny2 + .12]); }
        else if (T.cuffs.length && pick >= (T.neck ? .8 : .7)) { const c = T.cuffs[r() < .5 ? 0 : T.cuffs.length - 1], x = c.a + .2 + r() * Math.max(.1, c.b - c.a - .4); edgePts.push([x, bottomAt(x, c.y) - .2]); }
        else { const x = T.cx + (r() - .5) * (T.r - T.l) * .92; edgePts.push([x, T.hemAt(x) - .18]); }
      } else {
        if (pick < .3) { const i2 = r() < .5 ? 0 : 1, [l, rr] = B.hems[i2], x = l + .15 + r() * Math.max(.1, rr - l - .3); edgePts.push([x, B.hemAt(x) - .15]); }
        else if (pick < .6) { const side = r() < .5 ? 0 : 1, x = side ? B.hips[1] - .7 - r() * 1.3 : B.hips[0] + .7 + r() * 1.3; edgePts.push([x, B.top + B.wb + .6 + r() * 1.8]); }
        else { const x = B.hips[0] + .3 + r() * (B.hips[1] - B.hips[0] - .6); edgePts.push([x, topAt(x, B.top) + .15]); }
      }
    }
    for (const [ex, ey] of edgePts) out += hole(ex, ey, .1 + r() * .2, .06 + r() * .1, r() < .4 ? 1 : 0);
    // pinholes: small clusters (near the hem and across the body on a top; the thighs on a bottom)
    for (let c = 0; c < P2.pinholes; c++) {
      const [px, py] = bottom ? [B.legX[c % 2] + (r() - .5) * Math.min(2, B.legW[c % 2] * .5), B.crotch + 4 + r() * Math.max(1, B.hem[c % 2] - B.crotch - 8)] : (c % 2 ? [T.cx + (r() - .5) * half * 1.4, T.hem - .8 - r() * 1.2] : [T.cx + (r() - .5) * half * 1.2, onBody(ny + 3 + r() * 10)]);
      const m = 3 + Math.round(r() * 4); for (let j = 0; j < m; j++) out += hole(px + (r() - .5) * 1.2, py + (r() - .5) * .6, .04 + r() * .06, .03 + r() * .04);
    }
    // holes on the body, and rips: a bottom's open knee with the white weft across; a top's tear low on the body
    const holeAt = bottom ? [[B.legX[0] - B.legW[0] * .12, B.crotch + 6], [B.legX[1] + B.legW[1] * .1, B.crotch + 9], [B.legX[0] + B.legW[0] * .08, B.knee[0] + 3.5], [B.legX[1] - B.legW[1] * .08, B.crotch + 4]]
      : [[T.cx - half * .55, onBody(ny + 11)], [T.cx + half * .45, onBody(ny + 6)], [T.cx + half * .2, T.hem - 5], [T.cx - half * .15, onBody(ny + 15)]];
    for (let i = 0; i < P2.holes; i++) { const [hx, hy] = holeAt[i % holeAt.length]; out += hole(hx + (r() - .5) * .6, Math.min(hy + (r() - .5) * .6, bottom ? B.hem[i % 2] - 1.5 : hy + 1), .18 + r() * .25, .1 + r() * .14, 2); }
    for (let i = 0; i < P2.rips; i++) {
      const rh0 = bottom ? .55 + a * .5 : 0, [rx0, ry0] = bottom ? [B.legX[i % 2] + (r() - .5) * .8, Math.min(B.knee[i % 2] + (r() - .5) * .8, B.hem[i % 2] - 1.6 - rh0 * 1.6)] : [T.cx + (i ? -1 : 1) * half * .35, Math.max(ny + 4, T.hem - 6 - r() * 3)];
      const rw = bottom ? Math.min(W * .1, B.legW[i % 2] * .28) + a * 1.2 : 1 + a, rh = bottom ? .55 + a * .5 : .35 + a * .3;
      out += `<path d="${jag(r, rx0, ry0, rw * 1.18, rh * 1.6, 16)}" fill="#ffffff" opacity=".3"/>` + hole(rx0, ry0, rw, rh, Math.round(5 + a * 6));
      // frayed fibres at the top and bottom edge of the rip
      for (let f = 0; f < 18; f++) { const fx = rx0 - rw + r() * rw * 2, top = r() < .5, fy = ry0 + (top ? -1 : 1) * rh * (.7 + r() * .25); out += `<line x1="${n3(fx)}" y1="${n3(fy)}" x2="${n3(fx + (r() - .5) * .15)}" y2="${n3(fy + (top ? 1 : -1) * (.12 + r() * .2))}" stroke="${thread}" stroke-width=".02" opacity=".85"/>`; }
    }
    // dirt: a few brown marks on heavy wear
    if (P2.dirt) { defs += `<filter id="${pid}-dd"><feGaussianBlur stdDeviation=".05"/></filter>`; let s = ''; for (let i = 0; i < P2.dirt; i++) s += `<circle cx="${n3(x0 + r() * W)}" cy="${n3(y0 + H * (.2 + r() * .75))}" r="${n3(.04 + r() * .12)}" fill="#6a4a2a" opacity="${n3(.25 + r() * .35)}"/>`; out += `<g filter="url(#${pid}-dd)" style="mix-blend-mode:multiply">${s}</g>`; }
    // a ragged hem: threads hanging past the bottom edge, from the edge itself (drawn outside the garment's mask, so they show)
    if (P2.fringe) {
      const hems = bottom ? B.hems.map(([l, rr]) => [l + .1, rr - .1, B.hemAt]) : [[T.l + .1, T.r - .1, T.hemAt], ...T.cuffs.map(c => [c.a + .1, c.b - .1, x => bottomAt(x, c.y)])];
      const col = lum > .6 ? '#bdb6a6' : cloth;
      for (const [hx0, hx1, at] of hems) for (let x = hx0; x < hx1; x += .5 / (1 + a * 2.5)) { if (r() > .35 + a * .6) continue; const len = .08 + r() * (.12 + a * .55); loose += `<path d="M ${n3(x)} ${n3(at(x) - .06)} q ${n3((r() - .5) * .1)} ${n3(len / 2)} ${n3((r() - .5) * .14)} ${n3(len)}" stroke="${col}" stroke-width="${n3(.02 + r() * .02)}" fill="none" opacity=".95"/>`; }
    }
  }
  if (!out && !loose) return '';
  if (layer === 'fringe') return loose ? `<g pointer-events="none" data-fringe="1">${loose}</g>` : '';
  if (layer === 'wash') return washOut ? `<defs>${washDefs}</defs><g${mask ? ` mask="url(#${mask})"` : ''} pointer-events="none" data-wash="${w.type}">${washOut}</g>` : '';
  if (layer === 'distress') return out.length > washOut.length ? `<defs>${defs.slice(washDefs.length)}</defs><g${mask ? ` mask="url(#${mask})"` : ''} pointer-events="none" data-distress="${d.amount}">${out.slice(washOut.length)}</g>` : '';
  return `<defs>${defs}</defs><g${mask ? ` mask="url(#${mask})"` : ''} pointer-events="none" data-wash="${w ? w.type : ''}" data-distress="${d?.on ? d.amount : 0}">${out}</g>${loose ? `<g pointer-events="none" data-fringe="1">${loose}</g>` : ''}`;
}
