// The materials, trims and tags library: fabrics (weight, composition, mill, price, swatch), trims (zips, buttons, drawcords, eyelets…) and
// tags (neck labels, size tabs, care labels, hem tags, waistband labels, hang tags, in their shapes and sizes), kept once and chosen on any
// concept. Choosing one on a concept changes its bill of materials, its landed cost and its margin; the tech pack takes the BOM and label lines.
// The tag drawing and its enums are in src/lab-tags.js (shared with the page).
import { TAG_KINDS, TAG_SHAPES, TAG_FOLDS, TAG_MATERIALS, TAG_ATTACH, TAG_PRINTS, TAG_STRINGS, TAG_FOR, tagWords } from './lab-tags.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, d, a, b) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const HEX = /^#[0-9a-f]{6}$/i;

export const MATERIAL_KINDS = [{ id: 'fabric', label: 'Fabrics' }, { id: 'trim', label: 'Trims' }, { id: 'tag', label: 'Tags and labels' }];
export const FABRIC_CONSTRUCTIONS = ['single jersey', 'heavy jersey', 'loopback fleece', 'brushed fleece', 'French terry', 'rib 1×1', 'rib 2×2', 'waffle', 'piqué', 'twill', 'canvas', 'denim', 'corduroy', 'poplin', 'oxford', 'flannel', 'nylon ripstop', 'nylon taslan', 'polyester shell', 'wool melton', 'knit (jumper)', 'mesh', 'satin', 'other'];
export const FABRIC_FINISHES = ['garment dyed', 'pigment dyed', 'enzyme washed', 'stone washed', 'sun-faded', 'peached', 'brushed', 'mercerised', 'DWR coated', 'waxed', 'raw', 'pre-shrunk', 'none'];
export const TRIM_CATEGORIES = ['zip', 'button', 'snap', 'rivet', 'eyelet', 'drawcord', 'cord stopper', 'aglet', 'elastic', 'webbing', 'buckle', 'hook and loop', 'thread', 'interlining', 'shoulder pad', 'twill tape', 'binding', 'other'];
export const UNITS = ['m', 'yd', 'pc', 'pair', 'set', 'cone', 'roll'];
export const ROLES = [{ id: 'main', label: 'Main fabric' }, { id: 'contrast', label: 'Contrast fabric' }, { id: 'lining', label: 'Lining' }, { id: 'rib', label: 'Rib and trims fabric' }, { id: 'trim', label: 'Trim' }, { id: 'tag', label: 'Tag or label' }];
export const TAG_OPTIONS = { kinds: TAG_KINDS, shapes: TAG_SHAPES, folds: TAG_FOLDS, materials: TAG_MATERIALS, attach: TAG_ATTACH, prints: TAG_PRINTS, strings: TAG_STRINGS, for: TAG_FOR };

// How much fabric one piece usually takes (metres at 150 cm wide), by what it is, and the usual cut-make-trim cost per piece (cents) in a good factory.
export const USAGE_M = { tops: 1.3, knitwear: 1.4, outerwear: 2.6, tailoring: 2.4, bottoms: 1.5, dresses: 2.2, headwear: .25, footwear: .4, bags: 1.1, accessories: .3, home: 1.5, other: 1.2 };
export const MAKING_CENTS = { tops: 480, knitwear: 950, outerwear: 1900, tailoring: 2400, bottoms: 720, dresses: 900, headwear: 320, footwear: 1400, bags: 900, accessories: 260, home: 500, other: 600 };
export const FREIGHT_DUTY_PCT = 18; // landed: freight, duty and insurance on top of factory cost, as a share

