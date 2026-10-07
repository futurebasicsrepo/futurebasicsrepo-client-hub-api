import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { seedTechPack, normalizeTechPack, techPackCompleteness, packStrings, mergeClientEdits, pomTemplateFor } from '../src/techpack.js';
const E = globalThis.FBElec;

test('electronic products are recognised by what they are, not by one word', () => {
  for (const t of ['Magnetic power bank 10000', 'Wireless earbuds', 'Bluetooth speaker', 'Desk lamp with USB', 'Smart ring', 'Smart home plug', 'LED strip light']) assert.equal(E.isElectronics(t), true, t);
  for (const t of ['Layer runner shoe', 'Camera bag', 'Smart casual shirt', 'Mouse pad XL', 'Heavyweight hoodie', 'Phone case', 'Laptop sleeve', 'Sensor Lineup Tee', 'Plush robot']) assert.equal(E.isElectronics(t), false, t);
  assert.equal(E.isElectronics('Phone case with built-in battery'), true, 'a case that says it has a battery is electronic');
});

test('certifications follow from the specs: radio, lithium battery, mains, water rating', () => {
  const names = s => E.certSuggestions(s, '').map(c => c.name).join(' | ');
  const plain = names({ batteryChemistry: 'none', radios: 'none', inputPower: 'USB-C 5 V' });
  assert.match(plain, /RoHS/); assert.match(plain, /CE-EMC/); assert.match(plain, /FCC Part 15B/); assert.doesNotMatch(plain, /RED|UN 38\.3|Part 15C/);
  const pods = names({ batteryChemistry: 'Li-ion', radios: 'Bluetooth LE 5.3', inputPower: 'USB-C', ingress: 'ipx4' });
  assert.match(pods, /CE-RED/); assert.match(pods, /FCC Part 15C/); assert.match(pods, /Bluetooth SIG/); assert.match(pods, /UN 38\.3/); assert.match(pods, /62133/); assert.match(pods, /IEC 60529 ingress test \(IPX4\)/); assert.doesNotMatch(pods, /CE-EMC/);
  assert.match(names({ inputPower: 'AC 100-240 V wall plug', batteryChemistry: 'none', radios: 'none' }), /LVD/);
  assert.match(E.certSuggestions({}, 'power bank').map(c => c.name).join(), /UN 38\.3/, 'a power bank is assumed to have a lithium battery until the specs say otherwise');
  assert.ok(E.certSuggestions({ radios: 'Wi-Fi' }, '').every(c => c.name && c.market && c.why));
});

test('the pack says what is still missing, and the watt-hours come from volts and mAh', () => {
  const e = E.defaults('earbuds');
  assert.deepEqual(E.missing(e).map(m => m.split(' (')[0]), ['Battery chemistry', 'Radios', 'Power input', 'Electronic components']);
  e.specs = { batteryChemistry: 'Li-ion', radios: 'none', inputPower: 'USB-C' }; e.components = [{ part: 'MCU' }];
  assert.deepEqual(E.missing(e), ['Battery capacity and voltage']);
  e.specs.batteryCapacity = '1,200'; e.specs.batteryVoltage = '3.7'; assert.deepEqual(E.missing(e), []);
  assert.equal(E.wattHours(e.specs), 4.44); assert.equal(E.wattHours({ batteryCapacity: 'big' }), null);
  assert.deepEqual(E.missing({ enabled: false }), [], 'a pack that is not electronic is never asked');
});

test('an electronic product is seeded with its own section; everything else is untouched', () => {
  const p = seedTechPack({ product: { title: 'Wireless earbuds', product_type: 'Audio' } });
  assert.equal(p.electronics.enabled, true); assert.deepEqual(p.sizes, ['One size']);
  assert.deepEqual(p.electronics.stages.map(s => s.stage), ['EVT', 'DVT', 'PVT', 'MP']);
  assert.ok(p.electronics.tests.length >= 6 && p.electronics.certifications.length >= 5);
  assert.deepEqual(p.pom.map(r => r.code), ['A', 'B', 'C', 'D']); assert.ok(p.bom.some(r => /Battery/.test(r.component)) && p.bom.some(r => /Main board/.test(r.component)));
  assert.ok(p.labels.some(l => /Rating label/.test(l.item)) && !p.labels.some(l => /Woven|Care/.test(l.spec)), 'no garment labels');
  const shoe = seedTechPack({ product: { title: 'Court sneaker' } }), tee = seedTechPack({ product: { title: 'Sensor Lineup Tee' } });
  assert.equal(shoe.electronics.enabled, false); assert.equal(tee.electronics.enabled, false); assert.deepEqual(tee.electronics.stages, []);
  assert.equal(pomTemplateFor('Laptop stand').length, 0, 'a stand is not electronic');
});

