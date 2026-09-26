'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Post, type Sort } from '@/lib/api';
import { filterCss } from '@/lib/format';
import Comments from './Comments';
import WatchSlide from './WatchSlide';
import { takePost } from '@/lib/handoff';

const SORTS: Sort[] = ['hot', 'new', 'top'];

// The page passes the query in (rather than useSearchParams, which defers rendering to the client),
// so the tapped clip is on screen in the navigation's first frame and its tile can morph into it.
export default function WatchFeed({ sort: requested, fandom = null, startId = null }: { sort?: string; fandom?: string | null; startId?: string | null }) {
  const router = useRouter();
  const sort = (SORTS.includes(requested as Sort) ? requested : 'hot') as Sort;

  // Opened from a moment tile: start with that clip already on screen, so the tile can morph into it.
  const [posts, setPosts] = useState<Post[]>(() => { const handed = takePost(startId); return handed ? [handed] : []; });
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [sheet, setSheet] = useState<Post | null>(null);
  const [done, setDone] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async (offset: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const query = new URLSearchParams({ sort, offset: String(offset), limit: '12' });
      if (fandom) query.set('fandom', fandom);
      const data = await api<{ posts: Post[]; nextOffset: number | null }>(`/v1/posts?${query}`);
      setPosts(current => {
        const base = reset ? current.filter(p => p.id === startId) : current;
        const seen = new Set(base.map(p => p.id));
        return [...base, ...data.posts.filter(p => !seen.has(p.id))];
      });
      setNextOffset(data.nextOffset);
      if (data.nextOffset === null) setDone(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [sort, fandom, startId]);

  // (Re)start the feed: optionally lead with a specific clip, then the ranked list.
  useEffect(() => {
    let cancelled = false;
    setPosts(current => current.filter(p => p.id === startId)); setActive(0); setDone(false); setNextOffset(0);
    scroller.current?.scrollTo({ top: 0 });
    (async () => {
      if (startId) {
        const first = await api<{ post: Post }>(`/v1/posts/${startId}`).catch(() => null);
        if (!cancelled && first) setPosts(current => [first.post, ...current.filter(p => p.id !== startId)]);
      }
      if (!cancelled) await loadMore(0, true);
    })();
    return () => { cancelled = true; };
  }, [sort, fandom, startId, loadMore]);

  // Scroll snapping re-snaps to whatever cell it was on when content is inserted above it
  // (the loading placeholder), so pin the view to the first clip when the feed (re)fills.
  const hadPosts = useRef(false);
  useEffect(() => {
    if (!posts.length) { hadPosts.current = false; return; }
    if (!hadPosts.current) { hadPosts.current = true; scroller.current?.scrollTo({ top: 0 }); }
  }, [posts.length]);

  // The slide that is mostly on screen becomes active.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
      }
    }, { root, threshold: 0.6 });
    root.querySelectorAll('[data-index]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [posts.length]);

  // Keep a few clips queued ahead.
  useEffect(() => {
    if (nextOffset !== null && !done && active >= posts.length - 3 && posts.length) loadMore(nextOffset);
  }, [active, posts.length, nextOffset, done, loadMore]);

  // Keyboard on desktop; no page scroll behind the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || !scroller.current) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); scroller.current.scrollBy({ top: scroller.current.clientHeight, behavior: 'smooth' }); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); scroller.current.scrollBy({ top: -scroller.current.clientHeight, behavior: 'smooth' }); }
      if (e.key === 'm') setMuted(m => !m);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [sheet]);

  const onVote = useCallback((id: string, score: number, voted: boolean) => {
    setPosts(list => list.map(p => (p.id === id ? { ...p, score, viewerHasVoted: voted } : p)));
  }, []);
  const onToggleMute = useCallback(() => setMuted(m => !m), []);

  // ---- the shared player ----
  // One <video> plays every clip. Browsers (iOS in Low Power Mode especially) may refuse to start
  // a video without a tap; once a tap has started this element, it keeps playing each new clip.
  const player = useRef<HTMLVideoElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null); // clip whose frames are on screen
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const current = posts[active];
  const clip = current?.kind === 'video' && !sheet ? current : null;
  const clipStart = clip?.trimStart ?? 0;
  const clipEnd = clip?.trimEnd ?? clip?.duration ?? null;

  const play = useCallback(() => {
    const video = player.current;
    if (!video) return;
    video.play().then(() => setPaused(false)).catch(() => setPaused(true));
  }, []);

  useEffect(() => {
    const video = player.current;
    if (!video) return;
    setPlayingId(null);
    setProgress(0);
    if (!clip) { video.pause(); return; }
    const src = `${clip.mediaUrl}#t=${clipStart}`;
    if (video.dataset.post !== clip.id) {
      video.dataset.post = clip.id;
      video.src = src;
    } else {
      video.currentTime = clipStart;
    }
    play();
  }, [clip?.id, clip?.mediaUrl, clipStart, play]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (player.current) player.current.muted = muted; }, [muted]);

  const onTogglePlay = useCallback(() => {
    const video = player.current;
    if (!video) return;
    if (video.paused) play(); else { video.pause(); setPaused(true); }
  }, [play]);

  function onTimeUpdate() {
    const video = player.current;
    if (!video || !clip) return;
    const stop = clipEnd ?? video.duration;
    if (stop && video.currentTime >= stop - 0.05) video.currentTime = clipStart; // loop inside the trim window
    if (stop) setProgress(Math.min(1, Math.max(0, (video.currentTime - clipStart) / (stop - clipStart))));
  }
  const onOpenComments = useCallback((post: Post) => setSheet(post), []);
  const sheetId = sheet?.id;
  const setCommentCount = useCallback((count: number) => {
    setPosts(list => list.map(p => (p.id === sheetId ? { ...p, commentCount: count } : p)));
  }, [sheetId]);

  const tabHref = (s: Sort) => `/watch?${new URLSearchParams({ sort: s, ...(fandom ? { fandom } : {}) })}`;

  return (
    <div className="watch">
      <header className="watch-top">
        <button className="watch-back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} aria-label="Back">←</button>
        <nav className="watch-tabs" aria-label="Sort">
          {SORTS.map(s => <Link key={s} href={tabHref(s)} replace aria-current={s === sort ? 'page' : undefined}>{s === 'hot' ? 'Hot' : s === 'new' ? 'New' : 'Top'}</Link>)}
        </nav>
        <Link href="/upload" className="watch-back" aria-label="Upload">＋</Link>
      </header>

      <div className="watch-player" aria-hidden="true">
        {clip?.coverUrl && <div className="watch-backdrop" style={{ backgroundImage: `url("${clip.coverUrl}")` }} />}
        <video
          ref={player}
          muted={muted}
          playsInline
          autoPlay
          preload="auto"
          style={{ filter: filterCss(clip?.filter) }}
          onPlaying={() => { if (clip) { setPlayingId(clip.id); setPaused(false); } }}
          onTimeUpdate={onTimeUpdate}
          onEnded={() => { const v = player.current; if (v && clip) { v.currentTime = clipStart; play(); } }}
        />
      </div>
      {clip && <div className="watch-progress"><div style={{ transform: `scaleX(${progress})` }} /></div>}

      <div className="watch-scroller" ref={scroller}>
        {posts.map((post, index) => (
          <div key={post.id} data-index={index} className="watch-cell">
            <WatchSlide
              post={post}
              morph={post.id === startId}
              active={index === active && !sheet}
              mounted={Math.abs(index - active) <= 2}
              playing={post.id === playingId && index === active}
              paused={paused}
              muted={muted}
              onTogglePlay={onTogglePlay}
              onToggleMute={onToggleMute}
              onOpenComments={onOpenComments}
              onVote={onVote}
            />
          </div>
        ))}
        {(loading || !posts.length) && !done && <div className="watch-cell watch-loading"><div className="skeleton" /></div>}
        {done && (
          <div className="watch-cell watch-end">
            <div className="display">You’re all caught up</div>
            <p className="muted">That’s every clip{fandom ? ' in this fandom' : ''} for now.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link href="/upload" className="btn btn-primary">Upload a moment</Link>
              <Link href="/matches" className="btn">Live matches</Link>
            </div>
          </div>
        )}
      </div>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Comments" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="row" style={{ marginBottom: 8 }}>
              <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{sheet.title}</strong>
              <button className="linkish" onClick={() => setSheet(null)} aria-label="Close comments">Close</button>
            </div>
            <div className="sheet-body">
              <Comments postId={sheet.id} open={sheet.status === 'published'} onCount={setCommentCount} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