// ---- the starting set: ours to change ----
const F = (name, o) => ({ kind: 'fabric', name, unit: 'm', ...o });
const T = (name, o) => ({ kind: 'trim', name, unit: 'pc', ...o });
const G = (name, o) => ({ kind: 'tag', name, unit: 'pc', ...o });
export const BUILTIN_MATERIALS = [
  F('450 gsm loopback fleece, cotton', { key: 'loopback-450', code: 'FB-F01', supplier: 'Mill: to be confirmed (Portugal)', priceCents: 1180, moq: 300, leadDays: 35, spec: { weightGsm: 450, composition: '100% cotton', construction: 'loopback fleece', widthCm: 180, finish: 'garment dyed', stretch: 'none', shrinkage: '3–5%' }, colours: [{ name: 'washed black', hex: '#1f1f22' }, { name: 'bone', hex: '#e9e3d4' }, { name: 'moss', hex: '#5b6648' }], notes: 'Heavy hoodie and sweatpant weight. Pre-wash the sample.' }),
  F('380 gsm brushed-back fleece', { key: 'fleece-380', code: 'FB-F02', supplier: 'Mill: to be confirmed (Turkey)', priceCents: 940, moq: 300, leadDays: 30, spec: { weightGsm: 380, composition: '80% cotton 20% polyester', construction: 'brushed fleece', widthCm: 180, finish: 'pre-shrunk', stretch: 'none', shrinkage: '2–3%' }, colours: [{ name: 'heather grey', hex: '#9a9a9c' }, { name: 'black', hex: '#141416' }] }),
  F('320 gsm French terry', { key: 'terry-320', code: 'FB-F03', supplier: 'Mill: to be confirmed (Portugal)', priceCents: 860, moq: 300, leadDays: 30, spec: { weightGsm: 320, composition: '100% cotton', construction: 'French terry', widthCm: 180, finish: 'enzyme washed', stretch: 'none', shrinkage: '3–4%' }, colours: [{ name: 'ecru', hex: '#efe8d8' }, { name: 'navy', hex: '#1d2540' }] }),
  F('260 gsm heavy jersey', { key: 'jersey-260', code: 'FB-F04', supplier: 'Mill: to be confirmed (Portugal)', priceCents: 640, moq: 300, leadDays: 25, spec: { weightGsm: 260, composition: '100% combed cotton', construction: 'heavy jersey', widthCm: 180, finish: 'garment dyed', stretch: 'none', shrinkage: '4–5%' }, colours: [{ name: 'white', hex: '#f6f4ee' }, { name: 'black', hex: '#141416' }, { name: 'faded red', hex: '#a9463f' }] , notes: 'The heavyweight tee.' }),
  F('180 gsm single jersey', { key: 'jersey-180', code: 'FB-F05', supplier: 'Mill: to be confirmed', priceCents: 420, moq: 500, leadDays: 25, spec: { weightGsm: 180, composition: '100% cotton', construction: 'single jersey', widthCm: 180, finish: 'pre-shrunk', stretch: 'none', shrinkage: '4–5%' }, colours: [{ name: 'white', hex: '#f6f4ee' }, { name: 'black', hex: '#141416' }] }),
  F('2×2 rib, cotton with elastane', { key: 'rib-2x2', code: 'FB-F06', supplier: 'Mill: to be confirmed', priceCents: 580, moq: 100, leadDays: 25, spec: { weightGsm: 300, composition: '95% cotton 5% elastane', construction: 'rib 2×2', widthCm: 100, finish: 'none', stretch: 'high', shrinkage: '3%' }, colours: [{ name: 'self colour', hex: '#141416' }], notes: 'Cuffs, hems and necks. Cut as a tube.' }),
  F('8 oz cotton twill', { key: 'twill-8oz', code: 'FB-F07', supplier: 'Mill: to be confirmed (Japan)', priceCents: 760, moq: 300, leadDays: 40, spec: { weightGsm: 270, composition: '100% cotton', construction: 'twill', widthCm: 150, finish: 'enzyme washed', stretch: 'none', shrinkage: '2–3%' }, colours: [{ name: 'khaki', hex: '#9b8a62' }, { name: 'black', hex: '#141416' }, { name: 'olive', hex: '#566040' }], notes: 'Chinos, work trousers, caps.' }),
  F('13 oz selvedge denim', { key: 'denim-13oz', code: 'FB-F08', supplier: 'Mill: to be confirmed (Japan)', priceCents: 1650, moq: 200, leadDays: 45, spec: { weightGsm: 440, composition: '100% cotton', construction: 'denim', widthCm: 80, finish: 'raw', stretch: 'none', shrinkage: '8–10% unsanforised' }, colours: [{ name: 'indigo', hex: '#2b3a5c' }] }),
  F('70D nylon ripstop, DWR', { key: 'ripstop-70d', code: 'FB-F09', supplier: 'Mill: to be confirmed (Korea)', priceCents: 520, moq: 500, leadDays: 30, spec: { weightGsm: 95, composition: '100% nylon', construction: 'nylon ripstop', widthCm: 150, finish: 'DWR coated', stretch: 'none', shrinkage: '<1%' }, colours: [{ name: 'black', hex: '#141416' }, { name: 'sand', hex: '#c9b893' }] }),
  F('11 oz cotton canvas', { key: 'canvas-11oz', code: 'FB-F10', supplier: 'Mill: to be confirmed', priceCents: 690, moq: 300, leadDays: 30, spec: { weightGsm: 370, composition: '100% cotton', construction: 'canvas', widthCm: 150, finish: 'waxed', stretch: 'none', shrinkage: '2%' }, colours: [{ name: 'tan', hex: '#b08f5c' }, { name: 'black', hex: '#141416' }] }),

  T('YKK #5 metal zip, antique brass, open end', { key: 'zip-5-metal', code: 'FB-T01', supplier: 'YKK', priceCents: 185, moq: 500, leadDays: 20, spec: { category: 'zip', size: '#5, 60 cm (cut to length)', material: 'brass teeth on cotton tape', finish: 'antique brass', qtyPerPiece: 1 }, colours: [{ name: 'black tape', hex: '#141416' }] }),
  T('YKK #3 coil zip, closed end', { key: 'zip-3-coil', code: 'FB-T02', supplier: 'YKK', priceCents: 55, moq: 1000, leadDays: 20, spec: { category: 'zip', size: '#3, 18 cm', material: 'nylon coil', finish: 'tape dyed to match', qtyPerPiece: 1 }, colours: [] , notes: 'Pocket zips.' }),
  T('4-hole corozo button 18L', { key: 'button-18l', code: 'FB-T03', supplier: 'Button supplier: to be confirmed', priceCents: 22, moq: 2000, leadDays: 15, spec: { category: 'button', size: '18L (11.4 mm)', material: 'corozo', finish: 'dyed to match', qtyPerPiece: 7 }, colours: [] }),
  T('Shank jeans button 17 mm, antique nickel', { key: 'jeans-button', code: 'FB-T04', supplier: 'YKK', priceCents: 28, moq: 1000, leadDays: 20, spec: { category: 'button', size: '17 mm', material: 'brass', finish: 'antique nickel', qtyPerPiece: 1 }, colours: [] }),
  T('Burr rivet 8 mm, antique nickel', { key: 'rivet-8', code: 'FB-T05', supplier: 'YKK', priceCents: 9, moq: 2000, leadDays: 20, spec: { category: 'rivet', size: '8 mm', material: 'copper', finish: 'antique nickel', qtyPerPiece: 6 }, colours: [] }),
  T('Flat drawcord 10 mm, cotton', { key: 'drawcord-10', code: 'FB-T06', supplier: 'Trim supplier: to be confirmed', priceCents: 14, moq: 1000, leadDays: 15, spec: { category: 'drawcord', size: '10 mm × 130 cm', material: 'cotton', finish: 'dyed to match', qtyPerPiece: 1 }, colours: [], unit: 'm' }),
  T('Metal aglet, antique brass', { key: 'aglet-brass', code: 'FB-T07', supplier: 'Trim supplier: to be confirmed', priceCents: 12, moq: 2000, leadDays: 15, spec: { category: 'aglet', size: '20 mm', material: 'brass', finish: 'antique brass', qtyPerPiece: 2 }, colours: [] }),
  T('Metal eyelet 8 mm', { key: 'eyelet-8', code: 'FB-T08', supplier: 'Trim supplier: to be confirmed', priceCents: 6, moq: 5000, leadDays: 15, spec: { category: 'eyelet', size: '8 mm', material: 'brass', finish: 'antique brass', qtyPerPiece: 2 }, colours: [] }),
  T('Spring snap 15 mm', { key: 'snap-15', code: 'FB-T09', supplier: 'YKK', priceCents: 16, moq: 2000, leadDays: 20, spec: { category: 'snap', size: '15 mm', material: 'brass', finish: 'matte black', qtyPerPiece: 5 }, colours: [] }),
  T('Woven elastic 40 mm', { key: 'elastic-40', code: 'FB-T10', supplier: 'Trim supplier: to be confirmed', priceCents: 38, moq: 500, leadDays: 15, spec: { category: 'elastic', size: '40 mm', material: 'polyester and rubber', finish: 'soft', qtyPerPiece: 1 }, colours: [], unit: 'm' }),
  T('Polyester core-spun sewing thread 40/2', { key: 'thread-40', code: 'FB-T11', supplier: 'Coats or Gütermann', priceCents: 320, moq: 50, leadDays: 10, spec: { category: 'thread', size: '40/2, 5000 m', material: 'polyester', finish: 'dyed to match', qtyPerPiece: 0.02 }, colours: [], unit: 'cone' }),

  // shirts
  G('Neck label, woven, end fold', { key: 'tag-neck-woven', code: 'FB-L01', supplier: 'Label maker: to be confirmed', priceCents: 9, moq: 1000, leadDays: 14, spec: { tagKind: 'neck', shape: 'rectangle', widthMm: 60, heightMm: 15, fold: 'end fold', material: 'damask woven', attach: 'sewn into the neck seam', for: ['shirts', 'knitwear', 'outerwear'], print: 'woven', string: 'none', eyelet: false, text: ['FUTURE BASICS'] }, colours: [{ name: 'black ground, bone mark', hex: '#141416' }] }),
  G('Neck label, printed, tagless', { key: 'tag-neck-printed', code: 'FB-L02', supplier: 'Heat-transfer label maker', priceCents: 6, moq: 1000, leadDays: 14, spec: { tagKind: 'neck', shape: 'rectangle', widthMm: 55, heightMm: 40, fold: 'none', material: 'printed polyester', attach: 'sewn into the neck seam', for: ['shirts'], print: 'printed', string: 'none', eyelet: false, text: ['FUTURE BASICS', 'M', '100% COTTON · MADE IN PORTUGAL'] }, colours: [], notes: 'A heat-transfer tagless print goes on instead when the neck is to stay clean: same artwork.' }),
  G('Size tab, woven loop', { key: 'tag-size-loop', code: 'FB-L03', supplier: 'Label maker: to be confirmed', priceCents: 4, moq: 1000, leadDays: 14, spec: { tagKind: 'size', shape: 'rectangle', widthMm: 35, heightMm: 10, fold: 'loop', material: 'taffeta woven', attach: 'sewn into the neck seam', for: ['shirts', 'outerwear'], print: 'woven', string: 'none', eyelet: false, text: ['M'] }, colours: [] }),
  G('Care and content label, printed satin, centre fold', { key: 'tag-care', code: 'FB-L04', supplier: 'Label maker: to be confirmed', priceCents: 5, moq: 1000, leadDays: 14, spec: { tagKind: 'care', shape: 'rectangle', widthMm: 35, heightMm: 70, fold: 'centre fold', material: 'printed satin', attach: 'sewn into the side seam', for: ['shirts', 'pants', 'outerwear', 'knitwear'], print: 'printed', string: 'none', eyelet: false, text: ['100% COTTON', 'MACHINE WASH COLD', 'MADE IN PORTUGAL'] }, colours: [] }),
  G('Hem tag, woven loop', { key: 'tag-hem', code: 'FB-L05', supplier: 'Label maker: to be confirmed', priceCents: 6, moq: 1000, leadDays: 14, spec: { tagKind: 'hem', shape: 'rectangle', widthMm: 30, heightMm: 12, fold: 'loop', material: 'damask woven', attach: 'sewn on the hem, left side', for: ['shirts', 'knitwear'], print: 'woven', string: 'none', eyelet: false, text: ['FB'] }, colours: [] }),
  G('Sleeve tag, woven, straight cut', { key: 'tag-sleeve', code: 'FB-L06', supplier: 'Label maker: to be confirmed', priceCents: 7, moq: 1000, leadDays: 14, spec: { tagKind: 'sleeve', shape: 'rectangle', widthMm: 40, heightMm: 12, fold: 'straight cut', material: 'damask woven', attach: 'sewn on the sleeve', for: ['shirts', 'outerwear'], print: 'woven', string: 'none', eyelet: false, text: ['FUTURE BASICS'] }, colours: [] }),
  // pants
  G('Waistband label, woven, straight cut', { key: 'tag-waistband', code: 'FB-L07', supplier: 'Label maker: to be confirmed', priceCents: 11, moq: 1000, leadDays: 14, spec: { tagKind: 'waistband', shape: 'rectangle', widthMm: 70, heightMm: 22, fold: 'straight cut', material: 'damask woven', attach: 'sewn inside the waistband, centre back', for: ['pants'], print: 'woven', string: 'none', eyelet: false, text: ['FUTURE BASICS', 'W32 L32'] }, colours: [] }),
  G('Back pocket patch, leather-look, rounded', { key: 'tag-pocket-patch', code: 'FB-L08', supplier: 'Patch maker: to be confirmed', priceCents: 38, moq: 500, leadDays: 20, spec: { tagKind: 'pocket', shape: 'rounded', widthMm: 60, heightMm: 40, fold: 'none', material: 'leather-look (PU)', attach: 'sewn on the back pocket', for: ['pants'], print: 'debossed', string: 'none', eyelet: false, text: ['FUTURE BASICS'] }, colours: [{ name: 'tan', hex: '#8a5a2b' }, { name: 'black', hex: '#1b1b1d' }] }),
  G('Size tab, pants, printed loop', { key: 'tag-size-pants', code: 'FB-L09', supplier: 'Label maker: to be confirmed', priceCents: 4, moq: 1000, leadDays: 14, spec: { tagKind: 'size', shape: 'rectangle', widthMm: 40, heightMm: 10, fold: 'loop', material: 'printed satin', attach: 'sewn inside the waistband, centre back', for: ['pants'], print: 'printed', string: 'none', eyelet: false, text: ['32 × 32'] }, colours: [] }),
  // outerwear and headwear
  G('Locker loop label, woven', { key: 'tag-locker', code: 'FB-L10', supplier: 'Label maker: to be confirmed', priceCents: 12, moq: 1000, leadDays: 14, spec: { tagKind: 'loop', shape: 'rectangle', widthMm: 70, heightMm: 15, fold: 'loop', material: 'damask woven', attach: 'sewn into the locker loop', for: ['outerwear', 'knitwear'], print: 'woven', string: 'none', eyelet: false, text: ['FUTURE BASICS'] }, colours: [] }),
  G('Sweatband label, woven', { key: 'tag-sweatband', code: 'FB-L11', supplier: 'Label maker: to be confirmed', priceCents: 8, moq: 1000, leadDays: 14, spec: { tagKind: 'sweatband', shape: 'rectangle', widthMm: 50, heightMm: 15, fold: 'end fold', material: 'damask woven', attach: 'sewn into the sweatband', for: ['headwear'], print: 'woven', string: 'none', eyelet: false, text: ['FUTURE BASICS'] }, colours: [] }),
  // hang tags
  G('Hang tag, rectangle, 350 gsm paper', { key: 'hang-rect', code: 'FB-H01', supplier: 'Printer: to be confirmed', priceCents: 24, moq: 1000, leadDays: 14, spec: { tagKind: 'hang', shape: 'rectangle', widthMm: 50, heightMm: 90, fold: 'none', material: 'paper 350 gsm', attach: 'string through the eyelet, around the neck label', for: ['shirts', 'knitwear'], print: 'letterpress', string: 'cotton twine', eyelet: true, text: ['FUTURE BASICS', 'MADE TO LAST'] }, colours: [{ name: 'bone', hex: '#ece6d6' }] }),
  G('Hang tag, square, kraft board', { key: 'hang-square', code: 'FB-H02', supplier: 'Printer: to be confirmed', priceCents: 26, moq: 1000, leadDays: 14, spec: { tagKind: 'hang', shape: 'square', widthMm: 70, heightMm: 70, fold: 'none', material: 'kraft board', attach: 'string through the eyelet, on the belt loop', for: ['pants'], print: 'foil stamp', string: 'waxed cotton cord', eyelet: true, text: ['FUTURE BASICS', 'W32 L32'] }, colours: [{ name: 'kraft', hex: '#b9975b' }] }),
  G('Hang tag, circle, recycled board', { key: 'hang-circle', code: 'FB-H03', supplier: 'Printer: to be confirmed', priceCents: 22, moq: 1000, leadDays: 14, spec: { tagKind: 'hang', shape: 'circle', widthMm: 60, heightMm: 60, fold: 'none', material: 'recycled board 400 gsm', attach: 'string through the eyelet, on the hanger', for: ['headwear', 'accessories'], print: 'letterpress', string: 'black cotton tape', eyelet: true, text: ['FB'] }, colours: [] }),
  G('Hang tag, shield, folded book', { key: 'hang-shield', code: 'FB-H04', supplier: 'Printer: to be confirmed', priceCents: 42, moq: 1000, leadDays: 18, spec: { tagKind: 'hang', shape: 'shield', widthMm: 60, heightMm: 85, fold: 'book fold', material: 'paper 350 gsm', attach: 'string through the eyelet, around the neck label', for: ['outerwear'], print: '4-colour print', string: 'satin ribbon', eyelet: true, text: ['FUTURE BASICS', 'OUTERWEAR', 'CARE INSIDE'] }, colours: [] }),
  G('Size sticker, round', { key: 'sticker-size', code: 'FB-H05', supplier: 'Printer: to be confirmed', priceCents: 2, moq: 5000, leadDays: 10, spec: { tagKind: 'sticker', shape: 'circle', widthMm: 25, heightMm: 25, fold: 'none', material: 'paper 350 gsm', attach: 'peel-and-stick on the polybag', for: ['shirts', 'pants'], print: 'printed', string: 'none', eyelet: false, text: ['M'] }, colours: [] })
];

