import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_BASES, RECIPE_ADDONS, COLOUR_SYSTEMS, addonsFor, cookRecipe, systemOf } from '../src/lab-recipe.js';
import { STYLES } from '../src/lab-flats.js';

test('every base cooks with all of its add-ons into clean flats', () => {
  for (const b of RECIPE_BASES) {
    const r = cookRecipe({ base: b.id, addons: addonsFor(b).map(a => a.id), system: 'earth' });
    assert.ok(!r.error, `${b.id}: ${r.error}`);
    assert.equal(r.params.style, b.style); assert.equal(r.category, STYLES[b.style].category);
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
  assert.ok(RECIPE_ADDONS.every(a => a.on.every(s => STYLES[s])));
});
