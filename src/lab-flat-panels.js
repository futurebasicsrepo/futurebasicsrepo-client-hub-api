// A panel of a flat sketch, found by a tap: the sleeve, the hood, a cuff, the body. The sketch is drawn into pixels; the panel is everything a
// flood from the tapped point reaches without crossing one of the sketch's dark lines (seams, outlines). Its outline is traced and thinned
// into a polygon, which the flats keep as a colour block (src/lab-flats.html), so a panel is coloured exactly to its seams.
// Light greys (fold shading) and dashed topstitching do not stop the flood: only solid dark lines do, thickened a pixel or two so a hairline
// gap in a seam does not let the colour into the next panel. A tap outside the garment, or on a line with no panel by it, finds nothing.
//
//   panelAt({ data, width, height }, x, y)   RGBA pixels and a tapped pixel → { pts: [[x, y], …] (pixels, clockwise), area, box } or null
//   panelName(box, view)                     a first name for it from where it sits: Hood, Sleeve, Cuff, Hem rib, Body (the person can rename it)

const DARK = 100, CLOSE = 1, MAX_PTS = 220;

function walls(data, W, H, dark = DARK, close = CLOSE, thin = 0) {
  const n = W * H, line = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) { const a = data[p + 3]; if (a > 60 && (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) < dark) line[i] = 1; }
  // rib knit: drawn as close, thin upright stripes. With `thin`, a stripe no wider than that is not a wall, so the band floods as one panel
  if (thin) for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!line[y * W + x]) { x++; continue; } let e = x; while (e < W && line[y * W + e]) e++; if (e - x <= thin) for (let k = x; k < e; k++) line[y * W + k] = 0; x = e; } }
  if (!close) return line;
  const wall = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!line[y * W + x]) continue;
    for (let dy = -close; dy <= close; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -close; dx <= close; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) wall[yy * W + xx] = 1; } }
  }
  return wall;
}

const sliver = (r, W) => r && (r.box.x1 - r.box.x0 + 1) * 6 < (r.box.y1 - r.box.y0 + 1) && (r.box.x1 - r.box.x0 + 1) < W * .04;
// the stripes of a rib side by side: from one stripe, step across the line to the next one each way and keep it while it is a sliver of about the
// same height; then each row is filled from its first stripe to its last, so the lines between them are part of the band
function ribBand(wall, W, H, first) {
  const parts = [first], h0 = first.box.y1 - first.box.y0, same = r => r && sliver(r, W) && Math.abs((r.box.y1 - r.box.y0) - h0) < h0 * .35 && Math.abs(r.box.y0 - first.box.y0) < h0 * .35;
  for (const dir of [-1, 1]) {
    let cur = first;
    for (let k = 0; k < 400; k++) {
      const y = Math.round((cur.box.y0 + cur.box.y1) / 2); let x = dir < 0 ? cur.box.x0 - 1 : cur.box.x1 + 1;
      while (x >= 0 && x < W && wall[y * W + x] && Math.abs(x - (dir < 0 ? cur.box.x0 : cur.box.x1)) < W * .02) x += dir;
      if (x < 0 || x >= W || wall[y * W + x]) break;
      const nx = flood(wall, W, H, x, y); if (!same(nx)) break; parts.push(nx); cur = nx;
    }
  }
  if (parts.length < 3) return first;
  const seen = new Uint8Array(W * H); let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const r of parts) for (let y = r.box.y0; y <= r.box.y1; y++) for (let x = r.box.x0; x <= r.box.x1; x++) if (r.seen[y * W + x]) { seen[y * W + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  let area = 0;
  for (let y = y0; y <= y1; y++) { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (seen[y * W + x]) { if (a < 0) a = x; b = x; } if (a >= 0) for (let x = a; x <= b; x++) { if (!seen[y * W + x]) seen[y * W + x] = 1; area++; } }
  return { seen, area, box: { x0, y0, x1, y1 } };
}
// the region a flood from (x, y) reaches; null when it reaches the edge of the picture (the tap was outside the garment)
function flood(wall, W, H, x, y) {
  const n = W * H, seen = new Uint8Array(n), stack = new Int32Array(n); let top = 0, area = 0, open = false;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const start = y * W + x; if (wall[start]) return null;
  seen[start] = 1; stack[top++] = start;
  while (top) {
    const i = stack[--top], px = i % W, py = (i - px) / W; area++;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    if (px === 0 || py === 0 || px === W - 1 || py === H - 1) open = true;
    const nb = [px > 0 ? i - 1 : -1, px < W - 1 ? i + 1 : -1, py > 0 ? i - W : -1, py < H - 1 ? i + W : -1];
    for (const j of nb) if (j >= 0 && !seen[j] && !wall[j]) { seen[j] = 1; stack[top++] = j; }
  }
  return open ? null : { seen, area, box: { x0, y0, x1, y1 } };
}

// the panel grown into the lines round it, so its colour runs under its own seams rather than stopping short of them
function grow(seen, W, H, by) {
  if (!by) return seen;
  const out = new Uint8Array(seen.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!seen[y * W + x]) continue;
    for (let dy = -by; dy <= by; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -by; dx <= by; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) out[yy * W + xx] = 1; } }
  }
  return out;
}

