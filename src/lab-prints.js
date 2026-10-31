// New prints from prints already in the library, the way a print studio works from a reference:
//   style  a new print in the style of one graphic (its marks, palette, density, technique), showing something else (`subject`)
//   blend  two graphics fused into one new print, leaning toward the second by `mix` (0 = all the first, 100 = all the second)
// The image model does the drawing (src/check.js openaiEdit, the graphics as references); with the test image provider a plain composite stands in.
// The result goes in the library like any graphic, so it can be made an all-over repeat (src/lab-repeat.js) or placed on a piece.
import sharp from 'sharp';

export const PRINT_MODES = { style: 'In the style of this one', blend: 'Blend two prints' };
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// the request, cleaned → { mode, art: [ids], subject, mix, fill, name } or { error }
export function cleanPrint(b = {}) {
  const mode = PRINT_MODES[b.mode] ? b.mode : null; if (!mode) return { error: 'Choose how to make the print: in the style of a graphic, or a blend of two' };
  const ids = (Array.isArray(b.art) ? b.art : [b.art]).map(x => String(x || '')).filter(x => /^[0-9a-f-]{36}$/i.test(x));
  const art = [...new Set(ids)].slice(0, 2);
  if (mode === 'blend' && art.length < 2) return { error: 'Choose two different graphics to blend' };
  if (!art.length) return { error: 'Choose a graphic from the library' };
  const subject = clip(b.subject, 300);
  if (mode === 'style' && !subject) return { error: 'Say what the new print should show, for example "palm leaves and surfboards"' };
  const mix = Math.min(100, Math.max(0, Math.round(Number(b.mix ?? 50)))) || 0;
  return { mode, art: mode === 'style' ? art.slice(0, 1) : art, subject, mix, fill: b.fill !== false, name: clip(b.name, 80) };
}

const lean = mix => (mix <= 30 ? 'mostly the first, with a little of the second' : mix >= 70 ? 'mostly the second, with a little of the first' : 'an even mix of both');

// the words for the image model; names are only used to say which reference is which
export function printPrompt(p, names = []) {
  const ground = p.fill ? 'Fill the whole square edge to edge as a printed fabric, with no border, no garment and no mock-up.' : 'Keep it a single graphic on a plain transparent or white ground, with no garment and no mock-up.';
  const rules = 'Original artwork: no logos, no brand names, no readable words unless the reference has them, no watermark. Flat print colours a mill could separate.';
  if (p.mode === 'style') return [`Make a new textile print in the style of the reference (${names[0] || 'the first image'}): the same mark-making, line weight, palette, density and printing technique.`,
    `It shows ${p.subject}, not the reference's motifs.`, ground, rules].join(' ');
  return [`Fuse the two reference prints (${names[0] || 'the first image'} and ${names[1] || 'the second image'}) into one new textile print: ${lean(p.mix)}.`,
    'Take motifs, palette and mark-making from both so it reads as one design, not two pictures side by side.', p.subject ? `Work in ${p.subject}.` : '', ground, rules].filter(Boolean).join(' ');
}

// the stand-in when no image model is connected for real (tests and journeys): the first graphic retinted, or the two laid over each other at `mix`
export async function fixturePrint(p, pngs) {
  const S = 1024, sq = buf => sharp(buf).resize(S, S, { fit: 'contain', background: { r: 242, g: 239, b: 230, alpha: 1 } }).flatten({ background: '#f2efe6' }).png().toBuffer();
  const a = await sq(pngs[0]);
  if (p.mode === 'style') return sharp(a).modulate({ hue: 40, saturation: 1.15 }).png().toBuffer();
  const b = await sq(pngs[1]), alpha = Math.round(255 * Math.min(.9, Math.max(.1, p.mix / 100)));
  const { data } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); for (let i = 3; i < data.length; i += 4) data[i] = alpha;
  const over = await sharp(data, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
  return sharp(a).composite([{ input: over }]).png().toBuffer();
}

// the name it is kept under
export const printName = (p, names = []) => p.name || (p.mode === 'style' ? `${clip(p.subject, 50)} · after ${names[0] || 'a print'}` : `${names[0] || 'Print'} × ${names[1] || 'print'}`);
