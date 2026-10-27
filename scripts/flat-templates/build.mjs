// Builds the Design Lab's flat templates from the purchased flat-sketch pack (Kyle's Google Drive, "Mens Sketches" and "Hats").
// For each chosen drawing: copy the SVG into src/flat-templates/, find its front and back views on the page, and measure each view from its
// silhouette (centre front, high point of the shoulder or top of the waistband, chest or waist width, length, body and sleeve areas), so the
// flats page can line the drawing up with the piece's measurements in inches. Writes src/lab-flat-templates.js.
//   node scripts/flat-templates/build.mjs <folder with the downloaded SVGs>
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), sharp = createRequire(join(ROOT, 'package.json'))('sharp');
const SRC = process.argv[2]; if (!SRC) { console.error('usage: build.mjs <svg folder>'); process.exit(1); }
// [id, style, label, source file]
const PICK = [
  ['tee-classic', 'tee', 'Classic tee', 'Package01-01.svg'], ['tee-oversized', 'tee', 'Oversized tee', 'Package01-02.svg'], ['tee-boxy', 'tee', 'Boxy cropped tee', 'Package01-03.svg'],
  ['tee-raglan', 'tee', 'Raglan tee', 'Package04__Packge 04-08.svg'], ['tee-vneck', 'tee', 'V-neck tee', 'Package07__Package 07-38.svg'],
  ['ls-crew', 'longsleeve', 'Long-sleeve tee', 'Package02__Package02-12.svg'],
  ['crew-classic', 'crewneck', 'Crewneck sweatshirt', 'Package01-05.svg'], ['crew-raglan', 'crewneck', 'Raglan crewneck', 'Package04__Packge 04-06.svg'], ['crew-heavy', 'crewneck', 'Heavyweight crew', 'Package07__Package 07-23.svg'],
  ['hood-classic', 'hoodie', 'Pullover hoodie', 'Package01-06.svg'], ['hood-boxy', 'hoodie', 'Boxy hoodie', 'Package01-07.svg'],
  ['zip-classic', 'ziphoodie', 'Zip hoodie', 'Package01-08.svg'], ['zip-cropped', 'ziphoodie', 'Cropped zip hoodie', 'Package07__Package 07-25.svg'],
  ['jk-bomber', 'jacket', 'Bomber jacket', 'Package01-09.svg'], ['jk-track', 'jacket', 'Track jacket', 'Package01-11.svg'], ['jk-trucker', 'jacket', 'Trucker jacket', 'Package01-12.svg'],
  ['jk-zip', 'jacket', 'Zip work jacket', 'Package01-21.svg'], ['jk-funnel', 'jacket', 'Funnel-neck zip jacket', 'Package07__Package 07-20.svg'],
  ['pt-jogger', 'pants', 'Sweatpants', 'Package01-33.svg'], ['pt-jean', 'pants', 'Five-pocket jeans', 'Package01-35.svg'], ['pt-cargo', 'pants', 'Cargo pants', 'Package01-30.svg'],
  ['pt-chino', 'pants', 'Chinos', 'Package08__Package 08-21.svg'], ['pt-wide', 'pants', 'Wide-leg sweatpants', 'Package07__Package 07-14.svg'],
  ['sh-sweat', 'shorts', 'Sweat shorts', 'Package01-41.svg'], ['sh-denim', 'shorts', 'Denim shorts', 'Package01-37.svg'], ['sh-pleat', 'shorts', 'Pleated shorts', 'Package01-46.svg'],
  ['sh-chino', 'shorts', 'Chino shorts', 'Package07__Package 07-13.svg'], ['sh-cargo', 'shorts', 'Cargo shorts', 'Package08__Package 08-08.svg'],
  ['cap-6panel', 'cap', 'Six-panel cap', 'Hats__Hats.svg']
];
// the sample-size measurements each style is drawn to (the same as src/lab-flats.js, size M, regular fit), for the first look of each drawing
const KIND = { tee: 'top', longsleeve: 'top', crewneck: 'top', hoodie: 'top', ziphoodie: 'top', jacket: 'top', pants: 'bottom', shorts: 'bottom', cap: 'cap' };
const S = 3; // pixels per SVG unit when measuring

