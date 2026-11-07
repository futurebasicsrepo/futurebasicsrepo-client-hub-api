import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fabricFit, clothOf, stretchOf, STYLE_CLOTH } from '../src/lab-fabric-fit.js';
import { STYLES } from '../src/lab-flats.js';

const F = (name, spec, o = {}) => ({ kind: 'fabric', role: 'main', name, spec, ...o });
const jersey = F('180 jersey', { weightGsm: 180, construction: 'single jersey', stretch: 'none', composition: '100% cotton' });
const twill = F('8 oz twill', { weightGsm: 270, construction: 'twill', stretch: 'none', composition: '100% cotton' });
const lycra = F('Swim tricot', { weightGsm: 200, construction: 'tricot', composition: '80% nylon 20% elastane' });

test('every flat style has fabric rules', () => { for (const s of Object.keys(STYLES)) assert.ok(STYLE_CLOTH[s], s); });

test('knit or woven, and how much stretch', () => {
  assert.equal(clothOf(jersey), 'knit'); assert.equal(clothOf(twill), 'woven'); assert.equal(clothOf(F('x', { construction: 'stretch woven' })), 'woven');
  assert.equal(stretchOf(jersey), 1); assert.equal(stretchOf(twill), 0); assert.equal(stretchOf(lycra), 3);
  assert.equal(stretchOf(F('d', { construction: 'denim', composition: '98% cotton 2% elastane' })), 1);
});

test('a fabric that suits passes', () => {
  assert.equal(fabricFit({ style: 'tee', materials: [jersey] }).verdict, 'good');
  assert.equal(fabricFit({ style: 'pants', materials: [twill] }).verdict, 'good');
  assert.equal(fabricFit({ style: 'swimsuit', materials: [lycra] }).verdict, 'good');
});

test('no stretch on leggings is wrong; a woven tee or a light hoodie is worth a look', () => {
  const l = fabricFit({ style: 'leggings', materials: [twill] }); assert.equal(l.verdict, 'wrong'); assert.match(l.summary, /Leggings need four-way stretch/);
  assert.equal(fabricFit({ style: 'tee', materials: [twill] }).verdict, 'check');
  const h = fabricFit({ style: 'hoodie', materials: [jersey] }); assert.equal(h.verdict, 'check'); assert.match(h.findings[0].msg, /light for a hoodie/);
  assert.equal(fabricFit({ style: 'shirt', materials: [jersey] }).findings[0].level, 'warn');
  assert.match(fabricFit({ style: 'pants', fit: 'slim', materials: [twill] }).summary, /tight to move in/);
});

test('the rib and the lining are checked too', () => {
  const rib = F('Twill rib', { construction: 'twill' }, { role: 'rib' });
  assert.equal(fabricFit({ style: 'hoodie', materials: [F('Fleece', { weightGsm: 400, construction: 'loopback fleece' }), rib] }).findings[0].part, 'rib');
  const lining = F('Heavy lining', { weightGsm: 300, construction: 'taffeta' }, { role: 'lining' });
  assert.equal(fabricFit({ style: 'jacket', materials: [F('Shell', { weightGsm: 120, construction: 'nylon ripstop' }), lining] }).findings[0].part, 'lining');
});

test('nothing to check says so', () => {
  assert.equal(fabricFit({ style: 'tee', materials: [] }).verdict, 'unknown');
  assert.equal(fabricFit({ style: '', materials: [jersey] }).verdict, 'unknown');
});

import { withAccept } from '../src/lab-fabric-fit.js';
test('a wrong fabric kept on purpose holds only while it is still the main fabric', () => {
  const tw = { ...twill, id: 'tw' }, f = fabricFit({ style: 'leggings', materials: [tw] }), acc = { reason: 'Woven on purpose', by: 'kyle', main: 'tw' };
  const k = withAccept(f, acc, [tw]); assert.equal(k.accepted.reason, 'Woven on purpose'); assert.match(k.summary, /Kept on purpose: Woven on purpose \(kyle\)/);
  assert.equal(withAccept(f, acc, [{ ...jersey, id: 'js' }]).accepted, undefined);
  assert.equal(withAccept(fabricFit({ style: 'tee', materials: [jersey] }), acc, [jersey]).accepted, undefined); // nothing to keep when it suits
});

// ---- Phase 4: what the check cannot see is asked for; shoes and plush are checked on their parts ----
import { materialFit, footwearFit, plushFit } from '../src/lab-fabric-fit.js';
import { askHtml, ASK_FIELDS } from '../src/lab-fit-ask.js';

