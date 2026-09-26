'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, API_URL, SITE_URL, type MatchEvent, type MatchSnapshot, type Post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { matchClock, scoreline } from '@/lib/clock';
import { useNow } from '@/lib/useNow';
import { Thumb } from './PostCard';
import { StatusPill } from './MatchCard';
import LivePlayer from './LivePlayer';

const EVENT_ICON: Record<MatchEvent['type'], string> = {
  goal: '⚽', yellow: '🟨', red: '🟥', note: '📝', kickoff: '⏱', halftime: '⏸', second_half: '▶', fulltime: '🏁'
};
const PERIOD_TEXT: Partial<Record<MatchEvent['type'], string>> = {
  kickoff: 'Kick-off', halftime: 'Half time', second_half: 'Second half underway', fulltime: 'Full time'
};

type Item = { kind: 'event'; minute: number; at: string; event: MatchEvent } | { kind: 'clip'; minute: number; at: string; clip: Post };

const minuteLabel = (e: { minute: number | null; stoppage?: number }) =>
  e.minute == null ? '' : e.stoppage ? `${e.minute}+${e.stoppage}'` : `${e.minute}'`;

export default function MatchView({ id }: { id: string }) {
  const { user, ready } = useAuth();
  const [snap, setSnap] = useState<MatchSnapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [player, setPlayer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [connected, setConnected] = useState(true);
  const [angle, setAngle] = useState<string | null>(null);
  const canScore = useRef(false);
  const skew = useRef(0);

  // Initial load carries the viewer's identity (scorekeeper rights); the stream is anonymous.
  useEffect(() => {
    if (!ready) return;
    api<MatchSnapshot>(`/v1/matches/${id}`)
      .then(data => { canScore.current = Boolean(data.match.canScore); skew.current = Date.parse(data.serverTime) - Date.now(); setSnap(data); })
      .catch(() => setMissing(true));
  }, [id, ready, user]);

  useEffect(() => {
    const source = new EventSource(`${API_URL}/v1/matches/${id}/stream`);
    source.addEventListener('update', event => {
      const data = JSON.parse((event as MessageEvent).data) as MatchSnapshot;
      skew.current = Date.parse(data.serverTime) - Date.now();
      setSnap({ ...data, match: { ...data.match, canScore: canScore.current } });
      setConnected(true);
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const live = snap?.match.status === 'live';
  const now = useNow(live) + skew.current;

  const items = useMemo<Item[]>(() => {
    if (!snap) return [];
    const list: Item[] = [
      ...snap.events.map(event => ({ kind: 'event' as const, minute: event.minute ?? (event.type === 'fulltime' ? 999 : 0), at: event.createdAt, event })),
      ...snap.clips.map(clip => ({ kind: 'clip' as const, minute: clip.matchMinute ?? 998, at: clip.publishedAt || clip.createdAt, clip }))
    ];
    // Newest first, like a live blog.
    return list.sort((a, b) => b.minute - a.minute || Date.parse(b.at) - Date.parse(a.at));
  }, [snap]);

  if (missing) {
    return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">No such match</div><Link href="/matches" className="btn">Browse matches</Link></div></div>;
  }
  if (!snap) return <div className="wrap"><div className="skeleton" style={{ height: 220, marginTop: 24 }} /></div>;

  const { match } = snap;
  const clock = matchClock(match, now);
  const url = `${SITE_URL}/m/${match.id}`;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const data = await api<MatchSnapshot>(`/v1/matches/${id}/events`, { method: 'POST', body: { ...body, player: player || undefined } });
      setSnap({ ...data, match: { ...data.match, canScore: true } });
      setPlayer('');
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function undo(eventId: number) {
    if (!window.confirm('Remove this from the match?')) return;
    try {
      const data = await api<MatchSnapshot>(`/v1/matches/${id}/events/${eventId}`, { method: 'DELETE' });
      setSnap({ ...data, match: { ...data.match, canScore: true } });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function share() {
    const text = `${scoreline({ home: match.home.name, away: match.away.name, homeScore: match.homeScore, awayScore: match.awayScore })}${live ? ' · LIVE' : ''} on incha.tv`;
    if (typeof navigator.share === 'function') { navigator.share({ title: text, text, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); setToast('Link copied'); } catch { window.prompt('Copy this link', url); }
  }

  const next = { pre: ['kickoff', 'Kick off'], '1h': ['halftime', 'Half time'], ht: ['second_half', 'Start 2nd half'], '2h': ['fulltime', 'Full time'], ft: null }[match.period] as [string, string] | null;
  const clipHref = user ? `/upload?match=${match.id}${clock ? `&minute=${clock.minute}` : ''}` : `/login?next=/m/${match.id}`;
  const canStream = !match.youth && match.period !== 'ft';
  const liveHref = user ? `/m/${match.id}/live` : `/login?next=/m/${match.id}/live`;
  const streams = snap.streams ?? [];
  const onAir = streams.find(s => s.id === angle) ?? streams[0];

  return (
    <div className="wrap match-page">
      {onAir && (
        <section className="live-section">
          <LivePlayer key={onAir.id} src={onAir.hlsUrl} label={`Live from @${onAir.streamer.handle}`} />
          <div className="row live-angles">
            {streams.length > 1 ? streams.map((s, i) => (
              <button key={s.id} className="chip" aria-pressed={s.id === onAir.id} onClick={() => setAngle(s.id)}>📹 Cam {i + 1} · @{s.streamer.handle}</button>
            )) : <span className="muted" style={{ fontSize: 13 }}>📹 Streaming from the sideline by @{onAir.streamer.handle}</span>}
          </div>
        </section>
      )}
      <section className="scoreboard">
        <div className="scoreboard-meta">
          <span className="mono">{match.competition || 'Friendly'}{match.venue ? ` · ${match.venue}` : ''}</span>
          {match.youth && <span className="badge sky">Youth · unlisted</span>}
        </div>
        <div className="scoreboard-main">
          <Link href={`/t/${match.home.slug}`} className="scoreboard-team">{match.home.name}</Link>
          <div className="scoreboard-score">
            {match.period === 'pre' ? <span className="display vs">vs</span>
              : <span className="display">{match.homeScore}<span className="dash">–</span>{match.awayScore}</span>}
            <StatusPill match={match} now={now} />
          </div>
          <Link href={`/t/${match.away.slug}`} className="scoreboard-team away">{match.away.name}</Link>
        </div>
        <div className="row scoreboard-actions">
          <button className="btn btn-sm" onClick={share}>↗ Share</button>
          <Link href={clipHref} className="btn btn-sm btn-primary">+ Add a clip</Link>
          {canStream && <Link href={liveHref} className="btn btn-sm golive-link"><i />Go live</Link>}
          {!connected && <span className="muted" style={{ fontSize: 12 }}>Reconnecting…</span>}
        </div>
      </section>

      {match.canScore && (
        <section className="panel keeper">
          <div className="row">
            <span className="mono muted">Scorekeeper</span>
            <div className="spacer" />
            {clock && <span className="mono">{clock.label}</span>}
          </div>
          {next && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => send({ type: next[0] })}>{next[1]}</button>
              {(match.period === '1h' || match.period === 'ht') && <button className="btn" disabled={busy} onClick={() => window.confirm('End the match now?') && send({ type: 'fulltime' })}>End match</button>}
            </div>
          )}
          {match.period !== 'pre' && (
            <>
              <input className="input" value={player} onChange={e => setPlayer(e.target.value)} maxLength={60} placeholder="Player or note (optional)" aria-label="Player" />
              <div className="keeper-grid">
                {(['home', 'away'] as const).map(side => (
                  <div key={side} className="stack" style={{ gap: 8 }}>
                    <span className="keeper-team">{match[side].name}</span>
                    <button className="btn btn-primary goal-btn" disabled={busy} onClick={() => send({ type: 'goal', side })}>⚽ Goal</button>
                    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => send({ type: 'yellow', side })}>🟨</button>
                      <button className="btn btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => send({ type: 'red', side })}>🟥</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="linkish" disabled={busy || !player.trim()} onClick={() => send({ type: 'note' })}>Post as a note instead</button>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}

      <section className="timeline">
        <h2 className="display">{live ? 'Live' : match.period === 'ft' ? 'Match story' : 'Timeline'}</h2>
        {!items.length && <p className="muted">{match.period === 'pre' ? 'Kick-off hasn’t happened yet. Follow along here, or add a pre-match clip from the stands.' : 'Nothing yet.'}</p>}
        {items.map(item => item.kind === 'clip' ? (
          <Link key={`c${item.clip.id}`} href={`/p/${item.clip.id}`} className="tl-item tl-clip">
            <span className="tl-minute">{item.clip.matchMinute != null ? `${item.clip.matchMinute}'` : ''}</span>
            <div className="tl-clip-body">
              <div className="thumb"><Thumb post={item.clip} /></div>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong>{item.clip.title}</strong>
                <span className="muted" style={{ fontSize: 13 }}>▶ clip by @{item.clip.creator.handle}</span>
              </div>
            </div>
          </Link>
        ) : PERIOD_TEXT[item.event.type] ? (
          <div key={`e${item.event.id}`} className="tl-divider"><span>{EVENT_ICON[item.event.type]} {PERIOD_TEXT[item.event.type]}{item.event.type === 'fulltime' ? ` · ${match.homeScore}–${match.awayScore}` : ''}</span></div>
        ) : (
          <div key={`e${item.event.id}`} className={`tl-item tl-${item.event.type}${item.event.side === 'away' ? ' away' : ''}`}>
            <span className="tl-minute">{minuteLabel(item.event)}</span>
            <div className="tl-body">
              <span className="tl-icon">{EVENT_ICON[item.event.type]}</span>
              <div>
                <strong>{item.event.type === 'goal' ? 'GOAL' : item.event.type === 'yellow' ? 'Yellow card' : item.event.type === 'red' ? 'Red card' : item.event.player}</strong>
                {item.event.side && <span className="muted"> · {match[item.event.side].name}</span>}
                {item.event.type !== 'note' && item.event.player && <div>{item.event.player}</div>}
              </div>
              {match.canScore && <button className="linkish" onClick={() => undo(item.event.id)}>Undo</button>}
            </div>
          </div>
        ))}
      </section>
      <p className="hint" style={{ paddingBottom: 48 }}>Scorekeeper: @{match.scorekeeper.handle}. Scores are kept by fans at the game, not an official source.</p>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
