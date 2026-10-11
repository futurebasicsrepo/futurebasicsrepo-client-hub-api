// Sales email: the rules that need no database or network (see sales-email-routes.js for the sending, the webhook and the pages).
// The pipe is Resend; everything that decides who may be emailed, what is said and what is remembered is ours.
import { createHmac, timingSafeEqual } from 'node:crypto';

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- merge fields:  {{first_name}}   {{company|your business}}  ----------
export const MERGE_FIELDS = ['first_name', 'name', 'company', 'build', 'sender'];
// → { text, missing: [field names that had no value and no fallback], unknown: [field names that do not exist] }
export function renderTemplate(template, vars = {}) {
  const missing = new Set(), unknown = new Set();
  const text = String(template ?? '').replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (_, key, fallback) => {
    const k = key.toLowerCase();
    if (!MERGE_FIELDS.includes(k)) { unknown.add(k); return ''; }
    const v = String(vars[k] ?? '').trim();
    if (v) return v;
    if (fallback !== undefined && String(fallback).trim()) return String(fallback).trim();
    missing.add(k); return '';
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}
export const firstNameOf = name => { const n = String(name || '').trim(); if (!n || /@/.test(n)) return ''; return n.split(/\s+/)[0]; };

// ---------- the message ----------
export function textToHtml(text) {
  const link = s => s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1">$1</a>');
  return String(text ?? '').replace(/\r/g, '').trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${link(esc(p)).replace(/\n/g, '<br>')}</p>`).join('');
}
// The footer every sales email carries: who it is from, where we are, and a way out (a mailing address is part of the CAN-SPAM rules).
export function footer({ senderName = '', postalAddress = '', unsubscribeUrl = '' }) {
  const text = `\n\n--\n${[senderName ? `${senderName}, Future Basics` : 'Future Basics', postalAddress].filter(Boolean).join('\n')}\nDo not want these emails? Unsubscribe here: ${unsubscribeUrl}`;
  const html = `<div style="margin-top:22px;padding-top:12px;border-top:1px solid #e3e3e0;color:#717177;font-size:12px;line-height:1.5">${esc(senderName ? `${senderName}, Future Basics` : 'Future Basics')}<br>${esc(postalAddress).replace(/\n/g, '<br>')}<br>Do not want these emails? <a href="${esc(unsubscribeUrl)}" style="color:#717177">Unsubscribe</a></div>`;
  return { text, html };
}
export function buildMessage({ subject, body, senderName, postalAddress, unsubscribeUrl }) {
  const f = footer({ senderName, postalAddress, unsubscribeUrl }), plain = String(body ?? '').replace(/\r/g, '').trim();
  return {
    subject: clip(subject, 200),
    text: plain + f.text,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#141416;max-width:620px">${textToHtml(plain)}${f.html}</div>`,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  };
}

