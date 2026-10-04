// Scores for an assistant draft. Two views: on its own (coverage, plausible measurements, callouts that land on the
// product, internal consistency) and against a golden pack people approved (do the measurements, callouts and materials
// agree). Pure functions; the eval runner in scripts/ feeds them, and the console can show them per pack.
import { normalizeTechPack } from './techpack.js';
import { familyOf, rangeFor } from './plausible.js';

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const words = s => new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 2));
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size && !B.size) return null; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const round = x => (x == null ? null : Math.round(x * 1000) / 1000);

// The first, apparel-and-footwear-only table. Kept for the tests that pin it; scoring now uses src/plausible.js, which
// covers every product family and is the same check the assistant runs before a draft is saved.
export const PLAUSIBLE_IN = {
  'across shoulder': [12, 28], 'chest width': [13, 42], 'body length hps': [15, 45], 'sleeve length': [4, 32], 'bicep': [4, 18], 'cuff opening': [2, 12], 'hem width': [12, 44], 'neck width': [4, 14], 'front neck drop': [1.5, 10],
  'waist relaxed': [10, 32], 'waist extended': [10, 36], 'front rise': [6, 22], 'back rise': [8, 26], 'inseam': [1, 42], 'thigh': [7, 22], 'knee': [5, 18], 'leg opening': [3, 18], 'hip': [12, 38],
  'outsole length': [7, 16], 'forefoot width (outsole)': [2.5, 6], 'heel width (outsole)': [2, 5], 'heel height': [0.2, 7], 'forefoot stack': [0.2, 3], 'toe spring': [0, 2], 'collar height (lateral)': [1, 9], 'topline opening': [6, 20], 'lace length': [20, 80],
  'crown circumference': [18, 27], 'crown height': [2, 8], 'visor length': [1.5, 5], 'visor width': [5, 10], 'sweatband height': [0.5, 2.5],
  'width': [1, 48], 'height': [1, 48], 'depth / gusset': [0.5, 20], 'handle drop': [1, 20], 'strap length': [6, 80], 'opening width': [1, 48]
};

