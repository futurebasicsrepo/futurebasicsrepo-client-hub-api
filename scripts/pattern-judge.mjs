// An internal check of the garment patterns before anyone sees them: every library sketch is drafted the way a new piece would be (fitted to
// its sketch), and the sketch is set beside the pattern put together. Two vision models judge each pair on their own (Claude and an OpenAI
// model), part by part, and say what is off and which measurement, construction choice or drafting rule would fix it. Nothing is changed:
// the report (a page with every pair, worst first, and its JSON) is for whoever is working on the patterns.
//
//   node scripts/pattern-judge.mjs [--style pants,shorts] [--only pt-slim-jeans,...] [--limit 20] [--judges claude,openai] [--dry] [--out dir] [--jobs 4]
//
//   needs ANTHROPIC_API_KEY for Claude and OPENAI_API_KEY for OpenAI (OPENAI_CHECK_MODEL, gpt-5 unless set); --dry draws the pairs only.
//   Answers are kept in <out>/cache by the pattern's own fingerprint, so a run after a fix asks again only about what changed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate, STYLES, renderSvg, measurementsFor } from '../src/lab-flats.js';
import { garmentPattern, assembled, boundsOf, cutWords, drawnCheck } from '../src/lab-pattern.js';
import { constructionWords } from '../src/lab-construction.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const list = v => (v && v !== true ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
const OUT = arg('out', 'pattern-judge-out'), DRY = Boolean(arg('dry', false)), JOBS = Number(arg('jobs', 4)) || 4, LIMIT = Number(arg('limit', 0)) || 0;
const STY = list(arg('style')), ONLY = list(arg('only')), JUDGES = list(arg('judges', 'claude,openai'));
mkdirSync(`${OUT}/img`, { recursive: true }); mkdirSync(`${OUT}/cache`, { recursive: true });

// ---- drawing the pair ----
const inline = new Map(), templateSvg = file => { if (!inline.has(file)) { const t = readFileSync(new URL(`../src/flat-templates/${file}`, import.meta.url), 'utf8'); inline.set(file, t.slice(t.indexOf('>', t.indexOf('<svg')) + 1, t.lastIndexOf('</svg>'))); } return inline.get(file); };
const png = (svg, w = 900) => sharp(Buffer.from(svg)).resize({ width: w, height: w, fit: 'inside' }).flatten({ background: '#ffffff' }).png().toBuffer();
// the pattern put together: each view's pieces as the product shows them, front then back, in one scale with the sketch's inches
function productSvg(pat) {
  const A = assembled(pat), B = A.bounds, pad = 2, W = B.x1 - B.x0 + pad * 2, H = B.y1 - B.y0 + pad * 2 + 2;
  const poly = x => `<polygon points="${x.pts.map(([a, b]) => `${(a - B.x0 + pad).toFixed(2)},${(b - B.y0 + pad).toFixed(2)}`).join(' ')}" fill="#ebe5d8" stroke="#141416" stroke-width="${(W / 500).toFixed(3)}" stroke-linejoin="round"/>`;
  const fb = boundsOf(A.pieces.filter(x => x.piece.place.view !== 'back').flatMap(x => x.pts)), lab = (t, x) => `<text x="${(x - B.x0 + pad).toFixed(2)}" y="${(H - .6).toFixed(2)}" font-family="sans-serif" font-size="${(W / 45).toFixed(2)}" fill="#555">${t}</text>`;
  // as the Pattern page shows it: what is inside (a pocket bag, a facing) is not seen, and the rest is stacked by its place's depth
  const seen = A.pieces.filter(x => !x.piece.hidden).sort((a, b) => (a.piece.place.z || 0) - (b.piece.place.z || 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" width="${Math.round(W * 20)}" height="${Math.round(H * 20)}"><rect width="100%" height="100%" fill="#fff"/>${seen.map(poly).join('')}${lab('Front', fb.x0)}${A.backDx ? lab('Back', fb.x0 + A.backDx) : ''}</svg>`;
}
const sketchSvg = (p, v) => renderSvg(p, v, { templateSvg, showDims: false, plain: true, scale: 40, background: true });

// ---- what the judges are asked ----
const ASPECTS = ['silhouette', 'length', 'sleeves or legs', 'neck, collar or hood', 'opening and closure', 'pockets', 'seams, panels and yokes', 'waist and hem finish'];
const SCHEMA = { type: 'object', additionalProperties: false, required: ['score', 'verdict', 'aspects', 'issues'], properties: {
  score: { type: 'integer', description: '0-100: how well the pattern, sewn, makes the garment in the sketch' },
  verdict: { type: 'string', enum: ['match', 'close', 'off'] },
  aspects: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['aspect', 'score', 'note'], properties: { aspect: { type: 'string', enum: ASPECTS }, score: { type: 'integer' }, note: { type: 'string' } } } },
  issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['part', 'problem', 'severity', 'fix_kind', 'fix'], properties: {
    part: { type: 'string' }, problem: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    fix_kind: { type: 'string', enum: ['measurement', 'construction', 'drafting', 'sketch'] }, fix: { type: 'string', description: 'the change, naming the measurement or construction field and the value where it is one' } } } } } };
