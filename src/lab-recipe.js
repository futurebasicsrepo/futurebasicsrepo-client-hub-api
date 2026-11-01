// The recipe menu: design by picking, the way a client who is not a designer thinks about a piece.
//   1. a base: a staple garment at its usual fit (a boxy tee, a relaxed hoodie, a wide trouser)
//   2. add-ons: pockets, closures and finishes that suit that base (a kangaroo pocket only on a top, back welts only on a bottom)
//   3. a colour system: a few colours that work together; the first is the garment, the next becomes the stitching, and every one is a colourway
// cookRecipe() turns the picks into real flats (src/lab-flats.js params, with each add-on as a detail placed where it usually goes), so the
// piece opens in the studio already measured, drawn and coloured. Shared by the page (/lab/recipe) and the service (POST /v1/lab/concepts/from-recipe).
import { STYLES, FITS, defaultParams, defaultDetail, defaultTemplate, fitToTemplate, cleanFlat } from './lab-flats.js';
import { FLAT_TEMPLATES } from './lab-flat-templates.js';

const B = (id, label, style, fit, note, options = {}) => ({ id, label, style, fit, note, options });
export const RECIPE_BASES = [
  B('tee', 'Classic tee', 'tee', 'regular', 'The everyday crew-neck tee.'),
  B('tee-boxy', 'Boxy tee', 'tee', 'boxy', 'Short and wide, with a dropped shoulder.'),
  B('tee-over', 'Oversized tee', 'tee', 'oversized', 'Long, roomy and relaxed.'),
  B('longsleeve', 'Long-sleeve tee', 'longsleeve', 'regular', 'A tee with long sleeves and ribbed cuffs.'),
  B('tank', 'Tank', 'tank', 'regular', 'Sleeveless, for summer and the gym.'),
  B('polo', 'Polo', 'polo', 'regular', 'A knit polo with a short placket.'),
  B('crewneck', 'Crewneck sweatshirt', 'crewneck', 'relaxed', 'A fleece crew with rib cuffs and hem.'),
  B('hoodie', 'Pullover hoodie', 'hoodie', 'relaxed', 'The heavyweight hoodie, drawcord in the hood.'),
  B('ziphoodie', 'Zip hoodie', 'ziphoodie', 'regular', 'A full-zip hoodie.'),
  B('shirt', 'Button-up shirt', 'shirt', 'regular', 'A woven shirt with a collar and placket.'),
  B('shirtss', 'Camp shirt', 'shirtss', 'boxy', 'A short-sleeve woven shirt, cut boxy.'),
  B('jacket', 'Zip jacket', 'jacket', 'regular', 'A light zip-front jacket.'),
  B('vest', 'Vest', 'vest', 'regular', 'A sleeveless layer.'),
  B('pants', 'Straight trousers', 'pants', 'regular', 'A straight-leg trouser.'),
  B('pants-wide', 'Wide trousers', 'pants', 'wide', 'A wide, easy leg.'),
  B('shorts', 'Shorts', 'shorts', 'regular', 'An everyday short.'),
  B('leggings', 'Leggings', 'leggings', 'slim', 'Close-fitting, for training.'),
  B('coat', 'Coat', 'coat', 'regular', 'A long outer layer.'),
  B('dress', 'Dress', 'dress', 'regular', 'A one-piece dress.'),
  B('skirt', 'Skirt', 'skirt', 'regular', 'A skirt from the waistband.'),
  B('cami', 'Cami top', 'cami', 'regular', 'A strappy top.'),
  B('bodysuit', 'Bodysuit', 'bodysuit', 'slim', 'Close-fitting, snaps at the base.'),
  B('cap', 'Six-panel cap', 'cap', 'regular', 'A classic cap.'),
  B('bucket', 'Bucket hat', 'bucket', 'regular', 'A soft, all-round brim.'),
  B('beanie', 'Cuffed beanie', 'beanie', 'regular', 'A knit beanie with a cuff.'),
  B('tote', 'Tote bag', 'tote', 'regular', 'A carry-all with two handles.'),
].filter(b => STYLES[b.style] && FITS[b.fit]);

