import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/commercial.js';
import { normalizeTechPack } from '../src/techpack.js';
import { buildShopifyExport, exportToShopify, planSummary, PRODUCT_SET, PACK_VARIANTS_QUERY, PACK_PRODUCT_UPDATE, PACK_VARIANTS_CREATE, PACK_VARIANTS_UPDATE } from '../src/pack-export.js';
const C = globalThis.FBCommercial;

const pack = (over = {}) => {
  const p = normalizeTechPack({ style: { styleNumber: 'FB-26-0042', styleName: 'Heavy hoodie', season: 'FW26', category: 'Hoodie', description: 'Boxy fit.\n\nBrushed fleece inside.', sampleSize: 'M' }, sizes: ['S', 'M'],
    colorways: [{ name: 'Grey' }, { name: 'Green' }], bom: [{ component: 'Body', material: 'Fleece 320gsm' }], pom: [{ code: 'A', name: 'Chest', tolerance: '±0.5', values: { S: '20', M: '21' } }],
    care: { countryOfOrigin: 'Made in Vietnam', fiber: '100% cotton', instructions: 'Wash cold' }, commercial: { retailPrice: '89', compareAtPrice: '120', weightGrams: '420', hsCode: '6110.20' }, ...over });
  p.commercial.variants = C.syncVariants(p); return normalizeTechPack(p);
};
const media = [{ key: 'view.a', kind: 'view', name: 'front', mime: 'image/jpeg', url: 'https://hub/m/p/view.a/1/sig' }, { key: 'art.a', kind: 'artwork', name: 'logo', mime: 'image/png', url: 'https://hub/m/p/art.a/1/sig' }, { key: 'v.svg', kind: 'view', name: 's', mime: 'image/svg+xml', url: 'x' }];

test('a pack becomes options, variants, specification metafields and pictures, and says what is missing', () => {
  const plan = buildShopifyExport({ pack: pack(), product: { title: 'Heavy hoodie', client_slug: 'acme' }, version: 3, cost: 21.5, media, hubUrl: 'https://hub/tech-packs/p', now: '2026-10-10T12:00:00Z' });
  assert.deepEqual(plan.errors, []); assert.equal(plan.variants.length, 4);
  assert.deepEqual(plan.options.map(o => [o.name, o.values.join()]), [['Size', 'S,M'], ['Colour', 'Grey,Green']]);
  const v = plan.variants[0]; assert.match(v.sku, /^FB260042-GRE?/i); assert.equal(v.price, '89.00'); assert.equal(v.compareAtPrice, '120.00'); assert.equal(v.cost, '21.50'); assert.equal(v.weightGrams, 420); assert.equal(v.hs, '611020'); assert.equal(v.origin, 'VN');
  assert.equal(plan.descriptionHtml, '<p>Boxy fit.</p><p>Brushed fleece inside.</p>'); assert.ok(plan.tags.includes('acme') && plan.tags.includes('FB-26-0042'));
  assert.deepEqual(plan.files.map(f => f.filename), ['FB-26-0042-1.jpg'], 'pictures only, not artwork, not SVG');
  const keys = plan.metafields.map(m => m.key); for (const k of ['style_number', 'pack_version', 'pack_url', 'materials', 'measurements', 'care', 'fibre']) assert.ok(keys.includes(k), k);
  assert.ok(plan.metafields.every(m => m.namespace === 'techpack'));
  assert.ok(plan.warnings.some(w => /barcodes/i.test(w.text)) && !plan.warnings.some(w => /weight|HS|origin|unit cost|pictures/i.test(w.text)));
  assert.match(planSummary(plan).options[0], /Size: S, M/);
});

test('what blocks an export is said in plain words, and what only warns does not block', () => {
  const bare = buildShopifyExport({ pack: normalizeTechPack({ style: { styleName: 'X' }, sizes: ['S'] }), product: {} });
  assert.ok(bare.errors.some(e => /No price/.test(e.text))); assert.ok(bare.warnings.some(w => /weight/i.test(w.text)) && bare.warnings.some(w => /HS code/i.test(w.text)));
  const dup = pack(); dup.commercial.variants[1].sku = dup.commercial.variants[0].sku; assert.ok(buildShopifyExport({ pack: dup }).errors.some(e => /used twice/.test(e.text)));
  const noSku = pack(); noSku.commercial.variants[0].sku = ''; const synced = buildShopifyExport({ pack: noSku }); assert.deepEqual(synced.errors, [], 'a missing SKU is regenerated from the sizes and colours, not an error');
  const many = pack({ sizes: Array.from({ length: 14 }, (_, i) => 'S' + i), colorways: Array.from({ length: 16 }, (_, i) => ({ name: 'C' + i })) }); const big = buildShopifyExport({ pack: many }); assert.equal(big.variants.length, 224); assert.deepEqual(big.errors, [], 'the largest pack the editor allows is inside Shopify\'s limit of 250');
});

