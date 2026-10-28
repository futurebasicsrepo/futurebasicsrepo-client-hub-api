import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENTS, placementKey, sizeFindings, decorationCost, decorationLine, DECOR_COST } from '../src/lab-decor.js';
import { costOf } from '../src/lab-materials.js';

test('placement words map to a spot with typical sizes', () => {
  assert.equal(placementKey('Left chest, 3 in below the shoulder'), 'left chest');
  assert.equal(placementKey('front centre'), 'centre chest');
  assert.equal(placementKey('Full front'), 'full front');
  assert.equal(placementKey('nape'), 'back neck');
  assert.equal(placementKey('cap front'), 'cap front');
  for (const p of Object.values(PLACEMENTS)) { assert.ok(p.w[0] < p.w[1]); assert.ok(p.label && p.note); }
});

test('size findings: too big for the technique, wide or small for the spot, fine where it suits', () => {
  const big = sizeFindings({ widthIn: 15, heightIn: 14, placement: 'full front', base: 'embroidery', techName: 'Flat embroidery' });
  assert.ok(big.some(f => f.code === 'TOO_BIG' && f.level === 'fail'));
  assert.ok(sizeFindings({ widthIn: 8, heightIn: 3, placement: 'left chest' }).some(f => f.code === 'WIDE_FOR_PLACE'));
  assert.ok(sizeFindings({ widthIn: 1, heightIn: 1, placement: 'full front' }).some(f => f.code === 'SMALL_FOR_PLACE'));
  assert.ok(sizeFindings({ widthIn: 4, heightIn: 3.5, placement: 'cap front' }).some(f => f.code === 'TALL_FOR_PLACE'));
  const ok = sizeFindings({ widthIn: 3.5, heightIn: 1.2, placement: 'left chest' });
  assert.deepEqual(ok.map(f => f.code), ['PLACE_OK']);
  assert.deepEqual(sizeFindings({ widthIn: 3.5, heightIn: 1.2 }), []);
});

test('decoration cost: screens per colour, setup shared over the order, bigger prints cost more', () => {
  const one = decorationCost({ base: 'screen print', widthIn: 3.5, heightIn: 1.5, colours: 1, qty: 300 });
  const three = decorationCost({ base: 'screen print', widthIn: 3.5, heightIn: 1.5, colours: 3, qty: 300 });
  assert.ok(three.unitCents > one.unitCents && three.setupCents === one.setupCents * 3);
  assert.match(three.basis, /3 screens/);
  const big = decorationCost({ base: 'screen print', widthIn: 11, heightIn: 12, colours: 3, qty: 300 });
  assert.ok(big.unitCents > three.unitCents);
  assert.equal(big.perPieceCents, Math.round(big.unitCents + big.setupCents / 300));
  const fewer = decorationCost({ base: 'screen print', widthIn: 11, heightIn: 12, colours: 3, qty: 50 });
  assert.ok(fewer.perPieceCents > big.perPieceCents, 'a small order carries more of the setup');
});

test('embroidery is priced by stitches; transfers by area; a technique can carry its own numbers', () => {
  const e = decorationCost({ base: 'embroidery', widthIn: 3.5, heightIn: 1, coverage: .6 });
  assert.match(e.basis, /stitches/);
  assert.ok(e.perPieceCents > 50 && e.perPieceCents < 300);
  const small = decorationCost({ base: 'DTF transfer', widthIn: 3, heightIn: 3, coverage: 1 }), large = decorationCost({ base: 'DTF transfer', widthIn: 10, heightIn: 10, coverage: 1 });
  assert.ok(large.unitCents > small.unitCents && small.setupCents === 0);
  const own = decorationCost({ base: 'screen print', rules: { cost: { unit: 500, setup: 0 } }, widthIn: 3, heightIn: 3 });
  assert.equal(own.unitCents, 500);
  assert.ok(decorationCost({ base: 'unknown thing' }).unitCents > 0, 'an unknown base falls back to screen print');
  for (const [k, d] of Object.entries(DECOR_COST)) assert.ok(d.bands.length === 3, k);
});

test('a decoration line counts in the factory cost and the landed cost', () => {
  const cost = decorationCost({ base: 'screen print', widthIn: 11, heightIn: 12, colours: 3, qty: 300 });
  const line = decorationLine({ name: 'Chest graphic', technique: 'Plastisol', base: 'screen print', widthIn: 11.004, heightIn: 12, colours: 3, pantones: ['PANTONE Black 6 C'], cost, placement: 'Full front' });
  assert.equal(line.widthIn, 11); assert.equal(line.perPieceCents, cost.perPieceCents); assert.deepEqual(line.pantones, ['PANTONE Black 6 C']);
  const without = costOf([], { category: 'tops', priceCents: 6000 }), withDeco = costOf([], { category: 'tops', priceCents: 6000, decorations: [line] });
  assert.equal(withDeco.decorationCents, cost.perPieceCents);
  assert.equal(withDeco.factoryCents - without.factoryCents, cost.perPieceCents);
  assert.ok(withDeco.landedCents > without.landedCents && withDeco.marginPct < without.marginPct);
  assert.equal(costOf([], { decorations: [{ perPieceCents: 'x' }] }).decorationCents, 0);
});
