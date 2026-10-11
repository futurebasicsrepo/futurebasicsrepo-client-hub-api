// The Money hub's rules, with no database or network: who may see money, what an invoice is and how it adds up, what is overdue,
// and how a CSV of past invoices is read. See money-routes.js for the staff API and money-pdf.js for the invoice document.
// All amounts are whole cents. Nothing here moves money or contacts anyone.

export const DEFAULT_MONEY_ACCESS = ['danielle@thefuturebasics.com', 'kyle@thefuturebasics.com'];
export const TERMS = ['Due on receipt', 'Due upon receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];
export const STATUSES = ['draft', 'sent', 'paid', 'void', 'unrecorded'];
export const METHODS = ['wire', 'ach', 'card', 'check', 'shopify', 'quickbooks', 'cash', 'other'];

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, n);
const clipLines = (v, n) => String(v ?? '').replace(/\r/g, '').split('\n').map(l => l.replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim()).filter(Boolean).join('\n').slice(0, n);
const toCents = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

// ---------- who may see money ----------
// MONEY_ACCESS_EMAILS (comma separated; "@domain.com" names a whole domain) replaces the default of Danielle and Kyle. Never empty: with nothing set, the default applies.
export function moneyAccessList(env = process.env) {
  const named = String(env.MONEY_ACCESS_EMAILS || '').split(/[,\s;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return named.length ? named : DEFAULT_MONEY_ACCESS;
}
export function moneyAllowed(email, env = process.env) {
  const e = String(email || '').trim().toLowerCase(); if (!e) return false;
  return moneyAccessList(env).some(a => (a.startsWith('@') ? e.endsWith(a) : e === a));
}

// ---------- dates ----------
const iso = d => { const v = d instanceof Date ? d : new Date(d); return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10); };
// Accepts 2026-03-15, 3/15/2026, 03/15/26, 3.15.26 and a Date. Returns YYYY-MM-DD or null.
export function parseDate(v) {
  if (v instanceof Date) return iso(v);
  const s = String(v ?? '').trim(); if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s); if (m) return fmt(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/.exec(s); if (m) return fmt(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  return null;
}
function fmt(y, mo, d) { const t = new Date(Date.UTC(y, mo - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null; }
export const addDays = (isoDate, n) => { const d = new Date(`${isoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function dueFromTerms(issuedOn, terms) {
  const m = /^net\s*(\d+)$/i.exec(String(terms || '').trim());
  return m ? addDays(issuedOn, Number(m[1])) : issuedOn;
}

// ---------- an invoice and how it adds up ----------
// lines: [{ description, qty, rateCents }]. credits: [{ label, amountCents }] (a deposit already paid). dueNowCents overrides the balance when only part is due now.
export function invoiceTotals({ lines = [], taxRatePct = 0, chargeTax = false, credits = [], dueNowCents = null } = {}) {
  const subtotalCents = lines.reduce((a, l) => a + Math.round(Number(l.qty) * Number(l.rateCents)), 0);
  const taxCents = chargeTax ? Math.round(subtotalCents * Number(taxRatePct) / 100) : 0;
  const totalCents = subtotalCents + taxCents, creditsCents = credits.reduce((a, c) => a + Number(c.amountCents || 0), 0);
  const balanceCents = Math.max(0, totalCents - creditsCents);
  return { subtotalCents, taxCents, totalCents, creditsCents, balanceCents, dueNowCents: dueNowCents == null ? balanceCents : Math.min(Number(dueNowCents), balanceCents) };
}

// A form (or an import row) → { value } or { error }. `today` is the default issue date.
export function cleanInvoice(input = {}, { today = iso(new Date()) } = {}) {
  const i = input && typeof input === 'object' ? input : {}, company = clip(i.company, 200);
  if (!company) return { error: 'Say who the invoice is for (the company)' };
  const issuedOn = parseDate(i.issuedOn) || (i.issuedOn ? null : today); if (!issuedOn) return { error: 'The invoice date is not a date I can read (use 2026-03-15 or 3/15/2026)' };
  const terms = clip(i.terms, 40) || 'Due on receipt';
  const dueOn = i.dueOn ? parseDate(i.dueOn) : dueFromTerms(issuedOn, terms); if (!dueOn) return { error: 'The due date is not a date I can read' };
  if (dueOn < issuedOn) return { error: 'The due date is before the invoice date' };
  const lines = [];
  for (const l of Array.isArray(i.lines) ? i.lines : []) {
    const description = clipLines(l.description, 300); if (!description && !Number(l.qty) && !Number(l.rateCents)) continue;
    const qty = Number(l.qty ?? 1), rateCents = Number.isFinite(Number(l.rateCents)) ? Math.round(Number(l.rateCents)) : toCents(l.rate);
    if (!description) return { error: 'Every line needs a description' };
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e7) return { error: `“${description.slice(0, 40)}”: the quantity must be more than 0` };
    if (!Number.isFinite(rateCents) || rateCents < 0 || rateCents > 1e11) return { error: `“${description.slice(0, 40)}”: the rate is not an amount` };
    lines.push({ description, qty, rateCents });
  }
  if (!lines.length) return { error: 'Add at least one line: what it is for and the amount' };
  if (lines.length > 200) return { error: 'An invoice can have 200 lines at most' };
  const taxRatePct = i.taxRatePct === undefined || i.taxRatePct === '' ? 0 : Number(i.taxRatePct); if (!Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 30) return { error: 'The tax rate is 0 to 30 percent' };
  const credits = [];
  for (const c of Array.isArray(i.credits) ? i.credits : []) {
    const label = clip(c.label, 80), amountCents = Number.isFinite(Number(c.amountCents)) ? Math.round(Number(c.amountCents)) : toCents(c.amount); if (!label && !amountCents) continue;
    if (!label || !Number.isFinite(amountCents) || amountCents <= 0) return { error: 'A deposit or credit needs a label (“Deposit paid 3/9”) and an amount' };
    credits.push({ label, amountCents });
  }
  const workKind = ['product', 'software'].includes(i.workKind) ? i.workKind : '', projectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(i.projectId || '')) ? String(i.projectId) : null;
  const chargeTax = i.chargeTax === true || i.chargeTax === 'true';
  const t = invoiceTotals({ lines, taxRatePct, chargeTax, credits, dueNowCents: i.dueNowCents === undefined || i.dueNowCents === null || i.dueNowCents === '' ? null : Math.round(Number(i.dueNowCents)) });
  if (t.creditsCents > t.totalCents) return { error: 'The deposits and credits are more than the invoice total' };
  if (i.dueNowCents !== undefined && i.dueNowCents !== null && i.dueNowCents !== '' && (!Number.isFinite(Number(i.dueNowCents)) || Number(i.dueNowCents) < 0)) return { error: 'The amount due now is not an amount' };
  return { value: { number: clip(i.number, 40), company, contactName: clip(i.contactName, 120), contactEmail: clip(i.contactEmail, 200).toLowerCase(), address: clipLines(i.address, 400), issuedOn, terms, dueOn,
    lines, taxRatePct, chargeTax, credits, dueNowLabel: clip(i.dueNowLabel, 40) || (credits.length ? 'Final payment due' : 'Total due'), notes: clipLines(i.notes, 1000), currency: /^[A-Z]{3}$/.test(String(i.currency || 'USD').toUpperCase()) ? String(i.currency || 'USD').toUpperCase() : 'USD', workKind, projectId, ...t } };
}

// 11106 → 11107. Numbers that are not plain integers are ignored; with none, start at 1001.
export function nextInvoiceNumber(existing = []) {
  const nums = existing.map(n => /^\d+$/.test(String(n).trim()) ? Number(n) : NaN).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : 1001);
}

// ---------- paid, owed, overdue ----------
// An invoice row with its payments → what is still owed and where it stands today.
export function invoiceState(inv, paidCents = 0, today = iso(new Date())) {
  const total = Number(inv.total_cents ?? inv.totalCents ?? 0), credits = (inv.credits || []).reduce((a, c) => a + Number(c.amountCents || 0), 0);
  const owed = Math.max(0, total - credits - Number(paidCents || 0)), status = inv.status;
  if (['void', 'draft', 'unrecorded'].includes(status)) return { owedCents: status === 'void' ? 0 : owed, state: status, overdue: false, daysOverdue: 0 };
  if (status === 'paid' || owed === 0) return { owedCents: 0, state: 'paid', overdue: false, daysOverdue: 0 };
  const due = inv.due_on ? iso(inv.due_on) : inv.dueOn || null, days = due && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000) : 0;
  return { owedCents: owed, state: days > 0 ? 'overdue' : paidCents > 0 ? 'part-paid' : 'open', overdue: days > 0, daysOverdue: days };
}
// Receivables by how late: current, 1-30, 31-60, 61-90, over 90. Only invoices that are open (sent, not paid) count.
export function aging(items, today = iso(new Date())) {
  const buckets = [['current', 'Not yet due'], ['d30', '1 to 30 days late'], ['d60', '31 to 60'], ['d90', '61 to 90'], ['over', 'Over 90']].map(([key, label]) => ({ key, label, cents: 0, count: 0 }));
  for (const it of items) {
    if (!it.owedCents) continue; const d = it.daysOverdue || 0, b = d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4;
    buckets[b].cents += it.owedCents; buckets[b].count++;
  }
  return buckets;
}

// ---------- a CSV of past invoices ----------
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false; const s = String(text || '').replace(/^﻿/, '');
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '"') { if (s[k + 1] === '"') { cell += '"'; k++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[k + 1] === '\n') k++; row.push(cell); cell = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
const HEADERS = { number: ['number', 'invoice', 'invoice number', 'invoice no', 'invoice #', 'no', '#'], issuedOn: ['date', 'invoice date', 'issued', 'issued on'], dueOn: ['due', 'due date', 'due on'], terms: ['terms', 'payment terms'], company: ['company', 'customer', 'client', 'bill to', 'name'],
  contactName: ['contact', 'contact name', 'attn', 'attention'], contactEmail: ['email', 'contact email'], address: ['address', 'billing address'], description: ['description', 'services', 'service', 'item', 'memo'], qty: ['qty', 'quantity'], rate: ['rate', 'unit price', 'price'], amount: ['amount', 'total', 'invoice total', 'subtotal'],
  taxRate: ['tax rate', 'tax %', 'tax rate %'], tax: ['tax', 'tax amount'], deposit: ['deposit', 'deposit paid', 'credit'], depositLabel: ['deposit label', 'credit label'], dueNow: ['due now', 'amount due now'], dueNowLabel: ['due now label'],
  notes: ['notes', 'note'], status: ['status', 'paid?', 'state'], paidOn: ['paid', 'paid on', 'paid date', 'date paid'] };
// Rows with the same invoice number become the lines of one invoice. Returns { invoices: [{ line, value }], errors: [{ line, error }] }.
export function parseInvoiceCsv(text, { today = iso(new Date()) } = {}) {
  const rows = parseCsv(text); if (rows.length < 2) return { invoices: [], errors: [{ line: 1, error: 'The file needs a header row and at least one invoice' }] };
  const head = rows[0].map(h => h.trim().toLowerCase()), col = {};
  for (const [key, names] of Object.entries(HEADERS)) { const k = head.findIndex(h => names.includes(h)); if (k >= 0) col[key] = k; }
  if (col.company === undefined || (col.amount === undefined && col.rate === undefined)) return { invoices: [], errors: [{ line: 1, error: 'I need at least a company column and an amount column (headers like Company, Description, Amount)' }] };
  const get = (r, key) => (col[key] === undefined ? '' : String(r[col[key]] ?? '').trim());
  // tax, a deposit already paid and the amount due now, read from the first row of an invoice
  const money = key => { const v = get(r0, key); return v ? toCents(v) : NaN; };
  let r0 = null;
  const extras = r => { r0 = r; const rate = get(r, 'taxRate') ? Number(String(get(r, 'taxRate')).replace('%', '')) : 0, tax = money('tax'), dep = money('deposit'), dn = money('dueNow');
    return { taxRatePct: Number.isFinite(rate) ? rate : 0, chargeTax: Number.isFinite(tax) && tax > 0, credits: Number.isFinite(dep) && dep > 0 ? [{ label: get(r, 'depositLabel') || 'Deposit paid', amountCents: dep }] : [], dueNowCents: Number.isFinite(dn) ? dn : null, dueNowLabel: get(r, 'dueNowLabel') || undefined }; };
  const groups = new Map(), errors = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2, number = get(r, 'number'), key = number || `__row${line}`;
    const amountCents = get(r, 'amount') ? toCents(get(r, 'amount')) : NaN, rateCents = get(r, 'rate') ? toCents(get(r, 'rate')) : NaN, qty = get(r, 'qty') ? Number(get(r, 'qty')) : 1;
    const l = Number.isFinite(rateCents) ? { description: get(r, 'description') || 'Services', qty, rateCents } : Number.isFinite(amountCents) ? { description: get(r, 'description') || 'Services', qty: 1, rateCents: amountCents } : null;
    if (!l) { errors.push({ line, error: 'No amount on this row' }); return; }
    const g = groups.get(key) || { line, number, rows: [], first: r }; g.rows.push(l); groups.set(key, g);
  });
  const invoices = [];
  for (const g of groups.values()) {
    const r = g.first, st = get(r, 'status').toLowerCase(), paidOn = parseDate(get(r, 'paidOn'));
    const status = paidOn || /^(paid|yes|y|settled)$/.test(st) ? 'paid' : /^(unpaid|open|sent|no|n|due)$/.test(st) ? 'sent' : /^void/.test(st) ? 'void' : 'unrecorded';
    const c = cleanInvoice({ number: g.number, company: get(r, 'company'), contactName: get(r, 'contactName'), contactEmail: get(r, 'contactEmail'), address: get(r, 'address'), issuedOn: get(r, 'issuedOn') || undefined, dueOn: get(r, 'dueOn') || undefined, terms: get(r, 'terms') || undefined, notes: get(r, 'notes'), lines: g.rows, ...extras(r) }, { today });
    if (c.error) errors.push({ line: g.line, error: `${g.number ? `Invoice ${g.number}: ` : ''}${c.error}` }); else invoices.push({ line: g.line, status, paidOn, value: c.value });
  }
  return { invoices, errors };
}
