// Fandoms as communities, like a Discord server crossed with a subreddit: members, # channels holding
// Reddit-style threads (upvotes, nested replies), and a live chat channel for matchday.
import { createLimiter, randomId, slugify, POST_ID_RE } from './lib.js';

export const CHANNELS = [
  { slug: 'general', name: 'general', kind: 'threads', description: 'Anything about the club, the players and the culture.' },
  { slug: 'matchday', name: 'matchday', kind: 'chat', description: 'Live chat while the ball is rolling.' },
  { slug: 'transfers', name: 'transfers', kind: 'threads', description: 'Rumours, signings and sales.' },
  { slug: 'away-days', name: 'away-days', kind: 'threads', description: 'Travel, tickets, meet-ups and the best pubs near the ground.' },
  { slug: 'banter', name: 'banter', kind: 'threads', description: 'Memes, chants and friendly abuse.' }
];
const CHANNEL = new Map(CHANNELS.map(c => [c.slug, c]));
export const MAX_DEPTH = 6; // deeper replies attach beside their parent, so threads stay readable on a phone
const SORTS = {
  hot: `(t.score + 1) * (1 + ln(1 + t.reply_count)) / power(extract(epoch from (now() - t.last_activity_at)) / 3600 + 2, 1.5) desc, t.last_activity_at desc`,
  new: `t.created_at desc`,
  top: `t.score desc, t.created_at desc`
};
const clean = (value, max) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const REPLY_ID = /^\d{1,18}$/;

