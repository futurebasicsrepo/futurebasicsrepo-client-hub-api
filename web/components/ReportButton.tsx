'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { api, type ReportType } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Mirrors api/src/moderation.js REPORT_REASONS.
const REASONS: [string, string][] = [
  ['spam', 'Spam or scam'],
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate or discrimination'],
  ['violence', 'Violence or threats'],
  ['sexual', 'Sexual content'],
  ['minor_safety', 'Puts a child at risk'],
  ['copyright', 'Copyright or broadcast rights'],
  ['other', 'Something else']
];
const NOUN: Record<ReportType, string> = { post: 'clip', comment: 'comment', thread: 'thread', reply: 'reply', chat: 'message', match: 'match', user: 'profile' };

/** "Report" link + a bottom-sheet form. Anyone signed in can report anything that isn't theirs. */
export default function ReportButton({ type, id, className = 'linkish', label = 'Report', children }: {
  type: ReportType; id: string | number; className?: string; label?: string; children?: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  function start(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) { router.push(`/login?next=${encodeURIComponent(path)}`); return; }
    setOpen(true);
  }
  function close() { setOpen(false); setReason(''); setNote(''); setError(''); setState('idle'); }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      await api('/v1/reports', { method: 'POST', body: { type, id: String(id), reason, note } });
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={start} aria-label={`Report this ${NOUN[type]}`}>{children ?? label}</button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet report-sheet" role="dialog" aria-label={`Report this ${NOUN[type]}`} onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            {state === 'sent' ? (
              <div className="stack" style={{ gap: 10, padding: '6px 0 10px' }}>
                <strong style={{ fontSize: 18 }}>Thanks for looking out for the stands.</strong>
                <p className="muted" style={{ margin: 0 }}>A moderator will review this {NOUN[type]}. If several fans report it, it’s hidden until they do.</p>
                <button className="btn btn-primary" onClick={close}>Done</button>
              </div>
            ) : (
              <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
                <strong style={{ fontSize: 18 }}>Report this {NOUN[type]}</strong>
                <div className="report-reasons" role="radiogroup" aria-label="Reason">
                  {REASONS.map(([key, text]) => (
                    <label key={key} className={`report-reason${reason === key ? ' on' : ''}`}>
                      <input type="radio" name="reason" value={key} checked={reason === key} onChange={() => setReason(key)} />
                      {text}
                    </label>
                  ))}
                </div>
                <textarea className="textarea" rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything a moderator should know? (optional)" aria-label="Details" />
                {error && <p className="error">{error}</p>}
                <div className="row">
                  <div className="spacer" />
                  <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                  <button className="btn btn-primary" disabled={!reason || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send report'}</button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
