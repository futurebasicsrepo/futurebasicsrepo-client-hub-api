// Sales OS routes (staff only) and the lead capture other parts of the service call (see sales.js for the rules).
//
//   GET  /v1/sales/overview                       today: pipeline, new leads, warm contacts, tasks due, stale deals, recent activity
//   GET|POST /v1/sales/contacts   GET|PUT|DELETE /v1/sales/contacts/:id   POST /v1/sales/contacts/:id/activities
//   GET|POST /v1/sales/deals      PUT|DELETE /v1/sales/deals/:id      POST /v1/sales/deals/:id/start-project  (a won deal: the client room, a project, a build for software)
//   GET|POST /v1/sales/tasks      PUT|DELETE /v1/sales/tasks/:id
//   POST /v1/sales/import/hub     the hub's clients and leads become contacts
//   POST /v1/sales/import/csv     a pasted list becomes contacts
import { fireTrigger, fireTagsAdded, stopRuns } from './sales-automations-engine.js';
import { STAGES, OPEN_STAGES, STAGE_LABELS, AUTO_TAGS, cleanContact, cleanDeal, cleanTask, cleanActivity, cleanSegment, cleanTags, cleanEmail, heat, staleDays, pipelineSummary, nextBusinessDay, parseCsv } from './sales.js';
import { startProject } from './start-project.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAT_KINDS = ['showcase_demo', 'showcase_view', 'email_in', 'chat_in', 'meeting', 'call'];
const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);

// A person (by email) showed up: find or create their contact, log what they did, and make sure there is a deal to work and, after a click-through, a follow-up.
// Called by the showcase when an invited person looks at a build, and when staff invite someone. Never throws into the caller's request.
export async function captureLead(pool, { email, name = '', source = 'showcase', kind = 'system', text = '', meta = {}, dealTitle = null, followUp = null, actorId = null } = {}) {
  try {
    const addr = cleanEmail(email); if (!addr) return null;
    let contact = (await pool.query('select id from sales_contacts where lower(email)=$1', [addr])).rows[0], created = false;
    if (!contact) {
      const client = (await pool.query(`select id from clients where archived_at is null and (lower(contact_email)=$1 or $1 = any(allowed_emails)) limit 1`, [addr]).catch(() => ({ rows: [] }))).rows[0];
      const ins = await pool.query(`insert into sales_contacts(name,email,source,client_id,tags) values($1,$2,$3,$4,$5) on conflict (lower(email)) where email is not null do nothing returning id`, [String(name).slice(0, 120), addr, source, client?.id || null, source === 'showcase' ? ['showcase'] : []]);
      contact = ins.rows[0] || (await pool.query('select id from sales_contacts where lower(email)=$1', [addr])).rows[0]; created = Boolean(ins.rowCount);
    }
    if (!contact) return null;
    const tagged = source === 'showcase' ? (await pool.query(`update sales_contacts set tags = tags || '{showcase}'::text[] where id=$1 and not ('showcase' = any(tags))`, [contact.id])).rowCount > 0 : false;
    let dealId = null;
    if (dealTitle) {
      const open = (await pool.query(`select id from sales_deals where contact_id=$1 and stage = any($2) order by created_at desc limit 1`, [contact.id, OPEN_STAGES])).rows[0];
      dealId = open?.id || (await pool.query(`insert into sales_deals(contact_id,title,source) values($1,$2,$3) returning id`, [contact.id, String(dealTitle).slice(0, 140), source])).rows[0].id;
    }
    await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,$3,$4,$5::jsonb,$6)`, [contact.id, dealId, kind, String(text).slice(0, 4000), JSON.stringify(meta || {}), actorId]);
    await pool.query(`update sales_contacts set last_activity_at=now() where id=$1`, [contact.id]);
    if (dealId) await pool.query(`update sales_deals set last_activity_at=now() where id=$1`, [dealId]);
    if (followUp) {
      const has = (await pool.query(`select 1 from sales_tasks where contact_id=$1 and done_at is null limit 1`, [contact.id])).rowCount;
      if (!has) await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at) values($1,$2,$3,$4)`, [contact.id, dealId, String(followUp).slice(0, 200), nextBusinessDay().toISOString()]);
    }
    // what this means for any automation that is listening
    if (created) await fireTrigger(pool, { type: 'contact_created', contactId: contact.id, source });
    if (source === 'showcase' && (created || tagged)) await fireTrigger(pool, { type: 'tag_added', contactId: contact.id, tag: 'showcase' });
    if (kind === 'showcase_view' || kind === 'showcase_demo') await fireTrigger(pool, { type: kind, contactId: contact.id, dealId });
    return { contactId: contact.id, dealId, created };
  } catch (e) { console.warn('lead not captured:', e.message); return null; }
}