// ---------- unsubscribe links: signed, never expire (an old email must still work) ----------
const sig = (secret, purpose, id) => createHmac('sha256', secret).update(`${purpose}:${id}`).digest('base64url').slice(0, 22);
export const unsubscribeToken = (contactId, secret) => `${contactId}.${sig(secret, 'unsub', contactId)}`;
export function readUnsubscribeToken(token, secret) {
  const [id, s] = String(token || '').split('.'); if (!id || !s || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const want = Buffer.from(sig(secret, 'unsub', id)), got = Buffer.from(s); return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

// ---------- Resend's webhook signature (Svix): "v1,<base64 hmac>" over "<id>.<timestamp>.<body>", key = base64 part of "whsec_…" ----------
export function verifyWebhook({ id, timestamp, signature, rawBody, secret, now = Date.now(), toleranceSec = 300 }) {
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp); if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return String(signature).split(/\s+/).some(part => { const [v, b] = part.split(','); if (v !== 'v1' || !b) return false; const got = Buffer.from(b, 'base64'); return got.length === want.length && timingSafeEqual(got, want); });
}
export const signWebhook = ({ id, timestamp, rawBody, secret }) => 'v1,' + createHmac('sha256', Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64')).update(`${id}.${timestamp}.${rawBody}`).digest('base64'); // for tests and the journeys

// ---------- reading what comes in ----------
export function parseAddress(from) {
  if (from && typeof from === 'object') return { email: String(from.email || from.address || '').trim().toLowerCase(), name: clip(from.name, 120) };
  const s = String(from || '').trim(), m = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(s);
  return m ? { email: m[2].trim().toLowerCase(), name: clip(m[1], 120) } : { email: s.toLowerCase(), name: '' };
}
// "please unsubscribe me", "STOP", "remove me from your list": a reply that is an opt-out. Only the top of the reply counts, not the quoted history under it.
export function looksLikeOptOut(text) {
  const top = stripQuoted(text).slice(0, 240).toLowerCase();
  return /^\W*(please\s+)?(unsubscribe|stop\b|remove me|opt[\s-]?out|take me off)|\b(unsubscribe me|do not (contact|email) me|don'?t (contact|email) me|stop (emailing|contacting) me|remove me from)\b/.test(top);
}
export function isAutoReply({ headers = {}, subject = '' } = {}) {
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  return (h['auto-submitted'] && h['auto-submitted'] !== 'no') || h.precedence === 'bulk' || h.precedence === 'auto_reply' || 'x-autoreply' in h || /^(automatic reply|auto[- ]?reply|out of office|undeliverable|delivery status notification)/i.test(String(subject).trim());
}
// the new part of a reply, without the quoted message under it
export function stripQuoted(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n'), out = [];
  for (const l of lines) {
    if (/^>/.test(l) || /^On .{5,200} wrote:\s*$/i.test(l) || /^-{2,}\s*(Original Message|Forwarded message)/i.test(l) || /^_{5,}$/.test(l) || (/^From:\s.+@/i.test(l) && out.length)) break;
    out.push(l);
  }
  return out.join('\n').trim();
}
export const htmlToText = html => String(html ?? '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

// ---------- who may be emailed ----------
// A relationship: they are a hub client, or they did something (looked at a build, clicked through, replied, met or spoke with us), or they were invited.
const RELATIONSHIP_KINDS = ['showcase_view', 'showcase_demo', 'email_in', 'meeting', 'call'];
export function relationship({ clientId = null, kinds = [], invited = false } = {}) {
  if (clientId) return { ok: true, why: 'a Future Basics client' };
  if (invited) return { ok: true, why: 'invited to the showcase' };
  const k = (kinds || []).find(x => RELATIONSHIP_KINDS.includes(x));
  return k ? { ok: true, why: { showcase_view: 'looked at a build', showcase_demo: 'opened a live build', email_in: 'wrote to us', meeting: 'met with us', call: 'spoke with us' }[k] } : { ok: false, why: 'nothing yet shows they know us' };
}
// → { ok, reasons: [plain words] }. Staff can confirm a relationship that the record does not show (they met at an event); nothing else can be overridden.
export function canEmail({ contact, suppressed = null, rel, confirmed = false, settings = {}, sentToday = 0, configured = true }) {
  const reasons = [];
  if (!configured) reasons.push('Email sending is not switched on yet (the service needs its Resend key).');
  if (!contact?.email) reasons.push('This contact has no email address.');
  if (suppressed) reasons.push({ unsubscribed: 'They unsubscribed.', bounced: 'Mail to this address bounced.', complained: 'They marked an earlier email as spam.', manual: 'They are marked as not to be emailed.' }[suppressed] || 'They are on the do-not-email list.');
  else if (contact && (contact.unsubscribed || contact.emailOk === false)) reasons.push('They are marked as not to be emailed.');
  if (!String(settings.postalAddress || '').trim()) reasons.push('Add your business mailing address in Email settings. Commercial email must carry one.');
  if (!String(settings.fromAddress || '').trim()) reasons.push('Add the address emails are sent from in Email settings.');
  if (Number(settings.dailyCap) > 0 && sentToday >= Number(settings.dailyCap)) reasons.push(`Today’s limit of ${settings.dailyCap} emails has been reached. It resets at midnight UTC.`);
  if (rel && !rel.ok && !confirmed) reasons.push('Nothing shows they know us yet. If you have spoken with them or they asked you to write, confirm it to send.');
  return { ok: reasons.length === 0, reasons, needsConfirmation: Boolean(rel && !rel.ok && !confirmed) };
}

// ---------- starting templates ----------
export const STARTER_TEMPLATES = [
  { name: 'After they looked at a build', subject: 'Thanks for taking a look at {{build|what we build}}', body: 'Hi {{first_name|there}},\n\nI saw you had a look at {{build|what we build}}. I am glad you did; it is some of the work we are proudest of.\n\nIf it sparked an idea for {{company|your business}}, I would be happy to talk it through. No pitch: 20 minutes, and you leave with a clear picture of what it would take and what it would cost.\n\nWhen is a good time this week?\n\n{{sender|Kyle}}' },
  { name: 'After they opened the live build', subject: 'What did you think of {{build|the build}}?', body: 'Hi {{first_name|there}},\n\nI noticed you opened {{build|the build}} and clicked around. What stood out to you? Anything you would want different for {{company|your business}}?\n\nIf you tell me what you are trying to do, I can show you how we would approach it.\n\n{{sender|Kyle}}' },
  { name: 'Great to meet you', subject: 'Great to meet you, {{first_name|there}}', body: 'Hi {{first_name|there}},\n\nGood to meet you. As promised, here is where to see what we have built: https://builds.thefuturebasics.com\n\nIf anything there looks close to what {{company|your business}} needs, tell me which one and I will send you more detail.\n\n{{sender|Kyle}}' },
  { name: 'Checking in', subject: 'Any questions?', body: 'Hi {{first_name|there}},\n\nJust checking in. Is there anything I can answer, or anything that would make this an easier decision?\n\nIf now is not the right time, tell me and I will leave you be.\n\n{{sender|Kyle}}' }
];
