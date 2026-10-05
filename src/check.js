// The independent spec check. The question it answers: does this tech pack, as written, describe the product in the photo?
//
//   1. A brief is built from the pack ALONE: materials, colours, measurements, construction, artwork. No photo and no free-text
//      description or notes (the assistant wrote those while looking at the photo), so nothing the drafter saw leaks in.
//   2. An image model draws a photorealistic product from that brief. It never sees the photo either.
//   3. A separate model call compares the render with the client's photo and prompt, attribute by attribute, and points at the
//      pack field that explains each difference.
//
// Without an image model the check still runs: the written brief is compared with the photo and the result says there was no render.
import './tp-units.js';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { normalizeTechPack } from './techpack.js';
import { dataUrlToImageBlock } from './ai.js';
import { timed, trackedFetch } from './telemetry.js';

const { parseIn } = globalThis.FBTP_UNITS;
export const CHECK_MODEL = () => process.env.CHECK_MODEL || process.env.AI_MODEL || 'claude-opus-5-5';
const cm = inches => Math.round(inches * 2.54 * 10) / 10;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- 1. The brief ----
const kindOf = (category = '', title = '') => {
  const t = `${category} ${title}`.toLowerCase();
  if (/(shoe|sneaker|runner|boot|sandal|loafer|clog|slipper|footwear|trainer|cleat)/.test(t)) return 'footwear';
  if (/(bag|tote|backpack|duffel|pouch|wallet|purse)/.test(t)) return 'bag';
  if (/(cap|hat|beanie|headwear|visor|bucket)/.test(t)) return 'headwear';
  if (/(jacket|coat|parka|vest|outerwear|anorak|windbreaker)/.test(t)) return 'outerwear';
  if (/(pant|trouser|short|jean|legging|skirt|bottom|jogger)/.test(t)) return 'bottom';
  if (/(tee|shirt|hoodie|sweat|top|sweater|knit|polo|jersey|tank|dress)/.test(t)) return 'top';
  return 'other';
};

export function viewsFor(kind) {
  const hero = { id: 'hero', label: 'Three-quarter front', camera: 'three-quarter front view at eye level, the product centred and filling about 70% of the frame' };
  const second = ['top', 'bottom', 'outerwear'].includes(kind)
    ? { id: 'back', label: 'Back', camera: 'straight-on back view, the product centred and filling about 70% of the frame' }
    : { id: 'side', label: 'Side profile', camera: 'straight-on side profile view, the product centred and filling about 70% of the frame' };
  return [hero, second];
}

// What the renderer is told, as data (so it can be tested and shown) and as one prompt string.
export function specBrief(input, { title = '', productType = '' } = {}) {
  const p = normalizeTechPack(input);
  const sample = p.style.sampleSize || p.sizes[Math.floor(p.sizes.length / 2)] || '';
  const category = clip(p.style.category || productType, 120);
  const kind = kindOf(category, title || p.style.styleName);
  const parts = p.bom.map(r => ({ component: clip(r.component, 80), material: clip(r.material, 120), spec: clip(r.spec, 160), colour: clip(r.color, 60), placement: clip(r.placement, 80), notes: clip(r.notes, 120) }));
  const colours = p.colorways.map(c => ({ name: clip(c.name, 60), code: clip(c.code, 30), hex: c.swatch || '' }));
  const measures = p.pom.map(r => { const raw = r.values?.[sample] ?? ''; const inches = parseIn(raw); return { code: r.code, name: clip(r.name, 80), raw, inches, cm: inches ? cm(inches) : null }; }).filter(m => m.inches);
  const ref = measures[0] || null;
  const proportions = ref ? measures.slice(1).map(m => ({ code: m.code, name: m.name, inches: m.inches, cm: m.cm, pctOfReference: Math.round(m.inches / ref.inches * 100) })) : [];
  const construction = p.construction.map(r => ({ area: clip(r.area, 60), detail: clip(r.detail, 200) }));
  // callouts carry the visible details (stitching, overlays, hardware); the first few are enough for a picture
  const details = p.sketches.flatMap(s => s.callouts.map(c => ({ label: clip(c.label, 60), spec: clip(c.spec, 160) }))).filter(c => c.label || c.spec).slice(0, 10);
  const artwork = p.artwork.map(a => ({ name: clip(a.name, 80), pantones: a.pantones.map(x => x.name || x.code || x.hex).filter(Boolean).slice(0, 4),
    placements: a.placements.map(pl => ({ label: clip(pl.label, 60), x: pl.x, y: pl.y, widthIn: pl.widthIn })).slice(0, 4) })).filter(a => a.name || a.placements.length);
  const labels = p.labels.map(l => ({ item: clip(l.item, 60), placement: clip(l.placement, 80) })).slice(0, 6);
  return { title: clip(title || p.style.styleName, 120), category, kind, sampleSize: sample, fit: clip(p.style.fitBlock, 120), fabricSummary: clip(p.style.fabricSummary, 200),
    parts, colours, reference: ref && { code: ref.code, name: ref.name, inches: ref.inches, cm: ref.cm }, proportions, construction, details, artwork, labels };
}