// The hub's clients and leads, and the people who sign in for them, are contacts too, so tech pack customers and build customers live in one CRM.
// Run on a schedule and on demand; safe to repeat. Tags the hub decides (client / lead / tech-pack) are kept right; every other tag is left to staff.
export async function syncHubContacts(pool, { actor = null } = {}) {
  const clients = (await pool.query(`select c.id, c.name, c.status, c.contact_name, c.contact_email, c.contact_phone, c.marketing_opt_out_at,
      exists(select 1 from tech_packs t where t.client_id = c.id) has_tech_pack
      from clients c where c.archived_at is null order by c.created_at`)).rows;
  const users = (await pool.query(`select client_id, lower(email) email, name from users where client_id is not null and email is not null and role <> 'admin' and email not like '%@thefuturebasics.com'`)).rows;
  const byClient = new Map(); for (const u of users) (byClient.get(u.client_id) || byClient.set(u.client_id, []).get(u.client_id)).push(u);
  const out = { clients: clients.length, people: 0, created: 0, alreadyThere: 0, updated: 0, skipped: 0 };
  for (const c of clients) {
    const people = new Map();
    const lead = cleanEmail(c.contact_email); if (lead) people.set(lead, c.contact_name || '');
    for (const u of byClient.get(c.id) || []) { const e = cleanEmail(u.email); if (e && !people.has(e)) people.set(e, u.name || ''); }
    if (!people.size) { out.skipped++; continue; }
    const want = [c.status === 'lead' ? 'lead' : 'client', ...(c.has_tech_pack ? ['tech-pack'] : [])];
    for (const [email, name] of people) {
      out.people++;
      let co = null; const existing = (await pool.query('select id,name,phone,client_id,tags,email_ok,company_id from sales_contacts where lower(email)=$1', [email])).rows[0];
      if (!existing) {
        if (c.name) co = (await pool.query(`insert into sales_companies(name) values($1) on conflict (lower(name)) do update set name=sales_companies.name returning id`, [c.name])).rows[0].id;
        const row = (await pool.query(`insert into sales_contacts(name,email,phone,company_id,source,tags,client_id,email_ok) values($1,$2,$3,$4,'hub',$5,$6,$7) returning id`, [name, email, email === lead ? c.contact_phone || '' : '', co, want, c.id, !c.marketing_opt_out_at])).rows[0];
        await pool.query(`insert into sales_activities(contact_id,kind,text,actor_id) values($1,'system',$2,$3)`, [row.id, `Added from the hub (${c.status === 'lead' ? 'website lead' : 'client'}: ${c.name})`, actor]);
        if (c.marketing_opt_out_at) await pool.query(`insert into sales_activities(contact_id,kind,text) values($1,'system','Opted out of marketing email in the hub. Marked as not to be emailed.')`, [row.id]);
        await fireTagsAdded(pool, row.id, [], want);
        out.created++; continue;
      }
      out.alreadyThere++;
      const keep = (existing.tags || []).filter(t => !AUTO_TAGS.includes(t)), next = [...new Set([...keep, ...want])].sort(), cur = [...(existing.tags || [])].sort();
      const optOut = c.marketing_opt_out_at && existing.email_ok;
      if (!existing.client_id || next.join() !== cur.join() || (!existing.name && name) || (!existing.company_id && c.name) || optOut) {
        if (!existing.company_id && c.name) co = (await pool.query(`insert into sales_companies(name) values($1) on conflict (lower(name)) do update set name=sales_companies.name returning id`, [c.name])).rows[0].id;
        await pool.query(`update sales_contacts set client_id=coalesce(client_id,$2), tags=$3, name=case when name='' then $4 else name end, company_id=coalesce(company_id,$5), email_ok=case when $6 then false else email_ok end, updated_at=now() where id=$1`, [existing.id, c.id, next, name, co, Boolean(optOut)]);
        if (optOut) await pool.query(`insert into sales_activities(contact_id,kind,text) values($1,'system','Opted out of marketing email in the hub. Marked as not to be emailed.')`, [existing.id]);
        await fireTagsAdded(pool, existing.id, existing.tags || [], next);
        out.updated++;
      }
    }
  }
  return out;
}

