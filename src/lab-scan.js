// The Design Lab's scanner: reads the public web for what each watched brand makes and what is selling, and keeps the facts and a link.
//
// How it reads a brand, in order, stopping when it has enough:
//   1. the shop's own product feed (Shopify shops publish /products.json: names, prices, pictures, which sizes are still in stock);
//   2. the shop's own pages (structured product data on the home page and its category / "new in" pages, or the AI picking products out of the page);
//   3. when the site refuses us, has no feed, or is behind a bot wall: ordinary web search and image search for the brand's new pieces.
// It obeys robots.txt, says who it is, goes slowly, caps what it takes, and never copies a picture: an item holds the address of the picture on its own site.
import { safeFetch, cleanSiteUrl } from './proto-crawl.js';
import { isListicle, decodeEntities, braveSearch } from './proto-leads.js';
import { ask as realAsk, providerReady, costCents } from './intel-llm.js';
import { CATEGORY_IDS, categorize, cleanCategory, parseRobots, robotsAllows, shopifyItems, jsonLdProducts, openGraphItem, shopLinks, brandCodeWords, toCents, DEFAULT_BRAND_CODE } from './lab.js';

export const LAB_UA = 'Mozilla/5.0 (compatible; FutureBasicsLab/1.0; +https://thefuturebasics.com)';
const ENOUGH = 3, MAX_ITEMS = 300, READ_BATCH = 20, MAX_READS = 60;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const nap = ms => new Promise(r => setTimeout(r, ms));

// One address, the same way every time: no fragment, no tracking tags.
export function normUrl(u) {
  try { const x = new URL(u); x.hash = ''; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(k)) x.searchParams.delete(k); return x.toString().replace(/\/$/, ''); } catch { return ''; }
}

// ---- fetching, politely -----------------------------------------------------------------------------------------------------------------------
function fetcher(d) {
  const opts = { ...(d.crawlOpts || {}), userAgent: LAB_UA }; let last = 0;
  return async (url, extra = {}) => {
    const wait = (d.delayMs ?? 700) - (Date.now() - last); if (wait > 0) await (d.sleep || nap)(wait);
    last = Date.now();
    return safeFetch(url, { ...opts, ...extra });
  };
}
const blockedStatus = s => s === 401 || s === 403 || s === 429 || s === 451 || s === 503;
const botWall = text => /(captcha|access denied|are you a (robot|human)|unusual traffic|verify you are human|px-captcha|cf-chl|just a moment\.\.\.|attention required)/i.test(String(text || '').slice(0, 6000));

async function readRobots(origin, get) {
  try {
    const r = await get(`${origin}/robots.txt`, { accept: 'text/plain,*/*;q=0.5', maxBytes: 300_000 });
    if (r.status >= 500 || blockedStatus(r.status)) return { robots: { rules: [] }, unreachable: true };
    if (!r.ok || /<html/i.test(r.text.slice(0, 400))) return { robots: { rules: [] } }; // no robots.txt: nothing is off limits
    return { robots: parseRobots(r.text) };
  } catch { return { robots: { rules: [] }, unreachable: true }; }
}

// ---- 1. the shop's own feed -------------------------------------------------------------------------------------------------------------------
async function feedItems(origin, robots, get, now) {
  if (!robotsAllows(robots, '/products.json')) return { items: [], skipped: 'robots' };
  const items = []; let blocked = false;
  for (let page = 1; page <= 3 && items.length < MAX_ITEMS; page++) {
    let r; try { r = await get(`${origin}/products.json?limit=250&page=${page}`, { accept: 'application/json', maxBytes: 4_000_000 }); } catch { blocked = page === 1; break; }
    if (blockedStatus(r.status)) { blocked = true; break; }
    if (!r.ok || !/^\s*[{[]/.test(r.text)) break; // not a Shopify shop
    let j; try { j = JSON.parse(r.text); } catch { break; }
    const got = shopifyItems(j, origin, { now }); if (!got.length) break;
    items.push(...got); if ((j.products || []).length < 250) break;
  }
  return { items: items.slice(0, MAX_ITEMS), blocked };
}

// ---- 2. the shop's own pages ------------------------------------------------------------------------------------------------------------------
// The links on a page that look like products, with their words and picture: what the AI is given to pick real products out of an ordinary page.
export function pageDigest(html, pageUrl, max = 60) {
  let host; try { host = new URL(pageUrl).hostname; } catch { return []; }
  const seen = new Set(), out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"#]+)"[^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    let u; try { u = new URL(decodeEntities(m[1]), pageUrl); } catch { continue; } if (!['http:', 'https:'].includes(u.protocol) || u.hostname !== host) continue;
    const key = normUrl(u.toString()); if (!key || seen.has(key) || u.pathname === '/') continue;
    if (/\/(cart|account|login|search|help|policy|policies|about|contact|stores?|gift|careers|collections?\/?$|pages)\b/i.test(u.pathname)) continue;
    const text = clip(decodeEntities(m[2].replace(/<[^>]+>/g, ' ')), 120), img = /<img\b[^>]*?(?:data-src|src)\s*=\s*"([^"]+)"/i.exec(m[2]);
    if (!text && !img) continue;
    let image = ''; if (img) { try { image = new URL(decodeEntities(img[1]), pageUrl).toString(); } catch { /* no picture */ } }
    seen.add(key); out.push({ url: key, text, image }); if (out.length >= max) break;
  }
  return out;
}

