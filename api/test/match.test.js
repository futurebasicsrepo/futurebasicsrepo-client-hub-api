import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, matchClock, normalizeMatchInput } from '../src/match.js';

const T0 = Date.parse('2026-09-26T15:00:00Z');
const min = n => T0 + n * 60_000;

test('matchClock counts football minutes with stoppage time', () => {
  const first = { period: '1h', periodStartedAt: new Date(T0), halfLength: 45 };
  assert.deepEqual(matchClock(first, T0 + 5_000), { minute: 1, stoppage: 0, label: "1'" });
  assert.equal(matchClock(first, min(33.5)).label, "34'");
  assert.equal(matchClock(first, min(46)).label, "45+2'");
  const second = { period: '2h', periodStartedAt: new Date(T0), halfLength: 40 };
  assert.equal(matchClock(second, min(0)).label, "41'");
  assert.equal(matchClock(second, min(41)).label, "80+2'");
  assert.equal(matchClock({ period: 'ht', periodStartedAt: new Date(T0), halfLength: 45 }), null);
  assert.equal(matchClock({ period: 'pre', periodStartedAt: null, halfLength: 45 }), null);
});

test('normalizeMatchInput validates teams and forces youth matches unlisted', () => {
  assert.ok(normalizeMatchInput({ home: 'A', away: '' }).errors.length);
  assert.ok(normalizeMatchInput({ home: 'Rangers', away: 'rangers' }).errors.length);
  assert.ok(normalizeMatchInput({ home: 'A', away: 'B', halfLength: 90 }).errors.length);
  const youth = normalizeMatchInput({ home: 'U12 Lions', away: 'U12 Tigers', youth: true, visibility: 'public' });
  assert.deepEqual(youth.errors, []);
  assert.equal(youth.values.visibility, 'unlisted');
  assert.equal(normalizeMatchInput({ home: 'A', away: 'B' }).values.halfLength, 45);
});

test('applyEvent enforces the period flow and scores goals', () => {
  let match = { period: 'pre', periodStartedAt: null, halfLength: 45, homeScore: 0, awayScore: 0 };
  assert.equal(applyEvent(match, { type: 'goal', side: 'home' }).error, 'Kick off first.');
  assert.ok(applyEvent(match, { type: 'halftime' }).error);
  const kick = applyEvent(match, { type: 'kickoff' }, T0);
  assert.equal(kick.patch.period, '1h');
  match = { ...match, period: '1h', periodStartedAt: new Date(T0) };
  const goal = applyEvent(match, { type: 'goal', side: 'away', player: '  Marcus  ' }, min(33));
  assert.deepEqual(goal.event, { type: 'goal', side: 'away', player: 'Marcus', minute: 34, stoppage: 0 });
  assert.deepEqual(goal.patch, { awayScore: 1 });
  assert.equal(applyEvent(match, { type: 'goal', side: 'middle' }).error, 'Pick a team.');
  assert.equal(applyEvent(match, { type: 'yellow', side: 'home', minute: 12 }).event.minute, 12);
  assert.ok(applyEvent(match, { type: 'note' }).error);
  assert.equal(applyEvent(match, { type: 'note', player: 'Rain delay' }).event.side, null);
  assert.equal(applyEvent(match, { type: 'fulltime' }, min(50)).patch.period, 'ft');
  assert.ok(applyEvent({ ...match, period: 'ft' }, { type: 'fulltime' }).error);
  assert.ok(applyEvent(match, { type: 'penalty' }).error);
});
