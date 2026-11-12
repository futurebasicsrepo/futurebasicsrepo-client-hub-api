// Studio, the tool palette (served as /lab/studio-palette.js, loaded after the Studio's other scripts, whose state it shares: TOOL, OPT, CUR, D,
// setTool, setColor, recentColor). In Focus the rail becomes a palette like a notes app's pencil case:
//   - shrunk, it is one round glass button showing the tool in hand and its colour; tap it and the palette opens
//   - open, it is one glass dock with every tool laid out (no tool hides in a group), the one in hand lifted, the brushes and the eraser
//     showing their size, then the colours (the last used, black, white and the brand's) and any colour, then undo and redo and a menu
//   - drag it by its handle to the top, the foot, the left or the right edge (on a side it stands upright); drop it in a corner, or tap the
//     menu's Shrink, and it shrinks to the button there. Where it sits and whether it is shrunk are kept for next time
// It is the same rail underneath: a tool picked here is picked on the rail, so it works on the picture, a garment's flats and a bag's or a
// shoe's drawing alike (a drawing that cannot use a tool says so). Outside Focus the rail stays; with its names shown it lists every tool.
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const KEY = 'fb.studio.palette', esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let S = { dock: 'top', shrunk: false, bx: 14, by: 120 }; try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private window */ }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* fine */ } };
  // in Focus, on the picture and the flats (a garment's, or a bag's or a shoe's drawing): the Pattern and the Board have no use for drawing tools
  const focusOn = () => Boolean(document.documentElement.dataset.focus) && !$('#app')?.classList.contains('hidden') && ['picture', 'front', 'back'].includes($('.studio')?.dataset.v || 'picture');
  // the tools, in the rail's order and its groups (a rule between groups), every one of them
  const SIZED = { brush: 'size', eraser: 'esize', distress: 'dsize', liquify: 'size' };
  const INKED = ['brush', 'fill', 'text', 'rect', 'ellipse', 'polygon', 'star', 'line', 'pen', 'typepath'];
  function tools() {
    const out = []; let grp = 0;
    for (const el of $('.rail')?.children || []) { if (el.tagName === 'HR') { grp++; continue; } if (el.matches('button[data-tool]')) out.push({ t: el.dataset.tool, name: el.getAttribute('aria-label') || el.dataset.tool, title: el.title || '', svg: el.querySelector('svg')?.outerHTML || '', grp, pro: el.classList.contains('pro-only') }); }
    return out;
  }
  function swatches() {
    let r = []; try { r = JSON.parse(localStorage.getItem('fb.studio.colors') || '[]'); } catch { /* fine */ }
    const base = ['#141416', '#ffffff', ...(((typeof D !== 'undefined' && D && D.palette) || []).map(x => x.hex))];
    return [...new Set([...r, ...base].map(x => String(x).toLowerCase()).filter(x => /^#[0-9a-f]{6}$/.test(x)))].slice(0, 6);
  }
  // on a bag's or a shoe's drawing some tools work only on the picture: those are dimmed, and say so
  const can = () => { try { return typeof VMODE !== 'undefined' && (VMODE === 'front' || VMODE === 'back') && typeof FF === 'function' && FF()?.tools ? new Set(FF().tools()) : null; } catch { return null; } };
  const cur = () => (typeof CUR === 'string' ? CUR : '#141416').toLowerCase(), tool = () => (typeof TOOL === 'string' ? TOOL : 'select');
  const sizeOf = t => { const k = SIZED[t]; return k && typeof OPT === 'object' && OPT[k] != null ? Math.round(OPT[k]) : null; };
  const ICON = { undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg>', redo: '<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/></svg>', more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' };

  function build() {
    if ($('#palette')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="pal" id="palette" role="toolbar" aria-label="Tools" hidden></div><button type="button" class="pal-pin" id="palPin" aria-label="Open the tools" hidden></button>`);
    const css = document.createElement('style'); css.textContent = CSS; document.head.append(css);
    wire();
  }
  // the room the palette takes on its edge, as --pal-l / --pal-t / --pal-r / --pal-b: the Studio keeps the options, the side panel, the zoom and
  // the picture clear of it, and hands it to the flats and the drawings in their frames (window.FBLAYOUT)
  let LAST = '';
  function room() {
    const p = $('#palette'), z = { l: 0, t: 0, r: 0, b: 0 };
    if (p && !p.hidden) { const r = p.getBoundingClientRect(), g = 8; if (S.dock === 'left') z.l = Math.round(r.right + g); else if (S.dock === 'right') z.r = Math.round(innerWidth - r.left + g); else if (S.dock === 'bottom') z.b = Math.round(innerHeight - r.top + g); else z.t = Math.round(r.bottom + g); }
    const k = JSON.stringify(z); if (k === LAST) return; LAST = k;
    for (const [a, v] of Object.entries(z)) document.documentElement.style.setProperty(`--pal-${a}`, v + 'px');
    try { window.FBLAYOUT?.(z); } catch { /* the Studio not ready */ }
  }
  function paint() {
    const p = $('#palette'), pin = $('#palPin'); if (!p) return;
    const on = focusOn(); document.documentElement.classList.toggle('pal-on', on);
    p.hidden = !on || S.shrunk; pin.hidden = !on || !S.shrunk; if (!on || S.shrunk) document.documentElement.classList.remove('pal-left', 'pal-right'); if (!on) { room(); return; }
    const t = tool(), c = cur(), list = tools(), active = list.find(x => x.t === t) || list[0], ok = can();
    if (S.shrunk) {
      pin.innerHTML = `${active?.svg || ''}<i style="background:${esc(c)}"></i>`; pin.title = `${active?.name || 'Tools'}: tap for every tool`;
      pin.style.left = Math.max(6, Math.min(innerWidth - 66, S.bx)) + 'px'; pin.style.top = Math.max(6, Math.min(innerHeight - 66, S.by)) + 'px'; room(); return;
    }
    p.dataset.dock = S.dock; for (const k of ['left', 'right']) document.documentElement.classList.toggle('pal-' + k, S.dock === k);
    let last = -1; const cols = swatches();
    p.innerHTML = `<span class="pal-grip" data-grip title="Drag to move the tools to another edge; drop in a corner to shrink them" aria-hidden="true"></span>
      <span class="pal-g"><button type="button" class="pal-c" data-pa="undo" aria-label="Undo" title="Undo">${ICON.undo}</button><button type="button" class="pal-c" data-pa="redo" aria-label="Redo" title="Redo">${ICON.redo}</button></span>
      <span class="pal-tools">${list.map(x => { const sep = last >= 0 && x.grp !== last; last = x.grp; const n = sizeOf(x.t);
        return `${sep ? '<i class="pal-sep" aria-hidden="true"></i>' : ''}<button type="button" class="pal-t${ok && !ok.has(x.t) ? ' pal-na' : ''}" data-pt="${esc(x.t)}" aria-pressed="${x.t === t}" aria-label="${esc(x.name)}" title="${esc(ok && !ok.has(x.t) ? x.name + ': works on the picture, not on this drawing' : x.title)}">${x.svg}${INKED.includes(x.t) ? `<i class="pal-ink" style="background:${esc(c)}"></i>` : ''}${n != null ? `<small>${n}</small>` : ''}</button>`; }).join('')}</span>
      <span class="pal-cols" role="radiogroup" aria-label="Colour">${cols.map(x => `<button type="button" class="pal-sw" data-psw="${x}" role="radio" aria-checked="${x === c}" aria-label="Colour ${x}" style="--c:${x}"></button>`).join('')}<label class="pal-sw pal-any" title="Any colour"><input type="color" data-pany value="${esc(c)}" aria-label="Any colour"></label></span>
      <span class="pal-g"><button type="button" class="pal-c" data-pa="more" aria-label="More" aria-expanded="false" title="More">${ICON.more}</button></span>`;
    room();
  }
  function menu(btn) {
    $('#palMenu')?.remove(); const m = document.createElement('div'); m.id = 'palMenu'; m.className = 'pal-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = [['shrink', 'Shrink to a button'], ['top', 'Dock at the top'], ['bottom', 'Dock at the foot'], ['left', 'Dock on the left'], ['right', 'Dock on the right'], ['names', 'What each tool does']].map(([k, l]) => `<button type="button" role="menuitem" data-pm="${k}" ${S.dock === k ? 'aria-current="true"' : ''}>${l}</button>`).join('');
    document.body.append(m); const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px'; m.style.top = (r.bottom + m.offsetHeight + 8 > innerHeight ? r.top - m.offsetHeight - 8 : r.bottom + 8) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!e.target.closest('#palMenu')) { m.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', off, true); } }, true), 0);
  }
  function names() {
    $('#palNames')?.remove(); const d = document.createElement('div'); d.id = 'palNames'; d.className = 'pal-menu pal-names'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'What each tool does');
    d.innerHTML = `<b>Every tool</b>${tools().map(x => `<button type="button" data-pt="${esc(x.t)}">${x.svg}<span><b>${esc(x.name)}</b><small>${esc((typeof TOOL_HELP === 'object' && TOOL_HELP[x.t]) || x.title)}</small></span></button>`).join('')}`;
    document.body.append(d); d.style.left = Math.max(8, (innerWidth - d.offsetWidth) / 2) + 'px'; d.style.top = Math.max(8, (innerHeight - d.offsetHeight) / 2) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!e.target.closest('#palNames')) { d.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
  }
  function pick(t) { if (typeof setTool === 'function') setTool(t); }
  function colour(c) { if (typeof setColor === 'function') setColor(c); if (typeof recentColor === 'function') recentColor(c); if (typeof paintOpts === 'function') paintOpts(); paint(); }
  function wire() {
    document.addEventListener('click', e => {
      if (e.target.closest('#palPin') && e.detail === 0) { S.shrunk = false; keep(); paint(); $('#palette [aria-pressed=true]')?.focus(); return; }
      const t = e.target.closest('#palette [data-pt],#palNames [data-pt]'); if (t) { pick(t.dataset.pt); $('#palNames')?.remove(); return; }
      const sw = e.target.closest('#palette [data-psw]'); if (sw) { colour(sw.dataset.psw); return; }
      const a = e.target.closest('#palette [data-pa]'); if (a) { if (a.dataset.pa === 'undo') $('#railUndo')?.click(); else if (a.dataset.pa === 'redo') $('#railRedo')?.click(); else menu(a); return; }
      const m = e.target.closest('#palMenu [data-pm]'); if (m) { const k = m.dataset.pm; $('#palMenu').remove();
        if (k === 'shrink') shrinkAt(null); else if (k === 'names') names(); else { S.dock = k; S.shrunk = false; keep(); paint(); } return; }
    });
    document.addEventListener('input', e => { if (e.target.matches('#palette [data-pany]') && typeof setColor === 'function') setColor(e.target.value); });
    document.addEventListener('change', e => { if (e.target.matches('#palette [data-pany]')) colour(e.target.value); });
    // the handle: drag to an edge to dock there, into a corner to shrink there
    let drag = null;
    document.addEventListener('pointerdown', e => {
      const g = e.target.closest('#palette [data-grip]'), pin = e.target.closest('#palPin');
      if (!g && !pin) return; e.preventDefault();
      drag = { pin: Boolean(pin), x0: e.clientX, y0: e.clientY, moved: false, el: pin || $('#palette'), id: e.pointerId };
      try { drag.el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    document.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0; if (!drag.moved && Math.hypot(dx, dy) < 6) return; drag.moved = true;
      drag.el.style.transform = drag.pin ? '' : `translate(${dx}px,${dy}px)`; drag.el.classList.add('pal-drag');
      if (drag.pin) { S.bx = e.clientX - 30; S.by = e.clientY - 30; drag.el.style.left = S.bx + 'px'; drag.el.style.top = S.by + 'px'; }
      else { const z = zoneOf(e.clientX, e.clientY); $$('.pal-ghost').forEach(x => x.remove()); document.body.insertAdjacentHTML('beforeend', `<i class="pal-ghost" data-z="${z}"></i>`); }
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; d.el.classList.remove('pal-drag'); d.el.style.transform = ''; $$('.pal-ghost').forEach(x => x.remove());
      if (d.pin) { if (!d.moved) { S.shrunk = false; keep(); paint(); return; } S.bx = e.clientX < innerWidth / 2 ? 14 : innerWidth - 74; keep(); paint(); return; } // a shrunk button settles on the nearer side
      if (!d.moved) return; const z = zoneOf(e.clientX, e.clientY);
      if (z.startsWith('corner')) shrinkAt({ x: e.clientX, y: e.clientY }); else { S.dock = z; keep(); paint(); }
    };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
    // the palette follows the tool, the colour and the sizes as they change anywhere
    let t0 = '', c0 = '', s0 = '';
    setInterval(() => { if (!focusOn() && $('#palette')?.hidden && $('#palPin')?.hidden) return; const ok = can(), s = Object.values(SIZED).map(k => OPT?.[k]).join() + (typeof VMODE !== 'undefined' ? VMODE : '') + (ok ? '|' + [...ok].join() : ''); /* the tools the drawing takes are watched too: its frame can finish loading after the view changed, and the picture-only tools stayed undimmed until the next change of tool */ if (tool() !== t0 || cur() !== c0 || s !== s0) { t0 = tool(); c0 = cur(); s0 = s; paint(); } }, 250);
    new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-focus'] });
    const st = $('.studio'); if (st) new MutationObserver(() => apply()).observe(st, { attributes: true, attributeFilter: ['data-v'] });
    window.addEventListener('resize', () => paint());
  }
  function zoneOf(x, y) {
    const w = innerWidth, h = innerHeight, c = 110;
    if ((x < c || x > w - c) && (y < c || y > h - c)) return `corner-${y < c ? 't' : 'b'}${x < c ? 'l' : 'r'}`;
    const d = { top: y, bottom: h - y, left: x, right: w - x }; return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
  }
  function shrinkAt(at) {
    S.shrunk = true; if (at) { S.bx = at.x < innerWidth / 2 ? 14 : innerWidth - 74; S.by = at.y < innerHeight / 2 ? 120 : innerHeight - 140; }
    else { const r = $('#palette').getBoundingClientRect(); S.bx = S.dock === 'right' ? innerWidth - 74 : 14; S.by = S.dock === 'bottom' ? innerHeight - 140 : Math.max(120, r.top); }
    keep(); paint();
  }
  function apply() { paint(); }
  window.PALETTE = { open: () => { S.shrunk = false; keep(); apply(); }, shrink: () => shrinkAt(null), dock: d => { S.dock = d; S.shrunk = false; keep(); paint(); }, state: () => ({ ...S }), tools: () => tools().map(x => x.t) };

  const CSS = `
html.pal-on .studio:not([data-v=split]) .rail,html.pal-on .studio:not([data-v=split]) #railLabels{display:none!important}
html[data-focus] .studio:is([data-v=pattern],[data-v=board]) :is(.rail,#railLabels,#opts,.size-dock){display:none!important}
/* in Focus everything floating keeps clear of the palette's edge */
html[data-focus] .studio:not([data-v=split]) .opts{left:max(78px,var(--pal-l,0px));right:max(78px,var(--pal-r,0px))}
html[data-focus] .studio:not([data-v=split]) .size-dock{left:max(76px,var(--pal-l,0px))}
html[data-focus] .studio[data-panel=on]:not([data-v=split]) .opts{right:calc(362px + var(--pal-r,0px));max-width:calc(100% - max(78px,var(--pal-l,0px)) - 362px - var(--pal-r,0px))}
/* the no-picture card floats above the bottom bars (size, product/exploded, zoom), in the room left of the panel */
html[data-focus] .fpbar{bottom:calc(72px + var(--pal-b,0px));max-width:calc(100vw - 180px)}
html[data-focus]:has(.studio[data-panel=on]:not([data-v=split])) .fpbar{left:calc((100vw - 362px) / 2);max-width:calc(100vw - 362px - 40px)}
@media (max-width:900px){html[data-focus] .fpbar{bottom:calc(132px + var(--pal-b,0px))}} /* on an upright iPad the flats' size dock runs to two lines */
/* on the top or the foot, with the panel open, the palette keeps to the room left of the panel (and scrolls along if it is wider) */
html:has(.studio[data-panel=on]:not([data-v=split])) .pal:is([data-dock=top],[data-dock=bottom]){left:calc((100vw - 362px) / 2);max-width:calc(100vw - 362px - 24px);overflow-x:auto;scrollbar-width:none}
html[data-focus] .studio:not([data-v=split]) .side{right:calc(10px + var(--pal-r,0px));bottom:calc(10px + var(--pal-b,0px))}
html[data-focus] .studio:not([data-v=split]) .zoom{bottom:calc(12px + var(--pal-b,0px));right:calc(12px + var(--pal-r,0px))}
html.pal-left .studio:not([data-v=split]) .size-dock{left:112px}html.pal-right .studio:not([data-v=split]) .size-dock{left:auto;right:112px}
.pal,.pal-pin,.pal-menu{--g:rgba(24,24,27,.8);--gl:rgba(255,255,255,.14);color:#f4f4f2;background:var(--g);-webkit-backdrop-filter:blur(26px) saturate(1.8);backdrop-filter:blur(26px) saturate(1.8);border:1px solid var(--gl);box-shadow:0 18px 44px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.12)}
.pal{position:fixed;z-index:60;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 14px;border-radius:44px;max-width:calc(100vw - 24px);font:500 12px/1 'Space Grotesk',system-ui,sans-serif;transition:transform .32s cubic-bezier(.2,.9,.25,1.15),box-shadow .2s}
.pal[hidden],.pal-pin[hidden]{display:none!important}
.pal[data-dock=top]{top:112px;left:50%;translate:-50% 0}.pal[data-dock=bottom]{bottom:14px;left:50%;translate:-50% 0}
.pal[data-dock=left]{left:10px;top:66px;bottom:10px;flex-direction:column;padding:12px 7px;max-height:none}.pal[data-dock=right]{right:10px;top:66px;bottom:10px;flex-direction:column;padding:12px 7px;max-height:none}
.pal-grip{position:absolute;left:50%;top:5px;width:44px;height:5px;margin-left:-22px;border-radius:5px;background:rgba(255,255,255,.28);cursor:grab;touch-action:none}
.pal-grip::before{content:'';position:absolute;inset:-12px -20px}.pal[data-dock=left] .pal-grip,.pal[data-dock=right] .pal-grip{top:50%;left:5px;width:5px;height:44px;margin:-22px 0 0}
.pal-g,.pal-tools,.pal-cols{display:flex;align-items:flex-end;gap:2px}.pal[data-dock=left] :is(.pal-g,.pal-tools,.pal-cols),.pal[data-dock=right] :is(.pal-g,.pal-tools,.pal-cols){flex-direction:column;align-items:center}
.pal-tools{overflow:auto;scrollbar-width:none;padding:4px 2px 0;min-width:0;min-height:0}.pal-tools::-webkit-scrollbar{display:none}
.pal-c{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:inherit;display:grid;place-items:center;cursor:pointer}.pal-c:hover{background:rgba(255,255,255,.18)}
.pal-c svg,.pal-t svg,.pal-pin svg,.pal-names svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.pal-c[data-pa=more] svg{fill:currentColor;stroke:none}
.pal-t{position:relative;flex:none;width:40px;height:58px;border:0;border-radius:14px 14px 8px 8px;background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.02));color:#d8d8dc;display:grid;place-items:start center;padding-top:9px;cursor:pointer;transition:transform .22s cubic-bezier(.2,.9,.25,1.3),background .2s,color .2s}
.pal-t:hover{color:#fff;transform:translateY(-3px)}.pal-t[aria-pressed=true]{transform:translateY(-10px);color:#141416;background:linear-gradient(180deg,#fafaf7,#d9d9d4);box-shadow:0 8px 18px rgba(0,0,0,.35)}
.pal[data-dock=left] .pal-t,.pal[data-dock=right] .pal-t{width:50px;height:36px;border-radius:14px 8px 8px 14px;place-items:center start;padding:0 0 0 10px}.pal[data-dock=left] .pal-t[aria-pressed=true]{transform:translateX(10px)}.pal[data-dock=right] .pal-t[aria-pressed=true]{transform:translateX(-10px)}
.pal-t.pal-na{opacity:.35}
.pal-t.pal-na{opacity:.35}
.pal-ink{position:absolute;left:9px;right:9px;bottom:16px;height:4px;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.18)}.pal[data-dock=left] .pal-ink,.pal[data-dock=right] .pal-ink{left:auto;right:14px;top:9px;bottom:9px;width:4px;height:auto}
.pal-t small{position:absolute;bottom:4px;left:0;right:0;text-align:center;font:500 9px 'IBM Plex Mono',monospace;opacity:.75}.pal[data-dock=left] .pal-t small,.pal[data-dock=right] .pal-t small{bottom:auto;left:auto;right:4px;width:auto}
.pal-sep{flex:none;width:1px;height:34px;margin:0 6px 10px;background:rgba(255,255,255,.16)}.pal[data-dock=left] .pal-sep,.pal[data-dock=right] .pal-sep{width:34px;height:1px;margin:6px 0}
.pal-cols{display:grid;grid-template-columns:repeat(4,30px);gap:7px;align-items:center}.pal[data-dock=left] .pal-cols,.pal[data-dock=right] .pal-cols{grid-template-columns:repeat(2,24px);gap:5px}.pal[data-dock=left] .pal-sw,.pal[data-dock=right] .pal-sw{width:24px;height:24px}.pal[data-dock=left] .pal-c,.pal[data-dock=right] .pal-c{width:34px;height:34px}
.pal-sw{width:30px;height:30px;border-radius:50%;border:0;padding:0;background:var(--c);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);cursor:pointer;position:relative}
.pal-sw[aria-checked=true]{box-shadow:0 0 0 2px #1c1c1e,0 0 0 4px #fff}.pal-any{background:conic-gradient(#f43,#fd3,#4c6,#3cf,#66f,#c4f,#f43);display:block;overflow:hidden}
.pal-any input{opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
.pal-pin{position:fixed;z-index:60;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;cursor:pointer;touch-action:none;transition:box-shadow .2s,transform .2s}.pal-pin:hover{transform:scale(1.05)}
.pal-pin svg{width:26px;height:26px}.pal-pin i{position:absolute;right:13px;bottom:13px;width:11px;height:11px;border-radius:50%;box-shadow:0 0 0 2px rgba(28,28,30,.9),0 0 0 3px rgba(255,255,255,.4)}
.pal-drag{transition:none!important;opacity:.92;cursor:grabbing}
.pal-ghost{position:fixed;z-index:59;pointer-events:none;border-radius:40px;border:2px dashed rgba(75,255,154,.9);background:rgba(75,255,154,.08)}
.pal-ghost[data-z=top]{top:108px;left:20%;right:20%;height:82px}.pal-ghost[data-z=bottom]{bottom:10px;left:20%;right:20%;height:82px}.pal-ghost[data-z=left]{left:6px;top:15%;bottom:15%;width:82px}.pal-ghost[data-z=right]{right:6px;top:15%;bottom:15%;width:82px}
.pal-ghost[data-z^=corner]{width:72px;height:72px;border-radius:50%}.pal-ghost[data-z=corner-tl]{left:8px;top:110px}.pal-ghost[data-z=corner-tr]{right:8px;top:110px}.pal-ghost[data-z=corner-bl]{left:8px;bottom:60px}.pal-ghost[data-z=corner-br]{right:8px;bottom:60px}
.pal-menu{position:fixed;z-index:70;display:grid;gap:2px;padding:6px;border-radius:18px;min-width:220px}
.pal-menu button{all:unset;cursor:pointer;padding:9px 12px;border-radius:12px;font:500 13px 'Space Grotesk',system-ui,sans-serif}.pal-menu button:hover,.pal-menu button:focus-visible{background:rgba(255,255,255,.12)}.pal-menu [aria-current=true]{color:#4bff9a}
.pal-names{width:min(560px,calc(100vw - 24px));max-height:min(640px,calc(100vh - 24px));overflow:auto;grid-template-columns:1fr 1fr;padding:14px}.pal-names>b{grid-column:1/-1;font-size:15px;padding:2px 6px 8px}
.pal-names button{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start}.pal-names small{display:block;opacity:.65;font-size:11.5px;line-height:1.35;margin-top:2px}
.pal button:focus-visible,.pal-pin:focus-visible{outline:2px solid #4bff9a;outline-offset:2px}
@media (max-width:820px){.pal[data-dock=top],.pal[data-dock=bottom]{left:12px;right:12px;translate:none}.pal-cols{grid-template-columns:repeat(3,28px)}}
@media (prefers-reduced-motion:reduce){.pal,.pal-t,.pal-pin{transition:none}}`;

  build(); apply();
})();
