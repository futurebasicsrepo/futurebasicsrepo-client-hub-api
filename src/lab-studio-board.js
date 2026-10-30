// Studio, the piece as one board, and graphics as components (served as /lab/studio-board.js, loaded after the Studio's script and
// /lab/studio-pro.js, whose state it shares).
//   - Board: every frame of the piece side by side, drawn from the design as it is: the picture, the flat front and back, the flat in each
//     colourway, and at each size when the artwork is graded. A frame opens its view.
//   - Components: a graphic from the library is a component; every layer showing it is a copy (◇ in the layers). A copy can be swapped
//     for another library graphic (one or every copy), all its copies chosen at once, its main opened to edit, or detached into a plain
//     picture. Any layer can be made a component: it goes into the library and the layer becomes its first copy.
(function () {
  if (typeof VIEWS === 'undefined') return;
  VIEWS.push('board');
  const css = document.createElement('style'); css.textContent = `
.studio[data-v=board] .stage,.studio[data-v=board] .rail,.studio[data-v=board] .opts,.studio[data-v=board] .flathost,.studio[data-v=board] .pathost,.studio[data-v=board] .pic-only{display:none!important}
.studio[data-v=board] .mid{grid-column:1/span 2}.boardhost{display:none;overflow:auto;height:calc(100dvh - 140px);padding:18px 20px 40px;box-sizing:border-box}.studio[data-v=board] .boardhost{display:block}
.boardhost .bh{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px}.boardhost h3{margin:0;font-size:15px;font-weight:500}
.boardhost h4{margin:22px 0 10px;font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#5b5e66}
.boardhost .row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.boardhost figure{margin:0;width:var(--fw,260px);cursor:pointer;display:grid;gap:6px}.boardhost figure .fr{background:#fff;border:1px solid rgba(20,20,22,.14);border-radius:12px;aspect-ratio:4/5;display:grid;place-items:center;overflow:hidden;transition:box-shadow .15s,border-color .15s}
.boardhost figure:hover .fr,.boardhost figure:focus-visible .fr{border-color:#141416;box-shadow:0 8px 24px rgba(20,20,22,.12)}.boardhost figure:focus-visible{outline:none}
.boardhost figure .fr>svg,.boardhost figure .fr>img,.boardhost figure .fr>canvas{width:100%;height:100%;object-fit:contain;display:block}
.boardhost figcaption{font-size:12.5px;display:flex;justify-content:space-between;gap:8px}.boardhost figcaption small{font:500 11px 'IBM Plex Mono',monospace;color:#5b5e66}
.boardhost .sw{display:inline-block;width:10px;height:10px;border-radius:50%;box-shadow:0 0 0 1px rgba(20,20,22,.25);margin-right:6px;vertical-align:-1px}
#pLayers .ly .inst{font:600 11px 'IBM Plex Mono',monospace;color:#067a3e;margin-left:4px}
#compDlg{border:0;border-radius:18px;padding:0;width:min(760px,94vw)}#compDlg .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;max-height:56vh;overflow:auto}
#compDlg .tile{display:grid;gap:4px;border:1px solid rgba(20,20,22,.14);border-radius:10px;padding:6px;background:#fff;cursor:pointer;font-size:12px;text-align:left}#compDlg .tile img{width:100%;aspect-ratio:1;object-fit:contain;background:#f1f1ec;border-radius:6px}
#compDlg .tile:hover{border-color:#141416}`;
  document.head.appendChild(css);

  // ---- the board ----
  const seg = document.getElementById('viewSeg');
  seg?.insertAdjacentHTML('beforeend', '<button type="button" data-v="board" aria-pressed="false" title="Every frame of the piece side by side: the picture, the flats, each colourway and size">Board</button>');
  seg?.querySelector('[data-v=board]').addEventListener('click', () => setVMode('board'));
  document.querySelector('#app .mid')?.insertAdjacentHTML('beforeend', `<div class="boardhost" id="boardHost" aria-live="polite"><div class="bh"><h3 id="boardTitle">The piece</h3><label class="f" style="margin:0;display:flex;gap:8px;align-items:center"><span class="note" style="margin:0">Frame size</span><input type="range" id="boardSize" min="160" max="460" step="20" value="260" aria-label="Frame size"></label></div><div id="boardBody"><p class="note">Drawing the frames…</p></div></div>`);
  const host = document.getElementById('boardHost'), body = document.getElementById('boardBody');
  document.getElementById('boardSize').addEventListener('input', e => host.style.setProperty('--fw', e.target.value + 'px'));
  // each drawing on the board gets its own ids, so one frame's masks and clips are never another's
  let N = 0; const own = svg => { const k = 'b' + (++N); return svg.replace(/\bid="([^"]+)"/g, `id="$1_${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_${k})`).replace(/href="#([^"]+)"/g, `href="#$1_${k}"`); };
  const fig = (open, inner, cap, note = '', extra = '') => `<figure tabindex="0" role="button" data-bopen="${open}" ${extra}><div class="fr">${inner}</div><figcaption><span>${cap}</span><small>${note}</small></figcaption></figure>`;
  async function flats() { for (let i = 0; i < 100; i++) { const f = FF(); if (f?.ready?.() && f.frame) return f; if (f?.unsupported?.()) return null; await new Promise(r => setTimeout(r, 150)); } return null; }
  async function paintBoard() {
    document.getElementById('boardTitle').textContent = D?.concept?.name || 'The piece';
    compose(); const pic = canvas(Math.round(W * Math.min(1, 900 / W)), Math.round(H * Math.min(1, 900 / W))); pic.getContext('2d').drawImage(docC, 0, 0, pic.width, pic.height);
    const picUrl = pic.toDataURL('image/jpeg', .86);
    body.innerHTML = `<h4>The piece</h4><div class="row" id="bPiece">${fig('picture', `<img alt="The picture" src="${picUrl}">`, 'Picture', `${LAYERS.length} layers`)}<p class="note" id="bWait">Drawing the flats…</p></div>`;
    const f = await flats(); if (VMODE !== 'board') return;
    const wait = document.getElementById('bWait'); if (!f) { if (wait) wait.textContent = FF()?.unsupported?.() || 'The flats are not drawn for this piece.'; return; }
    wait?.remove();
    const piece = document.getElementById('bPiece'), size = f.size();
    piece.insertAdjacentHTML('beforeend', fig('front', own(f.frame('front')), 'Flat front', size) + fig('back', own(f.frame('back')), 'Flat back', size));
    const cws = f.colourways().filter(c => c.hex);
    body.insertAdjacentHTML('beforeend', `<h4>Colourways</h4><div class="row">${cws.length ? cws.map(c => fig('front', own(f.frame('front', { color: c.hex })), `<i class="sw" style="background:${esc(c.hex)}"></i>${esc(c.name || c.hex)}`, esc(c.pantone || ''), 'data-cw="1"')).join('') : '<p class="note">No colourways on the concept yet: add them under Materials, and each one is drawn here.</p>'}</div>`);
    if (f.graded()) { const sizes = f.sizes(); body.insertAdjacentHTML('beforeend', `<h4>Sizes · the artwork as graded</h4><div class="row">${sizes.map(sz => fig('front', own(f.frame('front', { size: sz })), sz, sz === size ? 'base size' : '', 'data-size="1"')).join('')}</div>`); }
    host.dataset.ready = '1';
  }
  host.addEventListener('click', e => { const fg = e.target.closest('[data-bopen]'); if (fg) setVMode(fg.dataset.bopen); });
  host.addEventListener('keydown', e => { const fg = e.target.closest('[data-bopen]'); if (fg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setVMode(fg.dataset.bopen); } });
  const setVMode0 = window.setVMode;
  window.setVMode = async (v, o) => { host.dataset.ready = ''; await setVMode0(v, o); if (VMODE === 'board') paintBoard(); };

  // ---- components ----
  const artId = l => (/^\/v1\/lab\/art\/([0-9a-f-]{36})$/.exec(l?.src || '') || [])[1] || null;
  const isCopy = l => Boolean(l && isRaster(l) && artId(l) && l.raster && l.raster._rid === l._srcRid);
  const copiesOf = l => LAYERS.filter(q => isCopy(q) && q.src === l.src);
  function compHtml(l) {
    if (!l || l.kind === 'base') return '';
    if (isCopy(l)) { const n = copiesOf(l).length;
      return `<div class="sec"><h4>Component · ◇</h4><p class="note" style="margin:0 0 8px">A copy of a graphic in the library${n > 1 ? `, one of ${n} on this piece` : ''}. Its size, place and colour are this copy's own.</p>
        <div class="row"><button class="btn sm q" type="button" data-comp="swap" title="Put another graphic from the library in its place, at the same size">Swap…</button>${n > 1 ? '<button class="btn sm q" type="button" data-comp="all">Choose every copy</button>' : ''}<a class="btn sm q" href="/lab/studio?art=${esc(artId(l))}" target="_blank" rel="noopener" title="Open the graphic itself in the Studio: change it there and update it in the library">Edit the main</a><button class="btn sm q" type="button" data-comp="detach" title="Keep it as a plain picture on this piece, no longer linked to the library">Detach</button></div></div>`; }
    return `<div class="sec"><h4>Component</h4><div class="row"><button class="btn sm q" type="button" data-comp="make" title="Put it in the graphics library and make this layer its first copy: use it on any piece, swap it, update it in one place">Make a component</button></div></div>`;
  }
  const fields0 = window.fieldsHtml; window.fieldsHtml = l => { const h = fields0(l), i = h.indexOf('</div>'); return i < 0 ? h + compHtml(l) : h.slice(0, i + 6) + compHtml(l) + h.slice(i + 6); };
  // the layer list: a copy says so
  const badge = () => { for (const r of document.querySelectorAll('#pLayers [data-ly]')) { const l = layerOf(r.dataset.ly); if (isCopy(l) && !r.querySelector('.inst')) r.querySelector('img,.th')?.insertAdjacentHTML('afterend', '<span class="inst" title="A component: a copy of a graphic in the library">◇</span>'); } };
  if (window.PRO) { const rows0 = PRO.rows; PRO.rows = () => { rows0(); badge(); }; } else { const p0 = window.paintLayers; window.paintLayers = () => { p0(); badge(); }; }

  async function rasterOf(id) { const src = await urlOfBlob(await blobOf('/v1/lab/art/' + id)), img = await imgOf(src), c = canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0); return stamp(c); }
  async function make(l) {
    busy('Putting it in the library…');
    try {
      const art = artOf(l), r = await api('/v1/lab/library/graphics/upload', { body: { image: art.toDataURL('image/png'), name: l.name, source: 'studio', techniqueId: l.finish ? l.finish.id : null } });
      const raster = await rasterOf(r.id), n = { ...fresh('image', { name: l.name }), x: l.x, y: l.y, scale: l.scale * (art.width / raster.width), rot: l.rot, flip: l.flip, opacity: l.opacity, blend: l.blend, distress: { ...l.distress }, finish: l.finish ? { ...l.finish, distress: { ...l.finish.distress } } : null, raster, src: '/v1/lab/art/' + r.id, _srcRid: raster._rid };
      LAYERS[LAYERS.indexOf(l)] = n; SEL = n.id; window.PRO?.SELS.clear(); commit(); paintPanels(); draw();
      if (typeof LIB !== 'undefined') LIB = null;
      toast(`"${l.name}" is a component now, in the graphics library. Copy it, swap it, or edit the main.`);
    } catch (x) { toast(x.message); } finally { busy(); }
  }
  // the dialog: the library's graphics, to swap a copy (or every copy) for
  function swapDlg(l) {
    let d = document.getElementById('compDlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'compDlg'; d.setAttribute('aria-labelledby', 'compH'); document.body.appendChild(d);
      d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); }); }
    const n = copiesOf(l).length;
    d.innerHTML = `<div style="padding:18px;display:grid;gap:12px"><div class="row" style="justify-content:space-between"><h3 id="compH" style="margin:0;font-size:16px">Swap ${esc(l.name)} for…</h3><button class="btn sm q" type="button" data-close>Close</button></div>
      ${n > 1 ? `<label class="note" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="compAll" checked> Every copy on this piece (${n})</label>` : ''}<input class="t" id="compQ" type="search" placeholder="Find a graphic" aria-label="Find a graphic"><div class="tiles" id="compTiles"><p class="note">Loading the library…</p></div></div>`;
    d.showModal();
    const load = async () => { const q = document.getElementById('compQ').value.trim(), t = document.getElementById('compTiles');
      try { const r = await api('/v1/lab/library/graphics?limit=60' + (q ? '&q=' + encodeURIComponent(q) : '')), gs = r.graphics.filter(g => g.id !== artId(l));
        t.innerHTML = gs.length ? gs.map(g => `<button class="tile" type="button" data-swap="${esc(g.id)}"><img alt="" data-swapimg="${esc(g.id)}">${esc(g.name)}</button>`).join('') : '<p class="note">No other graphics in the library.</p>';
        for (const im of t.querySelectorAll('[data-swapimg]')) blobOf('/v1/lab/art/' + im.dataset.swapimg).then(b => urlOfBlob(b)).then(u => { im.src = u; }).catch(() => {});
      } catch (x) { t.innerHTML = `<p class="note">${esc(x.message)}</p>`; } };
    let tm; document.getElementById('compQ').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(load, 250); }); load();
    d.querySelector('#compTiles').addEventListener('click', async e => {
      const b = e.target.closest('[data-swap]'); if (!b) return; const id = b.dataset.swap, name = b.textContent.trim().slice(0, 40) || 'Graphic', every = document.getElementById('compAll')?.checked;
      busy('Swapping…');
      try { const raster = await rasterOf(id);
        for (const q of every ? copiesOf(l) : [l]) { const w0 = window.PRO ? PRO.box(q).w : contentOf(q).width * q.scale, cx = window.PRO ? PRO.box(q).cx : q.x, cy = window.PRO ? PRO.box(q).cy : q.y;
          q.raster = raster; q.src = '/v1/lab/art/' + id; q._srcRid = raster._rid; q.name = name; q._pc = null; q._pk = null;
          if (window.PRO) { const b1 = PRO.box(q); q.scale = clamp(q.scale * (w0 / Math.max(1, b1.w)), .02, 40); const b2 = PRO.box(q); q.x += cx - b2.cx; q.y += cy - b2.cy; } }
        d.close(); commit(); paintPanels(); draw(); toast(every ? `Every copy is ${name} now, at the same size.` : `Swapped for ${name}, at the same size.`);
      } catch (x) { toast(x.message); } finally { busy(); }
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#pLayers [data-comp]'); if (!b) return; const l = selected(); if (!l) return; const a = b.dataset.comp;
    if (a === 'make') make(l);
    else if (a === 'swap') swapDlg(l);
    else if (a === 'all' && window.PRO) { PRO.SELS.clear(); for (const q of copiesOf(l)) PRO.SELS.add(q.id); SEL = l.id; paintPanels(); draw(); }
    else if (a === 'detach') { l.src = null; l.dirty = true; l._srcRid = null; commit(); paintPanels(); draw(); toast('Detached: a plain picture on this piece now.'); }
  });
  window.PRO?.extra.push(() => {
    const l = selected();
    return [{ label: 'Show the board: every frame of the piece', kind: 'View', run: () => setVMode('board') },
      ...(l && l.kind !== 'base' && !isCopy(l) ? [{ label: 'Make a component', kind: 'Component', run: () => make(l) }] : []),
      ...(isCopy(l) ? [{ label: 'Swap the component…', kind: 'Component', run: () => swapDlg(l) }, { label: 'Detach the component', kind: 'Component', run: () => { l.src = null; l.dirty = true; l._srcRid = null; commit(); paintPanels(); draw(); } }] : [])];
  });
  window.BOARD = { paint: paintBoard, isCopy, copiesOf, make };
})();
