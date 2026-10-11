import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTrigger, cleanStep, cleanAutomation, matches, waitMs, inSendWindow, nextSendTime, cleanWindow, DEFAULT_WINDOW, describeTrigger, describeStep, starterAutomations, MAX_STEPS } from '../src/sales-automations.js';

const T = '11111111-1111-4111-8111-111111111111';

test('a trigger needs a type and the thing it listens for', () => {
  assert.equal(cleanTrigger({ type: 'nonsense' }).error, 'Choose what starts this automation');
  assert.match(cleanTrigger({ type: 'tag_added' }).error, /tag/);
  assert.deepEqual(cleanTrigger({ type: 'tag_added', tag: 'Spring Launch' }).value, { type: 'tag_added', tag: 'spring-launch' });
  assert.match(cleanTrigger({ type: 'deal_stage', stage: 'nope' }).error, /stage/);
  assert.deepEqual(cleanTrigger({ type: 'deal_stage', stage: 'proposal' }).value, { type: 'deal_stage', stage: 'proposal' });
  assert.match(cleanTrigger({ type: 'deal_quiet', days: 1 }).error, /2 to 90/);
  assert.equal(cleanTrigger({ type: 'deal_quiet', days: '7' }).value.days, 7);
  assert.match(cleanTrigger({ type: 'contact_created', source: 'martian' }).error, /arrive/);
  assert.deepEqual(cleanTrigger({ type: 'contact_created', source: 'website' }).value, { type: 'contact_created', source: 'website' });
  assert.deepEqual(cleanTrigger({ type: 'showcase_view' }).value, { type: 'showcase_view' });
});

test('each kind of step is checked', () => {
  assert.match(cleanStep({ kind: 'wait', days: 0, hours: 0 }).error, /hour/);
  assert.match(cleanStep({ kind: 'wait', days: 90 }).error, /60 days/);
  assert.match(cleanStep({ kind: 'wait', hours: 30 }).error, /hour/);
  assert.deepEqual(cleanStep({ kind: 'wait', days: 2 }).value, { kind: 'wait', days: 2, hours: 0 });
  assert.match(cleanStep({ kind: 'task', title: '  ' }).error, /title/);
  assert.match(cleanStep({ kind: 'task', title: 'Call {{nope}}' }).error, /\{\{nope\}\}/);
  assert.deepEqual(cleanStep({ kind: 'task', title: 'Call {{name}} about {{build|it}}', dueDays: 2 }).value, { kind: 'task', title: 'Call {{name}} about {{build|it}}', dueDays: 2 });
  assert.match(cleanStep({ kind: 'task', title: 'x', dueDays: 99 }).error, /30 days/);
  assert.match(cleanStep({ kind: 'tag' }).error, /tag/);
  assert.deepEqual(cleanStep({ kind: 'tag', add: 'Hot Lead' }).value, { kind: 'tag', add: 'hot-lead' });
  assert.match(cleanStep({ kind: 'email', templateId: 'abc' }).error, /template/);
  assert.equal(cleanStep({ kind: 'email', templateId: T }).value.templateId, T);
  assert.match(cleanStep({ kind: 'dance' }).error, /Choose/);
});

test('an automation needs a name, a trigger, steps, and something after the last wait', () => {
  const ok = { name: 'Follow up', trigger: { type: 'showcase_view' }, steps: [{ kind: 'wait', days: 1 }, { kind: 'task', title: 'Say hello' }] };
  const v = cleanAutomation(ok).value;
  assert.equal(v.name, 'Follow up'); assert.equal(v.stop_on_reply, true); assert.equal(v.reenter_days, null);
  assert.equal(cleanAutomation({ ...ok, name: ' ' }).error, 'Give the automation a name');
  assert.equal(cleanAutomation({ ...ok, steps: [] }).error, 'Add at least one step');
  assert.match(cleanAutomation({ ...ok, steps: [{ kind: 'task', title: 'x' }, { kind: 'wait', days: 1 }] }).error, /last step/);
  assert.match(cleanAutomation({ ...ok, steps: [{ kind: 'task', title: 'x' }, { kind: 'wait' }, { kind: 'task', title: 'y' }] }).error, /^Step 2/);
  assert.match(cleanAutomation({ ...ok, steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ kind: 'task', title: 'x' })) }).error, /up to/);
  assert.equal(cleanAutomation({ ...ok, stopOnReply: false }).value.stop_on_reply, false);
  assert.equal(cleanAutomation({ ...ok, reenterDays: 30 }).value.reenter_days, 30);
  assert.equal(cleanAutomation({ ...ok, reenterDays: 'never' }).value.reenter_days, null);
  assert.match(cleanAutomation({ ...ok, reenterDays: 0 }).error, /again/);
});

