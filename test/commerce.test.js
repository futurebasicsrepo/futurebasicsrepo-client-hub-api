import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCatalog, catalogFromText, catalogToText, planPush, squareObjects, wixProduct, shopifyInput, pushToSquare, pushToWix, pushToShopify, summarize } from '../src/commerce.js';
import { cleanProject, softwareView, cleanPlatform, STAGE_KEYS, stageOwner } from '../src/software.js';

test('a catalog needs names and prices, clean pictures, and unique codes', () => {
  assert.match(cleanCatalog([{ name: '', price: '1' }]).error, /Product 1 needs a name/);
  assert.match(cleanCatalog([{ name: 'Beans', price: 'free' }]).error, /needs a price/);
  assert.match(cleanCatalog([{ name: 'Beans', price: '5', imageUrl: 'javascript:alert(1)' }]).error, /web address/);
  assert.match(cleanCatalog([{ name: 'A', price: '1', sku: 'X' }, { name: 'B', price: '2', sku: 'x' }]).error, /same code/);
  const ok = cleanCatalog([{ name: ' Flat white ', price: '$1,018.5', description: 'Roasted\r\nto order' }, { name: 'Mug', price: '12' }]).value;
  assert.equal(ok[0].price, '1018.50'); assert.equal(ok[0].name, 'Flat white'); assert.equal(ok[0].sku, 'flat-white-1'); assert.equal(ok[1].sku, 'mug-2'); assert.equal(ok[0].description, 'Roasted\nto order');
  assert.match(cleanCatalog(Array.from({ length: 101 }, (_, n) => ({ name: 'p' + n, price: '1' }))).error, /up to 100/);
  assert.deepEqual(cleanCatalog(undefined).value, []);
});

test('the catalog round-trips through the one-line-per-product text', () => {
  const items = cleanCatalog(catalogFromText('Beans | 18.50 | B-1 | https://example.com/b.jpg | Roasted | to order\nMug | 12')).value;
  assert.equal(items[0].description, 'Roasted | to order'); assert.equal(items[1].sku, 'mug-2');
  assert.deepEqual(cleanCatalog(catalogFromText(catalogToText(items))).value, items);
});

test('a push leaves alone what an earlier push already made', () => {
  const items = cleanCatalog([{ name: 'A', price: '1', sku: 'A' }, { name: 'B', price: '2', sku: 'B' }]).value;
  const plan = planPush(items, { A: 'gid://1' }); assert.deepEqual(plan.make.map(i => i.sku), ['B']); assert.equal(plan.skip[0].sku, 'A'); assert.match(plan.skip[0].reason, /left as the client has it/);
});

test('each platform gets the shape its API wants', () => {
  const [it] = cleanCatalog([{ name: 'Beans', price: '18.50', sku: 'B-1', description: 'Roasted', imageUrl: 'https://example.com/b.jpg' }]).value;
  const sq = squareObjects([it], 'CAD')[0]; assert.equal(sq.id, '#B-1'); assert.equal(sq.item_data.variations[0].item_variation_data.price_money.amount, 1850); assert.equal(sq.item_data.variations[0].item_variation_data.price_money.currency, 'CAD'); assert.equal(sq.item_data.variations[0].item_variation_data.item_id, '#B-1');
  const wx = wixProduct(it, 'https://static.wixstatic.com/media/x.jpg'); assert.equal(wx.productType, 'PHYSICAL'); assert.deepEqual(wx.physicalProperties, {}); assert.deepEqual(wx.variantsInfo.variants[0].physicalProperties, {}); assert.equal(wx.variantsInfo.variants[0].price.actualPrice.amount, '18.50'); assert.equal(wx.media.itemsInfo.items.length, 1);
  assert.equal(wixProduct(it).media, undefined);
  const sh = shopifyInput(it, { name: 'Benny', slug: 'bennys-beans' }); assert.equal(sh.status, 'DRAFT'); assert.equal(sh.variants[0].price, '18.50'); assert.equal(sh.files[0].originalSource, 'https://example.com/b.jpg'); assert.match(sh.descriptionHtml, /<p>Roasted<\/p>/);
});

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
test('Square: one batch call, ids mapped back, a refused token is reported as such', async () => {
  const items = cleanCatalog([{ name: 'A', price: '1', sku: 'A' }, { name: 'B', price: '2', sku: 'B' }]).value; let seen;
  const res = await pushToSquare({ items, token: 'tok-12345678', fetchImpl: async (url, o) => { seen = { url, o }; return json(200, { id_mappings: [{ client_object_id: '#A', object_id: 'SQ1' }] }); }, origin: 'http://sq', key: 'k1' });
  assert.equal(seen.url, 'http://sq/v2/catalog/batch-upsert'); assert.equal(seen.o.headers.Authorization, 'Bearer tok-12345678'); assert.equal(JSON.parse(seen.o.body).idempotency_key, 'k1');
  assert.deepEqual(res.map(r => [r.sku, r.outcome, r.externalId]), [['A', 'created', 'SQ1'], ['B', 'failed', undefined]]);
  await assert.rejects(pushToSquare({ items, token: 't', fetchImpl: async () => json(401, { errors: [{ code: 'UNAUTHORIZED' }] }) }), e => e.refused === true);
  await assert.rejects(pushToSquare({ items, token: 't', fetchImpl: async () => json(400, { errors: [{ detail: 'bad price' }] }) }), /bad price/);
});

