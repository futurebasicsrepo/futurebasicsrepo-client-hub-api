// Finding leads: tired websites of small trades in a town. A search by trade and town (Brave Search) or a pasted list of addresses is turned into a ranked list,
// worst site first, each already audited with the free audit (no AI), so a rep can see who is worth a call before anything is built.
import { safeFetch, extractFacts, auditSite, cleanSiteUrl } from './proto-crawl.js';
import { detectIndustry, industryByKey } from './proto-industry.js';

// What to search for, per trade (two phrasings, so one listing style does not hide the rest).
export const SEARCH_TERMS = {
  plumbing: ['plumber', 'plumbing company'], electrician: ['electrician', 'electrical contractor'], hvac: ['hvac contractor', 'heating and air conditioning'], roofing: ['roofing contractor', 'roofer'],
  carpentry: ['carpenter', 'remodeling contractor'], 'home-health': ['home health care agency', 'in-home senior care'], landscaping: ['landscaping company', 'lawn care service'], painting: ['house painter', 'painting contractor'],
  cleaning: ['house cleaning service', 'cleaning company'], trade: ['home services contractor', 'local contractor']
};
// Listings, directories, social networks and marketplaces: their pages are not the business's own site.
const DIRECTORY = /(^|\.)(yelp|angi|angieslist|homeadvisor|thumbtack|facebook|instagram|yellowpages|bbb|mapquest|nextdoor|houzz|porch|google|linkedin|indeed|wikipedia|reddit|youtube|tripadvisor|manta|chamberofcommerce|expertise|bark|fixr|networx|homeguide|forbes|care|caring|seniorly|agingcare|aplaceformom|glassdoor|ziprecruiter|pinterest|twitter|x|tiktok|amazon|yahoo|bing|nytimes|usnews|consumeraffairs|trustpilot|buildzoom|superpages|citysearch|merchantcircle|alignable|birdeye|zoominfo|dnb|bizapedia|cylex|hotfrog|showmelocal|ezlocal|patch|craigslist|lowes|homedepot|sears|angi|servicemagic|mrrooter|rotorooter|rooterman|benjaminfranklinplumbing|onehourheatandair|bluefrog|servpro|stanleysteemer|chemdry|merrymaids|mollymaid|maidpro|visitingangels|brightstar|homeinstead|comfortkeepers|rightathome|seniorhelpers|griswoldhomecare|caringseniorservice)\.[a-z.]+$/i;
export const isDirectory = host => DIRECTORY.test(String(host || '').toLowerCase()) || /\.(gov|edu|mil)$/i.test(host);

export async function braveSearch(q, { env = process.env, fetchImpl = fetch, count = 20 } = {}) {
  if (!env.BRAVE_API_KEY) throw new Error('Web search is not connected (the service needs BRAVE_API_KEY)');
  const origin = String(env.BRAVE_API_ORIGIN || 'https://api.search.brave.com').replace(/\/$/, '');
  const res = await fetchImpl(`${origin}/res/v1/web/search?${new URLSearchParams({ q, count: String(count), country: 'us', safesearch: 'moderate' })}`, { headers: { 'X-Subscription-Token': env.BRAVE_API_KEY, Accept: 'application/json' } }).catch(() => { throw new Error('Web search could not be reached'); });
  if (res.status === 401 || res.status === 403) throw new Error('Brave Search refused the key');
  if (res.status === 429) throw new Error('The web search allowance for now is used up: try again later');
  if (!res.ok) throw new Error(`Web search answered ${res.status}`);
  const j = await res.json().catch(() => ({})); return (j.web?.results || []).map(r => ({ title: String(r.title || '').replace(/<[^>]+>/g, ''), url: r.url, description: String(r.description || '').replace(/<[^>]+>/g, '') })).filter(r => r.url);
}

