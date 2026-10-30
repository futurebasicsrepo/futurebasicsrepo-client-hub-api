// The sew-out: what a digitized design (src/lab-digitize.js) will look like sewn, and the check a digitiser makes before it goes to the machine.
//   sewoutPng(d, {px, garment, fabric, format}) → a PNG Buffer (format 'jpeg': a JPEG, a fraction of the size, for sending over the wire) of the
//                                           piece as thread on cloth. Every stitch is a twisted thread ~0.4 mm thick lit as a cylinder (darker edges,
//                                           a sheen along its length, the ply twist), dipping into the cloth at each needle hole; the threads stack
//                                           (underlay below, the top over it, satin columns arched over their underlay) and cast a soft shadow on
//                                           what is below; the ground is the garment colour as fabric: knit | woven | twill | fleece. Jumps and
//                                           trims are not drawn (they are cut before the piece ships).
//   sewoutFrames(d)                       → the stitches as a small stream for playing the sew-out back in the browser (encoding below)
//   digitizeReview(d, png, {widthIn})     → { score, verdict: ready | check | fix, fidelity: {coverage, overstitch, iou}, items: [{level, code, text, fix?}] }
//                                           the stitches laid back over the artwork (how much of the art is sewn, how much thread lands outside it),
//                                           then the checks a digitiser makes: density, thin columns and small lettering, long satin floats, lost
//                                           details, jumps and trims, colour changes, stitch count and run time, and the hoop it needs. A `fix` is a
//                                           setting the studio can apply in one click ({ rowMm }, { widthIn }, { satinMaxMm }, { trimMm }, ...).
// Units are the design's: 0.1 mm, centred on 0,0. A plan point may carry o (the object it belongs to), u (underlay), run (a travel run), tie.
import sharp from 'sharp';
import { separate } from './lab-separate.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const hexRgb = h => (/^#[0-9a-f]{6}$/i.test(String(h)) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null);

// the sewn segments of a design, in sewing order: { a, b, c: block index, sat, u }
function segments(d) {
  const out = [], objs = d.objects || [];
  d.plan.forEach((blk, c) => {
    let prev = null;
    for (const q of blk.pts) {
      if (q.trim) { prev = null; continue; }
      if (q.jump || !prev) { prev = q.p; continue; }
      if (q.p[0] !== prev[0] || q.p[1] !== prev[1]) out.push({ a: prev, b: q.p, c, sat: objs[q.o]?.kind === 'satin' && !q.u && !q.tie, u: !!q.u, tie: !!q.tie, run: !!q.run, o: q.o });
      prev = q.p;
    }
  });
  return out;
}

// ---- box blur (three passes ≈ a gaussian), in place on a Float32Array ----
function blur(src, W, H, r) {
  r = Math.max(1, Math.round(r)); const tmp = new Float32Array(src.length), a = src; const inv = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) { const o = y * W; let s = 0; for (let x = -r; x <= r; x++) s += a[o + clampI(x, W)]; for (let x = 0; x < W; x++) { tmp[o + x] = s * inv; s += a[o + clampI(x + r + 1, W)] - a[o + clampI(x - r, W)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[clampI(y, H) * W + x]; for (let y = 0; y < H; y++) { a[y * W + x] = s * inv; s += tmp[clampI(y + r + 1, H) * W + x] - tmp[clampI(y - r, H) * W + x]; } }
  }
  return a;
}
const clampI = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
// a hash in 0..1 for integer lattice points
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), e = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}