// ---- cleaning what people type ----
function cleanColours(list) {
  return (Array.isArray(list) ? list : []).map(c => ({ name: clip(c?.name, 40), hex: HEX.test(String(c?.hex || '')) ? String(c.hex).toLowerCase() : '', pantone: clip(c?.pantone, 40) })).filter(c => c.hex || c.name).slice(0, 24);
}
function cleanSpec(kind, s = {}) {
  if (kind === 'fabric') return { weightGsm: Math.round(num(s.weightGsm, 0, 0, 2000)), composition: clip(s.composition, 120), construction: clip(s.construction, 60), widthCm: Math.round(num(s.widthCm, 0, 0, 400)), finish: clip(s.finish, 60), stretch: clip(s.stretch, 40), shrinkage: clip(s.shrinkage, 40) };
  if (kind === 'trim') return { category: TRIM_CATEGORIES.includes(s.category) ? s.category : 'other', size: clip(s.size, 80), material: clip(s.material, 80), finish: clip(s.finish, 80), qtyPerPiece: num(s.qtyPerPiece, 1, 0, 500) };
  const text = (Array.isArray(s.text) ? s.text : String(s.text || '').split(/\n|\//)).map(t => clip(t, 40)).filter(Boolean).slice(0, 4);
  return { tagKind: TAG_KINDS.some(k => k.id === s.tagKind) ? s.tagKind : 'neck', shape: TAG_SHAPES.includes(s.shape) ? s.shape : 'rectangle', widthMm: Math.round(num(s.widthMm, 40, 5, 300)), heightMm: Math.round(num(s.heightMm, 20, 5, 300)),
    fold: TAG_FOLDS.includes(s.fold) ? s.fold : 'none', material: TAG_MATERIALS.includes(s.material) ? s.material : clip(s.material, 40) || 'damask woven', attach: TAG_ATTACH.includes(s.attach) ? s.attach : clip(s.attach, 80),
    for: [...new Set((Array.isArray(s.for) ? s.for : String(s.for || '').split(',')).map(x => clip(x, 20).toLowerCase()).filter(x => TAG_FOR.includes(x)))], print: TAG_PRINTS.includes(s.print) ? s.print : 'none', string: TAG_STRINGS.includes(s.string) ? s.string : 'none', eyelet: Boolean(s.eyelet), text, art: /^[0-9a-f-]{36}$/i.test(String(s.art || '')) ? String(s.art).toLowerCase() : '' };
}
// → { material } or { error }. `base` is the row being changed: only the fields sent change.
export function cleanMaterial(b = {}, base = null) {
  const pick = (k, d) => (b[k] === undefined ? (base ? base[k] : undefined) ?? d : b[k]);
  const kind = pick('kind', 'fabric'); if (!MATERIAL_KINDS.some(k => k.id === kind)) return { error: 'Say whether it is a fabric, a trim or a tag' };
  const name = clip(pick('name', ''), 120); if (name.length < 2) return { error: 'Give it a name' };
  let priceCents = base?.priceCents ?? 0; if (b.price !== undefined) { const n = Number(String(b.price).replace(/[^0-9.]/g, '')); if (!Number.isFinite(n) || n < 0 || n > 1e5) return { error: 'That price does not look right' }; priceCents = Math.round(n * 100); } else if (b.priceCents !== undefined) priceCents = Math.round(num(b.priceCents, 0, 0, 1e7));
  const unit = UNITS.includes(pick('unit', '')) ? pick('unit', '') : kind === 'fabric' ? 'm' : 'pc';
  return { material: { kind, name, code: clip(pick('code', ''), 40), supplier: clip(pick('supplier', ''), 160), priceCents, unit, moq: Math.round(num(pick('moq', 0), 0, 0, 1e6)), leadDays: Math.round(num(pick('leadDays', 0), 0, 0, 365)),
    spec: cleanSpec(kind, b.spec !== undefined ? { ...(base?.spec || {}), ...(b.spec || {}) } : base?.spec || {}), colours: b.colours !== undefined ? cleanColours(b.colours) : (base?.colours || []), notes: clip(pick('notes', ''), 600) } };
}

// ---- a concept's materials and what they cost ----
// what is on the concept: [{ id, role, name, kind, qty, unit, unitCents, colour, note }]
export function cleanPick(b = {}, m, category = 'other') {
  const role = ROLES.some(r => r.id === b.role) ? b.role : m.kind === 'tag' ? 'tag' : m.kind === 'trim' ? 'trim' : 'main';
  const dft = m.kind === 'fabric' ? (USAGE_M[category] ?? 1.2) * (role === 'main' ? 1 : role === 'lining' ? .9 : role === 'contrast' ? .35 : .2) : (m.spec?.qtyPerPiece ?? 1);
  const qty = Math.round(num(b.qty, dft, 0, 1000) * 100) / 100;
  const colour = m.colours?.find(c => c.hex === String(b.colour || '').toLowerCase() || c.name === b.colour) || (HEX.test(String(b.colour || '')) ? { name: '', hex: String(b.colour).toLowerCase() } : null);
  return { id: m.id, role, name: m.name, kind: m.kind, code: m.code || '', supplier: m.supplier || '', qty, unit: m.unit, unitCents: m.priceCents, colour: colour ? { name: colour.name, hex: colour.hex } : null, note: clip(b.note, 200), spec: m.spec };
}
export const marginOf = (priceCents, costCents) => priceCents > 0 && costCents != null ? Math.round((1 - costCents / priceCents) * 1000) / 10 : null;
// → { lines, materialsCents, makingCents, factoryCents, freightCents, landedCents, marginPct, priceCents }
// `decorations` are the flats' placements priced (src/lab-decor.js): their cost per piece, setups shared over the planned quantity, counts in the factory cost
export function costOf(picks = [], { category = 'other', priceCents = null, makingCents = null, freightPct = FREIGHT_DUTY_PCT, decorations = [] } = {}) {
  const lines = picks.map(p => ({ ...p, cents: Math.round(p.qty * p.unitCents) }));
  const deco = (Array.isArray(decorations) ? decorations : []).filter(d => d && Number.isFinite(Number(d.perPieceCents))), decorationCents = deco.reduce((s, d) => s + Number(d.perPieceCents), 0);
  const materialsCents = lines.reduce((s, l) => s + l.cents, 0), making = makingCents ?? MAKING_CENTS[category] ?? MAKING_CENTS.other;
  const factoryCents = materialsCents + decorationCents + making, freightCents = Math.round(factoryCents * freightPct / 100), landedCents = factoryCents + freightCents;
  return { lines, decorations: deco, decorationCents, materialsCents, makingCents: making, factoryCents, freightCents, freightPct, landedCents, priceCents, marginPct: marginOf(priceCents, landedCents) };
}
// the words the image model gets to draw the piece in its fabric
export function fabricWords(m) { if (!m || m.kind !== 'fabric') return ''; const s = m.spec || {}; return [s.weightGsm ? `${s.weightGsm} gsm` : '', s.construction, s.composition ? `(${s.composition})` : '', s.finish && s.finish !== 'none' ? `${s.finish} finish` : ''].filter(Boolean).join(' '); }

// ---- what the tech pack takes ----
export const MATERIALS_NOTE = 'From the materials library';
const ROLE_WORDS = { main: 'Main fabric', contrast: 'Contrast fabric', lining: 'Lining', rib: 'Rib', trim: 'Trim', tag: 'Label' };
// → { bom: [...], labels: [...] } rows in the pack's shape
export function packRows(picks = []) {
  const bom = [], labels = [];
  for (const p of picks) {
    const s = p.spec || {}, money = (p.unitCents / 100).toFixed(2);
    if (p.kind === 'tag') {
      labels.push({ item: `${TAG_KINDS.find(k => k.id === s.tagKind)?.label || 'Label'} · ${p.name}`.slice(0, 120), spec: `${tagWords(s)}${s.text?.length ? `; reads "${s.text.join(' / ')}"` : ''}${p.colour?.name ? `; ${p.colour.name}` : ''}${p.code ? ` (${p.code})` : ''}`.slice(0, 400), placement: `${s.attach || ''}${s.for?.length ? ` · ${s.for.join(', ')}` : ''}`.slice(0, 200) });
      bom.push({ component: `${ROLE_WORDS.tag} · ${p.name}`.slice(0, 160), material: s.material || '', spec: `${s.widthMm} × ${s.heightMm} mm, ${s.shape}${s.fold && s.fold !== 'none' ? ', ' + s.fold : ''}`, supplier: p.supplier, ref: p.code, color: p.colour?.hex || '', placement: s.attach || '', qty: String(p.qty), unit: p.unit, cost: money });
    } else if (p.kind === 'fabric') {
      bom.push({ component: ROLE_WORDS[p.role] || 'Fabric', material: p.name, spec: [s.weightGsm ? `${s.weightGsm} gsm` : '', s.composition, s.construction, s.widthCm ? `${s.widthCm} cm wide` : '', s.finish && s.finish !== 'none' ? s.finish : ''].filter(Boolean).join(', ').slice(0, 300), supplier: p.supplier, ref: p.code, color: p.colour?.hex || '', placement: p.role === 'rib' ? 'Cuffs, hem, neck' : p.role === 'lining' ? 'Inside' : p.note || '', qty: String(p.qty), unit: p.unit, cost: money });
    } else {
      bom.push({ component: `${s.category ? s.category[0].toUpperCase() + s.category.slice(1) : 'Trim'}`, material: p.name, spec: [s.size, s.material, s.finish].filter(Boolean).join(', ').slice(0, 300), supplier: p.supplier, ref: p.code, color: p.colour?.hex || '', placement: p.note || '', qty: String(p.qty), unit: p.unit, cost: money });
    }
  }
  return { bom, labels };
}
export function cleanColourways(list) {
  return (Array.isArray(list) ? list : []).map(c => ({ name: clip(c?.name, 60), hex: HEX.test(String(c?.hex || '')) ? String(c.hex).toLowerCase() : '', pantone: clip(c?.pantone, 40), thread: HEX.test(String(c?.thread || '')) ? String(c.thread).toLowerCase() : '', threadPantone: clip(c?.threadPantone, 40) })).filter(c => c.hex).slice(0, 8);
}
