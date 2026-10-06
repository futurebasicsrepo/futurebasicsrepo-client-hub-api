// The studio: the steps that turn the client's photo into something the rest of the pack can be built from.
//   1. Colours are MEASURED from the pixels of the product (clustered in Lab, matched to a colour name), never guessed by a model.
//   2. A "hero" image is made FROM the photo with an image model's edit endpoint (the photo goes in as the reference), as several
//      candidates; a vision model and the measured colours pick the most faithful one, and a person approves it.
// Everything downstream (the spec check's render, later the views and the 3D model) starts from the approved hero, not from words alone.
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { productMask, segmentPanels, rgbToLab, hexToRgb } from './colorway.js';
import { dataUrlToImageBlock } from './ai.js';
import { imageConfig, openaiEdit, CHECK_MODEL } from './check.js';
import { timed } from './telemetry.js';
import { codeColourways, colourWithCode } from './pantone-codes.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

// ---- colour names: the nearest of a short list written for apparel and footwear ----
const NAMES = [
  ['White', '#f5f5f2'], ['Off-white', '#ebe7dc'], ['Cream', '#efe6cf'], ['Bone', '#e3dac6'], ['Ecru', '#d8cdb4'], ['Sand', '#cdb99a'], ['Beige', '#c8b79c'], ['Tan', '#b58a5a'], ['Camel', '#a87b45'], ['Khaki', '#a39467'],
  ['Light grey', '#c9cacc'], ['Grey', '#8d9094'], ['Heather grey', '#a7a9ad'], ['Charcoal', '#4a4d52'], ['Graphite', '#34363a'], ['Black', '#16161a'],
  ['Brown', '#6b4a32'], ['Chocolate', '#47301f'], ['Dark brown', '#3a281d'], ['Espresso', '#2a1c16'], ['Oxblood', '#4a1e22'], ['Mahogany', '#51271f'], ['Walnut', '#5b3c2a'], ['Chestnut', '#6c3d25'], ['Cognac', '#9a5b2e'], ['Black cherry', '#3c1621'], ['Bordeaux', '#4b1727'], ['Aubergine', '#35203a'], ['Deep green', '#16332a'], ['Deep navy', '#101a30'], ['Tobacco', '#7a5230'], ['Rust', '#a4502a'], ['Terracotta', '#b9654a'], ['Burgundy', '#6d1f2f'], ['Maroon', '#541a26'], ['Wine', '#7a2540'],
  ['Red', '#c8202a'], ['Scarlet', '#e03a2f'], ['Coral', '#ee6f5b'], ['Orange', '#ef7a1f'], ['Burnt orange', '#cc5a1a'], ['Amber', '#e4a21c'], ['Mustard', '#d2a02a'], ['Yellow', '#f0cf2c'], ['Lemon', '#f4e35a'],
  ['Lime', '#b5d334'], ['Olive', '#6a6b2e'], ['Moss', '#58642f'], ['Forest green', '#24502f'], ['Green', '#2f8a4a'], ['Emerald', '#12805a'], ['Sage', '#9aa88a'], ['Mint', '#a8dcc0'], ['Teal', '#1f7f80'],
  ['Aqua', '#52c4c8'], ['Sky blue', '#8cc4ec'], ['Light blue', '#a9c7e6'], ['Blue', '#2a63c5'], ['Royal blue', '#1f4fb5'], ['Cobalt', '#1f3fa0'], ['Denim', '#4a6a94'], ['Navy', '#1d2a4a'], ['Midnight', '#141d33'],
  ['Lavender', '#b9a9dc'], ['Lilac', '#c7b0d8'], ['Purple', '#6a3d9a'], ['Plum', '#5a2a52'], ['Magenta', '#c0307a'], ['Fuchsia', '#d9308f'], ['Pink', '#ee8fb0'], ['Blush', '#f1c4c0'], ['Rose', '#d9808a'],
  ['Silver', '#b9bcc2'], ['Gold', '#c9a24a'], ['Gum', '#b38a5c'], ['Stone', '#b7b0a2'], ['Slate', '#5c6672'], ['Ink', '#1b2233']
].map(([name, hex]) => ({ name, hex, lab: rgbToLab(...hexToRgb(hex)) }));
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const labOf = hex => { const rgb = hexToRgb(hex); return rgb ? rgbToLab(...rgb) : null; };
export function nearestName(hex) {
  const lab = labOf(hex); if (!lab) return '';
  let best = NAMES[0], bd = Infinity; for (const n of NAMES) { const d = dE(lab, n.lab); if (d < bd) { bd = d; best = n; } }
  return best.name;
}
export const colourDistance = (a, b) => { const x = labOf(a), y = labOf(b); return x && y ? dE(x, y) : Infinity; };

