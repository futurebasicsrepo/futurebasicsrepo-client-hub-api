// Reads a product photo (usually a screenshot from Instagram or Pinterest) and drafts the tech pack from it:
// category, description, callouts pinned on the photo, measurements for the sample size, materials, construction,
// colourways and notes. The result is a draft for a human to check — it is labelled as such in the pack.
//
// Live path: Claude via @anthropic-ai/sdk when ANTHROPIC_API_KEY is set. Test path: AI_FIXTURE points at a JSON file
// with the same shape, so the merge, the callout crops and the editor flow can be exercised without a key.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_FIXTURE);

const PRODUCT_TYPES = ['footwear', 'top', 'bottom', 'outerwear', 'headwear', 'bag', 'accessory', 'other'];

// Structured-output schema. Every property is required and objects are closed, as structured outputs expect.
const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['productType', 'category', 'styleName', 'description', 'fabricSummary', 'fitBlock', 'callouts', 'pom', 'bom', 'construction', 'colorways', 'care', 'notes', 'confidence'],
  properties: {
    productType: { type: 'string', enum: PRODUCT_TYPES },
    category: { type: 'string', description: 'Category line for the pack, e.g. "Footwear — chunky runner" or "Apparel — heavyweight hoodie"' },
    styleName: { type: 'string' },
    description: { type: 'string', description: '2–4 sentences: what the product is, its construction and signature details, as seen in the photo' },
    fabricSummary: { type: 'string', description: 'One line of the main materials, e.g. "Full-grain leather upper · rubber cupsole"' },
    fitBlock: { type: 'string', description: 'Fit / last / block, e.g. "Court last, D width" or "Relaxed fit, drop shoulder"' },
    callouts: {
      type: 'array', minItems: 5, maxItems: 12,
      items: { type: 'object', additionalProperties: false, required: ['label', 'spec', 'note', 'x', 'y'],
        properties: { label: { type: 'string' }, spec: { type: 'string', description: 'Material / construction spec for this detail' }, note: { type: 'string', description: 'Note to factory' },
          x: { type: 'number', minimum: 0, maximum: 1, description: 'Horizontal position of the detail on photo 1, 0 = left edge, 1 = right edge' },
          y: { type: 'number', minimum: 0, maximum: 1, description: 'Vertical position on photo 1, 0 = top, 1 = bottom' } } }
    },
    pom: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['code', 'sample', 'step', 'basis'],
      properties: { code: { type: 'string', description: 'Code from the measurement template given in the prompt' }, sample: { type: 'number', description: 'Value for the sample size, in inches' }, step: { type: 'number', description: 'Change per size step, in inches (0 if it does not grade)' }, basis: { type: 'string', description: 'Where the value comes from: measured from the photo at scale, a published industry reference, or an assumption' } } } },
    bom: { type: 'array', minItems: 3, maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['component', 'material', 'spec', 'placement'],
      properties: { component: { type: 'string' }, material: { type: 'string' }, spec: { type: 'string' }, placement: { type: 'string' } } } },
    construction: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['area', 'detail'], properties: { area: { type: 'string' }, detail: { type: 'string' } } } },
    colorways: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['name', 'hex', 'pantone', 'role', 'observed'],
      properties: { name: { type: 'string' }, hex: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, pantone: { type: 'string', description: 'Closest Pantone TCX reference, e.g. "19-4007 TCX", or empty if unsure' }, role: { type: 'string', description: 'Where this colour sits, e.g. "upper", "midsole", "accent"' }, observed: { type: 'boolean', description: 'true if seen in the photo, false if a suggested alternative' } } } },
    care: { type: 'object', additionalProperties: false, required: ['fiber', 'instructions'], properties: { fiber: { type: 'string' }, instructions: { type: 'string' } } },
    notes: { type: 'string', description: 'Notes to factory: assumptions made, what could not be seen in the photo, open questions for the client, and the spec basis with references' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] }
  }
};

