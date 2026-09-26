'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** "Clip that": saves the last 30 seconds of a live stream as a clip on the match timeline. */
export default function ClipButton({ streamId, compact = false }: { streamId: string; compact?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'cutting'>('idle');
  const [result, setResult] = useState<{ id: string; duration: number } | null>(null);
  const [error, setError] = useState('');

  async function clip() {
    if (!user) { router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setState('cutting');
    setError('');
    setResult(null);
    try {
      const { post } = await api<{ post: { id: string; duration: number } }>(`/v1/streams/${streamId}/clip`, { method: 'POST' });
      setResult(post);
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setState('idle');
    }
  }

  return (
    <div className={`clip-wrap${compact ? ' compact' : ''}`}>
      <button className="btn btn-sm clip-btn" onClick={clip} disabled={state === 'cutting'} aria-label="Clip the last 30 seconds">
        {state === 'cutting' ? 'Clipping…' : '✂️ Clip that'}
      </button>
      {result && (
        <span className="clip-done" role="status">
          Clipped the last {Math.round(result.duration)}s · <Link href={`/p/${result.id}`}>View</Link> · <Link href={`/studio/${result.id}`}>Edit</Link>
        </span>
      )}
      {error && <span className="clip-error" role="alert">{error}</span>}
    </div>
  );
}
