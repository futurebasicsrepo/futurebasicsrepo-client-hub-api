import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sample-review.js';
import { normalizeCompare, designWords, findingsToCorrections, compareSampleToDesign } from '../src/sample-compare.js';
import { normalizeTechPack } from '../src/techpack.js';

const FBSample = globalThis.FBSample;
const pack = () => ({ sampling: [{ stage: 'Proto sample', status: 'planned' }, { stage: 'Fit sample', status: 'planned' }, { stage: 'Pre-production sample', status: 'planned', due: '2026-12-20' }, { stage: 'Top of production', status: 'planned' }] });

test('the time-and-action calendar: dates planned in order from the day the pack goes out, kept ones left alone unless asked; late, soon, on track, done', () => {
  const dated = FBSample.planDates(pack(), '2026-10-01');
  assert.deepEqual(dated.sampling.map(r => r.due), ['2026-10-15', '2026-10-27', '2026-12-20', '2026-12-27'], 'a dated row keeps its date and the next counts from it');
  const all = FBSample.planDates(pack(), '2026-10-01', { all: true });
  assert.deepEqual(all.sampling.map(r => r.due), ['2026-10-15', '2026-10-27', '2026-11-10', '2026-11-17']);
  assert.equal(FBSample.leadOf('Proto sample (corrected)'), 10, 'a corrected sample is quicker');
  const p = dated; p.sampling[0].status = 'sent'; p.sampling[0].sentAt = '2026-10-14'; p.sampling[1].status = 'requested'; p.sampling[3].status = 'approved';
  const cal = FBSample.calendar(p, { today: '2026-11-01', bulkEta: '2026-11-03', bulkStatus: 'in_production' });
  assert.deepEqual(cal.map(x => [x.stage, x.state, x.daysLate]), [['Proto sample', 'late', 17], ['Fit sample', 'late', 5], ['Pre-production sample', 'on-track', 0], ['Top of production', 'done', 0], ['Bulk delivery', 'soon', 0]]);
  assert.equal(cal[0].sentAt, '2026-10-14'); assert.equal(cal[2].daysLeft, 49); assert.equal(cal[4].bulk, true);
  p.sampling[0].review = { verdict: 'revise', at: '2026-10-20' }; assert.equal(FBSample.calendar(p, { today: '2026-11-01' })[0].state, 'done', 'a reviewed sample is done, whatever its date');
  assert.equal(FBSample.calendar({ sampling: [{ stage: 'Fit sample', status: 'planned' }] })[0].state, 'undated');
});

test('the comparison comes back in one shape, the fixture stands in for the model, and its differences become corrections', async () => {
  const c = normalizeCompare({ score: 140, verdict: 'odd', summary: 'x'.repeat(2000), findings: [{ area: 'hem', kind: 'zap', severity: 'huge', what: 'Hem twists' }, { area: '', what: '' }] }, 'test-model');
  assert.equal(c.score, 100); assert.equal(c.verdict, 'matches'); assert.equal(c.summary.length, 1200); assert.deepEqual(c.findings, [{ area: 'hem', kind: 'other', severity: 'minor', what: 'Hem twists', expected: '', found: '' }]);
  const none = await compareSampleToDesign({ pack: {}, photos: [], env: {} }); assert.equal(none.verdict, 'cannot-judge'); assert.equal(none.model, 'none');
  const fx = await compareSampleToDesign({ pack: normalizeTechPack({}), stage: 'Proto sample', photos: ['data:image/png;base64,iVBORw0KGgo='], env: { AI_FIXTURE: '1' } });
  assert.equal(fx.model, 'fixture'); assert.equal(fx.findings.length, 3); assert.match(fx.summary, /Proto sample/);
  const corr = findingsToCorrections(fx.findings); assert.equal(corr.length, 2); assert.equal(corr[0].area, 'left chest'); assert.match(corr[0].change, /^Logo sits about 1 in lower than the spec \(spec: Logo centred 3\.5 in below the HPS; sample: /);
  await assert.rejects(() => compareSampleToDesign({ pack: {}, photos: ['data:image/png;base64,iVBORw0KGgo='], env: {} }), /not connected/);
});

test('the written design the model reads: placements in inches and percent, colourways with Pantones, construction, labels', () => {
  const p = normalizeTechPack({ sketches: [{ id: 'f', view: 'front', image: 'data:image/png;base64,iVBORw0KGgo=' }], artwork: [{ id: 'a', name: 'Crest', image: 'data:image/png;base64,iVBORw0KGgo=', pantones: [], placements: [{ sketchId: 'f', x: .5, y: .4, widthIn: 3.5, label: 'Left chest' }] }],
    colorways: [{ name: 'Washed black', code: 'PANTONE Black 6 C', swatch: '#1f1f22' }], construction: [{ area: 'Neck rib', detail: '2x2 rib, 1 in finished' }], labels: [{ item: 'Neck label', spec: '60 × 15 mm woven', placement: 'neck seam' }] });
  const w = designWords(p);
  assert.match(w, /Crest on the front 3\.5 in wide, at 50% across and 40% down the view \(Left chest\)/); assert.match(w, /Washed black PANTONE Black 6 C #1f1f22/); assert.match(w, /Neck rib: 2x2 rib/); assert.match(w, /Neck label: 60 × 15 mm woven \(neck seam\)/);
});

test('the pack keeps the sample photos, the comparison and the day a sample was sent, and drops what is not a picture', () => {
  const p = normalizeTechPack({ sampling: [{ stage: 'Proto sample', status: 'sent', sentAt: '2026-10-14', review: { photos: [{ image: 'data:image/jpeg;base64,/9j/4AAQ', label: 'front' }, { image: 'http://evil/x.jpg' }], compare: { score: '72', verdict: 'close', summary: 'Close.', findings: [{ area: 'body', kind: 'wash', severity: 'minor', what: 'Darker' }], at: '2026-10-28T00:00:00Z', model: 'm' } } }] });
  const r = p.sampling[0]; assert.equal(r.sentAt, '2026-10-14'); assert.equal(r.review.photos.length, 1); assert.equal(r.review.compare.score, 72); assert.equal(r.review.compare.findings[0].kind, 'wash');
  assert.equal(normalizeTechPack({ sampling: [{ stage: 'x', review: { photos: [] } }] }).sampling[0].review, null, 'an empty review stays empty');
});
