import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sanitize, locateMarks } from '../src/lab-place.js';
import { composeBranding, ensureBranding } from '../src/lab-concepts.js';

const base = () => sharp({ create: { width: 800, height: 800, channels: 3, background: '#808080' } }).jpeg().toBuffer();
const marks = [{ id: 'logo', where: 'small mark on the left chest', w: 0.07 }];

test('the answer is kept inside the item, near the hinted size, at a gentle angle; anything else is dropped', () => {
  const item = { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 };
  const ok = sanitize({ item, marks: [{ id: 'logo', x: 0.6, y: 0.4, w: 0.9, angle: 80 }] }, marks).get('logo');
  assert.ok(ok.w <= 0.07 * 2.2 + 1e-9 && ok.angle === 35, 'a huge width and a wild angle are tamed');
  assert.equal(sanitize({ item, marks: [{ id: 'logo', x: 0.95, y: 0.4, w: 0.07, angle: 0 }] }, marks), null, 'a mark placed off the item is not used');
  assert.equal(sanitize({ item: { x0: 0.4, y0: 0.4, x1: 0.45, y1: 0.45 }, marks: [{ id: 'logo', x: 0.42, y: 0.42, w: 0.07, angle: 0 }] }, marks), null, 'a nonsense box is not trusted');
  assert.equal(sanitize({ item, marks: [] }, marks), null);
});

test('with no key, or when the model fails, nothing is found and the fixed positions are used', async () => {
  assert.equal(await locateMarks({ image: await base(), marks, env: {} }), null);
  assert.equal(await locateMarks({ image: await base(), marks, ask: async () => { throw new Error('down'); }, env: {} }), null);
  const m = await locateMarks({ image: await base(), marks, ask: async (sys, content) => { assert.match(content.at(-1).text, /left chest/); return { item: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 }, marks: [{ id: 'logo', x: 0.4, y: 0.3, w: 0.08, angle: -10 }] }; }, env: {} });
  assert.deepEqual(m.get('logo'), { x: 0.4, y: 0.3, w: 0.08, angle: -10 });
});

test('the logo is laid where it was found, not where the fixed spot is', async () => {
  const spec = ensureBranding({}, 'tops'), concept = { category: 'tops', spec };
  const where = async (buf, x0, y0, x1, y1) => (await sharp(await sharp(buf).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).toBuffer()).stats()).channels[0].stdev; // (stats() of an extract alone reads the whole picture)
  const fixed = await composeBranding(await base(), concept), found = await composeBranding(await base(), concept, { locate: async () => new Map([['logo', { x: 0.25, y: 0.55, w: 0.1, angle: 0 }]]) });
  assert.ok(await where(found, 140, 400, 260, 480) > 5, 'ink where it was found');
  assert.ok(await where(fixed, 140, 400, 260, 480) < 1, 'nothing there without it');
  assert.ok(await where(found, 440, 250, 540, 330) < 1, 'and nothing at the fixed spot');
});

test('a mark that must follow slanted cloth is turned', async () => {
  const concept = { category: 'tops', spec: ensureBranding({}, 'tops') }, loc = angle => async () => new Map([['logo', { x: 0.5, y: 0.5, w: 0.12, angle }]]);
  const flat = await composeBranding(await base(), concept, { locate: loc(0) }), turned = await composeBranding(await base(), concept, { locate: loc(25) });
  assert.notDeepEqual(await sharp(flat).raw().toBuffer(), await sharp(turned).raw().toBuffer());
});
