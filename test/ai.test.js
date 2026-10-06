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
  bom: [{ component: 'Upper', material: 'Mesh', spec: '260 gsm', color: 'Grey #b8bcc0', placement: '' }, { component: 'Outsole', material: 'Rubber', spec: 'Shore A 55', color: 'White #ffffff', placement: 'Sole unit' }],
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
  assert.deepEqual(pack.bom.map(r => r.color), ['Grey #b8bcc0', 'White #ffffff'], 'each part keeps the colour the draft saw on it');
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
    for (const [lang, prefix] of [['es', 'ES: '], ['pt', 'PT: '], ['it', 'IT: ']]) assert.deepEqual((await translateStrings(['Heel wrap'], { lang })).map, { 'Heel wrap': `${prefix}Heel wrap` }, `${lang} is supported`);
    const { TRANSLATION_LANGS, LANG_LABELS } = await import('../src/ai.js');
    assert.deepEqual(TRANSLATION_LANGS, ['zh', 'es', 'pt', 'it']);
    assert.deepEqual(Object.keys(LANG_LABELS), TRANSLATION_LANGS);
    assert.equal(LANG_LABELS.pt.label, 'Portuguese');
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

test('callout coordinates survive every answer shape, and a draft without positions gets them placed', async () => {
  const { normalizeCallout, unplacedCallouts, draftFromPhotos } = await import('../src/ai.js');
  assert.deepEqual([normalizeCallout({ label: 'A', x: '0.4', y: '0.6' }).x, normalizeCallout({ label: 'A', x: 40, y: 60 }).y], [0.4, 0.6], 'strings and percentages');
  assert.deepEqual([normalizeCallout({ label: 'B', position: { x: 0.2, y: 0.3 } }).x, normalizeCallout({ label: 'B', position: [0.7, 0.8] }).y], [0.2, 0.8], 'nested positions');
  const none = normalizeCallout({ label: 'C', spec: 'x' }); assert.equal(none.x, null, 'missing stays missing, never 0');
  assert.equal(unplacedCallouts([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]), true, 'stacked pins count as unplaced');
  assert.equal(unplacedCallouts([{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }, { x: null, y: null }]), false);
  // the fixture draft is written by the test itself, so it runs anywhere
  const { writeFileSync, mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const fixture = join(mkdtempSync(join(tmpdir(), 'fb-ai-')), 'draft.json');
  writeFileSync(fixture, JSON.stringify({ ...draft, callouts: ['Heel wrap', 'Tongue', 'Lacing', 'Window', 'Perforations', 'Toe bumper', 'Midsole', 'Pod'].map((label, i) => ({ label, spec: 's', note: '', x: 0.1 + i * 0.1, y: 0.5 })) }));
  const prev = process.env.AI_FIXTURE;
  try {
    const noisy = `data:image/png;base64,${(await sharp({ create: { width: 300, height: 200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer()).toString('base64')}`;
    process.env.AI_FIXTURE = fixture;
    const { draft: d } = await draftFromPhotos({ photos: [noisy], title: 'Runner [noxy]', notes: '', pomTemplate: [], sizes: ['9', '10'], sampleSize: '10' });
    const pts = new Set(d.callouts.map(c => `${c.x?.toFixed(2)},${c.y?.toFixed(2)}`));
    assert.ok(d.callouts.every(c => c.x != null && c.y != null) && pts.size === d.callouts.length, `all ${d.callouts.length} callouts placed at distinct points`);
    const pack = normalizeTechPack(await applyDraftToPack(normalizeTechPack({ ...seedTechPack({ product: { title: 'Runner', product_type: 'Footwear' } }), sketches: [{ id: 's', view: 'front', label: '', image: noisy, callouts: [] }] }), { ...d, callouts: d.callouts.map(c => ({ ...c, x: null, y: null })) }, { photos: [noisy], sizes: ['9', '10'], sampleSize: '10', model: 't' }));
    assert.ok(pack.sketches[0].callouts.every(c => c.x == null && c.photo === ''), 'unplaced callouts carry no position and no crop');
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; }
});

test('mergeClientEdits unpins leftover corner callouts (0,0 with no crop) instead of keeping them stacked', async () => {
  const { mergeClientEdits } = await import('../src/techpack.js');
  const orig = normalizeTechPack({ ...seedTechPack({ product: { title: 'Boot', product_type: 'Footwear' } }), sketches: [{ id: 'p', view: 'front', label: '', image: 'data:image/jpeg;base64,AAAA', callouts: [] }] });
  const current = structuredClone(orig); current.sketches[0].callouts = [{ n: 1, label: 'Outsole', spec: '', note: '', photo: '', x: 0, y: 0 }, { n: 2, label: 'Real corner pin', spec: '', note: '', photo: 'data:image/jpeg;base64,BBBB', x: 0, y: 0 }];
  const drafted = structuredClone(orig); drafted.sketches[0].callouts = [{ n: 1, label: 'Collar', spec: '', note: '', photo: '', x: 0.3, y: 0.2 }];
  const m = mergeClientEdits(orig, current, drafted).sketches[0].callouts;
  assert.deepEqual(m.map(c => [c.label, c.x, c.y]), [['Outsole', null, null], ['Real corner pin', 0, 0], ['Collar', 0.3, 0.2]]);
});

test('inches reads numbers in any of the forms a model or a listing writes them', async () => {
  const { inches } = await import('../src/ai.js');
  assert.equal(inches(11.5), 11.5); assert.equal(inches('11.5'), 11.5); assert.equal(inches('11.5 in'), 11.5); assert.equal(inches('11 1/2"'), 11.5);
  assert.equal(inches('2.54 cm'), 1); assert.equal(inches('254 mm'), 10); assert.equal(inches(''), null); assert.equal(inches('n/a'), null); assert.equal(inches(null), null);
});

test('completeMeasurements researches the rows the draft left blank and proposes rows when no template fits', async () => {
  const { completeMeasurements, missingMeasurements } = await import('../src/ai.js');
  const { writeFileSync, mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const fixture = join(mkdtempSync(join(tmpdir(), 'fb-ai-')), 'draft.json'); writeFileSync(fixture, JSON.stringify(draft));
  const prev = process.env.AI_FIXTURE; process.env.AI_FIXTURE = fixture;
  try {
    const img = await photo();
    const template = [{ code: 'A', name: 'Outsole length', how: 'toe to heel' }, { code: 'B', name: 'Forefoot width', how: 'ball' }, { code: 'C', name: 'Heel width', how: 'heel' }];
    const d1 = { pom: [{ code: 'A', sample: 11.5, step: 0.33, basis: 'photo' }, { code: 'C', sample: 'n/a', step: 0, basis: '' }] };
    assert.deepEqual(missingMeasurements(d1, template).missing.map(r => r.code), ['B', 'C'], 'a row with no usable number counts as missing');
    const rs = await completeMeasurements(d1, { photo: img, pomTemplate: template, product: { title: 'Runner' }, sizes: ['9', '10'], sampleSize: '10' });
    assert.deepEqual(rs.filled, ['B', 'C']); assert.deepEqual(rs.stillMissing, []); assert.equal(rs.proposed, false);
    assert.ok(d1.pom.filter(r => r.researched).every(r => /example\.com/.test(r.basis)), 'researched rows carry their sources in the basis');
    const done = { pom: [{ code: 'A', sample: 1 }, { code: 'B', sample: 2 }, { code: 'C', sample: 3 }] };
    assert.equal(await completeMeasurements(done, { photo: img, pomTemplate: template, sizes: ['10'], sampleSize: '10' }), null, 'nothing to research when every row has a value');
    // no template and the model answered with bare codes (no names): those cannot become rows, so rows are proposed instead
    const d2 = { pom: [{ code: 'A', sample: 5, step: 0, basis: 'x' }, { code: 'B', sample: 6, step: 0, basis: 'x' }, { code: 'C', sample: 7, step: 0, basis: 'x' }, { code: 'D', sample: 8, step: 0, basis: 'x' }] };
    const rs2 = await completeMeasurements(d2, { photo: img, pomTemplate: [], product: { title: 'Thing' }, sizes: ['One size'], sampleSize: 'One size' });
    assert.equal(rs2.proposed, true); assert.deepEqual(rs2.filled, ['A', 'B', 'C']); assert.ok(d2.pom.filter(r => r.researched).every(r => r.name && r.how), 'proposed rows are named so they can become table rows');
    const pack2 = normalizeTechPack(await applyDraftToPack(normalizeTechPack({ ...seedTechPack({ product: { title: 'Thing', product_type: 'Other' } }), sketches: [{ id: 'p', view: 'front', label: '', image: img, callouts: [] }] }), { ...draft, ...d2 }, { photos: [img], sizes: ['One size'], sampleSize: 'One size', model: 't' }));
    assert.deepEqual(pack2.pom.map(r => [r.code, r.values['One size']]), [['A', '10.00'], ['B', '11.00'], ['C', '12.00']], 'the researched, named rows become the table; bare codes do not');
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; }
});

test('applyDraftToPack appends proposed measurement rows and writes the research into the notes', async () => {
  const img = await photo();
  const seed = normalizeTechPack({ ...seedTechPack({ product: { title: 'Desk tray', product_type: 'Accessory' } }), sketches: [{ id: 'p', view: 'front', label: '', image: img, callouts: [] }] });
  assert.equal(seed.pom.length, 0, 'accessories have no template');
  const d = { ...draft, pom: [{ code: 'A', name: 'Length', how: 'Longest edge', tolerance: '±0.25', sample: '12 in', step: 0, basis: 'photo', researched: false }, { code: 'B', name: 'Width', how: 'Shortest edge', tolerance: '', sample: 8, step: 0, basis: 'Listed on a comparable [https://example.com/x]', researched: true }, { code: 'Q', name: '', how: '', tolerance: '', sample: 3, step: 0, basis: 'unnamed, dropped' }],
    pomResearch: { identified: 'Leather valet tray', comparables: [{ name: 'Store listing', url: 'https://example.com/x', what: '12 × 8 in' }], consulted: [], requested: [], proposed: true, filled: ['B'], stillMissing: [], notes: 'Confirm depth.', model: 't' } };
  const pack = normalizeTechPack(await applyDraftToPack(seed, d, { photos: [img], sizes: seed.sizes, sampleSize: seed.style.sampleSize, model: 't' }));
  assert.deepEqual(pack.pom.map(r => r.code), ['A', 'B'], 'named rows are appended; unnamed unknown codes are not');
  assert.equal(pack.pom[0].values['One size'], '12.00'); assert.equal(pack.pom[1].tolerance, '±0.25', 'tolerance defaults when the model gave none');
  assert.match(pack.notes, /MEASUREMENT RESEARCH/); assert.match(pack.notes, /Leather valet tray/); assert.match(pack.notes, /https:\/\/example\.com\/x/); assert.match(pack.notes, /B \(researched\)/);
  const failed = normalizeTechPack(await applyDraftToPack(seed, { ...draft, pom: [], pomResearch: { error: 'network' } }, { photos: [img], sizes: seed.sizes, sampleSize: seed.style.sampleSize, model: 't' }));
  assert.match(failed.notes, /could not run \(network\)/);
});

test('bags get their own measurement template and a one-size run', async () => {
  const { pomTemplateFor } = await import('../src/techpack.js');
  assert.equal(pomTemplateFor('Canvas tote bag').map(r => r[0]).join(''), 'ABCDEF');
  const pack = seedTechPack({ product: { title: 'Weekender duffle', product_type: 'Bag' } });
  assert.deepEqual(pack.sizes, ['One size']); assert.equal(pack.pom[3].name, 'Handle drop'); assert.match(pack.labels[0].placement, /Inside body/);
  assert.equal(pomTemplateFor('Sleeping bag liner hoodie').length, 6, 'bag wins when both words appear'); assert.equal(pomTemplateFor('Baggy jeans').map(r => r[1])[4], 'Inseam', '"baggy" is not a bag');
});

test('a brief-only draft carries the same shape, unpinned callouts and low confidence', async () => {
  const { draftFromBrief } = await import('../src/ai.js');
  const { writeFileSync, mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const fixture = join(mkdtempSync(join(tmpdir(), 'fb-ai-')), 'draft.json');
  writeFileSync(fixture, JSON.stringify({ ...draft, confidence: 'high', callouts: ['Collar', 'Cuff', 'Hem', 'Shoulder', 'Side seam'].map((label, i) => ({ label, spec: 's', note: '', x: 0.1 + i * 0.1, y: 0.5 })) }));
  const prev = process.env.AI_FIXTURE;
  try {
    process.env.AI_FIXTURE = fixture;
    const { draft: d, model } = await draftFromBrief({ title: 'Box tee', notes: 'heavyweight', brief: 'Objective: merch for a tour', pomTemplate: [], sizes: ['S', 'M', 'L'], sampleSize: 'M' });
    assert.equal(model, 'fixture');
    assert.equal(d.callouts.length, 5); assert.ok(d.callouts.every(c => c.x == null && c.y == null), 'no positions without a photo');
    assert.equal(d.confidence, 'low'); assert.ok(d.pom.length >= 1 && d.bom.length >= 1);
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; }
});

test('mergeClientEdits on a re-run: the new draft replaces the earlier draft, and only what the client changed since is kept', async () => {
  const { mergeClientEdits } = await import('../src/techpack.js');
  const base = normalizeTechPack({ ...seedTechPack({ product: { title: 'Modern Oxford', product_type: 'Footwear' } }), sketches: [{ id: 'photo-1', view: 'front', label: 'Reference photo', image: 'data:image/jpeg;base64,AAAA', callouts: [] }] });
  const sample = base.style.sampleSize;
  // the earlier assistant draft (what the snapshot holds): two callouts, a bad heel width, generated tiles
  const v1 = structuredClone(base); v1.style.description = 'first draft';
  v1.sketches[0].callouts = [{ n: 1, label: 'Heel cut-out', spec: 'old spec', note: '', photo: '', x: 0.2, y: 0.8 }, { n: 2, label: 'Toe puff', spec: 'old puff', note: '', photo: '', x: 0.9, y: 0.6 }];
  v1.pom = v1.pom.map((r, i) => ({ ...r, values: Object.fromEntries(v1.sizes.map(s => [s, i === 2 ? '0.55' : '9.00'])) }));
  // the live pack: the v1 draft plus the pictures it made, and one thing the client did since (a typed cell and their own callout)
  const current = structuredClone(v1); current.renderings = [{ id: 'cutout-white', name: 'Cut-out on white', note: '', image: 'data:image/jpeg;base64,BBBB' }, { id: 'cw-red', name: 'Colourway red', note: '', image: 'data:image/jpeg;base64,CCCC' }, { id: 'rend-mine', name: 'Their render', note: '', image: 'data:image/jpeg;base64,DDDD' }];
  current.pom[0].values[sample] = '12.50'; current.sketches[0].callouts.push({ n: 3, label: 'Our logo', spec: '', note: 'embroidered', photo: '', x: 0.5, y: 0.5 });
  // the new draft: corrected heel width, new callouts (one shares a label with an old one), fresh tiles
  const v2 = structuredClone(base); v2.style.description = 'second draft';
  v2.sketches[0].callouts = [{ n: 1, label: 'Heel cut-out', spec: 'new spec', note: '', photo: '', x: 0.2, y: 0.8 }, { n: 2, label: 'Toe puff', spec: 'new puff', note: '', photo: '', x: 0.9, y: 0.6 }];
  v2.pom = v2.pom.map((r, i) => ({ ...r, values: Object.fromEntries(v2.sizes.map(s => [s, i === 2 ? '3.10' : '9.50'])) }));
  v2.renderings = [{ id: 'cutout-white', name: 'Cut-out on white', note: '', image: 'data:image/jpeg;base64,EEEE' }, { id: 'cw-blue', name: 'Colourway blue', note: '', image: 'data:image/jpeg;base64,FFFF' }];
  const merged = mergeClientEdits(v1, current, v2);
  assert.equal(merged.style.description, 'second draft', 'untouched fields come from the new draft');
  assert.equal(merged.pom[2].values[sample], '3.10', 'the corrected heel width replaces the old assistant value');
  assert.equal(merged.pom[1].values[sample], '9.50', 'other assistant values are refreshed too');
  assert.equal(merged.pom[0].values[sample], '12.50', 'but a cell the client typed since the earlier draft stays');
  assert.deepEqual(merged.sketches[0].callouts.map(c => `${c.n}:${c.label}:${c.spec}`), ['1:Our logo:', '2:Heel cut-out:new spec', '3:Toe puff:new puff'], 'their callout first, the new draft once, nothing doubled');
  assert.deepEqual(merged.renderings.map(r => r.id), ['rend-mine', 'cutout-white', 'cw-blue'], 'their own render stays; generated pictures come from the new run');
  assert.equal(merged.renderings.find(r => r.id === 'cutout-white').image.slice(-4), 'EEEE');
  // a callout the client edited keeps their wording and is not repeated by the new draft's same-label callout
  const edited = structuredClone(current); edited.sketches[0].callouts[0].spec = 'my wording';
  const again = mergeClientEdits(v1, edited, v2);
  assert.deepEqual(again.sketches[0].callouts.map(c => `${c.label}:${c.spec}`), ['Heel cut-out:my wording', 'Our logo:', 'Toe puff:new puff']);
});
