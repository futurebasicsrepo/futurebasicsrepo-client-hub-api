'use client';

import { ViewTransition } from 'react';
import Link from 'next/link';
import FlipNumber from './FlipNumber';
import { handOffMatch } from '@/lib/handoff';
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
    <ViewTransition name={`match-${match.id}`} share="morph" default="none">
    <Link href={`/m/${match.id}`} className="match-card" onClick={() => handOffMatch(match)}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono muted">{match.competition || 'Friendly'}</span>
        <StatusPill match={match} now={now} />
      </div>
      {(['home', 'away'] as const).map(side => (
        <div key={side} className={`match-card-team${match.period === 'ft' && lead && lead !== side ? ' dim' : ''}`}>
          <span>{match[side].name}</span>
          {showScore && <strong><FlipNumber value={side === 'home' ? match.homeScore : match.awayScore} /></strong>}
        </div>
      ))}
      {(match.venue || !!match.liveStreams || match.role) && (
        <div className="row" style={{ gap: 8 }}>
          {match.role && <span className="badge sky">{match.role === 'scorekeeper' ? 'You keep score' : 'Co-keeper'}</span>}
          {!!match.liveStreams && <span className="badge flare">📹 Live video</span>}
          {match.venue && <span className="muted" style={{ fontSize: 13 }}>{match.venue}</span>}
        </div>
      )}
    </Link>
    </ViewTransition>
  );
}
