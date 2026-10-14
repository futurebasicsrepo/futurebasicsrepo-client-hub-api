// Opportunity finder routes (staff only; see sales-opportunities.js for the rules).
//   GET /v1/sales/opportunities?type=   who to talk to next and why, strongest first, one line per person
//   POST /v1/sales/opportunities/act    { key, action: 'task' | 'snooze' | 'dismiss', days? }
import { OPEN_STAGES, heat } from './sales.js';
import { OPP_TYPES, describe, rank, oppKey, hiddenUntil, countsByType } from './sales-opportunities.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAT_KINDS = ['showcase_demo', 'showcase_view', 'email_in', 'chat_in', 'meeting', 'call'];
const OUTBOUND = ['email_out', 'chat_out', 'call', 'meeting'];
const WHO = `c.id contact_id, c.name, c.email, co.name company`;
const FROM = `from sales_contacts c left join sales_companies co on co.id=c.company_id`;
const NO_OPEN_TASK = `not exists (select 1 from sales_tasks t where t.contact_id=c.id and t.done_at is null)`;
const NO_OPEN_DEAL = `not exists (select 1 from sales_deals d where d.contact_id=c.id and d.stage = any($1))`;
const days = at => Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86400_000));

// Every reason to reach out that the CRM can see right now, before staff's "not now"s are applied.
// `hidden` (key → state, from sales_opportunity_state) lets the capped lists skip people staff already set aside, so a dismissed top 40 does not hide the next 40.
export async function findOpportunities(pool, now = Date.now(), hidden = new Map()) {
  const skip = type => [...hidden.keys()].filter(k => k.startsWith(type + ':')).map(k => k.slice(type.length + 1)).filter(id => UUID.test(id));
  const out = [], add = (type, id, row, f) => { const d = describe(type, { name: row.name, email: row.email, company: row.company, ...f }); out.push({ key: oppKey(type, id), type, contactId: row.contact_id || null, dealId: f.dealId || null, name: row.name || row.email || '', company: row.company || '', email: row.email || '', score: d.score, reason: d.reason, task: d.task }); };
  const q = (sql, args = []) => pool.query(sql, args).then(r => r.rows).catch(() => []);

  for (const r of await q(`select ${WHO}, v.last_message_at since, extract(day from now()-v.last_message_at)::int days ${FROM} join chat_conversations v on v.contact_id=c.id where v.status='waiting'`)) add('chat_waiting', r.contact_id, r, { since: r.since, days: r.days });
  for (const r of await q(`select distinct on (c.id) ${WHO}, a.text, extract(day from now()-a.created_at)::int days ${FROM} join sales_activities a on a.contact_id=c.id
      where a.kind='email_in' and a.created_at > now()-interval '14 days' and a.text not like '(automatic reply)%' and c.unsubscribed_at is null
        and not exists (select 1 from sales_activities b where b.contact_id=a.contact_id and b.created_at > a.created_at and b.kind = any($1)) order by c.id, a.created_at desc`, [OUTBOUND])) add('inbound_unanswered', r.contact_id, r, { text: r.text, days: r.days });
  for (const r of await q(`select distinct on (c.id) ${WHO}, extract(day from now()-a.created_at)::int days, (select b.name from builds b where b.id::text = a.meta->>'buildId') build ${FROM} join sales_activities a on a.contact_id=c.id
      where a.kind='showcase_demo' and a.created_at > now()-interval '14 days' and c.unsubscribed_at is null and ${NO_OPEN_TASK}
        and not exists (select 1 from sales_activities b where b.contact_id=a.contact_id and b.created_at > a.created_at and b.kind = any($1)) order by c.id, a.created_at desc`, [OUTBOUND])) add('opened_live', r.contact_id, r, { days: r.days, build: r.build });
  for (const r of await q(`select d.id deal_id, d.title, d.stage, d.value_cents, extract(day from now()-d.last_activity_at)::int days, c.id contact_id, c.name, c.email, co.name company
      from sales_deals d left join sales_contacts c on c.id=d.contact_id left join sales_companies co on co.id=coalesce(c.company_id, d.company_id) where d.stage = any($1) and d.last_activity_at <= now()-interval '7 days' and d.id <> all($2::uuid[]) order by d.value_cents desc limit 80`, [OPEN_STAGES, skip('deal_quiet')])) add('deal_quiet', r.deal_id, r, { dealId: r.deal_id, dealTitle: r.title, stage: r.stage, value: Number(r.value_cents), days: r.days });

  // warm people with no deal, and people who were warm and went quiet: from what they did, with the same warmth the Contacts list uses
  const ev = await q(`select a.contact_id, a.kind, a.created_at "at" from sales_activities a join sales_contacts c on c.id=a.contact_id
      where a.kind = any($2) and a.created_at > now()-interval '60 days' and c.unsubscribed_at is null and ${NO_OPEN_DEAL} and ${NO_OPEN_TASK}`, [OPEN_STAGES, HEAT_KINDS]);
  const by = new Map(); for (const e of ev) (by.get(e.contact_id) || by.set(e.contact_id, []).get(e.contact_id)).push({ kind: e.kind, at: e.at });
  const warm = [], cold = [];
  for (const [id, list] of by) {
    const h = heat(list, now), last = Math.max(...list.map(e => new Date(e.at).getTime()));
    if (h.level === 'hot' || h.level === 'warm') warm.push({ id, level: h.level, list });
    else if (now - last >= 14 * 86400_000 && ['warm', 'hot'].includes(heat(list, now - 14 * 86400_000).level)) cold.push({ id, last }); // warm two weeks ago, not now
  }
  const ids = [...new Set([...warm.map(w => w.id), ...cold.map(c => c.id)])];
  const people = new Map((ids.length ? await q(`select ${WHO} ${FROM} where c.id = any($1::uuid[])`, [ids]) : []).map(r => [r.contact_id, r]));
  const said = { showcase_view: n => `looked at builds ${n} time${n === 1 ? '' : 's'}`, showcase_demo: () => 'opened a live build', email_in: () => 'wrote to us', chat_in: () => 'chatted with us', meeting: () => 'met with us', call: () => 'spoke with us' };
  for (const w of warm) { const r = people.get(w.id); if (!r) continue; const counts = {}; for (const e of w.list) counts[e.kind] = (counts[e.kind] || 0) + 1; add('hot_no_deal', w.id, r, { level: w.level, signals: Object.entries(counts).map(([k, n]) => said[k](n)).join(', ') }); }
  for (const c of cold) { const r = people.get(c.id); if (r) add('gone_cold', c.id, r, { days: days(c.last) }); }

  for (const r of await q(`select ${WHO} ${FROM} where 'tech-pack' = any(c.tags) and not (c.tags && '{builds,showcase}'::text[]) and c.unsubscribed_at is null and c.id <> all($2::uuid[]) and ${NO_OPEN_DEAL} and ${NO_OPEN_TASK} order by c.created_at desc limit 40`, [OPEN_STAGES, skip('cross_sell_builds')])) add('cross_sell_builds', r.contact_id, r, {});
  for (const r of await q(`select ${WHO} ${FROM} where 'builds' = any(c.tags) and not ('tech-pack' = any(c.tags)) and c.unsubscribed_at is null and c.id <> all($2::uuid[]) and ${NO_OPEN_DEAL} and ${NO_OPEN_TASK} order by c.created_at desc limit 40`, [OPEN_STAGES, skip('cross_sell_techpack')])) add('cross_sell_techpack', r.contact_id, r, {});
  for (const r of await q(`with won as (select c.company_id, sum(d.value_cents) value from sales_deals d join sales_contacts c on c.id=d.contact_id where d.stage='won' and c.company_id is not null group by c.company_id)
      select w.company_id, co.name company, w.value, o.id contact_id, o.name, o.email,
        (select count(*) from sales_contacts x where x.company_id=w.company_id and not exists (select 1 from sales_deals dd where dd.contact_id=x.id)) others
      from won w join sales_companies co on co.id=w.company_id
      join lateral (select x.id,x.name,x.email from sales_contacts x where x.company_id=w.company_id and x.unsubscribed_at is null and not exists (select 1 from sales_deals dd where dd.contact_id=x.id) and not exists (select 1 from sales_tasks t where t.contact_id=x.id and t.done_at is null) order by x.created_at limit 1) o on true limit 40`)) add('account_expansion', r.company_id, r, { company: r.company, value: Number(r.value), others: Number(r.others) });
  for (const r of await q(`select ${WHO}, c.source, extract(day from now()-c.created_at)::int days ${FROM} where c.created_at > now()-interval '7 days' and c.source not in ('hub','import') and c.unsubscribed_at is null
      and not exists (select 1 from sales_deals d where d.contact_id=c.id) and not exists (select 1 from sales_tasks t where t.contact_id=c.id) and not exists (select 1 from sales_activities a where a.contact_id=c.id and a.kind <> 'system') and c.id <> all($1::uuid[]) limit 40`, [skip('new_unworked')])) add('new_unworked', r.contact_id, r, { days: r.days, source: r.source });
  return out;
}

