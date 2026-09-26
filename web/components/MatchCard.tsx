'use client';

import Link from 'next/link';
import type { Match } from '@/lib/api';
import { statusLabel } from '@/lib/clock';
import { useNow } from '@/lib/useNow';

export function StatusPill({ match, now }: { match: Match; now: number }) {
  const live = match.status === 'live';
  return <span className={`status-pill${live ? ' live' : ''}${match.period === 'ft' ? ' ft' : ''}`}>{live && <i />}{statusLabel(match, now)}</span>;
}

export default function MatchCard({ match }: { match: Match }) {
  const now = useNow(match.status === 'live', 15_000);
  const showScore = match.period !== 'pre';
  const lead = match.homeScore === match.awayScore ? null : match.homeScore > match.awayScore ? 'home' : 'away';
  return (
    <Link href={`/m/${match.id}`} className="match-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono muted">{match.competition || 'Friendly'}</span>
        <StatusPill match={match} now={now} />
      </div>
      {(['home', 'away'] as const).map(side => (
        <div key={side} className={`match-card-team${match.period === 'ft' && lead && lead !== side ? ' dim' : ''}`}>
          <span>{match[side].name}</span>
          {showScore && <strong>{side === 'home' ? match.homeScore : match.awayScore}</strong>}
        </div>
      ))}
      {(match.venue || !!match.liveStreams) && (
        <div className="row" style={{ gap: 8 }}>
          {!!match.liveStreams && <span className="badge flare">📹 Live video</span>}
          {match.venue && <span className="muted" style={{ fontSize: 13 }}>{match.venue}</span>}
        </div>
      )}
    </Link>
  );
}
