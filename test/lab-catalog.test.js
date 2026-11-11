// The supplier catalogue as the Design Lab shows it to clients (src/lab-catalog.js): every product sent, by its name, to the Studio base it opens
// on, and never a price.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, labCatalog, labCatalogItem, browseLabCatalog, labCatalogSummary, RULES, SKETCH, GROUPS } from '../src/lab-catalog.js';
import { loadCatalogs } from '../src/price-catalog.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { BAG_TEMPLATES } from '../src/lab-bag-templates.js';
import { FOOTWEAR_TEMPLATES } from '../src/lab-footwear-templates.js';
import { GOODS } from '../src/lab-goods.js';

const items = loadCatalogs().flatMap(c => c.items);
const where = name => { const b = classify(name); return b ? (b.kind === 'style' ? `${b.style}/${b.template || '-'}` : b.kind === 'new' ? `new/${b.type}` : `${b.kind}/${b.template}`) : null; };

// names from the catalogue, each pinned to the base it must open on
const TABLE = [
  // clothes: the style and the closest library sketch
  ['Gildan Heavy Cotton T-Shirt', 'tee/tee-heavyweight-tee'], ['AS Colour Classic Tee (5026)', 'tee/tee-classic'], ['Women\'s Washed Cropped Tee', 'tee/tee-cropped-tee'], ['Tultex Unisex Fine Jersey Raglan T-Shirt', 'tee/tee-raglan'],
  ['Bella + Canvas Unisex Jersey Short Sleeve V-Neck Tee', 'tee/tee-vneck'], ['Soccer Jersey', 'tee/tee-soccer-jersey'], ['Men\'s Short Sleeve Baseball Jersey', 'tee/tee-sports-jersey'],
  ['Champion Long Sleeve T-Shirt', 'longsleeve/ls-long-sleeve-tee'], ['Dune-Washed Boxy Long Sleeve Tee', 'longsleeve/ls-long-sleeve-boxy-tee'], ['BELLA + CANVAS Unisex Three-Quarter Sleeve Baseball Tee', 'longsleeve/ls-raglan-long-sleeve-tee'],
  ['Gildan Heavy Blend Crewneck Sweatshirt', 'crewneck/crew-heavy'], ['Unisex French Terry Crewneck', 'crewneck/crew-classic'], ['Nike Therma-FIT 1/4-Zip Fleece', 'crewneck/crew-quarter-zip-sweatshirt'], ['Custom Knits: Men\'s Turtleneck Pullover', 'crewneck/crew-classic'],
  ['Gildan Heavy Blend Hooded Sweatshirt', 'hoodie/hood-classic'], ['Boxy Loopback Hoodie', 'hoodie/hood-boxy'], ['Women\'s Cropped Washed Fleece Hoodie', 'hoodie/hood-cropped-hoodie'],
  ['Gildan Heavy Blend Full-Zip Hooded Sweatshirt', 'ziphoodie/zip-classic'], ['Women\'s Cropped Fleece Zip Hoodie', 'ziphoodie/zip-cropped'],
  ['Vintage Washed Denim Jacket', 'jacket/jk-denim-jacket'], ['Custom Knits: Men\'s Zipped Bomber Jacket', 'jacket/jk-bomber'], ['Men\'s Track Jacket', 'jacket/jk-track'], ['Custom Knits: Men\'s Shawl Collar Cardigan', 'jacket/jk-button-cardigan'],
  ['Men\'s Denim Vest Center Back Print Only', 'vest/vest-denim-vest'], ['Men\'s All Over Print Bathrobe', 'coat/coat-belted-trench-jacket'],
  ['054X Hanes Ecosmart® Jersey Polo', 'polo/polo-classic-polo'], ['Brushed Fleece Polo Sweatshirt', 'polo/polo-johnny-collar-sweatshirt'], ['Dickies Unisex Long-Sleeve Work Shirt', 'shirt/shirt-utility-shirt'], ['Hawaiian / Camp Shirt', 'shirtss/ss-camp-collar-shirt'],
  ['Gildan Heavy Cotton Tank Top', 'tank/tank-classic-tank'], ['Bella+Canvas Women’s Jersey Muscle Tank', 'tank/tank-muscle-tank'], ['Basketball Jersey', 'tank/tank-classic-tank'],
  ['Stanley/Stella Unisex Flyer Jogger', 'pants/pt-classic-joggers'], ['Hanes Unisex EcoSmart Sweatpants - P650', 'pants/pt-jogger'], ['Men\'s Lounge Pants 6 oz', 'pants/pt-straight-sweatpants'], ['Men\'s Jogger NY Fleece', 'pants/pt-classic-joggers'],
  ['Basketball Shorts w/ Pockets', 'shorts/sh-mesh-basketball-shorts'], ['Champion Reverse Weave Shorts', 'shorts/sh-sweat'], ['Sport-Tek LST485 Women\'s Repeat Short', 'shorts/sh-sweat'], ['Men\'s All Over Print Boxer Briefs', 'shorts/sh-boxer-briefs'],
  ['BELLA + CANVAS Women’s Leggings', 'leggings/lg-leggings'], ['Brushed Suede Skater Skirt', 'skirt/sk-flared-mini-skirt'], ['T-Shirt Dress 6 oz', 'dress/dr-t-shirt-dress'], ['Custom Knits: Baby\'s Bodysuit', 'bodysuit/bs-crew-tee-bodysuit'],
  ['Richardson Trucker Visor', 'cap/cap-6panel'], ['YP Classics Classic Dad Hat', 'cap/cap-6panel'], ['Sportsman - Bucket Cap', 'bucket/bucket-bucket-hat'], ['YP Classics Cuffed Beanie', 'beanie/-'],
  // the catalogue's own section is not trusted: these sit under "Accessories / Bags" and are tees and polos
  ['Bayside Union-Made Long Sleeve T-Shirt', 'longsleeve/ls-long-sleeve-tee'], ['Paragon Women\'s Lady Palm Three-Quarter Sleeve Polo', 'polo/polo-long-sleeve-polo'], ['Rabbit Skins Toddler Flutter Sleeve Tee', 'tee/tee-classic'],
  // bags and shoes from the libraries
  ['econscious Everyday Tote', 'tote/-'], ['Weekender Tote', 'bag/bag-tote'], ['Nike Brasilia Medium Backpack', 'bag/bag-backpack'], ['Nike Brasilia Drawstring Pack', 'bag/bag-drawstring'], ['Carhartt Foundry Series 20" Duffel', 'bag/bag-duffel'],
  ['Fanny Pack', 'bag/bag-waist'], ['Dopp Kit', 'bag/bag-pouch'], ['Sling Bag', 'bag/bag-sling'], ['Journey Laptop Messenger & Shoulder Bag', 'bag/bag-messenger'], ['Liberty Bags Double Bottle Wine Tote', 'bag/bag-tote'],
  ['Men\'s High Top Leather Sneakers', 'shoe/footwear-lifestyle-basketball-high'], ['Classic Rubber Low Top Canvas Shoes', 'shoe/footwear-lifestyle-court-low'], ['AQ Running Shoes', 'shoe/footwear-running-daily'],
  // the product types the Studio did not have
  ['White 11oz Mug', 'new/mug'], ['20oz Stainless Steel Tumbler', 'new/tumbler'], ['Personalized 40oz Stainless Steel Tumbler With A Handle and Straw', 'new/tumblerhandle'], ['Personalized Stainless Steel 20oz Car Tumbler in US', 'new/tumbler'],
  ['Thor Copper Vacuum Insulated Bottle 22oz', 'new/bottle'], ['Soda Can Glass 16oz', 'new/canglass'], ['Pint Glass 16 oz', 'new/pintglass'], ['Stemless Wine Glass 15oz', 'new/wineglass'],
  ['Matte Poster', 'new/poster'], ['Gallery Wrapped Canvas', 'new/canvas'], ['Metal Print', 'new/sign'], ['Indoor Wall Tapestry', 'new/tapestry'], ['Flag w/ Grommets', 'new/flag'],
  ['Spun Polyester Pillow', 'new/pillow'], ['Microfiber Pillowcase', 'new/pillowcase'], ['Hooded Sherpa Fleece Blanket', 'new/blanket'], ['Travel Blanket with Zipper Pouch', 'new/blanket'], ['Premium Beach Towel', 'new/towel'],
  ['Shower Curtain', 'new/showercurtain'], ['Woven Tapestry Stocking with Green Backing', 'new/stocking'], ['Poly Twill Apron', 'new/apron'], ['Area Rug', 'new/rug'],
  ['iPhone 15 Phone Case', 'new/phonecase'], ['Mouse Pad', 'new/mousepad'], ['Wireless Charging Rubber RGB Desk Pad Gaming Led Mouse Pad', 'new/deskmat'], ['Laptop Sleeve - 13"', 'new/laptopsleeve'], ['Laptop Backpack', 'bag/bag-backpack'],
  ['Custom Shape Stickers', 'new/sticker'], ['Puzzle (500)', 'new/puzzle'], ['Pet Bandana', 'new/bandana'], ['Car Pet Seat Cover', 'new/seatcover'], ['Pet Bowl', 'new/petbowl'], ['Custom Knits: Dog Hoodie', 'new/pettee'],
  ['Rubber Yoga Mat', 'new/yogamat'], ['Car Mats (2x Front)', 'new/carmat'], ['Crew Socks', 'new/socks'], ['Chiffon Scarf', 'new/scarf'], ['Flip Flops', 'new/flipflop'], ['Men\'s Slide Sandals', 'new/slide'],
  ['Rabbit Skins Premium Jersey Bandana Bib', 'new/bib'], ['Lunch Bag', 'new/cooler'], ['Physical Music — Vinyl, CD & Cassette', 'new/recordsleeve'],
  // the fallback: a plain panel
  ['Massage Gun', 'new/other'], ['Bottle Opener', 'new/other'], ['Polyester Door Socks', 'new/other']
];

