// Sales automation routes (staff only; see sales-automations.js for the rules and sales-automations-engine.js for running them).
//
//   GET|POST /v1/sales/automations   PUT|DELETE /v1/sales/automations/:id   POST /v1/sales/automations/:id/dry-run   GET /v1/sales/automations/:id/runs
//   GET|PUT  /v1/sales/automations/settings   (working hours for email, and the one switch that pauses everything)   POST /v1/sales/automations/process  (do what is due now)
//   GET /v1/sales/contacts/:id/runs   POST /v1/sales/runs/:id/stop
import { cleanAutomation, cleanWindow, describeTrigger, describeStep, TRIGGER_LABEL, TRIGGER_TYPES, STEP_KINDS, TASK_FIELDS, starterAutomations, inSendWindow, nextSendTime } from './sales-automations.js';
import { processRuns, automationSettings, varsOf, stopRuns } from './sales-automations-engine.js';
import { renderTemplate } from './sales-email.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function seedAutomations(pool) {
  if (Number((await pool.query('select count(*) n from sales_automations')).rows[0].n)) return 0;
  const tpl = Object.fromEntries((await pool.query('select id,name from sales_templates')).rows.map(t => [t.name, t.id]));
  let pos = 0;
  for (const a of starterAutomations(tpl)) {
    const c = cleanAutomation(a); if (c.error) continue;
    await pool.query(`insert into sales_automations(name,enabled,trigger,steps,stop_on_reply,reenter_days,position) values($1,false,$2::jsonb,$3::jsonb,$4,$5,$6)`, [c.value.name, JSON.stringify(c.value.trigger), JSON.stringify(c.value.steps), c.value.stop_on_reply, c.value.reenter_days, pos += 10]);
  }
  return pos / 10;
}