async function maskOf(file) {
  const svg = readFileSync(file), meta = await sharp(svg).metadata();
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg.toString())?.[1].trim().split(/\s+/).map(Number) || [0, 0, meta.width, meta.height];
  const { data, info } = await sharp(svg, { density: 72 * S * (vb[2] / meta.width) }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, m = new Uint8Array(W * H), dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { m[i] = data[i * 4 + 3] > 100 ? 1 : 0; dark[i] = m[i] && data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] < 270 ? 1 : 0; }
  return { m, dark, W, H, vb, k: W / vb[2] };
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
  if (!best || best.diff > .25) return { front: comps.sort((p, q) => q.a - p.a)[0], back: null };
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
    const off = Math.round((c.x1 - c.x0) * .03), side = (y, dir) => { for (let x = Math.round(cf) + dir * off; x >= c.x0 && x <= c.x1; x += dir) if (M.dark[y * W + x] || !m[y * W + x]) return x; return dir < 0 ? c.x0 : c.x1; };
    const first = rows.findIndex(r => wd(r) > 0), span = hem - first, ws = [];
    for (let i = first + Math.round(span * .35); i < hem - Math.round(span * .08); i++) ws.push(side(rows[i].y, 1) - side(rows[i].y, -1));
    const chest = pick(ws, .6);
    let sh = rows.findIndex(r => wd(r) >= chest * .8); if (sh < 0) sh = 0;
    // the high point of the shoulder: under a hood or a tall collar it is hidden, so it is found from the shoulder line; on a crew or a
    // v-neck it is just under the back neck seen over the front (an inch is about chest / 22 on the drawing)
    const inch = chest / 22, hps = collar === 'hood' ? rows[sh].y - inch * .5 : collar === 'tall' ? Math.min(rows[sh].y, c.y0 + inch * 1.6) : Math.min(rows[sh].y, c.y0 + inch * .35);
    Object.assign(out, { chest: U(chest), hpsY: Y(hps), shoulderY: Y(rows[sh].y), hemY: Y(rows[hem].y), topY: Y(c.y0) });
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
  return out;
}
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

const T = [];
for (const [id, style, label, file] of PICK.filter(q => !process.env.ONLY || process.env.ONLY.split(',').includes(q[0]))) {
  const path = join(SRC, file); if (!existsSync(path)) { console.warn('missing', file); continue; }
  const M = await maskOf(path), { comps, lab } = views(M), fb = frontBack(comps), kind = KIND[style];
  if (!fb.front) { console.warn(id, 'no views found', comps.length); continue; }
  const collar = /^(hood|zip)-/.test(id) ? 'hood' : /^jk-(trucker|funnel|bomber|zip|track)/.test(id) ? 'tall' : 'crew';
  const v = { front: measure(M, lab, fb.front, kind, collar) }; if (fb.back) v.back = measure(M, lab, fb.back, kind, collar);
  copyFileSync(path, join(ROOT, 'src', 'flat-templates', `${id}.svg`));
  T.push({ id, style, label, file: `${id}.svg`, page: M.vb, views: v });
  if (process.env.PROOF_DIR) await proof(path, T[T.length - 1], join(process.env.PROOF_DIR, `${id}.png`));
  console.log(id, 'views', Object.keys(v).join('+'), JSON.stringify({ chest: v.front.chest, waist: v.front.waist, box: v.front.box }));
}
writeFileSync(join(ROOT, 'src', 'lab-flat-templates.js'), `// Generated by scripts/flat-templates/build.mjs from the flat-sketch pack: which drawing is which style, where its front and back views are on its page,
// and what each view measures (SVG units), so src/lab-flats.js can line it up with a piece's measurements. Do not edit by hand: change the script and run it again.
export const FLAT_TEMPLATES = ${JSON.stringify(T)};
`);
console.log('templates', T.length);
