// The product, both ways between its flats and its picture (src/lab-flats-routes.js): one list of everything the flats say about the piece,
// which the picture drawn from the flats is asked to show and then checked for; and what a picture says about how the piece is built, read
// into the flats so the pattern and the tech pack draft and list it, not only the drawing.
//
//   flatDetails(p, { placements, fabric, colourName })   every detail of the flats: what it is, its colour, how it is built (as the sketch
//                                                        draws it), every detail added on the flats with its size and place, the neckline,
//                                                        the wash and wear, the graphics and the cloth. Each { key, group, view, label, words }
//   pictureBrief(details)                                those details as the words the image model is given with the front and back flats
//   pictureFromFlatsPrompt({ details, words, back })     the whole prompt for the picture drawn from the flats
//   auditOf(details) / auditResult(answer, checked)      what a vision model is asked of the picture, and what it found kept or missing
//   BUILD_SCHEMA, BUILD_SYSTEM, buildAsk(style)          how the piece is built, read from a picture or a drawing (shared with the Pattern page)
//   LOOK_SCHEMA, lookOf(p), applyLook(p, look)           how it is finished, read the same way: neckline, wash, wear, cropped, contrast trims
//   buildEdits(read, p)                                  the details a stock sketch does not draw but the picture shows, as flats details
//   compareDetails(before, after)                        which details made it from one list to the other
//   readBack(p, read, look) / tripLoss(p, p2)            the flats a picture of p makes, and what of p they lost (scripts/flats-roundtrip.mjs)
//   familyOf, readContribution, readRemoved, tripStats   what real use loses, counted by detail (src/lab-trip-routes.js, /lab/trip)
//   gapCounts, ratchetGaps, ratchetLive                  the ratchet: the known gaps only shrink, the live score only rises
//                                                        (src/lab-trip-baseline.json; test/lab-trip.test.js, scripts/flats-roundtrip.mjs)
// Pure: no I/O. Graphics are carried as layers over the picture (the Studio lays them at their size), not drawn by the image model.
import { STYLES, FITS, DETAILS, templateOf, describe, describeEdit, sideOf, defaultDetail, defaultParams, fitToTemplate, measurementsFor, partOf } from './lab-flats.js';
import { constructionOf, constructionWords, cleanConstruction, fromEdits, SLEEVES, COLLARS, OPENINGS, POCKETS, WAISTS, LEGS, PANELS, HEMS, ANKLES, BACK_POCKETS } from './lab-construction.js';
import { necklineOf, takesNeckline, necklineMeasures, NECKLINE_IDS } from './lab-neck.js';
import { washOf, cleanWash, cleanDistress, distressParts, WASH_IDS, STRENGTHS, DISTRESS_FOCUS } from './lab-wash.js';

const fmt = v => { const n = Math.round(Number(v) * 8) / 8, w = Math.floor(n), f = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][Math.round((n - w) * 8)]; return `${w || !f ? w : ''}${f} in`; };
const one = (k, v) => constructionWords({ [k]: v })[0] || '';
// which part of how the piece is built a detail on the flats accounts for (a patch pocket up on the chest is the chest pocket, a long zip the
// opening, a drawcord on trousers the waist): src/lab-construction.js fromEdits, one detail at a time
function covers(e, p) {
  const k = fromEdits({ ...p, edits: [e] }), out = [];
  for (const x of k.pockets || []) out.push(`pocket:${x}`); if (k.opening) out.push('opening'); if (k.waist) out.push('waist'); if (k.pleats) out.push('pleats'); if (k.backPockets) out.push('back-pockets');
  return out;
}

