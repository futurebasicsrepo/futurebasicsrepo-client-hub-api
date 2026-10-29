// A second pair of eyes on a drafted shoe, the way the design and developer assistants go over a tech pack: the shoe's four views (the tech
// flats, src/lab-footwear-views.js) are checked against the concept's picture until they read as the shoe in it, or a person is needed.
//   fixedChecks(pat, sil)            → what is measured without AI: the outline in the picture against the drawing's, and the pattern's own checks
//   reviewShoe({spec, photo, judges}) → the exchange: the outline's measurements go in first; then footwear developers (vision models, Claude
//                                      and an OpenAI model when both are connected, each on its own, briefed by REVIEW_SYSTEM) score the views
//                                      against the picture on six points, out of 100; the stricter score stands. They ask for changes to the
//                                      shoe's choices (never to the drawing): what both ask for, or one asks for and the other does not dispute,
//                                      is made and the views drawn again, round after round, until the score clears the bar, there is nothing
//                                      left to change, or two rounds in a row gain nothing. Where the judges disagree it says so, for a person.
//                                      The best shoe they saw is the result; nothing is saved here.
// Without a reviewer (Claude not connected) only the fixed checks and the outline run, and the result says so.
import sharp from 'sharp';
import { FW_STYLES, TOES, UPPERS, SOLES, cleanFootwear, footwearPattern } from './lab-footwear.js';
import { footwearViews, flatsSheet } from './lab-footwear-views.js';
import { silhouette, sideView, proposal } from './lab-shoe-read.js';

export const BAR = 90;
// what the developer scores, and how much each counts
export const CRITERIA = [
  { key: 'silhouette', weight: 25, label: 'Silhouette and proportions', ask: 'length against height, the line of the top from the heel to the toe, the heel\'s curve, how high the toe box stands' },
  { key: 'toe', weight: 10, label: 'Toe shape and spring', ask: 'round, almond, square or pointed from above; how far the toe lifts off the ground' },
  { key: 'collar', weight: 15, label: 'Collar and topline', ask: 'the collar\'s height at the back, the dip at the ankle, a shaft and how high it goes' },
  { key: 'lacing', weight: 15, label: 'Lacing and throat', ask: 'where the lace opening starts and ends along the shoe, the number of eyelets, the tongue' },
  { key: 'panels', weight: 20, label: 'Pieces of the upper', ask: 'where the vamp meets the quarters, a toe cap, a mudguard, a heel overlay, the eyestay; the materials' },
  { key: 'sole', weight: 15, label: 'Sole', ask: 'cupsole, midsole or stitched; its thickness at the heel and under the ball; the colours' }
];
// what the developer may ask to change: the shoe's choices, each bounded again by cleanFootwear
const FIELDS = {
  style: { kind: 'enum', of: Object.keys(FW_STYLES) }, toe: { kind: 'enum', of: Object.keys(TOES) }, sole: { kind: 'enum', of: Object.keys(SOLES) }, upper: { kind: 'enum', of: Object.keys(UPPERS) },
  collar: { kind: 'num', hint: 'the collar\'s height at the back above the insole, inches, 1.5 to 10' }, vamp: { kind: 'num', hint: 'where the vamp meets the quarters at the sole, share of the length from the heel, 0.4 to 0.75' },
  throat: { kind: 'num', hint: 'where the lace opening starts, share of the length from the heel, 0.1 to 0.6' }, eyelets: { kind: 'num', hint: 'eyelets a side, 3 to 14' },
  soleHeight: { kind: 'num', hint: 'the sole unit\'s thickness at the heel, inches, 0.25 to 2.5' }, heel: { kind: 'num', hint: 'heel height (the seat above the ball), inches' }, spring: { kind: 'num', hint: 'toe spring, inches' },
  toeCap: { kind: 'bool' }, mudguard: { kind: 'bool' }, heelOverlay: { kind: 'bool' },
  'colours.upper': { kind: 'hex' }, 'colours.overlay': { kind: 'hex' }, 'colours.sole': { kind: 'hex' }
};
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['view', 'criteria', 'fixes', 'beyondDrawing', 'summary'],
  properties: {
    view: { type: 'string', enum: ['side', 'three-quarter', 'top', 'front', 'sole', 'other'], description: 'which view the picture shows' },
    criteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'score', 'note'], properties: { key: { type: 'string', enum: CRITERIA.map(c => c.key) }, score: { type: 'integer', description: '0 to 100: how closely the drawing matches the picture on this point' }, note: { type: 'string', description: 'what differs, in a footwear developer\'s words; empty when it matches' } } } },
    fixes: { type: 'array', description: 'changes to the shoe\'s choices that bring the drawing closer to the picture, most important first; empty when nothing the choices can change would help', items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'why'], properties: { field: { type: 'string', enum: Object.keys(FIELDS) }, value: { type: 'string', description: 'the new value: a name from the list, a number, true or false, or a #rrggbb colour' }, why: { type: 'string' } } } },
    beyondDrawing: { type: 'array', items: { type: 'string' }, description: 'what the picture has that the drafted shoe cannot show with these choices (a sock collar, a split vamp, graphics, a carbon plate...), for a person' },
    summary: { type: 'string', description: 'one or two sentences' }
  }
};
export const REVIEW_SYSTEM = `You are a footwear developer checking a drafted shoe against its design picture before the pattern goes to the sample room. You are given the design picture, then the shoe's tech flats drawn from its pattern: the outside (lateral) and the inside (medial) from the side, from above, and the sole from below.
Compare them view for view (the picture's view against the same view of the flats) and score each point out of 100 for how closely the drawing matches the picture: ${CRITERIA.map(c => `${c.key} (${c.ask})`).join('; ')}.
Be strict: 90 means a sample room would make the shoe in the picture from this drawing. Judge proportions as if both were a men's US 9.
Then ask for the changes to the shoe's choices that would bring it closer, most important first. Change only what the picture shows clearly; never change something you were told was already changed for the same reason. What these choices cannot show goes in beyondDrawing for a person, not in fixes.`;

