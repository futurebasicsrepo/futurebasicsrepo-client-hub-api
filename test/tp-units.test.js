import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
await import('../src/tp-units.js');
const { parseIn, metricOf, inch } = globalThis.FBTP_UNITS;

test('plain numbers, fractions and tolerances read as inches', () => {
  assert.equal(parseIn('10.50'), 10.5);
  assert.equal(parseIn('10 1/2'), 10.5);
  assert.equal(parseIn('10-1/2'), 10.5);
  assert.equal(parseIn('1/8'), 0.125);
  assert.equal(parseIn('±0.125'), 0.125);
  assert.equal(parseIn('+/-0.25'), 0.25);
  assert.equal(parseIn('0.5 in'), 0.5);
  assert.equal(parseIn('0.5"'), 0.5);
  assert.equal(parseIn('.5'), 0.5);
  assert.equal(parseIn(12), 12);
});

test('text, ranges, metric and nonsense give no conversion', () => {
  for (const x of ['', ' ', 'abc', '12.75 cm', '10-12', '1/0', '10 1/0', null, undefined, 'TBD', '10 in. approx', '±']) assert.equal(parseIn(x), null, JSON.stringify(x));
  assert.equal(metricOf('abc', 'len'), '');
  assert.equal(metricOf('0', 'len'), '');
});

test('lengths show centimetres, tolerances show millimetres', () => {
  assert.equal(metricOf('10.50', 'len'), '26.7 cm');
  assert.equal(metricOf('11.5', 'len'), '29.2 cm');
  assert.equal(metricOf('12', 'len'), '30.5 cm');
  assert.equal(metricOf('1', 'len'), '2.5 cm');
  assert.equal(metricOf('±0.125', 'tol'), '±3.2 mm');
  assert.equal(metricOf('±0.0625', 'tol'), '±1.6 mm');
  assert.equal(metricOf('+/-0.25', 'tol'), '±6.4 mm');
  assert.equal(metricOf('0.5', 'tol'), '12.7 mm', 'no ± in, no ± out');
  assert.equal(metricOf('1/8', 'tol'), '3.2 mm');
});

test('a stored inch number shows both units, and a missing one shows a dash', () => {
  assert.equal(inch(12), '12" / 30.5 cm');
  assert.equal(inch(3.5), '3.5" / 8.9 cm');
  assert.equal(inch(0.125), '0.13" / 0.3 cm');
  assert.equal(inch(null), '—');
  assert.equal(inch(''), '—');
});
