import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_MATERIALS, fabricFamily, weightBand, ozOf, cleanMaterial, FABRIC_FAMILIES } from '../src/lab-materials.js';
import { photoFor } from '../src/lab-photos.js';
import { tagMarks, defaultParams, renderSvg } from '../src/lab-flats.js';

const fabrics = BUILTIN_MATERIALS.filter(m => m.kind === 'fabric'), named = n => fabrics.find(m => m.name === n);

test('the starting fabrics cover shirting cottons by weave and weight, leathers and vegan leathers', () => {
  const by = f => fabrics.filter(m => fabricFamily(m) === f).map(m => m.spec.construction);
  for (const c of ['poplin', 'broadcloth', 'oxford', 'pinpoint oxford', 'seersucker', 'voile', 'lawn', 'end-on-end', 'flannel']) assert.ok(by('shirting').includes(c), c);
  for (const c of ['gabardine', 'moleskin', 'corduroy', 'drill']) assert.ok(by('bottomweight').includes(c), c);
  assert.ok(by('leather').length >= 10 && by('vegan').length >= 10);
  assert.ok(fabrics.every(m => FABRIC_FAMILIES.some(f => f.id === fabricFamily(m)) && fabricFamily(m) !== 'other'), 'every fabric has a family');
  assert.ok(fabrics.every(m => !cleanMaterial(m).error), 'every one is valid');
});

test('families: a nylon oxford is technical, a PU or plant leather is vegan, a hide is leather', () => {
  assert.equal(fabricFamily(named('420D nylon oxford, PU coated')), 'technical');
  assert.equal(fabricFamily(named('150 gsm oxford cloth')), 'shirting');
  assert.equal(fabricFamily(named('Cactus leather, 1.2 mm')), 'vegan');
  assert.equal(fabricFamily(named('Microfibre leather, 1.2 mm')), 'vegan');
  assert.equal(fabricFamily(named('Goat suede, 0.7 mm')), 'leather');
  assert.equal(fabricFamily({ spec: { construction: 'suede', composition: 'PU on polyester' } }), 'vegan');
});

test('weight bands read for what the cloth is, leather by thickness; ounces for wovens', () => {
  assert.equal(weightBand(named('75 gsm cotton voile')), 'light');
  assert.equal(weightBand(named('120 gsm cotton poplin')), 'mid');
  assert.equal(weightBand(named('140 gsm fine jersey, combed cotton')), 'light');
  assert.equal(weightBand(named('300 gsm super heavyweight jersey')), 'heavy');
  assert.equal(weightBand(named('Lambskin nappa, 0.7 mm')), 'light');
  assert.equal(weightBand(named('Vegetable-tanned cowhide, 2.0 mm (5 oz)')), 'heavy');
  assert.equal(ozOf(271), 8);
});

test('leathers get a leather photo or the drawn hide, never a cloth photo', () => {
  assert.equal(photoFor(named('Pebble-grain cowhide, 1.6 mm')), 'leather-grain');
  assert.equal(photoFor(named('Goat suede, 0.7 mm')), 'suede');
  assert.equal(photoFor(named('Cork fabric, 0.6 mm on cotton')), 'cork');
  assert.equal(photoFor(named('Lambskin nappa, 0.7 mm')), '');
});

test('labels on a concept are drawn on the flats where they are sewn, at their size', () => {
  const p = defaultParams('ziphoodie'), tags = [{ id: 'n', name: 'Neck label', spec: { tagKind: 'neck', widthMm: 50.8, heightMm: 19.05 } }, { id: 'c', name: 'Care', spec: { tagKind: 'care', widthMm: 30, heightMm: 60 } }, { id: 'h', name: 'Hang', spec: { tagKind: 'hang', widthMm: 50, heightMm: 90 } }];
  const marks = tagMarks(p, tags), neck = marks.filter(m => m.id === 'n');
  assert.deepEqual(neck.map(m => [m.view, m.inside]), [['front', false], ['back', true]]);
  assert.equal(neck[0].w, 2); assert.equal(neck[0].h, .75); assert.equal(neck[0].x, 0);
  assert.ok(marks.find(m => m.id === 'c').inside && marks.find(m => m.id === 'c').x < 0, 'the care label is inside the left side seam');
  assert.ok(!marks.some(m => m.id === 'h'), 'a hang tag is not sewn in');
  assert.ok(renderSvg(p, 'front', { tags: marks }).includes('data-tag="n"') && !renderSvg(p, 'front').includes('data-tag'));
});

test('the fabric check reads a leather as a leather, not as cloth with nothing on it', async () => {
  const { clothOf, fabricFit } = await import('../src/lab-fabric-fit.js');
  const lamb = { ...named('Lambskin nappa, 0.7 mm'), id: 'l', role: 'main' };
  assert.equal(clothOf(lamb), 'leather');
  assert.equal(clothOf(named('120 gsm cotton poplin')), 'woven');
  const words = JSON.stringify(fabricFit({ style: 'jacket', category: 'outerwear', materials: [lamb] }) || {});
  assert.ok(!/no construction or weight/.test(words), words);
});

test('a label dragged on the flats keeps its place on that view, and the flat keeps it when saved', async () => {
  const { cleanFlat } = await import('../src/lab-flats.js');
  const id = 'a1dde028-59b9-4827-a4f4-d7513568fb61', p0 = defaultParams('hoodie');
  const { params } = cleanFlat({ ...p0, tagPos: { [id]: { front: [3.7, 6.4], back: 'nope' }, 'not-an-id': { front: [1, 1] } } });
  assert.deepEqual(params.tagPos, { [id]: { front: [3.75, 6.375] } });
  const marks = tagMarks(params, [{ id, spec: { tagKind: 'neck', widthMm: 50, heightMm: 20 } }]);
  assert.deepEqual([marks[0].view, marks[0].x, marks[0].y, marks[0].moved], ['front', 3.75, 6.375, true]);
  assert.equal(marks[1].moved, false, 'the back stays where it is sewn');
  assert.ok(renderSvg(params, 'front', { tags: marks, editable: true }).includes('cursor:grab'));
});
