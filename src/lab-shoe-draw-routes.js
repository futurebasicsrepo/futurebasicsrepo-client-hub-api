// A shoe's drawing in the Studio (src/lab-shoe-draw.js): the concept drawn as a footwear technical flat in five views and traced into vector
// panels the designer recolours, renames and reshapes. The Pattern page reads the shoe from the outside view, and the tech pack takes these views.
//   GET  /v1/lab/concepts/:id/shoe-drawing                 the views: how each is getting on, and its panels
//   POST /v1/lab/concepts/:id/shoe-drawing {views?, redo?}  draw them (in the background; the outside first, from the shoe's side profile)
//   PUT  /v1/lab/concepts/:id/shoe-drawing/:view {panels, hideDetails?}   the designer's edits
//   POST /v1/lab/concepts/:id/shoe-drawing/:view/reset      back to the drawing as traced
//   GET  /v1/lab/concepts/:id/shoe-drawing/:view.svg | ?art=1   the drawing as SVG, or the line art the image model drew (PNG)
// LAB_DAILY_SHOE_DRAWINGS (default 60) caps the views drawn a day across the platform.
import { imageConfig, openaiEdit } from './check.js';
import { makeViews } from './lab-views.js';
import { SHOE_VIEWS, SHOE_VIEW_IDS, makeShoeDrawings, traceShoe, shoeSvg, cleanDrawing } from './lab-shoe-draw.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_MIN = 20;

