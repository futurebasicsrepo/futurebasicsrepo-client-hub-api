// Design Lab concepts API (the Lab module). A planned piece gets several concepts, each drawn and checked against what inspired it; the team comments, approves or
// rejects; an approved concept becomes a product in the Future Basics room and its tech pack is drafted from the concept.
//   POST /v1/lab/plans/:id/lines/:lineId/concepts {count?, note?}   make concepts for one planned piece (assistant, then a picture each, then the check)
//   GET  /v1/lab/concepts?plan=&line=&status=                         the board        GET /v1/lab/concepts/:id (with the references and the comments)
//   GET  /v1/lab/concepts/:id/image                                    the picture (needs the sign-in header, so the page fetches it)
//   PUT  /v1/lab/concepts/:id                                          edit the words, price, cost or quantity (an approved concept goes back to draft, and is checked again)
//   POST /v1/lab/concepts/:id/check | comments | approve | reject | reopen | revise | tech-pack      DELETE /v1/lab/concepts/:id
import { imageConfig } from './check.js';
import { ask as realAsk, providerReady } from './intel-llm.js';
import { categoryLabel } from './lab.js';
import { createLabData } from './lab-data.js';
import { generateConcepts, artworkFiles, renderConcept, finishConcept, aiOpinion, closeness, cleanConceptEdit, productBrief, ensureBranding, LOGO_MARKS, LOGO_TECHNIQUES, GRAPHIC_PLACE, GRAPHIC_TECHNIQUES, PRODUCT_TYPES } from './lab-concepts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const dataUrl = b => (b ? `data:image/jpeg;base64,${Buffer.from(b).toString('base64')}` : '');

