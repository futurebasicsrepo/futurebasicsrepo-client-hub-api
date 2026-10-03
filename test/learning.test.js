import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSnapshot, draftDiff, aggregateDiffs } from '../src/learning.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const draft = () => ({
  style: { styleName: 'Layer runner', category: 'Footwear — runner', description: 'A layered mesh runner with a chunky sole.', fabricSummary: 'Mesh + TPU', sampleSize: '9' },
  sizes: ['8', '9', '10'],
  sketches: [{ id: 'photo-1', view: 'front', label: 'Reference photo', image: png, callouts: [
    { n: 1, label: 'Toe cap', spec: 'TPU overlay', note: '', photo: png, x: 0.2, y: 0.6 },
    { n: 2, label: 'Heel counter', spec: 'Moulded', note: '', photo: '', x: 0.8, y: 0.5 },
    { n: 3, label: 'Lace loops', spec: 'Webbing', note: '', photo: '', x: 0.5, y: 0.3 }
  ] }],
  pom: [
    { code: 'A', name: 'Outsole length', how: 'Toe to heel', tolerance: '±0.125', values: { 8: '11.5', 9: '11.8', 10: '12.1' } },
    { code: 'B', name: 'Forefoot width (outsole)', how: '', tolerance: '±0.125', values: { 8: '4.1', 9: '4.2', 10: '4.3' } },
    { code: 'D', name: 'Heel height', how: '', tolerance: '±0.0625', values: { 8: '', 9: '', 10: '' } }
  ],
  bom: [{ component: 'Upper', material: 'Engineered mesh', spec: '', placement: '' }, { component: 'Outsole', material: 'Rubber', spec: '', placement: '' }],
  construction: [{ area: 'Toe', detail: 'Overlay stitched' }],
  colorways: [{ name: 'Volt', code: '', swatch: '#c6ff00' }],
  labels: [], care: { fiber: 'Mesh', instructions: 'Wipe clean' }, notes: 'AI DRAFT'
});

test('the snapshot keeps the structure and drops every image', () => {
  const s = draftSnapshot(draft());
  assert.equal(s.sketches[0].image, ''); assert.equal(s.sketches[0].hasImage, true);
  assert.equal(s.sketches[0].callouts[0].photo, ''); assert.equal(s.sketches[0].callouts[0].hasPhoto, true);
  assert.equal(s.pom.length, 3); assert.equal(s.style.styleName, 'Layer runner');
});

test('an untouched pack is 100% kept', () => {
  const d = draftDiff(draftSnapshot(draft()), draft(), { sampleSize: '9' });
  assert.equal(d.keptRate, 1); assert.equal(d.changes.length, 0);
  assert.equal(d.sections.pom.total, 2, 'only rows the assistant filled count');
  assert.equal(d.sections.callouts.total, 3);
});

test('edits, removals, additions and moved pins are counted per section', () => {
  const cur = draft();
  cur.pom[0].values['9'] = '12.0';                         // measurement corrected
  cur.pom.push({ code: 'Z', name: 'Collar height', values: { 8: '3', 9: '3', 10: '3' } }); // row added
  cur.sketches[0].callouts = [cur.sketches[0].callouts[0], { ...cur.sketches[0].callouts[2], x: 0.1, y: 0.1 }]; // heel removed, laces moved
  cur.sketches[0].callouts[0].spec = 'TPU overlay, 1.2mm';  // spec edited
  cur.bom[1].material = 'Rubber, 45 shore';
  cur.style.category = 'Footwear — trail';
  const d = draftDiff(draftSnapshot(draft()), cur, { sampleSize: '9' });
  assert.deepEqual([d.sections.pom.kept, d.sections.pom.edited, d.sections.pom.removed, d.sections.pom.added], [1, 1, 0, 1]);
  assert.equal(d.sections.pom.cellsChanged, 1); assert.equal(d.sections.pom.cellsTotal, 2);
  assert.deepEqual([d.sections.callouts.kept, d.sections.callouts.edited, d.sections.callouts.removed, d.sections.callouts.moved], [1, 1, 1, 1]);
  assert.equal(d.sections.bom.edited, 1); assert.equal(d.sections.style.changed, 1);
  assert.ok(d.keptRate < 1 && d.keptRate > 0);
  assert.ok(d.changes.some(c => c.section === 'pom' && c.key === 'a' && c.field === 'values.9' && c.to === '12.0'));
  assert.ok(d.changes.some(c => c.section === 'callouts' && c.key === 'heel counter' && c.change === 'removed'));
});

test('without a sample size every size counts, and a value typed as text still compares', () => {
  const cur = draft(); cur.pom[0].values['8'] = '11.50';
  const d = draftDiff(draftSnapshot(draft()), cur);
  assert.equal(d.sections.pom.cellsTotal, 6); assert.equal(d.sections.pom.cellsChanged, 0, '11.50 equals 11.5');
});

test('aggregate weights sections by volume and surfaces the most corrected keys', () => {
  const a = draftDiff(draftSnapshot(draft()), draft(), { sampleSize: '9' });
  const cur = draft(); cur.pom[0].values['9'] = '13'; cur.sketches[0].callouts.splice(1, 1);
  const b = draftDiff(draftSnapshot(draft()), cur, { sampleSize: '9' });
  const agg = aggregateDiffs([{ stats: a }, { stats: b }]);
  assert.equal(agg.packs, 2);
  assert.equal(agg.sections.pom.total, 4); assert.equal(agg.sections.pom.kept, 3); assert.equal(agg.sections.pom.keptRate, 0.75);
  assert.deepEqual(agg.mostCorrected.pom[0], { key: 'a', n: 1 });
  assert.deepEqual(agg.mostCorrected.callouts[0], { key: 'heel counter', n: 1 });
  assert.ok(agg.keptRate > 0.8 && agg.keptRate < 1);
  assert.equal(aggregateDiffs([]).packs, 0); assert.equal(aggregateDiffs([]).keptRate, null);
});
