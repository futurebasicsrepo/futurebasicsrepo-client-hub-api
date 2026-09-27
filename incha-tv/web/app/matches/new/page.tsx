'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type MatchSnapshot } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';

// datetime-local wants local time without a zone.
const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export default function NewMatchPage() {
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
      const { match } = await api<MatchSnapshot>('/v1/matches', {
        method: 'POST',
        body: { ...form, halfLength: Number(form.halfLength), kickoffAt: new Date(form.kickoffAt).toISOString(), youth, visibility: form.visibility }
      });
      router.push(`/m/${match.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <h1 className="display page-title">Start a match</h1>
      <p className="muted">You’ll be the scorekeeper. Tap goals and cards as they happen, and everyone following sees it live.</p>
      <form className="panel stack" onSubmit={submit} style={{ marginTop: 24, gap: 16 }}>
        <div className="versus">
          <div className="field"><label htmlFor="home">Home team</label><input id="home" name="home" className="input" required maxLength={60} placeholder="Rangers FC" /></div>
          <span className="display muted">vs</span>
          <div className="field"><label htmlFor="away">Away team</label><input id="away" name="away" className="input" required maxLength={60} placeholder="Kensington United" /></div>
        </div>
        <div className="field"><label htmlFor="competition">League or tournament</label><input id="competition" name="competition" className="input" maxLength={80} placeholder="Philly Sunday League" /></div>
        <div className="field"><label htmlFor="venue">Where</label><input id="venue" name="venue" className="input" maxLength={120} placeholder="FDR Park, Field 3" /></div>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 2, minWidth: 200 }}><label htmlFor="kickoffAt">Kick-off</label><input id="kickoffAt" name="kickoffAt" type="datetime-local" className="input" defaultValue={localNow()} required /></div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label htmlFor="halfLength">Half length</label>
            <select id="halfLength" name="halfLength" className="select" defaultValue="45">
              {[20, 25, 30, 35, 40, 45].map(n => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={youth} onChange={e => setYouth(e.target.checked)} />
          <span><strong>Youth match (under 18)</strong><br /><span className="muted">Kept off public lists. Only people with the link can follow, and clips can’t be public.</span></span>
        </label>
        {!youth && (
          <div className="field">
            <label htmlFor="visibility">Who can find it</label>
            <select id="visibility" name="visibility" className="select" defaultValue="public">
              <option value="public">Public: listed on Matches and team pages</option>
              <option value="unlisted">Unlisted: only people with the link</option>
            </select>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create match'}</button>
      </form>
    </div>
  );
}
