// Reads how each library sketch is built, once, before anyone drafts from it: its front and back are shown to two vision models (Claude and an
// OpenAI model), each on its own, and only what both see is kept, in src/lab-template-construction.js (src/lab-construction.js drafts from
// it ahead of the sketch's name). What they disagree on is left to the name and the style, and listed at the end for a person to look at.
//
//   node scripts/pattern-read-sketches.mjs --style pants,shorts [--only id,...] [--jobs 6] [--out dir]
//
//   needs ANTHROPIC_API_KEY and OPENAI_API_KEY (OPENAI_CHECK_MODEL, gpt-5 unless set). Answers are kept in <out>/cache, so a run again only
//   asks about new sketches; entries already in the file for other sketches are kept.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate, STYLES, renderSvg } from '../src/lab-flats.js';
import { TEMPLATE_CONSTRUCTION } from '../src/lab-template-construction.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const list = v => (v && v !== true ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
const OUT = arg('out', 'pattern-judge-out/read'), JOBS = Number(arg('jobs', 6)) || 6, STY = list(arg('style')), ONLY = list(arg('only'));
mkdirSync(`${OUT}/cache`, { recursive: true });
const inline = new Map(), templateSvg = file => { if (!inline.has(file)) { const t = readFileSync(new URL(`../src/flat-templates/${file}`, import.meta.url), 'utf8'); inline.set(file, t.slice(t.indexOf('>', t.indexOf('<svg')) + 1, t.lastIndexOf('</svg>'))); } return inline.get(file); };
const png = svg => sharp(Buffer.from(svg)).resize({ width: 900, height: 900, fit: 'inside' }).flatten({ background: '#ffffff' }).png().toBuffer();
const b64 = b => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b.toString('base64') } });

// what is asked of a pair of trousers or shorts: only what the pattern can draft
const BOTTOM = { type: 'object', additionalProperties: false, required: ['front_pockets', 'cargo_pockets', 'back_pockets', 'back_yoke', 'belt_loops', 'waist', 'fly', 'pleats', 'knee', 'leg', 'side', 'notes'], properties: {
  front_pockets: { type: 'string', enum: ['none', 'slash', 'jeans scoop with coin pocket', 'jeans scoop'], description: 'the front hip pockets: slanted or side-seam openings (slash), curved jeans scoops, or none' },
  cargo_pockets: { type: 'boolean', description: 'patch or bellows pockets on the side of the thigh' },
  back_pockets: { type: 'boolean', description: 'any pockets on the back (patch or welt)' },
  back_yoke: { type: 'boolean', description: 'a seam across the back below the waistband (a jeans yoke)' },
  belt_loops: { type: 'boolean' },
  waist: { type: 'string', enum: ['fixed', 'elastic', 'drawcord'], description: 'fixed: a flat band with a button or hook; elastic: gathered; drawcord: gathered with a cord out at the front' },
  fly: { type: 'boolean', description: 'a fly opening at the centre front (zip or buttons)' },
  pleats: { type: 'integer', description: 'front pleats on each leg (0 if none)' },
  knee: { type: 'string', enum: ['single', 'double'], description: 'double: a second layer of cloth over the front knee' },
  leg: { type: 'string', enum: ['straight', 'taper', 'wide', 'flare', 'balloon'] },
  side: { type: 'string', enum: ['none', 'stripe', 'panel'], description: 'a stripe of tape or a contrast panel down the outside of the leg' },
  notes: { type: 'string', description: 'anything else about how it is built that the fields above do not cover, in a few words' } } };
