// Automatic payments on a signed contract: the client puts a card or bank account on file once, and each payment in the schedule is taken on its due date.
// The rules (what is due, retries, notices) are plain functions at the top; the runner below ties them to the database, QuickBooks and email.
// The processor (qb-payments.js) is passed in, so another one can replace it without touching any rule here.
//
//   * Money moves only on what the client authorized when signing: each payment of the schedule, on the date it falls due, for no other amount.
//   * One try, then one retry three days later. After that the invoice stays open and the client is sent the pay link; staff are told.
//   * Taking a payment and putting it in the books are separate steps: a payment that was taken is never lost if QuickBooks is busy, it is booked on the next run.
//   * Every attempt has its own fixed Request-Id, so running twice never charges twice, and nothing is charged while the invoice is already paid.
import { randomUUID } from 'node:crypto';
import { schedule, dollars, longDate, todayISO, addDays, signToken } from './contracts.js';
import { ensureCustomer } from './quickbooks.js';

export const MAX_ATTEMPTS = 2, RETRY_DAYS = 3, NOTICE_DAYS = 3, LOCK = 7732;

export const authorizationText = (kind, providerName = 'Future Basics') => `I authorize ${providerName} to ${kind === 'bank' ? 'debit this bank account (ACH)' : 'charge this card'} for each payment in the payment schedule of this agreement, on the date it falls due, and for no other amount. ${providerName} emails a receipt for every payment and an advance notice a few days before each one. I can ask to stop automatic payments by giving three business days' notice.`;

// The state of every payment in a schedule, and what to do about it today.
// sched: [{ seq, amountCents, falls }]  charges: contract_charges rows  → [{ seq, state, action?, attempt?, notice?, last? }]
//   state: paid | pending | failed | retry | scheduled | due | waiting     action: charge | poll
export function planDue({ sched, charges = [], today, paused = false, hasMethod = false }) {
  return sched.map(s => {
    const mine = charges.filter(c => c.seq === s.seq).sort((a, b) => a.attempt - b.attempt), last = mine.at(-1) || null, out = { seq: s.seq, last };
    if (mine.some(c => c.status === 'succeeded')) return { ...out, state: 'paid' };
    const can = hasMethod && !paused;
    if (last?.status === 'pending') return { ...out, state: 'pending', action: 'poll' };
    if (last?.status === 'failed') {
      if (last.attempt >= MAX_ATTEMPTS) return { ...out, state: 'failed' };
      const due = last.next_retry_on ? String(last.next_retry_on).slice(0, 10) : null;
      return due && due <= today && can ? { ...out, state: 'retry', action: 'charge', attempt: last.attempt + 1 } : { ...out, state: 'retry' };
    }
    if (!s.falls) return { ...out, state: 'waiting' };
    if (s.falls > today) return { ...out, state: 'scheduled', notice: can && addDays(s.falls, -NOTICE_DAYS) <= today };
    return can ? { ...out, state: 'due', action: 'charge', attempt: 1 } : { ...out, state: 'due' };
  });
}

