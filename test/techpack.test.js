import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTechPack, seedTechPack, techPackCompleteness, techPackReadiness, normalizeVerification, emptyVerification, publishedTechPackView, emptyTechPack, pomTemplateFor, calloutKey, DEFAULT_SIZES, FOOTWEAR_SIZES, mockupsComplete, cardFieldsFromPack, packHasContent } from '../src/techpack.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('normalizeTechPack returns a complete, bounded shape from garbage input', () => {
  const out = normalizeTechPack({ style: { styleName: 'X'.repeat(500), rogue: 'drop me' }, sizes: ['S', 'S', 'M', ''], pom: [{ code: 'A', name: 'Chest', values: { S: '18', M: '19', XL: '99' } }], sketches: [{ view: 'nope', image: 'javascript:alert(1)', callouts: [{ n: 3, label: 'Collar', x: 1.7, y: -2 }, { n: 1, note: '' }] }], bom: [{ material: 'Cotton' }, {}], notes: 42, extra: true });
  assert.deepEqual(Object.keys(out), Object.keys(emptyTechPack()));
  assert.equal(out.style.styleName.length, 200);
  assert.equal(out.style.rogue, undefined);
  assert.deepEqual(out.sizes, ['S', 'M']);
  assert.deepEqual(out.pom[0].values, { S: '18', M: '19' }, 'values are keyed strictly to the size run');
  assert.equal(out.sketches[0].view, 'front');
  assert.equal(out.sketches[0].image, '', 'non data-image sources are rejected');
  assert.equal(out.sketches[0].callouts.length, 1, 'empty callouts are dropped');
  assert.deepEqual([out.sketches[0].callouts[0].x, out.sketches[0].callouts[0].y], [1, 0], 'pin coordinates are clamped to the image');
  assert.equal(out.bom.length, 1, 'empty BOM rows are dropped');
  assert.equal(out.notes, '42');
});

test('normalizeTechPack keeps valid inline images, swatches, artwork and placements', () => {
  const out = normalizeTechPack({ sketches: [{ id: 'front-1', view: 'back', image: png, garmentWidthIn: '22.5' }], colorways: [{ name: 'Black', swatch: '#141416' }, { name: 'Bad', swatch: 'red' }],
    artwork: [{ id: 'art1', name: 'Chest logo', image: png, pantones: [{ hex: '#4B5320', name: 'Olive Green' }, { hex: 'nope' }], placements: [{ sketchId: 'front-1', x: 0.5, y: 0.3, widthIn: '3.5' }, { sketchId: 'missing', x: 0.1, y: 0.1 }] }] });
  assert.equal(out.sketches[0].image, png);
  assert.equal(out.sketches[0].id, 'front-1');
  assert.equal(out.sketches[0].garmentWidthIn, 22.5);
  assert.equal(out.colorways[0].swatch, '#141416');
  assert.equal(out.colorways[1].swatch, '');
  assert.equal(out.artwork[0].pantones.length, 1, 'invalid pantone hex dropped');
  assert.equal(out.artwork[0].pantones[0].hex, '#4b5320');
  assert.equal(out.artwork[0].placements.length, 1, 'placements must reference an existing sketch');
  assert.equal(out.artwork[0].placements[0].widthIn, 3.5);
});

test('seedTechPack generates a first draft from the product configuration', () => {
  const pack = seedTechPack({
    product: { title: 'OMT-01 Work Jacket', product_type: 'Outerwear', shopify_handle: 'omt-01-work-jacket', description_html: '<p>Heavy <b>canvas</b> jacket.</p>' },
    configuration: { material: '12oz cotton canvas', construction: 'Flat-felled seams', decoration_method: 'Chain-stitch embroidery', decoration_locations: ['Left chest', 'Back yoke'], artwork_width_in: 3.5, artwork_height_in: 2, colorways: ['Olive', 'Black'], sizes: ['S', 'M', 'L', 'XL'], packaging: 'Folded, polybag', supplier_name: 'Mill A' },
    now: new Date('2026-09-10T00:00:00Z')
  });
  assert.equal(pack.style.styleNumber, 'OMT-01-WORK-JACKET');
  assert.equal(pack.style.season, 'FW26');
  assert.equal(pack.style.sampleSize, 'L');
  assert.equal(pack.style.description, 'Heavy canvas jacket.');
  assert.deepEqual(pack.sizes, ['S', 'M', 'L', 'XL']);
  assert.equal(pack.pom.length, 9, 'tops measurement template applied');
  assert.equal(pack.pom[0].name, 'Across shoulder');
  assert.deepEqual(Object.keys(pack.pom[0].values), ['S', 'M', 'L', 'XL']);
  assert.equal(pack.bom[0].component, 'Main body');
  assert.equal(pack.bom[0].supplier, 'Mill A');
  assert.match(pack.bom[1].component, /Chain-stitch/);
  assert.equal(pack.bom[1].placement, 'Left chest, Back yoke');
  assert.match(pack.bom[1].spec, /3\.5" × 2"/);
  assert.equal(pack.construction[0].detail, 'Flat-felled seams');
  assert.deepEqual(pack.colorways.map(c => c.name), ['Olive', 'Black']);
  assert.equal(pack.labels.length, 3);
  assert.equal(pack.packaging.notes, 'Folded, polybag');
  assert.equal(pack.care.fiber, '12oz cotton canvas');
});

