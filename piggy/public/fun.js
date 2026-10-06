// Fun: the motion and sound kit shared by the tap page and the display.
// No dependencies. Everything degrades quietly: no audio context, no
// vibration, or reduced motion just means fewer effects, never an error.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ─── sound: tiny synth, so there are no audio files to load ───────────────
  let ac = null;
  let muted = false;
  function unlock() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch { ac = null; }
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach((e) => addEventListener(e, unlock, { passive: true, capture: true }));

  function tone(freq, t0, dur, type = 'sine', gain = 0.2, slideTo) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, gain = 0.12) {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = ac.createBufferSource();
    const g = ac.createGain();
    s.buffer = b;
    g.gain.value = gain;
    s.connect(g).connect(ac.destination);
    s.start(t0);
  }
  function play(fn) {
    if (muted) return;
    unlock();
    if (!ac || ac.state !== 'running') return;
    fn(ac.currentTime + 0.01);
  }
  const sfx = {
    tick: () => play((t) => tone(1800, t, 0.03, 'triangle', 0.05)),
    pop: () => play((t) => tone(420, t, 0.12, 'sine', 0.18, 880)),
    coin: () => play((t) => { tone(988, t, 0.08, 'square', 0.08); tone(1319, t + 0.07, 0.4, 'square', 0.08); }),
    chaching: () => play((t) => {
      noise(t, 0.08, 0.2);
      tone(2093, t + 0.06, 0.6, 'triangle', 0.14);
      tone(2637, t + 0.14, 0.8, 'triangle', 0.12);
      noise(t + 0.12, 0.05, 0.12);
    }),
    chime: () => play((t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.14, 1.8, 'sine', 0.09))),
    fanfare: () => play((t) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, i === 5 ? 0.7 : 0.18, 'square', 0.06))),
    whoosh: () => play((t) => tone(200, t, 0.35, 'sawtooth', 0.04, 1200)),
  };
  const buzz = (pattern) => { try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* not supported */ } };

  // ─── particles: one full-screen canvas, drawn only while something moves ──
  let cv = null, cx = null, parts = [], raf = 0;
  function canvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '60' });
    document.body.appendChild(cv);
    const fit = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      cv.width = innerWidth * d;
      cv.height = innerHeight * d;
      cx = cv.getContext('2d');
      cx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    addEventListener('resize', fit);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const PALETTE = ['#ff6b8b', '#ffb547', '#ffd76a', '#7a1014', '#5ec2a6', '#6aa8ff', '#f4b3a4'];

  function spawn(p) { parts.push(p); if (!raf) raf = requestAnimationFrame(step); }
  function step() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 80);
    for (const p of parts) {
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.spin += 0.18; p.life--;
      cx.save();
      cx.globalAlpha = Math.min(1, p.life / 25);
      cx.translate(p.x, p.y);
      cx.rotate(p.rot);
      draw(p);
      cx.restore();
    }
    raf = parts.length ? requestAnimationFrame(step) : (cx.clearRect(0, 0, innerWidth, innerHeight), 0);
  }
  function draw(p) {
    const s = p.size;
    if (p.kind === 'confetti') {
      cx.scale(1, Math.cos(p.spin));
      cx.fillStyle = p.color;
      cx.fillRect(-s / 2, -s / 4, s, s / 2);
    } else if (p.kind === 'coin') {
      cx.scale(Math.max(0.15, Math.abs(Math.cos(p.spin * 0.6))), 1);
      const gr = cx.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s);
      gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.5, '#ffcf3f'); gr.addColorStop(1, '#c98a00');
      cx.fillStyle = gr;
      cx.beginPath(); cx.arc(0, 0, s, 0, 7); cx.fill();
      cx.strokeStyle = 'rgba(120,70,0,.5)'; cx.lineWidth = 1.5; cx.stroke();
      cx.fillStyle = 'rgba(120,70,0,.75)'; cx.font = `800 ${s * 1.1}px system-ui,sans-serif`;
      cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('$', 0, 1);
    } else if (p.kind === 'heart') {
      cx.fillStyle = p.color; cx.scale(s / 10, s / 10);
      cx.beginPath(); cx.moveTo(0, 3); cx.bezierCurveTo(-10, -4, -4, -11, 0, -5); cx.bezierCurveTo(4, -11, 10, -4, 0, 3); cx.fill();
    } else if (p.kind === 'spark') {
      const gr = cx.createRadialGradient(0, 0, 0, 0, 0, s);
      gr.addColorStop(0, 'rgba(255,245,210,1)'); gr.addColorStop(0.4, 'rgba(255,200,90,.7)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
      cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, s, 0, 7); cx.fill();
    } else if (p.kind === 'emoji') {
      cx.font = `${s}px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(p.text, 0, 0);
    }
  }

  // A burst from one point. kinds picks the particle types; count scales it.
  function burst({ x, y, count = 120, kinds = ['confetti', 'coin'], colors = PALETTE, speed = [5, 15], angle = -Math.PI / 2, spread = Math.PI * 2, gravity = 0.32, life = [80, 150], size = [6, 12], text = '' }) {
    if (reduce) count = Math.min(count, 12);
    canvas();
    for (let i = 0; i < count; i++) {
      const a = angle + rnd(-spread / 2, spread / 2);
      const v = rnd(speed[0], speed[1]);
      const kind = pick(kinds);
      spawn({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity, drag: kind === 'spark' ? 0.97 : 0.985,
        rot: rnd(0, 6), vr: rnd(-0.2, 0.2), spin: rnd(0, 6), kind, color: pick(colors), text,
        size: kind === 'coin' ? rnd(size[0] * 0.9, size[1] * 1.1) : kind === 'emoji' ? rnd(28, 44) : rnd(size[0], size[1]),
        life: rnd(life[0], life[1]),
      });
    }
  }
  // Things falling from the top of the screen for a while.
  function rain({ kinds = ['coin'], duration = 1600, perFrame = 2, text = '', gravity = 0.25 } = {}) {
    if (reduce) return;
    canvas();
    const end = performance.now() + duration;
    const drip = () => {
      for (let i = 0; i < perFrame; i++) {
        const kind = pick(kinds);
        spawn({
          x: rnd(0, innerWidth), y: -30, vx: rnd(-1, 1), vy: rnd(2, 6), g: gravity, drag: 0.99,
          rot: rnd(0, 6), vr: rnd(-0.1, 0.1), spin: rnd(0, 6), kind, color: pick(PALETTE), text,
          size: kind === 'coin' ? rnd(9, 15) : kind === 'emoji' ? rnd(28, 42) : rnd(7, 12), life: 400,
        });
      }
      if (performance.now() < end) requestAnimationFrame(drip);
    };
    drip();
  }

  // ─── tweens ────────────────────────────────────────────────────────────────
  const easeOut = (t) => 1 - (1 - t) ** 3;
  // Count a number up with a tick on each new value, like a cash register.
  function countUp(el, from, to, { dur = 1400, fmt = (v) => String(Math.round(v)), ticks = true } = {}) {
    return new Promise((done) => {
      if (reduce || from === to) { el.textContent = fmt(to); return done(); }
      const t0 = performance.now();
      let last = '';
      const f = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const s = fmt(from + (to - from) * easeOut(t));
        if (s !== last) { el.textContent = s; if (ticks && t < 1) sfx.tick(); last = s; }
        if (t < 1) requestAnimationFrame(f); else done();
      };
      requestAnimationFrame(f);
    });
  }

  // A coin that flies from one element into another along an arc.
  function flyCoin(from, to, { label = '', dur = 750 } = {}) {
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const c = document.createElement('div');
    c.className = 'fly-coin';
    c.textContent = label;
    document.body.appendChild(c);
    const sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = b.left + b.width / 2, ey = b.top + b.height * 0.12;
    const mx = (sx + ex) / 2 + (ex > sx ? -60 : 60), my = Math.min(sy, ey) - 140;
    const anim = c.animate([
      { transform: `translate(${sx}px,${sy}px) translate(-50%,-50%) scale(1) rotateY(0)`, offset: 0 },
      { transform: `translate(${mx}px,${my}px) translate(-50%,-50%) scale(1.25) rotateY(540deg)`, offset: 0.55 },
      { transform: `translate(${ex}px,${ey}px) translate(-50%,-50%) scale(.45) rotateY(900deg)`, offset: 1 },
    ], { duration: reduce ? 1 : dur, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
    return anim.finished.then(() => c.remove());
  }

  function shake(el, power = 8) {
    if (reduce) return;
    el.animate([0, 1, -1, 1, -0.6, 0.4, 0].map((k) => ({ transform: `translate(${k * power}px, ${-k * power * 0.4}px)` })), { duration: 420 });
  }
  function bounce(el, scale = 1.18) {
    if (reduce) return;
    el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale}, ${2 - scale})` }, { transform: `scale(${2 - scale * 0.96}, ${scale * 0.96})` }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));

  window.Fun = {
    reduce, sfx, buzz, burst, rain, countUp, flyCoin, shake, bounce, sleep,
    get muted() { return muted; },
    setMuted(v, key) { muted = !!v; if (key) store.set(key, muted ? '1' : '0'); },
    loadMuted(key, fallback) { const v = store.get(key); muted = v == null ? !!fallback : v === '1'; return muted; },
  };
})();
