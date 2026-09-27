'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type ModItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';

type Tab = 'open' | 'closed' | 'team';
type Team = { team: { handle: string; displayName: string; role: string }[]; admins: string[]; log: { action: string; type: string; id: string; note: string; moderator: string; at: string }[] };

const REASON: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate', violence: 'Violence', sexual: 'Sexual',
  minor_safety: 'Child safety', copyright: 'Copyright', other: 'Other'
};
const TYPE: Record<string, string> = { post: 'Clip', comment: 'Comment', thread: 'Thread', reply: 'Reply', chat: 'Chat message', match: 'Match', user: 'Profile' };

/** The moderator queue: one card per reported thing, worst first; remove, dismiss, restore, ban. */
export default function ModQueue() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [role, setRole] = useState<string>('');
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState('');
  const [appoint, setAppoint] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      if (tab === 'team') setTeam(await api<Team>('/v1/mod/team'));
      else {
        setItems(null);
        const data = await api<{ items: ModItem[]; role: string }>(`/v1/mod/reports?status=${tab}`);
        setItems(data.items);
        setRole(data.role);
      }
    } catch {
      setDenied(true);
    }
  }, [tab]);
  useEffect(() => { if (ready) load(); }, [ready, user, load]);

  async function act(item: ModItem, path: string, body: object, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(`${item.type}:${item.id}`);
    setMessage('');
    try {
      await api(path, { method: 'POST', body });
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function appointMod(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api(`/v1/mod/users/${encodeURIComponent(appoint.replace(/^@/, ''))}/role`, { method: 'POST', body: { role: 'moderator' } });
      setAppoint('');
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  if (ready && (!user || denied)) {
    return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">Moderators only</div><Link href="/" className="btn">Home</Link></div></div>;
  }

  return (
    <div className="wrap mod-page">
      <header className="row" style={{ alignItems: 'flex-end', padding: '24px 0 12px' }}>
        <div>
          <span className="mono muted">Trust &amp; safety</span>
          <h1 className="display" style={{ margin: 0, fontSize: 'clamp(36px, 7vw, 64px)' }}>Mod queue</h1>
        </div>
        <div className="spacer" />
        {role && <span className="badge sky">{role}</span>}
      </header>
      <div className="segmented" role="tablist">
        {(['open', 'closed', 'team'] as const).map(t => (
          <button key={t} role="tab" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'open' ? 'Open' : t === 'closed' ? 'Resolved (30 days)' : 'Team & log'}</button>
        ))}
      </div>
      {message && <p className="error" role="alert">{message}</p>}

      {tab !== 'team' && (
        <div className="mod-list">
          {items === null && Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 140 }} />)}
          {items?.length === 0 && <div className="empty"><div className="display">{tab === 'open' ? 'All clear' : 'Nothing resolved yet'}</div><p className="muted">{tab === 'open' ? 'No open reports. The stands are behaving.' : ''}</p></div>}
          {items?.map(item => {
            const key = `${item.type}:${item.id}`;
            const urgent = Boolean(item.reasons.minor_safety);
            return (
              <article key={key} className={`mod-card${urgent ? ' urgent' : ''}`}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge">{TYPE[item.type]}</span>
                  {Object.entries(item.reasons).map(([r, n]) => <span key={r} className={`badge${r === 'minor_safety' ? ' flare' : ''}`}>{REASON[r] ?? r}{n > 1 ? ` ×${n}` : ''}</span>)}
                  {item.autoHidden && item.status === 'open' && <span className="badge sky">Auto-hidden</span>}
                  {item.status !== 'open' && <span className="badge">{item.resolution}</span>}
                  <div className="spacer" />
                  <span className="muted" style={{ fontSize: 12 }}>{item.reporters} {item.reporters === 1 ? 'reporter' : 'reporters'} · {timeAgo(item.lastAt)}</span>
                </div>
                <div className="mod-snapshot">
                  {item.snapshot?.image && <img src={item.snapshot.image} alt="" />}
                  <div style={{ minWidth: 0 }}>
                    {item.snapshot?.title && <strong>{item.snapshot.title}</strong>}
                    {item.snapshot?.body && <p>{item.snapshot.body}</p>}
                    <span className="muted" style={{ fontSize: 13 }}>
                      by {item.author ? <Link href={`/u/${item.author}`}>@{item.author}</Link> : 'unknown'}{item.authorBanned && ' (banned)'}
                      {item.link && <> · <Link href={item.link} target="_blank">View in context ↗</Link></>}
                    </span>
                  </div>
                </div>
                {item.notes.length > 0 && <ul className="mod-notes">{item.notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {item.status === 'open' ? (
                    <>
                      {item.type !== 'user' && <button className="btn btn-sm btn-remove" disabled={busy === key} onClick={() => act(item, '/v1/mod/resolve', { type: item.type, id: item.id, action: 'remove' })}>Remove</button>}
                      <button className="btn btn-sm" disabled={busy === key} onClick={() => act(item, '/v1/mod/resolve', { type: item.type, id: item.id, action: 'dismiss' })}>
                        {item.autoHidden ? 'Dismiss & restore' : 'Dismiss'}
                      </button>
                    </>
                  ) : item.resolution === 'removed' && item.type !== 'user' && (
                    <button className="btn btn-sm" disabled={busy === key} onClick={() => act(item, '/v1/mod/restore', { type: item.type, id: item.id })}>Restore</button>
                  )}
                  {item.author && (
                    <button className="btn btn-sm btn-ghost" disabled={busy === key}
                      onClick={() => act(item, `/v1/mod/users/${item.author}/ban`, { banned: !item.authorBanned, note: `${TYPE[item.type]} report` },
                        item.authorBanned ? `Unban @${item.author}?` : `Ban @${item.author}? They’ll be signed out and can’t sign back in.`)}>
                      {item.authorBanned ? 'Unban author' : 'Ban author'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === 'team' && (
        <div className="stack" style={{ gap: 20, marginTop: 16 }}>
          {!team && <div className="skeleton" style={{ height: 160 }} />}
          {team && (
            <>
              <section className="panel stack" style={{ gap: 10 }}>
                <strong>Team</strong>
                <p className="muted" style={{ margin: 0 }}>Admins (server config): {team.admins.map(a => `@${a}`).join(', ') || 'none'}</p>
                {team.team.length ? team.team.map(m => <div key={m.handle} className="row"><Link href={`/u/${m.handle}`}>@{m.handle}</Link><span className="badge">{m.role}</span></div>)
                  : <p className="muted" style={{ margin: 0 }}>No moderators appointed yet.</p>}
                {role === 'admin' && (
                  <form className="row" onSubmit={appointMod} style={{ gap: 8 }}>
                    <input className="input" value={appoint} onChange={e => setAppoint(e.target.value)} placeholder="@handle" aria-label="Handle to make a moderator" />
                    <button className="btn btn-primary btn-sm" disabled={!appoint.trim()}>Make moderator</button>
                  </form>
                )}
              </section>
              <section className="panel stack" style={{ gap: 6 }}>
                <strong>Recent actions</strong>
                {team.log.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>}
                {team.log.map((a, i) => (
                  <div key={i} className="mod-log"><span className="muted">{timeAgo(a.at)}</span> @{a.moderator} <strong>{a.action}</strong> {TYPE[a.type]?.toLowerCase() ?? a.type} {a.type === 'user' ? `@${a.id}` : a.id}{a.note && <span className="muted"> · {a.note}</span>}</div>
                ))}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
