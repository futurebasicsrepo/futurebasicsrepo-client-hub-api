// Design Lab library: pieces added from a photo or a screenshot (an Instagram post, a shop window, a fitting), not only from a link. A vision model reads the picture
// into the same facts a shop listing gives (what it is, its category, shape, fabric, colours, details, the graphics on it, the brand when it is plainly shown);
// the picture itself is kept, so the library shows what was actually seen.
import sharp from 'sharp';
import { callJsonSchema } from './studio.js';
import { cleanCategory, CATEGORY_IDS, brandCodeWords, DEFAULT_BRAND_CODE } from './lab.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => clip(x, len)).filter(Boolean).slice(0, n);
const PHOTO = /^data:image\/(png|jpe?g|webp|gif|heic|heif|avif);base64,([A-Za-z0-9+/=\s]+)$/i;

export const PHOTO_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'category', 'brand', 'silhouette', 'fabric', 'fit', 'colors', 'details', 'graphics', 'summary'],
  properties: {
    title: { type: 'string', description: 'A plain product name, like a shop would give it: "Distressed crewneck tee", "Pleated wide trouser"' },
    category: { type: 'string', enum: CATEGORY_IDS }, brand: { type: 'string', description: 'The brand only when it is plainly shown (a label, a tag, a shop sign, a post by the brand); otherwise empty' },
    silhouette: { type: 'string' }, fabric: { type: 'string' }, fit: { type: 'string' }, colors: { type: 'array', items: { type: 'string' } }, details: { type: 'array', items: { type: 'string' } },
    graphics: { type: 'string', description: 'The graphics, logos, prints or lettering on it, in words; empty when there are none' },
    summary: { type: 'string', description: 'One sentence: what makes this piece interesting to a designer' }
  }
};

// a picture sent by the page → { photo, thumb } (JPEG, upright, at most 1600 px and 480 px), or { error }
export async function preparePhoto(dataUrl) {
  const m = PHOTO.exec(String(dataUrl || '').trim()); if (!m) return { error: 'That file is not a picture' };
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64'); if (buf.length > 12_000_000) return { error: 'That picture is too large (12 MB at most)' };
  try {
    const photo = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 86 }).toBuffer();
    return { photo, thumb: await sharp(photo).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer() };
  } catch { return { error: 'That picture could not be opened. Save it as a JPG or PNG and try again.' }; }
}

const fixture = ({ hint }) => ({ title: hint || 'Washed boxy tee', category: 'tops', brand: '', silhouette: 'boxy', fabric: 'heavy cotton jersey', fit: 'relaxed', colors: ['washed black'], details: ['rib collar', 'dropped shoulder'], graphics: 'a faded chest print', summary: 'A heavy washed tee with a lived-in print.' });

// → the facts read from the picture (cleaned), or null when no model can be asked. `hint` is what the person typed about it.
export async function readPhoto(photo, { hint = '', code = DEFAULT_BRAND_CODE, ask = callJsonSchema, env = process.env } = {}) {
  let out;
  if (env.AI_FIXTURE && ask === callJsonSchema) out = fixture({ hint });
  else {
    if (!env.ANTHROPIC_API_KEY && ask === callJsonSchema) return null;
    const system = `You are the product analyst on the Future Basics design team, reading a photo or screenshot a designer saved as a reference. Describe the main product in it in plain design words, the way a shop listing would. Describe only what you can see; leave a field empty rather than guess. Ignore the app around a screenshot (likes, captions, buttons) except where it names the brand.\n${brandCodeWords(code)}`;
    try { out = await ask(system, [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(photo).toString('base64') } }, { type: 'text', text: hint ? `The designer's note about it: ${clip(hint, 300)}` : 'Read the main product.' }], PHOTO_SCHEMA, { maxTokens: 900 }); }
    catch { return null; }
  }
  return { title: clip(out?.title, 120), category: cleanCategory(out?.category) || 'other', brand: clip(out?.brand, 60),
    attrs: { silhouette: clip(out?.silhouette, 80), fabric: clip(out?.fabric, 120), fit: clip(out?.fit, 60), colors: list(out?.colors, 6, 30), details: list(out?.details, 5, 100), ...(out?.graphics ? { graphics: clip(out.graphics, 200) } : {}) },
    summary: clip(out?.summary, 400) };
}
