// Design Lab: the graphic program. A season's graphics designed as one system, the way the brands we study build theirs: a handful of motifs (crests, original lettering,
// numerals, stripes, patterns, illustration, technical annotation, icons) that repeat across the line, with a palette and a rule for where each goes. Concepts then draw on it.
// Everything here is ours: the assistant is told to study how those programs are built (their range, discipline and placement), never to copy a mark, lettering, crest, print or
// character from anyone, and never to name them. Graphics are plain shapes (lettering turned into outlines from our fonts), checked against brand names before they are kept.
import { ask as realAsk, providerReady, costCents } from './intel-llm.js';
import { brandCodeWords, DEFAULT_BRAND_CODE, categoryLabel } from './lab.js';
import { cleanGraphic, GRAPHIC_KINDS, GRAPHIC_PLACE, GRAPHIC_TECHNIQUES, brandHits, stripBrands, programWords, resolveMotifs } from './lab-concepts.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const KINDS = GRAPHIC_KINDS.map(k => k.id);
const hex = v => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? '').trim()); return m ? '#' + (m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]).toUpperCase() : ''; };

export const cleanMotif = (m, i = 0) => {
  const c = m?.svg ? cleanGraphic(m.svg) : { svg: '', texts: [] }, kind = clip(m?.kind, 20).toLowerCase();
  return { id: /^m\d{1,2}$/.test(String(m?.id)) ? m.id : `m${i + 1}`, name: clip(m?.name, 80), kind: KINDS.includes(kind) ? kind : 'icon', idea: clip(m?.idea, 300), svg: c.svg, texts: (c.texts.length ? c.texts : (Array.isArray(m?.texts) ? m.texts : [])).map(t => clip(t, 24)).filter(Boolean).slice(0, 8),
    placements: (Array.isArray(m?.placements) ? m.placements : []).map(p => clip(p, 40).toLowerCase()).filter(p => Object.keys(GRAPHIC_PLACE).includes(p)).slice(0, 4) };
};
// → a clean program, or null when there is nothing in it.
export function cleanProgram(p) {
  if (!p || typeof p !== 'object') return null;
  const used = new Set(), motifs = (Array.isArray(p.motifs) ? p.motifs : []).map(cleanMotif).filter(m => m.name && m.idea).slice(0, 8).map((m, i) => { let id = m.id; while (used.has(id)) id = `m${Math.floor(Math.random() * 90) + 10}`; used.add(id); return { ...m, id }; });
  const name = clip(p.name, 80); if (!name && !motifs.length) return null;
  return { name: name || 'Graphic program', story: clip(p.story, 700), rules: clip(p.rules, 500), palette: (Array.isArray(p.palette) ? p.palette : []).map(c => ({ name: clip(c?.name, 30), hex: hex(c?.hex) })).filter(c => c.hex).slice(0, 6), motifs };
}
export function programFixture({ user }) {
  const cats = [...new Set([...String(user).matchAll(/category (\w+)/g)].map(m => m[1]))];
  const mk = (n, kind, idea, svg, placements) => ({ name: n, kind, idea, svg, placements });
  const crest = '<svg viewBox="0 0 200 240"><path d="M20 20 H180 V120 Q180 200 100 230 Q20 200 20 120 Z" fill="#1F3A5F"/><text x="100" y="125" font-family="grotesk-bold" font-size="64" text-anchor="middle" fill="#F2EBDD">FB</text><rect x="40" y="150" width="120" height="6" fill="#C8372D"/></svg>';
  const num = '<svg viewBox="0 0 240 160"><text x="120" y="130" font-family="grotesk-bold" font-size="150" text-anchor="middle" fill="#1F3A5F" letter-spacing="-4">26</text></svg>';
  const stripe = '<svg viewBox="0 0 400 60"><rect x="0" y="0" width="400" height="14" fill="#1F3A5F"/><rect x="0" y="22" width="400" height="6" fill="#F2EBDD"/><rect x="0" y="36" width="400" height="14" fill="#C8372D"/></svg>';
  const tech = '<svg viewBox="0 0 300 120"><line x1="10" y1="60" x2="290" y2="60" stroke="#141416" stroke-width="2" stroke-dasharray="6 4"/><circle cx="10" cy="60" r="6" fill="#C8372D"/><text x="150" y="40" font-family="mono" font-size="16" text-anchor="middle" fill="#141416">SPEC 01 / FB-26</text></svg>';
  return { name: 'Quiet Varsity', story: 'A varsity-leaning program built on one crest, one numeral and two stripes, in navy, cream and a single red, used with restraint.', rules: 'One motif per piece, two at most. Stripes carry colour; the crest and numerals carry the story.', palette: [{ name: 'Navy', hex: '#1F3A5F' }, { name: 'Cream', hex: '#F2EBDD' }, { name: 'Red', hex: '#C8372D' }, { name: 'Ink', hex: '#141416' }],
    motifs: [mk('FB crest', 'crest', 'A small shield with our initials and a red bar', crest, ['left chest', 'front chest']), mk('Season numeral', 'numerals', 'The year as a big numeral', num, ['front centre', 'back']), mk('Band stripes', 'stripes', 'Three bands: navy, cream, red', stripe, ['chest band', 'sleeve']), mk('Spec line', 'technical', 'A dashed measure line with a spec code', tech, ['hem', 'inside'])], _cats: cats };
}

