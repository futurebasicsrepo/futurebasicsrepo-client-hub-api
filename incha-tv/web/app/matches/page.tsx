'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Match } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import MatchCard from '@/components/MatchCard';

type Tab = 'live' | 'upcoming' | 'recent' | 'mine';
const LABELS: Record<Tab, string> = { live: 'Live', upcoming: 'Upcoming', recent: 'Results', mine: 'My matches' };

export default function MatchesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('live');
  const [matches, setMatches] = useState<Match[] | null>(null);

  useEffect(() => {
    setMatches(null);
    const path = tab === 'mine' ? '/v1/me/matches' : `/v1/matches?filter=${tab}`;
    api<{ matches: Match[] }>(path).then(d => setMatches(d.matches)).catch(() => setMatches([]));
  }, [tab]);

  const tabs: Tab[] = user ? ['live', 'upcoming', 'recent', 'mine'] : ['live', 'upcoming', 'recent'];
  return (
    <div className="wrap">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <h1 className="display page-title">Matches</h1>
        <div className="spacer" />
        <Link href={user ? '/matches/new' : '/login?next=/matches/new'} className="btn btn-primary" style={{ marginBottom: 12 }}>+ Start a match</Link>
      </div>
      <p className="muted">Sunday league, youth tournaments, pickup, street football. If you’re at the game, you can run the scoreboard.</p>
      <div className="tabs" role="group" aria-label="Filter" style={{ margin: '20px 0' }}>
        {tabs.map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{LABELS[t]}</button>)}
      </div>
      {!matches && <div className="match-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>}
      {matches?.length === 0 && (
        <div className="empty">
          <div className="display">{tab === 'live' ? 'No games on right now' : 'Nothing here yet'}</div>
          <p>At a game? Start the scoreboard and everyone following gets it live.</p>
          <Link href={user ? '/matches/new' : '/login?next=/matches/new'} className="btn btn-primary">Start a match</Link>
        </div>
      )}
      {matches && matches.length > 0 && <div className="match-grid">{matches.map(m => <MatchCard key={m.id} match={m} />)}</div>}
    </div>
  );
}
