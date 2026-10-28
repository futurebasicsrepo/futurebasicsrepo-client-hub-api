// Range-level work in the Design Lab: one instruction across a whole collection, the taste the Lab has learned, the lookbook and the customer poll.
//   Taste     GET /v1/lab/taste        POST /v1/lab/taste/refresh {ai?: true}        PUT /v1/lab/taste {use: true|false}
//   Range     POST /v1/lab/plans/:id/range/preview {instruction, which?: 'in_play'|'approved'|'all'}   → the change per piece, nothing applied
//             POST /v1/lab/plans/:id/range/apply {instruction, changes: [{id, fields}]}                 → applies the ticked changes, one by one
//   Lookbook  GET /v1/lab/plans/:id/lookbook.pdf?which=
//   Polls     GET /v1/lab/plans/:id/polls   POST /v1/lab/plans/:id/polls {title?, intro?, which?, days?}   POST /v1/lab/polls/:pid/close   GET /v1/lab/polls/:pid/results
//   Mockup    POST /v1/lab/plans/:id/mockup {art, placement, which?}   one library graphic on every piece of the range, as pictures (nothing kept)
//             POST /v1/lab/plans/:id/mockup/apply {art, placement, techniqueId?, ids}   put it on the ticked pieces: on their words and on their pictures
//   Public    GET /v1/lab/poll/:token   GET …/pieces/:id/image   POST …/votes {name?, email?, votes: [{id, vote, price?, note?}]}   (the page: src/lab-poll.html)
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { locateMarks } from './lab-place.js';
import { GRAPHIC_PLACE } from './lab-concepts.js';
import { ask as realAsk, providerReady } from './intel-llm.js';
import { createLabData } from './lab-data.js';
import { hashToken } from './lab-share-routes.js';
import { planRangeEdit, cleanRangeChanges, rangeView } from './lab-range.js';
import { learnTaste, tasteStats, cleanTasteUse } from './lab-taste.js';
import { pieceView, cleanVotes, voterKey, cleanEmail, pollResults, lookbookPdf } from './lab-lookbook.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WHICH = { in_play: `c.status <> 'rejected'`, approved: `c.status in ('approved','tech_pack')`, all: 'true' };

