import test from 'node:test';
import assert from 'node:assert/strict';
import { outlines, relax, smoothPath, LEVELS } from '../src/lab-trace.js';

// a grainy wavy pencil line in one colour, and a red dot beside it
function drawing() {
  const W = 220, H = 120, px = new Uint8ClampedArray(W * H * 4); let s = 7; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  const dot = (x, y, c) => { const i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
  for (let t = 0; t < 400; t++) { const x = 20 + t * .4, y = 60 + Math.sin(t / 30) * 30 + r() * 3; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (r() > .3) dot(Math.round(x) + dx, Math.round(y) + dy, [20, 20, 22]); }
  for (let y = 50; y < 70; y++) for (let x = 190; x < 210; x++) if ((x - 200) ** 2 + (y - 60) ** 2 < 90) dot(x, y, [200, 30, 30]);
  return { px, W, H };
}

test('a drawing becomes one outline per ink', () => {
  const { px, W, H } = drawing(), o = outlines(px, W, H, { level: 1 });
  assert.equal(o.length, 2); assert.ok(o.some(k => k.hex === '#141416')); assert.ok(o.some(k => /^#c/.test(k.hex)));
  for (const k of o) assert.match(k.d, /^M[\d.]+ [\d.]+/);
});

test('each refine is cleaner: fewer points, never more', () => {
  const { px, W, H } = drawing(); let last = Infinity;
  for (let l = 1; l <= LEVELS.length; l++) { const d = outlines(px, W, H, { level: l }).find(k => k.hex === '#141416').d; assert.ok(d.length <= last, `level ${l}`); last = d.length; }
});

test('nothing drawn, nothing traced; smoothing keeps the point count', () => {
  assert.deepEqual(outlines(new Uint8ClampedArray(40 * 40 * 4), 40, 40), []);
  assert.equal(relax([[0, 0], [10, 0], [10, 10], [0, 10]], 3).length, 4);
  assert.match(smoothPath([[0, 0], [100, 0], [100, 50], [0, 50]]), /L100 0/);
});
