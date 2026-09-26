'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { FilterName } from '@/lib/api';
import { filterCss } from '@/lib/format';

interface Props {
  kind: 'video' | 'image';
  src: string;
  poster?: string | null;
  filter?: FilterName;
  trimStart?: number | null;
  trimEnd?: number | null;
  title?: string;
  autoPlay?: boolean;
  controls?: boolean;
  /** Needed when the editor captures frames to a canvas. */
  crossOrigin?: boolean;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
  onTimeUpdate?: (time: number) => void;
}

/** Plays a clip inside its trim window and applies the creator's look. */
const MediaPlayer = forwardRef<HTMLVideoElement | null, Props>(function MediaPlayer(props, ref) {
  const { kind, src, poster, filter, trimStart, trimEnd, title, autoPlay, controls = true, crossOrigin, onLoadedMetadata, onTimeUpdate } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

  const start = trimStart ?? 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const end = trimEnd ?? Infinity;
    const clamp = () => {
      if (video.currentTime < start - 0.05) video.currentTime = start;
      if (video.currentTime >= end) {
        video.pause();
        video.currentTime = end;
      }
      onTimeUpdate?.(video.currentTime);
    };
    // Pressing play at the end of the trim window restarts from the trimmed start.
    const restart = () => { if (video.currentTime >= end - 0.05 || video.currentTime < start - 0.05) video.currentTime = start; };
    video.addEventListener('timeupdate', clamp);
    video.addEventListener('seeked', clamp);
    video.addEventListener('play', restart);
    return () => {
      video.removeEventListener('timeupdate', clamp);
      video.removeEventListener('seeked', clamp);
      video.removeEventListener('play', restart);
    };
  }, [start, trimEnd, onTimeUpdate]);

  if (kind === 'image') {
    return <div className="player"><img src={src} alt={title || ''} style={{ filter: filterCss(filter) }} /></div>;
  }

  return (
    <div className="player">
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        controls={controls}
        playsInline
        autoPlay={autoPlay}
        muted={autoPlay}
        preload="metadata"
        crossOrigin={crossOrigin ? 'anonymous' : undefined}
        style={{ filter: filterCss(filter) }}
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          if (start > 0) video.currentTime = start;
          onLoadedMetadata?.(video);
        }}
        aria-label={title}
      />
    </div>
  );
});

export default MediaPlayer;
