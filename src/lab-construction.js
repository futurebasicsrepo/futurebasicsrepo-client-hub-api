// How a garment is built, in one description the pattern drafts from (src/lab-pattern.js): the sleeve, the hood, the collar, the opening,
// the yokes, the pockets, the waist, the knees, the leg, the pleats, the panels and stripes, the quilting, the belt and the lining.
//
// Where it comes from, in order:
//   1. what was set on the piece (`options.construction`): by the designer in the pattern panel, or read from a freehand drawing by the vision
//      model (src/lab-flats-routes.js, readConstruction), so a drawing with no name drafts as what it shows;
//   2. what the library sketch shows, read once from its front and back by two vision models and kept where they agree
//      (src/lab-template-construction.js, made by scripts/pattern-read-sketches.mjs);
//   3. what the library sketch's name says (a "cargo bomber", "double-knee work pants", a "raglan boxy tee");
//   4. the style's own defaults (a hoodie has a hood and a kangaroo pocket; a zip hoodie a split one; a jacket a zip and welt pockets).
// Each source fills only what the one before left unset. Pure: no I/O.
import { STYLES } from './lab-flats.js';
import { FLAT_TEMPLATES } from './lab-flat-templates.js';
import { TEMPLATE_CONSTRUCTION } from './lab-template-construction.js';

export const SLEEVES = ['set', 'raglan', 'drop', 'none'];
export const COLLARS = ['none', 'rib', 'shirt', 'stand', 'polo', 'lapel', 'shearling', 'funnel'];
export const OPENINGS = ['none', 'zip', 'half-zip', 'quarter-zip', 'buttons', 'snaps', 'placket'];
export const POCKETS = ['kangaroo', 'split-kangaroo', 'welt', 'flap-welt', 'chest', 'chest-flap', 'patch-hip', 'cargo', 'five-pocket', 'slash'];
export const WAISTS = ['fixed', 'elastic', 'drawcord'];
export const LEGS = ['straight', 'flare', 'wide', 'taper', 'balloon'];
export const PANELS = ['none', 'side-stripe', 'side-panel', 'sleeve-stripe'];
export const BACK_POCKETS = ['jeans', 'square', 'welt'];
export const HEMS = ['straight', 'curved'];
export const ANKLES = ['open', 'cuff', 'elastic'];
export const BREASTED = ['single', 'double'];
export const LAPELS = ['notch', 'peak'];

// what a sketch's name says, as a partial description
export function fromName(name, style) {
  const n = ` ${String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `, has = re => re.test(n), c = {};
  const S = STYLES[style] || {}, top = S.kind === 'top', bottom = S.kind === 'bottom';
  if (top) {
    if (has(/ raglan /)) c.sleeve = 'raglan';
    else if (has(/ dropped shoulder | drop shoulder /)) c.sleeve = 'drop';
    if (has(/ hood(ed)? /)) c.hood = true;
    if (has(/ shearling | aviator /)) c.collar = 'shearling';
    else if (has(/ lapel | blazer | overcoat | tailored /)) c.collar = 'lapel';
    else if (has(/ funnel /)) c.collar = 'funnel';
    else if (has(/ stand collar | mock neck | quarter zip | half zip /) && !has(/ hood/)) c.collar = 'stand';
    else if (has(/ polo | johnny collar | rugby collar | retro collar | collared jersey | collared long sleeve /)) c.collar = 'polo';
    else if (has(/ collar(ed)? | shirt | overshirt | trucker | harrington | chore | western | work | denim | blouson | shacket | trench /) && !(has(/ t shirt /) && !has(/ collar(ed)? /))) c.collar = 'shirt'; // a T-shirt is not a shirt
    if (has(/ half zip /)) c.opening = 'half-zip';
    else if (has(/ quarter zip /)) c.opening = 'quarter-zip';
    else if (has(/ snap /)) c.opening = 'snaps';
    else if (has(/ henley /)) c.opening = 'placket';
    else if (has(/ button | cardigan | waistcoat | blazer | popover /)) c.opening = 'buttons';
    if (has(/ double breasted /)) c.breasted = 'double'; else if (has(/ single breasted /)) c.breasted = 'single';
    if (has(/ peak(ed)? lapel /)) c.lapel = 'peak'; else if (has(/ notch(ed)? lapel /)) c.lapel = 'notch';
    if (has(/ sport ?coat | suit jacket | double breasted /)) { c.collar = 'lapel'; c.opening = 'buttons'; }
    if (has(/ western | trucker | yoke /)) c.yoke = { back: true, front: has(/ western | football | shoulder yoke | yoke football /) };
    const pk = [];
    if (has(/ kangaroo /)) pk.push(style === 'ziphoodie' || has(/ zip /) ? 'split-kangaroo' : 'kangaroo');
    if (has(/ flap pocket /)) pk.push('flap-welt');
    if (has(/ cargo /)) pk.push('cargo');
    if (has(/ two pocket | utility | work shirt | trucker | denim (jacket|vest) | western /)) pk.push('chest-flap', 'chest-flap');
    else if (has(/ chest pocket | with pocket | pocket polo | patch pocket overshirt | overshirt with pocket /)) pk.push('chest');
    if (has(/ chore | patch pocket (coat|cardigan|blazer|shacket) /)) pk.push('patch-hip', 'patch-hip');
    if (pk.length) c.pockets = pk;
    if (has(/stripe|track/)) c.panels = 'sleeve-stripe';
    else if (has(/ paneled | contrast panel /)) c.panels = 'side-panel';
    if (has(/ puffer | quilted | parka /)) c.quilted = true;
    if (has(/ belted | trench /)) c.belt = true;
  }
  if (bottom) {
    if (has(/jogger|sweat|track|running|lounge|drawcord|elastic|bike|mesh|basketball|boxer|training/)) c.waist = has(/drawcord|jogger|sweat|track|running|lounge|basketball|training/) ? 'drawcord' : 'elastic';
    if (has(/ double knee /)) c.knee = 'double';
    if (has(/ flare(d)? /)) c.leg = 'flare';
    else if (has(/ balloon | barrel /)) c.leg = 'balloon';
    else if (has(/ wide | baggy /)) c.leg = 'wide';
    else if (has(/ skinny | slim | jogger /)) c.leg = 'taper';
    const pl = /( two | double )?pleat(ed)?/.exec(n); if (pl) c.pleats = S.skirt ? 3 : pl[1] ? 2 : 1;
    if (has(/ side stripe | three stripe /)) c.panels = 'side-stripe';
    else if (has(/ paneled | contrast panel /)) c.panels = 'side-panel';
    const pk = [];
    if (has(/ cargo /)) pk.push('cargo');
    if (has(/jean|denim|jorts|five pocket|carpenter/)) pk.push('five-pocket');
    if (pk.length) c.pockets = pk;
  }
  return c;
}