async function rgbOf(photoDataUrl, max = 420) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(photoDataUrl || '')); if (!m) return null;
  return rgbOfBuffer(Buffer.from(m[2], 'base64'), max);
}
async function rgbOfBuffer(buf, max = 420) {
  const { data, info } = await sharp(buf).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, rgb = Buffer.alloc(w * h * 3);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = data[k * info.channels]; rgb[k * 3 + 1] = data[k * info.channels + 1]; rgb[k * 3 + 2] = data[k * info.channels + 2]; }
  return { rgb, w, h };
}

// The colours the product really has: [{ hex, name, share }] largest first. Panels a shade apart are one colour; slivers under 2.5% are dropped.
export async function measureColours(input, { max = 420 } = {}) {
  const img = Buffer.isBuffer(input) ? await rgbOfBuffer(input, max) : await rgbOf(input, max);
  if (!img) return [];
  const { rgb, w, h } = img, { mask } = productMask(rgb, w, h);
  let product = 0; for (let k = 0; k < w * h; k++) if (mask[k]) product++;
  if (product < w * h * 0.02) return [];
  const seg = segmentPanels(rgb, w, h, mask), sums = new Map();
  // A panel that owns a big part of the picture's edge is the backdrop (a white wall, a table), even when the mask let it through: drop it.
  const edge = Math.max(2, Math.round(Math.min(w, h) * 0.03)), border = new Map(); let borderPx = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (x >= edge && y >= edge && x < w - edge && y < h - edge) continue; const id = seg.labels[y * w + x]; borderPx++; if (id >= 0) border.set(id, (border.get(id) || 0) + 1); }
  const backdrop = new Set([...border].filter(([, n]) => n / borderPx > 0.25).map(([id]) => id));
  product = 0; for (let k = 0; k < w * h; k++) { const id = seg.labels[k]; if (id >= 0 && !backdrop.has(id)) product++; }
  if (product < w * h * 0.02) return [];
  for (let k = 0; k < w * h; k++) { const id = seg.labels[k]; if (id < 0 || backdrop.has(id)) continue; const s = sums.get(id) || [0, 0, 0, 0]; s[0] += rgb[k * 3]; s[1] += rgb[k * 3 + 1]; s[2] += rgb[k * 3 + 2]; s[3]++; sums.set(id, s); }
  let out = [...sums.values()].map(s => { const c = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; return { rgb: c, hex: toHex(c), share: s[3] / product, lab: rgbToLab(...c) }; }).sort((a, b) => b.share - a.share);
  // merge colours that are only a shade apart (same material in light and shadow)
  const merged = [];
  for (const c of out) { const near = merged.find(m => dE(m.lab, c.lab) < 9); if (near) { const t = near.share + c.share; near.rgb = near.rgb.map((v, i) => (v * near.share + c.rgb[i] * c.share) / t); near.share = t; near.hex = toHex(near.rgb); near.lab = rgbToLab(...near.rgb); } else merged.push({ ...c }); }
  return merged.filter(c => c.share >= 0.025).sort((a, b) => b.share - a.share).slice(0, 8).map(c => ({ hex: c.hex, name: nearestName(c.hex), share: Math.round(c.share * 1000) / 1000 }));
}

