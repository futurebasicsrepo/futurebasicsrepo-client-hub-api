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
  { id: 'enzyme', label: 'Enzyme wash', group: 'Soft', how: 'Enzyme (cellulase) wash: softens the hand and lifts the colour slightly and evenly; less wear than stones.', look: { fade: .1, mottle: [.03, .08] } },
  { id: 'garment-dye', label: 'Garment dye', group: 'Dye', how: 'Garment dyed after sewing: colour takes deeper at the seams and edges, with a soft washed-in look.', look: { fade: .05, edges: .28 } },
  { id: 'pigment', label: 'Pigment dye wash', group: 'Dye', how: 'Pigment dyed and washed down: a chalky vintage colour, faded high points and darker seams.', look: { fade: .18, edges: .3, points: .15 } },
  { id: 'overdye', label: 'Overdye / tint', group: 'Dye', how: 'Overdyed or tinted in a second bath: a cast over the base colour.', look: { tint: ['#8a6a3a', .22] } },
  { id: 'stone', label: 'Stone wash', group: 'Stone', how: 'Stone wash with pumice: worn, uneven fade with lighter high points.', look: { fade: .12, mottle: [.025, .15], points: .18 } },
  { id: 'acid', label: 'Acid wash', group: 'Stone', how: 'Acid wash: pumice soaked in potassium permanganate (or bleach), tumbled dry for a marbled, high-contrast fade. Neutralise afterwards.', look: { fade: .14, marble: .7 } },
  { id: 'snow', label: 'Snow wash', group: 'Stone', how: 'Snow wash: small pumice soaked in potassium permanganate, tumbled for a speckled, frosty fade. Neutralise afterwards.', look: { fade: .1, speckle: .6, mottle: [.03, .08] } },
  { id: 'pp-spray', label: 'Potassium permanganate (PP) spray', group: 'Bleach', how: 'Potassium permanganate (PP) sprayed on the high points (front body or thighs, seat), then neutralised: brighter wear just where it rubs.', look: { points: .38 } },
  { id: 'bleach', label: 'Bleach wash', group: 'Bleach', how: 'Bleach wash (hypochlorite), neutralised: an even, strong lift of the colour.', look: { fade: .38, tint: ['#e8dcc0', .08] } },
  { id: 'mineral', label: 'Mineral wash', group: 'Bleach', how: 'Mineral wash: a cloudy, uneven fade with soft light patches.', look: { fade: .1, mottle: [.012, .32] } },
  { id: 'ozone', label: 'Ozone fade', group: 'Low impact', how: 'Ozone fade: colour lifted with ozone instead of bleach, less water and chemicals; an even vintage cast.', look: { fade: .16, tint: ['#d9c9a0', .06] } },
  { id: 'laser', label: 'Laser fade', group: 'Low impact', how: 'Laser fade on the high points instead of sandblasting or hand sanding (sandblasting is banned for worker safety).', look: { points: .38, mottle: [.04, .08] } },
  { id: 'sun', label: 'Sun-faded / vintage', group: 'Low impact', how: 'Sun-faded vintage wash: lighter across the shoulders and the top, fading down the body.', look: { fade: .06, top: .35 } }
];
export const WASH_IDS = WASHES.map(w => w.id);
export const STRENGTHS = [{ id: 'light', label: 'Light', k: .55 }, { id: 'medium', label: 'Medium', k: 1 }, { id: 'heavy', label: 'Heavy', k: 1.6 }];
export const washOf = id => WASHES.find(w => w.id === id) || WASHES[0];

// the distressing a slider of 0–100 asks for: how many worn patches, holes and frayed edges, and how far the hems fray
export function distressParts(amount = 0) {
  const a = Math.max(0, Math.min(100, Number(amount) || 0)) / 100;
  return { abrasion: Math.round(a * 6), holes: a < .25 ? 0 : Math.round((a - .15) * 5), frayHem: a >= .1, fray: Math.round(4 + a * 14), level: a < .34 ? 'light' : a < .67 ? 'medium' : 'heavy' };
}

export function cleanWash(w) {
  if (!w || typeof w !== 'object') return null;
  const type = WASH_IDS.includes(w.type) ? w.type : 'none';
  return type === 'none' ? null : { type, strength: STRENGTHS.some(s => s.id === w.strength) ? w.strength : 'medium' };
}
export function cleanDistress(d) {
  if (!d || typeof d !== 'object') return null;
  const amount = Math.round(Math.max(0, Math.min(100, Number(d.amount ?? 40) || 0)));
  return { on: Boolean(d.on), amount };
}

