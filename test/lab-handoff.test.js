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

test('a label designed in the studio goes in as its own picture, beside the flats', () => {
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  const out = labHandoff(normalizeTechPack(emptyTechPack()), { sketches: [{ view: 'front', label: 'Technical flat · front', image: img }, { id: 'lab-label-1', view: 'detail', label: 'Label · Neck label', image: img }, { id: 'lab-label-2', view: 'detail', label: 'Label · Hang tag', image: img }] });
  const labels = out.sketches.filter(s => /^Label · /.test(s.label));
  assert.equal(labels.length, 2, 'one picture per designed label');
  assert.ok(labels.every(s => s.view === 'detail' && s.id.startsWith('lab-label-')), 'as details, each under its own id');
  assert.equal(labHandoff(out, { sketches: [{ id: 'lab-label-1', view: 'detail', label: 'Label · Neck label', image: img }] }).sketches.filter(s => s.id === 'lab-label-1').length, 1, 'sent again, it replaces itself');
});

test('engineering goes into the pack: views, parts and cables, steps and tooling, and an electronic product\'s components and certifications', async () => {
  await import('../src/elec.js');
  const { archetype, engineer, packFromAssembly } = await import('../src/lab-assembly.js'), { ENG_NOTE } = await import('../src/lab-handoff.js');
  const E = engineer(archetype('cdplayer')), P = packFromAssembly(E), png = 'data:image/png;base64,iVBORw0KGgo=';
  const before = normalizeTechPack({ ...emptyTechPack(), bom: [{ component: 'Gift box', material: 'E-flute', notes: 'Packaging' }], construction: [{ area: 'Packing', detail: 'One per box' }], electronics: { enabled: false, certifications: [{ name: 'FCC Part 15B', market: 'US', status: 'passed' }] } });
  const lab = { engineering: { ...P, sketches: [{ id: 'lab-eng-assembled', view: 'front', label: 'Assembled', image: png }, { id: 'lab-eng-exploded', view: 'other', label: 'Exploded', image: png }] } };
  const once = normalizeTechPack(labHandoff(before, lab)), twice = normalizeTechPack(labHandoff(once, lab));
  assert.equal(once.bom.filter(r => r.notes === ENG_NOTE).length, P.bom.length); assert.ok(once.bom.some(r => r.component === 'Gift box'), 'the pack\'s own lines stay');
  assert.ok(once.bom.some(r => /^Cable W1:/.test(r.component)) && once.bom.find(r => r.component === 'Chassis').cost === '2.07');
  assert.ok(once.construction.some(r => /^Assembly · \d+$/.test(r.area)) && once.construction.some(r => /^Tooling · Chassis$/.test(r.area)) && once.construction.some(r => r.area === 'Packing'));
  assert.ok(!once.construction.some(r => /\$/.test(r.detail)), 'no tool costs in the pack');
  assert.equal(once.sketches.filter(x => x.id.startsWith('lab-eng-')).length, 2); assert.equal(once.sketches.find(x => x.id === 'lab-eng-assembled').view, 'front');
  const e = once.electronics; assert.equal(e.enabled, true); assert.ok(e.components.some(c => c.ref === 'U2' && /PCM5102A/.test(c.part) && c.mpn === 'PCM5102A'));
  assert.ok(e.components.some(c => c.ref === 'W3' && /FFC/.test(c.notes))); assert.equal(e.specs.inputPower, 'AC mains, 100–240 V');
  assert.equal(e.certifications.find(c => c.name === 'FCC Part 15B').status, 'passed', 'a certification already in the pack keeps its status');
  assert.ok(e.certifications.some(c => /IEC 60825-1/.test(c.name) && c.status === 'needed'), 'the laser product is added');
  assert.deepEqual([twice.bom.length, twice.construction.length, twice.sketches.length, twice.electronics.components.length, twice.electronics.certifications.length], [once.bom.length, once.construction.length, once.sketches.length, once.electronics.components.length, once.electronics.certifications.length], 'sending again replaces, it does not add');
  const taken = normalizeTechPack(labHandoff(normalizeTechPack({ ...emptyTechPack(), sketches: [{ id: 'front-photo', view: 'front', label: 'Photo', image: png }] }), lab));
  assert.equal(taken.sketches.find(x => x.id === 'lab-eng-assembled').view, 'other', 'a front the pack already has a picture of keeps it');
});
