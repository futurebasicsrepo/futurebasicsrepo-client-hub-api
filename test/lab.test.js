import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, parseRobots, robotsAllows, sellThrough, heatLabel, shopifyItems, jsonLdProducts, openGraphItem, shopLinks, cleanBrandCode, brandCodeWords, cleanBrand, DEFAULT_BRAND_CODE, SEED_BRANDS, CATEGORY_IDS, toCents } from '../src/lab.js';
import { scanBrand, pageDigest, normUrl, makeReader, upsertItems } from '../src/lab-scan.js';

const NOW = new Date('2026-10-17T12:00:00Z');

test('the category comes from the shop\'s own words, most specific first', () => {
  const c = (title, type = '') => categorize({ title, type });
  assert.equal(c('Garment-Dyed Heavyweight Tee'), 'tops'); assert.equal(c('Merino Wool Cardigan'), 'knitwear'); assert.equal(c('Knit Polo Shirt'), 'knitwear');
  assert.equal(c('Wax Cotton Bomber Jacket'), 'outerwear'); assert.equal(c('Two-Button Wool Blazer'), 'tailoring'); assert.equal(c('Loose Cargo Pant'), 'bottoms');
  assert.equal(c('Corduroy 5-Panel Cap'), 'headwear'); assert.equal(c('Leather Penny Loafer'), 'footwear'); assert.equal(c('Canvas Weekender Duffle'), 'bags');
  assert.equal(c('Ribbed Crew Sock'), 'accessories'); assert.equal(c('Wool Blanket'), 'home'); assert.equal(c('The Thing'), 'other');
  assert.equal(c('Mystery piece', 'Sneakers'), 'footwear', 'the shop\'s product type beats a vague title');
  assert.ok(CATEGORY_IDS.includes('footwear') && CATEGORY_IDS.includes('headwear') && CATEGORY_IDS.length >= 10, 'everything, beyond apparel');
});