test('seedTechPack picks measurement templates by category and falls back cleanly', () => {
  assert.equal(pomTemplateFor('Ouster Cap - Natural').length, 5);
  assert.equal(pomTemplateFor('Flyer Pant').length, 9);
  assert.equal(pomTemplateFor('Ouster Desk Mat').length, 0);
  const mat = seedTechPack({ product: { title: 'Ouster Desk Mat' } });
  assert.deepEqual(mat.sizes, ['One size']);
  assert.equal(mat.pom.length, 0);
  assert.equal(mat.labels.length, 0, 'no garment labels for non-apparel');
  const tee = seedTechPack({ product: { title: 'Sensor Lineup Tee' } });
  assert.deepEqual(tee.sizes, DEFAULT_SIZES);
  assert.equal(tee.style.sampleSize, 'L');
});

const fullPack = () => ({
  style: { styleNumber: 'A', styleName: 'B', sampleSize: 'M' }, sizes: ['S', 'M', 'L'],
  sketches: [
    { id: 'f', view: 'front', image: png, callouts: [{ n: 1, label: 'Collar', x: 0.5, y: 0.1 }, { n: 2, label: 'Left cuff', x: 0.1, y: 0.8 }] },
    { id: 'b', view: 'back', image: png, callouts: [{ n: 1, label: 'Back yoke', x: 0.5, y: 0.2 }] }
  ],
  pom: [{ code: 'A', name: 'Chest', tolerance: '±0.5', values: { M: '20' } }],
  artwork: [{ id: 'art', name: 'Logo', image: png, pantones: [{ hex: '#000000', name: 'Black' }], placements: [{ sketchId: 'f', x: 0.5, y: 0.4, widthIn: 3.5 }] }],
  bom: [{ component: 'Body' }], colorways: [{ name: 'Black' }], care: { instructions: 'Cold wash' }
});

test('techPackCompleteness reports what a draft still needs', () => {
  const empty = techPackCompleteness({});
  assert.equal(empty.complete, false);
  assert.ok(empty.missing.includes('Both mockup views (front + back, or lateral + medial)'));
  assert.ok(empty.missing.includes('Artwork uploaded and Pantone matched'));
  assert.equal(techPackCompleteness(fullPack()).complete, true);
});

test('techPackReadiness computes the sign-off checklist from data + factory acknowledgements', () => {
  const data = fullPack();
  const none = techPackReadiness(data, emptyVerification(1));
  assert.equal(none.ready, false);
  assert.equal(none.checks.find(c => c.key === 'mockups').ok, true);
  const callouts = none.checks.find(c => c.key === 'callouts');
  assert.equal(callouts.label, 'All 3 callouts acknowledged by factory');
  assert.match(callouts.detail, /3 pending: Collar, Left cuff, Back yoke/);
  assert.equal(none.checks.find(c => c.key === 'pom').ok, true);
  assert.equal(none.checks.find(c => c.key === 'artwork').ok, true);
  assert.equal(none.checks.find(c => c.key === 'placement').ok, true);
  assert.deepEqual(none.pendingCalloutKeys, ['f:1', 'f:2', 'b:1']);
  const acks = Object.fromEntries(none.pendingCalloutKeys.map(k => [k, { by: 'Mill A', at: '2026-09-10' }]));
  const all = techPackReadiness(data, { version: 1, acks });
  assert.equal(all.ready, true);
  assert.equal(all.locked, false);
  assert.equal(all.nextSigner, 'client', 'the client approves first');
  const twoOfThree = techPackReadiness(data, { version: 1, acks, brandSign: { name: 'Kyle', at: 'x' }, factorySign: { name: 'Mill A', at: 'y' } });
  assert.equal(twoOfThree.locked, false, 'no lock without the client approval');
  const signed = techPackReadiness(data, { version: 1, acks, clientSign: { name: 'Ana', at: 'c' }, brandSign: { name: 'Kyle', at: 'x' }, factorySign: { name: 'Mill A', at: 'y' } });
  assert.equal(signed.locked, true);
  assert.equal(signed.nextSigner, null);
  assert.equal(calloutKey({ id: 'f' }, { n: 2 }), 'f:2');
});

test('normalizeTechPack keeps colour renderings with an image and drops empty ones', () => {
  const t = normalizeTechPack({ renderings: [{ id: 'r1', name: 'Bone / White', note: 'Lead colourway', image: 'data:image/jpeg;base64,AAAA' }, { name: 'no image' }, { image: 'javascript:alert(1)' }] });
  assert.deepEqual(t.renderings, [{ id: 'r1', name: 'Bone / White', note: 'Lead colourway', image: 'data:image/jpeg;base64,AAAA' }]);
  assert.deepEqual(normalizeTechPack({}).renderings, []);
});