export function registerSalesAutomationRoutes(app, d) {
  const { pool, authenticate, adminOnly, setSetting, sendToContact, checkContact, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const templates = async () => Object.fromEntries((await pool.query('select id,name from sales_templates')).rows.map(t => [t.id, t.name]));
  const missingTemplate = async steps => { const have = await templates(); return steps.find(s => s.kind === 'email' && !have[s.templateId]); };
  const shape = (a, tpl, stats = {}) => ({ id: a.id, name: a.name, enabled: a.enabled, trigger: a.trigger, triggerText: describeTrigger(a.trigger), steps: a.steps, stepText: a.steps.map(s => describeStep(s, tpl)), stopOnReply: a.stop_on_reply, reenterDays: a.reenter_days, note: a.note, ...stats });

  app.get('/v1/sales/automations', { preHandler: pre }, async () => {
    const [rows, tpl, cfg, stats] = await Promise.all([
      pool.query('select * from sales_automations order by position, created_at'), templates(), automationSettings(pool),
      pool.query(`select r.automation_id id, count(*) filter (where r.status='active') active, count(*) filter (where r.status='done') done, count(*) filter (where r.status='stopped') stopped,
        (select count(*) from sales_run_log l join sales_runs r2 on r2.id=l.run_id where r2.automation_id=r.automation_id and l.kind='email' and l.outcome='done' and l.detail <> 'sending') emails from sales_runs r group by r.automation_id`)]);
    const by = Object.fromEntries(stats.rows.map(x => [x.id, { active: Number(x.active), done: Number(x.done), stopped: Number(x.stopped), emails: Number(x.emails) }]));
    return { automations: rows.rows.map(a => shape(a, tpl, by[a.id] || { active: 0, done: 0, stopped: 0, emails: 0 })), templates: Object.entries(tpl).map(([id, name]) => ({ id, name })), settings: cfg, triggers: TRIGGER_TYPES.map(t => ({ type: t, label: TRIGGER_LABEL[t] })), stepKinds: STEP_KINDS, taskFields: TASK_FIELDS, windowOpen: inSendWindow(new Date(), cfg) };
  });
  app.get('/v1/sales/automations/settings', { preHandler: pre }, async () => ({ settings: await automationSettings(pool) }));
  app.put('/v1/sales/automations/settings', { preHandler: pre }, async (req, reply) => {
    const r = cleanWindow(req.body, await automationSettings(pool)); if (r.error) return bad(reply, r.error);
    await setSetting('salesAutomation', r.value); return { ok: true, settings: r.value };
  });
  app.post('/v1/sales/automations/process', { preHandler: pre }, async () => processRuns(pool, { sendToContact, checkContact }, { log }));
  app.post('/v1/sales/automations', { preHandler: pre }, async (req, reply) => {
    const r = cleanAutomation(req.body); if (r.error) return bad(reply, r.error);
    const m = await missingTemplate(r.value.steps); if (m) return bad(reply, 'One of the email steps uses a template that is not there. Pick another.');
    const row = (await pool.query(`insert into sales_automations(name,enabled,trigger,steps,stop_on_reply,reenter_days,position) values($1,false,$2::jsonb,$3::jsonb,$4,$5,coalesce((select max(position)+10 from sales_automations),10)) returning id`, [r.value.name, JSON.stringify(r.value.trigger), JSON.stringify(r.value.steps), r.value.stop_on_reply, r.value.reenter_days])).rows[0];
    return reply.code(201).send({ id: row.id });
  });
  app.put('/v1/sales/automations/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const cur = (await pool.query('select * from sales_automations where id=$1', [req.params.id])).rows[0]; if (!cur) return bad(reply, 'Not found', 404);
    // a body with only { enabled } is the on/off switch; anything else is an edit
    const onlySwitch = Object.keys(req.body || {}).every(k => k === 'enabled');
    let v = { name: cur.name, trigger: cur.trigger, steps: cur.steps, stop_on_reply: cur.stop_on_reply, reenter_days: cur.reenter_days };
    if (!onlySwitch) { const r = cleanAutomation(req.body); if (r.error) return bad(reply, r.error); v = r.value; }
    const m = await missingTemplate(v.steps); if (m) return bad(reply, 'One of the email steps uses a template that is not there. Pick another.');
    const enabled = 'enabled' in (req.body || {}) ? req.body.enabled === true : cur.enabled;
    await pool.query(`update sales_automations set name=$2, trigger=$3::jsonb, steps=$4::jsonb, stop_on_reply=$5, reenter_days=$6, enabled=$7, note=case when $7 and not enabled then '' else note end, updated_at=now() where id=$1`, [req.params.id, v.name, JSON.stringify(v.trigger), JSON.stringify(v.steps), v.stop_on_reply, v.reenter_days, enabled]);
    return { ok: true };
  });
  app.delete('/v1/sales/automations/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from sales_automations where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });

  // what would this do for this person, right now, without doing it
  app.post('/v1/sales/automations/:id/dry-run', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const a = (await pool.query('select * from sales_automations where id=$1', [req.params.id])).rows[0]; if (!a) return bad(reply, 'Not found', 404);
    const cid = String(req.body?.contactId || ''); if (!UUID.test(cid)) return bad(reply, 'Choose a contact to try it on');
    const vars = await varsOf(pool, cid); if (!vars) return bad(reply, 'That contact is not there', 404);
    const cfg = await automationSettings(pool), check = await checkContact(cid), tpl = Object.fromEntries((await pool.query('select id,name,subject,body from sales_templates')).rows.map(t => [t.id, t]));
    let at = 0; const plan = [];
    for (const [n, s] of a.steps.entries()) {
      const line = { step: n + 1, kind: s.kind, text: describeStep(s, Object.fromEntries(Object.entries(tpl).map(([k, t]) => [k, t.name]))), after: at };
      if (s.kind === 'wait') at += (s.days || 0) * 24 + (s.hours || 0);
      if (s.kind === 'task') line.result = `Makes the task “${renderTemplate(s.title, vars).text.replace(/\s+/g, ' ').trim()}”`;
      if (s.kind === 'email') {
        const t = tpl[s.templateId]; if (!t) line.result = 'Skipped: the template was deleted';
        else {
          const sub = renderTemplate(t.subject, { ...vars, sender: 'Kyle' }), body = renderTemplate(t.body, { ...vars, sender: 'Kyle' }), miss = [...new Set([...sub.missing, ...body.missing])];
          line.result = !check?.ok ? `Would be held back: ${(check?.reasons || ['they cannot be emailed'])[0]}` : miss.length ? `Would not send: we do not have ${miss.map(x => `{{${x}}}`).join(', ')} for them` : `Would send “${sub.text}”`;
          line.ok = Boolean(check?.ok) && !miss.length;
        }
      }
      plan.push(line);
    }
    return { contact: vars.name, plan, emailWindow: { open: inSendWindow(new Date(), cfg), next: nextSendTime(new Date(), cfg) }, paused: cfg.paused };
  });

  app.get('/v1/sales/automations/:id/runs', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const rows = (await pool.query(`select r.id,r.status,r.step,r.next_at,r.stop_reason,r.started_at,r.finished_at,r.contact_id,c.name contact_name,c.email contact_email,
        (select jsonb_agg(jsonb_build_object('step',l.step,'kind',l.kind,'outcome',l.outcome,'detail',l.detail,'at',l.created_at) order by l.step) from sales_run_log l where l.run_id=r.id) log
      from sales_runs r join sales_contacts c on c.id=r.contact_id where r.automation_id=$1 order by r.started_at desc limit 60`, [req.params.id])).rows;
    return { runs: rows };
  });
  app.get('/v1/sales/contacts/:id/runs', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    return { runs: (await pool.query(`select r.id,r.status,r.step,r.next_at,r.stop_reason,r.started_at,a.name automation_name,jsonb_array_length(a.steps) steps from sales_runs r join sales_automations a on a.id=r.automation_id where r.contact_id=$1 order by (r.status='active') desc, r.started_at desc limit 20`, [req.params.id])).rows };
  });
  app.post('/v1/sales/runs/:id/stop', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = (await pool.query(`update sales_runs set status='stopped', stop_reason='stopped by staff', finished_at=now() where id=$1 and status='active' returning contact_id, automation_id`, [req.params.id])).rows[0]; if (!r) return bad(reply, 'That one is not running', 404);
    const a = (await pool.query('select name from sales_automations where id=$1', [r.automation_id])).rows[0];
    await pool.query(`insert into sales_activities(contact_id,kind,text,actor_id) values($1,'system',$2,$3)`, [r.contact_id, `Stopped the automation “${a?.name}” by hand`, actorOf(req)]);
    return { ok: true };
  });
}
