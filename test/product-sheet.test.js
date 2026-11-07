import test from 'node:test';
import assert from 'node:assert/strict';
import { specFromTechPack, configFromSpec, makeLines, tierView, tiersToCopy, rankPast, cleanLadder, kindOf } from '../src/product-sheet.js';

const PACK = {
  style: { styleNumber: 'Cap1 OT-S3', styleName: 'Long Sleeve "Yosemite"', category: 'Long Sleeve', fabricSummary: 'Cotton jersey, bone (weight to confirm)' },
  bom: [{ component: 'Body', material: 'Bone long-sleeve tee, rib cuffs' }, { component: 'Neck label', material: 'Woven label' }],
  colorways: [{ name: 'Bone' }, { name: 'Bone' }, { name: '' }], sizes: ['S', 'M', 'L', 'XL', ''],
  artwork: [{ name: 'Back print: landscape band', note: 'Upper back. Direct-to-garment print', placements: [{ sketchId: 'back' }] }, { name: 'Sleeve type', note: 'Sleeve. Plastisol screen print' }],
  labels: [{ item: 'Neck label' }, { item: 'Hang tag' }], packaging: [{ item: 'Poly bag', spec: 'Recycled, with tech sticker' }],
  commercial: { retailPrice: '60', cost: { breaks: [{ qty: '50', unit: '18.9' }, { qty: '', unit: '1' }] } }
};

test('the spec is read from the tech pack: style, fabric, colourways, sizes, how and where it is decorated, labels, packaging, price breaks', () => {
  const s = specFromTechPack(PACK);
  assert.equal(s.styleNumber, 'Cap1 OT-S3'); assert.equal(s.category, 'Long Sleeve'); assert.equal(s.blankName, 'Bone long-sleeve tee, rib cuffs');
  assert.equal(s.material, 'Cotton jersey, bone (weight to confirm)'); assert.deepEqual(s.colorways, ['Bone']); assert.deepEqual(s.sizes, ['S', 'M', 'L', 'XL']);
  assert.match(s.decorationMethod, /Screen print/); assert.match(s.decorationMethod, /Direct-to-garment/); assert.match(s.decorationMethod, /Woven label/);
  assert.ok(s.decorationLocations.includes('Back') && s.decorationLocations.includes('Sleeve'));
  assert.deepEqual(s.labels, ['Neck label', 'Hang tag']); assert.equal(s.packaging, 'Poly bag: Recycled, with tech sticker'); assert.equal(s.retailCents, 6000);
  assert.deepEqual(s.breaks, [{ qty: 50, unitCents: 1890 }]); assert.equal(s.artworkCount, 2);
  assert.deepEqual(specFromTechPack(null).colorways, [], 'an empty pack reads as empty, not an error');
});

test('filling the configuration from the pack keeps what staff set (factory, MOQ, lead time, status) and anything the pack does not know', () => {
  const c = configFromSpec(specFromTechPack(PACK), { supplier_id: 'f1', moq: 50, lead_time_days: 35, status: 'ready', construction: 'Twin-needle hems', colorways: ['Stone'] });
  assert.equal(c.supplierId, 'f1'); assert.equal(c.moq, 50); assert.equal(c.leadTimeDays, 35); assert.equal(c.status, 'ready');
  assert.equal(c.blankName, 'Cap1 OT-S3 · Bone long-sleeve tee, rib cuffs'); assert.deepEqual(c.colorways, ['Bone'], 'the pack is the truth for colourways');
  assert.equal(c.construction, 'Twin-needle hems', 'kept: the pack has no construction notes');
});

test('each "how it is made" line says where it comes from', () => {
  const lines = makeLines({ material: 'Heavy jersey' }, specFromTechPack(PACK)), by = k => lines.find(l => l.key === k);
  assert.deepEqual([by('material').value, by('material').from], ['Heavy jersey', 'config']);
  assert.deepEqual([by('sizes').value, by('sizes').from], ['S, M, L, XL', 'tech-pack']);
  assert.equal(by('construction').from, 'none');
});

