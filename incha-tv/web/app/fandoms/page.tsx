'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Fandom } from '@/lib/api';

export default function FandomsPage() {
  const [fandoms, setFandoms] = useState<Fandom[] | null>(null);
  useEffect(() => { api<{ fandoms: Fandom[] }>('/v1/fandoms').then(d => setFandoms(d.fandoms)).catch(() => setFandoms([])); }, []);
  return (
    <div className="wrap">
      <h1 className="display page-title">Fandoms</h1>
      <p className="muted">Pick your people. Any post can start a new fandom — just name it in the Studio.</p>
      <div className="fandom-grid">
        {!fandoms && Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}
        {fandoms?.map(f => (
          <Link key={f.slug} href={`/f/${f.slug}`} className="fandom-tile">
            <span className="display">{f.name}</span>
            <span className="mono muted">{f.postCount} posts</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
