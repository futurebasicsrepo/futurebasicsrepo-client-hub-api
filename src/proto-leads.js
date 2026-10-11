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
const DIRECTORY = /(^|\.)(yelp|angi|angieslist|homeadvisor|thumbtack|facebook|instagram|yellowpages|bbb|mapquest|nextdoor|houzz|porch|google|linkedin|indeed|wikipedia|reddit|youtube|tripadvisor|manta|chamberofcommerce|expertise|bark|fixr|networx|homeguide|forbes|care|caring|seniorly|agingcare|aplaceformom|glassdoor|ziprecruiter|pinterest|twitter|x|tiktok|amazon|yahoo|bing|nytimes|usnews|consumeraffairs|trustpilot|buildzoom|superpages|citysearch|merchantcircle|alignable|birdeye|zoominfo|dnb|bizapedia|cylex|hotfrog|showmelocal|ezlocal|patch|craigslist|lowes|homedepot|sears|angi|servicemagic|phillymag|inquirer|bestpickreports|threebestrated|bestprosintown|homeblue|findlocal|costhelper|bobvila|thisoldhouse|familyhandyman|nicelocal|bestcompany|trustedpros|taskrabbit|handy|lawnstarter|whitepages|opendi|brownbook|tuugo|mrrooter|rotorooter|rooterman|benjaminfranklinplumbing|onehourheatandair|bluefrog|servpro|stanleysteemer|chemdry|merrymaids|mollymaid|maidpro|visitingangels|brightstar|homeinstead|comfortkeepers|rightathome|seniorhelpers|griswoldhomecare|caringseniorservice)\.[a-z.]+$/i;
// A search result that is a ranking or a list of businesses, not a business ("Top 10 plumbers in Philadelphia", "Best electricians near me", "… reviews").
export const isListicle = title => /^\s*(the\s+)?(top|best)\s+\d+|\b\d+\s+best\b|\b(top|best)\s+(rated\s+)?[\w-]+(\s+[\w-]+)?\s+(in|near|for)\b|\bnear me\b|\b(reviews?|rankings?|directory|compared?|comparison|list of|how to choose|cost of)\b/i.test(String(title || ''));
// HTML entities in text that came through a search result ("Jersey&#x27;s").
export function decodeEntities(t) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', ndash: '–', mdash: '—', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '…' };
  return String(t ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => { if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; } return named[e.toLowerCase()] ?? m; });
}
const clipWords = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const cut = s.slice(0, n), sp = cut.lastIndexOf(' '); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…'; };
export const isDirectory = host => DIRECTORY.test(String(host || '').toLowerCase()) || /\.(gov|edu|mil)$/i.test(host);

