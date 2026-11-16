// A top's or a bottom's pattern against its flat sketch: the pieces put together as the product shows them (src/lab-pattern.js assembled) laid over the
// sketch's own silhouette (its colouring mask, src/flat-templates/masks/, the garment and everything it encloses), both in the piece's inches:
// across as the flats lay the sketch (by its chest), down so its body is the piece's length (the pack draws its pieces long, so a length read
// off the drawing alone would cut every piece too long). The construction check (src/lab-pattern-check.js) proves the pieces sew together;
// this proves what they sew into is the shape the flat draws.
//   drawnFit(p, pat?) → { iou, missing, extra } (in²: the flat's area the pattern misses, the pattern's area outside the flat) or null
//   DRAWN_BASELINE: each library top's fit when it was last checked by eye (src/lab-pattern-drawn-baseline.json); the pattern proof fails a
//   top whose fit falls more than DRAWN_SLACK below it (npm run pattern:proof). Raise a baseline only after looking at the overlay.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { drawingOf, STYLES, measurementsFor } from './lab-flats.js';
import { garmentPattern, assembled, boundsOf } from './lab-pattern.js';

export const DRAWN_BASELINE = JSON.parse(readFileSync(new URL('./lab-pattern-drawn-baseline.json', import.meta.url), 'utf8'));
export const DRAWN_SLACK = .02;
// a bikini is drawn as its top over its brief, at no set distance apart: the two are not laid out as a garment is, so it is not compared here.
// Bottoms are compared from the waist down: a skirt to its length, trousers, shorts and leggings to the rise and inseam.
export const drawnStyle = style => (STYLES[style]?.kind === 'top' && style !== 'bikini') || STYLES[style]?.kind === 'bottom';
const lengthOf = p => (STYLES[p.style]?.kind === 'top' || STYLES[p.style]?.skirt ? p.m?.length : (p.m?.rise || 0) + (p.m?.inseam || 0));

const masks = new Map();
async function maskOf(file) {
  if (!masks.has(file)) masks.set(file, (async () => {
    const svg = readFileSync(new URL(`./flat-templates/${file}`, import.meta.url), 'utf8'), vb = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
    const { data, info } = await sharp(readFileSync(new URL(`./flat-templates/masks/${file.replace(/\.svg$/, '.png')}`, import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { at: (x, y) => { const px = Math.floor((x - vb[0]) / vb[2] * info.width), py = Math.floor((y - vb[1]) / vb[3] * info.height); return px >= 0 && py >= 0 && px < info.width && py < info.height && data[(py * info.width + px) * 4 + 3] > 127; } };
  })());
  return masks.get(file);
}
// the sketch's silhouette in the piece's inches: inside(x, y), and the box it can be in. A bottom is drawn down to the pattern's own hem
// (`height`): its rise is measured along the curve of the crotch seam, so rise and inseam added up are longer than the trousers hang
export async function silhouetteOf(p, view = 'front', height = null) {
  const d = drawingOf(p, view), top = STYLES[p.style]?.kind === 'top' ? d?.v?.hpsY : d?.v?.topY, L = height || lengthOf(p);
  if (!d?.v?.box || !(d.v.hemY > top) || !(L > 0)) return null;
  const g = await maskOf(d.t.file), sy = (d.v.hemY - top) / L, [bx, by, bw, bh] = d.v.box;
  return { inside: (X, Y) => { const x = d.ox + X * d.sx, y = d.oy + Y * sy; return x >= bx && x <= bx + bw && y >= by && y <= by + bh && g.at(x, y); },
    box: { x0: (bx - d.ox) / d.sx, y0: (by - d.oy) / sy, x1: (bx + bw - d.ox) / d.sx, y1: (by + bh - d.oy) / sy } };
}
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// the pieces of the front put together, as the comparison sees them; a pair of trousers or shorts with its legs swung out to the angle its
// sketch draws them (a flat lays the legs apart; the pattern assembles them hanging straight), each leg turned below the crotch
export async function frontOf(p, pat) {
  const P = assembled(pat).pieces.filter(x => x.piece.place.view !== 'back' && !x.piece.hidden && x.pts.length >= 3).map(x => ({ id: x.piece.id, pts: x.pts }));
  if (!P.length) return null;
  const bottom = STYLES[p.style]?.kind === 'bottom' && !STYLES[p.style]?.skirt, H = boundsOf(P.flatMap(x => x.pts)).y1;
  const S = await silhouetteOf(p, 'front', bottom ? H : null); if (!S) return null;
  if (!bottom) return { S, P };
  const at = pat.block?.front?.at?.crotch, cY = at ? at[1] + (measurementsFor(p, 'M').waistband || 1.5) : null; if (!(cY > 0 && H - cY > 3)) return { S, P };
  // each leg's middle at two heights, on the sketch and on the pattern: the left leg is the run of the outline furthest left
  const runs = (inside, y, x0, x1) => { const out = []; let a = null; for (let x = x0; x <= x1; x += .125) { const i = inside(x, y); if (i && a == null) a = x; if (!i && a != null) { out.push([a, x]); a = null; } } if (a != null) out.push([a, x1]); return out; };
  const mid = (inside, y) => { const r = runs(inside, y, S.box.x0 - 6, 0).filter(q => q[1] - q[0] > .5)[0]; return r ? (r[0] + Math.min(r[1], 0)) / 2 : null; };
  const pin = (x, y) => P.some(Q => inPoly(Q.pts, x, y));
  const y1 = cY + Math.min(2, (H - cY) * .25), y2 = H - Math.min(2, (H - cY) * .25);
  const s1 = mid(S.inside, y1), s2 = mid(S.inside, y2), q1 = mid(pin, y1), q2 = mid(pin, y2); if ([s1, s2, q1, q2].some(v => v == null)) return { S, P };
  const k = Math.min(Math.max(((s2 - s1) - (q2 - q1)) / (y2 - y1), -.35), .35); // its sketch's legs splay out (k < 0 on the left) or in
  const swing = ([x, y]) => (y > cY ? [x + Math.sign(x || -1) * -k * (y - cY), y] : [x, y]);
  return { S, P: P.map(x => ({ ...x, pts: x.pts.map(swing) })), swing: Math.round(k * 100) / 100 };
}
export async function drawnFit(p, pat = garmentPattern(p, 'M'), { step = .5 } = {}) {
  if (!drawnStyle(p.style) || !pat) return null;
  const F = await frontOf(p, pat); if (!F) return null; const { S } = F, P = F.P.map(x => x.pts);
  const pb = boundsOf(P.flat()), x0 = Math.min(S.box.x0, pb.x0), y0 = Math.min(S.box.y0, pb.y0), x1 = Math.max(S.box.x1, pb.x1), y1 = Math.max(S.box.y1, pb.y1);
  let I = 0, U = 0, miss = 0, extra = 0;
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
    const a = S.inside(x, y), b = P.some(Q => inPoly(Q, x, y)); if (a && b) I++; if (a || b) U++; if (a && !b) miss++; if (b && !a) extra++;
  }
  return { iou: U ? Math.round(I / U * 100) / 100 : 0, missing: Math.round(miss * step * step), extra: Math.round(extra * step * step) };
}
