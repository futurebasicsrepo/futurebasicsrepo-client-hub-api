'use client';

import Link from 'next/link';
import type { Match } from '@/lib/api';
import { statusLabel } from '@/lib/clock';
import { useNow } from '@/lib/useNow';

const MOTTO = ['En las buenas y en las malas', 'For the fans, by the fans', 'Hinchas'];

/** Stadium-board ticker: live and recent scores, or the motto on a quiet day. */
export default function ScoreTicker({ matches }: { matches: Match[] }) {
  const live = matches.some(m => m.status === 'live');
  const now = useNow(live, 15_000);
  const items = matches.length
    ? matches.map(m => (
      <Link key={m.id} href={`/m/${m.id}`} className={`ticker-item${m.status === 'live' ? ' live' : ''}`}>
        {m.status === 'live' && <i aria-hidden="true" />}
        <b>{statusLabel(m, now)}</b> {m.home.name} <strong>{m.homeScore}–{m.awayScore}</strong> {m.away.name}
      </Link>
    ))
    : MOTTO.map(text => <span key={text} className="ticker-item">{text}</span>);
  // The track holds the items twice so the loop is seamless.
  return (
    <div className="ticker" aria-label={matches.length ? 'Scores' : undefined} aria-hidden={matches.length ? undefined : true}>
      <div className="ticker-track" style={{ animationDuration: `${Math.max(20, items.length * 7)}s` }}>
        <div className="ticker-set">{items}</div>
        <div className="ticker-set" aria-hidden="true">{items}</div>
      </div>
    </div>
  );
}