export async function braveSearch(q, { env = process.env, fetchImpl = fetch, count = 20 } = {}) {
  if (!env.BRAVE_API_KEY) throw new Error('Web search is not connected (the service needs BRAVE_API_KEY)');
  const origin = String(env.BRAVE_API_ORIGIN || 'https://api.search.brave.com').replace(/\/$/, '');
  const res = await fetchImpl(`${origin}/res/v1/web/search?${new URLSearchParams({ q, count: String(count), country: 'us', safesearch: 'moderate' })}`, { headers: { 'X-Subscription-Token': env.BRAVE_API_KEY, Accept: 'application/json' } }).catch(() => { throw new Error('Web search could not be reached'); });
  if (res.status === 401 || res.status === 403) throw new Error('Brave Search refused the key');
  if (res.status === 429) throw new Error('The web search allowance for now is used up: try again later');
  if (!res.ok) throw new Error(`Web search answered ${res.status}`);
  const j = await res.json().catch(() => ({})); return (j.web?.results || []).map(r => ({ title: decodeEntities(String(r.title || '').replace(/<[^>]+>/g, '')), url: r.url, description: decodeEntities(String(r.description || '').replace(/<[^>]+>/g, '')) })).filter(r => r.url);
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
    if (!urls && (isDirectory(c.host) || isListicle(f.title))) { skipped.directories++; continue; }
    if (seen.has(c.host)) { skipped.duplicates++; continue; } seen.add(c.host);
    if (exclude.has(c.host)) { skipped.known++; continue; }
    cands.push({ host: c.host, url: new URL(c.url).origin + '/', title: f.title, snippet: clipWords(f.description, 170) });
  }
  const list = cands.slice(0, max); let done = 0; onStep(`Checking ${list.length} sites`);
  const items = await pool(list, 4, async c => {
    const a = await quickAudit(c.url, { crawlOpts }); done++; if (done % 4 === 0) onStep(`Checked ${done} of ${list.length}`);
    if (!a.reachable) return { ...c, name: c.host, reachable: false, error: a.error, score: null, grade: 'down', quickTurn: false, top: [], industry: trade, fit: 'match', lead: true, reason: '' };
    const ind = detectIndustry(a.facts, ''), ar = a.audit, confident = ind.confidence >= .5, key = confident ? ind.key : trade, city = cityOf(a.facts);
    const fit = trade === 'trade' || !confident || ind.key === trade || (RELATED[trade] || []).includes(ind.key) ? 'match' : 'other', good = ar.grade === 'good';
    const reason = good ? `Already a good site (${ar.score})` : fit === 'other' ? `Looks like ${industryByKey(ind.key).label.split(' (')[0].toLowerCase()} work, not ${industryByKey(trade).label.split(' (')[0].toLowerCase()}` : '';
    return { ...c, reachable: true, name: guessName(a.facts, c, { place, city, trade }), phone: a.facts.phones[0] || '', email: a.facts.emails[0] || '', city, score: ar.score, grade: ar.grade, quickTurn: ar.quickTurn, top: ar.top.slice(0, 3), industry: key, industryLabel: industryByKey(key).label, generator: a.facts.generator, fit, lead: !good && fit === 'match', reason };
  });
  // worth a call first (worst reachable quick-turn sites, then the bigger jobs), then the sites that could not be read, then the ones that look fine or are another trade
  const rank = i => !i.reachable ? 2000 : i.lead ? (i.quickTurn ? 0 : 1000) + i.score : 3000 + (i.fit === 'other' ? 500 : 0) + i.score;
  items.sort((a, b) => rank(a) - rank(b));
  return { items, queries, skipped, considered: cands.length };
}
// Trades that do each other's work, so a plumber who also does heating is still a plumber.
const RELATED = { plumbing: ['hvac'], hvac: ['plumbing', 'electrician'], electrician: ['hvac'], roofing: ['carpentry'], carpentry: ['roofing', 'painting'], painting: ['carpentry'] };
// The words that make a page title a search phrase ("Expert Plumbing Services In Philadelphia, PA") instead of a business name.
const FILLER = new Set(('plumber plumbers plumbing electrician electricians electrical electric hvac heating cooling air conditioning ac furnace boiler roofer roofers roofing roof carpenter carpenters carpentry remodeling remodeler remodelers contractor contractors construction painter painters painting cleaning cleaners cleaner maids maid landscaping landscape lawn care home health senior seniors caregivers caregiver drain drains sewer repair repairs installation install service services company companies co inc llc the and of in near for your my our local best top expert experts professional professionals affordable licensed insured emergency hour quality trusted reliable residential commercial 24 7 a at to with by on is we are home page homepage welcome').split(' '));
const STATES = new Set('al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' '));
export function isGenericName(t, { place = '', city = '' } = {}) {
  const where = new Set(`${place} ${city}`.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 1));
  return !String(t).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).some(w => w.length > 1 && !FILLER.has(w) && !where.has(w) && !STATES.has(w));
}
// The business's own name: structured data first, then the site name, then the title, then the first heading, then what the search showed; the address itself when all of those read like a search phrase.
export function guessName(f, c, ctx = {}) {
  const parts = t => decodeEntities(t).split(/\s[|–—:·•]\s|\s-\s|\s\/\s/).map(x => x.replace(/^\s*welcome to\s+/i, '').replace(/[\s,.|–—-]+$/, '').trim());
  const cands = [f.ldName, f.siteName, ...parts(f.ogTitle || ''), ...parts(f.title || ''), ...(f.h1 || []).slice(0, 1).flatMap(parts), ...parts(c.title || '')].filter(Boolean).map(x => decodeEntities(x).replace(/^\s*welcome to\s+/i, '').trim());
  return cands.find(x => x.length >= 3 && x.length <= 60 && !isGenericName(x, ctx)) || c.host;
}
const cityOf = f => { const m = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)*),? ([A-Z]{2})\b(?: \d{5})?/.exec(`${f.address || ''} ${f.title || ''} ${f.description || ''} ${(f.text || '').slice(0, 1500)}`); return m ? `${m[1]}, ${m[2]}` : ''; };

// Worth a call: not already good, and the right trade. (Older saved searches have no flag, so the score decides.)
export const isLead = i => i.reachable === false ? true : i.lead ?? Number(i.score) < 80;
