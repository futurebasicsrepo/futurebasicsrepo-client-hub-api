// A second pair of eyes on a drafted plush, the way a shoe is checked (src/lab-shoe-review.js): the toy's three views (front, back and side,
// drawn from its pattern by src/lab-plush-views.js) are checked against the concept's picture until they read as the toy in it, or a person
// is needed.
//   reviewPlush({spec, photo, judges}) → the exchange: soft-toy developers (vision models, Claude and an OpenAI model when both are connected,
//                                       each on its own, briefed by REVIEW_SYSTEM) score the views against the picture on six points, out of
//                                       100; the stricter score stands. They ask for changes to the toy's choices from the kit (its body type,
//                                       head, snout, ears, parts, tail, colours; never to the drawing): what both ask for, or one asks for and
//                                       the other does not dispute, is made and the views drawn again, round after round, until the score
//                                       clears the bar, there is nothing left to change, or two rounds in a row gain nothing. Where the judges
//                                       disagree it says so, for a person. The best toy they saw is the result; nothing is saved here.
// Without a reviewer (no AI connected) only the pattern's own checks run, and the result says so.
import sharp from 'sharp';
import { PLUSH_SHAPES, PLUSH_EARS, PLUSH_SNOUTS, PLUSH_HORNS, PLUSH_MANES, PLUSH_TAILS, PLUSH_FABRICS, PLUSH_EYES, PLUSH_PARTS, cleanPlush, plushDefaults, plushPattern } from './lab-pattern.js';
import { plushViews } from './lab-plush-views.js';

export const BAR = 90;
// what the developer scores, and how much each counts
export const CRITERIA = [
  { key: 'body', weight: 25, label: 'Body type and proportions', ask: 'sitting, standing, round or swimming; how big the head is against the body; how long the legs are' },
  { key: 'face', weight: 20, label: 'Head and face', ask: 'the head\'s shape, the snout (none, short, long and pointed, long and broad), the eyes, nose and mouth' },
  { key: 'ears', weight: 10, label: 'Ears', ask: 'their kind (round, pointed, long, floppy, big) and size' },
  { key: 'limbs', weight: 15, label: 'Legs, arms and tail', ask: 'which it has, and the tail\'s kind (short, long, bushy, tufted, hair, fluke, fin)' },
  { key: 'parts', weight: 15, label: 'Horns, mane, wings, spikes, fins', ask: 'which it has, and their kind' },
  { key: 'colour', weight: 15, label: 'Colours and material', ask: 'the body\'s colour, the contrast parts (muzzle, inner ears, pads, belly, horn), the mane\'s, and the cloth (pile, leather, velvet…)' }
];
// what the developer may ask to change: the toy's choices from the kit, each bounded again by cleanPlush
const FIELDS = {
  shape: { kind: 'enum', of: Object.keys(PLUSH_SHAPES) }, ears: { kind: 'enum', of: Object.keys(PLUSH_EARS) }, snout: { kind: 'enum', of: Object.keys(PLUSH_SNOUTS) },
  horn: { kind: 'enum', of: Object.keys(PLUSH_HORNS) }, mane: { kind: 'enum', of: Object.keys(PLUSH_MANES) }, tailType: { kind: 'enum', of: Object.keys(PLUSH_TAILS) },
  fabric: { kind: 'enum', of: Object.keys(PLUSH_FABRICS) }, eyes: { kind: 'enum', of: Object.keys(PLUSH_EYES) },
  wings: { kind: 'bool' }, spikes: { kind: 'bool' }, dorsal: { kind: 'bool' }, arms: { kind: 'bool' }, legs: { kind: 'bool' }, tail: { kind: 'bool' },
  head: { kind: 'num', hint: 'the head\'s size against the body, 0.8 to 1.3 (1 is usual)' }, height: { kind: 'num', hint: 'its height in inches (a sea creature\'s length), 4 to 48' },
  'colours.body': { kind: 'hex' }, 'colours.contrast': { kind: 'hex' }, 'colours.mane': { kind: 'hex' }
};
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['view', 'criteria', 'fixes', 'beyondDrawing', 'summary'],
  properties: {
    view: { type: 'string', enum: ['front', 'three-quarter', 'side', 'back', 'other'], description: 'which view the picture shows' },
    criteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'score', 'note'], properties: { key: { type: 'string', enum: CRITERIA.map(c => c.key) }, score: { type: 'integer', description: '0 to 100: how closely the drawing matches the picture on this point' }, note: { type: 'string', description: 'what differs, in a soft-toy developer\'s words; empty when it matches' } } } },
    fixes: { type: 'array', description: 'changes to the toy\'s choices that bring the drawing closer to the picture, most important first; empty when nothing the choices can change would help', items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'why'], properties: { field: { type: 'string', enum: Object.keys(FIELDS) }, value: { type: 'string', description: 'the new value, as the field takes it' }, why: { type: 'string' } } } },
    beyondDrawing: { type: 'array', items: { type: 'string' }, description: 'what the picture has that the kit cannot show with these choices (a scarf, a held object, an embroidered pattern, a pose…), for a person' },
    summary: { type: 'string', description: 'one or two sentences' }
  }
};
export const REVIEW_SYSTEM = `You are a soft-toy developer checking a drafted plush against its design picture before the pattern goes to the sample room. You are given the design picture, then the toy's flats drawn from its pattern: from the front, the back and the side.
Compare them (the picture's view against the same view of the flats) and score each point out of 100 for how closely the drawing matches the picture: ${CRITERIA.map(c => `${c.key} (${c.ask})`).join('; ')}.
Be strict: 90 means a sample room would sew the toy in the picture from this drawing. Judge it as the same animal or character, in the same pose, with the same parts.
Then ask for the changes to the toy's choices that would bring it closer, most important first. Its body type comes first: a four-legged animal sitting is "quad", a whale or fish is "sea", one standing on two legs with arms is "bear", a round one is "bean". Change only what the picture shows clearly; never change something you were told was already changed for the same reason. What these choices cannot show goes in beyondDrawing for a person, not in fixes.`;

