import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sample-review.js';
import '../src/sample-form.js';
import { normalizeTechPack } from '../src/techpack.js';
import { formPack } from '../src/sample-form-routes.js';
const F = globalThis.FBSampleForm;

const pack = () => normalizeTechPack({
  style: { styleName: 'Tour hoodie' }, sizes: ['S', 'M', 'L'],
  sketches: [{ id: 'f1', view: 'front', callouts: [{ n: 1, label: 'Neck rib', spec: '1x1 rib, 3/4 in', x: 0.5, y: 0.1 }] }, { id: 'b1', view: 'back', callouts: [] }],
  pom: [{ code: 'A', name: 'Chest width', tolerance: '0.5', values: { S: '20', M: '21', L: '22' } }, { code: 'B', name: 'Body length', tolerance: '0.5', values: { S: '26', M: '27', L: '28' } }],
  bom: [{ component: 'Body', material: 'Cotton fleece 380gsm', color: 'Navy', cost: 4.2, supplier: 'Mill A' }],
  colorways: [{ name: 'Navy', code: '19-4024 TCX' }],
  construction: [{ area: 'Side seams', detail: 'Flatlock' }],
  artwork: [{ id: 'art1', name: 'Crest', pantones: [{ hex: '#9a2419', code: 'PANTONE 7622 C' }], placements: [{ sketchId: 'b1', x: 0.5, y: 0.3, w: 0.4, widthIn: '11', label: 'Centre back' }] },
    { id: 'ref', name: 'Technical flat - front', note: 'From the Design Lab' }],
  labels: [{ item: 'Main label', spec: 'Woven', placement: 'Centre back neck' }],
  sampling: [{ stage: 'Proto', status: 'received' }, { stage: 'Fit', status: 'planned' }]
});

test('the checklist is read from the pack: callouts with where they sit, placed artwork, materials, colourways, construction and labels', () => {
  const list = F.checklist(pack());
  assert.deepEqual([...new Set(list.map(x => x.group))], ['Callouts', 'Artwork', 'Materials and trims', 'Colourways', 'Construction', 'Labels and trims']);
  const call = list.find(x => x.group === 'Callouts');
  assert.equal(call.title, '1. Neck rib'); assert.equal(call.sketchId, 'f1'); assert.equal(call.x, 0.5);
  const art = list.filter(x => x.group === 'Artwork');
  assert.equal(art.length, 1, 'a picture kept for reference (no inks, no placement) is not something to check on a sample');
  assert.match(art[0].title, /Crest · Centre back/); assert.match(art[0].detail, /11 in wide/); assert.match(art[0].detail, /PANTONE 7622 C/);
  assert.match(list.find(x => x.group === 'Materials and trims').detail, /Cotton fleece 380gsm · Navy/);
  assert.equal(new Set(list.map(x => x.key)).size, list.length, 'every line has its own key');
});

test('the form keeps only what the pack can hold: known lines, known measurements, real flats, pictures', () => {
  const p = pack(), list = F.checklist(p);
  const f = F.normalize({ at: '2026-11-05', reviewers: 'Dan, Alyssa', sampleSize: 'XL', measured: { A: '21.25', Z: '9' }, adopt: ['A', 'B'],
    items: { [list[0].key]: { s: 'fix', note: 'Rib is 2x2', priority: 'nope', photo: 'data:image/png;base64,AAAA' }, 'made-up': { s: 'ok' }, [list[1].key]: { s: 'maybe' } },
    pins: [{ sketchId: 'b1', x: 0.2, y: 0.9, note: 'Hem twists' }, { sketchId: 'nowhere', x: 0.2, y: 0.2 }, { sketchId: 'f1', x: 'a', y: 0.2 }],
    photos: [{ image: 'https://example.com/x.png' }, { image: 'data:image/jpeg;base64,BBBB', label: 'front' }], verdict: 'maybe' }, p);
  assert.equal(f.sampleSize, '', 'a size the pack does not have is dropped');
  assert.deepEqual(f.measured, { A: '21.25' }); assert.deepEqual(f.adopt, ['A'], 'only a measured point can become the spec');
  assert.deepEqual(Object.keys(f.items), [list[0].key]); assert.equal(f.items[list[0].key].priority, 'must'); assert.equal(f.items[list[0].key].photo, 'data:image/png;base64,AAAA');
  assert.equal(f.pins.length, 1); assert.equal(f.pins[0].priority, 'must');
  assert.equal(f.photos.length, 1, 'only an image the page made is kept, never a link');
  assert.equal(f.verdict, '');
});

test('where it stands: out of tolerance unless accepted as the new spec, what is still open, and the fixes by priority', () => {
  const p = pack(), list = F.checklist(p);
  let f = F.normalize({ sampleSize: 'M', measured: { A: '22' }, items: { [list[0].key]: { s: 'fix', note: 'x', priority: 'should' }, [list[1].key]: { s: 'ok' } }, pins: [{ sketchId: 'f1', x: 0.1, y: 0.1, note: 'y' }], verdict: 'revise' }, p);
  let s = F.summary(p, f);
  assert.equal(s.out, 1); assert.equal(s.measured, 1); assert.equal(s.poms, 2); assert.equal(s.checked, 2); assert.equal(s.should, 1); assert.equal(s.must, 1); assert.equal(s.complete, false);
  assert.equal(s.verdictWords, 'Needs another sample');
  f = F.normalize({ ...f, adopt: ['A'] }, p); s = F.summary(p, f);
  assert.equal(s.out, 0, 'an accepted measurement is not out'); assert.equal(s.adopted, 1);
  f = F.normalize({ ...f, measured: { A: '22', B: '27' }, items: Object.fromEntries(list.map(x => [x.key, { s: 'ok' }])) }, p);
  assert.equal(F.summary(p, f).complete, true);
});

