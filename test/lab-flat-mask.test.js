import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { bodyMask } from '../src/lab-flat-mask.js';

// a pair of trousers drawn the way some of the sketches are: the legs outlined but not filled, and the gap between them filled white
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <path d="M50 20 H150 V180 H110 L100 70 L90 180 H50 Z" fill="none" stroke="#111111" stroke-width="2"/>
  <path d="M91 180 L100 72 L109 180 Z" fill="#ffffff" stroke="none"/>
  <path d="M60 100 Q70 120 64 140" fill="none" stroke="#cccccc" stroke-width="1"/>
</svg>`;

test('the silhouette: the panels the lines enclose, not the space between the legs or around the piece', async () => {
  const png = await bodyMask(svg, { width: 400 });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => data[(Math.round(y * info.height / 200) * info.width + Math.round(x * info.width / 200)) * 4 + 3] > 128;
  assert.ok(at(70, 60) && at(130, 60) && at(70, 160) && at(130, 160), 'the legs are inside');
  assert.ok(at(100, 40), 'the seat above the fork is inside');
  assert.ok(!at(100, 170), 'the gap between the legs is outside, though the sketch fills it white');
  assert.ok(!at(20, 100) && !at(180, 100) && !at(100, 195), 'and so is everything around the piece');
  assert.ok(at(66, 120), 'a light fold line does not split the panel');
});