// for people: the factory's words, one line each
export function washWords(p = {}) {
  const out = [], w = cleanWash(p.wash), d = cleanDistress(p.distress);
  if (w) out.push(`${washOf(w.type).label}, ${w.strength}. ${washOf(w.type).how}`);
  if (d?.on && d.amount > 0) { const k = distressParts(d.amount); out.push(`Distressed, ${k.level} (${d.amount}/100): ${[k.abrasion ? `${k.abrasion} worn abrasion patch${k.abrasion === 1 ? '' : 'es'}` : '', k.holes ? `${k.holes} hole${k.holes === 1 ? '' : 's'} with loose threads` : '', k.frayHem ? 'frayed hem and cuff edges' : ''].filter(Boolean).join(', ')}. Hand sanded and cut before the wash; bartack any hole that could run.`); }
  return out;
}
// for the image model: a short phrase
export function washPrompt(p = {}) {
  const w = cleanWash(p.wash), d = cleanDistress(p.distress);
  return [w ? `${w.strength} ${washOf(w.type).label.toLowerCase()} finish` : '', d?.on && d.amount > 0 ? `${distressParts(d.amount).level} distressing (worn abrasion, ${distressParts(d.amount).holes ? 'small holes, ' : ''}frayed edges)` : ''].filter(Boolean).join(', ');
}

