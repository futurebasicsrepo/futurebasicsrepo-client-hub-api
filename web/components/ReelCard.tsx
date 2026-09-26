'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Match, type Post } from '@/lib/api';
import MediaPlayer from './MediaPlayer';

/** Full-time highlight reel on the match page (and its build state for scorekeepers). */
export default function ReelCard({ match, onRebuild }: { match: Match; onRebuild: () => Promise<void> }) {
  const [reel, setReel] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (match.reelStatus !== 'ready' || !match.reelPostId) { setReel(null); return; }
    api<{ post: Post }>(`/v1/posts/${match.reelPostId}`).then(d => setReel(d.post)).catch(() => setReel(null));
  }, [match.reelStatus, match.reelPostId]);

  if (match.period !== 'ft') return null;
  const rebuild = async () => { setBusy(true); try { await onRebuild(); } finally { setBusy(false); } };
  const keeperAction = match.canScore && match.reelStatus !== 'building' && (
    <button className="btn btn-sm" onClick={rebuild} disabled={busy}>{match.reelStatus === 'ready' ? '↻ Rebuild with new clips' : '🎬 Make highlights'}</button>
  );

  if (match.reelStatus === 'building') {
    return <section className="reel-card panel"><p className="media-note"><span className="spinner" aria-hidden="true" />Cutting the highlight reel from the fans’ clips…</p></section>;
  }
  if (match.reelStatus === 'ready' && reel) {
    return (
      <section className="reel-card">
        <div className="row reel-head">
          <h2 className="display">🎬 Highlights</h2>
          <div className="spacer" />
          <Link href={`/p/${reel.id}`} className="linkish">Share · comment</Link>
        </div>
        <MediaPlayer kind="video" src={reel.mediaUrl} poster={reel.coverUrl} title={reel.title} />
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>{reel.description}</span>
          <div className="spacer" />
          {keeperAction}
        </div>
      </section>
    );
  }
  // none / failed / not built yet: only scorekeepers see a way forward.
  if (!match.canScore) return null;
  return (
    <section className="reel-card panel row">
      <span className="muted" style={{ flex: 1, minWidth: 200 }}>
        {match.reelStatus === 'failed' ? 'The highlight reel didn’t build. Try again.' : 'No fan clips yet for a highlight reel. Add some, then make highlights.'}
      </span>
      {keeperAction}
    </section>
  );
}
