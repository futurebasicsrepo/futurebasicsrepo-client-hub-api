import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cleanArt, artColours, printCheck, graphicCrop } from '../src/art.js';

// black lettering-like bars on white, soft edges from a blur
const lettering = async (bg = '#ffffff', ink = '#000000', w = 600, h = 300) => sharp({ create: { width: w, height: h, channels: 3, background: bg } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="60" y="80" width="90" height="140" fill="${ink}"/><rect x="190" y="60" width="60" height="180" fill="${ink}"/><rect x="290" y="110" width="250" height="70" rx="30" fill="${ink}"/></svg>`) }]).png().toBuffer();

test('a graphic on a plain background comes out on a transparent one, trimmed, and the ink survives', async () => {
  const c = await cleanArt(await lettering());
  assert.equal(c.changed, true); assert.equal(c.background, '#ffffff');
  const { data, info } = await sharp(c.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(info.width < 600 && info.height < 300, 'trimmed to the graphic');
  assert.equal(data[3], 0, 'the corner is clear');
  let ink = 0, solid = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 250) { solid++; if (data[i] < 20 && data[i + 1] < 20) ink++; }
  assert.ok(solid > 1000 && ink / solid > 0.98, 'the ink is still black');
});
test('white lettering on a dark ground is cleaned the same way', async () => {
  const c = await cleanArt(await lettering('#111111', '#ffffff')); assert.equal(c.changed, true); assert.equal(c.background, '#111111');
  const cols = await artColours(c.png); assert.ok(cols[0].hex === '#ffffff' || cols[0].hex.startsWith('#f'), cols[0].hex);
});
test('a busy background is left alone rather than guessed at', async () => {
  const noise = Buffer.alloc(300 * 300 * 3); for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761 >>> 0) & 255;
  const c = await cleanArt(await sharp(noise, { raw: { width: 300, height: 300, channels: 3 } }).png().toBuffer());
  assert.equal(c.changed, false); assert.equal(c.background, null);
});
test('a graphic that already has transparency is not touched', async () => {
  const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30" fill="#e53935"/></svg>') }]).png().toBuffer();
  const c = await cleanArt(png); assert.equal(c.changed, false); assert.equal(c.background, 'transparent');
});
test('the inks are named and matched to Pantone C chips, largest first', async () => {
  const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="140" height="200" fill="#c8102e"/><rect x="140" width="60" height="200" fill="#003087"/></svg>') }]).png().toBuffer();
  const cols = await artColours(png); assert.equal(cols.length, 2);
  assert.ok(cols[0].share > cols[1].share && /^#[0-9a-f]{6}$/.test(cols[0].hex)); assert.ok(/^PANTONE .+ C$/.test(cols[0].code), cols[0].code);
});
test('the print check says what size a file holds up to', () => {
  const ok = printCheck({ widthPx: 2400, heightPx: 1200, widthIn: 4 }); assert.equal(ok.level, 'ok'); assert.equal(ok.dpi, 600); assert.match(ok.message, /up to 8 in wide/);
  const low = printCheck({ widthPx: 900, heightPx: 400, widthIn: 4 }); assert.equal(low.level, 'low'); assert.equal(low.dpi, 225); assert.match(low.message, /holds up to 3 in wide/);
  const poor = printCheck({ widthPx: 400, heightPx: 200, widthIn: 4 }); assert.equal(poor.level, 'poor'); assert.match(poor.message, /vector/);
  assert.equal(printCheck({ widthPx: 600, heightPx: 300, widthIn: 0 }).widthIn, 4);
});
test('a graphic found on a product is cropped out; a missing, tiny or whole-picture box is not', async () => {
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#cccccc' } }).png().toBuffer();
  const c = await graphicCrop(photo, { present: true, box: { x: 0.3, y: 0.3, w: 0.3, h: 0.2 } }); assert.ok(c && c.width > 200 && /^data:image\/png;base64,/.test(c.image));
  assert.equal(await graphicCrop(photo, { present: false }), null); assert.equal(await graphicCrop(photo, null), null);
  assert.equal(await graphicCrop(photo, { present: true, box: { x: 0.1, y: 0.1, w: 0.02, h: 0.02 } }), null);
  assert.equal(await graphicCrop(photo, { present: true, box: { x: 0, y: 0, w: 1, h: 1 } }), null);
});
