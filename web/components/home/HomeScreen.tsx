'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Match } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import ScoreTicker from './ScoreTicker';
import FandomRings from './FandomRings';
import MatchRail from './MatchRail';
import MomentGrid from './MomentGrid';

type MatchList = { matches: Match[] };

export default function HomeScreen() {
  const { user, ready } = useAuth();
  const [live, setLive] = useState<Match[] | null>(null);
  const [upcoming, setUpcoming] = useState<Match[]>([]);
  const [recent, setRecent] = useState<Match[]>([]);

  useEffect(() => {
    const load = () => Promise.all([
      api<MatchList>('/v1/matches?filter=live').then(d => d.matches, () => []),
      api<MatchList>('/v1/matches?filter=upcoming').then(d => d.matches, () => []),
      api<MatchList>('/v1/matches?filter=recent').then(d => d.matches, () => [])
    ]).then(([l, u, r]) => { setLive(l); setUpcoming(u.slice(0, 6)); setRecent(r.slice(0, 8)); });
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <ScoreTicker matches={[...(live ?? []), ...recent]} />
      <div className="wrap home">
        <FandomRings />
        {ready && !user && (
          <section className="join-card">
            <div>
              <div className="display">For the fans. <span className="flare">By the fans.</span></div>
              <p>Post your moments, follow your team’s games live, and go live from the sideline.</p>
            </div>
            <div className="row">
              <Link href="/signup" className="btn btn-primary btn-sm">Join incha.tv</Link>
              <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
            </div>
          </section>
        )}
        <MatchRail live={live} upcoming={upcoming} />
        <MomentGrid />
      </div>
    </>
  );
}
