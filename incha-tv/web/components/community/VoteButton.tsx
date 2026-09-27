'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact } from '@/lib/format';

/** Reddit-style upvote for a thread or a reply: optimistic, one per person. */
export default function VoteButton({ path, score, voted, next, small = false }: {
  path: string; score: number; voted: boolean; next: string; small?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState({ score, voted });
  const [busy, setBusy] = useState(false);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) { router.push(`/login?next=${encodeURIComponent(next)}`); return; }
    const up = !state.voted;
    const previous = state;
    setState({ score: state.score + (up ? 1 : -1), voted: up });
    setBusy(true);
    try {
      const result = await api<{ score: number; viewerHasVoted: boolean }>(path, { method: 'POST', body: { value: up ? 1 : 0 } });
      setState({ score: result.score, voted: result.viewerHasVoted });
    } catch {
      setState(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={`vote${small ? ' vote-sm' : ''}`} aria-pressed={state.voted} onClick={toggle} disabled={busy}
      aria-label={state.voted ? 'Remove upvote' : 'Upvote'}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2 14 10H10V14H6V10H2Z" fill="currentColor" /></svg>
      <span>{compact(state.score)}</span>
    </button>
  );
}
