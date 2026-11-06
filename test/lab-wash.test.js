import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WASHES, cleanWash, cleanDistress, distressParts, washWords, washPrompt, washSvg } from '../src/lab-wash.js';
import { cleanFlat, defaultParams, renderSvg } from '../src/lab-flats.js';

test('the washes a garment takes: stone, acid, snow, enzyme, potassium permanganate, bleach and the rest, each with the factory words', () => {
  for (const id of ['stone', 'acid', 'snow', 'enzyme', 'pp-spray', 'bleach', 'garment-dye', 'pigment', 'mineral', 'ozone', 'laser', 'sun']) assert.ok(WASHES.some(w => w.id === id), id);
  assert.ok(WASHES.every(w => w.label && w.how && w.group));
  assert.match(WASHES.find(w => w.id === 'pp-spray').how, /potassium permanganate/i);
});

test('cleaning: an unknown wash or none is dropped; strength and the distress amount are kept in range', () => {
  assert.equal(cleanWash({ type: 'none' }), null); assert.equal(cleanWash({ type: 'lava' }), null);
  assert.deepEqual(cleanWash({ type: 'stone', strength: 'x' }), { type: 'stone', strength: 'medium' });
  assert.deepEqual(cleanDistress({ on: 1, amount: 250 }), { on: true, amount: 100 });
  assert.deepEqual(cleanDistress({ on: false, amount: 30 }), { on: false, amount: 30 });
});

test('more distressing means more wear: patches, then holes, then heavier fraying', () => {
  const a = distressParts(10), b = distressParts(60), c = distressParts(100);
  assert.ok(a.holes === 0 && b.holes > 0 && c.holes > b.holes && c.abrasion > a.abrasion && c.fray > a.fray);
  assert.deepEqual([a.level, b.level, c.level], ['light', 'medium', 'heavy']);
});

test('the words: the wash for the factory, distressing only when it is on', () => {
  const w = washWords({ wash: { type: 'acid', strength: 'heavy' }, distress: { on: false, amount: 80 } });
  assert.equal(w.length, 1); assert.match(w[0], /^Acid wash, heavy\./);
  assert.match(washWords({ distress: { on: true, amount: 60 } })[0], /^Distressed, medium \(60\/100\)/);
  assert.equal(washPrompt({}), '');
  assert.match(washPrompt({ wash: { type: 'snow', strength: 'light' }, distress: { on: true, amount: 80 } }), /light snow wash finish, heavy distressing/);
});

test('the flat keeps the wash and distressing and draws them inside the garment', () => {
  const { params } = cleanFlat({ ...defaultParams('pants'), color: '#2b3a5c', wash: { type: 'stone', strength: 'heavy' }, distress: { on: true, amount: 70 } });
  assert.deepEqual([params.wash, params.distress], [{ type: 'stone', strength: 'heavy' }, { on: true, amount: 70 }]);
  const svg = renderSvg(params, 'front');
  assert.ok(svg.includes('data-wash="stone"') && svg.includes('data-distress="70"') && /mask="url\(#[^"]+-gm\)"/.test(svg));
  assert.ok(!renderSvg(defaultParams('pants'), 'front').includes('data-wash'));
  assert.equal(washSvg({ distress: { on: false, amount: 90 } }, { box: { x0: 0, y0: 0, x1: 10, y1: 10 }, mask: 'm' }), '', 'distressing off draws nothing');
});
