'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, SITE_URL, type Fixture, type TournamentDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/useNow';
import { StatusPill } from '@/components/MatchCard';
import { STATUS_TEXT, dateText } from '@/components/TournamentCard';

type Row = { number: string; name: string; position: string };
const blankRows = (n: number): Row[] => Array.from({ length: n }, () => ({ number: '', name: '', position: '' }));

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<TournamentDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(() => api<TournamentDetail>(`/v1/tournaments/${id}`).then(setData).catch(() => setMissing(true)), [id]);
  useEffect(() => { if (ready) load(); }, [ready, user, load]);
  // Results come in from the matches; refresh while games are being played.
  const inProgress = data?.tournament.status === 'in_progress';
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20_000);
    return () => clearInterval(timer);
  }, [inProgress, load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      const next = await api<TournamentDetail | undefined>(`/v1/tournaments/${id}${path}`, { method, body });
      if (next) setData(next);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">Tournament not found</div><Link href="/tournaments" className="btn">Browse tournaments</Link></div></div>;
  if (!data) return <div className="wrap"><div className="skeleton" style={{ height: 200, marginTop: 40 }} /></div>;

  const { tournament: t, teams, rounds } = data;
  const url = `${SITE_URL}/tournaments/${t.id}`;
  async function share() {
    if (typeof navigator.share === 'function') { navigator.share({ title: t.name, text: `${t.name} on incha.tv`, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); setToast('Link copied'); } catch { window.prompt('Copy this link', url); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${t.name}? Registered teams keep their rosters.`)) return;
    if (await run('', 'DELETE')) router.push('/tournaments');
  }

  return (
    <div className="wrap">
      <section className="hero" style={{ paddingTop: 32 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge${t.status === 'registration' ? ' flare' : ''}`}>{STATUS_TEXT[t.status]}</span>
          {t.youth && <span className="badge sky">Youth · unlisted</span>}
          {!t.youth && t.visibility === 'unlisted' && <span className="badge">Unlisted</span>}
        </div>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 7vw, 88px)', marginTop: 12 }}>{t.name}</h1>
        <p className="mono muted" style={{ margin: '12px 0 0' }}>{dateText(t.startsAt)}{t.venue ? ` · ${t.venue}` : ''} · {t.halfLength}-min halves · run by <Link href={`/u/${t.organizer.handle}`}>@{t.organizer.handle}</Link></p>
        {t.description && <p style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-sm" onClick={share}>↗ Share</button>
          {t.canManage && t.status === 'registration' && <button className="btn btn-sm" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      </section>

      {t.champion && (
        <div className="champion" style={{ marginTop: 24 }}>
          <span style={{ fontSize: 32 }}>🏆</span>
          <div><span className="mono muted">Champions</span><div className="display"><Link href={`/t/${t.champion.slug}`}>{t.champion.name}</Link></div></div>
        </div>
      )}

      {rounds.length > 0 && <Bracket rounds={rounds} canManage={t.canManage} busy={busy} onWinner={(f, team) => run(`/fixtures/${f.id}/winner`, 'POST', { team })} />}

      {t.status === 'registration' && (
        <>
          {t.canManage && <StartPanel data={data} busy={busy} onStart={body => run('/start', 'POST', body)} />}
          <Register tournamentId={t.id} full={t.teamCount >= t.teamLimit} signedIn={Boolean(user)} busy={busy}
            onSubmit={async body => { const ok = await run('/teams', 'POST', body); if (ok) setToast('You’re in'); return ok; }} />
        </>
      )}

      <h2 className="display" style={{ fontSize: 28, margin: '32px 0 12px' }}>Teams <span className="muted">{t.teamCount}/{t.teamLimit}</span></h2>
      {teams.length ? (
        <table className="roster-table" style={{ marginBottom: 48 }}>
          <thead><tr><th>Seed</th><th>Team</th><th>Players</th><th>Registered by</th><th /></tr></thead>
          <tbody>
            {teams.map(team => (
              <tr key={team.slug}>
                <td className="mono">{team.seed ?? ''}</td>
                <td><Link href={`/t/${team.slug}`}>{team.name}</Link></td>
                <td className="muted">{team.players}</td>
                <td className="muted">{team.registeredBy ? `@${team.registeredBy}` : ''}</td>
                <td>{team.canWithdraw && <button className="linkish" disabled={busy} onClick={() => window.confirm(`Withdraw ${team.name}?`) && run(`/teams/${team.slug}`, 'DELETE')}>Withdraw</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted" style={{ marginBottom: 48 }}>No teams yet. Share the link with coaches and captains.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Bracket({ rounds, canManage, busy, onWinner }: {
  rounds: TournamentDetail['rounds']; canManage: boolean; busy: boolean; onWinner: (f: Fixture, team: string | null) => void;
}) {
  const live = rounds.some(r => r.fixtures.some(f => f.match?.status === 'live'));
  const now = useNow(live, 15_000);
  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="display" style={{ fontSize: 28, margin: '0 0 12px' }}>Bracket</h2>
      <div className="bracket">
        {rounds.map(round => (
          <div key={round.round} className="bracket-round">
            <h3 className="display muted">{round.name}</h3>
            <div className="bracket-fixtures">
              {round.fixtures.map(f => {
                const m = f.match;
                const score = (side: 'home' | 'away') => (m && m.period !== 'pre' ? (side === 'home' ? m.homeScore : m.awayScore) : null);
                const draw = m?.period === 'ft' && m.homeScore === m.awayScore;
                return (
                  <div key={f.id} className="fixture">
                    {(['home', 'away'] as const).map(side => {
                      const team = f[side];
                      const state = !team ? ' tbd' : f.winner ? (f.winner === team.slug ? ' won' : ' lost') : '';
                      return (
                        <div key={side} className={`fixture-team${state}`}>
                          <span>{team ? <Link href={`/t/${team.slug}`}>{team.name}</Link> : f.bye ? 'Bye' : 'TBD'}</span>
                          {score(side) !== null && <strong>{score(side)}</strong>}
                        </div>
                      );
                    })}
                    {(m || (canManage && f.home && f.away && !f.bye)) && (
                      <div className="fixture-foot">
                        {m && <Link href={`/m/${m.id}`}><StatusPill match={m} now={now} /></Link>}
                        {draw && !f.winner && <span className="muted">Draw: organizer picks</span>}
                        {f.decided === 'organizer' && <span className="muted">Organizer’s call</span>}
                        <div className="spacer" />
                        {canManage && f.home && f.away && !f.bye && (
                          <select aria-label="Winner" disabled={busy} value={f.decided === 'organizer' ? f.winner ?? '' : ''}
                            onChange={e => onWinner(f, e.target.value || null)}>
                            <option value="">{f.decided === 'organizer' ? 'Go by the score' : 'Set winner…'}</option>
                            <option value={f.home.slug}>{f.home.name}</option>
                            <option value={f.away.slug}>{f.away.name}</option>
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {canManage && <p className="hint">Winners move on at full time. For a draw (penalties) or a no-show, set the winner here. Add co-scorekeepers on each match so games can run at the same time.</p>}
    </section>
  );
}

function StartPanel({ data, busy, onStart }: { data: TournamentDetail; busy: boolean; onStart: (body: unknown) => void }) {
  const [seeding, setSeeding] = useState<'registration' | 'random' | 'order'>('random');
  const [order, setOrder] = useState(() => data.teams.map(t => t.slug));
  useEffect(() => { setOrder(data.teams.map(t => t.slug)); }, [data.teams]);
  const names = new Map(data.teams.map(t => [t.slug, t.name]));
  const move = (i: number, by: number) => setOrder(list => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });
  const n = data.teams.length;
  let size = 2;
  while (size < n) size *= 2;
  return (
    <section className="panel stack" style={{ marginTop: 32 }}>
      <span className="mono muted">Organizer</span>
      <strong>Draw the bracket</strong>
      <p className="muted" style={{ margin: 0 }}>
        {n < 2 ? 'At least two teams need to register first.'
          : `${n} teams → a ${size}-team bracket${size > n ? `, with ${size - n} bye${size - n === 1 ? '' : 's'} for the top seed${size - n === 1 ? '' : 's'}` : ''}. Registration closes when you draw.`}
      </p>
      <div className="segmented" role="group" aria-label="Seeding" style={{ alignSelf: 'flex-start' }}>
        {([['random', 'Random draw'], ['registration', 'Sign-up order'], ['order', 'Set seeds']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={seeding === k} onClick={() => setSeeding(k)}>{label}</button>
        ))}
      </div>
      {seeding === 'order' && (
        <ol className="stack" style={{ gap: 6, margin: 0, paddingLeft: 24 }}>
          {order.map((slug, i) => (
            <li key={slug}>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ flex: 1 }}>{names.get(slug)}</span>
                <button className="btn btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn btn-sm" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button className="btn btn-primary" disabled={busy || n < 2} onClick={() => window.confirm('Close registration and draw the bracket?') && onStart(seeding === 'order' ? { seeding, order } : { seeding })}>
        Close registration and draw
      </button>
    </section>
  );
}

function Register({ tournamentId, full, signedIn, busy, onSubmit }: {
  tournamentId: string; full: boolean; signedIn: boolean; busy: boolean; onSubmit: (body: unknown) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>(() => blankRows(5));
  const set = (i: number, patch: Partial<Row>) => setRows(list => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (full) return <p className="panel muted" style={{ marginTop: 32 }}>This tournament is full.</p>;
  if (!signedIn) {
    return (
      <div className="panel row" style={{ marginTop: 32 }}>
        <span style={{ flex: 1 }}>Registration is open. Sign in to enter your team.</span>
        <Link href={`/login?next=/tournaments/${tournamentId}`} className="btn btn-primary btn-sm">Sign in to register</Link>
      </div>
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const players = rows.filter(r => r.name.trim()).map(r => ({ name: r.name, number: r.number === '' ? null : Number(r.number), position: r.position }));
    if (await onSubmit({ name, players })) { setName(''); setRows(blankRows(5)); }
  }
  return (
    <form className="panel stack" style={{ marginTop: 32 }} onSubmit={submit}>
      <span className="mono muted">Register a team</span>
      <div className="field"><label htmlFor="team-name">Team name</label><input id="team-name" className="input" value={name} onChange={e => setName(e.target.value)} required maxLength={60} placeholder="Fishtown FC" /></div>
      <div className="field">
        <label>Roster <span className="muted">(you can edit it later on the team page)</span></label>
        <div className="roster-rows">
          {rows.map((r, i) => (
            <div key={i} className="roster-add">
              <input className="input" value={r.number} onChange={e => set(i, { number: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" placeholder="#" aria-label={`Player ${i + 1} number`} />
              <input className="input" value={r.name} onChange={e => set(i, { name: e.target.value })} maxLength={60} placeholder="Player name" aria-label={`Player ${i + 1} name`} />
              <input className="input" value={r.position} onChange={e => set(i, { position: e.target.value })} maxLength={20} placeholder="Position" aria-label={`Player ${i + 1} position`} list="positions" />
            </div>
          ))}
          <datalist id="positions">{['GK', 'DF', 'MF', 'FW'].map(p => <option key={p} value={p} />)}</datalist>
        </div>
        {rows.length < 40 && <button type="button" className="linkish" style={{ alignSelf: 'flex-start' }} onClick={() => setRows(list => [...list, ...blankRows(Math.min(5, 40 - list.length))])}>+ More players</button>}
      </div>
      <p className="hint">You’ll manage this team: its roster, and who else can manage it. If the team already exists on incha.tv, you need to be one of its managers.</p>
      <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Registering…' : 'Register team'}</button>
    </form>
  );
}