const num = v => Math.round(v * 1000) / 1000;
// the drawing's outside view: its length against its height, as the outline in the picture is measured
const drawnAspect = pat => { const b = footwearViews(pat).lateral.box; return (b.x1 - b.x0) / (b.y1 - b.y0); };
export function fixedChecks(pat, sil) {
  const out = [];
  if (sil && sideView(sil)) {
    const a = drawnAspect(pat), d = a / sil.aspect - 1;
    out.push({ key: 'aspect', ok: Math.abs(d) <= .08, label: 'Length against height, against the picture\'s outline', detail: `drawn ${a.toFixed(2)} : 1, picture ${sil.aspect.toFixed(2)} : 1${Math.abs(d) <= .08 ? ' (within 8%)' : ` (the drawing is ${d > 0 ? 'longer and lower' : 'shorter and taller'} by ${Math.round(Math.abs(d) * 100)}%)`}`, off: Math.abs(d) });
  } else out.push({ key: 'aspect', ok: null, label: 'Length against height, against the picture\'s outline', detail: 'The picture is not a plain side view, so its outline is not measured' });
  for (const c of (pat.checks || []).filter(c => c.level === 'warn' || c.level === 'error')) out.push({ key: 'pattern', ok: false, label: 'Pattern', detail: c.msg }); // its warnings; its notes are not checks
  const e = pat.marks?.eyelets || [];
  if (e.length > 1) { const gap = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]); out.push({ key: 'eyelets', ok: gap >= .35 && gap <= .85, label: 'Eyelet spacing', detail: `${gap.toFixed(2)} in apart` }); }
  return out;
}
// what the fixed checks cost, whatever the reviewer says (as a colour drifting from the photo costs a tech pack points): the outline is measured
const penaltyOf = checks => { const a = checks.find(c => c.key === 'aspect' && c.ok === false); return a ? Math.min(15, Math.round((a.off - .08) * 100)) : 0; };
export const scoreOf = (criteria, checks = []) => { const by = Object.fromEntries((criteria || []).map(c => [c.key, Math.max(0, Math.min(100, Number(c.score) || 0))])); return Math.max(0, Math.round(CRITERIA.reduce((s, c) => s + (by[c.key] ?? 0) * c.weight, 0) / 100) - penaltyOf(checks)); };

