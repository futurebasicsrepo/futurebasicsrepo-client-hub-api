import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, fetchProducts, toShopifyCsv, toProductSetInput, imageExt, cleanImageUrl } from '../scripts/pull-commonground-products.mjs';

const product = {
  handle: 'air-jordan-1-chicago',
  title: 'Air Jordan 1 "Chicago"',
  body_html: '<p>Deadstock, OG all.</p>',
  vendor: 'Nike',
  product_type: 'Sneakers',
  tags: ['jordan', 'grail'],
  options: [{ name: 'Size', values: ['9', '10.5'] }],
  variants: [
    { option1: '9', price: '450.00', compare_at_price: null, sku: 'AJ1-9', available: true },
    { option1: '10.5', price: '475.00', compare_at_price: '500.00', sku: '', available: false },
  ],
  images: [
    { src: 'https://cdn.shopify.com/s/files/1/x/aj1-front.jpg?v=123', position: 1, alt: null },
    { src: 'https://cdn.shopify.com/s/files/1/x/aj1-back.png?v=123', position: 2, alt: 'back' },
  ],
};

test('parseArgs defaults and overrides', () => {
  assert.deepEqual(parseArgs([]), { store: 'https://commonground12.com', limit: 30, out: './commonground-export', push: false, status: 'DRAFT' });
  const a = parseArgs(['--store', 'shop.example.com/', '--limit', '5', '--push', '--active']);
  assert.equal(a.store, 'https://shop.example.com');
  assert.equal(a.limit, 5);
  assert.equal(a.push, true);
  assert.equal(a.status, 'ACTIVE');
});

test('fetchProducts pages until limit, skipping products without images', async () => {
  const pages = {
    1: [{ handle: 'no-img', images: [] }, { handle: 'a', images: [{ src: 'x.jpg' }] }],
    2: [{ handle: 'b', images: [{ src: 'y.jpg' }] }, { handle: 'c', images: [{ src: 'z.jpg' }] }],
    3: [],
  };
  const calls = [];
  const fetchImpl = async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    calls.push(page);
    return { ok: true, json: async () => ({ products: pages[page] }) };
  };
  const got = await fetchProducts('https://shop.test', 2, fetchImpl);
  assert.deepEqual(got.map((p) => p.handle), ['a', 'b']);
  assert.deepEqual(calls, [1, 2]);
});

test('image helpers', () => {
  assert.equal(imageExt('https://cdn/x/a.JPEG?v=1'), 'jpg');
  assert.equal(imageExt('https://cdn/x/a.webp'), 'webp');
  assert.equal(imageExt('https://cdn/x/a'), 'jpg');
  assert.equal(cleanImageUrl('https://cdn/x/a.jpg?v=1'), 'https://cdn/x/a.jpg');
});

test('toShopifyCsv writes one row per variant/image with product fields on the first row', () => {
  const csv = toShopifyCsv([product]);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value'));
  assert.ok(lines[1].startsWith('air-jordan-1-chicago,"Air Jordan 1 ""Chicago""","<p>Deadstock, OG all.</p>",Nike,Sneakers,"jordan, grail",TRUE,Size,9,'), lines[1]);
  assert.ok(lines[1].includes('https://cdn.shopify.com/s/files/1/x/aj1-front.jpg,1,'));
  assert.ok(lines[1].endsWith(',draft'));
  assert.ok(lines[2].startsWith('air-jordan-1-chicago,,,,,,,,10.5,'), lines[2]);
  assert.ok(lines[2].includes('475.00,500.00'));
  assert.ok(lines[2].includes('aj1-back.png,2,back'));
});

test('toProductSetInput maps options, variants, images and inventory', () => {
  const input = toProductSetInput(product, { status: 'ACTIVE', locationId: 'gid://shopify/Location/1' });
  assert.equal(input.status, 'ACTIVE');
  assert.deepEqual(input.productOptions, [{ name: 'Size', values: [{ name: '9' }, { name: '10.5' }] }]);
  assert.equal(input.variants.length, 2);
  assert.deepEqual(input.variants[0].optionValues, [{ optionName: 'Size', name: '9' }]);
  assert.equal(input.variants[0].inventoryQuantities[0].quantity, 1);
  assert.equal(input.variants[1].inventoryQuantities[0].quantity, 0);
  assert.equal(input.variants[1].compareAtPrice, '500.00');
  assert.equal(input.variants[1].sku, undefined);
  assert.equal(input.files[0].originalSource, 'https://cdn.shopify.com/s/files/1/x/aj1-front.jpg');
  assert.equal(input.files[0].alt, 'Air Jordan 1 "Chicago"');
});

test('toProductSetInput treats the default Title option as no options', () => {
  const single = { ...product, options: [{ name: 'Title', values: ['Default Title'] }], variants: [{ option1: 'Default Title', price: '20.00', available: true }] };
  const input = toProductSetInput(single);
  assert.equal(input.productOptions, undefined);
  assert.equal(input.variants[0].optionValues, undefined);
  assert.equal(input.variants[0].inventoryQuantities, undefined);
});