// Pulls the pack's colours onto the measured ones. A colour the assistant saw is moved to the real pixel colour and named for it; a measured colour
// the assistant missed is added; suggested alternatives are left alone. BOM colours that carry a hex are snapped the same way.
export function snapColours(input, measured) {
  const pack = structuredClone(input);
  if (!measured?.length) return { pack, changed: 0 };
  let changed = 0;
  const near = (hex, within) => { let best = null, bd = within; for (const m of measured) { const d = colourDistance(hex, m.hex); if (d < bd) { bd = d; best = m; } } return best; };
  const used = new Set();
  pack.colorways = (pack.colorways || []).map(c => {
    if (/suggested alternative/i.test(c.notes || '') || !hexToRgb(c.swatch)) return c;
    const m = near(c.swatch, 32); if (!m) return c;
    used.add(m.hex); if (m.hex === c.swatch) return c;
    changed++;
    const renamed = colourDistance(c.swatch, m.hex) > 26; // the assistant's own name stays unless its colour was really far from the pixels
    const lead = String(c.notes || '').split(' · ')[0], role = lead && !/^(seen in|suggested)/i.test(lead) ? lead : '';
    return { ...c, name: renamed ? m.name : c.name, swatch: m.hex, notes: `${role ? role + ' · ' : ''}Seen in the photo, measured from the pixels (${Math.round(m.share * 100)}% of the product) — client to confirm` };
  });
  // two observed colourways that now read as the same colour are one
  const kept = [];
  pack.colorways = pack.colorways.filter(c => { if (/suggested alternative/i.test(c.notes || '') || !hexToRgb(c.swatch)) return true; if (kept.some(k => colourDistance(k, c.swatch) < 10)) { changed++; return false; } kept.push(c.swatch); return true; });
  const have = pack.colorways.length;
  for (const m of measured) {
    if (pack.colorways.length >= 6) break;
    if (m.share < 0.06 || used.has(m.hex) || pack.colorways.some(c => hexToRgb(c.swatch) && colourDistance(c.swatch, m.hex) < 20 && !/suggested alternative/i.test(c.notes || ''))) continue;
    pack.colorways.push({ name: m.name, code: '', swatch: m.hex, notes: `Seen in the photo, measured from the pixels (${Math.round(m.share * 100)}% of the product) — client to confirm` }); changed++;
  }
  void have;
  pack.bom = (pack.bom || []).map(r => {
    const mm = /#([0-9a-f]{6})\b/i.exec(r.color || ''); if (!mm) return r;
    const m = near('#' + mm[1].toLowerCase(), 25); if (!m || m.hex === '#' + mm[1].toLowerCase()) return r;
    changed++; return { ...r, color: colourWithCode(String(r.color).replace(/#[0-9a-f]{6}/i, m.hex)) };
  });
  // the Pantone C code follows the colour: a colourway whose colour was moved gets a new code
  pack.colorways = codeColourways(pack, { keep: false }).pack.colorways;
  return { pack, changed };
}

// ---- the hero image ----
export const heroConfig = (env = process.env) => {
  if (env.HERO_DISABLED === 'true') return { provider: 'off', configured: false, note: 'switched off (HERO_DISABLED)' };
  const c = imageConfig(env); return { provider: c.provider, configured: c.configured && c.provider !== 'off', model: c.model, quality: c.quality, note: c.note };
};
export const HERO_CANDIDATES = () => Math.max(1, Math.min(4, Number(process.env.HERO_CANDIDATES) || 3));

export function heroPrompt({ title = '', category = '' } = {}) {
  return [`The reference photo shows ${title || 'a product'}${category ? ` (${category})` : ''}. Redraw exactly this product as a clean, photorealistic studio product photograph: a three-quarter front view at eye level, the product centred and filling about 70% of the frame, on a plain light-grey seamless background with soft diffused studio lighting and a gentle contact shadow.`,
    'Keep it the SAME product: identical shape, silhouette and proportions, identical materials and surface textures, identical colours and where each colour sits, and every visible detail (stitching, panels, overlays, hardware, soles, trims) in the same place.',
    'Remove only what is not the product: the original background, hands, people, props, glare, watermarks and compression noise. Do not add, remove or restyle any feature. Do not invent logos, text or branding that are not in the photo; where the photo has a logo, keep it simple and in the same place. No people, no extra objects.'].join('\n');
}

const fixtureHero = async (photoBuf, i) => {
  // test stand-in: the photo on a light backdrop, a little different each time
  const base = sharp(photoBuf).rotate().resize({ width: 1024, height: 1024, fit: 'contain', background: '#e6e7ea' }).modulate({ brightness: 1 + (i % 3) * 0.04 });
  return base.jpeg({ quality: 86 }).toBuffer();
};
const toJpegBuffer = async url => { const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(url || '')); if (!m) return null; return sharp(Buffer.from(m[2], 'base64')).rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer(); };

// → [{ buffer, prompt }]: n candidates, made one after another so a refusal on one does not lose the rest
export async function heroCandidates({ photos, meta, n = HERO_CANDIDATES(), cfg = heroConfig() }) {
  if (!cfg.configured) throw new Error('No image model is connected: set OPENAI_API_KEY on the service.');
  const refs = []; for (const p of photos.slice(0, 2)) { const b = await toJpegBuffer(p); if (b) refs.push(b); }
  if (!refs.length) throw new Error('There is no photo to make a hero image from.');
  const prompt = heroPrompt(meta), out = []; let lastErr = null;
  for (let i = 0; i < n; i++) {
    try {
      const buffer = cfg.provider === 'fixture' ? await fixtureHero(refs[0], i) : await timed('imagegen-hero', () => openaiEdit({ images: refs, prompt, cfg: { ...cfg, size: process.env.HERO_SIZE || '1024x1024' } }));
      out.push({ buffer, prompt });
    } catch (e) { lastErr = e; if (e.status === 401 || e.status === 403 || e.status === 429) break; }
  }
  if (!out.length) throw lastErr || new Error('The image model made nothing.');
  return out;
}

// A second pass on the best try: the photo and the draft go in together, with what the check found wrong, and the model fixes only that.
export const HERO_APPROVE_MIN = () => Number(process.env.HERO_APPROVE_MIN) || 80;
export const HERO_REFINE_ROUNDS = () => { const n = Number(process.env.HERO_REFINE_ROUNDS); return Number.isFinite(n) && process.env.HERO_REFINE_ROUNDS !== undefined && process.env.HERO_REFINE_ROUNDS !== '' ? Math.max(0, Math.min(3, Math.floor(n))) : 2; };
export function refinePrompt({ title = '', category = '', issues = '' } = {}) {
  return [`Image 1 is the reference photo of ${title || 'a product'}${category ? ` (${category})` : ''}. Image 2 is a draft studio redraw of it.`,
    'Redraw image 2 as the same clean studio photograph (same three-quarter front view, framing, plain light-grey background, soft light), changing only what does not match image 1.',
    `What does not match: ${clip(issues, 400) || 'colours, panel layout or proportions drift from the photo'}.`,
    'Make the shape, proportions, materials, colours and where each colour sits, and every visible detail match image 1. Keep everything in image 2 that already matches. Do not add logos, text or features that are not in image 1.'].join('\n');
}
export async function refineHero({ photos, best, issues, meta, cfg = heroConfig() }) {
  if (!cfg.configured) throw new Error('No image model is connected: set OPENAI_API_KEY on the service.');
  const ref = await toJpegBuffer(photos[0]); if (!ref) throw new Error('There is no photo to refine against.');
  const prompt = refinePrompt({ ...meta, issues });
  const buffer = cfg.provider === 'fixture' ? await fixtureHero(ref, 5) : await timed('imagegen-hero', () => openaiEdit({ images: [ref, best], prompt, cfg: { ...cfg, size: process.env.HERO_SIZE || '1024x1024' } }));
  return { buffer, prompt };
}

// ---- choosing among candidates ----
const PICK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['candidates'],
  properties: { candidates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'score', 'issues'],
    properties: { index: { type: 'integer', description: 'Candidate number, from 1' }, score: { type: 'integer', description: '0-100: how faithfully it shows the SAME product as the photo' },
      issues: { type: 'string', description: 'What differs from the photo (shape, proportions, colour, a detail added or lost, an invented logo or text), or "none"' } } } } }
};
const PICK_SYSTEM = `You compare candidate studio pictures against a reference photo of a product. The candidates were drawn from the photo by an image model.
Score each candidate 0-100 for how faithfully it shows the SAME product: silhouette and proportions, materials and textures, colours and where each sits, every visible detail in the same place. Ignore the clean background and lighting, which are meant to differ.
Penalise hard: a changed shape or proportion, a colour changed or moved, a detail added, lost or moved, a logo or text that is not in the photo. Be strict: 90+ means a factory would build the same product from it.`;

