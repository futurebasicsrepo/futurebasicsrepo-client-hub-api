// The Sales OS: the rules that do not need a database or a browser (what a contact, deal and task are allowed to be, how warm a lead is, what the pipeline is worth).
// Routes and storage are in sales-routes.js; the staff page is sales.html.

export const STAGES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost'];
export const OPEN_STAGES = ['new', 'contacted', 'meeting', 'proposal'];
export const STAGE_LABELS = { new: 'New', contacted: 'Contacted', meeting: 'Meeting', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
// how likely each open stage is to close, for the forecast (a starting point to tune, not a promise)
export const STAGE_ODDS = { new: 0.1, contacted: 0.2, meeting: 0.4, proposal: 0.6, won: 1, lost: 0 };
export const SOURCES = ['manual', 'showcase', 'website', 'referral', 'outbound', 'event', 'hub', 'import', 'inbound'];
export const ACTIVITY_KINDS = ['note', 'call', 'meeting', 'email_in', 'email_out', 'stage', 'showcase_view', 'showcase_demo', 'task', 'system'];
export const MANUAL_KINDS = ['note', 'call', 'meeting', 'email_in', 'email_out']; // what a person can log by hand

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clipBlock = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const cleanEmail = v => { const e = String(v ?? '').trim().toLowerCase(); return e && e.length <= 254 && EMAIL_RE.test(e) ? e : ''; };
const tags = v => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map(t => clip(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10);
const day = v => { const s = String(v ?? '').trim(); if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return undefined; const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`); return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? undefined : `${m[1]}-${m[2]}-${m[3]}`; };

// → { value } or { error }. A contact needs a name or an email to be findable.
export function cleanContact(input = {}, { partial = false } = {}) {
  const i = input && typeof input === 'object' ? input : {}, out = {}, has = k => !partial || k in i;
  if (has('email')) { const raw = String(i.email ?? '').trim(); out.email = cleanEmail(raw); if (raw && !out.email) return { error: `“${clip(raw, 40)}” is not an email address` }; }
  if (has('name')) out.name = clip(i.name, 120);
  if (!partial && !out.name && !out.email) return { error: 'A contact needs a name or an email address' };
  if (has('phone')) out.phone = clip(i.phone, 40);
  if (has('title')) out.title = clip(i.title, 80);
  if (has('companyName')) out.companyName = clip(i.companyName, 120);
  if (has('source')) out.source = SOURCES.includes(i.source) ? i.source : 'manual';
  if (has('tags')) out.tags = tags(i.tags);
  if (has('notes')) out.notes = clipBlock(i.notes, 4000);
  if (has('emailOk')) out.email_ok = i.emailOk !== false && i.emailOk !== 'false';
  return { value: out };
}

export function cleanDeal(input = {}, { partial = false } = {}) {
  const i = input && typeof input === 'object' ? input : {}, out = {}, has = k => !partial || k in i;
  if (has('title')) { out.title = clip(i.title, 140); if (!out.title) return { error: 'A deal needs a title' }; }
  if (i.stage !== undefined) { if (!STAGES.includes(i.stage)) return { error: `Stage must be one of ${STAGES.join(', ')}` }; out.stage = i.stage; }
  else if (!partial) out.stage = 'new';
  if (has('valueCents') || has('value')) {
    const raw = i.valueCents ?? (i.value === undefined || i.value === '' ? 0 : Math.round(Number(String(i.value).replace(/[$,\s]/g, '')) * 100));
    const n = Number(raw); if (!Number.isFinite(n) || n < 0 || n > 1e10) return { error: 'The value must be an amount of money, zero or more' }; out.value_cents = Math.round(n);
  }
  if (has('expectedClose')) { const d = day(i.expectedClose); if (d === undefined) return { error: 'Expected close should be a date (YYYY-MM-DD)' }; out.expected_close = d; }
  if (has('source')) out.source = SOURCES.includes(i.source) ? i.source : 'manual';
  if (has('lostReason')) out.lost_reason = clip(i.lostReason, 200);
  if (out.stage === 'lost' && !out.lost_reason && !i.keepLostReason) return { error: 'Say why it was lost; it is what makes the next pitch better', needsReason: true };
  return { value: out };
}

export function cleanTask(input = {}, { partial = false } = {}) {
  const i = input && typeof input === 'object' ? input : {}, out = {}, has = k => !partial || k in i;
  if (has('title')) { out.title = clip(i.title, 200); if (!out.title) return { error: 'A task needs a title' }; }
  if (has('dueAt')) { const s = String(i.dueAt ?? '').trim(); if (!s) out.due_at = null; else { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T09:00:00Z' : s); if (Number.isNaN(d.getTime())) return { error: 'The due date is not a date' }; out.due_at = d.toISOString(); } }
  if (has('done')) out.done = i.done === true || i.done === 'true';
  return { value: out };
}

export function cleanActivity(input = {}) {
  const kind = MANUAL_KINDS.includes(input?.kind) ? input.kind : 'note', text = clipBlock(input?.text, 4000);
  return text ? { value: { kind, text } } : { error: 'Write what happened' };
}

// How warm a contact is, from what they did and how recently. Each event counts for its weight and halves every week.
const HEAT_WEIGHT = { showcase_demo: 5, showcase_view: 2, email_in: 6, meeting: 4, call: 3 };
export function heat(events, now = Date.now()) {
  let score = 0, last = 0;
  for (const e of events || []) {
    const w = HEAT_WEIGHT[e.kind]; if (!w) continue;
    const at = new Date(e.at).getTime(); if (!Number.isFinite(at) || at > now + 60_000) continue;
    score += w * Math.pow(0.5, Math.max(0, now - at) / (7 * 86400_000)); last = Math.max(last, at);
  }
  const rounded = Math.round(score * 10) / 10;
  return { score: rounded, level: !last ? 'none' : rounded >= 6 ? 'hot' : rounded >= 1.5 ? 'warm' : 'cold', lastAt: last ? new Date(last).toISOString() : null };
}

export const staleDays = (lastActivityAt, now = Date.now()) => { const t = new Date(lastActivityAt).getTime(); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400_000)) : 0; };

// deals: [{ stage, value_cents }] → per stage counts and money, and what is open and weighted by the odds
export function pipelineSummary(deals) {
  const stages = STAGES.map(stage => ({ stage, label: STAGE_LABELS[stage], count: 0, valueCents: 0 }));
  for (const d of deals || []) { const s = stages.find(x => x.stage === d.stage); if (s) { s.count++; s.valueCents += Number(d.value_cents) || 0; } }
  const open = stages.filter(s => OPEN_STAGES.includes(s.stage));
  return { stages, openCount: open.reduce((n, s) => n + s.count, 0), openValueCents: open.reduce((n, s) => n + s.valueCents, 0), forecastCents: Math.round(open.reduce((n, s) => n + s.valueCents * STAGE_ODDS[s.stage], 0)), wonCents: stages.find(s => s.stage === 'won').valueCents };
}

// the next weekday at 09:00 UTC after `from` (a follow-up is due the next working day, not on a Sunday)
export function nextBusinessDay(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1, 9, 0, 0));
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// a small, forgiving CSV reader for pasted lists (quotes, commas inside quotes, CRLF). → rows of objects keyed by lower-cased header
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false; const s = String(text ?? '').replace(/^﻿/, '');
  for (let n = 0; n < s.length; n++) {
    const c = s[n];
    if (q) { if (c === '"') { if (s[n + 1] === '"') { cell += '"'; n++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[n + 1] === '\n') n++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => String(x).trim()));
  if (!head) return [];
  const keys = head.map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? '').trim()]).filter(([k]) => k)));
}
