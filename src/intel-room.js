// Opportunities for a client's room: Future Basics' listening (src/intel-sources.js) run on the room's own searches, and the AI reading each
// post for the room's own services, so a client studio sees the work it could win across Reddit, X, news, the web, Hacker News and Discord.
// Kept apart from Future Basics' sales intelligence: its own tables (intel_room_*), a room sees only its own posts, and staff intelligence
// never sees them. Nothing here posts or messages anyone: the room's people reach out themselves and mark what they did.
//   The client (their hub), once Future Basics has turned it on for the room:
//     GET  /v1/client/opportunities                       the posts worth a look (best first), the room's searches and what is connected
//     POST /v1/client/opportunities/run                   look now (at most once every ten minutes): every search, then the AI reads what is new
//     POST /v1/client/opportunities/signals/:id/:action   save | contacted | won | dismiss | reopen
//     POST /v1/client/opportunities/watches               {name, kind, query} add a search; PATCH .../:id {enabled}; DELETE .../:id
//   Staff (the work console):
//     GET|PATCH /v1/admin/clients/:id/opportunities       {enabled, services} turn it on for a room (its starting searches are made) and say
//                                                         what the room sells, which is what the AI reads every post for
import { fetchSignals, KINDS, KIND_LABEL, missingKeys } from './intel-sources.js';
import { ask as realAsk, costCents, providerReady } from './intel-llm.js';
import { computeScore, ignored, ASK_WORDS, INTENTS } from './intel.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export const ROOM_ACTIONS = { save: 'saved', contacted: 'contacted', won: 'won', dismiss: 'dismissed', reopen: 'new' };
export const ROOM_DAILY_READS = 120; // posts the AI reads for one room in a day

// what a content studio sells, and where people ask for it: the starting point when Future Basics turns a room on (the room can change them)
export const CONTENT_SERVICES = 'Photo and video content: brand and product photography, campaign and lookbook shoots, social video and reels, commercials, music videos and editing, for brands, artists, labels and agencies.';
export const CONTENT_WATCHES = [
  { name: 'Reddit: hiring a photographer or videographer', kind: 'reddit', query: 'r/forhire search:photographer OR videographer OR "video editor" OR "content creator"' },
  { name: 'Reddit: brands asking for photo or video', kind: 'reddit', query: 'search:"looking for a photographer" OR "looking for a videographer" OR "need a videographer" OR "product photographer"' },
  { name: 'X: looking for a photographer or videographer', kind: 'x', query: '("looking for a photographer" OR "looking for a videographer" OR "need a videographer" OR "hiring a videographer" OR "need a content creator")' },
  { name: 'Web: brands casting for shoots', kind: 'web', query: '"looking for a videographer" OR "seeking a photographer" brand shoot' },
  { name: 'News: brand campaigns and launches', kind: 'news', query: 'brand launches campaign shoot photographer videographer' },
  { name: 'Hacker News: startups needing video', kind: 'hn', query: '"product video" OR videographer OR "launch video"' }
];
// a cheap first look: the post talks about photo or video work and sounds like someone asking, hiring or looking
const CONTENT_WORDS = /\b(photo\w*|video\w*|film\w*|shoot|shoots|shooting|reels?|tiktok|youtube|ugc|content creat\w+|creative agency|lookbook|campaign|commercial|music video|editor|editing|b-?roll|cinematograph\w+|dp|director of photography|headshots?|product shots?)\b/i;
export const roomPrefilter = text => { const t = String(text || ''); return CONTENT_WORDS.test(t) && ASK_WORDS.test(t); };

