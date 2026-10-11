// Running the listening: fetch what each watch finds, keep the new posts, have the AI read the ones that could matter, and record what that cost.
// deps: { env, fetchImpl, askImpl (defaults to intel-llm ask), now, log }. Nothing here posts or messages anyone.
import { fetchSignals, KIND_LABEL } from './intel-sources.js';
import { ask as realAsk, costCents, modelFor, providerReady } from './intel-llm.js';
import { prefilter, computeScore, systemPrompt, userPrompt, cleanVerdict, fixtureVerdict, ignored, DEFAULT_SETTINGS, cleanSettings } from './intel.js';

export async function loadSettings(getSetting) { const stored = (await getSetting('intel')) || {}; return cleanSettings(stored, DEFAULT_SETTINGS).value || DEFAULT_SETTINGS; }

// Keep the items a watch found that we have not seen: ignored authors and sites are dropped, the rest go in as new signals. → { added, ignored }
export async function ingest(pool, watch, items, settings = DEFAULT_SETTINGS) {
  let added = 0, skipped = 0;
  for (const it of items) {
    if (ignored(it, settings)) { skipped++; continue; }
    const r = await pool.query(`insert into intel_signals(watch_id,source,external_id,url,author,title,body,posted_at) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict (source,external_id) do nothing`,
      [watch.id, watch.kind, String(it.externalId).slice(0, 300), String(it.url || '').slice(0, 1000), String(it.author || '').slice(0, 120), String(it.title || '').slice(0, 400), String(it.body || '').slice(0, 5000), it.postedAt || null]);
    added += r.rowCount;
  }
  return { added, skipped };
}

// Listen once to one watch. A failure is written on the watch (so the page can say what to fix) and does not stop the others.
export async function runWatch(pool, watch, deps) {
  const { env = process.env, fetchImpl = fetch, now = Date.now(), settings = DEFAULT_SETTINGS } = deps;
  try {
    const { items, cursor } = await fetchSignals(watch, { env, fetchImpl, now });
    const r = await ingest(pool, watch, items, settings);
    await pool.query(`update intel_watches set last_run_at=now(), last_status='ok', last_error='', last_found=$2, cursor=$3, updated_at=now() where id=$1`, [watch.id, r.added, cursor || watch.cursor || '']);
    return { ok: true, found: items.length, added: r.added, ignored: r.skipped };
  } catch (e) {
    await pool.query(`update intel_watches set last_run_at=now(), last_status=$2, last_error=$3, last_found=0, updated_at=now() where id=$1`, [watch.id, e.missingKeys ? 'needs-key' : e.refused ? 'refused' : e.rateLimited ? 'rate-limited' : 'error', String(e.message).slice(0, 300)]);
    return { ok: false, error: e.message, missingKeys: e.missingKeys || null };
  }
}

// Every enabled watch that is due (never run, or last run longer ago than the interval). `force` runs them all.
export async function runDue(pool, deps, { force = false } = {}) {
  const { settings = DEFAULT_SETTINGS } = deps, every = Number(settings.runEveryMinutes) || 60;
  const due = (await pool.query(`select * from intel_watches where enabled and ($1 or last_run_at is null or last_run_at < now() - make_interval(mins => $2)) order by last_run_at nulls first`, [force, every])).rows;
  const out = []; for (const w of due) out.push({ id: w.id, name: w.name, ...(await runWatch(pool, w, deps)) });
  return out;
}

