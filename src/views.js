// The other views, drawn from the approved hero image. A tech pack needs two mockup views (lateral + medial for a shoe, front + back for anything else) and a customer
// usually uploads one photo. Once the hero image has passed (a person approved it, or it scored well enough to be approved by itself) the missing views are drawn from it by
// the same image model, each one judged against the hero by a vision model, and only a view that is the right side AND the same product is put on the pack.
// A view that is not good enough is left out and said so: a wrong picture on a factory document is worse than a missing one.
import sharp from 'sharp';
import { openaiEdit } from './check.js';
import { timed } from './telemetry.js';
import { callJsonSchema, heroConfig, HERO_APPROVE_MIN, heroThumb } from './studio.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const VIEW_LABELS = { lateral: 'Lateral (outer side)', medial: 'Medial (inner side)', front: 'Front', back: 'Back' };
export const VIEW_CANDIDATES = () => Math.max(1, Math.min(3, Number(process.env.VIEWS_CANDIDATES) || 2));
export const DRAWN_PREFIX = 'hv-';

const ANGLE = {
  lateral: 'the LATERAL view: a flat, exactly side-on profile of the OUTER side of the shoe (the side that faces away from the other shoe of the pair), toe pointing right, sole level along the bottom, no three-quarter angle and no perspective tilt',
  medial: 'the MEDIAL view: a flat, exactly side-on profile of the INNER side of the shoe (the arch side, the side that faces the other shoe of the pair), toe pointing left, sole level along the bottom, no three-quarter angle and no perspective tilt',
  front: 'the FRONT view: straight on from the front, centred and level, no three-quarter angle and no perspective tilt',
  back: 'the BACK view: straight on from behind, centred and level, no three-quarter angle and no perspective tilt'
};

export function viewPrompt({ title = '', category = '', view }) {
  return [`Image 1 is the approved studio picture of ${title || 'a product'}${category ? ` (${category})` : ''}, a three-quarter front view. Image 2 is the original reference photo of the same product.`,
    `Draw this exact same product as a clean, photorealistic studio product photograph from ${ANGLE[view] || `the ${view} view`}. The product centred and filling about 80% of the frame, on a plain light-grey seamless background, soft even studio light, a faint contact shadow.`,
    'Keep it the SAME product: identical shape, silhouette and proportions, identical materials and surface textures, identical colours and where each colour sits, and every visible detail (stitching, panels, overlays, hardware, soles, trims) in the same place and the same size.',
    'Where a detail on that side cannot be seen in either image, keep that area plain and simple. Do not invent logos, text, branding or features. No hands, people, props, glare or watermarks.'].join('\n');
}

// the views still to draw, in the order a factory reads them
export const viewsToDraw = missing => ['lateral', 'medial', 'front', 'back'].filter(v => missing.includes(v)).map(view => ({ view, label: VIEW_LABELS[view] }));

const dataBuf = url => { const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(String(url || '')); return m ? Buffer.from(m[2], 'base64') : null; };
const toJpeg = async buf => sharp(buf).rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

// test stand-in: the hero on a light backdrop, mirrored for the inner side and the back, a little different each try
const fixtureView = async (heroBuf, view, i) => {
  let img = sharp(heroBuf).rotate().resize({ width: 1024, height: 1024, fit: 'contain', background: '#e6e7ea' });
  if (view === 'medial' || view === 'back') img = img.flop();
  return img.modulate({ brightness: 1 + ((i % 3) * 0.03) - (view === 'back' || view === 'medial' ? 0.04 : 0) }).jpeg({ quality: 86 }).toBuffer();
};

const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['candidates'],
  properties: { candidates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'score', 'angleOk', 'issues'],
    properties: { index: { type: 'integer', description: 'Candidate number, from 1' }, score: { type: 'integer', description: '0-100: how faithfully it shows the SAME product as the hero picture' },
      angleOk: { type: 'boolean', description: 'true only if the candidate really is the requested view (a true side-on or straight-on picture, the right side)' },
      issues: { type: 'string', description: 'What differs from the hero (shape, proportions, colour, a detail added or lost, an invented logo or text) or is wrong about the angle, or "none"' } } } } }
};
const JUDGE_SYSTEM = `You compare candidate studio pictures with the approved hero picture of a product. The candidates were drawn from the hero by an image model, to show the product from another side.
For each candidate: (1) score 0-100 how faithfully it shows the SAME product as the hero (silhouette and proportions, materials and textures, colours and where each sits, every visible detail), ignoring the background and lighting; (2) say whether it really is the requested view. A pair of shoes, a mirrored copy, a three-quarter angle, or the wrong side is NOT the requested view.
Penalise hard: a changed shape, a colour changed or moved, a detail added or lost, a logo or text that is not in the hero. Be strict: 90+ means a factory would build the same product from it.`;

