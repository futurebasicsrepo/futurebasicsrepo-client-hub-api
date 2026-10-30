// A second pair of eyes on an engineered product, as the shoe and plush checks are (src/lab-shoe-review.js): the assembly is looked at by
// product engineers (vision models: Claude, and an OpenAI model when both are connected, each on its own) against the concept's picture, or
// its words when there is none, and against what a product of its kind needs, round after round until it clears the bar or a person is needed.
//   reviewAssembly({ spec, photo, concept, judges }) → the exchange. Each round the judges see the product assembled and pulled apart (its real
//     parts, src/lab-parts-mesh.js), its parts list with materials and processes, and the engine's own read (fit, moulding, power, heat,
//     radio, certifications, cost). They score six points out of 100; the stricter score stands, less what the fixed checks still find wrong.
//     They ask for changes as bounded edits to the assembly (a part's size, place, material, process, wall, draft...; add a part; remove one).
//     A change both ask for, or one asks for and the other does not dispute, is made, unless it adds a problem to the engine's checks; then
//     the round runs again. It stops at the bar, when nothing is left to change, or when two rounds in a row gain nothing. What the assembly
//     cannot show (a living hinge, a gasket groove, a heat-staked boss) is kept for a person. The best assembly seen is the result; nothing is
//     saved here.
// Without a judge only the fixed checks run, and the result says so.
import sharp from 'sharp';
import { cleanAssembly, cleanPart, engineer, RESINS, PROCESSES, FINISHES, FIXES, SHAPES, ELEC } from './lab-assembly.js';
import { isoPicture } from './lab-parts-mesh.js';

export const BAR = 90;
export const CRITERIA = [
  { key: 'likeness', weight: 20, label: 'Reads as the concept', ask: 'its form, proportions, size and the features that show, against the picture (or the words)' },
  { key: 'complete', weight: 20, label: 'Nothing missing', ask: 'every part a real product of this kind needs: what it does, how it is held together, sealed, powered, controlled and connected' },
  { key: 'moulding', weight: 20, label: 'Made the way it should be', ask: 'materials, processes, wall, draft, where the parts split, the number of tools, for the volume' },
  { key: 'assembly', weight: 15, label: 'Goes together', ask: 'the order of assembly, how each part is fixed, access for service, cable routing, tolerances between parts' },
  { key: 'function', weight: 15, label: 'Works and is safe', ask: 'power, heat, radio, ports, sound or light paths, mechanisms; and the certifications it is planned for' },
  { key: 'cost', weight: 10, label: 'Cost holds up', ask: 'the unit cost and tooling against what this kind of product sells and is made for' }
];
// the fields of a part a reviewer may change, each cleaned again by cleanPart
const FIELDS = ['name', 'size', 'at', 'wall', 'r', 'resin', 'process', 'finish', 'draft', 'undercuts', 'colour', 'qty', 'fix', 'fixQty', 'open', 'axis', 'parent'];
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['criteria', 'fixes', 'beyondModel', 'summary'],
  properties: {
    criteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'score', 'note'], properties: { key: { type: 'string', enum: CRITERIA.map(c => c.key) }, score: { type: 'integer', description: '0 to 100' }, note: { type: 'string', description: 'what holds it back, in one sentence' } } } },
    fixes: { type: 'array', description: 'edits to the assembly that raise the scores, most important first; empty when none would help', items: { type: 'object', additionalProperties: false, required: ['op', 'part', 'field', 'value', 'why'], properties: {
      op: { type: 'string', enum: ['set', 'add', 'remove'] },
      part: { type: 'string', description: 'set/remove: the part\'s id; add: a new short id (lowercase letters, digits, dashes)' },
      field: { type: 'string', enum: [...FIELDS, '-'], description: 'set: the field to change; add/remove: "-"' },
      value: { type: 'string', description: 'set: the new value as JSON (a number, a string, or [x, y, z] in mm for size and at); add: the whole new part as JSON with name, shape, size, at, and resin and process (or "elec": {"kind": ...} for an electronic part), parent, dir and lvl; remove: ""' },
      why: { type: 'string' } } } },
    beyondModel: { type: 'array', items: { type: 'string' }, description: 'what the product needs that these parts cannot show (a living hinge, a gasket groove, a heat-staked boss, a light pipe\'s shape...), for a person' },
    summary: { type: 'string', description: 'one or two sentences' }
  }
};
export const REVIEW_SYSTEM = `You are a senior product design engineer checking a product's engineering before tooling is ordered. You get the concept (its picture when there is one, and its words), the product drawn from its engineering assembled and pulled apart, its parts list, and the engine's own read of it (fit, moulding, power, heat, radio, certifications, cost).
Score each point out of 100: ${CRITERIA.map(c => `${c.key} (${c.ask})`).join('; ')}.
Be strict: 90 means you would send this to a toolmaker and a test lab as it is. Sizes are in millimetres, z is up.
Then ask for the edits that would raise the scores most, as operations on the parts: set one field of a part, add a part, or remove one. Keep each edit to what the picture, the words or sound practice clearly call for; never undo an edit you were told was made for a reason. Parts must stay inside their parent with room to spare and must not take the same space as another solid part. What these parts cannot express goes in beyondModel for a person, not in fixes.`;