// a change the developer asked for, made on the toy's choices; null when it is not one it may make, or would change nothing the drawing shows
export function applyFix(spec, fix) {
  const f = FIELDS[fix?.field], raw = String(fix?.value ?? '').trim(); if (!f) return null;
  let v;
  if (f.kind === 'enum') { v = raw.toLowerCase(); if (!f.of.includes(v)) return null; }
  else if (f.kind === 'num') { v = Number(raw.replace(/[^0-9.\-]/g, '')); if (!Number.isFinite(v)) return null; }
  else if (f.kind === 'bool') { if (!/^(true|false)$/i.test(raw)) return null; v = /^true$/i.test(raw); }
  else { v = raw.toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(v)) return null; }
  let next = { ...spec };
  if (fix.field.startsWith('colours.')) next.colours = { ...(spec.colours || {}), [fix.field.slice(8)]: v };
  // a new body type brings its own parts and size (as the picture's reading does); not a new cloth, colours, eyes or age
  else if (fix.field === 'shape' && v !== spec.shape) next = { ...plushDefaults(v), colours: spec.colours, fabric: spec.fabric, eyes: spec.eyes, age: spec.age, animal: spec.animal, logos: spec.logos, sketches: spec.sketches, shape: v };
  else next[fix.field] = v;
  const clean = cleanPlush(next), key = fix.field.startsWith('colours.') ? 'colours' : fix.field;
  const before = key === 'colours' ? spec.colours?.[fix.field.slice(8)] : spec[key], after = key === 'colours' ? clean.colours?.[fix.field.slice(8)] : clean[key];
  if (after == null || JSON.stringify(before) === JSON.stringify(after)) return null;
  // a part on a body type that does not take it changes nothing drawn: not made, so a round is not spent on it
  const part = Object.keys(PLUSH_PARTS).find(p => p === fix.field); if (part && !PLUSH_PARTS[part].includes(clean.shape)) return null;
  return { spec: clean, change: { key: fix.field, from: before ?? null, to: after, why: String(fix.why || '').slice(0, 300) } };
}