// the construction, one detail each, with the side it is seen from
function buildDetails(k, style) {
  const out = [], S = STYLES[style] || {}, bottom = S.kind === 'bottom', add = (key, view, label) => label && out.push({ key, group: 'build', view, label });
  if (k.sleeve && k.sleeve !== 'set') add('sleeve', 'both', one('sleeve', k.sleeve));
  if (k.hood) add('hood', 'both', 'Hood');
  if (k.collar && !['none', 'rib'].includes(k.collar)) add('collar', 'both', one('collar', k.collar));
  if (k.opening && k.opening !== 'none') add('opening', 'front', one('opening', k.opening));
  if (k.yoke?.front) add('yoke-front', 'front', 'Front yoke'); if (k.yoke?.back) add('yoke-back', 'back', 'Back yoke');
  const pk = {}; for (const x of k.pockets || []) pk[x] = (pk[x] || 0) + 1;
  for (const [x, n] of Object.entries(pk)) add(`pocket:${x}`, 'front', constructionWords({ pockets: Array(n).fill(x) })[0]);
  if (k.waist && k.waist !== 'fixed') add('waist', 'front', one('waist', k.waist));
  if (k.knee === 'double') add('knee', 'front', 'Double knee');
  if (k.leg && k.leg !== 'straight') add('leg', 'both', one('leg', k.leg));
  if (k.pleats) add('pleats', 'front', one('pleats', k.pleats));
  if (k.panels && k.panels !== 'none') add('panels', 'both', one('panels', k.panels));
  if (k.quilted) add('quilted', 'both', 'Channel-quilted'); if (k.belt) add('belt', 'front', 'Belt');
  if (k.hem === 'curved') add('hem', 'both', 'Curved hem'); if (k.ankle && k.ankle !== 'open') add('ankle', 'both', one('ankle', k.ankle));
  if (k.collar === 'lapel' && k.breasted) add('breasted', 'front', k.breasted === 'double' ? 'Double-breasted' : 'Single-breasted');
  if (k.collar === 'lapel' && k.lapel) add('lapel', 'front', k.lapel === 'peak' ? 'Peak lapel' : 'Notch lapel');
  if (k.beltLoops) add('belt-loops', 'front', 'Belt loops'); if (k.utility) add('utility', 'front', 'Rule pocket and hammer loop');
  if (bottom && k.backPockets !== false && k.backPocket) add('back-pockets', 'back', { jeans: 'Jeans back pockets', square: 'Square patch back pockets', welt: 'Welt back pockets' }[k.backPocket]);
  if (k.lined) out.push({ key: 'lined', group: 'build', view: 'inside', label: 'Lined' });
  return out;
}
// a detail added on the flats, in a few words: what it is and where
function editLabel(e, p) {
  const side = e.view === 'back' ? 'back' : 'front';
  if (e.type === 'block') return `${e.name || 'A part'} in ${e.color} (${side})`;
  if (e.type === 'stitch') return `A line of topstitching on the ${side}`;
  if (e.type === 'ai') return `Redrawn on the ${side}: ${e.prompt || 'a change'}`;
  if (e.type === 'part') { const q = partOf(e.part); return `${e.name || q?.label || 'A part'} (${q ? q.kind.replace(/s$/, '') : 'part'}) on the ${side}, ${fmt(e.w)} wide, ${describe({ ...e, name: e.name || q?.label || 'it' }, p)}`; }
  const name = e.kind === 'pleat' ? 'Pleats' : DETAILS[e.kind] || 'A detail';
  return `${name} on the ${side}, ${fmt(e.w)} × ${fmt(e.h)}, ${describe({ ...e, name }, p)}${e.color ? `, in ${e.color}` : ''}`;
}

