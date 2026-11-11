// The supplier catalogue as a client sees it in the Design Lab: every product as something to start a design from. Each item is sent, BY ITS
// NAME, to the Studio base it opens on: a style and its closest library sketch, a library bag, a library shoe, or one of the product types in
// src/lab-goods.js. The catalogue's own sections are not used: they are noisy ("Accessories / Bags" holds tees and polos).
// NOTHING HERE CARRIES A PRICE. What we pay the supplier (costCents, the price status) stays in src/price-catalog.js, which only staff routes
// read; an item here is { id, name, brand, base } and nothing else, and test/lab-catalog.test.js holds the Lab's responses to that.
import { loadCatalogs, wordsOf, wordsMatch } from './price-catalog.js';
import { FLAT_TEMPLATES } from './lab-flat-templates.js';
import { BAG_TEMPLATES } from './lab-bag-templates.js';
import { FOOTWEAR_TEMPLATES } from './lab-footwear-templates.js';
import { GOODS } from './lab-goods.js';

// ---- the rules: the first that matches the name decides. [base, what the name says, 'full'?] ----
// A base is a style of the flats (tee, hoodie, cap…), a library bag (bag-…), a library shoe (footwear-…) or a product type (src/lab-goods.js).
// A name is read up to its "with…" or "for…" first ("Travel Blanket with Zipper Pouch" is a blanket, not a pouch); a rule marked 'full'
// reads all of it ("Tumbler With A Handle"). A name nothing matched in its first part is then read whole.
export const RULES = [
  // what the Studio has no drawing for: these open on a plain panel (the "other" product type), and are counted in the tests
  ['other', /massage gun|usb hub|mclighty|bottle opener|luggage (tag|cover)|punching bag|neck pillow|eye mask|\b(arm|leg) sleeve|necktie|gift wrap|wrapping paper|hammock|oven mitt|potholder|tree skirt|bento|food storage|hair brush|\bknife\b|music box|night light|mirror light|door socks|dinner plates|\bchairs?\b|pong table|beach cruiser|cornhole|dartboard|\bskis\b|snowboard|surfboard|beach wrap|poncho|shoes pad|headphones|airpod max|stuffed|\bwallet\b/, 'full'],
  // a product named with another product's word
  ['seatcover', /seat covers?/], ['wheelcover', /steering wheel/], ['carmat', /car (floor )?mats?/], ['plate', /licen[sc]e plate/],
  ['petmat', /pet (feeding )?mats?|pet mat/], ['petbed', /pet beds?/], ['petbowl', /pet bowl/], ['bandana', /bandana(?! bib)/], ['petcollar', /pet (collar|leash)/],
  ['pettee', /\b(dog|pet|animal)\b.*\b(hoodie|sweater|shirt|coat|clothes|clothing|outfit)/, 'full'],
  ['bib', /\bbib\b/], ['facemask', /face mask/], ['stocking', /stocking/],
  ['ball', /soccer ball|leather basketball/],
  // tech
  ['phonecase', /phone cases?|flex case|(iphone|galaxy).*case/], ['earbudscase', /airpod|earbuds?|earphones?/],
  ['deskmat', /desk (mat|pad)|gaming mat|keyboard pad|mouse mat/], ['mousepad', /mouse ?pad/], ['chargingpad', /charging pad/],
  ['powerbank', /power ?bank|juice pack/], ['speaker', /speaker/], ['laptopsleeve', /(laptop|tablet) sleeve/],
  // bags (before drinkware: a wine tote is a tote)
  ['cancooler', /slim cooler|can holder|insulator/],
  ['cooler', /lunch (bag|box)|cooler|picnic bag|insulated meal/],
  ['bag-drawstring', /drawstring|cinch|laundry bag|shoe bags?|drawcord wine bag/],
  ['bag-backpack', /backpack|bookbag|daypack|diaper bag/],
  ['bag-waist', /fanny|waist (bag|pack)/],
  ['bag-pouch', /pouch|cosmetic|make ?up bag|dopp kit|pencil case|wristlet|clutch|purse|cross-?body|pen bag/],
  ['bag-sling', /sling ?bag|chest bag/],
  ['bag-duffel', /duff(el|le)|luggage bag|weekender bag|gym bag/],
  ['bag-messenger', /messenger|shoulder bag|saddle bag|satchel|over the shoulder/],
  ['bag-tote', /weekender tote|leather tote|handbag|wine tote|summer bag/],
  ['tote', /\btotes?\b|shopping bags?/],
  // drinkware
  ['tumblerhandle', /(tumblers?|mug|cup) .*\bhandle\b|travel (coffee )?mug/, 'full'],
  ['canglass', /can glass|glass cups?|beer can/], ['pintglass', /pint glass|pub glass/], ['wineglass', /wine (glass|tumbler|cup)/], ['rocksglass', /rocks glass/],
  ['mug', /\bmugs?\b|\bstein\b/], ['tumbler', /tumblers?/], ['bottle', /\bbottles?\b|h2go bolt|kensington bpa|camelbak/], ['tumbler', /insulated cup|chill cups?/],
  // footwear: the library has no sandals, so those are product types
  ['flipflop', /flip ?flops?/], ['clog', /\bclogs?\b/], ['slide', /\bslides?\b|sliders?|sandals?|slippers?/],
  ['footwear-lifestyle-basketball-high', /high top.*(leather|sneaker)/], ['footwear-lifestyle-court-mid', /high top/], ['footwear-lifestyle-chunky-runner', /chunky/],
  ['footwear-running-max-cushion', /rocking shoes/], ['footwear-running-daily', /running shoes|mesh.*sneakers|knit sneakers/],
  ['footwear-lifestyle-court-low', /sneakers?|\bshoes\b/],
  // socks, scarves, belts
  ['socks', /\bsocks\b/], ['scarf', /scar(f|ves)/], ['belt', /web belt/],
  // home textiles (before clothes: a hooded blanket is a blanket)
  ['showercurtain', /shower curtain/], ['curtain', /curtain/],
  ['pillowcase', /pillow ?cases?|pillow cover|cushion cover|pillow shams?/], ['pillow', /pillow|cushion/],
  ['bedding', /duvet|comforter|bedding|bedspread|coverlet|bedrunner/], ['blanket', /blankets?|\bthrow\b|beach sheet|boho cloth/],
  ['teatowel', /tea towel|dish towel/], ['yogamat', /yoga mat/], ['towel', /towels?/], ['doormat', /door ?mat|bath mat/], ['rug', /\brugs?\b/],
  ['placemat', /placemat/], ['napkin', /napkin/], ['tablerunner', /table runner|quilted runner/], ['tablecloth', /tablecloth/], ['apron', /apron|\bsmock\b/],
  // wall art and decor, paper, sports
  ['tapestry', /tapestry|knitted wall art/], ['clock', /clock/], ['sign', /\bsigns?\b|metal print|sheet wall/], ['canvas', /wrapped canvas/], ['poster', /poster/], ['flag', /\bflags?\b|pennant/],
  ['sticker', /sticker/], ['notebook', /journal|notebook/], ['puzzle', /puzzle|jigsaw/], ['coaster', /coaster/], ['card', /playing cards/], ['calendar', /calendar/], ['recordsleeve', /vinyl|cassette/],
  ['skateboard', /skateboard/], ['paddle', /paddle|ping pong bat/], ['umbrella', /umbrella/],
  // headwear
  ['bucket', /bucket/], ['beanie', /beanie|balaclava/], ['cap', /\bcaps?\b|\bhats?\b|snapbacks?|trucker|visor/],
  // clothes: "t-shirt" is read as "tee" first, so a "shirt" below is a woven shirt
  ['bikini', /bikini/], ['swimsuit', /swimsuit/], ['shorts', /swim trunks|board shorts|beach shorts/],
  ['bodysuit', /bodysuit|romper|jumpsuit/], ['bra', /sports? bra|bra top/], ['leggings', /leggings?|tights|capris/], ['skirt', /skirts?\b|skort/], ['dress', /\bdress(es)?\b/],
  ['coat', /bathrobe|parka|duster/], ['vest', /\bvests?\b|gilet/], ['jacket', /cardigan|shrug/],
  ['ziphoodie', /\bzip\b.*hood|hood.*\bzip\b|zip up hoodie/],
  ['jacket', /jackets?|\bjac\b|windbreaker|anorak|bomber|shacket|\bpuf/],
  ['hoodie', /hoodie|hooded|\bhood\b/],
  ['tank', /basketball.*jersey|\btanks?\b|sleeveless/],
  ['longsleeve', /hockey jersey/], ['tee', /\b(football|soccer|baseball|rugby|reversible|basketball)\b.*jersey|\bjersey$/],
  ['polo', /\bpolos?\b|henley|sport shirt/],
  ['crewneck', /(1\/4|1\/2|quarter|half)[- ]zip|cover-up/],
  ['shirtss', /button up short sleeve|short sleeves?.*(shirt|button|blouse)|camp shirt|sportshirt|hawaiian/],
  ['longsleeve', /long[- ]?sleeves?.*\b(tees?|top)\b|\bl\/s\b|longsleeve|3\/4|three-quarter|baseball tee|thermal/],
  ['tee', /\btees?\b|performance shirt/],
  ['shirt', /\bshirts?\b|button[- ]down|blouse/],
  ['shorts', /\bshorts\b|\bshort$|trunks|boxer briefs/],
  ['pants', /joggers?|sweat ?pants?|\bpants?\b|trousers?|overalls|culottes/],
  ['crewneck', /sweat ?shirt|sweatershirt|crew ?neck (pullover|cardigan)|crewneck|\bcrew\b(?! neck)|pullover|sweater|tunic|\bfleece$/],
  ['longsleeve', /long[- ]sleeve|mock turtleneck/],
  ['tee', /crew neck|\btops?\b|\bshi$|dolman|short sleeve|max heavyweight/]
];