const fakeStore = () => {
  const log = [], products = new Map(); let n = 100;
  const exec = async (query, variables) => {
    log.push({ query, variables });
    if (query === PRODUCT_SET) { const id = `gid://shopify/Product/${++n}`, nodes = variables.input.variants.map((v, i) => ({ id: `gid://shopify/ProductVariant/${n}${i}`, sku: v.sku })); products.set(id, { handle: 'heavy-hoodie', status: 'DRAFT', nodes }); return { productSet: { product: { id, handle: 'heavy-hoodie', status: 'DRAFT', variants: { nodes } }, userErrors: [] } }; }
    if (query === PACK_VARIANTS_QUERY) { const p = products.get(variables.id); return { product: p ? { id: variables.id, handle: p.handle, status: 'ACTIVE', variants: { nodes: p.nodes } } : null }; }
    if (query === PACK_PRODUCT_UPDATE) return { productUpdate: { product: { id: variables.product.id }, userErrors: [] } };
    if (query === PACK_VARIANTS_UPDATE) return { productVariantsBulkUpdate: { productVariants: [], userErrors: [] } };
    if (query === PACK_VARIANTS_CREATE) { const p = products.get(variables.productId); variables.variants.forEach((v, i) => p.nodes.push({ id: `gid://shopify/ProductVariant/new${i}`, sku: v.inventoryItem.sku })); return { productVariantsBulkCreate: { productVariants: [], userErrors: [] } }; }
    throw new Error('unexpected ' + query.slice(0, 40));
  };
  return { exec, log, products };
};

test('the first export creates a draft product in one call, with SKU, weight, HS code and origin on every variant', async () => {
  const store = fakeStore(), plan = buildShopifyExport({ pack: pack(), cost: 20, media });
  const r = await exportToShopify({ plan, exec: store.exec });
  assert.equal(r.mode, 'create'); assert.equal(store.log.length, 1); const input = store.log[0].variables.input;
  assert.equal(input.status, 'DRAFT'); assert.equal(input.variants.length, 4); assert.equal(input.productOptions[0].name, 'Size'); assert.equal(input.files.length, 1);
  const v = input.variants[0]; assert.ok(v.sku && v.price === '89.00' && v.inventoryItem.measurement.weight.unit === 'GRAMS' && v.inventoryItem.harmonizedSystemCode === '611020' && v.inventoryItem.countryCodeOfOrigin === 'VN' && v.inventoryItem.cost === '20.00' && !('sku' in v.inventoryItem));
  assert.equal(Object.keys(r.lastPrices).length, 4);
});

test('a re-export updates the specification, creates only what is new, deletes nothing and leaves a price the merchant changed alone', async () => {
  const store = fakeStore(), first = await exportToShopify({ plan: buildShopifyExport({ pack: pack(), cost: 20 }), exec: store.exec });
  store.log.length = 0;
  const bigger = pack({ sizes: ['S', 'M', 'L'] });
  const plan2 = buildShopifyExport({ pack: bigger, cost: 22 });
  const r = await exportToShopify({ plan: plan2, exec: store.exec, existing: { id: first.productId, lastPrices: first.lastPrices } });
  const names = store.log.map(x => x.query.match(/(?:query|mutation) (\w+)/)[1]); assert.deepEqual(names, ['PackProductVariants', 'ExportPackProductUpdate', 'ExportPackVariantsUpdate', 'ExportPackVariantsCreate']);
  const upd = store.log[1].variables.product; assert.ok(!('title' in upd) && !('tags' in upd) && !('status' in upd) && !('descriptionHtml' in upd), 'marketing fields untouched');
  assert.equal(r.variants.updated, 4); assert.equal(r.variants.created, 2); assert.deepEqual(r.variants.notInPack, []);
  assert.ok(store.log[2].variables.variants.every(v => !('price' in v)), 'price unchanged in the pack: not sent');
  assert.equal(store.log[3].variables.variants[0].inventoryItem.sku.startsWith('FB260042'), true);
  // the pack's price moves: now it is sent
  store.log.length = 0; const moved = pack({ sizes: ['S', 'M', 'L'], commercial: { retailPrice: '95', weightGrams: '420', hsCode: '6110.20' } });
  await exportToShopify({ plan: buildShopifyExport({ pack: moved, cost: 22 }), exec: store.exec, existing: { id: first.productId, lastPrices: r.lastPrices } });
  assert.ok(store.log.find(x => /VariantsUpdate/.test(x.query)).variables.variants.every(v => v.price === '95.00'));
  // a variant that is in the store and not in the pack is reported, not removed
  store.products.get(first.productId).nodes.push({ id: 'gid://shopify/ProductVariant/x', sku: 'MERCHANT-ONLY' });
  const r3 = await exportToShopify({ plan: buildShopifyExport({ pack: bigger, cost: 22 }), exec: store.exec, existing: { id: first.productId, lastPrices: r.lastPrices } });
  assert.deepEqual(r3.variants.notInPack, ['MERCHANT-ONLY']);
});

test('Shopify refusing something is reported with its words, and a product gone from the store says so', async () => {
  const plan = buildShopifyExport({ pack: pack() });
  await assert.rejects(exportToShopify({ plan, exec: async () => ({ productSet: { product: null, userErrors: [{ field: ['input'], message: 'Title is too long' }] } }) }), /Shopify refused the product: Title is too long/);
  await assert.rejects(exportToShopify({ plan, exec: async () => ({ product: null }), existing: { id: 'gid://shopify/Product/1' } }), /no longer in the store/);
  await assert.rejects(exportToShopify({ plan: buildShopifyExport({ pack: normalizeTechPack({ style: { styleName: 'X' }, sizes: ['S'] }) }), exec: async () => ({}) }), /No price/);
});
