import test from 'node:test';
import assert from 'node:assert/strict';
import { prefilter, freshness, computeScore, cleanVerdict, cleanSettings, cleanWatch, ignored, nextStatus, fixtureVerdict, DEFAULT_SETTINGS, firstLookReason, nextStep } from '../src/intel.js';
import { buildKpis } from '../src/intel-kpis.js';
import { fetchSignals, redditPath, parseRss, missingKeys, resetRedditToken, KINDS } from '../src/intel-sources.js';
import { ask, parseJson, costCents, modelFor, providerReady, providerStatus } from '../src/intel-llm.js';

const NOW = Date.parse('2026-10-11T12:00:00Z'), hrs = h => new Date(NOW - h * 3600_000).toISOString();

test('the first look keeps posts that ask for help with something we do, and drops the rest', () => {
  assert.equal(prefilter('Looking for an AI consultant to automate our support inbox').pass, true);
  assert.deepEqual(prefilter('Need a developer to build a booking app for my salon').lines.includes('apps'), true);
  assert.equal(prefilter('Anyone know a good manufacturer for a prototype hoodie? Need a tech pack.').lines.includes('product'), true);
  assert.equal(prefilter('Here is my opinion on the weather').pass, false);
  assert.equal(prefilter('AI is amazing and everything is great').pass, false, 'a topic with no ask is not an opportunity');
  assert.equal(prefilter('').pass, false);
});

test('freshness falls from 100 to 0 over a week, and the score weighs fit, urgency and freshness', () => {
  assert.equal(freshness(hrs(1), NOW), 100); assert.equal(freshness(hrs(200), NOW), 0); assert.ok(freshness(hrs(80), NOW) > 40 && freshness(hrs(80), NOW) < 60); assert.equal(freshness('nonsense', NOW), 40);
  assert.equal(computeScore({ relevant: true, fit: 100, urgency: 100, postedAt: hrs(1) }, NOW), 100);
  assert.equal(computeScore({ relevant: true, fit: 80, urgency: 50, postedAt: hrs(200) }, NOW), Math.round(80 * 0.55 + 50 * 0.35));
  assert.equal(computeScore({ relevant: false, fit: 100, urgency: 100, postedAt: hrs(1) }, NOW), 0);
});

test('a verdict is cleaned: irrelevant ones carry nothing, numbers are bounded, unknown words become safe defaults', () => {
  const v = cleanVerdict({ relevant: true, serviceLine: 'ai', intent: 'weird', fit: 250, urgency: -5, summary: ' A  b ', draft: 'Hi\r\nthere', channel: 'billboard' });
  assert.deepEqual([v.relevant, v.serviceLine, v.intent, v.fit, v.urgency, v.summary, v.draft, v.channel], [true, 'ai', 'discussion', 100, 0, 'A b', 'Hi\nthere', 'none']);
  const n = cleanVerdict({ relevant: true, serviceLine: 'none', fit: 90, draft: 'x' }); assert.equal(n.relevant, false); assert.equal(n.draft, ''); assert.equal(n.fit, 0);
  assert.equal(cleanVerdict(null).relevant, false);
  assert.equal(fixtureVerdict({ user: 'NOFIT post' }).relevant, false); assert.equal(fixtureVerdict({ user: 'need an app STRONG URGENT' }).fit, 90);
});

