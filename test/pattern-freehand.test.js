import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStroke, replaceEdge, splitPiece, drawnPiece, areaOf, boundsOf } from '../src/lab-pattern.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const wobble = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n + (i % 2 ? .01 : -.01), a[1] + (b[1] - a[1]) * i / n]);

test('a hand-drawn stroke is tidied: the wobble out, every point on the sixteenth', () => {
  const s = cleanStroke(wobble([0, 0], [10, 0]));
  assert.ok(s.length <= 4, `a straight line stays a few points (${s.length})`);
  assert.ok(s.every(([x, y]) => x * 16 === Math.round(x * 16) && y * 16 === Math.round(y * 16)));
  assert.deepEqual(cleanStroke([[0, 0]]), []);
});

test('redrawing an edge: the side the stroke runs along takes its shape, the rest stays', () => {
  // a curve drawn along the bottom edge, bowing down 2 in
  const stroke = Array.from({ length: 31 }, (_, i) => { const x = 10 - i / 3; return [x, 10 + 2 * Math.sin(Math.PI * (10 - x) / 10)]; });
  const out = replaceEdge(square, stroke); assert.ok(out, 'redrawn');
  const b = boundsOf(out); assert.ok(b.y1 > 11.5 && b.y1 < 12.2, `the bottom bows down (${b.y1})`); assert.equal(b.y0, 0, 'the top is untouched');
  assert.ok(areaOf(out) > 100, 'it grew by the bow');
  // drawn the other way round, the same edge
  const out2 = replaceEdge(square, stroke.slice().reverse()); assert.ok(Math.abs(areaOf(out2) - areaOf(out)) < .5);
});

test('cutting a piece in two along a drawn line: two pieces, together the same cloth', () => {
  const [a, b] = splitPiece(square, [[-1, 4], [5, 3.5], [11, 4]]);
  assert.ok(Math.abs(areaOf(a) + areaOf(b) - 100) < .2, `${areaOf(a)} + ${areaOf(b)}`);
  assert.ok(Math.min(areaOf(a), areaOf(b)) > 30 && Math.min(areaOf(a), areaOf(b)) < 45, 'cut near 4 in down');
  assert.equal(splitPiece(square, [[-1, -1], [-2, -2]]), null, 'a line that misses cuts nothing');
});

test('a piece drawn freehand: a closed shape with area', () => {
  const circle = Array.from({ length: 60 }, (_, i) => [3 * Math.cos(i / 60 * 2 * Math.PI), 3 * Math.sin(i / 60 * 2 * Math.PI)]);
  const p = drawnPiece(circle); assert.ok(p && Math.abs(areaOf(p) - Math.PI * 9) < 2, `about a 3 in circle (${p && areaOf(p)})`);
  assert.equal(drawnPiece([[0, 0], [1, 0]]), null);
});
