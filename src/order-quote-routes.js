// Order quotes: a quote across several of a room's products, sent to the client, tracked as a deal in Sales, paid through a Shopify draft order.
//
//   staff   GET    /v1/admin/clients/:id/quote-builder?requestId=   the room's products (with their price tiers and sizes), what a request names, the room's quotes
//           POST   /v1/admin/clients/:id/order-quotes             { requestId?, projectId?, title?, lines, extras?, notes?, validUntil? } → a draft
//           PUT    /v1/admin/order-quotes/:qid                     the same body; a sent quote goes back to draft until it is sent again
//           POST   /v1/admin/clients/:id/order-quotes/preview      { quoteId?, message?, and the quote's body when it is being edited } → the email as it would be
//                                                                  sent and who it goes to; nothing is saved and nothing is sent
//           POST   /v1/admin/order-quotes/:qid/send                { message? } email the client, put it in their hub, open (or update) the deal in Sales
//           POST   /v1/admin/order-quotes/:qid/payment-link        make the Shopify draft order for an accepted quote (again, if it failed)
//           DELETE /v1/admin/order-quotes/:qid                     a draft only
//   client  GET    /v1/order-quotes                                the room's sent and settled quotes (no costs)
//           POST   /v1/order-quotes/:qid/decision                  { decision: 'accept' | 'changes', note? }
//
// Sales: sending finds the client's contact (or makes one, tied to the room) and its company, and opens a deal at Proposal worth the quote's
// total, on the quote's project; a new version updates the value. Accepting wins the deal; asking for changes logs the note on it.
import { cleanQuote, matchRequest, clientQuote, quoteNumber, sizesWords } from './order-quotes.js';
import { shopifyGraphql, DRAFT_ORDER_CREATE, requireNoUserErrors } from './shopify.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : '');
const usd = c => '$' + (Number(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function registerOrderQuoteRoutes(app, d) {
  const { pool, authenticate, adminOnly, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, emailEscape = s => String(s), notifyRoomStaff = async () => 0, clientHubUrl = '', workHubUrl = '', shopifyReady = () => true, log = console, makeDraftOrder = null, hasRenderingSql = 'false has_rendering', renderingUrl = () => '' } = d;
  const pre = [authenticate, adminOnly];
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const uid = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const one = async id => (UUID.test(String(id || '')) ? (await pool.query('select q.*, c.name client_name from order_quotes q join clients c on c.id=q.client_id where q.id=$1', [id])).rows[0] : null) || null;
  const roomProducts = async cid => (await pool.query(`select p.id, p.title, p.project_id, pr.name project_name, p.shopify_variant_id, p.shopify_image_url, ${hasRenderingSql},
      (select coalesce(jsonb_agg(to_jsonb(t) order by t.min_quantity), '[]'::jsonb) from price_tiers t where t.product_id=p.id) tiers, (select pc.sizes from product_configurations pc where pc.product_id=p.id) sizes
    from products p left join projects pr on pr.id=p.project_id where p.client_id=$1 and (pr.id is null or (pr.archived_at is null and pr.status not in ('archive','archived'))) order by pr.updated_at desc nulls last, p.title`, [cid])).rows;
  const staffView = q => ({ ...clientQuote(q), lines: q.lines || [], costCents: q.cost_cents == null ? null : Number(q.cost_cents), marginPct: q.margin_pct == null ? null : Number(q.margin_pct), requestId: q.request_id, projectId: q.project_id, dealId: q.deal_id,
    clientId: q.client_id, clientName: q.client_name || '', declinedAt: q.declined_at, payError: q.pay_error || '', createdAt: q.created_at, version: q.version });

  // ---- Sales: the client's contact, company and the deal this quote is ----
  async function trackDeal(q, { stage, text, kind = 'system', actorId = null, lostReason = '' }) {
    try {
      const c = (await pool.query('select id, name, contact_email, contact_name, owner_id from clients where id=$1', [q.client_id])).rows[0]; if (!c) return null;
      const reqAuthor = q.request_id ? (await pool.query('select u.email, u.name from requests r join users u on u.id=r.user_id where r.id=$1', [q.request_id])).rows[0] : null;
      const email = String(c.contact_email || reqAuthor?.email || '').toLowerCase().trim();
      let company = (await pool.query('select id from sales_companies where lower(name)=lower($1)', [c.name])).rows[0];
      if (!company) company = (await pool.query('insert into sales_companies(name) values($1) on conflict do nothing returning id', [c.name])).rows[0] || (await pool.query('select id from sales_companies where lower(name)=lower($1)', [c.name])).rows[0];
      let contact = email ? (await pool.query('select id from sales_contacts where lower(email)=$1', [email])).rows[0] : (await pool.query('select id from sales_contacts where client_id=$1 order by created_at limit 1', [c.id])).rows[0];
      if (!contact) contact = (await pool.query(`insert into sales_contacts(name,email,company_id,source,client_id,tags) values($1,$2,$3,'quote',$4,'{client}') on conflict (lower(email)) where email is not null do nothing returning id`,
        [String(c.contact_name || reqAuthor?.name || c.name).slice(0, 120), email || null, company?.id || null, c.id])).rows[0] || (email ? (await pool.query('select id from sales_contacts where lower(email)=$1', [email])).rows[0] : null);
      if (!contact) return null;
      await pool.query('update sales_contacts set client_id=coalesce(client_id,$2), company_id=coalesce(company_id,$3), last_activity_at=now() where id=$1', [contact.id, c.id, company?.id || null]);
      const title = `${c.name} · ${q.number}${q.title ? ' · ' + q.title : ''}`.slice(0, 140);
      let dealId = q.deal_id;
      if (dealId && !(await pool.query('select 1 from sales_deals where id=$1', [dealId])).rowCount) dealId = null;
      if (!dealId) dealId = (await pool.query(`insert into sales_deals(contact_id,company_id,title,stage,value_cents,source,project_id,owner_id,expected_close) values($1,$2,$3,$4,$5,'quote',$6,$7,$8) returning id`,
        [contact.id, company?.id || null, title, stage, q.total_cents, q.project_id, c.owner_id || actorId, day(q.valid_until) || null])).rows[0].id;
      else await pool.query(`update sales_deals set title=$2, stage=$3, value_cents=$4, project_id=coalesce($5,project_id), expected_close=coalesce($6,expected_close), closed_at=case when $3 in ('won','lost') then now() else null end, lost_reason=$7, last_activity_at=now(), updated_at=now() where id=$1`,
        [dealId, title, stage, q.total_cents, q.project_id, day(q.valid_until) || null, lostReason]);
      await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,$3,$4,$5::jsonb,$6)`, [contact.id, dealId, kind, String(text).slice(0, 4000), JSON.stringify({ orderQuoteId: q.id, number: q.number, totalCents: Number(q.total_cents) }), actorId]);
      if (dealId !== q.deal_id) await pool.query('update order_quotes set deal_id=$2 where id=$1', [q.id, dealId]);
      return dealId;
    } catch (e) { log.warn?.({ err: e.message, quote: q.id }, 'quote deal not tracked'); return null; }
  }

  // ---- the payment link: a Shopify draft order with every line (a product's own variant where it has one), shown in the client's invoices ----
  async function paymentLink(q) {
    try {
      if (!shopifyReady()) throw new Error('Shopify is not set up, so make the payment link in Money');
      const c = (await pool.query('select name, contact_email, shopify_customer_id from clients where id=$1', [q.client_id])).rows[0];
      const variants = new Map((await pool.query('select id, shopify_variant_id from products where id = any($1)', [(q.lines || []).map(l => l.productId)])).rows.map(r => [r.id, r.shopify_variant_id]));
      const money = v => ({ amount: (Number(v) / 100).toFixed(2), currencyCode: q.currency || 'USD' });
      const lineItems = (q.lines || []).map(l => { const v = variants.get(l.productId), title = `${l.title}${l.sizes && Object.keys(l.sizes).length ? ' (' + sizesWords(l.sizes) + ')' : ''}`;
        return v ? { variantId: v, quantity: l.quantity, priceOverride: money(l.unitCents) } : { title, quantity: l.quantity, requiresShipping: true, originalUnitPriceWithCurrency: money(l.unitCents) }; })
        .concat((q.extras || []).map(x => ({ title: x.label, quantity: 1, requiresShipping: false, originalUnitPriceWithCurrency: money(x.cents) })));
      const input = { lineItems, email: c?.contact_email || undefined, customerId: c?.shopify_customer_id || undefined, note: `Future Basics quote ${q.number}`, tags: ['future-basics-client-hub', 'order-quote', `client-${String(c?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`], visibleToCustomer: true };
      const draft = makeDraftOrder ? await makeDraftOrder(input) : requireNoUserErrors((await shopifyGraphql(DRAFT_ORDER_CREATE, { input })).draftOrderCreate).draftOrder;
      await pool.query(`update order_quotes set shopify_draft_order_id=$2, shopify_draft_order_name=$3, pay_url=$4, pay_error=null, updated_at=now() where id=$1`, [q.id, draft.id, draft.name, draft.invoiceUrl]);
      await pool.query(`insert into invoices(client_id,project_id,number,amount_cents,currency,status,external_url,kind,shopify_draft_order_id,product_ids) values($1,$2,$3,$4,$5,'due',$6,'invoice',$7,$8)
        on conflict(client_id,number) do update set amount_cents=excluded.amount_cents,status='due',external_url=excluded.external_url,shopify_draft_order_id=excluded.shopify_draft_order_id`,
        [q.client_id, q.project_id, draft.name, q.total_cents, q.currency || 'USD', draft.invoiceUrl, draft.id, (q.lines || []).map(l => l.productId)]);
      return { ok: true, url: draft.invoiceUrl, name: draft.name };
    } catch (e) { await pool.query('update order_quotes set pay_error=$2 where id=$1', [q.id, String(e.message || e).slice(0, 300)]).catch(() => {}); log.warn?.({ err: e.message, quote: q.id }, 'quote payment link not made'); return { ok: false, error: e.message }; }
  }

  const linesHtml = q => `<table style="width:100%;border-collapse:collapse;font-size:14px">${(q.lines || []).map(l => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>${emailEscape(l.title)}</strong>${l.sizes && Object.keys(l.sizes).length ? `<br><span style="color:#717177">${emailEscape(sizesWords(l.sizes))}</span>` : ''}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${l.quantity} × ${usd(l.unitCents)}</td><td style="padding:6px 0 6px 12px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${usd(l.totalCents)}</td></tr>`).join('')}${(q.extras || []).map(x => `<tr><td colspan="2" style="padding:6px 0;border-bottom:1px solid #eee">${emailEscape(x.label)}</td><td style="padding:6px 0 6px 12px;border-bottom:1px solid #eee;text-align:right">${usd(x.cents)}</td></tr>`).join('')}<tr><td colspan="2" style="padding:10px 0"><strong>Total</strong></td><td style="padding:10px 0 10px 12px;text-align:right"><strong>${usd(q.total_cents)}</strong></td></tr></table>`;

  // ---- staff ----
  app.get('/v1/admin/clients/:id/quote-builder', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const products = (await roomProducts(req.params.id)).map(p => ({ id: p.id, title: p.title, projectId: p.project_id, projectName: p.project_name || 'No project', image: p.shopify_image_url || (p.has_rendering ? renderingUrl(p.id) : ''), tiers: p.tiers || [], sizes: p.sizes || [] }));
    const request = UUID.test(String(req.query?.requestId || '')) ? (await pool.query('select id, title, details, project_id, product_id from requests where id=$1 and client_id=$2', [req.query.requestId, req.params.id])).rows[0] : null;
    const quotes = (await pool.query('select q.*, c.name client_name from order_quotes q join clients c on c.id=q.client_id where q.client_id=$1 order by q.created_at desc', [req.params.id])).rows.map(staffView);
    return { products, request: request ? { id: request.id, title: request.title, details: request.details, projectId: request.project_id } : null, suggestions: request ? matchRequest(`${request.title}\n${request.details}`, products) : [], quotes };
  });
  async function saveQuote(req, reply, existing) {
    const cid = existing?.client_id || req.params.id; if (!UUID.test(String(cid))) return bad(reply, 'Client not found', 404);
    const products = await roomProducts(cid), c = cleanQuote(req.body || {}, products); if (c.error) return bad(reply, c.error);
    const b = req.body || {}, requestId = UUID.test(String(b.requestId || '')) && (await pool.query('select 1 from requests where id=$1 and client_id=$2', [b.requestId, cid])).rowCount ? b.requestId : existing?.request_id || null;
    const projectId = UUID.test(String(b.projectId || '')) ? b.projectId : existing?.project_id || products.find(p => p.id === c.value.lines[0]?.productId)?.project_id || null;
    const title = String(b.title || '').trim().slice(0, 120) || existing?.title || null;
    if (existing) {
      const row = (await pool.query(`update order_quotes set title=$2, lines=$3, extras=$4, subtotal_cents=$5, total_cents=$6, cost_cents=$7, margin_pct=$8, notes=$9, valid_until=$10, project_id=$11, request_id=$12,
          status='draft', version=version+case when status='draft' then 0 else 1 end, updated_at=now() where id=$1 returning *`,
        [existing.id, title, JSON.stringify(c.value.lines), JSON.stringify(c.value.extras), c.value.subtotalCents, c.value.totalCents, c.value.costCents, c.value.marginPct, c.value.notes, c.value.validUntil, projectId, requestId])).rows[0];
      return { quote: staffView({ ...row, client_name: existing.client_name }) };
    }
    const n = Number((await pool.query(`select count(*)::int n from order_quotes where extract(year from created_at)=extract(year from now())`)).rows[0].n) + 1;
    let row;
    for (let k = 0; k < 5 && !row; k++) row = (await pool.query(`insert into order_quotes(client_id, project_id, request_id, number, title, lines, extras, subtotal_cents, total_cents, cost_cents, margin_pct, notes, valid_until, created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (number) do nothing returning *`,
      [cid, projectId, requestId, quoteNumber(n + k), title, JSON.stringify(c.value.lines), JSON.stringify(c.value.extras), c.value.subtotalCents, c.value.totalCents, c.value.costCents, c.value.marginPct, c.value.notes, c.value.validUntil, uid(req)])).rows[0];
    if (!row) return bad(reply, 'Could not number the quote. Try again.', 409);
    if (requestId) await pool.query(`update requests set status='in-progress' where id=$1 and status='submitted'`, [requestId]).catch(() => {});
    return reply.code(201).send({ quote: staffView(row) });
  }
  // ---- the email a quote is sent as, and who gets it: one place, so what staff are shown before sending is what the client receives ----
  const quoteEmail = (q, message = '') => { const msg = String(message || '').trim().slice(0, 2000);
    return { subject: `Your quote ${q.number} from Future Basics: ${usd(q.total_cents)}`, html: hubEmailShell(`Your quote ${q.number}`,
      `<p>Hi,</p>${msg ? `<p style="white-space:pre-wrap">${emailEscape(msg)}</p>` : `<p>Here is the quote you asked for.</p>`}${linesHtml(q)}${q.valid_until ? `<p style="color:#717177">Valid until ${emailEscape(day(q.valid_until))}.</p>` : ''}${q.notes ? `<p style="white-space:pre-wrap">${emailEscape(q.notes)}</p>` : ''}<p><a href="${clientHubUrl}/#waiting" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#111;color:#fff;text-decoration:none">Review and accept in your hub</a></p><p style="font-size:12px;color:#717177">Accept it and we send the payment link straight away.</p>`) }; };
  const quoteRecipients = async q => { const c = (await pool.query('select contact_email from clients where id=$1', [q.client_id])).rows[0];
    const reqAuthor = q.request_id ? (await pool.query('select u.email from requests r join users u on u.id=r.user_id where r.id=$1', [q.request_id])).rows[0] : null;
    return [...new Set([c?.contact_email, reqAuthor?.email].filter(Boolean).map(e => e.toLowerCase()))]; };

  // The quote as the client would get it, before it goes: a saved quote by its id, or the one being edited by its body. Nothing is written.
  app.post('/v1/admin/clients/:id/order-quotes/preview', { preHandler: pre }, async (req, reply) => {
    const cid = req.params.id; if (!UUID.test(String(cid))) return bad(reply, 'Client not found', 404);
    const b = req.body && typeof req.body === 'object' ? req.body : {}, existing = b.quoteId ? await one(b.quoteId) : null;
    if (b.quoteId && (!existing || existing.client_id !== cid)) return bad(reply, 'Quote not found', 404);
    let q = existing;
    if (Array.isArray(b.lines)) {
      const c = cleanQuote(b, await roomProducts(cid)); if (c.error) return bad(reply, c.error);
      const requestId = UUID.test(String(b.requestId || '')) && (await pool.query('select 1 from requests where id=$1 and client_id=$2', [b.requestId, cid])).rowCount ? b.requestId : existing?.request_id || null;
      const number = existing?.number || quoteNumber(Number((await pool.query(`select count(*)::int n from order_quotes where extract(year from created_at)=extract(year from now())`)).rows[0].n) + 1);
      q = { id: existing?.id || null, client_id: cid, request_id: requestId, number, status: 'draft', title: String(b.title || '').trim().slice(0, 120) || existing?.title || null, lines: c.value.lines, extras: c.value.extras,
        total_cents: c.value.totalCents, notes: c.value.notes, valid_until: c.value.validUntil, currency: existing?.currency || 'USD' };
    }
    if (!q) return bad(reply, 'Nothing to preview yet: pick a product first');
    return { ...quoteEmail(q, b.message), to: await quoteRecipients(q), number: q.number, saved: Boolean(existing) && !Array.isArray(b.lines), quote: clientQuote(q) };
  });
  app.post('/v1/admin/clients/:id/order-quotes', { preHandler: pre }, (req, reply) => saveQuote(req, reply, null));
  app.put('/v1/admin/order-quotes/:qid', { preHandler: pre }, async (req, reply) => {
    const q = await one(req.params.qid); if (!q) return bad(reply, 'Quote not found', 404);
    if (['accepted'].includes(q.status)) return bad(reply, 'This quote is accepted. Make a new one for any change.', 409);
    return saveQuote(req, reply, q);
  });
  app.delete('/v1/admin/order-quotes/:qid', { preHandler: pre }, async (req, reply) => {
    const q = await one(req.params.qid); if (!q) return bad(reply, 'Quote not found', 404); if (q.status !== 'draft' || q.sent_at) return bad(reply, 'Only a quote that was never sent can be deleted', 409);
    await pool.query('delete from order_quotes where id=$1', [q.id]); return { ok: true };
  });
  app.post('/v1/admin/order-quotes/:qid/send', { preHandler: pre }, async (req, reply) => {
    let q = await one(req.params.qid); if (!q) return bad(reply, 'Quote not found', 404); if (q.status === 'accepted') return bad(reply, 'This quote is already accepted', 409);
    q = (await pool.query(`update order_quotes set status='sent', sent_at=now(), declined_at=null, reply=null, updated_at=now() where id=$1 returning *`, [q.id])).rows[0];
    const to = await quoteRecipients(q), mail = quoteEmail(q, req.body?.message);
    let emailed = 0;
    for (const addr of to) { try { if (await sendHubEmail({ to: addr, ...mail })) emailed++; } catch (e) { log.warn?.({ err: e.message }, 'quote email not sent'); } }
    await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'order-quote',$2,'order-quote',$3)`, [q.client_id, `Quote ${q.number}: ${usd(q.total_cents)}`, q.id]).catch(() => {});
    const dealId = await trackDeal(q, { stage: 'proposal', kind: 'email_out', text: `Sent quote ${q.number}${q.version > 1 ? ` (version ${q.version})` : ''}: ${usd(q.total_cents)} · ${(q.lines || []).map(l => `${l.quantity} × ${l.title}`).join(', ')}`, actorId: uid(req) });
    return { quote: staffView({ ...(await one(q.id)) }), emailed, dealId };
  });
  app.post('/v1/admin/order-quotes/:qid/payment-link', { preHandler: pre }, async (req, reply) => {
    const q = await one(req.params.qid); if (!q) return bad(reply, 'Quote not found', 404); if (q.status !== 'accepted') return bad(reply, 'A payment link is made once the client accepts', 409);
    if (q.pay_url) return { quote: staffView(q) };
    const r = await paymentLink(q); if (!r.ok) return bad(reply, r.error, 502);
    return { quote: staffView(await one(q.id)) };
  });

  // ---- client ----
  app.get('/v1/order-quotes', { preHandler: authenticate }, async (req, reply) => {
    const cid = req.auth?.clientId; if (!cid) return bad(reply, 'Sign in to your room', 403);
    return { quotes: (await pool.query(`select * from order_quotes where client_id=$1 and status in ('sent','accepted','changes') order by coalesce(sent_at, created_at) desc`, [cid])).rows.map(clientQuote) };
  });
  app.post('/v1/order-quotes/:qid/decision', { preHandler: authenticate }, async (req, reply) => {
    if (req.auth?.preview) return bad(reply, 'This is a preview of the room: only the client can answer', 403);
    const q = await one(req.params.qid); if (!q || q.client_id !== req.auth?.clientId) return bad(reply, 'Quote not found', 404);
    if (q.status !== 'sent') return bad(reply, q.status === 'accepted' ? 'You already accepted this quote' : 'This quote is being revised. Future Basics will send the new one.', 409);
    const decision = req.body?.decision, note = String(req.body?.note || '').trim().slice(0, 2000);
    const who = (await pool.query(`select coalesce(nullif(name,''), email) n from users where id=$1`, [req.auth.sub])).rows[0]?.n || 'the client';
    if (decision === 'accept') {
      const row = (await pool.query(`update order_quotes set status='accepted', accepted_at=now(), accepted_by=$2, reply=$3, updated_at=now() where id=$1 and status='sent' returning *`, [q.id, UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null, note || null])).rows[0];
      if (!row) return bad(reply, 'This quote changed. Reload and try again.', 409);
      const pay = await paymentLink({ ...row, client_name: q.client_name });
      if (row.request_id) await pool.query(`update requests set status='done' where id=$1`, [row.request_id]).catch(() => {});
      await trackDeal(row, { stage: 'won', kind: 'stage', text: `${who} accepted quote ${row.number}: ${usd(row.total_cents)}${note ? ` · “${note}”` : ''}` });
      notifyRoomStaff(row.client_id, { subject: `${q.client_name} accepted quote ${row.number}: ${usd(row.total_cents)}`, type: 'order-quote-accepted', title: `Quote ${row.number} accepted`, entityType: 'order-quote', entityId: row.id,
        body: `<p><strong>${emailEscape(who)}</strong> at <strong>${emailEscape(q.client_name)}</strong> accepted quote <strong>${emailEscape(row.number)}</strong>.</p>${linesHtml(row)}${note ? `<p style="white-space:pre-wrap">“${emailEscape(note)}”</p>` : ''}<p>${pay.ok ? `The payment link is made (Shopify ${emailEscape(pay.name)}) and is in their hub.` : `<strong>The payment link was not made:</strong> ${emailEscape(pay.error)}. Make it from the quote in the room.`}</p>`,
        link: `${workHubUrl}/clients/${row.client_id}#invoices` });
      return { quote: clientQuote(await one(row.id)), paymentLink: pay.ok ? pay.url : null };
    }
    if (decision === 'changes') {
      if (!note) return bad(reply, 'Say what should change');
      const row = (await pool.query(`update order_quotes set status='changes', reply=$2, declined_at=now(), updated_at=now() where id=$1 and status='sent' returning *`, [q.id, note])).rows[0];
      if (!row) return bad(reply, 'This quote changed. Reload and try again.', 409);
      await trackDeal(row, { stage: 'proposal', kind: 'email_in', text: `${who} asked for changes to quote ${row.number}: “${note}”` });
      notifyRoomStaff(row.client_id, { subject: `${q.client_name} asked for changes to quote ${row.number}`, type: 'order-quote-changes', title: `Changes asked on quote ${row.number}`, entityType: 'order-quote', entityId: row.id,
        body: `<p><strong>${emailEscape(who)}</strong> at <strong>${emailEscape(q.client_name)}</strong> asked for changes to quote <strong>${emailEscape(row.number)}</strong> (${usd(row.total_cents)}):</p><p style="white-space:pre-wrap">“${emailEscape(note)}”</p>`,
        link: `${workHubUrl}/clients/${row.client_id}#invoices` });
      return { quote: clientQuote(row) };
    }
    return bad(reply, 'Accept the quote, or say what should change');
  });
}
