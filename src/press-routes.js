// Press comms routes (staff only; see press.js for the rules and press-draft.js for the assistant).
//   GET /v1/sales/press                          releases/pitches with how many were sent and how much coverage, plus the daily limit
//   POST /v1/sales/press/items   PUT|DELETE /v1/sales/press/items/:id
//   POST /v1/sales/press/draft                   the assistant writes a first draft from a build and an angle
//   POST /v1/sales/press/items/:id/preview       the message as one person would get it
//   POST /v1/sales/press/items/:id/pitch         send it, one person at a time, to people on the media list (staff confirm first)
//   GET /v1/sales/press/media                    the media list: contacts tagged `press`, with outlet, beats and what they were sent
//   GET|POST /v1/sales/press/coverage   DELETE /v1/sales/press/coverage/:id   GET|PUT /v1/sales/press/settings
import { KIND_LABEL, cleanItem, cleanCoverage, placeholdersIn, pitchPlan, beatsOf, MEDIA_TAG, PITCH_BATCH, DEFAULT_DAILY_CAP } from './press.js';
import { draftPress } from './press-draft.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_START = `(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;

export async function seedPress(pool) {
  // the saved view for the media list, added once even where the other starter views already exist
  const has = (await pool.query(`select 1 from sales_segments where name='Press'`)).rowCount;
  if (!has) await pool.query(`insert into sales_segments(name,filter,position) values('Press',$1::jsonb,coalesce((select max(position)+10 from sales_segments),10))`, [JSON.stringify({ q: '', tags: [MEDIA_TAG], excludeTags: [], source: '' })]);
}