const num = v => Number(String(v).replace(/[^0-9.eE+\-]/g, ''));
const parseValue = raw => { const t = String(raw ?? '').trim(); try { return JSON.parse(t); } catch { return t; } };
const bads = E => E.checks.filter(c => c.level === 'bad');
// the fixed checks: what the engine still finds wrong costs points whatever a reviewer says
export const penaltyOf = E => Math.min(30, bads(E).length * 10);
export const scoreOf = (criteria, E) => { const by = Object.fromEntries((criteria || []).map(c => [c.key, Math.max(0, Math.min(100, Number(c.score) || 0))])); return Math.max(0, Math.round(CRITERIA.reduce((s, c) => s + (by[c.key] ?? 0) * c.weight, 0) / 100) - penaltyOf(E)); };

// one edit, made on the assembly and cleaned; null when it is not one it may make, changes nothing, or adds a problem the engine catches
export function applyFix(spec, fix) {
  const s = cleanAssembly(spec), op = fix?.op, id = String(fix?.part || '').trim(), before = new Set(bads(engineer(s)).map(c => c.text));
  let parts, change;
  if (op === 'remove') { const p = s.parts.find(q => q.id === id); if (!p || s.parts.length < 2) return null; parts = s.parts.filter(q => q.id !== id).map(q => (q.parent === id ? { ...q, parent: p.parent || null } : q)); change = { op, part: id, name: p.name, from: p.name, to: null }; }
  else if (op === 'add') {
    const v = parseValue(fix.value); if (!v || typeof v !== 'object' || !/^[a-z0-9-]{1,32}$/.test(id) || s.parts.some(q => q.id === id)) return null;
    if (v.elec && !ELEC[v.elec.kind]) return null; if (!v.elec && v.shape && !SHAPES[v.shape]) return null;
    const p = cleanPart({ ...v, id, ...(v.elec ? { resin: 'bought in', process: 'bought in', cost: v.cost ?? ELEC[v.elec.kind].cost } : {}) }, s.parts.length);
    parts = [...s.parts, p]; change = { op, part: id, name: p.name, from: null, to: p.name };
  } else if (op === 'set') {
    const p = s.parts.find(q => q.id === id), f = fix.field; if (!p || !FIELDS.includes(f)) return null;
    let v = parseValue(fix.value);
    if (f === 'size' || f === 'at') { if (!Array.isArray(v) || v.length !== 3 || v.some(x => !Number.isFinite(Number(x)))) return null; v = v.map(Number); }
    else if (['wall', 'r', 'draft', 'undercuts', 'qty', 'fixQty'].includes(f)) { v = num(v); if (!Number.isFinite(v)) return null; }
    else if (f === 'resin' && !RESINS[v]) return null; else if (f === 'process' && !PROCESSES[v]) return null; else if (f === 'finish' && !FINISHES.includes(v)) return null;
    else if (f === 'fix' && !FIXES[v]) return null; else if (f === 'parent' && v !== null && !s.parts.some(q => q.id === v && q.id !== id)) return null;
    const q = cleanPart({ ...p, [f]: v }, s.parts.indexOf(p));
    if (JSON.stringify(q[f]) === JSON.stringify(p[f])) return null;
    parts = s.parts.map(x => (x.id === id ? q : x)); change = { op, part: id, name: p.name, field: f, from: p[f] ?? null, to: q[f] };
  } else return null;
  const next = cleanAssembly({ ...s, parts }), added = bads(engineer(next)).filter(c => !before.has(c.text));
  if (added.length) return { rejected: true, change: { ...change, why: String(fix.why || '').slice(0, 300) }, reason: added[0].text };
  return { spec: next, change: { ...change, why: String(fix.why || '').slice(0, 300) } };
}

