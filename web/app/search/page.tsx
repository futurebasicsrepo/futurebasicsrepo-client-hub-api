'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Fandom } from '@/lib/api';

export default function SearchPage() {
  const router = useRouter();
  const [fandoms, setFandoms] = useState<Fandom[]>([]);
  useEffect(() => { api<{ fandoms: Fandom[] }>('/v1/fandoms').then(d => setFandoms(d.fandoms)).catch(() => {}); }, []);
  return (
    <div className="wrap search-page">
      <form
        role="search"
        onSubmit={event => {
          event.preventDefault();
          const q = new FormData(event.currentTarget).get('q')?.toString().trim();
          if (q) router.push(`/?q=${encodeURIComponent(q)}`);
        }}
      >
        <input name="q" type="search" className="input" placeholder="Search clips, goals, tifos…" aria-label="Search" autoFocus enterKeyHint="search" />
      </form>
      {fandoms.length > 0 && (
        <section>
          <h2 className="mono muted">Fandoms</h2>
          <div className="search-fandoms">
            {fandoms.map(f => <Link key={f.slug} href={`/f/${f.slug}`} className="chip">{f.name}</Link>)}
          </div>
        </section>
      )}
      <section>
        <h2 className="mono muted">Browse</h2>
        <div className="stack" style={{ gap: 0 }}>
          <Link href="/matches" className="search-link">Matches · live, upcoming and results</Link>
          <Link href="/watch?sort=top" className="search-link">Top moments</Link>
          <Link href="/fandoms" className="search-link">All fandoms</Link>
        </div>
      </section>
    </div>
  );
}
