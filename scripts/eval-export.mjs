// Export golden cases for the assistant eval from the live database: every tech pack people approved or published,
// with its photos and the pack as they left it. Writes eval/cases/<id>.json (ignored by git: the files hold client photos).
//
//   DATABASE_URL=... node scripts/eval-export.mjs [--min-stage published|approved|countersigned] [--limit 50]
import { mkdirSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { normalizeTechPack, normalizeVerification } from '../src/techpack.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const minStage = arg('--min-stage', 'published'), limit = Number(arg('--limit', 100));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const rows = (await pool.query(`select tp.id,tp.product_id,tp.version,tp.published_data,tp.verification,tp.ai_draft,tp.ai_model,p.title,p.product_type,c.name client_name
  from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id where tp.published_at is not null order by tp.published_at desc limit $1`, [limit])).rows;
mkdirSync('eval/cases', { recursive: true });
let n = 0;
for (const r of rows) {
  const v = normalizeVerification(r.verification, r.version);
  const stage = v.factorySign ? 'countersigned' : v.clientSign ? 'approved' : 'published';
  if (['published', 'approved', 'countersigned'].indexOf(stage) < ['published', 'approved', 'countersigned'].indexOf(minStage)) continue;
  const golden = normalizeTechPack(r.published_data);
  const photos = golden.sketches.map(s => s.image).filter(Boolean);
  if (!photos.length) continue;
  const strip = p => ({ ...p, sketches: p.sketches.map(s => ({ ...s, image: '', callouts: s.callouts.map(c => ({ ...c, photo: '' })) })), renderings: [], artwork: [] });
  writeFileSync(`eval/cases/${r.id}.json`, JSON.stringify({ id: r.id, productId: r.product_id, title: r.title, productType: r.product_type, client: r.client_name, stage, version: r.version,
    sampleSize: golden.style.sampleSize, sizes: golden.sizes, photos, golden: strip(golden), aiDraft: r.ai_draft || null, aiModel: r.ai_model || null }));
  n++;
}
await pool.end();
console.log(`${n} case${n === 1 ? '' : 's'} written to eval/cases (min stage ${minStage})`);
