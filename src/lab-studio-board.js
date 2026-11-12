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
html[data-focus] .studio[data-v=board] .boardhost{padding-top:72px;height:100%}.studio[data-v=board] .mid{grid-column:1/span 2}.boardhost{display:none;overflow:auto;height:calc(100dvh - 140px);padding:18px 20px 40px;box-sizing:border-box}.studio[data-v=board] .boardhost{display:block}
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
#compDlg .tile:hover{border-color:#141416}
/* the turns are full-length photographs: a portrait frame on the model's own grey, the whole figure in it; a tap opens it large */
.boardhost figure[data-turn] .fr{aspect-ratio:2/3;background:#cdd0d5;position:relative}.boardhost figure[data-turn] .fr .zm{position:absolute;right:8px;bottom:8px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.78);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 2px 8px rgba(0,0,0,.18);font-size:16px;pointer-events:none}
.studio[data-panel=on][data-v=board] .boardhost{padding-right:20px}html[data-focus] .studio[data-panel=on][data-v=board] .boardhost{padding-right:384px}html[data-focus] .studio[data-v=board] .boardhost{padding-left:24px;padding-bottom:96px}
#turnZoom{border:0;padding:0;margin:0;width:100vw;height:100dvh;max-width:none;max-height:none;background:rgba(18,18,20,.92);color:#f4f4f2}#turnZoom::backdrop{background:transparent}
#turnZoom .tz-stage{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab}#turnZoom .tz-stage.drag{cursor:grabbing}
#turnZoom .tz-bar{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));translate:-50% 0;display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:999px;background:rgba(40,40,44,.72);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.14);font:500 13px 'Space Grotesk',system-ui,sans-serif;max-width:calc(100vw - 24px);overflow-x:auto}
#turnZoom .tz-bar button,#turnZoom .tz-bar a{min-width:40px;height:40px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;padding:0 12px;cursor:pointer;text-decoration:none;display:grid;place-items:center;flex:none}#turnZoom .tz-bar button:hover,#turnZoom .tz-bar a:hover{background:rgba(255,255,255,.12)}#turnZoom .tz-bar button:disabled{opacity:.35}
#turnZoom .tz-bar b{padding:0 8px;white-space:nowrap;font-weight:500}#turnZoom .tz-bar .tz-z{font-variant-numeric:tabular-nums;min-width:52px;text-align:center;opacity:.8}
#turnZoom .tz-layer{position:absolute;left:50%;top:50%;transform-origin:0 0}#turnZoom .tz-layer>img{position:absolute;inset:0;width:100%;height:100%;user-select:none;-webkit-user-drag:none}#turnZoom .tz-paint{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#turnZoom .tz-stage.painting{cursor:crosshair}#turnZoom .tz-g{position:absolute;cursor:move;outline:calc(2px * var(--k,1)) dashed #2a6df4;outline-offset:calc(3px * var(--k,1))}#turnZoom .tz-g>img{display:block;width:100%;pointer-events:none}
#turnZoom .tz-g i,#turnZoom .tz-g b{position:absolute;width:calc(22px * var(--k,1));height:calc(22px * var(--k,1));border-radius:50%;background:#2a6df4;border:calc(2px * var(--k,1)) solid #fff;box-sizing:border-box}#turnZoom .tz-sz{right:calc(-14px * var(--k,1));bottom:calc(-14px * var(--k,1));cursor:nwse-resize}#turnZoom .tz-rt{left:50%;top:calc(-34px * var(--k,1));translate:-50% 0;cursor:grab;background:#3dfa9a!important}#turnZoom .tz-del{left:calc(-14px * var(--k,1));top:calc(-14px * var(--k,1));background:#141416!important;color:#fff;font:700 calc(11px * var(--k,1))/calc(18px * var(--k,1)) system-ui;text-align:center;cursor:pointer}
#turnZoom .tz-edit{position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;bottom:calc(84px + env(safe-area-inset-bottom));width:310px;overflow:auto;padding:14px;border-radius:20px;background:rgba(40,40,44,.82);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.14);display:grid;align-content:start;gap:10px;font:13px/1.4 'Space Grotesk',system-ui,sans-serif}#turnZoom .tz-edit[hidden]{display:none}
#turnZoom .tz-edit h4{margin:0 34px 0 0;font-size:15px;font-weight:600}#turnZoom .tz-h{margin:0;opacity:.75;font-size:12px}#turnZoom .tz-gs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}#turnZoom .tz-gt{display:grid;gap:3px;justify-items:center;padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:11px;cursor:pointer;min-height:44px}#turnZoom .tz-gt img{width:100%;aspect-ratio:1;object-fit:contain;background:repeating-conic-gradient(#555 0 25%,#444 0 50%) 0 0/12px 12px;border-radius:8px}#turnZoom .tz-gt small{opacity:.6}
#turnZoom .tz-dt{display:flex;gap:6px;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:inherit;font-size:12px;cursor:pointer;margin:0 6px 6px 0}#turnZoom .tz-dt i{width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,.5)}
#turnZoom .tz-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}#turnZoom .tz-row button{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:inherit;font:inherit;cursor:pointer}#turnZoom .tz-row button[aria-pressed=true],#turnZoom .tz-row button.go{background:#3dfa9a;color:#141416;border-color:#3dfa9a}#turnZoom .tz-brush{flex:1;min-width:80px}
#turnZoom .tz-say{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:inherit;font:inherit;font-size:16px;padding:8px 10px;resize:vertical}#turnZoom .tz-chk{display:flex;gap:8px;align-items:flex-start;font-size:12px}#turnZoom .tz-msg{margin:0;min-height:1.2em;font-size:12px;color:#3dfa9a}
#turnZoom [data-tz=edit][aria-pressed=true]{background:#3dfa9a;color:#141416}#turnZoom.editing .tz-x{right:338px}
#turnZoom .tz-x{position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(40,40,44,.72);color:#fff;font-size:20px;cursor:pointer}`;
  document.head.appendChild(css);

  // ---- the board ----
  const seg = document.getElementById('viewSeg');
  seg?.insertAdjacentHTML('beforeend', '<button type="button" data-v="board" aria-pressed="false" title="Every frame of the piece side by side: the picture, the flats, each colourway and size">Board</button>');
  seg?.querySelector('[data-v=board]').addEventListener('click', () => setVMode('board'));
  document.querySelector('#app .mid')?.insertAdjacentHTML('beforeend', `<div class="boardhost" id="boardHost" aria-live="polite"><div class="bh"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn go sm" type="button" id="turnsBtn" title="Draw the piece on a model from the front, three-quarter, side and back, following the flats as they are now">Make the turns from the flats</button><h3 id="boardTitle">The piece</h3></div><label class="f" style="margin:0;display:flex;gap:8px;align-items:center"><span class="note" style="margin:0;white-space:nowrap">Frame size</span><input type="range" id="boardSize" min="160" max="460" step="20" value="260" aria-label="Frame size"></label></div><div id="boardBody"><p class="note">Drawing the frames…</p></div></div>`);
  const host = document.getElementById('boardHost'), body = document.getElementById('boardBody');
  document.getElementById('boardSize').addEventListener('input', e => host.style.setProperty('--fw', e.target.value + 'px'));
  // each drawing on the board gets its own ids, so one frame's masks and clips are never another's
  let N = 0; const own = svg => { const k = 'b' + (++N); return svg.replace(/\bid="([^"]+)"/g, `id="$1_${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_${k})`).replace(/href="#([^"]+)"/g, `href="#$1_${k}"`); };
  const fig = (open, inner, cap, note = '', extra = '') => `<figure tabindex="0" role="button" data-bopen="${open}" ${extra}><div class="fr">${inner}</div><figcaption><span>${cap}</span><small>${note}</small></figcaption></figure>`;
  async function flats() { for (let i = 0; i < 100; i++) { const f = FF(); if (f?.ready?.() && f.frame) return f; if (f?.unsupported?.()) return null; await new Promise(r => setTimeout(r, 150)); } return null; }
  async function paintBoard() {
    document.getElementById('boardTitle').textContent = D?.concept?.name || 'The piece';
    compose(); const pic = canvas(Math.round(W * Math.min(1, 900 / W)), Math.round(H * Math.min(1, 900 / W))); pic.getContext('2d').drawImage(docC, 0, 0, pic.width, pic.height);
    // the picture goes on the board as the canvas itself (making it a JPEG first took a quarter of a second on an iPad)
    body.innerHTML = `<h4>The piece</h4><div class="row" id="bPiece">${fig('picture', '<span data-bpic></span>', 'Picture', `${LAYERS.length} layers`)}<p class="note" id="bWait">Drawing the flats…</p></div>`;
    pic.setAttribute('role', 'img'); pic.setAttribute('aria-label', 'The picture'); body.querySelector('[data-bpic]')?.replaceWith(pic);
    const f = await flats(); if (VMODE !== 'board') return;
    const wait = document.getElementById('bWait'); if (!f) { if (wait) wait.textContent = FF()?.unsupported?.() || 'The flats are not drawn for this piece.'; return; }
    wait?.remove();
    const piece = document.getElementById('bPiece'), size = f.size();
    piece.insertAdjacentHTML('beforeend', fig('front', own(f.frame('front')), f.viewLabels?.()?.wrap ? f.viewLabels().front : 'Flat front', size) + fig('back', own(f.frame('back')), f.viewLabels?.()?.wrap ? f.viewLabels().back : 'Flat back', size)); // a cup's two flats are its sides and its wrap
    const cws = f.colourways().filter(c => c.hex);
    body.insertAdjacentHTML('beforeend', `<h4>Colourways</h4><div class="row">${cws.length ? cws.map(c => fig('front', own(f.frame('front', { color: c.hex })), `<i class="sw" style="background:${esc(c.hex)}"></i>${esc(c.name || c.hex)}`, esc(c.pantone || ''), 'data-cw="1"')).join('') : '<p class="note">No colourways on the concept yet: add them under Materials, and each one is drawn here.</p>'}</div>`);
    body.insertAdjacentHTML('beforeend', `<h4>Turns</h4><div class="row" id="bTurns"><p class="note">Looking for the turns…</p></div><h4>Walk</h4><div class="row" id="bWalk"></div>`); paintTurns();
    if (f.graded()) { const sizes = f.sizes(); body.insertAdjacentHTML('beforeend', `<h4>Sizes · the artwork as graded</h4><div class="row">${sizes.map(sz => fig('front', own(f.frame('front', { size: sz })), sz, sz === size ? 'base size' : '', 'data-size="1"')).join('')}</div>`); }
    host.dataset.ready = '1';
  }
  // ---- the turns: the piece on a model from four sides, drawn from the flats as they are now (the views service, src/lab-view-routes.js) ----
  const TURNS = [['model_front', 'Front'], ['model_34', 'Three-quarter'], ['model_side', 'Side'], ['model_back', 'Back']], TURN_SRC = {};
  let turnT = 0;
  // the walk: a short film of the model walking in the piece, started from the front turn (a video model: Google's Veo with the Google AI key)
  let WALK_SRC = {};
  async function paintWalk(v, video) {
    const box = document.getElementById('bWalk'); if (!box) return; const w = v.walk, front = v.model_front?.status === 'ready';
    if (w?.status === 'ready' && w.has) { const key = String(w.at); if (!WALK_SRC[key]) { try { WALK_SRC = { [key]: await urlOfBlob(await blobOf(`/v1/lab/concepts/${CID}/views/walk`)) }; } catch { WALK_SRC = {}; } }
      if (document.getElementById('bWalk') !== box) return;
      box.innerHTML = `${WALK_SRC[key] ? `<video src="${WALK_SRC[key]}" controls loop playsinline muted style="width:var(--fw,260px);border-radius:12px;background:#000"></video>` : ''}<div style="display:grid;gap:8px;align-content:start;justify-items:start;max-width:260px"><button class="btn sm" type="button" data-walk>Make it again</button><p class="note" style="margin:0">From the front turn. Make the turns again first if the piece changed.</p></div>`; return; }
    box.innerHTML = w?.status === 'pending' ? '<p class="note">Making the walk… it takes a few minutes.</p>'
      : !video ? '<p class="note">No video model is connected. Add the Google AI key (GEMINI_API_KEY) to the server to make the walk.</p>'
      : `<div style="display:grid;gap:8px;align-content:start;justify-items:start;max-width:320px"><button class="btn go sm" type="button" data-walk ${front ? '' : 'disabled'}>Make the walk</button>${w?.status === 'failed' ? `<p class="note" style="margin:0;color:#a02a20">The last walk could not be made: ${esc(w.note || 'no reason given')}</p>` : ''}<p class="note" style="margin:0">${front ? 'An 8-second film of the model walking in the piece, from the front turn.' : 'Make the turns first: the walk starts from the front turn.'}</p></div>`;
  }
  document.getElementById('boardHost').addEventListener('click', async e => {
    const b = e.target.closest('[data-walk]'); if (!b) return; b.disabled = true;
    try { await api(`/v1/lab/concepts/${CID}/walk`, { body: {} }); toast('Making the walk. It plays here in a few minutes.'); paintTurns(); } catch (x) { toast(x.message); b.disabled = false; }
  });
  async function paintTurns() {
    clearTimeout(turnT); const row = document.getElementById('bTurns'); if (!row || !CID) return;
    let v, ws = {}; try { ws = await api(`/v1/lab/concepts/${CID}/views`); v = ws.views || {}; } catch { row.innerHTML = '<p class="note">The turns could not be looked up.</p>'; return; }
    const have = TURNS.filter(([k]) => v[k]);
    if (!have.length) { row.innerHTML = '<p class="note">No turns yet. <b>Make the turns from the flats</b> draws the piece on a model from four sides, following the flats.</p>'; paintWalk(v, ws.video); return; }
    const cells = [];
    for (const [k, label] of TURNS) { const s = v[k]; if (!s) continue;
      let inner = `<p class="note" style="padding:12px;text-align:center">${s.status === 'pending' ? 'Drawing…' : esc(s.note || 'Not drawn')}</p>`;
      if (s.status === 'ready' && s.has) { const key = `${k}|${s.at}`; if (!TURN_SRC[key]) { try { TURN_SRC[key] = await urlOfBlob(await blobOf(`/v1/lab/concepts/${CID}/views/${k}?thumb=1`)); } catch { TURN_SRC[key] = ''; } } if (TURN_SRC[key]) inner = `<img alt="${esc(label)} on a model" src="${TURN_SRC[key]}">`; }
      cells.push(`<figure tabindex="0" data-turn="${k}"${s.status === 'ready' && s.has ? ` role="button" aria-label="Open the ${esc(label.toLowerCase())} turn large"` : ''}><div class="fr">${inner}${s.status === 'ready' && s.has ? '<span class="zm" aria-hidden="true">⤢</span>' : ''}</div><figcaption><span>${esc(label)}</span><small>${s.status === 'pending' ? 'drawing' : s.status === 'failed' ? 'failed' : ''}</small></figcaption>${s.status === 'ready' && s.note ? `<p class="note" style="margin:0;color:#8a5a00">${esc(s.note)}</p>` : ''}</figure>`); }
    if (document.getElementById('bTurns') !== row) return; row.innerHTML = cells.join('');
    paintWalk(v, ws.video);
    if ([...TURNS.map(([k]) => k), 'walk'].some(k => v[k]?.status === 'pending') && VMODE === 'board') turnT = setTimeout(paintTurns, 5000);
  }
  document.getElementById('turnsBtn').addEventListener('click', async () => {
    if (D?.concept?.locked) { toast('This concept is already a tech pack.'); return; }
    const ok = await ask('Make the turns from the flats?', 'The piece is drawn on a model from the front, three-quarter, side and back, following the flats as they are now: their shape, colour blocks, collar, cuffs, pockets and graphics. Turns made before are replaced. It uses four views of the image model.', 'Make the turns'); if (!ok) return;
    const b = document.getElementById('turnsBtn'); b.disabled = true; busy('Saving the flats and starting the turns…');
    try { if (typeof saveAll === 'function' && (await saveAll()) === false) throw new Error('The flats could not be saved, so the turns were not started');
      const r = await api(`/v1/lab/concepts/${CID}/views`, { body: { kinds: TURNS.map(t => t[0]), from: 'flats' } });
      toast(`Drawing ${r.started || 4} turns from the flats. They fill in below in a few minutes.`); paintTurns(); }
    catch (x) { toast(x.message); } finally { busy(); b.disabled = false; }
  });
  host.addEventListener('click', e => { const fg = e.target.closest('[data-bopen]'); if (fg) setVMode(fg.dataset.bopen); });
  // ---- a turn, large: the full picture (not the thumbnail), fitted to the screen; pinch, the wheel, a double tap or the buttons zoom, a drag
  // pans; the arrows (and the arrow keys) step through the turns ----
  const FULL_SRC = {}; let TG = null; // the piece's graphics to place on a turn (from its flats), asked once
  const turnLabel = k => (TURNS.find(t => t[0] === k) || [])[1] || '';
  async function zoomTurn(k) {
    const ready = [...document.querySelectorAll('#bTurns figure[data-turn][role=button]')].map(f => f.dataset.turn); if (!ready.includes(k)) return;
    let d = document.getElementById('turnZoom');
    if (!d) { document.body.insertAdjacentHTML('beforeend', `<dialog id="turnZoom" aria-label="A turn, large"><div class="tz-stage"><div class="tz-layer"><img alt=""><canvas class="tz-paint"></canvas></div></div><button class="tz-x" type="button" data-tz="close" aria-label="Close">✕</button>
      <aside class="tz-edit" hidden><h4>Edit this turn</h4>
        <p class="tz-h">Graphics on this piece: tap one to put it on, then drag it into place, its corner to size it, the dot to turn it.</p><div class="tz-gs"></div>
        <div class="tz-ds"></div>
        <div class="tz-row"><button type="button" data-tz="paint" aria-pressed="false">Paint an area</button><input type="range" min="8" max="120" value="36" class="tz-brush" aria-label="Brush size"><button type="button" data-tz="clear">Clear</button></div>
        <textarea class="tz-say" rows="2" placeholder="What to change in the painted area: make the belt loop mustard yellow"></textarea>
        <label class="tz-chk"><input type="checkbox" class="tz-blend" checked> Work the graphics into the cloth (one AI generation)</label>
        <div class="tz-row"><button type="button" class="go" data-tz="apply">Apply</button><button type="button" data-tz="undo">Undo last edit</button></div><p class="tz-msg" role="status"></p></aside>
      <div class="tz-bar"><button type="button" data-tz="prev" aria-label="The turn before">‹</button><b class="tz-n"></b><button type="button" data-tz="next" aria-label="The next turn">›</button><button type="button" data-tz="out" aria-label="Zoom out">−</button><span class="tz-z">100%</span><button type="button" data-tz="in" aria-label="Zoom in">+</button><button type="button" data-tz="fit">Fit</button><button type="button" data-tz="edit" aria-pressed="false">Edit</button><a data-tz="save" download>Save</a></div></dialog>`); d = document.getElementById('turnZoom'); wireZoom(d); }
    d.dataset.k = k; d.querySelector('.tz-n').textContent = turnLabel(k);
    d.querySelector('[data-tz=prev]').disabled = ready.indexOf(k) <= 0; d.querySelector('[data-tz=next]').disabled = ready.indexOf(k) >= ready.length - 1;
    d._reset?.(); if (!d.open) d.showModal();
    const img = d.querySelector('img'), thumb = document.querySelector(`#bTurns figure[data-turn="${k}"] img`)?.src; if (thumb) { img.src = thumb; img.onload = () => d._fit(); }
    try { const key = k + '|' + thumb; if (!FULL_SRC[key]) FULL_SRC[key] = await urlOfBlob(await blobOf(`/v1/lab/concepts/${CID}/views/${k}`)); if (d.dataset.k === k) { img.src = FULL_SRC[key]; const a = d.querySelector('[data-tz=save]'); a.href = img.src; a.download = `${(D?.concept?.name || 'turn').replace(/[^\w -]+/g, '')} ${k.replace('model_', '')}.jpg`; } } catch { /* the thumbnail stays */ }
    if (d.classList.contains('editing')) d._graphics();
  }
  function wireZoom(d) {
    const st = d.querySelector('.tz-stage'), lay = d.querySelector('.tz-layer'), img = d.querySelector('img'), cv = d.querySelector('.tz-paint'), z = d.querySelector('.tz-z'), msg = d.querySelector('.tz-msg');
    let k = 1, x = 0, y = 0, fitK = 1, painting = false, placed = [];
    const W = () => img.naturalWidth || 1, H = () => img.naturalHeight || 1;
    const paint = () => { lay.style.width = W() + 'px'; lay.style.height = H() + 'px'; lay.style.transform = `translate(${x}px,${y}px) scale(${k})`; z.textContent = Math.round(k / fitK * 100) + '%'; for (const g of placed) g.el.style.setProperty('--k', 1 / k); };
    d._fit = () => { const ed = d.classList.contains('editing'), SW = st.clientWidth - (ed ? 340 : 0), SH = st.clientHeight - 80; fitK = Math.min(SW / W(), SH / H()) * .96; k = fitK; x = -W() * k / 2 - (ed ? 170 : 0); y = -H() * k / 2 - 30;
      if (cv.width !== W() || cv.height !== H()) { cv.width = W(); cv.height = H(); } paint(); };
    // a point on the screen → a point on the picture (its own pixels)
    const toImg = (cx, cy) => { const r = st.getBoundingClientRect(); return [(cx - r.left - r.width / 2 - x) / k, (cy - r.top - r.height / 2 - y) / k]; };
    const at = (nk, cx, cy) => { nk = Math.min(Math.max(nk, fitK * .5), fitK * 8); const r = st.getBoundingClientRect(), px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2; x = px - (px - x) * nk / k; y = py - (py - y) * nk / k; k = nk; paint(); };
    const mid = () => { const r = st.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    st.addEventListener('wheel', e => { e.preventDefault(); at(k * Math.exp(-e.deltaY * .0025), e.clientX, e.clientY); }, { passive: false });
    // ---- the graphics put on the picture: drag to move, the corner to size, the dot to turn ----
    const place = g => { const el = g.el; el.style.left = (g.x * W()) + 'px'; el.style.top = (g.y * H()) + 'px'; el.style.width = (g.w * W()) + 'px'; el.style.transform = `translate(-50%,-50%) rotate(${g.rot}deg)`; };
    const addGraphic = src => { const el = document.createElement('div'); el.className = 'tz-g'; el.innerHTML = `<img alt="${esc(src.name)}" src="${src.png}"><i class="tz-sz" title="Drag to size"></i><i class="tz-rt" title="Drag to turn"></i><b class="tz-del" title="Take it off">✕</b>`;
      const g = { id: src.id, name: src.name, x: .5, y: d.dataset.k === 'model_back' ? .36 : .42, w: .14, rot: 0, el }; lay.appendChild(el); placed.push(g); place(g); paint(); return g; };
    const pts = new Map(); let last = null, drag = null;
    st.addEventListener('pointerdown', e => {
      const gel = e.target.closest('.tz-g'); st.setPointerCapture(e.pointerId);
      if (gel) { const g = placed.find(q => q.el === gel); if (e.target.classList.contains('tz-del')) { gel.remove(); placed = placed.filter(q => q !== g); return; }
        const [ix, iy] = toImg(e.clientX, e.clientY); drag = { g, mode: e.target.classList.contains('tz-sz') ? 'size' : e.target.classList.contains('tz-rt') ? 'turn' : 'move', ix, iy, g0: { ...g } }; return; }
      if (painting && e.pointerType !== 'touch' || painting && pts.size === 0 && e.isPrimary) { drag = { mode: 'paint' }; dab(e); return; }
      pts.set(e.pointerId, [e.clientX, e.clientY]); st.classList.add('drag'); last = null; });
    const dab = e => { const [ix, iy] = toImg(e.clientX, e.clientY), c = cv.getContext('2d'), r = Number(d.querySelector('.tz-brush').value) / 2 / (k / fitK); c.fillStyle = 'rgba(42,109,244,.45)'; c.beginPath(); c.arc(ix, iy, r, 0, Math.PI * 2); c.fill(); cv.dataset.on = '1'; };
    st.addEventListener('pointermove', e => {
      if (drag) { if (drag.mode === 'paint') { dab(e); return; } const [ix, iy] = toImg(e.clientX, e.clientY), g = drag.g, g0 = drag.g0, cx = g0.x * W(), cy = g0.y * H();
        if (drag.mode === 'move') { g.x = Math.min(Math.max(g0.x + (ix - drag.ix) / W(), 0), 1); g.y = Math.min(Math.max(g0.y + (iy - drag.iy) / H(), 0), 1); }
        else if (drag.mode === 'size') { const d0 = Math.hypot(drag.ix - cx, drag.iy - cy) || 1, d1 = Math.hypot(ix - cx, iy - cy); g.w = Math.min(Math.max(g0.w * d1 / d0, .02), .9); }
        else { g.rot = Math.round((Math.atan2(iy - cy, ix - cx) - Math.atan2(drag.iy - cy, drag.ix - cx)) * 180 / Math.PI + g0.rot); }
        place(g); return; }
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { x += e.clientX - prev[0]; y += e.clientY - prev[1]; paint(); return; }
      const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (last) { x += c[0] - last.c[0]; y += c[1] - last.c[1]; at(k * dist / last.dist, c[0], c[1]); } last = { dist, c }; });
    const up = e => { drag = null; pts.delete(e.pointerId); last = null; if (!pts.size) st.classList.remove('drag'); }; st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('dblclick', e => { if (painting || e.target.closest('.tz-g')) return; k > fitK * 1.05 ? d._fit() : at(fitK * 2.5, e.clientX, e.clientY); });
    const clearPaint = () => { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); delete cv.dataset.on; };
    d._reset = () => { for (const g of placed) g.el.remove(); placed = []; clearPaint(); msg.textContent = ''; d.querySelector('.tz-say').value = ''; };
    // the piece's graphics (the ones on the side this turn faces first) and its coloured parts
    d._graphics = async () => { const box = d.querySelector('.tz-gs'), ds = d.querySelector('.tz-ds');
      try { if (!TG) TG = await api(`/v1/lab/concepts/${CID}/turn-graphics`); } catch (x) { box.innerHTML = `<p class="tz-h">${esc(x.message)}</p>`; return; }
      const v = d.dataset.k === 'model_back' ? 'back' : d.dataset.k === 'model_side' ? '' : 'front', list = [...TG.graphics].sort((a, b) => (b.view === v) - (a.view === v));
      box.innerHTML = list.length ? list.map(g => `<button type="button" class="tz-gt" data-tg="${esc(g.id)}" title="${esc(g.name)} · ${esc(g.technique || '')} · on the ${esc(g.view)}"><img alt="" src="${g.png}"><span>${esc(g.name)}</span><small>${esc(g.view)}</small></button>`).join('') : '<p class="tz-h">No graphics on the flats yet: place one on the Flat front or back first.</p>';
      ds.innerHTML = TG.details?.length ? `<p class="tz-h">Coloured parts: tap one, then paint over it on the turn.</p>${TG.details.map(p => `<button type="button" class="tz-dt" data-dn="${esc(p.name)}" data-dc="${esc(p.color)}"><i style="background:${esc(p.color)}"></i>${esc(p.name)} <small>${esc(p.view)}</small></button>`).join('')}` : ''; };
    const setEdit = on => { d.classList.toggle('editing', on); d.querySelector('.tz-edit').hidden = !on; d.querySelector('[data-tz=edit]').setAttribute('aria-pressed', String(on)); if (on) d._graphics(); else { painting = false; d.querySelector('[data-tz=paint]').setAttribute('aria-pressed', 'false'); st.classList.remove('painting'); } d._fit(); };
    const step = n => { const ready = [...document.querySelectorAll('#bTurns figure[data-turn][role=button]')].map(f => f.dataset.turn), i = ready.indexOf(d.dataset.k) + n; if (ready[i]) zoomTurn(ready[i]); };
    async function apply() {
      const b = d.querySelector('[data-tz=apply]'), say = d.querySelector('.tz-say').value.trim(), blend = d.querySelector('.tz-blend').checked;
      if (!placed.length && !cv.dataset.on) { msg.textContent = 'Put a graphic on the turn, or paint an area and say what to change.'; return; }
      if (cv.dataset.on && !say) { msg.textContent = 'Say what to change in the painted area.'; return; }
      // the painted area as a mask the size of the picture: painted = change it
      let mask = null; if (cv.dataset.on) { const m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height; const c = m.getContext('2d'); c.drawImage(cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#000'; c.fillRect(0, 0, m.width, m.height); mask = m.toDataURL('image/png'); }
      b.disabled = true; msg.textContent = blend || mask ? 'Working it into the turn… about a minute' : 'Setting it on…';
      try { const r = await api(`/v1/lab/concepts/${CID}/views/${d.dataset.k}/edit`, { method: 'POST', body: { graphics: placed.map(g => ({ id: g.id, x: g.x, y: g.y, w: g.w, rot: g.rot })), mask, prompt: say, blend } });
        await refreshTurn(); msg.textContent = r.blended ? 'Done: the turn is updated. Undo last edit takes it back.' : 'Set on. Undo last edit takes it back.'; }
      catch (x) { msg.textContent = x.message; } finally { b.disabled = false; } }
    async function refreshTurn() { const k0 = d.dataset.k; for (const key of Object.keys(FULL_SRC)) if (key.startsWith(k0 + '|')) delete FULL_SRC[key]; await paintTurns(); zoomTurn(k0); }
    d.addEventListener('click', async e => { const t = e.target.closest('[data-tg]'); if (t) { const g = TG?.graphics.find(q => q.id === t.dataset.tg); if (g) addGraphic(g); return; }
      const dt = e.target.closest('[data-dn]'); if (dt) { d.querySelector('.tz-say').value = `make the ${dt.dataset.dn.toLowerCase()} ${dt.dataset.dc} exactly, as on the flats`; if (!painting) d.querySelector('[data-tz=paint]').click(); return; }
      const b = e.target.closest('[data-tz]'); if (!b) return; const a = b.dataset.tz;
      if (a === 'close') d.close(); else if (a === 'prev') step(-1); else if (a === 'next') step(1); else if (a === 'in') at(k * 1.4, ...mid()); else if (a === 'out') at(k / 1.4, ...mid()); else if (a === 'fit') d._fit();
      else if (a === 'edit') setEdit(!d.classList.contains('editing'));
      else if (a === 'paint') { painting = !painting; b.setAttribute('aria-pressed', String(painting)); st.classList.toggle('painting', painting); }
      else if (a === 'clear') clearPaint();
      else if (a === 'apply') apply();
      else if (a === 'undo') { b.disabled = true; try { await api(`/v1/lab/concepts/${CID}/views/${d.dataset.k}/undo`, { method: 'POST', body: {} }); await refreshTurn(); msg.textContent = 'Back to the turn as it was.'; } catch (x) { msg.textContent = x.message; } finally { b.disabled = false; } } });
    d.addEventListener('keydown', e => { if (e.target.closest('textarea,input')) return; if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); else if (e.key === '+' || e.key === '=') at(k * 1.4, ...mid()); else if (e.key === '-') at(k / 1.4, ...mid()); else if (e.key === '0') d._fit(); });
    d.addEventListener('close', () => setEdit(false));
    addEventListener('resize', () => { if (d.open) d._fit(); });
  }
  host.addEventListener('click', e => { const fg = e.target.closest('figure[data-turn][role=button]'); if (fg) zoomTurn(fg.dataset.turn); });
  host.addEventListener('keydown', e => { const fg = e.target.closest('figure[data-turn][role=button]'); if (fg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); zoomTurn(fg.dataset.turn); } });
  window.zoomTurn = zoomTurn;
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
