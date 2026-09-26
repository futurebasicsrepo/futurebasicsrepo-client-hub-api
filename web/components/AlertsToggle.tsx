'use client';

import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, PUSH_HELP, type PushState } from '@/lib/push';

/** "Match alerts" row on your own profile: see and change this device's alert setting. */
export default function AlertsToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (!state || state === 'unconfigured') return null;

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (state === 'on') { await disablePush(); setState('off'); } else setState(await enablePush());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const actionable = state === 'on' || state === 'off';
  return (
    <div className="alerts-row panel">
      <div className="stack" style={{ gap: 2 }}>
        <strong>Match alerts on this device</strong>
        <span className="muted" style={{ fontSize: 13 }}>{failed ? 'Couldn’t switch alerts on just now. Check your connection and try again.' : state === 'on' ? 'Goals, kick-off, full time and go-live for teams and matches you follow.' : PUSH_HELP[state]}</span>
      </div>
      {actionable && <button className={`btn btn-sm${state === 'on' ? '' : ' btn-primary'}`} onClick={toggle} disabled={busy}>{state === 'on' ? 'Turn off' : 'Turn on'}</button>}
    </div>
  );
}