// two judges: the same edit asked for by both is made (sizes and numbers that agree are met in the middle); one asked for by only one is made
// unless the other asks for something else for the same part and field, which is a disagreement left for a person
const keyOf = f => (f.op === 'set' ? `set:${f.part}:${f.field}` : `${f.op}:${f.op === 'add' ? String(parseValue(f.value)?.name || f.part).toLowerCase() : f.part}`);
const close = (a, b) => { const x = parseValue(a), y = parseValue(b); if (Array.isArray(x) && Array.isArray(y) && x.length === y.length) return x.every((v, i) => Math.abs(Number(v) - Number(y[i])) <= Math.max(1, Math.abs(Number(v)) * .15)); const p = num(a), q = num(b); if (Number.isFinite(p) && Number.isFinite(q) && String(a).trim() !== '' && !/[a-z]/i.test(String(a).replace(/e/gi, ''))) return Math.abs(p - q) <= Math.max(.25, Math.max(Math.abs(p), Math.abs(q)) * .15); return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };
const middle = vals => { const xs = vals.map(parseValue); if (xs.every(Array.isArray)) return JSON.stringify(xs[0].map((_, i) => Math.round(xs.reduce((s, x) => s + Number(x[i]), 0) / xs.length * 10) / 10)); const ns = vals.map(num); return ns.every(Number.isFinite) ? String(Math.round(ns.reduce((s, x) => s + x, 0) / ns.length * 100) / 100) : vals[0]; };
export function mergeFixes(list) {
  const by = new Map(), out = [], conflicts = [];
  for (const { name, fixes } of list) for (const f of (fixes || []).slice(0, 8)) { if (!['set', 'add', 'remove'].includes(f?.op)) continue; const k = keyOf(f); if (!by.get(k)?.some(x => x.name === name)) by.set(k, [...(by.get(k) || []), { name, ...f }]); }
  for (const [k, asks] of by) {
    if (asks.length === 1) { out.push({ ...asks[0], from: [asks[0].name] }); continue; }
    if (asks[0].op !== 'set' || asks.every(a => close(a.value, asks[0].value))) out.push({ ...asks[0], value: asks[0].op === 'set' ? middle(asks.map(a => a.value)) : asks[0].value, why: asks.map(a => a.why).filter(Boolean).join(' / '), from: asks.map(a => a.name) });
    else conflicts.push({ key: k, asks: asks.map(a => ({ name: a.name, value: String(a.value).slice(0, 120), why: String(a.why || '').slice(0, 200) })) });
  }
  return { fixes: out, conflicts };
}

