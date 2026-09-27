'use client';

import { useEffect, useRef } from 'react';

/** A team's colour, stable per team: until clubs set real colours, hashed from the name. */
export function teamColour(slug: string) {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 85% 56%)`;
}

type Particle = { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; age: number; tint: string };

/**
 * The goal moment: "GOAL" slams in over flare smoke in the scoring team's colour.
 * Canvas smoke stays cheap (≈70 soft blobs, ~2s) and is skipped for reduced motion.
 */
export default function GoalBurst({ team, colour, onDone }: { team: string; colour: string; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const done = setTimeout(onDone, 2400);
    const el = canvas.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduce) return () => clearTimeout(done);
    const ctx = el.getContext('2d');
    if (!ctx) return () => clearTimeout(done);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = el.clientWidth, h = el.clientHeight;
    el.width = w * dpr; el.height = h * dpr;
    ctx.scale(dpr, dpr);
    const tints = [colour, colour, '#ff4a1c', 'rgba(255,255,255,.9)'];
    const particles: Particle[] = Array.from({ length: 70 }, (_, i) => {
      const fromLeft = i % 2 === 0; // two flares, one each side of the stand
      return {
        x: (fromLeft ? 0.12 : 0.88) * w + (Math.random() - 0.5) * w * 0.2,
        y: h + 20 + Math.random() * 40,
        vx: (fromLeft ? 1 : -1) * (0.3 + Math.random() * 1.2),
        vy: -(2.2 + Math.random() * 3.2),
        r: 12 + Math.random() * 22,
        grow: 0.35 + Math.random() * 0.5,
        life: 1300 + Math.random() * 900,
        age: -Math.random() * 500,
        tint: tints[i % tints.length]
      };
    });
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of particles) {
        p.age += dt;
        if (p.age < 0 || p.age > p.life) continue;
        alive++;
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy *= 0.992; p.r += p.grow * dt / 16;
        const fade = Math.sin(Math.PI * (p.age / p.life)) * 0.55;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, p.tint);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = fade;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (alive || particles.some(p => p.age < 0)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearTimeout(done); };
  }, [colour, onDone]);

  return (
    <div className="goal-burst" style={{ '--team': colour } as React.CSSProperties} role="status" aria-live="assertive">
      <canvas ref={canvas} aria-hidden="true" />
      <div className="goal-word">
        <span className="display">GOAL</span>
        <span className="goal-team">{team}</span>
      </div>
    </div>
  );
}