// ---- drawing it on the flat ----
// `box` is the drawing's box in inches ({x0, y0, x1, y1}); `mask` the id of a mask that is white where the garment is; `kind` 'top' | 'bottom' | …
// Returns SVG to lay over the drawing (inside the garment only), or ''.
const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const n3 = v => Math.round(v * 1000) / 1000;
export function washSvg(p = {}, { box, mask, pid = 'w', kind = 'top', view = 'front', cloth = '#ffffff', hems = null } = {}) {
  const w = cleanWash(p.wash), d = cleanDistress(p.distress); if (!box || (!w && !(d?.on && d.amount > 0))) return '';
  const { x0, y0, x1, y1 } = box, W = x1 - x0, H = y1 - y0, L = w ? washOf(w.type).look : {}, k = w ? STRENGTHS.find(s => s.id === w.strength).k : 0;
  const dark = (() => { const h = String(cloth).replace('#', ''); const n = parseInt(h.length === 6 ? h : 'ffffff', 16); return ((n >> 16 & 255) * .2126 + (n >> 8 & 255) * .7152 + (n & 255) * .0722) / 255; })();
  const lift = dark > .85 ? .5 : 1; // white cloth shows a wash less: it is drawn fainter
  let defs = '', out = '';
  const rect = (fill, op, extra = '') => `<rect x="${n3(x0)}" y="${n3(y0)}" width="${n3(W)}" height="${n3(H)}" fill="${fill}" opacity="${n3(Math.min(1, op))}"${extra}/>`;
  if (w) {
    if (L.fade) out += rect('#ffffff', L.fade * k * lift);
    if (L.tint) out += rect(L.tint[0], L.tint[1] * k);
    if (L.mottle) { defs += `<filter id="${pid}-wm" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="${L.mottle[0] * 22}" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${n3(1.6 * L.mottle[1] * k * lift)} ${n3(-.35 * L.mottle[1] * k)}"/></filter>`; out += rect('#ffffff', 1, ` filter="url(#${pid}-wm)"`); }
    if (L.marble) { defs += `<filter id="${pid}-wa" x="0" y="0" width="1" height="1"><feTurbulence type="turbulence" baseFrequency=".22 .3" numOctaves="4" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -5 ${n3(1.05 + .1 * k)}"/><feComponentTransfer><feFuncA type="linear" slope="${n3(L.marble * k * lift)}"/></feComponentTransfer></filter>`; /* thin light veins where the turbulence is lowest */ out += rect('#ffffff', 1, ` filter="url(#${pid}-wa)"`); }
    if (L.speckle) { const r = rnd(11); let s = ''; const n = Math.round(240 * L.speckle * k * (W * H) / 400); for (let i = 0; i < Math.min(n, 1600); i++) s += `<circle cx="${n3(x0 + r() * W)}" cy="${n3(y0 + r() * H)}" r="${n3(.05 + r() * .13)}" opacity="${n3(.45 + r() * .55)}"/>`; out += `<g fill="#ffffff" opacity="${n3(.75 * lift)}">${s}</g>`; }
    if (L.top) { defs += `<linearGradient id="${pid}-wt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="${n3(L.top * k * lift)}"/><stop offset=".65" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`; out += rect(`url(#${pid}-wt)`, 1); }
    if (L.points) {
      defs += `<radialGradient id="${pid}-wp"><stop offset="0" stop-color="#ffffff" stop-opacity="${n3(Math.min(.85, L.points * k * lift))}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
      const spots = kind === 'bottom' ? [[-.22, .38, .14, .2], [.22, .38, .14, .2], [-.2, .72, .1, .1], [.2, .72, .1, .1]] : [[0, .36, .3, .22], [-.36, .5, .06, .16], [.36, .5, .06, .16]];
      out += spots.map(([cx, cy, rx, ry]) => `<ellipse cx="${n3(x0 + W / 2 + cx * W)}" cy="${n3(y0 + cy * H)}" rx="${n3(rx * W)}" ry="${n3(ry * H)}" fill="url(#${pid}-wp)"/>`).join('');
    }
    if (L.edges) { defs += `<filter id="${pid}-we"><feMorphology in="SourceAlpha" operator="erode" radius=".35"/><feGaussianBlur stdDeviation=".25"/><feComposite in2="SourceAlpha" operator="out"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${n3(L.edges * k)} 0"/></filter>`; out += `<use href="#${pid}-b" filter="url(#${pid}-we)"/>`; }
  }
  if (d?.on && d.amount > 0) {
    const parts = distressParts(d.amount), r = rnd(view === 'back' ? 29 : 17), cx = x0 + W / 2;
    // where wear goes: across the front body and the hem on a top; the knees, thighs and pocket edges on a bottom
    const zones = kind === 'bottom' ? [[-.2, .55], [.2, .55], [-.22, .3], [.22, .3], [-.18, .78], [.18, .78], [.3, .12], [-.3, .12]] : [[-.18, .62], [.2, .7], [0, .5], [-.12, .82], [.22, .42], [-.25, .35], [.35, .6], [-.38, .62]];
    defs += `<filter id="${pid}-dn" x="-.2" y="-.2" width="1.4" height="1.4"><feTurbulence type="fractalNoise" baseFrequency=".8 5" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.4 -1.05"/><feComposite in2="SourceGraphic" operator="in"/></filter><radialGradient id="${pid}-dp"><stop offset="0" stop-color="#ffffff" stop-opacity=".32"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
    for (let i = 0; i < parts.abrasion; i++) { const [zx, zy] = zones[i % zones.length], x = cx + zx * W + (r() - .5) * .8, y = y0 + zy * H + (r() - .5) * .8, rw = 1 + r() * 1.1, rh = .45 + r() * .5; out += `<ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(rw * 1.1)}" ry="${n3(rh * 1.1)}" fill="url(#${pid}-dp)"/><ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(rw)}" ry="${n3(rh)}" fill="#ffffff" filter="url(#${pid}-dn)" opacity=".85"/>`; }
    for (let i = 0; i < parts.holes; i++) {
      const [zx, zy] = zones[(i + 2) % zones.length], x = cx + zx * W + (r() - .5) * .5, y = y0 + zy * H + (r() - .5) * .5, hw = .35 + r() * .55;
      let threads = ''; for (let t = 0; t < 3; t++) { const ty = y - .08 + t * .08; threads += `<path d="M ${n3(x - hw * .95)} ${n3(ty)} Q ${n3(x)} ${n3(ty + .06 * (t % 2 ? 1 : -1))} ${n3(x + hw * .95)} ${n3(ty)}" stroke="#f4f1e8" stroke-width=".018" fill="none" opacity=".85"/>`; }
      out += `<ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(hw + .06)}" ry=".22" fill="#ffffff" opacity=".35"/><ellipse cx="${n3(x)}" cy="${n3(y)}" rx="${n3(hw)}" ry=".16" fill="#1c1a18" opacity=".85"/>${threads}`;
    }
    if (parts.frayHem) {
      // short loose threads along the bottom edge (and a top's cuffs), clipped to the garment
      let f = '';
      for (const yh of (hems && hems.length ? hems : [y1])) { const yb = yh - .04; for (let x = x0; x < x1; x += 1.6 / parts.fray * 4) { const len = .14 + r() * .26 * (1 + d.amount / 60); f += `<line x1="${n3(x)}" y1="${n3(yb - len)}" x2="${n3(x + (r() - .5) * .12)}" y2="${n3(yb)}" stroke="#f4f1e8" stroke-width=".035" opacity=".9"/>`; } }
      out += f;
    }
  }
  if (!out) return '';
  return `<defs>${defs}</defs><g mask="url(#${mask})" pointer-events="none" data-wash="${w ? w.type : ''}" data-distress="${d?.on ? d.amount : 0}">${out}</g>`;
}
