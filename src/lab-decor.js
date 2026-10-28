// Decorations as the factory sees them: how big a graphic is on the garment in inches, whether that suits where it goes and how it is made,
// and what it costs per piece. Used by the studio (a layer measured with the ruler), the flats (placements already in inches), the
// decoration sheet and the bill of materials.
import { cleanRules } from './lab-library.js';

const r2 = v => Math.round(v * 100) / 100;
const fmt = v => `${r2(v)} in`;
// where a graphic usually goes, and the sizes that read well there (inches, width): the trade's usual ranges for menswear
export const PLACEMENTS = {
  'left chest': { label: 'Left chest', w: [2.5, 4], h: [0, 4], note: 'A left-chest mark reads at 3 to 4 in wide; a cue mark can go down to 2.5 in.' },
  'centre chest': { label: 'Centre chest', w: [4, 8], h: [0, 6], note: 'A centre-chest graphic usually runs 4 to 8 in wide, its top about 3 in below the collar.' },
  'full front': { label: 'Full front', w: [9, 12], h: [0, 14], note: 'A full-front print is 10 to 12 in wide on an adult size; wider runs into the side seams.' },
  'full back': { label: 'Full back', w: [10, 13], h: [0, 16], note: 'A full-back print is 11 to 13 in wide, its top 3 to 4 in below the collar.' },
  'back neck': { label: 'Back neck (nape)', w: [1.5, 3.5], h: [0, 2.5], note: 'A nape mark sits 1 to 2 in below the collar seam, 2 to 3.5 in wide.' },
  sleeve: { label: 'Sleeve', w: [2, 3.5], h: [0, 12], note: 'A sleeve graphic on a short sleeve is at most 3.5 in wide; a long sleeve takes a vertical run up to 12 in tall.' },
  hip: { label: 'Hip or hem', w: [2, 5], h: [0, 4], note: 'A hip or hem mark stays small, 2 to 5 in wide, clear of the hem by 1 in.' },
  thigh: { label: 'Thigh (pants)', w: [2.5, 6], h: [0, 8], note: 'A thigh graphic on a pant runs 2.5 to 6 in wide, 3 in or more below the pocket.' },
  'back pocket': { label: 'Back pocket', w: [1.5, 4], h: [0, 3], note: 'A back-pocket mark or patch is 1.5 to 4 in wide.' },
  'cap front': { label: 'Cap front', w: [2, 4.5], h: [0, 2.25], note: 'A cap-front mark is 2 to 4.5 in wide and at most 2.25 in tall, on the two front panels.' },
  'cap side': { label: 'Cap side', w: [1, 2.5], h: [0, 1.5], note: 'A cap-side mark is small: 1 to 2.5 in wide.' },
  bag: { label: 'Tote or bag front', w: [6, 12], h: [0, 12], note: 'A tote print runs 6 to 12 in wide, clear of the handles by 2 in.' }
};
export const placementKey = s => { const t = String(s || '').toLowerCase(); return Object.keys(PLACEMENTS).find(k => t.includes(k)) || (/chest band|front chest|front centre/.test(t) ? 'centre chest' : /full front/.test(t) ? 'full front' : /\bback\b/.test(t) ? 'full back' : /nape|neck/.test(t) ? 'back neck' : /sleeve|arm/.test(t) ? 'sleeve' : /thigh|leg/.test(t) ? 'thigh' : /hem|hip/.test(t) ? 'hip' : /cap|crown|visor/.test(t) ? 'cap front' : /left chest|chest/.test(t) ? 'left chest' : null); };

// → findings like the flats check: size against where it goes and how it is made
export function sizeFindings({ widthIn, heightIn, placement = null, rules = {}, base = 'screen print', techName = 'this technique', name = 'The graphic' }) {
  const out = [], r = cleanRules(rules, base), P = PLACEMENTS[placement];
  if (widthIn > r.maxW || heightIn > r.maxH) out.push({ level: 'fail', code: 'TOO_BIG', text: `${name} is ${fmt(widthIn)} × ${fmt(heightIn)}: ${techName} goes up to ${fmt(r.maxW)} × ${fmt(r.maxH)}. Make it smaller or choose another way to make it.` });
  if (P) {
    if (widthIn > P.w[1] * 1.15) out.push({ level: 'warn', code: 'WIDE_FOR_PLACE', text: `${fmt(widthIn)} wide is large for the ${P.label.toLowerCase()}. ${P.note}` });
    else if (widthIn < P.w[0] * .85) out.push({ level: 'warn', code: 'SMALL_FOR_PLACE', text: `${fmt(widthIn)} wide is small for the ${P.label.toLowerCase()}. ${P.note}` });
    else out.push({ level: 'info', code: 'PLACE_OK', text: `${fmt(widthIn)} wide suits the ${P.label.toLowerCase()} (${P.w[0]}–${P.w[1]} in).` });
    if (P.h[1] && heightIn > P.h[1] * 1.15) out.push({ level: 'warn', code: 'TALL_FOR_PLACE', text: `${fmt(heightIn)} tall is a lot for the ${P.label.toLowerCase()}: up to about ${fmt(P.h[1])}.` });
  }
  return out;
}

