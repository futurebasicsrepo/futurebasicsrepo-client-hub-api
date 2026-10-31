import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cleanPrint, printPrompt, fixturePrint, printName } from '../src/lab-prints.js';

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
test('a print request is cleaned', () => {
  assert.match(cleanPrint({}).error, /Choose how/);
  assert.match(cleanPrint({ mode: 'style', art: [A] }).error, /what the new print should show/);
  assert.match(cleanPrint({ mode: 'blend', art: [A, A] }).error, /two different/);
  const p = cleanPrint({ mode: 'blend', art: [A, B], mix: 140 }); assert.equal(p.mix, 100); assert.deepEqual(p.art, [A, B]);
  assert.deepEqual(cleanPrint({ mode: 'style', art: [A, B], subject: 'palms' }).art, [A]);
});

test('the words say what to keep and what to change', () => {
  const s = printPrompt(cleanPrint({ mode: 'style', art: [A], subject: 'palm leaves' }), ['Waves']);
  assert.match(s, /in the style of the reference \(Waves\)/); assert.match(s, /shows palm leaves/); assert.match(s, /edge to edge/);
  const b = printPrompt(cleanPrint({ mode: 'blend', art: [A, B], mix: 80, fill: false }), ['Waves', 'Checks']);
  assert.match(b, /mostly the second/); assert.match(b, /single graphic/);
  assert.equal(printName(cleanPrint({ mode: 'blend', art: [A, B] }), ['Waves', 'Checks']), 'Waves × Checks');
});

test('the stand-in draws a square print from one or two graphics', async () => {
  const red = await sharp({ create: { width: 300, height: 200, channels: 4, background: '#c8372d' } }).png().toBuffer();
  const blue = await sharp({ create: { width: 200, height: 200, channels: 4, background: '#1f3a5f' } }).png().toBuffer();
  for (const p of [cleanPrint({ mode: 'style', art: [A], subject: 'x' }), cleanPrint({ mode: 'blend', art: [A, B], mix: 50 })]) {
    const m = await sharp(await fixturePrint(p, [red, blue])).metadata(); assert.equal(m.width, 1024); assert.equal(m.height, 1024);
  }
});
