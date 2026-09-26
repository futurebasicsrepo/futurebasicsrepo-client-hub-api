import type { WorldMatch } from '@/lib/api';

const kickoff = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function worldStatus(match: WorldMatch) {
  if (match.state === 'pre') return kickoff(match.kickoffAt);
  if (match.state === 'off') return match.detail === 'Postponed' ? 'PPD' : (match.detail || 'Off');
  return match.detail || (match.state === 'post' ? 'FT' : 'LIVE');
}

/** One pro/international fixture: status on the left, two team lines with scores. */
export default function WorldMatchRow({ match, showLeague = false }: { match: WorldMatch; showLeague?: boolean }) {
  const done = match.state === 'post';
  const side = (s: 'home' | 'away') => {
    const team = match[s];
    const other = match[s === 'home' ? 'away' : 'home'];
    const lost = done && other.winner && !team.winner;
    return (
      <div className={`wm-team${team.winner ? ' win' : ''}${lost ? ' lose' : ''}`}>
        <span className="wm-name">{team.name}</span>
        <span className="wm-score">{team.score ?? ''}</span>
      </div>
    );
  };
  return (
    <div className={`wm-row ${match.state}`}>
      <span className="wm-status">{match.state === 'in' && <i aria-hidden="true" />}{worldStatus(match)}</span>
      <div className="wm-teams">
        {showLeague && <span className="wm-league">{match.league.name}</span>}
        {side('home')}
        {side('away')}
      </div>
    </div>
  );
}
