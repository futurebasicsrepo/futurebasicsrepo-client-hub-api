// Studio, the professional layer: what makes the picture feel like a designer's tool (served as /lab/studio-pro.js, loaded after the Studio's own
// script, whose state it shares: LAYERS, SEL, W, H, Z, PPI, draw(), commit(), …).
//   - more than one layer at a time: Shift-click (on the picture or in the layer list), drag a box round them, ⌘A; they move, nudge, duplicate
//     and delete together
//   - smart guides: a layer being moved snaps to the picture's edges and middle and to the other layers' edges and middles, with the line shown
//     (hold Alt to move freely)
//   - align and distribute (to each other, or to the picture when one layer is chosen), in the bar above the picture and with Alt + a letter
//   - where it is, typed: X, Y, width and height in inches
//   - ⌘K: every command by name; ? lists the keys
(function () {
  const SELS = new Set();
  let GUIDES = [], MARQ = null;
  const movable = l => l && l.visible && !fixed(l) && l.kind !== 'base';
  // the primary selection (SEL) is always one of the set; anything else selected the old way resets the set to it
  const ensure = () => { if (!SEL || !layerOf(SEL)) { SELS.clear(); return; } if (!SELS.has(SEL)) { SELS.clear(); SELS.add(SEL); } for (const id of [...SELS]) if (!layerOf(id)) SELS.delete(id); };
  const chosen = () => { ensure(); return [...SELS].map(layerOf).filter(movable); };
  const multi = () => chosen().length > 1;

  // ---- where a layer's ink is on the picture: the box round what it draws, not round its canvas (type has room round it) ----
  const INK = new Map();
  function inkLocal(l) {
    const src = contentOf(l), key = sig(l) + '|' + src.width + 'x' + src.height; if (INK.has(key)) return INK.get(key);
    const k = Math.min(1, 300 / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k)), c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 16) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    const r = x1 < 0 ? { x0: 0, y0: 0, x1: src.width, y1: src.height, w: src.width, h: src.height } : { x0: x0 / k, y0: y0 / k, x1: (x1 + 1) / k, y1: (y1 + 1) / k, w: src.width, h: src.height };
    if (INK.size > 300) INK.clear(); INK.set(key, r); return r;
  }
  function box(l) {
    const r = inkLocal(l), c = Math.cos(l.rot), s = Math.sin(l.rot), f = l.flip ? -1 : 1;
    const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(([a, b]) => { a = (a - r.w / 2) * l.scale * f; b = (b - r.h / 2) * l.scale; return [l.x + a * c - b * s, l.y + a * s + b * c]; });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    return { ...b, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0 };
  }
  const union = bs => { const b = { x0: Math.min(...bs.map(q => q.x0)), y0: Math.min(...bs.map(q => q.y0)), x1: Math.max(...bs.map(q => q.x1)), y1: Math.max(...bs.map(q => q.y1)) }; return { ...b, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0 }; };

  // ---- smart guides: the moving box's edges and middle snap to the picture's and to every other layer's ----
  function snapDelta(b0, dx0, dy0, skip, free) {
    GUIDES = []; if (free) return [dx0, dy0];
    const th = 6 / Z, others = LAYERS.filter(l => movable(l) && !skip.has(l.id)).map(box);
    const xs = [0, W / 2, W, ...others.flatMap(o => [o.x0, o.cx, o.x1])], ys = [0, H / 2, H, ...others.flatMap(o => [o.y0, o.cy, o.y1])];
    const best = (edges, targets) => { let m = null; for (const e of edges) for (const t of targets) { const d = t - e; if (Math.abs(d) <= th && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, t }; } return m; };
    const bx = best([b0.x0 + dx0, b0.cx + dx0, b0.x1 + dx0], xs), by = best([b0.y0 + dy0, b0.cy + dy0, b0.y1 + dy0], ys);
    const dx = dx0 + (bx ? bx.d : 0), dy = dy0 + (by ? by.d : 0);
    if (bx) GUIDES.push({ x: bx.t }); if (by) GUIDES.push({ y: by.t });
    return [dx, dy];
  }
  // one layer dragged the Studio's own way: snapped here (the Studio calls this from its move)
  function snap1(g, x, y, e) {
    if (!g.b0) { g.b0 = box(g.l); g.sx = g.l.x; g.sy = g.l.y; }
    const [ddx, ddy] = snapDelta(g.b0, x - g.ox - g.sx, y - g.oy - g.sy, new Set([g.l.id]), e.altKey);
    g.l.x = Math.round(g.sx + ddx); g.l.y = Math.round(g.sy + ddy); g.moved = true;
  }

  // ---- the pointer on the picture, with the select tool (the Studio asks first; true = handled here) ----
  function down(e, x, y) {
    if (TOOL !== 'select') return false;
    const h = hit(x, y);
    if (e.shiftKey) {
      if (h && movable(h)) { ensure(); if (SELS.has(h.id) && SELS.size > 1) { SELS.delete(h.id); SEL = [...SELS].pop(); } else { SELS.add(h.id); SEL = h.id; } paintPanels(); draw(); return true; }
      MARQ = { x0: x, y0: y, x1: x, y1: y, add: true }; DRAG = { mode: 'marquee', pid: e.pointerId, type: e.pointerType }; draw(); return true;
    }
    if (h && multi() && SELS.has(h.id)) { const ls = chosen().filter(l => !l.locked); DRAG = { mode: 'gmove', x0: x, y0: y, start: ls.map(l => [l, l.x, l.y]), b0: union(ls.map(box)), pid: e.pointerId, type: e.pointerType }; return true; }
    // empty canvas, or the garment photo under everything: a box to choose by
    if (!h || !movable(h)) { MARQ = { x0: x, y0: y, x1: x, y1: y, add: false, under: h }; DRAG = { mode: 'marquee', pid: e.pointerId, type: e.pointerType }; draw(); return true; }
    return false;
  }
  function move(g, x, y, e) {
    if (g.mode === 'marquee') { MARQ.x1 = x; MARQ.y1 = y; draw(); return true; }
    if (g.mode === 'gmove') { const [ddx, ddy] = snapDelta(g.b0, x - g.x0, y - g.y0, new Set(g.start.map(s => s[0].id)), e.altKey); for (const [l, sx0, sy0] of g.start) { l.x = Math.round(sx0 + ddx); l.y = Math.round(sy0 + ddy); } g.moved = true; draw(); paintFields(); return true; }
    return false;
  }
  function end(g) {
    GUIDES = [];
    if (g.mode !== 'marquee') return false;
    const m = MARQ; MARQ = null;
    if (Math.abs(m.x1 - m.x0) * Z < 4 && Math.abs(m.y1 - m.y0) * Z < 4) { if (!m.add) { SELS.clear(); SEL = m.under ? m.under.id : null; } paintPanels(); draw(); return true; }
    const r = { x0: Math.min(m.x0, m.x1), y0: Math.min(m.y0, m.y1), x1: Math.max(m.x0, m.x1), y1: Math.max(m.y0, m.y1) };
    const hits = LAYERS.filter(movable).filter(l => { const b = box(l); return b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1; });
    if (!m.add) SELS.clear(); else ensure();
    for (const l of hits) SELS.add(l.id);
    SEL = hits.length ? hits[hits.length - 1].id : m.add ? SEL : null; if (!SEL) SELS.clear();
    paintPanels(); draw(); return true;
  }

  // ---- drawn over the picture: every chosen layer's box, the box round them all, the drag box and the guides ----
  function overlay(x) {
    x.save();
    if (multi() && TOOL === 'select') {
      const bs = chosen().map(box); x.strokeStyle = 'rgba(20,20,22,.7)'; x.lineWidth = 1; x.setLineDash([4, 3]);
      for (const b of bs) x.strokeRect(sx(b.x0), sy(b.y0), b.w * Z, b.h * Z);
      x.setLineDash([]); const u = union(bs); x.strokeStyle = '#141416'; x.strokeRect(sx(u.x0) - 3, sy(u.y0) - 3, u.w * Z + 6, u.h * Z + 6);
      x.font = '600 11px "IBM Plex Mono",monospace'; const t = `${bs.length} layers${PPI ? ` · ${fin(u.w / PPI)} × ${fin(u.h / PPI)} in` : ''}`, tw = x.measureText(t).width + 12;
      x.fillStyle = '#141416'; x.fillRect(sx(u.x0) - 3, sy(u.y1) + 8, tw, 20); x.fillStyle = '#fff'; x.fillText(t, sx(u.x0) + 3, sy(u.y1) + 22);
    }
    if (MARQ) { const a = sx(Math.min(MARQ.x0, MARQ.x1)), b = sy(Math.min(MARQ.y0, MARQ.y1)), w = Math.abs(MARQ.x1 - MARQ.x0) * Z, h = Math.abs(MARQ.y1 - MARQ.y0) * Z; x.fillStyle = 'rgba(75,255,154,.12)'; x.fillRect(a, b, w, h); x.strokeStyle = '#12b864'; x.lineWidth = 1; x.strokeRect(a, b, w, h); }
    if (GUIDES.length && DRAG) { x.strokeStyle = '#e0218a'; x.lineWidth = 1; for (const g of GUIDES) { x.beginPath(); if (g.x != null) { x.moveTo(sx(g.x), sy(0)); x.lineTo(sx(g.x), sy(H)); } else { x.moveTo(sx(0), sy(g.y)); x.lineTo(sx(W), sy(g.y)); } x.stroke(); } }
    x.restore();
  }

  // ---- align and distribute ----
  const shift = (l, dx, dy) => { l.x = Math.round(l.x + dx); l.y = Math.round(l.y + dy); };
  function align(how) {
    const ls = chosen().filter(l => !l.locked); if (!ls.length) { toast('Choose a layer first.'); return; }
    const to = ls.length === 1 ? { x0: 0, y0: 0, x1: W, y1: H, cx: W / 2, cy: H / 2 } : union(ls.map(box));
    for (const l of ls) { const b = box(l); ({ left: () => shift(l, to.x0 - b.x0, 0), hcenter: () => shift(l, to.cx - b.cx, 0), right: () => shift(l, to.x1 - b.x1, 0), top: () => shift(l, 0, to.y0 - b.y0), vcenter: () => shift(l, 0, to.cy - b.cy), bottom: () => shift(l, 0, to.y1 - b.y1) })[how](); }
    commit(); draw(); paintFields();
  }
  function distribute(axis) {
    const ls = chosen().filter(l => !l.locked); if (ls.length < 3) { toast('Choose three layers or more to space them evenly.'); return; }
    const bs = ls.map(l => [l, box(l)]).sort((a, b) => axis === 'h' ? a[1].x0 - b[1].x0 : a[1].y0 - b[1].y0);
    const span = axis === 'h' ? bs[bs.length - 1][1].x1 - bs[0][1].x0 : bs[bs.length - 1][1].y1 - bs[0][1].y0, used = bs.reduce((s, [, b]) => s + (axis === 'h' ? b.w : b.h), 0), gap = (span - used) / (bs.length - 1);
    let at = axis === 'h' ? bs[0][1].x0 : bs[0][1].y0;
    for (const [l, b] of bs) { if (axis === 'h') shift(l, at - b.x0, 0); else shift(l, 0, at - b.y0); at += (axis === 'h' ? b.w : b.h) + gap; }
    commit(); draw(); paintFields();
  }
  const ALIGN = [['left', 'Align left', 'Alt A', 'M4 3v18M8 7h12v4H8zM8 13h7v4H8z'], ['hcenter', 'Align centres across', 'Alt H', 'M12 3v18M6 7h12v4H6zM8.5 13h7v4h-7z'], ['right', 'Align right', 'Alt D', 'M20 3v18M4 7h12v4H4zM9 13h7v4H9z'],
    ['top', 'Align top', 'Alt W', 'M3 4h18M7 8v12h4V8zM13 8v7h4V8z'], ['vcenter', 'Align middles', 'Alt V', 'M3 12h18M7 6v12h4V6zM13 8.5v7h4v-7z'], ['bottom', 'Align bottom', 'Alt S', 'M3 20h18M7 4v12h4V4zM13 9v7h4V9z']];
  const DIST = [['h', 'Space evenly across', 'M4 4v16M20 4v16M9 8h6v8H9z'], ['v', 'Space evenly up and down', 'M4 4h16M4 20h16M8 9h8v6H8z']];
  const icon = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  // the bar above the picture, with the select tool: the arrangement buttons, with what they work on
  function opts(o) {
    if (TOOL !== 'select' || VMODE !== 'picture') return;
    const n = chosen().length, to = n === 1 ? 'to the picture' : n > 1 ? 'to each other' : '';
    o.insertAdjacentHTML('afterbegin', `<span class="proar" role="group" aria-label="Arrange">${ALIGN.map(([k, t, key, d]) => `<button type="button" class="ico" data-arr="${k}" title="${t} ${to} (${key})" aria-label="${t}" ${n ? '' : 'disabled'}>${icon(d)}</button>`).join('')}<i></i>${DIST.map(([k, t, d]) => `<button type="button" class="ico" data-dist="${k}" title="${t} (three or more)" aria-label="${t}" ${n > 2 ? '' : 'disabled'}>${icon(d)}</button>`).join('')}${n > 1 ? `<b>${n} chosen</b>` : ''}</span>`);
  }
  // the selection changed: the bar's buttons follow it, without redrawing the rest of the bar
  function optsRefresh() { const o = document.getElementById('opts'); if (!o) return; o.querySelector('.proar')?.remove(); window.PRO.opts(o); }
  document.addEventListener('click', e => { const a = e.target.closest('#opts [data-arr]'), d = e.target.closest('#opts [data-dist]'); if (a) align(a.dataset.arr); else if (d) distribute(d.dataset.dist); });

  // ---- the panel: where it is, typed in inches (one layer), or what is chosen (several) ----
  const unit = () => (PPI ? 'in' : 'px'), toU = v => (PPI ? v / PPI : v), fromU = v => (PPI ? v * PPI : v);
  function geoHtml(l) {
    if (!movable(l)) return '';
    const b = box(l), f = v => fin(toU(v));
    return `<div class="geo" role="group" aria-label="Where it is, ${unit() === 'in' ? 'in inches' : 'in pixels'}">${[['x', 'X', b.x0], ['y', 'Y', b.y0], ['w', 'W', b.w], ['h', 'H', b.h]].map(([k, lab, v]) => `<label title="${{ x: 'From the left edge of the picture to its left edge', y: 'From the top of the picture to its top', w: 'Its width (the ink, not the empty margin)', h: 'Its height' }[k]}"><span>${lab}</span><input class="t" type="number" step="${PPI ? .05 : 1}" data-geo="${k}" value="${f(v)}" ${l.locked ? 'disabled' : ''}><small>${unit()}</small></label>`).join('')}</div>`;
  }
  function multiHtml() {
    const ls = chosen(), u = union(ls.map(box)), f = v => fin(toU(v));
    return `<div class="sec"><h4>${ls.length} layers chosen</h4><p class="note" style="margin:0 0 8px">${esc(ls.map(l => l.name).join(', '))}</p>
      <div class="geo" role="group" aria-label="All of them"><label><span>X</span><input class="t" type="number" step="${PPI ? .05 : 1}" data-mgeo="x" value="${f(u.x0)}"><small>${unit()}</small></label><label><span>Y</span><input class="t" type="number" step="${PPI ? .05 : 1}" data-mgeo="y" value="${f(u.y0)}"><small>${unit()}</small></label><label><span>W</span><output>${f(u.w)}</output><small>${unit()}</small></label><label><span>H</span><output>${f(u.h)}</output><small>${unit()}</small></label></div>
      <div class="row" style="margin-top:10px">${ALIGN.map(([k, t, key, d]) => `<button type="button" class="btn sm q ico" data-arr="${k}" title="${t} (${key})" aria-label="${t}">${icon(d)}</button>`).join('')}${DIST.map(([k, t, d]) => `<button type="button" class="btn sm q ico" data-dist="${k}" title="${t}" aria-label="${t}" ${ls.length > 2 ? '' : 'disabled'}>${icon(d)}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm q" data-mact="dup">Duplicate them</button><button type="button" class="btn sm q" data-mact="del">Delete them</button><button type="button" class="btn sm q" data-mact="none">Choose none</button></div>
      <p class="note">Shift-click adds or takes one away; drag a box round them on the picture; ⌘A chooses every layer. Hold Alt while moving to switch the guides off.</p></div>`;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('#pLayers [data-arr]'), d = e.target.closest('#pLayers [data-dist]'), m = e.target.closest('#pLayers [data-mact]');
    if (a) align(a.dataset.arr); else if (d) distribute(d.dataset.dist); else if (m) ({ dup: dupAll, del: delAll, none: () => { SELS.clear(); SEL = null; paintPanels(); draw(); } })[m.dataset.mact]();
  });
  document.addEventListener('change', e => {
    const g = e.target.closest?.('#pLayers [data-geo],#pLayers [data-mgeo]'); if (!g) return; const v = Number(g.value); if (!Number.isFinite(v)) return;
    if (g.dataset.geo) {
      const l = selected(); if (!movable(l) || l.locked) return; const b = box(l), k = g.dataset.geo, t = fromU(v);
      if (k === 'x') shift(l, t - b.x0, 0); else if (k === 'y') shift(l, 0, t - b.y0); else if (t > 0) { const s = t / (k === 'w' ? b.w : b.h); const cx = b.cx, cy = b.cy; l.scale = clamp(l.scale * s, .02, 40); const n = box(l); shift(l, cx - n.cx, cy - n.cy); }
    } else { const ls = chosen().filter(l => !l.locked), u = union(ls.map(box)), t = fromU(v); for (const l of ls) g.dataset.mgeo === 'x' ? shift(l, t - u.x0, 0) : shift(l, 0, t - u.y0); }
    commit(); draw(); paintPanels();
  });

  // ---- several at once: delete, duplicate, nudge, choose all ----
  function delAll() { const ls = chosen().filter(l => !l.locked); if (!ls.length) return; const ids = new Set(ls.map(l => l.id)); LAYERS = LAYERS.filter(l => !ids.has(l.id)); SELS.clear(); SEL = null; commit(); paintPanels(); draw(); }
  function dupAll() { const ls = chosen(), made = []; for (const l of ls) { const c = { ...copyL(l), id: uid(), name: l.name + ' copy', _pc: null, _pk: null }; if (isRaster(l)) c.raster = cloneCanvas(l.raster); c.x += 20; c.y += 20; LAYERS.splice(LAYERS.indexOf(l) + 1 + made.length * 0, 0, c); made.push(c); } SELS.clear(); for (const c of made) SELS.add(c.id); SEL = made[made.length - 1]?.id || null; commit(); paintPanels(); draw(); }
  function selectAll() { const ls = LAYERS.filter(movable); if (!ls.length) return; SELS.clear(); for (const l of ls) SELS.add(l.id); SEL = ls[ls.length - 1].id; setTool('select'); paintPanels(); draw(); }
  function toggle(id) { ensure(); if (SELS.has(id) && SELS.size > 1) { SELS.delete(id); SEL = [...SELS].pop(); } else { SELS.add(id); SEL = id; } }
  // the layer list: every chosen row lit, not only the first
  function rows() { if (SELS.size < 2) return; for (const r of document.querySelectorAll('#pLayers [data-ly]')) if (SELS.has(r.dataset.ly)) { r.classList.add('on'); r.setAttribute('aria-pressed', 'true'); } }

  // ---- keys (the Studio asks first; true = handled here) ----
  function key(e) {
    const mod = e.metaKey || e.ctrlKey, typing = e.target.closest?.('input,textarea,select,[contenteditable]'), k = e.key.toLowerCase();
    if (document.querySelector('dialog[open]')) return false;
    if (mod && k === 'k') { e.preventDefault(); palette(); return true; }
    if (typing || VMODE !== 'picture') return false;
    if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); keysSheet(); return true; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return true; }
    if (e.key === 'Escape' && (SELS.size || SEL)) { SELS.clear(); SEL = null; paintPanels(); draw(); return true; }
    if (e.altKey && !mod) { const a = { a: 'left', h: 'hcenter', d: 'right', w: 'top', v: 'vcenter', s: 'bottom' }[e.code?.replace('Key', '').toLowerCase()]; if (a) { e.preventDefault(); align(a); return true; } }
    if (mod && (e.key === ']' || e.key === '[')) { const l = selected(); if (l) { e.preventDefault(); moveLayer(l, e.key === ']' ? 1 : -1); return true; } }
    if (!multi()) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delAll(); return true; }
    if (mod && k === 'd') { e.preventDefault(); dupAll(); return true; }
    if (e.key.startsWith('Arrow')) { e.preventDefault(); const s = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0; for (const l of chosen()) if (!l.locked) shift(l, dx, dy); draw(); clearTimeout(key.t); key.t = setTimeout(commit, 400); return true; }
    return false;
  }

  // ---- ⌘K: every command by name ----
  const PCSS = `#proPal{border:0;padding:0;width:min(560px,94vw);border-radius:16px;box-shadow:0 30px 80px rgba(20,20,22,.3);margin:12vh auto auto;font:400 14px 'Space Grotesk',system-ui,sans-serif;color:#141416}
#proPal::backdrop{background:rgba(20,20,22,.25)}#proPal input{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid rgba(20,20,22,.12);padding:16px 18px;font:400 17px 'Space Grotesk',sans-serif;outline:none}
#proPal ul{list-style:none;margin:0;padding:6px;max-height:min(420px,60vh);overflow:auto}#proPal li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 12px;border-radius:10px;cursor:pointer}
#proPal li[aria-selected=true]{background:#141416;color:#fff}#proPal li small{font:500 11px 'IBM Plex Mono',monospace;opacity:.6}#proPal li em{font-style:normal;font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin-right:auto;padding-left:8px}
#proPal .none{padding:14px 18px;color:#5b5e66}
#proKeys{border:0;padding:0;width:min(720px,94vw);border-radius:18px;font:400 14px 'Space Grotesk',system-ui,sans-serif}#proKeys::backdrop{background:rgba(20,20,22,.3)}
#proKeys .k{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 22px;padding:0 20px 20px}#proKeys .k div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(20,20,22,.08)}
#proKeys kbd{font:500 11px 'IBM Plex Mono',monospace;background:#f1f1ec;border:1px solid rgba(20,20,22,.14);border-radius:6px;padding:2px 6px;white-space:nowrap}
.proar{display:inline-flex;align-items:center;gap:2px;margin-right:10px}.proar i{width:1px;height:18px;background:rgba(20,20,22,.15);margin:0 4px}.proar b{font:500 11px 'IBM Plex Mono',monospace;margin-left:6px}
.proar .ico,#pLayers .ico{display:inline-grid;place-items:center;width:30px;height:30px;padding:0;border-radius:8px;border:1px solid transparent;background:none;cursor:pointer;color:#141416}.proar .ico:hover:not(:disabled){background:rgba(20,20,22,.06);border-color:rgba(20,20,22,.12)}.proar .ico:disabled{opacity:.3;cursor:default}
.geo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 10px}.geo label{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:4px;border:1px solid rgba(20,20,22,.14);border-radius:10px;padding:2px 6px;background:#fff}
.geo span{font:500 10px 'IBM Plex Mono',monospace;color:#5b5e66}.geo input,.geo output{border:0!important;padding:4px 0!important;min-width:0;width:100%;font:500 13px 'IBM Plex Mono',monospace;background:none;min-height:0!important}.geo small{font-size:10px;color:#5b5e66}`;
  function css() { if (document.getElementById('proCss')) return; const s = document.createElement('style'); s.id = 'proCss'; s.textContent = PCSS; document.head.appendChild(s); }
  const click = sel => () => { const b = document.querySelector(sel); if (b) b.click(); else toast('Not here on this piece.'); };
  function commands() {
    const tools = [...document.querySelectorAll('.rail [data-tool]')].filter(b => b.offsetParent).map(b => { const m = /^(.*?)\s*\(([^)]*)\)/.exec(b.title || b.getAttribute('aria-label') || ''); return { label: m ? m[1] : b.getAttribute('aria-label'), keys: m ? m[2].split(',')[0] : '', kind: 'Tool', run: () => setTool(b.dataset.tool) }; });
    const views = [...document.querySelectorAll('#viewSeg button')].map(b => ({ label: 'Show ' + b.textContent.trim(), kind: 'View', run: () => b.click() }));
    const exp = [...document.querySelectorAll('#expPop button')].filter(b => b.textContent.trim()).map(b => ({ label: 'Export · ' + b.textContent.trim(), kind: 'Export', run: () => b.click() }));
    const l = selected();
    return [
      ...tools,
      { label: 'Undo', keys: '⌘Z', kind: 'Edit', run: undo }, { label: 'Redo', keys: '⌘⇧Z', kind: 'Edit', run: redo }, { label: 'Save', keys: '⌘S', kind: 'Edit', run: () => saveAll() },
      { label: 'Choose every layer', keys: '⌘A', kind: 'Select', run: selectAll }, { label: 'Choose none', keys: 'Esc', kind: 'Select', run: () => { SELS.clear(); SEL = null; paintPanels(); draw(); } },
      { label: 'Duplicate', keys: '⌘D', kind: 'Edit', run: () => multi() ? dupAll() : l && duplicate(l) }, { label: 'Delete', keys: '⌫', kind: 'Edit', run: () => multi() ? delAll() : l && removeLayer(l) },
      { label: 'Bring forward', keys: '⌘]', kind: 'Arrange', run: () => l && moveLayer(l, 1) }, { label: 'Send backward', keys: '⌘[', kind: 'Arrange', run: () => l && moveLayer(l, -1) },
      ...ALIGN.map(([k, t, key]) => ({ label: t, keys: key, kind: 'Arrange', run: () => align(k) })), ...DIST.map(([k, t]) => ({ label: t, kind: 'Arrange', run: () => distribute(k) })),
      { label: 'Zoom to fit', keys: '0', kind: 'View', run: fit }, { label: 'Zoom in', keys: '+', kind: 'View', run: () => { const r = view.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); } }, { label: 'Zoom out', keys: '−', kind: 'View', run: () => { const r = view.getBoundingClientRect(); zoomAt(.8, r.width / 2, r.height / 2); } },
      { label: 'Actual size (100%)', kind: 'View', run: () => { const r = view.getBoundingClientRect(); zoomAt(1 / Z, r.width / 2, r.height / 2); } },
      { label: 'Show or hide the panel', keys: '\\', kind: 'View', run: click('#panelBtn') }, { label: 'Focus: the drawing as big as it goes', keys: 'F', kind: 'View', run: click('#focusBtn') },
      ...views, ...exp,
      { label: 'Embroidery: digitize the chosen layer and see it sewn', kind: 'Make', run: () => l ? embOpen(l) : toast('Choose a graphic, mark or type layer first.') },
      { label: 'Made as… (every technique, previewed)', kind: 'Make', run: () => madeOpen() },
      { label: 'Versions: compare two side by side', kind: 'Piece', run: click('#verBtn') }, { label: 'See it in 3D', kind: 'Piece', run: click('#tryBtn') }, { label: 'Materials of this piece', kind: 'Piece', run: click('#matBtn') },
      { label: 'Spec sheet', kind: 'Piece', run: click('#specBtn') }, { label: 'Decoration sheet', kind: 'Piece', run: click('#decoBtn') }, { label: 'Send to the tech pack', kind: 'Piece', run: click('#packBtn') },
      { label: 'Bring an SVG back from Illustrator', kind: 'File', run: click('#impBtn') },
      ...(window.FBLabNav?.openNew ? [{ label: 'New design', kind: 'Lab', run: () => window.FBLabNav.openNew() }] : []),
      { label: 'Keyboard shortcuts', keys: '?', kind: 'Help', run: keysSheet },
      ...(window.PRO.extra || []).map(f => f()).flat()
    ].filter(c => c && c.label);
  }
  function palette() {
    css(); let d = document.getElementById('proPal');
    if (!d) { d = document.createElement('dialog'); d.id = 'proPal'; d.setAttribute('aria-label', 'Commands'); d.innerHTML = '<input type="search" placeholder="Type a command: align, embroidery, export, zoom…" aria-label="Command" autocomplete="off"><ul role="listbox"></ul>'; document.body.appendChild(d);
      d.addEventListener('click', e => { if (e.target === d) d.close(); const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); }); }
    let list = commands(), shown = [], at = 0;
    const input = d.querySelector('input'), ul = d.querySelector('ul');
    const score = (c, q) => { const s = (c.label + ' ' + c.kind).toLowerCase(), w = q.split(/\s+/).filter(Boolean); if (!w.every(x => s.includes(x))) return -1; return (c.label.toLowerCase().startsWith(w[0] || '') ? 2 : 0) + (s.includes(q) ? 1 : 0); };
    const paint = () => { const q = input.value.trim().toLowerCase(); shown = list.map(c => [c, score(c, q)]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 40); at = Math.min(at, Math.max(0, shown.length - 1));
      ul.innerHTML = shown.length ? shown.map((c, i) => `<li role="option" data-i="${i}" aria-selected="${i === at}"><span>${esc(c.label)}</span><em>${esc(c.kind)}</em>${c.keys ? `<small>${esc(c.keys)}</small>` : ''}</li>`).join('') : '<li class="none">No command by that name.</li>'; ul.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); };
    const run = i => { const c = shown[i]; if (!c) return; d.close(); setTimeout(() => c.run(), 0); };
    input.oninput = () => { at = 0; paint(); };
    input.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(at + 1, shown.length - 1); paint(); } else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(at - 1, 0); paint(); } else if (e.key === 'Enter') { e.preventDefault(); run(at); } else if (e.key === 'Escape') { e.preventDefault(); d.close(); } };
    const back = document.activeElement; d.onclose = () => { input.blur(); if (back && back !== document.body && back.isConnected) back.focus?.(); };
    input.value = ''; paint(); d.showModal(); input.focus();
  }
  function keysSheet() {
    css(); let d = document.getElementById('proKeys');
    if (!d) { d = document.createElement('dialog'); d.id = 'proKeys'; d.setAttribute('aria-labelledby', 'proKeysH');
      const K = [['Commands by name', '⌘K'], ['This list', '?'], ['Select and move', 'V'], ['Move the view', 'H · Space'], ['Brush', 'B'], ['Eraser', 'E'], ['Type', 'T'], ['Rectangle', 'R'], ['Ellipse', 'O'], ['Line', 'L'], ...(window.PRO.keys || []),
        ['Pick a colour', 'I'], ['Ruler', 'U'], ['Warp', 'W'], ['Area for the AI', 'M'], ['Add to the choice', 'Shift-click'], ['Choose every layer', '⌘A'], ['Choose none', 'Esc'], ['Duplicate', '⌘D'], ['Delete', '⌫'], ['Nudge', 'Arrows · Shift ×10'],
        ['Bring forward / send back', '⌘] · ⌘['], ['Align left / centre / right', 'Alt A · H · D'], ['Align top / middle / bottom', 'Alt W · V · S'], ['Move without the guides', 'hold Alt'], ['Undo / redo', '⌘Z · ⌘⇧Z'], ['Save', '⌘S'],
        ['Zoom to fit', '0'], ['Zoom in / out', '+ · −'], ['Brush size', '[ · ]'], ['Panel', '\\'], ['Focus', 'F']];
      d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px"><h3 id="proKeysH" style="margin:0;font-size:18px;font-weight:500">Keyboard shortcuts</h3><button class="btn sm q" type="button" data-close>Close</button></div><div class="k">${K.map(([a, b]) => `<div><span>${esc(a)}</span><kbd>${esc(b)}</kbd></div>`).join('')}</div>`;
      document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); }); }
    d.showModal();
  }

  css();
  window.PRO = { SELS, optsRefresh, down, move, end, snap1, overlay, opts, multi, multiHtml, geoHtml, rows, toggle, key, palette, keysSheet, align, distribute, box, chosen, extra: [], keys: [] };
})();
