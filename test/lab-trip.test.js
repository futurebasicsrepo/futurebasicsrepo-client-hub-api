// The flats and the picture, both ways (src/lab-trip.js): every detail of the flats is told to the image model and checked for in the
// picture; what a picture says of how a piece is built and finished comes back into the flats; and a detail added on the flats is drafted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_BASES, addonsFor, cookRecipe } from '../src/lab-recipe.js';
import { STYLES, SIZES, defaultParams, fitToTemplate, viewsOf, measurementsFor, renderSvg } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { constructionOf, constructionWords, fromEdits, cleanConstruction } from '../src/lab-construction.js';
import { flatDetails, pictureBrief, pictureFromFlatsPrompt, auditOf, auditResult, buildEdits, lookOf, applyLook, compareDetails, readBack, tripLoss, notReadBack, BUILD_SCHEMA, LOOK_SCHEMA } from '../src/lab-trip.js';
import { garmentPattern } from '../src/lab-pattern.js';
import { constructionCheck } from '../src/lab-pattern-check.js';

const recipe = (base, addons = [], extra = {}) => cookRecipe({ base, addons, system: 'earth', ...extra }).params;
const said = d => d.words ? d.words.replace(/^(Front|Back): /, '') : d.label;

test('every recipe piece and every library sketch: the picture is told every detail, and a picture read back loses none the code can carry', () => {
  let pieces = 0;
  const check = (id, p) => { pieces++;
    const det = flatDetails(p), prompt = pictureFromFlatsPrompt({ details: det, back: viewsOf(p.style).includes('back') });
    for (const d of det) if (!d.layer && d.group !== 'kind' && d.view !== 'inside') assert.ok(prompt.includes(said(d)), `${id}: the prompt names ${d.label}`);
    const t = tripLoss(p, readBack(p));
    assert.deepEqual(t.lost, [], `${id}: lost reading its picture back`); assert.deepEqual(t.added, [], `${id}: added reading its picture back`); };
  for (const b of RECIPE_BASES) { if (!['top', 'bottom'].includes(STYLES[b.style].kind)) continue;
    for (const a of [null, ...addonsFor(b)]) { const r = cookRecipe({ base: b.id, addons: a ? [a.id] : [], system: 'earth' }); if (!r.error) check(`${b.id}+${a?.id || '-'}`, r.params); } }
  for (const t of FLAT_TEMPLATES) if (['top', 'bottom'].includes(STYLES[t.style]?.kind)) check(t.id, fitToTemplate({ ...defaultParams(t.style, 'regular'), template: t.id }));
  assert.ok(pieces > 600, `${pieces} pieces`);
});

test('a detail added on the flats is drafted: the chest pocket, the placket, the drawcord and the pleats reach the pattern, which still makes the piece', () => {
  assert.deepEqual(fromEdits(recipe('tee', ['chest-pocket'])), { pockets: ['chest'] });
  assert.deepEqual(fromEdits(recipe('tee', ['placket'])), { opening: 'placket' });
  assert.deepEqual(fromEdits(recipe('jacket', ['flap-pocket'])).pockets, ['chest-flap']);
  assert.equal(fromEdits(recipe('pants', ['cargo', 'waist-drawcord'])).waist, 'drawcord');
  // a pocket drawn below the waist of a top is a hip pocket, a pair on trousers is one pocket, a back pocket is a back pocket
  const t = recipe('tee'), hip = { ...t, edits: [{ type: 'detail', kind: 'pocket-patch', view: 'front', x: 4, y: t.m.length * .75, w: 6, h: 6 }, { type: 'detail', kind: 'pocket-patch', view: 'front', x: -4, y: t.m.length * .75, w: 6, h: 6 }] };
  assert.deepEqual(fromEdits(hip).pockets, ['patch-hip', 'patch-hip']);
  const pb = recipe('pants'), back = { ...pb, edits: [{ type: 'detail', kind: 'pocket-welt', view: 'back', x: 4, y: 4, w: 5, h: .6 }, { type: 'detail', kind: 'pocket-cargo', view: 'front', x: 7, y: 15, w: 7, h: 8 }, { type: 'detail', kind: 'pocket-cargo', view: 'front', x: -7, y: 15, w: 7, h: 8 }] };
  assert.deepEqual(fromEdits(back), { backPockets: true, backPocket: 'welt', pockets: ['cargo'] });
  // a zip pocket is drawn and listed, not drafted (the pattern has no zip pocket yet)
  assert.deepEqual(fromEdits(recipe('hoodie', ['zip-pocket'])), {});
  // in the construction, at least as many as the sketch has, and never more than drawn; what was set by hand stays as set
  assert.deepEqual(constructionOf(recipe('hoodie', ['chest-pocket'])).pockets, ['kangaroo', 'chest']);
  assert.deepEqual(constructionOf({ ...recipe('hoodie', ['chest-pocket']), options: { construction: { pockets: [] } } }).pockets, []);
  assert.ok(constructionWords(constructionOf(recipe('tee', ['chest-pocket']))).includes('Chest pocket'));
  assert.deepEqual(constructionWords({ pockets: ['welt', 'welt', 'chest', 'chest'] }), ['2 welt pockets', '2 chest pockets']);
  // and every recipe piece with a detail added still makes a pattern that sews together at every size
  for (const b of RECIPE_BASES) { if (!['top', 'bottom'].includes(STYLES[b.style].kind)) continue;
    for (const a of addonsFor(b).filter(x => x.detail)) { const p = recipe(b.id, [a.id]); if (!Object.keys(fromEdits(p)).length) continue;
      for (const z of (STYLES[p.style].oneSize ? ['M'] : SIZES)) { const pat = garmentPattern(p, z), k = constructionCheck(pat, { m: measurementsFor(p, z), style: p.style }); assert.ok(k.ok, `${b.id}+${a.id} at ${z}`); } } }
});

