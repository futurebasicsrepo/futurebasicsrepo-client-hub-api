'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type TournamentDetail } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';

// datetime-local wants local time without a zone.
const localNow = () => { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(0); d.setHours(d.getHours() + 1); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

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
      const { tournament } = await api<TournamentDetail>('/v1/tournaments', {
        method: 'POST',
        body: { ...form, halfLength: Number(form.halfLength), teamLimit: Number(form.teamLimit), startsAt: new Date(form.startsAt).toISOString(), youth }
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
      <p className="muted">Teams register with their rosters. When you’re ready, draw a knockout bracket and every game becomes a live match you can score.</p>
      <form className="panel stack" onSubmit={submit} style={{ marginTop: 24, gap: 16 }}>
        <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" className="input" required maxLength={80} placeholder="Kensington Summer Cup" /></div>
        <div className="field"><label htmlFor="venue">Where</label><input id="venue" name="venue" className="input" maxLength={120} placeholder="FDR Park, Fields 1–4" /></div>
        <div className="field"><label htmlFor="description">Details for teams (optional)</label><textarea id="description" name="description" className="textarea" maxLength={2000} rows={3} placeholder="Entry fee, age groups, rules, what to bring" /></div>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 2, minWidth: 200 }}><label htmlFor="startsAt">Starts</label><input id="startsAt" name="startsAt" type="datetime-local" className="input" defaultValue={localNow()} required /></div>
          <div className="field" style={{ flex: 1, minWidth: 110 }}>
            <label htmlFor="teamLimit">Teams</label>
            <select id="teamLimit" name="teamLimit" className="select" defaultValue="16">
              {[4, 6, 8, 12, 16, 24, 32].map(n => <option key={n} value={n}>Up to {n}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 110 }}>
            <label htmlFor="halfLength">Half length</label>
            <select id="halfLength" name="halfLength" className="select" defaultValue="20">
              {[10, 15, 20, 25, 30, 35, 40, 45].map(n => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
        </div>
        <p className="hint">Knockout format. If fewer teams sign up than a full bracket, the top seeds get byes into round two.</p>
        <label className="check">
          <input type="checkbox" checked={youth} onChange={e => setYouth(e.target.checked)} />
          <span><strong>Youth tournament (under 18)</strong><br /><span className="muted">Kept off public lists, matches are unlisted, and team rosters are private to their managers.</span></span>
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
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Open registration'}</button>
      </form>
    </div>
  );
}
