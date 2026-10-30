// Design Lab studio: a concept's picture opened in a layered editor (src/lab-studio.html) to be finished by hand and with the image model: brush and eraser,
// type, shapes, the Future Basics marks and colours, the plan's graphics, recolouring and distressing, and AI edits of the whole piece or a painted area.
//   GET  /v1/lab/concepts/:id/studio            the concept, the saved design (layers), the brand marks and colours, the concept's graphics
//   GET  /v1/lab/concepts/:id/studio/plain      the picture before the logo and graphics were laid on (when it was kept)
//   POST /v1/lab/concepts/:id/studio/find-graphics {image}   where the graphics sit on the picture (a vision model measures; nothing is drawn), so the studio can paint the area for the AI
//   PUT  /v1/lab/concepts/:id/studio            save the design {doc}
//   POST /v1/lab/concepts/:id/studio/ai         {mode:'edit', image, mask?, prompt} redraw the piece (or only the painted area) · {mode:'art', prompt} a new graphic on a clear background
//   POST /v1/lab/concepts/:id/studio/apply      {image} the finished design becomes the concept's picture (the picture before the first one is kept)
//   POST /v1/lab/concepts/:id/studio/restore    put back the picture the concept had before the studio
// The same studio builds graphics for the library (src/lab-library.html → /lab/studio?new=graphic or ?art=<id>): a clear canvas, or a graphic to rework.
//   GET  /v1/lab/library/studio?art=<id>          the graphic (or nothing, for a new one), its saved layers, the marks, colours and techniques
//   PUT  /v1/lab/library/graphics/:id/studio      save the layers {doc}
//   POST /v1/lab/library/studio/ai                the same AI edits as above, for a graphic
//   POST /v1/lab/studio/vector {image, widthIn?} the layer traced to vector paths · POST /v1/lab/studio/embroidery {image, widthIn, format?} its stitch plan or .dst
//   POST /v1/lab/studio/check {image, widthIn, heightIn, techniqueId?, placement?}   a layer measured with the ruler: size against where it goes and how it is
//        made, the finest line and the colours at that size, and what it costs a piece        POST /v1/lab/studio/separations {image, techniqueId?, widthIn, garment?, zip?}
//        the colour separations: one plate per ink or thread with its Pantone, the coverage, and the job file to download
//   Fonts  GET /v1/lab/fonts   POST /v1/lab/fonts {name, file}   GET /v1/lab/fonts/:id/file   DELETE /v1/lab/fonts/:id   (uploaded once, set in type on every machine)
//   POST /v1/lab/library/studio/keep              {image, name?, doc?, techniqueId?} the finished picture becomes a new library graphic
//   POST /v1/lab/library/graphics/:id/studio/apply {image, doc?} the finished picture replaces this graphic's (pieces using it keep what they had)
import sharp from 'sharp';
import { imageConfig, openaiEdit, openaiImage } from './check.js';
import { locateMarks } from './lab-place.js';
import { artInfo, artFindings } from './lab-flats-routes.js';
import { sizeFindings, decorationCost, PLACEMENTS, calibrationOf } from './lab-decor.js';
import { traceVector, stitchPlan, dstOf, expOf, stitchPreview } from './lab-vector.js';
import { digitizeOptions } from './lab-digitize.js';
import { jobFile, jobZip } from './lab-jobfile.js';
import { cleanRules } from './lab-library.js';
import { GRAPHIC_PLACE } from './lab-concepts.js';
import { brandHits } from './lab-concepts.js';
import { logoSvg, COLORS } from './brand-kit.js';
import { finishArt } from './lab-art.js';
import { realPrompt } from './lab-library.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const LAYER_KINDS = new Set(['base', 'image', 'paint', 'text', 'shape']);
const MAX_DOC = 30_000_000, MAX_LAYERS = 80;
// where a layer's picture may come from: a picture inside the design itself, a graphic of the Lab, a part from the sketch pack's add-on sheets, or one
// of our marks; never an outside address
const SRC_OK = /^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|\/v1\/lab\/art\/[0-9a-f-]{36}|\/lab\/flat-parts\/[a-z0-9-]+\.webp|brand:(mark|word|lockup))$/i;