test('the detail list: what it is, how it is built, what was added, how it is finished, the graphics; each once, on its side', () => {
  const p = recipe('hoodie', ['chest-pocket', 'zip-pocket', 'wash-vintage', 'wear-edges']), d = flatDetails(p, { placements: [{ id: 'logo', name: 'Logo', view: 'back', x: 0, y: 3, w: 3, h: 1 }], fabric: '400 gsm fleece' });
  const key = k => d.find(x => x.key === k);
  assert.match(key('kind').label, /^Pullover hoodie/); assert.equal(key('colour').label, 'Main colour #b46a4c'); assert.equal(key('fabric').label, 'Cloth: 400 gsm fleece');
  assert.ok(key('hood') && key('pocket:kangaroo') && key('wash') && key('distress'));
  // the chest pocket is listed once, as the detail on the flats with its size and place, not again as how it is built
  assert.ok(key('edit:r-chest-pocket') && !key('pocket:chest')); assert.deepEqual(key('edit:r-chest-pocket').covers, ['pocket:chest']);
  assert.match(key('edit:r-chest-pocket').label, /^Patch pocket on the front, 4½ in × 5 in/);
  assert.equal(key('place:logo').view, 'back'); assert.equal(key('place:logo').layer, true);
  // the brief: the back's details are said apart, as the back flat's; graphics are not drawn by the image model
  const brief = pictureBrief([...d, { key: 'yoke-back', group: 'build', view: 'back', label: 'Back yoke' }]);
  assert.match(brief, /On the back \(image 2/); assert.match(brief, /- Back yoke/); assert.doesNotMatch(brief, /Logo/);
  const prompt = pictureFromFlatsPrompt({ details: d, back: true, insist: ['wash'] });
  assert.match(prompt, /image 2 is the same garment's back flat/); assert.match(prompt, /left out medium stone wash/); assert.match(prompt, /No person, no logos/);
  // no goods (a mug) are asked to be built; a goods piece still lists its colour
  const mug = flatDetails({ ...defaultParams('mug'), color: '#141416' }); assert.deepEqual(mug.map(x => x.key), ['kind', 'colour']);
});

test('the picture is checked detail by detail: what can be seen from the front, as kept, missing or unsure', () => {
  const d = flatDetails(recipe('shorts', ['jean-pockets', 'back-welts']), { placements: [{ id: 'g', name: 'Graphic', view: 'front', x: 0, y: 5, w: 4, h: 4 }] }), a = auditOf(d);
  assert.ok(a.checked.length > 3 && a.checked.every(x => !x.layer && x.view !== 'back' && x.view !== 'inside'));
  assert.deepEqual(a.schema.required, a.checked.map((x, i) => `d${i}`));
  const r = auditResult(Object.fromEntries(a.checked.map((x, i) => [`d${i}`, i === 1 ? 'no' : i === 2 ? 'unsure' : 'yes'])), a.checked);
  assert.deepEqual(r.missing, [a.checked[1].key]); assert.deepEqual(r.unsure, [a.checked[2].key]); assert.equal(r.kept.length, a.checked.length - 2);
  assert.equal(r.labels[a.checked[1].key], a.checked[1].label);
});

test('read from a picture: what the stock sketch does not draw is drawn on it where it goes, and the look is kept', () => {
  const tee = recipe('tee'), add = buildEdits({ pockets: ['chest', 'chest'], opening: 'quarter-zip' }, tee);
  assert.deepEqual(add.map(e => e.kind), ['pocket-patch', 'pocket-patch', 'zip']); assert.equal(add[0].x, -add[1].x); assert.equal(add[2].h, 7);
  for (const e of add) { assert.ok(e.id.startsWith('pic-') && e.type === 'detail'); assert.ok(Math.abs(e.x) + e.w / 2 < tee.m.chest / 2 && e.y > 0 && e.y < tee.m.length, `${e.kind} sits on the tee`); }
  // what the sketch draws already is not drawn again; a pair on trousers is drawn on both legs
  assert.deepEqual(buildEdits({ pockets: ['kangaroo'] }, recipe('hoodie')), []);
  assert.deepEqual(buildEdits({ pockets: ['cargo'], waist: 'drawcord' }, recipe('pants')).map(e => [e.kind, Math.sign(e.x)]), [['pocket-cargo', 1], ['pocket-cargo', -1], ['drawcord', 0]]);
  assert.deepEqual(buildEdits({ pockets: ['chest'] }, defaultParams('mug')), []);
  // the look: neckline (with its measurements), wash, wear, cropped and contrast pockets, both ways
  const p = recipe('tee', ['neck-mock', 'chest-pocket', 'wash-acid', 'wear-distressed']), look = lookOf(p);
  assert.deepEqual(look, { neckline: 'mock', wash: 'acid', washStrength: 'medium', distress: 'medium', distressFocus: 'all', cropped: false, contrast: '' });
  const q = applyLook({ ...recipe('tee'), edits: buildEdits({ pockets: ['chest'] }, recipe('tee')) }, { ...look, contrast: '#D23A2A', cropped: true });
  assert.equal(q.neckline, 'mock'); assert.equal(q.m.neckWidth, p.m.neckWidth); assert.deepEqual(q.wash, { type: 'acid', strength: 'medium' }); assert.equal(q.distress.amount, 50);
  assert.equal(q.options.cropped, true); assert.equal(q.edits[0].color, '#d23a2a'); assert.deepEqual(lookOf(q), { ...look, cropped: true, contrast: '#d23a2a' });
  assert.equal(applyLook(recipe('pants'), { neckline: 'vneck', wash: 'none', distress: 'none', cropped: true, contrast: 'red' }).neckline, undefined);
  // the schemas the vision model answers in are the ones the flats clean
  assert.ok(BUILD_SCHEMA.properties.pockets.items.enum.includes('chest-flap') && LOOK_SCHEMA.properties.neckline.enum.includes('turtle'));
  assert.deepEqual(cleanConstruction({ pockets: ['chest', 'zip-chest'], opening: 'buttons', sleeve: 'raglan' }), { sleeve: 'raglan', opening: 'buttons', pockets: ['chest'] });
});

test('a picture read wrongly is caught: what it lost and what it added are listed apart from what no picture can give back', () => {
  const p = recipe('shirt', ['flap-pocket', 'neck-buttondown']), wrong = readBack(p, cleanConstruction({ ...constructionOf(p), pockets: [], collar: 'stand' }));
  const t = tripLoss(p, wrong);
  assert.ok(t.lost.some(x => /Flap chest pocket|Pocket flap|Flap pocket/i.test(x)) && t.lost.includes('Shirt collar'), JSON.stringify(t.lost));
  assert.ok(t.added.includes('Stand collar')); assert.ok(t.notCarried.length === 2 && t.notCarried.every(x => /^Button/.test(x)), 'the collar buttons are drawn and listed, not read back');
  assert.ok(t.score < 1);
  // the same piece read right loses nothing
  assert.deepEqual(tripLoss(p, readBack(p)).lost, []);
  // a stitch line or a coloured panel is never read back, and says so
  assert.ok(notReadBack({ key: 'edit:s1', group: 'stitch', label: 'A line of topstitching on the front' }) && notReadBack({ key: 'edit:b1', group: 'colour', label: 'Yoke in #141416 (front)' }) && !notReadBack({ key: 'hood', group: 'build', label: 'Hood' }));
  const c = compareDetails([{ key: 'hood', group: 'build', view: 'both', label: 'Hood' }], [{ key: 'hood', group: 'build', view: 'both', label: 'Hood' }, { key: 'hem', group: 'build', view: 'both', label: 'Curved hem' }]);
  assert.equal(c.score, 1); assert.deepEqual(c.added.map(d => d.label), ['Curved hem']);
});

test('the flats a picture is drawn from show the details: the front and the back views draw every detail added', () => {
  const p = recipe('shorts', ['cargo', 'back-welts']);
  for (const v of ['front', 'back']) assert.ok(renderSvg(p, v, { plain: true, scale: 0 }).length > 1000, `${v} renders`);
  assert.ok(viewsOf(p.style).includes('back'));
});
