// The materials, trims and tags library (the page is src/lab-materials.html at /lab/materials), and what a concept is made of.
//   GET  /v1/lab/materials?kind=&q=&for=            the library, with the choices the forms offer
//   POST /v1/lab/materials {kind, name, spec, price, unit, supplier, code, moq, leadDays, colours, notes, swatch?}    PUT|DELETE /v1/lab/materials/:id
//   POST /v1/lab/materials/:id/swatch {image}        GET /v1/lab/materials/:id/swatch[?thumb=1]      GET /v1/lab/materials/:id/tag.svg
//   GET  /v1/lab/concepts/:id/materials              what the concept is made of, what it costs, its colourways
//   POST /v1/lab/concepts/:id/materials {material, role?, qty?, colour?, note?}     PUT|DELETE /v1/lab/concepts/:id/materials/:mid
//   PUT  /v1/lab/concepts/:id/costing {making?, freightPct?}      PUT /v1/lab/concepts/:id/colourways {colourways:[{name, hex, thread?}]}
import sharp from 'sharp';
import './pantone-c.js';
import { BUILTIN_MATERIALS, MATERIAL_KINDS, FABRIC_CONSTRUCTIONS, FABRIC_FINISHES, TRIM_CATEGORIES, UNITS, ROLES, TAG_OPTIONS, USAGE_M, MAKING_CENTS, FREIGHT_DUTY_PCT, cleanMaterial, cleanPick, costOf, cleanColourways } from './lab-materials.js';
import { tagSvg } from './lab-tags.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const pictureOf = dataUrl => { const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || '')); return m ? Buffer.from(m[2], 'base64') : null; };
const shape = r => ({ id: r.id, key: r.key, kind: r.kind, name: r.name, code: r.code, supplier: r.supplier, priceCents: r.price_cents, price: r.price_cents / 100, unit: r.unit, moq: r.moq, leadDays: r.lead_days, spec: r.spec || {}, colours: r.colours || [], notes: r.notes, hasSwatch: Boolean(r.has_swatch), builtin: r.builtin, updatedAt: r.updated_at, shared: !r.client_id, by: r.by_name || '' });
const COLS = 'id, key, kind, name, code, supplier, price_cents, unit, moq, lead_days, spec, colours, notes, (swatch is not null) has_swatch, builtin, updated_at, client_id, (select coalesce(nullif(u.name,\'\'), split_part(u.email,\'@\',1)) from users u where u.id=lab_materials.created_by) by_name';

