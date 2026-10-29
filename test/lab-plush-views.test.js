import test from 'node:test';
import assert from 'node:assert/strict';
import { plushPattern, PLUSH_SHAPES } from '../src/lab-pattern.js';
import { plushViews, plushLayout, plushSheet } from '../src/lab-plush-views.js';
import { viewsMarkup } from '../src/lab-footwear-views.js';

test('every plush is drawn stuffed from the front, the back and the side, at its height', () => {
  for (const shape of Object.keys(PLUSH_SHAPES)) {
    const pat = plushPattern({ shape, height: 12 }), v = plushViews(pat);
    for (const k of ['front', 'back', 'side']) { const b = v[k].box; assert.ok(!/NaN|Infinity/.test(v[k].svg), `${shape} ${k}`); assert.ok(b.y1 - b.y0 > 11 && b.y1 - b.y0 < 17, `${shape} ${k} stands about its height (${(b.y1 - b.y0).toFixed(2)})`); }
    assert.match(v.front.svg, /12 in/, 'the front carries its height'); assert.match(v.back.svg, /<rect[^>]+fill="#fff"/, `${shape}: the law label in its seam, from the back`);
    const lay = plushLayout(v), [F, B, S] = lay.items.map(i => i.box); assert.ok(F.x1 <= B.x0 && B.x1 <= S.x0, 'side by side, apart');
  }
});

test('the face is made as the eyes chosen: embroidered, 12 mm safety eyes, or felt', () => {
  const emb = plushViews(plushPattern({ shape: 'bear', eyes: 'embroidered' })).front.svg, safe = plushViews(plushPattern({ shape: 'bear', eyes: 'safety', age: '3+' })).front.svg, felt = plushViews(plushPattern({ shape: 'bear', eyes: 'felt' })).front.svg;
  assert.ok(!/r="\.17"/.test(emb) && /r="\.17"/.test(safe), 'a safety eye shows its washer ring'); assert.ok(/fill="#fbfaf6"/.test(felt) && !/fill="#fbfaf6"/.test(emb), 'felt eyes are sewn on white');
  const bunny = plushViews(plushPattern({ shape: 'bunny' })); assert.ok(bunny.back.svg.length > 0 && plushPattern({ shape: 'bunny' }).spec.tail);
});

test('lines drawn by hand on a plush are kept on their view and drawn into its tech flats', () => {
  const pat = plushPattern({ shape: 'bean', sketches: [{ on: 'front', pts: [[0, 3], [1, 3.5]], c: '#c2410c' }, { on: 'lateral', pts: [[0, 0], [1, 1]], c: '#2a6df4' }] }), v = plushViews(pat);
  assert.ok(v.front.svg.includes('#c2410c') && !v.back.svg.includes('#c2410c'));
  const sheet = plushSheet(pat, { title: 'Bean', viewsMarkup }); assert.match(sheet, /^<\?xml/); assert.match(sheet, />Front</); assert.match(sheet, />Side</);
});
