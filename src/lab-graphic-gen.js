// The graphic generator: one brief, three engines side by side, every answer back as print-ready ink layers.
//
//   Claude    art direction (a distinct idea, prompt and ink palette for every slot) and its own drawing, written as SVG
//   OpenAI    a picture from words, on a clear background
//   Google    a picture from words, on plain white (Google draws on a ground; the trace leaves the ground out)
//
// Every engine runs at once with its own time limit. One that is not connected, times out or refuses is reported as such and the others
// still answer: without Claude the ideas come from the season and style below; without either image model Claude still draws.
// Each answer is traced (src/lab-vector.js) into one filled path per ink, matched to Pantone C, so the Studio can open it as layers to
// recolour, merge, thicken, separate and export.
//
//   generate(ask, deps)  → { results: [{ engine, title, prompt, png, svg, colours, width, height }], engines: [{ id, label, ok, made, error }] }
//     deps: { ready: {claude, openai, google}, claude(system, user, maxTokens) → text, image(provider, prompt) → Buffer, trace(png, opts) }

import sharp from 'sharp';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const HEX = /^#[0-9a-f]{6}$/i;

export const ENGINES = [
  { id: 'claude', label: 'Claude', does: 'Ideas and vector drawing' },
  { id: 'openai', label: 'OpenAI', does: 'Image' },
  { id: 'google', label: 'Google', does: 'Image' }
];
// the seasons a line drops in, each with a starting ink palette (the darkest first: it is usually the key line)
export const SEASONS = [
  { id: 'spring', label: 'Spring', cue: 'spring: blossoms, new growth, rain, light and fresh', palette: ['#2f4a3a', '#f2c6c2', '#a8c79a', '#f5ecd7'] },
  { id: 'summer', label: 'Summer', cue: 'summer: sun, surf, heat haze, citrus, long days outside', palette: ['#1d3557', '#f4a261', '#e9c46a', '#2a9d8f'] },
  { id: 'back-to-school', label: 'Back to school', cue: 'back to school: varsity, pennants, notebooks, campus crests', palette: ['#14213d', '#b5302b', '#f1e3c6', '#c9a227'] },
  { id: 'fall', label: 'Fall', cue: 'fall: harvest, falling leaves, flannel, woodsmoke and cider', palette: ['#3b2a1e', '#c4622d', '#e0a43a', '#6b7a3a'] },
  { id: 'halloween', label: 'Halloween', cue: 'Halloween: friendly-spooky, moons, bats, pumpkins, glow', palette: ['#141416', '#f07b1e', '#7a3fb0', '#e8e3d0'] },
  { id: 'holiday', label: 'Holiday', cue: 'winter holidays: snow, pine, warm lights, gifting, cosy', palette: ['#173f2f', '#b3202b', '#f4efe4', '#c9a54a'] },
  { id: 'winter', label: 'Winter', cue: 'deep winter: mountains, ice, alpine sport, crisp air', palette: ['#16243a', '#9cc4dd', '#f2f5f7', '#5b6b7c'] },
  { id: 'valentines', label: "Valentine's", cue: "Valentine's day: hearts, love notes, sweet and a little retro", palette: ['#5a1020', '#e2364b', '#f7b8c4', '#fbefe9'] },
  { id: 'lunar-new-year', label: 'Lunar New Year', cue: 'Lunar New Year: lanterns, the zodiac animal, luck and gold', palette: ['#8b1414', '#d4a017', '#141416', '#f6e7c8'] },
  { id: 'pride', label: 'Pride', cue: 'Pride: joyful, bold, inclusive, rainbow energy', palette: ['#141416', '#e40303', '#ffd400', '#2a7de1', '#8f3fbf'] },
  { id: 'july-4', label: '4th of July', cue: 'Fourth of July: fireworks, Americana, stars and stripes, cook-outs', palette: ['#14213d', '#b22234', '#f5f1e6', '#9aa8b8'] },
  { id: 'evergreen', label: 'All year', cue: 'a core, all-year design', palette: ['#141416', '#f5f1e6', '#8a8f98'] }
];
export const STYLES = [
  { id: 'vintage-tour', label: 'Vintage tour', cue: 'a cracked, worn 1970s rock tour print, bold arched type' },
  { id: 'varsity', label: 'Varsity', cue: 'collegiate varsity: block serif letters, a crest or mascot, a number' },
  { id: 'retro-70s', label: 'Retro 70s', cue: 'groovy 1970s: rounded bubbly type, sunset stripes, wavy lines' },
  { id: 'y2k', label: 'Y2K', cue: 'Y2K: chrome-like flat shapes, stars, tribal swooshes, playful' },
  { id: 'line-art', label: 'Line art', cue: 'one-weight fine line illustration, minimal, lots of air' },
  { id: 'badge', label: 'Badge', cue: 'a round or shield badge: a ring of type round a central emblem' },
  { id: 'hand-drawn', label: 'Hand drawn', cue: 'loose hand-drawn ink illustration with a brush-lettered word' },
  { id: 'bold-type', label: 'Bold type', cue: 'type-led: big stacked heavy letters as the whole graphic' },
  { id: 'outdoors', label: 'Outdoors', cue: 'national-park outdoors: mountains, trees, a sun, a trail sign' },
  { id: 'streetwear', label: 'Streetwear', cue: 'streetwear: graphic, oversized, icon plus a short slogan' }
];
const seasonOf = id => SEASONS.find(s => s.id === id) || null, styleOf = id => STYLES.find(s => s.id === id) || null;

