// The self-serve Design Lab: a client's room opens the Lab (the studio, the flats, the libraries and tech packs) for a period at a fixed price,
// with a handful of AI generations included; generations past those are metered and billed in rounds. Staff open everything as before.
//   gate            the preHandler every Lab route runs after authenticate: staff pass; a client passes when their room's access is live,
//                   and from then on req.lab.clientId scopes every query to their own plans, concepts, graphics and fonts
//   charge          what a route calls before an AI generation: refuses (402) when the room owes more than the cap, else records the use
//   checkout        the Shopify draft order for the fixed fee (or, with Shopify off and DEV_BYPASS_AUTH on, straight to active)
//   billOverage     generations past the included ones, as a Shopify invoice once they add up to the billing round
//   fromOrder       the payment sync hands every paid Shopify order here: the fee and the AI invoices are recognised by their tags
// Prices come from the environment (DESIGN_LAB_*); each access row keeps the numbers it was sold at, so a price change never moves a live room.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : d; };
// what each kind of generation counts for: a picture is one; a walk (video) and a 3D model cost many times a picture
export const UNITS = { concept: 1, redraw: 1, studio: 1, graphic: 1, sample: 1, view: 1, flat: 1, motif: 1, walk: 4, tryon: 3, last: 3 };

export function pricingFrom(env = process.env) {
  return {
    enabled: String(env.DESIGN_LAB_SELF_SERVE || 'on').toLowerCase() !== 'off',
    feeCents: num(env.DESIGN_LAB_PRICE_CENTS, 49900), days: Math.max(1, num(env.DESIGN_LAB_DAYS, 90)), includedAi: num(env.DESIGN_LAB_INCLUDED_AI, 40),
    aiPriceCents: num(env.DESIGN_LAB_AI_PRICE_CENTS, 250), billAtCents: num(env.DESIGN_LAB_AI_BILL_AT_CENTS, 2500), unpaidCapCents: num(env.DESIGN_LAB_AI_UNPAID_CAP_CENTS, 15000), currency: 'USD'
  };
}
// the meter for one access period: what was used, what was included, what is owed, and whether the room is past the cap
export function meterOf({ access, usedUnits = 0, invoices = [] }) {
  const included = Number(access?.included_ai ?? 0), price = Number(access?.ai_price_cents ?? 0), used = Number(usedUnits) || 0;
  const overUnits = Math.max(0, used - included), billedUnits = invoices.reduce((s, i) => s + Number(i.units || 0), 0), paidCents = invoices.filter(i => i.paid_at).reduce((s, i) => s + Number(i.amount_cents || 0), 0);
  const billedCents = invoices.reduce((s, i) => s + Number(i.amount_cents || 0), 0), unbilledUnits = Math.max(0, overUnits - billedUnits), unbilledCents = unbilledUnits * price, unpaidCents = billedCents - paidCents;
  const cap = Number(access?.unpaid_cap_cents ?? 0) || 0, owedCents = unbilledCents + unpaidCents;
  return { used, included, left: Math.max(0, included - used), overUnits, aiPriceCents: price, overCents: overUnits * price, billedUnits, unbilledUnits, unbilledCents, unpaidCents, owedCents, capCents: cap, blocked: cap > 0 && owedCents >= cap };
}

