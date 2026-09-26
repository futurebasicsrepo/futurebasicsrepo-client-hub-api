'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Fandom } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const FRESH_MS = 72 * 60 * 60 * 1000;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** Story-style rings: tap a fandom to drop straight into its swipe feed. Lit rings posted in the last 3 days. */
export default function FandomRings() {
  const { user } = useAuth();
  const [fandoms, setFandoms] = useState<Fandom[] | null>(null);
  useEffect(() => {
    api<{ fandoms: Fandom[] }>('/v1/fandoms')
      .then(d => setFandoms(d.fandoms.filter(f => f.postCount).sort((a, b) => Date.parse(b.latestAt || '0') - Date.parse(a.latestAt || '0')).slice(0, 16)))
      .catch(() => setFandoms([]));
  }, []);
  const now = Date.now();
  return (
    <nav className="rings" aria-label="Fandoms">
      {user && (
        <Link href="/upload" className="ring-item">
          <span className="ring ring-add"><span>+</span></span>
          <span className="ring-label">Post</span>
        </Link>
      )}
      {fandoms === null
        ? Array.from({ length: 6 }, (_, i) => <span key={i} className="ring-item"><span className="ring skeleton" /><span className="ring-label">&nbsp;</span></span>)
        : fandoms.map(f => (
          <Link key={f.slug} href={`/watch?fandom=${f.slug}`} className="ring-item">
            <span className={`ring${f.latestAt && now - Date.parse(f.latestAt) < FRESH_MS ? ' fresh' : ''}`}>
              {f.coverUrl ? <img src={f.coverUrl} alt="" loading="lazy" /> : <span className="ring-initials">{initials(f.name)}</span>}
            </span>
            <span className="ring-label">{f.name}</span>
          </Link>
        ))}
      <Link href="/fandoms" className="ring-item">
        <span className="ring ring-more"><span>•••</span></span>
        <span className="ring-label">All</span>
      </Link>
    </nav>
  );
}
