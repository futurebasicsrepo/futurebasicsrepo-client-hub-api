import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSizes, sizesTotal, sizesWords, tierFor, matchRequest, cleanQuote, clientQuote, quoteNumber } from '../src/order-quotes.js';

const PRODUCTS = ['Cap — Green', 'Cap — Tan', 'Beanie — Green', 'Multitool', 'Long Sleeve "Yosemite"', 'T-Shirt "Taxi"', 'Water Bottle'].map((title, i) => ({ id: 'p' + i, title }));

test('sizes are read the way people write them', () => {
  assert.deepEqual(parseSizes('10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL'), { S: 10, M: 30, L: 30, XL: 20, '2XL': 5, '3XL': 5 });
  assert.deepEqual(parseSizes('S:4 M=6'), { S: 4, M: 6 });
  assert.equal(sizesTotal(parseSizes('10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL')), 100); assert.equal(sizesWords({ S: 2, M: 0, L: 1 }), '2 S, 1 L');
});

test('a quantity falls in the tier with the highest minimum at or under it', () => {
  const tiers = [{ id: 'a', min_quantity: 50 }, { id: 'b', min_quantity: 100, max_quantity: 249 }, { id: 'c', min_quantity: 250 }];
  assert.equal(tierFor(tiers, 120).tier.id, 'b'); assert.equal(tierFor(tiers, 400).tier.id, 'c');
  assert.deepEqual([tierFor(tiers, 20).tier.id, tierFor(tiers, 20).belowMin], ['a', true]); assert.equal(tierFor([], 5), null);
});

test('a request names products in its own words: an olive hat is the green cap, and the size breakdown goes with the line before it', () => {
  const picks = matchRequest('Hi, we want a single order with 3 items: - Olive hat (50) - Multitool (100) - Ouster Yosemite Long Sleeve — Natural (100), and we want 10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL', PRODUCTS);
  assert.deepEqual(picks.map(p => [p.productId, p.quantity]), [['p0', 50], ['p3', 100], ['p4', 100]]);
  assert.deepEqual(picks[2].sizes, { S: 10, M: 30, L: 30, XL: 20, '2XL': 5, '3XL': 5 }); assert.equal(picks[0].sizes, null);
  assert.deepEqual(matchRequest('Can you call me?', PRODUCTS), [], 'no products, no picks');
});

test('a quote is checked: products in the room, a quantity and a price on every line, sizes that add up', () => {
  const ok = cleanQuote({ lines: [{ productId: 'p3', quantity: 100, unitCents: 1200, unitCostCents: 800 }, { productId: 'p4', quantity: 100, sizes: { S: 10, M: 30, L: 30, XL: 20, '2XL': 5, '3XL': 5 }, unitCents: 2900, unitCostCents: 1890 }], extras: [{ label: 'Freight', cents: 15000 }, { label: '', cents: 5 }], validUntil: '2026-12-07' }, PRODUCTS);
  assert.equal(ok.value.subtotalCents, 410000); assert.equal(ok.value.totalCents, 425000); assert.equal(ok.value.extras.length, 1); assert.equal(ok.value.marginPct, 34.4); assert.equal(ok.value.validUntil, '2026-12-07');
  assert.match(cleanQuote({ lines: [{ productId: 'zz', quantity: 1, unitCents: 1 }] }, PRODUCTS).error, /not in this room/);
  assert.match(cleanQuote({ lines: [{ productId: 'p3', quantity: 0, unitCents: 1 }] }, PRODUCTS).error, /quantity/);
  assert.match(cleanQuote({ lines: [{ productId: 'p3', quantity: 5 }] }, PRODUCTS).error, /unit price/);
  assert.match(cleanQuote({ lines: [{ productId: 'p4', quantity: 100, sizes: { S: 10 }, unitCents: 1 }] }, PRODUCTS).error, /add up to 10/);
  assert.match(cleanQuote({ lines: [] }, PRODUCTS).error, /at least one/);
  assert.equal(cleanQuote({ lines: [{ productId: 'p3', quantity: 1, unitCents: 100 }] }, PRODUCTS).value.marginPct, null, 'no cost, no margin');
});

test('the client sees the lines and the total, never our costs or margin', () => {
  const v = clientQuote({ id: 'q', number: 'Q-2026-0001', status: 'sent', lines: [{ title: 'Multitool', quantity: 100, unitCents: 1200, totalCents: 120000, unitCostCents: 800 }], total_cents: 120000, cost_cents: 80000, margin_pct: 33.3, pay_url: 'https://pay' });
  assert.equal(JSON.stringify(v).includes('unitCostCents'), false); assert.equal(v.payUrl, '', 'the pay link only shows once accepted'); assert.equal(quoteNumber(7, 2026), 'Q-2026-0007');
});

test('a line with no cost on record leaves the margin blank, not 100%', () => {
  const q = cleanQuote({ lines: [{ productId: 'p3', quantity: 100, unitCents: 1850, unitCostCents: null }, { productId: 'p4', quantity: 100, unitCents: 2350, unitCostCents: 1420 }] }, PRODUCTS);
  assert.equal(q.value.costCents, null); assert.equal(q.value.marginPct, null);
});

test('sizes read smallest to largest, whatever order they were stored in', () => {
  assert.equal(sizesWords({ L: 30, M: 30, S: 10, XL: 20, '2XL': 5, '3XL': 5 }), '10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL');
});

test('one size: "One size", "OSFA" or "one size fits all" alone covers the whole quantity; "50 one size" counts', () => {
  assert.deepEqual(parseSizes('One size', 50), { 'One size': 50 }); assert.deepEqual(parseSizes('osfa', 20), { 'One size': 20 });
  assert.deepEqual(parseSizes('one size fits all', 12), { 'One size': 12 }); assert.deepEqual(parseSizes('50 One size'), { 'One size': 50 });
  assert.deepEqual(parseSizes('One size'), {}, 'with no quantity there is nothing to count'); assert.deepEqual(parseSizes('blue', 5), {});
  assert.equal(cleanQuote({ lines: [{ productId: 'p0', quantity: 50, sizes: { 'one size': 50 }, unitCents: 1600 }] }, PRODUCTS).value.lines[0].sizes['One size'], 50);
});
