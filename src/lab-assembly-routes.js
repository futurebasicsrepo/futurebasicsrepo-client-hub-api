// Design Lab engineering for hard goods, toys, home objects and electronics (the page is src/lab-engineer.html at /lab/engineer, inside Design;
// the engineering is src/lab-assembly.js, shared with the page):
//   GET  /v1/lab/concepts/:id/assembly              the saved assembly, or one drawn from the concept's words; with the engineering read of it
//   PUT  /v1/lab/concepts/:id/assembly              save {spec} → the read
//   POST /v1/lab/concepts/:id/assembly/start        {arch, w, d, h, mah, radio, display, buttons} start again from an archetype (saved)
//   POST /v1/lab/concepts/:id/assembly/read         the concept's picture read for its archetype, size and features (Claude), not saved
//   GET  /v1/lab/concepts/:id/assembly.stl          ?t=0..1 pulled apart, ?part=id one part: binary STL in mm
//   GET  /v1/lab/concepts/:id/assembly.svg          the exploded isometric drawing with balloons and the parts list (?t=)
//   GET  /v1/lab/concepts/:id/block.svg             an electronic product's block diagram
//   GET  /v1/lab/concepts/:id/bom.csv               the parts list with materials, processes, unit and tool costs
import './elec.js';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { callJsonSchema } from './studio.js';
import { archetype, cleanAssembly, engineer, guessArch, radioOf, stlOf, drawingSvg, blockSvg, bomCsv, bomRows, ARCHES, RESINS, PROCESSES, FINISHES, FIXES, SHAPES, ELEC, AGES } from './lab-assembly.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// the categories engineered as parts rather than cut from a pattern
export const ENGINEERED = ['electronics', 'toys', 'home'];
// a size written in the concept's words: "120 x 70 x 86 mm", "9 cm tall"
export function dimsOf(c = {}) {
  const t = [c.name, c.spec?.description, c.spec?.silhouette, (c.spec?.details || []).join(' ')].join(' ');
  const u = s => (/cm/i.test(s) ? 10 : /in|"/i.test(s) ? 25.4 : 1), m = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*(mm|cm|in|")/i.exec(t);
  if (m) { const k = u(m[4]), v = [m[1], m[2], m[3]].filter(Boolean).map(x => Number(x) * k); return v.length === 3 ? { w: v[0], d: v[1], h: v[2] } : { w: v[0], d: v[0], h: v[1] }; }
  const h = /(\d+(?:\.\d+)?)\s*(mm|cm|in|")\s*(tall|high)/i.exec(t); return h ? { h: Number(h[1]) * u(h[2]) } : {};
}
const READ_SCHEMA = { type: 'object', properties: {
  product: { type: 'boolean', description: 'false when the picture does not show a physical product' },
  arch: { type: 'string', enum: Object.keys(ARCHES).filter(k => k !== 'custom') },
  w: { type: 'number', description: 'overall width in mm, estimated' }, d: { type: 'number', description: 'overall depth in mm' }, h: { type: 'number', description: 'overall height in mm' },
  radio: { type: 'string', enum: ['none', 'ble', 'wifi'] }, display: { type: 'string', enum: ['none', 'oled', 'lcd'] }, buttons: { type: 'integer', minimum: 0, maximum: 12 },
  mah: { type: 'integer', minimum: 0, maximum: 20000, description: 'a likely battery capacity, 0 when it plugs in' }, colour: { type: 'string', description: 'the main body colour as #rrggbb' },
  why: { type: 'string', description: 'one sentence: what the picture shows that led to these' }
}, required: ['product', 'arch', 'w', 'd', 'h', 'why'] };

export function registerLabAssemblyRoutes(app, d) {
  const { pool, authenticate, adminOnly, env = process.env, askImpl = callJsonSchema, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const concept = async id => (UUID.test(String(id)) ? (await pool.query('select id, name, category, spec from lab_concepts where id=$1', [id])).rows[0] : null);
  const proposal = c => { const s = archetype(guessArch(c), dimsOf(c), { radio: radioOf(c), display: /\boled\b/i.test(c.spec?.description || '') ? 'oled' : 'lcd' }); s.name = c.name; if (c.category === 'toys') s.age = '3+'; return s; };
  async function load(id) {
    const c = await concept(id); if (!c) return null;
    const row = (await pool.query('select spec, updated_at from lab_assemblies where concept_id=$1', [c.id])).rows[0] || null;
    const spec = row ? cleanAssembly({ ...row.spec, name: row.spec?.name || c.name }) : proposal(c);
    return { c, spec, saved: Boolean(row), updatedAt: row?.updated_at || null };
  }
  const save = async (c, spec, actor) => { const s = cleanAssembly({ ...spec, name: spec.name || c.name }); await pool.query(`insert into lab_assemblies(concept_id, spec, updated_by) values($1,$2,$3) on conflict(concept_id) do update set spec=excluded.spec, updated_by=excluded.updated_by, updated_at=now()`, [c.id, s, actor]); return s; };
  const read = E => ({ parts: E.parts, tools: E.tools, toolCost: E.toolCost, weeks: E.weeks, checks: E.checks, steps: E.steps, labour: E.labour, unit: E.unit, amort: E.amort, landed: E.landed, mass: E.mass, pcb: E.pcb, power: E.power, certs: E.certs, extent: E.extent, bom: bomRows(E) });
  const options = { archetypes: Object.fromEntries(Object.entries(ARCHES).map(([k, v]) => [k, v])), resins: Object.keys(RESINS), processes: Object.keys(PROCESSES), finishes: FINISHES, fixes: Object.keys(FIXES), shapes: SHAPES, elec: Object.fromEntries(Object.entries(ELEC).map(([k, v]) => [k, v.name])), ages: AGES };

  app.get('/v1/lab/concepts/:id/assembly', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    return { concept: { id: L.c.id, name: L.c.name, category: L.c.category }, engineered: ENGINEERED.includes(L.c.category), spec: L.spec, saved: L.saved, updatedAt: L.updatedAt, options, eng: read(engineer(L.spec)) };
  });
  app.put('/v1/lab/concepts/:id/assembly', { preHandler: pre, bodyLimit: 2_000_000 }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const s0 = req.body?.spec; if (!s0 || !Array.isArray(s0.parts)) return bad(reply, 'Send {spec: {parts: [...]}}');
    if (!s0.parts.length) return bad(reply, 'An assembly needs at least one part');
    const spec = await save(c, s0, actorOf(req)); return { ok: true, spec, eng: read(engineer(spec)) };
  });
  app.post('/v1/lab/concepts/:id/assembly/start', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const b = req.body || {}, arch = ARCHES[b.arch] ? b.arch : guessArch(c);
    const s = archetype(arch, { w: b.w, d: b.d, h: b.h }, { mah: b.mah || null, radio: ['none', 'ble', 'wifi'].includes(b.radio) ? b.radio : radioOf(c), display: b.display, buttons: b.buttons, colour: b.colour });
    s.name = c.name; if (AGES[b.age]) s.age = b.age; else if (c.category === 'toys') s.age = '3+';
    const spec = await save(c, s, actorOf(req)); return { ok: true, spec, eng: read(engineer(spec)) };
  });
  // the picture read once per picture (it does not change), then kept; ASSEMBLY_READ_FIXTURE stands in for the model in tests
  const reads = new Map();
  app.post('/v1/lab/concepts/:id/assembly/read', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const img = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image;
    const key = img ? createHash('sha1').update(img).digest('hex') : null; let v = key ? reads.get(key) : null;
    if (!v && img) {
      if (env.AI_FIXTURE || !env.ANTHROPIC_API_KEY) { try { const f = String(env.ASSEMBLY_READ_FIXTURE || '').trim(); v = f ? JSON.parse(f.startsWith('{') ? f : readFileSync(f, 'utf8')) : null; } catch { v = null; } }
      else if (askImpl) { try { const jpeg = await sharp(img).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer(); v = await askImpl('You are an industrial design engineer reading a product design picture so its parts can be engineered. Say which kind of product it is, estimate its overall size in millimetres from its proportions and what it is, and read its features: a radio (Bluetooth or Wi-Fi), a display, how many buttons, a likely battery capacity (0 when it plugs in), and its main body colour.', [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: `The design is called "${String(c.name).slice(0, 80)}", category ${c.category}. Kinds: ${Object.entries(ARCHES).filter(([k]) => k !== 'custom').map(([k, a]) => `"${k}" ${a.label}`).join('; ')}.` }], READ_SCHEMA); } catch (e) { log.warn?.({ err: e.message }, 'assembly picture read failed'); } }
      if (v) { if (reads.size > 300) reads.clear(); reads.set(key, v); }
    }
    if (v && v.product === false) return bad(reply, 'The picture does not show a product to engineer');
    const words = { arch: guessArch(c), ...dimsOf(c), radio: radioOf(c) };
    if (!v) return { source: 'words', read: words, why: img ? 'The picture can only be read with Claude connected; this is read from the concept\'s words.' : 'This concept has no picture; this is read from its words.' };
    const clean = { arch: ARCHES[v.arch] ? v.arch : words.arch, w: Number(v.w) || undefined, d: Number(v.d) || undefined, h: Number(v.h) || undefined, radio: ['none', 'ble', 'wifi'].includes(v.radio) ? v.radio : words.radio, display: v.display || 'none', buttons: Number.isFinite(Number(v.buttons)) ? Number(v.buttons) : undefined, mah: Number(v.mah) || undefined, colour: /^#[0-9a-f]{6}$/i.test(v.colour || '') ? v.colour : undefined };
    return { source: 'vision', read: clean, why: String(v.why || '').slice(0, 300) };
  });
  const tOf = q => Math.min(Math.max(Number(q?.t ?? 0) || 0, 0), 1), slug = c => String(c.name || 'assembly').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'assembly';
  app.get('/v1/lab/concepts/:id/assembly.stl', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const only = req.query?.part && L.spec.parts.some(p => p.id === req.query.part) ? req.query.part : null;
    return reply.header('content-disposition', `attachment; filename="${slug(L.c)}${only ? `-${only}` : ''}.stl"`).type('model/stl').send(Buffer.from(stlOf(L.spec, { t: tOf(req.query), only })));
  });
  app.get('/v1/lab/concepts/:id/assembly.svg', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const svg = drawingSvg(L.spec, { t: req.query?.t == null ? 1 : tOf(req.query), title: L.c.name });
    if (req.query?.download) reply.header('content-disposition', `attachment; filename="${slug(L.c)}-exploded.svg"`);
    return reply.header('cache-control', 'no-store').type('image/svg+xml').send(svg);
  });
  app.get('/v1/lab/concepts/:id/block.svg', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404); if (L.spec.kind !== 'electronics') return bad(reply, 'Only an electronic product has a block diagram');
    if (req.query?.download) reply.header('content-disposition', `attachment; filename="${slug(L.c)}-block-diagram.svg"`);
    return reply.header('cache-control', 'no-store').type('image/svg+xml').send(blockSvg(L.spec));
  });
  app.get('/v1/lab/concepts/:id/bom.csv', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    return reply.header('content-disposition', `attachment; filename="${slug(L.c)}-bom.csv"`).type('text/csv; charset=utf-8').send(bomCsv(engineer(L.spec)));
  });
  return { load };
}