export function flatDetails(p, { placements = [], fabric = null, colourName = '' } = {}) {
  const S = STYLES[p?.style]; if (!S) return [];
  const out = [], t = templateOf(p), garment = S.kind !== 'goods';
  out.push({ key: 'kind', group: 'kind', view: 'both', label: `${S.label}${t && t.label !== S.label ? ` (${t.label})` : ''}${garment && p.fit && FITS[p.fit] ? `, ${FITS[p.fit].toLowerCase()} fit` : ''}` });
  if (p.color) out.push({ key: 'colour', group: 'colour', view: 'both', label: `Main colour ${colourName ? `${colourName} (${p.color})` : p.color}` });
  if (fabric) out.push({ key: 'fabric', group: 'cloth', view: 'both', label: `Cloth: ${fabric}` });
  // how it is built, less what a detail added on the flats accounts for: that is listed as itself, with its size and place, once
  const edits = (Array.isArray(p.edits) ? p.edits : []).map((e, i) => ({ e, i, covers: e && (e.type === 'detail' || e.type === 'part') ? covers(e, p) : [] }));
  if (garment && ['top', 'bottom'].includes(S.kind)) { const took = edits.flatMap(x => x.covers); out.push(...buildDetails(constructionOf(p), p.style).filter(d => !took.includes(d.key))); }
  if (p.options?.cropped || p.crop) out.push({ key: 'cropped', group: 'build', view: 'both', label: 'Cropped' });
  const n = necklineOf(p.neckline); if (n && takesNeckline(p.style)) out.push({ key: 'neckline', group: 'build', view: 'front', label: n.label });
  const w = cleanWash(p.wash), d = cleanDistress(p.distress);
  if (w) out.push({ key: 'wash', group: 'finish', view: 'both', label: `${w.strength.replace(/^./, c => c.toUpperCase())} ${washOf(w.type).label.toLowerCase()}` });
  if (d?.on && d.amount > 0) out.push({ key: 'distress', group: 'finish', view: 'both', label: `${distressParts(d.amount, d.focus || 'all').level.replace(/^./, c => c.toUpperCase())} distressing` });
  for (const { e, i, covers: cv } of edits) {
    if (!e || e.type === 'rub' || (e.type === 'detail' && e.kind === 'erase')) continue;
    out.push({ key: `edit:${e.id || i}`, group: e.type === 'block' ? 'colour' : e.type === 'detail' || e.type === 'part' ? 'detail' : e.type, view: e.view === 'back' ? 'back' : 'front', label: editLabel(e, p), words: describeEdit(e, p), ...(cv.length ? { covers: cv } : {}) });
  }
  if (p.allover) out.push({ key: 'allover', group: 'graphic', view: 'both', label: `All-over print: ${p.allover.name || 'a repeat'}`, layer: false });
  for (const q of placements || []) out.push({ key: `place:${q.id}`, group: 'graphic', view: q.view === 'back' ? 'back' : 'front', label: `${q.name} on the ${sideOf(q, p).toLowerCase()}, ${fmt(q.w)} wide`, words: `${sideOf(q, p)}: ${q.name}, ${describe(q, p)}`, layer: true });
  return out;
}

// the details in words for the image model: what shows from the front, and what is on the back (which it sees in the back flat)
export function pictureBrief(details = []) {
  const said = d => d.words ? d.words.replace(/^(Front|Back): /, '') : d.label;
  const drawn = details.filter(d => !d.layer && d.group !== 'kind' && d.view !== 'inside'), front = drawn.filter(d => d.view !== 'back'), back = drawn.filter(d => d.view === 'back');
  return [front.length ? `Every one of these must show, where the flat draws it:\n${front.map(d => `- ${said(d)}`).join('\n')}` : '',
    back.length ? `On the back (image 2, the back flat; it does not show in a front view, but the garment is the one that has it):\n${back.map(d => `- ${said(d)}`).join('\n')}` : ''].filter(Boolean).join('\n');
}
export function pictureFromFlatsPrompt({ details = [], words = '', back = false, insist = [] } = {}) {
  const kind = details.find(d => d.key === 'kind')?.label || 'garment', brief = pictureBrief(details), missed = details.filter(d => insist.includes(d.key));
  return [`Image 1 is the technical flat of a ${kind}, front view${back ? '; image 2 is the same garment\'s back flat' : ''}.`,
    `Turn it into a photorealistic product photograph of exactly that garment${words ? `, ${words}` : ''}: front view, on an invisible mannequin, on a plain light grey studio background, soft even light.`,
    'Keep the cut, the proportions, the length and the silhouette as the flat draws them, and every detail where the flat draws it, at its size: pockets and flaps, collar, closures, buttons, zips and pullers, seams and panels, cuffs, hems and bands, drawcords, topstitching, and the colour of each part.',
    brief,
    missed.length ? `The last photograph left out ${missed.map(d => d.label.toLowerCase()).join('; ')}. Show ${missed.length > 1 ? 'them' : 'it'} clearly this time.` : '',
    'Do not add anything the flat does not draw: no extra pockets, seams, trims or closures. No person, no logos, no printed graphics and no words: the graphics are laid on the picture separately, at their size.'
  ].filter(Boolean).join('\n');
}

