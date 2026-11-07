// Brush tips for the Studio: how one piece of a stroke is laid down, shared by the picture (src/lab-studio.html) and the flats'
// hand drawing (src/lab-flats.html), so a tip looks the same on both. No imports; the page loads it at /lab/lab-brush.js.
//
//   segment(ctx, o, a, b, q?)  draws from point a to point b (through control point q, for a smooth curve) on ctx, in ctx's own pixels
//     o: { tool: 'brush'|'eraser', tip, color, size (the tip's width in ctx pixels), flow (0–1), soft (0–1), pr (Pencil pressure 0–1) }

export const TIPS = [
  { id: 'round', label: 'Round', hint: 'A smooth, even line; pressing harder makes it wider' },
  { id: 'pencil', label: 'Pencil', hint: 'Thin and grainy, like graphite; light pressure is faint' },
  { id: 'ink', label: 'Ink pen', hint: 'Crisp, swells strongly with pressure: from a hairline to bold' },
  { id: 'marker', label: 'Marker', hint: 'Broad, flat and see-through; the same width whatever the pressure' },
  { id: 'airbrush', label: 'Airbrush', hint: 'Soft, misty edges; build the colour up in passes' },
  { id: 'calligraphy', label: 'Calligraphy', hint: 'A flat nib at 45°: thick one way, thin the other' },
  { id: 'chalk', label: 'Chalk', hint: 'A rough, dry texture with gaps, like chalk or a dry brush' },
  { id: 'spray', label: 'Spray', hint: 'A scatter of fine dots, like spray paint' },
  { id: 'stars', label: 'Stars', hint: 'Scatters stars along the line, turned and sized at random' },
  { id: 'hearts', label: 'Hearts', hint: 'Scatters hearts along the line' },
  { id: 'confetti', label: 'Confetti', hint: 'Scatters little strips and dots, like thrown confetti' },
  { id: 'stitch', label: 'Running stitch', hint: 'Even dashes, like a running stitch or topstitching' },
  { id: 'chain', label: 'Chain stitch', hint: 'Linked loops, like chain-stitch embroidery' }
];
export const ERASER_TIPS = [
  { id: 'hard', label: 'Hard', hint: 'Rubs out cleanly to a sharp edge' },
  { id: 'soft', label: 'Soft', hint: 'Fades out at the edge, for blending' }
];
export const SIZE_PRESETS = [4, 12, 28, 60, 120];
// see-through tips are drawn solid on a layer of their own while the stroke is made, and that layer is laid on at this opacity once
// (drawn piece by piece at their opacity, the pieces overlap where they join and show as darker beads)
export const strokeAlpha = (tip, flow = 1) => tip === 'marker' ? .5 * flow : tip === 'airbrush' ? .35 * flow : 0;

// a fine grain in the colour, for pencil and chalk (made once per colour and coarseness)
const GRAIN = new Map();
function grain(ctx, color, coarse) {
  const key = `${color}|${coarse}`; if (GRAIN.has(key)) return ctx.createPattern(GRAIN.get(key), 'repeat');
  const n = 96, c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n }), x = c.getContext('2d');
  let seed = coarse ? 7919 : 104729; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  x.fillStyle = color;
  for (let i = 0; i < (coarse ? 1400 : 2600); i++) { x.globalAlpha = coarse ? (rnd() < .35 ? 0 : .5 + rnd() * .5) : .25 + rnd() * .75; const s = coarse ? 1 + rnd() * 2.2 : .8 + rnd() * .9; x.fillRect(rnd() * n, rnd() * n, s, s); }
  GRAIN.set(key, c); return ctx.createPattern(c, 'repeat');
}

