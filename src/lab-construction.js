// How a garment is built, in one description the pattern drafts from (src/lab-pattern.js): the sleeve, the hood, the collar, the opening,
// the yokes, the pockets, the waist, the knees, the leg, the pleats, the panels and stripes, the quilting, the belt and the lining.
//
// Where it comes from, in order:
//   1. what was set on the piece (`options.construction`): by the designer in the pattern panel, or read from the concept's picture and the
//      flats drawn from it by the vision model (src/lab-flats-routes.js readPicture and readBuild, src/lab-trip.js), so a piece drafts as its
//      picture shows it; the details added on the flats (a chest pocket, a zip, a drawcord) add to it (fromEdits);
//   2. what the library sketch shows, read once from its front and back by two vision models and kept where they agree
//      (src/lab-template-construction.js, made by scripts/pattern-read-sketches.mjs);
//   3. what the library sketch's name says (a "cargo bomber", "double-knee work pants", a "raglan boxy tee");
//   4. the style's own defaults (a hoodie has a hood and a kangaroo pocket; a zip hoodie a split one; a jacket a zip and welt pockets).
// Each source fills only what the one before left unset. Pure: no I/O.
import { STYLES, measurementsFor, partOf } from './lab-flats.js';
import { FLAT_TEMPLATES } from './lab-flat-templates.js';
import { TEMPLATE_CONSTRUCTION } from './lab-template-construction.js';

export const SLEEVES = ['set', 'raglan', 'drop', 'none'];
export const COLLARS = ['none', 'rib', 'shirt', 'stand', 'polo', 'lapel', 'shearling', 'funnel'];
export const OPENINGS = ['none', 'zip', 'half-zip', 'quarter-zip', 'buttons', 'snaps', 'placket'];
export const POCKETS = ['kangaroo', 'split-kangaroo', 'welt', 'flap-welt', 'chest', 'chest-flap', 'zip-chest', 'patch-hip', 'cargo', 'five-pocket', 'slash'];
// where a button-down collar's buttons sit on a shirt's flats (the recipe menu draws them there, and a picture read draws them back)
export const BUTTON_DOWN = { x: 2.2, y: 5.45 };
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
  for (const k of ['quilted', 'belt', 'lined', 'backPockets', 'beltLoops', 'coinPocket', 'utility', 'buttondown']) if (typeof c[k] === 'boolean') out[k] = c[k];
  if (ok(c.backPocket, BACK_POCKETS)) out.backPocket = c.backPocket; if (ok(c.hem, HEMS)) out.hem = c.hem; if (ok(c.ankle, ANKLES)) out.ankle = c.ankle; if (ok(c.breasted, BREASTED)) out.breasted = c.breasted; if (ok(c.lapel, LAPELS)) out.lapel = c.lapel;
  return out;
}

