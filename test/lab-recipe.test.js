import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_BASES, RECIPE_ADDONS, COLOUR_SYSTEMS, addonsFor, cookRecipe, systemOf, cleanFit, toggleAddon, drawnOn, baseSketch, pocketless } from '../src/lab-recipe.js';
import { STYLES, drawingOf } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';

test('every base cooks with all of its add-ons into clean flats', () => {
  for (const b of RECIPE_BASES) {
    const r = cookRecipe({ base: b.id, addons: addonsFor(b).map(a => a.id), system: 'earth' });
    assert.ok(!r.error, `${b.id}: ${r.error}`);
    // a collar draws the piece on the sketch that has it (a tee with a polo collar is a polo); otherwise it stays the base's style
    const neck = r.addons.map(id => RECIPE_ADDONS.find(a => a.id === id)).find(a => a.sketch?.[b.style]);
    assert.equal(r.params.style, neck ? neck.sketch[b.style][0] : b.style); assert.equal(r.category, STYLES[r.style].category);
    assert.equal(r.params.color, COLOUR_SYSTEMS[0].colours[0].hex);
    assert.equal(r.colourways.length, 4);
  }
});

test('add-ons only go on the bases they suit, and only one of a kind', () => {
  assert.ok(addonsFor('hoodie').some(a => a.id === 'kangaroo'));
  assert.ok(!addonsFor('pants').some(a => a.id === 'kangaroo'));
  const r = cookRecipe({ base: 'pants', addons: ['slant-pockets', 'jean-pockets', 'kangaroo'] });
  assert.deepEqual(r.addons, ['slant-pockets']); // the second front pocket and the kangaroo are dropped
});

test('a detail the chosen sketch already draws is not drawn again', () => {
  const h = cookRecipe({ base: 'hoodie', addons: ['kangaroo'] });
  assert.match(h.sketch, /hood/i); assert.equal(h.params.edits.length, 0); // a hoodie sketch has its kangaroo pocket
  const c = cookRecipe({ base: 'crewneck', addons: ['kangaroo'] });
  assert.deepEqual(c.params.edits.map(e => e.kind), ['pocket-kangaroo']); // a crew does not, so it is added
  const cargo = cookRecipe({ base: 'pants', addons: ['cargo'] });
  assert.match(cargo.template, /cargo/); // the add-on picks the cargo sketch
});

test('a pair of pockets is mirrored, and the next colour is the stitching', () => {
  const r = cookRecipe({ base: 'tee', addons: ['chest-pocket'], system: 'mono', colour: 1 });
  assert.equal(r.params.color, '#f2efe6'); assert.equal(r.params.edits[0].thread, '#3a3a3e');
  assert.deepEqual(r.colourways.map(c => c.name), ['Off white', 'Charcoal', 'Heather grey', 'Black']);
  const s = cookRecipe({ base: 'crewneck', addons: [], system: 'mono' });
  assert.equal(s.params.edits.length, 0);
});

test('a colour system of our own, and the errors', () => {
  const own = systemOf({ name: 'Ours', colours: [{ name: 'Teal', hex: '#00AAAA' }, { hex: 'nope' }] });
  assert.deepEqual(own.colours, [{ name: 'Teal', hex: '#00aaaa' }]);
  assert.equal(cookRecipe({ base: 'tee', system: { colours: [] } }).error, 'That colour system is not known');
  assert.equal(cookRecipe({ base: 'nope' }).error, 'Choose a base to start from');
  assert.ok(RECIPE_ADDONS.every(a => a.on === null || a.on.every(s => STYLES[s]))); // an add-on for any base (contrast) has no list
});

test('women\'s pieces, hats and a tote are on the menu, each with add-ons that suit it', () => {
  for (const id of ['dress', 'skirt', 'cami', 'bodysuit', 'coat', 'bucket', 'beanie', 'tote']) assert.ok(RECIPE_BASES.some(b => b.id === id), id);
  assert.deepEqual(addonsFor('tote').map(a => a.id).sort(), ['contrast', 'front-pocket', 'zip-pocket']);
  assert.deepEqual(addonsFor('beanie'), []); // nothing to add to a beanie, and so no contrast either
  assert.ok(addonsFor('skirt').some(a => a.id === 'slant-side') && addonsFor('dress').some(a => a.id === 'zip-front'));
});

test('a collar is drawn by the sketch that has it, one at a time, and contrast colours the pockets', () => {
  const r = cookRecipe({ base: 'tee', addons: ['neck-polo', 'neck-johnny', 'chest-pocket', 'contrast'], system: 'coastal' });
  assert.deepEqual(r.addons, ['neck-polo', 'chest-pocket', 'contrast']); // the second collar is dropped
  // the collar is not laid over the tee's crew neck: the piece is drawn on the polo sketch, and becomes a polo
  assert.equal(r.style, 'polo'); assert.equal(r.template, 'polo-classic-polo'); assert.ok(!r.params.edits.some(e => e.type === 'part'));
  const pocket = r.params.edits.find(e => e.kind === 'pocket-patch');
  assert.equal(pocket.color, '#e9ece6'); assert.equal(r.colourIndex, 0);
  assert.equal(cookRecipe({ base: 'tee', addons: ['chest-pocket'], system: 'coastal' }).params.edits[0].color, ''); // no contrast: the pocket is the garment's colour
  assert.match(r.name, /classic polo with chest pocket/); assert.equal(r.silhouette, 'Classic polo');
  // every collar names a sketch that exists, of the style it says
  for (const a of RECIPE_ADDONS.filter(x => x.sketch)) for (const [base, [style, id]] of Object.entries(a.sketch)) {
    const t = FLAT_TEMPLATES.find(x => x.id === id); assert.ok(t && t.style === style, `${a.id} on ${base}: ${id}`);
    assert.ok(addonsFor(RECIPE_BASES.find(b => b.style === base)?.id || base).some(x => x.id === a.id) || !RECIPE_BASES.some(b => b.style === base), `${a.id} is offered on ${base}`);
  }
  assert.equal(cookRecipe({ base: 'crewneck', addons: ['neck-rugby'] }).template, 'polo-rugby-collar-sweatshirt');
});

