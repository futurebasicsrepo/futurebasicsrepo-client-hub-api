// Print filters for the Studio, as pixels in and pixels or dots out, with no imports (the page loads it at /lab/lab-filters.js; tests run it
// in Node). Every one keeps a graphic printable: a few flat inks, or one ink in dots, never soft tones a screen cannot hold.
//
//   halftone(rgba, W, H, { cell, angle, shape, mode })  → [{ x, y, s, c }]  the dots of an amplitude halftone: one per cell of a turned grid, its
//                                                           size from how dark the cell is; shape dot | square | diamond | line | cross;
//                                                           mode 'one' (one ink) or 'own' (each dot in its cell's own colour, the pop-art look)
//   stipple(rgba, W, H, { cell, seed })                  → [{ x, y, s }]     dots spread by error diffusion: the darker, the closer together
//   posterize(rgba, W, H, { inks })                      → { rgba, palette } the picture in its `inks` main colours, flat (k-means on its pixels)
//   threshold(rgba, W, H, { cut, color })                → rgba              one ink wherever the picture is darker than `cut` (0–255)
//   duotone(rgba, W, H, { dark, light })                 → rgba              the picture's tones between two inks
//   darkness(rgba, i)                                    → 0–1, how much ink a pixel takes: its darkness times how solid it is

export const lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
export const darkness = (p, i) => (p[i + 3] / 255) * (1 - lum(p[i], p[i + 1], p[i + 2]) / 255);
const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); const n = m ? parseInt(m[1], 16) : 0x141416; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// the average of a square of pixels round (x, y): its darkness, its colour (weighted by how solid each pixel is) and how solid it is
function sample(p, W, H, x, y, r) {
  let d = 0, n = 0, R = 0, G = 0, B = 0, A = 0;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  const step = Math.max(1, Math.floor(r / 3));
  for (let j = y0; j <= y1; j += step) for (let i = x0; i <= x1; i += step) { const k = (j * W + i) * 4, a = p[k + 3] / 255; d += darkness(p, k); A += a; R += p[k] * a; G += p[k + 1] * a; B += p[k + 2] * a; n++; }
  return n ? { d: d / n, a: A / n, c: A ? toHex(R / A, G / A, B / A) : '#000000' } : { d: 0, a: 0, c: '#000000' };
}

export function halftone(p, W, H, { cell = 12, angle = 45, shape = 'dot', mode = 'one', min = .04 } = {}) {
  const s = Math.max(3, cell), t = angle * Math.PI / 180, co = Math.cos(t), si = Math.sin(t), cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2 + s, out = [];
  for (let v = -R; v <= R; v += s) for (let u = -R; u <= R; u += s) {
    const x = cx + u * co - v * si, y = cy + u * si + v * co; if (x < -s || y < -s || x > W + s || y > H + s) continue;
    const q = sample(p, W, H, x, y, s / 2), ink = mode === 'own' ? q.a : q.d; if (ink < min) continue;
    // the dot's size: its area is the cell's darkness (a round dot reaches the cell's corners at full ink, so the screen closes up)
    const k = shape === 'line' ? ink : shape === 'dot' ? Math.sqrt(ink) * 1.14 : Math.sqrt(ink);
    out.push({ x, y, s: k * s, c: mode === 'own' ? q.c : null });
  }
  return out;
}

export function stipple(p, W, H, { cell = 5, seed = 7 } = {}) {
  const s = Math.max(2, cell), gw = Math.ceil(W / s), gh = Math.ceil(H / s), e = new Float32Array(gw * gh), out = [];
  let r = seed >>> 0 || 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) e[j * gw + i] = sample(p, W, H, i * s + s / 2, j * s + s / 2, s / 2).d;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { // Floyd–Steinberg: each cell's error is carried to the cells after it
    const k = j * gw + i, v = e[k], on = v > .5, err = v - (on ? 1 : 0);
    if (on) out.push({ x: i * s + s / 2 + (rnd() - .5) * s * .35, y: j * s + s / 2 + (rnd() - .5) * s * .35, s: s * .9 });
    if (i + 1 < gw) e[k + 1] += err * 7 / 16; if (j + 1 < gh) { if (i > 0) e[k + gw - 1] += err * 3 / 16; e[k + gw] += err * 5 / 16; if (i + 1 < gw) e[k + gw + 1] += err / 16; }
  }
  return out;
}

