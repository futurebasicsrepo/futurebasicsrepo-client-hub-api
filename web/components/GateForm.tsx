'use client';

import { useState } from 'react';
import type { User } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** The private-preview password page. Covers the whole screen; nothing else on the site loads until it's passed. */
export default function GateForm({ next }: { next: string }) {
  const { signIn } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Couldn’t sign in.');
      if (data.token && data.user) signIn(data.token as string, data.user as User);
      window.location.replace(next); // full load, so the proxy sees the new cookie
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="logo gate-logo">INCHA<span className="tv">.TV</span></div>
        <p className="mono muted gate-kicker">Private preview</p>
        <h1 className="display">Coming soon to the stands</h1>
        <p className="muted">incha.tv is invite-only for now. Sign in with your account to continue.</p>
        <input className="input" type="text" autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} placeholder="Email or handle" aria-label="Email or handle" autoFocus />
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" aria-label="Password" />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !login || !password}>{busy ? 'Checking…' : 'Enter'}</button>
        <p className="muted gate-foot">En las buenas y en las malas.</p>
      </form>
    </div>
  );
}
