// All-over prints: one motif repeated without a seam across the whole piece, the way a sublimation printer or a print mill takes it.
//   makeRepeat(png, {type, repeatIn, scale, rotate, background}) → { tile (PNG), widthIn, heightIn, preview (PNG, 3 × 3 tiles), type }
// The tile is one repeat unit at 100 pixels an inch; laid edge to edge it covers any panel without a seam. Types, as mills name them:
//   straight  the motif on a square grid           half-drop  every other column dropped half a repeat
//   brick     every other row shifted half across   mirror     the motif mirrored left-right and up-down in a 2 × 2 unit
//   toss      several turned copies scattered in the unit (a "tossed" print), seamless at the edges
import sharp from 'sharp';

export const REPEAT_TYPES = { straight: 'Straight', halfdrop: 'Half-drop', brick: 'Brick', mirror: 'Mirror', toss: 'Tossed' };
const PPI = 100, MAX = 2400, HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function cleanRepeat(o = {}) {
  return { type: REPEAT_TYPES[o.type] ? o.type : 'straight', repeatIn: clamp(Number(o.repeatIn) || 4, .5, 24), scale: clamp(Number(o.scale) || .7, .1, 1), rotate: clamp(Math.round(Number(o.rotate) || 0), -180, 180), background: HEX.test(String(o.background || '')) ? String(o.background).toLowerCase() : '' };
}
export async function makeRepeat(png, opts = {}) {
  const o = cleanRepeat(opts);
  let motif = await sharp(png).ensureAlpha().trim({ threshold: 1 }).png().toBuffer().catch(() => png);
  if (o.rotate) motif = await sharp(motif).rotate(o.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(motif).metadata(), aspect = (m.height || 1) / (m.width || 1);
  // the cell: the repeat width across; its height keeps the motif's shape; the motif fills `scale` of it
  let cw = Math.round(o.repeatIn * PPI), ch = Math.round(cw * Math.max(.3, Math.min(3, aspect)));
  const two = { halfdrop: [2, 1], brick: [1, 2], mirror: [2, 2], toss: [2, 2], straight: [1, 1] }[o.type], k = Math.min(1, MAX / Math.max(cw * two[0], ch * two[1]));
  cw = Math.max(8, Math.round(cw * k)); ch = Math.max(8, Math.round(ch * k));
  const TW = cw * two[0], TH = ch * two[1], mw = Math.max(2, Math.round(cw * o.scale)), mh = Math.max(2, Math.round(mw * aspect));
  const base = await sharp(motif).resize(mw, Math.min(mh, Math.round(ch * .98)), { fit: 'inside' }).png().toBuffer(), bm = await sharp(base).metadata();
  const flop = await sharp(base).flop().png().toBuffer(), flip = await sharp(base).flip().png().toBuffer(), both = await sharp(base).flip().flop().png().toBuffer();
  // where each copy's centre sits in the tile, and which way it faces
  const at = []; const put = (x, y, img = base, w = bm.width, h = bm.height) => at.push({ x, y, img, w, h });
  if (o.type === 'straight') put(cw / 2, ch / 2);
  if (o.type === 'halfdrop') { put(cw / 2, ch / 2); put(cw * 1.5, ch); }
  if (o.type === 'brick') { put(cw / 2, ch / 2); put(cw, ch * 1.5); }
  if (o.type === 'mirror') { put(cw / 2, ch / 2); put(cw * 1.5, ch / 2, flop); put(cw / 2, ch * 1.5, flip); put(cw * 1.5, ch * 1.5, both); }
  if (o.type === 'toss') { const turns = [0, 140, 250, 65]; const spots = [[.25, .25], [.75, .4], [.35, .78], [.85, .9]];
    for (const [i, [fx, fy]] of spots.entries()) { const r = await sharp(base).rotate(turns[i], { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), rm = await sharp(r).metadata(); put(TW * fx, TH * fy, r, rm.width, rm.height); } }
  // each copy, and its neighbours across the edges, on a canvas three tiles wide; the middle tile is the repeat
  const layers = [];
  for (const c of at) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const left = Math.round(TW + c.x + i * TW - c.w / 2), top = Math.round(TH + c.y + j * TH - c.h / 2);
    if (left + c.w <= TW || left >= 2 * TW || top + c.h <= TH || top >= 2 * TH || left < 0 || top < 0 || left + c.w > 3 * TW || top + c.h > 3 * TH) continue;
    layers.push({ input: c.img, left, top });
  }
  const bg = o.background ? { r: parseInt(o.background.slice(1, 3), 16), g: parseInt(o.background.slice(3, 5), 16), b: parseInt(o.background.slice(5, 7), 16), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
  const big = await sharp({ create: { width: TW * 3, height: TH * 3, channels: 4, background: bg } }).composite(layers).png().toBuffer();
  const tile = await sharp(big).extract({ left: TW, top: TH, width: TW, height: TH }).png().toBuffer();
  const pw = Math.min(900, TW * 3), ph = Math.round(pw * TH / TW);
  const preview = await sharp({ create: { width: TW * 3, height: TH * 3, channels: 4, background: o.background ? bg : { r: 236, g: 235, b: 230, alpha: 1 } } })
    .composite([0, 1, 2].flatMap(i => [0, 1, 2].map(j => ({ input: tile, left: i * TW, top: j * TH })))).resize(pw, ph).png().toBuffer();
  const ppi = PPI * k;
  return { ...o, tile, preview, widthIn: Math.round(TW / ppi * 100) / 100, heightIn: Math.round(TH / ppi * 100) / 100, px: [TW, TH] };
}
