// Sites and prototypes in a client's room: staff push a build from the showcase (a concept site, a prototype, a live store) or any link into a
// room, and the room's team sees it in their hub under "Your sites": its picture, where it stands, an Open button, and a box to send notes back.
//
//   staff   GET    /v1/admin/clients/:id/sites            what the room has, the showcase builds that can be pushed, and the notes sent back
//           POST   /v1/admin/clients/:id/sites            { buildId } or { name, url }, note?, email?   push one into the room
//           DELETE /v1/admin/clients/:id/sites/:sid       take it out of the room (the showcase invites made for it are revoked)
//   client  GET    /v1/sites                              the room's sites
//           GET    /v1/sites/:sid/cover                   its picture
//           POST   /v1/sites/:sid/open                    → { url } (the visit is counted on the showcase, like a showcase visit)
//           POST   /v1/sites/:sid/feedback                { text } notes for Future Basics: kept on the site and sent to staff
//
// A build pushed into a room also gives each person on the room's team a showcase invite for that build (a year), so it opens for them on the
// showcase too. A client only ever sees its own room's sites; a preview of the room is read-only.
import { readFileSync, existsSync } from 'node:fs';
import { cleanUrl } from './builds.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const PREVIEW_DIR = new URL('./builds-previews/', import.meta.url);
const STATUS_WORDS = { live: 'Live', concept: 'Concept', 'in-progress': 'In progress', archived: 'Archived' };

// the tables are made in src/db.js (room_sites, room_site_feedback)