const SYSTEM = `You are a senior technical pattern maker checking a pattern drafted by software against the designer's flat sketch, before the pattern goes to a sample room. The last picture is the pattern's outside pieces put together as the garment (front on the left, back on the right): what the garment will look like sewn, drawn as flat shapes without topstitching, so a pocket set into a seam shows only as its opening or its facing. Inside pieces (pocket bags, facings, linings) are not drawn: they are in the piece list. Judge whether it makes the garment in the sketch: the silhouette and proportions (width against length, how the body or legs run from top to hem), the length, the sleeves or legs (shape, width at the cuff or hem, taper or flare), neck, collar or hood, the opening and how it closes, the pockets (kind, count, place), seams, panels and yokes, the waist and hem finish.
Be exact and strict: a pattern that would sew into a visibly different garment is 'off'. Do not mark down what a flat sketch cannot show (seam allowance, grain, the inside of the garment), and do not mark down the sketch being drawn slimmer than a body: patterns are drafted to body measurements plus ease. For each problem say which part, what is wrong, and the fix: a measurement (name it: ${'${M}'}, and the value), a construction choice (sleeve, collar, opening, pockets, waist, leg, panels, pleats, yoke, knee), a drafting rule in the software, or the sketch itself when the sketch is what is wrong. Write plainly and briefly.`;
const words = (t, p, pat) => {
  const m = measurementsFor(p, p.size || 'M'), K = pat.construction || {}, dc = (() => { try { return drawnCheck(p, pat); } catch { return null; } })();
  return [`The sketch: "${t.label}" (${t.id}), a ${STYLES[t.style]?.label || t.style}, size ${pat.size || 'M'}.`,
    `Measurements (inches): ${Object.entries(m).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k} ${Math.round(v * 8) / 8}`).join(', ')}.`,
    `Built with: ${constructionWords(K).join(', ') || 'the basic block'}.`,
    `The pieces: ${pat.pieces.map(q => { const b = boundsOf(q.sew); return `${q.name} (${cutWords(q).replace(/^Cut /, 'cut ')}, ${Math.round(b.w * 4) / 4}×${Math.round(b.h * 4) / 4} in)`; }).join('; ')}.`,
    dc ? `Measured on the pattern against the sketch (one leg, laid flat): ${dc.rows.map(r => `${r.label} sketch ${r.drawn} / pattern ${r.pattern}`).join('; ')}.` : ''].filter(Boolean).join('\n');
};

// ---- the judges ----
async function judges() {
  const out = [];
  if (JUDGES.includes('claude') && process.env.ANTHROPIC_API_KEY) { const { callJsonSchema } = await import('../src/studio.js'); out.push({ name: 'Claude', ask: (s, c) => callJsonSchema(s, c, SCHEMA, { maxTokens: 3000 }) }); }
  if (JUDGES.includes('openai') && process.env.OPENAI_API_KEY) { const { openaiAsk } = await import('../src/lab-shoe-review.js'); const a = openaiAsk(); out.push({ name: 'OpenAI', ask: (s, c) => a(s, c, SCHEMA) }); }
  return out;
}
const b64 = b => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b.toString('base64') } });

// ---- the run ----
let T = FLAT_TEMPLATES.filter(t => STYLES[t.style] && !STYLES[t.style].oneSize || STYLES[t.style]);
if (STY.length) T = T.filter(t => STY.includes(t.style)); if (ONLY.length) T = T.filter(t => ONLY.includes(t.id)); if (LIMIT) T = T.slice(0, LIMIT);
const J = DRY ? [] : await judges();
if (!DRY && !J.length) { console.error('No judge: set ANTHROPIC_API_KEY and/or OPENAI_API_KEY, or run with --dry'); process.exit(2); }
console.log(`${T.length} sketches · judges: ${J.map(j => j.name).join(', ') || 'none (dry)'}`);
const rows = [];
async function one(t) {
  const p = fitToTemplate({ ...defaultParams(t.style), template: t.id }); let pat;
  try { pat = garmentPattern(p); } catch (e) { rows.push({ t, error: `drafting threw: ${e.message}` }); return; }
  if (!pat) { rows.push({ t, error: 'no pattern' }); return; }
  const prod = productSvg(pat), fp = createHash('sha1').update(JSON.stringify({ m: p.m, o: p.options, prod })).digest('hex').slice(0, 12);
  const [sf, sb, pp] = await Promise.all([png(sketchSvg(p, 'front')), png(sketchSvg(p, 'back')).catch(() => null), png(prod, 1200)]);
  writeFileSync(`${OUT}/img/${t.id}-sketch.png`, sf); if (sb) writeFileSync(`${OUT}/img/${t.id}-sketch-back.png`, sb); writeFileSync(`${OUT}/img/${t.id}-pattern.png`, pp);
  const text = words(t, p, pat), content = [{ type: 'text', text: 'The flat sketch, front:' }, b64(sf), ...(sb ? [{ type: 'text', text: 'The flat sketch, back:' }, b64(sb)] : []), { type: 'text', text: 'The pattern put together (front, then back):' }, b64(pp), { type: 'text', text }];
  const verdicts = {};
  for (const j of J) {
    const file = `${OUT}/cache/${t.id}-${fp}-${j.name}.json`;
    if (existsSync(file)) { verdicts[j.name] = JSON.parse(readFileSync(file, 'utf8')); continue; }
    try { const v = await j.ask(SYSTEM.replace('${M}', Object.keys(p.m).join(', ')), content); writeFileSync(file, JSON.stringify(v)); verdicts[j.name] = v; }
    catch (e) { verdicts[j.name] = { error: String(e.message).slice(0, 200) }; }
  }
  const scores = Object.values(verdicts).map(v => v.score).filter(Number.isFinite);
  rows.push({ t, fp, text, verdicts, worst: scores.length ? Math.min(...scores) : null, spread: scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0 });
  process.stdout.write(`${t.id}: ${scores.join(' / ') || (DRY ? 'drawn' : 'no answer')}\n`);
}
const queue = [...T]; await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) await one(queue.shift()); }));

// ---- the report: worst first; where the judges disagree by a lot, that is said ----
rows.sort((a, b) => (a.error ? -1 : 0) - (b.error ? -1 : 0) || (a.worst ?? 101) - (b.worst ?? 101));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tally = (k) => rows.filter(r => Object.values(r.verdicts || {}).some(v => v.verdict === k)).length;
const summary = { sketches: rows.length, judged: rows.filter(r => r.worst != null).length, off: tally('off'), close: tally('close'), errors: rows.filter(r => r.error).length,
  byStyle: Object.fromEntries(Object.entries(rows.reduce((a, r) => { if (r.worst != null) (a[r.t.style] = a[r.t.style] || []).push(r.worst); return a; }, {})).map(([k, v]) => [k, { n: v.length, mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length), min: Math.min(...v) }])),
  fixes: Object.entries(rows.flatMap(r => Object.values(r.verdicts || {}).flatMap(v => (v.issues || []).filter(i => i.severity !== 'low').map(i => i.fix_kind))).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {})) };
writeFileSync(`${OUT}/report.json`, JSON.stringify({ summary, rows: rows.map(({ t, ...r }) => ({ id: t.id, style: t.style, label: t.label, ...r })) }, null, 1));
const card = r => `<section class="${r.error ? 'err' : (r.worst ?? 100) < 60 ? 'off' : (r.worst ?? 100) < 80 ? 'close' : 'ok'}"><h2>${esc(r.t.label)} <small>${esc(r.t.id)} · ${esc(r.t.style)}${r.worst != null ? ` · worst ${r.worst}${r.spread >= 25 ? ` · the judges differ by ${r.spread}` : ''}` : ''}</small></h2>
  ${r.error ? `<p>${esc(r.error)}</p>` : `<div class="pair"><img src="img/${r.t.id}-sketch.png" loading="lazy"><img src="img/${r.t.id}-pattern.png" loading="lazy"></div>
  ${Object.entries(r.verdicts).map(([n, v]) => `<div class="j"><b>${esc(n)}</b> ${v.error ? esc(v.error) : `${v.score} · ${esc(v.verdict)}<ul>${(v.issues || []).map(i => `<li class="${i.severity}"><b>${esc(i.part)}</b>: ${esc(i.problem)} <i>→ ${esc(i.fix_kind)}: ${esc(i.fix)}</i></li>`).join('')}</ul>`}</div>`).join('')}`}</section>`;
writeFileSync(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><title>Pattern check</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#141416;background:#f4f3ef}h1{font-size:20px}pre{background:#fff;padding:10px;border-radius:8px;overflow:auto}
section{background:#fff;border-radius:12px;padding:14px 16px;margin:0 0 14px;border-left:6px solid #2fbf71}section.close{border-color:#e0a100}section.off,section.err{border-color:#d33}h2{font-size:15px;margin:0 0 8px}h2 small{font-weight:400;color:#666}
.pair{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}.pair img{width:100%;border:1px solid #ddd;border-radius:8px;background:#fff}.j{margin-top:8px}.j ul{margin:4px 0 0;padding-left:18px}li.high{color:#b00}li.medium{color:#8a5a00}li i{color:#555}</style>
<h1>Pattern check · ${rows.length} sketches</h1><pre>${esc(JSON.stringify(summary, null, 1))}</pre>${rows.map(card).join('')}`);
console.log(JSON.stringify(summary, null, 1)); console.log(`report: ${OUT}/index.html`);
