import Link from 'next/link';
import type { WorldScores } from '@/lib/api';
import WorldMatchRow from '../WorldMatchRow';

/** "Around the world": a handful of marquee pro/international games — live first, then what's next. */
export default function WorldStrip({ scores }: { scores: WorldScores | null }) {
  if (!scores) return null;
  const all = scores.leagues.flatMap(l => l.matches);
  const picks = [...all.filter(m => m.state === 'in'), ...all.filter(m => m.state === 'pre'), ...all.filter(m => m.state === 'post')].slice(0, 6);
  if (!picks.length) return null;
  return (
    <section className="home-section">
      <div className="section-head">
        <h2 className="display">Around the world{scores.live > 0 && <span className="world-live-count"><i aria-hidden="true" />{scores.live} live</span>}</h2>
        <Link href="/scores" className="linkish">All scores</Link>
      </div>
      <div className="world-strip">{picks.map(m => <WorldMatchRow key={m.id} match={m} showLeague />)}</div>
    </section>
  );
}