// ---- the cloth: a height field in 0..1 for the weave or knit, at pmm pixels a millimetre ----
function clothHeight(W, H, pmm, fabric, seed = 7) {
  const f = new Float32Array(W * H);
  // the yarn's own unevenness, on a coarse grid upscaled (cheap)
  const g = 8, GW = Math.ceil(W / g) + 2, GH = Math.ceil(H / g) + 2, coarse = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = i * g / pmm, y = j * g / pmm; coarse[j * GW + i] = valueNoise(x * .7 + seed, y * .7) * .6 + valueNoise(x * 2.3, y * 2.3 + seed) * .4; }
  const amp = clamp(pmm / 7, .25, 1); // the pattern fades out where it would be finer than the pixels
  for (let y = 0; y < H; y++) {
    const gy = y / g, j0 = Math.floor(gy), ty = gy - j0, my = y / pmm;
    for (let x = 0; x < W; x++) {
      const gx = x / g, i0 = Math.floor(gx), tx = gx - i0, k = j0 * GW + i0;
      const n = coarse[k] * (1 - tx) * (1 - ty) + coarse[k + 1] * tx * (1 - ty) + coarse[k + GW] * (1 - tx) * ty + coarse[k + GW + 1] * tx * ty;
      const mx = x / pmm; let h;
      if (fabric === 'woven' || fabric === 'twill') {
        const p = fabric === 'twill' ? .42 : .3, u = mx / p, v = my / p, i = Math.floor(u), jj = Math.floor(v), fu = u - i, fv = v - jj;
        const warpUp = fabric === 'twill' ? ((i + jj) & 3) < 2 : ((i + jj) & 1) === 0;
        const across = warpUp ? fu : fv, along = warpUp ? fv : fu, ridge = Math.sin(Math.PI * across), bump = .55 + .45 * Math.sin(Math.PI * along);
        h = (warpUp ? .62 : .5) * ridge * bump + .1 * hash2(i, jj);
      } else if (fabric === 'fleece') {
        h = .5 + .25 * (valueNoise(mx * 6, my * 6) - .5) + .18 * (valueNoise(mx * 17 + 3, my * 17) - .5) + .25 * (hash2(x, y) - .5);
      } else { // jersey knit: columns of V loops (wales ~0.85 mm, courses ~0.65 mm)
        const pw = .85, ph = .65, u = mx / pw, v = my / ph, i = Math.floor(u), jj = Math.floor(v), fx = u - i - .5, fy = v - jj;
        const s = fx < 0 ? -1 : 1, xc = s * (.04 + .27 * (1 - fy)), dx = (fx - xc) / .2;
        const leg = dx * dx < 1 ? Math.sqrt(1 - dx * dx) : 0;
        h = leg * (.7 + .3 * Math.sin(Math.PI * fy)) * (.85 + .3 * hash2(i * 2 + (s > 0), jj)) + .08 * hash2(x, y);
      }
      f[y * W + x] = .5 + (h - .5) * amp + (n - .5) * .35;
    }
  }
  return f;
}