test('a fabric missing its weight or what it is gets asked for, not guessed', () => {
  const noWeight = fabricFit({ style: 'tee', materials: [{ id: 'm1', kind: 'fabric', role: 'main', name: 'Mystery jersey', spec: { construction: 'single jersey' } }] });
  assert.equal(noWeight.verdict, 'good'); assert.deepEqual(noWeight.asks.map(a => a.fields), [['weightGsm']]); assert.equal(noWeight.asks[0].id, 'm1');
  assert.match(noWeight.summary, /Nothing wrong so far, but 1 detail is missing/);
  const nothing = fabricFit({ style: 'tee', materials: [{ id: 'm2', kind: 'fabric', role: 'main', name: 'Bolt 7', spec: {} }] });
  assert.equal(nothing.verdict, 'check'); assert.deepEqual(nothing.asks[0].fields, ['construction', 'weightGsm']);
  // leggings with a fabric that says nothing about stretch: asked, not failed as "no stretch"
  const legs = fabricFit({ style: 'leggings', materials: [{ id: 'm3', kind: 'fabric', role: 'main', name: 'Swatch 12', spec: { construction: 'interlock', weightGsm: 240 } }] });
  assert.ok(!legs.findings.some(f => f.level === 'fail'));
  const legs2 = fabricFit({ style: 'leggings', materials: [{ id: 'm4', kind: 'fabric', role: 'main', name: 'Twill 3', spec: { construction: 'twill', weightGsm: 240 } }] });
  assert.ok(legs2.asks.some(a => a.fields.includes('stretch')) && legs2.verdict !== 'wrong', 'a woven that does not say its stretch is asked about');
  const legs3 = fabricFit({ style: 'leggings', materials: [{ id: 'm5', kind: 'fabric', role: 'main', name: 'Twill 3', spec: { construction: 'twill', weightGsm: 240, composition: '100% cotton' } }] });
  assert.equal(legs3.verdict, 'wrong', 'once it says 100% cotton, the check can tell');
});

test('a shoe is checked on its parts: upper thickness and patent, lining, sole hardness and thickness', () => {
  const up = (spec, o = {}) => ({ id: 'u', kind: 'footwear', part: 'upper', name: 'Upper', spec: { category: 'upper leather', ...spec }, ...o });
  const sole = spec => ({ id: 's', kind: 'footwear', part: 'outsole', name: 'Sole', spec: { category: 'outsole', ...spec } });
  assert.equal(footwearFit({ materials: [] }).verdict, 'unknown');
  const good = footwearFit({ materials: [up({ thicknessMm: 1.4 }), sole({ hardness: '65', thicknessMm: 4 })] });
  assert.equal(good.verdict, 'good'); assert.equal(good.asks.length, 0); assert.match(good.summary, /suit a shoe/);
  const thin = footwearFit({ materials: [up({ thicknessMm: .6 }), sole({ hardness: '50', thicknessMm: 2 })] });
  assert.equal(thin.verdict, 'check'); assert.ok(thin.findings.some(f => /thin for an upper/.test(f.msg)) && thin.findings.some(f => /soft for an outsole/.test(f.msg)) && thin.findings.some(f => /thin for an outsole/.test(f.msg)));
  assert.ok(footwearFit({ materials: [up({ category: 'patent leather', thicknessMm: 1.2 }), sole({ hardness: '65' })] }).findings.some(f => /cracks where the foot bends/.test(f.msg)));
  const lining = footwearFit({ materials: [up({ thicknessMm: 1.0 }), { id: 'l', kind: 'footwear', part: 'lining', name: 'Lining', spec: { category: 'lining', thicknessMm: 1.4 } }, sole({ hardness: '65' })] });
  assert.ok(lining.findings.some(f => f.part === 'lining'));
  const unknown = footwearFit({ materials: [up({}), sole({})] });
  assert.deepEqual(unknown.asks.map(a => a.fields[0]).sort(), ['hardness', 'thicknessMm']);
  assert.ok(footwearFit({ materials: [up({ thicknessMm: 1.4 })] }).asks.some(a => /sole/.test(a.msg)), 'no sole chosen yet: it says so');
  const cloth = footwearFit({ materials: [{ id: 'c', kind: 'fabric', part: 'upper', name: 'Canvas 180', spec: { construction: 'plain weave', weightGsm: 180 } }, sole({ hardness: '65' })] });
  assert.ok(cloth.findings.some(f => /backer/.test(f.fix)));
});

test('a plush is checked on its parts: the body pile and weight, hard eyes and pellets for small children', () => {
  const body = spec => ({ id: 'b', kind: 'plush', part: 'body', name: 'Minky', spec: { category: 'pile fabric', ...spec } });
  const fill = { id: 'f', kind: 'plush', part: 'fill', name: 'Fibre fill', spec: { category: 'fill' } };
  assert.equal(plushFit({ materials: [] }).verdict, 'unknown');
  assert.equal(plushFit({ materials: [body({ pileMm: 3, weightGsm: 320 }), fill] }).verdict, 'good');
  assert.ok(plushFit({ materials: [body({ pileMm: 30, weightGsm: 320 }), fill] }).findings.some(f => /hides the face/.test(f.msg)));
  assert.ok(plushFit({ materials: [body({ pileMm: 3, weightGsm: 120 }), fill] }).findings.some(f => /light for a plush body/.test(f.msg)));
  assert.ok(plushFit({ materials: [{ ...body({ weightGsm: 300 }), spec: { category: 'felt', weightGsm: 300 } }, fill] }).findings.some(f => /felt/.test(f.msg)));
  const eyes = plushFit({ materials: [body({ pileMm: 3, weightGsm: 320 }), fill, { id: 'e', kind: 'plush', part: 'eyes', name: 'Safety eyes 12 mm', spec: { category: 'safety eye' } }] });
  assert.ok(eyes.findings.some(f => /under-3s/.test(f.msg)) && eyes.asks.some(a => a.fields.includes('safety')));
  const ok3 = plushFit({ materials: [body({ pileMm: 3, weightGsm: 320 }), fill, { id: 'e', kind: 'plush', part: 'eyes', name: 'Safety eyes', spec: { category: 'safety eye', safety: 'EN71-1, 3+' } }] });
  assert.ok(!ok3.findings.some(f => f.part === 'eyes'), 'marked 3+: the eyes pass');
  assert.ok(plushFit({ materials: [body({ pileMm: 3, weightGsm: 320 }), { id: 'p', kind: 'plush', part: 'fill', name: 'Pellets', spec: { category: 'pellets' } }] }).findings.some(f => /inner bag/.test(f.msg)));
  assert.ok(plushFit({ materials: [{ id: 'w', kind: 'fabric', part: 'body', name: 'Cotton twill', spec: { construction: 'twill', weightGsm: 260 } }, fill] }).findings.some(f => /woven/.test(f.msg)));
});

