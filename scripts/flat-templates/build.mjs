// Builds the Design Lab's flat templates from the purchased flat-sketch pack (Kyle's Google Drive: "Mens Sketches", "Womans Sketches" and
// "Accessories, Pockets, Zippers"). Every drawing listed in catalogue.tsv (its style and name, read by eye from the pack) becomes a template:
// the SVG is copied into src/flat-templates/, its front and back views are found on the page and measured from their silhouettes (centre
// front, high point of the shoulder or top of the waistband, chest or waist width, length, its own outline), and a thumbnail is made for the
// picker. The add-on sheets in parts.tsv are cut into single parts (pockets, zips, collars, trims, buttons) that can be placed on any flat.
// Writes src/lab-flat-templates.js and src/lab-flat-parts.js.
//   node scripts/flat-templates/build.mjs <folder the pack was downloaded to (all/, womens/, acc/)>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), HERE = dirname(fileURLToPath(import.meta.url)), sharp = createRequire(join(ROOT, 'package.json'))('sharp');
const SRC = process.argv[2]; if (!SRC) { console.error('usage: build.mjs <download folder>'); process.exit(1); }
const tsv = f => readFileSync(join(HERE, f), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
// [source file, style, name, template id, range]
const PICK = tsv('catalogue.tsv');
// the sample-size measurements each style is drawn to (the same as src/lab-flats.js, size M, regular fit), for the first look of each drawing
const KIND = { tee: 'top', longsleeve: 'top', crewneck: 'top', hoodie: 'top', ziphoodie: 'top', jacket: 'top', shirt: 'top', shirtss: 'top', polo: 'top', tank: 'top', vest: 'top', coat: 'top', dress: 'top', bodysuit: 'top', swimsuit: 'top', bra: 'top', cami: 'top', bikini: 'bikini', pants: 'bottom', shorts: 'bottom', skirt: 'bottom', leggings: 'bottom', cap: 'cap', bucket: 'cap' };
const S = 3; // pixels per SVG unit when measuring

async function maskOf(file) {
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
function views(M) {
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
// the front and the back: the two pieces most alike in size; the front is the upper-left one
function frontBack(comps) {
  let best = null;
  for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
    const a = comps[i], b = comps[j], wa = a.x1 - a.x0, wb = b.x1 - b.x0, ha = a.y1 - a.y0, hb = b.y1 - b.y0;
    const diff = Math.abs(wa - wb) / Math.max(wa, wb) + Math.abs(ha - hb) / Math.max(ha, hb); if (!best || diff < best.diff) best = { diff, a, b };
  }
  if (!best || best.diff > .35) return { front: comps.sort((p, q) => q.a - p.a)[0], back: null };
  const [f, k] = (best.a.x0 + best.a.y0 * .6) <= (best.b.x0 + best.b.y0 * .6) ? [best.a, best.b] : [best.b, best.a];
  return { front: f, back: k };
}
// one view measured, in SVG units: the centre line, and for a top the body width under the arms, the shoulder line and the hem;
// for a bottom the waistband width, its top and the hem; for a cap the crown width and the brim seam
function measure(M, lab, c, kind, collar) {
  const { m, W } = M, rows = [];
  for (let y = c.y0; y <= c.y1; y++) { const runs = []; let s = -1; for (let x = c.x0; x <= c.x1 + 1; x++) { const on = x <= c.x1 && m[y * W + x] && lab[y * W + x] === c.n; if (on && s < 0) s = x; if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; } } rows.push({ y, runs }); }
  const cf = (c.x0 + c.x1) / 2, central = r => r.runs.find(([a, b]) => a <= cf && b >= cf) || null, wd = r => { const q = central(r); return q ? q[1] - q[0] + 1 : 0; };
  const pick = (a, f) => { const v = a.filter(Boolean).sort((p, q) => p - q); return v[Math.floor(v.length * f)] || 0; };
  const U = v => +(v / M.k).toFixed(2), X = v => +(v / M.k + M.vb[0]).toFixed(2), Y = v => +(v / M.k + M.vb[1]).toFixed(2);
  const out = { box: [X(c.x0), Y(c.y0), U(c.x1 - c.x0 + 1), U(c.y1 - c.y0 + 1)], cf: X(cf) };
  // the hem: the lowest row on the centre line for a top; for a bottom the legs part below the crotch, so the lowest row of either leg
  let hem = rows.length - 1; while (hem > 0 && !(kind === 'bottom' ? rows[hem].runs.length : wd(rows[hem]))) hem--;
  if (kind === 'top') {
    // the body's width is between its side seams: walking out from the centre line along each row of the lower body, the first dark line
    // either side is a side seam (or the outline, where the sleeves hang free); a pocket or a zip stops it short, so take a high percentile
    // a placket, a zip or a row of buttons near the centre would stop the walk short, so a body narrower than 45% of the view (sleeves
    // included) is measured again starting further out
    const first = rows.findIndex(r => wd(r) > 0), span = hem - first;
    const chestFrom = f => { const off = Math.round((c.x1 - c.x0) * f), side = (y, dir) => { for (let x = Math.round(cf) + dir * off; x >= c.x0 && x <= c.x1; x += dir) if (M.dark[y * W + x] || !m[y * W + x]) return x; return dir < 0 ? c.x0 : c.x1; }, ws = [];
      for (let i = first + Math.round(span * .35); i < hem - Math.round(span * .08); i++) ws.push(side(rows[i].y, 1) - side(rows[i].y, -1)); return pick(ws, .6); };
    let chest = 0; for (const f of [.03, .1, .16, .22]) { chest = chestFrom(f); if (chest >= (c.x1 - c.x0) * .45) break; }
    let sh = rows.findIndex(r => wd(r) >= chest * .8); if (sh < 0) sh = 0;
    // the high point of the shoulder: under a hood or a tall collar it is hidden, so it is found from the shoulder line; on a crew or a
    // v-neck it is just under the back neck seen over the front (an inch is about chest / 22 on the drawing)
    const inch = chest / 22, hps = collar === 'hood' ? rows[sh].y - inch * .5 : collar === 'tall' ? Math.min(rows[sh].y, c.y0 + inch * 1.6) : Math.min(rows[sh].y, c.y0 + inch * .35);
    Object.assign(out, { chest: U(chest), hpsY: Y(hps), shoulderY: Y(rows[sh].y), hemY: Y(rows[hem].y), topY: Y(c.y0) });
  } else if (kind === 'bikini') {
    // a bikini is drawn as its top over its bottom: the top's width is the widest row of the upper piece, the set runs from the top of the
    // straps to the bottom of the brief
    const gap = rows.findIndex((r, i) => i > rows.length * .15 && !r.runs.length), upper = rows.slice(0, gap > 0 ? gap : Math.round(rows.length * .5));
    const ws = upper.map(r => r.runs.length ? r.runs[r.runs.length - 1][1] - r.runs[0][0] + 1 : 0), widest = ws.indexOf(Math.max(...ws));
    Object.assign(out, { chest: U(ws[widest]), hpsY: Y(c.y0), shoulderY: Y(c.y0), hemY: Y(rows[hem].y), topY: Y(c.y0) });
  } else if (kind === 'bottom') {
    // the top of the waistband: the first row nearly as wide as the band (a belt loop, a label or a drawcord above it does not count)
    const bandW = Math.max(...rows.slice(0, Math.round(rows.length * .15)).map(wd)); let top = 0; while (top < rows.length && wd(rows[top]) < bandW * .8) top++;
    const band = rows.slice(top + 2, top + 2 + Math.max(3, Math.round(rows.length * .02))).map(wd);
    Object.assign(out, { waist: U(pick(band, .5)), topY: Y(rows[top].y), hemY: Y(rows[hem].y) });
  } else {
    // the crown is the widest part above the brim; the brim seam is where the width falls away under it
    const ws = rows.map(r => r.runs.length ? r.runs[r.runs.length - 1][1] - r.runs[0][0] + 1 : 0), widest = ws.indexOf(Math.max(...ws));
    Object.assign(out, { width: U(ws[widest]), seamY: Y(rows[widest].y), topY: Y(c.y0), hemY: Y(rows[hem].y) });
  }
  // the view's own outline (each row from its leftmost to its rightmost cloth, a little outside), so a neighbouring view or a drawcord
  // that reaches into its box is not drawn with it
  const pad = 2 * M.k, stepR = Math.max(1, Math.round(rows.length / 90)), L = [], R = [];
  for (let i = 0; i < rows.length; i += stepR) { const band = rows.slice(i, i + stepR).flatMap(r => r.runs); if (!band.length) continue; const y = rows[i].y;
    L.push([X(Math.max(c.x0, Math.min(...band.map(q => q[0])) - pad)), Y(y)]); R.push([X(Math.min(c.x1 + 1, Math.max(...band.map(q => q[1])) + pad)), Y(y)]); }
  if (L.length) { const yTop = Y(c.y0 - pad), yBot = Y(c.y1 + 1 + pad); L.unshift([L[0][0], yTop]); R.unshift([R[0][0], yTop]); L.push([L[L.length - 1][0], yBot]); R.push([R[R.length - 1][0], yBot]); out.clip = simplify([...L, ...R.reverse()], .8); }
  // the drawing's own proportions: a top's length from its chest, a bottom's from its waist, so a piece drawn from it starts at its length
  if (out.chest && out.hemY > out.hpsY) out.ratio = +((out.hemY - out.hpsY) / out.chest).toFixed(3);
  if (out.waist && out.hemY > out.topY) out.ratio = +((out.hemY - out.topY) / out.waist).toFixed(3);
  return out;
}
// fewer points on an outline, none further than tol from it (Ramer–Douglas–Peucker), to keep the generated module small
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let far = -1, fd = tol; const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = 1; st.push([a, far], [far, b]); } }
  return pts.filter((_, i) => keep[i]);
}
// a bikini's views: its top and bottom are separate pieces, the front ones on the left and the back ones on the right
function sideGroups(comps, lab, W) {
  if (comps.length < 2) return { front: comps[0] || null, back: null };
  const cx = c => (c.x0 + c.x1) / 2, sorted = [...comps].sort((a, b) => cx(a) - cx(b)); let cut = 1, gap = -1;
  for (let i = 1; i < sorted.length; i++) { const g = cx(sorted[i]) - cx(sorted[i - 1]); if (g > gap) { gap = g; cut = i; } }
  const merge = (list, n) => { for (const c of list) for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * W + x] === c.n) lab[y * W + x] = n;
    return { n, x0: Math.min(...list.map(c => c.x0)), y0: Math.min(...list.map(c => c.y0)), x1: Math.max(...list.map(c => c.x1)), y1: Math.max(...list.map(c => c.y1)), a: list.reduce((s, c) => s + c.a, 0) }; };
  return { front: merge(sorted.slice(0, cut), 9001), back: merge(sorted.slice(cut), 9002) };
}
// the picker's picture of a template: its front view, small (cut from the picture already made to measure it)
async function thumb(M, t, out) {
  const [px, py] = t.page, [bx, by, bw, bh] = t.views.front.box, sc = M.k, pad = 4 * sc;
  const left = Math.max(0, Math.round((bx - px) * sc - pad)), top = Math.max(0, Math.round((by - py) * sc - pad));
  await sharp(M.data, { raw: { width: M.info.width, height: M.info.height, channels: 4 } }).extract({ left, top, width: Math.min(M.W - left, Math.round(bw * sc + pad * 2)), height: Math.min(M.H - top, Math.round(bh * sc + pad * 2)) })
    .flatten({ background: '#ffffff' }).resize(180, 180, { fit: 'contain', background: '#ffffff' }).webp({ quality: 72 }).toFile(out);
}
// the same drawing without its whitespace, comments and editor metadata (the paths are left exactly as drawn)
const tidy = svg => svg.replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<metadata[\s\S]*?<\/metadata>/g, '').replace(/>\s+</g, '><').replace(/[ \t]*\n[ \t]*/g, ' ').trim();
// a picture of each view with what was measured on it, to check by eye
async function proof(file, t, out) {
  const svg = readFileSync(file).toString(), [vx, vy, vw, vh] = t.page, ln = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.2"/>`;
  let marks = '';
  for (const [name, v] of Object.entries(t.views)) {
    const [bx, by, bw, bh] = v.box; marks += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#2a6df4" stroke-width=".8"/><text x="${bx}" y="${by - 3}" font-size="10" fill="#2a6df4">${name}</text>` + ln(v.cf, by, v.cf, by + bh, '#2a6df4');
    if (v.chest) { const y = (v.shoulderY + v.hemY) / 2; marks += ln(bx - 6, v.hpsY, bx + bw + 6, v.hpsY, '#f59e0b'); marks += ln(v.cf - v.chest / 2, y, v.cf + v.chest / 2, y, '#e0218a') + ln(bx, v.shoulderY, bx + bw, v.shoulderY, '#e0218a') + ln(bx, v.hemY, bx + bw, v.hemY, '#17a34a'); }
    if (v.waist) marks += ln(v.cf - v.waist / 2, v.topY + 3, v.cf + v.waist / 2, v.topY + 3, '#e0218a') + ln(bx, v.hemY, bx + bw, v.hemY, '#17a34a');
    if (v.width) marks += ln(v.cf - v.width / 2, v.seamY, v.cf + v.width / 2, v.seamY, '#e0218a');
  }
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.page.join(' ')}" width="${Math.round(vw * 1.2)}" height="${Math.round(vh * 1.2)}">${marks}</svg>`);
  const base = await sharp(Buffer.from(svg), { density: 72 * 1.2 * vw / (await sharp(Buffer.from(svg)).metadata()).width }).resize(Math.round(vw * 1.2), Math.round(vh * 1.2)).flatten({ background: '#d8d8dc' }).png().toBuffer();
  await sharp(base).composite([{ input: over }]).png().toFile(out);
}

