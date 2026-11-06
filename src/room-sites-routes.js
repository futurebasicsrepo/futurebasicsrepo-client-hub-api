// Sites and prototypes in a client's room: staff push a build from the showcase (a concept site, a prototype, a live store) or any link into a
// room, and the room's team sees it in their hub under "Your sites": its picture, where it stands, an Open button, and a box to send notes back.
//
//   staff   GET    /v1/admin/clients/:id/sites            what the room has, the showcase builds and prototypes that can be pushed, its projects, its go-live progress, and the notes sent back
//           POST   /v1/admin/clients/:id/sites            { buildId } or { name, url }, opensAt?, accessNote?, projectId? ('new' | id | 'none'), note?, email?, goLive?
//           PATCH  /v1/admin/clients/:id/sites/:sid       { opensAt?, accessNote?, note?, projectId? }
//           DELETE /v1/admin/clients/:id/sites/:sid       take it out of the room (the showcase invites made for it are revoked)
//           GET    /v1/admin/clients/:id/projects/:pid/go-live   the project's checklist, both sides (ticked with PATCH /v1/workspace/assignments/:id)
//           POST   /v1/admin/clients/:id/projects/:pid/go-live   { template?, assigneeId?, email? }   push the go-live checklist onto the project (src/go-live.js)
//   client  GET    /v1/sites                              the room's sites
//           GET    /v1/sites/:sid/cover                   its picture
//           POST   /v1/sites/:sid/open                    → { url, accessNote } (the visit is counted on the showcase, like a showcase visit)
//           POST   /v1/sites/:sid/feedback                { text } notes for Future Basics: kept on the site and sent to staff
//
// Where Open goes: the address staff set on the site, else the prototype tied to the build (a Shopify dev store, a staging site, or one built here), else the build's
// own address. So a build whose address is the client's current store opens the prototype, not the store.
//
// A build pushed into a room is filed under a software project in that room (the one already tied to the build, or a new one), so the prototype and the app sit with
// the project's stages, agreement and invoices. It also gives each person on the room's team a showcase invite for that build (a year).
// A client only ever sees its own room's sites; a preview of the room is read-only.
import { readFileSync, existsSync } from 'node:fs';
import { cleanUrl } from './builds.js';
import { GO_LIVE, TEMPLATE_KEYS, templateFor } from './go-live.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const PREVIEW_DIR = new URL('./builds-previews/', import.meta.url);
const STATUS_WORDS = { live: 'Live', concept: 'Concept', 'in-progress': 'In progress', archived: 'Archived' };
const PROTO_BASE = String(process.env.BUILDS_PUBLIC_URL || 'https://builds.thefuturebasics.com').replace(/\/$/, '');
// a prototype's address: one made elsewhere keeps its own; one built here is at /p/<slug> once published
const PROTO_URL = `case when pt.kind='external' then nullif(pt.external_url,'') when pt.published_at is not null then '${PROTO_BASE}/p/' || pt.slug end`;

// the tables are made in src/db.js (room_sites, room_site_feedback)