test('Wix: checks the catalog version, imports the picture, makes each product, and says what failed', async () => {
  const items = cleanCatalog([{ name: 'A', price: '1', sku: 'A', imageUrl: 'https://example.com/a.jpg' }, { name: 'B', price: '2', sku: 'B' }]).value, calls = [];
  const f = async (url, o) => { calls.push(url.replace('http://wx', '')); if (url.endsWith('/provision/version')) return json(200, { catalogVersion: 'V3_CATALOG' }); if (url.endsWith('/files/import')) return json(200, { file: { url: 'https://static.wixstatic.com/a.jpg', operationStatus: 'PENDING' } }); const b = JSON.parse(o.body); return b.product.name === 'B' ? json(400, { message: 'name taken' }) : json(200, { product: { id: 'WX1' } }); };
  const res = await pushToWix({ items, apiKey: 'key', siteId: 'site', fetchImpl: f, origin: 'http://wx' });
  assert.deepEqual(res.map(r => [r.sku, r.outcome]), [['A', 'created'], ['B', 'failed']]); assert.equal(res[1].reason, 'name taken'); assert.deepEqual(calls, ['/stores/v3/provision/version', '/site-media/v1/files/import', '/stores/v3/products', '/stores/v3/products']);
  await assert.rejects(pushToWix({ items, apiKey: 'k', fetchImpl: async () => json(200, { catalogVersion: 'V1_CATALOG' }), origin: 'http://wx' }), /older Stores catalog/);
  await assert.rejects(pushToWix({ items, apiKey: 'k', fetchImpl: async () => json(403, {}), origin: 'http://wx' }), e => e.refused === true);
  const noPic = await pushToWix({ items: [items[0]], apiKey: 'k', origin: 'http://wx', fetchImpl: async (u) => u.endsWith('/provision/version') ? json(200, {}) : u.endsWith('/files/import') ? json(500, {}) : json(200, { product: { id: 'W2' } }) }); assert.match(noPic[0].note, /without its picture/);
});

test('Shopify: makes each draft through the store call; userErrors are failures, a refused store stops the push', async () => {
  const items = cleanCatalog([{ name: 'A', price: '1', sku: 'A' }, { name: 'B', price: '2', sku: 'B' }]).value;
  const res = await pushToShopify({ items, build: { name: 'Benny' }, exec: async (q, v) => v.input.title === 'A' ? { productSet: { product: { id: 'gid://p/1', handle: 'a' }, userErrors: [] } } : { productSet: { product: null, userErrors: [{ message: 'Title is bad' }] } } });
  assert.deepEqual(res.map(r => [r.outcome, r.externalId || r.reason]), [['created', 'gid://p/1'], ['failed', 'Title is bad']]);
  await assert.rejects(pushToShopify({ items, exec: async () => { throw Object.assign(new Error('no longer lets this app in'), { refused: true }); } }), /no longer lets/);
  assert.deepEqual(summarize([{ outcome: 'created' }, { outcome: 'failed' }, { outcome: 'skipped' }, { outcome: 'created' }]), { created: 2, failed: 1, skipped: 1 });
});

test('software projects: kind, stage, build and platform are checked', () => {
  assert.match(cleanProject({ name: '' }).error, /name/i);
  assert.equal(cleanProject({ name: 'Site' }).value.kind, 'product');
  assert.match(cleanProject({ name: 'X', kind: 'robots' }).error, /product development or software/);
  assert.match(cleanProject({ name: 'X', kind: 'software', stage: 'nope' }).error, /stage/);
  assert.match(cleanProject({ name: 'X', kind: 'software', buildId: 'abc' }).error, /builds/);
  const v = cleanProject({ name: ' Salon site ', kind: 'software', buildId: '8f14e45f-ceea-467a-9575-6a2b12345678' }).value; assert.equal(v.stage, 'discovery'); assert.equal(v.build_id, '8f14e45f-ceea-467a-9575-6a2b12345678');
  assert.equal(cleanProject({ name: 'Site', kind: 'product', stage: 'live', buildId: '8f14e45f-ceea-467a-9575-6a2b12345678' }).value.stage, null, 'a product project has no stage or build');
  assert.equal(cleanPlatform(' Square '), 'square'); assert.equal(cleanPlatform(''), ''); assert.equal(cleanPlatform('etsy'), null);
});

test('the stage rail marks what is done, now and next, and who has the ball', () => {
  const v = softwareView({ stage: 'build' }, { id: 'b', slug: 's', name: 'Site', status: 'in-progress', live_url: 'https://x', stack: ['Node'], highlights: [{ title: 'One' }, { title: '' }, { title: 'Two' }] });
  assert.deepEqual(v.rail.map(r => r.state), ['done', 'done', 'now', 'next', 'next', 'next', 'next']); assert.equal(v.stageLabel, 'Build'); assert.deepEqual(v.build.features, ['One', 'Two']); assert.equal(v.owner, 'us');
  assert.equal(stageOwner('review'), 'client'); assert.equal(stageOwner('live'), 'none'); assert.equal(softwareView({ stage: 'junk' }).stage, 'discovery'); assert.equal(softwareView({}, null).build, null); assert.equal(STAGE_KEYS.length, 7);
});