test('settings and watches are checked', () => {
  assert.match(cleanSettings({ provider: 'bard' }).error, /Claude, ChatGPT or Grok/); assert.match(cleanSettings({ minScore: 101 }).error, /0 to 100/); assert.match(cleanSettings({ slaHours: 0 }).error, /1 to 168/); assert.match(cleanSettings({ dailyScoreCap: -1 }).error, /0 to 5000/);
  const ok = cleanSettings({ provider: 'xai', minScore: '55', ignoreHandles: '@Bob, spam_bot\nbad!handle', ignoreDomains: ['WWW.Example.com', 'nope'], teams: { '8f14e45f-ceea-467a-9575-6a2b12345678': ' Growth ', junk: 'x' } }).value;
  assert.equal(ok.provider, 'xai'); assert.equal(ok.minScore, 55); assert.deepEqual(ok.ignoreHandles, ['bob', 'spam_bot']); assert.deepEqual(ok.ignoreDomains, ['example.com']); assert.deepEqual(ok.teams, { '8f14e45f-ceea-467a-9575-6a2b12345678': 'Growth' });
  assert.match(cleanWatch({ name: '', kind: 'hn', query: 'x' }, KINDS).error, /name/); assert.match(cleanWatch({ name: 'n', kind: 'tiktok', query: 'x' }, KINDS).error, /where to listen/); assert.match(cleanWatch({ name: 'n', kind: 'hn', query: '' }, KINDS).error, /what to listen/); assert.match(cleanWatch({ name: 'n', kind: 'hn', query: 'x', serviceLine: 'legal' }, KINDS).error, /three services/);
  assert.equal(cleanWatch({ name: 'n', kind: 'hn', query: 'x' }, KINDS).value.service_line, 'any');
  assert.equal(ignored({ author: '@Bob', url: 'https://x.com/a' }, { ignoreHandles: ['bob'] }), true); assert.equal(ignored({ author: 'z', url: 'https://sub.spam.com/p' }, { ignoreDomains: ['spam.com'] }), true); assert.equal(ignored({ author: 'z', url: 'https://ok.com' }, DEFAULT_SETTINGS), false);
});

test('what staff do moves a signal along, and closed ones stay closed', () => {
  assert.equal(nextStatus('new', 'claimed'), 'reviewing'); assert.equal(nextStatus('reviewing', 'released'), 'new'); assert.equal(nextStatus('reviewing', 'outreach'), 'actioned'); assert.equal(nextStatus('actioned', 'reply'), 'replied');
  assert.equal(nextStatus('replied', 'meeting'), 'meeting'); assert.equal(nextStatus('meeting', 'won'), 'won'); assert.equal(nextStatus('won', 'outreach'), 'won'); assert.equal(nextStatus('dismissed', 'claimed'), 'dismissed'); assert.equal(nextStatus('dismissed', 'reopened'), 'new'); assert.equal(nextStatus('new', 'drafted'), 'new');
});