export function registerLabMaterialsRoutes(app, d) {
  const { pool, authenticate, adminOnly, lab = null, log = console } = d;
  // a room's library: the materials its team adds, beside Future Basics' shared ones (client_id null) which every room reads and uses but cannot change
  const own = req => lab?.scope?.(req) || null, mine = (req, m) => (own(req) ? m.client_id === own(req) : true);
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const need = (req, reply, k = 'id') => UUID.test(String(req.params[k])) || (bad(reply, 'Not found', 404), false);
  const P = globalThis.FBPantone;

  // the starting set goes in once; after that it is ours to change (a changed row is never put back)
  // put in at start-up; when that runs before the tables exist (a new database migrates after the routes are registered) it is tried again on next use
  let seeding = null; const seeded = () => (seeding ||= (async () => {
    for (const m of BUILTIN_MATERIALS) {
      const c = cleanMaterial(m); if (c.error) continue; const x = c.material;
      await pool.query(`insert into lab_materials(key,kind,name,code,supplier,price_cents,unit,moq,lead_days,spec,colours,notes,builtin) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) on conflict(key) do nothing`,
        [m.key, x.kind, x.name, x.code, x.supplier, x.priceCents, x.unit, x.moq, x.leadDays, x.spec, JSON.stringify(x.colours), x.notes]);
    }
  })().catch(e => { seeding = null; log.warn?.({ err: e.message }, 'the starting materials could not be put in'); }));
  seeded();
  const one = async (id, req = null) => (UUID.test(String(id || '')) ? (await pool.query(`select ${COLS} from lab_materials where id=$1 and not archived and ($2::uuid is null or client_id is null or client_id=$2)`, [id, req ? own(req) : null])).rows[0] || null : null);
  const options = () => ({ kinds: MATERIAL_KINDS, fabric: { constructions: FABRIC_CONSTRUCTIONS, finishes: FABRIC_FINISHES }, trim: { categories: TRIM_CATEGORIES }, tag: TAG_OPTIONS, units: UNITS, roles: ROLES, usageM: USAGE_M, makingCents: MAKING_CENTS, freightPct: FREIGHT_DUTY_PCT });
  const withPantone = colours => colours.map(c => ({ ...c, pantone: c.pantone || (c.hex && P ? P.code(c.hex, { hint: c.name }) : '') }));

  app.get('/v1/lab/materials', { preHandler: pre }, async req => {
    await seeded();
    const q = req.query || {}, where = ['not archived'], args = [];
    if (own(req)) { args.push(own(req)); where.push(`(client_id is null or client_id=$${args.length})`); } else if (q.room !== 'all') where.push('client_id is null'); // staff see our library; ?room=all adds every room's
    if (MATERIAL_KINDS.some(k => k.id === q.kind)) { args.push(q.kind); where.push(`kind=$${args.length}`); }
    if (clip(q.q, 80)) { args.push(`%${clip(q.q, 80).toLowerCase()}%`); where.push(`(lower(name) like $${args.length} or lower(code) like $${args.length} or lower(supplier) like $${args.length} or lower(spec::text) like $${args.length})`); }
    if (clip(q.for, 20)) { args.push(clip(q.for, 20).toLowerCase()); where.push(`(kind <> 'tag' or spec->'for' ? $${args.length})`); }
    const rows = (await pool.query(`select ${COLS} from lab_materials where ${where.join(' and ')} order by array_position($${args.length + 1}::text[], kind), builtin desc, name limit 400`, [...args, MATERIAL_KINDS.map(k => k.id)])).rows;
    return { materials: rows.map(r => ({ ...shape(r), editable: mine(req, r) })), options: options(), room: Boolean(own(req)) };
  });
  app.post('/v1/lab/materials', { preHandler: pre, bodyLimit: 12_000_000 }, async (req, reply) => {
    const c = cleanMaterial(req.body || {}); if (c.error) return bad(reply, c.error); const x = c.material;
    let swatch = null, thumb = null; const buf = pictureOf(req.body?.swatch);
    if (buf) { try { swatch = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer(); thumb = await sharp(buf).rotate().resize({ width: 240, height: 240, fit: 'cover' }).jpeg({ quality: 78 }).toBuffer(); } catch { return bad(reply, 'The swatch picture could not be read'); } }
    const r = (await pool.query(`insert into lab_materials(kind,name,code,supplier,price_cents,unit,moq,lead_days,spec,colours,notes,swatch,thumb,created_by,client_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning ${COLS}`,
      [x.kind, x.name, x.code, x.supplier, x.priceCents, x.unit, x.moq, x.leadDays, x.spec, JSON.stringify(withPantone(x.colours)), x.notes, swatch, thumb, actorOf(req), own(req)])).rows[0];
    return reply.code(201).send({ material: { ...shape(r), editable: true } });
  });
  app.put('/v1/lab/materials/:id', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    const c = cleanMaterial(req.body || {}, shape(cur)); if (c.error) return bad(reply, c.error); const x = c.material;
    const r = (await pool.query(`update lab_materials set kind=$2,name=$3,code=$4,supplier=$5,price_cents=$6,unit=$7,moq=$8,lead_days=$9,spec=$10,colours=$11,notes=$12,updated_at=now() where id=$1 returning ${COLS}`,
      [cur.id, x.kind, x.name, x.code, x.supplier, x.priceCents, x.unit, x.moq, x.leadDays, x.spec, JSON.stringify(withPantone(x.colours)), x.notes])).rows[0];
    // pieces that use it carry its new name, price and spec
    await pool.query(`update lab_concepts set spec = jsonb_set(spec, '{materials}', (select coalesce(jsonb_agg(case when m->>'id'=$1 then m || $2::jsonb else m end), '[]'::jsonb) from jsonb_array_elements(spec->'materials') m)) where spec->'materials' @> $3::jsonb`,
      [cur.id, JSON.stringify({ name: x.name, unitCents: x.priceCents, unit: x.unit, code: x.code, supplier: x.supplier, spec: x.spec }), JSON.stringify([{ id: cur.id }])]);
    return { material: { ...shape(r), editable: true } };
  });
  app.delete('/v1/lab/materials/:id', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const r = await pool.query('update lab_materials set archived=true, updated_at=now() where id=$1 and not archived', [req.params.id]);
    return r.rowCount ? { ok: true } : bad(reply, 'Not found', 404);
  });
  app.post('/v1/lab/materials/:id/swatch', { preHandler: pre, bodyLimit: 12_000_000 }, async (req, reply) => {
    if (!need(req, reply)) return; const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send the swatch as a picture');
    try { const swatch = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer(), thumb = await sharp(buf).rotate().resize({ width: 240, height: 240, fit: 'cover' }).jpeg({ quality: 78 }).toBuffer();
      const r = await pool.query('update lab_materials set swatch=$2, thumb=$3, updated_at=now() where id=$1 and not archived', [req.params.id, swatch, thumb]); return r.rowCount ? { ok: true } : bad(reply, 'Not found', 404); }
    catch { return bad(reply, 'The swatch picture could not be read'); }
  });
  app.get('/v1/lab/materials/:id/swatch', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const r = (await pool.query('select swatch, thumb from lab_materials where id=$1', [req.params.id])).rows[0]; if (!r?.swatch) return bad(reply, 'Not found', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=3600').send(req.query?.thumb ? r.thumb : r.swatch);
  });
  app.get('/v1/lab/materials/:id/tag.svg', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const m = await one(req.params.id); if (!m || m.kind !== 'tag') return bad(reply, 'Not found', 404);
    const q = req.query || {}, text = q.text ? String(q.text).split('/').map(t => clip(t, 40)).filter(Boolean) : null;
    return reply.header('content-type', 'image/svg+xml').header('cache-control', 'private, max-age=600').send(tagSvg(m.spec, { scale: Number(q.scale) || 3, textLines: text, art: UUID.test(String(m.spec?.art || '')) ? `/v1/lab/art/${m.spec.art}` : '' }));
  });

  // ---- what a concept is made of ----
  const concept = async id => (UUID.test(String(id || '')) ? (await pool.query('select id, category, spec, price_cents, cost_cents, status from lab_concepts where id=$1', [id])).rows[0] || null : null);
  const picksOf = c => (Array.isArray(c.spec?.materials) ? c.spec.materials : []);
  const costing = c => ({ makingCents: Number.isFinite(Number(c.spec?.costing?.makingCents)) ? Number(c.spec.costing.makingCents) : null, freightPct: Number.isFinite(Number(c.spec?.costing?.freightPct)) ? Number(c.spec.costing.freightPct) : FREIGHT_DUTY_PCT });
  const decosOf = c => (Array.isArray(c.spec?.decorations) ? c.spec.decorations : []);
  const summary = c => { const k = costing(c); return { picks: picksOf(c), cost: costOf(picksOf(c), { category: c.category, priceCents: c.price_cents, makingCents: k.makingCents, freightPct: k.freightPct, decorations: decosOf(c) }), colourways: cleanColourways(c.spec?.colourways), costing: k }; };
  // the concept's landed cost follows its materials once it has any; the plan's margin reads it
  const store = async (c, spec) => {
    const s = summary({ ...c, spec }), landed = s.picks.length || s.cost.decorations.length ? s.cost.landedCents : c.cost_cents;
    await pool.query('update lab_concepts set spec=$2, cost_cents=$3, updated_at=now() where id=$1', [c.id, spec, landed]);
    return { ...s, cost: { ...s.cost, landedCents: landed ?? s.cost.landedCents } };
  };
  app.get('/v1/lab/concepts/:id/materials', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    return summary(c);
  });
  app.post('/v1/lab/concepts/:id/materials', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const m = await one(req.body?.material, req); if (!m) return bad(reply, 'That material is not in the library', 404);
    const picks = picksOf(c); if (picks.length >= 40) return bad(reply, 'This concept already lists 40 materials', 409);
    const pick = cleanPick(req.body || {}, shape(m), c.category);
    if (pick.role === 'main' && m.kind === 'fabric') picks.forEach(p => { if (p.role === 'main' && p.kind === 'fabric') p.role = 'contrast'; }); // one main fabric; the one before becomes the contrast
    const spec = { ...(c.spec || {}), materials: [...picks.filter(p => !(p.id === m.id && p.role === pick.role)), pick] };
    if (m.kind === 'fabric' && pick.role === 'main') spec.fabric = clip(`${m.name}${pick.colour?.name ? `, ${pick.colour.name}` : ''}`, 160); // the words on the concept follow the fabric
    return reply.code(201).send(await store(c, spec));
  });
  app.put('/v1/lab/concepts/:id/materials/:mid', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply) || !need(req, reply, 'mid')) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const picks = picksOf(c), i = picks.findIndex(p => p.id === req.params.mid); if (i < 0) return bad(reply, 'That material is not on this concept', 404);
    const m = await one(req.params.mid), base = m ? shape(m) : { id: picks[i].id, kind: picks[i].kind, name: picks[i].name, unit: picks[i].unit, priceCents: picks[i].unitCents, colours: [], spec: picks[i].spec, code: picks[i].code, supplier: picks[i].supplier };
    picks[i] = cleanPick({ role: picks[i].role, qty: picks[i].qty, colour: picks[i].colour?.hex, note: picks[i].note, ...(req.body || {}) }, base, c.category);
    return store(c, { ...(c.spec || {}), materials: picks });
  });
  app.delete('/v1/lab/concepts/:id/materials/:mid', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply) || !need(req, reply, 'mid')) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const picks = picksOf(c).filter(p => p.id !== req.params.mid); if (picks.length === picksOf(c).length) return bad(reply, 'That material is not on this concept', 404);
    return store(c, { ...(c.spec || {}), materials: picks });
  });
  app.put('/v1/lab/concepts/:id/costing', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const b = req.body || {}, cur = costing(c), k = { ...cur };
    if (b.making !== undefined) { const n = Number(String(b.making).replace(/[^0-9.]/g, '')); if (b.making === '' || b.making === null) k.makingCents = null; else if (!Number.isFinite(n) || n < 0 || n > 1e5) return bad(reply, 'That making cost does not look right'); else k.makingCents = Math.round(n * 100); }
    if (b.freightPct !== undefined) { const n = Number(b.freightPct); if (!Number.isFinite(n) || n < 0 || n > 200) return bad(reply, 'Freight and duty is a percentage of the factory cost'); k.freightPct = Math.round(n * 10) / 10; }
    return store(c, { ...(c.spec || {}), costing: k });
  });
  app.put('/v1/lab/concepts/:id/colourways', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const cw = cleanColourways(req.body?.colourways).map(x => ({ ...x, pantone: x.pantone || (P ? P.code(x.hex, { hint: x.name }) : ''), threadPantone: x.thread ? (x.threadPantone || (P ? P.code(x.thread) : '')) : '' }));
    await pool.query('update lab_concepts set spec=$2, updated_at=now() where id=$1', [c.id, { ...(c.spec || {}), colourways: cw }]);
    return { colourways: cw };
  });

  return { picksOf: async id => { const c = await concept(id); return c ? summary(c) : null; } };
}
