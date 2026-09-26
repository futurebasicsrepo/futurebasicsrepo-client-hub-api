'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { enablePush, PUSH_HELP } from '@/lib/push';

interface Props {
  /** API path of the thing to follow, e.g. `/v1/matches/abc/follow` or `/v1/teams/kensington-fc/follow`. */
  path: string;
  following: boolean;
  onChange?: (following: boolean) => void;
  label?: string;
}

/** Follow a match or team. Following also offers to switch on phone alerts for this device. */
export default function FollowButton({ path, following, onChange, label = 'Follow' }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  async function toggle() {
    if (!user) { router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setBusy(true);
    setHint('');
    try {
      const next = !following;
      await api(path, { method: next ? 'POST' : 'DELETE' });
      onChange?.(next);
      if (next) {
        // Asking right after the tap keeps the permission prompt tied to a clear intent.
        const state = await enablePush().catch(() => null);
        if (state === null) setHint('You’re following. Alerts couldn’t be switched on just now; try again from your profile.');
        else if (state !== 'on' && state !== 'unconfigured') setHint(PUSH_HELP[state]);
      }
    } catch (err) {
      setHint((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="follow">
      <button className={`btn btn-sm follow-btn${following ? ' on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={following}>
        <span aria-hidden="true">{following ? '🔔' : '🔕'}</span> {following ? 'Following' : label}
      </button>
      {hint && <span className="follow-hint" role="status">{hint}</span>}
    </span>
  );
}
