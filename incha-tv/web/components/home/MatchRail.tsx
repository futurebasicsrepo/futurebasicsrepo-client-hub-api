'use client';

import { ViewTransition } from 'react';
import Link from 'next/link';
import FlipNumber from '../FlipNumber';
import { handOffMatch } from '@/lib/handoff';
import type { Match } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { StatusPill } from '../MatchCard';

/** Swipeable matchday cards: live games first, then what's kicking off next. */
export default function MatchRail({ live, upcoming }: { live: Match[] | null; upcoming: Match[] }) {
  const now = useNow(!!live?.length, 15_000);
  const cards = [...(live ?? []), ...upcoming].slice(0, 10);
  return (
    <section className="home-section">
      <div className="section-head">
        <h2 className="display">{live?.length ? <><span className="live-dot" aria-hidden="true" />Live now</> : 'Matchday'}</h2>
        <Link href="/matches" className="linkish">All matches</Link>
      </div>
      <div className="rail">
        {live === null && Array.from({ length: 2 }, (_, i) => <div key={i} className="mcard skeleton" />)}
        {cards.map(m => {
          const lead = m.homeScore === m.awayScore ? null : m.homeScore > m.awayScore ? 'home' : 'away';
          return (
            <ViewTransition key={m.id} name={`match-${m.id}`} share="morph" default="none">
            <Link href={`/m/${m.id}`} className={`mcard ${m.status}`} onClick={() => handOffMatch(m)}>
              <div className="mcard-top">
                <span className="mono">{m.competition || 'Friendly'}</span>
                <StatusPill match={m} now={now} />
              </div>
              <div className="mcard-teams">
                {(['home', 'away'] as const).map(side => (
                  <div key={side} className={`mcard-team${lead && lead !== side ? ' dim' : ''}`}>
                    <span>{m[side].name}</span>
                    {m.period !== 'pre' && <strong><FlipNumber value={side === 'home' ? m.homeScore : m.awayScore} /></strong>}
                  </div>
                ))}
              </div>
              <div className="mcard-foot">
                {m.liveStreams ? <span className="mcard-cam"><i />Watch live{m.liveStreams > 1 ? ` · ${m.liveStreams} cams` : ''}</span>
                  : <span className="muted">{m.venue || (m.status === 'live' ? 'Live score from the sideline' : 'Follow along live')}</span>}
              </div>
            </Link>
            </ViewTransition>
          );
        })}
        {live !== null && (
          <Link href="/matches/new" className="mcard mcard-start">
            <span className="display">{cards.length ? 'Your game next?' : 'No games on right now'}</span>
            <span className="muted">Playing today? Start a match. You keep score from the sideline and fans follow live.</span>
            <span className="btn btn-sm btn-primary">Start a match</span>
          </Link>
        )}
      </div>
    </section>
  );
}
