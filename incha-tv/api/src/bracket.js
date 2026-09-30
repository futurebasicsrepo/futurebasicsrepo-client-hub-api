// Pure rules for rosters and knockout tournaments (no database here; see tournaments.js).

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export const MAX_PLAYERS = 40;

// One roster entry: a name, an optional shirt number (0–99) and an optional position.
export function normalizePlayer(body = {}) {
  const name = clean(body.name, 60);
  if (!name) return { error: 'Enter the player’s name.' };
  let number = null;
  if (body.number !== undefined && body.number !== null && body.number !== '') {
    number = Number(body.number);
    if (!Number.isInteger(number) || number < 0 || number > 99) return { error: 'Shirt numbers are 0–99.' };
  }
  return { player: { name, number, position: clean(body.position, 20) } };
}

// A roster sent in one go (at registration). Blank rows are skipped; duplicate numbers are refused.
export function normalizeRoster(list) {
  if (list === undefined || list === null) return { players: [] };
  if (!Array.isArray(list)) return { error: 'Players must be a list.' };
  const players = [];
  for (const row of list) {
    if (!clean(row?.name, 60) && (row?.number === undefined || row?.number === null || row?.number === '')) continue;
    const { error, player } = normalizePlayer(row);
    if (error) return { error };
    players.push(player);
  }
  if (players.length > MAX_PLAYERS) return { error: `A roster can have up to ${MAX_PLAYERS} players.` };
  const numbers = players.map(p => p.number).filter(n => n !== null);
  if (new Set(numbers).size !== numbers.length) return { error: 'Two players have the same shirt number.' };
  return { players };
}

export const playerLabel = p => (p.number === null || p.number === undefined ? p.name : `#${p.number} ${p.name}`);

// Match what a scorekeeper typed ("9", "#9", "#9 Diego", "diego") to one player on the roster.
export function findPlayer(roster, typed) {
  const text = clean(typed, 60).toLowerCase();
  if (!text || !roster.length) return null;
  const num = /^#?(\d{1,2})(?:\s+(.*))?$/.exec(text);
  if (num) {
    const byNumber = roster.filter(p => p.number === Number(num[1]));
    if (byNumber.length === 1) return byNumber[0];
  }
  const exact = roster.filter(p => p.name.toLowerCase() === text || playerLabel(p).toLowerCase() === text);
  return exact.length === 1 ? exact[0] : null;
}

export function normalizeTournamentInput(body = {}, { partial = false } = {}) {
  const errors = [];
  const values = {};
  const has = key => !partial || key in body;
  if (has('name')) {
    values.name = clean(body.name, 80);
    if (!values.name) errors.push('Give the tournament a name.');
  }
  if (has('description')) values.description = String(body.description ?? '').trim().slice(0, 2000);
  if (has('venue')) values.venue = clean(body.venue, 120);
  if (has('startsAt')) {
    values.startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    if (Number.isNaN(values.startsAt.getTime())) errors.push('Start time is not a valid date.');
  }
  if (has('halfLength')) {
    values.halfLength = body.halfLength === undefined || body.halfLength === null || body.halfLength === '' ? 45 : Number(body.halfLength);
    if (!Number.isInteger(values.halfLength) || values.halfLength < 5 || values.halfLength > 60) errors.push('Half length must be 5–60 minutes.');
  }
  if (has('teamLimit')) {
    values.teamLimit = body.teamLimit === undefined || body.teamLimit === null || body.teamLimit === '' ? 16 : Number(body.teamLimit);
    if (!Number.isInteger(values.teamLimit) || values.teamLimit < 2 || values.teamLimit > 64) errors.push('A tournament takes 2–64 teams.');
  }
  if (!partial) {
    values.youth = Boolean(body.youth);
    values.visibility = values.youth ? 'unlisted' : body.visibility === 'unlisted' ? 'unlisted' : 'public';
  } else if ('visibility' in body) {
    values.visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  }
  return { values, errors };
}

export const bracketSize = teams => {
  let size = 2;
  while (size < teams) size *= 2;
  return size;
};

// Where each seed sits in round one, so the top seeds meet as late as possible:
// size 8 → [1, 8, 4, 5, 2, 7, 3, 6] (1 v 8, 4 v 5, 2 v 7, 3 v 6).
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap(seed => [seed, n + 1 - seed]);
  }
  return order;
}

export const roundCount = size => Math.log2(size);

export function roundName(round, rounds) {
  const left = rounds - round; // 0 = final
  if (left === 0) return 'Final';
  if (left === 1) return 'Semi-finals';
  if (left === 2) return 'Quarter-finals';
  return `Round of ${2 ** (left + 1)}`;
}

// Every fixture of the bracket for seeded team ids (index 0 = seed 1). Empty slots are byes:
// with fewer teams than the bracket holds, the top seeds go straight through to round two.
export function buildBracket(teamIds) {
  if (teamIds.length < 2) throw new Error('A bracket needs at least two teams.');
  const size = bracketSize(teamIds.length);
  const rounds = roundCount(size);
  const order = seedOrder(size);
  const fixtures = [];
  for (let position = 0; position < size / 2; position++) {
    const home = teamIds[order[position * 2] - 1] ?? null;
    const away = teamIds[order[position * 2 + 1] - 1] ?? null;
    const bye = home === null || away === null;
    fixtures.push({ round: 1, position, home, away, bye, winner: bye ? (home ?? away) : null });
  }
  for (let round = 2; round <= rounds; round++) {
    for (let position = 0; position < size / 2 ** round; position++) {
      fixtures.push({ round, position, home: null, away: null, bye: false, winner: null });
    }
  }
  // Byes go through at once.
  for (const f of fixtures.filter(x => x.round === 1 && x.bye)) {
    const slot = nextSlot(f, rounds);
    const next = fixtures.find(x => x.round === slot.round && x.position === slot.position);
    next[slot.side] = f.winner;
  }
  return { size, rounds, fixtures };
}

// The fixture (and side) a fixture's winner moves on to; null after the final.
export function nextSlot({ round, position }, rounds) {
  if (round >= rounds) return null;
  return { round: round + 1, position: Math.floor(position / 2), side: position % 2 === 0 ? 'home' : 'away' };
}

// The winner by the score, or null for a draw (the organizer settles it: penalties, a coin toss).
export function winnerByScore({ homeScore, awayScore, homeTeamId, awayTeamId }) {
  if (homeScore > awayScore) return homeTeamId;
  if (awayScore > homeScore) return awayTeamId;
  return null;
}

// Fisher–Yates with an injectable random source (tests pass a fixed one).
export function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
