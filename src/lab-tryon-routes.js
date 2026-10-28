// 3D try-on: the studio design on the 3D garment model. The concept's picture (or what is on the studio canvas right now) goes to the 3D
// service with the texture switched on, so the model comes back painted with the design, and is shown in our own viewer (src/stl-viewer.js
// reads the GLB). Staff start it by hand: it spends credits and sends the picture to the vendor, so nothing runs it on its own.
//   POST   /v1/lab/concepts/:id/tryon {image?}            start one (image: the canvas as a data URL; without it, the concept's picture)
//   GET    /v1/lab/concepts/:id/tryon                     the models made for this concept, newest first, and whether the service is connected
//   GET    /v1/lab/concepts/:id/tryon/:mid/model.glb      the model          GET …/thumb   the vendor's preview picture
//   DELETE /v1/lab/concepts/:id/tryon/:mid
import { createHash } from 'node:crypto';
import './stl-viewer.js';
import { meshConfig, startMesh, pollMesh, fetchAsset, photoForMesh } from './mesh.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const GIVE_UP_MS = 20 * 60 * 1000;
// → { triangles, textured, size } or null when the file is not a GLB we can show
export function glbInfo(buf) {
  try { const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), m = globalThis.FBStl.parseGlb(ab); return { triangles: m.triangles, textured: Boolean(m.texture), size: m.size.map(s => Math.round(s * 1000) / 1000) }; } catch { return null; }
}

