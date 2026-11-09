// The Design Lab assortment board (the Lab module): every concept as a flat and on a model, a spin through the on-model views and, with a video model, a walk.
//   GET  /v1/lab/assortment?plan=&status=             the board: concepts (not rejected unless asked) with which views each has, and what is connected
//   POST /v1/lab/assortment/views {plan?, ids?}        make the missing views for many concepts (they are drawn one concept after another in the background)
//   POST /v1/lab/concepts/:id/views {kinds?, redo?}    make views for one concept      GET /v1/lab/concepts/:id/views   which exist and how they are getting on
//   GET  /v1/lab/concepts/:id/views/:kind[?thumb=1]    the picture (or the walk video); needs the sign-in header, so the page fetches it
//   POST /v1/lab/concepts/:id/walk                     make the walk from the front on-model view (video model)
import { imageConfig, openaiEdit } from './check.js';
import { categoryLabel } from './lab.js';
import { ensureBranding } from './lab-concepts.js';
import { cleanColourways } from './lab-materials.js';
import { VIEW_KINDS, KIND_IDS, SPIN_KINDS, isKind, kindsFor, canWalk, makeViews, makeWalk, videoConfig } from './lab-views.js';
import { callJsonSchema } from './studio.js';
import sharp from 'sharp';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const STALE_MIN = 20; // a view still "pending" after this long was lost to a restart: it shows as failed and can be made again

