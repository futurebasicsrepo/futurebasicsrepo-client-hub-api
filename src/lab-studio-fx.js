// Studio, print filters (served as /lab/studio-fx.js; shares the Studio's globals; the work is in src/lab-filters.js). A layer as halftone dots,
// stipple, a few flat colours, one ink, or two inks' tones, with a live preview; applied, it is a new layer over the old one, which stays,
// hidden, under it (Undo takes it all back).
(function () {
  const $ = s => document.querySelector(s);
  let F = null; const lib = async () => F || (F = await import('/lab/lab-filters.js'));
  const KINDS = [['halftone', 'Halftone'], ['stipple', 'Stipple'], ['posterize', 'Posterize'], ['threshold', 'One ink'], ['duotone', 'Duotone']];
  const SHAPES = [['dot', 'Dots'], ['square', 'Squares'], ['diamond', 'Diamonds'], ['line', 'Lines'], ['cross', 'Crosses']];
  const S = { kind: 'halftone', cell: 14, angle: 45, shape: 'dot', mode: 'one', color: '#141416', inks: 4, cut: 128, dark: '#14213d', light: '#f1e3c6', stip: 5 };
  try { Object.assign(S, JSON.parse(localStorage.getItem('fb.studio.fx') || '{}')); } catch {}
  let L = null, SRC = null, PRE = null, T = 0;
  const css = document.createElement('style');
  css.textContent = `#fxDlg{width:min(760px,96vw);padding:0;border:1px solid var(--line);border-radius:16px}#fxDlg::backdrop{background:rgba(20,20,22,.35)}
  #fxDlg .fxw{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:0}@media(max-width:700px){#fxDlg .fxw{grid-template-columns:1fr}}
  #fxDlg .fxp{background:repeating-conic-gradient(#f1f1f3 0 25%,#fff 0 50%) 0 0/16px 16px;display:grid;place-items:center;min-height:320px;padding:12px;border-right:1px solid var(--line)}
  #fxDlg .fxp canvas{max-width:100%;max-height:60vh;object-fit:contain}
  #fxDlg .fxc{display:grid;gap:10px;align-content:start;padding:14px}#fxDlg .fxc .chips{display:flex;gap:6px;flex-wrap:wrap}
  #fxDlg .chips button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 11px;font:600 12.5px inherit;cursor:pointer;min-height:32px}#fxDlg .chips button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
  #fxDlg label.r{display:grid;grid-template-columns:70px minmax(0,1fr) 40px;align-items:center;gap:8px;font-size:12.5px}#fxDlg label.r output{text-align:right;font-variant-numeric:tabular-nums}`;
  document.head.appendChild(css);
  const dlg = document.createElement('dialog'); dlg.id = 'fxDlg'; dlg.setAttribute('aria-label', 'Print filters');
  dlg.innerHTML = `<div class="fxw"><div class="fxp"><canvas id="fxPrev"></canvas></div><div class="fxc"><div class="row" style="justify-content:space-between"><b>Print filters</b><button class="btn sm q" type="button" data-fxclose>Close</button></div><div class="chips" id="fxKinds"></div><div id="fxOpts" style="display:grid;gap:10px"></div><div class="row"><button class="btn go sm" type="button" data-fxapply>Apply</button><span class="note" id="fxNote"></span></div></div></div>`;
  document.body.appendChild(dlg);
  const rng = (k, t, a, b, st = 1, u = '') => `<label class="r"><span>${t}</span><input type="range" data-fx="${k}" min="${a}" max="${b}" step="${st}" value="${S[k]}"><output>${S[k]}${u}</output></label>`;
  const colr = (k, t) => `<label class="r"><span>${t}</span><input type="color" data-fx="${k}" value="${S[k]}"><span></span></label>`;
  function opts() {
    $('#fxKinds').innerHTML = KINDS.map(([k, t]) => `<button type="button" data-fxk="${k}" aria-pressed="${S.kind === k}">${t}</button>`).join('');
    const k = S.kind;
    $('#fxOpts').innerHTML = k === 'halftone' ? `<div class="chips">${SHAPES.map(([s, t]) => `<button type="button" data-fxs="${s}" aria-pressed="${S.shape === s}">${t}</button>`).join('')}</div>${rng('cell', 'Size', 4, 60, 1, 'px')}${rng('angle', 'Angle', 0, 90, 1, '°')}
        <div class="chips"><button type="button" data-fxm="one" aria-pressed="${S.mode === 'one'}">One ink</button><button type="button" data-fxm="own" aria-pressed="${S.mode === 'own'}">Its own colours</button></div>${S.mode === 'one' ? colr('color', 'Ink') : ''}`
      : k === 'stipple' ? `${rng('stip', 'Dot size', 2, 24, 1, 'px')}${colr('color', 'Ink')}`
      : k === 'posterize' ? rng('inks', 'Inks', 2, 8, 1)
      : k === 'threshold' ? `${rng('cut', 'Cut', 10, 245, 1)}${colr('color', 'Ink')}`
      : `${colr('dark', 'Dark')}${colr('light', 'Light')}`;
    $('#fxNote').textContent = { halftone: 'One screen: the shading as dots.', stipple: 'Hand-drawn dot shading.', posterize: 'Flat colours, one screen each.', threshold: 'One screen, solid ink.', duotone: 'Two inks; the tones are halftoned on the press.' }[k];
  }
  // the work, on a canvas the size given; dots and ink sizes are in the source's pixels, scaled with it
  async function render(src, k = 1) {
    const f = await lib(), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k)), c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, w, h); const px = x.getImageData(0, 0, w, h).data, out = canvas(w, h), o = out.getContext('2d');
    if (S.kind === 'halftone') { const cell = Math.max(2, S.cell * k), dots = f.halftone(px, w, h, { cell, angle: S.angle, shape: S.shape, mode: S.mode }); f.drawDots(o, dots, { shape: S.shape, angle: S.angle, color: S.color, cell }); }
    else if (S.kind === 'stipple') f.drawDots(o, f.stipple(px, w, h, { cell: Math.max(1.5, S.stip * k) }), { shape: 'dot', color: S.color });
    else { const rgba = S.kind === 'posterize' ? f.posterize(px, w, h, { inks: S.inks }).rgba : S.kind === 'threshold' ? f.threshold(px, w, h, { cut: S.cut, color: S.color }) : f.duotone(px, w, h, { dark: S.dark, light: S.light }); o.putImageData(new ImageData(rgba, w, h), 0, 0); }
    return out;
  }
  function open(l) {
    if (!l || l.kind === 'base' && !l.raster) { toast('Choose a layer first.'); return; }
    L = l; SRC = artOf(l); if (!SRC || SRC.width < 2) { toast('That layer is empty.'); return; }
    const k = Math.min(1, 520 / Math.max(SRC.width, SRC.height)), c = canvas(SRC.width * k, SRC.height * k); c.getContext('2d').drawImage(SRC, 0, 0, c.width, c.height);
    // the preview is the source made smaller, so its dots are made smaller with it: the settings are kept in the source's pixels
    PRE = { c, k }; opts(); dlg.showModal(); previewScaled();
  }
  function previewScaled() { clearTimeout(T); T = setTimeout(async () => { if (!PRE) return; const out = await renderScaled(); const pv = $('#fxPrev'); pv.width = out.width; pv.height = out.height; pv.getContext('2d').drawImage(out, 0, 0); }, 60); }
  async function renderScaled() { const cell = S.cell, stip = S.stip; S.cell = cell * PRE.k; S.stip = stip * PRE.k; try { return await render(PRE.c, 1); } finally { S.cell = cell; S.stip = stip; } }
  async function apply() {
    const l = L; if (!l) return; busy('Applying the filter…');
    try {
      const k = Math.min(1, 2400 / Math.max(SRC.width, SRC.height)), out = await render(SRC, k), name = `${KINDS.find(x => x[0] === S.kind)[1]} · ${l.name}`.slice(0, 60);
      const r = k < 1 ? (() => { const c = canvas(SRC.width, SRC.height); c.getContext('2d').drawImage(out, 0, 0, c.width, c.height); return c; })() : out;
      const fx = fixed(l), n = fresh('image', { name, raster: stamp(r), src: null, dirty: true, x: fx ? W / 2 : l.x, y: fx ? H / 2 : l.y, scale: fx ? 1 : l.scale, rot: fx ? 0 : l.rot, flip: fx ? false : l.flip, placement: l.placement, opacity: l.opacity });
      n._srcRid = n.raster._rid; const at = LAYERS.indexOf(l); LAYERS.splice(at + 1, 0, n); if (l.kind !== 'base') l.visible = false; SEL = n.id;
      commit(); paintPanels(); draw(); dlg.close(); try { localStorage.setItem('fb.studio.fx', JSON.stringify(S)); } catch {}
      toast(`${name}: a new layer, with "${l.name}" kept hidden under it.`);
    } catch (x) { toast(x.message); } finally { busy(); }
  }
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-fxclose]')) { dlg.close(); return; }
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.fxk) { S.kind = d.fxk; opts(); previewScaled(); } else if (d.fxs) { S.shape = d.fxs; opts(); previewScaled(); } else if (d.fxm) { S.mode = d.fxm; opts(); previewScaled(); } else if (d.fxapply !== undefined) apply();
  });
  dlg.addEventListener('input', e => { const k = e.target.dataset.fx; if (!k) return; S[k] = e.target.type === 'color' ? e.target.value : Number(e.target.value); const o = e.target.nextElementSibling; if (o?.tagName === 'OUTPUT') o.textContent = e.target.value + ({ cell: 'px', stip: 'px', angle: '°' }[k] || ''); previewScaled(); });
  document.addEventListener('click', e => { if (e.target.closest('[data-fxopen]')) open(selected()); });
  window.FX = { open, fields: l => (l && (l.kind !== 'base' || GMODE) ? `<div class="sec"><h4>Print filters</h4><div class="row"><button class="btn sm" type="button" data-fxopen>Halftone, posterize…</button></div></div>` : '') };
})();