// one of the developer's changes, made on the shoe's choices; null when it is not one it may make or would change nothing
export function applyFix(spec, fix) {
  const f = FIELDS[fix?.field], raw = String(fix?.value ?? '').trim(); if (!f) return null;
  let v;
  if (f.kind === 'enum') { v = raw.toLowerCase(); if (!f.of.includes(v)) return null; }
  else if (f.kind === 'num') { v = Number(raw.replace(/[^0-9.\-]/g, '')); if (!Number.isFinite(v)) return null; }
  else if (f.kind === 'bool') { if (!/^(true|false)$/i.test(raw)) return null; v = /^true$/i.test(raw); }
  else { v = raw.toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(v)) return null; }
  const next = { ...spec };
  if (fix.field.startsWith('colours.')) next.colours = { ...(spec.colours || {}), [fix.field.slice(8)]: v };
  else next[fix.field] = v;
  // a new style brings its own heel, toe spring and toe (as the picture's reading does)
  if (fix.field === 'style' && v !== spec.style) { const S = FW_STYLES[v]; Object.assign(next, { heel: S.heel, spring: S.spring, toe: S.toe }); delete next.collar; delete next.throat; }
  const clean = cleanFootwear(next), key = fix.field.startsWith('colours.') ? 'colours' : fix.field;
  const before = key === 'colours' ? spec.colours?.[fix.field.slice(8)] : spec[key], after = key === 'colours' ? clean.colours?.[fix.field.slice(8)] : clean[key];
  if (after == null || JSON.stringify(before) === JSON.stringify(after)) return null;
  return { spec: clean, change: { key: fix.field, from: before ?? null, to: after, why: String(fix.why || '').slice(0, 300) } };
}

// the four views on one sheet, as a picture the reviewer can see
export async function sheetJpeg(spec, name = '') {
  const svg = flatsSheet(footwearPattern(spec), { title: name });
  return sharp(Buffer.from(svg), { density: 110 }).flatten({ background: '#ffffff' }).resize({ width: 1600, height: 1600, fit: 'inside' }).jpeg({ quality: 84 }).toBuffer();
}
const imageBlock = (buf, type = 'image/jpeg') => ({ type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } });

