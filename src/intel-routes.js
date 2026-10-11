// Staff API for sales intelligence (staff only). Reading is automatic; every outward step (a reply, a message, an email) is taken by a person and recorded here.
//   GET  /v1/intel/overview            the signals worth a person's time, with counts, who is on the team, and what is connected
//   GET  /v1/intel/signals/:id         one signal with what has been done about it
//   POST /v1/intel/signals             add a post by hand (from LinkedIn, Meta, a Discord, anywhere a person saw it)
//   POST /v1/intel/signals/:id/:action claim | release | assign | dismiss | outreach | reply | meeting | won | lost | reopen | redraft | to-crm
//   GET|POST /v1/intel/watches   PUT|DELETE /v1/intel/watches/:id   POST /v1/intel/watches/:id/run   POST /v1/intel/run
//   GET|PUT /v1/intel/settings   GET /v1/intel/providers   POST /v1/intel/providers/test   GET /v1/intel/kpis
import { createHash } from 'node:crypto';
import { fireTrigger } from './sales-automations-engine.js';
import { KINDS, KIND_LABEL, missingKeys, KEY_NEEDS } from './intel-sources.js';
import { PROVIDERS, providerStatus, providerReady, ask as realAsk, costCents, modelFor } from './intel-llm.js';
import { CHANNELS, STATUSES, cleanSettings, cleanWatch, nextStatus, DEFAULT_SETTINGS, SERVICE_LINES, INTENT_LABEL } from './intel.js';
import { runDue, runWatch, scorePending, redraft, loadSettings, purgeOld } from './intel-engine.js';
import { buildKpis } from './intel-kpis.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANUAL_PLATFORMS = ['linkedin', 'meta', 'x', 'reddit', 'discord', 'hn', 'web', 'email', 'other'];
const DISMISS = ['not_a_fit', 'vendor', 'too_old', 'already_handled', 'spam', 'other'];
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Starting watches, made once. The ones that need a key on the service are made switched off so nothing fails until the key is there.
export const SEED_WATCHES = [
  { name: 'HN: asking for an AI consultant', kind: 'hn', query: '"AI consultant" OR "AI implementation" OR "automate our"', service_line: 'ai' },
  { name: 'HN: looking for a developer or agency', kind: 'hn', query: '"looking for a developer" OR "need a developer" OR "dev shop" OR "recommend an agency"', service_line: 'apps' },
  { name: 'News: companies adopting AI', kind: 'news', query: 'small business "AI" adoption automation customers', service_line: 'ai' },
  { name: 'News: new consumer product brands raising', kind: 'news', query: 'consumer product brand raises seed funding launch apparel footwear', service_line: 'product' },
  { name: 'Reddit: small businesses asking for AI help', kind: 'reddit', query: 'r/smallbusiness search:AI automate need help', service_line: 'ai' },
  { name: 'Reddit: founders looking for a developer', kind: 'reddit', query: 'search:"looking for a developer" OR "need an app built" OR "MVP developer"', service_line: 'apps' },
  { name: 'Reddit: product makers needing a manufacturer', kind: 'reddit', query: 'search:"manufacturer" "prototype" "tech pack" need help', service_line: 'product' },
  { name: 'X: looking for an AI consultant or developer', kind: 'x', query: '("need an AI consultant" OR "looking for a developer" OR "looking for an agency to build")', service_line: 'any' }
];
export async function seedIntel(pool, env = process.env) {
  if (Number((await pool.query('select count(*) n from intel_watches')).rows[0].n)) return 0;
  for (const w of SEED_WATCHES) await pool.query(`insert into intel_watches(name,kind,query,service_line,enabled) values($1,$2,$3,$4,$5)`, [w.name, w.kind, w.query, w.service_line, missingKeys(w.kind, env).length === 0]);
  return SEED_WATCHES.length;
}