test('materialFit picks the check by category; the ask form names its fields', () => {
  assert.equal(materialFit({ category: 'footwear', materials: [] }).summary, 'Choose the upper to check the materials suit a shoe.');
  assert.equal(materialFit({ category: 'plush', materials: [] }).summary, 'Choose the body fabric to check the materials suit a plush.');
  assert.equal(materialFit({ category: 'tops', style: '', materials: [] }), null);
  assert.equal(materialFit({ category: 'tops', style: 'tee', materials: [] }).verdict, 'unknown');
  const h = askHtml({ id: 'abc', part: 'outsole', fields: ['hardness', 'nope'], msg: 'How hard?' });
  assert.match(h, /data-mid="abc"/); assert.match(h, /name="hardness"/); assert.doesNotMatch(h, /nope/);
  assert.doesNotMatch(askHtml({ id: null, fields: [], msg: 'Choose the sole too.' }), /<form/);
  assert.ok(Object.keys(ASK_FIELDS).length >= 8);
});

test('the cloth is ranked for the style: the usual cloth at a usual weight first, wovens and leather last for a tee', async () => {
  const { rankFabrics } = await import('../src/lab-fabric-fit.js'); const { BUILTIN_MATERIALS } = await import('../src/lab-materials.js');
  const fabrics = BUILTIN_MATERIALS.filter(m => m.kind === 'fabric'), tee = rankFabrics('tee', fabrics);
  assert.equal(tee.length, fabrics.length, 'every fabric is ranked');
  assert.match(tee[0].spec.construction, /jersey/); assert.equal(tee[0].fit.tier, 'best');
  const at = re => tee.findIndex(m => re.test(m.name)), tiers = tee.map(m => m.fit.tier);
  assert.ok(at(/180 gsm single jersey/) < at(/400 gsm French terry/) && at(/400 gsm French terry/) < at(/duck canvas/), 'jersey, then a heavy terry, then canvas');
  assert.equal(tee[at(/duck canvas/)].fit.tier, 'no'); assert.match(tee[at(/duck canvas/)].fit.why, /cut from a knit; this is a woven/);
  assert.match(tee[at(/400 gsm French terry/)].fit.why, /Heavy for a tee \(usually 120–300 gsm\)/);
  assert.deepEqual([...tiers].sort((a, b) => ['best', 'good', 'check', 'no'].indexOf(a) - ['best', 'good', 'check', 'no'].indexOf(b)).slice(0, 3), tiers.slice(0, 3), 'best first');
  const hoodie = rankFabrics('hoodie', fabrics); assert.match(hoodie[0].spec.construction, /fleece|terry/);
  const pants = rankFabrics('pants', fabrics); assert.match(`${pants[0].name} ${pants[0].spec.construction}`, /twill|denim|canvas/);
  assert.equal(rankFabrics('bag', fabrics)[0].fit.tier, 'best', 'a library bag ranks as a tote');
  assert.equal(rankFabrics('spaceship', fabrics)[0].fit.tier, '', 'no rules, no ranking');
});

test('the tee jerseys cover the fibres, spinning and weights a tee is made in', async () => {
  const { BUILTIN_MATERIALS } = await import('../src/lab-materials.js');
  const jersey = BUILTIN_MATERIALS.filter(m => m.kind === 'fabric' && /jersey/.test(m.spec?.construction || '') && /cotton/i.test(m.spec?.composition || ''));
  const g = jersey.map(m => m.spec.weightGsm); assert.ok(jersey.length >= 18 && Math.min(...g) <= 120 && Math.max(...g) >= 330, `${jersey.length} cotton jerseys, ${Math.min(...g)}–${Math.max(...g)} gsm`);
  for (const w of [/supima/i, /pima/i, /egyptian/i, /organic/i, /ring-spun/i, /slub/i, /pigment/i, /tubular/i]) assert.ok(jersey.some(m => w.test(`${m.name} ${m.spec.composition}`)), String(w));
});