// What the details added on the flats say about how the piece is built (a chest pocket, a zip, a placket, a drawcord waist, pleats), so a
// detail drawn on the flats is drafted and listed too, not only drawn. Each detail counts once; a pair (left and right, mirrored: the recipe
// menu's `r-…-2`, or a part flipped) is one pocket on a bottom (its pockets are pairs) and two on a top (each chest pocket is its own).
const POCKET_OF = { 'pocket-kangaroo': 'kangaroo', 'pocket-cargo': 'cargo', 'pocket-jean': 'five-pocket', 'pocket-slant': 'slash' };
export function fromEdits(p) {
  const S = STYLES[p?.style] || {}, top = S.kind === 'top', bottom = S.kind === 'bottom', out = {}, pk = [];
  const edits = (Array.isArray(p?.edits) ? p.edits : []).filter(e => e && (e.type === 'detail' || e.type === 'part'));
  if ((!top && !bottom) || !edits.length) return out;
  let m = {}; try { m = measurementsFor(p, 'M') || {}; } catch { m = {}; }
  const L = m.length || 26;
  const kindOf = e => (e.type === 'part' ? ({ pockets: 'pocket-patch', zips: 'zip' }[partOf(e.part)?.kind] || null) : e.kind);
  for (const e of edits) {
    const k = kindOf(e), back = e.view === 'back'; if (!k) continue;
    if (bottom) {
      if (back && /^pocket-(welt|zip)$/.test(k)) { out.backPockets = true; out.backPocket = 'welt'; continue; }
      if (back && /^pocket-(patch|flap|jean)$/.test(k)) { out.backPockets = true; out.backPocket = out.backPocket || (k === 'pocket-jean' ? 'jeans' : 'square'); continue; }
      if (back) continue;
      if (POCKET_OF[k] && !pk.includes(POCKET_OF[k])) pk.push(POCKET_OF[k]);
      else if (k === 'pocket-patch' || k === 'pocket-flap') { if (!pk.includes('cargo') && e.y > (m.rise || 11)) pk.push('cargo'); }
      if (k === 'drawcord') out.waist = 'drawcord';
      if (k === 'pleat') out.pleats = Math.min(Math.max(Math.round(Number(e.count) || 1), 1), 3);
      continue;
    }
    if (back) continue;
    const chest = e.y < L * .5;
    if (k === 'pocket-patch') pk.push(chest ? 'chest' : 'patch-hip');
    else if (k === 'pocket-flap') pk.push(chest ? 'chest-flap' : 'flap-welt');
    else if (k === 'pocket-welt') pk.push('welt');
    else if (k === 'pocket-zip') { if (chest) pk.push('zip-chest'); } // a zip pocket on the chest (a low one on a top is drawn and listed, not drafted)
    else if (k === 'pocket-slant' && p.style === 'dress') { if (!pk.includes('slash')) pk.push('slash'); } // a dress's side pockets: a pair, one pocket each side
    else if (k === 'button' && Math.abs(e.x) > 1 && Math.abs(e.x) < 4.5 && e.y < (m.neckDropFront || 3) + 4) out.buttondown = true; // a button under each collar point
    else if (POCKET_OF[k] && POCKET_OF[k] !== 'five-pocket' && POCKET_OF[k] !== 'slash') pk.push(POCKET_OF[k]);
    else if (k === 'zip') out.opening = e.h >= L * .6 ? 'zip' : e.h >= 9 ? 'half-zip' : 'quarter-zip';
    else if (k === 'placket') out.opening = out.opening || 'placket';
  }
  // a top's pocket that comes in a pair counts once per side; a kangaroo is one however it is drawn
  if (pk.length) out.pockets = top ? pk.filter((x, i) => x !== 'kangaroo' || pk.indexOf(x) === i) : pk;
  return out;
}
// at least as many of each pocket as `add` has, keeping the order of `have`
const unionPockets = (have = [], add = []) => { const out = [...have]; for (const k of new Set(add)) { const need = add.filter(x => x === k).length - out.filter(x => x === k).length; for (let i = 0; i < need; i++) out.push(k); } return out; };
// the description a piece is drafted from: set, then named, then the style's own; the details added on the flats on top of what the sketch has
export function constructionOf(p) {
  const t = p.template && p.template !== 'none' ? FLAT_TEMPLATES.find(x => x.id === p.template) : null;
  const set = cleanConstruction(p.options?.construction), named = t ? cleanConstruction(fromName(`${t.id} ${t.label}`, p.style)) : {}, base = styleDefaults(p.style, p.options || {});
  const seen = t ? cleanConstruction(TEMPLATE_CONSTRUCTION[t.id]) : {};
  const out = { ...base, ...named, ...seen, ...set }, ed = cleanConstruction(fromEdits(p));
  // a detail on the flats adds to the sketch's own (a chest pocket on a plain tee is drafted); what was set by hand on the Pattern page stays as set
  if (ed.pockets && !set.pockets) out.pockets = unionPockets(out.pockets, ed.pockets);
  for (const k of ['opening', 'waist']) if (ed[k] && !set[k] && (!out[k] || out[k] === 'none' || out[k] === 'fixed')) out[k] = ed[k];
  if (ed.pleats && !('pleats' in set) && !out.pleats) out.pleats = ed.pleats;
  if (ed.backPockets && !('backPockets' in set)) { out.backPockets = true; if (!set.backPocket) out.backPocket = ed.backPocket; }
  if (ed.buttondown && !('buttondown' in set) && out.collar === 'shirt') out.buttondown = true; // the buttons under a shirt collar's points
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
  for (const [k, n] of Object.entries(pk)) { const nm = { kangaroo: 'kangaroo pocket', 'split-kangaroo': 'split kangaroo pocket', welt: 'welt pockets', 'flap-welt': 'flap pockets', chest: 'chest pocket', 'chest-flap': 'flap chest pocket', 'zip-chest': 'zip chest pocket', 'patch-hip': 'patch hip pocket', cargo: 'cargo pockets', 'five-pocket': 'five-pocket', slash: 'slash pockets' }[k]; w.push(`${n > 1 ? `${n} ` : ''}${n > 1 && !/s$/.test(nm) ? nm + 's' : nm}`.replace(/^./, s => s.toUpperCase())); }
  if (c.waist && c.waist !== 'fixed') w.push(c.waist === 'drawcord' ? 'Elastic waist with drawcord' : 'Elastic waist');
  if (c.backPockets === false) w.push('No back pockets');
  if (c.beltLoops) w.push('Belt loops');
  if (c.buttondown) w.push('Button-down collar');
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
