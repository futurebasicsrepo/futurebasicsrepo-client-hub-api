'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, uploadFile, type Fandom, type FilterName, type Post, type Visibility } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';
import { FILTERS, clock } from '@/lib/format';
import MediaPlayer from './MediaPlayer';
import VisibilityBadge from './VisibilityBadge';

interface Draft {
  title: string;
  description: string;
  fandom: string;
  filter: FilterName;
  visibility: Visibility;
  trimStart: number;
  trimEnd: number | null;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string; help: string }[] = [
  { value: 'public', label: 'Public', help: 'In the feed, your profile, and fandom pages. Anyone can find it.' },
  { value: 'unlisted', label: 'Unlisted', help: 'Only people with the link can watch. Great for group chats.' },
  { value: 'private', label: 'Private', help: 'Only you. Nobody else can open it, even with the link.' }
];

const draftFrom = (post: Post): Draft => ({
  title: post.title,
  description: post.description,
  fandom: post.fandom?.name ?? '',
  filter: post.filter,
  visibility: post.status === 'draft' && post.visibility === 'private' ? 'public' : post.visibility,
  trimStart: post.trimStart ?? 0,
  trimEnd: post.trimEnd
});

export default function Editor({ id }: { id: string }) {
  const user = useRequireUser();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [fandoms, setFandoms] = useState<Fandom[]>([]);
  const [swatch, setSwatch] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user) return;
    api<{ post: Post }>(`/v1/posts/${id}`)
      .then(({ post }) => {
        if (!post.isOwner) { router.replace(`/p/${id}`); return; }
        setPost(post);
        setDraft(draftFrom(post));
      })
      .catch(err => setError(err.message));
    api<{ fandoms: Fandom[] }>('/v1/fandoms').then(d => setFandoms(d.fandoms)).catch(() => {});
  }, [id, user, router]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  const update = (patch: Partial<Draft>) => setDraft(current => (current ? { ...current, ...patch } : current));

  // Grab a small still for the filter swatches; silently skipped if the frame can't be read.
  const captureFrame = useCallback((maxWidth: number, type = 'image/jpeg'): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    try {
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      return new Promise(resolve => canvas.toBlob(resolve, type, 0.88));
    } catch {
      return Promise.resolve(null);
    }
  }, []);

  const onLoadedMetadata = useCallback((video: HTMLVideoElement) => {
    const length = Number.isFinite(video.duration) ? video.duration : null;
    setDuration(length);
    if (length && post && !post.duration) {
      api(`/v1/posts/${post.id}`, { method: 'PATCH', body: { duration: length } }).catch(() => {});
    }
    video.addEventListener('seeked', async function once() {
      video.removeEventListener('seeked', once);
      const blob = await captureFrame(320);
      if (blob) setSwatch(URL.createObjectURL(blob));
    });
    if (!video.currentTime) video.currentTime = Math.min(0.1, (length ?? 1) / 2);
  }, [post, captureFrame]);

  const seek = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; };

  function setTrim(start: number, end: number | null) {
    if (!duration) return;
    const s = Math.max(0, Math.min(start, duration - 0.5));
    let e = end === null ? null : Math.min(duration, Math.max(end, s + 0.5));
    if (e !== null && e >= duration - 0.05) e = null; // "to the end"
    update({ trimStart: Number(s.toFixed(2)), trimEnd: e === null ? null : Number(e.toFixed(2)) });
  }

  function payload(d: Draft) {
    const body: Record<string, unknown> = {
      title: d.title, description: d.description, fandom: d.fandom, filter: d.filter
    };
    if (post?.kind === 'video') {
      body.trimStart = d.trimStart > 0 ? d.trimStart : null;
      body.trimEnd = d.trimEnd;
    }
    if (post?.status === 'published') body.visibility = d.visibility;
    return body;
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    try { await action(); } catch (err) { setError((err as Error).message); } finally { setBusy(''); }
  }

  const save = () => run('save', async () => {
    const { post: saved } = await api<{ post: Post }>(`/v1/posts/${id}`, { method: 'PATCH', body: payload(draft!) });
    setPost(saved);
    setNotice('Saved');
  });

  const publish = () => run('publish', async () => {
    if (!draft!.title.trim()) throw new Error('Add a title before publishing.');
    await api(`/v1/posts/${id}`, { method: 'PATCH', body: payload(draft!) });
    await api(`/v1/posts/${id}/publish`, { method: 'POST', body: { visibility: draft!.visibility } });
    router.push(`/p/${id}`);
  });

  const unpublish = () => run('unpublish', async () => {
    const { post: saved } = await api<{ post: Post }>(`/v1/posts/${id}/unpublish`, { method: 'POST' });
    setPost(saved);
    setNotice('Moved back to drafts');
  });

  const remove = () => {
    if (!window.confirm('Delete this post for good? This can’t be undone.')) return;
    run('delete', async () => {
      await api(`/v1/posts/${id}`, { method: 'DELETE' });
      router.push('/studio');
    });
  };

  const setCover = (blob: Blob | null | undefined, name: string) => run('cover', async () => {
    if (!blob) throw new Error('Couldn’t grab that frame. Try uploading an image instead.');
    const { post: saved } = await uploadFile<{ post: Post }>(`/v1/posts/${id}/cover`, blob, name);
    setPost(saved);
    setNotice('Cover updated');
  });

  if (!user) return null;
  if (error && !post) return <div className="wrap"><p className="error" style={{ marginTop: 40 }}>{error}</p></div>;
  if (!post || !draft) return <div className="wrap"><div className="skeleton" style={{ aspectRatio: '16 / 9', marginTop: 24 }} /></div>;

  const isVideo = post.kind === 'video';
  const end = draft.trimEnd ?? duration ?? 0;
  const pct = (t: number) => (duration ? `${(t / duration) * 100}%` : '0%');
  const published = post.status === 'published';

  return (
    <div className="wrap">
      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/studio" className="linkish">← Studio</Link>
        <VisibilityBadge post={post} />
        <div className="spacer" />
        {published && <Link href={`/p/${post.id}`} className="btn btn-sm btn-ghost">View post</Link>}
      </div>
      <div className="studio-layout">
        <div className="stack" style={{ gap: 20 }}>
          <MediaPlayer
            ref={videoRef}
            kind={post.kind}
            src={post.mediaUrl}
            poster={post.coverUrl}
            filter={draft.filter}
            trimStart={draft.trimStart}
            trimEnd={draft.trimEnd}
            crossOrigin
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={setTime}
          />

          {isVideo && (
            <section className="panel">
              <div className="row">
                <h2 className="display" style={{ fontSize: 26, margin: 0 }}>Trim</h2>
                <div className="spacer" />
                <span className="mono muted">{clock(draft.trimStart)} → {clock(end)} · {clock(end - draft.trimStart)}</span>
              </div>
              {duration ? (
                <>
                  <div className="trim">
                    <div className="track" />
                    <div className="sel" style={{ left: pct(draft.trimStart), width: `calc(${pct(end)} - ${pct(draft.trimStart)})` }} />
                    <div className="head" style={{ left: pct(time) }} />
                    <input type="range" min={0} max={duration} step={0.05} value={draft.trimStart} aria-label="Trim start"
                      onChange={e => { const v = Number(e.target.value); setTrim(v, draft.trimEnd); seek(v); }} />
                    <input type="range" min={0} max={duration} step={0.05} value={end} aria-label="Trim end"
                      onChange={e => { const v = Number(e.target.value); setTrim(draft.trimStart, v); seek(Math.max(v - 0.05, 0)); }} />
                  </div>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => setTrim(time, draft.trimEnd)}>Start at playhead</button>
                    <button className="btn btn-sm" onClick={() => setTrim(draft.trimStart, time)}>End at playhead</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => { update({ trimStart: 0, trimEnd: null }); seek(0); }}>Reset</button>
                  </div>
                  <p className="hint">Viewers only see the part between the handles. Your original upload is kept, so you can change this anytime.</p>
                </>
              ) : <p className="muted">Loading clip…</p>}
            </section>
          )}

          <section className="panel">
            <h2 className="display" style={{ fontSize: 26, margin: '0 0 12px' }}>Look</h2>
            <div className="filters">
              {FILTERS.map(f => {
                const bg = post.kind === 'image' ? post.mediaUrl : swatch || post.coverUrl;
                return (
                  <button key={f.name} aria-pressed={draft.filter === f.name} onClick={() => update({ filter: f.name })}>
                    <div className="swatch" style={{ filter: f.css, backgroundImage: bg ? `url("${bg}")` : 'linear-gradient(135deg, #ff4a1c, #8cc3ec)' }} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </section>

          {isVideo && (
            <section className="panel">
              <h2 className="display" style={{ fontSize: 26, margin: '0 0 12px' }}>Cover</h2>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {post.coverUrl && <img src={post.coverUrl} alt="Current cover" style={{ width: 160, borderRadius: 8, filter: FILTERS.find(f => f.name === draft.filter)?.css }} />}
                <div className="stack" style={{ gap: 8 }}>
                  <button className="btn btn-sm" disabled={busy === 'cover'} onClick={async () => setCover(await captureFrame(1280), 'cover.jpg')}>Use current frame</button>
                  <button className="btn btn-sm btn-ghost" disabled={busy === 'cover'} onClick={() => coverInput.current?.click()}>Upload an image</button>
                  <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCover(f, f.name); }} />
                  <span className="hint">Scrub the player to the moment, then grab it.</span>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="stack" style={{ gap: 20 }}>
          <section className="panel stack">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" className="input" value={draft.title} maxLength={120} onChange={e => update({ title: e.target.value })} placeholder="Last-minute winner from Section 133" />
            </div>
            <div className="field">
              <label htmlFor="fandom">Fandom</label>
              <input id="fandom" className="input" list="fandom-list" value={draft.fandom} maxLength={60} onChange={e => update({ fandom: e.target.value })} placeholder="Philadelphia Union" />
              <datalist id="fandom-list">{fandoms.map(f => <option key={f.slug} value={f.name} />)}</datalist>
              <span className="hint">Pick one or type a new one.</span>
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" className="textarea" value={draft.description} maxLength={2000} onChange={e => update({ description: e.target.value })} placeholder="Where were you? What happened?" />
            </div>
          </section>

          <section className="panel stack">
            <span className="mono muted">Who can watch</span>
            <div className="vis-options">
              {VISIBILITY_OPTIONS.map(option => (
                <label key={option.value}>
                  <input type="radio" name="visibility" value={option.value} checked={draft.visibility === option.value} onChange={() => update({ visibility: option.value })} />
                  <div><strong>{option.label}</strong><span>{option.help}</span></div>
                </label>
              ))}
            </div>
          </section>

          {error && <p className="error" role="alert">{error}</p>}
          <div className="stack" style={{ gap: 8 }}>
            {published ? (
              <button className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={publish} disabled={!!busy}>{busy === 'publish' ? 'Publishing…' : `Publish ${draft.visibility}`}</button>
                <button className="btn" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
              </>
            )}
            <div className="row">
              {published && <button className="btn btn-sm btn-ghost" onClick={unpublish} disabled={!!busy}>Unpublish</button>}
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost btn-danger" onClick={remove} disabled={!!busy}>Delete</button>
            </div>
          </div>
        </aside>
      </div>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
