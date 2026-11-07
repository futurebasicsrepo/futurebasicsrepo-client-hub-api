// Ouster Merch Drop 1, third pass: who makes each style, and the artwork they make it from. Runs once, after src/ouster-drop1-packs.js.
//
// The factory: of the factories in the hub (most came in from our Alibaba orders, src/factory-import.js), the one that fits each style best:
//   - it makes that kind of product (its product types),
//   - it has the skills the decoration needs (embroidery for the caps, screen print for the tees, laser for the engraved tool and pen…),
//   - and we have bought something like it from them before (the order lines kept in its note), more and more often scoring higher.
// The pick is set on the product's configuration (the supplier); a style no factory fits is left for staff, and what was weighed is kept in
// app_settings and the log. Where we have bought the same kind of item from that factory, the smallest quantity we ordered becomes the MOQ
// and the unit prices paid are kept as a guide; the factory's lead time is used if it has one. Nothing else is guessed: prices come from quotes.
//
// The artwork: the Ouster mark and wordmark are the vector drawing from the Capsule 01 tech pack PDF (src/seed/ouster-drop1/art), set the way
// each Drop 1 mockup shows them (the caps' stacked lockup, the tees' chest and hem marks, the engraving lockup). Where a decoration is printed or
// embroidered, its job file (src/lab-jobfile.js: separations and films with Pantones, or the DST/EXP stitch file and thread list, and the
// one-page job sheet) is beside it. The graphics only Ouster's Figma holds in full (the Infrared drawings, the photo prints, the woven label,
// the sticker designs, the point cloud) go in as references cut from the mockups, named as such, until the vectors come.
// Each file is a product asset (the product's Assets) and a file in the Merch Drop 1 project the assigned factory can open on its page.
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, extname } from 'node:path';
import { DROP1 } from './ouster-drop1.js';
import { normalizeTechPack } from './techpack.js';

export const OUSTER_MAKE_KEY = 'seed:ouster-merch-drop-1-make';
const SEED = new URL('./seed/ouster-drop1/', import.meta.url), ART = new URL('./seed/ouster-drop1/art/', import.meta.url);

// what each style needs from a factory
export const NEEDS = {
  'ouster-drop1-tee-infrared': { types: ['top'], skills: ['screen-print'], words: /\b(t-?shirts?|tees?)\b/i },
  'ouster-drop1-tee-taxi': { types: ['top'], skills: ['dtf-dtg', 'screen-print'], words: /\b(t-?shirts?|tees?)\b/i },
  'ouster-drop1-ls-yosemite': { types: ['top'], skills: ['dtf-dtg', 'screen-print'], words: /\b(long sleeve|t-?shirts?|tees?)\b/i },
  'ouster-drop1-cap-tan': { types: ['headwear'], skills: ['embroidery'], words: /\b(caps?|hats?|dad hat|6 panel|baseball)\b/i },
  'ouster-drop1-cap-green': { types: ['headwear'], skills: ['embroidery'], words: /\b(caps?|hats?|dad hat|6 panel|baseball)\b/i },
  'ouster-drop1-beanie-green': { types: ['headwear'], skills: ['knit', 'heat-transfer'], words: /\b(beanies?|knit(ted)? hats?|watch caps?)\b/i },
  'ouster-drop1-water-bottle': { types: ['drink'], skills: [], words: /\b(bottles?|tumblers?|drinkware|flasks?)\b/i },
  'ouster-drop1-multitool': { types: ['small', 'tech'], skills: ['laser'], words: /\b(multi-?tools?|knives|knife|pliers|tools?)\b/i },
  'ouster-drop1-point-cloud-artwork': { types: ['box'], skills: [], words: /\b(art prints?|posters?|frames?|framed|canvas prints?)\b/i },
  'ouster-drop1-notebook': { types: ['box'], skills: [], words: /\b(notebooks?|journals?|notepads?)\b/i },
  'ouster-drop1-kaweco-pen': { types: ['small'], skills: ['laser'], words: /\b(pens?|ballpoint)\b/i },
  'ouster-drop1-pencil-pack': { types: ['small'], skills: [], words: /\b(pencils?)\b/i },
  'ouster-drop1-sticker-pack': { types: ['small'], skills: [], words: /\b(stickers?|decals?)\b/i },
  'ouster-drop1-impossible-puzzle': { types: ['box'], skills: [], words: /\b(puzzles?|jigsaw)\b/i },
  'ouster-drop1-ocho-jersey': { types: ['top'], skills: ['sublimation'], words: /\b(jerseys?|soccer|football)\b/i }
};

