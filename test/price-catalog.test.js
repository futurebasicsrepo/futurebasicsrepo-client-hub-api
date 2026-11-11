import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogs, searchCatalog, suggestFor, catalogSummary, wordsOf, productHead, itemHead } from '../src/price-catalog.js';
import { kindOf } from '../src/product-sheet.js';

const cats = loadCatalogs(), ow = cats.find(c => c.key === 'openwav-fall-2026');
const sug = (title, n = 5) => suggestFor({ title, kind: kindOf(title) }, n);

test('the OpenWav Fall 2026 catalogue is whole: every item the catalogue counts, in its sections, priced the way it says', () => {
  assert.ok(ow, 'the catalogue file is read');
  assert.equal(ow.items.length, 1846, 'all 1,846 products');
  assert.equal(ow.sections.reduce((a, s) => a + s.count, 0), 1846, 'the sections add up');
  const byCat = Object.fromEntries(catalogSummary()[0].categories.map(c => [c.name, c.count]));
  assert.deepEqual(byCat, { Apparel: 1102, Accessories: 298, 'Home & Living': 196, Drinkware: 103, Tech: 52, 'Wall Art & Print': 19, 'Sports & Outdoors': 40, Pets: 27, Automotive: 8, 'Physical Music': 1 }, "each category holds what the catalogue's index says");
  for (const s of ow.sections) assert.equal(ow.items.filter(i => i.category === s.category && i.section === s.name).length, s.count, `${s.category} / ${s.name}`);
  const priced = ow.items.filter(i => i.costCents != null);
  assert.equal(priced.length, 1728); assert.ok(priced.every(i => Number.isInteger(i.costCents) && i.costCents > 0 && ['live', 'projected'].includes(i.price)), 'a priced item has whole cents and says live or projected');
  assert.ok(ow.items.filter(i => i.costCents == null).every(i => ['soon', 'quote'].includes(i.price)), 'an unpriced one says why');
  const find = n => ow.items.find(i => i.name === n);
  assert.equal(find('Carhartt Tall Duck Detroit Jacket').costCents, 14654); assert.equal(find('Beach Wrap').costCents, 3055); assert.equal(find('Carhartt Tall Duck Detroit Jacket').brand, 'Carhartt');
  assert.equal(find("Men's Short Sleeve Baseball Jersey").price, 'projected'); assert.equal(find('Physical Music — Vinyl, CD & Cassette').price, 'quote');
  assert.equal(ow.items.filter(i => i.name === 'Crew Socks').length, 2, 'two entries printed on one row are two items');
  assert.ok(ow.items.every(i => i.name && !/from \$|PRODUCTS$| {2}/.test(i.name) && i.name.length < 120), 'no name swallowed a price or a heading');
  assert.ok(ow.items.some(i => i.costCents === 100450), 'a price over a thousand keeps its comma');
});

test('search: every word typed must be in the item, and a word stands for its like', () => {
  const r = searchCatalog({ q: 'carhartt jacket' }); assert.ok(r.total >= 3 && r.items.every(i => /carhartt/i.test(i.name) && /jacket/i.test(i.name)), 'both words');
  const tees = searchCatalog({ q: 'tee', limit: 200 }).items; assert.ok(tees.some(i => /t-shirt/i.test(i.name)) && /\btee\b/i.test(tees[0].name), '"tee" finds T-Shirts too, after the items that say tee');
  assert.equal(searchCatalog({ q: 'zzzz nothing' }).total, 0); assert.equal(searchCatalog({}).total, 1846, 'no words lists everything');
  assert.equal(searchCatalog({ category: 'Drinkware' }).total, 103); assert.ok(searchCatalog({ q: 'bottle', category: 'Drinkware' }).items.every(i => i.category === 'Drinkware'));
  assert.equal(searchCatalog({ q: 'hoodie', limit: 3 }).items.length, 3); assert.ok(searchCatalog({ q: 'hoodie', limit: 5000 }).items.length <= 200, 'a list is never the whole catalogue at once');
  const nb = searchCatalog({ q: 'notebook', limit: 200 }).items, firstBare = nb.findIndex(i => i.costCents == null); assert.ok(nb.length && firstBare > 0 && nb.slice(firstBare).every(i => i.costCents == null), 'priced items lead; the ones with no price yet follow');
  assert.ok(!('words' in searchCatalog({ q: 'cap' }).items[0]), 'an item is returned without its working fields');
});

test('suggestions: the thing itself counts most, and a loose word in common is not a likeness', () => {
  assert.equal(productHead('Cap — Tan'), 'cap'); assert.equal(productHead('Long Sleeve "Yosemite"'), 'longsleeve'); assert.equal(productHead('The Ocho: Ouster FC Jersey'), 'jersey'); assert.equal(productHead('Ouster Wide-Mouth Bottle V2'), 'bottle');
  assert.equal(itemHead('1801GD - LA Apparel - Heavyweight T-shirt'), 'tshirt'); assert.equal(itemHead('Wooden Jigsaw Puzzle (300 Pcs)'), 'puzzle'); assert.equal(itemHead("Custom Knits: Women's Pencil Skirt"), 'skirt');
  assert.deepEqual(wordsOf("Men's T-Shirts & Caps"), ['tshirt', 'cap']);
  assert.ok(sug('Water Bottle').every(i => /bottle|tumbler/i.test(i.name)) && sug('Water Bottle').length >= 3, 'a bottle is offered bottles');
  assert.ok(sug('Cap — Tan').every(i => /cap|hat/i.test(i.name)), 'a cap is offered caps, whatever its colour is called');
  assert.ok(sug('Sensor Lineup Tee - Natural').every(i => i.section === 'T-Shirts'), 'a tee is offered T-shirts');
  assert.ok(/Detroit Jacket/.test(sug('Carhartt Detroit Jacket')[0].name), 'the same brand and style comes first');
  assert.ok(sug('Impossible Puzzle').every(i => /puzzle/i.test(i.name)), 'a puzzle, with no kind of its own, by its name');
  for (const t of ['Kaweco Steel Pen', 'Multitool', 'Pencil Pack', 'Ouster Protective Balm — Black', '']) assert.deepEqual(sug(t), [], `${t || '(no name)'}: nothing alike, so nothing is offered (not a steel tumbler for a steel pen)`);
  assert.ok(sug('Heavyweight Hoodie', 3).length === 3 && sug('Heavyweight Hoodie').every(i => i.costCents != null), 'priced items are what is offered when there are any');
});
