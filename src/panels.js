// Colourways by labelled panels.
//
// Recolouring pixels by shade cannot work on a product with metallic, glossy or mixed surfaces: a highlight and a different panel look the same to a
// pixel filter, so the colour smears across seams. This works the way a designer does:
//   1. BREAK UP the product into its labelled parts (overlays, mesh, heel counter, midsole, outsole, laces...), each with its material and its colour as drawn.
//   2. For each colourway, decide a colour PER PART (the colourway's lead colour goes where the design puts it; soles, laces and trims keep their own unless the
//      colourway says otherwise). Each colour gets its Pantone C match from its hex, never from a model.
//   3. The image model redraws the reference picture with exactly those per-part changes, and nothing else.
//   4. A vision model checks the result part by part against the plan; a muddy or smeared picture is retried once and dropped if it is still wrong.
// The parts and the per-part colours are kept on the pack, so the factory reads the same breakdown the picture shows.
import sharp from 'sharp';
import { dataUrlToImageBlock } from './ai.js';
import { openaiEdit } from './check.js';
import { callJsonSchema, heroConfig, nearestName, colourDistance } from './studio.js';
import { hexToRgb, rgbToHsl, hslToRgb } from './colorway.js';
import { timed, trackedFetch } from './telemetry.js';
import './pantone-c.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hexOk = h => /^#[0-9a-f]{6}$/i.test(String(h || '').trim());
const normHex = h => (hexOk(h) ? String(h).trim().toLowerCase() : '');
const codeOf = (hex, hint = '') => { try { return globalThis.FBPantone?.code(hex, { hint }) || ''; } catch { return ''; } };
const slug = s => String(s || 'colour').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'colour';
export const MAX_COLOURWAYS = () => Math.max(1, Math.min(6, Number(process.env.CW_MAX) || 4));

// ---- 1. the parts ----------------------------------------------------------------------------------------------------
const PARTS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['parts'],
  properties: { parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'material', 'hex', 'where'],
    properties: {
      label: { type: 'string', description: 'What a factory calls this part, 1-4 words, e.g. "Upper overlays", "Mesh panels", "Heel counter", "Midsole", "Outsole lugs", "Laces", "Lace loops", "Collar lining", "Body", "Sleeves", "Rib cuffs", "Drawcord"' },
      material: { type: 'string', description: 'Material and finish as it looks, e.g. "metallic PU", "open mesh", "EVA foam", "rubber", "brushed fleece", "ribbed knit"' },
      hex: { type: 'string', description: 'The part\'s base colour as drawn, #rrggbb. For metallic or glossy parts give the mid-tone of the surface, not the brightest highlight or the darkest reflection.' },
      where: { type: 'string', description: 'Where it is on the product, so a person can find it in the picture: e.g. "wraps the sides of the upper, from toe to heel"' } } } } }
};
const PARTS_SYSTEM = `You break a product photo up into its separate, labelled parts, the way a technical designer starts a colourway sheet.
List every distinct part that is visible and could be coloured on its own: panels, overlays, mesh or fabric zones, trims, hardware, soles, laces, linings, ribbing, pockets, drawcords. Use the names a factory uses.
Rules: 4-12 parts. One entry per part, even when the part appears in several places (the laces, the lace loops). Do not list a part that cannot be seen. Do not split one part into highlight and shadow: a glossy panel is one part. Give each part's colour as #rrggbb, read from the picture itself. Do not invent logos or details.`;

const FIXTURE_PARTS = [
  { label: 'Main body', material: 'synthetic', hex: '#9aa0a6', where: 'most of the product' },
  { label: 'Overlays', material: 'metallic PU', hex: '#c7cacd', where: 'across the sides' },
  { label: 'Sole', material: 'rubber', hex: '#202124', where: 'underneath' },
  { label: 'Trim', material: 'webbing', hex: '#f2f2f2', where: 'laces and edges' }
];

