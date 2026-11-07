// Ouster Merch Drop 1, fourth pass: the graphics themselves, off the products. Runs once, after src/ouster-drop1-make.js.
//
// The Google Doc's mockups are the only source of these (the screenshots are 893 px wide), so each graphic was cut from the mockup that shows it
// largest and cleaned (src/seed/ouster-drop1/graphics, extracted.json): the four Infrared drawings and the jersey's graphics lifted onto
// transparent in their ink colour, the taxi and Yosemite photo prints, the bottle wrap and the point cloud enlarged, the woven Kelvin label
// straightened from the beanie patch (and its line art for the label maker), the six hang-tag cards, the two tech stickers, the sticker sheet
// and the pencil box print. "Sense in Color" is typeset to match the sleeve (the mockup shows it mirrored round the sleeve). The crest and the
// sleeve chevron are too small in the mockups to lift, so they stay references.
//
// For each style: every graphic, label and tag it carries becomes a product asset and a Merch Drop 1 file the assigned factory can open, and
// the printed or woven ones get a job file made here (src/lab-jobfile.js: separations and films with Pantones, the DTG file, the woven label's
// sheet). In the tech pack the graphics replace the whole-mockup pictures the artwork list held, and the single-placement ones are placed on
// the flat. The references the third pass added for these graphics are taken away.
import { readFileSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DROP1 } from './ouster-drop1.js';
import { normalizeTechPack } from './techpack.js';
import { jobZip as makeJobZip } from './lab-jobfile.js';
import { BUILTIN_TECHNIQUES } from './lab-library.js';

export const OUSTER_GRAPHICS_KEY = 'seed:ouster-merch-drop-1-graphics';
const G = new URL('./seed/ouster-drop1/graphics/', import.meta.url);
export const EXTRACTED = JSON.parse(readFileSync(new URL('extracted.json', G), 'utf8'));
const byFile = Object.fromEntries(EXTRACTED.map(e => [e.file.replace(/\.png$/, ''), e]));

// a graphic on a style: [graphic, job technique or null, width in inches, garment colour, placement on a flat or null]
const g = (file, job = null, widthIn = 0, garment = '', place = null) => ({ file, job, widthIn, garment, place });
const LABELS = [g('woven-label-kelvin'), g('woven-label-kelvin-art', 'Woven patch', 2.75), g('tech-sticker-detailed'), g('tech-sticker-general')];
const TAGS = [1, 2, 3, 4, 5, 6].map(i => g(`hang-tag-${i}`));
export const GRAPHICS = {
  'ouster-drop1-tee-infrared': [g('infrared-option-1', 'Plastisol screen print', 9, '#262626'), g('infrared-option-2', 'Plastisol screen print', 11, '#262626'),
    g('infrared-option-3', 'Plastisol screen print', 12, '#262626'), g('infrared-option-4', 'Plastisol screen print', 3.5, '#262626'), ...LABELS, ...TAGS],
  'ouster-drop1-tee-taxi': [g('taxi-back-photo', 'Direct-to-garment print', 11, '#ffffff', { sketch: 'back', x: .5, y: .44, w: .36 }), ...LABELS, ...TAGS],
  'ouster-drop1-ls-yosemite': [g('yosemite-back-photo', 'Direct-to-garment print', 12, '#e9e2d6', { sketch: 'back', x: .5, y: .3, w: .42 }),
    g('yosemite-sleeve-type', 'Plastisol screen print', 15, '#e9e2d6'), ...LABELS, ...TAGS],
  'ouster-drop1-cap-tan': [g('woven-label-kelvin'), g('woven-label-kelvin-art', 'Woven patch', 2.75), g('tech-sticker-general')],
  'ouster-drop1-cap-green': [g('woven-label-kelvin'), g('woven-label-kelvin-art', 'Woven patch', 2.75), g('tech-sticker-general')],
  'ouster-drop1-beanie-green': [g('woven-label-kelvin'), g('woven-label-kelvin-art', 'Woven patch', 2.75), g('tech-sticker-general')],
  'ouster-drop1-water-bottle': [g('bottle-wrap')],
  'ouster-drop1-point-cloud-artwork': [g('point-cloud-print')],
  'ouster-drop1-pencil-pack': [g('pencil-box-print')],
  'ouster-drop1-sticker-pack': [g('sticker-sheet')],
  'ouster-drop1-ocho-jersey': [g('jersey-back-08', 'Plastisol screen print', 10, '#1a1a1a', { sketch: 'back', x: .5, y: .45, w: .4 }), g('jersey-back-ouster-fc', 'Plastisol screen print', 3.5, '#1a1a1a', { sketch: 'back', x: .5, y: .15, w: .14 }),
    g('jersey-back-hem-text', 'Plastisol screen print', 9, '#1a1a1a', { sketch: 'back', x: .5, y: .9, w: .36 }), g('jersey-front-mark', 'Plastisol screen print', 8, '#1a1a1a', { sketch: 'front', x: .55, y: .55, w: .32 }),
    g('jersey-crest'), g('jersey-sleeve-chevron'), ...TAGS]
};
// what the third pass added that these replace (assets and project files of these names, and the whole-mockup artwork in the packs)
export const SUPERSEDED_ASSETS = ['Front artwork option 1, stacked hardware (reference)', 'Front artwork option 2, annotated (reference)', 'Front artwork option 3, exploded isometric (reference)',
  'Front artwork option 4, small chest graphic (reference)', 'Woven neck label (reference)', 'Back photo print, NYC taxi (reference)', 'Back photo band and sleeve type, Yosemite (reference)',
  'Inner label and buckle (reference)', 'Inner label (reference)', 'Woven cuff patch (reference)', 'Point-cloud wrap print (reference)', 'Point cloud artwork, Potrero Avenue (reference)',
  'Pencil print layout (reference)', 'Sticker sheet and sleeve (reference)', 'Back graphics (reference)'];
