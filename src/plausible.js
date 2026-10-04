// Plausible measurement ranges by product family, in inches. Wide on purpose: they exist to catch a heel 0.55" wide, a
// chest of 2", a plush 300" tall or a value typed in centimetres, never to argue about half an inch. Used by the
// assistant (to repair or blank a value before it reaches a client) and by the eval scorer.
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// What a measurement name says about its unit or meaning that is not a length: never range-checked.
const NOT_A_LENGTH = /weight|capacity|volume|angle|degree|count|qty|quantity|gsm|denier|spi\b|stitch|\boz\b|\bml\b|\bgrams?\b|pressure|temperature|%|ratio|shrink|stretch|tolerance|price|cost|moq|\bcolou?r\b/;

// ---- Which family is this product? ----
// Order matters: the first family whose words match wins ("dress shoe" is footwear, "plush keychain" is plush).
const FAMILIES = [
  ['footwear', /\b(shoes?|sneakers?|boots?|booties|bootie|sandals?|slippers?|loafers?|oxfords?|derbys?|heels?|pumps?|clogs?|cleats?|footwear|trainers?|mules?|flip[- ]?flops?|moccasins?|espadrilles?|slides?)\b/],
  ['headwear', /\b(caps?|hats?|beanies?|visors?|headbands?|balaclavas?|berets?|snapbacks?|bucket|trapper|fedoras?|durags?|bonnets?)\b/],
  ['plush', /\b(plush(ie|ies)?|stuffed|teddy bear|dolls?|squish(y|mallow)?|stuffies|stuffy)\b/],
  ['tech', /\b(power ?bank|chargers?|cables?|phone|airpods?|earbuds?|headphones?|laptop|tablet|ipad|mouse ?pad|desk ?mat|speaker|case for|usb|magsafe|stand)\b/],
  ['drink', /\b(bottles?|mugs?|cups?|tumblers?|flasks?|thermos|koozie|can cooler|glass(es)? ware|drinkware|jars?)\b/],
  ['jewelry', /\b(rings?|necklaces?|bracelets?|earrings?|pendants?|chains?|anklets?|brooch|jewell?ery|watch(es)?)\b/],
  ['eyewear', /\b(sunglasses|eyeglasses|glasses|goggles|eyewear)\b/],
  ['bag', /\b(bags?|totes?|backpacks?|duffe?ls?|pouch(es)?|purses?|clutch(es)?|satchels?|fanny ?packs?|crossbody|wallets?|luggage|messenger|rucksack|cases?)\b/],
  ['small', /\b(key ?chains?|key ?rings?|charms?|pins?|patch(es)?|stickers?|magnets?|badges?|lanyards?|ornaments?|coasters?|bookmarks?|decals?)\b/],
  ['box', /\b(box(es)?|cartons?|mailers?|packaging|tins?|sleeve box|hang ?tags?)\b/],
  ['hosiery', /\b(socks?|gloves?|mittens?|tights|stockings|leg ?warmers?|arm ?warmers?)\b/],
  ['belt', /\b(belts?|leash|pet collar|dog collar|harness|suspenders)\b/],
  ['flat', /\b(scarf|scarves|blankets?|towels?|throws?|bandanas?|shawls?|scrunchies?|rugs?|pillows?|cushions?|curtains?|banners?|flags?|tapestry|napkins?|aprons?)\b/],
  ['outerwear', /\b(jackets?|coats?|parkas?|puffers?|vests?|windbreakers?|blazers?|anoraks?|ponchos?|truckers?|bombers?|raincoats?|shackets?|overshirts?)\b/],
  ['dress', /\b(dress(es)?|gowns?|jumpsuits?|rompers?|overalls?|onesies?|bodysuits?|kaftans?|robes?)\b/],
  ['bottom', /\b(jeans?|pants?|trousers?|shorts|skirts?|leggings?|joggers?|chinos?|sweatpants?|culottes?|skorts?|cargos?|denim)\b/],
  ['top', /\b(shirts?|tees?|t-?shirts?|tops?|hoodies?|sweatshirts?|sweaters?|cardigans?|polos?|tanks?|blouses?|pullovers?|knits?|crewnecks?|jerseys?|henleys?|tunics?|camis?|bralettes?)\b/]
];
const matchFamily = raw => {
  const text = norm(raw).replace(/\bcap sleeves?\b/g, ' ').replace(/\bshort sleeves?\b/g, ' ').replace(/\boxford (shirts?)\b/g, '$1').replace(/\boxford (cloth|weave|button[- ]?down)\b/g, ' ').replace(/\bbutton[- ]?down\b/g, ' ');
  for (const [name, re] of FAMILIES) if (re.test(text)) return name;
  return null;
};
// The category the assistant wrote ("Footwear — chunky-sole oxford") is richer than the title, so it is tried first.
export function familyOf(category = '', title = '') { return matchFamily(category) || matchFamily(title) || 'generic'; }