// the lines of what we bought from a factory (the note src/factory-import.js keeps), each with its quantities and unit prices
export function orderLines(notes) {
  const body = String(notes || '').split('What we ordered:')[1] || '';
  return body.split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(l => l && !/^…and \d+ more$/.test(l))
    .map(t => ({ t, buys: [...t.matchAll(/([\d.,]+)\s+[A-Za-z]+\s+@\s+([A-Z]{3})\s+([\d.,]+)/g)].map(m => ({ qty: Number(m[1].replace(/,/g, '')), currency: m[2], unit: Number(m[3].replace(/,/g, '')) })).filter(b => b.qty > 0 && b.unit >= 0) }));
}
const ordersOf = notes => { const m = /(\d+) orders?/.exec(String(notes || '')); return m ? Number(m[1]) : 0; };
const spentOf = notes => { const m = /\$([\d,]+(?:\.\d+)?) spent/.exec(String(notes || '')); return m ? Number(m[1].replace(/,/g, '')) : 0; };

// how well one factory fits one style, and why
export function scoreFactory(s, need) {
  const types = s.product_types || [], skills = s.skills || [], why = [];
  let score = 0;
  const typeHit = need.types.find(t => types.includes(t)); if (typeHit) { score += 40; why.push(`makes ${typeHit}`); }
  for (const k of need.skills) if (skills.includes(k)) { score += 15; why.push(k); }
  const like = orderLines(s.notes).filter(l => need.words.test(l.t));
  if (like.length) { score += Math.min(30, like.length * 8); why.push(`${like.length} past order line${like.length === 1 ? '' : 's'} like it`); }
  if (!typeHit && !like.length) return { score: 0, why: [], like: [] };
  const orders = ordersOf(s.notes), spent = spentOf(s.notes);
  score += Math.min(10, orders) + (spent > 0 ? Math.round(Math.log10(spent) * 3) : 0);
  if (skills.includes('low-moq')) score += 3;
  if (skills.includes('qc')) score += 2;
  return { score, why, like };
}

