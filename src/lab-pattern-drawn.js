// A top's pattern against its flat sketch: the pieces put together as the product shows them (src/lab-pattern.js assembled) laid over the
// sketch's own silhouette (its colouring mask, src/flat-templates/masks/, the garment and everything it encloses), both in the piece's inches:
// across as the flats lay the sketch (by its chest), down so its body is the piece's length (the pack draws its pieces long, so a length read
// off the drawing alone would cut every piece too long). The construction check (src/lab-pattern-check.js) proves the pieces sew together;
// this proves what they sew into is the shape the flat draws.
//   drawnFit(p, pat?) → { iou, missing, extra } (in²: the flat's area the pattern misses, the pattern's area outside the flat) or null
//   DRAWN_BASELINE: each library top's fit when it was last checked by eye (src/lab-pattern-drawn-baseline.json); the pattern proof fails a
//   top whose fit falls more than DRAWN_SLACK below it (npm run pattern:proof). Raise a baseline only after looking at the overlay.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { drawingOf, STYLES } from './lab-flats.js';
import { garmentPattern, assembled, boundsOf } from './lab-pattern.js';

export const DRAWN_BASELINE = JSON.parse(readFileSync(new URL('./lab-pattern-drawn-baseline.json', import.meta.url), 'utf8'));
export const DRAWN_SLACK = .02;
// a bikini is drawn as its top over its brief, at no set distance apart: the two are not laid out as a garment is, so it is not compared here
export const drawnStyle = style => STYLES[style]?.kind === 'top' && style !== 'bikini';

const masks = new Map();
async function maskOf(file) {
  if (!masks.has(file)) masks.set(file, (async () => {
    const svg = readFileSync(new URL(`./flat-templates/${file}`, import.meta.url), 'utf8'), vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
    const { data, info } = await sharp(readFileSync(new URL(`./flat-templates/masks/${file.replace(/\.svg$/, '.png')}`, import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { at: (x, y) => { const px = Math.floor((x - vb[0]) / vb[2] * info.width), py = Math.floor((y - vb[1]) / vb[3] * info.height); return px >= 0 && py >= 0 && px < info.width && py < info.height && data[(py * info.width + px) * 4 + 3] > 127; } };
  })());
  return masks.get(file);
}
// the sketch's silhouette in the piece's inches: inside(x, y), and the box it can be in
export async function silhouetteOf(p, view = 'front') {
  const d = drawingOf(p, view); if (!d?.v?.box || !(d.v.hemY > d.v.hpsY) || !(p.m?.length > 0)) return null;
  const g = await maskOf(d.t.file), sy = (d.v.hemY - d.v.hpsY) / p.m.length, [bx, by, bw, bh] = d.v.box;
  return { inside: (X, Y) => { const x = d.ox + X * d.sx, y = d.oy + Y * sy; return x >= bx && x <= bx + bw && y >= by && y <= by + bh && g.at(x, y); },
    box: { x0: (bx - d.ox) / d.sx, y0: (by - d.oy) / sy, x1: (bx + bw - d.ox) / d.sx, y1: (by + bh - d.oy) / sy } };
}
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
export async function drawnFit(p, pat = garmentPattern(p, 'M'), { step = .5 } = {}) {
  if (!drawnStyle(p.style) || !pat) return null;
  const S = await silhouetteOf(p); if (!S) return null;
  const P = assembled(pat).pieces.filter(x => x.piece.place.view !== 'back' && !x.piece.hidden && x.pts.length >= 3).map(x => x.pts); if (!P.length) return null;
  const pb = boundsOf(P.flat()), x0 = Math.min(S.box.x0, pb.x0), y0 = Math.min(S.box.y0, pb.y0), x1 = Math.max(S.box.x1, pb.x1), y1 = Math.max(S.box.y1, pb.y1);
  let I = 0, U = 0, miss = 0, extra = 0;
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
    const a = S.inside(x, y), b = P.some(Q => inPoly(Q, x, y)); if (a && b) I++; if (a || b) U++; if (a && !b) miss++; if (b && !a) extra++;
  }
  return { iou: U ? Math.round(I / U * 100) / 100 : 0, missing: Math.round(miss * step * step), extra: Math.round(extra * step * step) };
}
