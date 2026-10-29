// 3D lasts for a footwear concept (the measuring is src/lab-last3d.js; the page is the Pattern view's footwear panel):
//   GET    /v1/lab/concepts/:id/lasts                     the lasts imported or made for this concept, which one the pattern uses, whether the 3D service is connected
//   POST   /v1/lab/concepts/:id/lasts                     import one {name, file (data URL or base64: STL, OBJ or GLB), units?, heelHeight?} → turned, measured, kept
//   POST   /v1/lab/concepts/:id/lasts/generate            {from: 'draft'|'photos', images?, heelHeight?} the 3D service (Meshy) makes one: from the drafted last
//                                                         drawn from four sides, or from one to four pictures of a last; fitted to the size and measured
//   POST   /v1/lab/concepts/:id/lasts/:lid/use            draft the shoe on it (its size, heel height and toe spring)      POST …/lasts/unuse  back to the drafted last
//   GET    /v1/lab/concepts/:id/lasts/:lid/last.stl       the last, turned the way it stands, in mm with Z up             GET …/:lid/thumb   the service's preview
//   DELETE /v1/lab/concepts/:id/lasts/:lid
//   GET    /v1/lab/concepts/:id/last.stl?size=            the drafted last (or the one in use) lofted into 3D, for CAD or a last maker
// Making one spends the service's credits and sends the drafted last's pictures (or the pictures given) to the vendor: a person starts it.
import { meshConfig, startMesh, pollMesh, fetchAsset, photoForMesh } from './mesh.js';
import { prepareLast, loftLast, stlOf, renderViews, orient, useLast, compareToDraft } from './lab-last3d.js';
import { lastOf, cleanFootwear } from './lab-footwear.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const GIVE_UP_MS = 20 * 60 * 1000, MAX_FILE = 75 * 1024 * 1024;
const fileName = s => String(s || 'last').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'last';
// the test stand-in for the service: the drafted last, turned and in no particular units, as a generated model comes back
export function fixtureLast(target) {
  const pos = loftLast(target.spec), a = .5, c = Math.cos(a), s = Math.sin(a), k = .0137, out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { out[i] = (c * pos[i] - s * pos[i + 2]) * k; out[i + 1] = pos[i + 1] * k * 1.04; out[i + 2] = (s * pos[i] + c * pos[i + 2]) * k; }
  return stlOf(out.map(v => v / 25.4));
}