// what a decoration costs, before any factory quote: a setup (screens, digitising, a mould) shared over the order, and a price per piece by size,
// colours and stitches. Each technique can carry its own numbers in its rules (rules.cost); these are the starting points by base technique.
export const DECOR_COST = {
  'screen print': { setup: 2500, perSetup: 'screen', unit: 55, perColour: 22, perIn2: 0, bands: [1, 1.35, 1.8] },
  'puff print': { setup: 2800, perSetup: 'screen', unit: 75, perColour: 30, perIn2: 0, bands: [1, 1.35, 1.8] },
  'high-density print': { setup: 3200, perSetup: 'screen', unit: 85, perColour: 35, perIn2: 0, bands: [1, 1.4, 1.9] },
  'flock print': { setup: 2600, perSetup: 'screen', unit: 70, perColour: 30, perIn2: 0, bands: [1, 1.35, 1.8] },
  embroidery: { setup: 3500, perSetup: 'design', unit: 40, per1000: 18, perIn2: 0, bands: [1, 1, 1] },
  'heat transfer': { setup: 0, unit: 35, perIn2: 3, bands: [1, 1, 1] },
  'DTF transfer': { setup: 0, unit: 30, perIn2: 3.5, bands: [1, 1, 1] },
  'vinyl transfer': { setup: 0, unit: 40, perColour: 25, perIn2: 2, bands: [1, 1, 1] },
  'silicone transfer': { setup: 4500, perSetup: 'mould', unit: 70, perIn2: 6, bands: [1, 1, 1] },
  sublimation: { setup: 0, unit: 20, perIn2: 1.5, bands: [1, 1, 1] },
  'direct-to-garment': { setup: 0, unit: 80, perIn2: 4, bands: [1, 1, 1] },
  'woven jacquard': { setup: 3000, perSetup: 'design', unit: 45, perIn2: 4, bands: [1, 1.2, 1.5] },
  'chenille patch': { setup: 6000, perSetup: 'design', unit: 180, perIn2: 6, bands: [1, 1.3, 1.7] },
  'appliqué': { setup: 3000, perSetup: 'design', unit: 110, perIn2: 4, bands: [1, 1.3, 1.6] },
  'rubber print': { setup: 4500, perSetup: 'mould', unit: 90, perIn2: 5, bands: [1, 1.2, 1.5] },
  'leather patch': { setup: 3000, perSetup: 'die', unit: 120, perIn2: 8, bands: [1, 1.2, 1.5] },
  'metal plaque': { setup: 5000, perSetup: 'mould', unit: 180, perIn2: 10, bands: [1, 1.2, 1.5] },
  debossed: { setup: 2500, perSetup: 'die', unit: 50, perIn2: 0, bands: [1, 1.2, 1.5] },
  'laser etch': { setup: 1000, perSetup: 'file', unit: 45, perIn2: 1, bands: [1, 1, 1] },
  'jacquard knit': { setup: 5000, perSetup: 'program', unit: 0, perIn2: 0, bands: [1, 1, 1] },
  rhinestones: { setup: 2500, perSetup: 'template', unit: 100, perIn2: 15, bands: [1, 1, 1] },
  // an all-over print covers the panels before they are sewn: priced on the printed area, not by a placement band
  'all-over sublimation': { setup: 0, unit: 150, perIn2: .35, bands: [1, 1, 1] },
  'all-over screen print': { setup: 6000, perSetup: 'screen', unit: 250, perColour: 60, perIn2: .05, bands: [1, 1, 1] }
};
const band = w => (w <= 4 ? 0 : w <= 10 ? 1 : 2);
// → { unitCents, setupCents, perPieceCents, basis } for one decoration on one piece, at a planned quantity
export function decorationCost({ base = 'screen print', rules = {}, widthIn = 4, heightIn = 4, colours = 1, coverage = .6, qty = 300, calibration = null }) {
  const d = { ...(DECOR_COST[base] || DECOR_COST['screen print']), ...((rules && rules.cost) || {}) }, n = Math.max(1, Math.round(colours || 1)), area = Math.max(.25, widthIn * heightIn * Math.min(1, Math.max(.05, coverage)));
  let unit = d.unit + (d.perColour || 0) * (n - 1) + (d.perIn2 || 0) * area, setup = d.setup || 0, basis = [];
  if (base === 'embroidery') { const st = Math.round(area * ((rules && rules.density) || 1800) / 100) * 100; unit += (d.per1000 || 18) * st / 1000; basis.push(`about ${st.toLocaleString('en-US')} stitches`); }
  unit *= (d.bands || [1, 1, 1])[band(widthIn)] || 1;
  if (d.perSetup === 'screen') { setup *= n; basis.push(`${n} screen${n === 1 ? '' : 's'}`); } else if (d.perSetup && setup) basis.push(`one ${d.perSetup}`);
  if (d.perColour && base !== 'embroidery') basis.push(`${n} colour${n === 1 ? '' : 's'}`);
  if (d.perIn2) basis.push(`${r2(area)} sq in printed`);
  // the factories' own quotes for this technique move the starting figures towards what they really charge
  const k = calibration && calibration.n ? Math.min(3, Math.max(.3, Number(calibration.factor) || 1)) : 1;
  if (k !== 1) { unit *= k; setup *= k; basis.push(`×${k.toFixed(2)} from ${calibration.n} factory quote${calibration.n === 1 ? '' : 's'}`); }
  const q = Math.max(1, Math.round(qty || 300)), unitCents = Math.round(unit), setupCents = Math.round(setup);
  return { unitCents, setupCents, perPieceCents: Math.round(unitCents + setupCents / q), qty: q, basis: basis.join(', ') };
}
// a decoration line for the concept's costing and the pack's bill of materials
export const decorationLine = ({ name, technique, base, widthIn, heightIn, colours, pantones = [], cost, view = 'front', placement = '' }) => ({
  name: String(name || 'Decoration').slice(0, 60), technique: String(technique || base || '').slice(0, 60), base, widthIn: r2(widthIn), heightIn: r2(heightIn), colours, pantones: pantones.slice(0, 8), view, placement: String(placement).slice(0, 160),
  unitCents: cost.unitCents, setupCents: cost.setupCents, perPieceCents: cost.perPieceCents, qty: cost.qty, basis: cost.basis
});