// ---- Ranges: [name pattern, low, high], most specific first within a family ----
const APPAREL = [
  [/hood (height|length)/, 8, 20], [/hood width/, 6, 16], [/back neck drop|bnd/, 0.25, 4], [/neck drop|neck depth|front neck/, 1, 10], [/neck (width|opening)|collar (width|opening)|neckline/, 3, 16], [/collar (height|stand)|stand/, 0.25, 4],
  [/shoulder slope|shoulder drop/, 0.25, 4], [/across (shoulder|back)|shoulder( width| to shoulder| span)?$/, 8, 28], [/armhole|arm hole/, 6, 30],
  [/pocket.*(width|opening)/, 2, 14], [/pocket.*(height|depth|length)/, 2, 14], [/pocket/, 0.5, 16],
  [/hem (height|depth|allowance|fold)/, 0.25, 4], [/sleeve (opening|cuff)|cuff/, 1.5, 12], [/sleeve/, 2.5, 36], [/bicep|upper arm|muscle/, 3, 20], [/elbow/, 3, 16], [/forearm/, 3, 14],
  [/waistband|waist band/, 0.5, 5], [/chest|bust|pit to pit|underarm/, 8, 46], [/waist/, 8, 46], [/hip|seat/, 10, 52],
  [/front rise/, 5, 20], [/back rise/, 7, 26], [/rise/, 5, 26], [/inseam|inside leg/, 1, 38], [/outseam|outside leg|side length/, 6, 52],
  [/thigh/, 6, 28], [/knee/, 5, 20], [/calf/, 5, 18], [/leg opening|bottom opening|ankle|leg hem/, 3, 28],
  [/hem|sweep|bottom width/, 8, 80], [/zip(per)?|placket|opening length/, 1.5, 45], [/strap/, 0.25, 30], [/tie|drawcord|drawstring|cord/, 5, 90]
];
const LEN = { top: [10, 42], outerwear: [12, 54], dress: [14, 74], bottom: [5, 52] };
const apparel = fam => [...APPAREL, [/length|hps|hsp|center back|\bcb\b|front length|back length|body length/, ...LEN[fam]]];

const TABLES = {
  top: apparel('top'), outerwear: apparel('outerwear'), dress: apparel('dress'), bottom: apparel('bottom'),
  footwear: [
    [/lace/, 20, 80], [/tongue/, 1.5, 10], [/shaft height|boot height/, 3, 26], [/(outsole|foot|insole|last|sole) length|^length$/, 4, 16], [/forefoot width|ball width|ball girth width|width at ball|^width/, 1.8, 6], [/heel width|heel base width/, 1.2, 5],
    [/heel height|heel pitch|heel stack/, 0.15, 7], [/forefoot stack|stack|platform/, 0.15, 4], [/toe spring/, 0, 2], [/toe box height|toe height|toe box/, 0.4, 3.5], [/collar height|ankle height/, 0.5, 9], [/shaft (circumference|opening)|calf|ankle opening|boot opening/, 5, 22], [/topline|opening/, 4, 20], [/outsole (thickness|height)|sole thickness|lug|cleat/, 0.1, 3], [/eyelet|eyestay/, 0.5, 8], [/pull ?tab|loop/, 0.5, 6]
  ],
  headwear: [
    [/crown circumference|head circumference|circumference|opening/, 17, 27], [/crown height|crown depth|depth/, 2, 8], [/visor length|brim length|bill length|brim|bill|visor length/, 0.5, 6], [/visor width|brim width|bill width/, 4, 11],
    [/sweatband|band height/, 0.5, 2.5], [/cuff height|cuff/, 1, 7], [/strap length|strap|closure/, 2, 14], [/beanie (height|length)|^length|^height|total height/, 5, 16], [/panel/, 1, 14], [/pom|tassel/, 0.5, 8]
  ],
  bag: [
    [/handle drop|drop/, 1, 24], [/strap length|shoulder strap|strap/, 6, 75], [/strap width/, 0.3, 4], [/opening|mouth/, 2, 44], [/zip(per)?/, 2, 44], [/pocket.*(width|height|depth|length)|pocket/, 2, 18],
    [/depth|gusset|base width|thickness/, 0.4, 20], [/height/, 2, 40], [/width|length/, 2, 48]
  ],
  plush: [
    [/seam allowance/, 0.1, 0.75], [/eye/, 0.1, 4], [/nose|snout|muzzle|mouth/, 0.2, 8], [/ear (length|height)|ear/, 0.4, 14], [/tail/, 0.25, 18], [/(arm|paw|flipper|wing) (length|width)?|arm|paw|flipper|wing/, 0.4, 16], [/(leg|foot|hoof) (length|width)?|leg|foot|hoof/, 0.4, 16],
    [/head (circumference|girth)|neck circumference|circumference|girth/, 2, 40], [/head (width|height|length)|head/, 1, 18], [/neck/, 0.5, 12], [/embroider|patch|applique|badge/, 0.25, 10], [/hang ?tag|tag/, 0.5, 6], [/ribbon|bow|scarf|strap|string|cord|loop/, 1, 40],
    [/depth|thickness/, 0.5, 30], [/width/, 1, 40], [/height|length|tall|overall|total|seated|sitting|standing/, 1.5, 60]
  ],
  small: [[/chain|ring (length|loop)|loop|strap|cord|lanyard/, 0.5, 44], [/hole|eyelet/, 0.05, 1], [/ring|clasp|clip|hook/, 0.3, 3], [/thickness|depth/, 0.03, 1.5], [/diameter/, 0.3, 6], [/width/, 0.3, 6], [/height|length|overall|total/, 0.4, 12]],
  jewelry: [[/inner diameter|ring size|inside diameter|ring (width|band)/, 0.3, 1.2], [/necklace|chain length|chain/, 6, 42], [/bracelet|wrist|cuff/, 4, 10], [/drop|earring|pendant (length|height)/, 0.1, 6], [/pendant|charm|stone|bezel|setting/, 0.1, 3], [/thickness|depth/, 0.02, 1], [/diameter|width|length|height/, 0.1, 6]],
  eyewear: [[/lens width|lens height|bridge/, 0.3, 3.5], [/temple|arm length/, 4, 7], [/frame width|total width|front width/, 4, 7], [/height/, 0.8, 3]],
  belt: [[/width|strap width/, 0.3, 4], [/buckle/, 0.5, 4], [/hole|pitch/, 0.2, 2], [/length|total|overall/, 8, 62], [/circumference|neck|girth/, 6, 40]],
  flat: [[/fringe|tassel|hem|border/, 0.1, 8], [/thickness|pile/, 0.05, 3], [/width/, 1, 110], [/length|height|drop/, 1, 130], [/diameter/, 1, 110]],
  hosiery: [[/foot length|sock length|^length/, 3, 14], [/leg (height|length)|cuff|shaft|crew|height/, 1, 26], [/palm width|palm/, 2.5, 6], [/finger|thumb/, 1, 5], [/glove length|total length/, 4, 16], [/width|circumference|opening/, 1.5, 18]],
  drink: [[/mouth|opening|neck diameter/, 0.8, 4.5], [/handle/, 0.5, 6], [/base|bottom diameter/, 1.5, 6], [/diameter|width/, 1.5, 7], [/height|length|tall/, 2, 20], [/thickness|wall/, 0.02, 0.6]],
  tech: [[/thickness|depth|height/, 0.08, 3], [/cable|cord/, 3, 130], [/port|hole|cutout|button/, 0.1, 2.5], [/width/, 1.2, 14], [/length/, 2, 18], [/diameter/, 0.8, 12]],
  box: [[/length/, 1, 60], [/width/, 1, 60], [/height|depth/, 0.2, 60], [/flap|tuck|lip/, 0.2, 8], [/thickness|board/, 0.01, 0.5]],
  generic: []
};
// Names that mean the same thing in any product: the last resort.
const COMMON = [[/diameter/, 0.1, 60], [/circumference|girth/, 1, 80], [/thickness|depth|gusset/, 0.02, 30], [/length|long/, 0.1, 130], [/width|wide/, 0.1, 100], [/height|tall/, 0.1, 100], [/drop/, 0.1, 40]];

