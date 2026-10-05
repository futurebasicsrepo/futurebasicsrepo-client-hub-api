// The design assistant answering the developer assistant. The developer assistant is the spec check (check.js): it draws the product from the pack
// and says where it differs from the photo. The design assistant, which drafted the pack, decides which of those findings are right and edits the
// pack to fix them, within strict limits:
//   - only descriptive fields change (BOM wording, colourway names and swatches, construction text, callout wording, a few style lines);
//     never a measurement, a tolerance, a size, care, compliance, artwork or a label;
//   - every change is checked against what the field holds right now, so something a person edited meanwhile is never overwritten;
//   - every change is recorded with its reason and can be undone while the field still holds the new value.
import Anthropic from '@anthropic-ai/sdk';
import { normalizeTechPack } from './techpack.js';
import { dataUrlToImageBlock } from './ai.js';
import { timed } from './telemetry.js';
import { CHECK_MODEL } from './check.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const SECTIONS = ['bom', 'colorways', 'construction', 'style', 'callouts'];
const FIELDS = {
  bom: { component: 160, material: 200, spec: 300, color: 120, placement: 160, notes: 400 },
  colorways: { name: 80, code: 40, swatch: 7, notes: 300 },
  construction: { area: 120, detail: 600 },
  style: { category: 200, fabricSummary: 200, fitBlock: 200, styleName: 200 },
  callouts: { label: 80, spec: 400, note: 600 }
};
export const MAX_CHANGES = 8;
const SECTION_LABEL = { bom: 'BOM', colorways: 'Colourway', construction: 'Construction', style: 'Style', callouts: 'Callout' };
const FIELD_LABEL = { component: 'component', material: 'material', spec: 'spec', color: 'colour', placement: 'placement', notes: 'notes', name: 'name', code: 'code', swatch: 'swatch', area: 'area', detail: 'detail',
  category: 'category', fabricSummary: 'fabric summary', fitBlock: 'fit', styleName: 'name', label: 'label', note: 'note' };

const getIn = (o, path) => path.reduce((a, k) => (a == null ? undefined : a[k]), o);
function setIn(o, path, value) { let a = o; for (let i = 0; i < path.length - 1; i++) a = a[path[i]]; a[path[path.length - 1]] = value; }

// A model-proposed edit → a validated change { id, path, label, from, to, reason }, or null when it is not allowed or does nothing.
export function toChange(p, pack) {
  if (!p || !SECTIONS.includes(p.section)) return null;
  const limits = FIELDS[p.section], field = String(p.field || ''), max = limits[field];
  if (!max) return null;
  const i = Number(p.index), sk = Number(p.sketch);
  let path, row, rowName;
  if (p.section === 'style') { path = ['style', field]; row = pack.style; rowName = 'Style'; }
  else if (p.section === 'callouts') {
    if (!Number.isInteger(sk) || !Number.isInteger(i) || !pack.sketches[sk]?.callouts?.[i]) return null;
    path = ['sketches', sk, 'callouts', i, field]; row = pack.sketches[sk].callouts[i]; rowName = row.label || `Callout ${row.n}`;
  } else {
    if (!Number.isInteger(i) || !Array.isArray(pack[p.section]) || !pack[p.section][i]) return null;
    path = [p.section, i, field]; row = pack[p.section][i];
    rowName = p.section === 'bom' ? row.component || row.material || `Row ${i + 1}` : p.section === 'colorways' ? row.name || `Colourway ${i + 1}` : row.area || `Row ${i + 1}`;
  }
  let to = clip(p.to, max);
  if (field === 'swatch') { if (!/^#[0-9a-f]{6}$/i.test(to)) return null; to = to.toLowerCase(); }
  const from = String(getIn(pack, path) ?? '');
  if (to === from || (!to && !from)) return null;
  return { id: path.join('.'), path, label: `${p.section === 'style' ? 'Style' : clip(rowName, 40)} · ${FIELD_LABEL[field] || field}`, section: SECTION_LABEL[p.section], from, to, reason: clip(p.reason, 240) };
}

// Validates a list of proposals against the pack as it is now: allowed fields only, no duplicates, at most MAX_CHANGES.
export function validateChanges(proposals, pack) {
  const seen = new Set(), out = [];
  for (const p of Array.isArray(proposals) ? proposals : []) { const c = toChange(p, pack); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } if (out.length >= MAX_CHANGES) break; }
  return out;
}

// Applies changes whose field still holds `from`. Returns the new pack plus which changes went in and which were skipped as out of date.
export function applyChanges(input, changes) {
  const pack = normalizeTechPack(input), applied = [], skipped = [];
  for (const c of changes) { if (String(getIn(pack, c.path) ?? '') === c.from) { setIn(pack, c.path, c.to); applied.push(c); } else skipped.push(c); }
  return { pack: normalizeTechPack(pack), applied, skipped };
}

// Undoes changes whose field still holds the new value.
export function revertChanges(input, changes) {
  const pack = normalizeTechPack(input), reverted = [], kept = [];
  for (const c of changes) { if (String(getIn(pack, c.path) ?? '') === c.to) { setIn(pack, c.path, c.from); reverted.push(c); } else kept.push(c); }
  return { pack: normalizeTechPack(pack), reverted, kept };
}

// ---- The design assistant's answer ----
export const RECONCILE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['decisions', 'patches'],
  properties: {
    decisions: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['finding', 'decision', 'say'],
      properties: { finding: { type: 'integer', description: 'Index of the developer assistant finding, from 0' }, decision: { type: 'string', enum: ['change', 'keep'] }, say: { type: 'string', description: 'One or two plain sentences to the developer assistant: what you will do and why, or why you are keeping it' } } } },
    patches: { type: 'array', maxItems: MAX_CHANGES, items: { type: 'object', additionalProperties: false, required: ['section', 'sketch', 'index', 'field', 'to', 'reason'],
      properties: { section: { type: 'string', enum: SECTIONS }, sketch: { type: 'integer', description: 'Sketch number for a callout, otherwise 0' }, index: { type: 'integer', description: 'Row number from 0 (ignored for style)' },
        field: { type: 'string' }, to: { type: 'string', description: 'The new value for that one field' }, reason: { type: 'string', description: 'Why, in one sentence' } } } }
  }
};

