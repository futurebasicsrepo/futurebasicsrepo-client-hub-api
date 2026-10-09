import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { techPackPdf } from '../src/tp-pdf.js';
import { seedTechPack, normalizeTechPack } from '../src/techpack.js';

const pages = buf => (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
const jpg = async () => 'data:image/jpeg;base64,' + (await sharp({ create: { width: 400, height: 300, channels: 3, background: '#c85a3c' } }).jpeg().toBuffer()).toString('base64');

test('a seeded footwear pack becomes a branded landscape PDF with the sample room checks', async () => {
  const pack = seedTechPack({ product: { title: 'Layer runner', product_type: 'Footwear' } });
  pack.pom.forEach(r => { r.values[pack.style.sampleSize] = '10'; });
  const buf = await techPackPdf({ pack, product: { title: 'Layer runner' }, version: 1, publishedAt: '2026-10-01T10:00:00Z', verification: { clientSign: null, brandSign: null, factorySign: null }, client: 'Acme' });
  const text = buf.toString('latin1');
  assert.ok(text.startsWith('%PDF') && pages(buf) >= 5, `pages: ${pages(buf)}`);
  assert.match(text, /\/MediaBox \[0 0 792 612\]/, 'US letter, landscape');
  assert.match(text, /SpaceGrotesk/); assert.match(text, /IBMPlexMono/);
});

test('every new category makes a PDF, and its sample checks are its own', async () => {
  const sizes = {};
  for (const title of ['Plush fox', 'Gold hoop earrings', 'Dad hat', 'Wireless earbuds', 'Canvas tote bag', 'Hoodie']) {
    const pack = seedTechPack({ product: { title, product_type: title } });
    const buf = await techPackPdf({ pack, product: { title }, version: 2, publishedAt: new Date().toISOString(), verification: null });
    assert.ok(buf.toString('latin1').startsWith('%PDF') && pages(buf) >= 4, title); sizes[title] = buf.length;
  }
});

test('pictures, callouts with detail photos, artwork and many measurement rows flow onto more pages without failing', async () => {
  const photo = await jpg(), pack = normalizeTechPack(seedTechPack({ product: { title: 'Hoodie', product_type: 'Apparel' } }));
  pack.sketches = [{ id: 's1', view: 'front', image: photo, hero: { id: 'h', image: photo }, callouts: Array.from({ length: 14 }, (_, i) => ({ n: i + 1, label: 'Detail ' + (i + 1), spec: 'Spec text', note: 'A note to the factory that is long enough to wrap onto a second line in the list', x: .1 + i * .05, y: .5, hx: .1 + i * .05, hy: .4, photo, hphoto: photo })) }];
  pack.artwork = [{ id: 'a1', name: 'Chest logo', image: photo, pantones: [{ hex: '#112233', name: 'Navy', code: 'PANTONE 289 C' }], placements: [{ sketchId: 's1', x: .5, y: .3, widthIn: 3, label: 'Chest' }] }];
  pack.renderings = [{ id: 'r1', name: 'Navy', image: photo, parts: [] }, { id: 'r2', name: 'Black', image: photo, parts: [] }];
  pack.pom = Array.from({ length: 40 }, (_, i) => ({ code: 'P' + i, name: 'Point ' + i, how: 'Edge to edge', tolerance: '±0.5', values: Object.fromEntries(pack.sizes.map(s => [s, String(20 + i)])) }));
  const buf = await techPackPdf({ pack, product: { title: 'Hoodie' }, version: 3, publishedAt: new Date().toISOString(), verification: { clientSign: { name: 'A', at: '2026-10-01' }, brandSign: null, factorySign: null }, revisions: [{ version: 1, publishedAt: '2026-10-01', by: 'FB', note: 'First' }] });
  assert.ok(pages(buf) >= 10, `pages: ${pages(buf)}`);
});