// what the judges are given: the product assembled and pulled apart, as one picture, and the engineering as words
export async function viewsJpeg(spec) {
  const [shut, open] = await Promise.all([isoPicture(spec, { t: 0, fit: [520, 520] }), isoPicture(spec, { t: 1, fit: [520, 520] })]);
  const img = p => sharp(Buffer.from(p.href.split(',')[1], 'base64')).flatten({ background: '#ffffff' }).resize({ width: 760, height: 760, fit: 'contain', background: '#ffffff' }).toBuffer();
  const [a, b] = await Promise.all([img(shut), img(open)]);
  return sharp({ create: { width: 1560, height: 780, channels: 3, background: '#ffffff' } }).composite([{ input: a, left: 10, top: 10 }, { input: b, left: 790, top: 10 }]).jpeg({ quality: 84 }).toBuffer();
}
export function engineeringText(E) {
  const s = E.spec, byId = Object.fromEntries(s.parts.map(p => [p.id, p]));
  const parts = s.parts.map(p => `- ${p.id}: ${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}; ${p.elec ? `electronic (${p.elec.kind})` : `${p.shape}${p.wall && ['shell', 'cup', 'ring'].includes(p.shape) ? `, ${p.wall} mm wall, open ${p.shape === 'ring' ? 'both ends' : p.open}` : ''}`}; size ${p.size.join(' × ')} at ${p.at.join(', ')}${p.axis && p.axis !== 'z' ? ` along ${p.axis}` : ''}; ${p.resin} · ${p.process}${p.finish && p.finish !== 'none' ? ` · ${p.finish}` : ''}${p.draft ? `, draft ${p.draft}°` : ''}${p.undercuts ? `, ${p.undercuts} undercut(s)` : ''}; ${FIXES[p.fix]?.verb || p.fix}${p.parent && byId[p.parent] ? ` into ${p.parent}` : ''}`);
  const checks = E.checks.filter(c => c.level !== 'ok').map(c => `- ${c.level}: ${c.text}`);
  const pw = E.power ? `Power: ${E.power.avgW} W average, ${E.power.peakW} W peak${E.power.runtime ? `, ${E.power.runtime} h a charge` : ''}${E.power.mains ? ', mains' : ''}.` : '';
  return [`Kind: ${s.kind}; ${E.extent.join(' × ')} mm; ${E.mass} g; unit cost $${E.unit} at ${s.volume} a year; tooling $${E.toolCost} (${E.tools.length} tools, T1 in ${E.weeks} weeks).`, pw,
    E.harness?.length ? `Cables: ${E.harness.map(c => `${c.n} ${c.label} (${c.type})`).join('; ')}.` : '', E.certs?.length ? `Certifications planned: ${E.certs.map(c => c.name).join('; ')}.` : '',
    'Parts (id: name; shape; size and centre in mm; material · process; how it is fixed):', ...parts, checks.length ? 'The engine\'s checks that are not clear:' : 'The engine\'s checks are all clear.', ...checks].filter(Boolean).join('\n');
}
const imageBlock = (buf, type = 'image/jpeg') => ({ type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } });
const judged = (name, res, E) => ({ name, score: scoreOf(res?.criteria, E), summary: String(res?.summary || '').slice(0, 400),
  criteria: CRITERIA.map(c => { const x = (res?.criteria || []).find(y => y.key === c.key) || {}; return { key: c.key, label: c.label, score: Math.max(0, Math.min(100, Number(x.score) || 0)), note: String(x.note || '').slice(0, 300) }; }),
  beyondModel: (res?.beyondModel || []).map(v => String(v).slice(0, 200)).slice(0, 8), fixes: res?.fixes || [] });
const fixedOf = E => E.checks.filter(c => c.level === 'bad' || c.level === 'warn').map(c => ({ level: c.level, text: c.text }));