export function registerLabRangeRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, editConcept, env = process.env, fetchImpl = fetch, askImpl = realAsk, notifyStaff = async () => false, locate = locateMarks, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const need = (req, reply, k = 'id') => UUID.test(String(req.params[k])) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const { loadCode } = createLabData(pool, getSetting);
  const origin = req => { const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0], host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]; return host ? `${proto}://${host}` : ''; };
  const plan = async id => (await pool.query('select id, name, season, brief, brand, client_id from lab_plans where id=$1', [id])).rows[0] || null;
  const pieces = async (planId, which = 'in_play', { withImage = false } = {}) => (await pool.query(`select c.id, c.name, c.category, c.role, c.status, c.spec, c.twist, c.price_cents, (c.image is not null) has_image${withImage ? ', c.image' : ''} from lab_concepts c where c.plan_id=$1 and ${WHICH[which] || WHICH.in_play} order by c.category, c.role, c.created_at`, [planId])).rows;
  const whichOf = v => (WHICH[v] ? v : 'in_play');

  // ---- the learned taste ----
  app.get('/v1/lab/taste', { preHandler: pre }, async () => {
    let t = await getSetting('labTaste').catch(() => null);
    if (!t) { const rows = (await pool.query(`select name, status, client_verdict, client_note, rejected_reason, spec, category, price_cents from lab_concepts where status in ('approved','rejected','tech_pack') or client_verdict in ('approved','changes') order by updated_at desc limit 600`)).rows; t = { ...tasteStats(rows), use: true, digest: null, digestAt: null }; }
    return { taste: t, connected: providerReady('anthropic', env) };
  });
  app.post('/v1/lab/taste/refresh', { preHandler: pre }, async (req, reply) => {
    const withAi = req.body?.ai !== false;
    if (withAi && !providerReady('anthropic', env)) return bad(reply, 'Claude is not connected (the service needs ANTHROPIC_API_KEY): the counts can be read without it', 503);
    try { return { taste: await learnTaste({ pool, getSetting, setSetting, withAi, code: await loadCode(), askImpl, env, fetchImpl }) }; } catch (e) { return bad(reply, e.message, e.status || 502); }
  });
  app.put('/v1/lab/taste', { preHandler: pre }, async req => {
    const cur = (await getSetting('labTaste').catch(() => null)) || (await learnTaste({ pool, getSetting, setSetting }));
    const next = { ...cur, use: cleanTasteUse(req.body?.use) }; await setSetting('labTaste', next); return { taste: next };
  });

  // ---- one change across the range ----
  const dailyRange = new Map();
  app.post('/v1/lab/plans/:id/range/preview', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const p = await plan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const instruction = clip(req.body?.instruction, 400); if (instruction.length < 4) return bad(reply, 'Say what to change across the range, for example "make every tee 260 gsm and swap the accent to olive"');
    if (!providerReady('anthropic', env)) return bad(reply, 'Claude is not connected (the service needs ANTHROPIC_API_KEY)', 503);
    const day = new Date().toISOString().slice(0, 10), cap = Number(env.LAB_DAILY_RANGE ?? 40); if (cap >= 0 && (dailyRange.get(day) || 0) >= cap) return bad(reply, `The daily limit of ${cap} range previews is reached. Raise LAB_DAILY_RANGE.`, 429);
    const rows = await pieces(p.id, whichOf(req.body?.which)), editable = rows.filter(r => r.status !== 'tech_pack'), packs = rows.filter(r => r.status === 'tech_pack');
    if (!editable.length) return bad(reply, 'There is no concept in this range that can still be changed here. A tech pack is changed on the tech pack.', 409);
    const taste = (await getSetting('labTaste').catch(() => null)); 
    try {
      const out = await planRangeEdit({ instruction, concepts: editable, code: await loadCode(), taste: taste && taste.use !== false ? taste : null, plan: p, askImpl, env, fetchImpl });
      dailyRange.set(day, (dailyRange.get(day) || 0) + 1);
      return { instruction, changes: out.changes, skipped: [...out.skipped, ...packs.map(r => ({ id: r.id, name: r.name, why: 'Already a tech pack: change it there' }))], costCents: out.costCents, pieces: rows.length };
    } catch (e) { return bad(reply, e.message, e.status || 502); }
  });
  app.post('/v1/lab/plans/:id/range/apply', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const p = await plan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const instruction = clip(req.body?.instruction, 400), rows = await pieces(p.id, 'all'), changes = cleanRangeChanges(req.body?.changes, rows.filter(r => r.status !== 'tech_pack'));
    if (!changes.length) return bad(reply, 'Tick at least one change to apply');
    const applied = [], failed = [];
    for (const ch of changes) {
      // a list field is sent whole; a text field as its new text: the same body the editor sends
      const body = {}; for (const [k, v] of Object.entries(ch.fields)) body[k] = v;
      const out = await editConcept(ch.id, body, req, { why: `Changed across the range${instruction ? `: "${instruction}"` : ''}${ch.why ? ` (${ch.why})` : ''}` });
      if (out.error) failed.push({ id: ch.id, error: out.error }); else applied.push({ id: ch.id, name: out.concept.name, status: out.concept.status, fields: Object.keys(ch.fields), closeness: out.concept.closeness?.verdict || null });
    }
    return { applied, failed, backToDraft: applied.filter(a => a.status === 'draft' && rows.find(r => r.id === a.id)?.status === 'approved').length };
  });

  // ---- one graphic across the whole range ----
  // where a graphic goes, by the kind of piece: "auto" is the usual spot for each; a spot that does not exist on a piece (a thigh on a tee) skips it
  const SPOTS = { 'left chest': ['tops', 'knitwear', 'outerwear', 'tailoring', 'dresses'], 'front chest': ['tops', 'knitwear', 'outerwear', 'tailoring', 'dresses'], 'full front': ['tops', 'knitwear', 'outerwear', 'dresses'], thigh: ['bottoms'], 'cap front': ['headwear'], 'bag front': ['bags'] };
  const AUTO = { tops: 'left chest', knitwear: 'left chest', outerwear: 'left chest', tailoring: 'left chest', dresses: 'front chest', bottoms: 'thigh', headwear: 'cap front', bags: 'bag front' };
  const spotFor = (placement, category) => placement === 'auto' ? AUTO[category] || null : (SPOTS[placement] || []).includes(category) ? placement : null;
  const artPng = async id => (UUID.test(String(id || '')) ? (await pool.query('select name, png from lab_art where id=$1', [id])).rows[0] : null);
  // the graphic laid on a piece's picture: where the vision model says (with a key), else the usual fractions for the spot
  async function layOn(buf, png, spot, category) {
    const meta = await sharp(buf).metadata(), W = meta.width, H = meta.height, fb = GRAPHIC_PLACE[spot] || { x: .5, y: .45, w: .25 };
    let f = null; if (env.ANTHROPIC_API_KEY && !env.AI_FIXTURE) { try { const r = await locate({ image: await sharp(buf).jpeg().toBuffer(), category, marks: [{ id: 'g', where: `a graphic: ${spot}`, w: fb.w }], env }); f = r?.get?.('g') || null; } catch { f = null; } }
    const at = f || fb, w = Math.max(8, Math.round((f ? f.w : fb.w) * W)); let art = await sharp(png).resize({ width: w }).png().toBuffer();
    if (f && Math.abs(f.angle) > .5) art = await sharp(art).rotate(f.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const m = await sharp(art).metadata();
    return sharp(buf).composite([{ input: art, left: Math.max(0, Math.min(W - m.width, Math.round(at.x * W - m.width / 2))), top: Math.max(0, Math.min(H - m.height, Math.round(at.y * H - m.height / 2))) }]).jpeg({ quality: 88 }).toBuffer();
  }
  const mockPieces = async (planId, which) => (await pool.query(`select c.id, c.name, c.category, c.status, c.spec, c.image from lab_concepts c where c.plan_id=$1 and ${WHICH[which] || WHICH.in_play} order by c.category, c.role, c.created_at limit 24`, [planId])).rows;
  app.post('/v1/lab/plans/:id/mockup', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const p = await plan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const b = req.body || {}, a = await artPng(b.art); if (!a) return bad(reply, 'Choose a graphic from the library');
    const placement = b.placement === 'auto' || SPOTS[b.placement] ? b.placement : 'auto', rows = await mockPieces(p.id, whichOf(b.which)); if (!rows.length) return bad(reply, 'There is no concept in this range yet', 409);
    const items = [];
    for (const r of rows) {
      const spot = spotFor(placement, r.category), base = { id: r.id, name: r.name, category: r.category, status: r.status };
      if (r.status === 'tech_pack') { items.push({ ...base, skipped: 'Already a tech pack: change it there' }); continue; }
      if (!spot) { items.push({ ...base, skipped: `No ${placement} on this kind of piece` }); continue; }
      if (!r.image) { items.push({ ...base, spot, skipped: 'No picture yet' }); continue; }
      const out = await layOn(r.image, a.png, spot, r.category), small = await sharp(out).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
      items.push({ ...base, spot, image: `data:image/jpeg;base64,${small.toString('base64')}` });
    }
    return { art: { id: b.art, name: a.name }, placement, items };
  });
  app.post('/v1/lab/plans/:id/mockup/apply', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const p = await plan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const b = req.body || {}, a = await artPng(b.art); if (!a) return bad(reply, 'Choose a graphic from the library');
    const placement = b.placement === 'auto' || SPOTS[b.placement] ? b.placement : 'auto', ids = new Set((Array.isArray(b.ids) ? b.ids : []).filter(x => UUID.test(String(x))));
    if (!ids.size) return bad(reply, 'Tick at least one piece');
    const tech = UUID.test(String(b.techniqueId || '')) ? (await pool.query('select id, name, base from lab_techniques where id=$1', [b.techniqueId])).rows[0] : null;
    const rows = (await mockPieces(p.id, 'all')).filter(r => ids.has(r.id)), applied = [], skipped = [];
    for (const r of rows) {
      const spot = spotFor(placement, r.category); if (!spot || r.status === 'tech_pack') { skipped.push({ id: r.id, name: r.name, why: r.status === 'tech_pack' ? 'Already a tech pack' : `No ${placement} on this kind of piece` }); continue; }
      const graphics = Array.isArray(r.spec?.graphics) ? r.spec.graphics : [];
      if (graphics.some(g => g.art === b.art)) { skipped.push({ id: r.id, name: r.name, why: 'Already carries this graphic' }); continue; }
      if (graphics.length >= 4) { skipped.push({ id: r.id, name: r.name, why: 'Already has four graphics' }); continue; }
      const g = { name: clip(a.name, 80) || 'Library graphic', kind: 'icon', idea: `From the graphics library, put on across the range: ${clip(a.name, 80)}`, placement: spot, technique: tech?.base || 'screen print', art: b.art, ...(tech ? { finish: { id: tech.id, name: tech.name } } : {}) };
      const out = await editConcept(r.id, { graphics: [...graphics, g] }, req, { why: `The graphic "${clip(a.name, 60)}" was put on across the range (${spot}).` });
      if (out.error) { skipped.push({ id: r.id, name: r.name, why: out.error }); continue; }
      // the picture shows it straight away; the flats and the tech pack take it from the concept's words
      if (r.image) { const img = await layOn(r.image, a.png, spot, r.category), thumb = await sharp(img).resize({ width: 420, height: 420, fit: 'inside' }).jpeg({ quality: 72 }).toBuffer();
        await pool.query('update lab_concepts set image=$2, thumb=$3, updated_at=now() where id=$1', [r.id, img, thumb]); await pool.query('delete from lab_concept_views where concept_id=$1', [r.id]).catch(() => {}); }
      applied.push({ id: r.id, name: r.name, spot, status: out.concept.status });
    }
    return { applied, skipped };
  });

  // ---- the lookbook ----
  app.get('/v1/lab/plans/:id/lookbook.pdf', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const p = await plan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const rows = await pieces(p.id, whichOf(req.query?.which), { withImage: true }); if (!rows.length) return bad(reply, 'There is no concept in this range to put in a lookbook yet', 409);
    const pdf = await lookbookPdf({ plan: p, pieces: rows.map(r => ({ ...pieceView(r), image: r.image || null })), brandName: p.brand?.name || 'Future Basics' });
    return reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="${clip(p.name, 60).replace(/[^\w\- ]+/g, '').trim() || 'range'} lookbook.pdf"`).header('cache-control', 'private, no-store').send(pdf);
  });

  // ---- the poll (staff) ----
  const pollShape = (r, req) => ({ id: r.id, planId: r.plan_id, title: r.title, intro: r.intro, pieces: (r.concept_ids || []).length, createdAt: r.created_at, expiresAt: r.expires_at, closedAt: r.closed_at, opens: r.opens, voters: Number(r.voters || 0), votes: Number(r.votes || 0), url: r.token ? `${origin(req)}/lab/poll/${r.token}` : null });
  const POLL = `select p.*, (select count(distinct voter_key) from lab_poll_votes v where v.poll_id=p.id) voters, (select count(*) from lab_poll_votes v where v.poll_id=p.id) votes from lab_polls p`;
  app.get('/v1/lab/plans/:id/polls', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return;
    return { polls: (await pool.query(`${POLL} where p.plan_id=$1 order by p.created_at desc`, [req.params.id])).rows.map(r => pollShape(r, req)) };
  });
  app.post('/v1/lab/plans/:id/polls', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const p = await plan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const b = req.body || {}, rows = await pieces(p.id, whichOf(b.which)); if (!rows.length) return bad(reply, 'There is no concept in this range to ask about yet', 409);
    const token = randomBytes(24).toString('base64url'), days = Math.min(90, Math.max(1, Math.round(Number(b.days) || 14)));
    const r = (await pool.query(`insert into lab_polls(plan_id, token_hash, title, intro, concept_ids, created_by, expires_at) values($1,$2,$3,$4,$5,$6, now() + make_interval(days => $7)) returning *`,
      [p.id, hashToken(token), clip(b.title, 120) || `${p.name}${p.season ? ' · ' + p.season : ''}`, clip(b.intro, 600) || 'A few pieces we are thinking of making. Tell us, piece by piece, whether you would buy it. It takes a minute, and it decides what gets made.', rows.map(x => x.id), actorOf(req), days])).rows[0];
    return reply.code(201).send({ poll: pollShape({ ...r, token, voters: 0, votes: 0 }, req) });
  });
  app.post('/v1/lab/polls/:pid/close', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply, 'pid')) return;
    const r = (await pool.query(`update lab_polls set closed_at=coalesce(closed_at, now()) where id=$1 returning id`, [req.params.pid])).rows[0]; return r ? { ok: true } : bad(reply, 'Not found', 404);
  });
  app.get('/v1/lab/polls/:pid/results', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply, 'pid')) return;
    const r = (await pool.query(`${POLL} where p.id=$1`, [req.params.pid])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const rows = (await pool.query(`select id, name, category, price_cents, spec, twist, status, (image is not null) has_image from lab_concepts where id = any($1::uuid[])`, [r.concept_ids])).rows.map(pieceView);
    const votes = (await pool.query(`select concept_id, vote, price, note, voter_key, voter_name from lab_poll_votes where poll_id=$1 order by at`, [r.id])).rows;
    return { poll: pollShape(r, req), results: pollResults(rows, votes) };
  });

  // ---- the poll (the link) ----
  const hits = new Map(); const throttle = (k, limit = 200, windowMs = 600_000) => { const now = Date.now(), e = hits.get(k) || { n: 0, t: now }; if (now - e.t > windowMs) { e.n = 0; e.t = now; } e.n++; hits.set(k, e); if (hits.size > 5000) hits.clear(); return e.n <= limit; };
  const live = async (req, reply) => {
    const token = String(req.params.token || ''); if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) { bad(reply, 'This link is not valid', 404); return null; }
    if (!throttle(`poll:${req.ip}`)) { bad(reply, 'Too many requests: try again in a while', 429); return null; }
    const r = (await pool.query(`select p.*, pl.name plan_name, pl.brand from lab_polls p join lab_plans pl on pl.id=p.plan_id where p.token_hash=$1`, [hashToken(token)])).rows[0];
    if (!r) { bad(reply, 'This link is not valid', 404); return null; }
    return r;
  };
  const open = p => !p.closed_at && !(p.expires_at && new Date(p.expires_at) < new Date());
  app.get('/v1/lab/poll/:token', async (req, reply) => {
    const p = await live(req, reply); if (!p) return;
    await pool.query('update lab_polls set opens=opens+1 where id=$1', [p.id]);
    const rows = (await pool.query(`select id, name, category, price_cents, spec, twist, status, (image is not null) has_image from lab_concepts where id = any($1::uuid[]) and status <> 'rejected' order by category, role, created_at`, [p.concept_ids])).rows;
    return { title: p.title, intro: p.intro, brandName: p.brand?.name || 'Future Basics', open: open(p), closedAt: p.closed_at, expiresAt: p.expires_at, pieces: rows.map(pieceView) };
  });
  app.get('/v1/lab/poll/:token/pieces/:id/image', async (req, reply) => {
    const p = await live(req, reply); if (!p) return; if (!UUID.test(req.params.id) || !p.concept_ids.includes(req.params.id)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select image from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!r?.image) return bad(reply, 'No picture', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=600').send(r.image);
  });
  app.post('/v1/lab/poll/:token/votes', async (req, reply) => {
    const p = await live(req, reply); if (!p) return; if (!open(p)) return bad(reply, 'This poll is closed. Thank you for looking.', 410);
    const b = req.body || {}, name = clip(b.name, 60), email = cleanEmail(b.email), votes = cleanVotes(b.votes, p.concept_ids);
    if (!votes.length) return bad(reply, 'Pick yes, maybe or no on at least one piece');
    const key = voterKey({ email, ip: req.ip });
    for (const v of votes) await pool.query(`insert into lab_poll_votes(poll_id, concept_id, voter_key, voter_name, voter_email, vote, price, note) values($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (poll_id, concept_id, voter_key) do update set vote=excluded.vote, price=excluded.price, note=excluded.note, voter_name=excluded.voter_name, voter_email=excluded.voter_email, at=now()`, [p.id, v.id, key, name, email, v.vote, v.price, v.note]);
    const n = Number((await pool.query('select count(distinct voter_key) c from lab_poll_votes where poll_id=$1', [p.id])).rows[0].c);
    if (n === 1 || n % 10 === 0) notifyStaff(`${n} ${n === 1 ? 'person has' : 'people have'} answered the poll "${p.title}"`, `<p>The poll on <strong>${esc(p.plan_name)}</strong> has ${n} ${n === 1 ? 'answer' : 'answers'}. Open the line plan in the Design Lab to see the demand read per piece.</p>`).catch?.(() => {});
    return reply.code(201).send({ ok: true, counted: votes.length });
  });
  log.info?.('design lab range routes ready');
}