// → { program, costCents }. `lines` are the plan's pieces; `trends` the trend read (with the graphics the references use); `note` steers it.
export async function generateProgram({ plan = {}, lines = [], trends = null, code = DEFAULT_BRAND_CODE, note = '', askImpl = realAsk, env = process.env, fetchImpl = fetch } = {}) {
  if (!providerReady('anthropic', env)) throw new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)');
  const system = `You are the creative director of graphics at Future Basics, a male-driven and unisex label. The brands we study (Ralph Lauren, Aimé Leon Dore, A-COLD-WALL* and others like them) have taken their graphic programs deep: a whole system of crests, lettering, numerals, stripes, patterns, illustration and technical annotation that repeats across a season and builds a world. Future Basics does the same, but every mark is OURS.\n${brandCodeWords(code)}\nRules: study how those programs are built (how many kinds of motif, how disciplined the palette is, how motifs repeat and where they sit) and make a program of our own with the same depth and discipline. NEVER copy or imitate a specific mark, crest, lettering style, print, pattern or character from any brand, never name another brand, and never describe one. Graphics are not limited to our logo or its line and dot, nor to the logo colours: choose a palette that suits the program. Lettering must be our own words: Future Basics, FB, a year, a short label, a number, a coordinate, a spec code (24 characters at most per line).\nEach motif is an SVG you draw yourself: viewBox "0 0 W H" with W and H between 40 and 800, plain shapes (rect, circle, ellipse, line, polyline, polygon, path, g) and <text> for lettering, with font-family one of grotesk-bold, grotesk, grotesk-light or mono, solid hex colours from your palette, at most about 40 elements. No images, gradients, filters, patterns, links or scripts. Keep each motif bold and legible at chest size and at embroidery size.`;
  const cats = [...new Set(lines.filter(l => l.status !== 'dropped').map(l => l.category))];
  const seen = trends ? trends.categories.filter(c => cats.includes(c.id) && c.count).map(c => `${categoryLabel(c.id)}: ${(c.graphics || []).map(g => g.name).join('; ') || 'none read yet'}`).join('\n') : '';
  const user = `Design the graphic program for this plan.\nPlan: ${clip(plan.name, 80)}${plan.season ? ' · ' + clip(plan.season, 40) : ''}${plan.brief ? ' · ' + clip(plan.brief, 300) : ''}\nPieces: ${lines.filter(l => l.status !== 'dropped').map(l => `${l.name} (category ${l.category}, ${l.role})`).join('; ') || 'none yet'}\nWhat graphics the references put on these kinds of piece (for the range and depth to match, never to copy):\n${seen || 'not read yet'}\n${note ? `Steer: ${clip(note, 400)}\n` : ''}\nAnswer {"name":"program name","story":"two sentences: the idea and the world","palette":[{"name":"Navy","hex":"#1F3A5F"}],"rules":"how and where motifs are used, how many per piece","motifs":[{"name":"short","kind":"${KINDS.join('|')}","idea":"what it is","placements":["${Object.keys(GRAPHIC_PLACE).join('|')}"],"svg":"<svg viewBox=\\"0 0 200 200\\">...</svg>"}]}. Make four to six motifs across different kinds, including at least one with original lettering or numerals.`;
  const res = await askImpl({ provider: 'anthropic', system, user, json: true, maxTokens: 9000, env, fetchImpl, fixture: programFixture });
  const program = cleanProgram(res.json), names = [];
  if (program) for (const m of program.motifs) { const hits = brandHits(`${m.name} ${m.idea} ${m.texts.join(' ')}`); if (hits.length) { m.svg = ''; m.texts = []; m.idea = stripBrands(m.idea) || m.idea; names.push(...hits); } }
  if (program) program.motifs = program.motifs.filter(m => m.svg || m.idea);
  return { program: program && program.motifs.length ? program : null, costCents: costCents('anthropic', res.usage?.input || 0, res.usage?.output || 0, env), dropped: names };
}
export { GRAPHIC_TECHNIQUES, programWords, resolveMotifs };