async function pageItems(site, origin, robots, get, ai) {
  const items = [], tried = [];
  let home; try { home = await get(site); } catch (e) { return { items, blocked: true, why: e.message }; }
  if (blockedStatus(home.status) || botWall(home.text)) return { items, blocked: true, why: `the site answered ${home.status}` };
  const pages = [{ r: home }];
  for (const link of shopLinks(home.text, home.url, 2)) {
    let path; try { path = new URL(link).pathname + new URL(link).search; } catch { continue; }
    if (!robotsAllows(robots, path)) continue;
    try { const r = await get(link); if (r.ok && !botWall(r.text)) pages.push({ r }); } catch { /* a page that will not load is skipped */ }
  }
  for (const { r } of pages) {
    tried.push(r.url);
    const ld = jsonLdProducts(r.text, r.url); items.push(...ld);
    if (!ld.length && ai) {
      const digest = pageDigest(r.text, r.url); if (digest.length < 4) continue;
      const picked = await ai.pickProducts(digest, new URL(r.url).hostname);
      items.push(...picked);
    }
  }
  return { items, blocked: false, tried };
}

// ---- 3. search --------------------------------------------------------------------------------------------------------------------------------
export async function braveImages(q, { env = process.env, fetchImpl = fetch, count = 20 } = {}) {
  if (!env.BRAVE_API_KEY) throw new Error('Web search is not connected (the service needs BRAVE_API_KEY)');
  const origin = String(env.BRAVE_API_ORIGIN || 'https://api.search.brave.com').replace(/\/$/, '');
  const res = await fetchImpl(`${origin}/res/v1/images/search?${new URLSearchParams({ q, count: String(count), country: 'us', safesearch: 'moderate' })}`, { headers: { 'X-Subscription-Token': env.BRAVE_API_KEY, Accept: 'application/json' } }).catch(() => { throw new Error('Image search could not be reached'); });
  if (res.status === 401 || res.status === 403) throw new Error('Brave Search refused the key');
  if (res.status === 429) throw new Error('The search allowance for now is used up: try again later');
  if (!res.ok) throw new Error(`Image search answered ${res.status}`);
  const j = await res.json().catch(() => ({}));
  return (j.results || []).map(r => ({ title: decodeEntities(String(r.title || '').replace(/<[^>]+>/g, '')), url: r.url, imageUrl: r.thumbnail?.src || r.properties?.url || '', source: r.source || '' })).filter(r => r.url && r.imageUrl);
}
const SEARCH_TERMS = ['new arrivals', 'bestsellers', 'jacket', 'knit sweater', 'cap', 'sneaker'];
async function searchItems(brand, d, queries) {
  const { env, fetchImpl, braveSearchImpl, braveImagesImpl } = d, items = [], errors = [];
  let host = ''; try { host = new URL(brand.site).hostname.replace(/^www\./, ''); } catch { /* no site */ }
  const webQs = [host ? `site:${host} new arrivals` : `"${brand.name}" new arrivals`, `"${brand.name}" bestsellers`, `"${brand.name}" new collection`, `"${brand.name}" best selling jacket knit cap sneaker`].slice(0, queries.web);
  const imgQs = SEARCH_TERMS.slice(0, queries.image).map(t => `${brand.name} ${t}`);
  for (const q of webQs) {
    try { for (const r of await braveSearchImpl(q, { env, fetchImpl, count: 20 })) { if (isListicle(r.title)) continue; const url = normUrl(r.url); if (url) items.push({ url, title: clip(r.title, 200), imageUrl: '', priceCents: null, currency: 'USD', category: categorize({ title: r.title }), productType: '', vendor: brand.name, tags: [], description: clip(r.description, 400), publishedAt: null, sellthrough: null, source: 'search' }); } }
    catch (e) { errors.push(e.message); if (/refused|allowance/.test(e.message)) break; }
  }
  for (const q of imgQs) {
    try { for (const r of await braveImagesImpl(q, { env, fetchImpl, count: 20 })) { const url = normUrl(r.url); if (url) items.push({ url, title: clip(r.title, 200), imageUrl: clip(r.imageUrl, 600), priceCents: null, currency: 'USD', category: categorize({ title: r.title }), productType: '', vendor: brand.name, tags: [], description: '', publishedAt: null, sellthrough: null, source: 'image' }); } }
    catch (e) { errors.push(e.message); if (/refused|allowance/.test(e.message)) break; }
  }
  return { items, errors };
}