const sig = (id, o = {}) => ({ id, source: 'hn', service_line: 'ai', status: 'new', owner_id: null, found_at: hrs(30), first_action_at: null, claimed_at: null, relevant: true, score: 70, scored_at: hrs(29), ...o });
test('the KPIs count the funnel, the response time, the backlog, each person and each team', () => {
  const A = 'a-user', B = 'b-user', open = [sig('o1', { found_at: hrs(50) }), sig('o2', { found_at: hrs(2) }), sig('o3', { found_at: hrs(60), owner_id: A })];
  const signals = [sig('s1', { owner_id: A, claimed_at: hrs(20), first_action_at: hrs(20), status: 'meeting' }), sig('s2', { owner_id: B, claimed_at: hrs(1), first_action_at: hrs(1), found_at: hrs(30), status: 'actioned', service_line: 'apps', source: 'reddit' }), sig('s3', { relevant: false, score: 0 }), sig('s4', { status: 'dismissed', first_action_at: hrs(5), found_at: hrs(6) }), sig('s5', { scored_at: null, relevant: null, score: null }), ...open.slice(0, 1)];
  const events = [['s1', A, 'claimed'], ['s1', A, 'outreach'], ['s1', A, 'reply'], ['s1', A, 'meeting'], ['s1', A, 'won', 500000], ['s2', B, 'claimed'], ['s2', B, 'outreach'], ['s4', B, 'dismissed']].map(([signal_id, actor_id, kind, value_cents]) => ({ signal_id, actor_id, kind, value_cents })), usage = [{ cost_cents: 12.5 }, { cost_cents: 7.5 }];
  const k = buildKpis({ signals, open, events, usage, staff: [{ id: A, name: 'Ann' }, { id: B, name: 'Ben' }], settings: { minScore: 40, slaHours: 24, teams: { [A]: 'Growth', [B]: 'Growth' } }, now: NOW });
  assert.deepEqual(k.funnel, { found: 6, surfaced: 4, actioned: 2, replied: 1, meetings: 1, deals: 0, won: 1 });
  assert.equal(k.totals.unscored, 1); assert.equal(k.totals.wonCents, 500000); assert.equal(k.totals.dismissed, 1); assert.equal(k.rates.reply, 50); assert.equal(k.rates.meeting, 50); assert.equal(k.rates.win, 100);
  assert.equal(k.response.overdue, 2, 'the two new, worth-a-look posts older than the SLA'); assert.equal(k.response.overdueOldestHours, 60);
  assert.equal(k.response.withinSla, 2); assert.equal(k.cost.cents, 20); assert.equal(k.cost.perMeetingCents, 20);
  const ann = k.people.find(p => p.id === A), ben = k.people.find(p => p.id === B);
  assert.deepEqual([ann.claimed, ann.outreach, ann.replies, ann.meetings, ann.won, ann.wonCents], [1, 1, 1, 1, 1, 500000]); assert.equal(ann.owned, 1); assert.equal(ann.overdue, 1); assert.deepEqual([ben.claimed, ben.outreach, ben.dismissed], [1, 1, 1]);
  assert.equal(k.people[0].id, A, 'ordered by wins, then meetings'); assert.equal(k.teams.length, 1); assert.equal(k.teams[0].team, 'Growth'); assert.equal(k.teams[0].people, 2); assert.equal(k.teams[0].wonCents, 500000);
  assert.ok(k.bySource.some(g => g.key === 'reddit') && k.byServiceLine.some(g => g.key === 'apps'));
  const empty = buildKpis({ staff: [], settings: {}, now: NOW }); assert.equal(empty.funnel.found, 0); assert.equal(empty.rates.reply, null); assert.equal(empty.response.medianHoursToFirstAction, null);
});

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
test('Reddit: the query is turned into the right call, with an app-only sign-in used once', async () => {
  assert.equal(redditPath('r/smallbusiness'), '/r/smallbusiness/new?limit=50'); assert.match(redditPath('r/startups search:need a developer'), /^\/r\/startups\/search\?q=need%20a%20developer&restrict_sr=1/); assert.match(redditPath('search:ai consultant'), /^\/search\?q=ai%20consultant&sort=new/); assert.equal(redditPath('nonsense'), null);
  resetRedditToken(); const calls = [], env = { REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'sec', REDDIT_API_ORIGIN: 'http://r', REDDIT_AUTH_ORIGIN: 'http://a' };
  const f = async (url, o) => { calls.push(url); if (url.includes('access_token')) { assert.match(o.headers.Authorization, /^Basic /); return json(200, { access_token: 'T', expires_in: 3600 }); } assert.equal(o.headers.Authorization, 'Bearer T'); return json(200, { data: { children: [{ data: { name: 't3_1', permalink: '/r/x/comments/1/a/', author: 'u1', title: 'Need a dev', selftext: 'please', created_utc: 1760000000, subreddit: 'x' } }, { data: { name: 't3_2', stickied: true } }] } }); };
  const r = await fetchSignals({ kind: 'reddit', query: 'r/xx' }, { env, fetchImpl: f }); assert.equal(r.items.length, 1); assert.equal(r.items[0].url, 'https://www.reddit.com/r/x/comments/1/a/'); assert.equal(r.items[0].externalId, 't3_1');
  await fetchSignals({ kind: 'reddit', query: 'r/yy' }, { env, fetchImpl: f }); assert.equal(calls.filter(u => u.includes('access_token')).length, 1, 'one sign-in is reused');
  await assert.rejects(fetchSignals({ kind: 'reddit', query: 'nonsense' }, { env, fetchImpl: f }), /looks like r\/smallbusiness/);
  await assert.rejects(fetchSignals({ kind: 'reddit', query: 'r/xx' }, { env: {}, fetchImpl: f }), e => e.missingKeys.includes('REDDIT_CLIENT_ID'));
});