export function createLabAccess(d) {
  const { pool, env = process.env, log = console, shopify = {}, clientHubUrl = '', recordPayment = async () => ({}), onActivate = async () => {}, notifyClient = async () => false } = d;
  const pricing = () => pricingFrom(env);
  const row = r => (r ? { id: r.id, status: r.status, source: r.source, feeCents: r.fee_cents, days: r.days, includedAi: r.included_ai, aiPriceCents: r.ai_price_cents, unpaidCapCents: r.unpaid_cap_cents, startsAt: r.starts_at, endsAt: r.ends_at, paidAt: r.paid_at, endedAt: r.ended_at, checkoutUrl: r.pay_invoice_url || null, free: Boolean(r.free) } : null);
  const paidActive = async clientId => (UUID.test(String(clientId || '')) ? (await pool.query(`select * from lab_access where client_id=$1 and status='active' and (ends_at is null or ends_at > now()) order by ends_at desc nulls first limit 1`, [clientId])).rows[0] || null : null);
  // charges off on a room (clients.lab_free, the work console's switch, like free tech pack access): the Lab is open with no fee and no end,
  // and AI generations are counted but never billed or paused. A paid period still running keeps its row; it simply stops costing anything.
  const isFree = async clientId => UUID.test(String(clientId || '')) && (await pool.query('select lab_free from clients where id=$1', [clientId])).rows[0]?.lab_free === true;
  const FREE = clientId => ({ id: null, client_id: clientId, status: 'active', source: 'free', fee_cents: 0, days: null, included_ai: 0, ai_price_cents: 0, unpaid_cap_cents: 0, starts_at: null, ends_at: null, paid_at: null, ended_at: null, free: true });
  const active = async clientId => { const a = await paidActive(clientId); if (await isFree(clientId)) return a ? { ...a, free: true } : FREE(clientId); return a; };
  const pending = async clientId => (await pool.query(`select * from lab_access where client_id=$1 and status='pending' order by created_at desc limit 1`, [clientId])).rows[0] || null;
  const latest = async clientId => (await pool.query(`select * from lab_access where client_id=$1 order by (status='active') desc, created_at desc limit 1`, [clientId])).rows[0] || null;

  // ---- the gate and the scope ----
  // what a client's room may not touch: the research side (brands, the watchlist, the market), the Future Basics taste and brand code,
  // the client assignment of a plan, and the list of clients. (Their own materials and techniques they add and edit; ours they read.)
  const STAFF_ONLY = [
    [/^\/v1\/lab\/(brands|brand-code|scan|scans|items|trends|clients|taste)(\/|$)/, null],
    [/^\/v1\/lab\/plans\/[^/]+\/client$/, null]
  ];
  // which table owns the :id in the url, so one check in the gate keeps every loader behind it to the room's own rows
  const OWNER = [[/^\/v1\/lab\/concepts\/([^/]+)/, 'lab_concepts'], [/^\/v1\/lab\/plans\/([^/]+)/, 'lab_plans'], [/^\/v1\/lab\/(?:art|library\/graphics)\/([^/]+)/, 'lab_art'], [/^\/v1\/lab\/fonts\/([^/]+)/, 'lab_fonts'], [/^\/v1\/lab\/decor\/quotes\/([^/]+)/, 'lab_decor_quotes'], [/^\/v1\/lab\/polls\/([^/]+)/, 'lab_polls'],
    [/^\/v1\/lab\/materials\/([^/]+)/, 'lab_materials'], [/^\/v1\/lab\/library\/techniques\/([^/]+)/, 'lab_techniques'], [/^\/v1\/lab\/library\/technique-photos\/([^/]+)/, 'lab_technique_photos']];
  // whose row it is: a room reads and changes only its own rows. The one exception is the built-in starter set of materials and techniques
  // (screen print, embroidery, the base fabrics) that the flats and costing need: a room reads and uses those, never changes them.
  // Nothing else of Future Basics' reaches a room: not our graphics, fonts, or the materials and techniques we add.
  async function owns(cid, table, id, method = 'GET') {
    if (!UUID.test(String(id || ''))) return true; // not a uuid: the route's own 404 answers
    const read = method === 'GET' || method === 'HEAD';
    const q = table === 'lab_polls' ? `select 1 from lab_polls x join lab_plans p on p.id=x.plan_id where x.id=$1 and p.client_id=$2`
      : table === 'lab_technique_photos' ? `select 1 from lab_technique_photos x join lab_techniques t on t.id=x.technique_id where x.id=$1 and (t.client_id=$2 or (t.client_id is null and t.builtin))`
      : ['lab_materials', 'lab_techniques'].includes(table) ? `select 1 from ${table} where id=$1 and (client_id=$2${read ? ' or (client_id is null and builtin)' : ''})`
      : `select 1 from ${table} where id=$1 and client_id=$2`;
    return (await pool.query(q, [id, cid])).rowCount > 0;
  }
  async function gate(req, reply) {
    if (req.auth?.role === 'admin') { req.lab = { admin: true, clientId: null, access: null }; return; }
    const cid = req.auth?.clientId, a = await active(cid);
    if (!a) return reply.code(403).send({ error: 'The Design Lab is not open on your room yet. Open it from your hub.', code: 'LAB_LOCKED', pricing: pricing() });
    const path = String(req.url || '').split('?')[0], method = String(req.method || 'GET').toUpperCase();
    for (const [re, when] of STAFF_ONLY) if (re.test(path) && (when !== 'write' || method !== 'GET')) return reply.code(403).send({ error: 'That part of the Lab is Future Basics only', code: 'LAB_STAFF_ONLY' });
    if (req.auth.preview && method !== 'GET') return reply.code(403).send({ error: 'Client preview is read-only', code: 'PREVIEW' });
    for (const [re, table] of OWNER) { const m = re.exec(path); if (m) { if (!(await owns(cid, table, m[1], method))) return reply.code(404).send({ error: 'Not found' }); break; } }
    req.lab = { admin: false, clientId: cid, access: a };
  }
  // a row id from a request body: a client's room may use only its own (null when it is not theirs)
  async function ownId(req, table, id) { const cid = scope(req); if (!UUID.test(String(id || ''))) return null; if (!cid) return id; return (await owns(cid, table, id, 'GET')) ? id : null; } // a row a room may use: its own, or a built-in starter row
  const scope = req => (req?.lab && !req.lab.admin && UUID.test(String(req.lab.clientId || '')) ? req.lab.clientId : null);

  // ---- the meter ----
  async function meter(clientId, access = null) {
    const a = access || await active(clientId); if (!a) return null;
    const used = Number((await pool.query(`select coalesce(sum(units),0)::int n from lab_ai_usage where client_id=$1 and access_id is not distinct from $2`, [clientId, a.id])).rows[0].n);
    const invoices = a.id ? (await pool.query(`select * from lab_ai_invoices where client_id=$1 and access_id=$2 order by created_at`, [clientId, a.id])).rows : [];
    const m = meterOf({ access: a, usedUnits: used, invoices });
    // free: what is already invoiced stays owed; nothing new is billed and nothing is paused
    const f = a.free ? { free: true, overUnits: 0, overCents: 0, unbilledUnits: 0, unbilledCents: 0, owedCents: m.unpaidCents, blocked: false } : { free: false };
    return { ...m, ...f, invoices: invoices.map(i => ({ id: i.id, units: i.units, amountCents: i.amount_cents, url: i.invoice_url || null, paidAt: i.paid_at, createdAt: i.created_at })) };
  }
  // before an AI generation: staff always may; a client may while the room owes less than the cap. Records the use when allowed.
  async function charge(req, { kind = 'studio', units = null, conceptId = null } = {}) {
    const n = Math.max(1, Math.round(Number(units ?? UNITS[kind] ?? 1))), who = UUID.test(String(req?.auth?.sub || '')) ? req.auth.sub : null, cid = scope(req);
    if (!cid) { await pool.query(`insert into lab_ai_usage(client_id, access_id, user_id, kind, units, concept_id) values(null, null, $1, $2, $3, $4)`, [who, kind, n, UUID.test(String(conceptId || '')) ? conceptId : null]).catch(() => {}); return null; }
    const a = req.lab.access, m = await meter(cid, a);
    if (a.free) { await pool.query(`insert into lab_ai_usage(client_id, access_id, user_id, kind, units, concept_id) values($1, $2, $3, $4, $5, $6)`, [cid, a.id, who, kind, n, UUID.test(String(conceptId || '')) ? conceptId : null]); return { ...m, used: m.used + n }; } // charges off: counted, never billed
    if (m.blocked) throw Object.assign(new Error(`Your room owes $${(m.owedCents / 100).toFixed(2)} for AI generations past the ${m.included} included. Pay the open invoice in your hub to keep going.`), { status: 402, code: 'LAB_AI_CAP', meter: m });
    await pool.query(`insert into lab_ai_usage(client_id, access_id, user_id, kind, units, concept_id) values($1, $2, $3, $4, $5, $6)`, [cid, a.id, who, kind, n, UUID.test(String(conceptId || '')) ? conceptId : null]);
    const after = { ...m, used: m.used + n }; // bill a round in the background once the unbilled part adds up
    if ((after.used - after.included - after.billedUnits) * after.aiPriceCents >= pricing().billAtCents) setImmediate(() => billOverage(cid).catch(e => log.warn?.({ err: e.message, clientId: cid }, 'design lab overage not billed')));
    return after;
  }

  // ---- buying access ----
  const tag = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  async function draftOrder({ client, title, cents, tags, note }) {
    const input = { lineItems: [{ title: title.slice(0, 255), quantity: 1, requiresShipping: false, taxable: false, originalUnitPriceWithCurrency: { amount: (cents / 100).toFixed(2), currencyCode: 'USD' }, customAttributes: [{ key: 'Room', value: `${clientHubUrl}/` }] }],
      customerId: client.shopify_customer_id || undefined, email: client.shopify_customer_id ? undefined : (client.contact_email || undefined), note, tags: ['future-basics-client-hub', ...tags, `client-${tag(client.slug)}`], visibleToCustomer: true };
    const draft = shopify.requireNoUserErrors((await shopify.graphql(shopify.DRAFT_ORDER_CREATE, { input })).draftOrderCreate).draftOrder;
    return { id: draft.id, url: draft.invoiceUrl };
  }
  async function activate(clientId, { source = 'shopify', orderId = null, paidAt = null, by = null, days = null, includedAi = null, aiPriceCents = null, unpaidCapCents = null, feeCents = null, pendingId = null } = {}) {
    const p = pricing(), d = Math.max(1, Math.round(Number(days) || p.days));
    await pool.query(`update lab_access set status='ended', ended_at=now() where client_id=$1 and status='active'`, [clientId]);
    const r = pendingId
      ? (await pool.query(`update lab_access set status='active', source=$2, starts_at=now(), ends_at=now()+make_interval(days=>$3), pay_order_id=coalesce($4, pay_order_id), paid_at=coalesce($5::timestamptz, now()) where id=$1 returning *`, [pendingId, source, d, orderId, paidAt])).rows[0]
      : (await pool.query(`insert into lab_access(client_id, status, source, fee_cents, days, included_ai, ai_price_cents, unpaid_cap_cents, starts_at, ends_at, pay_order_id, paid_at, created_by) values($1,'active',$2,$3,$4,$5,$6,$7,now(),now()+make_interval(days=>$4),$8,coalesce($9::timestamptz, now()),$10) returning *`,
        [clientId, source, Number.isFinite(Number(feeCents)) ? Number(feeCents) : (source === 'shopify' ? p.feeCents : 0), d, Number.isFinite(Number(includedAi)) ? Number(includedAi) : p.includedAi, Number.isFinite(Number(aiPriceCents)) ? Number(aiPriceCents) : p.aiPriceCents, Number.isFinite(Number(unpaidCapCents)) ? Number(unpaidCapCents) : p.unpaidCapCents, orderId, paidAt, by])).rows[0];
    await pool.query(`insert into activities(client_id, actor_id, type, summary, metadata) values($1, $2, 'design', $3, $4)`, [clientId, by, source === 'comped' ? 'Design Lab access given' : source === 'dev' ? 'Design Lab opened (development)' : 'Design Lab access paid', { accessId: r.id, source, days: d, includedAi: r.included_ai }]).catch(() => {});
    if (source === 'shopify' && r.fee_cents > 0) await recordPayment({ clientId, kind: 'design-lab', title: 'Design Lab access', amountCents: r.fee_cents, orderId, paidAt }).catch(e => log.warn?.({ err: e.message }, 'design lab fee not recorded'));
    try { await onActivate(clientId, r); } catch (e) { log.warn?.({ err: e.message, clientId }, 'design lab activation hook failed'); }
    return r;
  }
  async function checkout(client) {
    const p = pricing(); if (!p.enabled) throw Object.assign(new Error('The Design Lab is not open for self-serve right now'), { status: 503 });
    if (await active(client.id)) throw Object.assign(new Error('The Design Lab is already open on your room'), { status: 409 });
    if (!shopify.configured?.()) {
      if (env.DEV_BYPASS_AUTH === 'true') return { checkoutUrl: null, dev: true, access: row(await activate(client.id, { source: 'dev', feeCents: p.feeCents })) };
      throw Object.assign(new Error('Payments are not set up yet: message Future Basics and we will open the Lab for you'), { status: 503 });
    }
    const open = await pending(client.id); if (open?.pay_invoice_url) return { checkoutUrl: open.pay_invoice_url, draftOrderId: open.pay_draft_order_id };
    const dr = await draftOrder({ client, title: `Design Lab · ${p.days} days, ${p.includedAi} AI generations included`, cents: p.feeCents, tags: ['fb-design-lab'], note: `Future Basics · Design Lab access · ${client.name}` });
    await pool.query(`insert into lab_access(client_id, status, source, fee_cents, days, included_ai, ai_price_cents, unpaid_cap_cents, pay_draft_order_id, pay_invoice_url) values($1,'pending','shopify',$2,$3,$4,$5,$6,$7,$8)`, [client.id, p.feeCents, p.days, p.includedAi, p.aiPriceCents, p.unpaidCapCents, dr.id, dr.url]);
    return { checkoutUrl: dr.url, draftOrderId: dr.id };
  }
  // has the fee been paid? (the hub asks when the person comes back from the checkout)
  async function landed(clientId) {
    if (await active(clientId)) return true;
    const open = await pending(clientId); if (!open?.pay_draft_order_id || !shopify.configured?.()) return false;
    const order = await shopify.pollDraftOrderPaid(open.pay_draft_order_id); if (!order || !/^PAID$/i.test(order.displayFinancialStatus || '')) return false;
    await activate(clientId, { source: 'shopify', orderId: order.id, pendingId: open.id });
    return true;
  }
  async function comp(clientId, { by = null, days = null, includedAi = null, aiPriceCents = null, unpaidCapCents = null } = {}) { return row(await activate(clientId, { source: 'comped', by, days, includedAi, aiPriceCents, unpaidCapCents })); }
  async function end(clientId, by = null) {
    const r = await pool.query(`update lab_access set status='ended', ended_at=now() where client_id=$1 and status in ('active','pending') returning id`, [clientId]);
    if (r.rowCount) await pool.query(`insert into activities(client_id, actor_id, type, summary) values($1, $2, 'design', 'Design Lab access ended')`, [clientId, by]).catch(() => {});
    return r.rowCount;
  }

  // ---- billing the generations past the included ones ----
  async function billOverage(clientId, { force = false, by = null } = {}) {
    const a = await active(clientId); if (!a) return null;
    const m = await meter(clientId, a), p = pricing();
    if (!m.unbilledUnits || (!force && m.unbilledCents < p.billAtCents)) return null;
    const client = (await pool.query('select id, slug, name, contact_email, shopify_customer_id from clients where id=$1', [clientId])).rows[0];
    let dr = { id: null, url: null };
    if (shopify.configured?.()) dr = await draftOrder({ client, title: `Design Lab · ${m.unbilledUnits} AI generation${m.unbilledUnits === 1 ? '' : 's'} past the ${m.included} included`, cents: m.unbilledCents, tags: ['fb-design-lab-ai'], note: `Future Basics · Design Lab AI usage · ${client.name}` });
    const inv = (await pool.query(`insert into lab_ai_invoices(client_id, access_id, units, amount_cents, draft_order_id, invoice_url) values($1,$2,$3,$4,$5,$6) returning *`, [clientId, a.id, m.unbilledUnits, m.unbilledCents, dr.id, dr.url])).rows[0];
    await pool.query(`insert into activities(client_id, actor_id, type, summary, metadata) values($1, $2, 'commerce', $3, $4)`, [clientId, by, `Design Lab AI usage invoiced: ${m.unbilledUnits} generations, $${(m.unbilledCents / 100).toFixed(2)}`, { invoiceId: inv.id }]).catch(() => {});
    if (dr.url) notifyClient(clientId, { subject: 'Your Design Lab AI usage', body: `<p>Your room used <strong>${m.unbilledUnits}</strong> AI generation${m.unbilledUnits === 1 ? '' : 's'} past the ${m.included} included with the Design Lab. The invoice is <strong>$${(m.unbilledCents / 100).toFixed(2)}</strong>.</p><p><a href="${dr.url}">Pay it here</a>, or from the Design Lab card in your hub. Generations keep going until the room owes $${(p.unpaidCapCents / 100).toFixed(0)}.</p>` }).catch(() => {});
    return inv;
  }
  async function invoicePaid(invoiceId, { orderId = null, paidAt = null, amountCents = null } = {}) {
    const r = (await pool.query(`update lab_ai_invoices set paid_at=coalesce($2::timestamptz, now()), order_id=coalesce($3, order_id) where id=$1 and paid_at is null returning *`, [invoiceId, paidAt, orderId])).rows[0]; if (!r) return null;
    await recordPayment({ clientId: r.client_id, kind: 'design-lab-ai', title: `Design Lab · ${r.units} AI generations`, amountCents: amountCents || r.amount_cents, orderId, paidAt }).catch(e => log.warn?.({ err: e.message }, 'design lab AI payment not recorded'));
    return r;
  }
  // an open AI invoice: paid? (the hub asks on return from the checkout)
  async function invoiceLanded(clientId, invoiceId) {
    const inv = (await pool.query('select * from lab_ai_invoices where id=$1 and client_id=$2', [invoiceId, clientId])).rows[0]; if (!inv) return null;
    if (inv.paid_at) return true; if (!inv.draft_order_id || !shopify.configured?.()) return false;
    const order = await shopify.pollDraftOrderPaid(inv.draft_order_id); if (!order || !/^PAID$/i.test(order.displayFinancialStatus || '')) return false;
    await invoicePaid(inv.id, { orderId: order.id }); return true;
  }
  // the payment sync: a paid order tagged for the Lab lands here (p is the ledger's shape from src/payments.js)
  async function fromOrder(p, clientId) {
    if (p.kind === 'design-lab') {
      if (await active(clientId)) { const open = await pending(clientId); if (open) await pool.query(`update lab_access set status='ended', ended_at=now() where id=$1`, [open.id]); return false; }
      if ((await pool.query('select 1 from lab_access where client_id=$1 and pay_order_id=$2', [clientId, p.orderId])).rowCount) return false;
      const open = await pending(clientId);
      await activate(clientId, { source: 'shopify', orderId: p.orderId, paidAt: p.paidAt, pendingId: open?.id || null }); return true;
    }
    if (p.kind === 'design-lab-ai') {
      const inv = (await pool.query(`select * from lab_ai_invoices where client_id=$1 and paid_at is null and (order_id=$2 or amount_cents=$3) order by created_at limit 1`, [clientId, p.orderId, p.amountCents])).rows[0] || (await pool.query(`select * from lab_ai_invoices where client_id=$1 and paid_at is null order by created_at limit 1`, [clientId])).rows[0];
      if (!inv) return false; await invoicePaid(inv.id, { orderId: p.orderId, paidAt: p.paidAt, amountCents: p.amountCents }); return true;
    }
    return false;
  }

  // ---- what a room sees ----
  async function status(clientId) {
    if (await isFree(clientId)) { const a = await active(clientId); return { pricing: pricing(), access: row(a), ended: null, meter: await meter(clientId, a), open: true, free: true }; }
    const p = pricing(), a = await latest(clientId), live = a && a.status === 'active' && (!a.ends_at || new Date(a.ends_at) > new Date());
    return { pricing: p, access: row(live ? a : (a?.status === 'pending' ? a : null)), ended: !live && a?.status === 'ended' ? row(a) : null, meter: live ? await meter(clientId, a) : null, open: Boolean(live), free: false };
  }
  const usage = async (clientId, limit = 60) => (await pool.query(`select u.kind, u.units, u.created_at, c.name concept from lab_ai_usage u left join lab_concepts c on c.id=u.concept_id where u.client_id=$1 order by u.created_at desc limit $2`, [clientId, limit])).rows.map(r => ({ kind: r.kind, units: r.units, at: r.created_at, concept: r.concept || '' }));
  // the work console's switch: charges off (free) or on, per room, written on the room's record
  async function setFree(clientId, on, by = null) {
    const r = (await pool.query('update clients set lab_free=$2 where id=$1 and lab_free is distinct from $2 returning name', [clientId, Boolean(on)])).rows[0];
    if (r) await pool.query(`insert into activities(client_id, actor_id, type, summary, metadata) values($1, $2, 'design', $3, $4)`, [clientId, by, on ? `Design Lab charges turned off for ${r.name}: the Lab is free` : `Design Lab charges turned back on for ${r.name}`, { labFree: Boolean(on) }]).catch(() => {});
    return Boolean(r);
  }
  return { pricing, gate, scope, ownId, active, isFree, setFree, meter, charge, checkout, landed, activate, comp, end, billOverage, invoicePaid, invoiceLanded, fromOrder, status, usage, row };
}