export function registerPressRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, sendToContact, previewFor, aiEnabled, answerDraft = draftPress, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const cap = async () => Number(((await getSetting('salesPress')) || {}).dailyCap) || DEFAULT_DAILY_CAP;
  const pitchedToday = async () => Number((await pool.query(`select count(*) n from press_sends where sent_at >= ${DAY_START}`)).rows[0].n);

  app.get('/v1/sales/press', { preHandler: pre }, async () => {
    const items = (await pool.query(`select i.*, b.name build_name,
        (select count(*) from press_sends s where s.item_id=i.id) sent, (select count(*) from press_coverage c where c.item_id=i.id) coverage
      from press_items i left join builds b on b.id=i.build_id where i.status <> 'archived' order by i.updated_at desc limit 100`)).rows;
    const [c, n] = [await cap(), await pitchedToday()];
    return { items: items.map(i => ({ id: i.id, title: i.title, kind: i.kind, kindLabel: KIND_LABEL[i.kind], status: i.status, subject: i.subject, body: i.body, audience: i.audience, buildId: i.build_id, buildName: i.build_name || '', sent: Number(i.sent), coverage: Number(i.coverage), updatedAt: i.updated_at })), dailyCap: c, sentToday: n, remainingToday: Math.max(0, c - n), batch: PITCH_BATCH, assistantReady: Boolean(aiEnabled()) };
  });
  app.get('/v1/sales/press/settings', { preHandler: pre }, async () => ({ dailyCap: await cap() }));
  app.put('/v1/sales/press/settings', { preHandler: pre }, async (req, reply) => {
    const n = Math.round(Number(req.body?.dailyCap)); if (!Number.isFinite(n) || n < 1 || n > 100) return bad(reply, 'The daily pitch limit is 1 to 100');
    await setSetting('salesPress', { dailyCap: n }); return { ok: true, dailyCap: n };
  });
  app.post('/v1/sales/press/items', { preHandler: pre }, async (req, reply) => {
    const r = cleanItem(req.body); if (r.error) return bad(reply, r.error); const v = r.value;
    return reply.code(201).send({ id: (await pool.query(`insert into press_items(title,kind,build_id,subject,body,audience,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [v.title, v.kind, v.build_id, v.subject, v.body, v.audience, v.status, actorOf(req)])).rows[0].id });
  });
  app.put('/v1/sales/press/items/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = cleanItem(req.body); if (r.error) return bad(reply, r.error); const v = r.value;
    const ok = (await pool.query(`update press_items set title=$2,kind=$3,build_id=$4,subject=$5,body=$6,audience=$7,status=$8,updated_at=now() where id=$1`, [req.params.id, v.title, v.kind, v.build_id, v.subject, v.body, v.audience, v.status])).rowCount;
    return ok ? { ok: true } : bad(reply, 'Not found', 404);
  });
  app.delete('/v1/sales/press/items/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from press_items where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });

  app.post('/v1/sales/press/draft', { preHandler: pre }, async (req, reply) => {
    if (!aiEnabled()) return bad(reply, 'The assistant is not connected yet (the service needs ANTHROPIC_API_KEY). You can write it yourself.', 503);
    const b = req.body || {}, kind = ['release', 'pitch', 'announcement'].includes(b.kind) ? b.kind : 'pitch';
    const build = UUID.test(String(b.buildId || '')) ? (await pool.query('select name,tagline,sector,status,summary,highlights,stack from builds where id=$1', [b.buildId])).rows[0] || null : null;
    if (!build && !String(b.angle || '').trim()) return bad(reply, 'Pick a build or say what the angle is');
    try { return await answerDraft({ kind, build, angle: String(b.angle || '').slice(0, 600), audience: String(b.audience || '').slice(0, 200) }); }
    catch (e) { log.warn?.({ err: e.message }, 'press draft failed'); return bad(reply, e.message || 'The assistant could not write that. Try again.', 502); }
  });
  app.post('/v1/sales/press/items/:id/preview', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const it = (await pool.query('select subject,body from press_items where id=$1', [req.params.id])).rows[0]; if (!it) return bad(reply, 'Not found', 404);
    const cid = String(req.body?.contactId || ''); if (!UUID.test(cid)) return bad(reply, 'Choose someone to preview it for');
    const p = await previewFor(cid, it.subject, it.body); if (!p) return bad(reply, 'That person is not there', 404);
    return { ...p, placeholders: placeholdersIn(`${it.subject}\n${it.body}`) };
  });

  app.get('/v1/sales/press/media', { preHandler: pre }, async (req) => {
    const q = String(req.query?.q || '').trim().slice(0, 80), args = [MEDIA_TAG]; let where = `$1 = any(c.tags)`;
    if (q) { args.push(`%${q.toLowerCase()}%`); where += ` and (lower(c.name) like $2 or lower(c.email) like $2 or lower(co.name) like $2 or exists (select 1 from unnest(c.tags) t where t like $2))`; }
    const rows = (await pool.query(`select c.id,c.name,c.email,c.title,c.tags,co.name outlet,(c.unsubscribed_at is not null or c.email_ok=false) off, s.reason suppressed,
        (select count(*) from press_sends p where p.contact_id=c.id) pitched, (select max(p.sent_at) from press_sends p where p.contact_id=c.id) last_pitched
      from sales_contacts c left join sales_companies co on co.id=c.company_id left join sales_suppressions s on s.email=lower(c.email) where ${where} order by co.name nulls last, c.name limit 300`, args)).rows;
    return { media: rows.map(r => ({ id: r.id, name: r.name, email: r.email || '', role: r.title, outlet: r.outlet || '', beats: beatsOf(r.tags), canEmail: Boolean(r.email) && !r.off && !r.suppressed, blocked: !r.email ? 'No email address' : r.suppressed ? ({ unsubscribed: 'Unsubscribed', bounced: 'Bounced', complained: 'Marked us as spam' }[r.suppressed] || 'Not to be emailed') : r.off ? 'Not to be emailed' : '', pitched: Number(r.pitched), lastPitched: r.last_pitched })) };
  });

  app.post('/v1/sales/press/items/:id/pitch', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const it = (await pool.query('select * from press_items where id=$1', [req.params.id])).rows[0]; if (!it) return bad(reply, 'Not found', 404);
    if (it.status !== 'ready') return bad(reply, 'Mark it ready first. Drafts are never sent.');
    if (req.body?.confirm !== true) return bad(reply, 'Confirm that these are people who cover this and would want to hear about it.');
    const left = placeholdersIn(`${it.subject}\n${it.body}`); if (left.length) return bad(reply, `Fill in ${left.join(', ')} first.`);
    const ids = [...new Set((Array.isArray(req.body?.contactIds) ? req.body.contactIds : []).map(String).filter(x => UUID.test(x)))].slice(0, 100); if (!ids.length) return bad(reply, 'Choose who to send it to');
    const people = (await pool.query(`select c.id,c.name,c.email,c.tags,(c.unsubscribed_at is not null or c.email_ok=false) unsubscribed, s.reason suppressed from sales_contacts c left join sales_suppressions s on s.email=lower(c.email) where c.id = any($1::uuid[])`, [ids])).rows;
    const byId = new Map(people.map(p => [p.id, p])), ordered = ids.map(i => byId.get(i)).filter(Boolean);
    const already = new Set((await pool.query('select contact_id from press_sends where item_id=$1 and contact_id = any($2::uuid[])', [it.id, ids])).rows.map(r => r.contact_id));
    const plan = pitchPlan({ people: ordered, already, left: (await cap()) - (await pitchedToday()) });
    const results = plan.skip.map(s => ({ contactId: s.id, name: s.name, outcome: 'skipped', reason: s.reason })); let stop = '';
    for (const p of plan.send) {
      if (stop) { results.push({ contactId: p.id, name: p.name, outcome: 'skipped', reason: stop }); continue; }
      const claim = await pool.query(`insert into press_sends(item_id,contact_id,sent_by) values($1,$2,$3) on conflict do nothing returning id`, [it.id, p.id, actorOf(req)]); // written first, so a double click can never send twice
      if (!claim.rowCount) { results.push({ contactId: p.id, name: p.name, outcome: 'skipped', reason: 'They were already sent this one.' }); continue; }
      const r = await sendToContact(p.id, { subject: it.subject, body: it.body, confirmed: true, actorId: actorOf(req), via: `press: ${it.title}`, confirmText: 'Pitched after staff confirmed they cover this' });
      if (r.ok) { await pool.query('update press_sends set email_id=$2 where id=$1', [claim.rows[0].id, r.id]); results.push({ contactId: p.id, name: p.name, outcome: 'sent' }); }
      else {
        await pool.query('delete from press_sends where id=$1', [claim.rows[0].id]); // it did not go, so it can be tried again
        results.push({ contactId: p.id, name: p.name, outcome: 'failed', reason: r.error });
        if (/daily limit|not switched on|mailing address/i.test(r.error || '')) stop = r.error; // the same thing will stop everyone after them
      }
    }
    const c = await cap(), n = await pitchedToday();
    return { results, sent: results.filter(x => x.outcome === 'sent').length, skipped: results.filter(x => x.outcome === 'skipped').length, failed: results.filter(x => x.outcome === 'failed').length, remainingToday: Math.max(0, c - n) };
  });

  app.get('/v1/sales/press/coverage', { preHandler: pre }, async () => ({ coverage: (await pool.query(`select v.id,v.outlet,v.title,v.url,v.published_on,v.note,v.item_id,v.contact_id,i.title item_title,c.name contact_name from press_coverage v left join press_items i on i.id=v.item_id left join sales_contacts c on c.id=v.contact_id order by coalesce(v.published_on, v.created_at::date) desc, v.created_at desc limit 200`)).rows }));
  app.post('/v1/sales/press/coverage', { preHandler: pre }, async (req, reply) => {
    const r = cleanCoverage(req.body); if (r.error) return bad(reply, r.error); const v = r.value;
    const row = (await pool.query(`insert into press_coverage(item_id,contact_id,outlet,title,url,published_on,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [v.item_id, v.contact_id, v.outlet, v.title, v.url, v.published_on, v.note, actorOf(req)])).rows[0];
    if (v.contact_id) await pool.query(`insert into sales_activities(contact_id,kind,text,actor_id) values($1,'note',$2,$3)`, [v.contact_id, `Coverage in ${v.outlet}${v.title ? `: ${v.title}` : ''}${v.url ? ` ${v.url}` : ''}`.slice(0, 600), actorOf(req)]).catch(() => {});
    return reply.code(201).send({ id: row.id });
  });
  app.delete('/v1/sales/press/coverage/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from press_coverage where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });
}