async function judge({ heroBuf, view, candidates, cfg }) {
  if (cfg.provider === 'fixture' || process.env.AI_FIXTURE) return candidates.map((_, i) => ({ index: i + 1, score: 92 - i * 2, angleOk: true, issues: 'none' }));
  const content = [{ type: 'text', text: 'The approved hero picture:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await toJpeg(heroBuf)).toString('base64') } }];
  candidates.forEach((c, i) => { content.push({ type: 'text', text: `Candidate ${i + 1}, which should be ${ANGLE[view]?.split(':')[0] || view}:` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.buffer.toString('base64') } }); });
  content.push({ type: 'text', text: 'Judge every candidate.' });
  try { return (await timed('anthropic', () => callJsonSchema(JUDGE_SYSTEM, content, JUDGE_SCHEMA))).candidates; }
  catch { return candidates.map((_, i) => ({ index: i + 1, score: 0, angleOk: false, issues: 'The comparison could not run.' })); }
}

// → { made: [{ view, label, buffer, score, issues }], skipped: [{ view, reason, score }] }; onView(made) is called as each view passes, so it can be saved at once.
export async function makeViews({ hero, photo, views, meta = {}, cfg = heroConfig(), n = VIEW_CANDIDATES(), min = HERO_APPROVE_MIN(), onView = async () => {} }) {
  if (!cfg.configured) throw new Error('No image model is connected: set OPENAI_API_KEY on the service.');
  const refs = [await toJpeg(hero)]; const ph = photo ? dataBuf(photo) : null; if (ph) refs.push(await toJpeg(ph));
  const made = [], skipped = [];
  for (const { view, label } of views) {
    const prompt = viewPrompt({ ...meta, view }), cands = []; let lastErr = null;
    for (let i = 0; i < n; i++) {
      try { cands.push({ buffer: cfg.provider === 'fixture' ? await fixtureView(hero, view, i) : await timed('imagegen-hero', () => openaiEdit({ images: refs, prompt, cfg: { ...cfg, size: process.env.HERO_SIZE || '1024x1024' } })) }); }
      catch (e) { lastErr = e; if (e.status === 401 || e.status === 403 || e.status === 429) break; }
    }
    if (!cands.length) { skipped.push({ view, reason: clip(lastErr?.message || 'The image model made nothing.', 200), score: null }); continue; }
    const judged = await judge({ heroBuf: hero, view, candidates: cands, cfg });
    let best = -1, bestScore = -1;
    cands.forEach((c, i) => { const j = judged.find(x => x.index === i + 1) || { score: 0, angleOk: false, issues: '' }; c.score = Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))); c.angleOk = j.angleOk === true; c.issues = clip(j.issues, 300); if (c.angleOk && c.score > bestScore) { best = i; bestScore = c.score; } });
    if (best < 0 || bestScore < min) { const top = cands.reduce((a, b) => (b.score > a.score ? b : a)); skipped.push({ view, reason: best < 0 ? `Not a true ${view} view: ${top.issues || 'the angle was wrong'}` : `Only ${bestScore}/100 like the hero: ${cands[best].issues}`, score: top.score }); continue; }
    const m = { view, label, buffer: cands[best].buffer, score: bestScore, issues: cands[best].issues }; made.push(m); await onView(m);
  }
  return { made, skipped };
}

// The sketch that goes on the pack for a drawn view. Its id says it was drawn, so it can be told from a picture the customer uploaded.
export async function viewSketch({ view, label, buffer }, heroId) {
  return { id: `${DRAWN_PREFIX}${view}-${String(heroId).replace(/-/g, '').slice(0, 8)}`, view, label: `${label} · drawn from the approved hero image`, image: await heroThumb(buffer, 1400, 84), garmentWidthIn: null, callouts: [] };
}
export const isDrawnView = s => String(s?.id || '').startsWith(DRAWN_PREFIX);

// Adds drawn views to a normalized pack: never over a picture someone uploaded for that view, and a newer drawing of a view replaces the earlier drawing.
export function placeViews(pack, sketches) {
  const keep = pack.sketches.filter(s => !(isDrawnView(s) && sketches.some(n => n.view === s.view)));
  const add = sketches.filter(n => !keep.some(s => s.view === n.view && s.image));
  pack.sketches = [...keep, ...add].slice(0, 12);
  return { pack, added: add.map(a => a.view) };
}