// an add-on: a detail placed on the piece, or an option on its make. `on` says which bases it suits (style keys).
//   words  steer which sketch from the sketch pack the piece is drawn on (src/lab-flats.js defaultTemplate): "cargo" picks the cargo trousers
//   shown  when the chosen sketch's name matches it, the sketch already draws this, so no detail is added on top (a hoodie's kangaroo pocket,
//          a chino's slant pockets); otherwise the detail is drawn where that kind of detail usually goes
//   one    add-ons where only one can be chosen (two kinds of front pocket would sit on top of each other)
const D = (id, label, group, on, detail, extra = {}) => ({ id, label, group, on, detail, ...extra });
const BOTTOMS_WITH_POCKETS = /chino|jean|trouser|pleat|carpenter|work|cargo|denim|five-pocket|jort|walk|wide|straight|barrel|flare|skinny|slim|baggy|tailor/i;
export const RECIPE_ADDONS = [
  D('chest-pocket', 'Chest pocket', 'Pockets', ['tee', 'longsleeve', 'crewneck', 'shirt', 'shirtss', 'jacket', 'vest', 'coat'], { kind: 'pocket-patch' }, { one: 'chest' }),
  D('front-pocket', 'Front pocket', 'Pockets', ['tote'], { kind: 'pocket-patch' }),
  D('flap-pocket', 'Flap chest pocket', 'Pockets', ['shirt', 'shirtss', 'jacket', 'vest', 'coat'], { kind: 'pocket-flap' }, { one: 'chest' }),
  D('kangaroo', 'Kangaroo pocket', 'Pockets', ['crewneck', 'hoodie', 'longsleeve'], { kind: 'pocket-kangaroo' }, { shown: /hood/i }),
  D('zip-pocket', 'Zip pocket', 'Pockets', ['jacket', 'vest', 'ziphoodie', 'hoodie', 'coat', 'tote'], { kind: 'pocket-zip' }),
  D('slant-side', 'Side pockets', 'Pockets', ['dress', 'skirt'], { kind: 'pocket-slant', pair: true }),
  D('slant-pockets', 'Slant front pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-slant', pair: true }, { one: 'front', words: 'chino', shown: BOTTOMS_WITH_POCKETS }),
  D('jean-pockets', 'Jean front pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-jean', pair: true }, { one: 'front', words: 'five-pocket jean denim', shown: /jean|denim|five-pocket|jort/i }),
  D('cargo', 'Cargo pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-cargo', pair: true }, { words: 'cargo', shown: /cargo/i }),
  D('back-welts', 'Back welt pockets', 'Pockets', ['pants', 'shorts'], { kind: 'pocket-welt', pair: true, view: 'back' }, { shown: BOTTOMS_WITH_POCKETS }),
  D('quarter-zip', 'Quarter zip', 'Closures', ['crewneck', 'longsleeve', 'polo'], { kind: 'zip', h: 7 }, { words: 'quarter-zip', shown: /zip/i }),
  D('placket', 'Button placket', 'Closures', ['tee', 'longsleeve', 'crewneck'], { kind: 'placket' }),
  D('waist-drawcord', 'Drawcord waist', 'Closures', ['pants', 'shorts', 'leggings', 'skirt'], { kind: 'drawcord' }, { words: 'drawcord', shown: /drawcord|sweat|jogger|track/i }),
  D('zip-front', 'Zip front', 'Closures', ['dress', 'skirt', 'tote'], { kind: 'zip' }),
  D('button-front', 'Button front', 'Closures', ['dress', 'cami', 'bodysuit'], { kind: 'placket' }),
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
  D('neck-buttondown', 'Button-down collar', 'Collars', ['shirt'], null, { one: 'collar', sketch: { shirt: ['shirt', 'shirt-button-down-shirt'] } }),
  D('pleats', 'Front pleats', 'Finishes', ['pants', 'shorts', 'skirt'], null, { option: { pleats: 1 }, words: 'pleat trouser' }),
  D('cropped', 'Cropped', 'Finishes', ['tee', 'longsleeve', 'crewneck', 'hoodie', 'tank', 'cami', 'jacket'], null, { option: { cropped: true }, words: 'cropped' }),
  D('drop', 'Dropped shoulder', 'Finishes', ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'shirt', 'shirtss'], null, { option: { drop: true } }),
  D('contrast', 'Contrast pockets and trims', 'Finishes', null, null, { contrast: true }),
  D('raw-hem', 'Raw hem, no rib', 'Finishes', ['crewneck', 'hoodie', 'ziphoodie', 'longsleeve'], null, { option: { rib: false } }),
];
export const RECIPE_GROUPS = ['Pockets', 'Closures', 'Collars', 'Finishes'];

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
    picked.push(a);
  }
  const sys = system ? systemOf(system) : null; if (system && !sys) return { error: 'That colour system is not known' };
  const i = Math.min(Math.max(Math.round(Number(colour) || 0), 0), (sys?.colours.length || 1) - 1), main = sys?.colours[i] || null, accent = sys ? sys.colours[(i + 1) % sys.colours.length] : null;
  const options = Object.assign({}, b.options, ...picked.filter(a => a.option).map(a => a.option));
  // a collar chosen: the piece is drawn on the sketch that has that collar (and becomes that kind of piece: a tee with a polo collar is a polo)
  const neck = picked.find(a => a.sketch?.[b.style]), [style, neckSketch] = neck ? neck.sketch[b.style] : [b.style, null];
  const words = picked.map(a => a.words).filter(Boolean).join(' '), template = neckSketch || defaultTemplate(style, b.fit, words) || undefined, sketch = FLAT_TEMPLATES.find(t => t.id === template)?.label || '';
  // measured as the sketch is drawn (its length in proportion, as the flats page does when a sketch is picked), then fitted by hand
  const p = fitToTemplate({ ...defaultParams(style, FITS[b.fit] ? b.fit : 'regular', options), template }), edits = [], F = cleanFit(fit || {});
  // the base's lines moved by hand: the sketch stretches to its width and length (src/lab-flats.js drawingOf)
  const wKey = 'chest' in p.m ? 'chest' : 'waist' in p.m ? 'waist' : 'width' in p.m ? 'width' : null, lKey = 'length' in p.m ? 'length' : 'inseam' in p.m ? 'inseam' : 'height' in p.m ? 'height' : null;
  const bump = (k, d, lo = 1) => { if (k && d) p.m[k] = Math.max(lo, Math.round((p.m[k] + d) * 8) / 8); };
  bump(wKey, F.m.width / 2); bump(lKey, F.m.length);
  const fitted = (e, id, pair = false) => { const a = F.adjust[id]; if (!a) return e; const w = e.w * a.size, h = e.h * a.size, dx = pair ? Math.sign(e.x || 1) * a.dx : a.dx;
    return { ...e, w: Math.round(w * 8) / 8, h: Math.round(h * 8) / 8, x: Math.round((e.x + dx) * 8) / 8, y: Math.round((e.y + a.dy) * 8) / 8 }; };
  const contrast = picked.some(a => a.contrast);
  for (const a of picked.filter(x => x.detail && !(x.shown && x.shown.test(sketch)))) {
    const view = a.detail.view || 'front', d = defaultDetail(a.detail.kind, p, view), extra = { ...(a.detail.h ? { h: a.detail.h, y: d.y - d.h / 2 + a.detail.h / 2 } : {}) };
    const one = fitted({ ...d, ...extra, id: `r-${a.id}`, type: 'detail', ...(accent && main && accent.hex !== main.hex ? { thread: accent.hex } : {}), ...(contrast && accent && /^pocket/.test(a.detail.kind) ? { color: accent.hex } : {}) }, a.id, Boolean(a.detail.pair));
    edits.push(one);
    // a pair: its twin mirrored across the centre (left and right front pockets, both back welts)
    if (a.detail.pair && Math.abs(one.x) > .01) edits.push({ ...one, id: `r-${a.id}-2`, x: -one.x, flip: !one.flip });
  }
  const f = cleanFlat({ ...p, template, color: main?.hex || '', edits }); if (f.error) return { error: f.error };
  const labels = picked.map(a => a.label), pockets = picked.filter(a => a.detail).map(a => a.label), kind = neck ? (sketch || b.label) : b.label; // a collar names the piece by its sketch: a tee with a polo collar is a classic polo
  return {
    params: f.params, placements: f.placements, style, template: f.params.template || null, category: STYLES[style].category, addons: picked.map(a => a.id),
    name: String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120) || (main ? `${main.name} ${kind.toLowerCase()}` : kind) + (pockets.length ? ` with ${pockets.slice(0, 2).join(' and ').toLowerCase()}` : ''), sketch,
    words: `${b.label}${labels.length ? ': ' + labels.join(', ').toLowerCase() : ''}.${sys ? ` In the ${sys.name} colours.` : ''}`,
    colourIndex: i, fit: F, silhouette: kind, details: labels, colourways: sys ? [...sys.colours.slice(i), ...sys.colours.slice(0, i)].map(c => ({ name: c.name, hex: c.hex })) : [], colour: main,
  };
}
