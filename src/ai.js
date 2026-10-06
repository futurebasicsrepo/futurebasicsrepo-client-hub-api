import { timed } from './telemetry.js';
// Reads a product photo (usually a screenshot from Instagram or Pinterest) and drafts the tech pack from it:
// category, description, callouts pinned on the photo, measurements for the sample size, materials, construction,
// colourways and notes. The result is a draft for a human to check — it is labelled as such in the pack.
//
// Live path: Claude via @anthropic-ai/sdk when ANTHROPIC_API_KEY is set. Test path: AI_FIXTURE points at a JSON file
// with the same shape, so the merge, the callout crops and the editor flow can be exercised without a key.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { familyOf, rangeFor, fixUnitSlip, auditRows } from './plausible.js';
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
    pom: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['code', 'name', 'how', 'tolerance', 'sample', 'step', 'basis'],
      properties: { code: { type: 'string', description: 'Code from the measurement template given in the prompt, or a new letter code for a point of measure you propose when the template is missing or does not fit' },
        name: { type: 'string', description: 'Empty for a template code; the name of the point of measure when you propose one' }, how: { type: 'string', description: 'Empty for a template code; how to measure it when you propose one' }, tolerance: { type: 'string', description: 'Empty for a template code; e.g. "±0.25" when you propose one' },
        sample: { type: 'number', description: 'Value for the sample size, in inches' }, step: { type: 'number', description: 'Change per size step, in inches (0 if it does not grade)' }, basis: { type: 'string', description: 'Where the value comes from: measured from the photo at scale, a published industry reference, or an assumption' } } } },
    bom: { type: 'array', minItems: 3, maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['component', 'material', 'spec', 'color', 'placement'],
      properties: { component: { type: 'string' }, material: { type: 'string' }, spec: { type: 'string', description: 'Construction and visible surface or finish: matte, pebbled, ribbed, glossy, brushed, mesh…' },
        color: { type: 'string', description: 'The colour of this part as seen in the photo: a plain colour name and a hex, e.g. "Navy #1f2a44"' }, placement: { type: 'string', description: 'Where on the product this part sits' } } } },
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
- Measurements: fill the template codes given with values for the sample size in inches. Measure proportions from the photo where you can and anchor them to published category norms (size charts, lab-measured stack heights, standard trims). Say which in "basis". Never invent precision you do not have — round sensibly. If no template is given, or it does not fit the product, propose the industry-standard points of measure for it instead (6–12 rows with letter codes, name, how to measure and tolerance). Leave out any row you cannot anchor to the photo or to a reference you know: a second pass researches comparable styles online for whatever you leave out, and a blank is better than a guess.
- Materials and construction: name the most common, best-practice materials and methods for this product type when the photo cannot tell you (e.g. full-grain leather 1.4–1.6 mm for a court sneaker upper; 400 gsm brushed-back fleece for a heavyweight hoodie). Mark them as defaults to confirm.
- Colours: list the colours you observe (with a hex you estimate and the closest Pantone TCX if you are confident) and up to two suggested alternatives marked observed=false.
- Write the pack so that someone who has never seen the photo could draw the product from the written fields alone. An independent reviewer will do exactly that (an image model draws the product from the pack, then the drawing is compared with the photo on seven points: product type, silhouette, proportions, materials, colours, construction, branding), and the pack is judged on how close that drawing is. So:
  - The first construction row is "Silhouette and proportions": the overall shape in plain visual words, as seen (a shoe: toe-box shape, collar height, sole profile and thickness, panel layout; a hoodie or jacket: length, shoulder, sleeve, hood or collar shape, hem; a bag: outline, depth, handle and strap shape). Add a second row "Colour blocking": which colour is on which part.
  - Every bill-of-materials row names the material, its visible surface or finish, its colour as a name and a hex, and exactly where it sits. Parts that are different colours are different rows.
  - Every logo, graphic, label, stripe or print: where it is, how large relative to the product, what colour, how applied. Describe generically.
  - Measurements keep the proportions you can see: if the photo shows a long, low shape, the numbers must too.
- Notes: be explicit about assumptions, what the photo does not show (medial side, interior, sole), and the questions the customer must answer. End with a short "Spec basis" list naming the references you leaned on.

Write for a factory: terse, specific, measurable. British/American spelling does not matter; units are inches unless a trim is conventionally metric (mm, gsm, SPI).`;
}

function userPrompt({ title, notes, pomTemplate, sizes, sampleSize }) {
  return `Customer says it is: ${title || '(no name given)'}
Customer notes: ${notes || '(none)'}
Size run: ${sizes.join(', ')} · sample size ${sampleSize}
${pomTemplate.length ? `Measurement template codes to fill (code — name — how to measure):\n${pomTemplate.map(r => `${r.code} — ${r.name} — ${r.how}`).join('\n')}` : 'Measurement template: none for this product type — propose the standard points of measure.'}