// two judges: the same changes asked for by both are made (numbers that agree are met in the middle); one asked for by only one is made unless
// the other asks for something else for the same choice, which is a disagreement for a person and left as it is
const agree = (f, a, b) => { const k = FIELDS[f]?.kind; if (k === 'num') { const x = Number(String(a).replace(/[^0-9.\-]/g, '')), y = Number(String(b).replace(/[^0-9.\-]/g, '')); return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= Math.max(.25, Math.max(Math.abs(x), Math.abs(y)) * .15); } return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };
export function mergeFixes(list) {
  const by = new Map(), out = [], conflicts = [];
  for (const { name, fixes } of list) for (const f of (fixes || []).slice(0, 6)) if (FIELDS[f?.field] && !by.get(f.field)?.some(x => x.name === name)) by.set(f.field, [...(by.get(f.field) || []), { name, ...f }]);
  for (const [field, asks] of by) {
    if (asks.length === 1) { out.push({ ...asks[0], from: [asks[0].name] }); continue; }
    if (asks.every(a => agree(field, a.value, asks[0].value))) { const k = FIELDS[field].kind, v = k === 'num' ? String(asks.reduce((s, a) => s + Number(String(a.value).replace(/[^0-9.\-]/g, '')), 0) / asks.length) : asks[0].value; out.push({ field, value: v, why: asks.map(a => a.why).filter(Boolean).join(' / '), from: asks.map(a => a.name) }); }
    else conflicts.push({ field, asks: asks.map(a => ({ name: a.name, value: String(a.value), why: String(a.why || '').slice(0, 200) })) });
  }
  return { fixes: out, conflicts };
}
const judged = (name, res, checks) => ({ name, score: scoreOf(res?.criteria, checks), view: res?.view || 'other', summary: String(res?.summary || '').slice(0, 400),
  criteria: CRITERIA.map(c => { const x = (res?.criteria || []).find(y => y.key === c.key) || {}; return { key: c.key, label: c.label, score: Math.max(0, Math.min(100, Number(x.score) || 0)), note: String(x.note || '').slice(0, 300) }; }),
  beyondDrawing: (res?.beyondDrawing || []).map(v => String(v).slice(0, 200)).slice(0, 8), fixes: res?.fixes || [] });

