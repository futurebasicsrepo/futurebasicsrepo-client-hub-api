// The shapes on a flat sketch's page, shared by build.mjs (which makes the templates from the purchased pack) and clips.mjs (which
// re-cuts each view's outline from the sketches already in src/flat-templates/): the page as a mask, the views on it, and a view's outline.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), sharp = createRequire(join(ROOT, 'package.json'))('sharp');
export const S = 3; // pixels per SVG unit when measuring

export async function maskOf(file) {
  const svg = readFileSync(file), meta = await sharp(svg).metadata();
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg.toString())?.[1].trim().split(/\s+/).map(Number) || [0, 0, meta.width, meta.height];
  const { data, info } = await sharp(svg, { density: 72 * S * (vb[2] / meta.width) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, m = new Uint8Array(W * H), dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { m[i] = data[i * 4 + 3] > 100 ? 1 : 0; dark[i] = m[i] && data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] < 270 ? 1 : 0; }
  // a view drawn as lines with no white fill is still cloth inside its outline: whatever the page's edge cannot reach is filled in
  const out = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (out[i] || m[i]) continue; out[i] = 1; const x = i % W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < W * (H - 1)) st.push(i + W); }
  for (let i = 0; i < W * H; i++) if (!out[i]) m[i] = 1;
  return { m, dark, W, H, vb, k: W / vb[2], data, info };
}
// the views on the page: cut it along empty rows and columns (a row crossed only by a hanging drawcord counts as empty; a column must be
// truly empty, or a thin trouser leg would count as a gap), then, inside each piece,
// take the connected shapes after closing small gaps, for drawings laid out on a diagonal whose boxes overlap
export function views(M) {
  const { m, W, H } = M, lab = new Int32Array(W * H), out = []; let n = 0;
  const cut = (x0, y0, x1, y1, depth = 0) => {
    const rows = new Int32Array(y1 - y0 + 1), cols = new Int32Array(x1 - x0 + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (m[y * W + x]) { rows[y - y0]++; cols[x - x0]++; }
    const trim = (a) => { let i = 0, j = a.length - 1; while (i < a.length && !a[i]) i++; while (j > i && !a[j]) j--; return [i, j]; };
    const [ry0, ry1] = trim(rows), [cx0, cx1] = trim(cols); if (ry0 > ry1 || cx0 > cx1) return;
    const best = (a, i0, i1, thr) => { let b = null, s = -1; for (let i = i0; i <= i1 + 1; i++) { const empty = i <= i1 && a[i] <= thr; if (empty && s < 0) s = i; if (!empty && s >= 0) { if (s > i0 && i - s >= 3 && (!b || i - s > b[1] - b[0])) b = [s, i]; s = -1; } } return b; };
    const gr = best(rows, ry0, ry1, Math.max(1, (cx1 - cx0) * .012)), gc = best(cols, cx0, cx1, 2);
    const g = gr && (!gc || gr[1] - gr[0] >= gc[1] - gc[0]) ? ['r', gr] : gc ? ['c', gc] : null;
    if (g && depth < 8) { const [a, b] = g[1]; if (g[0] === 'r') { cut(x0, y0, x1, y0 + a - 1, depth + 1); cut(x0, y0 + b, x1, y1, depth + 1); } else { cut(x0, y0, x0 + a - 1, y1, depth + 1); cut(x0 + b, y0, x1, y1, depth + 1); } return; }
    comps(x0 + cx0, y0 + ry0, x0 + cx1, y0 + ry1);
  };
  const comps = (X0, Y0, X1, Y1) => {
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1, r = 3, d = new Uint8Array(w * h), d2 = new Uint8Array(w * h), l = new Int32Array(w * h), found = [];
    for (let y = 0; y < h; y++) { let run = 0; for (let x = w - 1; x >= -r; x--) { const on = x >= 0 && m[(y + Y0) * W + x + X0]; run = on ? r * 2 + 1 : run - 1; if (run > 0) for (let k = Math.max(0, x); k <= Math.min(w - 1, x + r); k++) d[y * w + k] = 1; } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[y * w + x]) for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) d2[k * w + x] = 1;
    let c = 0;
    for (let i = 0; i < w * h; i++) { if (!d2[i] || l[i]) continue; c++; const st = [i]; l[i] = c; let x0 = w, y0 = h, x1 = 0, y1 = 0, a = 0;
      while (st.length) { const p = st.pop(), x = p % w, y = (p / w) | 0; if (m[(y + Y0) * W + x + X0]) a++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && d2[p - 1] && !l[p - 1]) { l[p - 1] = c; st.push(p - 1); } if (x < w - 1 && d2[p + 1] && !l[p + 1]) { l[p + 1] = c; st.push(p + 1); }
        if (y > 0 && d2[p - w] && !l[p - w]) { l[p - w] = c; st.push(p - w); } if (y < h - 1 && d2[p + w] && !l[p + w]) { l[p + w] = c; st.push(p + w); } }
      found.push({ c, x0: x0 + X0, y0: y0 + Y0, x1: x1 + X0, y1: y1 + Y0, a }); }
    for (const f of found) { if (f.a < W * H * .01) continue; n++; for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) if (l[(y - Y0) * w + x - X0] === f.c && m[y * W + x]) lab[y * W + x] = n; out.push({ n, x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, a: f.a }); }
  };
  cut(0, 0, W - 1, H - 1);
  return { comps: out, lab };
}
// fewer points on an outline, none further than tol from it (Ramer–Douglas–Peucker), to keep the generated module small
export function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let far = -1, fd = tol; const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = 1; st.push([a, far], [far, b]); } }
  return pts.filter((_, i) => keep[i]);
}
// a view's own outline in SVG units, a little outside its cloth: the edge of its shape traced all the way round, so the gap between two
// sleeves stays out of it (a neighbouring view's collar or hem that reaches into the box there is not drawn with this view)
export function outlineOf(M, lab, c) {
  const pad = Math.max(1, Math.round(2 * M.k)), ox = c.x0 - pad - 1, oy = c.y0 - pad - 1, w = c.x1 - c.x0 + 1 + 2 * (pad + 1), h = c.y1 - c.y0 + 1 + 2 * (pad + 1);
  const A = new Uint8Array(w * h), B = new Uint8Array(w * h), C = new Uint8Array(w * h);
  for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) { const i = y * M.W + x; if (M.m[i] && lab[i] === c.n) A[(y - oy) * w + x - ox] = 1; }
  // grown by the pad: across, then down
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (A[y * w + x]) last = x; if (x - last <= pad) B[y * w + x] = 1; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (A[y * w + x]) last = x; if (last - x <= pad) B[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (B[y * w + x]) last = y; if (y - last <= pad) C[y * w + x] = 1; } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (B[y * w + x]) last = y; if (last - y <= pad) C[y * w + x] = 1; } }
  // traced round from its top-left pixel, keeping the shape on the right (Moore neighbours, clockwise)
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && C[y * w + x], D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let s = C.indexOf(1); if (s < 0) return null;
  const sx = s % w, sy = (s / w) | 0, pts = [[sx, sy]]; let px = sx, py = sy, last = 0;
  for (let guard = 0; guard < w * h * 2; guard++) {
    let d = -1; for (let k = 0; k < 8; k++) { const q = (last + 6 + k) % 8; if (on(px + D[q][0], py + D[q][1])) { d = q; break; } }
    if (d < 0) break; px += D[d][0]; py += D[d][1]; last = d;
    if (px === sx && py === sy) break; pts.push([px, py]);
  }
  const U = ([x, y]) => [+((x + ox) / M.k + M.vb[0]).toFixed(2), +((y + oy) / M.k + M.vb[1]).toFixed(2)], P = pts.map(U);
  // a closed line: simplified in two halves, split at the point furthest from where it starts
  let far = 0, fd = -1; for (let i = 0; i < P.length; i++) { const dd = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (dd > fd) { fd = dd; far = i; } }
  return [...simplify(P.slice(0, far + 1), .8), ...simplify([...P.slice(far), P[0]], .8).slice(1, -1)];
}
