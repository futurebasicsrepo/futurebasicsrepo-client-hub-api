'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Reply, type Thread } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import VoteButton from './VoteButton';

type Node = { reply: Reply; children: Node[] };

function ReplyComposer({ threadId, parentId, onPosted, onCancel }: {
  threadId: string; parentId?: number; onPosted: (reply: Reply) => void; onCancel?: () => void;
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
      const { reply } = await api<{ reply: Reply }>(`/v1/threads/${threadId}/replies`, { method: 'POST', body: { body, parentId } });
      onPosted(reply);
      setBody('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack reply-composer" style={{ gap: 8 }} onSubmit={submit}>
      <textarea className="textarea" value={body} onChange={e => setBody(e.target.value)} maxLength={5000} rows={parentId ? 2 : 3}
        placeholder={parentId ? 'Write a reply…' : 'Add to the thread…'} autoFocus={Boolean(parentId)} aria-label="Reply"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }} />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <div className="spacer" />
        {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>Reply</button>
      </div>
    </form>
  );
}

/** A thread and its replies as a tree (Reddit style): collapse any branch, reply at any level. */
export default function ThreadView({ slug, id }: { slug: string; id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [missing, setMissing] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => {
    api<{ thread: Thread; replies: Reply[] }>(`/v1/threads/${id}`)
      .then(data => { setThread(data.thread); setReplies(data.replies); })
      .catch(() => setMissing(true));
  }, [id, user]);

  const tree = useMemo(() => {
    const nodes = new Map<number, Node>(replies.map(r => [r.id, { reply: r, children: [] }]));
    const roots: Node[] = [];
    for (const node of nodes.values()) {
      const parent = node.reply.parentId != null ? nodes.get(node.reply.parentId) : null;
      (parent ? parent.children : roots).push(node);
    }
    // Best replies first at every level; a removed reply only stays if it has replies under it.
    const order = (list: Node[]): Node[] => list
      .filter(n => !n.reply.deleted || n.children.length)
      .sort((a, b) => b.reply.score - a.reply.score || Date.parse(a.reply.createdAt) - Date.parse(b.reply.createdAt))
      .map(n => ({ ...n, children: order(n.children) }));
    return order(roots);
  }, [replies]);

  if (missing) {
    return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">Thread not found</div><Link href={`/f/${slug}`} className="btn">Back to the fandom</Link></div></div>;
  }
  if (!thread) return <div className="wrap"><div className="skeleton" style={{ height: 220, marginTop: 24 }} /></div>;

  const add = (reply: Reply) => { setReplies(list => [...list, reply]); setReplyTo(null); setThread(t => (t ? { ...t, replyCount: t.replyCount + 1 } : t)); };
  const toggle = (rid: number) => setCollapsed(set => { const next = new Set(set); if (next.has(rid)) next.delete(rid); else next.add(rid); return next; });
  const count = (n: Node): number => n.children.reduce((sum, c) => sum + 1 + count(c), 0);

  async function removeReply(rid: number) {
    if (!window.confirm('Delete this reply?')) return;
    await api(`/v1/replies/${rid}`, { method: 'DELETE' });
    setReplies(list => list.map(r => (r.id === rid ? { ...r, deleted: true, body: null, author: null, canDelete: false } : r)));
  }
  async function removeThread() {
    if (!thread || !window.confirm('Delete this thread?')) return;
    await api(`/v1/threads/${thread.id}`, { method: 'DELETE' });
    router.push(`/f/${slug}?c=${thread.channel}`);
  }

  const renderNode = (node: Node) => {
    const r = node.reply;
    const shut = collapsed.has(r.id);
    return (
      <div key={r.id} className="reply">
        <button className="reply-rail" onClick={() => toggle(r.id)} aria-label={shut ? 'Expand replies' : 'Collapse replies'} aria-expanded={!shut} />
        <div className="reply-body">
          <div className="reply-who">
            {r.author ? <Link href={`/u/${r.author.handle}`}><strong>{r.author.displayName}</strong></Link> : <em className="muted">removed</em>}
            <span className="muted"> · {timeAgo(r.createdAt)}</span>
            {shut && <button className="linkish" onClick={() => toggle(r.id)}> [+{count(node) + 1}]</button>}
          </div>
          {!shut && (
            <>
              {r.deleted ? <p className="muted"><em>Reply removed.</em></p> : <p className="reply-text">{r.body}</p>}
              <div className="row reply-actions">
                {!r.deleted && <VoteButton small path={`/v1/replies/${r.id}/vote`} score={r.score} voted={r.viewerHasVoted} next={`/f/${slug}/t/${id}`} />}
                {user && !r.deleted && !thread.deleted && <button className="linkish" onClick={() => setReplyTo(replyTo === r.id ? null : r.id)}>Reply</button>}
                {r.canDelete && <button className="linkish" onClick={() => removeReply(r.id)}>Delete</button>}
              </div>
              {replyTo === r.id && <ReplyComposer threadId={thread.id} parentId={r.id} onPosted={add} onCancel={() => setReplyTo(null)} />}
              {node.children.length > 0 && <div className="reply-children">{node.children.map(renderNode)}</div>}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="wrap thread-page">
      <Link href={`/f/${slug}?c=${thread.channel}`} className="linkish thread-back">← {thread.fandom?.name ?? 'Fandom'} · #{thread.channel}</Link>
      <article className="thread-card">
        <VoteButton path={`/v1/threads/${thread.id}/vote`} score={thread.score} voted={thread.viewerHasVoted} next={`/f/${slug}/t/${id}`} />
        <div className="thread-card-body">
          <span className="thread-meta">@{thread.author?.handle ?? 'removed'} · {timeAgo(thread.createdAt)}</span>
          <h1>{thread.title}</h1>
          {thread.body && <p className="thread-text">{thread.body}</p>}
          <div className="row" style={{ gap: 14 }}>
            <span className="muted">💬 {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}</span>
            {thread.canDelete && <button className="linkish" onClick={removeThread}>Delete</button>}
          </div>
        </div>
      </article>

      {!thread.deleted && (user
        ? <ReplyComposer threadId={thread.id} onPosted={add} />
        : <p className="panel"><Link href={`/login?next=/f/${slug}/t/${id}`} className="btn btn-primary btn-sm">Sign in</Link> <span className="muted">to reply.</span></p>)}

      <div className="reply-tree">
        {tree.map(renderNode)}
        {tree.length === 0 && <p className="muted">No replies yet. Be the first.</p>}
      </div>
    </div>
  );
}
