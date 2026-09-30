// Pure knockout-bracket rules: seeding, byes, who plays whom next, and round names.

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 64;

/** Smallest power of two that fits n teams (at least 2). */
export const bracketSize = n => Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, n))));

/** Standard seeding order for a bracket of `size` (1 v 8, 4 v 5, 2 v 7, 3 v 6 …): top seeds meet as late as possible. */
export function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap(seed => [seed, n + 1 - seed]);
  }
  return order;
}

/** Where a slot's winner goes: the next round's slot, and which side of it. */
export const nextSlot = (round, slot) => ({ round: round + 1, slot: slot >> 1, side: slot % 2 === 0 ? 'home' : 'away' });

/** "Final", "Semi-finals", "Quarter-finals", then "Round of 16", "Round of 32"… */
export function roundName(round, rounds) {
  const left = rounds - round; // 0 = final
  if (left === 0) return 'Final';
  if (left === 1) return 'Semi-finals';
  if (left === 2) return 'Quarter-finals';
  return `Round of ${2 ** (left + 1)}`;
}

/**
 * Lays out a single-elimination bracket for teams in seed order (best first).
 * Returns every slot of every round; first-round slots with only one team are byes and already won,
 * and their winners are placed into round two.
 */
export function buildBracket(teams) {
  if (teams.length < MIN_TEAMS) throw new Error(`A bracket needs at least ${MIN_TEAMS} teams.`);
  if (teams.length > MAX_TEAMS) throw new Error(`A bracket holds at most ${MAX_TEAMS} teams.`);
  const size = bracketSize(teams.length);
  const rounds = Math.log2(size);
  const slots = [];
  for (let round = 1; round <= rounds; round++) {
    for (let slot = 0; slot < size / 2 ** round; slot++) slots.push({ round, slot, home: null, away: null, winner: null, bye: false });
  }
  const at = (round, slot) => slots.find(s => s.round === round && s.slot === slot);
  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) {
    const s = at(1, i);
    s.home = teams[order[i * 2] - 1] ?? null;
    s.away = teams[order[i * 2 + 1] - 1] ?? null;
    if (!s.home || !s.away) {
      s.bye = true;
      s.winner = s.home ?? s.away;
      if (rounds > 1) {
        const next = nextSlot(1, i);
        at(next.round, next.slot)[next.side] = s.winner;
      }
    }
  }
  return { size, rounds, slots };
}

/** The side that won a finished match, or null for a draw (the organizer settles those). */
export function matchWinner({ period, homeScore, awayScore }) {
  if (period !== 'ft' || homeScore === awayScore) return null;
  return homeScore > awayScore ? 'home' : 'away';
}