test('a tier shows our margin after setup and freight, and the client\'s margin at SRP', () => {
  const t = tierView({ min_quantity: 50, unit_cost_cents: 1890, wholesale_cents: 2900, srp_cents: 6000, setup_cents: 5000, freight_cents: 0 });
  assert.equal(t.landedCents, 1990); assert.equal(t.ourMarginPct, 31.4); assert.equal(t.clientMarginPct, 51.7);
  assert.equal(tierView({ min_quantity: 1, unit_cost_cents: 100, wholesale_cents: 0 }).ourMarginPct, null);
  assert.deepEqual(tiersToCopy([{ id: 'x', product_id: 'p', min_quantity: 250, unit_cost_cents: 1500, wholesale_cents: 2400 }, { min_quantity: 50, unit_cost_cents: 1890, wholesale_cents: 2900 }]).map(t => t.minQuantity), [50, 250], 'copied without ids, in order');
});

test('past products are ranked by how alike they are: the same kind of item first', () => {
  const target = { id: 't', title: 'Long Sleeve "Yosemite"', client_id: 'c1' };
  const list = [{ id: 'a', title: 'Hoodie', tiers: [{}], config: {} }, { id: 'b', title: 'Long sleeve tee "Taxi"', tiers: [{}] }, { id: 'c', title: 'Cap', config: {} }, { id: 'd', title: 'Long sleeve, no data' }, { id: 't', title: 'Long Sleeve "Yosemite"', tiers: [{}] }];
  const ranked = rankPast(target, list);
  assert.equal(ranked[0].id, 'b'); assert.ok(!ranked.some(x => x.id === 'd'), 'a product with nothing to copy is not offered'); assert.ok(!ranked.some(x => x.id === 't'), 'never itself');
  assert.equal(kindOf('Cap — Tan'), 'cap'); assert.equal(kindOf('The Ocho: Ouster FC Jersey'), 'jersey');
});

test('a price ladder needs a name and tiers that start at different quantities', () => {
  assert.match(cleanLadder({ tiers: [{ minQuantity: 50, unitCostCents: 1, wholesaleCents: 2 }] }).error, /name/);
  assert.match(cleanLadder({ name: 'Tee', tiers: [] }).error, /at least one/);
  assert.match(cleanLadder({ name: 'Tee', tiers: [{ minQuantity: 50, unitCostCents: 1, wholesaleCents: 2 }, { minQuantity: 50, unitCostCents: 1, wholesaleCents: 3 }] }).error, /same quantity/);
  assert.equal(cleanLadder({ name: ' Tee · 50/100 ', tiers: [{ minQuantity: 100, unitCostCents: 1, wholesaleCents: 2 }, { minQuantity: 50, unitCostCents: 1, wholesaleCents: 3 }] }).value.tiers[0].minQuantity, 50);
});

test('any product opens in the Design Studio: a Lab category from the kind of item, words and a picture from the tech pack', async () => {
  const { labCategoryOf, conceptSpecOf, productPictureOf } = await import('../src/product-sheet.js');
  assert.equal(labCategoryOf({ title: 'Long Sleeve "Yosemite"' }), 'tops'); assert.equal(labCategoryOf({ title: 'Cap — Green' }), 'headwear');
  assert.equal(labCategoryOf({ title: 'Water Bottle' }), 'home'); assert.equal(labCategoryOf({ title: 'Multitool' }), 'other');
  const s = conceptSpecOf({ id: 'p1', title: 'Cap — Green' }, { description: 'Six-panel cap', material: 'Cotton twill', colorways: ['Green'], labels: ['Woven label'] });
  assert.match(s.description, /Six-panel cap\. Fabric: Cotton twill\./); assert.deepEqual(s.colors, ['Green']); assert.equal(s.fromProduct, 'p1');
  assert.match(conceptSpecOf({ title: 'Multitool' }, {}).description, /Opened from the product "Multitool"/);
  assert.equal(productPictureOf({ renderings: [{ image: '' }, { image: 'data:image/png;base64,AAA' }] }), 'data:image/png;base64,AAA');
  assert.equal(productPictureOf({ sketches: [{ image: 'data:image/jpeg;base64,BBB' }] }), 'data:image/jpeg;base64,BBB'); assert.equal(productPictureOf({ renderings: [{ image: 'fbblob:x' }] }), '');
});
