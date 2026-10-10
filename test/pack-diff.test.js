import test from 'node:test';
import assert from 'node:assert/strict';
import { packDiff, diffSummary, carriedAcks } from '../src/pack-diff.js';
import { normalizeTechPack, calloutKey } from '../src/techpack.js';

const base = () => normalizeTechPack({
  style: { styleNumber: 'FB-1', styleName: 'Hoodie', sampleSize: 'M' }, sizes: ['S', 'M', 'L'],
  sketches: [{ id: 'sk1', view: 'front', image: '', callouts: [{ n: 1, label: 'Hood', spec: 'Double layer', note: '' }, { n: 2, label: 'Cuff', spec: '2x2 rib', note: '' }] }],
  pom: [{ code: 'A', name: 'Chest', how: 'Under arm', tolerance: '±0.5', values: { S: '20', M: '21', L: '22' } }],
  bom: [{ component: 'Body', material: 'Fleece 320gsm', spec: '', supplier: 'Mill A' }],
  construction: [{ area: 'Hem', detail: 'Coverstitch 12mm' }],
  colorways: [{ name: 'Grey', code: 'PANTONE Cool Gray 4 C', swatch: '#b8bcc0' }],
  care: { instructions: 'Wash cold', countryOfOrigin: 'Vietnam' }
});
const next = fn => { const p = structuredClone(base()); fn(p); return normalizeTechPack(p); };

test('no edits, no changes', () => { assert.deepEqual(packDiff(base(), base()), []); assert.match(diffSummary([]), /No changes/); });

test('a measurement edit names the measurement, the size and both values', () => {
  const c = packDiff(base(), next(p => { p.pom[0].values.M = '21.5'; }));
  assert.equal(c.length, 1); assert.equal(c[0].section, 'Measurements'); assert.match(c[0].label, /Chest/); assert.equal(c[0].from, 'M: 21'); assert.equal(c[0].to, 'M: 21.5');
});

test('added, changed and removed things are told apart, in the section a factory looks for them', () => {
  const c = packDiff(base(), next(p => {
    p.sketches[0].callouts[0].spec = 'Triple layer'; p.sketches[0].callouts.pop(); p.sketches[0].callouts.push({ n: 3, label: 'Pocket', spec: 'Kangaroo', note: '' });
    p.bom[0].supplier = 'Mill B'; p.construction.push({ area: 'Neck', detail: 'Twin needle' }); p.colorways[0].code = 'PANTONE Cool Gray 5 C'; p.care.countryOfOrigin = 'China';
  }));
  const kinds = c.map(x => `${x.section}:${x.kind}`).sort();
  assert.deepEqual(kinds, ['Callouts:added', 'Callouts:changed', 'Callouts:removed', 'Care and origin:changed', 'Colours:changed', 'Construction:added', 'Materials:changed']);
  assert.match(diffSummary(c), /^7 changes: .*callout/);
});

test('whitespace and key order are not changes', () => {
  const c = packDiff(base(), next(p => { p.sketches[0].callouts[0].spec = '  Double layer '; p.style.styleName = 'Hoodie'; }));
  assert.deepEqual(c, []);
});

test('acknowledgements stay only for callouts whose words did not change', () => {
  const b = base(), a = next(p => { p.sketches[0].callouts[1].spec = '1x1 rib'; });
  const acks = { [calloutKey(b.sketches[0], b.sketches[0].callouts[0])]: { by: 'Mill', at: 'x' }, [calloutKey(b.sketches[0], b.sketches[0].callouts[1])]: { by: 'Mill', at: 'x' } };
  const kept = carriedAcks(b, a, acks);
  assert.deepEqual(Object.keys(kept), ['sk1:1']);
  assert.deepEqual(carriedAcks(b, a, {}), {}); assert.deepEqual(carriedAcks(b, a, null), {});
});

test('a long run of changes is capped', () => {
  const big = next(p => { p.pom = Array.from({ length: 70 }, (_, i) => ({ code: 'P' + i, name: 'Point ' + i, tolerance: '±1', values: { S: '1', M: '2', L: '3' } })); });
  assert.ok(packDiff(base(), big).length <= 60);
});