// ---- the render ----
export async function sewoutPng(d, { px = 1400, garment = '', fabric = 'knit', format = 'png' } = {}) {
  const segs = segments(d), pts = segs.flatMap(s => [s.a, s.b]);
  const grgb = hexRgb(garment) || hexRgb(d.settings?.garment) || hexRgb('#ecebe6');
  let x0 = -(d.widthMm || 50) * 5, y0 = -(d.heightMm || 50) * 5, x1 = -x0, y1 = -y0;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const m = Math.max(40, .07 * Math.max(x1 - x0, y1 - y0)); x0 -= m; y0 -= m; x1 += m; y1 += m;
  const W = Math.max(16, Math.round(px)), sc = W / (x1 - x0), H = Math.max(16, Math.round((y1 - y0) * sc)), N = W * H, pmm = sc * 10;
  // thread buffers: albedo, coverage, height, surface normal (x, y), sheen
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), A = new Float32Array(N), Hh = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N), SH = new Float32Array(N);
  const r = Math.max(.75, 2.1 * sc), twistP = Math.max(2.2, 3.3 * sc), cols = d.plan.map(b => b.rgb || hexRgb(b.hex) || [128, 128, 128]);
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k], ax = (s.a[0] - x0) * sc, ay = (s.a[1] - y0) * sc, bx = (s.b[0] - x0) * sc, by = (s.b[1] - y0) * sc;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy); if (L < .05) continue;
    const tx = dx / L, ty = dy / L, nx = -ty, ny = tx, rr = s.u ? r * .9 : r, R2 = rr + .9, ext = rr * .5;
    const col = cols[s.c], jit = .95 + .1 * hash2(k, 17), base = s.u ? 0 : rr * .55;
    const flat = s.sat ? .7 : 1, edge = s.sat ? .84 : .74, arch = s.sat ? rr * .9 * clamp(L / (12 * sc)) : 0, endL = Math.min(L / 2, rr * 1.8), ph0 = hash2(k, 3) * 6.283;
    const ymin = Math.max(0, Math.floor(Math.min(ay, by) - R2)), ymax = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R2));
    for (let y = ymin; y <= ymax; y++) {
      const py = y + .5; let t0 = 0, t1 = 1;
      if (Math.abs(dy) > 1e-6) { const ta = (py - R2 - ay) / dy, tb = (py + R2 - ay) / dy; t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb)); if (t0 > t1) continue; }
      else if (Math.abs(py - ay) > R2) continue;
      const xa = ax + dx * t0, xb = ax + dx * t1, xmin = Math.max(0, Math.floor(Math.min(xa, xb) - R2)), xmax = Math.min(W - 1, Math.ceil(Math.max(xa, xb) + R2));
      for (let x = xmin; x <= xmax; x++) {
        // a flat-ended band, not a capsule: at a needle hole the thread runs on into the next stitch rather than ending in a dome
        const wx = x + .5 - ax, wy = py - ay, t = wx * tx + wy * ty, over = t < 0 ? -t : t - L; if (over > ext + .5) continue;
        const across = wx * nx + wy * ny, dist = across < 0 ? -across : across; if (dist > rr + .5) continue;
        const a = clamp(rr + .5 - dist) * (over > ext - .5 ? clamp(ext + .5 - over) : 1), i = y * W + x, tc = t < 0 ? 0 : t > L ? L : t;
        // across the thread: a cylinder; the ends dive into the needle hole; satin arches over its column
        const ux = clamp(across / rr, -1, 1), nz0 = Math.sqrt(1 - ux * ux), uf = ux * flat, cx = nx * uf, cy = ny * uf;
        const e = clamp(Math.min(tc, L - tc) / endL), dive = 1 - e * e * (3 - 2 * e), v = tc / L;
        let along = (tc < L / 2 ? -1 : 1) * dive * .18 - (arch ? Math.cos(Math.PI * v) * Math.PI * arch / L * 1.4 : 0);
        const phase = (tc + ux * rr * 1.1) / twistP * 6.283 + ph0, ply = Math.sin(phase); along += ply * (s.sat ? .12 : .18);
        const h = base * (1 - .25 * dive) + rr * nz0 * (1 - .2 * dive) + arch * Math.sin(Math.PI * v) * (1 - dive) + .5 * Math.min(Hh[i], 2 * rr);
        const shade = jit * (edge + (1 - edge) * Math.sqrt(nz0)) * (1 - .08 * dive) * (.94 + .06 * ply);
        const b0 = 1 - a;
        R[i] = R[i] * b0 + col[0] * shade * a; G[i] = G[i] * b0 + col[1] * shade * a; B[i] = B[i] * b0 + col[2] * shade * a;
        NX[i] = NX[i] * b0 + (cx + tx * along) * a; NY[i] = NY[i] * b0 + (cy + ty * along) * a;
        SH[i] = SH[i] * b0 + (.75 + .25 * ply) * (1 - .7 * dive) * a; Hh[i] = Hh[i] * b0 + h * a; A[i] = A[i] + (1 - A[i]) * a;
      }
    }
  }
  // shadows: what stands higher toward the light darkens what is below it; crevices between threads get less light
  const Lx = -.42, Ly = -.55, Lz = .72, Ln = Math.hypot(Lx, Ly, Lz), lx = Lx / Ln, ly = Ly / Ln, lz = Lz / Ln, hx = lx, hy = ly, hz = lz + 1, hn = Math.hypot(hx, hy, hz);
  const sh = blur(Float32Array.from(Hh), W, H, r * .9), ao = blur(Float32Array.from(Hh), W, H, r * 3.2), off = r * 1.6, ox = Math.round(lx * off / Math.hypot(lx, ly)), oy = Math.round(ly * off / Math.hypot(lx, ly));
  const cloth = clothHeight(W, H, pmm, fabric), fs = fabric === 'fleece' ? .9 : 2.2;
  const out = Buffer.alloc(N * 3), vx = new Float32Array(W), vy = new Float32Array(H), d2 = (W * W + H * H) / 4;
  for (let x = 0; x < W; x++) vx[x] = (x - W / 2) ** 2 / d2; for (let y = 0; y < H; y++) vy[y] = (y - H / 2) ** 2 / d2;
  const p8 = v => { v *= v; v *= v; return v * v; }, gain = .8 / lz, sh0 = .35 * r, shK = 1 / (2.2 * r), aoK = 1 / (2.5 * r);
  const fx = Math.round(ox * 2.2), fy = Math.round(oy * 2.2), farK = 1 / (1.4 * r);
    // (fx, fy: a wider, softer shadow the embroidery casts on the cloth round it)
  for (let y = 0; y < H; y++) {
    const yf = clampI(y + fy, H) * W, yo = clampI(y + oy, H) * W, yu = clampI(y - 1, H) * W, yd = clampI(y + 1, H) * W, row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x, j = yo + clampI(x + ox, W), hi = Hh[i];
      const shadow = clamp((sh[j] - hi - sh0) * shK) * .55, occl = clamp((ao[i] - hi - .15 * r) * aoK) * .32, dim = (1 - shadow) * (1 - occl);
      const vig = 1 - .1 * (vx[x] + vy[y]) + .03 * (1 - (x + y) / (W + H)), a = A[i];
      let r0 = 0, g0 = 0, b0 = 0;
      if (a < .999) { // the cloth, lit from its own height field
        const gx = (cloth[row + (x < W - 1 ? x + 1 : x)] - cloth[row + (x > 0 ? x - 1 : x)]) * fs, gy = (cloth[yd + x] - cloth[yu + x]) * fs;
        const fn = 1 / Math.sqrt(gx * gx + gy * gy + 1), fdiff = Math.max(0, (-gx * lx - gy * ly + lz) * fn), fh = Math.max(0, (-gx * hx - gy * hy + hz) * fn / hn);
        const cast = 1 - clamp(ao[yf + clampI(x + fx, W)] * farK) * .22, fl = (.5 + .62 * fdiff * gain) * (.82 + .3 * cloth[i]) * vig * dim * cast, fspec = 12.75 * p8(fh) * fh * fh * fh * fh;
        r0 = grgb[0] * fl + fspec; g0 = grgb[1] * fl + fspec; b0 = grgb[2] * fl + fspec;
      }
      if (a > 0) {
        const inv = 1 / a, nx = NX[i] * inv, ny = NY[i] * inv, n2 = nx * nx + ny * ny, nz = n2 < .96 ? Math.sqrt(1 - n2) : .2, nl = 1 / Math.sqrt(n2 + nz * nz);
        const nX = nx * nl, nY = ny * nl, nZ = nz * nl, diff = Math.max(0, nX * lx + nY * ly + nZ * lz), nh = Math.max(0, (nX * hx + nY * hy + nZ * hz) / hn);
        const n8 = p8(nh), n32 = (n8 * n8) * (n8 * n8), lit = (.36 + .9 * diff) * vig * dim, sp = (n32 * nh * nh * nh * nh * nh * nh * .62 + n8 * .1) * SH[i] * inv * vig * (1 - shadow * .8) * 255;
        const tr = R[i] * inv, tg = G[i] * inv, tb = B[i] * inv;
        const qr = tr * lit + sp * (.85 + .15 * tr / 255), qg = tg * lit + sp * (.85 + .15 * tg / 255), qb = tb * lit + sp * (.85 + .15 * tb / 255);
        r0 = r0 * (1 - a) + qr * a; g0 = g0 * (1 - a) + qg * a; b0 = b0 * (1 - a) + qb * a;
      }
      const o3 = i * 3; out[o3] = r0 < 0 ? 0 : r0 > 255 ? 255 : r0; out[o3 + 1] = g0 < 0 ? 0 : g0 > 255 ? 255 : g0; out[o3 + 2] = b0 < 0 ? 0 : b0 > 255 ? 255 : b0;
    }
  }
  const img = sharp(out, { raw: { width: W, height: H, channels: 3 } });
  return format === 'jpeg' ? img.jpeg({ quality: 86, chromaSubsampling: '4:4:4' }).toBuffer() : img.png({ compressionLevel: 4 }).toBuffer();
}