test('the classifier sends each named product to the base it opens on', () => {
  assert.ok(TABLE.length >= 60, 'at least sixty names are pinned');
  for (const [name, want] of TABLE) {
    assert.ok(items.some(i => i.name === name), `"${name}" is a product in the catalogue`);
    assert.equal(where(name), want, name);
  }
});

test('every one of the 1,846 products gets a base from a rule; the plain-panel fallback holds under 3% of them', () => {
  assert.equal(items.length, 1846);
  const none = items.filter(i => !classify(i.name)).map(i => i.name);
  assert.deepEqual(none, [], 'no product is left without a rule');
  const s = labCatalogSummary();
  assert.equal(s.count, 1846);
  assert.equal(Object.values(s.kinds).reduce((a, b) => a + b, 0), 1846, 'every product is on one kind of base');
  assert.equal(s.other, 54, 'the products on the plain panel (change this number with the rules, on purpose)');
  assert.ok(s.other / s.count < .03, `${s.other} of ${s.count} on the fallback is under 3%`);
  assert.deepEqual(s.kinds, { style: 1158, bag: 113, shoe: 30, new: 545 });
});

test('every base a rule names exists: a library sketch of that style, a library bag, a library shoe or a product type', () => {
  for (const [key] of RULES) assert.ok(key.startsWith('bag-') ? BAG_TEMPLATES.some(t => t.id === key) : key.startsWith('footwear-') ? FOOTWEAR_TEMPLATES.some(t => t.id === key) : Boolean(GOODS[key] || SKETCH[key]), `rule base ${key}`);
  for (const [style, list] of Object.entries(SKETCH)) for (const s of list) { const id = Array.isArray(s) ? s[1] : s; if (id) assert.ok(FLAT_TEMPLATES.some(t => t.id === id && t.style === style), `${id} is a ${style} sketch`); }
  for (const i of labCatalog().items) { assert.ok(GROUPS.includes(i.base.group), `${i.name}: group ${i.base.group}`); assert.ok(i.base.label); }
  // each product type the Studio gained has at least one product; none is declared and unused
  const used = labCatalogSummary().types; for (const k of Object.keys(GOODS)) assert.ok(used[k] > 0, `product type ${k} has products`);
});