const SYSTEM = 'You are a technical pattern maker reading a designer\'s flat sketch (front and back) to draft its pattern. Report only construction you can see drawn: not what such a garment usually has. Look at both views.';
async function judges() {
  const out = [];
  if (process.env.ANTHROPIC_API_KEY) { const { callJsonSchema } = await import('../src/studio.js'); out.push({ name: 'Claude', ask: (s, c, sc) => callJsonSchema(s, c, sc, { maxTokens: 1500 }) }); }
  if (process.env.OPENAI_API_KEY) { const { openaiAsk } = await import('../src/lab-shoe-review.js'); const a = openaiAsk(); out.push({ name: 'OpenAI', ask: (s, c, sc) => a(s, c, sc) }); }
  return out;
}
// what the answer means for the pattern (src/lab-construction.js's fields)
const toConstruction = a => {
  const pk = []; if (a.front_pockets === 'slash') pk.push('slash'); if (/jeans/.test(a.front_pockets)) pk.push('five-pocket'); if (a.cargo_pockets) pk.push('cargo');
  return { pockets: pk, backPockets: a.back_pockets, yoke: { front: false, back: a.back_yoke }, beltLoops: a.belt_loops, waist: a.waist, pleats: Math.min(Math.max(a.pleats | 0, 0), 3), knee: a.knee, leg: a.leg, panels: { none: 'none', stripe: 'side-stripe', panel: 'side-panel' }[a.side] || 'none' };
};
// only what both saw: a field where they differ is left out (the name and the style decide it)
const agree = (A, B) => {
  const out = {}, off = [];
  for (const k of Object.keys(A)) {
    if (k === 'pockets') { const a = [...A.pockets].sort().join(), b = [...B.pockets].sort().join(); if (a === b) out.pockets = A.pockets; else off.push(`pockets ${a || 'none'} / ${b || 'none'}`); continue; }
    if (JSON.stringify(A[k]) === JSON.stringify(B[k])) out[k] = A[k]; else off.push(`${k} ${JSON.stringify(A[k])} / ${JSON.stringify(B[k])}`);
  }
  return { out, off };
};

let T = FLAT_TEMPLATES.filter(t => STYLES[t.style]?.kind === 'bottom' && !STYLES[t.style].skirt);
if (STY.length) T = T.filter(t => STY.includes(t.style)); if (ONLY.length) T = T.filter(t => ONLY.includes(t.id));
const J = await judges(); if (J.length < 2) { console.error('Both ANTHROPIC_API_KEY and OPENAI_API_KEY are needed: a sketch is read by two models and only what both see is kept'); process.exit(2); }
console.log(`${T.length} sketches · ${J.map(j => j.name).join(' and ')}`);
const result = { ...TEMPLATE_CONSTRUCTION }, review = [];
async function one(t) {
  const p = fitToTemplate({ ...defaultParams(t.style), template: t.id });
  const views = []; for (const v of ['front', 'back']) { try { views.push([v, await png(renderSvg(p, v, { templateSvg, showDims: false, plain: true, scale: 40 }))]); } catch { /* a sketch with one view */ } }
  const content = [...views.flatMap(([v, b]) => [{ type: 'text', text: `The flat sketch, ${v}:` }, b64(b)]), { type: 'text', text: `It is "${t.label}", a pair of ${STYLES[t.style].label.toLowerCase()}. Say how it is built from what is drawn.` }];
  const got = {};
  for (const j of J) { const f = `${OUT}/cache/${t.id}-${j.name}.json`; if (existsSync(f)) { got[j.name] = JSON.parse(readFileSync(f, 'utf8')); continue; }
    try { got[j.name] = await j.ask(SYSTEM, content, BOTTOM); writeFileSync(f, JSON.stringify(got[j.name])); } catch (e) { console.log(`${t.id}: ${j.name} failed: ${e.message}`); } }
  if (!got.Claude || !got.OpenAI) return;
  const { out, off } = agree(toConstruction(got.Claude), toConstruction(got.OpenAI)); result[t.id] = out;
  if (off.length) review.push(`${t.id}: ${off.join('; ')}`);
  console.log(`${t.id}: ${Object.keys(out).length} agreed${off.length ? `, ${off.length} differ` : ''}`);
}
const q = [...T]; await Promise.all(Array.from({ length: JOBS }, async () => { while (q.length) await one(q.shift()); }));
const ids = Object.keys(result).sort();
writeFileSync(new URL('../src/lab-template-construction.js', import.meta.url), `// Generated by scripts/pattern-read-sketches.mjs: how each library sketch is built, as two vision models read it from its front and back
// (only what both saw is kept). src/lab-construction.js drafts from it ahead of the sketch's name. Do not edit by hand: run the script again.
export const TEMPLATE_CONSTRUCTION = {
${ids.map(id => `${JSON.stringify(id)}: ${JSON.stringify(result[id])},`).join('\n')}
};
`);
writeFileSync(`${OUT}/disagreements.txt`, review.sort().join('\n') + '\n');
console.log(`${ids.length} sketches in src/lab-template-construction.js; ${review.length} with something the models read differently (${OUT}/disagreements.txt)`);