const SYSTEM = `You are the design assistant. You drafted this tech pack from the client's photo. The developer assistant, an independent reviewer, built the product from the pack alone and compared it with the photo. It sent you its findings.
Decide which findings are right. Change a field only when the photo supports the change; otherwise keep it and say why. You can edit descriptive fields only: BOM component, material, spec, colour, placement and notes; colourway names, codes, swatches and notes; construction area and detail; callout label, spec and note; and style category, fabric summary, fit and name.
Never change measurements, tolerances, sizes, care, compliance, artwork or labels: if a finding is about those, keep it and say a person should check it.
Each patch changes one field of one row and gives the full new value. Prefer the smallest edit that fixes the finding. Speak plainly and briefly, as a colleague.`;

function packForDesigner(p) {
  return { style: p.style, bom: p.bom.map((r, i) => ({ index: i, ...r })), colorways: p.colorways.map((r, i) => ({ index: i, ...r })), construction: p.construction.map((r, i) => ({ index: i, ...r })),
    callouts: p.sketches.flatMap((s, si) => s.callouts.map((c, ci) => ({ sketch: si, index: ci, label: c.label, spec: c.spec, note: c.note }))) };
}

function fixtureAnswer(pack, findings) {
  const marked = pack.bom.findIndex(r => /\[needs-fix\]/i.test(`${r.notes} ${r.spec}`));
  if (marked < 0) return { decisions: findings.map((f, i) => ({ finding: i, decision: 'keep', say: 'Test fixture: nothing to change.' })), patches: [] };
  const row = pack.bom[marked], field = /\[needs-fix\]/i.test(row.notes) ? 'notes' : 'spec', worse = /\[make-worse\]/i.test(JSON.stringify(pack.style)); // test hook: [make-worse] in the style makes the fix backfire
  const to = clip(String(row[field]).replace(/\[needs-fix\]/ig, '') + (worse ? ' [worse]' : ' Reconciled with the photo.'), FIELDS.bom[field]);
  return { decisions: findings.map((f, i) => ({ finding: i, decision: 'change', say: `Test fixture: you are right, I will reword ${row.component || 'that row'}.` })), patches: [{ section: 'bom', sketch: 0, index: marked, field, to, reason: 'Test fixture: reconciled with the photo.' }] };
}

// → { decisions: [{ finding, decision, say }], changes: [validated change], model }
export async function reconcile({ pack: input, photos = [], verdict, promptText = '', model = CHECK_MODEL() }) {
  const pack = normalizeTechPack(input), findings = (verdict?.discrepancies || []).map((d, i) => ({ finding: i, severity: d.severity, field: d.field, title: d.title, detail: d.detail, suggestion: d.suggestion }));
  if (!findings.length) return { decisions: [], changes: [], model: null };
  let raw, used = 'fixture';
  if (process.env.AI_FIXTURE) raw = fixtureAnswer(pack, findings);
  else {
    const content = [{ type: 'text', text: "The client's reference photo:" }];
    for (const url of photos.slice(0, 2)) { const b = dataUrlToImageBlock(url); if (b) content.push(b); }
    content.push({ type: 'text', text: `The client's prompt:\n${clip(promptText, 1200) || '(none)'}\n\nThe developer assistant's findings (score ${verdict.score}/100): ${clip(verdict.summary, 400)}\n${JSON.stringify(findings)}\n\nThe pack as it is now:\n${JSON.stringify(packForDesigner(pack)).slice(0, 14000)}` });
    const client = new Anthropic(), base = { model, max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content }] };
    let response;
    const call = () => timed('anthropic', async () => {
      try { return await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: RECONCILE_SCHEMA } } }); }
      catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; return client.messages.create({ ...base, system: SYSTEM + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(RECONCILE_SCHEMA) }); }
    });
    response = await call();
    if (response.stop_reason === 'refusal') throw new Error(`Model declined (${response.stop_details?.category || 'policy'})`);
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); used = response.model || model;
  }
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : []).slice(0, 8).filter(d => Number.isInteger(d?.finding) && d.finding >= 0 && d.finding < findings.length)
    .map(d => ({ finding: d.finding, decision: d.decision === 'change' ? 'change' : 'keep', say: clip(d.say, 300) }));
  return { decisions, changes: validateChanges(raw.patches, pack), model: used };
}
