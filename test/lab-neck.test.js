import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NECKLINES, cleanNeckline, takesNeckline, necklineWords, necklineSvg } from '../src/lab-neck.js';
import { cleanFlat, defaultParams, renderSvg } from '../src/lab-flats.js';

test('the five necklines, each with its rib and the factory words', () => {
  assert.deepEqual(NECKLINES.map(n => n.id), ['thin', 'regular', 'vneck', 'mock', 'turtle']);
  assert.ok(NECKLINES.every(n => n.label && n.how && n.rib > 0));
  assert.ok(NECKLINES.find(n => n.id === 'thin').rib < NECKLINES.find(n => n.id === 'regular').rib);
  assert.ok(NECKLINES.find(n => n.id === 'turtle').stand > NECKLINES.find(n => n.id === 'mock').stand);
  assert.equal(cleanNeckline('vneck'), 'vneck'); assert.equal(cleanNeckline('cowl'), null);
});

test('only knit tops take one: not a hoodie, a shirt, a polo or trousers', () => {
  for (const s of ['tee', 'longsleeve', 'crewneck', 'tank', 'dress']) assert.ok(takesNeckline(s), s);
  for (const s of ['hoodie', 'ziphoodie', 'shirt', 'polo', 'jacket', 'pants']) assert.ok(!takesNeckline(s), s);
  assert.equal(necklineWords({ style: 'hoodie', neckline: 'mock' }), '');
  assert.match(necklineWords({ style: 'tee', neckline: 'turtle' }), /folded/);
});

test('the flat keeps it and draws it, front and back, over a cover of the sketch\'s own neckline', () => {
  for (const n of NECKLINES) {
    const { params } = cleanFlat({ ...defaultParams('tee'), neckline: n.id, color: '#2a2a2c' });
    assert.equal(params.neckline, n.id);
    for (const v of ['front', 'back']) assert.ok(renderSvg(params, v).includes(`data-neckline="${n.id}"`), `${n.id} ${v}`);
    const k = necklineSvg(params, 'front', { neckWidth: 7.25, neckDropFront: 3.5, neckDropBack: 1 }, { cloth: '#2a2a2c' });
    assert.ok(k.under.includes('fill="#ffffff"') && k.over.includes('#2a2a2c'), 'the cover takes the cloth colour with the sketch; the new one is drawn in it');
  }
  assert.ok(!renderSvg(cleanFlat({ ...defaultParams('tee'), neckline: 'nope' }).params, 'front').includes('data-neckline'));
  assert.ok(!renderSvg(cleanFlat({ ...defaultParams('hoodie'), neckline: 'mock' }).params, 'front').includes('data-neckline'), 'a hoodie keeps its hood');
});