export function registerCommunity(app, { pool, fail, requireUser }) {
  const threadLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 6 });
  const replyLimiter = createLimiter({ windowMs: 60 * 1000, max: 12 });
  const chatLimiter = createLimiter({ windowMs: 10 * 1000, max: 6 });
  const rooms = new Map(); // `${fandomId}:${channel}` -> Set<raw>

  async function loadFandom(slug) {
    const { rows: [fandom] } = await pool.query(`select id, slug, name from fandoms where slug = $1`, [slugify(slug)]);
    return fandom || null;
  }
  const join = (fandomId, userId) => pool.query(`insert into fandom_members (fandom_id, user_id) values ($1, $2) on conflict do nothing`, [fandomId, userId]);

  const gone = row => Boolean(row.deleted_at || row.hidden_at); // deleted by its author or hidden by moderators
  const threadView = (row, extra = {}) => ({
    id: row.id,
    channel: row.channel,
    title: gone(row) ? '[removed]' : row.title,
    body: gone(row) ? '' : row.body,
    score: row.score,
    replyCount: row.reply_count,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    deleted: gone(row),
    author: gone(row) ? null : { handle: row.handle, displayName: row.display_name },
    fandom: row.fandom_slug ? { slug: row.fandom_slug, name: row.fandom_name } : undefined,
    viewerHasVoted: Boolean(row.voted),
    ...extra
  });
  const replyView = (row, userId) => ({
    id: Number(row.id),
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    depth: row.depth,
    body: gone(row) ? null : row.body,
    score: row.score,
    createdAt: row.created_at,
    deleted: gone(row),
    author: gone(row) ? null : { handle: row.handle, displayName: row.display_name },
    viewerHasVoted: Boolean(row.voted),
    canDelete: !gone(row) && userId != null && Number(row.user_id) === userId
  });
  const messageView = row => ({
    id: Number(row.id), body: row.body, createdAt: row.created_at, author: { handle: row.handle, displayName: row.display_name }
  });

  // ---- the hub ----
  app.get('/v1/fandoms/:slug/hub', async (req, reply) => {
    const fandom = await loadFandom(req.params.slug);
    if (!fandom) return fail(reply, 404, 'Fandom not found.');
    const { rows: [counts] } = await pool.query(`
      select (select count(*)::int from fandom_members where fandom_id = $1) as members,
        (select count(*)::int from posts where fandom_id = $1 and status = 'published' and visibility = 'public') as posts,
        exists(select 1 from fandom_members where fandom_id = $1 and user_id = $2) as joined`, [fandom.id, req.user?.id ?? null]);
    const { rows: activity } = await pool.query(`
      select channel, count(*)::int as threads, max(last_activity_at) as last_at from threads
      where fandom_id = $1 and deleted_at is null and hidden_at is null group by channel`, [fandom.id]);
    const byChannel = new Map(activity.map(a => [a.channel, a]));
    return {
      fandom: { slug: fandom.slug, name: fandom.name, memberCount: counts.members, postCount: counts.posts, joined: counts.joined },
      channels: CHANNELS.map(c => ({ ...c, threadCount: byChannel.get(c.slug)?.threads ?? 0, lastActivityAt: byChannel.get(c.slug)?.last_at ?? null,
        online: c.kind === 'chat' ? rooms.get(`${fandom.id}:${c.slug}`)?.size ?? 0 : undefined }))
    };
  });

  for (const method of ['POST', 'DELETE']) {
    app.route({ method, url: '/v1/fandoms/:slug/join', preHandler: requireUser, handler: async (req, reply) => {
      const fandom = await loadFandom(req.params.slug);
      if (!fandom) return fail(reply, 404, 'Fandom not found.');
      if (method === 'POST') await join(fandom.id, req.user.id);
      else await pool.query(`delete from fandom_members where fandom_id = $1 and user_id = $2`, [fandom.id, req.user.id]);
      const { rows: [{ members }] } = await pool.query(`select count(*)::int as members from fandom_members where fandom_id = $1`, [fandom.id]);
      return { joined: method === 'POST', memberCount: members };
    } });
  }

  // ---- threads ----
  const THREAD_SELECT = `
    select t.*, u.handle, u.display_name, f.slug as fandom_slug, f.name as fandom_name,
      exists(select 1 from thread_votes v where v.thread_id = t.id and v.user_id = $1) as voted
    from threads t join users u on u.id = t.user_id join fandoms f on f.id = t.fandom_id`;

  app.get('/v1/fandoms/:slug/threads', async (req, reply) => {
    const fandom = await loadFandom(req.params.slug);
    if (!fandom) return fail(reply, 404, 'Fandom not found.');
    const channel = CHANNEL.get(String(req.query.channel || 'general'));
    if (!channel || channel.kind !== 'threads') return fail(reply, 400, 'That channel doesn’t have threads.');
    const sort = SORTS[req.query.sort] ? req.query.sort : 'hot';
    const offset = Math.max(0, Math.min(1000, Number(req.query.offset) || 0));
    const { rows } = await pool.query(`${THREAD_SELECT}
      where t.fandom_id = $2 and t.channel = $3 and t.deleted_at is null and t.hidden_at is null
      order by ${SORTS[sort]} limit 26 offset $4`, [req.user?.id ?? null, fandom.id, channel.slug, offset]);
    return { threads: rows.slice(0, 25).map(r => threadView(r)), nextOffset: rows.length > 25 ? offset + 25 : null };
  });

  app.post('/v1/fandoms/:slug/threads', { preHandler: requireUser }, async (req, reply) => {
    if (!threadLimiter(`thread:${req.user.id}`)) return fail(reply, 429, 'You’ve started a lot of threads. Try again in a few minutes.');
    const fandom = await loadFandom(req.params.slug);
    if (!fandom) return fail(reply, 404, 'Fandom not found.');
    const channel = CHANNEL.get(String(req.body?.channel || 'general'));
    if (!channel || channel.kind !== 'threads') return fail(reply, 400, 'Pick a channel for your thread.');
    const title = clean(req.body?.title, 200).replace(/\s+/g, ' ');
    const body = clean(req.body?.body, 10_000);
    if (title.length < 3) return fail(reply, 400, 'Give your thread a title.');
    const id = randomId(10);
    await pool.query(`insert into threads (id, fandom_id, channel, user_id, title, body) values ($1, $2, $3, $4, $5, $6)`,
      [id, fandom.id, channel.slug, req.user.id, title, body]);
    await join(fandom.id, req.user.id); // posting in a fandom makes you part of it
    const { rows: [row] } = await pool.query(`${THREAD_SELECT} where t.id = $2`, [req.user.id, id]);
    return reply.code(201).send({ thread: threadView(row) });
  });

  async function loadThread(req, id) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows: [row] } = await pool.query(`${THREAD_SELECT} where t.id = $2`, [req.user?.id ?? null, id]);
    return row || null;
  }

  app.get('/v1/threads/:id', async (req, reply) => {
    const thread = await loadThread(req, req.params.id);
    if (!thread || (gone(thread) && !thread.reply_count)) return fail(reply, 404, 'Thread not found.');
    const { rows } = await pool.query(`
      select r.*, u.handle, u.display_name,
        exists(select 1 from reply_votes v where v.reply_id = r.id and v.user_id = $2) as voted
      from replies r join users u on u.id = r.user_id where r.thread_id = $1 order by r.created_at asc limit 2000`,
    [thread.id, req.user?.id ?? null]);
    return {
      thread: threadView(thread, { canDelete: !gone(thread) && req.user?.id === Number(thread.user_id) }),
      replies: rows.map(r => replyView(r, req.user?.id ?? null))
    };
  });

  app.delete('/v1/threads/:id', { preHandler: requireUser }, async (req, reply) => {
    const thread = await loadThread(req, req.params.id);
    if (!thread || thread.deleted_at || Number(thread.user_id) !== req.user.id) return fail(reply, 404, 'Thread not found.');
    await pool.query(`update threads set deleted_at = now() where id = $1`, [thread.id]);
    return reply.code(204).send();
  });

  app.post('/v1/threads/:id/replies', { preHandler: requireUser }, async (req, reply) => {
    if (!replyLimiter(`reply:${req.user.id}`)) return fail(reply, 429, 'Slow down a little.');
    const thread = await loadThread(req, req.params.id);
    if (!thread || gone(thread)) return fail(reply, 404, 'Thread not found.');
    const body = clean(req.body?.body, 5000);
    if (!body) return fail(reply, 400, 'Write something first.');
    let parentId = null, depth = 0;
    if (req.body?.parentId != null) {
      if (!REPLY_ID.test(String(req.body.parentId))) return fail(reply, 400, 'That reply no longer exists.');
      const { rows: [parent] } = await pool.query(`select id, parent_id, depth from replies where id = $1 and thread_id = $2`, [req.body.parentId, thread.id]);
      if (!parent) return fail(reply, 400, 'That reply no longer exists.');
      // Past the depth limit, a reply sits beside its parent instead of under it.
      if (parent.depth >= MAX_DEPTH) { parentId = parent.parent_id; depth = parent.depth; } else { parentId = parent.id; depth = parent.depth + 1; }
    }
    const { rows: [row] } = await pool.query(`
      with inserted as (insert into replies (thread_id, parent_id, depth, user_id, body) values ($1, $2, $3, $4, $5) returning *),
      bump as (update threads set reply_count = reply_count + 1, last_activity_at = now() where id = $1)
      select i.*, u.handle, u.display_name, false as voted from inserted i join users u on u.id = i.user_id`,
    [thread.id, parentId, depth, req.user.id, body]);
    return reply.code(201).send({ reply: replyView(row, req.user.id) });
  });

  app.delete('/v1/replies/:id', { preHandler: requireUser }, async (req, reply) => {
    if (!REPLY_ID.test(req.params.id)) return fail(reply, 404, 'Reply not found.');
    const { rowCount } = await pool.query(`update replies set deleted_at = now(), body = null where id = $1 and user_id = $2 and deleted_at is null`, [req.params.id, req.user.id]);
    if (!rowCount) return fail(reply, 404, 'Reply not found.');
    return reply.code(204).send();
  });

  // Upvotes: value 1 adds yours, 0 takes it back. Scores are kept on the row for ranking.
  async function vote(table, key, id, userId, up, scoreTable) {
    const changed = up
      ? await pool.query(`insert into ${table} (${key}, user_id) values ($1, $2) on conflict do nothing`, [id, userId])
      : await pool.query(`delete from ${table} where ${key} = $1 and user_id = $2`, [id, userId]);
    if (changed.rowCount) await pool.query(`update ${scoreTable} set score = score + $2 where id = $1`, [id, up ? 1 : -1]);
    const { rows: [row] } = await pool.query(`select score from ${scoreTable} where id = $1`, [id]);
    return { score: row.score, viewerHasVoted: up };
  }
  app.post('/v1/threads/:id/vote', { preHandler: requireUser }, async (req, reply) => {
    const thread = await loadThread(req, req.params.id);
    if (!thread || gone(thread)) return fail(reply, 404, 'Thread not found.');
    return vote('thread_votes', 'thread_id', thread.id, req.user.id, Number(req.body?.value) === 1, 'threads');
  });
  app.post('/v1/replies/:id/vote', { preHandler: requireUser }, async (req, reply) => {
    if (!REPLY_ID.test(req.params.id)) return fail(reply, 404, 'Reply not found.');
    const { rows: [row] } = await pool.query(`select id from replies where id = $1 and deleted_at is null and hidden_at is null`, [req.params.id]);
    if (!row) return fail(reply, 404, 'Reply not found.');
    return vote('reply_votes', 'reply_id', row.id, req.user.id, Number(req.body?.value) === 1, 'replies');
  });

  // ---- live chat channels ----
  async function chatChannel(req, reply) {
    const fandom = await loadFandom(req.params.slug);
    const channel = CHANNEL.get(req.params.channel);
    if (!fandom || !channel || channel.kind !== 'chat') { fail(reply, 404, 'Chat not found.'); return null; }
    return { fandom, channel, room: `${fandom.id}:${channel.slug}` };
  }
  const broadcast = (room, event, data) => {
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const raw of rooms.get(room) ?? []) raw.write(line);
  };

  app.get('/v1/fandoms/:slug/chat/:channel', async (req, reply) => {
    const chat = await chatChannel(req, reply);
    if (!chat) return;
    const before = Number(req.query.before) || null;
    const { rows } = await pool.query(`
      select m.*, u.handle, u.display_name from chat_messages m join users u on u.id = m.user_id
      where m.fandom_id = $1 and m.channel = $2 and m.deleted_at is null and m.hidden_at is null and ($3::bigint is null or m.id < $3)
      order by m.id desc limit 60`, [chat.fandom.id, chat.channel.slug, before]);
    return { messages: rows.reverse().map(messageView), online: rooms.get(chat.room)?.size ?? 0 };
  });

  app.post('/v1/fandoms/:slug/chat/:channel', { preHandler: requireUser }, async (req, reply) => {
    if (!chatLimiter(`chat:${req.user.id}`)) return fail(reply, 429, 'Easy, ultra. One second between messages.');
    const chat = await chatChannel(req, reply);
    if (!chat) return;
    const body = clean(req.body?.body, 500);
    if (!body) return fail(reply, 400, 'Write something first.');
    const { rows: [row] } = await pool.query(`
      with inserted as (insert into chat_messages (fandom_id, channel, user_id, body) values ($1, $2, $3, $4) returning *)
      select i.*, u.handle, u.display_name from inserted i join users u on u.id = i.user_id`,
    [chat.fandom.id, chat.channel.slug, req.user.id, body]);
    await join(chat.fandom.id, req.user.id);
    const message = messageView(row);
    broadcast(chat.room, 'message', message);
    return reply.code(201).send({ message });
  });

  app.get('/v1/fandoms/:slug/chat/:channel/stream', async (req, reply) => {
    const chat = await chatChannel(req, reply);
    if (!chat) return;
    reply.hijack();
    reply.raw.writeHead(200, {
      ...reply.getHeaders(),
      'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no'
    });
    if (!rooms.has(chat.room)) rooms.set(chat.room, new Set());
    const room = rooms.get(chat.room);
    room.add(reply.raw);
    reply.raw.write(`retry: 3000\n\n`);
    broadcast(chat.room, 'online', { online: room.size });
    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 25_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      room.delete(reply.raw);
      if (!room.size) rooms.delete(chat.room);
      else broadcast(chat.room, 'online', { online: room.size });
    });
  });

  app.addHook('onClose', async () => {
    for (const room of rooms.values()) for (const raw of room) raw.end();
    rooms.clear();
  });

  return {
    // Moderators took a chat message down: everyone in the room drops it.
    removeChatMessage: ({ fandomId, channel }, id) => broadcast(`${fandomId}:${channel}`, 'remove', { id })
  };
}