// → { lo, hi, family } or null when the name is not a length this module can judge.
export function rangeFor(name, family = 'generic') {
  const n = norm(name); if (!n || NOT_A_LENGTH.test(n)) return null;
  for (const [re, lo, hi] of [...(TABLES[family] || []), ...COMMON]) if (re.test(n)) return { lo, hi, family };
  return null;
}

// Fix a value that is only wrong by its unit: centimetres or millimetres typed where inches were expected.
export function fixUnitSlip(v, range) {
  if (!range || !Number.isFinite(v) || v <= 0 || (v >= range.lo && v <= range.hi)) return null;
  for (const [div, unit] of [[2.54, 'cm'], [25.4, 'mm']]) { const x = v / div; if (x >= range.lo && x <= range.hi) return { value: Math.round(x * 100) / 100, unit }; }
  return null;
}

// Audit rows of the shape { code, name, sample, step } (inches) for a size run. Returns problems per row:
//   out: the sample value is outside the range · grade: some graded size is outside it · backwards: the step runs the wrong way
export function auditRows(rows, { family = 'generic', sizes = [], sampleSize = '' } = {}) {
  const idx = Math.max(0, sizes.indexOf(sampleSize)), problems = [];
  for (const r of rows || []) {
    const sample = Number(r.sample); if (!Number.isFinite(sample)) continue;
    const range = rangeFor(r.name, family); if (!range) continue;
    const step = Number(r.step) || 0;
    if (sample < range.lo || sample > range.hi) { problems.push({ code: r.code, name: r.name, kind: 'out', value: sample, range }); continue; }
    if (sizes.length > 1) {
      const worst = sizes.map((s, i) => sample + (i - idx) * step).filter(v => v < range.lo || v > range.hi);
      if (worst.length) problems.push({ code: r.code, name: r.name, kind: 'grade', value: worst[0], range });
      else if (step < 0) problems.push({ code: r.code, name: r.name, kind: 'backwards', value: step, range });
    }
  }
  return problems;
}
export const FAMILY_NAMES = Object.keys(TABLES);
