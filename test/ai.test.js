import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { applyDraftToPack, calloutCrop, productTypeLabel } from '../src/ai.js';
import { seedTechPack, normalizeTechPack } from '../src/techpack.js';

const photo = async () => `data:image/jpeg;base64,${(await sharp({ create: { width: 400, height: 300, channels: 3, background: '#cccccc' } }).jpeg().toBuffer()).toString('base64')}`;
const draft = {
  productType: 'footwear', category: 'Footwear — chunky runner', styleName: 'Layer Runner', description: 'A runner.', fabricSummary: 'Mesh · EVA', fitBlock: 'Runner last',
  callouts: [{ label: 'Heel wrap', spec: 'TPU', note: 'bond', x: 0.2, y: 0.3 }, { label: 'Toe bumper', spec: 'Rubber', note: '', x: 1.4, y: -0.2 }],
  pom: [{ code: 'A', sample: 11.5, step: 0.333, basis: 'size charts' }, { code: 'D', sample: 1.5, step: 0, basis: 'lab averages' }, { code: 'ZZ', sample: 9, step: 1, basis: 'ignored' }],
  bom: [{ component: 'Upper', material: 'Mesh', spec: '260 gsm', placement: '' }, { component: 'Outsole', material: 'Rubber', spec: 'Shore A 55', placement: 'Sole unit' }],
  construction: [{ area: 'Lasting', detail: 'Strobel' }],
  colorways: [{ name: 'Grey', hex: '#B8BCC0', pantone: '15-4101 TCX', role: 'upper', observed: true }, { name: 'Bad', hex: 'red', pantone: '', role: '', observed: false }],
  care: { fiber: 'Textile', instructions: 'Spot clean' }, notes: 'Open: colourway.', confidence: 'medium'
};

test('applyDraftToPack fills the seeded pack from the model draft', async () => {
  const img = await photo();
  const product = { title: 'Layer Runner', product_type: productTypeLabel(draft) };
  const seed = normalizeTechPack({ ...seedTechPack({ product }), sketches: [{ id: 'photo-1', view: 'front', label: 'Reference photo', image: img, callouts: [] }] });
  const sizes = seed.sizes, sampleSize = seed.style.sampleSize;
  const pack = normalizeTechPack(await applyDraftToPack(seed, draft, { photos: [img], sizes, sampleSize, model: 'test-model' }));
  assert.equal(pack.style.category, 'Footwear — chunky runner');
  assert.equal(pack.sketches[0].callouts.length, 2);
  assert.ok(pack.sketches[0].callouts[0].photo.startsWith('data:image/jpeg;base64,'), 'callout gets a detail crop');
  assert.deepEqual([pack.sketches[0].callouts[1].x, pack.sketches[0].callouts[1].y], [1, 0], 'coordinates are clamped to the photo');
  const A = pack.pom.find(r => r.code === 'A'), D = pack.pom.find(r => r.code === 'D');
  assert.equal(A.values[sampleSize], '11.50');
  const i = sizes.indexOf(sampleSize); assert.equal(A.values[sizes[i + 1]], (11.5 + 0.333).toFixed(2), 'graded by step');
  assert.ok(Object.values(D.values).every(v => v === '1.50'), 'zero step keeps the value flat');
  assert.ok(pack.pom.find(r => r.code === 'B').values[sampleSize] === '', 'codes the draft did not fill stay blank');
  assert.equal(pack.bom.length, 2); assert.equal(pack.bom[0].placement, 'Vamp, quarters, eyestay', 'placement falls back to the seed row');
  assert.equal(pack.colorways.length, 1, 'colourways with bad hex are dropped'); assert.equal(pack.colorways[0].swatch, '#b8bcc0');
  assert.match(pack.notes, /AI DRAFT/); assert.match(pack.notes, /MEASUREMENT BASIS/); assert.match(pack.notes, /Open: colourway/);
});

test('calloutCrop returns a 480px JPEG and tolerates edge positions', async () => {
  const img = await photo();
  for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5]]) {
    const crop = await calloutCrop(img, x, y); assert.ok(crop.startsWith('data:image/jpeg;base64,'));
    const meta = await sharp(Buffer.from(crop.split(',')[1], 'base64')).metadata(); assert.deepEqual([meta.width, meta.height], [480, 480]);
  }
  assert.equal(await calloutCrop('not-a-data-url', 0.5, 0.5), '');
});