export async function callJsonSchema(system, content, schema, { model = CHECK_MODEL(), maxTokens = 1500 } = {}) {
  const client = new Anthropic(), base = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] };
  let response;
  try { response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema } } }); }
  catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; response = await client.messages.create({ ...base, system: system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(schema) }); }
  if (response.stop_reason === 'refusal') throw new Error(`Model declined (${response.stop_details?.category || 'policy'})`);
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

// How far a candidate's colours are from the photo's: each of the photo's colours (weighted by its share) to the nearest colour in the candidate.
export function paletteDrift(photoPalette, candidatePalette) {
  if (!photoPalette?.length || !candidatePalette?.length) return null;
  let total = 0, w = 0;
  for (const p of photoPalette) { const d = Math.min(...candidatePalette.map(c => colourDistance(p.hex, c.hex))); total += d * p.share; w += p.share; }
  return w ? Math.round(total / w * 10) / 10 : null;
}

// → { scores: [{ index, score, drift, issues, total }], best: index (0-based) }
export async function pickHero({ photo, candidates, photoPalette, cfg = heroConfig() }) {
  const drifts = []; for (const c of candidates) drifts.push(paletteDrift(photoPalette, await measureColours(c.buffer)));
  let judged;
  if (cfg.provider === 'fixture' || process.env.AI_FIXTURE) judged = candidates.map((_, i) => ({ index: i + 1, score: 90 - i * 3, issues: 'none' }));
  else {
    const content = [{ type: 'text', text: 'The reference photo:' }]; const ph = dataUrlToImageBlock(photo); if (ph) content.push(ph);
    candidates.forEach((c, i) => { content.push({ type: 'text', text: `Candidate ${i + 1}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.buffer.toString('base64') } }); });
    content.push({ type: 'text', text: 'Score every candidate.' });
    try { judged = (await timed('anthropic', () => callJsonSchema(PICK_SYSTEM, content, PICK_SCHEMA))).candidates; } catch { judged = candidates.map((_, i) => ({ index: i + 1, score: 0, issues: 'The comparison could not run.' })); }
  }
  const scores = candidates.map((_, i) => { const j = judged.find(x => x.index === i + 1) || { score: 0, issues: '' }, drift = drifts[i], score = Math.max(0, Math.min(100, Math.round(Number(j.score) || 0)));
    // a colour that has drifted from the photo costs points whatever the vision model said
    return { index: i, score, drift, issues: clip(j.issues, 300), total: Math.round(score - Math.min(25, (drift || 0) * 0.9)) }; });
  let best = 0; scores.forEach((s, i) => { if (s.total > scores[best].total) best = i; });
  return { scores, best };
}

// A downsized JPEG for the page.
export const heroThumb = async (buf, w = 800, q = 84) => `data:image/jpeg;base64,${(await sharp(buf).resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: q }).toBuffer()).toString('base64')}`;
