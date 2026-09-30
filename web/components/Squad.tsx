'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, type Player, type Position, type TeamPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const POSITIONS: [Position, string][] = [['', '—'], ['GK', 'GK'], ['DF', 'DF'], ['MF', 'MF'], ['FW', 'FW']];
type Draft = { name: string; number: string; position: Position };
const blank: Draft = { name: '', number: '', position: '' };
const toBody = (d: Draft) => ({ name: d.name, number: d.number === '' ? null : Number(d.number), position: d.position });

function PlayerForm({ initial = blank, submit, label, onCancel }: { initial?: Draft; submit: (d: Draft) => Promise<void>; label: string; onCancel?: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form className="squad-form" onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      try { await submit(draft); setDraft(blank); } catch { /* shown by the parent */ } finally { setBusy(false); }
    }}>
      <input className="input squad-num" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={draft.number} onChange={e => setDraft({ ...draft, number: e.target.value.replace(/\D/g, '') })} placeholder="#" aria-label="Shirt number" />
      <input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={60} placeholder="Player name" aria-label="Player name" required />
      <select className="select squad-pos" value={draft.position} onChange={e => setDraft({ ...draft, position: e.target.value as Position })} aria-label="Position">
        {POSITIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      <button className="btn btn-sm btn-primary" disabled={busy || !draft.name.trim()}>{label}</button>
      {onCancel && <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

/** A team's squad list. Managers add, edit and remove players, and the owner appoints managers. */
export default function Squad({ data, onChange }: { data: TeamPage; onChange: (next: TeamPage) => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [handle, setHandle] = useState('');
  const { team, canManage, isOwner } = data;
  const base = `/v1/teams/${team.slug}`;

  async function run<T>(fn: () => Promise<T>) {
    setError('');
    try { return await fn(); } catch (err) { setError((err as Error).message); throw err; }
  }
  const setRoster = (roster: Player[]) => onChange({ ...data, roster, rosterCount: roster.length });

  const add = (d: Draft) => run(async () => setRoster((await api<{ roster: Player[] }>(`${base}/players`, { method: 'POST', body: toBody(d) })).roster));
  const save = (id: number) => (d: Draft) => run(async () => { setRoster((await api<{ roster: Player[] }>(`${base}/players/${id}`, { method: 'PATCH', body: toBody(d) })).roster); setEditing(null); });
  async function remove(p: Player) {
    if (!window.confirm(`Remove ${p.name} from the squad? Goals already logged keep their name.`)) return;
    await run(async () => setRoster((await api<{ roster: Player[] }>(`${base}/players/${p.id}`, { method: 'DELETE' })).roster)).catch(() => {});
  }
  async function toggleYouth() {
    await run(async () => {
      const { team: next } = await api<{ team: TeamPage['team'] }>(base, { method: 'PATCH', body: { youth: !team.youth } });
      onChange({ ...data, team: next });
    }).catch(() => {});
  }
  async function addManager(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const { managers } = await api<{ managers: TeamPage['managers'] }>(`${base}/managers`, { method: 'POST', body: { handle } });
      onChange({ ...data, managers });
      setHandle('');
    }).catch(() => {});
  }
  async function removeManager(h: string) {
    const self = h === user?.handle;
    if (!window.confirm(self ? `Stop managing ${team.name}?` : `Remove @${h} as a manager?`)) return;
    await run(async () => {
      const { managers } = await api<{ managers: TeamPage['managers'] }>(`${base}/managers/${h}`, { method: 'DELETE' });
      onChange({ ...data, managers, canManage: self ? false : data.canManage });
    }).catch(() => {});
  }

  const scorers = data.roster.filter(p => (p.goals ?? 0) > 0).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 3);

  return (
    <section className="squad">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 className="display" style={{ fontSize: 28, margin: '24px 0 12px' }}>Squad</h2>
        <div className="spacer" />
        {data.rosterCount > 0 && <span className="mono muted">{data.rosterCount} {data.rosterCount === 1 ? 'player' : 'players'}</span>}
      </div>
      {data.rosterHidden ? (
        <p className="muted">Youth squad: names are only shown to the team’s managers.</p>
      ) : !data.roster.length ? (
        <p className="muted">{canManage ? 'Add your players so scorekeepers can tap who scored.' : 'No squad listed yet.'}</p>
      ) : (
        <>
          {scorers.length > 0 && (
            <div className="squad-scorers">
              {scorers.map((p, i) => <span key={p.id} className={`badge${i === 0 ? ' flare' : ''}`}>⚽ {p.name} · {p.goals}</span>)}
            </div>
          )}
          <ul className="squad-list">
            {data.roster.map(p => editing === p.id ? (
              <li key={p.id}>
                <PlayerForm initial={{ name: p.name, number: p.number == null ? '' : String(p.number), position: p.position }} submit={save(p.id)} label="Save" onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={p.id}>
                <span className="squad-shirt">{p.number ?? '–'}</span>
                <span className="squad-name">{p.name}</span>
                {p.position && <span className="badge">{p.position}</span>}
                {(p.goals ?? 0) > 0 && <span className="mono muted" title="Goals">{p.goals} ⚽</span>}
                {canManage && (
                  <span className="squad-actions">
                    <button className="linkish" onClick={() => setEditing(p.id)}>Edit</button>
                    <button className="linkish" onClick={() => remove(p)}>Remove</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {canManage && <PlayerForm submit={add} label="Add" />}
      {error && <p className="error" role="alert">{error}</p>}

      {(canManage || data.managers.length > 0) && (
        <div className="squad-staff">
          <span className="mono muted">Managers</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {data.managers.map(m => (
              <span key={m.handle} className="chip">
                <Link href={`/u/${m.handle}`}>@{m.handle}</Link>{m.owner && ' · owner'}
                {!m.owner && (isOwner || m.handle === user?.handle) && <button className="linkish" aria-label={`Remove @${m.handle}`} onClick={() => removeManager(m.handle)}>✕</button>}
              </span>
            ))}
          </div>
          {isOwner && data.managers.length < 6 && (
            <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={addManager}>
              <input className="input" value={handle} onChange={e => setHandle(e.target.value)} maxLength={25} placeholder="@handle of a coach or captain" aria-label="Manager handle" autoCapitalize="none" autoCorrect="off" />
              <button className="btn btn-sm" disabled={!handle.trim()}>Add</button>
            </form>
          )}
          {canManage && (
            <label className="check">
              <input type="checkbox" checked={team.youth} onChange={toggleYouth} disabled={team.youth && !isOwner} />
              <span><strong>Youth team (under 18)</strong><br /><span className="muted">Only managers see player names.</span></span>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
