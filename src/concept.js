// A first picture for a pack that has no product photo: the client sent a graphic (lettering, a logo, a print) and described what it goes on.
// The description says the product and the model draws it with a plain chest. The graphic is never sent to the model (a model redraws lettering): the
// client's own file is placed on the render afterwards, where it can be dragged and sized, so the lettering is always exactly what they sent.
import sharp from 'sharp';
import { imageConfig, openaiEdit } from './check.js';

export function conceptPrompt({ title = '', category = '', description = '' } = {}) {
  const what = [title, category && !new RegExp(category, 'i').test(title) ? `(${category})` : ''].filter(Boolean).join(' ');
  return [`The reference image is only a plain studio backdrop. Make a clean, photorealistic studio product photograph of ${what || 'the product'}, as a three-quarter front view at eye level on a plain light-grey background with soft light.`,
    description ? `The customer describes it as: ${String(description).replace(/\s+/g, ' ').slice(0, 300)}.` : '',
    'If the description names a set of pieces (for example a top and matching bottoms), show the whole set together, styled as one matching outfit laid out or on a plain mannequin.',
    'Leave the chest of the top completely plain and blank: no print, no lettering, no logo anywhere on the garment. The customer\'s own graphic is placed there afterwards, so it is never redrawn by a model.',
    'Choose a plain mid-tone colour for the garment, so a dark or a light graphic will both read clearly on it, and keep every other detail simple and neutral.',
    'No people, no hands, no text, logos or watermarks.'].filter(Boolean).join('\n');
}

const toBuf = async uri => { const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(uri || '')); return m ? sharp(Buffer.from(m[2], 'base64')).rotate().flatten({ background: '#ffffff' }).resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer() : null; };

// Where the graphic goes on the render to begin with, as fractions of the picture: the centre of the chest. A set (a top and matching bottoms) is laid out
// with the top on the left, so the graphic starts there. Only a starting point: the client and staff drag it into place.
export function conceptPlacement({ description = '', title = '' } = {}) {
  const set = /\b(set|outfit|matching|and|\+|with)\b/i.test(`${title} ${description}`);
  return set ? { x: 0.34, y: 0.3, w: 0.16 } : { x: 0.5, y: 0.36, w: 0.26 };
}

// Test stand-in: a plain garment-coloured block, marked as not a real render (the graphic is placed on top afterwards, as with a real one).
async function fixtureConcept() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#e6e7ea"/><rect x="232" y="250" width="560" height="520" rx="70" fill="#3b3f46"/><text x="512" y="930" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#555">TEST CONCEPT RENDER · not an image model</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

// → a data URL, or null when no image model is connected
export async function conceptRender({ artwork, title, category, description, cfg = imageConfig() }) {
  if (!cfg.configured) return null;
  if (!(await toBuf(artwork))) return null; // only a readable graphic gets a render; the graphic itself is never sent to the model
  const backdrop = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#e6e7ea' } }).jpeg().toBuffer();
  const buf = cfg.provider === 'fixture' ? await fixtureConcept() : await openaiEdit({ images: [backdrop], prompt: conceptPrompt({ title, category, description }), cfg: { ...cfg, size: process.env.HERO_SIZE || '1024x1024' } });
  const jpg = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}