// the check of a picture: a yes or no for each detail that can be seen from the front (graphics are layers, the inside cannot be seen)
export function auditOf(details = []) {
  const checked = details.filter(d => !d.layer && d.view !== 'back' && d.view !== 'inside').slice(0, 40);
  const properties = Object.fromEntries(checked.map((d, i) => [`d${i}`, { type: 'string', enum: ['yes', 'no', 'unsure'], description: d.words ? d.words.replace(/^(Front|Back): /, '') : d.label }]));
  return { checked, schema: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties },
    system: 'You are a garment technologist checking a product photograph against its technical flat. For each detail, say whether the photograph shows it as the flat specifies: yes, no (missing, or clearly different), or unsure (it cannot be seen from this angle).',
    text: 'For each detail in the schema: is it in the photograph?' };
}
export function auditResult(answer = {}, checked = []) {
  const at = s => checked.filter((d, i) => answer?.[`d${i}`] === s);
  return { kept: at('yes').map(d => d.key), missing: at('no').map(d => d.key), unsure: at('unsure').map(d => d.key), labels: Object.fromEntries(checked.map(d => [d.key, d.label])) };
}

// ---- how the piece is built, read from a picture or a drawing ----
export const BUILD_SYSTEM = 'You are a pattern maker reading a garment from its picture or its flat sketch, to draft its pattern. Report only construction you can see, not what such a garment usually has.';
export const BUILD_SCHEMA = { type: 'object', additionalProperties: false, required: ['sleeve', 'hood', 'collar', 'opening', 'pockets', 'panels'], properties: {
  sleeve: { type: 'string', enum: SLEEVES }, hood: { type: 'boolean' }, collar: { type: 'string', enum: COLLARS }, opening: { type: 'string', enum: OPENINGS },
  yoke: { type: 'object', additionalProperties: false, required: ['front', 'back'], properties: { front: { type: 'boolean' }, back: { type: 'boolean' } } },
  pockets: { type: 'array', items: { type: 'string', enum: POCKETS }, description: 'each pocket you see (two chest pockets are two entries; a pair of hip, slash, cargo or jeans pockets on trousers is one entry)' },
  waist: { type: 'string', enum: WAISTS }, knee: { type: 'string', enum: ['single', 'double'] }, leg: { type: 'string', enum: LEGS },
  pleats: { type: 'integer' }, panels: { type: 'string', enum: PANELS }, quilted: { type: 'boolean' }, belt: { type: 'boolean' }, lined: { type: 'boolean' },
  hem: { type: 'string', enum: HEMS }, ankle: { type: 'string', enum: ANKLES }, beltLoops: { type: 'boolean' },
  backPockets: { type: 'boolean', description: 'trousers or shorts: pockets on the back' }, backPocket: { type: 'string', enum: BACK_POCKETS },
  breasted: { type: 'string', enum: ['single', 'double'], description: 'with a lapel collar: one row of buttons or a wide overlap with two rows' }, lapel: { type: 'string', enum: ['notch', 'peak'], description: 'with a lapel collar: a notch (a step down at the collar) or a peak (the lapel points up past the collar)' } } };
