'use client';

import { memo, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, SITE_URL, type Post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact, filterCss } from '@/lib/format';
import Avatar from './Avatar';

interface Props {
  post: Post;
  active: boolean;
  /** Whether this slide is near the screen (only then does it load its poster). */
  mounted: boolean;
  /** The feed's shared player is showing this clip, so the slide lets it show through. */
  playing: boolean;
  paused: boolean;
  muted: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onOpenComments: (post: Post) => void;
  onVote: (id: string, score: number, voted: boolean) => void;
}

// A slide is the poster, caption and action rail. Video plays in the feed's one shared <video>
// underneath (see WatchFeed): iOS only lets an element autoplay once a tap has started it, so
// reusing one element keeps every later clip playing on its own.
function WatchSlide({ post, active, mounted, playing, paused, muted, onTogglePlay, onToggleMute, onOpenComments, onVote }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counted = useRef(false);

  // Count a view after two seconds on screen.
  useEffect(() => {
    if (!active || counted.current) return;
    const timer = setTimeout(() => { counted.current = true; api(`/v1/posts/${post.id}/view`, { method: 'POST' }).catch(() => {}); }, 2000);
    return () => clearTimeout(timer);
  }, [active, post.id]);

  async function vote(forceUp = false) {
    if (!user) { router.push(`/login?next=/watch?start=${post.id}`); return; }
    const next = forceUp ? true : !post.viewerHasVoted;
    if (next === post.viewerHasVoted) return;
    onVote(post.id, post.score + (next ? 1 : -1), next);
    try {
      const result = await api<{ score: number; viewerHasVoted: boolean }>(`/v1/posts/${post.id}/vote`, { method: 'POST', body: { value: next ? 1 : 0 } });
      onVote(post.id, result.score, result.viewerHasVoted);
    } catch {
      onVote(post.id, post.score, post.viewerHasVoted);
    }
  }

  // Single tap pauses; double tap upvotes (and never un-votes), like the apps people already know.
  function onTap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst(b => b + 1);
      vote(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => { if (active && post.kind === 'video') onTogglePlay(); }, 280);
  }

  async function share() {
    const url = `${SITE_URL}/p/${post.id}`;
    if (typeof navigator.share === 'function') { navigator.share({ title: post.title, text: `${post.title} — on incha.tv`, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copy this link', url); }
  }

  const style = { filter: filterCss(post.filter) };
  const poster = post.coverUrl || (post.kind === 'image' ? post.mediaUrl : undefined);
  const seeThrough = playing && post.kind === 'video';

  return (
    <section className={`watch-slide${seeThrough ? ' see-through' : ''}`} aria-label={post.title}>
      {poster && !seeThrough && <div className="watch-backdrop" style={{ backgroundImage: `url("${poster}")` }} aria-hidden="true" />}
      <div className="watch-stage" onClick={onTap}>
        {post.kind === 'image' ? (
          <img src={post.mediaUrl} alt={post.title} style={style} />
        ) : !seeThrough && mounted && poster ? <img src={poster} alt="" style={style} /> : null}
        {paused && active && post.kind === 'video' && (
          <svg className="watch-paused" viewBox="0 0 24 24" width="72" height="72" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" /></svg>
        )}
        {burst > 0 && <span key={burst} className="watch-burst" aria-hidden="true">▲</span>}
      </div>

      <div className="watch-rail">
        <Link href={`/u/${post.creator.handle}`} className="watch-avatar" aria-label={`@${post.creator.handle}`}><Avatar name={post.creator.displayName} /></Link>
        <button className={`watch-action${post.viewerHasVoted ? ' on' : ''}`} onClick={() => vote()} aria-pressed={post.viewerHasVoted} aria-label="Upvote">
          <Icon name="up" /><span>{compact(post.score)}</span>
        </button>
        <button className="watch-action" onClick={() => onOpenComments(post)} aria-label="Comments">
          <Icon name="comment" /><span>{compact(post.commentCount)}</span>
        </button>
        <button className="watch-action" onClick={share} aria-label="Share">
          <Icon name="share" /><span>Share</span>
        </button>
        {post.kind === 'video' && (
          <button className="watch-action" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            <Icon name={muted ? 'muted' : 'sound'} />
          </button>
        )}
      </div>

      <div className="watch-caption">
        <Link href={`/u/${post.creator.handle}`} className="watch-handle">@{post.creator.handle}</Link>
        {post.clippedFrom && <span className="watch-credit">✂️ from @{post.clippedFrom.handle}’s stream</span>}
        <Link href={`/p/${post.id}`} className="watch-title">{post.title}</Link>
        <div className="watch-tags">
          {post.match && <Link href={`/m/${post.match.id}`} className="watch-tag flare">⚽ {post.match.home} {post.match.homeScore}–{post.match.awayScore} {post.match.away}{post.matchMinute != null ? ` · ${post.matchMinute}'` : ''}</Link>}
          {post.fandom && <Link href={`/f/${post.fandom.slug}`} className="watch-tag">{post.fandom.name}</Link>}
        </div>
      </div>
    </section>
  );
}

// Line icons for the action rail: white, no backgrounds, shadowed so they read on any video.
const ICONS: Record<string, React.ReactNode> = {
  up: <path d="M12 4 20 14h-5v6H9v-6H4Z" />,
  comment: <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" />,
  share: <><path d="M14 5h5v5" /><path d="M19 5 10 14" /><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" /></>,
  sound: <><path d="M4 9v6h4l5 4V5L8 9Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></>,
  muted: <><path d="M4 9v6h4l5 4V5L8 9Z" /><path d="m17 9 5 6" /><path d="m22 9-5 6" /></>
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="watch-icon" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export default memo(WatchSlide);
