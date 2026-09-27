'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type Comment } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import Avatar from './Avatar';

function Composer({ postId, parentId, onPosted, onCancel, autoFocus }: {
  postId: string; parentId?: number; onPosted: (comment: Comment) => void; onCancel?: () => void; autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { comment } = await api<{ comment: Comment }>(`/v1/posts/${postId}/comments`, { method: 'POST', body: { body, parentId } });
      onPosted(comment);
      setBody('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 8 }}>
      <textarea
        className="textarea"
        value={body}
        onChange={event => setBody(event.target.value)}
        placeholder={parentId ? 'Write a reply…' : 'Say something to the hinchada…'}
        maxLength={2000}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event); }}
      />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <div className="spacer" />
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>{parentId ? 'Reply' : 'Comment'}</button>
      </div>
    </form>
  );
}

export default function Comments({ postId, open, onCount }: { postId: string; open: boolean; onCount?: (count: number) => void }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ comments: Comment[] }>(`/v1/posts/${postId}/comments`)
      .then(data => setComments(data.comments))
      .catch(err => setError(err.message));
  }, [postId, user]);

  const threads = useMemo(() => {
    const list = comments || [];
    const replies = new Map<number, Comment[]>();
    for (const c of list) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) || []), c]);
    return list
      .filter(c => !c.parentId)
      .filter(c => !c.deleted || replies.has(c.id))
      .reverse() // newest threads first; replies stay chronological
      .map(c => ({ comment: c, replies: (replies.get(c.id) || []).filter(r => !r.deleted) }));
  }, [comments]);

  const live = (comments || []).filter(c => !c.deleted).length;
  useEffect(() => { if (comments) onCount?.(live); }, [comments, live, onCount]);

  async function remove(id: number) {
    if (!window.confirm('Delete this comment?')) return;
    await api(`/v1/comments/${id}`, { method: 'DELETE' });
    setComments(current => (current || []).map(c => (c.id === id ? { ...c, deleted: true, body: null, author: null, canDelete: false } : c)));
  }

  const add = (comment: Comment) => { setComments(current => [...(current || []), comment]); setReplyTo(null); };

  const renderComment = (c: Comment, isReply = false) => (
    <div className="comment" key={c.id}>
      {c.author ? <Avatar name={c.author.displayName} size="sm" /> : <span className="avatar sm" style={{ background: 'var(--ink-3)' }} />}
      <div className="body">
        <div className="who">
          {c.author ? <Link href={`/u/${c.author.handle}`}><strong>{c.author.displayName}</strong> @{c.author.handle}</Link> : <em>removed</em>}
          <span>· {timeAgo(c.createdAt)}</span>
        </div>
        {c.deleted ? <p className="muted"><em>Comment removed.</em></p> : <p>{c.body}</p>}
        <div className="row" style={{ gap: 14 }}>
          {!isReply && user && open && !c.deleted && <button className="linkish" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>Reply</button>}
          {c.canDelete && <button className="linkish" onClick={() => remove(c.id)}>Delete</button>}
        </div>
      </div>
    </div>
  );

  return (
    <section className="comments">
      <h2 className="display">Comments <span className="muted">{live}</span></h2>
      {open ? (
        user ? <Composer postId={postId} onPosted={add} /> : (
          <p className="panel"><Link href={`/login?next=/p/${postId}`} className="btn btn-primary btn-sm">Sign in</Link> <span className="muted">to join the conversation.</span></p>
        )
      ) : <p className="muted">Comments open once this post is published.</p>}
      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: 16 }}>
        {threads.map(({ comment, replies }) => (
          <div key={comment.id}>
            {renderComment(comment)}
            {(replies.length > 0 || replyTo === comment.id) && (
              <div className="replies" style={{ marginLeft: 40 }}>
                {replies.map(r => renderComment(r, true))}
                {replyTo === comment.id && (
                  <div style={{ padding: '8px 0 12px 12px' }}>
                    <Composer postId={postId} parentId={comment.id} onPosted={add} onCancel={() => setReplyTo(null)} autoFocus />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {comments && threads.length === 0 && open && <p className="muted">No comments yet. Start the chant.</p>}
      </div>
    </section>
  );
}