test('the electronics section is bounded and cleaned', () => {
  const d = normalizeTechPack({ electronics: { enabled: true, specs: { batteryChemistry: 'x'.repeat(500), bogus: 'dropped' }, components: Array.from({ length: 400 }, (_, i) => ({ part: `P${i}`, mpn: 'M'.repeat(200) })),
    certifications: [{ name: 'UN 38.3', status: 'weird', required: false }, { name: '' }], stages: [{ stage: 'EVT', status: 'building' }, { stage: '' }], tests: [{ name: 'Drop' }, {}] } });
  assert.equal(d.electronics.specs.batteryChemistry.length, 200); assert.equal('bogus' in d.electronics.specs, false); assert.equal(d.electronics.components.length, 150); assert.equal(d.electronics.components[0].mpn.length, 80);
  assert.deepEqual(d.electronics.certifications, [{ name: 'UN 38.3', market: '', required: false, status: 'needed', lab: '', report: '', notes: '' }]);
  assert.equal(d.electronics.stages.length, 1); assert.equal(d.electronics.stages[0].status, 'building'); assert.equal(d.electronics.tests.length, 1);
  assert.equal(normalizeTechPack({}).electronics.enabled, false); assert.equal(normalizeTechPack({ electronics: 'junk' }).electronics.components.length, 0);
});

test('an electronic pack is not complete until the electronics are filled, and its words are translated', () => {
  const p = seedTechPack({ product: { title: 'Wireless earbuds' } });
  assert.ok(techPackCompleteness(p).checks.some(c => c.key === 'electronics' && !c.ok));
  assert.ok(!techPackCompleteness(seedTechPack({ product: { title: 'Court sneaker' } })).checks.some(c => c.key === 'electronics'), 'other packs have no such check');
  p.electronics.specs = { batteryChemistry: 'none', radios: 'none', inputPower: '5 V', mcu: 'Telink TLSR8251 low-power chip' }; p.electronics.components = [{ part: 'Charging IC', mpn: 'TP4056', notes: 'Keep away from the battery' }];
  assert.ok(techPackCompleteness(p).checks.find(c => c.key === 'electronics').ok);
  const strings = packStrings(p); assert.ok(strings.includes('Telink TLSR8251 low-power chip') && strings.includes('Charging IC') && strings.includes('Keep away from the battery'));
  assert.ok(!strings.includes('TP4056'), 'part numbers are not translated');
});

test('what the client entered under Electronics survives a re-run of the assistant', () => {
  const orig = seedTechPack({ product: { title: 'Wireless earbuds' } }), current = structuredClone(orig); current.electronics.specs.radios = 'Bluetooth LE 5.3';
  const drafted = structuredClone(orig); drafted.electronics.specs.radios = 'Wi-Fi'; drafted.electronics.specs.mcu = 'from the assistant';
  assert.equal(mergeClientEdits(orig, current, drafted).electronics.specs.radios, 'Bluetooth LE 5.3');
  assert.equal(mergeClientEdits(orig, orig, drafted).electronics.specs.mcu, 'from the assistant', 'untouched: the draft is the pack');
});

test('the assistant fills blank facts only, builds the parts list if there is none, and the certifications follow', async () => {
  const { applyElectronicsDraft } = await import('../src/elecdraft.js');
  const pack = seedTechPack({ product: { title: 'Wireless earbuds' } }); pack.electronics.specs.radios = 'Bluetooth 5.4 (typed by the client)';
  const draft = { specs: { radios: 'Wi-Fi', batteryChemistry: 'Li-ion', batteryCapacity: '60', batteryVoltage: '3.7', inputPower: 'USB-C' }, components: [{ ref: 'U1', part: 'Bluetooth SoC', mpn: '', maker: '', qty: '1', notes: '' }], notes: 'Assumed a TWS earbud.' };
  applyElectronicsDraft(pack, draft, { text: 'earbuds' });
  assert.equal(pack.electronics.specs.radios, 'Bluetooth 5.4 (typed by the client)', 'what a person typed is never overwritten');
  assert.equal(pack.electronics.specs.batteryChemistry, 'Li-ion'); assert.equal(pack.electronics.components.length, 1);
  const names = pack.electronics.certifications.map(c => c.name).join(' | '); assert.match(names, /UN 38\.3/); assert.match(names, /CE-RED/);
  assert.match(pack.notes, /ELECTRONICS \(assistant draft/);
  pack.electronics.certifications.find(c => /UN 38/.test(c.name)).status = 'passed';
  applyElectronicsDraft(pack, draft, { text: 'earbuds' });
  assert.equal(pack.electronics.certifications.filter(c => /UN 38/.test(c.name)).length, 1, 'a re-run does not duplicate, and keeps a certification that has progressed');
  assert.equal(pack.electronics.components.length, 1);
  const plain = normalizeTechPack({}); applyElectronicsDraft(plain, draft, { text: 'power bank' }); assert.equal(plain.electronics.enabled, true, 'a pack that was not marked electronic becomes one');
});
