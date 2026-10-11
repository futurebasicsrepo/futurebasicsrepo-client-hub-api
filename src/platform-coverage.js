// Platform health for the parts of the platform that grew after the first checks: the AI readers and listening sources, the sales email,
// website chat, automations, the showcase's GitHub sync, and the client stores builds are pushed to. Read-only, and free: a check never
// spends paid quota (Brave and X are judged from their last real listening run, not a test search). No secret is ever returned.
import { KEY_ENV, PROVIDER_LABEL, modelFor, originFor, providerReady } from './intel-llm.js';
import { KEY_NEEDS, KIND_LABEL } from './intel-sources.js';
import { loadSettings } from './intel-engine.js';
import { automationSettings } from './sales-automations-engine.js';
import { jobHealth } from './platform.js';
import { moneyAccessList } from './money.js';

const ms = t => Date.now() - t;
const withTimeout = (p, label, limit = 6000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} did not answer within ${limit / 1000}s`)), limit))]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const watches = n => plural(n, 'watch', 'watches');
const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
// A network failure says which service could not be reached, not just "fetch failed".
const reach = (label, p) => p.catch(e => { throw new Error(`Could not reach ${label}${e.cause?.code ? ` (${e.cause.code})` : ''}`); });
// A probe that reports a failure to connect as data, so the card still shows its facts.
const soft = async fn => { try { return await fn(); } catch (e) { return { error: String(e.message || e).slice(0, 140) }; } };
const origin = (name, dflt, env) => String(env[name] || dflt).replace(/\/$/, '');

async function row(id, name, group, fn) {
  const t = Date.now();
  try { const r = await withTimeout(fn(), name); return { id, name, group, latencyMs: r.latencyMs ?? ms(t), ...r }; }
  catch (e) { return { id, name, group, status: 'down', summary: String(e.message || e).slice(0, 200), facts: [], latencyMs: ms(t) }; }
}

// ---------- the rules, kept pure so they can be tested without a network ----------

// An AI reader (ChatGPT, Grok): is the key there, and did the provider accept it?
// probe: { status } from a free "list models" call, or null when it was not made.
export function readerVerdict({ label, keyName, hasKey, probe, selected, usage }) {
  if (!hasKey) return { status: 'off', summary: `Not connected: add ${keyName} to the service to let ${label} read and draft` };
  if (probe?.error) return { status: 'warn', summary: probe.error };
  if (probe && (probe.status === 401 || probe.status === 403)) return { status: 'down', summary: `${label} refused the key` };
  if (probe && probe.status === 429) return { status: 'warn', summary: `${label} is rate limiting or out of credit` };
  if (probe && probe.status >= 500) return { status: 'warn', summary: `${label} is having a problem (answered ${probe.status})` };
  if (probe && probe.status >= 400) return { status: 'warn', summary: `${label} answered ${probe.status} to a key check` };
  return { status: 'ok', summary: `Key accepted${selected ? ', and it is the one reading new posts' : ''}${usage ? ` · ${plural(usage.calls, 'call')} in the last 7 days` : ''}` };
}

// A listening source: key present, a free probe where one exists, and how its watches have been doing.
export function sourceVerdict({ kind, missing, probe, w }) {
  const label = KIND_LABEL[kind] || kind;
  if (missing.length) return { status: 'off', summary: `Not connected: add ${missing.join(' and ')} to the service` };
  if (probe?.error) return { status: 'warn', summary: probe.error };
  if (probe && (probe.status === 401 || probe.status === 403)) return { status: 'down', summary: `${label} refused our key` };
  if (probe && probe.status >= 400) return { status: 'warn', summary: `${label} answered ${probe.status} to a key check` };
  if (!w.total) return { status: 'off', summary: 'Ready, but there is no watch for it yet' };
  if (!w.on_) return { status: 'off', summary: `Ready, but all ${watches(w.total)} ${w.total === 1 ? 'is' : 'are'} switched off` };
  if (w.failing) return { status: w.failing === w.on_ ? 'down' : 'warn', summary: `${w.failing} of ${watches(w.on_)} could not listen: ${String(w.last_error || 'see Intelligence → Watches').slice(0, 140)}` };
  if (!w.last_run) return { status: 'ok', summary: `Ready; ${watches(w.on_)} on, none has listened yet` };
  return { status: 'ok', summary: `${watches(w.on_)} listening, last heard ${ago(w.last_run)}` };
}

// The listening pipeline as a whole.
export function pipelineVerdict({ auto, s, readerReady, reader, capReached }) {
  if (!s.watches_on) return { status: 'off', summary: 'No watch is switched on, so nothing is being listened to' };
  if (!auto) return { status: 'warn', summary: 'Automatic listening is off (INTEL_AUTO=off): posts only arrive when someone presses Listen now' };
  if (!readerReady) return { status: 'warn', summary: `${reader} is chosen to read posts but is not connected: ${s.waiting} ${s.waiting === 1 ? 'post is' : 'posts are'} waiting` };
  if (s.failing) return { status: 'warn', summary: `${watches(s.failing)} could not listen. Open Intelligence → Watches` };
  if (capReached) return { status: 'warn', summary: `Today's AI reading limit is reached, so ${plural(s.waiting, 'post')} wait until tomorrow` };
  if (s.waiting > 50) return { status: 'warn', summary: `${plural(s.waiting, 'post')} are waiting to be read: the reader is behind` };
  return { status: 'ok', summary: `${watches(s.watches_on)} on · ${plural(s.reads_today, 'post')} read today · ${plural(s.waiting, 'post')} waiting` };
}

