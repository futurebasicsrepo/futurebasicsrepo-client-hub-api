import test from 'node:test';
import assert from 'node:assert/strict';
import { keepLabRows } from '../src/ai.js';

test('the assistant never rewrites what the Design Lab put on the pack: flats measurements, library materials, construction and colourways stay exactly as set, and its own rows go beside them', () => {
  const seed = { pom: [{ code: 'A', name: 'Chest', how: 'From the flats', tolerance: '0.5', values: { M: '21' } }, { code: 'B', name: 'Hem', how: 'measured', values: { M: '20' } }],
    bom: [{ component: 'Main fabric', material: '450 gsm loopback fleece', notes: 'From the materials library', cost: '11.80' }, { component: 'Thread', material: 'Poly', notes: '' }],
    construction: [{ area: 'Flats · Front · Logo', detail: 'Embroidered, 3.5 in from HPS' }, { area: 'Correction · Proto sample: Hem', detail: 'Cut on grain' }, { area: 'Neck', detail: 'Old' }],
    colorways: [{ name: 'Washed black', code: 'PANTONE Black 6 C', swatch: '#1f1f22', notes: 'From the materials library' }], notes: 'Old notes' };
  const draft = { pom: [{ code: 'A', name: 'Chest', how: 'model', values: { M: '23' } }, { code: 'C', name: 'Sleeve', values: { M: '9' } }],
    bom: [{ component: 'Main fabric', material: 'Cotton jersey' }, { component: 'Zip', material: 'YKK' }], construction: [{ area: 'Neck', detail: 'New' }], colorways: [{ name: 'Black', swatch: '#000000' }], notes: 'AI DRAFT' };
  const out = keepLabRows(seed, draft);
  assert.deepEqual(out.pom.map(r => [r.code, r.values.M, r.how]), [['A', '21', 'From the flats'], ['C', '9', undefined]], 'the flats measurement is put back; the model\'s new row stays');
  assert.deepEqual(out.bom.map(r => r.material), ['450 gsm loopback fleece', 'Cotton jersey', 'YKK'], 'the library fabric leads; the model\'s rows follow');
  assert.deepEqual(out.construction.map(r => r.area), ['Flats · Front · Logo', 'Correction · Proto sample: Hem', 'Neck']);
  assert.deepEqual(out.colorways.map(c => c.swatch), ['#1f1f22', '#000000']);
  assert.match(out.notes, /^DESIGN LAB — 5 rows .* kept exactly .*\(1 measurements, 1 materials, 2 construction, 1 colourways\)/); assert.match(out.notes, /AI DRAFT$/);
  const plain = keepLabRows({ bom: [{ component: 'Thread', notes: '' }], pom: [], construction: [], colorways: [] }, { bom: [{ component: 'Zip' }], notes: 'x' });
  assert.deepEqual(plain.bom.map(r => r.component), ['Zip']); assert.equal(plain.notes, 'x', 'a pack with nothing from the Lab is left to the assistant');
});
