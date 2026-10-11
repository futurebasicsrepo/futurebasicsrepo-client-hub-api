// Staff API for the Money hub. Only the admins named in MONEY_ACCESS_EMAILS (default: Danielle and Kyle) can use any of it.
//   GET  /v1/money/me                          200 for someone allowed, 403 for anyone else (the menu uses it to show or hide Money)
//   GET  /v1/money/overview                    cash in, what is owed and late, ageing, by source, top clients, recent invoices
//   GET  /v1/money/invoices   POST /v1/money/invoices   GET|PUT|DELETE /v1/money/invoices/:id   GET /v1/money/invoices/:id/pdf
//   POST /v1/money/invoices/:id/send | paid | unpaid | void      POST /v1/money/invoices/:id/payments      DELETE /v1/money/payments/:id
//   POST /v1/money/import                      a CSV of past invoices: { csv, apply } (apply:false only previews)
//   GET  /v1/money/payments                    the ledger: money received from every source, newest first
//   GET|PUT /v1/money/settings                 the payment instructions printed on invoices
//   GET /v1/money/quickbooks/status   POST .../connect | test | sync | disconnect   GET .../callback (Intuit sends the browser back here)   POST /v1/money/invoices/:id/quickbooks
import { moneyAllowed, cleanInvoice, nextInvoiceNumber, invoiceState, aging, parseInvoiceCsv, METHODS } from './money.js';
import { moneyInvoicePdf } from './money-pdf.js';
import { qbConfig, signState, readState, authUrl, endpoints, exchangeCode, revoke, companyInfo, pushInvoice, invoiceLink, paymentsSince, methodOf } from './quickbooks.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = () => new Date().toISOString().slice(0, 10);
const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function registerMoneyRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, env = process.env, onChange = async () => {}, tokenSeal, stateSecret = 'money', workUrl = 'https://work.thefuturebasics.com', fetchImpl = fetch, log = console, shopifyInvoiceLink = null, shopifyDraftStatus = null } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  async function moneyOnly(req, reply) {
    const u = (await pool.query('select email from users where id=$1', [req.auth?.sub]).catch(() => ({ rows: [] }))).rows[0];
    if (!u || !moneyAllowed(u.email, env)) return reply.code(403).send({ error: 'Money is only open to the people named for it' });
    req.money = { email: u.email };
  }
  const pre = [authenticate, adminOnly, moneyOnly], actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);

  const SELECT = `select i.*, coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id), 0)::bigint paid_cents, (select pr.name from projects pr where pr.id=i.project_id) project_name from money_invoices i`;
  const view = r => {
    const paid = Number(r.paid_cents || 0), st = invoiceState({ ...r, due_on: iso(r.due_on) }, paid, today());
    return { id: r.id, number: r.number, company: r.company, contactName: r.contact_name, contactEmail: r.contact_email, address: r.address, issuedOn: iso(r.issued_on), terms: r.terms, dueOn: iso(r.due_on), lines: r.lines, taxRatePct: Number(r.tax_rate), chargeTax: r.charge_tax,
      credits: r.credits, dueNowLabel: r.due_now_label, dueNowCents: r.due_now_cents == null ? null : Number(r.due_now_cents), subtotalCents: Number(r.subtotal_cents), taxCents: Number(r.tax_cents), totalCents: Number(r.total_cents), notes: r.notes, currency: r.currency,
      status: r.status, source: r.source, state: st.state, owedCents: st.owedCents, overdue: st.overdue, daysOverdue: st.daysOverdue, paidCents: paid, sentAt: r.sent_at, paidAt: r.paid_at, createdAt: r.created_at,
      workKind: r.work_kind || '', projectId: r.project_id || null, projectName: r.project_name || '', payUrl: r.pay_url || '', payChannel: r.pay_channel || '',
      qb: r.qb_id ? { id: r.qb_id, docNumber: r.qb_doc_number, link: r.qb_link, syncedAt: r.qb_synced_at } : null };
  };
  // What is still owed by the numbers alone, whatever status the invoice has (a paid invoice reads 0 otherwise).
  const rawOwed = r => invoiceState({ ...r, status: 'sent', due_on: iso(r.due_on) }, Number(r.paid_cents), today()).owedCents;
  const one = async id => (await pool.query(`${SELECT} where i.id=$1`, [id])).rows[0];
  const instructions = async () => String(((await getSetting('moneyPayment').catch(() => null)) || {}).instructions || '');
  const insertParams = (v, extra) => [v.number, v.company, v.contactName, v.contactEmail, v.address, v.issuedOn, v.terms, v.dueOn, JSON.stringify(v.lines), v.taxRatePct, v.chargeTax, JSON.stringify(v.credits), v.dueNowLabel, v.dueNowCents === v.balanceCents ? null : v.dueNowCents, v.subtotalCents, v.taxCents, v.totalCents, v.notes, v.currency, extra.status, extra.source, extra.by];
  const INSERT = `insert into money_invoices(number,company,contact_name,contact_email,address,issued_on,terms,due_on,lines,tax_rate,charge_tax,credits,due_now_label,due_now_cents,subtotal_cents,tax_cents,total_cents,notes,currency,status,source,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) returning id`;
  const numbers = async () => (await pool.query('select number from money_invoices')).rows.map(r => r.number);

  // The kind of work (product or software development) decides the payment link. A project, when one is chosen, decides the kind and the client.
  async function setWork(id, v) {
    let kind = v.workKind || '', clientId = null;
    if (v.projectId) { const p = (await pool.query('select client_id, kind from projects where id=$1', [v.projectId])).rows[0]; if (p) { kind = p.kind === 'software' ? 'software' : 'product'; clientId = p.client_id; } else v.projectId = null; }
    const before = (await pool.query('select work_kind, pay_channel, shopify_draft_id from money_invoices where id=$1', [id])).rows[0] || {};
    // a Shopify link was made for the old amount or kind: it is made again on request
    const staleShopify = before.pay_channel === 'shopify';
    await pool.query(`update money_invoices set work_kind=$2, project_id=$3, client_id=coalesce($4, client_id), pay_url=case when $5 then '' else pay_url end, pay_channel=case when $5 then '' else pay_channel end, shopify_draft_id=case when $5 then '' else shopify_draft_id end where id=$1`, [id, kind, v.projectId || null, clientId, staleShopify]);
  }
  app.get('/v1/money/me', { preHandler: pre }, async req => ({ ok: true, email: req.money.email }));

  // ---------- invoices ----------
  app.get('/v1/money/invoices', { preHandler: pre }, async req => {
    const q = req.query || {}, rows = (await pool.query(`${SELECT} order by i.issued_on desc, i.number desc limit 1000`)).rows.map(view), text = clip(q.q, 80).toLowerCase();
    const status = String(q.status || '');
    const list = rows.filter(r => (!text || `${r.number} ${r.company} ${r.lines.map(l => l.description).join(' ')}`.toLowerCase().includes(text)) && (!status || (status === 'open' ? ['open', 'part-paid', 'overdue'].includes(r.state) : status === 'overdue' ? r.state === 'overdue' : r.state === status)));
    return { invoices: list, nextNumber: nextInvoiceNumber(await numbers()), counts: { all: rows.length, open: rows.filter(r => ['open', 'part-paid', 'overdue'].includes(r.state)).length, overdue: rows.filter(r => r.state === 'overdue').length, draft: rows.filter(r => r.state === 'draft').length, paid: rows.filter(r => r.state === 'paid').length, unrecorded: rows.filter(r => r.state === 'unrecorded').length } };
  });
  app.post('/v1/money/invoices', { preHandler: pre }, async (req, reply) => {
    const c = cleanInvoice(req.body); if (c.error) return bad(reply, c.error); const v = c.value, num = v.number || nextInvoiceNumber(await numbers());
    try { const id = (await pool.query(INSERT, insertParams({ ...v, number: num }, { status: 'draft', source: 'app', by: actorOf(req) }))).rows[0].id; await setWork(id, v); return reply.code(201).send({ invoice: view(await one(id)) }); }
    catch (e) { if (e.code === '23505') return bad(reply, `Invoice ${num} already exists`, 409); throw e; }
  });
  app.get('/v1/money/invoices/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await one(req.params.id); if (!r) return bad(reply, 'Not found', 404);
    const payments = (await pool.query('select id, source, method, amount_cents, paid_on, reference, note from money_payments where invoice_id=$1 order by paid_on, created_at', [r.id])).rows.map(p => ({ id: p.id, source: p.source, method: p.method, amountCents: Number(p.amount_cents), paidOn: iso(p.paid_on), reference: p.reference, note: p.note }));
    return { invoice: view(r), payments };
  });
  app.put('/v1/money/invoices/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    if (['paid', 'void'].includes(cur.status)) return bad(reply, `A ${cur.status} invoice cannot be edited${cur.status === 'paid' ? ': take the payment off first' : ''}`, 409);
    const c = cleanInvoice({ ...req.body, number: req.body?.number || cur.number }); if (c.error) return bad(reply, c.error); const v = c.value;
    try {
      await pool.query(`update money_invoices set number=$2, company=$3, contact_name=$4, contact_email=$5, address=$6, issued_on=$7, terms=$8, due_on=$9, lines=$10::jsonb, tax_rate=$11, charge_tax=$12, credits=$13::jsonb, due_now_label=$14, due_now_cents=$15, subtotal_cents=$16, tax_cents=$17, total_cents=$18, notes=$19, currency=$20, updated_at=now() where id=$1`,
        [cur.id, v.number, v.company, v.contactName, v.contactEmail, v.address, v.issuedOn, v.terms, v.dueOn, JSON.stringify(v.lines), v.taxRatePct, v.chargeTax, JSON.stringify(v.credits), v.dueNowLabel, v.dueNowCents === v.balanceCents ? null : v.dueNowCents, v.subtotalCents, v.taxCents, v.totalCents, v.notes, v.currency]);
    } catch (e) { if (e.code === '23505') return bad(reply, `Invoice ${v.number} already exists`, 409); throw e; }
    await setWork(cur.id, v); await onChange('edited', cur.id); return { invoice: view(await one(cur.id)) };
  });
  app.delete('/v1/money/invoices/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    if (cur.status !== 'draft') return bad(reply, 'Only a draft can be deleted. Void an invoice that was sent.', 409);
    await pool.query('delete from money_invoices where id=$1', [cur.id]); return { ok: true };
  });
  app.get('/v1/money/invoices/:id/pdf', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await one(req.params.id); if (!r) return bad(reply, 'Not found', 404);
    const st = invoiceState({ ...r, due_on: iso(r.due_on) }, Number(r.paid_cents), today());
    const buf = await moneyInvoicePdf({ ...r, issued_on: iso(r.issued_on), due_on: iso(r.due_on), pay_url: ['paid', 'void'].includes(r.status) ? '' : r.pay_url }, { instructions: await instructions() }, st);
    return reply.type('application/pdf').header('content-disposition', `inline; filename="TFB Invoice ${String(r.number).replace(/[^A-Za-z0-9_-]/g, '-')}.pdf"`).send(buf);
  });

  // ---------- what happens to an invoice ----------
  async function recordPayment(inv, { amountCents, paidOn, method, reference, note, source = 'manual', by }) {
    await pool.query(`insert into money_payments(invoice_id, source, method, company, amount_cents, currency, paid_on, reference, note, created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [inv.id, source, method, inv.company, amountCents, inv.currency, paidOn, reference, note, by]);
    const after = await one(inv.id);
    if (rawOwed(after) === 0 && after.status !== 'paid') await pool.query(`update money_invoices set status='paid', paid_at=now(), updated_at=now() where id=$1`, [inv.id]);
  }
  app.post('/v1/money/invoices/:id/:action', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    const b = req.body || {}, by = actorOf(req), action = req.params.action, paidSoFar = Number(cur.paid_cents), st = invoiceState({ ...cur, due_on: iso(cur.due_on) }, paidSoFar, today());
    switch (action) {
      case 'send': {
        if (['void', 'paid'].includes(cur.status)) return bad(reply, `A ${cur.status} invoice cannot be sent`, 409);
        await pool.query(`update money_invoices set status=case when status in ('draft','unrecorded') then 'sent' else status end, sent_at=coalesce(sent_at, now()), updated_at=now() where id=$1`, [cur.id]); await onChange('sent', cur.id); break;
      }
      case 'paid': {
        if (['void', 'draft'].includes(cur.status)) return bad(reply, cur.status === 'draft' ? 'Send the invoice first' : 'A void invoice cannot be paid', 409);
        const owed = st.owedCents; if (!owed) return bad(reply, 'Nothing is owed on this invoice', 409);
        const paidOn = (b.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(String(b.paidOn)) && String(b.paidOn)) || today(), method = METHODS.includes(b.method) ? b.method : 'other';
        await recordPayment(cur, { amountCents: owed, paidOn, method, reference: clip(b.reference, 120), note: clip(b.note, 300), source: cur.source === 'history' ? 'history' : 'manual', by }); await onChange('paid', cur.id); break;
      }
      case 'unpaid': {
        if (!['paid', 'unrecorded'].includes(cur.status)) return bad(reply, 'Only a paid or unrecorded invoice can be put back to unpaid', 409);
        await pool.query('delete from money_payments where invoice_id=$1 and source in (\'manual\',\'history\')', [cur.id]); await pool.query(`update money_invoices set status='sent', paid_at=null, updated_at=now() where id=$1`, [cur.id]); break;
      }
      case 'void': {
        if (paidSoFar > 0) return bad(reply, 'It has payments against it. Take them off first, or leave it as it is.', 409);
        await pool.query(`update money_invoices set status='void', updated_at=now() where id=$1`, [cur.id]); await onChange('void', cur.id); break;
      }
      default: return bad(reply, 'Not found', 404);
    }
    return { invoice: view(await one(cur.id)) };
  });
  app.post('/v1/money/invoices/:id/payments', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404); const b = req.body || {};
    if (['draft', 'void'].includes(cur.status)) return bad(reply, cur.status === 'draft' ? 'Send the invoice before recording a payment' : 'A void invoice cannot take a payment', 409);
    const amountCents = Math.round(Number(b.amountCents)), paidOn = String(b.paidOn || today());
    if (!Number.isFinite(amountCents) || amountCents <= 0) return bad(reply, 'Enter the amount received');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return bad(reply, 'The date received is not a date');
    const owed = invoiceState({ ...cur, due_on: iso(cur.due_on) }, Number(cur.paid_cents), today()).owedCents;
    if (amountCents > owed) return bad(reply, `That is more than the ${(owed / 100).toFixed(2)} still owed`);
    await recordPayment(cur, { amountCents, paidOn, method: METHODS.includes(b.method) ? b.method : 'other', reference: clip(b.reference, 120), note: clip(b.note, 300), by: actorOf(req) }); await onChange('payment', cur.id);
    return reply.code(201).send({ invoice: view(await one(cur.id)) });
  });
  app.delete('/v1/money/payments/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const p = (await pool.query('select * from money_payments where id=$1', [req.params.id])).rows[0]; if (!p) return bad(reply, 'Not found', 404);
    if (!['manual', 'history'].includes(p.source)) return bad(reply, 'Payments that came from QuickBooks or Shopify are changed there', 409);
    await pool.query('delete from money_payments where id=$1', [p.id]);
    if (p.invoice_id) { const inv = await one(p.invoice_id); if (inv && inv.status === 'paid' && rawOwed(inv) > 0) await pool.query(`update money_invoices set status='sent', paid_at=null, updated_at=now() where id=$1`, [inv.id]); }
    return { ok: true };
  });

  // ---------- past invoices from a CSV ----------
  app.post('/v1/money/import', { preHandler: pre, bodyLimit: 4_000_000 }, async (req, reply) => {
    const b = req.body || {}, parsed = parseInvoiceCsv(String(b.csv || ''), { today: today() }); if (!parsed.invoices.length && parsed.errors.length) return reply.code(422).send({ error: parsed.errors[0].error, errors: parsed.errors });
    const have = new Set(await numbers()), seen = new Set(), add = [], skipped = []; const counter = { n: have.size ? Number(nextInvoiceNumber([...have])) : 1001 };
    for (const r of parsed.invoices) {
      let num = r.value.number; if (!num) { while (have.has(String(counter.n))) counter.n++; num = String(counter.n++); }
      if (have.has(num) || seen.has(num)) { skipped.push({ number: num, company: r.value.company, reason: 'already in the list' }); continue; }
      seen.add(num); add.push({ ...r, value: { ...r.value, number: num } });
    }
    const summary = { toAdd: add.length, skipped, errors: parsed.errors, totalCents: add.reduce((a, r) => a + r.value.balanceCents + r.value.creditsCents, 0), byStatus: add.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {}), sample: add.slice(0, 5).map(r => ({ number: r.value.number, company: r.value.company, issuedOn: r.value.issuedOn, totalCents: r.value.totalCents, status: r.status })) };
    if (b.apply !== true) return { applied: false, ...summary };
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const r of add) {
        const id = (await client.query(INSERT, insertParams(r.value, { status: r.status, source: 'history', by: actorOf(req) }))).rows[0].id;
        if (r.status === 'paid') await client.query(`insert into money_payments(invoice_id, source, method, company, amount_cents, currency, paid_on, reference, note, created_by) values($1,'history','other',$2,$3,$4,$5,'imported','',$6)`, [id, r.value.company, r.value.totalCents - r.value.creditsCents, r.value.currency, r.paidOn || r.value.dueOn, actorOf(req)]);
        if (r.status === 'paid') await client.query(`update money_invoices set paid_at=$2 where id=$1`, [id, r.paidOn || r.value.dueOn]);
      }
      await client.query('commit');
    } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
    return { applied: true, ...summary };
  });


  // ---------- QuickBooks Online ----------
  const cfg = () => qbConfig(env, workUrl), sealReady = () => Boolean(tokenSeal?.ready);
  const connRow = async () => (await pool.query(`select * from money_connections where provider='quickbooks'`)).rows[0] || null;
  // The connected company as a context for quickbooks.js, or null when not connected (or the sealing key changed, which means connect again).
  async function qbContext() {
    const row = await connRow(); if (!row || row.status !== 'connected') return null;
    const accessToken = tokenSeal.open(row.access_sealed), refreshToken = tokenSeal.open(row.refresh_sealed); if (!refreshToken) { await pool.query(`update money_connections set status='needs-reconnect', last_error='The saved sign-in can no longer be read: connect again' where provider='quickbooks'`); return null; }
    const conn = { realmId: row.realm_id, accessToken, refreshToken, accessExpiresAt: row.access_expires_at };
    return { cfg: cfg(), conn, row, fetchImpl, log: d.log, save: async t => { await pool.query(`update money_connections set access_sealed=$1, refresh_sealed=$2, access_expires_at=$3, refresh_expires_at=$4, updated_at=now() where provider='quickbooks'`, [tokenSeal.seal(t.accessToken), tokenSeal.seal(t.refreshToken), t.accessExpiresAt, t.refreshExpiresAt]); } };
  }
  const failed = async e => { d.log?.warn?.({ quickbooks: true, status: e.status, intuit_tid: e.tid, code: e.code, err: String(e.message).slice(0, 300) }, 'QuickBooks error'); await pool.query(`update money_connections set last_error=$1, status=case when $2 then 'needs-reconnect' else status end, updated_at=now() where provider='quickbooks'`, [(String(e.message).slice(0, 260) + (e.tid ? ` (intuit_tid ${e.tid})` : '')).slice(0, 300), Boolean(e.refused)]).catch(() => {}); };
  app.get('/v1/money/quickbooks/status', { preHandler: pre }, async () => {
    const c = cfg(), row = await connRow();
    return { configured: c.ready, sealing: sealReady(), mode: c.mode, redirectUri: c.redirectUri, connected: Boolean(row && row.status === 'connected'), needsReconnect: Boolean(row && row.status === 'needs-reconnect'), company: row?.company || '', realmId: row?.realm_id || '', connectedAt: row?.connected_at || null, lastSyncAt: row?.last_sync_at || null, lastError: row?.last_error || '', refreshExpiresAt: row?.refresh_expires_at || null };
  });
  app.post('/v1/money/quickbooks/connect', { preHandler: pre }, async (req, reply) => {
    const c = cfg(); if (!c.ready) return bad(reply, 'QuickBooks is not set up: add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to the service', 503);
    if (!sealReady()) return bad(reply, 'Saved sign-ins cannot be kept safely: set SHOPIFY_TOKEN_KEY on the service first', 503);
    return { url: authUrl(c, signState(stateSecret, actorOf(req)), await endpoints(c, fetchImpl)), redirectUri: c.redirectUri };
  });
  // Intuit sends the person's browser back here. There is no bearer token on this request: the signed state says who began it, and that person must still be allowed into Money.
  app.get('/v1/money/quickbooks/callback', async (req, reply) => {
    const q = req.query || {}, back = (k, why = '') => reply.redirect(`${workUrl.replace(/\/$/, '')}/money?qb=${k}${why ? `&why=${encodeURIComponent(why)}` : ''}#settings`);
    const st = readState(stateSecret, q.state); if (!st) return back('error', 'That sign-in link expired. Press Connect QuickBooks again.');
    const u = (await pool.query('select id, email, role from users where id=$1', [st.u])).rows[0]; if (!u || u.role !== 'admin' || !moneyAllowed(u.email, env)) return back('error', 'Money is not open to that person.');
    if (q.error) return back('error', q.error === 'access_denied' ? 'QuickBooks sign-in was cancelled.' : 'QuickBooks did not finish the sign-in.');
    const c = cfg(); if (!c.ready || !sealReady() || !q.code || !q.realmId) return back('error', 'The sign-in came back without what we need. Try again.');
    try {
      const t = await exchangeCode(c, String(q.code), fetchImpl), ctx = { cfg: c, conn: { realmId: String(q.realmId), accessToken: t.accessToken, refreshToken: t.refreshToken, accessExpiresAt: t.accessExpiresAt }, fetchImpl }, info = await companyInfo(ctx);
      await pool.query(`insert into money_connections(provider,realm_id,company,mode,access_sealed,refresh_sealed,access_expires_at,refresh_expires_at,status,last_error,connected_by,connected_at,sync_cursor,last_sync_at) values('quickbooks',$1,$2,$3,$4,$5,$6,$7,'connected','',$8,now(),null,null)
        on conflict (provider) do update set realm_id=$1, company=$2, mode=$3, access_sealed=$4, refresh_sealed=$5, access_expires_at=$6, refresh_expires_at=$7, status='connected', last_error='', connected_by=$8, connected_at=now(), sync_cursor=null, last_sync_at=null, updated_at=now()`,
        [String(q.realmId), info.name, c.mode, tokenSeal.seal(t.accessToken), tokenSeal.seal(t.refreshToken), t.accessExpiresAt, t.refreshExpiresAt, u.id]);
      return back('connected');
    } catch (e) { return back('error', e.message); }
  });
  app.post('/v1/money/quickbooks/test', { preHandler: pre }, async (req, reply) => {
    const ctx = await qbContext(); if (!ctx) return bad(reply, cfg().ready ? 'QuickBooks is not connected yet: press Connect QuickBooks' : 'QuickBooks is not set up: add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET', 409);
    const t0 = Date.now();
    try { const info = await companyInfo(ctx); await pool.query(`update money_connections set company=$1, last_error='', updated_at=now() where provider='quickbooks'`, [info.name || ctx.row.company]); return { ok: true, company: info.name, country: info.country, mode: ctx.cfg.mode, realmId: ctx.conn.realmId, ms: Date.now() - t0 }; }
    catch (e) { await failed(e); return bad(reply, e.message, 502); }
  });
  app.post('/v1/money/quickbooks/disconnect', { preHandler: pre }, async () => {
    const ctx = await qbContext(); if (ctx) await revoke(ctx.cfg, ctx.conn.refreshToken, fetchImpl);
    await pool.query(`delete from money_connections where provider='quickbooks'`); return { ok: true };
  });
  // Make (and optionally email) one invoice in QuickBooks. An invoice already there is not made twice.
  app.post('/v1/money/invoices/:id/quickbooks', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    if (cur.qb_id) return bad(reply, `This invoice is already in QuickBooks (${cur.qb_doc_number || cur.qb_id})`, 409);
    if (['void', 'paid'].includes(cur.status)) return bad(reply, `A ${cur.status} invoice is not sent to QuickBooks`, 409);
    const send = req.body?.send === true; if (send && !cur.contact_email) return bad(reply, 'Add their email to the invoice first, so QuickBooks knows where to send it');
    const ctx = await qbContext(); if (!ctx) return bad(reply, 'QuickBooks is not connected yet. Connect it in Money → Settings.', 409);
    try {
      const r = await pushInvoice(ctx, { ...cur, issued_on: iso(cur.issued_on), due_on: iso(cur.due_on) }, { send, onlinePayments: (await getSetting('moneyPayment').catch(() => null))?.onlinePayments !== false });
      await pool.query(`update money_invoices set qb_id=$2, qb_doc_number=$3, qb_sync_token=$4, qb_link=$5, qb_synced_at=now(), status=case when status in ('draft','unrecorded') then 'sent' else status end, sent_at=coalesce(sent_at, now()), updated_at=now() where id=$1`, [cur.id, r.id, r.docNumber || cur.number, r.syncToken, `${ctx.cfg.appOrigin}/app/invoice?txnId=${encodeURIComponent(r.id)}`]);
      if (cur.work_kind === 'software' && !cur.pay_url) { try { const url = await invoiceLink(ctx, r.id); if (url) await pool.query(`update money_invoices set pay_url=$2, pay_channel='quickbooks' where id=$1`, [cur.id, url]); } catch { /* the payment link can be asked for from the invoice */ } }
      await onChange('quickbooks', cur.id); return reply.code(201).send({ invoice: view(await one(cur.id)), emailed: r.emailed, customerCreated: r.customerCreated });
    } catch (e) { await failed(e); return bad(reply, e.message, 502); }
  });
  // ---------- the payment link: Shopify for product development, QuickBooks for software development ----------
  app.get('/v1/money/projects', { preHandler: pre }, async req => {
    const q = clip(req.query?.q, 60).toLowerCase();
    const rows = (await pool.query(`select p.id, p.name, p.kind, c.name client_name, c.id client_id from projects p join clients c on c.id=p.client_id where p.archived_at is null and p.status not in ('archive','archived') order by c.name, p.name limit 600`)).rows;
    return { projects: rows.filter(r => !q || `${r.name} ${r.client_name}`.toLowerCase().includes(q)).map(r => ({ id: r.id, name: r.name, kind: r.kind === 'software' ? 'software' : 'product', client: r.client_name, clientId: r.client_id })).slice(0, 200) };
  });
  app.post('/v1/money/invoices/:id/pay-link', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    if (['paid', 'void'].includes(cur.status)) return bad(reply, `A ${cur.status} invoice needs no payment link`, 409);
    if (cur.pay_url && req.body?.refresh !== true) return { invoice: view(cur), made: false };
    if (!cur.work_kind) return bad(reply, 'Say what kind of work this is first: product development pays through Shopify, software development through QuickBooks', 409);
    const balance = rawOwed(cur), due = cur.due_now_cents == null ? balance : Math.min(Number(cur.due_now_cents), balance);
    if (due <= 0) return bad(reply, 'Nothing is owed on this invoice', 409);
    try {
      if (cur.work_kind === 'software') {
        const ctx = await qbContext(); if (!ctx) return bad(reply, 'Software development is paid through QuickBooks, and it is not connected. Connect it in Money → Settings.', 409);
        if (!cur.contact_email) return bad(reply, 'Add the client\'s email to the invoice first: QuickBooks only gives a payment link to an invoice it can email', 409);
        let qbId = cur.qb_id;
        if (!qbId) {
          const r = await pushInvoice(ctx, { ...cur, issued_on: iso(cur.issued_on), due_on: iso(cur.due_on) }, { send: false, onlinePayments: true });
          qbId = r.id; await pool.query(`update money_invoices set qb_id=$2, qb_doc_number=$3, qb_sync_token=$4, qb_link=$5, qb_synced_at=now(), status=case when status in ('draft','unrecorded') then 'sent' else status end, sent_at=coalesce(sent_at, now()), updated_at=now() where id=$1`, [cur.id, r.id, r.docNumber || cur.number, r.syncToken, `${ctx.cfg.appOrigin}/app/invoice?txnId=${r.id}`]);
        }
        const url = await invoiceLink(ctx, qbId);
        if (!url) return bad(reply, 'QuickBooks gave no payment link. Online payments must be on for the invoice (Money → Settings) and QuickBooks Payments turned on in your books.', 409);
        await pool.query(`update money_invoices set pay_url=$2, pay_channel='quickbooks', updated_at=now() where id=$1`, [cur.id, url]);
      } else {
        if (!shopifyInvoiceLink) return bad(reply, 'Shopify is not set up for payment links', 409);
        const r = await shopifyInvoiceLink({ title: `Invoice ${cur.number}: ${cur.company}`, amountCents: due, currency: cur.currency, email: cur.contact_email, note: `Future Basics invoice ${cur.number}`, number: cur.number });
        await pool.query(`update money_invoices set pay_url=$2, pay_channel='shopify', shopify_draft_id=$3, status=case when status in ('draft','unrecorded') then 'sent' else status end, sent_at=coalesce(sent_at, now()), updated_at=now() where id=$1`, [cur.id, r.url, r.draftId || '']);
      }
    } catch (e) { if (cur.work_kind === 'software') await failed(e); return bad(reply, e.message || 'The payment link could not be made', 502); }
    await onChange('pay-link', cur.id); return reply.code(201).send({ invoice: view(await one(cur.id)), made: true });
  });
  // A Shopify payment link whose checkout has been paid: record the payment once and settle the invoice.
  async function syncShopifyLinks() {
    if (!shopifyDraftStatus) return { checked: 0, added: 0 };
    const rows = (await pool.query(`${SELECT} where i.pay_channel='shopify' and i.shopify_draft_id<>'' and i.status not in ('paid','void') order by i.created_at limit 50`)).rows; let added = 0;
    for (const r of rows) {
      try {
        const d = await shopifyDraftStatus(r.shopify_draft_id); if (!d?.paid) continue;
        const ref = `shopify:${r.shopify_draft_id}`; if ((await pool.query('select 1 from money_payments where invoice_id=$1 and reference=$2', [r.id, ref])).rowCount) continue;
        const owed = rawOwed(r), amount = d.amountCents && d.amountCents > 0 ? Math.min(d.amountCents, owed) : owed;
        await recordPayment(r, { amountCents: amount, paidOn: iso(d.paidAt) || today(), method: 'shopify', reference: ref, note: `Paid through the Shopify link${d.orderName ? ` (${d.orderName})` : ''}`, source: 'shopify', by: null }); added++;
      } catch (e) { log.warn?.({ err: e.message, invoiceId: r.id }, 'Shopify payment link not checked'); }
    }
    return { checked: rows.length, added };
  }
  app.post('/v1/money/shopify-links/sync', { preHandler: pre }, async () => ({ ok: true, ...(await syncShopifyLinks()) }));
  // Read payments QuickBooks has recorded and match them to our invoices (by the QuickBooks invoice id). Safe to run again: each payment is kept once.
  async function syncQuickBooks() {
    const ctx = await qbContext(); if (!ctx) return { skipped: 'not connected', added: 0 };
    const since = ctx.row.sync_cursor ? new Date(ctx.row.sync_cursor) : new Date(Date.now() - 90 * 86400000), startedAt = new Date(), connectedOn = iso(ctx.row.connected_at);
    try {
      let added = 0, kept = 0; const list = await paymentsSince(ctx, since.toISOString().replace(/\.\d+Z$/, '-00:00'));
      for (const p of list) for (const a of p.applied) {
        const inv = (await pool.query('select * from money_invoices where qb_id=$1', [a.invoiceId])).rows[0];
        if (!inv && p.paidOn < connectedOn) continue; // money QuickBooks took before we were connected, for invoices we never made: leave it out of our ledger
        const r = await pool.query(`insert into money_payments(invoice_id, source, method, company, amount_cents, currency, paid_on, reference, note, qb_id) values($1,'quickbooks',$2,$3,$4,$5,$6,$7,$8,$9) on conflict (qb_id) where qb_id is not null do nothing`,
          [inv?.id || null, methodOf(p.method), inv?.company || p.customer, a.amountCents, inv?.currency || 'USD', p.paidOn || iso(new Date()), p.reference, inv ? '' : `QuickBooks invoice ${a.invoiceId}`, `${p.id}:${a.invoiceId}`]);
        if (r.rowCount) { added++; if (inv) { const after = await one(inv.id); if (after && after.status !== 'paid' && after.status !== 'void' && rawOwed(after) === 0) await pool.query(`update money_invoices set status='paid', paid_at=now(), updated_at=now() where id=$1`, [inv.id]); } } else kept++;
      }
      await pool.query(`update money_connections set last_sync_at=now(), sync_cursor=$1, last_error='', updated_at=now() where provider='quickbooks'`, [new Date(startedAt.getTime() - 5 * 60_000)]);
      return { added, kept, seen: list.length };
    } catch (e) { await failed(e); throw e; }
  }
  app.post('/v1/money/quickbooks/sync', { preHandler: pre }, async (req, reply) => {
    if (!(await connRow())) return bad(reply, 'QuickBooks is not connected yet', 409);
    try { return { ok: true, ...(await syncQuickBooks()) }; } catch (e) { return bad(reply, e.message, 502); }
  });
  void log;

  // ---------- the ledger and the overview ----------
  async function ledger(limit = 400) {
    const mine = (await pool.query(`select p.id, p.source, p.method, p.company, p.amount_cents, p.currency, p.paid_on, p.reference, p.note, i.number invoice_number from money_payments p left join money_invoices i on i.id=p.invoice_id order by p.paid_on desc, p.created_at desc limit $1`, [limit])).rows
      .map(r => ({ id: r.id, source: r.source, method: r.method, company: r.company, amountCents: Number(r.amount_cents), currency: r.currency, paidOn: iso(r.paid_on), reference: r.reference, note: r.note, invoice: r.invoice_number || '' }));
    const shop = (await pool.query(`select py.id, py.kind, py.title, py.amount_cents, py.currency, py.paid_at, py.shopify_order_name, c.name client_name from payments py left join clients c on c.id=py.client_id order by py.paid_at desc limit $1`, [limit]).catch(() => ({ rows: [] }))).rows
      .map(r => ({ id: `shopify:${r.id}`, source: 'shopify', method: 'shopify', company: r.client_name || '', amountCents: Number(r.amount_cents), currency: r.currency || 'USD', paidOn: iso(r.paid_at), reference: r.shopify_order_name || '', note: r.title || r.kind || '', invoice: '' }));
    return [...mine, ...shop].sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));
  }
  app.get('/v1/money/payments', { preHandler: pre }, async req => {
    const q = req.query || {}, text = clip(q.q, 80).toLowerCase(), src = String(q.source || ''); const all = await ledger();
    const rows = all.filter(r => (!src || r.source === src) && (!text || `${r.company} ${r.reference} ${r.note} ${r.invoice}`.toLowerCase().includes(text)));
    return { payments: rows.slice(0, 300), totalCents: rows.reduce((a, r) => a + r.amountCents, 0), count: rows.length };
  });
  app.get('/v1/money/overview', { preHandler: pre }, async () => {
    const t = today(), invs = (await pool.query(`${SELECT}`)).rows.map(view), all = await ledger(2000);
    const since = n => { const x = new Date(); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
    const within = n => all.filter(r => r.paidOn >= since(n)), sum = rows => rows.reduce((a, r) => a + r.amountCents, 0);
    const open = invs.filter(i => ['open', 'part-paid', 'overdue'].includes(i.state)), late = open.filter(i => i.overdue);
    const bySource = {}; for (const r of within(30)) bySource[r.source] = (bySource[r.source] || 0) + r.amountCents;
    const byCompany = {}; for (const r of within(90)) if (r.company) byCompany[r.company] = (byCompany[r.company] || 0) + r.amountCents;
    return { today: t, cashIn30: sum(within(30)), cashIn90: sum(within(90)), outstandingCents: open.reduce((a, i) => a + i.owedCents, 0), openCount: open.length, overdueCents: late.reduce((a, i) => a + i.owedCents, 0), overdueCount: late.length,
      aging: aging(open.map(i => ({ owedCents: i.owedCents, daysOverdue: i.daysOverdue })), t), bySource: Object.entries(bySource).map(([source, cents]) => ({ source, cents })).sort((a, b) => b.cents - a.cents),
      topClients90: Object.entries(byCompany).map(([company, cents]) => ({ company, cents })).sort((a, b) => b.cents - a.cents).slice(0, 6), lateInvoices: late.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 8),
      recent: invs.filter(i => i.status !== 'void').slice().sort((a, b) => String(b.issuedOn).localeCompare(String(a.issuedOn)) || String(b.number).localeCompare(String(a.number))).slice(0, 8), unrecorded: invs.filter(i => i.state === 'unrecorded').length, drafts: invs.filter(i => i.state === 'draft').length };
  });

  // ---------- settings ----------
  app.get('/v1/money/settings', { preHandler: pre }, async () => ({ instructions: await instructions() }));
  app.put('/v1/money/settings', { preHandler: pre }, async (req, reply) => {
    const lines = String(req.body?.instructions ?? '').replace(/\r/g, '').split('\n').map(s => s.replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim()).filter(Boolean);
    if (lines.length > 12 || lines.some(l => l.length > 120)) return bad(reply, 'Payment instructions are at most 12 lines of 120 characters');
    await setSetting('moneyPayment', { instructions: lines.join('\n') }); return { ok: true, instructions: lines.join('\n') };
  });
  return { syncQuickBooks, syncShopifyLinks };
}
