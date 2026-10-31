import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { archetype, engineer, cleanAssembly } from '../src/lab-assembly.js';
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

test('designed from the concept: laid out in the engine\'s terms, the checks\' problems sent back and fixed', async () => {
  const { composeAssembly, COMPOSE_SCHEMA } = await import('../src/lab-assembly-compose.js'), { readFileSync } = await import('node:fs');
  const answers = JSON.parse(readFileSync(new URL('../scripts/journeys/fixtures/assembly-compose.json', import.meta.url), 'utf8')), seen = [];
  let i = 0; const ask = async (system, content, schema) => { seen.push(content.at(-1).text); assert.equal(schema, COMPOSE_SCHEMA); return answers[i++]; };
  const r = await composeAssembly({ concept: { name: 'Bike front light', category: 'electronics', description: 'A USB-C rechargeable front light' }, ask });
  assert.equal(r.status, 'clear'); assert.equal(r.rounds.length, 2); assert.match(r.rounds[0].bad[0], /too thin/); assert.deepEqual(r.rounds[1].bad, []);
  assert.match(seen[1], /The engine found these problems:\n- Body: a 0\.6 mm wall/); assert.equal(r.spec.arch, 'custom'); assert.equal(r.spec.kind, 'electronics');
  assert.ok(r.spec.parts.find(p => p.id === 'led').elec.kind === 'ledcob' && r.eng.harness.some(c => c.label === 'LED') && r.eng.certs.some(c => /IEC 62471/.test(c.name)), 'checked, wired and certified like any other');
  assert.equal((await composeAssembly({ concept: { name: 'A poem' }, ask: async () => ({ product: false, kind: 'goods', parts: [], why: 'Not a physical product' }) })).status, 'not-a-product');
  // a repair that makes it worse is not taken
  let k = 0; const worse = await composeAssembly({ concept: { name: 'x' }, ask: async () => (k++ === 0 ? answers[0] : { ...answers[0], parts: answers[0].parts.map(p => (p.id === 'top' ? { ...p, wall: .4 } : p)) }) });
  assert.equal(worse.status, 'needs-work'); assert.equal(worse.rounds.length, 1);
});

test('a designed product\'s cell is priced from its capacity, not left free', async () => {
  const { composeAssembly } = await import('../src/lab-assembly-compose.js'), { readFileSync } = await import('node:fs');
  const a = JSON.parse(readFileSync(new URL('../scripts/journeys/fixtures/assembly-compose.json', import.meta.url), 'utf8'))[1];
  const r = await composeAssembly({ concept: { name: 'Bike light' }, ask: async () => a });
  assert.ok(r.eng.parts.find(p => p.id === 'battery').unit > 1, 'a 2000 mAh cell costs something'); assert.ok(r.eng.parts.find(p => p.id === 'mcu').unit > .5);
});

test('the review never takes away the last part of its kind the product works by; a replacement goes in first', () => {
  const s = archetype('powerbank'), cell = s.parts.find(p => p.elec && ['battery', 'li18650'].includes(p.elec.kind));
  const gone = applyFix(s, { op: 'remove', part: cell.id, why: 'simplify' });
  assert.ok(gone?.rejected && /only .* the product needs it/.test(gone.reason), gone?.reason);
  const board = s.parts.find(p => p.shape === 'pcb'); assert.ok(applyFix(s, { op: 'remove', part: board.id })?.rejected, 'nor the only board');
  // a replacement first, then the old one may come out
  const extra = applyFix(s, { op: 'add', part: 'cell-2', value: JSON.stringify({ name: 'Second cell', shape: 'box', size: [20, 20, 6], at: cell.at, parent: cell.parent, elec: { kind: cell.elec.kind, mah: 3000 } }) });
  if (extra && !extra.rejected) { const out = applyFix(extra.spec, { op: 'remove', part: cell.id }); assert.ok(!out?.rejected || !/only/.test(out.reason || ''), 'with another of its kind it is no longer the only one'); }
});

test('the engine flags an electronic product with nothing to power it', () => {
  const s = archetype('handheld'), cut = { ...s, parts: s.parts.filter(p => !(p.elec && (['battery', 'aa', 'li18650', 'psu', 'usbc', 'dcjack'].includes(p.elec.kind)))) };
  const E = engineer(cleanAssembly(cut)); assert.ok(E.checks.some(c => c.level === 'bad' && /No power source/.test(c.text)), E.checks.filter(c => c.level === 'bad').map(c => c.text));
  assert.ok(!engineer(s).checks.some(c => /No power source/.test(c.text)), 'the starting point has its power');
});
