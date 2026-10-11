// Staff API for the Money hub. Only the admins named in MONEY_ACCESS_EMAILS (default: Danielle and Kyle) can use any of it.
//   GET  /v1/money/me                          200 for someone allowed, 403 for anyone else (the menu uses it to show or hide Money)
//   GET  /v1/money/overview                    cash in, what is owed and late, ageing, by source, top clients, recent invoices
//   GET  /v1/money/invoices   POST /v1/money/invoices   GET|PUT|DELETE /v1/money/invoices/:id   GET /v1/money/invoices/:id/pdf
//   POST /v1/money/invoices/:id/send | paid | unpaid | void      POST /v1/money/invoices/:id/payments      DELETE /v1/money/payments/:id
//   POST /v1/money/import                      a CSV of past invoices: { csv, apply } (apply:false only previews)
//   GET  /v1/money/payments                    the ledger: money received from every source, newest first
//   GET|PUT /v1/money/settings                 the payment instructions printed on invoices
import { moneyAllowed, cleanInvoice, nextInvoiceNumber, invoiceState, aging, parseInvoiceCsv, METHODS } from './money.js';
import { moneyInvoicePdf } from './money-pdf.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = () => new Date().toISOString().slice(0, 10);
const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function registerMoneyRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, env = process.env, onChange = async () => {} } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  async function moneyOnly(req, reply) {
    const u = (await pool.query('select email from users where id=$1', [req.auth?.sub]).catch(() => ({ rows: [] }))).rows[0];
    if (!u || !moneyAllowed(u.email, env)) return reply.code(403).send({ error: 'Money is only open to the people named for it' });
    req.money = { email: u.email };
  }
  const pre = [authenticate, adminOnly, moneyOnly], actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);

  const SELECT = `select i.*, coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id), 0)::bigint paid_cents from money_invoices i`;
  const view = r => {
    const paid = Number(r.paid_cents || 0), st = invoiceState({ ...r, due_on: iso(r.due_on) }, paid, today());
    return { id: r.id, number: r.number, company: r.company, contactName: r.contact_name, contactEmail: r.contact_email, address: r.address, issuedOn: iso(r.issued_on), terms: r.terms, dueOn: iso(r.due_on), lines: r.lines, taxRatePct: Number(r.tax_rate), chargeTax: r.charge_tax,
      credits: r.credits, dueNowLabel: r.due_now_label, dueNowCents: r.due_now_cents == null ? null : Number(r.due_now_cents), subtotalCents: Number(r.subtotal_cents), taxCents: Number(r.tax_cents), totalCents: Number(r.total_cents), notes: r.notes, currency: r.currency,
      status: r.status, source: r.source, state: st.state, owedCents: st.owedCents, overdue: st.overdue, daysOverdue: st.daysOverdue, paidCents: paid, sentAt: r.sent_at, paidAt: r.paid_at, createdAt: r.created_at,
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
    try { const id = (await pool.query(INSERT, insertParams({ ...v, number: num }, { status: 'draft', source: 'app', by: actorOf(req) }))).rows[0].id; return reply.code(201).send({ invoice: view(await one(id)) }); }
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
    await onChange('edited', cur.id); return { invoice: view(await one(cur.id)) };
  });
  app.delete('/v1/money/invoices/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const cur = await one(req.params.id); if (!cur) return bad(reply, 'Not found', 404);
    if (cur.status !== 'draft') return bad(reply, 'Only a draft can be deleted. Void an invoice that was sent.', 409);
    await pool.query('delete from money_invoices where id=$1', [cur.id]); return { ok: true };
  });
  app.get('/v1/money/invoices/:id/pdf', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await one(req.params.id); if (!r) return bad(reply, 'Not found', 404);
    const st = invoiceState({ ...r, due_on: iso(r.due_on) }, Number(r.paid_cents), today());
    const buf = await moneyInvoicePdf({ ...r, issued_on: iso(r.issued_on), due_on: iso(r.due_on) }, { instructions: await instructions() }, st);
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
}