test('Hacker News, news, web search, X and Discord are read into plain items', async () => {
  const hn = await fetchSignals({ kind: 'hn', query: '"AI consultant"' }, { env: { HN_API_ORIGIN: 'http://h' }, now: NOW, fetchImpl: async url => { assert.match(url, /query=%22AI%20consultant%22/); assert.match(url, /created_at_i%3E/); return json(200, { hits: [{ objectID: '9', author: 'pg', story_title: 'Ask HN', comment_text: '<p>We need an <b>AI</b> consultant &amp; fast</p>', created_at_i: 1760000000 }] }); } });
  assert.equal(hn.items[0].url, 'https://news.ycombinator.com/item?id=9'); assert.equal(hn.items[0].body, 'We need an AI consultant & fast');
  const xml = '<rss><channel><item><title>Brand raises seed &amp; launches</title><link>https://n.example/a</link><guid>g1</guid><pubDate>Sat, 10 Oct 2026 10:00:00 GMT</pubDate><description>&lt;a&gt;Apparel brand&lt;/a&gt;</description><source url="x">Retail Dive</source></item></channel></rss>';
  assert.equal(parseRss(xml)[0].source, 'Retail Dive'); const nw = await fetchSignals({ kind: 'news', query: 'apparel seed' }, { env: { NEWS_RSS_ORIGIN: 'http://n' }, fetchImpl: async url => { assert.match(url, /apparel%20seed%20when%3A7d/); return json(200, xml); } });
  assert.equal(nw.items[0].author, 'Retail Dive'); assert.equal(nw.items[0].title, 'Brand raises seed & launches'); assert.equal(nw.items[0].body, 'Apparel brand');
  const wb = await fetchSignals({ kind: 'web', query: 'ai agency' }, { env: { BRAVE_API_KEY: 'k', BRAVE_API_ORIGIN: 'http://b' }, fetchImpl: async (u, o) => { assert.equal(o.headers['X-Subscription-Token'], 'k'); return json(200, { web: { results: [{ url: 'https://s.example/p', title: '<b>Hi</b>', description: 'd', profile: { name: 'S' } }] } }); } });
  assert.equal(wb.items[0].title, 'Hi'); assert.equal(wb.items[0].author, 'S');
  const xs = await fetchSignals({ kind: 'x', query: 'need an AI consultant', cursor: '100' }, { env: { X_BEARER_TOKEN: 't', X_API_ORIGIN: 'http://x' }, fetchImpl: async (u, o) => { assert.match(u, /since_id=100/); assert.match(decodeURIComponent(u), /-is:retweet lang:en/); assert.equal(o.headers.Authorization, 'Bearer t'); return json(200, { data: [{ id: '105', text: 'need one', author_id: 'u1', created_at: '2026-10-10T10:00:00Z' }, { id: '103', text: 'x', author_id: 'u1' }], includes: { users: [{ id: 'u1', username: 'ann' }] } }); } });
  assert.equal(xs.items[0].url, 'https://x.com/ann/status/105'); assert.equal(xs.cursor, '105');
  const dc = await fetchSignals({ kind: 'discord', query: '11111/22222' }, { env: { DISCORD_BOT_TOKEN: 'b', DISCORD_API_ORIGIN: 'http://d' }, fetchImpl: async (u, o) => { assert.equal(o.headers.Authorization, 'Bot b'); return json(200, [{ id: '5', content: 'anyone know a dev?', author: { username: 'z' }, timestamp: '2026-10-10T10:00:00Z' }, { id: '4', content: 'beep', author: { username: 'bot', bot: true } }, { id: '3', content: '  ', author: { username: 'q' } }]); } });
  assert.equal(dc.items.length, 1); assert.equal(dc.items[0].url, 'https://discord.com/channels/11111/22222/5'); assert.equal(dc.cursor, '5');
  await assert.rejects(fetchSignals({ kind: 'discord', query: 'abc' }, { env: { DISCORD_BOT_TOKEN: 'b' }, fetchImpl: async () => json(200, []) }), /server id>\/<channel id/);
  await assert.rejects(fetchSignals({ kind: 'x', query: 'q' }, { env: { X_BEARER_TOKEN: 't' }, fetchImpl: async () => json(401, {}) }), e => e.refused === true);
  await assert.rejects(fetchSignals({ kind: 'hn', query: 'q' }, { env: {}, fetchImpl: async () => json(429, {}) }), e => e.rateLimited === true);
  assert.deepEqual(missingKeys('hn', {}), []); assert.deepEqual(missingKeys('x', {}), ['X_BEARER_TOKEN']);
});