export function registerLabTryonRoutes(app, d) {
  const { pool, authenticate, adminOnly, env = process.env, cfgImpl = () => meshConfig(env), log = console, pollMs = () => Number(env.MESH_POLL_MS) || 5000 } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const shape = r => ({ id: r.id, status: r.status, source: r.source, error: r.error || '', triangles: r.triangles, textured: Boolean(r.textured), credits: r.credits == null ? null : Number(r.credits), hasModel: Boolean(r.has_model), hasThumb: Boolean(r.has_thumb), createdAt: r.created_at, completedAt: r.completed_at, provider: r.provider });
  const SEL = `select id, concept_id, status, source, error, triangles, textured, credits, provider, task_id, created_at, completed_at, (glb is not null) has_model, (thumb is not null) has_thumb from lab_concept_models`;
  const polls = new Set();

  async function follow(id) {
    if (polls.has(id)) return; polls.add(id);
    try {
      let errors = 0;
      for (;;) {
        const m = (await pool.query('select * from lab_concept_models where id=$1', [id])).rows[0]; if (!m || m.status !== 'running' || !m.task_id) return;
        if (Date.now() - new Date(m.created_at) > GIVE_UP_MS) { await pool.query(`update lab_concept_models set status='failed', error='The 3D service took too long. Try again.', completed_at=now() where id=$1`, [id]); return; }
        const cfg = { ...cfgImpl(), provider: m.provider === 'fixture' ? 'fixture' : cfgImpl().provider };
        let r;
        try { r = await pollMesh(m.task_id, { cfg, env }); errors = 0; }
        catch (e) { if (e.status === 401 || e.status === 403 || ++errors >= 6) { await pool.query(`update lab_concept_models set status='failed', error=$2, completed_at=now() where id=$1`, [id, clip(e.message, 240)]); return; } await new Promise(res => setTimeout(res, pollMs())); continue; }
        if (r.status === 'failed') { await pool.query(`update lab_concept_models set status='failed', error=$2, completed_at=now() where id=$1`, [id, r.error || 'The 3D service could not make a model.']); return; }
        if (r.status === 'done') {
          try {
            if (!r.glbUrl) throw new Error('The 3D service made no textured model (no GLB).');
            const glb = await fetchAsset(r.glbUrl, { kind: 'glb', cfg, texture: m.image || null }), info = glbInfo(glb);
            if (!info) throw new Error('The 3D service sent a file that is not a model we can show.');
            let thumb = null; if (r.thumbUrl) { try { thumb = await fetchAsset(r.thumbUrl, { kind: 'thumb', cfg }); } catch { thumb = null; } }
            await pool.query(`update lab_concept_models set status='done', glb=$2, thumb=$3, triangles=$4, textured=$5, credits=$6, image=null, completed_at=now() where id=$1`, [id, glb, thumb, info.triangles, info.textured, r.credits ?? null]);
          } catch (e) { await pool.query(`update lab_concept_models set status='failed', error=$2, completed_at=now() where id=$1`, [id, clip(e.message, 240)]); }
          return;
        }
        await new Promise(res => setTimeout(res, pollMs()));
      }
    } finally { polls.delete(id); }
  }
  // models still running when the service last stopped are followed again
  pool.query(`select id from lab_concept_models where status='running' and created_at > now() - interval '30 minutes'`).then(r => { for (const row of r.rows) setImmediate(() => follow(row.id).catch(e => log.warn?.({ err: e.message }, '3D try-on follow failed'))); }).catch(() => {});

  const concept = async (req, reply) => { if (!UUID.test(req.params.id)) { bad(reply, 'Not found', 404); return null; } const r = (await pool.query('select id, name, status, (image is not null) has_image from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) { bad(reply, 'Not found', 404); return null; } return r; };

  app.get('/v1/lab/concepts/:id/tryon', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    const cfg = cfgImpl(), rows = (await pool.query(`${SEL} where concept_id=$1 order by created_at desc limit 12`, [c.id])).rows;
    return { models: rows.map(shape), connected: cfg.configured, provider: cfg.provider, note: cfg.configured ? '' : cfg.note || 'No 3D service is connected (set MESHY_API_KEY on the service).', limit: Number(env.LAB_DAILY_TRYON ?? 8) };
  });
  app.post('/v1/lab/concepts/:id/tryon', { preHandler: pre, bodyLimit: 32_000_000 }, async (req, reply) => {
    const c = await concept(req, reply); if (!c) return;
    const cfg = cfgImpl(); if (!cfg.configured) return bad(reply, cfg.note || 'No 3D service is connected: set MESHY_API_KEY on the service.', 503);
    const open = (await pool.query(`select id from lab_concept_models where concept_id=$1 and status='running' and created_at > now() - interval '20 minutes' limit 1`, [c.id])).rows[0];
    if (open) return bad(reply, 'A model is already being made for this concept. Give it a minute.', 409, { id: open.id });
    const cap = Number(env.LAB_DAILY_TRYON ?? 8), n = Number((await pool.query(`select count(*)::int n from lab_concept_models where created_at > now() - interval '24 hours'`)).rows[0].n);
    if (cap >= 0 && n >= cap) return bad(reply, `The daily limit of ${cap} 3D try-ons is reached. It resets tomorrow, or raise LAB_DAILY_TRYON.`, 429);
    let image = null, source = 'concept';
    if (req.body?.image) { try { image = await photoForMesh(req.body.image); source = 'canvas'; } catch (e) { return bad(reply, `The picture could not be read: ${clip(e.message, 120)}`); } if (!image) return bad(reply, 'Send the picture as a PNG or JPEG data URL'); }
    else { const r = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]; if (!r?.image) return bad(reply, 'This concept has no picture yet', 409); image = `data:image/jpeg;base64,${Buffer.from(r.image).toString('base64')}`; }
    const jpegOf = u => Buffer.from(String(u).split(',')[1] || '', 'base64');
    const made = (await pool.query(`insert into lab_concept_models(concept_id, provider, model, source, image, image_hash, requested_by) values($1,$2,$3,$4,$5,$6,$7) returning id`, [c.id, cfg.provider, cfg.model, source, jpegOf(image), createHash('sha1').update(jpegOf(image)).digest('hex'), actorOf(req)])).rows[0];
    try { const t = await startMesh({ imageDataUrl: image, cfg, env, texture: true, formats: ['glb'] }); await pool.query('update lab_concept_models set task_id=$2 where id=$1', [made.id, t.taskId]); }
    catch (e) { await pool.query(`update lab_concept_models set status='failed', error=$2, completed_at=now() where id=$1`, [made.id, clip(e.message, 240)]); return bad(reply, e.message, e.status === 402 ? 402 : 502, { id: made.id }); }
    setImmediate(() => follow(made.id).catch(e => log.warn?.({ err: e.message, id: made.id }, '3D try-on follow failed')));
    const row = (await pool.query(`${SEL} where id=$1`, [made.id])).rows[0];
    return reply.code(201).send({ model: shape(row) });
  });
  const one = async (req, reply) => { if (!UUID.test(req.params.id) || !UUID.test(req.params.mid)) { bad(reply, 'Not found', 404); return null; } const r = (await pool.query('select id, status, glb, thumb from lab_concept_models where id=$1 and concept_id=$2', [req.params.mid, req.params.id])).rows[0]; if (!r) { bad(reply, 'Not found', 404); return null; } return r; };
  app.get('/v1/lab/concepts/:id/tryon/:mid/model.glb', { preHandler: pre }, async (req, reply) => { const r = await one(req, reply); if (!r) return; if (!r.glb) return bad(reply, 'The model is not ready', 404); return reply.header('content-type', 'model/gltf-binary').header('cache-control', 'private, max-age=3600').send(r.glb); });
  app.get('/v1/lab/concepts/:id/tryon/:mid/thumb', { preHandler: pre }, async (req, reply) => { const r = await one(req, reply); if (!r) return; if (!r.thumb) return bad(reply, 'No preview', 404); return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=3600').send(r.thumb); });
  app.delete('/v1/lab/concepts/:id/tryon/:mid', { preHandler: pre }, async (req, reply) => { const r = await one(req, reply); if (!r) return; await pool.query('delete from lab_concept_models where id=$1', [r.id]); return { ok: true }; });
  log.info?.('design lab 3D try-on routes ready');
}