const T = [], skipped = [], DIR = join(ROOT, 'src', 'flat-templates'), THUMBS = join(DIR, 'thumbs'); mkdirSync(THUMBS, { recursive: true });
// the drawings are measured by four processes at once (rasterising a sketch takes seconds); each writes what it found, and the first puts it together
const SHARDS = Number(process.env.SHARDS || 4), SHARD = process.env.SHARD, TMP = join(HERE, '.build');
if (SHARD === undefined && !process.env.ONLY) {
  mkdirSync(TMP, { recursive: true });
  const { spawn } = await import('node:child_process');
  await Promise.all(Array.from({ length: SHARDS }, (_, i) => new Promise((ok, no) => spawn(process.execPath, [fileURLToPath(import.meta.url), SRC], { env: { ...process.env, SHARD: String(i), SKIP_PARTS: '1' }, stdio: 'inherit' }).on('exit', c => c ? no(new Error('shard ' + i + ' failed')) : ok()))));
}
const keepFiles = new Set();
const mine = PICK.filter((q, i) => (process.env.ONLY ? process.env.ONLY.split(',').includes(q[3]) : SHARD !== undefined ? i % SHARDS === Number(SHARD) : false));
for (const [file, style, label, id, range] of mine) {
  const path = join(SRC, file); if (!existsSync(path)) { skipped.push([id, 'missing']); continue; }
  const kind = KIND[style]; if (!kind) { skipped.push([id, 'no kind for ' + style]); continue; }
  const M = await maskOf(path), { comps, lab } = views(M), fb = kind === 'bikini' ? sideGroups(comps, lab, M.W) : frontBack(comps);
  if (!fb.front) { skipped.push([id, 'no views']); continue; }
  // a front and back drawn overlapping (on a diagonal, sleeve over sleeve) come out as one shape far wider than tall: cut it at its thinnest column
  if (!fb.back && kind !== 'bikini' && kind !== 'cap' && (fb.front.x1 - fb.front.x0) > (fb.front.y1 - fb.front.y0) * 1.4) {
    const c = fb.front, cols = []; for (let x = c.x0; x <= c.x1; x++) { let n = 0; for (let y = c.y0; y <= c.y1; y++) if (lab[y * M.W + x] === c.n) n++; cols.push(n); }
    const from = Math.round(cols.length * .3), to = Math.round(cols.length * .7); let cut = from; for (let i = from; i < to; i++) if (cols[i] < cols[cut]) cut = i;
    const X = c.x0 + cut, part = (x0, x1, n) => { let y0 = M.H, y1 = 0, a = 0; for (let y = c.y0; y <= c.y1; y++) for (let x = x0; x <= x1; x++) if (lab[y * M.W + x] === c.n) { lab[y * M.W + x] = n; a++; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { n, x0, x1, y0, y1, a }; };
    const L = part(c.x0, X, 9101), R = part(X + 1, c.x1, 9102);
    if (Math.abs((L.y1 - L.y0) - (R.y1 - R.y0)) / Math.max(L.y1 - L.y0, R.y1 - R.y0) < .4) { fb.front = L; fb.back = R; }
  }
  const collar = /hoodie/.test(style) || /hood/i.test(label) ? 'hood' : ['jacket', 'coat', 'shirt', 'shirtss', 'polo'].includes(style) || /collar|mock|funnel|turtle|high-neck|stand/i.test(label) ? 'tall' : 'crew';
  const mk = kind === 'bikini' ? 'bikini' : kind, v = { front: measure(M, lab, fb.front, mk, collar) }; if (fb.back) v.back = measure(M, lab, fb.back, mk, collar);
  const ok = view => kind === 'cap' ? view.width > 0 && view.seamY : (kind === 'bottom' ? view.waist > 0 : view.chest > 0) && view.ratio > .25 && view.ratio < 6;
  if (!ok(v.front)) { skipped.push([id, 'measure ' + JSON.stringify({ chest: v.front.chest, waist: v.front.waist, ratio: v.front.ratio })]); continue; }
  if (v.back && !ok(v.back)) delete v.back;
  writeFileSync(join(DIR, `${id}.svg`), tidy(readFileSync(path, 'utf8'))); keepFiles.add(`${id}.svg`);
  const t = { id, style, label, range, file: `${id}.svg`, page: M.vb, views: v }; T.push(t);
  await thumb(M, t, join(THUMBS, `${id}.webp`));
  if (process.env.PROOF_DIR) await proof(path, t, join(process.env.PROOF_DIR, `${id}.png`));
  console.log(id, Object.keys(v).join('+'), JSON.stringify({ chest: v.front.chest, waist: v.front.waist, ratio: v.front.ratio }));
}
if (SHARD !== undefined) { writeFileSync(join(TMP, `${SHARD}.json`), JSON.stringify({ T, skipped })); process.exit(0); }
if (!process.env.ONLY) {
  // put the shards together in the catalogue's order, and drop sketches no longer in it
  for (let i = 0; i < SHARDS; i++) { const r = JSON.parse(readFileSync(join(TMP, `${i}.json`), 'utf8')); T.push(...r.T); skipped.push(...r.skipped); }
  const order = new Map(PICK.map((q, i) => [q[3], i])); T.sort((a, b) => order.get(a.id) - order.get(b.id));
  const keep = new Set(T.map(t => t.file)); for (const f of readdirSync(DIR)) if (f.endsWith('.svg') && !keep.has(f)) unlinkSync(join(DIR, f));
  const keepT = new Set(T.map(t => `${t.id}.webp`)); for (const f of readdirSync(THUMBS)) if (!keepT.has(f)) unlinkSync(join(THUMBS, f));
  rmSync(TMP, { recursive: true, force: true });
}
writeFileSync(join(ROOT, 'src', 'lab-flat-templates.js'), `// Generated by scripts/flat-templates/build.mjs from the flat-sketch pack: which drawing is which style, where its front and back views are on its page,
// and what each view measures (SVG units), so src/lab-flats.js can line it up with a piece's measurements. Do not edit by hand: change the script and run it again.
export const FLAT_TEMPLATES = [\n${T.map(t => JSON.stringify(t)).join(',\n')}\n];
`);
console.log('templates', T.length, 'skipped', skipped.length); for (const s of skipped) console.log('  skipped', ...s);

// ---- the add-on parts: every pocket, zip, collar, trim and button on the add-on sheets, cut out one by one ----
const PART_KIND = { pockets: 'Pocket', zips: 'Zip', collars: 'Collar', trims: 'Trim', buttons: 'Button' };
const PART_WIDTH = { pockets: 6, zips: .75, collars: 7, trims: 8, buttons: .6 }; // the width a part is first placed at, in inches
const PARTS = [], PDIR = join(ROOT, 'src', 'flat-parts'); mkdirSync(PDIR, { recursive: true }); if (!process.env.SKIP_PARTS) for (const f of readdirSync(PDIR)) unlinkSync(join(PDIR, f));
let sheetNo = 0;
for (const [file, kind] of process.env.SKIP_PARTS ? [] : tsv('parts.tsv')) {
  sheetNo++; const path = join(SRC, file); if (!existsSync(path)) continue;
  const M = await maskOf(path), { m, W, H } = M, r = 4, lab = new Int32Array(W * H), d = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) d[yy * W + xx] = 1;
  const found = []; let n = 0;
  for (let i = 0; i < W * H; i++) { if (!d[i] || lab[i]) continue; n++; const st = [i]; lab[i] = n; let x0 = W, y0 = H, x1 = 0, y1 = 0, a = 0;
    while (st.length) { const q = st.pop(), x = q % W, y = (q / W) | 0; if (m[q]) a++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const nb of [q - 1, q + 1, q - W, q + W]) if (nb >= 0 && nb < W * H && d[nb] && !lab[nb] && Math.abs((nb % W) - x) <= 1) { lab[nb] = n; st.push(nb); } }
    found.push({ n, x0, y0, x1, y1, a }); }
  // the sheet's title along the top is not a part; nor are specks
  const parts = found.filter(f => f.a > W * H * .00015 && f.y0 > H * .055 && (f.x1 - f.x0) > 6 && (f.y1 - f.y0) > 6);
  const k = 6, img = await sharp(readFileSync(path), { density: 72 * k * M.vb[2] / (await sharp(readFileSync(path)).metadata()).width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const IW = img.info.width, s2 = IW / W; let j = 0;
  for (const f of parts.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const L = Math.floor(f.x0 * s2), Tp = Math.floor(f.y0 * s2), w = Math.ceil((f.x1 - f.x0 + 1) * s2), h = Math.ceil((f.y1 - f.y0 + 1) * s2), px = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = L + x, sy = Tp + y, mi = Math.min(H - 1, (sy / s2) | 0) * W + Math.min(W - 1, (sx / s2) | 0), o = (y * w + x) * 4, si = (sy * IW + sx) * 4;
      if (sx < IW && sy < img.info.height && lab[mi] === f.n) { px[o] = img.data[si]; px[o + 1] = img.data[si + 1]; px[o + 2] = img.data[si + 2]; px[o + 3] = img.data[si + 3]; } }
    const scale = Math.min(1, 520 / Math.max(w, h)), id = `${kind}-${sheetNo}-${++j}`;
    await sharp(px, { raw: { width: w, height: h, channels: 4 } }).resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))).webp({ quality: 85, alphaQuality: 90 }).toFile(join(PDIR, `${id}.webp`));
    PARTS.push({ id, kind, label: `${PART_KIND[kind] || 'Part'} ${PARTS.filter(q => q.kind === kind).length + 1}`, file: `${id}.webp`, aspect: +((f.x1 - f.x0 + 1) / (f.y1 - f.y0 + 1)).toFixed(3), width: PART_WIDTH[kind] || 4 });
  }
}
if (!process.env.SKIP_PARTS) writeFileSync(join(ROOT, 'src', 'lab-flat-parts.js'), `// Generated by scripts/flat-templates/build.mjs from the add-on sheets of the flat-sketch pack: every pocket, zip, collar, trim and button,
// cut out as its own picture, to place on a flat. aspect is width over height; width is the size it is first placed at, in inches.
export const PART_KINDS = ${JSON.stringify(PART_KIND)};
export const FLAT_PARTS = [\n${PARTS.map(q => JSON.stringify(q)).join(',\n')}\n];
`);
console.log('parts', PARTS.length);
