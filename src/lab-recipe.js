// The recipe menu: design by picking, the way a client who is not a designer thinks about a piece.
//   1. a base: a staple garment at its usual fit (a boxy tee, a relaxed hoodie, a wide trouser)
//   2. add-ons: pockets, closures and finishes that suit that base (a kangaroo pocket only on a top, back welts only on a bottom)
//   3. a colour system: a few colours that work together; the first is the garment, the next becomes the stitching, and every one is a colourway
// cookRecipe() turns the picks into real flats (src/lab-flats.js params, with each add-on as a detail placed where it usually goes), so the
// piece opens in the studio already measured, drawn and coloured. Shared by the page (/lab/recipe) and the service (POST /v1/lab/concepts/from-recipe).
import { STYLES, FITS, defaultParams, defaultDetail, defaultTemplate, fitToTemplate, cleanFlat } from './lab-flats.js';
import { FLAT_TEMPLATES } from './lab-flat-templates.js';
import { necklineMeasures } from './lab-neck.js';

// sketch: the sketch the base is drawn on (the style's usual one when not named): a plain body, so the add-ons are what make it different
const B = (id, label, style, fit, note, options = {}, sketch = null) => ({ id, label, style, fit, note, options, ...(sketch ? { sketch } : {}) });
export const RECIPE_BASES = [
  B('tee', 'Classic tee', 'tee', 'regular', 'The everyday crew-neck tee.'),
  B('tee-boxy', 'Boxy tee', 'tee', 'boxy', 'Short and wide, with a dropped shoulder.'),
  B('tee-over', 'Oversized tee', 'tee', 'oversized', 'Long, roomy and relaxed.'),
  B('longsleeve', 'Long-sleeve tee', 'longsleeve', 'regular', 'A tee with long sleeves and ribbed cuffs.', {}, 'ls-long-sleeve-tee'),
  B('tank', 'Tank', 'tank', 'regular', 'Sleeveless, for summer and the gym.'),
  B('polo', 'Polo', 'polo', 'regular', 'A knit polo with a short placket.'),
  B('crewneck', 'Crewneck sweatshirt', 'crewneck', 'relaxed', 'A fleece crew with rib cuffs and hem.'),
  B('hoodie', 'Pullover hoodie', 'hoodie', 'relaxed', 'The heavyweight hoodie, drawcord in the hood.'),
  B('ziphoodie', 'Zip hoodie', 'ziphoodie', 'regular', 'A full-zip hoodie.'),
  B('shirt', 'Button-up shirt', 'shirt', 'regular', 'A woven shirt with a collar and placket.', {}, 'shirt-classic-shirt'),
  B('shirtss', 'Camp shirt', 'shirtss', 'boxy', 'A short-sleeve woven shirt, cut boxy.'),
  B('jacket', 'Zip jacket', 'jacket', 'regular', 'A light zip-front jacket.'),
  B('vest', 'Vest', 'vest', 'regular', 'A sleeveless zip layer.', {}, 'vest-zip-fleece-vest'),
  B('pants', 'Straight trousers', 'pants', 'regular', 'A straight-leg trouser.'),
  B('pants-wide', 'Wide trousers', 'pants', 'wide', 'A wide, easy leg.', {}, 'pt-wide-leg-trousers'),
  B('shorts', 'Shorts', 'shorts', 'regular', 'An everyday short.'),
  B('leggings', 'Leggings', 'leggings', 'slim', 'Close-fitting, for training.'),
  B('coat', 'Coat', 'coat', 'regular', 'A long outer layer.', {}, 'coat-overcoat'),
  B('dress', 'Dress', 'dress', 'regular', 'A one-piece dress.', {}, 'dr-t-shirt-dress'),
  B('skirt', 'Skirt', 'skirt', 'regular', 'A skirt from the waistband.', {}, 'sk-flared-mini-skirt'),
  B('cami', 'Cami top', 'cami', 'regular', 'A strappy top.'),
  B('bodysuit', 'Bodysuit', 'bodysuit', 'slim', 'Close-fitting, snaps at the base.'),
  B('cap', 'Six-panel cap', 'cap', 'regular', 'A classic cap.'),
  B('bucket', 'Bucket hat', 'bucket', 'regular', 'A soft, all-round brim.'),
  B('beanie', 'Cuffed beanie', 'beanie', 'regular', 'A knit beanie with a cuff.'),
  B('tote', 'Tote bag', 'tote', 'regular', 'A carry-all with two handles.'),
].filter(b => STYLES[b.style] && FITS[b.fit] && (!b.sketch || FLAT_TEMPLATES.some(t => t.id === b.sketch && t.style === b.style)));
// the sketch a base is drawn on before anything is added
export const baseSketch = b => b.sketch || defaultTemplate(b.style, b.fit) || null;

