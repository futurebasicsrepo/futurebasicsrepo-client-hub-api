import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyOf, rangeFor, fixUnitSlip, auditRows, FAMILY_NAMES } from '../src/plausible.js';

// Real measurements (inches) a factory would recognise, per family: every one must be accepted.
const REAL = {
  top: { 'Across shoulder': [16, 19, 22], 'Chest width': [18, 22, 26], 'Body length HPS': [26, 28, 30], 'Sleeve length': [8, 24, 34], 'Bicep': [7, 8.5, 10], 'Cuff opening': [3, 3.5, 4.5], 'Hem width': [19, 22, 25], 'Neck width': [6.5, 7.5, 8.5], 'Front neck drop': [2.5, 3.5], 'Hood height': [13, 15], 'Pocket width': [5, 6], 'Armhole': [9, 10.5, 12] },
  bottom: { 'Waist relaxed': [13, 16, 20], 'Waist extended': [18, 22, 28], 'Front rise': [9, 11, 12.5], 'Back rise': [13, 14.5], 'Inseam': [2, 5, 30, 32, 34], 'Thigh': [10, 12, 14], 'Knee': [8, 9, 10], 'Leg opening': [6.5, 7.5, 9], 'Hip': [18, 21, 23], 'Waistband height': [1.5, 2] },
  dress: { 'Chest width': [16, 18], 'Waist': [14, 16], 'Hip': [19, 21], 'Body length HPS': [32, 40, 56, 62], 'Hem width': [24, 32, 60], 'Strap width': [0.5, 1] },
  outerwear: { 'Chest width': [21, 24, 28], 'Body length HPS': [25, 28, 34, 48], 'Sleeve length': [24, 26, 28], 'Hood height': [14, 16], 'Zipper length': [24, 28] },
  footwear: { 'Outsole length': [4.5, 9.5, 11.5, 12.5], 'Forefoot width (outsole)': [3.4, 4, 4.4], 'Heel width (outsole)': [2.3, 2.9, 3.2], 'Heel height': [0.5, 1.2, 2.4, 4.5], 'Forefoot stack': [0.5, 0.9, 1.3], 'Toe spring': [0.3, 0.6, 1], 'Collar height (lateral)': [2, 3.5, 5.5], 'Shaft height': [6, 12, 16], 'Topline opening': [10, 12], 'Lace length': [36, 45, 54] },
  headwear: { 'Crown circumference': [20.5, 22.5, 23.5, 24.5], 'Crown height': [3.5, 4, 5], 'Visor length': [2.5, 3, 3.5], 'Visor width': [7, 8, 9], 'Sweatband height': [1, 1.5], 'Cuff height': [2.5, 3.5], 'Beanie height': [8, 10] },
  bag: { 'Width': [4, 11, 15, 22], 'Height': [6, 14, 17, 20], 'Depth / gusset': [1, 4, 6], 'Handle drop': [8, 10, 12], 'Strap length': [22, 30, 55], 'Opening width': [9, 14], 'Zipper length': [8, 12] },
  plush: { 'Overall height': [3, 6, 12, 18, 36], 'Body width': [2, 5, 10], 'Body depth': [1.5, 4, 9], 'Head circumference': [6, 14, 24], 'Ear length': [1, 3, 6], 'Arm length': [1.5, 4], 'Leg length': [2, 5], 'Tail length': [0.5, 4], 'Nose width': [0.5, 1.5], 'Eye diameter': [0.3, 0.8], 'Seam allowance': [0.25, 0.375], 'Ribbon length': [8, 20] },
  small: { 'Length': [1, 2, 3.5], 'Width': [0.5, 1.5, 2.5], 'Thickness': [0.1, 0.25], 'Chain length': [2, 4, 8], 'Ring diameter': [0.8, 1.1] },
  jewelry: { 'Ring inner diameter': [0.6, 0.7, 0.8], 'Necklace length': [16, 18, 24], 'Bracelet length': [6.5, 7.5], 'Earring drop': [0.5, 1.5, 3], 'Pendant height': [0.5, 1.2] },
  eyewear: { 'Lens width': [1.8, 2.1], 'Bridge': [0.6, 0.7], 'Temple length': [5.3, 5.7], 'Frame width': [5.2, 5.8] },
  belt: { 'Length': [38, 42, 46], 'Width': [1, 1.5, 1.75], 'Hole pitch': [1], 'Buckle width': [1.5, 2.5] },
  flat: { 'Length': [10, 60, 72, 80, 90], 'Width': [8, 12, 50, 60], 'Fringe length': [2, 3] },
  hosiery: { 'Foot length': [8, 9.5, 11], 'Leg height': [4, 7, 14], 'Palm width': [3.5, 4], 'Glove length': [9, 10] },
  drink: { 'Height': [6, 8, 10.5], 'Diameter': [2.5, 3, 3.5], 'Mouth opening': [1.5, 2.2], 'Base diameter': [2.5, 3] },
  tech: { 'Length': [5.5, 6.1, 6.7], 'Width': [2.8, 3, 3.1], 'Thickness': [0.2, 0.4, 0.8], 'Cable length': [6, 36, 72] },
  box: { 'Length': [4, 8, 14], 'Width': [3, 6, 10], 'Height': [1, 3, 8] }
};
// Values no real product has, or the classic slips: wrong order of magnitude, a unit slip left uncorrected.
const ABSURD = {
  top: { 'Chest width': [2, 90, 300], 'Body length HPS': [1, 120], 'Sleeve length': [0.2, 80], 'Neck width': [0.5, 40] },
  bottom: { 'Waist relaxed': [1, 120], 'Inseam': [0, 120], 'Thigh': [1, 60] },
  dress: { 'Body length HPS': [2, 150] },
  outerwear: { 'Chest width': [3, 100], 'Sleeve length': [1, 90] },
  footwear: { 'Outsole length': [1.5, 30], 'Forefoot width (outsole)': [1.5, 12], 'Heel width (outsole)': [0.55, 9], 'Heel height': [12], 'Collar height (lateral)': [0.1, 20] },
  headwear: { 'Crown circumference': [6, 60], 'Visor length': [0.1, 14] },
  bag: { 'Width': [0.5, 150], 'Depth / gusset': [0.05, 60], 'Strap length': [2, 200] },
  plush: { 'Overall height': [0.2, 300], 'Ear length': [0.05, 40], 'Seam allowance': [2, 8] },
  small: { 'Length': [0.05, 60], 'Thickness': [0.001, 12] },
  jewelry: { 'Ring inner diameter': [0.05, 5], 'Necklace length': [1, 120] },
  eyewear: { 'Temple length': [1, 14] },
  belt: { 'Length': [2, 150], 'Width': [0.05, 12] },
  flat: { 'Length': [0.2, 400], 'Width': [0.1, 300] },
  hosiery: { 'Foot length': [0.5, 40] },
  drink: { 'Height': [0.4, 80], 'Diameter': [0.2, 30] },
  tech: { 'Thickness': [0.005, 12], 'Length': [0.2, 60] },
  box: { 'Length': [0.1, 200] }
};