// the three views side by side on one sheet, as a picture the reviewer can see
export function sheetSvg(spec) {
  const v = plushViews(plushPattern(spec)), keys = ['front', 'back', 'side'], gap = 1.5;
  let x = 0, body = '', H = 0;
  for (const k of keys) { const b = v[k].box, w = b.x1 - b.x0, h = b.y1 - b.y0; body += `<g transform="translate(${x - b.x0 + .6} ${-b.y0 + .6})">${v[k].svg}</g><text x="${x + .6 + w / 2}" y="${h + 1.9}" font-size=".6" text-anchor="middle" fill="#55545a" font-family="Helvetica,Arial,sans-serif">${k}</text>`; x += w + gap; H = Math.max(H, h); }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 1.2} ${H + 2.6}" width="${Math.round((x + 1.2) * 60)}" height="${Math.round((H + 2.6) * 60)}"><rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`;
}
export async function sheetJpeg(spec) {
  return sharp(Buffer.from(sheetSvg(spec)), { density: 110 }).flatten({ background: '#ffffff' }).resize({ width: 1600, height: 1000, fit: 'inside' }).jpeg({ quality: 84 }).toBuffer();
}
const imageBlock = (buf, type = 'image/jpeg') => ({ type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } });

// two judges: the same change asked for by both is made (numbers that agree are met in the middle); one asked for by only one is made unless
// the other asks for something else for the same choice, which is a disagreement for a person and left as it is
const toNum = v => Number(String(v).replace(/[^0-9.\-]/g, ''));
// two colours within a few shades of each other are the same colour, met in the middle
const rgb = h => { const n = parseInt(String(h).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }, near = (a, b) => /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) && Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i])) <= 30;
const mean = hs => '#' + [0, 1, 2].map(i => Math.round(hs.reduce((s, h) => s + rgb(h)[i], 0) / hs.length).toString(16).padStart(2, '0')).join('');
const agree = (f, a, b) => { if (FIELDS[f]?.kind === 'hex') return near(String(a).trim().toLowerCase(), String(b).trim().toLowerCase()); if (FIELDS[f]?.kind === 'num') { const x = toNum(a), y = toNum(b); return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= Math.max(.1, Math.max(Math.abs(x), Math.abs(y)) * .15); } return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };
export function mergeFixes(list) {
  const by = new Map(), out = [], conflicts = [];
  for (const { name, fixes } of list) for (const f of (fixes || []).slice(0, 8)) if (FIELDS[f?.field] && !by.get(f.field)?.some(x => x.name === name)) by.set(f.field, [...(by.get(f.field) || []), { name, ...f }]);
  for (const [field, asks] of by) {
    if (asks.length === 1) { out.push({ ...asks[0], from: [asks[0].name] }); continue; }
    if (asks.every(a => agree(field, a.value, asks[0].value))) out.push({ field, value: FIELDS[field].kind === 'num' ? String(asks.reduce((s, a) => s + toNum(a.value), 0) / asks.length) : FIELDS[field].kind === 'hex' ? mean(asks.map(a => String(a.value).trim().toLowerCase())) : asks[0].value, why: asks.map(a => a.why).filter(Boolean).join(' / '), from: asks.map(a => a.name) });
    else conflicts.push({ field, asks: asks.map(a => ({ name: a.name, value: String(a.value), why: String(a.why || '').slice(0, 200) })) });
  }
  // the body type first: the other changes are made on the body it brings
  out.sort((a, b) => (b.field === 'shape') - (a.field === 'shape'));
  return { fixes: out, conflicts };
}
export const scoreOf = criteria => { const by = Object.fromEntries((criteria || []).map(c => [c.key, Math.max(0, Math.min(100, Number(c.score) || 0))])); return Math.round(CRITERIA.reduce((s, c) => s + (by[c.key] ?? 0) * c.weight, 0) / 100); };
const judged = (name, res) => ({ name, score: scoreOf(res?.criteria), view: res?.view || 'other', summary: String(res?.summary || '').slice(0, 400),
  criteria: CRITERIA.map(c => { const x = (res?.criteria || []).find(y => y.key === c.key) || {}; return { key: c.key, label: c.label, score: Math.max(0, Math.min(100, Number(x.score) || 0)), note: String(x.note || '').slice(0, 300) }; }),
  beyondDrawing: (res?.beyondDrawing || []).map(v => String(v).slice(0, 200)).slice(0, 8), fixes: res?.fixes || [] });
