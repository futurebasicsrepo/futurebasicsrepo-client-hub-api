// Footwear, plush and clothing get the same Design Lab tools: plush and shoe concepts say what their pattern is drafted from and are drawn as
// what they are, the checklist reads a shoe's or a plush's pattern, the board's views do not put a toy on a model, and clothing takes materials on
// its parts as a shoe and a plush do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpec, imagePrompt, CATEGORY_WORDS, CATEGORY_JSON, conceptFixture, labelWords, LOGO_PLACE } from '../src/lab-concepts.js';
import { readiness } from '../src/lab-ready.js';
import { kindsFor, canWalk, viewPrompt } from '../src/lab-views.js';
import { cleanPick, packRows, partsFor, clothPart } from '../src/lab-materials.js';
import { layoutOf, garmentPattern } from '../src/lab-pattern.js';
import { defaultParams } from '../src/lab-flats.js';

test('a plush concept says what its pattern is drafted from, and is drawn as a sewn and stuffed toy, not as clothing', () => {
  const s = cleanSpec({ description: 'a sleepy bear', plush: { shape: 'bear', height: 11, fabric: 'fur', eyes: 'felt', colours: { body: '#C8A27A', contrast: 'nope' } } });
  assert.deepEqual({ shape: s.plush.shape, height: s.plush.height, fabric: s.plush.fabric, colours: s.plush.colours }, { shape: 'bear', height: 11, fabric: 'fur', colours: { body: '#c8a27a' } });
  assert.ok(!('fill' in s.plush) && !('sketches' in s.plush), 'only what the concept chooses');
  assert.equal(cleanSpec({ plush: { shape: 'dragon' } }).plush, undefined, 'a shape the pattern cannot cut is not kept');
  const p = imagePrompt({ name: 'Barley', category: 'plush', spec: s });
  assert.match(p, /plush soft toy/); assert.match(p, /about 11 inches tall/); assert.match(p, /faux fur/); assert.match(p, /seams/); assert.doesNotMatch(p, /menswear/);
  assert.match(CATEGORY_WORDS.plush, /embroidered eyes for any age/); assert.match(CATEGORY_JSON.plush, /"shape":"bear\|elephant\|bean\|bunny\|pillow \(the nearest\)"/); assert.match(CATEGORY_JSON.plush, /"animal"/); assert.match(CATEGORY_JSON.plush, /leather/);
  assert.match(labelWords('plush'), /tush tag/); assert.equal(LOGO_PLACE.plush[1], null, 'the logo is not laid on a plush\'s picture');
  const fx = conceptFixture({ user: 'Make 2 different concepts\nPlanned piece: Bear\n(category plush, role core)' });
  assert.equal(fx.concepts[1].plush.shape, 'bunny');
});
test('a shoe concept keeps its style, toe, pieces and colours, and is drawn from the side', () => {
  const s = cleanSpec({ footwear: { style: 'derby', toe: 'almond', toeCap: true, upper: 'leather', sole: 'stitched', colours: { upper: '#4A2E1E', sole: 'x' } } });
  assert.deepEqual(s.footwear, { style: 'derby', toe: 'almond', toeCap: true, upper: 'leather', sole: 'stitched', colours: { upper: '#4a2e1e' } });
  assert.match(imagePrompt({ name: 'Derby', category: 'footwear', spec: s }), /side profile/);
  assert.match(imagePrompt({ name: 'Tee', category: 'tops', spec: cleanSpec({}) }), /Three-quarter front view/);
});
test('nobody wears a plush, a toy or a gadget: their board views are the product alone, with no walk', () => {
  for (const c of ['plush', 'toys', 'electronics', 'home']) { assert.deepEqual(kindsFor(c), ['flat_front', 'flat_back']); assert.equal(canWalk(c), false); }
  assert.equal(kindsFor('tops').length, 6); assert.equal(canWalk('footwear'), true);
  assert.match(viewPrompt({ category: 'plush', name: 'Bear' }, 'flat_front'), /plush toy sitting upright/);
});
test('the checklist reads a shoe\'s or a plush\'s pattern: saved, its checks, and the material on its main part', () => {
  const concept = { id: 'c1', status: 'draft', twist: 'Our own stitched smile on the tummy', has_image: true, spec: { materials: [{ part: 'body', kind: 'plush', name: 'Minky' }] } };
  const none = readiness({ concept, pattern: { saved: false, checks: [], main: 'body', mainLabel: 'body\'s pile' } });
  assert.deepEqual(none.items.map(i => i.id), ['picture', 'placed', 'pattern', 'made', 'materials', 'twist', 'approved']);
  assert.equal(none.items.find(i => i.id === 'pattern').state, 'todo'); assert.equal(none.items.find(i => i.id === 'pattern').go.view, 'pattern');
  const bad = readiness({ concept, pattern: { saved: true, checks: [{ level: 'fail', msg: 'Safety eyes on a toy for under-3s' }], main: 'body' } });
  assert.equal(bad.items.find(i => i.id === 'made').state, 'todo'); assert.match(bad.items.find(i => i.id === 'made').note, /Safety eyes/);
  const ok = readiness({ concept: { ...concept, status: 'approved' }, pattern: { saved: true, checks: [{ level: 'info', msg: 'x' }], main: 'body' } });
  assert.equal(ok.ready, true); assert.equal(ok.items.find(i => i.id === 'materials').state, 'done');
  assert.equal(readiness({ concept, pattern: { saved: true, checks: [], main: 'upper' } }).items.find(i => i.id === 'materials').state, 'warn');
  assert.ok(readiness({ concept }).items.some(i => i.id === 'flats'), 'clothing keeps its flats');
});
test('clothing has parts too: its cloths and trims; a cloth part takes its share of the usual metres, the BOM names the part, and the cutting layout cuts it at its own width', () => {
  assert.deepEqual(partsFor('tops').map(p => p.id), ['self', 'contrast', 'rib', 'lining', 'pocketing', 'fusing', 'zip', 'buttons', 'drawcord', 'thread']);
  assert.ok(!partsFor('headwear').some(p => p.id === 'rib' || p.id === 'drawcord')); assert.equal(clothPart('self').role, 'main');
  const fab = { id: 'f1', kind: 'fabric', name: '2×2 rib', unit: 'm', priceCents: 580, spec: { widthCm: 100, weightGsm: 300 }, colours: [{ name: 'oat', hex: '#d9cbb2' }] };
  const pick = cleanPick({ part: 'rib' }, fab, 'tops'); assert.equal(pick.role, 'part'); assert.equal(pick.qty, Math.round(1.3 * .2 * 100) / 100); assert.equal(pick.colour.hex, '#d9cbb2');
  const { bom } = packRows([pick, cleanPick({ part: 'zip' }, { id: 't1', kind: 'trim', name: 'Coil zip', unit: 'pc', priceCents: 90, spec: { category: 'zip' }, colours: [] }, 'tops')], 'tops');
  assert.equal(bom[0].component, 'Rib (cuffs, hem, neck)'); assert.match(bom[0].spec, /100 cm wide/); assert.equal(bom[1].component, 'Zip');
  const pat = garmentPattern(defaultParams('hoodie', 'regular', {}), 'M'), lay = layoutOf(pat, { width: 58, widths: { rib: 64 } });
  assert.equal(lay.find(g => g.fabric === 'rib').width, 64); assert.equal(lay.find(g => g.fabric === 'self').width, 58);
});
