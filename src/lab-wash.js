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
// garment's edges are, in the same inches (from its measurements): a top { kind:'top', half, neckY, neckHalf, hemY, hemRib, cuff, longSleeve },
// a bottom { kind:'bottom', waistband, rise, hemY }. Returns SVG laid over the drawing: wear inside the garment only, a fringe past the hem.
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
  // where things are, from the measurements, or else guessed from the box
  const G = geo || (kind === 'bottom' ? { kind, waistband: 1.5, rise: H * .3, hemY: y1 } : { kind: 'top', half: W * .3, neckY: 3, neckHalf: W * .1, hemY: y1, hemRib: 0, cuff: 0, longSleeve: false });
  const bottom = G.kind === 'bottom', cx = x0 + W / 2;
  const knee = bottom ? G.rise + (G.hemY - G.rise) * .42 : 0, legX = [cx - W * .25, cx + W * .25];
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
      const spots = bottom ? [...legX.flatMap(lx => [[lx, G.rise + 3.5, W * .13, 4.5], [lx, knee, W * .11, 2.6]])] : [[cx, (G.neckY || 3) + 5.5, (G.half || W * .3) * .75, 7], [cx, y0 + 2, W * .14, 3.5], [cx - (G.half || W * .3) * .95, (G.neckY || 3) + 2, W * .1, 3], [cx + (G.half || W * .3) * .95, (G.neckY || 3) + 2, W * .1, 3]];
      out += spots.map(([sx, sy, rx, ry]) => `<ellipse cx="${n3(sx)}" cy="${n3(sy)}" rx="${n3(rx)}" ry="${n3(ry)}" fill="url(#${pid}-wp)"/>`).join('');
    }
    // whiskers: thin faded lines fanning from the crotch across the upper thighs (jeans)
    if (L.whiskers && bottom) { const r = rnd(41); let s = ''; for (const side of [-1, 1]) for (let i = 0; i < 5; i++) { const yy = G.rise - .4 + i * .7 + (r() - .5) * .3, xs = cx + side * (.5 + r() * .4), xe = cx + side * (W * (.2 + r() * .14)); s += `<path d="M ${n3(xs)} ${n3(yy)} Q ${n3((xs + xe) / 2)} ${n3(yy - .3 - r() * .3)} ${n3(xe)} ${n3(yy - .7 - r() * .4)}" stroke="#ffffff" stroke-width="${n3(.1 + r() * .1)}" fill="none" opacity="${n3(L.whiskers * k * (.25 + r() * .3))}" stroke-linecap="round"/>`; } out += `<g filter="url(#${pid}-wb)">${s}</g>`; defs += `<filter id="${pid}-wb"><feGaussianBlur stdDeviation=".12"/></filter>`; }
    // dye settles in the seams and edges, and the ribs (hem band, cuffs, collar) stay darker than the faded body
    if (L.edges) { defs += `<filter id="${pid}-we">${erode(.4, raster)}<feGaussianBlur stdDeviation=".3"/><feComposite in2="SourceAlpha" operator="out"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${n3(L.edges * k)} 0"/></filter>`; out += `<use href="#${pid}-b" filter="url(#${pid}-we)"/>`; }
    if (L.ribs) {
      const dk = n3(Math.min(.55, L.ribs * k)); let s = '';
      if (bottom) s += rect('#000000', dk, '', x0, y0, W, G.waistband || 1.5) + rect('#000000', dk * .8, '', x0, G.hemY - 1.2, W, 1.3);
      else {
        const bx0 = cx - (G.half || W * .3) - .3, bw = ((G.half || W * .3) + .3) * 2; // the hem band is the body's, not the sleeves' at that height
        if (G.hemRib) s += rect('#000000', dk, '', bx0, G.hemY - G.hemRib, bw, G.hemRib + .2); else s += rect('#000000', dk * .7, '', bx0, G.hemY - 1, bw, 1.1);
        if (G.longSleeve) for (const side of [-1, 1]) s += rect('#000000', dk, '', side < 0 ? x0 : cx + (G.half || 0) + .6, y1 - (G.cuff || 2.5) - .8, side < 0 ? (cx - (G.half || 0) - .6) - x0 : x1 - (cx + (G.half || 0) + .6), (G.cuff || 2.5) + 1.6);
        if (!G.hood) s += `<ellipse cx="${n3(cx)}" cy="${n3((G.neckY || 3) * .55)}" rx="${n3((G.neckHalf || 3.5) + .6)}" ry="${n3((G.neckY || 3) * .75)}" fill="#000000" opacity="${n3(dk * .5)}"/>`;
      }
      defs += `<filter id="${pid}-wr" x="-.1" y="-.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation=".45"/></filter>`;
      out += `<g filter="url(#${pid}-wr)">${s}</g>`;
    }
  }
  const washDefs = defs, washOut = out;
  if (d?.on && d.amount > 0) {
    const P2 = distressParts(d.amount, d.focus || 'all'), a = d.amount / 100, r = rnd(view === 'back' ? 29 : 17), thread = lum > .7 ? '#d9d4c7' : '#efeadf';
    const hole = (x, y, rx, ry, threads = 0) => { let t = ''; for (let i = 0; i < threads; i++) { const ty = y - ry * .55 + (i + .5) * (ry * 1.1 / threads); t += `<path d="M ${n3(x - rx * .9)} ${n3(ty)} Q ${n3(x + (r() - .5) * rx * .4)} ${n3(ty + (r() - .5) * ry * .3)} ${n3(x + rx * .9)} ${n3(ty + (r() - .5) * .05)}" stroke="${thread}" stroke-width="${n3(.016 + r() * .012)}" fill="none" opacity=".9"/>`; } return `<path d="${jag(r, x, y, rx * 1.25, ry * 1.35)}" fill="#ffffff" opacity=".28"/><path d="${jag(r, x, y, rx, ry)}" fill="#141210" opacity=".88"/>${t}`; };
    // the wear itself: sanded, lighter scuffing (knees and thighs on a bottom; hem and front body on a top)
    defs += `<filter id="${pid}-dn" x="-.2" y="-.2" width="1.4" height="1.4"><feTurbulence type="fractalNoise" baseFrequency=".8 5" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.4 -1.05"/><feComposite in2="SourceGraphic" operator="in"/></filter><radialGradient id="${pid}-dp"><stop offset="0" stop-color="#ffffff" stop-opacity=".34"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
    const wearAt = bottom ? [[legX[0], knee], [legX[1], knee], [legX[0], G.rise + 3], [legX[1], G.rise + 3], [legX[0], G.hemY - 3], [legX[1], G.hemY - 3]] : [[cx - (G.half || W * .3) * .45, G.hemY - 3.5], [cx + (G.half || W * .3) * .5, G.hemY - 2.5], [cx, (G.neckY || 3) + 6], [cx - (G.half || W * .3) * .7, (G.neckY || 3) + 9], [cx + (G.half || W * .3) * .3, (G.neckY || 3) + 12]];
    for (let i = 0; i < (bottom ? P2.abrasion : Math.ceil(P2.abrasion / 2)); i++) { /* a top wears less in patches than a bottom: its wear is mostly holes and edges */ const [ax, ay] = wearAt[i % wearAt.length], x = ax + (r() - .5) * .8, y = ay + (r() - .5) * .8, rw = 1 + r() * 1.1, rh = .45 + r() * .5; out += `<ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(rw * 1.2)}" ry="${n3(rh * 1.3)}" fill="url(#${pid}-dp)"/><ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(rw)}" ry="${n3(rh)}" fill="#ffffff" filter="url(#${pid}-dn)" opacity="${bottom ? .85 : .55}"/>`; }
    // edges: chewed nicks along the collar, hem and cuffs (a top), or the pocket openings, waistband and hems (a bottom)
    const edgePts = []; const n = P2.nicks;
    for (let i = 0; i < n; i++) {
      const pick = r();
      if (!bottom) {
        if (pick < .4) { const t = Math.PI * (.08 + r() * .84), nx = cx + Math.cos(t) * (G.neckHalf || 3.5) * .98, ny = (G.neckY || 3) * Math.sin(t) * .98 + .1; edgePts.push([nx, ny + .12]); }
        else if (pick < .8 || !G.longSleeve) edgePts.push([cx + (r() - .5) * 2 * (G.half || W * .3) * .92, G.hemY - .18]);
        else edgePts.push([(r() < .5 ? x0 + 1 + r() * 2.5 : x1 - 1 - r() * 2.5), y1 - .2]);
      } else {
        if (pick < .3) edgePts.push([legX[r() < .5 ? 0 : 1] + (r() - .5) * W * .2, G.hemY - .15]);
        else if (pick < .6) edgePts.push([cx + (r() < .5 ? -1 : 1) * W * (.28 + r() * .1), (G.waistband || 1.5) + .6 + r() * 1.8]);
        else edgePts.push([cx + (r() - .5) * W * .8, (G.waistband || 1.5) - .1]);
      }
    }
    for (const [ex, ey] of edgePts) out += hole(ex, ey, .1 + r() * .2, .06 + r() * .1, r() < .4 ? 1 : 0);
    // pinholes: small clusters (near the hem and across the body on a top; the thighs on a bottom)
    for (let c = 0; c < P2.pinholes; c++) {
      const [px, py] = bottom ? [legX[c % 2] + (r() - .5) * 2, G.rise + 4 + r() * (G.hemY - G.rise - 8)] : (c % 2 ? [cx + (r() - .5) * (G.half || W * .3) * 1.4, G.hemY - .8 - r() * 1.2] : [cx + (r() - .5) * (G.half || W * .3) * 1.2, (G.neckY || 3) + 3 + r() * 10]);
      const m = 3 + Math.round(r() * 4); for (let j = 0; j < m; j++) out += hole(px + (r() - .5) * 1.2, py + (r() - .5) * .6, .04 + r() * .06, .03 + r() * .04);
    }
    // holes on the body, and rips: a bottom's open knee with the white weft across; a top's tear low on the body
    const holeAt = bottom ? [[legX[0] - .6, G.rise + 6], [legX[1] + .5, G.rise + 9], [legX[0] + .4, knee + 3.5], [legX[1] - .4, G.rise + 4]] : [[cx - (G.half || W * .3) * .55, (G.neckY || 3) + 11], [cx + (G.half || W * .3) * .45, (G.neckY || 3) + 6], [cx + (G.half || W * .3) * .2, G.hemY - 5], [cx - (G.half || W * .3) * .15, (G.neckY || 3) + 15]];
    for (let i = 0; i < P2.holes; i++) { const [hx, hy] = holeAt[i % holeAt.length]; out += hole(hx + (r() - .5) * .6, hy + (r() - .5) * .6, .18 + r() * .25, .1 + r() * .14, 2); }
    for (let i = 0; i < P2.rips; i++) {
      const [rx0, ry0] = bottom ? [legX[i % 2] + (r() - .5) * .8, knee + (r() - .5) * .8] : [cx + (i ? -1 : 1) * (G.half || W * .3) * .35, G.hemY - 6 - r() * 3];
      const rw = bottom ? W * .1 + a * 1.2 : 1 + a, rh = bottom ? .55 + a * .5 : .35 + a * .3;
      out += `<path d="${jag(r, rx0, ry0, rw * 1.18, rh * 1.6, 16)}" fill="#ffffff" opacity=".3"/>` + hole(rx0, ry0, rw, rh, Math.round(5 + a * 6));
      // frayed fibres at the top and bottom edge of the rip
      for (let f = 0; f < 18; f++) { const fx = rx0 - rw + r() * rw * 2, top = r() < .5, fy = ry0 + (top ? -1 : 1) * rh * (.7 + r() * .25); out += `<line x1="${n3(fx)}" y1="${n3(fy)}" x2="${n3(fx + (r() - .5) * .15)}" y2="${n3(fy + (top ? 1 : -1) * (.12 + r() * .2))}" stroke="${thread}" stroke-width=".02" opacity=".85"/>`; }
    }
    // dirt: a few brown marks on heavy wear
    if (P2.dirt) { defs += `<filter id="${pid}-dd"><feGaussianBlur stdDeviation=".05"/></filter>`; let s = ''; for (let i = 0; i < P2.dirt; i++) s += `<circle cx="${n3(x0 + r() * W)}" cy="${n3(y0 + H * (.2 + r() * .75))}" r="${n3(.04 + r() * .12)}" fill="#6a4a2a" opacity="${n3(.25 + r() * .35)}"/>`; out += `<g filter="url(#${pid}-dd)" style="mix-blend-mode:multiply">${s}</g>`; }
    // a ragged hem: threads hanging past the bottom edge (drawn outside the garment's mask, so they show)
    if (P2.fringe) {
      const hems = bottom ? [[legX[0] - W * .16, legX[0] + W * .16, G.hemY], [legX[1] - W * .16, legX[1] + W * .16, G.hemY]] : [[cx - (G.half || W * .3) * .97, cx + (G.half || W * .3) * .97, G.hemY], ...(G.longSleeve ? [[x0 + .4, x0 + 3.2, y1], [x1 - 3.2, x1 - .4, y1]] : [])];
      const col = lum > .6 ? '#bdb6a6' : cloth;
      for (const [hx0, hx1, hy] of hems) for (let x = hx0; x < hx1; x += .5 / (1 + a * 2.5)) { if (r() > .35 + a * .6) continue; const len = .08 + r() * (.12 + a * .55); loose += `<path d="M ${n3(x)} ${n3(hy - .06)} q ${n3((r() - .5) * .1)} ${n3(len / 2)} ${n3((r() - .5) * .14)} ${n3(len)}" stroke="${col}" stroke-width="${n3(.02 + r() * .02)}" fill="none" opacity=".95"/>`; }
    }
  }
  if (!out && !loose) return '';
  if (layer === 'fringe') return loose ? `<g pointer-events="none" data-fringe="1">${loose}</g>` : '';
  if (layer === 'wash') return washOut ? `<defs>${washDefs}</defs><g${mask ? ` mask="url(#${mask})"` : ''} pointer-events="none" data-wash="${w.type}">${washOut}</g>` : '';
  if (layer === 'distress') return out.length > washOut.length ? `<defs>${defs.slice(washDefs.length)}</defs><g${mask ? ` mask="url(#${mask})"` : ''} pointer-events="none" data-distress="${d.amount}">${out.slice(washOut.length)}</g>` : '';
  return `<defs>${defs}</defs><g${mask ? ` mask="url(#${mask})"` : ''} pointer-events="none" data-wash="${w ? w.type : ''}" data-distress="${d?.on ? d.amount : 0}">${out}</g>${loose ? `<g pointer-events="none" data-fringe="1">${loose}</g>` : ''}`;
}
