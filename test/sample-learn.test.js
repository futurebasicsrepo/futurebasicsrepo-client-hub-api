// What the samples teach the pattern (src/lab-sample-learn.js): a fabric that keeps coming back short or wide is cut to allow for it, and
// the construction check still measures the pattern as drafted against its spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pomAxis, sampleError, learnAxis, allowanceFor, allowPattern, allowanceWords, allowanceOfPack, packFabric, conceptFabric, learnedGroups, forgetLearned, LEARN } from '../src/lab-sample-learn.js';
import { defaultParams, measurementsFor } from '../src/lab-flats.js';
import { garmentPattern } from '../src/lab-pattern.js';
import { constructionCheck } from '../src/lab-pattern-check.js';

const pack = (extra = {}) => ({ sizes: ['S', 'M', 'L'], style: { sampleSize: 'M' }, bom: [{ component: 'Main fabric', material: 'Heavy fleece', ref: 'FL-400' }],
  pom: [{ code: 'A', name: 'Body length (HPS)', values: { M: '28' } }, { code: 'B', name: 'Chest width (1/2)', values: { M: '22' } }, { code: 'C', name: 'Sleeve length', values: { M: '25' } },
    { code: 'D', name: 'Cuff rib height', values: { M: '3' } }, { code: 'E', name: 'Hem band height', values: { M: '2.5' } }], ...extra });

test('points of measure are read by the way they run on the cloth; trims and ribs say nothing about the main fabric', () => {
  assert.equal(pomAxis('Body length (HPS)'), 'length');
  assert.equal(pomAxis('Inseam'), 'length');
  assert.equal(pomAxis('Front rise'), 'length');
  assert.equal(pomAxis('Chest width (1/2)'), 'width');
  assert.equal(pomAxis('Sweep'), 'width');
  assert.equal(pomAxis('Thigh'), 'width');
  assert.equal(pomAxis('Cuff rib height'), null);
  assert.equal(pomAxis('Hem band height'), null);
  assert.equal(pomAxis('Kangaroo pocket width'), null);
  assert.equal(pomAxis('Zip length'), null);
  assert.equal(pomAxis('Front neck drop'), null);
  assert.equal(pomAxis('Neck width, seam to seam'), null);
  assert.equal(pomAxis('Body length from the high point of the shoulder'), 'length');
  assert.equal(pomAxis('Sleeve opening, flat'), 'width');
});

test('one sample: its error each way, as a fraction of spec, with short points and mis-typed numbers left out', () => {
  const e = sampleError(pack(), { A: '27.16', B: '22.22', C: '24.25', D: '2' }, 'M'); // 3% short, 1% wide, 3% short; the rib is skipped
  assert.ok(Math.abs(e.length - (-0.03)) < 1e-3, `length ${e.length}`);
  assert.ok(Math.abs(e.width - 0.01) < 1e-3, `width ${e.width}`);
  const typo = sampleError(pack(), { A: '18', B: '22' }, 'M'); // 18 for 28 is a typing slip, not shrinkage
  assert.equal(typo.length, null);
  assert.equal(typo.width, 0);
});

test('a sample cut with an allowance already in it is read back to what the fabric did', () => {
  const a = { length: 0.0309, width: 0, measured: { length: -0.03, width: 0 }, n: 3, fabric: 'Heavy fleece', scope: 'fabric' };
  const p = pack({ construction: [{ area: 'Flats · Pattern allowance', detail: allowanceWords(a) }] });
  assert.deepEqual(allowanceOfPack(p), { length: 0.031, width: 0 });
  // cut 3.1% long and came back on spec: the fabric still ran about 3% short
  const e = sampleError(p, { A: '28', C: '25' }, 'M');
  assert.ok(Math.abs(e.length - (-0.0301)) < 1e-3, `length ${e.length}`);
});

test('a direction is learned only when enough samples agree, by more than the noise, and never past the cap', () => {
  assert.equal(learnAxis([-0.03]).ok, false, 'one sample is not enough');
  assert.equal(learnAxis([-0.004, -0.006]).ok, false, 'under 1% is the tape measure');
  assert.equal(learnAxis([-0.03, 0.03]).ok, false, 'they disagree');
  const L = learnAxis([-0.03, -0.028, -0.032]);
  assert.equal(L.ok, true);
  assert.ok(Math.abs(L.cut - (1 / 0.97 - 1)) < 1e-3, `cut ${L.cut}`); // cut 3.09% long to land on spec after a 3% shrink
  assert.equal(learnAxis([-0.14, -0.13]).cut, LEARN.capPct);
  assert.equal(learnAxis([0.02, 0.025, -0.001, 0.02]).ok, true, 'three in four running the same way is agreement');
});

test('the fabric of a concept and of its pack share a key, so samples in one teach patterns in the other', () => {
  assert.deepEqual(packFabric(pack()), { key: 'fl-400', name: 'Heavy fleece' });
  assert.deepEqual(conceptFabric({ spec: { materials: [{ kind: 'fabric', role: 'main', code: 'FL-400', name: 'Heavy fleece' }] } }), { key: 'fl-400', name: 'Heavy fleece' });
  assert.equal(packFabric({ style: { fabricSummary: '' } }), null);
});

