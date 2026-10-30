import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { archetype, engineer, ELEC } from '../src/lab-assembly.js';
import { REFERENCE, scoreAgainst, runBenchmark, summaryOf } from '../src/lab-benchmark.js';

test('the reference products: a dozen, electronics and goods, each with a size, must-haves in the engine\'s terms and ranges', () => {
  assert.equal(REFERENCE.length, 12); assert.ok(REFERENCE.some(r => r.category === 'goods'));
  for (const r of REFERENCE) {
    assert.equal(r.size.length, 3); assert.ok(r.must.length >= 3, r.id);
    for (const m of r.must) assert.ok(m.re || m.kinds.every(k => ELEC[k]), `${r.id}: ${m.label}`);
    for (const k of ['count', 'unit', 'tool']) assert.ok(r[k][0] > 0 && r[k][1] > r[k][0], `${r.id}.${k}`);
  }
});

test('scoring: a matching product scores high, a different product low, and what is missing is named', () => {
  const pb = REFERENCE.find(r => r.id === 'powerbank'), tag = REFERENCE.find(r => r.id === 'tag');
  const good = scoreAgainst(engineer(archetype('powerbank')), pb), wrong = scoreAgainst(engineer(archetype('powerbank')), tag);
  assert.ok(good.score >= 85, `power bank against itself: ${good.score}`); assert.deepEqual(good.missing, []);
  assert.ok(wrong.score < good.score - 20, `power bank against a tracker: ${wrong.score}`); assert.ok(wrong.missing.includes('Buzzer'));
  assert.equal(good.size.length, 3); assert.ok(Object.values(good.parts).every(v => v >= 0 && v <= 1));
});

test('a run: designed, reviewed, scored before and after, summed up; a product that fails does not stop the others', async () => {
  const layout = engineer(archetype('powerbank')).spec, parts = layout.parts.map(({ id, name, shape, axis, size, at, wall, open, r, resin, process, elec, cost, parent }) => ({ id, name, shape, axis, size, at, wall, open, r, resin, process, elec, cost, parent }));
  let calls = 0; const ask = async () => { calls++; if (calls === 3) throw new Error('overloaded'); return { product: true, kind: 'electronics', parts, why: 'A power bank.' }; };
  const seen = []; const res = await runBenchmark({ ask, only: ['powerbank', 'tag', 'bikelight'], onItem: i => seen.push(i.id) });
  assert.deepEqual(seen, ['powerbank', 'bikelight', 'tag'], 'in the reference order'); assert.equal(res.items.length, 3);
  const pb = res.items[0]; assert.ok(pb.before && pb.after && pb.review.status === 'checks-only'); assert.ok(pb.after.score >= 80, `${pb.after.score}`);
  assert.ok(res.items.some(i => i.error), 'the failed design is reported');
  assert.equal(res.summary.products, 3); assert.equal(res.summary.failed, 1); assert.ok(res.summary.after > 0); assert.ok(res.summary.weakest.length >= 1);
});

test('summary: a review pass on a product that scores weakly here is called out', () => {
  const item = (name, review, after) => ({ name, review: { score: review }, before: { score: after }, after: { score: after, missing: [], parts: { size: 1, must: 1, checks: 1, count: 1, unit: 1, tool: 1 } } });
  const s = summaryOf([item('A', 92, 90), item('B', 94, 50), item('C', 70, 40)]);
  assert.deepEqual(s.passedButWeak, ['B']); assert.equal(s.reviewPassed, 2); assert.equal(s.agreement, .67);
});
