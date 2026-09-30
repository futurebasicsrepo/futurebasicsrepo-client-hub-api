'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type TournamentCard } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import MatchesSwitch from '@/components/MatchesSwitch';
import { cupDate, money } from '@/components/TournamentView';

type Tab = 'open' | 'running' | 'finished' | 'mine';
const LABELS: Record<Tab, string> = { open: 'Open to enter', running: 'In progress', finished: 'Finished', mine: 'Mine' };

export default function TournamentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [list, setList] = useState<TournamentCard[] | null>(null);

  useEffect(() => {
    setList(null);
    api<{ tournaments: TournamentCard[] }>(`/v1/tournaments?filter=${tab}`).then(d => setList(d.tournaments)).catch(() => setList([]));
  }, [tab]);

  const tabs: Tab[] = user ? ['open', 'running', 'finished', 'mine'] : ['open', 'running', 'finished'];
  const create = user ? '/tournaments/new' : '/login?next=/tournaments/new';
  return (
    <div className="wrap">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <h1 className="display page-title">Tournaments</h1>
        <div className="spacer" />
        <Link href={create} className="btn btn-primary" style={{ marginBottom: 12 }}>+ Run a tournament</Link>
      </div>
      <MatchesSwitch active="tournaments" />
      <p className="muted">Knockout cups for leagues, schools and summer sevens. Teams sign up, the organizer draws the bracket, and every tie is a live match.</p>
      <div className="tabs" role="group" aria-label="Filter" style={{ margin: '20px 0' }}>
        {tabs.map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{LABELS[t]}</button>)}
      </div>
      {!list && <div className="match-grid">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}</div>}
      {list?.length === 0 && (
        <div className="empty">
          <div className="display">{tab === 'open' ? 'No open sign-ups' : 'Nothing here yet'}</div>
          <p>Running a cup? Open registration and share the link with the teams.</p>
          <Link href={create} className="btn btn-primary">Run a tournament</Link>
        </div>
      )}
      {list && list.length > 0 && (
        <div className="match-grid" style={{ paddingBottom: 48 }}>
          {list.map(t => (
            <Link key={t.id} href={`/tournaments/${t.id}`} className="match-card cup-card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="mono muted">{cupDate(t.startsAt)}</span>
                <span className={`badge${t.status === 'running' ? ' flare' : t.status === 'registration' ? ' sky' : ''}`}>
                  {t.status === 'registration' ? 'Sign-ups open' : t.status === 'running' ? 'In progress' : 'Finished'}
                </span>
              </div>
              <strong className="cup-card-name">{t.name}</strong>
              {t.champion ? <span>🏆 {t.champion.name}</span> : (
                <div className="cup-fill" aria-label={`${t.approved} of ${t.capacity} teams`}>
                  <i style={{ width: `${Math.min(100, (t.approved / t.capacity) * 100)}%` }} />
                </div>
              )}
              <span className="muted" style={{ fontSize: 13 }}>{t.approved}/{t.capacity} teams{t.entryFeeCents ? ` · ${money(t.entryFeeCents, t.currency)} entry` : ''}{t.venue ? ` · ${t.venue}` : ''} · by @{t.organizer.handle}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
