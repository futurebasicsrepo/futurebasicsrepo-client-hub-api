// Studio, the production layer: the tools a designer reaches for in Illustrator when a picture has to become a physical product or its packaging
// (served as /lab/studio-ill.js, loaded after /lab/studio-pro.js and /lab/studio-vec.js, whose state it shares: LAYERS, SEL, W, H, Z, PX, PY, PPI,
// TOOL, CUR, D, draw(), commit(), fresh(), addLayer(), processed(), corners(), VEC, PRO, …).
//
//   Artboards (⇧O)        named boards for each face of a pack (front, back, sides, bleed), drawn on the picture, sized in mm or inches, a box's
//                          faces laid out from its length, width and depth with its dieline, each exported on its own
//   Divide · Shape Builder (⇧M)   cut overlapping shapes into every region; drag across regions to merge them, Alt-click one to take it away
//   Reflect (O) · Scale (S)       mirror across a vertical, horizontal or angled axis, or scale by percent or to an exact size in mm or inches, as a copy
//   Width (⇧W)            a stroke thicker or thinner along its length: drag at a point of the path, or choose a profile (taper, bulge)
//   Outline mode (⌘Y)     only the bare paths and their points, with a preflight list of what a factory would trip on
//   Measure (⇧U) · Info (⌘U)      distance and angle between two points in mm or inches; where the pointer is and what is chosen
//   Symbols               one master, many instances: change one and every instance follows
//   Gradients and mesh    linear, radial and a four-corner mesh fill on any shape or path
//   Type on a path (⇧T)   words that run along a path or round a circle (a bottle's shoulder, a can's rim)
//   3D mockup             the picture, or its artboards, on a can, a box, a bottle or a pouch, turned in 3D
//   Pattern fill          a shape filled with a repeat from another layer, or with a tile the image model draws
//   Global swatches       named colours with their Pantone C; change a swatch and everything using it changes
//   Package               one zip for the vendor: the picture, the SVG, every artboard, every linked picture, the fonts, the colours and a report
//   Clipping masks (⌘7)   the top shape clips the others to its outline (⌥⌘7 releases it)
//   Groups (⌘G)           layers that are chosen and moved together (⇧⌘G ungroups)
// Everything new on a layer lives under layer.ill, and the design's artboards, symbols and swatches go into the saved design next to its layers.
(function () {
  'use strict';
  const DOCX = { artboards: [], symbols: [], swatches: [] };
  let OUTLINE = false, INFO = false, MEASURE = null, HOVERPT = null, SB = null;
  const UKEY = 'fb.studio.unit';
  let UNIT = (() => { try { return localStorage.getItem(UKEY) === 'in' ? 'in' : 'mm'; } catch { return 'mm'; } })();
  const id8 = () => Math.random().toString(36).slice(2, 10);
  const ill = l => l.ill || (l.ill = {});
  const isShape = l => l && l.kind === 'shape';
  const VECTOR_FILL = l => isShape(l) && l.shape !== 'line';
  const hx = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chosen = () => (window.PRO ? PRO.chosen() : [selected()].filter(Boolean));
  const say = t => (typeof toast === 'function' ? toast(t) : null);

  // ---- real sizes: the picture's pixels per inch (PPI); a design with none yet is given one the first time a real size is asked for ----
  const ppi = () => (PPI > 0 ? PPI : 0);
  function needPPI() { if (ppi()) return ppi(); PPI = 100; PPISET = true; say('This design had no real size yet: it is set to 100 pixels to the inch (1024 px ≈ 260 mm). Set it exactly with the ruler (U) if you need to.'); return PPI; }
  const toUnit = px => { const p = ppi() || 100, inch = px / p; return UNIT === 'in' ? inch : inch * 25.4; };
  const fromUnit = v => { const p = ppi() || 100; return (UNIT === 'in' ? v : v / 25.4) * p; };
  const fmt = px => `${toUnit(px).toFixed(UNIT === 'in' ? 3 : 1)} ${UNIT}`;
  const num = (v, d = 0) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

  // ---- geometry ----
  const docBox = l => { const p = corners(l); const xs = p.map(q => q[0]), ys = p.map(q => q[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  const unionBox = ls => { const bs = ls.map(docBox); return { x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) }; };
  // a shape's outline in the picture's coordinates, as polygon-clipping wants it
  function geomOf(l) {
    const rings = VEC.pathsOf(l).map(p => VEC.flat({ ...p, closed: true }, .5).map(([a, b]) => VEC.toDoc(l, a, b))).filter(r => r.length > 2);
    let g = null; for (const r of rings) g = g ? polygonClipping.xor(g, [r]) : [[r]]; return g || [];
  }
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const inGeom = (x, y, g) => g.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));
  const areaOf = g => g.reduce((s, poly) => s + poly.reduce((t, ring, k) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return t + (k ? -1 : 1) * Math.abs(a / 2); }, 0), 0);
  // a new path layer from a polygon set, styled like `like`
  function pathLayer(g, like, name) {
    const paths = g.flatMap(poly => poly.map(ring => ({ closed: true, nodes: VEC.simplify(ring.slice(0, -1), .35).map(([x, y]) => [x, y, x, y, x, y]) }))).filter(p => p.nodes.length > 2);
    if (!paths.length) return null;
    const l = fresh('shape', { name, shape: 'path', paths, w: 1, h: 1, radius: 0, fill: true, fillColor: like.fill ? like.fillColor : like.strokeColor, stroke: like.stroke, strokeW: like.strokeW, strokeColor: like.strokeColor, x: 0, y: 0 });
    if (like.ill?.fill) l.ill = { fill: JSON.parse(JSON.stringify(like.ill.fill)) };
    return VEC.normalize(l);
  }
  // every region the chosen shapes make where they overlap, each with the shape on top that it came from
  function regions(ls) {
    let pieces = [];
    for (const l of ls) {
      const g = geomOf(l); if (!g.length) continue; const next = [];
      for (const p of pieces) { const a = polygonClipping.intersection(p.g, g), b = polygonClipping.difference(p.g, g); if (a.length) next.push({ g: a, from: l }); if (b.length) next.push({ g: b, from: p.from }); }
      const rest = pieces.length ? polygonClipping.difference(g, ...pieces.map(p => p.g)) : g; if (rest.length) next.push({ g: rest, from: l });
      pieces = next;
    }
    // a piece in two parts that do not touch becomes two pieces
    return pieces.flatMap(p => p.g.map(poly => ({ g: [poly], from: p.from }))).filter(p => Math.abs(areaOf(p.g)) > 4);
  }
  const shapesChosen = () => chosen().filter(l => isShape(l) && l.shape !== 'line' && !l.locked).sort((a, b) => LAYERS.indexOf(a) - LAYERS.indexOf(b));
  function replaceWith(old, made) {
    const at = Math.min(...old.map(l => LAYERS.indexOf(l)));
    LAYERS = LAYERS.filter(l => !old.includes(l)); LAYERS.splice(at, 0, ...made);
    PRO?.SELS.clear(); for (const l of made) PRO?.SELS.add(l.id); SEL = made[made.length - 1]?.id || null;
  }
  function divide() {
    if (typeof polygonClipping === 'undefined') return say('The shape tools did not load. Reload the page.');
    const ls = shapesChosen(); if (ls.length < 2) return say('Choose two shapes or more (Shift-click) to divide them.');
    let ps; try { ps = regions(ls); } catch (e) { return say('Those shapes could not be divided: ' + e.message); }
    const made = ps.map((p, i) => pathLayer(p.g, p.from, `Piece ${i + 1}`)).filter(Boolean); if (!made.length) return say('Nothing is left of them.');
    replaceWith(ls, made); commit(); paintPanels(); draw(); say(`Divided into ${made.length} pieces. Each one is its own path now.`);
  }

  // ---- fills: gradient, mesh and pattern; a stroke whose width changes along it; type along the path ----
  const IMGS = new Map();
  // a repeat laid out as a textile designer would: straight, brick (each row half a tile along), half-drop (each column half a tile down) or
  // mirrored (the tile, flipped across and down); made once per tile and layout
  const TILES = new Map();
  function layoutTile(im, src, layout) {
    if (!layout || layout === 'grid' || !(im.naturalWidth || im.width)) return im; const key = src.length + ':' + src.slice(-40) + ':' + layout; if (TILES.has(key)) return TILES.get(key);
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, c = document.createElement('canvas'), x = c.getContext('2d');
    if (layout === 'brick') { c.width = w; c.height = h * 2; x.drawImage(im, 0, 0); x.drawImage(im, w / 2, h); x.drawImage(im, -w / 2, h); }
    else if (layout === 'halfdrop') { c.width = w * 2; c.height = h; x.drawImage(im, 0, 0); x.drawImage(im, w, h / 2); x.drawImage(im, w, -h / 2); }
    else { c.width = w * 2; c.height = h * 2; x.drawImage(im, 0, 0); x.save(); x.translate(w * 2, 0); x.scale(-1, 1); x.drawImage(im, 0, 0); x.restore(); x.save(); x.translate(0, h * 2); x.scale(1, -1); x.drawImage(im, 0, 0); x.drawImage(im, w, 0); x.restore(); x.save(); x.translate(w * 2, h * 2); x.scale(-1, -1); x.drawImage(im, 0, 0); x.restore(); }
    TILES.set(key, c); if (TILES.size > 30) TILES.delete(TILES.keys().next().value); return c;
  }
  const imgOf = src => { if (!src) return null; let i = IMGS.get(src); if (!i) { i = new Image(); i.onload = () => { for (const l of LAYERS) if (l.ill?.fill?.src === src) { l._pk = null; } draw(); }; i.src = src; IMGS.set(src, i); if (IMGS.size > 40) IMGS.delete(IMGS.keys().next().value); } return i.complete && i.naturalWidth ? i : null; };
  function fillStyle(x, l, b) {
    const f = l.ill?.fill; if (!f || f.mode === 'solid') return l.fillColor;
    const st = (f.stops || []).filter(s => /^#[0-9a-f]{6}$/i.test(s.color)).sort((p, q) => p.at - q.at);
    if (f.mode === 'linear' || f.mode === 'radial') {
      let g; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (f.mode === 'linear') { const a = (f.angle || 0) * Math.PI / 180, L = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2; g = x.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L); }
      else g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2);
      for (const s of st.length ? st : [{ at: 0, color: l.fillColor }, { at: 100, color: '#ffffff' }]) g.addColorStop(Math.max(0, Math.min(1, s.at / 100)), s.color);
      return g;
    }
    if (f.mode === 'pattern') { const im0 = imgOf(f.src); if (!im0) return l.fillColor; const im = layoutTile(im0, f.src, f.layout); const p = x.createPattern(im, 'repeat'); const k = Math.max(.02, (f.scale || 100) / 100); p.setTransform(new DOMMatrix().translate(b.x0, b.y0).scale(k)); return p; }
    return l.fillColor;
  }
  // a four-corner mesh, with a centre colour: a 3 × 3 grid stretched over the box, so the browser blends between the points
  function meshCanvas(f) {
    const [a, b, c, d] = (f.mesh || []).concat(['#ffffff', '#ffffff', '#ffffff', '#ffffff']).slice(0, 4), mid = f.center || null;
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), avg = (...hs) => { const v = hs.map(rgb); return v[0].map((_, i) => Math.round(v.reduce((s, q) => s + q[i], 0) / v.length)); };
    const g = [[rgb(a), avg(a, b), rgb(b)], [avg(a, c), mid ? rgb(mid) : avg(a, b, c, d), avg(b, d)], [rgb(c), avg(c, d), rgb(d)]];
    const cv = canvas(3, 3), x = cv.getContext('2d'), im = x.createImageData(3, 3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const k = (j * 3 + i) * 4; im.data.set([...g[j][i], 255], k); }
    x.putImageData(im, 0, 0); return cv;
  }
  const special = l => isShape(l) && Boolean((l.ill?.fill && l.ill.fill.mode !== 'solid' && l.fill !== false) || l.ill?.widths || l.ill?.text);
  // samples along one sub-path: [x, y, width factor, length so far]
  function samples(p, wf) {
    const n = p.nodes, segs = [], out = []; for (let i = 1; i < n.length; i++) segs.push([i - 1, i]); if (p.closed && n.length > 1) segs.push([n.length - 1, 0]);
    let len = 0, prev = null;
    for (const [i, j] of segs) {
      const a = n[i], b = n[j], wa = wf?.[i] ?? 1, wb = wf?.[j] ?? 1, K = 24;
      for (let k = 0; k <= K; k++) { if (k === 0 && out.length) continue; const t = k / K, u = 1 - t;
        const X = u * u * u * a[0] + 3 * u * u * t * a[4] + 3 * u * t * t * b[2] + t * t * t * b[0], Y = u * u * u * a[1] + 3 * u * u * t * a[5] + 3 * u * t * t * b[3] + t * t * t * b[1];
        if (prev) len += Math.hypot(X - prev[0], Y - prev[1]); prev = [X, Y]; out.push([X, Y, wa + (wb - wa) * t, len]); }
    }
    return out;
  }
  function content(l) {
    if (!special(l)) return null;
    const paths = VEC.pathsOf(l), widths = l.ill?.widths, T = l.ill?.text, sw = l.stroke ? l.strokeW : 0, wmax = sw * Math.max(1, ...(widths || []).flat().filter(Number.isFinite));
    const xs = [], ys = []; for (const p of paths) for (const q of VEC.flat(p, 1)) { xs.push(q[0]); ys.push(q[1]); }
    if (!xs.length) return null;
    const b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, pad = Math.ceil(wmax / 2 + 4 + (T ? T.size * 1.3 : 0));
    // the content is centred on the layer's origin, like every other shape's
    const ox = Math.max(-b.x0, b.x1) + pad, oy = Math.max(-b.y0, b.y1) + pad, c = canvas(Math.ceil(ox * 2), Math.ceil(oy * 2)), x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2);
    const path = new Path2D(VEC.dOf(paths)); x.lineJoin = 'round'; x.lineCap = 'round';
    if (l.fill !== false && l.shape !== 'line' && (l.fill || l.ill?.fill)) {
      if (l.ill?.fill?.mode === 'mesh') { x.save(); x.clip(path, 'evenodd'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(meshCanvas(l.ill.fill), b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); x.restore(); }
      else if (l.fill) { x.fillStyle = fillStyle(x, l, b); x.fill(path, 'evenodd'); }
    }
    if (sw) {
      x.strokeStyle = l.strokeColor;
      if (!widths) { x.lineWidth = sw; x.stroke(path); }
      else paths.forEach((p, s) => { const pts = samples(p, widths[s]); for (let i = 1; i < pts.length; i++) { x.lineWidth = Math.max(.5, sw * (pts[i - 1][2] + pts[i][2]) / 2); x.beginPath(); x.moveTo(pts[i - 1][0], pts[i - 1][1]); x.lineTo(pts[i][0], pts[i][1]); x.stroke(); } });
    }
    if (T && T.text) {
      const pts = samples(paths[0] || { nodes: [] }), total = pts.length ? pts[pts.length - 1][3] : 0;
      x.font = `${T.bold ? '700' : '400'} ${T.size}px ${FONTS[T.font]?.[1] || FONTS.grotesk[1]}`; x.fillStyle = T.color || '#141416'; x.textBaseline = T.below ? 'top' : 'alphabetic'; x.textAlign = 'center';
      let s = total * (T.offset || 0) / 100;
      const at = d => { let i = pts.findIndex(q => q[3] >= d); if (i < 1) i = 1; const a = pts[i - 1], q = pts[i]; return [q[0], q[1], Math.atan2(q[1] - a[1], q[0] - a[0])]; };
      for (const g of [...T.text]) { const gw = x.measureText(g).width + (T.track || 0); if (s + gw / 2 > total) break; const [gx, gy, ang] = at(s + gw / 2); x.save(); x.translate(gx, gy); x.rotate(ang); x.fillText(g, 0, 0); x.restore(); s += gw; }
    }
    return c;
  }

  // ---- drawing the picture: clipping masks ----
  const maskOf = l => (l.ill?.clipBy ? LAYERS.find(m => m.id === l.ill.clipBy && m.ill?.clip) : null);
  function maskPath(m) { const p = new Path2D(); for (const sp of VEC.pathsOf(m)) { const pts = VEC.flat({ ...sp, closed: true }, .5).map(([a, b]) => VEC.toDoc(m, a, b)); pts.forEach(([a, b], i) => (i ? p.lineTo(a, b) : p.moveTo(a, b))); p.closePath(); } return p; }
  let TMP = null;
  function drawAll(x) {
    for (const l of LAYERS) {
      if (l.ill?.clip && isShape(l)) continue; // a clipping path clips; it is not drawn
      const m = maskOf(l);
      if (!m) { drawLayer(x, l); continue; }
      if (!TMP || TMP.width !== W || TMP.height !== H) TMP = canvas(W, H);
      const t = TMP.getContext('2d'); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, W, H);
      drawLayer(t, l); t.globalCompositeOperation = 'destination-in'; t.fillStyle = '#000'; t.fill(maskPath(m), 'evenodd'); t.globalCompositeOperation = 'source-over';
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.drawImage(TMP, 0, 0); x.restore();
    }
  }
  function clipMake() {
    const ls = chosen().filter(l => !fixed(l)).sort((a, b) => LAYERS.indexOf(a) - LAYERS.indexOf(b)); if (ls.length < 2) return say('Choose the shape and what it should clip (Shift-click), with the shape on top.');
    const m = ls[ls.length - 1]; if (!isShape(m) || m.shape === 'line') return say('The layer on top must be a shape or a path: it becomes the clipping mask.');
    ill(m).clip = true; for (const l of ls.slice(0, -1)) ill(l).clipBy = m.id; m.name = /mask/i.test(m.name) ? m.name : `Clipping mask · ${m.name}`;
    commit(); paintPanels(); draw(); say(`Clipped ${ls.length - 1} layer${ls.length === 2 ? '' : 's'} to “${m.name}”. Release with ⌥⌘7.`);
  }
  function clipRelease() {
    const s = selected(); const m = s?.ill?.clip ? s : s ? maskOf(s) : null; if (!m) return say('Choose a clipping mask, or a layer it clips.');
    delete m.ill.clip; m.name = m.name.replace(/^Clipping mask · /, ''); for (const l of LAYERS) if (l.ill?.clipBy === m.id) delete l.ill.clipBy;
    commit(); paintPanels(); draw(); say('Released: the mask is a shape again, and nothing is clipped by it.');
  }

  // ---- groups ----
  const groupOf = l => (l?.ill?.group ? LAYERS.filter(x => x.ill?.group === l.ill.group) : null);
  function group() { const ls = chosen().filter(l => !fixed(l)); if (ls.length < 2) return say('Choose two layers or more (Shift-click) to group them.'); const g = id8(); for (const l of ls) ill(l).group = g; commit(); paintPanels(); draw(); say(`Grouped ${ls.length} layers: they are chosen and moved together. ⇧⌘G ungroups.`); }
  function ungroup() { const ls = chosen(); const gs = new Set(ls.map(l => l.ill?.group).filter(Boolean)); if (!gs.size) return say('Nothing chosen is in a group.'); for (const l of LAYERS) if (gs.has(l.ill?.group)) delete l.ill.group; commit(); paintPanels(); draw(); say('Ungrouped.'); }
  // clicking a layer in a group chooses the whole group (Shift-click and Edit points still reach one)
  view.addEventListener('pointerdown', e => {
    if (TOOL !== 'select' || e.shiftKey || e.button !== 0 || !window.PRO) return;
    const q = window.studioPt ? window.studioPt(e) : (() => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; })(), x = dx(q[0]), y = dy(q[1]), h = hit(x, y), gs = groupOf(h); // through the view's turn
    if (!gs) return; SEL = h.id; PRO.SELS.clear(); for (const l of gs) PRO.SELS.add(l.id);
  }, true);

  // ---- symbols: change one instance and every instance follows ----
  const SYM_SKIP = new Set(['id', 'name', 'x', 'y', 'rot', 'scale', 'flip', 'opacity', 'blend', 'visible', 'locked', 'ill', 'pv']);
  function propagate() {
    const s = selected(); const sid = s?.ill?.sym; if (!sid) return;
    for (const l of LAYERS) {
      if (l === s || l.ill?.sym !== sid) continue;
      for (const [k, v] of Object.entries(s)) if (!SYM_SKIP.has(k) && !k.startsWith('_')) l[k] = v && typeof v === 'object' && !(v instanceof HTMLCanvasElement) ? JSON.parse(JSON.stringify(v)) : v;
      const keep = { sym: sid, group: l.ill.group, clipBy: l.ill.clipBy, clip: l.ill.clip }; l.ill = { ...JSON.parse(JSON.stringify(s.ill)), ...keep };
      if (s.paths) l.paths = JSON.parse(JSON.stringify(s.paths)); l.pv = (l.pv || 0) + 1; l._pk = null;
    }
  }
  function symbolMake() {
    const l = selected(); if (!l || fixed(l)) return say('Choose the layer to make into a symbol.');
    if (l.ill?.sym) return say('That layer is already an instance of a symbol.');
    const name = (prompt('Name the symbol', l.name || 'Symbol') || '').trim().slice(0, 60); if (!name) return;
    const s = { id: id8(), name }; DOCX.symbols.push(s); ill(l).sym = s.id; commit(); paintPanels(); draw(); docRefresh(); say(`“${name}” is a symbol. Place more instances from Document → Symbols; change any one and they all change.`);
  }
  function symbolPlace(sid) {
    const src = LAYERS.find(l => l.ill?.sym === sid); if (!src) return say('That symbol has no instance left on the picture.');
    const c = { ...copyL(src), id: uid(), x: src.x + W / 20, y: src.y + H / 20 }; addLayer(c); docRefresh();
  }
  function symbolBreak(l) { if (!l?.ill?.sym) return; delete l.ill.sym; commit(); paintPanels(); say('Unlinked: this layer no longer follows the symbol.'); }

  // ---- global swatches with their Pantone C ----
  const PANT = hex => (window.FBPantone ? FBPantone.code(hex) : '');
  async function swatchAdd(hex = CUR) { await loadPantone(); const s = { id: id8(), name: `Colour ${DOCX.swatches.length + 1}`, hex, pantone: PANT(hex) }; DOCX.swatches.push(s); touch(); docRefresh(); return s; }
  function swatchApply(sid, which) {
    const s = DOCX.swatches.find(x => x.id === sid); if (!s) return; const ls = chosen().filter(l => !fixed(l)); if (!ls.length) { setColor(s.hex); return say('That is the current colour now. Choose a layer to colour it.'); }
    for (const l of ls) { const sw = ill(l).sw || (l.ill.sw = {});
      if (l.kind === 'text') { l.color = s.hex; sw.color = s.id; }
      else if (isShape(l)) { if (which === 'stroke' || l.shape === 'line') { l.strokeColor = s.hex; sw.stroke = s.id; } else { l.fillColor = s.hex; l.fill = true; sw.fill = s.id; } }
      else { l.tint = { color: s.hex, amount: 1 }; sw.tint = s.id; } l._pk = null; }
    commit(); paintPanels(); draw();
  }
  function swatchSet(sid, hex) {
    const s = DOCX.swatches.find(x => x.id === sid); if (!s || !/^#[0-9a-f]{6}$/i.test(hex)) return; s.hex = hex; s.pantone = PANT(hex);
    let n = 0; for (const l of LAYERS) { const sw = l.ill?.sw; if (!sw) continue; let hitL = false;
      if (sw.fill === sid) { l.fillColor = hex; hitL = true; } if (sw.stroke === sid) { l.strokeColor = hex; hitL = true; } if (sw.color === sid) { l.color = hex; hitL = true; } if (sw.tint === sid) { l.tint = { color: hex, amount: 1 }; hitL = true; }
      if (hitL) { l._pk = null; n++; } }
    commit(); draw(); return n;
  }
  // a colour typed or picked by hand on a layer is no longer the swatch
  document.addEventListener('input', e => { const t = e.target.closest?.('#pLayers [data-p]'); if (!t) return; const l = selected(); const sw = l?.ill?.sw; if (!sw) return;
    const k = { fillColor: 'fill', strokeColor: 'stroke', color: 'color', 't.color': 'tint' }[t.dataset.p]; if (k && sw[k]) delete sw[k]; }, true);

  // ---- reflect and scale ----
  function reflect(axisDeg, copy) {
    let ls = chosen().filter(l => !fixed(l) && !l.locked); if (!ls.length) return say('Choose what to reflect first.');
    if (copy) { const made = ls.map(l => ({ ...copyL(l), id: uid(), name: `${l.name} (reflected)` })); LAYERS.push(...made); ls = made; }
    const b = unionBox(ls), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, th = axisDeg * Math.PI / 180, ux = Math.cos(th), uy = Math.sin(th);
    for (const l of ls) { const vx = l.x - cx, vy = l.y - cy, d = vx * ux + vy * uy; l.x = cx + 2 * d * ux - vx; l.y = cy + 2 * d * uy - vy; l.rot = 2 * th - l.rot + Math.PI; l.flip = !l.flip;
      l.rot = Math.atan2(Math.sin(l.rot), Math.cos(l.rot)); }
    if (copy && window.PRO) { PRO.SELS.clear(); for (const l of ls) PRO.SELS.add(l.id); SEL = ls[ls.length - 1].id; }
    commit(); paintPanels(); draw();
  }
  function scaleBy(sx, sy, { strokes = true, copy = false } = {}) {
    let ls = chosen().filter(l => !fixed(l) && !l.locked); if (!ls.length) return say('Choose what to scale first.');
    if (!(sx > 0 && sy > 0)) return say('Scale by a number above zero.');
    if (copy) { const made = ls.map(l => ({ ...copyL(l), id: uid(), name: `${l.name} (scaled)` })); LAYERS.push(...made); ls = made; }
    const b = unionBox(ls), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, u = Math.sqrt(sx * sy);
    let uniformOnly = false;
    for (const l of ls) {
      l.x = cx + (l.x - cx) * sx; l.y = cy + (l.y - cy) * sy;
      // the layer's own axes: a turned layer is scaled the same both ways
      const turned = Math.abs(Math.sin(l.rot)) > .01, ax = turned ? u : sx, ay = turned ? u : sy; if (turned && sx !== sy) uniformOnly = true;
      if (isShape(l) && l.shape === 'path') { l.paths = l.paths.map(p => ({ closed: p.closed, nodes: p.nodes.map(n => [n[0] * ax, n[1] * ay, n[2] * ax, n[3] * ay, n[4] * ax, n[5] * ay]) })); VEC.normalize(l); }
      else if (isShape(l)) { l.w = Math.max(1, l.w * ax); if (l.shape !== 'line') l.h = Math.max(1, l.h * ay); l.radius = (l.radius || 0) * Math.min(ax, ay); }
      else { l.scale = Math.max(.01, l.scale * u); if (sx !== sy) uniformOnly = true; }
      if (isShape(l) && strokes) l.strokeW = Math.max(1, Math.round(l.strokeW * u * 10) / 10);
      if (l.ill?.text) l.ill.text.size = Math.max(4, l.ill.text.size * (strokes ? u : 1));
      l._pk = null;
    }
    if (copy && window.PRO) { PRO.SELS.clear(); for (const l of ls) PRO.SELS.add(l.id); SEL = ls[ls.length - 1].id; }
    commit(); paintPanels(); draw(); if (uniformOnly) say('Pictures, type and turned shapes are scaled the same both ways; the rest took the width and height you asked for.');
  }

  // ---- the width tool: each point of a path has a width factor ----
  function widthsOf(l) { const w = ill(l).widths || (l.ill.widths = l.paths.map(p => p.nodes.map(() => 1))); l.paths.forEach((p, s) => { w[s] = w[s] || []; while (w[s].length < p.nodes.length) w[s].push(1); w[s].length = p.nodes.length; }); return w; }
  function widthProfile(l, kind) {
    if (!l || !isShape(l)) return; if (l.shape !== 'path') VEC.toPath(l); if (l.shape !== 'path') return; if (!l.stroke) { l.stroke = true; l.strokeColor = l.strokeColor || CUR; }
    if (kind === 'uniform') { delete l.ill.widths; l._pk = null; commit(); paintPanels(); draw(); return; }
    const w = widthsOf(l); l.paths.forEach((p, s) => { const n = p.nodes.length; w[s] = p.nodes.map((_, i) => { const t = n > 1 ? i / (n - 1) : 0;
      return kind === 'taper' ? Math.max(.08, Math.sin(Math.PI * t)) * 1.6 : kind === 'end' ? Math.max(.08, 1.4 - 1.3 * t) : kind === 'start' ? Math.max(.08, .1 + 1.3 * t) : kind === 'bulge' ? .6 + 1.4 * Math.sin(Math.PI * t) : 1; }); });
    l._pk = null; commit(); paintPanels(); draw();
  }

  // ---- type on a path ----
  function typeOnPath(l) {
    if (!l || !isShape(l)) return say('Click a path, an ellipse or a rectangle to set type along it.');
    ill(l).text = { text: 'TYPE ON A PATH · FUTURE BASICS', font: 'grotesk', size: Math.max(12, Math.round(W / 28)), bold: true, color: CUR, offset: 0, track: 2 };
    if (!l.ill.fill || l.ill.fill.mode === 'solid') { l.fill = false; } l.stroke = false; l._pk = null; SEL = l.id; commit(); setTool('select'); paintPanels(); draw();
    setTimeout(() => { const t = document.querySelector('#pLayers [data-ill="text.text"]'); if (t) { t.focus(); t.select(); } }, 40);
  }

  // ---- artboards ----
  const BOARD = n => ({ id: id8(), name: n, x: 0, y: 0, w: 100, h: 100, bleed: 0 });
  function boardsFor(L, Wd, Dp, flap) {
    // a box laid out as a cross: top over front, then left · front · right · back in a row, bottom under front, with a glue flap
    const p = needPPI(), mm = v => v / 25.4 * p, l = mm(L), w = mm(Wd), d = mm(Dp), f = mm(flap);
    const x0 = Math.max(4, (W - (2 * l + 2 * d + f)) / 2), y0 = Math.max(4, (H - (2 * d + w)) / 2);
    const B = (name, x, y, bw, bh) => ({ ...BOARD(name), x, y, w: bw, h: bh, bleed: mm(3) });
    return [B('Left side', x0, y0 + d, d, w), B('Front', x0 + d, y0 + d, l, w), B('Right side', x0 + d + l, y0 + d, d, w), B('Back', x0 + 2 * d + l, y0 + d, l, w), B('Top', x0 + d, y0, l, d), B('Bottom', x0 + d, y0 + d + w, l, d), B('Glue flap', x0 + 2 * d + 2 * l, y0 + d, f, w)];
  }
  function dielineFor(boards) {
    const g = boards.reduce((acc, b) => { const r = [[[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]]]; return acc ? polygonClipping.union(acc, r) : [r]; }, null);
    const l = pathLayer(g, { fill: false, fillColor: '#ffffff', stroke: true, strokeW: 2, strokeColor: '#ec008c' }, 'Dieline (cut)'); if (!l) return null; l.fill = false; l.stroke = true; l.strokeColor = '#ec008c'; l.strokeW = Math.max(1, Math.round(W / 800)); return l;
  }
  function boardAt(x, y) { for (let i = DOCX.artboards.length - 1; i >= 0; i--) { const b = DOCX.artboards[i]; if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) return b; } return null; }

  // ---- outline mode and the preflight ----
  function preflight() {
    const out = [], P = ppi();
    for (const l of LAYERS) {
      if (!l.visible) continue;
      if (isShape(l) && l.shape === 'path') {
        const stray = l.paths.filter(p => p.nodes.length < 2).length; if (stray) out.push({ l, sev: 'bad', fix: 'stray', text: `${stray} stray point${stray === 1 ? '' : 's'}: a point with no line, which a cutter or a printer reads as a mark` });
        if (l.fill && l.paths.some(p => !p.closed && p.nodes.length > 2)) out.push({ l, sev: 'warn', fix: 'close', text: 'An open path with a fill: a die line must be closed' });
      }
      if (isShape(l) && P && Math.min(l.shape === 'line' ? Infinity : l.h * l.scale, l.w * l.scale) / P * 25.4 < .5) out.push({ l, sev: 'warn', text: 'Smaller than half a millimetre: too small to cut or print' });
      if (isShape(l) && l.stroke && P && l.strokeW * l.scale / P * 25.4 < .1) out.push({ l, sev: 'warn', text: 'A line thinner than 0.1 mm: it may not print' });
      if ((l.kind === 'image' || l.kind === 'paint') && P) { const eff = P / (l.scale || 1); if (eff < 150) out.push({ l, sev: 'warn', text: `A picture at ${Math.round(eff)} pixels to the inch at this size: 300 is right for print, under 150 shows its pixels` }); }
      if (l.kind === 'text' && !String(l.font).startsWith('f_')) out.push({ l, sev: 'info', text: `Type in ${FONTS[l.font]?.[0] || l.font}: Package lists the font so the vendor sets it the same` });
      if (l.ill?.clipBy && !maskOf(l)) out.push({ l, sev: 'warn', text: 'Clipped by a mask that is no longer here' });
    }
    if (!P) out.push({ l: null, sev: 'warn', text: 'The design has no real size yet: set it with the ruler (U) or by making an artboard in mm or inches' });
    return out;
  }
  function fixStray() { let n = 0; for (const l of LAYERS) if (isShape(l) && l.shape === 'path') { const before = l.paths.length; l.paths = l.paths.filter(p => p.nodes.length >= 2); n += before - l.paths.length; if (l.ill?.widths) l.ill.widths.length = l.paths.length; if (!l.paths.length) l.visible = false; else VEC.normalize(l); } if (n) { commit(); draw(); } return n; }

  // ---- the overlay on the view: artboards, outline mode, the measure line, the shape builder, the width points, the info box ----
  const S = (x, y) => [x * Z + PX, y * Z + PY];
  function overlay(v) {
    if (OUTLINE) {
      v.save(); v.fillStyle = '#ffffff'; v.fillRect(PX, PY, W * Z, H * Z); v.strokeStyle = '#141416'; v.lineWidth = 1;
      for (const l of LAYERS) {
        if (!l.visible || l.kind === 'base') continue;
        if (isShape(l)) { for (const p of VEC.pathsOf(l)) { const pts = VEC.flat(p, .5).map(([a, b]) => S(...VEC.toDoc(l, a, b))); v.beginPath(); pts.forEach(([a, b], i) => (i ? v.lineTo(a, b) : v.moveTo(a, b))); if (p.closed) v.closePath(); v.stroke();
          for (const n of p.nodes) { const [a, b] = S(...VEC.toDoc(l, n[0], n[1])); v.fillStyle = p.nodes.length < 2 ? '#d92c1a' : '#141416'; v.fillRect(a - 2, b - 2, 4, 4); } } }
        else { const p = corners(l).map(q => S(...q)); v.beginPath(); p.forEach(([a, b], i) => (i ? v.lineTo(a, b) : v.moveTo(a, b))); v.closePath(); v.stroke(); if (l.kind !== 'text') { v.beginPath(); v.moveTo(...p[0]); v.lineTo(...p[2]); v.moveTo(...p[1]); v.lineTo(...p[3]); v.stroke(); }
          else { v.save(); v.globalAlpha = .35; const c = processed(l); place2(v, l); v.drawImage(c, -c.width / 2, -c.height / 2); v.restore(); } }
      }
      v.restore();
    }
    // artboards: the trim line, the bleed outside it, the name
    if (DOCX.artboards.length) {
      v.save(); v.font = '600 11px "IBM Plex Mono",monospace';
      for (const b of DOCX.artboards) {
        const [a, c] = S(b.x, b.y); v.setLineDash([]); v.strokeStyle = TOOL === 'artboard' ? '#1c7a4a' : 'rgba(20,20,22,.7)'; v.lineWidth = TOOL === 'artboard' ? 2 : 1; v.strokeRect(a, c, b.w * Z, b.h * Z);
        if (b.bleed > 0) { v.setLineDash([4, 3]); v.strokeStyle = '#d92c1a'; v.lineWidth = 1; v.strokeRect(a - b.bleed * Z, c - b.bleed * Z, (b.w + 2 * b.bleed) * Z, (b.h + 2 * b.bleed) * Z); }
        v.setLineDash([]); const t = `${b.name} · ${fmt(b.w)} × ${fmt(b.h)}`, tw = v.measureText(t).width + 10; v.fillStyle = 'rgba(20,20,22,.82)'; v.fillRect(a, c - 18, tw, 16); v.fillStyle = '#fff'; v.fillText(t, a + 5, c - 6);
        if (TOOL === 'artboard') { v.fillStyle = '#4bff9a'; v.strokeStyle = '#141416'; v.fillRect(a + b.w * Z - 6, c + b.h * Z - 6, 12, 12); v.strokeRect(a + b.w * Z - 6, c + b.h * Z - 6, 12, 12); }
      }
      v.restore();
    }
    if (MEASURE) { const [a, b] = S(MEASURE.x0, MEASURE.y0), [c, d] = S(MEASURE.x1, MEASURE.y1); v.save(); v.strokeStyle = '#d92c1a'; v.lineWidth = 2; v.beginPath(); v.moveTo(a, b); v.lineTo(c, d); v.stroke();
      for (const [p, q] of [[a, b], [c, d]]) { v.beginPath(); v.arc(p, q, 4, 0, Math.PI * 2); v.fillStyle = '#fff'; v.fill(); v.stroke(); }
      const t = measureText(MEASURE); v.font = '600 12px "IBM Plex Mono",monospace'; const tw = v.measureText(t).width + 12; v.fillStyle = '#141416'; v.fillRect((a + c) / 2 - tw / 2, (b + d) / 2 - 26, tw, 20); v.fillStyle = '#fff'; v.fillText(t, (a + c) / 2 - tw / 2 + 6, (b + d) / 2 - 12); v.restore(); }
    if (SB && TOOL === 'shapebuilder') { v.save();
      for (const [i, p] of SB.pieces.entries()) { const on = SB.drag.has(i), hov = SB.hover === i; if (!on && !hov) continue; v.fillStyle = on ? 'rgba(75,255,154,.45)' : 'rgba(75,255,154,.22)'; v.strokeStyle = '#1c7a4a'; v.lineWidth = 2;
        for (const poly of p.g) { v.beginPath(); for (const ring of poly) ring.forEach((q, k) => { const [a, b] = S(q[0], q[1]); k ? v.lineTo(a, b) : v.moveTo(a, b); }); v.fill('evenodd'); v.stroke(); } }
      v.restore(); }
    if (TOOL === 'width') { const l = selected(); if (l && isShape(l) && l.shape === 'path') { const w = l.ill?.widths; v.save(); l.paths.forEach((p, s) => p.nodes.forEach((n, i) => { const [a, b] = S(...VEC.toDoc(l, n[0], n[1])), r = Math.max(4, (l.strokeW * (w?.[s]?.[i] ?? 1) * l.scale * Z) / 2); v.strokeStyle = '#1c7a4a'; v.setLineDash([3, 3]); v.beginPath(); v.arc(a, b, r, 0, Math.PI * 2); v.stroke(); v.setLineDash([]); v.fillStyle = '#4bff9a'; v.fillRect(a - 3, b - 3, 6, 6); })); v.restore(); } }
    if (INFO) infoPaint();
  }
  function place2(v, l) { const [a, b] = S(l.x, l.y); v.translate(a, b); v.rotate(l.rot); v.scale(l.scale * Z * (l.flip ? -1 : 1), l.scale * Z); }
  const measureText = m => { const dX = m.x1 - m.x0, dY = m.y1 - m.y0, d = Math.hypot(dX, dY), ang = (Math.atan2(-dY, dX) * 180 / Math.PI + 360) % 360; return `${fmt(d)} · ${ang.toFixed(1)}° · Δx ${fmt(Math.abs(dX))} · Δy ${fmt(Math.abs(dY))}`; };
  let infoEl = null;
  function infoPaint() {
    if (!infoEl) { infoEl = document.createElement('div'); infoEl.id = 'illInfo'; infoEl.setAttribute('role', 'status'); infoEl.style.cssText = 'position:absolute;left:12px;bottom:56px;z-index:6;background:rgba(20,20,22,.9);color:#fff;font:500 11px/1.5 "IBM Plex Mono",monospace;padding:8px 11px;border-radius:10px;pointer-events:none;min-width:200px'; $('#stage').appendChild(infoEl); }
    infoEl.classList.toggle('hidden', !INFO);
    const ls = chosen().filter(l => !fixed(l)), b = ls.length ? unionBox(ls) : null, l = selected();
    infoEl.innerHTML = [`Info · ${UNIT === 'mm' ? 'millimetres' : 'inches'}${ppi() ? '' : ' (no real size yet)'}`, HOVERPT ? `X ${fmt(HOVERPT[0])}   Y ${fmt(HOVERPT[1])}` : 'X —   Y —',
      b ? `W ${fmt(b.x1 - b.x0)}   H ${fmt(b.y1 - b.y0)}` : 'Nothing chosen', l && !fixed(l) ? `Turned ${(l.rot * 180 / Math.PI).toFixed(1)}°${l.flip ? ' · reflected' : ''}` : '', MEASURE ? `Measured ${measureText(MEASURE)}` : ''].filter(Boolean).map(hx).join('<br>');
  }

  // ---- the tools on the picture ----
  function down(e, x, y) {
    if (TOOL === 'artboard') {
      const b = boardAt(x, y), tol = 10 / Z;
      const corner = DOCX.artboards.find(q => Math.abs(x - (q.x + q.w)) < tol && Math.abs(y - (q.y + q.h)) < tol);
      if (corner) { DRAG = { mode: 'ab-size', b: corner, pid: e.pointerId }; return true; }
      if (b) { DRAG = { mode: 'ab-move', b, ox: x - b.x, oy: y - b.y, pid: e.pointerId }; docRefresh(b.id); return true; }
      const nb = { ...BOARD(`Artboard ${DOCX.artboards.length + 1}`), x, y, w: 1, h: 1 }; DOCX.artboards.push(nb); DRAG = { mode: 'ab-new', b: nb, x0: x, y0: y, pid: e.pointerId }; return true;
    }
    if (TOOL === 'measure') { MEASURE = { x0: x, y0: y, x1: x, y1: y }; DRAG = { mode: 'measure', pid: e.pointerId }; draw(); return true; }
    if (TOOL === 'typepath') { const h = hit(x, y); typeOnPath(h && isShape(h) ? h : null); return true; }
    if (TOOL === 'width') {
      const l = selected(); if (!l || !isShape(l)) { const h = hit(x, y); if (h && isShape(h)) { SEL = h.id; paintPanels(); draw(); } else say('Choose a path or a line, then drag at one of its points.'); return true; }
      if (l.shape !== 'path') { VEC.toPath(l); if (l.shape !== 'path') return true; }
      if (!l.stroke) { l.stroke = true; }
      let best = null; l.paths.forEach((p, s) => p.nodes.forEach((n, i) => { const [a, b] = VEC.toDoc(l, n[0], n[1]), d = Math.hypot(a - x, b - y); if (!best || d < best.d) best = { s, i, d, a, b }; }));
      if (!best || best.d * Z > 40) { say('Drag at one of the path’s points: further out makes it thicker there.'); return true; }
      widthsOf(l); DRAG = { mode: 'width', l, ...best, pid: e.pointerId }; return true;
    }
    if (TOOL === 'shapebuilder') {
      if (!SB) sbStart(); if (!SB) return true;
      const i = SB.pieces.findIndex(p => inGeom(x, y, p.g)); if (i < 0) return true;
      if (e.altKey) { SB.gone.add(i); sbFinish(); return true; }
      SB.drag = new Set([i]); DRAG = { mode: 'sb', pid: e.pointerId }; draw(); return true;
    }
    return false;
  }
  function move(g, x, y, e) {
    if (TOOL === 'shapebuilder' && SB && !g) { SB.hover = SB.pieces.findIndex(p => inGeom(x, y, p.g)); draw(); }
    HOVERPT = [x, y]; if (INFO) infoPaint();
    if (!g) return false;
    if (g.mode === 'ab-new') { const b = g.b; b.x = Math.min(x, g.x0); b.y = Math.min(y, g.y0); b.w = Math.max(1, Math.abs(x - g.x0)); b.h = Math.max(1, Math.abs(y - g.y0)); if (e.shiftKey) b.w = b.h = Math.max(b.w, b.h); draw(); return true; }
    if (g.mode === 'ab-move') { g.b.x = Math.round(x - g.ox); g.b.y = Math.round(y - g.oy); draw(); return true; }
    if (g.mode === 'ab-size') { g.b.w = Math.max(8, x - g.b.x); g.b.h = Math.max(8, y - g.b.y); draw(); return true; }
    if (g.mode === 'measure') { MEASURE.x1 = x; MEASURE.y1 = y; if (e.shiftKey) { const a = Math.round(Math.atan2(y - MEASURE.y0, x - MEASURE.x0) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(x - MEASURE.x0, y - MEASURE.y0); MEASURE.x1 = MEASURE.x0 + Math.cos(a) * d; MEASURE.y1 = MEASURE.y0 + Math.sin(a) * d; } draw(); return true; }
    if (g.mode === 'width') { const l = g.l, d = Math.hypot(x - g.a, y - g.b) * 2 / Math.max(1, l.strokeW * l.scale); l.ill.widths[g.s][g.i] = Math.max(.05, Math.min(12, d)); l._pk = null; draw(); return true; }
    if (g.mode === 'sb') { const i = SB.pieces.findIndex(p => inGeom(x, y, p.g)); if (i >= 0) SB.drag.add(i); draw(); return true; }
    return false;
  }
  function end(g) {
    if (!g) return false;
    if (g.mode === 'ab-new') { if (g.b.w < 8 || g.b.h < 8) { DOCX.artboards = DOCX.artboards.filter(b => b !== g.b); draw(); return true; } touch(); docRefresh(g.b.id); return true; }
    if (g.mode === 'ab-move' || g.mode === 'ab-size') { touch(); docRefresh(g.b.id); return true; }
    if (g.mode === 'measure') { draw(); if (INFO) infoPaint(); return true; }
    if (g.mode === 'width') { commit(); paintPanels(); return true; }
    if (g.mode === 'sb') { sbFinish(); return true; }
    return false;
  }
  function sbStart() {
    if (typeof polygonClipping === 'undefined') { say('The shape tools did not load. Reload the page.'); return; }
    const ls = shapesChosen(); if (ls.length < 2) { say('Choose two shapes or more (Shift-click), then drag across the regions to merge them; Alt-click a region to take it away.'); setTool('select'); return; }
    try { SB = { src: ls, pieces: regions(ls), drag: new Set(), gone: new Set(), hover: -1 }; } catch (e) { say('Those shapes could not be read: ' + e.message); SB = null; }
  }
  function sbFinish() {
    if (!SB) return; const { src, pieces, drag, gone } = SB; const made = [];
    if (drag.size) { const ps = [...drag].map(i => pieces[i]); const g = ps.length > 1 ? polygonClipping.union(...ps.map(p => p.g)) : ps[0].g; const l = pathLayer(g, ps[ps.length - 1].from, 'Built shape'); if (l) made.push(l); }
    pieces.forEach((p, i) => { if (drag.has(i) || gone.has(i)) return; const l = pathLayer(p.g, p.from, 'Piece'); if (l) made.push(l); });
    replaceWith(src, made); commit(); paintPanels(); draw();
    // keep building with what is left
    SB = null; if (made.length > 1) sbStart(); else setTool('select');
  }

  // ---- keys ----
  function key(e) {
    if (!D || e.target.closest?.('input,textarea,select,[contenteditable]')) return false;
    if (VMODE === 'front' || VMODE === 'back') return false;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'y') { e.preventDefault(); outline(!OUTLINE); return true; }
    if (mod && k === 'u') { e.preventDefault(); INFO = !INFO; infoPaint(); draw(); return true; }
    if (mod && (k === '7' || e.code === 'Digit7')) { e.preventDefault(); e.altKey ? clipRelease() : clipMake(); return true; }
    if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : group(); return true; }
    if (mod || e.altKey) return false;
    if (e.shiftKey && k === 'o') { setTool('artboard'); return true; }
    if (e.shiftKey && k === 'm') { setTool('shapebuilder'); return true; }
    if (e.shiftKey && k === 'w') { setTool('width'); return true; }
    if (e.shiftKey && k === 'u') { setTool('measure'); return true; }
    if (e.shiftKey && k === 't') { setTool('typepath'); return true; }
    if (e.shiftKey) return false;
    if (k === 'o') { dlgReflect(); return true; }
    if (k === 's') { dlgScale(); return true; }
    if (k === 'l') { setTool('ellipse'); return true; }   // as in Illustrator: L ellipse, \ line
    if (e.key === '\\') { setTool('line'); return true; }
    if (e.key === 'Escape' && TOOL === 'shapebuilder') { SB = null; setTool('select'); return true; }
    return false;
  }
  function outline(on) { OUTLINE = on; draw(); say(on ? 'Outline mode: only the paths and their points. Red points are stray. ⌘Y goes back.' : 'Preview.'); const b = $('#illOutline'); if (b) b.setAttribute('aria-pressed', String(on)); }

  // ---- dialogs ----
  function dialog(id, title, body) {
    let d = document.getElementById(id); if (!d) { d = document.createElement('dialog'); d.id = id; d.className = 'illdlg'; document.body.appendChild(d); }
    d.innerHTML = `<form method="dialog" class="illbox"><div class="row" style="justify-content:space-between"><h3 style="margin:0;font-size:16px">${hx(title)}</h3><button class="btn sm q" value="cancel" aria-label="Close">✕</button></div>${body}</form>`;
    if (!d.open) d.showModal(); return d;
  }
  function dlgReflect() {
    if (!chosen().filter(l => !fixed(l)).length) return say('Choose what to reflect first (O).');
    const d = dialog('illReflect', 'Reflect', `<div class="illgrid"><label><input type="radio" name="ax" value="90" checked> Vertical axis (left ↔ right)</label><label><input type="radio" name="ax" value="0"> Horizontal axis (top ↕ bottom)</label><label><input type="radio" name="ax" value="angle"> Angle <input class="t" name="deg" type="number" value="45" step="1" style="width:80px">°</label></div>
      <p class="note">Mirrors round the middle of what is chosen. A copy keeps the original, for a pack's mirrored flaps or a pair of parts.</p><div class="row"><button class="btn sm q" value="copy">Copy</button><button class="btn sm go" value="ok">Reflect</button></div>`);
    d.onclose = () => { if (!['ok', 'copy'].includes(d.returnValue)) return; const f = new FormData(d.querySelector('form')), a = f.get('ax') === 'angle' ? num(f.get('deg'), 45) : num(f.get('ax'), 90); reflect(a, d.returnValue === 'copy'); };
  }
  function dlgScale() {
    const ls = chosen().filter(l => !fixed(l)); if (!ls.length) return say('Choose what to scale first (S).');
    const b = unionBox(ls), w = b.x1 - b.x0, h = b.y1 - b.y0;
    const d = dialog('illScale', 'Scale', `<div class="illgrid"><label><input type="radio" name="how" value="u" checked> Uniform <input class="t" name="u" type="number" value="100" step="1" style="width:90px"> %</label>
      <label><input type="radio" name="how" value="n"> Non-uniform: width <input class="t" name="sx" type="number" value="100" step="1" style="width:80px"> % · height <input class="t" name="sy" type="number" value="100" step="1" style="width:80px"> %</label>
      <label><input type="radio" name="how" value="size"> Exact size: <input class="t" name="w" type="number" step="0.1" value="${toUnit(w).toFixed(2)}" style="width:90px"> × <input class="t" name="h" type="number" step="0.1" value="${toUnit(h).toFixed(2)}" style="width:90px"> ${UNIT} <label style="display:inline"><input type="checkbox" name="keep" checked> keep proportions</label></label>
      <label><input type="checkbox" name="strokes" checked> Scale lines and type with it</label></div>
      ${ppi() ? '' : '<p class="note">This design has no real size yet. An exact size sets it to 100 pixels to the inch.</p>'}<div class="row"><button class="btn sm q" value="copy">Copy</button><button class="btn sm go" value="ok">Scale</button></div>`);
    d.onclose = () => { if (!['ok', 'copy'].includes(d.returnValue)) return; const f = new FormData(d.querySelector('form')), how = f.get('how'); let sx = 1, sy = 1;
      if (how === 'u') sx = sy = num(f.get('u'), 100) / 100; else if (how === 'n') { sx = num(f.get('sx'), 100) / 100; sy = num(f.get('sy'), 100) / 100; }
      else { needPPI(); const tw = fromUnit(num(f.get('w'), toUnit(w))), th = fromUnit(num(f.get('h'), toUnit(h))); sx = tw / w; sy = f.get('keep') ? sx : th / h; if (f.get('keep') && Math.abs(toUnit(th) - toUnit(h)) > .01 && Math.abs(toUnit(tw) - toUnit(w)) < .01) sx = sy = th / h; }
      scaleBy(sx, sy, { strokes: Boolean(f.get('strokes')), copy: d.returnValue === 'copy' }); };
  }

  // ---- the Document dialog: artboards, swatches, symbols, preflight, units, package, 3D mockup ----
  let DOCTAB = 'artboards', ABSEL = null;
  function docOpen(tab) { if (tab) DOCTAB = tab; docPaint(); }
  // redrawn when it is open; drawing on the picture never opens it
  function docRefresh(abId) { if (abId) ABSEL = abId; if (document.getElementById('illDoc')?.open) docPaint(); }
  function docPaint() {
    const tabs = [['artboards', 'Artboards'], ['swatches', 'Swatches'], ['symbols', 'Symbols'], ['preflight', 'Preflight'], ['export', 'Package and 3D']];
    let body = `<div class="row" role="tablist" style="gap:6px;flex-wrap:wrap">${tabs.map(([k, t]) => `<button type="button" class="btn sm ${DOCTAB === k ? '' : 'q'}" data-doctab="${k}" role="tab" aria-selected="${DOCTAB === k}">${t}</button>`).join('')}<span style="flex:1"></span><label class="note">Units <select class="t" data-unit style="width:auto"><option value="mm" ${UNIT === 'mm' ? 'selected' : ''}>mm</option><option value="in" ${UNIT === 'in' ? 'selected' : ''}>inches</option></select></label></div>`;
    if (DOCTAB === 'artboards') {
      body += `<p class="note">An artboard is one face of the pack or one part of the product: its trim line, with the bleed outside it in red. Draw one with the Artboard tool (⇧O), or lay out a box.</p>
        <div class="illlist">${DOCX.artboards.map(b => `<div class="illrow ${ABSEL === b.id ? 'on' : ''}"><input class="t" data-ab="${b.id}" data-k="name" value="${hx(b.name)}" aria-label="Name" maxlength="60">
          <label>W <input class="t" type="number" step="0.1" data-ab="${b.id}" data-k="w" value="${toUnit(b.w).toFixed(2)}"></label><label>H <input class="t" type="number" step="0.1" data-ab="${b.id}" data-k="h" value="${toUnit(b.h).toFixed(2)}"></label>
          <label>Bleed <input class="t" type="number" step="0.5" data-ab="${b.id}" data-k="bleed" value="${toUnit(b.bleed).toFixed(2)}"></label><button type="button" class="btn sm q" data-abfit="${b.id}">Show</button><button type="button" class="btn sm q" data-abpng="${b.id}">PNG</button><button type="button" class="btn sm q danger" data-abdel="${b.id}">Delete</button></div>`).join('') || '<p class="note">No artboards yet.</p>'}</div>
        <fieldset class="illbox2"><legend>A box, laid out flat (mm)</legend><div class="row"><label>Length <input class="t" type="number" name="bl" value="120" style="width:80px"></label><label>Width <input class="t" type="number" name="bw" value="160" style="width:80px"></label><label>Depth <input class="t" type="number" name="bd" value="40" style="width:80px"></label><label>Glue flap <input class="t" type="number" name="bf" value="15" style="width:70px"></label>
          <label><input type="checkbox" name="cut" checked> with its dieline</label><button type="button" class="btn sm go" data-boxmake>Lay out the box</button></div></fieldset>`;
    } else if (DOCTAB === 'swatches') {
      body += `<p class="note">Global colours: anything coloured from a swatch changes when the swatch does. Each shows its nearest Pantone C chip; have the printer confirm against the physical guide.</p>
        <div class="illlist">${DOCX.swatches.map(s => `<div class="illrow"><input type="color" data-sw="${s.id}" value="${s.hex}" aria-label="Colour"><input class="t" data-swname="${s.id}" value="${hx(s.name)}" maxlength="40" aria-label="Name"><span class="note" style="min-width:150px">${hx(s.pantone || '')}</span>
          <button type="button" class="btn sm q" data-swapply="${s.id}">Fill</button><button type="button" class="btn sm q" data-swapply="${s.id}" data-which="stroke">Outline</button><button type="button" class="btn sm q danger" data-swdel="${s.id}">Delete</button></div>`).join('') || '<p class="note">No swatches yet.</p>'}</div>
        <div class="row"><button type="button" class="btn sm go" data-swadd>Add the current colour</button><button type="button" class="btn sm q" data-swfromsel>Add the colours of what is chosen</button></div>`;
    } else if (DOCTAB === 'symbols') {
      body += `<p class="note">A symbol is one design used many times (a screw, a button, a mark). Change any instance and the others follow; place another, or unlink one to change it alone.</p>
        <div class="illlist">${DOCX.symbols.map(s => { const n = LAYERS.filter(l => l.ill?.sym === s.id).length; return `<div class="illrow"><b style="min-width:160px">${hx(s.name)}</b><span class="note">${n} on the picture</span><button type="button" class="btn sm q" data-symplace="${s.id}">Place another</button><button type="button" class="btn sm q danger" data-symdel="${s.id}">Delete the symbol</button></div>`; }).join('') || '<p class="note">No symbols yet.</p>'}</div>
        <div class="row"><button type="button" class="btn sm go" data-symmake>Make the chosen layer a symbol</button></div>`;
    } else if (DOCTAB === 'preflight') {
      const list = preflight();
      body += `<p class="note">What a printer or a cutter would trip on. Outline mode (⌘Y) shows the bare paths, with stray points in red.</p><div class="illlist">${list.map(p => `<div class="illrow"><span class="sev ${p.sev}">${p.sev === 'bad' ? 'Fix' : p.sev === 'warn' ? 'Check' : 'Note'}</span><span><b>${hx(p.l?.name || 'The design')}</b> · ${hx(p.text)}</span>${p.l ? `<button type="button" class="btn sm q" data-pfsel="${p.l.id}">Show</button>` : ''}${p.fix === 'stray' ? '<button type="button" class="btn sm q" data-pffix="stray">Remove stray points</button>' : ''}</div>`).join('') || '<p class="note"><b>Nothing found.</b> Ready to package.</p>'}</div>
        <div class="row"><button type="button" class="btn sm q" id="illOutline" aria-pressed="${OUTLINE}" data-outline>Outline mode (⌘Y)</button></div>`;
    } else {
      body += `<fieldset class="illbox2"><legend>Package for the vendor</legend><p class="note">One zip: the picture as PNG and SVG, each artboard as PNG and SVG, every picture used at its own size, the fonts, every colour with its Pantone C, and a report with the sizes and the preflight.</p><div class="row"><button type="button" class="btn sm go" data-package>Package</button></div></fieldset>
        <fieldset class="illbox2"><legend>3D mockup</legend><p class="note">The picture, or its artboards, on a real shape. Box faces come from artboards named Front, Back, Left side, Right side, Top and Bottom.</p><div class="row"><button type="button" class="btn sm go" data-mockup>Open the mockup</button></div></fieldset>`;
    }
    const dlg = dialog('illDoc', 'Document', `<div class="illdoc">${body}</div>`);
    dlg.onclose = () => {};
  }
  // the dialog's own clicks and edits
  document.addEventListener('click', async e => {
    const t = e.target.closest('#illDoc [data-doctab],#illDoc [data-abfit],#illDoc [data-abdel],#illDoc [data-abpng],#illDoc [data-boxmake],#illDoc [data-swadd],#illDoc [data-swfromsel],#illDoc [data-swapply],#illDoc [data-swdel],#illDoc [data-symmake],#illDoc [data-symplace],#illDoc [data-symdel],#illDoc [data-pfsel],#illDoc [data-pffix],#illDoc [data-outline],#illDoc [data-package],#illDoc [data-mockup]');
    if (!t) return; e.preventDefault(); const ds = t.dataset;
    if (ds.doctab) { DOCTAB = ds.doctab; docRefresh(); return; }
    if (ds.abfit) { const b = DOCX.artboards.find(q => q.id === ds.abfit); if (b) { const r = $('#stage').getBoundingClientRect(); Z = Math.min((r.width - 60) / b.w, (r.height - 60) / b.h, 8); PX = (r.width - b.w * Z) / 2 - b.x * Z; PY = (r.height - b.h * Z) / 2 - b.y * Z; FITTED = false; draw(); } return; }
    if (ds.abdel) { DOCX.artboards = DOCX.artboards.filter(b => b.id !== ds.abdel); touch(); draw(); docRefresh(); return; }
    if (ds.abpng) { const b = DOCX.artboards.find(q => q.id === ds.abpng); if (b) { const c = boardCanvas(b); c.toBlob(bl => { const u = URL.createObjectURL(bl); download(u, `${fileBase()}-${slug(b.name)}.png`); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png'); } return; }
    if (ds.boxmake !== undefined) { const f = t.closest('fieldset'), v = n => num(f.querySelector(`[name=${n}]`).value, 0); if (!(v('bl') > 0 && v('bw') > 0 && v('bd') > 0)) return say('Give the box a length, width and depth in mm.');
      const bs = boardsFor(v('bl'), v('bw'), v('bd'), Math.max(0, v('bf'))); DOCX.artboards.push(...bs); if (f.querySelector('[name=cut]').checked && typeof polygonClipping !== 'undefined') { const cut = dielineFor(bs); if (cut) addLayer(cut, { silent: true }); }
      commit(); setTool('artboard'); draw(); docRefresh(); say('The box is laid out: seven artboards and its dieline. Put the artwork on each face.'); return; }
    if (ds.swadd !== undefined) { await swatchAdd(CUR); return; }
    if (ds.swfromsel !== undefined) { const cs = new Set(); for (const l of chosen()) { if (isShape(l)) { if (l.fill) cs.add(l.fillColor); if (l.stroke) cs.add(l.strokeColor); } if (l.kind === 'text') cs.add(l.color); } for (const c of cs) if (!DOCX.swatches.some(s => s.hex.toLowerCase() === c.toLowerCase())) await swatchAdd(c); if (!cs.size) say('Choose shapes or type to take their colours.'); docRefresh(); return; }
    if (ds.swapply) { swatchApply(ds.swapply, ds.which || 'fill'); return; }
    if (ds.swdel) { DOCX.swatches = DOCX.swatches.filter(s => s.id !== ds.swdel); for (const l of LAYERS) if (l.ill?.sw) for (const k of Object.keys(l.ill.sw)) if (l.ill.sw[k] === ds.swdel) delete l.ill.sw[k]; touch(); docRefresh(); return; }
    if (ds.symmake !== undefined) { symbolMake(); return; }
    if (ds.symplace) { symbolPlace(ds.symplace); return; }
    if (ds.symdel) { DOCX.symbols = DOCX.symbols.filter(s => s.id !== ds.symdel); for (const l of LAYERS) if (l.ill?.sym === ds.symdel) delete l.ill.sym; touch(); docRefresh(); return; }
    if (ds.pfsel) { SEL = ds.pfsel; PRO?.SELS.clear(); PRO?.SELS.add(SEL); paintPanels(); draw(); return; }
    if (ds.pffix === 'stray') { const n = fixStray(); say(n ? `${n} stray point${n === 1 ? '' : 's'} removed.` : 'No stray points.'); docRefresh(); return; }
    if (ds.outline !== undefined) { outline(!OUTLINE); docRefresh(); return; }
    if (ds.package !== undefined) { pack(t); return; }
    if (ds.mockup !== undefined) { mockup(); return; }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches?.('#illDoc [data-unit]')) { UNIT = t.value === 'in' ? 'in' : 'mm'; try { localStorage.setItem(UKEY, UNIT); } catch {} docRefresh(); draw(); return; }
    if (t.matches?.('#illDoc [data-ab]')) { const b = DOCX.artboards.find(q => q.id === t.dataset.ab); if (!b) return; const k = t.dataset.k; if (k === 'name') b.name = t.value.slice(0, 60) || b.name; else { needPPI(); const v = Math.max(0, fromUnit(num(t.value, 0))); if (k === 'bleed') b.bleed = v; else b[k] = Math.max(4, v); } touch(); draw(); return; }
    if (t.matches?.('#illDoc [data-sw]')) { const n = swatchSet(t.dataset.sw, t.value); docRefresh(); say(`Changed everywhere it is used${n ? ` (${n} layer${n === 1 ? '' : 's'})` : ''}.`); return; }
    if (t.matches?.('#illDoc [data-swname]')) { const s = DOCX.swatches.find(q => q.id === t.dataset.swname); if (s) { s.name = t.value.slice(0, 40); touch(); } }
  });

  // ---- one artboard as its own picture (with its bleed) ----
  function boardCanvas(b) {
    compose(); const k = b.bleed || 0, x = Math.round(b.x - k), y = Math.round(b.y - k), w = Math.max(1, Math.round(b.w + 2 * k)), h = Math.max(1, Math.round(b.h + 2 * k));
    const c = canvas(w, h), cx = c.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h); cx.drawImage(docC, x, y, w, h, 0, 0, w, h); return c;
  }
  const slug = s => String(s || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'board';

  // ---- package: a zip written in the browser (stored, not compressed: pictures are compressed already) ----
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data)), c = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const e = new DataView(new ArrayBuffer(46)); e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint32(16, c, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, name.length, true); e.setUint32(42, off, true);
      dir.push(new Uint8Array(e.buffer), name); off += 30 + name.length + data.length;
    }
    const size = dir.reduce((s, p) => s + p.length, 0), z = new DataView(new ArrayBuffer(22)); z.setUint32(0, 0x06054b50, true); z.setUint16(8, files.length, true); z.setUint16(10, files.length, true); z.setUint32(12, size, true); z.setUint32(16, off, true);
    return new Blob([...parts, ...dir, new Uint8Array(z.buffer)], { type: 'application/zip' });
  }
  // a data: URL's bytes, read here (the page's security policy does not let fetch() open one)
  const dataBytes = u => { const b = atob(String(u).split(',')[1] || ''), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const pngBytes = c => new Promise(res => c.toBlob(async b => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
  function boardSvg(svg, b) { const k = b.bleed || 0; return svg.replace(/<svg ([^>]*?)width="\d+" height="\d+" viewBox="[^"]*"/, `<svg $1width="${Math.round(b.w + 2 * k)}" height="${Math.round(b.h + 2 * k)}" viewBox="${(b.x - k).toFixed(2)} ${(b.y - k).toFixed(2)} ${(b.w + 2 * k).toFixed(2)} ${(b.h + 2 * k).toFixed(2)}"`); }
  async function pack(btn) {
    btn.disabled = true; busy('Packaging…');
    try {
      await loadPantone(); compose(); const files = [], base = fileBase(), svg = svgDoc();
      files.push({ name: `${base}/${base}.png`, data: await pngBytes(docC) }, { name: `${base}/${base}.svg`, data: svg });
      for (const b of DOCX.artboards) { files.push({ name: `${base}/artboards/${slug(b.name)}.png`, data: await pngBytes(boardCanvas(b)) }, { name: `${base}/artboards/${slug(b.name)}.svg`, data: boardSvg(svg, b) }); }
      // every picture used, at its own size
      for (const l of LAYERS) if ((l.kind === 'image' || l.kind === 'paint' || l.kind === 'base') && l.raster && l.visible) files.push({ name: `${base}/links/${slug(l.name)}-${l.id.slice(0, 6)}.png`, data: await pngBytes(l.raster) });
      for (const l of LAYERS) if (l.ill?.fill?.mode === 'pattern' && l.ill.fill.src) files.push({ name: `${base}/links/pattern-${slug(l.name)}-${l.id.slice(0, 6)}.png`, data: dataBytes(l.ill.fill.src) });
      // the fonts: our own font files go in; built-in ones are named so the vendor can get them
      const fonts = new Set(); for (const l of LAYERS) { if (l.kind === 'text') fonts.add(l.font); if (l.ill?.text) fonts.add(l.ill.text.font); }
      const named = [];
      for (const k of fonts) { const f = FONTS[k]; if (!f) continue; if (k.startsWith('f_')) { try { const b = await (await blobOf(`/v1/lab/fonts/${f[2]}/file`)).arrayBuffer(); const u8 = new Uint8Array(b), sig4 = String.fromCharCode(...u8.slice(0, 4)), ext = sig4 === 'wOF2' ? 'woff2' : sig4 === 'wOFF' ? 'woff' : sig4 === 'OTTO' ? 'otf' : 'ttf'; files.push({ name: `${base}/fonts/${slug(f[0])}.${ext}`, data: u8 }); named.push(`${f[0]} (file included)`); } catch { named.push(`${f[0]} (the file could not be read: send it separately)`); } } else named.push(`${f[0]} (a Google font: fonts.google.com)`); }
      // every colour, with its Pantone C
      const cols = new Map(); const add = (hex, where) => { if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return; const k = hex.toLowerCase(); if (!cols.has(k)) cols.set(k, new Set()); cols.get(k).add(where); };
      for (const l of LAYERS) { if (!l.visible) continue; if (isShape(l)) { if (l.fill) add(l.fillColor, l.name); if (l.stroke) add(l.strokeColor, l.name); for (const s of l.ill?.fill?.stops || []) add(s.color, l.name); for (const m of l.ill?.fill?.mesh || []) add(m, l.name); } if (l.kind === 'text') { add(l.color, l.name); if (l.outline) add(l.outlineColor, l.name); } if (l.ill?.text) add(l.ill.text.color, l.name); if (l.tint?.amount === 1) add(l.tint.color, l.name); }
      const sw = new Map(DOCX.swatches.map(s => [s.hex.toLowerCase(), s.name]));
      const colours = ['Colour,Swatch,Pantone C (nearest; confirm on the physical guide),Used on', ...[...cols].map(([h, w]) => [h, sw.get(h) || '', PANT(h), [...w].join(' · ')].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
      files.push({ name: `${base}/colours.csv`, data: colours });
      const pf = preflight(), P = ppi();
      const report = [`${D.concept?.name || base} · packaged from the Future Basics Studio · ${new Date().toISOString().slice(0, 10)}`, '',
        `Picture: ${W} × ${H} px${P ? ` at ${P.toFixed(1)} px to the inch = ${(W / P * 25.4).toFixed(1)} × ${(H / P * 25.4).toFixed(1)} mm` : ' (no real size set)'}`, '',
        'Artboards (trim size, bleed outside it):', ...(DOCX.artboards.length ? DOCX.artboards.map(b => `  ${b.name}: ${P ? `${(b.w / P * 25.4).toFixed(1)} × ${(b.h / P * 25.4).toFixed(1)} mm, bleed ${(b.bleed / P * 25.4).toFixed(1)} mm` : `${Math.round(b.w)} × ${Math.round(b.h)} px`}`) : ['  none']), '',
        'Fonts:', ...(named.length ? named.map(f => '  ' + f) : ['  none']), '', `Colours: ${cols.size} (see colours.csv, with the nearest Pantone C chip for each)`, '',
        'Symbols:', ...(DOCX.symbols.length ? DOCX.symbols.map(s => `  ${s.name}: ${LAYERS.filter(l => l.ill?.sym === s.id).length} instances`) : ['  none']), '',
        'Preflight:', ...(pf.length ? pf.map(p => `  [${p.sev === 'bad' ? 'FIX' : p.sev === 'warn' ? 'CHECK' : 'NOTE'}] ${p.l?.name || 'The design'}: ${p.text}`) : ['  nothing found']), '',
        'Files:', '  ' + base + '.png / .svg: the whole picture', '  artboards/: each artboard with its bleed, as PNG and SVG', '  links/: every picture used, at its own size', '  fonts/: the font files we hold'];
      files.push({ name: `${base}/report.txt`, data: report.join('\n') });
      const blob = zip(files), u = URL.createObjectURL(blob); download(u, `${base}-package.zip`); setTimeout(() => URL.revokeObjectURL(u), 8000);
      say(`Packaged: ${files.length} files.${pf.some(p => p.sev === 'bad') ? ' The preflight found things to fix: see report.txt.' : ''}`);
    } catch (x) { say('The package could not be made: ' + x.message); } finally { busy(); btn.disabled = false; }
  }

  // ---- 3D mockup ----
  async function mockup() {
    const d = dialog('illMock', '3D mockup', `<div class="row"><label>Shape <select class="t" name="shape" style="width:auto"><option value="can">Can</option><option value="box">Box</option><option value="bottle">Bottle</option><option value="pouch">Pouch</option></select></label>
      <label>Artwork <select class="t" name="src" style="width:auto"><option value="">The whole picture</option>${DOCX.artboards.map(b => `<option value="${b.id}">${hx(b.name)}</option>`).join('')}</select></label><button type="button" class="btn sm q" data-mockpng>Save a picture</button></div>
      <div id="illMockHost" style="width:min(820px,90vw);height:min(560px,62vh);border-radius:14px;background:#ecebe6;margin-top:10px"></div><p class="note">Drag to turn it, scroll to zoom. A box takes its faces from artboards named Front, Back, Left side, Right side, Top and Bottom.</p>`);
    let THREE, Orbit; try { THREE = await import('/lab/vendor/three/build/three.module.js'); Orbit = (await import('/lab/vendor/three/examples/jsm/controls/OrbitControls.js')).OrbitControls; } catch (e) { say('The 3D view did not load: ' + e.message); return; }
    const host = d.querySelector('#illMockHost'), r = host.getBoundingClientRect(), ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio || 1)); ren.setSize(r.width, r.height); ren.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(ren.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#ecebe6'); const cam = new THREE.PerspectiveCamera(35, r.width / r.height, .01, 100); cam.position.set(2.2, 1.4, 3.2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8780, 1.6)); const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 2); scene.add(key); const rim = new THREE.DirectionalLight(0xffffff, .8); rim.position.set(-3, 2, -2); scene.add(rim);
    const ctl = new Orbit(cam, ren.domElement); ctl.enableDamping = true; let obj = null, alive = true;
    const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const pic = id => { compose(); const b = DOCX.artboards.find(q => q.id === id); if (b) return boardCanvas({ ...b, bleed: 0 }); const c = canvas(W, H), cx = c.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); cx.drawImage(docC, 0, 0); return c; }; // a graphic's clear background prints on white
    const face = re => { const b = DOCX.artboards.find(q => re.test(q.name)); return b ? boardCanvas({ ...b, bleed: 0 }) : null; };
    function build() {
      if (obj) { scene.remove(obj); obj.traverse(o => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m?.map?.dispose(); m?.dispose(); }); }); }
      const f = new FormData(d.querySelector('form')), kind = f.get('shape'), art = pic(f.get('src')), ar = art.width / art.height; obj = new THREE.Group();
      const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 }), metal = new THREE.MeshStandardMaterial({ color: 0xc9cbcf, metalness: .9, roughness: .3 });
      if (kind === 'can') { const h = 1.6, rad = Math.max(.25, Math.min(.8, h * ar / (2 * Math.PI))); const side = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 96, 1, true), new THREE.MeshStandardMaterial({ map: tex(art), roughness: .35, metalness: .25 }));
        const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * .96, rad, .06, 96), metal); top.position.y = h / 2 + .03; const bot = top.clone(); bot.position.y = -h / 2 - .03; obj.add(side, top, bot); }
      else if (kind === 'bottle') { const pts = [[0, 0], [.42, 0], [.45, .05], [.45, 1.1], [.4, 1.3], [.2, 1.5], [.16, 1.75], [.17, 1.9], [0, 1.9]].map(([a, b]) => new THREE.Vector2(a, b));
        const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), new THREE.MeshPhysicalMaterial({ color: 0x2e5b3a, roughness: .1, transmission: .3, thickness: .3, metalness: 0 })); glass.position.y = -.95;
        const lh = Math.min(.9, 2 * Math.PI * .452 / ar), label = new THREE.Mesh(new THREE.CylinderGeometry(.452, .452, lh, 96, 1, true), new THREE.MeshStandardMaterial({ map: tex(art), roughness: .55 })); label.position.y = -.95 + .55;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .18, 48), metal); cap.position.y = -.95 + 1.95; obj.add(glass, label, cap); }
      else if (kind === 'box') {
        const fr = face(/front/i) || art, bk = face(/back/i), ls = face(/left/i), rs = face(/right/i), tp = face(/top/i), bt = face(/bottom/i);
        const fb = DOCX.artboards.find(b => /front/i.test(b.name)), sb = DOCX.artboards.find(b => /left|right/i.test(b.name));
        const w = 1.2, h = fb ? w * fb.h / fb.w : w / ar, dpt = fb && sb ? w * sb.w / fb.w : .5, m = c => (c ? new THREE.MeshStandardMaterial({ map: tex(c), roughness: .7 }) : paper);
        obj.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), [m(rs), m(ls), m(tp), m(bt), m(fr), m(bk)])); }
      else { const w = 1.1, h = w / ar, g = new THREE.BoxGeometry(w, h, .14, 1, 1, 1); const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), z = pos.getZ(i); pos.setZ(i, z * (1 - Math.pow(Math.abs(y) / (h / 2), 4) * .9)); } g.computeVertexNormals();
        obj.add(new THREE.Mesh(g, [paper, paper, metal, paper, new THREE.MeshStandardMaterial({ map: tex(art), roughness: .4, metalness: .1 }), paper])); }
      scene.add(obj);
    }
    build(); d.querySelector('form').addEventListener('change', build);
    d.querySelector('[data-mockpng]').onclick = () => { ren.render(scene, cam); ren.domElement.toBlob(b => { const u = URL.createObjectURL(b); download(u, `${fileBase()}-mockup.png`); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png'); };
    const loop = () => { if (!alive) return; ctl.update(); ren.render(scene, cam); requestAnimationFrame(loop); }; loop();
    d.addEventListener('close', () => { alive = false; ren.dispose(); }, { once: true });
  }

  // ---- the layer panel: fill kinds, width profile, type on a path, symbol, mask and group state ----
  function fieldsHtml(l) {
    if (!l || fixed(l)) return '';
    const parts = [], i = l.ill || {};
    if (VECTOR_FILL(l)) {
      const f = i.fill || { mode: 'solid' }, st = f.stops || [{ at: 0, color: l.fillColor }, { at: 100, color: '#ffffff' }], mesh = f.mesh || [l.fillColor, '#ffffff', '#ffffff', l.fillColor];
      const col = (k, v) => `<input type="color" data-ill="${k}" value="${v}">`;
      let more = '';
      if (f.mode === 'linear' || f.mode === 'radial') more = `<div class="row">${st.map((s, k) => `<span class="row" style="gap:4px">${col(`fill.stops.${k}.color`, s.color)}<input class="t" type="number" min="0" max="100" data-ill="fill.stops.${k}.at" value="${s.at}" style="width:64px" aria-label="Where, %"></span>`).join('')}<button type="button" class="btn sm q" data-illact="stopadd">+ Colour</button></div>${f.mode === 'linear' ? `<label class="f"><span>Angle</span><input type="range" min="0" max="360" step="1" data-ill="fill.angle" value="${f.angle || 0}"><output>${f.angle || 0}°</output></label>` : ''}`;
      else if (f.mode === 'mesh') more = `<div class="row">${['Top left', 'Top right', 'Bottom left', 'Bottom right'].map((t, k) => `<label class="f"><span>${t}</span>${col(`fill.mesh.${k}`, mesh[k])}</label>`).join('')}<label class="f"><span>Centre</span><input type="checkbox" data-ill="fill.centerOn" ${f.center ? 'checked' : ''}>${col('fill.center', f.center || '#ffffff')}</label></div>`;
      else if (f.mode === 'pattern') more = `<div class="row">${f.src ? `<img src="${f.src}" alt="The tile" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--line)">` : ''}<select class="t" data-illact-sel="tilefrom" style="width:auto"><option value="">Tile from a layer…</option>${LAYERS.filter(x => x !== l && x.visible && x.kind !== 'base').map(x => `<option value="${x.id}">${hx(x.name)}</option>`).join('')}</select></div>
        <label class="f"><span>Tile size</span><input type="range" min="5" max="400" step="1" data-ill="fill.scale" value="${f.scale || 100}"><output>${f.scale || 100}%</output></label>
        <label class="f"><span>Repeat</span><select class="t" data-ill="fill.layout">${[['grid', 'Straight'], ['brick', 'Brick'], ['halfdrop', 'Half-drop'], ['mirror', 'Mirror']].map(([k, t]) => `<option value="${k}" ${(f.layout || 'grid') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="row"><input class="t" data-illgen placeholder="Or describe a pattern: e.g. tiny stars and lightning bolts, two colours" maxlength="300"><button type="button" class="btn sm" data-illact="gen">Draw a tile</button></div>`;
      parts.push(`<div class="sec"><h4>Fill kind</h4><div class="row">${[['solid', 'Solid'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['mesh', 'Mesh'], ['pattern', 'Pattern']].map(([k, t]) => `<button type="button" class="btn sm ${f.mode === k ? '' : 'q'}" data-illmode="${k}">${t}</button>`).join('')}</div>${more}</div>`);
    }
    if (isShape(l)) parts.push(`<div class="sec"><h4>Width along the line</h4><div class="row">${[['uniform', 'Even'], ['taper', 'Taper both ends'], ['end', 'Thin at the end'], ['start', 'Thin at the start'], ['bulge', 'Bulge']].map(([k, t]) => `<button type="button" class="btn sm ${(!i.widths && k === 'uniform') ? '' : 'q'}" data-illwidth="${k}">${t}</button>`).join('')}</div><p class="note">Or drag at a point with the Width tool (⇧W).</p></div>`);
    if (isShape(l) && i.text) { const T = i.text; parts.push(`<div class="sec"><h4>Type on the path</h4><textarea class="t" data-ill="text.text" maxlength="400" aria-label="The words">${hx(T.text)}</textarea><label class="f w"><span>Font</span><select class="t" data-ill="text.font">${fontOpts(T.font)}</select></label>
      <label class="f"><span>Size</span><input type="range" min="6" max="400" step="1" data-ill="text.size" value="${T.size}"><output>${T.size}px</output></label><label class="f"><span>Start</span><input type="range" min="0" max="100" step="1" data-ill="text.offset" value="${T.offset || 0}"><output>${T.offset || 0}%</output></label><label class="f"><span>Spacing</span><input type="range" min="-10" max="80" step="1" data-ill="text.track" value="${T.track || 0}"><output>${T.track || 0}</output></label>
      <div class="row"><label class="f w"><span>Colour</span><input type="color" data-ill="text.color" value="${T.color}"></label><button type="button" class="btn sm ${T.bold ? '' : 'q'}" data-illact="tbold">Bold</button><button type="button" class="btn sm q danger" data-illact="tdel">Take the type off</button></div></div>`); }
    else if (isShape(l)) parts.push(`<div class="sec"><div class="row"><button type="button" class="btn sm q" data-illact="typepath" title="Words that run along this path (⇧T)">Type on this path</button></div></div>`);
    const tags = [];
    if (i.sym) { const s = DOCX.symbols.find(q => q.id === i.sym); tags.push(`Symbol “${hx(s?.name || '?')}”: changes here change every instance <button type="button" class="btn sm q" data-illact="symbreak">Unlink</button>`); }
    if (i.clip) tags.push(`Clipping mask for ${LAYERS.filter(x => x.ill?.clipBy === l.id).length} layer(s) <button type="button" class="btn sm q" data-illact="cliprel">Release (⌥⌘7)</button>`);
    if (i.clipBy) tags.push(`Clipped by a mask <button type="button" class="btn sm q" data-illact="cliprel">Release (⌥⌘7)</button>`);
    if (i.group) tags.push(`In a group of ${LAYERS.filter(x => x.ill?.group === i.group).length} <button type="button" class="btn sm q" data-illact="ungroup">Ungroup (⇧⌘G)</button>`);
    if (i.sw && Object.keys(i.sw).length) tags.push(`Coloured from a swatch: change it under Document → Swatches`);
    if (tags.length) parts.push(`<div class="sec"><h4>Links</h4>${tags.map(t => `<p class="note" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${t}</p>`).join('')}</div>`);
    return parts.join('');
  }
  const setPath = (o, p, v) => { const k = p.split('.'); let a = o; for (let n = 0; n < k.length - 1; n++) { const nk = /^\d+$/.test(k[n + 1]) ? [] : {}; if (a[k[n]] == null) a[k[n]] = nk; a = a[k[n]]; } a[k[k.length - 1]] = v; };
  document.addEventListener('input', e => { const t = e.target.closest?.('#pLayers [data-ill]'); if (!t) return; const l = selected(); if (!l) return; const p = t.dataset.ill;
    let v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? num(t.value) : t.value; if (p === 'fill.centerOn') { const f = ill(l).fill; if (f) { if (v) f.center = f.center || '#ffffff'; else delete f.center; } }
    else if (p === 'fill.center' && !ill(l).fill?.center) return; else setPath(ill(l), p, v);
    const o = t.parentElement?.querySelector('output'); if (o) o.textContent = `${v}${/angle/.test(p) ? '°' : /scale|offset/.test(p) ? '%' : /size/.test(p) ? 'px' : ''}`;
    l._pk = null; l.pv = (l.pv || 0) + 1; draw(); clearTimeout(l._it); l._it = setTimeout(commit, 400); });
  document.addEventListener('click', async e => {
    const b = e.target.closest('#pLayers [data-illmode],#pLayers [data-illwidth],#pLayers [data-illact]'); if (!b) return; const l = selected(); if (!l) return;
    if (b.dataset.illmode) { const m = b.dataset.illmode; const f = ill(l).fill || {}; l.ill.fill = { ...f, mode: m }; if (m !== 'solid') l.fill = true; if ((m === 'linear' || m === 'radial') && !f.stops) l.ill.fill.stops = [{ at: 0, color: l.fillColor }, { at: 100, color: '#ffffff' }]; if (m === 'mesh' && !f.mesh) l.ill.fill.mesh = [l.fillColor, '#ffffff', '#ffffff', l.fillColor]; if (m === 'solid') delete l.ill.fill; }
    else if (b.dataset.illwidth) { widthProfile(l, b.dataset.illwidth); return; }
    else { const a = b.dataset.illact;
      if (a === 'stopadd') { const st = l.ill.fill.stops; if (st.length >= 6) return say('Six colours at most.'); st.splice(st.length - 1, 0, { at: 50, color: CUR }); }
      else if (a === 'typepath') { typeOnPath(l); return; }
      else if (a === 'tbold') l.ill.text.bold = !l.ill.text.bold;
      else if (a === 'tdel') delete l.ill.text;
      else if (a === 'symbreak') { symbolBreak(l); return; }
      else if (a === 'cliprel') { clipRelease(); return; }
      else if (a === 'ungroup') { ungroup(); return; }
      else if (a === 'gen') { const p = b.parentElement.querySelector('[data-illgen]')?.value.trim(); if (!p || p.length < 3) return say('Describe the pattern first.'); b.disabled = true; busy('Drawing a tile…');
        try { const r = await api(AI_URL(), { body: { mode: 'art', prompt: `A seamless, tileable repeating surface pattern: ${p}. Flat colours, edge to edge, so it repeats without a seam. No text.` } }); const src = await small(r.image, 512); ill(l).fill = { ...(l.ill.fill || {}), mode: 'pattern', src, scale: l.ill.fill?.scale || 50 }; l.fill = true; if (r.left != null && D.ai) D.ai.left = r.left; say('The tile is drawn and fills the shape. It is in the graphics library too.'); }
        catch (x) { say(x.message); } finally { busy(); b.disabled = false; } }
    }
    l._pk = null; l.pv = (l.pv || 0) + 1; commit(); paintPanels(); draw();
  });
  document.addEventListener('change', async e => { const t = e.target.closest?.('#pLayers [data-illact-sel="tilefrom"]'); if (!t || !t.value) return; const l = selected(), s = layerOf(t.value); if (!l || !s) return;
    const c = processed(s), k = Math.min(1, 512 / Math.max(c.width, c.height)), cv = canvas(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k))); cv.getContext('2d').drawImage(c, 0, 0, cv.width, cv.height);
    ill(l).fill = { ...(l.ill.fill || {}), mode: 'pattern', src: cv.toDataURL('image/png'), scale: l.ill.fill?.scale || 100 }; l.fill = true; l._pk = null; commit(); paintPanels(); draw(); });
  const small = (src, max) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = canvas(Math.round(im.width * k), Math.round(im.height * k)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); }; im.onerror = () => rej(new Error('The tile could not be read')); im.src = src; });

  // ---- SVG out: gradients as SVG gradients, clipping masks as clip paths ----
  const xa = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function svgGrad(l) {
    const f = l.ill?.fill; if (!f || !(f.mode === 'linear' || f.mode === 'radial')) return null; const gid = 'g_' + l.id;
    const st = (f.stops || []).slice().sort((a, b) => a.at - b.at).map(s => `<stop offset="${s.at}%" stop-color="${xa(s.color)}"/>`).join('');
    const a = (f.angle || 0) * Math.PI / 180;
    const def = f.mode === 'linear' ? `<linearGradient id="${gid}" x1="${(50 - Math.cos(a) * 50).toFixed(1)}%" y1="${(50 - Math.sin(a) * 50).toFixed(1)}%" x2="${(50 + Math.cos(a) * 50).toFixed(1)}%" y2="${(50 + Math.sin(a) * 50).toFixed(1)}%">${st}</linearGradient>` : `<radialGradient id="${gid}">${st}</radialGradient>`;
    return { defs: `<defs>${def}</defs>`, ref: `url(#${gid})` };
  }
  const rasterOnly = l => Boolean(l.ill?.widths || l.ill?.text || (l.ill?.fill && ['mesh', 'pattern'].includes(l.ill.fill.mode)));
  function svgDefs() {
    return LAYERS.filter(m => m.ill?.clip && isShape(m)).map(m => { const d = VEC.pathsOf(m).map(p => { const pts = VEC.flat({ ...p, closed: true }, .5).map(([a, b]) => VEC.toDoc(m, a, b)); return 'M' + pts.map(q => q.map(v => v.toFixed(2)).join(' ')).join('L') + 'Z'; }).join(''); return `<clipPath id="clip_${m.id}"><path d="${d}" clip-rule="evenodd"/></clipPath>`; }).join('');
  }
  const svgWrap = (l, s) => (maskOf(l) ? `<g clip-path="url(#clip_${l.ill.clipBy})">${s}</g>` : s);
  const isMask = l => Boolean(l.ill?.clip && isShape(l));

  // ---- the design's own data ----
  function load(doc) {
    const d = doc && typeof doc === 'object' ? doc : {};
    DOCX.artboards = Array.isArray(d.artboards) ? d.artboards.filter(b => b && Number.isFinite(b.x) && Number.isFinite(b.w)).map(b => ({ id: String(b.id || id8()), name: String(b.name || 'Artboard'), x: +b.x, y: +b.y, w: +b.w, h: +b.h, bleed: +b.bleed || 0 })) : [];
    DOCX.symbols = Array.isArray(d.symbols) ? d.symbols.map(s => ({ id: String(s.id), name: String(s.name || 'Symbol') })) : [];
    DOCX.swatches = Array.isArray(d.swatches) ? d.swatches.filter(s => /^#[0-9a-f]{6}$/i.test(s?.hex)).map(s => ({ id: String(s.id), name: String(s.name || ''), hex: s.hex, pantone: String(s.pantone || '') })) : [];
    SB = null; MEASURE = null; draw();
  }
  const docData = () => ({ artboards: DOCX.artboards, symbols: DOCX.symbols, swatches: DOCX.swatches });

  // ---- the tools on the rail, and in ⌘K ----
  const ICON = { artboard: '<rect x="5" y="5" width="14" height="14"/><path d="M3 5h2M19 5h2M3 19h2M19 19h2M5 3v2M5 19v2M19 3v2M19 19v2"/>', shapebuilder: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/><path d="M12 8.5v7"/>', width: '<path d="M4 16c4-8 12-8 16 0"/><path d="M8 12l-1-3M16 12l1-3M12 10V6"/>', measure: '<path d="M4 18L18 4M6 20l14-14"/><path d="M8 14l2 2M11 11l2 2M14 8l2 2"/>', typepath: '<path d="M4 18c4-10 12-10 16 0"/><path d="M9 7h6M12 7v6"/>' };
  const TITLES = { artboard: 'Artboard (⇧O): draw a face of the pack; drag a board to move it, its green corner to size it', shapebuilder: 'Shape builder (⇧M): drag across regions of the chosen shapes to merge them; Alt-click one to take it away', width: 'Width (⇧W): drag at a point of a path to make the line thicker or thinner there', measure: 'Measure (⇧U): drag between two points for the distance and the angle', typepath: 'Type on a path (⇧T): click a path or an ellipse' };
  function rail() {
    const after = document.querySelector('.rail [data-tool="node"]'); if (!after || document.querySelector('.rail [data-tool="artboard"]')) return;
    after.insertAdjacentHTML('afterend', Object.keys(ICON).map(k => `<button type="button" class="pro-only" data-tool="${k}" title="${TITLES[k]}" aria-label="${TITLES[k].split(' (')[0]}"><svg viewBox="0 0 24 24">${ICON[k]}</svg></button>`).join(''));
    const e = document.querySelector('.rail [data-tool="ellipse"]'), li = document.querySelector('.rail [data-tool="line"]'); if (e) e.title = 'Ellipse (L)'; if (li) li.title = 'Line (\\)';
    const top = document.querySelector('#impBtn'); if (top && !document.querySelector('#illDocBtn')) top.insertAdjacentHTML('beforebegin', '<button class="fold btn sm pic-only pro-only" id="illDocBtn" type="button" title="Artboards, swatches, symbols, preflight, package for the vendor, 3D mockup">Document</button>');
    for (const t of Object.keys(ICON)) document.querySelector(`.rail [data-tool="${t}"]`)?.addEventListener('click', () => setTool(t));
    document.querySelector('#illDocBtn')?.addEventListener('click', () => docOpen());
    const css = document.createElement('style'); css.textContent = `.illdlg{border:0;border-radius:20px;padding:0;width:min(860px,96vw);max-height:92vh;overflow:auto}.illbox{padding:18px;display:grid;gap:12px}.illgrid{display:grid;gap:10px}.illgrid label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .illlist{display:grid;gap:8px}.illrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px;border:1px solid var(--line,rgba(20,20,22,.14));border-radius:12px}.illrow.on{border-color:#1c7a4a}.illrow input.t[type=number]{width:84px}.illrow input.t:not([type]){width:180px}.illrow input[type=color]{width:44px;height:34px;padding:0;border:1px solid var(--line,rgba(20,20,22,.14));border-radius:8px}
      .illbox2{border:1px solid var(--line,rgba(20,20,22,.14));border-radius:14px;padding:10px 12px;display:grid;gap:8px}.illbox2 legend{font-weight:600;padding:0 6px}.illdoc{display:grid;gap:12px}
      .sev{font:600 10px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:3px 8px}.sev.bad{background:#fbe9e6;color:#9a2419}.sev.warn{background:#fff3d6;color:#8a5a00}.sev.info{background:#ecebe6;color:#4a4a50}`;
    document.head.appendChild(css);
  }
  rail();
  if (window.PRO) {
    PRO.extra.push(() => [
      { label: 'Artboard tool', keys: '⇧O', kind: 'Tool', run: () => setTool('artboard') }, { label: 'Shape builder', keys: '⇧M', kind: 'Tool', run: () => setTool('shapebuilder') },
      { label: 'Width tool', keys: '⇧W', kind: 'Tool', run: () => setTool('width') }, { label: 'Measure', keys: '⇧U', kind: 'Tool', run: () => setTool('measure') }, { label: 'Type on a path', keys: '⇧T', kind: 'Tool', run: () => setTool('typepath') },
      { label: 'Reflect…', keys: 'O', kind: 'Transform', run: dlgReflect }, { label: 'Scale…', keys: 'S', kind: 'Transform', run: dlgScale },
      { label: 'Divide: cut overlapping shapes into pieces', kind: 'Shape', run: divide },
      { label: 'Make a clipping mask', keys: '⌘7', kind: 'Arrange', run: clipMake }, { label: 'Release the clipping mask', keys: '⌥⌘7', kind: 'Arrange', run: clipRelease },
      { label: 'Group', keys: '⌘G', kind: 'Arrange', run: group }, { label: 'Ungroup', keys: '⇧⌘G', kind: 'Arrange', run: ungroup },
      { label: 'Outline mode', keys: '⌘Y', kind: 'View', run: () => outline(!OUTLINE) }, { label: 'Info: where the pointer is, the size of what is chosen', keys: '⌘U', kind: 'View', run: () => { INFO = !INFO; infoPaint(); draw(); } },
      { label: 'Make a symbol from the chosen layer', kind: 'Symbol', run: symbolMake },
      { label: 'Artboards', kind: 'Document', run: () => docOpen('artboards') }, { label: 'Swatches and Pantone C', kind: 'Document', run: () => docOpen('swatches') }, { label: 'Symbols', kind: 'Document', run: () => docOpen('symbols') },
      { label: 'Preflight', kind: 'Document', run: () => docOpen('preflight') }, { label: 'Package for the vendor', kind: 'Document', run: () => { docOpen('export'); } }, { label: '3D mockup', kind: 'Document', run: mockup }
    ]);
    PRO.keys.push(['Artboard', '⇧O'], ['Shape builder', '⇧M'], ['Width', '⇧W'], ['Measure', '⇧U'], ['Type on a path', '⇧T'], ['Reflect', 'O'], ['Scale', 'S'], ['Clipping mask', '⌘7 · ⌥⌘7'], ['Group', '⌘G · ⇧⌘G'], ['Outline mode', '⌘Y'], ['Info', '⌘U']);
    // Divide joins union, subtract, intersect and exclude in the bar above the picture when shapes are chosen
    const o1 = PRO.opts; PRO.opts = o => { o1(o); const ar = o.querySelector('.proar'); if (ar && shapesChosen().length > 1 && !ar.querySelector('[data-illdivide]')) { ar.insertAdjacentHTML('beforeend', '<button type="button" class="btn sm q" data-illdivide title="Cut them into every piece they make where they overlap">Divide</button><button type="button" class="btn sm q" data-illsb title="Shape builder (⇧M)">Shape builder</button>'); } };
    document.addEventListener('click', e => { if (e.target.closest('[data-illdivide]')) divide(); if (e.target.closest('[data-illsb]')) setTool('shapebuilder'); });
  }
  // leaving the shape builder drops its pieces; the cursor for the new tools
  const setTool0 = window.setTool; window.setTool = t => { if (t !== 'shapebuilder') SB = null; setTool0(t); if (t === 'shapebuilder') sbStart(); if (['artboard', 'measure', 'width', 'shapebuilder', 'typepath'].includes(t)) view.style.cursor = 'crosshair'; draw(); };
  // the symbols follow on every change
  const commit0 = window.commit; window.commit = () => { propagate(); commit0(); };

  window.ILL = { content, drawAll, overlay, down, move, end, key, fieldsHtml, svgGrad, rasterOnly, svgDefs, svgWrap, isMask, load, docData, docOpen, divide, reflect, scaleBy, clipMake, clipRelease, group, ungroup, preflight, fixStray, zip, crc32, regions, boardsFor, widthProfile, typeOnPath, swatchAdd, swatchSet, swatchApply, symbolMake, symbolPlace, outline, get unit() { return UNIT; }, DOCX };
  if (D?.doc) load(D.doc);
})();
