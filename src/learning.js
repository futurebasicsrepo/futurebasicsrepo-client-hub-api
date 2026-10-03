// What people change after the assistant drafts a tech pack.
// The assistant's output is kept as a snapshot on the pack (images stripped). At each milestone — submitted, published,
// approved, countersigned — the snapshot is diffed against what the people kept, and the per-section result is stored.
// Across packs that gives the edit rate per section and the measurements, callouts and materials corrected most often:
// the signal the prompt, the exemplars and the house rules are tuned from.
import { normalizeTechPack } from './techpack.js';

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const MAX_CHANGES = 80;

// The snapshot drops every image so it stays small; the diff never compares pixels.
export function draftSnapshot(pack) {
  const p = normalizeTechPack(pack);
  p.sketches = p.sketches.map(s => ({ ...s, image: '', hasImage: Boolean(s.image), callouts: s.callouts.map(c => ({ ...c, photo: '', hasPhoto: Boolean(c.photo) })) }));
  p.renderings = []; p.artwork = p.artwork.map(a => ({ ...a, image: '' }));
  return p;
}

function listDiff(section, draftRows, currentRows, keyOf, fieldsOf, changes, knownRows = draftRows) {
  const d = new Map(), c = new Map(), known = new Set(knownRows.map(keyOf).filter(Boolean));
  for (const r of draftRows) { const k = keyOf(r); if (k && !d.has(k)) d.set(k, r); }
  for (const r of currentRows) { const k = keyOf(r); if (k && !c.has(k)) c.set(k, r); }
  const out = { kept: 0, edited: 0, removed: 0, added: 0, total: d.size, editedKeys: [], removedKeys: [], addedKeys: [] };
  for (const [k, dr] of d) {
    const cr = c.get(k);
    if (!cr) { out.removed++; out.removedKeys.push(k); if (changes.length < MAX_CHANGES) changes.push({ section, key: k, change: 'removed' }); continue; }
    const diffs = fieldsOf(dr, cr).filter(([, a, b]) => norm(a) !== norm(b));
    if (!diffs.length) { out.kept++; continue; }
    out.edited++; out.editedKeys.push(k);
    for (const [field, a, b] of diffs) if (changes.length < MAX_CHANGES) changes.push({ section, key: k, field, from: String(a ?? '').slice(0, 120), to: String(b ?? '').slice(0, 120), change: 'edited' });
  }
  for (const k of c.keys()) if (!d.has(k) && !known.has(k)) { out.added++; out.addedKeys.push(k); if (changes.length < MAX_CHANGES) changes.push({ section, key: k, change: 'added' }); }
  return out;
}