// how it is finished: what a picture shows besides how it is built, and what the flats keep of it
export const LOOK_SCHEMA = { type: 'object', additionalProperties: false, required: ['neckline', 'wash', 'washStrength', 'distress', 'distressFocus', 'cropped', 'contrast'], properties: {
  neckline: { type: 'string', enum: ['none', ...NECKLINE_IDS], description: 'a knit top\'s neckline: thin or regular crew, V neck, mock neck or turtleneck; none for a collar, a hood or a bottom' },
  wash: { type: 'string', enum: WASH_IDS, description: 'the wash or dye finish the cloth shows; none if it looks as dyed and finished' }, washStrength: { type: 'string', enum: STRENGTHS.map(s => s.id) },
  distress: { type: 'string', enum: ['none', 'light', 'medium', 'heavy'], description: 'holes, rips, fraying and worn patches' }, distressFocus: { type: 'string', enum: DISTRESS_FOCUS.map(f => f.id) },
  cropped: { type: 'boolean', description: 'the body is cut short, well above where such a garment usually ends' },
  contrast: { type: 'string', description: 'the colour of the pockets and trims as #rrggbb when it differs from the main cloth; empty when they match' } } };
const LEVEL_AMOUNT = { light: 25, medium: 50, heavy: 85 };
// the look of a piece's flats, as a reader of its picture should find it
export function lookOf(p = {}) {
  const w = cleanWash(p.wash), d = cleanDistress(p.distress), c = (p.edits || []).find(e => e.type === 'detail' && /^pocket/.test(e.kind) && e.color)?.color || '';
  return { neckline: takesNeckline(p.style) && necklineOf(p.neckline) ? p.neckline : 'none', wash: w?.type || 'none', washStrength: w?.strength || 'medium', distress: d?.on && d.amount > 0 ? distressParts(d.amount).level : 'none', distressFocus: d?.focus || 'all', cropped: Boolean(p.options?.cropped || p.crop), contrast: c };
}
// the flats with the look read from a picture: the neckline, the wash and wear, cropped, and the pockets in the contrast colour
export function applyLook(p, look) {
  if (!look || typeof look !== 'object') return p; const q = { ...p, options: { ...(p.options || {}) } }, hex = /^#[0-9a-f]{6}$/i.test(String(look.contrast || '')) ? String(look.contrast).toLowerCase() : '';
  // a neckline with its own measurements, as the recipe menu and the flats page set them, so the table and the factory read it
  if (takesNeckline(p.style) && NECKLINE_IDS.includes(look.neckline)) { q.neckline = look.neckline; if (p.m && 'neckWidth' in p.m) q.m = { ...p.m, ...necklineMeasures(look.neckline, defaultParams(p.style, p.fit || 'regular', p.options || {}).m) }; }
  if (WASH_IDS.includes(look.wash) && look.wash !== 'none') q.wash = { type: look.wash, strength: STRENGTHS.some(s => s.id === look.washStrength) ? look.washStrength : 'medium' };
  if (LEVEL_AMOUNT[look.distress]) q.distress = { on: true, amount: LEVEL_AMOUNT[look.distress], ...(DISTRESS_FOCUS.some(f => f.id === look.distressFocus) && look.distressFocus !== 'all' ? { focus: look.distressFocus } : {}) };
  if (look.cropped && STYLES[p.style]?.kind === 'top' && !p.crop) q.options.cropped = true;
  if (hex) q.edits = (p.edits || []).map(e => (e.type === 'detail' && /^pocket/.test(e.kind) && !e.color ? { ...e, color: hex } : e));
  return q;
}
export const buildAsk = style => `The piece is a ${STYLES[style]?.label || 'garment'}. Say how it is built, from what the images show. Pockets: list each one you see.`;

