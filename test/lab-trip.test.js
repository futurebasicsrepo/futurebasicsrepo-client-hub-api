// The flats and the picture, both ways (src/lab-trip.js): every detail of the flats is told to the image model and checked for in the
// picture; what a picture says of how a piece is built and finished comes back into the flats; and a detail added on the flats is drafted.
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { RECIPE_BASES, addonsFor, cookRecipe } from '../src/lab-recipe.js';
import { STYLES, SIZES, defaultParams, fitToTemplate, viewsOf, measurementsFor, renderSvg } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { constructionOf, constructionWords, fromEdits, cleanConstruction } from '../src/lab-construction.js';
import { flatDetails, pictureBrief, pictureFromFlatsPrompt, auditOf, auditResult, buildEdits, lookOf, applyLook, compareDetails, readBack, tripLoss, notReadBack, BUILD_SCHEMA, LOOK_SCHEMA,
  familyOf, readContribution, readRemoved, tripStats, gapCounts, ratchetGaps, ratchetLive } from '../src/lab-trip.js';
import { checkCase } from '../scripts/trip-case.mjs';
import { garmentPattern } from '../src/lab-pattern.js';
import { constructionCheck } from '../src/lab-pattern-check.js';

const recipe = (base, addons = [], extra = {}) => cookRecipe({ base, addons, system: 'earth', ...extra }).params;
const said = d => d.words ? d.words.replace(/^(Front|Back): /, '') : d.label;

const BASELINE = JSON.parse(readFileSync(new URL('../src/lab-trip-baseline.json', import.meta.url), 'utf8'));

test('every recipe piece and every library sketch: the picture is told every detail, and a picture read back loses none the code can carry; the known gaps only shrink', () => {
  let pieces = 0; const gaps = [];
  const check = (id, p) => { pieces++;
    const det = flatDetails(p), prompt = pictureFromFlatsPrompt({ details: det, back: viewsOf(p.style).includes('back') });
    for (const d of det) if (!d.layer && d.group !== 'kind' && d.view !== 'inside') assert.ok(prompt.includes(said(d)), `${id}: the prompt names ${d.label}`);
    const t = tripLoss(p, readBack(p)); gaps.push(...t.notCarried);
    assert.deepEqual(t.lost, [], `${id}: lost reading its picture back`); assert.deepEqual(t.added, [], `${id}: added reading its picture back`); };
  for (const b of RECIPE_BASES) { if (!['top', 'bottom'].includes(STYLES[b.style].kind)) continue;
    for (const a of [null, ...addonsFor(b)]) { const r = cookRecipe({ base: b.id, addons: a ? [a.id] : [], system: 'earth' }); if (!r.error) check(`${b.id}+${a?.id || '-'}`, r.params); } }
  for (const t of FLAT_TEMPLATES) if (['top', 'bottom'].includes(STYLES[t.style]?.kind)) check(t.id, fitToTemplate({ ...defaultParams(t.style, 'regular'), template: t.id }));
  assert.ok(pieces > 600, `${pieces} pieces`);
  // the ratchet (src/lab-trip-baseline.json): a detail the flats draw that a picture cannot carry back is a known gap, counted by what it is.
  // A new or larger gap fails; a smaller one fails too, until the baseline is lowered, so a fix stays fixed
  const r = ratchetGaps(BASELINE.gaps, gapCounts(gaps));
  assert.deepEqual(r.worse, [], `a detail no longer carries both ways (fix it; never raise the baseline): ${r.worse.join('; ')}`);
  assert.deepEqual(r.better, [], `fewer known gaps now: lower them in src/lab-trip-baseline.json so they stay fixed: ${r.better.join('; ')}`);
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
  // a zip pocket on the chest, a dress's slant side pockets (a pair: one pocket each side) and a button-down collar's buttons are drafted too
  assert.deepEqual(fromEdits(recipe('hoodie', ['zip-pocket'])), { pockets: ['zip-chest'] });
  assert.deepEqual(fromEdits(recipe('dress', ['slant-side'])), { pockets: ['slash'] });
  assert.deepEqual(fromEdits(recipe('shirt', ['neck-buttondown'])), { buttondown: true });
  assert.equal(constructionOf(recipe('shirt', ['neck-buttondown'])).buttondown, true);
  assert.equal(constructionOf({ ...recipe('tee'), edits: recipe('shirt', ['neck-buttondown']).edits }).buttondown, undefined, 'only under a shirt collar');
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
  assert.deepEqual(cleanConstruction({ pockets: ['chest', 'zip-chest', 'secret'], opening: 'buttons', sleeve: 'raglan', buttondown: true }), { sleeve: 'raglan', opening: 'buttons', pockets: ['chest', 'zip-chest'], buttondown: true });
  assert.ok(BUILD_SCHEMA.properties.pockets.items.enum.includes('zip-chest') && BUILD_SCHEMA.properties.buttondown.type === 'boolean');
  // read back, the zip pocket, the dress's side pockets and the collar buttons are drawn on the stock sketch where they go
  assert.deepEqual(buildEdits({ pockets: ['zip-chest'] }, recipe('hoodie')).map(e => e.kind), ['pocket-zip']);
  assert.deepEqual(buildEdits({ pockets: ['slash'] }, recipe('dress')).map(e => [e.kind, Math.sign(e.x)]), [['pocket-slant', 1], ['pocket-slant', -1]]);
  assert.deepEqual(buildEdits({ collar: 'shirt', buttondown: true }, recipe('shirt')).map(e => [e.kind, e.x, e.y]), [['button', 2.2, 5.45], ['button', -2.2, 5.45]]);
});