// the style's own defaults
export function styleDefaults(style, options = {}) {
  const S = STYLES[style] || {}, c = {};
  if (S.kind === 'top') {
    c.sleeve = options.drop ? 'drop' : 'set';
    c.hood = Boolean(S.hood);
    c.opening = S.zip ? 'zip' : 'none';
    c.pockets = S.pocket === 'kangaroo' ? ['kangaroo'] : S.pocket === 'split' ? ['split-kangaroo'] : S.pocket === 'welt' ? ['welt'] : [];
    if (options.chestPocket) c.pockets = [...c.pockets, 'chest'];
    if (options.noPocket) c.pockets = [];
    c.lined = ['jacket', 'coat', 'vest'].includes(style) && !options.unlined;
  }
  if (S.kind === 'bottom') { c.waist = style === 'leggings' ? 'elastic' : 'fixed'; c.leg = 'straight'; c.pleats = Number(options.pleats) || 0; c.pockets = style === 'leggings' || S.skirt ? [] : ['slash']; }
  c.panels = 'none';
  return c;
}

const ok = (v, list) => (list.includes(v) ? v : undefined);
// a description from anywhere (a stored one, a vision read) kept to what the pattern knows
export function cleanConstruction(c) {
  if (!c || typeof c !== 'object') return {};
  const out = {};
  if (ok(c.sleeve, SLEEVES)) out.sleeve = c.sleeve;
  if (typeof c.hood === 'boolean') out.hood = c.hood;
  if (ok(c.collar, COLLARS)) out.collar = c.collar;
  if (ok(c.opening, OPENINGS)) out.opening = c.opening;
  if (c.yoke && typeof c.yoke === 'object') out.yoke = { front: Boolean(c.yoke.front), back: Boolean(c.yoke.back) };
  if (Array.isArray(c.pockets)) out.pockets = c.pockets.filter(p => POCKETS.includes(p)).slice(0, 8);
  if (ok(c.waist, WAISTS)) out.waist = c.waist;
  if (c.knee === 'double' || c.knee === 'single') out.knee = c.knee;
  if (ok(c.leg, LEGS)) out.leg = c.leg;
  if (Number.isFinite(Number(c.pleats)) && c.pleats !== null && c.pleats !== '') out.pleats = Math.min(Math.max(Math.round(Number(c.pleats)), 0), 3);
  if (ok(c.panels, PANELS)) out.panels = c.panels;
  for (const k of ['quilted', 'belt', 'lined', 'backPockets', 'beltLoops', 'coinPocket', 'utility']) if (typeof c[k] === 'boolean') out[k] = c[k];
  if (ok(c.backPocket, BACK_POCKETS)) out.backPocket = c.backPocket; if (ok(c.hem, HEMS)) out.hem = c.hem; if (ok(c.ankle, ANKLES)) out.ankle = c.ankle; if (ok(c.breasted, BREASTED)) out.breasted = c.breasted; if (ok(c.lapel, LAPELS)) out.lapel = c.lapel;
  return out;
}

