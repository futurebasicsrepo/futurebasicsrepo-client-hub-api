'use client';

import { useEffect, useRef, useState } from 'react';

// A stadium-board number: when a digit changes, its card flips down to the new one.
// Digits that don't change stay put, and nothing flips on first paint.
export default function FlipNumber({ value, className = '' }: { value: number | string; className?: string }) {
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  const digits = String(value).split('');
  return (
    <span className={`flip ${className}`} role="text" aria-label={String(value)}>
      {digits.map((digit, i) => (
        // Keyed by position from the right + digit, so only a changed digit remounts (and flips).
        <Digit key={`${digits.length - i}:${digit}`} digit={digit} animate={mounted.current} />
      ))}
    </span>
  );
}

function Digit({ digit, animate }: { digit: string; animate: boolean }) {
  const [flip] = useState(animate); // decided once, when this digit card appears
  return <span className={`flip-d${flip ? ' flipping' : ''}`} aria-hidden="true">{digit}</span>;
}
