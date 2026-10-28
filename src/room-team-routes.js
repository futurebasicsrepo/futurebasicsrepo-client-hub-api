// A client room's team, as the room manages it from the hub (the console keeps its own Team access page for staff, src/team.html):
//   GET    /v1/client/team          who is on the team: signed in, or invited and not yet in; who owns the room; which email domains let anyone in
//   POST   /v1/client/team          {email, name?} add a teammate: their address may now sign in to the room, and they get an email with the way in
//   DELETE /v1/client/team/:id      take a teammate off: they can no longer sign in, and a session they hold stops working; their work stays theirs by name
// A teammate sees everything the room has: its projects, tech packs, files, messages, and the Design Lab with its plans, concepts and libraries.
// The room's owner (its contact address) cannot be taken off from the hub; Future Basics changes the owner from the console.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const TEAM_MAX = 25;

export function teamView({ client, users, you }) {
  const owner = String(client.contact_email || '').toLowerCase(), byId = new Map(users.map(u => [u.id, u]));
  const live = users.filter(u => !u.removed_at && u.role === 'client');
  const seen = new Set(users.filter(u => u.role === 'client').map(u => u.email.toLowerCase())); // a removed teammate's address is not an invitation
  const members = live.map(u => ({
    id: u.id, email: u.email, name: u.name || '', status: u.last_sign_in_at || u.email_verified_at ? 'active' : 'invited', owner: u.email.toLowerCase() === owner, you: u.id === you,
    invitedBy: u.invited_by && byId.get(u.invited_by) ? (byId.get(u.invited_by).name || byId.get(u.invited_by).email) : '', invitedAt: u.invited_at || null, lastSignInAt: u.last_sign_in_at || null
  }));
  // an address on the room's sign-in list that has never signed in has no user row yet: it still counts as invited
  for (const e of client.allowed_emails || []) { const l = String(e).toLowerCase(); if (!l || seen.has(l)) continue; seen.add(l); members.push({ id: null, email: l, name: '', status: 'invited', owner: l === owner, you: false, invitedBy: '', invitedAt: null, lastSignInAt: null }); }
  members.sort((a, b) => (b.owner - a.owner) || (a.status === b.status ? a.email.localeCompare(b.email) : a.status === 'active' ? -1 : 1));
  return { members, domains: client.email_domains || [], max: TEAM_MAX };
}