// Diff the assistant's snapshot against the pack as people left it. Measurements compare the sample size when given,
// every size otherwise; a callout counts as moved when its pin travelled more than 3% of the photo.
export function draftDiff(snapshot, current, { sampleSize } = {}) {
  const a = normalizeTechPack(snapshot), b = normalizeTechPack(current), changes = [];
  const sections = {};
  // style
  const styleKeys = Object.keys(a.style).filter(k => a.style[k]);
  const styleChanged = styleKeys.filter(k => norm(a.style[k]) !== norm(b.style[k]));
  for (const k of styleChanged) if (changes.length < MAX_CHANGES) changes.push({ section: 'style', key: k, from: String(a.style[k]).slice(0, 120), to: String(b.style[k] || '').slice(0, 120), change: 'edited' });
  sections.style = { kept: styleKeys.length - styleChanged.length, changed: styleChanged.length, total: styleKeys.length };
  // callouts on the first view
  const ac = a.sketches[0]?.callouts || [], bc = b.sketches[0]?.callouts || [];
  sections.callouts = listDiff('callouts', ac, bc, r => norm(r.label), (x, y) => [['spec', x.spec, y.spec], ['note', x.note, y.note]], changes);
  let moved = 0; const bByLabel = new Map(bc.map(r => [norm(r.label), r]));
  for (const r of ac) { const o = bByLabel.get(norm(r.label)); if (o && r.x != null && o.x != null && Math.hypot(r.x - o.x, r.y - o.y) > 0.03) moved++; }
  sections.callouts.moved = moved;
  // measurements
  const sizes = sampleSize && a.sizes.includes(sampleSize) ? [sampleSize] : a.sizes;
  const filled = r => sizes.some(s => r.values[s]);
  sections.pom = listDiff('pom', a.pom.filter(filled), b.pom, r => norm(r.code), (x, y) => [...sizes.map(s => [`values.${s}`, x.values[s], y.values[s]]), ['tolerance', x.tolerance, y.tolerance], ['name', x.name, y.name]], changes, a.pom); // template rows the assistant left blank are known, not 'added' when filled later
  let cellsChanged = 0, cellsTotal = 0; const bPom = new Map(b.pom.map(r => [norm(r.code), r]));
  for (const r of a.pom) for (const s of sizes) { if (!r.values[s]) continue; cellsTotal++; const o = bPom.get(norm(r.code)); const x = num(r.values[s]), y = num(o?.values?.[s]); if (!o || y == null || (x != null && Math.abs(x - y) > 1e-6) || (x == null && norm(r.values[s]) !== norm(o.values[s]))) cellsChanged++; }
  sections.pom.cellsChanged = cellsChanged; sections.pom.cellsTotal = cellsTotal;
  // materials, construction, colourways, labels
  sections.bom = listDiff('bom', a.bom, b.bom, r => norm(r.component), (x, y) => [['material', x.material, y.material], ['spec', x.spec, y.spec], ['placement', x.placement, y.placement]], changes);
  sections.construction = listDiff('construction', a.construction, b.construction, r => norm(r.area), (x, y) => [['detail', x.detail, y.detail]], changes);
  sections.colorways = listDiff('colorways', a.colorways, b.colorways, r => norm(r.name), (x, y) => [['swatch', x.swatch, y.swatch], ['code', x.code, y.code]], changes);
  sections.labels = listDiff('labels', a.labels, b.labels, r => norm(r.item), (x, y) => [['spec', x.spec, y.spec], ['placement', x.placement, y.placement]], changes);
  // care
  const careKeys = Object.keys(a.care).filter(k => a.care[k]), careChanged = careKeys.filter(k => norm(a.care[k]) !== norm(b.care[k]));
  for (const k of careChanged) if (changes.length < MAX_CHANGES) changes.push({ section: 'care', key: k, from: String(a.care[k]).slice(0, 120), to: String(b.care[k] || '').slice(0, 120), change: 'edited' });
  sections.care = { kept: careKeys.length - careChanged.length, changed: careChanged.length, total: careKeys.length };
  // overall: of the items the assistant produced, how many survived untouched
  const lists = ['callouts', 'pom', 'bom', 'construction', 'colorways', 'labels'];
  const draftItems = lists.reduce((n, k) => n + sections[k].total, 0) + sections.style.total + sections.care.total;
  const keptItems = lists.reduce((n, k) => n + sections[k].kept, 0) + sections.style.kept + sections.care.kept;
  return { sections, draftItems, keptItems, keptRate: draftItems ? Math.round((keptItems / draftItems) * 1000) / 1000 : null, changes };
}

// Across packs: edit rate per section (weighted by how much the assistant produced) and the keys corrected most often.
export function aggregateDiffs(rows) {
  const stats = rows.map(r => (r && r.stats && r.stats.sections ? r.stats : r)).filter(s => s && s.sections);
  const sections = {}, corrected = { pom: new Map(), callouts: new Map(), bom: new Map(), construction: new Map() };
  for (const s of stats) {
    for (const [k, v] of Object.entries(s.sections)) {
      const acc = sections[k] || (sections[k] = { total: 0, kept: 0, edited: 0, removed: 0, added: 0, packs: 0 });
      acc.total += v.total || 0; acc.kept += v.kept || 0; acc.edited += v.edited ?? v.changed ?? 0; acc.removed += v.removed || 0; acc.added += v.added || 0; acc.packs += v.total ? 1 : 0;
    }
    for (const k of Object.keys(corrected)) for (const key of [...(s.sections[k]?.editedKeys || []), ...(s.sections[k]?.removedKeys || [])]) corrected[k].set(key, (corrected[k].get(key) || 0) + 1);
  }
  for (const v of Object.values(sections)) v.keptRate = v.total ? Math.round((v.kept / v.total) * 1000) / 1000 : null;
  const top = m => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([key, n]) => ({ key, n }));
  const draftItems = stats.reduce((n, s) => n + (s.draftItems || 0), 0), keptItems = stats.reduce((n, s) => n + (s.keptItems || 0), 0);
  return { packs: stats.length, draftItems, keptItems, keptRate: draftItems ? Math.round((keptItems / draftItems) * 1000) / 1000 : null, sections,
    mostCorrected: { pom: top(corrected.pom), callouts: top(corrected.callouts), bom: top(corrected.bom), construction: top(corrected.construction) } };
}
