import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTechPack } from '../src/techpack.js';
import { toChange, validateChanges, applyChanges, revertChanges, reconcile, MAX_CHANGES } from '../src/loop.js';

const pack = () => normalizeTechPack({
  style: { styleName: 'Layer runner', category: 'Footwear — chunky runner', fabricSummary: 'Mesh upper', sampleSize: '10' },
  sizes: ['9', '10', '11'],
  sketches: [{ id: 's1', view: 'lateral', label: 'Ref', callouts: [{ n: 1, label: 'Heel wrap', spec: 'TPU overlay', note: 'bond' }] }],
  pom: [{ code: 'A', name: 'Outsole length', values: { 9: '11.1', 10: '11.5', 11: '11.8' }, tolerance: '±0.125' }],
  bom: [{ component: 'Upper', material: 'Engineered mesh', color: 'Bone', notes: '' }, { component: 'Outsole', material: 'Rubber', color: 'Gum', notes: 'Waffle' }],
  colorways: [{ name: 'Bone / gum', swatch: '#e8e2d0' }],
  construction: [{ area: 'Midsole', detail: 'Cold-cemented EVA' }]
});

test('a proposal becomes a change only for an allowed field that actually changes', () => {
  const p = pack();
  const c = toChange({ section: 'bom', index: 0, field: 'material', to: 'Suede', reason: 'The photo shows suede' }, p);
  assert.equal(c.from, 'Engineered mesh'); assert.equal(c.to, 'Suede'); assert.deepEqual(c.path, ['bom', 0, 'material']); assert.equal(c.label, 'Upper · material'); assert.equal(c.reason, 'The photo shows suede');
  assert.equal(toChange({ section: 'bom', index: 0, field: 'material', to: 'Engineered mesh' }, p), null, 'no change, no proposal');
  assert.equal(toChange({ section: 'bom', index: 9, field: 'material', to: 'x' }, p), null, 'a row that does not exist');
  assert.equal(toChange({ section: 'bom', index: 0, field: 'qty', to: '2' }, p), null, 'a field that is not on the list');
  assert.equal(toChange({ section: 'style', index: 0, field: 'fabricSummary', to: 'Suede upper' }, p).label, 'Style · fabric summary');
  assert.deepEqual(toChange({ section: 'callouts', sketch: 0, index: 0, field: 'spec', to: 'TPU overlay, 3 mm' }, p).path, ['sketches', 0, 'callouts', 0, 'spec']);
});

test('measurements, tolerances, sizes, care, artwork and labels can never be changed', () => {
  const p = pack();
  for (const bad of [{ section: 'pom', index: 0, field: 'tolerance', to: '±1' }, { section: 'pom', index: 0, field: 'values', to: '12' }, { section: 'sizes', index: 0, field: 'x', to: '8' }, { section: 'care', index: 0, field: 'fiber', to: 'x' },
    { section: 'artwork', index: 0, field: 'name', to: 'x' }, { section: 'labels', index: 0, field: 'item', to: 'x' }, { section: 'style', index: 0, field: 'sampleSize', to: '12' }, { section: 'style', index: 0, field: 'season', to: 'x' }, null, 'junk'])
    assert.equal(toChange(bad, p), null, JSON.stringify(bad));
  assert.deepEqual(validateChanges([{ section: 'pom', index: 0, field: 'tolerance', to: '±1' }], p), []);
});

test('a swatch must be a hex colour', () => {
  const p = pack();
  assert.equal(toChange({ section: 'colorways', index: 0, field: 'swatch', to: 'bone' }, p), null);
  assert.equal(toChange({ section: 'colorways', index: 0, field: 'swatch', to: '#AABBCC' }, p).to, '#aabbcc');
});

test('proposals are de-duplicated and capped', () => {
  const p = pack();
  const many = Array.from({ length: 20 }, (_, i) => ({ section: 'construction', index: 0, field: 'detail', to: `v${i}` }));
  assert.equal(validateChanges(many, p).length, 1, 'one field is one change');
  const wide = [...['component', 'material', 'spec', 'color', 'placement', 'notes'].map(f => ({ section: 'bom', index: 0, field: f, to: 'x' })), ...['component', 'material', 'spec', 'color', 'placement', 'notes'].map(f => ({ section: 'bom', index: 1, field: f, to: 'y' })), { section: 'construction', index: 0, field: 'area', to: 'z' }, { section: 'construction', index: 0, field: 'detail', to: 'z' }];
  assert.equal(validateChanges(wide, p).length, MAX_CHANGES);
  assert.deepEqual(validateChanges('nope', p), []);
});

test('changes apply only where the field still holds what the proposal was based on', () => {
  const p = pack(), cs = validateChanges([{ section: 'bom', index: 0, field: 'material', to: 'Suede' }, { section: 'bom', index: 1, field: 'material', to: 'TPU' }], p);
  const edited = structuredClone(p); edited.bom[1].material = 'Natural rubber'; // a person changed it meanwhile
  const r = applyChanges(edited, cs);
  assert.equal(r.pack.bom[0].material, 'Suede'); assert.equal(r.pack.bom[1].material, 'Natural rubber', 'the person\'s edit is kept');
  assert.equal(r.applied.length, 1); assert.equal(r.skipped.length, 1); assert.equal(r.skipped[0].path[1], 1);
});

