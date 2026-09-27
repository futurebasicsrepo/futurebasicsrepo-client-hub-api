'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { api } from '@/lib/api';

export const CHEERS = [
  { kind: 'flare', glyph: '🔥', label: 'Flare' },
  { kind: 'clap', glyph: '👏', label: 'Applause' },
  { kind: 'wow', glyph: '😱', label: 'What a moment' }
] as const;
export type CheerKind = (typeof CHEERS)[number]['kind'];
const GLYPH = Object.fromEntries(CHEERS.map(c => [c.kind, c.glyph])) as Record<CheerKind, string>;

type Flare = { id: number; glyph: string; x: number; drift: number; dur: number; size: number; mine: boolean };
const MAX_ON_SCREEN = 40;
let nextId = 1;

export interface CrowdHandle {
  /** Cheers pooled by the server from everyone watching. */
  receive: (counts: Partial<Record<CheerKind, number>>) => void;
}

/**
 * Cheers from the stands: flares float up the right edge for everyone watching a live match.
 * Your own taps launch instantly; the server's pooled echo skips the ones you already launched.
 */
const Crowd = forwardRef<CrowdHandle, { matchId: string; live: boolean }>(function Crowd({ matchId, live }, ref) {
  const [flares, setFlares] = useState<Flare[]>([]);
  const pending = useRef<Record<string, number>>({});

  const launch = useCallback((kind: CheerKind, count: number, mine: boolean) => {
    const shown = Math.min(count, mine ? 1 : 12);
    const fresh: Flare[] = Array.from({ length: shown }, (_, i) => ({
      id: nextId++,
      glyph: GLYPH[kind],
      x: Math.random() * 56,
      drift: (Math.random() - 0.5) * 70,
      dur: 2000 + Math.random() * 900 + i * 90,
      size: mine ? 34 : 22 + Math.random() * 12,
      mine
    }));
    setFlares(list => [...list, ...fresh].slice(-MAX_ON_SCREEN));
    const longest = Math.max(...fresh.map(f => f.dur));
    setTimeout(() => setFlares(list => list.filter(f => !fresh.includes(f))), longest + 100);
  }, []);

  useImperativeHandle(ref, () => ({
    receive(counts) {
      for (const { kind } of CHEERS) {
        const total = counts[kind] ?? 0;
        const own = Math.min(pending.current[kind] ?? 0, total);
        pending.current[kind] = (pending.current[kind] ?? 0) - own;
        if (total - own > 0) launch(kind, total - own, false);
      }
    }
  }), [launch]);

  function cheer(kind: CheerKind) {
    launch(kind, 1, true);
    pending.current[kind] = (pending.current[kind] ?? 0) + 1;
    if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
    api(`/v1/matches/${matchId}/cheer`, { method: 'POST', body: { kind } }).catch(() => {
      pending.current[kind] = Math.max(0, (pending.current[kind] ?? 0) - 1);
    });
  }

  return (
    <>
      <div className="crowd-sky" aria-hidden="true">
        {flares.map(f => (
          <span key={f.id} className={`crowd-flare${f.mine ? ' mine' : ''}`}
            style={{ right: `${f.x}px`, fontSize: f.size, animationDuration: `${f.dur}ms`, '--drift': `${f.drift}px` } as React.CSSProperties}>
            {f.glyph}
          </span>
        ))}
      </div>
      {live && (
        <div className="cheer-bar" role="group" aria-label="Cheer">
          {CHEERS.map(c => (
            <button key={c.kind} type="button" className="cheer-btn" onClick={() => cheer(c.kind)} aria-label={c.label}>{c.glyph}</button>
          ))}
        </div>
      )}
    </>
  );
});

export default Crowd;
