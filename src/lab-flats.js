// Design Lab technical flats: a piece drawn as a measured flat (front and back), the way a factory reads it, with every logo and graphic placed in inches
// from the points a sample room measures from (the high point of the shoulder, the centre front, the waistband, the brim). Nothing here is drawn by an
// image model. Each piece is drawn from a professional flat sketch (src/flat-templates, from the flat-sketch pack; see scripts/flat-templates/build.mjs),
// scaled so its chest or waist and its length match the piece's measurements; the checks, the placements and the measurement table work from
// the measurements themselves. A style with no sketch (beanie, tote), or "Simple outline", is drawn from its points of measure.
// The same file runs in the page (served as /lab/flats.js) and on the service (the check and the spec sheet), so it uses neither the DOM nor Node.
// All lengths are inches. On the front flat the viewer's right is the wearer's left.
import { FLAT_TEMPLATES } from './lab-flat-templates.js';
import { FLAT_PARTS, PART_KINDS } from './lab-flat-parts.js';
export { FLAT_PARTS, PART_KINDS };

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const TOP = { chest: 'Chest width, 1 in below the armhole', length: 'Body length from the high point of the shoulder', shoulder: 'Shoulder width, seam to seam', sleeve: 'Sleeve length from the shoulder point', sleeveOpening: 'Sleeve opening, flat', armhole: 'Armhole, straight', neckWidth: 'Neck width, seam to seam', neckDropFront: 'Front neck drop', neckDropBack: 'Back neck drop', hemRib: 'Hem rib height', cuffRib: 'Cuff rib height', neckRib: 'Neck rib width' };
const BOTTOM = { waist: 'Waist, flat, top edge', hip: 'Hip, flat, at 7 in below the waistband', rise: 'Front rise, waistband included', inseam: 'Inseam', thigh: 'Thigh, flat, 1 in below the crotch', legOpening: 'Leg opening, flat', waistband: 'Waistband height', sweep: 'Sweep (hem width), flat' };
export const POM_NAMES = { ...TOP, ...BOTTOM, length: TOP.length, crownWidth: 'Crown width, front, flat', crownHeight: 'Crown height', brimLength: 'Brim length from the crown seam', brimWidth: 'Brim width', width: 'Width, flat', height: 'Height', cuff: 'Cuff height', handleDrop: 'Handle drop', handleWidth: 'Handle width' };
// a style's own name for a point of measure where the general one does not fit it (a skirt's length, a bikini's top width)
export const pomName = (style, k) => STYLES[style]?.names?.[k] || POM_NAMES[k] || k;
const topBase = (o, extra = {}) => ({ kind: 'top', base: o, grade: { chest: 1, length: 1, shoulder: .75, sleeve: o.sleeve > 12 ? .5 : .25, sleeveOpening: .25, armhole: .5, neckWidth: .25, neckDropFront: .125, neckDropBack: 0, hemRib: 0, cuffRib: 0, neckRib: 0 }, ...extra });
export const STYLES = {
  tee: { label: 'T-shirt', category: 'tops', ...topBase({ chest: 21, length: 28, shoulder: 18.5, sleeve: 8.5, sleeveOpening: 7.25, armhole: 9, neckWidth: 7.25, neckDropFront: 3.5, neckDropBack: 1, hemRib: 0, cuffRib: 0, neckRib: .875 }) },
  longsleeve: { label: 'Long-sleeve tee', category: 'tops', ...topBase({ chest: 21, length: 28, shoulder: 18.5, sleeve: 25, sleeveOpening: 4, armhole: 9, neckWidth: 7.25, neckDropFront: 3.5, neckDropBack: 1, hemRib: 0, cuffRib: 2.5, neckRib: .875 }) },
  crewneck: { label: 'Crewneck sweatshirt', category: 'tops', ...topBase({ chest: 22, length: 27, shoulder: 19.5, sleeve: 24.5, sleeveOpening: 4, armhole: 10, neckWidth: 7.5, neckDropFront: 3.25, neckDropBack: 1, hemRib: 2.75, cuffRib: 2.75, neckRib: 1 }) },
  hoodie: { label: 'Pullover hoodie', category: 'tops', ...topBase({ chest: 23, length: 27.5, shoulder: 20, sleeve: 25, sleeveOpening: 4, armhole: 10.5, neckWidth: 8, neckDropFront: 3.5, neckDropBack: 1, hemRib: 2.75, cuffRib: 2.75, neckRib: 0 }), hood: true, pocket: 'kangaroo' },
  ziphoodie: { label: 'Zip hoodie', category: 'tops', ...topBase({ chest: 23, length: 27.5, shoulder: 20, sleeve: 25, sleeveOpening: 4, armhole: 10.5, neckWidth: 8, neckDropFront: 3, neckDropBack: 1, hemRib: 2.75, cuffRib: 2.75, neckRib: 0 }), hood: true, zip: true, pocket: 'split' },
  jacket: { label: 'Zip jacket', category: 'outerwear', ...topBase({ chest: 24, length: 27, shoulder: 20, sleeve: 25.5, sleeveOpening: 4.5, armhole: 11, neckWidth: 7.5, neckDropFront: 3, neckDropBack: 1, hemRib: 2.5, cuffRib: 2.5, neckRib: 1.5 }), zip: true, pocket: 'welt' },
  pants: { label: 'Pants', category: 'bottoms', kind: 'bottom', base: { waist: 16.5, hip: 21.5, rise: 12, inseam: 30, thigh: 13, legOpening: 8.5, waistband: 1.5 }, grade: { waist: 1, hip: 1, rise: .375, inseam: 0, thigh: .5, legOpening: .25, waistband: 0 } },
  shorts: { label: 'Shorts', category: 'bottoms', kind: 'bottom', base: { waist: 16.5, hip: 22, rise: 12, inseam: 7, thigh: 13.5, legOpening: 12, waistband: 1.5 }, grade: { waist: 1, hip: 1, rise: .375, inseam: 0, thigh: .5, legOpening: .5, waistband: 0 } },
  cap: { label: 'Six-panel cap', category: 'headwear', kind: 'cap', base: { crownWidth: 8.5, crownHeight: 4.5, brimLength: 2.75, brimWidth: 7.5 }, grade: {}, oneSize: true },
  beanie: { label: 'Cuffed beanie', category: 'headwear', kind: 'beanie', base: { width: 9, height: 10.5, cuff: 3 }, grade: {}, oneSize: true },
  tote: { label: 'Tote bag', category: 'bags', kind: 'tote', base: { width: 15, height: 16, handleDrop: 11, handleWidth: 1 }, grade: {}, oneSize: true },
  // the rest of the flat-sketch pack: woven shirts, polos, sleeveless tops, vests, coats, and the women's range
  shirt: { label: 'Button-up shirt', category: 'tops', ...topBase({ chest: 22.5, length: 30, shoulder: 19, sleeve: 25, sleeveOpening: 4.75, armhole: 10, neckWidth: 6.75, neckDropFront: 3, neckDropBack: .75, hemRib: 0, cuffRib: 2.5, neckRib: 0 }) },
  shirtss: { label: 'Short-sleeve shirt', category: 'tops', ...topBase({ chest: 22.5, length: 29, shoulder: 19, sleeve: 9.5, sleeveOpening: 7.5, armhole: 10, neckWidth: 6.75, neckDropFront: 3, neckDropBack: .75, hemRib: 0, cuffRib: 0, neckRib: 0 }) },
  polo: { label: 'Polo', category: 'tops', ...topBase({ chest: 21.5, length: 28.5, shoulder: 18.5, sleeve: 9, sleeveOpening: 6.5, armhole: 9, neckWidth: 7, neckDropFront: 3, neckDropBack: .75, hemRib: 0, cuffRib: 1, neckRib: 0 }) },
  tank: { label: 'Tank', category: 'tops', ...topBase({ chest: 20, length: 27, shoulder: 14, sleeve: 0, sleeveOpening: 0, armhole: 10, neckWidth: 8, neckDropFront: 4, neckDropBack: 1.5, hemRib: 0, cuffRib: 0, neckRib: .5 }) },
  vest: { label: 'Vest', category: 'outerwear', ...topBase({ chest: 21, length: 25, shoulder: 14.5, sleeve: 0, sleeveOpening: 0, armhole: 11, neckWidth: 7.5, neckDropFront: 8, neckDropBack: 1, hemRib: 0, cuffRib: 0, neckRib: 0 }) },
  coat: { label: 'Coat', category: 'outerwear', ...topBase({ chest: 24, length: 40, shoulder: 20, sleeve: 26, sleeveOpening: 5.5, armhole: 11, neckWidth: 7.5, neckDropFront: 3, neckDropBack: 1, hemRib: 0, cuffRib: 0, neckRib: 0 }), pocket: 'welt' },
  dress: { label: 'Dress', category: 'dresses', ...topBase({ chest: 17.5, length: 38, shoulder: 14, sleeve: 0, sleeveOpening: 0, armhole: 8.5, neckWidth: 8, neckDropFront: 4.5, neckDropBack: 2, hemRib: 0, cuffRib: 0, neckRib: 0 }) },
  bodysuit: { label: 'Bodysuit', category: 'tops', ...topBase({ chest: 16.5, length: 25, shoulder: 13, sleeve: 0, sleeveOpening: 0, armhole: 8, neckWidth: 7.5, neckDropFront: 4.5, neckDropBack: 2, hemRib: 0, cuffRib: 0, neckRib: 0 }), names: { length: 'Body length from the high point of the shoulder to the crotch' } },
  swimsuit: { label: 'Swimsuit', category: 'tops', ...topBase({ chest: 15.5, length: 24, shoulder: 12, sleeve: 0, sleeveOpening: 0, armhole: 8, neckWidth: 8, neckDropFront: 5.5, neckDropBack: 4, hemRib: 0, cuffRib: 0, neckRib: 0 }), names: { length: 'Body length from the top of the strap to the crotch' } },
  bikini: { label: 'Bikini', category: 'tops', ...topBase({ chest: 13, length: 20, shoulder: 10, sleeve: 0, sleeveOpening: 0, armhole: 6, neckWidth: 6, neckDropFront: 6, neckDropBack: 6, hemRib: 0, cuffRib: 0, neckRib: 0 }), names: { chest: 'Top width, flat, under the cups', length: 'Set height, top of the strap to the bottom of the brief', shoulder: 'Strap spread at the top', armhole: 'Side height of the top', neckWidth: 'Neck opening between the straps' } },
  bra: { label: 'Sports bra', category: 'tops', ...topBase({ chest: 14.5, length: 11, shoulder: 11, sleeve: 0, sleeveOpening: 0, armhole: 7, neckWidth: 7, neckDropFront: 4, neckDropBack: 4, hemRib: 1.5, cuffRib: 0, neckRib: 0 }), names: { hemRib: 'Underband height' } },
  cami: { label: 'Cami top', category: 'tops', ...topBase({ chest: 16.5, length: 18, shoulder: 11, sleeve: 0, sleeveOpening: 0, armhole: 8, neckWidth: 8, neckDropFront: 4, neckDropBack: 2.5, hemRib: 0, cuffRib: 0, neckRib: 0 }) },
  skirt: { label: 'Skirt', category: 'bottoms', kind: 'bottom', skirt: true, names: { length: 'Length from the top of the waistband' }, base: { waist: 14.5, hip: 19.5, length: 17, sweep: 22, waistband: 1.25 }, grade: { waist: 1, hip: 1, length: .25, sweep: 1, waistband: 0 } },
  leggings: { label: 'Leggings', category: 'bottoms', kind: 'bottom', base: { waist: 13, hip: 16.5, rise: 10.5, inseam: 28, thigh: 9.5, legOpening: 4.25, waistband: 3 }, grade: { waist: 1, hip: 1, rise: .375, inseam: 0, thigh: .5, legOpening: .25, waistband: 0 } },
  bucket: { label: 'Bucket hat', category: 'headwear', kind: 'cap', bucket: true, base: { crownWidth: 9.5, crownHeight: 3.75, brimLength: 2.25, brimWidth: 13 }, grade: {}, oneSize: true }
};
export const FITS = { slim: 'Slim', regular: 'Regular', relaxed: 'Relaxed', boxy: 'Boxy', oversized: 'Oversized', wide: 'Wide' };
const FIT_TOP = { slim: { chest: -1.5, shoulder: -.5 }, regular: {}, relaxed: { chest: 1.5, shoulder: 1.5, drop: true }, boxy: { chest: 2.5, length: -1.5, shoulder: 3, drop: true }, oversized: { chest: 3.5, length: 1, shoulder: 3.5, drop: true, sleeve: .5 }, wide: { chest: 2.5, shoulder: 2.5, drop: true } };
const FIT_BOTTOM = { slim: { thigh: -1, legOpening: -1.5, hip: -.5 }, regular: {}, relaxed: { thigh: 1.5, legOpening: 1.5, hip: .5 }, boxy: { thigh: 1.5, legOpening: 2 }, oversized: { thigh: 2.5, legOpening: 3, hip: 1 }, wide: { thigh: 3, legOpening: 3.5, hip: 1 } };
const r8 = v => Math.round(v * 8) / 8;
export const fmt = v => { const n = r8(Math.abs(v)), w = Math.floor(n), f = n - w, fr = { 0: '', .125: '⅛', .25: '¼', .375: '⅜', .5: '½', .625: '⅝', .75: '¾', .875: '⅞' }[f] ?? ''; return `${w || !fr ? w : ''}${fr} in`; };
export const fmtCm = v => `${fmt(v)} (${(Math.abs(v) * 2.54).toFixed(1)} cm)`;

