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
if (typeof window !== 'undefined') window.FBBrush = { TIPS, ERASER_TIPS, SIZE_PRESETS, strokeAlpha, segment };
