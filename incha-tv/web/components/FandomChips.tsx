'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Fandom } from '@/lib/api';

export default function FandomChips({ active }: { active?: string }) {
  const [fandoms, setFandoms] = useState<Fandom[]>([]);
  useEffect(() => { api<{ fandoms: Fandom[] }>('/v1/fandoms').then(d => setFandoms(d.fandoms.slice(0, 16))).catch(() => {}); }, []);
  if (!fandoms.length) return null;
  return (
    <nav className="chips" aria-label="Fandoms" style={{ paddingTop: 20 }}>
      <Link href="/" className={`chip${!active ? ' active' : ''}`}>All</Link>
      {fandoms.map(f => (
        <Link key={f.slug} href={`/f/${f.slug}`} className={`chip${active === f.slug ? ' active' : ''}`}>{f.name}</Link>
      ))}
    </nav>
  );
}
