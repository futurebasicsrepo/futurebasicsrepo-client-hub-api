// The owners' side of staff module access, and what every signed-in person reads about their own.
//
//   GET  /v1/staff-access/me                       any staff: what I may open { owner, blocked, modules, waiting (owners only) }
//   GET  /v1/staff-access                          owners: the modules, the presets, the default for new people and everyone on the team with what they have
//   PUT  /v1/staff-access/users/:id                owners: { modules?, blocked?, note? } for one person (never for an owner)
//   PUT  /v1/staff-access/defaults                 owners: { modules } what a new person starts with
//   GET  /v1/staff-access/log                      owners: the last changes, who made them
//
// The rules are in staff-access.js; server.js refuses a request in `authenticate` when the person has not been given its module.
import { MODULES, MODULE_IDS, PRESETS, cleanModules, isOwner, ownerList, moduleLabel } from './staff-access.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerStaffAccessRoutes(app, { pool, authenticate, adminOnly, staffAccess, env = process.env, log = console }) {
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const staff = [authenticate, adminOnly];
  async function ownerOnly(req, reply) {
    if (req.auth?.role !== 'admin') return reply.code(403).send({ error: 'Future Basics admin access required' });
    const r = req.staff || await staffAccess.reachOf(req.auth);
    if (!r.owner) return reply.code(403).send({ error: 'Only Danielle and Kyle can change who sees what' });
  }
  const owners = [authenticate, ownerOnly];
  const me = async req => (await pool.query('select id, email, name from users where id=$1', [UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null]).catch(() => ({ rows: [] }))).rows[0] || { id: null, email: req.auth?.email || '', name: '' };

  // staff with no row yet have not been looked at by an owner: the menu tells the owners how many are waiting
  async function waiting() {
    const rows = (await pool.query(`select u.email from users u left join staff_access sa on sa.user_id=u.id where u.role='admin' and sa.user_id is null and lower(u.email) not like 'preview@%'`)).rows;
    return rows.filter(r => !isOwner(r.email, env)).length;
  }

  app.get('/v1/staff-access/me', { preHandler: staff }, async (req) => {
    const r = req.staff || await staffAccess.reachOf(req.auth);
    return { owner: r.owner, blocked: r.blocked, modules: r.modules, all: r.modules.length === MODULE_IDS.length, labels: Object.fromEntries(MODULES.map(m => [m.id, m.label])), waiting: r.owner ? await waiting() : 0 };
  });

  app.get('/v1/staff-access', { preHandler: owners }, async () => {
    const defaults = await staffAccess.defaults();
    const rows = (await pool.query(`select u.id, u.email, u.name, u.created_at, sa.modules, sa.blocked, sa.note, sa.updated_at, sa.updated_by, ub.name updated_by_name, ub.email updated_by_email
      from users u left join staff_access sa on sa.user_id=u.id left join users ub on ub.id=sa.updated_by where u.role='admin' and lower(u.email) not like 'preview@%' order by lower(coalesce(nullif(u.name,''), u.email))`)).rows;
    const team = rows.map(r => {
      const owner = isOwner(r.email, env), configured = Boolean(r.modules);
      return { id: r.id, email: r.email, name: r.name || '', owner, configured, blocked: Boolean(r.blocked) && !owner, note: r.note || '', since: r.created_at,
        modules: owner ? MODULE_IDS : configured ? cleanModules(r.modules) : defaults, usingDefault: !owner && !configured,
        updatedAt: r.updated_at || null, updatedBy: r.updated_by_name || r.updated_by_email || '' };
    }).sort((a, b) => Number(b.owner) - Number(a.owner) || Number(a.configured) - Number(b.configured) || a.email.localeCompare(b.email));
    return { modules: MODULES, presets: PRESETS, defaults, team, owners: ownerList(env), money: 'Money, and signing for Future Basics, stay with the people named in MONEY_ACCESS_EMAILS. They are not part of this page.' };
  });

  app.put('/v1/staff-access/users/:id', { preHandler: owners }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return bad(reply, 'Choose a person', 404);
    const u = (await pool.query(`select id, email, name from users where id=$1 and role='admin'`, [req.params.id])).rows[0]; if (!u) return bad(reply, 'That person is not on the team', 404);
    if (isOwner(u.email, env)) return bad(reply, 'Danielle and Kyle always have full access, so there is nothing to change', 409);
    const b = req.body || {}, cur = (await pool.query('select modules, blocked, note from staff_access where user_id=$1', [u.id])).rows[0];
    if (b.modules !== undefined && !Array.isArray(b.modules)) return bad(reply, 'Send the modules as a list');
    const unknown = Array.isArray(b.modules) ? b.modules.map(String).filter(m => !MODULE_IDS.includes(m)) : [];
    if (unknown.length) return bad(reply, `Unknown module: ${unknown[0]}`);
    const modules = b.modules !== undefined ? cleanModules(b.modules) : cur ? cleanModules(cur.modules) : await staffAccess.defaults();
    const blocked = b.blocked !== undefined ? Boolean(b.blocked) : Boolean(cur?.blocked), note = b.note !== undefined ? String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, 200) : (cur?.note || '');
    const actor = await me(req);
    await pool.query(`insert into staff_access(user_id, modules, blocked, note, updated_by, updated_at) values($1,$2::text[],$3,$4,$5,now())
      on conflict (user_id) do update set modules=excluded.modules, blocked=excluded.blocked, note=excluded.note, updated_by=excluded.updated_by, updated_at=now()`, [u.id, modules, blocked, note, actor.id]);
    const before = cur ? cleanModules(cur.modules) : null;
    await pool.query(`insert into staff_access_log(user_id, user_email, actor_id, actor_email, change) values($1,$2,$3,$4,$5::jsonb)`,
      [u.id, u.email, actor.id, actor.email, JSON.stringify({ before: before ? { modules: before, blocked: Boolean(cur.blocked) } : null, after: { modules, blocked },
        added: modules.filter(m => !(before || []).includes(m)), removed: (before || []).filter(m => !modules.includes(m)) })]).catch(() => {});
    staffAccess.forget(u.id);
    return { ok: true, person: { id: u.id, email: u.email, modules, blocked, note, configured: true } };
  });

  app.put('/v1/staff-access/defaults', { preHandler: owners }, async (req, reply) => {
    if (!Array.isArray(req.body?.modules)) return bad(reply, 'Send the modules as a list');
    const unknown = req.body.modules.map(String).filter(m => !MODULE_IDS.includes(m)); if (unknown.length) return bad(reply, `Unknown module: ${unknown[0]}`);
    const before = await staffAccess.defaults(), modules = await staffAccess.setDefaults(req.body.modules), actor = await me(req);
    await pool.query(`insert into staff_access_log(user_email, actor_id, actor_email, change) values('(new people)',$1,$2,$3::jsonb)`, [actor.id, actor.email, JSON.stringify({ before: { modules: before }, after: { modules }, added: modules.filter(m => !before.includes(m)), removed: before.filter(m => !modules.includes(m)) })]).catch(() => {});
    return { ok: true, defaults: modules };
  });

  app.get('/v1/staff-access/log', { preHandler: owners }, async () => ({
    log: (await pool.query(`select id, user_email, actor_email, change, at from staff_access_log order by at desc, id desc limit 60`)).rows.map(r => ({ id: Number(r.id), person: r.user_email, by: r.actor_email, added: (r.change.added || []).map(moduleLabel), removed: (r.change.removed || []).map(moduleLabel), paused: r.change.after?.blocked === true && !r.change.before?.blocked, resumed: r.change.after?.blocked === false && r.change.before?.blocked === true, at: r.at }))
  }));
}