// judges: [{name, ask}] (ask as callJsonSchema: system, content blocks, schema). Several judges see the same pictures; the strictest score stands.
export async function reviewShoe({ spec, photo, name = '', ask = null, judges = null, bar = BAR, rounds = 4, onRound = () => {} } = {}) {
  const J = judges?.length ? judges : ask ? [{ name: 'Claude', ask }] : [];
  let cur = cleanFootwear(spec), sil = null;
  const changes = [], log = [];
  try { sil = await silhouette(photo); } catch { sil = null; }
  // first the outline: what it measures (the collar, the toe spring, the sole) goes in before anyone looks
  if (sil && sideView(sil)) { const p = proposal(cur, sil, null); for (const c of p.changes) changes.push({ ...c, round: 0, by: 'outline', why: 'Measured from the picture\'s outline' }); cur = cleanFootwear(p.spec); }
  let checks = fixedChecks(footwearPattern(cur), sil);
  onRound({ n: 0, by: 'outline', checks, changes: changes.slice() });
  if (!J.length) return { status: 'checks-only', spec: cur, changes, checks, rounds: log, bar, score: null, beyondDrawing: [], judges: [], note: 'The developer review needs Claude: only the outline and the fixed checks ran.' };
  const pic = await sharp(photo).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  let best = null, flat = 0, status = 'needs-person';
  for (let n = 1; n <= rounds; n++) {
    const sheet = await sheetJpeg(cur, name), before = changes.filter(c => c.by !== 'outline').map(c => `round ${c.round}: ${c.key} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)} (${c.why})`);
    const content = [
      { type: 'text', text: `The design picture of "${String(name).slice(0, 80)}":` }, imageBlock(pic),
      { type: 'text', text: 'The shoe as drafted, its tech flats:' }, imageBlock(sheet),
      { type: 'text', text: `The shoe's choices now: ${JSON.stringify(Object.fromEntries(Object.entries(cur).filter(([k]) => !['edits', 'seams', 'picture', 'last3d', 'sketches'].includes(k))))}.\nWhat each change means: ${Object.entries(FIELDS).map(([k, f]) => `${k}${f.kind === 'enum' ? ` (${f.of.join(', ')})` : f.hint ? ` (${f.hint})` : f.kind === 'bool' ? ' (true or false)' : ' (#rrggbb)'}`).join('; ')}.\nMeasured without AI: ${checks.map(c => `${c.label}: ${c.detail}`).join('; ')}.\n${before.length ? `Already changed in earlier rounds: ${before.join('; ')}.` : 'Nothing has been changed by a reviewer yet.'}` }
    ];
    // each judge on its own, at the same time; one that cannot answer is left out of the round
    const got = await Promise.allSettled(J.map(j => j.ask(REVIEW_SYSTEM, content, REVIEW_SCHEMA)));
    const ran = got.map((g, i) => g.status === 'fulfilled' && g.value ? judged(J[i].name, g.value, checks) : null).filter(Boolean), missed = J.filter((_, i) => got[i].status !== 'fulfilled' || !got[i].value).map(j => j.name);
    if (!ran.length) throw new Error('No reviewer could answer');
    const score = Math.min(...ran.map(r => r.score)), made = [], { fixes, conflicts } = mergeFixes(ran);
    const round = { n, score, judges: ran.map(({ fixes: _, ...r }) => r), missed, disagree: ran.length > 1 && Math.max(...ran.map(r => r.score)) - score >= 15, conflicts,
      criteria: CRITERIA.map(c => { const xs = ran.map(r => r.criteria.find(y => y.key === c.key)); const lo = xs.reduce((a, b) => (b.score < a.score ? b : a)); return { key: c.key, label: c.label, score: lo.score, note: xs.map((x, i) => x.note && ran.length > 1 ? `${ran[i].name}: ${x.note}` : x.note).filter(Boolean).join(' · ').slice(0, 500) }; }),
      summary: ran.map(r => (ran.length > 1 ? `${r.name}: ${r.summary}` : r.summary)).filter(Boolean).join(' ').slice(0, 700), beyondDrawing: [...new Set(ran.flatMap(r => r.beyondDrawing))].slice(0, 10), view: ran[0].view, changes: made };
    if (!best || score > best.score) { best = { score, spec: cur, n }; flat = 0; } else flat++;
    log.push(round);
    if (score >= bar) { status = 'passed'; onRound(round); break; }
    if (flat >= 2 || n === rounds) { onRound(round); break; } // no gain twice running, or out of rounds: the last asks are not tried unseen
    let next = cur;
    for (const f of fixes) { const a = applyFix(next, f); if (a) { next = a.spec; made.push({ ...a.change, round: n, by: 'developer', judges: f.from }); } }
    onRound(round);
    if (!made.length) break;
    changes.push(...made); cur = next; checks = fixedChecks(footwearPattern(cur), sil);
  }
  // the shoe the judges scored highest (by the strictest of them), with the changes that led to it
  const kept = changes.filter(c => c.by === 'outline' || c.round < best.n), names = J.map(j => j.name);
  return { status, spec: best.spec, score: best.score, bar, changes: kept, checks: fixedChecks(footwearPattern(best.spec), sil), rounds: log, judges: names, beyondDrawing: [...new Set(log.flatMap(r => r.beyondDrawing))],
    note: status === 'passed' ? `The drawing reads as the shoe in the picture (${best.score}/100${names.length > 1 ? `, the stricter of ${names.join(' and ')}` : ''}).` : `Below the bar of ${bar} (${best.score}/100${names.length > 1 ? `, the stricter of ${names.join(' and ')}` : ''}): needs a person.` };
}

// the second judge: an OpenAI vision model given the same pictures, words and schema (OPENAI_CHECK_MODEL, as the colourway check)
export function openaiAsk(env = process.env, fetchImpl = globalThis.fetch) {
  return async (system, content, schema) => {
    const parts = content.map(b => b.type === 'image' ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } } : { type: 'text', text: b.text });
    const res = await fetchImpl(`${env.OPENAI_API_ORIGIN || 'https://api.openai.com'}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model: env.OPENAI_CHECK_MODEL || 'gpt-5', response_format: { type: 'json_schema', json_schema: { name: 'shoe_review', strict: true, schema } }, messages: [{ role: 'system', content: system }, { role: 'user', content: parts }] }) });
    if (!res.ok) throw new Error(`OpenAI review refused (${res.status})`);
    return JSON.parse((await res.json())?.choices?.[0]?.message?.content || 'null');
  };
}
