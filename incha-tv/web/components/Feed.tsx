'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Post, type Sort } from '@/lib/api';
import PostCard from './PostCard';

interface Props {
  fandom?: string;
  creator?: string;
  q?: string;
  emptyTitle?: string;
  emptyBody?: string;
}

export default function Feed({ fandom, creator, q, emptyTitle = 'Nothing here yet', emptyBody = 'Be the first to post a moment.' }: Props) {
  const [sort, setSort] = useState<Sort>('hot');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useCallback((offset: number) => {
    const params = new URLSearchParams({ sort, offset: String(offset) });
    if (fandom) params.set('fandom', fandom);
    if (creator) params.set('creator', creator);
    if (q) params.set('q', q);
    return api<{ posts: Post[]; nextOffset: number | null }>(`/v1/posts?${params}`);
  }, [sort, fandom, creator, q]);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    setError('');
    query(0)
      .then(data => { if (!cancelled) { setPosts(data.posts); setNextOffset(data.nextOffset); } })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [query]);

  async function loadMore() {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const data = await query(nextOffset);
      setPosts(current => [...(current || []), ...data.posts]);
      setNextOffset(data.nextOffset);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section>
      <div className="feed-controls">
        <div className="tabs" role="group" aria-label="Sort">
          {(['hot', 'new', 'top'] as Sort[]).map(option => (
            <button key={option} aria-pressed={sort === option} onClick={() => setSort(option)}>
              {option === 'hot' ? '🔥 Hot' : option === 'new' ? 'New' : 'Top'}
            </button>
          ))}
        </div>
        {q && <span className="muted">Results for “{q}” · <Link href="/" className="linkish">clear</Link></span>}
      </div>
      {error && <p className="error">{error}</p>}
      {!posts && !error && (
        <div className="grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '16 / 13' }} />)}</div>
      )}
      {posts && posts.length === 0 && (
        <div className="empty">
          <div className="display">{emptyTitle}</div>
          <p>{emptyBody}</p>
          <Link href="/upload" className="btn btn-primary">Upload a moment</Link>
        </div>
      )}
      {posts && posts.length > 0 && (
        <>
          <div className="grid">{posts.map(post => <PostCard key={post.id} post={post} />)}</div>
          {nextOffset !== null && (
            <div style={{ textAlign: 'center', paddingBottom: 48 }}>
              <button className="btn" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