// ---- reading with the AI ----------------------------------------------------------------------------------------------------------------------
// The test stand-in: a predictable answer built from the words in the listing.
export function labFixture({ user }) {
  const items = [...String(user).matchAll(/^#(\d+) \| ([^|\n]*)\|/gm)].map(m => ({ i: Number(m[1]), title: m[2].trim() }));
  if (/Which of these links/.test(user)) return { products: [...String(user).matchAll(/^L(\d+) \| (\S+) \| ([^\n]*)$/gm)].filter(m => /product|\/p\//i.test(m[2])).map(m => ({ n: Number(m[1]), title: m[3].replace(/ \|.*$/, '').trim() || 'Product', price: '', category: categorize({ title: m[3] }) })) };
  return { items: items.map(x => ({ i: x.i, product: !/\b(guide|review|how to|best \d+)\b/i.test(x.title), category: categorize({ title: x.title }), silhouette: /oversiz|relax/i.test(x.title) ? 'relaxed' : 'regular', fabric: /knit|wool/i.test(x.title) ? 'wool blend' : 'cotton', colors: ['navy'], details: ['small embroidered mark'], fit: 'regular', season: 'all year', summary: `${x.title}: a stand-in read for the tests.` })) };
}
export function makeReader(d) {
  const { env, askImpl, code } = d, state = { cents: 0, calls: 0, failed: '' };
  const ready = providerReady('anthropic', env);
  const system = `You are the product analyst on the Future Basics design team. Future Basics makes affordable, considered clothing and accessories.\n${brandCodeWords(code || DEFAULT_BRAND_CODE)}\nYou read listings other brands put on the public web and describe the PRODUCT in plain design words. Describe only what the listing says or shows by name; leave a field empty rather than guess. Never invent a price.`;
  async function call(user, fixture, maxTokens) {
    state.calls++; const r = await askImpl({ provider: 'anthropic', system, user, json: true, maxTokens, env, fixture }); state.cents += costCents('anthropic', r.usage?.input || 0, r.usage?.output || 0, env); return r.json || {};
  }
  return {
    ready, state,
    // Attributes for a batch of items: category, silhouette, fabric, colours, details, fit, season and a one-line summary. Search results that are not a single product are dropped.
    async read(items) {
      const out = new Map(); if (!ready) return out;
      for (let at = 0; at < items.length && at < MAX_READS; at += READ_BATCH) {
        const batch = items.slice(at, at + READ_BATCH);
        const lines = batch.map((x, n) => `#${n + 1} | ${clip(x.title, 140)} | brand: ${clip(x.vendor, 40)} | ${x.priceCents ? '$' + (x.priceCents / 100).toFixed(0) : 'no price'} | type: ${clip(x.productType, 40)} | ${clip(x.description, 220)}`);
        const user = `For each numbered listing answer {"items":[{"i":number,"product":true if it is ONE product that is sold (false for an article, a list, a collection page or a store page),"category":one of ${CATEGORY_IDS.join('|')},"silhouette":"short","fabric":"short, only if stated","colors":["names"],"details":["up to 4 design details"],"fit":"short","season":"short","summary":"one sentence for a designer"}]}\n\n${lines.join('\n')}`;
        try { const j = await call(user, labFixture, 4000); for (const r of j.items || []) { const x = batch[Number(r.i) - 1]; if (x) out.set(x, r); } }
        catch (e) { state.failed = e.message; break; }
      }
      return out;
    },
    // Pick the real products out of the links on an ordinary page.
    async pickProducts(digest, host) {
      if (!ready) return [];
      const user = `Which of these links on ${host} are individual products for sale? Answer {"products":[{"n":number,"title":"product name","price":"number or empty","category":"${CATEGORY_IDS.join('|')}"}]}. Skip navigation, collections, articles and anything that is not one product.\n\n${digest.map((x, n) => `L${n + 1} | ${x.url} | ${x.text}`).join('\n')}`;
      try {
        const j = await call(user, labFixture, 3000);
        return (j.products || []).map(p => { const src = digest[Number(p.n) - 1]; if (!src) return null; return { url: src.url, title: clip(p.title || src.text, 200), imageUrl: src.image, priceCents: toCents(p.price), currency: 'USD', category: cleanCategory(p.category) || categorize({ title: p.title || src.text }), productType: '', vendor: host.replace(/^www\./, ''), tags: [], description: '', publishedAt: null, sellthrough: null, source: 'page' }; }).filter(Boolean);
      } catch (e) { state.failed = e.message; return []; }
    }
  };
}

// ---- keeping what was found -------------------------------------------------------------------------------------------------------------------
export async function upsertItems(pool, brandId, items) {
  let added = 0;
  for (const it of items) {
    const url = normUrl(it.url); if (!url || !it.title) continue;
    const attrs = it.attrs && Object.keys(it.attrs).length ? it.attrs : null;
    const r = await pool.query(
      `insert into lab_items(brand_id,source,url,title,image_url,price_cents,currency,category,attrs,sellthrough,heat,summary,published_at,read_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::jsonb,'{}'::jsonb),$10::jsonb,$11,$12,$13,case when $9::jsonb is null then null else now() end)
       on conflict (url) do update set last_seen_at=now(), title=excluded.title,
         image_url=case when excluded.image_url<>'' then excluded.image_url else lab_items.image_url end,
         price_cents=coalesce(excluded.price_cents, lab_items.price_cents),
         sellthrough=coalesce(excluded.sellthrough, lab_items.sellthrough), heat=coalesce(excluded.heat, lab_items.heat),
         category=case when excluded.category<>'other' then excluded.category else lab_items.category end,
         attrs=case when $9::jsonb is null then lab_items.attrs else excluded.attrs end,
         summary=case when excluded.summary<>'' then excluded.summary else lab_items.summary end,
         read_at=coalesce(case when $9::jsonb is null then null else now() end, lab_items.read_at)
       returning (xmax = 0) as inserted`,
      [brandId, it.source || 'feed', url, clip(it.title, 200), clip(it.imageUrl, 600), it.priceCents ?? null, clip(it.currency, 3) || 'USD', cleanCategory(it.category) || 'other', attrs ? JSON.stringify(attrs) : null,
        it.sellthrough ? JSON.stringify(it.sellthrough) : null, it.sellthrough?.heat ?? null, clip(it.summary, 400), it.publishedAt || null]);
    if (r.rows[0]?.inserted) added++;
  }
  return added;
}
const attrsOf = r => ({ silhouette: clip(r.silhouette, 80), fabric: clip(r.fabric, 120), colors: (Array.isArray(r.colors) ? r.colors : []).slice(0, 6).map(c => clip(c, 30)), details: (Array.isArray(r.details) ? r.details : []).slice(0, 5).map(c => clip(c, 100)), fit: clip(r.fit, 60), season: clip(r.season, 40) });

// ---- scanning one brand -----------------------------------------------------------------------------------------------------------------------
export async function dailyCents(pool) { return Number((await pool.query(`select coalesce(sum(cost_cents),0) c from lab_scans where started_at > now() - interval '24 hours'`)).rows[0].c) || 0; }

export async function scanBrand(pool, brand, d = {}) {
  const env = d.env || process.env, now = d.now || new Date();
  const deps = { env, fetchImpl: d.fetchImpl || fetch, askImpl: d.askImpl || realAsk, braveSearchImpl: d.braveSearchImpl, braveImagesImpl: d.braveImagesImpl, crawlOpts: d.crawlOpts, sleep: d.sleep, delayMs: d.delayMs ?? Number(env.LAB_FETCH_DELAY_MS ?? 700), code: d.code };
  deps.braveSearchImpl ||= braveSearch; deps.braveImagesImpl ||= braveImages;
  const t0 = Date.now(), get = fetcher(deps), notes = [];
  const scan = (await pool.query(`insert into lab_scans(brand_id, by_user) values($1,$2) returning id`, [brand.id, d.by || null])).rows[0].id;
  const budget = Number(env.LAB_DAILY_CENTS ?? 200), spent = await dailyCents(pool);
  const reader = makeReader({ ...deps, askImpl: deps.askImpl }), aiOn = reader.ready && spent < budget;
  if (reader.ready && !aiOn) notes.push(`The daily AI allowance (${budget}¢) is used, so items were saved without a design read`);
  let items = [], method = '', blocked = false;
  try {
    const site = brand.site ? cleanSiteUrl(brand.site) : null;
    if (site && !site.error) {
      const origin = new URL(site.url).origin, { robots, unreachable } = await readRobots(origin, get);
      if (unreachable) { blocked = true; notes.push('The site would not let us read it'); }
      else if (!robotsAllows(robots, new URL(site.url).pathname || '/')) notes.push('The site\'s robots.txt asks robots to stay away, so nothing was read from it directly');
      else {
        const feed = await feedItems(origin, robots, get, now);
        if (feed.items.length) { items = feed.items.map(i => ({ ...i, source: 'feed' })); method = 'feed'; }
        else {
          if (feed.skipped === 'robots') notes.push('The site asks robots not to read its product feed');
          if (feed.blocked) { blocked = true; notes.push('The site refused the product feed'); }
          const pg = await pageItems(site.url, origin, robots, get, aiOn ? reader : null);
          if (pg.items.length) { items = pg.items.map(i => ({ ...i, source: 'page' })); method = 'pages'; } else if (pg.blocked) { blocked = true; notes.push(`The site blocked automatic reading${pg.why ? ' (' + pg.why + ')' : ''}`); }
        }
      }
    } else if (site?.error) notes.push(site.error);
    if (method !== 'feed' && items.length < ENOUGH) { // a shop's own feed is the whole shop: search only fills in when the shop itself gave little
      const had = items.length;
      const found = await searchItems(brand, deps, { web: Number(env.LAB_WEB_QUERIES ?? 4), image: Number(env.LAB_IMAGE_QUERIES ?? 3) });
      if (found.items.length) { items = [...items, ...found.items]; method = method ? `${method}+search` : 'search'; notes.push(had ? 'Filled in with web and image search' : blocked ? 'The site blocks automatic reading, so this came from web and image search' : 'Read through web and image search'); }
      for (const e of found.errors.slice(0, 1)) notes.push(e);
    }
    // de-duplicate, then give the AI a look at the freshest and the hottest
    const byUrl = new Map(); for (const it of items) { const k = normUrl(it.url); if (k && !byUrl.has(k)) byUrl.set(k, it); }
    items = [...byUrl.values()].slice(0, MAX_ITEMS);
    let drop = new Set();
    if (aiOn && items.length) {
      const order = [...items].sort((a, b) => (b.sellthrough?.heat ?? -1) - (a.sellthrough?.heat ?? -1) || (a.source === 'image' ? 1 : 0) - (b.source === 'image' ? 1 : 0));
      const read = await reader.read(order);
      for (const [it, r] of read) {
        if (r.product === false && (it.source === 'search' || it.source === 'image')) { drop.add(it); continue; }
        it.attrs = attrsOf(r); it.summary = clip(r.summary, 400) || it.summary; const c = cleanCategory(r.category); if (c && (it.category === 'other' || it.source === 'search' || it.source === 'image')) it.category = c;
      }
      if (reader.state.failed) notes.push(`The design read stopped: ${reader.state.failed}`);
    }
    items = items.filter(i => !drop.has(i));
    const added = await upsertItems(pool, brand.id, items);
    const note = [...new Set(notes)].join('. ');
    await pool.query(`update lab_scans set finished_at=now(), method=$2, found=$3, added=$4, blocked=$5, note=$6, cost_cents=$7 where id=$1`, [scan, method, items.length, added, blocked, note.slice(0, 500), reader.state.cents]);
    await pool.query(`update lab_brands set last_scanned_at=now(), last_scan_note=$2 where id=$1`, [brand.id, (method ? `${items.length} found${added ? `, ${added} new` : ''}. ` : 'Nothing found. ') + note.slice(0, 300)]);
    return { id: scan, brand: brand.name, method, found: items.length, added, blocked, note, costCents: reader.state.cents, ms: Date.now() - t0 };
  } catch (e) {
    await pool.query(`update lab_scans set finished_at=now(), blocked=$2, note=$3, cost_cents=$4 where id=$1`, [scan, blocked, String(e.message).slice(0, 300), reader.state.cents]).catch(() => {});
    await pool.query(`update lab_brands set last_scanned_at=now(), last_scan_note=$2 where id=$1`, [brand.id, `The scan failed: ${String(e.message).slice(0, 200)}`]).catch(() => {});
    throw e;
  }
}

// Brands that have not been looked at lately, a few at a time, so the library keeps itself fresh without a person pressing anything.
export async function scanDue(pool, d = {}, { limit = 3, hours = 72 } = {}) {
  const due = (await pool.query(`select * from lab_brands where enabled and (last_scanned_at is null or last_scanned_at < now() - ($1 || ' hours')::interval) order by last_scanned_at nulls first, created_at limit $2`, [String(hours), limit])).rows;
  const out = [];
  for (const b of due) { try { out.push(await scanBrand(pool, b, d)); } catch (e) { out.push({ brand: b.name, error: e.message }); d.log?.warn?.({ err: e.message, brand: b.name }, 'design lab scan failed'); } }
  return out;
}
export async function purgeOld(pool, days = 120) { return (await pool.query(`delete from lab_items where status='new' and last_seen_at < now() - ($1 || ' days')::interval`, [String(days)])).rowCount; }

// ---- adding one piece by its address ----------------------------------------------------------------------------------------------------------
export async function addByUrl(pool, input, d = {}) {
  const env = d.env || process.env, c = cleanSiteUrl(input); if (c.error) return { error: c.error };
  const deps = { env, askImpl: d.askImpl || realAsk, crawlOpts: d.crawlOpts, delayMs: 0, code: d.code }, get = fetcher(deps), origin = new URL(c.url).origin;
  const { robots } = await readRobots(origin, get); const u = new URL(c.url);
  if (!robotsAllows(robots, u.pathname + u.search)) return { error: 'That site asks robots not to read this page. Search for the piece by name instead.' };
  let r; try { r = await get(c.url); } catch (e) { return { error: e.message }; }
  if (blockedStatus(r.status) || botWall(r.text)) return { error: 'That site blocks automatic reading. Add it by searching for the piece by name, or save a picture of it in the library notes.' };
  if (!r.ok) return { error: `The page answered ${r.status}` };
  const item = jsonLdProducts(r.text, r.url)[0] || openGraphItem(r.text, r.url); if (!item) return { error: 'No product could be found on that page' };
  item.url = normUrl(r.url) || item.url; item.source = 'manual';
  const reader = makeReader(deps); if (reader.ready) { const m = await reader.read([item]); const x = m.get(item); if (x) { item.attrs = attrsOf(x); item.summary = clip(x.summary, 400); const cat = cleanCategory(x.category); if (cat) item.category = cat; } }
  const host = origin.replace(/^https?:\/\/(www\.)?/, ''), b = (await pool.query(`select id from lab_brands where regexp_replace(lower(site),'^https?://(www\\.)?','') like $1 || '%' limit 1`, [host.toLowerCase()])).rows[0];
  if (b) { const bs = (await pool.query('select site from lab_brands where id=$1', [b.id])).rows[0]?.site; try { const bh = new URL(bs).hostname, ih = new URL(item.url); if (bh.replace(/^www\./, '') === ih.hostname.replace(/^www\./, '')) { ih.hostname = bh; item.url = normUrl(ih.toString()); } } catch { /* keep the page's own address */ } }
  await upsertItems(pool, b?.id || null, [item]);
  const row = (await pool.query('select id from lab_items where url=$1', [item.url])).rows[0];
  return { id: row?.id, title: item.title };
}
