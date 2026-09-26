'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, API_URL, postBinary, type LiveStream, type MatchSnapshot } from '@/lib/api';
import { useRequireUser } from '@/lib/useRequireUser';

type Phase = 'setup' | 'starting' | 'live' | 'ending' | 'done';

// Chrome/Firefox record WebM; Safari (iPhone) records fragmented MP4. The server accepts either.
const MIME_TYPES = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
const pickMime = () => (typeof MediaRecorder === 'undefined' ? null : MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? '');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};

export default function GoLive({ matchId }: { matchId: string }) {
  const user = useRequireUser();
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const queue = useRef<Blob[]>([]);
  const seq = useRef(0);
  const pumping = useRef(false);
  const streamRef = useRef<LiveStream | null>(null);
  const stopped = useRef(false);
  const [snap, setSnap] = useState<MatchSnapshot | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [phase, setPhase] = useState<Phase>('setup');
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [backlog, setBacklog] = useState(0);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(true);

  // Match header, kept current over the same live feed viewers use.
  useEffect(() => {
    api<MatchSnapshot>(`/v1/matches/${matchId}`).then(setSnap).catch(err => setError(err.message));
    const source = new EventSource(`${API_URL}/v1/matches/${matchId}/stream`);
    source.addEventListener('update', event => setSnap(JSON.parse((event as MessageEvent).data)));
    return () => source.close();
  }, [matchId]);

  // Camera preview (before and during the stream).
  useEffect(() => {
    if (!user || phase !== 'setup') return;
    let cancelled = false;
    (async () => {
      setCameraError('');
      mediaRef.current?.getTracks().forEach(track => track.stop());
      const video = { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video, audio: true });
        setHasAudio(true);
      } catch {
        try {
          media = await navigator.mediaDevices.getUserMedia({ video });
          setHasAudio(false);
        } catch {
          if (!cancelled) setCameraError('Allow camera access to go live. On iPhone: Settings → Safari → Camera.');
          return;
        }
      }
      if (cancelled) { media.getTracks().forEach(track => track.stop()); return; }
      mediaRef.current = media;
      if (previewRef.current) { previewRef.current.srcObject = media; previewRef.current.play().catch(() => {}); }
    })();
    return () => { cancelled = true; };
  }, [user, facing, phase]);

  // Release the camera when leaving the page.
  useEffect(() => () => {
    stopped.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    mediaRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    // Keep the phone awake and warn before closing the tab mid-stream.
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => { clearInterval(timer); lock?.release().catch(() => {}); window.removeEventListener('beforeunload', warn); };
  }, [phase]);

  // Sends queued chunks in order, retrying through signal drops. Stops if the server ends the stream.
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    let backoff = 500;
    while (queue.current.length && streamRef.current) {
      const chunk = queue.current[0];
      try {
        const { status, data } = await postBinary<{ next: number }>(`/v1/streams/${streamRef.current.id}/chunks?seq=${seq.current}`, chunk);
        if (status === 200 || (status === 409 && data.next > seq.current)) {
          // 409 with a higher `next` means the server already has this chunk (an earlier retry landed).
          const advance = status === 200 ? 1 : data.next - seq.current;
          queue.current.splice(0, advance);
          seq.current += advance;
          backoff = 500;
        } else if (status === 404 || status === 410 || status === 409) {
          setError(data.error || 'The stream was ended.');
          queue.current = [];
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
          setPhase(p => (p === 'live' ? 'ending' : p));
          break;
        } else {
          throw new Error(data.error || `HTTP ${status}`);
        }
      } catch {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 4000);
      }
      setBacklog(queue.current.length);
    }
    setBacklog(queue.current.length);
    pumping.current = false;
  }, []);

  async function goLive() {
    const media = mediaRef.current;
    const mime = pickMime();
    if (!media || mime === null) { setError('This browser can’t record video. Try Safari on iPhone or Chrome.'); return; }
    setPhase('starting');
    setError('');
    try {
      const { stream } = await api<{ stream: LiveStream }>(`/v1/matches/${matchId}/streams`, { method: 'POST' });
      streamRef.current = stream;
      seq.current = 0;
      queue.current = [];
      const recorder = new MediaRecorder(media, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
      recorder.ondataavailable = event => {
        if (!event.data.size || !streamRef.current) return;
        queue.current.push(event.data);
        pump();
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setStartedAt(Date.now());
      setNow(Date.now());
      setPhase('live');
      if (navigator.vibrate) navigator.vibrate(40);
    } catch (err) {
      setError((err as Error).message);
      setPhase('setup');
    }
  }

  async function endStream() {
    const stream = streamRef.current;
    if (!stream) return;
    setPhase('ending');
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      const flushed = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.stop();
      await flushed;
    }
    // Give the last few seconds a chance to upload.
    for (let i = 0; i < 40 && (queue.current.length || pumping.current); i++) await sleep(250);
    try {
      const result = await api<{ replayPostId: string | null }>(`/v1/streams/${stream.id}/end`, { method: 'POST' });
      setReplayId(result.replayPostId);
    } catch (err) {
      setError((err as Error).message);
    }
    streamRef.current = null;
    mediaRef.current?.getTracks().forEach(track => track.stop());
    setPhase('done');
  }

  // A server-side end (idle timeout, 3-hour cap) flips us to 'ending' from inside the pump.
  useEffect(() => {
    if (phase === 'ending' && streamRef.current && recorderRef.current?.state !== 'recording' && !stopped.current) {
      endStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!user) return null;
  const match = snap?.match;
  const score = match ? (match.period === 'pre' ? `${match.home.name} vs ${match.away.name}` : `${match.home.name} ${match.homeScore}–${match.awayScore} ${match.away.name}`) : '';
  const blocked = match?.youth ? 'Live video is off for youth matches to protect young players.' : match?.period === 'ft' ? 'This match has finished.' : '';

  if (phase === 'done') {
    return (
      <div className="wrap golive-done">
        <div className="display" style={{ fontSize: 44 }}>That’s a wrap</div>
        <p className="muted">
          {replayId ? 'Your stream is saved as a private draft. Trim the best moment and post it to the match.' : 'The stream has ended.'}
        </p>
        {error && <p className="error">{error}</p>}
        <div className="row" style={{ justifyContent: 'center' }}>
          {replayId && <Link href={`/studio/${replayId}`} className="btn btn-primary">Trim &amp; post the highlight</Link>}
          <Link href={`/m/${matchId}`} className="btn">Back to the match</Link>
        </div>
      </div>
    );
  }

  const live = phase === 'live';
  return (
    <div className="golive">
      <video ref={previewRef} className={`golive-preview${facing === 'user' ? ' mirror' : ''}`} muted playsInline autoPlay />
      <header className="golive-top">
        <button className="watch-back" aria-label="Back" disabled={live || phase === 'ending'} onClick={() => router.push(`/m/${matchId}`)}>←</button>
        <div className="golive-score">{score}</div>
        {live ? <span className="live-tag static"><i />Live · {elapsed(now - startedAt)}</span> : <span />}
      </header>

      {cameraError && <div className="golive-msg">{cameraError}</div>}
      {blocked && <div className="golive-msg">{blocked}</div>}

      <div className="golive-bottom">
        {live && backlog > 4 && <p className="golive-warn">Weak signal — {backlog}s waiting to upload</p>}
        {live && !hasAudio && <p className="golive-warn">No microphone — streaming without sound</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {phase === 'setup' || phase === 'starting' ? (
          <>
            <p className="golive-hint">Viewers see you about 10 seconds behind. Keep this screen open while you’re live.</p>
            <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
              <button className="btn" onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} disabled={phase !== 'setup'} aria-label="Flip camera">⟲ Flip</button>
              <button className="btn btn-primary golive-go" onClick={goLive} disabled={phase !== 'setup' || !!cameraError || !!blocked || !match}>
                {phase === 'starting' ? 'Starting…' : '● Go live'}
              </button>
            </div>
          </>
        ) : (
          <button className="btn golive-end" onClick={endStream} disabled={phase === 'ending'}>{phase === 'ending' ? 'Saving your stream…' : '■ End stream'}</button>
        )}
      </div>
    </div>
  );
}