// → { doc } or { error }. The page draws the layers itself; this only keeps what it is sent within bounds.
export function cleanDoc(input) {
  const d = input && typeof input === 'object' ? input : null; if (!d) return { error: 'Nothing to save' };
  const w = Math.round(Number(d.w)), h = Math.round(Number(d.h));
  if (!(w >= 64 && w <= 4096 && h >= 64 && h <= 4096)) return { error: 'The design has no size' };
  if (!Array.isArray(d.layers) || !d.layers.length) return { error: 'The design has no layers' };
  if (d.layers.length > MAX_LAYERS) return { error: `A design can have up to ${MAX_LAYERS} layers` };
  for (const l of d.layers) {
    if (!l || typeof l !== 'object' || !LAYER_KINDS.has(l.kind)) return { error: 'A layer of an unknown kind' };
    for (const k of ['src', 'mask', 'distressMap']) if (l[k] != null && l[k] !== '' && !SRC_OK.test(String(l[k]))) return { error: 'A layer points at a picture outside the design' };
    if (l.text != null && String(l.text).length > 400) return { error: 'A line of type is too long (400 characters at most)' };
    if (l.paths != null) { // a drawn path: parts of points, each point six numbers
      if (!Array.isArray(l.paths) || l.paths.length > 400) return { error: 'A path has too many parts' };
      let n = 0; for (const p of l.paths) { if (!p || !Array.isArray(p.nodes)) return { error: 'A path is not readable' }; n += p.nodes.length; if (!p.nodes.every(q => Array.isArray(q) && q.length === 6 && q.every(Number.isFinite))) return { error: 'A path is not readable' }; }
      if (n > 40000) return { error: 'A path has too many points (40,000 at most)' };
    }
  }
  const ppi = Number(d.ppi), doc = { v: 1, w, h, layers: d.layers, selected: typeof d.selected === 'string' ? d.selected.slice(0, 40) : null, ...(ppi > 1 && ppi < 2000 ? { ppi: Math.round(ppi * 100) / 100, ppiSet: Boolean(d.ppiSet) } : {}),
    // the flats placements already brought onto the picture: a layer taken off the picture is not brought back
    ...(Array.isArray(d.linked) ? { linked: d.linked.filter(x => /^[a-z0-9-]{1,40}$/i.test(String(x))).slice(0, 60) } : {}) };
  if (JSON.stringify(doc).length > MAX_DOC) return { error: 'The design is too big to save (30 MB). Merge or delete some picture layers.' };
  return { doc };
}

const pictureOf = dataUrl => { const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || '')); return m ? Buffer.from(m[2], 'base64') : null; };
export const editPrompt = (prompt, { masked }) => [
  masked ? 'Edit only the transparent area of the mask in this product picture; everything outside it must stay exactly as it is, pixel for pixel.' : 'Edit this product picture.',
  `What to change: ${prompt}`,
  'Keep the garment\'s shape, the camera, the light and the background unless the change asks for them. Keep the Future Basics marks as they are unless the change is about them. Do not add any other company\'s name, logo or trade dress. Photorealistic.'
].join('\n');
export const artPrompt = prompt => `An original garment graphic, print-ready flat artwork isolated on a fully transparent background, nothing else in the picture: ${prompt}. Crisp edges, limited ink colours, no mock-up, no garment, no shadow. Do not use any other company's name, logo or trade dress.`;

