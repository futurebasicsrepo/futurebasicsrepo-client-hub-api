'use client';

import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';

interface Props {
  src: string;
  label?: string;
}

/** Plays a live HLS stream: natively on Safari/iOS, via hls.js elsewhere. Keeps retrying until the first segments exist. */
export default function LivePlayer({ src, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'connecting' | 'playing' | 'error'>('connecting');
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    setState('connecting');

    const onPlaying = () => setState('playing');
    video.addEventListener('playing', onPlaying);

    const start = async () => {
      if (cancelled) return;
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.onerror = () => { retry = setTimeout(start, 2500); };
        video.play().catch(() => {});
        return;
      }
      const { default: HlsLib } = await import('hls.js');
      if (cancelled) return;
      if (!HlsLib.isSupported()) { setState('error'); return; }
      hls?.destroy();
      hls = new HlsLib({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 2, backBufferLength: 30 });
      hls.on(HlsLib.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      hls.on(HlsLib.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // The playlist 404s for the first few seconds of a stream; keep knocking.
        hls?.destroy();
        hls = null;
        retry = setTimeout(start, 2500);
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    };
    start();

    return () => {
      cancelled = true;
      clearTimeout(retry);
      video.removeEventListener('playing', onPlaying);
      video.onerror = null;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  return (
    <div className="player live-player">
      <video ref={videoRef} muted={muted} playsInline autoPlay aria-label={label} />
      <span className="live-tag"><i />Live</span>
      {state === 'connecting' && <div className="live-overlay">Connecting to the stream…</div>}
      {state === 'error' && <div className="live-overlay">This browser can’t play live video.</div>}
      {state === 'playing' && muted && (
        <button className="live-unmute" onClick={() => {
          const video = videoRef.current;
          setMuted(false);
          if (video) { video.muted = false; video.play().catch(() => {}); }
        }}>🔇 Tap for sound</button>
      )}
    </div>
  );
}