// Sales email: sending, and the three things that make it safe and complete (a verified domain, the webhook that brings replies and bounces back, a postal address).
export function salesEmailVerdict({ hasKey, probe, webhook, postal, stats }) {
  if (!hasKey) return { status: 'off', summary: 'Not set up: the Sales page cannot email anyone yet' };
  if (probe && probe.rejected) return { status: 'down', summary: 'The Resend key for sales email was rejected' };
  if (probe?.error) return { status: 'warn', summary: probe.error };
  const problems = [];
  if (probe && probe.ok && !probe.verified) problems.push('no sending domain is verified');
  if (!webhook) problems.push('replies and bounces are not coming back (RESEND_WEBHOOK_SECRET is not set)');
  if (!postal) problems.push('no postal address for the email footer (required for marketing email)');
  const sent = stats.sent7, trouble = stats.bounced7 + stats.complained7;
  if (sent >= 10 && trouble / sent > 0.05) problems.push(`${trouble} of ${sent} emails bounced or were reported as spam in 7 days`);
  if (stats.failed7) problems.push(`${plural(stats.failed7, 'email')} failed to send in 7 days`);
  if (problems.length) return { status: 'warn', summary: problems.join('; ').replace(/^./, c => c.toUpperCase()) };
  return { status: 'ok', summary: `Sending is set up · ${plural(sent, 'email')} sent and ${plural(stats.received7, 'reply', 'replies')} received in 7 days` };
}

export function chatVerdict({ aiReady, c }) {
  if (!aiReady) return { status: 'off', summary: 'The chat assistant needs the assistant key: visitors would only reach a person' };
  const oldest = c.oldest ? (Date.now() - new Date(c.oldest).getTime()) / 60000 : 0;
  if (c.waiting && oldest > 15) return { status: 'warn', summary: `${plural(c.waiting, 'visitor')} waiting for a person, the longest ${Math.round(oldest)} minutes` };
  return { status: 'ok', summary: `${plural(c.started24, 'conversation')} in 24 hours${c.waiting ? ` · ${plural(c.waiting, 'visitor')} waiting for a person` : ''}` };
}