// The details a stock sketch does not draw but the picture shows (a chest pocket on a plain tee sketch, a zip on a crew), as flats details
// placed where that kind of detail usually goes, so the flat shows them until it is drawn from the picture itself
const PAIR = { 'five-pocket': 'pocket-jean', slash: 'pocket-slant', cargo: 'pocket-cargo', welt: 'pocket-welt', 'patch-hip': 'pocket-patch', 'flap-welt': 'pocket-flap' };
export function buildEdits(read, p) {
  const S = STYLES[p?.style] || {}, top = S.kind === 'top', bottom = S.kind === 'bottom', k = cleanConstruction(read); if (!top && !bottom) return [];
  const have = constructionOf({ ...p, edits: [], options: { ...(p.options || {}), construction: undefined } }), out = [], m = measurementsFor(p, 'M'), L = m.length || 26, half = top ? (m.chest || 20) / 2 : (m.waist || 16) / 2;
  const put = (kind, box = {}, view = 'front', pair = false) => { const d = { ...defaultDetail(kind, p, view), ...box, id: `pic-${kind}-${out.length}`, type: 'detail' }; out.push(d); if (pair && Math.abs(d.x) > .01) out.push({ ...d, id: `${d.id}-2`, x: -d.x, flip: !d.flip }); };
  const count = (list, x) => (list || []).filter(y => y === x).length;
  for (const x of new Set(k.pockets || [])) {
    const need = count(k.pockets, x) - count(have.pockets, x); if (need <= 0) continue;
    if (top && (x === 'chest' || x === 'chest-flap')) for (let i = 0; i < need; i++) put(x === 'chest' ? 'pocket-patch' : 'pocket-flap', i ? { x: -defaultDetail('pocket-patch', p).x } : {});
    else if (top && (x === 'kangaroo' || x === 'split-kangaroo')) put('pocket-kangaroo');
    else if (top && x === 'patch-hip') put('pocket-patch', { x: half * .45, y: L * .7, w: 6, h: 6.5 }, 'front', true);
    else if (top && x === 'flap-welt') put('pocket-flap', { x: half * .45, y: L * .66, w: 5.5, h: 2.25 }, 'front', true);
    else if (top && x === 'welt') put('pocket-welt', {}, 'front', true);
    else if (PAIR[x] && bottom) put(PAIR[x], {}, 'front', true);
  }
  if (top && k.opening && k.opening !== 'none' && (!have.opening || have.opening === 'none')) {
    if (k.opening === 'zip') put('zip');
    else if (k.opening === 'half-zip' || k.opening === 'quarter-zip') { const h = k.opening === 'half-zip' ? 10 : 7, d = defaultDetail('zip', p); put('zip', { h, y: d.y - d.h / 2 + h / 2 }); }
    else if (k.opening === 'buttons') { const d = defaultDetail('placket', p); put('placket', { h: Math.max(d.h, L - (m.neckDropFront || 3) - 1.5), y: (m.neckDropFront || 3) + Math.max(d.h, L - (m.neckDropFront || 3) - 1.5) / 2 }); }
    else put('placket');
  }
  if (bottom && k.waist === 'drawcord' && have.waist !== 'drawcord') put('drawcord');
  if (bottom && k.pleats && !have.pleats) put('pleat', { count: k.pleats }, 'front', true);
  if (bottom && k.backPockets && k.backPocket && !(have.backPockets !== false && have.backPocket)) put(k.backPocket === 'welt' ? 'pocket-welt' : 'pocket-patch', {}, 'back', true);
  return out;
}

// which details made it across: keyed for what is built and how it is finished; the details added on the flats by what they are and where
export function compareDetails(before = [], after = []) {
  const sig = d => d.key.startsWith('edit:') || d.key.startsWith('place:') ? `${d.group}:${d.view}:${d.label.replace(/,.*$/, '').replace(/ \(.*$/, '').toLowerCase()}` : d.key;
  // a detail and the construction it accounts for are one thing: a drawcord drawn on the flats and the sketch's own drawcord waist, a chest
  // pocket drawn and a chest pocket built
  const parts = list => new Set(list.flatMap(d => [sig(d), ...(d.covers || [])]));
  const have = parts(after), kept = [], lost = [];
  for (const d of before) (have.has(sig(d)) || (d.covers || []).some(k => have.has(k)) ? kept : lost).push(d);
  const had = parts(before), added = after.filter(d => !had.has(sig(d)) && !(d.covers || []).some(k => had.has(k)));
  return { kept, lost, added, score: before.length ? kept.length / before.length : 1 };
}

