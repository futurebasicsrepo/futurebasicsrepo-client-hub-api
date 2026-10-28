// The garment's silhouette on a flat sketch, as a mask: the sketch's lines and everything they enclose, and nothing reachable from outside.
// The flats colour a garment by tinting the drawing (white cloth becomes the colour, black lines a darker shade), which only works where the
// sketch fills its panels white. Some of the Drive sketches leave the panels unfilled and fill the negative spaces white instead (the gap
// between the legs, the space between a double outline), so the colour landed outside the garment and missed the panels. The mask fixes both:
// the flats lay white under the lines inside it, and hide whatever the sketch filled outside it.
//   bodyMask(svg)  → a PNG the size of the sketch's page: white where the garment is, transparent elsewhere
import sharp from 'sharp';

const WIDTH = 1400; // pixels across the page: enough for a clean edge at the size flats are drawn and printed

export async function bodyMask(svg, { width = WIDTH, dark = 175, close = 2 } = {}) {
  const { data, info } = await sharp(Buffer.isBuffer(svg) ? svg : Buffer.from(String(svg)), { density: 300 }).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, n = W * H;
  // a line: a dark, visible pixel. Light greys (fold shading) and white fills count as open space.
  const line = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) { const a = data[p + 3]; if (a > 40 && (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) < dark) line[i] = 1; }
  // thicken the lines a little so a hairline gap in an outline does not let the outside in
  const wall = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!line[y * W + x]) continue;
    for (let dy = -close; dy <= close; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -close; dx <= close; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) wall[yy * W + xx] = 1; } }
  }
  // flood the outside in from the page's edges
  const out = new Uint8Array(n), stack = new Int32Array(n); let top = 0;
  const seed = i => { if (!wall[i] && !out[i]) { out[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (top) {
    const i = stack[--top], x = i % W;
    if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (i >= W) seed(i - W); if (i < n - W) seed(i + W);
  }
  // the body: whatever the outside did not reach; the thickened walls are given back to the outside where they touch it, so the edge sits on the line
  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let body = !out[i];
    if (body && wall[i] && !line[i]) { const x = i % W; body = !((x > 0 && out[i - 1]) || (x < W - 1 && out[i + 1]) || (i >= W && out[i - W]) || (i < n - W && out[i + W])); }
    if (body) { const p = i * 4; rgba[p] = rgba[p + 1] = rgba[p + 2] = 255; rgba[p + 3] = 255; }
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9, palette: true, colours: 2 }).toBuffer(); // two colours: white body, transparent outside
}

// one mask per sketch file: the one made ahead of time in src/flat-templates/masks (npm run flat-masks), else made now and kept
const cache = new Map();
export function maskFor(file, readSvg, readMade = null) {
  if (!cache.has(file)) cache.set(file, (async () => { if (readMade) { try { const b = await readMade(file.replace(/\.svg$/, '.png')); if (b?.length) return b; } catch {} } return bodyMask(await readSvg(file)); })().catch(e => { cache.delete(file); throw e; }));
  return cache.get(file);
}