// ---- which library sketch of a style: the first whose words the name says, else the style's plainest (the last) ----
export const SKETCH = {
  tee: [[/soccer/, 'tee-soccer-jersey'], [/football|rugby/, 'tee-v-neck-football-jersey'], [/jersey$|baseball jersey|reversible|two-button|basketball/, 'tee-sports-jersey'], [/raglan/, 'tee-raglan'], [/v-?neck/, 'tee-vneck'], [/baby tee/, 'tee-baby-tee'], [/crop/, 'tee-cropped-tee'], [/boxy/, 'tee-heavyweight-boxy-tee'], [/oversize/, 'tee-oversized'], [/drop shoulder/, 'tee-dropped-shoulder-tee'], [/heavy/, 'tee-heavyweight-tee'], 'tee-classic'],
  longsleeve: [[/hockey|jersey$/, 'ls-v-neck-long-sleeve-jersey'], [/raglan|3\/4|three-quarter|baseball/, 'ls-raglan-long-sleeve-tee'], [/boxy/, 'ls-long-sleeve-boxy-tee'], [/thermal|compression/, 'ls-rib-paneled-base-layer'], 'ls-long-sleeve-tee'],
  crewneck: [[/(1\/4|quarter)[- ]zip/, 'crew-quarter-zip-sweatshirt'], [/(1\/2|half)[- ]zip|cover-up/, 'crew-half-zip-pullover'], [/crop/, 'crew-cropped-sweatshirt'], [/oversize/, 'crew-oversized-crewneck'], [/heavy/, 'crew-heavy'], 'crew-classic'],
  hoodie: [[/crop/, 'hood-cropped-hoodie'], [/boxy|oversize/, 'hood-boxy'], 'hood-classic'],
  ziphoodie: [[/crop/, 'zip-cropped'], [/oversize/, 'zip-oversized-zip-hoodie'], 'zip-classic'],
  jacket: [[/cardigan|shrug/, 'jk-button-cardigan'], [/bomber|varsity/, 'jk-bomber'], [/track/, 'jk-track'], [/denim/, 'jk-denim-jacket'], [/shacket/, 'jk-hooded-shirt-jacket'], [/hooded.*puf|puf.*hood/, 'jk-hooded-puffer'], [/\bpuf/, 'jk-stand-collar-puffer'], [/anorak|pullover|(quarter|1\/2|1\/4)[- ]zip/, 'jk-raglan-half-zip-anorak'], [/coach|point collar/, 'jk-harrington-jacket'], [/duck|detroit|chore|work/, 'jk-chore-jacket'], [/windbreaker|soft shell|fleece/, 'jk-funnel'], 'jk-zip'],
  coat: [[/parka/, 'coat-long-puffer-parka'], [/robe/, 'coat-belted-trench-jacket'], 'coat-overcoat'],
  vest: [[/denim/, 'vest-denim-vest'], [/puffer/, 'vest-puffer-vest'], [/turtleneck/, 'vest-turtleneck-knit-vest'], [/crop/, 'vest-cropped-sweater-vest'], [/neck|cardigan|oversized/, 'vest-tipped-sweater-vest'], [/class|reflective|mesh|utility/, 'vest-utility-vest'], 'vest-zip-fleece-vest'],
  polo: [[/henley/, 'polo-henley-sweatshirt'], [/sweatshirt|pullover/, 'polo-johnny-collar-sweatshirt'], [/long sleeve|three-quarter/, 'polo-long-sleeve-polo'], 'polo-classic-polo'],
  shirt: [[/work|utility/, 'shirt-utility-shirt'], [/western|denim/, 'shirt-western-overshirt'], [/button[- ]down/, 'shirt-button-down-shirt'], [/oversize/, 'shirt-oversized-shirt'], 'shirt-classic-shirt'],
  shirtss: [[/camp|hawaiian/, 'ss-camp-collar-shirt'], [/work|fishing/, 'ss-two-pocket-work-shirt'], 'ss-short-sleeve-shirt'],
  tank: [[/muscle/, 'tank-muscle-tank'], [/crop|racerback/, 'tank-cropped-racer-tank'], [/rib/, 'tank-rib-tank'], [/sleeveless tee/, 'tank-sleeveless-tee'], 'tank-classic-tank'],
  pants: [[/cargo/, 'pt-cargo'], [/jogger/, 'pt-classic-joggers'], [/wide/, 'pt-wide-leg-sweatpants'], [/straight|open-bottom|lounge|pajama/, 'pt-straight-sweatpants'], [/sweat ?pant|fleece/, 'pt-jogger'], [/track|athletic|sport/, 'pt-straight-track-pants'], [/overalls|denim|jean/, 'pt-jean'], [/culottes|flare/, 'pt-wide-leg-trousers'], 'pt-chino'],
  shorts: [[/mesh|basketball/, 'sh-mesh-basketball-shorts'], [/boxer/, 'sh-boxer-briefs'], [/biker|compression/, 'sh-bike-shorts'], [/running|octane|pulse/, 'sh-running-shorts'], [/cargo/, 'sh-cargo'], [/denim/, 'sh-denim'], [/lounge/, 'sh-lounge-shorts'], [/swim|board|beach|training|athletic|gym/, 'sh-elastic-waist-shorts'], 'sh-sweat'],
  leggings: ['lg-leggings'],
  skirt: [[/skort/, 'sk-elastic-mini-skort'], [/skater|flare/, 'sk-flared-mini-skirt'], [/long|maxi/, 'sk-maxi-skirt'], 'sk-mini-skirt'],
  dress: [[/long sleeve.*(long|flowy)|flowy/, 'dr-long-sleeve-maxi-dress'], [/long sleeve/, 'dr-long-sleeve-mini-dress'], [/one shoulder/, 'dr-one-shoulder-column-dress'], [/racerback|tank dress/, 'dr-racer-maxi-dress'], [/slip|spaghetti|evening|long dress|long draped/, 'dr-slip-maxi-dress'], [/off the shoulder|strapless/, 'dr-strapless-mini-dress'], 'dr-t-shirt-dress'],
  bodysuit: [[/long sleeve/, 'bs-long-sleeve-bodysuit'], 'bs-crew-tee-bodysuit'],
  bra: ['bra-scoop-sports-bra'], bikini: ['bk-triangle-string-bikini'], swimsuit: ['sw-scoop-back-swimsuit'],
  cap: ['cap-6panel'], bucket: ['bucket-bucket-hat'], beanie: [null], tote: [null] // a beanie and a tote are drawn from their measurements: no sketch
};
const STYLE_LABEL = { tee: 'T-shirt', longsleeve: 'Long-sleeve tee', crewneck: 'Crewneck sweatshirt', hoodie: 'Pullover hoodie', ziphoodie: 'Zip hoodie', jacket: 'Jacket', coat: 'Coat', vest: 'Vest', polo: 'Polo', shirt: 'Button-up shirt', shirtss: 'Short-sleeve shirt', tank: 'Tank', pants: 'Pants', shorts: 'Shorts', leggings: 'Leggings', skirt: 'Skirt', dress: 'Dress', bodysuit: 'Bodysuit', bra: 'Sports bra', bikini: 'Bikini', swimsuit: 'Swimsuit', cap: 'Cap', bucket: 'Bucket hat', beanie: 'Beanie', tote: 'Tote bag' };
const STYLE_GROUP = { tee: 'Tees, tops and shirts', longsleeve: 'Tees, tops and shirts', tank: 'Tees, tops and shirts', polo: 'Tees, tops and shirts', shirt: 'Tees, tops and shirts', shirtss: 'Tees, tops and shirts', bodysuit: 'Tees, tops and shirts', bra: 'Tees, tops and shirts',
  crewneck: 'Sweatshirts and hoodies', hoodie: 'Sweatshirts and hoodies', ziphoodie: 'Sweatshirts and hoodies', jacket: 'Jackets and outerwear', coat: 'Jackets and outerwear', vest: 'Jackets and outerwear',
  pants: 'Bottoms', shorts: 'Bottoms', leggings: 'Bottoms', skirt: 'Bottoms', dress: 'Dresses', bikini: 'Swim', swimsuit: 'Swim', cap: 'Headwear', bucket: 'Headwear', beanie: 'Headwear', tote: 'Bags' };
