// Trust & safety: anyone signed in can report anything; enough independent reports hide it until a
// moderator looks; moderators work a queue (remove, dismiss/restore, ban); admins appoint moderators.
import { createLimiter, normalizeHandle } from './lib.js';

export const REPORT_REASONS = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  hate: 'Hate or discrimination',
  violence: 'Violence or threats',
  sexual: 'Sexual content',
  minor_safety: 'Puts a child at risk',
  copyright: 'Copyright or broadcast rights',
  other: 'Something else'
};
export const REPORT_TYPES = ['post', 'comment', 'thread', 'reply', 'chat', 'match', 'user'];
const AUTO_HIDE_AT = Math.max(1, Number(process.env.REPORT_AUTOHIDE) || 3);
// A report that a child is at risk hides the content at once; a person checks it before it comes back.
const HIDE_IMMEDIATELY = new Set(['minor_safety']);
const ROLES = ['user', 'moderator', 'admin'];
const adminHandles = () => new Set(String(process.env.ADMIN_HANDLES || '').split(',').map(h => normalizeHandle(h)).filter(Boolean));

export function registerModeration(app, { pool, fail, requireUser, mediaUrl, onChatRemoved = () => {} }) {
  const reportLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 30 });
  const banned = new Set(); // user ids; checked on every request (tokens are stateless)

  async function roleOf(user) {
    if (!user) return 'user';
    if (adminHandles().has(user.handle)) return 'admin';
    const { rows: [row] } = await pool.query(`select role from users where id = $1`, [user.id]);
    return row?.role ?? 'user';
  }
  const requireMod = async (req, reply) => {
    if (!req.user) return fail(reply, 401, 'Sign in to continue.');
    req.role = await roleOf(req.user);
    if (req.role === 'user') return fail(reply, 403, 'Moderators only.');
  };

  // ---- what can be reported, and how to hide / restore each kind ----
  const targets = {
    post: {
      async load(id, req) {
        const { rows: [r] } = await pool.query(`select p.*, u.handle from posts p join users u on u.id = p.user_id where p.id = $1`, [id]);
        if (!r || !['published', 'removed'].includes(r.status)) return null;
        return { authorId: r.user_id, author: r.handle, hidden: r.status === 'removed', link: `/p/${r.id}`,
          snapshot: { title: r.title, body: r.description, image: mediaUrl(req, r.cover_key || (r.media_kind === 'image' ? r.media_key : null)) } };
      },
      hide: id => pool.query(`update posts set status = 'removed', updated_at = now() where id = $1 and status = 'published'`, [id]),
      restore: id => pool.query(`update posts set status = 'published', updated_at = now() where id = $1 and status = 'removed'`, [id])
    },
    comment: {
      async load(id) {
        if (!/^\d{1,18}$/.test(id)) return null;
        const { rows: [r] } = await pool.query(`select c.*, u.handle from comments c join users u on u.id = c.user_id where c.id = $1 and c.deleted_at is null`, [id]);
        return r && { authorId: r.user_id, author: r.handle, hidden: Boolean(r.hidden_at), link: `/p/${r.post_id}`, snapshot: { body: r.body } };
      },
      hide: id => pool.query(`update comments set hidden_at = now() where id = $1 and hidden_at is null`, [id]),
      restore: id => pool.query(`update comments set hidden_at = null where id = $1`, [id])
    },
    thread: {
      async load(id) {
        const { rows: [r] } = await pool.query(`select t.*, u.handle, f.slug from threads t join users u on u.id = t.user_id join fandoms f on f.id = t.fandom_id where t.id = $1 and t.deleted_at is null`, [id]);
        return r && { authorId: r.user_id, author: r.handle, hidden: Boolean(r.hidden_at), link: `/f/${r.slug}/t/${r.id}`, snapshot: { title: r.title, body: r.body } };
      },
      hide: id => pool.query(`update threads set hidden_at = now() where id = $1 and hidden_at is null`, [id]),
      restore: id => pool.query(`update threads set hidden_at = null where id = $1`, [id])
    },
    reply: {
      async load(id) {
        if (!/^\d{1,18}$/.test(id)) return null;
        const { rows: [r] } = await pool.query(`
          select r.*, u.handle, f.slug from replies r join users u on u.id = r.user_id join threads t on t.id = r.thread_id join fandoms f on f.id = t.fandom_id
          where r.id = $1 and r.deleted_at is null`, [id]);
        return r && { authorId: r.user_id, author: r.handle, hidden: Boolean(r.hidden_at), link: `/f/${r.slug}/t/${r.thread_id}`, snapshot: { body: r.body } };
      },
      hide: id => pool.query(`update replies set hidden_at = now() where id = $1 and hidden_at is null`, [id]),
      restore: id => pool.query(`update replies set hidden_at = null where id = $1`, [id])
    },
    chat: {
      async load(id) {
        if (!/^\d{1,18}$/.test(id)) return null;
        const { rows: [r] } = await pool.query(`select m.*, u.handle, f.slug from chat_messages m join users u on u.id = m.user_id join fandoms f on f.id = m.fandom_id where m.id = $1 and m.deleted_at is null`, [id]);
        return r && { authorId: r.user_id, author: r.handle, hidden: Boolean(r.hidden_at), link: `/f/${r.slug}?c=${r.channel}`, snapshot: { body: r.body },
          room: { fandomId: r.fandom_id, channel: r.channel } };
      },
      async hide(id, target) {
        const result = await pool.query(`update chat_messages set hidden_at = now() where id = $1 and hidden_at is null`, [id]);
        if (result.rowCount) onChatRemoved(target.room, Number(id));
        return result;
      },
      restore: id => pool.query(`update chat_messages set hidden_at = null where id = $1`, [id])
    },
    match: {
      async load(id) {
        const { rows: [r] } = await pool.query(`
          select m.*, u.handle, ht.name as home, aw.name as away from matches m join users u on u.id = m.created_by
          join teams ht on ht.id = m.home_team_id join teams aw on aw.id = m.away_team_id where m.id = $1`, [id]);
        return r && { authorId: r.created_by, author: r.handle, hidden: Boolean(r.hidden_at), link: `/m/${r.id}`,
          snapshot: { title: `${r.home} vs ${r.away}`, body: [r.competition, r.venue].filter(Boolean).join(' · ') } };
      },
      // A removed match drops out of every public list (unlisted); restoring makes it public again unless it's a youth match.
      hide: id => pool.query(`update matches set hidden_at = now(), visibility = 'unlisted' where id = $1 and hidden_at is null`, [id]),
      restore: id => pool.query(`update matches set hidden_at = null, visibility = case when youth then 'unlisted' else 'public' end where id = $1 and hidden_at is not null`, [id])
    },
    user: {
      async load(id) {
        const { rows: [r] } = await pool.query(`select * from users where handle = $1`, [normalizeHandle(id)]);
        return r && { authorId: r.id, author: r.handle, hidden: Boolean(r.banned_at), link: `/u/${r.handle}`, snapshot: { title: r.display_name, body: r.bio } };
      },
      hide: async () => {}, // profiles aren't hidden by reports; a moderator bans the account instead
      restore: async () => {}
    }
  };

  async function logAction(modId, action, type, id, note = '') {
    await pool.query(`insert into mod_actions (moderator_id, action, target_type, target_id, note) values ($1, $2, $3, $4, $5)`,
      [modId, action, type, String(id), note.slice(0, 500)]);
  }

  // ---- reporting ----
  app.get('/v1/reports/reasons', async () => ({ reasons: Object.entries(REPORT_REASONS).map(([key, label]) => ({ key, label })) }));

  app.post('/v1/reports', { preHandler: requireUser }, async (req, reply) => {
    if (!reportLimiter(`report:${req.user.id}`)) return fail(reply, 429, 'You’ve sent a lot of reports. Thanks — we’ll get through them.');
    const type = String(req.body?.type || '');
    const id = String(req.body?.id || '').slice(0, 64);
    const reason = String(req.body?.reason || '');
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    if (!REPORT_TYPES.includes(type) || !id) return fail(reply, 400, 'Nothing to report.');
    if (!REPORT_REASONS[reason]) return fail(reply, 400, 'Pick a reason.');
    const target = await targets[type].load(id, req);
    if (!target) return fail(reply, 404, 'That’s already gone.');
    if (Number(target.authorId) === req.user.id) return fail(reply, 400, 'You can delete your own posts instead.');
    const key = type === 'user' ? normalizeHandle(id) : id;
    await pool.query(`
      insert into reports (target_type, target_id, reporter_id, reason, note, snapshot, link, author_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (target_type, target_id, reporter_id) where status = 'open' do update set reason = excluded.reason, note = coalesce(nullif(excluded.note, ''), reports.note), created_at = now()`,
    [type, key, req.user.id, reason, note, JSON.stringify(target.snapshot), target.link, target.authorId]);
    const { rows: [{ reporters }] } = await pool.query(`
      select count(distinct reporter_id)::int as reporters from reports where target_type = $1 and target_id = $2 and status = 'open'`, [type, key]);
    if (!target.hidden && type !== 'user' && (reporters >= AUTO_HIDE_AT || HIDE_IMMEDIATELY.has(reason))) {
      await targets[type].hide(key, target);
      await pool.query(`update reports set auto_hidden = true where target_type = $1 and target_id = $2 and status = 'open'`, [type, key]);
    }
    return reply.code(201).send({ ok: true });
  });

  // ---- the moderator queue: one row per reported thing ----
  app.get('/v1/mod/reports', { preHandler: requireMod }, async req => {
    const open = req.query.status !== 'closed';
    const { rows } = await pool.query(`
      select r.target_type, r.target_id,
        count(*)::int as reports, count(distinct r.reporter_id)::int as reporters,
        jsonb_object_agg(r.reason, 1) as reasons_seen,
        min(r.created_at) as first_at, max(r.created_at) as last_at,
        bool_or(r.auto_hidden) as auto_hidden,
        (array_agg(r.snapshot order by r.created_at asc))[1] as snapshot,
        (array_agg(r.link order by r.created_at asc))[1] as link,
        (array_agg(r.note order by r.created_at desc) filter (where r.note <> ''))[1:3] as notes,
        max(r.status) as status, max(r.resolution) as resolution,
        max(u.handle) as author, bool_or(u.banned_at is not null) as author_banned
      from reports r left join users u on u.id = r.author_id
      where ${open ? `r.status = 'open'` : `r.status <> 'open' and r.resolved_at > now() - interval '30 days'`}
      group by r.target_type, r.target_id
      order by bool_or(r.reason = 'minor_safety') desc, count(distinct r.reporter_id) desc, max(r.created_at) desc
      limit 200`);
    const reasonCounts = await pool.query(`
      select target_type, target_id, reason, count(*)::int as n from reports
      where ${open ? `status = 'open'` : `status <> 'open' and resolved_at > now() - interval '30 days'`}
      group by target_type, target_id, reason`);
    const byTarget = new Map();
    for (const r of reasonCounts.rows) {
      const k = `${r.target_type}:${r.target_id}`;
      byTarget.set(k, { ...(byTarget.get(k) || {}), [r.reason]: r.n });
    }
    return {
      role: req.role,
      items: rows.map(r => ({
        type: r.target_type, id: r.target_id, reports: r.reports, reporters: r.reporters,
        reasons: byTarget.get(`${r.target_type}:${r.target_id}`) || {},
        firstAt: r.first_at, lastAt: r.last_at, autoHidden: r.auto_hidden, snapshot: r.snapshot, link: r.link,
        notes: r.notes || [], status: r.status, resolution: r.resolution, author: r.author, authorBanned: r.author_banned
      }))
    };
  });

  // remove: take it down for good · dismiss: nothing wrong (restores anything auto-hidden)
  app.post('/v1/mod/resolve', { preHandler: requireMod }, async (req, reply) => {
    const type = String(req.body?.type || '');
    const id = String(req.body?.id || '');
    const action = String(req.body?.action || '');
    if (!REPORT_TYPES.includes(type) || !['remove', 'dismiss'].includes(action)) return fail(reply, 400, 'Unknown action.');
    const target = await targets[type].load(id, req);
    if (target) {
      if (action === 'remove') await targets[type].hide(id, target);
      else if (target.hidden) await targets[type].restore(id);
    }
    const { rowCount } = await pool.query(`
      update reports set status = $3, resolution = $4, resolved_by = $5, resolved_at = now()
      where target_type = $1 and target_id = $2 and status = 'open'`,
    [type, id, action === 'remove' ? 'actioned' : 'dismissed', action === 'remove' ? 'removed' : 'no action', req.user.id]);
    await logAction(req.user.id, action, type, id, String(req.body?.note || ''));
    return { ok: true, resolved: rowCount };
  });

  // Undo a removal (from the closed tab, or anything a moderator took down by mistake).
  app.post('/v1/mod/restore', { preHandler: requireMod }, async (req, reply) => {
    const type = String(req.body?.type || '');
    const id = String(req.body?.id || '');
    if (!REPORT_TYPES.includes(type)) return fail(reply, 400, 'Unknown item.');
    const target = await targets[type].load(id, req);
    if (!target) return fail(reply, 404, 'That’s gone.');
    await targets[type].restore(id);
    await pool.query(`update reports set resolution = 'restored' where target_type = $1 and target_id = $2 and status <> 'open'`, [type, id]);
    await logAction(req.user.id, 'restore', type, id);
    return { ok: true };
  });

  app.post('/v1/mod/users/:handle/ban', { preHandler: requireMod }, async (req, reply) => {
    const { rows: [user] } = await pool.query(`select id, handle, role from users where handle = $1`, [normalizeHandle(req.params.handle)]);
    if (!user) return fail(reply, 404, 'No such account.');
    if (user.id === String(req.user.id) || Number(user.id) === req.user.id) return fail(reply, 400, 'You can’t ban yourself.');
    if (user.role !== 'user' || adminHandles().has(user.handle)) {
      if (req.role !== 'admin') return fail(reply, 403, 'Only an admin can ban a moderator.');
      if (adminHandles().has(user.handle)) return fail(reply, 400, 'This admin is set in the server config.');
    }
    const ban = req.body?.banned !== false;
    await pool.query(`update users set banned_at = ${ban ? 'now()' : 'null'}, role = case when $2 then 'user' else role end where id = $1`, [user.id, ban]);
    if (ban) banned.add(Number(user.id)); else banned.delete(Number(user.id));
    await logAction(req.user.id, ban ? 'ban' : 'unban', 'user', user.handle, String(req.body?.note || ''));
    return { banned: ban };
  });

  app.post('/v1/mod/users/:handle/role', { preHandler: requireMod }, async (req, reply) => {
    if (req.role !== 'admin') return fail(reply, 403, 'Admins only.');
    const role = String(req.body?.role || '');
    if (!ROLES.includes(role)) return fail(reply, 400, 'Unknown role.');
    const { rows: [user] } = await pool.query(`update users set role = $2 where handle = $1 and banned_at is null returning handle, role`, [normalizeHandle(req.params.handle), role]);
    if (!user) return fail(reply, 404, 'No such account.');
    await logAction(req.user.id, `role:${role}`, 'user', user.handle);
    return { handle: user.handle, role: user.role };
  });

  app.get('/v1/mod/team', { preHandler: requireMod }, async () => {
    const { rows } = await pool.query(`select handle, display_name, role from users where role <> 'user' order by role, handle`);
    const { rows: log } = await pool.query(`
      select a.*, u.handle as moderator from mod_actions a join users u on u.id = a.moderator_id order by a.created_at desc limit 50`);
    return {
      team: rows.map(r => ({ handle: r.handle, displayName: r.display_name, role: r.role })),
      admins: [...adminHandles()],
      log: log.map(a => ({ action: a.action, type: a.target_type, id: a.target_id, note: a.note, moderator: a.moderator, at: a.created_at }))
    };
  });

  return {
    roleOf,
    isBanned: id => banned.has(id),
    async loadBans() {
      const { rows } = await pool.query(`select id from users where banned_at is not null`);
      banned.clear();
      for (const r of rows) banned.add(Number(r.id));
      return banned.size;
    }
  };
}