// ---- playback stream ----
// s is base64 of little-endian Int16 triples [x, y, flag], x and y in 0.1 mm (centred on 0,0, y down), one triple a needle move, in sewing order.
// flag 0 = a stitch (the needle goes down here), 1 = a jump (the frame moves here, no stitch), 2 = a trim (the thread is cut here),
// 3 = a colour change (the next thread starts; x, y = where the frame is). In the browser: new Int16Array(Uint8Array.from(atob(s), c =>
// c.charCodeAt(0)).buffer) and read it three at a time. colours[k] is the thread after the k-th colour change.
export function sewoutFrames(d) {
  const P = globalThis.FBPantone, n = d.plan.reduce((s, b) => s + b.pts.length, 0) + d.plan.length, a = new Int16Array(n * 3);
  let k = 0, stitches = 0, jumps = 0, trims = 0, cur = [0, 0];
  const put = (p, f) => { a[k++] = clamp(Math.round(p[0]), -32768, 32767); a[k++] = clamp(Math.round(p[1]), -32768, 32767); a[k++] = f; };
  d.plan.forEach((b, i) => {
    if (i) put(cur, 3);
    for (const q of b.pts) { const f = q.trim ? 2 : q.jump ? 1 : 0; put(q.p, f); if (f === 0) stitches++; else if (f === 1) jumps++; else trims++; cur = q.p; }
  });
  const buf = Buffer.from(a.buffer, a.byteOffset, k * 2);
  return { widthMm: d.widthMm, heightMm: d.heightMm, colours: d.plan.map(b => { const name = P ? P.code(b.hex) || '' : ''; return name ? { hex: b.hex, name } : { hex: b.hex }; }),
    s: buf.toString('base64'), records: k / 3, stitches, jumps, trims, colourChanges: Math.max(0, d.plan.length - 1) };
}
export function decodeFrames(s) { const b = Buffer.from(s, 'base64'), a = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), out = []; for (let i = 0; i + 2 < a.length; i += 3) out.push([a[i], a[i + 1], a[i + 2]]); return out; }

