// Where we listen. Each source turns a watch (a query) into plain items: { externalId, url, author, title, body, postedAt }. Plain functions with the network passed in.
// Only public posts are read, through each platform's own API with our own credentials. LinkedIn and Meta have no listening API and forbid scraping, so they are not here.
//   reddit   Reddit's OAuth API (app-only).  Query: r/smallbusiness   or   r/smallbusiness search:need a developer   or   search:looking for an AI consultant
//   hn       Hacker News through Algolia (no key).  Query: words to find in stories and comments
//   news     Google News RSS (no key).  Query: words
//   web      Brave Search (BRAVE_API_KEY).  Query: words
//   x        X's recent-search API (X_BEARER_TOKEN, a paid plan).  Query: an X search query
//   discord  A bot of ours that someone invited to the server (DISCORD_BOT_TOKEN).  Query: <server id>/<channel id>
export const KINDS = ['reddit', 'hn', 'news', 'web', 'x', 'discord'];
export const KIND_LABEL = { reddit: 'Reddit', hn: 'Hacker News', news: 'News', web: 'Web search', x: 'X', discord: 'Discord' };
export const KEY_NEEDS = { reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'], hn: [], news: [], web: ['BRAVE_API_KEY'], x: ['X_BEARER_TOKEN'], discord: ['DISCORD_BOT_TOKEN'] };
export const missingKeys = (kind, env = process.env) => (KEY_NEEDS[kind] || []).filter(k => !env[k]);

const origin = (name, dflt, env) => String(env[name] || dflt).replace(/\/$/, '');
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const unescapeHtml = v => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// feeds and comments hold escaped markup: turn it back into markup, drop the tags, then turn any entities that were left into characters
const text = (v, n) => unescapeHtml(unescapeHtml(String(v ?? '')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, n);
const iso = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const fail = (what, res, body) => Object.assign(new Error(res.status === 401 || res.status === 403 ? `${what} refused our key` : res.status === 429 ? `${what} is rate limiting us; it will be tried again later` : `${what} answered ${res.status}${body?.message ? `: ${String(body.message).slice(0, 120)}` : ''}`), { refused: res.status === 401 || res.status === 403, rateLimited: res.status === 429 });
const jget = async (fetchImpl, url, headers = {}) => { const res = await fetchImpl(url, { headers }); const body = await res.json().catch(() => ({})); return { res, body }; };

// ---------- Reddit ----------
let redditToken = { value: '', until: 0, key: '' };
async function redditAuth(env, fetchImpl) {
  const id = env.REDDIT_CLIENT_ID, secret = env.REDDIT_CLIENT_SECRET, key = `${id}:${secret}`;
  if (redditToken.value && redditToken.until > Date.now() + 30_000 && redditToken.key === key) return redditToken.value;
  const res = await fetchImpl(`${origin('REDDIT_AUTH_ORIGIN', 'https://www.reddit.com', env)}/api/v1/access_token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': env.REDDIT_USER_AGENT || 'FutureBasicsIntel/1.0' }, body: 'grant_type=client_credentials' });
  const j = await res.json().catch(() => ({})); if (!res.ok || !j.access_token) throw fail('Reddit sign-in', res, j);
  redditToken = { value: j.access_token, until: Date.now() + (Number(j.expires_in) || 3600) * 1000, key }; return j.access_token;
}
export const resetRedditToken = () => { redditToken = { value: '', until: 0, key: '' }; };
export function redditPath(query) {
  const q = String(query || '').trim(), m = /^r\/([A-Za-z0-9_]{2,21})(?:\s+search:(.+))?$/i.exec(q), s = /^search:(.+)$/i.exec(q);
  if (m && m[2]) return `/r/${m[1]}/search?q=${encodeURIComponent(m[2].trim())}&restrict_sr=1&sort=new&t=week&limit=50`;
  if (m) return `/r/${m[1]}/new?limit=50`;
  if (s) return `/search?q=${encodeURIComponent(s[1].trim())}&sort=new&t=week&limit=50`;
  return null;
}
async function reddit(watch, { env, fetchImpl }) {
  const path = redditPath(watch.query); if (!path) throw new Error('A Reddit watch looks like r/smallbusiness, r/startups search:need a developer, or search:looking for an AI consultant');
  const token = await redditAuth(env, fetchImpl), { res, body } = await jget(fetchImpl, `${origin('REDDIT_API_ORIGIN', 'https://oauth.reddit.com', env)}${path}`, { Authorization: `Bearer ${token}`, 'User-Agent': env.REDDIT_USER_AGENT || 'FutureBasicsIntel/1.0' });
  if (res.status === 401) resetRedditToken(); if (!res.ok) throw fail('Reddit', res, body);
  return (body.data?.children || []).map(c => c.data).filter(d => d && d.name && !d.stickied).map(d => ({ externalId: d.name, url: `https://www.reddit.com${d.permalink}`, author: d.author || '', title: clip(d.title, 300), body: clip(d.selftext, 4000), postedAt: iso((d.created_utc || 0) * 1000), meta: { subreddit: d.subreddit, score: d.score, comments: d.num_comments } }));
}

// ---------- Hacker News ----------
async function hn(watch, { env, fetchImpl, sinceSec }) {
  const q = clip(watch.query, 200); if (!q) throw new Error('Say what to look for on Hacker News');
  const { res, body } = await jget(fetchImpl, `${origin('HN_API_ORIGIN', 'https://hn.algolia.com', env)}/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=(story,comment)&numericFilters=${encodeURIComponent(`created_at_i>${sinceSec}`)}&hitsPerPage=50`);
  if (!res.ok) throw fail('Hacker News', res, body);
  return (body.hits || []).filter(h => h.objectID).map(h => ({ externalId: String(h.objectID), url: `https://news.ycombinator.com/item?id=${h.objectID}`, author: h.author || '', title: clip(h.title || h.story_title, 300), body: text(h.comment_text || h.story_text, 4000), postedAt: iso((h.created_at_i || 0) * 1000), meta: { points: h.points } }));
}

// ---------- News (Google News RSS) ----------
export function parseRss(xml) {
  const items = [], tag = (s, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(s); return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : ''; };
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)) { const it = m[1]; items.push({ title: text(tag(it, 'title'), 300), link: tag(it, 'link'), guid: tag(it, 'guid'), date: tag(it, 'pubDate'), description: text(tag(it, 'description'), 1000), source: text(tag(it, 'source'), 120) }); }
  return items;
}
async function news(watch, { env, fetchImpl }) {
  const q = clip(watch.query, 200); if (!q) throw new Error('Say what to look for in the news');
  const res = await fetchImpl(`${origin('NEWS_RSS_ORIGIN', 'https://news.google.com', env)}/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=en-US&gl=US&ceid=US:en`);
  if (!res.ok) throw fail('Google News', res, {});
  return parseRss(await res.text()).filter(i => i.link).map(i => ({ externalId: i.guid || i.link, url: i.link, author: i.source, title: i.title, body: i.description, postedAt: iso(i.date), meta: {} }));
}

// ---------- Web search (Brave) ----------
async function web(watch, { env, fetchImpl }) {
  const q = clip(watch.query, 200); if (!q) throw new Error('Say what to search the web for');
  const { res, body } = await jget(fetchImpl, `${origin('BRAVE_API_ORIGIN', 'https://api.search.brave.com', env)}/res/v1/web/search?q=${encodeURIComponent(q)}&freshness=pw&count=20`, { 'X-Subscription-Token': env.BRAVE_API_KEY, Accept: 'application/json' });
  if (!res.ok) throw fail('Brave Search', res, body);
  return (body.web?.results || []).filter(r => r.url).map(r => ({ externalId: r.url, url: r.url, author: clip(r.profile?.name || new URL(r.url).host, 120), title: text(r.title, 300), body: text(r.description, 1000), postedAt: iso(r.page_age) || null, meta: {} }));
}

// ---------- X ----------
async function x(watch, { env, fetchImpl }) {
  const q = clip(watch.query, 480); if (!q) throw new Error('Give an X search query');
  const since = /^\d+$/.test(watch.cursor || '') ? `&since_id=${watch.cursor}` : '';
  const { res, body } = await jget(fetchImpl, `${origin('X_API_ORIGIN', 'https://api.x.com', env)}/2/tweets/search/recent?query=${encodeURIComponent(`${q} -is:retweet lang:en`)}&max_results=50&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username${since}`, { Authorization: `Bearer ${env.X_BEARER_TOKEN}` });
  if (!res.ok) throw fail('X', res, body);
  const names = new Map((body.includes?.users || []).map(u => [u.id, u.username]));
  return (body.data || []).map(t => ({ externalId: t.id, url: `https://x.com/${names.get(t.author_id) || 'i'}/status/${t.id}`, author: names.get(t.author_id) || '', title: '', body: clip(t.text, 1000), postedAt: iso(t.created_at), meta: { likes: t.public_metrics?.like_count } }));
}

// ---------- Discord ----------
async function discord(watch, { env, fetchImpl }) {
  const m = /^(\d{5,25})\/(\d{5,25})$/.exec(String(watch.query || '').trim()); if (!m) throw new Error('A Discord watch is <server id>/<channel id> (right-click, Copy ID, with Developer Mode on)');
  const after = /^\d+$/.test(watch.cursor || '') ? `&after=${watch.cursor}` : '';
  const { res, body } = await jget(fetchImpl, `${origin('DISCORD_API_ORIGIN', 'https://discord.com', env)}/api/v10/channels/${m[2]}/messages?limit=50${after}`, { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` });
  if (!res.ok) throw fail('Discord', res, body);
  return (Array.isArray(body) ? body : []).filter(g => g.id && !g.author?.bot && String(g.content || '').trim()).map(g => ({ externalId: g.id, url: `https://discord.com/channels/${m[1]}/${m[2]}/${g.id}`, author: g.author?.username || '', title: '', body: clip(g.content, 2000), postedAt: iso(g.timestamp), meta: {} }));
}

const FETCH = { reddit, hn, news, web, x, discord };
// → { items, cursor }. The cursor is where to carry on from next time (X and Discord ids); the others look back a week and rely on the dedupe.
export async function fetchSignals(watch, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!FETCH[watch.kind]) throw new Error(`Unknown source: ${watch.kind}`);
  const missing = missingKeys(watch.kind, env); if (missing.length) throw Object.assign(new Error(`${KIND_LABEL[watch.kind]} needs ${missing.join(' and ')} on the service`), { missingKeys: missing });
  const items = await FETCH[watch.kind](watch, { env, fetchImpl, sinceSec: Math.floor((now - 7 * 86400_000) / 1000) });
  let cursor = watch.cursor || '';
  if (watch.kind === 'x' || watch.kind === 'discord') { const ids = items.map(i => i.externalId).filter(v => /^\d+$/.test(v)); if (ids.length) cursor = ids.reduce((a, b) => (BigInt(a || 0) > BigInt(b) ? a : b), cursor || '0'); }
  return { items, cursor };
}