export function automationsVerdict({ paused, a }) {
  if (!a.on_) return { status: 'off', summary: 'No automation is switched on' };
  if (paused) return { status: 'warn', summary: `Everything is paused: ${plural(a.on_, 'automation')} on, but nothing will run` };
  if (a.stuck) return { status: 'warn', summary: `${plural(a.stuck, 'step')} should have run over two hours ago: the automation job may be stuck` };
  return { status: 'ok', summary: `${plural(a.on_, 'automation')} on · ${plural(a.active, 'person', 'people')} partway through · ${plural(a.done24, 'run')} finished in 24 hours` };
}

// The Money hub: invoices need payment instructions to be worth sending, and someone has to be able to open it.
export function moneyVerdict({ hasInstructions, c, access }) {
  if (!c.total) return { status: hasInstructions ? 'ok' : 'off', summary: hasInstructions ? 'Ready: no invoices yet' : 'Not started: no invoices, and no payment instructions saved yet' };
  const problems = [];
  if (!hasInstructions) problems.push('no payment instructions are saved, so invoices print without bank details');
  if (c.overdue) problems.push(`${plural(c.overdue, 'invoice')} ${c.overdue === 1 ? 'is' : 'are'} overdue`);
  if (c.unrecorded) problems.push(`${plural(c.unrecorded, 'past invoice')} with no payment recorded`);
  if (!access.length) problems.push('nobody is named to open Money');
  if (problems.length) return { status: 'warn', summary: problems.join('; ').replace(/^./, ch => ch.toUpperCase()) };
  return { status: 'ok', summary: `${plural(c.total, 'invoice')} · ${plural(c.open, 'open invoice')}, none overdue` };
}

export function githubVerdict({ hasToken, probe, job }) {
  if (!hasToken) return { status: 'off', summary: 'Not connected: the showcase does not follow app updates (add BUILDS_GITHUB_TOKEN)' };
  if (probe?.error) return { status: 'warn', summary: probe.error };
  if (probe && (probe.status === 401 || probe.status === 403)) return { status: 'down', summary: 'GitHub refused the token' };
  if (probe && probe.status >= 400) return { status: 'warn', summary: `GitHub answered ${probe.status} to a token check` };
  if (probe && probe.remaining != null && probe.limit && probe.remaining < Math.max(50, probe.limit * 0.05)) return { status: 'warn', summary: `Nearly out of GitHub requests this hour (${probe.remaining} left)` };
  if (job && job.health && ['down', 'warn'].includes(job.health)) return { status: 'warn', summary: `Token accepted, but the update sync is not healthy: ${job.lastError || 'see Background jobs'}` };
  return { status: 'ok', summary: `Token accepted${probe?.remaining != null ? ` · ${probe.remaining} of ${probe.limit} requests left this hour` : ''}` };
}

export function storesVerdict({ s }) {
  const total = s.shopify_ok + s.shopify_bad + s.sq + s.wix;
  if (!total && !s.push_ok && !s.push_bad) return { status: 'off', summary: 'No client has connected a store yet, and nothing has been pushed' };
  if (s.shopify_bad) return { status: 'warn', summary: `${plural(s.shopify_bad, 'client Shopify store')} need${s.shopify_bad === 1 ? 's' : ''} to reconnect` };
  if (s.cc_bad) return { status: 'warn', summary: `${plural(s.cc_bad, 'Square or Wix connection')} stopped working` };
  if (s.push_bad > s.push_ok) return { status: 'warn', summary: `${plural(s.push_bad, 'push', 'pushes')} to client stores failed in 7 days, against ${s.push_ok} that worked` };
  if (s.shopify_nohook) return { status: 'warn', summary: `${plural(s.shopify_nohook, 'client Shopify store')} ${s.shopify_nohook === 1 ? 'has' : 'have'} no webhook, so uninstalls would go unseen` };
  return { status: 'ok', summary: `${s.shopify_ok} Shopify · ${s.sq} Square · ${s.wix} Wix connected · ${plural(s.push_ok, 'push', 'pushes')} in 7 days` };
}

