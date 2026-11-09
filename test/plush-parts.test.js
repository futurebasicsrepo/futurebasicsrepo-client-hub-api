// The plush parts library (src/lab-plush-parts.js): plush bolted together from parts sew together. Every join between parts is walked by the
// construction check (src/lab-pattern-check.js), at any size, for every part on every body it goes on, and the toy comes out the size asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLUSH_LIBRARY, PLUSH_PRESETS, PLUSH_SLOTS, cleanBuild, partsFor, partThumb, buildPlush } from '../src/lab-plush-parts.js';
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