// The flats a picture of `p` makes (src/lab-flats-routes.js initial): the same garment on the same sketch, built and finished as the picture
// was read; by default read perfectly, as the flats themselves are built, so what is lost is what the code loses, not the model
export function readBack(p, read = cleanConstruction(constructionOf(p)), look = lookOf(p)) {
  const base = fitToTemplate({ ...defaultParams(p.style, p.fit || 'regular'), template: p.template, ...(p.color ? { color: p.color } : {}) });
  const q = { ...base, options: { ...(base.options || {}), construction: read } };
  return applyLook({ ...q, edits: buildEdits(read, q) }, look);
}
// what a picture cannot give back, by design: the exact line of a stitch, a part's own artwork from the sketch pack, a zip pocket or a dress's
// side pocket or a skirt's zip (drawn and listed, not drafted, so not read), a button on a collar point, a redrawn area, the colour of one panel. They stay
// on the flats; a picture read back draws the flats anew
export const notReadBack = (d, p = {}) => ['stitch', 'redrawn', 'ai'].includes(d.group) || (d.group === 'colour' && d.key.startsWith('edit:')) || (/^(Zip pocket|Button|Slant pocket|.*\((pocket|zip|collar|trim|button)\))/.test(d.label) && !d.covers)
  || (STYLES[p.style]?.kind === 'bottom' && /^Zip on/.test(d.label)); // a zip on a skirt or trousers is its closure, drawn and listed, not drafted
export function tripLoss(p, p2) {
  const c = compareDetails(flatDetails(p).filter(d => !d.layer), flatDetails(p2)), w1 = constructionWords(constructionOf(p)), w2 = constructionWords(constructionOf(p2));
  return { lost: [...w1.filter(x => !w2.includes(x)), ...c.lost.filter(d => !notReadBack(d, p)).map(d => d.label)], added: [...w2.filter(x => !w1.includes(x)), ...c.added.map(d => d.label)], notCarried: c.lost.filter(d => notReadBack(d, p)).map(d => d.label), score: c.score };
}