// → [{ label, material, hex, name, code, where }]
export async function identifyParts({ image, meta = {}, fixture = false }) {
  let raw;
  if (fixture) raw = FIXTURE_PARTS;
  else {
    const block = dataUrlToImageBlock(image); if (!block) throw new Error('There is no picture to break up.');
    raw = (await timed('anthropic', () => callJsonSchema(PARTS_SYSTEM, [block, { type: 'text', text: `${meta.title || 'The product'}${meta.category ? ` (${meta.category})` : ''}. List its parts.` }], PARTS_SCHEMA, { maxTokens: 2000 }))).parts;
  }
  const seen = new Set(), out = [];
  for (const p of raw || []) {
    const hex = normHex(p.hex), label = clip(p.label, 40); if (!hex || !label || seen.has(label.toLowerCase())) continue; seen.add(label.toLowerCase());
    out.push({ label, material: clip(p.material, 60), hex, name: nearestName(hex), code: codeOf(hex, `${label} ${p.material || ''}`), where: clip(p.where, 120) });
  }
  if (out.length < 2) throw new Error('Could not tell the parts of this product apart in the picture.');
  return out.slice(0, 12);
}

// ---- 2. a colour per part, per colourway ------------------------------------------------------------------------------
const ASSIGN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['parts'],
  properties: { parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'hex', 'changed'],
    properties: { label: { type: 'string', description: 'Exactly one of the part labels given' }, hex: { type: 'string', description: 'The part\'s colour in this colourway, #rrggbb (its current colour when it does not change)' }, changed: { type: 'boolean' } } } } }
};
const ASSIGN_SYSTEM = `You are a footwear and apparel colour designer. Given a product's labelled parts with their current colours, and a new colourway (a name and a lead colour), decide the colour of EVERY part in that colourway.
The lead colour goes on the parts that carry the colour of the design (the main body, overlays, the large panels). Parts that are normally neutral stay as they are unless the colourway name says otherwise: soles, laces, lining, hardware. Where a part is metallic or glossy, keep it metallic: give the mid-tone of the new metal or gloss, not a flat pastel. Keep the contrast pattern of the original (a dark heel stays the darker part, a light midsole stays light). Never leave out a part. Colours are #rrggbb.`;

