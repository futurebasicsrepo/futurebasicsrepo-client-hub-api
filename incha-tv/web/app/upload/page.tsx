'use client';

import { Suspense, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uploadFile, type Post } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';

const ACCEPT = 'video/*,.mov,.mkv,.3gp,.m4v,image/jpeg,image/png,image/gif,image/webp';
const OK_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|jpe?g|png|gif|webp)$/i;
// Browsers report phone video inconsistently (HEVC .mov can come through blank), so fall back to the extension.
const accepted = (file: File) => /^video\//.test(file.type) || ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || OK_EXT.test(file.name);
const MAX_BYTES = 500_000_000;

export default function UploadPage() {
  return <Suspense><Upload /></Suspense>;
}

function Upload() {
  const user = useRequireUser();
  const router = useRouter();
  const params = useSearchParams();
  const matchId = params.get('match');
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  async function start(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!accepted(file)) { setError('Upload a video (MP4, MOV, WebM, MKV, 3GP) or a JPG, PNG, GIF, or WebP image.'); return; }
    if (file.size > MAX_BYTES) { setError('Files must be under 500 MB.'); return; }
    setFileName(file.name);
    setProgress(0);
    try {
      const { post } = await uploadFile<{ post: Post }>('/v1/posts', file, file.name, setProgress);
      const forward = new URLSearchParams();
      if (matchId) forward.set('match', matchId);
      if (params.get('minute')) forward.set('minute', params.get('minute')!);
      router.push(`/studio/${post.id}${forward.size ? `?${forward}` : ''}`);
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  }

  if (!user) return null;
  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <h1 className="display page-title">Upload</h1>
      <p className="muted">Drop a clip or photo. You’ll trim it, pick a cover, and choose who sees it before anything goes live.</p>
      {matchId && <p className="badge flare" style={{ marginTop: 8 }}>This clip will be added to the match</p>}
      {progress === null ? (
        <div
          className={`dropzone${over ? ' over' : ''}`}
          role="button"
          tabIndex={0}
          style={{ marginTop: 24 }}
          onClick={() => input.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); start(e.dataTransfer.files[0]); }}
        >
          <div className="display">Drop it here</div>
          <p className="muted">or click to choose a file · any phone video (incl. iPhone HEVC), JPG, PNG, GIF, WebP · up to 500 MB</p>
          <input ref={input} type="file" accept={ACCEPT} hidden onChange={e => start(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="panel stack" style={{ marginTop: 24 }}>
          <div className="row"><strong>{fileName}</strong><div className="spacer" /><span className="mono">{Math.round(progress * 100)}%</span></div>
          <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
          <span className="muted">{progress < 1 ? 'Uploading…' : 'Processing…'} Keep this tab open.</span>
        </div>
      )}
      {error && <p className="error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
      <p className="hint" style={{ marginTop: 16 }}>New uploads start as private drafts. Only post what you have the right to share.</p>
    </div>
  );
}
