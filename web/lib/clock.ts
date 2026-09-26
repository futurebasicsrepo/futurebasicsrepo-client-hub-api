import type { Match, MatchSummary } from './api';

// Mirrors the API's match clock so the minute ticks locally between updates.
export function matchClock(match: Pick<Match, 'period' | 'periodStartedAt' | 'halfLength'>, now = Date.now()) {
  if (!match.periodStartedAt || (match.period !== '1h' && match.period !== '2h')) return null;
  const elapsed = Math.max(0, Math.floor((now - new Date(match.periodStartedAt).getTime()) / 60000));
  const base = match.period === '1h' ? 0 : match.halfLength;
  const cap = match.period === '1h' ? match.halfLength : match.halfLength * 2;
  const raw = base + elapsed + 1;
  return raw > cap ? { minute: cap, label: `${cap}+${raw - cap}'` } : { minute: raw, label: `${raw}'` };
}

export function statusLabel(match: Pick<Match, 'period' | 'periodStartedAt' | 'halfLength' | 'kickoffAt'>, now = Date.now()) {
  if (match.period === 'ht') return 'HT';
  if (match.period === 'ft') return 'FT';
  if (match.period === 'pre') {
    const kickoff = new Date(match.kickoffAt);
    const sameDay = kickoff.toDateString() === new Date(now).toDateString();
    const time = kickoff.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `KO ${time}` : `${kickoff.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`;
  }
  return matchClock(match, now)?.label ?? 'LIVE';
}

export const scoreline = (m: Pick<MatchSummary, 'home' | 'away' | 'homeScore' | 'awayScore'>) => `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`;
