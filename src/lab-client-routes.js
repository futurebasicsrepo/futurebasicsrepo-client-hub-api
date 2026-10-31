// Future Basics' design service: a Design Lab line designed for a client, shared with them in their hub to review.
// Staff (the Design Lab):
//   GET  /v1/lab/clients                         the client rooms a line can be designed for
//   PUT  /v1/lab/plans/:id/client                {clientId|null, brand: {name, statement, audience}, shared} who the line is for, in their words, and
//                                                whether they see it in their hub (sharing it emails them)
//   GET  /v1/admin/clients/:id/design           the work console's view of a room's Design Lab: every line plan on the room (the client's own and the
//                                                ones Future Basics designs for them, shared or not), each with its concepts, the client's say and the
//                                                tech packs they became, and the concepts made outside a plan
// The client (their hub, signed in to their own room):
//   GET  /v1/client/design                       the lines shared with them: each concept's picture, words, price and status, its flats, their say on it
//   GET  /v1/client/design/concepts/:id/image    a concept's picture
//   GET  /v1/client/design/concepts/:id/flats.svg  its spec sheet (front and back flats, placements, measurements), once the flats are drawn
//   POST /v1/client/design/concepts/:id/verdict  {verdict: 'approved'|'changes', note} the client approves a concept or asks for changes
//   POST /v1/client/design/concepts/:id/comments {body} a question or a note on a concept
// A concept from a client's line becomes a tech pack in the client's own room (src/lab-concept-routes.js), where the rest of the journey runs as
// for any of their products: publish, factory, samples.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
import { cleanPin } from './lab-share-routes.js';

