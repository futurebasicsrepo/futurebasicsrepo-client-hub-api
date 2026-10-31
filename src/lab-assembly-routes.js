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
import { realMeshes, isoPicture } from './lab-parts-mesh.js';
import { packFromAssembly } from './lab-assembly.js';
import { stepOf } from './lab-step.js';
import { reviewAssembly, BAR as REVIEW_BAR } from './lab-assembly-review.js';
import { composeAssembly } from './lab-assembly-compose.js';
import { sampleOf, factorsOf, calibrated } from './lab-cost-calibration.js';
import { REFERENCE, runBenchmark } from './lab-benchmark.js';
import { openaiAsk } from './lab-shoe-review.js';
import { trackedFetch, timed } from './telemetry.js';
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
  const concept = async id => (UUID.test(String(id)) ? (await pool.query('select id, name, category, spec, product_id, twist from lab_concepts where id=$1', [id])).rows[0] : null);
  const proposal = c => { const s = archetype(guessArch(c), dimsOf(c), { radio: radioOf(c), display: /\boled\b/i.test(c.spec?.description || '') ? 'oled' : 'lcd' }); s.name = c.name; if (c.category === 'toys') s.age = '3+'; return s; };
  async function load(id) {
    const c = await concept(id); if (!c) return null;
    const row = (await pool.query('select spec, updated_at from lab_assemblies where concept_id=$1', [c.id])).rows[0] || null;
    const spec = row ? cleanAssembly({ ...row.spec, name: row.spec?.name || c.name }) : proposal(c);
    return { c, spec, saved: Boolean(row), updatedAt: row?.updated_at || null };
  }
  const save = async (c, spec, actor) => { const s = cleanAssembly({ ...spec, name: spec.name || c.name }); await pool.query(`insert into lab_assemblies(concept_id, spec, updated_by) values($1,$2,$3) on conflict(concept_id) do update set spec=excluded.spec, updated_by=excluded.updated_by, updated_at=now()`, [c.id, s, actor]); return s; };
  const read = E => ({ parts: E.parts, tools: E.tools, toolCost: E.toolCost, weeks: E.weeks, checks: E.checks, steps: E.steps, labour: E.labour, unit: E.unit, amort: E.amort, landed: E.landed, mass: E.mass, pcb: E.pcb, power: E.power, certs: E.certs, extent: E.extent, harness: E.harness, bom: bomRows(E) });
  const options = { archetypes: Object.fromEntries(Object.entries(ARCHES).map(([k, v]) => [k, v])), resins: Object.keys(RESINS), processes: Object.keys(PROCESSES), finishes: FINISHES, fixes: Object.keys(FIXES), shapes: SHAPES, elec: Object.fromEntries(Object.entries(ELEC).map(([k, v]) => [k, v.name])), ages: AGES };

  app.get('/v1/lab/concepts/:id/assembly', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const E = engineer(L.spec);
    return { concept: { id: L.c.id, name: L.c.name, category: L.c.category, productId: L.c.product_id || null }, engineered: ENGINEERED.includes(L.c.category), spec: L.spec, saved: L.saved, updatedAt: L.updatedAt, options, eng: { ...read(E), calibrated: calibrated(E, (await calibration())[E.spec.kind === 'electronics' ? 'electronics' : 'goods']) }, calibration: await calibration() };
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
  // ---- designed from the concept (src/lab-assembly-compose.js), for a product no starting point fits: Claude lays out the parts in the
  // engine's terms, the checks' problems go back to be fixed, and the result is saved like a start. ASSEMBLY_COMPOSE_FIXTURE (a list of
  // answers, one per call) stands in for Claude in tests; ENGINEERING_COMPOSE_DAILY (30) caps a day's.
  const composed = { day: '', n: 0 };
  const composeAsk = () => {
    if (env.AI_FIXTURE || !env.ANTHROPIC_API_KEY) { let list = null; try { const f = String(env.ASSEMBLY_COMPOSE_FIXTURE || '').trim(); list = f ? JSON.parse(f.startsWith('[') ? f : readFileSync(f, 'utf8')) : null; } catch { list = null; } if (!Array.isArray(list) || !list.length) return null; let i = 0; return async () => list[Math.min(i++, list.length - 1)]; }
    return (system, content, schema) => timed('anthropic', () => askImpl(system, content, schema, { maxTokens: 12000 }));
  };
  app.post('/v1/lab/concepts/:id/assembly/compose', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const ask = composeAsk();
    if (!ask) return bad(reply, 'Designing from the concept needs Claude connected', 503);
    const today = new Date().toISOString().slice(0, 10); if (composed.day !== today) Object.assign(composed, { day: today, n: 0 });
    if (composed.n >= (Number(env.ENGINEERING_COMPOSE_DAILY) || 30)) return bad(reply, 'Today\'s designs from concepts are used: start from a kind of product instead, or try tomorrow', 429); composed.n++;
    const photo = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image || null, b = req.body || {};
    let out; try { out = await composeAssembly({ concept: { name: c.name, category: c.category, description: c.spec?.description, twist: c.twist, size: [b.w, b.d, b.h].some(Number) ? `about ${[b.w, b.d, b.h].map(v => Number(v) || '?').join(' × ')} mm` : '' }, photo, ask }); }
    catch (e) { log.warn?.({ err: e.message }, 'assembly compose failed'); return bad(reply, 'The design could not be made: try again', 502); }
    if (out.status === 'not-a-product') return bad(reply, out.why);
    const s = out.spec; s.name = c.name; if (c.category === 'toys' && !s.age) s.age = '3+';
    const spec = await save(c, s, actorOf(req));
    return { ok: true, spec, eng: read(engineer(spec)), compose: { status: out.status, rounds: out.rounds, why: out.why } };
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
  // the parts' real shapes (src/lab-parts-mesh.js) for the STL and the drawing, kept for the last few assemblies asked for (a second
  // download of the same product does not build them again); ?simple=1 gives the engineering's plain boxes and shells instead
  const realCache = new Map(), keyOf = (s, ...x) => createHash('sha1').update(JSON.stringify([s.parts, s.name, ...x])).digest('hex');
  const cached = async (k, make) => { if (realCache.has(k)) { const v = realCache.get(k); realCache.delete(k); realCache.set(k, v); return v; } const v = await make(); realCache.set(k, v); while (realCache.size > 12) realCache.delete(realCache.keys().next().value); return v; };
  const realOf = (s, name, t) => cached(keyOf(s, 'mesh', t), () => realMeshes(s, { name, t }));
  const pictureOf = (s, t, name) => cached(keyOf(s, 'pic', t), async () => isoPicture(s, { t, real: await realOf(s, name, t) }));
  const simple = q => q?.simple === '1' || q?.simple === 'true';
  const tOf = q => Math.min(Math.max(Number(q?.t ?? 0) || 0, 0), 1), slug = c => String(c.name || 'assembly').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'assembly';
  app.get('/v1/lab/concepts/:id/assembly.stl', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const only = req.query?.part && L.spec.parts.some(p => p.id === req.query.part) ? req.query.part : null;
    return reply.header('content-disposition', `attachment; filename="${slug(L.c)}${only ? `-${only}` : ''}.stl"`).type('model/stl').send(Buffer.from(stlOf(L.spec, { t: tOf(req.query), only, real: simple(req.query) ? null : await realOf(L.spec, L.c.name, tOf(req.query)) })));
  });
  // STEP (AP214) for a toolmaker's CAD: every part an exact solid (planes and cylinders), named and coloured, in mm (src/lab-step.js)
  app.get('/v1/lab/concepts/:id/assembly.step', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const only = req.query?.part && L.spec.parts.some(p => p.id === req.query.part) ? req.query.part : null;
    return reply.header('content-disposition', `attachment; filename="${slug(L.c)}${only ? `-${only}` : ''}.step"`).type('model/step').send(stepOf(L.spec, { t: tOf(req.query), only, title: L.c.name }));
  });
  app.get('/v1/lab/concepts/:id/assembly.svg', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const t = req.query?.t == null ? 1 : tOf(req.query), svg = drawingSvg(L.spec, { t, title: L.c.name, picture: simple(req.query) ? null : await pictureOf(L.spec, t, L.c.name) });
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
  // ---- the engineering review (src/lab-assembly-review.js): the assembly on the page (saved or not) looked at by product engineers against
  // the concept's picture (or words), round by round. It runs in the background and the page follows it; nothing is saved until the page
  // uses the result. Claude and, with OPENAI_API_KEY, an OpenAI model (ENGINEERING_CHECKER=claude|openai|both, both by default); a day's
  // reviews are capped (ENGINEERING_REVIEW_DAILY, 40). ENGINEERING_REVIEW_FIXTURE stands in for the judges in tests: an array of answers
  // (one judge) or {name: [answers]} for several.
  const reviews = new Map(), spent = { day: '', n: 0 };
  const reviewers = () => {
    if (env.AI_FIXTURE || (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY)) {
      let fx = null; try { const raw = String(env.ENGINEERING_REVIEW_FIXTURE || '').trim(); fx = !raw ? null : JSON.parse(/^[[{]/.test(raw) ? raw : readFileSync(raw, 'utf8')); } catch { fx = null; }
      if (!fx) return [];
      return Object.entries(Array.isArray(fx) ? { Claude: fx } : fx).filter(([, v]) => Array.isArray(v) && v.length).map(([name, list]) => { let i = 0; return { name, ask: async () => { const a = list[Math.min(i, list.length - 1)]; i++; await new Promise(res => setTimeout(res, Number(env.AI_FIXTURE_DELAY_MS) || 0)); return a; } }; });
    }
    const m = String(env.ENGINEERING_CHECKER || 'both').toLowerCase(), out = [];
    if (env.ANTHROPIC_API_KEY && (m !== 'openai' || !env.OPENAI_API_KEY)) out.push({ name: 'Claude', ask: (system, content, schema) => timed('anthropic', () => askImpl(system, content, schema, { maxTokens: 4000 })) });
    if (m !== 'claude' && env.OPENAI_API_KEY) out.push({ name: 'ChatGPT', ask: openaiAsk(env, (u, o) => trackedFetch('openai-check', u, o)) });
    return out;
  };
  app.post('/v1/lab/concepts/:id/assembly/review', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    if ([...reviews.values()].some(r => r.conceptId === L.c.id && r.status === 'running')) return bad(reply, 'A review of this product is already running', 409);
    let judges = reviewers(); const today = new Date().toISOString().slice(0, 10); if (spent.day !== today) Object.assign(spent, { day: today, n: 0 });
    const cap = Number(env.ENGINEERING_REVIEW_DAILY) || 40, capped = judges.length > 0 && spent.n >= cap; if (capped) judges = []; else if (judges.length) spent.n++;
    const spec = req.body?.spec && typeof req.body.spec === 'object' ? cleanAssembly({ ...req.body.spec, name: req.body.spec.name || L.c.name }) : L.spec;
    const photo = (await pool.query('select image from lab_concepts where id=$1', [L.c.id])).rows[0]?.image || null;
    const id = createHash('sha1').update(`${L.c.id}${Date.now()}${Math.random()}`).digest('hex').slice(0, 16), job = { id, conceptId: L.c.id, status: 'running', bar: REVIEW_BAR, rounds: [], started: Date.now(), capped, picture: Boolean(photo) };
    if (reviews.size > 200) for (const [k, r] of reviews) if (r.status !== 'running' && Date.now() - r.started > 3600e3) reviews.delete(k);
    reviews.set(id, job);
    reviewAssembly({ spec, photo, concept: { name: L.c.name, category: L.c.category, description: L.c.spec?.description, twist: L.c.twist }, judges, onRound: r => { if (r.n > 0) job.rounds = [...job.rounds, r]; else job.checks = r.checks; } })
      .then(res => Object.assign(job, res, { result: res.status, status: 'done', eng: engineer(res.spec), note: capped ? `Today's ${cap} engineering reviews are used: only the engine's checks ran. ${res.note}` : res.note }))
      .catch(e => { log.warn?.({ err: e.message }, 'engineering review failed'); Object.assign(job, { status: 'failed', error: 'The review could not finish: try again' }); });
    return reply.code(202).send({ id, reviewer: judges.length > 0, judges: judges.map(j => j.name), bar: REVIEW_BAR, picture: Boolean(photo) });
  });
  app.get('/v1/lab/concepts/:id/assembly/review/:rid', { preHandler: pre }, async (req, reply) => {
    const job = reviews.get(String(req.params.rid)); if (!job || job.conceptId !== req.params.id) return bad(reply, 'Not found', 404);
    const { eng, ...rest } = job; return { ...rest, ...(eng ? { eng: read(eng) } : {}) };
  });

  // ---- into the tech pack: the views, the parts and cables, the steps and tools, and an electronic product's components and certifications ----
  // (src/lab-handoff.js lays them in). A pack already published keeps that version: what changed goes out as the next one, as the flats do.
  const packPictures = async (L) => {
    const [shut, open] = await Promise.all([pictureOf(L.spec, 0, L.c.name), pictureOf(L.spec, 1, L.c.name)]);
    return [shut && { id: 'lab-eng-assembled', view: 'front', label: `${L.c.name}: assembled (Engineering)`, image: shut.href }, open && { id: 'lab-eng-exploded', view: 'other', label: `${L.c.name}: exploded, every part (Engineering)`, image: open.href }].filter(Boolean);
  };
  app.post('/v1/lab/concepts/:id/assembly/tech-pack', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    if (!L.c.product_id) return bad(reply, 'This concept has no tech pack yet. Approve it and send it to a tech pack first.', 409);
    if (!L.saved) return bad(reply, 'Save the engineering first', 409);
    if (!d.applyHandoff) return bad(reply, 'Engineering cannot be sent to tech packs on this service', 501);
    const P = packFromAssembly(engineer(L.spec)), sketches = await packPictures(L).catch(e => { log.warn?.({ err: e.message }, 'engineering: the views could not be drawn'); return []; });
    const sent = await d.applyHandoff(L.c.product_id, { files: [], lab: { engineering: { ...P, sketches } } }); if (!sent) return bad(reply, 'The tech pack could not be found', 404);
    const tp = (await pool.query('select version, published_at from tech_packs where product_id=$1 order by created_at desc limit 1', [L.c.product_id])).rows[0];
    const changes = tp?.published_at && d.packChanges ? await d.packChanges(L.c.product_id) : null, same = Boolean(tp?.published_at && changes && !changes.length);
    let version = null, publishError = null;
    if (tp?.published_at && !same) {
      const note = `Engineering updated in the Design Lab (${L.c.name})`;
      const res = await app.inject({ method: 'POST', url: `/v1/admin/products/${L.c.product_id}/tech-pack/publish`, headers: { authorization: req.headers.authorization || '' }, payload: { note, override: `${note}; v${tp.version} stays as it was` } });
      const body = (() => { try { return JSON.parse(res.body); } catch { return {}; } })();
      if (res.statusCode < 300) version = body.techPack?.version || null; else publishError = body.error || `The next version could not be published (${res.statusCode})`;
    }
    return { ok: true, productId: L.c.product_id, bom: P.bom.length, construction: P.construction.length, components: P.electronics?.components.length || 0, certifications: P.electronics?.certifications.length || 0, sketches: sketches.length, version, previousVersion: tp?.published_at ? tp.version : null, unchanged: same, changes: (changes || []).slice(0, 12).map(x => `${x.section}: ${x.label}`), publishError };
  });

  // ---- the factory's production package (src/server.js factoryPackage): the engineering as files, with no costs in them ----
  async function productionFiles(id) {
    const L = await load(id), out = [], notes = []; if (!L) return { files: out, notes };
    if (!L.saved) { if (ENGINEERED.includes(L.c.category)) notes.push('The engineering has not been saved yet, so its files are not in this package'); return { files: out, notes }; }
    const E = engineer(L.spec), s = E.spec, name = L.c.name, safe = v => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    try {
      // the assembly in place (the exploded one is the same triangles moved apart, so it stays on the page's Files menu; the drawing shows it)
      const shut = await realOf(s, name, 0); out.push({ name: 'engineering/assembly.stl', data: Buffer.from(stlOf(s, { t: 0, real: shut })) });
      // one file per part a factory makes (moulded, machined, stamped, cut), for the toolmaker; bought-in parts come from their makers
      s.parts.filter(p => p.process !== 'bought in' && p.shape !== 'pcb').forEach(p => { const base = `engineering/parts/${String(s.parts.indexOf(p) + 1).padStart(2, '0')}-${safe(p.name)}`; out.push({ name: `${base}.stl`, data: Buffer.from(stlOf(s, { t: 0, only: p.id, real: shut })) }, { name: `${base}.step`, data: Buffer.from(stepOf(s, { only: p.id, title: `${name}: ${p.name}` })) }); });
      const pic = await pictureOf(s, 1, name); out.push({ name: 'engineering/exploded-drawing.svg', data: Buffer.from(drawingSvg(s, { t: 1, title: name, picture: pic, costs: false })) });
    } catch (e) { notes.push(`The 3D files could not be made (${String(e.message).slice(0, 120)})`); }
    out.push({ name: 'engineering/assembly.step', data: Buffer.from(stepOf(s, { title: name })) });
    out.push({ name: 'engineering/parts-list.csv', data: Buffer.from(bomCsv(E, { costs: false })) });
    const H = E.harness; if (H.length) { const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v); out.push({ name: 'engineering/cables.csv', data: Buffer.from(['Ref,Cable,From,To,Type,Length (mm)', ...H.map(c => [c.n, c.label, s.parts.find(p => p.id === c.from)?.name, s.parts.find(p => p.id === c.to)?.name, c.type, c.mm].map(q).join(','))].join('\n')) }); }
    if (s.kind === 'electronics') out.push({ name: 'engineering/block-diagram.svg', data: Buffer.from(blockSvg(s)) });
    return { files: out, notes };
  }
  // ---- the engineering measured (src/lab-benchmark.js): known products designed from their words, reviewed, and scored against what is
  // known about them, before and after the review. One run at a time, in the background; ENGINEERING_BENCHMARK_DAILY (3) runs a day, as a
  // run is a dozen designs and their reviews. With the fixtures (tests) the same answers stand in for every product.
  let benchRunning = null; const benched = { day: '', n: 0 };
  app.post('/v1/lab/engineering/benchmark', { preHandler: pre }, async (req, reply) => {
    if (benchRunning) return bad(reply, 'A benchmark is already running', 409);
    const ask = composeAsk(); if (!ask) return bad(reply, 'The benchmark needs Claude connected', 503);
    const today = new Date().toISOString().slice(0, 10); if (benched.day !== today) Object.assign(benched, { day: today, n: 0 });
    if (benched.n >= (Number(env.ENGINEERING_BENCHMARK_DAILY) || 3)) return bad(reply, 'Today\'s benchmark runs are used: try tomorrow', 429);
    const ids = REFERENCE.map(r => r.id), only = Array.isArray(req.body?.only) ? req.body.only.filter(x => ids.includes(x)) : null;
    if (only && !only.length) return bad(reply, 'None of those products is in the benchmark');
    benched.n++; const judges = reviewers();
    const run = (await pool.query('insert into lab_benchmark_runs(started_by, judges) values($1,$2) returning id, started_at', [actorOf(req), judges.map(j => j.name)])).rows[0];
    const items = []; benchRunning = run.id;
    runBenchmark({ ask, judges, only, onItem: it => { items.push(it); pool.query('update lab_benchmark_runs set items=$2 where id=$1', [run.id, JSON.stringify(items)]).catch(() => {}); } })
      .then(res => pool.query(`update lab_benchmark_runs set status='done', items=$2, summary=$3, finished_at=now() where id=$1`, [run.id, JSON.stringify(res.items), res.summary]))
      .catch(e => { log.warn?.({ err: e.message }, 'engineering benchmark failed'); return pool.query(`update lab_benchmark_runs set status='failed', error=$2, finished_at=now() where id=$1`, [run.id, String(e.message).slice(0, 300)]); })
      .finally(() => { benchRunning = null; });
    return reply.code(202).send({ id: run.id, products: (only || ids).length, judges: judges.map(j => j.name) });
  });
  app.get('/v1/lab/engineering/benchmark', { preHandler: pre }, async () => {
    const runs = (await pool.query('select id, status, judges, items, summary, error, started_at, finished_at from lab_benchmark_runs order by started_at desc limit 10')).rows;
    for (const r of runs) if (r.status === 'running' && r.id !== benchRunning) Object.assign(r, { status: 'failed', error: 'The service restarted during the run' }); // the run lived in a process that is gone
    return { reference: REFERENCE.map(r => ({ id: r.id, name: r.name, category: r.category, description: r.description, size: r.size, must: r.must.map(m => m.label), count: r.count, unit: r.unit, tool: r.tool })), running: benchRunning, runs };
  });
  // ---- costs against factory quotes (src/lab-cost-calibration.js): each quote on a pack whose product was engineered here is kept beside
  // the engine's estimate for that assembly as it stood; the factors from them are kept in memory and read again after each new sample
  let calib = null, calibAt = 0;
  async function calibration(force = false) {
    if (!force && calib && Date.now() - calibAt < 600e3) return calib;
    const rows = (await pool.query('select sample from lab_cost_samples')).rows.map(r => r.sample);
    calib = { electronics: factorsOf(rows, 'electronics'), goods: factorsOf(rows, 'goods') }; calibAt = Date.now(); return calib;
  }
  // a quote (a factory_quotes row) learnt from: its pack's product, the concept engineered for it, the estimate now
  async function learnFromQuote(q) {
    const c = (await pool.query(`select c.id from tech_packs tp join lab_concepts c on c.product_id=tp.product_id join lab_assemblies a on a.concept_id=c.id where tp.id=$1 order by c.updated_at desc limit 1`, [q.tech_pack_id])).rows[0];
    if (!c) return null; const L = await load(c.id); if (!L?.saved) return null;
    const smp = sampleOf(engineer(L.spec), q); if (!smp) return null;
    await pool.query(`insert into lab_cost_samples(quote_id, concept_id, kind, sample) values($1,$2,$3,$4) on conflict(quote_id) do update set concept_id=excluded.concept_id, kind=excluded.kind, sample=excluded.sample, updated_at=now()`, [q.id, c.id, smp.kind, smp]);
    await calibration(true); return smp;
  }
  app.get('/v1/lab/engineering/calibration', { preHandler: pre }, async () => {
    const rows = (await pool.query(`select s.sample, s.updated_at, c.name, q.company from lab_cost_samples s left join lab_concepts c on c.id=s.concept_id left join factory_quotes q on q.id=s.quote_id order by s.updated_at desc limit 200`)).rows;
    return { factors: await calibration(true), samples: rows.map(r => ({ ...r.sample, product: r.name, factory: r.company, at: r.updated_at })) };
  });
  // the quotes already on file, learnt from once (a quote saved later is learnt from as it is saved)
  app.post('/v1/lab/engineering/calibration/learn', { preHandler: pre }, async () => {
    const qs = (await pool.query('select * from factory_quotes order by updated_at desc limit 2000')).rows; let n = 0;
    for (const q of qs) if (await learnFromQuote(q).catch(() => null)) n++;
    return { learnt: n, quotes: qs.length, factors: await calibration(true) };
  });
  return { load, productionFiles, learnFromQuote };
}
