import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { hexToRgb, rgbToHsl, hslToRgb, productMask, recolorPlan, recolorPixels, renderColorways, mergeColorwayTiles } from '../src/colorway.js';

// A product on a white background: a mid-grey body with a volt stripe, plus a white "logo" hole inside the body.
async function scene({ stripe = true } = {}) {
  const w = 240, h = 160, rgb = Buffer.alloc(w * h * 3, 255);
  for (let y = 30; y < 130; y++) for (let x = 40; x < 200; x++) { const i = (y * w + x) * 3; const shade = 110 + Math.round(40 * (y - 30) / 100); rgb[i] = shade; rgb[i + 1] = shade; rgb[i + 2] = shade; }
  if (stripe) for (let y = 60; y < 80; y++) for (let x = 40; x < 200; x++) { const i = (y * w + x) * 3; rgb[i] = 198; rgb[i + 1] = 255; rgb[i + 2] = 0; }
  for (let y = 95; y < 110; y++) for (let x = 100; x < 140; x++) { const i = (y * w + x) * 3; rgb[i] = 255; rgb[i + 1] = 255; rgb[i + 2] = 255; }
  const png = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  return { w, h, rgb, dataUrl: `data:image/png;base64,${png.toString('base64')}` };
}
const at = (buf, w, x, y) => [buf[(y * w + x) * 3], buf[(y * w + x) * 3 + 1], buf[(y * w + x) * 3 + 2]];

test('colour helpers round-trip', () => {
  assert.deepEqual(hexToRgb('#c6ff00'), [198, 255, 0]); assert.equal(hexToRgb('red'), null);
  const [h, s, l] = rgbToHsl(198, 255, 0); assert.deepEqual(hslToRgb(h, s, l), [198, 255, 0]);
});

test('the mask keeps the product and a white hole inside it, drops the background', async () => {
  const { w, h, rgb } = await scene();
  const { mask, background } = productMask(rgb, w, h);
  assert.deepEqual(background, [255, 255, 255]);
  assert.equal(mask[5 * w + 5], 0, 'corner is background'); assert.equal(mask[50 * w + 120], 1, 'body is product'); assert.equal(mask[100 * w + 120], 1, 'white logo inside the body stays product');
});

test('a neutral body is recoloured whole; shading survives', async () => {
  const { w, h, rgb } = await scene({ stripe: false });
  const { mask } = productMask(rgb, w, h); const plan = recolorPlan(rgb, w, h, mask);
  assert.equal(plan.mode, 'body');
  const r = recolorPixels(rgb, w, h, mask, plan, '#d02020');
  const top = at(r.pixels, w, 120, 35), bottom = at(r.pixels, w, 120, 125), bg = at(r.pixels, w, 5, 5);
  assert.ok(top[0] > top[1] + 40 && top[0] > top[2] + 40, 'body turned red');
  assert.ok(rgbToHsl(...bottom)[2] > rgbToHsl(...top)[2], 'the lighter bottom stays lighter than the top');
  assert.deepEqual(bg, [255, 255, 255], 'background untouched');
});

test('a product with a clear accent recolours the accent only', async () => {
  const { w, h, rgb } = await scene();
  // make the stripe dominant enough to count as the accent
  for (let y = 30; y < 60; y++) for (let x = 40; x < 200; x++) { const i = (y * w + x) * 3; rgb[i] = 198; rgb[i + 1] = 255; rgb[i + 2] = 0; }
  const { mask } = productMask(rgb, w, h); const plan = recolorPlan(rgb, w, h, mask);
  assert.equal(plan.mode, 'accent');
  const r = recolorPixels(rgb, w, h, mask, plan, '#2040d0');
  const stripe = at(r.pixels, w, 120, 70), body = at(r.pixels, w, 120, 115);
  assert.ok(stripe[2] > stripe[0] + 60, 'volt stripe became blue');
  assert.ok(Math.abs(body[0] - body[1]) < 4 && Math.abs(body[1] - body[2]) < 4, 'grey body left alone');
});

test('renderColorways makes one JPEG tile per valid swatch, and the merge keeps uploads', async () => {
  const { dataUrl } = await scene({ stripe: false });
  const tiles = await renderColorways(dataUrl, [{ name: 'Bone', swatch: '#eae6dc' }, { name: 'Volt', swatch: '#c6ff00' }, { name: 'Broken', swatch: 'nope' }, { name: 'Volt', swatch: '#c6ff00' }], { max: 240 });
  assert.deepEqual(tiles.map(t => t.id), ['cw-bone', 'cw-volt']);
  assert.ok(tiles.every(t => /^data:image\/jpeg;base64,/.test(t.image) && t.recolored > 1000));
  const merged = mergeColorwayTiles([{ id: 'rend-abc', name: 'Studio render', note: '', image: 'data:image/png;base64,AAAA' }, { id: 'cw-old', name: 'Colourway — Old', note: '', image: 'x' }], tiles);
  assert.deepEqual(merged.map(r => r.id), ['rend-abc', 'cw-bone', 'cw-volt']);
  assert.match(merged[1].note, /concept visual/);
  assert.deepEqual(await renderColorways('not a data url', [{ name: 'X', swatch: '#000000' }]), []);
});

test('a cream product on a near-white backdrop is still found, and panels recolour on their own', async () => {
  // cream body (238,233,227) on (242,242,240) with a soft 1px outline and a darker print panel
  const w = 240, h = 160, rgb = Buffer.alloc(w * h * 3);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = 242; rgb[k * 3 + 1] = 242; rgb[k * 3 + 2] = 240; }
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 3; rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; } };
  fill(39, 29, 201, 131, [222, 218, 212]); fill(40, 30, 200, 130, [238, 233, 227]);
  fill(80, 50, 160, 90, [150, 120, 120]);
  const { mask } = productMask(rgb, w, h);
  assert.equal(mask[5 * w + 5], 0, 'corner is background');
  assert.equal(mask[100 * w + 60], 1, 'cream body is product, not backdrop');
  const png = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const tiles = await renderColorways(`data:image/png;base64,${png.toString('base64')}`, [{ name: 'Olive', swatch: '#556b2f' }]);
  const olive = tiles.find(t => t.id === 'cw-olive'); assert.equal(olive.mode, 'panels');
  const { data } = await sharp(Buffer.from(olive.image.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
  const body = at(data, w, 60, 100), print = at(data, w, 120, 70), bg = at(data, w, 5, 5);
  assert.ok(body[1] > body[2] + 15, 'body turned olive');
  assert.ok(Math.abs(rgbToHsl(...print)[2] - rgbToHsl(...body)[2]) > 0.06, 'the print stays its own panel, not painted flat into the body');
  assert.ok(Math.min(...bg) > 230, 'backdrop untouched');
});
