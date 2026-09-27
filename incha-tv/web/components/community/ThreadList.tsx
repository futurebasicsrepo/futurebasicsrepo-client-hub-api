'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Channel, type Thread } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact, timeAgo } from '@/lib/format';
import VoteButton from './VoteButton';

type Sort = 'hot' | 'new' | 'top';

/** A channel's threads, Reddit style: sortable list, upvotes, reply counts, and a composer on top. */
export default function ThreadList({ slug, channel }: { slug: string; channel: Channel }) {
  const { user } = useAuth();
  const router = useRouter();
  const [sort, setSort] = useState<Sort>('hot');
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (offset: number) => {
    const data = await api<{ threads: Thread[]; nextOffset: number | null }>(
      `/v1/fandoms/${encodeURIComponent(slug)}/threads?channel=${channel.slug}&sort=${sort}&offset=${offset}`);
    setThreads(current => (offset ? [...(current ?? []), ...data.threads] : data.threads));
    setNextOffset(data.nextOffset);
  }, [slug, channel.slug, sort]);

  useEffect(() => { setThreads(null); load(0).catch(err => setError(err.message)); }, [load, user]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { thread } = await api<{ thread: Thread }>(`/v1/fandoms/${encodeURIComponent(slug)}/threads`, { method: 'POST', body: { channel: channel.slug, title, body } });
      router.push(`/f/${slug}/t/${thread.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="threads">
      <div className="threads-head">
        <div>
          <h2 className="channel-title"><span aria-hidden="true">#</span>{channel.name}</h2>
          <p className="muted">{channel.description}</p>
        </div>
        {!composing && (
          user
            ? <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>+ New thread</button>
            : <Link href={`/login?next=/f/${slug}?c=${channel.slug}`} className="btn btn-primary btn-sm">Sign in to post</Link>
        )}
      </div>

      {composing && (
        <form className="panel thread-composer" onSubmit={submit}>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Title" aria-label="Title" autoFocus />
          <textarea className="textarea" value={body} onChange={e => setBody(e.target.value)} maxLength={10000} rows={4} placeholder="Say more (optional)" aria-label="Body" />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <span className="muted" style={{ fontSize: 13 }}>Posting in #{channel.name}</span>
            <div className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setComposing(false); setError(''); }}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy || title.trim().length < 3}>{busy ? 'Posting…' : 'Post thread'}</button>
          </div>
        </form>
      )}

      <div className="segmented" role="group" aria-label="Sort threads">
        {(['hot', 'new', 'top'] as const).map(s => (
          <button key={s} aria-pressed={sort === s} onClick={() => setSort(s)}>{s === 'hot' ? 'Hot' : s === 'new' ? 'New' : 'Top'}</button>
        ))}
      </div>

      {!composing && error && <p className="error">{error}</p>}
      <div className="thread-list">
        {threads === null && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 88 }} />)}
        {threads?.map(thread => (
          <Link key={thread.id} href={`/f/${slug}/t/${thread.id}`} className="thread-row">
            <VoteButton path={`/v1/threads/${thread.id}/vote`} score={thread.score} voted={thread.viewerHasVoted} next={`/f/${slug}?c=${channel.slug}`} />
            <div className="thread-row-body">
              <strong>{thread.title}</strong>
              {thread.body && <p>{thread.body}</p>}
              <span className="thread-meta">
                @{thread.author?.handle} · {timeAgo(thread.createdAt)} · 💬 {compact(thread.replyCount)}
                {thread.replyCount > 0 && <> · active {timeAgo(thread.lastActivityAt)}</>}
              </span>
            </div>
          </Link>
        ))}
        {threads?.length === 0 && (
          <div className="empty">
            <div className="display">Quiet in #{channel.name}</div>
            <p className="muted">Start the first thread. The stands are listening.</p>
          </div>
        )}
      </div>
      {nextOffset !== null && <button className="btn" onClick={() => load(nextOffset)}>Load more</button>}
    </section>
  );
}
