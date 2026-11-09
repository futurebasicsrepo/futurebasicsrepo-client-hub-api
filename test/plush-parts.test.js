// The plush parts library (src/lab-plush-parts.js): plush bolted together from parts sew together. Every join between parts is walked by the
// construction check (src/lab-pattern-check.js), at any size, for every part on every body it goes on, and the toy comes out the size asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLUSH_LIBRARY, PLUSH_PRESETS, PLUSH_SLOTS, cleanBuild, partsFor, partThumb, buildPlush, partsMenu, buildWords, buildFromKit, PLUSH_BUILD_SCHEMA } from '../src/lab-plush-parts.js';
import { plushProposal, PLUSH_READ_SCHEMA } from '../src/lab-plush-read.js';
import { applyFix, mergeFixes } from '../src/lab-plush-review.js';
import { plushPattern, cleanPlush, layoutOf } from '../src/lab-pattern.js';
import { plushViews } from '../src/lab-plush-views.js';
import { constructionCheck } from '../src/lab-pattern-check.js';

const failsOf = c => [...c.seams, ...c.meas].filter(x => x.ok === false).map(x => `${x.name} ${x.got ?? x.b}/${x.want ?? x.a}`).concat(c.cuts.map(x => `${x.piece}: ${x.why}`), c.missing.map(x => `missing ${x.need}`));

test('every plush to start from sews together at every size, and comes out the size asked', () => {
  for (const [id, pr] of Object.entries(PLUSH_PRESETS)) for (const height of [6, 12, 24, 36]) {
    const pat = plushPattern({ shape: 'build', height, build: pr.build }), c = constructionCheck(pat);
    assert.ok(c.ok, `${id} at ${height} in: ${failsOf(c).join('; ')}`);
    assert.ok(pat.build.joints.length >= 1 && c.meas.some(m => /Height|Length/.test(m.name) && m.ok), `${id}: its joins walked and its size measured`);
  }
});

test('every part goes on every body that takes it, and every join walks', () => {
  let n = 0;
  for (const body of Object.keys(PLUSH_LIBRARY.body)) for (const [slot, ids] of Object.entries(partsFor(body))) for (const id of ids) {
    if (slot === 'body') continue; n++;
    const c = constructionCheck(plushPattern({ shape: 'build', height: 12, build: { body, ...(slot === 'extras' ? { extras: [id] } : { [slot]: id }) } }));
    assert.ok(c.ok, `${body} + ${slot} ${id}: ${failsOf(c).join('; ')}`);
  }
  assert.ok(n > 300, `${n} combinations`);
});

test('a head is drafted to its body\'s neck, a pad to its leg, a base to its gores', () => {
  const bear = buildPlush({ height: 12, build: PLUSH_PRESETS.bear.build }), j = n => bear.joints.find(x => x.name === n);
  for (const n of ['Head onto the neck', 'Head gusset into the sides', 'Foot pads into the legs', 'Side seams: front to back']) assert.ok(j(n) && Math.abs(j(n).b - j(n).a) <= .125, n);
  const owl = buildPlush({ height: 10, build: PLUSH_PRESETS.owl.build }); assert.ok(owl.joints.some(x => x.name === 'Base into the gores'));
  // the same head on a bigger body is drafted again to the bigger neck
  const small = buildPlush({ height: 8, build: { body: 'torso', head: 'ball' } }), big = buildPlush({ height: 20, build: { body: 'torso', head: 'ball' } }), neck = r => r.joints.find(x => x.name === 'Head onto the neck');
  assert.ok(neck(big).a > neck(small).a * 2 && Math.abs(neck(big).b - neck(big).a) <= .125);
});

test('a build keeps only parts that go on its body', () => {
  const b = cleanBuild({ body: 'bean', head: 'gusset', legs: 'four', ears: 'nonsense', extras: ['belly', 'nope'], size: { ears: 9 } });
  assert.equal(b.head, 'none', 'a bean is its own head'); assert.equal(b.legs, 'none', 'four legs go on a four-legged body'); assert.equal(b.ears, 'none'); assert.deepEqual(b.extras, ['belly']); assert.equal(b.size.ears, 1.5);
  assert.equal(cleanBuild({ body: 'seated' }).head, 'ball', 'a body that takes a head gets one');
  assert.equal(cleanPlush({ shape: 'build' }).build.body, 'torso', 'a plush built from parts starts as the teddy bear');
});

test('it is drawn from its parts, cut on the table, and every part has a picture for the picker', () => {
  for (const [id, pr] of Object.entries(PLUSH_PRESETS)) {
    const pat = plushPattern({ shape: 'build', height: 12, build: pr.build }), v = plushViews(pat);
    for (const k of ['front', 'back', 'side']) assert.ok(v[k].svg.length > 500 && Number.isFinite(v[k].box.x0), `${id} ${k}`);
    assert.ok(layoutOf(pat).length >= 1);
    assert.ok(pat.trims.some(t => t.item === 'Law label') && pat.trims.some(t => /fill/i.test(t.item)));
  }
  for (const [slot] of PLUSH_SLOTS) for (const id of Object.keys(PLUSH_LIBRARY[slot])) assert.match(partThumb(slot, id), /^<svg[^>]*viewBox="[-\d. ]+"/, `${slot} ${id}`);
});

