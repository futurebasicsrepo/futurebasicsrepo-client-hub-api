'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type TournamentView } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';

// datetime-local wants local time without a zone.
const localSoon = () => { const d = new Date(Date.now() + 7 * 86_400_000); d.setHours(10, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export default function NewTournamentPage() {
  const user = useRequireUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [youth, setYouth] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError('');
    try {
      const { tournament } = await api<TournamentView>('/v1/tournaments', {
        method: 'POST',
        body: {
          name: form.name, description: form.description, venue: form.venue,
          capacity: Number(form.capacity), halfLength: Number(form.halfLength), approval: form.approval,
          startsAt: new Date(form.startsAt).toISOString(), youth, visibility: form.visibility
        }
      });
      router.push(`/tournaments/${tournament.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <h1 className="display page-title">Run a tournament</h1>
      <p className="muted">Open sign-ups, share the link with the teams, then draw a knockout bracket. Every tie becomes a live match you keep score in, and winners move on at full time.</p>
      <form className="panel stack" onSubmit={submit} style={{ marginTop: 24, gap: 16 }}>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" className="input" required maxLength={80} placeholder="Kensington Summer Sevens" /></div>
        <div className="field"><label htmlFor="description">About (optional)</label><textarea id="description" name="description" className="textarea" rows={3} maxLength={2000} placeholder="Entry fee, rules, what to bring…" /></div>
        <div className="field"><label htmlFor="venue">Where</label><input id="venue" name="venue" className="input" maxLength={120} placeholder="FDR Park, Fields 1–3" /></div>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 2, minWidth: 200 }}><label htmlFor="startsAt">Starts</label><input id="startsAt" name="startsAt" type="datetime-local" className="input" defaultValue={localSoon()} required /></div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label htmlFor="halfLength">Half length</label>
            <select id="halfLength" name="halfLength" className="select" defaultValue="20">
              {[10, 15, 20, 25, 30, 35, 40, 45].map(n => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="capacity">Teams</label>
            <select id="capacity" name="capacity" className="select" defaultValue="8">
              {[4, 6, 8, 12, 16, 24, 32, 64].map(n => <option key={n} value={n}>Up to {n}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label htmlFor="approval">Sign-ups</label>
            <select id="approval" name="approval" className="select" defaultValue="manual">
              <option value="manual">I approve each team</option>
              <option value="auto">First come, first in</option>
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={youth} onChange={e => setYouth(e.target.checked)} />
          <span><strong>Youth tournament (under 18)</strong><br /><span className="muted">Kept off public lists, matches are unlisted, and squads are only visible to their managers.</span></span>
        </label>
        {!youth && (
          <div className="field">
            <label htmlFor="visibility">Who can find it</label>
            <select id="visibility" name="visibility" className="select" defaultValue="public">
              <option value="public">Public: listed on Tournaments</option>
              <option value="unlisted">Unlisted: only people with the link</option>
            </select>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Open sign-ups'}</button>
      </form>
    </div>
  );
}
