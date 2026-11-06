import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookRecipe } from '../src/lab-recipe.js';
import { garmentPattern, placed, boundsOf } from '../src/lab-pattern.js';
import { drawingOf } from '../src/lab-flats.js';

test('a shearling aviator is measured like one and its pattern has what it is made of', () => {
  const r = cookRecipe({ base: 'jacket', addons: ['neck-shearling'] });
  assert.ok(r.params.m.length > 26 && r.params.m.length < 31, `body length ${r.params.m.length}`); // was 37 1/4 from a misread sketch
  const pat = garmentPattern(r.params), by = id => pat.pieces.find(q => q.id === id);
  assert.equal(by('collar').fabric, 'shearling'); assert.equal(by('hem-rib').fabric, 'shearling'); assert.equal(by('cuff').fabric, 'shearling');
  assert.ok(!by('neck-rib'), 'no knit rib under a shearling collar');
  assert.ok(by('welt') && by('pocket-bag'), 'welt pockets and their bags');
  // the hem band shows across the front only, as wide as the body
  const hb = boundsOf(placed(by('hem-rib'))); assert.ok(Math.abs(hb.w - r.params.m.chest) < .01);
  // each cuff sits on the end of its sleeve
  for (const [s, c] of [['sleeve', 'cuff'], ['sleeve-2', 'cuff-2']]) {
    const sl = placed(by(s)), end = sl.slice().sort((a, b) => b[1] - a[1]).slice(0, 2), mid = [(end[0][0] + end[1][0]) / 2, (end[0][1] + end[1][1]) / 2];
    const cb = boundsOf(placed(by(c))); assert.ok(Math.hypot((cb.x0 + cb.x1) / 2 - mid[0], (cb.y0 + cb.y1) / 2 - mid[1]) < 2.5, `${c} on the sleeve end`);
  }
  // on the product a sleeve is drawn folded, as a flat shows it: about half its cut width
  const sl = by('sleeve'); assert.ok(boundsOf(sl.shown).w < boundsOf(sl.sew).w * .7);
  // the sketch is drawn to the piece's chest (the misread chest made it a third too wide)
  const d = drawingOf(r.params, 'front'); assert.equal(d.v.chest, 176);
});