// where an evenly spaced tip (a stitch) is along its stroke: kept per canvas, picked up when the next piece starts where the last one ended
const RUN = new WeakMap();
export function segment(ctx, o, a, b, q) {
  const tip = o.tool === 'eraser' ? (o.tip === 'soft' ? 'soft' : 'hard') : (TIPS.some(t => t.id === o.tip) ? o.tip : 'round');
  const pr = Math.min(Math.max(o.pr ?? 1, .05), 1), size = Math.max(.5, o.size || 1), flow = Math.min(Math.max(o.flow ?? 1, .02), 1);
  const path = () => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); if (q) ctx.quadraticCurveTo(q[0], q[1], b[0] + .01, b[1]); else ctx.lineTo(b[0] + .01, b[1]); };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.globalAlpha = flow; ctx.lineWidth = size * pr;
    if (tip === 'soft') { ctx.shadowColor = '#000'; ctx.shadowBlur = size * .6; ctx.globalAlpha = flow * .6; }
    path(); ctx.stroke(); ctx.restore(); return;
  }
  const color = o.color || '#141416';
  if (tip === 'round') { ctx.strokeStyle = color; ctx.globalAlpha = flow; ctx.lineWidth = size * pr; if (o.soft) { ctx.shadowColor = color; ctx.shadowBlur = size * pr * o.soft; } path(); ctx.stroke(); }
  else if (tip === 'pencil') { ctx.strokeStyle = grain(ctx, color, false); ctx.globalAlpha = flow * (.45 + .55 * pr); ctx.lineWidth = Math.max(.6, size * .35 * (.5 + .5 * pr)); path(); ctx.stroke(); }
  else if (tip === 'ink') { ctx.strokeStyle = color; ctx.globalAlpha = flow; ctx.lineWidth = Math.max(.4, size * (.08 + .92 * Math.pow(pr, 1.6))); path(); ctx.stroke(); }
  else if (tip === 'marker') { ctx.strokeStyle = color; ctx.globalAlpha = o.solid ? 1 : flow * .45; ctx.lineCap = 'square'; ctx.lineWidth = size; path(); ctx.stroke(); }
  else if (tip === 'airbrush') { ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = size * 1.1; ctx.globalAlpha = o.solid ? .5 + .5 * pr : flow * .14 * (.4 + .6 * pr); ctx.lineWidth = size * .6; path(); ctx.stroke(); }
  else if (tip === 'calligraphy') {
    // a flat nib held at 45°: the band its edge sweeps from a to b (thick across the nib, a hairline along it), with no joins to show
    const h = size * (.55 + .45 * pr) / 2, nx = Math.cos(Math.PI / 4) * h, ny = -Math.sin(Math.PI / 4) * h, m = q || [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.fillStyle = color; ctx.globalAlpha = flow; ctx.beginPath(); ctx.moveTo(a[0] + nx, a[1] + ny); ctx.quadraticCurveTo(m[0] + nx, m[1] + ny, b[0] + nx, b[1] + ny);
    ctx.lineTo(b[0] - nx, b[1] - ny); ctx.quadraticCurveTo(m[0] - nx, m[1] - ny, a[0] - nx, a[1] - ny); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(.6, size * .06); ctx.beginPath(); ctx.moveTo(a[0] + nx, a[1] + ny); ctx.lineTo(a[0] - nx, a[1] - ny); ctx.stroke(); // closes the hairline gaps between pieces
  }
  else if (tip === 'chalk') { ctx.strokeStyle = grain(ctx, color, true); ctx.globalAlpha = flow * (.6 + .4 * pr); ctx.lineWidth = size * (.6 + .4 * pr); path(); ctx.stroke(); }
  else if (tip === 'spray') {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), r = size * .6, n = Math.max(3, Math.round((d + r) * r / 18 * (.4 + .6 * pr)));
    ctx.fillStyle = color; ctx.globalAlpha = flow * .7;
    for (let i = 0; i < n; i++) { const t = Math.random(), px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, ra = Math.sqrt(Math.random()) * r, th = Math.random() * Math.PI * 2, s = Math.max(.6, size * .03 + Math.random() * size * .03);
      ctx.fillRect(px + Math.cos(th) * ra, py + Math.sin(th) * ra, s, s); }
  }
  else if (tip === 'stitch' || tip === 'chain') {
    // several strokes can run at once on one canvas (symmetry draws mirrored copies), so each is found by where its last piece ended
    const key = ctx.canvas || ctx, runs = RUN.get(key) || [], d = Math.hypot(b[0] - a[0], b[1] - a[1]), gap = tip === 'stitch' ? size * 1.6 : size * 1.1, i0 = runs.findIndex(r => Math.hypot(r.x - a[0], r.y - a[1]) < .5);
    let at = i0 >= 0 ? runs[i0].at : 0; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.globalAlpha = flow; ctx.lineCap = 'round';
    for (let t = gap - at; t <= d; t += gap) { const x = a[0] + (b[0] - a[0]) * t / (d || 1), y = a[1] + (b[1] - a[1]) * t / (d || 1); ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath();
      if (tip === 'stitch') { ctx.lineWidth = Math.max(.6, size * .28 * (.6 + .4 * pr)); ctx.moveTo(-size * .5, 0); ctx.lineTo(size * .5, 0); ctx.stroke(); }
      else { ctx.lineWidth = Math.max(.6, size * .18 * (.6 + .4 * pr)); ctx.ellipse(0, 0, size * .62, size * .32, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore(); }
    if (i0 >= 0) runs.splice(i0, 1); runs.push({ x: b[0], y: b[1], at: (at + d) % gap }); if (runs.length > 16) runs.shift(); RUN.set(key, runs);
  }
  else if (tip === 'stars' || tip === 'hearts' || tip === 'confetti') {
    // stamps along the piece, about one per tip's width, each turned, sized and set off the line at random (seeded by where it falls, so a
    // stroke drawn again over the same place does not shimmer)
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), gap = size * (tip === 'confetti' ? .45 : .9), q = d / gap, z = (Math.abs(Math.sin(a[0] * 12.9898 + a[1] * 78.233)) * 43758.5453) % 1, n = Math.floor(q) + (z < q % 1 ? 1 : 0); // a short piece stamps by chance, in proportion to its length
    ctx.fillStyle = color; ctx.globalAlpha = flow;
    for (let i = 1; i <= n; i++) {
      const t = n === 1 ? .5 : (i - .5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      let seed = Math.floor(x * 73.1 + y * 37.7) >>> 0 || 1; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const s = size * (.35 + r() * .45) * (.5 + .5 * pr), px = x + (r() - .5) * size * .9, py = y + (r() - .5) * size * .9;
      ctx.save(); ctx.translate(px, py); ctx.rotate(r() * Math.PI * 2); ctx.beginPath();
      if (tip === 'stars') for (let k = 0; k < 10; k++) { const rr = k % 2 ? s * .2 : s * .5, an = k * Math.PI / 5 - Math.PI / 2; k ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); }
      else if (tip === 'hearts') { const h = s * .5; ctx.moveTo(0, h * .7); ctx.bezierCurveTo(-h * 1.3, -h * .1, -h * .5, -h * 1.1, 0, -h * .35); ctx.bezierCurveTo(h * .5, -h * 1.1, h * 1.3, -h * .1, 0, h * .7); }
      else if (r() < .5) ctx.rect(-s * .4, -s * .1, s * .8, s * .2); else ctx.arc(0, 0, s * .16, 0, Math.PI * 2);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  ctx.restore();
}
// QuickShape: a stroke read as a clean shape: a straight line, a triangle, a four- or five-sided shape, an oval or a circle; null when it is none
// of those (or too small, minSize in the stroke's own units). pts: the stroke's points
function rdp(pts, tol) { if (pts.length < 4) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = -1, md = tol; const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; m = i; } } if (m > 0) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return pts.filter((_, i) => keep[i]); }
export function quickShapeOf(pts, { minSize = 0 } = {}) {
  if (!pts || pts.length < 6) return null; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), S = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); if (S < minSize) return null;
  const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dev = p => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / (L || 1);
  if (L > S * .6 && Math.max(...pts.map(dev)) < Math.max(4, L * .07)) return { name: 'a straight line', pts: [a, b] };
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= S * .3) return null;
  const v = rdp([...pts, pts[0]], S * .1).slice(0, -1), n = v.length;
  if (n >= 3 && n <= 5) return { name: n === 3 ? 'a triangle' : n === 4 ? 'a four-sided shape' : 'a five-sided shape', pts: [...v, v[0]] };
  // an oval along the stroke's own axis (its principal direction), a circle when its two radii are near enough
  const mx = xs.reduce((t, q) => t + q, 0) / xs.length, my = ys.reduce((t, q) => t + q, 0) / ys.length; let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const th = .5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(th), sn = Math.sin(th); let ra = 0, rb = 0; for (const [x, y] of pts) { const u = (x - mx) * c + (y - my) * sn, w = -(x - mx) * sn + (y - my) * c; ra = Math.max(ra, Math.abs(u)); rb = Math.max(rb, Math.abs(w)); }
  ra *= .96; rb *= .96; let name = 'an oval'; if (Math.abs(ra - rb) < Math.max(ra, rb) * .12) { ra = rb = (ra + rb) / 2; name = 'a circle'; }
  return { name, pts: Array.from({ length: 97 }, (_, i) => { const t = i / 96 * Math.PI * 2, u = ra * Math.cos(t), w = rb * Math.sin(t); return [mx + u * c - w * sn, my + u * sn + w * c]; }) };
}
// symmetry: the maps that copy a point into its mirror images (mirror, top-bottom, four ways, or turned 6 or 8 ways), about (cx, cy)
export function symmetryMaps(mode, cx, cy) {
  if (!mode || mode === 'off') return [p => p];
  const fx = p => [2 * cx - p[0], p[1]], fy = p => [p[0], 2 * cy - p[1]];
  if (mode === 'v') return [p => p, fx]; if (mode === 'h') return [p => p, fy]; if (mode === 'quad') return [p => p, fx, fy, p => fy(fx(p))];
  const n = mode === 'r6' ? 6 : 8; return Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a); return p => [cx + (p[0] - cx) * c - (p[1] - cy) * s, cy + (p[0] - cx) * s + (p[1] - cy) * c]; });
}
// liquify: the pixels within reach of a push move with it, most at the middle and none at the edge. ctx: a 2D context; a, b: from and to,
// in its pixels; r: the reach
export function liquifyPush(ctx, a, b, r) {
  const c = ctx.canvas, R = Math.max(4, r), dx = b[0] - a[0], dy = b[1] - a[1];
  const X0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - R)), Y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - R)), X1 = Math.min(c.width, Math.ceil(Math.max(a[0], b[0]) + R)), Y1 = Math.min(c.height, Math.ceil(Math.max(a[1], b[1]) + R)), w = X1 - X0, h = Y1 - Y0;
  if (w <= 0 || h <= 0) return; const src = ctx.getImageData(X0, Y0, w, h), out = ctx.createImageData(w, h), S = src.data, O = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r2 = ((x + X0 - b[0]) ** 2 + (y + Y0 - b[1]) ** 2) / (R * R), k = (y * w + x) * 4; let fx = x, fy = y; if (r2 < 1) { const t = (1 - r2) ** 2; fx = x - dx * t; fy = y - dy * t; }
    const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy; for (let ch = 0; ch < 4; ch++) { const at = (xx, yy) => { xx = Math.min(w - 1, Math.max(0, xx)); yy = Math.min(h - 1, Math.max(0, yy)); return S[(yy * w + xx) * 4 + ch]; }; O[k + ch] = (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v; } }
  ctx.putImageData(out, X0, Y0);
}
if (typeof window !== 'undefined') window.FBBrush = { TIPS, ERASER_TIPS, SIZE_PRESETS, strokeAlpha, segment, quickShapeOf, symmetryMaps, liquifyPush };
