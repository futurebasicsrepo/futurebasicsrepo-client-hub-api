// Studio, drawing with paths (served as /lab/studio-vec.js, loaded after the Studio's script and /lab/studio-pro.js, whose state it shares).
//   - the pen (P): click for a sharp point, drag for a curve, click the first point to close the shape, Enter or Esc to leave it open
//   - edit points (A): drag a point or its handles (Alt breaks a smooth point's handles apart), Alt-click a point to make it sharp or smooth,
//     click the line to add a point, Delete takes the chosen point away
//   - a rectangle, ellipse or line turns into a path; two or more shapes combine: union, subtract, intersect, exclude (polygon-clipping, MIT)
//   - paths go out to Illustrator as <path> and come back from it as paths
// A path is a shape layer with shape 'path' and paths: [{ closed, nodes: [[x, y, inX, inY, outX, outY], …] }], in the layer's own coordinates
// round its centre (before its size, turn and flip), filled even-odd. w and h are the box round it.
(function () {
  let PV = 0, DRAW = null, NSEL = null;
  const isPath = l => l && l.kind === 'shape' && l.shape === 'path';
  const cp = paths => paths.map(p => ({ closed: Boolean(p.closed), nodes: p.nodes.map(n => [...n]) }));
  const touchL = l => { l.pv = ++PV; };

  // ---- the layer's own coordinates ↔ the picture's ----
  function toDoc(l, a, b) { const c = Math.cos(l.rot), s = Math.sin(l.rot), f = l.flip ? -1 : 1; a *= l.scale * f; b *= l.scale; return [l.x + a * c - b * s, l.y + a * s + b * c]; }
  function toLoc(l, x, y) { const c = Math.cos(-l.rot), s = Math.sin(-l.rot), dx = x - l.x, dy = y - l.y; let a = (dx * c - dy * s) / l.scale; const b = (dx * s + dy * c) / l.scale; if (l.flip) a = -a; return [a, b]; }

  // ---- the path itself ----
  const straight = (p, q) => p[4] === p[0] && p[5] === p[1] && q[2] === q[0] && q[3] === q[1];
  const r2 = v => +v.toFixed(2);
  function dOf(paths) {
    let d = '';
    for (const p of paths) {
      const n = p.nodes; if (!n.length) continue; d += `M${r2(n[0][0])} ${r2(n[0][1])}`;
      const seg = (a, b) => { d += straight(a, b) ? `L${r2(b[0])} ${r2(b[1])}` : `C${r2(a[4])} ${r2(a[5])} ${r2(b[2])} ${r2(b[3])} ${r2(b[0])} ${r2(b[1])}`; };
      for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
      if (p.closed && n.length > 1) { seg(n[n.length - 1], n[0]); d += 'Z'; }
    }
    return d;
  }
  const bez = (a, b, t) => { const u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t; return [A * a[0] + B * a[4] + C * b[2] + D * b[0], A * a[1] + B * a[5] + C * b[3] + D * b[1]]; };
  // the points along a sub-path, close enough to the curve for clipping and for the box round it
  function flat(p, tol = 1) {
    const n = p.nodes, out = n.length ? [[n[0][0], n[0][1]]] : [];
    const seg = (a, b) => { if (straight(a, b)) { out.push([b[0], b[1]]); return; } const len = Math.hypot(a[4] - a[0], a[5] - a[1]) + Math.hypot(b[2] - a[4], b[3] - a[5]) + Math.hypot(b[0] - b[2], b[1] - b[3]), k = Math.max(4, Math.min(64, Math.ceil(len / (4 * tol)))); for (let i = 1; i <= k; i++) out.push(bez(a, b, i / k)); };
    for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
    if (p.closed && n.length > 1) { seg(n[n.length - 1], n[0]); out.pop(); }
    return out;
  }
  // the box round the path, made the layer's centre: the layer stays where it is on the picture
  function normalize(l) {
    const pts = l.paths.flatMap(p => flat(p)); if (!pts.length) { l.w = l.h = 1; touchL(l); return l; }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (Math.abs(cx) > .01 || Math.abs(cy) > .01) { const [nx, ny] = toDoc(l, cx, cy); l.paths = l.paths.map(p => ({ closed: p.closed, nodes: p.nodes.map(n => [n[0] - cx, n[1] - cy, n[2] - cx, n[3] - cy, n[4] - cx, n[5] - cy]) })); l.x = nx; l.y = ny; }
    l.w = Math.max(1, x1 - x0); l.h = Math.max(1, y1 - y0); touchL(l); return l;
  }
  // drawn for the picture (the Studio's contentOf asks for this)
  function content(l) {
    const sw = l.stroke ? l.strokeW : 0, pad = Math.ceil(sw / 2 + 2), c = canvas(Math.ceil(l.w) + pad * 2, Math.ceil(l.h) + pad * 2), x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); const p = new Path2D(dOf(l.paths || []));
    x.lineJoin = 'round'; x.lineCap = 'round';
    if (l.fill) { x.fillStyle = l.fillColor; x.fill(p, 'evenodd'); }
    if (sw) { x.lineWidth = sw; x.strokeStyle = l.strokeColor; x.stroke(p); }
    return c;
  }
  const svg = (l, fill, sk) => `<path d="${dOf(l.paths || [])}" fill-rule="evenodd" fill="${l.fill ? xa(fill) : 'none'}"${l.stroke ? ` stroke="${xa(sk)}" stroke-width="${l.strokeW}" stroke-linejoin="round" stroke-linecap="round"` : ''}/>`;

  // ---- a path back from Illustrator: M L H V C S Q T Z, absolute or relative (an arc is left as a picture) ----
  function parseD(d) {
    const tk = String(d || '').match(/[MmLlHhVvCcSsQqTtZzAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g); if (!tk) return null;
    const paths = []; let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, cur = null, lastC = null, lastQ = null;
    const num = () => Number(tk[i++]), isNum = () => i < tk.length && !/[A-Za-z]/.test(tk[i]);
    const node = (x, y) => [x, y, x, y, x, y];
    while (i < tk.length) {
      if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++]; else if (!cmd) return null;
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
      if (C === 'A') return null;
      if (C === 'Z') { if (cur) { const n = cur.nodes; if (n.length > 1 && Math.hypot(n[0][0] - n[n.length - 1][0], n[0][1] - n[n.length - 1][1]) < 1e-6) { n[0][2] = n[n.length - 1][2]; n[0][3] = n[n.length - 1][3]; n.pop(); } cur.closed = true; cx = sx; cy = sy; cur = null; } lastC = lastQ = null; continue; }
      if (!isNum()) return null;
      if (C === 'M') { const x = num() + ox, y = num() + oy; cur = { closed: false, nodes: [node(x, y)] }; paths.push(cur); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
      if (!cur) { cur = { closed: false, nodes: [node(cx, cy)] }; paths.push(cur); sx = cx; sy = cy; }
      const last = cur.nodes[cur.nodes.length - 1];
      if (C === 'L' || C === 'H' || C === 'V') { const x = C === 'V' ? cx : num() + (C === 'H' ? ox : ox), y = C === 'H' ? cy : C === 'V' ? num() + oy : num() + oy; cur.nodes.push(node(x, y)); cx = x; cy = y; lastC = lastQ = null; continue; }
      if (C === 'C' || C === 'S') {
        let x1, y1; if (C === 'C') { x1 = num() + ox; y1 = num() + oy; } else { x1 = lastC ? 2 * cx - lastC[0] : cx; y1 = lastC ? 2 * cy - lastC[1] : cy; }
        const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy; last[4] = x1; last[5] = y1; cur.nodes.push([x, y, x2, y2, x, y]); cx = x; cy = y; lastC = [x2, y2]; lastQ = null; continue;
      }
      if (C === 'Q' || C === 'T') {
        let qx, qy; if (C === 'Q') { qx = num() + ox; qy = num() + oy; } else { qx = lastQ ? 2 * cx - lastQ[0] : cx; qy = lastQ ? 2 * cy - lastQ[1] : cy; }
        const x = num() + ox, y = num() + oy; last[4] = cx + 2 / 3 * (qx - cx); last[5] = cy + 2 / 3 * (qy - cy); cur.nodes.push([x, y, x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y]); cx = x; cy = y; lastQ = [qx, qy]; lastC = null; continue;
      }
      return null;
    }
    const ok = paths.filter(p => p.nodes.length > 1);
    return ok.length && ok.every(p => p.nodes.every(n => n.every(Number.isFinite))) ? ok : null;
  }
  function fromSvg(el, old, attr) {
    const paths = parseD(el.getAttribute('d')); if (!paths) return null;
    const l = old && old.kind === 'shape' ? copyL(old) : fresh('shape', {}); l.shape = 'path'; l.paths = paths; l.radius = 0;
    const fill = attr(el, 'fill'), sk = attr(el, 'stroke'); l.fill = fill !== 'none'; if (l.fill) l.fillColor = fill && /^#|^rgb/i.test(fill) ? fill : '#141416';
    if (sk && sk !== 'none') { l.stroke = true; l.strokeColor = sk; l.strokeW = parseFloat(attr(el, 'stroke-width')) || 1; } else l.stroke = false;
    l.tint = { ...l.tint, amount: 0 }; l.w = l.w || 1; l.h = l.h || 1; touchL(l); return l;
  }

  // ---- a rectangle, ellipse or line as a path ----
  const K = 0.5522847498;
  function pathsOf(l) {
    if (isPath(l)) return l.paths;
    const w = l.w / 2, h = (l.shape === 'line' ? 0 : l.h / 2);
    if (l.shape === 'line') return [{ closed: false, nodes: [[-w, 0, -w, 0, -w, 0], [w, 0, w, 0, w, 0]] }];
    if (l.shape === 'ellipse') return [{ closed: true, nodes: [[0, -h, -w * K, -h, w * K, -h], [w, 0, w, -h * K, w, h * K], [0, h, w * K, h, -w * K, h], [-w, 0, -w, h * K, -w, -h * K]] }];
    const r = Math.min(l.radius || 0, w, h);
    if (r < .5) return [{ closed: true, nodes: [[-w, -h, -w, -h, -w, -h], [w, -h, w, -h, w, -h], [w, h, w, h, w, h], [-w, h, -w, h, -w, h]] }];
    const k = r * K, n = [];
    n.push([-w + r, -h, -w + r - k, -h, -w + r, -h], [w - r, -h, w - r, -h, w - r + k, -h], [w, -h + r, w, -h + r - k, w, -h + r], [w, h - r, w, h - r, w, h - r + k],
      [w - r, h, w - r + k, h, w - r, h], [-w + r, h, -w + r, h, -w + r - k, h], [-w, h - r, -w, h - r + k, -w, h - r], [-w, -h + r, -w, -h + r, -w, -h + r - k]);
    return [{ closed: true, nodes: n }];
  }
  function toPath(l) {
    if (!l || l.kind !== 'shape' || isPath(l)) return;
    if (l.shape === 'line') { if (!l.stroke) l.strokeColor = l.fillColor; l.fill = false; l.stroke = true; }
    l.paths = cp(pathsOf(l)); l.shape = 'path'; l.name = /^(Rectangle|Ellipse|Line)$/.test(l.name) ? 'Path' : l.name; normalize(l);
    commit(); paintPanels(); draw(); toast('It is a path now: edit its points with A.');
  }

  // ---- combining shapes ----
  const shapes = () => (window.PRO ? PRO.chosen() : []).filter(l => l.kind === 'shape' && l.shape !== 'line' && !l.locked).sort((a, b) => LAYERS.indexOf(a) - LAYERS.indexOf(b));
  function geom(l) {
    const rings = cp(pathsOf(l)).map(p => flat({ ...p, closed: true }, .5).map(([a, b]) => toDoc(l, a, b))).filter(r => r.length > 2);
    let g = null; for (const r of rings) g = g ? polygonClipping.xor(g, [r]) : [[r]]; return g || [];
  }
  function simplify(pts, tol) { // Ramer–Douglas–Peucker
    if (pts.length < 4) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
    while (st.length) { const [a, b] = st.pop(); let m = -1, md = tol; const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; m = i; } }
      if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); } }
    return pts.filter((_, i) => keep[i]);
  }
  const BOOL = { union: ['Union', 'Join them into one shape'], subtract: ['Subtract', 'Cut the ones on top out of the bottom one'], intersect: ['Intersect', 'Keep only where they overlap'], exclude: ['Exclude', 'Keep where they do not overlap'] };
  function combine(op) {
    if (typeof polygonClipping === 'undefined') { toast('The shape tools did not load. Reload the page.'); return; }
    const ls = shapes(); if (ls.length < 2) { toast('Choose two shapes or more (Shift-click) to combine them.'); return; }
    const gs = ls.map(geom), f = { union: polygonClipping.union, subtract: polygonClipping.difference, intersect: polygonClipping.intersection, exclude: polygonClipping.xor }[op];
    let res; try { res = f(gs[0], ...gs.slice(1)); } catch (e) { toast('Those shapes could not be combined: ' + e.message); return; }
    const tol = .35, paths = res.flatMap(poly => poly.map(ring => { const r = ring.slice(0, -1); return { closed: true, nodes: simplify(r, tol).map(([x, y]) => [x, y, x, y, x, y]) }; })).filter(p => p.nodes.length > 2);
    if (!paths.length) { toast(op === 'intersect' ? 'They do not overlap, so nothing is left.' : 'Nothing is left of them.'); return; }
    const b = ls[0], l = fresh('shape', { name: BOOL[op][0], shape: 'path', paths, w: 1, h: 1, radius: 0, fill: true, fillColor: b.fill ? b.fillColor : b.strokeColor, stroke: b.stroke, strokeW: b.strokeW, strokeColor: b.strokeColor, x: 0, y: 0 });
    l.opacity = b.opacity; l.blend = b.blend; normalize(l);
    const at = LAYERS.indexOf(b), ids = new Set(ls.map(q => q.id)); LAYERS = LAYERS.filter(q => !ids.has(q.id)); LAYERS.splice(Math.min(at, LAYERS.length), 0, l);
    PRO.SELS.clear(); SEL = l.id; commit(); paintPanels(); draw(); toast(`${BASE_N(ls.length)} shapes made one: ${BOOL[op][0].toLowerCase()}.`);
  }
  const BASE_N = n => ['', 'One', 'Two', 'Three', 'Four', 'Five'][n] || String(n);

  // ---- the pen ----
  const near = (ax, ay, bx, by, r = 8) => Math.hypot((ax - bx) * Z, (ay - by) * Z) < r;
  function penApply() {
    const l = DRAW.l; l.x = 0; l.y = 0; l.scale = 1; l.rot = 0; l.flip = false;
    l.paths = [{ closed: DRAW.closed, nodes: DRAW.doc.map(n => [...n]) }]; normalize(l);
  }
  function penFinish() {
    if (!DRAW) return; const d = DRAW; DRAW = null;
    if (d.doc.length < 2) { LAYERS = LAYERS.filter(q => q !== d.l); SEL = null; paintPanels(); draw(); return; }
    commit(); paintPanels(); draw();
  }
  function snapAngle(x0, y0, x, y) { const a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(x - x0, y - y0); return [x0 + Math.cos(a) * r, y0 + Math.sin(a) * r]; }

  // ---- the pointer (the Studio asks first; true = handled here) ----
  function down(e, x, y) {
    if (TOOL === 'pen') {
      if (!DRAW) {
        const sw = Math.max(2, Math.round(W / 300)), l = addLayer(fresh('shape', { name: 'Path', shape: 'path', paths: [{ closed: false, nodes: [[0, 0, 0, 0, 0, 0]] }], w: 1, h: 1, radius: 0, fill: false, fillColor: CUR, stroke: true, strokeW: sw, strokeColor: CUR, x, y }), { silent: true });
        DRAW = { l, doc: [[x, y, x, y, x, y]], closed: false };
      } else {
        const f = DRAW.doc[0], last = DRAW.doc[DRAW.doc.length - 1];
        if (DRAW.doc.length > 1 && near(f[0], f[1], x, y)) { DRAW.closed = true; DRAW.l.fill = true; penApply(); DRAG = { mode: 'penh', i: 0, close: true, x0: x, y0: y, pid: e.pointerId, type: e.pointerType }; return true; }
        if (e.shiftKey) [x, y] = snapAngle(last[0], last[1], x, y);
        DRAW.doc.push([x, y, x, y, x, y]);
      }
      penApply(); DRAG = { mode: 'penh', i: DRAW.doc.length - 1, x0: x, y0: y, pid: e.pointerId, type: e.pointerType }; draw(); return true;
    }
    if (TOOL !== 'node') return false;
    const l = selected();
    if (isPath(l) && !l.locked) {
      const nd = l.paths.map(p => p.nodes.map(n => [toDoc(l, n[0], n[1]), toDoc(l, n[2], n[3]), toDoc(l, n[4], n[5])]));
      // a handle of the chosen point, or its neighbours, first
      if (NSEL && nd[NSEL.s]?.[NSEL.i]) for (const j of [NSEL.i, NSEL.i - 1, NSEL.i + 1]) { const q = nd[NSEL.s][(j + nd[NSEL.s].length) % nd[NSEL.s].length]; if (!q) continue;
        for (const [w, k] of [['in', 1], ['out', 2]]) if (!near(q[k][0], q[k][1], q[0][0], q[0][1], 1) && near(q[k][0], q[k][1], x, y, 7)) { const jj = (j + nd[NSEL.s].length) % nd[NSEL.s].length; NSEL = { s: NSEL.s, i: jj }; DRAG = { mode: 'nhandle', l, s: NSEL.s, i: jj, w, alt: e.altKey, pid: e.pointerId, type: e.pointerType }; return true; } }
      for (let s = 0; s < nd.length; s++) for (let i = 0; i < nd[s].length; i++) if (near(nd[s][i][0][0], nd[s][i][0][1], x, y, 7)) {
        NSEL = { s, i };
        if (e.altKey) { smooth(l, s, i); commit(); draw(); return true; }
        DRAG = { mode: 'nnode', l, s, i, start: nd[s][i], x0: x, y0: y, pid: e.pointerId, type: e.pointerType }; draw(); paintPanels(); return true;
      }
      // the line between two points: a new point there
      const hitSeg = segAt(l, x, y); if (hitSeg) { insert(l, hitSeg.s, hitSeg.i, hitSeg.t); NSEL = { s: hitSeg.s, i: hitSeg.i + 1 }; commit(); paintPanels(); draw(); return true; }
    }
    const h = hit(x, y); NSEL = null; SEL = h && !fixed(h) ? h.id : null; if (window.PRO) PRO.SELS.clear(); paintPanels(); draw();
    if (h && !isPath(h) && h.kind === 'shape') toast('Edit points works on a path: Turn into a path is in its Shape settings.');
    return true;
  }
  function segAt(l, x, y) {
    let best = null;
    l.paths.forEach((p, s) => { const n = p.nodes, m = p.closed ? n.length : n.length - 1;
      for (let i = 0; i < m; i++) { const a = n[i], b = n[(i + 1) % n.length]; for (let k = 0; k <= 24; k++) { const t = k / 24, [u, v] = bez(a, b, t), [dx, dy] = toDoc(l, u, v), d = Math.hypot((dx - x) * Z, (dy - y) * Z); if (d < 6 && (!best || d < best.d)) best = { s, i, t, d }; } } });
    return best && best.t > .02 && best.t < .98 ? best : null;
  }
  function insert(l, s, i, t) { // de Casteljau: the curve split at t, its shape kept
    const P = cp(l.paths), n = P[s].nodes, a = n[i], b = n[(i + 1) % n.length], L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p0 = [a[0], a[1]], p1 = [a[4], a[5]], p2 = [b[2], b[3]], p3 = [b[0], b[1]], q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3), r0 = L(q0, q1), r1 = L(q1, q2), m = L(r0, r1);
    a[4] = q0[0]; a[5] = q0[1]; b[2] = q2[0]; b[3] = q2[1]; n.splice(i + 1, 0, [m[0], m[1], r0[0], r0[1], r1[0], r1[1]]); l.paths = P; normalize(l);
  }
  // a sharp point gets handles along the line through its neighbours; a smooth one loses them
  function smooth(l, s, i, want) {
    const P = cp(l.paths), n = P[s].nodes, q = n[i], sharp = q[2] === q[0] && q[3] === q[1] && q[4] === q[0] && q[5] === q[1];
    if (want === false || (want == null && !sharp)) { q[2] = q[4] = q[0]; q[3] = q[5] = q[1]; }
    else { const a = n[(i - 1 + n.length) % n.length], b = n[(i + 1) % n.length]; if (!P[s].closed && (i === 0 || i === n.length - 1)) { const o = i === 0 ? b : a, dx = (o[0] - q[0]) / 3, dy = (o[1] - q[1]) / 3; if (i === 0) { q[4] = q[0] + dx; q[5] = q[1] + dy; } else { q[2] = q[0] + dx; q[3] = q[1] + dy; } }
      else { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, la = Math.hypot(q[0] - a[0], q[1] - a[1]) / 3, lb = Math.hypot(b[0] - q[0], b[1] - q[1]) / 3; q[2] = q[0] - dx / L * la; q[3] = q[1] - dy / L * la; q[4] = q[0] + dx / L * lb; q[5] = q[1] + dy / L * lb; } }
    l.paths = P; normalize(l);
  }
  function move(g, x, y, e) {
    if (g.mode === 'penh') {
      const n = DRAW?.doc[g.i]; if (!n) return true;
      if (Math.hypot((x - g.x0) * Z, (y - g.y0) * Z) > 3) { if (e.shiftKey) [x, y] = snapAngle(n[0], n[1], x, y); n[4] = x; n[5] = y; n[2] = 2 * n[0] - x; n[3] = 2 * n[1] - y; if (g.close) { n[2] = 2 * n[0] - x; n[3] = 2 * n[1] - y; n[4] = x; n[5] = y; } penApply(); }
      draw(); return true;
    }
    if (g.mode === 'nnode') {
      const l = g.l, [sx0, sy0] = g.start[0], dx = x - g.x0, dy = y - g.y0, P = cp(l.paths), loc = q => toLoc(l, q[0] + dx, q[1] + dy);
      const [a, b] = loc(g.start[0]), [c, d] = loc(g.start[1]), [f, h] = loc(g.start[2]); P[g.s].nodes[g.i] = [a, b, c, d, f, h]; l.paths = P; normalize(l); g.moved = true; void sx0; void sy0; draw(); paintFields(); return true;
    }
    if (g.mode === 'nhandle') {
      const l = g.l, P = cp(l.paths), q = P[g.s].nodes[g.i], [u, v] = toLoc(l, x, y), k = g.w === 'in' ? 2 : 4, o = g.w === 'in' ? 4 : 2;
      const wasSmooth = !(q[o] === q[0] && q[o + 1] === q[1]) && Math.abs(Math.atan2(q[k + 1] - q[1], q[k] - q[0]) - Math.atan2(q[1] - q[o + 1], q[0] - q[o])) % (2 * Math.PI) < .05;
      q[k] = u; q[k + 1] = v;
      if (!g.alt && !e.altKey && (wasSmooth || g.keep)) { g.keep = true; const L = Math.hypot(q[o] - q[0], q[o + 1] - q[1]), dx = q[0] - u, dy = q[1] - v, M = Math.hypot(dx, dy) || 1; q[o] = q[0] + dx / M * L; q[o + 1] = q[1] + dy / M * L; }
      l.paths = P; normalize(l); g.moved = true; draw(); return true;
    }
    return false;
  }
  function end(g) {
    if (g.mode === 'penh') { if (g.close) penFinish(); draw(); return true; }
    if (g.mode === 'nnode' || g.mode === 'nhandle') { if (g.moved) commit(); paintPanels(); draw(); return true; }
    return false;
  }
  function hover() { if (TOOL === 'pen' && DRAW) draw(); }

  // ---- drawn over the picture: the path being drawn, the points and their handles ----
  function overlay(x) {
    const l = DRAW ? DRAW.l : TOOL === 'node' || TOOL === 'pen' ? selected() : null; if (!isPath(l) || !LAYERS.includes(l)) return;
    x.save(); x.lineWidth = 1; x.strokeStyle = '#12b864';
    x.save(); x.translate(sx(l.x), sy(l.y)); x.rotate(l.rot); x.scale(l.scale * (l.flip ? -1 : 1) * Z, l.scale * Z); x.lineWidth = 1.2 / (l.scale * Z); x.stroke(new Path2D(dOf(l.paths))); x.restore();
    const S = (a, b) => { const [u, v] = toDoc(l, a, b); return [sx(u), sy(v)]; };
    l.paths.forEach((p, s) => p.nodes.forEach((n, i) => {
      const [px, py] = S(n[0], n[1]), on = NSEL && NSEL.s === s && NSEL.i === i, showH = TOOL === 'node' && NSEL && NSEL.s === s && Math.abs(NSEL.i - i) <= 1 || DRAW && i === p.nodes.length - 1;
      if (showH) for (const k of [2, 4]) if (n[k] !== n[0] || n[k + 1] !== n[1]) { const [hx, hy] = S(n[k], n[k + 1]); x.strokeStyle = '#12b864'; x.beginPath(); x.moveTo(px, py); x.lineTo(hx, hy); x.stroke(); x.beginPath(); x.arc(hx, hy, 3.5, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.stroke(); }
      x.fillStyle = on ? '#141416' : '#fff'; x.strokeStyle = '#141416'; x.fillRect(px - 4, py - 4, 8, 8); x.strokeRect(px - 4, py - 4, 8, 8);
    }));
    if (DRAW && HOVER && !DRAG) { const last = DRAW.doc[DRAW.doc.length - 1], f = DRAW.doc[0], hx = dx(HOVER[0]), hy = dy(HOVER[1]); x.strokeStyle = 'rgba(18,184,100,.8)'; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(sx(last[0]), sy(last[1]));
      if (last[4] !== last[0] || last[5] !== last[1]) x.bezierCurveTo(sx(last[4]), sy(last[5]), HOVER[0], HOVER[1], HOVER[0], HOVER[1]); else x.lineTo(HOVER[0], HOVER[1]); x.stroke(); x.setLineDash([]);
      if (DRAW.doc.length > 1 && near(f[0], f[1], hx, hy)) { x.beginPath(); x.arc(sx(f[0]), sy(f[1]), 8, 0, Math.PI * 2); x.strokeStyle = '#12b864'; x.lineWidth = 2; x.stroke(); } }
    x.restore();
  }

  // ---- keys (the Studio asks first) ----
  function key(e) {
    if (e.target.closest?.('input,textarea,select,[contenteditable]') || VMODE !== 'picture') return false;
    if (DRAW && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); penFinish(); return true; }
    if (DRAW && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); if (DRAW.doc.length > 1) { DRAW.doc.pop(); penApply(); draw(); } else penFinish(); return true; }
    const mod = e.metaKey || e.ctrlKey; if (mod || e.altKey) return false;
    if (e.key.toLowerCase() === 'p') { e.preventDefault(); setTool('pen'); return true; }
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); const l = selected(); if (l && l.kind === 'shape' && !isPath(l)) toPath(l); setTool('node'); return true; }
    if (TOOL === 'node' && NSEL && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); const l = selected(); if (isPath(l)) delNode(l); return true; }
    if (TOOL === 'node' && e.key === 'Escape' && NSEL) { NSEL = null; draw(); return true; }
    return false;
  }
  function delNode(l) {
    const P = cp(l.paths), p = P[NSEL.s]; p.nodes.splice(NSEL.i, 1); if (p.nodes.length < 2) P.splice(NSEL.s, 1); NSEL = null;
    if (!P.length) { removeLayer(l); return; } l.paths = P; normalize(l); commit(); paintPanels(); draw();
  }

  // ---- the panel and the bar ----
  const icon = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const BICON = { union: 'M4 4h10v6h6v10H10v-6H4z', subtract: 'M4 4h10v6h-4v4H4zM10 10h10v10H10z', intersect: 'M4 4h10v10H4zM10 10h10v10H10zM10 10h4v4h-4z', exclude: 'M4 4h10v6h-4v4H4zM14 10h6v10H10v-6h4z' };
  const boolBtns = cls => Object.entries(BOOL).map(([k, [t, d]]) => `<button type="button" class="${cls}" data-bool="${k}" title="${t}: ${d}" aria-label="${t}">${icon(BICON[k])}</button>`).join('');
  function boolHtml() { return shapes().length > 1 ? `<div class="sec"><h4>Combine the shapes</h4><div class="row">${boolBtns('btn sm q ico')}</div><p class="note">Union joins them, Subtract cuts the ones on top out of the bottom one, Intersect keeps the overlap, Exclude keeps the rest. The result is one path you can edit.</p></div>` : ''; }
  function fieldsHtml(l) {
    const n = l.paths.reduce((s, p) => s + p.nodes.length, 0), closed = l.paths.every(p => p.closed), col = (p, v) => `<input type="color" data-p="${p}" value="${v}">`;
    return `<div class="sec"><h4>Path</h4><p class="note" style="margin:0 0 8px">${n} point${n === 1 ? '' : 's'} in ${l.paths.length} part${l.paths.length === 1 ? '' : 's'}${closed ? ', closed' : ', open'}.</p>
      <label class="f w"><span>Fill</span><span class="row"><input type="checkbox" data-p="fill" ${l.fill ? 'checked' : ''} aria-label="Fill">${col('fillColor', l.fillColor)}</span></label>
      <label class="f w"><span>Outline</span><span class="row"><input type="checkbox" data-p="stroke" ${l.stroke ? 'checked' : ''} aria-label="Outline">${col('strokeColor', l.strokeColor)}</span></label>
      <label class="f"><span>Thickness</span><input type="range" data-p="strokeW" min="1" max="120" step="1" value="${l.strokeW}"><output>${l.strokeW}px</output></label>
      <div class="row"><button class="btn sm ${TOOL === 'node' ? '' : 'q'}" type="button" data-vec="edit" title="Drag points and handles; Alt-click a point to make it sharp or smooth; click the line to add a point (A)">Edit points</button><button class="btn sm q" type="button" data-vec="${closed ? 'open' : 'close'}">${closed ? 'Open the path' : 'Close the path'}</button><button class="btn sm q" type="button" data-vec="smooth" title="Every point smooth">Smooth</button><button class="btn sm q" type="button" data-vec="sharp" title="Every point a sharp corner">Corners</button></div>
      <p class="note">Draw one with the pen (P). It goes to Illustrator as a path and to the embroidery and separations as its shape.</p></div>`;
  }
  const convertHtml = () => '<div class="row" style="margin-top:8px"><button class="btn sm q" type="button" data-vec="topath" title="Its points become editable, and it can be combined with other shapes">Turn into a path</button></div>';
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-bool]'); if (b && b.closest('#opts,#pLayers')) { combine(b.dataset.bool); return; }
    const v = e.target.closest('#pLayers [data-vec]'); if (!v) return; const l = selected(); if (!l) return;
    const a = v.dataset.vec;
    if (a === 'topath') toPath(l);
    else if (a === 'edit') setTool(TOOL === 'node' ? 'select' : 'node');
    else if (isPath(l)) { if (a === 'close' || a === 'open') { l.paths = l.paths.map(p => ({ ...p, closed: a === 'close' })); if (a === 'close') l.fill = true; normalize(l); }
      else { for (let s = 0; s < l.paths.length; s++) for (let i = 0; i < l.paths[s].nodes.length; i++) smooth(l, s, i, a === 'smooth'); }
      commit(); paintPanels(); draw(); }
  });
  // the boolean buttons join the arrange buttons in the bar above the picture
  if (window.PRO) {
    const o1 = PRO.opts; PRO.opts = o => { o1(o); const ar = o.querySelector('.proar'); if (ar && shapes().length > 1) ar.insertAdjacentHTML('beforeend', `<i></i>${boolBtns('ico')}`); };
    const m1 = PRO.multiHtml; PRO.multiHtml = () => m1() + boolHtml();
    PRO.extra.push(() => [{ label: 'Pen: draw a path', keys: 'P', kind: 'Tool', run: () => setTool('pen') }, { label: 'Edit points', keys: 'A', kind: 'Tool', run: () => setTool('node') },
      { label: 'Turn into a path', kind: 'Shape', run: () => toPath(selected()) }, ...Object.entries(BOOL).map(([k, [t, d]]) => ({ label: `${t}: ${d.toLowerCase()}`, kind: 'Shape', run: () => combine(k) }))]);
    PRO.keys.push(['Pen', 'P'], ['Edit points', 'A'], ['Finish the path', 'Enter · Esc']);
  }
  // leaving the pen finishes the path being drawn
  const setTool0 = window.setTool; window.setTool = t => { if (t !== 'pen' && DRAW) penFinish(); if (t !== 'node') NSEL = null; setTool0(t); };

  window.VEC = { content, svg, fromSvg, normalize, parseD, dOf, down, move, end, hover, overlay, key, fieldsHtml, convertHtml, toPath, combine, pathsOf, isPath };
})();