// the best factory for a style (null when none makes it), with the MOQ and prices our past orders of the same kind show
export function pickFactory(suppliers, need) {
  const ranked = suppliers.filter(s => s.status !== 'archived').map(s => ({ s, ...scoreFactory(s, need) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || spentOf(b.s.notes) - spentOf(a.s.notes) || String(a.s.name).localeCompare(String(b.s.name)));
  const best = ranked[0]; if (!best) return null;
  const buys = best.like.flatMap(l => l.buys).filter(b => b.currency === 'USD'), runs = buys.filter(b => b.qty >= 10); // a sample order of a piece or two is not a minimum
  const units = buys.map(b => b.unit).sort((a, b) => a - b), median = units.length ? units[Math.floor(units.length / 2)] : null;
  return { supplier: best.s, score: best.score, why: best.why, moq: runs.length ? Math.min(...runs.map(b => b.qty)) : null, pastUnitUsd: median, pastBuys: buys.length,
    runnersUp: ranked.slice(1, 3).map(x => ({ name: x.s.name, score: x.score })) };
}

// the artwork of each style: production files (the vector marks and their job files) and references cut from the mockups
const P = (file, name, note) => ({ src: new URL(file, ART), name, note, kind: 'production' });
const J = (file, name, note) => ({ src: new URL(file, ART), name, note, kind: 'job' });
const R = (file, name, note, dir = SEED) => ({ src: new URL(file, dir), name, note: `${note} Reference cut from the Figma mockup: replace with Ouster's vector before production.`, kind: 'reference' });
export const ARTWORK = {
  'ouster-drop1-tee-infrared': [P('ouster-mark-white.png', 'Ouster mark, white: hem', 'Lower front left above the hem, about 1 in wide.'), J('tee-infrared-hem-mark.zip', 'Job file: hem mark (screen print)', 'White ink with underbase on charcoal: film, ink layer, job sheet.'),
    R('infrared-option-1-reference.png', 'Front artwork option 1, stacked hardware (reference)', 'Centre chest.', ART), R('infrared-option-2-reference.png', 'Front artwork option 2, annotated (reference)', 'Centre chest.', ART),
    R('infrared-option-3-reference.png', 'Front artwork option 3, exploded isometric (reference)', 'Centre chest.', ART), R('infrared-option-4-reference.png', 'Front artwork option 4, small chest graphic (reference)', 'Left chest.', ART),
    R('infrared-neck-label.jpg', 'Woven neck label (reference)', 'Centre back neck.')],
  'ouster-drop1-tee-taxi': [P('ouster-mark-black.png', 'Ouster mark, black: chest', 'Wearer\'s left chest, about 1.25 in wide.'), J('tee-taxi-chest-mark.zip', 'Job file: chest mark (screen print)', 'One ink, Pantone matched: film, ink layer, job sheet.'),
    R('taxi-back.jpg', 'Back photo print, NYC taxi (reference)', 'Full back; print method and image rights to confirm.'), R('taxi-neck-label.jpg', 'Woven neck label (reference)', 'Centre back neck.')],
  'ouster-drop1-ls-yosemite': [P('ouster-mark-black.png', 'Ouster mark, black: chest', 'Chest, about 1.25 in wide.'), J('ls-yosemite-chest-mark.zip', 'Job file: chest mark (screen print)', 'One ink, Pantone matched: film, ink layer, job sheet.'),
    R('yosemite-back.jpg', 'Back photo band and sleeve type, Yosemite (reference)', 'Upper back band; "Sense in Color" down the sleeve.'), R('yosemite-neck-label.jpg', 'Woven neck label (reference)', 'Centre back neck.')],
  'ouster-drop1-cap-tan': [P('ouster-lockup-stacked-white.png', 'Ouster lockup, stacked, white: cap front', 'Front centre, about 2.75 in wide, as the cap mockup.'), J('cap-tan-front-embroidery.zip', 'Job file: front embroidery', 'DST and EXP stitch files, white thread, stitch preview on tan, job sheet.'),
    R('cap-tan-inner.jpg', 'Inner label and buckle (reference)', 'Inside back; strap flag label.')],
  'ouster-drop1-cap-green': [P('ouster-lockup-stacked-white.png', 'Ouster lockup, stacked, white: cap front', 'Front centre, about 2.75 in wide, as the cap mockup.'), J('cap-green-front-embroidery.zip', 'Job file: front embroidery', 'DST and EXP stitch files, white thread, stitch preview on olive, job sheet.'),
    R('cap-green-inner.jpg', 'Inner label (reference)', 'Inside back.')],
  'ouster-drop1-beanie-green': [R('beanie-patch.jpg', 'Woven cuff patch (reference)', 'Cuff, centre front.')],
  'ouster-drop1-water-bottle': [P('ouster-wordmark-black.png', 'OUSTER wordmark, black: side', 'Small side text.'), P('ouster-wordmark-white.png', 'OUSTER wordmark, white: side', 'Small side text, if printed white.'),
    R('bottle-side.jpg', 'Point-cloud wrap print (reference)', 'Lower third wrap.')],
  'ouster-drop1-multitool': [P('ouster-lockup-horizontal-black.png', 'Ouster lockup, horizontal: engraving', 'Laser-engraved on the handle.')],
  'ouster-drop1-point-cloud-artwork': [R('point-cloud-product.jpg', 'Point cloud artwork, Potrero Avenue (reference)', 'The print itself needs the full-resolution file from Ouster.')],
  'ouster-drop1-notebook': [P('ouster-mark-white.png', 'Ouster mark, white: cover', 'Cover, with the spec line.'), P('ouster-lockup-horizontal-white.png', 'Ouster lockup, horizontal, white', 'Cover or mailer.'),
    R('notebook-product.jpg', 'Cover layout (reference)', 'Mark, "From thought to physical", spec line, crop marks.')],
  'ouster-drop1-kaweco-pen': [P('ouster-lockup-horizontal-black.png', 'Ouster lockup, horizontal: barrel etch', 'Laser-etched on the barrel.')],
  'ouster-drop1-pencil-pack': [P('ouster-mark-white.png', 'Ouster mark, white: pencil', 'On each pencil.'), P('ouster-wordmark-white.png', 'OUSTER wordmark, white', 'On each pencil or the box.'),
    R('pencils-product.jpg', 'Pencil print layout (reference)', '"From Thought to Physical" and the mark.')],
  'ouster-drop1-sticker-pack': [P('ouster-lockup-horizontal-black.png', 'Ouster lockup, horizontal', 'For the badge and sleeve stickers.'), R('stickers-product.jpg', 'Sticker sheet and sleeve (reference)', 'Eight designs to pick from the nine shown.')],
  'ouster-drop1-impossible-puzzle': [R('puzzle-product.jpg', 'Puzzle scene 1 (reference)', 'Full-resolution scene files from Ouster.'), R('puzzle-scene-2.jpg', 'Puzzle scene 2 (reference)', ''), R('puzzle-scene-3.jpg', 'Puzzle scene 3 (reference)', '')],
  'ouster-drop1-ocho-jersey': [P('ouster-mark-white.png', 'Ouster mark, white: chest graphic', 'Large mark mid-chest, with the asterisk.'), R('jersey-product.jpg', 'Front graphics (reference)', 'REV8, "THE OCHO", Ouster FC crest, sleeve chevrons.'),
    R('jersey-back.jpg', 'Back graphics (reference)', '"Ouster FC", serif "08", "Sense. Think. Act. Learn."')]
};
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.zip': 'application/zip' };
const fileName = a => `${a.name.replace(/[^\w ,.()-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90)}${extname(a.src.pathname)}`;

export async function applyOusterMake(pool, { uploadDir, log = console } = {}) {
  if ((await pool.query('select 1 from app_settings where key=$1', [OUSTER_MAKE_KEY])).rowCount) return { skipped: 'already applied' };
  const written = [], db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [OUSTER_MAKE_KEY]);
    if ((await db.query('select 1 from app_settings where key=$1', [OUSTER_MAKE_KEY])).rowCount) { await db.query('rollback'); return { skipped: 'already applied' }; }
    const client = (await db.query(`select id from clients where slug='ouster'`)).rows[0];
    if (!client) { await db.query('rollback'); return { skipped: 'no Ouster room' }; }
    const suppliers = (await db.query(`select id,name,status,country,lead_time_days,product_types,skills,notes from suppliers where status<>'archived'`)).rows;
    const out = { picks: [], unmatched: [], files: 0 };
    for (const p of DROP1) {
      const prod = (await db.query(`select p.id,p.project_id from products p join projects pr on pr.id=p.project_id where p.client_id=$1 and pr.name='Merch Drop 1' and p.title=$2 limit 1`, [client.id, p.title])).rows[0];
      if (!prod) continue;
      // the factory
      const pick = pickFactory(suppliers, NEEDS[p.handle]);
      if (pick) {
        await db.query(`insert into product_configurations(product_id,supplier_id) values($1,$2) on conflict(product_id) do update set supplier_id=coalesce(product_configurations.supplier_id,excluded.supplier_id),
          moq=coalesce(product_configurations.moq,$3),lead_time_days=coalesce(product_configurations.lead_time_days,$4),updated_at=now()`, [prod.id, pick.supplier.id, pick.moq, pick.supplier.lead_time_days || null]);
        out.picks.push({ product: p.title, factory: pick.supplier.name, score: pick.score, why: pick.why, moq: pick.moq, pastUnitUsd: pick.pastUnitUsd, leadTimeDays: pick.supplier.lead_time_days || null, runnersUp: pick.runnersUp });
      } else out.unmatched.push(p.title);
      // the artwork: a product asset and a project file the factory can open, each its own copy
      const art = [];
      for (const a of ARTWORK[p.handle] || []) {
        const bytes = readFileSync(a.src), name = fileName(a), mime = MIME[extname(name)] || 'application/octet-stream';
        const s1 = `${randomBytes(18).toString('hex')}-${name.replace(/\s+/g, '-')}`, s2 = `${randomBytes(18).toString('hex')}-${name.replace(/\s+/g, '-')}`;
        await writeFile(join(uploadDir, s1), bytes); written.push(s1); await writeFile(join(uploadDir, s2), bytes); written.push(s2);
        const asset = (await db.query(`insert into assets(product_id,name,kind,status,visibility) values($1,$2,$3,$4,$5)
          on conflict(product_id,name) do update set updated_at=now() returning *`, [prod.id, a.name, a.kind === 'job' ? 'production-file' : 'artwork', a.kind === 'reference' ? 'reference' : 'working', a.kind === 'job' ? 'internal' : 'client'])).rows[0];
        const v = asset.current_version + 1;
        await db.query(`insert into asset_versions(asset_id,version,original_name,storage_name,mime_type,size_bytes,notes) values($1,$2,$3,$4,$5,$6,$7)`, [asset.id, v, name, s1, mime, bytes.length, a.note]);
        await db.query('update assets set current_version=$2,updated_at=now() where id=$1', [asset.id, v]);
        await db.query(`insert into room_files(client_id,project_id,product_id,uploader_role,original_name,storage_name,mime_type,size_bytes,note,client_visible,factory_visible,purpose)
          values($1,$2,$3,'admin',$4,$5,$6,$7,$8,$9,true,'artwork')`, [client.id, prod.project_id, prod.id, name, s2, mime, bytes.length, `${p.title}: ${a.note}`.slice(0, 500), a.kind !== 'job']);
        if (a.kind === 'production' && mime === 'image/png') art.push({ id: a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), name: a.name, image: `data:image/png;base64,${bytes.toString('base64')}`, source: 'upload', note: `${a.note} Vector drawing of the Ouster mark (Capsule 01 tech pack).` });
        out.files++;
      }
      // the production artwork joins the tech pack's artwork, beside what is there
      if (art.length) {
        const tp = (await db.query('select id,data from tech_packs where product_id=$1', [prod.id])).rows[0];
        if (tp) { const d = normalizeTechPack(tp.data), have = new Set(d.artwork.map(x => x.name)); d.artwork = [...art.filter(x => !have.has(x.name)), ...d.artwork]; await db.query('update tech_packs set data=$2,updated_at=now() where id=$1', [tp.id, normalizeTechPack(d)]); }
      }
    }
    await db.query(`insert into activities(client_id,type,summary,metadata) values($1,'asset',$2,$3)`, [client.id, `Merch Drop 1 artwork added: ${out.files} files (marks, job files and references)`, JSON.stringify({ files: out.files })]);
    await db.query('insert into app_settings(key,value) values($1,$2::jsonb)', [OUSTER_MAKE_KEY, JSON.stringify({ at: new Date().toISOString(), ...out })]);
    await db.query('commit');
    log.info?.({ picks: out.picks.map(x => `${x.product} → ${x.factory} (${x.score}: ${x.why.join(', ')}${x.moq ? `; least ordered ${x.moq}` : ''}${x.pastUnitUsd != null ? `; paid ~$${x.pastUnitUsd}` : ''})`), unmatched: out.unmatched, files: out.files }, 'Ouster Merch Drop 1 factories and artwork applied');
    return out;
  } catch (e) {
    await db.query('rollback').catch(() => {});
    const { unlink } = await import('node:fs/promises'); for (const f of written) await unlink(join(uploadDir, f)).catch(() => {});
    log.error?.({ err: e.message }, 'Ouster Merch Drop 1 factories and artwork not applied'); return { error: e.message };
  } finally { db.release(); }
}