const checksOf = spec => (plushPattern(spec).checks || []).filter(c => c.level === 'warn' || c.level === 'fail').map(c => ({ key: 'pattern', ok: false, label: 'Pattern', detail: c.msg }));
const choices = spec => Object.fromEntries(Object.entries(spec).filter(([k]) => !['sketches', 'logos', 'fill', 'depth'].includes(k)));

// judges: [{name, ask}] (ask as callJsonSchema: system, content blocks, schema). Several judges see the same pictures; the strictest score stands.
export async function reviewPlush({ spec, photo, name = '', judges = [], bar = BAR, rounds = 4, onRound = () => {} } = {}) {
  let cur = cleanPlush(spec);
  const changes = [], log = [];
  onRound({ n: 0, checks: checksOf(cur), changes: [] });
  if (!judges.length) return { status: 'checks-only', spec: cur, changes, checks: checksOf(cur), rounds: log, bar, score: null, beyondDrawing: [], judges: [], note: 'The developer review needs Claude or ChatGPT connected: only the pattern\'s own checks ran.' };
  const pic = await sharp(photo).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  let best = null, flat = 0, status = 'needs-person';
  for (let n = 1; n <= rounds; n++) {
    const sheet = await sheetJpeg(cur), before = changes.map(c => `round ${c.round}: ${c.key} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)} (${c.why})`);
    const content = [
      { type: 'text', text: `The design picture of "${String(name).slice(0, 80)}":` }, imageBlock(pic),
      { type: 'text', text: 'The toy as drafted, its flats (front, back, side):' }, imageBlock(sheet),
      { type: 'text', text: `The toy's choices now: ${JSON.stringify(choices(cur))}.\nWhat each change means: ${Object.entries(FIELDS).map(([k, f]) => `${k}${f.kind === 'enum' ? ` (${f.of.join(', ')})` : f.hint ? ` (${f.hint})` : f.kind === 'bool' ? ' (true or false)' : ' (#rrggbb)'}`).join('; ')}.\nWhich body types take each part: ${Object.entries(PLUSH_PARTS).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}.${before.length ? `\nAlready changed: ${before.join('; ')}.` : ''}` }
    ];
    // each judge on its own, at the same time; one that cannot answer is left out of the round
    const got = await Promise.allSettled(judges.map(j => j.ask(REVIEW_SYSTEM, content, REVIEW_SCHEMA)));
    const ran = got.map((g, i) => g.status === 'fulfilled' && g.value ? judged(judges[i].name, g.value) : null).filter(Boolean), missed = judges.filter((_, i) => got[i].status !== 'fulfilled' || !got[i].value).map(j => j.name);
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
    changes.push(...made); cur = next;
  }
  // the toy the judges scored highest (by the strictest of them), with the changes that led to it
  const kept = changes.filter(c => c.round < best.n), names = judges.map(j => j.name);
  return { status, spec: best.spec, score: best.score, bar, changes: kept, checks: checksOf(best.spec), rounds: log, judges: names, beyondDrawing: [...new Set(log.flatMap(r => r.beyondDrawing))],
    note: status === 'passed' ? `The drawing reads as the toy in the picture (${best.score}/100${names.length > 1 ? `, the stricter of ${names.join(' and ')}` : ''}).` : `Below the bar of ${bar} (${best.score}/100${names.length > 1 ? `, the stricter of ${names.join(' and ')}` : ''}): needs a person.` };
}