async function fixtureEdit(img, mask) {
  const base = sharp(img).png(), meta = await sharp(img).metadata();
  const tinted = await sharp(img).removeAlpha().modulate({ hue: 90, saturation: 1.4 }).png().toBuffer();
  if (!mask) return tinted;
  // the fixture changes only where the mask is clear, like the real model is asked to
  const hole = await sharp(mask).resize(meta.width, meta.height).extractChannel('alpha').negate().toBuffer();
  const cut = await sharp(tinted).joinChannel(hole).png().toBuffer();
  return base.composite([{ input: cut }]).png().toBuffer();
}
const fixtureArt = prompt => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="300" fill="none" stroke="#141416" stroke-width="40"/><text x="512" y="540" font-family="sans-serif" font-size="70" text-anchor="middle" fill="#a02a20">${clip(prompt, 18).replace(/[<&>"]/g, '')}</text></svg>`)).png().toBuffer();

// a font file by its first bytes: TrueType, OpenType, WOFF, WOFF2; anything else is refused
export function fontInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const tag = buf.subarray(0, 4).toString('latin1');
  if (tag === 'OTTO') return { format: 'otf', mime: 'font/otf' };
  if (tag === 'wOFF') return { format: 'woff', mime: 'font/woff' };
  if (tag === 'wOF2') return { format: 'woff2', mime: 'font/woff2' };
  if (buf.readUInt32BE(0) === 0x00010000 || tag === 'true') return { format: 'ttf', mime: 'font/ttf' };
  return null;
}
export const FONT_MIME = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
export const fontShape = r => ({ id: r.id, name: r.name, family: r.family, format: r.format, createdAt: r.created_at });

export function registerLabStudioRoutes(app, d) {
  const { pool, authenticate, adminOnly, env = process.env, imageCfg = () => imageConfig(env), editImpl = openaiEdit, imageImpl = openaiImage, placeImpl = locateMarks, lab = null } = d;
  const own = req => lab?.scope?.(req) || null, charge = async (req, o) => (lab ? lab.charge(req, o) : null);
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const nameOf = async req => { const id = actorOf(req); if (!id) return 'Staff'; return (await pool.query(`select coalesce(nullif(name,''), split_part(email,'@',1)) n from users where id=$1`, [id])).rows[0]?.n || 'Staff'; };
  const note = async (id, req, body) => pool.query(`insert into lab_concept_comments(concept_id,user_id,name,body) values($1,$2,$3,$4)`, [id, actorOf(req), await nameOf(req), clip(body, 1000)]);
  const concept = async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404), null;
    const r = (await pool.query('select id, name, category, status, spec, plan_id, product_id, (raw is not null) has_plain, (image is not null) has_image from lab_concepts where id=$1', [req.params.id])).rows[0];
    if (!r) return bad(reply, 'Not found', 404), null; return r;
  };
  const fontList = async req => (await pool.query('select id, name, family, format, created_at from lab_fonts where ($1::uuid is null or client_id=$1) order by lower(name)', [own(req)])).rows.map(fontShape); // a room has only its own fonts; Future Basics staff see every font
  const uses = new Map(), dayOf = () => new Date().toISOString().slice(0, 10);
  const cap = () => Number(env.LAB_DAILY_STUDIO_AI ?? 60);
  const left = () => { const c = cap(); return c < 0 ? null : Math.max(0, c - (uses.get(dayOf()) || 0)); };

  app.get('/v1/lab/concepts/:id/studio', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    const s = (await pool.query(`select s.doc, s.updated_at, s.applied_at, (s.original is not null) has_original, coalesce(nullif(u.name,''), split_part(u.email,'@',1)) by_name from lab_studio_docs s left join users u on u.id=s.updated_by where s.concept_id=$1`, [c.id])).rows[0];
    const plan = c.plan_id ? (await pool.query('select name, program from lab_plans where id=$1', [c.plan_id])).rows[0] : null, program = plan?.program || null;
    const palette = [...COLORS.map(x => ({ name: x.name, hex: x.hex, from: 'brand' })), ...((program?.palette || []).map(x => ({ name: clip(x.name, 40), hex: x.hex, from: 'program' })))].filter(x => /^#[0-9a-f]{6}$/i.test(x.hex || ''));
    const cfg = imageCfg();
    return {
      concept: { id: c.id, name: c.name, category: c.category, status: c.status, hasImage: c.has_image, hasPlain: c.has_plain, locked: c.status === 'tech_pack', colors: c.spec?.colors || [], scratch: Boolean(c.spec?.scratch),
        planId: c.plan_id || null, planName: plan?.name || '', productId: c.product_id || null, productUrl: c.product_id ? `/tech-packs/${c.product_id}` : '' }, // for the piece's step bar
      doc: s?.doc || null, savedAt: s?.updated_at || null, savedBy: s?.by_name || '', appliedAt: s?.applied_at || null, canRestore: Boolean(s?.has_original),
      marks: [{ id: 'mark', label: 'Cue mark', svg: logoSvg('mark') }, { id: 'word', label: 'Wordmark', svg: logoSvg('word') }, { id: 'lockup', label: 'Wordmark and cue mark', svg: logoSvg('lockup') }],
      palette, graphics: (c.spec?.graphics || []).filter(g => g.art).map(g => ({ art: g.art, name: clip(g.name, 60) })), graphicNames: (c.spec?.graphics || []).map(g => clip(g.name, 60)).filter(Boolean),
      ai: { connected: cfg.configured, model: cfg.model || null, left: left() }, fonts: await fontList(req),
      techniques: (await pool.query(`select t.id, t.kind, t.name, t.summary, t.base, t.finish, t.rules, (select count(*)::int from lab_technique_photos p where p.technique_id=t.id) photos from lab_techniques t where not archived and ($1::uuid is null or t.client_id=$1 or (t.client_id is null and t.builtin)) order by kind, builtin desc, name`, [own(req)]).catch(() => ({ rows: [] }))).rows.map(t => ({ ...t, rules: cleanRules(t.rules || {}, t.base) })), placements: Object.entries(PLACEMENTS).map(([id, p]) => ({ id, label: p.label, w: p.w }))
    };
  });

  // ---- a layer measured: size and placement rules, the art at that size, the cost ----
  const techOf = async id => (UUID.test(String(id || '')) ? (await pool.query('select id, name, kind, base, finish, rules from lab_techniques where id=$1', [id])).rows[0] : null) || { id: null, name: 'Screen print', kind: 'print', base: 'screen print', finish: {}, rules: {} };
  app.post('/v1/lab/studio/check', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const b = req.body || {}, img = pictureOf(b.image); if (!img) return bad(reply, 'Send the layer as a picture');
    const w = Number(b.widthIn), h = Number(b.heightIn); if (!(w > 0 && w < 80 && h > 0 && h < 80)) return bad(reply, 'Measure the layer first: set the ruler');
    const t = await techOf(b.techniqueId), rules = { ...cleanRules(t.rules || {}, t.base), techniqueName: t.name }, placement = PLACEMENTS[b.placement] ? b.placement : null, name = clip(b.name, 60) || 'The graphic';
    const findings = sizeFindings({ widthIn: w, heightIn: h, placement, rules, base: t.base, techName: t.name, name });
    let info = null; try { info = await artInfo(img, w, h, rules); findings.push(...artFindings({ name, w, h }, info, rules, t)); } catch { /* the size alone */ }
    const quotes = async (col, v) => (await pool.query(`select actual_cents "actualCents", estimate_cents "estimateCents" from lab_decor_quotes where ${col}=$1 order by created_at desc limit 200`, [v]).catch(() => ({ rows: [] }))).rows;
    const calibration = (t.id && calibrationOf(await quotes('technique_id', t.id))) || calibrationOf(await quotes('base', t.base));
    const cost = decorationCost({ base: t.base, rules, widthIn: w, heightIn: h, colours: Math.max(1, info?.inks || 1), coverage: info?.coverage || .6, qty: Number(b.qty) || 300, calibration });
    return { technique: { id: t.id, name: t.name, base: t.base }, size: { widthIn: Math.round(w * 100) / 100, heightIn: Math.round(h * 100) / 100 }, placement, findings, inks: info?.inks ?? null, coverage: info?.coverage ?? null, cost, rules };
  });
  // ---- colour separations: the job file's plates for a layer ----
  app.post('/v1/lab/studio/separations', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const b = req.body || {}, img = pictureOf(b.image); if (!img) return bad(reply, 'Send the layer as a picture');
    const t = await techOf(b.techniqueId), w = Math.max(.5, Math.min(40, Number(b.widthIn) || 4)), garment = /^#[0-9a-f]{6}$/i.test(String(b.garment || '')) ? b.garment : '', name = clip(b.name, 60) || 'Graphic';
    const technique = { ...t, rules: cleanRules(t.rules || {}, t.base) };
    if (b.zip) { const z = await jobZip(img, { name, technique, widthIn: w, garmentColour: garment }); return reply.header('content-type', 'application/zip').header('content-disposition', `attachment; filename="${z.zipName}"`).send(z.zip); }
    const { job, files } = await jobFile(img, { name, technique, widthIn: w, garmentColour: garment });
    // each plate small enough to show: the ink in its colour on a clear background
    // each plate small enough to show: the ink as it prints, and its film (screened when the art has tones), on white
    const small = async (buf, px = 360) => `data:image/png;base64,${(await sharp(buf).resize({ width: px, height: px, fit: 'inside', kernel: 'mitchell' }).png().toBuffer()).toString('base64')}`;
    const plates = [];
    for (const col of job.colours) { const f = files.find(x => x.name === col.ink); if (!f) continue; const fm = col.film && files.find(x => x.name === col.film); plates.push({ n: col.n, pantone: col.pantone, hex: col.hex, coverage: col.coverage, angle: col.angle ?? null, image: await small(f.data), film: fm ? await small(fm.data) : null }); }
    const under = files.find(x => x.name === 'underbase.png');
    return { job: { name: job.name, technique: job.technique, size: job.size, coverage: job.coverage, tones: job.tones, knockouts: job.knockouts, colours: job.colours.map(c => ({ n: c.n, pantone: c.pantone, hex: c.hex, coverage: c.coverage, angle: c.angle ?? null })), warnings: job.warnings, print: job.print || null, embroidery: job.embroidery || null, transfer: job.transfer || null, patch: job.patch || null },
      plates, underbase: under ? await small(under.data) : null };
  });

  // ---- a layer as vector paths (for a screen printer) and as a stitch file (for an embroidery machine) ----
  app.post('/v1/lab/studio/vector', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const b = req.body || {}, img = pictureOf(b.image); if (!img) return bad(reply, 'Send the layer as a picture');
    const w = Number(b.widthIn), v = await traceVector(img, { widthIn: w > 0 && w < 80 ? w : null, name: clip(b.name, 60) || 'Graphic' });
    return { svg: v.svg, paths: v.paths, colours: v.colours, width: v.width, height: v.height };
  });
  // digitizing: the layer as a stitch file (src/lab-digitize.js), with the settings a digitiser changes; format dst | exp | zip (the whole job:
  // both files, the sew-out preview, the thread sequence and the sheet), else the preview and the numbers
  app.post('/v1/lab/studio/embroidery', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const b = req.body || {}, img = pictureOf(b.image); if (!img) return bad(reply, 'Send the layer as a picture');
    const w = Number(b.widthIn) || 4; if (!(w >= .5 && w <= 16)) return bad(reply, 'An embroidery runs from ½ in to 16 in wide');
    const name = clip(b.name, 60) || 'Graphic', garment = /^#[0-9a-f]{6}$/i.test(String(b.garment || '')) ? b.garment : '', opts = digitizeOptions(b);
    const file = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'graphic';
    if (b.format === 'zip') { const t = await techOf(b.techniqueId), tech = t.kind === 'embroidery' ? t : { id: null, name: 'Embroidery', kind: 'embroidery', base: 'embroidery', finish: {}, rules: {} }; const z = await jobZip(img, { name, technique: { ...tech, rules: { ...cleanRules(tech.rules || {}, tech.base), maxW: 16, maxH: 16 } }, widthIn: w, garmentColour: garment, digitizeOpts: opts }); return reply.header('content-type', 'application/zip').header('content-disposition', `attachment; filename="${file}-embroidery.zip"`).send(z.zip); }
    const p = await stitchPlan(img, { widthIn: w, garment, ...opts });
    if (b.format === 'dst') { const d = dstOf(p, name); return reply.header('content-type', 'application/octet-stream').header('content-disposition', `attachment; filename="${file}.dst"`).send(d.file); }
    if (b.format === 'exp') { const d = expOf(p); return reply.header('content-type', 'application/octet-stream').header('content-disposition', `attachment; filename="${file}.exp"`).send(d.file); }
    const preview = await sharp(Buffer.from(stitchPreview(p, { px: 900, garment: garment || '#ecebe6' }))).png().toBuffer();
    return { widthMm: p.widthMm, heightMm: p.heightMm, stitches: p.stitches, jumps: p.jumps, stats: p.stats, colours: p.colours, threads: p.threads.map((t, i) => ({ ...t, pantone: p.colours[i]?.pantone || '' })), objects: p.objects, warnings: p.warnings, knockouts: p.knockouts, settings: p.settings, preview: `data:image/png;base64,${preview.toString('base64')}` };
  });

  // ---- fonts ----
  app.get('/v1/lab/fonts', { preHandler: pre }, async req => ({ fonts: await fontList(req) }));
  app.post('/v1/lab/fonts', { preHandler: pre, bodyLimit: 12_000_000 }, async (req, reply) => {
    const b = req.body || {}, m = /^data:(?:[^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.file || '')); if (!m) return bad(reply, 'Send the font file');
    const buf = Buffer.from(m[1], 'base64'); if (buf.length > 8_000_000) return bad(reply, 'That font file is over 8 MB');
    const info = fontInfo(buf); if (!info) return bad(reply, 'That is not a font file we can use: TTF, OTF, WOFF or WOFF2');
    const name = clip(b.name, 80).replace(/\.(ttf|otf|woff2?)$/i, ''); if (name.length < 2) return bad(reply, 'Give the font a name');
    if ((await pool.query('select 1 from lab_fonts where lower(name)=lower($1) and client_id is not distinct from $2', [name, own(req)])).rowCount) return bad(reply, 'A font with that name is already here', 409);
    const r = (await pool.query(`insert into lab_fonts(name, family, format, bytes, created_by, client_id) values($1, $2, $3, $4, $5, $6) returning id, name, family, format, created_at`, [name, 'fb-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), info.format, buf, actorOf(req), own(req)])).rows[0];
    return reply.code(201).send({ font: fontShape(r) });
  });
  app.get('/v1/lab/fonts/:id/file', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select format, bytes from lab_fonts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    return reply.header('content-type', FONT_MIME[r.format] || 'application/octet-stream').header('cache-control', 'private, max-age=86400').send(r.bytes);
  });
  app.delete('/v1/lab/fonts/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const r = await pool.query('delete from lab_fonts where id=$1', [req.params.id]); return r.rowCount ? { ok: true } : bad(reply, 'Not found', 404);
  });

  app.get('/v1/lab/concepts/:id/studio/plain', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select raw from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r?.raw) return bad(reply, 'No plain picture was kept for this concept', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-cache').send(r.raw);
  });

  // Where the graphics are on the picture as it is now: for "Remove the graphic", which paints the area for the AI from this.
  // The concept's own graphics are asked for by placement; with none on the words, the model is asked for any printed graphic it can see.
  app.post('/v1/lab/concepts/:id/studio/find-graphics', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    const img = pictureOf(req.body?.image); if (!img) return bad(reply, 'Send the picture to look at');
    const gfx = (c.spec?.graphics || []).filter(g => g.placement);
    const asks = gfx.length ? gfx.map((g, i) => ({ id: `g${i}`, name: clip(g.name, 60) || 'Graphic', where: `the printed or embroidered graphic "${clip(g.name, 60)}": ${g.placement}`, w: GRAPHIC_PLACE[g.placement]?.w || 0.3 }))
      : [{ id: 'g0', name: 'The graphic', where: 'the main printed or embroidered graphic on the piece (not the small Future Basics logo, not the inset label card)', w: 0.3 }];
    if (env.AI_FIXTURE) return { found: asks.map(a => ({ id: a.id, name: a.name, x: 0.5, y: 0.42, w: a.w, angle: 0 })), model: 'fixture' };
    if (!env.ANTHROPIC_API_KEY) return { found: [], note: 'The vision model is not connected (no Anthropic key): paint over the graphic by hand.' };
    const jpeg = await sharp(img).jpeg({ quality: 85 }).toBuffer().catch(() => null); if (!jpeg) return bad(reply, 'The picture could not be read');
    const res = await placeImpl({ image: jpeg, category: c.category, marks: asks, env });
    const found = asks.filter(a => res?.get?.(a.id)).map(a => ({ id: a.id, name: a.name, ...res.get(a.id) }));
    return { found, hidden: asks.filter(a => res?.hidden?.has(a.id)).map(a => a.name), note: found.length ? '' : 'The graphic could not be found on its own: paint over it by hand.' };
  });

  app.put('/v1/lab/concepts/:id/studio', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const { doc, error } = cleanDoc(req.body?.doc); if (error) return bad(reply, error);
    const r = (await pool.query(`insert into lab_studio_docs(concept_id, doc, updated_by) values($1,$2,$3) on conflict(concept_id) do update set doc=excluded.doc, updated_by=excluded.updated_by, updated_at=now() returning updated_at`, [c.id, doc, actorOf(req)])).rows[0];
    return { ok: true, savedAt: r.updated_at };
  });

  // the AI edits, for a concept's design or a library graphic: redraw the piece (or only the painted area), make a graphic, or make a technique real
  async function runAi(req, reply, { conceptId = null } = {}) {
    const b = req.body || {}, mode = ['art', 'real'].includes(b.mode) ? b.mode : 'edit', prompt = clip(b.prompt, 800);
    const tech = UUID.test(String(b.techniqueId || '')) ? (await pool.query('select id, name, summary, prompt, art_guide from lab_techniques where id=$1 and not archived and ($2::uuid is null or client_id=$2 or (client_id is null and builtin))', [b.techniqueId, own(req)])).rows[0] : null;
    if (mode === 'real' && !tech) return bad(reply, 'Choose the technique to make real');
    if (mode !== 'real' && prompt.length < 3) return bad(reply, mode === 'art' ? 'Say what the graphic should be' : 'Say what to change');
    const hits = brandHits(prompt, (await pool.query('select name from lab_brands')).rows.map(r => r.name));
    if (hits.length) return bad(reply, `Leave other brands out of the prompt (${hits.slice(0, 3).join(', ')}). Describe the look in your own words.`);
    const cfg = imageCfg(); if (!cfg.configured) return bad(reply, 'No image model is connected', 503);
    try { await charge(req, { kind: 'studio', conceptId }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    if (left() === 0) return bad(reply, `The daily limit of ${cap()} studio AI edits is reached. Raise LAB_DAILY_STUDIO_AI.`, 429);
    let out;
    try {
      if (mode === 'art') out = cfg.provider === 'fixture' ? await fixtureArt(prompt) : await imageImpl(artPrompt(tech?.art_guide ? `${prompt}. Designed for ${tech.name.toLowerCase()}: ${tech.art_guide}` : prompt), { ...cfg, size: '1024x1024', format: 'png', background: 'transparent' });
      else {
        const img = pictureOf(b.image); if (!img) return bad(reply, 'Send the picture to change');
        const mask = b.mask ? pictureOf(b.mask) : null; if (b.mask && !mask) return bad(reply, 'The painted area could not be read');
        const meta = await sharp(img).metadata().catch(() => null); if (!meta?.width) return bad(reply, 'The picture could not be read');
        // the model takes the picture and the mask at the same size: the mask is fitted to the picture, and goes as PNG with its transparency
        const png = await sharp(img).png().toBuffer(), m = mask ? await sharp(mask).resize(meta.width, meta.height, { fit: 'fill' }).ensureAlpha().png().toBuffer() : null;
        // making a technique real: its reference photos go in after the piece, so the model sees the real thread, ink or film
        const refs = mode === 'real' ? (await pool.query('select jpeg from lab_technique_photos where technique_id=$1 order by created_at limit 3', [tech.id])).rows.map(r => r.jpeg) : [];
        const words = mode === 'real' ? realPrompt(tech, { masked: Boolean(m), photos: refs.length }) + (prompt ? `\nAlso: ${prompt}` : '') : editPrompt(prompt, { masked: Boolean(m) });
        out = cfg.provider === 'fixture' ? await fixtureEdit(png, m) : await editImpl({ images: [png, ...refs], mask: m, prompt: words, cfg: { ...cfg, size: 'auto' } });
        // the answer is brought back to the picture's own size, so it lands exactly over it
        out = await sharp(out).resize(meta.width, meta.height, { fit: 'fill' }).png().toBuffer();
      }
    } catch (e) { return bad(reply, `The image model could not do it: ${clip(e.message, 200)}`, 502); }
    uses.set(dayOf(), (uses.get(dayOf()) || 0) + 1);
    let artId = null;
    if (mode === 'art') {
      // a graphic made in the studio goes into the graphics library too, so it can be used on other pieces later
      const a = await finishArt(await sharp(out).png().toBuffer());
      artId = (await pool.query(`insert into lab_art(name,png,thumb,prompt,model,source,technique_id,concept_id,created_by) values($1,$2,$3,$4,$5,'studio',$6,$7,$8) returning id`, [clip(prompt, 80), a.png, a.thumb, prompt, cfg.model || cfg.provider, tech?.id || null, conceptId, actorOf(req)])).rows[0].id;
      out = a.png;
    }
    return { image: `data:image/png;base64,${out.toString('base64')}`, mode, left: left(), art: artId };
  }
  app.post('/v1/lab/concepts/:id/studio/ai', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    return runAi(req, reply, { conceptId: c.id });
  });

  app.post('/v1/lab/concepts/:id/studio/apply', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send the finished picture');
    let image, thumb; try {
      image = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      thumb = await sharp(image).resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    } catch { return bad(reply, 'The picture could not be read'); }
    const client = await pool.connect();
    try {
      await client.query('begin');
      // the picture the concept had before the studio is kept once, so it can always be put back
      await client.query(`insert into lab_studio_docs(concept_id, doc, original, applied_at, updated_by) select id, '{}'::jsonb, image, now(), $2 from lab_concepts where id=$1
        on conflict(concept_id) do update set original=coalesce(lab_studio_docs.original, (select image from lab_concepts where id=$1)), applied_at=now()`, [c.id, actorOf(req)]);
      const back = c.status === 'approved';
      await client.query(`update lab_concepts set image=$2, thumb=$3, raw=null, image_note='', status=$4, override_reason=case when $5 then '' else override_reason end, updated_at=now() where id=$1`, [c.id, image, thumb, back ? 'draft' : c.status, back]);
      await client.query('delete from lab_concept_views where concept_id=$1', [c.id]); // the flats and the on-model views were drawn from the old picture
      await keepVersion(client, c.id, { image, thumb, doc: req.body?.doc, note: clip(req.body?.note, 160) || 'Used as the concept picture', applied: true, by: actorOf(req) });
      await client.query('commit');
      await note(c.id, req, back ? 'Picture finished in the studio. It was approved, so it is back to draft to be approved again.' : 'Picture finished in the studio.');
      return { ok: true, status: back ? 'draft' : c.status };
    } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
  });

  // ---- versions: every picture applied, and any the team asks to keep, so two can be put side by side ----
  const keepVersion = async (q, conceptId, { image, thumb, doc, note = '', applied = false, by = null }) => {
    const n = Number((await q.query('select coalesce(max(n),0)+1 n from lab_studio_versions where concept_id=$1', [conceptId])).rows[0].n);
    await q.query(`insert into lab_studio_versions(concept_id, n, doc, jpeg, thumb, note, applied, created_by) values($1,$2,$3,$4,$5,$6,$7,$8)`, [conceptId, n, (doc && typeof doc === 'object' && cleanDoc(doc).doc) || {}, image, thumb, note, applied, by]);
    await q.query('delete from lab_studio_versions where concept_id=$1 and n <= (select max(n) from lab_studio_versions where concept_id=$1) - 40', [conceptId]); // the last forty
    return n;
  };
  app.get('/v1/lab/concepts/:id/studio/versions', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    const rows = (await pool.query(`select v.n, v.note, v.applied, v.created_at, (v.doc->'layers') is not null layered, coalesce(nullif(u.name,''), split_part(u.email,'@',1)) by_name from lab_studio_versions v left join users u on u.id=v.created_by where v.concept_id=$1 order by v.n desc`, [c.id])).rows;
    return { versions: rows.map(r => ({ n: r.n, note: r.note, applied: r.applied, at: r.created_at, by: r.by_name || '', hasLayers: Boolean(r.layered) })) };
  });
  app.post('/v1/lab/concepts/:id/studio/versions', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send the picture to keep');
    let image, thumb; try { image = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(); thumb = await sharp(image).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 72 }).toBuffer(); } catch { return bad(reply, 'The picture could not be read'); }
    const n = await keepVersion(pool, c.id, { image, thumb, doc: req.body?.doc, note: clip(req.body?.note, 160) || 'Kept from the studio', by: actorOf(req) });
    return reply.code(201).send({ n });
  });
  app.get('/v1/lab/concepts/:id/studio/versions/:n', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return; const n = Number(req.params.n); if (!Number.isInteger(n)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select doc, note, applied, created_at from lab_studio_versions where concept_id=$1 and n=$2', [c.id, n])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    return { n, doc: r.doc && Array.isArray(r.doc.layers) && r.doc.layers.length ? r.doc : null, note: r.note, applied: r.applied, at: r.created_at };
  });
  app.get('/v1/lab/concepts/:id/studio/versions/:n/image', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return; const n = Number(req.params.n); if (!Number.isInteger(n)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select jpeg, thumb from lab_studio_versions where concept_id=$1 and n=$2', [c.id, n])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=86400, immutable').send(req.query?.thumb ? r.thumb : r.jpeg);
  });

  app.post('/v1/lab/concepts/:id/studio/restore', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const s = (await pool.query('select original from lab_studio_docs where concept_id=$1', [c.id])).rows[0]; if (!s?.original) return bad(reply, 'The picture has not been changed in the studio', 409);
    const thumb = await sharp(s.original).resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    await pool.query(`update lab_concepts set image=$2, thumb=$3, updated_at=now() where id=$1`, [c.id, s.original, thumb]);
    await pool.query(`update lab_studio_docs set original=null, applied_at=null where concept_id=$1`, [c.id]);
    await pool.query('delete from lab_concept_views where concept_id=$1', [c.id]);
    await note(c.id, req, 'The picture from before the studio was put back.');
    return { ok: true };
  });

  // ---- the studio for the graphics library: build a graphic from nothing, or rework one ----
  // a graphic by id: a room opens only its own (the ?art= query is not under the gate's own check)
  const graphic = async (id, req = null) => (UUID.test(String(id || '')) ? (await pool.query('select id, name, tags, technique_id, doc, (png is not null) has_image from lab_art where id=$1 and ($2::uuid is null or client_id=$2)', [id, req ? own(req) : null])).rows[0] || null : null);
  const common = async req => {
    const cfg = imageCfg();
    return {
      marks: [{ id: 'mark', label: 'Cue mark', svg: logoSvg('mark') }, { id: 'word', label: 'Wordmark', svg: logoSvg('word') }, { id: 'lockup', label: 'Wordmark and cue mark', svg: logoSvg('lockup') }],
      palette: COLORS.map(x => ({ name: x.name, hex: x.hex, from: 'brand' })).filter(x => /^#[0-9a-f]{6}$/i.test(x.hex || '')),
      ai: { connected: cfg.configured, model: cfg.model || null, left: left() }, fonts: await fontList(req),
      techniques: (await pool.query(`select t.id, t.kind, t.name, t.summary, t.base, t.finish, t.rules, (select count(*)::int from lab_technique_photos p where p.technique_id=t.id) photos from lab_techniques t where not archived and ($1::uuid is null or t.client_id=$1 or (t.client_id is null and t.builtin)) order by kind, builtin desc, name`, [own(req)]).catch(() => ({ rows: [] }))).rows.map(t => ({ ...t, rules: cleanRules(t.rules || {}, t.base) })), placements: Object.entries(PLACEMENTS).map(([id, p]) => ({ id, label: p.label, w: p.w }))
    };
  };
  app.get('/v1/lab/library/studio', { preHandler: pre }, async (req, reply) => {
    const id = String(req.query?.art || ''); const g = id ? await graphic(id, req) : null; if (id && !g) return bad(reply, 'That graphic is not in the library', 404);
    return { graphic: g ? { id: g.id, name: g.name, tags: g.tags, techniqueId: g.technique_id, hasImage: g.has_image } : null, doc: g?.doc || null, savedAt: null, savedBy: '', appliedAt: null, canRestore: false, graphics: [], ...(await common(req)) };
  });
  app.put('/v1/lab/library/graphics/:id/studio', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const g = await graphic(req.params.id); if (!g) return bad(reply, 'Not found', 404);
    const { doc, error } = cleanDoc(req.body?.doc); if (error) return bad(reply, error);
    const r = (await pool.query('update lab_art set doc=$2 where id=$1 returning now() as at', [g.id, doc])).rows[0];
    return { ok: true, savedAt: r.at };
  });
  app.post('/v1/lab/library/studio/ai', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => runAi(req, reply));
  // the finished graphic: as a new one in the library, or in place of the one it started from
  const finished = async body => { const buf = pictureOf(body?.image); if (!buf) throw new Error('Send the finished picture'); try { return await finishArt(await sharp(buf).ensureAlpha().png().toBuffer()); } catch { throw new Error('The picture could not be read'); } };
  app.post('/v1/lab/library/studio/keep', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const b = req.body || {}; let a; try { a = await finished(b); } catch (e) { return bad(reply, e.message); }
    const doc = b.doc ? cleanDoc(b.doc).doc || null : null, tech = UUID.test(String(b.techniqueId || '')) ? b.techniqueId : null;
    const r = (await pool.query(`insert into lab_art(name,png,thumb,prompt,model,source,tags,technique_id,doc,created_by) values($1,$2,$3,'','studio','studio',$4,$5,$6,$7) returning id`,
      [clip(b.name, 120) || 'Graphic', a.png, a.thumb, (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map(t => clip(t, 30).toLowerCase()).filter(Boolean).slice(0, 12), tech, doc, actorOf(req)])).rows[0];
    return reply.code(201).send({ id: r.id });
  });
  app.post('/v1/lab/library/graphics/:id/studio/apply', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const g = await graphic(req.params.id); if (!g) return bad(reply, 'Not found', 404);
    const b = req.body || {}; let a; try { a = await finished(b); } catch (e) { return bad(reply, e.message); }
    const doc = b.doc ? cleanDoc(b.doc).doc || g.doc : g.doc;
    await pool.query('update lab_art set png=$2, thumb=$3, doc=$4, in_library=true where id=$1', [g.id, a.png, a.thumb, doc]);
    return { ok: true, id: g.id };
  });
}