test('normalizeVerification resets acknowledgements and signatures from an older version', () => {
  const stale = normalizeVerification({ version: 1, acks: { 'f:1': { by: 'Mill A', at: 'x' } }, brandSign: { name: 'Kyle', at: 'x' } }, 2);
  assert.deepEqual(stale, emptyVerification(2));
  const same = normalizeVerification({ version: 2, acks: { 'f:1': { by: 'Mill A', at: 'x' } }, factorySign: { name: '', at: 'x' } }, 2);
  assert.equal(same.acks['f:1'].by, 'Mill A');
  assert.equal(same.factorySign, null, 'a signature without a name does not count');
});

test('publishedTechPackView exposes only the published snapshot, with readiness', () => {
  const view = publishedTechPackView({ product_id: 'p1', title: 'Tee', product_type: 'Knit', client_name: 'Ouster', project_name: 'Launch', version: 2, published_at: '2026-09-10', published_data: { style: { styleName: 'Published' } }, data: { style: { styleName: 'Draft in progress' } }, revisions: [{ version: 1 }, { version: 2 }], verification: { version: 2, acks: {} } }, { audience: 'factory', shareLabel: 'Mill A' });
  assert.equal(view.audience, 'factory');
  assert.equal(view.shareLabel, 'Mill A');
  assert.equal(view.techPack.data.style.styleName, 'Published');
  assert.equal(JSON.stringify(view).includes('Draft in progress'), false);
  assert.equal(view.techPack.revisions.length, 2);
  assert.equal(view.techPack.readiness.ready, false);
  assert.equal(view.techPack.verification.version, 2);
  assert.equal(view.product.clientName, 'Ouster');
});

test('footwear packs get footwear views, sizes, measurements, BOM and labels', () => {
  const pack = seedTechPack({ product: { title: 'Court Mid', product_type: 'Footwear — cupsole sneaker' } });
  assert.deepEqual(pack.sizes, FOOTWEAR_SIZES);
  assert.equal(pack.style.sampleSize, '10');
  assert.equal(pack.pom.length, 9);
  assert.equal(pack.pom[0].name, 'Outsole length');
  assert.equal(pack.bom[0].component, 'Upper');
  assert.ok(pack.bom.some(r => r.component === 'Outsole'));
  assert.ok(pack.labels.some(l => l.item === 'Tongue label'));
  assert.equal(pomTemplateFor('Denim high-top boot').length, 9, 'footwear wins over the tops keyword inside "high-top"');
  assert.equal(mockupsComplete([{ view: 'lateral', image: 'x' }, { view: 'medial', image: 'x' }]), true);
  assert.equal(mockupsComplete([{ view: 'lateral', image: 'x' }, { view: 'back', image: 'x' }]), false);
  const r = techPackReadiness({ style: { category: 'Footwear' }, sketches: [{ id: 'l', view: 'lateral', image: 'data:image/png;base64,QUJD' }] }, emptyVerification(1));
  assert.equal(r.checks[0].label, 'Lateral + medial mockups uploaded');
  assert.match(r.checks[0].detail, /medial view missing/);
});

test('the product card takes material, decoration, colourways and sizes from the pack, and says nothing where the pack says nothing', () => {
  assert.equal(cardFieldsFromPack({}), null);
  assert.equal(cardFieldsFromPack(null), null);
  const f = cardFieldsFromPack({
    sizes: ['8', '9', '10'],
    bom: [{ component: 'Upper', material: 'Recycled mesh' }, { component: 'Sole', material: 'recycled  MESH' }, { component: 'Lining', material: 'Suede' }, { component: 'Lace', material: '' }],
    colorways: [{ name: 'Gum', code: '18-1021' }, { name: 'Ecru' }],
    artwork: [{ id: 'a1', name: 'Heel logo', image: '', placements: [] }]
  });
  assert.equal(f.material, 'Recycled mesh, Suede');
  assert.deepEqual(f.colorways, ['Gum (18-1021)', 'Ecru']);
  assert.equal(f.decoration_method, 'Heel logo');
  assert.deepEqual(f.sizes, ['8', '9', '10']);
  assert.equal('decoration_locations' in f, false);
});

test('the default size run is not shown as if it were a decision until the pack has real content', () => {
  assert.equal(cardFieldsFromPack({ style: { styleName: 'Only a name' } }), null);
  assert.equal(packHasContent({ style: { styleName: 'Only a name' } }), false);
  assert.equal(packHasContent({ colorways: [{ name: 'Black' }] }), true);
  const withCallout = { sketches: [{ id: 's1', view: 'front', callouts: [{ n: 1, label: 'Collar' }] }] };
  assert.equal(packHasContent(withCallout), true);
  assert.ok(cardFieldsFromPack(withCallout).sizes.length > 0);
});

test('long lists are capped so a card stays a card', () => {
  const bom = Array.from({ length: 30 }, (_, i) => ({ component: `c${i}`, material: `Material number ${i}` }));
  const f = cardFieldsFromPack({ bom, colorways: Array.from({ length: 40 }, (_, i) => ({ name: `Colour ${i}` })) });
  assert.equal(f.material.split(', ').length, 6); assert.ok(f.material.length <= 200); assert.equal(f.colorways.length, 12);
});
