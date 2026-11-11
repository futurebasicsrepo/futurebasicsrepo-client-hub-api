import test from 'node:test';
import assert from 'node:assert/strict';
import { plushPattern, PLUSH_SHAPES } from '../src/lab-pattern.js';
import { plushViews, plushLayout, plushSheet } from '../src/lab-plush-views.js';
import { viewsMarkup } from '../src/lab-footwear-views.js';

test('every plush is drawn stuffed from the front, the back and the side, at its height', () => {
  for (const shape of Object.keys(PLUSH_SHAPES)) {
    const pat = plushPattern({ shape, height: 12 }), v = plushViews(pat);
    // a sea creature's size is its length: its side is that long, its front about two fifths of it high
    for (const k of ['front', 'back', 'side']) { const b = v[k].box; assert.ok(!/NaN|Infinity/.test(v[k].svg), `${shape} ${k}`);
      if (shape === 'sea') assert.ok(k === 'side' ? b.x1 - b.x0 > 11 && b.x1 - b.x0 < 15 : b.y1 - b.y0 > 4 && b.y1 - b.y0 < 8, `sea ${k} at its length (${(b.x1 - b.x0).toFixed(2)} × ${(b.y1 - b.y0).toFixed(2)})`);
      else assert.ok(b.y1 - b.y0 > 11 && b.y1 - b.y0 < 17, `${shape} ${k} stands about its height (${(b.y1 - b.y0).toFixed(2)})`); }
    assert.match(v.front.svg, shape === 'sea' ? /\d in</ : /12 in/, 'the front carries its height'); assert.match(v.back.svg, /<rect[^>]+fill="#fff"/, `${shape}: the law label in its seam, from the back`);
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

test('a plush with no legs, or a bigger or smaller head, is drawn the height it says: the drawing is scaled as the pattern is', () => {
  const side = (shape, o = {}) => { const b = plushViews(plushPattern({ shape, height: 12, ears: 'none', ...o })).side.box; return shape === 'sea' ? b.x1 - b.x0 : b.y1 - b.y0; };
  // each drawn 9¾ to 13⅜ in for 12 in before
  for (const [shape, o] of [['bear', { legs: false }], ['quad', { head: 1.3 }], ['quad', { head: .8 }], ['sea', { head: 1.3 }], ['sea', { head: .8 }]]) { const usual = side(shape), own = side(shape, o);
    assert.ok(Math.abs(own - usual) < .12 && Math.abs(usual - 12) < .4, `${shape} ${JSON.stringify(o)}: drawn ${own.toFixed(2)} in, the usual toy ${usual.toFixed(2)} in`); }
  // a bear with no legs has none on its front or its back either, and is drawn larger to make its height
  const legs = plushViews(plushPattern({ shape: 'bear', height: 12 })), none = plushViews(plushPattern({ shape: 'bear', height: 12, legs: false }));
  for (const k of ['front', 'back']) assert.ok((none[k].svg.match(/<path/g) || []).length < (legs[k].svg.match(/<path/g) || []).length, `${k}: no legs drawn`);
  assert.ok(none.front.box.x1 - none.front.box.x0 > legs.front.box.x1 - legs.front.box.x0 + 1, 'the body is drawn larger, as it is cut');
});
