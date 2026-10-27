import test from 'node:test';
import assert from 'node:assert/strict';
import { labHandoff, FLATS_NOTE } from '../src/lab-handoff.js';
import { emptyTechPack, normalizeTechPack } from '../src/techpack.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const lab = {
  pom: [{ code: 'A', name: 'Chest width, 1 in below the armhole', how: FLATS_NOTE, tolerance: '0.5', values: { XS: '19', S: '20', M: '21', L: '22', XL: '23', XXL: '24' } }],
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  sketches: [{ view: 'front', label: 'Technical flat · front', image: png }, { view: 'back', label: 'Technical flat · back', image: png }],
  construction: [{ area: 'Front · Logo', detail: 'Satin stitch embroidery, 3½ in: 6 in below the HPS' }, { area: 'Patch pocket', detail: 'Front: Patch pocket …' }],
  bom: [{ component: 'Contrast thread', material: 'Polyester sewing thread', color: '#e0218a', qty: '1', unit: 'cone' }],
  color: { hex: '#1f2a44', name: 'Main colour' }, priceCents: 4800, costCents: 1150, qty: 600, planName: 'SS27 core', style: { sampleSize: 'M', fitBlock: 'Boxy t-shirt (Boxy cropped tee)' }
};

test('the flats hand the tech pack data it works with, not only pictures', () => {
  const base = normalizeTechPack({ ...emptyTechPack(), pom: [{ code: 'A', name: 'Old chest', values: {} }, { code: 'Q', name: 'Neck rib height', values: { M: '1' } }], sketches: [{ id: 'photo', view: 'front', image: png }], construction: [{ area: 'Side seams', detail: 'Overlocked' }] });
  const out = normalizeTechPack(labHandoff(base, lab));
  assert.deepEqual(out.sizes, ['XS', 'S', 'M', 'L', 'XL', '2XL'], 'XXL is the pack’s 2XL');
  assert.equal(out.pom[0].values['2XL'], '24'); assert.equal(out.pom[0].name, lab.pom[0].name);
  assert.ok(!out.pom.some(r => r.name === 'Old chest'), 'a row with the same code is replaced'); assert.ok(out.pom.some(r => r.name === 'Neck rib height'), 'the pack’s own other rows stay');
  assert.deepEqual(out.sketches.map(s => [s.id, s.view]), [['photo', 'front'], ['lab-flat-front', 'flat'], ['lab-flat-back', 'back']], 'a view that has a picture keeps it; the flat goes beside it');
  assert.ok(out.construction.some(r => r.area === 'Side seams') && out.construction.some(r => r.area === 'Flats · Front · Logo'));
  assert.equal(out.bom[0].notes, FLATS_NOTE); assert.equal(out.colorways[0].swatch, '#1f2a44');
  assert.equal(Number(out.commercial.retailPrice), 48); assert.match(out.notes, /From the Design Lab: target retail \$48\.00, target landed cost \$11\.50, planned quantity 600, line plan "SS27 core"\./);
  assert.equal(out.style.fitBlock, 'Boxy t-shirt (Boxy cropped tee)');
  // sending it again after a change replaces what came from the flats, and nothing else
  const again = normalizeTechPack(labHandoff(out, { ...lab, construction: [{ area: 'Front · Logo', detail: 'moved' }], priceCents: 5200 }));
  assert.equal(again.construction.filter(r => r.area.startsWith('Flats · ')).length, 1); assert.equal(again.sketches.length, 3); assert.equal(again.colorways.length, 1); assert.equal(again.bom.length, 1);
  assert.equal(Number(again.commercial.retailPrice), 48, 'a price someone set is not overwritten'); assert.equal((again.notes.match(/From the Design Lab:/g) || []).length, 1);
});
