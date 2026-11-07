import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { indexSeparate } from '../src/lab-index-sep.js';
import { thinnest } from '../src/lab-filters.js';

const art = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><radialGradient id="s"><stop offset="0" stop-color="#fff6c8"/><stop offset=".4" stop-color="#ffb000"/><stop offset="1" stop-color="#d22630"/></radialGradient></defs>
  <circle cx="200" cy="140" r="120" fill="url(#s)"/><rect x="40" y="240" width="320" height="40" fill="#1fa3c8"/><rect x="60" y="250" width="80" height="20" fill="#f1e3c6"/></svg>`)).png().toBuffer();

test('simulated process on a dark shirt: index plates in print order, a choked white underbase, films, and the job sheet', async () => {
  const r = await indexSeparate(await art(), { widthIn: 4, garment: '#141416', inks: 6, dpi: 100, name: 'Sun' });
  assert.equal(r.width, 400); assert.ok(r.dark); assert.ok(r.underbase);
  assert.ok(r.plates.length >= 3 && r.plates.length <= 10, `${r.plates.length} plates`);
  assert.deepEqual(r.order.slice(0, 2), ['White underbase', 'Flash']);
  const last = r.plates[r.plates.length - 1]; if (r.plates.some(p => p.role === 'highlight white')) assert.equal(last.role, 'highlight white');
  assert.ok(r.plates.some(p => /^#1|^#2|^#0/.test(p.hex) || p.pantone), 'the blue is an ink');
  assert.ok(r.plates.reduce((t, p) => t + p.coverage, 0) <= 1);
  const f = await sharp(r.plates[0].film).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < f.data.length; i += 97) assert.ok(f.data[i] === 0 || f.data[i] === 255, 'a film is black or white, no greys');
  assert.ok(r.files.some(x => /00-underbase-white\.png$/.test(x.name)) && r.files.some(x => /job\.txt$/.test(x.name)));
});

test('on a white shirt there is no underbase, and it says spot colours may print cleaner', async () => {
  const r = await indexSeparate(await art(), { widthIn: 4, garment: '#ffffff', inks: 4, dpi: 60 });
  assert.equal(r.underbase, null); assert.ok(r.warnings.some(w => /light garment/.test(w)));
});

test('the thinnest line is measured across it, not along it', () => {
  const W = 120, H = 60, m = new Uint8Array(W * H);
  for (let y = 10; y < 14; y++) for (let x = 5; x < 115; x++) m[y * W + x] = 1; for (let y = 30; y < 50; y++) for (let x = 5; x < 115; x++) m[y * W + x] = 1;
  assert.ok(Math.abs(thinnest(m, W, H) - 4) < 1.2);
  const m2 = new Uint8Array(W * H); for (let y = 10; y < 22; y++) for (let x = 5; x < 115; x++) m2[y * W + x] = 1; assert.ok(Math.abs(thinnest(m2, W, H) - 12) < 1.5);
  assert.equal(thinnest(new Uint8Array(100), 10, 10), 0);
});