export function posterize(p, W, H, { inks = 4, iterations = 8 } = {}) {
  const N = W * H, step = Math.max(1, Math.floor(N / 20000)), pts = [];
  for (let i = 0; i < N; i += step) if (p[i * 4 + 3] > 40) pts.push([p[i * 4], p[i * 4 + 1], p[i * 4 + 2]]);
  const out = new Uint8ClampedArray(p.length); if (!pts.length) return { rgba: out, palette: [] };
  // k-means, started from colours spread along the picture's tones (darkest to lightest), so the same picture always gives the same inks
  const k = Math.max(1, Math.min(12, inks)), byTone = pts.slice().sort((a, b) => lum(...a) - lum(...b));
  let C = Array.from({ length: k }, (_, j) => [...byTone[Math.min(byTone.length - 1, Math.floor((j + .5) / k * byTone.length))]]);
  const near = c => { let b = 0, bd = Infinity; for (let j = 0; j < C.length; j++) { const d = (C[j][0] - c[0]) ** 2 + (C[j][1] - c[1]) ** 2 + (C[j][2] - c[2]) ** 2; if (d < bd) { bd = d; b = j; } } return b; };
  for (let it = 0; it < iterations; it++) { const S = C.map(() => [0, 0, 0, 0]); for (const c of pts) { const j = near(c); S[j][0] += c[0]; S[j][1] += c[1]; S[j][2] += c[2]; S[j][3]++; } C = C.map((c, j) => (S[j][3] ? [S[j][0] / S[j][3], S[j][1] / S[j][3], S[j][2] / S[j][3]] : c)); }
  for (let i = 0; i < N; i++) { const a = p[i * 4 + 3]; if (a <= 40) continue; const c = C[near([p[i * 4], p[i * 4 + 1], p[i * 4 + 2]])]; out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; }
  const used = new Set(); for (let i = 0; i < N; i++) if (out[i * 4 + 3]) used.add(toHex(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]));
  return { rgba: out, palette: [...used] };
}

export function threshold(p, W, H, { cut = 128, color = '#141416' } = {}) {
  const out = new Uint8ClampedArray(p.length), [r, g, b] = hexRgb(color);
  for (let i = 0; i < W * H; i++) { const k = i * 4; if (darkness(p, k) * 255 > 255 - cut) { out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = 255; } }
  return out;
}

export function duotone(p, W, H, { dark = '#14213d', light = '#f1e3c6' } = {}) {
  const out = new Uint8ClampedArray(p.length), D = hexRgb(dark), L = hexRgb(light);
  for (let i = 0; i < W * H; i++) { const k = i * 4; if (!p[k + 3]) continue; const t = lum(p[k], p[k + 1], p[k + 2]) / 255; for (let c = 0; c < 3; c++) out[k + c] = D[c] + (L[c] - D[c]) * t; out[k + 3] = p[k + 3]; }
  return out;
}

// the dots drawn: on a 2D canvas context, in one ink (or each in its own colour)
export function drawDots(ctx, dots, { shape = 'dot', angle = 45, color = '#141416', cell = 12 } = {}) {
  const t = angle * Math.PI / 180;
  for (const d of dots) {
    ctx.fillStyle = d.c || color; const r = d.s / 2;
    if (shape === 'dot') { ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(shape === 'diamond' ? t + Math.PI / 4 : t);
    if (shape === 'line') ctx.fillRect(-cell / 2 - .5, -r, cell + 1, d.s);
    else if (shape === 'cross') { const w = Math.max(1, d.s * .38); ctx.fillRect(-r, -w / 2, d.s, w); ctx.fillRect(-w / 2, -r, w, d.s); }
    else ctx.fillRect(-r, -r, d.s, d.s);
    ctx.restore();
  }
}