const MOCKUP_ART = ['Option 1 — stacked hardware', 'Option 2 — annotated', 'Option 3 — exploded isometric', 'Option 4 — small chest graphic'];
const SMALL = new Set(['jersey-crest', 'jersey-sleeve-chevron']);
const nameOf = e => (SMALL.has(e.file.replace(/\.png$/, '') ) ? `${e.label} (reference)` : e.label);
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export async function applyOusterGraphics(pool, { uploadDir, jobZip = makeJobZip, techniques = BUILTIN_TECHNIQUES, log = console } = {}) {
  if ((await pool.query('select 1 from app_settings where key=$1', [OUSTER_GRAPHICS_KEY])).rowCount) return { skipped: 'already applied' };
  // the job files are made before the transaction (seconds each), once per graphic and setting
  const jobs = new Map();
  if (jobZip) for (const list of Object.values(GRAPHICS)) for (const x of list) if (x.job) {
    const key = `${x.file}|${x.job}|${x.widthIn}|${x.garment}`; if (jobs.has(key)) continue;
    const t = techniques.find(t => t.name === x.job);
    try { const r = await jobZip(readFileSync(new URL(`${x.file}.png`, G)), { name: byFile[x.file].label, technique: t, widthIn: x.widthIn, garmentColour: x.garment }); jobs.set(key, r.zip); }
    catch (e) { log.warn?.({ err: e.message, file: x.file }, 'Drop 1 job file not made'); }
  }
  const written = [], db = await pool.connect();
  const store = async (bytes, name) => { const s = `${randomBytes(18).toString('hex')}-${name.replace(/[^\w.-]+/g, '-')}`; await writeFile(join(uploadDir, s), bytes); written.push(s); return s; };
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [OUSTER_GRAPHICS_KEY]);
    if ((await db.query('select 1 from app_settings where key=$1', [OUSTER_GRAPHICS_KEY])).rowCount) { await db.query('rollback'); return { skipped: 'already applied' }; }
    const client = (await db.query(`select id from clients where slug='ouster'`)).rows[0];
    if (!client) { await db.query('rollback'); return { skipped: 'no Ouster room' }; }
    const out = { graphics: 0, jobs: 0, replaced: 0 }, gone = [];
    const addFile = async (prod, name, bytes, mime, note, kind, visibility, clientVisible) => {
      const s1 = await store(bytes, name), s2 = await store(bytes, name);
      const asset = (await db.query(`insert into assets(product_id,name,kind,status,visibility) values($1,$2,$3,$4,$5)
        on conflict(product_id,name) do update set updated_at=now() returning *`, [prod.id, name.replace(/\.(png|zip)$/, ''), kind, kind === 'production-file' ? 'working' : 'working', visibility])).rows[0];
      const v = asset.current_version + 1;
      await db.query('insert into asset_versions(asset_id,version,original_name,storage_name,mime_type,size_bytes,notes) values($1,$2,$3,$4,$5,$6,$7)', [asset.id, v, name, s1, mime, bytes.length, note]);
      await db.query('update assets set current_version=$2,updated_at=now() where id=$1', [asset.id, v]);
      await db.query(`insert into room_files(client_id,project_id,product_id,uploader_role,original_name,storage_name,mime_type,size_bytes,note,client_visible,factory_visible,purpose)
        values($1,$2,$3,'admin',$4,$5,$6,$7,$8,$9,true,'artwork')`, [client.id, prod.project_id, prod.id, name, s2, mime, bytes.length, note.slice(0, 500), clientVisible]);
    };
    for (const p of DROP1) {
      const list = GRAPHICS[p.handle]; if (!list) continue;
      const prod = (await db.query(`select p.id,p.project_id from products p join projects pr on pr.id=p.project_id where p.client_id=$1 and pr.name='Merch Drop 1' and p.title=$2 limit 1`, [client.id, p.title])).rows[0];
      if (!prod) continue;
      // the references these replace
      const old = (await db.query(`select a.id,a.name from assets a where a.product_id=$1 and a.name=any($2) and a.status='reference'`, [prod.id, SUPERSEDED_ASSETS])).rows;
      for (const a of old) { gone.push(...(await db.query('select storage_name from asset_versions where asset_id=$1', [a.id])).rows.map(r => r.storage_name)); await db.query('delete from assets where id=$1', [a.id]); }
      if (old.length) {
        const names = old.flatMap(a => [`${a.name}.jpg`, `${a.name}.png`]);
        const rf = (await db.query(`delete from room_files where product_id=$1 and purpose='artwork' and original_name=any($2) returning storage_name`, [prod.id, names])).rows;
        gone.push(...rf.map(r => r.storage_name)); out.replaced += old.length;
      }
      const art = [];
      for (const x of list) {
        const e = byFile[x.file], bytes = readFileSync(new URL(e.file, G)), name = nameOf(e), ref = SMALL.has(x.file);
        const note = `${e.place}. ${e.note || ''} ${ref ? 'Too small in the mockup to lift: a reference until Ouster\'s file comes.' : 'Cut from the Figma mockup (the Google Doc\'s 893 px screenshots) and cleaned: check against Ouster\'s file before a large run.'}`.replace(/\s+/g, ' ').trim();
        await addFile(prod, `${name}.png`, bytes, 'image/png', note, 'artwork', 'client', true); out.graphics++;
        if (x.job) {
          const zip = jobs.get(`${x.file}|${x.job}|${x.widthIn}|${x.garment}`);
          if (zip) { await addFile(prod, `Job file: ${e.label} (${x.job}, ${x.widthIn} in).zip`, zip, 'application/zip', `${x.job}, ${x.widthIn} in wide${x.garment ? ` on ${x.garment}` : ''}: separations, films and job sheet.`, 'production-file', 'internal', false); out.jobs++; }
        }
        art.push({ id: slug(x.file), name, image: `data:image/png;base64,${bytes.toString('base64')}`, source: 'upload', note: `${e.place}.${x.job ? ` ${x.job}, about ${x.widthIn} in wide.` : ''}`, place: x.place });
      }
      // the tech pack: the graphics replace the whole-mockup pictures, and the single-placement ones go on the flat
      const tp = (await db.query('select id,data from tech_packs where product_id=$1', [prod.id])).rows[0];
      if (tp) {
        const d = normalizeTechPack(tp.data), ids = new Set(d.sketches.map(s => s.id));
        const keep = d.artwork.filter(a => !MOCKUP_ART.includes(a.name) && !art.some(n => n.name === a.name));
        d.artwork = [...art.map(a => ({ id: a.id, name: a.name, image: a.image, source: a.source, note: a.note,
          placements: a.place && ids.has(a.place.sketch) ? [{ sketchId: a.place.sketch, x: a.place.x, y: a.place.y, w: a.place.w, label: a.name }] : [] })), ...keep];
        await db.query('update tech_packs set data=$2,updated_at=now() where id=$1', [tp.id, normalizeTechPack(d)]);
      }
    }
    await db.query(`insert into activities(client_id,type,summary,metadata) values($1,'asset',$2,$3)`, [client.id, `Merch Drop 1 graphics added: ${out.graphics} graphics, labels and tags, ${out.jobs} job files`, JSON.stringify(out)]);
    await db.query('insert into app_settings(key,value) values($1,$2::jsonb)', [OUSTER_GRAPHICS_KEY, JSON.stringify({ at: new Date().toISOString(), ...out })]);
    await db.query('commit');
    for (const s of gone) await unlink(join(uploadDir, s)).catch(() => {});
    log.info?.(out, 'Ouster Merch Drop 1 graphics applied');
    return out;
  } catch (e) {
    await db.query('rollback').catch(() => {});
    for (const f of written) await unlink(join(uploadDir, f)).catch(() => {});
    log.error?.({ err: e.message }, 'Ouster Merch Drop 1 graphics not applied'); return { error: e.message };
  } finally { db.release(); }
}