test('a picture read wrongly is caught: what it lost and what it added are listed apart from what no picture can give back', () => {
  const p = recipe('shirt', ['flap-pocket', 'neck-buttondown']), wrong = readBack(p, cleanConstruction({ ...constructionOf(p), pockets: [], collar: 'stand' }));
  const t = tripLoss(p, wrong);
  assert.ok(t.lost.some(x => /Flap chest pocket|Pocket flap|Flap pocket/i.test(x)) && t.lost.includes('Shirt collar'), JSON.stringify(t.lost));
  assert.ok(t.added.includes('Stand collar')); assert.deepEqual(t.notCarried, [], 'the collar buttons are drafted, so they are read back');
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

test('real use, counted: one name per detail across pieces, what a read put on the flats and what was taken off by hand, and the totals', () => {
  assert.equal(familyOf('edit:r-chest-pocket', 'Patch pocket on the front, 4½ in × 5 in, 7 in below the HPS'), 'Patch pocket');
  assert.equal(familyOf('wash', 'Heavy stone wash'), 'Wash'); assert.equal(familyOf('pocket:kangaroo', 'Kangaroo pocket'), 'Kangaroo pocket');
  assert.equal(familyOf('place:logo', 'Logo on the front, 3 in wide'), 'Logo'); assert.equal(familyOf('edit:b1', 'Yoke in #141416 (front)'), 'Yoke');
  // a plain tee read as a quarter zip with a chest pocket and a mock neck: the read put those on the flats, not its colour
  const tee = recipe('tee'), before = flatDetails(tee), q = applyLook({ ...tee, options: { ...tee.options, construction: { opening: 'quarter-zip', pockets: ['chest'] } }, edits: buildEdits({ opening: 'quarter-zip', pockets: ['chest'] }, tee) }, { neckline: 'mock', wash: 'none', distress: 'none', cropped: false, contrast: '' });
  const read = readContribution(before, flatDetails(q)), keys = read.map(d => d.key);
  assert.ok(keys.includes('neckline') && keys.filter(k => k.startsWith('edit:pic-')).length === 2 && !keys.includes('colour'), JSON.stringify(keys));
  // nothing changed: nothing taken off; the stand-in pocket deleted, the neckline changed back, the garment changed: each counts
  assert.deepEqual(readRemoved(read, flatDetails(q)), []);
  const pocket = keys.find(k => k.startsWith('edit:pic-pocket')), q2 = { ...q, neckline: 'crew', edits: q.edits.filter(e => `edit:${e.id}` !== pocket) };
  assert.deepEqual(readRemoved(read, flatDetails(q2)).sort(), [pocket, 'neckline'].sort());
  assert.deepEqual(readRemoved(read, flatDetails(q), { readStyle: 'tee', savedStyle: 'polo' }), ['kind']);
  // moved or resized, a stand-in is kept
  assert.deepEqual(readRemoved(read, flatDetails({ ...q, edits: q.edits.map(e => ({ ...e, x: e.x + 1, w: e.w + 1 })) })), []);
  const L = { wash: 'Medium stone wash', hood: 'Hood', 'edit:p': 'Patch pocket on the front, 4 in' };
  const s = tripStats([
    { kind: 'check', style: 'hoodie', kept: ['hood', 'edit:p'], missing: ['wash'], unsure: [], insist: [], labels: L },
    { kind: 'check', style: 'hoodie', kept: ['hood', 'wash'], missing: ['edit:p'], unsure: [], insist: ['wash'], labels: L },
    { kind: 'read', style: 'tee', details: [{ key: 'neckline', label: 'Mock neck' }, { key: 'edit:pic-pocket-patch-0', label: 'Patch pocket on the front, 4 in' }] },
    { kind: 'correction', style: 'tee', missing: ['edit:pic-pocket-patch-0'], labels: { 'edit:pic-pocket-patch-0': 'Patch pocket on the front, 4 in' } }]);
  assert.deepEqual([s.totals.checks, s.totals.clean, s.totals.kept, s.totals.missing, s.totals.redos, s.totals.fixed, s.totals.reads, s.totals.corrected], [2, 0, 4, 2, 1, 1, 1, 1]);
  assert.equal(s.totals.keptRate, .667); assert.equal(s.totals.fixedRate, 1);
  const pp = s.details.find(d => d.family === 'Patch pocket'); assert.deepEqual([pp.checked, pp.missing, pp.read, pp.removed, pp.removedRate], [2, 1, 1, 1, 1]);
  assert.equal(s.details[0].family, 'Patch pocket', 'the detail lost most often comes first');
  assert.deepEqual(s.styles.map(x => [x.style, x.checks, x.missRate]), [['hoodie', 2, .333]]);
});

test('the ratchet: a gap may only shrink, the live score may only rise (by more than one detail\'s noise)', () => {
  assert.deepEqual(gapCounts(['Zip pocket on the front, 5 in', 'Zip pocket on the front, 6 in', 'Button on the front, ½ in']), { Button: 1, 'Zip pocket': 2 });
  assert.deepEqual(ratchetGaps({ 'Zip pocket': 2 }, { 'Zip pocket': 2 }), { worse: [], better: [] });
  assert.deepEqual(ratchetGaps({ 'Zip pocket': 2 }, { 'Zip pocket': 3, Button: 1 }).worse, ['Zip pocket: 2 → 3', 'Button: 0 → 1']);
  assert.deepEqual(ratchetGaps({ 'Zip pocket': 2 }, {}).better, ['Zip pocket: 2 → 0']);
  assert.deepEqual(ratchetLive(null, { kept: 10, checked: 20 }), { ok: true, first: true, better: true });
  assert.equal(ratchetLive({ kept: 90, checked: 100 }, { kept: 89, checked: 100 }).ok, true, 'one detail is noise');
  assert.equal(ratchetLive({ kept: 90, checked: 100 }, { kept: 88, checked: 100 }).ok, false);
  assert.equal(ratchetLive({ kept: 90, checked: 100 }, { kept: 46, checked: 50 }).better, true);
  // the baseline file says what it is and holds counts only
  assert.ok(BASELINE.about && Object.values(BASELINE.gaps).every(n => Number.isInteger(n) && n > 0));
});

test('every real miss kept as a case (test/fixtures/trip-cases) stays asked for in the picture\'s prompt, stays checked, and reads back whole', () => {
  const dir = new URL('./fixtures/trip-cases/', import.meta.url), files = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 1, 'at least the example case');
  for (const f of files) {
    const k = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.equal(checkCase(k), null, `${f} is a case`); assert.equal(`${k.id}.json`, f, `${f} is named by its id`);
    const p = k.flat, det = flatDetails(p, { placements: k.placements || [] }), prompt = pictureFromFlatsPrompt({ details: det, back: viewsOf(p.style).includes('back'), insist: k.missed?.keys || [] }), a = auditOf(det);
    for (const key of k.missed?.keys || []) {
      const d = det.find(x => x.key === key); assert.ok(d, `${f}: ${key} is a detail of its flats`);
      if (d.layer) continue;
      assert.ok(prompt.includes(said(d)), `${f}: the prompt asks for ${d.label}`); assert.match(prompt, /left out/, `${f}: drawn again, the prompt says what was left out`);
      if (d.view !== 'back' && d.view !== 'inside') assert.ok(a.checked.some(x => x.key === key), `${f}: the check asks about ${d.label}`);
    }
    const t = tripLoss(p, readBack(p)); assert.deepEqual(t.lost, [], `${f}: read back whole`);
  }
});

test('the zip chest pocket, a dress\'s slant side pockets and a button-down collar are drafted, walked by the check, and asked for in full', () => {
  for (const [base, addon, ids, trim] of [['hoodie', 'zip-pocket', ['zip-pocket', 'zip-pocket-fuse', 'zip-pocket-bag'], 'Pocket zip'], ['coat', 'zip-pocket', ['zip-pocket', 'zip-pocket-bag'], 'Pocket zip'],
    ['dress', 'slant-side', ['side-pocket', 'side-pocket-bag'], null], ['shirt', 'neck-buttondown', ['collar'], 'Collar buttons']]) {
    const p = recipe(base, [addon]);
    for (const z of SIZES) {
      const pat = garmentPattern(p, z), k = constructionCheck(pat, { m: measurementsFor(p, z), style: p.style }), cut = new Set(pat.pieces.filter(q => q.cut).map(q => q.id));
      assert.ok(k.ok, `${base}+${addon} at ${z}: ${JSON.stringify([k.missing, k.seams.filter(s => s.ok === false)])}`);
      for (const id of ids) assert.ok(cut.has(id), `${base}+${addon} at ${z}: ${id} is cut`);
      if (trim) assert.ok(pat.trims.some(t => t.item === trim), `${base}+${addon}: ${trim}`);
      const mouth = k.seams.filter(s => /mouth/.test(s.name)); if (addon !== 'neck-buttondown') assert.ok(mouth.length >= 1 && mouth.every(s => s.ok), `${base}+${addon} at ${z}: the mouth is walked`);
    }
  }
  // the check asks for each part: a zip pocket without its zip or its bag, a slant pocket without its bag, collar buttons, all fail
  const pat = garmentPattern(recipe('hoodie', ['zip-pocket']), 'M'), strip = (q, f) => constructionCheck({ ...pat, ...f(pat) }).missing.map(x => x.need);
  assert.ok(strip(pat, x => ({ trims: x.trims.filter(t => t.item !== 'Pocket zip') })).includes('A pocket zip'));
  assert.ok(strip(pat, x => ({ pieces: x.pieces.filter(q => q.id !== 'zip-pocket-bag') })).includes('Zip pocket bag'));
  const dress = garmentPattern(recipe('dress', ['slant-side']), 'M'); assert.ok(constructionCheck({ ...dress, pieces: dress.pieces.filter(q => q.id !== 'side-pocket-bag') }).missing.some(x => x.need === 'Slant pocket bag'));
  const shirt = garmentPattern(recipe('shirt', ['neck-buttondown']), 'M'); assert.ok(constructionCheck({ ...shirt, trims: shirt.trims.filter(t => t.item !== 'Collar buttons') }).missing.some(x => x.need === 'Collar buttons'));
  // a zip longer than its window fails the walk
  const long = constructionCheck({ ...pat, trims: pat.trims.map(t => t.item === 'Pocket zip' ? { ...t, spec: '#3 coil, closed-end, 6 in' } : t) });
  assert.equal(long.seams.find(s => /the zip in its mouth/.test(s.name)).ok, false);
});