// ---- what the concept is: the style, the fit and the details, read from its words ----
export function detectStyle(c = {}) {
  const t = [c.name, c.spec?.silhouette, c.spec?.description, ...(c.spec?.details || [])].join(' ').toLowerCase(), cat = c.category;
  const has = re => re.test(t);
  let style = null;
  if (cat === 'headwear') style = has(/beanie|knit hat|watch cap|toque/) ? 'beanie' : has(/bucket/) ? 'bucket' : 'cap';
  else if (cat === 'bags') style = 'tote';
  else if (has(/bikini|two[- ]piece swim/)) style = 'bikini';
  else if (has(/swimsuit|one[- ]piece|swimwear|bathing suit|maillot/)) style = 'swimsuit';
  else if (has(/bodysuit|leotard/)) style = 'bodysuit';
  else if (cat === 'bottoms' || (cat === 'tailoring' && has(/trouser|pant|short|skirt/))) style = has(/skirt|skort/) ? 'skirt' : has(/legging/) ? 'leggings' : has(/\bshorts?\b|jort/) ? 'shorts' : 'pants';
  else if (cat === 'dresses') style = has(/skirt|skort/) ? 'skirt' : 'dress';
  else if (has(/sports bra|bralette|bra top/)) style = 'bra';
  else if (has(/\bcami\b|camisole|tube top|corset|bustier/)) style = 'cami';
  else if (has(/\bvest\b|gilet|waistcoat/) && !has(/vest top/)) style = 'vest';
  else if (cat === 'outerwear' || cat === 'tailoring') style = has(/\bcoat\b|overcoat|topcoat|parka|trench|\bmac\b/) ? 'coat' : has(/hood/) ? 'ziphoodie' : 'jacket';
  else if (['tops', 'knitwear'].includes(cat)) style = has(/zip/) && has(/hood/) ? 'ziphoodie' : has(/hood/) ? 'hoodie' : has(/polo|rugby|johnny collar/) ? 'polo' : has(/crew|sweatshirt|sweater|jumper|fleece|knit/) ? 'crewneck' : has(/tank|sleeveless|singlet|muscle/) ? 'tank' : has(/(?<!t-)\bshirt\b|overshirt|shacket|button[- ]?(up|down)|camp collar|oxford|flannel|western/) ? (has(/short[- ]sleeve|camp|bowling|cuban/) ? 'shirtss' : 'shirt') : has(/long[- ]?sleeve|\bl\/s\b|longsleeve/) ? 'longsleeve' : has(/jacket|coach|bomber/) ? 'jacket' : 'tee';
  if (!style) return null;
  const fit = has(/oversiz/) ? 'oversized' : has(/boxy|cropped and wide|box fit/) ? 'boxy' : has(/wide[- ]leg|\bwide\b/) && STYLES[style].kind === 'bottom' ? 'wide' : has(/relaxed|loose|baggy/) ? 'relaxed' : has(/slim|fitted|tapered/) ? 'slim' : 'regular';
  const options = {
    cropped: has(/crop/), pleats: has(/double[- ]pleat/) ? 2 : has(/pleat/) ? 1 : 0, chestPocket: has(/chest pocket|patch pocket/), noPocket: has(/no pocket|pocketless/),
    rib: !has(/raw hem|cut[- ]off|no rib/), drawcord: !has(/no drawcord|without drawcord/) && STYLES[style].kind === 'top' ? has(/drawcord|drawstring/) || Boolean(STYLES[style].hood) : has(/drawcord|drawstring|elastic/)
  };
  return { style, fit, options, template: defaultTemplate(style, fit, t, [c.name, c.spec?.silhouette, c.spec?.fabric].join(' ')) };
}

// ---- the sketches: which one a piece is drawn from ----
// The concept's words (its name, silhouette, fabric, fit and details) are read for what they say about the piece: its family (jeans, chinos,
// sweatpants, track pants…), its silhouette (flared, straight, wide, slim…) and its features (cargo pockets, double knee, pleats…). Every sketch of
// the style is scored: a feature the sketch has that the concept never asked for counts against it, so a plain boot-cut twill pant is not drawn
// from a skinny double-knee cargo just because it shares a word. The routes then let the vision model confirm the pick from the concept's picture.
const SYN = [[/boot[- ]?cut|flare|bell[- ]?bottom/, 'flared'], [/skinny/, 'skinny'], [/\bslim\b|tapered|narrow/, 'slim'], [/straight[- ]leg|\bstraight\b/, 'straight'], [/wide[- ]leg|\bwide\b/, 'wide'], [/baggy|loose/, 'baggy'], [/balloon|barrel/, 'balloon'], [/relaxed/, 'relaxed'],
  [/denim|\bjeans?\b/, 'jeans'], [/chino|twill|khaki/, 'chinos'], [/sweatpant|fleece|jogger|french terry|loopback/, 'sweatpants'], [/track|nylon|shell|ripstop/, 'track'], [/\btrouser/, 'trousers'], [/jort/, 'jorts'],
  [/cargo/, 'cargo'], [/carpenter|hammer loop|tool pocket/, 'carpenter'], [/double[- ]knee|knee patch/, 'double-knee'], [/painter/, 'painter'], [/work ?(pant|wear|jean|short|trouser)|workwear/, 'work'], [/pleat/, 'pleated'], [/tailor|\bsuit\b/, 'tailored'], [/elastic/, 'elastic-waist'], [/drawcord|drawstring/, 'drawcord'],
  [/distress|ripped|destroy/, 'distressed'], [/five[- ]pocket|5[- ]pocket/, 'five-pocket'], [/crop/, 'cropped'], [/raglan/, 'raglan'], [/hood/, 'hood'], [/\bzip/, 'zip'], [/bomber|varsity|ma-?1/, 'bomber'], [/trucker|chore|overshirt|denim jacket/, 'trucker'], [/funnel|mock neck/, 'funnel'], [/mesh/, 'mesh'], [/running|\brun\b/, 'running'], [/lined/, 'lined'], [/stripe/, 'stripe'], [/panel/, 'paneled'], [/cuff/, 'cuffed'], [/heavy/, 'heavy'], [/oversiz/, 'oversized'], [/boxy/, 'boxy'], [/v[- ]?neck/, 'v-neck'], [/\blong\b/, 'long'], [/curved hem/, 'curved'], [/split hem/, 'split'], [/bike/, 'bike'], [/lounge/, 'lounge'], [/boxer/, 'boxer'], [/retro/, 'retro'], [/contrast/, 'contrast'], [/zip pocket/, 'zip-pocket'], [/side stripe/, 'side-stripe'], [/three stripe|3 stripe/, 'three-stripe']];
const SYN_TOKENS = new Set(SYN.map(x => x[1]));
const FAMILY = new Set(['jeans', 'chinos', 'sweatpants', 'joggers', 'track', 'trousers', 'jorts', 'pants', 'shorts', 'tee', 'hoodie', 'jacket', 'cap', 'shirt', 'polo', 'tank', 'vest', 'coat', 'dress', 'skirt', 'leggings', 'bra', 'cami', 'bikini', 'swimsuit', 'bodysuit', 'briefs']);
const SILHOUETTE = new Set(['flared', 'skinny', 'slim', 'straight', 'wide', 'baggy', 'balloon', 'relaxed', 'tapered', 'cropped', 'oversized', 'boxy', 'long']);
const SAME = { joggers: 'sweatpants', sweat: 'sweatpants', jogger: 'sweatpants', jean: 'jeans', chino: 'chinos', trouser: 'trousers', 'wide-leg': 'wide', 'zip-pocket': 'zip', 'side-stripe': 'stripe', 'three-stripe': 'stripe', 'curved-hem': 'curved', 'split-hem': 'split', 'contrast-panel': 'paneled', 'elastic-waist': 'elastic-waist', 'v-waist': 'v-waist', 'double-knee': 'double-knee', 'five-pocket': 'five-pocket', 'six-panel': 'six-panel', 'training': 'running', 'basketball': 'mesh', 'crew': 'crewneck' };
const PLAIN = new Set(['classic', 'the', 'and', 'with', 'top', 'cut', 'leg', 'hem', 'waist']);
// the concept's words as the tokens the sketches are scored on
// `strong` is the part of the words that decides the family (the name, the silhouette and the fabric): a ripstop pocket lining in the description does not make a twill pant a track pant
export function conceptTokens(words = '', strong = null) {
  const t = String(words).toLowerCase(), st = strong == null ? t : String(strong).toLowerCase(), out = new Set();
  for (const [re, tok] of SYN) if (FAMILY.has(tok) ? re.test(st) : re.test(t)) out.add(tok);
  // a word the rules above govern (work, wide, cargo…) only counts through its rule, so "works for rain" is not workwear
  for (const w of t.split(/[^a-z-]+/)) { const k = SAME[w] || w; if (w.length > 3 && !COMMON.has(w) && !SYN_TOKENS.has(k)) out.add(k); }
  return out;
}
const labelTokens = label => label.toLowerCase().split(/\s+/).map(w => SAME[w] || w).filter(w => w && !PLAIN.has(w));
// [template, words in the concept that call for it, fits it suits]: strong hints, on top of the scoring
const TEMPLATE_PICK = [
  ['tee-raglan', /raglan/], ['tee-vneck', /v[- ]?neck/], ['tee-boxy', /boxy|crop/, ['boxy']], ['tee-oversized', /oversiz/, ['oversized', 'relaxed', 'wide']], ['tee-classic'],
  ['ls-crew'],
  ['crew-raglan', /raglan/], ['crew-heavy', /heavy|boxy|oversiz/, ['boxy', 'oversized', 'wide']], ['crew-classic'],
  ['hood-boxy', /boxy|oversiz|crop/, ['boxy', 'oversized', 'relaxed', 'wide']], ['hood-classic'],
  ['zip-cropped', /crop|boxy/, ['boxy']], ['zip-classic'],
  ['jk-bomber', /bomber|varsity|ma-?1/], ['jk-track', /track|windbreaker|anorak/], ['jk-trucker', /trucker|denim jacket|chore|overshirt|work jacket|collar/], ['jk-funnel', /funnel|mock neck|fleece/], ['jk-zip'],
  ['pt-jogger', /jogger|sweatpant|track pant|fleece/], ['pt-jean', /jean|denim|five[- ]pocket|5[- ]pocket/], ['pt-cargo', /cargo/], ['pt-pleat', /pleat|trouser|tailored/], ['pt-wide', /wide/, ['wide']], ['pt-chino'],
  ['sh-denim', /denim|jort/], ['sh-cargo', /cargo/], ['sh-pleat', /pleat/], ['sh-chino', /chino|twill|walk/], ['sh-sweat'],
  ['cap-6panel']
];
export const templatesFor = style => FLAT_TEMPLATES.filter(t => t.style === style).map(t => ({ id: t.id, label: t.label }));
// every sketch of the style with its score against the concept's words, best first
export function rankTemplates(style, fit = 'regular', words = '', strong = null) {
  const all = FLAT_TEMPLATES.filter(t => t.style === style); if (!all.length) return [];
  const said = conceptTokens(words, strong), hints = TEMPLATE_PICK.filter(([id]) => all.some(t => t.id === id)), saidFamily = [...said].find(w => FAMILY.has(w) && !['pants', 'shorts'].includes(w));
  return all.map((t, i) => {
    let score = 0; const why = [];
    const h = hints.find(([id]) => id === t.id); if (h) { if (h[1] && h[1].test(String(words).toLowerCase())) { score += 4; why.push('named'); } if (h[2] && h[2].includes(fit)) { score += 1; why.push('fit'); } if (!h[1] && !h[2]) score += .5; }
    for (const w of labelTokens(t.label)) {
      if (FAMILY.has(w)) { if (['pants', 'shorts'].includes(w)) continue; if (said.has(w)) { score += 2; why.push(w); } else if (saidFamily) { score -= 3; why.push('not ' + w); } continue; }
      if (said.has(w)) { score += SILHOUETTE.has(w) ? 3 : 4; why.push(w); } else { score -= 2; why.push('no ' + w); }
    }
    return { id: t.id, label: t.label, score, why, order: i };
  }).sort((a, b) => b.score - a.score || a.order - b.order);
}
// the sketches worth putting to the vision model: the best few, and any the words do not argue against
export const candidateTemplates = ranked => ranked.filter((t, i) => i < 4 || t.score >= 0).slice(0, 10);
export function defaultTemplate(style, fit = 'regular', words = '', strong = null) {
  const own = TEMPLATE_PICK.filter(([id]) => FLAT_TEMPLATES.some(t => t.id === id && t.style === style)), all = FLAT_TEMPLATES.filter(t => t.style === style); if (!all.length) return null;
  const ranked = rankTemplates(style, fit, words, strong);
  // nothing in the words says anything: the style's own default
  if (ranked[0] && ranked[0].score <= .5 && !ranked[0].why.some(w => !/^(no |not )/.test(w))) return (own.find(([, , fits]) => fits && fits.includes(fit)) || own.find(([, re, fits]) => !re && !fits) || own[0] || [all[0].id])[0];
  return ranked[0].id;
}
const COMMON = new Set(['with', 'from', 'shirt', 'tee', 'pants', 'shorts', 'jacket', 'dress', 'skirt', 'vest', 'coat', 'polo', 'tank', 'hoodie', 'classic', 'regular', 'that', 'this', 'line', 'future', 'basics', 'cotton', 'jersey', 'fleece', 'twill', 'piece']);
// a sketch's own proportions: a cropped tee, a maxi dress or a long short is drawn shorter or longer than the usual sketch of its style, so a
// piece drawn from it starts that much shorter or longer than the style's standard (the sketches are stylised, so the comparison is with the
// style's middle sketch, not with real inches), and the drawing is not stretched back to the standard
const REF = {};
const refRatio = style => { if (!(style in REF)) { const r = FLAT_TEMPLATES.filter(t => t.style === style && t.views.front.ratio).map(t => t.views.front.ratio).sort((a, b) => a - b); REF[style] = r.length ? r[Math.floor(r.length / 2)] : null; } return REF[style]; };
export function fitToTemplate(p) {
  const t = templateOf(p), v = t?.views?.front, S = STYLES[p.style], ref = refRatio(p.style), base = defaultParams(p.style, p.fit, p.options)?.m; if (!v?.ratio || !S || !ref || !base) return p;
  let k = Math.min(Math.max(v.ratio / ref, .45), 2.4); if (Math.abs(k - 1) < .08) k = 1;
  const m = { ...p.m };
  if (S.kind === 'top' && base.length) m.length = r8(base.length * k);
  else if (S.kind === 'bottom' && S.skirt) m.length = r8(base.length * k);
  else if (S.kind === 'bottom') m.inseam = r8(Math.max(1, (base.rise + base.inseam) * k - (m.rise || base.rise)));
  return { ...p, m };
}
// the sketch a piece is drawn from: the one it names, or its style's default; 'none' is the simple outline
export function templateOf(p) {
  if (p.template === 'none') return null;
  return FLAT_TEMPLATES.find(t => t.id === p.template && t.style === p.style) || FLAT_TEMPLATES.find(t => t.id === defaultTemplate(p.style, p.fit)) || null;
}
// how a sketch's view lines up with the piece: its origin (the HPS on the centre line, the top of the waistband, the brim seam) and its
// scale across (chest or waist) and down (length, held within 12% of the scale across so the sketch is never visibly stretched), in
// sketch units an inch; box is the view in inches
export function drawingOf(p, view = 'front', size = p.size || 'M') {
  const t = templateOf(p), v = t?.views[view]; if (!v) return null;
  const m = measurementsFor(p, size), kind = STYLES[p.style].kind, clamp = (a, x) => Math.min(Math.max(a, x * .88), x * 1.12);
  let sx, sy, oy;
  if (kind === 'top') { sx = v.chest / m.chest; oy = v.hpsY; sy = clamp((v.hemY - v.hpsY) / m.length, sx); }
  else if (kind === 'bottom') { sx = v.waist / m.waist; oy = v.topY; sy = clamp((v.hemY - v.topY) / (STYLES[p.style].skirt ? m.length : m.rise + m.inseam), sx); }
  else { sx = v.width / m.crownWidth; oy = v.seamY; sy = sx; }
  if (!(sx > 0 && sy > 0)) return null;
  const [bx, by, bw, bh] = v.box;
  return { t, v, sx, sy, ox: v.cf, oy, box: { x0: (bx - v.cf) / sx, y0: (by - oy) / sy, x1: (bx + bw - v.cf) / sx, y1: (by + bh - oy) / sy } };
}
export function defaultParams(style, fit = 'regular', options = {}) {
  const S = STYLES[style]; if (!S) return null;
  const m = { ...S.base }, mod = (S.kind === 'top' ? FIT_TOP : S.kind === 'bottom' ? FIT_BOTTOM : {})[fit] || {};
  for (const [k, v] of Object.entries(mod)) if (typeof v === 'number' && k in m) m[k] = r8(m[k] + v);
  if (S.kind === 'top' && options.cropped) m.length = r8(m.length - 4);
  if (S.kind === 'top' && options.rib === false) { m.hemRib = 0; if (style !== 'longsleeve') m.cuffRib = 0; }
  return { style, fit, size: 'M', m, options: { drop: Boolean(mod.drop), pleats: 0, chestPocket: false, noPocket: false, drawcord: Boolean(S.hood), ...options, ...(mod.drop ? { drop: true } : {}) } };
}
// the measurements of one size, graded from the sample size (M)
export function measurementsFor(p, size = 'M') {
  const S = STYLES[p.style], step = SIZES.indexOf(size) - SIZES.indexOf('M'), out = {};
  for (const [k, v] of Object.entries(p.m)) out[k] = r8(v + (S.oneSize ? 0 : (S.grade[k] || 0) * step));
  return out;
}
export function pomTable(p) {
  const S = STYLES[p.style], sizes = S.oneSize ? ['One size'] : SIZES;
  return Object.keys(p.m).filter(k => !(['hemRib', 'cuffRib', 'neckRib', 'sleeve', 'sleeveOpening'].includes(k) && !p.m[k])).map((k, i) => ({
    code: String.fromCharCode(65 + i), key: k, name: pomName(p.style, k), tolerance: p.m[k] >= 10 ? .5 : p.m[k] >= 3 ? .25 : .125,
    values: sizes.map(s => ({ size: s, value: S.oneSize ? p.m[k] : measurementsFor(p, s)[k] }))
  }));
}

