'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type Post, type Sort } from '@/lib/api';
import { compact, filterCss, runtime } from '@/lib/format';
import { useIsPhone } from '@/lib/useIsPhone';
import { useAuth } from '@/lib/auth';

type Mode = Sort | 'following';
const SORTS: { value: Mode; label: string }[] = [{ value: 'hot', label: 'Hot' }, { value: 'new', label: 'New' }, { value: 'top', label: 'Top' }];

/** Portrait "explore" grid. The lead moment plays silently; everything opens into the swipe feed on phones. */
export default function MomentGrid() {
  const { user } = useAuth();
  const [sort, setSort] = useState<Mode>('hot');
  const modes = user ? [...SORTS, { value: 'following' as const, label: 'Following' }] : SORTS;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState('');
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();

  const load = useCallback(async (offset: number) => {
    if (loading.current) return;
    loading.current = true;
    try {
      // "Following": clips from matches and teams you follow.
      const path = sort === 'following' ? `/v1/feed/following?offset=${offset}&limit=24` : `/v1/posts?sort=${sort}&offset=${offset}&limit=24`;
      const data = await api<{ posts: Post[]; nextOffset: number | null }>(path);
      setPosts(current => (offset ? [...(current ?? []), ...data.posts] : data.posts));
      setNext(data.nextOffset);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      loading.current = false;
    }
  }, [sort]);

  useEffect(() => { setPosts(null); setNext(null); setError(''); load(0); }, [load]);

  // Keep loading as the grid scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || next === null) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) load(next); }, { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [next, load]);

  const hrefFor = (post: Post) => (phone ? `/watch?sort=${sort === 'following' ? 'new' : sort}&start=${post.id}` : `/p/${post.id}`);

  return (
    <section className="home-section">
      <div className="section-head">
        <h2 className="display">Moments</h2>
        <div className="segmented" role="group" aria-label="Sort moments">
          {modes.map(s => <button key={s.value} aria-pressed={sort === s.value} onClick={() => setSort(s.value)}>{s.label}</button>)}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="moments">
        {posts === null && Array.from({ length: 9 }, (_, i) => <div key={i} className={`tile skeleton${i === 0 ? ' lead' : ''}`} />)}
        {posts?.map((post, i) => <Tile key={post.id} post={post} lead={i === 0} href={hrefFor(post)} />)}
      </div>
      {posts?.length === 0 && (sort === 'following' ? (
        <div className="empty">
          <div className="display">Nothing followed yet</div>
          <p>Follow teams and matches with 🔔 and their clips and highlight reels land here.</p>
          <Link href="/matches" className="btn btn-primary">Find matches</Link>
        </div>
      ) : (
        <div className="empty">
          <div className="display">Nothing here yet</div>
          <p>Be the first to post a moment.</p>
          <Link href="/upload" className="btn btn-primary">Post a moment</Link>
        </div>
      ))}
      <div ref={sentinel} style={{ height: 1 }} />
    </section>
  );
}

function Tile({ post, lead, href }: { post: Post; lead: boolean; href: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motion, setMotion] = useState(false);
  const start = post.trimStart ?? 0;
  const end = post.trimEnd ?? post.duration ?? null;
  const cover = post.coverUrl || (post.kind === 'image' ? post.mediaUrl : null);
  const length = post.kind === 'video' ? runtime(post) : null;

  // Only the lead tile moves, and only for people who haven't asked for reduced motion.
  useEffect(() => {
    if (lead && post.kind === 'video') setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [lead, post.kind]);

  return (
    <Link href={href} className={`tile${lead ? ' lead' : ''}`}>
      {motion ? (
        <video
          ref={videoRef}
          src={`${post.mediaUrl}#t=${start}`}
          poster={cover ?? undefined}
          muted autoPlay playsInline loop preload="metadata"
          style={{ filter: filterCss(post.filter) }}
          onTimeUpdate={() => { const v = videoRef.current; if (v && end && v.currentTime >= end) v.currentTime = start; }}
        />
      ) : cover ? (
        <img src={cover} alt="" loading={lead ? 'eager' : 'lazy'} style={{ filter: filterCss(post.filter) }} />
      ) : (
        <video src={`${post.mediaUrl}#t=${start || 0.1}`} preload="metadata" muted playsInline style={{ filter: filterCss(post.filter) }} />
      )}
      <div className="tile-top">
        {post.match ? <span className="tile-chip">⚽ {post.match.homeScore}–{post.match.awayScore}{post.matchMinute != null ? ` · ${post.matchMinute}'` : ''}</span> : <span />}
        {length && <span className="tile-chip">{length}</span>}
      </div>
      <div className="tile-bottom">
        {lead && post.fandom && <span className="tile-fandom">{post.fandom.name}</span>}
        <strong className="tile-title">{post.title}</strong>
        <span className="tile-meta">@{post.creator.handle} · ▲ {compact(post.score)}</span>
      </div>
    </Link>
  );
}
