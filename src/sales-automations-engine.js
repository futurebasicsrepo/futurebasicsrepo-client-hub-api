// Sales automations, running them (see sales-automations.js for the rules, sales-automations-routes.js for the staff pages).
//
//   fireTrigger   something happened to a contact: start every switched-on automation that listens for it (never throws into the caller)
//   stopRuns      someone replied or opted out: stop what is running for them
//   processRuns   the scheduled job: do the steps that are due, one contact at a time
//
// Safety, in the order it matters:
//   - email goes only through the same rules as email written by hand (a relationship, never to anyone who opted out, the daily limit, a mailing address), never "confirmed", and only in working hours
//   - a step is written to the log before it is done, so a crash can lose a step but never repeat one
//   - someone who writes back, or opts out, stops everything that is waiting to write to them
//   - an automation that takes in a flood of people in an hour switches itself off; there is also one switch that pauses everything
import { DEFAULT_WINDOW, matches, waitMs, inSendWindow, nextSendTime } from './sales-automations.js';
import { renderTemplate, firstNameOf } from './sales-email.js';
import { cleanTag } from './sales.js';

export const FLOOD_PER_HOUR = 40;
const HOUR = 3600_000, DAY = 24 * HOUR;
const dueAt = (now, days) => { if (!days) return new Date(now); const d = new Date(now); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 9, 0, 0)); };

export async function automationSettings(pool) {
  const row = (await pool.query(`select value from app_settings where key='salesAutomation'`).catch(() => ({ rows: [] }))).rows[0];
  return { ...DEFAULT_WINDOW, ...(row?.value || {}) };
}