// ---- the drawing ----
const cubic = (a, c1, c2, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; });
const mirror = pts => pts.map(([x, y]) => [-x, y]);
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
// → { outline, parts: [{d, kind}], regions: {name: polygon}, keepouts: [{name, poly, why, level}], anchor, bounds, pom: [{key, from, to}] }
export function geometry(p, view = 'front', size = p.size || 'M') {
  const S = STYLES[p.style], m = measurementsFor(p, size), o = p.options || {};
  if (S.kind === 'top') return topGeom(S, m, o, view);
  if (S.kind === 'bottom') return bottomGeom(S, m, o, view);
  if (S.kind === 'cap') return capGeom(m, view);
  if (S.kind === 'beanie') return beanieGeom(m, view);
  return toteGeom(m, view);
}
function topGeom(S, m, o, view) {
  const half = m.chest / 2, nw = m.neckWidth / 2, drop = o.drop ? 2.25 : 0, sh = Math.max(m.shoulder / 2, nw + 2), slope = o.drop ? .75 : 1.25;
  const nd = view === 'back' ? m.neckDropBack : m.neckDropFront, L = m.length;
  const SP = [sh, slope], long = m.sleeve > 12, th = (long ? 62 : 24) * Math.PI / 180, dir = [Math.cos(th), Math.sin(th)], nrm = [-Math.sin(th), Math.cos(th)];
  const ST = add(SP, dir, m.sleeve), SB = add(ST, nrm, m.sleeveOpening), UA = [half, slope + m.armhole + drop * .3];
  // the outline as one closed polygon: left hem, up the left side, the left sleeve, the left shoulder, the neckline, the right shoulder, the right sleeve, down to the right hem
  const poly = [[-half, L], [-UA[0], UA[1]], [-SB[0], SB[1]], [-ST[0], ST[1]], [-SP[0], SP[1]], [-nw, 0], ...mirror(cubic([nw, 0], [nw, nd * .65], [nw * .55, nd], [0, nd])).slice(1), ...cubic([0, nd], [nw * .55, nd], [nw, nd * .65], [nw, 0]).slice(1), SP, ST, SB, UA, [half, L]];
  const bodyPoly = [[-half, L], [-UA[0], UA[1]], [-SP[0], SP[1]], [-nw, 0], ...mirror(cubic([nw, 0], [nw, nd * .65], [nw * .55, nd], [0, nd])).slice(1), ...cubic([0, nd], [nw * .55, nd], [nw, nd * .65], [nw, 0]).slice(1), SP, UA, [half, L]];
  const sleeveR = [SP, ST, SB, UA], sleeveL = mirror(sleeveR);
  const parts = [], keepouts = [], P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
  const seam = (pts, kind = 'seam') => parts.push({ d: P(pts), kind });
  // the hood lies behind the neck (drawn first, under the body)
  if (S.hood) {
    if (view === 'front') { parts.push({ d: P([[-nw - 1, .4], ...cubic([-nw - 1, .4], [-nw - 3.2, -5], [-nw - 1.8, -11], [0, -11.5]).slice(1), ...cubic([0, -11.5], [nw + 1.8, -11], [nw + 3.2, -5], [nw + 1, .4]).slice(1)]), kind: 'under' }); parts.push({ d: P([[-nw + .2, .3], ...cubic([-nw + .2, .3], [-nw - .4, -4.5], [-nw * .55, -8.6], [0, -8.8]).slice(1), ...cubic([0, -8.8], [nw * .55, -8.6], [nw + .4, -4.5], [nw - .2, .3]).slice(1)]), kind: 'seam' }); }
    else parts.push({ d: P([[-nw - .8, .3], ...cubic([-nw - .8, .3], [-nw - 2.6, -6], [-nw - 1.2, -12], [0, -12.6]).slice(1), ...cubic([0, -12.6], [nw + 1.2, -12], [nw + 2.6, -6], [nw + .8, .3]).slice(1)]), kind: 'under' }), seam([[0, -12.6], [0, .3]], 'seam');
  }
  parts.push({ d: P(poly) + ' Z', kind: 'outline' });
  seam([SP, UA]); seam([[-SP[0], SP[1]], [-UA[0], UA[1]]]);
  // neck rib, hem and cuffs
  if (m.neckRib && !S.hood) { const k = m.neckRib, a = add([nw, 0], [SP[0] - nw, SP[1]], k / Math.hypot(SP[0] - nw, SP[1])); seam(cubic([-a[0], a[1]], [-a[0], nd * .7 + k], [-nw * .55 - k * .3, nd + k], [0, nd + k]), 'seam'); seam(cubic([0, nd + k], [nw * .55 + k * .3, nd + k], [a[0], nd * .7 + k], a), 'seam'); }
  if (m.hemRib) { seam([[-half, L - m.hemRib], [half, L - m.hemRib]]); for (let x = -half + .5; x < half; x += .5) parts.push({ d: P([[x, L - m.hemRib + .2], [x, L - .2]]), kind: 'rib' }); }
  else seam([[-half + .1, L - .75], [half - .1, L - .75]], 'stitch');
  for (const sg of [1, -1]) {
    const st = [ST[0] * sg, ST[1]], sb = [SB[0] * sg, SB[1]], d = [dir[0] * sg, dir[1]];
    if (m.cuffRib) { const a = add(st, d, -m.cuffRib), b = add(sb, d, -m.cuffRib); seam([a, b]); for (let i = 1; i < 8; i++) { const q = add(a, [sb[0] - st[0], sb[1] - st[1]], i / 8); parts.push({ d: P([add(q, d, .15), add(q, d, m.cuffRib - .15)]), kind: 'rib' }); } keepouts.push({ name: 'the cuff rib', poly: [a, st, sb, b], why: 'cuff', level: 'fail' }); }
    else seam([add(st, d, -.75), add(sb, d, -.75)], 'stitch');
  }
  if (view === 'front') {
    if (S.zip) { seam([[-.12, S.hood ? 0 : nd], [-.12, L]], 'seam'); seam([[.12, S.hood ? 0 : nd], [.12, L]], 'seam'); for (let y = (S.hood ? 0 : nd) + .3; y < L - .2; y += .3) parts.push({ d: P([[-.12, y], [.12, y]]), kind: 'rib' }); parts.push({ d: P([[-.35, (S.hood ? 0 : nd) + .3], [.35, (S.hood ? 0 : nd) + .3], [.35, (S.hood ? 0 : nd) + 1.6], [-.35, (S.hood ? 0 : nd) + 1.6]]) + ' Z', kind: 'seam' }); keepouts.push({ name: 'the zip', poly: [[-.75, 0], [.75, 0], [.75, L], [-.75, L]], why: 'zip', level: 'fail' }); }
    if (S.hood && o.drawcord !== false) for (const sg of [1, -1]) { const x = sg * 1.4; parts.push({ d: `M${x} ${nd - .2} m-.18 0 a.18 .18 0 1 0 .36 0 a.18 .18 0 1 0 -.36 0`, kind: 'seam' }); parts.push({ d: P([[x, nd - .2], [x + sg * .3, nd + 9]]), kind: 'cord' }); parts.push({ d: P([[x + sg * .3 - .14, nd + 9], [x + sg * .3 + .14, nd + 9], [x + sg * .3 + .14, nd + 10.2], [x + sg * .3 - .14, nd + 10.2]]) + ' Z', kind: 'seam' }); }
    const pb = L - (m.hemRib || 0) - .5, pt = pb - 8;
    if (S.pocket === 'kangaroo' && !o.noPocket) { const pk = [[-5.5, pt], [5.5, pt], ...cubic([5.5, pt], [6.2, pt + 3], [7.6, pt + 4.5], [7.6, pb]).slice(1), [-7.6, pb], ...cubic([-7.6, pb], [-7.6, pt + 4.5], [-6.2, pt + 3], [-5.5, pt]).slice(1)]; parts.push({ d: P(pk) + ' Z', kind: 'seam' }); keepouts.push({ name: 'the kangaroo pocket', poly: pk, why: 'pocket', level: 'warn' }); }
    if (S.pocket === 'split' && !o.noPocket) for (const sg of [1, -1]) { const pk = [[sg * .9, pt], [sg * 6, pt + 1.2], [sg * 7.4, pb], [sg * .9, pb]]; seam(pk.concat([pk[0]])); keepouts.push({ name: 'a front pocket', poly: pk, why: 'pocket', level: 'warn' }); }
    if (S.pocket === 'welt') for (const sg of [1, -1]) { const y = L - (m.hemRib || 0) - 6.5, x = sg * (half * .55); parts.push({ d: P([[x - sg * .4, y - 2.6], [x + sg * .6, y + 2.6], [x + sg * 1.2, y + 2.5], [x + sg * .2, y - 2.7]]) + ' Z', kind: 'seam' }); keepouts.push({ name: 'a welt pocket', poly: [[x - sg * 1.2, y - 3.4], [x + sg * 2, y - 3.4], [x + sg * 2, y + 3.4], [x - sg * 1.2, y + 3.4]], why: 'pocket', level: 'warn' }); }
    if (o.chestPocket && !S.zip) { const pk = [[half * .28, 6.5], [half * .28 + 4.25, 6.5], [half * .28 + 4.25, 11.5], [half * .28 + 2.1, 12.2], [half * .28, 11.5]]; seam(pk.concat([pk[0]])); keepouts.push({ name: 'the chest pocket', poly: pk, why: 'pocket', level: 'warn' }); }
  } else {
    // the main label, sewn inside at the centre back neck, and a hang loop
    parts.push({ d: P([[-1.25, nd + .35], [1.25, nd + .35], [1.25, nd + 1.35], [-1.25, nd + 1.35]]) + ' Z', kind: 'label' });
  }
  keepouts.push({ name: 'the neck', poly: [...cubic([-nw - 1, -.2], [-nw - 1, nd + 1], [-nw * .5, nd + 1 + (m.neckRib || 0)], [0, nd + 1 + (m.neckRib || 0)]), ...cubic([0, nd + 1 + (m.neckRib || 0)], [nw * .5, nd + 1 + (m.neckRib || 0)], [nw + 1, nd + 1], [nw + 1, -.2]).slice(1)], why: 'neck', level: 'fail' });
  keepouts.push({ name: m.hemRib ? 'the hem rib' : 'the hem', poly: [[-half - 1, L - (m.hemRib || 0) - .75], [half + 1, L - (m.hemRib || 0) - .75], [half + 1, L + 1], [-half - 1, L + 1]], why: 'hem', level: m.hemRib ? 'fail' : 'warn' });
  const regions = { body: bodyPoly, 'left sleeve': sleeveR, 'right sleeve': sleeveL };
  const pom = [{ key: 'chest', from: [-half, UA[1] + 1], to: [half, UA[1] + 1] }, { key: 'length', from: [nw + .1, 0], to: [nw + .1, L] }, { key: 'shoulder', from: [-SP[0], -1.6], to: [SP[0], -1.6] }, { key: 'sleeve', from: SP, to: ST }];
  return { outline: poly, parts, regions, keepouts, pom, bounds: bounds([...poly, ...(S.hood ? [[0, view === 'front' ? -11.5 : -12.6], [nw + 3.2, -5], [-nw - 3.2, -5]] : [])]), anchorName: view === 'front' ? 'HPS' : 'HPS (back)' };
}
function bottomGeom(S, m, o, view) {
  if (S.skirt) return skirtGeom(m, view);
  const w = m.waist, wb = m.waistband, hipH = m.hip / 2, L = m.rise + m.inseam, cr = m.rise, lo = m.legOpening, out = hipH + .25;
  // each leg opening sits around the leg's middle; a wide short flares out past the hip rather than crossing the centre
  const mid = Math.max(out * .55, lo / 2 + .4), hemIn = mid - lo / 2, hemOut = mid + lo / 2;
  const right = [[w / 2, 0], [w / 2, wb], [out, 8], [hemOut, L], [hemIn, L], [Math.min(hemIn, 1) * .45, cr + .9], [0, cr]];
  const poly = [...mirror(right.slice().reverse()), ...right], legL = [[0, 0], ...right], legR = mirror(legL);
  const parts = [{ d: 'M' + poly.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L') + ' Z', kind: 'outline' }], keepouts = [], P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
  parts.push({ d: P([[-w / 2, wb], [w / 2, wb]]), kind: 'seam' });
  for (const x of [-w / 2 + 1.5, -w / 2 * .35, w / 2 * .35, w / 2 - 1.5]) parts.push({ d: P([[x - .2, -.1], [x + .2, -.1], [x + .2, wb + .4], [x - .2, wb + .4]]) + ' Z', kind: 'seam' });
  for (const sg of [1, -1]) parts.push({ d: P([[sg * hemOut, L - 1], [sg * hemIn, L - 1]]), kind: 'stitch' });
  if (view === 'front') {
    parts.push({ d: P([[-1.6, wb], ...cubic([-1.6, wb], [-1.6, wb + 5], [-1.4, wb + 6.8], [0, wb + 7.2]).slice(1)]), kind: 'stitch' });
    for (const sg of [1, -1]) { parts.push({ d: P(cubic([sg * (w / 2 - 3.6), wb], [sg * (w / 2 - 3.4), wb + 3], [sg * (out - 1), 5.5], [sg * (w / 2 + .6), 7])), kind: 'seam' }); keepouts.push({ name: 'a front pocket', poly: [[sg * (w / 2 - 3.8), wb], [sg * (w / 2 + 1), wb], [sg * (w / 2 + 1), 7.5], [sg * (w / 2 - 3.8), 4]], why: 'pocket', level: 'warn' }); }
    for (let i = 0; i < (o.pleats || 0); i++) for (const sg of [1, -1]) parts.push({ d: P([[sg * (w / 2 * (.45 + i * .2)), wb], [sg * (w / 2 * (.45 + i * .2) + sg * .2), wb + 3.5]]), kind: 'seam' });
    keepouts.push({ name: 'the fly', poly: [[-2.2, 0], [.4, 0], [.4, wb + 7.6], [-2.2, wb + 7.6]], why: 'fly', level: 'fail' });
  } else {
    for (const sg of [1, -1]) { const pk = [[sg * 1.8, wb + 1.8], [sg * 6.6, wb + 1.4], [sg * 6.4, wb + 7.4], [sg * 4.2, wb + 8.2], [sg * 2, wb + 7.6]]; parts.push({ d: P(pk) + ' Z', kind: 'seam' }); keepouts.push({ name: 'a back pocket', poly: pk, why: 'pocket', level: 'warn' }); }
    parts.push({ d: P([[0, wb], [0, cr]]), kind: 'seam' });
    parts.push({ d: P([[-1, wb + .3], [1, wb + .3], [1, wb + 1.1], [-1, wb + 1.1]]) + ' Z', kind: 'label' });
  }
  keepouts.push({ name: 'the waistband', poly: [[-w / 2 - 1, -1], [w / 2 + 1, -1], [w / 2 + 1, wb + .5], [-w / 2 - 1, wb + .5]], why: 'waistband', level: 'fail' }, { name: 'the crotch seam', poly: [[-1.4, cr - 2], [1.4, cr - 2], [1.4, L], [-1.4, L]], why: 'crotch', level: 'fail' });
  return { outline: poly, parts, regions: { 'left leg': legL, 'right leg': legR }, keepouts, pom: [{ key: 'waist', from: [-w / 2, -1.2], to: [w / 2, -1.2] }, { key: 'inseam', from: [.6, cr + .9], to: [hemIn + .4, L] }], bounds: bounds(poly), anchorName: 'top of the waistband' };
}
function skirtGeom(m, view) {
  const w = m.waist / 2, wb = m.waistband, L = m.length, sw = Math.max(m.sweep, m.hip) / 2, hip = m.hip / 2, P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
  const poly = [[-w, 0], [w, 0], [w, wb], [hip, Math.min(7, L * .45)], [sw, L], [-sw, L], [-hip, Math.min(7, L * .45)], [-w, wb]];
  const parts = [{ d: P(poly) + ' Z', kind: 'outline' }, { d: P([[-w, wb], [w, wb]]), kind: 'seam' }, { d: P([[-sw + .1, L - .75], [sw - .1, L - .75]]), kind: 'stitch' }];
  if (view === 'back') parts.push({ d: P([[0, wb], [0, Math.min(8, L * .5)]]), kind: 'seam' }, { d: P([[-1, wb + .3], [1, wb + .3], [1, wb + 1.1], [-1, wb + 1.1]]) + ' Z', kind: 'label' });
  return { outline: poly, parts, regions: { skirt: poly }, keepouts: [{ name: 'the waistband', poly: [[-w - 1, -1], [w + 1, -1], [w + 1, wb + .5], [-w - 1, wb + .5]], why: 'waistband', level: 'fail' }, { name: 'the hem', poly: [[-sw - 1, L - 1], [sw + 1, L - 1], [sw + 1, L + 1], [-sw - 1, L + 1]], why: 'hem', level: 'warn' }], pom: [{ key: 'waist', from: [-w, -1.2], to: [w, -1.2] }, { key: 'length', from: [w + .6, 0], to: [w + .6, L] }], bounds: bounds(poly), anchorName: 'top of the waistband' };
}
function capGeom(m, view) {
  const w = m.crownWidth / 2, h = m.crownHeight, P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
  const crown = [[-w, 0], ...cubic([-w, 0], [-w, -h * 1.15], [w, -h * 1.15], [w, 0]).slice(1)], parts = [{ d: P(crown) + ' Z', kind: 'outline' }], keepouts = [];
  if (view === 'front') { const bw = m.brimWidth / 2, bl = m.brimLength; parts.push({ d: P([[-w, 0], ...cubic([-w, 0], [-bw - .6, bl * .9], [bw + .6, bl * .9], [w, 0]).slice(1)]) + ' Z', kind: 'outline' }); parts.push({ d: P(cubic([-w + .3, .35], [-bw * .7, bl * .62], [bw * .7, bl * .62], [w - .3, .35])), kind: 'stitch' }); parts.push({ d: P(cubic([0, 0], [-.05, -h * .5], [0, -h * .8], [0, -h * .86])), kind: 'seam' }); keepouts.push({ name: 'the brim seam', poly: [[-w - 1, -.5], [w + 1, -.5], [w + 1, 2], [-w - 1, 2]], why: 'brim', level: 'fail' }); }
  else { parts.push({ d: P([[-1.6, 0], ...cubic([-1.6, 0], [-1.6, -1.6], [1.6, -1.6], [1.6, 0]).slice(1)]), kind: 'seam' }); parts.push({ d: P([[-.4, -1.1], [.4, -1.1]]), kind: 'seam' }); keepouts.push({ name: 'the back opening', poly: [[-2.1, -2.1], [2.1, -2.1], [2.1, .5], [-2.1, .5]], why: 'opening', level: 'fail' }); }
  parts.push({ d: `M0 ${-h * .86 - .15} m-.25 0 a.25 .2 0 1 0 .5 0 a.25 .2 0 1 0 -.5 0`, kind: 'seam' });
  for (const sg of [1, -1]) parts.push({ d: `M${sg * w * .62} ${-h * .62} m-.12 0 a.12 .12 0 1 0 .24 0 a.12 .12 0 1 0 -.24 0`, kind: 'seam' });
  return { outline: crown, parts, regions: { [view === 'front' ? 'front crown' : 'back crown']: crown }, keepouts: keepouts.concat([{ name: 'the top of the crown', poly: [[-w, -h * .75], [w, -h * .75], [w, -h * 1.3], [-w, -h * 1.3]], why: 'crown', level: 'warn' }]), pom: [{ key: 'crownWidth', from: [-w, .2], to: [w, .2] }, { key: 'crownHeight', from: [w + .6, 0], to: [w + .6, -h] }], bounds: bounds([...crown, [-m.brimWidth / 2 - .6, m.brimLength], [m.brimWidth / 2 + .6, m.brimLength]]), anchorName: 'the brim seam' };
}
function beanieGeom(m, view) {
  const w = m.width / 2, H = m.height, c = m.cuff, P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
  const poly = [[-w, H], [-w, 1.2], ...cubic([-w, 1.2], [-w, -.4], [w, -.4], [w, 1.2]).slice(1), [w, H]];
  const parts = [{ d: P(poly) + ' Z', kind: 'outline' }, { d: P([[-w, H - c], [w, H - c]]), kind: 'seam' }];
  for (let x = -w + .35; x < w; x += .35) parts.push({ d: P([[x, x * x < w * w * .5 ? .9 : 1.4], [x, H - c - .1]]), kind: 'rib' });
  return { outline: poly, parts, regions: { cuff: [[-w, H - c], [w, H - c], [w, H], [-w, H]], body: [[-w, 1.2], [w, 1.2], [w, H - c], [-w, H - c]] }, keepouts: [{ name: 'the cuff fold', poly: [[-w - 1, H - c - .4], [w + 1, H - c - .4], [w + 1, H - c + .4], [-w - 1, H - c + .4]], why: 'fold', level: 'fail' }], pom: [{ key: 'width', from: [-w, H + .6], to: [w, H + .6] }, { key: 'height', from: [w + .6, 0], to: [w + .6, H] }], bounds: bounds(poly), anchorName: 'the top of the hat' };
}
function toteGeom(m, view) {
  const w = m.width / 2, H = m.height, d = m.handleDrop, hw = m.handleWidth, P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
  const poly = [[-w, 0], [w, 0], [w, H], [-w, H]], parts = [{ d: P(poly) + ' Z', kind: 'outline' }, { d: P([[-w + .1, 1.25], [w - .1, 1.25]]), kind: 'stitch' }];
  for (const off of [0, hw]) parts.push({ d: P([[-w * .45 + off, 0], ...cubic([-w * .45 + off, 0], [-w * .45 + off, -d * 1.25 + off], [w * .45 - off, -d * 1.25 + off], [w * .45 - off, 0]).slice(1)]), kind: 'outline' });
  for (const sg of [1, -1]) parts.push({ d: P([[sg * w * .45 - hw / 2, .1], [sg * w * .45 + hw / 2, .1], [sg * w * .45 + hw / 2, 1.6], [sg * w * .45 - hw / 2, 1.6]]) + ' Z', kind: 'stitch' });
  return { outline: poly, parts, regions: { body: poly }, keepouts: [{ name: 'the top hem and handles', poly: [[-w - 1, -1], [w + 1, -1], [w + 1, 2.25], [-w - 1, 2.25]], why: 'hem', level: 'fail' }], pom: [{ key: 'width', from: [-w, H + .7], to: [w, H + .7] }, { key: 'height', from: [w + .7, 0], to: [w + .7, H] }], bounds: bounds([...poly, [0, -d * .95]]), anchorName: 'the top edge' };
}
function bounds(pts) { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }

// ---- placements: where each logo and graphic sits, measured ----
// a placement: { id, name, view, x, y (its centre, inches), w, h (inches), art? (library art id), mark? (cue|word|lockup), techniqueId?, technique (on the tech pack) }
const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const corners = q => [[q.x - q.w / 2, q.y - q.h / 2], [q.x + q.w / 2, q.y - q.h / 2], [q.x + q.w / 2, q.y + q.h / 2], [q.x - q.w / 2, q.y + q.h / 2]];
const segX = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
const overlaps = (box, poly) => box.some(c => inside(c, poly)) || poly.some(c => inside(c, box)) || box.some((a, i) => poly.some((c, j) => segX(a, box[(i + 1) % 4], c, poly[(j + 1) % poly.length])));
export function regionOf(q, g) { for (const [name, poly] of Object.entries(g.regions)) if (poly.length && inside([q.x, q.y], poly)) return name; return null; }
// the words a sample room uses for where it is
export function describe(q, p) {
  const g = geometry(p, q.view), S = STYLES[p.style], top = q.y - q.h / 2, reg = regionOf(q, g), side = q.x > 0 ? 'left' : 'right';
  const across = Math.abs(q.x) < .125 ? 'centred' : null;
  if (S.kind === 'top') {
    if (reg && /sleeve/.test(reg)) { const sp = [(reg === 'left sleeve' ? 1 : -1) * (g.regions[reg][0][0]), g.regions[reg][0][1]]; return `On the wearer's ${reg.split(' ')[0]} sleeve, ${fmtCm(Math.hypot(q.x - sp[0], top - sp[1]))} down from the shoulder point, centred on the sleeve`; }
    return `${fmtCm(top)} below the ${q.view === 'back' ? 'HPS on the back' : 'HPS'}, ${across ? `centred on the ${q.view === 'back' ? 'CB' : 'CF'}` : `centre ${fmtCm(q.x)} from the ${q.view === 'back' ? 'CB' : 'CF'} toward the wearer's ${q.view === 'back' ? (q.x > 0 ? 'right' : 'left') : side}`}`;
  }
  if (S.kind === 'bottom') return `${fmtCm(top)} below the top of the waistband, on the ${q.view === 'back' ? 'back' : 'front'} ${q.view === 'back' ? (q.x > 0 ? 'right' : 'left') : (q.x > 0 ? 'left' : 'right')} leg, centre ${fmtCm(Math.abs(q.x))} from the ${q.view === 'back' ? 'CB' : 'CF'}`;
  if (S.kind === 'cap') return `${across ? 'Centred' : `Centre ${fmtCm(q.x)} off centre`} on the ${q.view} crown, bottom edge ${fmtCm(-(q.y + q.h / 2))} above the brim seam`;
  if (S.kind === 'beanie') return `${across ? 'Centred' : `Centre ${fmtCm(q.x)} off centre`} on the ${reg === 'cuff' ? 'cuff' : 'crown'}, ${fmtCm(top - (reg === 'cuff' ? p.m.height - p.m.cuff : 0))} below its top edge`;
  return `${fmtCm(top)} below the top edge, ${across ? 'centred' : `centre ${fmtCm(q.x)} off centre`}`;
}
// the checks that need only the drawing: on the piece, clear of seams, ribs, zips and pockets, inside what the technique can make
export function placementChecks(q, p, rules = {}) {
  const g = geometry(p, q.view), box = corners(q), out = [], reg = regionOf(q, g), clear = rules.minClear ?? .75;
  if (!reg) { out.push({ level: 'fail', code: 'OFF_PIECE', text: `${q.name} is not on the piece. Move it onto the ${q.view}.` }); return out; }
  const poly = g.regions[reg]; if (!box.every(c => inside(c, poly))) out.push({ level: 'fail', code: 'OVER_EDGE', text: `${q.name} runs over the edge of the ${reg}${STYLES[p.style].kind === 'top' && reg === 'body' ? ' (a side or armhole seam)' : ''}. Make it smaller or move it in.` });
  else { const grown = { ...q, w: q.w + clear * 2, h: q.h + clear * 2 }; if (!corners(grown).every(c => inside(c, poly))) out.push({ level: 'warn', code: 'NEAR_SEAM', text: `${q.name} sits within ${fmt(clear)} of a seam. Printers and embroiderers need that much room to hoop or pallet it.` }); }
  for (const k of g.keepouts) if (overlaps(box, k.poly)) out.push({ level: k.level, code: 'KEEPOUT_' + k.why.toUpperCase(), text: `${q.name} crosses ${k.name}. ${{ zip: 'A zip cannot be printed or embroidered across: split the graphic, or move it.', pocket: 'It has to go on before the pocket is sewn, which costs more and can misalign: move it, or accept that.', neck: 'Too close to the collar to print or hoop: move it down.', hem: 'Ribs and hems cannot be printed flat: move it up.', cuff: 'Ribbed cuffs stretch and cannot be printed: move it.', fly: 'The fly is several layers thick: move it to the side.', waistband: 'The waistband is too thick and curved: move it down.', crotch: 'Seams meet there: move it.', brim: 'It cannot cross the brim seam: move it up.', opening: 'That is the strap opening.', crown: 'Near the button, the panels meet and curve: keep it lower.', fold: 'The cuff folds there: keep it on the cuff.', waistband2: '' }[k.why] || 'Move it.'}` });
  if (rules.maxW && q.w > rules.maxW + 1e-6) out.push({ level: 'fail', code: 'TOO_WIDE', text: `${q.name} is ${fmt(q.w)} wide; ${rules.techniqueName || 'this technique'} goes up to ${fmt(rules.maxW)}.` });
  if (rules.maxH && q.h > rules.maxH + 1e-6) out.push({ level: 'fail', code: 'TOO_TALL', text: `${q.name} is ${fmt(q.h)} tall; ${rules.techniqueName || 'this technique'} goes up to ${fmt(rules.maxH)}.` });
  if (STYLES[p.style].kind === 'cap' && q.view === 'front' && (q.w > 4.75 || q.h > 2.5)) out.push({ level: 'warn', code: 'CAP_SIZE', text: `A cap front takes up to about 4¾ in × 2½ in; ${q.name} is ${fmt(q.w)} × ${fmt(q.h)}.` });
  return out;
}
// two things placed on top of each other on the same side
export const boxesMeet = (a, b) => a.view === b.view && Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
export function overlapChecks(placements) {
  const out = {}; for (const a of placements) out[a.id] = placements.filter(b => b !== a && boxesMeet(a, b)).map(b => ({ level: 'warn', code: 'OVERLAP', text: `${a.name} overlaps ${b.name}. Move one, or say how they print together.` }));
  return out;
}
// where a concept's logo and graphics start out, from the words it was designed with
export function defaultPlacement(kind, p, { aspect = 1, label = '' } = {}) {
  const S = STYLES[p.style], m = measurementsFor(p, p.size || 'M'), t = String(label).toLowerCase();
  const box = (view, x, y, w) => ({ view, x: r8(x), y: r8(y + w / aspect / 2), w: r8(w), h: r8(w / aspect) });
  if (S.kind === 'top') {
    const nd = m.neckDropFront;
    if (/back yoke|back neck|nape/.test(t)) return box('back', 0, m.neckDropBack + 2.5, 3);
    if (/\bback\b|full back/.test(t)) return box('back', 0, 5, Math.min(11, m.chest * .5));
    if (/left sleeve|sleeve/.test(t)) { const g = geometry(p, 'front'), sp = g.regions['left sleeve']; return { view: 'front', ...(() => { const c = [(sp[0][0] + sp[1][0] + sp[2][0] + sp[3][0]) / 4, (sp[0][1] + sp[1][1] + sp[2][1] + sp[3][1]) / 4]; const w = m.sleeve > 12 ? 2.5 : 2.25; return { x: r8(c[0]), y: r8(c[1]), w, h: r8(w / aspect) }; })() }; }
    if (/hem|lower/.test(t)) return box('front', m.chest * .28, m.length - (m.hemRib || 0) - 4.5, 2.5);
    if (/left chest|chest left/.test(t) || kind === 'logo' && !/centre|center|full|front chest/.test(t)) return box('front', m.chest * .22, nd + 3.25, 3.5);
    if (/full front|large|oversized graphic/.test(t)) return box('front', 0, nd + 2.5, Math.min(12, m.chest * .55));
    if (/chest band|band/.test(t)) return box('front', 0, nd + 3, Math.min(13, m.chest * .6));
    return box('front', 0, nd + 3, Math.min(10, m.chest * .45));
  }
  if (S.kind === 'bottom') return /back/.test(t) ? box('back', -4, m.waistband + 9.5, 2.5) : box('front', m.hip / 2 - 3.6, m.waistband + Math.min(m.rise - 2.5, 9), 2.5);
  if (S.kind === 'cap') { const w = Math.min(3.25, 1.9 * aspect, m.crownWidth * .4), h = w / aspect; return /back/.test(t) ? { view: 'back', x: 0, y: r8(-2.2 - h / 2), w: r8(Math.min(w, 2.25)), h: r8(Math.min(w, 2.25) / aspect) } : { view: 'front', x: 0, y: r8(-.75 - h / 2), w: r8(w), h: r8(h) }; }
  if (S.kind === 'beanie') return box('front', 0, m.height - m.cuff + .5, Math.min(3, 2 * aspect));
  return box('front', 0, 4, Math.min(10, m.width * .6));
}

// ---- the picture: one view as SVG, with the placements, their measurements and the points of measure ----
// ---- changing the drawing: the garment's colour, colour blocks, details, stitching, and areas an image model redraws ----
// Edits are kept in inches on one view, like placements: { id, type: 'detail' | 'stitch' | 'block' | 'ai', view, ... }.
//   detail: a pocket, pleat, drawcord, zip, placket, or a cover-up over something on the sketch: { kind, x, y, w, h, count, flip, stitch, thread, color }
//   stitch: a stitch line drawn along a seam or edge: { pts: [[x, y]...], stitch, thread, spi }
//   block:  a contrast colour panel: { pts: [[x, y]...] (a closed shape), color, name }
//   ai:     an area redrawn by the image model from a few words: { x, y, w, h, art (a lab_art id), prompt }
// The garment's colour (p.color) and each block recolour the sketch itself: white cloth takes the colour, its lines and shading stay.
export const DETAILS = {
  'pocket-patch': 'Patch pocket', 'pocket-flap': 'Flap pocket', 'pocket-welt': 'Welt pocket', 'pocket-cargo': 'Cargo pocket', 'pocket-kangaroo': 'Kangaroo pocket',
  'pocket-slant': 'Slant pocket', 'pocket-jean': 'Jean front pocket', 'pocket-zip': 'Zip pocket', pleat: 'Pleats', drawcord: 'Drawcord', zip: 'Zip', placket: 'Button placket', erase: 'Cover up'
};
export const STITCHES = { single: 'Single needle', double: 'Double needle', triple: 'Triple needle', chain: 'Chain stitch', cover: 'Coverstitch', zigzag: 'Zigzag', bartack: 'Bartack', blind: 'Blind hem' };
const HEX = /^#[0-9a-f]{6}$/i, INK = '#141416';
export const hexOf = v => HEX.test(String(v || '')) ? String(v).toLowerCase() : '';
const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => v / 255); };
const lumOf = h => { const c = rgbOf(h).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const mixHex = (a, b, t) => '#' + rgbOf(a).map((v, i) => Math.round((v + (rgbOf(b)[i] - v) * t) * 255).toString(16).padStart(2, '0')).join('');
// the colour the drawing's lines take on a cloth: ink on light cloth, a light line on dark cloth so the drawing still reads
export const lineFor = fill => !fill || lumOf(fill) > .16 ? INK : mixHex(fill, '#ffffff', .62);
// recolours a black-and-white drawing: white → the cloth, black → its line colour, the greys between them
const tintFilter = (id, fill) => { const l = rgbOf(lineFor(fill)), c = rgbOf(fill), row = i => { const a = c[i] - l[i]; return `${(a * .2126).toFixed(4)} ${(a * .7152).toFixed(4)} ${(a * .0722).toFixed(4)} 0 ${l[i].toFixed(4)}`; };
  return `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${row(0)} ${row(1)} ${row(2)} 0 0 0 1 0"/></filter>`; };
const n3 = v => +(+v).toFixed(3);
const pathD = pts => 'M' + pts.map(q => `${n3(q[0])} ${n3(q[1])}`).join(' L');
const offsetPts = (pts, d) => pts.map((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [q[0] - dy / L * d, q[1] + dx / L * d]; });
// a zigzag along a line: a point every `step`, alternately either side
const zig = (pts, amp = .06, step = .12) => { const out = []; let k = 0; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step)), nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
  for (let j = 0; j < n; j++, k++) { const t = j / n, s = k % 2 ? amp : -amp; out.push([a[0] + (b[0] - a[0]) * t + nx * s, a[1] + (b[1] - a[1]) * t + ny * s]); } } out.push(pts[pts.length - 1]); return out; };