// what the person asked for, made safe: brief, season, style, inks (1–8), count per engine (1–3), engines, palette
export function cleanAsk(b = {}) {
  const season = seasonOf(b.season), style = styleOf(b.style);
  const palette = (Array.isArray(b.palette) ? b.palette : []).filter(h => HEX.test(String(h))).map(h => h.toLowerCase()).slice(0, 8);
  const engines = (Array.isArray(b.engines) && b.engines.length ? b.engines : ENGINES.map(e => e.id)).filter(e => ENGINES.some(x => x.id === e));
  return { brief: clip(b.brief, 600), words: clip(b.words, 60), season: season?.id || '', style: style?.id || '', inks: Math.min(8, Math.max(1, Math.round(Number(b.inks) || 3))),
    count: Math.min(3, Math.max(1, Math.round(Number(b.count) || 1))), engines: [...new Set(engines)], palette: palette.length ? palette : (season?.palette || []).slice(0, Math.max(1, Math.round(Number(b.inks) || 3))) };
}
const askWords = ask => [ask.brief, ask.words && `The words on it: "${ask.words}"`, seasonOf(ask.season)?.cue && `For ${seasonOf(ask.season).cue}`, styleOf(ask.style)?.cue && `In the style of ${styleOf(ask.style).cue}`].filter(Boolean).join('. ');

// ---- ideas: Claude's art direction, or (without it) the brief turned a few ways by hand ----
const TWISTS = ['a centred chest emblem', 'a large back print', 'a badge with a ring of type', 'type-led with a small icon', 'an all-over scattered motif', 'an arched word over a picture'];
export function fallbackDirections(ask, n) {
  const base = askWords(ask) || 'an original seasonal garment graphic';
  return Array.from({ length: n }, (_, i) => ({ title: clip(`${styleOf(ask.style)?.label || seasonOf(ask.season)?.label || 'Graphic'} · ${TWISTS[i % TWISTS.length]}`, 60), prompt: `${base}. Composed as ${TWISTS[i % TWISTS.length]}.`, palette: ask.palette.slice(0, ask.inks) }));
}
const DIR_SCHEMA = { type: 'object', additionalProperties: false, required: ['directions'], properties: { directions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'prompt', 'palette'],
  properties: { title: { type: 'string', description: 'Two to five words naming the idea' }, prompt: { type: 'string', description: 'What to draw, for an image model: subject, composition, type, mood. One paragraph, no brand names.' },
    palette: { type: 'array', items: { type: 'string', description: '#rrggbb' }, description: 'The ink colours, darkest first' } } } } } };
export const DIR_SYSTEM = 'You are the art director of an apparel brand. You turn one brief into distinct, original garment graphics that print well: bold silhouettes, a limited number of flat spot inks, no gradients, no photo detail. Each idea must differ in composition and concept, not only colour. Never use another company\'s name, logo, character or trade dress. Keep any words short and spelled exactly as given.';
export function directionsUser(ask, n) {
  return `Brief: ${askWords(ask) || 'an original seasonal graphic'}.\nInks: exactly ${ask.inks} spot colours${ask.palette.length ? `, starting from ${ask.palette.join(', ')}` : ''}.\nGive ${n} directions as JSON matching this schema: ${JSON.stringify(DIR_SCHEMA)}`;
}
export function parseDirections(text, ask, n) {
  const t = String(text || ''), obj = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  const list = (Array.isArray(obj?.directions) ? obj.directions : []).map(d => ({ title: clip(d.title, 60) || 'Graphic', prompt: clip(d.prompt, 700),
    palette: (Array.isArray(d.palette) ? d.palette : []).filter(h => HEX.test(String(h))).map(h => h.toLowerCase()).slice(0, ask.inks) })).filter(d => d.prompt.length > 8);
  if (!list.length) throw new Error('No directions came back');
  const fill = fallbackDirections(ask, n); return Array.from({ length: n }, (_, i) => list[i] || fill[i]).map(d => ({ ...d, palette: d.palette.length ? d.palette : ask.palette.slice(0, ask.inks) }));
}

