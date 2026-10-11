// Chat routes: a visitor talks to the assistant, and is handed to a person when they ask or the assistant should not answer (see chat-assistant.js for the rules).
//
//   visitor  (no sign-in; a private token kept in the visitor's browser)
//     GET  /chat-frame              the chat window (embedded by /chat-widget.js on the public site and inside the showcase)
//     GET  /chat-widget.js          the embed script: a button and the window in an iframe
//     GET  /v1/chat/state           settings + the visitor's conversation, if they have one
//     POST /v1/chat/messages        say something (starts the conversation); the assistant answers or hands off
//     GET  /v1/chat/messages        the thread, for polling
//     POST /v1/chat/person          "talk to a person"      POST /v1/chat/contact   leave a name and email so we can reach them
//   staff   (work console sign-in)
//     GET /v1/sales/chats   GET /v1/sales/chats/:id   POST /v1/sales/chats/:id/messages   PUT /v1/sales/chats/:id {status}   GET|PUT /v1/sales/chats/settings
//
// Who the visitor is: inside the showcase they are already signed in, so the conversation is tied to their contact from the first message. On the public site they are
// anonymous until they leave an email (asked for when a person is needed). Everything a visitor sends is untrusted text: it is length-limited, shown escaped, and given to
// the assistant as a message, never as instructions.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { answer, cleanVisitorText, buildFacts, MAX_BOT_REPLIES } from './chat-assistant.js';
import { cleanEmail } from './sales.js';
import { fireTrigger, stopRuns } from './sales-automations-engine.js';
import { captureLead } from './sales-routes.js';
import { visibleBuilds } from './builds.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHAT_DEFAULTS = { enabled: true, assistantOn: true, dailyBotCap: 300, greeting: 'Hi! I am the Future Basics assistant. Ask me what we do or what we have built, or ask for a person any time.', about: '' };
const FRAME_PARENTS = "https://thefuturebasics.com https://www.thefuturebasics.com https://builds.thefuturebasics.com https://hub.thefuturebasics.com https://work.thefuturebasics.com";
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const msgView = m => ({ id: m.id, author: m.author, author_name: m.author_name, body: m.body, created_at: m.created_at });

