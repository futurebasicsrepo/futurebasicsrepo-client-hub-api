import test from 'node:test';
import assert from 'node:assert/strict';
import { panelAt, panelName, trace } from '../src/lab-flat-panels.js';
import { cleanEdits } from '../src/lab-flats.js';

// a white page with black lines drawn on it
function page(W, H, draw) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const ink = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = (y * W + x) * 4; data[p] = data[p + 1] = data[p + 2] = 0; };
  draw(ink); return { data, width: W, height: H };
}
const box = (ink, x0, y0, x1, y1) => { for (let x = x0; x <= x1; x++) { ink(x, y0); ink(x, y1); } for (let y = y0; y <= y1; y++) { ink(x0, y); ink(x1, y); } };

test('the outline of a region is walked round its edge, clockwise', () => {
  const W = 6, H = 5, m = new Uint8Array(W * H); for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) m[y * W + x] = 1;
  assert.deepEqual(trace(m, W, H), [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [1, 3], [1, 2]]);
});

test('a tap finds the panel between the lines, and nothing outside the garment', () => {
  // a body with a seam down the middle: two panels
  const img = page(120, 80, ink => { box(ink, 10, 10, 110, 70); for (let y = 10; y <= 70; y++) ink(60, y); });
  const left = panelAt(img, 30, 40), right = panelAt(img, 90, 40);
  assert.ok(left && right);
  assert.ok(left.box.x1 < 61 && right.box.x0 > 59, 'each stops at the seam');
  assert.ok(left.pts.length >= 4 && left.pts.length <= 220);
  assert.equal(panelAt(img, 2, 2), null, 'outside the garment the flood reaches the edge: no panel');
  assert.equal(panelAt(img, 500, 2), null, 'off the picture: nothing');
});

test('a tap on a rib stripe takes the whole rib band', () => {
  // a hem band of thin upright stripes under the body, closed by a heavier outline
  const img = page(200, 100, ink => {
    box(ink, 10, 10, 190, 60); box(ink, 10, 60, 190, 85);
    for (let x = 14; x < 190; x += 5) for (let y = 61; y < 85; y++) ink(x, y);
  });
  const band = panelAt(img, 51, 72), body = panelAt(img, 100, 30);
  assert.ok(band && body);
  assert.ok(band.box.x1 - band.box.x0 > 150, `the band, stripes and all (${band.box.x0}–${band.box.x1})`);
  assert.ok(band.box.y0 >= 60 && body.box.y1 <= 61, 'and the body is its own panel');
});

test('a panel gets a first name from where it sits', () => {
  assert.equal(panelName({ x0: 12, x1: 18, y0: 3, y1: 25 }, { kind: 'top', half: 11, length: 27 }), 'Sleeve');
  assert.equal(panelName({ x0: 13, x1: 17, y0: 24, y1: 27 }, { kind: 'top', half: 11, length: 27 }), 'Cuff');
  assert.equal(panelName({ x0: -6, x1: 0, y0: -9, y1: 2 }, { kind: 'top', half: 11, length: 27 }), 'Hood');
  assert.equal(panelName({ x0: -10, x1: 10, y0: 24, y1: 27 }, { kind: 'top', half: 11, length: 27 }), 'Hem rib');
  assert.equal(panelName({ x0: -10, x1: 10, y0: 1, y1: 23 }, { kind: 'top', half: 11, length: 27 }), 'Body');
});

test('a traced panel keeps its whole outline, finely, and says it was traced', () => {
  const pts = Array.from({ length: 150 }, (_, i) => [10 * Math.cos(i / 150 * 2 * Math.PI) + .01, 10 * Math.sin(i / 150 * 2 * Math.PI) + 12]);
  const [b] = cleanEdits([{ id: 'b1', type: 'block', view: 'front', pts, color: '#1f3a5f', name: 'Sleeve', traced: true }]);
  assert.equal(b.pts.length, 150, 'not cut at 60 points');
  assert.ok(b.pts.every(([x]) => Math.abs(x * 32 - Math.round(x * 32)) < 1e-9), 'kept to 1/32 in');
  assert.equal(b.traced, true);
  const [s] = cleanEdits([{ id: 's1', type: 'stitch', view: 'front', pts: pts.slice(0, 100), stitch: 'single' }]);
  assert.equal(s.pts.length, 60, 'a stitch line still keeps 60');
});
