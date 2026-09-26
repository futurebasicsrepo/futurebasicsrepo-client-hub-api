// Pure match-centre rules: clock, period transitions and event validation.

export const PERIODS = ['pre', '1h', 'ht', '2h', 'ft'];
export const LIVE_PERIODS = ['1h', 'ht', '2h'];
export const SCORING_EVENTS = ['goal', 'yellow', 'red', 'note'];
export const PERIOD_EVENTS = { kickoff: ['pre', '1h'], halftime: ['1h', 'ht'], second_half: ['ht', '2h'], fulltime: [null, 'ft'] };
export const EVENT_TYPES = [...SCORING_EVENTS, ...Object.keys(PERIOD_EVENTS)];

// Minute on the match clock, football style: 1-based, with stoppage time shown as 45+2.
export function matchClock({ period, periodStartedAt, halfLength }, now = Date.now()) {
  if (!periodStartedAt || (period !== '1h' && period !== '2h')) return null;
  const elapsed = Math.max(0, Math.floor((now - new Date(periodStartedAt).getTime()) / 60000));
  const base = period === '1h' ? 0 : halfLength;
  const cap = period === '1h' ? halfLength : halfLength * 2;
  const raw = base + elapsed + 1;
  if (raw > cap) return { minute: cap, stoppage: raw - cap, label: `${cap}+${raw - cap}'` };
  return { minute: raw, stoppage: 0, label: `${raw}'` };
}

export function matchStatus(period) {
  if (period === 'pre') return 'upcoming';
  if (period === 'ft') return 'finished';
  return 'live';
}

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function normalizeMatchInput(body = {}) {
  const errors = [];
  const home = clean(body.home, 60);
  const away = clean(body.away, 60);
  if (!home || !away) errors.push('Enter both team names.');
  else if (home.toLowerCase() === away.toLowerCase()) errors.push('A team can’t play itself.');
  const halfLength = body.halfLength === undefined || body.halfLength === null || body.halfLength === '' ? 45 : Number(body.halfLength);
  if (!Number.isInteger(halfLength) || halfLength < 5 || halfLength > 60) errors.push('Half length must be 5–60 minutes.');
  let kickoffAt = new Date();
  if (body.kickoffAt) {
    kickoffAt = new Date(body.kickoffAt);
    if (Number.isNaN(kickoffAt.getTime())) errors.push('Kick-off time is not a valid date.');
  }
  const youth = Boolean(body.youth);
  const visibility = youth ? 'unlisted' : body.visibility === 'unlisted' ? 'unlisted' : 'public';
  return {
    errors,
    values: { home, away, halfLength, kickoffAt, youth, visibility, venue: clean(body.venue, 120), competition: clean(body.competition, 80) }
  };
}

// Validates a scorekeeper event against the current match state.
// Returns { error } or { event, patch } where patch is the match-row change to apply.
export function applyEvent(match, body = {}, now = Date.now()) {
  const type = String(body.type || '');
  if (!EVENT_TYPES.includes(type)) return { error: 'Unknown event.' };

  if (type in PERIOD_EVENTS) {
    const [from, to] = PERIOD_EVENTS[type];
    if (from ? match.period !== from : match.period === 'pre' || match.period === 'ft') {
      return { error: { kickoff: 'The match has already kicked off.', halftime: 'Half time comes during the first half.', second_half: 'Start the second half from half time.', fulltime: 'The match isn’t in play.' }[type] };
    }
    const clock = matchClock(match, now);
    return {
      event: { type, side: null, player: '', minute: clock?.minute ?? null, stoppage: clock?.stoppage ?? 0 },
      patch: { period: to, periodStartedAt: to === '1h' || to === '2h' ? new Date(now) : match.periodStartedAt }
    };
  }

  if (match.period === 'pre') return { error: 'Kick off first.' };
  const side = type === 'note' ? (body.side ?? null) : body.side;
  if (type !== 'note' && side !== 'home' && side !== 'away') return { error: 'Pick a team.' };
  if (side !== null && side !== 'home' && side !== 'away') return { error: 'Pick a team.' };
  const player = clean(body.player, 60);
  if (type === 'note' && !player) return { error: 'Write the note.' };

  let minute = null, stoppage = 0;
  if (body.minute !== undefined && body.minute !== null && body.minute !== '') {
    minute = Number(body.minute);
    if (!Number.isInteger(minute) || minute < 0 || minute > 200) return { error: 'Minute must be a whole number.' };
  } else {
    const clock = matchClock(match, now);
    if (clock) ({ minute, stoppage } = clock);
    else if (match.period === 'ht') minute = match.halfLength;
  }
  const patch = type === 'goal' ? { [side === 'home' ? 'homeScore' : 'awayScore']: (side === 'home' ? match.homeScore : match.awayScore) + 1 } : {};
  return { event: { type, side, player, minute, stoppage }, patch };
}
