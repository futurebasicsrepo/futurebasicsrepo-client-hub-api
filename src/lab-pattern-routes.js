// Design Lab patterns (the page is src/lab-pattern.html at /lab/pattern, inside Design; the drafting is src/lab-pattern.js, shared with the page):
//   GET  /v1/lab/concepts/:id/pattern            what the piece is cut from: a garment from its flats (saved, or worked out from the concept's words),
//                                                a plush from its choices; → { kind, flat?, spec?, options }
//   PUT  /v1/lab/concepts/:id/pattern            save {kind, spec} (a plush's choices; a garment's seam allowance and fabric width)
//   GET  /v1/lab/concepts/:id/pattern.svg        every piece laid out at real size (print at 100%), ?size=M&width=58
//   GET  /v1/lab/concepts/:id/pattern.dxf        the same as a DXF (R12, inches) on CUT, SEW, GRAIN, NOTCH and TEXT layers, for a pattern system
//   POST /v1/lab/concepts/from-scratch           {name?, category, style?, shape?} a concept with nothing drawn yet: a blank page in Design to draw on,
//                                                with a guide (the flat's outline for a garment, the plush's shape) → { concept, studio }
import { STYLES, SIZES, FITS, defaultParams, detectStyle } from './lab-flats.js';
import { garmentPattern, plushPattern, cleanPlush, plushDefaults, patternSvg, patternDxf, yardage, fillGrams, PLUSH_SHAPES, PLUSH_EARS, PLUSH_FABRICS, PLUSH_EYES, PLUSH_AGES } from './lab-pattern.js';
import { CATEGORIES } from './lab.js';
import { silhouette, readShoe, proposal } from './lab-shoe-read.js';
import { callJsonSchema } from './studio.js';
import { createHash } from 'node:crypto';
import { footwearPattern, cleanFootwear, fwDefaults, sizeRun, lastOf, lastSvg, hideArea, FW_STYLES, TOES, SYSTEMS, WIDTHS as SHOE_WIDTHS, UPPERS, LININGS, SIZE_LIMITS } from './lab-footwear.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const WIDTHS = [36, 44, 54, 58, 60, 72];
// what kind of pattern a concept is cut from: plush has its own drafting; a garment needs a style the flats know; the rest is still to come
export const SOON = { toys: 'Toys and objects: tooling and the parts come next', electronics: 'Electronics: the engineering comes next', home: 'Home and objects: tooling and the parts come next' };
export function kindOf(c, flatStyle = null) {
  if (c.category === 'plush') return 'plush';
  if (c.category === 'footwear') return 'footwear';
  if (flatStyle && STYLES[flatStyle]) return 'garment';
  if (SOON[c.category]) return 'soon';
  return detectStyle(c) ? 'garment' : 'none';
}
const cleanGarment = (s = {}) => ({ sa: [.25, .375, .5, .625].includes(Number(s.sa)) ? Number(s.sa) : null, width: WIDTHS.includes(Number(s.width)) ? Number(s.width) : 58 });
export const cleanPatternSpec = (kind, s) => kind === 'plush' ? cleanPlush(s || {}) : kind === 'footwear' ? cleanFootwear(s || {}) : cleanGarment(s || {});

