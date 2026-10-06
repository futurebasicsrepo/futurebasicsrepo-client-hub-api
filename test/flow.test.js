import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, planFlow, currentIndex, FLOW_EVENTS } from '../src/flow.js';

const ms = (statuses) => STAGES.map((name, i) => ({ id: `m${i}`, name, sort_order: i + 1, status: statuses[i] || 'upcoming' }));
const at = (plan, name) => plan.updates[STAGES.indexOf(name)];

test('a new product is at Brief, waiting on the client', () => {
  const plan = planFlow(ms(['current']), 'product-created');
  assert.equal(plan.stage, 'Brief'); assert.equal(plan.owner, 'client');
  assert.equal(at(plan, 'Brief').status, 'current'); assert.equal(at(plan, 'Concept').status, 'upcoming');
});

test('a staff-started product can name its own owner', () => {
  assert.equal(planFlow(ms(['current']), 'product-created', { owner: 'future-basics' }).owner, 'future-basics');
});

test('submitting moves to Concept and completes Brief; the client approving moves to Development', () => {
  const sub = planFlow(ms(['current']), 'pack-submitted');
  assert.equal(at(sub, 'Brief').status, 'complete'); assert.equal(at(sub, 'Concept').status, 'current'); assert.equal(sub.owner, 'future-basics');
  const ok = planFlow(ms(['complete', 'current']), 'pack-approved');
  assert.equal(ok.stage, 'Development'); assert.equal(at(ok, 'Concept').status, 'complete');
});

test('a forward-only event that arrives late changes nothing', () => {
  const inProduction = ms(['complete', 'complete', 'complete', 'complete', 'complete', 'current']);
  assert.equal(planFlow(inProduction, 'quote-issued'), null);
  assert.equal(planFlow(inProduction, 'pack-approved'), null);
});

test('a new version moves a product back to Concept and reopens the later milestones', () => {
  const inProduction = ms(['complete', 'complete', 'complete', 'complete', 'complete', 'current']);
  const plan = planFlow(inProduction, 'pack-published');
  assert.equal(plan.stage, 'Concept'); assert.equal(plan.owner, 'client');
  assert.equal(at(plan, 'Production').status, 'upcoming'); assert.equal(at(plan, 'Brief').status, 'complete');
});

test('a skipped Sample (a rushed product) stays skipped, and locking moves on to Approval', () => {
  const rushed = ms(['complete', 'complete', 'current', 'skipped']);
  const plan = planFlow(rushed, 'pack-locked');
  assert.equal(plan.stage, 'Approval'); assert.equal(at(plan, 'Sample').status, 'skipped');
});

test('delivered completes every milestone', () => {
  const plan = planFlow(ms(['complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'complete', 'current']), 'delivered');
  assert.equal(plan.stage, null); assert.ok(plan.updates.every(u => u.status === 'complete'));
});

test('the current milestone is the first current or blocked one, else the first unfinished', () => {
  assert.equal(currentIndex(ms(['complete', 'blocked'])), 1);
  assert.equal(currentIndex(ms(['complete', 'complete', 'upcoming'])), 2);
  assert.equal(currentIndex(ms(STAGES.map(() => 'complete'))), STAGES.length);
});

test('every event names a known stage and owner', () => {
  for (const [k, ev] of Object.entries(FLOW_EVENTS)) {
    if (ev.stage !== null) assert.ok(STAGES.includes(ev.stage), k);
    if (ev.owner !== null) assert.ok(['client', 'future-basics', 'factory'].includes(ev.owner), k);
  }
  assert.throws(() => planFlow(ms([]), 'nope'));
});