export function registerSalesOpportunityRoutes(app, d) {
  const { pool, authenticate, adminOnly } = d, pre = [authenticate, adminOnly];
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const hiddenMap = async () => new Map((await pool.query(`select key, until from sales_opportunity_state where until > now()`)).rows.map(r => [r.key, r]));

  app.get('/v1/sales/opportunities', { preHandler: pre }, async (req) => {
    const hidden = await hiddenMap(), all = rank(await findOpportunities(pool, Date.now(), hidden), { hidden, limit: 200 }), type = String(req.query?.type || '');
    const shown = OPP_TYPES[type] ? all.filter(o => o.type === type) : all;
    return { opportunities: shown.slice(0, 60), total: all.length, counts: countsByType(all), priorities: { now: all.filter(o => o.priority === 'now').length, week: all.filter(o => o.priority === 'week').length, later: all.filter(o => o.priority === 'later').length }, types: Object.entries(OPP_TYPES).map(([k, v]) => ({ type: k, label: v.label })) };
  });
  app.post('/v1/sales/opportunities/act', { preHandler: pre }, async (req, reply) => {
    const { key, action } = req.body || {}, a = ['task', 'snooze', 'dismiss'].includes(action) ? action : null;
    if (!a || !key || String(key).length > 80) return bad(reply, 'Choose make a task, snooze or hide');
    const opp = (await findOpportunities(pool)).find(o => o.key === key); if (!opp) return bad(reply, 'That opportunity is no longer there. It may already be done.', 404);
    if (a === 'task') {
      if (!opp.contactId) return bad(reply, 'There is no contact to make a task for');
      await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at) values($1,$2,$3,now())`, [opp.contactId, opp.dealId, opp.task || `Follow up with ${opp.name}`]);
    }
    const state = a === 'task' ? 'done' : a === 'snooze' ? 'snoozed' : 'dismissed', until = hiddenUntil(state, Date.now(), req.body?.days);
    await pool.query(`insert into sales_opportunity_state(key,state,until,actor_id) values($1,$2,$3,$4) on conflict (key) do update set state=excluded.state, until=excluded.until, actor_id=excluded.actor_id, at=now()`, [key, state, until, UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null]);
    return { ok: true, until };
  });
}
