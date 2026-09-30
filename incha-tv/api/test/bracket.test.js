import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBracket, findPlayer, nextSlot, normalizePlayer, normalizeRoster, normalizeTournamentInput,
  roundName, seedOrder, shuffle, winnerByScore
} from '../src/bracket.js';

test('seedOrder keeps top seeds apart until the end', () => {
  assert.deepEqual(seedOrder(2), [1, 2]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.equal(new Set(seedOrder(32)).size, 32);
});

test('buildBracket: a full field has no byes', () => {
  const { size, rounds, fixtures } = buildBracket([1, 2, 3, 4]);
  assert.equal(size, 4);
  assert.equal(rounds, 2);
  assert.deepEqual(fixtures.filter(f => f.round === 1).map(f => [f.home, f.away]), [[1, 4], [2, 3]]);
  assert.deepEqual(fixtures.find(f => f.round === 2), { round: 2, position: 0, home: null, away: null, bye: false, winner: null });
});

test('buildBracket: top seeds get the byes and go straight through', () => {
  const { size, fixtures } = buildBracket([10, 20, 30, 40, 50]); // 5 teams → 8 slots, 3 byes
  assert.equal(size, 8);
  const first = fixtures.filter(f => f.round === 1);
  assert.equal(first.filter(f => f.bye).length, 3);
  assert.deepEqual(first.filter(f => !f.bye).map(f => [f.home, f.away]), [[40, 50]], 'only seeds 4 and 5 play in round one');
  const second = fixtures.filter(f => f.round === 2);
  assert.deepEqual(second.map(f => [f.home, f.away]), [[10, null], [20, 30]]);
  assert.equal(fixtures.length, 7);
});

test('buildBracket: two teams is just a final', () => {
  const { rounds, fixtures } = buildBracket([7, 9]);
  assert.equal(rounds, 1);
  assert.deepEqual(fixtures, [{ round: 1, position: 0, home: 7, away: 9, bye: false, winner: null }]);
  assert.throws(() => buildBracket([1]));
});

test('nextSlot, roundName, winnerByScore', () => {
  assert.deepEqual(nextSlot({ round: 1, position: 3 }, 3), { round: 2, position: 1, side: 'away' });
  assert.deepEqual(nextSlot({ round: 2, position: 0 }, 3), { round: 3, position: 0, side: 'home' });
  assert.equal(nextSlot({ round: 3, position: 0 }, 3), null);
  assert.deepEqual([1, 2, 3, 4].map(r => roundName(r, 4)), ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']);
  assert.equal(winnerByScore({ homeScore: 2, awayScore: 1, homeTeamId: 5, awayTeamId: 6 }), 5);
  assert.equal(winnerByScore({ homeScore: 0, awayScore: 3, homeTeamId: 5, awayTeamId: 6 }), 6);
  assert.equal(winnerByScore({ homeScore: 1, awayScore: 1, homeTeamId: 5, awayTeamId: 6 }), null);
});

test('rosters: players, numbers and matching what the scorekeeper typed', () => {
  assert.deepEqual(normalizePlayer({ name: '  Diego  Ruiz ', number: '9', position: 'FW' }).player, { name: 'Diego Ruiz', number: 9, position: 'FW' });
  assert.ok(normalizePlayer({ name: '' }).error);
  assert.ok(normalizePlayer({ name: 'X', number: 100 }).error);
  assert.ok(normalizePlayer({ name: 'X', number: 2.5 }).error);
  assert.deepEqual(normalizeRoster([{ name: 'A', number: 1 }, { name: '' }, { name: 'B' }]).players.map(p => p.name), ['A', 'B']);
  assert.match(normalizeRoster([{ name: 'A', number: 1 }, { name: 'B', number: 1 }]).error, /same shirt number/);
  assert.ok(normalizeRoster('nope').error);

  const roster = [{ id: 1, name: 'Diego Ruiz', number: 9 }, { id: 2, name: 'Sam Lee', number: 4 }, { id: 3, name: 'Sam Lee', number: null }];
  assert.equal(findPlayer(roster, '9')?.id, 1);
  assert.equal(findPlayer(roster, '#9 Diego Ruiz')?.id, 1);
  assert.equal(findPlayer(roster, 'diego ruiz')?.id, 1);
  assert.equal(findPlayer(roster, 'Sam Lee'), null, 'two players share the name: ambiguous');
  assert.equal(findPlayer(roster, '#4 Sam Lee')?.id, 2);
  assert.equal(findPlayer(roster, 'what a strike'), null);
});

test('normalizeTournamentInput', () => {
  const { values, errors } = normalizeTournamentInput({ name: ' Summer Cup ', teamLimit: 8, youth: true, visibility: 'public' });
  assert.deepEqual(errors, []);
  assert.equal(values.name, 'Summer Cup');
  assert.equal(values.visibility, 'unlisted', 'youth tournaments are never listed');
  assert.equal(values.halfLength, 45);
  assert.ok(normalizeTournamentInput({ name: '' }).errors.length);
  assert.ok(normalizeTournamentInput({ name: 'x', teamLimit: 1 }).errors.length);
  assert.deepEqual(Object.keys(normalizeTournamentInput({ venue: 'Park' }, { partial: true }).values), ['venue']);
});

test('shuffle is a permutation', () => {
  let i = 0;
  const fixed = () => [0.9, 0.1, 0.5, 0.3][i++ % 4];
  const out = shuffle([1, 2, 3, 4, 5], fixed);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});