// ---- one artwork size per group of garment sizes ----
// A print that reads well on a medium is lost on an XXL and crowds an XS, so factories keep one or two artwork sizes across the run.
// measures: {size: the garment's width there, e.g. the chest}; the graphic is scaled with it from the sample size and rounded to ¼ in.
export const GRADE_GROUPS = { 1: [['XS', 'S', 'M', 'L', 'XL', 'XXL']], 2: [['XS', 'S', 'M'], ['L', 'XL', 'XXL']], 3: [['XS', 'S'], ['M', 'L'], ['XL', 'XXL']] };
const q4 = v => Math.round(v * 4) / 4, q8 = v => Math.round(v * 8) / 8;
export function gradeArt({ w, h, measures = {}, sample = 'M', breaks = 2 }) {
  const groups = GRADE_GROUPS[breaks] || GRADE_GROUPS[2], base = Number(measures[sample]) || 0, aspect = h / w || 1;
  return groups.map(sizes => {
    const m = sizes.map(s => Number(measures[s])).filter(v => v > 0), avg = m.length ? m.reduce((a, b) => a + b, 0) / m.length : base;
    const ww = Math.max(.25, q4(base ? w * avg / base : w));
    return { sizes, w: ww, h: Math.max(.25, q8(ww * aspect)) };
  });
}
// the artwork size a garment size takes: its group's, or the placement's own size
export const gradeFor = (q, size) => (Array.isArray(q.grade) ? q.grade.find(g => g.sizes.includes(size)) : null) || { w: q.w, h: q.h };

// ---- the inks on each colourway ----
// An ink that does not stand off the garment (a black print on a black tee) is swapped for one that does; the rest stay as drawn.
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
const luminance = h => { const [r, g, b] = rgb(h).map(lin); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round((v + (rgb(b)[i] - v) * t) * 255).toString(16).padStart(2, '0')).join('');
export function suggestInks(colours = [], garment = '#ffffff', { min = 2.2 } = {}) {
  const dark = luminance(garment) < .18;
  return colours.map(c => {
    if (contrast(c, garment) >= min) return { from: c, to: c, why: 'Stands off the garment as drawn' };
    // step towards white on a dark garment (towards ink black on a light one) until it reads
    let to = c; for (let t = .15; t <= 1.001 && contrast(to, garment) < min; t += .15) to = mix(c, dark ? '#ffffff' : '#141416', Math.min(1, t));
    return { from: c, to, why: dark ? 'Too close to the garment: lightened so it reads' : 'Too close to the garment: darkened so it reads' };
  });
}

// ---- the factories' quotes, against what we estimated ----
// Each quote is kept with the estimate made for the same size, colours and quantity. The factor is the median of quote ÷ estimate, trusted more
// as quotes come in (a single quote moves the figure a third of the way), bounded so one odd quote cannot run away with it.
export function calibrationOf(quotes = []) {
  const r = quotes.map(q => Number(q.actualCents) / Number(q.estimateCents)).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!r.length) return null;
  const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2, trust = Math.min(1, r.length / 3);
  return { n: r.length, median: Math.round(med * 100) / 100, factor: Math.round(Math.min(3, Math.max(.3, 1 + (med - 1) * trust)) * 100) / 100 };
}