export function registerRoomSitesRoutes(app, d) {
  const { pool, authenticate, adminOnly, notifyStaff = async () => {}, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, emailEscape = s => String(s), clientHubUrl = '', workHubUrl = '', log = console } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const uid = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const SELECT = `select s.*, b.slug, b.name build_name, b.tagline, b.status build_status, b.live_url, b.sector, b.hosting, (b.media->>'cover') is not null has_cover,
      pr.name project_name, pr.stage project_stage,
      (select ${PROTO_URL} from prototypes pt where pt.build_id=s.build_id and s.build_id is not null and (${PROTO_URL}) is not null order by pt.updated_at desc limit 1) proto_url,
      (select pt.access_note from prototypes pt where pt.build_id=s.build_id and s.build_id is not null and (${PROTO_URL}) is not null order by pt.updated_at desc limit 1) proto_access,
      (select count(*)::int from room_site_feedback f where f.site_id=s.id) feedback_count
    from room_sites s left join builds b on b.id=s.build_id left join projects pr on pr.id=s.project_id and pr.archived_at is null`;
  // where Open goes, and why: 'set' (staff gave it), 'prototype' (the build's prototype) or 'site' (the build's own address)
  const opens = r => r.url ? { url: r.url, from: r.build_id ? 'set' : 'link' } : r.proto_url ? { url: r.proto_url, from: 'prototype' } : { url: r.live_url || '', from: 'site' };
  const view = r => ({
    id: r.id, buildId: r.build_id, slug: r.slug || '', name: r.build_id ? r.build_name : r.name, tagline: r.build_id ? r.tagline || '' : '', sector: r.sector || '',
    status: r.build_id ? r.build_status : 'live', statusWords: r.build_id ? STATUS_WORDS[r.build_status] || r.build_status : 'Link',
    hasUrl: Boolean(opens(r).url), hasCover: Boolean(previewFor(opens(r).url) || (r.build_id && (r.has_cover || (r.slug && existsSync(new URL(`${r.slug}.jpg`, PREVIEW_DIR)))))),
    accessNote: r.access_note || r.proto_access || '', projectId: r.project_name ? r.project_id : null, projectName: r.project_name || '',
    note: r.note, addedAt: r.created_at, feedbackCount: r.feedback_count || 0
  });
  // the site's picture follows where Open goes: a screenshot kept for that address (src/builds-previews/<first part of its host>.jpg, as
  // cg12concept.jpg is for cg12concept.myshopify.com), else the build's own cover, else its screenshot by slug
  const previewFor = url => { let h = ''; try { h = new URL(url).hostname.split('.')[0].toLowerCase(); } catch { return null; } const f = /^[a-z0-9-]{2,60}$/.test(h) ? new URL(`${h}.jpg`, PREVIEW_DIR) : null; return f && existsSync(f) ? f : null; };
  async function pictureOf(r) {
    const own = previewFor(opens(r).url); if (own) return { type: 'image/jpeg', body: readFileSync(own) };
    if (!r.build_id) return null;
    const cover = (await pool.query(`select media->>'cover' c from builds where id=$1`, [r.build_id])).rows[0]?.c, m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(cover || '');
    if (m && opens(r).from !== 'prototype' && opens(r).from !== 'set') return { type: m[1], body: Buffer.from(m[2], 'base64') };
    const file = r.slug && /^[a-z0-9-]+$/.test(r.slug) ? new URL(`${r.slug}.jpg`, PREVIEW_DIR) : null;
    if (opens(r).from === 'site' && file && existsSync(file)) return { type: 'image/jpeg', body: readFileSync(file) };
    if (m) return { type: m[1], body: Buffer.from(m[2], 'base64') };
    return file && existsSync(file) ? { type: 'image/jpeg', body: readFileSync(file) } : null;
  }
  const staffView = r => ({ ...view(r), opensAt: opens(r).url, opensFrom: opens(r).from, buildUrl: r.live_url || '', protoUrl: r.proto_url || '', setUrl: r.url || '' });
  const team = async cid => (await pool.query(`select id, email, coalesce(nullif(name,''), split_part(email,'@',1)) name from users where client_id=$1 and role='client' and removed_at is null order by created_at`, [cid])).rows;
  const siteOf = async (cid, sid) => UUID.test(String(sid || '')) ? (await pool.query(`${SELECT} where s.id=$1 and s.client_id=$2 and s.removed_at is null`, [sid, cid])).rows[0] || null : null;
  const projectIn = async (cid, pid) => UUID.test(String(pid || '')) ? (await pool.query(`select id, name, kind, build_id from projects where id=$1 and client_id=$2 and archived_at is null`, [pid, cid])).rows[0] || null : null;
  // '' → leave, null → clear, a string → an address that must be https (a bare host gets https:// put in front)
  const addressOf = v => { if (v === undefined) return undefined; const t = String(v ?? '').trim(); if (!t) return null; return cleanUrl(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`) || false; };
  // the project a site is filed under: the one asked for, the software project already tied to the build, or a new software project named for it
  async function fileUnder(cid, want, build, name) {
    if (want === 'none') return null;
    if (want && want !== 'new') { const p = await projectIn(cid, want); if (!p) throw Object.assign(new Error('That project is not in this room'), { code: 404 }); return p; }
    if (!want && !build) return null;
    if (!want && build) { const p = (await pool.query(`select id, name, kind, build_id from projects where client_id=$1 and build_id=$2 and archived_at is null order by updated_at desc limit 1`, [cid, build.id])).rows[0]; if (p) return p; }
    const pname = clip(String(name || 'Website').replace(/:\s*new site prototype$/i, ''), 120) || 'Website';
    return (await pool.query(`insert into projects(client_id, name, status, kind, build_id, stage) values($1,$2,'active','software',$3,'prototype') returning id, name, kind, build_id`, [cid, pname, build?.id || null])).rows[0];
  }
  const tieBuild = async (p, build) => { if (p && build && p.kind === 'software' && !p.build_id) await pool.query('update projects set build_id=$2, updated_at=now() where id=$1 and build_id is null', [p.id, build.id]); };
  // the go-live checklist on a project: the items not already there are added; the client's go to one person on their team (or the team), ours to Future Basics
  async function pushGoLive(req, cid, project, template, assigneeId) {
    const list = GO_LIVE[template]; if (!list) throw Object.assign(new Error('Unknown checklist'), { code: 422 });
    const people = await team(cid), who = assigneeId === '' ? null : assigneeId ? people.find(p => p.id === assigneeId) : people[0];
    if (assigneeId && !who) throw Object.assign(new Error('That person is not on the room’s team'), { code: 422 });
    const have = new Set((await pool.query(`select title from work_assignments where project_id=$1 and source='go-live'`, [project.id])).rows.map(r => r.title));
    let added = 0;
    for (const it of list.items) {
      if (have.has(it.title)) continue;
      await pool.query(`insert into work_assignments(client_id, title, notes, assignee_id, assignee_fb, created_by, project_id, source) values($1,$2,$3,$4,$5,$6,$7,'go-live')`,
        [cid, it.title, it.notes, it.who === 'client' ? who?.id || null : null, it.who === 'fb', uid(req), project.id]);
      added++;
    }
    return { added, assignee: who ? { id: who.id, name: who.name, email: who.email } : null, label: list.label };
  }
  const progress = async cid => (await pool.query(`select a.project_id, count(*) filter (where not a.assignee_fb)::int client_total, count(*) filter (where not a.assignee_fb and a.status='done')::int client_done,
      count(*) filter (where a.assignee_fb)::int fb_total, count(*) filter (where a.assignee_fb and a.status='done')::int fb_done
    from work_assignments a where a.client_id=$1 and a.source='go-live' and a.project_id is not null group by a.project_id`, [cid])).rows
    .map(r => ({ projectId: r.project_id, client: { total: r.client_total, done: r.client_done }, fb: { total: r.fb_total, done: r.fb_done } }));

  // ---- staff ----
  app.get('/v1/admin/clients/:id/sites', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const cid = req.params.id;
    const rows = (await pool.query(`${SELECT} where s.client_id=$1 and s.removed_at is null order by s.created_at desc`, [cid])).rows;
    const builds = (await pool.query(`select b.id, b.slug, b.name, b.status, b.visibility, b.live_url, b.hosting,
        (select ${PROTO_URL} from prototypes pt where pt.build_id=b.id and (${PROTO_URL}) is not null order by pt.updated_at desc limit 1) proto_url
      from builds b where b.status<>'archived' order by lower(b.name)`)).rows
      .map(b => ({ id: b.id, slug: b.slug, name: b.name, status: b.status, visibility: b.visibility, live: Boolean(b.live_url || b.proto_url), liveUrl: b.live_url, protoUrl: b.proto_url || '', template: templateFor({ hosting: b.hosting, url: b.proto_url || b.live_url }), inRoom: rows.some(r => r.build_id === b.id) }));
    const prototypes = (await pool.query(`select pt.id, pt.company, pt.kind, pt.access_note, ${PROTO_URL} url from prototypes pt where (${PROTO_URL}) is not null order by pt.updated_at desc limit 60`)).rows
      .map(p => ({ id: p.id, company: p.company, kind: p.kind, url: p.url, accessNote: p.access_note || '' }));
    const projects = (await pool.query(`select id, name, kind, stage, build_id from projects where client_id=$1 and archived_at is null and status not in ('archive','archived') order by updated_at desc`, [cid])).rows
      .map(p => ({ id: p.id, name: p.name, kind: p.kind, stage: p.stage, buildId: p.build_id }));
    const feedback = (await pool.query(`select f.id, f.site_id, f.author_name, f.body, f.created_at from room_site_feedback f join room_sites s on s.id=f.site_id where f.client_id=$1 and s.removed_at is null order by f.created_at desc limit 50`, [cid])).rows
      .map(f => ({ id: f.id, siteId: f.site_id, by: f.author_name, text: f.body, at: f.created_at }));
    const people = (await team(cid)).map(p => ({ id: p.id, name: p.name }));
    return { sites: rows.map(staffView), builds, prototypes, projects, team: people, goLive: await progress(cid), templates: TEMPLATE_KEYS.map(k => ({ key: k, label: GO_LIVE[k].label, client: GO_LIVE[k].items.filter(i => i.who === 'client').length, fb: GO_LIVE[k].items.filter(i => i.who === 'fb').length })), feedback };
  });

  // the picture on the room's card in the work console: its first site with one (a prototype before a link)
  app.get('/v1/admin/clients/:id/site-cover', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    for (const r of (await pool.query(`${SELECT} where s.client_id=$1 and s.removed_at is null order by s.build_id is null, s.created_at limit 10`, [req.params.id])).rows) {
      const pic = await pictureOf(r); if (pic) return reply.header('cache-control', 'private, max-age=300').type(pic.type).send(pic.body);
    }
    return bad(reply, 'No picture', 404);
  });

  app.post('/v1/admin/clients/:id/sites', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const c = (await pool.query('select id, name from clients where id=$1 and archived_at is null', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Client not found', 404);
    const b = req.body || {}, note = clip(b.note, 400), accessNote = clip(b.accessNote, 300);
    let build = null, name = '', url = '';
    if (b.buildId) {
      build = UUID.test(String(b.buildId)) ? (await pool.query('select id, slug, name, live_url, status, hosting from builds where id=$1', [b.buildId])).rows[0] : null;
      if (!build) return bad(reply, 'That build is not in the showcase', 404);
      if ((await pool.query('select 1 from room_sites where client_id=$1 and build_id=$2 and removed_at is null', [c.id, build.id])).rowCount) return bad(reply, `${build.name} is already in this room`, 409);
      const at = addressOf(b.opensAt); if (at === false) return bad(reply, 'Where it opens must be a web address (https://…)'); url = at || '';
    } else {
      name = clip(b.name, 80); url = addressOf(b.url) || '';
      if (!name) return bad(reply, 'Give it a name'); if (!url) return bad(reply, 'Give it an address that starts with https://');
    }
    if ((await pool.query('select count(*)::int n from room_sites where client_id=$1 and removed_at is null', [c.id])).rows[0].n >= 40) return bad(reply, 'A room holds 40 sites. Take one out first.', 409);
    let project;
    try { project = await fileUnder(c.id, b.projectId, build, build ? build.name : name); } catch (e) { return bad(reply, e.message, e.code || 422); }
    await tieBuild(project, build);
    const s = (await pool.query(`insert into room_sites(client_id, build_id, name, url, note, added_by, access_note, project_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [c.id, build?.id || null, name, url, note, uid(req), accessNote, project?.id || null])).rows[0];
    const people = await team(c.id), title = build ? build.name : name;
    // the showcase opens it for them too: an invite for this build for each person on the team (a year), tagged with the room's site
    if (build) for (const p of people) {
      if (!(await pool.query(`select 1 from build_invites where lower(email)=lower($1) and (build_id=$2 or build_id is null) and revoked_at is null and expires_at > now()`, [p.email, build.id])).rowCount)
        await pool.query(`insert into build_invites(email, build_id, invited_by, note, expires_at) values($1,$2,$3,$4, now() + interval '365 days')`, [p.email, build.id, uid(req), `room-site:${s.id}`]).catch(() => {});
    }
    await pool.query(`insert into notifications(client_id, type, title, entity_type, entity_id) values($1,'room-site',$2,'room-site',$3)`, [c.id, clip(`New in your room: ${title}`, 300), s.id]).catch(() => {});
    const row = await siteOf(c.id, s.id);
    let goLive = null;
    if (b.goLive && project) {
      try { goLive = await pushGoLive(req, c.id, project, TEMPLATE_KEYS.includes(b.template) ? b.template : templateFor({ hosting: build?.hosting, url: opens(row).url }), b.assigneeId); } catch (e) { goLive = { error: e.message }; }
    }
    let emailed = 0;
    if (b.email === true) for (const p of people) {
      const mine = goLive?.assignee?.id === p.id && goLive.added ? `<p>We also put the go-live checklist in your hub: the things on your side are under <b>Needs attention</b>.</p>` : '';
      const ok = await sendHubEmail({ to: p.email, subject: `${title} is ready to look at`, html: hubEmailShell(`${title} is in your room`, `<p>Future Basics added <b>${emailEscape(title)}</b> to your room${project ? `, under the project <b>${emailEscape(project.name)}</b>` : ''}.${note ? `</p><p style="padding:12px 14px;border-left:3px solid #4bff9a;background:#f5f5f2">${emailEscape(note)}` : ''}</p>${mine}<p><a href="${emailEscape(`${clientHubUrl}/#sites`)}">Open it in your hub</a>, and send us your notes from there.</p>`) }).catch(() => false);
      if (ok) emailed++;
    }
    return reply.code(201).send({ site: staffView(row), project: project ? { id: project.id, name: project.name } : null, goLive, invited: build ? people.length : 0, emailed });
  });

  app.patch('/v1/admin/clients/:id/sites/:sid', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const s = await siteOf(req.params.id, req.params.sid); if (!s) return bad(reply, 'Not in this room', 404);
    const b = req.body || {}, sets = [], vals = [s.id], set = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.opensAt !== undefined) {
      const at = addressOf(b.opensAt); if (at === false) return bad(reply, 'Where it opens must be a web address (https://…)');
      if (!at && !s.build_id) return bad(reply, 'A link needs an address');
      set('url', at || '');
    }
    if (b.accessNote !== undefined) set('access_note', clip(b.accessNote, 300));
    if (b.note !== undefined) set('note', clip(b.note, 400));
    if (b.projectId !== undefined) {
      let p; try { p = await fileUnder(s.client_id, b.projectId || 'none', s.build_id ? { id: s.build_id } : null, s.build_id ? s.build_name : s.name); } catch (e) { return bad(reply, e.message, e.code || 422); }
      await tieBuild(p, s.build_id ? { id: s.build_id } : null); set('project_id', p?.id || null);
    }
    if (!sets.length) return bad(reply, 'Nothing to change');
    await pool.query(`update room_sites set ${sets.join(', ')} where id=$1`, vals);
    return { site: staffView(await siteOf(s.client_id, s.id)) };
  });

  app.delete('/v1/admin/clients/:id/sites/:sid', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const s = await siteOf(req.params.id, req.params.sid); if (!s) return bad(reply, 'Not in this room', 404);
    await pool.query('update room_sites set removed_at=now() where id=$1', [s.id]);
    await pool.query(`update build_invites set revoked_at=now() where note=$1 and revoked_at is null`, [`room-site:${s.id}`]);
    return { ok: true };
  });

  // the project's checklist as staff see it in the work console: both sides, ticked off from there or from the client's hub (the same tasks)
  app.get('/v1/admin/clients/:id/projects/:pid/go-live', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const p = await projectIn(req.params.id, req.params.pid); if (!p) return bad(reply, 'That project is not in this room', 404);
    const tasks = (await pool.query(`select a.id, a.title, a.notes, a.status, a.due, a.assignee_fb, a.done_at, coalesce(nullif(u.name,''), split_part(u.email,'@',1)) assignee_name
      from work_assignments a left join users u on u.id=a.assignee_id where a.project_id=$1 and a.client_id=$2 order by a.assignee_fb desc, a.created_at`, [p.id, req.params.id])).rows
      .map(t => ({ id: t.id, title: t.title, notes: t.notes, status: t.status, done: t.status === 'done', doneAt: t.done_at, due: t.due ? new Date(t.due).toISOString().slice(0, 10) : '', who: t.assignee_fb ? 'fb' : 'client', assigneeName: t.assignee_fb ? 'Future Basics' : t.assignee_name || 'Their team' }));
    return { project: { id: p.id, name: p.name }, tasks, team: (await team(req.params.id)).map(x => ({ id: x.id, name: x.name })), templates: TEMPLATE_KEYS.map(k => ({ key: k, label: GO_LIVE[k].label })) };
  });

  app.post('/v1/admin/clients/:id/projects/:pid/go-live', { preHandler: [authenticate, adminOnly] }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Client not found', 404);
    const p = await projectIn(req.params.id, req.params.pid); if (!p) return bad(reply, 'That project is not in this room', 404);
    const b = req.body || {};
    let template = b.template;
    if (!template) { const site = (await pool.query(`${SELECT} where s.project_id=$1 and s.removed_at is null order by s.build_id is null, s.created_at limit 1`, [p.id])).rows[0]; template = templateFor({ hosting: site?.hosting, url: site ? opens(site).url : '' }); }
    let out; try { out = await pushGoLive(req, req.params.id, p, template, b.assigneeId); } catch (e) { return bad(reply, e.message, e.code || 422); }
    if (b.email === true && out.assignee?.email && out.added) await sendHubEmail({ to: out.assignee.email, subject: `Your go-live checklist for ${p.name}`, html: hubEmailShell(`Getting ${p.name} live`, `<p>Future Basics put the go-live checklist for <b>${emailEscape(p.name)}</b> in your hub. The things on your side are under <b>Needs attention</b>; ours are on the same list so you can see where we are.</p><p><a href="${emailEscape(`${clientHubUrl}/projects/${p.id}`)}">Open the project</a></p>`) }).catch(() => false);
    return reply.code(201).send({ ...out, assignee: out.assignee ? { id: out.assignee.id, name: out.assignee.name } : null, template, progress: (await progress(req.params.id)).find(x => x.projectId === p.id) || null });
  });

  // ---- the room's team ----
  const room = (req, reply) => { const cid = req.auth?.role === 'client' && UUID.test(String(req.auth?.clientId || '')) ? req.auth.clientId : null; if (!cid) bad(reply, 'Sign in to your room', 401); return cid; };
  app.get('/v1/sites', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    return { sites: (await pool.query(`${SELECT} where s.client_id=$1 and s.removed_at is null order by s.created_at desc`, [cid])).rows.map(view) };
  });
  app.get('/v1/sites/:sid/cover', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    const s = await siteOf(cid, req.params.sid); if (!s) return bad(reply, 'No picture', 404);
    const pic = await pictureOf(s); if (!pic) return bad(reply, 'No picture', 404);
    return reply.header('cache-control', 'private, max-age=300').type(pic.type).send(pic.body);
  });
  app.post('/v1/sites/:sid/open', { preHandler: authenticate }, async (req, reply) => {
    const cid = room(req, reply); if (!cid) return reply;
    const s = await siteOf(cid, req.params.sid); if (!s) return bad(reply, 'Not in your room', 404);
    const url = opens(s).url; if (!url) return bad(reply, 'It is not online yet: Future Basics will tell you when it is', 409);
    if (s.build_id && req.auth?.email && !req.auth.preview) await pool.query(`insert into build_views(email, build_id, kind) values($1,$2,'open')`, [String(req.auth.email).toLowerCase(), s.build_id]).catch(() => {});
    return { url, accessNote: s.access_note || s.proto_access || '' };
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
