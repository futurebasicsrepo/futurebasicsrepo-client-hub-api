import test from 'node:test';
import assert from 'node:assert/strict';
import { halftone, stipple, posterize, threshold, duotone, darkness } from '../src/lab-filters.js';

// a left-to-right ramp from white to black, opaque; and a square of red on clear
function ramp(W = 120, H = 40) { const p = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4, v = 255 - Math.round(x / (W - 1) * 255); p[k] = p[k + 1] = p[k + 2] = v; p[k + 3] = 255; } return { p, W, H }; }

test('halftone: darker cells get bigger dots; a clear area gets none', () => {
  const { p, W, H } = ramp(), dots = halftone(p, W, H, { cell: 10, angle: 0 });
  const left = dots.filter(d => d.x < 30), right = dots.filter(d => d.x > 90);
  assert.ok(right.length && Math.min(...right.map(d => d.s)) > Math.max(...left.map(d => d.s), 0));
  assert.equal(halftone(new Uint8ClampedArray(40 * 40 * 4), 40, 40, { cell: 8 }).length, 0);
  const own = halftone(p, W, H, { cell: 10, mode: 'own' }); assert.ok(own.every(d => /^#[0-9a-f]{6}$/.test(d.c)));
});

test('stipple: more dots where it is darker, and the same dots each time', () => {
  const { p, W, H } = ramp(), a = stipple(p, W, H, { cell: 4 }), b = stipple(p, W, H, { cell: 4 });
  assert.deepEqual(a, b); assert.ok(a.filter(d => d.x > 80).length > a.filter(d => d.x < 40).length * 2);
});

test('posterize: the picture in at most the inks asked for, flat', () => {
  const { p, W, H } = ramp(), r = posterize(p, W, H, { inks: 3 });
  assert.ok(r.palette.length >= 2 && r.palette.length <= 3);
  for (let i = 3; i < r.rgba.length; i += 4) assert.ok(r.rgba[i] === 0 || r.rgba[i] === 255);
});

test('one ink and duotone', () => {
  const { p, W, H } = ramp(), t = threshold(p, W, H, { cut: 128, color: '#b5302b' });
  assert.equal(t[3], 0); assert.equal(t[(W - 1) * 4 + 3], 255); assert.equal(t[(W - 1) * 4], 0xb5);
  const d = duotone(p, W, H, { dark: '#000080', light: '#ffff00' }); assert.equal(d[2], 0); assert.equal(d[(W - 1) * 4 + 2], 128);
  assert.equal(darkness([0, 0, 0, 0], 0), 0); assert.equal(darkness([0, 0, 0, 255], 0), 1);
});
