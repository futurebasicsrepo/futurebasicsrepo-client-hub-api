// GET /v1/admin/home: what the work console's home page shows beyond the Sales overview (which it also reads): leads waiting for a first reply, prototypes and
// how warm they are, projects in flight (software and product), and what is waiting elsewhere. Staff only.
import { hasBuildPreview } from './builds-routes.js';
import { projectRow, orderProjects, prototypeRow, firstName, trend, accountRow, orderAccounts, LEAD_SOURCES_EXCLUDED } from './home.js';

export function registerHomeRoutes(app, { pool, authenticate, adminOnly }) {
  const pre = [authenticate, adminOnly];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.get('/v1/admin/home', { preHandler: pre }, async (req) => {
    const me = UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null;
    const meRow = me ? (await pool.query('select name, email from users where id=$1', [me]).catch(() => ({ rows: [] }))).rows[0] : null;
    const q = async (sql, args = []) => (await pool.query(sql, args)).rows;
    const ex = LEAD_SOURCES_EXCLUDED;
    const [cur] = await q(`select count(*)::int n from sales_contacts where created_at > now() - interval '7 days' and not (source = any($1))`, [ex]);
    const [prev] = await q(`select count(*)::int n from sales_contacts where created_at <= now() - interval '7 days' and created_at > now() - interval '14 days' and not (source = any($1))`, [ex]);
    const [look] = await q(`select count(distinct email)::int lookers, count(distinct email) filter (where kind='demo')::int demos from build_views where created_at > now() - interval '7 days'`);
    const [won] = await q(`select count(*)::int n, coalesce(sum(value_cents),0)::bigint v from sales_deals where stage='won' and coalesce(closed_at, updated_at) > now() - interval '30 days'`);
    const awaiting = await q(`select c.id, c.name, c.email, co.name company, c.source, c.created_at from sales_contacts c left join sales_companies co on co.id=c.company_id
      where c.created_at > now() - interval '21 days' and c.email is not null and not (c.source = any($1))
        and not exists (select 1 from sales_activities a where a.contact_id=c.id and a.kind in ('email_out','call','meeting','chat_out'))
      order by c.created_at desc limit 8`, [ex]);
    // Posts the listening found that are worth a person's time: they join the same "today" list as tasks and leads.
    const [ist] = await q(`select coalesce((select (value->>'minScore')::int from app_settings where key='intel'), 40) min_score, coalesce((select (value->>'slaHours')::int from app_settings where key='intel'), 24) sla`);
    const [sc] = await q(`select count(*)::int total, count(*) filter (where status='new' and owner_id is null and found_at < now() - make_interval(hours => $2))::int overdue from intel_signals where scored_at is not null and relevant and score >= $1 and status in ('new','reviewing')`, [ist.min_score, ist.sla]);
    const sigs = await q(`select s.id, s.source, s.title, s.summary, s.score, s.status, s.found_at, s.posted_at, coalesce(nullif(u.name,''), u.email) owner_name from intel_signals s left join users u on u.id=s.owner_id
      where s.scored_at is not null and s.relevant and s.score >= $1 and s.status in ('new','reviewing') order by s.score desc, s.found_at desc limit 5`, [ist.min_score]);
    const protos = await q(`select b.id,b.slug,b.name,b.tagline,b.status,b.visibility,b.live_url,b.stack,jsonb_exists(b.media,'cover') has_cover,jsonb_array_length(b.catalog)::int products,
        (select count(*) from build_views v where v.build_id=b.id and v.created_at > now() - interval '7 days')::int views7,
        (select count(distinct v.email) from build_views v where v.build_id=b.id and v.created_at > now() - interval '7 days')::int lookers7,
        (select max(v.created_at) from build_views v where v.build_id=b.id) last_look,
        (select count(*) from build_invites i where i.build_id=b.id and i.revoked_at is null and i.expires_at > now())::int invites,
        (select coalesce(json_agg(distinct c.name), '[]'::json) from projects p join clients c on c.id=p.client_id where p.build_id=b.id and p.archived_at is null) clients
      from builds b where b.status in ('concept','in-progress') order by views7 desc, b.updated_at desc limit 8`);
    const showNow = await q(`select b.id,b.slug,b.name,b.tagline,b.status,b.visibility,b.live_url,b.stack,jsonb_exists(b.media,'cover') has_cover,0 products,
        (select count(*) from build_views v where v.build_id=b.id and v.created_at > now() - interval '30 days')::int views7, 0 lookers7, null::timestamptz last_look, 0 invites, '[]'::json clients
      from builds b where b.status='live' and b.visibility <> 'hidden' order by views7 desc, b.sort_order limit 3`);
    const projects = await q(`select pr.id,pr.name,pr.kind,pr.status,pr.milestone,pr.stage,pr.target_date,pr.updated_at,pr.build_id,c.id client_id,c.name client_name,(select u.name from users u where u.id=c.owner_id) account_owner,(select m.state from site_monitors m where m.build_id=pr.build_id) site_state,b.name build_name,b.live_url,
        (select count(*) from products p where p.project_id=pr.id)::int product_count,
        (select pm.author_role from project_messages pm where pm.project_id=pr.id order by pm.created_at desc limit 1) last_author,
        (select max(pm.created_at) from project_messages pm where pm.project_id=pr.id) last_message_at
      from projects pr join clients c on c.id=pr.client_id left join builds b on b.id=pr.build_id
      where pr.archived_at is null and pr.status not in ('archive','archived','complete') and c.archived_at is null and c.status='active' and c.slug <> 'future-basics'
      order by pr.updated_at desc limit 60`);
    const [appr] = await q(`select count(*)::int n from approvals a join products p on p.id=a.product_id join clients c on c.id=p.client_id where a.status='pending' and c.archived_at is null and c.status not in ('archive','archived')`);
    const [prod] = await q(`select count(*)::int n from production_runs pr join products p on p.id=pr.product_id join clients c on c.id=p.client_id
      where (pr.status in ('blocked','delayed') or (pr.eta_date is not null and pr.eta_date < current_date and pr.status not in ('complete','delivered'))) and c.archived_at is null and c.status not in ('archive','archived')`);
    // saved lead searches that found quick-turn sites nobody has opened yet
    const leadSearches = await q(`select id, trade, place, created_at, (select count(*) from jsonb_array_elements(results) r where (r->>'reachable')::boolean and (r->>'quickTurn')::boolean and coalesce((r->>'lead')::boolean, (r->>'score')::int < 80))::int quick
      from prototype_searches where schedule_id is not null and status='done' and seen_at is null and created_at > now() - interval '14 days' order by created_at desc limit 20`).then(r => r.filter(x => x.quick > 0).slice(0, 3)).catch(() => []);
    // The accounts this person owns and what each needs from them; and the live ones nobody owns yet (anyone can take one).
    const LIVE = `p.archived_at is null and p.status not in ('archive','archived','complete')`;
    const mine = me ? await q(`select c.id, c.name,
        (select count(*) from projects p where p.client_id=c.id and ${LIVE})::int projects,
        (select count(*) from projects p where p.client_id=c.id and ${LIVE} and (select pm.author_role from project_messages pm where pm.project_id=p.id order by pm.created_at desc limit 1)='client')::int waiting_on_us,
        (select count(*) from approvals a join products pr on pr.id=a.product_id where pr.client_id=c.id and a.status='pending')::int approvals,
        (select count(*) from sales_tasks t join sales_contacts ct on ct.id=t.contact_id where ct.client_id=c.id and t.done_at is null and t.due_at is not null and t.due_at < now() + interval '1 day')::int tasks_due,
        (select max(pm.created_at) from project_messages pm join projects p on p.id=pm.project_id where p.client_id=c.id) last_message_at
      from clients c where c.owner_id=$1 and c.archived_at is null and c.status='active' and c.slug <> 'future-basics'`, [me]) : [];
    const unowned = await q(`select c.id, c.name, (select count(*) from projects p where p.client_id=c.id and ${LIVE})::int projects from clients c
      where c.owner_id is null and c.archived_at is null and c.status='active' and c.slug <> 'future-basics' and exists (select 1 from projects p where p.client_id=c.id and ${LIVE} and p.name <> 'General development')
      order by c.name limit 12`);
    const out = {
      me: { firstName: firstName(meRow?.name, meRow?.email || req.auth?.email) },
      myAccounts: orderAccounts(mine.map(r => accountRow(r))),
      unownedAccounts: unowned.map(r => ({ id: r.id, name: r.name, projects: r.projects })),
      leadSearches: leadSearches.map(r => ({ id: r.id, trade: r.trade, place: r.place, quick: r.quick, at: r.created_at })),
      signals: { total: sc.total, overdue: sc.overdue, top: sigs.map(r => ({ id: r.id, source: r.source, title: r.title, summary: r.summary, score: r.score, status: r.status, ownerName: r.owner_name || '', foundAt: r.found_at, postedAt: r.posted_at })) },
      funnel: { newLeads7: cur.n, newLeadsPrev7: prev.n, trend: trend(cur.n, prev.n), lookers7: look.lookers, demos7: look.demos, won30: { count: won.n, valueCents: Number(won.v) } },
      awaitingReply: awaiting.map(r => ({ id: r.id, name: r.name || r.email, email: r.email, company: r.company || '', source: r.source, createdAt: r.created_at })),
      prototypes: protos.map(r => prototypeRow({ ...r, has_cover: r.has_cover || hasBuildPreview(r.slug) })), showNow: showNow.map(r => ({ ...prototypeRow({ ...r, has_cover: r.has_cover || hasBuildPreview(r.slug) }), views30: Number(r.views7) || 0 })),
      projects: orderProjects(projects.map(r => projectRow(r))),
      waiting: { approvals: appr.n, production: prod.n }
    };
    // My day is for everyone on the team, but each part of it shows only what the person has been given (Team access)
    const can = id => !req.staff || req.staff.can(id);
    if (!can('clients')) Object.assign(out, { myAccounts: [], unownedAccounts: [], projects: [], waiting: { approvals: 0, production: 0 } });
    if (!can('prototypes')) Object.assign(out, { prototypes: [], showNow: [], leadSearches: [] });
    if (!can('intel')) out.signals = { total: 0, overdue: 0, top: [] };
    if (!can('crm')) Object.assign(out, { awaitingReply: [], funnel: { newLeads7: 0, newLeadsPrev7: 0, trend: out.funnel.trend, lookers7: 0, demos7: 0, won30: { count: 0, valueCents: 0 } } });
    return out;
  });
  // The short list the quick "Start a tech pack" box picks a client from (My day and the left menu): live client rooms, newest first. Anyone on the team may ask; people without Clients and projects get an empty list.
  app.get('/v1/admin/client-picker', { preHandler: pre }, async (req) => {
    if (req.staff && !req.staff.can('clients')) return { clients: [] }; // not an error: My day simply has nothing to offer this person
    const rows = (await pool.query(`select id, name, created_at from clients where archived_at is null and status not in ('archive','archived') and slug <> 'future-basics' order by created_at desc limit 500`)).rows;
    return { clients: rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at })) };
  });
  // Take an account (or give it to someone): the owner is the one voice the client hears from and the person Home asks about it.
  app.put('/v1/admin/clients/:id/owner', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return reply.code(404).send({ error: 'Client not found' });
    const b = req.body || {}, who = b.userId === null || b.userId === '' ? null : b.userId === undefined ? (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null) : String(b.userId);
    if (who && !UUID.test(who)) return reply.code(400).send({ error: 'Choose a person' });
    if (who && !(await pool.query(`select 1 from users where id=$1 and role='admin'`, [who])).rowCount) return reply.code(404).send({ error: 'That person is not on the team' });
    const row = (await pool.query(`update clients set owner_id=$2 where id=$1 and slug <> 'future-basics' returning id`, [req.params.id, who])).rows[0];
    return row ? { ok: true, ownerId: who } : reply.code(404).send({ error: 'Client not found' });
  });
}