// One site, home page only, fast: reachable? and the audit. A site that cannot be reached is a lead too (it may be down for good).
export async function quickAudit(url, { crawlOpts = {}, now = new Date() } = {}) {
  try {
    const r = await safeFetch(url, { timeoutMs: 8000, maxBytes: 900_000, ...crawlOpts });
    if (!r.ok) return { reachable: false, error: `The site answered ${r.status}` };
    if (r.type && !/html|xml|text/i.test(r.type)) return { reachable: false, error: 'Not a web page' };
    const facts = extractFacts(r.text, r.url, { ms: r.ms, bytes: r.bytes }); return { reachable: true, facts, audit: auditSite(facts, { now }) };
  } catch (e) { return { reachable: false, error: e.message }; }
}

async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k], k); } })); return out; }

// The ranked leads. urls (a pasted list) skips the search. exclude: hosts we already have. → { items, queries, skipped }
export async function findLeads({ trade = 'trade', place = '', urls = null, env = process.env, fetchImpl = fetch, crawlOpts = {}, max = 18, exclude = new Set(), onStep = () => {} } = {}) {
  const queries = [], found = [], skipped = { directories: 0, duplicates: 0, known: 0, invalid: 0 };
  if (urls) { for (const u of urls) found.push({ url: u, title: '', description: '' }); }
  else {
    const terms = SEARCH_TERMS[trade] || SEARCH_TERMS.trade;
    for (const t of terms) { const q = `${t} ${place}`.trim(); queries.push(q); onStep(`Searching: ${q}`); found.push(...await braveSearch(q, { env, fetchImpl })); }
  }
  const seen = new Set(), cands = [];
  for (const f of found) {
    const c = cleanSiteUrl(f.url); if (c.error) { skipped.invalid++; continue; }
    if (!urls && isDirectory(c.host)) { skipped.directories++; continue; }
    if (seen.has(c.host)) { skipped.duplicates++; continue; } seen.add(c.host);
    if (exclude.has(c.host)) { skipped.known++; continue; }
    cands.push({ host: c.host, url: new URL(c.url).origin + '/', title: f.title, snippet: f.description });
  }
  const list = cands.slice(0, max); let done = 0; onStep(`Checking ${list.length} sites`);
  const items = await pool(list, 4, async c => {
    const a = await quickAudit(c.url, { crawlOpts }); done++; if (done % 4 === 0) onStep(`Checked ${done} of ${list.length}`);
    if (!a.reachable) return { ...c, reachable: false, error: a.error, score: null, grade: 'down', quickTurn: false, top: [], industry: trade };
    const ind = detectIndustry(a.facts, ''), ar = a.audit;
    return { ...c, reachable: true, name: guessName(a.facts, c), phone: a.facts.phones[0] || '', email: a.facts.emails[0] || '', city: cityOf(a.facts), score: ar.score, grade: ar.grade, quickTurn: ar.quickTurn, top: ar.top.slice(0, 3), industry: ind.confidence >= .5 ? ind.key : trade, industryLabel: industryByKey(ind.confidence >= .5 ? ind.key : trade).label, generator: a.facts.generator };
  });
  // worst reachable quick-turn sites first, then the bigger jobs, then the sites that are down
  const rank = i => (i.reachable ? (i.quickTurn ? 0 : 1000) + i.score : 2000);
  items.sort((a, b) => rank(a) - rank(b));
  return { items, queries, skipped, considered: cands.length };
}
const guessName = (f, c) => { const t = (f.ogTitle || f.title || '').split(/\s[|–—:·-]\s|\s-\s/)[0].trim(); const h = (f.h1 || [])[0] || ''; return [t, h, String(c.title || '').split(/\s[|–—:·-]\s|\s-\s/)[0].trim()].find(x => x && x.length >= 3 && x.length <= 60 && !/^(home|welcome|untitled)/i.test(x)) || c.host; };
const cityOf = f => { const m = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)*),? ([A-Z]{2})\b(?: \d{5})?/.exec(`${f.address || ''} ${f.title || ''} ${f.description || ''} ${(f.text || '').slice(0, 1500)}`); return m ? `${m[1]}, ${m[2]}` : ''; };
