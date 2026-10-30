// Studio, the embroidery window (served as /lab/studio-emb.js, loaded after the Studio's script, whose embroidery dialog it fills in):
//   - three views of what the machine will make: Sewn (the stitch file drawn as thread on the cloth), Sewing (the stitches played back in the
//     order the machine sews them, colour by colour) and On the garment (the thread laid on the picture in place of the artwork)
//   - the review a digitiser would give it: a score, a verdict and each thing worth fixing, with the fix applied in one click
//   - the cloth it is sewn on: knit, woven, twill or fleece
// The engine is src/lab-sewout.js, through POST /v1/lab/studio/embroidery.
(function () {
  const dlg = document.getElementById('embDlg'); if (!dlg) return;
  let R = null, VIEW = 'sewn', EX = {}, PLAY = null;
  const $q = s => dlg.querySelector(s);

  // ---- the window's extra parts ----
  const css = document.createElement('style'); css.textContent = `
#embDlg .embtop{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
#embDlg .embprev{position:relative}#embDlg .embprev canvas{width:100%;display:block}
#embDlg .embplay{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#embDlg .embplay input[type=range]{flex:1;min-width:140px}
#embDlg .embplay output{font:500 11px 'IBM Plex Mono',monospace;color:#5b5e66;width:100%}
#embReview{border:1px solid rgba(20,20,22,.14);border-radius:14px;padding:12px;display:grid;gap:10px;background:#fff}
#embReview .rv{display:flex;align-items:center;gap:12px}#embReview .ring{--p:0;width:58px;height:58px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--c) calc(var(--p)*1%),rgba(20,20,22,.08) 0)}
#embReview .ring b{width:46px;height:46px;border-radius:50%;background:#fff;display:grid;place-items:center;font:500 18px 'IBM Plex Mono',monospace}
#embReview .rv h4{margin:0;font-size:15px;font-weight:500}#embReview .rv p{margin:2px 0 0;font-size:12.5px;color:#5b5e66}
#embReview ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}#embReview li{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:8px;align-items:start;font-size:12.5px;line-height:1.4}
#embReview li i{width:10px;height:10px;border-radius:50%;margin-top:4px}#embReview li[data-l=fail] i{background:#c8202a}#embReview li[data-l=warn] i{background:#e0a100}#embReview li[data-l=ok] i{background:#12b864}
#embReview li .btn{min-height:26px;padding:0 10px}#embReview details summary{cursor:pointer;font-size:12.5px;color:#5b5e66}`;
  document.head.appendChild(css);
  const prev = $q('.embprev'); const img = $q('#embImg');
  prev.insertAdjacentHTML('beforeend', '<canvas id="embCan" class="hidden" aria-label="The stitches, played back in the order the machine sews them"></canvas><canvas id="embOn" class="hidden" aria-label="The thread on the picture of the garment"></canvas>');
  prev.insertAdjacentHTML('beforebegin', `<div class="embtop"><div class="seg" role="group" aria-label="Show" id="embSeg"><button type="button" data-embview="sewn" aria-pressed="true" title="The stitch file drawn as thread on the cloth">Sewn</button><button type="button" data-embview="play" aria-pressed="false" title="The stitches in the order the machine sews them">Sewing</button><button type="button" data-embview="garment" aria-pressed="false" title="The thread on the picture, where the artwork is">On the garment</button></div>
    <label class="f" style="margin:0"><span class="hidden">Fabric</span><select class="t" id="embFab" aria-label="Fabric it is sewn on"><option value="knit">On a knit (tees, polos)</option><option value="fleece">On fleece (sweats)</option><option value="twill">On twill (caps, chinos)</option><option value="woven">On a woven (shirts, jackets)</option></select></label></div>`);
  prev.insertAdjacentHTML('afterend', '<div class="embplay hidden" id="embPlay"><button class="btn sm" type="button" id="embPP" aria-label="Play">Play</button><input type="range" id="embPos" min="0" max="1" value="0" aria-label="Stitch"><select class="t" id="embSpeed" aria-label="Speed" style="width:auto"><option value="0.5">Slow</option><option value="1" selected>Normal</option><option value="4">Fast</option></select><output id="embAt"></output></div>');
  $q('#embStats').insertAdjacentHTML('beforebegin', '<div id="embReview" aria-live="polite"><p class="note" style="margin:0">The review comes with the digitizing.</p></div>');
  const note = [...dlg.querySelectorAll('.embgrid > div:first-child > p.note')].pop(); if (note) note.textContent = 'What the machine will make, drawn stitch by stitch: thread with its sheen and twist, satin raised over its underlay, fill flatter, on the cloth you choose. Play it to see the order it sews in.';

  // ---- what the Studio sends, and what it gets back ----
  window.EMBX = {
    body: () => ({ fabric: $q('#embFab').value, onGarment: VIEW === 'garment', ...EX }),
    show(r) { R = r; dlg.dataset.runs = String(Number(dlg.dataset.runs || 0) + 1); $q('#embOn').dataset.ready = ''; review(r.review); setupPlay(r.frames); if (VIEW === 'garment') onGarment(); },
    reset() { EX = {}; }
  };
  $q('#embFab').addEventListener('change', () => embRun());

  // ---- the three views ----
  function view(v) {
    VIEW = v; for (const b of dlg.querySelectorAll('#embSeg [data-embview]')) b.setAttribute('aria-pressed', String(b.dataset.embview === v));
    img.classList.toggle('hidden', v !== 'sewn'); $q('#embCan').classList.toggle('hidden', v !== 'play'); $q('#embPlay').classList.toggle('hidden', v !== 'play'); $q('#embOn').classList.toggle('hidden', v !== 'garment');
    if (v !== 'play') pause();
    if (v === 'play' && PLAY) { drawTo(0); play(); }
    if (v === 'garment') { if (R?.onGarment) onGarment(); else embRun(); }
  }
  dlg.addEventListener('click', e => { const b = e.target.closest('#embSeg [data-embview]'); if (b) view(b.dataset.embview); });
  dlg.addEventListener('close', () => pause());

  // ---- Sewing: the stitch stream, drawn in order ----
  function decode(s) { const b = atob(s), n = b.length / 6, out = new Int16Array(n * 3); for (let i = 0; i < n * 3; i++) { const lo = b.charCodeAt(i * 2), hi = b.charCodeAt(i * 2 + 1); out[i] = (hi << 8 | lo) << 16 >> 16; } return out; }
  function setupPlay(f) {
    pause(); if (!f || !f.s) { PLAY = null; return; }
    const rec = decode(f.s), n = rec.length / 3; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) { const x = rec[i * 3], y = rec[i * 3 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const c = $q('#embCan'), pad = 40, wide = Math.max(1, x1 - x0), tall = Math.max(1, y1 - y0), W = 900, k = (W - pad * 2) / Math.max(wide, tall);
    c.width = W; c.height = Math.round(tall * k + pad * 2);
    PLAY = { rec, n, k, ox: pad - x0 * k + (W - pad * 2 - wide * k) / 2, oy: pad - y0 * k, colours: f.colours || [], at: 0, stitches: f.stitches || 0 };
    const pos = $q('#embPos'); pos.max = String(n); pos.value = '0'; drawTo(VIEW === 'play' ? 0 : n);
    if (VIEW === 'play') play();
  }
  const shade = (hex, f) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; const v = parseInt(m[1], 16), c = x => Math.max(0, Math.min(255, Math.round(x * f))); return `rgb(${c(v >> 16 & 255)},${c(v >> 8 & 255)},${c(v & 255)})`; };
  // drawn on from where it got to; from the start again only when the slider goes back
  function drawTo(to) {
    const P = PLAY; if (!P) return; const c = $q('#embCan'), x = c.getContext('2d');
    if (!P.st || to < P.st.i) { x.fillStyle = (typeof embBody === 'function' ? embBody().garment : '') || '#ecebe6'; x.fillRect(0, 0, c.width, c.height); P.st = { i: 0, ci: 0, px: null, py: null, prevF: 1, sewn: 0 }; P.under = null; }
    const st = P.st, tw = Math.max(1, 4 * P.k); x.lineCap = 'round'; x.lineJoin = 'round';
    if (P.under) { x.putImageData(P.under.data, P.under.x, P.under.y); P.under = null; } // the needle drawn last time
    for (; st.i < to; st.i++) {
      const i = st.i, X = P.rec[i * 3] * P.k + P.ox, Y = P.rec[i * 3 + 1] * P.k + P.oy, F = P.rec[i * 3 + 2], col = P.colours[st.ci]?.hex || '#141416';
      if (F === 3) { st.ci++; st.prevF = 3; continue; }
      if (F === 0 && st.prevF === 0 && st.px != null) { x.strokeStyle = shade(col, .55); x.lineWidth = tw + 1; x.beginPath(); x.moveTo(st.px + .6, st.py + .8); x.lineTo(X + .6, Y + .8); x.stroke(); x.strokeStyle = col; x.lineWidth = tw; x.beginPath(); x.moveTo(st.px, st.py); x.lineTo(X, Y); x.stroke(); }
      if (F === 0) st.sewn++; st.px = X; st.py = Y; st.prevF = F;
    }
    if (to > 0 && to < P.n && st.px != null) { const ux = Math.max(0, Math.round(st.px - 10)), uy = Math.max(0, Math.round(st.py - 10)); P.under = { x: ux, y: uy, data: x.getImageData(ux, uy, 20, 20) };
      x.strokeStyle = '#141416'; x.lineWidth = 1.5; x.beginPath(); x.arc(st.px, st.py, 7, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#4bff9a'; x.beginPath(); x.arc(st.px, st.py, 3, 0, Math.PI * 2); x.fill(); }
    P.at = to; $q('#embPos').value = String(to);
    const ci = Math.min(st.ci, P.colours.length - 1), name = P.colours[ci]?.name || P.colours[ci]?.hex || '', min = st.sewn / 750;
    $q('#embAt').textContent = `Stitch ${st.sewn.toLocaleString('en-US')} of ${P.stitches.toLocaleString('en-US')} · thread ${ci + 1} of ${P.colours.length}${name ? ` (${name})` : ''} · ${min < 1 ? Math.round(min * 60) + ' s' : min.toFixed(1) + ' min'} in, at 750 a minute`;
  }
  function play() {
    const P = PLAY; if (!P) return; if (P.at >= P.n) drawTo(0); pause(); $q('#embPP').textContent = 'Pause'; $q('#embPP').setAttribute('aria-label', 'Pause');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduce) { drawTo(P.n); pause(); return; }
    const step = () => { const per = Math.max(2, Math.ceil(P.n / 540)) * Number($q('#embSpeed').value); drawTo(Math.min(P.n, P.at + Math.ceil(per))); if (P.at < P.n) P.raf = requestAnimationFrame(step); else pause(); };
    P.raf = requestAnimationFrame(step);
  }
  function pause() { if (PLAY?.raf) cancelAnimationFrame(PLAY.raf); if (PLAY) PLAY.raf = 0; const b = $q('#embPP'); if (b) { b.textContent = PLAY && PLAY.at >= PLAY.n ? 'Again' : 'Play'; b.setAttribute('aria-label', b.textContent); } }
  $q('#embPP').addEventListener('click', () => (PLAY?.raf ? pause() : play()));
  $q('#embPos').addEventListener('input', e => { pause(); drawTo(Number(e.target.value)); });

  // ---- On the garment: the picture without the artwork, the thread in its place ----
  function onGarment() {
    const l = layerOf(EMB), og = R?.onGarment; if (!l || !og) return;
    const im = new Image(); im.onload = () => {
      const was = l.visible; l.visible = false; compose(); const base = canvas(W, H); base.getContext('2d').drawImage(docC, 0, 0); l.visible = was; compose(); draw();
      const b = window.PRO ? PRO.box(l) : { cx: l.x, cy: l.y, w: inchesOf(l).w * (PPI || 50) }, k = b.w / (R.widthMm * 10), bx = og.box;
      const x = base.getContext('2d'); x.save(); x.translate(b.cx, b.cy); x.rotate(l.rot); if (l.flip) x.scale(-1, 1); x.drawImage(im, bx.x0 * k, bx.y0 * k, (bx.x1 - bx.x0) * k, (bx.y1 - bx.y0) * k); x.restore();
      // close in on it: the design and as much again round it
      const half = Math.max(b.w, (b.h || b.w)) * 1.1, cx0 = Math.max(0, b.cx - half), cy0 = Math.max(0, b.cy - half), cw = Math.min(W - cx0, half * 2), ch = Math.min(H - cy0, half * 2);
      const c = $q('#embOn'), s = Math.min(1, 900 / Math.max(cw, ch)); c.width = Math.round(cw * s); c.height = Math.round(ch * s); c.getContext('2d').drawImage(base, cx0, cy0, cw, ch, 0, 0, c.width, c.height); c.dataset.ready = '1';
    }; im.src = og.image;
  }

  // ---- the review ----
  const VERD = { ready: ['Ready to sew', '#12b864', 'Nothing a digitiser would change. Run one sew-out on the real garment before the order.'], check: ['Worth a check', '#e0a100', 'It will sew; the points below would make it sew better.'], fix: ['Fix before production', '#c8202a', 'Something here will not sew well as it is.'] };
  const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
  function fixText(f) { return Object.entries(f).map(([k, v]) => ({ rowMm: `rows ${v} mm`, satinMaxMm: `satin up to ${v} mm`, pullMm: `pull ${v} mm`, underlay: 'underlay on', widthIn: `${v} in wide`, trimMm: `trim jumps over ${v} mm`, maxThreads: `${v} threads` })[k] || `${k} ${v}`).join(', '); }
  function review(rv) {
    const box = $q('#embReview'); if (!rv) { box.innerHTML = '<p class="note" style="margin:0">No review came back.</p>'; return; }
    const [title, colour, sub] = VERD[rv.verdict] || VERD.check, fixes = rv.items.filter(i => i.fix && i.level !== 'ok'), oks = rv.items.filter(i => i.level === 'ok'), todo = rv.items.filter(i => i.level !== 'ok'), f = rv.fidelity || {};
    const li = i => `<li data-l="${i.level}"><i aria-label="${i.level === 'fail' ? 'Must fix' : i.level === 'warn' ? 'Worth fixing' : 'Fine'}"></i><span>${esc(i.text)}</span>${i.fix && i.level !== 'ok' ? `<button class="btn sm q" type="button" data-embfix="${rv.items.indexOf(i)}" title="${esc(fixText(i.fix))}">Fix it</button>` : '<span></span>'}</li>`;
    box.innerHTML = `<div class="rv"><div class="ring" style="--p:${rv.score};--c:${colour}"><b>${rv.score}</b></div><div><h4>${title}</h4><p>${sub}</p><p>Matches the artwork ${pct(f.iou)} · covers ${pct(f.coverage)} of it · over its edges ${pct(f.overstitch)}</p></div></div>
      ${todo.length ? `<ul>${todo.map(li).join('')}</ul>` : ''}
      ${fixes.length > 1 ? `<div class="row"><button class="btn sm go" type="button" data-embfix="all">Fix all ${fixes.length}</button></div>` : ''}
      ${oks.length ? `<details><summary>${oks.length} things checked and fine</summary><ul style="margin-top:6px">${oks.map(li).join('')}</ul></details>` : ''}`;
    box.dataset.verdict = rv.verdict; box.dataset.score = rv.score;
  }
  // a fix is a setting of the window: the ones with a control set the control, the rest go with the next digitizing
  function setSel(id, v) { const s = $q(id); if (![...s.options].some(o => Number(o.value) === Number(v))) s.insertAdjacentHTML('beforeend', `<option value="${v}">${v} mm</option>`); s.value = [...s.options].find(o => Number(o.value) === Number(v)).value; }
  function applyFix(f) {
    for (const [k, v] of Object.entries(f)) {
      if (k === 'rowMm') setSel('#embRow', v); else if (k === 'satinMaxMm') setSel('#embSatin', v); else if (k === 'pullMm') setSel('#embPull', v);
      else if (k === 'underlay') $q('#embUnder').value = v ? '1' : '0'; else if (k === 'widthIn') $q('#embW').value = fin(v); else EX[k] = v;
    }
  }
  dlg.addEventListener('click', e => {
    const b = e.target.closest('[data-embfix]'); if (!b || !R?.review) return;
    const items = b.dataset.embfix === 'all' ? R.review.items.filter(i => i.fix && i.level !== 'ok') : [R.review.items[Number(b.dataset.embfix)]];
    const before = R.review.score; for (const i of items) applyFix(i.fix);
    embRun().then(() => { const now = R?.review?.score; if (now != null) toast(now > before ? `Fixed: the review is ${now} now (was ${before}).` : `Changed. The review is ${now}.`); });
  });
})();