export function registerRoomSitesRoutes(app, d) {
  const { pool, authenticate, adminOnly, notifyStaff = async () => {}, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, emailEscape = s => String(s), clientHubUrl = '', workHubUrl = '', log = console } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const uid = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const SELECT = `select s.*, b.slug, b.name build_name, b.tagline, b.status build_status, b.live_url, b.sector, (b.media->>'cover') is not null has_cover,
      (select count(*)::int from room_site_feedback f where f.site_id=s.id) feedback_count
    from room_sites s left join builds b on b.id=s.build_id`;
  const view = r => ({
    id: r.id, buildId: r.build_id, slug: r.slug || '', name: r.build_id ? r.build_name : r.name, tagline: r.build_id ? r.tagline || '' : '', sector: r.sector || '',
    status: r.build_id ? r.build_status : 'live', statusWords: r.build_id ? STATUS_WORDS[r.build_status] || r.build_status : 'Link',
    hasUrl: Boolean(r.build_id ? r.live_url : r.url), hasCover: Boolean(r.build_id && (r.has_cover || (r.slug && existsSync(new URL(`${r.slug}.jpg`, PREVIEW_DIR))))),
    note: r.note, addedAt: r.created_at, feedbackCount: r.feedback_count || 0
  });
  const team = async cid => (await pool.query(`select id, email, coalesce(nullif(name,''), split_part(email,'@',1)) name from users where client_id=$1 and role='client' and removed_at is null`, [cid])).rows;
  const siteOf = async (cid, sid) => UUID.test(String(sid || '')) ? (await pool.query(`${SELECT} where s.id=$1 and s.client_id=$2 and s.removed_at is null`, [sid, cid])).rows[0] || null : null;

  // ---- staff ----
  app.get('/v1/admin/clients/:id/sites', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const rows = (await pool.query(`${SELECT} where s.client_id=$1 and s.removed_at is null order by s.created_at desc`, [req.params.id])).rows;
    const builds = (await pool.query(`select id, slug, name, status, visibility, live_url from builds where status<>'archived' order by lower(name)`)).rows
      .map(b => ({ id: b.id, slug: b.slug, name: b.name, status: b.status, visibility: b.visibility, live: Boolean(b.live_url), inRoom: rows.some(r => r.build_id === b.id) }));
    const feedback = (await pool.query(`select f.id, f.site_id, f.author_name, f.body, f.created_at from room_site_feedback f join room_sites s on s.id=f.site_id where f.client_id=$1 and s.removed_at is null order by f.created_at desc limit 50`, [req.params.id])).rows
      .map(f => ({ id: f.id, siteId: f.site_id, by: f.author_name, text: f.body, at: f.created_at }));
    return { sites: rows.map(view).map(s => ({ ...s, url: rows.find(r => r.id === s.id)?.live_url || rows.find(r => r.id === s.id)?.url || '' })), builds, feedback };
  });

  app.post('/v1/admin/clients/:id/sites', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const c = (await pool.query('select id, name from clients where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Client not found', 404);
    const b = req.body || {}, note = clip(b.note, 400);
    let build = null, name = '', url = '';
    if (b.buildId) {
      build = UUID.test(String(b.buildId)) ? (await pool.query('select id, slug, name, live_url, status from builds where id=$1', [b.buildId])).rows[0] : null;
      if (!build) return bad(reply, 'That build is not in the showcase', 404);
      if ((await pool.query('select 1 from room_sites where client_id=$1 and build_id=$2 and removed_at is null', [c.id, build.id])).rowCount) return bad(reply, `${build.name} is already in this room`, 409);
    } else {
      name = clip(b.name, 80); url = cleanUrl(b.url) || '';
      if (!name) return bad(reply, 'Give it a name'); if (!url) return bad(reply, 'Give it an address that starts with https://');
    }
    if ((await pool.query('select count(*)::int n from room_sites where client_id=$1 and removed_at is null', [c.id])).rows[0].n >= 40) return bad(reply, 'A room holds 40 sites. Take one out first.', 409);
    const s = (await pool.query(`insert into room_sites(client_id, build_id, name, url, note, added_by) values($1,$2,$3,$4,$5,$6) returning id`, [c.id, build?.id || null, name, url, note, uid(req)])).rows[0];
    const people = await team(c.id), title = build ? build.name : name;
    // the showcase opens it for them too: an invite for this build for each person on the team (a year), tagged with the room's site
    if (build) for (const p of people) {
      if (!(await pool.query(`select 1 from build_invites where lower(email)=lower($1) and (build_id=$2 or build_id is null) and revoked_at is null and expires_at > now()`, [p.email, build.id])).rowCount)
        await pool.query(`insert into build_invites(email, build_id, invited_by, note, expires_at) values($1,$2,$3,$4, now() + interval '365 days')`, [p.email, build.id, uid(req), `room-site:${s.id}`]).catch(() => {});
    }
    await pool.query(`insert into notifications(client_id, type, title, entity_type, entity_id) values($1,'room-site',$2,'room-site',$3)`, [c.id, clip(`New in your room: ${title}`, 300), s.id]).catch(() => {});
    let emailed = 0;
    if (b.email === true) for (const p of people) {
      const ok = await sendHubEmail({ to: p.email, subject: `${title} is ready to look at`, html: hubEmailShell(`${title} is in your room`, `<p>Future Basics added <b>${emailEscape(title)}</b> to your room.${note ? `</p><p style="padding:12px 14px;border-left:3px solid #4bff9a;background:#f5f5f2">${emailEscape(note)}` : ''}</p><p><a href="${emailEscape(`${clientHubUrl}/#sites`)}">Open it in your hub</a>, and send us your notes from there.</p>`) }).catch(() => false);
      if (ok) emailed++;
    }
    const row = await siteOf(c.id, s.id);
    return reply.code(201).send({ site: view(row), invited: build ? people.length : 0, emailed });
  });

  app.delete('/v1/admin/clients/:id/sites/:sid', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const s = await siteOf(req.params.id, req.params.sid); if (!s) return bad(reply, 'Not in this room', 404);
    await pool.query('update room_sites set removed_at=now() where id=$1', [s.id]);
    await pool.query(`update build_invites set revoked_at=now() where note=$1 and revoked_at is null`, [`room-site:${s.id}`]);
    return { ok: true };
  });

  // ---- the room's team ----
  const room = (req, reply) => { const cid = req.auth?.role === 'client' && UUID.test(String(req.auth?.clientId || '')) ? req.auth.clientId : null; if (!cid) bad(reply, 'Sign in to your room', 401); return cid; };
  app.get('/v1/sites', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    return { sites: (await pool.query(`${SELECT} where s.client_id=$1 and s.removed_at is null order by s.created_at desc`, [cid])).rows.map(view) };
  });
  app.get('/v1/sites/:sid/cover', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    const s = await siteOf(cid, req.params.sid); if (!s?.build_id) return bad(reply, 'No picture', 404);
    const cover = (await pool.query(`select media->>'cover' c from builds where id=$1`, [s.build_id])).rows[0]?.c, m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(cover || '');
    if (m) return reply.header('cache-control', 'private, max-age=300').type(m[1]).send(Buffer.from(m[2], 'base64'));
    const file = s.slug && /^[a-z0-9-]+$/.test(s.slug) ? new URL(`${s.slug}.jpg`, PREVIEW_DIR) : null;
    if (file && existsSync(file)) return reply.header('cache-control', 'private, max-age=3600').type('image/jpeg').send(readFileSync(file));
    return bad(reply, 'No picture', 404);
  });
  app.post('/v1/sites/:sid/open', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    const s = await siteOf(cid, req.params.sid); if (!s) return bad(reply, 'Not in your room', 404);
    const url = s.build_id ? s.live_url : s.url; if (!url) return bad(reply, 'It is not online yet: Future Basics will tell you when it is', 409);
    if (s.build_id && req.auth?.email && !req.auth.preview) await pool.query(`insert into build_views(email, build_id, kind) values($1,$2,'open')`, [String(req.auth.email).toLowerCase(), s.build_id]).catch(() => {});
    return { url };
  });
  app.post('/v1/sites/:sid/feedback', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    const s = await siteOf(cid, req.params.sid); if (!s) return bad(reply, 'Not in your room', 404);
    const text = String(req.body?.text || '').replace(/\r/g, '').trim().slice(0, 4000); if (!text) return bad(reply, 'Write your notes first');
    const u = uid(req) ? (await pool.query('select id, email, coalesce(nullif(name,\'\'), split_part(email,\'@\',1)) name from users where id=$1', [uid(req)])).rows[0] : null;
    await pool.query(`insert into room_site_feedback(site_id, client_id, user_id, author_name, body) values($1,$2,$3,$4,$5)`, [s.id, cid, u?.id || null, clip(u?.name || req.auth?.email || 'The client', 80), text]);
    const roomName = (await pool.query('select name from clients where id=$1', [cid])).rows[0]?.name || 'A client', title = s.build_id ? s.build_name : s.name;
    notifyStaff(`${roomName} sent notes on ${title}`, `<p><b>${emailEscape(u?.name || 'The client')}</b> (${emailEscape(roomName)}) on <b>${emailEscape(title)}</b>:</p><p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(text.slice(0, 2000))}</p><p><a href="${emailEscape(`${workHubUrl}/clients/${cid}`)}">Open the room</a></p>`).catch(err => log.warn?.({ err: err.message }, 'room site notes: staff not told'));
    return reply.code(201).send({ ok: true });
  });
}
