// Team chat inside a client room: channels where the room's team talks to each other, and where Future Basics joins when the team brings it in.
//
//   GET    /v1/team-chat/channels                  the room's channels, each with its unread count (a room starts with #general). Staff pass ?room=<client id>
//                                                  and see only the channels the team brought Future Basics into.
//   POST   /v1/team-chat/channels                  {name, productId?, staffIn?} a new channel, for a topic or for one product (the team only)
//   PATCH  /v1/team-chat/channels/:id              {name?, staffIn?, archived?} rename, bring Future Basics in or out, archive (the team only)
//   GET    /v1/team-chat/channels/:id/messages     the thread, oldest first; reading it marks it read for this person
//   POST   /v1/team-chat/channels/:id/messages     {body, replyToId?} say something. @name reaches a teammate; @futurebasics brings Future Basics in
//   DELETE /v1/team-chat/messages/:id              take back your own message (it reads "Message removed")
//   GET    /v1/team-chat/rooms                      staff: the rooms with a channel Future Basics is in, and what is unread there
//   GET    /v1/team-chat/people                     who can be mentioned: the room's team, and Future Basics
//
// What the team says among themselves stays theirs: staff never read a channel the team has not brought them into. A client preview is read-only.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const body = v => String(v ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 4000);
export const GENERAL = 'general';
export const FB_HANDLE = /(^|\s)@(future ?basics|fb)\b/i;

