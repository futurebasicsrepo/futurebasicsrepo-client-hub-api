'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, playerLabel, type TeamRoster } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** A team's players with their goals and cards, and roster management for the team's managers. */
export default function RosterPanel({ slug, youth, roster, onChange }: {
  slug: string; youth: boolean; roster: TeamRoster; onChange: (roster: TeamRoster & { team?: { youth: boolean } }) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      onChange(await api<TeamRoster & { team?: { youth: boolean } }>(`/v1/teams/${slug}${path}`, { method, body }));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addPlayer(event: React.FormEvent) {
    event.preventDefault();
    if (await run('/players', 'POST', { name, number: number === '' ? null : Number(number), position })) {
      setName(''); setNumber(''); setPosition('');
    }
  }

  async function addManager(event: React.FormEvent) {
    event.preventDefault();
    if (await run('/managers', 'POST', { handle })) setHandle('');
  }

  const { players, canManage } = roster;
  return (
    <section className="roster">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 className="display" style={{ fontSize: 28, margin: '24px 0 12px' }}>Roster</h2>
        {youth && <span className="badge sky">Youth · private</span>}
      </div>
      {roster.rosterHidden ? (
        <p className="muted">This is a youth team: only its managers can see the players.</p>
      ) : players.length ? (
        <table className="roster-table">
          <thead><tr><th>#</th><th>Player</th><th>Pos</th><th className="n" title="Goals">⚽</th><th className="n" title="Yellow cards">🟨</th><th className="n" title="Red cards">🟥</th>{canManage && <th className="n" />}</tr></thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id}>
                <td className="mono">{p.number ?? ''}</td>
                <td>{p.name}</td>
                <td className="muted">{p.position}</td>
                <td className="n">{p.stats.goals || ''}</td>
                <td className="n">{p.stats.yellows || ''}</td>
                <td className="n">{p.stats.reds || ''}</td>
                {canManage && (
                  <td><button className="linkish" disabled={busy} onClick={() => window.confirm(`Take ${playerLabel(p)} off the roster? Their goals and cards stay in old matches.`) && run(`/players/${p.id}`, 'DELETE')}>Remove</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{canManage ? 'No players yet. Add your squad below.' : 'No players listed yet.'}</p>
      )}

      {canManage && (
        <div className="panel stack" style={{ marginTop: 16 }}>
          <form className="roster-add" onSubmit={addPlayer}>
            <input className="input" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="#" aria-label="Shirt number" />
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Player name" aria-label="Player name" required />
            <input className="input" value={position} onChange={e => setPosition(e.target.value)} maxLength={20} placeholder="Position" aria-label="Position" list="positions" />
            <datalist id="positions">{['GK', 'DF', 'MF', 'FW'].map(p => <option key={p} value={p} />)}</datalist>
            <button className="btn btn-primary" disabled={busy || !name.trim()}>Add</button>
          </form>
          <label className="check">
            <input type="checkbox" checked={youth} disabled={busy} onChange={e => run('', 'PATCH', { youth: e.target.checked })} />
            <span><strong>Youth team (under 18)</strong><br /><span className="muted">Only managers see the players and their stats.</span></span>
          </label>
          <div className="keepers">
            <span className="mono muted">Managers</span>
            <ul>
              {roster.managers.map(m => (
                <li key={m.handle}>
                  <Link href={`/u/${m.handle}`}>@{m.handle}</Link>
                  <button className="linkish" disabled={busy} onClick={() => window.confirm(m.handle === user?.handle ? 'Stop managing this team?' : `Remove @${m.handle} as a manager?`) && run(`/managers/${m.handle}`, 'DELETE')}>
                    {m.handle === user?.handle ? 'Step down' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
            <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={addManager}>
              <input className="input" value={handle} onChange={e => setHandle(e.target.value)} maxLength={25} placeholder="@handle of a coach or captain" aria-label="Manager handle" autoCapitalize="none" autoCorrect="off" />
              <button className="btn btn-sm" disabled={busy || !handle.trim()}>Add</button>
            </form>
          </div>
        </div>
      )}
      {!canManage && roster.managers.length > 0 && (
        <p className="hint">Managed by {roster.managers.map(m => `@${m.handle}`).join(', ')}.</p>
      )}
      {roster.claimable && (
        <div className="panel row" style={{ marginTop: 16 }}>
          <span className="muted" style={{ flex: 1, minWidth: 200 }}>Nobody manages this team yet. Coach or captain? Take it on to keep its roster.</span>
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run('/claim', 'POST')}>Manage this team</button>
        </div>
      )}
      {!user && !roster.managers.length && <p className="hint">Sign in to manage this team’s roster.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