// what we pay the supplier never leaves src/price-catalog.js: not a cost, not a price status, not a dollar amount
const noPrice = (json, what) => { const t = typeof json === 'string' ? json : JSON.stringify(json);
  assert.ok(!/costCents/i.test(t), `${what}: no costCents`); assert.ok(!/"price"/i.test(t) && !/price/i.test(t), `${what}: no price`); assert.ok(!/\$\s?\d/.test(t), `${what}: no dollar amount`); assert.ok(!/"(live|projected|soon|quote)"/.test(t), `${what}: no price status`); };

test('the Lab\'s catalogue carries id, name, brand and base, and no price', () => {
  for (const i of labCatalog().items.slice(0, 400)) assert.deepEqual(Object.keys(labCatalogItem(i.id)).sort(), ['base', 'brand', 'id', 'name']);
  const all = browseLabCatalog({ limit: 96 }); assert.equal(all.count, 1846); assert.equal(all.total, 1846); assert.equal(all.items.length, 96);
  assert.equal(all.groups.reduce((a, g) => a + g.count, 0), 1846, 'the groups add up to the catalogue');
  // every page of the whole catalogue, and a few searches
  for (let o = 0; o < 1846; o += 96) noPrice(browseLabCatalog({ limit: 96, offset: o }), `page at ${o}`);
  for (const q of ['tumbler', 'tee', 'nike', 'blanket', 'mug 11oz']) noPrice(browseLabCatalog({ q }), `search ${q}`);
  assert.ok(loadCatalogs().flatMap(c => c.items).some(i => i.costCents > 0), 'the staff catalogue does carry costs (so the check above means something)');
});

test('browsing: every word must match, a group narrows, pages do not overlap', () => {
  const t = browseLabCatalog({ q: 'tumbler' }); assert.ok(t.total >= 30); assert.ok(t.items.every(i => /tumbler|bottle|flask/i.test(`${i.name} ${i.base.label}`)), 'tumblers and their like, by name or by what they open on');
  const th = browseLabCatalog({ q: 'tumbler handle' }); assert.ok(th.total > 0 && th.total < t.total); assert.ok(th.items.every(i => /handle/i.test(`${i.name} ${i.base.label}`)));
  assert.equal(browseLabCatalog({ q: 'zzzz' }).total, 0);
  const d = browseLabCatalog({ group: 'Drinkware', limit: 96 }); assert.ok(d.total > 90); assert.ok(d.items.every(i => i.base.group === 'Drinkware'));
  const a = browseLabCatalog({ limit: 10 }), b = browseLabCatalog({ limit: 10, offset: 10 }); assert.equal(new Set([...a.items, ...b.items].map(i => i.id)).size, 20);
  assert.equal(labCatalogItem('openwav-fall-2026:999999'), null);
});