// the outer edge of a region, as pixel corners in order. Each inside pixel with an outside neighbour gives one edge of the border, pointed so
// the inside is on its right (clockwise on screen); the edges are chained from the top-left corner of the topmost, leftmost pixel, which is
// always on the outer edge, so holes (a pocket drawn inside the body) are left to the outline round them
export function trace(m, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
  const K = (x, y) => y * (W + 1) + x, out = new Map(), add = (ax, ay, bx, by) => { const k = K(ax, ay); const l = out.get(k); const e = [bx, by, bx - ax, by - ay]; if (l) l.push(e); else out.set(k, [e]); };
  let sx = -1, sy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    if (sx < 0) { sx = x; sy = y; }
    if (!at(x, y - 1)) add(x, y, x + 1, y);
    if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) add(x, y + 1, x, y);
  }
  if (sx < 0) return [];
  const pts = []; let x = sx, y = sy, dx = 1, dy = 0; const limit = out.size * 2 + 8;
  for (let step = 0; step < limit; step++) {
    pts.push([x, y]);
    const l = out.get(K(x, y)); if (!l || !l.length) break;
    // where two edges leave one corner (pixels meeting only at a corner), take the sharpest right turn, so the walk stays on its own pixel
    let k = 0; if (l.length > 1) { const score = e => { const cr = dx * e[3] - dy * e[2], dot = dx * e[2] + dy * e[3]; return cr > 0 ? 0 : dot > 0 ? 1 : 2; }; l.sort((a, b) => score(a) - score(b)); }
    const e = l.splice(k, 1)[0]; x = e[0]; y = e[1]; dx = e[2]; dy = e[3];
    if (x === sx && y === sy) break;
  }
  return pts;
}

// fewer points, the same shape: Douglas–Peucker to within `eps` pixels
function thin(pts, eps) {
  if (pts.length < 4) return pts;
  const d2 = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy; if (!L) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)); return (p[0] - a[0] - t * vx) ** 2 + (p[1] - a[1] - t * vy) ** 2; };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let k = -1, best = eps * eps;
    for (let i = a + 1; i < b; i++) { const v = d2(pts[i], pts[a], pts[b]); if (v > best) { best = v; k = i; } }
    if (k > 0) { keep[k] = 1; st.push([a, k], [k, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function panelAt(img, x, y, { dark = DARK, close = CLOSE, grow: by = CLOSE + 1, minArea = 30 } = {}) {
  const { data, width: W, height: H } = img; x = Math.round(x); y = Math.round(y);
  if (!(x >= 0 && y >= 0 && x < W && y < H)) return null;
  const wall = walls(data, W, H, dark, close);
  // a tap on a line: the nearest open pixel within a few pixels
  let sx = x, sy = y;
  if (wall[y * W + x]) {
    let found = false;
    for (let r = 1; r <= 6 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && !wall[yy * W + xx]) { sx = xx; sy = yy; found = true; break; } }
    if (!found) return null;
  }
  let f = flood(wall, W, H, sx, sy);
  // a sliver taller than it is wide is one stripe of a rib (a cuff, a hem band, a collar): the band is the panel, stripes and all
  if (sliver(f, W)) f = ribBand(wall, W, H, f);
  if (!f || f.area < minArea) return null;
  const m = grow(f.seen, W, H, by), raw = trace(m, W, H);
  let eps = 0.75, pts = thin(raw, eps);
  while (pts.length > MAX_PTS && eps < 20) { eps *= 1.5; pts = thin(raw, eps); }
  if (pts.length < 3) return null;
  return { pts, area: f.area, box: f.box };
}

// a first name for a panel from where it sits, in inches on the flat: x from the centre line, y down from the top of the piece (the HPS on a
// top). half: half the chest or waist; length: the body length
export function panelName({ x0, x1, y0, y1 }, { kind = 'top', half = 11, length = 27 } = {}) {
  const cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0;
  if (kind !== 'top') return Math.abs(cx) > half * .25 && w < half * 1.1 ? 'Leg' : y0 < length * .12 && h < length * .2 ? 'Waistband' : 'Panel';
  if (y1 < length * .12 && w < half * 1.6) return 'Hood';
  if (Math.abs(cx) > half * .95) return h < length * .2 && y0 > length * .55 ? 'Cuff' : 'Sleeve';
  if (y0 > length * .82 && h < length * .2) return 'Hem rib';
  if (y1 < length * .2 && h < length * .2) return 'Collar';
  return 'Body';
}
