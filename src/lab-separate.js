// Colour separation: a graphic split into the inks (or threads) it is made of, the way a separator at a print shop does it.
//   separate(png, {width, height, max, garment})  → { W, H, inks: [{hex, rgb, lab, share, solid}], cover: [Uint8Array per ink, 0–255],
//                                                     hard: Int8Array (the one ink each pixel belongs to, −1 for none), tonal, knockouts }
//   halftone(cover, W, H, {lpi, dpi, angle})       → Uint8Array of 0/1: an AM dot screen of a plate's coverage, for its film
//   choke(mask, W, H, px)                           → the mask shrunk by px all round (an underbase sits inside the colours above it)
// How it decides:
//   - The inks are the colours that fill areas of their own (a peak of identical pixels), however small, so a 1% star keeps its plate.
//     Colours that sit between two inks (the soft edge where black meets white, the middle of a gradient) are blends, not inks.
//   - Each pixel then belongs to its nearest ink, or, when it is a blend of two, is shared between them. A blend inside a broad soft area
//     (a gradient, a fade) keeps its share as a tone, which the film screens as halftone dots; a blend on an edge goes to the nearer ink, so
//     no plate carries a ghost outline of another.
//   - An ink the colour of the garment is not printed at all: the garment shows through (a knockout). So is the background of a picture with no
//     transparency (a logo saved as a JPG on white): the colour that frames it all round, where it joins the edge (the same colour inside the
//     art, like white lettering, is still printed).
const clampByte = v => v < 0 ? 0 : v > 255 ? 255 : v;
const hex2 = v => Math.round(v).toString(16).padStart(2, '0');
const toHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export const hexRgb = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16));
const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
export function rgbLab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b), f = t => (t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * .4124 + G * .3576 + B * .1805) / .95047), y = f(R * .2126 + G * .7152 + B * .0722), z = f((R * .0193 + G * .1192 + B * .9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// how far c is from the straight mix of a and b, and where along it (0 = a, 1 = b)
function onSegment(c, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1] + (c[2] - a[2]) * d[2]) / L));
  return { t, dist: deltaE(c, [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]) };
}

// ---- the inks ----
// `data` is RGBA. A colour is solid when a peak of nearly identical pixels holds it: at least `peak` of the opaque pixels in one 4-level bin.
export function findInks(data, N, { max = 12, minShare = .0008, peak = .0025, merge = 11, blendTol = 16, width = 0 } = {}) {
  const bins = new Map(); let total = 0;
  for (let i = 0; i < N * 4; i += 4) {
    if (data[i + 3] < 200) continue; total++;
    const k = (data[i] >> 2) << 12 | (data[i + 1] >> 2) << 6 | (data[i + 2] >> 2), b = bins.get(k);
    if (b) { b[0] += data[i]; b[1] += data[i + 1]; b[2] += data[i + 2]; b[3]++; } else bins.set(k, [data[i], data[i + 1], data[i + 2], 1]);
  }
  if (!total) return [];
  const all = [...bins.values()].map(b => { const rgb = [b[0] / b[3], b[1] / b[3], b[2] / b[3]]; return { rgb, lab: rgbLab(...rgb), n: b[3], top: b[3] }; }).sort((a, b) => b.n - a.n);
  // gather nearby bins into clusters (largest first); a cluster's `top` is its biggest single bin, which tells a flat ink from a spread of blends
  const cl = [];
  for (const c of all) {
    const near = cl.find(m => deltaE(m.lab, c.lab) < merge);
    if (near) { near.n += c.n; near.sum[0] += c.rgb[0] * c.n; near.sum[1] += c.rgb[1] * c.n; near.sum[2] += c.rgb[2] * c.n; }
    else cl.push({ lab: c.lab, rgb: c.rgb, n: c.n, top: c.top, sum: c.rgb.map(v => v * c.n) });
  }
  // solid: its biggest bin is a real peak, well above the colours just around it (a gradient's steps are all about as big as their neighbours)
  const big = all.slice(0, 4000);
  for (const c of cl) {
    c.rgb = c.sum.map(v => v / c.n); c.lab = rgbLab(...c.rgb); c.share = c.n / total;
    const topBin = all.find(x => x.top === c.top && deltaE(x.lab, c.lab) < merge) || c; let nb = 0;
    for (const x of big) { if (x === topBin) continue; const d = deltaE(x.lab, topBin.lab); if (d > 2.5 && d < 16 && x.n > nb) nb = x.n; }
    c.solid = c.top / total >= peak && c.top >= 2 * nb;
  }
  // not solid (a smear: thin lines, JPEG fringes, a gradient's steps): kept only when clearly its own colour, far from every solid one, and
  // (below) when it is not a blend of two others
  const solids = cl.filter(c => c.solid && c.share >= minShare);
  let inks = cl.filter(c => c.share >= minShare && (c.solid || (c.share >= .0015 && solids.every(o => deltaE(o.lab, c.lab) >= 20))));
  // a solid colour that sits between two others is only an ink when it has a body: an edge resampled to a crisp line of mid-grey between black and
  // white is solid-looking but one or two pixels thick. Thickness: the share of its pixels whose four neighbours are the same colour.
  const W0 = width || Math.round(Math.sqrt(N));
  for (const c of inks) {
    if (!c.solid) continue;
    const between = inks.some(a => a !== c && inks.some(b => b !== c && b !== a && (() => { const s = onSegment(c.rgb, a.rgb, b.rgb); return s.dist < blendTol && s.t > .04 && s.t < .96; })()));
    if (!between || !width) continue;
    const near = i => Math.abs(data[i] - c.rgb[0]) + Math.abs(data[i + 1] - c.rgb[1]) + Math.abs(data[i + 2] - c.rgb[2]) < 24 && data[i + 3] >= 200;
    let n = 0, inner = 0;
    for (let p = W0; p < N - W0; p++) { if (!near(p * 4)) continue; n++; if (near((p - 1) * 4) && near((p + 1) * 4) && near((p - W0) * 4) && near((p + W0) * 4)) inner++; }
    if (n && inner / n < .3) c.solid = false;
  }
  // a colour that is only a mix of two others is a blend (an anti-aliased edge, a step of a gradient): it goes, its pixels are shared out later.
  // Solid colours with a body stay even when they sit between two others (grey between black and white is an ink when it fills an area).
  for (let changed = true; changed;) {
    changed = false; let worst = null;
    for (const c of inks) {
      if (c.solid) continue;
      for (const a of inks) for (const b of inks) {
        if (a === c || b === c || a === b) continue; const s = onSegment(c.rgb, a.rgb, b.rgb); // a soft edge is a straight mix of the screen colours
        if (s.dist < blendTol && s.t > .04 && s.t < .96 && (!worst || s.dist < worst.d)) worst = { c, d: s.dist };
      }
    }
    if (worst) { inks = inks.filter(c => c !== worst.c); changed = true; }
  }
  inks.sort((a, b) => b.n - a.n);
  return inks.slice(0, max).map(c => ({ hex: toHex(...c.rgb), rgb: c.rgb.map(Math.round), lab: c.lab, share: Math.round(c.share * 1000) / 1000, solid: c.solid }));
}