test('fitting it together: the base\'s width and length stretch the sketch, and each add-on is sized and moved', () => {
  assert.deepEqual(cleanFit({ m: { width: 9, length: 'x' }, adjust: { 'chest-pocket': { size: 1.42 }, 'BAD id': { size: 2 }, kangaroo: { size: 1, dy: 0 } } }),
    { m: { width: 6 }, adjust: { 'chest-pocket': { size: 1.4, dy: 0, dx: 0 } } }); // clamped, rounded, and nothing kept that changes nothing
  const plain = cookRecipe({ base: 'tee', addons: ['chest-pocket'] }), d0 = drawingOf(plain.params);
  const wide = cookRecipe({ base: 'tee', addons: ['chest-pocket'], fit: { m: { width: 4 } } }), short = cookRecipe({ base: 'tee', addons: ['chest-pocket'], fit: { m: { length: -4 } } });
  assert.equal(wide.params.m.chest, plain.params.m.chest + 2); assert.equal(short.params.m.length, plain.params.m.length - 4);
  // wider: the drawing is wider for the same height; shorter: the same width, less tall
  assert.ok(drawingOf(wide.params).sx < d0.sx && Math.abs(drawingOf(wide.params).sy - d0.sy) < 1e-9);
  assert.ok(drawingOf(short.params).sy > d0.sy && Math.abs(drawingOf(short.params).sx - d0.sx) < 1e-9);
  const big = cookRecipe({ base: 'tee', addons: ['chest-pocket'], fit: { adjust: { 'chest-pocket': { size: 1.5, dy: -1, dx: .5 } } } });
  const p0 = plain.params.edits[0], p1 = big.params.edits[0];
  assert.equal(p1.w, Math.round(p0.w * 1.5 * 8) / 8); assert.equal(p1.y, p0.y - 1); assert.equal(p1.x, p0.x + .5);
  assert.deepEqual(big.fit.adjust['chest-pocket'], { size: 1.5, dy: -1, dx: .5 });
  // a pair moves apart (or closer) together, mirrored
  const pair = cookRecipe({ base: 'skirt', addons: ['slant-side'], fit: { adjust: { 'slant-side': { dx: 1 } } } }).params.edits, pair0 = cookRecipe({ base: 'skirt', addons: ['slant-side'] }).params.edits;
  assert.equal(Math.abs(pair[0].x), Math.abs(pair0[0].x) + 1); assert.equal(pair[1].x, -pair[0].x);
});

// what a client sees: every chip on the menu changes the drawing, or says the sketch already has it
test('every add-on a base offers changes the drawing, or is shown as already on the sketch', () => {
  const look = r => JSON.stringify([r.template, r.style, r.params.edits.map(e => [e.kind, e.x, e.y, e.w, e.h, e.color]), r.params.options || null]);
  for (const b of RECIPE_BASES) {
    const plain = look(cookRecipe({ base: b.id })), drawn = drawnOn(b);
    for (const a of addonsFor(b)) {
      if (drawn.includes(a.id)) continue;
      // contrast colours the pockets: it is checked with a pocket on
      const pocket = addonsFor(b).find(x => cookRecipe({ base: b.id, addons: [x.id] }).params.edits.some(e => /^pocket/.test(e.kind)));
      if (a.contrast) { if (pocket) assert.notEqual(look(cookRecipe({ base: b.id, addons: [pocket.id, a.id], system: 'coastal' })), look(cookRecipe({ base: b.id, addons: [pocket.id], system: 'coastal' })), `contrast on ${b.id}`); continue; }
      assert.notEqual(look(cookRecipe({ base: b.id, addons: [a.id] })), plain, `${a.label} on ${b.label} changes nothing`);
    }
  }
  assert.ok(pocketless('pants') && !pocketless('tee', ['chest-pocket'])); // contrast waits for a pocket it can colour
  assert.ok(drawnOn('hoodie').includes('kangaroo')); // the pullover hoodie draws its kangaroo pocket
  assert.ok(!drawnOn('hoodie', ['cropped']).includes('kangaroo')); // the cropped hoodie does not, so it can be added
});

test('a second pocket in the same place replaces the first, and one change of sketch replaces another', () => {
  assert.deepEqual(toggleAddon(['chest-pocket'], 'flap-pocket', 'shirt'), ['flap-pocket']);
  assert.deepEqual(toggleAddon(['flap-pocket'], 'flap-pocket', 'shirt'), []);
  const s = cookRecipe({ base: 'shirt', addons: ['flap-pocket'] });
  assert.equal(s.params.edits.filter(e => /^pocket/.test(e.kind)).length, 1); // the shirt's sketch has no pocket of its own to stack it on
  assert.equal(baseSketch(RECIPE_BASES.find(b => b.id === 'shirt')), 'shirt-classic-shirt');
  const t = toggleAddon(['neck-polo'], 'neck-johnny', 'tee'); assert.deepEqual(t, ['neck-johnny']);
});

test('a button-down collar puts a button on each collar point', () => {
  const r = cookRecipe({ base: 'shirt', addons: ['neck-buttondown'] });
  const b = r.params.edits.filter(e => e.kind === 'button');
  assert.equal(b.length, 2); assert.equal(b[0].x, -b[1].x); assert.ok(b[0].y > 3 && b[0].y < 8, `${b[0].y}`);
});
