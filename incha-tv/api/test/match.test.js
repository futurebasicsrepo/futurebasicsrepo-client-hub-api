import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, autoFullTime, matchClock, normalizeMatchInput } from '../src/match.js';

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

test('autoFullTime calls quiet matches that ran well past full time', () => {
  const T0 = Date.parse('2026-09-26T15:00:00Z');
  const at = m => new Date(T0 + m * 60_000);
  const second = { period: '2h', periodStartedAt: at(0), halfLength: 45 };
  assert.equal(autoFullTime({ ...second, lastActivityAt: at(40) }, +at(70)), null, 'still in stoppage-ish time');
  assert.equal(autoFullTime({ ...second, lastActivityAt: at(60) }, +at(78)), null, 'past time but the board is still busy');
  assert.deepEqual(autoFullTime({ ...second, lastActivityAt: at(47) }, +at(80)), { minute: 90, stoppage: 3 }, 'ends at the last thing logged');
  assert.deepEqual(autoFullTime({ ...second, lastActivityAt: at(10) }, +at(80)), { minute: 90, stoppage: 0 }, 'never before regulation time');
  assert.deepEqual(autoFullTime({ ...second, lastActivityAt: at(134) }, +at(136)), { minute: 90, stoppage: 90 }, 'hard cap even when busy (extra time and penalties, logged)');

  const first = { period: '1h', periodStartedAt: at(0), halfLength: 45 };
  assert.equal(autoFullTime({ ...first, lastActivityAt: at(20) }, +at(120)), null, 'might be a long first half with no half time pressed');
  assert.deepEqual(autoFullTime({ ...first, lastActivityAt: at(20) }, +at(146)), { minute: 90, stoppage: 0 });

  const ht = { period: 'ht', periodStartedAt: at(0), halfLength: 30, halftimeAt: at(33) };
  assert.equal(autoFullTime({ ...ht, lastActivityAt: at(33) }, +at(110)), null);
  assert.deepEqual(autoFullTime({ ...ht, lastActivityAt: at(33) }, +at(120)), { minute: 60, stoppage: 0 });

  const resumed = { ...second, lastActivityAt: at(47), resumedAt: at(150) };
  assert.equal(autoFullTime(resumed, +at(160)), null, 'resuming counts as activity and lifts the hard cap');
  assert.deepEqual(autoFullTime(resumed, +at(171)), { minute: 90, stoppage: 106 }, 'but a resumed match that goes quiet again still ends');
  assert.equal(autoFullTime({ ...second, period: 'ft' }, +at(500)), null);
  assert.equal(autoFullTime({ ...second, period: 'pre' }, +at(500)), null);
});
