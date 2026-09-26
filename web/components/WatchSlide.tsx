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
  /** Whether a <video> should exist at all (only the active slide and its neighbours). */
  mounted: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: (post: Post) => void;
  onVote: (id: string, score: number, voted: boolean) => void;
}

function WatchSlide({ post, active, mounted, muted, onToggleMute, onOpenComments, onVote }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counted = useRef(false);

  const start = post.trimStart ?? 0;
  const end = post.trimEnd ?? post.duration ?? null;

  // Play only while this slide owns the screen; rewind when it leaves.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      if (video.currentTime < start || (end && video.currentTime >= end)) video.currentTime = start;
      video.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      video.pause();
      if (video.readyState > 0) video.currentTime = start;
    }
  }, [active, start, end, mounted]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  // Count a view after two seconds on screen.
  useEffect(() => {
    if (!active || counted.current) return;
    const timer = setTimeout(() => { counted.current = true; api(`/v1/posts/${post.id}/view`, { method: 'POST' }).catch(() => {}); }, 2000);
    return () => clearTimeout(timer);
  }, [active, post.id]);

  function onTimeUpdate() {
    const video = videoRef.current!;
    const stop = end ?? video.duration;
    if (stop && video.currentTime >= stop - 0.05) video.currentTime = start; // loop inside the trim window
    if (stop) setProgress(Math.min(1, Math.max(0, (video.currentTime - start) / (stop - start))));
  }

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
    tapTimer.current = setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) { video.play().catch(() => {}); setPaused(false); } else { video.pause(); setPaused(true); }
    }, 280);
  }

  async function share() {
    const url = `${SITE_URL}/p/${post.id}`;
    if (typeof navigator.share === 'function') { navigator.share({ title: post.title, text: `${post.title} — on incha.tv`, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copy this link', url); }
  }

  const style = { filter: filterCss(post.filter) };
  const poster = post.coverUrl || (post.kind === 'image' ? post.mediaUrl : undefined);

  return (
    <section className="watch-slide" aria-label={post.title}>
      {poster && <div className="watch-backdrop" style={{ backgroundImage: `url("${poster}")` }} aria-hidden="true" />}
      <div className="watch-stage" onClick={onTap}>
        {post.kind === 'image' ? (
          <img src={post.mediaUrl} alt={post.title} style={style} />
        ) : mounted ? (
          <video
            ref={videoRef}
            src={`${post.mediaUrl}#t=${start}`}
            poster={poster}
            muted={muted}
            playsInline
            preload={active ? 'auto' : 'metadata'}
            style={style}
            onTimeUpdate={onTimeUpdate}
            onEnded={() => { const v = videoRef.current; if (v && active) { v.currentTime = start; v.play().catch(() => {}); } }}
          />
        ) : poster ? <img src={poster} alt="" style={style} /> : null}
        {paused && active && post.kind === 'video' && <span className="watch-paused" aria-hidden="true">▶</span>}
        {burst > 0 && <span key={burst} className="watch-burst" aria-hidden="true">▲</span>}
      </div>

      <div className="watch-rail">
        <Link href={`/u/${post.creator.handle}`} className="watch-avatar" aria-label={`@${post.creator.handle}`}><Avatar name={post.creator.displayName} /></Link>
        <button className={`watch-action${post.viewerHasVoted ? ' on' : ''}`} onClick={() => vote()} aria-pressed={post.viewerHasVoted} aria-label="Upvote">
          <span className="watch-icon">▲</span><span>{compact(post.score)}</span>
        </button>
        <button className="watch-action" onClick={() => onOpenComments(post)} aria-label="Comments">
          <span className="watch-icon">💬</span><span>{compact(post.commentCount)}</span>
        </button>
        <button className="watch-action" onClick={share} aria-label="Share">
          <span className="watch-icon">↗</span><span>Share</span>
        </button>
        {post.kind === 'video' && (
          <button className="watch-action" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            <span className="watch-icon">{muted ? '🔇' : '🔊'}</span>
          </button>
        )}
      </div>

      <div className="watch-caption">
        <Link href={`/u/${post.creator.handle}`} className="watch-handle">@{post.creator.handle}</Link>
        <Link href={`/p/${post.id}`} className="watch-title">{post.title}</Link>
        <div className="watch-tags">
          {post.match && <Link href={`/m/${post.match.id}`} className="watch-tag flare">⚽ {post.match.home} {post.match.homeScore}–{post.match.awayScore} {post.match.away}{post.matchMinute != null ? ` · ${post.matchMinute}'` : ''}</Link>}
          {post.fandom && <Link href={`/f/${post.fandom.slug}`} className="watch-tag">{post.fandom.name}</Link>}
        </div>
      </div>
      {post.kind === 'video' && <div className="watch-progress"><div style={{ transform: `scaleX(${progress})` }} /></div>}
    </section>
  );
}

export default memo(WatchSlide);