// ---- what real use loses (src/lab-trip-routes.js records it; the Flats ↔ picture page at /lab/trip shows it) ----
// one name for a detail across pieces, so a miss on one piece and on the next count together: 'Hood', 'Patch pocket', 'Wash'
export function familyOf(key = '', label = '') {
  const fixed = { kind: 'Garment type', colour: 'Main colour', fabric: 'Cloth', wash: 'Wash', distress: 'Distressing', cropped: 'Cropped', allover: 'All-over print' }[key];
  if (fixed) return fixed;
  const l = String(label || key);
  return (/^(edit|place):/.test(key) ? l.replace(/ on the .*$/i, '') : l).replace(/,.*$/, '').replace(/ \(.*$/, '').replace(/ in #[0-9a-f]{6}.*$/i, '').trim() || key;
}
// what a picture read put on the flats: the details of the flats after the read that the sketch alone did not have (how it is built, how it
// is finished, the stand-ins drawn for what the sketch does not draw); its colour and graphics are design, not read
export function readContribution(before = [], after = []) {
  return compareDetails(before, after).added.filter(d => ['build', 'finish', 'detail'].includes(d.group) && !d.layer)
    .map(({ key, group, view, label, covers: cv }) => ({ key, group, view, label, ...(cv ? { covers: cv } : {}) }));
}
// what of a read was taken off the flats by hand: a stand-in detail deleted, a neckline, a wash or a construction detail changed or removed,
// and the garment type if it was changed. A detail resized or moved is kept (its key stays)
export function readRemoved(read = [], saved = [], { readStyle = null, savedStyle = null } = {}) {
  const keys = new Set(saved.map(d => d.key)), same = new Set(saved.map(d => `${d.key}|${d.label}`));
  const gone = read.filter(d => d.key.startsWith('edit:') ? !keys.has(d.key) : !same.has(`${d.key}|${d.label}`)).map(d => d.key);
  return readStyle && savedStyle && readStyle !== savedStyle ? ['kind', ...gone] : gone;
}
// the counts the page shows, from lab_trip_events rows: { kind, style, kept, missing, unsure, insist, labels, details }
export function tripStats(rows = []) {
  const fam = new Map(), styles = new Map(), at = f => { if (!fam.has(f)) fam.set(f, { family: f, checked: 0, missing: 0, unsure: 0, asked: 0, fixed: 0, read: 0, removed: 0 }); return fam.get(f); };
  const t = { checks: 0, clean: 0, checked: 0, kept: 0, missing: 0, unsure: 0, redos: 0, asked: 0, fixed: 0, reads: 0, corrected: 0, removed: 0 };
  for (const r of rows) {
    const L = r.labels || {}, f = k => familyOf(k, L[k]), kept = r.kept || [], missing = r.missing || [], unsure = r.unsure || [], insist = r.insist || [];
    if (r.kind === 'check') {
      t.checks++; if (!missing.length) t.clean++;
      t.kept += kept.length; t.missing += missing.length; t.unsure += unsure.length; t.checked += kept.length + missing.length + unsure.length;
      for (const k of kept) at(f(k)).checked++;
      for (const k of missing) { const x = at(f(k)); x.checked++; x.missing++; }
      for (const k of unsure) { const x = at(f(k)); x.checked++; x.unsure++; }
      if (insist.length) { t.redos++; for (const k of insist) { t.asked++; const x = at(f(k)); x.asked++; if (kept.includes(k)) { t.fixed++; x.fixed++; } } }
      const s = styles.get(r.style) || { style: r.style, checks: 0, checked: 0, missing: 0 }; s.checks++; s.checked += kept.length + missing.length; s.missing += missing.length; styles.set(r.style, s);
    } else if (r.kind === 'read') { t.reads++; for (const d of r.details || []) at(familyOf(d.key, d.label)).read++; }
    else if (r.kind === 'correction' && missing.length) { t.corrected++; t.removed += missing.length; for (const k of missing) at(f(k)).removed++; }
  }
  const rate = (a, b) => b ? Math.round(a / b * 1000) / 1000 : null;
  return { totals: { ...t, keptRate: rate(t.kept, t.kept + t.missing), fixedRate: rate(t.fixed, t.asked), correctedRate: rate(t.corrected, t.reads) },
    details: [...fam.values()].map(x => ({ ...x, missRate: rate(x.missing, x.checked - x.unsure), fixedRate: rate(x.fixed, x.asked), removedRate: rate(x.removed, x.read) }))
      .sort((a, b) => (b.missing + b.removed) - (a.missing + a.removed) || b.checked - a.checked || a.family.localeCompare(b.family)),
    styles: [...styles.values()].map(s => ({ ...s, missRate: rate(s.missing, s.checked) })).sort((a, b) => b.missing - a.missing || b.checks - a.checks) };
}

// ---- the ratchet (src/lab-trip-baseline.json): what is known not to carry may only shrink, and the live score may only rise ----
// the known gaps (tripLoss's notCarried), counted by what they are
export function gapCounts(labels = []) {
  const out = {}; for (const l of labels) { const f = familyOf('edit:', l); out[f] = (out[f] || 0) + 1; }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
// worse: a gap that is new or grew (fix it: a detail the flats have must carry); better: one that shrank (lower the baseline, so it stays so)
export function ratchetGaps(baseline = {}, now = {}) {
  const worse = [], better = [];
  for (const [k, n] of Object.entries(now)) if (n > (baseline[k] || 0)) worse.push(`${k}: ${baseline[k] || 0} → ${n}`);
  for (const [k, n] of Object.entries(baseline)) if ((now[k] || 0) < n) better.push(`${k}: ${n} → ${now[k] || 0}`);
  return { worse, better };
}
// the live run against the last kept one: the share of checked details the pictures kept, scaled to this run, may fall by at most `slack`
// details (one picture drawn twice does not come out the same); first: no live run kept yet
export function ratchetLive(base, now, slack = 1) {
  if (!base?.checked) return { ok: true, first: true, better: true };
  const want = Math.ceil(base.kept / base.checked * now.checked) - slack;
  return { ok: now.kept >= want, want, better: now.checked > 0 && now.kept / now.checked > base.kept / base.checked };
}