export function registerLabShoeDrawRoutes(app, d) {
  const { pool, authenticate, adminOnly, env = process.env, imageCfg = () => imageConfig(env), edit = openaiEdit, lab = null, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const charge = async (req, o) => (lab ? lab.charge(req, o) : null), refund = async req => { try { await lab?.refund?.(req); } catch {} };
  const concept = async id => (UUID.test(String(id)) ? (await pool.query('select id, name, category, status, twist, spec, (image is not null) has_image from lab_concepts where id=$1', [id])).rows[0] : null);
  const running = new Map();

  async function views(id) {
    const rows = (await pool.query(`select view, status, note, model, edited, drawing, updated_at, (updated_at < now() - make_interval(mins => $2)) stale from lab_shoe_drawings where concept_id=$1`, [id, STALE_MIN])).rows;
    return Object.fromEntries(rows.map(r => {
      const lost = r.status === 'pending' && r.stale && !running.has(id);
      return [r.view, { status: lost ? 'failed' : r.status, note: lost ? 'Lost to a restart: draw it again.' : r.note, edited: r.edited, model: r.model, at: r.updated_at, ...(r.status === 'ready' && r.drawing ? { drawing: r.drawing } : {}) }];
    }));
  }
  const shape = async c => ({ concept: { id: c.id, name: c.name, category: c.category, status: c.status, hasImage: c.has_image }, kinds: SHOE_VIEWS, views: await views(c.id), imageConnected: imageCfg().configured, busy: running.has(c.id) });

  // the side profile the outside is drawn from: the board's flat front view (a shoe's is its clean side profile), drawn from the picture when missing
  async function sideOf(c, cfg) {
    const v = (await pool.query(`select image from lab_concept_views where concept_id=$1 and kind='flat_front' and status='ready' and image is not null`, [c.id])).rows[0]?.image;
    if (v) return v;
    const pic = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image; if (!pic) return null;
    if (cfg.provider === 'fixture') return pic;
    const got = await makeViews({ concept: { name: c.name, category: 'footwear', twist: c.twist, spec: c.spec || {} }, picture: pic, kinds: ['flat_front'], cfg, edit,
      onView: async (kind, r) => { if (r) await pool.query(`insert into lab_concept_views(concept_id,kind,status,image,thumb,model) values($1,$2,'ready',$3,$4,$5) on conflict (concept_id,kind) do update set status='ready', image=$3, thumb=$4, model=$5, note='', updated_at=now()`, [c.id, kind, r.image, r.thumb, r.model || '']); } });
    return got.flat_front || null;
  }

  async function start(c, want, { redo = false } = {}) {
    const have = Object.fromEntries((await pool.query(`select view, art from lab_shoe_drawings where concept_id=$1 and status='ready' and art is not null`, [c.id])).rows.map(r => [r.view, r.art]));
    const todo = want.filter(v => redo || !have[v]); if (!todo.length) return 0;
    for (const v of todo) await pool.query(`insert into lab_shoe_drawings(concept_id,view,status,note) values($1,$2,'pending','') on conflict (concept_id,view) do update set status='pending', note='', updated_at=now()`, [c.id, v]);
    const cfg = imageCfg(), keep = redo ? Object.fromEntries(Object.entries(have).filter(([v]) => !todo.includes(v))) : have;
    const job = (async () => {
      try {
        const side = todo.includes('lateral') || !keep.lateral ? await sideOf(c, cfg) : null;
        if ((todo.includes('lateral') || !keep.lateral) && !side) throw new Error('The shoe\'s side profile could not be drawn from its picture');
        await makeShoeDrawings({ side, name: c.name, views: todo, have: keep, cfg, edit,
          onView: async (v, r, note) => {
            if (r) await pool.query(`update lab_shoe_drawings set status='ready', art=$3, drawing=$4, model=$5, note='', edited=false, updated_at=now() where concept_id=$1 and view=$2`, [c.id, v, r.art, r.drawing, r.model || '']);
            else await pool.query(`update lab_shoe_drawings set status='failed', note=$3, updated_at=now() where concept_id=$1 and view=$2`, [c.id, v, note]);
          } });
      } catch (e) { log.warn?.({ err: e.message }, 'shoe drawing failed'); await pool.query(`update lab_shoe_drawings set status='failed', note=$2, updated_at=now() where concept_id=$1 and status='pending'`, [c.id, `Could not be drawn: ${String(e.message).slice(0, 160)}`]); }
      finally { running.delete(c.id); }
    })();
    running.set(c.id, job);
    return todo.length;
  }

  app.get('/v1/lab/concepts/:id/shoe-drawing', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (c.category !== 'footwear') return bad(reply, 'Shoe drawings are made for footwear concepts');
    return shape(c);
  });
  app.post('/v1/lab/concepts/:id/shoe-drawing', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (c.category !== 'footwear') return bad(reply, 'Shoe drawings are made for footwear concepts');
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    if (!c.has_image) return bad(reply, 'This concept has no picture to draw the shoe from. Draw its picture first.', 409);
    if (!imageCfg().configured) return bad(reply, 'No image model is connected, so the shoe cannot be drawn.', 503);
    if (running.has(c.id)) return bad(reply, 'The shoe is being drawn already', 409);
    const want = (Array.isArray(req.body?.views) ? req.body.views.filter(v => SHOE_VIEW_IDS.includes(v)) : SHOE_VIEW_IDS); if (!want.length) return bad(reply, 'Nothing to draw');
    const cap = Number(env.LAB_DAILY_SHOE_DRAWINGS ?? 60);
    if (cap >= 0) { const n = Number((await pool.query(`select count(*)::int n from lab_shoe_drawings where updated_at > now() - interval '24 hours' and status in ('ready','pending')`)).rows[0].n); if (n + want.length > cap) return bad(reply, `The daily limit of ${cap} shoe drawings is reached. Raise LAB_DAILY_SHOE_DRAWINGS.`, 429); }
    try { await charge(req, { kind: 'flat', units: want.length, conceptId: c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    const n = await start(c, want, { redo: Boolean(req.body?.redo) }); if (!n) await refund(req);
    return reply.code(202).send({ started: n, ...(await shape(c)) });
  });
  const viewOf = (req, reply) => { const v = String(req.params.view || '').replace(/\.svg$/, ''); if (!SHOE_VIEW_IDS.includes(v)) { bad(reply, 'Not found', 404); return null; } return v; };
  const row = async (c, v) => (await pool.query(`select art, drawing, edited from lab_shoe_drawings where concept_id=$1 and view=$2 and status='ready'`, [c.id, v])).rows[0];
  app.put('/v1/lab/concepts/:id/shoe-drawing/:view', { preHandler: pre, bodyLimit: 4_000_000 }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404); const v = viewOf(req, reply); if (!v) return;
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const r = await row(c, v); if (!r?.drawing) return bad(reply, 'This view is not drawn yet', 409);
    const dw = cleanDrawing(req.body, r.drawing); if (!dw) return bad(reply, 'The drawing has no panels');
    await pool.query(`update lab_shoe_drawings set drawing=$3, edited=true, updated_at=now() where concept_id=$1 and view=$2`, [c.id, v, dw]);
    return { ok: true, drawing: dw };
  });
  app.post('/v1/lab/concepts/:id/shoe-drawing/:view/reset', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404); const v = viewOf(req, reply); if (!v) return;
    const r = await row(c, v); if (!r?.art) return bad(reply, 'This view is not drawn yet', 409);
    const { svg, ...dw } = await traceShoe(r.art);
    await pool.query(`update lab_shoe_drawings set drawing=$3, edited=false, updated_at=now() where concept_id=$1 and view=$2`, [c.id, v, dw]);
    return { ok: true, drawing: dw };
  });
  app.get('/v1/lab/concepts/:id/shoe-drawing/:view', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404); const v = viewOf(req, reply); if (!v) return;
    const r = await row(c, v); if (!r) return bad(reply, 'Not drawn yet', 404);
    reply.header('cache-control', 'private, no-cache');
    if (req.query?.art) return reply.type('image/png').send(r.art);
    return reply.type('image/svg+xml; charset=utf-8').send(shoeSvg(r.drawing, { width: req.query?.w ? Math.min(4000, Math.max(100, Number(req.query.w) || 1200)) : null }));
  });
  return { idle: async () => { await Promise.all([...running.values()]); } };
}

// the drawing of one view as SVG, or null: for the Pattern page (the shoe read from its outside drawing) and the tech pack
export async function shoeDrawingOf(pool, conceptId, view) {
  const r = (await pool.query(`select drawing from lab_shoe_drawings where concept_id=$1 and view=$2 and status='ready' and drawing is not null`, [conceptId, view])).rows[0];
  return r ? r.drawing : null;
}