// ---- the review ----
const HOOPS = [{ name: '4×4 in', w: 100, h: 100 }, { name: '5×7 in', w: 130, h: 180 }, { name: '8×8 in', w: 200, h: 200 }, { name: '14×8 in jacket-back', w: 360, h: 200 }];
const fits = (w, h, hp) => (w <= hp.w && h <= hp.h) || (w <= hp.h && h <= hp.w);
const up1 = v => Math.ceil(v * 10 - 1e-9) / 10;

// the stitches as thread on a grid (layers of thread per pixel), the thread `wMm` wide, `pr` mm a pixel; `last`, when given, gets the index of
// the last top stitch over each pixel
function threadRaster(segs, W, H, pr, wMm, last = null) {
  const lay = new Uint8Array(W * H), r = wMm / 2 / pr, s = 1 / (pr * 10);
  for (let k = 0; k < segs.length; k++) {
    const g = segs[k], top = last && !g.u && !g.run;
    const ax = g.a[0] * s + W / 2, ay = g.a[1] * s + H / 2, bx = g.b[0] * s + W / 2, by = g.b[1] * s + H / 2, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r)), y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const wx = x + .5 - ax, wy = y + .5 - ay, t = clamp((wx * dx + wy * dy) / L2), qx = wx - dx * t, qy = wy - dy * t;
      if (qx * qx + qy * qy <= r * r) { const i = y * W + x; if (lay[i] < 255) lay[i]++; if (top) last[i] = k; }
    }
  }
  return lay;
}
// 4-connected components of a 0/1 mask → { id: Int32Array, n: count }
function components(mask, W, H) {
  const id = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H); let n = 0;
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || id[s] >= 0) continue; let top = 0; stack[top++] = s; id[s] = n;
    while (top) { const p = stack[--top], x = p % W; for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < W * H && mask[q] && id[q] < 0) { id[q] = n; stack[top++] = q; } }
    n++;
  }
  return { id, n };
}
// lines of lettering: three or more shapes of a like height side by side on one baseline → [{ capMm, count }]
function letteringOf(objects) {
  const c = objects.filter(o => o.box).map((o, i) => ({ i, t: o.thread, x0: o.box[0], y0: o.box[1], x1: o.box[2], y1: o.box[3], h: o.box[3] - o.box[1], w: o.box[2] - o.box[0] }))
    .filter(o => o.h >= 8 && o.h <= 400 && o.w <= o.h * 2.2).sort((a, b) => a.x0 - b.x0);
  const par = c.map((_, i) => i), find = i => (par[i] === i ? i : (par[i] = find(par[i])));
  for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) {
    const A = c[a], B = c[b], mh = Math.max(A.h, B.h); if (B.x0 - A.x1 > mh * 1.3) break;
    if (A.t === B.t && Math.abs(A.h - B.h) <= mh * .35 && Math.abs(A.y1 - B.y1) <= mh * .25 && B.x0 - A.x1 >= -mh * .3) par[find(b)] = find(a);
  }
  const groups = new Map(); c.forEach((o, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); });
  return [...groups.values()].filter(g => g.length >= 3).map(g => { const hs = g.map(o => o.h).sort((a, b) => a - b); return { capMm: hs[Math.floor(hs.length / 2)] / 10, count: g.length }; });
}