export function registerLabConceptRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, env = process.env, fetchImpl = fetch, askImpl = realAsk, createProduct, attachArtwork, imageCfg = () => imageConfig(env), placeImpl, art: artSvc = null, flatFiles = null, log = console } = d;
  // the artwork of a concept's graphics, as PNGs by id (empty when there is no artwork service)
  const artsFor = async spec => (artSvc ? artSvc.load((spec?.graphics || []).map(g => g.art).filter(Boolean)) : new Map());
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const { loadCode, trendsFor } = createLabData(pool, getSetting);
  const nameOf = async req => { const id = actorOf(req); if (!id) return 'Staff'; const u = (await pool.query(`select coalesce(nullif(name,''), split_part(email,'@',1)) n from users where id=$1`, [id])).rows[0]; return u?.n || 'Staff'; };
  const brandNames = async () => (await pool.query('select name from lab_brands')).rows.map(r => r.name);
  const refRows = async ids => (ids?.length ? (await pool.query(`select i.id, i.title, i.url, i.image_url, i.price_cents, i.attrs, i.summary, b.name brand from lab_items i left join lab_brands b on b.id=i.brand_id where i.id = any($1::uuid[])`, [ids])).rows : []);
  const refShape = r => ({ id: r.id, title: r.title, url: r.url, imageUrl: r.image_url, price: r.price_cents == null ? null : r.price_cents / 100, brand: r.brand || '', attrs: r.attrs || {}, summary: r.summary || '' });
  const productUrl = id => (id ? `/tech-packs/${id}` : '');

  const shape = (r, { refs = null } = {}) => ({
    id: r.id, planId: r.plan_id, planName: r.plan_name || '', lineId: r.line_id, parentId: r.parent_id, name: r.name, category: r.category, categoryLabel: categoryLabel(r.category), role: r.role, spec: ensureBranding(r.spec || {}, r.category), twist: r.twist,
    price: r.price_cents == null ? null : r.price_cents / 100, cost: r.cost_cents == null ? null : r.cost_cents / 100, qty: r.qty, status: r.status, closeness: r.closeness || null, hasImage: Boolean(r.has_image ?? r.image), thumb: dataUrl(r.thumb), imageNote: r.image_note,
    overrideReason: r.override_reason, rejectedReason: r.rejected_reason, approvedBy: r.approver || '', approvedAt: r.approved_at, productId: r.product_id, productUrl: productUrl(r.product_id), createdAt: r.created_at, updatedAt: r.updated_at,
    ...(refs ? { refs: refs.map(refShape) } : { refIds: r.refs || [] })
  });
  const SELECT = `select c.id, c.plan_id, c.line_id, c.parent_id, c.name, c.category, c.role, c.spec, c.twist, c.price_cents, c.cost_cents, c.qty, c.refs, c.thumb, c.image_note, c.status, c.closeness, c.override_reason, c.rejected_reason, c.approved_at, c.product_id, c.created_at, c.updated_at,
    (c.image is not null) has_image, p.name plan_name, coalesce(nullif(u.name,''), split_part(u.email,'@',1)) approver from lab_concepts c left join lab_plans p on p.id=c.plan_id left join users u on u.id=c.approved_by`;
  async function one(id) { const r = (await pool.query(`${SELECT} where c.id=$1`, [id])).rows[0]; return r ? shape(r, { refs: await refRows(r.refs) }) : null; }
  const note = async (conceptId, req, body) => pool.query(`insert into lab_concept_comments(concept_id,user_id,name,body) values($1,$2,$3,$4)`, [conceptId, actorOf(req), await nameOf(req), clip(body, 1000)]);

  // Check one concept: the words against the pieces it was drawn from, then the assistant's second opinion when it can be had.
  async function runCheck(c, { withAi = true } = {}) {
    const refs = (await refRows(c.refs)).map(r => ({ id: r.id, title: r.title, brand: r.brand, attrs: r.attrs || {}, summary: r.summary })), names = await brandNames();
    const concept = { name: c.name, spec: c.spec, twist: c.twist };
    let ai = null, cents = 0;
    if (withAi) { try { const o = await aiOpinion({ concept, refs, code: await loadCode(), askImpl, env, fetchImpl }); ai = o.ai; cents = o.costCents; } catch (e) { log.warn?.({ err: e.message }, 'design lab second opinion failed'); } }
    return { closeness: closeness(concept, refs, { brandNames: names, ai }), cents };
  }

  // Make concepts for a planned piece (or one revised from an earlier concept), draw each, check each, and keep them.
  async function make({ plan, line, count, note: steer, parent = null, refIds, req }) {
    const code = await loadCode(), names = await brandNames(), trends = await trendsFor(180), cat = trends.categories.find(c => c.id === line.category);
    let ids = refIds?.length ? refIds : cat?.movers?.map(m => m.id) || [];
    const refs = await refRows(ids.slice(0, 6));
    const program = plan?.id ? (await pool.query('select program from lab_plans where id=$1', [plan.id])).rows[0]?.program || null : null;
    const gen = await generateConcepts({ line, plan, refs: refs.map(r => ({ title: r.title, attrs: r.attrs })), trend: cat, program, code, count, note: steer, parent, askImpl, env, fetchImpl });
    if (!gen.concepts.length) throw Object.assign(new Error('The assistant did not come back with usable concepts. Try again, or change the note.'), { status: 502 });
    const cfg = imageCfg(), refLite = refs.map(r => ({ id: r.id, title: r.title, brand: r.brand, attrs: r.attrs || {}, summary: r.summary }));
    const made = await Promise.all(gen.concepts.map(async c => {
      const concept = { ...c, category: line.category };
      let img = null, imageNote = '';
      if (!cfg.configured) imageNote = 'No image model is connected, so this concept has no picture yet.';
      else {
        // a graphic with no artwork yet (a new one, or a program motif still being drawn) is drawn now, so the picture can carry it
        if (artSvc) for (const g of c.spec.graphics || []) { if (g.art || g.svg) continue; try { g.art = await artSvc.drawAndStore(g, { program, planId: plan?.id || null, technique: g.technique }); } catch (e) { log.warn?.({ err: e.message }, 'design lab concept artwork failed'); } }
        try { img = await renderConcept(concept, { cfg, brandNames: names, arts: await artsFor(c.spec) }); } catch (e) { imageNote = `The picture could not be drawn: ${clip(e.message, 160)}`; }
      }
      let ai = null, cents = gen.costCents / gen.concepts.length;
      try { const o = await aiOpinion({ concept, refs: refLite, code, askImpl, env, fetchImpl }); ai = o.ai; cents += o.costCents; } catch (e) { log.warn?.({ err: e.message }, 'design lab second opinion failed'); }
      return { c, img, imageNote, close: closeness(concept, refLite, { brandNames: names, ai }), cents };
    }));
    const out = [];
    for (const m of made) {
      const r = (await pool.query(`insert into lab_concepts(plan_id,line_id,parent_id,name,category,role,spec,twist,price_cents,cost_cents,qty,refs,image,thumb,image_note,closeness,created_by,cost_ai,raw)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
      [plan?.id || null, line.id || null, parent?.id || null, m.c.name, line.category, line.role, m.c.spec, m.c.twist, line.priceCents ?? null, line.costCents ?? null, line.qty ?? 0, refs.map(r => r.id), m.img?.image || null, m.img?.thumb || null, m.imageNote, m.close, actorOf(req), m.cents, m.img?.raw || null])).rows[0];
      out.push(await one(r.id));
    }
    if (line.id) await pool.query(`update lab_plan_lines set status='in_concept' where id=$1 and status='planned'`, [line.id]);
    return out;
  }
  const capLeft = async n => { const cap = Number(env.LAB_DAILY_CONCEPTS ?? 30); if (cap < 0) return true; return Number((await pool.query(`select count(*) c from lab_concepts where created_at > now() - interval '24 hours'`)).rows[0].c) + n <= cap ? true : cap; };

  app.post('/v1/lab/plans/:id/lines/:lineId/concepts', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply) || !UUID.test(req.params.lineId)) return bad(reply, 'Not found', 404);
    const plan = (await pool.query('select id,name,season,brief from lab_plans where id=$1', [req.params.id])).rows[0]; if (!plan) return bad(reply, 'Not found', 404);
    const lr = (await pool.query('select * from lab_plan_lines where id=$1 and plan_id=$2', [req.params.lineId, plan.id])).rows[0]; if (!lr) return bad(reply, 'Not found', 404);
    if (lr.status === 'dropped') return bad(reply, 'That piece is dropped from the plan. Restore it first.', 409);
    const count = Math.min(Math.max(Math.round(Number(req.body?.count)) || 3, 1), 4), left = await capLeft(count);
    if (left !== true) return bad(reply, `The daily limit of ${left} concepts is reached. Raise LAB_DAILY_CONCEPTS, or review the ones already made.`, 429);
    if (!providerReady('anthropic', env)) return bad(reply, 'Claude is not connected (the service needs ANTHROPIC_API_KEY)', 503);
    const line = { id: lr.id, name: lr.name, category: lr.category, role: lr.role, brief: lr.brief, twist: lr.twist, rationale: lr.rationale, priceCents: lr.price_cents, costCents: lr.cost_cents, qty: lr.qty };
    try { return reply.code(201).send({ concepts: await make({ plan, line, count, note: req.body?.note, refIds: lr.refs, req }) }); } catch (e) { return bad(reply, e.message, e.status || 502); }
  });

  app.get('/v1/lab/concepts', { preHandler: pre }, async req => {
    const q = req.query || {}, where = [], args = [];
    if (UUID.test(String(q.plan || ''))) { args.push(q.plan); where.push(`c.plan_id=$${args.length}`); }
    if (UUID.test(String(q.line || ''))) { args.push(q.line); where.push(`c.line_id=$${args.length}`); }
    if (['draft', 'approved', 'rejected', 'tech_pack'].includes(q.status)) { args.push(q.status); where.push(`c.status=$${args.length}`); }
    const limit = Math.min(Math.max(Number(q.limit) || 60, 1), 120);
    const rows = (await pool.query(`${SELECT} ${where.length ? 'where ' + where.join(' and ') : ''} order by c.created_at desc limit ${limit}`, args)).rows;
    const counts = (await pool.query(`select status, count(*)::int n from lab_concepts group by 1`)).rows;
    return { concepts: rows.map(r => shape(r)), counts: Object.fromEntries(counts.map(c => [c.status, c.n])), imageConnected: imageCfg().configured, options: { marks: LOGO_MARKS, logoTechniques: LOGO_TECHNIQUES, graphicPlaces: Object.keys(GRAPHIC_PLACE), graphicTechniques: GRAPHIC_TECHNIQUES } };
  });
  app.get('/v1/lab/concepts/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const c = await one(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const comments = (await pool.query(`select id, name, body, at from lab_concept_comments where concept_id=$1 order by at, id`, [c.id])).rows.map(r => ({ id: Number(r.id), name: r.name, body: r.body, at: r.at }));
    const parent = c.parentId ? (await pool.query('select id, name from lab_concepts where id=$1', [c.parentId])).rows[0] : null;
    return { concept: c, comments, parent: parent ? { id: parent.id, name: parent.name } : null };
  });
  app.get('/v1/lab/concepts/:id/image', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select image, updated_at from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r?.image) return bad(reply, 'No picture', 404);
    // revalidated every time (the picture changes when it is redrawn or its marks are placed again), so a redrawn picture is never shown from the browser's old copy
    const tag = `"${new Date(r.updated_at).getTime()}"`; if (req.headers['if-none-match'] === tag) return reply.code(304).header('etag', tag).send();
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-cache').header('etag', tag).send(r.image);
  });

  app.put('/v1/lab/concepts/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack. Change it there.', 409);
    const base = { name: r.name, twist: r.twist, spec: r.spec || {}, priceCents: r.price_cents, costCents: r.cost_cents, qty: r.qty, category: r.category }, e = cleanConceptEdit(req.body || {}, base); if (e.error) return bad(reply, e.error);
    const changedWords = JSON.stringify([e.name, e.twist, e.spec, e.category]) !== JSON.stringify([base.name, base.twist, base.spec, base.category]);
    const next = { ...r, name: e.name, twist: e.twist, spec: e.spec, category: e.category };
    const { closeness: close } = changedWords ? await runCheck({ name: e.name, spec: e.spec, twist: e.twist, refs: r.refs }, { withAi: false }) : { closeness: r.closeness };
    const merged = changedWords && r.closeness?.ai ? { ...close, ai: { ...r.closeness.ai, stale: true }, aiChecked: false, reasons: [...close.reasons, 'Edited since the second opinion: re-check it.'] } : close;
    const reset = changedWords && r.status === 'approved'; // a changed concept has to be approved again
    await pool.query(`update lab_concepts set name=$2, twist=$3, spec=$4, category=$5, price_cents=$6, cost_cents=$7, qty=$8, closeness=$9, status=$10, override_reason=$11, updated_at=now() where id=$1`,
      [r.id, next.name, next.twist, next.spec, next.category, e.priceCents, e.costCents, e.qty, merged, reset ? 'draft' : r.status, reset ? '' : r.override_reason]);
    if (reset) await note(r.id, req, 'Edited after approval: back to draft, to be approved again.');
    return { concept: await one(r.id) };
  });

  app.post('/v1/lab/concepts/:id/check', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const { closeness: close, cents } = await runCheck({ name: r.name, spec: r.spec, twist: r.twist, refs: r.refs });
    await pool.query('update lab_concepts set closeness=$2, cost_ai=cost_ai+$3, updated_at=now() where id=$1', [r.id, close, cents]);
    return { concept: await one(r.id) };
  });
  app.post('/v1/lab/concepts/:id/comments', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const body = clip(req.body?.body, 1000); if (!body) return bad(reply, 'Write a comment first');
    if (!(await pool.query('select 1 from lab_concepts where id=$1', [req.params.id])).rowCount) return bad(reply, 'Not found', 404);
    await note(req.params.id, req, body); return reply.code(201).send({ ok: true });
  });

  app.post('/v1/lab/concepts/:id/approve', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    if (r.status === 'approved') return { concept: await one(r.id) };
    if (clip(r.twist, 400).length < 15) return bad(reply, 'Say what our twist is before approving: the specific thing on this piece that is ours.', 422, { code: 'NO_TWIST' });
    let close = r.closeness; if (!close) close = (await runCheck({ name: r.name, spec: r.spec, twist: r.twist, refs: r.refs }, { withAi: false })).closeness;
    let override = '';
    if (close.verdict === 'too_close') {
      override = clip(req.body?.overrideReason, 400);
      if (override.length < 10) return bad(reply, `The check says this sits too close to what inspired it. ${close.reasons[0] || ''} Change it, or write down why it is fine to approve anyway.`, 422, { code: 'TOO_CLOSE', verdict: close.verdict, reasons: close.reasons });
    }
    // the flats' check: a piece that cannot be made as drawn is approved only with a reason written down
    const flat = (await pool.query(`select check_result from lab_flats where concept_id=$1`, [r.id])).rows[0]?.check_result, fails = Number(flat?.summary?.fail || 0);
    let makeReason = '';
    if (fails) {
      makeReason = clip(req.body?.makeReason, 400);
      const first = Object.values(flat.findings || {}).flat().find(f => f.level === 'fail');
      if (makeReason.length < 10) return bad(reply, `The flats check found ${fails} problem${fails === 1 ? '' : 's'} that mean it cannot be made as drawn. ${first?.text || ''} Fix ${fails === 1 ? 'it' : 'them'} in Flats and placement, or write down why it is fine to approve anyway.`, 422, { code: 'CANNOT_MAKE', fails });
      override = [override, `Flats check: ${makeReason}`].filter(Boolean).join(' · ');
    }
    await pool.query(`update lab_concepts set status='approved', override_reason=$2, rejected_reason='', approved_by=$3, approved_at=now(), updated_at=now() where id=$1`, [r.id, override, actorOf(req)]);
    if (r.line_id) await pool.query(`update lab_plan_lines set status='approved' where id=$1 and status in ('planned','in_concept')`, [r.line_id]);
    await note(r.id, req, `Approved${override && !makeReason ? ` after the "too close" check, because: ${override}` : close.verdict === 'check' ? ' (the check said to look at it side by side)' : ''}${makeReason ? `, although the flats check found ${fails} problem${fails === 1 ? '' : 's'}, because: ${makeReason}` : ''}.`);
    return { concept: await one(r.id) };
  });
  app.post('/v1/lab/concepts/:id/reject', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const why = clip(req.body?.reason, 400); if (!why) return bad(reply, 'Say why, so the next concept can be better');
    await pool.query(`update lab_concepts set status='rejected', rejected_reason=$2, approved_by=null, approved_at=null, updated_at=now() where id=$1`, [r.id, why]);
    if (r.line_id) await pool.query(`update lab_plan_lines set status='in_concept' where id=$1 and status='approved' and not exists(select 1 from lab_concepts where line_id=$1 and status in ('approved','tech_pack') and id<>$2)`, [r.line_id, r.id]);
    await note(r.id, req, `Rejected: ${why}`); return { concept: await one(r.id) };
  });
  app.post('/v1/lab/concepts/:id/reopen', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status !== 'rejected' && r.status !== 'approved') return bad(reply, 'Only an approved or rejected concept can go back to draft', 409);
    await pool.query(`update lab_concepts set status='draft', approved_by=null, approved_at=null, override_reason='', rejected_reason='', updated_at=now() where id=$1`, [r.id]);
    if (r.line_id) await pool.query(`update lab_plan_lines set status='in_concept' where id=$1 and status='approved' and not exists(select 1 from lab_concepts where line_id=$1 and status in ('approved','tech_pack') and id<>$2)`, [r.line_id, r.id]);
    await note(r.id, req, 'Back to draft.'); return { concept: await one(r.id) };
  });

  app.post('/v1/lab/concepts/:id/revise', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select c.*, p.name plan_name, p.season, p.brief plan_brief from lab_concepts c left join lab_plans p on p.id=c.plan_id where c.id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const steer = clip(req.body?.note, 400); if (!steer) return bad(reply, 'Say what to change, for example "less boxy, a longer back"');
    const left = await capLeft(1); if (left !== true) return bad(reply, `The daily limit of ${left} concepts is reached. Raise LAB_DAILY_CONCEPTS.`, 429);
    if (!providerReady('anthropic', env)) return bad(reply, 'Claude is not connected (the service needs ANTHROPIC_API_KEY)', 503);
    const lr = r.line_id ? (await pool.query('select * from lab_plan_lines where id=$1', [r.line_id])).rows[0] : null;
    const line = { id: lr?.id || null, name: lr?.name || r.name, category: r.category, role: r.role, brief: lr?.brief || r.spec?.description || '', twist: lr?.twist || r.twist, rationale: lr?.rationale || '', priceCents: r.price_cents, costCents: r.cost_cents, qty: r.qty };
    try { const out = await make({ plan: { id: r.plan_id, name: r.plan_name, season: r.season, brief: r.plan_brief }, line, count: 1, note: steer, parent: { id: r.id, name: r.name, spec: r.spec }, refIds: r.refs, req }); await note(r.id, req, `Revised: ${steer}`); return reply.code(201).send({ concept: out[0] }); }
    catch (e) { return bad(reply, e.message, e.status || 502); }
  });

  // draw the picture again from the concept as it is now (after its words, logo or graphics were changed), with the Future Basics marks put back on
  const redraws = new Map();
  app.post('/v1/lab/concepts/:id/redraw', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    const day = new Date().toISOString().slice(0, 10), cap = Number(env.LAB_DAILY_REDRAWS ?? 30); if (cap >= 0 && (redraws.get(day) || 0) >= cap) return bad(reply, `The daily limit of ${cap} redrawn pictures is reached. Raise LAB_DAILY_REDRAWS.`, 429);
    const cfg = imageCfg(); if (!cfg.configured) return bad(reply, 'No image model is connected, so there is no picture to draw.', 503);
    // graphics made before the artwork was drawn by the image model (simple shapes) get real artwork now, so the redrawn picture carries it
    const spec = ensureBranding(r.spec || {}, r.category);
    if (artSvc && spec.graphics.some(g => !g.art)) {
      const program = r.plan_id ? (await pool.query('select program from lab_plans where id=$1', [r.plan_id])).rows[0]?.program || null : null; let changed = false;
      for (const g of spec.graphics) { if (g.art) continue; try { g.art = await artSvc.drawAndStore(g, { program, planId: r.plan_id, conceptId: r.id, technique: g.technique }); changed = true; } catch (e) { log.warn?.({ err: e.message }, 'design lab concept artwork failed'); } }
      if (changed) { await pool.query('update lab_concepts set spec=$2 where id=$1', [r.id, spec]); r.spec = spec; }
    }
    let img; try { img = await renderConcept({ name: r.name, category: r.category, twist: r.twist, spec }, { cfg, brandNames: await brandNames(), arts: await artsFor(spec) }); } catch (e) { return bad(reply, `The picture could not be drawn: ${clip(e.message, 160)}`, 502); }
    redraws.set(day, (redraws.get(day) || 0) + 1);
    await pool.query(`update lab_concepts set image=$2, thumb=$3, raw=$4, image_note='', updated_at=now() where id=$1`, [r.id, img.image, img.thumb, img.raw || null]);
    await pool.query('delete from lab_concept_views where concept_id=$1', [r.id]); // the flats, the on-model views and the walk were drawn from the old picture
    return { concept: await one(r.id) };
  });

  // lay the logo and graphics on again, in the right places, without drawing the picture again (needs the plain picture, which pictures drawn since this was added keep)
  app.post('/v1/lab/concepts/:id/replace-marks', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select * from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'tech_pack') return bad(reply, 'This concept is already a tech pack', 409);
    if (!r.raw && (await pool.query('select 1 from lab_studio_docs where concept_id=$1 and applied_at is not null', [r.id])).rowCount) return bad(reply, 'This picture was finished in the studio, so the logo and graphics are part of it now. Move them in the studio, or redraw the picture.', 409);
    if (!r.raw) return bad(reply, 'This picture was drawn before the plain copy was kept. Use Redraw the picture once; after that the marks can be placed again for free.', 409);
    let img; try { img = await finishConcept(r.raw, { name: r.name, category: r.category, twist: r.twist, spec: ensureBranding(r.spec || {}, r.category) }, { cfg: imageCfg(), locate: placeImpl, arts: await artsFor(r.spec) }); } catch (e) { return bad(reply, `The marks could not be placed: ${clip(e.message, 160)}`, 502); }
    await pool.query(`update lab_concepts set image=$2, thumb=$3, updated_at=now() where id=$1`, [r.id, img.image, img.thumb]);
    await pool.query('delete from lab_concept_views where concept_id=$1', [r.id]);
    return { concept: await one(r.id) };
  });

  app.post('/v1/lab/concepts/:id/tech-pack', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select c.*, p.name plan_name, p.season, p.program->>\'name\' program_name from lab_concepts c left join lab_plans p on p.id=c.plan_id where c.id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.product_id) return bad(reply, 'This concept already has a tech pack', 409, { productId: r.product_id, url: productUrl(r.product_id) });
    if (r.status !== 'approved') return bad(reply, 'Approve the concept first', 409);
    if (r.closeness?.verdict === 'too_close' && clip(r.override_reason, 400).length < 10) return bad(reply, 'The check says this is too close to what inspired it, and no reason was written down. Reopen it and approve it again.', 409);
    if (!createProduct) return bad(reply, 'Tech packs cannot be started from here on this service', 501);
    const room = (await pool.query(`select id from clients where slug='future-basics' and status='active'`)).rows[0]; if (!room) return bad(reply, 'The Future Basics room is not active', 409);
    // claim it first, so two clicks make one product; give the claim back if the product cannot be made
    const claimed = await pool.query(`update lab_concepts set status='tech_pack', updated_at=now() where id=$1 and product_id is null and status='approved' returning id`, [r.id]);
    if (!claimed.rowCount) return bad(reply, 'This concept already has a tech pack', 409);
    const photo = (await pool.query('select image from lab_concepts where id=$1', [r.id])).rows[0]?.image;
    let product; try { product = await createProduct({ clientId: room.id, title: r.name, descriptionHtml: productBrief({ name: r.name, category: r.category, programName: r.program_name, spec: r.spec, twist: r.twist, priceCents: r.price_cents, costCents: r.cost_cents, qty: r.qty }, { name: r.plan_name, season: r.season }), vendor: 'Future Basics', productType: PRODUCT_TYPES[r.category] || null, referencePhotos: photo ? [dataUrl(photo)] : [], actorId: actorOf(req) }); }
    catch (e) { await pool.query(`update lab_concepts set status='approved' where id=$1 and product_id is null`, [r.id]); return bad(reply, `The product could not be made: ${clip(e.message, 200)}`, 502); }
    await pool.query(`update lab_concepts set product_id=$2, updated_at=now() where id=$1`, [r.id, product.id]);
    let art = 0; if (attachArtwork) { try { art = await attachArtwork(product.id, await artworkFiles({ category: r.category, spec: r.spec }, { arts: await artsFor(r.spec) })); } catch (e) { log.warn?.({ err: e.message }, 'design lab artwork not attached'); } }
    // the flats and the spec sheet go with it when they were drawn
    if (attachArtwork && flatFiles) { try { const ff = await flatFiles(r.id); if (ff.length) art += await attachArtwork(product.id, ff); } catch (e) { log.warn?.({ err: e.message }, 'design lab flats not attached'); } }
    if (r.line_id) await pool.query(`update lab_plan_lines set status='tech_pack' where id=$1`, [r.line_id]);
    await note(r.id, req, `Sent to a tech pack (${product.autoDraft?.ai === 'pending' ? 'the assistant is drafting it from the concept' + (art ? `; ${art} artwork files attached: the logo, the woven label and the graphics` : '') : product.autoDraft?.ai === 'off' ? 'the assistant is off, so it starts empty' : 'started'}).`);
    return reply.code(201).send({ productId: product.id, url: productUrl(product.id), autoDraft: product.autoDraft || null, concept: await one(r.id) });
  });

  app.delete('/v1/lab/concepts/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query('select status from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'tech_pack') return bad(reply, 'A concept that became a tech pack stays as its record', 409);
    await pool.query('delete from lab_concepts where id=$1', [req.params.id]); return { ok: true };
  });
}