export function registerIntelRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, env = process.env, fetchImpl = fetch, askImpl = realAsk, log = console, throttle = () => true } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const settings = () => loadSettings(getSetting);
  const deps = async () => ({ env, fetchImpl, askImpl, settings: await settings(), log });
  const staff = async () => (await pool.query(`select id, coalesce(nullif(name,''), email) name from users where role='admin' order by 2`)).rows;
  let running = false;

  const shape = r => ({ id: r.id, source: r.source, sourceLabel: KIND_LABEL[r.source] || r.source, url: r.url, author: r.author, title: r.title, body: r.body, postedAt: r.posted_at, foundAt: r.found_at, status: r.status, ownerId: r.owner_id, ownerName: r.owner_name || '',
    claimedAt: r.claimed_at, firstActionAt: r.first_action_at, scored: Boolean(r.scored_at), relevant: r.relevant, serviceLine: r.service_line, serviceLineLabel: SERVICE_LINES[r.service_line] || '', intent: r.intent, intentLabel: INTENT_LABEL[r.intent] || '', fit: r.fit, urgency: r.urgency, score: r.score,
    summary: r.summary, whyNow: r.why_now, angle: r.angle, draft: r.draft, draftChannel: r.draft_channel, risks: r.risks, model: r.model, dismissReason: r.dismiss_reason, contactId: r.contact_id, dealId: r.deal_id, watch: r.watch_name || '' });
  const SELECT = `select s.*, u.name owner_name_raw, coalesce(nullif(u.name,''), u.email) owner_name, w.name watch_name from intel_signals s left join users u on u.id=s.owner_id left join intel_watches w on w.id=s.watch_id`;

  async function record(id, actor, kind, { channel = '', note = '', valueCents = null } = {}) {
    const cur = (await pool.query('select status, first_action_at, owner_id from intel_signals where id=$1', [id])).rows[0]; if (!cur) return null;
    await pool.query(`insert into intel_events(signal_id,actor_id,kind,channel,note,value_cents) values($1,$2,$3,$4,$5,$6)`, [id, actor, kind, channel, String(note).slice(0, 2000), valueCents]);
    const status = nextStatus(cur.status, kind), firstAction = ['claimed', 'assigned', 'outreach', 'dismissed'].includes(kind) && !cur.first_action_at;
    await pool.query(`update intel_signals set status=$2, first_action_at=case when $3 then now() else first_action_at end where id=$1`, [id, status, firstAction]);
    return status;
  }

  app.get('/v1/intel/overview', { preHandler: pre }, async (req) => {
    const st = await settings(), q = req.query || {}, me = actorOf(req), args = [], where = ['s.scored_at is not null'];
    const status = String(q.status || 'open'); if (status === 'open') where.push(`s.status in ('new','reviewing')`); else if (STATUSES.includes(status)) { args.push(status); where.push(`s.status=$${args.length}`); }
    const low = q.show === 'low'; if (low) where.push(`(s.relevant and coalesce(s.score,0) < ${Number(st.minScore)})`); else if (status !== 'dismissed') where.push(`s.relevant and coalesce(s.score,0) >= ${Number(st.minScore)}`);
    if (['ai', 'apps', 'product'].includes(q.line)) { args.push(q.line); where.push(`s.service_line=$${args.length}`); }
    if (KINDS.includes(q.source) || MANUAL_PLATFORMS.includes(q.source)) { args.push(q.source); where.push(`s.source=$${args.length}`); }
    if (q.owner === 'me' && me) { args.push(me); where.push(`s.owner_id=$${args.length}`); } else if (q.owner === 'none') where.push('s.owner_id is null'); else if (UUID.test(String(q.owner || ''))) { args.push(q.owner); where.push(`s.owner_id=$${args.length}`); }
    const text = clip(q.q, 80); if (text) { args.push(`%${text.toLowerCase().replace(/[%_\\]/g, m => '\\' + m)}%`); where.push(`(lower(s.title) like $${args.length} or lower(s.body) like $${args.length} or lower(s.author) like $${args.length} or lower(s.summary) like $${args.length})`); }
    const rows = (await pool.query(`${SELECT} where ${where.join(' and ')} order by s.score desc nulls last, s.found_at desc limit 80`, args)).rows;
    const [c] = (await pool.query(`select count(*) filter (where relevant and score >= $1 and status in ('new','reviewing'))::int open, count(*) filter (where relevant and score >= $1 and status='new')::int fresh, count(*) filter (where relevant and score < $1 and status in ('new','reviewing'))::int low,
        count(*) filter (where scored_at is null)::int unscored, count(*) filter (where relevant and score >= $1 and status='new' and owner_id is null and found_at < now() - make_interval(hours => $2))::int overdue from intel_signals`, [st.minScore, st.slaHours])).rows;
    const watches = (await pool.query(`select kind, count(*) filter (where enabled)::int on_, count(*)::int total, max(last_run_at) last_run, count(*) filter (where enabled and last_status not in ('ok',''))::int failing from intel_watches group by kind`)).rows;
    return { signals: rows.map(shape), counts: c, settings: st, staff: await staff(), me, providers: providerStatus(env), watches, sources: KINDS.map(k => ({ kind: k, label: KIND_LABEL[k], missing: missingKeys(k, env) })) };
  });
  app.get('/v1/intel/signals/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = (await pool.query(`${SELECT} where s.id=$1`, [req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const events = (await pool.query(`select e.id,e.kind,e.channel,e.note,e.value_cents,e.at,coalesce(nullif(u.name,''),u.email) actor from intel_events e left join users u on u.id=e.actor_id where e.signal_id=$1 order by e.at`, [r.id])).rows;
    return { signal: shape(r), events };
  });

  app.post('/v1/intel/signals', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, source = MANUAL_PLATFORMS.includes(b.source) ? b.source : 'other', text = String(b.text || '').trim(), title = clip(b.title, 300), url = String(b.url || '').trim();
    if (!text && !title) return bad(reply, 'Paste the post: what it says');
    if (url && !/^https?:\/\/\S+$/i.test(url)) return bad(reply, 'The link must be a web address (https://…)');
    const ext = url || `manual-${createHash('sha256').update(`${source}|${title}|${text}`).digest('hex').slice(0, 24)}`;
    const ins = await pool.query(`insert into intel_signals(source,external_id,url,author,title,body,posted_at) values($1,$2,$3,$4,$5,$6,$7) on conflict (source,external_id) do nothing returning id`, [source, ext.slice(0, 300), url.slice(0, 1000), clip(b.author, 120), title, text.slice(0, 5000), b.postedAt && !Number.isNaN(new Date(b.postedAt).getTime()) ? new Date(b.postedAt) : new Date()]);
    if (!ins.rowCount) return bad(reply, 'That post is already in the list', 409);
    const id = ins.rows[0].id, r = await scorePending(pool, await deps(), { ids: [id], force: true, limit: 1 });
    return reply.code(201).send({ id, read: r.read === 1, note: r.stopped || '' });
  });

  app.post('/v1/intel/signals/:id/:action', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const id = req.params.id, action = req.params.action, b = req.body || {}, actor = actorOf(req);
    const sig = (await pool.query(`${SELECT} where s.id=$1`, [id])).rows[0]; if (!sig) return bad(reply, 'Not found', 404);
    const closed = ['dismissed', 'won', 'lost'].includes(sig.status), isStaff = async x => (await staff()).some(p => p.id === x);
    switch (action) {
      case 'claim': case 'assign': {
        const who = action === 'assign' ? String(b.ownerId || '') : actor; if (!UUID.test(String(who)) || !(await isStaff(who))) return bad(reply, 'Choose a team member');
        if (closed) return bad(reply, 'This one is closed. Reopen it first.', 409);
        if (action === 'claim' && sig.owner_id && sig.owner_id !== who && sig.status === 'reviewing') return bad(reply, `${sig.owner_name} is already on this one. Ask them, or assign it.`, 409);
        await pool.query('update intel_signals set owner_id=$2, claimed_at=coalesce(claimed_at, now()) where id=$1', [id, who]);
        const s = await record(id, actor, action === 'assign' ? 'assigned' : 'claimed', { note: action === 'assign' ? `assigned to ${(await staff()).find(p => p.id === who)?.name || ''}` : '' }); return { ok: true, status: s };
      }
      case 'release': { if (closed) return bad(reply, 'This one is closed.', 409); await pool.query('update intel_signals set owner_id=null, claimed_at=null where id=$1', [id]); return { ok: true, status: await record(id, actor, 'released') }; }
      case 'dismiss': { const reason = DISMISS.includes(b.reason) ? b.reason : null; if (!reason) return bad(reply, 'Say why: not a fit, a vendor, too old, already handled, spam or other'); await pool.query('update intel_signals set dismiss_reason=$2 where id=$1', [id, reason]); return { ok: true, status: await record(id, actor, 'dismissed', { note: clip(b.note, 300) || reason }) }; }
      case 'reopen': { if (!['dismissed', 'lost'].includes(sig.status)) return bad(reply, 'Only a dismissed or lost one can be reopened', 409); await pool.query(`update intel_signals set dismiss_reason='' where id=$1`, [id]); return { ok: true, status: await record(id, actor, 'reopened') }; }
      case 'outreach': {
        if (closed) return bad(reply, 'This one is closed. Reopen it first.', 409); if (!CHANNELS.includes(b.channel)) return bad(reply, 'Say where it went: a public reply, a direct message, an email…');
        if (!String(b.note || '').trim()) return bad(reply, 'Paste or write what you sent, so there is a record');
        if (!sig.owner_id) await pool.query('update intel_signals set owner_id=$2, claimed_at=coalesce(claimed_at, now()) where id=$1', [id, actor]);
        return { ok: true, status: await record(id, actor, 'outreach', { channel: b.channel, note: String(b.note) }) };
      }
      case 'reply': case 'meeting': { if (closed) return bad(reply, 'This one is closed. Reopen it first.', 409); if (action === 'reply' && !['actioned', 'replied'].includes(sig.status) && sig.status !== 'meeting') return bad(reply, 'Log what you sent first, then the reply', 409); return { ok: true, status: await record(id, actor, action, { note: clip(b.note, 500) }) }; }
      case 'won': { if (sig.status === 'dismissed') return bad(reply, 'Reopen it first', 409); const v = Math.round(Number(b.valueCents)); if (!Number.isFinite(v) || v < 0 || v > 1e11) return bad(reply, 'Enter what it is worth'); return { ok: true, status: await record(id, actor, 'won', { valueCents: v, note: clip(b.note, 300) }) }; }
      case 'lost': { if (sig.status === 'dismissed') return bad(reply, 'Reopen it first', 409); return { ok: true, status: await record(id, actor, 'lost', { note: clip(b.note, 300) }) }; }
      case 'redraft': {
        if (!throttle(`intel-redraft:${actor}`, { limit: 20, windowMs: 3600_000 })) return bad(reply, 'Slow down: 20 new drafts an hour', 429);
        const provider = PROVIDERS.includes(b.provider) ? b.provider : undefined; if (provider && !providerReady(provider, env)) return bad(reply, `${provider} is not connected`, 503);
        try { const r = await redraft(pool, id, await deps(), { provider, instruction: clip(b.instruction, 400) }); await record(id, actor, 'drafted', { note: clip(b.instruction, 200) }); return { ok: true, ...r }; }
        catch (e) { return bad(reply, e.message || 'The draft did not come back. Try again.', 502); }
      }
      case 'to-crm': {
        let contactId = sig.contact_id, created = false; const email = String(b.email || '').trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(reply, 'That email address does not look right');
        if (!contactId && email) contactId = (await pool.query('select id from sales_contacts where lower(email)=$1', [email])).rows[0]?.id || null;
        if (!contactId) {
          const name = clip(b.name, 120) || clip(sig.author, 120) || clip(sig.title, 80) || 'Someone from the web';
          contactId = (await pool.query(`insert into sales_contacts(name,email,source,tags,notes) values($1,$2,'intel',$3,$4) returning id`, [name, email || null, ['intel', sig.source], `Found on ${KIND_LABEL[sig.source] || sig.source}: ${sig.url || ''}\n${sig.summary || ''}`.slice(0, 1000)])).rows[0].id; created = true;
        }
        let dealId = sig.deal_id;
        if (b.dealTitle && !dealId) { const v = Math.max(0, Math.round(Number(b.valueCents) || 0)); dealId = (await pool.query(`insert into sales_deals(contact_id,title,value_cents,source) values($1,$2,$3,'intel') returning id`, [contactId, clip(b.dealTitle, 140), v])).rows[0].id; await record(id, actor, 'deal', { note: clip(b.dealTitle, 140), valueCents: v }); }
        await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,'note',$3,$4::jsonb,$5)`, [contactId, dealId, `Added from a ${KIND_LABEL[sig.source] || sig.source} signal: ${sig.summary || sig.title || sig.url}`.slice(0, 500), JSON.stringify({ signalId: id, url: sig.url }), actor]);
        if (b.task !== false) await pool.query(`insert into sales_tasks(contact_id,deal_id,title,due_at) values($1,$2,$3,now() + interval '1 day')`, [contactId, dealId, clip(b.taskTitle, 200) || `Follow up: ${clip(sig.summary || sig.title, 120)}`]);
        await pool.query('update sales_contacts set last_activity_at=now() where id=$1', [contactId]);
        await pool.query('update intel_signals set contact_id=$2, deal_id=$3 where id=$1', [id, contactId, dealId]);
        if (created) await fireTrigger(pool, { type: 'contact_created', contactId, source: 'intel' });
        return { ok: true, contactId, dealId, created };
      }
      default: return bad(reply, 'Not found', 404);
    }
  });

  // ---------- watches ----------
  const watchView = w => ({ id: w.id, name: w.name, kind: w.kind, kindLabel: KIND_LABEL[w.kind], query: w.query, serviceLine: w.service_line, enabled: w.enabled, lastRunAt: w.last_run_at, lastStatus: w.last_status, lastError: w.last_error, lastFound: w.last_found, missing: missingKeys(w.kind, env) });
  app.get('/v1/intel/watches', { preHandler: pre }, async () => ({ watches: (await pool.query('select * from intel_watches order by kind, name')).rows.map(watchView), kinds: KINDS.map(k => ({ kind: k, label: KIND_LABEL[k], needs: KEY_NEEDS[k] })) }));
  app.post('/v1/intel/watches', { preHandler: pre }, async (req, reply) => {
    const r = cleanWatch(req.body, KINDS); if (r.error) return bad(reply, r.error); const v = r.value;
    return reply.code(201).send({ id: (await pool.query(`insert into intel_watches(name,kind,query,service_line,enabled) values($1,$2,$3,$4,$5) returning id`, [v.name, v.kind, v.query, v.service_line, v.enabled])).rows[0].id });
  });
  app.put('/v1/intel/watches/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = cleanWatch(req.body, KINDS); if (r.error) return bad(reply, r.error); const v = r.value;
    const n = (await pool.query(`update intel_watches set name=$2, kind=$3, query=$4, service_line=$5, enabled=$6, cursor=case when query<>$4 or kind<>$3 then '' else cursor end, updated_at=now() where id=$1`, [req.params.id, v.name, v.kind, v.query, v.service_line, v.enabled])).rowCount;
    return n ? { ok: true } : bad(reply, 'Not found', 404);
  });
  app.delete('/v1/intel/watches/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await pool.query('delete from intel_watches where id=$1', [req.params.id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404); });
  app.post('/v1/intel/watches/:id/run', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const w = (await pool.query('select * from intel_watches where id=$1', [req.params.id])).rows[0]; if (!w) return bad(reply, 'Not found', 404);
    if (!throttle(`intel-run:${actorOf(req)}`, { limit: 30, windowMs: 3600_000 })) return bad(reply, 'Slow down: 30 manual runs an hour', 429);
    const dd = await deps(), r = await runWatch(pool, w, dd), s = r.ok ? await scorePending(pool, dd, { limit: 30 }) : null; return { ...r, scored: s };
  });
  app.post('/v1/intel/run', { preHandler: pre }, async (req, reply) => {
    if (running) return bad(reply, 'A run is already going', 409); if (!throttle(`intel-all:${actorOf(req)}`, { limit: 12, windowMs: 3600_000 })) return bad(reply, 'Slow down: 12 full runs an hour', 429);
    running = true; try { const dd = await deps(), watches = await runDue(pool, dd, { force: req.body?.force === true }), scored = await scorePending(pool, dd, { limit: 40 }); return { watches, scored }; } finally { running = false; }
  });

  // ---------- settings, providers, KPIs ----------
  app.get('/v1/intel/settings', { preHandler: pre }, async () => ({ settings: await settings(), staff: await staff() }));
  app.put('/v1/intel/settings', { preHandler: pre }, async (req, reply) => {
    const r = cleanSettings(req.body, await settings()); if (r.error) return bad(reply, r.error);
    const ids = new Set((await staff()).map(p => p.id)); r.value.teams = Object.fromEntries(Object.entries(r.value.teams).filter(([k]) => ids.has(k)));
    await setSetting('intel', r.value); return { ok: true, settings: r.value };
  });
  app.get('/v1/intel/providers', { preHandler: pre }, async () => ({ providers: providerStatus(env), sources: KINDS.map(k => ({ kind: k, label: KIND_LABEL[k], missing: missingKeys(k, env) })) }));
  app.post('/v1/intel/providers/test', { preHandler: pre }, async (req, reply) => {
    const p = req.body?.provider; if (!PROVIDERS.includes(p)) return bad(reply, 'Choose Claude, ChatGPT or Grok'); if (!providerReady(p, env)) return bad(reply, `${p} is not connected: add its key to the service`, 503);
    if (!throttle(`intel-test:${actorOf(req)}`, { limit: 20, windowMs: 3600_000 })) return bad(reply, 'Slow down', 429);
    const t0 = Date.now();
    try { const r = await askImpl({ provider: p, system: 'Reply with the single word ok.', user: 'ping', maxTokens: 20, env, fetchImpl, fixture: () => 'ok' }); await pool.query(`insert into intel_usage(provider,model,task,input_tokens,output_tokens,cost_cents) values($1,$2,'test',$3,$4,$5)`, [r.provider, r.model, r.usage.input, r.usage.output, costCents(r.provider, r.usage.input, r.usage.output, env)]).catch(() => {}); return { ok: true, model: r.model, ms: Date.now() - t0, answer: String(r.text).slice(0, 40) }; }
    catch (e) { return bad(reply, e.message || 'No answer', 502); }
  });
  app.get('/v1/intel/kpis', { preHandler: pre }, async (req) => {
    const days = Math.min(365, Math.max(1, Math.round(Number(req.query?.days)) || 30)), st = await settings(), since = `now() - make_interval(days => ${days})`;
    const signals = (await pool.query(`select id, source, service_line, status, owner_id, found_at, first_action_at, claimed_at, relevant, score, scored_at from intel_signals where found_at >= ${since}`)).rows;
    const open = (await pool.query(`select id, status, owner_id, found_at, relevant, score from intel_signals where status in ('new','reviewing')`)).rows;
    const events = (await pool.query(`select signal_id, actor_id, kind, channel, value_cents, at from intel_events where at >= ${since}`)).rows;
    const usage = (await pool.query(`select provider, task, cost_cents from intel_usage where at >= ${since}`)).rows;
    const byProvider = {}; for (const u of usage) { const k = u.provider; byProvider[k] = (byProvider[k] || 0) + Number(u.cost_cents); }
    return { days, settings: { minScore: st.minScore, slaHours: st.slaHours }, ...buildKpis({ signals, open, events, usage, staff: await staff(), settings: st }), costByProvider: Object.entries(byProvider).map(([provider, cents]) => ({ provider, cents: Math.round(cents * 100) / 100 })) };
  });

  void log; void modelFor; void DEFAULT_SETTINGS; void purgeOld;
}