export function renderPrompt(brief, view = viewsFor(brief.kind)[0]) {
  const L = [];
  L.push(`Photorealistic studio product photograph of ${brief.title || 'a product'}${brief.category ? ` (${brief.category})` : ''}, ${view.camera}.`);
  L.push('Plain light-grey seamless background, soft diffused studio lighting with a gentle contact shadow, sharp focus, true-to-life material textures and accurate colour. No people, no text, no watermark, no props.');
  if (brief.fabricSummary) L.push(`Summary: ${brief.fabricSummary}.`);
  if (brief.fit) L.push(`Fit / last / block: ${brief.fit}.`);
  if (brief.parts.length) L.push('MATERIALS AND COLOURS. Build the product from exactly these parts and show each material\'s real surface (weave, grain, mesh, foam, rubber tread, stitching):\n' +
    brief.parts.slice(0, 16).map(r => `- ${r.component || 'Part'}: ${[r.material, r.spec].filter(Boolean).join(', ')}${r.colour ? `; colour ${r.colour}` : ''}${r.placement ? `; ${r.placement}` : ''}${r.notes ? `; ${r.notes}` : ''}`).join('\n'));
  if (brief.colours.length) L.push('COLOURWAY: ' + brief.colours.slice(0, 4).map(c => `${c.name}${c.code ? ` (${c.code})` : ''}${c.hex ? ` ${c.hex}` : ''}`).join('; ') + '. Show the first colourway.');
  if (brief.reference) L.push(`PROPORTIONS (size ${brief.sampleSize}). Reference: ${brief.reference.name} ${brief.reference.inches} in (${brief.reference.cm} cm) = 100%. ` +
    brief.proportions.slice(0, 14).map(m => `${m.name} ${m.inches} in = ${m.pctOfReference}%`).join('; ') + '. Keep these proportions true.');
  if (brief.construction.length) L.push('CONSTRUCTION:\n' + brief.construction.slice(0, 8).map(r => `- ${r.area}: ${r.detail}`).join('\n'));
  if (brief.details.length) L.push('VISIBLE DETAILS:\n' + brief.details.map(d => `- ${[d.label, d.spec].filter(Boolean).join(': ')}`).join('\n'));
  if (brief.artwork.length) L.push('BRANDING AND ARTWORK:\n' + brief.artwork.map(a => `- ${a.name || 'Artwork'}${a.pantones.length ? ` in ${a.pantones.join(', ')}` : ''}${a.placements.map(pl => `; ${pl.label || 'placed'} ${Math.round(pl.x * 100)}% from the left, ${Math.round(pl.y * 100)}% from the top${pl.widthIn ? `, ${pl.widthIn} in wide` : ''}`).join('')}`).join('\n'));
  L.push('Do not add any feature, logo, colour or material that is not listed above.');
  return L.join('\n').slice(0, 6000);
}

