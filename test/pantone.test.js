import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/pantone-c.js';
import { colourWithCode, codeColourways } from '../src/pantone-codes.js';
const P = globalThis.FBPantone;

test('a colour is matched to the nearest Pantone C chip', () => {
  assert.ok(P.count > 1500, 'the table is loaded');
  assert.equal(P.code('#c8202a'), 'PANTONE 186 C', 'a classic red is 186 C');
  assert.equal(P.code('#0e1820'), 'PANTONE Black 6 C');
  assert.match(P.code('#1d2a4a'), /^PANTONE (533|2767|534) C$/, 'navy');
  const top = P.nearest('#c8202a', { n: 3 }); assert.equal(top.length, 3); assert.ok(top[0].deltaE <= top[1].deltaE && top[1].deltaE <= top[2].deltaE, 'closest first'); assert.ok(top[0].deltaE < 3);
  assert.equal(P.code('nope'), '');
});

test('foil and metallic colours get the standard metallic chip, not a dull grey match', () => {
  assert.equal(P.code('#c0c0c0', { hint: 'Silver Foil wordmark' }), 'PANTONE 877 C'); assert.equal(P.code('#d4af37', { hint: 'gold' }), 'PANTONE 871 C'); assert.equal(P.code('#b87333', { hint: 'copper rivets' }), 'PANTONE 876 C');
  assert.notEqual(P.code('#c0c0c0', { hint: 'light grey' }), 'PANTONE 877 C', 'only when the name says metal');
});

test('Pantone C codes are recognised, and TCX codes are not', () => {
  assert.ok(P.isC('PANTONE 485 C') && P.isC('PANTONE Cool Gray 11 C') && P.isC('pantone 186 c'));
  assert.ok(!P.isC('19-4007 TCX') && !P.isC('') && !P.isC('PANTONE 485 U') && !P.isC('485 C'));
});

test('a BOM colour carries its chip and the chip follows the colour', () => {
  assert.equal(colourWithCode('Mesh'), 'Mesh', 'no hex, no code');
  const a = colourWithCode('Red #c8202a'); assert.equal(a, 'Red #c8202a · PANTONE 186 C');
  assert.equal(colourWithCode(a), a, 'running it again changes nothing');
  assert.equal(colourWithCode('Red #0e1820 · PANTONE 186 C'), 'Red #0e1820 · PANTONE Black 6 C', 'a stale code is replaced when the hex changed');
});

test('colourways get Pantone C codes; a code already in C is kept, a TCX one is replaced', () => {
  const pack = { colorways: [{ name: 'Red', swatch: '#c8202a', code: '', notes: '' }, { name: 'Navy', swatch: '#1d2a4a', code: '19-4007 TCX', notes: '' }, { name: 'Mine', swatch: '#c8202a', code: 'PANTONE 485 C', notes: '' }, { name: 'Silver Foil', swatch: '#c0c0c0', code: '', notes: 'trim' }, { name: 'No colour', swatch: '', code: '', notes: '' }] };
  const { pack: out, changed } = codeColourways(pack);
  assert.equal(out.colorways[0].code, 'PANTONE 186 C'); assert.match(out.colorways[1].code, /^PANTONE .+ C$/); assert.equal(out.colorways[2].code, 'PANTONE 485 C', 'a person\'s own C code stays');
  assert.equal(out.colorways[3].code, 'PANTONE 877 C'); assert.equal(out.colorways[4].code, ''); assert.equal(changed, 3);
  assert.equal(codeColourways(pack, { keep: false }).pack.colorways[2].code, 'PANTONE 186 C', 'with keep off every code is recomputed');
});
