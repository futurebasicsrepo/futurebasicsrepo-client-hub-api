// The catalogue's routes in the Design Lab (src/lab-catalog-routes.js), run on the real routes that start a concept from a sketch, a library bag
// and a library shoe, over a pool that keeps what was written: a product of each kind of base becomes the right concept, and nothing the
// routes answer carries a price.
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerLabCatalogRoutes, catalogStart } from '../src/lab-catalog-routes.js';
import { registerLabConceptRoutes } from '../src/lab-concept-routes.js';
import { registerLabShoeDrawRoutes } from '../src/lab-shoe-draw-routes.js';
import { labCatalog } from '../src/lab-catalog.js';
import { STYLES } from '../src/lab-flats.js';

// what we pay the supplier never reaches a Lab response: not a cost, not a price status, not a dollar amount
const noPrice = (json, what) => { const t = typeof json === 'string' ? json : JSON.stringify(json); assert.ok(!/costCents/i.test(t), `${what}: no costCents`); assert.ok(!/price/i.test(t), `${what}: no price`); assert.ok(!/\$\s?\d/.test(t), `${what}: no dollar amount`); assert.ok(!/"(live|projected|soon|quote)"/.test(t), `${what}: no price status`); };
const ROOM = '11111111-1111-4111-8111-111111111111', USER = '22222222-2222-4222-8222-222222222222';
// the tables the routes touch, kept in memory
function fakePool() {
  const concepts = new Map(), drawings = []; let n = 0;
  return { concepts, drawings, async query(sql, args = []) {
    if (/^insert into lab_concepts/i.test(sql)) { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, cat = /values\(\$1,'(\w+)'/.exec(sql)?.[1];
      concepts.set(id, cat ? { id, name: args[0], category: cat, spec: args[1], created_by: args[2], client_id: args[3] } : { id, name: args[0], category: args[1], spec: args[2], created_by: args[3], client_id: args[4] }); return { rows: [{ id }] }; }
    if (/^update lab_concepts set spec = coalesce/i.test(sql)) { const c = concepts.get(args[0]); c.spec = { ...c.spec, ...JSON.parse(args[1]) }; return { rows: [] }; }
    if (/^insert into lab_shoe_drawings/i.test(sql)) { drawings.push({ concept: args[0], view: args[1] }); return { rows: [] }; }
    if (/from lab_concepts/i.test(sql) && concepts.has(args[0])) { const c = concepts.get(args[0]); return { rows: [{ ...c, status: 'draft', role: 'core', twist: '', refs: [], created_at: new Date(), updated_at: new Date() }] }; }
    return { rows: [] };
  } };
}
async function build({ withLab = true } = {}) {
  const pool = fakePool(), app = Fastify(), thumbs = [];
  const authenticate = async req => { req.auth = { sub: USER }; }, gate = async (req, reply) => { if (!withLab) return reply.code(403).send({ error: 'The Design Lab is not switched on for this room' }); req.lab = { clientId: ROOM }; };
  const d = { pool, authenticate, adminOnly: gate, lab: { scope: () => ROOM, charge: async () => null }, getSetting: async () => null, log: { warn() {}, info() {} } };
  registerLabConceptRoutes(app, { ...d, flatThumb: id => thumbs.push(id) }); registerLabShoeDrawRoutes(app, d); registerLabCatalogRoutes(app, { ...d, flatThumb: id => thumbs.push(id) });
  await app.ready(); return { app, pool, thumbs };
}
const pick = fn => labCatalog().items.find(fn);

test('GET /v1/lab/catalog: a page of products with the base each opens on, the groups with their counts, and no price', async () => {
  const { app } = await build();
  const r = await app.inject({ url: '/v1/lab/catalog?q=tumbler&limit=12' }); assert.equal(r.statusCode, 200);
  const j = r.json(); assert.equal(j.count, 1846); assert.ok(j.total >= 30); assert.equal(j.items.length, 12);
  assert.deepEqual(Object.keys(j.items[0]).sort(), ['base', 'brand', 'id', 'name']); assert.ok(j.groups.some(g => g.name === 'Drinkware' && g.count > 20));
  noPrice(r.body, 'a search');
  for (const url of ['/v1/lab/catalog', '/v1/lab/catalog?limit=96&offset=960', '/v1/lab/catalog?group=Bags&limit=96', '/v1/lab/catalog?q=nike', '/v1/lab/catalog?group=Footwear']) noPrice((await app.inject({ url })).body, url);
  const g = (await app.inject({ url: '/v1/lab/catalog?group=Footwear&limit=96' })).json(); assert.ok(g.total > 20 && g.items.every(i => i.base.group === 'Footwear'));
  await app.close();
});

test('POST /v1/lab/concepts/from-catalog: a product of each kind of base becomes the right concept, remembers its product, and answers with no price', async () => {
  const { app, pool, thumbs } = await build();
  const start = async (item, body = {}) => { const r = await app.inject({ method: 'POST', url: '/v1/lab/concepts/from-catalog', payload: { item: item.id, ...body } }); noPrice(r.body, item.name); return { r, j: r.json(), c: pool.concepts.get(r.json().concept?.id) }; };
  // a library sketch
  const tee = pick(i => i.name === 'Gildan Heavy Cotton T-Shirt'), a = await start(tee, { colour: { name: 'Forest', hex: '#2B5D3A' } });
  assert.equal(a.r.statusCode, 201); assert.equal(a.c.name, 'Gildan Heavy Cotton T-Shirt'); assert.equal(a.c.category, 'tops'); assert.equal(a.c.spec.template, 'tee-heavyweight-tee'); assert.equal(a.c.spec.color, '#2b5d3a');
  assert.deepEqual(a.c.spec.catalog, { id: tee.id, name: tee.name, brand: 'Gildan' }); assert.equal(a.c.client_id, ROOM); assert.equal(a.c.created_by, USER);
  assert.match(a.j.studio, /^\/lab\/studio\?concept=[0-9a-f-]{36}&view=front&template=tee-heavyweight-tee$/); assert.equal(a.j.base.kind, 'style');
  // a library bag: its drawings are put in place by the library route
  const bag = pick(i => i.name === 'Nike Brasilia Medium Backpack'), b = await start(bag);
  assert.equal(b.r.statusCode, 201); assert.equal(b.c.category, 'bags'); assert.equal(b.c.spec.libraryBag, 'bag-backpack'); assert.equal(b.c.spec.bag.type, 'backpack'); assert.equal(b.c.spec.catalog.id, bag.id); assert.equal(b.c.client_id, ROOM);
  assert.ok(pool.drawings.filter(x => x.concept === b.c.id).length >= 2, 'the bag\'s views'); assert.match(b.j.studio, /^\/lab\/studio\?concept=[0-9a-f-]{36}&view=front$/);
  // a library shoe
  const shoe = pick(i => i.name === 'AQ Running Shoes'), s = await start(shoe);
  assert.equal(s.r.statusCode, 201); assert.equal(s.c.category, 'footwear'); assert.equal(s.c.spec.libraryShoe, 'footwear-running-daily'); assert.equal(s.c.spec.footwear.style, 'runner'); assert.equal(s.c.spec.catalog.name, 'AQ Running Shoes');
  assert.ok(pool.drawings.filter(x => x.concept === s.c.id).length >= 3, 'the shoe\'s views');
  // a style drawn from its measurements (no sketch): the concept names the style
  const beanie = pick(i => i.name === 'YP Classics Cuffed Beanie'), k = await start(beanie);
  assert.equal(k.r.statusCode, 201); assert.equal(k.c.category, 'headwear'); assert.equal(k.c.spec.style, 'beanie'); assert.equal(k.c.spec.template, 'none'); assert.equal(k.c.spec.catalog.id, beanie.id); assert.equal(k.c.client_id, ROOM);
  assert.ok(thumbs.includes(k.c.id));
  // a product type the Studio gained
  const mug = pick(i => i.name === 'White 11oz Mug'), m = await start(mug);
  if (STYLES.mug) { assert.equal(m.r.statusCode, 201); assert.equal(m.c.spec.style, 'mug'); assert.equal(m.c.spec.template, 'none'); assert.equal(m.c.category, STYLES.mug.category); assert.equal(m.c.spec.catalog.id, mug.id); assert.equal(m.j.base.type, 'mug'); assert.match(m.j.studio, /view=front$/); }
  else assert.equal(m.r.statusCode, 422);
  // what is not a product
  assert.equal((await app.inject({ method: 'POST', url: '/v1/lab/concepts/from-catalog', payload: { item: 'nope:1' } })).statusCode, 422);
  for (const c of pool.concepts.values()) noPrice(c.spec, `the concept ${c.name}`);
  await app.close();
});

test('a room without the Lab cannot browse the catalogue or start from it', async () => {
  const { app, pool } = await build({ withLab: false });
  assert.equal((await app.inject({ url: '/v1/lab/catalog' })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/lab/concepts/from-catalog', payload: { item: labCatalog().items[0].id } })).statusCode, 403);
  assert.equal(pool.concepts.size, 0); await app.close();
});

test('catalogStart: each kind of base goes to the route that makes it', () => {
  const via = name => catalogStart(pick(i => i.name === name)).via;
  assert.equal(via('Champion Long Sleeve T-Shirt'), '/v1/lab/concepts/from-sketch'); assert.equal(via('Fanny Pack'), '/v1/lab/concepts/from-library-bag'); assert.equal(via('Men\'s High Top Leather Sneakers'), '/v1/lab/concepts/from-library-footwear'); assert.equal(via('econscious Everyday Tote'), 'style');
  assert.ok(catalogStart(null).error);
});
