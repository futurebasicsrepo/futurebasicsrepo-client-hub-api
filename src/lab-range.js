// Changes across a whole collection: "make every tee 260 gsm and swap the accent to olive". One instruction in plain words is turned into a
// change per concept, shown first (what changes, from what, to what, and why; which pieces are left alone and why), and applied only to the
// pieces the team ticks. Each applied change goes through the same door as an edit by hand (src/lab-concept-routes.js): the words are checked
// again against what inspired them, an approved piece goes back to draft, and a note is left on the concept. Pictures are not redrawn here:
// the page offers that afterwards, one piece at a time, because every redraw costs an image call.
import { ask as realAsk, providerReady, costCents } from './intel-llm.js';
import { brandCodeWords, DEFAULT_BRAND_CODE, categoryLabel } from './lab.js';
import { tasteWords } from './lab-taste.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const RANGE_FIELDS = { fabric: 160, silhouette: 120, fit: 80, trims: 200, description: 600, twist: 400, colors: 4, details: 6 };
const LIST = { colors: 40, details: 120 };
// a concept as the assistant and the preview see it
export const rangeView = c => ({ id: c.id, name: c.name, category: c.category, categoryLabel: categoryLabel(c.category), status: c.status, fabric: c.spec?.fabric || '', silhouette: c.spec?.silhouette || '', fit: c.spec?.fit || '', trims: c.spec?.trims || '', description: c.spec?.description || '', twist: c.twist || '', colors: Array.isArray(c.spec?.colors) ? c.spec.colors : [], details: Array.isArray(c.spec?.details) ? c.spec.details : [] });
// only the fields a range edit may touch, cleaned the way the concept editor cleans them
export function cleanFields(f) {
  const out = {}; if (!f || typeof f !== 'object') return out;
  for (const [k, max] of Object.entries(RANGE_FIELDS)) {
    if (f[k] === undefined) continue;
    if (LIST[k]) { const v = Array.isArray(f[k]) ? f[k] : String(f[k]).split(k === 'details' ? /\r?\n|;/ : /,|;/); out[k] = v.map(x => clip(x, LIST[k])).filter(Boolean).slice(0, max); }
    else out[k] = clip(f[k], max);
  }
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// drop a change that changes nothing
export function diffFields(before, fields) { const out = {}; for (const [k, v] of Object.entries(fields)) if (!same(v, before[k])) out[k] = v; return out; }
// the list the page sends back to apply: known concepts, allowed fields, real changes
export function cleanRangeChanges(input, concepts) {
  const by = new Map(concepts.map(c => [c.id, c])), out = [], seen = new Set();
  for (const ch of Array.isArray(input) ? input : []) {
    const c = by.get(String(ch?.id || '')); if (!c || seen.has(c.id)) continue; seen.add(c.id);
    const fields = diffFields(rangeView(c), cleanFields(ch.fields)); if (!Object.keys(fields).length) continue;
    out.push({ id: c.id, fields, why: clip(ch.why, 200) });
  }
  return out.slice(0, 150);
}
// the journeys: a plain reading of the instruction. "every tee" / "all tees" / "each cap" limits the scope to pieces whose name or category says so;
// "N gsm" sets the fabric weight; "accent to X" / "swap X for Y" changes the colours; anything else goes into the details as written.
export function rangeFixture({ user }) {
  const instruction = /Instruction: (.*)/.exec(user)?.[1] || '', list = JSON.parse(/Pieces:\n(\[.*?\])\n/.exec(user)?.[1] || '[]');
  const scope = /\b(?:every|all|each)\s+([a-z-]+?)s?\b(?:\s|,|$)/i.exec(instruction)?.[1]?.toLowerCase() || '', gsm = /(\d{2,3})\s*gsm/i.exec(instruction)?.[1];
  const accent = /accent (?:to|→|->) ([a-z]+)/i.exec(instruction)?.[1], swap = /swap ([a-z]+) (?:for|with|to) ([a-z]+)/i.exec(instruction);
  const changes = [], skipped = [], generic = ['piece', 'concept', 'thing', 'item', 'style'].includes(scope);
  for (const c of list) {
    const hay = `${c.name} ${c.categoryLabel} ${c.category}`.toLowerCase();
    if (scope && !generic && !hay.includes(scope) && !(scope === 'tee' && /t-shirt|tops/.test(hay))) { skipped.push({ id: c.id, why: `Not a ${scope}` }); continue; }
    const f = {};
    if (gsm) f.fabric = /\d{2,3}\s*gsm/i.test(c.fabric) ? c.fabric.replace(/\d{2,3}\s*gsm/i, `${gsm} gsm`) : `${gsm} gsm ${c.fabric || 'cotton jersey'}`.trim();
    if (accent) { const cols = c.colors.length ? [...c.colors] : ['navy']; cols[cols.length - 1] = accent.toLowerCase(); f.colors = cols; }
    if (swap) f.colors = (c.colors.length ? c.colors : [swap[1]]).map(x => x.toLowerCase() === swap[1].toLowerCase() ? swap[2].toLowerCase() : x);
    if (!gsm && !accent && !swap) f.details = [...c.details.slice(0, 5), clip(instruction, 120)];
    changes.push({ id: c.id, fields: f, why: `Test fixture: ${gsm ? `fabric set to ${gsm} gsm` : ''}${gsm && (accent || swap) ? ', ' : ''}${accent ? `accent swapped to ${accent}` : swap ? `${swap[1]} swapped for ${swap[2]}` : ''}${!gsm && !accent && !swap ? 'added to the details' : ''}` });
  }
  return { changes, skipped };
}
// → { changes: [{ id, name, fields, before, why }], skipped: [{ id, name, why }], costCents }
export async function planRangeEdit({ instruction, concepts, code = DEFAULT_BRAND_CODE, taste = null, plan = null, askImpl = realAsk, env = process.env, fetchImpl = fetch } = {}) {
  if (!providerReady('anthropic', env)) throw Object.assign(new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)'), { status: 503 });
  const views = concepts.map(rangeView); if (!views.length) return { changes: [], skipped: [], costCents: 0 };
  const tw = tasteWords(taste);
  const system = `You are the lead designer at Future Basics, making one change across a whole collection. You are given an instruction in plain words and the pieces in the range. Decide, piece by piece, what the instruction means for it: change only what the instruction asks, in the fields it touches, and leave every other field alone. A piece the instruction does not apply to (a cap when the instruction says "every tee") is skipped, with the reason. Keep the wording as plain and short as the original. Never name another brand.\n${brandCodeWords(code)}${tw ? '\n' + tw : ''}`;
  const user = `Instruction: ${clip(instruction, 400)}\n${plan?.name ? `Range: ${clip(plan.name, 80)}${plan.season ? ' · ' + clip(plan.season, 40) : ''}\n` : ''}Pieces:\n${JSON.stringify(views.map(v => ({ id: v.id, name: v.name, category: v.category, categoryLabel: v.categoryLabel, fabric: v.fabric, silhouette: v.silhouette, fit: v.fit, trims: v.trims, colors: v.colors, details: v.details, twist: v.twist, description: v.description })))}\n\nAnswer {"changes":[{"id":"piece id","fields":{"fabric":"only the fields that change","colors":["full new list"],"details":["full new list"]},"why":"one short line"}],"skipped":[{"id":"piece id","why":"one short line"}]}. Fields: fabric, silhouette, fit, trims, colors, details, twist, description. Send a list field whole (the new list), a text field as its new text.`;
  let res; try { res = await askImpl({ provider: 'anthropic', system, user, json: true, maxTokens: 6000, env, fetchImpl, fixture: rangeFixture }); }
  catch (e) { if (!/JSON|ran out of room/i.test(e.message)) throw e; res = await askImpl({ provider: 'anthropic', system, user: user + '\nKeep every "why" to a few words. Answer with valid JSON only.', json: true, maxTokens: 6000, env, fetchImpl, fixture: rangeFixture }); }
  const j = res.json || {}, by = new Map(views.map(v => [v.id, v])), changes = [], skipped = [], seen = new Set();
  for (const ch of Array.isArray(j.changes) ? j.changes : []) {
    const v = by.get(String(ch?.id || '')); if (!v || seen.has(v.id)) continue; seen.add(v.id);
    const fields = diffFields(v, cleanFields(ch.fields));
    if (Object.keys(fields).length) changes.push({ id: v.id, name: v.name, status: v.status, fields, before: Object.fromEntries(Object.keys(fields).map(k => [k, v[k]])), why: clip(ch.why, 200) });
    else skipped.push({ id: v.id, name: v.name, why: 'Nothing would change' });
  }
  for (const sk of Array.isArray(j.skipped) ? j.skipped : []) { const v = by.get(String(sk?.id || '')); if (v && !seen.has(v.id)) { seen.add(v.id); skipped.push({ id: v.id, name: v.name, why: clip(sk.why, 200) || 'Left alone' }); } }
  for (const v of views) if (!seen.has(v.id)) skipped.push({ id: v.id, name: v.name, why: 'Left alone' });
  return { changes, skipped, costCents: costCents('anthropic', res.usage?.input || 0, res.usage?.output || 0, env) };
}
