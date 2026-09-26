'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, SITE_URL, type Post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact, timeAgo } from '@/lib/format';
import Avatar from './Avatar';
import Comments from './Comments';
import MediaPlayer from './MediaPlayer';
import ShareBar from './ShareBar';
import UpvoteButton from './UpvoteButton';
import VisibilityBadge from './VisibilityBadge';

export default function PostView({ id }: { id: string }) {
  const { user, ready } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);
  const counted = useRef(false);
  const setCommentCount = useCallback((count: number) => setPost(p => (p && p.commentCount !== count ? { ...p, commentCount: count } : p)), []);

  useEffect(() => {
    if (!ready) return;
    api<{ post: Post }>(`/v1/posts/${id}`)
      .then(data => {
        setPost(data.post);
        if (!counted.current && data.post.status === 'published') {
          counted.current = true;
          api(`/v1/posts/${id}/view`, { method: 'POST' }).catch(() => {});
        }
      })
      .catch(err => { if (err instanceof ApiError && err.status === 404) setMissing(true); });
  }, [id, ready, user]);

  if (missing) {
    return (
      <div className="wrap">
        <div className="empty" style={{ marginTop: 48 }}>
          <div className="display">Offside.</div>
          <p>This post doesn’t exist, or it’s private.</p>
          <Link href="/" className="btn btn-primary">Back to the feed</Link>
        </div>
      </div>
    );
  }
  if (!post) return <div className="wrap"><div className="skeleton" style={{ aspectRatio: '16 / 9', marginTop: 24 }} /></div>;

  const live = post.status === 'published';
  // On phones, open the OS share sheet directly; elsewhere jump to the share panel.
  const nativeShare = (event: React.MouseEvent) => {
    if (typeof navigator === 'undefined' || !('share' in navigator) || !window.matchMedia('(max-width: 1000px)').matches) return;
    event.preventDefault();
    navigator.share({ title: post.title, text: `${post.title} — on incha.tv`, url: `${SITE_URL}/p/${post.id}` }).catch(() => {});
  };
  const shareable = live && post.visibility !== 'private';

  return (
    <div className="wrap">
      <div className="post-layout">
        <div className="post-main">
          <MediaPlayer
            kind={post.kind}
            src={post.mediaUrl}
            poster={post.coverUrl}
            filter={post.filter}
            trimStart={post.trimStart}
            trimEnd={post.trimEnd}
            title={post.title}
          />
          {post.match && (
            <Link href={`/m/${post.match.id}`} className="match-chip">
              ⚽ {post.match.home} {post.match.homeScore}–{post.match.awayScore} {post.match.away}{post.matchMinute != null ? ` · ${post.matchMinute}'` : ''}
            </Link>
          )}
          <h1 className="display post-title">{post.title}</h1>
          <div className="creator-line">
            <Link href={`/u/${post.creator.handle}`} className="row">
              <Avatar name={post.creator.displayName} />
              <span><strong>{post.creator.displayName}</strong><br /><span className="muted">@{post.creator.handle}</span></span>
            </Link>
            {post.fandom && <Link href={`/f/${post.fandom.slug}`} className="chip">{post.fandom.name}</Link>}
            <div className="spacer" />
            <span className="muted">{compact(post.viewCount)} {post.viewCount === 1 ? 'view' : 'views'} · {timeAgo(post.publishedAt || post.createdAt)}</span>
          </div>
          <div className="actions">
            <UpvoteButton key={`${post.id}:${post.viewerHasVoted}`} postId={post.id} score={post.score} voted={post.viewerHasVoted} disabled={!live} />
            <a href="#comments" className="btn">💬 {compact(post.commentCount)}</a>
            {shareable && <a href="#share" className="btn" onClick={nativeShare}>↗ Share</a>}
            {post.isOwner && <Link href={`/studio/${post.id}`} className="btn">Edit</Link>}
            {post.isOwner && <VisibilityBadge post={post} />}
          </div>
          {post.description && <p className="description">{post.description}</p>}
        </div>
        <div id="comments" className="post-comments">
          <Comments postId={post.id} open={live} onCount={setCommentCount} />
        </div>
        <aside className="post-aside stack" style={{ gap: 20 }}>
          {shareable ? (
            <div className="panel" id="share"><ShareBar postId={post.id} title={post.title} /></div>
          ) : (
            <div className="panel">
              <p className="mono muted" style={{ marginTop: 0 }}>Only you can see this</p>
              <p className="muted">Publish it as public or unlisted to get share links.</p>
              <Link href={`/studio/${post.id}`} className="btn btn-primary btn-sm">Open in Studio</Link>
            </div>
          )}
          {post.fandom && (
            <div className="panel">
              <p className="mono muted" style={{ marginTop: 0 }}>More from</p>
              <Link href={`/f/${post.fandom.slug}`} className="display" style={{ fontSize: 32 }}>{post.fandom.name} →</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
