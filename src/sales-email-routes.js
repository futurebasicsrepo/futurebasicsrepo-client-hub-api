// Sales email routes (see sales-email.js for the rules). The pipe is Resend; this file decides who is emailed, remembers everything, and reacts to what comes back.
//
//   staff   GET|PUT /v1/sales/email/settings   POST /v1/sales/email/test   GET|POST|PUT|DELETE /v1/sales/templates
//           GET /v1/sales/contacts/:id/email-check   POST /v1/sales/contacts/:id/email-preview   POST /v1/sales/contacts/:id/email   GET /v1/sales/emails/:id
//   public  GET|POST /u/:token  (unsubscribe; the POST is also the one-click List-Unsubscribe target)   POST /webhooks/resend  (signed)
import { cleanEmail } from './sales.js';
import { fireTrigger, stopRuns } from './sales-automations-engine.js';
import { renderTemplate, firstNameOf, buildMessage, unsubscribeToken, readUnsubscribeToken, verifyWebhook, parseAddress, looksLikeOptOut, isAutoReply, stripQuoted, htmlToText, relationship, canEmail, MERGE_FIELDS, STARTER_TEMPLATES } from './sales-email.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULTS = { fromName: 'Kyle at Future Basics', fromAddress: 'kyle@mail.thefuturebasics.com', postalAddress: '', dailyCap: 60 };
const DAY_START = `(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;
const maskEmail = e => { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(6, u.length - 1)))}@${d}` : ''; };
const page = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{margin:0;background:#f5f5f2;color:#141416;font:16px/1.55 Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px}main{background:#fff;border:1px solid #e3e3e0;border-radius:22px;padding:34px;max-width:460px;width:100%}h1{font-size:24px;margin:0 0 10px;font-weight:600}p{margin:0 0 16px;color:#444}button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:13px 22px;background:#141416;color:#fff;cursor:pointer}small{color:#717177}</style></head><body><main>${inner}<p style="margin:22px 0 0"><small>Future Basics</small></p></main></body></html>`;

export async function seedTemplates(pool) {
  if (Number((await pool.query('select count(*) n from sales_templates')).rows[0].n)) return 0;
  for (const t of STARTER_TEMPLATES) await pool.query('insert into sales_templates(name,subject,body) values($1,$2,$3)', [t.name, t.subject, t.body]);
  return STARTER_TEMPLATES.length;
}

export function registerSalesEmailRoutes(app, d) {
  const { pool, authenticate, adminOnly, secret, getSetting, setSetting, sendHubEmail, hubEmailShell, emailEscape, notifyTo, publicUrl, workUrl, log = console, fetchImpl = fetch } = d;
  const pre = [authenticate, adminOnly], env = () => process.env;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const apiKey = () => env().SALES_RESEND_API_KEY || env().RESEND_API_KEY || '';
  const apiOrigin = () => String(env().RESEND_API_ORIGIN || 'https://api.resend.com').replace(/\/$/, '');
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);

  // ---------- settings ----------
  async function settings() { const stored = (await getSetting('salesEmail')) || {}; return { ...DEFAULTS, ...(env().SALES_FROM_ADDRESS ? { fromAddress: env().SALES_FROM_ADDRESS } : {}), ...(env().SALES_POSTAL_ADDRESS ? { postalAddress: env().SALES_POSTAL_ADDRESS } : {}), ...(env().SALES_DAILY_CAP ? { dailyCap: Number(env().SALES_DAILY_CAP) || DEFAULTS.dailyCap } : {}), ...stored }; }
  const sentToday = async () => Number((await pool.query(`select count(*) n from sales_emails where direction='out' and status <> 'failed' and created_at >= ${DAY_START}`)).rows[0].n);
  app.get('/v1/sales/email/settings', { preHandler: pre }, async () => { const s = await settings(), n = await sentToday(); return { settings: s, configured: { sending: Boolean(apiKey()), webhook: Boolean(env().RESEND_WEBHOOK_SECRET) }, sentToday: n, remaining: Math.max(0, s.dailyCap - n), webhookUrl: `${publicUrl}/webhooks/resend` }; });
  app.put('/v1/sales/email/settings', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, cur = await settings(), next = { ...cur };
    if ('fromName' in b) next.fromName = String(b.fromName || '').replace(/[\r\n<>"]/g, ' ').trim().slice(0, 80);
    if ('fromAddress' in b) { const a = cleanEmail(b.fromAddress); if (!a) return bad(reply, 'The from address is not an email address'); next.fromAddress = a; }
    if ('postalAddress' in b) next.postalAddress = String(b.postalAddress || '').replace(/\r/g, '').trim().slice(0, 300);
    if ('dailyCap' in b) { const n = Math.round(Number(b.dailyCap)); if (!Number.isFinite(n) || n < 1 || n > 500) return bad(reply, 'The daily limit should be between 1 and 500'); next.dailyCap = n; }
    await setSetting('salesEmail', next); return { ok: true, settings: next };
  });

  // ---------- the pipe ----------
  async function resendSend({ from, to, subject, text, html, headers, idempotencyKey, tags }) {
    const r = await fetchImpl(`${apiOrigin()}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, body: JSON.stringify({ from, to: [to], subject, text, html, headers, ...(tags ? { tags } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.message || j.error?.message || `Resend answered ${r.status}`), { status: r.status });
    return j.id || null;
  }
  const fromHeader = s => `${s.fromName ? `${s.fromName.replace(/[",<>]/g, '')} ` : ''}<${s.fromAddress}>`.trim();

  // ---------- what we know about a contact, for deciding ----------
  async function facts(id) {
    const c = (await pool.query(`select c.*, co.name company_name from sales_contacts c left join sales_companies co on co.id=c.company_id where c.id=$1`, [id])).rows[0]; if (!c) return null;
    const kinds = (await pool.query(`select distinct kind from sales_activities where contact_id=$1`, [id])).rows.map(r => r.kind);
    const invited = (await pool.query(`select 1 from sales_activities where contact_id=$1 and meta->>'invite'='true' limit 1`, [id])).rowCount > 0;
    const sup = (await pool.query('select reason from sales_suppressions where email=$1', [String(c.email || '').toLowerCase()])).rows[0]?.reason || null;
    const build = (await pool.query(`select b.name from sales_activities a join builds b on b.id = (a.meta->>'buildId')::uuid where a.contact_id=$1 and a.kind in ('showcase_view','showcase_demo') and a.meta->>'buildId' ~ '^[0-9a-f-]{36}$' order by a.created_at desc limit 1`, [id]).catch(() => ({ rows: [] }))).rows[0]?.name || '';
    return { c, contact: { email: c.email, unsubscribed: Boolean(c.unsubscribed_at), emailOk: c.email_ok }, rel: relationship({ clientId: c.client_id, kinds, invited }), suppressed: sup, build };
  }
  async function senderFirstName(req, s) { const u = UUID.test(String(req.auth?.sub || '')) ? (await pool.query('select name from users where id=$1', [req.auth.sub])).rows[0] : null; return firstNameOf(u?.name) || firstNameOf(s.fromName) || 'Kyle'; }
  const varsFor = (f, sender) => ({ first_name: firstNameOf(f.c.name), name: f.c.name, company: f.c.company_name || '', build: f.build, sender });
  const render = (subject, body, vars) => { const s = renderTemplate(subject, vars), b = renderTemplate(body, vars); return { subject: s.text, body: b.text, missing: [...new Set([...s.missing, ...b.missing])], unknown: [...new Set([...s.unknown, ...b.unknown])] }; };

  app.get('/v1/sales/contacts/:id/email-check', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const f = await facts(req.params.id); if (!f) return bad(reply, 'Not found', 404);
    const s = await settings(), n = await sentToday(), verdict = canEmail({ contact: f.contact, suppressed: f.suppressed, rel: f.rel, confirmed: req.query?.confirmed === 'true', settings: s, sentToday: n, configured: Boolean(apiKey()) });
    return { ...verdict, relationship: f.rel, remainingToday: Math.max(0, s.dailyCap - n), from: fromHeader(s), to: f.c.email };
  });
  app.post('/v1/sales/contacts/:id/email-preview', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const f = await facts(req.params.id); if (!f) return bad(reply, 'Not found', 404);
    const s = await settings(), r = render(String(req.body?.subject || ''), String(req.body?.body || ''), varsFor(f, await senderFirstName(req, s)));
    return { subject: r.subject, body: r.body, missing: r.missing, unknown: r.unknown };
  });

  // ---------- doing the opt-out (a link, a reply, a bounce, a complaint) ----------
  async function suppress(email, reason, detail = '') {
    const e = String(email || '').trim().toLowerCase(); if (!e) return;
    await pool.query(`insert into sales_suppressions(email,reason,detail) values($1,$2,$3) on conflict (email) do nothing`, [e, reason, String(detail).slice(0, 300)]);
    const rows = (await pool.query(`update sales_contacts set email_ok=false, unsubscribed_at = case when $2='unsubscribed' then coalesce(unsubscribed_at, now()) else unsubscribed_at end, updated_at=now() where lower(email)=$1 returning id`, [e, reason])).rows;
    for (const r of rows) await pool.query(`insert into sales_activities(contact_id,kind,text) values($1,'system',$2)`, [r.id, { unsubscribed: `Unsubscribed${detail ? ` (${detail})` : ''}. No more email.`, bounced: `Email to this address bounced${detail ? `: ${detail}` : ''}. No more email.`, complained: 'Marked an email as spam. No more email.', manual: 'Marked as not to be emailed' }[reason] || 'Marked as not to be emailed']);
    for (const r of rows) await stopRuns(pool, { contactId: r.id, reason: { unsubscribed: 'they opted out', bounced: 'their address bounced', complained: 'they marked an email as spam', manual: 'they are marked as not to be emailed' }[reason] || 'they cannot be emailed' }); // nothing waiting may write to them now
  }

  // ---------- sending ----------
  // One place that sends a contact an email, for the staff page and for automations. → { ok, id, remaining } or { ok: false, status, error, extra }
  async function sendToContact(contactId, { subject, body, confirmed = false, actorId = null, sender = null, via = null }) {
    const fail = (status, error, extra = {}) => ({ ok: false, status, error, extra });
    const f = await facts(contactId); if (!f) return fail(404, 'Not found');
    const s = await settings(), from = sender || firstNameOf(s.fromName) || 'Kyle';
    const r = render(String(subject || ''), String(body || ''), varsFor(f, from));
    if (!r.subject.trim()) return fail(422, 'Add a subject');
    if (!r.body.trim()) return fail(422, 'Write the message');
    if (r.unknown.length) return fail(422, `Unknown field ${r.unknown.map(x => `{{${x}}}`).join(', ')}. You can use ${MERGE_FIELDS.map(x => `{{${x}}}`).join(', ')}.`);
    if (r.missing.length) return fail(422, `We do not have ${r.missing.map(x => ({ first_name: 'their first name', name: 'their name', company: 'their company', build: 'a build they looked at', sender: 'your name' }[x] || x)).join(' or ')} for this contact. Fill it in or remove ${r.missing.map(x => `{{${x}}}`).join(', ')} from the message.`);
    const n = await sentToday(), verdict = canEmail({ contact: f.contact, suppressed: f.suppressed, rel: f.rel, confirmed, settings: s, sentToday: n, configured: Boolean(apiKey()) });
    if (!verdict.ok) return fail(verdict.needsConfirmation && verdict.reasons.length === 1 ? 409 : 422, verdict.reasons[0], { reasons: verdict.reasons, needsConfirmation: verdict.needsConfirmation });
    const msg = buildMessage({ subject: r.subject, body: r.body, senderName: from, postalAddress: s.postalAddress, unsubscribeUrl: `${publicUrl}/u/${unsubscribeToken(f.c.id, secret)}` });
    const row = (await pool.query(`insert into sales_emails(contact_id,direction,subject,body_text,body_html,from_address,to_address,status,sent_by) values($1,'out',$2,$3,$4,$5,$6,'sending',$7) returning id`, [f.c.id, msg.subject, r.body.trim(), msg.html, fromHeader(s), f.c.email, actorId])).rows[0];
    try {
      const resendId = await resendSend({ from: fromHeader(s), to: f.c.email, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers, idempotencyKey: row.id, tags: [{ name: 'source', value: via ? 'sales-automation' : 'sales-crm' }] });
      await pool.query(`update sales_emails set status='sent', resend_id=$2 where id=$1`, [row.id, resendId]);
    } catch (e) {
      await pool.query(`update sales_emails set status='failed', error=$2 where id=$1`, [row.id, String(e.message).slice(0, 300)]);
      log.warn?.({ err: e.message }, 'sales email not sent');
      return fail(502, `The email did not go: ${e.message}`);
    }
    if (!f.rel.ok && confirmed) await pool.query(`insert into sales_activities(contact_id,kind,text,actor_id) values($1,'system','Emailed after staff confirmed they know us',$2)`, [f.c.id, actorId]);
    await pool.query(`insert into sales_activities(contact_id,kind,text,meta,actor_id) values($1,'email_out',$2,$3::jsonb,$4)`, [f.c.id, msg.subject, JSON.stringify({ emailId: row.id, ...(via ? { automation: via } : {}) }), actorId]);
    await pool.query(`update sales_contacts set last_activity_at=now() where id=$1`, [f.c.id]);
    return { ok: true, id: row.id, remaining: Math.max(0, s.dailyCap - n - 1), subject: msg.subject };
  }
  // what an automation needs to know before it sends: would this go, and why not
  async function checkContact(contactId) {
    const f = await facts(contactId); if (!f) return null;
    const s = await settings(), n = await sentToday();
    return { ...canEmail({ contact: f.contact, suppressed: f.suppressed, rel: f.rel, confirmed: false, settings: s, sentToday: n, configured: Boolean(apiKey()) }), relationship: f.rel, capReached: Number(s.dailyCap) > 0 && n >= Number(s.dailyCap), systemBlocked: !apiKey() || !String(s.postalAddress || '').trim() || !String(s.fromAddress || '').trim() };
  }
  app.post('/v1/sales/contacts/:id/email', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const s = await settings(), r = await sendToContact(req.params.id, { subject: req.body?.subject, body: req.body?.body, confirmed: req.body?.confirmRelationship === true, actorId: actorOf(req), sender: await senderFirstName(req, s) });
    if (!r.ok) return reply.code(r.status).send({ error: r.error, ...r.extra });
    return reply.code(201).send({ id: r.id, remainingToday: r.remaining });
  });
  app.post('/v1/sales/email/test', { preHandler: pre }, async (req, reply) => {
    const u = UUID.test(String(req.auth?.sub || '')) ? (await pool.query('select email from users where id=$1', [req.auth.sub])).rows[0] : null, to = cleanEmail(u?.email || req.auth?.email);
    if (!to) return bad(reply, 'Your own email address is not on your account');
    if (!apiKey()) return bad(reply, 'Email sending is not switched on yet (the service needs its Resend key).');
    const s = await settings(); if (!s.postalAddress.trim()) return bad(reply, 'Add your business mailing address first. Commercial email must carry one.');
    const msg = buildMessage({ subject: '[Test] This is how a Future Basics email looks', body: 'Hi,\n\nThis is a test of the sales email setup. If you can read this, sending works, and the footer below is what everyone gets, including a working unsubscribe link.\n\nKyle', senderName: await senderFirstName(req, s), postalAddress: s.postalAddress, unsubscribeUrl: `${publicUrl}/u/test` });
    try { await resendSend({ from: fromHeader(s), to, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers }); } catch (e) { return bad(reply, `The test email did not go: ${e.message}`, 502); }
    return { ok: true, to };
  });
  app.get('/v1/sales/emails/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const e = (await pool.query(`select id,contact_id,direction,subject,body_text,from_address,to_address,status,error,created_at from sales_emails where id=$1`, [req.params.id])).rows[0];
    return e ? { email: e } : bad(reply, 'Not found', 404);
  });

  // ---------- templates ----------
  const cleanTemplate = b => {
    const name = String(b?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80), subject = String(b?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200), body = String(b?.body || '').replace(/\r/g, '').trim().slice(0, 8000);
    if (!name) return { error: 'Give the template a name' };
    const unknown = renderTemplate(subject + ' ' + body, {}).unknown; if (unknown.length) return { error: `Unknown field ${unknown.map(x => `{{${x}}}`).join(', ')}. You can use ${MERGE_FIELDS.map(x => `{{${x}}}`).join(', ')}.` };
    return { value: { name, subject, body } };
  };
  app.get('/v1/sales/templates', { preHandler: pre }, async () => ({ templates: (await pool.query('select id,name,subject,body from sales_templates order by created_at')).rows, fields: MERGE_FIELDS }));
  app.post('/v1/sales/templates', { preHandler: pre }, async (req, reply) => { const t = cleanTemplate(req.body); if (t.error) return bad(reply, t.error); return reply.code(201).send({ id: (await pool.query('insert into sales_templates(name,subject,body) values($1,$2,$3) returning id', [t.value.name, t.value.subject, t.value.body])).rows[0].id }); });
  app.put('/v1/sales/templates/:id', { preHandler: pre }, async (req, reply) => { if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404); const t = cleanTemplate(req.body); if (t.error) return bad(reply, t.error); return (await pool.query('update sales_templates set name=$2,subject=$3,body=$4,updated_at=now() where id=$1', [req.params.id, t.value.name, t.value.subject, t.value.body])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });
  app.delete('/v1/sales/templates/:id', { preHandler: pre }, async (req, reply) => { if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404); return (await pool.query('delete from sales_templates where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });

  // ---------- the unsubscribe page and the one-click target ----------
  const html = (reply, code, title, inner) => reply.code(code).header('cache-control', 'no-store').type('text/html').send(page(title, inner));
  app.get('/u/:token', async (req, reply) => {
    const id = readUnsubscribeToken(req.params.token, secret); if (!id) return html(reply, 404, 'Link not valid', '<h1>This link is not valid</h1><p>If you want to stop getting email from us, reply to any message and say so, and we will stop.</p>');
    const c = (await pool.query('select email,unsubscribed_at from sales_contacts where id=$1', [id])).rows[0];
    if (!c || c.unsubscribed_at) return html(reply, 200, 'Unsubscribed', '<h1>You are unsubscribed</h1><p>You will not get any more email from us.</p>');
    return html(reply, 200, 'Unsubscribe', `<h1>Stop emails from Future Basics?</h1><p>This will stop all email to ${emailEscape(maskEmail(c.email))}.</p><form method="post" action="/u/${emailEscape(req.params.token)}"><button type="submit">Unsubscribe</button></form>`);
  });
  app.post('/u/:token', async (req, reply) => {
    const id = readUnsubscribeToken(req.params.token, secret); if (!id) return html(reply, 404, 'Link not valid', '<h1>This link is not valid</h1><p>Reply to any message and tell us, and we will stop.</p>');
    const c = (await pool.query('select email from sales_contacts where id=$1', [id])).rows[0];
    if (c?.email) await suppress(c.email, 'unsubscribed', 'by link');
    return html(reply, 200, 'Unsubscribed', '<h1>You are unsubscribed</h1><p>You will not get any more email from us. Sorry to see you go.</p>');
  });

  // ---------- Resend tells us what happened ----------
  async function fetchReceived(id) {
    const r = await fetchImpl(`${apiOrigin()}/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (r.status >= 500) throw new Error(`Resend answered ${r.status}`);
    return r.ok ? await r.json().catch(() => ({})) : null;
  }
  async function handleInbound(data) {
    const id = data.email_id || data.id; if (!id) return;
    if ((await pool.query(`select 1 from sales_emails where direction='in' and resend_id=$1`, [id])).rowCount) return;
    const from = parseAddress(data.from); if (!from.email) return;
    const s = await settings(); if (from.email === s.fromAddress.toLowerCase() || /@mail\.thefuturebasics\.com$/.test(from.email)) return; // never answer ourselves
    const full = await fetchReceived(id); // a server error throws, so Resend tries again later
    const subject = String(full?.subject || data.subject || '(no subject)').slice(0, 300);
    const text = String(full?.text || (full?.html ? htmlToText(full.html) : '') || '').slice(0, 20000) || (full ? '' : '(The message could not be loaded. Open it in Resend.)');
    let contact = (await pool.query('select id,name from sales_contacts where lower(email)=$1', [from.email])).rows[0], created = false;
    if (!contact) {
      contact = (await pool.query(`insert into sales_contacts(name,email,source,tags) values($1,$2,'inbound','{inbound}') on conflict (lower(email)) where email is not null do nothing returning id,name`, [from.name, from.email])).rows[0] || (await pool.query('select id,name from sales_contacts where lower(email)=$1', [from.email])).rows[0]; created = true;
    }
    const auto = isAutoReply({ headers: full?.headers, subject }), who = contact.name || from.name || from.email;
    const row = (await pool.query(`insert into sales_emails(contact_id,direction,subject,body_text,from_address,to_address,status,resend_id) values($1,'in',$2,$3,$4,$5,'received',$6) on conflict do nothing returning id`, [contact.id, subject, text, String(data.from?.email || data.from || from.email).slice(0, 300), [].concat(data.to || []).join(', ').slice(0, 300), id])).rows[0];
    if (!row) return;
    await pool.query(`insert into sales_activities(contact_id,kind,text,meta) values($1,'email_in',$2,$3::jsonb)`, [contact.id, (auto ? '(automatic reply) ' : '') + subject, JSON.stringify({ emailId: row.id, auto })]);
    await pool.query(`update sales_contacts set last_activity_at=now() where id=$1`, [contact.id]);
    if (created) await pool.query(`insert into sales_deals(contact_id,title,source) values($1,$2,'website')`, [contact.id, `Inbound email: ${subject}`.slice(0, 140)]);
    if (created) await fireTrigger(pool, { type: 'contact_created', contactId: contact.id, source: 'inbound' });
    if (looksLikeOptOut(text)) { await suppress(from.email, 'unsubscribed', 'by reply'); return; }
    if (auto) return;
    await stopRuns(pool, { contactId: contact.id, reason: 'they wrote back', onlyIfStopOnReply: true });
    await fireTrigger(pool, { type: 'email_in', contactId: contact.id });
    const title = `Reply to ${who}: ${subject}`.slice(0, 200);
    if (!(await pool.query(`select 1 from sales_tasks where contact_id=$1 and done_at is null and title like 'Reply to %'`, [contact.id])).rowCount) await pool.query(`insert into sales_tasks(contact_id,title,due_at) values($1,$2,now())`, [contact.id, title]);
    if (sendHubEmail && notifyTo) await sendHubEmail({ to: notifyTo, subject: `${who} replied: ${subject}`.slice(0, 200), html: hubEmailShell(`${emailEscape(who)} replied`, `<p style="white-space:pre-wrap;border-left:3px solid #4bff9a;padding-left:12px">${emailEscape(stripQuoted(text).slice(0, 1200))}</p><p><a href="${emailEscape(workUrl)}/sales">Open it in Sales</a></p>`) }).catch(() => {});
  }
  app.post('/webhooks/resend', { preParsing: async (req, _reply, payload) => { const chunks = []; for await (const c of payload) chunks.push(c); req.rawBody = Buffer.concat(chunks); const { Readable } = await import('node:stream'); return Readable.from(req.rawBody); } }, async (req, reply) => {
    const whsec = env().RESEND_WEBHOOK_SECRET; if (!whsec) return bad(reply, 'Webhook signing secret is not set', 503);
    const raw = req.rawBody?.toString('utf8') || '';
    if (!verifyWebhook({ id: req.headers['svix-id'], timestamp: req.headers['svix-timestamp'], signature: req.headers['svix-signature'], rawBody: raw, secret: whsec })) return bad(reply, 'Bad signature', 401);
    let evt; try { evt = JSON.parse(raw); } catch { return bad(reply, 'Not JSON', 400); }
    const type = String(evt.type || ''), data = evt.data || {}, to = [].concat(data.to || [])[0];
    try {
      if (type === 'email.received') await handleInbound(data);
      else if (type === 'email.delivered') await pool.query(`update sales_emails set status='delivered' where direction='out' and resend_id=$1 and status in ('sending','sent')`, [data.email_id]);
      else if (type === 'email.bounced' || type === 'email.failed' || type === 'email.suppressed') {
        const hard = !data.bounce?.type || /permanent|undetermined/i.test(String(data.bounce.type)) || type === 'email.suppressed';
        await pool.query(`update sales_emails set status=$2, error=$3 where direction='out' and resend_id=$1`, [data.email_id, hard ? 'bounced' : 'failed', String(data.bounce?.message || data.reason || type).slice(0, 300)]);
        if (hard && to) await suppress(cleanEmail(to), 'bounced', String(data.bounce?.message || '').slice(0, 120));
      } else if (type === 'email.complained' && to) { await pool.query(`update sales_emails set status='complained' where direction='out' and resend_id=$1`, [data.email_id]); await suppress(cleanEmail(to), 'complained'); }
    } catch (e) { log.error?.({ err: e.message, type }, 'resend webhook not handled'); return bad(reply, 'Could not handle that', 500); }
    return { ok: true };
  });
  return { sendToContact, checkContact };
}
