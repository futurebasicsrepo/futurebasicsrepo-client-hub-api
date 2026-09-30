import test from 'node:test';
import assert from 'node:assert/strict';
import { bracketSize, buildBracket, matchWinner, nextSlot, roundName, seedOrder } from '../src/bracket.js';

test('bracket size is the next power of two', () => {
  assert.deepEqual([2, 3, 4, 5, 8, 9, 16, 17].map(bracketSize), [2, 4, 4, 8, 8, 16, 16, 32]);
});

test('standard seeding keeps top seeds apart', () => {
  assert.deepEqual(seedOrder(2), [1, 2]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  // Every first-round pair sums to size + 1.
  const order = seedOrder(32);
  for (let i = 0; i < 32; i += 2) assert.equal(order[i] + order[i + 1], 33);
});

test('winners move to the next slot, even slots on the home side', () => {
  assert.deepEqual(nextSlot(1, 0), { round: 2, slot: 0, side: 'home' });
  assert.deepEqual(nextSlot(1, 3), { round: 2, slot: 1, side: 'away' });
  assert.deepEqual(nextSlot(2, 2), { round: 3, slot: 1, side: 'home' });
});

test('round names count back from the final', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(r => roundName(r, 5)), ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']);
  assert.equal(roundName(1, 1), 'Final');
});

test('five teams: three byes for the top seeds, straight into round two', () => {
  const { size, rounds, slots } = buildBracket(['A', 'B', 'C', 'D', 'E']);
  assert.equal(size, 8);
  assert.equal(rounds, 3);
  assert.equal(slots.length, 7);
  const r1 = slots.filter(s => s.round === 1);
  assert.deepEqual(r1.map(s => [s.home, s.away, s.bye]), [['A', null, true], ['D', 'E', false], ['B', null, true], ['C', null, true]]);
  const r2 = slots.filter(s => s.round === 2);
  assert.deepEqual(r2.map(s => [s.home, s.away]), [['A', null], ['B', 'C']]);
  // No bye ever faces a bye.
  for (let n = 2; n <= 64; n++) {
    const first = buildBracket(Array.from({ length: n }, (_, i) => i + 1)).slots.filter(s => s.round === 1);
    assert.ok(first.every(s => s.home || s.away), `n=${n}`);
    assert.equal(first.filter(s => s.bye).length, bracketSize(n) - n, `n=${n}`);
  }
});

test('bracket limits and match winners', () => {
  assert.throws(() => buildBracket(['A']));
  assert.throws(() => buildBracket(Array.from({ length: 65 }, (_, i) => i)));
  assert.equal(buildBracket(['A', 'B']).slots.length, 1);
  assert.equal(matchWinner({ period: 'ft', homeScore: 2, awayScore: 1 }), 'home');
  assert.equal(matchWinner({ period: 'ft', homeScore: 0, awayScore: 3 }), 'away');
  assert.equal(matchWinner({ period: 'ft', homeScore: 1, awayScore: 1 }), null);
  assert.equal(matchWinner({ period: '2h', homeScore: 2, awayScore: 1 }), null);
});