test('robots.txt: only what is allowed to everyone, longest rule wins, wildcards work, our own name beats the star', () => {
  const r = parseRobots(`# a shop\nUser-agent: *\nDisallow: /cart\nDisallow: /collections/*sort_by*\nDisallow: /search\nAllow: /search/suggest\n\nUser-agent: Googlebot\nDisallow: /\n`);
  assert.equal(robotsAllows(r, '/products.json'), true); assert.equal(robotsAllows(r, '/cart'), false); assert.equal(robotsAllows(r, '/cart/add'), false);
  assert.equal(robotsAllows(r, '/collections/all?sort_by=best-selling'), false); assert.equal(robotsAllows(r, '/collections/all'), true);
  assert.equal(robotsAllows(r, '/search/suggest'), true, 'a longer Allow beats a shorter Disallow'); assert.equal(robotsAllows(r, '/search?q=x'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /\n'), '/products.json'), false, 'a site that shuts everyone out is left alone');
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: FutureBasicsLab\nAllow: /\n'), '/x'), true, 'a group that names us wins');
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/anything'), true, 'an empty Disallow allows everything');
  assert.equal(robotsAllows(parseRobots(''), '/a'), true); assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /*.pdf$\n'), '/a.pdf'), false); assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /*.pdf$\n'), '/a.pdf.html'), true);
});

test('sell-through: sizes gone on a recent piece is heat; a long-stocked piece is not', () => {
  const v = (n, gone) => Array.from({ length: n }, (_, i) => ({ available: i >= gone }));
  const hot = sellThrough({ variants: v(6, 4), publishedAt: '2026-10-01T00:00:00Z', now: NOW }), cold = sellThrough({ variants: v(6, 0), publishedAt: '2025-01-01T00:00:00Z', now: NOW });
  assert.ok(hot.heat >= 60 && heatLabel(hot.heat) === 'Selling fast' && hot.soldOutShare === 0.67 && hot.daysLive === 16, JSON.stringify(hot));
  assert.equal(cold.heat, 0); assert.equal(heatLabel(cold.heat), 'Fully in stock');
  assert.equal(sellThrough({ variants: [], now: NOW }).heat, null); assert.equal(sellThrough({ variants: [{ available: false }], now: NOW }).heat, null, 'one size says nothing');
  assert.ok(sellThrough({ variants: v(6, 3), publishedAt: '2024-01-01T00:00:00Z', now: NOW }).heat < sellThrough({ variants: v(6, 3), publishedAt: '2026-09-20T00:00:00Z', now: NOW }).heat, 'an old piece with the same sizes gone is less hot');
});

const FEED = { products: [
  { handle: 'heavy-tee', title: 'Heavy Tee', product_type: 'T-Shirts', vendor: 'ALD', tags: 'core, tee', body_html: '<p>Pima <b>cotton</b> &amp; rib</p>', published_at: '2026-10-05T00:00:00Z', images: [{ src: 'https://cdn.x/tee.jpg' }], variants: [{ price: '78.00', available: false }, { price: '78.00', available: false }, { price: '80.00', available: true }] },
  { handle: 'nameless', title: '' }, { title: 'No handle' }
] };
test('a shop feed becomes pieces: price in cents, our category, sell-through, the picture\'s address and no copied picture', () => {
  const items = shopifyItems(FEED, 'https://shop.test', { now: NOW }); assert.equal(items.length, 1);
  const t = items[0]; assert.equal(t.url, 'https://shop.test/products/heavy-tee'); assert.equal(t.priceCents, 7800); assert.equal(t.category, 'tops'); assert.equal(t.imageUrl, 'https://cdn.x/tee.jpg');
  assert.equal(t.description, 'Pima cotton & rib'); assert.equal(t.sellthrough.soldOutShare, 0.67); assert.ok(t.sellthrough.heat > 50); assert.deepEqual(t.tags, ['core', 'tee']);
});

test('page markup: JSON-LD products (also inside a graph or a list), Open Graph, and shop links', () => {
  const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Wool Overshirt","url":"/p/overshirt","image":["/i/o.jpg"],"offers":{"@type":"Offer","price":"128.00","priceCurrency":"USD"}},{"@type":"BreadcrumbList"}]}</script><script type="application/ld+json">{broken</script><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"Product","name":"Bucket Hat","offers":{"price":"48"}}}]}</script>`;
  const got = jsonLdProducts(ld, 'https://shop.test/new'); assert.deepEqual(got.map(g => [g.title, g.priceCents, g.category]), [['Wool Overshirt', 12800, 'tops'], ['Bucket Hat', 4800, 'headwear']]);
  assert.equal(got[0].url, 'https://shop.test/p/overshirt'); assert.equal(got[0].imageUrl, 'https://shop.test/i/o.jpg');
  const og = openGraphItem('<title>x</title><meta property="og:title" content="Canvas Tote"><meta property="og:image" content="https://i/x.jpg"><meta property="product:price:amount" content="35.50">', 'https://shop.test/p/tote');
  assert.equal(og.title, 'Canvas Tote'); assert.equal(og.priceCents, 3550); assert.equal(og.category, 'bags'); assert.equal(openGraphItem('<p>nothing</p>', 'https://x.test'), null);
  const links = shopLinks('<a href="/collections/new-arrivals">New Arrivals</a><a href="/cart">Cart</a><a href="https://other.test/collections/x">x</a><a href="/pages/about">About</a><a href="/collections/men">Men</a>', 'https://shop.test/');
  assert.deepEqual(links, ['https://shop.test/collections/new-arrivals', 'https://shop.test/collections/men']);
  assert.equal(toCents('$1,299.00'), 129900); assert.equal(toCents('free'), null);
});

test('the brand code keeps what Kyle said, cleans what is typed, and reaches the AI as plain words', () => {
  assert.match(DEFAULT_BRAND_CODE.statement, /Zara/); assert.deepEqual(DEFAULT_BRAND_CODE.cutReferences, ['Gucci', 'Prada', 'Ralph Lauren', 'Aimé Leon Dore']); assert.ok(DEFAULT_BRAND_CODE.avoid.some(a => /Shein/.test(a)));
  const c = cleanBrandCode({ statement: '  A  brand ', cutReferences: 'Prada\n\n  Gucci  \n', exemplars: [{ name: 'Camp collar', why: 'Perfect drape', url: 'javascript:alert(1)' }, { name: '' }, { name: 'Boxy tee', url: 'https://x.test/tee' }] });
  assert.equal(c.statement, 'A brand'); assert.deepEqual(c.cutReferences, ['Prada', 'Gucci']); assert.equal(c.exemplars.length, 2); assert.equal(c.exemplars[0].url, '', 'only web addresses are kept'); assert.equal(c.exemplars[1].url, 'https://x.test/tee');
  assert.equal(c.materials, DEFAULT_BRAND_CODE.materials, 'what is not sent stays as it was');
  const w = brandCodeWords(c); assert.match(w, /Price anchor: Zara/); assert.match(w, /Cuts we borrow from: Prada, Gucci/); assert.match(w, /Pieces we love: Camp collar \(Perfect drape\); Boxy tee/);
});

test('the watchlist: seeded with the brands Kyle named, names and addresses checked', () => {
  const names = SEED_BRANDS.map(b => b.name); for (const n of ['Ralph Lauren', 'Aimé Leon Dore', 'A-COLD-WALL*', 'Zara']) assert.ok(names.includes(n), n);
  assert.equal(SEED_BRANDS.find(b => b.name === 'Zara').role, 'price');
  assert.equal(cleanBrand({ name: '  Kith ', site: 'kith.com/' }).site, 'https://kith.com'); assert.ok(cleanBrand({ name: '' }).error); assert.ok(cleanBrand({ name: 'X', site: 'not a url' }).error); assert.equal(cleanBrand({ name: 'X', role: 'zzz' }).role, 'reference');
  assert.equal(cleanBrand({ name: 'Y', site: 'ftp://y.com' }).error !== undefined, true);
});

test('page digest and address normalising: only links on the same site, no tracking tags', () => {
  assert.equal(normUrl('https://a.test/p/x?utm_source=y&size=m#top'), 'https://a.test/p/x?size=m');
  const d = pageDigest('<a href="/p/one"><img data-src="/i/1.jpg">Tee</a><a href="https://other.test/p/2">Other</a><a href="/cart">Cart</a><a href="/p/one">dup</a>', 'https://a.test/');
  assert.deepEqual(d, [{ url: 'https://a.test/p/one', text: 'Tee', image: 'https://a.test/i/1.jpg' }]);
});

// ---- scanning with a fake network and a fake database --------------------------------------------------------------------------------------------
function fakePool() {
  const db = { items: new Map(), scans: [], brands: {}, sql: [] };
  return {
    db,
    async query(sql, args = []) {
      db.sql.push(sql);
      if (/insert into lab_scans/.test(sql)) { db.scans.push({ id: db.scans.length + 1 }); return { rows: [{ id: db.scans.length }] }; }
      if (/from lab_scans where started_at/.test(sql)) return { rows: [{ c: '0' }] };
      if (/insert into lab_items/.test(sql)) { const url = args[2]; const had = db.items.has(url); db.items.set(url, { brand: args[0], source: args[1], url, title: args[3], image: args[4], price: args[5], category: args[7], attrs: args[8] ? JSON.parse(args[8]) : null, heat: args[10], summary: args[11] }); return { rows: [{ inserted: !had }] }; }
      if (/update lab_scans/.test(sql)) { Object.assign(db.scans[args[0] - 1], { method: args[1], found: args[2], added: args[3], blocked: args[4], note: args[5], cost: args[6] }); return { rows: [] }; }
      if (/update lab_brands/.test(sql)) { db.brands.note = args[1]; return { rows: [] }; }
      return { rows: [] };
    }
  };
}
const res = (status, body, type = 'text/html') => ({ status, headers: { get: h => (/content-type/i.test(h) ? type : null) }, body: null, arrayBuffer: async () => Buffer.from(body) });
const site = routes => async (url) => { const u = new URL(url); const hit = routes[u.pathname + u.search] ?? routes[u.pathname]; return hit ? (typeof hit === 'function' ? hit(u) : hit) : res(404, 'nope'); };
const pub = { lookup: async () => [{ address: '93.184.216.34' }] };
const base = { env: { ANTHROPIC_API_KEY: 'k', AI_FIXTURE: 'x', BRAVE_API_KEY: 'b', LAB_DAILY_CENTS: '200' }, delayMs: 0, sleep: async () => {}, now: NOW };
const brand = { id: 'b1', name: 'Shopbrand', site: 'https://shop.test' };

test('a shop with a feed is read from its feed: no search, pieces saved with the AI\'s design read', async () => {
  const pool = fakePool(), searched = [];
  const out = await scanBrand(pool, brand, { ...base, crawlOpts: { ...pub, fetchImpl: site({ '/robots.txt': res(200, 'User-agent: *\nDisallow: /cart\n', 'text/plain'), '/products.json': res(200, JSON.stringify(FEED), 'application/json') }) },
    braveSearchImpl: async q => { searched.push(q); return []; }, braveImagesImpl: async q => { searched.push(q); return []; } });
  assert.equal(out.method, 'feed'); assert.equal(out.found, 1); assert.equal(out.added, 1); assert.equal(out.blocked, false); assert.deepEqual(searched, [], 'a shop\'s own feed is the whole shop: no search');
});

test('a site that says no (403 everywhere) is read through web and image search instead, and the scan says so', async () => {
  const pool = fakePool(), q = [];
  const out = await scanBrand(pool, { id: 'b2', name: 'Prada', site: 'https://wall.test' }, { ...base, crawlOpts: { ...pub, fetchImpl: site({ '/robots.txt': res(403, 'denied') }) },
    braveSearchImpl: async query => { q.push(['web', query]); return [{ title: 'Prada Re-Nylon Bomber Jacket', url: 'https://retail.test/prada-bomber?utm_source=x', description: 'nylon bomber' }, { title: 'The 10 Best Prada Bags of 2026', url: 'https://blog.test/best', description: 'list' }]; },
    braveImagesImpl: async query => { q.push(['img', query]); return [{ title: 'Prada leather loafer', url: 'https://img.test/loafer', imageUrl: 'https://img.test/l.jpg' }]; } });
  assert.equal(out.method, 'search'); assert.equal(out.blocked, true); assert.match(out.note, /blocks automatic reading/);
  assert.ok(q.some(([k, s]) => k === 'web' && /Prada/.test(s)) && q.some(([k]) => k === 'img'), 'both kinds of search ran');
  const kept = [...pool.db.items.values()]; assert.ok(kept.some(i => i.title.includes('Bomber') && i.url === 'https://retail.test/prada-bomber' && i.source === 'search' && i.category === 'outerwear'), 'tracking tags dropped, category read');
  assert.ok(kept.some(i => i.source === 'image' && i.image === 'https://img.test/l.jpg' && i.category === 'footwear'), 'the picture is kept as an address only');
  assert.ok(!kept.some(i => /Best Prada Bags/.test(i.title)), 'a "best of" list is not a product');
});

test('a robots.txt that bans the feed is obeyed: the feed is never asked for, the home page is read instead', async () => {
  const pool = fakePool(), asked = [];
  const ld = '<script type="application/ld+json">{"@type":"Product","name":"Chore Coat","url":"https://wall.test/p/chore","offers":{"price":"210"}}</script>';
  const f = site({ '/robots.txt': res(200, 'User-agent: *\nDisallow: /products.json\nDisallow: /collections/secret\n', 'text/plain'), '/': () => res(200, `<html>${ld}<a href="/collections/secret">New in</a></html>`), '/products.json': () => { asked.push('feed'); return res(200, '{}'); }, '/collections/secret': () => { asked.push('secret'); return res(200, '<html></html>'); } });
  const out = await scanBrand(pool, { id: 'b3', name: 'Wall', site: 'https://wall.test' }, { ...base, crawlOpts: { ...pub, fetchImpl: f }, braveSearchImpl: async () => [], braveImagesImpl: async () => [] });
  assert.deepEqual(asked, [], 'neither the banned feed nor the banned page was fetched'); assert.match(out.note, /robots/i);
  assert.ok([...pool.db.items.values()].some(i => i.title === 'Chore Coat' && i.price === 21000 && i.source === 'page'));
});

test('a plain page with no markup is read by the AI, which can only pick links that are really on the page', async () => {
  const pool = fakePool();
  const html = '<html><a href="/p/linen-shirt"><img src="/i/ls.jpg">Linen Camp Shirt</a><a href="/p/chino"><img src="/i/c.jpg">Chino Short</a><a href="/p/cap"><img src="/i/cap.jpg">Dad Cap</a><a href="/p/tote"><img src="/i/t.jpg">Tote Bag</a><a href="/about-us">About</a></html>';
  const out = await scanBrand(pool, { id: 'b4', name: 'Plain', site: 'https://plain.test' }, { ...base, crawlOpts: { ...pub, fetchImpl: site({ '/': res(200, html) }) }, braveSearchImpl: async () => [], braveImagesImpl: async () => [] });
  assert.equal(out.method, 'pages'); const kept = [...pool.db.items.values()];
  assert.deepEqual(kept.map(i => i.category).sort(), ['bags', 'bottoms', 'headwear', 'tops']); assert.ok(kept.every(i => i.url.startsWith('https://plain.test/p/') && i.image.startsWith('https://plain.test/i/')));
});

test('a bot wall page is never mistaken for a shop; with no search key the scan says what it could not do', async () => {
  const pool = fakePool();
  const out = await scanBrand(pool, { id: 'b5', name: 'Walled', site: 'https://walled.test' }, { ...base, env: { ...base.env, BRAVE_API_KEY: '' }, crawlOpts: { ...pub, fetchImpl: site({ '/': res(200, '<html><title>Just a moment...</title>Verify you are human</html>') }) },
    braveSearchImpl: async () => { throw new Error('Web search is not connected (the service needs BRAVE_API_KEY)'); }, braveImagesImpl: async () => { throw new Error('Web search is not connected (the service needs BRAVE_API_KEY)'); } });
  assert.equal(out.found, 0); assert.equal(out.blocked, true); assert.match(out.note, /not connected/); assert.equal(pool.db.items.size, 0);
});

test('the daily AI allowance: when it is used up pieces are still saved, just without the design read', async () => {
  const pool = fakePool(); const orig = pool.query.bind(pool);
  pool.query = async (sql, args) => /from lab_scans where started_at/.test(sql) ? { rows: [{ c: '500' }] } : orig(sql, args);
  const out = await scanBrand(pool, brand, { ...base, crawlOpts: { ...pub, fetchImpl: site({ '/robots.txt': res(404, 'x'), '/products.json': res(200, JSON.stringify(FEED), 'application/json') }) } });
  assert.equal(out.found, 1); assert.match(out.note, /daily AI allowance/); const t = [...pool.db.items.values()][0]; assert.equal(t.attrs, null); assert.equal(t.category, 'tops', 'the category still comes from the shop\'s words');
});

test('the AI reader drops what is not a product and cleans what it keeps', async () => {
  const r = makeReader({ env: base.env, askImpl: async ({ fixture, user }) => ({ json: fixture({ user }), usage: { input: 1000, output: 500 } }), code: DEFAULT_BRAND_CODE });
  const a = { title: 'Knit Polo', vendor: 'X', description: '' }, b = { title: 'How to style a polo: guide', vendor: 'X', description: '' };
  const m = await r.read([a, b]); assert.equal(m.get(a).category, 'knitwear'); assert.equal(m.get(b).product, false); assert.ok(r.state.cents > 0, 'the cost is counted');
  assert.equal((await makeReader({ env: {}, askImpl: async () => { throw new Error('no'); } }).read([a])).size, 0, 'no AI key means no read, not an error');
});

test('saving a piece twice updates it, keeps its history and counts it as new only once', async () => {
  const pool = fakePool(); const it = { url: 'https://a.test/p/1?utm_campaign=z', title: 'Tee', category: 'tops', priceCents: 5000, source: 'feed' };
  assert.equal(await upsertItems(pool, 'b1', [it, { ...it, title: 'Tee v2' }]), 1); assert.equal(pool.db.items.size, 1); assert.equal(pool.db.items.get('https://a.test/p/1').title, 'Tee v2');
  assert.equal(await upsertItems(pool, 'b1', [{ url: '', title: 'x' }, { url: 'https://a.test/p/2', title: '' }]), 0, 'nothing without an address and a name');
});
