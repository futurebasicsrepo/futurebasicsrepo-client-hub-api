// A shoe's drawing in the Studio (src/lab-shoe-draw.js): the concept drawn as a footwear technical flat in five views and traced into vector
// panels the designer recolours, renames and reshapes. The Pattern page reads the shoe from the outside view, and the tech pack takes these views.
//   GET  /v1/lab/concepts/:id/shoe-drawing                 the views: how each is getting on, and its panels
//   POST /v1/lab/concepts/:id/shoe-drawing {views?, redo?}  draw them (in the background; the outside first, from the shoe's side profile)
//   PUT  /v1/lab/concepts/:id/shoe-drawing/:view {panels, hideDetails?}   the designer's edits
//   POST /v1/lab/concepts/:id/shoe-drawing/:view/reset      back to the drawing as traced
//   GET  /v1/lab/concepts/:id/shoe-drawing/:view.svg | ?art=1   the drawing as SVG, or the line art the image model drew (PNG)
// LAB_DAILY_SHOE_DRAWINGS (default 60) caps the views drawn a day across the platform.
import { planLineOf, putOnLine } from './lab.js';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { imageConfig, openaiEdit } from './check.js';
import { BAG_TEMPLATES } from './lab-bag-templates.js';
import { makeViews } from './lab-views.js';
import { DRAWN, viewsOf, firstOf, makeShoeDrawings, traceShoe, shoeSvg, cleanDrawing } from './lab-shoe-draw.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_MIN = 20;
// a library bag's drawings (src/bag-templates, built by scripts/bag-templates/build.mjs), read once
const LIB = new Map();
// the library bag's body (its largest colour on the front, the light grey) in another colour, on every view
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function recolourBody(views, hex) {
  const area = new Map(); for (const p of views.front?.panels || []) area.set(p.fill, (area.get(p.fill) || 0) + p.area);
  const body = [...area.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; if (!body) return views; const B = rgbOf(body);
  const near = f => { const c = rgbOf(f); return Math.hypot(c[0] - B[0], c[1] - B[1], c[2] - B[2]) < 30; };
  return Object.fromEntries(Object.entries(views).map(([v, dw]) => [v, { ...dw, panels: dw.panels.map(p => near(p.fill) ? { ...p, fill: hex } : p) }]));
}
export function libraryBag(id) {
  if (!BAG_TEMPLATES.some(t => t.id === id)) return null;
  if (!LIB.has(id)) { try { LIB.set(id, JSON.parse(readFileSync(new URL(`./bag-templates/${id}.json`, import.meta.url), 'utf8'))); } catch { return null; } }
  return LIB.get(id);
}

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
  const shape = async c => ({ concept: { id: c.id, name: c.name, category: c.category, status: c.status, hasImage: c.has_image }, kinds: viewsOf(c.category), first: firstOf(c.category), noun: DRAWN[c.category]?.noun || 'piece', views: await views(c.id), imageConnected: imageCfg().configured, busy: running.has(c.id) });

  // what the first view is drawn from: the board's flat front view (a shoe's clean side profile, a bag's front on white), drawn from the picture when missing
  async function sideOf(c, cfg) {
    const v = (await pool.query(`select image from lab_concept_views where concept_id=$1 and kind='flat_front' and status='ready' and image is not null`, [c.id])).rows[0]?.image;
    if (v) return v;
    const pic = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image; if (!pic) return null;
    if (cfg.provider === 'fixture') return pic;
    const got = await makeViews({ concept: { name: c.name, category: c.category, twist: c.twist, spec: c.spec || {} }, picture: pic, kinds: ['flat_front'], cfg, edit,
      onView: async (kind, r) => { if (r) await pool.query(`insert into lab_concept_views(concept_id,kind,status,image,thumb,model) values($1,$2,'ready',$3,$4,$5) on conflict (concept_id,kind) do update set status='ready', image=$3, thumb=$4, model=$5, note='', updated_at=now()`, [c.id, kind, r.image, r.thumb, r.model || '']); } });
    return got.flat_front || null;
  }

  async function start(c, want, { redo = false } = {}) {
    // what is drawn already: its line art, or (a view from the library, or one the designer edited) its drawing rendered, so the views drawn from it
    // follow what is there now
    const rows = (await pool.query(`select view, art, drawing, edited from lab_shoe_drawings where concept_id=$1 and status='ready' and (art is not null or drawing is not null)`, [c.id])).rows, have = {};
    for (const r of rows) have[r.view] = r.art && !r.edited ? r.art : r.drawing ? await sharp(Buffer.from(shoeSvg(r.drawing, { width: 1024 }))).flatten({ background: '#ffffff' }).png().toBuffer() : r.art;
    const todo = want.filter(v => redo || !have[v]); if (!todo.length) return 0;
    for (const v of todo) await pool.query(`insert into lab_shoe_drawings(concept_id,view,status,note) values($1,$2,'pending','') on conflict (concept_id,view) do update set status='pending', note='', updated_at=now()`, [c.id, v]);
    const cfg = imageCfg(), keep = redo ? Object.fromEntries(Object.entries(have).filter(([v]) => !todo.includes(v))) : have;
    const job = (async () => {
      try {
        const first = firstOf(c.category), side = todo.includes(first) || !keep[first] ? await sideOf(c, cfg) : null;
        if ((todo.includes(first) || !keep[first]) && !side) throw new Error(`The ${DRAWN[c.category].noun}'s ${c.category === 'bags' ? 'front' : 'side profile'} could not be drawn from its picture`);
        await makeShoeDrawings({ side, name: c.name, category: c.category, views: todo, have: keep, cfg, edit,
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
    if (!DRAWN[c.category]) return bad(reply, 'Drawings in panels are made for shoes and bags');
    return shape(c);
  });
  app.post('/v1/lab/concepts/:id/shoe-drawing', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (!DRAWN[c.category]) return bad(reply, 'Drawings in panels are made for shoes and bags');
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const hasFirst = (await pool.query(`select 1 from lab_shoe_drawings where concept_id=$1 and view=$2 and status='ready'`, [c.id, firstOf(c.category)])).rowCount > 0;
    if (!c.has_image && !(hasFirst && !req.body?.redo)) return bad(reply, `This concept has no picture to draw the ${DRAWN[c.category].noun} from. Draw its picture first, or start it from the library.`, 409);
    if (!imageCfg().configured) return bad(reply, `No image model is connected, so the ${DRAWN[c.category].noun} cannot be drawn.`, 503);
    if (running.has(c.id)) return bad(reply, `The ${DRAWN[c.category].noun} is being drawn already`, 409);
    const ids = viewsOf(c.category).map(v => v.id), want = (Array.isArray(req.body?.views) ? req.body.views.filter(v => ids.includes(v)) : ids); if (!want.length) return bad(reply, 'Nothing to draw');
    const cap = Number(env.LAB_DAILY_SHOE_DRAWINGS ?? 60);
    if (cap >= 0) { const n = Number((await pool.query(`select count(*)::int n from lab_shoe_drawings where updated_at > now() - interval '24 hours' and status in ('ready','pending')`)).rows[0].n); if (n + want.length > cap) return bad(reply, `The daily limit of ${cap} shoe drawings is reached. Raise LAB_DAILY_SHOE_DRAWINGS.`, 429); }
    try { await charge(req, { kind: 'flat', units: want.length, conceptId: c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    const n = await start(c, want, { redo: Boolean(req.body?.redo) }); if (!n) await refund(req);
    return reply.code(202).send({ started: n, ...(await shape(c)) });
  });
  const viewOf = (req, reply, c) => { const v = String(req.params.view || '').replace(/\.svg$/, ''); if (!viewsOf(c?.category).some(k => k.id === v)) { bad(reply, 'Not found', 404); return null; } return v; };
  const row = async (c, v) => (await pool.query(`select art, drawing, edited from lab_shoe_drawings where concept_id=$1 and view=$2 and status='ready'`, [c.id, v])).rows[0];
  app.put('/v1/lab/concepts/:id/shoe-drawing/:view', { preHandler: pre, bodyLimit: 4_000_000 }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404); const v = viewOf(req, reply, c); if (!v) return;
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const r = await row(c, v); if (!r?.drawing) return bad(reply, 'This view is not drawn yet', 409);
    const dw = cleanDrawing(req.body, r.drawing); if (!dw) return bad(reply, 'The drawing has no panels');
    await pool.query(`update lab_shoe_drawings set drawing=$3, edited=true, updated_at=now() where concept_id=$1 and view=$2`, [c.id, v, dw]);
    return { ok: true, drawing: dw };
  });
  // start a bag's drawing from a bag in the library (no image model): every view of it, ready to recolour and reshape
  app.get('/v1/lab/library/bags', { preHandler: pre }, async () => ({ bags: BAG_TEMPLATES }));
  app.get('/v1/lab/library/bags/:tid', { preHandler: pre }, async (req, reply) => { const t = libraryBag(String(req.params.tid)); return t || bad(reply, 'Not found', 404); });
  // a new bag concept from a library bag (the Sketch library's Open in the Studio): its drawings in place, the body in the chosen colour; no AI
  app.post('/v1/lab/concepts/from-library-bag', { preHandler: pre }, async (req, reply) => {
    const t = libraryBag(String(req.body?.template || '')); if (!t) return bad(reply, 'Choose a bag from the library', 422);
    const line = req.body?.lineId ? await planLineOf(pool, req.body.lineId, lab?.scope?.(req) || null) : null; if (req.body?.lineId && !line) return bad(reply, 'That piece is not on a line plan here', 404);
    const hex = /^#[0-9a-f]{6}$/i.test(String(req.body?.colour?.hex || '')) ? String(req.body.colour.hex).toLowerCase() : '', cname = String(req.body?.colour?.name || '').replace(/[<>]/g, '').slice(0, 40);
    const name = String(req.body?.name || '').replace(/[<>]/g, '').trim().slice(0, 120) || line?.name || t.label;
    const spec = { description: `Started from the library: ${t.label}.`, silhouette: t.label, fabric: '', fit: '', details: [], trims: '', colors: hex ? [cname || hex] : [], bag: { type: t.type }, libraryBag: t.id };
    const actor = /^[0-9a-f-]{36}$/i.test(String(req.auth?.sub || '')) ? req.auth.sub : null, room = lab?.scope?.(req) || null;
    const id = (await pool.query(`insert into lab_concepts(name, category, role, spec, twist, created_by, client_id) values($1,'bags','core',$2,'',$3,$4) returning id`, [name, spec, actor, room])).rows[0].id;
    if (line) await putOnLine(pool, id, line);
    const views = hex ? recolourBody(t.views, hex) : t.views;
    for (const [v, dw] of Object.entries(views)) await pool.query(`insert into lab_shoe_drawings(concept_id,view,status,art,drawing,model,edited) values($1,$2,'ready',null,$3,'library',$4)`, [id, v, dw, Boolean(hex)]);
    return reply.code(201).send({ concept: { id, name, category: 'bags' }, studio: `/lab/studio?concept=${id}&view=front` });
  });
  app.post('/v1/lab/concepts/:id/shoe-drawing/from-library', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (c.category !== 'bags') return bad(reply, 'A library bag starts a bag concept\'s drawing');
    if (c.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    if (running.has(c.id)) return bad(reply, 'The bag is being drawn already', 409);
    const t = libraryBag(String(req.body?.template || '')); if (!t) return bad(reply, 'Unknown library bag', 404);
    await pool.query('delete from lab_shoe_drawings where concept_id=$1', [c.id]);
    for (const [v, dw] of Object.entries(t.views)) await pool.query(`insert into lab_shoe_drawings(concept_id,view,status,art,drawing,model,edited) values($1,$2,'ready',null,$3,'library',false)`, [c.id, v, dw]);
    // the bag's kind follows the library bag, unless the concept already says one
    if (!c.spec?.bag?.type) await pool.query(`update lab_concepts set spec = jsonb_set(coalesce(spec,'{}'::jsonb), '{bag}', $2::jsonb), updated_at=now() where id=$1`, [c.id, JSON.stringify({ type: t.type })]);
    return { ok: true, template: t.id, ...(await shape(c)) };
  });
  app.post('/v1/lab/concepts/:id/shoe-drawing/:view/reset', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404); const v = viewOf(req, reply, c); if (!v) return;
    const r = await row(c, v); if (!r) return bad(reply, 'This view is not drawn yet', 409);
    // a view that came from the library goes back to the library's drawing; a drawn one is traced again from its line art
    const lib = String(r.drawing?.source || '').startsWith('library:') ? libraryBag(r.drawing.source.slice(8))?.views?.[v] : null;
    if (!r.art && !lib) return bad(reply, 'This view has nothing to go back to', 409);
    const { svg, ...dw } = lib ? { ...lib } : await traceShoe(r.art);
    await pool.query(`update lab_shoe_drawings set drawing=$3, edited=false, updated_at=now() where concept_id=$1 and view=$2`, [c.id, v, dw]);
    return { ok: true, drawing: dw };
  });
  app.get('/v1/lab/concepts/:id/shoe-drawing/:view', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404); const v = viewOf(req, reply, c); if (!v) return;
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