// an add-on: a detail placed on the piece, or an option on its make. `on` says which bases it suits (style keys).
//   words  steer which sketch from the sketch pack the piece is drawn on (src/lab-flats.js defaultTemplate): "cargo" picks the cargo trousers
//   shown  when the chosen sketch's name matches it, the sketch already draws this, so no detail is added on top (a hoodie's kangaroo pocket,
//          a chino's slant pockets); otherwise the detail is drawn where that kind of detail usually goes
//   one    add-ons where only one can be chosen (two kinds of front pocket would sit on top of each other)
//   sketch the sketch the piece is drawn on with this add-on, per base id or style ([style, sketch id]): a collar, a cropped body. Only one
//          add-on that changes the sketch can be picked at a time (see reshapes), so two never quietly cancel each other out
//   place  where the detail goes on this piece, in inches, when its usual place is wrong for it (p: the piece's params)
const D = (id, label, group, on, detail, extra = {}) => ({ id, label, group, on, detail, ...extra });
// where the button-down collar's buttons sit on the plain shirt sketch (shirt-classic-shirt), in inches from the centre front and the neck point
const BUTTON_DOWN = { x: 2.2, y: 5.45 };
const BOTTOMS_WITH_POCKETS = /chino|jean|trouser|pleat|carpenter|work|cargo|denim|five-pocket|jort|walk|wide|straight|barrel|flare|skinny|slim|baggy|tailor/i;
const TOPS_AND_BOTTOMS = ['tee', 'longsleeve', 'tank', 'polo', 'crewneck', 'hoodie', 'ziphoodie', 'shirt', 'shirtss', 'jacket', 'vest', 'pants', 'shorts', 'skirt', 'dress'];
export const RECIPE_ADDONS = [
  D('chest-pocket', 'Chest pocket', 'Pockets', ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'polo', 'tank', 'shirt', 'shirtss', 'jacket', 'vest', 'coat'], { kind: 'pocket-patch' }, { one: 'chest' }),
  D('front-pocket', 'Front pocket', 'Pockets', ['tote'], { kind: 'pocket-patch', place: p => ({ x: 0, y: (p.m.height || 15) * .55, w: 6, h: 6.5 }) }),
  D('flap-pocket', 'Flap chest pocket', 'Pockets', ['shirt', 'shirtss', 'jacket', 'vest', 'coat', 'crewneck', 'longsleeve'], { kind: 'pocket-flap' }, { one: 'chest' }),
  D('kangaroo', 'Kangaroo pocket', 'Pockets', ['crewneck', 'hoodie', 'longsleeve'], { kind: 'pocket-kangaroo' }, { shown: /^(Boxy hoodie|Pullover hoodie|Drawcord pullover hoodie)$/i }),
  D('zip-pocket', 'Zip pocket', 'Pockets', ['jacket', 'vest', 'ziphoodie', 'hoodie', 'coat', 'tote'], { kind: 'pocket-zip' }),
  D('slant-side', 'Side pockets', 'Pockets', ['dress', 'skirt'], { kind: 'pocket-slant', pair: true }),
  D('slant-pockets', 'Slant front pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-slant', pair: true }, { one: 'front', words: 'chino', shown: BOTTOMS_WITH_POCKETS }),
  D('jean-pockets', 'Jean front pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-jean', pair: true }, { one: 'front', words: 'five-pocket jean denim', shown: /jean|denim|five-pocket|jort/i, sketch: { 'pants-wide': ['pants', 'pt-wide-leg-jeans'] } }),
  D('cargo', 'Cargo pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-cargo', pair: true }, { words: 'cargo', shown: /cargo/i, sketch: { 'pants-wide': ['pants', 'pt-baggy-cargo-pants'] } }),
  D('back-welts', 'Back welt pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-welt', pair: true, view: 'back' }, { shown: BOTTOMS_WITH_POCKETS }),
  D('quarter-zip', 'Quarter zip', 'Closures', ['crewneck', 'longsleeve', 'polo'], { kind: 'zip', h: 7 }, { words: 'quarter-zip', shown: /zip/i, sketch: { polo: ['polo', 'polo-half-zip-polo'] } }),
  D('placket', 'Button placket', 'Closures', ['tee', 'longsleeve', 'crewneck'], { kind: 'placket' }),
  D('waist-drawcord', 'Drawcord waist', 'Closures', ['pants', 'shorts', 'leggings', 'skirt'], { kind: 'drawcord' }, { words: 'drawcord', shown: /drawcord|sweat|jogger|track/i, sketch: { 'pants-wide': ['pants', 'pt-wide-leg-sweatpants'] } }),
  D('zip-front', 'Zip front', 'Closures', ['dress', 'skirt'], { kind: 'zip' }),
  D('button-front', 'Button front', 'Closures', ['dress', 'bodysuit'], { kind: 'placket' }),
  // collars and necklines: each is a sketch from the sketch pack drawn with that collar, so the collar and the body are one drawing that fits
  // (a polo collar on a tee draws it as a polo). `sketch` names the sketch for each base it suits; `style` changes the piece's kind with it.
  D('neck-polo', 'Polo collar', 'Collars', ['tee', 'longsleeve'], null, { one: 'collar', sketch: { tee: ['polo', 'polo-classic-polo'], longsleeve: ['polo', 'polo-long-sleeve-polo'] } }),
  D('neck-johnny', 'Johnny collar', 'Collars', ['tee', 'longsleeve', 'crewneck'], null, { one: 'collar', sketch: { tee: ['polo', 'polo-johnny-collar-polo'], longsleeve: ['polo', 'polo-johnny-collar-long-sleeve-polo'], crewneck: ['polo', 'polo-johnny-collar-sweatshirt'] } }),
  D('neck-retro', 'Retro knit collar', 'Collars', ['tee'], null, { one: 'collar', sketch: { tee: ['polo', 'polo-retro-collar-jersey'] } }),
  D('neck-halfzip', 'Half-zip collar', 'Collars', ['tee', 'crewneck'], null, { one: 'collar', sketch: { tee: ['polo', 'polo-half-zip-polo'], crewneck: ['crewneck', 'crew-half-zip-pullover'] } }),
  D('neck-rugby', 'Rugby collar', 'Collars', ['crewneck'], null, { one: 'collar', sketch: { crewneck: ['polo', 'polo-rugby-collar-sweatshirt'] } }),
  D('neck-henley', 'Henley neck', 'Collars', ['crewneck'], null, { one: 'collar', sketch: { crewneck: ['polo', 'polo-henley-sweatshirt'] } }),
  D('neck-vneck', 'V-neck', 'Collars', ['tee', 'longsleeve'], null, { one: 'collar', sketch: { tee: ['tee', 'tee-vneck'], longsleeve: ['longsleeve', 'ls-v-neck-long-sleeve-jersey'] } }),
  D('neck-shearling', 'Shearling collar', 'Collars', ['jacket'], null, { one: 'collar', sketch: { jacket: ['jacket', 'jk-shearling-aviator-jacket'] } }),
  D('neck-shirtcollar', 'Shirt collar', 'Collars', ['jacket'], null, { one: 'collar', sketch: { jacket: ['jacket', 'jk-collared-bomber'] } }),
  D('neck-stand', 'Stand collar', 'Collars', ['jacket'], null, { one: 'collar', sketch: { jacket: ['jacket', 'jk-stand-collar-bomber'] } }),
  D('neck-band', 'Band collar', 'Collars', ['shirt'], null, { one: 'collar', sketch: { shirt: ['shirt', 'shirt-band-collar-shirt'] } }),
  D('neck-camp', 'Camp collar', 'Collars', ['shirt'], null, { one: 'collar', sketch: { shirt: ['shirt', 'shirt-camp-collar-long-sleeve-shirt'] } }),
  // the button-down sketch in the pack has a chest pocket and no buttons on its collar, so the collar's two buttons are drawn on the plain shirt
  D('neck-buttondown', 'Button-down collar', 'Collars', ['shirt'], { kind: 'button', pair: true, place: () => ({ x: BUTTON_DOWN.x, y: BUTTON_DOWN.y, w: .46, h: .46 }) }, { one: 'collar' }),
  // necklines drawn on the piece's own sketch (src/lab-neck.js), measurements and all, so they go with any sketch the piece is on
  D('neck-thin', 'Thin crew', 'Collars', ['tee', 'longsleeve', 'crewneck', 'tank'], null, { one: 'collar', neckline: 'thin' }),
  D('neck-mock', 'Mock neck', 'Collars', ['tee', 'longsleeve', 'crewneck', 'tank'], null, { one: 'collar', neckline: 'mock' }),
  D('neck-turtle', 'Turtleneck', 'Collars', ['longsleeve', 'crewneck'], null, { one: 'collar', neckline: 'turtle' }),
  D('pleats', 'Front pleats', 'Finishes', ['pants', 'shorts', 'skirt'], null, { option: { pleats: 1 }, words: 'pleat trouser', sketch: { 'pants-wide': ['pants', 'pt-pleated-wide-trousers'], skirt: ['skirt', 'sk-pleated-tennis-skirt'] } }),
  // cropped: drawn on a cropped sketch of the piece where the pack has one; with a collar (or on a piece with no cropped sketch) the piece's
  // own sketch is cut shorter above its hem band instead (`flex`: it never stops another add-on that changes the sketch). A dropped shoulder and a raw hem are not offered here: the
  // sketches set the shoulder and the hem, so picking them changed nothing that could be seen (the flats page still has both)
  D('cropped', 'Cropped', 'Finishes', ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'tank', 'polo', 'jacket', 'vest'], null, { option: { cropped: true }, words: 'cropped', shown: /crop/i, flex: true, sketch: { hoodie: ['hoodie', 'hood-cropped-hoodie'], ziphoodie: ['ziphoodie', 'zip-cropped-zip-hoodie'], jacket: ['jacket', 'jk-zip-blouson'] } }),
  D('contrast', 'Contrast pockets and trims', 'Finishes', null, null, { contrast: true }),
  // the wash and the wear (src/lab-wash.js): drawn on the flat, written into the tech pack for the wash house
  D('wash-garment', 'Garment dyed', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wash', wash: { type: 'garment-dye', strength: 'medium' } }),
  D('wash-vintage', 'Vintage stone wash', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wash', wash: { type: 'stone', strength: 'medium' } }),
  D('wash-acid', 'Acid wash', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wash', wash: { type: 'acid', strength: 'medium' } }),
  D('wash-sun', 'Sun faded', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wash', wash: { type: 'sun', strength: 'heavy' } }),
  D('wash-dirty', 'Dirty vintage tint', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wash', wash: { type: 'dirty', strength: 'medium' } }),
  D('wear-edges', 'Worn edges', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wear', distress: { on: true, amount: 35, focus: 'edges' } }),
  D('wear-distressed', 'Distressed', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wear', distress: { on: true, amount: 60, focus: 'all' } }),
  D('wear-destroyed', 'Heavily destroyed', 'Wash & wear', TOPS_AND_BOTTOMS, null, { one: 'wear', distress: { on: true, amount: 90, focus: 'all' } }),

];
export const RECIPE_GROUPS = ['Pockets', 'Closures', 'Collars', 'Finishes', 'Wash & wear'];

// colour systems: a few colours that sit together; the first is the garment, the second the stitching and trims, and each one a colourway
const C = (id, name, mood, colours) => ({ id, name, mood, colours: colours.map(([n, h]) => ({ name: n, hex: h })) });
export const COLOUR_SYSTEMS = [
  C('earth', 'Washed earth', 'Sun-faded, warm, garment-dyed', [['Clay', '#b46a4c'], ['Bark', '#4a3b2f'], ['Sand', '#d8c9a8'], ['Bone', '#efe8da']]),
  C('workwear', 'Workwear', 'Duck canvas and hickory stripe', [['Duck brown', '#7a5a3a'], ['Hickory', '#cfc6b4'], ['Navy', '#1f2a44'], ['Black', '#141416']]),
  C('mono', 'Monochrome', 'Black through to off white', [['Black', '#141416'], ['Off white', '#f2efe6'], ['Charcoal', '#3a3a3e'], ['Heather grey', '#9b9ca0']]),
  C('coastal', 'Coastal', 'Faded navy, salt and rust', [['Faded navy', '#2e3f5c'], ['Sea salt', '#e9ece6'], ['Sky', '#9bb7d4'], ['Rust', '#a5502c']]),
  C('forest', 'Forest', 'Olive, moss and cream', [['Olive', '#5b5f3a'], ['Cream', '#efe6cf'], ['Moss', '#7d8450'], ['Pine', '#23392c']]),
  C('sport', 'Sport', 'Clean white with bright accents', [['Off white', '#f2efe6'], ['Cobalt', '#2448b8'], ['Signal red', '#d23a2a'], ['Black', '#141416']]),
  C('pastel', 'Pastel', 'Soft, chalky, spring', [['Butter', '#f3e3a1'], ['Lilac', '#c8b6e2'], ['Mint', '#bfe3cf'], ['Chalk', '#f6f4ee']]),
  C('cue', 'Future Basics', 'Black and off white with cue green', [['Black', '#141416'], ['Cue green', '#4bff9a'], ['Off white', '#f2efe6'], ['Heather grey', '#9b9ca0']]),
];
const HEX = /^#[0-9a-f]{6}$/i;

export const baseOf = id => RECIPE_BASES.find(b => b.id === id) || null;
// the sketch an add-on puts the piece on, for this base: [style, sketch id], or null
export const sketchOf = (a, b) => (a?.sketch && (a.sketch[b.id] || a.sketch[b.style])) || null;
// whether an add-on, picked on its own, draws the piece on a different sketch than the base (a collar, a cropped body, cargo trousers):
// two of these cannot both be had, the second would quietly replace the first, so picking one puts the other down
const RESHAPES = new Map();
export function reshapes(a, base) {
  const b = typeof base === 'string' ? baseOf(base) : base; if (!a || !b) return false;
  const k = `${b.id}|${a.id}`; if (RESHAPES.has(k)) return RESHAPES.get(k);
  const v = Boolean(sketchOf(a, b)) || (Boolean(a.words) && !b.sketch && defaultTemplate(b.style, b.fit, a.words) !== baseSketch(b));
  RESHAPES.set(k, v); return v;
}
// the picks after tapping one add-on: on or off, putting down any it cannot be had with (the same `one`, or both change the sketch)
export function toggleAddon(picks, id, base) {
  const b = typeof base === 'string' ? baseOf(base) : base, a = RECIPE_ADDONS.find(x => x.id === id); if (!a || !b) return picks;
  if (picks.includes(id)) return picks.filter(x => x !== id);
  const other = x => RECIPE_ADDONS.find(y => y.id === x);
  return [...picks.filter(x => { const o = other(x); return !(o && ((a.one && o.one === a.one) || (!a.flex && !o.flex && reshapes(a, b) && reshapes(o, b)))); }), id];
}
// the sketch a base is drawn on with these add-ons: a collar or cropped body names its own, otherwise the base's, or one the add-ons' words pick
function sketchFor(b, picked) {
  const neck = picked.find(a => sketchOf(a, b) && !a.flex) || picked.find(a => sketchOf(a, b)), [style, neckSketch] = neck ? sketchOf(neck, b) : [b.style, null];
  const words = picked.map(a => a.words).filter(Boolean).join(' '), template = neckSketch || (b.sketch ? b.sketch : defaultTemplate(style, b.fit, words)) || undefined;
  return { neck, style, template, sketch: FLAT_TEMPLATES.find(t => t.id === template)?.label || '' };
}
// the add-ons the sketch already draws, with these picks (a pullover hoodie's kangaroo pocket, a chino's slant pockets): the page shows them as on it
export function drawnOn(base, picks = []) {
  const b = typeof base === 'string' ? baseOf(base) : base; if (!b) return [];
  const fits = addonsFor(b), picked = picks.map(id => fits.find(a => a.id === id)).filter(Boolean), { sketch } = sketchFor(b, picked);
  return fits.filter(a => a.shown && a.shown.test(sketch) && !picks.includes(a.id)).map(a => a.id);
}
// whether these picks draw no pocket of their own, so contrast (which colours the pockets we draw) has nothing to colour yet
export const pocketless = (base, picks = []) => !(cookRecipe({ base: typeof base === 'string' ? base : base?.id, addons: picks }).params?.edits || []).some(e => /^pocket/.test(e.kind));
// the add-ons a base can take
export const addonsFor = base => { const b = typeof base === 'string' ? baseOf(base) : base; if (!b) return []; const own = RECIPE_ADDONS.filter(a => a.on?.includes(b.style)); return own.some(a => a.detail || a.sketch) ? [...own, ...RECIPE_ADDONS.filter(a => !a.on)] : own; };
// a colour system by id, or one of our own ({ name, colours: [{name, hex}] }, from a plan's graphic programme or typed in)
export function systemOf(s) {
  if (typeof s === 'string') return COLOUR_SYSTEMS.find(x => x.id === s) || null;
  const colours = (Array.isArray(s?.colours) ? s.colours : []).filter(c => HEX.test(String(c?.hex || ''))).slice(0, 6).map(c => ({ name: String(c.name || c.hex).replace(/\s+/g, ' ').trim().slice(0, 40), hex: c.hex.toLowerCase() }));
  return colours.length ? { id: 'own', name: String(s.name || 'Our colours').slice(0, 60), mood: '', colours } : null;
}

// the picks → { params, placements, name, words, colourways, category, style, template, addons } or { error }
//   colour: which colour of the system is the garment (an index; the rest become colourways, the next one the stitching)
// how a piece is fitted by hand after it is picked (the Adjust panel): the base's lines and each add-on's size and place, all in inches.
//   m:      changes to the base's measurements: body width (chest or waist) and length; the sketch is drawn to them
//   adjust: per add-on: size (0.5–1.8 of its usual size), dy (up −, down +), dx (across; for a pair, how far apart)
export const FIT_LINES = { width: 'Body width', length: 'Length' };
const num = (v, lo, hi, d = 0, step = 8) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * step) / step)) : d; };
export function cleanFit(f = {}) {
  const m = {}, adjust = {};
  for (const k of Object.keys(FIT_LINES)) { const v = num(f.m?.[k], -6, 6); if (v) m[k] = v; }
  for (const [id, a] of Object.entries(f.adjust || {}).slice(0, 20)) {
    if (!/^[a-z-]{2,30}$/.test(id)) continue; const size = num(a?.size, .5, 1.8, 1, 20), dy = num(a?.dy, -8, 8), dx = num(a?.dx, -6, 6);
    if (size !== 1 || dy || dx) adjust[id] = { size, dy, dx };
  }
  return { m, adjust };
}
export function cookRecipe({ base, addons = [], system = null, colour = 0, name = '', fit = null } = {}) {
  const b = baseOf(base); if (!b) return { error: 'Choose a base to start from' };
  const fits = addonsFor(b), picked = [], seenOne = new Set();
  for (const id of Array.isArray(addons) ? addons : []) {
    const a = fits.find(x => x.id === id); if (!a || picked.includes(a)) continue;
    if (a.one) { if (seenOne.has(a.one)) continue; seenOne.add(a.one); }
    if (!a.flex && reshapes(a, b) && picked.some(x => !x.flex && reshapes(x, b))) continue; // one change of sketch at a time (toggleAddon keeps the page to that)
    picked.push(a);
  }
  const sys = system ? systemOf(system) : null; if (system && !sys) return { error: 'That colour system is not known' };
  const i = Math.min(Math.max(Math.round(Number(colour) || 0), 0), (sys?.colours.length || 1) - 1), main = sys?.colours[i] || null, accent = sys ? sys.colours[(i + 1) % sys.colours.length] : null;
  const options = Object.assign({}, b.options, ...picked.filter(a => a.option).map(a => a.option));
  const wash = picked.find(a => a.wash)?.wash, distress = picked.find(a => a.distress)?.distress, neckline = picked.find(a => a.neckline)?.neckline;
  // a collar chosen: the piece is drawn on the sketch that has that collar (and becomes that kind of piece: a tee with a polo collar is a polo)
  // a base with a sketch of its own keeps it unless an add-on names another (the sketch-picking words would wander off to a pocketed one)
  const { neck, style, template, sketch } = sketchFor(b, picked);
  // measured as the sketch is drawn (its length in proportion, as the flats page does when a sketch is picked), then fitted by hand
  // cropped on a sketch that is not cropped itself (a collar's, or a piece with no cropped sketch): that sketch cut 4 in shorter above its hem
  const cropA = picked.find(a => a.flex && a.option?.cropped), cut = cropA && STYLES[style]?.kind === 'top' && (neck && neck !== cropA ? true : !sketchOf(cropA, b) && !/crop/i.test(sketch)) ? 4 : 0;
  if (cut) options.cropped = false;
  const p = fitToTemplate({ ...defaultParams(style, FITS[b.fit] ? b.fit : 'regular', options), template }), edits = [], F = cleanFit(fit || {});
  if (cut) { p.m.length = Math.round((p.m.length - cut) * 8) / 8; p.crop = cut; }
  // a neckline of our own: its measurements set from the style's standard, so the table and the factory read it
  if (neckline && 'neckWidth' in p.m) p.m = { ...p.m, ...necklineMeasures(neckline, defaultParams(style, FITS[b.fit] ? b.fit : 'regular', options).m) };
  // the base's lines moved by hand: the sketch stretches to its width and length (src/lab-flats.js drawingOf)
  const wKey = 'chest' in p.m ? 'chest' : 'waist' in p.m ? 'waist' : 'width' in p.m ? 'width' : null, lKey = 'length' in p.m ? 'length' : 'inseam' in p.m ? 'inseam' : 'height' in p.m ? 'height' : null;
  const bump = (k, d, lo = 1) => { if (k && d) p.m[k] = Math.max(lo, Math.round((p.m[k] + d) * 8) / 8); };
  bump(wKey, F.m.width / 2); bump(lKey, F.m.length);
  const fitted = (e, id, pair = false) => { const a = F.adjust[id]; if (!a) return e; const w = e.w * a.size, h = e.h * a.size, dx = pair ? Math.sign(e.x || 1) * a.dx : a.dx;
    return { ...e, w: Math.round(w * 8) / 8, h: Math.round(h * 8) / 8, x: Math.round((e.x + dx) * 8) / 8, y: Math.round((e.y + a.dy) * 8) / 8 }; };
  const contrast = picked.some(a => a.contrast);
  for (const a of picked.filter(x => x.detail && !(x.shown && x.shown.test(sketch)))) {
    const view = a.detail.view || 'front', d = defaultDetail(a.detail.kind, p, view), extra = a.detail.place ? a.detail.place(p) : { ...(a.detail.h ? { h: a.detail.h, y: d.y - d.h / 2 + a.detail.h / 2 } : {}) };
    const one = fitted({ ...d, ...extra, id: `r-${a.id}`, type: 'detail', ...(accent && main && accent.hex !== main.hex ? { thread: accent.hex } : {}), ...(contrast && accent && /^pocket/.test(a.detail.kind) ? { color: accent.hex } : {}) }, a.id, Boolean(a.detail.pair));
    edits.push(one);
    // a pair: its twin mirrored across the centre (left and right front pockets, both back welts)
    if (a.detail.pair && Math.abs(one.x) > .01) edits.push({ ...one, id: `r-${a.id}-2`, x: -one.x, flip: !one.flip });
  }
  const f = cleanFlat({ ...p, template, color: main?.hex || '', edits, ...(wash ? { wash } : {}), ...(distress ? { distress } : {}), ...(neckline ? { neckline } : {}) }); if (f.error) return { error: f.error };
  const labels = picked.map(a => a.label), pockets = picked.filter(a => a.detail).map(a => a.label), kind = (cut ? 'Cropped ' : '') + (neck ? (cut ? (sketch || b.label).toLowerCase() : (sketch || b.label)) : (cut ? b.label.toLowerCase() : b.label)); // a collar names the piece by its sketch: a tee with a polo collar is a classic polo
  return {
    params: f.params, placements: f.placements, style, template: f.params.template || null, category: STYLES[style].category, addons: picked.map(a => a.id),
    name: String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120) || (main ? `${main.name} ${kind.toLowerCase()}` : kind) + (pockets.length ? ` with ${pockets.slice(0, 2).join(' and ').toLowerCase()}` : ''), sketch,
    words: `${b.label}${labels.length ? ': ' + labels.join(', ').toLowerCase() : ''}.${sys ? ` In the ${sys.name} colours.` : ''}`,
    colourIndex: i, fit: F, silhouette: kind, details: labels, colourways: sys ? [...sys.colours.slice(i), ...sys.colours.slice(0, i)].map(c => ({ name: c.name, hex: c.hex })) : [], colour: main,
  };
}