// the description a piece is drafted from: set, then named, then the style's own
export function constructionOf(p) {
  const t = p.template && p.template !== 'none' ? FLAT_TEMPLATES.find(x => x.id === p.template) : null;
  const set = cleanConstruction(p.options?.construction), named = t ? cleanConstruction(fromName(`${t.id} ${t.label}`, p.style)) : {}, base = styleDefaults(p.style, p.options || {});
  const seen = t ? cleanConstruction(TEMPLATE_CONSTRUCTION[t.id]) : {};
  const out = { ...base, ...named, ...seen, ...set };
  // what follows from the rest: a hood takes the place of a collar (but an outer piece keeps a stand or a funnel the hood is set inside, as a
  // puffer's is); a collar the place of a neck rib
  if (out.hood && out.collar && out.collar !== 'shearling' && !(['stand', 'funnel'].includes(out.collar) && ['jacket', 'coat', 'vest'].includes(p.style))) delete out.collar;
  return out;
}

// the words for it, for the panel and the tech pack
export function constructionWords(c) {
  const w = [];
  if (c.sleeve && c.sleeve !== 'set') w.push({ raglan: 'Raglan sleeves', drop: 'Dropped shoulder', none: 'Sleeveless' }[c.sleeve]);
  if (c.hood) w.push('Hood');
  if (c.collar && c.collar !== 'none') w.push({ rib: 'Rib collar', shirt: 'Shirt collar', stand: 'Stand collar', polo: 'Polo collar', lapel: 'Notched lapel collar', shearling: 'Shearling collar', funnel: 'Funnel neck' }[c.collar]);
  if (c.opening && c.opening !== 'none') w.push({ zip: 'Full zip', 'half-zip': 'Half zip', 'quarter-zip': 'Quarter zip', buttons: 'Button front', snaps: 'Snap front', placket: 'Button placket' }[c.opening]);
  if (c.yoke?.front || c.yoke?.back) w.push(`${[c.yoke.front && 'front', c.yoke.back && 'back'].filter(Boolean).join(' and ')} yoke`.replace(/^./, s => s.toUpperCase()));
  const pk = {}; for (const x of c.pockets || []) pk[x] = (pk[x] || 0) + 1;
  for (const [k, n] of Object.entries(pk)) w.push(`${n > 1 ? `${n} ` : ''}${{ kangaroo: 'kangaroo pocket', 'split-kangaroo': 'split kangaroo pocket', welt: 'welt pockets', 'flap-welt': 'flap pockets', chest: 'chest pocket', 'chest-flap': 'flap chest pocket', 'patch-hip': 'patch hip pocket', cargo: 'cargo pockets', 'five-pocket': 'five-pocket', slash: 'slash pockets' }[k]}${n > 1 && !/s$/.test(k) ? 's' : ''}`.replace(/^./, s => s.toUpperCase()));
  if (c.waist && c.waist !== 'fixed') w.push(c.waist === 'drawcord' ? 'Elastic waist with drawcord' : 'Elastic waist');
  if (c.backPockets === false) w.push('No back pockets');
  if (c.beltLoops) w.push('Belt loops');
  if (c.collar === 'lapel' && c.breasted) w.push(c.breasted === 'double' ? 'Double-breasted' : 'Single-breasted'); if (c.collar === 'lapel' && c.lapel) w.push(c.lapel === 'peak' ? 'Peak lapel' : 'Notch lapel');
  if (c.backPocket && c.backPocket !== 'jeans' && c.backPockets !== false) w.push(c.backPocket === 'square' ? 'Square back pockets' : 'Welt back pockets');
  if (c.coinPocket === false && (c.pockets || []).includes('five-pocket')) w.push('No coin pocket');
  if (c.utility) w.push('Rule pocket and hammer loop');
  if (c.hem === 'curved') w.push('Curved hem');
  if (c.ankle && c.ankle !== 'open') w.push(c.ankle === 'cuff' ? 'Rib ankle cuffs' : 'Elastic ankles');
  if (c.knee === 'double') w.push('Double knee');
  if (c.leg && c.leg !== 'straight') w.push({ flare: 'Flared leg', wide: 'Wide leg', taper: 'Tapered leg', balloon: 'Balloon leg' }[c.leg]);
  if (c.pleats) w.push(`${c.pleats} front pleat${c.pleats > 1 ? 's' : ''}`);
  if (c.panels && c.panels !== 'none') w.push({ 'side-stripe': 'Side stripes', 'side-panel': 'Contrast side panels', 'sleeve-stripe': 'Sleeve stripes' }[c.panels]);
  if (c.quilted) w.push('Channel-quilted');
  if (c.belt) w.push('Belt');
  if (c.lined) w.push('Lined');
  return w;
}
