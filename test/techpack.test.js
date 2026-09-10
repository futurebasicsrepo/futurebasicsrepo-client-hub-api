import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTechPack, seedTechPack, techPackCompleteness, publishedTechPackView, emptyTechPack, pomTemplateFor, DEFAULT_SIZES } from '../src/techpack.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('normalizeTechPack returns a complete, bounded shape from garbage input', () => {
  const out = normalizeTechPack({ style: { styleName: 'X'.repeat(500), rogue: 'drop me' }, sizes: ['S', 'S', 'M', ''], pom: [{ code: 'A', name: 'Chest', values: { S: '18', M: '19', XL: '99' } }], sketches: [{ view: 'nope', image: 'javascript:alert(1)', callouts: [{ n: 3, note: 'seam' }, { n: 1, note: '' }] }], bom: [{ material: 'Cotton' }, {}], notes: 42, extra: true });
  assert.deepEqual(Object.keys(out), Object.keys(emptyTechPack()));
  assert.equal(out.style.styleName.length, 200);
  assert.equal(out.style.rogue, undefined);
  assert.deepEqual(out.sizes, ['S', 'M']);
  assert.deepEqual(out.pom[0].values, { S: '18', M: '19' }, 'values are keyed strictly to the size run');
  assert.equal(out.sketches[0].view, 'front');
  assert.equal(out.sketches[0].image, '', 'non data-image sources are rejected');
  assert.deepEqual(out.sketches[0].callouts, [{ n: 3, note: 'seam' }], 'empty callouts are dropped');
  assert.equal(out.bom.length, 1, 'empty BOM rows are dropped');
  assert.equal(out.notes, '42');
});

test('normalizeTechPack keeps valid inline images and swatches', () => {
  const out = normalizeTechPack({ sketches: [{ id: 'front-1', view: 'back', image: png }], colorways: [{ name: 'Black', swatch: '#141416' }, { name: 'Bad', swatch: 'red' }] });
  assert.equal(out.sketches[0].image, png);
  assert.equal(out.sketches[0].id, 'front-1');
  assert.equal(out.colorways[0].swatch, '#141416');
  assert.equal(out.colorways[1].swatch, '');
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

test('techPackCompleteness reports what a factory-ready pack still needs', () => {
  const empty = techPackCompleteness({});
  assert.equal(empty.complete, false);
  assert.ok(empty.missing.includes('At least one sketch image'));
  const full = techPackCompleteness({ style: { styleNumber: 'A', styleName: 'B' }, sketches: [{ image: png }], sizes: ['M'], pom: [{ name: 'Chest', values: { M: '20' } }], bom: [{ component: 'Body' }], construction: [{ area: 'Seams' }], colorways: [{ name: 'Black' }], labels: [{ item: 'Main' }], care: { instructions: 'Cold wash' } });
  assert.equal(full.complete, true);
  assert.deepEqual(full.missing, []);
});

test('publishedTechPackView exposes only the published snapshot', () => {
  const view = publishedTechPackView({ product_id: 'p1', title: 'Tee', product_type: 'Knit', client_name: 'Ouster', project_name: 'Launch', version: 2, published_at: '2026-09-10', published_data: { style: { styleName: 'Published' } }, data: { style: { styleName: 'Draft in progress' } }, revisions: [{ version: 1 }, { version: 2 }] }, { audience: 'factory', shareLabel: 'Mill A' });
  assert.equal(view.audience, 'factory');
  assert.equal(view.shareLabel, 'Mill A');
  assert.equal(view.techPack.data.style.styleName, 'Published');
  assert.equal(JSON.stringify(view).includes('Draft in progress'), false);
  assert.equal(view.techPack.revisions.length, 2);
  assert.equal(view.product.clientName, 'Ouster');
});