export function scoreDraft(input, { box = null, sampleSize } = {}) {
  const p = normalizeTechPack(input);
  const sizes = sampleSize && p.sizes.includes(sampleSize) ? [sampleSize] : p.sizes;
  const callouts = p.sketches[0]?.callouts || [];
  const pomFilled = p.pom.filter(r => sizes.some(s => r.values[s]));
  // coverage: did the draft fill the pack
  const coverage = {
    style: ['styleName', 'category', 'description', 'fabricSummary'].filter(k => p.style[k]).length / 4,
    callouts: Math.min(1, callouts.length / 6),
    pom: p.pom.length ? pomFilled.length / p.pom.length : 0,
    bom: Math.min(1, p.bom.filter(r => r.material && !/^(tbd|unknown|n\/a)$/i.test(r.material)).length / 4),
    construction: Math.min(1, p.construction.length / 4),
    colorways: Math.min(1, p.colorways.length / 1),
    care: (p.care.fiber ? 0.5 : 0) + (p.care.instructions ? 0.5 : 0)
  };
  coverage.mean = round(Object.values(coverage).reduce((a, b) => a + b, 0) / 7);
  // plausibility: known points of measure inside a sane range
  let checked = 0, inRange = 0; const outOfRange = [], family = familyOf(p.style.category, p.style.styleName);
  for (const r of pomFilled) {
    const range = rangeFor(r.name, family); if (!range) continue;
    for (const s of sizes) { const v = num(r.values[s]); if (v == null) continue; checked++; if (v >= range.lo && v <= range.hi) inRange++; else outOfRange.push({ code: r.code, name: r.name, size: s, value: v }); }
  }
  const plausibility = { checked, inRange, rate: checked ? round(inRange / checked) : null, outOfRange: outOfRange.slice(0, 10) };
  // grounding: pins placed, inside the product box (when known), not stacked on one spot
  const placed = callouts.filter(c => c.x != null && c.y != null);
  let inBox = placed.length;
  if (box && Number.isFinite(box.x) && Number.isFinite(box.w)) { const m = 0.04; inBox = placed.filter(c => c.x >= box.x - m && c.x <= box.x + box.w + m && c.y >= box.y - m && c.y <= box.y + box.h + m).length; }
  const spots = new Set(placed.map(c => `${Math.round(c.x * 25)}:${Math.round(c.y * 25)}`));
  const grounding = { total: callouts.length, placed: placed.length, inBox, distinct: spots.size, rate: callouts.length ? round(Math.min(inBox, spots.size) / callouts.length) : null };
  // consistency: things that are wrong on their face
  const issues = [];
  if (p.colorways.some(c => !/^#[0-9a-f]{6}$/i.test(c.swatch))) issues.push('colorway without a valid swatch');
  if (callouts.some(c => !c.spec && !c.note)) issues.push('callout with no spec or note');
  if (p.bom.some(r => /^(tbd|unknown)$/i.test(r.material))) issues.push('material left as TBD');
  const seen = new Set(); for (const c of callouts) { const k = norm(c.label); if (seen.has(k)) { issues.push(`duplicate callout "${c.label}"`); break; } seen.add(k); }
  if (p.style.category && p.style.description && norm(p.style.description).length < 20) issues.push('description too short to brief a factory');
  const consistency = { issues, rate: round(Math.max(0, 1 - issues.length * 0.2)) };
  const parts = [coverage.mean, plausibility.rate, grounding.rate, consistency.rate].filter(x => x != null);
  return { coverage, plausibility, grounding, consistency, score: parts.length ? round(parts.reduce((a, b) => a + b, 0) / parts.length) : null };
}

// Agreement with the pack people approved. Measurements match when within the tolerance or 8% of the golden value,
// whichever is wider; lists compare by normalised key.
export function compareToGolden(input, goldenInput, { sampleSize } = {}) {
  const p = normalizeTechPack(input), g = normalizeTechPack(goldenInput);
  const sizes = sampleSize && g.sizes.includes(sampleSize) ? [sampleSize] : g.sizes.filter(s => p.sizes.includes(s));
  const byCode = new Map(p.pom.map(r => [norm(r.code), r]));
  let compared = 0, within = 0, missing = 0; const misses = [];
  for (const r of g.pom) {
    const vals = sizes.map(s => [s, num(r.values[s])]).filter(([, v]) => v != null); if (!vals.length) continue;
    const mine = byCode.get(norm(r.code));
    for (const [s, gv] of vals) {
      const mv = mine ? num(mine.values[s]) : null;
      if (mv == null) { missing++; continue; }
      compared++;
      const tol = Math.max(Math.abs(num(r.tolerance) ?? 0), Math.abs(gv) * 0.08);
      if (Math.abs(mv - gv) <= tol) within++; else if (misses.length < 10) misses.push({ code: r.code, name: r.name, size: s, draft: mv, golden: gv });
    }
  }
  const pom = { compared, within, missing, rate: compared ? round(within / compared) : null, misses };
  const gc = g.sketches[0]?.callouts || [], pc = p.sketches[0]?.callouts || [];
  const callouts = { golden: gc.length, draft: pc.length, overlap: round(jaccard(gc.map(c => norm(c.label)), pc.map(c => norm(c.label)))) };
  const bom = { golden: g.bom.length, draft: p.bom.length, overlap: round(jaccard(g.bom.map(r => norm(r.component)), p.bom.map(r => norm(r.component)))),
    materialWords: round(jaccard([...g.bom.flatMap(r => [...words(r.material)])], [...p.bom.flatMap(r => [...words(r.material)])])) };
  const construction = { overlap: round(jaccard(g.construction.map(r => norm(r.area)), p.construction.map(r => norm(r.area)))) };
  const parts = [pom.rate, callouts.overlap, bom.overlap, construction.overlap].filter(x => x != null);
  return { pom, callouts, bom, construction, score: parts.length ? round(parts.reduce((a, b) => a + b, 0) / parts.length) : null };
}