// a footwear concept's style from its words, until it is chosen
export const guessShoe = c => { const t = [c.name, c.spec?.silhouette, c.spec?.description].join(' ').toLowerCase(); return /chelsea/.test(t) ? 'chelsea' : /hik(e|er|ing)/.test(t) ? 'hiker' : /high[- ]?top|basketball/.test(t) ? 'hightop' : /\bboots?\b/.test(t) ? 'boot' : /loafer|penny|moc/.test(t) ? 'loafer' : /derby|oxford|blucher|dress shoe/.test(t) ? 'derby' : /run|trainer|jog/.test(t) ? 'runner' : 'sneaker'; };
const footExtra = (spec, pat) => ({ last: { length: pat.last.length, foot: pat.last.foot, ballGirth: pat.last.ballGirth, instepGirth: pat.last.instepGirth, ballWidth: pat.last.ballWidth, heelWidth: pat.last.heelWidth, heelHeight: pat.last.heelHeight, toeSpring: pat.last.toeSpring, ballFromHeel: pat.last.ballFromHeel }, sizeRun: sizeRun(spec), tooling: pat.tooling, components: pat.components, hide: hideArea(pat), checks: pat.checks });
export function registerLabPatternRoutes(app, d) {
  const { pool, authenticate, adminOnly, lab = null, env = process.env, askImpl = callJsonSchema, log = console } = d;
  const own = req => lab?.scope?.(req) || null, pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const concept = async id => (UUID.test(String(id)) ? (await pool.query('select id, name, category, status, spec, client_id from lab_concepts where id=$1', [id])).rows[0] : null);
  // everything the page and the files need: the concept, its flat (for a garment), the saved choices
  async function load(id) {
    const c = await concept(id); if (!c) return null;
    const f = (await pool.query('select params from lab_flats where concept_id=$1', [c.id])).rows[0]?.params || null;
    const row = (await pool.query('select kind, spec, updated_at from lab_patterns where concept_id=$1', [c.id])).rows[0] || null;
    let flat = f, det = null;
    if (!flat && c.category !== 'plush') { det = c.spec?.style && STYLES[c.spec.style] ? { style: c.spec.style, fit: 'regular', options: {} } : detectStyle(c); if (det) flat = { ...defaultParams(det.style, det.fit, det.options), ...(det.template ? { template: det.template } : {}) }; }
    const kind = kindOf(c, flat?.style);
    const spec = kind === 'plush' ? cleanPlush(row?.kind === 'plush' ? row.spec : plushDefaults(c.spec?.plush?.shape || 'bear')) : kind === 'footwear' ? cleanFootwear(row?.kind === 'footwear' ? row.spec : fwDefaults(c.spec?.footwear?.style || guessShoe(c))) : cleanGarment(row?.spec);
    return { c, kind, flat, spec, saved: Boolean(row), savedFlat: Boolean(f), updatedAt: row?.updated_at || null };
  }
  const patternOf = (L, size) => L.kind === 'plush' ? plushPattern(L.spec) : L.kind === 'footwear' ? footwearPattern(L.spec, size !== '' && size != null && Number.isFinite(Number(size)) ? Number(size) : null) : L.kind === 'garment' && L.flat ? (p => p && L.spec.sa ? { ...p, sa: L.spec.sa } : p)(garmentPattern(L.flat, SIZES.includes(size) ? size : L.flat.size || 'M')) : null;
  const options = { footwear: { styles: Object.fromEntries(Object.entries(FW_STYLES).map(([k, v]) => [k, v.label])), toes: Object.fromEntries(Object.entries(TOES).map(([k, v]) => [k, v.label])), systems: SYSTEMS, widths: SHOE_WIDTHS, uppers: UPPERS, linings: LININGS, limits: SIZE_LIMITS }, plush: { shapes: PLUSH_SHAPES, ears: PLUSH_EARS, fabrics: PLUSH_FABRICS, eyes: PLUSH_EYES, ages: PLUSH_AGES }, widths: WIDTHS, seamAllowances: [.25, .375, .5, .625], sizes: SIZES, fits: FITS,
    styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { label: v.label, kind: v.kind, category: v.category }])), soon: SOON };

  app.get('/v1/lab/concepts/:id/pattern', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const pat = patternOf(L, L.flat?.size), extra = pat ? { yardage: yardage(pat, Number(L.spec.width) || 58), ...(pat.kind === 'plush' ? { fillGrams: fillGrams(pat) } : {}), ...(pat.kind === 'footwear' ? footExtra(L.spec, pat) : {}) } : {};
    const hasImage = L.kind === 'footwear' ? Boolean((await pool.query('select image is not null h from lab_concepts where id=$1', [L.c.id])).rows[0]?.h) : false;
    return { concept: { id: L.c.id, name: L.c.name, category: L.c.category, status: L.c.status, hasImage }, kind: L.kind, flat: L.flat, flatSaved: L.savedFlat, spec: L.spec, saved: L.saved, updatedAt: L.updatedAt, options, ...(L.kind === 'soon' ? { soon: SOON[L.c.category] } : {}), ...extra };
  });
  app.put('/v1/lab/concepts/:id/pattern', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    if (!['plush', 'garment', 'footwear'].includes(L.kind)) return bad(reply, L.kind === 'soon' ? SOON[L.c.category] : 'This piece has no pattern the Lab can draft yet');
    const spec = cleanPatternSpec(L.kind, req.body?.spec);
    await pool.query(`insert into lab_patterns(concept_id, kind, spec, updated_by) values($1,$2,$3,$4) on conflict(concept_id) do update set kind=excluded.kind, spec=excluded.spec, updated_by=excluded.updated_by, updated_at=now()`, [L.c.id, L.kind, spec, actorOf(req)]);
    const pat = patternOf({ ...L, spec }, L.flat?.size);
    return { ok: true, spec, yardage: yardage(pat, Number(spec.width) || 58), ...(pat.kind === 'plush' ? { fillGrams: fillGrams(pat), checks: pat.checks } : {}), ...(pat.kind === 'footwear' ? footExtra(spec, pat) : {}) };
  });
  const file = ext => async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404);
    const pat = patternOf(L, String(req.query?.size || '')); if (!pat) return bad(reply, L.kind === 'soon' ? SOON[L.c.category] : 'This piece has no pattern the Lab can draft yet');
    const width = WIDTHS.includes(Number(req.query?.width)) ? Number(req.query.width) : Number(L.spec.width) || 58, name = `${(L.c.name || 'pattern').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'pattern'}-pattern-${String(pat.size).replace(/[^a-z0-9]+/gi, '').toLowerCase()}`;
    reply.header('content-disposition', `attachment; filename="${name}.${ext}"`).header('cache-control', 'no-store');
    return ext === 'svg' ? reply.type('image/svg+xml; charset=utf-8').send(patternSvg(pat, { width, title: L.c.name })) : reply.type('application/dxf').send(patternDxf(pat, { width }));
  };
  app.get('/v1/lab/concepts/:id/pattern.svg', { preHandler: pre }, file('svg'));
  // the last, drawn for the last maker: side and bottom with its length, girths, widths, heel and toe spring
  app.get('/v1/lab/concepts/:id/last.svg', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404); if (L.kind !== 'footwear') return bad(reply, 'Only footwear has a last');
    const size = Number.isFinite(Number(req.query?.size)) && String(req.query?.size || '') !== '' ? Number(req.query.size) : null;
    reply.header('content-disposition', `attachment; filename="${(L.c.name || 'last').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-last-${size ?? L.spec.size}.svg"`).header('cache-control', 'no-store');
    return reply.type('image/svg+xml; charset=utf-8').send(lastSvg(L.spec, size));
  });
  app.get('/v1/lab/concepts/:id/pattern.dxf', { preHandler: pre }, file('dxf'));

  // read the shoe from the concept's picture: its outline (no AI) and, when Claude is connected, what the eye sees part by part. Nothing is
  // saved: the page shows what would change, the picture over the shoe, and saves it when it is used. One reading per picture is kept.
  const shoeReads = new Map();
  app.post('/v1/lab/concepts/:id/pattern/from-picture', { preHandler: pre }, async (req, reply) => {
    const L = await load(req.params.id); if (!L) return bad(reply, 'Not found', 404); if (L.kind !== 'footwear') return bad(reply, 'Only a shoe is read from its picture here');
    const img = (await pool.query('select image from lab_concepts where id=$1', [L.c.id])).rows[0]?.image; if (!img) return bad(reply, 'This concept has no picture to read');
    const key = createHash('sha1').update(img).digest('hex');
    let got = shoeReads.get(key);
    if (!got) {
      let sil = null, vision = null, source = 'shape';
      try { sil = await silhouette(img); } catch (e) { log.warn?.({ err: e.message }, 'shoe outline failed'); }
      if (env.AI_FIXTURE || !env.ANTHROPIC_API_KEY) { try { vision = env.SHOE_READ_FIXTURE ? JSON.parse(env.SHOE_READ_FIXTURE) : null; } catch { vision = null; } }
      else { try { vision = await readShoe(img, { ask: askImpl, name: L.c.name }); } catch (e) { log.warn?.({ err: e.message }, 'shoe picture read failed'); } }
      if (vision) source = 'vision';
      got = { sil, vision, source }; if (shoeReads.size > 300) shoeReads.clear(); shoeReads.set(key, got);
    }
    if (got.vision && got.vision.footwear === false) return bad(reply, 'The picture does not show a shoe');
    const p = proposal(L.spec, got.sil, got.vision);
    if (!p.side && !got.vision) return bad(reply, 'The picture is not a side view of the shoe, so its outline cannot be read: make or upload a side view, or set the shoe by hand');
    return { spec: p.spec, changes: p.changes, shape: p.shape, side: p.side, source: got.source, why: p.why, view: got.vision?.view || (p.side ? 'side' : 'other') };
  });

  // a concept started from nothing: no plan, no AI, no sketch. A garment opens on a blank page with its flat's outline as a guide; a plush opens
  // on its shape; anything else on a plain page.
  app.post('/v1/lab/concepts/from-scratch', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, category = CATEGORIES.some(x => x.id === b.category) ? b.category : null; if (!category) return bad(reply, 'Choose what you are designing');
    const shoe = category === 'footwear' ? (FW_STYLES[b.style] ? b.style : 'sneaker') : null, style = !shoe && STYLES[b.style] ? b.style : null, shape = PLUSH_SHAPES[b.shape] ? b.shape : 'bear';
    if (style && STYLES[style].category !== category && !(category === 'knitwear' && STYLES[style].category === 'tops')) return bad(reply, 'That style is not in that category');
    const label = shoe ? FW_STYLES[shoe].label : category === 'plush' ? PLUSH_SHAPES[shape].replace(/ \(.*$/, '') : style ? STYLES[style].label : CATEGORIES.find(x => x.id === category).label;
    const name = clip(b.name, 120) || `Untitled ${label.toLowerCase()}`;
    const spec = { description: 'Started from scratch in Design.', silhouette: style ? STYLES[style].label : category === 'plush' || shoe ? label : '', fabric: '', fit: '', details: [], trims: '', colors: [], scratch: true, ...(style ? { style, template: 'none' } : {}), ...(category === 'plush' ? { plush: { shape } } : {}), ...(shoe ? { footwear: { style: shoe } } : {}) };
    const r = (await pool.query(`insert into lab_concepts(name, category, role, spec, twist, created_by, client_id) values($1,$2,'core',$3,'',$4,$5) returning id`, [name, category, spec, actorOf(req), own(req)])).rows[0];
    if (shoe) await pool.query(`insert into lab_patterns(concept_id, kind, spec, updated_by) values($1,'footwear',$2,$3) on conflict do nothing`, [r.id, fwDefaults(shoe), actorOf(req)]);
    if (category === 'plush') await pool.query(`insert into lab_patterns(concept_id, kind, spec, updated_by) values($1,'plush',$2,$3) on conflict do nothing`, [r.id, plushDefaults(shape), actorOf(req)]);
    return reply.code(201).send({ concept: { id: r.id, name, category }, studio: `/lab/studio?concept=${r.id}&scratch=1` });
  });
  return { load, patternOf };
}
