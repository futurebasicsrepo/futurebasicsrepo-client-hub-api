// Where the logo and the graphics go on a concept's picture. The image model draws the piece anywhere in the frame, in any pose, so fixed positions put marks off the
// garment or crooked. A vision model looks at the finished picture and says, for each mark, the point on the piece where it belongs, how wide it should be, and the
// angle of the cloth there; the marks are then laid on exactly as our own artwork (the model only measures, it draws nothing). If it cannot be asked, or answers
// nonsense, the caller falls back to fixed positions.
import { callJsonSchema } from './studio.js';

export const PLACE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['item', 'marks'],
  properties: {
    item: { type: 'object', additionalProperties: false, required: ['x0', 'y0', 'x1', 'y1'], description: 'The bounding box of the product itself (not the background, not the small inset label card), as fractions 0-1 of the picture.',
      properties: { x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' } } },
    marks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'x', 'y', 'w', 'angle'],
      properties: { id: { type: 'string' }, x: { type: 'number', description: 'Centre of the mark, fraction 0-1 of the picture width from the left' }, y: { type: 'number', description: 'Centre of the mark, fraction 0-1 of the picture height from the top' },
        w: { type: 'number', description: 'Width of the mark as a fraction 0-1 of the picture width' }, angle: { type: 'number', description: 'Degrees, clockwise positive, that the mark must be turned so it lies along the cloth there' } } } }
  }
};
const SYSTEM = `You place marks on a product photograph for a clothing and accessories brand. The picture shows one item (a garment, cap, shoe or bag) photographed in a studio. A small dark label card in a bottom corner is NOT part of the item: ignore it.
For each mark you are asked about, give where it goes on the item: the centre point and the width, as fractions of the whole picture, and the angle that makes it lie flat along the cloth at that point (a front-on item needs about 0; a three-quarter view tilts the surface, so a chest mark follows the slope of the chest).
Rules: the whole mark must sit well inside the item's outline, away from edges, seams, collars, cuffs, straps, handles, zips, pockets, buttons and hardware. Centre a "centre front" mark on the middle of the main front panel (for a bag, centred between the handles, on the body not on the handle or the band edge). A "left chest" mark is the wearer's left, which is on the viewer's right of a front view, at about the height of the armpit, one hand-width from the centre line. Size a chest mark small, a centre-front mark on a bag or sweatshirt larger. Judge by the real picture, not by habit.`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = v => (Number.isFinite(Number(v)) ? Number(v) : NaN);

// marks: [{ id, where: 'small mark on the left chest', w: 0.08 (a sensible width as a fraction of the picture) }] → Map id → { x, y, w, angle } or null
export async function locateMarks({ image, category = 'other', marks = [], ask = callJsonSchema, env = process.env }) {
  if (!marks.length || (!env.ANTHROPIC_API_KEY && ask === callJsonSchema)) return null;
  const list = marks.map(m => `- id "${m.id}": ${m.where} (a good width is about ${Math.round(m.w * 100)}% of the picture width)`).join('\n');
  const content = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(image).toString('base64') } }, { type: 'text', text: `The item is: ${category}.\nPlace these marks:\n${list}\nAnswer for every id.` }];
  let out; try { out = await ask(SYSTEM, content, PLACE_SCHEMA, { maxTokens: 900 }); } catch { return null; }
  return sanitize(out, marks);
}

// Keep the answer honest: inside the item's box, a width near the hint, a gentle angle. A mark the model left out, or placed outside, is simply missing (the caller uses its fallback).
export function sanitize(out, marks) {
  const b = out?.item || {}, x0 = clamp(num(b.x0), 0, 0.95), y0 = clamp(num(b.y0), 0, 0.95), x1 = clamp(num(b.x1), x0 + 0.05, 1), y1 = clamp(num(b.y1), y0 + 0.05, 1);
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 - x0 < 0.12 || y1 - y0 < 0.12) return null;
  const res = new Map();
  for (const m of marks) {
    const r = (out.marks || []).find(k => k && k.id === m.id); if (!r) continue;
    const x = num(r.x), y = num(r.y), w = num(r.w), a = num(r.angle);
    if (![x, y, w].every(Number.isFinite)) continue;
    const pad = 0.04;
    if (x < x0 + pad || x > x1 - pad || y < y0 + pad || y > y1 - pad) continue; // not on the item
    res.set(m.id, { x, y, w: clamp(w, m.w * 0.5, Math.min(m.w * 2.2, (x1 - x0) * 0.6)), angle: Number.isFinite(a) ? clamp(a, -35, 35) : 0 });
  }
  return res.size ? res : null;
}
