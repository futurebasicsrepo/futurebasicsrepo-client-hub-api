'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Fandom } from '@/lib/api';
import Feed from './Feed';
import FandomChips from './FandomChips';

export default function FandomView({ slug }: { slug: string }) {
  const [fandom, setFandom] = useState<Fandom | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api<{ fandom: Fandom }>(`/v1/fandoms/${encodeURIComponent(slug)}`).then(d => setFandom(d.fandom)).catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">No such fandom</div><Link href="/fandoms" className="btn">Browse fandoms</Link></div></div>;
  }
  return (
    <div className="wrap">
      <section className="hero">
        <span className="mono muted">Fandom</span>
        <h1 className="display">{fandom?.name ?? '…'}</h1>
        <p>{fandom ? `${fandom.postCount} public ${fandom.postCount === 1 ? 'moment' : 'moments'}` : ' '}</p>
      </section>
      <FandomChips active={slug} />
      <Feed fandom={slug} emptyTitle="Quiet in the stands" emptyBody="No posts in this fandom yet. Start the chant." />
    </div>
  );
}