Photo 1 is the main reference; later photos are extra views if present. Draft the tech pack now.`;
}

function parseDraft(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  const obj = JSON.parse(start >= 0 ? t.slice(start, end + 1) : t);
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.callouts)) throw new Error('Draft is not in the expected shape');
  obj.callouts = obj.callouts.map(normalizeCallout);
  return obj;
}
// A coordinate as a fraction of the image, from a number, a numeric string or a percentage; null when absent.
const frac = v => { if (v == null || v === '') return null; const n = Number(String(v).replace('%', '')); if (!Number.isFinite(n)) return null; const f = n > 1 && n <= 100 ? n / 100 : n; return f >= 0 && f <= 1 ? f : null; };
// Models that ignore the schema still describe a position somehow: x/y, position {x,y} or [x,y], left/top, cx/cy, xPct/yPct.
export function normalizeCallout(c) {
  const o = c && typeof c === 'object' ? c : {};
  const pos = o.position ?? o.pos ?? o.point ?? o.location ?? o.coords ?? null;
  const px = Array.isArray(pos) ? pos[0] : pos?.x ?? pos?.left, py = Array.isArray(pos) ? pos[1] : pos?.y ?? pos?.top;
  const x = frac(o.x ?? o.left ?? o.cx ?? o.xPct ?? o.x_pct ?? px), y = frac(o.y ?? o.top ?? o.cy ?? o.yPct ?? o.y_pct ?? py);
  return { label: String(o.label ?? o.name ?? o.title ?? '').trim(), spec: String(o.spec ?? o.specification ?? o.material ?? '').trim(), note: String(o.note ?? o.notes ?? o.factoryNote ?? '').trim(), x: x != null && y != null ? x : null, y: x != null && y != null ? y : null };
}
// Callouts that all sit on one spot are not placed either (the symptom of a draft without coordinates).
export function unplacedCallouts(callouts) {
  const placed = callouts.filter(c => c.x != null && c.y != null);
  const distinct = new Set(placed.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`));
  return placed.length < Math.ceil(callouts.length / 2) || (callouts.length > 1 && distinct.size <= 1);
}
// Second pass when the draft came back without positions: show the photo and the labels, ask only for where each one is.
const PLACE_SCHEMA = { type: 'object', additionalProperties: false, required: ['points'], properties: { points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'x', 'y'], properties: { i: { type: 'integer' }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } } } } } };
async function locateCalloutsRaw(photoDataUrl, labels) {
  if (!labels.length) return [];
  if (process.env.AI_FIXTURE) {
    // fixture: spread the pins over the busy part of the image so tests can see distinct crops
    const where = await locateProductRaw(photoDataUrl); const b = where.found ? where.box : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const cols = Math.ceil(Math.sqrt(labels.length));
    return labels.map((_, i) => ({ i, x: b.x + b.w * ((i % cols) + 0.5) / cols, y: b.y + b.h * (Math.floor(i / cols) + 0.5) / Math.ceil(labels.length / cols) }));
  }
  const client = new Anthropic();
  const image = dataUrlToImageBlock(photoDataUrl); if (!image) return [];
  const base = { model: AI_MODEL, max_tokens: 1500, system: 'You mark positions on a product photo for a tech pack. For each numbered detail, return the point on the image where that detail is, as fractions of the image width (x) and height (y). Spread points over the product; never stack them.',
    messages: [{ role: 'user', content: [image, { type: 'text', text: 'Details:\n' + labels.map((l, i) => `${i}: ${l}`).join('\n') }] }] };
  let response;
  try { response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: PLACE_SCHEMA } } }); }
  catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; response = await client.messages.create({ ...base, system: base.system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(PLACE_SCHEMA) }); }
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return (Array.isArray(obj.points) ? obj.points : []).map(p => ({ i: Number(p.i), x: frac(p.x), y: frac(p.y) })).filter(p => Number.isInteger(p.i) && p.x != null && p.y != null);
}

export const dataUrlToImageBlock = (dataUrl) => {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] } };
};

// Returns { draft, model, usage } or throws. `photos` are data URLs; the first is the main reference.
async function draftFromPhotosRaw({ photos, title, notes, pomTemplate, sizes, sampleSize }) {
  if (process.env.AI_FIXTURE) {
    await new Promise(r => setTimeout(r, Number(process.env.AI_FIXTURE_DELAY_MS || 0)));
    const draft = JSON.parse(readFileSync(process.env.AI_FIXTURE, 'utf8'));
    // "[noxy]" in the title simulates a model that answered without positions
    if (/\[noxy\]/.test(title || '')) draft.callouts = draft.callouts.map(({ x, y, ...rest }) => rest);
    // "[other]" simulates a product no template fits, answered with bare codes (the case the research pass exists for)
    if (/\[other\]/.test(title || '')) { draft.productType = 'accessory'; draft.category = 'Accessory — small leather goods'; draft.pom = draft.pom.slice(0, 2).map(({ name, how, tolerance, ...rest }) => rest); }
    draft.callouts = draft.callouts.map(normalizeCallout);
    await placeMissing(draft, photos[0]);
    return { draft, model: 'fixture', usage: null };
  }
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
  const draft = parseDraft(text);
  if (response.model && response.model !== AI_MODEL) console.warn(JSON.stringify({ level: 'warn', msg: 'draft served by a fallback model', model: response.model }));
  await placeMissing(draft, photos[0]);
  return { draft, model: response.model || AI_MODEL, usage: response.usage || null };
}
// No photo yet: draft from the brief alone. Same shape as a photo draft, but callouts carry no positions (they are
// pinned once a sketch or photo lands) and the model is told to lean on category norms and say so.
const BRIEF_SCHEMA = structuredClone(DRAFT_SCHEMA);
BRIEF_SCHEMA.properties.callouts.items = { type: 'object', additionalProperties: false, required: ['label', 'spec', 'note'],
  properties: { label: { type: 'string' }, spec: { type: 'string', description: 'Material / construction spec for this detail' }, note: { type: 'string', description: 'Note to factory' } } };