// the groups a client browses by, in the order they are listed
export const GROUPS = ['Tees, tops and shirts', 'Sweatshirts and hoodies', 'Jackets and outerwear', 'Bottoms', 'Dresses', 'Swim', 'Headwear', 'Bags', 'Footwear', 'Socks, scarves and sandals', 'Kids and baby', 'Drinkware', 'Home textiles', 'Wall art and decor', 'Tech', 'Paper and small goods', 'Pets', 'Sports and outdoor', 'Automotive', 'Music', 'Other'];

const norm = name => String(name || '').toLowerCase().replace(/[®™]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\bt[- ]?\s?shirts?\b/g, 'tee').replace(/\btshirts?\b/g, 'tee').replace(/\s+/g, ' ').trim();
const coreOf = n => n.split(/ with | w\/ | without | for | suitable | compatible /)[0].replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+[^-]*$/, m => (/[a-z]{4}/.test(m.replace(/\s+-\s+/, '')) && !/print|only|laser|natural|green|tan|buckle|large|small|medium|bone|fish|ruled/.test(m) ? m : '')).trim();
const ruleFor = name => { const n = norm(name), core = coreOf(n); return RULES.find(([, re, full]) => re.test(full ? n : core)) || RULES.find(([, re]) => re.test(n)) || null; };
const sketchFor = (style, n) => { const list = SKETCH[style] || [null]; for (const s of list) { if (!Array.isArray(s)) return s; if (s[0].test(n)) return s[1]; } return null; };

