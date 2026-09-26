'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Post } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';
import { compact, timeAgo } from '@/lib/format';
import { Thumb } from '@/components/PostCard';
import VisibilityBadge from '@/components/VisibilityBadge';

export default function StudioPage() {
  const user = useRequireUser();
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => { if (user) api<{ posts: Post[] }>('/v1/me/posts').then(d => setPosts(d.posts)).catch(() => setPosts([])); }, [user]);
  if (!user) return null;

  return (
    <div className="wrap">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <h1 className="display page-title">Studio</h1>
        <div className="spacer" />
        <Link href="/upload" className="btn btn-primary" style={{ marginBottom: 12 }}>+ Upload</Link>
      </div>
      <p className="muted">Everything you’ve uploaded — drafts, private, unlisted, and public.</p>
      <div style={{ margin: '24px 0 64px' }}>
        {!posts && <div className="skeleton" style={{ height: 120 }} />}
        {posts?.length === 0 && (
          <div className="empty"><div className="display">No uploads yet</div><p>Your first moment is one drop away.</p><Link href="/upload" className="btn btn-primary">Upload</Link></div>
        )}
        {posts?.map(post => (
          <div key={post.id} className="list-row">
            <Link href={`/studio/${post.id}`} className="thumb"><Thumb post={post} /></Link>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <div className="row"><VisibilityBadge post={post} />{post.mediaStatus === 'processing' && <span className="badge sky">Converting…</span>}{post.mediaStatus === 'failed' && <span className="badge">Failed</span>}{post.fandom && <span className="muted">{post.fandom.name}</span>}</div>
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
      </div>
    </div>
  );
}
