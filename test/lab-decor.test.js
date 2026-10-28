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

import { gradeArt, gradeFor, suggestInks, contrast, calibrationOf } from '../src/lab-decor.js';
import { cleanFlat, defaultParams, renderSvg } from '../src/lab-flats.js';

test('artwork by garment size: scaled with the chest from the sample size, rounded to a quarter inch', () => {
  const measures = { XS: 18, S: 19, M: 20, L: 21, XL: 22.5, XXL: 24 };
  const two = gradeArt({ w: 10, h: 5, measures, breaks: 2 }), three = gradeArt({ w: 10, h: 5, measures, breaks: 3 });
  assert.deepEqual(two.map(g => g.sizes.join('')), ['XSSM', 'LXLXXL']);
  assert.ok(two[0].w < 10 && two[1].w > 10 && two.every(g => g.w * 4 === Math.round(g.w * 4) && g.h === Math.round(g.w / 2 * 8) / 8));
  assert.equal(three.length, 3); assert.ok(three[0].w < three[1].w && three[1].w < three[2].w);
  const q = { w: 10, h: 5, grade: two };
  assert.equal(gradeFor(q, 'XXL').w, two[1].w); assert.equal(gradeFor({ w: 4, h: 2 }, 'M').w, 4);
});

test('inks per colourway: an ink lost on the garment is moved until it reads; the rest stay as drawn', () => {
  const onBlack = suggestInks(['#141416', '#ffffff'], '#111111');
  assert.notEqual(onBlack[0].to, '#141416'); assert.ok(contrast(onBlack[0].to, '#111111') >= 2.2); assert.equal(onBlack[1].to, '#ffffff');
  const onCream = suggestInks(['#f4f1ea', '#c8102e'], '#f2efe6');
  assert.ok(contrast(onCream[0].to, '#f2efe6') >= 2.2 && onCream[1].to === '#c8102e');
});

test('factory quotes calibrate the estimate: the median, trusted more as quotes come in, bounded', () => {
  assert.equal(calibrationOf([]), null);
  const one = calibrationOf([{ actualCents: 300, estimateCents: 200 }]);
  assert.equal(one.n, 1); assert.ok(one.factor > 1 && one.factor < 1.5, 'one quote moves it a third of the way');
  const three = calibrationOf([{ actualCents: 300, estimateCents: 200 }, { actualCents: 290, estimateCents: 200 }, { actualCents: 310, estimateCents: 200 }]);
  assert.equal(three.factor, 1.5);
  assert.equal(calibrationOf(Array(5).fill({ actualCents: 10000, estimateCents: 100 })).factor, 3, 'bounded at 3×');
  const base = decorationCost({ base: 'screen print', widthIn: 10, heightIn: 6, colours: 2 }), cal = decorationCost({ base: 'screen print', widthIn: 10, heightIn: 6, colours: 2, calibration: three });
  assert.ok(Math.abs(cal.unitCents - base.unitCents * 1.5) <= 1 && cal.setupCents === Math.round(base.setupCents * 1.5) && /factory quotes/.test(cal.basis));
});

test('all-over prints cost by the cloth covered', () => {
  const tee = decorationCost({ base: 'all-over sublimation', widthIn: 1400, heightIn: 1, coverage: 1 });
  assert.ok(tee.perPieceCents > 300 && tee.perPieceCents < 1500, String(tee.perPieceCents));
});

test('the flats keep artwork sizes by garment size, inks per colourway, the studio layer and an all-over print', () => {
  const p = defaultParams('tee', 'regular'), art = '11111111-1111-4111-8111-111111111111';
  const { params, placements } = cleanFlat({ ...p, allover: { art, w: 6, h: 4.3, type: 'halfdrop', name: 'Leaf', base: 'nonsense' }, placements: [{ id: 's-labc123', source: 'studio', layer: 'labc123', name: 'Crest', x: 0, y: 6, w: 10, h: 5, art,
    grade: [{ sizes: ['XS', 'S', 'M', 'nope'], w: 9.5 }, { sizes: ['L', 'XL', 'XXL', 'M'], w: 11 }], inks: { '#111111': { '#141416': '#5b5b5c', bad: '#fff' }, notahex: {} } }] });
  const q = placements[0];
  assert.equal(q.source, 'studio'); assert.equal(q.layer, 'labc123');
  assert.deepEqual(q.grade.map(g => g.sizes), [['XS', 'S', 'M'], ['L', 'XL', 'XXL']]); assert.equal(q.grade[1].h, 5.5);
  assert.deepEqual(q.inks, { '#111111': { '#141416': '#5b5b5c' } });
  assert.equal(params.allover.base, 'all-over sublimation'); assert.equal(params.allover.w, 6);
  assert.equal(cleanFlat({ ...p, placements: [{ x: 0, y: 6, w: 4, h: 2, grade: [{ sizes: ['M'], w: 4 }] }] }).placements[0].grade, undefined, 'one group is no grading');
  const svg = renderSvg({ ...params, color: '#1f2a44' }, 'front', { alloverHref: 'data:image/png;base64,AAAA', scale: 0 });
  assert.match(svg, /<pattern id="[^"]+-ao" patternUnits="userSpaceOnUse"[^>]* width="6" height="4\.25"/); assert.match(svg, /mask="url\(#[^"]+-am\)"/);
  assert.doesNotMatch(renderSvg(params, 'front', { scale: 0 }), /-ao"/, 'no tile, no pattern');
});