const todayStart = `(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;
async function recordUsage(pool, r, task, env) { await pool.query(`insert into intel_usage(provider,model,task,input_tokens,output_tokens,cost_cents) values($1,$2,$3,$4,$5,$6)`, [r.provider, r.model, task, r.usage.input, r.usage.output, costCents(r.provider, r.usage.input, r.usage.output, env)]).catch(() => {}); }

async function readSignal(pool, s, deps, { instruction = '', provider } = {}) {
  const { env = process.env, fetchImpl = fetch, askImpl = realAsk, settings = DEFAULT_SETTINGS } = deps, p = provider || settings.provider;
  const user = userPrompt(s) + (instruction ? `\n\nA person asked for this change to the draft: ${String(instruction).slice(0, 400)}` : '');
  const r = await askImpl({ provider: p, system: systemPrompt(), user, json: true, maxTokens: 900, env, fetchImpl, fixture: fixtureVerdict });
  await recordUsage(pool, r, instruction ? 'redraft' : 'score', env);
  return { verdict: cleanVerdict(r.json), model: `${r.provider}:${r.model}` };
}

// Read the signals nobody has read yet: a cheap first look (no AI) drops the obvious non-starters, the AI reads the rest within the daily limit.
// → { read, skipped, remaining, stopped }
export async function scorePending(pool, deps, { limit = 20, ids = null, force = false } = {}) {
  const { env = process.env, now = Date.now(), settings = DEFAULT_SETTINGS } = deps, provider = settings.provider;
  const rows = (await pool.query(`select s.*, w.name watch from intel_signals s left join intel_watches w on w.id=s.watch_id where s.scored_at is null and ($2::uuid[] is null or s.id = any($2::uuid[])) order by s.found_at desc limit $1`, [limit, ids])).rows;
  let read = 0, skipped = 0, stopped = '';
  for (const s of rows) {
    const first = force ? { pass: true } : prefilter(`${s.title} ${s.body}`); // a post a person added by hand is always read
    if (!first.pass) { await pool.query(`update intel_signals set scored_at=now(), relevant=false, score=0, model='prefilter' where id=$1`, [s.id]); skipped++; continue; }
    if (!providerReady(provider, env)) { stopped = `${provider} is not connected, so posts are waiting to be read`; break; }
    const used = Number((await pool.query(`select count(*) n from intel_usage where task='score' and at >= ${todayStart}`)).rows[0].n);
    if (used >= Number(settings.dailyScoreCap)) { stopped = `today's AI reading limit (${settings.dailyScoreCap}) is reached`; break; }
    try {
      const { verdict: v, model } = await readSignal(pool, s, deps), score = computeScore({ relevant: v.relevant, fit: v.fit, urgency: v.urgency, postedAt: s.posted_at || s.found_at }, now);
      await pool.query(`update intel_signals set scored_at=now(), relevant=$2, service_line=$3, intent=$4, fit=$5, urgency=$6, score=$7, summary=$8, why_now=$9, angle=$10, draft=$11, draft_channel=$12, risks=$13, model=$14 where id=$1`,
        [s.id, v.relevant, v.serviceLine, v.intent, v.fit, v.urgency, score, v.summary, v.whyNow, v.angle, v.draft, v.channel, v.risks, model]);
      read++;
    } catch (e) { stopped = `${e.message}`.slice(0, 200); if (e.refused) break; await pool.query(`update intel_signals set model=$2 where id=$1`, [s.id, `error: ${String(e.message).slice(0, 80)}`]).catch(() => {}); break; }
  }
  const remaining = Number((await pool.query('select count(*) n from intel_signals where scored_at is null')).rows[0].n);
  return { read, skipped, remaining, stopped };
}

// A fresh draft for one signal, optionally with a person's instruction ("shorter", "mention we do Shopify builds"), from the chosen provider.
export async function redraft(pool, id, deps, opts = {}) {
  const s = (await pool.query(`select s.*, w.name watch from intel_signals s left join intel_watches w on w.id=s.watch_id where s.id=$1`, [id])).rows[0]; if (!s) return null;
  const { verdict: v, model } = await readSignal(pool, s, deps, opts);
  await pool.query(`update intel_signals set draft=$2, draft_channel=$3, model=$4 where id=$1`, [id, v.draft || s.draft, v.channel === 'none' ? s.draft_channel : v.channel, model]);
  return { draft: v.draft || s.draft, channel: v.channel, model };
}

// Old post text goes after the retention period unless the signal became a contact; the record of what we did stays (it is the KPIs).
export async function purgeOld(pool, days) {
  const r = await pool.query(`update intel_signals set body='', title=case when contact_id is null then '' else title end, draft='' where found_at < now() - make_interval(days => $1) and contact_id is null and body <> ''`, [days]);
  return r.rowCount;
}
export { KIND_LABEL, modelFor };