// judges: [{name, ask}] (ask as callJsonSchema: system, content blocks, schema). The strictest score stands.
export async function reviewAssembly({ spec, photo = null, concept = {}, judges = [], bar = BAR, rounds = 4, onRound = () => {}, views = viewsJpeg } = {}) {
  let cur = cleanAssembly(spec), E = engineer(cur);
  const changes = [], rejected = [], log = [];
  onRound({ n: 0, checks: fixedOf(E) });
  if (!judges.length) return { status: 'checks-only', spec: cur, score: null, bar, changes, rejected, checks: fixedOf(E), rounds: log, judges: [], beyondModel: [], note: bads(E).length ? `The engineering review needs Claude: only the engine's checks ran, and ${bads(E).length} need fixing.` : 'The engineering review needs Claude: only the engine\'s checks ran, and they are clear.' };
  const pic = photo ? await sharp(photo).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer() : null;
  const words = [concept.name && `"${String(concept.name).slice(0, 80)}"`, concept.category && `category ${concept.category}`, concept.description && String(concept.description).slice(0, 600), concept.twist && `what is ours: ${String(concept.twist).slice(0, 300)}`].filter(Boolean).join('; ');
  let best = null, flat = 0, status = 'needs-person';
  for (let n = 1; n <= rounds; n++) {
    const sheet = await views(cur), made = [], done = changes.map(c => `round ${c.round}: ${c.op} ${c.part}${c.field ? `.${c.field}` : ''} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)} (${c.why})`);
    const content = [{ type: 'text', text: `The concept: ${words || 'no words given'}.` }, ...(pic ? [{ type: 'text', text: 'Its picture:' }, imageBlock(pic)] : [{ type: 'text', text: 'There is no picture: judge likeness against the words.' }]),
      { type: 'text', text: 'The product from its engineering, assembled (left) and pulled apart (right):' }, imageBlock(sheet),
      { type: 'text', text: `${engineeringText(E)}\n\nMaterials: ${Object.keys(RESINS).join(', ')}. Processes: ${Object.keys(PROCESSES).join(', ')}. Finishes: ${FINISHES.join(', ')}. Shapes: ${Object.keys(SHAPES).join(', ')}. Electronic kinds: ${Object.keys(ELEC).join(', ')}.${done.length ? `\nAlready changed (do not undo): ${done.join('; ')}` : ''}${rejected.length ? `\nTried and refused because the engine found a new problem: ${rejected.map(r => `${r.op} ${r.part}${r.field ? `.${r.field}` : ''} (${r.reason})`).join('; ')}` : ''}` }];
    const got = await Promise.allSettled(judges.map(j => j.ask(REVIEW_SYSTEM, content, REVIEW_SCHEMA)));
    const ran = got.map((g, i) => (g.status === 'fulfilled' && g.value ? judged(judges[i].name, g.value, E) : null)).filter(Boolean), missed = judges.filter((_, i) => got[i].status !== 'fulfilled' || !got[i].value).map(j => j.name);
    if (!ran.length) throw new Error('No reviewer could answer');
    const score = Math.min(...ran.map(r => r.score)), { fixes, conflicts } = mergeFixes(ran);
    const round = { n, score, judges: ran.map(({ fixes: _, ...r }) => r), missed, disagree: ran.length > 1 && Math.max(...ran.map(r => r.score)) - score >= 15, conflicts, checks: fixedOf(E),
      criteria: CRITERIA.map(c => { const xs = ran.map(r => r.criteria.find(y => y.key === c.key)), lo = xs.reduce((a, b) => (b.score < a.score ? b : a)); return { key: c.key, label: c.label, score: lo.score, note: xs.map((x, i) => (x.note && ran.length > 1 ? `${ran[i].name}: ${x.note}` : x.note)).filter(Boolean).join(' · ') }; }),
      summary: ran.map(r => (ran.length > 1 ? `${r.name}: ${r.summary}` : r.summary)).filter(Boolean).join(' ').slice(0, 700), beyondModel: [...new Set(ran.flatMap(r => r.beyondModel))].slice(0, 10), changes: made, refused: [] };
    if (!best || score > best.score) { best = { score, spec: cur, n }; flat = 0; } else flat++;
    log.push(round);
    if (score >= bar) { status = 'passed'; onRound(round); break; }
    if (flat >= 2 || n === rounds) { onRound(round); break; }
    let next = cur;
    for (const f of fixes) { const a = applyFix(next, f); if (!a) continue; if (a.rejected) { const r = { ...a.change, round: n, reason: a.reason }; rejected.push(r); round.refused.push(r); continue; } next = a.spec; made.push({ ...a.change, round: n, judges: f.from }); }
    onRound(round);
    if (!made.length) break;
    changes.push(...made); cur = next; E = engineer(cur);
  }
  const kept = changes.filter(c => c.round < best.n), names = judges.map(j => j.name), bE = engineer(best.spec);
  return { status, spec: best.spec, score: best.score, bar, changes: kept, rejected, checks: fixedOf(bE), rounds: log, judges: names, beyondModel: [...new Set(log.flatMap(r => r.beyondModel))],
    note: status === 'passed' ? `Ready for a toolmaker (${best.score}/100${names.length > 1 ? `, the stricter of ${names.join(' and ')}` : ''}).` : `Below the bar of ${bar} (${best.score}/100${names.length > 1 ? `, the stricter of ${names.join(' and ')}` : ''}): needs an engineer.` };
}