export function registerLabClientRoutes(app, d) {
  const { pool, authenticate, adminOnly, sheetSvg = async () => null, notifyStaff = async () => false, notifyClientContact = async () => false, hubUrl = () => '', learn = async () => {}, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);

  app.get('/v1/lab/clients', { preHandler: pre }, async () => ({ clients: (await pool.query(`select id, name from clients where archived_at is null and coalesce(slug,'')<>'future-basics' order by lower(name) limit 500`)).rows }));

  app.put('/v1/lab/plans/:id/client', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const cur = (await pool.query('select id, name, client_id, shared_at from lab_plans where id=$1', [req.params.id])).rows[0]; if (!cur) return bad(reply, 'Not found', 404);
    const b = req.body || {}, clientId = UUID.test(String(b.clientId || '')) ? b.clientId : null;
    const client = clientId ? (await pool.query(`select id, name from clients where id=$1 and archived_at is null`, [clientId])).rows[0] : null;
    if (clientId && !client) return bad(reply, 'That client has no active room');
    const brand = client ? { name: clip(b.brand?.name, 80) || client.name, statement: clip(b.brand?.statement, 600), audience: clip(b.brand?.audience, 300) } : null;
    const shared = Boolean(client && b.shared);
    const r = (await pool.query(`update lab_plans set client_id=$2, brand=$3, shared_at=case when $4 then coalesce(shared_at, now()) else null end, updated_at=now() where id=$1 returning id, client_id, brand, shared_at`, [cur.id, client?.id || null, brand, shared])).rows[0];
    // the first time a line is shared, the client hears about it
    if (shared && !cur.shared_at) {
      await pool.query(`insert into activities(client_id, type, summary, metadata) values($1,'design',$2,$3)`, [client.id, `Future Basics shared the line "${cur.name}" for your review`, { planId: cur.id }]).catch(() => {});
      await notifyClientContact(client.id, { subject: `Your line "${cur.name}" is ready to review`, body: `<p>The concepts for <strong>${esc(cur.name)}</strong> are in your hub under <strong>Design</strong>. Approve the ones you want made, or ask for changes on any of them: each approved piece becomes its tech pack.</p><p><a href="${esc(hubUrl())}/#design">Open your hub</a></p>` });
    }
    return { plan: { id: r.id, clientId: r.client_id, brand: r.brand, sharedAt: r.shared_at } };
  });

  // ---- the work console: what the room has in the Design Lab, as the client's hub shows it and more (unshared lines, drafts) ----
  app.get('/v1/admin/clients/:id/design', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const client = (await pool.query('select id, name from clients where id=$1', [req.params.id])).rows[0]; if (!client) return bad(reply, 'Not found', 404);
    const plans = (await pool.query(`select p.id, p.name, p.season, p.brief, p.status, p.brand, p.shared_at, p.created_at, p.updated_at, u.role creator_role, coalesce(u.name, split_part(u.email,'@',1)) creator,
        (select count(*)::int from lab_plan_lines l where l.plan_id=p.id and l.status<>'dropped') lines
      from lab_plans p left join users u on u.id=p.created_by where p.client_id=$1 order by p.updated_at desc limit 60`, [client.id])).rows;
    const concepts = (await pool.query(`select c.id, c.plan_id, c.name, c.category, c.twist, c.price_cents, c.qty, c.status, c.product_id, c.client_verdict, c.client_note, c.client_at, c.updated_at, (c.image is not null) has_image,
        exists(select 1 from lab_flats f where f.concept_id=c.id) has_flats from lab_concepts c
      where (c.plan_id = any($2::uuid[]) or (c.plan_id is null and c.client_id=$1)) and c.status<>'rejected' order by c.updated_at desc limit 300`, [client.id, plans.map(p => p.id)])).rows;
    const notes = concepts.length ? (await pool.query(`select concept_id, count(*)::int n, max(at) last from lab_concept_comments where concept_id = any($1::uuid[]) and by_client group by 1`, [concepts.map(c => c.id)])).rows : [];
    const shape = c => { const n = notes.find(x => x.concept_id === c.id);
      return { id: c.id, planId: c.plan_id, name: c.name, category: c.category, twist: c.twist, price: c.price_cents == null ? null : c.price_cents / 100, qty: c.qty, status: c.status,
        stage: c.product_id ? 'tech_pack' : c.status === 'approved' ? 'approved' : 'in_design', productId: c.product_id, image: c.has_image ? `/v1/lab/concepts/${c.id}/image` : null, flats: c.has_flats,
        verdict: c.client_verdict, note: c.client_note, verdictAt: c.client_at, clientNotes: n?.n || 0, lastClientNote: n?.last || null, updatedAt: c.updated_at }; };
    return { client, plans: plans.map(p => ({ id: p.id, name: p.name, season: p.season, brief: p.brief, status: p.status, lines: p.lines, updatedAt: p.updated_at, createdAt: p.created_at,
      by: p.creator_role === 'client' ? 'client' : 'future-basics', creator: p.creator || null, brandName: p.brand?.name || '', sharedAt: p.shared_at,
      concepts: concepts.filter(c => c.plan_id === p.id).map(shape) })), loose: concepts.filter(c => !c.plan_id).map(shape) };
  });

  // ---- the client's side ----
  const clientOf = req => (req.auth?.clientId && UUID.test(String(req.auth.clientId)) ? req.auth.clientId : null);
  // a concept the signed-in client may see: on a line designed for them and shared with them, and not rejected
  const theirs = async (req, id) => {
    const cid = clientOf(req); if (!cid || !UUID.test(String(id))) return null;
    return (await pool.query(`select c.id, c.name, c.status, c.plan_id, c.product_id, p.name plan_name from lab_concepts c join lab_plans p on p.id=c.plan_id where c.id=$1 and p.client_id=$2 and p.shared_at is not null and c.status<>'rejected'`, [id, cid])).rows[0] || null;
  };
  const nameOf = async req => { const u = UUID.test(String(req.auth?.sub || '')) ? (await pool.query('select name, email from users where id=$1', [req.auth.sub])).rows[0] : null; return clip(u?.name || String(u?.email || '').split('@')[0] || 'Client', 80); };

  app.get('/v1/client/design', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    const plans = (await pool.query(`select id, name, season, brief, brand, shared_at from lab_plans where client_id=$1 and shared_at is not null order by shared_at desc`, [cid])).rows;
    if (!plans.length) return { plans: [] };
    const concepts = (await pool.query(`select c.id, c.plan_id, c.name, c.category, c.role, c.twist, c.spec->>'description' description, c.price_cents, c.qty, c.status, c.product_id, c.client_verdict, c.client_note, c.client_at, (c.image is not null) has_image,
        exists(select 1 from lab_flats f where f.concept_id=c.id) has_flats from lab_concepts c where c.plan_id = any($1::uuid[]) and c.status<>'rejected' order by c.created_at`, [plans.map(p => p.id)])).rows;
    const comments = concepts.length ? (await pool.query(`select concept_id, name, body, at, by_client from lab_concept_comments where concept_id = any($1::uuid[]) and (by_client or body like 'For the client: %') order by at`, [concepts.map(c => c.id)])).rows : [];
    return { plans: plans.map(p => ({ id: p.id, name: p.name, season: p.season, brief: p.brief, brandName: p.brand?.name || '', sharedAt: p.shared_at,
      concepts: concepts.filter(c => c.plan_id === p.id).map(c => ({ id: c.id, name: c.name, category: c.category, role: c.role, twist: c.twist, description: c.description || '', price: c.price_cents == null ? null : c.price_cents / 100, qty: c.qty,
        stage: c.product_id ? 'tech_pack' : c.status === 'approved' ? 'approved' : 'in_design', productId: c.product_id, image: c.has_image ? `/v1/client/design/concepts/${c.id}/image` : null, flats: c.has_flats ? `/v1/client/design/concepts/${c.id}/flats.svg` : null,
        verdict: c.client_verdict, note: c.client_note, verdictAt: c.client_at,
        comments: comments.filter(m => m.concept_id === c.id).map(m => ({ name: m.by_client ? m.name : 'Future Basics', body: m.body.replace(/^For the client: /, ''), at: m.at, mine: m.by_client })) })) })) };
  });
  app.get('/v1/client/design/concepts/:id/image', { preHandler: authenticate }, async (req, reply) => {
    const c = await theirs(req, req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]; if (!r?.image) return bad(reply, 'No picture yet', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=300').send(r.image);
  });
  app.get('/v1/client/design/concepts/:id/flats.svg', { preHandler: authenticate }, async (req, reply) => {
    const c = await theirs(req, req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const svg = await sheetSvg(c.id); if (!svg) return bad(reply, 'The flats are not drawn yet', 404);
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'private, no-cache').send(svg);
  });
  app.post('/v1/client/design/concepts/:id/verdict', { preHandler: authenticate }, async (req, reply) => {
    const c = await theirs(req, req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const verdict = ['approved', 'changes'].includes(req.body?.verdict) ? req.body.verdict : null, note = clip(req.body?.note, 1000);
    if (!verdict) return bad(reply, 'Approve it or ask for changes');
    if (verdict === 'changes' && note.length < 3) return bad(reply, 'Say what to change');
    if (c.product_id) return bad(reply, 'This piece is already a tech pack: ask for changes on the tech pack itself', 409);
    await pool.query(`update lab_concepts set client_verdict=$2, client_note=$3, client_at=now(), updated_at=now() where id=$1`, [c.id, verdict, note]);
    const who = await nameOf(req);
    await pool.query(`insert into lab_concept_comments(concept_id, user_id, name, body, by_client) values($1,$2,$3,$4,true)`, [c.id, actorOf(req), who, verdict === 'approved' ? `Approved by the client${note ? `: ${note}` : '.'}` : `The client asks for changes: ${note}`]);
    await notifyStaff(`${verdict === 'approved' ? 'Client approved' : 'Client asks for changes'}: ${c.name}`, `<p><strong>${esc(who)}</strong> ${verdict === 'approved' ? 'approved' : 'asked for changes to'} <strong>${esc(c.name)}</strong> in the line "${esc(c.plan_name)}".${note ? `</p><p>${esc(note)}` : ''}</p><p>Open it in the Design Lab to ${verdict === 'approved' ? 'approve it and send it to a tech pack' : 'revise it'}.</p>`).catch?.(() => {});
    Promise.resolve().then(learn).catch(e => log.warn?.({ err: e.message }, 'design lab taste could not be read again'));
    return { ok: true, verdict };
  });
  app.post('/v1/client/design/concepts/:id/comments', { preHandler: authenticate }, async (req, reply) => {
    const c = await theirs(req, req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const body = clip(req.body?.body, 1000); if (body.length < 2) return bad(reply, 'Write something first');
    const who = await nameOf(req), pin = cleanPin(req.body?.pin);
    await pool.query(`insert into lab_concept_comments(concept_id, user_id, name, body, by_client, pin) values($1,$2,$3,$4,true,$5)`, [c.id, actorOf(req), who, body, pin ? JSON.stringify(pin) : null]);
    await notifyStaff(`Client note on ${c.name}`, `<p><strong>${esc(who)}</strong> wrote on <strong>${esc(c.name)}</strong>${pin ? ` (pinned on the ${pin.on})` : ''}: ${esc(body)}</p>`).catch?.(() => {});
    return { ok: true };
  });
  log.info?.('design service routes ready');
}