// a fast box blur of a 0–255 mask (two passes, separable), for the soft-area test and the choke
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), d = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / d; s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / d; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
// the mask (0/255) shrunk by px all round
export function choke(mask, W, H, px) {
  if (px <= 0) return mask; const b = boxBlur(mask, W, H, Math.round(px)), out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = mask[i] && b[i] > 254 ? 255 : 0; return out;
}

// → the separation of an RGBA buffer `data` W×H. `inks` can be given (a fixed thread or ink list); else they are found.
export function separate(data, W, H, { inks = null, max = 12, garment = '', softPx = 3, dropBackground = true } = {}) {
  const N = W * H, list = (inks && inks.length ? inks.map(c => { const rgb = c.rgb || hexRgb(c.hex); return { ...c, hex: c.hex || toHex(...rgb), rgb, lab: rgbLab(...rgb), solid: true }; }) : findInks(data, N, { max, width: W }));
  const K = list.length, cover = list.map(() => new Uint8Array(N)), hard = new Int8Array(N).fill(-1);
  if (!K) return { W, H, inks: [], cover, hard, tonal: 0, knockouts: [] };
  // each distinct colour is worked out once: its nearest ink, or the two it is a blend of
  const memo = new Map(), pairs = []; for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) pairs.push([a, b]);
  const how = (r, g, b) => {
    const k = r << 16 | g << 8 | b; let m = memo.get(k); if (m) return m;
    const lab = rgbLab(r, g, b), c = [r, g, b]; let best = 0, bd = Infinity; for (let j = 0; j < K; j++) { const d = deltaE(lab, list[j].lab); if (d < bd) { bd = d; best = j; } }
    m = { i: best, a: best, b: best, t: 0, blend: false };
    // a blend: much nearer the straight mix of two inks than any one ink (measured in screen RGB, where soft edges and gradients mix)
    if (bd > 6) { let rd = deltaE(c, list[best].rgb); for (const [a, bb] of pairs) { const s = onSegment(c, list[a].rgb, list[bb].rgb); if (s.dist + 8 < rd && s.t > .06 && s.t < .94) { rd = s.dist; m = { i: s.t < .5 ? a : bb, a, b: bb, t: s.t, blend: true }; } } }
    memo.set(k, m); return m;
  };
  // blends and part-transparent pixels: which lie inside a broad soft area (keep as tones) and which on an edge (go to one ink)
  const softMark = new Uint8Array(N); const info = new Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const a = data[i + 3]; if (a < 8) continue;
    const m = how(data[i], data[i + 1], data[i + 2]); info[p] = m;
    if (m.blend || (a > 20 && a < 235)) softMark[p] = 255;
  }
  const soft = boxBlur(softMark, W, H, softPx); let tonal = 0;
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const m = info[p]; if (!m) continue; const a = data[i + 3];
    if (soft[p] > 150 && softMark[p]) { // a tone: shared between the two inks, and by its opacity
      tonal++; const wA = (1 - m.t) * a, wB = m.t * a;
      if (m.blend) { cover[m.a][p] = clampByte(Math.round(wA)); cover[m.b][p] = clampByte(Math.round(wB)); } else cover[m.i][p] = a;
      if (a >= 128) hard[p] = m.i;
    } else if (a >= 128) { cover[m.i][p] = 255; hard[p] = m.i; }
  }
  // the garment shows through where an ink is its colour
  const knockouts = [];
  if (/^#[0-9a-f]{6}$/i.test(garment)) { const g = rgbLab(...hexRgb(garment)); list.forEach((c, j) => { if (deltaE(c.lab, g) < 4) knockouts.push(j); }); }
  // a picture with no transparency, framed all round by one colour (a logo saved as a JPG on white): that colour is its background, not an ink
  let background = -1;
  if (dropBackground) {
    let clear = 0; for (let i = 3; i < N * 4; i += 4) if (data[i] < 250) { clear++; if (clear > N * .002) break; }
    if (clear <= N * .002) {
      const votes = new Array(K).fill(0); let n = 0; const edge = p => { if (hard[p] >= 0) { votes[hard[p]]++; n++; } };
      for (let x = 0; x < W; x++) { edge(x); edge((H - 1) * W + x); } for (let y = 0; y < H; y++) { edge(y * W); edge(y * W + W - 1); }
      const top = votes.indexOf(Math.max(...votes));
      if (n && votes[top] / n >= .85) { // only the background itself goes: the part of that colour joined to the edge (white lettering inside a logo stays)
        background = top; const st = []; const seen = new Uint8Array(N);
        const push = p => { if (!seen[p] && hard[p] === top) { seen[p] = 1; st.push(p); } };
        for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); } for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
        while (st.length) { const p = st.pop(), x = p % W; hard[p] = -1; for (let j = 0; j < K; j++) cover[j][p] = 0; if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (p >= W) push(p - W); if (p < N - W) push(p + W); }
        // the soft edge between the background and the art: its share of the background goes too
        for (let p = 0; p < N; p++) if (cover[top][p] && cover[top][p] < 255 && hard[p] !== top) cover[top][p] = 0;
        if (!cover[top].some(v => v)) knockouts.push(top);
      }
    }
  }
  const counts = list.map((_, j) => { let n = 0; const c = cover[j]; for (let p = 0; p < N; p++) n += c[p]; return n / 255; }), opaque = counts.reduce((s, n) => s + n, 0) || 1;
  return { W, H, inks: list.map((c, j) => ({ hex: c.hex, rgb: c.rgb, lab: c.lab, solid: c.solid !== false, share: Math.round(counts[j] / opaque * 1000) / 1000, knockout: knockouts.includes(j), background: j === background })), cover, hard, tonal: Math.round(tonal / N * 1000) / 1000, knockouts, background: background >= 0 ? list[background].hex : '' };
}

// ---- the film: an AM halftone, round dots that join into a chequer at 50% and go negative above, at the plate's angle ----
export function halftone(cover, W, H, { lpi = 55, dpi = 300, angle = 22.5 } = {}) {
  const out = new Uint8Array(W * H), cell = dpi / Math.max(10, lpi), th = angle * Math.PI / 180, cs = Math.cos(th) / cell, sn = Math.sin(th) / cell, TAU = Math.PI * 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, c = cover[p]; if (!c) continue; if (c >= 250) { out[p] = 1; continue; }
    const u = x * cs + y * sn, v = -x * sn + y * cs, spot = (Math.cos(TAU * u) + Math.cos(TAU * v) + 2) / 4; // 1 at a dot centre, 0 between dots
    if (spot > 1 - c / 255) out[p] = 1;
  }
  return out;
}
// the usual screen angles, one per plate, 30° apart so the dot rows do not beat into a moiré
export const SCREEN_ANGLES = [22.5, 52.5, 82.5, 7.5, 37.5, 67.5];
