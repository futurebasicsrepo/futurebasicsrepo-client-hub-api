// Build one now (src/make-demo.js): the Make page's recipe panel. A visitor's picks become a real piece (the Lab's recipe, flats and pattern),
// only from what the menu offers; its flats are pictures, never the purchased vector sketches; a new piece counts against a limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import sharp from 'sharp';
import { makeMenu, pieceOf, pieceSpec, piecePack, recipeLink, registerMakeDemoRoutes, MAKE_BASES, PACK_NOTE } from '../src/make-demo.js';

test('the menu: the staple bases, each with the add-ons that suit it, and the colour systems', () => {
  const m = makeMenu();
  assert.deepEqual(m.bases.map(b => b.id), MAKE_BASES);
  const hoodie = m.bases.find(b => b.id === 'hoodie');
  assert.ok(hoodie.addons.some(a => a.id === 'chest-pocket') && !hoodie.addons.some(a => a.id === 'cargo'), 'a cargo pocket is not offered on a hoodie');
  assert.ok(m.systems.length >= 4 && m.systems.every(s => s.colours.every(c => /^#[0-9a-f]{6}$/i.test(c.hex))));
});

test('a piece is only what the menu offers: unknown add-ons dropped, at most four, sorted, so each piece has one key', () => {
  assert.equal(pieceOf({ base: 'mug' }).error, 'Choose a base from the menu');
  const a = pieceOf({ base: 'hoodie', addons: 'wash-vintage,chest-pocket,cargo,nope', system: 'nope', colour: 99 });
  assert.deepEqual(a.addons, ['chest-pocket', 'wash-vintage']); assert.equal(a.system, 'earth'); assert.equal(a.colour, 3);
  assert.equal(a.key, pieceOf({ base: 'hoodie', addons: 'chest-pocket+wash-vintage', system: 'earth', colour: 3 }).key);
  assert.ok(pieceOf({ base: 'tee', addons: 'chest-pocket,placket,neck-mock,wash-acid,wear-edges,contrast' }).addons.length <= 4);
  assert.equal(recipeLink(a), 'hoodie.chest-pocket+wash-vintage.earth.3');
  assert.equal(recipeLink(pieceOf({ base: 'tee' })), 'tee.-.earth.0');
});

test('what the tech pack would say: how it is built, the details, the measurements, the pattern and that it sews together', () => {
  const s = pieceSpec(pieceOf({ base: 'hoodie', addons: 'chest-pocket,zip-pocket', system: 'earth' }));
  assert.ok(s.built.includes('Hood') && s.built.includes('Chest pocket') && s.built.includes('Zip chest pocket'), JSON.stringify(s.built));
  assert.ok(s.measurements.some(m => m.label === 'Chest (flat)' && / in$/.test(m.value)));
  assert.ok(s.pattern.pieces > 5 && s.pattern.sews && /^\d+ of \d+$/.test(s.pattern.seams) && s.pattern.trims.includes('Pocket zip'));
  assert.deepEqual(s.views, ['front', 'back']); assert.equal(s.colour.system, 'Washed earth');
  for (const base of MAKE_BASES) { const t = pieceSpec(pieceOf({ base })); assert.ok(!t.error && t.pattern?.sews, `${base} sews together`); }
});

test('over HTTP: the menu, a piece with its two flats as pictures, and the limit counting only new pieces', async () => {
  let calls = 0; const app = Fastify(); registerMakeDemoRoutes(app, { allowed: () => (++calls <= 2) }); await app.ready();
  const menu = await app.inject('/v1/public/make/menu'); assert.equal(menu.statusCode, 200); assert.match(menu.headers['cache-control'], /public/);
  const r = await app.inject('/v1/public/make/piece?base=tee&addons=chest-pocket&system=earth&colour=1'), j = r.json();
  assert.equal(r.statusCode, 200); assert.equal(j.recipe, 'tee.chest-pocket.earth.1'); assert.match(j.images.front, /^\/v1\/public\/make\/flat\.webp\?base=tee&/);
  const img = await app.inject(j.images.front); assert.equal(img.statusCode, 200); assert.equal(img.headers['content-type'], 'image/webp');
  assert.equal(img.headers['cross-origin-resource-policy'], 'cross-origin'); assert.ok(!img.body.includes('<svg'), 'a picture, not the vector sketch');
  const meta = await sharp(img.rawPayload).metadata(); assert.equal(meta.width, 900);
  assert.equal((await app.inject('/v1/public/make/piece?base=tee&addons=chest-pocket&system=earth&colour=1')).statusCode, 200, 'the same piece again is kept, not counted');
  assert.equal((await app.inject(j.images.front)).statusCode, 200);
  assert.equal(calls, 2);
  const over = await app.inject('/v1/public/make/piece?base=shorts'); assert.equal(over.statusCode, 429);
  assert.equal((await app.inject('/v1/public/make/piece?base=nothing')).statusCode, 400);
  assert.match(j.techpack, /^\/v1\/public\/make\/techpack\.pdf\?base=tee&/);
  await app.close();
  const app2 = Fastify(); registerMakeDemoRoutes(app2); await app2.ready();
  const pdf = await app2.inject(j.techpack); assert.equal(pdf.statusCode, 200); assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.match(pdf.headers['content-disposition'], /attachment; filename="[a-z0-9-]+-tech-pack\.pdf"/); assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
  await app2.close();
});

test('the free tech pack: the pack a Lab piece would have, from its flats, measurements and pattern, saying what is chosen in the Lab', async () => {
  const { pack, name } = await piecePack(pieceOf({ base: 'hoodie', addons: 'chest-pocket,wash-vintage', system: 'earth' }));
  assert.match(name, /hoodie/i); assert.equal(pack.style.sampleSize, 'M'); assert.deepEqual(pack.sizes, ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  assert.ok(pack.pom.length >= 8 && pack.pom.every(r => r.values.M && r.values.XXL), 'graded points of measure');
  assert.deepEqual(pack.sketches.map(k => k.view), ['front', 'back']); assert.ok(pack.sketches.every(k => /^data:image\/png;base64,/.test(k.image)), 'flats as pictures');
  const areas = pack.construction.map(r => r.area.replace(/^Flats · /, ''));
  for (const a of ['Drawing', 'How it is built', 'Wash', 'Pattern', 'Pattern check']) assert.ok(areas.includes(a), `${a} in ${areas}`);
  assert.match(pack.construction.find(r => /Pattern check/.test(r.area)).detail, /^Sews together: \d+ of \d+ seams/);
  assert.ok(pack.bom.some(r => r.component === 'Drawcord') && pack.bom.every(r => !r.cost), 'trims, and no costs on a free pack');
  assert.equal(pack.colorways[0].name, 'Clay'); assert.equal(pack.notes, PACK_NOTE);
});