// ---------- starting ----------
async function enroll(pool, a, ev, now, deliberate = false) {
  const contact = (await pool.query('select id from sales_contacts where id=$1', [ev.contactId])).rows[0]; if (!contact) return 0;
  const prior = (await pool.query(`select status, started_at from sales_runs where automation_id=$1 and contact_id=$2 order by started_at desc limit 1`, [a.id, ev.contactId])).rows[0];
  if (prior) {
    if (prior.status === 'active') return 0;
    if (a.reenter_days == null) return 0; // once per person
    if (new Date(prior.started_at).getTime() > now.getTime() - a.reenter_days * DAY) return 0;
  }
  const recent = Number((await pool.query(`select count(*) n from sales_runs where automation_id=$1 and started_at > $2`, [a.id, new Date(now.getTime() - HOUR)])).rows[0].n);
  if (!deliberate && recent >= FLOOD_PER_HOUR) { // staff tagging a list on purpose is not a flood
    await pool.query(`update sales_automations set enabled=false, note=$2, updated_at=now() where id=$1 and enabled`, [a.id, `Switched off automatically: more than ${FLOOD_PER_HOUR} people entered within an hour. Check the trigger, then switch it back on.`]);
    return 0;
  }
  const r = await pool.query(`insert into sales_runs(automation_id,contact_id,deal_id,next_at,context) values($1,$2,$3,$4,$5::jsonb) on conflict do nothing returning id`, [a.id, ev.contactId, ev.dealId || null, now, JSON.stringify({ tag: ev.tag || null, stage: ev.stage || null })]);
  if (!r.rowCount) return 0;
  await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text) values($1,$2,'system',$3)`, [ev.contactId, ev.dealId || null, `Started the automation “${a.name}”`]);
  return 1;
}

export async function fireTrigger(pool, ev, { log = console, now = new Date(), deliberate = false } = {}) {
  try {
    if (!ev?.contactId || !ev.type) return 0;
    if ((await automationSettings(pool)).paused) return 0;
    const autos = (await pool.query(`select id,name,trigger,reenter_days from sales_automations where enabled and trigger->>'type'=$1`, [ev.type])).rows;
    let n = 0; for (const a of autos) if (matches(a.trigger, ev)) n += await enroll(pool, a, ev, now, deliberate);
    return n;
  } catch (e) { log.warn?.({ err: e.message }, 'automation trigger not handled'); return 0; }
}

// the tags that are new on a contact, as triggers
export const fireTagsAdded = async (pool, contactId, before, after, opts) => { for (const t of (after || []).filter(x => !(before || []).includes(x))) await fireTrigger(pool, { type: 'tag_added', contactId, tag: t }, opts); };

// ---------- stopping ----------
export async function stopRuns(pool, { contactId, reason, onlyIfStopOnReply = false }) {
  const rows = (await pool.query(`update sales_runs r set status='stopped', stop_reason=$2, finished_at=now() from sales_automations a where a.id=r.automation_id and r.contact_id=$1 and r.status='active' and ($3 = false or a.stop_on_reply) returning r.id, a.name`, [contactId, reason, onlyIfStopOnReply])).rows;
  for (const r of rows) await pool.query(`insert into sales_activities(contact_id,kind,text) values($1,'system',$2)`, [contactId, `Stopped the automation “${r.name}”: ${reason}`]);
  return rows.length;
}

// ---------- what a message may say about a contact ----------
export async function varsOf(pool, contactId) {
  const c = (await pool.query(`select c.name, co.name company from sales_contacts c left join sales_companies co on co.id=c.company_id where c.id=$1`, [contactId])).rows[0]; if (!c) return null;
  const build = (await pool.query(`select b.name from sales_activities a join builds b on b.id = (a.meta->>'buildId')::uuid where a.contact_id=$1 and a.kind in ('showcase_view','showcase_demo') and a.meta->>'buildId' ~ '^[0-9a-f-]{36}$' order by a.created_at desc limit 1`, [contactId]).catch(() => ({ rows: [] }))).rows[0]?.name || '';
  return { first_name: firstNameOf(c.name), name: c.name || 'this contact', company: c.company || '', build };
}

// ---------- deals that went quiet are an event nobody fires, so look for them ----------
export async function scanQuietDeals(pool, { now = new Date(), log = console } = {}) {
  let n = 0;
  try {
    const autos = (await pool.query(`select id,name,trigger,reenter_days from sales_automations where enabled and trigger->>'type'='deal_quiet'`)).rows;
    for (const a of autos) {
      const cutoff = new Date(now.getTime() - Number(a.trigger.days) * DAY);
      const deals = (await pool.query(`select id, contact_id from sales_deals where stage in ('new','contacted','meeting','proposal') and contact_id is not null and last_activity_at <= $1 limit 100`, [cutoff])).rows;
      for (const d of deals) n += await enroll(pool, a, { type: 'deal_quiet', contactId: d.contact_id, dealId: d.id }, now);
    }
  } catch (e) { log.warn?.({ err: e.message }, 'quiet deals not scanned'); }
  return n;
}

// ---------- doing the steps ----------
// deps: { sendToContact(contactId, {subject, body, via}), checkContact(contactId) → { ok, reasons, relationship, capReached } }
export async function processRuns(pool, deps, { now = new Date(), limit = 50, log = console } = {}) {
  const cfg = await automationSettings(pool); if (cfg.paused) return { ran: 0, steps: 0, paused: true };
  await scanQuietDeals(pool, { now, log });
  // lease what is due for ten minutes so two workers never take the same person
  const due = (await pool.query(`update sales_runs set next_at = $2 where id in (select r.id from sales_runs r join sales_automations a on a.id=r.automation_id where r.status='active' and a.enabled and r.next_at <= $1 order by r.next_at limit $3 for update of r skip locked) returning id, automation_id, contact_id, deal_id, step, started_at, context`, [now, new Date(now.getTime() + 10 * 60_000), limit])).rows;
  let steps = 0;
  for (const run of due) {
    try { steps += await runOne(pool, deps, run, cfg, now, log); }
    catch (e) { log.warn?.({ err: e.message, run: run.id }, 'automation step failed'); await pool.query(`update sales_runs set next_at=$2 where id=$1 and status='active'`, [run.id, new Date(now.getTime() + 30 * 60_000)]); }
  }
  return { ran: due.length, steps };
}

async function runOne(pool, deps, run, cfg, now, log) {
  const a = (await pool.query('select id,name,steps,stop_on_reply from sales_automations where id=$1', [run.automation_id])).rows[0]; if (!a) return 0;
  let step = run.step, done = 0;
  const save = (patch) => pool.query(`update sales_runs set step=$2, next_at=$3, status=$4, stop_reason=$5, finished_at=case when $4 <> 'active' then now() else null end where id=$1`, [run.id, patch.step, patch.next, patch.status || 'active', patch.reason || '']);
  const note = (text, kind = 'system') => pool.query(`insert into sales_activities(contact_id,deal_id,kind,text) values($1,$2,$3,$4)`, [run.contact_id, run.deal_id, kind, text]);
  const logStep = (s, kind, outcome, detail = '') => pool.query(`insert into sales_run_log(run_id,step,kind,outcome,detail) values($1,$2,$3,$4,$5) on conflict (run_id,step) do update set outcome=excluded.outcome, detail=excluded.detail`, [run.id, s, kind, outcome, String(detail).slice(0, 300)]);
  // the step is written before it is done: false means an earlier attempt already started it, so it is not done twice
  const claim = async (s, kind, detail = '') => (await pool.query(`insert into sales_run_log(run_id,step,kind,outcome,detail) values($1,$2,$3,'done',$4) on conflict (run_id,step) do nothing returning id`, [run.id, s, kind, String(detail).slice(0, 300)])).rowCount > 0;
  for (let guard = 0; guard < 14; guard++) {
    if (a.stop_on_reply && (await pool.query(`select 1 from sales_activities where contact_id=$1 and kind='email_in' and created_at > $2 and text not like '(automatic reply)%' limit 1`, [run.contact_id, run.started_at])).rowCount) { await save({ step, next: now, status: 'stopped', reason: 'they wrote back' }); await note(`Stopped the automation “${a.name}”: they wrote back`); return done; }
    const s = a.steps[step];
    if (!s) { await save({ step, next: now, status: 'done' }); return done; }
    if (s.kind === 'wait') {
      await logStep(step, 'wait', 'done', `${s.days || 0}d ${s.hours || 0}h`);
      await save({ step: step + 1, next: new Date(now.getTime() + waitMs(s)) }); return done + 1;
    }
    if (s.kind === 'task') {
      const v = await varsOf(pool, run.contact_id); if (!v) return done;
      const title = renderTemplate(s.title, v).text.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Follow up';
      if (await claim(step, 'task', title)) {
        await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at) values($1,$2,$3,$4)`, [run.contact_id, run.deal_id, title, dueAt(now, s.dueDays)]);
        await note(`Automation “${a.name}” made a task: ${title}`);
      }
    } else if (s.kind === 'tag') {
      if (await claim(step, 'tag', [s.add && `+${s.add}`, s.remove && `-${s.remove}`].filter(Boolean).join(' '))) {
        const before = (await pool.query('select tags from sales_contacts where id=$1', [run.contact_id])).rows[0]?.tags || [];
        const next = [...new Set([...before.filter(t => t !== cleanTag(s.remove)), ...(s.add ? [cleanTag(s.add)] : [])])].sort();
        await pool.query(`update sales_contacts set tags=$2, updated_at=now() where id=$1`, [run.contact_id, next]);
        await note(`Automation “${a.name}” ${[s.add && `added the tag “${s.add}”`, s.remove && `removed the tag “${s.remove}”`].filter(Boolean).join(' and ')}`);
        await fireTagsAdded(pool, run.contact_id, before, next, { log, now });
      }
    } else if (s.kind === 'email') {
      if (!inSendWindow(now, cfg)) { await save({ step, next: nextSendTime(now, cfg) }); return done; } // not at 3am
      const tpl = (await pool.query('select name,subject,body from sales_templates where id=$1', [s.templateId])).rows[0];
      if (!tpl) { await logStep(step, 'email', 'skipped', 'the template was deleted'); await note(`Automation “${a.name}” skipped an email: its template was deleted`); step++; done++; await save({ step, next: now }); continue; }
      const check = await deps.checkContact(run.contact_id);
      if (check?.systemBlocked) { await save({ step, next: new Date(now.getTime() + 6 * HOUR) }); return done; } // email is not set up yet: hold them, do not use up their step
      if (check?.capReached) { await save({ step, next: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, cfg.startHour, 5)) }); return done; } // tomorrow, not never
      if (!check || !check.ok) {
        const why = (check?.reasons || ['They cannot be emailed.'])[0];
        await logStep(step, 'email', 'skipped', why);
        await note(`Automation “${a.name}” did not send “${tpl.name}”: ${why}`);
        if (check?.needsConfirmation) await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at) values($1,$2,$3,$4)`, [run.contact_id, run.deal_id, `Write to this contact yourself if you know them: the automation “${a.name}” held back “${tpl.name}” because nothing shows they know us`.slice(0, 200), now]);
        step++; done++; await save({ step, next: now }); continue;
      }
      // written first: if we die between here and the send, this step is never repeated
      const claimed = await pool.query(`insert into sales_run_log(run_id,step,kind,outcome,detail) values($1,$2,'email','done','sending') on conflict (run_id,step) do nothing returning id`, [run.id, step]);
      if (claimed.rowCount) {
        const r = await deps.sendToContact(run.contact_id, { subject: tpl.subject, body: tpl.body, via: a.name });
        if (r.ok) await logStep(step, 'email', 'done', tpl.name);
        else {
          await logStep(step, 'email', 'failed', r.error);
          await note(`Automation “${a.name}” could not send “${tpl.name}”: ${r.error}`);
          await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at) values($1,$2,$3,$4)`, [run.contact_id, run.deal_id, `The automation “${a.name}” could not send “${tpl.name}”: ${r.error}`.slice(0, 200), now]);
        }
      }
    }
    step++; done++; await save({ step, next: now });
  }
  return done;
}