test('every family has real-world measurements inside its ranges', () => {
  for (const [fam, rows] of Object.entries(REAL)) for (const [name, vals] of Object.entries(rows)) {
    const r = rangeFor(name, fam); assert.ok(r, `${fam}: "${name}" has a range`);
    for (const v of vals) assert.ok(v >= r.lo && v <= r.hi, `${fam} · ${name} = ${v} should be inside ${r.lo}–${r.hi}`);
  }
});
test('absurd values are outside the ranges in every family', () => {
  for (const [fam, rows] of Object.entries(ABSURD)) for (const [name, vals] of Object.entries(rows)) {
    const r = rangeFor(name, fam); assert.ok(r, `${fam}: "${name}" has a range`);
    for (const v of vals) assert.ok(v < r.lo || v > r.hi, `${fam} · ${name} = ${v} should be outside ${r.lo}–${r.hi}`);
  }
});
test('every family in the table is covered by the tests', () => {
  for (const f of FAMILY_NAMES.filter(f => f !== 'generic')) assert.ok(REAL[f] && ABSURD[f], `family ${f} has real and absurd cases`);
});
test('names that are not lengths are never judged', () => {
  for (const n of ['Weight', 'Capacity (ml)', 'Stitches per inch', 'Fabric GSM', 'Shrinkage %', 'Hang angle']) assert.equal(rangeFor(n, 'top'), null, n);
  assert.equal(rangeFor('', 'top'), null);
});
test('family detection reads the category first, then the title', () => {
  const cases = [['Cracked-leather zip boot', '', 'footwear'], ['Denim Trucker with Leather collar', '', 'outerwear'], ['Puppy plush keychain', '', 'plush'], ['Magnetic power bank', '', 'tech'], ['Modern Oxford', '', 'footwear'],
    ['Cap sleeve dress', '', 'dress'], ['Short sleeve tee', '', 'top'], ['Cargo shorts', '', 'bottom'], ['Dress shoe', '', 'footwear'], ['Baseball cap', '', 'headwear'], ['Tote bag', '', 'bag'], ['Water bottle', '', 'drink'],
    ['Silver ring', '', 'jewelry'], ['Wool scarf', '', 'flat'], ['Crew socks', '', 'hosiery'], ['Leather belt', '', 'belt'], ['Enamel pin', '', 'small'], ['Oxford shirt', '', 'top'], ['Teddy fleece jacket', '', 'outerwear'],
    ['Polar bear graphic tee', '', 'top'], ['Mystery thing', '', 'generic'], ['x', 'Footwear — chunky-sole modern Oxford / derby-style shoe (laceless as drawn)', 'footwear'], ['Bear hug hoodie', 'Apparel — top', 'top'], ['Sunglasses', '', 'eyewear'], ['Cardboard mailer box', '', 'box']];
  for (const [title, cat, want] of cases) assert.equal(familyOf(cat, title), want, `${title} ${cat}`.trim());
});
test('a unit slip is repaired, a real mistake is not', () => {
  const r = rangeFor('Chest width', 'top');
  assert.deepEqual(fixUnitSlip(55, r), { value: 21.65, unit: 'cm' });           // 55 cm
  assert.deepEqual(fixUnitSlip(rangeFor('Outsole length', 'footwear') && 300, rangeFor('Outsole length', 'footwear')), { value: 11.81, unit: 'mm' });
  assert.equal(fixUnitSlip(0.55, rangeFor('Heel width (outsole)', 'footwear')), null);
  assert.equal(fixUnitSlip(22, r), null);                                        // already fine
});
test('auditing a draft finds the heel and forefoot widths from the Oxford pack, a backwards grade and an out-of-range size', () => {
  const sizes = ['7', '8', '9', '10', '11', '12', '13'];
  const rows = [{ code: 'A', name: 'Outsole length', sample: 12, step: 0.33 }, { code: 'B', name: 'Forefoot width (outsole)', sample: 1.5, step: 0 }, { code: 'C', name: 'Heel width (outsole)', sample: 0.55, step: 0 },
    { code: 'D', name: 'Heel height', sample: 2.4, step: -0.06 }, { code: 'E', name: 'Collar height (lateral)', sample: 8.5, step: 1.5 }, { code: 'X', name: 'Fabric GSM', sample: 9999, step: 0 }];
  const p = auditRows(rows, { family: 'footwear', sizes, sampleSize: '10' });
  assert.deepEqual(p.map(x => `${x.code}:${x.kind}`), ['B:out', 'C:out', 'D:backwards', 'E:grade']);
  assert.deepEqual(auditRows([{ code: 'A', name: 'Outsole length', sample: 11.5, step: 0.33 }], { family: 'footwear', sizes, sampleSize: '10' }), []);
});
