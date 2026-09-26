'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compact } from '@/lib/format';

export default function UpvoteButton({ postId, score, voted, disabled }: { postId: string; score: number; voted: boolean; disabled?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState({ score, voted });
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!user) { router.push(`/login?next=/p/${postId}`); return; }
    const next = !state.voted;
    const previous = state;
    setState({ score: state.score + (next ? 1 : -1), voted: next }); // optimistic
    setBusy(true);
    try {
      const result = await api<{ score: number; viewerHasVoted: boolean }>(`/v1/posts/${postId}/vote`, { method: 'POST', body: { value: next ? 1 : 0 } });
      setState({ score: result.score, voted: result.viewerHasVoted });
    } catch {
      setState(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn upvote" aria-pressed={state.voted} onClick={toggle} disabled={busy || disabled} aria-label={state.voted ? 'Remove upvote' : 'Upvote'}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 14 10H10V14H6V10H2Z" fill="currentColor" /></svg>
      {compact(state.score)}
    </button>
  );
}