// ---------- the checks ----------

// d: { pool, env, telemetry, getSetting, fetchImpl }
export async function coverageChecks(d) {
  const { pool, env = process.env, telemetry, getSetting, fetchImpl = fetch } = d, one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
  const job = name => (telemetry?.jobs || []).find(j => j.name === name) || null;
  const settings = await loadSettings(getSetting).catch(() => ({ provider: 'anthropic', dailyScoreCap: 200, minScore: 40, slaHours: 24 }));
  const watchStats = kind => one(`select count(*)::int total, count(*) filter (where enabled)::int on_, count(*) filter (where enabled and last_status not in ('ok',''))::int failing, max(last_run_at) last_run,
      (select last_error from intel_watches x where x.kind=$1 and x.enabled and x.last_status not in ('ok','') order by last_run_at desc nulls last limit 1) last_error, coalesce(sum(last_found) filter (where enabled), 0)::int found from intel_watches where kind=$1`, [kind]);
  const usage7 = async provider => one(`select count(*)::int calls, coalesce(sum(cost_cents),0)::float cents from intel_usage where provider=$1 and at > now() - interval '7 days'`, [provider]);
  const listing = [];

  // AI readers that are not Claude (Claude is the "Assistant" check): a free list-models call tells whether the key is good.
  for (const provider of ['openai', 'xai']) {
    listing.push(row(provider === 'openai' ? 'reader-openai' : 'reader-xai', `${PROVIDER_LABEL[provider]}: reads and drafts`, 'listening', async () => {
      const keyName = KEY_ENV[provider], hasKey = Boolean(env[keyName]), model = modelFor(provider, env), u = await usage7(provider);
      let probe = null; if (hasKey) probe = await soft(async () => ({ status: (await reach(PROVIDER_LABEL[provider], fetchImpl(`${originFor(provider, env)}/v1/models`, { headers: { Authorization: `Bearer ${env[keyName]}` } }))).status }));
      const v = readerVerdict({ label: PROVIDER_LABEL[provider], keyName, hasKey, probe, selected: settings.provider === provider, usage: u.calls ? u : null });
      return { ...v, facts: [['Model', model], ['Chosen to read new posts', settings.provider === provider ? 'yes' : 'no'], ['Calls, last 7 days', String(u.calls)], ['Estimated spend, last 7 days', `$${(u.cents / 100).toFixed(2)}`], ...(provider === 'openai' ? [['Same key also used for', 'spec-check renders and colourway checks']] : [])] };
    }));
  }

  // The listening sources, one card each.
  const free = async (kind, probeFn) => {
    const missing = (KEY_NEEDS[kind] || []).filter(k => !env[k]), w = await watchStats(kind);
    let probe = null; if (!missing.length && probeFn) probe = await soft(probeFn);
    const v = sourceVerdict({ kind, missing, probe, w });
    return { ...v, facts: [['Watches', `${w.on_} on of ${w.total}`], ['Last listened', w.last_run ? ago(w.last_run) : 'never'], ['Posts seen on the last runs', String(w.found)], ...(KEY_NEEDS[kind]?.length ? [['Key', missing.length ? `missing ${missing.join(', ')}` : 'set']] : [['Key', 'none needed']])] };
  };
  listing.push(row('src-reddit', 'Reddit', 'listening', () => free('reddit', async () => {
    const res = await reach('Reddit', fetchImpl(`${origin('REDDIT_AUTH_ORIGIN', 'https://www.reddit.com', env)}/api/v1/access_token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': env.REDDIT_USER_AGENT || 'FutureBasicsIntel/1.0' }, body: 'grant_type=client_credentials' }));
    const j = await res.json().catch(() => ({})); return { status: res.ok && !j.access_token ? 401 : res.status };
  })));
  listing.push(row('src-hn', 'Hacker News and news', 'listening', async () => {
    const [hn, news] = await Promise.all([watchStats('hn'), watchStats('news')]), on_ = hn.on_ + news.on_, failing = hn.failing + news.failing, total = hn.total + news.total, last = [hn.last_run, news.last_run].filter(Boolean).sort().pop() || null;
    const v = sourceVerdict({ kind: 'hn', missing: [], probe: null, w: { total, on_, failing, last_run: last, last_error: hn.last_error || news.last_error } });
    return { ...v, facts: [['Watches', `${on_} on of ${total}`], ['Last listened', last ? ago(last) : 'never'], ['Key', 'none needed']] };
  }));
  listing.push(row('src-brave', 'Web search (Brave)', 'listening', () => free('web', null)));
  listing.push(row('src-x', 'X', 'listening', () => free('x', null)));
  listing.push(row('src-discord', 'Discord', 'listening', () => free('discord', async () => ({ status: (await reach('Discord', fetchImpl(`${origin('DISCORD_API_ORIGIN', 'https://discord.com', env)}/api/v10/users/@me`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }))).status }))));
  listing.push(row('intel', 'Listening pipeline', 'listening', async () => {
    const s = await one(`select (select count(*) from intel_watches where enabled)::int watches_on, (select count(*) from intel_watches where enabled and last_status not in ('ok',''))::int failing, (select count(*) from intel_signals where scored_at is null)::int waiting,
        (select count(*) from intel_usage where task='score' and at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc'))::int reads_today, (select coalesce(sum(cost_cents),0) from intel_usage where at > now() - interval '7 days')::float cost7,
        (select count(*) from intel_signals where status='new' and relevant and score >= $1 and owner_id is null and found_at < now() - make_interval(hours => $2))::int overdue`, [settings.minScore, settings.slaHours]);
    const v = pipelineVerdict({ auto: env.INTEL_AUTO !== 'off', s, readerReady: providerReady(settings.provider, env), reader: PROVIDER_LABEL[settings.provider], capReached: s.reads_today >= settings.dailyScoreCap });
    const j = job('Sales intelligence');
    return { ...v, facts: [['Reader', PROVIDER_LABEL[settings.provider]], ['Posts read today', `${s.reads_today} of ${settings.dailyScoreCap}`], ['Waiting to be read', String(s.waiting)], ['Worth a look, nobody on it past the target', String(s.overdue)], ['AI spend, last 7 days (estimate)', `$${(s.cost7 / 100).toFixed(2)}`], ['Automatic job', j ? (j.disabled ? (j.note || 'off') : j.lastRunAt ? `last ran ${ago(j.lastRunAt)}` : 'not run yet') : 'not scheduled']] };
  }));

  // Sales, email and chat.
  listing.push(row('sales-email', 'Sales email (Resend)', 'sales', async () => {
    const key = env.SALES_RESEND_API_KEY || env.RESEND_API_KEY || '', stored = (await getSetting('salesEmail').catch(() => null)) || {}, postal = env.SALES_POSTAL_ADDRESS || stored.postalAddress || '', from = env.SALES_FROM_ADDRESS || stored.fromAddress || '';
    const stats = await one(`select count(*) filter (where direction='out' and created_at > now() - interval '7 days')::int sent7, count(*) filter (where direction='out' and status='bounced' and created_at > now() - interval '7 days')::int bounced7,
        count(*) filter (where direction='out' and status='complained' and created_at > now() - interval '7 days')::int complained7, count(*) filter (where direction='out' and status='failed' and created_at > now() - interval '7 days')::int failed7,
        count(*) filter (where direction='in' and created_at > now() - interval '7 days')::int received7, max(created_at) filter (where direction='in') last_in from sales_emails`);
    let probe = null;
    if (key) probe = await soft(async () => {
      const res = await reach('Resend', fetchImpl(`${origin('RESEND_API_ORIGIN', 'https://api.resend.com', env)}/domains`, { headers: { Authorization: `Bearer ${key}` } })), body = await res.json().catch(() => ({}));
      if (res.status === 401 && /restricted/i.test(`${body.name} ${body.message}`)) return { ok: true, verified: true, restricted: true };
      if (res.status === 401 || res.status === 403) return { rejected: true };
      return { ok: res.ok, verified: (body.data || []).some(x => x.status === 'verified'), domains: (body.data || []).map(x => `${x.name} (${x.status})`) };
    });
    const v = salesEmailVerdict({ hasKey: Boolean(key), probe, webhook: Boolean(env.RESEND_WEBHOOK_SECRET), postal: Boolean(postal), stats });
    return { ...v, facts: [['Sending as', from || 'not set'], ['Key', env.SALES_RESEND_API_KEY ? 'its own (SALES_RESEND_API_KEY)' : key ? 'shared with sign-in email' : 'missing'], ['Domains', probe?.restricted ? 'not readable with a sending-only key' : probe?.domains?.length ? probe.domains.join(', ') : 'none'], ['Reply and bounce webhook', env.RESEND_WEBHOOK_SECRET ? 'secret set' : 'secret missing'],
      ['Postal address in the footer', postal ? 'set' : 'missing'], ['Sent, last 7 days', String(stats.sent7)], ['Bounced or reported, last 7 days', String(stats.bounced7 + stats.complained7)], ['Replies received, last 7 days', String(stats.received7)], ['Last reply', stats.last_in ? ago(stats.last_in) : 'none yet']] };
  }));
  listing.push(row('chat', 'Website chat', 'sales', async () => {
    const c = await one(`select count(*) filter (where status='waiting')::int waiting, min(last_message_at) filter (where status='waiting') oldest, count(*) filter (where created_at > now() - interval '24 hours')::int started24, count(*) filter (where status='person')::int with_person, count(*)::int total from chat_conversations`);
    const v = chatVerdict({ aiReady: Boolean(env.ANTHROPIC_API_KEY || env.AI_FIXTURE), c });
    return { ...v, facts: [['Started, last 24 hours', String(c.started24)], ['Waiting for a person', String(c.waiting)], ['With a person now', String(c.with_person)], ['Conversations in all', String(c.total)]] };
  }));
  listing.push(row('automations', 'Sales automations', 'sales', async () => {
    const [st, a] = [await automationSettings(pool), await one(`select (select count(*) from sales_automations where enabled)::int on_, (select count(*) from sales_runs where status='active')::int active, (select count(*) from sales_runs where status='active' and next_at < now() - interval '2 hours')::int stuck, (select count(*) from sales_runs where finished_at > now() - interval '24 hours')::int done24`)];
    const v = automationsVerdict({ paused: Boolean(st.paused), a }), j = job('Sales automations');
    return { ...v, facts: [['Switched on', String(a.on_)], ['People partway through', String(a.active)], ['Finished, last 24 hours', String(a.done24)], ['Overdue steps', String(a.stuck)], ['Paused', st.paused ? 'yes' : 'no'], ['Job', j ? (j.lastRunAt ? `last ran ${ago(j.lastRunAt)}` : 'not run yet') : 'not scheduled']] };
  }));

  listing.push(row('money', 'Money (invoices and payments)', 'sales', async () => {
    const c = await one(`select count(*)::int total, count(*) filter (where status='sent')::int open, count(*) filter (where status='sent' and due_on < current_date and total_cents - coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id),0) > 0)::int overdue, count(*) filter (where status='unrecorded')::int unrecorded, count(*) filter (where status='draft')::int drafts from money_invoices i`);
    const stored = (await getSetting('moneyPayment').catch(() => null)) || {}, access = moneyAccessList(env), v = moneyVerdict({ hasInstructions: Boolean(String(stored.instructions || '').trim()), c, access });
    return { ...v, facts: [['Invoices', String(c.total)], ['Sent and open', String(c.open)], ['Overdue', String(c.overdue)], ['Drafts', String(c.drafts)], ['Past invoices with no payment recorded', String(c.unrecorded)], ['Payment instructions on invoices', String(stored.instructions || '').trim() ? 'saved' : 'not saved'], ['People who can open Money', String(access.length)]] };
  }));

  // Builds, client stores and delivery.
  listing.push(row('github', 'Showcase sync (GitHub)', 'delivery', async () => {
    const token = env.BUILDS_GITHUB_TOKEN || env.GITHUB_TOKEN || '', j = job('Showcase update sync');
    let probe = null;
    if (token) probe = await soft(async () => { const res = await reach('GitHub', fetchImpl(`${origin('GITHUB_API_ORIGIN', 'https://api.github.com', env)}/rate_limit`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'FutureBasicsHealth/1.0', Accept: 'application/vnd.github+json' } })), body = await res.json().catch(() => ({})); return { status: res.status, remaining: body.resources?.core?.remaining ?? null, limit: body.resources?.core?.limit ?? null }; });
    const n = await one(`select count(*) filter (where coalesce(repo_url,'') <> '')::int linked, count(*)::int total from builds`);
    const v = githubVerdict({ hasToken: Boolean(token), probe, job: j && { health: jobHealth(j), lastError: j.lastError } });
    return { ...v, facts: [['Builds linked to a repository', `${n.linked} of ${n.total}`], ['Last update check', j?.lastRunAt ? ago(j.lastRunAt) : 'not yet'], ['Token', token ? (env.BUILDS_GITHUB_TOKEN ? 'BUILDS_GITHUB_TOKEN' : 'GITHUB_TOKEN') : 'missing']] };
  }));
  listing.push(row('stores', 'Client stores (Shopify, Square, Wix)', 'delivery', async () => {
    const s = await one(`select (select count(*) from client_shopify_stores where status='connected')::int shopify_ok, (select count(*) from client_shopify_stores where status='needs-reconnect')::int shopify_bad,
        (select count(*) from client_shopify_stores where status='connected' and not webhook_ok)::int shopify_nohook, (select count(*) from client_commerce_connections where platform='square')::int sq, (select count(*) from client_commerce_connections where platform='wix')::int wix,
        (select count(*) from client_commerce_connections where status <> 'connected')::int cc_bad, (select count(*) from build_pushes where created_at > now() - interval '7 days' and status = 'done')::int push_ok,
        (select count(*) from build_pushes where created_at > now() - interval '7 days' and status <> 'done')::int push_bad, (select max(created_at) from build_pushes) last_push`);
    const v = storesVerdict({ s });
    return { ...v, facts: [['Shopify stores connected', String(s.shopify_ok)], ['Shopify stores needing reconnect', String(s.shopify_bad)], ['Square connections', String(s.sq)], ['Wix connections', String(s.wix)], ['Pushes that worked, last 7 days', String(s.push_ok)], ['Pushes that failed, last 7 days', String(s.push_bad)], ['Last push', s.last_push ? ago(s.last_push) : 'none yet']] };
  }));

  return Promise.all(listing);
}

// Settings that quietly go wrong, for the same parts of the platform.
export function coverageConfig({ env = process.env } = {}) {
  const out = [], add = (id, label, status, detail) => out.push({ id, label, status, detail });
  const sources = [['reddit', 'Reddit'], ['web', 'Brave'], ['x', 'X'], ['discord', 'Discord']], have = sources.filter(([k]) => !(KEY_NEEDS[k] || []).some(n => !env[n])).map(([, l]) => l);
  add('listenkeys', 'Listening keys', have.length ? 'ok' : 'info', have.length ? `Connected: ${have.join(', ')}. Hacker News and Google News need no key.` : 'No source keys are set, so only Hacker News and Google News are heard. Add Reddit, Brave, X or Discord keys on the service.');
  add('readers', 'AI readers', ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'].some(k => env[k]) ? 'ok' : 'warn', ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'].some(k => env[k]) ? `Connected: ${[['ANTHROPIC_API_KEY', 'Claude'], ['OPENAI_API_KEY', 'ChatGPT'], ['XAI_API_KEY', 'Grok']].filter(([k]) => env[k]).map(([, l]) => l).join(', ')}.` : 'No AI key is set, so Intelligence cannot read posts.');
  add('intelauto', 'Automatic listening', env.INTEL_AUTO === 'off' ? 'info' : 'ok', env.INTEL_AUTO === 'off' ? 'Switched off (INTEL_AUTO=off): posts only arrive when someone presses Listen now.' : 'On: watches are listened to on their schedule.');
  add('moneyaccess', 'Who can open Money', env.MONEY_ACCESS_EMAILS ? 'ok' : 'ok', env.MONEY_ACCESS_EMAILS ? `Only ${moneyAccessList(env).length} named in MONEY_ACCESS_EMAILS.` : 'Danielle and Kyle (the default). Set MONEY_ACCESS_EMAILS to change who.');
  const sendKey = env.SALES_RESEND_API_KEY || env.RESEND_API_KEY;
  add('salesmail', 'Sales email setup', !sendKey ? 'info' : env.RESEND_WEBHOOK_SECRET && env.SALES_POSTAL_ADDRESS ? 'ok' : 'warn', !sendKey ? 'No key: the Sales page cannot send email.' : env.RESEND_WEBHOOK_SECRET && env.SALES_POSTAL_ADDRESS ? 'Key, webhook secret and postal address are all set.' : `Missing: ${[!env.RESEND_WEBHOOK_SECRET && 'RESEND_WEBHOOK_SECRET (replies and bounces)', !env.SALES_POSTAL_ADDRESS && 'SALES_POSTAL_ADDRESS (email footer)'].filter(Boolean).join(' and ')}.`);
  add('githubtoken', 'Showcase GitHub token', env.BUILDS_GITHUB_TOKEN || env.GITHUB_TOKEN ? 'ok' : 'info', env.BUILDS_GITHUB_TOKEN || env.GITHUB_TOKEN ? 'Set: the showcase can follow app updates.' : 'Not set: the showcase does not follow app updates (BUILDS_GITHUB_TOKEN).');
  add('tokenkey', 'Sealing key for client store tokens', env.SHOPIFY_TOKEN_KEY ? 'ok' : env.SHOPIFY_APP_CLIENT_SECRET ? 'info' : 'warn', env.SHOPIFY_TOKEN_KEY ? 'SHOPIFY_TOKEN_KEY seals saved Square and Wix credentials.' : env.SHOPIFY_APP_CLIENT_SECRET ? 'Using a key derived from the Shopify app secret. Set SHOPIFY_TOKEN_KEY to keep the tokens readable if that secret ever changes.' : 'Neither SHOPIFY_TOKEN_KEY nor the Shopify app secret is set, so Square and Wix credentials cannot be saved.');
  return out;
}

// Providers sometimes echo a key back in an error message ("Incorrect API key provided: sk-..."). Before the health answer leaves the server,
// every value of a secret-looking setting is replaced wherever it appears in any text.
export function redactSecrets(value, env = process.env) {
  const secrets = Object.entries(env).filter(([k, v]) => /(KEY|SECRET|TOKEN|PASSWORD|PASSPHRASE)/i.test(k) && typeof v === 'string' && v.length >= 6).map(([, v]) => v).sort((a, b) => b.length - a.length);
  if (!secrets.length) return value;
  const scrub = t => secrets.reduce((acc, sec) => (acc.includes(sec) ? acc.split(sec).join('[hidden]') : acc), t);
  const walk = v => typeof v === 'string' ? scrub(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(value);
}