const mixHex = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return '#' + [0, 1, 2].map(i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')).join(''); };

// Parts a colourway does not usually recolour: soles, laces, linings, hardware, labels.
const NEUTRAL_PART = /sole|lace|lining|eyelet|hardware|zip|logo|label|trim|binding|tape|drawcord|aglet|stitch/i;
const lblKey = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// The same plan without asking a model: the lead colour on the parts that carry the design's colour, each keeping its own lightness relative to the others, so
// shading and contrast survive. Used when the model's answer changes nothing.
export function leadPlan(parts, lead) {
  const carry = parts.filter(p => !NEUTRAL_PART.test(p.label) && !/outsole|midsole/i.test(p.label)); if (!carry.length) return parts.map(p => ({ label: p.label, hex: p.hex, changed: false }));
  const lightOf = h => rgbToHsl(...hexToRgb(h))[2], mean = carry.reduce((a, p) => a + lightOf(p.hex), 0) / carry.length, [lh, ls, ll] = rgbToHsl(...hexToRgb(lead));
  return parts.map(p => {
    if (!carry.includes(p)) return { label: p.label, hex: p.hex, changed: false };
    const l = Math.max(0.06, Math.min(0.94, ll + (lightOf(p.hex) - mean) * 0.8)), [r, g, b] = hslToRgb(lh, ls, l);
    return { label: p.label, hex: '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), changed: true };
  });
}
// Reads the model's answer against our parts: by label (ignoring case and punctuation), else by position when it gave one entry per part.
const matchGiven = (parts, given) => parts.map((p, i) => (given || []).find(x => lblKey(x.label) === lblKey(p.label)) || ((given || []).length === parts.length ? given[i] : null));

// → [{ label, material, from, hex, name, code, changed }]  (hex is the colour in this colourway)
export async function assignColourway({ parts, colourway, fixture = false, ask = null }) {
  const lead = normHex(colourway.swatch); if (!lead) return null;
  const finish = given => parts.map((p, i) => {
    const g = given[i], hex = normHex(g?.hex) || p.hex, changed = colourDistance(hex, p.hex) > 9;
    return { label: p.label, material: p.material, from: p.hex, hex: changed ? hex : p.hex, name: nearestName(changed ? hex : p.hex), code: changed ? codeOf(hex, `${colourway.name} ${p.label}`) : p.code, changed };
  });
  if (fixture) return finish(parts.map((p, i) => ({ hex: i < 2 ? mixHex(lead, p.hex, i * 0.15) : p.hex })));
  const text = `Parts, in this order:\n${parts.map((p, i) => `${i + 1}. ${p.label} (${p.material || 'material unknown'}): ${p.hex}`).join('\n')}\n\nNew colourway: "${colourway.name}", lead colour ${lead}${colourway.notes ? `. Note: ${clip(colourway.notes, 200)}` : ''}.\nGive exactly one entry per part, in the same order, copying each label exactly.`;
  const call = ask || (t => timed('anthropic', () => callJsonSchema(ASSIGN_SYSTEM, [{ type: 'text', text: t }], ASSIGN_SCHEMA, { maxTokens: 1500 })).then(r => r.parts));
  let plan = finish(matchGiven(parts, await call(text)));
  // an answer that changes nothing is asked once more, then replaced by the plain rule, so a colourway is never dropped for the model's caution
  if (!plan.some(x => x.changed)) plan = finish(matchGiven(parts, await call(text + `\n\nYour last answer left every part as it was. The colourway "${colourway.name}" must look clearly different: put ${lead} (or a shade of it that keeps the part's own light and dark) on the parts that carry the colour of the design.`)));
  if (!plan.some(x => x.changed)) plan = finish(leadPlan(parts, lead));
  return plan;
}
// How different a colourway's per-part colours are from the product as it is: the mean colour distance, and how many parts change.
export const planDifference = plan => ({ changed: plan.filter(x => x.changed).length, mean: plan.length ? plan.reduce((s, x) => s + (x.changed ? colourDistance(x.hex, x.from) : 0), 0) / plan.length : 0 });

// The mean colour distance between two colourways' per-part colours: small means they would look like the same colourway.
export const planDistance = (a, b) => a.length ? a.reduce((s, x, i) => s + colourDistance(x.hex, b[i]?.hex || x.hex), 0) / a.length : 0;

// ---- 3. the picture ---------------------------------------------------------------------------------------------------
export function panelPrompt({ plan, meta = {}, problem = '' }) {
  const change = plan.filter(x => x.changed), keep = plan.filter(x => !x.changed);
  return [`The reference image is the approved picture of ${meta.title || 'this product'}. Redraw it as the SAME photograph: identical camera angle, framing, background, lighting and shadow, identical shape, proportions, panel lines, seams, stitching, lacing, texture and every detail. Change ONLY the colours listed below.`,
    'Recolour these parts, each one only inside its own boundaries (the colour must stop exactly where the part stops, at every seam):',
    ...change.map(x => `- ${x.label}${x.material ? ` (${x.material})` : ''}: from ${x.from} to ${x.hex} (${x.name}). Keep its ${/metal|chrome|foil|gloss|patent/i.test(x.material) ? 'metallic sheen and reflections' : 'texture and shading'}; shade it with highlights and shadows of the new colour.`),
    keep.length ? 'These parts must stay exactly as they are in the reference, same colour and finish:' : '', ...keep.map(x => `- ${x.label}: ${x.from}`),
    'Do not blend, bleed or smear colour between parts. No camouflage, blotches, speckles, gradients or patterns that are not in the reference. Do not add logos, text or features. The result must look like the same shoe or garment built in a different colourway.',
    problem ? `The previous attempt was rejected: ${problem} Fix exactly that.` : ''].filter(Boolean).join('\n');
}

async function jpeg(buf, w = 1024) { return sharp(buf).rotate().resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer(); }

const fixtureDraw = async (ref, plan) => { // test stand-in: the reference tinted toward the first changed part's colour
  const lead = plan.find(x => x.changed)?.hex || '#808080', [r, g, b] = hexToRgb(lead);
  return sharp(ref).resize({ width: 512, height: 512, fit: 'inside' }).tint({ r, g, b }).jpeg({ quality: 86 }).toBuffer();
};
export async function drawColourway({ reference, plan, meta, cfg, problem = '', fixture = false }) {
  if (fixture) return fixtureDraw(reference, plan);
  return timed('imagegen-colourway', () => openaiEdit({ images: [reference], prompt: panelPrompt({ plan, meta, problem }), cfg: { ...cfg, size: process.env.CW_SIZE || '1024x1024' } }));
}

// ---- 4. the check -----------------------------------------------------------------------------------------------------
const CHECK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['score', 'issues', 'parts'],
  properties: { score: { type: 'integer', description: '0-100: does the picture show the SAME product with each part in the planned colour and nothing else changed?' }, issues: { type: 'string', description: 'The main problems in one or two sentences, or "none"' },
    parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'ok'], properties: { label: { type: 'string' }, ok: { type: 'boolean', description: 'This part is in (about) the planned colour, inside its own boundary' } } } } }
};
const CHECK_SYSTEM = `You inspect a recoloured product picture against its reference and a part-by-part colour plan.
Check, part by part, that each planned part is drawn in about the planned colour and that the colour stays inside that part (no smearing across seams, no camouflage or blotches, no parts left in the old colour that should have changed, no parts changed that should not). Check the shape, camera angle and details are the same as the reference. Be strict: 90+ means a designer could put it on a colourway sheet as it is. Colour smeared across several parts, or a different shape, is below 50.`;
// Two judges. Claude did not draw the picture; an OpenAI vision model is a second opinion that sees the same two pictures and the same plan, and the stricter score
// stands. OpenAI is used when OPENAI_API_KEY is set. CW_CHECKER=claude|openai|both (default both), OPENAI_CHECK_MODEL sets the OpenAI model.
export const checkerMode = (env = process.env) => { const m = String(env.CW_CHECKER || '').toLowerCase(); const hasKey = Boolean(env.OPENAI_API_KEY); if (m === 'claude') return { claude: true, openai: false }; if (m === 'openai') return { claude: !hasKey, openai: hasKey }; return { claude: true, openai: hasKey }; };
async function openaiJudge({ referenceB64, drawnB64, planText }) {
  const res = await trackedFetch('openai-check', 'https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ model: process.env.OPENAI_CHECK_MODEL || 'gpt-5', response_format: { type: 'json_schema', json_schema: { name: 'colourway_check', strict: true, schema: CHECK_SCHEMA } },
      messages: [{ role: 'system', content: CHECK_SYSTEM }, { role: 'user', content: [{ type: 'text', text: 'The reference picture:' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${referenceB64}` } }, { type: 'text', text: 'The recoloured picture:' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${drawnB64}` } }, { type: 'text', text: `The plan:\n${planText}\n\nJudge it.` }] }] })
  });
  if (!res.ok) throw new Error(`OpenAI check refused (${res.status})`);
  const r = JSON.parse((await res.json())?.choices?.[0]?.message?.content || '{}');
  return normVerdict(r);
}
const normVerdict = r => ({ score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))), issues: clip(r.issues, 300), parts: (r.parts || []).map(p => ({ label: clip(p.label, 40), ok: Boolean(p.ok) })) });
// Several judges, one verdict: the strictest score stands, every problem any of them named is kept, and a part is only fine if all of them say so.
// A judge that could not run is left out; if none ran the picture is "unchecked" (shown, since nobody could say it was wrong).
export function combineVerdicts(list) {
  const ran = list.filter(v => v && !v.unchecked); if (!ran.length) return { score: 0, issues: 'The check could not run.', parts: [], unchecked: true };
  const issues = [...new Set(ran.map(v => v.issues).filter(x => x && !/^none$/i.test(x)))].join(' / ') || 'none';
  const labels = [...new Set(ran.flatMap(v => v.parts.map(p => p.label)))];
  return { score: Math.min(...ran.map(v => v.score)), issues: clip(issues, 300), parts: labels.map(label => ({ label, ok: ran.every(v => v.parts.find(p => p.label === label)?.ok !== false) })), judges: ran.length };
}
export async function checkColourway({ reference, drawn, plan, fixture = false, mode = checkerMode(), judges = null }) {
  if (fixture) return { score: 88, issues: 'none', parts: plan.map(x => ({ label: x.label, ok: true })) };
  const referenceB64 = (await jpeg(reference, 900)).toString('base64'), drawnB64 = (await jpeg(drawn, 900)).toString('base64');
  const planText = plan.map(x => `- ${x.label}: ${x.changed ? `${x.from} -> ${x.hex} (${x.name})` : `unchanged ${x.from}`}`).join('\n');
  const content = [{ type: 'text', text: 'The reference picture:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: referenceB64 } },
    { type: 'text', text: 'The recoloured picture:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: drawnB64 } }, { type: 'text', text: `The plan:\n${planText}\n\nJudge it.` }];
  const run = {
    claude: async () => normVerdict(await timed('anthropic', () => callJsonSchema(CHECK_SYSTEM, content, CHECK_SCHEMA, { maxTokens: 1200 }))),
    openai: () => openaiJudge({ referenceB64, drawnB64, planText }), ...(judges || {})
  };
  const picked = ['claude', 'openai'].filter(k => mode[k]);
  const out = await Promise.all(picked.map(k => run[k]().catch(() => ({ unchecked: true }))));
  return combineVerdicts(out);
}

// ---- the whole run ------------------------------------------------------------------------------------------------------
export const BAR = () => Number(process.env.CW_MIN_SCORE) || 70;

// → { parts, tiles: [{ id, name, swatch, buffer, parts, score, issues }], skipped: [{ name, why }] }
// reference: a JPEG buffer (the approved hero, else the clean cut-out, else the photo). onStep({ stage, name, done, total }) is called as it goes.
export async function makeColourways({ reference, colourways, meta = {}, parts = null, cfg = heroConfig(), onStep = () => {}, onTile = async () => {}, deps = {} }) {
  const D = { identifyParts, assignColourway, drawColourway, checkColourway, ...deps };
  const fixture = cfg.provider === 'fixture';
  if (!cfg.configured) throw new Error('No image model is connected: set OPENAI_API_KEY on the service.');
  const ref = await jpeg(reference, 1536), refUrl = `data:image/jpeg;base64,${ref.toString('base64')}`;
  await onStep({ stage: 'parts' });
  const list = parts?.length ? parts : await D.identifyParts({ image: refUrl, meta, fixture });
  const want = (colourways || []).filter(c => normHex(c?.swatch)), skipped = [], tiles = [], made = [];
  let done = 0;
  for (const c of want) {
    if (tiles.length >= MAX_COLOURWAYS()) { skipped.push({ name: c.name, why: 'over the limit for one run' }); continue; }
    if (tiles.some(t => colourDistance(t.swatch, c.swatch) < 12)) { skipped.push({ name: c.name, why: 'looks like another colourway' }); continue; }
    await onStep({ stage: 'colourway', name: c.name, done, total: want.length });
    try {
      const plan = await D.assignColourway({ parts: list, colourway: c, fixture });
      const diff = plan && planDifference(plan);
      if (!plan || !diff.changed || diff.mean < 6) { skipped.push({ name: c.name, why: `it would look the same as the product already does (${diff ? diff.changed : 0} of ${list.length} parts change, by ${diff ? Math.round(diff.mean) : 0} on average)` }); continue; }
      if (made.some(m => planDistance(m, plan) < 7)) { skipped.push({ name: c.name, why: 'it would look like another colourway' }); continue; }
      let best = null, problem = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const drawn = await D.drawColourway({ reference: ref, plan, meta, cfg, problem, fixture });
        await onStep({ stage: 'check', name: c.name, done, total: want.length });
        const verdict = await D.checkColourway({ reference: ref, drawn, plan, fixture });
        if (!best || verdict.score > best.verdict.score) best = { drawn, verdict };
        if (verdict.score >= 85 || verdict.unchecked) break;
        problem = verdict.issues && !/^none$/i.test(verdict.issues) ? verdict.issues : 'The colours were not where the plan puts them.';
      }
      if (best.verdict.score < BAR() && !best.verdict.unchecked) { skipped.push({ name: c.name, why: `the picture did not hold together (${best.verdict.score}/100: ${best.verdict.issues})` }); continue; }
      made.push(plan);
      const tile = { id: `cw-${slug(c.name)}`, name: c.name, swatch: normHex(c.swatch), buffer: await jpeg(best.drawn, 900), parts: plan.map(x => ({ label: x.label, name: x.name, hex: x.hex, code: x.code, changed: x.changed })), score: best.verdict.score, issues: best.verdict.issues };
      tiles.push(tile); await onTile(tile, list);
    } catch (e) { if (e.status === 401 || e.status === 403 || e.status === 429) { skipped.push({ name: c.name, why: e.message }); break; } skipped.push({ name: c.name, why: clip(e.message, 160) }); }
    done++;
  }
  return { parts: list, tiles, skipped };
}