// → the base a name opens on: { kind: 'style' | 'bag' | 'shoe' | 'new', key, group, label, … } or null when no rule matched
//   style: { style, template (a library sketch id, or null for a style drawn from its measurements) }
//   bag:   { template (a library bag id) }      shoe: { template (a library shoe id) }      new: { type (a src/lab-goods.js product type) }
export function classify(name) {
  const r = ruleFor(name); if (!r) return null; const key = r[0];
  if (key.startsWith('bag-')) { const t = BAG_TEMPLATES.find(x => x.id === key); return t ? { kind: 'bag', key, group: 'Bags', label: t.label, template: t.id } : null; }
  if (key.startsWith('footwear-')) { const t = FOOTWEAR_TEMPLATES.find(x => x.id === key); return t ? { kind: 'shoe', key, group: 'Footwear', label: t.label, template: t.id } : null; }
  if (GOODS[key]) return { kind: 'new', key, group: GOODS[key].group, label: GOODS[key].label, type: key };
  if (!SKETCH[key]) return null;
  const template = sketchFor(key, norm(name)), t = template ? FLAT_TEMPLATES.find(x => x.id === template && x.style === key) : null; if (template && !t) return null;
  return { kind: 'style', key, group: STYLE_GROUP[key], label: t ? t.label : STYLE_LABEL[key], style: key, template: t ? t.id : null };
}