export function createAutopay(d) {
  const { pool, proc, money, draftInvoices = null, reload = null, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, hubButton = () => '', emailEscape = s => String(s), notifyStaff = async () => false,
    secret = 'dev', publicUrl = 'https://hub.thefuturebasics.com', workUrl = 'https://work.thefuturebasics.com', log = console, env = process.env } = d;
  const first = n => String(n || '').trim().split(/\s+/)[0] || 'there', iso = x => (x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : null);
  const ev = (id, kind, { actor = 'autopay', detail = '', meta = {} } = {}) => pool.query('insert into contract_events(contract_id,kind,actor,detail,meta) values($1,$2,$3,$4,$5::jsonb)', [id, kind, actor, String(detail).slice(0, 500), JSON.stringify(meta)]).catch(() => {});
  const linkOf = r => `${publicUrl}/sign/${signToken(secret, r.id, r.token_version)}`;
  const email = (r, subject, title, body) => sendHubEmail({ to: r.content.client.signerEmail, subject, html: hubEmailShell(title, `<p>Hi ${emailEscape(first(r.content.client.signerName))},</p>${body}`) }).catch(() => false);
  const signedOn = r => iso(r.client_signature?.at || r.executed_at) || todayISO();
  const sched = r => schedule(r.content.plan, { signedOn: signedOn(r), deliveryOn: iso(r.delivered_on) || r.content.timeline?.completionOn || null }).map((p, i) => ({ ...p, seq: i + 1 }));
  const activeMethod = async id => (await pool.query(`select * from contract_payment_methods where contract_id=$1 and status='active'`, [id])).rows[0] || null;

  // Ready to take payments? The QuickBooks connection has to have been made with the payments permission.
  async function readiness() {
    const ctx = await money.qbContext().catch(() => null);
    if (!ctx) return { ready: false, ctx: null, why: 'QuickBooks is not connected yet (Money, Settings).' };
    if (!ctx.cfg.payments) return { ready: false, ctx, why: 'Payments are not switched on: set QUICKBOOKS_PAYMENTS=on on the service, then connect QuickBooks again.' };
    if (!String(ctx.row?.scope || '').includes('payment')) return { ready: false, ctx, why: 'QuickBooks was connected before payments were switched on: connect it again in Money, Settings.' };
    return { ready: true, ctx, why: '' };
  }

  // ---- the client's card or bank account ----
  // `token` is the one-time token the browser got from Intuit; the number itself never reached us.
  async function saveMethod(r, { kind, token, ip = '', ua = '' }) {
    const plan = r.content.plan, sig = r.client_signature;
    if (!plan.autopay || !sig?.autopay) return { error: 'This agreement does not have automatic payments', status: 409 };
    if (!['signed_by_client', 'executed'].includes(r.status)) return { error: 'Sign the agreement first', status: 409 };
    const want = (plan.method === 'either' ? sig.method : plan.method) === 'card' ? 'card' : 'bank';
    if (kind !== want) return { error: want === 'bank' ? 'This agreement is paid by bank account (ACH)' : 'This agreement is paid by card', status: 422 };
    const k = kind === 'card' ? 'card' : 'bank', rd = await readiness();
    if (!rd.ready) return { error: 'Payment details cannot be taken just yet. We have been told and will email you the moment they can.', status: 503, notReady: rd.why };
    const c = r.content.client;
    let cust; try { cust = await ensureCustomer(rd.ctx, { company: c.company, contact_name: c.signerName, contact_email: c.signerEmail, address: c.address }); } catch (e) { await money.qbFailed(e); return { error: 'Could not reach the payment service. Try again in a minute.', status: 502 }; }
    let inst; try { inst = await proc.saveInstrument(rd.ctx, { customerId: cust.id, kind: k, token, requestId: `fb-pm-${r.id}-${randomUUID()}` }); }
    catch (e) {
      log.warn?.({ payments: true, err: String(e.message).slice(0, 200), code: e.code, intuit_tid: e.tid }, 'saving payment details failed');
      // what Intuit said goes on the contract's trail and to staff (never the client's details: Intuit's message does not contain them), so the cause can be seen without digging in logs
      await ev(r.id, 'payment_method_failed', { actor: sig.name, detail: `${String(e.message).replace(/^QuickBooks Payments: /, '').slice(0, 300)}${e.code ? ` [${e.code}]` : ''}${e.tid ? ` (intuit_tid ${e.tid})` : ''}`, meta: { kind: k, status: e.status || null } });
      await notifyStaff(`Saving payment details failed for ${r.number} (${c.company})`, `<p>${emailEscape(String(e.message).slice(0, 400))}${e.code ? ` <code>${emailEscape(e.code)}</code>` : ''}${e.tid ? ` (intuit_tid ${emailEscape(e.tid)})` : ''}</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}`);
      const said = String(e.detail || '').replace(/\s+/g, ' ').trim().slice(0, 160); // Intuit's own words (never the client's numbers) help the client fix a typo and us find the cause
      return { error: e.status === 400 || e.status === 422 ? `Those payment details were not accepted${said ? ` (${said.replace(/\.$/, '')})` : ''}. Check them and try again.` : 'Could not save the payment details. Try again in a minute.', status: e.status === 400 || e.status === 422 ? 422 : 502 }; }
    const authorization = { by: sig.name, at: new Date().toISOString(), ip, ua: String(ua).slice(0, 300), contractHash: r.doc_hash, text: authorizationText(k, r.content.provider?.name || 'Future Basics') };
    const db = await pool.connect(); let old = null;
    try {
      await db.query('begin'); old = (await db.query(`update contract_payment_methods set status='removed', removed_at=now() where contract_id=$1 and status='active' returning *`, [r.id])).rows[0] || null;
      await db.query(`insert into contract_payment_methods(contract_id,kind,customer_id,instrument_id,label,last4,exp,consent) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [r.id, k, cust.id, inst.id, inst.label, inst.last4, inst.exp, JSON.stringify(authorization)]);
      await db.query('commit');
    } catch (e) { await db.query('rollback').catch(() => {}); throw e; } finally { db.release(); }
    if (old) proc.removeInstrument(rd.ctx, { customerId: old.customer_id, kind: old.kind === 'card' ? 'card' : 'bank', id: old.instrument_id }).catch(() => {});
    await ev(r.id, 'payment_method_saved', { actor: sig.name, detail: inst.label, meta: { kind: k, replaced: Boolean(old) } });
    await email(r, `Payment details saved for ${r.content.title}`, 'Payment details saved', `<p>We have saved your <b>${emailEscape(inst.label)}</b> for the automatic payments in <b>${emailEscape(r.content.title)}</b> (${emailEscape(r.number)}). We charge each payment on its due date and email a receipt each time, with a few days' notice before.</p><p>You can change the ${k === 'card' ? 'card' : 'bank account'} any time from your agreement link:</p>${hubButton(linkOf(r), 'Open your agreement')}`);
    await notifyStaff(`Payment details received for ${r.number} (${c.company})`, `<p>${emailEscape(sig.name)} saved a ${emailEscape(inst.label)} for <b>${emailEscape(r.content.title)}</b>.</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}`);
    return { ok: true, method: { kind: k, label: inst.label, last4: inst.last4, exp: inst.exp } };
  }

  // ---- taking a payment ----
  async function book(r, row, inv, m, today = todayISO()) {
    // the money has been taken: put it in QuickBooks and the ledger. If QuickBooks is down this is tried again on the next run.
    try {
      const rd = await readiness(); if (!rd.ctx) throw new Error('QuickBooks is not connected');
      const b = await money.bookAutopay(rd.ctx, inv, { customerId: m.customer_id, amountCents: Number(row.amount_cents), method: m.kind === 'card' ? 'card' : 'ach', reference: row.charge_id || '', paidOn: today, note: `Automatic payment ${row.seq} of agreement ${r.number}` });
      await pool.query(`update contract_charges set booked_at=now(), qb_payment_id=$2, book_error='' where id=$1`, [row.id, b.qbPaymentId]);
      return true;
    } catch (e) { await pool.query(`update contract_charges set book_error=$2 where id=$1`, [row.id, String(e.message).slice(0, 240)]); log.warn?.({ payments: true, err: String(e.message).slice(0, 200) }, 'a payment was taken but could not be put in QuickBooks yet'); return false; }
  }
  const invoiceFor = async (contractId, seq) => { const id = (await pool.query('select id from money_invoices where contract_id=$1 and contract_seq=$2', [contractId, seq])).rows[0]?.id; return id ? money.invoiceOne(id) : null; };

  async function succeed(r, row, chargeId, today = todayISO()) {
    const u = await pool.query(`update contract_charges set status='succeeded', charge_id=$2, settled_at=now(), error='' where id=$1 and status<>'succeeded' returning *`, [row.id, chargeId]);
    if (!u.rowCount) return; const fresh = u.rows[0], m = (await pool.query('select * from contract_payment_methods where id=$1', [fresh.method_id])).rows[0], inv = await invoiceFor(r.id, fresh.seq);
    await ev(r.id, 'autopay_paid', { detail: `${dollars(fresh.amount_cents, fresh.currency)} taken for payment ${fresh.seq}`, meta: { seq: fresh.seq, kind: fresh.kind, attempt: fresh.attempt } });
    if (inv && m) await book(r, fresh, inv, m, today);
    if (!fresh.receipt_sent_at) {
      const left = sched(r).length - (await pool.query(`select count(distinct seq)::int n from contract_charges where contract_id=$1 and status='succeeded'`, [r.id])).rows[0].n;
      await email(r, `Receipt: ${dollars(fresh.amount_cents, fresh.currency)} for ${r.content.title}`, 'Payment received', `<p>We received <b>${emailEscape(dollars(fresh.amount_cents, fresh.currency))}</b> for <b>${emailEscape(r.content.title)}</b> (${emailEscape(r.number)}), paid by ${emailEscape(m?.label || 'your payment method')}.</p><p>${left > 0 ? `${left} payment${left === 1 ? '' : 's'} left in the schedule.` : 'That was the last payment in the schedule. Thank you.'}</p>`);
      await pool.query('update contract_charges set receipt_sent_at=now() where id=$1', [fresh.id]);
    }
  }
  async function fail(r, row, reason, today = todayISO()) {
    const final = row.attempt >= MAX_ATTEMPTS, retryOn = final ? null : addDays(today, RETRY_DAYS);
    const u = await pool.query(`update contract_charges set status='failed', error=$2, settled_at=now(), next_retry_on=$3 where id=$1 and status<>'failed' returning *`, [row.id, String(reason).slice(0, 240), retryOn]); if (!u.rowCount) return;
    const m = (await pool.query('select label from contract_payment_methods where id=$1', [row.method_id])).rows[0], inv = await invoiceFor(r.id, row.seq), amount = dollars(row.amount_cents, row.currency);
    await ev(r.id, 'autopay_failed', { detail: `${amount} for payment ${row.seq}: ${reason}`, meta: { seq: row.seq, attempt: row.attempt, final } });
    const payLine = inv?.pay_url ? hubButton(inv.pay_url, 'Pay this invoice now') : '';
    if (final) {
      await email(r, `We could not take ${amount} for ${r.content.title}`, 'Payment did not go through', `<p>We tried twice to take <b>${emailEscape(amount)}</b> from your ${emailEscape(m?.label || 'payment method')} and it did not go through (${emailEscape(reason)}). Nothing more will be charged automatically for this payment.</p><p>Please pay it another way${inv?.pay_url ? ' using the button below' : ', or reply to this email and we will help'}, or update your payment method from your agreement link.</p>${payLine}${hubButton(linkOf(r), 'Update payment method')}`);
      await notifyStaff(`Autopay failed twice: ${amount} for ${r.number} (${r.content.client.company})`, `<p>${emailEscape(reason)}</p><p>The invoice ${emailEscape(inv?.number || '')} stays open. Follow up with the client, or press Charge now on the contract once they have updated their details.</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}`);
    } else {
      await email(r, `Payment of ${amount} did not go through`, 'Payment did not go through', `<p>We tried to take <b>${emailEscape(amount)}</b> from your ${emailEscape(m?.label || 'payment method')} for <b>${emailEscape(r.content.title)}</b> and it did not go through (${emailEscape(reason)}).</p><p>We will try once more on <b>${emailEscape(longDate(retryOn))}</b>. To avoid that, you can update your payment method now:</p>${hubButton(linkOf(r), 'Update payment method')}${payLine}`);
      await notifyStaff(`Autopay declined: ${amount} for ${r.number} (${r.content.client.company})`, `<p>${emailEscape(reason)}. It is tried again on ${emailEscape(longDate(retryOn))}.</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}`);
    }
  }
  // Ask the processor for this attempt (the same request id every time, so asking again cannot take it twice) and settle what it answers.
  async function ask(r, row, m, rd, today = todayISO()) {
    try {
      const res = await proc.charge(rd.ctx, { kind: row.kind, instrumentId: m.instrument_id, amountCents: Number(row.amount_cents), currency: row.currency, requestId: row.request_id, description: `${r.number} payment ${row.seq}` });
      if (res.status === 'succeeded') await succeed(r, row, res.id, today);
      else if (res.status === 'pending') await pool.query(`update contract_charges set charge_id=$2 where id=$1`, [row.id, res.id]);
      else await fail(r, row, res.reason || 'Declined', today);
      return res.status;
    } catch (e) {
      // a refusal from the processor is final for this attempt; anything else (no answer) leaves it pending to be asked again with the same id
      if (e.status && e.status >= 400 && e.status < 500 && !e.refused) { await fail(r, row, e.message.replace(/^QuickBooks Payments: /, ''), today); return 'declined'; }
      if (e.refused) await money.qbFailed(e);
      await pool.query(`update contract_charges set error=$2 where id=$1`, [row.id, String(e.message).slice(0, 240)]); return 'unknown';
    }
  }
  async function attempt(r, seq, attemptNo, trigger, today = todayISO()) {
    const m = await activeMethod(r.id); if (!m) return { skipped: 'no payment method on file' };
    const rd = await readiness(); if (!rd.ready) return { skipped: rd.why };
    let inv = await invoiceFor(r.id, seq); if (!inv) return { skipped: 'the invoice for this payment has not been drafted' };
    if (['paid', 'void'].includes(inv.status)) return { skipped: `the invoice is ${inv.status}` };
    const owed = Number(inv.total_cents) - Number(inv.paid_cents || 0), want = sched(r)[seq - 1]?.amountCents || owed, amount = Math.min(owed, want);
    if (amount <= 0) return { skipped: 'nothing is owed on the invoice' };
    if (!inv.qb_id) { try { await money.pushAndSave(rd.ctx, inv); inv = await invoiceFor(r.id, seq); } catch (e) { await money.qbFailed(e); return { skipped: `the invoice could not be put in QuickBooks: ${e.message}` }; } }
    const ins = await pool.query(`insert into contract_charges(contract_id,seq,attempt,invoice_id,method_id,kind,amount_cents,currency,request_id,due_on,triggered_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing returning *`,
      [r.id, seq, attemptNo, inv.id, m.id, m.kind, amount, r.currency || 'USD', `fb-ch-${r.id}-${seq}-${attemptNo}`, iso(sched(r)[seq - 1]?.falls), trigger]);
    if (!ins.rowCount) return { skipped: 'already tried' };
    return { tried: await ask(r, ins.rows[0], m, rd, today) };
  }
  async function poll(r, row, today = todayISO()) {
    const m = (await pool.query('select * from contract_payment_methods where id=$1', [row.method_id])).rows[0], rd = await readiness(); if (!m || !rd.ready) return;
    if (!row.charge_id) { await ask(r, row, m, rd, today); return; } // asked, but no answer came back: ask again with the same request id
    try { const res = await proc.status(rd.ctx, { kind: row.kind, chargeId: row.charge_id }); if (res.status === 'succeeded') await succeed(r, row, row.charge_id, today); else if (res.status === 'declined') await fail(r, row, res.reason || 'The bank did not accept the debit', today); } catch (e) { if (e.refused) await money.qbFailed(e); }
  }

  async function notices(r, m, plan) {
    for (const p of plan) {
      if (!p.notice) continue; const s = sched(r)[p.seq - 1];
      if ((await pool.query(`select 1 from contract_events where contract_id=$1 and kind='autopay_upcoming' and meta->>'seq'=$2`, [r.id, String(p.seq)])).rowCount) continue;
      await ev(r.id, 'autopay_upcoming', { detail: `payment ${p.seq} on ${s.falls}`, meta: { seq: p.seq } });
      await email(r, `Upcoming payment: ${dollars(s.amountCents, r.currency)} on ${longDate(s.falls)}`, 'Upcoming payment', `<p>On <b>${emailEscape(longDate(s.falls))}</b> we will take <b>${emailEscape(dollars(s.amountCents, r.currency))}</b> (${emailEscape(s.label)}) for <b>${emailEscape(r.content.title)}</b> from your ${emailEscape(m.label)}, as set out in agreement ${emailEscape(r.number)}.</p><p>If something has changed, update your payment method before then, or contact us.</p>${hubButton(linkOf(r), 'Update payment method')}`);
    }
  }

  // The whole picture for one contract (the staff page and the client's page both show it).
  async function overview(r, today = todayISO()) {
    const plan = r.content.plan; if (!plan.autopay) return null;
    const m = await activeMethod(r.id), charges = (await pool.query('select * from contract_charges where contract_id=$1 order by seq, attempt', [r.id])).rows, paused = Boolean(r.autopay_paused_at);
    const list = planDue({ sched: sched(r), charges, today, paused, hasMethod: Boolean(m) }), s = sched(r);
    return { enabled: true, method: m ? { kind: m.kind, label: m.label, last4: m.last4, exp: m.exp, since: m.created_at } : null, paused, pausedAt: r.autopay_paused_at || null, deliveredOn: iso(r.delivered_on),
      installments: list.map(p => ({ seq: p.seq, label: s[p.seq - 1].label, amountCents: s[p.seq - 1].amountCents, falls: s[p.seq - 1].falls || null, state: p.state, attempts: charges.filter(c => c.seq === p.seq).map(c => ({ attempt: c.attempt, status: c.status, error: c.error, at: c.created_at, notBooked: c.status === 'succeeded' && !c.booked_at, bookError: c.book_error })) })) };
  }

  // One contract's turn: invoices drafted if they are not yet, money taken but not booked is booked, notices go out, and every payment that is due is charged.
  async function processContract(r, today, out) {
    try {
      if (!r.invoices_at && draftInvoices && reload) { await draftInvoices(r); r = await reload(r.id); }
      const m = await activeMethod(r.id), charges = (await pool.query('select * from contract_charges where contract_id=$1 order by seq, attempt', [r.id])).rows;
      for (const c of charges.filter(x => x.status === 'succeeded' && !x.booked_at)) { const inv = await invoiceFor(r.id, c.seq), cm = (await pool.query('select * from contract_payment_methods where id=$1', [c.method_id])).rows[0]; if (inv && cm && await book(r, c, inv, cm, today)) out.booked++; }
      const plan = planDue({ sched: sched(r), charges, today, paused: Boolean(r.autopay_paused_at), hasMethod: Boolean(m) });
      if (m) { const count = async () => (await pool.query(`select count(*)::int n from contract_events where contract_id=$1 and kind='autopay_upcoming'`, [r.id])).rows[0].n, before = await count(); await notices(r, m, plan); out.notices += (await count()) - before; }
      for (const p of plan) {
        if (p.action === 'poll') { await poll(r, p.last, today); out.polled++; }
        else if (p.action === 'charge') { const res = await attempt(r, p.seq, p.attempt, 'job', today); if (res.tried) out.charged++; else if (res.skipped) out.skipped.push(`${r.number} #${p.seq}: ${res.skipped}`); }
      }
    } catch (e) { out.skipped.push(`${r.number}: ${String(e.message).slice(0, 120)}`); log.warn?.({ payments: true, contract: r.number, err: String(e.message).slice(0, 200) }, 'autopay run failed for a contract'); }
  }
  // The hourly run: every signed contract with automatic payments. Safe to run any number of times and from several servers at once (only one gets the lock).
  async function run({ today = todayISO(), only = null } = {}) {
    const lock = await pool.connect(), out = { charged: 0, polled: 0, booked: 0, notices: 0, skipped: [] };
    try {
      if (!(await lock.query('select pg_try_advisory_lock($1) ok', [LOCK])).rows[0].ok) return { ...out, locked: true };
      const rows = (await pool.query(`select * from contracts where status='executed' and (content->'plan'->>'autopay')='true' ${only ? 'and id=$1' : ''} order by executed_at`, only ? [only] : [])).rows;
      for (const r of rows) await processContract(r, today, out);
      return out;
    } finally { await lock.query('select pg_advisory_unlock($1)', [LOCK]).catch(() => {}); lock.release(); }
  }
  const runFor = id => run({ only: id });

  // A signer takes one payment now: only one that has fallen due (or a failed one, after the client updated their details).
  async function chargeNow(r, seq, { today = todayISO() } = {}) {
    const plan = planDue({ sched: sched(r), charges: (await pool.query('select * from contract_charges where contract_id=$1 order by seq, attempt', [r.id])).rows, today, hasMethod: true }), p = plan[seq - 1];
    if (!p) return { error: 'There is no such payment in the schedule', status: 404 };
    if (p.state === 'paid') return { error: 'That payment has been taken', status: 409 };
    if (p.state === 'pending') return { error: 'That payment is with the bank already', status: 409 };
    if (p.state === 'scheduled') return { error: 'That payment is not due yet: the agreement lets us take it only on its due date', status: 409 };
    if (p.state === 'waiting') return { error: 'That payment falls due on delivery: record the delivery date first', status: 409 };
    const prior = (await pool.query('select coalesce(max(attempt),0) n from contract_charges where contract_id=$1 and seq=$2', [r.id, seq])).rows[0].n;
    const res = await attempt(r, seq, Number(prior) + 1, 'staff', today); return res.tried ? { ok: true, result: res.tried } : { error: res.skipped, status: 409 };
  }

  return { saveMethod, run, runFor, chargeNow, overview, readiness, activeMethod, sched, linkOf };
}
