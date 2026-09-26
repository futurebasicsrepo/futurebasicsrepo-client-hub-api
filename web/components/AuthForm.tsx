'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ token: string; user: User }>(`/v1/auth/${mode}`, { method: 'POST', body: form });
      signIn(data.token, data.user);
      router.push(mode === 'signup' && safeNext === '/' ? '/upload' : safeNext);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="wrap">
      <div className="auth-card">
        <h1 className="display">{mode === 'login' ? 'Welcome back' : 'Join the hinchada'}</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to post, upvote, and comment.' : 'Create your incha.tv account. It takes ten seconds.'}</p>
        <form className="stack" onSubmit={submit} style={{ marginTop: 24 }}>
          {mode === 'signup' ? (
            <>
              <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required autoComplete="email" /></div>
              <div className="field">
                <label htmlFor="handle">Handle</label>
                <input id="handle" name="handle" className="input" required pattern="@?[A-Za-z0-9_]{3,24}" placeholder="sectionb_sergio" autoComplete="username" />
                <span className="hint">3–24 letters, numbers, or underscores. This is your @name.</span>
              </div>
              <div className="field"><label htmlFor="displayName">Display name</label><input id="displayName" name="displayName" className="input" maxLength={60} placeholder="Sergio" /></div>
            </>
          ) : (
            <div className="field"><label htmlFor="login">Email or handle</label><input id="login" name="login" className="input" required autoComplete="username" /></div>
          )}
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'One sec…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="muted" style={{ marginTop: 20 }}>
          {mode === 'login'
            ? <>New here? <Link href={`/signup${suffix}`} style={{ color: 'var(--flare)' }}>Create an account</Link></>
            : <>Already have an account? <Link href={`/login${suffix}`} style={{ color: 'var(--flare)' }}>Sign in</Link></>}
        </p>
      </div>
    </div>
  );
}
