'use client';

import Link from 'next/link';
import type { Match, WorldMatch } from '@/lib/api';
import { statusLabel } from '@/lib/clock';
import { useNow } from '@/lib/useNow';
import { worldStatus } from '../WorldMatchRow';
import FlipNumber from '../FlipNumber';

const MOTTO = ['En las buenas y en las malas', 'For the fans, by the fans', 'Hinchas'];

/** Stadium-board ticker: live and recent scores, or the motto on a quiet day. */
export default function ScoreTicker({ matches, world = [] }: { matches: Match[]; world?: WorldMatch[] }) {
  const live = matches.some(m => m.status === 'live');
  const now = useNow(live, 15_000);
  // Grassroots games first (they're ours), then live pro and international games.
  const hasScores = matches.length > 0 || world.length > 0;
  const items = hasScores
    ? [
      ...matches.map(m => (
        <Link key={m.id} href={`/m/${m.id}`} className={`ticker-item${m.status === 'live' ? ' live' : ''}`}>
          {m.status === 'live' && <i aria-hidden="true" />}
          <b>{statusLabel(m, now)}</b> {m.home.name} <strong><FlipNumber value={m.homeScore} />–<FlipNumber value={m.awayScore} /></strong> {m.away.name}
        </Link>
      )),
      ...world.map(m => (
        <Link key={`w${m.id}`} href="/scores" className={`ticker-item${m.state === 'in' ? ' live' : ''}`}>
          {m.state === 'in' && <i aria-hidden="true" />}
          <b>{worldStatus(m)}</b> {m.home.short} <strong>{m.home.score ?? ''}–{m.away.score ?? ''}</strong> {m.away.short}
        </Link>
      ))
    ]
    : MOTTO.map(text => <span key={text} className="ticker-item">{text}</span>);
  // The track holds the items twice so the loop is seamless.
  return (
    <div className="ticker" aria-label={hasScores ? 'Scores' : undefined} aria-hidden={hasScores ? undefined : true}>
      <div className="ticker-track" style={{ animationDuration: `${Math.max(20, items.length * 7)}s` }}>
        <div className="ticker-set">{items}</div>
        <div className="ticker-set" aria-hidden="true">{items}</div>
      </div>
    </div>
  );
}