export async function digitizeReview(d, png, { widthIn } = {}) {
  const items = [], add = (level, code, text, fix) => items.push(fix ? { level, code, text, fix } : { level, code, text });
  const o = d.settings || {}, wIn = Number(widthIn) > 0 ? Number(widthIn) : d.widthMm / 25.4, segs = segments(d);
  const resize = k => Math.min(16, up1(wIn * k)), sizeFix = k => { const w = resize(k); return w > wIn + .05 ? { widthIn: w } : null; };
  // ---- fidelity: the stitches over the artwork's own shapes ----
  const pr = Math.max(.08, d.widthMm / 1400), W = Math.max(8, Math.round(d.widthMm / pr)), H = Math.max(8, Math.round(d.heightMm / pr));
  const { data } = await sharp(png).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const sep = separate(data, W, H, { max: o.maxThreads || 12, garment: o.garment || '', softPx: 2 });
  const art = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) { const c = sep.hard[p]; if (c >= 0 && !sep.inks[c].knockout) art[p] = 1; }
  const last = new Int32Array(W * H).fill(-1), lay = threadRaster(segs, W, H, pr, .42, last);
  let nArt = 0, nSew = 0, both = 0, deep = 0; for (let p = 0; p < W * H; p++) { const a = art[p], s = lay[p] > 0; nArt += a; nSew += s; if (a && s) both++; if (lay[p] >= 5) deep++; }
  const coverage = nArt ? both / nArt : 1, overstitch = nSew ? (nSew - both) / nSew : 0, iou = nArt + nSew - both ? both / (nArt + nSew - both) : 1;
  const fidelity = { coverage: Math.round(coverage * 1000) / 1000, overstitch: Math.round(overstitch * 1000) / 1000, iou: Math.round(iou * 1000) / 1000 };
  if (iou >= .8 && coverage >= .92) add('ok', 'fidelity', `The stitches follow the artwork: ${Math.round(coverage * 100)}% of it is sewn and ${Math.round(overstitch * 100)}% of the thread lands outside its edges (pull compensation).`);
  else add(iou < .6 || coverage < .75 ? 'fail' : 'warn', 'fidelity', `The stitches miss part of the artwork: ${Math.round(coverage * 100)}% of it is sewn and ${Math.round(overstitch * 100)}% of the thread lands outside it. Look at the sew-out for shapes that are missing or have spread.`, coverage < .85 ? sizeFix(1.25) : null);
  // details too small to sew: pieces of the artwork the stitches mostly miss
  const comp = components(art, W, H), cnt = new Int32Array(comp.n), hit = new Int32Array(comp.n);
  for (let p = 0; p < W * H; p++) { const c = comp.id[p]; if (c >= 0) { cnt[c]++; if (lay[p]) hit[c]++; } }
  let lost = 0, lostMm2 = 0; for (let c = 0; c < comp.n; c++) if (hit[c] < cnt[c] * .5) { lost++; lostMm2 += cnt[c] * pr * pr; }
  if (lost) add('warn', 'small-detail', `${lost} detail${lost > 1 ? 's' : ''} of the artwork (${lostMm2 < 1 ? 'under 1' : Math.round(lostMm2)} mm² in all) ${lost > 1 ? 'are' : 'is'} under about 1 mm and will not show in thread. Enlarge the design, or drop or thicken those marks.`, sizeFix(1.5));
  // ---- density: thread laid per area, shape by shape (top stitches only) ----
  const len = new Float64Array((d.objects || []).length);
  d.plan.forEach(b => { let prev = null; for (const q of b.pts) { if (q.trim) { prev = null; continue; } if (prev && !q.jump && !q.u && !q.run && !q.tie && q.o >= 0 && q.o < len.length) len[q.o] += Math.hypot(q.p[0] - prev[0], q.p[1] - prev[1]) / 10; prev = q.p; } });
  const dens = { fill: [0, 0], satin: [0, 0] };
  (d.objects || []).forEach((ob, i) => { if (ob.areaMm2 >= 4 && dens[ob.kind]) { dens[ob.kind][0] += len[i] * .4; dens[ob.kind][1] += ob.areaMm2; } });
  const fillD = dens.fill[1] ? dens.fill[0] / dens.fill[1] : null, satD = dens.satin[1] ? dens.satin[0] / dens.satin[1] : null;
  const spm = (sts, area) => Math.round(sts / (area / 100));
  if (fillD !== null) {
    if (fillD > 1.25) add(fillD > 1.45 ? 'fail' : 'warn', 'density-high', `The fill is dense: rows ${o.rowMm} mm apart lay ${fillD.toFixed(1)} layers of thread. On a garment that puckers the fabric, makes the piece stiff as board and can break needles. 0.4 mm is the standard.`, { rowMm: .4 });
    else if (fillD < .74) add(fillD < .6 ? 'fail' : 'warn', 'density-low', `The fill is open: rows ${o.rowMm} mm apart leave the fabric showing between them${o.garment ? '' : ' (and the colour of the garment through the thread)'}. 0.4 mm covers solidly.`, { rowMm: .4 });
    else add('ok', 'density', `Fill density is right: rows ${o.rowMm} mm apart, ${fillD.toFixed(2)} layers of thread over a tatami underlay.`);
  }
  if (satD !== null && satD > 2.6) add('warn', 'density-high-satin', `The satin columns are packed tight (${satD.toFixed(1)} layers of thread): they can bunch and fray. Narrow columns sew best a little open.`, null);
  const deepPct = nSew ? deep / nSew : 0;
  if (deepPct > .04) add(deepPct > .1 ? 'fail' : 'warn', 'stacking', `${Math.round(deepPct * 100)}% of the stitched area has five or more layers of thread on top of each other: those spots go hard and can break needles. Open the fill or let the top colour knock out the one below.`, o.rowMm < .4 ? { rowMm: .4 } : null);
  // travel runs left on top: a run from one part of a shape to the next that crosses stitching already sewn, with nothing sewn over it after
  const ps = 1 / (pr * 10), at = q => clampI(Math.floor(q[1] * ps + H / 2), H) * W + clampI(Math.floor(q[0] * ps + W / 2), W);
  let travel = 0; segs.forEach((g, k) => { if (g.run) { const mid = at([(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2]); if (last[mid] >= 0 && last[mid] < k) travel += Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) / 10; } });
  if (travel > 10) add('warn', 'travel', `About ${Math.round(travel)} mm of travel stitches run across stitching that is already sewn and stay on top: they show as thin lines over the fill. A digitiser re-routes them under the part still to sew, or trims and jumps instead.`);
  // ---- thin columns and small lettering ----
  const narrow = (d.objects || []).filter(s => s.kind === 'satin' && s.widthMm < 1 && s.areaMm2 >= 1);
  if (narrow.length) {
    const thin = Math.max(.3, Math.min(...narrow.map(s => s.widthMm)));
    add(thin < .6 ? 'fail' : 'warn', 'narrow-satin', `${narrow.length} column${narrow.length > 1 ? 's are' : ' is'} narrower than 1 mm (the thinnest ${thin.toFixed(1)} mm): a satin that thin sinks into the fabric or sews as a ragged line. The design at ${resize(1 / thin)} in brings it to 1 mm; or thicken those lines in the artwork.`, sizeFix(1 / thin));
  } else if ((d.objects || []).some(s => s.kind === 'satin')) add('ok', 'narrow-satin', 'Every satin column is at least 1 mm wide.');
  const lines = letteringOf(d.objects || []);
  if (lines.length) {
    const small = lines.reduce((a, b) => (b.capMm < a.capMm ? b : a));
    if (small.capMm < 5) add(small.capMm < 3.5 ? 'fail' : 'warn', 'small-text', `Lettering ${small.capMm.toFixed(1)} mm tall: under 5 mm the letters close up (holes in e, a and o fill in) and thin strokes break. Make it at least 5 mm (${resize(5 / small.capMm)} in wide), or set it in a bolder face.`, sizeFix(5 / small.capMm));
    else add('ok', 'small-text', `Lettering is ${small.capMm.toFixed(1)} mm tall at its smallest: big enough to read in thread.`);
  }
  // ---- long satin floats ----
  const wide = (d.objects || []).filter(s => s.kind === 'satin' && s.widthMm > 7);
  if (wide.length) add('warn', 'wide-satin', `${wide.length} satin column${wide.length > 1 ? 's are' : ' is'} over 7 mm wide: long floats snag on wear and wash. Sew those as fill.`, { satinMaxMm: 6 });
  let longest = 0; const longIn = new Set(); for (const g of segs) if (!g.u && !g.tie) { const L = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]); if (L > longest) longest = L; if (L > 80 && d.objects?.[g.o]?.kind === 'satin') longIn.add(g.o); }
  if (longest > 80) {
    const w = Math.min(...[...longIn].map(i => d.objects[i].widthMm)), asFill = longIn.size && w >= 2.1 ? { satinMaxMm: Math.floor(w * 10 - 1) / 10 } : null;
    add('warn', 'long-stitch', longIn.size ? `${longIn.size} satin column${longIn.size > 1 ? 's run' : ' runs'} along ${longIn.size > 1 ? 'their' : 'its'} length in places (a ring or a curve sewn at one angle), so stitches reach ${(longest / 10).toFixed(1)} mm: long floats snag and pull. ${asFill ? 'Sewing them as fill follows the curve.' : 'Thicken the stroke or split the curve.'}` : `The longest stitch is ${(longest / 10).toFixed(1)} mm: over 8 mm a stitch catches and pulls.`, asFill || (longIn.size ? null : { stitchMm: 3.5 }));
  }
  // ---- jumps and trims ----
  let loose = 0; d.plan.forEach(b => { let prev = null, trimmed = false; for (const q of b.pts) { if (q.trim) { trimmed = true; continue; } if (q.jump && prev && !trimmed && Math.hypot(q.p[0] - prev[0], q.p[1] - prev[1]) > 30) loose++; if (!q.trim) { prev = q.p; trimmed = false; } } });
  const st = d.stats || {}, trims = st.trims || 0;
  if (loose && loose <= 4) add('ok', 'jumps', `${loose} short jump thread${loose > 1 ? 's' : ''} between parts of the design to clip after the run (or let the machine trim ${loose > 1 ? 'them' : 'it'}).`);
  else if (loose) add('warn', 'jumps', `${loose} jump thread${loose > 1 ? 's' : ''} over 3 mm ${loose > 1 ? 'are' : 'is'} left on top between shapes: someone clips ${loose > 1 ? 'them' : 'it'} by hand after the run, or the machine trims ${loose > 1 ? 'them' : 'it'} if the trim length is lowered.`, { trimMm: 3 });
  if (trims > Math.max(30, (st.stitches || 0) / 250)) add('warn', 'trims', `${trims} trims: every one stops the machine for a few seconds and leaves a tail. Fewer, larger shapes (or joining nearby marks) sew faster and cleaner.`);
  // ---- colours ----
  const cc = st.colourChanges || 0, allow = wIn < 2 ? 3 : wIn < 3.5 ? 6 : 9;
  if (cc + 1 > allow) add('warn', 'colours', `${cc + 1} thread colours at ${wIn.toFixed(1)} in: each change costs time, and at this size small areas of a colour barely read. ${allow} or fewer is usual.`, { maxThreads: allow });
  // ---- settings a digitiser would never leave ----
  if (o.underlay === false && (st.fill || 0) > 0) add('warn', 'underlay', 'No underlay under the fills: on a knit the stitches sink in and the fabric shows through. Turn the underlay on.', { underlay: true });
  if ((o.pullMm ?? .2) < .1) add('warn', 'pull', 'No pull compensation: the thread pulls each shape narrower as it sews, so edges gap where colours meet and lettering thins. 0.2 mm is standard.', { pullMm: .2 });
  // ---- size, run time, hoop ----
  const sts = st.stitches || 0, mins = st.minutes || Math.round(sts / 750);
  add(sts > 30000 ? 'fail' : sts > 20000 ? 'warn' : 'ok', 'stitches', `${sts.toLocaleString('en-US')} stitches, ${cc} colour change${cc === 1 ? '' : 's'}, ${trims} trim${trims === 1 ? '' : 's'}: about ${mins < 10 ? mins.toFixed(1) : Math.round(mins)} min a piece at 750 stitches a minute.${sts > 20000 ? ' That is heavy for a garment: the piece will be stiff. A smaller design or a lighter fill brings it down.' : ''}`, sts > 20000 ? (o.rowMm < .45 ? { rowMm: .45 } : { widthIn: Math.max(1, Math.floor(wIn * Math.sqrt(18000 / sts) * 10) / 10) }) : null);
  const hoop = HOOPS.find(hp => fits(d.widthMm, d.heightMm, hp));
  if (!hoop) add('fail', 'hoop', `At ${(d.widthMm / 25.4).toFixed(1)} × ${(d.heightMm / 25.4).toFixed(1)} in it is bigger than any garment hoop.`, { widthIn: Math.floor(wIn * Math.min(190 / Math.max(d.widthMm, d.heightMm), 1) * 10) / 10 });
  else if (hoop === HOOPS[3]) add('warn', 'hoop', `At ${(d.widthMm / 25.4).toFixed(1)} × ${(d.heightMm / 25.4).toFixed(1)} in it needs a ${hoop.name} hoop: only a jacket back or a large flat piece takes it.`, { widthIn: Math.floor(wIn * Math.min(195 / d.widthMm, 195 / d.heightMm) * 10) / 10 });
  else if (Math.max(d.widthMm, d.heightMm) < 20) add('warn', 'hoop', `At ${d.widthMm} × ${d.heightMm} mm it is very small: detail closes up and the hoop barely holds the fabric round it.`, sizeFix(25 / Math.max(d.widthMm, d.heightMm)));
  else add('ok', 'hoop', `${d.widthMm} × ${d.heightMm} mm: fits a ${hoop.name} hoop.`);
  // ---- the verdict ----
  const fails = items.filter(i => i.level === 'fail').length, warns = items.filter(i => i.level === 'warn').length;
  const score = Math.round(clamp(100 - fails * 24 - warns * 7 - Math.max(0, .9 - iou) * 60, 0, 100));
  const verdict = fails ? 'fix' : warns ? 'check' : 'ready';
  const rank = { fail: 0, warn: 1, ok: 2 }; items.sort((a, b) => rank[a.level] - rank[b.level]);
  return { score: verdict === 'ready' ? Math.max(score, 90) : verdict === 'fix' ? Math.min(score, 59) : Math.min(Math.max(score, 60), 89), verdict, fidelity, items };
}
