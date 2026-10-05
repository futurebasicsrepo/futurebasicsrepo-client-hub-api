// Platform health for the work console: live checks of every connection (database, Shopify, the assistant's model API, email,
// sign-in, cutout service, storage, the host), configuration sanity checks, and insights about people and packs.
// Everything here is read-only. No secret is ever returned, only whether it is set.
import { statfs } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { overallStatus } from './telemetry.js';

const ms = t => Date.now() - t;
const withTimeout = (p, label, limit = 6000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} did not answer within ${limit / 1000}s`)), limit))]);
const ago = iso => (iso ? Date.now() - new Date(iso).getTime() : null);
const mb = b => Math.round(b / 1048576);

// One check = one row on the page. status: ok | warn | down | off (not set up on purpose).
async function runCheck(id, name, group, fn) {
  const t = Date.now();
  try { const r = await withTimeout(fn(), name); return { id, name, group, latencyMs: r.latencyMs ?? ms(t), ...r }; }
  catch (e) { return { id, name, group, status: 'down', summary: String(e.message || e).slice(0, 200), facts: [], latencyMs: ms(t) }; }
}

export async function runChecks(d) {
  const { pool, telemetry, env = process.env } = d;
  const tIntegration = name => telemetry.integrations[name] || null;
  const checks = await Promise.all([
    runCheck('postgres', 'Database (Postgres)', 'infrastructure', async () => {
      const t = Date.now();
      const r = (await pool.query(`select version() v,pg_database_size(current_database())::bigint size,(select count(*) from pg_stat_activity where datname=current_database())::int conns,current_setting('max_connections')::int maxc`)).rows[0];
      const latencyMs = ms(t), waiting = pool.waitingCount || 0;
      const status = waiting > 0 || latencyMs > 400 || r.conns > r.maxc * 0.8 ? 'warn' : 'ok';
      return { status, latencyMs, summary: status === 'ok' ? `Answering in ${latencyMs} ms` : waiting > 0 ? `${waiting} request(s) waiting for a connection` : latencyMs > 400 ? `Slow: ${latencyMs} ms` : 'Close to the connection limit',
        facts: [['Version', String(r.v).split(' ').slice(0, 2).join(' ')], ['Size', `${mb(Number(r.size))} MB`], ['Connections', `${r.conns} of ${r.maxc}`], ['This service’s pool', `${pool.totalCount} open · ${pool.idleCount} idle · ${waiting} waiting (max ${pool.options?.max ?? '?'})`]] };
    }),
    runCheck('shopify', 'Shopify', 'integration', async () => {
      if (!d.shopifyConfigured()) return { status: 'off', summary: 'Not connected (store domain and credentials not set)', facts: [] };
      const t = Date.now();
      const shop = await d.shopifyGraphql(d.SHOP_CONNECTION_QUERY);
      let granted = null, scopeError = null;
      try { granted = (await d.shopifyGraphql(d.APP_SCOPES_QUERY)).currentAppInstallation?.accessScopes?.map(s => s.handle) || []; } catch (e) { scopeError = e.message; }
      const missing = granted ? d.missingScopes(granted, d.requiredScopes) : [];
      const latencyMs = ms(t);
      return { status: missing.length || scopeError ? 'warn' : 'ok', latencyMs, summary: missing.length ? `Connected, but missing access: ${missing.join(', ')}` : scopeError ? 'Connected; could not read granted access' : `Connected to ${shop.shop?.name || 'the store'}`,
        facts: [['Store', shop.shop?.myshopifyDomain || '—'], ['Access granted', granted ? `${granted.length} scopes${missing.length ? ` · missing ${missing.length}` : ' · all needed present'}` : 'unknown'], ['Tech pack checkout product', d.techPackProduct ? 'set up' : 'not set up yet'], ['Membership link', d.membershipUrl ? 'set' : 'not set']] };
    }),
    runCheck('anthropic', 'Assistant (Anthropic API)', 'integration', async () => {
      const model = d.aiModel;
      if (env.AI_FIXTURE) return { status: 'warn', summary: 'Test fixture is on: the assistant is NOT calling the real model', facts: [['Model', model]] };
      if (!env.ANTHROPIC_API_KEY) return { status: 'off', summary: 'No API key set: the assistant is off', facts: [['Model', model]] };
      const t = Date.now(), tel = tIntegration('anthropic');
      // A key check cannot see an empty balance, and old failures say nothing about now: ask the API with a real one-token call.
      const probe = await probeAssistant(d.probeModel || PROBE_MODEL, { force: Boolean(d.fresh), client: d.anthropicClient });
      const v = assistantVerdict({ probe, failed24: (d.recentAiFailures?.ourSide || 0) + (d.recentAiFailures?.credit || 0), tel });
      return { status: v.status, latencyMs: ms(t), summary: v.summary,
        facts: [['Model', model], ['Live check', probe.ok ? `a test call went through (${probe.ageSec < 5 ? 'just now' : Math.round(probe.ageSec / 60) + ' min ago'})` : probe.note], ['Failed runs, last 24 h', String((d.recentAiFailures?.ourSide || 0) + (d.recentAiFailures?.credit || 0))], ['Tokens since deploy', tel ? `${tel.tokensIn.toLocaleString()} in · ${tel.tokensOut.toLocaleString()} out` : 'none yet']] };
    }),
    runCheck('resend', 'Email (Resend)', 'integration', async () => {
      if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) return { status: 'off', summary: 'Not set up: sign-in codes and notifications cannot be emailed', facts: [['From address', env.AUTH_FROM_EMAIL || 'not set']] };
      const t = Date.now();
      const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
      const latencyMs = ms(t), body = await res.json().catch(() => ({}));
      const facts = [['From address', env.AUTH_FROM_EMAIL]];
      if (res.status === 401 && /restricted/i.test(`${body.name} ${body.message}`)) return { status: 'ok', latencyMs, summary: 'Sending key accepted (domain status needs a full-access key to read)', facts };
      if (res.status === 401 || res.status === 403) return { status: 'down', latencyMs, summary: 'The Resend API key was rejected', facts };
      if (!res.ok) return { status: 'warn', latencyMs, summary: `Resend answered ${res.status}`, facts };
      const domains = body.data || [], verified = domains.filter(x => x.status === 'verified');
      facts.push(['Sending domains', domains.length ? domains.map(x => `${x.name} (${x.status})`).join(', ') : 'none']);
      return { status: verified.length ? 'ok' : 'warn', latencyMs, summary: verified.length ? `Key accepted, ${verified.length} verified domain${verified.length === 1 ? '' : 's'}` : 'Key accepted, but no domain is verified yet', facts };
    }),
    runCheck('google', 'Staff sign-in (Google Workspace)', 'integration', async () => {
      const on = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
      return { status: on ? 'ok' : 'off', summary: on ? 'Configured (cannot be test-signed-in from here)' : 'Not configured: staff use the emailed code', facts: [['Redirect address', env.GOOGLE_REDIRECT_URI ? 'set' : 'default (work site)']] };
    }),
    runCheck('imagegen', 'Render model (spec check)', 'integration', async () => {
      const cfg = d.imageConfig ? d.imageConfig() : { provider: 'none', configured: false }, tel = tIntegration('imagegen'), n = d.specChecks || {};
      const facts = [['Provider', cfg.provider], ['Model', cfg.model || '—'], ['Checks, last 24 h', String(n.done24 ?? 0)], ['Renders that failed, last 24 h', String(n.renderFailed24 ?? 0)], ['Checks that could not finish, last 24 h', String(n.failed24 ?? 0)]];
      if (cfg.provider === 'off') return { status: 'off', summary: `Renders are ${cfg.note}`, facts };
      if (!cfg.configured) return { status: 'off', summary: 'Not connected: spec checks compare the written spec with the photo, without a render. Set OPENAI_API_KEY to draw one.', facts };
      if (cfg.provider === 'fixture') return { status: 'warn', summary: 'Test fixture is on: renders are placeholders, not an image model', facts };
      if ((n.renderFailed24 || 0) > 0 && (n.renderFailed24 >= (n.done24 || 0) || (tel && tel.errorRate > 0.3))) return { status: 'warn', summary: `${n.renderFailed24} render${n.renderFailed24 === 1 ? '' : 's'} failed in the last 24 hours: checks still ran, without a picture`, facts };
      return { status: 'ok', summary: `${cfg.model} draws the renders${tel ? ` · ${tel.calls} call${tel.calls === 1 ? '' : 's'} since deploy` : ''}`, facts };
    }),
    runCheck('mesh', '3D model service (STL)', 'integration', async () => {
      const cfg = d.meshConfig ? d.meshConfig() : { provider: 'none', configured: false }, tel = tIntegration('meshy'), n = d.meshStats || {};
      const facts = [['Provider', cfg.provider], ['Model', cfg.model || '—'], ['Models made, last 24 h', String(n.done24 ?? 0)], ['Models that failed, last 24 h', String(n.failed24 ?? 0)]];
      if (cfg.provider === 'off') return { status: 'off', summary: `3D models are ${cfg.note}`, facts };
      if (!cfg.configured) return { status: 'off', summary: 'Not connected: staff cannot make an STL from a photo. Set MESHY_API_KEY to turn it on.', facts };
      if (cfg.provider === 'fixture') return { status: 'warn', summary: 'Test fixture is on: models are a placeholder cube', facts };
      if ((n.failed24 || 0) > 0 && n.failed24 >= (n.done24 || 0) + 1) return { status: 'warn', summary: `${n.failed24} model${n.failed24 === 1 ? '' : 's'} failed in the last 24 hours (credits, a key, or a photo it could not read)`, facts };
      return { status: 'ok', summary: `${cfg.model} makes the models${tel ? ` · ${tel.calls} call${tel.calls === 1 ? '' : 's'} since deploy` : ''}`, facts };
    }),
    runCheck('cutout', 'Photo cutout service', 'integration', async () => {
      const p = d.cutoutProvider();
      if (!p) return { status: 'off', summary: 'Not set up: reference photos are not cut out', facts: [] };
      const tel = tIntegration('cutout');
      return { status: p === 'fixture' ? 'warn' : tel && tel.errors && tel.errorRate > 0.3 ? 'warn' : 'ok', summary: p === 'fixture' ? 'Test fixture is on' : `Provider: ${p}${tel ? ` · ${tel.calls} call${tel.calls === 1 ? '' : 's'} since deploy` : ''}`, facts: [['Provider', p]] };
    }),
    runCheck('storage', 'File storage (uploads)', 'infrastructure', async () => {
      const fs = await statfs(d.uploadDir).catch(() => null);
      const row = (await pool.query(`select count(*)::int n,coalesce(sum(size_bytes),0)::bigint b from project_files`)).rows[0];
      if (!fs) return { status: 'warn', summary: 'Could not read the upload folder', facts: [['Folder', d.uploadDir]] };
      const total = fs.blocks * fs.bsize, free = fs.bavail * fs.bsize, freePct = Math.round((free / total) * 100);
      return { status: freePct < 10 ? 'down' : freePct < 20 ? 'warn' : 'ok', summary: `${mb(free).toLocaleString()} MB free (${freePct}%)`, facts: [['Disk', `${mb(total - free).toLocaleString()} of ${mb(total).toLocaleString()} MB used`], ['Project files', `${row.n} files · ${mb(Number(row.b))} MB`]] };
    }),
    runCheck('host', 'Server (Railway)', 'infrastructure', async () => {
      const mem = process.memoryUsage(), loop = telemetry.eventLoop;
      const status = loop.p99Ms > 250 || mem.rss > 900 * 1048576 ? 'warn' : 'ok';
      return { status, summary: status === 'ok' ? `Up ${fmtDuration(telemetry.uptimeSec)}` : loop.p99Ms > 250 ? `Event loop is lagging (p99 ${loop.p99Ms} ms)` : `High memory use (${mb(mem.rss)} MB)`,
        facts: [['Up for', fmtDuration(telemetry.uptimeSec)], ['Started', telemetry.since], ['Memory', `${mb(mem.rss)} MB (heap ${mb(mem.heapUsed)} MB)`], ['Event loop delay', `mean ${loop.meanMs} ms · p99 ${loop.p99Ms} ms`], ['Node', process.version], ['Release', env.RAILWAY_GIT_COMMIT_SHA ? `${env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7)} · ${String(env.RAILWAY_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 70)}` : 'not reported'], ['Environment', [env.RAILWAY_ENVIRONMENT_NAME, env.RAILWAY_REPLICA_REGION].filter(Boolean).join(' · ') || 'not on Railway']] };
    })
  ]);
  return checks;
}

export const fmtDuration = s => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

// Settings that are silently wrong are the dangerous ones. Each row says what it is, whether it is fine, and why it matters.
export function configChecks(d) {
  const env = d.env || process.env, out = [], add = (id, label, status, detail) => out.push({ id, label, status, detail });
  add('bypass', 'Sign-in bypass', env.DEV_BYPASS_AUTH === 'true' ? 'down' : 'ok', env.DEV_BYPASS_AUTH === 'true' ? 'DEV_BYPASS_AUTH is ON: anyone can sign in as staff. Turn it off now.' : 'Off, as it should be.');
  const jwt = env.JWT_SECRET || '';
  add('jwt', 'Session signing secret', !jwt ? 'down' : jwt.length < 24 ? 'warn' : 'ok', !jwt ? 'JWT_SECRET is not set.' : jwt.length < 24 ? 'JWT_SECRET is short; use a long random value.' : 'Set.');
  add('fixture', 'Test fixtures', env.AI_FIXTURE || env.CUTOUT_FIXTURE ? 'warn' : 'ok', env.AI_FIXTURE || env.CUTOUT_FIXTURE ? 'A test fixture is switched on, so real customers would get canned results.' : 'Off.');
  for (const [id, label, v] of [['hub', 'Client hub address', env.CLIENT_HUB_URL], ['work', 'Work console address', env.WORK_HUB_URL]])
    add(id, label, !v ? 'info' : /localhost|127\.0\.0\.1|^http:/.test(v) ? 'warn' : 'ok', !v ? 'Using the default.' : /localhost|127\.0\.0\.1|^http:/.test(v) ? `${v} is not a public https address.` : v.replace(/^https?:\/\//, ''));
  add('billing', 'Tech pack payment gate', d.billing.effective && !d.shopifyConfigured() ? 'warn' : 'ok', `${d.billing.effective ? 'On' : 'Off'} (${d.billing.mode === 'auto' ? 'automatic' : 'set in the console'})${d.billing.effective && !d.shopifyConfigured() ? '; payments cannot be taken because Shopify is not connected' : ''}.`);
  add('checkoutProduct', 'Tech pack checkout product', d.billing.effective && d.shopifyConfigured() && !d.techPackProduct ? 'warn' : d.techPackProduct ? 'ok' : 'info', d.techPackProduct ? 'Set up in Shopify.' : d.billing.effective ? 'Not created yet: use "Set up tech pack checkout product".' : 'Not needed while the gate is off.');
  add('membership', 'Membership link', env.MEMBERSHIP_CHECKOUT_URL ? 'ok' : 'info', env.MEMBERSHIP_CHECKOUT_URL ? 'Set.' : 'Not set: the "or join the studio" option is hidden on locked packs.');
  add('unsub', 'Email unsubscribe secret', env.UNSUBSCRIBE_SECRET ? 'ok' : 'warn', env.UNSUBSCRIBE_SECRET ? 'Set.' : 'UNSUBSCRIBE_SECRET is not set, so unsubscribe links fall back to a weaker key.');
  add('followups', 'Photo follow-up emails', env.FOLLOWUPS_DISABLED === 'true' ? 'info' : 'ok', env.FOLLOWUPS_DISABLED === 'true' ? 'Switched off.' : 'On.');
  add('nurture', 'Follow-up email sequence', env.NURTURE_DISABLED === 'true' ? 'info' : 'ok', env.NURTURE_DISABLED === 'true' ? 'Switched off.' : 'On.');
  add('origins', 'Allowed web origins', env.ALLOWED_ORIGINS ? 'ok' : 'info', env.ALLOWED_ORIGINS ? `${env.ALLOWED_ORIGINS.split(',').length} listed.` : 'Using the defaults.');
  return out;
}

export function jobHealth(job, now = Date.now()) {
  if (job.disabled) return 'off';
  if (job.lastError) return 'warn';
  if (!job.lastRunAt) return 'wait';
  return now - new Date(job.lastRunAt).getTime() > job.everyMs * 3 + 60_000 ? 'warn' : 'ok';
}

// ---- People and packs ----
const REAL = `slug<>'future-basics'`;
export async function insights(pool, { days = 30, priceCents = 4800 } = {}) {
  days = Math.min(365, Math.max(7, Number(days) || 30));
  const q = (sql, params = []) => pool.query(sql, params).then(r => r.rows);
  const win = `now()-($1::int*interval '1 day')`;
  const [totals, signups, packsDaily, active, funnel, ai, aiReasons, aiModels, money, sources, signins, topRooms, ops, volumes] = await Promise.all([
    q(`select (select count(*) from clients where ${REAL} and archived_at is null and status='active')::int active_clients,
       (select count(*) from clients where ${REAL} and archived_at is null and status='lead')::int leads,
       (select count(*) from clients where ${REAL} and created_at>=${win})::int new_rooms,
       (select count(*) from clients where ${REAL} and created_at>=${win} and notes like 'Self-serve%')::int new_self_serve,
       (select count(*) from users where role='client')::int client_users,
       (select count(*) from tech_packs where created_at>=${win})::int packs`, [days]),
    q(`select to_char(d,'YYYY-MM-DD') as day,coalesce(c.n,0)::int as n from generate_series(current_date-($1::int-1),current_date,'1 day') d
       left join (select created_at::date as day,count(*) as n from clients where ${REAL} and created_at>=current_date-($1::int-1) group by 1) c on c.day=d::date order by d`, [days]),
    q(`select to_char(d,'YYYY-MM-DD') as day,coalesce(c.n,0)::int as n from generate_series(current_date-($1::int-1),current_date,'1 day') d
       left join (select created_at::date as day,count(*) as n from tech_packs where created_at>=current_date-($1::int-1) group by 1) c on c.day=d::date order by d`, [days]),
    q(`with act as (select client_id,created_at at from tech_packs union all select client_id,created_at from project_messages
         union all select u.client_id,lc.consumed_at from login_codes lc join users u on lower(u.email)=lc.email where lc.consumed_at is not null)
       select count(distinct client_id) filter (where at>now()-interval '1 day')::int d1,count(distinct client_id) filter (where at>now()-interval '7 days')::int d7,count(distinct client_id) filter (where at>now()-interval '30 days')::int d30
       from act where client_id in (select id from clients where ${REAL})`),
    q(`select count(*)::int started,count(*) filter (where ai_status in ('done','skipped'))::int drafted,count(*) filter (where submitted_at is not null)::int submitted,
       count(*) filter (where published_at is not null)::int published,count(*) filter (where verification ? 'clientSign')::int approved
       from tech_packs where created_at>=${win} and client_id in (select id from clients where ${REAL})`, [days]),
    q(`select count(*) filter (where ai_status='done')::int done,count(*) filter (where ai_status='failed')::int failed,count(*) filter (where ai_status='pending')::int pending,count(*) filter (where ai_status='locked')::int locked,
       count(*) filter (where ai_attempts>=2)::int retried,
       round(avg(extract(epoch from (ai_completed_at-ai_started_at))) filter (where ai_status='done' and ai_completed_at>ai_started_at))::int avg_s,
       round((percentile_cont(0.9) within group (order by extract(epoch from (ai_completed_at-ai_started_at))) filter (where ai_status='done' and ai_completed_at>ai_started_at))::numeric)::int p90_s
       from tech_packs where created_at>=${win}`, [days]),
    q(`select case when ai_error ilike '%credit balance%' then 'Out of credits' when ai_error ilike '%on our side%' then 'Our side (API error)'
         when ai_error ilike '%could not open%' or ai_error ilike '%not read%' or ai_error ilike '%no product%' or ai_error ilike '%clearer photo%' then 'Photo not readable'
         when ai_error ilike '%timed out%' or ai_error ilike '%timeout%' then 'Timed out' when ai_error ilike '%did not finish%' then 'Never finished' else 'Other' end reason,count(*)::int n
       from tech_packs where ai_status='failed' and created_at>=${win} group by 1 order by 2 desc`, [days]),
    q(`select coalesce(ai_model,'unknown') model,count(*)::int n from tech_packs where ai_status='done' and created_at>=${win} group by 1 order by 2 desc limit 5`, [days]),
    q(`select count(*) filter (where paid_at is not null)::int paid,count(*) filter (where billing='comped')::int comped,count(*) filter (where billing='member')::int member,
       count(*) filter (where billing='client')::int by_invoice,count(*) filter (where billing='free')::int free_first,count(*) filter (where billing='admin')::int by_staff,
       count(*) filter (where ai_status='locked' and status='draft')::int waiting,
       count(*) filter (where ai_status='locked' or paid_at is not null)::int reached_paywall,
       (select count(*) from clients where ${REAL} and tech_pack_comped and archived_at is null)::int comped_clients,
       (select count(*) from clients where ${REAL} and membership_active_until>now())::int members
       from tech_packs where created_at>=${win}`, [days]),
    q(`select coalesce(nullif(c.acquisition->>'source',''),case when c.acquisition is null then 'direct / unknown' else 'other' end) source,coalesce(nullif(c.acquisition->>'campaign',''),'—') campaign,
       count(distinct c.id)::int rooms,count(distinct tp.client_id) filter (where tp.ai_status='done')::int drafted,count(distinct tp.client_id) filter (where tp.submitted_at is not null)::int submitted,count(distinct tp.client_id) filter (where tp.paid_at is not null)::int paid
       from clients c left join tech_packs tp on tp.client_id=c.id where c.${REAL} and c.created_at>=${win} group by 1,2 order by rooms desc,source limit 10`, [days]),
    q(`select count(*)::int sent,count(*) filter (where consumed_at is not null)::int used,count(distinct email)::int people,
       count(*) filter (where created_at>now()-interval '1 day')::int sent_24h,count(*) filter (where created_at>now()-interval '1 day' and consumed_at is not null)::int used_24h
       from login_codes where created_at>=${win}`, [days]),
    q(`select name,packs,msgs from (select c.name,(select count(*) from tech_packs tp where tp.client_id=c.id and tp.updated_at>now()-interval '7 days')::int packs,
         (select count(*) from project_messages pm where pm.client_id=c.id and pm.created_at>now()-interval '7 days')::int msgs from clients c where c.${REAL} and c.archived_at is null) x
       where packs+msgs>0 order by packs+msgs desc,name limit 6`),
    q(`select (select count(*) from tech_packs where status='submitted' and published_at is null)::int awaiting_review,
       (select round(extract(epoch from now()-min(submitted_at))/3600)::int from tech_packs where status='submitted' and published_at is null) oldest_review_h,
       (select count(*) from tech_packs where ai_status='pending')::int ai_pending,
       (select count(*) from tech_packs where ai_status='pending' and ai_started_at<now()-interval '15 minutes')::int ai_stuck,
       (select count(*) from tech_packs where ai_status='locked' and status='draft')::int locked_waiting,
       (select count(*) from notifications where read_at is null)::int unread_signals,
       (select count(*) from invoices where status='due')::int invoices_due,
       (select coalesce(sum(amount_cents),0)::bigint from invoices where status='due') invoices_due_cents`),
    q(`select (select count(*) from clients)::int clients,(select count(*) from users)::int users,(select count(*) from projects)::int projects,(select count(*) from products)::int products,
       (select count(*) from tech_packs)::int tech_packs,(select count(*) from project_messages)::int messages,(select count(*) from project_files)::int files,(select count(*) from login_codes)::int login_codes`)
  ]);
  const t = totals[0], f = funnel[0], a = ai[0], m = money[0], done = a.done + a.failed;
  return {
    days, priceCents, totals: t, signups, packsDaily, active: active[0], funnel: f,
    ai: { ...a, successRate: done ? a.done / done : null, reasons: aiReasons, models: aiModels },
    money: { ...m, estRevenueCents: m.paid * priceCents, paywallConversion: m.reached_paywall ? m.paid / m.reached_paywall : null },
    sources, signins: { ...signins[0], successRate: signins[0].sent ? signins[0].used / signins[0].sent : null },
    topRooms, ops: ops[0], volumes: volumes[0],
    notTracked: ['Visits to /start and page views (there is no web analytics yet)', 'Devices, locations and time on page', 'AI spend in dollars (tokens are counted since the last deploy only)']
  };
}

export { overallStatus };

// ---- The assistant stopping for a reason only we can fix ----
// An empty credit balance or a rejected key stops every new pack until someone acts, so it is worth an email. A rate limit or a brief outage
// is not: it passes by itself. The text is what the SDK puts in the error message, which starts with the HTTP status.
export function classifyAiFailure(message) {
  const m = String(message || '');
  if (/credit balance|insufficient (funds|credit)|plans (and|&) billing/i.test(m)) return 'credit';
  if (/^\s*(401|403)\b|authentication_error|permission_error|invalid x-api-key/i.test(m)) return 'key';
  return null;
}

// What the alert says: what is wrong, what customers see meanwhile, and what to do. Plain words; no raw error beyond one short quoted line.
export function assistantAlertContent({ kind, message, affected = 0, consoleUrl = '', platformUrl = '' }) {
  const waiting = affected ? `${affected} ${affected === 1 ? 'tech pack is' : 'tech packs are'} waiting to re-run automatically after failing in the meantime.` : 'No tech pack is waiting to re-run yet.';
  const quote = String(message || '').replace(/\s+/g, ' ').slice(0, 220);
  if (kind === 'credit') return {
    subject: 'Action needed: the tech pack assistant is out of Anthropic credit',
    headline: 'The assistant is out of credit',
    intro: 'Anthropic is refusing every request from the platform because the credit balance is empty. Until it is topped up, no new tech pack can be drafted.',
    customers: 'Customers who start a pack are told it is on our side, not their photo. Their three tries are not used, and they can still edit by hand and submit.',
    steps: ['Open the Anthropic Console, Plans & Billing, for the organisation that owns the API key on the Railway service, and add credit.', 'Packs that failed meanwhile re-run on their own within about ten minutes of the assistant working again. Nothing to press.'],
    waiting, quote, consoleUrl, platformUrl };
  return {
    subject: 'Action needed: the tech pack assistant is being refused by Anthropic',
    headline: 'Anthropic is rejecting the platform\'s API key',
    intro: 'Requests from the platform are being refused as unauthorised, so no new tech pack can be drafted. The key was probably revoked, replaced, or pasted wrongly.',
    customers: 'Customers who start a pack are told it is on our side, not their photo. Their three tries are not used, and they can still edit by hand and submit.',
    steps: ['Create or copy a working key in the Anthropic Console, API keys.', 'Set it as ANTHROPIC_API_KEY on the Railway service. The service restarts by itself.', 'Packs that failed meanwhile re-run on their own within about ten minutes of the assistant working again. Nothing to press.'],
    waiting, quote, consoleUrl, platformUrl };
}

// ---- Is the assistant able to run right now? ----
// A one-token request to the cheapest model: it fails for an empty balance and a bad key exactly as a real draft would, and costs next to nothing.
// The answer is kept for five minutes (one minute when it failed, so a top-up shows quickly); "Check now" asks again.
export const PROBE_MODEL = 'claude-haiku-4-5-20251001';
let aiProbe = { at: 0, result: null };
export async function probeAssistant(model = PROBE_MODEL, { force = false, now = Date.now(), client = null } = {}) {
  const ttl = aiProbe.result?.ok ? 5 * 60_000 : 60_000;
  if (!force && aiProbe.result && now - aiProbe.at < ttl) return { ...aiProbe.result, ageSec: Math.round((now - aiProbe.at) / 1000) };
  let result;
  try {
    const c = client || new Anthropic({ timeout: 8000, maxRetries: 0 });
    await c.messages.create({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] });
    result = { ok: true };
  } catch (e) { result = classifyProbeError(e); }
  aiProbe = { at: now, result };
  return { ...result, ageSec: 0 };
}
export const resetAssistantProbe = () => { aiProbe = { at: 0, result: null }; };
export function classifyProbeError(e) {
  const msg = String(e?.message || e || ''), status = e?.status;
  if (/credit balance|insufficient (funds|credit)|plans (and|&) billing/i.test(msg)) return { ok: false, kind: 'credit', note: 'refused: the credit balance is too low' };
  if (status === 401 || status === 403 || /authentication_error|permission_error|invalid x-api-key/i.test(msg)) return { ok: false, kind: 'key', note: 'refused: the API key was rejected' };
  return { ok: false, kind: 'unreachable', note: `could not complete a test call: ${msg.slice(0, 100)}` };
}
// The verdict for the card. The live test decides; earlier failures only add a note.
export function assistantVerdict({ probe, failed24 = 0, tel = null, now = Date.now() }) {
  if (!probe.ok && probe.kind === 'credit') return { status: 'down', summary: 'Out of credits: add credits in the Anthropic console, then waiting packs re-run on their own' };
  if (!probe.ok && probe.kind === 'key') return { status: 'down', summary: 'The API key was rejected: set a working ANTHROPIC_API_KEY on the service' };
  if (!probe.ok) return { status: 'warn', summary: `Could not confirm the assistant can run: ${probe.note}` };
  const erroredAfterOk = tel?.lastErrorAt && (!tel.lastOkAt || tel.lastErrorAt > tel.lastOkAt);
  if (erroredAfterOk && now - new Date(tel.lastErrorAt).getTime() < 3600e3 && !/credit balance/i.test(tel.lastError || '')) return { status: 'warn', summary: 'The key and credit are fine, but the latest assistant run failed' };
  return { status: 'ok', summary: failed24 ? `Working. ${failed24} run${failed24 === 1 ? '' : 's'} failed earlier today; ${failed24 === 1 ? 'it re-runs' : 'they re-run'} on their own, or press Run assistant` : 'Working: a test call went through' };
}
