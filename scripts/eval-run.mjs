// Run the assistant over the golden cases and score each draft on its own and against the pack people approved.
// Spends real API calls per case when ANTHROPIC_API_KEY is set; with AI_FIXTURE it exercises the pipeline for free.
//
//   node scripts/eval-run.mjs [--cases eval/cases] [--limit 10] [--min-score 0.6] [--min-agreement 0.5]
//
// Writes eval/results/<timestamp>.json and prints one line per case. Exits 1 when the mean falls under a threshold.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftFromPhotos, applyDraftToPack, productTypeLabel, locateProduct, cropToBox, completeMeasurements, aiEnabled } from '../src/ai.js';
import { normalizeTechPack, seedTechPack } from '../src/techpack.js';
import { scoreDraft, compareToGolden } from '../src/eval.js';
import { draftDiff } from '../src/learning.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const dir = arg('--cases', 'eval/cases'), limit = Number(arg('--limit', 1000)), minScore = Number(arg('--min-score', 0)), minAgree = Number(arg('--min-agreement', 0));
if (!aiEnabled()) { console.error('Set ANTHROPIC_API_KEY (real run) or AI_FIXTURE (pipeline check)'); process.exit(2); }
const files = readdirSync(dir).filter(f => f.endsWith('.json')).slice(0, limit);
if (!files.length) { console.error(`No cases in ${dir}. Run scripts/eval-export.mjs first.`); process.exit(2); }
const results = [];
for (const f of files) {
  const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const t0 = Date.now();
  try {
    const original = c.photos[0];
    let photo = original, box = null;
    try { const where = await locateProduct(original); if (where.found) { box = where.box; const crop = await cropToBox(original, where.box); if (crop.coverage < 0.92) photo = crop.image; } } catch {}
    const photos = [photo, ...c.photos.slice(1)];
    const sizes = c.sizes, sampleSize = c.sampleSize || sizes[Math.floor(sizes.length / 2)];
    const first = await draftFromPhotos({ photos, title: c.title, notes: '', pomTemplate: c.golden.pom.map(r => ({ code: r.code, name: r.name, how: r.how })), sizes, sampleSize });
    const seed = normalizeTechPack({ ...seedTechPack({ product: { title: c.title, product_type: productTypeLabel(first.draft) } }), sketches: c.golden.sketches.map((s, i) => ({ ...s, image: c.photos[i] || '', callouts: [] })) });
    let draft = first.draft;
    try { await completeMeasurements(draft, { photo, pomTemplate: seed.pom.map(r => ({ code: r.code, name: r.name, how: r.how })), product: { title: c.title, category: draft.category, description: draft.description }, sizes: seed.sizes, sampleSize }); } catch {}
    const pack = normalizeTechPack(await applyDraftToPack(seed, draft, { photos, sizes: seed.sizes, sampleSize, model: first.model }));
    // the eval box is in the cropped photo's frame when a crop was used; pins are placed on that same frame
    const own = scoreDraft(pack, { sampleSize, box: photo === original ? box : { x: 0, y: 0, w: 1, h: 1 } });
    const vs = compareToGolden(pack, c.golden, { sampleSize });
    const edits = draftDiff(pack, c.golden, { sampleSize });
    results.push({ id: c.id, title: c.title, stage: c.stage, model: first.model, ms: Date.now() - t0, score: own.score, agreement: vs.score, keptIfGolden: edits.keptRate, own, vs });
    console.log(`${(own.score ?? 0).toFixed(2)} own · ${(vs.score ?? 0).toFixed(2)} vs golden · ${String(edits.keptRate ?? '-').padEnd(5)} kept · ${c.title} (${c.stage}, ${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ id: c.id, title: c.title, stage: c.stage, error: String(e.message || e) });
    console.log(`FAIL ${c.title}: ${e.message}`);
  }
}
const ok = results.filter(r => !r.error), mean = k => ok.length ? ok.reduce((a, r) => a + (r[k] ?? 0), 0) / ok.length : 0;
const summary = { cases: results.length, failed: results.length - ok.length, meanScore: Math.round(mean('score') * 1000) / 1000, meanAgreement: Math.round(mean('agreement') * 1000) / 1000, meanKept: Math.round(mean('keptIfGolden') * 1000) / 1000 };
mkdirSync('eval/results', { recursive: true });
const out = `eval/results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(out, JSON.stringify({ summary, results }, null, 1));
console.log(`\n${summary.cases} cases · mean own ${summary.meanScore} · mean vs golden ${summary.meanAgreement} · mean kept ${summary.meanKept} · ${summary.failed} failed → ${out}`);
if (summary.meanScore < minScore || summary.meanAgreement < minAgree || summary.failed) process.exit(1);
