'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, type Match } from '@/lib/api';
import MatchCard from '@/components/MatchCard';

interface TeamPage { team: { name: string; slug: string }; record: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number }; matches: Match[] }

export default function TeamPageView() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<TeamPage | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api<TeamPage>(`/v1/teams/${encodeURIComponent(slug)}`).then(setData).catch(() => setMissing(true)); }, [slug]);

  if (missing) return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">Team not found</div><Link href="/matches" className="btn">Browse matches</Link></div></div>;
  if (!data) return <div className="wrap"><div className="skeleton" style={{ height: 160, marginTop: 40 }} /></div>;
  const { team, record, matches } = data;
  return (
    <div className="wrap">
      <section className="hero">
        <span className="mono muted">Team</span>
        <h1 className="display">{team.name}</h1>
        <div className="stats" style={{ marginTop: 16 }}>
          {([['P', record.played], ['W', record.won], ['D', record.drawn], ['L', record.lost], ['GD', record.goalsFor - record.goalsAgainst]] as const).map(([k, v]) => (
            <div key={k}><strong>{k === 'GD' && v > 0 ? `+${v}` : v}</strong><span className="mono muted">{k}</span></div>
          ))}
        </div>
      </section>
      <h2 className="display" style={{ fontSize: 28, margin: '24px 0 12px' }}>Matches</h2>
      {matches.length ? <div className="match-grid" style={{ paddingBottom: 48 }}>{matches.map(m => <MatchCard key={m.id} match={m} />)}</div>
        : <div className="empty"><p>No public matches yet.</p></div>}
    </div>
  );
}