export function registerLabLastRoutes(app, d) {
  const { pool, authenticate, adminOnly, lab = null, env = process.env, cfgImpl = () => meshConfig(env), log = console, pollMs = () => Number(env.MESH_POLL_MS) || 5000, load, save, fixtureImpl = fixtureLast } = d;
  const charge = async (req, o) => (lab ? lab.charge(req, o) : null);
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const SEL = `select id, concept_id, source, name, status, provider, task_id, endpoint, target, measures, warnings, units, file_format, triangles, credits, error, created_at, completed_at, (stl is not null) has_model, (thumb is not null) has_thumb from lab_lasts`;
  const light = m => m ? Object.fromEntries(Object.entries(m).filter(([k]) => !['bottom', 'top', 'outline'].includes(k))) : null;
  const shape = (r, spec) => {
    let compare = null, size = null;
    if (r.measures && spec) { try { size = useLast(spec, r.measures).size; compare = compareToDraft(r.measures, spec, size); } catch { compare = null; } }
    return { id: r.id, source: r.source, name: r.name, status: r.status, error: r.error || '', measures: light(r.measures), size, compare, warnings: r.warnings || [], units: r.units, format: r.file_format, triangles: r.triangles,
      credits: r.credits == null ? null : Number(r.credits), hasModel: Boolean(r.has_model), hasThumb: Boolean(r.has_thumb), target: r.target && Object.keys(r.target).length ? { length: r.target.length, ballGirth: r.target.ballGirth, size: r.target.size } : null,
      createdAt: r.created_at, completedAt: r.completed_at, inUse: spec?.last3d?.id === r.id };
  };
  const shoe = async (req, reply) => { const L = await load(req.params.id); if (!L) { bad(reply, 'Not found', 404); return null; } if (L.kind !== 'footwear') { bad(reply, 'Only footwear has a last'); return null; } return L; };
  const one = async (req, reply, L) => { if (!UUID.test(String(req.params.lid))) { bad(reply, 'Not found', 404); return null; } const r = (await pool.query(`${SEL} where id=$1 and concept_id=$2`, [req.params.lid, L.c.id])).rows[0]; if (!r) { bad(reply, 'Not found', 404); return null; } return r; };
  const heelOf = (v, L) => v === 'estimate' || v === '' ? null : v == null ? L.spec.heel : Number.isFinite(Number(v)) ? Math.min(Math.max(Number(v), 0), 5) : L.spec.heel;

  // ---- the 3D service's model, followed until it is done, then fitted to the size and measured ----
  const polls = new Set();
  async function follow(id) {
    if (polls.has(id)) return; polls.add(id);
    try {
      let errors = 0;
      for (;;) {
        const m = (await pool.query('select * from lab_lasts where id=$1', [id])).rows[0]; if (!m || m.status !== 'running' || !m.task_id) return;
        const fail = msg => pool.query(`update lab_lasts set status='failed', error=$2, completed_at=now() where id=$1`, [id, clip(msg, 240)]);
        if (Date.now() - new Date(m.created_at) > GIVE_UP_MS) return void await fail('The 3D service took too long. Try again.');
        const cfg = { ...cfgImpl(), provider: m.provider === 'fixture' ? 'fixture' : cfgImpl().provider };
        let r;
        try { r = await pollMesh(m.task_id, { cfg, env, endpoint: m.endpoint }); errors = 0; }
        catch (e) { if (e.status === 401 || e.status === 403 || ++errors >= 6) return void await fail(e.message); await new Promise(res => setTimeout(res, pollMs())); continue; }
        if (r.status === 'failed') return void await fail(r.error || 'The 3D service could not make a last.');
        if (r.status === 'done') {
          try {
            const t = m.target || {}, buf = cfg.provider === 'fixture' ? fixtureImpl(t) : await fetchAsset(r.stlUrl || r.glbUrl, { kind: 'stl', cfg });
            const p = prepareLast(buf, r.stlUrl ? 'meshy.stl' : 'meshy.glb', { fit: { length: t.length, ballGirth: t.ballGirth }, heelHeight: t.heel ?? null });
            let thumb = null; if (r.thumbUrl) { try { thumb = await fetchAsset(r.thumbUrl, { kind: 'thumb', cfg }); } catch { thumb = null; } }
            await pool.query(`update lab_lasts set status='done', stl=$2, thumb=$3, measures=$4, warnings=$5, units=$6, file_format=$7, triangles=$8, credits=$9, completed_at=now() where id=$1`,
              [id, stlOf(p.pos, { name: 'Future Basics last' }), thumb, p.measures, JSON.stringify(p.warnings), p.units, p.format, p.triangles, r.credits ?? null]);
          } catch (e) { await fail(e.message); }
          return;
        }
        await new Promise(res => setTimeout(res, pollMs()));
      }
    } finally { polls.delete(id); }
  }
  pool.query(`select id from lab_lasts where status='running' and created_at > now() - interval '30 minutes'`).then(r => { for (const row of r.rows) setImmediate(() => follow(row.id).catch(e => log.warn?.({ err: e.message }, '3D last follow failed'))); }).catch(() => {});

  app.get('/v1/lab/concepts/:id/lasts', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return;
    const cfg = cfgImpl(), rows = (await pool.query(`${SEL} where concept_id=$1 order by created_at desc limit 20`, [L.c.id])).rows;
    return { lasts: rows.map(r => shape(r, L.spec)), inUse: L.spec.last3d?.id || null, connected: cfg.configured, provider: cfg.provider, note: cfg.configured ? '' : cfg.note || 'No 3D service is connected (set MESHY_API_KEY on the service).', limit: Number(env.LAB_DAILY_LASTS ?? 6), heel: L.spec.heel };
  });

  app.post('/v1/lab/concepts/:id/lasts', { preHandler: pre, bodyLimit: 110_000_000 }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return;
    const raw = String(req.body?.file || ''), b64 = raw.includes(',') && raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
    if (!b64) return bad(reply, 'Choose the last\'s file: STL, OBJ or GLB');
    const buf = Buffer.from(b64, 'base64'); if (buf.length > MAX_FILE) return bad(reply, 'The file is over 75 MB: decimate the model (under a million triangles is plenty) and send it again', 413);
    const name = clip(req.body?.name, 80) || 'Imported last', units = ['auto', 'mm', 'cm', 'in', 'm'].includes(req.body?.units) ? req.body.units : 'auto';
    let p; try { p = prepareLast(buf, name, { units, heelHeight: heelOf(req.body?.heelHeight, L) }); } catch (e) { return bad(reply, e.message, e.status || 422, e.code ? { code: e.code, longest: e.longest } : {}); }
    const row = (await pool.query(`insert into lab_lasts(concept_id, source, name, status, stl, measures, warnings, units, file_format, triangles, requested_by, completed_at) values($1,'upload',$2,'done',$3,$4,$5,$6,$7,$8,$9,now()) returning id`,
      [L.c.id, name, stlOf(p.pos, { name }), p.measures, JSON.stringify(p.warnings), p.units, p.format, p.triangles, actorOf(req)])).rows[0];
    return reply.code(201).send({ last: shape((await pool.query(`${SEL} where id=$1`, [row.id])).rows[0], L.spec) });
  });

  app.post('/v1/lab/concepts/:id/lasts/generate', { preHandler: pre, bodyLimit: 60_000_000 }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return;
    const cfg = cfgImpl(); if (!cfg.configured) return bad(reply, cfg.note || 'No 3D service is connected: set MESHY_API_KEY on the service.', 503);
    const open = (await pool.query(`select id from lab_lasts where concept_id=$1 and status='running' and created_at > now() - interval '20 minutes' limit 1`, [L.c.id])).rows[0];
    if (open) return bad(reply, 'A last is already being made for this shoe. Give it a few minutes.', 409, { id: open.id });
    const cap = Number(env.LAB_DAILY_LASTS ?? 6), n = Number((await pool.query(`select count(*)::int n from lab_lasts where source<>'upload' and created_at > now() - interval '24 hours'`)).rows[0].n);
    if (cap >= 0 && n >= cap) return bad(reply, `The daily limit of ${cap} lasts from the 3D service is reached. It resets tomorrow, or raise LAB_DAILY_LASTS.`, 429);
    const from = req.body?.from === 'photos' ? 'photos' : 'draft', drafted = cleanFootwear({ ...L.spec, last3d: null }), d = lastOf(drafted);
    let images;
    if (from === 'photos') {
      const list = Array.isArray(req.body?.images) ? req.body.images.slice(0, 4) : []; if (!list.length) return bad(reply, 'Add one to four pictures of the last, each from a different side');
      try { images = (await Promise.all(list.map(u => photoForMesh(u)))); } catch (e) { return bad(reply, `A picture could not be read: ${clip(e.message, 120)}`); }
      if (images.some(x => !x)) return bad(reply, 'Send the pictures as PNG or JPEG');
    } else images = (await renderViews(orient(loftLast(drafted)))).map(b => `data:image/png;base64,${b.toString('base64')}`);
    try { await charge(req, { kind: 'last', conceptId: L.c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    const heel = heelOf(req.body?.heelHeight, L), target = { length: d.length, ballGirth: d.ballGirth, heel, size: d.size, spec: drafted };
    const name = from === 'draft' ? `Made from the drafted last, size ${d.size}` : 'Made from pictures of a last';
    const made = (await pool.query(`insert into lab_lasts(concept_id, source, name, status, provider, model, target, requested_by) values($1,$2,$3,'running',$4,$5,$6,$7) returning id`, [L.c.id, from, name, cfg.provider, cfg.model, target, actorOf(req)])).rows[0];
    try { const t = await startMesh({ images, cfg, env, formats: ['stl'] }); await pool.query('update lab_lasts set task_id=$2, endpoint=$3 where id=$1', [made.id, t.taskId, t.endpoint]); }
    catch (e) { await pool.query(`update lab_lasts set status='failed', error=$2, completed_at=now() where id=$1`, [made.id, clip(e.message, 240)]); return bad(reply, e.message, e.status === 402 ? 402 : 502, { id: made.id }); }
    setImmediate(() => follow(made.id).catch(e => log.warn?.({ err: e.message, id: made.id }, '3D last follow failed')));
    return reply.code(201).send({ last: shape((await pool.query(`${SEL} where id=$1`, [made.id])).rows[0], L.spec) });
  });

  app.post('/v1/lab/concepts/:id/lasts/unuse', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return;
    const spec = { ...L.spec }; delete spec.last3d; const saved = await save(L, spec, actorOf(req));
    return { ok: true, spec: saved };
  });
  app.post('/v1/lab/concepts/:id/lasts/:lid/use', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return; const r = await one(req, reply, L); if (!r) return;
    if (r.status !== 'done' || !r.measures) return bad(reply, 'That last is not ready', 409);
    let spec; try { spec = useLast(L.spec, r.measures, { id: r.id, name: r.name, source: r.source }); } catch (e) { return bad(reply, e.message); }
    const saved = await save(L, { ...spec, ...(L.spec.edits ? { edits: L.spec.edits } : {}) }, actorOf(req));
    return { ok: true, spec: saved };
  });
  app.get('/v1/lab/concepts/:id/lasts/:lid/last.stl', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return; const r = await one(req, reply, L); if (!r) return;
    const s = (await pool.query('select stl from lab_lasts where id=$1', [r.id])).rows[0]?.stl; if (!s) return bad(reply, 'The last is not ready', 404);
    return reply.header('content-type', 'model/stl').header('content-disposition', `attachment; filename="${fileName(L.c.name)}-${fileName(r.name)}.stl"`).header('cache-control', 'private, max-age=600').send(s);
  });
  app.get('/v1/lab/concepts/:id/lasts/:lid/thumb', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return; const r = await one(req, reply, L); if (!r) return;
    const t = (await pool.query('select thumb from lab_lasts where id=$1', [r.id])).rows[0]?.thumb; if (!t) return bad(reply, 'No preview', 404);
    return reply.header('content-type', t[0] === 0x89 ? 'image/png' : 'image/jpeg').header('cache-control', 'private, max-age=3600').send(t);
  });
  app.delete('/v1/lab/concepts/:id/lasts/:lid', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return; const r = await one(req, reply, L); if (!r) return;
    await pool.query('delete from lab_lasts where id=$1', [r.id]);
    if (L.spec.last3d?.id === r.id) { const spec = { ...L.spec }; delete spec.last3d; await save(L, spec, actorOf(req)); }
    return { ok: true };
  });
  app.get('/v1/lab/concepts/:id/last.stl', { preHandler: pre }, async (req, reply) => {
    const L = await shoe(req, reply); if (!L) return;
    const size = String(req.query?.size ?? '') !== '' && Number.isFinite(Number(req.query.size)) ? Number(req.query.size) : null, l = lastOf(L.spec, size);
    return reply.header('content-type', 'model/stl').header('content-disposition', `attachment; filename="${fileName(L.c.name)}-last-${l.size}.stl"`).header('cache-control', 'no-store').send(stlOf(orient(loftLast(L.spec, size), 1, { heelHeight: l.heelHeight }), { name: `Future Basics last ${l.size}` }));
  });
  log.info?.('design lab 3D last routes ready');
}
