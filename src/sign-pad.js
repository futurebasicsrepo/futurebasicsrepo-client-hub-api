// A place to sign with a finger, a pen or a mouse: the contract signing page (sign.html) and accepting a quote in the client hub (client.html).
// SignPad(host, { onChange, hint }) draws a sheet of paper with a signing line into host and returns
//   { empty(): true until a real signature is drawn, data(): the drawing as a PNG data URL (clear background), clear() }
// The server turns the drawing into blue ink (src/signatures.js inkify) and keeps it with the contract or the quote.
(() => {
  if (window.SignPad) return;
  const css = `.spad{position:relative;height:184px;border:1px solid rgba(20,20,22,.18);border-radius:16px;background:#fbfaf6;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
.spad canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.spad .spad-line{position:absolute;left:28px;right:20px;bottom:46px;border-bottom:1px solid rgba(20,20,22,.4);pointer-events:none}
.spad .spad-x{position:absolute;left:12px;bottom:50px;font:500 18px/1 'Space Grotesk',system-ui,sans-serif;color:rgba(20,20,22,.5);pointer-events:none}
.spad .spad-ph{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:13px;color:#6e6e75;pointer-events:none;transition:opacity .2s}
.spad.inked .spad-ph{opacity:0}
.spad .spad-clear{position:absolute;top:8px;right:8px;z-index:2;border:1px solid rgba(20,20,22,.18);background:#fff;color:#141416;border-radius:999px;padding:5px 12px;font:500 13px 'Space Grotesk',system-ui,sans-serif;cursor:pointer;display:none}
.spad.inked .spad-clear{display:block}
.spad:focus-within{outline:2px solid #4bff9a;outline-offset:2px}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  window.SignPad = (host, { onChange = () => {}, hint = 'Sign above the line with your finger, a pen or a mouse' } = {}) => {
    host.innerHTML = `<div class="spad"><canvas aria-label="Sign here" role="img"></canvas><span class="spad-x">×</span><span class="spad-line"></span><span class="spad-ph"></span><button type="button" class="spad-clear">Clear</button></div>`;
    const box = host.firstElementChild, cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
    box.querySelector('.spad-ph').textContent = hint;
    // the strokes are kept, so the drawing survives the phone turning (the pad is redrawn at its new width)
    let strokes = [], cur = null, w0 = 0;
    const INK = '#1f2f86';
    function size() {
      const r = cv.getBoundingClientRect(); if (!r.width) return;
      const k = Math.min(2, window.devicePixelRatio || 1) * 1.5, sx = w0 ? r.width / w0 : 1;
      if (sx !== 1) strokes = strokes.map(s => s.map(p => ({ ...p, x: p.x * sx })));
      w0 = r.width; cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k); ctx.setTransform(k, 0, 0, k, 0, 0); redraw();
    }
    // a line that swells where the hand slows and thins where it hurries, drawn through the midpoints so it stays smooth
    function seg(a, b, c) {
      ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = b.w;
      ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2); ctx.stroke();
    }
    function dot(p) { ctx.beginPath(); ctx.fillStyle = INK; ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
    function drawStroke(s) { if (s.length === 1) return dot(s[0]); for (let i = 1; i < s.length; i++) seg(s[Math.max(0, i - 2)], s[i - 1], s[i]); seg(s[s.length - 2], s[s.length - 1], s[s.length - 1]); }
    function redraw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(drawStroke); }
    const at = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
      const p = at(e); p.w = e.pointerType === 'pen' && e.pressure ? 1.2 + e.pressure * 2.6 : 2.6; cur = [p]; strokes.push(cur); dot(p);
    });
    cv.addEventListener('pointermove', e => {
      if (!cur) return; e.preventDefault();
      for (const ev of (e.getCoalescedEvents?.() || [e])) {
        const p = at(ev), q = cur[cur.length - 1], d = Math.hypot(p.x - q.x, p.y - q.y); if (d < 1.2) continue;
        const v = d / Math.max(1, p.t - q.t), target = ev.pointerType === 'pen' && ev.pressure ? 1.2 + ev.pressure * 2.6 : Math.max(1.3, Math.min(3.4, 3.6 - v * 1.1));
        p.w = q.w + (target - q.w) * .35; cur.push(p);
        if (cur.length >= 3) seg(cur[cur.length - 3], cur[cur.length - 2], p); else seg(q, q, p);
      }
      if (!box.classList.contains('inked') && !empty()) { box.classList.add('inked'); onChange(); }
    });
    const end = () => { if (!cur) return; cur = null; redraw(); box.classList.toggle('inked', !empty()); onChange(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('lostpointercapture', end);
    // a tap or a scratch is not a signature: the drawing has to run some way across the line
    function empty() {
      let len = 0, x0 = Infinity, x1 = -Infinity;
      for (const s of strokes) for (let i = 0; i < s.length; i++) { x0 = Math.min(x0, s[i].x); x1 = Math.max(x1, s[i].x); if (i) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); }
      return len < 60 || x1 - x0 < 36;
    }
    function clear() { strokes = []; cur = null; redraw(); box.classList.remove('inked'); onChange(); }
    box.querySelector('.spad-clear').onclick = clear;
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv); else window.addEventListener('resize', size);
    size();
    return { empty, clear, data: () => (empty() ? null : cv.toDataURL('image/png')) };
  };
})();
