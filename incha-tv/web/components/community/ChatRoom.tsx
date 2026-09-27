'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, API_URL, type Channel, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Avatar from '../Avatar';
import ReportButton from '../ReportButton';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
// Consecutive messages from one person within 5 minutes are grouped under one name, like Discord.
const grouped = (a: ChatMessage | undefined, b: ChatMessage) =>
  Boolean(a && a.author.handle === b.author.handle && Date.parse(b.createdAt) - Date.parse(a.createdAt) < 5 * 60_000);

/** A live chat channel: history on open, new messages over Server-Sent Events. */
export default function ChatRoom({ slug, channel }: { slug: string; channel: Channel }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [online, setOnline] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const [picked, setPicked] = useState<number | null>(null); // tap a message to report it
  const list = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // stick to the bottom unless the reader scrolled up
  const base = `/v1/fandoms/${encodeURIComponent(slug)}/chat/${channel.slug}`;

  useEffect(() => {
    let cancelled = false;
    api<{ messages: ChatMessage[]; online: number }>(base).then(data => {
      if (cancelled) return;
      setMessages(current => {
        // Messages that arrived over the stream before history loaded stay after it.
        const seen = new Set(data.messages.map(m => m.id));
        return [...data.messages, ...(current ?? []).filter(m => !seen.has(m.id))];
      });
    }).catch(err => setError(err.message));
    const source = new EventSource(`${API_URL}${base}/stream`);
    source.addEventListener('message', event => {
      const message = JSON.parse((event as MessageEvent).data) as ChatMessage;
      setMessages(current => (current?.some(m => m.id === message.id) ? current : [...(current ?? []), message]));
    });
    source.addEventListener('online', event => setOnline(JSON.parse((event as MessageEvent).data).online));
    source.addEventListener('remove', event => {
      const { id } = JSON.parse((event as MessageEvent).data) as { id: number };
      setMessages(current => current?.filter(m => m.id !== id) ?? current);
    });
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => { cancelled = true; source.close(); };
  }, [base]);

  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setError('');
    pinned.current = true;
    try {
      const { message } = await api<{ message: ChatMessage }>(base, { method: 'POST', body: { body } });
      setMessages(current => (current?.some(m => m.id === message.id) ? current : [...(current ?? []), message]));
    } catch (err) {
      setError((err as Error).message);
      setDraft(body);
    }
  }

  return (
    <section className="chat">
      <div className="threads-head">
        <div>
          <h2 className="channel-title"><span aria-hidden="true">#</span>{channel.name}</h2>
          <p className="muted">{channel.description}</p>
        </div>
        <span className="watching-pill"><i aria-hidden="true" />{online} here{!connected && ' · reconnecting…'}</span>
      </div>
      <div className="chat-log" ref={list} onScroll={e => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }} role="log" aria-live="polite">
        {messages === null && <div className="skeleton" style={{ height: 120 }} />}
        {messages?.length === 0 && <p className="muted chat-empty">No messages yet. Kick it off.</p>}
        {messages?.map((m, i) => {
          const tools = picked === m.id && user && m.author.handle !== user.handle
            ? <div className="chat-tools"><ReportButton type="chat" id={m.id} label="Report message" /></div> : null;
          const pick = () => setPicked(picked === m.id ? null : m.id);
          return grouped(messages[i - 1], m) ? (
            <div key={m.id} className="chat-msg cont" onClick={pick}><div><p>{m.body}</p>{tools}</div></div>
          ) : (
            <div key={m.id} className="chat-msg" onClick={pick}>
              <Avatar name={m.author.displayName} size="sm" />
              <div>
                <div className="chat-who"><Link href={`/u/${m.author.handle}`}><strong>{m.author.displayName}</strong></Link> <span className="muted">{time(m.createdAt)}</span></div>
                <p>{m.body}</p>
                {tools}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="error">{error}</p>}
      {user ? (
        <form className="chat-input" onSubmit={send}>
          <input className="input" value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} placeholder={`Message #${channel.name}`} aria-label={`Message #${channel.name}`} />
          <button className="btn btn-primary" disabled={!draft.trim()}>Send</button>
        </form>
      ) : (
        <p className="panel"><Link href={`/login?next=/f/${slug}?c=${channel.slug}`} className="btn btn-primary btn-sm">Sign in</Link> <span className="muted">to chat.</span></p>
      )}
    </section>
  );
}
