'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Tournament } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import MatchesSwitch from '@/components/MatchesSwitch';
import TournamentCard from '@/components/TournamentCard';

type Tab = 'all' | 'mine';

export default function TournamentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [list, setList] = useState<Tournament[] | null>(null);

  useEffect(() => {
    setList(null);
    api<{ tournaments: Tournament[] }>(tab === 'mine' ? '/v1/tournaments?mine=1' : '/v1/tournaments')
      .then(d => setList(d.tournaments)).catch(() => setList([]));
  }, [tab]);

  const createHref = user ? '/tournaments/new' : '/login?next=/tournaments/new';
  return (
    <div className="wrap">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <h1 className="display page-title">Tournaments</h1>
        <div className="spacer" />
        <Link href={createHref} className="btn btn-primary" style={{ marginBottom: 12 }}>+ Run a tournament</Link>
      </div>
      <MatchesSwitch active="tournaments" />
      <p className="muted">Open registration, let teams sign up with their rosters, then draw the bracket. Every game is scored live and winners move on at full time.</p>
      {user && (
        <div className="tabs" role="group" aria-label="Filter" style={{ margin: '20px 0' }}>
          <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All</button>
          <button aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>Mine</button>
        </div>
      )}
      {!list && <div className="tournament-list" style={{ marginTop: 20 }}>{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 130 }} />)}</div>}
      {list?.length === 0 && (
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="display">{tab === 'mine' ? 'None yet' : 'No tournaments yet'}</div>
          <p>Running a cup, a summer league final day, or a youth weekend? Set it up here.</p>
          <Link href={createHref} className="btn btn-primary">Run a tournament</Link>
        </div>
      )}
      {list && list.length > 0 && <div className="tournament-list" style={{ margin: '20px 0 48px' }}>{list.map(t => <TournamentCard key={t.id} tournament={t} />)}</div>}
    </div>
  );
}