// ---- the catalogue for the Lab: id, name, brand and base. Built once; never a price ----
const OTHER = { kind: 'new', key: 'other', group: GOODS.other.group, label: GOODS.other.label, type: 'other' }; // a name no rule matched (the tests hold this at none)
let built = null;
export function labCatalog(catalogs = loadCatalogs()) {
  if (built && catalogs === loadCatalogs()) return built;
  const items = catalogs.flatMap(c => c.items).map(i => { const base = classify(i.name) || OTHER; return { id: i.id, name: i.name, brand: i.brand || '', base, words: wordsOf(`${i.name} ${i.brand || ''} ${base?.label || ''} ${base?.group || ''}`) }; });
  const out = { items, byId: new Map(items.map(i => [i.id, i])) };
  if (catalogs === loadCatalogs()) built = out;
  return out;
}
const view = i => ({ id: i.id, name: i.name, brand: i.brand, base: i.base });
export const labCatalogItem = (id, cat = labCatalog()) => { const i = cat.byId.get(String(id || '')); return i ? view(i) : null; };
// Browse: every word typed must be in the product (its name, brand, what it opens on, its group), as the staff search does (src/price-catalog.js);
// group is one of GROUPS. → { total, count (the whole catalogue), items, groups: [{ name, count }] (of what the words found) }
export function browseLabCatalog({ q = '', group = '', limit = 48, offset = 0 } = {}, cat = labCatalog()) {
  const want = wordsOf(q), found = want.length ? cat.items.filter(i => wordsMatch(i.words, want)) : cat.items, hits = group ? found.filter(i => i.base?.group === group) : found;
  const n = Math.max(1, Math.min(96, Number(limit) || 48)), from = Math.max(0, Math.floor(Number(offset) || 0));
  const counts = new Map(); for (const i of found) counts.set(i.base?.group || 'Other', (counts.get(i.base?.group || 'Other') || 0) + 1);
  return { total: hits.length, count: cat.items.length, offset: from, items: hits.slice(from, from + n).map(view), groups: GROUPS.filter(g => counts.has(g)).map(name => ({ name, count: counts.get(name) })) };
}
// how many products open on each kind of base, and on each product type (the numbers the docs and the brief quote)
export function labCatalogSummary(cat = labCatalog()) {
  const kinds = {}, types = {}, styles = {};
  for (const i of cat.items) { const b = i.base; kinds[b.kind] = (kinds[b.kind] || 0) + 1; if (b.kind === 'new') types[b.type] = (types[b.type] || 0) + 1; if (b.kind === 'style') styles[b.style] = (styles[b.style] || 0) + 1; }
  return { count: cat.items.length, kinds, types, styles, other: types.other || 0 };
}