test('an event starts only the automation that listens for it', () => {
  assert.equal(matches({ type: 'showcase_view' }, { type: 'showcase_view' }), true);
  assert.equal(matches({ type: 'showcase_view' }, { type: 'showcase_demo' }), false);
  assert.equal(matches({ type: 'tag_added', tag: 'vip' }, { type: 'tag_added', tag: 'VIP' }), true);
  assert.equal(matches({ type: 'tag_added', tag: 'vip' }, { type: 'tag_added', tag: 'other' }), false);
  assert.equal(matches({ type: 'deal_stage', stage: 'won' }, { type: 'deal_stage', stage: 'lost' }), false);
  assert.equal(matches({ type: 'contact_created' }, { type: 'contact_created', source: 'import' }), true);
  assert.equal(matches({ type: 'contact_created', source: 'website' }, { type: 'contact_created', source: 'import' }), false);
  assert.equal(matches(null, { type: 'x' }), false);
});

test('waits add up', () => { assert.equal(waitMs({ days: 1, hours: 2 }), 26 * 3600_000); });

test('email only goes in working hours, on weekdays', () => {
  const w = DEFAULT_WINDOW; // 13:00-22:00 UTC, weekdays
  assert.equal(inSendWindow('2026-10-12T15:00:00Z', w), true);   // a Monday afternoon
  assert.equal(inSendWindow('2026-10-12T03:00:00Z', w), false);  // Monday 3am
  assert.equal(inSendWindow('2026-10-17T15:00:00Z', w), false);  // a Saturday
  assert.equal(nextSendTime('2026-10-12T03:00:00Z', w).toISOString(), '2026-10-12T13:00:00.000Z');
  assert.equal(nextSendTime('2026-10-12T23:00:00Z', w).toISOString(), '2026-10-13T13:00:00.000Z');
  assert.equal(nextSendTime('2026-10-16T23:00:00Z', w).toISOString(), '2026-10-19T13:00:00.000Z', 'Friday night waits for Monday');
  assert.equal(nextSendTime('2026-10-12T15:00:00Z', w).toISOString(), '2026-10-12T15:00:00.000Z', 'inside the window: now');
  assert.equal(inSendWindow('2026-10-17T03:00:00Z', { ...w, startHour: 0, endHour: 24, weekdaysOnly: false }), true);
});

test('the working-hours settings are checked', () => {
  assert.match(cleanWindow({ startHour: 30 }).error, /0 to 23/);
  assert.match(cleanWindow({ startHour: 20, endHour: 10 }).error, /after it starts/);
  const w = cleanWindow({ startHour: 8, endHour: 20, weekdaysOnly: false, paused: true }).value;
  assert.deepEqual(w, { startHour: 8, endHour: 20, weekdaysOnly: false, paused: true });
});

test('plain-words descriptions and the starter automations', () => {
  assert.equal(describeTrigger({ type: 'deal_quiet', days: 7 }), 'When an open deal has had nothing for 7 days');
  assert.equal(describeTrigger({ type: 'deal_stage', stage: 'proposal' }), 'When a deal moves to Proposal');
  assert.equal(describeStep({ kind: 'wait', days: 1, hours: 2 }), 'Wait 1 day 2 hours');
  assert.equal(describeStep({ kind: 'email', templateId: T }, { [T]: 'Checking in' }), 'Send the email “Checking in”');
  const starters = starterAutomations({ 'After they looked at a build': T });
  assert.ok(starters.length >= 4);
  for (const s of starters) assert.equal(cleanAutomation(s).error, undefined, `${s.name} is valid`);
  assert.ok(starters.every(s => !s.enabled), 'none is switched on');
});
