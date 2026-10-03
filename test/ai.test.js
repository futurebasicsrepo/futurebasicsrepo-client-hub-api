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

test('packStrings collects every human-written string once and skips codes and numbers', async () => {
  const { packStrings } = await import('../src/techpack.js');
  const pack = normalizeTechPack({ style: { styleName: 'Layer Runner', category: 'Footwear', description: 'A runner.', season: 'FW26', sampleSize: '10' },
    sketches: [{ id: 's1', view: 'front', label: 'Reference photo', image: '', callouts: [{ n: 1, label: 'Heel wrap', spec: 'TPU 1.5 mm', note: '', x: 0.1, y: 0.1 }, { n: 2, label: 'Heel wrap', spec: '', note: 'Bond + stitch', x: 0.2, y: 0.2 }] }],
    pom: [{ code: 'A', name: 'Outsole length', how: 'Toe to heel', tolerance: '±0.125', values: { 10: '11.5' } }],
    bom: [{ component: 'Upper', material: 'Mesh', spec: '260 gsm', supplier: 'TBD', ref: 'X-1', color: '', placement: '', qty: '1', unit: 'pair', notes: '' }],
    colorways: [{ name: 'Grey', code: '15-4101 TCX', swatch: '#999999', notes: '' }], notes: 'Sample first.' });
  const strings = packStrings(pack);
  assert.ok(strings.includes('Layer Runner') && strings.includes('Heel wrap') && strings.includes('Bond + stitch') && strings.includes('Outsole length') && strings.includes('Sample first.'));
  assert.equal(strings.filter(s => s === 'Heel wrap').length, 1, 'deduplicated');
  assert.ok(!strings.includes('FW26') && !strings.includes('10') && !strings.includes('±0.125') && !strings.includes('X-1') && !strings.includes('15-4101 TCX'), 'codes and numbers are not sent for translation');
  assert.ok(strings.includes('pair') && strings.includes('TBD'), 'short words still travel');
});

test('translateStrings uses the fixture path without a key and maps every source string', async () => {
  const { translateStrings } = await import('../src/ai.js');
  const prev = process.env.AI_FIXTURE; process.env.AI_FIXTURE = process.env.AI_FIXTURE || 'fixture';
  try {
    const { map, model } = await translateStrings(['Heel wrap', ' Heel wrap ', 'Outsole length', ''], { lang: 'zh' });
    assert.equal(model, 'fixture');
    assert.deepEqual(map, { 'Heel wrap': '中文：Heel wrap', 'Outsole length': '中文：Outsole length' });
    await assert.rejects(translateStrings(['x'], { lang: 'fr' }), /Unsupported language/);
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; }
});

test('mergeClientEdits keeps what the client typed while the assistant was reading, and adds the draft around it', async () => {
  const { mergeClientEdits } = await import('../src/techpack.js');
  const orig = normalizeTechPack({ ...seedTechPack({ product: { title: 'Layer runner', product_type: 'Footwear' } }), sketches: [{ id: 'photo-1', view: 'front', label: 'Reference photo', image: 'data:image/jpeg;base64,AAAA', callouts: [] }] });
  const current = structuredClone(orig);
  current.style.styleName = 'Cloud Runner'; current.style.description = 'Our take on a chunky runner.';
  current.sketches[0].callouts.push({ n: 1, label: 'Our logo here', spec: '', note: 'embroidered', photo: '', x: 0.5, y: 0.5 });
  current.pom[0].values[current.style.sampleSize] = '12.00';
  const drafted = structuredClone(orig);
  drafted.style = { ...drafted.style, styleName: 'Layer Runner', description: 'Chunky lifestyle runner.', category: 'Footwear — chunky runner' };
  drafted.sketches[0].callouts = [{ n: 1, label: 'Heel wrap', spec: 'TPU', note: '', photo: '', x: 0.2, y: 0.3 }, { n: 2, label: 'Toe bumper', spec: 'Rubber', note: '', photo: '', x: 0.9, y: 0.6 }];
  drafted.pom = drafted.pom.map((r, i) => ({ ...r, values: Object.fromEntries(drafted.sizes.map(s => [s, i === 0 ? '11.50' : '3.00'])) }));
  drafted.bom = [{ component: 'Upper', material: 'Mesh', spec: '', supplier: 'TBD', ref: '', color: '', placement: '', qty: '1', unit: 'pair', notes: '' }];
  drafted.notes = 'AI DRAFT — assumptions.';
  const merged = mergeClientEdits(orig, current, drafted);
  assert.equal(merged.style.styleName, 'Cloud Runner', 'client name wins');
  assert.equal(merged.style.description, 'Our take on a chunky runner.');
  assert.equal(merged.style.category, 'Footwear — chunky runner', 'untouched fields come from the draft');
  assert.deepEqual(merged.sketches[0].callouts.map(c => [c.n, c.label]), [[1, 'Our logo here'], [2, 'Heel wrap'], [3, 'Toe bumper']], 'client callout first, assistant appended and renumbered');
  assert.equal(merged.pom[0].values[orig.style.sampleSize], '12.00', 'typed measurement wins');
  assert.equal(merged.pom[1].values[orig.style.sampleSize], '3.00', 'other cells filled by the draft');
  assert.equal(merged.bom[0].component, 'Upper');
  assert.equal(mergeClientEdits(orig, orig, drafted).style.styleName, 'Layer Runner', 'untouched pack takes the draft whole');
});

test('locateProduct (fixture) rejects a blank image and crops a real one', async () => {
  const { locateProduct, cropToBox, draftLooksEmpty } = await import('../src/ai.js');
  const prev = process.env.AI_FIXTURE; process.env.AI_FIXTURE = process.env.AI_FIXTURE || 'fixture';
  try {
    const blank = await photo();
    const where = await locateProduct(blank); assert.equal(where.found, false);
    const noisy = `data:image/png;base64,${(await sharp({ create: { width: 300, height: 200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer()).toString('base64')}`;
    const found = await locateProduct(noisy); assert.equal(found.found, true);
    const crop = await cropToBox(noisy, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    assert.ok(crop.image.startsWith('data:image/jpeg;base64,') && crop.coverage > 0.3 && crop.coverage < 0.6, `crop covers the box plus padding (${crop.coverage.toFixed(2)})`);
    const full = await cropToBox(noisy, { x: 0.4, y: 0.4, w: 0.05, h: 0.05 }); assert.equal(full.coverage, 1, 'degenerate box falls back to the full image');
    assert.equal(draftLooksEmpty({ callouts: [], pom: [], bom: [] }), true); assert.equal(draftLooksEmpty({ callouts: [{ label: 'a' }, { label: 'b' }, { label: 'c' }], pom: [], bom: [] }), false);
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; }
});