export const roomSystemPrompt = (room, services) => `You help ${room}, a creative studio, find people who may hire them. What they sell: ${services}

You will be given one public post, comment or story. Decide whether the person or company behind it could plausibly hire this studio for that work, and how soon. Be strict: most posts are not opportunities; another studio or freelancer advertising itself is not one; someone asking for free work, exposure deals or a job is not one.

Rules for what you write:
- Use only what is in the post. Never invent facts about the person, their company, or about the studio (no clients, results, prices or awards).
- The draft is a first reply for a person at the studio to edit and send themselves: warm, specific, short, useful before it sells. No links unless the post asks for one, no hype, no exclamation marks, no emoji.
- Say plainly in "risks" anything to check first (a community rule against promotion, a very old post, a budget far too low, a poster who may be a bot).
Answer with a JSON object with exactly these keys: relevant (boolean), intent ("buying", "hiring", "pain", "asking" or "discussion"), fit (0-100: how well their need matches what the studio sells), urgency (0-100: how soon they need it), summary (one sentence: who they are and what they need), whyNow (one sentence, or ""), angle (one sentence: the most useful thing to say), draft (the reply, or "" if not relevant), channel ("public_reply", "dm" or "none"), risks (one sentence or "").`;
const userPrompt = s => `Source: ${s.source}\nPosted: ${s.posted_at ? new Date(s.posted_at).toISOString() : 'unknown'}\nAuthor: ${clip(s.author, 80) || 'unknown'}\nLink: ${s.url || 'none'}\n\nTitle: ${clip(s.title, 300) || '(none)'}\n\nText:\n${String(s.body || '').slice(0, 3500) || '(none)'}`;
export function cleanRoomVerdict(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}, relevant = r.relevant === true;
  return { relevant, intent: INTENTS.includes(r.intent) ? r.intent : 'discussion', fit: relevant ? int(r.fit, 0, 100, 0) : 0, urgency: relevant ? int(r.urgency, 0, 100, 0) : 0, summary: clip(r.summary, 300),
    whyNow: relevant ? clip(r.whyNow, 300) : '', angle: relevant ? clip(r.angle, 300) : '', draft: relevant ? String(r.draft ?? '').replace(/\r/g, '').trim().slice(0, 2000) : '', channel: ['public_reply', 'dm', 'none'].includes(r.channel) ? r.channel : 'none', risks: clip(r.risks, 300) };
}
// the stand-in when the assistant runs on fixtures: NOFIT in a post makes it not an opportunity
const fixture = ({ user }) => /NOFIT/.test(String(user)) ? { relevant: false, intent: 'discussion', fit: 0, urgency: 0, summary: 'Not an opportunity.', whyNow: '', angle: '', draft: '', channel: 'none', risks: '' }
  : { relevant: true, intent: /hiring|hire/i.test(String(user)) ? 'hiring' : 'buying', fit: 80, urgency: 60, summary: 'Fixture: a brand that needs a shoot.', whyNow: 'Fixture: they asked this week.', angle: 'Fixture: ask about the brief first.', draft: 'Fixture draft: happy to talk through the shoot.', channel: 'public_reply', risks: '' };

