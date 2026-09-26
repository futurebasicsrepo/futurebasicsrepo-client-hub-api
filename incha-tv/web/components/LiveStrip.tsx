'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Match } from '@/lib/api';
import MatchCard from './MatchCard';

/** "Live now" row on the home page; renders nothing when no public match is in play. */
export default function LiveStrip() {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    const load = () => api<{ matches: Match[] }>('/v1/matches?filter=live').then(d => setMatches(d.matches)).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!matches.length) return null;
  return (
    <section style={{ paddingTop: 24 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="status-pill live"><i />Live now</span>
        <div className="spacer" />
        <Link href="/matches" className="linkish">All matches →</Link>
      </div>
      <div className="match-strip">{matches.map(m => <MatchCard key={m.id} match={m} />)}</div>
    </section>
  );
}