export function registerChatRoutes(app, d) {
  const { pool, authenticate, adminOnly, throttle, hash, getSetting, setSetting, sendHubEmail, hubEmailShell, emailEscape, notifyTo, workUrl, builds, aiEnabled, answerImpl = answer, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const settings = async () => ({ ...CHAT_DEFAULTS, ...((await getSetting('salesChat')) || {}) });
  const tokenOf = req => String(req.headers['x-chat-token'] || req.body?.token || '').slice(0, 80);
  const convOf = async token => (token ? (await pool.query('select * from chat_conversations where token_hash=$1', [hash(token)])).rows[0] || null : null);
  const state = c => c ? { status: c.status, name: c.visitor_name, email: c.visitor_email, needsEmail: !c.visitor_email, looking: c.looking_at } : null;
  const thread = async id => (await pool.query(`select id,author,author_name,body,created_at from chat_messages where conversation_id=$1 order by created_at, id`, [id])).rows.map(msgView);
  const say = (conv, author, body, name = '', staffId = null) => pool.query(`insert into chat_messages(conversation_id,author,author_name,body,staff_id) values($1,$2,$3,$4,$5) returning id`, [conv, author, name, String(body).slice(0, 4000), staffId]);
  const viewerOf = async req => { try { return builds?.sessionOf ? await builds.sessionOf(req) : null; } catch { return null; } };

  // ---------- the page and the embed ----------
  const frame = readFileSync(new URL('./chat-frame.html', import.meta.url), 'utf8');
  app.get('/chat-frame', (_req, reply) => reply.header('cache-control', 'no-store').header('content-security-policy', `upgrade-insecure-requests; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self' ${FRAME_PARENTS}; base-uri 'self'; form-action 'none'`).type('text/html').send(frame));
  app.get('/chat-widget.js', (_req, reply) => reply.header('cache-control', 'public, max-age=300').type('application/javascript').send(readFileSync(new URL('./chat-widget.js', import.meta.url), 'utf8')));

  // ---------- who is this ----------
  // Finds or makes their contact and ties the conversation to it. A showcase viewer's address is verified (they signed in with a code); an anonymous visitor's is what they typed.
  async function identify(conv, { email, name, source, verified = false }) {
    const addr = cleanEmail(email); if (!addr) return conv;
    const lead = await captureLead(pool, { email: addr, name: clip(name, 120), source, kind: 'system', text: 'Started a chat', meta: { chatId: conv.id } });
    if (lead) await pool.query(`update sales_contacts set tags = tags || '{chat}'::text[], name=case when name='' then $2 else name end where id=$1 and (not ('chat' = any(tags)) or name='')`, [lead.contactId, clip(name, 120)]);
    return (await pool.query(`update chat_conversations set contact_id=$2, visitor_email=$3, email_verified=$5, visitor_name=case when visitor_name='' then $4 else visitor_name end where id=$1 returning *`, [conv.id, lead?.contactId || null, addr, clip(name, 120), verified])).rows[0];
  }
  // the first thing someone says, and what they say after a pause, goes on their record (not every line); it also stops anything waiting to write to them
  async function recordInbound(conv, text) {
    if (!conv.contact_id) return;
    const recent = (await pool.query(`select 1 from sales_activities where contact_id=$1 and kind in ('chat_in','note') and meta->>'chatId'=$2 and created_at > now() - interval '30 minutes' limit 1`, [conv.contact_id, conv.id])).rowCount;
    // an address someone typed on the public site is not proof they are that person, so it is a note, and it does not count as "they know us" or start automations
    if (!recent) await pool.query(`insert into sales_activities(contact_id,kind,text,meta) values($1,$2,$3,$4::jsonb)`, [conv.contact_id, conv.email_verified ? 'chat_in' : 'note', conv.email_verified ? clip(text, 300) : `Chat message (email not verified): ${clip(text, 280)}`, JSON.stringify({ chatId: conv.id })]);
    await pool.query('update sales_contacts set last_activity_at=now() where id=$1', [conv.contact_id]);
    if (!conv.email_verified) return;
    await stopRuns(pool, { contactId: conv.contact_id, reason: 'they wrote in the chat', onlyIfStopOnReply: true });
    await fireTrigger(pool, { type: 'email_in', contactId: conv.contact_id });
  }

  // ---------- handing over ----------
  async function handoff(conv, reason) {
    if (conv.status === 'waiting' || conv.status === 'person') return conv;
    const c = (await pool.query(`update chat_conversations set status='waiting', handoff_reason=$2 where id=$1 returning *`, [conv.id, clip(reason, 160)])).rows[0];
    await say(c.id, 'system', c.visitor_email ? 'A person will pick this up here, and we will email you if you step away.' : 'A person will pick this up here. Leave your email below so we can reach you if you step away.');
    const who = c.visitor_name || c.visitor_email || 'A visitor', last = (await pool.query(`select body from chat_messages where conversation_id=$1 and author='visitor' order by created_at desc limit 1`, [c.id])).rows[0]?.body || '';
    if (c.contact_id) await pool.query(`insert into sales_tasks(contact_id,title,due_at) values($1,$2,now())`, [c.contact_id, `Chat waiting: ${who}${c.looking_at ? ` (looking at ${c.looking_at})` : ''}: ${clip(last, 100)}`.slice(0, 200)]);
    if (sendHubEmail && notifyTo) await sendHubEmail({ to: notifyTo, subject: `Chat waiting: ${who}${c.looking_at ? ` · ${c.looking_at}` : ''}`.slice(0, 200), html: hubEmailShell(`${emailEscape(who)} is waiting in chat`, `<p>${emailEscape(c.handoff_reason ? `Why: ${c.handoff_reason}.` : '')}</p><p style="white-space:pre-wrap;border-left:3px solid #4bff9a;padding-left:12px">${emailEscape(clip(last, 600))}</p><p><a href="${emailEscape(workUrl)}/sales#chats">Open the chat</a></p>`) }).catch(() => {});
    return c;
  }
  async function runAssistant(conv, viewer) {
    const cfg = await settings();
    if (!cfg.assistantOn || !aiEnabled()) return handoff(conv, 'no assistant is switched on');
    if (conv.bot_replies >= MAX_BOT_REPLIES) return handoff(conv, 'a long conversation');
    const today = Number((await pool.query(`select count(*) n from chat_messages where author='assistant' and created_at > date_trunc('day', now())`)).rows[0].n);
    if (today >= cfg.dailyBotCap) return handoff(conv, 'the assistant reached its daily limit');
    const hist = (await pool.query(`select author, body from chat_messages where conversation_id=$1 and author in ('visitor','assistant') order by created_at desc, id desc limit 12`, [conv.id])).rows.reverse().map(m => ({ role: m.author === 'visitor' ? 'user' : 'assistant', content: m.body }));
    while (hist.length && hist[0].role !== 'user') hist.shift();
    const shown = viewer ? visibleBuilds(await builds.allBuilds(), viewer) : [];
    let r;
    try { r = await Promise.race([answerImpl({ history: hist, facts: buildFacts({ builds: shown, about: cfg.about, looking: conv.looking_at }) }), new Promise((_, no) => setTimeout(() => no(new Error('the assistant took too long')), 25000))]); }
    catch (e) { log.warn?.({ err: e.message }, 'chat assistant failed'); await say(conv.id, 'assistant', 'I could not answer that just now. I am getting a person for you.', 'Assistant'); return handoff(conv, 'the assistant had a problem'); }
    await say(conv.id, 'assistant', r.reply, 'Assistant');
    const c = (await pool.query('update chat_conversations set bot_replies=bot_replies+1 where id=$1 returning *', [conv.id])).rows[0];
    return r.handoff ? handoff(c, r.reason) : c;
  }

  // ---------- the visitor ----------
  app.get('/v1/chat/state', async (req) => {
    const cfg = await settings(), conv = await convOf(tokenOf(req)), viewer = await viewerOf(req);
    return { enabled: cfg.enabled, greeting: cfg.greeting, signedIn: Boolean(viewer?.email), email: viewer?.email || '', conversation: state(conv), messages: conv ? await thread(conv.id) : [] };
  });
  app.get('/v1/chat/messages', async (req, reply) => {
    const conv = await convOf(tokenOf(req)); if (!conv) return bad(reply, 'No conversation', 404);
    await pool.query('update chat_conversations set visitor_seen_at=now() where id=$1', [conv.id]);
    return { conversation: state(conv), messages: await thread(conv.id) };
  });
  app.post('/v1/chat/messages', async (req, reply) => {
    const cfg = await settings(); if (!cfg.enabled) return bad(reply, 'Chat is switched off right now. Please email us instead.', 503);
    const b = req.body || {}; if (b.website) return { ok: true }; // a hidden field only a robot fills in
    if (!throttle(`chat:${req.ip}`, { limit: 60, windowMs: 3600_000 }) || !throttle('chat:all', { limit: 3000, windowMs: 3600_000 })) return bad(reply, 'You are sending a lot of messages. Give it a few minutes.', 429);
    const text = cleanVisitorText(b.body); if (!text) return bad(reply, 'Write a message first');
    let conv = await convOf(tokenOf(req)), token = tokenOf(req);
    if (conv && !throttle(`chatc:${conv.id}`, { limit: 120, windowMs: 24 * 3600_000 })) return bad(reply, 'That is enough for today. Someone will reply here soon.', 429);
    if (!conv) {
      if (!throttle(`chatnew:${req.ip}`, { limit: 8, windowMs: 3600_000 }) || !throttle('chatnew:all', { limit: 300, windowMs: 3600_000 })) return bad(reply, 'Too many new chats from here. Try again later.', 429);
      token = randomBytes(24).toString('base64url');
      conv = (await pool.query(`insert into chat_conversations(token_hash,source,page,ip_hash) values($1,$2,$3,$4) returning *`, [hash(token), b.source === 'showcase' ? 'showcase' : 'site', clip(b.page, 300), hash(String(req.ip))])).rows[0];
    } else if (conv.status === 'closed') conv = (await pool.query(`update chat_conversations set status='bot', closed_at=null, bot_replies=0 where id=$1 returning *`, [conv.id])).rows[0];
    const viewer = await viewerOf(req);
    if (viewer?.email && !conv.visitor_email) conv = await identify(conv, { email: viewer.email, name: '', source: 'showcase', verified: true });
    else if (!conv.visitor_email && cleanEmail(b.email)) conv = await identify(conv, { email: b.email, name: b.name, source: 'website' });
    if (b.looking && clip(b.looking, 80) !== conv.looking_at) {
      const slug = clip(b.looking, 80), row = viewer ? visibleBuilds(await builds.allBuilds(), viewer).find(x => x.slug === slug) : null; // only a build this visitor may see
      if (row) conv = (await pool.query('update chat_conversations set looking_at=$2 where id=$1 returning *', [conv.id, row.name])).rows[0];
    }
    await say(conv.id, 'visitor', text, conv.visitor_name);
    conv = (await pool.query(`update chat_conversations set last_message_at=now(), unread_staff=unread_staff+1, visitor_seen_at=now() where id=$1 returning *`, [conv.id])).rows[0];
    await recordInbound(conv, text);
    if (conv.status === 'bot') conv = await runAssistant(conv, viewer);
    return reply.code(201).send({ token, conversation: state(conv), messages: await thread(conv.id) });
  });
  app.post('/v1/chat/person', async (req, reply) => {
    const conv = await convOf(tokenOf(req)); if (!conv) return bad(reply, 'Say something first', 404);
    if (!throttle(`chatp:${conv.id}`, { limit: 6, windowMs: 3600_000 })) return bad(reply, 'We already have your request.', 429);
    await say(conv.id, 'visitor', 'I would like to talk to a person.', conv.visitor_name);
    await pool.query(`update chat_conversations set unread_staff=unread_staff+1, last_message_at=now() where id=$1`, [conv.id]);
    const c = await handoff((await pool.query('select * from chat_conversations where id=$1', [conv.id])).rows[0], 'asked for a person');
    return { conversation: state(c), messages: await thread(c.id) };
  });
  app.post('/v1/chat/contact', async (req, reply) => {
    let conv = await convOf(tokenOf(req)); if (!conv) return bad(reply, 'Say something first', 404);
    const email = cleanEmail(req.body?.email); if (!email) return bad(reply, 'That does not look like an email address');
    if (!throttle(`chatk:${conv.id}`, { limit: 6, windowMs: 3600_000 })) return bad(reply, 'Too many tries', 429);
    if (conv.visitor_email) return { conversation: state(conv) }; // a verified or earlier address is not replaced from the page
    conv = await identify(conv, { email, name: req.body?.name, source: conv.source === 'showcase' ? 'showcase' : 'website' });
    if (conv.status === 'waiting' && conv.contact_id) { // the task the handoff could not make before
      const last = (await pool.query(`select body from chat_messages where conversation_id=$1 and author='visitor' order by created_at desc limit 1`, [conv.id])).rows[0]?.body || '';
      await pool.query(`insert into sales_tasks(contact_id,title,due_at) values($1,$2,now())`, [conv.contact_id, `Chat waiting: ${conv.visitor_name || conv.visitor_email}: ${clip(last, 100)}`.slice(0, 200)]);
      await recordInbound(conv, last);
    }
    return { conversation: state(conv) };
  });

  // ---------- staff ----------
  app.get('/v1/sales/chats/settings', { preHandler: pre }, async () => ({ settings: await settings(), assistantReady: Boolean(aiEnabled()) }));
  app.put('/v1/sales/chats/settings', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, cur = await settings(), next = { ...cur };
    if ('enabled' in b) next.enabled = b.enabled === true;
    if ('assistantOn' in b) next.assistantOn = b.assistantOn === true;
    if ('greeting' in b) next.greeting = clip(b.greeting, 300) || CHAT_DEFAULTS.greeting;
    if ('about' in b) next.about = String(b.about || '').replace(/\r/g, '').trim().slice(0, 2000);
    if ('dailyBotCap' in b) { const n = Math.round(Number(b.dailyBotCap)); if (!Number.isFinite(n) || n < 0 || n > 5000) return bad(reply, 'The daily limit is 0 to 5000 answers'); next.dailyBotCap = n; }
    await setSetting('salesChat', next); return { ok: true, settings: next };
  });
  app.get('/v1/sales/chats', { preHandler: pre }, async (req) => {
    const f = String(req.query?.status || 'open'), where = f === 'all' ? '' : f === 'open' ? `where c.status <> 'closed'` : ['bot', 'waiting', 'person', 'closed'].includes(f) ? `where c.status = '${f}'` : `where c.status <> 'closed'`;
    const rows = (await pool.query(`select c.id,c.visitor_name,c.visitor_email,c.status,c.source,c.looking_at,c.handoff_reason,c.unread_staff,c.last_message_at,c.contact_id,c.created_at,u.name assigned_name,
        (select body from chat_messages m where m.conversation_id=c.id order by m.created_at desc, m.id desc limit 1) last_body,
        (select author from chat_messages m where m.conversation_id=c.id order by m.created_at desc, m.id desc limit 1) last_author
      from chat_conversations c left join users u on u.id=c.assigned_to ${where} order by (c.status='waiting') desc, c.last_message_at desc limit 100`)).rows;
    const counts = (await pool.query(`select count(*) filter (where status='waiting') waiting, count(*) filter (where status <> 'closed') open from chat_conversations`)).rows[0];
    return { chats: rows, waiting: Number(counts.waiting), open: Number(counts.open) };
  });
  app.get('/v1/sales/chats/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const c = (await pool.query(`select c.*, u.name assigned_name from chat_conversations c left join users u on u.id=c.assigned_to where c.id=$1`, [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    await pool.query('update chat_conversations set unread_staff=0 where id=$1', [c.id]);
    // shaped for the shared chat thread: the visitor is the "client" side, staff are "admin"; the assistant and system lines are told apart
    const msgs = (await thread(c.id)).map(m => m.author === 'system' ? { ...m, system: true } : { ...m, author_role: m.author === 'staff' ? 'admin' : m.author === 'visitor' ? 'client' : 'assistant', author_name: m.author === 'visitor' ? (c.visitor_name || 'Visitor') : m.author_name });
    return { chat: { id: c.id, name: c.visitor_name, email: c.visitor_email, status: c.status, source: c.source, page: c.page, looking: c.looking_at, reason: c.handoff_reason, contactId: c.contact_id, verified: c.email_verified, assignedName: c.assigned_name, createdAt: c.created_at, visitorSeenAt: c.visitor_seen_at }, messages: msgs };
  });
  app.post('/v1/sales/chats/:id/messages', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const c = (await pool.query('select * from chat_conversations where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    const body = String(req.body?.body || '').replace(/\r/g, '').trim().slice(0, 2000); if (!body) return bad(reply, 'Write a message first');
    const me = actorOf(req) ? (await pool.query('select name from users where id=$1', [actorOf(req)])).rows[0] : null, first = String(me?.name || '').trim().split(/\s+/)[0] || 'Future Basics';
    await say(c.id, 'staff', body, first, actorOf(req));
    await pool.query(`update chat_conversations set status='person', assigned_to=coalesce($2, assigned_to), last_message_at=now(), closed_at=null where id=$1`, [c.id, actorOf(req)]);
    if (c.contact_id) {
      await pool.query(`insert into sales_activities(contact_id,kind,text,meta,actor_id) values($1,'chat_out',$2,$3::jsonb,$4)`, [c.contact_id, clip(body, 300), JSON.stringify({ chatId: c.id }), actorOf(req)]);
      await pool.query('update sales_contacts set last_activity_at=now() where id=$1', [c.contact_id]);
    }
    // someone who has stepped away gets the answer by email too (they asked us a question; this is the reply)
    const away = !c.visitor_seen_at || Date.now() - new Date(c.visitor_seen_at).getTime() > 2 * 60_000;
    let emailed = false;
    if (away && c.visitor_email && sendHubEmail) {
      emailed = Boolean(await sendHubEmail({ to: c.visitor_email, subject: `${first} at Future Basics replied to your chat`, html: hubEmailShell(`${emailEscape(first)} replied`, `<p style="white-space:pre-wrap;border-left:3px solid #4bff9a;padding-left:12px">${emailEscape(body)}</p><p>Open our site and the chat will pick up where you left off.</p>`) }).catch(() => false));
    }
    return reply.code(201).send({ ok: true, emailed });
  });
  app.put('/v1/sales/chats/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Not found', 404);
    const to = req.body?.status; if (!['closed', 'person', 'bot'].includes(to)) return bad(reply, 'Choose close, take over or hand back to the assistant');
    const c = (await pool.query('select * from chat_conversations where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    await pool.query(`update chat_conversations set status=$2, assigned_to=case when $2='person' then coalesce($3, assigned_to) else assigned_to end, closed_at=case when $2='closed' then now() else null end, bot_replies=case when $2='bot' then 0 else bot_replies end where id=$1`, [c.id, to, actorOf(req)]);
    if (to === 'bot') await say(c.id, 'system', 'The assistant is back. Ask for a person any time.');
    if (to === 'closed') await say(c.id, 'system', 'This chat was closed. Write again any time to start another.');
    return { ok: true };
  });
}