function briefSystemPrompt() {
  return systemPrompt().replace('A prospective customer has uploaded a photo (often a screenshot from Instagram or Pinterest) of a product they want made, plus a few words about it. Draft the first version of the tech pack from what you can see.',
    'There is no photo yet: a product has been set up with a title, a description and a brief. Draft the first version of the tech pack from the brief and category norms, so the team starts from a filled pack instead of a blank one.')
    .replace('- Callouts: pick the 6–12 details a factory must get right. Place each at the exact spot on the photo where that detail is, as fractions of the image width and height. Spread them over the product; do not stack them.',
      '- Callouts: pick the 6–12 details a factory must get right for this product type. There is no photo, so give no positions; they are pinned once a sketch arrives.')
    .replace('Measure proportions from the photo where you can and anchor them to published category norms', 'Anchor them to published category norms and the brief')
    .replace('what the photo does not show (medial side, interior, sole)', 'what only a photo or sketch could settle') + '\n\nMark confidence "low": everything here is a category default until a photo or sketch confirms it.';
}
async function draftFromBriefRaw({ title, notes, brief, pomTemplate, sizes, sampleSize }) {
  if (process.env.AI_FIXTURE) {
    await new Promise(r => setTimeout(r, Number(process.env.AI_FIXTURE_DELAY_MS || 0)));
    const draft = JSON.parse(readFileSync(process.env.AI_FIXTURE, 'utf8'));
    draft.callouts = draft.callouts.map(({ x, y, ...rest }) => normalizeCallout(rest)); draft.confidence = 'low';
    return { draft, model: 'fixture', usage: null };
  }
  const client = new Anthropic();
  const text = `${userPrompt({ title, notes, pomTemplate, sizes, sampleSize }).replace('Photo 1 is the main reference; later photos are extra views if present. Draft the tech pack now.', '')}Brief:\n${brief || '(none)'}\n\nThere is no photo. Draft the tech pack from the brief and category norms now.`;
  const base = { model: AI_MODEL, max_tokens: 16000, system: briefSystemPrompt(), messages: [{ role: 'user', content: [{ type: 'text', text }] }] };
  let response;
  try {
    response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'high', format: { type: 'json_schema', schema: BRIEF_SCHEMA } } });
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    response = await client.messages.create({ ...base, output_config: { effort: 'high' }, system: base.system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(BRIEF_SCHEMA) });
  }
  if (response.stop_reason === 'refusal') throw new Error(`Model declined (${response.stop_details?.category || 'policy'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('Draft was cut off (max_tokens)');
  const draft = parseDraft(response.content.filter(b => b.type === 'text').map(b => b.text).join(''));
  draft.callouts = (draft.callouts || []).map(({ x, y, ...rest }) => normalizeCallout(rest)); draft.confidence = 'low';
  return { draft, model: response.model || AI_MODEL, usage: response.usage || null };
}
// If the draft lacks positions (schema not honoured), ask for them; whatever is still unplaced stays unplaced.
async function placeMissing(draft, photo) {
  if (!Array.isArray(draft.callouts) || !draft.callouts.length || !unplacedCallouts(draft.callouts)) return;
  try {
    const points = await locateCallouts(photo, draft.callouts.map(c => c.label || c.spec || 'detail'));
    for (const p of points) if (draft.callouts[p.i]) { draft.callouts[p.i].x = p.x; draft.callouts[p.i].y = p.y; }
  } catch (e) { console.warn(JSON.stringify({ level: 'warn', msg: 'callout placement failed', err: e.message })); }
  if (unplacedCallouts(draft.callouts)) for (const c of draft.callouts) { c.x = null; c.y = null; }
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
      const placed = Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y)) && c.x != null && c.y != null;
      const x = placed ? Math.min(1, Math.max(0, Number(c.x))) : null, y = placed ? Math.min(1, Math.max(0, Number(c.y))) : null;
      let photo = ''; if (placed) { try { photo = await calloutCrop(photos[0], x, y); } catch { photo = ''; } }
      callouts.push({ n: i + 1, label: String(c.label || '').slice(0, 80), spec: String(c.spec || '').slice(0, 300), note: String(c.note || '').slice(0, 300), photo, x, y });
    }
    sk.callouts = callouts;
  }
  // measurements: template rows filled for the sample size and graded by step; rows the model proposed (named, not in
  // the template) are appended, so a product without a template still gets a measurement table
  const grade = r => Object.fromEntries(sizes.map((s, i) => [s, num(inches(r.sample) + (i - sampleIdx) * (inches(r.step) || 0))]));
  const byCode = new Map((draft.pom || []).filter(r => inches(r.sample) != null && String(r.code || '').trim()).map(r => [String(r.code).trim().toUpperCase(), r]));
  const used = new Set();
  pack.pom = pack.pom.map(row => { const key = String(row.code).toUpperCase(), r = byCode.get(key); if (!r) return row; used.add(key); return { ...row, values: grade(r) }; });
  for (const [code, r] of byCode) {
    if (used.has(code) || !String(r.name || '').trim() || pack.pom.length >= 80) continue;
    pack.pom.push({ code: code.slice(0, 8), name: String(r.name).slice(0, 160), how: String(r.how || '').slice(0, 400), tolerance: String(r.tolerance || '±0.25').slice(0, 24), values: grade(r) });
  }
  const pomBasis = (draft.pom || []).filter(r => r.basis).map(r => `• ${r.code}${r.researched ? ' (researched)' : ''} — ${r.basis}`).join('\n');
  const research = researchNote(draft.pomResearch);
  // materials: the model's rows, keeping the seed's qty/unit conventions where components match
  if (Array.isArray(draft.bom) && draft.bom.length) {
    pack.bom = draft.bom.slice(0, 20).map(r => { const s = seed.bom.find(x => x.component.toLowerCase() === String(r.component || '').toLowerCase());
      return { component: String(r.component || '').slice(0, 120), material: String(r.material || '').slice(0, 200), spec: String(r.spec || '').slice(0, 300), supplier: 'TBD', ref: '', color: String(r.color || '').slice(0, 120), placement: String(r.placement || s?.placement || '').slice(0, 200), qty: s?.qty || '1', unit: s?.unit || '', notes: 'Default — confirm' }; });
  }
  if (Array.isArray(draft.construction) && draft.construction.length) pack.construction = draft.construction.slice(0, 12).map(r => ({ area: String(r.area || '').slice(0, 120), detail: String(r.detail || '').slice(0, 600) }));
  if (Array.isArray(draft.colorways) && draft.colorways.length) pack.colorways = draft.colorways.slice(0, 6).filter(c => HEX_OK.test(c.hex || '')).map(c => ({ name: String(c.name || '').slice(0, 80), code: String(c.pantone || '').slice(0, 40), swatch: c.hex.toLowerCase(), notes: `${c.role ? c.role + ' · ' : ''}${c.observed ? 'Seen in the photo' : 'Suggested alternative'} — client to confirm` }));
  if (draft.care?.fiber || draft.care?.instructions) pack.care = { ...pack.care, fiber: String(draft.care.fiber || pack.care.fiber).slice(0, 300), instructions: String(draft.care.instructions || pack.care.instructions).slice(0, 1500) };
  pack.notes = [`AI DRAFT — written from the uploaded photo by the Future Basics assistant (${model}); confidence ${draft.confidence || 'medium'}. Every value is a starting point for the client and Future Basics to confirm; nothing here is released to a factory until all three signatures are in.`,
    String(draft.notes || '').slice(0, 2500), pomBasis ? `MEASUREMENT BASIS\n${pomBasis}`.slice(0, 1800) : '', research, checkNote(draft.pomChecks)].filter(Boolean).join('\n\n').slice(0, 7000);
  return pack;
}

export function productTypeLabel(draft) {
  return String(draft.category || '').slice(0, 120) || ({ footwear: 'Footwear', top: 'Apparel — top', bottom: 'Apparel — bottom', outerwear: 'Apparel — outerwear', headwear: 'Headwear', bag: 'Bag', accessory: 'Accessory' }[draft.productType] || 'Product');
}

// ---- Points of measure: research pass ----
// "11.5", "11.5 in", "11 1/2", "29.2 cm" or 740 mm → inches; null when there is no number in it.
export function inches(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /(-?\d+(?:[.,]\d+)?)(?:\s+(\d+)\/(\d+))?\s*(mm|cm|in\b|inch|inches|")?/i.exec(String(v).trim());
  if (!m) return null;
  let n = Number(m[1].replace(',', '.')); if (m[2] && Number(m[3])) n += Number(m[2]) / Number(m[3]);
  if (!Number.isFinite(n)) return null;
  const u = (m[4] || '').toLowerCase(); if (u === 'mm') n /= 25.4; else if (u === 'cm') n /= 2.54;
  return n;
}
// Codes of the draft rows that will become table rows: a template code with a value, or a named row with a value.
const usableCodes = (draft, pomTemplate) => {
  const tpl = new Set((pomTemplate || []).map(r => String(r.code).toUpperCase()));
  return new Set((draft?.pom || []).filter(r => inches(r.sample) != null && String(r.code || '').trim()).map(r => String(r.code).trim().toUpperCase()).filter((c, i, a) => tpl.has(c) || String(draft.pom.find(r => String(r.code || '').trim().toUpperCase() === c)?.name || '').trim()));
};
// Template rows the draft left without a usable value — and, when the product has no template, whether it still needs rows.
export function missingMeasurements(draft, pomTemplate) {
  const filled = usableCodes(draft, pomTemplate);
  const missing = (pomTemplate || []).filter(r => !filled.has(String(r.code).toUpperCase()));
  return { missing, needsRows: !(pomTemplate || []).length && filled.size < 3 };
}
const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['identified', 'comparables', 'rows', 'notes'],
  properties: {
    identified: { type: 'string', description: 'What the product is, as a retailer would list it — brand and style name when the photo makes them clear, otherwise the generic style' },
    comparables: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['name', 'url', 'what'], properties: { name: { type: 'string' }, url: { type: 'string' }, what: { type: 'string', description: 'Which measurements this page gave, with the listed figures and units' } } } },
    rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['code', 'name', 'how', 'tolerance', 'sample', 'step', 'basis', 'sources'],
      properties: { code: { type: 'string' }, name: { type: 'string' }, how: { type: 'string' }, tolerance: { type: 'string' }, sample: { type: 'number', description: 'Value for the sample size, in inches' }, step: { type: 'number', description: 'Change per size step in inches, 0 if it does not grade' },
        basis: { type: 'string', description: 'Which comparable gave it, the listed figure and unit, and how it was adapted to this product' }, sources: { type: 'array', items: { type: 'string' }, description: 'URLs the figure came from' } } } },
    notes: { type: 'string', description: 'What could not be found, and what the client should confirm' }
  }
};
// Looks the product up online (retailer listings, size charts, lab measurements of the same or comparable styles) and
// returns values for the rows the draft could not fill. Live path: Claude with web search + fetch. Fixture path: the
// fixture file's "research" object, or synthetic rows so the flow can be exercised without a key.
async function researchMeasurementsRaw({ photo, product = {}, rows = [], proposeRows = false, sizes = [], sampleSize = '' }) {
  if (process.env.AI_FIXTURE) {
    const fx = JSON.parse(readFileSync(process.env.AI_FIXTURE, 'utf8')).research;
    if (fx) return { ...fx, consulted: fx.consulted || [], model: 'fixture' };
    const list = rows.length ? rows : proposeRows ? [{ code: 'A', name: 'Length', how: 'Edge to edge at the longest point', tolerance: '±0.25' }, { code: 'B', name: 'Width', how: 'Edge to edge at the widest point', tolerance: '±0.25' }, { code: 'C', name: 'Height', how: 'Base to top edge', tolerance: '±0.25' }] : [];
    return { identified: 'fixture product', comparables: [{ name: 'Comparable listing', url: 'https://example.com/size-guide', what: 'Listed dimensions' }], consulted: ['https://example.com/size-guide'],
      rows: list.map((r, i) => ({ code: String(r.code).toUpperCase(), name: r.name || '', how: r.how || '', tolerance: r.tolerance || '±0.25', sample: r.range ? Math.round((r.range.lo + r.range.hi) / 2 * 100) / 100 : 10 + i, step: r.range ? 0 : 0.25, basis: 'Listed on a comparable style (fixture)', sources: ['https://example.com/size-guide'] })), notes: 'Fixture research.', model: 'fixture' };
  }
  const client = new Anthropic();
  const image = dataUrlToImageBlock(photo); if (!image) throw new Error('No readable photo');
  const system = `You research points of measure for a product-development studio's tech packs. A customer uploaded a photo of a product they want made, and the first draft could not give values for some of its measurements. Find them from the same or comparable styles online.

How to work:
1. Identify the product from the photo as a shopper would search for it: type, silhouette and, when the photo makes them clear, brand and style name.
2. Search for its listed measurements: retailer product pages ("dimensions", "measurements", "fit details"), the brand's size chart, lab measurements (e.g. shoe stack heights), resale listings with measured dimensions. Open the useful pages and read the numbers. Prefer the exact style, then the same brand and category, then close comparables from other brands; use two or more where they disagree.
3. Fill the requested rows for the sample size in inches (convert cm and mm). Grade by size step where the category grades. In "basis" say which comparable gave the figure, the listed number and unit, and how you adapted it. List each row's source URLs.
4. ${proposeRows ? 'No measurement template exists for this product: propose the industry-standard points of measure for it (6–12 rows with letter codes, name, how to measure, tolerance) and fill them the same way.' : 'Fill only the rows requested and keep their codes; name/how/tolerance stay empty for them.'}
Leave a row out when nothing defensible turns up — never invent a figure. Brand and style names are for lookup only; the pack describes an original product.`;
  const text = `Product: ${product.title || '(untitled)'}${product.category ? ` — ${product.category}` : ''}
${product.description ? `Draft description: ${String(product.description).slice(0, 600)}\n` : ''}${product.fabricSummary ? `Materials: ${product.fabricSummary}\n` : ''}Size run: ${sizes.join(', ')} · sample size ${sampleSize}
${rows.length ? `Rows to fill (code — name — how to measure):\n${rows.map(r => `${r.code} — ${r.name} — ${r.how}${r.range ? ` — a real one is between ${r.range.lo} and ${r.range.hi} inches` : ''}`).join('\n')}` : 'Rows to fill: propose them.'}

Research comparable styles and return the measurements.`;
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 }];
  const first = [{ role: 'user', content: [image, { type: 'text', text }] }];
  const base = { model: AI_MODEL, max_tokens: 12000, system, tools };
  // server tools can pause a long turn: hand the partial turn back until the model finishes
  const run = async (structured) => {
    const params = structured ? { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESEARCH_SCHEMA } } }
      : { ...base, system: base.system + '\n\nFinish with a single JSON object matching this JSON schema and nothing after it:\n' + JSON.stringify(RESEARCH_SCHEMA) };
    let messages = first, res;
    for (let i = 0; i < 4; i++) {
      res = structured ? await client.beta.messages.create({ ...params, messages }) : await client.messages.create({ ...params, messages });
      if (res.stop_reason !== 'pause_turn') break;
      messages = [...messages, { role: 'assistant', content: res.content }];
    }
    return res;
  };
  let response;
  try { response = await run(true); } catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; response = await run(false); }
  if (response.stop_reason === 'refusal') return { identified: '', comparables: [], consulted: [], rows: [], notes: 'The assistant declined to research this product.', model: response.model || AI_MODEL };
  if (response.stop_reason === 'max_tokens') throw new Error('Research was cut off (max_tokens)');
  const consulted = new Set();
  for (const b of response.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) consulted.add(r.url);
    if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) if (c.url) consulted.add(c.url);
  }
  const textOut = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const start = textOut.lastIndexOf('{"'), s2 = textOut.indexOf('{');
  let obj = {};
  try { obj = JSON.parse(textOut.slice(s2 >= 0 ? s2 : 0, textOut.lastIndexOf('}') + 1)); } catch { if (start >= 0) obj = JSON.parse(textOut.slice(start, textOut.lastIndexOf('}') + 1)); }
  const url = u => /^https?:\/\//i.test(String(u || '')) ? String(u).slice(0, 300) : '';
  const rowsOut = (Array.isArray(obj.rows) ? obj.rows : []).map(r => ({ code: String(r.code || '').trim().toUpperCase().slice(0, 8), name: String(r.name || '').trim(), how: String(r.how || '').trim(), tolerance: String(r.tolerance || '').trim(),
    sample: inches(r.sample), step: inches(r.step) || 0, basis: String(r.basis || '').trim().slice(0, 400), sources: (Array.isArray(r.sources) ? r.sources : []).map(url).filter(Boolean).slice(0, 4) })).filter(r => r.code && r.sample != null);
  const comparables = (Array.isArray(obj.comparables) ? obj.comparables : []).map(c => ({ name: String(c.name || '').slice(0, 120), url: url(c.url), what: String(c.what || '').slice(0, 300) })).filter(c => c.name || c.url).slice(0, 8);
  if (response.model && response.model !== AI_MODEL) console.warn(JSON.stringify({ level: 'warn', msg: 'research served by a fallback model', model: response.model }));
  return { identified: String(obj.identified || '').slice(0, 200), comparables, consulted: [...consulted].slice(0, 20), rows: rowsOut, notes: String(obj.notes || '').slice(0, 1200), model: response.model || AI_MODEL, usage: response.usage || null };
}
// Fills what the draft left blank by researching comparable styles. Adds the rows to draft.pom and puts the summary on
// draft.pomResearch (which applyDraftToPack writes into the notes). Returns null when nothing was missing.
export async function completeMeasurements(draft, { photo, pomTemplate = [], product = {}, sizes = [], sampleSize = '', family = '' }) {
  const { missing, needsRows } = missingMeasurements(draft, pomTemplate);
  if (!missing.length && !needsRows) return null;
  const fam = family || familyOf(product.category, product.title);
  const asked = missing.map(r => { const g = rangeFor(r.name, fam); return g ? { ...r, range: { lo: g.lo, hi: g.hi } } : r; });
  const research = await researchMeasurements({ photo, product, rows: asked, proposeRows: needsRows, sizes, sampleSize });
  const have = usableCodes(draft, pomTemplate);
  const added = [];
  for (const r of research.rows) {
    if (have.has(r.code)) continue;
    const t = pomTemplate.find(x => String(x.code).toUpperCase() === r.code);
    if (!t && !r.name) continue; // a code that is neither in the template nor named cannot become a row
    have.add(r.code);
    added.push({ code: r.code, name: t ? '' : r.name, how: t ? '' : r.how, tolerance: t ? '' : r.tolerance, sample: r.sample, step: r.step, basis: `${r.basis}${r.sources.length ? ` [${r.sources.join(' · ')}]` : ''}`, researched: true });
  }
  draft.pom = [...(draft.pom || []), ...added];
  const requested = missing.map(r => String(r.code).toUpperCase());
  draft.pomResearch = { identified: research.identified, comparables: research.comparables, consulted: research.consulted || [], requested, proposed: needsRows, filled: added.map(r => r.code), stillMissing: requested.filter(c => !have.has(c)), notes: research.notes, model: research.model };
  return draft.pomResearch;
}
// The measurement check: runs on the assistant's draft before it reaches a client. A value only wrong by its unit is
// converted; a graded size that leaves the range has its step capped; a value outside the range for this kind of product
// is taken out, researched again with the range stated, and left blank when it still does not fit. Every change is
// recorded in draft.pomChecks for the pack's notes. Blank beats wrong: a factory reads a number as an instruction.
export async function vetMeasurements(draft, { photo = '', pomTemplate = [], product = {}, sizes = [], sampleSize = '' } = {}) {
  const family = familyOf(draft?.category || product.category, product.title);
  const report = { family, converted: [], capped: [], rejected: [], refilled: [], blank: [], flagged: [] };
  if (!draft || !Array.isArray(draft.pom) || !draft.pom.length) return report;
  const nameOf = r => r.name || pomTemplate.find(t => String(t.code).toUpperCase() === String(r.code || '').toUpperCase())?.name || '';
  const idx = Math.max(0, sizes.indexOf(sampleSize));
  const pass = rows => {
    const bad = [];
    for (const r of rows) {
      const name = nameOf(r), range = rangeFor(name, family), sample = inches(r.sample); if (!range || sample == null) continue;
      let step = inches(r.step) || 0, value = sample;
      if (value < range.lo || value > range.hi) {
        const slip = fixUnitSlip(value, range);
        if (slip) { const div = slip.unit === 'cm' ? 2.54 : 25.4; report.converted.push({ code: r.code, name, from: sample, unit: slip.unit, to: slip.value }); value = slip.value; step = step / div; r.sample = value; r.step = Math.round(step * 1000) / 1000; }
        else { bad.push(r); continue; }
      }
      if (sizes.length > 1) {
        const lo = value + (0 - idx) * step, hi = value + (sizes.length - 1 - idx) * step, out = Math.min(lo, hi) < range.lo || Math.max(lo, hi) > range.hi;
        if (out) { const room = Math.min(...[(range.hi - value) / Math.max(1, sizes.length - 1 - idx), (value - range.lo) / Math.max(1, idx)].filter(Number.isFinite)); const cap = Math.max(0, Math.round(Math.min(Math.abs(step), room) * 1000) / 1000); report.capped.push({ code: r.code, name, from: step, to: Math.sign(step) * cap }); r.step = Math.sign(step) * cap; }
        else if (step < 0 && /length|width|girth|circumference|waist|hip|chest|shoulder|thigh|rise|inseam|height/i.test(name) && !/heel height/i.test(name)) report.flagged.push({ code: r.code, name, note: 'grades smaller as the sizes get larger' });
      }
    }
    return bad;
  };
  const rejectRows = bad => { for (const r of bad) { const name = nameOf(r), range = rangeFor(name, family); report.rejected.push({ code: r.code, name, value: inches(r.sample), range: { lo: range.lo, hi: range.hi } }); }
    draft.pom = draft.pom.filter(r => !bad.includes(r)); };
  let bad = pass(draft.pom);
  if (bad.length) {
    rejectRows(bad);
    const before = new Set(draft.pom.map(r => String(r.code).toUpperCase()));
    const prev = draft.pomResearch;
    if (photo && pomTemplate.length) {
      try {
        const rs = await completeMeasurements(draft, { photo, pomTemplate, product: { ...product, category: draft.category || product.category }, sizes, sampleSize, family });
        if (rs) draft.pomResearch = prev && !prev.error ? { ...prev, ...rs, requested: [...new Set([...(prev.requested || []), ...(rs.requested || [])])], filled: [...new Set([...(prev.filled || []), ...(rs.filled || [])])], consulted: [...new Set([...(prev.consulted || []), ...(rs.consulted || [])])], comparables: [...(prev.comparables || []), ...(rs.comparables || [])].slice(0, 8) } : rs;
      } catch (e) { draft.pomResearch = prev || { error: String(e.message || e).slice(0, 200) }; }
    }
    const fresh = draft.pom.filter(r => !before.has(String(r.code).toUpperCase()));
    const again = pass(fresh); if (again.length) { const names = again.map(r => String(r.code).toUpperCase()); rejectRows(again); report.blank.push(...names); }
    const rejectedCodes = new Set(report.rejected.map(x => String(x.code).toUpperCase()));
    for (const r of fresh.filter(r => !again.includes(r) && rejectedCodes.has(String(r.code).toUpperCase()))) report.refilled.push({ code: r.code, name: nameOf(r), value: inches(r.sample) });
    for (const x of report.rejected) if (!report.refilled.some(f => String(f.code).toUpperCase() === String(x.code).toUpperCase()) && !report.blank.includes(String(x.code).toUpperCase())) report.blank.push(String(x.code).toUpperCase());
  }
  draft.pomChecks = report;
  return report;
}
export function checkNote(rep) {
  if (!rep || !(rep.converted.length || rep.capped.length || rep.rejected.length || rep.flagged.length)) return '';
  const f = v => (Math.round(Number(v) * 100) / 100).toString();
  const lines = ['MEASUREMENT CHECKS', `Every value was checked against what is plausible for ${rep.family === 'generic' ? 'this kind of product' : `a ${rep.family === 'small' ? 'small-goods' : rep.family} product`} before this draft was saved.`];
  for (const c of rep.converted) lines.push(`• ${c.code} ${c.name}: ${f(c.from)} was read as ${c.unit}, converted to ${f(c.to)} in.`);
  for (const c of rep.capped) lines.push(`• ${c.code} ${c.name}: the size-to-size step of ${f(c.from)} in would leave the plausible range, so it was limited to ${f(c.to)} in.`);
  for (const x of rep.rejected) { const got = rep.refilled.find(r => String(r.code).toUpperCase() === String(x.code).toUpperCase());
    lines.push(`• ${x.code} ${x.name}: the draft gave ${f(x.value)} in, outside ${f(x.range.lo)}–${f(x.range.hi)} in. ${got ? `Researched again: ${f(got.value)} in — please confirm.` : 'Left blank for Future Basics to fill.'}`); }
  for (const x of rep.flagged) lines.push(`• ${x.code} ${x.name}: ${x.note} — please check.`);
  return lines.join('\n').slice(0, 1500);
}
function researchNote(rs) {
  if (!rs) return '';
  if (rs.error) return `MEASUREMENT RESEARCH\nThe photo could not give every measurement and the online cross-reference could not run (${rs.error}). Blank rows are for Future Basics to fill from comparable styles.`;
  const what = rs.requested?.length ? `rows ${rs.requested.join(', ')}` : 'the measurements';
  const lines = [`MEASUREMENT RESEARCH\nThe photo could not give ${what}${rs.proposed ? ', and no standard template fits this product' : ''}, so comparable styles were cross-referenced online.${rs.identified ? ` Identified as: ${rs.identified}.` : ''}${rs.filled?.length ? ` Filled from listings: ${rs.filled.join(', ')}.` : ' Nothing defensible was found.'}${rs.stillMissing?.length ? ` Still open: ${rs.stillMissing.join(', ')}.` : ''} Confirm every researched value against a physical sample.`];
  if (rs.comparables?.length) lines.push(rs.comparables.map(c => `• ${c.name}${c.what ? ` — ${c.what}` : ''}${c.url ? ` — ${c.url}` : ''}`).join('\n'));
  if (rs.notes) lines.push(rs.notes);
  return lines.join('\n').slice(0, 1800);
}

// ---- Factory-language translation ----
// Translates the pack's human-written strings into the factory's language (Mandarin, Spanish, Portuguese or Italian). Codes, numbers, units, Pantone
// references and brand names are kept as they are. Returns { map: { source: translation }, model }.
const TRANSLATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 't'], properties: { i: { type: 'integer' }, t: { type: 'string' } } } } }
};
// One entry per factory language: how the model should write it, the trade terms that reader expects, and what the test fixture prefixes.
const LANGS = {
  zh: { label: 'Mandarin', native: '中文', name: 'Simplified Chinese (简体中文) as used in apparel and footwear factories in mainland China', terms: '面料, 里布, 鞋面, 中底, 大底, 针距, 色号, 公差, 唛头', fixture: '中文：' },
  es: { label: 'Spanish', native: 'Español', name: 'Spanish as used in apparel and footwear factories in Spain (español de España)', terms: 'tejido, forro, empeine, plantilla, suela, entresuela, puntadas por pulgada, tolerancia, etiqueta', fixture: 'ES: ' },
  pt: { label: 'Portuguese', native: 'Português', name: 'European Portuguese as used in apparel and footwear factories in Portugal (português de Portugal)', terms: 'tecido, forro, gáspea, palmilha, sola, entressola, pontos por polegada, tolerância, etiqueta', fixture: 'PT: ' },
  it: { label: 'Italian', native: 'Italiano', name: 'Italian as used in apparel and footwear factories in Italy', terms: 'tessuto, fodera, tomaia, soletta, suola, intersuola, punti per pollice, tolleranza, etichetta', fixture: 'IT: ' }
};
export const TRANSLATION_LANGS = Object.keys(LANGS);
export const LANG_LABELS = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, { label: v.label, native: v.native }]));

async function translateStringsRaw(strings, { lang = 'zh' } = {}) {
  const list = [...new Set(strings.map(s => String(s ?? '').trim()).filter(Boolean))];
  const L = LANGS[lang]; if (!L) throw new Error(`Unsupported language ${lang}`);
  if (!list.length) return { map: {}, model: null };
  if (process.env.AI_FIXTURE) { await new Promise(r => setTimeout(r, Number(process.env.AI_FIXTURE_DELAY_MS || 0))); return { map: Object.fromEntries(list.map(s => [s, `${L.fixture}${s}`])), model: 'fixture' }; }
  const client = new Anthropic();
  const system = `You translate garment and footwear tech packs from English into ${L.name}. The reader is a factory's technical and production team, so use the standard industry terms they use (e.g. ${L.terms}). Keep measurement codes, numbers, units, tolerances, Pantone/TCX codes, style numbers, supplier references and brand names (Future Basics) exactly as written. Keep line breaks. Do not add explanations. Translate every item; return each item's index with its translation.`;
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

// ---- Step 0: find the product in the photo ----
// Screenshots carry app chrome, captions, other items. Before drafting, ask where the product is and crop to it, so
// callout positions, detail crops and the cover image all refer to the product rather than the whole screen.
const LOCATE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['found', 'product', 'box', 'issues'],
  properties: {
    found: { type: 'boolean', description: 'true when a physical product (garment, footwear, bag, accessory…) is clearly visible and could be manufactured from this reference' },
    product: { type: 'string', description: 'Short name of the main product, e.g. "chunky running shoe", or empty' },
    box: { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'], description: 'Bounding box of the main product as fractions of the image: x,y top-left; w,h size. Whole image when unsure.',
      properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, w: { type: 'number', minimum: 0, maximum: 1 }, h: { type: 'number', minimum: 0, maximum: 1 } } },
    issues: { type: 'string', description: 'What limits the reference: tiny, blurry, cropped, only a logo, several products, a person with no clear garment… Empty when fine.' }
  }
};
export class NoProductError extends Error { constructor(message) { super(message); this.name = 'NoProductError'; this.userFacing = true; } }

async function locateProductRaw(photoDataUrl) {
  if (process.env.AI_FIXTURE) {
    // Fixture: a flat, featureless image has no product in it; anything with detail is the product, full frame.
    const img = dataUrlToImageBlock(photoDataUrl); if (!img) return { found: false, product: '', box: { x: 0, y: 0, w: 1, h: 1 }, issues: 'unreadable image' };
    const buf = Buffer.from(img.source.data, 'base64');
    const stats = await sharp(buf).stats();
    if (stats.channels.every(c => c.stdev < 2)) return { found: false, product: '', box: { x: 0, y: 0, w: 1, h: 1 }, issues: 'the image is blank' };
    const { data, info } = await sharp(buf).greyscale().resize({ width: 160, fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, busyRow = new Array(H).fill(false), busyCol = new Array(W).fill(false);
    const sd = vals => { const m = vals.reduce((a, b) => a + b, 0) / vals.length; return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length); };
    for (let y = 0; y < H; y++) busyRow[y] = sd(Array.from(data.subarray(y * W, y * W + W))) > 6;
    for (let x = 0; x < W; x++) { const col = []; for (let y = 0; y < H; y++) col.push(data[y * W + x]); busyCol[x] = sd(col) > 6; }
    // the product is the longest run of busy rows (app chrome is busy too, but in short bands); columns likewise within it
    const longestRun = flags => { let best = [-1, -1], start = -1, gap = 0; for (let i = 0; i <= flags.length; i++) { const on = i < flags.length && flags[i]; if (on) { if (start < 0) start = i; gap = 0; } else if (start >= 0 && (++gap > 2 || i === flags.length)) { const end = i - gap; if (end - start > best[1] - best[0]) best = [start, end]; start = -1; gap = 0; } } return best; };
    const [y0, y1] = longestRun(busyRow);
    if (y0 < 0) return { found: false, product: '', box: { x: 0, y: 0, w: 1, h: 1 }, issues: 'no detail in the image' };
    for (let x = 0; x < W; x++) { const col = []; for (let y = y0; y <= y1; y++) col.push(data[y * W + x]); busyCol[x] = sd(col) > 6; }
    const [x0, x1] = longestRun(busyCol);
    if (x0 < 0) return { found: false, product: '', box: { x: 0, y: 0, w: 1, h: 1 }, issues: 'no detail in the image' };
    return { found: true, product: 'product', box: { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H }, issues: '' };
  }
  const client = new Anthropic();
  const image = dataUrlToImageBlock(photoDataUrl); if (!image) throw new Error('No readable photo');
  const base = { model: AI_MODEL, max_tokens: 600, system: 'You prepare customer photos for a product-development studio. Find the one physical product the customer most likely wants made (a garment, shoe, bag, hat or accessory). Return its bounding box as fractions of the image, generous enough to include the whole item. Ignore app chrome, captions, hands and background. If there is no manufacturable product in view, say so.',
    messages: [{ role: 'user', content: [image, { type: 'text', text: 'Locate the product.' }] }] };
  let response;
  try { response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: LOCATE_SCHEMA } } }); }
  catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; response = await client.messages.create({ ...base, system: base.system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(LOCATE_SCHEMA) }); }
  if (response.stop_reason === 'refusal') return { found: false, product: '', box: { x: 0, y: 0, w: 1, h: 1 }, issues: 'declined' };
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const n = v => Math.min(1, Math.max(0, Number(v) || 0));
  return { found: Boolean(obj.found), product: String(obj.product || '').slice(0, 80), box: { x: n(obj.box?.x), y: n(obj.box?.y), w: n(obj.box?.w) || 1, h: n(obj.box?.h) || 1 }, issues: String(obj.issues || '').slice(0, 300) };
}

// Crops the photo to the located box with some air around it. Returns the crop as a JPEG data URL and how much of
// the original it covers (1 = nothing removed). Degenerate boxes fall back to the full image.
export async function cropToBox(photoDataUrl, box, { pad = 0.07, max = 1600 } = {}) {
  const img = dataUrlToImageBlock(photoDataUrl); if (!img) throw new Error('No readable photo');
  const buf = Buffer.from(img.source.data, 'base64');
  const meta = await sharp(buf).metadata(); const W = meta.width || 0, H = meta.height || 0;
  if (!W || !H) throw new Error('Photo has no dimensions');
  let x0 = Math.max(0, box.x - pad), y0 = Math.max(0, box.y - pad), x1 = Math.min(1, box.x + box.w + pad), y1 = Math.min(1, box.y + box.h + pad);
  if (box.w < 0.1 || box.h < 0.1 || x1 - x0 < 0.15 || y1 - y0 < 0.15) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  const left = Math.round(x0 * W), top = Math.round(y0 * H), width = Math.max(1, Math.round((x1 - x0) * W)), height = Math.max(1, Math.round((y1 - y0) * H));
  const coverage = (width * height) / (W * H);
  const out = await sharp(buf).extract({ left, top, width, height }).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return { image: `data:image/jpeg;base64,${out.toString('base64')}`, coverage, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// A draft that would leave the pack empty is a failure, not a result.
export function draftLooksEmpty(draft) {
  const callouts = Array.isArray(draft?.callouts) ? draft.callouts.filter(c => c.label).length : 0;
  const pom = Array.isArray(draft?.pom) ? draft.pom.filter(r => inches(r.sample) != null).length : 0;
  const bom = Array.isArray(draft?.bom) ? draft.bom.length : 0;
  return callouts < 3 && pom === 0 && bom === 0;
}

export const locateCallouts = (...args) => timed('anthropic', () => locateCalloutsRaw(...args));

export const draftFromPhotos = (...args) => timed('anthropic', () => draftFromPhotosRaw(...args));

export const draftFromBrief = (...args) => timed('anthropic', () => draftFromBriefRaw(...args));

export const researchMeasurements = (...args) => timed('anthropic', () => researchMeasurementsRaw(...args));

export const translateStrings = (...args) => timed('anthropic', () => translateStringsRaw(...args));
export const locateProduct = (...args) => timed('anthropic', () => locateProductRaw(...args));
