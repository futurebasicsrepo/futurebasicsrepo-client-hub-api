import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inkify, pictureOf, markUrl } from '../src/signatures.js';
import { normalizeVerification } from '../src/techpack.js';

// a made-up signature: a dark scribble on grey-white paper, as a phone photo of one would be
const scribble = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260"><rect width="600" height="260" fill="#ecebe6"/><path d="M40 200 C 90 40, 140 40, 160 180 S 260 60, 300 170 S 420 90, 560 120" stroke="#1a1a1a" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`)).png().toBuffer();

test('a signature on paper becomes blue ink on a clear background, cropped to the strokes', async () => {
  const ink = await inkify(await scribble());
  assert.ok(ink && ink.height <= 300 && ink.width > ink.height);
  const { data, info } = await sharp(ink.png).raw().toBuffer({ resolveWithObject: true }); assert.equal(info.channels, 4);
  let inked = 0, blue = 0, clear = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) { inked++; if (data[i + 2] > data[i] + 60 && data[i + 2] > data[i + 1] + 40) blue++; } if (data[i + 3] === 0) clear++; }
  assert.ok(inked > 200 && blue / inked > .95, 'the strokes are blue ink'); assert.ok(clear > info.width * info.height * .5, 'the paper is gone');
});

test('a blank picture has no signature; a picture comes as a data URL; a mark is served by its id only', async () => {
  assert.equal(await inkify(await sharp({ create: { width: 300, height: 120, channels: 3, background: '#ffffff' } }).png().toBuffer()), null);
  assert.equal(pictureOf('https://example.com/a.png'), null); assert.ok(pictureOf(`data:image/png;base64,${(await scribble()).toString('base64')}`));
  assert.equal(markUrl('nope'), null); assert.equal(markUrl('0d4f0a3e-8a7b-4f0e-9a51-2a1d6c3e9b10'), '/v1/public/signature-marks/0d4f0a3e-8a7b-4f0e-9a51-2a1d6c3e9b10');
});

test('a tech pack signature keeps the ink it was signed with', () => {
  const v = normalizeVerification({ version: 3, brandSign: { name: 'Demo Signer', at: '2026-11-06T12:00:00Z', by: 'demo@example.com', ink: '0d4f0a3e-8a7b-4f0e-9a51-2a1d6c3e9b10' }, clientSign: { name: 'A Client', ink: 'not-an-id' } }, 3);
  assert.equal(v.brandSign.ink, '0d4f0a3e-8a7b-4f0e-9a51-2a1d6c3e9b10'); assert.ok(!('ink' in v.clientSign));
});