test('measurements are checked at the size the room measured', () => {
  const p = pack(), f = F.normalize({ sampleSize: 'L', measured: { A: '22.25' } }, p);
  const a = F.measurements(p, f).find(m => m.code === 'A');
  assert.equal(a.spec, 22); assert.equal(a.diff, 0.25); assert.equal(a.out, false);
});

test('handing over puts the review on the draft as that sample\'s review, in the shape the pack keeps; a stage the pack does not list is added', () => {
  const p = pack(), list = F.checklist(p);
  const f = F.normalize({ at: '2026-11-05', reviewers: 'Dan', sampleSize: 'M', measured: { A: '22' }, items: { [list[0].key]: { s: 'fix', note: 'Rib is 2x2', priority: 'must' } }, verdict: 'approved-with-changes' }, p);
  const out = normalizeTechPack(F.handOver(p, f, 'Proto'));
  const rv = out.sampling[0].review;
  assert.equal(rv.verdict, 'approved', 'approved with changes goes to production'); assert.equal(rv.by, 'Dan');
  assert.deepEqual(rv.measured, { A: '22' }); assert.equal(rv.corrections[0].area, 'Callouts: 1. Neck rib'); assert.equal(rv.corrections[0].change, 'Must fix: Rib is 2x2');
  const extra = normalizeTechPack(F.handOver(p, f, 'Salesman sample'));
  assert.equal(extra.sampling.length, 3); assert.equal(extra.sampling[2].stage, 'Salesman sample'); assert.ok(extra.sampling[2].review);
  assert.equal(p.sampling[0].review, null, 'the pack given in is not changed');
});

test('applying writes it into the pack: accepted measurements move the size run, fixes and pins become corrections, pins become callouts, the next sample is asked for', () => {
  const p = pack(), list = F.checklist(p);
  const f = F.normalize({ sampleSize: 'M', measured: { A: '22', B: '28' }, adopt: ['B'], items: { [list[0].key]: { s: 'fix', note: 'Rib is 2x2', priority: 'must' } },
    pins: [{ sketchId: 'b1', x: 0.3, y: 0.8, note: 'Hem twists', priority: 'should' }], verdict: 'revise' }, p);
  const out = normalizeTechPack(F.applyToPack(p, p, f, 'Proto'));
  assert.deepEqual(out.pom.find(r => r.code === 'B').values, { S: '27', M: '28', L: '29' }, 'the accepted length moves the whole run');
  const fixes = out.construction.filter(c => c.area.startsWith('Correction · Proto'));
  assert.ok(fixes.some(c => /Neck rib/.test(c.area) && /Must fix: Rib is 2x2/.test(c.detail)));
  assert.ok(fixes.some(c => /pin 1/.test(c.area) && /Should fix: Hem twists/.test(c.detail)));
  assert.ok(fixes.some(c => /measurements to correct/.test(c.area) && /A Chest width: 22 against 21/.test(c.detail)));
  const pin = out.sketches.find(s => s.id === 'b1').callouts.find(c => c.label === 'Fix · Proto');
  assert.ok(pin, 'the pin is on the back flat'); assert.equal(pin.x, 0.3); assert.equal(pin.spec, 'Should fix');
  assert.deepEqual(out.sampling.map(r => [r.stage, r.status]), [['Proto', 'revise'], ['Fit', 'requested']]);
  // applied again (the same stage): replaced, not doubled
  const again = normalizeTechPack(F.applyToPack(out, p, f, 'Proto'));
  assert.equal(again.sketches.find(s => s.id === 'b1').callouts.filter(c => c.label === 'Fix · Proto').length, 1);
});

test('the next sample\'s form starts with what the last one was asked to fix', () => {
  const p = pack(), list = F.checklist(p);
  const f = F.normalize({ items: { [list[0].key]: { s: 'fix', note: 'Rib is 2x2' } }, pins: [{ sketchId: 'b1', x: 0.3, y: 0.8, note: 'Hem twists' }], verdict: 'revise' }, p);
  const next = F.checklist(normalizeTechPack(F.applyToPack(p, p, f, 'Proto')));
  const last = next.filter(x => x.group === 'Last sample’s corrections');
  assert.equal(next[0].group, 'Last sample’s corrections', 'they come first');
  assert.ok(last.some(x => /Neck rib/.test(x.title)));
  assert.ok(last.some(x => /Proto · on the back/.test(x.title) && x.sketchId === 'b1'), 'a pin comes back as its callout, where it sits');
  assert.equal(last.filter(x => /pin 1/.test(x.title)).length, 0, 'and once: not again as a correction line');
  assert.equal(next.filter(x => x.group === 'Callouts' && /Fix ·/.test(x.title)).length, 0);
});

test('a client is given only what the form needs: no costs, suppliers or prices', () => {
  const fp = formPack(pack());
  assert.equal(fp.bom[0].cost, undefined); assert.equal(fp.bom[0].supplier, undefined); assert.equal(fp.commercial, undefined);
  assert.equal(fp.bom[0].material, 'Cotton fleece 380gsm');
});
