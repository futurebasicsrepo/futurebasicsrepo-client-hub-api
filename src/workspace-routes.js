// The shared workspace: who on the room's team is on what right now, and who has what to do.
//
//   POST   /v1/workspace/presence          {type, id, mode} a heartbeat from a page with something open ('tech-pack', 'sample-review', 'concept'), every
//                                         ~15 seconds. mode is 'editing' once the person has changed something. → the others on it right now.
//   POST   /v1/workspace/presence/leave    {type, id} the page closed
//   GET    /v1/workspace/presence          everyone in the room seen in the last two minutes, and what they have open (staff: ?room=)
//   GET    /v1/workspace/assignments       the room's board: every task, who has it, where it stands, when it is due (staff: ?room=)
//   POST   /v1/workspace/assignments       {title, productId?, assigneeId? ('fb' for Future Basics), due?, notes?}
//   PATCH  /v1/workspace/assignments/:id   {status?, assigneeId?, due?, title?, notes?}
//   DELETE /v1/workspace/assignments/:id
// A client works in their own room; staff work in a room they name. A teammate given a task hears about it by email.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const PRESENCE_TYPES = ['tech-pack', 'sample-review', 'concept'];
export const LIVE_SECONDS = 40;            // a heartbeat older than this is someone who has left
export const STATUSES = ['todo', 'doing', 'review', 'done'];
export const STATUS_WORDS = { todo: 'To do', doing: 'Doing', review: 'In review', done: 'Done' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Where a task stands against today: → 'done' | 'late' | 'soon' (within 3 days) | 'later' | 'undated'
export function dueState(a, today = new Date().toISOString().slice(0, 10)) {
  if (a.status === 'done') return 'done';
  if (!a.due) return 'undated';
  const d = String(a.due).slice(0, 10), days = Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
  return days < 0 ? 'late' : days <= 3 ? 'soon' : 'later';
}
export const initials = n => clip(String(n || '').replace(/\([^)]*\)/g, ''), 80).split(/[\s.@_-]+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

export function registerWorkspaceRoutes(app, d) {
  const { pool, authenticate, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, emailEscape = s => String(s), clientHubUrl = '', log = console } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const admin = req => req.auth?.role === 'admin';
  const uid = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const roomOf = req => (admin(req) ? (UUID.test(String(req.query?.room || req.body?.room || '')) ? String(req.query?.room || req.body?.room) : null) : (UUID.test(String(req.auth?.clientId || '')) ? req.auth.clientId : null));
  const me = async req => (await pool.query('select id, name, email from users where id=$1', [uid(req)])).rows[0] || { id: uid(req), name: '', email: req.auth?.email || '' };
  const nameOf = u => clip(u?.name || String(u?.email || '').split('@')[0], 80);

  const STAFF_ONLY = 'staff';
  // the room a thing belongs to, if this person may see it: a client only in their own room
  async function roomOfEntity(req, type, id) {
    if (!PRESENCE_TYPES.includes(type) || !UUID.test(String(id || ''))) return null;
    const q = type === 'sample-review' ? 'select client_id from sample_reviews where id=$1' : type === 'concept' ? 'select client_id from lab_concepts where id=$1' : 'select client_id from products where id=$1';
    const row = (await pool.query(q, [id]).catch(() => ({ rows: [] }))).rows[0], cid = row?.client_id;
    // a concept Future Basics is drawing for no room yet: staff see each other on it, and no room ever does
    if (row && !cid && type === 'concept' && admin(req)) return STAFF_ONLY;
    if (!cid || (!admin(req) && cid !== req.auth.clientId)) return null;
    return cid;
  }
  const others = async (type, id, self) => (await pool.query(`select user_id, name, role, mode, seen_at from workspace_presence where entity_type=$1 and entity_id=$2 and user_id<>$3 and seen_at > now() - make_interval(secs => $4) order by seen_at desc`, [type, id, self, LIVE_SECONDS])).rows
    .map(p => ({ id: p.user_id, name: p.name, initials: initials(p.name), role: p.role, mode: p.mode, seenAt: p.seen_at }));

  app.post('/v1/workspace/presence', { preHandler: authenticate }, async (req, reply) => {
    const type = String(req.body?.type || ''), id = String(req.body?.id || ''), cid = await roomOfEntity(req, type, id);
    if (!cid) return bad(reply, 'Not found', 404);
    const u = await me(req), mode = req.body?.mode === 'editing' && !req.auth.preview ? 'editing' : 'viewing';
    // a preview of the client's room is staff looking: it is not shown to the room as a person
    if (!req.auth.preview) await pool.query(`insert into workspace_presence(user_id,client_id,entity_type,entity_id,name,role,mode,seen_at) values($1,$2,$3,$4,$5,$6,$7,now())
      on conflict(user_id,entity_type,entity_id) do update set name=excluded.name, mode=excluded.mode, seen_at=now()`, [u.id, cid === STAFF_ONLY ? null : cid, type, id, admin(req) ? `${nameOf(u)} (Future Basics)` : nameOf(u), admin(req) ? 'admin' : 'client', mode]);
    // old heartbeats are cleared now and then, so the table stays small
    if (Math.random() < 0.02) pool.query(`delete from workspace_presence where seen_at < now() - interval '1 day'`).catch(() => {});
    return { others: await others(type, id, u.id), liveSeconds: LIVE_SECONDS };
  });

  app.post('/v1/workspace/presence/leave', { preHandler: authenticate }, async (req) => {
    if (uid(req)) await pool.query('delete from workspace_presence where user_id=$1 and entity_type=$2 and entity_id=$3', [uid(req), String(req.body?.type || ''), String(req.body?.id || '')]);
    return { ok: true };
  });

  app.get('/v1/workspace/presence', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, admin(req) ? 'Say which room (?room=)' : 'Sign in to your room', admin(req) ? 422 : 401);
    const rows = (await pool.query(`select wp.*, coalesce(p.title, sp.title, lc.name) title, sr.stage, coalesce(sr.product_id::text, wp.entity_id) product_id
      from workspace_presence wp
      left join products p on wp.entity_type='tech-pack' and p.id::text=wp.entity_id
      left join sample_reviews sr on wp.entity_type='sample-review' and sr.id::text=wp.entity_id left join products sp on sp.id=sr.product_id
      left join lab_concepts lc on wp.entity_type='concept' and lc.id::text=wp.entity_id
      where wp.client_id=$1 and wp.seen_at > now() - interval '2 minutes' order by wp.seen_at desc`, [cid])).rows;
    const byPerson = new Map();
    for (const r of rows) {
      const live = Date.now() - new Date(r.seen_at) < LIVE_SECONDS * 1000;
      const href = r.entity_type === 'tech-pack' ? `/tech-packs/${r.entity_id}` : r.entity_type === 'sample-review' ? `/samples/${r.product_id}?review=${r.entity_id}` : `/lab/studio?concept=${r.entity_id}`;
      const what = { type: r.entity_type, id: r.entity_id, title: r.entity_type === 'sample-review' ? `${r.stage || 'Sample'} review · ${r.title || ''}` : r.title || '', mode: r.mode, live, href };
      if (!byPerson.has(r.user_id)) byPerson.set(r.user_id, { id: r.user_id, name: r.name, initials: initials(r.name), role: r.role, you: r.user_id === uid(req), on: [] });
      byPerson.get(r.user_id).on.push(what);
    }
    return { people: [...byPerson.values()] };
  });

  // ---- assign and track ----
  const view = (a, today) => ({ id: a.id, title: a.title, notes: a.notes, productId: a.product_id, productTitle: a.product_title || '', status: a.status, statusWords: STATUS_WORDS[a.status],
    assigneeId: a.assignee_fb ? 'fb' : a.assignee_id, assigneeName: a.assignee_fb ? 'Future Basics' : a.assignee_name || '', due: a.due ? new Date(a.due).toISOString().slice(0, 10) : '', state: dueState({ status: a.status, due: a.due ? new Date(a.due).toISOString().slice(0, 10) : '' }, today),
    createdBy: a.creator_name || '', updatedAt: a.updated_at, doneAt: a.done_at });
  const SELECT = `select a.*, p.title product_title, coalesce(nullif(u.name,''), split_part(u.email,'@',1)) assignee_name, coalesce(nullif(c.name,''), split_part(c.email,'@',1)) creator_name
    from work_assignments a left join products p on p.id=a.product_id left join users u on u.id=a.assignee_id left join users c on c.id=a.created_by`;
  // who a task can go to: someone on the room's team, or Future Basics
  async function assignee(cid, v) {
    if (v === undefined) return undefined;
    if (v === null || v === '') return { id: null, fb: false };
    if (v === 'fb') return { id: null, fb: true };
    if (!UUID.test(String(v))) return false;
    const u = (await pool.query(`select id, name, email from users where id=$1 and client_id=$2 and role='client' and removed_at is null`, [v, cid])).rows[0];
    return u ? { id: u.id, fb: false, user: u } : false;
  }
  async function productIn(cid, v) {
    if (v === undefined) return undefined; if (!v) return null;
    if (!UUID.test(String(v))) return false;
    return (await pool.query('select id from products where id=$1 and client_id=$2', [v, cid])).rows[0]?.id || false;
  }
  const tell = async (req, a, who) => {
    if (!who?.user?.email || who.user.id === uid(req)) return;
    const u = await me(req), room = (await pool.query('select name from clients where id=$1', [a.client_id])).rows[0]?.name || '';
    sendHubEmail({ to: who.user.email, subject: `${nameOf(u)} gave you: ${a.title}`, html: hubEmailShell('A task for you', `<p><b>${emailEscape(nameOf(u))}</b> gave you a task in ${emailEscape(room)}:</p><p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2"><b>${emailEscape(a.title)}</b>${a.due ? `<br>Due ${emailEscape(String(a.due).slice(0, 10))}` : ''}${a.notes ? `<br>${emailEscape(a.notes)}` : ''}</p><p><a href="${emailEscape(`${clientHubUrl}/workspace?tab=board`)}">Open the board</a></p>`) }).catch(err => log.warn?.({ err: err.message }, 'task email not sent'));
  };

  app.get('/v1/workspace/assignments', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, admin(req) ? 'Say which room (?room=)' : 'Sign in to your room', admin(req) ? 422 : 401);
    const today = new Date().toISOString().slice(0, 10);
    const rows = (await pool.query(`${SELECT} where a.client_id=$1 and (a.status<>'done' or a.done_at > now() - interval '30 days') order by a.due nulls last, a.created_at`, [cid])).rows;
    const team = (await pool.query(`select id, coalesce(nullif(name,''), split_part(email,'@',1)) name from users where client_id=$1 and role='client' and removed_at is null order by created_at`, [cid])).rows;
    const products = (await pool.query(`select id, title from products where client_id=$1 order by updated_at desc nulls last limit 200`, [cid]).catch(() => pool.query(`select id, title from products where client_id=$1 order by title limit 200`, [cid]))).rows;
    return { assignments: rows.map(a => view(a, today)), people: [...team.map(t => ({ id: t.id, name: t.name })), { id: 'fb', name: 'Future Basics' }], products, statuses: STATUSES.map(s => ({ id: s, label: STATUS_WORDS[s] })), you: uid(req) };
  });

  app.post('/v1/workspace/assignments', { preHandler: authenticate }, async (req, reply) => {
    const cid = roomOf(req); if (!cid) return bad(reply, 'Say which room', 422);
    const title = clip(req.body?.title, 200); if (!title) return bad(reply, 'Say what needs doing');
    const who = await assignee(cid, req.body?.assigneeId ?? null), product = await productIn(cid, req.body?.productId ?? null);
    if (who === false) return bad(reply, 'That person is not on the room’s team'); if (product === false) return bad(reply, 'That product is not in this room');
    const due = DAY.test(String(req.body?.due || '')) ? req.body.due : null;
    if ((await pool.query(`select count(*)::int n from work_assignments where client_id=$1 and status<>'done'`, [cid])).rows[0].n >= 500) return bad(reply, 'The board holds 500 open tasks. Close some first.', 409);
    const a = (await pool.query(`insert into work_assignments(client_id,product_id,title,notes,assignee_id,assignee_fb,due,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`, [cid, product, title, clip(req.body?.notes, 1000), who.id, who.fb, due, uid(req)])).rows[0];
    await tell(req, a, who);
    return reply.code(201).send({ assignment: view((await pool.query(`${SELECT} where a.id=$1`, [a.id])).rows[0]) });
  });

  async function own(req, reply) {
    if (!UUID.test(String(req.params.id))) { bad(reply, 'Task not found', 404); return null; }
    const a = (await pool.query('select * from work_assignments where id=$1', [req.params.id])).rows[0];
    if (!a || (!admin(req) && a.client_id !== req.auth.clientId)) { bad(reply, 'Task not found', 404); return null; }
    return a;
  }
  app.patch('/v1/workspace/assignments/:id', { preHandler: authenticate }, async (req, reply) => {
    const a = await own(req, reply); if (!a) return reply;
    const sets = [], vals = [a.id], set = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (req.body?.status !== undefined) { if (!STATUSES.includes(req.body.status)) return bad(reply, 'Unknown status'); set('status', req.body.status); set('done_at', req.body.status === 'done' ? new Date() : null); }
    if (req.body?.title !== undefined) { const t = clip(req.body.title, 200); if (!t) return bad(reply, 'Say what needs doing'); set('title', t); }
    if (req.body?.notes !== undefined) set('notes', clip(req.body.notes, 1000));
    if (req.body?.due !== undefined) set('due', DAY.test(String(req.body.due || '')) ? req.body.due : null);
    const who = await assignee(a.client_id, req.body?.assigneeId);
    if (who === false) return bad(reply, 'That person is not on the room’s team');
    if (who) { set('assignee_id', who.id); set('assignee_fb', who.fb); }
    const product = await productIn(a.client_id, req.body?.productId);
    if (product === false) return bad(reply, 'That product is not in this room'); if (product !== undefined) set('product_id', product);
    if (!sets.length) return bad(reply, 'Nothing to change');
    await pool.query(`update work_assignments set ${sets.join(', ')}, updated_at=now() where id=$1`, vals);
    if (who?.user && who.user.id !== a.assignee_id) await tell(req, { ...a, ...(req.body?.title ? { title: clip(req.body.title, 200) } : {}) }, who);
    return { assignment: view((await pool.query(`${SELECT} where a.id=$1`, [a.id])).rows[0]) };
  });

  app.delete('/v1/workspace/assignments/:id', { preHandler: authenticate }, async (req, reply) => {
    const a = await own(req, reply); if (!a) return reply;
    await pool.query('delete from work_assignments where id=$1', [a.id]);
    return { ok: true };
  });
}
