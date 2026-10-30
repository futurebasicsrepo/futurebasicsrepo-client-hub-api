import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { archetype, engineer } from '../src/lab-assembly.js';
import { applyFix, mergeFixes, reviewAssembly, scoreOf, engineeringText, CRITERIA, BAR } from '../src/lab-assembly-review.js';

const all = n => CRITERIA.map(c => ({ key: c.key, score: n, note: '' }));
const views = async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test('an edit is made on the assembly, cleaned; one that adds a problem the engine catches is refused', () => {
  const s = archetype('puck');
  const a = applyFix(s, { op: 'set', part: 'top', field: 'wall', value: '2.4', why: 'stiffer top' }); assert.equal(a.spec.parts.find(p => p.id === 'top').wall, 2.4); assert.equal(a.change.from, 2);
  const thin = applyFix(s, { op: 'set', part: 'bottom', field: 'wall', value: '0.5', why: 'lighter' }); assert.equal(thin.rejected, true); assert.match(thin.reason, /too thin/);
  assert.equal(applyFix(s, { op: 'set', part: 'top', field: 'cost', value: '0' }), null, 'only the listed fields');
  assert.equal(applyFix(s, { op: 'set', part: 'top', field: 'resin', value: 'unobtainium' }), null);
  assert.equal(applyFix(s, { op: 'set', part: 'top', field: 'wall', value: '2' }), null, 'a change that changes nothing is not one');
  const add = applyFix(s, { op: 'add', part: 'gasket', field: '-', value: JSON.stringify({ name: 'Seal', shape: 'ring', size: [91, 91, 2], wall: 1.5, at: [0, 0, 31], resin: 'silicone (LSR)', process: 'LSR moulding', parent: null }), why: 'splash resistance' });
  assert.ok(add.spec.parts.some(p => p.id === 'gasket' && p.resin === 'silicone (LSR)'));
  const rm = applyFix(s, { op: 'remove', part: 'pipe', field: '-', value: '' }); assert.ok(!rm.spec.parts.some(p => p.id === 'pipe'));
});

test('two judges: the same ask is met in the middle, a clash is left for a person', () => {
  const { fixes, conflicts } = mergeFixes([
    { name: 'Claude', fixes: [{ op: 'set', part: 'top', field: 'wall', value: '2.4', why: 'a' }, { op: 'set', part: 'top', field: 'resin', value: 'ABS', why: 'b' }, { op: 'set', part: 'foot', field: 'size', value: '[80, 80, 1.5]', why: 'c' }] },
    { name: 'ChatGPT', fixes: [{ op: 'set', part: 'top', field: 'wall', value: '2.6', why: 'd' }, { op: 'set', part: 'top', field: 'resin', value: 'PC', why: 'e' }, { op: 'set', part: 'foot', field: 'size', value: '[82, 82, 1.5]', why: 'f' }] }]);
  assert.equal(fixes.find(f => f.field === 'wall').value, '2.5'); assert.equal(fixes.find(f => f.field === 'size').value, '[81,81,1.5]');
  assert.deepEqual(conflicts.map(c => c.key), ['set:top:resin']);
});

test('the review runs round by round until it clears the bar; the strictest judge stands; checks alone without a judge', async () => {
  const s = archetype('puck');
  const only = await reviewAssembly({ spec: s, views }); assert.equal(only.status, 'checks-only'); assert.equal(only.score, null);
  const claude = [{ criteria: all(80), fixes: [{ op: 'set', part: 'top', field: 'wall', value: '2.4', why: 'the top flexes under a press' }], beyondModel: ['a gasket groove under the grille'], summary: 'Close' }, { criteria: all(94), fixes: [], beyondModel: [], summary: 'Ready' }];
  const gpt = [{ criteria: all(70), fixes: [{ op: 'set', part: 'top', field: 'wall', value: '2.4', why: 'same' }], beyondModel: [], summary: 'Not yet' }, { criteria: all(91), fixes: [], beyondModel: [], summary: 'Fine' }];
  const J = (name, list) => { let i = 0; return { name, ask: async (system, content) => { assert.match(content.at(-1).text, /Parts \(id: name/); return list[Math.min(i++, list.length - 1)]; } }; };
  const rounds = []; const r = await reviewAssembly({ spec: s, concept: { name: 'Speaker puck' }, judges: [J('Claude', claude), J('ChatGPT', gpt)], views, onRound: x => rounds.push(x) });
  assert.equal(r.status, 'passed'); assert.equal(r.score, 91, 'the stricter score'); assert.ok(r.score >= BAR);
  assert.equal(r.spec.parts.find(p => p.id === 'top').wall, 2.4); assert.deepEqual(r.changes.map(c => [c.part, c.field, c.to]), [['top', 'wall', 2.4]]);
  assert.equal(r.rounds[0].score, 70); assert.ok(r.rounds[0].disagree === false && r.beyondModel.includes('a gasket groove under the grille'));
  // a review that gains nothing twice stops, and keeps the best assembly it saw
  const stuck = await reviewAssembly({ spec: s, judges: [{ name: 'Claude', ask: async () => ({ criteria: all(60), fixes: [], beyondModel: [], summary: '' }) }], views });
  assert.equal(stuck.status, 'needs-person'); assert.equal(stuck.rounds.length, 1);
});

test('what the judges read: the parts with materials and the engine\'s open checks; a problem the engine finds costs points', () => {
  const E = engineer(archetype('cdplayer')), t = engineeringText(E); assert.match(t, /- p5: CD loader/); assert.match(t, /Certifications planned: .*IEC 60825-1/);
  const s = archetype('puck'); s.parts.find(p => p.id === 'bottom').wall = .5; const bad = engineer(s);
  assert.equal(scoreOf(all(100), engineer(archetype('puck'))), 100); assert.ok(scoreOf(all(100), bad) <= 90);
});