test('changes can be undone, but not over something edited since', () => {
  const p = pack(), cs = validateChanges([{ section: 'bom', index: 0, field: 'material', to: 'Suede' }, { section: 'style', index: 0, field: 'fabricSummary', to: 'Suede upper' }], p);
  const { pack: after } = applyChanges(p, cs); assert.equal(after.bom[0].material, 'Suede');
  after.style.fabricSummary = 'Suede upper, edited by hand';
  const r = revertChanges(after, cs);
  assert.equal(r.pack.bom[0].material, 'Engineered mesh'); assert.equal(r.reverted.length, 1);
  assert.equal(r.pack.style.fabricSummary, 'Suede upper, edited by hand', 'a later edit is not undone'); assert.equal(r.kept.length, 1);
});

test('applying never touches measurements', () => {
  const p = pack(), { pack: after } = applyChanges(p, validateChanges([{ section: 'bom', index: 0, field: 'material', to: 'Suede' }], p));
  assert.deepEqual(after.pom, p.pom); assert.deepEqual(after.sizes, p.sizes);
});

test('the design assistant answers findings: fixture keeps what needs no change and fixes the marked row', async () => {
  const prev = process.env.AI_FIXTURE; process.env.AI_FIXTURE = process.env.AI_FIXTURE || 'fixture';
  try {
    const verdict = { score: 58, summary: 's', discrepancies: [{ severity: 'high', field: 'bom', title: 'T', detail: 'D', suggestion: 'S' }] };
    let r = await reconcile({ pack: pack(), verdict }); assert.equal(r.changes.length, 0); assert.equal(r.decisions[0].decision, 'keep');
    const marked = pack(); marked.bom[0].notes = '[needs-fix]';
    r = await reconcile({ pack: marked, verdict }); assert.equal(r.changes.length, 1); assert.equal(r.changes[0].path.join('.'), 'bom.0.notes'); assert.ok(!/needs-fix/i.test(r.changes[0].to)); assert.equal(r.decisions[0].decision, 'change');
    assert.deepEqual((await reconcile({ pack: marked, verdict: { score: 90, discrepancies: [] } })).changes, [], 'no findings, no work');
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; }
});

test('a new bom or construction row can be added at the end, and only there', () => {
  const p = pack();
  const add = validateChanges([{ section: 'construction', index: 1, field: 'area', to: 'Silhouette and proportions', reason: 'No row says how it is shaped' }, { section: 'construction', index: 1, field: 'detail', to: 'Low, chunky profile with a rounded toe box' }], p);
  assert.equal(add.length, 2); assert.equal(add[0].from, ''); assert.equal(add[0].label, 'New construction row · area');
  assert.deepEqual(validateChanges([{ section: 'construction', index: 5, field: 'area', to: 'gap' }], p), [], 'not past the end');
  assert.deepEqual(validateChanges([{ section: 'colorways', index: 1, field: 'name', to: 'new' }], p), [], 'colourways cannot grow');
  const { pack: out, applied } = applyChanges(p, add);
  assert.equal(applied.length, 2); assert.equal(out.construction.length, 2); assert.equal(out.construction[1].area, 'Silhouette and proportions');
  const back = revertChanges(out, applied); assert.equal(back.pack.construction.length, 1, 'undoing leaves no empty row behind'); assert.equal(back.reverted.length, 2);
  const bomAdd = validateChanges([{ section: 'bom', index: 2, field: 'component', to: 'Heel tab' }, { section: 'bom', index: 2, field: 'color', to: 'Black #111111' }], p);
  const r2 = applyChanges(p, bomAdd).pack; assert.equal(r2.bom.length, 3); assert.equal(r2.bom[2].color, 'Black #111111');
  assert.equal(revertChanges(r2, bomAdd).pack.bom.length, 2);
});

test('the fixture hooks make small edits that go round after round', async () => {
  process.env.AI_FIXTURE = 'x';
  try {
    const p = normalizeTechPack({ style: { fabricSummary: '[climb] Mesh' }, bom: [{ component: 'Upper', material: 'Mesh', notes: '' }], sizes: ['10'] });
    const r = await reconcile({ pack: p, verdict: { score: 60, summary: 's', discrepancies: [{ severity: 'high', field: 'bom', title: 't', detail: 'd', suggestion: 's' }] } });
    assert.equal(r.changes.length, 1); assert.equal(r.changes[0].to, '+');
    const r2 = await reconcile({ pack: applyChanges(p, r.changes).pack, verdict: { score: 72, summary: 's', discrepancies: [{ severity: 'high', field: 'bom', title: 't', detail: 'd', suggestion: 's' }] } });
    assert.equal(r2.changes[0].to, '++');
  } finally { delete process.env.AI_FIXTURE; }
});
