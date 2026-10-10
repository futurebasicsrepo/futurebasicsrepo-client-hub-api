// A first picture for a pack that has no product photo: the client sent a graphic (lettering, a logo, a print) and described what it goes on.
// The graphic goes into the image model as the reference and the description says the product; the result is a concept render that
// lands in the pack's colour renderings, so the client sees something made from what they gave us instead of an error.
import sharp from 'sharp';
import { imageConfig, openaiEdit } from './check.js';

export function conceptPrompt({ title = '', category = '', description = '' } = {}) {
  const what = [title, category && !new RegExp(category, 'i').test(title) ? `(${category})` : ''].filter(Boolean).join(' ');
  return [`The reference image is the customer's graphic, not a product. Make a clean, photorealistic studio product photograph of ${what || 'the product'} with this graphic applied to it, as a three-quarter front view at eye level on a plain light-grey background with soft light.`,
    description ? `The customer describes it as: ${String(description).replace(/\s+/g, ' ').slice(0, 300)}.` : '',
    'If the description names a set of pieces (for example a top and matching bottoms), show the whole set together, styled as one matching outfit laid out or on a plain mannequin.',
    'Print or embroider the graphic exactly as it appears in the reference: the same lettering, shapes and colours, not redrawn or reworded, on a sensible placement such as the chest. Choose a plain colour for the garment that makes the graphic read clearly, and keep every other detail simple and neutral.',
    'No people, no hands, no other text, logos or watermarks.'].filter(Boolean).join('\n');
}

const toBuf = async uri => { const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(uri || '')); return m ? sharp(Buffer.from(m[2], 'base64')).rotate().flatten({ background: '#ffffff' }).resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer() : null; };

// Test stand-in: the graphic on a plain garment-coloured block, marked as not a real render.
async function fixtureConcept(ref) {
  const art = await sharp(ref).resize({ width: 520, height: 260, fit: 'inside' }).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#e6e7ea"/><rect x="232" y="250" width="560" height="520" rx="70" fill="#3b3f46"/><text x="512" y="930" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#555">TEST CONCEPT RENDER · not an image model</text></svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: art, left: 252, top: 380 }]).jpeg({ quality: 86 }).toBuffer();
}

// → a data URL, or null when no image model is connected
export async function conceptRender({ artwork, title, category, description, cfg = imageConfig() }) {
  if (!cfg.configured) return null;
  const ref = await toBuf(artwork); if (!ref) return null;
  const buf = cfg.provider === 'fixture' ? await fixtureConcept(ref) : await openaiEdit({ images: [ref], prompt: conceptPrompt({ title, category, description }), cfg: { ...cfg, size: process.env.HERO_SIZE || '1024x1024' } });
  const jpg = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}
