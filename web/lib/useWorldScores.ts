'use client';

import { useEffect, useState } from 'react';
import { api, type WorldScores } from './api';

/** World scores for a day (YYYY-MM-DD, or today), refreshed every 20s while the page is visible. */
export function useWorldScores(date?: string, poll = true) {
  const [data, setData] = useState<WorldScores | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    const load = () => api<WorldScores>(`/v1/world/scores${date ? `?date=${date}` : ''}`)
      .then(d => { if (!cancelled) { setData(d); setError(''); } })
      .catch(err => { if (!cancelled) setError(err.message); });
    load();
    if (!poll) return () => { cancelled = true; };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [date, poll]);
  return { data, error };
}