test('the AI layer speaks to Claude, ChatGPT and Grok, parses JSON however it is wrapped, and prices a call', async () => {
  assert.deepEqual(parseJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 }); assert.throws(() => parseJson('no json here'), /did not answer with JSON/); assert.throws(() => parseJson('{broken'), /JSON/);
  const seen = []; const f = async (url, o) => { seen.push({ url, o: JSON.parse(o.body), auth: o.headers.Authorization }); return json(200, { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } }); };
  const oa = await ask({ provider: 'openai', system: 's', user: 'u', json: true, env: { OPENAI_API_KEY: 'k1', OPENAI_API_ORIGIN: 'http://oa' }, fetchImpl: f });
  assert.equal(seen[0].url, 'http://oa/v1/chat/completions'); assert.equal(seen[0].auth, 'Bearer k1'); assert.equal(seen[0].o.response_format.type, 'json_object'); assert.deepEqual(oa.json, { ok: true }); assert.deepEqual(oa.usage, { input: 1000, output: 200 });
  const gx = await ask({ provider: 'xai', system: 's', user: 'u', env: { XAI_API_KEY: 'k2' }, fetchImpl: f }); assert.equal(seen[1].url, 'https://api.x.ai/v1/chat/completions'); assert.equal(gx.provider, 'xai'); assert.equal(seen[1].o.response_format, undefined);
  const fx = await ask({ provider: 'anthropic', user: 'u', json: true, env: { AI_FIXTURE: '1' }, fixture: () => ({ hi: 1 }) }); assert.deepEqual(fx.json, { hi: 1 }); assert.equal(fx.model, 'fixture');
  await assert.rejects(ask({ provider: 'openai', env: {}, fetchImpl: f }), /not connected/); await assert.rejects(ask({ provider: 'anthropic', env: {} }), /not connected/); await assert.rejects(ask({ provider: 'bard' }), /Unknown/);
  await assert.rejects(ask({ provider: 'openai', env: { OPENAI_API_KEY: 'k' }, fetchImpl: async () => json(401, {}) }), e => e.refused === true);
  await assert.rejects(ask({ provider: 'xai', env: { XAI_API_KEY: 'k' }, fetchImpl: async () => json(404, { error: { message: 'model not found' } }) }), /answered 404: model not found/);
  assert.equal(costCents('openai', 1_000_000, 1_000_000, {}), 225); assert.equal(costCents('openai', 1000, 0, { INTEL_PRICES: '{"openai":[1,1]}' }), 0.1); assert.equal(modelFor('xai', { INTEL_XAI_MODEL: 'grok-x' }), 'grok-x'); assert.equal(modelFor('openai', {}), 'gpt-5-mini');
  assert.equal(providerReady('xai', {}), false); assert.equal(providerReady('anthropic', { AI_FIXTURE: 'f' }), true); assert.equal(providerStatus({ OPENAI_API_KEY: 'k' }).find(p => p.provider === 'openai').ready, true);
});

test('a post the first look left unread says why, and agrees with the filter', () => {
  const cat = 'Pictures of my cat nothing to see', quiet = 'we should look at automation sometime', real = 'Looking for an AI consultant to automate our support inbox';
  assert.equal(prefilter(cat).pass, false); assert.match(firstLookReason(cat), /does not mention AI, apps or software, or product development/);
  assert.equal(prefilter(quiet).pass, false); assert.match(firstLookReason(quiet), /mentions AI but does not sound like someone asking/);
  assert.equal(prefilter(real).pass, true); assert.equal(firstLookReason(real), '');
});

test('what Future Basics should do next follows where the post stands', () => {
  assert.match(nextStep({ status: 'new', intent: 'buying', draftChannel: 'public_reply' }), /ready to buy.*Reply in the thread.*rules on promotion.*“I sent it”.*CRM/);
  assert.match(nextStep({ status: 'reviewing', intent: 'hiring', draftChannel: 'dm', contactId: 'c1' }), /faster alternative to a hire.*direct message.*“I sent it”\.$/);
  assert.match(nextStep({ status: 'new', intent: 'asking', draftChannel: 'email' }), /do not pitch.*Email them the draft/);
  assert.match(nextStep({ status: 'actioned' }), /follow up once/); assert.match(nextStep({ status: 'replied' }), /Meeting booked/); assert.match(nextStep({ status: 'meeting' }), /Won or Lost/);
  for (const status of ['won', 'lost', 'dismissed']) assert.equal(nextStep({ status }), '');
});