// ---- listening ----
export async function seedRoom(pool, clientId, env = process.env) {
  if (Number((await pool.query('select count(*) n from intel_room_watches where client_id=$1', [clientId])).rows[0].n)) return 0;
  for (const w of CONTENT_WATCHES) await pool.query('insert into intel_room_watches(client_id,name,kind,query,enabled) values($1,$2,$3,$4,$5)', [clientId, w.name, w.kind, w.query, missingKeys(w.kind, env).length === 0]);
  return CONTENT_WATCHES.length;
}
export async function runRoomWatch(pool, watch, { env = process.env, fetchImpl = fetch, now = Date.now(), settings = {} } = {}) {
  try {
    const { items, cursor } = await fetchSignals(watch, { env, fetchImpl, now }); let added = 0;
    for (const it of items) {
      if (ignored(it, settings)) continue;
      added += (await pool.query(`insert into intel_room_signals(client_id,watch_id,source,external_id,url,author,title,body,posted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (client_id,source,external_id) do nothing`,
        [watch.client_id, watch.id, watch.kind, String(it.externalId).slice(0, 300), String(it.url || '').slice(0, 1000), String(it.author || '').slice(0, 120), String(it.title || '').slice(0, 400), String(it.body || '').slice(0, 5000), it.postedAt || null])).rowCount;
    }
    await pool.query(`update intel_room_watches set last_run_at=now(), last_status='ok', last_error='', last_found=$2, cursor=$3, updated_at=now() where id=$1`, [watch.id, added, cursor || watch.cursor || '']);
    return { ok: true, added };
  } catch (e) {
    await pool.query(`update intel_room_watches set last_run_at=now(), last_status=$2, last_error=$3, last_found=0, updated_at=now() where id=$1`, [watch.id, e.missingKeys ? 'needs-key' : e.rateLimited ? 'rate-limited' : 'error', String(e.message).slice(0, 300)]);
    return { ok: false, error: e.message };
  }
}
// every room that is on: its due searches (or all of them, forced), then the AI reads what is new, within each room's daily limit
export async function runRooms(pool, deps = {}, { clientId = null, force = false } = {}) {
  const every = Number(deps.settings?.runEveryMinutes) || 60;
  const due = (await pool.query(`select w.* from intel_room_watches w join intel_rooms r on r.client_id=w.client_id and r.enabled where w.enabled and ($1::uuid is null or w.client_id=$1)
    and ($2 or w.last_run_at is null or w.last_run_at < now() - make_interval(mins => $3)) order by w.last_run_at nulls first`, [clientId, force, every])).rows;
  let added = 0; for (const w of due) added += (await runRoomWatch(pool, w, deps)).added || 0;
  const read = await scoreRooms(pool, deps, { clientId });
  return { searched: due.length, added, ...read };
}
export async function scoreRooms(pool, deps = {}, { clientId = null, limit = 40 } = {}) {
  const { env = process.env, fetchImpl = fetch, askImpl = realAsk, now = Date.now(), settings = {} } = deps, provider = settings.provider || 'anthropic';
  const rows = (await pool.query(`select s.*, c.name room, r.services from intel_room_signals s join intel_rooms r on r.client_id=s.client_id and r.enabled join clients c on c.id=s.client_id
    where s.scored_at is null and ($1::uuid is null or s.client_id=$1) order by s.found_at desc limit $2`, [clientId, limit])).rows;
  let read = 0, skipped = 0, stopped = '';
  for (const s of rows) {
    if (!roomPrefilter(`${s.title} ${s.body}`)) { await pool.query(`update intel_room_signals set scored_at=now(), relevant=false, score=0, model='prefilter' where id=$1`, [s.id]); skipped++; continue; }
    if (!providerReady(provider, env)) { stopped = 'The AI is not connected, so posts are waiting to be read'; break; }
    const used = Number((await pool.query(`select count(*) n from intel_room_signals where client_id=$1 and scored_at >= date_trunc('day', now()) and model not in ('prefilter','')`, [s.client_id])).rows[0].n);
    if (used >= ROOM_DAILY_READS) { stopped = `Today's reading limit (${ROOM_DAILY_READS}) is reached`; continue; }
    try {
      const r = await askImpl({ provider, system: roomSystemPrompt(s.room, s.services || CONTENT_SERVICES), user: userPrompt(s), json: true, maxTokens: 900, env, fetchImpl, fixture });
      await pool.query(`insert into intel_usage(provider,model,task,input_tokens,output_tokens,cost_cents) values($1,$2,'room-score',$3,$4,$5)`, [r.provider, r.model, r.usage.input, r.usage.output, costCents(r.provider, r.usage.input, r.usage.output, env)]).catch(() => {});
      const v = cleanRoomVerdict(r.json), score = computeScore({ relevant: v.relevant, fit: v.fit, urgency: v.urgency, postedAt: s.posted_at || s.found_at }, now);
      await pool.query(`update intel_room_signals set scored_at=now(), relevant=$2, intent=$3, fit=$4, urgency=$5, score=$6, summary=$7, why_now=$8, angle=$9, draft=$10, draft_channel=$11, risks=$12, model=$13 where id=$1`,
        [s.id, v.relevant, v.intent, v.fit, v.urgency, score, v.summary, v.whyNow, v.angle, v.draft, v.channel, v.risks, `${r.provider}:${r.model}`]);
      read++;
    } catch (e) { stopped = clip(e.message, 200); break; }
  }
  return { read, skipped, stopped };
}