function systemPrompt() {
  return `You are the product-development assistant at Future Basics, a studio that turns a customer's idea into a factory-ready tech pack. A prospective customer has uploaded a photo (often a screenshot from Instagram or Pinterest) of a product they want made, plus a few words about it. Draft the first version of the tech pack from what you can see.

How to work:
- Identify the product type and describe what you see: silhouette, panels, closures, construction, visible materials and finishes, branding placements (describe them generically — never name or copy another brand's logo or trademark; this is a reference for an original product).
- Callouts: pick the 6–12 details a factory must get right. Place each at the exact spot on the photo where that detail is, as fractions of the image width and height. Spread them over the product; do not stack them.
- Measurements: fill the template codes given with values for the sample size in inches. Measure proportions from the photo where you can and anchor them to published category norms (size charts, lab-measured stack heights, standard trims). Say which in "basis". Never invent precision you do not have — round sensibly.
- Materials and construction: name the most common, best-practice materials and methods for this product type when the photo cannot tell you (e.g. full-grain leather 1.4–1.6 mm for a court sneaker upper; 400 gsm brushed-back fleece for a heavyweight hoodie). Mark them as defaults to confirm.
- Colours: list the colours you observe (with a hex you estimate and the closest Pantone TCX if you are confident) and up to two suggested alternatives marked observed=false.
- Notes: be explicit about assumptions, what the photo does not show (medial side, interior, sole), and the questions the customer must answer. End with a short "Spec basis" list naming the references you leaned on.

Write for a factory: terse, specific, measurable. British/American spelling does not matter; units are inches unless a trim is conventionally metric (mm, gsm, SPI).`;
}

function userPrompt({ title, notes, pomTemplate, sizes, sampleSize }) {
  return `Customer says it is: ${title || '(no name given)'}
Customer notes: ${notes || '(none)'}
Size run: ${sizes.join(', ')} · sample size ${sampleSize}
Measurement template codes to fill (code — name — how to measure):
${pomTemplate.map(r => `${r.code} — ${r.name} — ${r.how}`).join('\n')}

Photo 1 is the main reference; later photos are extra views if present. Draft the tech pack now.`;
}

function parseDraft(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  const obj = JSON.parse(start >= 0 ? t.slice(start, end + 1) : t);
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.callouts)) throw new Error('Draft is not in the expected shape');
  return obj;
}

const dataUrlToImageBlock = (dataUrl) => {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] } };
};

