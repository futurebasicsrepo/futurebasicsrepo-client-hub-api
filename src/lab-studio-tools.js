// Studio, the tools as a design program has them (served as /lab/studio-tools.js, loaded after the Studio's own script and its pro, pen and
// production layers, whose state it shares: TOOL, OPT, LAYERS, SEL, W, H, Z, CUR, setTool, draw, commit, paintPanels, …).
//   - the rail in groups: tools that do the same kind of job share one place on the rail (shapes; select and edit points; pen, width and shape
//     builder; type and type on a path; ruler and measure; warp and liquify; brush and distress). The group shows the one last used, with a
//     small mark in its corner; hold it (or tap it again) and the group opens beside it, as in Illustrator or Procreate
//   - Polygon and Star: drawn from the middle out, as paths (so Edit points, the shape builder and the SVG take them)
//   - an options bar for every tool, above the picture: what the next shape, line, path or type is made with, and the chosen layer's own
//     settings while it is chosen (a shape's fill, stroke, corners, sides; select's flip, order, duplicate, lock, delete; the view's zoom)
//   - liquify in four ways: push, twirl, pinch, bloat
(function () {
  const $ = s => document.querySelector(s);
  const KEY = 'fb.studio.toolopts';
  const DEF = { shFill: true, shFillC: '', shStroke: false, shStrokeC: '', shW: 0, shR: 0, sides: 6, inner: 50, dash: 'solid', arrow: 'none', tFont: 'grotesk', tSize: 0, tBold: true, tAlign: 'center', liqMode: 'push', liqK: 50, pickAll: true, penW: 0, penFill: false, penFillC: '' };
  try { Object.assign(OPT, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { Object.assign(OPT, DEF); }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.keys(DEF).map(k => [k, OPT[k]])))); } catch { /* private window */ } };
  const strokeW = () => OPT.shW || Math.max(2, Math.round(W / 160)), penW = () => OPT.penW || Math.max(2, Math.round(W / 300));
  const SHAPES = ['rect', 'ellipse', 'polygon', 'star', 'line'];

  // ---- Polygon and Star on the rail ----
  const ICON = { polygon: '<path d="M12 3l8 6-3 10H7L4 9z"/>', star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>' };
  const TITLE = { polygon: 'Polygon: drag from the middle out; its sides are in the bar above', star: 'Star: drag from the middle out; its points and how deep they go are in the bar above' };
  function railAdd() {
    const after = document.querySelector('.rail [data-tool="ellipse"]'); if (!after || document.querySelector('.rail [data-tool="polygon"]')) return;
    after.insertAdjacentHTML('afterend', Object.keys(ICON).map(k => `<button type="button" data-tool="${k}" title="${TITLE[k]}" aria-label="${k === 'polygon' ? 'Polygon' : 'Star'}"><svg viewBox="0 0 24 24">${ICON[k]}</svg></button>`).join(''));
    for (const k of Object.keys(ICON)) document.querySelector(`.rail [data-tool="${k}"]`)?.addEventListener('click', e => { if (!e.defaultPrevented) setTool(k); });
    if (typeof TOOL_HELP === 'object') Object.assign(TOOL_HELP, { polygon: 'Drag from the middle out; set its sides in the bar', star: 'Drag from the middle out; set its points in the bar' });
  }
  // a polygon or star as a path, centred on the layer's origin, one point towards `a`
  function starNodes(kind, r, a) {
    const n = Math.max(3, Math.min(24, Math.round(OPT.sides) || 6)), pts = [];
    if (kind === 'star') { const ri = r * Math.max(.1, Math.min(.95, (OPT.inner || 50) / 100)); for (let i = 0; i < n * 2; i++) { const t = a + i * Math.PI / n, rr = i % 2 ? ri : r; pts.push([rr * Math.cos(t), rr * Math.sin(t)]); } }
    else for (let i = 0; i < n; i++) { const t = a + i * 2 * Math.PI / n; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
    return pts.map(([x, y]) => { x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100; return [x, y, x, y, x, y]; });
  }
  // what a new shape is made with (the bar's settings)
  function shapeProps(t) {
    const line = t === 'line';
    return { fill: !line && OPT.shFill, fillColor: OPT.shFillC || CUR, stroke: line || OPT.shStroke || !OPT.shFill, strokeW: strokeW(), strokeColor: OPT.shStrokeC || CUR, radius: t === 'rect' ? OPT.shR : 0, dash: OPT.dash, arrow: line ? OPT.arrow : 'none' };
  }
  // a polygon or star being dragged out: made on the first move, its size and turn follow the pointer
  function starDrag(g, x, y, e) {
    let r = Math.hypot(x - g.x0, y - g.y0); if (r < 4) return; let a = Math.atan2(y - g.y0, x - g.x0); if (e?.shiftKey) a = -Math.PI / 2;
    if (!g.l) g.l = addLayer(fresh('shape', { name: TOOL === 'star' ? 'Star' : 'Polygon', shape: 'path', paths: [{ closed: true, nodes: [] }], w: 1, h: 1, ...shapeProps(TOOL), x: g.x0, y: g.y0 }), { silent: true });
    g.l.paths = [{ closed: true, nodes: starNodes(TOOL, r, a) }]; g.l._pk = null; g.moved = true;
  }

  // ---- the rail in groups ----
  const GROUPS = [['select', 'node'], ['brush', 'distress'], ['rect', 'ellipse', 'polygon', 'star', 'line'], ['pen', 'width', 'shapebuilder'], ['text', 'typepath'], ['ruler', 'measure', 'artboard'], ['warp', 'liquify']];
  let CURG = {}; try { CURG = JSON.parse(localStorage.getItem('fb.studio.toolgroups') || '{}'); } catch { CURG = {}; }
  const groupOf = t => GROUPS.find(g => g.includes(t));
  const btn = t => document.querySelector(`.rail [data-tool="${t}"]`);
  const simple = () => document.querySelector('.studio')?.dataset.level === 'simple';
  const usable = t => { const b = btn(t); return b && !(simple() && b.classList.contains('pro-only')); };
  function railGroups() {
    for (const g of GROUPS) {
      const there = g.filter(t => btn(t)); if (there.length < 2) continue;
      const on = there.includes(TOOL) ? TOOL : there.includes(CURG[g[0]]) && usable(CURG[g[0]]) ? CURG[g[0]] : there.find(usable) || there[0];
      const n = there.filter(usable).length;
      for (const t of there) { const b = btn(t); b.classList.toggle('tg-off', t !== on); b.classList.toggle('tg-has', t === on && n > 1); b.dataset.grp = g[0]; }
    }
  }
  function flyClose() { $('#toolFly')?.remove(); }
  function flyOpen(b) {
    flyClose(); const g = groupOf(b.dataset.tool); if (!g) return; const list = g.filter(usable); if (list.length < 2) return;
    const r = b.getBoundingClientRect(), f = document.createElement('div'); f.id = 'toolFly'; f.setAttribute('role', 'menu'); f.setAttribute('aria-label', 'Tools in this group');
    f.innerHTML = list.map(t => { const s = btn(t); return `<button type="button" role="menuitemradio" aria-checked="${t === TOOL}" data-fly="${t}">${s.querySelector('svg')?.outerHTML || ''}<span><b>${esc(s.getAttribute('aria-label') || t)}</b><small>${esc((typeof TOOL_HELP === 'object' && TOOL_HELP[t]) || (s.title || '').split(':').slice(1).join(':').trim())}</small></span></button>`; }).join('');
    document.body.append(f); f.style.left = Math.min(innerWidth - f.offsetWidth - 8, r.right + 8) + 'px'; f.style.top = Math.max(8, Math.min(innerHeight - f.offsetHeight - 8, r.top - 6)) + 'px';
    f.addEventListener('click', e => { const x = e.target.closest('[data-fly]'); if (!x) return; flyClose(); setTool(x.dataset.fly); });
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!e.target.closest('#toolFly')) { flyClose(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
  }
  // hold a grouped tool (or tap it again when it is the one in use) and its group opens
  function railHold() {
    const rail = document.querySelector('.rail'); if (!rail || rail.dataset.tg) return; rail.dataset.tg = '1'; let hold = null;
    rail.addEventListener('pointerdown', e => { const b = e.target.closest('button[data-tool].tg-has'); if (!b) return; clearTimeout(hold); hold = setTimeout(() => { hold = 'open'; flyOpen(b); }, 420); });
    const stop = () => { if (hold !== 'open') clearTimeout(hold); };
    rail.addEventListener('pointerup', stop); rail.addEventListener('pointerleave', stop); rail.addEventListener('pointercancel', stop);
    rail.addEventListener('click', e => { const b = e.target.closest('button[data-tool]'); if (!b) return; if (hold === 'open') { hold = null; e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (b.classList.contains('tg-has') && b.dataset.tool === TOOL && !$('#toolFly')) { e.preventDefault(); e.stopImmediatePropagation(); flyOpen(b); } }, true);
    rail.addEventListener('contextmenu', e => { const b = e.target.closest('button[data-tool].tg-has'); if (b) { e.preventDefault(); flyOpen(b); } });
  }
  function onTool(t) { const g = groupOf(t); if (g) { CURG[g[0]] = t; try { localStorage.setItem('fb.studio.toolgroups', JSON.stringify(CURG)); } catch { /* fine */ } } railGroups(); }

  // ---- the options bar ----
  const chk = (k, on, lab, tip = '') => `<button type="button" class="btn sm ${on ? '' : 'q'}" data-tt="${k}" aria-pressed="${Boolean(on)}" ${tip ? `title="${esc(tip)}"` : ''}>${lab}</button>`;
  const col = (k, v, lab) => `<label class="tcol" title="${esc(lab)}"><input type="color" data-tc="${k}" value="${/^#[0-9a-f]{6}$/i.test(v || '') ? v : CUR}" aria-label="${esc(lab)}"></label>`;
  const num = (k, lab, min, max, step, v, unit = '') => `<label>${lab}<input type="range" data-tn="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}${unit}</output></label>`;
  const seg = (k, v, list) => `<span class="tseg" role="radiogroup">${list.map(([x, l, tip]) => `<button type="button" role="radio" data-ts="${k}:${x}" aria-checked="${v === x}" ${tip ? `title="${esc(tip)}"` : ''}>${l}</button>`).join('')}</span>`;
  const sel = () => (typeof selected === 'function' ? selected() : null);
  const editable = l => l && !l.locked && !(typeof fixed === 'function' && fixed(l));
  // a shape tool: the next shape's settings, and the chosen shape's own when one is chosen (changed live)
  function shapeBar(t) {
    const l = sel(), on = l && l.kind === 'shape' && editable(l) ? l : null, v = k => (on ? { shFill: on.fill, shFillC: on.fillColor, shStroke: on.stroke, shStrokeC: on.strokeColor, shW: on.strokeW, shR: on.radius || 0, dash: on.dash || 'solid', arrow: on.arrow || 'none' }[k] : OPT[k]);
    let h = `<span class="tgrp" aria-label="Fill">${t === 'line' ? '' : chk('shFill', v('shFill'), 'Fill', 'Fill the shape') + col('shFillC', v('shFillC') || CUR, 'Fill colour')}</span>`;
    h += `<span class="tgrp">${t === 'line' ? '' : chk('shStroke', v('shStroke'), 'Stroke', 'An outline round the shape')}${col('shStrokeC', v('shStrokeC') || CUR, 'Stroke colour')}${num('shW', 'Width', 1, 120, 1, v('shW') || strokeW(), 'px')}</span>`;
    h += seg('dash', v('dash'), [['solid', 'Solid', 'A solid line'], ['dash', 'Dashed', 'A dashed line'], ['dot', 'Dotted', 'A dotted line, like a stitch']]);
    if (t === 'rect') h += num('shR', 'Corners', 0, 200, 1, v('shR'), 'px');
    if (t === 'polygon' || t === 'star') h += num('sides', t === 'star' ? 'Points' : 'Sides', 3, 24, 1, OPT.sides);
    if (t === 'star') h += num('inner', 'Depth', 10, 95, 1, OPT.inner, '%');
    if (t === 'line') h += seg('arrow', v('arrow'), [['none', 'No ends', 'Plain ends'], ['end', 'Arrow', 'An arrowhead at the end'], ['both', 'Both', 'Arrowheads at both ends']]);
    return h + `<span class="hint">${on ? `Changes the chosen ${esc(on.name || 'shape')}; ` : ''}${{ rect: 'Drag to draw; Shift makes a square.', ellipse: 'Drag to draw; Shift makes a circle.', polygon: 'Drag from the middle out; Shift keeps it upright.', star: 'Drag from the middle out; Shift keeps it upright.', line: 'Drag to draw; Shift keeps it straight.' }[t]}</span>`;
  }
  // a bag or a shoe drawn in panels (src/lab-shoe-flats.html) takes the bar's actions itself
  const onDrawing = () => typeof VMODE !== 'undefined' && (VMODE === 'front' || VMODE === 'back') && typeof FF === 'function' && Boolean(FF()?.act);
  function opts(o) {
    const t = TOOL; let h = '';
    if (SHAPES.includes(t)) h = shapeBar(t);
    else if (t === 'select') { const l = sel(), drawn = onDrawing(), ok = drawn || editable(l), d = ok ? '' : 'disabled';
      h = `<span class="tgrp" role="group" aria-label="The chosen layer">${[['flipx', 'Flip ↔', 'Flip it left to right'], ['flipy', 'Flip ↕', 'Flip it upside down'], ['front', 'Forward', 'One step towards the front'], ['back', 'Backward', 'One step towards the back'], ['dup', 'Duplicate', 'A copy, just beside it (⌘D)'], ['lock', l?.locked ? 'Unlock' : 'Lock', 'Locked: it cannot be moved or changed by accident'], ['del', 'Delete', 'Take it away (Delete)']].map(([k, lab, tip]) => `<button type="button" class="btn sm q" data-ta="${k}" title="${tip}" ${k === 'lock' ? (!drawn && l && !(typeof fixed === 'function' && fixed(l)) ? '' : 'disabled') : d}>${lab}</button>`).join('')}</span>`; }
    else if (t === 'hand') h = `<span class="tgrp"><button type="button" class="btn sm q" data-ta="zout" aria-label="Zoom out">−</button><b class="tz">${Math.round(Z * 100)}%</b><button type="button" class="btn sm q" data-ta="zin" aria-label="Zoom in">+</button><button type="button" class="btn sm q" data-ta="z100">100%</button><button type="button" class="btn sm q" data-ta="zfit">Fit</button>${VR ? '<button type="button" class="btn sm q" data-ta="straight">Straighten</button>' : ''}</span><label class="chk" title="On trial: the picture is drawn on the iPad's graphics chip while you move, zoom and turn it. Switch it on, try it, and tell us how it feels."><input type="checkbox" data-glon ${window.FBGL?.ok ? 'checked' : ''}> Draw on the graphics chip</label><span class="hint">Drag to move around; pinch or Ctrl and the wheel zooms; two fingers turn it.</span>`;
    else if (t === 'text') { const l = sel(), on = l && l.kind === 'text' && editable(l) ? l : null, v = { font: on ? on.font : OPT.tFont, size: on ? on.size : OPT.tSize || Math.round(W / 14), bold: on ? on.bold : OPT.tBold, align: on ? on.align : OPT.tAlign };
      h = `<label>Font<select data-tf>${typeof fontOpts === 'function' ? fontOpts(v.font) : ''}</select></label>${num('tSize', 'Size', 6, 600, 1, v.size, 'px')}${chk('tBold', v.bold, 'Bold')}${seg('tAlign', v.align, [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']])}<span class="hint">${on ? 'Changes the chosen type; its outline, arch, shape and shadow are in the panel.' : 'Click where the type should go. Outline, arch, shape and shadow are in the panel once it is placed.'}</span>`; }
    else if (t === 'pen') h = `<span class="tgrp">${col('shStrokeC', OPT.shStrokeC || CUR, 'Line colour')}${num('penW', 'Width', 1, 120, 1, penW(), 'px')}</span><span class="tgrp">${chk('penFill', OPT.penFill, 'Fill', 'Fill the path when it is closed')}${col('penFillC', OPT.penFillC || CUR, 'Fill colour')}</span><span class="hint">Click for a sharp point, drag for a curve; click the first point to close it. Shift keeps to 45°.</span>`;
    else if (t === 'pick') h = `<span class="tgrp"><i class="tchip" style="background:${esc(CUR)}"></i><b class="tz">${esc(CUR)}</b></span>${seg('pickAll', OPT.pickAll ? 'all' : 'one', [['all', 'All layers', 'The colour you see'], ['one', 'This layer', 'The chosen layer’s own colour, whatever is over it']])}<span class="hint">Tap the picture to take its colour.</span>`;
    else if (t === 'liquify') { o.querySelector('.hint')?.remove(); o.insertAdjacentHTML('beforeend', seg('liqMode', OPT.liqMode, [['push', 'Push', 'Push the pixels along'], ['twirl', 'Twirl', 'Turn them round the brush (Alt: the other way)'], ['pinch', 'Pinch', 'Draw them in to the middle'], ['bloat', 'Bloat', 'Push them out from the middle']]) + num('liqK', 'Strength', 5, 100, 5, OPT.liqK, '%') + `<span class="hint">${onDrawing() ? 'Drag to push the drawing: panels, seams and stitching move together (Alt turns a twirl the other way).' : OPT.liqMode === 'push' ? 'Drag on a picture or painting layer to push it.' : 'Hold or drag on a picture or painting layer.'}</span>`); return; }
    if (!h) return; o.querySelector('.hint')?.remove(); o.insertAdjacentHTML('afterbegin', h);
  }
  // the bar's controls: the next thing's settings, and the chosen layer's when the bar shows it
  function live(k, v) {
    const l = sel(); if (!editable(l)) return false;
    if (l.kind === 'shape' && SHAPES.includes(TOOL)) { const m = { shFill: 'fill', shFillC: 'fillColor', shStroke: 'stroke', shStrokeC: 'strokeColor', shW: 'strokeW', shR: 'radius', dash: 'dash', arrow: 'arrow' }[k]; if (!m) return false; l[m] = v; if (m === 'fillColor') l.fill = true; if (m === 'strokeColor' && l.shape !== 'line') l.stroke = true; l._pk = null; return true; }
    if (l.kind === 'text' && TOOL === 'text') { const m = { tFont: 'font', tSize: 'size', tBold: 'bold', tAlign: 'align' }[k]; if (!m) return false; l[m] = v; l._pk = null; return true; }
    return false;
  }
  function changed(k, v, { repaint = false } = {}) { OPT[k] = v; keep(); if (live(k, v)) { if (typeof touch === 'function') touch(); draw(); clearTimeout(changed.t); changed.t = setTimeout(() => { commit(); paintPanels(); }, 400); } if (repaint) paintOpts(); }
  function wire() {
    const o = $('#opts'); if (!o || o.dataset.tw) return; o.dataset.tw = '1';
    o.addEventListener('input', e => { const n = e.target.dataset.tn, c = e.target.dataset.tc; if (n) { const v = Number(e.target.value); e.target.nextElementSibling.textContent = v + ({ shW: 'px', shR: 'px', tSize: 'px', penW: 'px', inner: '%', liqK: '%' }[n] || ''); changed(n, v); } else if (c) changed(c, e.target.value); });
    o.addEventListener('change', e => { if (e.target.matches('[data-tf]')) changed('tFont', e.target.value); if (e.target.matches('[data-glon]')) { try { localStorage.setItem('fb.studio.gl', e.target.checked ? '1' : '0'); } catch { /* fine */ } if (typeof saveAll === 'function' && typeof DIRTY !== 'undefined' && DIRTY) saveAll().catch(() => {}).finally(() => location.reload()); else location.reload(); } });
    o.addEventListener('click', e => {
      const tt = e.target.closest('[data-tt]'); if (tt) { const k = tt.dataset.tt, now = tt.getAttribute('aria-pressed') !== 'true'; changed(k, now, { repaint: true }); return; }
      const ts = e.target.closest('[data-ts]'); if (ts) { const [k, v] = ts.dataset.ts.split(':'); changed(k, k === 'pickAll' ? v === 'all' : v, { repaint: true }); return; }
      const ta = e.target.closest('[data-ta]'); if (!ta) return; const a = ta.dataset.ta, l = sel(), r = view.getBoundingClientRect();
      if (onDrawing()) { FF().act(a); paintOpts(); return; } // a bag or shoe drawn in panels: the bar works on its chosen panel or graphic, and its zoom
      if (a === 'zin' || a === 'zout') { zoomAt(a === 'zin' ? 1.25 : .8, r.width / 2, r.height / 2); paintOpts(); return; }
      if (a === 'z100') { zoomAt(1 / Z, r.width / 2, r.height / 2); paintOpts(); return; } if (a === 'zfit') { fit(); paintOpts(); return; } if (a === 'straight') { VR = 0; draw(); paintOpts(); return; }
      if (!l) return;
      if (a === 'lock') { l.locked = !l.locked; commit(); paintPanels(); paintOpts(); draw(); return; }
      if (!editable(l)) return;
      if (a === 'flipx') l.flip = !l.flip; else if (a === 'flipy') { l.flip = !l.flip; l.rot = (l.rot || 0) + Math.PI; }
      else if (a === 'front' || a === 'back') { if (typeof moveLayer === 'function') moveLayer(l, a === 'front' ? 1 : -1); paintOpts(); return; }
      else if (a === 'dup') { if (typeof duplicate === 'function') duplicate(l); paintOpts(); return; } else if (a === 'del') { if (typeof removeLayer === 'function') removeLayer(l); paintOpts(); return; }
      l._pk = null; commit(); paintPanels(); draw();
    });
  }

  // ---- liquify in four ways: twirl, pinch and bloat work while the brush is held, as well as when it moves ----
  function liqAt(l, x, y, mode, alt) {
    const c = l.raster; if (!c) return; const ctx = c.getContext('2d', { willReadFrequently: true }), [a, b] = toLocal(l, x, y), R = Math.max(4, OPT.size * 1.5 / l.scale), k = (OPT.liqK || 50) / 100;
    const X0 = Math.max(0, Math.floor(a - R)), Y0 = Math.max(0, Math.floor(b - R)), X1 = Math.min(c.width, Math.ceil(a + R)), Y1 = Math.min(c.height, Math.ceil(b + R)), w = X1 - X0, h = Y1 - Y0; if (w <= 0 || h <= 0) return;
    const src = ctx.getImageData(X0, Y0, w, h), out = ctx.createImageData(w, h), S = src.data, O = out.data, cx = a - X0, cy = b - Y0, ang = (alt ? -1 : 1) * .18 * k;
    for (let y0 = 0; y0 < h; y0++) for (let x0 = 0; x0 < w; x0++) {
      const i = (y0 * w + x0) * 4, dx = x0 - cx, dy = y0 - cy, r2 = (dx * dx + dy * dy) / (R * R); if (r2 >= 1) { O[i] = S[i]; O[i + 1] = S[i + 1]; O[i + 2] = S[i + 2]; O[i + 3] = S[i + 3]; continue; }
      const t = (1 - r2) * (1 - r2); let fx, fy;
      if (mode === 'twirl') { const q = -ang * t, cs = Math.cos(q), sn = Math.sin(q); fx = cx + dx * cs - dy * sn; fy = cy + dx * sn + dy * cs; }
      else { const s = mode === 'pinch' ? 1 + .12 * k * t : 1 - .12 * k * t; fx = cx + dx * s; fy = cy + dy * s; }
      const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy, xa = ix < 0 ? 0 : ix > w - 1 ? w - 1 : ix, xb = ix + 1 < 0 ? 0 : ix + 1 > w - 1 ? w - 1 : ix + 1, ya = iy < 0 ? 0 : iy > h - 1 ? h - 1 : iy, yb = iy + 1 < 0 ? 0 : iy + 1 > h - 1 ? h - 1 : iy + 1;
      const p = (ya * w + xa) * 4, q2 = (ya * w + xb) * 4, r = (yb * w + xa) * 4, s2 = (yb * w + xb) * 4, wa = (1 - u) * (1 - v), wb = u * (1 - v), wc = (1 - u) * v, wd = u * v;
      for (let ch = 0; ch < 4; ch++) O[i + ch] = S[p + ch] * wa + S[q2 + ch] * wb + S[r + ch] * wc + S[s2 + ch] * wd;
    }
    ctx.putImageData(out, X0, Y0); c._rid = RID++;
  }
  // the brush held still keeps working, once a frame, until it lifts
  function liqHold(g, alt) { const step = () => { if (DRAG !== g) return; liqAt(g.l, g.tx ?? g.x, g.ty ?? g.y, OPT.liqMode, alt); g.moved = true; draw(); requestAnimationFrame(step); }; requestAnimationFrame(step); }

  // ---- in place ----
  // a new path from the pen takes the bar's line width, colour and fill
  function penHook() {
    if (!window.VEC || VEC._tw) return; const d0 = VEC.down; VEC._tw = true;
    VEC.down = function (e, x, y) { const before = new Set(LAYERS), r = d0.apply(this, arguments), l = LAYERS.find(q => !before.has(q));
      if (l && l.kind === 'shape' && l.shape === 'path' && TOOL === 'pen') { l.strokeW = penW(); l.strokeColor = OPT.shStrokeC || CUR; l.fill = Boolean(OPT.penFill); l.fillColor = OPT.penFillC || CUR; l._pk = null; } return r; };
  }
  function boot() { railAdd(); railGroups(); railHold(); wire(); penHook(); paintOpts(); }
  const lvl = $('.studio'); if (lvl) new MutationObserver(() => railGroups()).observe(lvl, { attributes: true, attributeFilter: ['data-level'] });
  // the production tools are put on the rail when the Studio has its document: group them once they are there
  new MutationObserver(() => { if (document.querySelector('.rail [data-tool="artboard"]') && !document.querySelector('.rail [data-tool="artboard"]').dataset.grp) railGroups(); }).observe(document.querySelector('.rail') || document.body, { childList: true });
  window.TOOLS = { opts, onTool, starDrag, shapeProps, liqAt, liqHold, SHAPES, boot, flyClose };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
