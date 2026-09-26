'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Post } from '@/lib/api';
import { compact, timeAgo } from '@/lib/format';
import { Thumb } from './PostCard';
import VisibilityBadge from './VisibilityBadge';

/** Everything you've uploaded — drafts, private, unlisted and public — with quick edit/view. */
export default function StudioList() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => { api<{ posts: Post[] }>('/v1/me/posts').then(d => setPosts(d.posts)).catch(() => setPosts([])); }, []);
  const drafts = posts?.filter(p => p.status === 'draft').length ?? 0;
  return (
    <section>
      <div className="row tab-intro">
        <p className="muted" style={{ margin: 0 }}>
          Only you see this. {posts ? `${posts.length} upload${posts.length === 1 ? '' : 's'}${drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}.` : ''}
        </p>
        <div className="spacer" />
        <Link href="/upload" className="btn btn-primary btn-sm">+ Upload</Link>
      </div>
      {!posts && <div className="skeleton" style={{ height: 120 }} />}
      {posts?.length === 0 && (
        <div className="empty"><div className="display">No uploads yet</div><p>Your first moment is one drop away.</p><Link href="/upload" className="btn btn-primary">Upload</Link></div>
      )}
      {posts?.map(post => (
        <div key={post.id} className="list-row">
          <Link href={`/studio/${post.id}`} className="thumb"><Thumb post={post} /></Link>
          <div className="stack" style={{ gap: 4, minWidth: 0 }}>
            <div className="row">
              <VisibilityBadge post={post} />
              {post.mediaStatus === 'processing' && <span className="badge sky">Converting…</span>}
              {post.mediaStatus === 'failed' && <span className="badge">Failed</span>}
              {post.match && <Link href={`/m/${post.match.id}`} className="badge">⚽ {post.match.home} {post.match.homeScore}–{post.match.awayScore} {post.match.away}</Link>}
              {post.fandom && <span className="muted">{post.fandom.name}</span>}
            </div>
            <Link href={`/studio/${post.id}`}><strong>{post.title || 'Untitled'}</strong></Link>
            <span className="muted" style={{ fontSize: 13 }}>
              ▲ {compact(post.score)} · {compact(post.viewCount)} views · {compact(post.commentCount)} comments · {post.publishedAt ? `published ${timeAgo(post.publishedAt)}` : `uploaded ${timeAgo(post.createdAt)}`}
            </span>
          </div>
          <div className="row">
            <Link href={`/studio/${post.id}`} className="btn btn-sm">Edit</Link>
            <Link href={`/p/${post.id}`} className="btn btn-sm btn-ghost">View</Link>
          </div>
        </div>
      ))}
    </section>
  );
}