const DEFAULT_SEGMENTS = [
  { name: 'Tech pack customers', filter: { tags: ['tech-pack'] } },
  { name: 'Builds customers', filter: { tags: ['builds'] } },
  { name: 'Leads', filter: { tags: ['lead'] } },
  { name: 'Showcase interest', filter: { tags: ['showcase'] } }
];
export async function seedSegments(pool) {
  if (Number((await pool.query('select count(*) n from sales_segments')).rows[0].n)) return 0;
  let pos = 10; for (const sg of DEFAULT_SEGMENTS) await pool.query('insert into sales_segments(name,filter,position) values($1,$2::jsonb,$3)', [sg.name, JSON.stringify({ q: '', tags: [], excludeTags: [], source: '', ...sg.filter }), pos += 10]);
  return DEFAULT_SEGMENTS.length;
}

export function registerSalesRoutes(app, { pool, authenticate, adminOnly, log = console }) {
  const pre = [authenticate, adminOnly];
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const needId = (req, reply) => (UUID.test(req.params.id) ? true : (bad(reply, 'Not found', 404), false));

  // ---------- helpers ----------
  async function companyId(name) {
    const n = String(name || '').trim(); if (!n) return null;
    const r = await pool.query(`insert into sales_companies(name) values($1) on conflict (lower(name)) do update set name=sales_companies.name returning id`, [n]);
    return r.rows[0].id;
  }
  async function heatFor(ids) {
    if (!ids.length) return new Map();
    const rows = (await pool.query(`select contact_id, kind, created_at at from sales_activities where contact_id = any($1::uuid[]) and kind = any($2) and created_at > now() - interval '60 days'`, [ids, HEAT_KINDS])).rows;
    const by = new Map(); for (const r of rows) { (by.get(r.contact_id) || by.set(r.contact_id, []).get(r.contact_id)).push(r); }
    return new Map(ids.map(id => [id, heat(by.get(id) || [])]));
  }
  const contactRow = c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, title: c.title, company: c.company_name || '', companyId: c.company_id, source: c.source, tags: c.tags || [], notes: c.notes, emailOk: c.email_ok, unsubscribed: Boolean(c.unsubscribed_at), clientId: c.client_id, lastActivityAt: c.last_activity_at, createdAt: c.created_at });
  const CONTACT_SELECT = `select c.*, co.name company_name from sales_contacts c left join sales_companies co on co.id=c.company_id`;
  async function logActivity({ contactId, dealId = null, kind, text, meta = {}, actor = null }) {
    if (!contactId) return;
    await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,$3,$4,$5::jsonb,$6)`, [contactId, dealId, kind, text, JSON.stringify(meta), actor]);
    await pool.query(`update sales_contacts set last_activity_at=now() where id=$1`, [contactId]);
    if (dealId) await pool.query(`update sales_deals set last_activity_at=now() where id=$1`, [dealId]);
  }

  // ---------- today ----------
  app.get('/v1/sales/overview', { preHandler: pre }, async () => {
    const deals = (await pool.query(`select stage, value_cents from sales_deals`)).rows;
    const pipeline = pipelineSummary(deals);
    const newLeads = Number((await pool.query(`select count(*) n from sales_contacts where created_at > now() - interval '7 days'`)).rows[0].n);
    const totalContacts = Number((await pool.query(`select count(*) n from sales_contacts`)).rows[0].n);
    const recentIds = (await pool.query(`select distinct contact_id from sales_activities where kind = any($1) and created_at > now() - interval '30 days'`, [HEAT_KINDS])).rows.map(r => r.contact_id);
    const heats = await heatFor(recentIds);
    const hotIds = [...heats.entries()].filter(([, h]) => h.level === 'hot' || h.level === 'warm').sort((a, b) => b[1].score - a[1].score).slice(0, 8).map(([id]) => id);
    const hot = hotIds.length ? (await pool.query(`${CONTACT_SELECT} where c.id = any($1::uuid[])`, [hotIds])).rows.map(c => ({ ...contactRow(c), heat: heats.get(c.id) })).sort((a, b) => b.heat.score - a.heat.score) : [];
    const tasks = (await pool.query(`select t.id, t.title, t.due_at, t.contact_id, c.name contact_name, c.email contact_email from sales_tasks t left join sales_contacts c on c.id=t.contact_id where t.done_at is null and t.due_at is not null and t.due_at < date_trunc('day', now()) + interval '1 day' order by t.due_at limit 12`)).rows;
    const stale = (await pool.query(`select d.id, d.title, d.stage, d.value_cents, d.last_activity_at, d.contact_id, c.name contact_name from sales_deals d left join sales_contacts c on c.id=d.contact_id where d.stage = any($1) and d.last_activity_at < now() - interval '7 days' order by d.last_activity_at limit 8`, [OPEN_STAGES])).rows.map(d => ({ ...d, days: staleDays(d.last_activity_at) }));
    const recent = (await pool.query(`select a.id, a.kind, a.text, a.created_at, a.contact_id, c.name contact_name, c.email contact_email from sales_activities a join sales_contacts c on c.id=a.contact_id order by a.created_at desc limit 12`)).rows;
    return { pipeline, newLeads, totalContacts, hot, tasks, stale, recent };
  });

  // ---------- contacts ----------
  // the same filter drives the list, a saved view's count, and the tag counts
  function contactWhere(f) {
    const where = [], args = [], q = String(f.q || '').trim().toLowerCase();
    if (q) { args.push(`%${q.replace(/[%_\\]/g, m => '\\' + m)}%`); where.push(`(lower(c.name) like $${args.length} or lower(c.email) like $${args.length} or lower(co.name) like $${args.length} or $${args.length + 1}::text = any(c.tags))`); args.push(q); }
    if (f.source) { args.push(String(f.source)); where.push(`c.source = $${args.length}`); }
    const all = cleanTags([...cleanTags(f.tags), ...(f.tag ? [f.tag] : [])]); if (all.length) { args.push(all); where.push(`c.tags @> $${args.length}::text[]`); }
    const no = cleanTags(f.excludeTags); if (no.length) { args.push(no); where.push(`not (c.tags && $${args.length}::text[])`); }
    return { clause: where.length ? `where ${where.join(' and ')}` : '', args };
  }
  const queryFilter = qy => ({ q: qy?.q, source: qy?.source, tag: qy?.tag, tags: String(qy?.tags || '').split(',').filter(Boolean), excludeTags: String(qy?.exclude || '').split(',').filter(Boolean) });
  app.get('/v1/sales/contacts', { preHandler: pre }, async (req) => {
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50)), offset = Math.max(0, Number(req.query?.offset) || 0);
    const { clause, args } = contactWhere(queryFilter(req.query));
    const total = Number((await pool.query(`select count(*) n from sales_contacts c left join sales_companies co on co.id=c.company_id ${clause}`, args)).rows[0].n);
    const rows = (await pool.query(`${CONTACT_SELECT} ${clause} order by c.last_activity_at desc limit ${limit} offset ${offset}`, args)).rows;
    const heats = await heatFor(rows.map(r => r.id));
    const openDeals = rows.length ? (await pool.query(`select contact_id, count(*)::int n, coalesce(sum(value_cents),0)::bigint v from sales_deals where contact_id = any($1::uuid[]) and stage = any($2) group by contact_id`, [rows.map(r => r.id), OPEN_STAGES])).rows : [];
    const od = new Map(openDeals.map(r => [r.contact_id, r]));
    let list = rows.map(c => ({ ...contactRow(c), heat: heats.get(c.id), openDeals: od.get(c.id)?.n || 0, openValueCents: Number(od.get(c.id)?.v || 0) }));
    if (req.query?.heat) list = list.filter(c => c.heat.level === req.query.heat);
    return { total, contacts: list };
  });

  // ---------- tags and saved views ----------
  app.get('/v1/sales/tags', { preHandler: pre }, async () => ({ tags: (await pool.query(`select t tag, count(*)::int n from sales_contacts, unnest(tags) t group by t order by n desc, t limit 300`)).rows, auto: AUTO_TAGS }));
  app.post('/v1/sales/contacts/bulk-tags', { preHandler: pre }, async (req, reply) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter(x => UUID.test(String(x))), add = cleanTags(req.body?.add), remove = cleanTags(req.body?.remove);
    if (!ids.length) return bad(reply, 'Choose at least one contact'); if (ids.length > 500) return bad(reply, 'Five hundred at a time is the limit');
    if (!add.length && !remove.length) return bad(reply, 'Name a tag to add or remove');
    const had = new Map((await pool.query('select id,tags from sales_contacts where id = any($1::uuid[])', [ids])).rows.map(x => [x.id, x.tags || []]));
    const r = await pool.query(`update sales_contacts set tags = coalesce((select array_agg(distinct t order by t) from unnest(tags || $2::text[]) t where t <> all($3::text[])), '{}'::text[]), updated_at=now() where id = any($1::uuid[]) returning id, tags`, [ids, add, remove]);
    for (const x of r.rows) await fireTagsAdded(pool, x.id, had.get(x.id) || [], x.tags, { deliberate: true });
    return { ok: true, changed: r.rowCount };
  });
  const segmentRows = async () => (await pool.query('select id,name,filter from sales_segments order by position, created_at')).rows;
  app.get('/v1/sales/segments', { preHandler: pre }, async () => {
    const rows = await segmentRows(), out = [];
    for (const sg of rows) { const { clause, args } = contactWhere(sg.filter || {}); out.push({ id: sg.id, name: sg.name, filter: sg.filter, count: Number((await pool.query(`select count(*) n from sales_contacts c left join sales_companies co on co.id=c.company_id ${clause}`, args)).rows[0].n) }); }
    return { segments: out };
  });
  app.post('/v1/sales/segments', { preHandler: pre }, async (req, reply) => { const r = cleanSegment(req.body); if (r.error) return bad(reply, r.error); return reply.code(201).send({ id: (await pool.query('insert into sales_segments(name,filter,position) values($1,$2::jsonb,coalesce((select max(position)+10 from sales_segments),10)) returning id', [r.value.name, JSON.stringify(r.value.filter)])).rows[0].id }); });
  app.put('/v1/sales/segments/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; const r = cleanSegment(req.body); if (r.error) return bad(reply, r.error); return (await pool.query('update sales_segments set name=$2, filter=$3::jsonb where id=$1', [req.params.id, r.value.name, JSON.stringify(r.value.filter)])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });
  app.delete('/v1/sales/segments/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from sales_segments where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });
  app.post('/v1/sales/contacts', { preHandler: pre }, async (req, reply) => {
    const r = cleanContact(req.body); if (r.error) return bad(reply, r.error);
    const v = r.value;
    if (v.email) { const ex = (await pool.query('select id from sales_contacts where lower(email)=$1', [v.email])).rows[0]; if (ex) return reply.code(200).send({ id: ex.id, existing: true }); }
    const cid = await companyId(v.companyName);
    const row = (await pool.query(`insert into sales_contacts(name,email,phone,title,company_id,source,tags,notes,email_ok) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [v.name || '', v.email || null, v.phone || '', v.title || '', cid, v.source || 'manual', v.tags || [], v.notes || '', v.email_ok !== false])).rows[0];
    await logActivity({ contactId: row.id, kind: 'system', text: 'Added to the CRM', actor: actorOf(req) });
    await fireTrigger(pool, { type: 'contact_created', contactId: row.id, source: v.source || 'manual' });
    await fireTagsAdded(pool, row.id, [], v.tags || [], { deliberate: true });
    return reply.code(201).send({ id: row.id, existing: false });
  });
  app.get('/v1/sales/contacts/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const c = (await pool.query(`${CONTACT_SELECT} where c.id=$1`, [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    const [deals, acts, tasks, client] = await Promise.all([
      pool.query(`select id,title,stage,value_cents,expected_close,source,lost_reason,last_activity_at,closed_at,created_at from sales_deals where contact_id=$1 order by (stage = any($2)) desc, updated_at desc`, [c.id, OPEN_STAGES]),
      pool.query(`select a.id,a.kind,a.text,a.meta,a.created_at,a.deal_id,u.name actor_name from sales_activities a left join users u on u.id=a.actor_id where a.contact_id=$1 order by a.created_at desc limit 120`, [c.id]),
      pool.query(`select id,title,due_at,done_at,deal_id from sales_tasks where contact_id=$1 and (done_at is null or done_at > now() - interval '14 days') order by done_at nulls first, due_at nulls last`, [c.id]),
      c.client_id ? pool.query('select id,name,status from clients where id=$1', [c.client_id]) : { rows: [] }]);
    return { contact: { ...contactRow(c), heat: heat(acts.rows.map(a => ({ kind: a.kind, at: a.created_at }))) }, deals: deals.rows.map(d => ({ ...d, value_cents: Number(d.value_cents) })), activities: acts.rows, tasks: tasks.rows, client: client.rows[0] || null };
  });
  app.put('/v1/sales/contacts/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = cleanContact(req.body, { partial: true }); if (r.error) return bad(reply, r.error);
    const v = { ...r.value }; if (!Object.keys(v).length) return bad(reply, 'Nothing to change', 400);
    if (v.email) { const ex = (await pool.query('select id from sales_contacts where lower(email)=$1 and id<>$2', [v.email, req.params.id])).rows[0]; if (ex) return bad(reply, 'Another contact already has that email address', 409); }
    if ('companyName' in v) { v.company_id = await companyId(v.companyName); delete v.companyName; }
    if ('email' in v && !v.email) v.email = null;
    const keys = Object.keys(v), sets = keys.map((k, i) => `${k}=$${i + 2}`);
    const before = 'tags' in v ? (await pool.query('select tags from sales_contacts where id=$1', [req.params.id])).rows[0]?.tags || [] : null;
    const row = await pool.query(`update sales_contacts set ${sets.join(',')}, updated_at=now() where id=$1 returning id`, [req.params.id, ...keys.map(k => v[k])]);
    if (row.rowCount && before) await fireTagsAdded(pool, req.params.id, before, v.tags, { deliberate: true });
    return row.rowCount ? { ok: true } : bad(reply, 'Not found', 404);
  });
  // they asked to stop hearing from us, or they are back
  app.put('/v1/sales/contacts/:id/unsubscribe', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const off = req.body?.unsubscribed !== false;
    if (!off) { const asked = (await pool.query(`select s.reason from sales_suppressions s join sales_contacts c on lower(c.email)=s.email where c.id=$1`, [req.params.id])).rows[0]; if (asked) return bad(reply, { unsubscribed: 'They unsubscribed themselves, so this cannot be undone from here. If they ask to hear from us again, they can reply and say so.', bounced: 'Mail to this address bounced, so it cannot be turned back on. Fix the address instead.', complained: 'They marked an email as spam, so this cannot be turned back on.', manual: 'They are on the do-not-email list.' }[asked.reason] || 'They are on the do-not-email list.', 409); }
    const r = await pool.query(`update sales_contacts set unsubscribed_at=${off ? 'coalesce(unsubscribed_at, now())' : 'null'}, email_ok=${off ? 'false' : 'true'}, updated_at=now() where id=$1 returning id`, [req.params.id]);
    if (!r.rowCount) return bad(reply, 'Not found', 404);
    await logActivity({ contactId: req.params.id, kind: 'system', text: off ? 'Marked as not to be emailed' : 'Allowed to be emailed again', actor: actorOf(req) });
    if (off) await stopRuns(pool, { contactId: req.params.id, reason: 'they are marked as not to be emailed' });
    return { ok: true };
  });
  app.delete('/v1/sales/contacts/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from sales_contacts where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });
  app.post('/v1/sales/contacts/:id/activities', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = cleanActivity(req.body); if (r.error) return bad(reply, r.error);
    if (!(await pool.query('select 1 from sales_contacts where id=$1', [req.params.id])).rowCount) return bad(reply, 'Not found', 404);
    const dealId = UUID.test(String(req.body?.dealId || '')) ? req.body.dealId : null;
    await logActivity({ contactId: req.params.id, dealId, kind: r.value.kind, text: r.value.text, actor: actorOf(req) });
    return reply.code(201).send({ ok: true });
  });

  // ---------- deals ----------
  const DEAL_SELECT = `select d.id,d.title,d.stage,d.value_cents,d.expected_close,d.source,d.lost_reason,d.last_activity_at,d.closed_at,d.created_at,d.contact_id,c.name contact_name,c.email contact_email,co.name company_name,d.owner_id,d.project_id,(select u.name from users u where u.id=d.owner_id) owner_name,(select p.client_id from projects p where p.id=d.project_id) project_client_id from sales_deals d left join sales_contacts c on c.id=d.contact_id left join sales_companies co on co.id=c.company_id`;
  app.get('/v1/sales/deals', { preHandler: pre }, async (req) => {
    const stage = STAGES.includes(req.query?.stage) ? req.query.stage : null;
    const rows = (await pool.query(`${DEAL_SELECT} ${stage ? 'where d.stage=$1' : ''} order by d.updated_at desc limit 500`, stage ? [stage] : [])).rows;
    return { deals: rows.map(d => ({ ...d, value_cents: Number(d.value_cents), staleDays: OPEN_STAGES.includes(d.stage) ? staleDays(d.last_activity_at) : 0 })), summary: pipelineSummary(rows) };
  });
  app.post('/v1/sales/deals', { preHandler: pre }, async (req, reply) => {
    const r = cleanDeal(req.body); if (r.error) return bad(reply, r.error);
    const v = r.value, contactId = UUID.test(String(req.body?.contactId || '')) ? req.body.contactId : null;
    if (contactId && !(await pool.query('select 1 from sales_contacts where id=$1', [contactId])).rowCount) return bad(reply, 'That contact is not there', 404);
    const closed = ['won', 'lost'].includes(v.stage);
    const row = (await pool.query(`insert into sales_deals(contact_id,title,stage,value_cents,expected_close,source,lost_reason,closed_at,owner_id) values($1,$2,$3,$4,$5,$6,$7,${closed ? 'now()' : 'null'},$8) returning id`, [contactId, v.title, v.stage, v.value_cents || 0, v.expected_close || null, v.source || 'manual', v.lost_reason || '', actorOf(req)])).rows[0];
    await logActivity({ contactId, dealId: row.id, kind: 'stage', text: `Deal started: ${v.title} (${STAGE_LABELS[v.stage]})`, actor: actorOf(req) });
    return reply.code(201).send({ id: row.id });
  });
  app.put('/v1/sales/deals/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = cleanDeal(req.body, { partial: true }); if (r.error) return bad(reply, r.error);
    const v = r.value; if (!Object.keys(v).length) return bad(reply, 'Nothing to change', 400);
    const prev = (await pool.query('select id,contact_id,title,stage from sales_deals where id=$1', [req.params.id])).rows[0]; if (!prev) return bad(reply, 'Not found', 404);
    const keys = Object.keys(v), sets = keys.map((k, i) => `${k}=$${i + 2}`);
    if (v.stage && v.stage !== prev.stage) sets.push(['won', 'lost'].includes(v.stage) ? 'closed_at=now()' : 'closed_at=null', 'last_activity_at=now()');
    await pool.query(`update sales_deals set ${sets.join(',')}, updated_at=now() where id=$1`, [req.params.id, ...keys.map(k => v[k])]);
    if (v.stage && v.stage !== prev.stage) await logActivity({ contactId: prev.contact_id, dealId: prev.id, kind: 'stage', text: `${prev.title}: ${STAGE_LABELS[prev.stage]} → ${STAGE_LABELS[v.stage]}${v.stage === 'lost' && v.lost_reason ? ` (${v.lost_reason})` : ''}`, actor: actorOf(req) });
    if (v.stage && v.stage !== prev.stage && prev.contact_id) await fireTrigger(pool, { type: 'deal_stage', contactId: prev.contact_id, dealId: prev.id, stage: v.stage }, { deliberate: true });
    return { ok: true };
  });
  // A won deal becomes work: the client's room, a project in it (and a build record for software), and the deal's owner as the account owner.
  app.post('/v1/sales/deals/:id/start-project', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const b = req.body || {}, r = await startProject(pool, { dealId: req.params.id, actor: actorOf(req), kind: b.kind === 'product' ? 'product' : 'software', name: String(b.name || '').slice(0, 120), newBuild: b.newBuild !== false, again: b.again === true });
    if (r.error) return reply.code(r.status).send({ error: r.error, existing: r.existing });
    return reply.code(201).send({ client: r.client, project: r.project, roomUrl: `/clients/${r.client.id}#project=${r.project.id}` });
  });
  app.delete('/v1/sales/deals/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from sales_deals where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });

  // ---------- tasks ----------
  app.get('/v1/sales/tasks', { preHandler: pre }, async (req) => {
    const scope = req.query?.scope, filter = { done: `t.done_at is not null`, overdue: `t.done_at is null and t.due_at < now()`, today: `t.done_at is null and t.due_at < date_trunc('day', now()) + interval '1 day'` }[scope] || `t.done_at is null`;
    const rows = (await pool.query(`select t.id,t.title,t.due_at,t.done_at,t.contact_id,t.deal_id,c.name contact_name,c.email contact_email,d.title deal_title from sales_tasks t left join sales_contacts c on c.id=t.contact_id left join sales_deals d on d.id=t.deal_id where ${filter} order by ${scope === 'done' ? 't.done_at desc' : 't.due_at nulls last, t.created_at'} limit 300`)).rows;
    return { tasks: rows };
  });
  app.post('/v1/sales/tasks', { preHandler: pre }, async (req, reply) => {
    const r = cleanTask(req.body); if (r.error) return bad(reply, r.error);
    const contactId = UUID.test(String(req.body?.contactId || '')) ? req.body.contactId : null, dealId = UUID.test(String(req.body?.dealId || '')) ? req.body.dealId : null;
    if (!contactId && !dealId) return bad(reply, 'A task belongs to a contact or a deal');
    const row = await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at,created_by) values($1,$2,$3,$4,$5) returning id`, [contactId, dealId, r.value.title, r.value.due_at || null, actorOf(req)]).catch(() => null);
    return row ? reply.code(201).send({ id: row.rows[0].id }) : bad(reply, 'That contact or deal is not there', 404);
  });
  app.put('/v1/sales/tasks/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = cleanTask(req.body, { partial: true }); if (r.error) return bad(reply, r.error);
    const v = { ...r.value }, done = v.done; delete v.done; const keys = Object.keys(v), sets = keys.map((k, i) => `${k}=$${i + 2}`);
    if (done !== undefined) sets.push(done ? 'done_at=coalesce(done_at, now())' : 'done_at=null');
    if (!sets.length) return bad(reply, 'Nothing to change', 400);
    const t = (await pool.query(`update sales_tasks set ${sets.join(',')} where id=$1 returning id,title,contact_id,deal_id`, [req.params.id, ...keys.map(k => v[k])])).rows[0];
    if (!t) return bad(reply, 'Not found', 404);
    if (done) await logActivity({ contactId: t.contact_id, dealId: t.deal_id, kind: 'task', text: `Done: ${t.title}`, actor: actorOf(req) });
    return { ok: true };
  });
  app.delete('/v1/sales/tasks/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from sales_tasks where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });

  // ---------- bringing people in ----------
  async function upsertPerson({ name, email, phone = '', title = '', companyName = '', source, tags = [], notes = '', clientId = null }) {
    const ex = email ? (await pool.query('select id, client_id from sales_contacts where lower(email)=$1', [email])).rows[0] : null;
    if (ex) { if (clientId && !ex.client_id) await pool.query('update sales_contacts set client_id=$2 where id=$1', [ex.id, clientId]); return { id: ex.id, created: false }; }
    const cid = await companyId(companyName);
    const row = (await pool.query(`insert into sales_contacts(name,email,phone,title,company_id,source,tags,notes,client_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [name, email || null, phone, title, cid, source, tags, notes, clientId])).rows[0];
    return { id: row.id, created: true };
  }
  app.post('/v1/sales/import/hub', { preHandler: pre }, async (req) => syncHubContacts(pool, { actor: actorOf(req) }));
  app.post('/v1/sales/import/csv', { preHandler: pre, bodyLimit: 2_000_000 }, async (req, reply) => {
    const rows = parseCsv(req.body?.csv); if (!rows.length) return bad(reply, 'Paste a list with a header row (name, email, phone, company, title, tags) and at least one person');
    if (rows.length > 500) return bad(reply, 'Five hundred at a time is the limit');
    const out = { rows: rows.length, created: 0, alreadyThere: 0, invalid: 0, errors: [] };
    for (const [n, row] of rows.entries()) {
      const c = cleanContact({ name: row.name || row.fullname || [row.firstname, row.lastname].filter(Boolean).join(' '), email: row.email || row.emailaddress, phone: row.phone, title: row.title || row.jobtitle, companyName: row.company || row.organization, tags: row.tags, notes: row.notes, source: 'import' });
      if (c.error) { out.invalid++; if (out.errors.length < 5) out.errors.push(`Row ${n + 2}: ${c.error}`); continue; }
      const v = c.value, r = await upsertPerson({ name: v.name || '', email: v.email, phone: v.phone, title: v.title, companyName: v.companyName, source: 'import', tags: v.tags, notes: v.notes });
      if (r.created) { out.created++; await logActivity({ contactId: r.id, kind: 'system', text: 'Imported from a list', actor: actorOf(req) }); } else out.alreadyThere++;
    }
    return out;
  });
}