// a stitch line, drawn the way flats show each stitch type
export function stitchSvg(pts, type = 'single', thread = INK) {
  if (!pts || pts.length < 2) return '';
  const s = (d, w = .03, dash = '.12 .07') => `<path d="${d}" fill="none" stroke="${thread}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (type) {
    case 'double': return s(pathD(offsetPts(pts, -.07))) + s(pathD(offsetPts(pts, .07)));
    case 'triple': return [-.13, 0, .13].map(o => s(pathD(offsetPts(pts, o)))).join('');
    case 'chain': return s(pathD(pts), .055, '.035 .07');
    case 'cover': return s(pathD(offsetPts(pts, -.12))) + s(pathD(offsetPts(pts, .12))) + s(pathD(zig(pts, .11, .1)), .014, '');
    case 'zigzag': return s(pathD(zig(pts)), .025, '');
    case 'bartack': return s(pathD(zig(pts, .05, .035)), .03, '');
    case 'blind': return s(pathD(pts), .02, '.03 .16');
    default: return s(pathD(pts));
  }
}
const bez = (a, c1, c2, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; });
// one detail, drawn as flat-sketch line art in inches: { body: the shape (outline and cloth), stitch: its topstitching }
export function detailSvg(e, cloth = '#ffffff') {
  const fill = hexOf(e.color) || cloth, lc = lineFor(fill === '#ffffff' ? '' : fill), th = hexOf(e.thread) || lc, st = STITCHES[e.stitch] ? e.stitch : 'single';
  const x0 = e.x - e.w / 2, x1 = e.x + e.w / 2, y0 = e.y - e.h / 2, y1 = e.y + e.h / 2, f = e.flip ? -1 : 1, W = .06;
  const shape = (pts, close = true) => `<path d="${pathD(pts)}${close ? ' Z' : ''}" fill="${close ? fill : 'none'}" stroke="${lc}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const line = (pts, w = W) => `<path d="${pathD(pts)}" fill="none" stroke="${lc}" stroke-width="${w}" stroke-linecap="round"/>`;
  const dot = (cx, cy, r = .17) => `<circle cx="${n3(cx)}" cy="${n3(cy)}" r="${r}" fill="${fill}" stroke="${lc}" stroke-width="${W * .8}"/>`;
  const ts = pts => stitchSvg(pts, st, th), rect = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d]], ins = .18;
  let body = '', stitch = '';
  switch (e.kind) {
    case 'pocket-patch': { const r = Math.min(.6, e.w * .15); body = shape([[x0, y0], ...bez([x0, y1 - r], [x0, y1], [x0, y1], [x0 + r, y1], 4), ...bez([x1 - r, y1], [x1, y1], [x1, y1], [x1, y1 - r], 4), [x1, y0]]);
      stitch = ts([[x0 + ins, y0], [x0 + ins, y1 - ins - r * .5], [x0 + ins + r * .5, y1 - ins], [x1 - ins - r * .5, y1 - ins], [x1 - ins, y1 - ins - r * .5], [x1 - ins, y0]]) + ts([[x0, y0 + .7], [x1, y0 + .7]]); break; }
    case 'pocket-flap': { const fy = y0 + e.h * .34; body = shape(rect(x0, y0 + e.h * .08, x1, y1)) + shape([[x0 - .1, y0], [x1 + .1, y0], [x1 + .1, fy], [e.x, fy + e.h * .1], [x0 - .1, fy]]) + dot(e.x, fy - .05);
      stitch = ts([[x0 + ins - .1, y0 + .15], [x0 + ins - .1, fy - .1], [e.x, fy + e.h * .1 - .22], [x1 - ins + .1, fy - .1], [x1 - ins + .1, y0 + .15]]) + ts([[x0 + ins, fy + .3], [x0 + ins, y1 - ins], [x1 - ins, y1 - ins], [x1 - ins, fy + .3]]); break; }
    case 'pocket-welt': body = shape(rect(x0, y0, x1, y1)) + line([[x0 + .1, e.y], [x1 - .1, e.y]], W * .8);
      stitch = ts([[x0 + .08, y0 + .08], [x1 - .08, y0 + .08], [x1 - .08, y1 - .08], [x0 + .08, y1 - .08], [x0 + .08, y0 + .08]]) + stitchSvg([[x0 + .05, y0], [x0 + .05, y1]], 'bartack', th) + stitchSvg([[x1 - .05, y0], [x1 - .05, y1]], 'bartack', th); break;
    case 'pocket-cargo': { const fy = y0 + e.h * .28; body = shape(rect(x0, y0 + .2, x1, y1)) + line([[e.x - e.w * .16, fy], [e.x - e.w * .16, y1]], W * .7) + line([[e.x + e.w * .16, fy], [e.x + e.w * .16, y1]], W * .7) + shape(rect(x0 - .1, y0, x1 + .1, fy)) + dot(e.x, fy - .3, .14);
      stitch = ts([[x0, fy - ins], [x1, fy - ins]]) + ts([[x0 + ins, fy + .2], [x0 + ins, y1 - ins], [x1 - ins, y1 - ins], [x1 - ins, fy + .2]]); break; }
    case 'pocket-kangaroo': { const R = bez([e.x + e.w * .3, y0], [e.x + e.w * .42, y0 + e.h * .35], [e.x + e.w * .5, y0 + e.h * .55], [x1, y1]), Lf = bez([x0, y1], [e.x - e.w * .5, y0 + e.h * .55], [e.x - e.w * .42, y0 + e.h * .35], [e.x - e.w * .3, y0]);
      body = shape([[e.x - e.w * .3, y0], ...R, ...Lf.slice(0, -1)]); stitch = ts(offsetPts(R, -ins)) + ts(offsetPts(Lf, -ins)) + ts([[e.x - e.w * .3 + .1, y0 + ins], [e.x + e.w * .3 - .1, y0 + ins]]); break; }
    case 'pocket-slant': { const a = f > 0 ? [x0, y0] : [x1, y0], b = f > 0 ? [x1, y1] : [x0, y1]; body = line([a, b]); stitch = ts(offsetPts([a, b], ins * f)) + stitchSvg([a, [a[0], a[1] + .35]], 'bartack', th) + stitchSvg([b, [b[0], b[1] - .35]], 'bartack', th); break; }
    case 'pocket-jean': { const a = f > 0 ? [x0, y0] : [x1, y0], b = f > 0 ? [x1, y1] : [x0, y1], cv = bez(a, [a[0], a[1] + e.h * .75], [a[0] + (b[0] - a[0]) * .35, b[1]], b);
      const cx0 = f > 0 ? x1 - e.w * .42 : x0 + e.w * .08, coin = rect(cx0, y0 + .15, cx0 + e.w * .34, y0 + e.h * .5);
      body = line(cv) + shape(coin); stitch = ts(offsetPts(cv, -ins * f)) + ts(offsetPts(cv, -ins * 1.8 * f)) + ts([[coin[0][0] + .1, coin[3][1] - .1], [coin[1][0] - .1, coin[3][1] - .1]]); break; }
    case 'pocket-zip': body = shape(rect(x0, e.y - .14, x1, e.y + .14)) + line([[x0 + .05, e.y], [x1 - .05, e.y]], .12).replace('stroke-linecap="round"', 'stroke-dasharray=".05 .05"') + shape(rect(x1 - .05, e.y - .1, x1 + .45, e.y + .1));
      stitch = ts([[x0, e.y - .26], [x1, e.y - .26]]) + ts([[x0, e.y + .26], [x1, e.y + .26]]); break;
    case 'pleat': { const n = Math.min(Math.max(Math.round(e.count || 1), 1), 3);
      for (let i = 0; i < n; i++) { const xi = e.x + i * .55 * f; body += line([[xi, y0], [xi, y0 + e.h * .32]]) + `<path d="${pathD([[xi, y0 + e.h * .32], [xi + .05 * f, y1]])}" fill="none" stroke="${lc}" stroke-width="${W * .5}" stroke-dasharray=".25 .14" opacity=".7"/>`; stitch += stitchSvg([[xi - .12 * f, y0 + .05], [xi - .12 * f, y0 + .5]], 'bartack', th); } break; }
    case 'drawcord': { const cord = (ex, dir) => { const pts = bez([ex, y0], [ex, y0 + e.h * .45], [ex + dir * .5, y0 + e.h * .7], [ex + dir * .35, y1]); const end = pts[pts.length - 1];
      return `<path d="${pathD(pts)}" fill="none" stroke="${lc}" stroke-width=".2" stroke-linecap="round"/><path d="${pathD(pts)}" fill="none" stroke="${fill}" stroke-width=".11" stroke-linecap="round"/>` + shape(rect(end[0] - .09, end[1] - .1, end[0] + .09, end[1] + .45)) + dot(ex, y0, .16); };
      body = cord(x0, -1) + cord(x1, 1); break; }
    case 'zip': body = shape(rect(e.x - .2, y0, e.x + .2, y1)) + line([[e.x, y0 + .1], [e.x, y1]], .14).replace('stroke-linecap="round"', 'stroke-dasharray=".06 .05"') + shape([[e.x - .14, y0 - .05], [e.x + .14, y0 - .05], [e.x + .1, y0 + .7], [e.x - .1, y0 + .7]]);
      stitch = ts([[e.x - .38, y0], [e.x - .38, y1]]) + ts([[e.x + .38, y0], [e.x + .38, y1]]); break;
    case 'placket': { const nb = Math.max(2, Math.round(e.h / 3)); body = shape(rect(x0, y0, x1, y1)); for (let i = 0; i < nb; i++) body += dot(e.x, y0 + (i + .5) * e.h / nb, Math.min(.22, e.w * .22));
      stitch = ts([[x0 + .12, y0], [x0 + .12, y1]]) + ts([[x1 - .12, y0], [x1 - .12, y1]]); break; }
    case 'erase': body = `<rect x="${n3(x0)}" y="${n3(y0)}" width="${n3(e.w)}" height="${n3(e.h)}" rx=".15" fill="${fill}"/>`; break;
  }
  return { body, stitch };
}
// where a new detail starts on a piece, in inches (the sample size), so it lands somewhere sensible before it is dragged
export function defaultDetail(kind, p, view = 'front') {
  const S = STYLES[p.style], m = measurementsFor(p, 'M'), top = S.kind === 'top', bottom = S.kind === 'bottom', half = top ? m.chest / 2 : bottom ? m.waist / 2 : 4;
  const at = (x, y, w, h, extra = {}) => ({ kind, view, x: r8(x), y: r8(y), w: r8(w), h: r8(h), ...extra }), down = (x, top, w, h, extra) => at(x, top + h / 2, w, h, extra); // down: placed by its top edge
  if (kind === 'pleat') return down(bottom ? half * .35 : 0, bottom ? (m.waistband || 1.5) : 6, .1, bottom ? 9 : 6, { count: 2 });
  if (kind === 'drawcord') return bottom ? down(0, (m.waistband || 1.5) * .6, 1.6, 7) : down(0, (m.neckDropFront || 3) + .6, 3, 8);
  if (kind === 'zip') return bottom ? down(0, 1.5, .4, 7) : down(0, 1, .4, Math.max(8, (m.length || 26) - 2));
  if (kind === 'placket') return down(0, top ? (m.neckDropFront || 3) : 1.5, 1.25, top ? 7 : 6);
  if (kind === 'pocket-kangaroo') return at(0, top ? m.length * .66 : 10, Math.min(13, half * 1.15), 7);
  if (kind === 'pocket-welt') return at(bottom ? half * .55 : half * .45, bottom ? 4 : m.length * .66, 5.5, .6);
  if (kind === 'pocket-zip') return at(half * .45, top ? m.length * .4 : 6, 5, .3);
  if (kind === 'pocket-slant' || kind === 'pocket-jean') return at(half * .62, bottom ? (m.waistband || 1.5) + 2.2 : 12, half * .45, 4.5, { flip: false });
  if (kind === 'pocket-cargo') return at(bottom ? half * .8 : half * .5, bottom ? (m.rise || 12) + 3 : m.length * .55, 7, 8);
  if (kind === 'erase') return at(top ? 0 : half * .5, top ? m.length * .62 : 8, 6, 5);
  return at(half * (top ? .5 : .55), top ? 9.5 : bottom ? 6 : 3, top ? 4.5 : 6, top ? 5 : 6.5);
}
// a part from the add-on sheets, first placed where that kind of part usually goes, at its usual size
export function defaultPart(id, p, view = 'front') {
  const q = partOf(id); if (!q) return null;
  const S = STYLES[p.style], m = measurementsFor(p, 'M'), top = S.kind === 'top', bottom = S.kind === 'bottom', half = top ? m.chest / 2 : bottom ? m.waist / 2 : 4;
  const w = Math.min(q.width, half * 1.6), h = r8(w / (q.aspect || 1)), at = (x, y) => ({ type: 'part', part: id, view, x: r8(x), y: r8(y), w: r8(w), h, name: q.label });
  if (q.kind === 'zips') return at(0, (top ? (m.length || 26) : 9) / 2);
  if (q.kind === 'collars') return at(0, h / 2 - .4);
  if (q.kind === 'buttons') return at(0, top ? 4 : 1);
  if (q.kind === 'pockets') return at(bottom ? half * .55 : half * .45, top ? Math.max(8, m.length * .35) : bottom ? (m.waistband || 1.5) + 4 : 3);
  return at(0, top ? m.length * .5 : bottom ? 8 : 2);
}
// what the edits say, the way the spec sheet and the tech pack write them
export function describeEdit(e, p) {
  const v = e.view === 'back' ? 'Back' : 'Front', thread = hexOf(e.thread) ? ` in ${hexOf(e.thread)} thread` : '';
  if (e.type === 'stitch') { const L = e.pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - e.pts[i][0], q[1] - e.pts[i][1]), 0); return `${v}: ${STITCHES[e.stitch] || 'Stitch'}${thread}${e.spi ? `, ${e.spi} stitches an inch` : ''}, ${fmt(L)} long`; }
  if (e.type === 'block') return `${v}: ${e.name || 'Colour block'} in ${hexOf(e.color) || 'the main colour'}`;
  if (e.type === 'ai') return `${v}: redrawn: ${e.prompt || 'a change'} (${fmt(e.w)} × ${fmt(e.h)})`;
  if (e.type === 'part') { const q = partOf(e.part); return `${v}: ${e.name || q?.label || 'Part'} (from the add-on sheet ${q?.id || ''}), ${fmt(e.w)} × ${fmt(e.h)}, ${describe({ ...e, name: e.name || q?.label || 'the part' }, p)}${e.flip ? ', mirrored' : ''}`; }
  const name = e.kind === 'pleat' ? `${{ 1: 'Single', 2: 'Double', 3: 'Triple' }[Math.min(Math.max(Math.round(e.count || 1), 1), 3)]} pleat` : DETAILS[e.kind] || 'Detail';
  if (e.kind === 'erase') return `${v}: covered over (${fmt(e.w)} × ${fmt(e.h)})`;
  return `${v}: ${name}, ${fmt(e.w)} × ${fmt(e.h)}, ${describe({ ...e, name }, p)}; topstitch ${(STITCHES[e.stitch] || 'single needle').toLowerCase()}${thread}${hexOf(e.color) ? `; ${hexOf(e.color)}` : ''}`;
}
const cleanPts = (a, min) => { const pts = (Array.isArray(a) ? a : []).slice(0, 60).map(q => [r8(Math.min(Math.max(Number(q?.[0]) || 0, -60), 60)), r8(Math.min(Math.max(Number(q?.[1]) || 0, -30), 80))]); return pts.length >= min ? pts : null; };
export function cleanEdits(list) {
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? r8(Math.min(Math.max(n, lo), hi)) : d; };
  return (Array.isArray(list) ? list : []).slice(0, 60).map((e, i) => {
    const base = { id: /^[a-z0-9-]{1,40}$/i.test(String(e?.id || '')) ? String(e.id) : 'e' + i, view: e?.view === 'back' ? 'back' : 'front' };
    if (e?.type === 'stitch') { const pts = cleanPts(e.pts, 2); return pts && { ...base, type: 'stitch', pts, stitch: STITCHES[e.stitch] ? e.stitch : 'single', thread: hexOf(e.thread), spi: Math.round(num(e.spi, 0, 20, 0)) }; }
    if (e?.type === 'block') { const pts = cleanPts(e.pts, 3); return pts && hexOf(e.color) && { ...base, type: 'block', pts, color: hexOf(e.color), name: String(e.name || '').replace(/\s+/g, ' ').trim().slice(0, 40) }; }
    const box = { x: num(e?.x, -60, 60, 0), y: num(e?.y, -30, 80, 0), w: num(e?.w, .1, 40, 1), h: num(e?.h, .1, 40, 1) };
    if (e?.type === 'ai') return /^[0-9a-f-]{36}$/i.test(String(e.art || '')) && { ...base, type: 'ai', ...box, art: e.art, prompt: String(e.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
    if (e?.type === 'part' && partOf(e.part)) return { ...base, type: 'part', part: e.part, ...box, flip: Boolean(e.flip), name: String(e.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
    if (e?.type === 'detail' && DETAILS[e.kind]) return { ...base, type: 'detail', kind: e.kind, ...box, count: Math.round(num(e.count, 1, 3, 1)), flip: Boolean(e.flip), stitch: STITCHES[e.stitch] ? e.stitch : 'single', thread: hexOf(e.thread), color: hexOf(e.color) };
    return null;
  }).filter(Boolean);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// templateHref: where the page finds a sketch's file (the service passes data URLs, so a saved or printed sheet stands on its own)
// maskHref: where it finds the sketch's silhouette (src/lab-flat-mask.js): the colour fills the garment inside it and nothing outside it
export const MASK_URL = file => `/lab/flat-masks/${file.replace(/\.svg$/, '.png')}`;
export const TEMPLATE_URL = file => `/lab/flat-templates/${file}`;
export const PART_URL = file => `/lab/flat-parts/${file}`;
export const partOf = id => FLAT_PARTS.find(q => q.id === id) || null;
export function renderSvg(p, view = 'front', { placements = [], hrefs = {}, size = p.size || 'M', showPom = false, showDims = true, selected = null, findings = {}, scale = 22, title = '', templateHref = TEMPLATE_URL, partHref = PART_URL, editHrefs = {}, editable = false, selectedEdit = null, overlay = '', plain = false, background = true, templateSvg = null, alloverHref = '', maskHref = null } = {} /* alloverHref: the all-over print's repeat tile, laid over the cloth; templateSvg: the sketch's own markup, to draw it inline (the service: much faster to rasterise than a picture of the whole page); scale 0: no width and height, for nesting; editHrefs: the pictures of areas redrawn by the image model; plain: the drawing alone, no guides or labels */) {
  const g = geometry(p, view, size), d = drawingOf(p, view, size), b = d ? d.box : g.bounds, pad = 3.2, x0 = b.x0 - pad, y0 = b.y0 - pad - (title ? 1.2 : 0), W = b.x1 - b.x0 + pad * 2, H = b.y1 - b.y0 + pad * 2 + (title ? 1.2 : 0);
  const k = Math.max(1, Math.max(W, H) / 30), fs = .34 * k; // labels grow with the drawing, so they read at the size it is shown
  const sw = { outline: .07, seam: .035, stitch: .03, rib: .018, under: .05, cord: .05, label: .03 }, dash = { stitch: '.18 .12', label: '.15 .1' };
  const pid = `fb-${view}-${d ? d.t.id : p.style}`, clipDef = d?.v.clip ? `<clipPath id="${pid}-v"><polygon points="${d.v.clip.map(q => q.join(',')).join(' ')}"/></clipPath>` : '';
  const parts = d ? `<svg x="${b.x0.toFixed(3)}" y="${b.y0.toFixed(3)}" width="${(b.x1 - b.x0).toFixed(3)}" height="${(b.y1 - b.y0).toFixed(3)}" viewBox="${d.v.box.join(' ')}" preserveAspectRatio="none" overflow="hidden">${clipDef}${(() => { const tpl = templateSvg ? `<g${clipDef ? ` clip-path="url(#${pid}-v)"` : ''}><svg x="${d.t.page[0]}" y="${d.t.page[1]}" width="${d.t.page[2]}" height="${d.t.page[3]}" viewBox="${d.t.page.join(' ')}">${templateSvg(d.t.file)}</svg></g>` : `<image href="${esc(templateHref(d.t.file))}" x="${d.t.page[0]}" y="${d.t.page[1]}" width="${d.t.page[2]}" height="${d.t.page[3]}"${clipDef ? ` clip-path="url(#${pid}-v)"` : ''}/>`; const mh = maskHref ? maskHref(d.t.file) : null; if (!mh) return tpl; const r = `x="${d.t.page[0]}" y="${d.t.page[1]}" width="${d.t.page[2]}" height="${d.t.page[3]}" preserveAspectRatio="none"`; return `<mask id="${pid}-m" maskUnits="userSpaceOnUse" ${r.replace(' preserveAspectRatio="none"', '')}><image href="${esc(mh)}" ${r}/></mask><g mask="url(#${pid}-m)"><image href="${esc(mh)}" ${r}/>${tpl}</g>`; })()}</svg>` : g.parts.map(pt => `<path d="${pt.d}" fill="${pt.kind === 'outline' || pt.kind === 'under' ? '#ffffff' : 'none'}" stroke="#141416" stroke-width="${sw[pt.kind] || .035}"${dash[pt.kind] ? ` stroke-dasharray="${dash[pt.kind]}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  // the edits: the sketch, its cover-ups and redrawn areas are one drawing, recoloured as a whole (the garment's colour) and again inside
  // each colour block; details and stitch lines are drawn on top in their own colours
  const edits = (p.edits || []).filter(e => e.view === view), cloth = hexOf(p.color), blocks = edits.filter(e => e.type === 'block');
  const clothAt = e => { const bl = [...blocks].reverse().find(q => inside([e.x, e.y], q.pts)); return bl ? bl.color : cloth || '#ffffff'; };
  const hit = (e, inner) => editable ? `<g data-ed="${esc(e.id)}">${inner}</g>` : inner;
  const box = e => `<rect x="${n3(e.x - e.w / 2 - .15)}" y="${n3(e.y - e.h / 2 - .15)}" width="${n3(e.w + .3)}" height="${n3(e.h + .3)}" fill="#ffffff" fill-opacity="0"${e.id === selectedEdit ? ' stroke="#2a6df4" stroke-width=".05" stroke-dasharray=".18 .1"' : ''}/>`;
  const under = edits.filter(e => (e.type === 'detail' && e.kind === 'erase') || (e.type === 'ai' && editHrefs[e.art]) || (e.type === 'part' && partOf(e.part))).map(e => e.type === 'ai' || e.type === 'part'
    ? `<image href="${esc(e.type === 'ai' ? editHrefs[e.art] : partHref(partOf(e.part).file))}" x="${n3(e.x - e.w / 2)}" y="${n3(e.y - e.h / 2)}" width="${n3(e.w)}" height="${n3(e.h)}" preserveAspectRatio="none"${e.flip ? ` transform="translate(${n3(2 * e.x)} 0) scale(-1 1)"` : ''}/>`
    : `<rect x="${n3(e.x - e.w / 2)}" y="${n3(e.y - e.h / 2)}" width="${n3(e.w)}" height="${n3(e.h)}" rx=".15" fill="#ffffff"/>`).join('');
  const defs = `<defs><g id="${pid}-b">${parts}${under}</g>${cloth ? tintFilter(`${pid}-t`, cloth) : ''}${blocks.map((e, i) => tintFilter(`${pid}-t${i}`, e.color) + `<clipPath id="${pid}-c${i}"><path d="${pathD(e.pts)} Z"/></clipPath>`).join('')}</defs>`;
  const drawing = `${defs}<use href="#${pid}-b"${cloth ? ` filter="url(#${pid}-t)"` : ''}/>${blocks.map((e, i) => `<g clip-path="url(#${pid}-c${i})"><use href="#${pid}-b" filter="url(#${pid}-t${i})"/></g>`).join('')}`
    // an all-over print: the repeat laid across the cloth (only where the sketch has cloth), then the sketch's lines again on top
    + (p.allover && alloverHref ? `<defs><pattern id="${pid}-ao" patternUnits="userSpaceOnUse" x="0" y="0" width="${n3(p.allover.w)}" height="${n3(p.allover.h)}"><image href="${esc(alloverHref)}" width="${n3(p.allover.w)}" height="${n3(p.allover.h)}" preserveAspectRatio="none"/></pattern>`
      + `<filter id="${pid}-aw" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter><mask id="${pid}-am" maskUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${W}" height="${H}"><use href="#${pid}-b" filter="url(#${pid}-aw)"/></mask>`
      + `<filter id="${pid}-al" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${(() => { const l = rgbOf(lineFor(cloth)); return `0 0 0 0 ${l[0].toFixed(4)} 0 0 0 0 ${l[1].toFixed(4)} 0 0 0 0 ${l[2].toFixed(4)} -.2126 -.7152 -.0722 1 0`; })()}"/></filter></defs>`
      + `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="url(#${pid}-ao)" mask="url(#${pid}-am)"/><use href="#${pid}-b" filter="url(#${pid}-al)"/>` : '')
    + (editable ? blocks.map(e => hit(e, `<path d="${pathD(e.pts)} Z" fill="#ffffff" fill-opacity="0"${e.id === selectedEdit ? ' stroke="#2a6df4" stroke-width=".05" stroke-dasharray=".18 .1"' : ''}/>`)).join('') + edits.filter(e => e.type === 'ai' || e.type === 'part' || (e.type === 'detail' && e.kind === 'erase')).map(e => hit(e, box(e))).join('') : '')
    + edits.filter(e => e.type === 'detail' && e.kind !== 'erase').map(e => { const o = detailSvg(e, clothAt(e)); return hit(e, (editable ? box(e) : '') + o.body + o.stitch); }).join('')
    + edits.filter(e => e.type === 'stitch').map(e => hit(e, (editable ? `<path d="${pathD(e.pts)}" fill="none" stroke="#ffffff" stroke-opacity="0" stroke-width=".45"/>` : '') + stitchSvg(e.pts, e.stitch, hexOf(e.thread) || lineFor(cloth)) + (e.id === selectedEdit ? `<path d="${pathD(e.pts)}" fill="none" stroke="#2a6df4" stroke-width=".02"/>` : ''))).join('');
  const T = (x, y, s, t, a = 'middle', c = '#141416', wgt = 500) => `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${s}" text-anchor="${a}" fill="${c}" font-family="Space Grotesk, Helvetica, Arial, sans-serif" font-weight="${wgt}">${esc(t)}</text>`;
  const arrow = (a, bb, label, col = '#2a6df4') => { const mx = (a[0] + bb[0]) / 2, my = (a[1] + bb[1]) / 2, vert = Math.abs(bb[1] - a[1]) > Math.abs(bb[0] - a[0]); return `<g pointer-events="none"><line x1="${a[0]}" y1="${a[1]}" x2="${bb[0]}" y2="${bb[1]}" stroke="${col}" stroke-width=".03" stroke-dasharray=".14 .08"/><circle cx="${a[0]}" cy="${a[1]}" r=".07" fill="${col}"/><circle cx="${bb[0]}" cy="${bb[1]}" r=".07" fill="${col}"/>${label ? `<rect x="${(vert ? mx + .15 : mx - label.length * fs * .3)}" y="${(vert ? my - fs * .9 : my - fs * 1.75)}" width="${label.length * fs * .6 + .1}" height="${fs * 1.35}" rx=".1" fill="#ffffff" opacity=".92"/>${T(vert ? mx + .2 + label.length * fs * .3 : mx, vert ? my + fs * .3 : my - fs * .75, fs, label, 'middle', col, 600)}` : ''}</g>`; };
  let pl = '';
  for (const q of placements.filter(z => z.view === view)) {
    const lv = (findings[q.id] || []).some(f => f.level === 'fail') ? '#a02a20' : (findings[q.id] || []).some(f => f.level === 'warn') ? '#b07a00' : '#17603a';
    pl += `<g data-pl="${esc(q.id)}"><rect x="${q.x - q.w / 2 - .3}" y="${q.y - q.h / 2 - .3}" width="${q.w + .6}" height="${q.h + .6}" fill="#ffffff" fill-opacity="0"/>${hrefs[q.id] ? `<image href="${esc(hrefs[q.id])}" x="${q.x - q.w / 2}" y="${q.y - q.h / 2}" width="${q.w}" height="${q.h}" preserveAspectRatio="none"/>` : `<rect x="${q.x - q.w / 2}" y="${q.y - q.h / 2}" width="${q.w}" height="${q.h}" fill="#4bff9a" opacity=".35"/>`}<rect x="${q.x - q.w / 2}" y="${q.y - q.h / 2}" width="${q.w}" height="${q.h}" fill="none" stroke="${lv}" stroke-width="${q.id === selected ? .07 : .04}"${q.id === selected ? '' : ' stroke-dasharray=".2 .12"'}/></g>`;
    if (showDims) {
      const top = q.y - q.h / 2, S = STYLES[p.style];
      if (S.kind === 'top' && regionOf(q, g) === 'body') { pl += arrow([q.x, 0], [q.x, top], fmt(top)); if (Math.abs(q.x) >= .125) pl += arrow([0, q.y], [q.x, q.y], fmt(q.x)); }
      else if (S.kind === 'bottom' || S.kind === 'tote' || S.kind === 'beanie') pl += arrow([q.x, 0], [q.x, top], fmt(top));
      else if (S.kind === 'cap') pl += arrow([q.x, 0], [q.x, q.y + q.h / 2], fmt(-(q.y + q.h / 2)));
      pl += `<g pointer-events="none">${T(q.x, q.y + q.h / 2 + fs * 1.3, fs * .9, `${fmt(q.w)} × ${fmt(q.h)}`, 'middle', '#141416', 600)}</g>`;
    }
  }
  // on a sketch only the points it was lined up to sit on it exactly; the table has the rest
  const pom = showPom ? g.pom.filter(q => !d || ['chest', 'length', 'waist', 'crownWidth'].includes(q.key)).map((d, i) => arrow(d.from, d.to, `${String.fromCharCode(65 + Object.keys(p.m).indexOf(d.key))} ${fmt(measurementsFor(p, size)[d.key])}`, '#7a3fd1')).join('') : '';
  const cf = STYLES[p.style].kind === 'top' || STYLES[p.style].kind === 'bottom' ? `<line x1="0" y1="${b.y0 - .6}" x2="0" y2="${b.y1 + .6}" stroke="#9a9aa0" stroke-width=".02" stroke-dasharray=".4 .15 .08 .15"/>${T(0, b.y1 + 1.1, .3, view === 'back' ? 'CB' : 'CF', 'middle', '#727278')}` : '';
  const hps = STYLES[p.style].kind === 'top' ? `<line x1="${b.x0 - 1}" y1="0" x2="${b.x1 + 1}" y2="0" stroke="#9a9aa0" stroke-width=".02" stroke-dasharray=".25 .15"/>${T(b.x1 + 1.1, .1, .28, 'HPS', 'start', '#727278')}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${W.toFixed(2)} ${H.toFixed(2)}"${scale ? ` width="${(W * scale).toFixed(0)}" height="${(H * scale).toFixed(0)}"` : ''} data-view="${view}">${background ? `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff"/>` : ''}${plain ? drawing : `${title ? T(x0 + .4, y0 + .8, .5, title, 'start', '#141416', 600) : ''}${cf}${hps}${drawing}${pl}${pom}${overlay}${T(x0 + W - .4, y0 + H - .4, .28, `${STYLES[p.style].label} · ${view} · size ${STYLES[p.style].oneSize ? 'one size' : size}${cloth ? ` · ${cloth}` : ''}`, 'end', '#727278')}`}</svg>`;
}
// the picture's coordinates → inches, for dragging placements in the page
export function viewBoxOf(p, view, { title = '', size = p.size || 'M' } = {}) { const b = drawingOf(p, view, size)?.box || geometry(p, view, size).bounds, pad = 3.2; return { x0: b.x0 - pad, y0: b.y0 - pad - (title ? 1.2 : 0), w: b.x1 - b.x0 + pad * 2, h: b.y1 - b.y0 + pad * 2 + (title ? 1.2 : 0) }; }

// an all-over print is made one of these ways; a placement can keep one artwork size per group of garment sizes, and its inks per colourway
export const ALLOVER_BASES = ['all-over sublimation', 'all-over screen print', 'jacquard knit'];
function cleanGrade(q) {
  if (!Array.isArray(q.grade) || !q.grade.length) return {}; const seen = new Set(), w0 = Math.max(.25, Number(q.w) || 1), h0 = Math.max(.25, Number(q.h) || 1);
  const grade = q.grade.slice(0, 4).map(g => ({ sizes: (Array.isArray(g?.sizes) ? g.sizes : []).filter(z => SIZES.includes(z) && !seen.has(z) && seen.add(z)), w: r8(Math.min(Math.max(Number(g?.w) || w0, .25), 40)) }))
    .filter(g => g.sizes.length).map(g => ({ ...g, h: r8(g.w * h0 / w0) }));
  return grade.length > 1 ? { grade } : {};
}
function cleanInks(inks) {
  if (!inks || typeof inks !== 'object') return {}; const out = {};
  for (const [cw, map] of Object.entries(inks).slice(0, 8)) { if (!HEX.test(cw) || !map || typeof map !== 'object') continue; const m = {};
    for (const [a, b] of Object.entries(map).slice(0, 12)) if (HEX.test(a) && HEX.test(String(b))) m[a.toLowerCase()] = String(b).toLowerCase();
    if (Object.keys(m).length) out[cw.toLowerCase()] = m; }
  return Object.keys(out).length ? { inks: out } : {};
}
// → clean, bounded params and placements (from the page)
export function cleanFlat(input = {}) {
  const style = STYLES[input.style] ? input.style : null; if (!style) return { error: 'Choose what the piece is' };
  const fit = FITS[input.fit] ? input.fit : 'regular', base = defaultParams(style, fit), m = {};
  for (const k of Object.keys(base.m)) { const v = Number(input.m?.[k]); m[k] = Number.isFinite(v) ? r8(Math.min(Math.max(v, 0), 80)) : base.m[k]; }
  const o = input.options || {}, options = { drop: Boolean(o.drop), cropped: Boolean(o.cropped), pleats: Math.min(Math.max(Math.round(Number(o.pleats) || 0), 0), 2), chestPocket: Boolean(o.chestPocket), noPocket: Boolean(o.noPocket), drawcord: o.drawcord !== false, rib: o.rib !== false };
  const template = input.template === 'none' ? 'none' : FLAT_TEMPLATES.some(t => t.id === input.template && t.style === style) ? input.template : defaultTemplate(style, fit);
  const ao = input.allover, allover = ao && /^[0-9a-f-]{36}$/i.test(String(ao.art || '')) ? { art: ao.art, w: r8(Math.min(Math.max(Number(ao.w) || 4, .5), 48)), h: r8(Math.min(Math.max(Number(ao.h) || 4, .5), 48)), type: String(ao.type || 'straight').slice(0, 20), name: String(ao.name || 'All-over print').replace(/\s+/g, ' ').trim().slice(0, 60),
    base: ALLOVER_BASES.includes(ao.base) ? ao.base : ALLOVER_BASES[0], ...(/^[0-9a-f-]{36}$/i.test(String(ao.techniqueId || '')) ? { techniqueId: ao.techniqueId } : {}) } : null;
  const params = { style, fit, size: SIZES.includes(input.size) ? input.size : 'M', m, options, ...(template ? { template } : {}), color: hexOf(input.color), edits: cleanEdits(input.edits), ...(allover ? { allover } : {}) };
  const placements = (Array.isArray(input.placements) ? input.placements : []).slice(0, 12).map((q, i) => ({
    id: /^[a-z0-9-]{1,40}$/i.test(String(q.id || '')) ? String(q.id) : 'p' + i, name: String(q.name || 'Graphic').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Graphic', view: q.view === 'back' ? 'back' : 'front',
    x: r8(Math.min(Math.max(Number(q.x) || 0, -60), 60)), y: r8(Math.min(Math.max(Number(q.y) || 0, -30), 80)), w: r8(Math.min(Math.max(Number(q.w) || 1, .25), 40)), h: r8(Math.min(Math.max(Number(q.h) || 1, .25), 40)),
    ...(/^[0-9a-f-]{36}$/i.test(String(q.art || '')) ? { art: q.art } : {}), ...(['cue', 'mark', 'word', 'lockup'].includes(q.mark) ? { mark: q.mark === 'cue' ? 'mark' : q.mark } : {}),
    ...(/^[0-9a-f-]{36}$/i.test(String(q.techniqueId || '')) ? { techniqueId: q.techniqueId } : {}), technique: String(q.technique || 'screen print').slice(0, 40), source: ['logo', 'graphic', 'extra', 'studio'].includes(q.source) ? q.source : 'extra',
    ...(/^l[a-z0-9]{1,12}$/.test(String(q.layer || '')) ? { layer: String(q.layer) } : {}), ...cleanGrade(q), ...cleanInks(q.inks)
  }));
  return { params, placements };
}