// ---- 2. The render ----
// Which image model draws it. OpenAI is the first adapter; with only the test fixture on, a plain placeholder is drawn so the flow can be exercised.
export function imageConfig(env = process.env) {
  if (env.CHECK_RENDER_DISABLED === 'true') return { provider: 'off', configured: false, model: null, note: 'switched off (CHECK_RENDER_DISABLED)' };
  if (env.OPENAI_API_KEY && (env.IMAGE_PROVIDER || 'openai') === 'openai') return { provider: 'openai', configured: true, model: env.IMAGE_MODEL || 'gpt-image-1.5', quality: env.IMAGE_QUALITY || 'medium', size: env.IMAGE_SIZE || '1024x1024' };
  if (env.IMAGE_FIXTURE || env.AI_FIXTURE) return { provider: 'fixture', configured: true, model: 'fixture', note: 'test placeholder, not a real image model' };
  return { provider: 'none', configured: false, model: null, note: 'no image model connected: checks compare the written spec with the photo' };
}

const hexOf = v => { const m = /#?([0-9a-f]{6})\b/i.exec(String(v || '')); return m ? '#' + m[1].toLowerCase() : ''; };
export async function fixtureRender(brief, view) {
  const colour = hexOf(brief.colours[0]?.hex) || hexOf(brief.parts.map(p => p.colour).join(' ')) || '#8a8f98';
  const band = brief.parts.slice(0, 5).map((p, i) => `<rect x="${230 + i * 112}" y="560" width="96" height="48" rx="10" fill="${hexOf(p.colour) || '#c9ccd2'}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ececef"/><stop offset="1" stop-color="#cfd0d5"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/><ellipse cx="512" cy="760" rx="330" ry="34" fill="#00000022"/><rect x="190" y="330" width="644" height="400" rx="120" fill="${colour}"/>${band}
    <text x="512" y="900" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#555">TEST RENDER · ${String(view.label).replace(/[<&>]/g, '')} · not an image model</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function openaiImage(prompt, cfg) {
  const res = await trackedFetch('imagegen', 'https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, prompt, size: cfg.size, quality: cfg.quality, n: 1, output_format: 'jpeg' }), signal: AbortSignal.timeout(150000)
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw Object.assign(new Error(`The image model refused the request (${res.status}): ${clip(t, 200)}`), { status: res.status }); }
  const j = await res.json(), item = j?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) { const r = await fetch(item.url); if (r.ok) return Buffer.from(await r.arrayBuffer()); }
  throw new Error('The image model returned no image');
}

// Returns [{ view, label, buffer }]. Throws if the model fails; the caller decides whether the check goes on without a render.
export async function renderViews(brief, views, cfg = imageConfig()) {
  if (!cfg.configured) return [];
  const out = [];
  for (const view of views) {
    const prompt = renderPrompt(brief, view);
    const buffer = cfg.provider === 'openai' ? await timed('imagegen-render', () => openaiImage(prompt, cfg)) : await fixtureRender(brief, view);
    out.push({ view: view.id, label: view.label, buffer, prompt });
  }
  return out;
}

// ---- 3. The comparison ----
export const ATTRIBUTES = ['product-type', 'silhouette', 'proportions', 'materials', 'colours', 'construction', 'branding'];
const MATCH = ['match', 'close', 'differs', 'cannot-tell'];
const FIELDS = ['bom', 'pom', 'colorways', 'construction', 'artwork', 'labels', 'style', 'prompt'];
export const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['score', 'verdict', 'summary', 'attributes', 'discrepancies'],
  properties: {
    score: { type: 'integer', description: '0-100: how closely the product the pack describes matches the photo and the prompt' },
    verdict: { type: 'string', enum: ['resembles', 'partly', 'does-not-resemble', 'cannot-judge'] },
    summary: { type: 'string', description: 'Two sentences for a person: what matches and what does not' },
    attributes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'match', 'note'], properties: { key: { type: 'string', enum: ATTRIBUTES }, match: { type: 'string', enum: MATCH }, note: { type: 'string' } } } },
    discrepancies: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['severity', 'field', 'title', 'detail', 'suggestion'],
      properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, field: { type: 'string', enum: FIELDS }, title: { type: 'string' }, detail: { type: 'string' }, suggestion: { type: 'string' } } } }
  }
};

export const scoreLabel = score => (score >= 75 ? 'resembles' : score >= 50 ? 'partly' : 'does-not-resemble');
export function normalizeVerdict(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  const verdict = ['resembles', 'partly', 'does-not-resemble', 'cannot-judge'].includes(r.verdict) ? r.verdict : scoreLabel(score);
  const seen = new Set();
  const attributes = (Array.isArray(r.attributes) ? r.attributes : []).filter(a => ATTRIBUTES.includes(a?.key) && !seen.has(a.key) && seen.add(a.key))
    .map(a => ({ key: a.key, match: MATCH.includes(a.match) ? a.match : 'cannot-tell', note: clip(a.note, 400) }));
  const discrepancies = (Array.isArray(r.discrepancies) ? r.discrepancies : []).slice(0, 8).map(d => ({ severity: ['high', 'medium', 'low'].includes(d?.severity) ? d.severity : 'medium',
    field: FIELDS.includes(d?.field) ? d.field : 'style', title: clip(d?.title, 120), detail: clip(d?.detail, 500), suggestion: clip(d?.suggestion, 300) })).filter(d => d.title || d.detail);
  return { score, verdict, summary: clip(r.summary, 600), attributes, discrepancies };
}

const SYSTEM = `You are an independent reviewer of apparel and footwear tech packs. You did not write this pack and you did not draft it.
You are given: (A) the client's reference photo or photos, (B) the client's prompt, (C) renders drawn by an image model from the tech pack alone, and (D) the written spec the renders were drawn from. The image model never saw the photo.
Judge whether the tech pack, as written, would produce the product in the photo and the prompt.
Rules:
- Compare product type, silhouette, proportions, materials and textures, colours, construction details and branding/placement.
- Do not penalise the photo's pose, background, lighting, crop or quality, or the render's artistic finish. Image models make small mistakes: only report a difference that points at something the pack says or leaves out, and name the pack field (bom, pom, colorways, construction, artwork, labels, style) and the row.
- When something cannot be seen in the photo or the render, use "cannot-tell" instead of guessing.
- If there are no renders, compare the written spec (D) with the photo and say so in the summary.
- Score 90-100: a factory would build the same product. 75-89: resembles, with fixable details. 50-74: partly, a visible feature or material is wrong. Below 50: a different product.
- Be specific and short. The reader is a production manager deciding whether to publish.`;

async function callJson(system, content, { model = CHECK_MODEL(), maxTokens = 3000 } = {}) {
  const client = new Anthropic();
  const base = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] };
  let response;
  try {
    response = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: VERDICT_SCHEMA } } });
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    response = await client.messages.create({ ...base, system: system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(VERDICT_SCHEMA) });
  }
  if (response.stop_reason === 'refusal') throw new Error(`Model declined (${response.stop_details?.category || 'policy'})`);
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return { obj: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)), model: response.model || model };
}

function fixtureVerdict(brief, { renders }) {
  // test hook: a [worse] marker makes the fixture reviewer score the pack lower, so the exchange's "take it back" path can be tested
  if (brief.parts.some(p => /\[worse\]/i.test(`${p.notes} ${p.spec}`))) return { score: 35, verdict: 'does-not-resemble', summary: 'Test verdict: the change made the pack match the photo less.',
    attributes: ATTRIBUTES.map(key => ({ key, match: key === 'materials' ? 'differs' : 'match', note: 'Test fixture.' })),
    discrepancies: [{ severity: 'high', field: 'bom', title: 'A BOM finish reads differently from the photo', detail: 'Test fixture: the first BOM row carries a worse marker.', suggestion: 'Undo the last change.' }] };
  // test hook: a BOM note containing [needs-fix] makes the fixture reviewer find a problem, so the hand-back flow can be exercised end to end
  if (brief.parts.some(p => /\[needs-fix\]/i.test(`${p.notes} ${p.spec}`))) return { score: 58, verdict: 'partly', summary: 'Test verdict: the written finish does not match the photo.',
    attributes: ATTRIBUTES.map(key => ({ key, match: key === 'materials' ? 'differs' : 'match', note: key === 'materials' ? 'Test fixture: a BOM row carries a needs-fix marker.' : 'Test fixture: no difference found.' })),
    discrepancies: [{ severity: 'high', field: 'bom', title: 'A BOM finish reads differently from the photo', detail: 'Test fixture: the first BOM row carries a needs-fix marker.', suggestion: 'Reconcile the first BOM row.' }] };
  const score = Number(process.env.CHECK_FIXTURE_SCORE) || 82, first = brief.parts[0];
  return { score, verdict: scoreLabel(score), summary: `Test verdict: ${renders.length ? 'the render' : 'the written spec'} resembles the photo with a few fixable details.`,
    attributes: ATTRIBUTES.map(key => ({ key, match: key === 'materials' ? 'close' : 'match', note: key === 'materials' && first ? `${first.component || 'First part'} reads as ${first.material || 'the listed material'}; check its finish against the photo.` : 'Test fixture: no difference found.' })),
    discrepancies: score < 75 ? [{ severity: 'high', field: 'bom', title: 'Test discrepancy', detail: 'The fixture score is below 75, so one difference is reported.', suggestion: 'Check the first BOM row against the photo.' }] : [] };
}

export async function compareToPhoto({ photos = [], promptText = '', renders = [], brief }) {
  if (!photos.length && !clip(promptText, 10)) return { verdict: normalizeVerdict({ score: 0, verdict: 'cannot-judge', summary: 'There is no photo or prompt to compare the pack with.' }), model: null };
  if (process.env.AI_FIXTURE) return { verdict: normalizeVerdict(fixtureVerdict(brief, { renders })), model: 'fixture' };
  const content = [{ type: 'text', text: `(A) The client's reference photo${photos.length === 1 ? '' : 's'}:` }];
  for (const url of photos.slice(0, 2)) { const b = dataUrlToImageBlock(url); if (b) content.push(b); }
  if (!photos.length) content.push({ type: 'text', text: '(no photo was kept on this pack)' });
  content.push({ type: 'text', text: `(B) The client's prompt:\n${clip(promptText, 1500) || '(none)'}` });
  if (renders.length) {
    content.push({ type: 'text', text: '(C) Renders drawn from the tech pack alone:' });
    for (const r of renders.slice(0, 2)) { content.push({ type: 'text', text: `Render: ${r.label}` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.buffer.toString('base64') } }); }
  } else content.push({ type: 'text', text: '(C) No render is available.' });
  content.push({ type: 'text', text: `(D) The written spec:\n${renderPrompt(brief)}` });
  const { obj, model } = await timed('anthropic', () => callJson(SYSTEM, content));
  return { verdict: normalizeVerdict(obj), model };
}

// ---- The whole check ----
// Photos are the pack's own reference pictures: the first ones, preferring those labelled as reference photos.
export function referencePhotos(input) {
  const p = normalizeTechPack(input);
  const withImage = p.sketches.filter(s => s.image);
  return [...withImage.filter(s => /reference|photo/i.test(s.label)), ...withImage.filter(s => !/reference|photo/i.test(s.label))].map(s => s.image).slice(0, 2);
}

export async function runSpecCheck({ pack, product = {}, promptText = '', cfg = imageConfig() }) {
  const brief = specBrief(pack, { title: product.title, productType: product.product_type });
  const views = viewsFor(brief.kind).slice(0, Math.max(1, Math.min(2, Number(process.env.CHECK_VIEWS) || 1)));
  let renders = [], renderStatus = cfg.configured ? 'rendered' : 'none', renderError = null;
  if (cfg.configured) {
    try { renders = await renderViews(brief, views, cfg); } catch (e) { renders = []; renderStatus = 'failed'; renderError = clip(e.message, 300); }
  }
  const { verdict, model } = await compareToPhoto({ photos: referencePhotos(pack), promptText, renders, brief });
  return { brief, views, renders, renderStatus, renderError, verdict, provider: cfg.provider, imageModel: cfg.model, checkModel: model };
}
