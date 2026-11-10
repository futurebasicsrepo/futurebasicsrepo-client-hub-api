// Design Lab artwork: storing, drawing in the background and serving the graphics drawn by the image model (src/lab-art.js says how they are drawn).
//   GET  /v1/lab/art/:id[?thumb=1]                          a graphic as a PNG with transparency (needs the sign-in header, so the page fetches it)
//   POST /v1/lab/plans/:id/program/motifs/:mid/art          draw one motif of the plan's graphic program again (in the background)
import { imageConfig } from './check.js';
import { drawArt } from './lab-art.js';
import sharp from 'sharp';
import { cleanProgram } from './lab-program.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// The daily safety limit on artwork across the whole platform (LAB_DAILY_ART, 40 by default; a negative number turns it off): true when
// `n` more fit with `used` made in the last 24 hours, otherwise the limit, for the message.
export const artCap = (env = process.env) => { const v = Number(env.LAB_DAILY_ART ?? 40); return Number.isFinite(v) ? v : 40; };
export const artCapVerdict = (used, n, cap) => (cap < 0 || used + n <= cap ? true : cap);

// One place that draws artwork, one piece at a time, so the image model is not flooded; the program's motifs are filled in as each lands.
export function createArtService(pool, { env = process.env, imageCfg = () => imageConfig(env), draw, log = console } = {}) {
  const queue = []; let working = false, waiters = [];
  const capLeft = async n => { const cap = artCap(env); if (cap < 0) return true; return artCapVerdict(Number((await pool.query(`select count(*)::int n from lab_art where created_at > now() - interval '24 hours'`)).rows[0].n), n, cap); };
  async function pump() {
    if (working) return; working = true;
    try { while (queue.length) { const job = queue.shift(); try { await job(); } catch (e) { log.warn?.({ err: e.message }, 'design lab artwork failed'); } } }
    finally { working = false; const w = waiters; waiters = []; w.forEach(f => f()); }
  }
  const enqueue = job => { queue.push(job); setImmediate(pump); };
  const idle = () => (working || queue.length ? new Promise(r => waiters.push(r)) : Promise.resolve());
  // → the id of the stored artwork. Throws when it cannot be drawn.
  async function drawAndStore(g, { program = null, planId = null, conceptId = null, technique = '', source = null, tags = [], techniqueId = null, createdBy = null, clientId = null } = {}) {
    const left = await capLeft(1); if (left !== true) throw new Error(`The daily limit of ${left} artworks is reached. Raise LAB_DAILY_ART.`);
    const a = await drawArt(g, { program, technique, cfg: imageCfg(), ...(draw ? { draw } : {}) });
    // every artwork goes into the graphics library, so it can be used again on any piece later
    return (await pool.query(`insert into lab_art(plan_id,concept_id,name,png,thumb,prompt,model,source,tags,technique_id,created_by,client_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [planId, conceptId, clip(g.name, 120), a.png, a.thumb, a.prompt, a.model || '', source || (conceptId ? 'concept' : 'plan'), tags, techniqueId, createdBy, UUID.test(String(clientId || '')) ? clientId : null])).rows[0].id;
  }
  // the motif's state is written into the plan's program one at a time (read, change one motif, write)
  const setMotif = async (planId, mid, patch) => {
    const pr = (await pool.query('select program from lab_plans where id=$1', [planId])).rows[0]?.program; if (!pr) return;
    const next = cleanProgram({ ...pr, motifs: pr.motifs.map(m => (m.id === mid ? { ...m, ...patch } : m)) });
    await pool.query('update lab_plans set program=$2, updated_at=now() where id=$1', [planId, next ? JSON.stringify(next) : null]);
  };
  // draw every motif of a plan's program that is waiting for its artwork
  function drawProgram(planId, only = null) {
    enqueue(async () => {
      const pr = (await pool.query('select program from lab_plans where id=$1', [planId])).rows[0]?.program; if (!pr) return;
      for (const m of pr.motifs.filter(m => (only ? m.id === only : m.artStatus === 'pending'))) {
        try { const id = await drawAndStore(m, { program: pr, planId, technique: 'screen print' }); await setMotif(planId, m.id, { art: id, artStatus: 'ready', artNote: '' }); }
        catch (e) { await setMotif(planId, m.id, { artStatus: 'failed', artNote: clip(e.message, 180) }); }
      }
    });
  }
  const load = async ids => new Map((await pool.query('select id, png from lab_art where id = any($1::uuid[])', [ids.filter(i => UUID.test(String(i)))])).rows.map(r => [r.id, r.png]));
  return { drawAndStore, drawProgram, load, idle, capLeft };
}

// The small copy of a graphic, as the pages show it in their tiles. It is kept as a 360 px PNG (about 230 KB for a painted graphic); the
// tiles get it as WebP with its transparency, about a tenth of that, made once and remembered (an artwork never changes). The Studio opens
// with two dozen of them. The full PNG, the one that is placed and printed, is untouched.
const SMALL = new Map();
async function smallThumb(id, png) {
  if (SMALL.has(id)) return SMALL.get(id);
  let out = null; try { const b = await sharp(png).webp({ quality: 82, alphaQuality: 90 }).toBuffer(); if (b.length < png.length) out = b; } catch { out = null; }
  SMALL.set(id, out); if (SMALL.size > 600) SMALL.delete(SMALL.keys().next().value);
  return out;
}

export function registerLabArtRoutes(app, { pool, authenticate, adminOnly, art, lab = null }) {
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  app.get('/v1/lab/art/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select png, thumb, created_at from lab_art where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (req.query?.thumb) { const small = await smallThumb(req.params.id, r.thumb); if (small) return reply.header('content-type', 'image/webp').header('cache-control', 'private, max-age=86400, immutable').send(small); }
    return reply.header('content-type', 'image/png').header('cache-control', 'private, max-age=86400, immutable').send(req.query?.thumb ? r.thumb : r.png); // a drawn artwork never changes: drawing again makes a new one
  });
  app.post('/v1/lab/plans/:id/program/motifs/:mid/art', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const pr = (await pool.query('select program from lab_plans where id=$1', [req.params.id])).rows[0]?.program; if (!pr) return bad(reply, 'This plan has no graphic program yet', 404);
    const m = pr.motifs.find(x => x.id === req.params.mid); if (!m) return bad(reply, 'Not found', 404);
    if (!imageConfig().configured) return bad(reply, 'No image model is connected, so the artwork cannot be drawn.', 503);
    const left = await art.capLeft(1); if (left !== true) return bad(reply, `The daily limit of ${left} artworks is reached. Raise LAB_DAILY_ART.`, 429);
    if (lab) { try { await lab.charge(req, { kind: 'motif' }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); } }
    const next = cleanProgram({ ...pr, motifs: pr.motifs.map(x => (x.id === m.id ? { ...x, artStatus: 'pending', artNote: '' } : x)) });
    await pool.query('update lab_plans set program=$2, updated_at=now() where id=$1', [req.params.id, JSON.stringify(next)]);
    art.drawProgram(req.params.id, m.id);
    return reply.code(202).send({ ok: true });
  });
}
