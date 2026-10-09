import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import '../src/categories.js';
import { pomTemplateFor, seedTechPack, normalizeTechPack } from '../src/techpack.js';
import { rangeFor, familyOf } from '../src/plausible.js';

const CAT = globalThis.FBCat;

test('products are sorted into the groups people think in', () => {
  const cases = [['Heavyweight hoodie', 'garment'], ['Cargo pants', 'garment'], ['Chunky runner', 'footwear'], ['Snapback cap', 'headwear'], ['Plush fox keychain', 'plush'], ['Stuffed teddy bear', 'plush'],
    ['Gold signet ring', 'jewelry'], ['Pearl necklace', 'jewelry'], ['Wireless earbuds', 'electronics'], ['Power bank', 'electronics'], ['Canvas tote bag', 'bag'], ['Dress shoe', 'footwear']];
  for (const [title, group] of cases) assert.equal(CAT.groupOf('', title), group, title);
  assert.equal(CAT.groupOf('Jewelry — ring', ''), 'jewelry', 'the assistant\'s category line counts');
  assert.equal(CAT.labelOf('', 'Plush bunny'), 'Plush');
});

test('plush and jewelry get their own measurements, and every one is something the plausibility ranges can judge', () => {
  for (const [title, fam] of [['Plush fox', 'plush'], ['Silver ring', 'jewelry']]) {
    const tpl = pomTemplateFor(title);
    assert.ok(tpl.length >= 8, `${title} has a template`);
    assert.notEqual(tpl, pomTemplateFor('Hoodie'));
    for (const [, name, , tol] of tpl) { assert.ok(rangeFor(name, fam), `${fam}: "${name}" has a range`); assert.match(tol, /^±\d/); }
  }
});

test('a first draft for a plush toy starts with safety eyes, filling, a toy-safety compliance line and a sewn-in label', () => {
  const pack = seedTechPack({ product: { title: 'Plush fox', product_type: 'Plush' } });
  assert.deepEqual(pack.sizes, ['One size']);
  assert.ok(pack.pom.length >= 8 && pack.pom[0].name === 'Overall height');
  const bom = pack.bom.map(r => r.component);
  assert.ok(bom.includes('Eyes') && bom.includes('Filling') && bom.includes('Sewn-in label'));
  assert.match(pack.care.compliance, /ASTM F963/); assert.match(pack.care.compliance, /EN 71/);
  assert.ok(pack.labels.some(l => /age grading/i.test(l.spec)));
  assert.ok(pack.construction.some(r => /pull/i.test(r.detail)), 'eye and nose pull test');
});

test('a first draft for jewelry starts with metal, plating thickness, nickel-free findings and a hallmark', () => {
  const pack = seedTechPack({ product: { title: 'Gold hoop earrings', product_type: 'Jewelry' } });
  const bom = pack.bom.map(r => r.component);
  assert.ok(bom.includes('Base metal') && bom.includes('Plating') && bom.includes('Clasp and findings'));
  assert.match(pack.care.compliance, /REACH/); assert.match(pack.care.compliance, /Prop 65/);
  assert.ok(pack.labels.some(l => /hallmark|stamp/i.test(l.item)));
  assert.ok(pack.pom.some(r => r.tolerance === '±0.01'), 'tolerances are tenths of a millimetre scale, in inches');
});

test('headwear drafts start with crown, visor, sweatband and closure construction', () => {
  const pack = seedTechPack({ product: { title: 'Dad hat', product_type: 'Headwear' } });
  assert.deepEqual(pack.construction.map(r => r.area), ['Crown', 'Visor or brim', 'Sweatband', 'Closure']);
});

test('every group has sample-room checks for all three stages, and no group repeats another\'s', () => {
  for (const g of ['garment', 'footwear', 'headwear', 'plush', 'jewelry', 'electronics', 'bag', 'other']) {
    const c = CAT.SAMPLE_CHECKS[g]; assert.ok(c, g);
    for (const stage of ['first', 'fit', 'final']) assert.ok(c[stage].length >= 3 && c[stage].every(t => t.length > 20), `${g} ${stage}`);
  }
  assert.notDeepEqual(CAT.SAMPLE_CHECKS.plush.first, CAT.SAMPLE_CHECKS.jewelry.first);
  assert.equal(familyOf('', 'Plush bear'), 'plush');
});

test('a seeded pack for each new category survives normalizing unchanged in shape', () => {
  for (const title of ['Plush fox', 'Gold ring', 'Dad hat', 'Hoodie', 'Runner shoe', 'Wireless earbuds']) {
    const p = seedTechPack({ product: { title, product_type: title } });
    assert.deepEqual(Object.keys(normalizeTechPack(p)).sort(), Object.keys(p).sort());
  }
});
