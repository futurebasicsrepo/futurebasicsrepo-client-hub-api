import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSketches, strokesSvg, hitStroke, simplify, SKETCH_LIMITS } from '../src/lab-sketch.js';
import { footwearPattern } from '../src/lab-footwear.js';
import { footwearViews, sketchPoint, warpOf } from '../src/lab-footwear-views.js';

test('what is drawn by hand is kept as drawn, and bounded', () => {
  const c = cleanSketches([{ on: 'lateral', pts: [[1.23456, -2, 2], [2, -2.5]], c: '#ABCDEF', size: 9 }, { on: 'front', pts: [[1, 1]] }, { on: 'top', pts: [[99, 0]] }, { on: 'top', pts: [[1, 2]], c: 'red', id: 'bad id' }]);
  assert.deepEqual(c.map(k => k.on), ['lateral', 'top'], 'a stroke on no view, or with no point inside the drawing, is dropped');
  assert.deepEqual(c[0].pts, [[1.235, -2, 1], [2, -2.5, 1]], 'pressure is 0.1 to 1 (1 when not given)'); assert.equal(c[0].size, .3); assert.equal(c[0].c, '#abcdef');
  assert.equal(c[1].c, '#3a3a3c', 'a colour that is not a hex is graphite'); assert.match(c[1].id, /^k\d+$/);
  const many = Array.from({ length: 40 }, () => ({ on: 'top', pts: Array.from({ length: 1500 }, (_, i) => [i / 100, 0]) }));
  assert.ok(cleanSketches(many).reduce((s, k) => s + k.pts.length, 0) <= SKETCH_LIMITS.total, 'the points in all are capped');
});

test('a stroke is drawn as wide as the pen pressed, found under the pen, and thinned to its shape for a seam', () => {
  const s = { id: 'k1', on: 'top', pts: [[0, 0, 1], [1, 0, 1], [2, 0, .2]], c: '#c2410c', size: .1 };
  const svg = strokesSvg([s]); assert.equal((svg.match(/<path/g) || []).length, 2, 'two widths, two paths'); assert.match(svg, /stroke-width="0\.1"/); assert.match(svg, /stroke-width="0\.06"/);
  assert.equal(hitStroke([s], [1, .1]), 0); assert.equal(hitStroke([s], [1, 1]), -1);
  const wavy = Array.from({ length: 50 }, (_, i) => [i / 10, Math.sin(i / 49 * Math.PI) * 2]), thin = simplify(wavy, .04);
  assert.ok(thin.length < 20 && thin.length > 3, `${thin.length} points keep the curve`); assert.deepEqual(thin[0], [0, 0]);
  assert.deepEqual(simplify([[0, 0], [1, .001], [2, 0]], .04), [[0, 0], [2, 0]], 'a straight line is two points');
});

test('a point drawn on a view goes back to where it is kept: a side\'s on the side view\'s inches (the inside mirrored), the bottom turned over', () => {
  const pat = footwearPattern({ style: 'sneaker' }), v = footwearViews(pat), W = warpOf(pat.last);
  for (const q of [[.4, -2], [3, -1.5], [9, -1]]) {
    const back = sketchPoint(pat, v.lateral, W(q)); assert.ok(Math.hypot(back[0] - q[0], back[1] - q[1]) < 1e-3, `outside ${q} → ${back}`);
    const b = v.medial.box, drawn = [b.x0 + b.x1 - W(q)[0], q[1]], m = sketchPoint(pat, v.medial, drawn); assert.ok(Math.hypot(m[0] - q[0], m[1] - q[1]) < 1e-3, 'inside, mirrored back');
  }
  const bb = v.bottom.box; assert.deepEqual(sketchPoint(pat, v.bottom, [5, bb.y0 + .5]), [5, bb.y1 - .5]);
  // and the strokes are drawn on the views they were drawn on
  const p2 = footwearPattern({ style: 'sneaker', sketches: [{ on: 'medial', pts: [[3, -2], [4, -2]], c: '#2a6df4' }, { on: 'bottom', pts: [[3, 0], [4, 0]], c: '#17603a' }] }), v2 = footwearViews(p2);
  assert.ok(v2.medial.svg.includes('#2a6df4') && !v2.lateral.svg.includes('#2a6df4') && v2.bottom.svg.includes('#17603a'));
});
