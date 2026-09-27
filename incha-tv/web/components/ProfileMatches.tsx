'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Match } from '@/lib/api';
import MatchCard from './MatchCard';
import AlertsToggle from './AlertsToggle';

type Mine = { matches: Match[]; following: Match[] };
type Follows = { teams: { slug: string; name: string }[] };

/** Matches tab: on your own profile, what you run and follow; on someone else's, the games they kept score for. */
export default function ProfileMatches({ handle, isMe }: { handle: string; isMe: boolean }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [teams, setTeams] = useState<Follows['teams']>([]);
  const [record, setRecord] = useState<Match[] | null>(null);

  useEffect(() => {
    if (isMe) {
      api<Mine>('/v1/me/matches').then(setMine).catch(() => setMine({ matches: [], following: [] }));
      api<Follows>('/v1/me/follows').then(d => setTeams(d.teams)).catch(() => {});
    } else {
      api<{ matches: Match[] }>(`/v1/users/${encodeURIComponent(handle)}/matches`).then(d => setRecord(d.matches)).catch(() => setRecord([]));
    }
  }, [handle, isMe]);

  const grid = (matches: Match[]) => <div className="match-grid">{matches.map(m => <MatchCard key={m.id} match={m} />)}</div>;
  const loading = <div className="match-grid">{Array.from({ length: 2 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>;

  if (!isMe) {
    return (
      <section className="stack" style={{ gap: 16 }}>
        <p className="muted" style={{ margin: 0 }}>Public matches @{handle} kept score for.</p>
        {!record ? loading : record.length ? grid(record) : <div className="empty"><p>No public matches yet.</p></div>}
      </section>
    );
  }

  const live = mine?.matches.filter(m => m.status === 'live') ?? [];
  return (
    <section className="stack" style={{ gap: 28 }}>
      <AlertsToggle />
      <div className="stack" style={{ gap: 12 }}>
        <div className="row">
          <h2 className="display tab-heading">You’re keeping score</h2>
          <div className="spacer" />
          <Link href="/matches/new" className="btn btn-primary btn-sm">+ Start a match</Link>
        </div>
        {live.length > 0 && <p className="hint" style={{ margin: 0 }}>{live.length} of your matches {live.length === 1 ? 'is' : 'are'} live now. Tap to open the scoreboard.</p>}
        {!mine ? loading : mine.matches.length ? grid(mine.matches) : (
          <div className="empty"><p>At a game this weekend? Start the scoreboard and everyone following gets it live.</p></div>
        )}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <h2 className="display tab-heading">Following</h2>
        {teams.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            {teams.map(t => <Link key={t.slug} href={`/t/${t.slug}`} className="chip">🔔 {t.name}</Link>)}
          </div>
        )}
        {!mine ? loading : mine.following.length ? grid(mine.following) : (
          <p className="muted" style={{ margin: 0 }}>{teams.length ? 'No followed matches yet.' : 'Follow a team or match with 🔔 to get goal alerts.'} <Link href="/matches" className="linkish">Browse matches</Link></p>
        )}
      </div>
    </section>
  );
}