// the AI concepts, the picture reader and the reviewer build plush from parts too (src/lab-concepts.js, src/lab-plush-read.js, src/lab-plush-review.js)
test('the AI is told the parts and where they go, and every part has words for the picture', () => {
  const menu = partsMenu();
  for (const [slot] of PLUSH_SLOTS) for (const id of Object.keys(PLUSH_LIBRARY[slot])) if (id !== 'none') assert.ok(menu.includes(id), `${slot} ${id} in the menu`);
  assert.match(menu, /what goes where/); assert.deepEqual(PLUSH_BUILD_SCHEMA.required, PLUSH_SLOTS.map(([k]) => k)); assert.equal(PLUSH_READ_SCHEMA.properties.build.properties.wings.enum.join(), Object.keys(PLUSH_LIBRARY.wings).join());
  for (const pr of Object.values(PLUSH_PRESETS)) { const w = buildWords(pr.build); assert.ok(w.length > 10 && !/undefined|null/.test(w), `${pr.name}: ${w}`); }
  assert.equal(buildWords({ body: 'seated', head: 'snout', legs: 'four', wings: 'bat', back: 'spikes' }), 'a sitting four-legged body with a long snout, four legs, bat wings and spikes down its back');
});
test('every fixed body type becomes the same toy made from parts, and sews together', () => {
  for (const shape of ['bear', 'quad', 'elephant', 'sea', 'bean', 'bunny', 'pillow']) for (const extra of [{}, { horn: 'two', wings: true, spikes: true, tailType: 'bushy', snout: 'long' }]) {
    const k = cleanPlush({ shape, ...extra }), b = buildFromKit(k), c = constructionCheck(plushPattern({ shape: 'build', height: k.height, build: b }));
    assert.ok(c.ok, `${shape} ${JSON.stringify(extra)}: ${failsOf(c).join('; ')}`);
  }
  assert.equal(buildFromKit(cleanPlush({ shape: 'elephant' })).face, 'trunk'); assert.equal(buildFromKit(cleanPlush({ shape: 'bunny' })).ears, 'long'); assert.equal(buildFromKit(cleanPlush({ shape: 'sea', dorsal: true })).back, 'dorsal');
});
test('a picture read as parts gives a build; a build stays a build; the fixed type\'s choices are not offered on one', () => {
  const owl = { plush: true, animal: 'Owl', shape: 'build', build: { ...PLUSH_PRESETS.owl.build, head: 'none', arms: 'none', legs: 'none', tail: 'none', horns: 'none', back: 'none', extras: [] }, heightIn: 10, head: 1.2, ears: 'pointed', fabric: 'minky', eyes: 'embroidered', colours: { body: '#8a6a4a' }, why: 'an owl' };
  const p = plushProposal({ shape: 'bear' }, owl);
  assert.equal(p.spec.shape, 'build'); assert.equal(p.spec.build.body, PLUSH_PRESETS.owl.build.body); assert.equal(p.spec.build.size.head, 1.2); assert.equal(p.spec.height, 10);
  assert.ok(p.changes.some(c => c.key === 'build') && !p.changes.some(c => c.key === 'ears'), 'the parts change, not the kit\'s ears');
  // a concept written as a build keeps its build when the picture reads a fixed type with parts: its parts are read
  const q = plushProposal({}, { ...owl, shape: 'quad', build: PLUSH_PRESETS.fox.build }, { shape: 'build', build: PLUSH_PRESETS.dragon.build });
  assert.equal(q.spec.shape, 'build'); assert.equal(q.spec.build.tail, PLUSH_PRESETS.fox.build.tail); assert.equal(q.from.build, 'picture (AI)');
  // without parts named, a picture's fixed type still stands (as before)
  assert.equal(plushProposal({}, { ...owl, shape: 'quad', build: undefined }).spec.shape, 'quad');
  assert.ok(constructionCheck(plushPattern(p.spec)).ok);
});
test('the reviewer changes a build part by part, never drops a part that is there, and makes a fixed type into parts', () => {
  const quad = cleanPlush({ shape: 'quad', horn: 'one', wings: true, spikes: true, tailType: 'long', height: 13 });
  const a = applyFix(quad, { field: 'shape', value: 'build', why: 'a dragon' });
  assert.equal(a.spec.shape, 'build'); assert.equal(a.spec.height, 13); assert.equal(a.spec.build.wings, 'bat'); assert.equal(a.spec.build.horns, 'one');
  assert.equal(applyFix(a.spec, { field: 'part.wings', value: 'butterfly' }).spec.build.wings, 'butterfly');
  assert.equal(applyFix(a.spec, { field: 'part.legs', value: 'feet' }), null, 'feet do not go on a sitting four-legged body: its legs stay');
  assert.equal(applyFix(a.spec, { field: 'ears', value: 'big' }), null, 'the kit\'s ears do not draw a build');
  assert.equal(applyFix(quad, { field: 'part.wings', value: 'bat' }), null, 'a part does not go on a fixed type');
  assert.deepEqual(applyFix(a.spec, { field: 'part.extras', value: 'belly, cheeks' }).spec.build.extras, ['belly', 'cheeks']);
  assert.equal(applyFix(a.spec, { field: 'part.extras', value: 'belly, nope' }), null);
  assert.equal(applyFix(a.spec, { field: 'size.wings', value: '1.3' }).spec.build.size.wings, 1.3);
  assert.equal(applyFix(a.spec, { field: 'part.body', value: 'torso' }).spec.build.body, 'torso');
  const { fixes } = mergeFixes([{ name: 'Claude', fixes: [{ field: 'part.tail', value: 'spiked', why: '' }, { field: 'shape', value: 'build', why: '' }] }]);
  assert.equal(fixes[0].field, 'shape', 'the body type first, then its parts');
  let s = quad; for (const f of fixes) s = applyFix(s, f)?.spec || s; assert.equal(s.build.tail, 'spiked');
  assert.ok(constructionCheck(plushPattern(s)).ok);
});
