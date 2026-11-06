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

test('a neckline sets the neck measurements, and the graded table, the words and the drawing all read them', async () => {
  const { necklineMeasures, necklinePomName } = await import('../src/lab-neck.js');
  const { pomTable, measurementsFor } = await import('../src/lab-flats.js');
  const base = defaultParams('tee').m;
  assert.deepEqual(necklineMeasures(null, base), { neckWidth: base.neckWidth, neckDropFront: base.neckDropFront, neckDropBack: base.neckDropBack, neckRib: base.neckRib });
  const v = necklineMeasures('vneck', base), mk = necklineMeasures('mock', base), tu = necklineMeasures('turtle', base), th = necklineMeasures('thin', base);
  assert.equal(v.neckDropFront, base.neckDropFront + 2.25); assert.equal(v.neckRib, .75);
  assert.equal(mk.neckRib, 1.75); assert.equal(tu.neckRib, 2.75);
  assert.ok(mk.neckWidth < base.neckWidth && tu.neckWidth < mk.neckWidth, 'a stand sits closer to the neck');
  assert.ok(mk.neckDropFront < base.neckDropFront, 'and higher at the front');
  assert.equal(th.neckRib, .5); assert.equal(th.neckDropFront, base.neckDropFront);

  const p = { ...defaultParams('tee'), neckline: 'vneck' }; p.m = { ...p.m, ...v };
  const rows = pomTable(p), drop = rows.find(r => r.key === 'neckDropFront'), rib = rows.find(r => r.key === 'neckRib');
  assert.equal(drop.name, 'Front neck drop to the V point'); assert.equal(rib.name, 'V neck rib width');
  assert.equal(drop.values.find(x => x.size === 'M').value, v.neckDropFront);
  assert.ok(measurementsFor(p, 'XL').neckDropFront > v.neckDropFront, 'every size is graded from it');
  assert.match(necklineWords(p), /front drop 5 3\/4" \(14\.6 cm\) to the V point/);

  const t = { ...defaultParams('tee'), neckline: 'turtle' }; t.m = { ...t.m, ...tu };
  assert.equal(pomTable(t).find(r => r.key === 'neckRib').name, 'Collar stand height, finished (folded)');
  assert.equal(necklinePomName('turtle', 'chest'), null);
  assert.match(necklineWords(t), /2 3\/4" \(7\.0 cm\) stand/);
  assert.match(renderSvg(cleanFlat(t).params, 'front'), /data-neckline="turtle"/);
  // an older save with a plain rib still gets a real stand
  assert.match(necklineWords({ ...defaultParams('tee'), neckline: 'mock' }), /1 3\/4" \(4\.4 cm\)/);
});