test('the style and fabric samples come first, else the fabric; one sample is waiting', () => {
  const groups = new Map([['fl-400|hoodie', { name: 'Heavy fleece', samples: [{ length: -0.03, width: 0.001 }, { length: -0.031, width: -0.002 }] }],
    ['fl-400|', { name: 'Heavy fleece', samples: [{ length: -0.03, width: 0.001 }, { length: -0.031, width: -0.002 }, { length: -0.01, width: 0 }] }],
    ['rib-1|', { name: 'Rib', samples: [{ length: 0.02, width: 0.03 }] }]]);
  const a = allowanceFor(groups, { key: 'fl-400' }, 'hoodie');
  assert.equal(a.scope, 'style'); assert.equal(a.n, 2); assert.ok(a.length > 0.03); assert.equal(a.width, 0);
  const b = allowanceFor(groups, { key: 'fl-400' }, 'jogger');
  assert.equal(b.scope, 'fabric'); assert.equal(b.n, 3);
  assert.equal(allowanceFor(groups, { key: 'rib-1' }, 'tee').scope, 'waiting');
  assert.equal(allowanceFor(groups, { key: 'nothing' }, 'tee'), null);
});

test('the cut pattern grows along and across the grain of its main-fabric pieces; ribs and the check stay as drafted', () => {
  const p = defaultParams('hoodie'), pat = garmentPattern(p, 'M'), a = { length: 0.04, width: 0.02, n: 2, fabric: 'Heavy fleece', scope: 'fabric' };
  const cut = allowPattern(pat, a), h = s => Math.max(...s.map(q => q[1])) - Math.min(...s.map(q => q[1])), w = s => Math.max(...s.map(q => q[0])) - Math.min(...s.map(q => q[0]));
  const f0 = pat.pieces.find(q => q.id === 'front'), f1 = cut.pieces.find(q => q.id === 'front');
  assert.ok(Math.abs(h(f1.sew) / h(f0.sew) - 1.04) < 1e-3, 'the front is 4% longer');
  assert.ok(Math.abs(w(f1.sew) / w(f0.sew) - 1.02) < 1e-3, 'and 2% wider');
  for (const q of cut.pieces.filter(x => x.fabric !== 'self')) assert.deepEqual(q.sew, pat.pieces.find(x => x.id === q.id).sew, `${q.id} is not the main fabric`);
  assert.deepEqual(cut.allowance, { length: 0.04, width: 0.02, n: 2, fabric: 'Heavy fleece', scope: 'fabric' });
  assert.equal(allowPattern(pat, null), pat);
  // the check reads the pattern as drafted, and it still passes against the spec
  assert.equal(constructionCheck(pat, { m: measurementsFor(p, 'M'), style: 'hoodie' }).ok, true);
  // a piece edited by hand was drawn on the cut pattern: it is cut as drawn
  const ed = allowPattern({ ...pat, pieces: pat.pieces.map(q => (q.id === 'front' ? { ...q, edited: true } : q)) }, a);
  assert.deepEqual(ed.pieces.find(q => q.id === 'front').sew, f0.sew);
});

test('the tech pack line says what was cut and why, and reads back', () => {
  const a = { length: 0.031, width: -0.012, measured: { length: -0.03, width: 0.012 }, n: 4, fabric: 'Heavy fleece', scope: 'style' };
  const t = allowanceWords(a);
  assert.match(t, /^Cut 3\.1% longer along the grain and 1\.2% narrower across it, in the main fabric only\./);
  assert.match(t, /4 samples in Heavy fleece in this style, which came back 3\.0% short and 1\.2% wide of spec/);
  assert.deepEqual(allowanceOfPack({ construction: [{ area: 'Flats · Pattern allowance', detail: t }] }), { length: 0.031, width: -0.012 });
  assert.equal(allowanceWords({ length: 0, width: 0 }), '');
});

test('the samples are gathered from finished reviews and from reviews typed into a pack, once each', async () => {
  forgetLearned();
  const p1 = pack(), p2 = pack({ sampling: [{ stage: 'Proto', review: { measured: { A: '27.1', B: '22' }, verdict: 'revise' } }, { stage: 'Fit', review: { measured: { A: '27.2', C: '24.2' }, verdict: 'approved' } }] });
  const rows = {
    concepts: [{ product_id: 'p2', style: 'hoodie', spec: {} }],
    reviews: [{ tech_pack_id: 't2', product_id: 'p2', stage: 'Proto', pack_version: 1, form: { measured: { A: '27.2', B: '22.1' }, sampleSize: 'M' }, data: p2, published_data: p2, version: 1, vdata: p2 },
      { tech_pack_id: 't1', product_id: 'p1', stage: 'Proto', pack_version: 0, form: { measured: { A: '27.3' } }, data: p1, published_data: null, version: 0, vdata: null }],
    packs: [{ id: 't2', product_id: 'p2', data: p2 }]
  };
  const pool = { query: async sql => ({ rows: /from lab_concepts/.test(sql) ? rows.concepts : /from sample_reviews/.test(sql) ? rows.reviews : /from tech_packs/.test(sql) ? rows.packs : [] }) };
  const g = await learnedGroups(pool, { now: 1 });
  // three samples: the two finished reviews, and the Fit row typed into the pack (its Proto row is the same sample as the review)
  assert.equal(g.get('fl-400|').samples.length, 3);
  assert.equal(g.get('fl-400|hoodie').samples.length, 2);
  const a = allowanceFor(g, { key: 'fl-400' }, 'hoodie');
  assert.equal(a.scope, 'style'); assert.ok(a.length > 0.02 && a.length < 0.04, `length ${a.length}`);
  // cached until a review is finished
  assert.equal(await learnedGroups({ query: async () => { throw new Error('not again'); } }, { now: 2 }), g);
  forgetLearned();
});
