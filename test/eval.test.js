import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDraft, compareToGolden, PLAUSIBLE_IN } from '../src/eval.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const good = () => ({
  style: { styleName: 'Box tee', category: 'Tops — tee', description: 'Boxy heavyweight tee with a ribbed collar and dropped shoulder.', fabricSummary: '240gsm cotton jersey', sampleSize: 'M' },
  sizes: ['S', 'M', 'L'],
  sketches: [{ id: 'p1', view: 'front', label: 'Photo', image: png, callouts: [
    { n: 1, label: 'Collar', spec: '1x1 rib, 2cm', x: 0.5, y: 0.1 }, { n: 2, label: 'Shoulder seam', spec: 'Dropped 2"', x: 0.25, y: 0.2 }, { n: 3, label: 'Hem', spec: 'Double needle', x: 0.5, y: 0.9 },
    { n: 4, label: 'Sleeve cuff', spec: 'Single fold', x: 0.1, y: 0.45 }, { n: 5, label: 'Side seam', spec: 'Overlocked', x: 0.15, y: 0.6 }, { n: 6, label: 'Chest print', spec: 'Screen print', x: 0.5, y: 0.45 }
  ] }],
  pom: [
    { code: 'A', name: 'Across shoulder', tolerance: '±0.5', values: { S: '20', M: '21', L: '22' } },
    { code: 'B', name: 'Chest width', tolerance: '±0.5', values: { S: '22', M: '23', L: '24' } },
    { code: 'C', name: 'Body length HPS', tolerance: '±0.5', values: { S: '27', M: '28', L: '29' } }
  ],
  bom: [{ component: 'Body', material: '240gsm cotton jersey' }, { component: 'Collar', material: '1x1 cotton rib' }, { component: 'Thread', material: 'Poly core' }, { component: 'Label', material: 'Woven' }],
  construction: [{ area: 'Collar', detail: 'Rib set' }, { area: 'Hem', detail: 'Double needle' }, { area: 'Shoulder', detail: 'Taped' }, { area: 'Side', detail: 'Overlock' }],
  colorways: [{ name: 'Bone', swatch: '#eae6dc' }], care: { fiber: '100% cotton', instructions: 'Cold wash' }
});

test('a full, sane draft scores high on its own', () => {
  const s = scoreDraft(good(), { sampleSize: 'M', box: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 } });
  assert.equal(s.coverage.mean, 1); assert.equal(s.plausibility.rate, 1); assert.equal(s.plausibility.checked, 3);
  assert.equal(s.grounding.rate, 1); assert.deepEqual(s.consistency.issues, []); assert.equal(s.score, 1);
});

test('implausible measurements, stacked or off-product pins and TBD materials pull the score down', () => {
  const bad = good();
  bad.pom[1].values.M = '2';                                    // 2" chest
  bad.sketches[0].callouts = bad.sketches[0].callouts.map(c => ({ ...c, x: 0.95, y: 0.95 })); // all stacked in a corner, outside the box
  bad.bom[0].material = 'TBD';
  bad.colorways[0].swatch = 'red';
  const s = scoreDraft(bad, { sampleSize: 'M', box: { x: 0.05, y: 0.05, w: 0.6, h: 0.6 } });
  assert.equal(s.plausibility.inRange, 2); assert.equal(s.plausibility.outOfRange[0].code, 'B');
  assert.equal(s.grounding.inBox, 0); assert.equal(s.grounding.distinct, 1); assert.equal(s.grounding.rate, 0);
  assert.ok(s.consistency.issues.some(i => /TBD/.test(i)) && s.consistency.issues.some(i => /swatch/.test(i)));
  assert.ok(s.score < 0.7);
});

test('plausibility only judges named points of measure it knows', () => {
  const p = good(); p.pom.push({ code: 'Q', name: 'Mystery', values: { S: '999', M: '999', L: '999' } });
  const s = scoreDraft(p, { sampleSize: 'M' });
  assert.equal(s.plausibility.checked, 3);
  assert.ok(PLAUSIBLE_IN['chest width'][0] < 20 && PLAUSIBLE_IN['chest width'][1] > 30);
});

test('against the golden pack: tolerance-aware measurements, label and component overlap', () => {
  const g = good(), d = good();
  d.pom[0].values.M = '21.4';   // within ±0.5
  d.pom[1].values.M = '26';     // 3" off on a 23: outside 8% and tolerance
  d.pom.pop();                  // C missing
  d.sketches[0].callouts = d.sketches[0].callouts.slice(0, 3).concat([{ n: 9, label: 'Pocket', spec: 'Patch', x: 0.3, y: 0.5 }]);
  d.bom = d.bom.slice(0, 2);
  const c = compareToGolden(d, g, { sampleSize: 'M' });
  assert.equal(c.pom.compared, 2); assert.equal(c.pom.within, 1); assert.equal(c.pom.missing, 1); assert.equal(c.pom.misses[0].code, 'B');
  assert.equal(c.callouts.overlap, 0.429); assert.equal(c.bom.overlap, 0.5); assert.equal(c.construction.overlap, 1);
  assert.ok(c.score > 0.4 && c.score < 0.8);
  assert.equal(compareToGolden(good(), good(), { sampleSize: 'M' }).score, 1);
});
