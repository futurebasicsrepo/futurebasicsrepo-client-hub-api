import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_MATERIALS, MATERIAL_KINDS, cleanMaterial, cleanPick, costOf, packRows, cleanColourways, fabricWords, MAKING_CENTS, USAGE_M } from '../src/lab-materials.js';
import { tagSvg, tagWords, TAG_KINDS, TAG_SHAPES, TAG_FOLDS } from '../src/lab-tags.js';
import { labHandoff } from '../src/lab-handoff.js';
import { normalizeTechPack } from '../src/techpack.js';

const built = key => { const m = BUILTIN_MATERIALS.find(x => x.key === key); const c = cleanMaterial(m); assert.ok(!c.error, key); return { id: `00000000-0000-4000-8000-0000000000${BUILTIN_MATERIALS.indexOf(m).toString().padStart(2, '0')}`, ...c.material }; };

test('the starting set covers fabrics, trims and tags for shirts, pants, outerwear, headwear and hang tags, and every row is clean', () => {
  for (const k of MATERIAL_KINDS) assert.ok(BUILTIN_MATERIALS.some(m => m.kind === k.id), k.id);
  assert.equal(new Set(BUILTIN_MATERIALS.map(m => m.key)).size, BUILTIN_MATERIALS.length);
  for (const m of BUILTIN_MATERIALS) { const c = cleanMaterial(m); assert.ok(!c.error, m.key); assert.ok(c.material.priceCents > 0, m.key); }
  const tags = BUILTIN_MATERIALS.filter(m => m.kind === 'tag');
  for (const f of ['shirts', 'pants', 'outerwear', 'headwear']) assert.ok(tags.some(t => t.spec.for.includes(f)), f);
  assert.ok(tags.filter(t => t.spec.tagKind === 'hang').length >= 4 && new Set(tags.filter(t => t.spec.tagKind === 'hang').map(t => t.spec.shape)).size >= 4, 'hang tags in several shapes');
  assert.ok(tags.some(t => t.spec.tagKind === 'waistband') && tags.some(t => t.spec.tagKind === 'pocket') && tags.some(t => t.spec.tagKind === 'neck') && tags.some(t => t.spec.tagKind === 'care'));
  for (const t of tags) { assert.ok(TAG_KINDS.some(k => k.id === t.spec.tagKind) && TAG_SHAPES.includes(t.spec.shape) && TAG_FOLDS.includes(t.spec.fold), t.key); }
});

test('cleaning what is typed: a price in dollars, a tag with its enums held, a bad kind refused, an edit keeping the rest', () => {
  assert.equal(cleanMaterial({ kind: 'plant', name: 'x' }).error, 'Say what kind of material it is: a fabric, a trim, a tag, a footwear, plush or toy material, or a plastic');
  assert.equal(cleanMaterial({ kind: 'fabric', name: 'A' }).error, 'Give it a name');
  const f = cleanMaterial({ kind: 'fabric', name: 'Test jersey', price: '12.50', spec: { weightGsm: '240', construction: 'single jersey', composition: '100% cotton' }, colours: [{ hex: '#ABCDEF', name: 'sky' }, { hex: 'nope' }] }).material;
  assert.equal(f.priceCents, 1250); assert.equal(f.unit, 'm'); assert.equal(f.spec.weightGsm, 240); assert.deepEqual(f.colours, [{ hex: '#abcdef', name: 'sky', pantone: '' }]);
  const t = cleanMaterial({ kind: 'tag', name: 'Odd tag', spec: { tagKind: 'nothing', shape: 'blob', widthMm: 2, fold: 'origami', for: 'pants, hats, shirts', text: 'FB / MADE WELL / x / y / z' } }).material;
  assert.equal(t.spec.tagKind, 'neck'); assert.equal(t.spec.shape, 'rectangle'); assert.equal(t.spec.widthMm, 5); assert.equal(t.spec.fold, 'none'); assert.deepEqual(t.spec.for, ['pants', 'shirts']); assert.equal(t.spec.text.length, 4); assert.equal(t.unit, 'pc');
  const e = cleanMaterial({ price: '9' }, f); assert.equal(e.material.priceCents, 900); assert.equal(e.material.name, 'Test jersey'); assert.equal(e.material.spec.weightGsm, 240);
});

test('a tag is drawn to size: the outline, the fold marks, the eyelet and string on a hang tag, the words, and a size line', () => {
  const hang = built('hang-rect'), neck = built('tag-neck-woven'), circle = built('hang-circle');
  const svg = tagSvg(hang.spec, { scale: 3 });
  assert.match(svg, /^<svg /); assert.match(svg, /50 × 90 mm · rectangle/); assert.match(svg, /<circle cx=/, 'eyelet'); assert.match(svg, /stroke-linecap="round"/, 'string'); assert.match(svg, />FUTURE BASICS</);
  assert.match(tagSvg(neck.spec), /stroke-dasharray="1 \.8"/, 'end fold is marked'); assert.doesNotMatch(tagSvg(neck.spec), /<circle cx=/, 'no eyelet on a neck label');
  assert.match(tagSvg(circle.spec), /a 30 30 0 1 0/, 'a circle of 60 mm');
  assert.match(tagSvg({ shape: 'shield', widthMm: 60, heightMm: 85, material: 'paper 350 gsm', tagKind: 'hang', string: 'none' }, { textLines: ['A', 'B'] }), /Q 60 72\.25 30 85/);
  assert.equal(tagWords(neck.spec), '60 × 15 mm damask woven neck label, end fold, sewn into the neck seam, woven');
  assert.match(tagWords(hang.spec), /cotton twine through a brass eyelet/);
});

