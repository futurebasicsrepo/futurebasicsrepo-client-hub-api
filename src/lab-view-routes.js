// The Design Lab assortment board (the Lab module): every concept as a flat and on a model, a spin through the on-model views and, with a video model, a walk.
//   GET  /v1/lab/assortment?plan=&status=             the board: concepts (not rejected unless asked) with which views each has, and what is connected
//   POST /v1/lab/assortment/views {plan?, ids?}        make the missing views for many concepts (they are drawn one concept after another in the background)
//   POST /v1/lab/concepts/:id/views {kinds?, redo?}    make views for one concept      GET /v1/lab/concepts/:id/views   which exist and how they are getting on
//   GET  /v1/lab/concepts/:id/views/:kind[?thumb=1]    the picture (or the walk video); needs the sign-in header, so the page fetches it
//   POST /v1/lab/concepts/:id/walk                     make the walk from the front on-model view (video model)
import { imageConfig } from './check.js';
import { categoryLabel } from './lab.js';
import { ensureBranding } from './lab-concepts.js';
import { VIEW_KINDS, KIND_IDS, SPIN_KINDS, isKind, kindsFor, canWalk, makeViews, makeWalk, videoConfig } from './lab-views.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const STALE_MIN = 20; // a view still "pending" after this long was lost to a restart: it shows as failed and can be made again

