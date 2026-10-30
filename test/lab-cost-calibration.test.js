import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { archetype, engineer } from '../src/lab-assembly.js';
import { sampleOf, factorsOf, calibrated } from '../src/lab-cost-calibration.js';

test('a quote beside the estimate: the tier nearest the costed volume, tooling and lead time in weeks', () => {
  const E = engineer(archetype('puck')), s = sampleOf(E, { currency: 'usd', tiers: [{ qty: 1000, unit: 30 }, { qty: 4000, unit: 24 }, { qty: 20000, unit: 19 }], tooling: 40000, lead_days: 70 });
  assert.equal(s.qty, 4000); assert.equal(s.quoteUnit, 24); assert.equal(s.estUnit, E.unit); assert.equal(s.quoteWeeks, 10); assert.equal(s.currency, 'USD'); assert.equal(s.kind, 'electronics');
  assert.equal(sampleOf(E, { tiers: [] }), null);
});

test('factors: the median of quote ÷ estimate, pulled toward 1 while samples are few, kept between 0.4 and 2.5, by kind and in USD', () => {
  const one = x => ({ kind: 'electronics', currency: 'USD', estUnit: 10, quoteUnit: 10 * x, estTool: 1000, quoteTool: 1000 * x, estWeeks: 8, quoteWeeks: 8 * x });
  assert.deepEqual(factorsOf([], 'electronics'), { n: 0, unit: 1, tool: 1, weeks: 1, nTool: 0, nWeeks: 0 });
  const f1 = factorsOf([one(2)], 'electronics'); assert.ok(f1.unit > 1 && f1.unit < 1.25, `one sample moves it a quarter of the way (log): ${f1.unit}`);
  const many = factorsOf(Array.from({ length: 30 }, () => one(1.5)), 'electronics'); assert.ok(Math.abs(many.unit - 1.5) < .1, `many samples: ${many.unit}`);
  assert.equal(factorsOf([one(100), one(100), one(100), one(100), one(100), one(100), one(100), one(100), one(100), one(100), one(100), one(100)], 'electronics').unit, 2.5);
  assert.equal(factorsOf([{ ...one(2), currency: 'EUR' }], 'electronics').n, 0, 'another currency is not counted');
  assert.equal(factorsOf([one(2)], 'goods').n, 0, 'electronics and goods apart');
  const E = engineer(archetype('puck')), c = calibrated(E, many); assert.ok(Math.abs(c.unit - E.unit * many.unit) < .01 && c.n === 30); assert.equal(calibrated(E, factorsOf([], 'electronics')), null);
});