test('what a concept is made of costs out: usage by category, making cost, freight and duty, margin; a main fabric picked twice stays one', () => {
  const fleece = built('loopback-450'), zip = built('zip-5-metal'), label = built('tag-neck-woven');
  const p1 = cleanPick({ role: 'main', colour: '#1f1f22' }, fleece, 'tops'); assert.equal(p1.qty, USAGE_M.tops); assert.equal(p1.colour.name, 'washed black'); assert.equal(p1.unitCents, 1180);
  const p2 = cleanPick({}, zip, 'tops'); assert.equal(p2.role, 'trim'); assert.equal(p2.qty, 1);
  const p3 = cleanPick({ qty: '2' }, label, 'tops'); assert.equal(p3.role, 'tag'); assert.equal(p3.qty, 2);
  const k = costOf([p1, p2, p3], { category: 'tops', priceCents: 9800 });
  assert.equal(k.materialsCents, Math.round(1.3 * 1180) + 185 + 18); assert.equal(k.makingCents, MAKING_CENTS.tops); assert.equal(k.freightCents, Math.round((k.materialsCents + 480) * .18)); assert.equal(k.landedCents, k.materialsCents + 480 + k.freightCents);
  assert.equal(k.marginPct, Math.round((1 - k.landedCents / 9800) * 1000) / 10);
  const k2 = costOf([p1], { category: 'outerwear', makingCents: 2500, freightPct: 10, priceCents: null }); assert.equal(k2.makingCents, 2500); assert.equal(k2.freightCents, Math.round((1534 + 2500) * .1)); assert.equal(k2.marginPct, null);
  assert.equal(fabricWords(fleece), '450 gsm loopback fleece (100% cotton) garment dyed finish');
});

test('the tech pack takes the materials as BOM lines with unit costs and the tags as labels; sent again they replace themselves; colourways go on with their Pantones', () => {
  const picks = [cleanPick({ role: 'main', colour: '#1f1f22' }, built('loopback-450'), 'tops'), cleanPick({}, built('zip-5-metal'), 'tops'), cleanPick({}, built('tag-neck-woven'), 'tops'), cleanPick({}, built('hang-rect'), 'tops')];
  const rows = packRows(picks);
  assert.equal(rows.bom.length, 4); assert.equal(rows.bom[0].component, 'Main fabric'); assert.equal(rows.bom[0].cost, '11.80'); assert.match(rows.bom[0].spec, /450 gsm, 100% cotton, loopback fleece, 180 cm wide, garment dyed/); assert.equal(rows.bom[0].color, '#1f1f22');
  assert.equal(rows.bom[1].component, 'Zip'); assert.equal(rows.labels.length, 2); assert.match(rows.labels[0].item, /^Neck label · /); assert.match(rows.labels[0].spec, /60 × 15 mm damask woven neck label, end fold/); assert.match(rows.labels[1].spec, /reads "FUTURE BASICS \/ MADE TO LAST"/);
  const pack0 = normalizeTechPack({ bom: [{ component: 'Thread', material: 'Poly' }], labels: [{ item: 'Hang tag · old one', spec: 'x' }, { item: 'Woven label (assistant)', spec: 'y' }], colorways: [{ name: 'Black', swatch: '#111111' }] });
  const once = normalizeTechPack(labHandoff(pack0, { materials: rows, colourways: cleanColourways([{ name: 'Moss', hex: '#5b6648', pantone: 'PANTONE 5753 C' }]) }));
  assert.equal(once.bom.length, 5); assert.equal(once.bom.filter(r => r.notes === 'From the materials library').length, 4); assert.equal(once.bom[0].component, 'Thread');
  assert.deepEqual(once.labels.map(l => l.item.split(' · ')[0]), ['Neck label', 'Hang tag', 'Woven label (assistant)'], 'the old hang tag is replaced, the assistant\'s own label stays');
  assert.equal(once.colorways.length, 2); assert.equal(once.colorways[1].code, 'PANTONE 5753 C'); assert.match(once.colorways[1].notes, /^From the materials library/);
  const twice = normalizeTechPack(labHandoff(once, { materials: packRows(picks.slice(0, 1)), colourways: [] }));
  assert.equal(twice.bom.length, 2); assert.equal(twice.labels.length, 1); assert.equal(twice.colorways.length, 2, 'colourways sent empty are left as they were');
});

test('a tag whose face was designed in the studio says so in the tech pack, and its picture is the design', async () => {
  const { packRows } = await import('../src/lab-materials.js'), { tagSvg, tagFaceSvg } = await import('../src/lab-tags.js');
  const spec = { tagKind: 'neck', shape: 'rectangle', widthMm: 60, heightMm: 15, fold: 'end fold', material: 'damask woven', text: ['FUTURE BASICS'], face: '11111111-1111-1111-1111-111111111111' };
  const { labels } = packRows([{ id: 'x', kind: 'tag', name: 'Neck label', role: 'tag', qty: 1, unit: 'pc', unitCents: 9, spec }]);
  assert.match(labels[0].spec, /artwork designed in the studio/); assert.doesNotMatch(labels[0].spec, /reads "FUTURE BASICS"/);
  const svg = tagSvg(spec, { face: 'data:image/png;base64,AAAA', showSize: false });
  assert.match(svg, /<image href="data:image\/png;base64,AAAA"[^>]*clip-path/); assert.doesNotMatch(svg, />FUTURE BASICS</, 'the words are in the design, not typed over it');
  assert.match(tagFaceSvg(spec, { pxPerMm: 10 }), /width="600" height="150"/, 'the blank face is the tag at its size');
});

