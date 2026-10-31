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
