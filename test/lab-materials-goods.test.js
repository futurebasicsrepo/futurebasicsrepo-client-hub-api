import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_MATERIALS, MATERIAL_KINDS, cleanMaterial, cleanPick, packRows, costOf } from '../src/lab-materials.js';
import { PARTS, partsFor } from '../src/lab-materials-goods.js';
import { materialSvg } from '../src/lab-swatches.js';
import { partLooks } from '../src/lab-looks.js';
import { footwearPattern } from '../src/lab-footwear.js';
import { footwearViews } from '../src/lab-footwear-views.js';
import { plushPattern } from '../src/lab-pattern.js';
import { plushViews } from '../src/lab-plush-views.js';

test('the library takes footwear materials, plush and toy materials, and plastics and acrylics, each with its own details', () => {
  assert.deepEqual(MATERIAL_KINDS.map(k => k.id), ['fabric', 'trim', 'tag', 'footwear', 'plush', 'plastic']);
  for (const kind of ['footwear', 'plush', 'plastic']) assert.ok(BUILTIN_MATERIALS.filter(m => m.kind === kind).length >= 10, `a starter set of ${kind}`);
  const abs = cleanMaterial({ kind: 'plastic', name: 'ABS FR', spec: { category: 'ABS', ul94: 'V-0', transparency: 'glowing', finish: 'MT-11010 (fine texture)', density: 9, process: 'blow' } }).material;
  assert.equal(abs.unit, 'kg'); assert.equal(abs.spec.ul94, 'V-0'); assert.equal(abs.spec.transparency, 'opaque'); assert.equal(abs.spec.density, 3, 'bounded'); assert.equal(abs.spec.process, 'injection moulding');
  const suede = cleanMaterial({ kind: 'footwear', name: 'Suede', unit: 'sq ft', spec: { category: 'suede', thicknessMm: '1.4', hardness: '' } }).material; assert.equal(suede.spec.thicknessMm, 1.4); assert.equal(suede.unit, 'sq ft');
  const eye = cleanMaterial({ kind: 'plush', name: 'Eye', spec: { category: 'safety eye', sizeMm: 12, safety: '3 years and up' } }).material; assert.equal(eye.spec.sizeMm, 12);
  assert.match(cleanMaterial({ kind: 'metal', name: 'x' }).error, /what kind/);
});

test('every starter material is drawn as what it is, and none draws a number that is not one', () => {
  for (const m of BUILTIN_MATERIALS.filter(x => ['footwear', 'plush', 'plastic'].includes(x.kind))) { const svg = materialSvg(cleanMaterial(m).material, 't'); assert.ok(svg.startsWith('<svg') && svg.length > 300 && !/NaN|undefined/.test(svg), m.name); }
  const clear = materialSvg(cleanMaterial(BUILTIN_MATERIALS.find(m => m.key === 'ps-acrylic-cast')).material, 'c'); assert.match(clear, /ck/, 'clear acrylic over a checker');
});

test('a material goes on one of the product\'s parts: it takes the usual quantity, its first colour, and the BOM names the part', () => {
  assert.deepEqual(partsFor('footwear').map(p => p.id).slice(0, 3), ['upper', 'overlay', 'lining']); assert.ok(PARTS.electronics.some(p => p.id === 'lens')); assert.deepEqual(partsFor('tops').map(p => p.id).slice(0, 3), ['self', 'contrast', 'rib']);
  const suede = { id: 'm1', ...cleanMaterial(BUILTIN_MATERIALS.find(m => m.key === 'fw-suede')).material, priceCents: 430 };
  const pick = cleanPick({ part: 'upper' }, suede, 'footwear');
  assert.equal(pick.role, 'part'); assert.equal(pick.part, 'upper'); assert.equal(pick.qty, 2.4); assert.equal(pick.colour.name, 'sand');
  const rows = packRows([pick], 'footwear').bom; assert.equal(rows[0].component, 'Upper (vamp and quarters)'); assert.match(rows[0].spec, /suede · 1.4 mm/);
  assert.equal(costOf([pick], { category: 'footwear' }).materialsCents, Math.round(2.4 * 430));
});

test('the parts\' materials draw the flats: their colours, and a suede\'s nap, a mesh\'s holes, a fur\'s strands', () => {
  const looks = partLooks([{ part: 'upper', colour: { hex: '#c8a77c' }, spec: { category: 'suede', finish: 'brushed' } }, { part: 'overlay', colour: { hex: '#1d1c1b' }, spec: { category: 'upper leather', finish: 'embossed pebble' } }, { part: 'outsole', colour: { hex: '#b9864f' }, spec: { category: 'outsole' } }, { part: 'laces', colour: { hex: '#ffffff' } }]);
  assert.deepEqual(looks.colours, { upper: '#c8a77c', overlay: '#1d1c1b', outsole: '#b9864f', lace: '#ffffff' }); assert.deepEqual(looks.tex, { upper: 'nap', overlay: 'pebble' });
  const v = footwearViews(footwearPattern({ style: 'sneaker' }), looks); assert.ok(v.lateral.svg.includes('#c8a77c') && /url\(#lk-nap-/.test(v.lateral.svg) && /url\(#lk-pebble-/.test(v.top.svg) && v.lateral.svg.includes('#b9864f'));
  const p = plushViews(plushPattern({ shape: 'bunny' }), partLooks([{ part: 'body', colour: { hex: '#b08458' }, spec: { category: 'faux fur', pileMm: 10 } }])); assert.ok(p.front.svg.includes('#b08458') && /lk-fur/.test(p.front.svg));
});