export function registerRoomTeamRoutes(app, d) {
  const { pool, authenticate, clientHubUrl = '', sendHubEmail = async () => false, hubEmailShell = (t, b) => b, emailEscape = s => String(s), replyTo = '', forgetUser = () => {}, log = console } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const roomOf = req => (req.auth?.role === 'client' && UUID.test(String(req.auth.clientId || '')) ? req.auth.clientId : null);
  const load = async cid => {
    const client = (await pool.query('select id, name, slug, contact_email, allowed_emails, email_domains from clients where id=$1', [cid])).rows[0];
    const users = client ? (await pool.query('select id, email, name, role, removed_at, invited_by, invited_at, email_verified_at, last_sign_in_at from users where client_id=$1 order by created_at', [cid])).rows : [];
    return { client, users };
  };

  app.get('/v1/client/team', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    const { client, users } = await load(cid); if (!client) return bad(reply, 'Not found', 404);
    return { ...teamView({ client, users, you: req.auth.sub }), room: client.name, preview: req.auth.preview === true };
  });

  app.post('/v1/client/team', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401); if (req.auth.preview) return bad(reply, 'Client preview is read-only', 403);
    const email = clip(req.body?.email, 254).toLowerCase(), name = clip(req.body?.name, 80);
    if (!EMAIL.test(email)) return bad(reply, 'That email address does not look right');
    if (email.endsWith('@thefuturebasics.com')) return bad(reply, 'Future Basics is already on every room');
    const { client, users } = await load(cid); if (!client) return bad(reply, 'Not found', 404);
    const view = teamView({ client, users, you: req.auth.sub });
    if (view.members.some(m => m.email === email)) return bad(reply, 'They are already on the team', 409);
    if (view.members.length >= TEAM_MAX) return bad(reply, `A room holds up to ${TEAM_MAX} people. Take someone off first.`, 409);
    // an address that already signs in to another room stays there: one person, one room
    const other = (await pool.query(`select u.id from users u join clients c on c.id=u.client_id where lower(u.email)=$1 and u.client_id<>$2 and u.removed_at is null and c.status='active' and c.archived_at is null`, [email, cid])).rows[0];
    if (other) return bad(reply, 'That address already has its own room with Future Basics. Ask them to use another address, or ask Future Basics to move them.', 409);
    const by = UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null;
    const c = await pool.connect(); let user;
    try {
      await c.query('begin');
      await c.query(`update clients set allowed_emails=(select array_agg(distinct e) from unnest(coalesce(allowed_emails,'{}')||array[$2]::text[]) e) where id=$1`, [cid, email]);
      user = (await c.query(`insert into users(client_id, email, name, role, invited_by, invited_at) values($1,$2,nullif($3,''),'client',$4,now())
        on conflict(email) do update set client_id=excluded.client_id, removed_at=null, invited_by=excluded.invited_by, invited_at=now(), name=coalesce(users.name, excluded.name) returning *`, [cid, email, name, by])).rows[0];
      await c.query(`insert into activities(client_id, actor_id, type, summary) values($1,$2,'client',$3)`, [cid, by, `${req.auth.email || 'A teammate'} added ${email} to the team`]);
      await c.query('commit');
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
    forgetUser(user.id);
    let emailed = false;
    try {
      const from = clip(users.find(u => u.id === by)?.name, 80) || req.auth.email || 'Your team';
      emailed = await sendHubEmail({ to: email, replyTo: req.auth.email || replyTo || undefined, subject: `${from} added you to ${client.name} on Future Basics`,
        html: hubEmailShell(`You are on the ${client.name} team`, `<p>${name ? `Hi ${emailEscape(name.split(' ')[0])},</p><p>` : ''}${emailEscape(from)} added you to <strong>${emailEscape(client.name)}</strong>'s room with Future Basics: its projects, tech packs, files and messages, and the Design Lab when it is open, with the plans, concepts and libraries the team shares.</p><p><a href="${emailEscape(clientHubUrl)}/">Open the room</a> and sign in with this address. There is no password: we send a six-digit code.</p>`) });
    } catch (e) { log.warn?.({ err: e.message }, 'team invite email not sent'); }
    return reply.code(201).send({ ...teamView({ client: { ...client, allowed_emails: [...(client.allowed_emails || []), email] }, users: [...users.filter(u => u.id !== user.id), user], you: req.auth.sub }), emailed });
  });

  app.delete('/v1/client/team/:id', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401); if (req.auth.preview) return bad(reply, 'Client preview is read-only', 403);
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    const { client, users } = await load(cid); if (!client) return bad(reply, 'Not found', 404);
    const u = users.find(x => x.id === req.params.id && !x.removed_at && x.role === 'client'); if (!u) return bad(reply, 'Not found', 404);
    if (u.email.toLowerCase() === String(client.contact_email || '').toLowerCase()) return bad(reply, 'The room\'s owner stays on the team. Ask Future Basics to change the owner first.', 409);
    if (u.id === req.auth.sub) return bad(reply, 'Ask a teammate to take you off the team', 409);
    await pool.query('update users set removed_at=now() where id=$1', [u.id]);
    await pool.query(`update clients set allowed_emails=array(select e from unnest(coalesce(allowed_emails,'{}')) e where lower(e)<>lower($2)) where id=$1`, [cid, u.email]);
    await pool.query(`insert into activities(client_id, actor_id, type, summary) values($1,$2,'client',$3)`, [cid, UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null, `${req.auth.email || 'A teammate'} took ${u.email} off the team`]).catch(() => {});
    forgetUser(u.id);
    const after = await load(cid);
    return teamView({ client: after.client, users: after.users, you: req.auth.sub });
  });
  log.info?.('room team routes ready');
}