// ---- routes ----
export function registerIntelRoomRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting = async () => null, env = process.env, fetchImpl = (u, o) => fetch(u, o), askImpl = realAsk, log = console } = d;
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const clientOf = req => (req.auth?.role !== 'admin' && UUID.test(String(req.auth?.clientId || '')) ? req.auth.clientId : null);
  const roomOf = async id => (await pool.query('select r.*, c.name from intel_rooms r join clients c on c.id=r.client_id where r.client_id=$1', [id])).rows[0] || null;
  const deps = async () => ({ env, fetchImpl, askImpl, settings: (await getSetting('intel')) || {}, log });
  const signalView = s => ({ id: s.id, source: s.source, sourceLabel: KIND_LABEL[s.source] || s.source, url: s.url, author: s.author, title: s.title, excerpt: clip(s.body, 400), postedAt: s.posted_at, foundAt: s.found_at,
    status: s.status, score: s.score, intent: s.intent, summary: s.summary, whyNow: s.why_now, angle: s.angle, draft: s.draft, channel: s.draft_channel, risks: s.risks, actedAt: s.acted_at, actedBy: s.acted_name || null });
  const watchView = w => ({ id: w.id, name: w.name, kind: w.kind, kindLabel: KIND_LABEL[w.kind] || w.kind, query: w.query, enabled: w.enabled, lastRunAt: w.last_run_at, lastStatus: w.last_status, lastError: w.last_error, lastFound: w.last_found, needs: missingKeys(w.kind, env) });
  // the room, on: what its hub shows
  const gate = async (req, reply) => { const cid = clientOf(req); if (!cid) { bad(reply, 'Sign in to your room', 401); return null; } const r = await roomOf(cid); if (!r?.enabled) { bad(reply, 'Opportunities are not turned on for your room yet. Ask Future Basics.', 403); return null; } return r; };

  app.get('/v1/client/opportunities', { preHandler: authenticate }, async (req, reply) => {
    const cid = clientOf(req); if (!cid) return bad(reply, 'Sign in to your room', 401);
    const r = await roomOf(cid); if (!r?.enabled) return { enabled: false };
    const signals = (await pool.query(`select s.*, coalesce(nullif(u.name,''), u.email) acted_name from intel_room_signals s left join users u on u.id=s.acted_by where s.client_id=$1 and s.relevant and s.status <> 'dismissed'
      order by (s.status='new') desc, s.score desc nulls last, s.found_at desc limit 60`, [cid])).rows.map(signalView);
    const watches = (await pool.query('select * from intel_room_watches where client_id=$1 order by kind, name', [cid])).rows.map(watchView);
    const counts = (await pool.query(`select count(*) filter (where relevant and status='new')::int new, count(*) filter (where status='contacted')::int contacted, count(*) filter (where status='won')::int won,
      count(*) filter (where scored_at is null)::int waiting, count(*) filter (where found_at > now() - interval '7 days')::int week from intel_room_signals where client_id=$1`, [cid])).rows[0];
    return { enabled: true, room: r.name, services: r.services || CONTENT_SERVICES, signals, watches, counts, kinds: KINDS.map(k => ({ kind: k, label: KIND_LABEL[k], connected: missingKeys(k, env).length === 0 })) };
  });
  const lastLook = new Map();
  app.post('/v1/client/opportunities/run', { preHandler: authenticate }, async (req, reply) => {
    const r = await gate(req, reply); if (!r) return;
    const at = lastLook.get(r.client_id) || 0; if (Date.now() - at < 10 * 60 * 1000) return bad(reply, 'Searched a few minutes ago. Try again in ten minutes.', 429);
    lastLook.set(r.client_id, Date.now());
    try { return await runRooms(pool, await deps(), { clientId: r.client_id, force: true }); } catch (e) { log.warn?.({ err: e.message }, 'room opportunities run failed'); return bad(reply, 'The search did not finish. Try again later.', 502); }
  });
  app.post('/v1/client/opportunities/signals/:id/:action', { preHandler: authenticate }, async (req, reply) => {
    const r = await gate(req, reply); if (!r) return; if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    const to = ROOM_ACTIONS[req.params.action]; if (!to) return bad(reply, `The action is one of ${Object.keys(ROOM_ACTIONS).join(', ')}`);
    const who = UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null;
    const s = (await pool.query(`update intel_room_signals set status=$3, acted_by=$4, acted_at=now() where id=$1 and client_id=$2 returning *`, [req.params.id, r.client_id, to, who])).rows[0];
    return s ? { signal: signalView(s) } : bad(reply, 'Not found', 404);
  });
  app.post('/v1/client/opportunities/watches', { preHandler: authenticate }, async (req, reply) => {
    const r = await gate(req, reply); if (!r) return; const b = req.body || {};
    const kind = KINDS.includes(b.kind) ? b.kind : null, query = clip(b.query, 300), name = clip(b.name, 80) || (kind ? `${KIND_LABEL[kind]}: ${clip(query, 40)}` : '');
    if (!kind) return bad(reply, `Choose where to search: ${KINDS.map(k => KIND_LABEL[k]).join(', ')}`); if (query.length < 3) return bad(reply, 'Say what to search for');
    if (Number((await pool.query('select count(*) n from intel_room_watches where client_id=$1', [r.client_id])).rows[0].n) >= 20) return bad(reply, 'A room keeps up to 20 searches. Remove one first.', 409);
    const w = (await pool.query('insert into intel_room_watches(client_id,name,kind,query,enabled) values($1,$2,$3,$4,$5) returning *', [r.client_id, name, kind, query, missingKeys(kind, env).length === 0])).rows[0];
    return reply.code(201).send({ watch: watchView(w) });
  });
  app.patch('/v1/client/opportunities/watches/:id', { preHandler: authenticate }, async (req, reply) => {
    const r = await gate(req, reply); if (!r) return; if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    const w = (await pool.query('update intel_room_watches set enabled=$3, updated_at=now() where id=$1 and client_id=$2 returning *', [req.params.id, r.client_id, req.body?.enabled === true])).rows[0];
    return w ? { watch: watchView(w) } : bad(reply, 'Not found', 404);
  });
  app.delete('/v1/client/opportunities/watches/:id', { preHandler: authenticate }, async (req, reply) => {
    const r = await gate(req, reply); if (!r) return; if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    return (await pool.query('delete from intel_room_watches where id=$1 and client_id=$2', [req.params.id, r.client_id])).rowCount ? { ok: true } : bad(reply, 'Not found', 404);
  });

  // ---- the work console: on or off for a room, and what the room sells ----
  const staff = [authenticate, adminOnly];
  const adminView = async id => { const r = await roomOf(id), n = (await pool.query(`select count(*)::int watches, (select count(*)::int from intel_room_signals where client_id=$1 and relevant) relevant from intel_room_watches where client_id=$1`, [id])).rows[0];
    return { enabled: Boolean(r?.enabled), services: r?.services || CONTENT_SERVICES, watches: n.watches, relevant: n.relevant }; };
  app.get('/v1/admin/clients/:id/opportunities', { preHandler: staff }, async (req, reply) => { if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404); return adminView(req.params.id); });
  app.patch('/v1/admin/clients/:id/opportunities', { preHandler: staff }, async (req, reply) => {
    const id = req.params.id; if (!UUID.test(String(id)) || !(await pool.query('select 1 from clients where id=$1', [id])).rowCount) return bad(reply, 'Client not found', 404);
    const b = req.body || {}, by = UUID.test(String(req.auth.sub || '')) ? req.auth.sub : null, services = b.services === undefined ? null : clip(b.services, 600);
    if (services !== null && services.length < 10) return bad(reply, 'Say what the room sells, in a sentence or two');
    await pool.query(`insert into intel_rooms(client_id, enabled, services, updated_by) values($1, coalesce($2, false), coalesce($3, $5), $4)
      on conflict (client_id) do update set enabled=coalesce($2, intel_rooms.enabled), services=coalesce($3, intel_rooms.services), updated_by=$4, updated_at=now()`, [id, typeof b.enabled === 'boolean' ? b.enabled : null, services, by, CONTENT_SERVICES]);
    if (b.enabled === true) { await seedRoom(pool, id, env); await pool.query(`insert into activities(client_id, actor_id, type, summary) values($1,$2,'client','Opportunities turned on for the room')`, [id, by]).catch(() => {}); }
    return adminView(id);
  });
}
