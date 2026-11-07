// Type drawn as the Studio draws it, for any page (the flats' Type tool uses it; the page loads it at /lab/lab-type-draw.js): case, arch,
// envelope shapes letter by letter, a first and second outline, stretch, and a shadow that prints (a solid drop or a 3D block).
//   renderType(o) → a canvas with the words on a clear ground; o: { text, stack (CSS font-family), size (px), bold, italic, case, track,
//     lead, align, arc (−100…100), env ('none'|'bridge'|'bulge'|'pinch'|'flag'|'wave'|'rise'|'grow'), envK (−100…100), color, outline,
//     outlineColor, outline2, outline2Color, stretch (%), shadowKind ('none'|'drop'|'extrude'), shadow (px), shadowAngle (°), shadowColor }

export const ENVS = [['none', 'Straight'], ['bridge', 'Bridge'], ['bulge', 'Bulge'], ['pinch', 'Pinch'], ['flag', 'Flag'], ['wave', 'Wave'], ['rise', 'Rise'], ['grow', 'Grow']];
export const caseOf = (t, c) => c === 'upper' ? t.toUpperCase() : c === 'lower' ? t.toLowerCase() : c === 'title' ? t.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t;
export function envAt(kind, t, a, size, lw) {
  const S = Math.sin(Math.PI * t);
  switch (kind) {
    case 'bridge': return { dy: 0, sy: 1 + a * S, rot: 0, base: true };
    case 'bulge': return { dy: 0, sy: 1 + a * S, rot: 0 };
    case 'pinch': return { dy: 0, sy: Math.max(.2, 1 - a * S * .7), rot: 0 };
    case 'flag': { const A = a * size * .28; return { dy: A * Math.sin(2 * Math.PI * t), sy: 1, rot: Math.atan(A * 2 * Math.PI * Math.cos(2 * Math.PI * t) / Math.max(1, lw)) }; }
    case 'wave': { const A = a * size * .22; return { dy: A * Math.sin(4 * Math.PI * t), sy: 1, rot: Math.atan(A * 4 * Math.PI * Math.cos(4 * Math.PI * t) / Math.max(1, lw)) }; }
    case 'rise': { const A = a * size * .9; return { dy: -A * (t - .5), sy: 1, rot: Math.atan(-A / Math.max(1, lw)) }; }
    case 'grow': return { dy: 0, sy: Math.max(.2, 1 + a * (t - .5) * 1.4), rot: 0, base: true };
    default: return { dy: 0, sy: 1, rot: 0 };
  }
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

export function renderType(o) {
  const size = Math.max(4, o.size || 40), font = `${o.italic ? 'italic ' : ''}${o.bold ? '700' : '400'} ${size}px ${o.stack || 'sans-serif'}`, track = o.track || 0, lead = o.lead || 1.1;
  const lines = caseOf(String(o.text || ' '), o.case).split('\n'), mx = mk(1, 1).getContext('2d'); mx.font = font;
  const lw = lines.map(t => [...t].reduce((s, ch) => s + mx.measureText(ch).width, 0) + Math.max(0, [...t].length - 1) * track);
  const o1 = o.outline || 0, o2 = o.outline2 || 0, pad = Math.ceil(size * .35 + (o1 + o2) * 2 + 4), lh = size * lead;
  const ink = (x, g, px, py) => { x.lineJoin = 'round'; if (o2) { x.strokeStyle = o.outline2Color || '#141416'; x.lineWidth = (o1 + o2) * 2; x.strokeText(g, px, py); } if (o1) { x.strokeStyle = o.outlineColor || '#ffffff'; x.lineWidth = o1 * 2; x.strokeText(g, px, py); } x.fillText(g, px, py); };
  let c;
  if (o.arc && lines.length === 1) {
    // one line bent on a circle: up for an arch, down for a smile; each letter square to the curve
    const L = Math.max(1, lw[0]), th = Math.abs(o.arc) / 100 * Math.PI, R = L / th, up = o.arc > 0; let s = 0;
    const gl = [...lines[0]].map(g => { const gw = mx.measureText(g).width, phi = -th / 2 + (s + gw / 2) / R; s += gw + track; return { g, x: R * Math.sin(phi), y: up ? R * (1 - Math.cos(phi)) : -R * (1 - Math.cos(phi)), r: up ? phi : -phi }; });
    const xs = gl.map(q => q.x), ys = gl.map(q => q.y), ext = size * .75 + pad, x0 = Math.min(...xs) - ext, x1 = Math.max(...xs) + ext, y0 = Math.min(...ys) - ext, y1 = Math.max(...ys) + ext;
    c = mk(x1 - x0, y1 - y0); const x = c.getContext('2d'); x.font = font; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillStyle = o.color || '#141416';
    for (const q of gl) { x.save(); x.translate(q.x - x0, q.y - y0); x.rotate(q.r); ink(x, q.g, 0, 0); x.restore(); }
  } else {
    const ek = o.env && o.env !== 'none' ? Math.max(-1, Math.min(1, (o.envK || 0) / 100)) : 0, ex = ek ? Math.ceil(size * Math.abs(ek) * (o.env === 'rise' ? .6 : 1.1)) : 0;
    const w = Math.max(...lw, 1) + pad * 2, h = lines.length * lh + pad * 2 + ex * 2; c = mk(w, h); const x = c.getContext('2d'); x.font = font; x.textBaseline = 'middle'; x.fillStyle = o.color || '#141416';
    lines.forEach((t, i) => { const x0 = o.align === 'left' ? pad : o.align === 'right' ? w - pad - lw[i] : (w - lw[i]) / 2; let px = x0; const py = ex + pad + lh * i + lh / 2;
      for (const g of [...t]) { const gw = x.measureText(g).width;
        if (!ek) ink(x, g, px, py);
        else { const e = envAt(o.env, (px + gw / 2 - x0) / Math.max(1, lw[i]), ek, size, lw[i]), bl = size * .36; x.save(); x.translate(px + gw / 2, py + e.dy); x.rotate(e.rot); if (e.base) { x.translate(0, bl); x.scale(1, e.sy); x.translate(0, -bl); } else x.scale(1, e.sy); ink(x, g, -gw / 2, 0); x.restore(); }
        px += gw + track; } });
  }
  // stretch, then a shadow in one solid ink
  const st = (o.stretch || 100) / 100; if (Math.abs(st - 1) > .001) { const s2 = mk(c.width * st, c.height); s2.getContext('2d').drawImage(c, 0, 0, s2.width, s2.height); c = s2; }
  const d = o.shadowKind && o.shadowKind !== 'none' ? Math.max(0, o.shadow || 0) : 0; if (!d) return c;
  const a = ((o.shadowAngle ?? 135) - 90) * Math.PI / 180, dx = Math.cos(a) * d, dy = Math.sin(a) * d, sh = mk(c.width, c.height), sx = sh.getContext('2d');
  sx.drawImage(c, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = o.shadowColor || '#141416'; sx.fillRect(0, 0, sh.width, sh.height);
  const out = mk(c.width + Math.abs(dx) + 2, c.height + Math.abs(dy) + 2), ox = out.getContext('2d'), bx = dx < 0 ? -dx : 0, by = dy < 0 ? -dy : 0;
  if (o.shadowKind === 'extrude') { const n = Math.ceil(d); for (let i = n; i >= 1; i--) ox.drawImage(sh, bx + dx * i / n, by + dy * i / n); } else ox.drawImage(sh, bx + dx, by + dy);
  ox.drawImage(c, bx, by); out.anchor = [bx + c.width / 2, by + c.height / 2]; return out;
}
if (typeof window !== 'undefined') window.FBType = { ENVS, caseOf, envAt, renderType };