// Returns { draft, model, usage } or throws. `photos` are data URLs; the first is the main reference.
export async function draftFromPhotos({ photos, title, notes, pomTemplate, sizes, sampleSize }) {
  if (process.env.AI_FIXTURE) { await new Promise(r => setTimeout(r, Number(process.env.AI_FIXTURE_DELAY_MS || 0))); return { draft: JSON.parse(readFileSync(process.env.AI_FIXTURE, 'utf8')), model: 'fixture', usage: null }; }
  const client = new Anthropic();
  const images = photos.map(dataUrlToImageBlock).filter(Boolean);
  if (!images.length) throw new Error('No readable photo');
  const content = [...images, { type: 'text', text: userPrompt({ title, notes, pomTemplate, sizes, sampleSize }) }];
  const base = { model: AI_MODEL, max_tokens: 16000, system: systemPrompt(), messages: [{ role: 'user', content }] };
  let response;
  try {
    // Structured output keeps the draft on-schema; the server-side fallback re-runs on another model if a safeguard declines.
    response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: DRAFT_SCHEMA } } });
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    // Older gateway or schema rejected: fall back to a plain request and parse the JSON out of the text.
    response = await client.messages.create({ ...base, output_config: { effort: 'high' },
      system: base.system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(DRAFT_SCHEMA) });
  }
  if (response.stop_reason === 'refusal') throw new Error(`Model declined (${response.stop_details?.category || 'policy'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('Draft was cut off (max_tokens)');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { draft: parseDraft(text), model: response.model || AI_MODEL, usage: response.usage || null };
}

// Square detail crop around a callout, matching the editor's own 480px thumbnails, with a soft ring on the spot.
export async function calloutCrop(photoDataUrl, x, y, { zoom = 0.26 } = {}) {
  const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(photoDataUrl); if (!m) return '';
  const img = sharp(Buffer.from(m[1], 'base64')); const { width: W, height: H } = await img.metadata();
  if (!W || !H) return '';
  const side = Math.max(32, Math.round(W * zoom));
  const cx = Math.round(x * W), cy = Math.round(y * H);
  const left = Math.min(Math.max(0, cx - Math.floor(side / 2)), Math.max(0, W - side)), top = Math.min(Math.max(0, cy - Math.floor(side / 2)), Math.max(0, H - side));
  const w = Math.min(side, W - left), h = Math.min(side, H - top);
  const rx = ((cx - left) / w) * 480, ry = ((cy - top) / h) * 480;
  const ring = Buffer.from(`<svg width="480" height="480" xmlns="http://www.w3.org/2000/svg"><circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="46" fill="none" stroke="rgba(214,60,40,0.9)" stroke-width="5"/><circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="5" fill="rgba(214,60,40,0.9)"/></svg>`);
  const out = await img.extract({ left, top, width: w, height: h }).resize(480, 480, { fit: 'fill' }).composite([{ input: ring }]).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

const HEX_OK = /^#[0-9a-f]{6}$/i;
const num = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '');

// Merges the model's draft into a seeded pack. `seed` comes from seedTechPack for the classified product type.
export async function applyDraftToPack(seed, draft, { photos, sizes, sampleSize, model }) {
  const pack = structuredClone(seed);
  const sampleIdx = Math.max(0, sizes.indexOf(sampleSize));
  pack.style = { ...pack.style, styleName: draft.styleName || pack.style.styleName, category: draft.category || pack.style.category, description: draft.description || pack.style.description, fabricSummary: draft.fabricSummary || pack.style.fabricSummary, fitBlock: draft.fitBlock || pack.style.fitBlock, sampleSize };
  // callouts on photo 1 with crops
  if (pack.sketches[0]) {
    const sk = pack.sketches[0], callouts = [];
    for (const [i, c] of (draft.callouts || []).slice(0, 12).entries()) {
      const x = Math.min(1, Math.max(0, Number(c.x) || 0)), y = Math.min(1, Math.max(0, Number(c.y) || 0));
      let photo = ''; try { photo = await calloutCrop(photos[0], x, y); } catch { photo = ''; }
      callouts.push({ n: i + 1, label: String(c.label || '').slice(0, 80), spec: String(c.spec || '').slice(0, 300), note: String(c.note || '').slice(0, 300), photo, x, y });
    }
    sk.callouts = callouts;
  }
  // measurements: template rows filled for the sample size and graded by step
  const byCode = new Map((draft.pom || []).map(r => [String(r.code || '').toUpperCase(), r]));
  pack.pom = pack.pom.map(row => {
    const r = byCode.get(String(row.code).toUpperCase()); if (!r || !Number.isFinite(Number(r.sample))) return row;
    const values = Object.fromEntries(sizes.map((s, i) => [s, num(Number(r.sample) + (i - sampleIdx) * (Number(r.step) || 0))]));
    return { ...row, values };
  });
  const pomBasis = (draft.pom || []).filter(r => r.basis).map(r => `• ${r.code} — ${r.basis}`).join('\n');
  // materials: the model's rows, keeping the seed's qty/unit conventions where components match
  if (Array.isArray(draft.bom) && draft.bom.length) {
    pack.bom = draft.bom.slice(0, 20).map(r => { const s = seed.bom.find(x => x.component.toLowerCase() === String(r.component || '').toLowerCase());
      return { component: String(r.component || '').slice(0, 120), material: String(r.material || '').slice(0, 200), spec: String(r.spec || '').slice(0, 300), supplier: 'TBD', ref: '', color: '', placement: String(r.placement || s?.placement || '').slice(0, 200), qty: s?.qty || '1', unit: s?.unit || '', notes: 'Default — confirm' }; });
  }
  if (Array.isArray(draft.construction) && draft.construction.length) pack.construction = draft.construction.slice(0, 12).map(r => ({ area: String(r.area || '').slice(0, 120), detail: String(r.detail || '').slice(0, 600) }));
  if (Array.isArray(draft.colorways) && draft.colorways.length) pack.colorways = draft.colorways.slice(0, 6).filter(c => HEX_OK.test(c.hex || '')).map(c => ({ name: String(c.name || '').slice(0, 80), code: String(c.pantone || '').slice(0, 40), swatch: c.hex.toLowerCase(), notes: `${c.role ? c.role + ' · ' : ''}${c.observed ? 'Seen in the photo' : 'Suggested alternative'} — client to confirm` }));
  if (draft.care?.fiber || draft.care?.instructions) pack.care = { ...pack.care, fiber: String(draft.care.fiber || pack.care.fiber).slice(0, 300), instructions: String(draft.care.instructions || pack.care.instructions).slice(0, 1500) };
  pack.notes = [`AI DRAFT — written from the uploaded photo by the Future Basics assistant (${model}); confidence ${draft.confidence || 'medium'}. Every value is a starting point for the client and Future Basics to confirm; nothing here is released to a factory until all three signatures are in.`,
    String(draft.notes || '').slice(0, 4000), pomBasis ? `MEASUREMENT BASIS\n${pomBasis}` : ''].filter(Boolean).join('\n\n').slice(0, 6000);
  return pack;
}

export function productTypeLabel(draft) {
  return String(draft.category || '').slice(0, 120) || ({ footwear: 'Footwear', top: 'Apparel — top', bottom: 'Apparel — bottom', outerwear: 'Apparel — outerwear', headwear: 'Headwear', bag: 'Bag', accessory: 'Accessory' }[draft.productType] || 'Product');
}

// ---- Factory-language translation ----
// Translates the pack's human-written strings into Simplified Chinese for the factory. Codes, numbers, units, Pantone
// references and brand names are kept as they are. Returns { map: { source: translation }, model }.
const TRANSLATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 't'], properties: { i: { type: 'integer' }, t: { type: 'string' } } } } }
};
const LANG_NAMES = { zh: 'Simplified Chinese (简体中文) as used in apparel and footwear factories in mainland China' };
export const TRANSLATION_LANGS = Object.keys(LANG_NAMES);

export async function translateStrings(strings, { lang = 'zh' } = {}) {
  const list = [...new Set(strings.map(s => String(s ?? '').trim()).filter(Boolean))];
  if (!LANG_NAMES[lang]) throw new Error(`Unsupported language ${lang}`);
  if (!list.length) return { map: {}, model: null };
  if (process.env.AI_FIXTURE) { await new Promise(r => setTimeout(r, Number(process.env.AI_FIXTURE_DELAY_MS || 0))); return { map: Object.fromEntries(list.map(s => [s, `中文：${s}`])), model: 'fixture' }; }
  const client = new Anthropic();
  const system = `You translate garment and footwear tech packs from English into ${LANG_NAMES[lang]}. The reader is a factory's technical and production team, so use the standard industry terms they use (e.g. 面料, 里布, 鞋面, 中底, 大底, 针距, 色号, 公差, 唛头). Keep measurement codes, numbers, units, tolerances, Pantone/TCX codes, style numbers, supplier references and brand names (Future Basics) exactly as written. Keep line breaks. Do not add explanations. Translate every item; return each item's index with its translation.`;
  const map = {}; let model = AI_MODEL;
  for (let start = 0; start < list.length; start += 80) {
    const chunk = list.slice(start, start + 80);
    const base = { model: AI_MODEL, max_tokens: 12000, system, messages: [{ role: 'user', content: JSON.stringify({ items: chunk.map((t, i) => ({ i, en: t })) }) }] };
    let response;
    try {
      response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: TRANSLATE_SCHEMA } } });
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      response = await client.messages.create({ ...base, system: system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(TRANSLATE_SCHEMA) });
    }
    if (response.stop_reason === 'refusal') throw new Error(`Model declined (${response.stop_details?.category || 'policy'})`);
    if (response.stop_reason === 'max_tokens') throw new Error('Translation was cut off (max_tokens)');
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    for (const it of Array.isArray(obj.items) ? obj.items : []) { const src = chunk[Number(it.i)]; const t = String(it.t ?? '').trim(); if (src && t) map[src] = t; }
    model = response.model || AI_MODEL;
  }
  return { map, model };
}