// ---- what each engine is told ----
export function imagePrompt(dir, ask, provider) {
  const ground = provider === 'google' ? 'isolated on a plain flat pure white background, nothing else in the picture' : 'isolated on a fully transparent background, nothing else in the picture';
  return `An original garment graphic, print-ready flat vector-style artwork for screen printing, ${ground}: ${dir.prompt} `
    + `Use exactly ${ask.inks} solid spot ink colour${ask.inks === 1 ? '' : 's'}${dir.palette.length ? ` (${dir.palette.join(', ')})` : ''}; flat fills only, no gradients, no soft shadows, no halftone, no texture, no photo detail. `
    + 'Crisp clean edges, bold shapes and lines thick enough to print. No mock-up, no garment, no frame. Do not use any other company\'s name, logo or trade dress.';
}
export const SVG_SYSTEM = 'You are a vector illustrator for apparel screen printing. You answer with one complete SVG document and nothing else: no prose, no code fence.';
export function svgUser(dir, ask) {
  return `Draw this garment graphic as SVG: ${dir.prompt}\nRules: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">. A transparent background (no full-size background rectangle). `
    + `Exactly these ${ask.inks} fill colours and no others: ${(dir.palette.length ? dir.palette : ask.palette).join(', ') || 'your choice of strong spot colours'}. Flat fills only: no gradients, filters, masks, patterns, images, opacity or blur. `
    + 'Use path, circle, ellipse, rect, polygon and g; text only with font-family "sans-serif" or "serif" and font-weight bold, for words of the brief. Bold shapes, lines at least 6 units thick. Keep it under 40 KB.';
}
// an SVG from a model, kept only if it is plain drawing: no script, no outside reference, nothing that fetches or runs
export function cleanSvg(text) {
  let s = String(text || ''); const a = s.indexOf('<svg'), b = s.lastIndexOf('</svg>'); if (a < 0 || b < a) return null; s = s.slice(a, b + 6);
  if (s.length > 200_000) return null;
  if (/<\s*(script|foreignObject|iframe|image|use|a|animate\w*|set|style|link|meta)\b/i.test(s) || /\son\w+\s*=/i.test(s) || /(?:xlink:)?href\s*=/i.test(s) || /url\s*\(|javascript:|data:|@import|<!ENTITY|<!DOCTYPE/i.test(s)) return null;
  if (!/viewBox\s*=/.test(s)) s = s.replace('<svg', '<svg viewBox="0 0 1024 1024"');
  if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}
export const svgPng = async svg => sharp(Buffer.from(svg), { density: 144 }).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

const within = (p, ms, what) => new Promise((res, rej) => { const t = setTimeout(() => rej(Object.assign(new Error(`${what} took too long`), { timeout: true })), ms); Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
const why = e => clip(e?.timeout ? e.message : String(e?.message || e || 'failed').replace(/\s*\{[\s\S]*$/, ''), 160);

export async function generate(input, deps) {
  const ask = input.engines ? input : cleanAsk(input), ready = deps.ready || {}, ms = deps.timeoutMs || 150_000;
  const status = Object.fromEntries(ENGINES.map(e => [e.id, { id: e.id, label: e.label, ok: false, made: 0, wanted: ask.engines.includes(e.id), error: ask.engines.includes(e.id) ? (ready[e.id] ? '' : 'not connected') : 'off' }]));
  const drawers = ask.engines.filter(e => ready[e]); if (!drawers.length) throw Object.assign(new Error('None of the chosen engines is connected'), { status: 503, engines: Object.values(status) });
  const n = drawers.length * ask.count;
  // 1. the ideas: Claude's if it answers in time, else the brief turned by hand; either way every slot gets its own idea
  let dirs, directedBy = 'template';
  if (ready.claude) {
    try { dirs = parseDirections(await within(deps.claude(DIR_SYSTEM, directionsUser(ask, n), 3000), Math.min(ms, 60_000), 'Claude\'s ideas'), ask, n); directedBy = 'claude'; }
    catch (e) { status.claude.error = `ideas: ${why(e)}`; dirs = fallbackDirections(ask, n); }
  } else dirs = fallbackDirections(ask, n);
  // 2. every engine draws its share at once
  const jobs = []; let k = 0;
  for (let i = 0; i < ask.count; i++) for (const e of drawers) jobs.push({ engine: e, dir: dirs[k++] });
  const draw = async ({ engine, dir }) => {
    let png;
    if (engine === 'claude') { const svg = cleanSvg(await deps.claude(SVG_SYSTEM, svgUser(dir, ask), 16000)); if (!svg) throw new Error('its drawing was not a clean SVG'); png = await svgPng(svg); }
    else png = await sharp(await deps.image(engine, imagePrompt(dir, ask, engine))).ensureAlpha().resize(1024, 1024, { fit: 'inside' }).png().toBuffer();
    const v = await deps.trace(png, { max: ask.inks, maxSide: 1024, name: dir.title });
    if (!v.colours.length) throw new Error('the picture came back empty');
    return { engine, title: dir.title, prompt: dir.prompt, palette: dir.palette, png, svg: v.svg, colours: v.colours, width: v.width, height: v.height, paths: v.paths };
  };
  const settled = await Promise.allSettled(jobs.map(j => within(draw(j), ms, ENGINES.find(x => x.id === j.engine).label)));
  const results = [];
  settled.forEach((s, i) => { const st = status[jobs[i].engine]; if (s.status === 'fulfilled') { results.push(s.value); st.made++; st.ok = true; } else if (!st.made) st.error = why(s.reason); });
  for (const st of Object.values(status)) if (st.ok && st.error && !st.error.startsWith('ideas')) st.error = '';
  if (!results.length) throw Object.assign(new Error('No engine could draw it: ' + Object.values(status).filter(s => s.wanted && s.error).map(s => `${s.label} ${s.error}`).join('; ')), { status: 502, engines: Object.values(status) });
  return { results, engines: Object.values(status), directedBy, ask };
}

// ---- the test stand-ins: a flat drawing in the asked inks, different for each slot ----
export function fixtureSvg(dir, ask, seed = 0) {
  const p = (dir.palette.length ? dir.palette : ask.palette.length ? ask.palette : ['#141416', '#b5302b', '#f1e3c6']).slice(0, Math.max(1, ask.inks)), c = i => p[i % p.length];
  const r = 260 + (seed % 3) * 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="${r}" fill="${c(0)}"/><rect x="${312 - seed * 8}" y="452" width="${400 + seed * 16}" height="120" fill="${c(1)}"/>${p.length > 2 ? `<polygon points="512,180 600,330 424,330" fill="${c(2)}"/>` : ''}</svg>`;
}
export const fixtureClaude = (system, user) => {
  if (system === DIR_SYSTEM) { const n = Number(/Give (\d+) directions/.exec(user)?.[1]) || 1; return JSON.stringify({ directions: Array.from({ length: n }, (_, i) => ({ title: `Test idea ${i + 1}`, prompt: `A test graphic, number ${i + 1}, with a circle and a band`, palette: [] })) }); }
  const pal = (/fill colours and no others: ([^.]+)\./.exec(user)?.[1] || '').split(',').map(s => s.trim()).filter(h => HEX.test(h));
  return fixtureSvg({ palette: pal }, { palette: pal, inks: pal.length || 3 }, 1);
};
export const fixtureImage = async (provider, prompt) => {
  const pal = (/\((#[0-9a-f]{6}(?:, #[0-9a-f]{6})*)\)/i.exec(prompt)?.[1] || '#141416, #b5302b').split(', '), n = Number(/exactly (\d+) solid/.exec(prompt)?.[1]) || pal.length;
  const svg = fixtureSvg({ palette: pal.slice(0, n) }, { palette: pal, inks: n }, provider === 'google' ? 2 : 0);
  const png = await svgPng(svg);
  return provider === 'google' ? sharp(png).flatten({ background: '#ffffff' }).png().toBuffer() : png;
};

// ---- Claude, for real: one system and one user message, the text back (streamed, since a drawing can run long) ----
export async function claudeText(system, user, maxTokens = 4000, { model = process.env.GRAPHIC_MODEL || process.env.AI_MODEL || 'claude-opus-5-5' } = {}) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const msg = await new Anthropic().messages.stream({ model, max_tokens: maxTokens, system, output_config: { effort: 'medium' }, messages: [{ role: 'user', content: user }] }).finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined that brief');
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