// Who a message mentions: '@Maya', '@maya.reyes' or '@maya@brand.com' match a teammate by first name, full name without spaces, or address.
export function mentionsIn(text, people) {
  const t = String(text || '').toLowerCase(), hit = new Set();
  for (const p of people || []) {
    const first = String(p.name || '').trim().split(/\s+/)[0].toLowerCase(), full = String(p.name || '').toLowerCase().replace(/\s+/g, ''), local = String(p.email || '').toLowerCase().split('@')[0];
    for (const h of [first, full, local, String(p.email || '').toLowerCase()].filter(x => x && x.length >= 2))
      if (new RegExp(`(^|[^\\w@.])@${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i').test(t)) { hit.add(p.id); break; }
  }
  return [...hit];
}
export const channelName = v => clip(v, 40).toLowerCase().replace(/^#/, '').replace(/[^a-z0-9 _-]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export function registerTeamChatRoutes(app, d) {
  const { pool, authenticate, notifyStaff = async () => {}, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, emailEscape = s => String(s), clientHubUrl = '', workHubUrl = '', log = console } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const admin = req => req.auth?.role === 'admin';
  const uid = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const me = async req => (await pool.query('select id, name, email from users where id=$1', [uid(req)])).rows[0] || { id: uid(req), name: '', email: req.auth?.email || '' };
  const nameOf = u => clip(u.name || String(u.email || '').split('@')[0], 80);
  // the room a request works in: a client's own; staff name it
  const roomOf = req => (admin(req) ? (UUID.test(String(req.query?.room || req.body?.room || '')) ? String(req.query?.room || req.body?.room) : null) : (UUID.test(String(req.auth?.clientId || '')) ? req.auth.clientId : null));
  const team = async cid => (await pool.query(`select id, name, email from users where client_id=$1 and role='client' and removed_at is null order by created_at`, [cid])).rows;

  async function ensureGeneral(cid) {
    await pool.query(`insert into team_channels(client_id,name) select $1,$2 where not exists(select 1 from team_channels where client_id=$1 and lower(name)=$2 and archived_at is null)`, [cid, GENERAL]).catch(e => { if (e.code !== '23505') throw e; });
  }
  // a channel this person may open: the room's own for the team; for staff, only one the team brought Future Basics into
  async function channelOf(req, reply, id) {
    if (!UUID.test(String(id || ''))) { bad(reply, 'Channel not found', 404); return null; }
    const c = (await pool.query('select tc.*, p.title product_title from team_channels tc left join products p on p.id=tc.product_id where tc.id=$1', [id])).rows[0];
    if (!c || (admin(req) ? !c.staff_in : c.client_id !== req.auth.clientId)) { bad(reply, 'Channel not found', 404); return null; }
    return c;
  }
  const channelView = (c, unread = 0) => ({ id: c.id, name: c.name, productId: c.product_id, productTitle: c.product_title || '', staffIn: c.staff_in, archived: Boolean(c.archived_at), unread: Number(unread) || 0, lastAt: c.last_at || null });
  // a message as the shared chat thread (chat.js) draws it: author_role is "me" for the reader's own, so their bubbles sit on the right
  const msgView = (m, viewer) => ({ id: m.id, author_role: m.author_id && m.author_id === viewer ? 'me' : m.author_role === 'admin' ? 'fb' : `u:${m.author_id || 'gone'}`,
    author_name: m.author_role === 'admin' ? `${m.author_name || 'Future Basics'} · Future Basics` : m.author_name, body: m.deleted_at ? 'Message removed' : m.body, created_at: m.created_at,
    reply_to_id: m.reply_to_id, files: [], noReply: Boolean(m.deleted_at), mine: Boolean(m.author_id && m.author_id === viewer), deleted: Boolean(m.deleted_at) });
  const system = (c, text) => pool.query(`insert into team_messages(channel_id,client_id,author_role,author_name,body) values($1,$2,'system','',$3)`, [c.id, c.client_id, clip(text, 400)]);

  app.get('/v1/team-chat/channels', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, admin(req) ? 'Say which room (?room=)' : 'Sign in to your room', admin(req) ? 422 : 401);
    if (!admin(req)) await ensureGeneral(cid);
    const rows = (await pool.query(`select tc.*, p.title product_title, (select max(created_at) from team_messages m where m.channel_id=tc.id) last_at,
        (select count(*) from team_messages m where m.channel_id=tc.id and m.deleted_at is null and m.author_role<>'system' and coalesce(m.author_id,'00000000-0000-0000-0000-000000000000')<>$2
          and m.created_at > coalesce((select last_read_at from team_channel_reads r where r.channel_id=tc.id and r.user_id=$2),'epoch')) unread
      from team_channels tc left join products p on p.id=tc.product_id where tc.client_id=$1 and tc.archived_at is null ${admin(req) ? 'and tc.staff_in' : ''}
      order by (lower(tc.name)=$3) desc, last_at desc nulls last, tc.created_at`, [cid, uid(req), GENERAL])).rows;
    const room = (await pool.query('select name from clients where id=$1', [cid])).rows[0];
    return { room: room?.name || '', channels: rows.map(c => channelView(c, c.unread)), role: admin(req) ? 'admin' : 'client' };
  });

  app.post('/v1/team-chat/channels', { preHandler: authenticate }, async (req, reply) => {
    if (admin(req)) return bad(reply, 'The room’s team makes its channels', 403);
    const cid = roomOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    let productId = null, name = channelName(req.body?.name);
    if (req.body?.productId) {
      const p = UUID.test(String(req.body.productId)) ? (await pool.query('select id, title from products where id=$1 and client_id=$2', [req.body.productId, cid])).rows[0] : null;
      if (!p) return bad(reply, 'That product is not in your room', 404);
      const has = (await pool.query('select tc.*, p.title product_title from team_channels tc left join products p on p.id=tc.product_id where tc.client_id=$1 and tc.product_id=$2 and tc.archived_at is null', [cid, p.id])).rows[0];
      if (has) return { channel: channelView(has), existing: true };
      productId = p.id; name = name || channelName(p.title);
    }
    if (!name) return bad(reply, 'Give the channel a name');
    if ((await pool.query('select count(*)::int n from team_channels where client_id=$1 and archived_at is null', [cid])).rows[0].n >= 60) return bad(reply, 'A room holds 60 channels. Archive one first.', 409);
    try {
      const c = (await pool.query(`insert into team_channels(client_id,name,product_id,staff_in,created_by) values($1,$2,$3,$4,$5) returning *`, [cid, name, productId, req.body?.staffIn === true, uid(req)])).rows[0];
      const u = await me(req); await system(c, `${nameOf(u)} made #${c.name}${c.staff_in ? ' with Future Basics in it' : ''}`);
      return reply.code(201).send({ channel: channelView({ ...c, product_title: productId ? (await pool.query('select title from products where id=$1', [productId])).rows[0]?.title : '' }) });
    } catch (e) { if (e.code === '23505') return bad(reply, `There is already a #${name}`, 409); throw e; }
  });

  app.patch('/v1/team-chat/channels/:id', { preHandler: authenticate }, async (req, reply) => {
    if (admin(req)) return bad(reply, 'The room’s team looks after its channels', 403);
    const c = await channelOf(req, reply, req.params.id); if (!c) return reply;
    const u = await me(req), notes = [];
    if (req.body?.name !== undefined) {
      if (c.name === GENERAL) return bad(reply, '#general keeps its name', 409);
      const name = channelName(req.body.name); if (!name) return bad(reply, 'Give the channel a name');
      try { await pool.query('update team_channels set name=$2 where id=$1', [c.id, name]); } catch (e) { if (e.code === '23505') return bad(reply, `There is already a #${name}`, 409); throw e; }
      if (name !== c.name) notes.push(`${nameOf(u)} renamed #${c.name} to #${name}`);
    }
    if (typeof req.body?.staffIn === 'boolean' && req.body.staffIn !== c.staff_in) {
      await pool.query('update team_channels set staff_in=$2 where id=$1', [c.id, req.body.staffIn]);
      notes.push(req.body.staffIn ? `${nameOf(u)} brought Future Basics into this channel` : `${nameOf(u)} took Future Basics out of this channel`);
    }
    if (req.body?.archived === true) { if (c.name === GENERAL) return bad(reply, '#general stays', 409); await pool.query('update team_channels set archived_at=now() where id=$1', [c.id]); }
    for (const n of notes) await system(c, n);
    const next = (await pool.query('select tc.*, p.title product_title from team_channels tc left join products p on p.id=tc.product_id where tc.id=$1', [c.id])).rows[0];
    return { channel: channelView(next) };
  });

  app.get('/v1/team-chat/channels/:id/messages', { preHandler: authenticate }, async (req, reply) => {
    const c = await channelOf(req, reply, req.params.id); if (!c) return reply;
    const rows = (await pool.query(`select * from team_messages where channel_id=$1 order by created_at, id limit 2000`, [c.id])).rows;
    if (uid(req) && !req.auth.preview) await pool.query(`insert into team_channel_reads(channel_id,user_id,last_read_at) values($1,$2,now()) on conflict(channel_id,user_id) do update set last_read_at=now()`, [c.id, uid(req)]);
    const viewer = uid(req);
    return {
      channel: channelView(c), messages: rows.filter(m => m.author_role !== 'system').map(m => msgView(m, viewer)),
      events: rows.filter(m => m.author_role === 'system').map(m => ({ id: m.id, title: m.body, createdAt: m.created_at, unread: false }))
    };
  });

  app.post('/v1/team-chat/channels/:id/messages', { preHandler: authenticate }, async (req, reply) => {
    const c = await channelOf(req, reply, req.params.id); if (!c) return reply;
    if (c.archived_at) return bad(reply, 'This channel is archived', 409);
    const text = body(req.body?.body); if (!text) return bad(reply, 'Write something first');
    const replyTo = UUID.test(String(req.body?.replyToId || '')) ? (await pool.query('select id from team_messages where id=$1 and channel_id=$2', [req.body.replyToId, c.id])).rows[0]?.id || null : null;
    const u = await me(req), people = await team(c.client_id), mentions = mentionsIn(text, people).filter(id => id !== u.id);
    const m = (await pool.query(`insert into team_messages(channel_id,client_id,author_id,author_role,author_name,body,reply_to_id,mentions) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [c.id, c.client_id, u.id, admin(req) ? 'admin' : 'client', nameOf(u), text, replyTo, mentions])).rows[0];
    await pool.query(`insert into team_channel_reads(channel_id,user_id,last_read_at) values($1,$2,now()) on conflict(channel_id,user_id) do update set last_read_at=now()`, [c.id, u.id]);
    const room = (await pool.query('select name from clients where id=$1', [c.client_id])).rows[0]?.name || 'A client';
    // @futurebasics: Future Basics is brought in, and told
    if (!admin(req) && FB_HANDLE.test(text)) {
      if (!c.staff_in) { await pool.query('update team_channels set staff_in=true where id=$1', [c.id]); await system(c, `${nameOf(u)} brought Future Basics into this channel`); }
      notifyStaff(`${room} asked for Future Basics in #${c.name}`, `<p><b>${emailEscape(nameOf(u))}</b> in <b>#${emailEscape(c.name)}</b>:</p><p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(text.slice(0, 1200))}</p><p><a href="${emailEscape(`${workHubUrl}/workspace?room=${c.client_id}&channel=${c.id}`)}">Open the channel</a></p>`).catch(err => log.warn?.({ err: err.message }, 'team chat: staff not told'));
    }
    // a mentioned teammate hears about it in the hub, and by email
    for (const id of mentions) {
      const p = people.find(x => x.id === id); if (!p) continue;
      await pool.query(`insert into notifications(client_id,user_id,type,title,entity_type,entity_id) values($1,$2,'team-chat',$3,'team-channel',$4)`, [c.client_id, id, clip(`${nameOf(u)} mentioned you in #${c.name}: ${text}`, 300), c.id]).catch(() => {});
      sendHubEmail({ to: p.email, subject: `${nameOf(u)} mentioned you in #${c.name}`, html: hubEmailShell(`${nameOf(u)} mentioned you`, `<p><b>${emailEscape(nameOf(u))}</b> in <b>#${emailEscape(c.name)}</b>:</p><p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(text.slice(0, 1200))}</p><p><a href="${emailEscape(`${clientHubUrl}/workspace?channel=${c.id}`)}">Reply in the hub</a></p>`) }).catch(() => {});
    }
    return reply.code(201).send({ message: msgView(m, u.id) });
  });

  app.delete('/v1/team-chat/messages/:id', { preHandler: authenticate }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Message not found', 404);
    const m = (await pool.query('select * from team_messages where id=$1', [req.params.id])).rows[0];
    if (!m || m.author_id !== uid(req)) return bad(reply, 'Only the person who wrote a message can take it back', 404);
    await pool.query('update team_messages set deleted_at=now() where id=$1', [m.id]);
    return { ok: true };
  });

  app.get('/v1/team-chat/rooms', { preHandler: authenticate }, async (req, reply) => {
    if (!admin(req)) return bad(reply, 'Future Basics only', 403);
    const rows = (await pool.query(`select c.id, c.name, count(distinct tc.id)::int channels,
        count(m.id) filter (where m.deleted_at is null and m.author_role='client' and m.created_at > coalesce((select last_read_at from team_channel_reads r where r.channel_id=tc.id and r.user_id=$1),'epoch'))::int unread,
        max(m.created_at) last_at
      from team_channels tc join clients c on c.id=tc.client_id left join team_messages m on m.channel_id=tc.id
      where tc.staff_in and tc.archived_at is null group by c.id, c.name order by max(m.created_at) desc nulls last limit 200`, [uid(req)])).rows;
    return { rooms: rows.map(r => ({ id: r.id, name: r.name, channels: r.channels, unread: r.unread, lastAt: r.last_at })) };
  });

  app.get('/v1/team-chat/people', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, 'Say which room', 422);
    return { people: [...(await team(cid)).map(p => ({ id: p.id, name: nameOf(p), handle: String(p.name || p.email.split('@')[0]).trim().split(/\s+/)[0] })), { id: 'fb', name: 'Future Basics', handle: 'futurebasics' }] };
  });
}