export function registerLabViewRoutes(app, d) {
  const { pool, authenticate, adminOnly, env = process.env, imageCfg = () => imageConfig(env), videoCfg = () => videoConfig(env), fetchImpl = fetch, edit, log = console } = d;
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

  // start views for one concept: mark them pending, draw in the background, land each as it is done
  async function startViews(c, kinds, { redo = false } = {}) {
    const have = Object.fromEntries((await pool.query(`select kind, image from lab_concept_views where concept_id=$1 and status='ready' and image is not null`, [c.id])).rows.map(r => [r.kind, r.image]));
    const todo = kinds.filter(k => redo || !have[k]); if (!todo.length) return 0;
    for (const k of todo) await pool.query(`insert into lab_concept_views(concept_id,kind,status,note) values($1,$2,'pending','') on conflict (concept_id,kind) do update set status='pending', note='', updated_at=now()`, [c.id, k]);
    const picture = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image;
    const concept = { name: c.name, category: c.category, twist: c.twist, spec: ensureBranding(c.spec || {}, c.category) }, cfg = imageCfg();
    const ok = enqueue(`${c.id}`, async () => {
      await makeViews({ concept, picture, kinds: todo, have: redo ? Object.fromEntries(Object.entries(have).filter(([k]) => !todo.includes(k))) : have, cfg, edit,
        onView: async (kind, r, note) => {
          if (r) await pool.query(`update lab_concept_views set status='ready', image=$3, thumb=$4, model=$5, note='', updated_at=now() where concept_id=$1 and kind=$2`, [c.id, kind, r.image, r.thumb, r.model || '']);
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
    const rows = (await pool.query(`${SELECT} ${where.length ? 'where ' + where.join(' and ') : ''} order by c.category, c.role, c.created_at desc limit 150`, args)).rows;
    const vs = new Map(); for (const r of (await pool.query(`select concept_id, kind, status, note, (updated_at < now() - make_interval(mins => $2)) stale from lab_concept_views where concept_id = any($1::uuid[])`, [rows.map(r => r.id), STALE_MIN])).rows) { if (!vs.has(r.concept_id)) vs.set(r.concept_id, {}); vs.get(r.concept_id)[r.kind] = { status: r.status === 'pending' && r.stale && !running.has(r.concept_id) ? 'failed' : r.status, note: r.note }; }
    const plans = (await pool.query(`select id, name from lab_plans order by created_at desc limit 40`)).rows;
    const vid = videoCfg(), img = imageCfg();
    return {
      concepts: rows.map(r => ({ id: r.id, name: r.name, category: r.category, categoryLabel: categoryLabel(r.category), role: r.role, status: r.status, price: r.price_cents == null ? null : r.price_cents / 100, twist: r.twist, planId: r.plan_id, planName: r.plan_name || '', closeness: r.closeness?.verdict || null, hasPicture: r.has_picture, views: vs.get(r.id) || {}, kinds: kindsFor(r.category), canWalk: canWalk(r.category) })),
      plans, kinds: VIEW_KINDS, spin: SPIN_KINDS, imageConnected: img.configured, imageNote: img.note || '', videoConnected: vid.configured, videoNote: vid.note || '', busy: running.size,
      limits: { images: Number(env.LAB_DAILY_VIEWS ?? 80), walks: Number(env.LAB_DAILY_WALKS ?? 6) }
    };
  });

  app.get('/v1/lab/concepts/:id/views', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return { views: await summary(req.params.id), busy: running.has(req.params.id) || running.has(`${req.params.id}:walk`) }; });

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
    if (!c.has_picture) return bad(reply, 'This concept has no picture to draw the views from. Draw its picture first.', 409);
    if (!imageCfg().configured) return bad(reply, 'No image model is connected, so the views cannot be drawn.', 503);
    const asked = Array.isArray(req.body?.kinds) ? req.body.kinds.filter(isKind) : KIND_IDS, kinds = asked.filter(k => kindsFor(c.category).includes(k));
    if (!kinds.length) return bad(reply, 'Nothing to make for this kind of piece.');
    const left = await imageCapLeft(kinds.length); if (left !== true) return bad(reply, `The daily limit of ${left} views is reached. Raise LAB_DAILY_VIEWS.`, 429);
    const n = await startViews(c, kinds, { redo: Boolean(req.body?.redo) });
    return reply.code(202).send({ started: n, views: await summary(c.id) });
  });

  app.post('/v1/lab/assortment/views', { preHandler: pre }, async (req, reply) => {
    if (!imageCfg().configured) return bad(reply, 'No image model is connected, so the views cannot be drawn.', 503);
    const where = [`c.image is not null`, `c.status <> 'rejected'`], args = [];
    if (Array.isArray(req.body?.ids) && req.body.ids.length) { args.push(req.body.ids.filter(i => UUID.test(String(i))).slice(0, 60)); where.push(`c.id = any($${args.length}::uuid[])`); }
    else if (UUID.test(String(req.body?.plan || ''))) { args.push(req.body.plan); where.push(`c.plan_id=$${args.length}`); }
    const rows = (await pool.query(`select c.id, c.name, c.category, c.twist, c.spec from lab_concepts c where ${where.join(' and ')} order by c.created_at desc limit 60`, args)).rows;
    const have = new Set((await pool.query(`select concept_id||':'||kind k from lab_concept_views where concept_id = any($1::uuid[]) and (status='ready' or (status='pending' and updated_at > now() - make_interval(mins => $2)))`, [rows.map(r => r.id), STALE_MIN])).rows.map(r => r.k));
    const jobs = rows.map(r => ({ r, kinds: kindsFor(r.category).filter(k => !have.has(`${r.id}:${k}`)) })).filter(j => j.kinds.length);
    const total = jobs.reduce((a, j) => a + j.kinds.length, 0);
    if (!total) return { queued: 0, concepts: 0, views: 0 };
    const left = await imageCapLeft(total); if (left !== true) return bad(reply, `That would make ${total} views and the daily limit is ${left}. Raise LAB_DAILY_VIEWS, or pick fewer concepts.`, 429);
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
    await pool.query(`insert into lab_concept_views(concept_id,kind,status,note) values($1,'walk','pending','') on conflict (concept_id,kind) do update set status='pending', note='', created_at=case when lab_concept_views.status='ready' then now() else lab_concept_views.created_at end, updated_at=now()`, [c.id]);
    const ok = enqueue(`${c.id}:walk`, async () => {
      try { const w = await makeWalk({ concept: { name: c.name, category: c.category, spec: c.spec }, frame: front, cfg, fetchImpl, env }); await pool.query(`update lab_concept_views set status='ready', video=$2, mime=$3, model=$4, note='', updated_at=now() where concept_id=$1 and kind='walk'`, [c.id, w.video, w.mime, w.model || '']); }
      catch (e) { await pool.query(`update lab_concept_views set status='failed', note=$2, updated_at=now() where concept_id=$1 and kind='walk'`, [c.id, clip(e.message, 200)]); }
    });
    return reply.code(202).send({ started: ok ? 1 : 0, views: await summary(c.id) });
  });

  return { idle };
}
