import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuote, unitAt, compareQuotes, defaultCompareQty, fxToUsd } from '../src/rfq.js';

const ok = o => cleanQuote({ email: 'a@b.cn', tiers: [{ qty: 500, unit: '4.50' }], ...o });

test('a quote needs a price and a way to reach the factory; commas and spaces in numbers are fine', () => {
  assert.match(cleanQuote({ email: 'a@b.cn', tiers: [] }).error, /at least one price/);
  assert.match(cleanQuote({ tiers: [{ qty: 500, unit: 4 }] }).error, /way to reach you/);
  const r = ok({ tiers: [{ qty: '1,000', unit: ' 3.2 ' }, { qty: 500, unit: 4.5 }, { qty: '', unit: '' }], moq: '500', sampleCost: '80', leadDays: '35', currency: 'cny' });
  assert.deepEqual(r.q.tiers, [{ qty: 500, unit: 4.5 }, { qty: 1000, unit: 3.2 }], 'sorted by quantity, empty row ignored');
  assert.equal(r.q.moq, 500); assert.equal(r.q.sampleCost, 80); assert.equal(r.q.currency, 'CNY');
});

test('bad numbers get a sentence, not a crash', () => {
  assert.match(ok({ tiers: [{ qty: 0, unit: 4 }] }).error, /quantity of 1 or more/);
  assert.match(ok({ tiers: [{ qty: 500, unit: 'abc' }] }).error, /unit price above zero/);
  assert.match(ok({ tiers: [{ qty: 500, unit: 4 }, { qty: 500, unit: 3 }] }).error, /same quantity/);
  assert.match(ok({ moq: 'many' }).error, /minimum order/);
  assert.match(ok({ email: 'not-an-email' }).error, /email/);
  assert.equal(ok({ currency: 'DOGE' }).q.currency, 'USD', 'an unknown currency falls back');
});

test('WeChat or phone alone is enough to reach a factory', () => {
  assert.ok(cleanQuote({ wechat: 'mill_a', tiers: [{ qty: 100, unit: 2 }] }).q);
  assert.ok(cleanQuote({ phone: '+86 20 1234', tiers: [{ qty: 100, unit: 2 }] }).q);
});

test('the price at a quantity is the tier at or below it, and says when the quantity is under what they priced', () => {
  const q = { tiers: [{ qty: 500, unit: 5 }, { qty: 2000, unit: 4 }], moq: 500 };
  assert.deepEqual(unitAt(q, 1000), { unit: 5, tierQty: 500, under: false });
  assert.equal(unitAt(q, 2500).unit, 4);
  assert.equal(unitAt(q, 200).under, true); assert.equal(unitAt(q, 200).unit, 5);
});

test('quotes are ranked by approximate dollar price, with tooling in the total and the cheapest marked', () => {
  const env = { FX_CNY_USD: '0.14' };
  const a = { company: 'A', currency: 'USD', tiers: [{ qty: 500, unit: 5 }], tooling: 300 }, b = { company: 'B', currency: 'CNY', tiers: [{ qty: 500, unit: 30 }] }, c = { company: 'C', currency: 'USD', tiers: [{ qty: 1000, unit: 3 }], moq: 1000 };
  const rows = compareQuotes([a, b, c], 500, env);
  assert.deepEqual(rows.map(r => r.company), ['C', 'B', 'A']); assert.equal(rows[0].lowest, true); assert.equal(rows[0].under, true, 'C priced from 1000, not 500');
  assert.equal(rows[1].unitUsd, 4.2); assert.equal(rows[2].total, 5 * 500 + 300);
  assert.equal(defaultCompareQty([a, b, c]), 1000, 'the smallest quantity everyone priced');
  assert.equal(fxToUsd('USD', {}), 1);
});
