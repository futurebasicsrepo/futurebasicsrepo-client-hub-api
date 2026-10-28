// The self-serve Design Lab, as the client hub and the work console see it (the Lab itself is in the lab-*-routes files, gated by src/lab-access.js):
//   The client (their hub):
//     GET  /v1/client/lab                          the offer, or the room's access and its meter (generations used, included, owed, the open invoices)
//     POST /v1/client/lab/checkout                 the Shopify checkout for the fixed fee → {checkoutUrl}; with Shopify off and DEV_BYPASS_AUTH on, straight to active
//     POST /v1/client/lab/landed                   back from the checkout: has the fee been paid?
//     POST /v1/client/lab/invoices/:id/landed      back from an AI invoice checkout: paid?
//     GET  /v1/client/lab/usage                    the last generations, one line each
//     GET  /v1/products/:id/make                   on a tech pack: the requests made to Future Basics, and the factory links sent for quotation with what came back
//     POST /v1/products/:id/make-request           {qty, note} "ask Future Basics to make this": lands on the console's Production attention and emails the team
//     POST /v1/products/:id/quote-links            {label, email} send the published pack to the client's own factory for a quotation (the factory needs no account)
//     DELETE /v1/products/:id/quote-links/:sid     turn a link off
//   Staff (the work console):
//     GET  /v1/admin/clients/:id/lab               the room's access, meter and usage
//     PATCH /v1/admin/clients/:id/lab              {action: 'comp'|'end'|'bill'|'free'|'charge', days?, includedAi?, aiPriceCents?} give access, end it, invoice the unbilled
//                                                  generations now, or turn the room's charges off (free: open, no fee, AI never billed) and back on
//     POST /v1/admin/clients/:id/lab/invite        {email, name?} invite a designer to the room's Design Lab: the address may sign in to the room,
//                                                  and gets the welcome (open it on an iPad, add it to the home screen, sign in with the emailed code)
//     POST /v1/admin/lab/invoices/:id/paid         record an AI invoice as paid by other means
//     GET  /v1/admin/make-requests, PATCH /v1/admin/make-requests/:id {status, reply}
import { randomBytes, createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = v => createHash('sha256').update(String(v)).digest('hex');
const STATUSES = ['requested', 'quoting', 'declined', 'done'];

export function registerLabSelfServeRoutes(app, d) {
  const { pool, authenticate, adminOnly, lab, clientHubUrl = '', workHubUrl = '', notifyStaff = async () => false, notifyClientContact = async () => false, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, replyTo = '', forgetUser = () => {}, log = console } = d;
  const bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const clientOf = req => (req.auth?.role !== 'admin' && UUID.test(String(req.auth?.clientId || '')) ? req.auth.clientId : null);
  const need = (req, reply, k = 'id') => UUID.test(String(req.params[k])) || (bad(reply, 'Not found', 404), false);
  const client = async id => (await pool.query('select id, slug, name, contact_email, contact_name, shopify_customer_id, archived_at, status from clients where id=$1', [id])).rows[0] || null;
  const fail = (reply, e) => bad(reply, e.message, e.status || 500, e.meter ? { meter: e.meter, code: e.code } : {});

  // ---- the client's hub ----
  app.get('/v1/client/lab', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    return { ...(await lab.status(cid)), labUrl: '/lab', preview: req.auth.preview === true };
  });
  app.post('/v1/client/lab/checkout', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    const c = await client(cid); if (!c || c.archived_at) return bad(reply, 'Your room is not active', 404);
    try { return await lab.checkout(c); } catch (e) { return fail(reply, e); }
  });
  app.post('/v1/client/lab/landed', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    try { const paid = await lab.landed(cid); return { paid, ...(await lab.status(cid)) }; } catch (e) { return fail(reply, e); }
  });
  app.post('/v1/client/lab/invoices/:id/landed', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401); if (!need(req, reply)) return;
    try { const paid = await lab.invoiceLanded(cid, req.params.id); if (paid === null) return bad(reply, 'Not found', 404); return { paid, ...(await lab.status(cid)) }; } catch (e) { return fail(reply, e); }
  });
  app.get('/v1/client/lab/usage', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    return { usage: await lab.usage(cid) };
  });

  // ---- making it: the client's own factory, or Future Basics ----
  const ownPack = async (req, reply) => {
    if (!need(req, reply)) return null; const cid = clientOf(req); if (!cid) { bad(reply, 'Sign in to your room', 401); return null; }
    const r = (await pool.query(`select p.id product_id, p.title, p.client_id, tp.id tech_pack_id, tp.version, tp.published_at, c.name client_name from products p left join tech_packs tp on tp.product_id=p.id join clients c on c.id=p.client_id where p.id=$1 and p.client_id=$2`, [req.params.id, cid])).rows[0];
    if (!r) { bad(reply, 'Tech pack not found', 404); return null; } return r;
  };
  const reqShape = r => ({ id: r.id, qty: r.qty, note: r.note, status: r.status, reply: r.reply, createdAt: r.created_at, handledAt: r.handled_at, productId: r.product_id, productTitle: r.product_title || undefined, clientName: r.client_name || undefined, clientId: r.client_id });
  const linkShape = (s, req) => ({ id: s.id, label: s.label, email: s.email, createdAt: s.created_at, expiresAt: s.expires_at, revokedAt: s.revoked_at, lastViewedAt: s.last_viewed_at, viewCount: s.view_count, active: !s.revoked_at && (!s.expires_at || new Date(s.expires_at) > new Date()), ...(s.token ? { url: `${clientHubUrl}/tp/${s.token}` } : {}) });
  const quoteShape = q => ({ id: q.id, shareId: q.share_id, label: q.share_label, company: q.company, contactName: q.contact_name, email: q.email, currency: q.currency, tiers: q.tiers || [], moq: q.moq, sampleCost: q.sample_cost == null ? null : Number(q.sample_cost), sampleDays: q.sample_days, leadDays: q.lead_days, incoterm: q.incoterm, paymentTerms: q.payment_terms, validUntil: q.valid_until, notes: q.notes, updatedAt: q.updated_at });
  async function makeView(r, req) {
    const requests = (await pool.query('select * from make_requests where product_id=$1 order by created_at desc', [r.product_id])).rows.map(reqShape);
    const links = r.tech_pack_id ? (await pool.query(`select * from tech_pack_shares where tech_pack_id=$1 and kind='quote' and created_by is null order by created_at desc`, [r.tech_pack_id])).rows.map(s => linkShape(s, req)) : [];
    const quotes = r.tech_pack_id ? (await pool.query(`select q.*, s.label share_label from factory_quotes q join tech_pack_shares s on s.id=q.share_id where q.tech_pack_id=$1 and s.created_by is null order by q.updated_at desc`, [r.tech_pack_id])).rows.map(quoteShape) : [];
    return { published: Boolean(r.published_at), version: r.version || null, requests, links, quotes };
  }
  app.get('/v1/products/:id/make', { preHandler: authenticate }, async (req, reply) => { const r = await ownPack(req, reply); if (!r) return; return makeView(r, req); });
  app.post('/v1/products/:id/make-request', { preHandler: authenticate }, async (req, reply) => {
    const r = await ownPack(req, reply); if (!r) return; if (req.auth.preview) return bad(reply, 'Client preview is read-only', 403);
    const b = req.body || {}, qty = Number.isFinite(Number(b.qty)) && Number(b.qty) > 0 ? Math.round(Number(b.qty)) : null, note = clip(b.note, 1500);
    if ((await pool.query(`select 1 from make_requests where product_id=$1 and status in ('requested','quoting')`, [r.product_id])).rowCount) return bad(reply, 'Future Basics already has your request for this piece. We will come back to you on it.', 409);
    const row = (await pool.query(`insert into make_requests(client_id, product_id, tech_pack_id, qty, note) values($1,$2,$3,$4,$5) returning *`, [r.client_id, r.product_id, r.tech_pack_id, qty, note])).rows[0];
    await pool.query(`insert into activities(client_id, product_id, actor_id, type, summary, metadata) values($1,$2,$3,'tech-pack',$4,$5)`, [r.client_id, r.product_id, UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null, `${r.client_name} asked Future Basics to make ${r.title}${qty ? ` (${qty} units)` : ''}`, { makeRequestId: row.id }]).catch(() => {});
    await pool.query(`update products set risk_level='attention', updated_at=now() where id=$1`, [r.product_id]).catch(() => {});
    notifyStaff(`Make this: ${r.title} for ${r.client_name}`, `<p><strong>${esc(r.client_name)}</strong> asked Future Basics to make <strong>${esc(r.title)}</strong>${qty ? ` · ${qty} units` : ''}.</p>${note ? `<p>${esc(note)}</p>` : ''}<p>It is on Production attention in the work console.</p><p><a href="${esc(workHubUrl)}/tech-packs/${r.product_id}">Open the tech pack</a></p>`).catch(() => {});
    return reply.code(201).send({ request: reqShape(row) });
  });
  app.post('/v1/products/:id/quote-links', { preHandler: authenticate }, async (req, reply) => {
    const r = await ownPack(req, reply); if (!r) return; if (req.auth.preview) return bad(reply, 'Client preview is read-only', 403);
    if (!r.published_at) return bad(reply, 'Future Basics is reviewing your pack. Once v1 is published you can send it to your factory.', 409);
    const b = req.body || {}, label = clip(b.label, 120), email = clip(b.email, 200).toLowerCase() || null;
    if (!label) return bad(reply, 'Give the factory a name');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(reply, 'That email address does not look right');
    if (Number((await pool.query(`select count(*)::int n from tech_pack_shares where tech_pack_id=$1 and kind='quote' and created_by is null and revoked_at is null`, [r.tech_pack_id])).rows[0].n) >= 12) return bad(reply, 'Twelve factory links are open on this pack already. Turn one off first.', 409);
    const token = randomBytes(24).toString('base64url'), days = Math.min(365, Math.max(7, Math.round(Number(b.expiresDays) || 30)));
    const s = (await pool.query(`insert into tech_pack_shares(tech_pack_id, token_hash, label, email, created_by, expires_at, kind, include_model) values($1,$2,$3,$4,null, now()+make_interval(days=>$5), 'quote', false) returning *`, [r.tech_pack_id, hash(token), label, email, days])).rows[0];
    const url = `${clientHubUrl}/tp/${token}`; let emailed = false;
    if (email && b.sendEmail !== false) {
      try { emailed = await sendHubEmail({ to: email, replyTo: replyTo || undefined, subject: `Request for quotation: ${r.title}`, html: hubEmailShell(`Request for quotation: ${r.title}`, `<p>Hello ${esc(label)},</p><p>${esc(r.client_name)} would like a quotation for <strong>${esc(r.title)}</strong>. Open the tech pack, read it, then use the <strong>Quote</strong> tab to send your prices. It is free and needs no account.</p><p><a href="${esc(url)}">${esc(url)}</a></p><p>This link is for you only and expires in ${days} days.</p>`) }); }
      catch (e) { log.warn?.({ err: e.message, shareId: s.id }, 'client factory link email not sent'); }
    }
    await pool.query(`insert into activities(client_id, product_id, type, summary) values($1,$2,'tech-pack',$3)`, [r.client_id, r.product_id, `${r.client_name} sent v${r.version} to ${label} for quotation`]).catch(() => {});
    return reply.code(201).send({ link: linkShape({ ...s, token }, req), url, emailed });
  });
  app.delete('/v1/products/:id/quote-links/:sid', { preHandler: authenticate }, async (req, reply) => {
    const r = await ownPack(req, reply); if (!r) return; if (!need(req, reply, 'sid')) return;
    const x = await pool.query(`update tech_pack_shares set revoked_at=now() where id=$1 and tech_pack_id=$2 and created_by is null and revoked_at is null`, [req.params.sid, r.tech_pack_id]);
    return x.rowCount ? { ok: true } : bad(reply, 'Not found', 404);
  });

  // ---- the work console ----
  const staff = [authenticate, adminOnly];
  app.get('/v1/admin/clients/:id/lab', { preHandler: staff }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await client(req.params.id); if (!c) return bad(reply, 'Client not found', 404);
    return { ...(await lab.status(c.id)), usage: await lab.usage(c.id, 30) };
  });
  app.patch('/v1/admin/clients/:id/lab', { preHandler: staff }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await client(req.params.id); if (!c) return bad(reply, 'Client not found', 404);
    const b = req.body || {}, by = UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null;
    try {
      if (b.action === 'comp') { await lab.comp(c.id, { by, days: b.days, includedAi: b.includedAi, aiPriceCents: b.aiPriceCents, unpaidCapCents: b.unpaidCapCents }); notifyClientContact(c.id, { subject: 'Your Design Lab is open', body: `<p>Future Basics opened the Design Lab on your room: plan a line, draw concepts, finish them in the studio, measure them as flats and turn them into tech packs.</p><p><a href="${esc(clientHubUrl)}/lab">Open the Design Lab</a></p>` }).catch(() => {}); }
      else if (b.action === 'end') await lab.end(c.id, by);
      else if (b.action === 'bill') { const inv = await lab.billOverage(c.id, { force: true, by }); if (!inv) return bad(reply, 'Nothing is unbilled on this room'); }
      else if (b.action === 'free' || b.action === 'charge') {
        const wasOpen = Boolean(await lab.active(c.id)), changed = await lab.setFree(c.id, b.action === 'free', by);
        if (changed && b.action === 'free' && !wasOpen) notifyClientContact(c.id, { subject: 'Your Design Lab is open', body: '<p>Future Basics opened the Design Lab on your room, free: plan a line, draw concepts, finish them in Design and turn them into tech packs. Open it from your hub.</p>' }).catch(() => {});
      }
      else return bad(reply, 'action must be comp, end, bill, free or charge');
    } catch (e) { return fail(reply, e); }
    return { ...(await lab.status(c.id)), usage: await lab.usage(c.id, 30) };
  });
  // a designer invited from the work console: allowed to sign in to the room (as a teammate added from the hub is), and welcomed with how to
  // start, on an iPad or a computer
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  app.post('/v1/admin/clients/:id/lab/invite', { preHandler: staff }, async (req, reply) => {
    if (!need(req, reply)) return; const c = await client(req.params.id); if (!c) return bad(reply, 'Client not found', 404);
    const email = clip(req.body?.email, 254).toLowerCase(), name = clip(req.body?.name, 80), by = UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null;
    if (!EMAIL.test(email)) return bad(reply, 'That email address does not look right');
    if (email.endsWith('@thefuturebasics.com')) return bad(reply, 'Future Basics already opens every room from the work console');
    const other = (await pool.query(`select 1 from users u join clients k on k.id=u.client_id where lower(u.email)=$1 and u.client_id<>$2 and u.removed_at is null and k.status='active' and k.archived_at is null`, [email, c.id])).rowCount;
    if (other) return bad(reply, 'That address already signs in to another room. One person, one room: use another address, or move them first.', 409);
    const q = await pool.connect(); let user;
    try {
      await q.query('begin');
      await q.query(`update clients set allowed_emails=(select array_agg(distinct e) from unnest(coalesce(allowed_emails,'{}')||array[$2]::text[]) e) where id=$1`, [c.id, email]);
      user = (await q.query(`insert into users(client_id, email, name, role, invited_by, invited_at) values($1,$2,nullif($3,''),'client',$4,now())
        on conflict(email) do update set client_id=excluded.client_id, removed_at=null, invited_by=excluded.invited_by, invited_at=now(), name=coalesce(users.name, excluded.name) returning *`, [c.id, email, name, by])).rows[0];
      await q.query(`insert into activities(client_id, actor_id, type, summary) values($1,$2,'design',$3)`, [c.id, by, `${email} invited to the Design Lab`]);
      await q.query('commit');
    } catch (e) { await q.query('rollback').catch(() => {}); throw e; } finally { q.release(); }
    forgetUser(user.id);
    const open = Boolean(await lab.active(c.id)), url = `${clientHubUrl}/lab`, first = name ? esc(name.split(' ')[0]) : '';
    let emailed = false;
    try {
      emailed = await sendHubEmail({ to: email, replyTo: replyTo || undefined, subject: `Your Design Lab with Future Basics`,
        html: hubEmailShell('Your Design Lab is ready', `<p>${first ? `Hi ${first},` : 'Hello,'}</p><p>Future Basics has set you up in the Design Lab for <strong>${esc(c.name)}</strong>: plan a line, design each piece on its picture and its measured flats, and send it to a tech pack and a factory.</p>
          <p><b>On an iPad</b> (the best way to work, with an Apple Pencil): open <a href="${esc(url)}">${esc(url)}</a> in Safari, tap Share, then Add to Home Screen. Open the Design Lab icon and sign in with this address; a code arrives by email.</p>
          <p><b>On a computer</b>: open the same link and sign in the same way.</p>
          <p>Inside: <b>Design</b> holds the picture and its flats side by side; <b>Simple</b> keeps the essentials and <b>Pro</b> shows every tool; the <b>Checklist</b> says what is left before the tech pack.${open ? '' : ' The Lab opens on your room once Future Basics turns it on; until then you will see the offer.'}</p>
          <p><a href="${esc(url)}" style="display:inline-block;background:#141416;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Open the Design Lab</a></p>`) });
    } catch (e) { log.warn?.({ err: e.message }, 'design lab invite email not sent'); }
    return { ok: true, email, emailed, open };
  });
  app.post('/v1/admin/lab/invoices/:id/paid', { preHandler: staff }, async (req, reply) => {
    if (!need(req, reply)) return; const r = await lab.invoicePaid(req.params.id, { orderId: clip(req.body?.reference, 80) || 'manual' }); if (!r) return bad(reply, 'That invoice is not open', 404);
    return { ok: true, ...(await lab.status(r.client_id)) };
  });
  app.get('/v1/admin/make-requests', { preHandler: staff }, async req => {
    const all = req.query?.all === '1';
    return { requests: (await pool.query(`select m.*, p.title product_title, c.name client_name from make_requests m join products p on p.id=m.product_id join clients c on c.id=m.client_id ${all ? '' : `where m.status in ('requested','quoting')`} order by m.created_at desc limit 200`)).rows.map(reqShape) };
  });
  app.patch('/v1/admin/make-requests/:id', { preHandler: staff }, async (req, reply) => {
    if (!need(req, reply)) return; const b = req.body || {}, status = STATUSES.includes(b.status) ? b.status : null; if (!status) return bad(reply, `status must be one of ${STATUSES.join(', ')}`);
    const r = (await pool.query(`update make_requests set status=$2, reply=coalesce($3, reply), handled_by=$4, handled_at=case when $2 in ('declined','done') then now() else handled_at end where id=$1 returning *`, [req.params.id, status, b.reply === undefined ? null : clip(b.reply, 1000), UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null])).rows[0];
    if (!r) return bad(reply, 'Not found', 404);
    if (status !== 'requested') { await pool.query(`update products set risk_level=case when $2 in ('declined','done') then 'on-track' else risk_level end, updated_at=now() where id=$1`, [r.product_id, status]).catch(() => {});
      const title = (await pool.query('select title from products where id=$1', [r.product_id])).rows[0]?.title || 'your piece';
      notifyClientContact(r.client_id, { subject: `${title}: ${status === 'quoting' ? 'we are pricing it' : status === 'done' ? 'it is in production' : 'about making it'}`, body: `<p>${status === 'quoting' ? `We are pricing <strong>${esc(title)}</strong> with our factories and will come back with a quote.` : status === 'done' ? `<strong>${esc(title)}</strong> is on its way: the order is placed with the factory.` : `We cannot take <strong>${esc(title)}</strong> on right now.`}</p>${r.reply ? `<p>${esc(r.reply)}</p>` : ''}` }).catch(() => {}); }
    return { request: reqShape(r) };
  });
  log.info?.('design lab self-serve routes ready');
}
