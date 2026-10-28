// Design Lab library: the graphics we have made and the techniques we make them with, in one place, so they can be used on any piece later (the page is
// src/lab-library.html at /lab/library; the studio and the concept window pick from it too).
//   GET  /v1/lab/library/graphics?q=&source=&tag=&limit=&offset=      the graphics (pictures come from GET /v1/lab/art/:id)
//   POST /v1/lab/library/graphics {prompt, name?, style?, techniqueId?, colors?, texts?, count?}   draw new graphics into the library (1 to 3)
//   POST /v1/lab/library/graphics/upload {image, name?, tags?, source?, techniqueId?}              keep artwork of our own (or a studio layer)
//   PUT  /v1/lab/library/graphics/:id {name?, tags?, techniqueId?}     DELETE /v1/lab/library/graphics/:id (taken out of the library; pieces using it keep it)
//   GET  /v1/lab/library/techniques      POST /v1/lab/library/techniques {…, from?}      PUT|DELETE /v1/lab/library/techniques/:id
//   POST /v1/lab/library/techniques/:id/photos {image}    DELETE …/photos/:pid    GET /v1/lab/library/technique-photos/:pid[?thumb=1]
//   POST /v1/lab/library/techniques/:id/sample {image}    the image model makes the mock-up look real (kept as the technique's sample)    GET …/sample
//   POST /v1/lab/concepts/:id/graphics {art, placement?, techniqueId?}    put a library graphic on a concept (the page then places it on the picture)
//   GET  /v1/lab/library/graphics/:id/vector.svg?widthIn=          the graphic traced to vector paths, one per ink (for a screen printer)
//   GET  /v1/lab/library/graphics/:id/embroidery?widthIn=[&format=dst]   a stitch plan (count, threads, a preview) or the Tajima .dst file
//   POST /v1/lab/library/repeat {art, type, repeatIn, scale, rotate, background, keep?, name?}   an all-over repeat of a graphic: a preview, or kept
//   GET  /v1/lab/library/graphics/:id/job?technique=&widthIn=&garment=[&preview=1]   the production job file (a zip: separations, settings, sheet), or its summary
import sharp from 'sharp';
import { imageConfig, openaiEdit } from './check.js';
import { finishArt, ART_STYLES } from './lab-art.js';
import { jobZip, jobFile } from './lab-jobfile.js';
import { traceVector, stitchPlan, dstOf, stitchPreview } from './lab-vector.js';
import { makeRepeat, cleanRepeat, REPEAT_TYPES } from './lab-repeat.js';
import { brandHits, cleanGraphics, ensureBranding, GRAPHIC_PLACE, GRAPHIC_TECHNIQUES } from './lab-concepts.js';
import { BUILTIN_TECHNIQUES, TECHNIQUE_KINDS, EFFECTS, cleanTechnique, cleanRules, realPrompt } from './lab-library.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const SOURCES = ['library', 'studio', 'upload', 'plan', 'concept', 'repeat'];
const cleanTags = t => [...new Set((Array.isArray(t) ? t : String(t || '').split(',')).map(x => clip(x, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
export const pictureOf = dataUrl => { const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || '')); return m ? Buffer.from(m[2], 'base64') : null; };
const techShape = (r, photos = []) => ({ id: r.id, key: r.key, kind: r.kind, name: r.name, summary: r.summary, base: r.base, finish: r.finish, rules: cleanRules(r.rules || {}, r.base), prompt: r.prompt, artGuide: r.art_guide, factoryNote: r.factory_note,
  builtin: r.builtin, hasSample: Boolean(r.has_sample), sampleAt: r.sample_at, photos, updatedAt: r.updated_at });

export function registerLabLibraryRoutes(app, d) {
  const { pool, authenticate, adminOnly, art, env = process.env, imageCfg = () => imageConfig(env), editImpl = openaiEdit, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const need = (req, reply, k = 'id') => UUID.test(String(req.params[k])) || (bad(reply, 'Not found', 404), false);

  // the starting techniques are put in once; after that they are ours to change
  const seeded = (async () => {
    for (const t of BUILTIN_TECHNIQUES) await pool.query(`insert into lab_techniques(key,kind,name,summary,base,finish,prompt,art_guide,factory_note,rules,builtin) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) on conflict(key) do update set rules=coalesce(lab_techniques.rules, excluded.rules)`,
      [t.key, t.kind, t.name, t.summary, t.base, t.finish, t.prompt, t.artGuide, t.factoryNote, cleanRules(t.rules || {}, t.base)]);
  })().catch(e => log.warn?.({ err: e.message }, 'design lab techniques could not be put in'));
  const technique = async id => (UUID.test(String(id || '')) ? (await pool.query('select * from lab_techniques where id=$1 and not archived', [id])).rows[0] || null : null);
  const photosOf = async id => (await pool.query('select jpeg from lab_technique_photos where technique_id=$1 order by created_at limit 3', [id])).rows.map(r => r.jpeg);
  const samples = new Map(), dayOf = () => new Date().toISOString().slice(0, 10), sampleCap = () => Number(env.LAB_DAILY_SAMPLES ?? 30);

  // ---- graphics ----
  app.get('/v1/lab/library/graphics', { preHandler: pre }, async req => {
    const q = req.query || {}, where = ['a.in_library'], args = [];
    if (clip(q.q, 80)) { args.push(`%${clip(q.q, 80).toLowerCase()}%`); where.push(`(lower(a.name) like $${args.length} or lower(a.prompt) like $${args.length} or exists(select 1 from unnest(a.tags) t where t like $${args.length}))`); }
    if (SOURCES.includes(q.source)) { args.push(q.source); where.push(`a.source=$${args.length}`); }
    if (clip(q.tag, 30)) { args.push(clip(q.tag, 30).toLowerCase()); where.push(`$${args.length} = any(a.tags)`); }
    if (UUID.test(String(q.technique || ''))) { args.push(q.technique); where.push(`a.technique_id=$${args.length}`); }
    const limit = Math.min(Math.max(Number(q.limit) || 60, 1), 200), offset = Math.max(Number(q.offset) || 0, 0), w = where.join(' and ');
    const rows = (await pool.query(`select a.id, a.name, a.tags, a.source, a.technique_id, a.created_at, a.meta, left(a.prompt, 400) prompt, t.name technique_name, p.name plan_name, c.name concept_name, coalesce(nullif(u.name,''), split_part(u.email,'@',1)) by_name
      from lab_art a left join lab_techniques t on t.id=a.technique_id left join lab_plans p on p.id=a.plan_id left join lab_concepts c on c.id=a.concept_id left join users u on u.id=a.created_by
      where ${w} order by a.created_at desc limit ${limit} offset ${offset}`, args)).rows;
    const total = Number((await pool.query(`select count(*)::int n from lab_art a where ${w}`, args)).rows[0].n);
    const tags = (await pool.query(`select t, count(*)::int n from lab_art, unnest(tags) t where in_library group by t order by n desc, t limit 30`)).rows.map(r => ({ tag: r.t, n: r.n }));
    return { graphics: rows.map(r => ({ id: r.id, name: r.name, tags: r.tags, source: r.source, techniqueId: r.technique_id, techniqueName: r.technique_name || '', from: r.concept_name || r.plan_name || '', by: r.by_name || '', prompt: r.prompt, createdAt: r.created_at, ...(r.meta?.repeat ? { repeat: { ...r.meta.repeat, widthIn: r.meta.widthIn, heightIn: r.meta.heightIn } } : {}) })), total, tags, styles: ART_STYLES, imageConnected: imageCfg().configured };
  });

  app.post('/v1/lab/library/graphics', { preHandler: pre }, async (req, reply) => {
    await seeded; const b = req.body || {}, prompt = clip(b.prompt, 700);
    if (prompt.length < 4) return bad(reply, 'Say what the graphic should be');
    const texts = (Array.isArray(b.texts) ? b.texts : String(b.texts || '').split('/')).map(t => clip(t, 40)).filter(Boolean).slice(0, 6);
    const hits = brandHits([prompt, ...texts, b.name || ''].join(' '), (await pool.query('select name from lab_brands')).rows.map(r => r.name));
    if (hits.length) return bad(reply, `Leave other brands out (${hits.slice(0, 3).join(', ')}). Describe the look in your own words.`);
    if (!art) return bad(reply, 'Artwork cannot be drawn on this service', 501);
    if (!imageCfg().configured) return bad(reply, 'No image model is connected, so graphics cannot be drawn.', 503);
    const count = Math.min(Math.max(Math.round(Number(b.count)) || 1, 1), 3), left = await art.capLeft(count); if (left !== true) return bad(reply, `The daily limit of ${left} artworks is reached. Raise LAB_DAILY_ART.`, 429);
    const t = await technique(b.techniqueId), style = ART_STYLES.includes(b.style) ? b.style : clip(b.style, 120);
    const program = { style: [style || 'a vintage, lived-in tee graphic', t?.art_guide ? `Designed for ${t.name.toLowerCase()}: ${t.art_guide}` : ''].filter(Boolean).join('. '), palette: [] };
    const colors = (Array.isArray(b.colors) ? b.colors : String(b.colors || '').split(',')).map(c => clip(c, 30)).filter(Boolean).slice(0, 6), tags = cleanTags(b.tags);
    const name = clip(b.name, 80) || clip(prompt, 60), ids = [], errors = [];
    for (let i = 0; i < count; i++) {
      const g = { name: count > 1 ? `${name} ${i + 1}` : name, kind: 'illustration', idea: count > 1 ? `${prompt} (Take ${i + 1} of ${count}: a different composition from the others.)` : prompt, texts, colors };
      try { ids.push(await art.drawAndStore(g, { program, technique: t?.base || 'screen print', source: 'library', tags, techniqueId: t?.id || null, createdBy: actorOf(req) })); }
      catch (e) { errors.push(clip(e.message, 160)); }
    }
    if (!ids.length) return bad(reply, `The graphic could not be drawn: ${errors[0] || 'no reason given'}`, 502);
    return reply.code(201).send({ ids, errors });
  });

  app.post('/v1/lab/library/graphics/upload', { preHandler: pre, bodyLimit: 24_000_000 }, async (req, reply) => {
    const b = req.body || {}, buf = pictureOf(b.image); if (!buf) return bad(reply, 'Send the artwork as a picture');
    let a; try { const m = await sharp(buf).metadata(); if (!m.width) throw new Error(); a = await finishArt(await sharp(buf).ensureAlpha().png().toBuffer()); } catch { return bad(reply, 'The picture could not be read'); }
    const t = await technique(b.techniqueId);
    const r = (await pool.query(`insert into lab_art(name,png,thumb,prompt,model,source,tags,technique_id,created_by) values($1,$2,$3,'','upload',$4,$5,$6,$7) returning id`,
      [clip(b.name, 120) || 'Artwork', a.png, a.thumb, b.source === 'studio' ? 'studio' : 'upload', cleanTags(b.tags), t?.id || null, actorOf(req)])).rows[0];
    return reply.code(201).send({ id: r.id });
  });

  app.put('/v1/lab/library/graphics/:id', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const b = req.body || {};
    const r = (await pool.query('select id, name, tags, technique_id from lab_art where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const tid = b.techniqueId === null || b.techniqueId === '' ? null : b.techniqueId !== undefined ? (await technique(b.techniqueId))?.id ?? r.technique_id : r.technique_id;
    await pool.query('update lab_art set name=$2, tags=$3, technique_id=$4, in_library=true where id=$1', [r.id, b.name !== undefined ? clip(b.name, 120) || r.name : r.name, b.tags !== undefined ? cleanTags(b.tags) : r.tags, tid]);
    return { ok: true };
  });
  app.delete('/v1/lab/library/graphics/:id', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return;
    const r = await pool.query('update lab_art set in_library=false where id=$1', [req.params.id]); if (!r.rowCount) return bad(reply, 'Not found', 404);
    return { ok: true };
  });

  // ---- vector and embroidery files from a graphic ----
  const artRow = async id => (await pool.query('select id, name, png from lab_art where id=$1', [id])).rows[0];
  const fileName = (a, ext) => `${String(a.name || 'graphic').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'graphic'}.${ext}`;
  app.get('/v1/lab/library/graphics/:id/vector.svg', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const a = await artRow(req.params.id); if (!a) return bad(reply, 'Not found', 404);
    const w = Number(req.query?.widthIn); const v = await traceVector(a.png, { widthIn: w > 0 && w < 80 ? w : null, name: a.name });
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('content-disposition', `attachment; filename="${fileName(a, 'svg')}"`).header('x-paths', String(v.paths)).header('cache-control', 'no-store').send(v.svg);
  });
  app.get('/v1/lab/library/graphics/:id/embroidery', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const a = await artRow(req.params.id); if (!a) return bad(reply, 'Not found', 404);
    const w = Number(req.query?.widthIn) || 4; if (!(w >= .5 && w <= 16)) return bad(reply, 'An embroidery runs from ½ in to 16 in wide');
    const p = await stitchPlan(a.png, { widthIn: w });
    if (req.query?.format === 'dst') { const d = dstOf(p, a.name); return reply.header('content-type', 'application/octet-stream').header('content-disposition', `attachment; filename="${fileName(a, 'dst')}"`).header('cache-control', 'no-store').send(d.file); }
    const preview = await sharp(Buffer.from(stitchPreview(p, { px: 700 }))).png().toBuffer();
    return { widthMm: p.widthMm, heightMm: p.heightMm, stitches: p.stitches, jumps: p.jumps, colours: p.colours, preview: `data:image/png;base64,${preview.toString('base64')}` };
  });
  // ---- an all-over repeat ----
  app.post('/v1/lab/library/repeat', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}; if (!UUID.test(String(b.art || ''))) return bad(reply, 'Choose a graphic from the library');
    const a = await artRow(b.art); if (!a) return bad(reply, 'That graphic is not in the library', 404);
    const r = await makeRepeat(a.png, cleanRepeat(b)), out = { type: r.type, typeLabel: REPEAT_TYPES[r.type], widthIn: r.widthIn, heightIn: r.heightIn, preview: `data:image/png;base64,${r.preview.toString('base64')}` };
    if (!b.keep) return out;
    const thumb = await sharp(r.preview).resize({ width: 256, height: 256, fit: 'cover' }).png().toBuffer(), name = clip(b.name, 80) || `${a.name} · ${REPEAT_TYPES[r.type].toLowerCase()} repeat`;
    const id = (await pool.query(`insert into lab_art(name,png,thumb,prompt,source,in_library,tags,meta,created_by) values($1,$2,$3,$4,'repeat',true,$5,$6,$7) returning id`,
      [name, r.tile, thumb, `All-over repeat of ${a.name}`, ['repeat', 'all-over'], { repeat: { from: a.id, type: r.type, repeatIn: r.repeatIn, scale: r.scale, rotate: r.rotate, background: r.background }, widthIn: r.widthIn, heightIn: r.heightIn }, actorOf(req)])).rows[0].id;
    return reply.code(201).send({ ...out, id, name });
  });

  // ---- techniques ----
  // the job file: the graphic made as a technique, at a width, as the files a factory or digitiser works from
  app.get('/v1/lab/library/graphics/:id/job', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return;
    const a = (await pool.query('select id, name, png, technique_id from lab_art where id=$1', [req.params.id])).rows[0]; if (!a) return bad(reply, 'Not found', 404);
    const q = req.query || {}, techId = UUID.test(String(q.technique || '')) ? q.technique : a.technique_id;
    const row = techId ? await technique(techId) : null; if (techId && !row) return bad(reply, 'That technique is not in the library', 404);
    const t = row ? techShape(row) : null, widthIn = Number(q.widthIn) || 4, garmentColour = /^#[0-9a-f]{6}$/i.test(String(q.garment || '')) ? String(q.garment) : '';
    try {
      if (q.preview) { const r = await jobFile(a.png, { name: a.name, technique: t, widthIn, garmentColour }); return { job: r.job, files: r.files.map(f => ({ name: f.name, bytes: f.data.length })), zipName: r.zipName }; }
      const r = await jobZip(a.png, { name: a.name, technique: t, widthIn, garmentColour });
      return reply.header('content-type', 'application/zip').header('content-disposition', `attachment; filename="${r.zipName}"`).header('cache-control', 'no-store').send(r.zip);
    } catch (e) { log.warn?.({ err: e.message, art: a.id }, 'job file could not be made'); return bad(reply, 'The job file could not be made from this graphic', 500); }
  });

  app.get('/v1/lab/library/techniques', { preHandler: pre }, async () => {
    await seeded;
    const rows = (await pool.query(`select id, key, kind, name, summary, base, finish, rules, prompt, art_guide, factory_note, builtin, (sample is not null) has_sample, sample_at, updated_at from lab_techniques where not archived order by array_position($1::text[], kind), builtin desc, name`, [TECHNIQUE_KINDS.map(k => k.id)])).rows;
    const photos = (await pool.query('select id, technique_id from lab_technique_photos order by created_at')).rows;
    return { techniques: rows.map(r => techShape(r, photos.filter(p => p.technique_id === r.id).map(p => p.id))), kinds: TECHNIQUE_KINDS, effects: EFFECTS, baseTechniques: GRAPHIC_TECHNIQUES, imageConnected: imageCfg().configured, samplesLeft: sampleCap() < 0 ? null : Math.max(0, sampleCap() - (samples.get(dayOf()) || 0)) };
  });
  app.post('/v1/lab/library/techniques', { preHandler: pre }, async (req, reply) => {
    await seeded; const b = req.body || {}, from = await technique(b.from);
    const base = from ? { name: `${from.name} (copy)`, kind: from.kind, summary: from.summary, base: from.base, finish: from.finish, rules: from.rules, prompt: from.prompt, artGuide: from.art_guide, factoryNote: from.factory_note } : {};
    const { technique: t, error } = cleanTechnique(from ? { ...base, ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'from')) } : b, base); if (error) return bad(reply, error);
    const r = (await pool.query(`insert into lab_techniques(kind,name,summary,base,finish,prompt,art_guide,factory_note,rules,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [t.kind, t.name, t.summary, t.base, t.finish, t.prompt, t.artGuide, t.factoryNote, t.rules, actorOf(req)])).rows[0];
    if (from) await pool.query(`insert into lab_technique_photos(technique_id,jpeg,thumb) select $2, jpeg, thumb from lab_technique_photos where technique_id=$1`, [from.id, r.id]);
    return reply.code(201).send({ id: r.id });
  });
  app.put('/v1/lab/library/techniques/:id', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const cur = await technique(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    const { technique: t, error } = cleanTechnique(req.body || {}, { name: cur.name, kind: cur.kind, summary: cur.summary, base: cur.base, finish: cur.finish, rules: cur.rules, prompt: cur.prompt, artGuide: cur.art_guide, factoryNote: cur.factory_note }); if (error) return bad(reply, error);
    await pool.query(`update lab_techniques set kind=$2,name=$3,summary=$4,base=$5,finish=$6,prompt=$7,art_guide=$8,factory_note=$9,rules=$10,updated_at=now() where id=$1`, [cur.id, t.kind, t.name, t.summary, t.base, t.finish, t.prompt, t.artGuide, t.factoryNote, t.rules]);
    return { ok: true };
  });
  app.delete('/v1/lab/library/techniques/:id', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const r = await pool.query('update lab_techniques set archived=true, updated_at=now() where id=$1 and not archived', [req.params.id]); if (!r.rowCount) return bad(reply, 'Not found', 404);
    return { ok: true };
  });
  app.post('/v1/lab/library/techniques/:id/photos', { preHandler: pre, bodyLimit: 16_000_000 }, async (req, reply) => {
    if (!need(req, reply)) return; const t = await technique(req.params.id); if (!t) return bad(reply, 'Not found', 404);
    if (Number((await pool.query('select count(*)::int n from lab_technique_photos where technique_id=$1', [t.id])).rows[0].n) >= 4) return bad(reply, 'A technique keeps up to 4 reference photos. Remove one first.', 409);
    const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send a photo');
    let jpeg, thumb; try { jpeg = await sharp(buf).rotate().flatten({ background: '#ffffff' }).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer(); thumb = await sharp(jpeg).resize({ width: 320, height: 320, fit: 'cover' }).jpeg({ quality: 72 }).toBuffer(); } catch { return bad(reply, 'The photo could not be read'); }
    const r = (await pool.query('insert into lab_technique_photos(technique_id,jpeg,thumb) values($1,$2,$3) returning id', [t.id, jpeg, thumb])).rows[0];
    return reply.code(201).send({ id: r.id });
  });
  app.delete('/v1/lab/library/techniques/:id/photos/:pid', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply) || !need(req, reply, 'pid')) return;
    const r = await pool.query('delete from lab_technique_photos where id=$1 and technique_id=$2', [req.params.pid, req.params.id]); if (!r.rowCount) return bad(reply, 'Not found', 404);
    return { ok: true };
  });
  app.get('/v1/lab/library/technique-photos/:pid', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply, 'pid')) return; const r = (await pool.query('select jpeg, thumb from lab_technique_photos where id=$1', [req.params.pid])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400, immutable').send(req.query?.thumb ? r.thumb : r.jpeg);
  });
  app.post('/v1/lab/library/techniques/:id/sample', { preHandler: pre, bodyLimit: 16_000_000 }, async (req, reply) => {
    if (!need(req, reply)) return; const t = await technique(req.params.id); if (!t) return bad(reply, 'Not found', 404);
    const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send the mock-up to make real');
    const cfg = imageCfg(); if (!cfg.configured) return bad(reply, 'No image model is connected', 503);
    const cap = sampleCap(); if (cap >= 0 && (samples.get(dayOf()) || 0) >= cap) return bad(reply, `The daily limit of ${cap} samples is reached. Raise LAB_DAILY_SAMPLES.`, 429);
    const photos = await photosOf(t.id), mock = await sharp(buf).png().toBuffer();
    let out; try { out = cfg.provider === 'fixture' ? await sharp(mock).modulate({ brightness: 1.05, saturation: 1.1 }).jpeg({ quality: 86 }).toBuffer() : await editImpl({ images: [mock, ...photos], prompt: realPrompt({ name: t.name, prompt: t.prompt, summary: t.summary }, { swatch: true, photos: photos.length }), cfg: { ...cfg, size: 'auto' } }); }
    catch (e) { return bad(reply, `The image model could not do it: ${clip(e.message, 200)}`, 502); }
    samples.set(dayOf(), (samples.get(dayOf()) || 0) + 1);
    const jpeg = await sharp(out).jpeg({ quality: 86 }).toBuffer();
    await pool.query('update lab_techniques set sample=$2, sample_at=now() where id=$1', [t.id, jpeg]);
    return { image: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
  });
  app.get('/v1/lab/library/techniques/:id/sample', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const r = (await pool.query('select sample, sample_at from lab_techniques where id=$1', [req.params.id])).rows[0]; if (!r?.sample) return bad(reply, 'No sample yet', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-cache').header('etag', `"${new Date(r.sample_at).getTime()}"`).send(r.sample);
  });

  // ---- using the library on a concept ----
  app.post('/v1/lab/concepts/:id/graphics', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const b = req.body || {};
    const c = (await pool.query('select id, status, spec, category from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    if (!UUID.test(String(b.art || ''))) return bad(reply, 'Choose a graphic from the library');
    const a = (await pool.query('select id, name, prompt, technique_id from lab_art where id=$1', [b.art])).rows[0]; if (!a) return bad(reply, 'That graphic is not in the library', 404);
    const t = await technique(b.techniqueId || a.technique_id), spec = ensureBranding(c.spec || {}, c.category);
    if (spec.graphics.length >= 4) return bad(reply, 'A concept carries up to 4 graphics. Remove one first.', 409);
    const placement = Object.keys(GRAPHIC_PLACE).includes(b.placement) ? b.placement : 'front chest';
    const g = { name: clip(a.name, 80) || 'Library graphic', kind: 'illustration', idea: clip(`From our graphics library.${t ? ` Made as ${t.name.toLowerCase()}: ${t.summary}` : ''}`, 300), placement, technique: t?.base || 'screen print', art: a.id, ...(t ? { finish: { id: t.id, name: t.name } } : {}) };
    spec.graphics = cleanGraphics([...spec.graphics, g]);
    await pool.query(`update lab_concepts set spec=$2, status=case when status='approved' then 'draft' else status end, updated_at=now() where id=$1`, [c.id, spec]);
    return { ok: true, graphics: spec.graphics.length, backToDraft: c.status === 'approved' };
  });
}
