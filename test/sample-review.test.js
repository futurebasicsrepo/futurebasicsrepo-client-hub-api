import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sample-review.js';
import { emptyTechPack, normalizeTechPack } from '../src/techpack.js';
const { check, apply } = globalThis.FBSample;

const pack = () => normalizeTechPack({ ...emptyTechPack(), style: { sampleSize: 'M' }, sizes: ['S', 'M', 'L'],
  pom: [{ code: 'A', name: 'Chest width', tolerance: '±0.5', values: { S: '20', M: '21', L: '22' } }, { code: 'B', name: 'Body length', tolerance: '0.5', values: { S: '27', M: '28', L: '29' } }],
  sampling: [{ stage: 'Proto sample', qty: '2', status: 'sent', review: { verdict: 'revise', at: '2026-10-27', measured: { A: '22.25', B: '28.25' }, adopt: ['B'], corrections: [{ area: 'Neck rib', change: 'Rib is rolling: use a 2x2 rib, 1 in wide' }, { area: 'x', change: '' }] } }, { stage: 'Fit sample', status: 'planned' }] });

test('a sample is measured against the spec and its tolerance', () => {
  const c = check(pack(), 0);
  assert.deepEqual(c.map(x => [x.code, x.diff, x.out]), [['A', 1.25, true], ['B', 0.25, false]]);
});
test('a review becomes the next version: the spec it accepts, the corrections, the next sample asked for', () => {
  const p = pack(), n = normalizeTechPack(apply(p, 0));
  assert.deepEqual(n.pom[1].values, { S: '27.25', M: '28.25', L: '29.25' }, 'an accepted measurement moves the size run with it');
  assert.equal(n.pom[0].values.M, '21', 'a measurement not accepted stays the spec');
  assert.ok(n.construction.some(c => c.area === 'Correction · Proto sample: Neck rib' && /2x2 rib/.test(c.detail)));
  assert.ok(n.construction.some(c => /measurements to correct/.test(c.area) && /A Chest width: 22.25 against 21/.test(c.detail)), 'what is out and not accepted is a correction too');
  assert.equal(n.sampling[0].status, 'revise'); assert.equal(n.sampling[1].status, 'requested'); assert.match(n.sampling[1].notes, /Corrections from the Proto sample review/);
  const twice = normalizeTechPack(apply(n, 0)); assert.equal(twice.construction.filter(c => c.area.startsWith('Correction · Proto sample')).length, n.construction.filter(c => c.area.startsWith('Correction · Proto sample')).length, 'applying again does not double them');
  const lone = normalizeTechPack(apply({ ...p, sampling: [p.sampling[0]] }, 0)); assert.equal(lone.sampling[1].stage, 'Proto sample (corrected)', 'with no next stage planned, a corrected one is asked for');
  const ok = normalizeTechPack(apply({ ...p, sampling: [{ ...p.sampling[0], review: { verdict: 'approved' } }, p.sampling[1]] }, 0)); assert.equal(ok.sampling[0].status, 'approved'); assert.equal(ok.sampling[1].status, 'planned');
});