export function registerLabViewRoutes(app, d) {
  const { flatPictures = null, pool, authenticate, adminOnly, env = process.env, imageCfg = () => imageConfig(env), videoCfg = () => videoConfig(env), fetchImpl = fetch, edit, lab = null, log = console, lookImpl = callJsonSchema } = d;
  const own = req => lab?.scope?.(req) || null, charge = async (req, o) => (lab ? lab.charge(req, o) : null); // a client's room: its own concepts, its AI meter
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const running = new Set(), queue = []; let working = false, idleWaiters = [];

  // ---- the background worker: one concept at a time, so the image model is not hit with a dozen requests at once ----
  async function pump() {
    if (working) return; working = true;
    try { while (queue.length) { const job = queue.shift(); try { await job.run(); } catch (e) { log.warn?.({ err: e.message }, 'design lab view job failed'); } running.delete(job.key); } }
    finally { working = false; const w = idleWaiters; idleWaiters = []; w.forEach(f => f()); }
  }
  const enqueue = (key, run) => { if (running.has(key)) return false; running.add(key); queue.push({ key, run }); setImmediate(pump); return true; };
  const idle = () => (working || queue.length ? new Promise(r => idleWaiters.push(r)) : Promise.resolve());

  const dayCount = async (kindsSql) => Number((await pool.query(`select count(*)::int n from lab_concept_views where created_at > now() - interval '24 hours' and ${kindsSql}`)).rows[0].n);
  const imageCapLeft = async n => { const cap = Number(env.LAB_DAILY_VIEWS ?? 80); if (cap < 0) return true; return (await dayCount(`kind <> 'walk'`)) + n <= cap ? true : cap; };

  async function summary(id) {
    const rows = (await pool.query(`select kind, status, note, model, (image is not null or video is not null) has, updated_at, (updated_at < now() - make_interval(mins => $2)) stale from lab_concept_views where concept_id=$1`, [id, STALE_MIN])).rows;
    return Object.fromEntries(rows.map(r => [r.kind, { status: r.status === 'pending' && r.stale && !running.has(`${id}`) && !running.has(`${id}:walk`) ? 'failed' : r.status, note: r.status === 'pending' && r.stale ? 'Lost to a restart: make it again.' : r.note, has: r.has, model: r.model, at: r.updated_at }]));
  }

  // a finished turn read by the vision model: which of the graphics it should show are not on it (none known without a model to read it)
  const jpg = async b => (await sharp(b).resize({ width: 1000, height: 1000, fit: 'inside' }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer()).toString('base64');
  const look = env.ANTHROPIC_API_KEY && !env.AI_FIXTURE ? async ({ image, kind, graphics }) => {
    const img = data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    const content = [img(await jpg(image)), { type: 'text', text: `The first image is a photograph of a garment on a model (${kind.replace('model_', '').replace('34', 'three-quarter')} view). The images after it are the graphics that must be on it:` }];
    for (const [i, g] of graphics.entries()) content.push({ type: 'text', text: `${i + 1}. ${g.words}` }, img(await jpg(g.art)));
    content.push({ type: 'text', text: 'For each graphic, is it on the garment in the photograph, recognisably the same artwork in about the right place? A blank area, a different or garbled graphic, or a plain patch counts as missing.' });
    const out = await lookImpl('You are a garment QC inspector checking a photograph against its artwork. Be strict: a graphic is present only if it is clearly the same artwork.', content,
      { type: 'object', additionalProperties: false, required: ['graphics'], properties: { graphics: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'present'], properties: { n: { type: 'integer' }, present: { type: 'boolean' } } } } } }, { maxTokens: 400 });
    return { missing: graphics.filter((g, i) => (out?.graphics || []).some(x => x.n === i + 1 && x.present === false)).map(g => g.name) };
  } : null;
  // start views for one concept: mark them pending, draw in the background, land each as it is done
  async function startViews(c, kinds, { redo = false, flats = null } = {}) {
    const have = Object.fromEntries((await pool.query(`select kind, image from lab_concept_views where concept_id=$1 and status='ready' and image is not null`, [c.id])).rows.map(r => [r.kind, r.image]));
    const todo = kinds.filter(k => redo || !have[k]); if (!todo.length) return 0;
    for (const k of todo) await pool.query(`insert into lab_concept_views(concept_id,kind,status,note) values($1,$2,'pending','') on conflict (concept_id,kind) do update set status='pending', note='', updated_at=now()`, [c.id, k]);
    const picture = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image;
    const concept = { name: c.name, category: c.category, twist: c.twist, spec: ensureBranding(c.spec || {}, c.category) }, cfg = imageCfg();
    const ok = enqueue(`${c.id}`, async () => {
      // the placed graphics come from the saved flats whichever way the turns are drawn, so a turn drawn from the picture keeps the back graphic too
      const graphics = flats?.graphics || (todo.some(k => k.startsWith('model')) && flatPictures ? (await flatPictures(c.id).catch(() => null))?.graphics || [] : []);
      await makeViews({ concept, picture, flats, graphics, look, kinds: todo, have: redo ? Object.fromEntries(Object.entries(have).filter(([k]) => !todo.includes(k))) : have, cfg, edit,
        onView: async (kind, r, note) => {
          if (r) await pool.query(`update lab_concept_views set status='ready', image=$3, thumb=$4, model=$5, note=$6, updated_at=now() where concept_id=$1 and kind=$2`, [c.id, kind, r.image, r.thumb, r.model || '', note || '']);
          else await pool.query(`update lab_concept_views set status='failed', note=$3, updated_at=now() where concept_id=$1 and kind=$2`, [c.id, kind, note]);
        } });
      // anything the run never reached (a model view whose front failed) is not left pending
      await pool.query(`update lab_concept_views set status='failed', note='The front view on the model could not be drawn, so this one was skipped.', updated_at=now() where concept_id=$1 and status='pending' and kind <> 'walk'`, [c.id]);
    });
    return ok ? todo.length : 0;
  }

  const SELECT = `select c.id, c.name, c.category, c.role, c.status, c.price_cents, c.twist, c.spec, c.closeness, c.plan_id, p.name plan_name, (c.image is not null) has_picture, (c.thumb is not null) has_thumb from lab_concepts c left join lab_plans p on p.id=c.plan_id`;
  const concept = async id => (await pool.query(`${SELECT} where c.id=$1`, [id])).rows[0];

  app.get('/v1/lab/assortment', { preHandler: pre }, async req => {
    const q = req.query || {}, where = [], args = [];
    if (UUID.test(String(q.plan || ''))) { args.push(q.plan); where.push(`c.plan_id=$${args.length}`); }
    if (q.status === 'approved') where.push(`c.status in ('approved','tech_pack')`); else if (q.status !== 'all') where.push(`c.status <> 'rejected'`);
    if (own(req)) { args.push(own(req)); where.push(`c.client_id=$${args.length}`); }
    const rows = (await pool.query(`${SELECT} ${where.length ? 'where ' + where.join(' and ') : ''} order by c.category, c.role, c.created_at desc limit 150`, args)).rows;
    const vs = new Map(); for (const r of (await pool.query(`select concept_id, kind, status, note, (updated_at < now() - make_interval(mins => $2)) stale from lab_concept_views where concept_id = any($1::uuid[])`, [rows.map(r => r.id), STALE_MIN])).rows) { if (!vs.has(r.concept_id)) vs.set(r.concept_id, {}); vs.get(r.concept_id)[r.kind] = { status: r.status === 'pending' && r.stale && !running.has(r.concept_id) ? 'failed' : r.status, note: r.note }; }
    const plans = (await pool.query(`select id, name from lab_plans where ($1::uuid is null or client_id=$1) order by created_at desc limit 40`, [own(req)])).rows;
    const vid = videoCfg(), img = imageCfg();
    return {
      concepts: rows.map(r => ({ id: r.id, colourways: cleanColourways(r.spec?.colourways), materials: Array.isArray(r.spec?.materials) ? r.spec.materials.length : 0, name: r.name, category: r.category, categoryLabel: categoryLabel(r.category), role: r.role, status: r.status, price: r.price_cents == null ? null : r.price_cents / 100, twist: r.twist, planId: r.plan_id, planName: r.plan_name || '', closeness: r.closeness?.verdict || null, hasPicture: r.has_picture, views: vs.get(r.id) || {}, kinds: kindsFor(r.category), canWalk: canWalk(r.category) })),
      plans, kinds: VIEW_KINDS, spin: SPIN_KINDS, imageConnected: img.configured, imageNote: img.note || '', videoConnected: vid.configured, videoNote: vid.note || '', busy: running.size,
      limits: { images: Number(env.LAB_DAILY_VIEWS ?? 80), walks: Number(env.LAB_DAILY_WALKS ?? 6) }
    };
  });

  app.get('/v1/lab/concepts/:id/views', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return { views: await summary(req.params.id), video: videoCfg().configured, busy: running.has(req.params.id) || running.has(`${req.params.id}:walk`) }; });

  app.get('/v1/lab/concepts/:id/views/:kind', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const kind = req.params.kind;
    if (kind === 'picture') { const r = (await pool.query('select image, thumb, updated_at from lab_concepts where id=$1', [req.params.id])).rows[0]; const b = req.query?.thumb ? r?.thumb : r?.image; if (!b) return bad(reply, 'No picture', 404); const tag = `"${new Date(r.updated_at).getTime()}${req.query?.thumb ? 't' : ''}"`; if (req.headers['if-none-match'] === tag) return reply.code(304).header('etag', tag).send(); return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-cache').header('etag', tag).send(b); }
    if (kind !== 'walk' && !isKind(kind)) return bad(reply, 'Not found', 404);
    const r = (await pool.query(`select image, thumb, video, mime, updated_at from lab_concept_views where concept_id=$1 and kind=$2 and status='ready'`, [req.params.id, kind])).rows[0];
    const tag = r ? `"${new Date(r.updated_at).getTime()}${req.query?.thumb ? 't' : ''}"` : '', fresh = () => (req.headers['if-none-match'] === tag ? reply.code(304).header('etag', tag).send() : null); // revalidated, so a view drawn again replaces the browser's old copy
    if (kind === 'walk') { if (!r?.video) return bad(reply, 'No walk yet', 404); return fresh() || reply.header('content-type', r.mime || 'video/mp4').header('cache-control', 'private, no-cache').header('etag', tag).send(r.video); }
    const b = req.query?.thumb ? r?.thumb : r?.image; if (!b) return bad(reply, 'Not made yet', 404);
    return fresh() || reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-cache').header('etag', tag).send(b);
  });

  app.post('/v1/lab/concepts/:id/views', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (!c.has_picture && req.body?.from !== 'flats') return bad(reply, 'This concept has no picture to draw the views from. Draw its picture first.', 409); // the turns from the flats need only the flats
    if (!imageCfg().configured) return bad(reply, 'No image model is connected, so the views cannot be drawn.', 503);
    const asked = Array.isArray(req.body?.kinds) ? req.body.kinds.filter(isKind) : KIND_IDS, kinds = asked.filter(k => kindsFor(c.category).includes(k));
    if (!kinds.length) return bad(reply, 'Nothing to make for this kind of piece.');
    // from: 'flats' draws the turns from the saved technical flats (front and back) instead of from the picture alone
    let flats = null;
    if (req.body?.from === 'flats') {
      if (!kinds.some(k => k.startsWith('model'))) return bad(reply, 'Only the turns on a model are drawn from the flats.');
      flats = flatPictures ? await flatPictures(c.id).catch(e => { log.warn?.({ err: e.message }, 'flats as pictures failed'); return null; }) : null;
      if (!flats?.front) return bad(reply, 'Save the flats first: the turns are drawn from them.', 409);
    }
    const left = await imageCapLeft(kinds.length); if (left !== true) return bad(reply, `The daily limit of ${left} views is reached. Raise LAB_DAILY_VIEWS.`, 429);
    try { await charge(req, { kind: 'view', units: kinds.length, conceptId: c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    const n = await startViews(c, kinds, { redo: Boolean(req.body?.redo) || Boolean(flats), flats });
    return reply.code(202).send({ started: n, views: await summary(c.id) });
  });

  // ---- a turn edited by hand (the board's turn viewer) ----
  // the graphics placed on the piece's flats, as art on clear, to put on a turn: [{ id, name, view, technique, aspect, png (data URL) }]
  app.get('/v1/lab/concepts/:id/turn-graphics', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const f = flatPictures ? await flatPictures(c.id).catch(() => null) : null;
    const list = await Promise.all((f?.placed || []).map(async g => ({ id: g.id, name: g.name, view: g.view, technique: g.technique, aspect: g.aspect, png: `data:image/png;base64,${(await sharp(g.png).resize({ width: 400, height: 400, fit: 'inside' }).png().toBuffer()).toString('base64')}` })));
    return { graphics: list, details: (f?.details || []).map(({ view, name, color }) => ({ view, name, color })) };
  });
  // { graphics: [{ id, x, y, w, rot }] (centre and width as fractions of the picture, the turn in degrees), mask: PNG data URL (painted = change
  // it), prompt, blend (default true) }: the graphics are set on the turn where they were put, then the image model works them into the cloth
  // (printed or stitched, following its folds and light) and changes the painted area as asked; everything else is kept. One AI generation.
  // With blend false and no painted area, the graphics are only set on (no model, no charge). The turn as it was is kept for one undo.
  app.post('/v1/lab/concepts/:id/views/:kind/edit', { preHandler: pre, bodyLimit: 8_000_000 }, async (req, reply) => {
    if (!needId(req, reply)) return; const kind = req.params.kind; if (!isKind(kind) || !kind.startsWith('model')) return bad(reply, 'Only a turn on a model is edited here', 404);
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (c.status === 'tech_pack' && !c.product_id) return bad(reply, 'This concept is already a tech pack', 409);
    const row = (await pool.query(`select image from lab_concept_views where concept_id=$1 and kind=$2 and status='ready'`, [c.id, kind])).rows[0]; if (!row?.image) return bad(reply, 'This turn is not drawn yet', 409);
    const b = req.body || {}, prompt = String(b.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 600), want = Array.isArray(b.graphics) ? b.graphics.slice(0, 6) : [];
    const fr = (v, lo, hi) => Number.isFinite(Number(v)) ? Math.min(Math.max(Number(v), lo), hi) : null;
    const f = want.length && flatPictures ? await flatPictures(c.id).catch(() => null) : null, placed = [];
    for (const g of want) { const art = (f?.placed || []).find(x => x.id === g.id), x = fr(g.x, 0, 1), y = fr(g.y, 0, 1), w = fr(g.w, .01, 1); if (!art || x == null || y == null || w == null) return bad(reply, 'A graphic to place is not on this piece, or its place is off the picture'); placed.push({ art, x, y, w, rot: fr(g.rot, -180, 180) || 0 }); }
    let mask = null; if (b.mask) { const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.mask)); if (!m || m[1].length > 4e6) return bad(reply, 'The painted area could not be read'); mask = Buffer.from(m[1], 'base64'); }
    if (!placed.length && !mask && !prompt) return bad(reply, 'Place a graphic, or paint an area and say what to change');
    if ((mask || prompt) && !prompt && !placed.length) return bad(reply, 'Say what to change in the painted area');
    const meta = await sharp(row.image).metadata(), W = meta.width, H = meta.height;
    // the graphics set on the picture where they were put
    const layers = []; for (const g of placed) { const gw = Math.max(8, Math.round(g.w * W)); let a = await sharp(g.art.png).resize({ width: gw }).png().toBuffer(); if (g.rot) a = await sharp(a).rotate(g.rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(); const am = await sharp(a).metadata();
      layers.push({ input: a, left: Math.round(g.x * W - am.width / 2), top: Math.round(g.y * H - am.height / 2), w: am.width, h: am.height }); }
    let out = layers.length ? await sharp(row.image).composite(layers.map(({ input, left, top }) => ({ input, left: Math.max(-4000, left), top: Math.max(-4000, top) }))).jpeg({ quality: 92 }).toBuffer() : row.image;
    const useModel = b.blend !== false || Boolean(mask) || Boolean(prompt);
    if (useModel) {
      const cfg = imageCfg(); if (!cfg.configured) return bad(reply, 'No image model is connected, so the turn cannot be worked on. Turn off Blend to only set the graphic on.', 503);
      const left = await imageCapLeft(1); if (left !== true) return bad(reply, `The daily limit of ${left} views is reached. Raise LAB_DAILY_VIEWS.`, 429);
      try { await charge(req, { kind: 'view', units: 1, conceptId: c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
      // the model's frame: the turn's own shape at a size it draws; the area it may redraw is the painted area and each graphic's box (padded)
      const [MW, MH] = W >= H ? [1536, 1024] : [1024, 1536], base = await sharp(out).resize(MW, MH, { fit: 'fill' }).png().toBuffer();
      const holes = layers.map(l => ({ x: Math.round((l.left - l.w * .15) * MW / W), y: Math.round((l.top - l.h * .15) * MH / H), w: Math.round(l.w * 1.3 * MW / W), h: Math.round(l.h * 1.3 * MH / H) }));
      // the mask: opaque where the model keeps the picture, clear where it may redraw (each graphic's box and the painted area)
      const alpha = new Uint8Array(MW * MH).fill(255);
      for (const h of holes) for (let y = Math.max(0, h.y); y < Math.min(MH, h.y + h.h); y++) alpha.fill(0, y * MW + Math.max(0, h.x), y * MW + Math.min(MW, h.x + h.w));
      if (mask) { const pm = await sharp(mask).resize(MW, MH, { fit: 'fill' }).ensureAlpha().raw().toBuffer(); for (let i = 0; i < MW * MH; i++) if (pm[i * 4 + 3] > 24) alpha[i] = 0; }
      const rgb = await sharp(base).removeAlpha().raw().toBuffer(), rgba = Buffer.alloc(MW * MH * 4); for (let i = 0; i < MW * MH; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i]; }
      const maskPng = await sharp(rgba, { raw: { width: MW, height: MH, channels: 4 } }).png().toBuffer();
      const tech = [...new Set(placed.map(g => g.art.technique))].join(' or ');
      const words = ['This is a product photograph of a man wearing a garment. Keep everything outside the editable area exactly as it is: the man, his pose, the garment, its colour and folds, the light and the background.',
        placed.length ? `The artwork set on the garment (${placed.map(g => g.art.name).join(', ')}) must become part of it: ${tech || 'printed'} on the cloth, following its folds, curve, light and shadow, at exactly that size and place, the artwork itself unchanged (its shape, its colours, any words spelled exactly). Remove any flat edge or box around it.` : '',
        prompt ? `In the painted area: ${prompt}` : ''].filter(Boolean).join('\n');
      if (cfg.provider === 'fixture') out = await sharp(base).resize(W, H, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer(); // the test stand-in: the graphics as set
      else try { const got = await (edit || openaiEdit)({ images: [base, ...placed.map(g => g.art.png)], prompt: words, mask: maskPng, cfg: { ...cfg, size: `${MW}x${MH}` } }); out = got; }
      catch (e) { log.warn?.({ err: e.message }, 'turn edit failed'); return bad(reply, `The turn could not be worked on: ${String(e.message).slice(0, 160)}`, 502); }
    }
    const image = await sharp(out).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(), thumb = await sharp(image).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 72 }).toBuffer();
    await pool.query(`update lab_concept_views set prev=image, image=$3, thumb=$4, note='', updated_at=now() where concept_id=$1 and kind=$2`, [c.id, kind, image, thumb]);
    return { ok: true, views: await summary(c.id), blended: useModel };
  });
  // back to the turn as it was before its last edit (once: the undone edit becomes the one to come back to)
  app.post('/v1/lab/concepts/:id/views/:kind/undo', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const kind = req.params.kind; if (!isKind(kind)) return bad(reply, 'Not found', 404);
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const r = (await pool.query(`select prev from lab_concept_views where concept_id=$1 and kind=$2 and prev is not null`, [c.id, kind])).rows[0]; if (!r) return bad(reply, 'Nothing to undo on this turn', 409);
    const thumb = await sharp(r.prev).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 72 }).toBuffer();
    await pool.query(`update lab_concept_views set prev=image, image=prev, thumb=$3, updated_at=now() where concept_id=$1 and kind=$2`, [c.id, kind, thumb]);
    return { ok: true, views: await summary(c.id) };
  });

  app.post('/v1/lab/assortment/views', { preHandler: pre }, async (req, reply) => {
    if (!imageCfg().configured) return bad(reply, 'No image model is connected, so the views cannot be drawn.', 503);
    const where = [`c.image is not null`, `c.status <> 'rejected'`], args = [];
    if (Array.isArray(req.body?.ids) && req.body.ids.length) { args.push(req.body.ids.filter(i => UUID.test(String(i))).slice(0, 60)); where.push(`c.id = any($${args.length}::uuid[])`); }
    else if (UUID.test(String(req.body?.plan || ''))) { args.push(req.body.plan); where.push(`c.plan_id=$${args.length}`); }
    if (own(req)) { args.push(own(req)); where.push(`c.client_id=$${args.length}`); }
    const rows = (await pool.query(`select c.id, c.name, c.category, c.twist, c.spec from lab_concepts c where ${where.join(' and ')} order by c.created_at desc limit 60`, args)).rows;
    const have = new Set((await pool.query(`select concept_id||':'||kind k from lab_concept_views where concept_id = any($1::uuid[]) and (status='ready' or (status='pending' and updated_at > now() - make_interval(mins => $2)))`, [rows.map(r => r.id), STALE_MIN])).rows.map(r => r.k));
    const jobs = rows.map(r => ({ r, kinds: kindsFor(r.category).filter(k => !have.has(`${r.id}:${k}`)) })).filter(j => j.kinds.length);
    const total = jobs.reduce((a, j) => a + j.kinds.length, 0);
    if (!total) return { queued: 0, concepts: 0, views: 0 };
    const left = await imageCapLeft(total); if (left !== true) return bad(reply, `That would make ${total} views and the daily limit is ${left}. Raise LAB_DAILY_VIEWS, or pick fewer concepts.`, 429);
    try { await charge(req, { kind: 'view', units: total }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    let started = 0; for (const j of jobs) started += await startViews(j.r, j.kinds);
    return reply.code(202).send({ queued: started, concepts: jobs.length, views: total });
  });

  app.post('/v1/lab/concepts/:id/walk', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (!canWalk(c.category)) return bad(reply, 'A piece with nobody wearing it has no walk.', 409);
    const cfg = videoCfg(); if (!cfg.configured) return bad(reply, `No video model is connected: ${cfg.note || 'set one up first'}. The spin of on-model views still works.`, 503);
    const front = (await pool.query(`select image from lab_concept_views where concept_id=$1 and kind='model_front' and status='ready'`, [c.id])).rows[0]?.image;
    if (!front) return bad(reply, 'Make the on-model views first: the walk starts from the front view.', 409);
    const cap = Number(env.LAB_DAILY_WALKS ?? 6); if (cap >= 0 && (await dayCount(`kind = 'walk'`)) >= cap) return bad(reply, `The daily limit of ${cap} walks is reached. Raise LAB_DAILY_WALKS.`, 429);
    try { await charge(req, { kind: 'walk', conceptId: c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    await pool.query(`insert into lab_concept_views(concept_id,kind,status,note) values($1,'walk','pending','') on conflict (concept_id,kind) do update set status='pending', note='', created_at=case when lab_concept_views.status='ready' then now() else lab_concept_views.created_at end, updated_at=now()`, [c.id]);
    const ok = enqueue(`${c.id}:walk`, async () => {
      try { const w = await makeWalk({ concept: { name: c.name, category: c.category, spec: c.spec }, frame: front, cfg, fetchImpl, env }); await pool.query(`update lab_concept_views set status='ready', video=$2, mime=$3, model=$4, note='', updated_at=now() where concept_id=$1 and kind='walk'`, [c.id, w.video, w.mime, w.model || '']); }
      catch (e) { await pool.query(`update lab_concept_views set status='failed', note=$2, updated_at=now() where concept_id=$1 and kind='walk'`, [c.id, clip(e.message, 500)]); }
    });
    return reply.code(202).send({ started: ok ? 1 : 0, views: await summary(c.id) });
  });

  return { idle };
}
