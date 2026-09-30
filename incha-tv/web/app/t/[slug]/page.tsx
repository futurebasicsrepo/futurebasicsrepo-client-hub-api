'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, type TeamPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import MatchCard from '@/components/MatchCard';
import FollowButton from '@/components/FollowButton';
import Squad from '@/components/Squad';

export default function TeamPageView() {
  const { slug } = useParams<{ slug: string }>();
  const { user, ready } = useAuth();
  const [data, setData] = useState<TeamPage | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!ready) return;
    api<TeamPage>(`/v1/teams/${encodeURIComponent(slug)}`).then(setData).catch(() => setMissing(true));
  }, [slug, ready, user]);

  if (missing) return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">Team not found</div><Link href="/matches" className="btn">Browse matches</Link></div></div>;
  if (!data) return <div className="wrap"><div className="skeleton" style={{ height: 160, marginTop: 40 }} /></div>;
  const { team, record, matches } = data;
  return (
    <div className="wrap">
      <section className="hero">
        <span className="mono muted">Team{team.youth ? ' · Youth' : ''}</span>
        <h1 className="display">{team.name}</h1>
        <div style={{ marginTop: 12 }}>
          <FollowButton path={`/v1/teams/${team.slug}/follow`} following={data.following} onChange={following => setData(d => (d ? { ...d, following } : d))} label="Follow team" />
        </div>
        <div className="stats" style={{ marginTop: 16 }}>
          {([['P', record.played], ['W', record.won], ['D', record.drawn], ['L', record.lost], ['GD', record.goalsFor - record.goalsAgainst]] as const).map(([k, v]) => (
            <div key={k}><strong>{k === 'GD' && v > 0 ? `+${v}` : v}</strong><span className="mono muted">{k}</span></div>
          ))}
        </div>
      </section>
      <Squad data={data} onChange={setData} />
      <h2 className="display" style={{ fontSize: 28, margin: '24px 0 12px' }}>Matches</h2>
      {matches.length ? <div className="match-grid" style={{ paddingBottom: 48 }}>{matches.map(m => <MatchCard key={m.id} match={m} />)}</div>
        : <div className="empty"><p>No public matches yet.</p></div>}
    </div>
  );
}
