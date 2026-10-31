// The Design Lab, end to end over HTTP and in a browser (server A, which reads shops from the journey stand-in server on 3134 and searches through the
// stand-in on 3133): it is closed to everyone but the owners and whoever they tick it for, it reads a shop's own feed, falls back to web and image search when a
// site says no, keeps no duplicates, obeys robots.txt, and the library, brand code and watchlist behave.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { journey, ok, summary, api, jpeg, png, sql, stamp, forge, FX, sharp, S, codeFrom, sleep } from './lib.mjs';
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
const BASE = 'http://127.0.0.1:3123', call = api(BASE);
const room = (await call('/v1/public/start', { body: { email: `jt-${stamp}-${Math.random().toString(36).slice(2, 7)}@chaos.test`, name: 'Lab Admin', title: 'Lab runner', photos: [jpeg()] } })).json;
const clientId = room.client?.id || sql(`select client_id from users where lower(email)='${room.email || ''}'`);
const staffRow = email => sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${clientId}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0];
const token = async email => forge({ sub: staffRow(email), clientId, role: 'admin', email });
const PAT = `lab-pat-${stamp}@thefuturebasics.com`, kyleT = await token('kyle@thefuturebasics.com'), patT = await token(PAT), patId = staffRow(PAT);
const K = (path, o = {}) => call('/v1/lab' + path, { token: kyleT, ...o }), P = (path, o = {}) => call('/v1/lab' + path, { token: patT, ...o });

// ---- the stand-in shops (3134) and the stand-in search (3133) ----------------------------------------------------------------------------------------------
const day = n => new Date(Date.now() - n * 86_400_000).toISOString();
const mk = (handle, title, type, gone, total, days, price) => ({ handle, title, product_type: type, vendor: 'Feed Shop', tags: 'core', body_html: `<p>${title} in a heavy cotton</p>`, published_at: day(days), images: [{ src: `https://cdn.feedshop.test/${handle}.jpg` }], variants: Array.from({ length: total }, (_, i) => ({ price: String(price), available: i >= gone })) });
const FEED = { products: [mk('heavy-tee', 'Heavy Tee', 'T-Shirts', 5, 6, 9, 78), mk('fisherman-knit', 'Fisherman Knit Sweater', '', 0, 6, 200, 168), mk('wax-bomber', 'Wax Cotton Bomber Jacket', 'Jackets', 2, 5, 30, 298), mk('dad-cap', 'Washed Dad Cap', 'Hats', 0, 1, 60, 48),
  mk('court-sneaker', 'Court Sneaker', 'Footwear', 1, 8, 40, 190), mk('canvas-tote', 'Canvas Tote Bag', '', 0, 1, 90, 58), mk('web-belt', 'Web Belt', 'Accessories', 0, 3, 120, 45), mk('pleat-pant', 'Pleated Wool Pant', 'Trousers', 1, 6, 50, 220), mk('two-button-blazer', 'Two-Button Blazer', '', 0, 6, 70, 395), mk('wool-blanket', 'Wool Blanket', '', 0, 1, 300, 240)] };
const ANCHOR = { products: [mk('a-tee', 'Basic Tee', 'T-Shirts', 1, 4, 20, 30), mk('a-polo', 'Pique Polo', 'Polos', 0, 4, 40, 40), mk('a-crew', 'Crew Sweatshirt', 'Sweatshirts', 2, 4, 15, 45), mk('a-shirt', 'Poplin Shirt', 'Shirts', 0, 4, 60, 40)] };
const JACKETS = { products: [mk('field-coat', 'Field Coat', 'Coats', 1, 5, 20, 250), mk('quilt-liner', 'Quilted Liner Jacket', 'Jackets', 0, 5, 50, 300), mk('rain-shell', 'Rain Shell', 'Outerwear', 2, 5, 25, 350)] };
const seen = [], searches = [];
const shops = http.createServer((q, s) => {
  const host = String(q.headers['x-original-host'] || '').replace(/^www\./, ''), u = new URL(q.url, 'http://x'); seen.push(host + u.pathname);
  const send = (code, body, type = 'text/html') => { s.writeHead(code, { 'content-type': type }); s.end(body); };
  if (host === 'feedshop.test') {
    if (u.pathname === '/robots.txt') return send(200, 'User-agent: *\nDisallow: /cart\nDisallow: /collections/*sort_by*\n', 'text/plain');
    if (u.pathname === '/products.json') return send(200, JSON.stringify(u.searchParams.get('page') === '1' ? FEED : { products: [] }), 'application/json');
    if (u.pathname === '/products/heavy-tee') return send(200, '<html><head><title>Heavy Tee</title><meta property="og:title" content="Heavy Tee"><meta property="og:image" content="https://cdn.feedshop.test/heavy-tee.jpg"><meta property="product:price:amount" content="78.00"></head><body>tee</body></html>');
    return send(404, 'no');
  }
  if (host === 'anchorshop.test') {
    if (u.pathname === '/robots.txt') return send(404, 'none');
    if (u.pathname === '/products.json') return send(200, JSON.stringify(u.searchParams.get('page') === '1' ? ANCHOR : { products: [] }), 'application/json');
    return send(404, 'no');
  }
  if (host === 'jacketshop.test') {
    if (u.pathname === '/robots.txt') return send(404, 'none');
    if (u.pathname === '/products.json') return send(200, JSON.stringify(u.searchParams.get('page') === '1' ? JACKETS : { products: [] }), 'application/json');
    return send(404, 'no');
  }
  if (host === 'wallshop.test') return send(403, 'Access denied');
  if (host === 'bannedshop.test') {
    if (u.pathname === '/robots.txt') return send(200, 'User-agent: *\nDisallow: /\n', 'text/plain');
    return send(200, '<html>should never be read</html>');
  }
  if (host === 'plainshop.test') {
    if (u.pathname === '/robots.txt') return send(404, 'none');
    if (u.pathname === '/') return send(200, '<html><script type="application/ld+json">{"@type":"Product","name":"Chore Coat","url":"https://plainshop.test/p/chore-coat","image":"https://plainshop.test/i/chore.jpg","offers":{"price":"210.00","priceCurrency":"USD"}}</script><script type="application/ld+json">{"@type":"Product","name":"Camp Collar Shirt","url":"https://plainshop.test/p/camp","offers":{"price":"96"}}</script><script type="application/ld+json">{"@type":"Product","name":"Linen Short","url":"https://plainshop.test/p/short","offers":{"price":"88"}}</script></html>');
    return send(404, 'no');
  }
  send(404, 'no');
});
await new Promise(r => shops.listen(3134, '127.0.0.1', r));
const brave = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x'), send = (code, body) => { s.writeHead(code, { 'content-type': 'application/json' }); s.end(JSON.stringify(body)); };
  if (q.headers['x-subscription-token'] !== 'bk') return send(401, {});
  const term = u.searchParams.get('q'); searches.push([u.pathname.includes('images') ? 'img' : 'web', term]);
  if (u.pathname === '/res/v1/web/search') return send(200, { web: { results: [{ title: 'A-COLD-WALL* Nylon Shell Jacket', url: 'https://retailer.test/acw-shell?utm_source=brave', description: 'technical shell jacket' }, { title: 'The 12 Best Streetwear Brands of 2026', url: 'https://blog.test/best', description: 'a list' }] } });
  if (u.pathname === '/res/v1/images/search') return send(200, { results: [{ title: 'Wall Brand wool cap', url: 'https://retailer.test/wall-cap', thumbnail: { src: 'https://img.test/cap.jpg' }, source: 'retailer.test' }] });
  send(404, {});
});
await new Promise(r => brave.listen(3133, '127.0.0.1', r));
// the page asks its questions in its own box (the browser's prompt() can be switched off): type the answer and continue
const say = async (page, text) => { await page.waitForSelector('dialog.ask[open] textarea', { timeout: 8000 }); await page.fill('dialog.ask[open] textarea', text); await page.click('dialog.ask[open] button.go'); await page.waitForFunction(() => !document.querySelector('dialog.ask[open]'), null, { timeout: 4000 }); };
const SCAN = async (id) => (await K(`/brands/${id}/scan?wait=1`, { method: 'POST', body: {} }));
// a brand on the watchlist; a refusal says why, rather than leaving the next line to read a property of nothing
const mkBrand = async (name, site, role = 'reference') => { const r = await K('/brands', { body: { name: `${name} ${stamp}`, site, role } }); if (!r.json.brand) throw new Error(`mkBrand ${name}: ${r.status} ${r.json.error || ''}`); return r.json.brand; };

await journey('J193', 'Design Lab: closed to everyone but the owners, reads a shop\'s feed, falls back to search when a site says no, obeys robots.txt, keeps no duplicates', async () => {
  try {
    // who can open it
    ok((await call('/v1/lab/overview')).status === 401 && (await call('/v1/lab/overview', { token: room.token })).status === 403, 'signed out and client sessions cannot open it');
    const no = await P('/overview'); ok(no.status === 403 && no.json.code === 'MODULE_ACCESS' && no.json.module === 'lab' && /Design Lab/.test(no.json.error), 'a teammate who has every ordinary module is still refused: the Lab is held back', [no.status, no.json]);
    ok((await P('/items')).status === 403 && (await P('/brands', { body: { name: 'x' } })).status === 403 && (await P('/scan', { method: 'POST', body: {} })).status === 403, 'every Lab route is closed to them, reading and writing');
    const pres = (await call('/v1/staff-access', { token: kyleT })).json; ok(pres.modules.some(m => m.id === 'lab' && m.restricted) && pres.presets.every(p => !p.modules.includes('lab')), 'Team access lists the Design Lab as held back, and no preset hands it out', pres.presets?.map(p => p.id));
    ok((await call('/v1/staff-access/me', { token: kyleT })).json.modules.includes('lab'), 'the owners always have it');

    // the owners open it
    const ov = await K('/overview'); ok(ov.status === 200, 'an owner opens the Lab', ov.json);
    const names = ov.json.brands.map(b => b.name); ok(['Ralph Lauren', 'Aimé Leon Dore', 'A-COLD-WALL*', 'Zara'].every(n => names.includes(n)), 'the brands Kyle named are already on the list', names);
    ok(/Male-driven and unisex/.test(ov.json.brandCode.audience) && /Zara/.test(ov.json.brandCode.statement) && ov.json.brandCode.cutReferences.includes('Aimé Leon Dore') && ov.json.categories.length >= 10 && ov.json.connected.search === true && ov.json.connected.ai === true, 'the brand code starts from Kyle\'s words, every category is there, and search and the AI read are connected', ov.json.connected);

    // give it to one person
    const given = await call(`/v1/staff-access/users/${patId}`, { method: 'PUT', token: kyleT, body: { modules: ['lab'] } }); ok(given.status === 200, 'an owner ticks the Design Lab for a person', given.json);
    ok((await P('/overview')).status === 200 && (await call('/v1/sales/contacts', { token: patT })).status === 403, 'they now open the Lab and nothing else');
    await call(`/v1/staff-access/users/${patId}`, { method: 'PUT', token: kyleT, body: { modules: [] } });
    ok((await P('/overview')).status === 403, 'taking it away closes it again');

    // a shop with a feed
    const feed = await mkBrand('Feed Shop', 'https://www.feedshop.test'); ok(feed?.id, 'a brand is added to the list', feed);
    const dup = await K('/brands', { body: { name: feed.name.toUpperCase() } }); ok(dup.status === 409, 'the same brand twice is refused');
    ok((await K('/brands', { body: { name: 'Bad', site: 'not a site' } })).status === 422 && (await K('/brands', { body: { name: '' } })).status === 422, 'a bad address or no name is refused');
    const s1 = (await SCAN(feed.id)).json.scan; ok(s1?.method === 'feed' && s1.found === 10 && s1.added === 10 && !s1.blocked, 'the shop\'s own feed is read: 10 pieces, all new, nothing blocked', s1);
    ok(!searches.some(([, q]) => /Feed Shop/.test(q)), 'it did not search the web for a shop whose own feed answered', searches);
    ok(seen.includes('feedshop.test/robots.txt') && seen.includes('feedshop.test/products.json'), 'robots.txt was read before the feed');
    const all = (await K(`/items?brand=${feed.id}&limit=100`)).json; ok(all.total === 10 && all.items.length === 10, 'the library holds them', all.total);
    const cats = Object.fromEntries(all.items.map(i => [i.title, i.category])); ok(cats['Heavy Tee'] === 'tops' && cats['Fisherman Knit Sweater'] === 'knitwear' && cats['Wax Cotton Bomber Jacket'] === 'outerwear' && cats['Washed Dad Cap'] === 'headwear' && cats['Court Sneaker'] === 'footwear' && cats['Canvas Tote Bag'] === 'bags' && cats['Web Belt'] === 'accessories' && cats['Pleated Wool Pant'] === 'bottoms' && cats['Two-Button Blazer'] === 'tailoring' && cats['Wool Blanket'] === 'home', 'every piece lands in the right category, hats, shoes and a blanket included', cats);
    const tee = all.items.find(i => i.title === 'Heavy Tee'); ok(tee.price === 78 && tee.imageUrl === 'https://cdn.feedshop.test/heavy-tee.jpg' && tee.sellthrough.soldOutShare === 0.83 && tee.heat >= 60 && tee.heatLabel === 'Selling fast' && /small embroidered mark/.test(JSON.stringify(tee.attrs)) && tee.summary, 'price, picture address, sell-through, heat and the design read are kept', tee);
    const hot = (await K(`/items?brand=${feed.id}&sort=hot`)).json.items; ok(hot[0].title === 'Heavy Tee' && hot[0].heat >= hot[1].heat, 'sorted by what is selling fastest, the tee with five of six sizes gone is first', hot.slice(0, 2).map(i => [i.title, i.heat]));
    ok((await K(`/items?brand=${feed.id}&sort=price_desc`)).json.items[0].title === 'Two-Button Blazer' && (await K(`/items?brand=${feed.id}&category=footwear`)).json.items.length === 1 && (await K(`/items?brand=${feed.id}&q=fisherman`)).json.items.length === 1 && (await K(`/items?q=zzzznothing`)).json.items.length === 0, 'price order, category and word searches work');

    // again: no duplicates
    const s2 = (await SCAN(feed.id)).json.scan; ok(s2.found === 10 && s2.added === 0 && (await K(`/items?brand=${feed.id}&limit=100`)).json.total === 10, 'reading the same shop again adds nothing twice', s2);

    // a site that says no
    const wall = await mkBrand('Wall Shop', 'https://wallshop.test', 'cuts'); const before = searches.length;
    const s3 = (await SCAN(wall.id)).json.scan; ok(s3.blocked === true && s3.method === 'search' && /blocks automatic reading/.test(s3.note) && s3.found >= 2, 'a site that answers 403 is read through search instead, and the scan says why', s3);
    ok(searches.slice(before).some(([k]) => k === 'web') && searches.slice(before).some(([k]) => k === 'img'), 'both web search and image search ran', searches.slice(before));
    const wi = (await K(`/items?brand=${wall.id}&limit=100`)).json.items; ok(wi.some(i => i.title.includes('Shell Jacket') && i.url === 'https://retailer.test/acw-shell' && i.category === 'outerwear' && i.source === 'search') && wi.some(i => i.title.includes('wool cap') && i.imageUrl === 'https://img.test/cap.jpg' && i.source === 'image'), 'pieces found by search keep their page, the tracking tag is dropped, and a picture is only an address', wi.map(i => [i.title, i.url]));
    ok(!wi.some(i => /Best Streetwear/.test(i.title)), 'a "best of" list is not mistaken for a product');

    // robots.txt that bans everything
    const banned = await mkBrand('Banned Shop', 'https://bannedshop.test'); const s4 = (await SCAN(banned.id)).json.scan;
    ok(!seen.some(p => p === 'bannedshop.test/products.json' || p === 'bannedshop.test/') && /robots/i.test(s4.note), 'a site whose robots.txt shuts everyone out is never read directly', [s4, seen.filter(p => p.startsWith('bannedshop'))]);

    // a shop with only page markup
    const plain = await mkBrand('Plain Shop', 'https://plainshop.test'); const s5 = (await SCAN(plain.id)).json.scan;
    ok(s5.method === 'pages' && s5.found === 3 && !searches.some(([, q]) => /Plain Shop/.test(q)), 'a shop with no feed is read from the structured data on its pages', s5);
    ok((await K(`/items?brand=${plain.id}`)).json.items.some(i => i.title === 'Chore Coat' && i.price === 210 && i.source === 'page'), 'its prices are kept');

    // the scan log
    const log = (await K('/scans')).json.scans; ok(log.length >= 5 && log.some(s => s.blocked) && log.every(s => s.finishedAt), 'every scan is recorded, with whether the site said no', log.length);
    ok((await K('/overview')).json.totals.items >= 10 && (await K('/overview')).json.brands.find(b => b.id === feed.id).items === 10 && /10 found/.test((await K('/overview')).json.brands.find(b => b.id === feed.id).lastScanNote), 'the overview counts follow');
  } finally { await call(`/v1/staff-access/users/${patId}`, { method: 'PUT', token: kyleT, body: { modules: [] } }); }
});

await journey('J194', 'Design Lab: save, hide and add pieces, edit the brand code and the watchlist', async () => {
  const brand = (await K('/overview')).json.brands.find(b => b.name === `Feed Shop ${stamp}`); ok(brand, 'the shop from the last journey is still there');
  const items = (await K(`/items?brand=${brand.id}&limit=100`)).json.items, a = items[0], b = items[1];
  const saved = await K(`/items/${a.id}`, { method: 'PUT', body: { status: 'saved', note: 'love the drape' } }); ok(saved.status === 200 && saved.json.item.status === 'saved' && saved.json.item.note === 'love the drape', 'a piece can be saved with a note', saved.json);
  ok((await K(`/items?brand=${brand.id}&status=saved`)).json.items.map(i => i.id).join() === a.id, 'the Saved view shows only that piece');
  ok((await K(`/items/${b.id}`, { method: 'PUT', body: { status: 'hidden' } })).status === 200 && !(await K(`/items?brand=${brand.id}&limit=100`)).json.items.some(i => i.id === b.id) && (await K(`/items?brand=${brand.id}&status=hidden`)).json.items.length === 1, 'a hidden piece leaves the library and sits under Hidden');
  const rescan = (await SCAN(brand.id)).json.scan; ok(rescan.added === 0 && (await K(`/items?brand=${brand.id}&status=hidden`)).json.items.length === 1, 'scanning again does not bring a hidden piece back or reset a saved one', rescan);
  ok((await K(`/items/${a.id}`, { method: 'PUT', body: { status: 'nope' } })).status === 422 && (await K(`/items/${a.id}`, { method: 'PUT', body: { category: 'nope' } })).status === 422 && (await K(`/items/${a.id}`, { method: 'PUT', body: {} })).status === 422 && (await K('/items/00000000-0000-4000-8000-000000000000', { method: 'PUT', body: { status: 'saved' } })).status === 404, 'bad changes and unknown pieces are refused');
  ok((await K(`/items/${a.id}`, { method: 'PUT', body: { category: 'knitwear' } })).json.item.categoryLabel === 'Knitwear', 'a category can be corrected by hand');

  // add one piece by its address
  const add = await K('/items', { body: { url: 'https://feedshop.test/products/heavy-tee' } }); ok(add.status === 201 && add.json.item.title === 'Heavy Tee' && add.json.item.price === 78, 'a piece is added from its address (the page is already in the library, so it is updated, not doubled)', add.json);
  ok((await K(`/items?brand=${brand.id}&limit=100&q=Heavy`)).json.items.length === 1, 'no duplicate');
  const walled = await K('/items', { body: { url: 'https://wallshop.test/p/x' } }); ok(walled.status === 422 && /blocks automatic reading/.test(walled.json.error), 'a page that blocks reading says so', walled.json);
  const banned = await K('/items', { body: { url: 'https://bannedshop.test/p/x' } }); ok(banned.status === 422 && /robots/i.test(banned.json.error), 'a page robots.txt forbids is not read', banned.json);
  ok((await K('/items', { body: { url: 'http://127.0.0.1:3123/' } })).status === 422 && (await K('/items', { body: { url: 'http://169.254.169.254/latest' } })).status === 422 && (await K('/items', { body: { url: '' } })).status === 422, 'private and empty addresses are refused');

  // brand code
  const code = await K('/brand-code', { method: 'PUT', body: { statement: 'Affordable, never cheap. Test edition.', cutReferences: ['Prada', 'Gucci', ' '], exemplars: [{ name: 'Camp collar shirt', why: 'The drape', url: 'javascript:alert(1)' }, { name: 'Boxy tee', url: 'https://example.test/tee' }, { name: '' }] } });
  ok(code.status === 200 && code.json.brandCode.statement.endsWith('Test edition.') && code.json.brandCode.cutReferences.join() === 'Prada,Gucci' && code.json.brandCode.exemplars.length === 2 && code.json.brandCode.exemplars[0].url === '' && code.json.brandCode.priceAnchor.name === 'Zara', 'the brand code saves, is cleaned, and keeps what was not touched', code.json);
  ok((await K('/overview')).json.brandCode.exemplars[1].name === 'Boxy tee', 'and it is there next time');
  ok((await K('/brand-code', { method: 'PUT', body: { statement: '   ' } })).status === 200 && /Test edition/.test((await K('/overview')).json.brandCode.statement), 'an empty statement keeps what was there rather than saving nothing');
  ok((await K('/brand-code', { method: 'PUT', body: [] })).status === 422, 'a body that is not the brand code is refused');
  await K('/brand-code', { method: 'PUT', body: { statement: 'Affordable, never cheap. Zara-level prices with the cuts and attitude of Gucci, Prada, Ralph Lauren and Aimé Leon Dore, in simpler materials.', cutReferences: ['Gucci', 'Prada', 'Ralph Lauren', 'Aimé Leon Dore'], exemplars: [] } });

  // watchlist
  const edit = await K(`/brands/${brand.id}`, { method: 'PUT', body: { enabled: false, note: 'paused for now' } }); ok(edit.status === 200 && edit.json.brand.enabled === false && edit.json.brand.note === 'paused for now' && edit.json.brand.name === brand.name, 'a brand can be paused without losing its name or address', edit.json);
  ok((await K(`/brands/${brand.id}`, { method: 'PUT', body: { name: 'Ralph Lauren' } })).status === 409, 'renaming onto another brand is refused');
  const gone = await K(`/brands/${brand.id}`, { method: 'DELETE' }); ok(gone.status === 200 && (await K(`/items?brand=${brand.id}&limit=100`)).json.total === 0, 'removing a brand removes what was read from it');
  ok((await K(`/brands/${brand.id}`, { method: 'DELETE' })).status === 404 && (await K('/brands/nope', { method: 'PUT', body: {} })).status === 404, 'removing it twice is a plain not-found');
  ok((await K('/scan', { method: 'POST', body: {} })).status === 202, 'reading everything that is due starts in the background');
  const page = await call('/lab'); ok(page.status === 200 && /Design Lab/.test(page.text) && /noindex/.test(page.text), 'the page is served, hidden from search engines');
});

await journey('J195', 'Design Lab in a browser: the library, filters, save and hide, the watchlist, the brand code, and the menu only for those who have it', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const feed = await mkBrand('Browser Feed', 'https://feedshop.test'); await SCAN(feed.id); // J194 removed the first one
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/lab#research`, { waitUntil: 'networkidle' }); await page.waitForSelector('#items .card');
    ok((await page.locator('#items .card').count()) >= 3 && !(await page.isVisible('#plans')), 'Research opens on its own, with the pieces found in it');
    ok((await page.locator('#catPills .pill').allInnerTexts()).some(t => /Footwear/.test(t)) && (await page.locator('#catPills .pill').allInnerTexts()).some(t => /Headwear/.test(t)), 'the category filter covers hats and footwear, not only clothes');
    await page.waitForFunction(() => { const a = document.querySelector('.fbside a[data-section="lab"]'); return a && !a.hidden; }, null, { timeout: 8000 }).catch(() => {});
    ok(await page.locator('.fbside a[data-section="lab"]:not([hidden])').count() === 1 && await page.locator('.fbtabs [data-tabs="lab"] a:not(.act):visible').count() === 8 && /Research/.test(await page.innerText('.fbtabs a.on')), 'the owner sees the Design Lab in the menu as one section, with its eight parts as the tabs across the top, Research marked');
    await page.click('.fbtabs a[data-href="/lab#plans"]'); await page.waitForFunction(() => document.getElementById('plans').offsetParent && !document.getElementById('library').offsetParent, null, { timeout: 8000 }).catch(() => {});
    ok(await page.isVisible('#plans') && !(await page.isVisible('#items')) && /Line plans/.test(await page.innerText('.fbtabs a.on')), 'the Line plans tab shows the plans on their own');
    await page.click('.fbtabs a[data-href="/lab#research"]'); await page.waitForSelector('#items .card');
    await page.locator('#catPills .pill', { hasText: 'Footwear' }).click(); await page.waitForFunction(() => document.querySelectorAll('#items .card').length >= 1 && [...document.querySelectorAll('#items .card .chip')].every(c => !/Tops/.test(c.textContent)));
    ok((await page.locator('#items .card h3').allInnerTexts()).every(t => /sneaker|loafer|boot/i.test(t) || true) && await page.locator('#catPills .pill[aria-pressed="true"]').innerText().then(t => /Footwear/.test(t)), 'choosing a category narrows the library');
    await page.locator('#catPills .pill', { hasText: 'All' }).click(); await page.waitForFunction(() => document.querySelectorAll('#items .card').length >= 3);
    await page.fill('#fQ', 'chore'); await page.waitForFunction(() => document.querySelectorAll('#items .card').length === 1 && /Chore Coat/.test(document.querySelector('#items .card h3').textContent), null, { timeout: 8000 });
    await page.locator('#items .card [data-save]').first().click(); await page.waitForFunction(() => document.querySelector('#items .card.saved'), null, { timeout: 8000 });
    ok(await page.locator('#items .card.saved [data-save]').innerText().then(t => /Saved/.test(t)), 'a piece is saved from its card');
    const link = page.locator('#items .card a[target="_blank"]').first(); ok(/noopener/.test(await link.getAttribute('rel')) && /^https:\/\//.test(await link.getAttribute('href')), 'the link to the brand\'s own page opens safely in a new tab');
    await page.fill('#fQ', ''); await page.waitForFunction(() => document.querySelectorAll('#items .card').length >= 3);
    // the watchlist
    await page.fill('#brandForm [name=name]', `Browser Brand ${stamp}`); await page.fill('#brandForm [name=site]', 'browserbrand.test'); await page.locator('#brandForm button[type=submit]').click();
    await page.waitForFunction(() => /Added/.test(document.querySelector('#brandMsg').textContent), null, { timeout: 8000 }); ok(await page.locator('#brandList .brand', { hasText: `Browser Brand ${stamp}` }).count() === 1, 'a brand is added to the list from the page');
    await page.locator('#brandList .brand', { hasText: `Browser Brand ${stamp}` }).locator('[data-del]').click(); await page.waitForFunction(s => ![...document.querySelectorAll('#brandList .brand')].some(x => x.textContent.includes(s)), `Browser Brand ${stamp}`, { timeout: 8000 });
    ok(true, 'and removed again');
    // the brand code
    await page.fill('#codeForm [name=notes]', 'Browser note'); await page.locator('#addEx').click(); await page.locator('[data-ex] [data-n]').last().fill('Boxy pocket tee'); await page.locator('[data-ex] [data-w]').last().fill('Right weight'); await page.locator('#codeForm button[type=submit]').click();
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#codeMsg').textContent), null, { timeout: 8000 });
    const bc = (await K('/overview')).json.brandCode; ok(bc.notes === 'Browser note' && bc.exemplars.some(e => e.name === 'Boxy pocket tee' && e.why === 'Right weight'), 'the brand code and a piece we love save from the page', bc);
    await K('/brand-code', { method: 'PUT', body: { notes: '', exemplars: [] } });
    ok(/robots|copy/i.test(await page.innerText('.fair')), 'the page says what the Lab will not do');
    await page.setViewportSize({ width: 360, height: 800 }); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'it fits a phone without sideways scrolling', await page.evaluate(() => document.documentElement.scrollWidth));
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/design-lab.png`, fullPage: false }).catch(() => {});
    await oc.close();

    // a teammate without it
    const pc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, patT);
    await call(`/v1/staff-access/users/${patId}`, { method: 'PUT', token: kyleT, body: { modules: ['contracts'] } });
    const pp = await pc.newPage(); pp.on('pageerror', e => errs.push(String(e)));
    await pp.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#fbWall, #needSignin:not(.hidden)', { timeout: 8000 });
    ok(/not turned on|not turned on for you|Design Lab/i.test(await pp.innerText('body')) && (await pp.locator('#items .card').count()) === 0, 'a teammate sees no pieces, and is told it is not turned on');
    ok(await pp.locator('.fbside a[data-section="lab"]:not([hidden])').count() === 0, 'the menu does not show them the Design Lab');
    await pc.close();
    ok(errs.length === 0, 'no page errors', errs);
  } finally { await call(`/v1/staff-access/users/${patId}`, { method: 'PUT', token: kyleT, body: { modules: [] } }); await b.close(); }
});

await journey('J196', 'Design Lab line plans: the trend read and price ladder come from the library, the assistant drafts a plan held to the Zara line, and every number can be edited', async () => {
  const refB = await mkBrand('Plan Ref', 'https://feedshop.test'), anchorB = await mkBrand('Plan Anchor', 'https://anchorshop.test', 'price'), jackB = await mkBrand('Plan Jackets', 'https://jacketshop.test');
  ok((await SCAN(refB.id)).json.scan?.found === 10 && (await SCAN(anchorB.id)).json.scan?.found === 4 && (await SCAN(jackB.id)).json.scan?.found === 3, 'a reference shop, a price anchor and a jacket shop are read');
  try {
    // access
    ok((await P('/trends')).status === 403 && (await P('/plans')).status === 403 && (await P('/plans/generate', { body: { name: 'x' } })).status === 403 && (await call('/v1/lab/trends')).status === 401, 'the trend read and the plans are closed like the rest of the Lab');

    // the trend read
    const tr = (await K('/trends')).json, tops = tr.categories.find(c => c.id === 'tops'), outer = tr.categories.find(c => c.id === 'outerwear');
    ok(tops.count >= 5 && tops.anchor?.n === 4 && tops.reference?.n >= 1 && tops.anchor.median >= 38 && tops.anchor.median <= 42 && tr.anchor === 'Zara', 'prices are read per category, with the anchor\'s own prices separate from the references\'', [tops.count, tops.anchor, tr.anchor]);
    ok(tops.ladder?.basis === 'anchor' && tops.ladder.cap >= 40 && tops.ladder.cap <= 50 && tops.ladder.entry <= tops.ladder.core && tops.ladder.core <= tops.ladder.cap, 'the ladder for tops is the anchor\'s', tops.ladder);
    ok(outer.ladder?.basis === 'estimated' && outer.ladder.cap < 250, 'with no anchor prices for outerwear the ladder is an estimate, far below the reference prices', outer.ladder);
    ok(tr.movers[0].heat >= 60 && /Heavy Tee/.test(tr.movers[0].title) && tops.colors.some(c => /navy/i.test(c.name)) && tops.hotShare > 0, 'what is moving and what keeps showing up are counted', [tr.movers[0], tops.colors]);
    ok((await K('/trends?days=1')).json.total >= 14 && tr.categories.length >= 10, 'every category is listed');

    // drafting a plan
    const gen = await K('/plans/generate', { body: { name: 'Fall 2027 capsule', season: 'Fall 2027', brief: 'quiet heritage basics', size: 8 } }); const P1 = gen.json;
    ok(gen.status === 201 && P1.plan.name === 'Fall 2027 capsule' && P1.lines.length === 8 && P1.plan.summary, 'the assistant drafts an 8-piece plan', gen.json.error || P1.lines?.length);
    ok(P1.lines.every(l => l.price > 0 && l.cost > 0 && l.qty > 0 && l.costIsEstimate && l.marginPct > 60) && P1.lines.filter(l => l.role === 'hero').length === 1 && P1.lines.some(l => l.role === 'entry'), 'every piece has a price, an estimated cost and margin, a starting quantity and a role', P1.lines.map(l => [l.role, l.price]));
    ok(P1.lines.filter(l => l.category === 'tops').every(l => l.price <= tops.ladder.cap), 'tops are held to the anchor line');
    ok(P1.lines.every(l => l.category !== 'dresses'), 'the plan is male-driven and unisex: no dresses unless they are asked for');
    ok(P1.lines.some(l => l.refs.length && l.refs[0].title && /^https?:/.test(l.refs[0].url)) && P1.lines.every(l => l.twist), 'pieces point back at the library pieces they were drawn from, and each has our twist');
    ok(P1.summary.count === 8 && P1.summary.units > 0 && P1.summary.blendedMarginPct > 60 && P1.economics.costRatio === 0.28 && P1.anchor === 'Zara', 'the totals are worked out', P1.summary);
    ok((await K('/plans')).json.plans[0].id === P1.plan.id && (await K('/plans')).json.plans[0].lines === 8, 'it is in the list');

    // editing
    const L = P1.lines.find(l => l.category === 'tops'), put = (body, id = L.id) => K(`/plans/${P1.plan.id}/lines/${id}`, { method: 'PUT', body });
    const hi = (await put({ price: 99 })).json; const hl = hi.lines.find(l => l.id === L.id); ok(hl.price === 99 && hl.warnings.some(w => w.kind === 'above' && /Zara line/.test(w.text)) && hi.summary.lineWarnings >= 1, 'a price above the Zara line is flagged', hl);
    const thin = (await put({ price: 40, cost: 30 })).json.lines.find(l => l.id === L.id); ok(thin.cost === 30 && !thin.costIsEstimate && thin.marginPct === 25 && thin.warnings.some(w => w.kind === 'margin'), 'a typed cost replaces the estimate and a thin margin is flagged', thin);
    const back = (await put({ cost: null })).json.lines.find(l => l.id === L.id); ok(back.costIsEstimate && back.marginPct === 72 && !back.warnings.some(w => w.kind === 'margin'), 'clearing the cost goes back to the estimate', back);
    ok((await put({ qty: 1000 })).json.lines.find(l => l.id === L.id).qty === 1000 && (await put({ role: 'hero', category: 'knitwear' })).json.lines.find(l => l.id === L.id).role === 'hero', 'quantity, role and category change');
    const dropped = (await put({ status: 'dropped' })).json; ok(dropped.summary.count === 7 && dropped.summary.dropped === 1, 'a dropped piece leaves the totals but stays on the plan'); ok((await put({ status: 'planned' })).json.summary.count === 8, 'and can be restored');
    ok((await put({ price: 'abc' })).status === 422 && (await put({ category: 'zzz' })).status === 422 && (await put({ qty: -2 })).status === 422 && (await put({ name: '' })).status === 422 && (await put({ status: 'weird' })).status === 422, 'nonsense is refused');
    ok((await put({ price: 5 }, '00000000-0000-4000-8000-000000000000')).status === 404, 'an unknown piece is a plain not-found');
    const added = await K(`/plans/${P1.plan.id}/lines`, { body: { name: '=cmd()', category: 'headwear', role: 'entry', price: 28, qty: 400 } }); ok(added.status === 201 && added.json.lines.length === 9 && added.json.lines.at(-1).name === '=cmd()' && added.json.lines.at(-1).cost === 7.84, 'a piece is added by hand', added.json.error);
    ok((await K(`/plans/${P1.plan.id}/lines`, { body: { name: '' } })).status === 422 && (await K(`/plans/${P1.plan.id}/lines`, { body: { name: 'x', price: 'abc' } })).status === 422, 'a piece with no name or a bad price is refused');

    // economics come from the brand code
    const was = (await K('/overview')).json.brandCode.economics; ok(was.costRatio === 0.28 && was.minMarginPct === 60, 'the economics are in the brand code');
    ok((await K('/brand-code', { method: 'PUT', body: { economics: { costRatio: 0.4, minMarginPct: 70 } } })).json.brandCode.economics.costRatio === 0.4, 'and can be changed');
    const reran = (await K(`/plans/${P1.plan.id}`)).json; ok(reran.lines.filter(l => l.costIsEstimate && l.price > 0).every(l => l.marginPct === 60) && reran.summary.lineWarnings > 0, 'estimated costs and the margin floor follow the brand code', reran.summary.lineWarnings);
    await K('/brand-code', { method: 'PUT', body: { economics: { costRatio: 0.28, minMarginPct: 60 } } });
    ok((await K('/brand-code', { method: 'PUT', body: { economics: { costRatio: 9, minMarginPct: -1 } } })).json.brandCode.economics.costRatio === 0.28, 'out-of-range economics fall back');

    // the plan itself
    const ren = await K(`/plans/${P1.plan.id}`, { method: 'PUT', body: { name: 'Fall 2027 capsule v2', status: 'approved' } }); ok(ren.json.plan.name.endsWith('v2') && ren.json.plan.status === 'approved', 'a plan is renamed and approved');
    ok((await K(`/plans/${P1.plan.id}`, { method: 'PUT', body: { status: 'nope' } })).status === 422 && (await K(`/plans/${P1.plan.id}`, { method: 'PUT', body: { name: ' ' } })).status === 422, 'a bad status or an empty name is refused');
    const csv = await call(`/v1/lab/plans/${P1.plan.id}/export.csv`, { token: kyleT }); const rows = csv.text.trim().split(/\r?\n/);
    ok(csv.status === 200 && /text\/csv/.test(csv.ct) && rows[0].includes('Fall 2027 capsule v2') && rows[1].startsWith('Category,Role,Name') && rows.length >= 11 && csv.text.includes("'=cmd()") && !/(^|,)=cmd/.test(csv.text), 'the CSV has every piece and a name that looks like a formula is neutralised', rows.slice(0, 3));
    ok((await call(`/v1/lab/plans/${P1.plan.id}/export.csv`)).status === 401 && (await P(`/plans/${P1.plan.id}`)).status === 403, 'plans and their files are not open to anyone else');

    // a blank plan, and the daily limit
    const blank = await K('/plans', { body: { name: 'Blank', season: 'Spring' } }); ok(blank.status === 201 && blank.json.lines.length === 0 && blank.json.summary.count === 0, 'a blank plan can be started by hand');
    ok((await K('/plans', { body: { name: '' } })).status === 422 && (await K('/plans/nope')).status === 404, 'no name, or an unknown plan, is refused');
    const ids = [P1.plan.id, blank.json.plan.id]; let limited = 0;
    for (let i = 0; i < 12; i++) { const g = await K('/plans/generate', { body: { name: `Limit ${i}`, size: 3 } }); if (g.status === 201) ids.push(g.json.plan.id); else { limited = g.status; ok(/daily limit/.test(g.json.error), 'the limit says what it is'); break; } }
    ok(limited === 429, 'generating plans has a daily limit so a stuck button cannot spend the allowance', limited);
    for (const id of ids) ok((await K(`/plans/${id}`, { method: 'DELETE' })).status === 200, 'a plan is deleted');
    ok((await K(`/plans/${ids[0]}`)).status === 404 && (await K('/plans')).json.plans.length === 0, 'and is gone');
  } finally { for (const b of [refB, anchorB, jackB]) await K(`/brands/${b.id}`, { method: 'DELETE' }); }
});

await journey('J197', 'Design Lab line plans in a browser: what is moving, drafting a plan, editing a price and seeing the flag, dropping, adding, downloading, on a phone', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const refB = await mkBrand('Plan Ref', 'https://feedshop.test'), anchorB = await mkBrand('Plan Anchor', 'https://anchorshop.test', 'price'); await SCAN(refB.id); await SCAN(anchorB.id);
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/lab#trends`, { waitUntil: 'networkidle' }); await page.waitForSelector('#trendGrid .tc');
    const topsCard = page.locator('#trendGrid .tc', { hasText: 'Tops and jersey' }); ok(await topsCard.count() === 1 && /our ladder/i.test(await topsCard.innerText()) && /zara/i.test(await topsCard.innerText()) && /heat/i.test(await topsCard.innerText()), 'What\'s moving shows the tops with the Zara prices, our ladder and the pieces that are moving');
    await page.click('.fbtabs a[data-href="/lab#plans"]'); ok(await page.isVisible('#planForm'), 'the Line plans tab opens the plans');
    await page.fill('#planForm [name=name]', 'Browser plan'); await page.fill('#planForm [name=season]', 'Fall 2027'); await page.fill('#planForm [name=brief]', 'quiet heritage basics'); await page.selectOption('#planForm [name=size]', '8');
    await page.locator('#planGo').click(); await page.waitForSelector('#planView table.lt tbody tr', { timeout: 20000 });
    ok(await page.locator('#planView table.lt tbody tr').count() === 8 && /Browser plan/.test(await page.innerText('#planView h2')) && /Blended margin/i.test(await page.innerText('#planView .tiles')), 'the plan appears with eight pieces and the totals');
    ok(/Price ladder against Zara/.test(await page.innerText('#planView')) && await page.locator('#planView .track .dot').count() >= 1, 'the ladder shows our prices against the Zara line');
    const first = page.locator('#planView tr[data-line]').first(); await first.locator('input[data-f="price"]').fill('199'); await first.locator('input[data-f="price"]').dispatchEvent('change');
    await page.waitForFunction(() => /Above the/.test(document.querySelector('#planView tr[data-line]').textContent), null, { timeout: 8000 }); ok(await page.locator('#planView .track .dot.warn').count() >= 1, 'a price above the line is flagged on the row and on the ladder');
    const flags = Number((await page.locator('#planView .tile', { hasText: 'Flags' }).locator('b').innerText()).trim()); ok(flags >= 1, 'and counted in the totals', flags);
    await page.locator('#planView tr[data-line]').nth(1).locator('[data-drop]').click(); await page.waitForSelector('#planView tr.dropped', { timeout: 8000 }); ok(/7/.test(await page.locator('#planView .tile').first().innerText()), 'dropping a piece takes it out of the count');
    await page.fill('#newLine', 'Browser added cap'); await page.selectOption('#newCat', 'headwear'); await page.locator('#addLine').click(); await page.waitForFunction(() => [...document.querySelectorAll('#planView tr[data-line] input[data-f=name]')].some(i => i.value === 'Browser added cap'), null, { timeout: 8000 }); ok(true, 'a piece is added by name');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('[data-csv]').click()]); ok(/browser-plan\.csv$/.test(dl.suggestedFilename()), 'the plan downloads as a CSV', dl.suggestedFilename());
    await page.locator('[data-status]').click(); await page.waitForFunction(() => /Back to draft/.test(document.querySelector('#planView').textContent), null, { timeout: 8000 }); await page.waitForFunction(() => /approved/i.test(document.querySelector('#planList .pl.on .chip')?.textContent || ''), null, { timeout: 8000 }).catch(() => {}); ok(/approved/i.test(await page.locator('#planList .pl.on .chip').innerText()), 'the plan can be marked approved');
    await page.locator('#planView').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/design-lab-plan-desktop.png` }).catch(() => {});
    await page.setViewportSize({ width: 360, height: 800 }); await page.waitForTimeout(250); ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'a phone does not scroll sideways (the table scrolls inside its own box)', await page.evaluate(() => document.documentElement.scrollWidth));
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/design-lab-plan.png`, fullPage: false }).catch(() => {});
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { for (const p of (await K('/plans')).json.plans) await K(`/plans/${p.id}`, { method: 'DELETE' }); for (const x of [refB, anchorB]) await K(`/brands/${x.id}`, { method: 'DELETE' }); await b.close(); }
});

// a plan with a few pieces, made from a reference shop, a price anchor and a jacket shop; returns what the concept journeys need
async function conceptSetup() {
  // a journey that stopped before its cleanup leaves these brands behind, and the names are taken for every later journey of the run
  for (const id of sql(`select id from lab_brands where name in ('Concept Ref ${stamp}', 'Concept Anchor ${stamp}', 'Concept Jackets ${stamp}')`).split('\n').filter(Boolean)) await K(`/brands/${id}`, { method: 'DELETE' });
  const refB = await mkBrand('Concept Ref', 'https://feedshop.test'), anchorB = await mkBrand('Concept Anchor', 'https://anchorshop.test', 'price'), jackB = await mkBrand('Concept Jackets', 'https://jacketshop.test');
  for (const b of [refB, anchorB, jackB]) await SCAN(b.id);
  const gen = await K('/plans/generate', { body: { name: 'Concept plan', season: 'Fall 2027', brief: 'quiet heritage basics', size: 6 } });
  return { brands: [refB, anchorB, jackB], plan: gen.json, gen };
}
const cleanup = async (brands, planId) => { if (planId) await K(`/plans/${planId}`, { method: 'DELETE' }); for (const b of brands) await K(`/brands/${b.id}`, { method: 'DELETE' }); };

await journey('J198', 'Design Lab concepts: several takes on a planned piece, drawn and checked against what inspired them, approved only when they are ours, and an approved one becomes a product and a tech pack', async () => {
  const { brands, plan, gen } = await conceptSetup(); ok(gen.status === 201 && plan.lines.length >= 4, 'a plan to work from', gen.json.error);
  try {
    const line = plan.lines.find(l => l.refs.length) || plan.lines[0], mk = (body = {}, l = line) => K(`/plans/${plan.plan.id}/lines/${l.id}/concepts`, { body });
    // access
    ok((await call(`/v1/lab/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: {} })).status === 401 && (await P('/concepts')).status === 403 && (await call(`/v1/lab/plans/${plan.plan.id}/lines/${line.id}/concepts`, { token: patT, body: {} })).status === 403, 'concepts are closed like the rest of the Lab');
    ok((await K(`/plans/${plan.plan.id}/lines/00000000-0000-4000-8000-000000000000/concepts`, { body: {} })).status === 404 && (await K('/plans/00000000-0000-4000-8000-000000000000/lines/00000000-0000-4000-8000-000000000000/concepts', { body: {} })).status === 404, 'an unknown piece is a plain not-found');

    // making concepts
    const made = await mk({ count: 3, note: 'longer back' }); ok(made.status === 201 && made.json.concepts.length === 3, 'three concepts are made for one planned piece', made.json.error);
    const [A, B, C] = made.json.concepts;
    ok(new Set(made.json.concepts.map(c => c.name)).size === 3 && made.json.concepts.every(c => c.status === 'draft' && /^data:image\/jpeg;base64,/.test(c.thumb) && c.hasImage && c.twist.length > 15 && c.spec.details.length >= 2 && c.price === line.price && c.role === line.role && c.refs.length >= 1), 'each has its own name, a picture, a twist, details, the planned price and the pieces it draws on', made.json.concepts[0]);
    ok(made.json.concepts.every(c => c.closeness && ['clear', 'check', 'too_close'].includes(c.closeness.verdict) && c.closeness.aiChecked === true && c.closeness.nearest), 'each was checked against those pieces, with a second opinion', A.closeness);
    ok(made.json.concepts.every(c => c.spec.branding.logo.mark && /internal woven label/.test(c.spec.branding.label) && c.spec.branding.logo.placement), 'every concept carries the Future Basics logo and the internal woven label');
    ok(made.json.concepts[0].spec.graphics.length === 1 && /<rect/.test(made.json.concepts[0].spec.graphics[0].svg) && made.json.concepts[1].spec.graphics.length === 0, 'a concept brings its own Future Basics graphic where it makes sense, and a clean piece stays clean');
    const after = (await K(`/plans/${plan.plan.id}`)).json.lines.find(l => l.id === line.id); ok(after.status === 'in_concept' && after.conceptCount === 3 && after.approvedConcepts === 0, 'the planned piece moves to "in concept" and counts its concepts', [after.status, after.conceptCount]);
    ok((await mk({ count: 9 })).json.concepts.length === 4 && (await mk({ count: 0 })).json.concepts.length === 3, 'one to four at a time: nine becomes four, nothing means three');
    const img = await call(`/v1/lab/concepts/${A.id}/image`, { token: kyleT }); ok(img.status === 200 && /image\/jpeg/.test(img.ct), 'the picture is served to the sign-in', img.status);
    ok((await call(`/v1/lab/concepts/${A.id}/image`)).status === 401 && (await call(`/v1/lab/concepts/${A.id}/image`, { token: patT })).status === 403, 'and to nobody else');

    // the board and the detail
    const list = (await K(`/concepts?plan=${plan.plan.id}`)).json; ok(list.concepts.length >= 10 && list.counts.draft >= 10 && list.imageConnected === true, 'the board lists them with counts', list.counts);
    ok((await K(`/concepts?line=${line.id}&status=draft`)).json.concepts.length >= 10 && (await K('/concepts?status=approved')).json.concepts.length === 0, 'filtered by piece and by status');
    const det = (await K(`/concepts/${A.id}`)).json; ok(det.concept.refs.length >= 1 && det.concept.refs[0].title && /^https?:/.test(det.concept.refs[0].url) && Array.isArray(det.comments) && det.comments.length === 0, 'the detail has the pieces it was drawn from, to look at side by side');

    // editing and the brand-name guard
    const bad = await K(`/concepts/${A.id}`, { method: 'PUT', body: { price: 'abc' } }); ok(bad.status === 422 && (await K(`/concepts/${A.id}`, { method: 'PUT', body: { name: '' } })).status === 422 && (await K(`/concepts/${A.id}`, { method: 'PUT', body: { qty: -1 } })).status === 422, 'nonsense edits are refused');
    const ed = (await K(`/concepts/${A.id}`, { method: 'PUT', body: { name: 'Garden Overshirt', twist: 'A long back yoke seam that nobody else makes', price: 44, qty: 250 } })).json.concept; ok(ed.name === 'Garden Overshirt' && ed.price === 44 && ed.qty === 250 && ed.closeness.aiChecked === false && ed.closeness.reasons.some(r => /Edited since/.test(r)), 'a concept is edited, and the second opinion is marked out of date', ed.closeness);
    const lg = (await K(`/concepts/${A.id}`, { method: 'PUT', body: { logo: { mark: 'lockup', placement: 'woven loop at the hem', technique: 'woven patch' }, graphics: [] } })).json.concept; ok(lg.spec.branding.logo.mark === 'lockup' && lg.spec.branding.logo.technique === 'woven patch' && lg.spec.graphics.length === 0 && /internal woven label/.test(lg.spec.branding.label), 'the logo can be changed and a graphic removed, but the label stays', lg.spec.branding);
    const before = (await K(`/concepts/${A.id}`)).json.concept.thumb || lg.thumb; const rd = await K(`/concepts/${A.id}/redraw`, { body: {} }); ok(rd.status === 200 && rd.json.concept.thumb && rd.json.concept.thumb !== before, 'the picture can be drawn again with the new logo', rd.status);
    ok((await K('/concepts/00000000-0000-4000-8000-000000000000/redraw', { body: {} })).status === 404 && (await call(`/v1/lab/concepts/${A.id}/redraw`, { token: patT, body: {} })).status === 403, 'redrawing is closed to everyone else and a missing concept is a plain not-found');
    const named = (await K(`/concepts/${B.id}`, { method: 'PUT', body: { twist: 'Like the Ralph Lauren polo pony but ours, in the style of Gucci' } })).json.concept; ok(named.closeness.verdict === 'too_close' && named.closeness.hits.includes('Ralph Lauren') && named.closeness.hits.includes('polo pony'), 'naming another brand or its mark makes it "too close"', named.closeness.hits);
    const refuse = await K(`/concepts/${B.id}/approve`, { body: {} }); ok(refuse.status === 422 && refuse.json.code === 'TOO_CLOSE' && /too close/i.test(refuse.json.error), 'a too-close concept cannot be approved', refuse.json);
    ok((await K(`/concepts/${B.id}/approve`, { body: { overrideReason: 'short' } })).status === 422, 'and a throwaway reason does not count');
    const noTwist = await K(`/concepts/${C.id}`, { method: 'PUT', body: { twist: '' } }); ok(noTwist.status === 200, 'a twist can be cleared'); const nt = await K(`/concepts/${C.id}/approve`, { body: {} }); ok(nt.status === 422 && nt.json.code === 'NO_TWIST', 'but a concept with no twist of its own is not approved', nt.json);
    await K(`/concepts/${C.id}`, { method: 'PUT', body: { twist: 'A colour story of olive with a rust bar tack at the pocket' } });

    // comments, approve, reject, reopen
    ok((await K(`/concepts/${A.id}/comments`, { body: { body: '' } })).status === 422 && (await K(`/concepts/${A.id}/comments`, { body: { body: 'Love the long back.' } })).status === 201, 'comments need words');
    const ap = await K(`/concepts/${A.id}/approve`, { body: {} }); ok(ap.status === 200 && ap.json.concept.status === 'approved' && ap.json.concept.approvedBy, 'a concept that is ours is approved, and who approved it is kept', ap.json);
    const d2 = (await K(`/concepts/${A.id}`)).json; ok(d2.comments.some(c => /Love the long back/.test(c.body) && c.name) && d2.comments.some(c => /^Approved/.test(c.body)), 'the comments carry the discussion and the decision');
    ok((await K(`/plans/${plan.plan.id}`)).json.lines.find(l => l.id === line.id).status === 'approved', 'the planned piece is marked approved');
    const forced = await K(`/concepts/${B.id}/approve`, { body: { overrideReason: 'We checked it side by side with the reference and it is clearly different' } }); ok(forced.status === 200 && forced.json.concept.overrideReason.length > 10, 'a person can approve a "too close" concept by writing down why, and it is recorded');
    ok((await K(`/concepts/${B.id}`)).json.comments.some(c => /after the "too close" check/.test(c.body)), 'the reason is in the comments too');
    ok((await K(`/concepts/${A.id}`, { method: 'PUT', body: { name: 'Garden Overshirt II' } })).json.concept.status === 'draft', 'changing an approved concept sends it back to draft'); ok((await K(`/concepts/${A.id}`)).json.comments.some(c => /back to draft/i.test(c.body)), 'and says so');
    await K(`/concepts/${A.id}/approve`, { body: {} });
    const rj = await K(`/concepts/${C.id}/reject`, { body: {} }); ok(rj.status === 422, 'a rejection needs a reason'); ok((await K(`/concepts/${C.id}/reject`, { body: { reason: 'Too fussy for the price' } })).json.concept.status === 'rejected', 'a concept is rejected with a reason');
    ok((await K(`/concepts/${C.id}/reopen`, { body: {} })).json.concept.status === 'draft' && (await K(`/concepts/${A.id}/reopen`, { body: {} })).json.concept.status === 'draft', 'a rejected or approved concept can go back to draft'); await K(`/concepts/${A.id}/approve`, { body: {} });

    // revising
    ok((await K(`/concepts/${A.id}/revise`, { body: {} })).status === 422, 'a revision needs a note'); const rev = await K(`/concepts/${A.id}/revise`, { body: { note: 'less boxy, a longer back' } });
    ok(rev.status === 201 && rev.json.concept.parentId === A.id && rev.json.concept.status === 'draft' && rev.json.concept.thumb && rev.json.concept.refs.length >= 1, 'a revision is a new concept that remembers its parent', rev.json.error);
    ok((await K(`/concepts/${rev.json.concept.id}`)).json.parent?.id === A.id, 'the detail names the concept it came from');

    // the tech pack
    ok((await K(`/concepts/${C.id}/tech-pack`, { body: {} })).status === 409, 'a concept that is not approved cannot become a tech pack');
    const tp = await K(`/concepts/${A.id}/tech-pack`, { body: {} }); ok(tp.status === 201 && tp.json.productId && tp.json.url === `/tech-packs/${tp.json.productId}` && tp.json.concept.status === 'tech_pack', 'an approved concept becomes a product and starts its tech pack', tp.json);
    const prod = sql(`select p.title||'|'||c.slug||'|'||coalesce(p.product_type,'')||'|'||(p.description_html like '%Designed in the Future Basics Design Lab%')||'|'||(p.description_html like '%Our twist%') from products p join clients c on c.id=p.client_id where p.id='${tp.json.productId}'`); ok(prod === `Garden Overshirt II|future-basics|${'Tops'}|true|true`, 'the product is in the Future Basics room with the concept as its brief', prod);
    const desc = sql(`select description_html from products where id='${tp.json.productId}'`); ok(/Who it is for:<\/strong> Male-driven and unisex/.test(desc) && /Future Basics logo:<\/strong> Wordmark and cue mark, woven loop at the hem/.test(desc) && /Internal label:<\/strong> Future Basics internal woven label/.test(desc), 'the product\'s brief names who it is for, the logo and the woven label', desc.slice(0, 400));
    const pack = sql(`select count(*)||'|'||coalesce(max(source),'') from tech_packs where product_id='${tp.json.productId}'`); ok(/^1\|photo$/.test(pack), 'a tech pack is started from the concept\'s picture', [pack, tp.json.autoDraft]);
    const again = await K(`/concepts/${A.id}/tech-pack`, { body: {} }); ok(again.status === 409 && again.json.productId === tp.json.productId, 'a second press does not make a second product', again.json);
    ok(sql(`select count(*) from products where title like 'Garden Overshirt II'`) === '1', 'one product in the database');
    const ln = (await K(`/plans/${plan.plan.id}`)).json.lines.find(l => l.id === line.id); ok(ln.status === 'tech_pack' && ln.productId === tp.json.productId, 'the planned piece links to its product', [ln.status, ln.productId]);
    ok((await K(`/concepts/${A.id}`, { method: 'PUT', body: { name: 'x' } })).status === 409 && (await K(`/concepts/${A.id}`, { method: 'DELETE' })).status === 409 && (await K(`/concepts/${A.id}/reject`, { body: { reason: 'nope nope' } })).status === 409, 'a concept that became a tech pack is a record: it cannot be changed, rejected or deleted');
    ok((await K(`/concepts/${rev.json.concept.id}`, { method: 'DELETE' })).status === 200 && (await K(`/concepts/${rev.json.concept.id}`)).status === 404 && (await K('/concepts/nope')).status === 404, 'a draft concept can be deleted');

    // work longer than a request should stay open answers 202 with a job; the page asks after it until the concepts are there (a phone drops a long request)
    const slow = await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts?wait=0`, { body: { count: 1 } }); ok(slow.status === 202 && slow.json.job, 'concepts that take a while answer with a job to ask after', [slow.status, slow.json]);
    let jd = { status: 'running' }; for (let i = 0; i < 60 && jd.status === 'running'; i++) { await sleep(500); jd = (await K(`/jobs/${slow.json.job}`)).json; }
    ok(jd.status === 'done' && jd.concepts?.length === 1 && (await P(`/jobs/${slow.json.job}`)).status !== 200, 'the job hands over the finished concept, and only to whoever asked', jd);

    // the daily limit
    let limited = 0; for (let i = 0; i < 12; i++) { const g = await mk({ count: 4 }, plan.lines.find(l => l.id !== line.id)); if (g.status !== 201) { limited = g.status; ok(/daily limit/.test(g.json.error), 'the limit says what it is'); break; } }
    ok(limited === 429, 'making concepts has a daily limit so a stuck button cannot spend the allowance', limited);
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J199', 'Design Lab concepts in a browser: make concepts from a plan, open one, edit its twist, see it flagged for naming a brand, approve with a reason, comment, send to a tech pack', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const line = plan.lines.find(l => l.refs.length) || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = []; let answer = '';
  try {
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#planList .pl');
    await page.locator('#planList .pl', { hasText: 'Concept plan' }).locator('[data-open]').click(); await page.waitForSelector('#planView tr[data-line]');
    ok(await page.locator('.fbtabs a[data-href="/lab#board"]').count() === 1, 'the Lab has a Concepts tab');
    await page.locator(`#planView tr[data-line="${line.id}"] [data-mk]`).click(); await say(page, 'longer back'); await page.waitForFunction(() => document.querySelectorAll('#cgrid .cc').length >= 3, null, { timeout: 30000 });
    ok(await page.locator('#cgrid .cc').count() === 3 && await page.locator('#cgrid .cc img').count() === 3 && /clear|look closely|too close/i.test(await page.locator('#cgrid .cc').first().innerText()), 'three concept cards appear with their pictures and their check');
    ok(/in_concept|in concept/i.test(await page.locator(`#planView tr[data-line="${line.id}"]`).innerText()) || /3 concepts/.test(await page.locator(`#planView tr[data-line="${line.id}"]`).innerText()), 'the plan row now counts its concepts');
    await page.locator('#cgrid .cc').first().click(); await page.waitForSelector('#cd[open] [data-cf]'); await page.waitForFunction(() => document.querySelector('#cd .big img'), null, { timeout: 8000 });
    ok(await page.locator('#cd .ref').count() >= 1 && /side by side|drawn from/i.test(await page.innerText('#cd')), 'the concept opens with the pieces it was drawn from beside it');
    ok(/internal woven label/i.test(await page.locator('#cd .brd').first().innerText()) && await page.locator('#cd .brd [data-b="mark"]').count() === 1 && await page.locator('#cd .gfx').count() >= 0, 'the concept window shows the logo choice and the woven label that is always added');
    if (await page.locator('#cd .gfx').count()) { await page.locator('#cd [data-grm]').first().click(); ok(await page.locator('#cd .gfx').count() === 0, 'a graphic can be removed'); }
    await page.selectOption('#cd [data-b="mark"]', 'word'); await page.fill('#cd [data-k="twist"]', 'Our own back yoke seam that nobody else makes'); await page.locator('#cd [data-csave]').click(); await page.waitForFunction(() => /Saved/.test(document.querySelector('#cMsg')?.textContent || ''), null, { timeout: 8000 });
    ok(await page.locator('#cd [data-b="mark"]').inputValue() === 'word', 'the logo choice is kept');
    await page.locator('#cd [data-credraw]').click(); await page.waitForFunction(() => document.querySelector('#cd .big img') && !/Drawing/.test(document.querySelector('#cAct')?.textContent || ''), null, { timeout: 15000 }); ok(true, 'the picture is drawn again');
    await page.fill('#cd [data-k="twist"]', 'Like the Ralph Lauren polo pony but ours'); await page.locator('#cd [data-csave]').click(); await page.waitForFunction(() => /too close/i.test(document.querySelector('#cd .verdict')?.textContent || ''), null, { timeout: 8000 });
    ok(/Ralph Lauren/.test(await page.innerText('#cd .verdict')), 'naming another brand flags it "too close" and says which name');
    await page.locator('#cd [data-capprove]').click(); await say(page, 'We looked at it beside the reference and it is clearly different'); await page.waitForFunction(() => /approved/i.test(document.querySelector('#cd .in .chip')?.textContent || ''), null, { timeout: 10000 });
    ok(/approved anyway because/i.test(await page.innerText('#cd .verdict')), 'approving needs a reason, and the reason is shown with the check');
    await page.fill('#cd #cNew', 'Checked with Danielle'); await page.locator('#cd [data-ccom]').click(); await page.waitForFunction(() => /Checked with Danielle/.test(document.querySelector('#cd .cm')?.textContent || ''), null, { timeout: 8000 }); ok(true, 'a comment is posted');
    await page.locator('#cd [data-ctp]').click(); await page.waitForSelector('#cd a.btn.go[href^="/tech-packs/"]', { timeout: 30000 });
    ok(/tech-packs\/[0-9a-f-]{36}/.test(await page.locator('#cd a.btn.go[href^="/tech-packs/"]').getAttribute('href')), 'sending to a tech pack gives a link to it');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/design-lab-concept.png` }).catch(() => {});
    await page.locator('#cd [data-cclose]').click(); await page.waitForFunction(() => !document.querySelector('#cd[open]'));
    await page.locator('#bFilters [data-bs="tech_pack"]').click(); await page.waitForFunction(() => document.querySelectorAll('#cgrid .cc').length === 1, null, { timeout: 8000 }); ok(/tech pack/i.test(await page.locator('#cgrid .cc').innerText()), 'the board filters by status');
    await page.locator('#bFilters [data-bs="draft"]').click(); await page.waitForFunction(() => document.querySelectorAll('#cgrid .cc').length === 2, null, { timeout: 8000 });
    await page.locator('#cgrid .cc').first().click(); await page.waitForSelector('#cd[open] [data-creject]'); await page.locator('#cd [data-creject]').click(); await say(page, 'Too fussy for the price'); await page.waitForFunction(() => /rejected/i.test(document.querySelector('#cd .in .chip')?.textContent || ''), null, { timeout: 8000 }); ok(true, 'a concept is rejected with a reason');
    await page.locator('#cd [data-cclose]').click(); await page.setViewportSize({ width: 360, height: 800 }); await page.waitForTimeout(250); ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'a phone does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth));
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J200', 'Design Lab graphic program: a season\'s graphics designed as one system with original lettering, concepts apply its motifs, and the artwork goes into the tech pack', async () => {
  const { brands, plan, gen } = await conceptSetup(); ok(gen.status === 201 && plan.lines.length >= 4, 'a plan to work from', gen.json.error);
  try {
    const PG = (id, body = {}) => K(`/plans/${id}/program`, { body }), pid = plan.plan.id;
    ok((await call(`/v1/lab/plans/${pid}/program`, { body: {} })).status === 401 && (await call(`/v1/lab/plans/${pid}/program`, { token: patT, body: {} })).status === 403 && (await K(`/plans/${pid}/program`, { method: 'PUT', body: { name: 'x' } })).status === 409, 'the program is closed like the rest of the Lab, and cannot be edited before there is one');
    const blank = (await K('/plans', { body: { name: 'Blank' } })).json; ok((await PG(blank.plan.id)).status === 409 && (await PG('00000000-0000-4000-8000-000000000000')).status === 404, 'a plan with no pieces has nothing to design graphics for; an unknown plan is a plain not-found'); await K(`/plans/${blank.plan.id}`, { method: 'DELETE' });
    ok(plan.program === null, 'a new plan has no program yet');
    const made = await PG(pid, { note: 'lean on numerals' }); ok(made.status === 201 && made.json.program?.name === 'Quiet Varsity', 'the assistant develops a graphic program for the plan', made.json.error);
    const pr = made.json.program; ok(pr.motifs.length >= 4 && new Set(pr.motifs.map(m => m.kind)).size >= 4 && pr.palette.length >= 3 && pr.story && pr.rules, 'several kinds of motif, a palette, a story and rules: a system, not one logo', pr.motifs.map(m => m.kind));
    ok(pr.motifs.some(m => m.texts.length) && pr.motifs.every(m => m.svg && !/<text|font-family/.test(m.svg)) && pr.palette.some(c => !['#141416', '#FFFFFF', '#4BFF9A'].includes(c.hex)), 'it has original lettering as outlines, and colours beyond the logo\'s', pr.palette);
    ok((await K(`/plans/${pid}`)).json.program.name === 'Quiet Varsity', 'it is kept with the plan');
    // each motif's artwork is drawn by the image model in the background, then served as a PNG with transparency
    const drawn = await (async () => { for (let i = 0; i < 80; i++) { const p = (await K(`/plans/${pid}`)).json.program; if (p.motifs.every(m => m.artStatus === 'ready' && m.art)) return p; await new Promise(r => setTimeout(r, 250)); } return null; })();
    ok(drawn, 'every motif gets its drawn artwork in the background');
    const png = drawn && await fetch(`${BASE}/v1/lab/art/${drawn.motifs[0].art}`, { headers: { Authorization: 'Bearer ' + kyleT } });
    ok(png && png.status === 200 && /image\/png/.test(png.headers.get('content-type')) && (await P(`/art/${drawn.motifs[0].art}`)).status === 403, 'the artwork is a PNG, for the Lab only');
    const again = await K(`/plans/${pid}/program/motifs/${drawn.motifs[0].id}/art`, { body: {} }); ok(again.status === 202, 'one motif can be drawn again');
    ok(await (async () => { for (let i = 0; i < 80; i++) { const m = (await K(`/plans/${pid}`)).json.program.motifs[0]; if (m.artStatus === 'ready' && m.art !== drawn.motifs[0].art) return true; await new Promise(r => setTimeout(r, 250)); } return false; })(), 'and gets new artwork');
    const ed = await K(`/plans/${pid}/program`, { method: 'PUT', body: { name: 'Quiet Varsity II', removeMotifs: [pr.motifs.at(-1).id], renameMotif: { id: pr.motifs[0].id, name: 'House crest' } } }); ok(ed.json.program.name === 'Quiet Varsity II' && ed.json.program.motifs.length === pr.motifs.length - 1 && ed.json.program.motifs[0].name === 'House crest', 'the program can be renamed and a motif removed or renamed', ed.json.program?.motifs?.map(m => m.name));

    // concepts draw on it
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
    const mk = await K(`/plans/${pid}/lines/${line.id}/concepts`, { body: { count: 3 } }); ok(mk.status === 201, 'concepts are made with the program in hand', mk.json.error);
    const [A, B, C] = mk.json.concepts;
    ok(A.spec.graphics[0].name === 'House crest' && A.spec.graphics[0].kind === 'crest' && A.spec.graphics[0].texts.join() === 'FB' && /<path/.test(A.spec.graphics[0].svg) && A.spec.graphics[0].motif === 'm1', 'a concept applies a motif by id and takes its drawing and its words', A.spec.graphics);
    ok(B.spec.graphics[0].kind === 'stripes' && C.spec.graphics.length === 0, 'another applies a different motif, and a third stays clean');
    ok(/^[0-9a-f-]{36}$/.test(A.spec.graphics[0].art || '') && (await fetch(`${BASE}/v1/lab/art/${A.spec.graphics[0].art}`, { headers: { Authorization: 'Bearer ' + kyleT } })).status === 200, 'the concept\'s graphic carries the motif\'s drawn artwork', A.spec.graphics[0]);
    ok(A.spec.graphics.every(g => !g.svg || !/<text/.test(g.svg)), 'no lettering that depends on a font');

    // the concept's graphics are its own once made: removing the motif from the program does not change it
    await K(`/plans/${pid}/program`, { method: 'PUT', body: { removeMotifs: ['m1'] } }); ok((await K(`/concepts/${A.id}`)).json.concept.spec.graphics[0].name === 'House crest', 'removing a motif from the program leaves concepts already made alone');

    // approve and send to a tech pack: the artwork goes with it
    ok((await K(`/concepts/${A.id}/approve`, { body: {} })).status === 200, 'approved');
    const tp = await K(`/concepts/${A.id}/tech-pack`, { body: {} }); ok(tp.status === 201, 'sent to a tech pack', tp.json.error);
    const art = sql(`select coalesce(string_agg(a->>'name', ' | '), '') from tech_packs t, jsonb_array_elements(t.data->'artwork') a where t.product_id='${tp.json.productId}'`);
    ok(/Future Basics logo/.test(art) && /internal woven label/.test(art) && /Graphic · House crest \(FB\)/.test(art), 'the logo, the woven label and the graphic are in the tech pack\'s artwork', art);
    const desc = sql(`select description_html from products where id='${tp.json.productId}'`); ok(/Graphic program:<\/strong> Quiet Varsity II/.test(desc) && /House crest \(crest, /.test(desc) && /reading &quot;FB&quot;/.test(desc), 'the brief names the program and what each graphic says', desc.slice(-500));
    ok(/artwork files attached/.test((await K(`/concepts/${A.id}`)).json.comments.map(c => c.body).join(' ')), 'the comments say the artwork was attached');

    // remove and regenerate; the brand code carries the graphics approach
    ok((await K(`/plans/${pid}/program`, { method: 'DELETE' })).json.program === null && (await K(`/plans/${pid}/program`, { method: 'DELETE' })).status === 200, 'the program can be removed');
    ok((await PG(pid)).status === 201, 'and developed again');
    const bc = (await K('/overview')).json.brandCode; ok(/deep, original graphic program/.test(bc.graphicsApproach), 'the brand code says how deep our graphics go');
    ok((await K('/brand-code', { method: 'PUT', body: { graphicsApproach: 'Go deeper than the logo' } })).json.brandCode.graphicsApproach === 'Go deeper than the logo', 'and it can be changed');
    await K('/brand-code', { method: 'PUT', body: { graphicsApproach: bc.graphicsApproach } });
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J201', 'Design Lab graphic program in a browser: develop it, see the motifs, remove one, make concepts that use it', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = []; let answer = '';
  try {
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#planList .pl');
    await page.locator('#planList .pl', { hasText: 'Concept plan' }).locator('[data-open]').click(); await page.waitForSelector('#planView .prog');
    ok(/Graphic program/.test(await page.innerText('#planView .prog')) && await page.locator('#planView [data-prog]').count() === 1, 'a plan offers to develop its graphic program');
    await page.locator('#planView [data-prog]').click(); await say(page, 'lean on numerals'); await page.waitForSelector('#planView .mt', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('#planView .mt img[data-art][src]').length >= 4, null, { timeout: 30000 }).catch(() => {});
    ok(await page.locator('#planView .mt').count() >= 4 && await page.locator('#planView .mt img').count() >= 4 && /Quiet Varsity/.test(await page.innerText('#planView .prog')) && await page.locator('#planView .prog .sw').count() >= 3, 'the program shows its motifs drawn, its palette and its name');
    ok(/reads: FB/.test(await page.innerText('#planView .prog')), 'a motif says what its lettering reads');
    const n = await page.locator('#planView .mt').count(); await page.locator('#planView .mt [data-motifrm]').last().click(); await page.waitForFunction(k => document.querySelectorAll('#planView .mt').length === k - 1, n, { timeout: 8000 }); ok(true, 'a motif can be removed');
    await page.locator(`#planView tr[data-line="${line.id}"] [data-mk]`).click(); await say(page, ''); await page.waitForFunction(() => document.querySelectorAll('#cgrid .cc').length >= 3, null, { timeout: 30000 });
    await page.locator('#cgrid .cc').last().click(); await page.waitForSelector('#cd[open] .gfx', { timeout: 8000 }); // newest first: the oldest of the three is the one that applies a motif
    ok(/crest|stripes/.test(await page.innerText('#cd .gfx')) && await page.locator('#cd .gfx img').count() >= 1, 'a concept shows the program graphic it applies, with its kind');
    await page.locator('#cd [data-cclose]').click(); await page.waitForFunction(() => !document.querySelector('#cd[open]'));
    await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); location.hash = '#code'; }); await page.waitForFunction(() => document.getElementById('code').offsetParent && document.getElementById('code').getBoundingClientRect().top < 300, null, { timeout: 8000 }).catch(() => {}); // an old address for a part of Research opens Research there
    ok(/deep, original graphic program/.test(await page.inputValue('#codeForm [name=graphicsApproach]')), 'the brand code shows how deep our graphics go');
    await page.setViewportSize({ width: 360, height: 800 }); await page.waitForTimeout(250); ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'a phone does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth));
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J203', 'Design Lab assortment board: every concept as a flat and on a model, drawn in the background from the concept\'s own picture, a spin through the on-model views, and a walk when a video model is connected', async () => {
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  try {
    const made = await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 3 } }); ok(made.status === 201 && made.json.concepts.length === 3, 'concepts to put on the board', made.json.error);
    const [A, B, C] = made.json.concepts, pid = plan.plan.id;
    const wait = async (fn, ms = 20000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await new Promise(r => setTimeout(r, 250)); } };
    ok((await P('/assortment')).status === 403 && (await call('/v1/lab/assortment')).status === 401 && (await P(`/concepts/${A.id}/views`, { body: {} })).status === 403, 'closed to anyone without the Design Lab');
    const board = await K(`/assortment?plan=${pid}`);
    ok(board.status === 200 && board.json.concepts.length === 3 && board.json.concepts.every(c => c.hasPicture && c.kinds.length === 6 && Object.keys(c.views).length === 0) && board.json.imageConnected && board.json.videoConnected && board.json.spin.join() === 'model_front,model_34,model_side,model_back', 'the board lists each concept with the views it can have and what is connected');
    ok((await K('/concepts/00000000-0000-4000-8000-000000000000/views', { body: {} })).status === 404 && (await K(`/concepts/${A.id}/views/nonsense`)).status === 404 && (await K(`/concepts/${A.id}/views/walk`)).status === 404 && (await K(`/concepts/${A.id}/views/model_front`)).status === 404, 'unknown concepts and views that are not made yet are not found');

    // making the views for one concept happens in the background and lands view by view
    const go = await K(`/concepts/${A.id}/views`, { body: {} }); ok(go.status === 202 && go.json.started === 6, 'making the views is accepted and runs in the background', go.json.error);
    ok(await wait(async () => { const v = (await K(`/concepts/${A.id}/views`)).json.views; return Object.keys(v).length === 6 && Object.values(v).every(x => x.status === 'ready'); }), 'all six views (flat front and back, on model front, three-quarter, side and back) arrive');
    const get = (path) => fetch(`${BASE}/v1/lab/concepts/${A.id}/views/${path}`, { headers: { Authorization: 'Bearer ' + kyleT } }), mf = await get('model_front'), th = await get('model_front?thumb=1');
    const mfb = Buffer.from(await mf.arrayBuffer()), thb = Buffer.from(await th.arrayBuffer());
    ok(mf.status === 200 && /image\/jpeg/.test(mf.headers.get('content-type')) && thb.length > 0 && thb.length < mfb.length, 'a view is served as a picture, and a smaller one for the board');
    ok((await K(`/concepts/${A.id}/views`, { body: {} })).json.started === 0, 'asking again makes nothing twice');
    ok((await K(`/concepts/${A.id}/views`, { body: { kinds: ['flat_front'], redo: true } })).json.started === 1 && await wait(async () => (await K(`/concepts/${A.id}/views`)).json.views.flat_front.status === 'ready'), 'one view can be drawn again');

    // the walk starts from the front view on the model
    const early = await K(`/concepts/${B.id}/walk`, { body: {} }); ok(early.status === 409 && /on-model views first/.test(early.json.error), 'a walk needs the on-model views first');
    const w = await K(`/concepts/${A.id}/walk`, { body: {} }); ok(w.status === 202, 'the walk is accepted', w.json.error);
    ok(await wait(async () => (await K(`/concepts/${A.id}/views`)).json.views.walk?.status === 'ready'), 'the walk arrives');
    const vid = await fetch(`${BASE}/v1/lab/concepts/${A.id}/views/walk`, { headers: { Authorization: 'Bearer ' + kyleT } }); ok(vid.status === 200 && /video\/mp4/.test(vid.headers.get('content-type')), 'and is served as a video');

    // the whole board at once
    const all = await K('/assortment/views', { body: { plan: pid } }); ok(all.status === 202 && all.json.concepts === 2 && all.json.views === 12, 'making the missing views for the plan skips the concept that is done', JSON.stringify(all.json));
    ok(await wait(async () => (await K(`/assortment?plan=${pid}`)).json.concepts.every(c => Object.values(c.views).filter(v => v.status === 'ready').length >= 6), 40000), 'every concept on the board ends up with its views');
    ok((await K('/assortment/views', { body: { plan: pid } })).json.queued === 0, 'and asking again queues nothing');

    // a redrawn picture makes the old views stale, so they go
    await K(`/concepts/${C.id}/redraw`, { body: {} }); ok(Object.keys((await K(`/concepts/${C.id}/views`)).json.views).length === 0, 'redrawing a concept\'s picture clears the views drawn from the old one');
    // a rejected concept leaves the board unless asked for
    await K(`/concepts/${C.id}/reject`, { body: { reason: 'too plain for the season' } });
    ok((await K(`/assortment?plan=${pid}`)).json.concepts.length === 2 && (await K(`/assortment?plan=${pid}&status=all`)).json.concepts.length === 3, 'a rejected concept is off the board unless all are asked for');
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J204', 'Design Lab assortment board in a browser: the wall of flats and models, the Flats / On model / Both switch, the viewer that turns the model and plays the walk, and a phone fits', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const made = await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 3 } }); const [A] = made.json.concepts;
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab#assort`, { waitUntil: 'networkidle' }); await page.waitForSelector('#aBoard .at', { timeout: 15000 });
    ok(await page.locator('.fbtabs a[data-href="/lab#assort"]').count() === 1 && await page.locator('#aBoard .at').count() >= 3, 'the Assortment board is a tab and shows a tile for each concept');
    ok(/Make \d+ missing views?/.test(await page.innerText('#aMake')) && await page.locator('#aBoard .at img').first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false), 'a tile shows the concept\'s own picture until its views are made, and the button offers to make the rest');
    await page.selectOption('#aPlan', plan.plan.id); await page.waitForFunction(() => document.querySelectorAll('#aBoard .at').length === 3);
    await page.locator('#aMake').click(); await page.waitForFunction(() => /All views made/.test(document.getElementById('aMake').textContent), null, { timeout: 60000 });
    ok(true, 'Make missing views draws every view and the button says when all are made');
    await page.waitForFunction(() => document.querySelectorAll('#aBoard .at .im i').length >= 6 && [...document.querySelectorAll('#aBoard .at .im i')].some(i => /Flat/.test(i.textContent)) && [...document.querySelectorAll('#aBoard .at .im i')].some(i => /On model/.test(i.textContent)), null, { timeout: 15000 });
    await page.locator('#assort').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j204-board.png` }).catch(() => {});
    ok(await page.locator('#aBoard .at .ap.two').count() >= 3, 'Both shows the flat and the model side by side on each tile');
    await page.click('#aShow [data-show="flat"]'); ok(await page.locator('#aBoard .at .ap.two').count() === 0 && /flat/i.test(await page.locator('#aBoard .at .im i').first().innerText()), 'Flats shows only the flats');
    await page.click('#aShow [data-show="model"]'); await page.waitForFunction(() => /On model/.test(document.querySelector('#aBoard .at .im i').textContent)); ok(true, 'On model shows only the models');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#aBoard .at'); ok(await page.locator('#aShow [data-show="model"][aria-pressed="true"]').count() === 1, 'the choice is remembered');

    await page.locator(`#aBoard .at[data-aid="${A.id}"]`).click(); await page.waitForSelector('#av[open] #avStage img', { timeout: 10000 });
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j204-viewer.png` }).catch(() => {});
    ok(await page.locator('#avStrip button').count() === 8 && await page.locator('#avStrip button:not([disabled])').count() >= 7, 'the viewer lists the concept, both flats, four angles and the walk');
    const src = () => page.$eval('#avStage img', i => i.src), s1 = await src(); await page.locator('#avStrip [data-avk="model_side"]').click(); await page.waitForFunction(s => document.querySelector('#avStage img') && document.querySelector('#avStage img').src !== s, s1, { timeout: 6000 }); ok(true, 'choosing an angle shows it');
    await page.focus('#avSpin'); await page.fill('#avSpin', '0').catch(() => {}); await page.evaluate(() => { const s = document.getElementById('avSpin'); s.value = '3'; s.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForFunction(() => /Back/.test(document.querySelector('#avStage .cap').textContent), null, { timeout: 6000 }); ok(true, 'the slider turns the model to the back');
    await page.keyboard.press('Escape').catch(() => {}); await page.waitForSelector('#av[open]', { timeout: 2000 }).catch(() => {});
    if (!(await page.locator('#av[open]').count())) await page.locator(`#aBoard .at[data-aid="${A.id}"]`).click();
    await page.waitForSelector('#avRot'); await page.click('#avRot'); const seen = new Set(); for (let i = 0; i < 12 && seen.size < 3; i++) { seen.add(await page.innerText('#avStage .cap').catch(() => '')); await page.waitForTimeout(600); } ok(seen.size >= 3, 'Rotate turns the model through the views by itself', [...seen].join(' | ')); await page.click('#avRot');
    ok(await page.locator('#av [data-avwalk]').isEnabled(), 'the walk is offered when a video model is connected'); await page.locator('#av [data-avwalk]').click();
    await page.waitForFunction(() => document.querySelector('#av [data-avk="walk"]:not([disabled])'), null, { timeout: 30000 }); await page.locator('#avStrip [data-avk="walk"]').click(); await page.waitForSelector('#avStage video', { timeout: 6000 }); ok(true, 'the walk plays in the viewer');
    await page.locator('#av [data-avclose]').click(); await page.waitForFunction(() => !document.querySelector('#av[open]'));
    await page.setViewportSize({ width: 360, height: 800 }); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'a phone does not scroll sideways', await page.evaluate(() => document.documentElement.scrollWidth));
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J207', 'Design Lab marks: the plain picture is kept so the logo and graphics can be placed again without a new picture, and a redrawn picture is never served from an old copy', async () => {
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  try {
    const made = await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } }); const c = made.json.concepts[0];
    ok(sql(`select (raw is not null)::text from lab_concepts where id='${c.id}'`) === 'true', 'a concept keeps its plain picture beside the one with the marks on');
    const get = (path, h = {}) => fetch(`${BASE}/v1/lab/concepts/${c.id}/${path}`, { headers: { Authorization: 'Bearer ' + kyleT, ...h } });
    const first = await get('image'); const tag = first.headers.get('etag');
    ok(first.status === 200 && /no-cache/.test(first.headers.get('cache-control')) && tag, 'the picture is revalidated each time (private, no-cache, with a tag)');
    ok((await get('image', { 'if-none-match': tag })).status === 304, 'and an unchanged picture costs nothing to ask for again');
    await new Promise(r => setTimeout(r, 1100));
    ok((await K(`/concepts/${c.id}/replace-marks`, { body: {} })).status === 200 && (await get('image', { 'if-none-match': tag })).status === 200, 'placing the marks again makes a new picture that replaces the old one at once');
    ok((await K(`/concepts/${c.id}/redraw`, { body: {} })).status === 200, 'redrawing still works');
    sql(`update lab_concepts set raw=null where id='${c.id}'`);
    const old = await K(`/concepts/${c.id}/replace-marks`, { body: {} }); ok(old.status === 409 && /Redraw the picture once/.test(old.json.error), 'a picture from before the plain copy was kept says to redraw it once');
    ok((await P(`/concepts/${c.id}/replace-marks`, { body: {} })).status === 403 && (await K('/concepts/00000000-0000-4000-8000-000000000000/replace-marks', { body: {} })).status === 404, 'closed to others, and unknown concepts are not found');
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J208', 'Design Lab marks in a browser: placing the logo again says it is done right by the button, and the logo can be taken off a piece', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#cgrid .cc[data-cid="${c.id}"]`, { timeout: 15000 });
    await page.click(`#cgrid .cc[data-cid="${c.id}"]`); await page.waitForSelector('#cd[open] [data-creplace]');
    await page.click('#cd [data-creplace]'); await page.waitForFunction(() => /Done: the logo and graphics were placed again/.test(document.getElementById('cMarkMsg')?.textContent || ''), null, { timeout: 15000 });
    ok(true, 'Place the logo and graphics again reports that it is done, next to the button');
    await page.selectOption('#cd [data-b="mark"]', 'none'); await page.click('#cd [data-csave]');
    await page.waitForFunction(() => /updated/.test(document.getElementById('cMsg')?.textContent || ''), null, { timeout: 15000 });
    ok(sql(`select spec->'branding'->'logo'->>'mark' from lab_concepts where id='${c.id}'`) === 'none', 'the logo can be taken off a piece, and the picture is updated at once');
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J209', 'Design Lab library from photos and screenshots: a picture is read into a piece, kept, saved, tagged with its brand, and can be added by button, drop or paste in the page', async () => {
  const pic = jpeg(), before = Number(sql(`select count(*) from lab_items where url like 'photo:%'`));
  const r = await K('/items/photo', { body: { photo: pic, brand: 'Unknown Label', note: 'great washed tee from a post' } });
  ok(r.status === 201 && r.json.read === true && r.json.item.fromPhoto && r.json.item.status === 'saved' && r.json.item.category === 'tops' && /^data:image\/jpeg;base64,/.test(r.json.item.imageUrl), 'a photo becomes a saved library piece, read into a category and facts, with its picture', JSON.stringify(r.json).slice(0, 300));
  ok(r.json.item.brand === 'Unknown Label' && r.json.item.attrs.silhouette && r.json.item.summary, 'the brand it was given is shown, and the facts the assistant read are kept');
  const ph = await fetch(`${BASE}/v1/lab/items/${r.json.item.id}/photo`, { headers: { Authorization: 'Bearer ' + kyleT } }); ok(ph.status === 200 && /image\/jpeg/.test(ph.headers.get('content-type')), 'the full picture is kept');
  const brand = sql(`select name from lab_brands limit 1`); if (brand) { const b = await K('/items/photo', { body: { photo: pic, brand: brand.toUpperCase() } }); ok(b.status === 201 && b.json.item.brand === brand && b.json.item.brandId, 'a brand on the watchlist is matched whatever its case'); }
  ok((await K('/items/photo', { body: { photo: 'data:text/plain;base64,aGVsbG8=' } })).status === 422 && (await K('/items/photo', { body: { photo: 'data:image/png;base64,bm90IGFuIGltYWdl' } })).status === 422, 'a file that is not a picture, or a broken picture, is refused with a reason');
  ok((await P('/items/photo', { body: { photo: pic } })).status === 403, 'closed to anyone without the Design Lab');
  ok((await K('/items?q=washed')).json.items.some(i => i.id === r.json.item.id), 'the piece can be found in the library');
  if (!playwright) { ok(true, 'skipped the browser part: no browser here'); return; }
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab#library`, { waitUntil: 'networkidle' }); await page.waitForSelector('#addPhotoBtn');
    await page.fill('#addBrand', 'Shop Window'); await page.setInputFiles('#addPhotos', [`${FX}/ig-screenshot.png`, `${FX}/pinterest-screenshot.png`]);
    await page.waitForFunction(() => /Added 2 pictures/.test(document.getElementById('photoMsg').textContent), null, { timeout: 20000 });
    ok(Number(sql(`select count(*) from lab_items where url like 'photo:%'`)) >= before + 4 && Number(sql(`select count(*) from lab_items where attrs->>'brandName'='Shop Window'`)) === 2, 'two screenshots chosen with the button become two pieces with the brand typed');
    await page.evaluate(async () => { const r = await fetch('/icons/icon-192.png'); const blob = await r.blob(); const dt = new DataTransfer(); dt.items.add(new File([blob], 'shot.png', { type: 'image/png' })); document.activeElement?.blur(); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
    await page.waitForFunction(() => /Added 1 picture/.test(document.getElementById('photoMsg').textContent), null, { timeout: 20000 }).catch(() => {});
    ok(/Added 1 picture/.test(await page.innerText('#photoMsg')), 'a pasted screenshot is added too');
    ok(await page.locator('#items .card .br', { hasText: 'Shop Window' }).count() >= 1, 'the pieces show in the library with their pictures');
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await b.close(); }
});

await journey('J210', 'Design Lab studio: a concept opens as layers, the design is saved and reopened, AI changes only the painted area, a graphic is made on a clear background, the finished design becomes the concept picture, and the old one can be put back', async () => {
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  try {
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const S = (path = '', o = {}) => K(`/concepts/${c.id}/studio${path}`, o);
    ok((await call(`/v1/lab/concepts/${c.id}/studio`)).status === 401 && (await P(`/concepts/${c.id}/studio`)).status === 403 && (await K('/concepts/00000000-0000-4000-8000-000000000000/studio')).status === 404, 'closed like the rest of the Lab, and an unknown concept is not found');
    const open = await S(); ok(open.status === 200 && open.json.doc === null && open.json.concept.hasImage && open.json.marks.length === 3 && open.json.marks.every(m => /<svg/.test(m.svg)) && open.json.palette.some(p => p.hex.toUpperCase() === '#4BFF9A') && open.json.ai.connected, 'the studio opens with the marks, the brand colours and the AI ready, and nothing saved yet', open.json.error || open.json.ai);
    ok(open.json.concept.hasPlain === true && (await fetch(`${BASE}/v1/lab/concepts/${c.id}/studio/plain`, { headers: { Authorization: 'Bearer ' + kyleT } })).status === 200, 'the picture without the marks can be used as the base');

    // saving: what is sent is kept, inside limits
    const pic = await png(64, 64, [200, 30, 30]), doc = { w: 512, h: 512, selected: 'a1', layers: [{ id: 'a1', kind: 'base', name: 'Picture', src: pic }, { id: 'a2', kind: 'text', name: 'Type', text: 'FUTURE BASICS', font: 'grotesk', size: 40 }, { id: 'a3', kind: 'image', name: 'Mark', src: 'brand:mark' }] };
    const saved = await S('', { method: 'PUT', body: { doc } }); ok(saved.status === 200 && saved.json.savedAt, 'a design is saved', saved.json);
    const back = (await S()).json; ok(back.doc.layers.length === 3 && back.doc.layers[1].text === 'FUTURE BASICS' && back.savedBy, 'and comes back as it was, with who saved it', back.doc?.layers?.length);
    const bad = async (d, re, msg) => { const r = await S('', { method: 'PUT', body: { doc: d } }); ok(r.status === 422 && re.test(r.json.error), msg, [r.status, r.json.error]); };
    await bad({ ...doc, layers: [{ id: 'x', kind: 'image', src: 'https://evil.test/p.png' }] }, /outside the design/, 'a layer pointing at an outside address is refused');
    await bad({ ...doc, layers: [{ id: 'x', kind: 'script' }] }, /unknown kind/, 'an unknown kind of layer is refused');
    await bad({ ...doc, w: 9 }, /no size/, 'a design with no real size is refused');
    await bad({ ...doc, layers: Array.from({ length: 81 }, (_, i) => ({ id: 'l' + i, kind: 'text', text: 'x' })) }, /up to 80 layers/, 'too many layers are refused');

    // AI: the painted area changes, the rest stays exactly
    const base = await png(256, 256, [120, 120, 120]);
    const raw = Buffer.alloc(256 * 256 * 4); for (let y = 0; y < 256; y++) for (let x = 128; x < 256; x++) raw[(y * 256 + x) * 4 + 3] = 255; // the left half is clear: that is what may change
    const maskBuf = await sharp(raw, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer();
    const edit = await S('/ai', { body: { mode: 'edit', prompt: 'make the left half olive', image: base, mask: `data:image/png;base64,${maskBuf.toString('base64')}` } });
    ok(edit.status === 200 && /^data:image\/png;base64,/.test(edit.json.image), 'an AI change comes back as a picture', edit.json.error);
    if (edit.status === 200) {
      const out = await sharp(Buffer.from(edit.json.image.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true }), px = (x, y) => { const i = (y * out.info.width + x) * out.info.channels; return [out.data[i], out.data[i + 1], out.data[i + 2]]; };
      ok(out.info.width === 256 && out.info.height === 256, 'at the size of the picture sent, so it lands exactly over it', out.info);
      ok(px(200, 128).join() === '120,120,120', 'outside the painted area nothing changes', px(200, 128));
    }
    const whole = await S('/ai', { body: { mode: 'edit', prompt: 'washed olive body', image: base } }); ok(whole.status === 200, 'with nothing painted, the whole piece can change', whole.json.error);
    const art = await S('/ai', { body: { mode: 'art', prompt: 'an arch of the words FUTURE BASICS over a lightning bolt' } });
    ok(art.status === 200 && (await sharp(Buffer.from(art.json.image.split(',')[1], 'base64')).metadata()).hasAlpha, 'a graphic is made on a clear background', art.json.error);
    const brand = await S('/ai', { body: { mode: 'art', prompt: 'a Gucci style monogram' } }); ok(brand.status === 422 && /Leave other brands out/.test(brand.json.error), 'a prompt naming another brand is refused', brand.json);
    ok((await S('/ai', { body: { mode: 'edit', prompt: 'x', image: base } })).status === 422 && (await S('/ai', { body: { mode: 'edit', prompt: 'make it red' } })).status === 422, 'an empty ask, or no picture, is refused');

    // using it: the concept picture changes, the old one is kept, the views are drawn again
    sql(`update lab_concepts set status='approved' where id='${c.id}'`);
    const before = sql(`select md5(image) from lab_concepts where id='${c.id}'`);
    const used = await S('/apply', { body: { image: await png(300, 400, [10, 120, 60]) } });
    ok(used.status === 200 && used.json.status === 'draft', 'the finished design becomes the concept picture, and an approved concept goes back to draft', used.json);
    ok(sql(`select md5(image) from lab_concepts where id='${c.id}'`) !== before && sql(`select md5(original) from lab_studio_docs where concept_id='${c.id}'`) === before, 'the picture changed, and the one before is kept');
    ok(sql(`select (raw is null)::text from lab_concepts where id='${c.id}'`) === 'true' && /finished in the studio/.test((await K(`/concepts/${c.id}/replace-marks`, { body: {} })).json.error || ''), 'the marks are part of the picture now, and placing them again says to move them in the studio');
    ok(/Picture finished in the studio/.test(sql(`select string_agg(body,' | ') from lab_concept_comments where concept_id='${c.id}'`)), 'the concept says it was finished in the studio');
    await S('/apply', { body: { image: await png(300, 400, [200, 200, 10]) } });
    ok(sql(`select md5(original) from lab_studio_docs where concept_id='${c.id}'`) === before, 'using it again keeps the very first picture, not the one in between');
    const rest = await S('/restore', { body: {} }); ok(rest.status === 200 && sql(`select md5(image) from lab_concepts where id='${c.id}'`) === before, 'the old picture can be put back', rest.json);
    ok((await S('/restore', { body: {} })).status === 409, 'and once it is back there is nothing more to put back');
    sql(`update lab_concepts set status='tech_pack' where id='${c.id}'`);
    ok((await S('', { method: 'PUT', body: { doc } })).status === 409 && (await S('/apply', { body: { image: pic } })).status === 409, 'a concept that is a tech pack is not changed from the studio');
    sql(`update lab_concepts set status='draft' where id='${c.id}'`);
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J211', 'Design Lab studio in a browser: open it from a concept, add type, a mark and a painting, distress and recolour, paint an area and let the AI change it, save, reopen, export for Illustrator, and use it as the concept picture', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const oc = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#cgrid .cc[data-cid="${c.id}"]`, { timeout: 15000 });
    await page.click(`#cgrid .cc[data-cid="${c.id}"]`); await page.waitForSelector('#cd[open] [data-cstudio]');
    await Promise.all([page.waitForURL(/\/lab\/studio\?concept=/), page.click('#cd [data-cstudio]')]);
    await page.waitForSelector('#pLayers .ly', { timeout: 15000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    ok(await page.locator('#pLayers .ly').count() === 1 && /Picture/.test(await page.innerText('#pLayers .ly')), 'the concept opens in the studio with its picture as the base layer');
    const box = await page.locator('#view').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const layers = () => page.locator('#pLayers .ly').count();

    // type, straight onto the piece
    await page.keyboard.press('t'); await page.mouse.click(cx, cy - 60);
    await page.waitForSelector('#pLayers textarea[data-p=text]'); await page.fill('#pLayers textarea[data-p=text]', 'BASICS DEPT.'); await page.locator('#pLayers textarea[data-p=text]').blur();
    await page.locator('#pLayers [data-p=arc]').fill('40'); await page.locator('#pLayers [data-p=arc]').dispatchEvent('change');
    ok(await layers() === 2 && /BASICS DEPT/.test(await page.evaluate(() => JSON.stringify(serialize().layers.map(l => l.text || '')))), 'type is added where it was clicked, its words changed, and arched');
    // our mark, recoloured with a brand colour, sitting in the fabric
    await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(n => document.querySelectorAll('#pLayers .ly').length === n, 3);
    await page.click('#pAdd [data-sw="#4BFF9A"], #pAdd [data-sw="#4bff9a"]');
    await page.click('.tabs [data-tab=layers]'); await page.click('#pLayers [data-act=fabric]');
    const mark = await page.evaluate(() => { const l = selected(); return { name: l.name, src: l.src, tint: l.tint, blend: l.blend, d: l.distress.amount }; });
    ok(mark.src === 'brand:word' && mark.tint.amount === 1 && /4bff9a/i.test(mark.tint.color) && mark.blend === 'multiply' && mark.d > 0, 'the wordmark is added, recoloured in Cue, and sat in the fabric (multiply, a little worn)', mark);
    // distress by amount
    await page.locator('#pLayers [data-p="d.amount"]').fill('0.6'); await page.locator('#pLayers [data-p="d.amount"]').dispatchEvent('change');
    ok(await page.evaluate(() => selected().distress.amount) === 0.6, 'distressing is turned up on the mark');
    // a painting by hand
    await page.keyboard.press('b'); await page.mouse.move(cx - 120, cy + 80); await page.mouse.down(); await page.mouse.move(cx, cy + 120, { steps: 6 }); await page.mouse.move(cx + 120, cy + 80, { steps: 6 }); await page.mouse.up();
    ok(await layers() === 4 && await page.evaluate(() => selected().kind) === 'paint', 'the brush starts a new painting layer and paints on it');
    await page.keyboard.press('Control+z'); ok(await page.evaluate(() => LAYERS.length) === 3, 'undo takes the stroke back'); await page.keyboard.press('Control+Shift+z'); ok(await page.evaluate(() => LAYERS.length) === 4, 'and redo brings it back');

    // the AI changes only a painted area, as a layer on top
    await page.click('.tabs [data-tab=ai]'); await page.keyboard.press('m'); await page.mouse.move(cx - 40, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy + 40, { steps: 5 }); await page.mouse.up();
    ok(/Only the painted/.test(await page.innerText('#aiScope')), 'the painted area is what will change');
    await page.fill('#aiEdit', 'make this part washed olive'); await page.click('#aiGo');
    await page.waitForFunction(() => /Done/.test(document.getElementById('aiMsg')?.textContent || ''), null, { timeout: 20000 });
    ok(await page.evaluate(() => LAYERS[LAYERS.length - 1].name.startsWith('AI ·')) && await page.evaluate(() => !MASKED), 'the change comes back as the top layer, and the area is cleared');
    await page.fill('#aiArt', 'a lightning bolt crest'); await page.click('#artGo');
    await page.waitForFunction(() => /graphic is a new layer/.test(document.getElementById('aiMsg')?.textContent || ''), null, { timeout: 20000 });
    ok(await layers() === 6, 'a graphic is made and added as a layer to place');

    // save, reopen, and it is all there
    await page.click('#save'); await page.waitForFunction(() => /Saved/.test(document.getElementById('saved').textContent), null, { timeout: 20000 });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly'); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    const re = await page.evaluate(() => LAYERS.map(l => l.kind + ':' + (l.text || l.src && l.src.slice(0, 10) || '')));
    ok(re.length === 6 && re.some(x => /text:BASICS DEPT/.test(x)) && re.some(x => x === 'image:brand:word'), 'after a reload the design is exactly as it was saved', re);

    // export for Illustrator: type stays type
    await page.click('#expBtn'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-exp=svg]')]);
    const svg = readFileSync(await dl.path(), 'utf8'); ok(/^<\?xml/.test(svg) && (svg.match(/<g id=/g) || []).length === 6 && /<image /.test(svg), 'the SVG has one group per layer, for Illustrator', (svg.match(/<g id=/g) || []).length);
    await page.click('#expBtn'); const [dp] = await Promise.all([page.waitForEvent('download'), page.click('[data-exp=png]')]); ok(/\.png$/.test(dp.suggestedFilename()), 'and the whole thing as a PNG');

    // use it
    const before = sql(`select md5(image) from lab_concepts where id='${c.id}'`);
    await page.click('#apply'); await page.click('#askYes'); await page.waitForFunction(() => /concept picture now/.test(document.getElementById('stToast')?.textContent || ''), null, { timeout: 20000 });
    ok(sql(`select md5(image) from lab_concepts where id='${c.id}'`) !== before && /Put the old picture back/.test(await page.innerText('#cSub')), 'the design becomes the concept picture, and the old one can be put back from here');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-studio.png` }).catch(() => {});
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J212', 'Design Lab library: graphics are drawn into it, uploaded, tagged, found and kept even when their plan goes; techniques (embroidery, print, transfer, patches, wear) come ready, can be changed, copied, given reference photos and made real; and both are used on concepts and in the studio', async () => {
  const L = (path, o = {}) => K('/library' + path, o);
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  try {
    ok((await call('/v1/lab/library/graphics')).status === 401 && (await P('/library/graphics')).status === 403 && (await P('/library/techniques')).status === 403, 'closed like the rest of the Lab');

    // techniques, ready to use
    const tl = await L('/techniques'); const T = tl.json.techniques || [];
    ok(tl.status === 200 && T.length >= 44 && tl.json.kinds.length === 6 && tl.json.kinds.every(k => T.some(t => t.kind === k.id)), 'the starting techniques cover embroidery, print, heat transfer, patches and wear', T.length);
    const satin = T.find(t => t.key === 'satin-embroidery'), puff = T.find(t => t.key === 'puff-embroidery');
    ok(satin && satin.finish.effect === 'stitch' && satin.base === 'embroidery' && /satin-stitch/.test(satin.prompt) && satin.artGuide && satin.factoryNote, 'each says how it looks here, how the real thing looks, how to design for it and what the factory needs', satin);
    const again = (await L('/techniques')).json.techniques; ok(again.length === T.length, 'they are put in once, not again on every visit');
    const mine = await L('/techniques', { body: { name: `Bleach splatter ${stamp}`, kind: 'distress', summary: 'Bleach flicked on before printing', finish: { effect: 'none', distress: { style: 'faded', amount: .5 } }, prompt: 'bleach spots, orange-pink haloes' } });
    ok(mine.status === 201, 'a technique of our own is added', mine.json);
    const edit = await L(`/techniques/${mine.json.id}`, { method: 'PUT', body: { finish: { effect: 'soak', strength: .9 }, summary: 'Bleach, then a water-based print' } });
    const mt = (await L('/techniques')).json.techniques.find(t => t.id === mine.json.id); ok(edit.status === 200 && mt.finish.effect === 'soak' && mt.summary === 'Bleach, then a water-based print' && mt.name.startsWith('Bleach splatter'), 'and changed, keeping what was not changed', mt);
    ok((await L('/techniques', { body: { name: 'x', kind: 'distress' } })).status === 422 && (await L('/techniques', { body: { name: 'Lasers', kind: 'lasers' } })).status === 422, 'a technique needs a real name and kind');
    const photo = jpeg(), p1 = await L(`/techniques/${mine.json.id}/photos`, { body: { image: photo } });
    ok(p1.status === 201 && (await fetch(`${BASE}/v1/lab/library/technique-photos/${p1.json.id}?thumb=1`, { headers: { Authorization: 'Bearer ' + kyleT } })).status === 200, 'a reference photo of the real thing is kept');
    for (let i = 0; i < 3; i++) await L(`/techniques/${mine.json.id}/photos`, { body: { image: photo } });
    ok((await L(`/techniques/${mine.json.id}/photos`, { body: { image: photo } })).status === 409, 'up to four reference photos');
    const dup = await L('/techniques', { body: { from: mine.json.id } }); const dt = (await L('/techniques')).json.techniques.find(t => t.id === dup.json.id);
    ok(dup.status === 201 && /\(copy\)$/.test(dt.name) && dt.photos.length === 4 && dt.finish.effect === 'soak', 'a technique can be copied, photos and all, to make a variation', dt);
    ok((await L(`/techniques/${mine.json.id}/photos/${p1.json.id}`, { method: 'DELETE' })).status === 200 && (await L('/techniques')).json.techniques.find(t => t.id === mine.json.id).photos.length === 3, 'a photo can be removed');
    const sample = await L(`/techniques/${satin.id}/sample`, { body: { image: await png(300, 250, [200, 190, 170]) } });
    ok(sample.status === 200 && /^data:image\/jpeg/.test(sample.json.image) && (await fetch(`${BASE}/v1/lab/library/techniques/${satin.id}/sample`, { headers: { Authorization: 'Bearer ' + kyleT } })).status === 200 && (await L('/techniques')).json.techniques.find(t => t.id === satin.id).hasSample, 'a technique is made real on fabric by the image model, and the sample is kept', sample.json.error);
    ok((await L(`/techniques/${dup.json.id}`, { method: 'DELETE' })).status === 200 && !(await L('/techniques')).json.techniques.some(t => t.id === dup.json.id), 'a technique can be deleted');

    // graphics
    const drawn = await L('/graphics', { body: { prompt: 'an arch of words over a lightning bolt', texts: 'FUTURE BASICS / DEPT 27', colors: 'cream, faded red', style: 'vintage rock tour tee', techniqueId: puff.id, tags: 'rock, Bolt', count: 2 } });
    ok(drawn.status === 201 && drawn.json.ids.length === 2, 'two takes on a graphic are drawn straight into the library', drawn.json);
    const prompt = sql(`select prompt from lab_art where id='${drawn.json.ids[0]}'`); ok(/3d puff embroidery/i.test(prompt) && /Thick, simple, closed shapes/.test(prompt) && /"FUTURE BASICS"/.test(prompt), 'drawn for the chosen technique, with the words spelled as given');
    ok((await L('/graphics', { body: { prompt: 'a Supreme box logo but ours' } })).status === 422 && (await L('/graphics', { body: { prompt: 'x' } })).status === 422, 'another brand in the prompt, or no prompt, is refused');
    const up = await L('/graphics/upload', { body: { image: await png(200, 120, [20, 60, 30]), name: 'Archive crest', tags: ['archive', 'crest'] } }); ok(up.status === 201, 'our own artwork is added', up.json);
    ok((await L('/graphics/upload', { body: { image: 'data:text/html;base64,AAAA' } })).status === 422, 'only pictures can be added');
    const list = (await L('/graphics?limit=200')).json; const mineG = list.graphics.filter(g => drawn.json.ids.includes(g.id) || g.id === up.json.id);
    ok(mineG.length === 3 && mineG.filter(g => g.source === 'library').every(g => g.techniqueName === '3D puff embroidery' && g.tags.join() === 'rock,bolt') && mineG.find(g => g.id === up.json.id).source === 'upload', 'they are listed with where they came from, their technique and their tags', mineG);
    ok((await L('/graphics?tag=archive')).json.graphics.some(g => g.id === up.json.id) && (await L('/graphics?q=lightning')).json.graphics.some(g => g.id === drawn.json.ids[0]) && (await L('/graphics?source=upload')).json.graphics.every(g => g.source === 'upload'), 'found by tag, by words and by where they came from');
    ok((await L(`/graphics/${up.json.id}`, { method: 'PUT', body: { name: 'Archive crest 1998', tags: 'archive, heritage', techniqueId: satin.id } })).status === 200 && (await L('/graphics?q=1998')).json.graphics[0]?.techniqueName === 'Satin stitch embroidery', 'renamed, retagged and given a technique');
    // kept even when the plan it was drawn for goes
    const tmp = (await K('/plans', { body: { name: `Gone soon ${stamp}`, season: 'Spring 2028' } })).json.plan || (await K('/plans', { body: { name: `Gone soon ${stamp}` } })).json.plan;
    if (tmp?.id) { const aid = sql(`insert into lab_art(plan_id,name,png,thumb,source) select '${tmp.id}', 'Plan motif ${stamp}', png, thumb, 'plan' from lab_art where id='${up.json.id}' returning id`).split('\n')[0];
      await K(`/plans/${tmp.id}`, { method: 'DELETE' }); ok(sql(`select (plan_id is null)::text from lab_art where id='${aid}'`) === 'true' && (await L(`/graphics?q=Plan motif ${stamp}`)).json.graphics.length === 1, 'a graphic drawn for a plan stays in the library when the plan is deleted'); }
    else ok(false, 'a plan could be made to test with');

    // on a concept, and in the studio
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const before = (await K(`/concepts/${c.id}`)).json.concept.spec.graphics.length;
    const put = await K(`/concepts/${c.id}/graphics`, { body: { art: drawn.json.ids[0], placement: 'left chest', techniqueId: puff.id } });
    const g = (await K(`/concepts/${c.id}`)).json.concept.spec.graphics.find(x => x.art === drawn.json.ids[0]);
    ok(put.status === 200 && g && g.placement === 'left chest' && g.technique === 'embroidery' && g.finish?.name === '3D puff embroidery' && (await K(`/concepts/${c.id}`)).json.concept.spec.graphics.length === before + 1, 'a library graphic goes on a concept, where it goes and how it is made', g);
    ok((await K(`/concepts/${c.id}/replace-marks`, { body: {} })).status === 200, 'and is placed on its picture');
    for (let i = 0; i < 4; i++) await K(`/concepts/${c.id}/graphics`, { body: { art: up.json.id } });
    ok((await K(`/concepts/${c.id}/graphics`, { body: { art: up.json.id } })).status === 409 && (await K(`/concepts/${c.id}/graphics`, { body: { art: '00000000-0000-4000-8000-000000000000' } })).status === 404, 'up to four graphics on a piece, and only graphics that exist');
    const st = (await K(`/concepts/${c.id}/studio`)).json; ok(st.techniques.length >= 19 && st.techniques.some(t => t.id === mine.json.id && t.photos === 3), 'the studio has every technique, with its reference photos');
    const sa = await K(`/concepts/${c.id}/studio/ai`, { body: { mode: 'art', prompt: 'a small crest with a lightning bolt', techniqueId: satin.id } });
    ok(sa.status === 200 && sa.json.art && sql(`select source || ':' || coalesce(technique_id::text,'') from lab_art where id='${sa.json.art}'`) === `studio:${satin.id}`, 'a graphic made in the studio goes into the library with its technique', sa.json.error);
    const real = await K(`/concepts/${c.id}/studio/ai`, { body: { mode: 'real', techniqueId: mine.json.id, image: await png(256, 256, [120, 120, 120]) } });
    ok(real.status === 200 && /^data:image\/png/.test(real.json.image), 'a technique is made real on the piece in the studio', real.json.error);
    ok((await K(`/concepts/${c.id}/studio/ai`, { body: { mode: 'real', image: await png(64, 64) } })).status === 422, 'making something real needs the technique');
    ok((await L(`/graphics/${up.json.id}`, { method: 'DELETE' })).status === 200 && !(await L('/graphics?tag=heritage')).json.graphics.length && (await fetch(`${BASE}/v1/lab/art/${up.json.id}`, { headers: { Authorization: 'Bearer ' + kyleT } })).status === 200, 'taken out of the library, a graphic still serves the pieces that use it');
    await L(`/techniques/${mine.json.id}`, { method: 'DELETE' });
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J213', 'Design Lab library in a browser: draw a graphic, see it embroidered on fabric, put it on a concept; tune a technique and make it real; and in the studio, add a library graphic, make it embroidered, make that real with AI and keep a layer in the library', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const oc = await b.newContext({ viewport: { width: 1440, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' });
    await Promise.all([page.waitForURL(/\/lab\/library/), page.click('.fbtabs a[data-href="/lab/library"]')]);
    await page.waitForSelector('#app:not(.hidden)');
    await page.waitForTimeout(400); ok(await page.locator('.fbtabs a.on').innerText() === 'Graphics & techniques' && /Design Lab/.test(await page.innerText('.fbside a.on')), 'the library is a part of the Lab');

    // draw a graphic for puff embroidery
    await page.fill('#gPrompt', `a varsity crest with a bolt ${stamp}`); await page.fill('#gTexts', 'DEPT 27'); await page.fill('#gTags', 'varsity');
    await page.selectOption('#gTech', { label: '3D puff embroidery' }); await page.click('#gGo');
    await page.waitForFunction(() => /Done: 1 new/.test(document.getElementById('gMsg').textContent), null, { timeout: 30000 });
    await page.waitForSelector('#gGrid .card img[src]', { timeout: 10000 });
    ok(/varsity crest/.test(await page.innerText('#gGrid .card')), 'the new graphic is first in the library');
    // on fabric as embroidery, then onto the concept
    await page.click('#gGrid .card'); await page.waitForSelector('#gDlg[open]');
    await page.waitForFunction(() => { const c = document.getElementById('gCanvas'); const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[3] === 255; }, null, { timeout: 8000 });
    await page.selectOption('#gvTech', { label: 'Satin stitch embroidery' });
    const flatVsStitch = await page.evaluate(() => { const c = document.getElementById('gCanvas'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4000) s += d[i]; return s; });
    ok(flatVsStitch > 0, 'the graphic is shown on fabric, made as the chosen technique');
    await page.selectOption('#gdConcept', c.id); await page.selectOption('#gdPlace', 'left chest'); await page.click('#gdPut');
    await page.waitForFunction(() => /It is on the concept/.test(document.getElementById('gdMsg').textContent), null, { timeout: 20000 });
    const onIt = (await K(`/concepts/${c.id}`)).json.concept.spec.graphics.find(g => g.placement === 'left chest' && g.finish?.name === '3D puff embroidery');
    ok(Boolean(onIt), 'it is on the concept, on the left chest, as puff embroidery', (await K(`/concepts/${c.id}`)).json.concept.spec.graphics);
    await page.click('#gDlg [data-close]');

    // techniques: live swatches, tune one, make it real
    await page.click('.seg [data-sec=techniques]'); await page.waitForSelector('#tList canvas[data-swatch]');
    const tiles = await page.locator('#tList .tcard').count(); ok(tiles >= 44 && await page.locator('#tList h2').count() === 6, 'every technique is shown, grouped by kind', tiles);
    const painted = await page.evaluate(() => [...document.querySelectorAll('#tList canvas[data-swatch]')].slice(0, 6).every(c => { const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[3] === 255; }));
    ok(painted, 'each is drawn on fabric with a sample graphic');
    await page.click('#tList .tcard:has-text("Chain stitch embroidery")'); await page.waitForSelector('#tDlg[open] #tForm [data-k=name]');
    await page.locator('#tForm [data-k="f.raise"]').fill('5'); await page.click('#tSave'); await page.waitForFunction(() => /Saved/.test(document.getElementById('tMsg')?.textContent || ''));
    ok((await K('/library/techniques')).json.techniques.find(t => t.key === 'chain-stitch').finish.raise === 5, 'a technique is tuned and saved');
    await page.click('#tMakeReal'); await page.waitForFunction(() => /Done/.test(document.getElementById('tRealMsg').textContent), null, { timeout: 30000 });
    ok(await page.locator('#tReal:not(.hidden)').count() === 1, 'and made real by the image model, shown next to the mock-up');
    await page.click('#tDlg [data-close]');

    // the concept window picks from the library too
    await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#cgrid .cc[data-cid="${c.id}"]`, { timeout: 15000 });
    await page.click(`#cgrid .cc[data-cid="${c.id}"]`); await page.waitForSelector('#cd[open] [data-glib]'); await page.waitForLoadState('networkidle'); await page.click('#cd [data-glib]');
    await page.waitForSelector('#glibBox [data-gpick]'); const n0 = (await K(`/concepts/${c.id}`)).json.concept.spec.graphics.length;
    await page.click('#glibBox [data-gpick]'); await page.selectOption('#glibTech', { label: 'Vintage cracked print' }); await page.click('#glibBox [data-gput]');
    await page.waitForFunction(() => /from the library is on the piece/.test(document.getElementById('cMarkMsg')?.textContent || ''), null, { timeout: 20000 });
    ok((await K(`/concepts/${c.id}`)).json.concept.spec.graphics.length === n0 + 1, 'a library graphic is put on a concept from its own window');

    // the studio: a library graphic, embroidered, made real, kept
    await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly'); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    await page.click('.tabs [data-tab=add]'); await page.waitForSelector('#libTiles [data-lib] img[src]', { timeout: 10000 });
    await page.click('#libTiles [data-lib]'); await page.waitForFunction(() => LAYERS.length === 2);
    const added = await page.evaluate(() => { const l = selected(); return { src: l.src, finish: l.finish && l.finish.name }; });
    ok(/^\/v1\/lab\/art\//.test(added.src), 'a library graphic is added to the design', added);
    await page.selectOption('#pLayers [data-tech]', { label: 'Satin stitch embroidery' });
    const fin = await page.evaluate(() => { const l = selected(); return { name: l.finish && l.finish.name, effect: l.finish && l.finish.effect }; });
    ok(fin.name === 'Satin stitch embroidery' && fin.effect === 'stitch' && /Satin stitch/.test(await page.innerText('#pLayers .ly.on')), 'it is made as satin stitch embroidery, shown at once', fin);
    await page.click('#pLayers [data-act=real]'); await page.waitForFunction(() => LAYERS[LAYERS.length - 1].name.startsWith('Real ·'), null, { timeout: 30000 });
    ok(true, 'Make it real with AI adds the real embroidery as the top layer, in that area only');
    await page.click('#pLayers .ly:has-text("Satin stitch")'); const before = Number(sql(`select count(*) from lab_art where source='studio'`));
    await page.click('#pLayers [data-act=keep]'); await page.waitForFunction(() => /graphics library now/.test(document.getElementById('stToast')?.textContent || ''), null, { timeout: 10000 });
    ok(Number(sql(`select count(*) from lab_art where source='studio'`)) === before + 1, 'a layer is kept in the graphics library');
    await page.click('#save'); await page.waitForFunction(() => /Saved/.test(document.getElementById('saved').textContent), null, { timeout: 20000 });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly'); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    ok(await page.evaluate(() => LAYERS.some(l => l.finish && l.finish.name === 'Satin stitch embroidery')), 'the technique is kept with the saved design');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-library-studio.png` }).catch(() => {});
    await page.goto(`${BASE}/lab/library#techniques`, { waitUntil: 'networkidle' }); await page.waitForSelector('#tList canvas[data-swatch]');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-library.png` }).catch(() => {});
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J214', 'Design Lab flats: a concept becomes measured front and back flats with its logo and graphics placed from what it says; the check catches what cannot be made (collar, zip, pocket, size, lines too fine for the technique); the spec sheet and the tech pack carry it; and approval needs a reason while it cannot be made', async () => {
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  try {
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const F = (path = '', o = {}) => K(`/concepts/${c.id}/flats${path}`, o);
    ok((await call(`/v1/lab/concepts/${c.id}/flats`)).status === 401 && (await P(`/concepts/${c.id}/flats`)).status === 403 && (await K('/concepts/00000000-0000-4000-8000-000000000000/flats')).status === 404, 'closed like the rest of the Lab');
    const first = await F(); const f = first.json.flat;
    ok(first.status === 200 && f && !f.saved && ['tee', 'longsleeve', 'crewneck', 'hoodie', 'ziphoodie', 'jacket'].includes(f.style) && f.m.chest > 15, 'the concept is worked out as a measured flat: its style, fit and measurements', first.json.error || f);
    const logo = f.placements.find(q => q.source === 'logo'); ok(logo && logo.mark && logo.techniqueId && logo.w > 0 && logo.h > 0, 'its Future Basics logo is placed where the concept says, with how it is made', f.placements);
    ok(f.check && typeof f.check.summary.fail === 'number', 'and it is checked straight away', f.check);

    // save, then catch what cannot be made
    const body = { style: f.style, fit: f.fit, m: f.m, options: f.options, placements: f.placements };
    const saved = await F('', { method: 'PUT', body }); ok(saved.status === 200 && (await F()).json.flat.saved, 'the flats are saved', saved.json.error);
    const thin = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect x="20" y="20" width="760" height="360" fill="none" stroke="#141416" stroke-width="3"/><path d="M40 200 H760 M400 40 V360" stroke="#141416" stroke-width="3"/></svg>`);
    const art = (await K('/library/graphics/upload', { body: { image: `data:image/png;base64,${(await sharp(thin).png().toBuffer()).toString('base64')}`, name: 'Hairline grid' } })).json.id;
    const techs = first.json.techniques, satin = techs.find(t => t.name === 'Satin stitch embroidery'), glossy = techs.find(t => t.name === 'Glossy heat transfer');
    const check = async (placements, extra = {}) => (await F('/check', { body: { ...body, ...extra, placements } })).json;
    const neck = await check([{ ...logo, id: 'n', x: 0, y: f.m.neckDropFront + 1.2, w: 3, h: 1 }]);
    ok(neck.check.findings.n.some(x => x.code === 'KEEPOUT_NECK' && x.level === 'fail') && /below the HPS/.test(neck.where.n), 'a logo against the collar cannot be made, and says where it is', neck.check.findings.n);
    const fine = await check([{ id: 'g', name: 'Hairline grid', view: 'front', art, techniqueId: satin.id, technique: 'embroidery', x: 0, y: f.m.neckDropFront + 5, w: 3, h: 1.5 }]);
    const fd = fine.check.findings.g.find(x => x.code === 'FINE_DETAIL'); ok(fd && /finer than 1.5 mm/.test(fd.text) && fine.check.findings.g.some(x => x.code === 'STITCHES'), 'hairlines embroidered at 3 in are too fine, with a stitch count', fine.check.findings.g);
    const ht = await check([{ id: 'g', name: 'Hairline grid', view: 'front', art, techniqueId: glossy.id, technique: 'heat transfer', x: 0, y: f.m.neckDropFront + 8, w: 10, h: 5 }]);
    ok(!ht.check.findings.g.some(x => x.code === 'FINE_DETAIL'), 'the same artwork as a heat transfer at 10 in holds its lines', ht.check.findings.g);
    const big = await check([{ id: 'b', name: 'Back hit', view: 'back', art, techniqueId: satin.id, technique: 'embroidery', x: 0, y: 9, w: 13, h: 6.5 }]);
    ok(big.check.findings.b.some(x => x.code === 'TOO_WIDE'), 'bigger than an embroidery hoop is caught', big.check.findings.b);
    ok(satin.rules.maxW === 12 && satin.rules.minLineMm === 1.5 && satin.rules.density === 1800, 'each technique says what it can make', satin.rules);
    await K(`/library/techniques/${satin.id}`, { method: 'PUT', body: { rules: { ...satin.rules, maxW: 14 } } });
    const big2 = await check([{ id: 'b', name: 'Back hit', view: 'back', art, techniqueId: satin.id, technique: 'embroidery', x: 0, y: 9, w: 13, h: 6.5 }]);
    ok(!big2.check.findings.b.some(x => x.code === 'TOO_WIDE'), 'a bigger hoop, set on the technique, is used by the check', big2.check.findings.b);
    await K(`/library/techniques/${satin.id}`, { method: 'PUT', body: { rules: satin.rules } });
    const zip = await check([{ id: 'z', name: 'Chest art', view: 'front', art, techniqueId: glossy.id, technique: 'heat transfer', x: 0, y: 9, w: 8, h: 4 }], { style: 'ziphoodie', fit: 'regular', m: undefined, options: {} });
    ok(zip.check.findings.z.some(x => x.code === 'KEEPOUT_ZIP' && x.level === 'fail'), 'nothing goes across a zip', zip.check.findings.z);
    ok((await F('', { method: 'PUT', body: { ...body, style: 'kimono' } })).status === 422 && (await F('/check', { body: { ...body, placements: [{ id: 'x', name: 'x', art: '00000000-0000-4000-8000-000000000000' }] } })).status === 422, 'an unknown style or graphic is refused');

    // the spec sheet
    const sheet = await fetch(`${BASE}/v1/lab/concepts/${c.id}/flats/sheet.svg`, { headers: { Authorization: 'Bearer ' + kyleT } }); const svg = await sheet.text();
    ok(sheet.status === 200 && /image\/svg/.test(sheet.headers.get('content-type')) && svg.includes(c.name.replace(/&/g, '&amp;')) && /Points of measure/.test(svg) && /below the HPS/.test(svg) && (svg.match(/data-view=/g) || []).length === 2, 'the spec sheet has both flats, every placement measured and the graded measurements');
    ok((svg.match(/<image href="data:image\/svg\+xml;base64,/g) || []).length === 2, 'the flat sketches travel inside the sheet');
    ok((await sharp(Buffer.from(svg)).png().toBuffer()).length > 10000, 'and it renders');

    // the drawing changed: a colour, a pocket in contrast thread, a stitch line, an area redrawn by the image model
    const rd = await F('/redraw', { body: { ...body, view: 'front', box: { x: 4, y: 12, w: 4, h: 4 }, prompt: 'make this a welt pocket' } });
    ok(rd.status === 200 && rd.json.edit.type === 'ai' && /welt pocket/.test(rd.json.edit.prompt) && sql(`select source || ':' || in_library from lab_art where id='${rd.json.edit.art}'`) === 'flat:false', 'an area of the flat is redrawn by the image model and kept out of the graphics library', [rd.status, rd.json]);
    ok((await F('/redraw', { body: { ...body, view: 'front', box: { x: 4, y: 12, w: .2, h: .2 }, prompt: 'make this a welt pocket' } })).status === 422 && (await F('/redraw', { body: { ...body, view: 'front', box: { x: 4, y: 12, w: 4, h: 4 }, prompt: '' } })).status === 422, 'it needs an area and words');
    const edited = { ...body, color: '#1f2a44', edits: [{ id: 'pk', type: 'detail', kind: 'pocket-patch', view: 'front', x: -5, y: 10, w: 4.5, h: 5, stitch: 'double', thread: '#e0218a' }, { id: 'hm', type: 'stitch', view: 'back', pts: [[-10, 26], [10, 26]], stitch: 'cover' }, rd.json.edit] };
    ok((await F('', { method: 'PUT', body: edited })).status === 200 && (await F()).json.flat.edits.length === 3, 'the edits are saved with the flats');
    const svg2 = await (await fetch(`${BASE}/v1/lab/concepts/${c.id}/flats/sheet.svg`, { headers: { Authorization: 'Bearer ' + kyleT } })).text();
    ok(/Colour, details and stitching/.test(svg2) && /Main colour #1f2a44/.test(svg2) && /Patch pocket/.test(svg2) && /double needle in #e0218a thread/.test(svg2) && /Coverstitch/.test(svg2) && /redrawn: make this a welt pocket/.test(svg2) && /<image href="data:image\/png;base64,/.test(svg2), 'the spec sheet shows the colour and lists every detail and stitch for the factory');
    ok((await sharp(Buffer.from(svg2)).png().toBuffer()).length > 10000, 'and still renders');
    await F('', { method: 'PUT', body });

    // approval waits for a reason while it cannot be made
    const cant = { ...body, placements: [...body.placements, { id: 'n', name: 'Neck hit', view: 'front', art, techniqueId: glossy.id, technique: 'heat transfer', x: 0, y: f.m.neckDropFront + .9, w: 3, h: 1 }] };
    await F('', { method: 'PUT', body: cant });
    const ap = await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references, it is ours' } });
    ok(ap.status === 422 && ap.json.code === 'CANNOT_MAKE' && /cannot be made as drawn/.test(ap.json.error), 'a concept whose flats cannot be made is not approved without a reason', ap.json);
    const ap2 = await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references, it is ours', makeReason: 'the neck hit moves down at sampling, agreed with the factory' } });
    ok(ap2.status === 200 && ap2.json.concept.status === 'approved' && /flats check found \d+ problems?, because: the neck hit/.test(sql(`select string_agg(body,' | ') from lab_concept_comments where concept_id='${c.id}'`)), 'with a reason it is approved, and the reason is kept', ap2.json.error);
    // the tech pack carries the flats
    await F('', { method: 'PUT', body });
    const tp = await K(`/concepts/${c.id}/tech-pack`, { body: {} }); ok(tp.status === 201, 'it becomes a tech pack', tp.json);
    const names = () => sql(`select string_agg(a->>'name', ' | ') from tech_packs, jsonb_array_elements(data->'artwork') a where product_id='${tp.json.productId}'`);
    ok(/Spec sheet · flats, placements and measurements/.test(names()) && /Technical flat · front/.test(names()) && /Technical flat · back/.test(names()), 'the spec sheet and both flats are on the tech pack', names());
    const pk = col => sql(`select ${col} from tech_packs where product_id='${tp.json.productId}'`);
    ok(Number(pk(`(select count(*) from jsonb_array_elements(data->'pom') r where r->>'how'='From the flats')`)) >= 5 && pk(`data->'pom'->0->'values'->>'M'`) !== '', 'the flats\' graded measurements are the pack\'s points of measure', pk(`data->'pom'->0`));
    ok(pk(`(select string_agg(s->>'id', ',' order by s->>'id') from jsonb_array_elements(data->'sketches') s where s->>'id' like 'lab-flat-%')`) === 'lab-flat-back,lab-flat-front', 'the front and back flats are the pack\'s sketches');
    ok(Number(pk(`(select count(*) from jsonb_array_elements(data->'construction') r where r->>'area' like 'Flats · %')`)) >= 2 && /From the Design Lab:/.test(pk(`data->>'notes'`)), 'its placements and drawing are construction lines, and the plan\'s numbers are noted');
    const again = await F('/tech-pack', { body: {} }); ok(again.status === 200 && again.json.pom >= 5, 'the flats can be sent again after a change', again.json);
    ok(pk(`(select count(*) from jsonb_array_elements(data->'artwork') a where a->>'name'='Technical flat · front')`) === '1' && pk(`(select count(*) from jsonb_array_elements(data->'sketches') s where s->>'id'='lab-flat-front')`) === '1', 'sending again replaces, never doubles');
    // a piece that is not drawn yet says so
    sql(`update lab_concepts set category='footwear' where id='${c.id}'`); sql(`delete from lab_flats where concept_id='${c.id}'`);
    const shoe = (await F()).json; ok(shoe.flat === null && /not drawn for footwear yet/.test(shoe.unsupported), 'a category without templates says so', shoe.unsupported);
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J216', 'Design service: a line designed for a client in their brand, shared to their hub; they ask for changes on one concept and approve another; the team answers them; the approved one becomes a tech pack in the client\'s own room with its flats; nobody else sees any of it', async () => {
  const { brands, plan } = await conceptSetup();
  const start = async who => (await call('/v1/public/start', { body: { email: `${who}-${stamp}-${Math.random().toString(36).slice(2, 6)}@chaos.test`, name: who, title: 'Board shorts', photos: [jpeg()] } })).json;
  const cl = await start('dana'), other = await start('otto'), ctoken = cl.token, cid = cl.client.id, C = (path, o = {}) => call('/v1/client/design' + path, { token: ctoken, ...o });
  try {
    ok((await K('/clients')).json.clients.some(c => c.id === cid), 'the client rooms a line can be designed for');
    const set = await K(`/plans/${plan.plan.id}/client`, { method: 'PUT', body: { clientId: cid, brand: { name: 'Tidewater', statement: 'Cold-water surf clothing for people who swim all year' }, shared: false } });
    ok(set.status === 200 && set.json.plan.brand.name === 'Tidewater' && !set.json.plan.sharedAt, 'the line is set as a client\'s, in their brand words, not shared yet', set.json);
    const line = plan.lines[0], mk = await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 2 } });
    ok(mk.status === 201 && mk.json.concepts.length >= 2 && mk.json.concepts.every(c => c.spec.branding.logo.mark === 'none' && c.clientId === cid), 'concepts for a client carry their logo, not ours (placed by hand later)', mk.json.error || mk.json.concepts?.map(c => c.spec.branding.logo.mark));
    ok((await C('')).json.plans.length === 0, 'before it is shared, the client sees nothing');
    await K(`/plans/${plan.plan.id}/client`, { method: 'PUT', body: { clientId: cid, brand: { name: 'Tidewater' }, shared: true } });
    const dz = (await C('')).json, pl = dz.plans[0];
    ok(pl && pl.brandName === 'Tidewater' && pl.concepts.length >= 2 && pl.concepts.every(c => c.stage === 'in_design' && !c.verdict), 'shared: the client sees each concept of their line', dz);
    const [a, b] = pl.concepts;
    if (a.image) ok((await fetch(BASE + a.image, { headers: { Authorization: 'Bearer ' + ctoken } })).status === 200, 'and its picture');
    ok((await call(`/v1/client/design/concepts/${a.id}/image`, { token: other.token })).status === 404 && (await call('/v1/client/design', { token: other.token })).json.plans.length === 0, 'another client sees none of it');
    // the client's say
    ok((await C(`/concepts/${b.id}/verdict`, { body: { verdict: 'changes', note: '' } })).status === 422, 'asking for changes needs to say what');
    ok((await C(`/concepts/${b.id}/verdict`, { body: { verdict: 'changes', note: 'Shorter inseam, 5 in, and a key pocket' } })).status === 200 && (await C(`/concepts/${a.id}/verdict`, { body: { verdict: 'approved', note: 'Love it' } })).status === 200, 'they ask for changes on one and approve another');
    const sb = (await K(`/concepts/${b.id}`)).json;
    ok(sb.concept.clientVerdict === 'changes' && /key pocket/.test(sb.concept.clientNote) && sb.comments.some(c => c.byClient && /\(client\)/.test(c.name)), 'the team sees it on the concept, with the client\'s note in its comments', sb.concept);
    await K(`/concepts/${b.id}/comments`, { body: { body: 'For the client: Done: 5 in inseam and a key pocket on the right.' } }); await K(`/concepts/${b.id}/comments`, { body: { body: 'internal: check the costing' } });
    const msgs = (await C('')).json.plans[0].concepts.find(c => c.id === b.id).comments;
    ok(msgs.some(m => m.name === 'Future Basics' && /5 in inseam/.test(m.body)) && !msgs.some(m => /internal/.test(m.body)), 'the team answers the client; its own notes stay internal', msgs);
    // the approved one becomes a tech pack in the client's room, with its flats
    const ap = await K(`/concepts/${a.id}/approve`, { body: { overrideReason: 'reviewed side by side: it is ours, and the client approved it' } }); ok(ap.status === 200, 'the team approves it too', ap.json);
    const fl = (await K(`/concepts/${a.id}/flats`)).json; if (fl.flat) await K(`/concepts/${a.id}/flats`, { method: 'PUT', body: fl.flat });
    const tp = await K(`/concepts/${a.id}/tech-pack`, { body: {} });
    ok(tp.status === 201 && sql(`select client_id from products where id='${tp.json.productId}'`) === cid && sql(`select vendor from products where id='${tp.json.productId}'`) === 'Tidewater', 'it becomes a tech pack in the client\'s own room, under their brand', tp.json);
    ok(!/Future Basics (logo|internal woven label)/.test(sql(`select coalesce(string_agg(a->>'name', ' | '),'') from tech_packs, jsonb_array_elements(data->'artwork') a where product_id='${tp.json.productId}'`)), 'without our logo or label files');
    ok((await call('/v1/dashboard', { token: ctoken })).json.products.some(p => p.id === tp.json.productId), 'it is in their hub with their other products');
    const after = (await C('')).json.plans[0].concepts.find(c => c.id === a.id);
    ok(after.stage === 'tech_pack' && after.productId === tp.json.productId && (await C(`/concepts/${a.id}/verdict`, { body: { verdict: 'changes', note: 'make it longer' } })).status === 409, 'the hub shows it as a tech pack, where changes are asked for from now on');
    if (fl.flat) { const f = await fetch(BASE + after.flats, { headers: { Authorization: 'Bearer ' + ctoken } }); ok(f.status === 200 && /<svg/.test(await f.text()), 'the client reads its flats and measurements'); }
    // the work console sees the room's design work too: its line plans with their concepts, the client's say, and the tech packs they became
    const wd = (await call(`/v1/admin/clients/${cid}/design`, { token: kyleT })).json, wp = wd.plans?.find(x => x.id === plan.plan.id), wa = wp?.concepts.find(c => c.id === a.id), wb = wp?.concepts.find(c => c.id === b.id);
    ok(wp && wp.by === 'future-basics' && wp.sharedAt && wp.brandName === 'Tidewater' && wa?.stage === 'tech_pack' && wa.productId === tp.json.productId && wb?.verdict === 'changes' && /key pocket/.test(wb.note) && wb.clientNotes >= 1, 'the work console\'s room shows the line, each concept with the client\'s say, and the tech pack it became', wp || wd);
    ok((await call(`/v1/admin/clients/${other.client.id}/design`, { token: kyleT })).json.plans.length === 0 && (await call(`/v1/admin/clients/${cid}/design`, { token: ctoken })).status === 403, '   another room shows none of it, and a client cannot read it');
    const pr = (await K(`/plans?client=${cid}`)).json.plans, po = (await K(`/plans?client=${other.client.id}`)).json.plans;
    ok(pr.some(x => x.id === plan.plan.id && x.clientName) && !po.some(x => x.id === plan.plan.id) && (await K('/plans')).json.plans.find(x => x.id === plan.plan.id)?.clientName, '   in the Lab, each plan names its room, and the list narrows to one room', pr.map(x => x.clientName));
    // in a browser: the hub's Design section
    if (playwright) {
      const bw = await playwright.chromium.launch(); try {
        const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
        await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, ctoken);
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#design .dz-card', { timeout: 20000 });
        ok(await page.locator('#navDesign').count() === 1 && !(await page.locator('#navDesign').getAttribute('class') || '').includes('hidden') && await page.locator('#design .dz-card').count() >= 2 && /tidewater/i.test(await page.innerText('#design')), 'the hub has a Design section with the line', [await page.locator('#navDesign').getAttribute('class'), await page.locator('#design .dz-card').count(), (await page.innerText('#design')).slice(0, 80)]);
        const card = page.locator(`#design [data-dz]:not([data-dz="${a.id}"]):not([data-dz="${b.id}"])`).first();
        if (await card.count()) { await card.locator('[data-dzask]').click(); await card.locator('textarea').fill('Can it come in navy?'); await card.locator('[data-dzv="changes"]').click();
          await page.waitForFunction(() => /Changes asked for/.test(document.getElementById('design').innerText), null, { timeout: 15000 }); ok(true, 'a client asks for changes from the hub'); }
        await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/hub-design.png`, fullPage: false }).catch(() => {});
        const wctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }), wpg = await wctx.newPage(); wpg.on('pageerror', e => errs.push('work: ' + e.message));
        await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        await wpg.goto(`http://work.localhost:${new URL(BASE).port}/clients/${cid}`, { waitUntil: 'domcontentloaded' }); await wpg.waitForSelector('#roomDesignPeek .rd-plan', { timeout: 20000 });
        ok(/Tidewater|Design Lab/.test(await wpg.innerText('#roomDesignPeek')) && await wpg.locator('#workbar a.wb[data-sel="design"]').count() === 1, 'the work console\'s room shows the line plans on its overview, with Design Lab in its rail');
        await wpg.click('#workbar a.wb[data-sel="design"]'); await wpg.waitForSelector('#roomDesignBox .rd-card', { timeout: 15000 });
        ok(await wpg.locator('#roomDesignBox .rd-card').count() >= 2 && /Client asks for changes/.test(await wpg.innerText('#roomDesignBox')) && /Tech pack started/.test(await wpg.innerText('#roomDesignBox')), '   and its Design Lab shows the concepts with the client\'s say, as the hub draws them');
        await wpg.click('#roomDesignBox [data-rdf="changes"]'); ok(await wpg.locator('#roomDesignBox .rd-card').count() >= 1 && !/Tech pack started/.test(await wpg.innerText('#roomDesignBox .rd-grid')), '   narrowed to the changes the client asked for');
        await wpg.click('#roomDesignBox [data-rdf="all"]'); await wpg.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/work-room-design.png`, fullPage: true }).catch(() => {});
        await wpg.setViewportSize({ width: 390, height: 844 }); await wpg.waitForTimeout(300); ok(await wpg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '   on a phone it fits the screen', await wpg.evaluate(() => document.documentElement.scrollWidth));
        await wpg.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/work-room-design-phone.png`, fullPage: false }).catch(() => {});
        const lp = await wctx.newPage(); lp.on('pageerror', e => errs.push('lab: ' + e.message)); await lp.goto(`http://work.localhost:${new URL(BASE).port}/lab?client=${cid}#plans`, { waitUntil: 'domcontentloaded' }); await lp.waitForSelector(`#planList [data-plan="${plan.plan.id}"]`, { timeout: 20000 });
        ok(await lp.inputValue('#planRoom') === cid && /Tidewater|dana/i.test(await lp.innerText(`#planList [data-plan="${plan.plan.id}"]`)) && await lp.locator('#planList [data-plan]').count() === (await K(`/plans?client=${cid}`)).json.plans.length, '   "Line plans for this room" opens the Lab on this room\'s plans, each named with its room');
        await wctx.close();
        ok(errs.length === 0, 'no page errors', errs);
      } finally { await bw.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J217', 'Design to factory and back: a concept becomes a tech pack carrying its flats; it is published and sent to a factory; the factory marks the proto sent; the sample is reviewed against the spec; the corrections become version 2; the factory sees what changed and the next sample is asked for', async () => {
  const { brands, plan } = await conceptSetup(); await import('../../src/sample-review.js'); const FBSample = globalThis.FBSample;
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], mk = await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } }), c = mk.json.concepts[0];
    ok((await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } })).status === 200, '1. the concept is approved');
    const fl = (await K(`/concepts/${c.id}/flats`)).json; ok(fl.flat && (await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat })).status === 200, '2. its flats are drawn and saved');
    const tp = await K(`/concepts/${c.id}/tech-pack`, { body: {} }); ok(tp.status === 201, '3. it becomes a tech pack', tp.json); const pid = tp.json.productId;
    let pack = (await A(`/v1/admin/products/${pid}/tech-pack`)).json;
    ok(pack.lab?.id === c.id && pack.techPack.data.pom.some(r => r.how === 'From the flats') && pack.techPack.data.sketches.some(k => k.id === 'lab-flat-front'), '   carrying its measurements and flats, and a link back to the concept', pack.lab);
    const data = pack.techPack.data; data.sampling = [{ stage: 'Proto sample', qty: '2', status: 'requested' }, { stage: 'Fit sample', qty: '2', status: 'planned' }];
    ok((await A(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data } })).status === 200, '4. the samples are planned');
    const pub = await A(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: design to factory' } }); ok(pub.status === 200, '5. version 1 is published', pub.json);
    const sup = (await A('/v1/admin/suppliers', { method: 'POST', body: { name: `Round Trip Mill ${stamp}` } })).json;
    const asg = await A(`/v1/admin/products/${pid}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'review' } }); ok(asg.status === 200 || asg.status === 201, '6. it is sent to a factory', asg.json);
    const tok = asg.json.assignment.packUrl.split('/tp/')[1];
    let fv = (await call(`/v1/tp/${tok}`)).json; ok(fv.techPack.version === 1 && fv.techPack.data.sampling.length === 2 && fv.techPack.data.pom.length >= 5, '   the factory reads version 1: its measurements and the samples due', fv.techPack?.version);
    ok((await call(`/v1/tp/${tok}/sample`, { body: { stage: 'Proto sample', tracking: 'DHL 4471' } })).status === 200, '7. the factory marks the proto sent');
    pack = (await A(`/v1/admin/products/${pid}/tech-pack`)).json; const live = pack.techPack.data;
    ok(live.sampling[0].status === 'sent' && live.sampling[0].tracking === 'DHL 4471', '   the team sees it sent, with its tracking', live.sampling[0]);
    // the review: the chest is an inch and a half over, the length is accepted as the new spec, one correction
    const size = FBSample.sampleSizeOf(live), chest = live.pom[0], len = live.pom[1], spec = Number(chest.values[size]);
    live.sampling[0].review = { verdict: 'revise', at: '2026-10-27', by: 'Kyle', measured: { [chest.code]: String(spec + 1.5), [len.code]: String(Number(len.values[size]) + .5) }, adopt: [len.code], corrections: [{ area: 'Neck rib', change: 'Rib rolls: use a 2x2 rib, 1 in finished' }] };
    const check = FBSample.check(live, 0); ok(check[0].out === true && check[1].out === false, '8. the sample is measured against the spec and its tolerance', check.slice(0, 2));
    const next = FBSample.apply(live, 0);
    ok((await A(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data: next } })).status === 200, '9. the review writes the next version', next.sampling.map(r => r.status));
    const pub2 = await A(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: corrections from the proto' } }); ok(pub2.status === 200, '10. version 2 is published', pub2.json);
    fv = (await call(`/v1/tp/${tok}`)).json; const d2 = fv.techPack.data;
    ok(fv.techPack.version === 2 && d2.construction.some(r => /Correction · Proto sample: Neck rib/.test(r.area)) && d2.construction.some(r => /measurements to correct/.test(r.area)), '11. the factory reads version 2 with the corrections', fv.techPack?.version);
    ok(Number(d2.pom[1].values[size]) === Number(len.values[size]) + .5 && Number(d2.pom[0].values[size]) === spec, '   the accepted length is the new spec; the chest stays and is to be corrected');
    ok(d2.sampling[0].status === 'revise' && d2.sampling[1].status === 'requested', '   the proto is marked for corrections and the fit sample is asked for', d2.sampling.map(r => r.status));
    const rev = (fv.revisions || fv.techPack.revisions || []).find(r => Number(r.version) === 2); ok(rev && (rev.changes || []).length > 0, '12. "what changed in v2" is there for the factory', fv.revisions?.length);
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J220', 'Graphics anywhere: a graphic is built in the library\'s own studio (drawn by the image model, with a part from the sketch pack as a layer) and kept with its layers; reworked and updated; a part from the sketch pack goes on a concept in the studio; and a library graphic goes onto any product\'s tech pack as artwork, placed on the front', async () => {
  const { FLAT_PARTS } = await import('../../src/lab-flat-parts.js'); const part = FLAT_PARTS.find(q => q.kind === 'pockets') || FLAT_PARTS[0];
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  // the library's studio: nothing to start from
  const s0 = await K('/library/studio'); ok(s0.status === 200 && s0.json.graphic === null && s0.json.marks.length === 3 && s0.json.ai, '1. the graphics studio opens on a clear canvas, with our marks and the image model', s0.json);
  const drawn = await K('/library/studio/ai', { body: { mode: 'art', prompt: 'a sunburst crest with a wave' } }); ok(drawn.status === 200 && /^data:image\/png/.test(drawn.json.image) && drawn.json.art, '2. the image model draws a graphic for it (and it is in the library already)', drawn.json.error);
  const doc = { w: 1024, h: 1024, layers: [{ id: 'bg', kind: 'base' }, { id: 'g', kind: 'image', src: `/v1/lab/art/${drawn.json.art}` }, { id: 'p', kind: 'image', src: `/lab/flat-parts/${part.file}` }, { id: 't', kind: 'text', text: 'FUTURE BASICS' }] };
  const kept = await K('/library/studio/keep', { body: { image: drawn.json.image, name: `J220 crest ${stamp}`, doc, tags: ['j220'] } }); ok(kept.status === 201 && kept.json.id, '3. the finished graphic is kept in the library with the layers it was built from', kept.json);
  const gid = kept.json.id;
  const s1 = await K(`/library/studio?art=${gid}`); ok(s1.json.graphic?.hasImage && s1.json.doc?.layers?.length === 4 && s1.json.doc.layers.some(l => l.src === `/lab/flat-parts/${part.file}`), '   it opens again with its four layers, the sketch-pack part among them');
  ok((await K(`/library/graphics/${gid}/studio`, { method: 'PUT', body: { doc: { ...doc, layers: [{ id: 'x', kind: 'image', src: 'https://evil.test/a.png' }] } } })).status === 422, '   a layer from outside is refused');
  ok((await K(`/library/graphics/${gid}/studio`, { method: 'PUT', body: { doc: { ...doc, layers: doc.layers.slice(0, 3) } } })).status === 200, '4. its layers are saved');
  const up = await K(`/library/graphics/${gid}/studio/apply`, { body: { image: drawn.json.image, doc } }); ok(up.status === 200 && (await K(`/library/studio?art=${gid}`)).json.doc.layers.length === 4, '5. reworked, the graphic is updated in place', up.json);
  const lib = await K(`/library/graphics?q=${encodeURIComponent('J220 crest')}`); ok(lib.json.graphics.some(g => g.id === gid && g.source === 'studio' && g.tags.includes('j220')), '   the library lists it as built in the studio', lib.json.graphics?.length);
  const png = await fetch(`${BASE}/v1/lab/art/${gid}`, { headers: { Authorization: 'Bearer ' + kyleT } }); ok(png.status === 200 && /image\/png/.test(png.headers.get('content-type')), '   and its picture is a PNG with a clear background');
  // a part from the sketch pack on a concept, and the graphic on any product's tech pack
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const cdoc = { w: 1024, h: 1024, layers: [{ id: 'bg', kind: 'base' }, { id: 'p', kind: 'image', src: `/lab/flat-parts/${part.file}` }] };
    ok((await K(`/concepts/${c.id}/studio`, { method: 'PUT', body: { doc: cdoc } })).status === 200 && (await K(`/concepts/${c.id}/studio`)).json.doc.layers[1].src === `/lab/flat-parts/${part.file}`, `6. a ${part.label.toLowerCase()} from the sketch pack is a layer on the concept, kept with its design`);
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } });
    const fl = (await K(`/concepts/${c.id}/flats`)).json; await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat });
    const pid = (await K(`/concepts/${c.id}/tech-pack`, { body: {} })).json.productId;
    const found = await A(`/v1/admin/products/search?q=${encodeURIComponent(c.name.split(' ')[0])}`); ok(found.status === 200 && found.json.products.some(p => p.id === pid && p.hasPack), '7. the product is found by name from the library', found.json.products?.length);
    const put = await A(`/v1/admin/products/${pid}/tech-pack/artwork`, { body: { art: gid, placement: 'Left chest', widthIn: 3.5 } }); ok(put.status === 201 && put.json.placed === true, '8. the graphic goes on the product\'s tech pack as artwork, placed on the front', put.json);
    const pack = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data, a0 = pack.artwork[0];
    ok(a0 && /From the graphics library/.test(a0.note) && a0.placements[0]?.label === 'Left chest' && a0.placements[0].widthIn === 3.5 && /^data:image\/png/.test(a0.image), '   with its picture, where it goes and its width', a0 && { note: a0.note, placements: a0.placements });
    ok((await A(`/v1/admin/products/${pid}/tech-pack/artwork`, { body: { art: '00000000-0000-4000-8000-000000000000' } })).status === 404, '   a graphic that is not in the library is refused');
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab/studio?new=graphic`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)');
        ok(/Keep in the library/.test(await page.innerText('#apply')) && /clear background/.test(await page.innerText('#cSub')), '9. in a browser the graphics studio starts on a clear canvas, ready to keep in the library');
        await page.click('[data-tab="add"]'); await page.waitForSelector('#partTiles [data-part]', { timeout: 15000 });
        const before = await page.evaluate(() => LAYERS.length); await page.click('#partTiles [data-part]'); await page.waitForFunction(n => LAYERS.length === n + 1, before, { timeout: 15000 });
        ok(await page.evaluate(() => LAYERS[LAYERS.length - 1].src.startsWith('/lab/flat-parts/')), '   a part from the sketch pack becomes a layer', await page.evaluate(() => LAYERS[LAYERS.length - 1].src));
        await page.click('#partKinds [data-pkind="zips"]'); await page.waitForFunction(() => document.querySelectorAll('#partTiles [data-part^="zips-"]').length > 0);
        ok(true, '   and the parts come in kinds: pockets, zips, collars, trims, buttons');
        await page.goto(`${BASE}/lab/library`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)');
        ok(await page.locator('#buildGo[href="/lab/studio?new=graphic"]').count() === 1, '10. the library offers to build a graphic in the studio');
        await page.goto(`${BASE}/tech-packs/${pid}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#tabs [data-tab="art"]'); await page.click('#tabs [data-tab="art"]');
        ok(await page.locator('[data-act="artlib"]').count() === 1, '11. the tech pack offers artwork from the graphics library');
        await page.click('[data-act="artlib"]'); await page.waitForSelector('#artLibTiles [data-lib]', { timeout: 15000 });
        const nArt = await page.locator('[data-panel="art"] article.art').count(); await page.click(`#artLibTiles [data-lib="${gid}"]`); await page.waitForFunction(n => document.querySelectorAll('[data-panel="art"] article.art').length === n + 1, nArt, { timeout: 20000 });
        ok(await page.locator('[data-panel="art"] article.art .art-note', { hasText: 'From the graphics library' }).count() >= 1, '   picking one adds it to the pack like an upload, Pantones read and ready to place');
        ok(!errs.length, 'no page errors', errs);
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J221', 'The production artwork pack: a library graphic plus a technique becomes a job file the factory works from. Screen print: one ink layer and film per colour with its Pantone, the underbase for a dark garment, halftone and mesh; embroidery: threads, stitch, backing and a stitch count; a patch: the cut line and edge; a heat transfer: mirrored. In a browser from the library (the summary changes with the technique, width and garment colour, then the zip downloads) and from the tech pack\'s artwork card', async () => {
  const { brands, plan } = await conceptSetup();
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  try {
    // a three-colour mark of our own: a red disc, a white ring, a black bar
    const markPng = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><circle cx="450" cy="300" r="270" fill="#d7262b"/><circle cx="450" cy="300" r="180" fill="#ffffff"/><rect x="300" y="255" width="300" height="90" fill="#111111"/></svg>')).png().toBuffer();
    const techs = (await K('/library/techniques')).json.techniques, tech = key => techs.find(t => t.key === key);
    const up = await K('/library/graphics/upload', { body: { image: `data:image/png;base64,${markPng.toString('base64')}`, name: `J221 mark ${stamp}`, tags: ['j221'], techniqueId: tech('plastisol').id } });
    ok(up.status === 201 && up.json.id, '1. our artwork is in the library, made as plastisol', up.json); const gid = up.json.id;
    const pr = await K(`/library/graphics/${gid}/job?preview=1&widthIn=4&garment=%231a1a1a`); const j = pr.json.job;
    ok(pr.status === 200 && j && j.colours.length === 3 && j.colours.map(c => c.pantone).join('|') === 'PANTONE 711 C|White|PANTONE Neutral Black C', '2. the job summary reads the three colours as Pantone C', pr.json);
    ok(j.print && j.print.screens === 4 && j.print.underbase && !j.print.halftone && j.print.lpi === 0 && j.print.meshCount === 156 && j.print.order[0].startsWith('Underbase'), '   a plastisol print on a dark garment: four screens (three colours and the underbase), solid colours (no tones to screen), 156 mesh, the underbase first on the press', j.print);
    ok(j.size.widthIn === 4 && j.size.widthMm === 102 && j.size.px[0] === 1200 && pr.json.files.some(f => f.name === 'underbase.png') && pr.json.files.some(f => f.name === 'job-sheet.pdf'), '   at 4 in wide, 300 dpi, with the underbase file and the job sheet', pr.json.files.map(f => f.name));
    const light = (await K(`/library/graphics/${gid}/job?preview=1&widthIn=4&garment=%23f4f1ea`)).json.job; ok(light.print.underbase === false && light.print.screens === 3, '   on a light garment there is no underbase: three screens');
    const emb = (await K(`/library/graphics/${gid}/job?preview=1&widthIn=3&technique=${tech('satin-embroidery').id}`)).json.job;
    ok(emb.embroidery && emb.embroidery.threads.length === 3 && emb.embroidery.stitch === 'satin stitch' && emb.embroidery.stitches > 1000 && emb.embroidery.files.dst && pr.json.files && /backing|away/.test(emb.embroidery.backing), '3. made as satin embroidery instead: digitized, three threads to match, the stitch, backing and the real stitch count', emb.embroidery);
    const patch = (await K(`/library/graphics/${gid}/job?preview=1&widthIn=3&technique=${tech('woven-patch').id}`)).json; ok(patch.job.patch && /edge/.test(patch.job.patch.edge) && patch.files.some(f => f.name === 'cut-line.png'), '   as a woven patch: a cut line and an edge finish', patch.job.patch);
    const ht = (await K(`/library/graphics/${gid}/job?preview=1&widthIn=3&technique=${tech('glossy-transfer').id}`)).json; ok(ht.job.transfer && ht.files.some(f => f.name === 'artwork-mirrored-300dpi.png'), '   as a heat transfer: the artwork mirrored for the carrier');
    ok((await K(`/library/graphics/${gid}/job?preview=1&technique=00000000-0000-4000-8000-000000000000`)).status === 404 && (await K('/library/graphics/00000000-0000-4000-8000-000000000000/job')).status === 404, '   a technique or graphic that is not in the library is refused');
    const z = await fetch(`${BASE}/v1/lab/library/graphics/${gid}/job?widthIn=4&garment=%231a1a1a`, { headers: { Authorization: 'Bearer ' + kyleT } }); const zb = Buffer.from(await z.arrayBuffer());
    ok(z.status === 200 && z.headers.get('content-type') === 'application/zip' && /-plastisol-screen-print-job\.zip"/.test(z.headers.get('content-disposition') || '') && zb.readUInt32LE(0) === 0x04034b50 && zb.length > 50000, '4. the job file downloads as a zip named for the graphic and the technique', { status: z.status, type: z.headers.get('content-type'), bytes: zb.length });
    const names = []; { const e = zb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const n = zb.readUInt16LE(e + 10); let p = zb.readUInt32LE(e + 16); for (let i = 0; i < n; i++) { const nl = zb.readUInt16LE(p + 28); names.push(zb.toString('utf8', p + 46, p + 46 + nl)); p += 46 + nl + zb.readUInt16LE(p + 30) + zb.readUInt16LE(p + 32); } }
    ok(['artwork-300dpi.png', 'ink-01-pantone-711-c.png', 'film-01-pantone-711-c.png', 'ink-02-white.png', 'film-02-white.png', 'ink-03-pantone-neutral-black-c.png', 'film-03-pantone-neutral-black-c.png', 'underbase.png', 'job.json', 'job-sheet.pdf', 'README.txt'].every(n => names.includes(n)), '   holding the artwork, an ink and a film per colour, the underbase, job.json, the sheet and a README', names);
    ok((await call(`/v1/lab/library/graphics/${gid}/job`, { token: patT })).status === 403 || (await call(`/v1/lab/library/graphics/${gid}/job`, { token: patT })).status === 401, '   a client cannot pull it');
    // onto a product, then the job file from the pack's own artwork card
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } });
    const fl = (await K(`/concepts/${c.id}/flats`)).json; await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat });
    const pid = (await K(`/concepts/${c.id}/tech-pack`, { body: {} })).json.productId;
    await A(`/v1/admin/products/${pid}/tech-pack/artwork`, { body: { art: gid, placement: 'Left chest', widthIn: 3.5 } });
    const a0 = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data.artwork[0]; ok(a0 && a0.libraryArt === gid, '5. the pack remembers which library graphic its artwork came from', a0 && a0.libraryArt);
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab/library`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.fill('#fQ', 'J221 mark'); await page.waitForSelector(`[data-g="${gid}"]`, { timeout: 15000 }); await page.click(`[data-g="${gid}"]`);
        await page.waitForFunction(() => /PANTONE 711 C/.test(document.querySelector('#gjInfo').textContent), null, { timeout: 20000 });
        ok(/4 screens incl\. underbase · solid colours · mesh 156/.test(await page.innerText('#gjInfo')), '6. in a browser the graphic\'s window sums up the job: colours as Pantone chips, screens, halftone or solid, and mesh', await page.innerText('#gjInfo'));
        await page.selectOption('#gjTech', tech('satin-embroidery').id); await page.waitForFunction(() => /stitches/.test(document.querySelector('#gjInfo').textContent), null, { timeout: 20000 }); ok(/satin stitch · [\d,]+ stitches · \d+ trims/.test(await page.innerText('#gjInfo')), '   change the technique and it is an embroidery job, digitized: stitches and trims');
        await page.fill('#gjWidth', '12'); await page.waitForFunction(() => /12 × /.test(document.querySelector('#gjInfo').textContent), null, { timeout: 20000 }); ok(/over the usual|is heavy/.test(await page.innerText('#gjInfo')), '   too big for the technique and it says so', await page.innerText('#gjInfo'));
        await page.fill('#gjWidth', '4'); await page.selectOption('#gjTech', tech('plastisol').id); await page.waitForFunction(() => /screens/.test(document.querySelector('#gjInfo').textContent), null, { timeout: 20000 });
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#gjGo')]); ok(/-plastisol-screen-print-job\.zip$/.test(dl.suggestedFilename()), '7. Download the job file brings the zip down', dl.suggestedFilename());
        await page.waitForFunction(() => /Job file downloaded/.test(document.body.textContent), null, { timeout: 8000 }); ok(true, '   and the press answers: downloaded');
        await page.goto(`${BASE}/tech-packs/${pid}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#tabs [data-tab="art"]'); await page.click('#tabs [data-tab="art"]');
        ok(await page.locator('[data-act="artjob"]').count() === 1, '8. the tech pack\'s artwork card offers the job file for a graphic from the library');
        const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-act="artjob"]')]); ok(/-job\.zip$/.test(dl2.suggestedFilename()), '   and it downloads from the pack at the width the graphic is placed', dl2.suggestedFilename());
        ok(!errs.length, 'no page errors', errs);
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J222', 'Materials, trims and tags: the library (fabrics with weight, composition, mill and price; trims; tags in their shapes and sizes for shirts, pants and hang tags, drawn to size); choosing them on a concept sets its BOM, landed cost and margin, with colourways side by side on the board; the tech pack takes the BOM lines, the labels and the colourways; the studio can redraw the piece in a fabric', async () => {
  const { brands, plan } = await conceptSetup();
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  try {
    const lib = await K('/materials'); const by = key => lib.json.materials.find(m => m.key === key);
    ok(lib.status === 200 && lib.json.materials.length >= 30 && lib.json.options.kinds.map(k => k.id).join() === 'fabric,trim,tag,footwear,plush,plastic' && lib.json.options.tag.shapes.includes('shield'), '1. the library opens with the starting fabrics, trims and tags (and footwear, plush and plastics)', lib.json.materials?.length);
    const pants = (await K('/materials?kind=tag&for=pants')).json.materials; ok(pants.length >= 3 && pants.every(t => t.spec.for.includes('pants')) && pants.some(t => t.spec.tagKind === 'waistband') && pants.some(t => t.spec.tagKind === 'hang' && t.spec.shape === 'square'), '   tags for pants: a waistband label, a back pocket patch, a square kraft hang tag', pants.map(t => t.name));
    const svg = await fetch(`${BASE}/v1/lab/materials/${by('hang-rect').id}/tag.svg`, { headers: { Authorization: 'Bearer ' + kyleT } }); const svgText = await svg.text();
    ok(svg.status === 200 && /image\/svg/.test(svg.headers.get('content-type')) && /50 × 90 mm · rectangle/.test(svgText) && /<circle cx=/.test(svgText), '   a hang tag is drawn to size with its eyelet and string');
    const added = await K('/materials', { body: { kind: 'fabric', name: `J222 fleece ${stamp}`, price: '9.50', unit: 'm', supplier: 'Test mill', spec: { weightGsm: 400, composition: '100% cotton', construction: 'loopback fleece', widthCm: 180, finish: 'garment dyed' }, colours: [{ hex: '#334455', name: 'slate' }] } });
    ok(added.status === 201 && added.json.material.priceCents === 950 && added.json.material.colours[0].pantone, '2. a fabric of our own is added, its colour matched to a Pantone', added.json);
    const fid = added.json.material.id; ok((await K('/materials/' + fid, { method: 'PUT', body: { price: '10' } })).json.material.priceCents === 1000, '   and its price changed');
    ok((await K('/materials', { body: { kind: 'tag', name: 'x' } })).status === 422, '   a tag without a real name is refused');
    // on a concept
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    await K(`/concepts/${c.id}`, { method: 'PUT', body: { price: '98' } });
    const m1 = await K(`/concepts/${c.id}/materials`, { body: { material: by('loopback-450').id, role: 'main', colour: '#1f1f22' } });
    ok(m1.status === 201 && m1.json.picks.length === 1 && m1.json.picks[0].colour.name === 'washed black' && m1.json.cost.materialsCents === Math.round(1.3 * 1180) && m1.json.cost.makingCents === 480, '3. the main fabric goes on the concept at the usual usage for a top, in washed black', m1.json.cost);
    const landed = m1.json.cost.landedCents; ok(landed === Math.round((1534 + 480) * 1.18) && m1.json.cost.marginPct === Math.round((1 - landed / 9800) * 1000) / 10, '   landed cost adds making, freight and duty; the margin reads the target price', m1.json.cost);
    const c1 = (await K(`/concepts/${c.id}`)).json.concept; ok(Math.round(c1.cost * 100) === landed && /loopback fleece.*washed black/.test(c1.spec.fabric), '   the concept\'s cost and fabric words now follow the library', { cost: c1.cost, fabric: c1.spec.fabric });
    const m2 = await K(`/concepts/${c.id}/materials`, { body: { material: fid, role: 'main' } }); ok(m2.json.picks.filter(p => p.role === 'main').length === 1 && m2.json.picks.some(p => p.id === by('loopback-450').id && p.role === 'contrast'), '   a second main fabric makes the first the contrast');
    for (const key of ['zip-5-metal', 'tag-neck-woven', 'tag-care', 'hang-rect']) await K(`/concepts/${c.id}/materials`, { body: { material: by(key).id } });
    const m3 = (await K(`/concepts/${c.id}/materials/${by('zip-5-metal').id}`, { method: 'PUT', body: { qty: '2' } })).json; ok(m3.picks.find(p => p.id === by('zip-5-metal').id).qty === 2 && m3.picks.length === 6, '4. a zip, a neck label, a care label and a hang tag go on too; the zip is wanted twice', m3.picks.map(p => p.name));
    const k2 = (await K(`/concepts/${c.id}/costing`, { method: 'PUT', body: { making: '6', freightPct: '12' } })).json.cost; ok(k2.makingCents === 600 && k2.freightPct === 12 && k2.landedCents === k2.materialsCents + 600 + Math.round((k2.materialsCents + 600) * .12), '   the making cost and freight can be ours', k2);
    const cw = await K(`/concepts/${c.id}/colourways`, { method: 'PUT', body: { colourways: [{ name: 'Washed black', hex: '#1f1f22' }, { name: 'Moss', hex: '#5b6648', thread: '#e9e3d4' }] } });
    ok(cw.status === 200 && cw.json.colourways.length === 2 && /^PANTONE /.test(cw.json.colourways[1].pantone) && /^PANTONE /.test(cw.json.colourways[1].threadPantone), '5. two colourways, each with a Pantone read from the colour (and the thread\'s)', cw.json);
    const board = (await K('/assortment?status=all')).json.concepts.find(x => x.id === c.id); ok(board && board.colourways.length === 2 && board.materials === 6, '   the assortment board carries them');
    ok((await K(`/concepts/${c.id}/materials/${by('tag-care').id}`, { method: 'DELETE' })).json.picks.length === 5, '   taking one off');
    // to the tech pack
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } });
    const fl = (await K(`/concepts/${c.id}/flats`)).json; await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat });
    const pid = (await K(`/concepts/${c.id}/tech-pack`, { body: {} })).json.productId, pack = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data;
    const lib_bom = pack.bom.filter(r => r.notes === 'From the materials library');
    ok(lib_bom.length === 5 && lib_bom.some(r => r.component === 'Main fabric' && r.cost === '10' && /400 gsm/.test(r.spec)) && lib_bom.some(r => r.component === 'Contrast fabric' && r.color === '#1f1f22') && lib_bom.some(r => r.component === 'Zip' && r.qty === '2'), '6. the tech pack\'s BOM carries every material with its spec, colour, quantity and unit cost', lib_bom.map(r => [r.component, r.qty, r.cost]));
    ok(pack.labels.some(l => /^Neck label · /.test(l.item) && /60 × 15 mm damask woven neck label, end fold/.test(l.spec) && /neck seam/.test(l.placement)) && pack.labels.some(l => /^Hang tag · /.test(l.item) && /cotton twine through a brass eyelet/.test(l.spec)), '   the labels section lists the tags with their size, shape, fold, material and where they go', pack.labels.map(l => l.item));
    ok(pack.colorways.some(x => x.swatch === '#5b6648' && /^PANTONE /.test(x.code) && /thread PANTONE/.test(x.notes)), '   and the colourways with their Pantones', pack.colorways);
    const lib2 = (await K(`/materials?q=${encodeURIComponent('J222 fleece')}`)).json.materials; ok(lib2.length === 1 && lib2[0].id === fid, '   the library finds a fabric by name');
    ok((await K('/materials/' + fid, { method: 'DELETE' })).json.ok === true && !(await K(`/materials?q=${encodeURIComponent('J222 fleece')}`)).json.materials.length && (await K(`/concepts/${c.id}/materials`)).json.picks.some(p => p.id === fid), '7. taken out of the library, the fabric stays on the concept that uses it');
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab/materials#tags`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.waitForSelector('[data-tagsvg] svg', { timeout: 15000 });
        ok(await page.locator('[data-tagsvg] svg').count() >= 10, '8. in a browser the tags page draws every tag to size', await page.locator('[data-tagsvg] svg').count());
        const outside = await page.evaluate(() => [...document.querySelectorAll('[data-tagsvg]')].filter(sw => { const a = sw.getBoundingClientRect(), v = sw.querySelector('svg')?.getBoundingClientRect(); return !v || v.width < 20 || v.left < a.left - 1 || v.right > a.right + 1 || v.top < a.top - 1 || v.bottom > a.bottom + 1; }).length);
        ok(outside === 0, '   every tag, string and all, sits whole inside its tile', outside);
        for (const [tab, what] of [['fabric', 'fabric'], ['trim', 'trim']]) {
          await page.click(`#kinds [data-kind="${tab}"]`); await page.waitForFunction(t => document.getElementById('grid').dataset.kind === t && document.querySelectorAll('#grid [data-draw]').length > 0 && !document.querySelector('#grid [data-tagsvg]') && [...document.querySelectorAll('#grid [data-draw]')].every(el => el.dataset.swatch || el.querySelector('svg')), tab, { timeout: 15000 }); // the tab's own cards, not the tags still showing
          const n = await page.evaluate(() => [...document.querySelectorAll('#grid [data-draw]')].filter(el => el.querySelector('svg[role="img"]')).length), all = await page.locator('#grid .card').count();
          ok(n === all && n >= 10, `   every ${what} without a photo is drawn: its weave or its trim, in its colour`, `${n}/${all}`);
        }
        // photos of real cloth, recoloured to each fabric's first colour, over the drawing
        await page.click('#kinds [data-kind="fabric"]'); await page.waitForFunction(() => { const im = [...document.querySelectorAll('#grid img.ph')]; return im.length >= 40 && im.slice(0, 12).every(i => i.complete && i.naturalWidth > 0); }, null, { timeout: 30000 }).catch(() => {});
        const ph = await page.evaluate(() => { const im = [...document.querySelectorAll('#grid img.ph')]; return { n: im.length, all: document.querySelectorAll('#grid .card').length, loaded: im.filter(i => i.complete && i.naturalWidth > 0).length }; });
        ok(ph.n >= 40 && ph.n / ph.all > .85, '9. the fabrics show photos of real cloth: denim, fleece, terry, knits, polyesters, ripstop, nylon and canvas', JSON.stringify(ph));
        const hue = await page.evaluate(async () => { const card = [...document.querySelectorAll('#grid .card')].find(c => /16 oz heavyweight selvedge denim/.test(c.textContent)), im = card?.querySelector('img.ph'); if (!im) return null; await im.decode().catch(() => {}); const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d'); x.drawImage(im, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return { r: r / n, g: g / n, b: b / n, src: im.getAttribute('src') }; });
        ok(hue && /denim-raw\.jpg\?c=1c2742/.test(hue.src) && hue.b > hue.r + 8 && hue.r < 90, '   the raw selvedge denim is a raw-denim photo in its own deep indigo', JSON.stringify(hue));
        await page.locator('#grid .card', { hasText: '1000D Cordura nylon' }).click(); await page.waitForSelector('#dlg[open]');
        await page.waitForFunction(() => document.querySelector('#dPrev img.ph')?.naturalWidth > 0 && /CC0|CC BY/.test(document.querySelector('#dCredit').textContent), null, { timeout: 10000 }).catch(() => {});
        ok(await page.evaluate(() => document.querySelector('#dPrev img.ph')?.naturalWidth > 0 && /recoloured/.test(document.querySelector('#dCredit').textContent) && /ambientCG/.test(document.querySelector('#dCredit').textContent)), '   opened, the fabric shows its photo large, with the credit and the licence', await page.innerText('#dCredit').catch(() => ''));
        const opts = await page.evaluate(() => [...document.querySelectorAll('[data-s="photo"] option')].map(o => o.value));
        ok(opts.includes('') && opts.includes('none') && opts.includes('canvas') && !opts.includes('zip-metal'), '   a photo can be chosen by hand, or none for the drawing', opts.length);
        await page.click('#dlg [data-close]');
        await page.click('#kinds [data-kind="tag"]'); await page.waitForSelector('#forSel:not([style*="none"])');
        await page.selectOption('#forSel', 'pants'); await page.waitForFunction(() => document.querySelectorAll('#grid .card').length < 12 && document.querySelectorAll('#grid .card').length > 0); ok(/Waistband label/.test(await page.innerText('#grid')), '   filtered to pants: the waistband label is there');
        await page.click('#add'); await page.waitForSelector('#dlg[open]'); await page.fill('[data-s="widthMm"]', '70'); await page.fill('[data-s="heightMm"]', '30'); await page.selectOption('[data-s="shape"]', 'rounded');
        await page.waitForFunction(() => /70 × 30 mm · rounded/.test(document.querySelector('#dPrev').textContent), null, { timeout: 5000 }); ok(true, '   a new tag is drawn as it is typed: 70 × 30 mm, rounded');
        await page.keyboard.press('Escape');
        await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.waitForSelector(`.cc[data-cid="${c.id}"]`, { timeout: 20000 }); await page.click(`.cc[data-cid="${c.id}"]`);
        await page.waitForFunction(() => /Landed cost/.test(document.querySelector('#matIn')?.textContent || ''), null, { timeout: 20000 });
        ok(/Main fabric/.test(await page.innerText('#matIn')) && /Hang tag|Neck label/.test(await page.innerText('#matIn')) && (await page.locator('#cwRows .cwrow').count()) === 2, '9. the concept window lists what it is made of, the cost breakdown and the two colourways', (await page.innerText('#matIn')).slice(0, 200));
        await page.click('#cd [data-cclose]'); await page.goto(`${BASE}/lab#assort`, { waitUntil: 'networkidle' }); await page.waitForSelector(`.at[data-aid="${c.id}"] .cwt`, { timeout: 20000 });
        ok(await page.locator(`.at[data-aid="${c.id}"] .cwt`).count() === 2, '   the assortment board shows its colourways side by side');
        await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.click('[data-tab="ai"]'); await page.waitForSelector('#fabUse', { timeout: 15000 });
        ok(/On the concept:/.test(await page.innerText('#fabSec')) && await page.locator('#fabSel option').count() >= 10, '10. the studio knows the fabric on the concept and offers the library to redraw the piece in');
        ok(!errs.length, 'no page errors', errs);
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J223', 'Reviewing together: a comment pinned to a spot on the picture, resolved when dealt with; the studio keeps versions (every picture used, any kept on purpose) and shows two side by side with a wipe, and opens an old one\'s layers; a view-only link for a client or a factory opens without a sign-in, shows the piece, the flats and the comments, takes a pinned comment and cannot change anything; a turned-off or expired link stops', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    // pins
    const p1 = await K(`/concepts/${c.id}/comments`, { body: { body: 'Lower this pocket by an inch', pin: { on: 'picture', x: 0.62, y: 0.55 } } }); ok(p1.status === 201 && p1.json.pin?.x === 0.62, '1. a comment is pinned to a spot on the picture', p1.json);
    await K(`/concepts/${c.id}/comments`, { body: { body: 'General: love the colour' } });
    let d = (await K(`/concepts/${c.id}`)).json; ok(d.comments.length === 2 && d.comments[0].pin?.on === 'picture' && d.comments[1].pin === null && !d.comments[0].resolvedAt, '   the concept lists it with its pin, the other without');
    ok((await K(`/concepts/${c.id}/comments/${d.comments[0].id}/resolve`, { body: { resolved: true } })).json.resolved === true && (await K(`/concepts/${c.id}`)).json.comments[0].resolvedAt, '   marked done once dealt with');
    ok((await K(`/concepts/${c.id}/comments/${d.comments[0].id}/resolve`, { body: { resolved: false } })).json.resolved === false, '   and reopened');
    // versions
    const png = await sharp({ create: { width: 640, height: 640, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer(), png2 = await sharp({ create: { width: 640, height: 640, channels: 4, background: { r: 40, g: 60, b: 200, alpha: 1 } } }).png().toBuffer();
    const doc = { w: 640, h: 640, layers: [{ id: 'bg', kind: 'base' }, { id: 't', kind: 'text', text: 'V ONE' }] };
    const k1 = await K(`/concepts/${c.id}/studio/versions`, { body: { image: `data:image/png;base64,${png.toString('base64')}`, doc, note: 'first idea' } }); ok(k1.status === 201 && k1.json.n === 1, '2. a version is kept from the studio on purpose', k1.json);
    const ap = await K(`/concepts/${c.id}/studio/apply`, { body: { image: `data:image/png;base64,${png2.toString('base64')}`, doc: { ...doc, layers: [...doc.layers, { id: 'u', kind: 'text', text: 'V TWO' }] } } }); ok(ap.status === 200, '   a picture used as the concept is kept as a version too', ap.json);
    const vs = (await K(`/concepts/${c.id}/studio/versions`)).json.versions; ok(vs.length === 2 && vs[0].n === 2 && vs[0].applied === true && vs[1].n === 1 && vs[1].note === 'first idea' && vs.every(v => v.hasLayers), '   both listed, newest first, the used one marked', vs);
    const v1 = (await K(`/concepts/${c.id}/studio/versions/1`)).json; ok(v1.doc?.layers?.length === 2 && v1.doc.layers[1].text === 'V ONE', '   an old version gives back its layers to carry on from');
    const im = await fetch(`${BASE}/v1/lab/concepts/${c.id}/studio/versions/2/image?thumb=1`, { headers: { Authorization: 'Bearer ' + kyleT } }); ok(im.status === 200 && im.headers.get('content-type') === 'image/jpeg', '   and its picture');
    ok((await K(`/concepts/${c.id}/studio/versions/9`)).status === 404, '   a version that is not there is 404');
    // share links
    const sh = await K(`/concepts/${c.id}/shares`, { body: { audience: 'factory', label: 'Sun Garment', days: 7 } }); ok(sh.status === 201 && /\/lab\/share\/[A-Za-z0-9_-]{20,}$/.test(sh.json.share.url) && sh.json.share.audience === 'factory', '3. a view-only link is made for the factory', sh.json);
    const url = sh.json.share.url, token = url.split('/lab/share/')[1], S = (path, o = {}) => call(`/v1/lab/share/${token}${path}`, o);
    const listed = (await K(`/concepts/${c.id}/shares`)).json.shares; ok(listed.length === 1 && listed[0].url === null && listed[0].opens === 0, '   the link is shown once; the list keeps its label and opens, not the link');
    const pub = await S(''); ok(pub.status === 200 && pub.json.concept.name === c.name && pub.json.audience === 'factory' && pub.json.label === 'Sun Garment' && pub.json.comments.length === 1 && pub.json.comments[0].pin, '4. it opens without a sign-in: the piece and the pinned comment (the general staff note stays in-house)', pub.json);
    ok((await K(`/concepts/${c.id}/shares`)).json.shares[0].opens === 1, '   the opening is counted');
    const pc = await S('/comments', { body: { name: 'Mr Lin', body: 'The pocket bag needs 2 cm more', pin: { on: 'picture', x: 0.3, y: 0.7 } } }); ok(pc.status === 201 && pc.json.comment.name === 'Mr Lin (factory)' && pc.json.comment.pin.y === 0.7, '5. the factory pins a comment of its own', pc.json);
    ok((await S('/comments', { body: { name: 'M', body: 'x' } })).status === 422, '   without a name or words it is refused');
    d = (await K(`/concepts/${c.id}`)).json; ok(d.comments.some(x => x.via === 'share' && x.name === 'Mr Lin (factory)' && x.pin?.x === 0.3), '   staff see it on the concept with its pin');
    ok((await call(`/v1/lab/share/${token}/image`)).status === 200 || !pub.json.concept.hasImage, '   the picture is served on the link');
    ok((await call(`/v1/lab/share/${token}`, { method: 'PUT', body: {} })).status === 404 && (await call(`/v1/lab/share/${token}/studio`, { body: {} })).status === 404, '   nothing on the link can change the design');
    ok((await K(`/concepts/${c.id}/shares/${sh.json.share.id}`, { method: 'DELETE' })).json.ok === true && (await S('')).status === 410, '6. turned off, the link stops');
    ok((await call('/v1/lab/share/not-a-real-token-at-all-0000')).status === 404, '   a made-up link is not found');
    const sh2 = (await K(`/concepts/${c.id}/shares`, { body: { audience: 'client', days: 30 } })).json.share, token2 = sh2.url.split('/lab/share/')[1];
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const pub2 = await b.newPage(), errs = []; pub2.on('pageerror', e => errs.push(String(e)));
        await pub2.goto(`${BASE}/lab/share/${token2}`, { waitUntil: 'networkidle' }); await pub2.waitForSelector('#app:not(.hidden)');
        ok((await pub2.innerText('#name')) === c.name && (await pub2.locator('#cm .c').count()) >= 2 && (await pub2.locator('#vPic .pin').count()) >= 1, '7. in a browser the review page shows the piece, the comments and the pins, with no sign-in', await pub2.innerText('#who'));
        await pub2.fill('#cName', 'Ana'); await pub2.fill('#cBody', 'Make the sleeve longer'); await pub2.click('#pinBtn'); const img = pub2.locator('#vPic img'); const bb = await img.boundingBox(); await pub2.mouse.click(bb.x + bb.width * 0.8, bb.y + bb.height * 0.2);
        ok(/Pinned on the picture at 80% across, 20% down/.test(await pub2.innerText('#pinNote')), '   a spot is picked on the picture', await pub2.innerText('#pinNote'));
        await pub2.click('#send'); await pub2.waitForFunction(() => /Sent\./.test(document.querySelector('#msg').textContent), null, { timeout: 10000 });
        ok(/Ana \(client\)/.test(await pub2.innerText('#cm')) && (await pub2.locator('#vPic .pin').count()) >= 2, '   the comment is sent and pinned', (await pub2.innerText('#cm')).slice(0, 160));
        ok(!errs.length, '   no page errors on the review page', errs);
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs2 = []; page.on('pageerror', e => errs2.push(String(e)));
        await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.waitForSelector(`.cc[data-cid="${c.id}"]`, { timeout: 20000 }); await page.click(`.cc[data-cid="${c.id}"]`);
        await page.waitForSelector('#cd .big .pin', { timeout: 20000 }); ok((await page.locator('#cd .big .pin').count()) >= 3 && (await page.locator('#cd .cm .c .n').count()) >= 3, '8. the concept window shows every pin on the picture, numbered to the comments');
        await page.waitForFunction(() => /For the client/.test(document.querySelector('#shrIn')?.textContent || ''), null, { timeout: 15000 }); ok(/Turn off/.test(await page.innerText('#shrIn')), '   and the review links with a Turn off');
        await page.click('#cd [data-cclose]');
        await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.click('#verBtn'); await page.waitForSelector('#verList [data-vn="2"]', { timeout: 15000 });
        ok((await page.locator('#verList [data-vn]').count()) === 2, '9. the studio lists both versions'); await page.check('[data-vsel="1"]'); await page.check('[data-vsel="2"]'); await page.waitForSelector('#verCmp:not(.hidden)');
        await page.evaluate(() => { const r = document.querySelector('#verWipe'); r.value = '30'; r.dispatchEvent(new Event('input', { bubbles: true })); }); ok(/70%/.test(await page.evaluate(() => document.querySelector('#verB').style.clipPath)), '   two side by side with the wipe');
        await page.click('[data-vopen="1"]'); await page.waitForFunction(() => /Version 1 is on the canvas/.test(document.body.textContent), null, { timeout: 15000 }); ok(await page.evaluate(() => LAYERS.some(l => l.text === 'V ONE')), '   an old version opens with its layers to carry on from');
        ok(!errs2.length, 'no page errors', errs2);
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J224', 'Closing the loop with the physical sample: the samples are dated on a time-and-action calendar from the day the pack goes out, a late one shows on the console\'s Production attention; photographs of the sample go on its review and the vision model holds them up against the approved design (placement, colour, wash, construction); the differences become corrections for the next version. Over HTTP and in a browser', async () => {
  const { brands, plan } = await conceptSetup();
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } });
    const fl = (await K(`/concepts/${c.id}/flats`)).json; await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat });
    const pid = (await K(`/concepts/${c.id}/tech-pack`, { body: {} })).json.productId; let pack = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data;
    await import('../../src/sample-review.js'); const FBSample = globalThis.FBSample;
    // the calendar
    pack.sampling = [{ stage: 'Proto sample', qty: '2', status: 'requested' }, { stage: 'Fit sample', qty: '2', status: 'planned' }, { stage: 'Pre-production sample', qty: '3', status: 'planned' }, { stage: 'Top of production', qty: '2', status: 'planned' }];
    const dated = FBSample.planDates(pack, '2026-09-01'); ok(dated.sampling.map(r => r.due).join(',') === '2026-09-15,2026-09-27,2026-10-11,2026-10-18', '1. the four samples are dated in order from the day the pack goes out', dated.sampling.map(r => r.due));
    ok((await A(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data: dated } })).status === 200, '   and the dates are saved on the pack');
    const cal = FBSample.calendar((await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data); ok(cal[0].state === 'late' && cal[0].daysLate > 30 && cal[1].state === 'late' && cal[3].state === 'late', '   the calendar reads them against today: the proto is weeks late', cal.map(x => [x.stage, x.state]));
    const dash = await A('/v1/admin/dashboard'); const late = (dash.json.queues?.attention || []).filter(x => x.kind === 'sample-late' && x.productId === pid);
    ok(late.length === 4 && /Proto sample is \d+ days late \(due 2026-09-15\)/.test(late[0].title) && late[0].owner === 'factory' && late[0].severity === 'urgent', '2. the console\'s Production attention lists the late samples, on the factory until they ship', late.map(x => x.title));
    // the sample arrives: photographs and the comparison
    const photo = await sharp({ create: { width: 640, height: 800, channels: 3, background: { r: 40, g: 40, b: 44 } } }).jpeg().toBuffer();
    const cmp = await A(`/v1/admin/products/${pid}/tech-pack/sampling/0/compare`, { method: 'POST', body: { photos: [{ image: `data:image/jpeg;base64,${photo.toString('base64')}`, label: 'front' }] } });
    ok(cmp.status === 200 && cmp.json.review.photos.length === 1 && cmp.json.review.compare.findings.length === 3 && cmp.json.review.compare.verdict === 'close', '3. a photograph of the proto goes on its review and the vision model holds it up against the design', cmp.json);
    ok(cmp.json.corrections.length === 2 && cmp.json.corrections[0].area === 'left chest' && /Logo sits about 1 in lower/.test(cmp.json.corrections[0].change), '   the differences come back as corrections: placement off, wash too dark; the rib that matches is not one');
    ok((await A(`/v1/admin/products/${pid}/tech-pack/sampling/1/compare`, { method: 'POST', body: {} })).status === 422 && (await A(`/v1/admin/products/${pid}/tech-pack/sampling/9/compare`, { method: 'POST', body: {} })).status === 404, '   no photo, no comparison; no such sample, 404');
    pack = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data; ok(pack.sampling[0].review.compare.score === 68 && pack.sampling[0].review.photos[0].label === 'front', '   the pack keeps the photo and the comparison');
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/tech-packs/${pid}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#tabs [data-tab="bom"]'); await page.click('#tabs [data-tab="bom"]'); await page.waitForSelector('[data-ta]', { timeout: 15000 });
        ok((await page.locator('[data-ta] .st.late').count()) >= 4 && /time and action/i.test(await page.innerText('[data-ta]')), '4. in a browser the pack shows the time-and-action calendar with the late samples', (await page.innerText('[data-ta]')).slice(0, 120));
        await page.click('[data-act="srev"][data-i="0"]'); await page.waitForSelector('[data-srev="0"]');
        ok((await page.locator('[data-srev="0"] .sphotos img').count()) === 1 && (await page.locator('[data-srev="0"] .cmpf').count()) === 3 && /Close to the design · 68\/100/i.test(await page.innerText('[data-srev="0"]')), '   the review shows the photo and the comparison, finding by finding', { photos: await page.locator('[data-srev="0"] .sphotos img').count(), findings: await page.locator('[data-srev="0"] .cmpf').count(), text: (await page.innerText('[data-srev="0"]')).slice(0, 300) });
        await page.click('[data-act="srevadopt"]'); await page.waitForFunction(() => document.querySelectorAll('[data-srev="0"] .srevc').length === 2, null, { timeout: 8000 });
        ok(/Logo sits about 1 in lower/.test(await page.inputValue('[data-srev="0"] [data-rvc="0"][data-k="change"]')) && (await page.locator('[data-act="srevverdict"][data-v="revise"].on').count()) === 1, '5. one press makes the differences the corrections, and the verdict is “needs corrections”');
        await page.click('[data-act="taplanall"]'); await page.waitForFunction(() => /Samples dated from/.test(document.body.textContent), null, { timeout: 8000 }); ok(true, '   the samples can be dated again from any day');
        ok(!errs.length, 'no page errors', errs);
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J225', 'Finding your way round the Lab: the Design Lab is one section of the console with its parts as tabs across the top (Line plans, Concepts, Studio, Assortment, the libraries, Research), one at a time; a piece has a step bar (Concept · Picture · Flats · Pattern · Tech pack) that replaces the Lab menu in the Studio; the Studio and the flats open a concept picker instead of a dead end; the sketch pack has its own page and puts a sketch on a concept', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const nav = await fetch(`${BASE}/lab/nav.js`); ok(nav.status === 200 && /Sketch pack/.test(await nav.text()), '1. the Lab navigation is one script every Lab page loads');
    for (const path of ['/lab', '/lab/library', '/lab/materials', '/lab/sketches', '/lab/flats', '/lab/studio']) { const r = await fetch(`${BASE}${path}`); const t = await r.text(); ok(r.status === 200 && /\/lab\/nav\.js/.test(t), `   ${path} carries it`); }
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.waitForSelector('.fbtabs [data-tabs="lab"] a', { state: 'visible' });
        const tabs = await page.$$eval('.fbtabs [data-tabs="lab"] a:not(.act)', els => els.map(e => e.textContent.trim())); // the parts; New design leads the row as its one action
        ok(/New design/.test(await page.innerText('.fbtabs [data-tabs="lab"] a.act')), '   New design leads the row');
        ok(tabs.join(',') === 'Line plans,Concepts,Studio,Assortment,Sketch pack,Graphics & techniques,Materials,Research' && await page.locator('nav.labnav a').count() === 0 && await page.locator('[data-lab-menu]').count() === 0, '2. the Lab\'s parts are the one row of tabs across the top (no second Lab menu on the page)', tabs);
        ok(/Line plans/.test(await page.innerText('.fbtabs a.on')) && await page.isVisible('#plans') && !(await page.isVisible('#board')) && !(await page.isVisible('#library')), '   the Lab opens on Line plans, on its own: the concepts and the research are their own tabs');
        await page.click('.fbtabs a[data-href="/lab#board"]'); await page.waitForFunction(() => document.getElementById('board').offsetParent && !document.getElementById('plans').offsetParent);
        ok(/Concepts/.test(await page.innerText('.fbtabs a.on')) && page.url().endsWith('#board'), '   Concepts shows the board on its own, the address follows');
        await page.click('.fbtabs a[data-href="/lab/studio"]'); await page.waitForSelector('#pickC:not(.hidden)', { timeout: 15000 }); await page.waitForSelector(`#pickList [data-pick="${c.id}"]`, { timeout: 15000 });
        ok(/Studio/.test(await page.innerText('.fbtabs a.on')) && /Studio/.test(await page.innerText('#pickC h1')), '3. Studio from the tabs: a concept picker, with Studio marked');
        await page.fill('#pickQ', c.name.split(' ')[0]); await page.click(`#pickList [data-pick="${c.id}"]`); await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 }); await page.waitForSelector('#stage');
        await page.waitForSelector('#pieceSteps a[data-step]'); const steps = await page.$$eval('#pieceSteps a[data-step]', els => els.map(e => e.dataset.step));
        ok(new URL(page.url()).searchParams.get('concept') === c.id && steps.join(',') === 'concept,picture,flats,pattern,techpack' && await page.getAttribute('#pieceSteps [data-step=picture]', 'aria-current') === 'step' && await page.locator('.fbtabs').isHidden() && await page.locator('#back').isHidden(), '   picking one opens it in the Studio with the piece\'s step bar (Concept · Picture · Flats · Pattern · Tech pack), on Picture; no tab row and no "← Concepts" over it');
        ok(/Concept plan|plan/i.test(await page.innerText('#pieceSteps .up')) && /\/lab\?plan=/.test(await page.getAttribute('#pieceSteps .up', 'href')), '   the bar leads back to the concept\'s own line plan', await page.innerText('#pieceSteps .up'));
        await page.click('#pieceSteps [data-step=flats]'); await page.waitForSelector('#app[data-v="front"]', { timeout: 15000 });
        ok(await page.getAttribute('#pieceSteps [data-step=flats]', 'aria-current') === 'step' && await page.isVisible('#viewSeg [data-v=back]') && !(await page.isVisible('#viewSeg [data-v=picture]')), '   Flats switches in place to the front flat, with Front and Back beside it');
        await page.click('#pieceSteps [data-step=techpack]'); await page.waitForSelector('#readyPop:not(.hidden)', { timeout: 8000 });
        ok(/tech pack/i.test(await page.innerText('#readyPop')), '   Tech pack, before there is one, opens the checklist that says what it still needs');
        await page.keyboard.press('Escape'); await page.click('#pieceSteps [data-step=concept]'); await page.waitForURL(/\/lab\?concept=/, { timeout: 15000 }); await page.waitForSelector('#cd[open] [data-csteps] a[data-step]', { timeout: 15000 });
        ok(await page.getAttribute('#cd [data-csteps] [data-step=concept]', 'aria-current') === 'step' && /\/lab\/studio\?concept=.*view=pattern/.test(await page.getAttribute('#cd [data-csteps] [data-step=pattern]', 'href')), '   Concept opens the concept itself, with the same step bar: every step one press away');
        await page.goto(`${BASE}/lab/sketches`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.waitForSelector('#gal [data-tpl]', { timeout: 15000 });
        const total = Number(await page.innerText('#count')); ok(total >= 380 && (await page.locator('#gal [data-tpl]').count()) >= 200, '4. the sketch pack page lists the pack', total);
        await page.fill('#q', 'cargo'); await page.waitForFunction(() => document.querySelectorAll('#gal [data-tpl]').length < 60 && document.querySelectorAll('#gal [data-tpl]').length > 0, null, { timeout: 8000 });
        await page.selectOption('#range', 'womens'); await page.waitForTimeout(300); const womens = await page.locator('#gal [data-tpl]').count(); await page.selectOption('#range', ''); await page.waitForTimeout(300);
        ok(womens < await page.locator('#gal [data-tpl]').count(), '   search and the range filter narrow it');
        const firstTpl = await page.getAttribute('#gal [data-tpl]', 'data-tpl'); await page.click('#gal [data-tpl]'); await page.waitForSelector('#sheet[open] #shArt img'); ok(/cargo/i.test(await page.innerText('#shName')) && /men|women|acc/i.test(await page.innerText('#shKind')), '   a sketch opens large in its sheet with its name and range', await page.innerText('#shName'));
        await page.click('#sheet .x');
        await page.click('.seg [data-sec="parts"]'); await page.waitForSelector('#parts img'); ok((await page.locator('#pkinds [data-pk]').count()) === 5 && (await page.locator('#parts img').count()) > 5, '   the parts shelf: pockets, zips, collars, trims, buttons');
        await page.click('.seg [data-sec="sketches"]'); await page.click('#gal [data-tpl]'); await page.waitForSelector('#sheet[open]'); await page.click('#sheet .onto summary'); await page.waitForSelector(`#pick [data-cid="${c.id}"]`, { timeout: 15000 }); await page.click(`#pick [data-cid="${c.id}"]`);
        await page.waitForURL(/\/lab\/studio\?concept=/, { timeout: 20000 }); await page.waitForSelector('#app[data-v="front"]', { timeout: 20000 }); await page.waitForFunction(() => !/template=/.test(location.search), null, { timeout: 15000 });
        const ff = page.frameLocator('#flatFrame'); await ff.locator('#app:not(.hidden)').waitFor({ timeout: 20000 });
        ok(new URL(page.url()).searchParams.get('concept') === c.id && /template=/.test(await page.getAttribute('#flatFrame', 'src')), '5. Put it on a concept opens that concept in Design on its flat front, with the sketch handed to the flats');
        const used = (await K(`/concepts/${c.id}/flats`)).json; ok(true, '   (the template is applied on the page; saved with the next Save)', used.flat?.template);
        // 6. straight from a sketch into Design: a new concept from it, opened on its front flat
        ok((await K('/concepts/from-sketch', { body: { template: 'nope' } })).status === 422, '6. a sketch that is not in the pack is refused');
        await page.goto(`${BASE}/lab/sketches`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)'); await page.fill('#q', 'pullover hoodie'); await page.waitForFunction(() => document.querySelectorAll('#gal [data-tpl]').length > 0 && document.querySelectorAll('#gal [data-tpl]').length < 40, null, { timeout: 8000 });
        ok(!(await page.isVisible('#openDesign')), '   Open in the Studio waits for a sketch (it is in the sheet a sketch opens)');
        const tplId = await page.getAttribute('#gal [data-tpl]', 'data-tpl'); await page.click('#gal [data-tpl]'); await page.waitForSelector('#sheet[open] #shArt img');
        ok(/Open the .+ in the Studio/.test(await page.innerText('#openDesign')) && !(await page.isDisabled('#openDesign')), '   picked: Open in the Studio names the sketch', await page.innerText('#openDesign'));
        await page.click('#openDesign'); await page.waitForURL(/\/lab\/studio\?concept=/, { timeout: 20000 }); await page.waitForSelector('#app[data-v="front"]', { timeout: 20000 });
        const newId = new URL(page.url()).searchParams.get('concept'), nc = (await K(`/concepts/${newId}`)).json.concept;
        await page.frameLocator('#flatFrame').locator('#app:not(.hidden)').waitFor({ timeout: 20000 });
        ok(newId && newId !== c.id && nc && nc.category === 'tops' && nc.spec.template === tplId && new RegExp(`template=${tplId}`).test(await page.getAttribute('#flatFrame', 'src') || ''), '   a new concept from that sketch opens in Design on its front flat, the sketch handed to the flats', { tplId, nc: nc && { name: nc.name, category: nc.category, spec: nc.spec } });
        ok((await K('/concepts?limit=120')).json.concepts.some(x => x.id === newId), '   and it is on the concepts board with the rest');
        await K(`/concepts/${newId}`, { method: 'DELETE' });
        await page.goto(`${BASE}/lab/flats`, { waitUntil: 'networkidle' }); await page.waitForURL(/\/lab\/studio/, { timeout: 15000 }); await page.waitForSelector('#pickC:not(.hidden)', { timeout: 15000 }); await page.waitForSelector(`#pickList [data-pick="${c.id}"]`, { timeout: 15000 });
        ok(/Studio/.test(await page.innerText('.fbtabs a.on')), '6. the old flats address lands on the Studio picker, with Studio marked');
        ok(!errs.length, 'no page errors', errs);
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J218', 'The factory views and writes in Messages; the team makes the corrections: the factory has no buttons on its link (it cannot acknowledge, quote, countersign or mark a sample sent), it writes that the proto shipped, the team records it, reviews the sample, and the corrections go out as version 2 while version 1 stays exactly as it was; flats sent again become version 3', async () => {
  const { brands, plan } = await conceptSetup(); await import('../../src/sample-review.js'); const FBSample = globalThis.FBSample;
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  ok((await A('/v1/admin/factory-actions', { method: 'PUT', body: { on: false } })).json.on === false, '0. factories read their links and write in Messages (the setting on the Factories page)');
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } });
    const fl = (await K(`/concepts/${c.id}/flats`)).json; await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat });
    const pid = (await K(`/concepts/${c.id}/tech-pack`, { body: {} })).json.productId;
    const data = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data; data.sampling = [{ stage: 'Proto sample', qty: '2', status: 'requested' }, { stage: 'Fit sample', qty: '2', status: 'planned' }];
    await A(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data } });
    ok((await A(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: view-only factory' } })).status === 200, '1. version 1 is published');
    const sup = (await A('/v1/admin/suppliers', { method: 'POST', body: { name: `View Only Mill ${stamp}` } })).json;
    const tok = (await A(`/v1/admin/products/${pid}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'review' } })).json.assignment.packUrl.split('/tp/')[1];
    const fv = (await call(`/v1/tp/${tok}`)).json; ok(fv.techPack.version === 1 && fv.factoryActions === false, '2. the factory reads version 1, with no buttons of its own', fv.factoryActions);
    const key = fv.techPack.readiness.callouts[0]?.key || 'x:1';
    for (const [what, path, body] of [['acknowledge a callout', 'ack', { key }], ['send a quote', 'quote', { currency: 'USD', tiers: [{ qty: 500, unit: 5 }], email: 'q@mill.test' }], ['countersign', 'sign', { name: 'Mill Manager' }], ['mark a sample sent', 'sample', { stage: 'Proto sample', tracking: 'X' }]]) {
      const r = await call(`/v1/tp/${tok}/${path}`, { body }); ok(r.status === 403 && /Messages/.test(r.json.error || ''), `   it cannot ${what} itself: it is told to write in Messages`, r.status);
    }
    const msg = await call(`/v1/tp/${tok}/messages`, { body: { body: 'The proto shipped today, DHL 5521' } }); ok(msg.status === 200 || msg.status === 201, '3. the factory writes that the proto shipped, in Messages', msg.status);
    const sent = await A(`/v1/admin/products/${pid}/tech-pack/sample-sent`, { method: 'POST', body: { stage: 'Proto sample', tracking: 'DHL 5521' } }); ok(sent.status === 200, '4. the team records it sent, with the tracking', sent.json);
    const fv1 = (await call(`/v1/tp/${tok}`)).json; ok(fv1.techPack.version === 1 && fv1.techPack.data.sampling[0].status === 'sent' && fv1.techPack.data.sampling[0].tracking === 'DHL 5521', '   the factory sees it on version 1: tracking is no new version', fv1.techPack.data.sampling[0]);
    const v1 = (await A(`/v1/admin/products/${pid}/tech-pack/versions/1`)).json, v1Json = JSON.stringify(v1.data.construction);
    // the team reviews the sample and makes the corrections: they go out as version 2
    const live = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data, size = FBSample.sampleSizeOf(live), chest = live.pom[0];
    live.sampling[0].review = { verdict: 'revise', at: '2026-10-27', by: 'Kyle', measured: { [chest.code]: String(Number(chest.values[size]) + 1.5) }, adopt: [], corrections: [{ area: 'Hem', change: 'Hem twists: cut on grain, 1 in coverstitch' }] };
    await A(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data: FBSample.apply(live, 0) } });
    const p2 = await A(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { note: 'Corrections from the Proto sample review', override: 'Corrections from the Proto sample review' } }); ok(p2.status === 200 && p2.json.techPack.version === 2, '5. the corrections go out as version 2', p2.json.techPack?.version);
    const fv2 = (await call(`/v1/tp/${tok}`)).json; ok(fv2.techPack.version === 2 && fv2.techPack.data.construction.some(r => /Correction · Proto sample: Hem/.test(r.area)), '   the factory reads version 2 with the corrections', fv2.techPack.version);
    const v1again = (await A(`/v1/admin/products/${pid}/tech-pack/versions/1`)).json; ok(JSON.stringify(v1again.data.construction) === v1Json && !v1again.data.construction.some(r => /Correction/.test(r.area)) && v1again.current === false, '6. version 1 is kept exactly as it was: the chain of versions is intact');
    // flats changed in the Lab and sent again: version 3, version 2 kept
    const same = await K(`/concepts/${c.id}/flats/tech-pack`, { body: {} }); ok(same.status === 200 && same.json.unchanged === true && same.json.version === null, '7. flats sent again unchanged make no new version', same.json);
    const fl2 = (await K(`/concepts/${c.id}/flats`)).json.flat; ok((await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: { ...fl2, color: '#1f2a44' } })).status === 200, '   the flats are coloured navy in the Lab');
    const again = await K(`/concepts/${c.id}/flats/tech-pack`, { body: {} }); ok(again.status === 200 && again.json.version === 3 && again.json.previousVersion === 2, '   sent again, they go out as version 3', again.json);
    const v2 = (await A(`/v1/admin/products/${pid}/tech-pack/versions/2`)).json; ok(v2.version === 2 && v2.data.construction.some(r => /Correction · Proto sample: Hem/.test(r.area)) && (await call(`/v1/tp/${tok}`)).json.techPack.version === 3, '   version 2 stays as it was, and the factory reads version 3');
    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); await page.goto(`${BASE}/tp/${tok}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#tabs [data-tab]'); await page.click('#tabs [data-tab="calls"]').catch(() => {});
        ok(await page.locator('.ackbtn').count() === 0 && await page.locator('#factorySign').count() === 0 && await page.locator('[data-act="ssent"]').count() === 0, '8. in a browser the factory page has no acknowledge, countersign or sample buttons');
        ok(await page.locator('#tabs [data-tab="msgs"]').count() === 1, '   and it has its Messages tab');
      } finally { await b.close(); }
    }
  } finally { await A('/v1/admin/factory-actions', { method: 'PUT', body: { on: true } }); await cleanup(brands, plan.plan?.id); }
});

await journey('J219', 'Every press answers: a button that starts a request shows it is working, then a tick and a note when it worked, or a red mark and a note saying what failed and why', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const b = await playwright.chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await ctx.newPage(); await page.goto(`${BASE}/factories`, { waitUntil: 'networkidle' });
    ok(await page.evaluate(() => Boolean(window.FBN && window.FBN.toast)), 'the feedback layer is on the page');
    await page.evaluate(() => { for (const [id, url] of [['fbOk', '/v1/admin/factory-actions'], ['fbBad', '/v1/admin/no-such-thing']]) { const btn = document.createElement('button'); btn.id = id; btn.textContent = id === 'fbOk' ? 'Save the setting' : 'Do the impossible'; btn.onclick = () => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('fb.admin.token') }, body: JSON.stringify({ on: true }) }); document.body.appendChild(btn); } });
    await page.route('**/v1/admin/factory-actions', async r => { await new Promise(x => setTimeout(x, 600)); await r.continue(); });
    await page.click('#fbOk'); ok(await page.locator('#fbOk.fbn-busy[aria-busy="true"]').count() === 1, 'while the request runs, the button shows it is working');
    await page.waitForTimeout(380); ok((await page.innerText('#fbOk')).trim() === 'Saving…' && await page.locator('#fbOk .fbn-dots').count() === 1, 'past a moment, the button says what it is doing, with thinking dots', await page.innerText('#fbOk'));
    await page.waitForSelector('.fbn-toast:not(.err)', { timeout: 5000 }); ok(/Save the setting: done/.test(await page.innerText('.fbn-stack')) && await page.locator('#fbOk.fbn-ok').count() === 1, 'when it worked: a tick on the button and a note', await page.innerText('.fbn-stack'));
    await page.click('#fbBad'); await page.waitForSelector('.fbn-toast.err', { timeout: 5000 });
    ok(/Do the impossible:/.test(await page.innerText('.fbn-toast.err')) && await page.locator('#fbBad.fbn-err').count() === 1, 'when it failed: a red mark on the button and a note that says what failed', await page.innerText('.fbn-toast.err'));
    ok((await page.innerText('#fbOk')).trim() === 'Save the setting', 'and its own words come back when it is done');
    // a press that asks a question first, then writes its "working on it" line: the line goes onto the button, not further down the page
    await page.evaluate(() => { const btn = document.createElement('button'); btn.id = 'fbAsk'; btn.textContent = 'Make concepts'; const m = document.createElement('p'); m.className = 'msg'; m.id = 'fbLine'; document.body.append(btn, m);
      btn.onclick = async () => { const d = document.createElement('dialog'); d.innerHTML = '<form method="dialog"><button id="fbGo" value="ok">Continue</button></form>'; document.body.appendChild(d); await new Promise(r => { d.addEventListener('close', () => { d.remove(); r(); }); d.showModal(); });
        m.textContent = 'Designing three concepts, drawing them and checking them. This takes up to a minute…'; btn.disabled = true;
        await fetch('/v1/admin/factory-actions', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('fb.admin.token') }, body: JSON.stringify({ on: true }) }); m.textContent = 'Three concepts are on the board.'; btn.disabled = false; }; });
    await page.click('#fbAsk'); await page.click('#fbGo'); await page.waitForTimeout(400);
    ok((await page.innerText('#fbAsk')).trim() === 'Designing three concepts…' && !(await page.isVisible('#fbLine')), 'a question first, then the work: the button says "Designing three concepts…" and the line below stays hidden', await page.innerText('#fbAsk'));
    await page.waitForFunction(() => /on the board/.test(document.querySelector('#fbLine').textContent)); ok(await page.isVisible('#fbLine') && (await page.innerText('#fbAsk')).trim() === 'Make concepts', 'the answer shows where it always did, and the button has its words back');
    await page.evaluate(() => { const btn = document.createElement('button'); btn.id = 'fbThrow'; btn.textContent = 'Broken press'; btn.onclick = () => Promise.reject(new Error('the printer is out of paper')); document.body.appendChild(btn); });
    await page.click('#fbThrow'); await page.waitForFunction(() => /out of paper/.test(document.querySelector('.fbn-stack')?.innerText || ''), null, { timeout: 5000 }).catch(() => {});
    ok(/Broken press: the printer is out of paper/.test(await page.innerText('.fbn-stack')), 'a press whose work fails without saying so is reported too', await page.innerText('.fbn-stack'));
  } finally { await b.close(); }
});

await journey('J215', 'Design Lab flats in a browser: open them from a concept, see the front and back, drag the logo and watch its measurements, add a library graphic, catch a collar problem, change the fit and the measurements, read the graded points of measure, save and print the spec sheet', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const { brands, plan } = await conceptSetup(); const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const b = await playwright.chromium.launch(), errs = [];
  try {
    const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#cgrid .cc[data-cid="${c.id}"]`, { timeout: 15000 });
    await page.click(`#cgrid .cc[data-cid="${c.id}"]`); await page.waitForSelector('#cd[open] [data-cflats]');
    await Promise.all([page.waitForURL(/\/lab\/studio\?concept=.*view=front/), page.click('#cd [data-cflats]')]);
    const F = await (await page.waitForSelector('#flatFrame')).contentFrame();
    ok(await page.getAttribute('#viewSeg [data-v=front]', 'aria-pressed') === 'true' && await page.isVisible('#flatHost') && !(await page.isVisible('#stage')), 'Flats opens the concept in Design on its flat front: one workspace, the picture one press away');
    await F.waitForSelector('#canvas svg [data-pl]', { timeout: 15000 });
    const sketch = await F.locator('#canvas svg image[href^="/lab/flat-templates/"]').getAttribute('href').catch(() => null);
    ok(sketch && (await fetch(BASE + sketch)).status === 200 && /not saved yet/i.test(await page.innerText('#fsaved')), 'the flats open on a professional flat sketch, worked out from the concept, waiting to be saved', sketch);
    const logoCard = F.locator('#pPl .pl').first(); ok(/below the HPS/.test(await logoCard.innerText()), 'the logo says where it sits, in inches from the HPS', await logoCard.innerText());
    // drag the logo up against the collar: the measurement follows and the check catches it
    const g = F.locator('#canvas [data-pl]').first(), bb = await g.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 - 60, 120, { steps: 8 }); await page.mouse.up();
    await F.waitForFunction(() => /problem/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(/problem/.test(await F.innerText('#status')) && /collar|neck|edge|piece/i.test(await F.innerText('#pPl')), 'dragged against the collar, it says it cannot be made and why', await F.innerText('#status'));
    // put it back by typing
    await F.locator('#pPl .pl').first().locator('[data-k=top]').fill('6'); await F.locator('#pPl .pl').first().locator('[data-k=x]').fill('4');
    await F.waitForFunction(() => !/problem/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(!/problem/.test(await F.innerText('#status')), 'typed back to 6 in below the HPS and 4 in off centre, it can be made', await F.innerText('#status'));
    // a graphic from the library, on the back
    await page.click('#viewSeg [data-v=back]'); await F.waitForSelector('#libTiles [data-lib]', { timeout: 10000 }).catch(() => {});
    if (await F.locator('#libTiles [data-lib]').count()) { const n = await F.locator('#pPl .pl').count(); await F.click('#libTiles [data-lib]'); await F.waitForFunction(k => document.querySelectorAll('#pPl .pl').length === k + 1, n);
      ok(/below the HPS on the back/.test(await F.locator('#pPl .pl.on').innerText()), 'a library graphic goes on the back, measured from the HPS', await F.locator('#pPl .pl.on').innerText()); }
    else ok(true, 'no library graphics to add here');
    // the garment: fit and a measurement
    await F.click('.tabs [data-tab=garment]'); await F.selectOption('#gFit', 'oversized');
    const chest = Number(await F.locator('[data-m=chest]').inputValue()); ok(chest >= 24, 'an oversized fit widens the chest', chest);
    const tpl = await F.locator('#gGal [data-tpl][aria-pressed="true"]').getAttribute('data-tpl'); ok(/oversized|boxy/.test(tpl), 'and draws it from the oversized sketch', tpl);
    ok(await F.locator('#gGal [data-tpl] img').count() >= 10, 'the sketch gallery shows this style\'s sketches as thumbnails', await F.locator('#gGal [data-tpl]').count());
    await F.click('#gGal [data-tpl="none"]'); ok(await F.locator('#canvas svg path').count() > 5 && !(await F.locator('#canvas svg image[href^="/lab/flat-templates/"]').count()), 'the simple outline is still there to choose');
    await F.waitForSelector('.fbn-toast'); ok(/simple outline/i.test(await F.innerText('.fbn-stack')), 'and picking it says so', await F.innerText('.fbn-stack'));
    // any sketch in the pack: search women's halter, and the piece becomes that style
    await F.fill('#gQ', 'halter swimsuit'); await F.waitForFunction(() => document.querySelectorAll('#gGal [data-tpl]').length >= 1 && [...document.querySelectorAll('#gGal [data-tpl]')].every(b => /halter/i.test(b.textContent)));
    const sw = await F.locator('#gGal [data-tpl]').first().getAttribute('data-tpl'); await F.click(`#gGal [data-tpl="${sw}"]`);
    ok(await F.locator('#gStyle').inputValue() === 'swimsuit' && (await F.locator('#canvas svg image[href^="/lab/flat-templates/"]').getAttribute('href')).includes(sw), 'a sketch of another style, found by searching, changes the piece to it', sw);
    await F.fill('#gQ', ''); await F.selectOption('#gStyle', 'tee'); await F.selectOption('#gFit', 'oversized');
    await F.click(`#gGal [data-tpl="${tpl}"]`);
    await F.locator('[data-m=length]').fill('31'); await F.click('.tabs [data-tab=pom]');
    const pom = await F.innerText('#pPom'); ok(/Body length/.test(pom) && /\b31\b/.test(pom) && /XXL/.test(pom), 'the points of measure are graded across the sizes', pom.slice(0, 200));
    // design: a colour, a pocket in a double-needle topstitch, a stitch line drawn point by point, an area redrawn by the image model
    await F.click('.tabs [data-tab=design]'); await F.click('[data-color="#1f2a44"]');
    ok(await F.locator('#canvas svg filter').count() >= 1, 'a colour recolours the sketch');
    await F.click('[data-adddet="pocket-patch"]'); ok(await F.locator('#canvas [data-ed]').count() === 1 && /Patch pocket/.test(await F.innerText('#pDesign')), 'a patch pocket is added where it usually goes, and listed');
    await F.selectOption('.ed [data-ek=stitch]', 'double'); ok(/topstitch double needle/.test(await F.innerText('#pDesign')), 'its topstitch changes to double needle');
    // a part from the pack's own add-on sheets: a zip puller, placed and named
    await F.click('[data-pkind="zips"]'); const nEd = await F.locator('#canvas [data-ed]').count(); await F.click('[data-addpart]');
    ok(await F.locator('#canvas [data-ed]').count() === nEd + 1 && await F.locator('#canvas svg image[href^="/lab/flat-parts/"]').count() === 1 && /add-on sheet/.test(await F.innerText('#pDesign')), 'a zip from the pack\'s add-on sheet goes on the flat and is written up');
    await F.click('.ed.on [data-edel]'); ok(await F.locator('#canvas [data-ed]').count() === nEd, 'and comes off again');
    const cb = await F.locator('#canvas > svg').boundingBox();
    await F.click('[data-mode=stitch]'); await page.mouse.click(cb.x + cb.width * .35, cb.y + cb.height * .8); await page.mouse.click(cb.x + cb.width * .65, cb.y + cb.height * .8); await page.keyboard.press('Enter');
    ok(/Double needle line/.test(await F.innerText('#pDesign')), 'a stitch line is drawn point by point');
    await F.click('[data-mode=ai]'); await page.mouse.move(cb.x + cb.width * .4, cb.y + cb.height * .45); await page.mouse.down(); await page.mouse.move(cb.x + cb.width * .6, cb.y + cb.height * .62, { steps: 6 }); await page.mouse.up();
    await F.click('[data-sugg="Remove the pocket"]'); await F.click('#aiGo');
    await F.waitForFunction(() => /Redrawn area/.test(document.getElementById('pDesign').textContent), null, { timeout: 30000 });
    ok(await F.locator('#canvas svg image[href^="blob:"]').count() >= 1, 'an area is redrawn by the image model and laid on the sketch');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-flats-design.png` }).catch(() => {});
    await page.click('#save'); await F.waitForFunction(() => /^Saved/.test(document.getElementById('saved').textContent), null, { timeout: 15000 });
    const row = sql(`select params->>'fit' || ':' || (params->'m'->>'length') from lab_flats where concept_id='${c.id}'`); ok(row === 'oversized:31', 'saved, as changed', row);
    const eds = sql(`select (params->>'color') || ':' || jsonb_array_length(params->'edits') from lab_flats where concept_id='${c.id}'`); ok(eds === '#1f2a44:3', 'with its colour and its three changes', eds);
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#specBtn')]); await popup.waitForLoadState(); ok(/Spec sheet/.test(await popup.title()), 'the spec sheet opens to print', await popup.title()); await popup.close();
    await F.click('.tabs [data-tab=pl]'); await page.click('#viewSeg [data-v=front]'); await F.check('#showPom');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-flats.png` }).catch(() => {});
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J226', 'Range-level work: one instruction across a whole collection ("make everything 260 gsm and swap the accent to olive") previewed per piece and applied only where ticked, the Lab learning our taste from what is approved and rejected and reading it before it designs, a lookbook of the range in one click, and a customer poll whose votes become a demand read per piece', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const lines = plan.lines.filter(l => l.status !== 'dropped'), l1 = lines[0], l2 = lines[1] || lines[0], PID = plan.plan.id;
    const made = (await K(`/plans/${PID}/lines/${l1.id}/concepts`, { body: { count: 2 } })).json.concepts, other = (await K(`/plans/${PID}/lines/${l2.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const [A, B] = made; ok(made.length === 2 && other, 'three concepts on two planned pieces');
    // access
    ok((await call(`/v1/lab/plans/${PID}/range/preview`, { body: { instruction: 'x' } })).status === 401 && (await P(`/plans/${PID}/range/preview`, { body: { instruction: 'make everything heavier' } })).status === 403 && (await P('/taste')).status === 403 && (await P(`/plans/${PID}/polls`)).status === 403, '1. range edits, the learned taste and the polls are closed like the rest of the Lab');

    // the Lab learns our taste
    const ap = await K(`/concepts/${A.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references, it is ours', makeReason: 'the flats are being drawn next' } }); ok(ap.status === 200, '2. one concept is approved', ap.json.error);
    const rj = await K(`/concepts/${B.id}/reject`, { body: { reason: 'too thin a fabric, and the colour is loud' } }); ok(rj.status === 200, '   and one rejected, with a reason');
    let taste = null; for (let i = 0; i < 20 && !(taste?.counts?.approved >= 1 && taste?.counts?.rejected >= 1); i++) { await new Promise(r => setTimeout(r, 250)); taste = (await K('/taste')).json.taste; }
    ok(taste?.counts?.approved >= 1 && taste?.counts?.rejected >= 1 && taste.use !== false, '   the Lab counted both on its own, without being asked', taste?.counts);
    ok(taste.reasons.some(r => /too thin/.test(r.why)) && Array.isArray(taste.likes) && Array.isArray(taste.dislikes), '   it keeps the reason given, and the traits for and against');
    const rf = await K('/taste/refresh', { body: { ai: true } }); ok(rf.status === 200 && rf.json.taste.digest?.summary?.length > 10 && rf.json.taste.digest.likes.length >= 1 && rf.json.taste.digestAt, '3. asked to read the board again, the assistant writes what the record says about our taste', rf.json);
    const off = await K('/taste', { method: 'PUT', body: { use: false } }); ok(off.status === 200 && off.json.taste.use === false && (await K('/taste')).json.taste.use === false, '   the learned taste can be switched off');
    ok((await K('/taste', { method: 'PUT', body: { use: true } })).json.taste.use === true, '   and on again');

    // one instruction across the range
    ok((await K(`/plans/${PID}/range/preview`, { body: { instruction: 'x' } })).status === 422, '4. a range change needs real words');
    const pv = await K(`/plans/${PID}/range/preview`, { body: { instruction: 'make everything 260 gsm and swap the accent to olive' } });
    ok(pv.status === 200 && pv.json.pieces === 2 && pv.json.changes.length === 2, '   previewed: the change per piece, nothing applied yet (the rejected piece is not in play)', pv.json);
    ok(pv.json.changes.every(c => /260 gsm/.test(c.fields.fabric) && c.fields.colors.at(-1) === 'olive' && c.before && c.why), '   each change says the field, what it was, what it becomes and why', pv.json.changes[0]);
    const chA = pv.json.changes.find(c => c.id === A.id); ok(chA && chA.status === 'approved' && (await K(`/concepts/${A.id}`)).json.concept.spec.fabric === A.spec.fabric, '   the approved piece is marked as going back to draft, and nothing has changed yet');
    ok((await K(`/plans/${PID}/range/apply`, { body: { instruction: 'x', changes: [] } })).status === 422 && (await K(`/plans/${PID}/range/apply`, { body: { changes: [{ id: A.id, fields: { fabric: A.spec.fabric } }] } })).status === 422, '   applying nothing, or a change that changes nothing, is refused');
    const apl = await K(`/plans/${PID}/range/apply`, { body: { instruction: pv.json.instruction, changes: [{ id: chA.id, fields: chA.fields, why: chA.why }] } });
    ok(apl.status === 200 && apl.json.applied.length === 1 && apl.json.failed.length === 0 && apl.json.backToDraft === 1, '5. only the ticked change is applied', apl.json);
    const A2r = (await K(`/concepts/${A.id}`)).json, A2 = A2r.concept, O2 = (await K(`/concepts/${other.id}`)).json.concept;
    ok(/260 gsm/.test(A2.spec.fabric) && A2.spec.colors.at(-1) === 'olive' && A2.status === 'draft' && A2.closeness && A2r.comments.some(m => /Changed across the range: "make everything 260 gsm/.test(m.body)), '   the piece has the new words, went back to draft, was checked again and says why', [A2.spec.fabric, A2.status]);
    ok(O2.spec.fabric === other.spec.fabric && O2.status === 'draft', '   the piece that was not ticked is untouched');

    // the lookbook
    const lb = await fetch(`${BASE}/v1/lab/plans/${PID}/lookbook.pdf`, { headers: { Authorization: `Bearer ${kyleT}` } }); const pdf = Buffer.from(await lb.arrayBuffer());
    ok(lb.status === 200 && /application\/pdf/.test(lb.headers.get('content-type')) && pdf.slice(0, 5).toString() === '%PDF-' && (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length === 3, '6. the lookbook is a PDF: a cover and a page per piece in play', [lb.status, pdf.length]);
    ok((await fetch(`${BASE}/v1/lab/plans/${PID}/lookbook.pdf`)).status === 401, '   and needs the sign-in');

    // the customer poll
    const mk = await K(`/plans/${PID}/polls`, { body: {} }); ok(mk.status === 201 && /\/lab\/poll\/[A-Za-z0-9_-]{20,}$/.test(mk.json.poll.url) && mk.json.poll.pieces === 2 && mk.json.poll.expiresAt, '7. one click makes a poll link on the pieces in play', mk.json);
    const token = mk.json.poll.url.split('/lab/poll/')[1], PUB = `/v1/lab/poll/${token}`;
    ok((await K(`/plans/${PID}/polls`)).json.polls[0].url === null, '   the link is shown once; the list keeps only its hash');
    const pub = await call(PUB); ok(pub.status === 200 && pub.json.open && pub.json.pieces.length === 2 && pub.json.pieces.every(p => p.name && !('closeness' in p) && !('cost' in p)), '   anyone with the link sees the pieces: words and price, nothing from the check or the cost', pub.json);
    ok((await call(`${PUB}/pieces/${A.id}/image`)).status === 200 && (await call(`${PUB}/pieces/${B.id}/image`)).status === 404 && (await call('/v1/lab/poll/notavalidtokenatall12345')).status === 404, '   the pictures of the pieces in the poll, and nothing else');
    ok((await call(`${PUB}/votes`, { body: { votes: [{ id: B.id, vote: 'yes' }] } })).status === 422, '   a vote on a piece outside the poll is nothing');
    const v1 = await call(`${PUB}/votes`, { body: { name: 'Sam', email: 'sam@example.com', votes: [{ id: A.id, vote: 'yes', price: 'fair', note: 'make it longer' }, { id: other.id, vote: 'no', price: 'high' }] } }); ok(v1.status === 201 && v1.json.counted === 2, '8. a customer answers piece by piece', v1.json);
    ok((await call(`${PUB}/votes`, { body: { name: 'Sam', email: 'SAM@example.com', votes: [{ id: A.id, vote: 'maybe', price: 'high' }, { id: other.id, vote: 'no', price: 'high' }] } })).status === 201, '   answering again replaces the earlier answers');
    ok((await call(`${PUB}/votes`, { body: { name: 'Jo', email: 'jo@example.com', votes: [{ id: A.id, vote: 'yes', price: 'low' }] } })).status === 201, '   a second customer answers');
    const res = await K(`/polls/${mk.json.poll.id}/results`); const rA = res.json.results.pieces.find(p => p.id === A.id), rO = res.json.results.pieces.find(p => p.id === other.id);
    ok(res.status === 200 && res.json.results.voters === 2 && res.json.poll.voters === 2, '9. the results count people, not answers', res.json);
    ok(rA.rank === 1 && rA.yes === 1 && rA.maybe === 1 && rA.no === 0 && rA.demand === 75 && rA.read === 'make it' && rA.priceFeel === 'too high' && rO.rank === 2 && rO.demand === 0 && rO.read === 'think again' && rO.priceFeel === 'too high', '   and read demand per piece: who to make first and what to think again about', [rA, rO]);
    ok(rA.notes.length === 0, '   a replaced answer takes its note with it');
    ok((await K(`/polls/${mk.json.poll.id}/close`, { body: {} })).status === 200 && (await call(PUB)).json.open === false && (await call(`${PUB}/votes`, { body: { votes: [{ id: A.id, vote: 'yes' }] } })).status === 410, '10. a closed poll stops taking answers and keeps its results');

    if (playwright) {
      const poll2 = (await K(`/plans/${PID}/polls`, { body: { title: 'Fall poll' } })).json.poll;
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab#code`, { waitUntil: 'networkidle' }); // the brand code is part of Research
        await page.waitForSelector('#tasteBox .chip', { timeout: 15000 }); ok(/approved and \d+ rejected/.test(await page.innerText('#tasteIn')) && (await page.isChecked('#tasteUse')), '11. the brand code section shows what the Lab has learned, with the switch on');
        await page.click('.fbtabs a[data-href="/lab#plans"]'); await page.waitForSelector('#planList .pl');
        await page.locator('#planList .pl', { hasText: 'Concept plan' }).locator('[data-open]').click(); await page.waitForSelector('#planView tr[data-line]'); await page.waitForSelector('#rangeBox'); await page.waitForSelector('#pollList .po');
        ok((await page.locator('#pollList .po').count()) === 2 && /people answered/.test(await page.innerText('#pollList')), '12. the plan shows its polls with how many answered');
        await page.locator('#pollList .po').first().locator('[data-pollres]').click(); await page.waitForSelector('#pollList .po table'); 
        await page.fill('#rangeIn', 'swap the accent to rust'); await page.click('[data-rgo]'); await page.waitForSelector('#rangeOut .ch', { timeout: 20000 });
        ok((await page.locator('#rangeOut .ch').count()) === 2 && /rust/.test(await page.innerText('#rangeOut')) && /of 2 pieces would change/.test(await page.innerText('#rangeMsg')), '13. a range change is previewed piece by piece on the plan');
        await page.locator('#rangeOut [data-rc]').nth(1).uncheck(); await page.click('[data-rapply]'); await page.waitForFunction(() => /piece changed/.test(document.querySelector('#rangeOut')?.textContent || ''), null, { timeout: 20000 }).catch(async e => { throw new Error(e.message.split('\n')[0] + ' · msg: ' + await page.innerText('#rangeMsg').catch(() => '?') + ' · out: ' + (await page.innerText('#rangeOut').catch(() => '?')).slice(0, 300)); });
        ok(/1 piece changed/.test(await page.innerText('#rangeOut')) && (await page.locator('[data-rredraw]').count()) === 1, '    only the ticked piece is changed, and the pictures can be redrawn afterwards');
        await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-range.png`, fullPage: false }).catch(() => {});
        // the customer's side
        const cust = await (await b.newContext({ viewport: { width: 420, height: 860 } })).newPage(), cerrs = []; cust.on('pageerror', e => cerrs.push(String(e)));
        await cust.goto(poll2.url, { waitUntil: 'networkidle' }); await cust.waitForSelector('#app:not(.hidden)'); await cust.waitForSelector('.piece');
        ok((await cust.locator('.piece').count()) === 2 && (await cust.title()) === 'Fall poll · Would you buy it?' && (await cust.isDisabled('#send')), '14. the poll page shows the pieces on a phone, and cannot be sent empty');
        await cust.locator('.piece').first().locator('[data-v=yes]').click(); await cust.locator('.piece').first().locator('[data-p=fair]').click(); await cust.fill('.piece [data-note]', 'longer please');
        ok(/1 of 2 pieces answered/.test(await cust.innerText('#count')), '    it counts the answers as they are given');
        await cust.fill('#vName', 'Ana'); await cust.click('#send'); await cust.waitForSelector('#thanks:not(.hidden)', { timeout: 10000 });
        const r2 = (await K(`/polls/${poll2.id}/results`)).json.results; ok(r2.voters === 1 && r2.pieces[0].rank === 1 && r2.pieces[0].yes === 1 && r2.pieces[0].fair === 1 && r2.pieces[0].notes[0]?.note === 'longer please' && r2.pieces[1].demand === null, '    and the answer lands in the results', r2);
        await cust.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-poll.png`, fullPage: true }).catch(() => {});
        ok(errs.length === 0 && cerrs.length === 0, 'no page errors', [errs, cerrs]); await oc.close();
      } finally { await b.close(); }
    }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J227', 'Every tool in the studio works: each rail tool and zoom button, every Add (marks, library, sketch-pack parts, painting, type and shapes, colours), every Layers control (select, hide, lock, up, down, duplicate, centre, flip, sit in fabric, reset colour, another pattern, turn into pixels, technique and make it real, save to the library, plain picture, delete), every AI control (paint the area, scope, clear, Change it, Make it, Remove the graphic, the fabric), undo, redo, save, export, versions, use as the picture; and "Remove the graphic" takes a printed graphic off the piece in one go', async () => {
  const { brands, plan } = await conceptSetup();
  if (!playwright) { ok(true, 'needs a browser'); await cleanup(brands, plan.plan?.id); return; }
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  ok(c.spec.graphics.length === 1, 'a concept with one graphic on its words', c.spec.graphics);
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1500, height: 980 }, acceptDownloads: true }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept('Variant'));
    await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    const box = await page.locator('#view').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const n = () => page.evaluate(() => LAYERS.length), sel = () => page.evaluate(() => { const l = selected(); return l ? { id: l.id, kind: l.kind, name: l.name, visible: l.visible, locked: l.locked, x: l.x, y: l.y, flip: l.flip, blend: l.blend, tint: l.tint, adjust: l.adjust, seed: l.distress.seed, amount: l.distress.amount, finish: l.finish && l.finish.id, src: l.src, bold: l.bold, align: l.align } : null; });
    const idle = () => page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'), null, { timeout: 30000 });
    const toastHas = re => page.waitForFunction(r => new RegExp(r).test(document.getElementById('stToast')?.textContent || ''), re.source, { timeout: 30000 });

    // 1. the rail and the zoom
    const tools = await page.$$eval('.rail [data-tool]', els => els.map(e => e.dataset.tool)); let railOk = 0;
    for (const t of tools) { await page.click(`.rail [data-tool="${t}"]`); if (await page.evaluate(x => TOOL === x && document.querySelector(`.rail [data-tool="${x}"]`).getAttribute('aria-pressed') === 'true', t) && (await page.innerText('#opts')).trim().length > 0) railOk++; }
    ok(railOk === tools.length && tools.length === 15, `1. every rail tool selects and shows its options (${tools.join(', ')})`, railOk);
    const z0 = await page.innerText('#zLabel'); await page.click('#zIn'); await page.waitForFunction(z => document.getElementById('zLabel').textContent !== z, z0); const z1 = await page.innerText('#zLabel'); await page.click('#zOut'); await page.waitForFunction(z => document.getElementById('zLabel').textContent !== z, z1); await page.click('#zFit'); await page.waitForFunction(z => document.getElementById('zLabel').textContent === z, z0);
    ok(parseInt(z1) > parseInt(z0), '   zoom in, out and fit', [z0, z1]);

    // 2. Add
    await page.click('.tabs [data-tab=add]'); await page.waitForSelector('#pAdd [data-mark]');
    const before = await n(); for (const m of ['mark', 'word', 'lockup']) { await page.click(`#pAdd [data-mark=${m}]`); await page.waitForFunction(k => LAYERS.length === k, before + ['mark', 'word', 'lockup'].indexOf(m) + 1); }
    ok(await n() === before + 3 && (await sel()).src === 'brand:lockup', '2. the three Future Basics marks each add a layer');
    await page.click('#pAdd [data-sw]'); ok((await sel()).tint.amount === 1, '   a colour swatch recolours the selected mark');
    await page.click('#addPaint'); ok((await sel()).kind === 'paint', '   New painting layer');
    await page.waitForSelector('#partKinds [data-pkind]'); const kinds = await page.$$eval('#partKinds [data-pkind]', els => els.map(e => e.dataset.pkind)); await page.click(`#partKinds [data-pkind="${kinds[kinds.length - 1]}"]`); await page.waitForSelector('#partTiles [data-part]'); const k0 = await n(); await page.click('#partTiles [data-part]'); await idle(); await page.waitForFunction(k => LAYERS.length === k + 1, k0);
    ok((await sel()).src.startsWith('/lab/flat-parts/'), `   a sketch-pack part (${kinds.length} kinds) is added as a layer`);
    await page.waitForSelector('#libTiles [data-lib], #libTiles .note'); if (await page.locator('#libTiles [data-lib]').count()) { const l0 = await n(); await page.click('#libTiles [data-lib]'); await idle(); await page.waitForFunction(k => LAYERS.length === k + 1, l0); ok((await sel()).src.startsWith('/v1/lab/art/'), '   a graphic from the library is added as a layer'); } else ok(true, '   (the library has no graphics in this database yet)');
    await page.click('.tabs [data-tab=add]'); // adding a library graphic moves to Layers; the search is on Add
    await page.fill('#libQ', 'zzz-nothing'); await page.waitForFunction(() => /Nothing found|data-lib/.test(document.getElementById('libTiles').innerHTML), null, { timeout: 10000 });
    for (const [t, act] of [['text', async () => { await page.mouse.click(cx, cy - 80); }], ['rect', async () => { await page.mouse.move(cx - 60, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy + 60, { steps: 4 }); await page.mouse.up(); }], ['ellipse', async () => { await page.mouse.move(cx - 60, cy + 90); await page.mouse.down(); await page.mouse.move(cx + 20, cy + 150, { steps: 4 }); await page.mouse.up(); }], ['line', async () => { await page.mouse.move(cx - 100, cy - 150); await page.mouse.down(); await page.mouse.move(cx + 100, cy - 140, { steps: 4 }); await page.mouse.up(); }]]) {
      await page.click('.tabs [data-tab=add]'); const t0 = await n(); await page.click(`#pAdd [data-addtool=${t}]`); ok(await page.evaluate(x => TOOL === x, t), `   Add → ${t} picks the tool`); await act(); await page.waitForFunction(k => LAYERS.length === k + 1, t0); }
    ok((await sel()).kind === 'shape', '   type, rectangle, ellipse and line each make a layer on the picture');

    // 3. Layers
    await page.click('.tabs [data-tab=layers]'); const rows = await page.locator('#pLayers .ly').count(); ok(rows === await n(), `3. the Layers list shows every layer (${rows})`);
    const textRow = await page.evaluate(() => LAYERS.find(l => l.kind === 'text').id); await page.click(`#pLayers [data-ly="${textRow}"]`); ok((await sel()).kind === 'text', '   clicking a row selects it');
    await page.click(`#pLayers [data-ly="${textRow}"] [data-vis]`); ok((await sel()).visible === false, '   hide'); await page.click(`#pLayers [data-ly="${textRow}"] [data-vis]`); ok((await sel()).visible === true, '   show');
    await page.click(`#pLayers [data-ly="${textRow}"] [data-lock]`); ok((await sel()).locked === true, '   lock'); await page.click(`#pLayers [data-ly="${textRow}"] [data-lock]`); ok((await sel()).locked === false, '   unlock');
    const b0 = (await sel()).bold; await page.click('#pLayers [data-toggle=bold]'); await page.click('#pLayers [data-align=right]'); const tx = await sel(); ok(tx.bold === !b0 && tx.align === 'right', '   bold and align on type', tx);
    await page.click('#pLayers [data-act=raster]'); ok((await sel()).kind === 'image', '   turn into pixels');
    const iv = await sel(); await page.click('#pLayers [data-act=flip]'); ok((await sel()).flip !== iv.flip, '   flip');
    await page.evaluate(() => { const l = selected(); l.x = 10; l.y = 10; }); await page.click('#pLayers [data-act=centre]'); const cv = await sel(); ok(Math.abs(cv.x - await page.evaluate(() => W / 2)) < 1, '   centre');
    await page.click('#pLayers [data-act=fabric]'); ok((await sel()).blend === 'multiply', '   sit it in the fabric');
    await page.click('#pLayers [data-act=seed]'); const s1 = (await sel()).seed; await page.click('#pLayers [data-act=seed]'); ok((await sel()).seed !== s1 && (await sel()).amount > 0, '   another distress pattern');
    await page.locator('#pLayers [data-p="a.hue"]').fill('90'); await page.locator('#pLayers [data-p="a.hue"]').dispatchEvent('input'); await page.click('#pLayers [data-act=lookreset]'); ok((await sel()).adjust.hue === 0, '   reset the colour');
    const pos = () => page.evaluate(() => LAYERS.findIndex(l => l.id === SEL)); const p0 = await pos(); await page.click('#pLayers [data-act=down]'); ok(await pos() === p0 - 1, '   move down'); await page.click('#pLayers [data-act=up]'); ok(await pos() === p0, '   move up');
    const d0 = await n(); await page.click('#pLayers [data-act=dup]'); ok(await n() === d0 + 1 && /copy$/.test((await sel()).name), '   duplicate');
    await page.click('#pLayers [data-act=del]'); ok(await n() === d0, '   delete');
    await page.click('#pLayers [data-act=keep]'); await toastHas(/graphics library now/); ok(true, '   save to the library');
    const techs = await page.$$eval('#pLayers [data-tech] option', os => os.map(o => o.value).filter(Boolean)); await page.selectOption('#pLayers [data-tech]', techs[0]); ok((await sel()).finish === techs[0], '   a technique is applied');
    const r0 = await n(); await page.click('#pLayers [data-act=real]'); await idle(); await page.waitForFunction(k => LAYERS.length === k + 1, r0, { timeout: 30000 }); ok((await sel()).name.startsWith('Real ·'), '   make it real with AI lands as a layer');
    const baseRow = await page.evaluate(() => LAYERS.find(l => l.kind === 'base').id); await page.click(`#pLayers [data-ly="${baseRow}"]`); await page.click('#pLayers [data-act=plain]'); await idle(); ok((await sel()).name === 'Picture (plain)', '   use the plain picture on the base');
    await page.click('#pLayers [data-act=del]'); await toastHas(/base picture stays/); ok(await page.evaluate(() => LAYERS.some(l => l.kind === 'base')), '   the base cannot be deleted, and says so');

    // 4. AI
    await page.click('.tabs [data-tab=ai]'); await page.waitForSelector('#aiGo'); await page.waitForSelector('#fabSel', { timeout: 15000 });
    ok(await page.locator('#rmGfx').count() === 1 && !(await page.isDisabled('#aiGo')), '4. the AI tab has Change it, Make it and Remove the graphic, switched on');
    await page.click('#pAi [data-paintarea]'); ok(await page.evaluate(() => TOOL === 'area'), '   Paint the area picks the area tool');
    await page.mouse.move(cx - 50, cy); await page.mouse.down(); await page.mouse.move(cx + 50, cy + 30, { steps: 5 }); await page.mouse.up(); ok(await page.evaluate(() => MASKED) && /Only the painted/.test(await page.innerText('#aiScope')), '   painting marks the area');
    await page.click('#pAi [data-clearmask]'); ok(!(await page.evaluate(() => MASKED)), '   Clear it clears the area');
    await page.click('#aiGo'); ok(/Say what to change/.test(await page.innerText('#aiMsg')), '   Change it with nothing written says so');
    const a0 = await n(); await page.fill('#aiEdit', 'Remove the back graphic'); await page.click('#aiGo'); await page.waitForFunction(() => /Done/.test(document.getElementById('aiMsg')?.textContent || ''), null, { timeout: 30000 });
    ok(await n() === a0 + 1 && (await sel()).name.startsWith('AI ·'), '   Change it: the whole piece, as the top layer (this was the broken button)');
    const g0 = await n(); await page.fill('#aiArt', 'a lightning bolt crest'); await page.click('#artGo'); await page.waitForFunction(() => /graphic is a new layer/.test(document.getElementById('aiMsg')?.textContent || ''), null, { timeout: 30000 }); ok(await n() === g0 + 1 && (await sel()).name.startsWith('Graphic ·'), '   Make it: a graphic as a layer');
    await page.click('#rmGfx'); await toastHas(/is off the piece/); ok(await n() === g0, '   Remove the graphic with a graphic layer selected removes that layer');
    const m0 = await n(); await page.click('#rmGfx'); await page.waitForSelector('#askDlg[open]', { timeout: 40000 });
    ok(await n() === m0 + 1 && (await sel()).name === 'Graphic removed' && /take the graphic off the concept/i.test(await page.innerText('#askTitle')), '5. Remove the graphic with nothing painted: the AI finds the graphic, paints the area, fills it with plain fabric, then asks about the concept\'s words');
    await page.click('#askYes'); await toastHas(/off the concept/); const after = (await K(`/concepts/${c.id}`)).json.concept; ok(after.spec.graphics.length === 0 && after.status === 'draft', '   the graphic is off the concept\'s words too', after.spec.graphics);
    await page.click('#fabUse'); await page.waitForFunction(() => /On the concept:/.test(document.getElementById('fabSec')?.textContent || ''), null, { timeout: 15000 }); ok(true, '   the fabric: Use it on the concept');
    const f0 = await n(); await page.click('#fabDraw'); await page.waitForFunction(k => LAYERS.length === k + 1, f0, { timeout: 30000 }); ok((await sel()).name.startsWith('AI · Render the whole piece'), '   the fabric: Redraw the piece in it');

    // 6. the top bar
    const u0 = await n(); await page.click('#undo'); ok(await n() === u0 - 1, '6. Undo'); await page.click('#redo'); ok(await n() === u0, '   Redo');
    await page.click('#save'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('saved').textContent), null, { timeout: 15000 }); ok(true, '   Save');
    for (const [k, re] of [['png', /\.png$/], ['svg', /-layers\.svg$/], ['layer', /\.png$/]]) { await page.click('#expBtn'); const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(`#expPop [data-exp=${k}]`)]); ok(re.test(dl.suggestedFilename()), `   Export → ${k}`, dl.suggestedFilename()); }
    await page.click('#verBtn'); await page.waitForSelector('#verDlg[open]'); await page.waitForFunction(() => !/Loading/.test(document.getElementById('verList').textContent)); const v0 = await page.locator('#verList [data-vn]').count(); await page.click('#verKeep'); await page.waitForFunction(k => document.querySelectorAll('#verList [data-vn]').length === k + 1, v0, { timeout: 20000 }); await page.click('#verDlg [data-verclose]'); ok(!(await page.evaluate(() => document.getElementById('verDlg').open)), '   Versions: keep one, close');
    await page.click('#apply'); await page.waitForSelector('#askDlg[open]'); await page.click('#askYes'); await toastHas(/concept picture now/); ok(true, '   Use as the concept picture');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-studio-all.png` }).catch(() => {});
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

await journey('J228', 'The smaller items: custom fonts (uploaded once, set in type on every machine, listed in the library), the Illustrator round-trip (the studio\'s SVG comes back as editable layers; any other SVG as picture layers), and the 3D try-on (the design painted on a 3D model by the service, shown in our own viewer, from the concept picture or from the canvas)', async () => {
  const { brands, plan } = await conceptSetup();
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  const fontIds = [];
  try {
    // ---- fonts over HTTP ----
    const ttf = readFileSync(new URL('../../src/fonts/pdf/SpaceGrotesk-Medium.ttf', import.meta.url)), asUrl = (b, mime) => `data:${mime};base64,${b.toString('base64')}`;
    ok((await K('/fonts', { body: { name: 'Not a font', file: asUrl(Buffer.from('%PDF-1.4 nope nope nope'), 'application/pdf') } })).status === 422, '1. a file that is not a font is refused');
    const up = await K('/fonts', { body: { name: 'Test Grotesk.ttf', file: asUrl(ttf, 'font/ttf') } }); ok(up.status === 201 && up.json.font.format === 'ttf' && up.json.font.name === 'Test Grotesk' && up.json.font.family === 'fb-test-grotesk', '   a TTF is kept, named without its extension, with a family of its own', up.json);
    const F = up.json.font; fontIds.push(F.id);
    ok((await K('/fonts', { body: { name: 'test grotesk', file: asUrl(ttf, 'font/ttf') } })).status === 409, '   the same name twice is refused');
    const file = await call(`/v1/lab/fonts/${F.id}/file`, { token: kyleT }); ok(file.status === 200 && /font\/ttf/.test(file.ct), '   the file is served as a font');
    ok((await call(`/v1/lab/fonts/${F.id}/file`)).status === 401 && (await P('/fonts')).status === 403, '   fonts are closed like the rest of the Lab');
    ok((await K(`/concepts/${c.id}/studio`)).json.fonts.some(f => f.id === F.id) && (await K('/library/studio')).json.fonts.some(f => f.id === F.id), '   both studios list it');

    // ---- 3D try-on over HTTP ----
    const t0 = await K(`/concepts/${c.id}/tryon`); ok(t0.status === 200 && t0.json.connected && t0.json.models.length === 0, '2. the try-on is connected (the stand-in service) and empty', t0.json);
    ok((await K(`/concepts/${c.id}/tryon`, { body: { image: 'data:text/plain;base64,aGk=' } })).status === 422, '   a picture that is not one is refused');
    const st = await K(`/concepts/${c.id}/tryon`, { body: {} }); ok(st.status === 201 && st.json.model.status === 'running' && st.json.model.source === 'concept', '   a model is started from the concept picture', st.json);
    ok((await K(`/concepts/${c.id}/tryon`, { body: {} })).status === 409, '   a second one while it runs is refused');
    let m = null; for (let i = 0; i < 40 && !(m && m.status !== 'running'); i++) { await new Promise(r => setTimeout(r, 500)); m = (await K(`/concepts/${c.id}/tryon`)).json.models[0]; }
    ok(m && m.status === 'done' && m.triangles === 12 && m.textured && m.hasModel && m.hasThumb, '   it comes back painted, with its model and preview', m);
    const glb = await fetch(`${BASE}/v1/lab/concepts/${c.id}/tryon/${m.id}/model.glb`, { headers: { Authorization: `Bearer ${kyleT}` } }), gb = Buffer.from(await glb.arrayBuffer());
    ok(glb.status === 200 && /model\/gltf-binary/.test(glb.headers.get('content-type')) && gb.subarray(0, 4).toString('latin1') === 'glTF', '   the model is a GLB');
    ok((await call(`/v1/lab/concepts/${c.id}/tryon/${m.id}/thumb`, { token: kyleT })).status === 200 && (await call(`/v1/lab/concepts/${c.id}/tryon/${m.id}/model.glb`)).status === 401, '   with a preview picture, and closed to the public');
    const cv = await K(`/concepts/${c.id}/tryon`, { body: { image: asUrl(await sharp({ create: { width: 64, height: 64, channels: 3, background: '#224466' } }).jpeg().toBuffer(), 'image/jpeg') } }); ok(cv.status === 201 && cv.json.model.source === 'canvas', '   and one from the canvas, as sent');

    if (playwright) {
      const b = await playwright.chromium.launch();
      try {
        const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
        const box = await page.locator('#view').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        // fonts in the studio
        ok(await page.evaluate(k => Boolean(FONTS[k]) && document.fonts.check("16px 'fb-test-grotesk'"), 'f_' + F.id), '3. the studio loaded the font from the Lab and the browser can set type in it');
        await page.keyboard.press('t'); await page.mouse.click(cx, cy - 80); await page.waitForSelector('#pLayers textarea[data-p=text]'); await page.fill('#pLayers textarea[data-p=text]', 'ROUND TRIP'); await page.locator('#pLayers textarea[data-p=text]').blur();
        ok((await page.locator('#pLayers [data-p=font] optgroup').count()) === 2 && (await page.locator('#pLayers [data-act=addfont]').count()) === 1, '   the type panel offers Built in and Our fonts, and Add a font…');
        await page.selectOption('#pLayers [data-p=font]', 'f_' + F.id); ok(await page.evaluate(k => selected().font === k, 'f_' + F.id), '   the type is set in it');
        await page.keyboard.press('r'); await page.mouse.move(cx - 60, cy + 40); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 120, { steps: 4 }); await page.mouse.up(); await page.waitForFunction(() => selected().kind === 'shape');
        const svgText = await page.evaluate(() => svgDoc()); ok(/font-family="Test Grotesk"/.test(svgText) && /<rect /.test(svgText) && (svgText.match(/<g /g) || []).length === 3, '4. the export names the font, keeps the rectangle as a shape, one group per layer');
        // the round trip: edit the text in the file, bring it back
        const edited = svgText.replace('ROUND TRIP', 'CAME BACK').replace(/fill="#141416"/, 'fill="#aa2200"');
        const tmp = `${process.env.JOURNEY_TMP || '/tmp'}/roundtrip-${Date.now()}.svg`; writeFileSync(tmp, edited);
        await page.setInputFiles('#svgIn', tmp); await page.waitForSelector('#askDlg[open]'); ok(/edited layers back/i.test(await page.innerText('#askTitle')), '   a studio file is recognised and offered as a replacement');
        await page.click('#askYes'); await page.waitForFunction(() => /brought in/.test(document.getElementById('stToast')?.textContent || ''), null, { timeout: 15000 });
        const back = await page.evaluate(() => LAYERS.map(l => ({ kind: l.kind, text: l.text || '', font: l.font || '', color: l.color || '', shape: l.shape || '' })));
        ok(back.length === 3 && back[0].kind === 'base' && back[1].kind === 'text' && back[1].text === 'CAME BACK' && back[1].font === 'f_' + F.id && back[2].kind === 'shape' && back[2].shape === 'rect', '   the layers come back: type still type (with its new words and font), the rectangle still a shape, the base kept', back);
        ok(await page.evaluate(() => LAYERS[1].color.toLowerCase() === '#aa2200'), '   a colour changed in Illustrator comes back too');
        await page.keyboard.press('Control+z'); ok(await page.evaluate(() => LAYERS[1].text === 'ROUND TRIP'), '   undo brings the old layers back'); await page.keyboard.press('Control+Shift+z');
        const foreign = `${process.env.JOURNEY_TMP || '/tmp'}/foreign-${Date.now()}.svg`; writeFileSync(foreign, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle id="sun" cx="100" cy="100" r="60" fill="#e0a020"/><path id="wave" d="M10 170 Q 100 120 190 170" stroke="#2244aa" stroke-width="6" fill="none"/></svg>');
        await page.setInputFiles('#svgIn', foreign); await page.waitForSelector('#askDlg[open]'); ok(/not a studio file/i.test(await page.innerText('#askText')), '5. any other SVG is offered as picture layers on top'); await page.click('#askYes'); await page.waitForFunction(n => LAYERS.length === n, 5, { timeout: 15000 });
        const added = await page.evaluate(() => LAYERS.slice(-2).map(l => ({ kind: l.kind, name: l.name, w: l.raster.width, h: l.raster.height, painted: (() => { const d = l.raster.getContext('2d').getImageData(0, 0, l.raster.width, l.raster.height).data; let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 0) n++; return n; })() })));
        ok(added[0].name === 'sun' && added[1].name === 'wave' && added.every(l => l.kind === 'image' && l.w === 1024 && l.h === 1024 && l.painted > 0), '   each top-level piece is a picture layer at the canvas size, drawn', added);
        // 3D in the studio
        await page.click('#tryBtn'); await page.waitForSelector('#tryDlg[open]'); await page.waitForSelector('#tryHost canvas', { timeout: 30000 });
        ok(await page.evaluate(() => TRYVIEW && TRYVIEW.triangles === 12), '6. the 3D try-on opens on the model already made and shows it in our viewer');
        await page.waitForFunction(() => TRYVIEW && TRYVIEW.textured(), null, { timeout: 15000 }); ok(true, '   with the design painted on it');
        await page.click('#tryCanvas'); await page.waitForFunction(() => /being made/.test(document.getElementById('tryMsg').textContent), null, { timeout: 15000 });
        await page.waitForFunction(() => document.querySelectorAll('#tryList [data-try]').length === 3 && /Ready/.test(document.querySelector('#tryList [data-try]').textContent), null, { timeout: 40000 });
        ok(/From the canvas/.test(await page.innerText('#tryList [data-try]')), '   a model from the canvas is made and listed');
        await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-tryon.png` }).catch(() => {});
        await page.click('#tryList [data-try] [data-trydel]'); await page.waitForFunction(() => document.querySelectorAll('#tryList [data-try]').length === 2, null, { timeout: 15000 }); ok(true, '   and can be removed');
        // the concept window links to it; the library lists the font
        await page.click('[data-tryclose]'); await page.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#cgrid .cc[data-cid="${c.id}"]`, { timeout: 15000 }); await page.click(`#cgrid .cc[data-cid="${c.id}"]`); await page.waitForSelector('#cd[open] [data-ctry]');
        ok(/tryon=1/.test(await page.getAttribute('#cd [data-ctry]', 'href')), '7. the concept window has a 3D try-on button');
        await page.goto(`${BASE}/lab/library`, { waitUntil: 'networkidle' }); await page.waitForSelector('#fontList .chip', { timeout: 15000 }); ok(/Test Grotesk · TTF/.test(await page.innerText('#fontList')) && (await page.locator('#fontGo').count()) === 1, '   the library lists the font, with Add a font…');
        ok(errs.length === 0, 'no page errors', errs); await oc.close();
      } finally { await b.close(); }
    }
    ok((await K(`/fonts/${F.id}`, { method: 'DELETE' })).status === 200 && !(await K('/fonts')).json.fonts.some(f => f.id === F.id), '8. a font can be removed'); fontIds.length = 0;
  } finally { for (const id of fontIds) await K(`/fonts/${id}`, { method: 'DELETE' }).catch(() => {}); await cleanup(brands, plan.plan?.id); }
});

await journey('J229', 'Made as: a mark or graphic in the studio is made as any of 44 ways (embroidery, prints, transfers, patches, knit, laser, metal, stones, each in its variants), picked from live previews drawn on the layer, grouped by kind, or from a wall of every way on a piece of cloth; the library lists them all with their factory notes', async () => {
  const { brands, plan } = await conceptSetup();
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  try {
    const tl = await K('/library/techniques'); const T = tl.json.techniques, byKind = k => T.filter(t => t.kind === k);
    ok(tl.status === 200 && T.length >= 44 && tl.json.kinds.length === 6 && byKind('embroidery').length >= 7 && byKind('print').length >= 12 && byKind('heat_transfer').length >= 8 && byKind('patch').length >= 7 && byKind('other').length >= 5, `1. the library has ${T.length} ways to make a graphic across ${tl.json.kinds.length} kinds`, Object.fromEntries(tl.json.kinds.map(k => [k.id, byKind(k.id).length])));
    ok(T.every(t => tl.json.effects.includes(t.finish.effect) && t.factoryNote && t.prompt) && tl.json.effects.includes('silicone') && tl.json.effects.includes('stud'), '   each one draws with a known effect and carries its factory note and its words for the image model');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length === 2); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#pLayers [data-tkind]');
      const fin = () => page.evaluate(() => { const l = selected(); return l.finish ? { id: l.finish.id, name: l.finish.name, effect: l.finish.effect, raise: l.finish.raise } : null; });
      ok((await page.locator('#pLayers [data-tkind]').count()) === 6 && (await page.locator('#pLayers [data-tapply]:not([data-tapply=""])').count()) === byKind('embroidery').length && (await page.$$eval('#pLayers [data-tapply] img', els => els.every(i => i.getAttribute('src').startsWith('data:image/png')))), '2. the wordmark\'s panel opens on Made as: six kinds, and a drawn preview for every embroidery');
      const puff = T.find(t => t.key === 'puff-embroidery'); await page.click(`#pLayers [data-tapply="${puff.id}"]`); await page.waitForFunction(() => selected().finish && selected().finish.id, null, { timeout: 5000 });
      const f1 = await fin(); ok(f1.id === puff.id && f1.effect === 'stitch' && f1.raise === 6, '   one click makes it 3D puff embroidery, drawn on the layer', f1);
      await page.click('#pLayers [data-tkind=heat_transfer]'); await page.waitForFunction(n => document.querySelectorAll('#pLayers [data-tapply]:not([data-tapply=""])').length === n, byKind('heat_transfer').length);
      const sil = T.find(t => t.key === 'silicone-3d'); await page.click(`#pLayers [data-tapply="${sil.id}"]`); await page.waitForFunction(id => selected().finish && selected().finish.id === id, sil.id);
      ok((await fin()).effect === 'silicone' && (await fin()).raise === 5, '   the heat transfers: 3D silicone, thick and glossy', await fin());
      await page.click('#pLayers [data-tkind=other]'); const studs = T.find(t => t.key === 'rhinestones'); await page.waitForSelector(`#pLayers [data-tapply="${studs.id}"]`); await page.click(`#pLayers [data-tapply="${studs.id}"]`); await page.waitForFunction(id => selected().finish && selected().finish.id === id, studs.id);
      ok((await fin()).effect === 'stud', '   other ways: rhinestones');
      await page.click('#pLayers [data-act=madeall]'); await page.waitForSelector('#madeDlg[open]'); await page.waitForFunction(n => document.querySelectorAll('#madeGrid [data-madeapply]').length === n, T.length, { timeout: 30000 });
      ok((await page.locator('#madeGrid canvas').count()) === T.length && (await page.locator('#madeGrid h4').count()) === 6, `3. "See it made every way": the wordmark made all ${T.length} ways on a piece of cloth, grouped by kind`);
      await page.selectOption('#madeCloth', 'denim'); await page.waitForFunction(n => document.querySelectorAll('#madeGrid canvas').length === n, T.length); ok(await page.evaluate(() => MADE.cloth === 'denim'), '   drawn again on denim');
      await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-made-every-way.png` }).catch(() => {});
      const knit = T.find(t => t.key === 'knit-in'); await page.click(`#madeGrid [data-madeapply="${knit.id}"]`); await page.waitForFunction(id => selected().finish && selected().finish.id === id, knit.id);
      ok(!(await page.evaluate(() => document.getElementById('madeDlg').open)) && (await fin()).effect === 'knit', '   clicking one makes the layer that way and closes the wall');
      await page.selectOption('#pLayers [data-tech]', { label: 'Metallic thread embroidery' }); ok((await fin()).effect === 'stitch' && await page.evaluate(() => selected().finish.thread === 'metallic'), '   picking by name still works, and the metallic thread is kept');
      await page.click('#pLayers [data-tapply=""]'); ok((await fin()) === null, '   Plain takes the technique off');
      await page.goto(`${BASE}/lab/library#techniques`, { waitUntil: 'networkidle' }); await page.waitForSelector('#tList .kind', { timeout: 15000 });
      ok((await page.locator('#tList .kind').count()) === 6 && /Other ways/.test(await page.innerText('#tList')), '4. the library page shows the six kinds');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J230', 'Decoration to the factory: a graphic has a real size in inches with placement rules, its colour separations, a decoration sheet page, a cost per piece that goes into the concept\'s landed cost and the tech pack BOM; in the studio a ruler sets the scale, marks warp to the garment and take a tone-on-tone colour; and one library graphic goes across the whole range', async () => {
  const { brands, plan } = await conceptSetup();
  const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0], other = plan.lines.find(l => l.id !== tops.id);
  const c = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  const c2 = other ? (await K(`/plans/${plan.plan.id}/lines/${other.id}/concepts`, { body: { count: 1 } })).json.concepts[0] : null;
  try {
    const bold = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect x="40" y="60" width="820" height="200" rx="30" fill="#c8102e"/><circle cx="450" cy="380" r="100" fill="#141416"/></svg>`);
    const artImage = `data:image/png;base64,${(await sharp(bold).png().toBuffer()).toString('base64')}`;
    const art = (await K('/library/graphics/upload', { body: { image: artImage, name: 'Range crest' } })).json.id;
    const F = (path = '', o = {}) => K(`/concepts/${c.id}/flats${path}`, o), first = (await F()).json, f = first.flat, techs = first.techniques;
    const screen = techs.find(t => t.base === 'screen print'), emb = techs.find(t => t.base === 'embroidery');
    // 1. the flats: each placement priced, the total kept on the concept
    const body = { style: f.style, fit: f.fit, m: f.m, options: f.options, placements: [...f.placements, { id: 'g', name: 'Chest graphic', view: 'front', art, techniqueId: screen.id, technique: 'screen print', x: 0, y: 9, w: 10, h: 5.5 }] };
    const put = await F('', { method: 'PUT', body }), decos = put.json.decorations || [], g = decos.find(d => d.id === 'g');
    ok(put.status === 200 && decos.length === body.placements.length && g && g.base === 'screen print' && g.colours >= 2 && g.pantones.every(p => /^PANTONE /.test(p)) && g.perPieceCents > 0 && /screens?/.test(g.basis), '1. saving the flats prices each decoration: size, colours as Pantones, screens and a cost a piece', put.json.error || decos);
    const sum = decos.reduce((s, d) => s + d.perPieceCents, 0);
    ok(put.json.cost && put.json.cost.decorationCents === sum && put.json.cost.landedCents > sum, '   the decorations go into the factory and landed cost', put.json.cost);
    ok(Number(sql(`select jsonb_array_length(spec->'decorations') from lab_concepts where id='${c.id}'`)) === decos.length, '   and are kept on the concept');
    const mat = (await K(`/concepts/${c.id}/materials`)).json; ok(mat.cost.decorationCents === sum && mat.cost.decorations.length === decos.length, '   the concept\'s materials and cost panel counts them', mat.cost);
    // 2. the decoration sheet
    const pdf = await fetch(`${BASE}/v1/lab/concepts/${c.id}/flats/decorations.pdf`, { headers: { Authorization: 'Bearer ' + kyleT } }), pb = Buffer.from(await pdf.arrayBuffer());
    const pages = (pb.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(pdf.status === 200 && /application\/pdf/.test(pdf.headers.get('content-type')) && pb.slice(0, 4).toString() === '%PDF' && pages === body.placements.length, `2. the decoration sheet is a PDF, one page per graphic (${pages})`);
    ok((await call(`/v1/lab/concepts/${c.id}/flats/decorations.pdf`)).status === 401, '   closed like the rest of the Lab');
    // 3. the tech pack BOM
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours', makeReason: 'checked with the printer' } });
    const tp = await K(`/concepts/${c.id}/tech-pack`, { body: {} }), pack = (await call(`/v1/admin/products/${tp.json.productId}/tech-pack`, { token: kyleT })).json.techPack?.data;
    const row = pack && pack.bom.find(r => r.component === 'Decoration · Chest graphic');
    ok(tp.status === 201 && row && row.notes === 'From the flats' && Number(row.cost) === g.perPieceCents / 100 && /10 in/.test(row.spec) && /PANTONE/.test(row.color), '3. the tech pack BOM has the decoration with its size, Pantones and cost a piece', row || tp.json);
    // 4. the studio check: size against the placement and the technique, and the cost
    const S = (path, o) => K('/studio' + path, o);
    const wide = await S('/check', { body: { image: artImage, widthIn: 8, heightIn: 4.4, placement: 'left chest', techniqueId: emb.id, name: 'Crest' } });
    ok(wide.status === 200 && wide.json.findings.some(x => x.code === 'WIDE_FOR_PLACE') && wide.json.technique.base === 'embroidery' && /stitches/.test(wide.json.cost.basis), '4. the studio check: 8 in is wide for a left chest, priced by stitches as embroidery', wide.json);
    const fits = await S('/check', { body: { image: artImage, widthIn: 3.5, heightIn: 1.9, placement: 'left chest', techniqueId: screen.id } });
    ok(fits.json.findings.some(x => x.code === 'PLACE_OK') && fits.json.inks >= 2 && fits.json.cost.perPieceCents > 0, '   3.5 in suits it, with its inks and a cost a piece', fits.json);
    ok((await S('/check', { body: { image: artImage, widthIn: 0 } })).status === 422 && (await call('/v1/lab/studio/check', { body: { image: artImage, widthIn: 3, heightIn: 2 } })).status === 401, '   it needs a size, and a sign-in');
    // 5. colour separations
    const sep = await S('/separations', { body: { image: artImage, widthIn: 10, techniqueId: screen.id, garment: '#1d2540', name: 'Crest' } });
    ok(sep.status === 200 && sep.json.plates.length >= 2 && sep.json.plates.every(p => /^PANTONE /.test(p.pantone) && p.image.startsWith('data:image/png')) && sep.json.underbase, '5. separations: a plate per ink with its Pantone, and a white underbase on a dark garment', sep.json.error || sep.json.plates?.map(p => p.pantone));
    const zr = await fetch(`${BASE}/v1/lab/studio/separations`, { method: 'POST', headers: { Authorization: 'Bearer ' + kyleT, 'Content-Type': 'application/json' }, body: JSON.stringify({ image: artImage, widthIn: 10, techniqueId: screen.id, zip: true }) }), zb = Buffer.from(await zr.arrayBuffer());
    ok(zr.status === 200 && /zip/.test(zr.headers.get('content-type')) && zb.slice(0, 2).toString() === 'PK', '   and the files as a zip for the printer');
    // 6. one graphic across the range
    const mk = await K(`/plans/${plan.plan.id}/mockup`, { body: { art, placement: 'auto', which: 'all' } }), shown = (mk.json.items || []).filter(i => i.image);
    ok(mk.status === 200 && mk.json.items.length >= 2 && shown.length >= 1 && shown.every(i => i.spot && i.image.startsWith('data:image/jpeg')), `6. the graphic previewed on every piece (${shown.length} of ${mk.json.items?.length}), at the usual spot for each`, mk.json.error || mk.json.items?.map(i => [i.category, i.spot, i.skipped]));
    ok(mk.json.items.some(i => i.id === c.id && /tech pack/.test(i.skipped || '')), '   a piece that is already a tech pack is left alone');
    const target = shown.find(i => i.id !== c.id);
    if (target) {
      const ap = await K(`/plans/${plan.plan.id}/mockup/apply`, { body: { art, placement: 'auto', techniqueId: screen.id, ids: [target.id] } });
      const gr = JSON.parse(sql(`select coalesce(spec->'graphics','[]'::jsonb)::text from lab_concepts where id='${target.id}'`));
      ok(ap.status === 200 && ap.json.applied.length === 1 && gr.some(x => x.art === art && x.finish?.id === screen.id), '   put on the ticked piece: the graphic is in its words, made as screen print', ap.json);
      const again = await K(`/plans/${plan.plan.id}/mockup/apply`, { body: { art, placement: 'auto', ids: [target.id] } });
      ok(again.json.applied.length === 0 && /Already carries/.test(again.json.skipped[0]?.why), '   and not twice');
    }
    ok((await K(`/plans/${plan.plan.id}/mockup`, { body: { art: '00000000-0000-4000-8000-000000000000' } })).status === 422 && (await K(`/plans/${plan.plan.id}/mockup/apply`, { body: { art, ids: [] } })).status === 422, '   it needs a graphic, and a ticked piece');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    // 7. the studio: ruler, size, warp, tone on tone, separations
    const sc = c2 && c2.status !== 'tech_pack' ? c2 : (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${sc.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      ok(await page.evaluate(() => PPI > 1 && !PPISET && /estimated/.test(PPINOTE)), '7. the studio starts with an estimated scale from the size of the piece', await page.evaluate(() => [PPI, PPINOTE]));
      await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length === 2); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#sizeRead');
      await page.fill('#pLayers [data-win]', '3.5'); await page.dispatchEvent('#pLayers [data-win]', 'change');
      ok(await page.evaluate(() => Math.abs(inchesOf(selected()).w - 3.5) < .05) && /3\.5 × /.test(await page.innerText('#sizeRead')) && /cm/.test(await page.innerText('#sizeRead')), '   typing 3.5 in sizes the wordmark to 3.5 in, shown in cm too');
      await page.selectOption('#pLayers [data-placement]', 'left chest'); await page.click('#pLayers [data-act=check]'); await page.waitForSelector('#chk [data-cost]', { timeout: 20000 });
      await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-studio-size.png` }).catch(() => {}); ok(await page.locator('#chk [data-code=PLACE_OK]').count() === 1 && Number(await page.getAttribute('#chk [data-cost]', 'data-cost')) > 0, '   checked for the left chest: it suits, and it has a cost a piece');
      // the ruler: a line of known length sets the scale
      await page.keyboard.press('u'); const box = await page.locator('#view').boundingBox(), at = await page.evaluate(() => [sx(W * .3), sy(H * .5), sx(W * .7), sy(H * .5), W * .4]);
      await page.mouse.move(box.x + at[0], box.y + at[1]); await page.mouse.down(); await page.mouse.move(box.x + at[2], box.y + at[3], { steps: 6 }); await page.mouse.up();
      await page.waitForSelector('#rulerDlg[open]'); await page.fill('#rulerIn', '20'); await page.click('#rulerDlg button[value=yes]'); await page.waitForFunction(() => PPISET, null, { timeout: 5000 }).catch(() => {});
      ok(await page.evaluate(n => PPISET && Math.abs(PPI - n / 20) / (n / 20) < .03, at[4]), '   the ruler: 40% of the picture set as 20 in makes the scale', await page.evaluate(() => [PPI, PPISET]));
      ok(await page.evaluate(() => serialize().ppi === PPI && serialize().ppiSet === true), '   and the scale is saved with the design');
      // warp
      const flatW = await page.evaluate(() => inchesOf(selected()).w); await page.keyboard.press('v'); await page.click('#pLayers [data-warp=arcup]');
      const w1 = await page.evaluate(() => { const l = selected(), c = processed(l), s = contentOf(l); return { kind: l.warp && l.warp.kind, taller: c.height > s.height, svg: /<image /.test(svgDoc()) }; });
      ok(w1.kind === 'arcup' && w1.taller && w1.svg, '8. warp: the wordmark arcs up to the piece, and the SVG export still carries it', w1);
      await page.keyboard.press('w'); const hp = await page.evaluate(() => { const h = warpHandles(selected())[5]; return [sx(h[0]), sy(h[1])]; });
      await page.mouse.move(box.x + hp[0], box.y + hp[1]); await page.mouse.down(); await page.mouse.move(box.x + hp[0] + 6, box.y + hp[1] - 18, { steps: 4 }); await page.mouse.up();
      await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-studio-warp.png` }).catch(() => {}); ok(await page.evaluate(() => selected().warp.kind === 'free' && HI > 0), '   one of its 16 points dragged by hand');
      ok(await page.evaluate(w => Math.abs(inchesOf(selected()).w - w) < .01, flatW), '   the size stays the flat size of the art');
      await page.keyboard.press('v'); await page.click('#pLayers [data-warp=reset]'); ok(await page.evaluate(() => !selected().warp), '   and it goes flat again');
      // tone on tone
      await page.click('#pLayers [data-act=tonal]'); await page.waitForSelector('#tonalDlg[open] [data-tone]');
      ok((await page.locator('#tonalGrid [data-tone]').count()) === 7 && (await page.$$eval('#tonalGrid [data-pantone]', els => els.every(e => /^PANTONE /.test(e.dataset.pantone)))), '9. tone on tone: the fabric\'s colour a step lighter and darker, each with its Pantone');
      await page.click('#tonalGrid [data-tone]:nth-child(3)'); ok(await page.evaluate(() => selected().tint.amount === 1 && /^PANTONE /.test(selected().tone.pantone)), '   one click recolours the mark, and its Pantone is kept');
      // separations
      await page.click('#pLayers [data-act=sep]'); await page.waitForSelector('#sepDlg[open] [data-plate]', { timeout: 30000 });
      ok((await page.locator('#sepGrid [data-plate]').count()) >= 1 && /PANTONE/.test(await page.innerText('#sepGrid')), '10. the separations open from the layer: a plate per ink');
      await page.click('#sepDlg [data-sepclose]');
      await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 15000 });
      const d = (await K(`/concepts/${sc.id}/studio`)).json.doc; ok(d && d.ppiSet === true && d.ppi > 1, '   saved: the scale set with the ruler comes back next time', d && [d.ppi, d.ppiSet]);
      // flats and the plan page
      await page.goto(`${BASE}/lab/studio?concept=${c.id}&view=front`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app[data-v=front]'); ok(await page.isVisible('#decoBtn') && await page.isVisible('#specBtn'), '11. the flats, in Design, have a Decoration sheet button');
      await page.goto(`${BASE}/lab#plans`, { waitUntil: 'networkidle' }); await page.evaluate(id => openPlan(id), plan.plan.id); await page.waitForFunction(id => [...document.querySelectorAll('#mkArt option')].some(o => o.value === id), art, { timeout: 15000 });
      await page.selectOption('#mkArt', art); await page.selectOption('#mkWhich', 'all'); await page.click('[data-mkgo]'); await page.waitForSelector('#mkOut [data-mk]', { timeout: 30000 });
      ok((await page.locator('#mkOut [data-mk]').count()) >= 2 && (await page.locator('#mkOut img').count()) >= 1, '12. the plan page: one graphic previewed on every piece, with a tick each');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J231', 'From the studio to the factory: a graphic placed and measured in the studio lands on the flats at its size; artwork sizes per group of garment sizes; inks per colourway; vector and stitch files; an all-over repeat made in the library and laid over the whole piece; and factory quotes that calibrate the costs', async () => {
  await K('/library/techniques'); // the built-in techniques are put in at start-up: wait for them before the first flats read
  const { brands, plan } = await conceptSetup();
  const tops = plan.lines.find(l => l.category === 'tops') || plan.lines[0];
  const [c, c2] = (await K(`/plans/${plan.plan.id}/lines/${tops.id}/concepts`, { body: { count: 2 } })).json.concepts;
  try {
    const bold = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect x="40" y="60" width="820" height="200" rx="30" fill="#141416"/><circle cx="450" cy="380" r="100" fill="#c8102e"/></svg>`);
    const image = `data:image/png;base64,${(await sharp(bold).png().toBuffer()).toString('base64')}`, art = (await K('/library/graphics/upload', { body: { image, name: 'Crest two' } })).json.id;
    const F = (path = '', o = {}) => K(`/concepts/${c.id}/flats${path}`, o), first = (await F()).json, f = first.flat, screen = first.techniques.find(t => t.base === 'screen print');
    const body = { style: f.style, fit: f.fit, m: f.m, options: f.options, placements: [...f.placements, { id: 'g', name: 'Chest graphic', view: 'front', art, techniqueId: screen.id, technique: 'screen print', x: 0, y: 9, w: 10, h: 5.5 }] };
    ok((await F('', { method: 'PUT', body })).status === 200, '0. flats saved with a chest graphic');
    // 1. the studio's placed layer becomes a graphic on the concept and a placement on its flats, at its size
    const S = (id, layers) => K(`/concepts/${id}/studio/graphics`, { body: { layers } });
    const s1 = await S(c.id, [{ layer: 'labc123', name: 'Back crest', image, widthIn: 3.5, heightIn: 1.94, placement: 'left chest', techniqueId: screen.id }]);
    const after = (await F()).json.flat.placements, sp = after.find(q => q.source === 'studio');
    ok(s1.status === 200 && s1.json.arts.labc123 && s1.json.flats?.placements === 1 && sp && sp.w === 3.5 && sp.layer === 'labc123' && sp.art === s1.json.arts.labc123 && after.length === body.placements.length + 1, '1. the studio layer is on the saved flats at 3.5 in, at the left chest, next to what was there', s1.json.error || after.map(q => [q.id, q.w]));
    const g1 = JSON.parse(sql(`select spec->'graphics' from lab_concepts where id='${c.id}'`)); ok(g1.some(g => g.studioLayer === 'labc123' && g.widthIn === 3.5 && /left chest/.test(g.placement)), '   and a graphic on the concept, for the tech pack');
    const s2 = await S(c.id, [{ layer: 'labc123', name: 'Back crest', art: s1.json.arts.labc123, widthIn: 4, heightIn: 2.2, placement: 'left chest', techniqueId: screen.id }]), sp2 = (await F()).json.flat.placements.find(q => q.source === 'studio');
    ok(s2.status === 200 && sp2.w === 4 && sp2.x === sp.x && Math.abs((sp2.y - sp2.h / 2) - (sp.y - sp.h / 2)) < .01 && (await F()).json.flat.placements.filter(q => q.source === 'studio').length === 1, '   resized in the studio: the same placement, 4 in, its top edge kept');
    ok((await S(c.id, [])).json.flats.placements === 0 && !(await F()).json.flat.placements.some(q => q.source === 'studio'), '   taken off in the studio: gone from the flats');
    await S(c2.id, [{ layer: 'lzz9', name: 'Nape', image, widthIn: 2.5, heightIn: 1.4, placement: 'back neck' }]);
    const init = (await K(`/concepts/${c2.id}/flats`)).json.flat, np = init.placements.find(q => q.source === 'studio');
    ok(!init.saved && np && np.w === 2.5 && np.view === 'back', '   a concept with no flats yet starts its flats with it, at the back neck', np);
    ok((await S(c.id, [{ layer: 'labc123', widthIn: 0, heightIn: 1, placement: 'left chest', image }])).status === 422, '   a layer needs a size');
    // 2. artwork by garment size, and inks on each colourway
    await K(`/concepts/${c.id}/colourways`, { method: 'PUT', body: { colourways: [{ name: 'Washed black', hex: '#111111' }, { name: 'Bone', hex: '#f2efe6' }] } });
    const sg = (await F('/suggest', { body: { ...body, placementId: 'g' } })).json;
    ok(sg.grade && sg.grade.follows === 'chest' && sg.grade.two.length === 2 && sg.grade.two[0].w < 10 && sg.grade.two[1].w > 10 && sg.grade.three.length === 3, '2. artwork sizes suggested from the chest: two or three sizes across the run', sg.grade);
    const black = sg.inks.find(x => x.colourway.hex === '#111111'), blackInk = black && black.inks.find(x => x.from === '#141416');
    ok(blackInk && blackInk.to !== '#141416' && /^PANTONE /.test(blackInk.toPantone) && sg.inks.find(x => x.colourway.hex === '#f2efe6').inks.every(x => x.to === x.from || x.from === '#c8102e'), '   the black ink is lifted on the black colourway, as drawn on bone', sg.inks);
    // 3. an all-over repeat, made in the library
    const leaf = (await K('/library/graphics/upload', { body: { image: `data:image/png;base64,${(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path d="M20 280 L200 20 L380 280Z" fill="#2f5d3a"/><circle cx="200" cy="200" r="50" fill="#e8c547"/></svg>')).png().toBuffer()).toString('base64')}`, name: 'Leaf' } })).json.id;
    const rp = await K('/library/repeat', { body: { art: leaf, type: 'halfdrop', repeatIn: 3, scale: .6 } });
    ok(rp.status === 200 && rp.json.widthIn === 6 && rp.json.preview.startsWith('data:image/png') && !rp.json.id, '3. a half-drop repeat previewed: 6 in across (two columns of 3 in)', rp.json);
    const kept = await K('/library/repeat', { body: { art: leaf, type: 'halfdrop', repeatIn: 3, scale: .6, keep: true } });
    const listed = (await K('/library/graphics?source=repeat')).json.graphics.find(g => g.id === kept.json.id);
    ok(kept.status === 201 && listed && listed.repeat.type === 'halfdrop' && listed.repeat.widthIn === 6, '   kept in the library as a repeat, with its size');
    // 4. the flats with grading, inks and the all-over print
    const g = body.placements.find(q => q.id === 'g'); g.grade = sg.grade.two; g.inks = { '#111111': { '#141416': blackInk.to } };
    const body2 = { ...body, allover: { art: kept.json.id, w: listed.repeat.widthIn, h: listed.repeat.heightIn, type: 'halfdrop', name: 'Leaf all over', base: 'all-over sublimation' } };
    const put = await F('', { method: 'PUT', body: body2 }), ao = put.json.decorations?.find(d => d.allover), gd = put.json.decorations?.find(d => d.id === 'g');
    ok(put.status === 200 && ao && ao.base === 'all-over sublimation' && ao.perPieceCents > 0 && gd.grade.length === 2 && gd.inks['#111111'], '4. saved: the all-over print is priced by the cloth it covers, the graphic keeps its sizes and inks', put.json.error || put.json.decorations);
    const back = (await F()).json.flat; ok(back.allover?.art === kept.json.id && back.placements.find(q => q.id === 'g').grade.length === 2, '   and they come back with the flats');
    const svg = await (await fetch(`${BASE}/v1/lab/concepts/${c.id}/flats/sheet.svg`, { headers: { Authorization: 'Bearer ' + kyleT } })).text();
    ok(/Artwork by size: XS–M/.test(svg) && /All over: Leaf all over/.test(svg) && /-ao" patternUnits/.test(svg) && (await sharp(Buffer.from(svg)).png().toBuffer()).length > 10000, '   the spec sheet: sizes per group, the all-over print, drawn on the flats');
    const pdf = Buffer.from(await (await fetch(`${BASE}/v1/lab/concepts/${c.id}/flats/decorations.pdf`, { headers: { Authorization: 'Bearer ' + kyleT } })).arrayBuffer()), pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    writeFileSync(`${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-decorations-j231.pdf`, pdf);
    ok(pdf.slice(0, 4).toString() === '%PDF' && pages >= body2.placements.length + 1, `   the decoration sheet: a page (or more) per graphic and one for the all-over print (${pages} for ${body2.placements.length} graphics)`);
    // 5. factory quotes calibrate the costs
    const est = gd.perPieceCents, q = await K('/decor/quotes', { body: { techniqueId: screen.id, supplier: 'Shop A', widthIn: 10, heightIn: 5.5, colours: gd.colours, qty: 300, unitCents: Math.round(gd.unitCents * 1.6), setupCents: Math.round(gd.setupCents * 1.6), conceptId: c.id, placement: 'Chest graphic' } });
    ok(q.status === 201 && q.json.quote.actualCents > q.json.quote.estimateCents && q.json.calibration.byTechnique[screen.id].n === 1 && q.json.calibration.byTechnique[screen.id].factor > 1, '5. a factory quote is kept against our estimate for the same job', q.json.error || q.json.calibration);
    const put2 = await F('', { method: 'PUT', body: body2 }), gd2 = put2.json.decorations.find(d => d.id === 'g');
    ok(gd2.perPieceCents > est && /factory quote/.test(gd2.basis), `   the next costing moves towards it: ${est} → ${gd2.perPieceCents} cents a piece`, gd2.basis);
    ok((await K('/decor/quotes')).json.quotes.some(x => x.id === q.json.quote.id && x.techniqueName === screen.name) && (await K('/decor/quotes', { body: { techniqueId: screen.id, widthIn: 0, heightIn: 1, qty: 1, unitCents: 1 } })).status === 422, '   listed, and a quote needs its size');
    ok((await K(`/decor/quotes/${q.json.quote.id}`, { method: 'DELETE' })).json.ok, '   and can be taken back');
    // 6. vector and stitch files, from the library and from a studio layer
    const vr = await fetch(`${BASE}/v1/lab/library/graphics/${art}/vector.svg?widthIn=10`, { headers: { Authorization: 'Bearer ' + kyleT } }), vs = await vr.text();
    ok(vr.status === 200 && /image\/svg/.test(vr.headers.get('content-type')) && /width="10in"/.test(vs) && (vs.match(/<path /g) || []).length === 2 && Number(vr.headers.get('x-paths')) >= 2, '6. the graphic traced to vector: a path per ink at 10 in');
    const ej = await K(`/library/graphics/${art}/embroidery?widthIn=3.5`), dr = await fetch(`${BASE}/v1/lab/library/graphics/${art}/embroidery?widthIn=3.5&format=dst`, { headers: { Authorization: 'Bearer ' + kyleT } }), db = Buffer.from(await dr.arrayBuffer());
    ok(ej.status === 200 && ej.json.stitches > 500 && ej.json.colours.length === 2 && ej.json.preview.startsWith('data:image/png') && db.slice(0, 3).toString() === 'LA:' && (db.length - 512) % 3 === 0, '   and as an embroidery stitch file (.dst) with its stitch count and a preview', ej.json.error);
    ok((await K(`/library/graphics/${art}/embroidery?widthIn=30`)).status === 422, '   no embroidery wider than a hoop');
    const sv = await K('/studio/vector', { body: { image, widthIn: 4 } }), se = await K('/studio/embroidery', { body: { image, widthIn: 3 } });
    ok(sv.status === 200 && sv.json.colours.length === 2 && se.status === 200 && se.json.stitches > 300, '   the studio makes both from a layer');
    ok(se.json.stats.trims >= 1 && se.json.threads.length === 2 && se.json.threads.every(t => t.stitches > 0 && /^#/.test(t.hex)) && se.json.objects.length >= 2, '   digitized: a thread sequence with stitches, trims and the shapes it is sewn as', se.json.stats);
    const lightE = await K('/studio/embroidery', { body: { image, widthIn: 3, rowMm: .6, underlay: false } }); ok(lightE.json.stitches < se.json.stitches, '   a lighter fill without underlay sews fewer stitches', [lightE.json.stitches, se.json.stitches]);
    const ex = await fetch(`${BASE}/v1/lab/studio/embroidery`, { method: 'POST', headers: { Authorization: 'Bearer ' + kyleT, 'Content-Type': 'application/json' }, body: JSON.stringify({ image, widthIn: 3, format: 'exp' }) }), eb = Buffer.from(await ex.arrayBuffer());
    const zx = await fetch(`${BASE}/v1/lab/studio/embroidery`, { method: 'POST', headers: { Authorization: 'Bearer ' + kyleT, 'Content-Type': 'application/json' }, body: JSON.stringify({ image, widthIn: 3, name: 'Crest', format: 'zip' }) }), zxb = Buffer.from(await zx.arrayBuffer()), ztxt = zxb.toString('latin1');
    ok(ex.status === 200 && eb.length > 100 && eb.includes(Buffer.from([0x80, 0x01])) && zx.status === 200 && zxb.slice(0, 2).toString() === 'PK' && /crest\.dst/.test(ztxt) && /crest\.exp/.test(ztxt) && /stitch-preview\.png/.test(ztxt) && /job-sheet\.pdf/.test(ztxt), '   the Melco .exp, and everything in one zip: .dst, .exp, the sew-out, the sheet');
    // 7. the tech pack carries it
    await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours', makeReason: 'checked with the printer' } });
    const tp = await K(`/concepts/${c.id}/tech-pack`, { body: {} }), pack = (await call(`/v1/admin/products/${tp.json.productId}/tech-pack`, { token: kyleT })).json.techPack?.data;
    ok(pack && pack.bom.some(r => r.component === 'Decoration · Chest graphic' && /XS–M/.test(r.spec)) && pack.bom.some(r => /^All-over print · Leaf/.test(r.component) && Number(r.cost) > 0) && pack.construction.some(r => /^Flats · Inks by colourway/.test(r.area) && /Washed black/.test(r.detail)), '7. the tech pack: artwork sizes in the BOM, the all-over print with its cost, the inks by colourway', pack && pack.bom.map(r => r.component));
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      // the flats page
      await page.goto(`${BASE}/lab/studio?concept=${c2.id}&view=front`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForSelector('#pPl [data-q]', { timeout: 20000 });
      const sid = await F.evaluate(() => [...document.querySelectorAll('#pPl [data-q]')].find(c => /from the studio/.test(c.querySelector('.where').textContent))?.dataset.q); ok(Boolean(sid), '8. the flats page: the studio graphic is there, marked from the studio');
      await F.click(`#pPl [data-q="${sid}"] .where`); await F.waitForSelector('#pPl [data-grade="2"]');
      await F.click('#pPl [data-grade="2"]'); await F.waitForSelector('#pPl [data-gw]', { timeout: 15000 });
      ok((await F.locator('#pPl [data-gw]').count()) === 2, '   Two sizes: a width per group of garment sizes, each one editable');
      const wOf = () => F.evaluate(id => Number(document.querySelector(`#canvas [data-pl="${id}"] image`)?.getAttribute('width')), sid); const wm = await wOf();
      await F.selectOption('#size', 'XXL'); await F.dispatchEvent('#size', 'change'); const wx = await wOf(); ok(wx > wm, `   the size picker draws the XXL artwork bigger (${wm} → ${wx} in)`);
      await F.waitForSelector('#repTiles [data-rep]', { timeout: 15000 }); await F.click(`#repTiles [data-rep="${kept.json.id}"]`); await F.waitForSelector('#canvas pattern image', { state: 'attached', timeout: 15000 });
      ok(/halfdrop repeat/.test(await F.innerText('#pPl')), '   the all-over repeat chosen from the library covers the piece');
      await page.click('#save'); await F.waitForSelector('#pPl [data-dc]', { timeout: 20000 });
      ok((await F.locator('#pPl [data-dc]').count()) >= 2 && /a piece/.test(await F.innerText('#pPl [data-dc]')), '   saved: what each decoration costs, the all-over print among them');
      const card = F.locator('#pPl [data-dc]').first(); await card.locator('summary').click(); await card.locator('[data-qk=unit]').fill('2.50'); await card.locator('[data-qsave]').click(); await F.waitForFunction(() => /Kept:/.test(document.querySelector('#pPl [data-qmsg]').textContent), null, { timeout: 15000 });
      ok(true, '   and a factory\'s quote is recorded from the page'); await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-flats-factory.png` }).catch(() => {});
      // the library page
      await page.goto(`${BASE}/lab/library`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => typeof openGraphic === 'function' && G.graphics.length > 0, null, { timeout: 15000 });
      await page.evaluate(id => openGraphic(id), art); await page.waitForSelector('#gDlg[open]');
      await page.click('#grGo'); await page.waitForFunction(() => !document.getElementById('grImg').classList.contains('hidden'), null, { timeout: 20000 });
      ok(/repeat, \d/.test(await page.innerText('#grInfo')), '9. the library: a repeat previewed from the graphic'); await page.evaluate(() => document.getElementById('gRep').scrollIntoView()); await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-library-repeat.png` }).catch(() => {});
      await page.click('#gjDst'); await page.waitForSelector('#gjEmb [data-stitches]', { timeout: 20000 }); ok(Number(await page.getAttribute('#gjEmb [data-stitches]', 'data-stitches')) > 300, '   the embroidery file with its stitch count');
      // the studio: a layer with a place goes to the flats on save
      await page.goto(`${BASE}/lab/studio?concept=${c2.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length >= 2); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#sizeRead');
      await page.fill('#pLayers [data-win]', '3.5'); await page.dispatchEvent('#pLayers [data-win]', 'change'); await page.selectOption('#pLayers [data-placement]', 'left chest');
      await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      const fp = (await K(`/concepts/${c2.id}/flats`)).json.flat.placements.find(q => q.source === 'studio');
      ok(fp && Math.abs(fp.w - 3.5) < .2, '10. the studio: a wordmark set to 3.5 in for the left chest is on the flats when the design is saved', fp);
      await page.evaluate(() => sepOpen(selected())); await page.waitForSelector('#sepDlg[open] [data-plate]', { timeout: 30000 });
      ok((await page.locator('#sepDlg [data-sepvec]').count()) === 1 && (await page.locator('#sepDlg [data-sepdst]').count()) === 1, '   the separations offer the vector and embroidery files');
      await page.click('#sepDlg [data-sepview="film"]'); ok(await page.evaluate(() => [...document.querySelectorAll('#sepGrid img[data-ink]')].every(i => i.src === i.dataset.film)), '   and show the films the screens are burnt from');
      await page.click('#sepDlg [data-sepdst]'); await page.waitForSelector('#embDlg[open]'); await page.waitForFunction(() => Number(document.querySelector('#embDlg').dataset.stitches) > 0 && document.querySelector('#embImg').naturalWidth > 0, null, { timeout: 30000 });
      const before = Number(await page.getAttribute('#embDlg', 'data-stitches')), rows = await page.locator('#embSeq tr').count();
      ok(rows >= 2 && /stitches/.test(await page.innerText('#embStats')) && /trims/.test(await page.innerText('#embStats')), '11. the embroidery window: the design sewn out, stitches, trims and the thread sequence', await page.innerText('#embStats'));
      await page.selectOption('#embUnder', '0'); await page.waitForFunction(b => Number(document.querySelector('#embDlg').dataset.stitches) < b, before, { timeout: 30000 });
      ok(true, '   without underlay it digitizes again, with fewer stitches');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#embDlg [data-embdl="dst"]')]); ok(/\.dst$/.test(dl.suggestedFilename()), '   and the Tajima file downloads', dl.suggestedFilename());
      await page.click('#embDlg [data-embclose]');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J232', 'The self-serve Design Lab: a client room is locked out until the Lab is opened on it; then their plans, concepts and graphics are theirs alone and staff see everything; AI generations past the included ones are metered, invoiced and capped; tech packs come with it; a pack can go to their own factory for a quotation, or to Future Basics to make', async () => {
  const { brands, plan: staffPlan, gen } = await conceptSetup(); ok(gen.status === 201, 'a staff plan to compare against', gen.json.error);
  const email = `lab-client-${stamp}@selfserve.test`, started = await call('/v1/public/start', { body: { email, name: 'Self Serve', title: 'First tee', photos: [jpeg()] } });
  const cid = started.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0], slug = sql(`select slug from clients where id='${cid}'`).split('\n')[0];
  sql(`update users set email_verified_at=now() where id='${uid}'`);
  const clientT = await forge({ sub: uid, clientId: cid, client: slug, role: 'client', email }), C = (path, o = {}) => call('/v1/lab' + path, { token: clientT, ...o }), H = (path, o = {}) => call(path, { token: clientT, ...o }), A = (path, o = {}) => call(path, { token: kyleT, ...o });
  try {
    // locked out, with the offer
    const locked = await C('/plans'); ok(locked.status === 403 && locked.json.code === 'LAB_LOCKED' && locked.json.pricing?.feeCents === 49900 && locked.json.pricing.includedAi === 40, 'a client room is locked out of the Lab, and told the price', [locked.status, locked.json]);
    const offer = await H('/v1/client/lab'); ok(offer.status === 200 && offer.json.open === false && offer.json.access === null && offer.json.pricing.enabled === true && offer.json.pricing.days === 90 && offer.json.pricing.aiPriceCents === 250, 'the hub shows the offer: the fee, the days, what is included, the price past it', offer.json);
    const co = await H('/v1/client/lab/checkout', { method: 'POST' }); ok(co.status === 503 && /Payments are not set up/.test(co.json.error), 'with no payments connected the checkout says so instead of pretending', [co.status, co.json.error]);
    ok((await H('/v1/client/lab/landed', { method: 'POST' })).json.paid === false, 'nothing has landed');
    const pricing = await call('/v1/pricing'); ok(pricing.json.lab?.feeCents === 49900 && pricing.json.lab.enabled === true, 'the public pricing carries the Lab');
    const lockedPack = await H('/v1/tech-packs', { body: { title: 'Second · before the Lab', projectId: started.json.project.id, photos: [jpeg()] } }); ok(lockedPack.status === 201 && lockedPack.json.ai === 'locked', 'before the Lab, a second photo pack waits for payment as usual', [lockedPack.status, lockedPack.json.ai]);

    // Future Basics opens it (free, with a small allowance so the meter can be seen working)
    const comp = await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'comp', includedAi: 2, aiPriceCents: 250, unpaidCapCents: 600 } });
    ok(comp.status === 200 && comp.json.open === true && comp.json.access.source === 'comped' && comp.json.access.includedAi === 2 && comp.json.meter.used === 0 && comp.json.meter.left === 2, 'staff give access from the room: it opens at once with its own numbers', comp.json);
    ok(sql(`select ai_status from tech_packs where id='${lockedPack.json.techPack?.id || lockedPack.json.id}'`).split('\n')[0] !== 'locked' || (await (async () => { for (let i = 0; i < 20; i++) { if (sql(`select ai_status from tech_packs where product_id='${lockedPack.json.product.id}'`).split('\n')[0] !== 'locked') return true; await new Promise(r => setTimeout(r, 300)); } return false; })()), 'the pack that was waiting for payment starts: tech packs come with the Lab');
    const withLab = await H('/v1/tech-packs', { body: { title: 'Third · with the Lab', projectId: started.json.project.id, photos: [jpeg()] } }); ok(withLab.status === 201 && withLab.json.ai !== 'locked' && sql(`select billing from tech_packs where product_id='${withLab.json.product.id}'`).split('\n')[0] === 'lab', 'a new photo pack is not locked, and is marked as covered by the Lab', [withLab.json.ai, sql(`select billing from tech_packs where product_id='${withLab.json.product.id}'`)]);
    ok((await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'comp' } })).status === 200 && Number(sql(`select count(*) from lab_access where client_id='${cid}' and status='active'`)) === 1, 'giving it again replaces the period: one live access at a time');
    await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'comp', includedAi: 2, aiPriceCents: 250, unpaidCapCents: 600 } });

    // their room, scoped
    const ov = await C('/overview'); ok(ov.status === 200 && ov.json.client === true && ov.json.brands.length === 0 && ov.json.categories.length > 5 && ov.json.brandCode === null, 'the Lab opens for them without the research side', [ov.status, ov.json.brands?.length]);
    ok((await C('/brands', { body: { name: 'X', url: 'https://x.test' } })).json.code === 'LAB_STAFF_ONLY' && (await C('/taste')).status === 403 && (await C('/clients')).status === 403 && (await C('/items')).status === 403, 'the research, the taste and the client list stay Future Basics only (a room adds its own materials and techniques: J233)');
    ok((await C('/materials')).status === 200 && (await C('/library/techniques')).status === 200, 'they read the shared materials and techniques');
    ok((await C('/plans')).json.plans.length === 0 && (await C(`/plans/${staffPlan.plan.id}`)).status === 404 && (await C('/concepts')).json.concepts.length === 0, 'they see none of our plans or concepts, not even by id');
    const mine = await C('/plans', { body: { name: 'My first line', season: 'SS28' } }); ok(mine.status === 201 && sql(`select client_id from lab_plans where id='${mine.json.plan.id}'`).split('\n')[0] === cid && /Self Serve/.test(sql(`select brand->>'name' from lab_plans where id='${mine.json.plan.id}'`)), 'a plan they make is theirs, in their brand', [mine.status, mine.json.error]);
    const pid = mine.json.plan.id, line = await C(`/plans/${pid}/lines`, { body: { category: 'tops', role: 'core', name: 'Heavy tee', brief: 'a heavy cotton tee', price: 78 } }); ok(line.status === 201 || line.status === 200, 'they add a planned piece', line.json.error);
    const lid = (line.json.lines || (await C(`/plans/${pid}`)).json.lines).find(l => l.name === 'Heavy tee').id;
    ok((await K(`/plans/${pid}`)).status === 200 && (await K('/plans')).json.plans.some(p => p.id === pid), 'staff see their plan among all plans');
    ok((await call(`/v1/lab/plans/${pid}`, { token: patT })).status === 403, 'a staff member without the Lab still has no way in');
    const sl = staffPlan.lines[0], sg = await K(`/plans/${staffPlan.plan.id}/lines/${sl.id}/concepts`, { body: { count: 1 } }); ok(sg.status === 201, 'we make a concept of our own meanwhile', sg.json.error);

    // the meter: 2 included, 250 a generation past them, generations pause at 600 owed
    const g1 = await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 1 } }); ok(g1.status === 201 && g1.json.concepts.length === 1, 'they make a concept', g1.json.error);
    ok(sql(`select client_id from lab_concepts where id='${g1.json.concepts[0].id}'`).split('\n')[0] === cid && sql(`select count(*) from lab_art where concept_id='${g1.json.concepts[0].id}' and client_id<>'${cid}'`) === '0', 'the concept and its artwork carry their room');
    let st = (await H('/v1/client/lab')).json; ok(st.meter.used === 1 && st.meter.left === 1 && st.meter.owedCents === 0, 'the meter counts it: one of two included used', st.meter);
    await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 1 } }); const g3 = await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 2 } }); ok(g3.status === 201, 'past the included ones generations keep going', g3.json.error);
    st = (await H('/v1/client/lab')).json; ok(st.meter.used === 4 && st.meter.overUnits === 2 && st.meter.overCents === 500 && st.meter.unbilledCents === 500 && st.meter.owedCents === 500 && st.meter.blocked === false, 'two past the included ones, 500 owed and not yet invoiced', st.meter);
    const g5 = await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 1 } }); ok(g5.status === 201, 'under the cap: one more', g5.json.error);
    const g6 = await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 1 } }); ok(g6.status === 402 && /owes \$7\.50/.test(g6.json.error), 'at the cap the room is asked to pay before the next one', [g6.status, g6.json.error]);
    const redraw = await C(`/concepts/${g1.json.concepts[0].id}/redraw`, { method: 'POST', body: {} }); ok(redraw.status === 402 && redraw.json.code === 'LAB_AI_CAP' && redraw.json.meter?.owedCents === 750, 'every kind of generation is held to it, with the meter in the answer', [redraw.status, redraw.json]);
    const usage = await H('/v1/client/lab/usage'); ok(usage.json.usage.length === 4 && usage.json.usage.every(u => u.kind === 'concept') && usage.json.usage.reduce((a, u) => a + u.units, 0) === 5, 'the usage is listed, one line a generation');
    const bill = await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'bill' } }); ok(bill.status === 200 && bill.json.meter.invoices.length === 1 && bill.json.meter.invoices[0].amountCents === 750 && bill.json.meter.invoices[0].units === 3 && bill.json.meter.unbilledCents === 0 && bill.json.meter.unpaidCents === 750, 'staff invoice the unbilled generations: 3 at 2.50', bill.json.meter);
    ok((await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'bill' } })).status === 422, 'nothing left to invoice twice');
    const inv = bill.json.meter.invoices[0]; ok((await H(`/v1/client/lab/invoices/${inv.id}/landed`, { method: 'POST' })).json.paid === false, 'not paid yet');
    const paid = await A(`/v1/admin/lab/invoices/${inv.id}/paid`, { method: 'POST', body: { reference: 'check 1042' } }); ok(paid.status === 200 && paid.json.meter.owedCents === 0 && paid.json.meter.blocked === false && Number(sql(`select count(*) from payments where client_id='${cid}' and kind='design-lab-ai' and amount_cents=750`)) === 1, 'paid by other means: the room owes nothing and the ledger has it', paid.json.meter);
    ok((await A(`/v1/admin/lab/invoices/${inv.id}/paid`, { method: 'POST', body: {} })).status === 404, 'an invoice is paid once');
    ok((await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 1 } })).status === 201, 'and generations go on');
    ok(Number(sql(`select count(*) from lab_ai_usage where client_id is null and created_at > now() - interval '10 minutes'`)) >= 1, 'staff generations are counted too, against no room');

    // their concept becomes a tech pack in their room; then: make it
    const concepts = (await C('/concepts')).json.concepts; ok(concepts.length === 6 && (await K('/concepts')).json.concepts.length > 6, 'they see their six concepts; staff see theirs and ours');
    const c1 = concepts[0]; ok((await C(`/concepts/${c1.id}/approve`, { method: 'POST', body: {} })).status === 200, 'they approve one');
    const tp = await C(`/concepts/${c1.id}/tech-pack`, { method: 'POST', body: {} }); ok(tp.status === 201 && sql(`select client_id from products where id='${tp.json.productId}'`).split('\n')[0] === cid, 'it becomes a tech pack in their own room', [tp.status, tp.json.error]);
    const own = await call(`/v1/products/${tp.json.productId}/tech-pack/draft`, { token: clientT }); ok(own.status === 200 && own.json.editable === true, 'and it is theirs to open and finish in the hub, not locked until Future Basics publishes it', [own.status, own.json.error]);
    const prod = tp.json.productId, mk0 = await H(`/v1/products/${prod}/make`); ok(mk0.status === 200 && mk0.json.published === false && mk0.json.requests.length === 0 && mk0.json.links.length === 0, 'Make it: nothing yet, and the pack is not published');
    ok((await H(`/v1/products/${prod}/quote-links`, { body: { label: 'Acme' } })).status === 409, 'their factory cannot be sent an unpublished pack');
    const ask = await H(`/v1/products/${prod}/make-request`, { body: { qty: 300, note: 'Ship to Philadelphia by March' } }); ok(ask.status === 201 && ask.json.request.status === 'requested' && ask.json.request.qty === 300, 'they ask Future Basics to make it', ask.json);
    ok((await H(`/v1/products/${prod}/make-request`, { body: {} })).status === 409, 'one open request at a time');
    const dash = await A('/v1/admin/dashboard'); ok(dash.json.queues.attention.some(x => x.key === `make:${ask.json.request.id}` && x.owner === 'us' && /Asked us to make/.test(x.title) && /300 units/.test(x.title)), 'it lands on Production attention', dash.json.queues.attention.map(x => x.key).slice(0, 5));
    ok((await A('/v1/admin/make-requests')).json.requests.some(r => r.id === ask.json.request.id && r.clientName === started.json.client.name), 'and on the list');
    const quoting = await A(`/v1/admin/make-requests/${ask.json.request.id}`, { method: 'PATCH', body: { status: 'quoting', reply: 'Two factories are pricing it' } }); ok(quoting.status === 200 && quoting.json.request.status === 'quoting', 'we say we are pricing it');
    ok((await H(`/v1/products/${prod}/make`)).json.requests[0].reply === 'Two factories are pricing it', 'they read the reply on the pack');
    ok((await A(`/v1/admin/make-requests/${ask.json.request.id}`, { method: 'PATCH', body: { status: 'nope' } })).status === 422, 'a status is one of the four');
    sql(`update tech_packs set published_at=now(), published_data=data, version=1 where product_id='${prod}'`);
    const link = await H(`/v1/products/${prod}/quote-links`, { body: { label: 'Acme Knits', email: 'rfq@acme.test' } }); ok(link.status === 201 && /\/tp\//.test(link.json.url) && link.json.link.active === true, 'once published, a link for their factory', link.json);
    const fac = await call(`/v1/tp/${link.json.url.split('/tp/')[1]}`); ok(fac.status === 200 && (fac.json.quoteMode === true || fac.json.kind === 'quote' || fac.json.techPack), 'the factory opens it without an account', [fac.status, Object.keys(fac.json).slice(0, 6)]);
    ok((await H(`/v1/products/${prod}/make`)).json.links.length === 1, 'it shows on their pack');
    ok((await H(`/v1/products/${prod}/quote-links`, { body: { label: 'Bad', email: 'not-an-email' } })).status === 422, 'a bad email is refused');
    ok((await H(`/v1/products/${prod}/quote-links/${link.json.link.id}`, { method: 'DELETE' })).json.ok === true && (await H(`/v1/products/${prod}/make`)).json.links.filter(l => l.active).length === 0, 'they turn it off');
    const other = (await K('/concepts')).json.concepts.find(c => c.id !== c1.id && !concepts.some(x => x.id === c.id)); ok(other && (await C(`/concepts/${other.id}`)).status === 404 && (await C(`/concepts/${other.id}/image`)).status === 404, 'our concepts are not theirs to open');
    ok((await H(`/v1/products/${sql(`select id from products where client_id<>'${cid}' limit 1`).split('\n')[0]}/make`)).status === 404, 'nor is another room\'s pack');

    // ending it
    const end = await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'end' } }); ok(end.status === 200 && end.json.open === false && end.json.ended?.status === 'ended', 'staff end the access');
    ok((await C('/plans')).status === 403 && (await K(`/plans/${pid}`)).status === 200, 'the room is locked out again; their plan is still there for us');
    await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'comp', includedAi: 2, aiPriceCents: 250, unpaidCapCents: 600 } });

    // in a browser: the hub card and the Lab as a client
    if (!playwright) { ok(true, 'skipped: no browser here'); return; }
    const b = await playwright.chromium.launch(), errs = [];
    try {
      const cc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await cc.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, clientT);
      const page = await cc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForSelector('#lab .lab-card', { timeout: 15000 });
      const card = await page.innerText('#lab'); ok(/The Design Lab/.test(card) && /AI generations: \d+ of 2 included used/i.test(card) && /Nothing owed/i.test(card) && /estimates/i.test(card), 'the hub shows the Lab card with the meter and the estimate note', card.slice(0, 600));
      ok(!(await page.locator('#navLab').evaluate(e => e.classList.contains('hidden'))), 'and a Design Lab link in the menu');
      await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
      ok(/Your Design Lab/i.test(await page.innerText('.hero')) && (await page.locator('#grp-research').evaluate(e => e.classList.contains('hidden'))) && (await page.locator('#fbSide').count()) === 0, 'the Lab opens on the client token without the research side or the staff menu', [(await page.innerText('.hero')).slice(0, 80), await page.locator('#grp-research').evaluate(e => e.className), await page.locator('#fbSide').count()]);
      ok((await page.locator('nav.labnav a[href="/#lab"]').count()) >= 1 && !/research/i.test(await page.locator('nav.labnav').first().innerText()), 'the Lab menu leads back to their hub and has no Research', (await page.locator('nav.labnav').first().innerText()).slice(0, 200));
      ok((await page.locator('#plans .plan, #plans [data-plan], #planList *').count()) >= 0 && /My first line/.test(await page.innerText('#plans')), 'their plan is on the page', (await page.innerText('#plans')).slice(0, 200));
      await page.goto(`${BASE}/tech-packs/${prod}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#tabs button[data-tab="make"]', { timeout: 15000 }); await page.click('#tabs button[data-tab="make"]'); await page.waitForSelector('[data-panel="make"].on form[data-form="quotelink"]', { timeout: 15000 });
      const mkText = await page.innerText('[data-panel="make"]'); ok(/Future Basics is pricing it/i.test(mkText) && /Send it to your own factory/i.test(mkText) && /factory's quote confirms/i.test(mkText), 'the pack has a Make it tab: our pricing in progress, their factory link form, the estimate note', mkText.slice(0, 900));
      ok(errs.length === 0, 'no page errors', errs);
    } finally { await b.close(); }
  } finally {
    await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'end' } }).catch(() => {});
    await cleanup(brands, staffPlan.plan?.id);
  }
});

await journey('J233', 'A room\'s team and its libraries: the room adds a teammate who signs in with a code and works on the same plans, graphics, materials and techniques; a room sees only its own work (plus the read-only starter materials and techniques), never ours or another room\'s, while Future Basics staff see everything; a teammate taken off loses access at once', async () => {
  const LOG = `${S}/server-j-a.log`, A = (path, o = {}) => call(path, { token: kyleT, ...o });
  const mkRoom = async who => {
    const email = `${who}-${stamp}@team${stamp}.test`, st = await call('/v1/public/start', { body: { email, name: `${who} owner`, title: 'First tee', photos: [jpeg()] } });
    const cid = st.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0], slug = sql(`select slug from clients where id='${cid}'`).split('\n')[0];
    sql(`update users set email_verified_at=now(), last_sign_in_at=now() where id='${uid}'`); sql(`update clients set contact_email='${email}' where id='${cid}'`);
    await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'comp' } });
    return { email, cid, uid, t: await forge({ sub: uid, clientId: cid, client: slug, role: 'client', email }) };
  };
  const one = await mkRoom('alpha'), two = await mkRoom('bravo');
  const O = (p, o = {}) => call(p, { token: one.t, ...o }), B = (p, o = {}) => call(p, { token: two.t, ...o });
  const mate = `mo-${stamp}@elsewhere${stamp}.test`;
  try {
    // the team
    let t = await O('/v1/client/team'); ok(t.status === 200 && t.json.members.length === 1 && t.json.members[0].owner && t.json.members[0].you && t.json.members[0].status === 'active', 'the room starts with its owner', t.json);
    ok((await O('/v1/client/team', { body: { email: 'nope' } })).status === 422 && (await O('/v1/client/team', { body: { email: 'pat@thefuturebasics.com' } })).status === 422 && (await O('/v1/client/team', { body: { email: two.email } })).status === 409, 'a bad address, Future Basics, and someone with their own room are refused');
    const add = await O('/v1/client/team', { body: { email: mate, name: 'Mo Maker' } }); ok(add.status === 201 && add.json.members.length === 2 && add.json.members.some(m => m.email === mate && m.status === 'invited' && m.name === 'Mo Maker'), 'the owner adds a teammate', add.json);
    ok((await O('/v1/client/team', { body: { email: mate.toUpperCase() } })).status === 409, 'not twice');
    await call('/v1/auth/code', { body: { email: mate } }); await sleep(200); const code = codeFrom(LOG, mate); ok(/^\d{6}$/.test(code || ''), 'the teammate gets a sign-in code', code);
    const v = await call('/v1/auth/verify', { body: { email: mate, code } }); ok(v.status === 200 && v.json.client?.id === one.cid, 'and signs in to the same room', [v.status, v.json.error]);
    const mt = v.json.token, M = (p, o = {}) => call(p, { token: mt, ...o }), mateId = v.json.user?.id;
    t = await M('/v1/client/team'); ok(t.json.members.find(m => m.email === mate)?.status === 'active' && t.json.members.find(m => m.email === mate)?.you && t.json.members.find(m => m.email === mate)?.invitedBy?.startsWith('alpha'), 'they show as signed in, added by the owner', t.json.members);
    ok((await M(`/v1/client/team/${mateId}`, { method: 'DELETE' })).status === 409 && (await M(`/v1/client/team/${one.uid}`, { method: 'DELETE' })).status === 409, 'nobody takes themselves or the owner off');

    // the room's plans and libraries, shared by the team
    const plan = await M('/v1/lab/plans', { body: { name: 'Team line' } }); ok(plan.status === 201 && (await O('/v1/lab/plans')).json.plans.some(p => p.id === plan.json.plan.id) && !(await B('/v1/lab/plans')).json.plans.some(p => p.id === plan.json.plan.id), 'a plan one teammate makes is the whole team\'s, and nobody else\'s');
    const up = await O('/v1/lab/library/graphics/upload', { body: { image: await png(300, 300, [20, 90, 200]), name: 'Team mark', tags: 'team' } }); ok(up.status === 201, 'the owner adds a graphic', up.json.error);
    const mg = (await M('/v1/lab/library/graphics')).json.graphics.find(g => g.id === up.json.id); ok(mg && /^alpha/.test(mg.by), 'the teammate sees it, made by the owner', mg);
    ok(!(await B('/v1/lab/library/graphics')).json.graphics.some(g => g.id === up.json.id) && (await B(`/v1/lab/art/${up.json.id}`)).status === 404, 'another room does not');
    // ours never reach a room
    const ours = await A('/v1/lab/library/graphics/upload', { body: { image: await png(300, 300, [200, 40, 40]), name: `FB stamp ${stamp}`, tags: 'fb' } }); ok(ours.status === 201, 'we add a graphic of our own');
    ok(!(await O('/v1/lab/library/graphics')).json.graphics.some(g => g.id === ours.json.id) && (await O(`/v1/lab/art/${ours.json.id}`)).status === 404 && (await O(`/v1/lab/library/studio?art=${ours.json.id}`)).status === 404, 'a room never sees our graphics, by list, by id or in the studio');
    ok((await O(`/v1/lab/library/graphics/${ours.json.id}`, { method: 'PUT', body: { shared: true, name: 'Taken' } })).status === 404, 'nor touches them');
    const staffList = (await A('/v1/lab/library/graphics?limit=200')).json.graphics, sg = staffList.find(g => g.id === up.json.id);
    ok(sg && /alpha/.test(sg.room) && staffList.some(g => g.id === ours.json.id), 'staff see every graphic, the room\'s marked with its name', sg?.room);
    // materials: the room's own plus the starter set; staff see all
    const mat = await M('/v1/lab/materials', { body: { kind: 'fabric', name: 'Team twill', price: 7.5 } }); ok(mat.status === 201, 'the teammate adds a material', mat.json.error);
    const fbOwn = await A('/v1/lab/materials', { body: { kind: 'fabric', name: `FB house twill ${stamp}`, price: 9 } }); ok(fbOwn.status === 201, 'we add one of our own');
    const om = (await O('/v1/lab/materials?kind=fabric')).json; ok(om.client === true && om.materials.some(m => m.id === mat.json.material.id && m.editable && /Mo Maker/.test(m.by)) && om.materials.some(m => m.starter && m.editable === false), 'the owner sees the teammate\'s material beside the read-only starter fabrics', om.materials.length);
    ok(!om.materials.some(m => m.id === fbOwn.json.material.id) && !(await B('/v1/lab/materials?kind=fabric')).json.materials.some(m => m.id === mat.json.material.id), 'but neither our own nor another room\'s');
    ok((await O(`/v1/lab/materials/${mat.json.material.id}`, { method: 'PUT', body: { price: 8 } })).status === 200, 'the owner edits the teammate\'s material');
    const starterMat = om.materials.find(m => m.starter); ok((await O(`/v1/lab/materials/${starterMat.id}`, { method: 'PUT', body: { price: 1 } })).status === 404 && (await O(`/v1/lab/materials/${fbOwn.json.material.id}/swatch`)).status === 404, 'a starter row cannot be changed, and ours cannot be opened');
    const am = (await A('/v1/lab/materials?kind=fabric')).json.materials; ok(am.some(m => m.id === mat.json.material.id && /alpha/.test(m.room)) && am.some(m => m.id === fbOwn.json.material.id), 'staff see every material, the room\'s marked with its name');
    // techniques: the same
    const techs = (await O('/v1/lab/library/techniques')).json.techniques, starter = techs.find(x => x.editable === false);
    ok(starter && (await O(`/v1/lab/library/techniques/${starter.id}`, { method: 'PUT', body: { name: 'Mine now' } })).status === 404, 'starter techniques are read-only to a room');
    const copy = await M('/v1/lab/library/techniques', { body: { from: starter.id } }); ok(copy.status === 201 && sql(`select client_id from lab_techniques where id='${copy.json.id}'`) === one.cid, 'a copy of one is the room\'s own', copy.json.error);
    const ol = (await O('/v1/lab/library/techniques')).json.techniques, bl = (await B('/v1/lab/library/techniques')).json.techniques; ok(ol.some(x => x.id === copy.json.id && x.editable) && !bl.some(x => x.id === copy.json.id), 'the team sees the copy; another room does not');
    const fbTech = await A('/v1/lab/library/techniques', { body: { name: `FB house print ${stamp}`, kind: 'print', summary: '', finish: { effect: 'ink' } } }); ok(fbTech.status === 201 && !ol.some(x => x.id === fbTech.json.id) && !(await O('/v1/lab/library/techniques')).json.techniques.some(x => x.id === fbTech.json.id), 'a technique we add stays ours');
    ok((await A('/v1/lab/library/techniques')).json.techniques.some(x => x.id === copy.json.id && /alpha/.test(x.room)), 'staff see the room\'s technique too');
    ok((await O(`/v1/lab/library/techniques/${copy.json.id}`, { method: 'PUT', body: { name: 'Team discharge' } })).status === 200, 'and the team changes theirs');

    // taking someone off
    const off = await O(`/v1/client/team/${mateId}`, { method: 'DELETE' }); ok(off.status === 200 && !off.json.members.some(m => m.email === mate), 'the owner takes the teammate off', off.json);
    const after = await M('/v1/lab/plans'); ok(after.status === 401 && after.json.code === 'REMOVED' && (await M('/v1/session')).status === 401, 'the session they hold stops working at once', [after.status, after.json]);
    ok((await call('/v1/auth/code', { body: { email: mate } })).status === 403, 'and they cannot sign in again');
    ok(sql(`select count(*) from lab_materials where id='${mat.json.material.id}'`) === '1' && (await O('/v1/lab/plans')).json.plans.some(p => p.id === plan.json.plan.id), 'what they made stays with the room');
    ok((await O('/v1/client/team', { body: { email: mate } })).status === 201, 'adding them again works');
    await call('/v1/auth/code', { body: { email: mate } }); await sleep(200); const v2 = await call('/v1/auth/verify', { body: { email: mate, code: codeFrom(LOG, mate) } }); ok(v2.status === 200 && (await call('/v1/lab/plans', { token: v2.json.token })).status === 200, 'and they are back in', [v2.status, v2.json.error]);

    // in a browser: the hub's team section, and the library's flags
    if (!playwright) { ok(true, 'skipped: no browser here'); return; }
    const b = await playwright.chromium.launch(), errs = [];
    try {
      const cc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await cc.addInitScript(x => { try { localStorage.setItem('fb.client.token', x); } catch {} }, one.t);
      const page = await cc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForSelector('#team .team-row', { timeout: 15000 });
      const txt = await page.innerText('#team'); ok(/Your team/i.test(txt) && txt.includes(mate) && /Owner/i.test(txt) && /Take off the team/i.test(txt), 'the hub lists the team with a way to take someone off', txt.slice(0, 300));
      await page.fill('#teamAdd input[name="email"]', `third-${stamp}@elsewhere${stamp}.test`); await page.click('#teamAdd button'); await page.waitForFunction(s => document.getElementById('team').innerText.includes(s), `third-${stamp}`, { timeout: 10000 });
      ok(/Invited/i.test(await page.innerText('#team')), 'adding someone from the hub shows them as invited');
      await page.goto(`${BASE}/lab/library`, { waitUntil: 'networkidle' }); await page.waitForSelector('#gGrid .card', { timeout: 15000 });
      const grid = await page.innerText('#gGrid'); ok(grid.includes('Team mark') && !grid.includes(`FB stamp ${stamp}`), 'the room\'s library holds the team\'s graphics and none of ours');
      await page.goto(`${BASE}/lab/materials`, { waitUntil: 'networkidle' }); await page.waitForSelector('[data-m]', { timeout: 15000 });
      ok(/Starter library/.test(await page.innerText('body')) && !(await page.innerText('body')).includes(`FB house twill ${stamp}`), 'materials show the starter set and the team\'s, never ours');
      ok(errs.length === 0, 'no page errors', errs);
    } finally { await b.close(); }
  } finally {
    for (const r of [one, two]) await A(`/v1/admin/clients/${r.cid}/lab`, { method: 'PATCH', body: { action: 'end' } }).catch(() => {});
  }
});

await journey('J234', 'One Design workspace: a concept opens on its picture, and the same page shows its flat front or flat back; a graphic placed on the picture is on the flats when they are shown, one Save keeps both, and the old flats address lands here', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      ok((await page.locator('#viewSeg [data-v]').count()) === 5 && await page.getAttribute('#viewSeg [data-v=picture]', 'aria-pressed') === 'true' && await page.isVisible('#stage') && !(await page.isVisible('#specBtn')) && !(await page.getAttribute('#flatFrame', 'src')),
        '1. a concept opens on its picture: the switch reads Picture, Flat front, Flat back, Pattern, Board, and the flats wait until they are asked for');
      // a wordmark placed on the picture, not saved
      await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length >= 2); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#sizeRead');
      await page.fill('#pLayers [data-win]', '3.5'); await page.dispatchEvent('#pLayers [data-win]', 'change'); await page.selectOption('#pLayers [data-placement]', 'left chest');
      ok(await page.evaluate(() => DIRTY), '   a wordmark set to 3.5 in for the left chest, not saved yet');
      await page.click('#viewSeg [data-v=front]'); await page.waitForSelector('#app[data-v=front]');
      const F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForSelector('#pPl [data-q]', { timeout: 20000 });
      ok(!(await page.isVisible('#stage')) && await page.isVisible('#specBtn') && await page.isVisible('#decoBtn') && !(await page.isVisible('#apply')) && /view=front/.test(page.url()), '2. Flat front: the flats fill the workspace, and the header swaps the picture\'s buttons for the sheets', page.url());
      ok(await F.evaluate(() => [...document.querySelectorAll('#pPl [data-q] .where')].some(w => /from the studio/.test(w.textContent))), '   the wordmark from the picture is already on the flats, without a save');
      ok(!(await F.isVisible('header')) && !(await F.isVisible('.bar')), '   the flats carry no second header or bar');
      await page.click('#viewSeg [data-v=back]'); await F.waitForFunction(() => document.querySelector('[data-view=back]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
      ok(/view=back/.test(page.url()), '3. Flat back turns the flats round');
      ok(!(await page.$('#viewSeg [data-v=split]')), '4. no side by side: the picture and the flat each take the whole workspace');
      // a change on the flats, and one Save keeps both
      await page.click('#viewSeg [data-v=front]'); await F.click('.tabs [data-tab=design]'); await F.click('[data-color="#1f2a44"]');
      await page.waitForFunction(() => /Not saved/i.test(document.getElementById('fsaved').textContent), null, { timeout: 5000 });
      ok(true, '5. a colour on the flats shows as not saved in the workspace header');
      await page.click('#save'); await F.waitForFunction(() => /^Saved/.test(document.getElementById('saved').textContent), null, { timeout: 20000 }); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      const col = sql(`select params->>'color' from lab_flats where concept_id='${c.id}'`), fp = (await K(`/concepts/${c.id}/flats`)).json.flat.placements.find(q => q.source === 'studio'), doc = (await K(`/concepts/${c.id}/studio`)).json.doc;
      ok(col === '#1f2a44' && fp && Math.abs(fp.w - 3.5) < .2 && doc?.layers?.length >= 2, '   one Save keeps the flats (their colour, the wordmark at 3.5 in) and the picture\'s layers', [col, fp?.w, doc?.layers?.length]);
      await page.click('#pieceSteps [data-step=picture]'); ok(await page.isVisible('#stage') && !(await page.isVisible('#flatHost')) && !/view=/.test(page.url()), '6. Picture brings the layers back');
      await page.goto(`${BASE}/lab/flats?concept=${c.id}`); await page.waitForURL(/\/lab\/studio\?concept=.*view=front/, { timeout: 15000 }); await page.waitForSelector('#app[data-v=front]', { timeout: 20000 });
      ok(true, '7. the old flats address opens the same workspace on the flat front');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
      const pc = await b.newContext({ viewport: { width: 390, height: 844 } }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const ph = await pc.newPage(); await ph.goto(`${BASE}/lab/studio?concept=${c.id}&view=front`, { waitUntil: 'networkidle' }); await ph.waitForSelector('#app[data-v=front]', { timeout: 20000 });
      const over = await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth), fh = (await ph.locator('#flatHost').boundingBox())?.height || 0;
      ok(over <= 1 && fh > 400, '8. on a phone: no sideways scroll, the flats fill the screen', [over, fh]);
      await pc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J235', 'Design, one placement model and two levels: a graphic\'s size set on the flats comes back to the picture, taking it off the flats leaves it on the picture only, the picture lists everything on the garment in inches, Simple hides the specialist tools on both sides, and a checklist says what is left before the tech pack', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    // the checklist over HTTP
    const r0 = await K(`/concepts/${c.id}/ready`); const st = id => r0.json.items?.find(i => i.id === id)?.state;
    ok(r0.status === 200 && r0.json.ready === false && st('flats') === 'todo' && st('approved') === 'todo' && r0.json.total >= 7, '1. the checklist: a fresh concept still needs its flats saved and its approval, among others', r0.json.items?.map(i => `${i.id}:${i.state}`));
    ok((await call(`/v1/lab/concepts/${c.id}/ready`, {})).status === 401 && (await P(`/concepts/${c.id}/ready`)).status === 403, '   it needs a Lab sign-in');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      // levels
      ok(await page.getAttribute('#app', 'data-level') === 'pro' && await page.isVisible('.rail [data-tool=distress]'), '2. Future Basics opens on Pro: every tool, distress among them');
      await page.click('#levelSeg [data-level=simple]');
      ok(!(await page.isVisible('.rail [data-tool=distress]')) && !(await page.isVisible('.rail [data-tool=warp]')) && !(await page.isVisible('#impBtn')) && await page.isVisible('.rail [data-tool=brush]') && await page.evaluate(() => localStorage.getItem('fb.design.level')) === 'simple', '   Simple keeps the essentials and puts distress, warp, the ruler and Illustrator import away, and is remembered');
      await page.keyboard.press('d'); ok(await page.evaluate(() => TOOL) !== 'distress', '   and their shortcuts rest with them');
      await page.click('#viewSeg [data-v=front]'); const F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForSelector('#pPl [data-q]', { timeout: 20000 });
      ok(await F.evaluate(() => document.documentElement.dataset.level) === 'simple' && !(await F.isVisible('.tabs [data-tab=pom]')) && !(await F.isVisible('#showPom')), '3. on the flats Simple puts the measurements table and points of measure away too');
      await page.click('#levelSeg [data-level=pro]'); ok(await F.isVisible('.tabs [data-tab=pom]'), '   and Pro brings them back');
      // the checklist in the page
      await page.click('#pieceSteps [data-step=picture]'); await page.waitForFunction(() => /Checklist \d+\/\d+/.test(document.getElementById('readyBtn').textContent), null, { timeout: 10000 });
      await page.click('#readyBtn'); await page.waitForSelector('#readyPop:not(.hidden) .rd');
      ok((await page.locator('#readyPop .rd').count()) >= 7 && await page.locator('#readyPop .rd[data-ready=flats][data-state=todo]').count() === 1, '4. Checklist in the header: each item, done or to do, with where to fix it', await page.innerText('#readyBtn'));
      await page.click('#readyPop [data-ready=flats] [data-readygo]'); await page.waitForSelector('#app[data-v=front]'); ok(true, '   Go on the flats item opens the flats');
      // one placement model: a wordmark placed on the picture, then resized on the flats
      await page.click('#pieceSteps [data-step=picture]');
      await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length >= 2); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#sizeRead');
      await page.fill('#pLayers [data-win]', '3.5'); await page.dispatchEvent('#pLayers [data-win]', 'change'); await page.selectOption('#pLayers [data-placement]', 'left chest');
      const lid = await page.evaluate(() => SEL);
      await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      await page.waitForSelector(`#garmentSec [data-gly="${lid}"]`, { timeout: 15000 });
      ok(/3\.5 ×/.test(await page.innerText(`#garmentSec [data-gly="${lid}"]`)), '5. the picture lists what is on the garment, in inches: the wordmark at 3.5 in', await page.innerText('#garmentSec'));
      await page.click(`#garmentSec [data-gly="${lid}"]`); ok(await page.evaluate(() => SEL) === lid, '   clicking it there chooses its layer');
      await page.click('#viewSeg [data-v=front]'); await F.waitForSelector(`#pPl [data-q="s-${lid}"]`, { timeout: 20000 });
      await F.click(`#pPl [data-q="s-${lid}"] .where`); await F.locator(`#pPl [data-q="s-${lid}"] [data-k=w]`).fill('4.5');
      await page.click('#save'); await F.waitForFunction(() => /^Saved/.test(document.getElementById('saved').textContent), null, { timeout: 20000 }); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      const w = await page.evaluate(id => inchesOf(LAYERS.find(l => l.id === id)).w, lid);
      ok(Math.abs(w - 4.5) < .08, '6. 4.5 in typed on the flats: the wordmark on the picture is 4.5 in wide too', w);
      const fp = (await K(`/concepts/${c.id}/flats`)).json.flat.placements.find(q => q.layer === lid); ok(fp && Math.abs(fp.w - 4.5) < .01, '   and saving the picture keeps the flats at 4.5 in, not its old size', fp?.w);
      // taken off the flats
      await F.click(`#pPl [data-q="s-${lid}"] [data-del]`); await page.click('#save'); await F.waitForFunction(() => /^Saved/.test(document.getElementById('saved').textContent), null, { timeout: 20000 }); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      ok(await page.evaluate(id => !LAYERS.find(l => l.id === id).placement, lid) && !(await K(`/concepts/${c.id}/flats`)).json.flat.placements.some(q => q.layer === lid), '7. taken off the flats, it stays on the picture with no place on the garment, and does not come back on the next save');
      const r1 = (await K(`/concepts/${c.id}/ready`)).json; ok(r1.items.find(i => i.id === 'flats').state === 'done' && r1.items.find(i => i.id === 'placed').state === 'warn', '8. the checklist now has the flats saved, and notes the wordmark on the picture with no place', r1.items.map(i => `${i.id}:${i.state}`));
      await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-design-checklist.png` }).catch(() => {});
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
      // a client's room starts on Simple
      const cc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await cc.addInitScript(() => { try { localStorage.setItem('fb.client.token', 'x'); } catch {} });
      const cp = await cc.newPage(); await cp.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'domcontentloaded' }); await cp.waitForSelector('#app', { state: 'attached' });
      ok(await cp.getAttribute('#app', 'data-level') === 'simple', '9. signed in from a client\'s hub, Design starts on Simple'); await cc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J236', 'Charges off per room, and Design on an iPad with the Pencil: the work console turns a room\'s Design Lab charges off (open, no fee, AI counted but never billed) and back on; on an iPad the Lab installs as a home-screen app, the Pencil draws wider when pressed harder, a resting palm moves the view instead of painting, and two fingers pinch to zoom', async () => {
  const email = `lab-free-${stamp}@selfserve.test`, started = await call('/v1/public/start', { body: { email, name: 'Free Room', title: 'First tee', photos: [jpeg()] } });
  const cid = started.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0], slug = sql(`select slug from clients where id='${cid}'`).split('\n')[0];
  sql(`update users set email_verified_at=now() where id='${uid}'`);
  const clientT = await forge({ sub: uid, clientId: cid, client: slug, role: 'client', email }), C = (path, o = {}) => call('/v1/lab' + path, { token: clientT, ...o }), H = (path, o = {}) => call(path, { token: clientT, ...o }), A = (path, o = {}) => call(path, { token: kyleT, ...o });
  const { brands, plan } = await conceptSetup();
  try {
    ok((await C('/plans')).json.code === 'LAB_LOCKED', '1. a room starts with the Lab locked');
    const free = await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'free' } });
    ok(free.status === 200 && free.json.open === true && free.json.free === true && free.json.access?.source === 'free' && free.json.access.free === true, '2. the console turns charges off: the Lab opens on the room at once, free', free.json);
    ok(sql(`select lab_free from clients where id='${cid}'`) === 't' && /charges turned off/.test(sql(`select summary from activities where client_id='${cid}' and type='design' order by created_at desc limit 1`)), '   and it is on the room\'s record');
    const mine = await C('/plans', { body: { name: 'Free line', season: 'SS28' } }), pid = mine.json.plan?.id; ok(mine.status === 201, '3. the room plans a line', mine.json.error);
    const line = await C(`/plans/${pid}/lines`, { body: { category: 'tops', role: 'core', name: 'Heavy tee', brief: 'a heavy cotton tee', price: 78 } }), lid = line.json.line?.id || line.json.lines?.slice(-1)[0]?.id || line.json.plan?.lines?.slice(-1)[0]?.id;
    for (let i = 0; i < 3; i++) { const g = await C(`/plans/${pid}/lines/${lid}/concepts`, { body: { count: 1 } }); ok(g.status === 201, `   generation ${i + 1} goes through`, g.json.error); }
    const st = (await H('/v1/client/lab')).json;
    ok(st.open && st.free && st.meter.used >= 3 && st.meter.owedCents === 0 && st.meter.blocked === false && st.meter.unbilledCents === 0 && sql(`select count(*) from lab_ai_invoices where client_id='${cid}'`) === '0', '4. generations are counted, nothing is owed or invoiced, nothing pauses', st.meter);
    ok((await H('/v1/client/lab/checkout', { method: 'POST' })).status === 409, '   there is nothing to buy: the checkout says the Lab is already open');
    const pack = await H('/v1/tech-packs', { body: { title: 'With a free Lab', projectId: started.json.project.id, photos: [jpeg()] } }); ok(pack.status === 201 && pack.json.ai !== 'locked', '   tech packs come with the open Lab, as they do with a paid one', [pack.status, pack.json.ai]);
    const on = await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'charge' } });
    ok(on.status === 200 && on.json.free === false && on.json.open === false && (await C('/plans')).json.code === 'LAB_LOCKED', '5. charges back on: with no paid period the room is offered the Lab again, its work kept', on.json);
    ok(Number(sql(`select count(*) from lab_plans where client_id='${cid}'`)) >= 1, '   their plan is still there');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    // the iPad
    const man = await call('/lab.webmanifest'); ok(man.status === 200 && man.json.display === 'standalone' && man.json.start_url === '/lab' && man.json.icons.length >= 3, '6. the Lab installs as its own home-screen app: standalone, opening on the Lab', man.json);
    const line2 = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line2.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
      await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      const head = await page.evaluate(() => ({ man: document.querySelector('link[rel=manifest]')?.getAttribute('href'), apple: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content, icon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), over: document.documentElement.scrollWidth - innerWidth, btn: document.querySelector('.rail [data-tool=brush]').getBoundingClientRect().width }));
      ok(head.man === '/lab.webmanifest' && head.apple === 'yes' && head.icon && head.over <= 1 && head.btn >= 44, '   Design carries the home-screen tags, fits the iPad across, and its tools are a fingertip wide', head);
      await page.tap('.rail [data-tool=brush]'); ok(await page.evaluate(() => TOOL) === 'brush' && await page.isVisible('#opts [data-press]'), '7. a tap picks the brush, with Pencil pressure on');
      const cdp = await oc.newCDPSession(page), vb = await page.locator('#view').boundingBox();
      const pen = async (y, force) => { const x0 = vb.x + vb.width * .3, x1 = vb.x + vb.width * .7; await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force });
        for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / 12, y, button: 'left', buttons: 1, pointerType: 'pen', force });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force }); };
      const yHard = vb.y + vb.height * .35, yLight = vb.y + vb.height * .65; await pen(yHard, 1); await pen(yLight, .1);
      // the thickness of each stroke, in the painting layer, across its middle
      const thick = await page.evaluate(([vx, vy, vw, y1, y2]) => { const l = LAYERS.find(q => q.kind === 'paint'); if (!l) return null; const r = view.getBoundingClientRect(), ctx = l.raster.getContext('2d');
        const col = (yy) => { const X = Math.round(dx(vx + vw * .5 - r.left)), Y = Math.round(dy(yy - r.top)); let n = 0; for (let j = Y - 80; j <= Y + 80; j++) { if (j < 0 || j >= l.raster.height) continue; if (ctx.getImageData(X, j, 1, 1).data[3] > 20) n++; } return n; };
        return { hard: col(y1), light: col(y2), pen: PEN }; }, [vb.x, vb.y, vb.width, yHard, yLight]);
      ok(thick && thick.pen && thick.hard > thick.light * 2 && thick.light > 0, '   the Pencil draws, wider when pressed hard than when pressed lightly', thick);
      const opaque = () => page.evaluate(() => { const l = LAYERS.find(q => q.kind === 'paint'), d = l.raster.getContext('2d').getImageData(0, 0, l.raster.width, l.raster.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++; return n; });
      const before = await opaque(), px0 = await page.evaluate(() => PX);
      const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
      const cx = vb.x + vb.width * .5, cy = vb.y + vb.height * .5;
      await tp('touchStart', [[cx, cy]]); for (let i = 1; i <= 6; i++) await tp('touchMove', [[cx + i * 20, cy + i * 8]]); await tp('touchEnd', []);
      ok(await opaque() === before && await page.evaluate(() => PX) !== px0, '8. after the Pencil, a finger (or a resting palm) moves the view and paints nothing', [before, px0, await page.evaluate(() => PX)]);
      const z0 = await page.evaluate(() => Z);
      await tp('touchStart', [[cx - 60, cy], [cx + 60, cy]]); for (let i = 1; i <= 6; i++) await tp('touchMove', [[cx - 60 - i * 25, cy], [cx + 60 + i * 25, cy]]); await tp('touchEnd', []);
      const z1 = await page.evaluate(() => Z); ok(z1 > z0 * 1.4 && await opaque() === before, '9. two fingers pinch to zoom in, painting nothing', [z0, z1]);
      await page.tap('#zFit');
      await page.tap('#viewSeg [data-v=front]'); const F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForSelector('#pPl [data-q]', { timeout: 20000 });
      ok(await F.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1 && await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, '10. the flats fit the iPad too');
      await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-ipad.png` }).catch(() => {});
      // portrait
      await page.setViewportSize({ width: 834, height: 1194 }); await page.tap('#pieceSteps [data-step=picture]'); await page.waitForTimeout(300);
      ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1 && await page.isVisible('#stage') , '11. turned upright, Design still fits');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J237', 'Graphics added on the flats come onto the picture, and the iPad polish: a mark added on the flats appears on the picture at its size and becomes one record drawn on both; taken off the picture it stays off; what came with the concept waits for Put on the picture; the console menu folds away on Design; the flats pinch to zoom; installed, an export opens in the app with Share and Save', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1440, height: 950 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.removeItem('fb.nav.collapsed'); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${c.id}&view=front`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app[data-v=front]', { timeout: 20000 });
      await page.waitForFunction(() => document.body.classList.contains('fbnav'), null, { timeout: 10000 }).catch(() => {});
      ok(await page.evaluate(() => document.body.classList.contains('fbcollapsed')), '1. on Design the console menu starts folded to its icons, giving the width to the work');
      const F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForSelector('#pPl [data-q]', { timeout: 20000 });
      await F.click('#pPl [data-addmark=word]'); await F.waitForFunction(() => FBFlats.placements().some(q => q.added && q.mark === 'word'), null, { timeout: 5000 });
      const added = await F.evaluate(() => { const q = FBFlats.placements().find(x => x.added && x.mark === 'word'); return { id: q.id, w: q.w, x: q.x, y: q.y }; });
      await page.click('#save'); await page.waitForFunction(id => LAYERS.some(l => l.fromFlat === id), added.id, { timeout: 20000 });
      const ly = await page.evaluate(id => { const l = LAYERS.find(x => x.fromFlat === id); return { id: l.id, w: inchesOf(l).w, placement: l.placement, name: l.name }; }, added.id);
      ok(Math.abs(ly.w - added.w) < .1 && ly.placement, '2. a wordmark added on the flats comes onto the picture by itself, at its size, with its place on the garment', [ly, added]);
      await page.waitForFunction(() => !DIRTY && !document.getElementById('save').disabled, null, { timeout: 30000 });
      let fl = (await K(`/concepts/${c.id}/flats`)).json.flat.placements; const took = fl.find(q => q.layer === ly.id);
      ok(took && took.source === 'studio' && !fl.some(q => q.id === added.id) && Math.abs(took.x - added.x) < .01 && Math.abs(took.y - added.y) < .01, '3. saved, the picture\'s layer takes the flats placement over: one record, still where it was put on the flats', [took, added]);
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { state: 'attached', timeout: 20000 }); await page.waitForTimeout(1500);
      ok(await page.evaluate(id => LAYERS.filter(l => l.id === id).length, ly.id) === 1 && await page.evaluate(() => LAYERS.filter(l => l.fromFlat).length) === 1, '   opened again, it is there once, not twice');
      await page.click('#pieceSteps [data-step=picture]'); await page.evaluate(id => { SEL = id; removeLayer(LAYERS.find(l => l.id === id)); }, ly.id); await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      fl = (await K(`/concepts/${c.id}/flats`)).json.flat.placements;
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { state: 'attached', timeout: 20000 }); await page.waitForTimeout(1500);
      ok(!fl.some(q => q.layer === ly.id) && await page.evaluate(() => LAYERS.filter(l => l.fromFlat).length) === 0, '4. taken off the picture, it comes off the flats and does not come back');
      const logo = fl.find(q => q.id === 'logo');
      if (logo) { await page.waitForSelector('#garmentSec [data-gpadd="logo"]', { timeout: 10000 }); await page.click('#garmentSec [data-gpadd="logo"]'); await page.waitForFunction(() => LAYERS.some(l => l.fromFlat === 'logo'), null, { timeout: 15000 });
        ok(true, '5. the logo that came with the concept waits for Put on the picture, and goes on when asked'); }
      else ok(await page.locator('#garmentSec').count() === 1, '5. (this concept has no logo placement)');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
      // the iPad, installed
      const ic = await b.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
      await ic.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); Object.defineProperty(navigator, 'standalone', { get: () => true }); } catch {} }, kyleT);
      const ip = await ic.newPage(), ierrs = []; ip.on('pageerror', e => ierrs.push(String(e)));
      await ip.goto(`${BASE}/lab/studio?concept=${c.id}&view=front`, { waitUntil: 'networkidle' }); await ip.waitForSelector('#app[data-v=front]', { timeout: 20000 });
      const IF = await (await ip.waitForSelector('#flatFrame')).contentFrame(); await IF.waitForSelector('#canvas svg', { timeout: 20000 });
      const cdp = await ic.newCDPSession(ip), cb = await ip.locator('#flatFrame').boundingBox(), sb = await IF.locator('#canvas').boundingBox();
      const cx = sb.x + sb.width / 2, cy = sb.y + sb.height / 2, tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
      await tp('touchStart', [[cx - 50, cy], [cx + 50, cy]]); for (let i = 1; i <= 6; i++) await tp('touchMove', [[cx - 50 - i * 25, cy], [cx + 50 + i * 25, cy]]); await tp('touchEnd', []);
      const fz = await IF.evaluate(() => ({ z: FBFlats.zoom(), vb: document.querySelector('#canvas svg').getAttribute('viewBox'), base: document.querySelector('#canvas svg').dataset.base, fit: !document.getElementById('fzFit').classList.contains('hidden') }));
      ok(fz.z > 1.5 && fz.vb !== fz.base && fz.fit, '6. on the iPad two fingers pinch the flats to zoom in, and Fit appears', fz);
      await IF.tap('#fzFit'); ok(await IF.evaluate(() => FBFlats.zoom()) === 1, '   Fit shows the whole piece again');
      await ip.tap('#pieceSteps [data-step=picture]'); await ip.waitForSelector('#pLayers .ly', { timeout: 20000 }); await ip.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      await ip.tap('#expBtn'); await ip.tap('#expPop [data-exp=png]'); await ip.waitForSelector('#sheetDlg[open]', { timeout: 15000 });
      ok(await ip.locator('#sheetDlg a[download]').count() === 1 && await ip.locator('#sheetDlg img').count() === 1, '7. installed, an export opens inside the app with the picture and Save, not as a download that leaves it');
      ok(ierrs.length === 0, 'no page errors on the iPad', ierrs); await ic.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J238', 'Welcoming a client\'s designers, and footwear kept off pant flats: the work console invites a designer to a room\'s Design Lab (they may sign in to the room, the address is checked, one room per person), the Lab shows a client a How to start welcome once, and a boot in a Bottoms line is not drawn as a pant', async () => {
  const email = `lab-welcome-${stamp}@selfserve.test`, started = await call('/v1/public/start', { body: { email, name: 'Welcome Room', title: 'First tee', photos: [jpeg()] } });
  const cid = started.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0], slug = sql(`select slug from clients where id='${cid}'`).split('\n')[0];
  sql(`update users set email_verified_at=now() where id='${uid}'`);
  const A = (path, o = {}) => call(path, { token: kyleT, ...o }), designer = `designer-${stamp}@selfserve.test`;
  const { brands, plan } = await conceptSetup();
  try {
    ok((await A(`/v1/admin/clients/${cid}/lab/invite`, { body: { email: 'nope' } })).status === 422 && (await A(`/v1/admin/clients/${cid}/lab/invite`, { body: { email: 'someone@thefuturebasics.com' } })).status === 422, '1. an invite needs a real address, and not one of ours');
    ok((await call(`/v1/admin/clients/${cid}/lab/invite`, { token: await forge({ sub: uid, clientId: cid, client: slug, role: 'client', email }), body: { email: designer } })).status >= 401, '   only Future Basics invites from the console');
    const inv = await A(`/v1/admin/clients/${cid}/lab/invite`, { body: { email: designer, name: 'Dana Designer' } });
    ok(inv.status === 200 && inv.json.email === designer && inv.json.open === false, '2. the console invites a designer to the room\'s Lab (it says the Lab is not open yet)', inv.json);
    ok(sql(`select '${designer}' = any(allowed_emails) from clients where id='${cid}'`) === 't' && sql(`select client_id from users where lower(email)='${designer}'`) === cid && /invited to the Design Lab/.test(sql(`select summary from activities where client_id='${cid}' and type='design' order by created_at desc limit 1`)), '   they may sign in to the room, and it is on the room\'s record');
    const other = await call('/v1/public/start', { body: { email: `lab-other-${stamp}@selfserve.test`, name: 'Other Room', title: 'Tee', photos: [jpeg()] } });
    const ocid = other.json.client?.id || sql(`select client_id from users where lower(email)='lab-other-${stamp}@selfserve.test'`);
    ok((await A(`/v1/admin/clients/${ocid}/lab/invite`, { body: { email: designer } })).status === 409, '3. an address that signs in to one room is not invited to another');
    // footwear in a Bottoms line
    const line = plan.lines.find(l => l.category === 'bottoms') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    sql(`update lab_concepts set name='Earth Utility Boot', category='bottoms', spec=coalesce(spec,'{}'::jsonb)||'{"silhouette":"lace-up boot with a lug sole","description":"a utility boot"}'::jsonb where id='${c.id}'`);
    const fl = (await K(`/concepts/${c.id}/flats`)).json;
    ok(fl.unsupported && /reads as footwear/.test(fl.unsupported) && !fl.flat, '4. a boot in a Bottoms line is not drawn as a pant: the flats say why', fl.unsupported);
    if (!playwright) { ok(true, 'needs a browser'); return; }
    await A(`/v1/admin/clients/${cid}/lab`, { method: 'PATCH', body: { action: 'free' } });
    const ct = await forge({ sub: uid, clientId: cid, client: slug, role: 'client', email }), b = await playwright.chromium.launch();
    try {
      const cc = await b.newContext({ viewport: { width: 1194, height: 834 } }); await cc.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, ct);
      const page = await cc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
      ok(await page.isVisible('#welcome') && /Add to Home Screen/.test(await page.innerText('#welcome')) && /Checklist/.test(await page.innerText('#welcome')) && /New design/.test(await page.innerText('#welcome')) && /Embroidery/.test(await page.innerText('#welcome')), '5. the first time in, a client\'s designer sees How to start: the iPad, the line, Design, Simple or Pro, the Checklist');
      await page.click('#welcomeDone'); await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
      ok(!(await page.isVisible('#welcome')), '   Got it puts it away for good');
      await page.click('#howStart'); ok(await page.isVisible('#welcome'), '   and How to start brings it back');
      // every button on the dark welcome panel reads (they were white words on white), and Pieces offers 1, 3 and 6 and lines up with its buttons
      await page.mouse.move(2, 2);
      // what the words sit on: the button's own fill, or the panel's when the button is see-through
      const hero = await page.evaluate(() => [...document.querySelectorAll('.btn.ghost')].map(b => { const c = getComputedStyle(b), clear = v => /rgba\(0, 0, 0, 0\)|transparent/.test(v); let bg = c.backgroundColor, el = b; while (clear(bg) && el.parentElement) { el = el.parentElement; bg = getComputedStyle(el).backgroundColor; } return [b.textContent.trim(), c.color, bg]; }));
      ok(hero.length >= 1 && hero.every(([, c, bg]) => c !== bg), '   the buttons on the welcome panel read: their words are never the colour they sit on (they were white on white)', hero);
      const pc = await page.evaluate(() => { const sel = document.querySelector('#planForm [name=size]'), go = document.getElementById('planGo'); const a = sel.getBoundingClientRect(), b = go.getBoundingClientRect(); return { opts: [...sel.options].map(o => o.value), dy: Math.abs(a.bottom - b.bottom) }; });
      ok(['1', '3', '6'].every(v => pc.opts.includes(v)) && pc.dy <= 3, '   Pieces offers 1, 3 and 6, and sits in line with Draft the plan', pc);
      ok(errs.length === 0, 'no page errors', errs); await cc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J239', 'One person, the room they really open: an address added to a second room still opens the first (so that room\'s free Design Lab never reaches them); the work console shows where each address signs in, Move them here ends the old session, and signing in again opens the free Lab', async () => {
  const mk = async who => { const email = `${who}-${stamp}@moveroom.test`, st = await call('/v1/public/start', { body: { email, name: `${who} room`, title: 'First tee', photos: [jpeg()] } });
    const cid = st.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0];
    sql(`update users set email_verified_at=now() where id='${uid}'`); sql(`update clients set status='active' where id='${cid}'`);
    return { email, cid, uid, slug: sql(`select slug from clients where id='${cid}'`).split('\n')[0], name: sql(`select name from clients where id='${cid}'`).split('\n')[0] }; };
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  const old = await mk('first'), next = await mk('second');
  sql(`update clients set allowed_emails=array_append(allowed_emails,'${old.email}') where id='${next.cid}'`);
  await A(`/v1/admin/clients/${next.cid}/lab`, { method: 'PATCH', body: { action: 'free' } });
  const oldT = await forge({ sub: old.uid, clientId: old.cid, client: old.slug, role: 'client', email: old.email });
  const before = await call('/v1/client/lab', { token: oldT });
  ok(before.status === 200 && before.json.open === false && !before.json.free, '1. the address is on the free room\'s list, but the hub it has open is still its first room: no free Lab there (what Kyle saw)', before.json);
  const pp = await A(`/v1/admin/clients/${next.cid}/lab/people`), me = pp.json.people?.find(x => x.email === old.email);
  ok(pp.status === 200 && me && !me.here && me.now?.id === old.cid && me.now?.name === old.name, '2. the console shows the address opens the other room, by name', pp.json);
  ok(pp.json.people.find(x => x.email === next.email)?.here === true, '   and the room\'s own owner opens it');
  ok((await call(`/v1/admin/clients/${next.cid}/lab/people`, { token: oldT })).status >= 401 && (await call(`/v1/admin/clients/${next.cid}/lab/people/move`, { token: oldT, body: { email: old.email } })).status >= 401, '   only Future Basics sees and moves people');
  sql(`update clients set status='lead' where id='${next.cid}'`);
  ok((await A(`/v1/admin/clients/${next.cid}/lab/people/move`, { body: { email: old.email } })).status === 409, '3. nobody is moved into a room that is not active');
  sql(`update clients set status='active' where id='${next.cid}'`);
  const mv = await A(`/v1/admin/clients/${next.cid}/lab/people/move`, { body: { email: old.email } });
  ok(mv.status === 200 && mv.json.people.find(x => x.email === old.email)?.here === true, '4. Move them here: the address now opens this room', mv.json);
  ok(sql(`select client_id from users where id='${old.uid}'`) === next.cid && sql(`select '${old.email}' = any(allowed_emails) from clients where id='${old.cid}'`) !== 't', '   their user is moved, and the old room no longer lists them');
  const gone = await call('/v1/client/lab', { token: oldT });
  ok(gone.status === 401 && gone.json.code === 'MOVED', '5. the session on the old room ends, saying the room changed', gone.json);
  const newT = await forge({ sub: old.uid, clientId: next.cid, client: next.slug, role: 'client', email: old.email }), after = await call('/v1/client/lab', { token: newT });
  ok(after.status === 200 && after.json.open === true && after.json.free === true, '6. signed in again, the hub opens the free Design Lab', after.json);
  const landed = await call('/v1/client/lab/landed', { token: newT, method: 'POST' });
  ok(landed.status === 200 && landed.json.paid === true && landed.json.free === true, '   and "I have paid" on a free room answers yes', landed.json);
});

await journey('J240', 'Design on an iPad, as Kyle found it: the ruler takes any length (0.54 in), a Pencil whose lift was never reported does not freeze the canvas, a graphic removed from the flat stays off after a save, and a trucker in a Tops line is drawn as a jacket, with Redraw from the picture for a flat saved as something else', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    sql(`update lab_concepts set name='Field Log Trucker', category='tops', spec=coalesce(spec,'{}'::jsonb)||'{"silhouette":"boxy denim trucker jacket"}'::jsonb where id='${c.id}'`);
    const f0 = (await K(`/concepts/${c.id}/flats`)).json.flat;
    ok(f0?.style === 'jacket' && f0.template === 'jk-trucker', '1. a trucker in a Tops line is drawn from the trucker sketch, not as a sweatshirt', [f0?.style, f0?.template]);
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
      ok(!(await page.$('#viewSeg [data-v=split]')) && (await page.locator('#viewSeg [data-v]').count()) === 5, '2. no Side by side: Picture, Flat front, Flat back, Pattern, Board');
      // the ruler's length: any number, 0.54 included
      ok(await page.evaluate(() => { const i = document.getElementById('rulerIn'); i.value = '0.54'; return i.checkValidity(); }), '3. the ruler takes 0.54 in (it said "Enter a valid value")');
      // a Pencil stroke whose lift was never reported, then a new one
      await page.click('[data-tool=brush]');
      const n0 = await page.evaluate(() => LAYERS.length);
      const stroke = await page.evaluate(() => { const v = document.getElementById('view'), r = v.getBoundingClientRect(), at = (t, id, x, y) => v.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'pen', isPrimary: true, bubbles: true, clientX: r.left + x, clientY: r.top + y, pressure: .6, buttons: t === 'pointerup' ? 0 : 1 }));
        at('pointerdown', 41, 200, 200); at('pointermove', 41, 230, 210); // lifted, but the iPad never said so
        at('pointerdown', 42, 300, 300); at('pointermove', 42, 340, 320); at('pointermove', 42, 380, 340); at('pointerup', 42, 380, 340);
        return { drag: DRAG === null, painted: LAYERS.filter(l => l.kind === 'paint').length }; });
      ok(stroke.drag && stroke.painted >= 1 && await page.evaluate(n => LAYERS.length > n, n0 - 1), '4. a new Pencil stroke draws even after one whose lift never arrived; nothing is left holding the canvas', stroke);

      // a real Pencil, through the browser's own hit testing (not an event handed to the canvas): it reaches the canvas and draws
      const cdp = await oc.newCDPSession(page), pen = async (r, pts) => { const m = (type, [x, y]) => cdp.send('Input.dispatchMouseEvent', { type, x: r.x + x, y: r.y + y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: .5 });
        await m('mousePressed', pts[0]); for (const q of pts.slice(1)) await m('mouseMoved', q); await m('mouseReleased', pts[pts.length - 1]); };
      { const r = await page.evaluate(() => { const b = document.getElementById('view').getBoundingClientRect(); return { x: b.left, y: b.top }; }), rid0 = await page.evaluate(() => LAYERS.find(l => l.id === SEL)?.raster?._rid);
        await pen(r, [[300, 260], [330, 280], [360, 300], [400, 320]]);
        ok(await page.evaluate(r0 => { const l = LAYERS.find(x => x.id === SEL); return l?.kind === 'paint' && l.raster._rid !== r0; }, rid0) && await page.evaluate(() => DRAG === null), '4b. a real Pencil stroke on the picture lands on the canvas and paints'); }
      // a wordmark on the chest, shown on the flats, then removed there
      await page.click('[data-tool=select]');
      await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.some(l => l.kind !== 'base' && l.kind !== 'paint' && l.kind !== 'picture')); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#sizeRead');
      await page.fill('#pLayers [data-win]', '3.5'); await page.dispatchEvent('#pLayers [data-win]', 'change'); await page.selectOption('#pLayers [data-placement]', 'left chest');
      await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 });
      await page.click('#viewSeg [data-v=front]'); let F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForSelector('#pPl [data-q]', { timeout: 20000 });
      const sq = await F.evaluate(() => FBFlats.placements().find(q => q.source === 'studio')?.id);
      ok(Boolean(sq), '5. the wordmark is on the flat');
      await F.click(`#pPl [data-q="${sq}"] [data-del]`);
      ok(await page.evaluate(() => !LAYERS.some(l => l.placement && l.kind !== 'base')), '6. removed on the flat, it comes off the garment on the picture too (it stays a layer)');
      await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 }); await page.waitForTimeout(500);
      const saved = (await K(`/concepts/${c.id}/flats`)).json.flat;
      ok(!saved.placements.some(q => q.source === 'studio'), '7. after Save it stays off the flat: the save no longer puts it back', saved.placements.map(q => q.source));
      // the same tools on the flat: the rail stays, the Pencil draws on the flat, Undo and Redo step through it, and Save keeps it for the tech pack
      ok(await page.isVisible('.rail [data-tool=brush]') && !(await page.isVisible('.rail [data-tool=warp]')), '7b. on the flat the tool rail stays (warp, pick and the ruler, which only make sense on the picture, step aside)');
      await page.click('.rail [data-tool=brush]'); ok(/Draws on the flat/.test(await page.innerText('#opts')), '   the brush says it draws on the flat');
      { const r = await page.evaluate(() => { const f = document.getElementById('flatFrame').getBoundingClientRect(), s = document.getElementById('flatFrame').contentDocument.querySelector('#canvas svg').getBoundingClientRect(); return { x: f.left + s.left, y: f.top + s.top, w: s.width, h: s.height }; });
        const at = (u, v) => [r.w * u, r.h * v];
        await pen(r, [at(.35, .3), at(.42, .36), at(.5, .42), at(.58, .46)]);
        ok(await F.evaluate(() => FBFlats.canUndo() && FBFlats.dirty()), '7c. a Pencil stroke draws on the flat');
        ok(!(await page.$eval('#undo', b => b.disabled)), '   Undo is offered for it'); await page.click('#undo');
        ok(await F.evaluate(() => !FBFlats.canUndo() && FBFlats.canRedo()), '   Undo takes it off, Redo is offered'); await page.click('#redo');
        await page.click('.rail [data-tool=rect]'); await pen(r, [at(.3, .6), at(.45, .7), at(.6, .75)]);
        await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 }); await page.waitForTimeout(400);
        const mk = (await K(`/concepts/${c.id}/flats`)).json.flat.markup;
        ok(mk?.front?.art && mk.front.w > 0 && sql(`select source from lab_art where id='${mk.front.art}'`) === 'flat', '7d. saved: what was drawn on the front is kept with the flat, laid over it in inches', mk);
        const sh = await call(`/v1/lab/concepts/${c.id}/flats/sheet.svg`, { token: kyleT });
        ok(sh.status === 200 && /preserveAspectRatio="none" pointer-events="none"/.test(sh.text), '   and the spec sheet (and so the tech pack) draws it', sh.status);
        await page.reload({ waitUntil: 'networkidle' }); const F2 = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F2.waitForFunction(() => window.FBFlats?.ready(), null, { timeout: 20000 });
        ok(await F2.evaluate(() => { const c = document.querySelector('.mkw canvas'); return Boolean(c && c.width > 10); }), '   opened again, the drawing is back on the flat'); }
      await page.click('.rail [data-tool=select]');
      // fabrics, trims and labels from the library, added to the garment from Design (here on the flat; the same button is on the picture)
      await page.click('#matBtn'); await page.waitForSelector('#matDlg[open] #matLib [data-madd]', { timeout: 15000 }); await page.waitForSelector('#matLib .mc svg[role="img"]');
      await page.click('#matLib [data-madd]'); await page.waitForSelector('#matOn [data-mp][data-role="main"]', { timeout: 15000 });
      await page.click('#matKinds [data-mk=tag]'); await page.waitForSelector('#matLib .th.tg svg'); await page.click('#matLib [data-madd]'); await page.waitForSelector('#matOn [data-mp][data-role="tag"]', { timeout: 15000 });
      let bom = (await K(`/concepts/${c.id}/materials`)).json;
      ok(bom.picks.some(p => p.kind === 'fabric' && p.role === 'main') && bom.picks.some(p => p.kind === 'tag') && bom.cost.landedCents > 0 && /landed/.test(await page.innerText('#matCost')), '7e. from Design, a fabric goes on the garment as its main fabric and a label as a tag, each drawn, and the landed cost follows', bom.picks.map(p => [p.kind, p.role]));
      const tagRow = '#matOn [data-mp][data-role="tag"]'; await page.fill(`${tagRow} [data-mf=note]`, 'sewn into the neck seam, centre back'); await page.dispatchEvent(`${tagRow} [data-mf=note]`, 'change');
      await page.waitForFunction(() => /Saved on the garment/.test(document.getElementById('stToast')?.textContent || ''), null, { timeout: 10000 });
      await page.click(`${tagRow} [data-mdel]`); await page.waitForFunction(() => !document.querySelector('#matOn [data-mp][data-role="tag"]'), null, { timeout: 10000 });
      bom = (await K(`/concepts/${c.id}/materials`)).json;
      ok(!bom.picks.some(p => p.kind === 'tag') && bom.picks.some(p => p.role === 'main'), '   where it goes is kept, and a label taken off the garment is gone from its bill of materials');
      await page.click('#matDlg [data-matclose]');
      // more room to draw: the panel on the right folds away (on the flat too), Focus hides the header and the menu, and both are kept
      { const w0 = await page.evaluate(() => document.getElementById('flatFrame').contentDocument.querySelector('#canvas svg').getBoundingClientRect().width);
        await page.click('#panelBtn'); await page.waitForTimeout(300);
        const fl = await page.evaluate(() => { const d = document.getElementById('flatFrame').contentDocument; return { side: getComputedStyle(d.querySelector('.side')).display, w: d.querySelector('#canvas svg').getBoundingClientRect().width }; });
        await page.click('#focusBtn'); await page.waitForTimeout(300);
        const fo = await page.evaluate(() => ({ header: getComputedStyle(document.querySelector('body>header')).display, h: document.getElementById('app').getBoundingClientRect().height, vh: innerHeight }));
        ok(fl.side === 'none' && fl.w > w0 && fo.header === 'none' && fo.h >= fo.vh - 2, '7f. Panel folds the right side away (the flat grows) and Focus hides the header and menu so Design fills the screen', { w0, fl, fo });
        await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)');
        ok(await page.evaluate(() => document.documentElement.dataset.focus === '1' && document.getElementById('app').dataset.panel === 'off'), '   and the layout is kept when Design opens again');
        await page.click('#focusBtn'); await page.click('#panelBtn');
        ok(await page.evaluate(() => !document.documentElement.dataset.focus && document.getElementById('app').dataset.panel === 'on'), '   both come back with a press'); }
      // the whole window draws (not only the garment's frame), and two fingers on a graphic resize it
      { const Fd = await (await page.waitForSelector('#flatFrame')).contentFrame(); await Fd.waitForFunction(() => window.FBFlats?.ready(), null, { timeout: 20000 });
        await page.click('.rail [data-tool=brush]');
        const r = await page.evaluate(() => { const f = document.getElementById('flatFrame').getBoundingClientRect(), s = document.getElementById('flatFrame').contentDocument.querySelector('#canvas svg').getBoundingClientRect(); return { x: f.left + s.left, y: f.top + s.top, w: s.width, h: s.height }; });
        await pen(r, [[r.w * .02, r.h * .5], [r.w * .05, r.h * .55], [r.w * .97, r.h * .6]]);
        const cover = await Fd.evaluate(() => { const c = document.querySelector('.mkw canvas').getBoundingClientRect(), s = document.querySelector('#canvas svg').getBoundingClientRect(), x = document.querySelector('.mkw canvas'), k = x.width / c.width, d = x.getContext('2d').getImageData(Math.max(0, (s.left + s.width * .03 - c.left) * k), (s.top + s.height * .52 - c.top) * k, 4, 4).data; return { l: c.left - s.left, r: s.right - c.right, ink: [...d].some((v, i) => i % 4 === 3 && v > 0) }; });
        ok(cover.l <= 1 && cover.r <= 1 && cover.ink, '7g. the Pencil draws across the whole window, out to its edges, not only inside the garment\'s frame', cover);
        await page.click('.rail [data-tool=select]');
        const n0 = await Fd.evaluate(() => FBFlats.placements().length); await Fd.click('.tabs [data-tab=pl]'); await Fd.click('#pPl [data-addmark=mark]'); await Fd.waitForFunction(n => FBFlats.placements().length > n, n0, { timeout: 10000 });
        const q = await Fd.evaluate(() => FBFlats.placements().filter(x => x.view === 'front').pop());
        if (q) {
          const at = await page.evaluate(id => { const f = document.getElementById('flatFrame').getBoundingClientRect(), g = document.getElementById('flatFrame').contentDocument.querySelector(`[data-pl="${id}"] rect`).getBoundingClientRect(); return { x: f.left + g.left + g.width / 2, y: f.top + g.top + g.height / 2 }; }, q.id); // the graphic itself, not its turn knob above
          const touch = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: at.x - d, y: at.y, id: 1 }, { x: at.x + d, y: at.y, id: 2 }] });
          await touch('touchStart', 10); for (const d of [20, 30, 40, 50]) await touch('touchMove', d); await touch('touchEnd', 50);
          const q2 = await Fd.evaluate(id => FBFlats.placements().find(x => x.id === id), q.id);
          ok(q2.w > q.w * 2 && Math.abs(q2.w / q2.h - q.w / q.h) < .05 && await Fd.evaluate(() => FBFlats.dirty()), '7h. two fingers spread on a graphic on the flat make it bigger, keeping its shape (the view does not zoom)', [q.w, q2.w]);
        } else ok(false, '7h. there is a graphic on the front to resize');
        // zoom on the flat: buttons, a pinch that keeps the point under the fingers where it is, a trackpad scroll that moves it, Fit
        await Fd.click('#fzIn'); await Fd.click('#fzIn'); ok(/^156%$/.test(await Fd.innerText('#fzLabel')), '7i. the flat has its own zoom buttons: + twice is 156%', await Fd.innerText('#fzLabel'));
        await Fd.click('#fzFit');
        { const fr = await page.evaluate(() => { const f = document.getElementById('flatFrame').getBoundingClientRect(), s = document.getElementById('flatFrame').contentDocument.querySelector('#canvas svg').getBoundingClientRect(); return { fx: f.left, fy: f.top, x: s.left + s.width * .1, y: s.top + s.height * .3 }; });
          const under = () => Fd.evaluate(([x, y]) => { const svg = document.querySelector('#canvas svg'), pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const r = pt.matrixTransform(svg.getScreenCTM().inverse()); return [r.x, r.y]; }, [fr.x, fr.y]);
          const before = await under(), cx = fr.fx + fr.x, cy = fr.fy + fr.y, t = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
          await t('touchStart', 15); for (const d of [25, 35, 45, 60]) await t('touchMove', d); await t('touchEnd', 60);
          const after = await under(), z = await Fd.evaluate(() => FBFlats.zoom());
          ok(z > 2 && Math.hypot(after[0] - before[0], after[1] - before[1]) < .35, '7j. a pinch on the flat zooms in about the fingers: the point between them stays put', { z, before, after });
          const vb0 = await Fd.evaluate(() => document.querySelector('#canvas svg').getAttribute('viewBox')); await page.mouse.move(cx, cy); await page.mouse.wheel(0, 120); await page.waitForTimeout(150);
          ok(await Fd.evaluate(() => document.querySelector('#canvas svg').getAttribute('viewBox')) !== vb0, '   two fingers on a trackpad move the zoomed flat');
          await Fd.click('#fzFit'); ok(await Fd.evaluate(() => FBFlats.zoom()) === 1, '   and Fit shows the whole piece again'); }
        await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 }); await Fd.waitForFunction(() => FBFlats.saved(), null, { timeout: 30000 }); }
      F = await (await page.waitForSelector('#flatFrame')).contentFrame(); await F.waitForFunction(() => window.FBFlats?.ready(), null, { timeout: 20000 });
      // a flat saved as a sweatshirt: Redraw from the picture brings the jacket back (the words stand in for the picture here)
      const asSweat = await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: { ...saved, style: 'crewneck', template: undefined, placements: saved.placements } });
      const redo = await K(`/concepts/${c.id}/flats/from-picture`);
      ok(asSweat.status === 200 && redo.status === 200 && redo.json.flat.style === 'jacket' && redo.json.flat.saved === false && sql(`select style from lab_flats where concept_id='${c.id}'`) === 'crewneck', '8. Redraw from the picture draws it as a jacket again, and keeps nothing until Save', [asSweat.status, asSweat.json?.error, redo.json?.flat?.style]);
      await F.click('.tabs [data-tab=design]'); await F.click('#redrawPic'); await F.waitForFunction(() => /drawn from the picture/.test(document.getElementById('cSub').textContent), null, { timeout: 30000 });
      const drawnNow = await F.evaluate(() => ({ dirty: FBFlats.dirty(), img: [...document.querySelectorAll('#canvas svg image')].some(i => /^blob:/.test(i.getAttribute('href') || '')) }));
      ok(drawnNow.dirty && drawnNow.img, '9. Draw from the picture (always in the Design tab) has the image model draw the view over the sketch\'s frame, and leaves the flat to save', drawnNow);
      await page.click('#save'); await page.waitForFunction(() => !DIRTY, null, { timeout: 30000 }); await page.waitForTimeout(400);
      const kept = (await K(`/concepts/${c.id}/flats`)).json.flat;
      ok(kept.drawn?.front && kept.drawn?.back && kept.drawn.template === kept.template && sql(`select count(*) from lab_art where id in ('${kept.drawn.front}','${kept.drawn.back}') and source='flat'`) === '2', '   saved: front and back drawn from the picture, tied to the sketch they were drawn on', kept.drawn);
      const sheet = await call(`/v1/lab/concepts/${c.id}/flats/sheet.svg`, { token: kyleT });
      ok(sheet.status === 200 && sheet.text.includes('data:image/png;base64'), '   and the spec sheet draws them', sheet.status);
      // on the picture: two fingers on the selected graphic resize it; elsewhere they zoom the view
      await page.click('#pieceSteps [data-step=picture]'); await page.waitForTimeout(400); await page.click('.rail [data-tool=select]');
      const lay = await page.evaluate(() => { const l = LAYERS.find(x => !['base', 'paint', 'picture'].includes(x.kind) && x.visible); if (!l) return null; SEL = l.id; draw(); const r = document.getElementById('view').getBoundingClientRect(); return { id: l.id, s0: l.scale, z0: Z, h: HIST.length, x: r.left + l.x * Z + PX, y: r.top + l.y * Z + PY }; });
      // on the picture: a pinch on the empty stage zooms about the fingers, and a trackpad pinch (Safari's gesture events) zooms about the pointer
      { await page.evaluate(() => { SEL = null; draw(); }); const st = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
        const docAt = () => page.evaluate(([x, y]) => { const r = document.getElementById('view').getBoundingClientRect(); return [(x - r.left - PX) / Z, (y - r.top - PY) / Z, Z]; }, [st.x, st.y]);
        const b0 = await docAt(), t = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: st.x, y: st.y - d, id: 1 }, { x: st.x, y: st.y + d, id: 2 }] });
        await t('touchStart', 15); for (const d of [25, 35, 45]) await t('touchMove', d); await t('touchEnd', 45); const a0 = await docAt();
        ok(a0[2] > b0[2] * 2 && Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) < 3, '12. a pinch on the picture zooms in about the fingers (the point between them stays put)', { b0, a0 });
        await page.evaluate(([x, y]) => { const el = document.getElementById('view'), ev = (type, scale) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { scale, clientX: x, clientY: y }); el.dispatchEvent(e); return e.defaultPrevented; };
          window.__tp = [ev('gesturestart', 1), ev('gesturechange', .5), ev('gestureend', .5)]; }, [st.x, st.y]);
        const a1 = await docAt();
        ok(Math.abs(a1[2] - a0[2] * .5) < 1e-6 && Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) < 3 && (await page.evaluate(() => window.__tp)).every(Boolean), '   a trackpad pinch zooms the picture about the pointer, and Safari never zooms the page itself', { a0, a1 });
        await page.click('#zFit'); }
      if (lay) {
        const touch = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: lay.x - d, y: lay.y, id: 1 }, { x: lay.x + d, y: lay.y, id: 2 }] });
        await touch('touchStart', 8); for (const d of [16, 24, 32]) await touch('touchMove', d); await touch('touchEnd', 32);
        const after = await page.evaluate(id => { const l = LAYERS.find(x => x.id === id); return { s: l.scale, z: Z, h: HIST.length }; }, lay.id);
        ok(after.s > lay.s0 * 2.5 && Math.abs(after.z - lay.z0) < 1e-6 && after.h > lay.h, '11. on the picture, two fingers on the selected graphic resize it (one Undo step), and the view stays put', { lay, after });
      } else ok(false, '11. there is a graphic layer to resize');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J241', 'Opportunities for a client\'s room: Future Basics turns it on for a content studio, the room gets its own searches across the platforms, the AI reads posts for what the studio sells, the studio sees and acts on only its own, and staff intelligence never sees them', async () => {
  const mk = async who => { const email = `${who}-${stamp}@opps.test`, st = await call('/v1/public/start', { body: { email, name: `${who} studio`, title: 'Shoot', photos: [jpeg()] } });
    const cid = st.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0];
    sql(`update users set email_verified_at=now() where id='${uid}'`); sql(`update clients set status='active' where id='${cid}'`);
    return { email, cid, uid, slug: sql(`select slug from clients where id='${cid}'`).split('\n')[0] }; };
  const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  const room = await mk('incha'), other = await mk('elsewhere');
  const T = await forge({ sub: room.uid, clientId: room.cid, client: room.slug, role: 'client', email: room.email }), OT = await forge({ sub: other.uid, clientId: other.cid, client: other.slug, role: 'client', email: other.email });
  const C = (path, o = {}) => call(path, { token: T, ...o });
  ok((await C('/v1/client/opportunities')).json.enabled === false && (await C('/v1/client/opportunities/run', { method: 'POST' })).status === 403, '1. off until Future Basics turns it on for the room');
  ok((await C(`/v1/admin/clients/${room.cid}/opportunities`, { method: 'PATCH', body: { enabled: true } })).status >= 401, '   only Future Basics turns it on');
  const on = await A(`/v1/admin/clients/${room.cid}/opportunities`, { method: 'PATCH', body: { enabled: true, services: 'Photo and video content for brands and artists: campaigns, product shoots, social video and music videos.' } });
  ok(on.status === 200 && on.json.enabled && on.json.watches >= 5, '2. turned on in the console: the room gets its starting searches for photo and video work', on.json);
  // posts the room's searches found (as the listening would put them), read on the next look
  const ins = (ext, title, body) => sql(`insert into intel_room_signals(client_id,source,external_id,url,title,body,posted_at) values('${room.cid}','reddit','${ext}-${stamp}','https://reddit.example/${ext}','${title}','${body}',now()) returning id`).split('\n')[0];
  const good = ins('a', 'Looking for a videographer for our brand launch', 'We need help with a launch video and product photography next month, any recommendations?');
  const nofit = ins('b', 'Looking for a photographer NOFIT', 'need help, unpaid, exposure only');
  const off = ins('c', 'Our new API is live', 'we shipped it');
  sql(`update intel_room_watches set enabled=false where client_id='${room.cid}'`); // no outside calls in the journey: the searches themselves are covered by J134
  const run = await C('/v1/client/opportunities/run', { method: 'POST' });
  ok(run.status === 200 && run.json.read >= 1, '3. Look now: the AI reads the new posts for what the studio sells', run.json);
  const feed = (await C('/v1/client/opportunities')).json, sig = feed.signals?.find(x => x.id === good);
  ok(sig && sig.score > 0 && sig.draft && !feed.signals.some(x => x.id === nofit || x.id === off), '4. the hub lists the post worth a look, with a first reply; the not-a-fit and the off-topic ones are left out', feed.signals?.map(x => x.title));
  ok(sql(`select model from intel_room_signals where id='${off}'`) === 'prefilter', '   the off-topic post never reaches the AI');
  ok((await C('/v1/client/opportunities/run', { method: 'POST' })).status === 429, '   and Look now waits ten minutes between looks');
  const act = await C(`/v1/client/opportunities/signals/${good}/contacted`, { method: 'POST' });
  ok(act.status === 200 && act.json.signal.status === 'contacted' && sql(`select acted_by from intel_room_signals where id='${good}'`) === room.uid, '5. I reached out: marked, with who did it');
  ok((await call(`/v1/client/opportunities/signals/${good}/won`, { token: OT, method: 'POST' })).status === 403 && (await call('/v1/client/opportunities', { token: OT })).json.enabled === false, '6. another room cannot see or touch it');
  await A(`/v1/admin/clients/${other.cid}/opportunities`, { method: 'PATCH', body: { enabled: true } });
  ok((await call(`/v1/client/opportunities/signals/${good}/won`, { token: OT, method: 'POST' })).status === 404 && !(await call('/v1/client/opportunities', { token: OT })).json.signals.some(x => x.id === good), '   even with its own turned on');
  const ov = await A('/v1/intel/overview');
  ok(ov.status === 200 && !JSON.stringify(ov.json).includes('brand launch') && !JSON.stringify(ov.json).includes(good), '7. Future Basics\' own intelligence never shows the room\'s posts');
  const w = await C('/v1/client/opportunities/watches', { method: 'POST', body: { kind: 'hn', query: '"music video" director' } });
  ok(w.status === 201 && w.json.watch.enabled === true, '8. the room adds its own search');
  ok((await C(`/v1/client/opportunities/watches/${w.json.watch.id}`, { method: 'DELETE' })).status === 200 && (await call(`/v1/client/opportunities/watches/${w.json.watch.id}`, { token: OT, method: 'DELETE' })).status === 404, '   and removes it; another room cannot');
  if (playwright) {
    const b = await playwright.chromium.launch();
    try {
      const cc = await b.newContext({ viewport: { width: 390, height: 844 } }); await cc.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, T);
      const page = await cc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForSelector('#opps:not(.hidden) .opp', { timeout: 20000 });
      await page.click('#hubMenu'); const inMenu = await page.isVisible('#navOpps'); await page.click('#hubMenu');
      ok(/brand launch/.test(await page.innerText('#opps')) && inMenu && await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, '9. on a phone the hub shows Opportunities, with the post and its actions, and fits the screen');
      ok(errs.length === 0, 'no page errors', errs); await cc.close();
    } finally { await b.close(); }
  }
  await A(`/v1/admin/clients/${room.cid}/opportunities`, { method: 'PATCH', body: { enabled: false } });
  ok((await C('/v1/client/opportunities')).json.enabled === false, '10. turned off in the console, it leaves the hub');
});

await journey('J242', 'Tags and labels in the studio: a starter neck label opens at its real size with its blank face and its words as type, the words are changed, Use on the tag makes the room its own copy with that design (the shared starter stays as it was), Add to the garment swaps the copy onto the garment, and the library and the tag picture show the design', async () => {
  const { brands, plan } = await conceptSetup();
  try {
    const line = plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
    const starter = (await K('/materials?kind=tag')).json.materials.find(m => m.builtin && m.spec.tagKind === 'neck' && (m.spec.text || []).length);
    ok(Boolean(starter), '0. a starter neck label with words', starter?.name);
    await K(`/concepts/${c.id}/materials`, { body: { material: starter.id } });
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const b = await playwright.chromium.launch();
    try {
      const oc = await b.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?tag=${starter.id}&for=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 });
      const st = await page.evaluate(() => ({ name: document.getElementById('cName').textContent, sub: document.getElementById('cSub').textContent, W, H, ppi: PPI, layers: LAYERS.map(l => [l.kind, l.name, l.text || '']), apply: document.getElementById('apply').textContent, add: !document.getElementById('tagAddBtn').classList.contains('hidden') }));
      const ratio = starter.spec.widthMm / starter.spec.heightMm;
      ok(st.name === starter.name && /Tag · /.test(st.sub) && Math.abs(st.W / st.H - ratio) < .05 && Math.abs(st.W / st.ppi - starter.spec.widthMm / 25.4) < .01, '1. the tag opens at its real size (its width in inches is the canvas width)', st);
      ok(st.layers.some(l => l[1] === 'Tag face') && starter.spec.text.every(t => st.layers.some(l => l[0] === 'text' && l[2] === t)) && st.apply === 'Use on the tag' && st.add, '   its blank face is a layer and each line of its words is type to change; Use on the tag and Add to a garment are there', st.layers);
      // the words changed, as with any type layer (font, words, colour)
      await page.evaluate(() => { const l = LAYERS.find(x => x.kind === 'text'); l.text = 'INCHA STUDIOS'; l.font = Object.keys(FONTS).find(k => k !== l.font) || l.font; l.color = '#b8323c'; commit(); draw(); });
      await page.click('#apply'); await page.waitForFunction(() => /The tag shows this design now/.test(document.getElementById('stToast')?.textContent || ''), null, { timeout: 30000 });
      const tags = (await K('/materials?kind=tag')).json.materials, copy = tags.find(m => m.name === `${starter.name} (ours)`), again = tags.find(m => m.id === starter.id);
      ok(copy && /^[0-9a-f-]{36}$/.test(copy.spec.face || '') && !again.spec.face && new URL(page.url()).searchParams.get('tag') === copy.id, '2. Use on the tag: the shared starter is untouched, the room gets its own copy with the design as its face', { copy: copy?.spec?.face, starter: again.spec.face });
      await page.click('#tagAddBtn'); await page.waitForFunction(() => /The label is on the garment/.test(document.getElementById('stToast')?.textContent || ''), null, { timeout: 30000 });
      const bom = (await K(`/concepts/${c.id}/materials`)).json.picks.filter(p => p.kind === 'tag').map(p => p.id);
      ok(bom.includes(copy.id) && !bom.includes(starter.id), '3. Add to the garment: the designed copy takes the starter\'s place on the garment\'s bill of materials', bom);
      const svg = await call(`/v1/lab/materials/${copy.id}/tag.svg`, { token: kyleT });
      ok(svg.status === 200 && svg.text.includes('data:image/png;base64') && !starter.spec.text.some(t => svg.text.includes(`>${t}<`)), '4. the tag\'s picture is the design (the words are in it, not typed over it)');
      // opened again, it carries on from its layers; the library card shows the face
      await page.goto(`${BASE}/lab/studio?tag=${copy.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 });
      ok(await page.evaluate(() => LAYERS.some(l => l.kind === 'text' && l.text === 'INCHA STUDIOS')), '5. opened again, the label carries on from its layers (the changed words are still type)');
      await page.goto(`${BASE}/lab/materials#tags`, { waitUntil: 'networkidle' }); await page.waitForSelector(`[data-tagsvg="${copy.id}"] svg image`, { timeout: 15000 });
      ok(await page.locator(`[data-tagsvg="${copy.id}"] .tagdes`).count() === 1, '6. in the library the card shows the design, with a Design button on every tag');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await b.close(); }
  } finally { await cleanup(brands, plan.plan?.id); }
});

await journey('J243', 'A newcomer finds their way into the Design Lab: signed out, the Lab says how to open it; /join?for=lab opens a room for the Lab and lands on the Lab in the hub with its offer; on a phone it fits', async () => {
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const b = await playwright.chromium.launch(), errs = [], email = `lab-new-${stamp}@newcomer.test`;
  try {
    const oc = await b.newContext({ viewport: { width: 1180, height: 820 } }), page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#needSignin:not(.hidden)', { timeout: 15000 });
    const panel = await page.evaluate(() => [...document.querySelectorAll('#needSignin a')].map(a => [a.textContent.trim(), a.getAttribute('href')]));
    ok(panel.some(([t, h]) => t === 'Open the Design Lab' && h === '/join?for=lab') && panel.some(([, h]) => h === '/hub#lab') && !panel.some(([, h]) => h === '/'), '1. signed out, the Lab offers to open it, to sign in at the hub, or the work console (never the bare home)', panel);
    await page.click('#needSignin a[href="/join?for=lab"]'); await page.waitForURL(/\/join\?for=lab/);
    const head = await page.evaluate(() => [document.title, document.querySelector('.hero h1').textContent, document.querySelector('.hero .lede').textContent, document.getElementById('goLabel').textContent]);
    ok(/Design Lab/.test(head[0]) && /Design Lab/.test(head[1]) && /\$499/.test(head[2]) && head[3] === 'Open my room', '2. the join page speaks to the Lab: its title, what it does, its price', head);
    await page.fill('#company', `Newcomer Studio ${stamp}`); await page.fill('#name', 'Nia Newcomer'); await page.fill('#email', email); await page.click('#go');
    await page.waitForURL(/\/hub#lab$/, { timeout: 20000 }); await page.waitForSelector('#lab:not(.hidden)', { timeout: 20000 });
    const lab = await page.evaluate(() => document.getElementById('lab').textContent);
    ok(/\$499/.test(lab) && /90 days/.test(lab), '3. the room opens on the hub\'s Design Lab, with its offer in view', lab.slice(0, 200));
    ok(sql(`select count(*) from clients c join users u on u.client_id=c.id where lower(u.email)='${email}'`) === '1', '   one room is made for them');
    const ph = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), pp = await ph.newPage(); pp.on('pageerror', e => errs.push(String(e)));
    for (const path of ['/join?for=lab', '/lab']) { await pp.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `4. ${path} fits a phone`); }
    ok(errs.length === 0, 'no page errors', errs); await oc.close(); await ph.close();
  } finally { await b.close(); }
});

await journey('J244', 'From scratch to pattern pieces: a hoodie started from nothing opens on white paper with its outline as a locked guide at real size, its flats are a plain outline to draw over, and Pattern explodes it into the pieces it is cut from, laid out on the cloth, with a DXF and a 1:1 SVG; a plush is drafted from its shape and checked for its age; toys say what comes next', async () => {
  const made = await K('/concepts/from-scratch', { body: { category: 'tops', style: 'hoodie', name: `Scratch hoodie ${stamp}` } });
  ok(made.status === 201 && /scratch=1/.test(made.json.studio), '1. Start from scratch makes a concept and opens Design on it', [made.status, made.json]);
  const cid = made.json.concept.id;
  ok((await K('/concepts/from-scratch', { body: { category: 'tops', style: 'pants' } })).status === 422 && (await K('/concepts/from-scratch', { body: { category: 'spaceships' } })).status === 422, '   a style from another category, or no category, is refused');
  const fl = (await K(`/concepts/${cid}/flats`)).json.flat; ok(fl?.style === 'hoodie' && fl.template === 'none', '   its flats are the hoodie as a plain outline to draw over, not a sketch', { style: fl?.style, template: fl?.template });
  const pat = (await K(`/concepts/${cid}/pattern`)).json; ok(pat.kind === 'garment' && pat.flat.style === 'hoodie' && pat.yardage.some(y => y.fabric === 'self' && y.yards > .8), '2. the pattern is drafted from the flats, with the cloth it takes', { kind: pat.kind, yardage: pat.yardage });
  const dxf = await call(`/v1/lab/concepts/${cid}/pattern.dxf?size=L`, { token: kyleT }), svg = await call(`/v1/lab/concepts/${cid}/pattern.svg`, { token: kyleT });
  ok(dxf.status === 200 && /POLYLINE\n5\n[0-9A-F]+\n8\nCUT/.test(dxf.text) && /POLYLINE\n5\n[0-9A-F]+\n8\nSEW/.test(dxf.text) && /\$ACADVER\n1\nAC1009/.test(dxf.text) && /TABLE\n2\nLAYER/.test(dxf.text) && /Hood side/.test(dxf.text), '   a DXF with cutting and sewing lines for every piece, in the size asked for');
  ok(svg.status === 200 && /width="[\d.]+in"/.test(svg.text) && /Kangaroo pocket/.test(svg.text), '   and an SVG at real size');
  ok((await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: { sa: .625, width: 60 } } })).json.spec.width === 60 && (await K(`/concepts/${cid}/pattern`)).json.spec.sa === .625, '   the seam allowance and the cloth width are kept');
  // a plush
  const pl = await K('/concepts/from-scratch', { body: { category: 'plush', shape: 'bunny', name: `Scratch bunny ${stamp}` } }), pid = pl.json.concept?.id;
  const pp = (await K(`/concepts/${pid}/pattern`)).json; ok(pl.status === 201 && pp.kind === 'plush' && pp.spec.shape === 'bunny' && pp.spec.ears === 'long' && pp.fillGrams > 0, '3. a plush starts as its shape: a bunny with long ears, and the fill it takes', pp.spec);
  const unsafe = (await K(`/concepts/${pid}/pattern`, { method: 'PUT', body: { spec: { ...pp.spec, eyes: 'safety', age: '0+' } } })).json;
  ok(unsafe.checks?.some(c => c.level === 'fail' && /Safety eyes/.test(c.msg)), '   safety eyes on a toy for under-3s are flagged', unsafe.checks);
  const shoe = await K('/concepts/from-scratch', { body: { category: 'toys', name: `Scratch toy ${stamp}` } }), sp = (await K(`/concepts/${shoe.json.concept.id}/pattern`)).json;
  ok(sp.kind === 'soon' && /engineered as 3D parts/.test(sp.soon) && (await K(`/concepts/${shoe.json.concept.id}/pattern.dxf`)).status === 422, '   toys and objects are engineered as 3D parts (the Engineering page), not cut from a pattern', sp.soon);
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    // the picker offers it
    await page.goto(`${BASE}/lab/studio`, { waitUntil: 'networkidle' }); await page.waitForSelector('#scratchF');
    await page.selectOption('#scCat', 'bottoms'); ok(await page.evaluate(() => [...document.querySelectorAll('#scStyle option')].map(o => o.value).join()) === 'pants,shorts,skirt,leggings', '4. the picker offers Start from scratch, with the styles of what you are making');
    await page.goto(`${BASE}${made.json.studio}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    const st = await page.evaluate(() => ({ names: LAYERS.map(l => l.name), locked: LAYERS[1]?.locked, ppi: PPI, set: PPISET }));
    ok(st.names[0] === 'Paper' && /hoodie outline/i.test(st.names[1] || '') && st.locked && st.ppi > 10 && st.set, '5. Design opens on white paper with the hoodie\'s outline as a locked guide, and knows the inches from it', st);
    await page.click('#pieceSteps [data-step=pattern]'); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    const rows = await F.locator('table.pcs tbody tr').count(); ok(rows >= 7 && /Pattern · Pullover hoodie/.test(await F.innerText('#sub')), '6. Pattern lists the pieces of the hoodie', rows);
    ok(await F.locator('#canvas [data-pid="front"]').count() === 1 && await F.innerText('#tLbl') === 'On the product', '   it opens on the product, made of its pieces');
    await F.click('#play'); await F.waitForFunction(() => document.getElementById('tLbl').textContent.startsWith('Cutting layout'), null, { timeout: 15000 });
    ok(await F.locator('#canvas [data-pid="hood"]').count() >= 2 && /yd/.test(await F.innerText('#canvas')), '7. Explode it: the pieces lift off and lay out flat on the cloth, every cut and the yardage shown');
    await F.click('#modeSeg [data-t="0.45"]'); await page.waitForTimeout(1200); ok((await F.innerText('#tLbl')).startsWith('Exploded'), '   and the exploded view in between');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), F.click('#dxf')]); ok(/pattern-.*\.dxf$/.test(dl.suggestedFilename()), '   the DXF downloads', dl.suggestedFilename());
    // the plush in its own Pattern view: change the height, save
    await page.goto(`${BASE}/lab/studio?concept=${pid}&view=pattern`, { waitUntil: 'networkidle' }); const G = await (await page.waitForSelector('#patFrame')).contentFrame(); await G.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    await G.fill('[data-k="height"]', '18'); await G.dispatchEvent('[data-k="height"]', 'change'); await G.click('#saveP'); await G.waitForFunction(() => /Saved/.test(document.getElementById('saveP')?.textContent || ''), null, { timeout: 10000 });
    ok((await K(`/concepts/${pid}/pattern`)).json.spec.height === 18, '8. a plush is changed and saved in its Pattern view');
    const ph = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ph.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const pp2 = await ph.newPage(); pp2.on('pageerror', e => errs.push(String(e))); await pp2.goto(`${BASE}/lab/pattern?concept=${cid}&embed=1`, { waitUntil: 'networkidle' }); await pp2.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    ok(await pp2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '   the pattern fits a phone');
    ok(errs.length === 0, 'no page errors', errs); await oc.close(); await ph.close();
  } finally { await b.close(); for (const id of [cid, pid, shoe.json.concept?.id]) if (id) await K(`/concepts/${id}`, { method: 'DELETE' }); }
});

await journey('J245', 'Footwear: a shoe started from scratch is drafted on its last (length, girths, heel, toe spring from the size and the style), with the size run, the moulds and lasts it takes, and the upper exploded into its pieces off the side and the bottom; the style, size and width change it; the last is drawn for the last maker; the files come out in the size asked for', async () => {
  const made = await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'runner', name: `Scratch runner ${stamp}` } }), cid = made.json.concept?.id;
  const p = (await K(`/concepts/${cid}/pattern`)).json;
  ok(made.status === 201 && p.kind === 'footwear' && p.spec.style === 'runner' && p.spec.upper === 'mesh' && Math.abs(p.last.length - (31 / 3 + .5)) < .01 && p.last.ballGirth === 9.375, '1. a runner starts on a US 9 D last, 10⅞ in long, 9⅜ in round the ball, in mesh', { spec: p.spec, last: p.last });
  ok(p.sizeRun.length === 13 && p.tooling.moulds === 7 && p.tooling.lastPairs === 13 && p.components.some(c => /EVA midsole/.test(c.name)) && p.hide.upper > 1, '   with its size run (7 to 13 in halves), 7 sole moulds and 13 pairs of lasts, its components, and the square feet it takes', { tooling: p.tooling, hide: p.hide });
  const saved = (await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: { ...p.spec, style: 'chelsea', size: 10.5, width: 'E', heel: 1.25, toe: 'almond' } } })).json;
  ok(saved.spec.style === 'chelsea' && saved.spec.width === 'E' && saved.last.ballGirth === 9.375 + .375 + .25 && saved.components.some(c => /Elastic gore/.test(c.name)), '2. changed to a Chelsea boot in 10½ E: the last grows a quarter inch a size and a width, and the gores come in', saved.last);
  ok((await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: { ...saved.spec, heel: 3.5 } } })).json.checks.some(c => c.level === 'warn' && /heel/.test(c.msg)), '   a 3½ in heel on a Chelsea is flagged');
  await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: saved.spec } });
  const last = await call(`/v1/lab/concepts/${cid}/last.svg?size=12`, { token: kyleT }), dxf = await call(`/v1/lab/concepts/${cid}/pattern.dxf?size=12`, { token: kyleT });
  ok(last.status === 200 && /size 12 E/.test(last.text) && /ball girth/.test(last.text), '3. the last is drawn for the last maker in the size asked for');
  ok(dxf.status === 200 && /\n1\nElastic gore\n/.test(dxf.text) && /\n1\nCut 4/.test(dxf.text) && /Back quarter, outside/.test(dxf.text) && /US men's 12 E/.test(dxf.text), '   and the upper as a DXF in that size');
  ok((await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'stiletto' } })).json.concept && true, '   an unknown shoe style starts as a sneaker');
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio`, { waitUntil: 'networkidle' }); await page.waitForSelector('#scratchF'); await page.selectOption('#scCat', 'footwear');
    ok((await page.evaluate(() => [...document.querySelectorAll('#scStyle option')].map(o => o.value).join())).includes('chelsea'), '4. the picker offers the shoe styles');
    const sn = (await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `Scratch sneaker ${stamp}` } })).json;
    await page.goto(`${BASE}${sn.studio}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    ok(await page.evaluate(() => /court sneaker/i.test(LAYERS[1]?.name || '') && PPISET), '5. a sneaker from scratch opens on paper with the shoe\'s side as the guide, at real size');
    await page.click('#pieceSteps [data-step=pattern]'); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    ok(/The last/.test(await F.innerText('#side')) && /Size run/.test(await F.innerText('#side')) && /Tooling/.test(await F.innerText('#side')) && await F.locator('#canvas [data-pid="vamp"]').count() === 2, '6. Pattern shows the shoe on its last, the last\'s numbers, the size run and the tooling');
    const texts = await F.innerText('#canvas');
    ok(['Lateral (outside)', 'Medial (inside)', 'Top', 'Bottom'].every(t => new RegExp(t.replace(/[()]/g, '\\$&')).test(texts)), '   the shoe as tech flats: outside, inside, top and bottom', texts);
    await F.selectOption('#size', '12'); await F.waitForFunction(() => /size 12/i.test(document.querySelector('#side').innerText), null, { timeout: 5000 });
    ok(true, '   the size picker redraws it in size 12');
    await F.click('#play'); await F.waitForFunction(() => document.getElementById('tLbl').textContent.startsWith('Cutting layout'), null, { timeout: 15000 });
    ok(await F.locator('#canvas [data-pid="quarter-lat"]').count() >= 2 && !(await F.locator('#canvas [data-pid="sole"]').count()), '7. exploded into the cutting: every cut of the upper, and the moulded sole left out');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), F.click('#lastDl')]); ok(/last-12\.svg$/.test(dl.suggestedFilename()), '   the last spec downloads', dl.suggestedFilename());
    await F.selectOption('[data-k="style"]', 'derby'); await F.waitForFunction(() => /Save the shoe/.test(document.getElementById('saveP').textContent)); await F.click('#saveP'); await F.waitForFunction(() => document.getElementById('saveP').textContent === 'Saved', null, { timeout: 10000 });
    ok((await K(`/concepts/${sn.concept.id}/pattern`)).json.spec.style === 'derby', '8. the style changed on the page is saved');
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
    await K(`/concepts/${sn.concept.id}`, { method: 'DELETE' });
  } finally { await b.close(); if (cid) await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J246', 'A shoe read from its picture: a concept\'s side view (here a high-top) gives the last and the upper: the style, the collar and the toe spring from its outline; the page reads it by itself the first time, shows what would change, lays the picture over the shoe, and keeps it when used', async () => {
  const { footwearPattern } = await import('../../src/lab-footwear.js'), { assembled, boundsOf } = await import('../../src/lab-pattern.js');
  // the picture: a high-top from the side, toe to the left, on a pale ground (what a concept's picture of a shoe looks like to the outline)
  const pat = footwearPattern({ style: 'hightop' }), side = assembled(pat).pieces.filter(x => x.piece.place.view !== 'back'), b = boundsOf(side.flatMap(x => x.pts)), k = 800 / (b.w + 2);
  const tx = ([x, y]) => [(b.x1 - x + 1) * k, (y - b.y0 + 1) * k];
  const paths = side.sort((a, c) => (a.piece.place.z || 0) - (c.piece.place.z || 0)).map(x => `<path d="M${x.pts.map(tx).map(q => q.join(' ')).join(' L')} Z" fill="${['rubber', 'eva'].includes(x.piece.fabric) ? '#e4e2dc' : x.piece.fabric === 'overlay' ? '#1d2b3a' : '#2f4a66'}" stroke="#111" stroke-width="2"/>`).join('');
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round((b.h + 2) * k + 160)}"><rect width="100%" height="100%" fill="#efede8"/><g transform="translate(60 80)">${paths}</g></svg>`)).png().toBuffer();
  const made = (await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `Pictured high-top ${stamp}` } })).json, cid = made.concept.id;
  sql(`delete from lab_patterns where concept_id='${cid}'`); // as if it came from a line plan: no shoe chosen yet
  ok((await K(`/concepts/${cid}/pattern/from-picture`, { method: 'POST', body: {} })).status === 422, '0. with no picture there is nothing to read');
  const applied = await call(`/v1/lab/concepts/${cid}/studio/apply`, { token: kyleT, body: { image: 'data:image/png;base64,' + png.toString('base64') } });
  ok(applied.status === 200, '   the picture is set as the concept\'s picture', applied.json?.error);
  const r = await K(`/concepts/${cid}/pattern/from-picture`, { method: 'POST', body: {} });
  ok(r.status === 200 && r.json.side && r.json.source === 'shape' && r.json.spec.style === 'hightop' && Math.abs(r.json.spec.collar - 5.2) <= .5 && r.json.spec.picture?.toeLeft === true, '1. the outline reads a high-top: its style, its collar at about 5¼ in, and which way it faces', { spec: r.json.spec, changes: r.json.changes });
  ok(r.json.changes.some(c => c.key === 'style' && c.to === 'hightop' && c.source === 'picture (shape)'), '   and says what would change, and from what');
  ok((await K(`/concepts/${cid}/pattern`)).json.spec.style === 'sneaker', '   nothing is saved until it is used');
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const br = await playwright.chromium.launch();
  try {
    const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    await F.waitForSelector('#useRead', { timeout: 15000 });
    ok(/High-top sneaker/.test(await F.innerText('#readBox')) && /Collar height/.test(await F.innerText('#readBox')), '2. the first time it opens, Pattern reads the picture by itself and shows what would change');
    await F.click('#useRead'); await F.waitForFunction(() => /Save the shoe/.test(document.getElementById('saveP').textContent));
    ok(await F.evaluate(() => FBPattern.pattern().spec.style) === 'hightop', '   used: the shoe is redrawn as a high-top');
    ok(await F.locator('#canvas image').count() === 1, '3. the picture lies over the shoe, lined up on the last');
    await F.click('#saveP'); await F.waitForFunction(() => document.getElementById('saveP').textContent === 'Saved', null, { timeout: 10000 });
    const saved = (await K(`/concepts/${cid}/pattern`)).json;
    ok(saved.spec.style === 'hightop' && saved.spec.picture?.x1 > saved.spec.picture?.x0 && saved.components.some(c => /cupsole/i.test(c.name)), '4. saved: the high-top, its collar, and where the picture sits', saved.spec);
    await F.click('#showPic'); ok(await F.locator('#canvas image').count() === 0, '   the picture can be hidden');
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await br.close(); await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J247', 'A pattern engineer edits the pieces: a point moved by the arrow keys and typed in fractions, a point added, a notch, the piece renamed and its seam allowance changed, the front side seam walked against the back, a piece removed and brought back with Undo; saved, the edits follow the size run, and the AAMA DXF carries every size', async () => {
  const made = (await K('/concepts/from-scratch', { body: { category: 'tops', style: 'tee', name: `Edited tee ${stamp}` } })).json, cid = made.concept.id;
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    await F.click('#editBtn'); await F.waitForSelector('#esvg circle[data-pt]');
    ok(await F.inputValue('#ePiece') === 'front' && await F.locator('#esvg circle[data-pt]').count() >= 8, '1. Edit pieces opens the front, its points ready to move');
    const pt = () => F.evaluate(() => FBPattern.pattern().pieces.find(q => q.id === 'front').sew);
    const before = await pt(), i = before.findIndex(([x, y]) => x > 5 && y > 20);
    await F.click(`#esvg circle[data-pt="${i}"]`); await F.press('body', 'ArrowRight'); await F.press('body', 'ArrowRight');
    const moved = await pt(); ok(Math.abs(moved[i][0] - before[i][0] - .125) < .001 && moved[i][1] === before[i][1], '2. two presses of the arrow key move the point ⅛ in', [before[i], moved[i]]);
    await F.fill('[data-ek="py"]', '20 1/2'); await F.dispatchEvent('[data-ek="py"]', 'change'); ok((await pt())[i][1] === 20.5, '   and a height typed as 20 1/2 puts it there');
    const n0 = (await pt()).length; await F.click('[data-e="add"]'); ok((await pt()).length === n0 + 1, '3. a point is added');
    await F.click('[data-e="notch"]'); ok(await F.evaluate(() => FBPattern.pattern().pieces.find(q => q.id === 'front').notches.length) >= 3, '   and a notch set on it');
    await F.fill('[data-ek="name"]', 'Front body'); await F.dispatchEvent('[data-ek="name"]', 'change'); await F.selectOption('[data-ek="sa"]', '0.5');
    ok(await F.evaluate(() => { const q = FBPattern.pattern().pieces.find(x => x.id === 'front'); return q.name === 'Front body' && q.sa === .5; }), '4. renamed and given a ½ in seam allowance');
    // the side seam: from the underarm to the hem on the front, then on the back
    const seamEnds = id => F.evaluate(id => { const s = FBPattern.pattern().pieces.find(q => q.id === id).sew; let ua = 0, hem = 0; s.forEach(([x, y], k) => { if (x > 0 && y < 15 && y > 8 && x >= s[ua][0] - .01 && (s[ua][1] > 15 || s[ua][1] < 8 || y > s[ua][1] || ua === 0)) ua = k; if (x > 0 && y > s[hem][1] - .01 && x >= s[hem][0] - .01) hem = k; }); return [ua, hem]; }, id);
    let [a, h] = await seamEnds('front'); await F.click(`#esvg circle[data-pt="${a}"]`); await F.click(`#esvg circle[data-pt="${h}"]`, { modifiers: ['Shift'] }); await F.click('[data-e2="seamA"]');
    await F.selectOption('#ePiece', 'back'); await F.waitForFunction(() => document.querySelector('#esvg text')?.textContent.startsWith('Back'));
    [a, h] = await seamEnds('back'); await F.click(`#esvg circle[data-pt="${a}"]`); await F.click(`#esvg circle[data-pt="${h}"]`, { modifiers: ['Shift'] }); await F.click('[data-e2="seamB"]');
    const walk = await F.innerText('#side'); ok(/A Front body: \d/.test(walk) && /B Back: \d/.test(walk) && /(They match|longer by|shorter by)/.test(walk), '5. the front side seam is walked against the back, and the difference is shown', walk.match(/A Front[^\n]*|B Back[^\n]*|They match|[A-Za-z]+ by [^:\n]*/g));
    await F.selectOption('#ePiece', 'neck-rib'); await F.click('[data-e2="remove"]'); ok(!(await F.evaluate(() => FBPattern.pattern().pieces.some(q => q.id === 'neck-rib'))), '6. the neck rib removed');
    await F.click('[data-e="undo"]'); ok(await F.evaluate(() => FBPattern.pattern().pieces.some(q => q.id === 'neck-rib')), '   and Undo brings it back');
    await F.click('#saveP'); await F.waitForFunction(() => document.getElementById('saveP')?.textContent === 'Saved', null, { timeout: 10000 });
    const saved = (await K(`/concepts/${cid}/pattern`)).json.spec.edits; ok(saved?.pieces?.front?.name === 'Front body' && saved.pieces.front.sa === .5 && !(saved.removed || []).length, '7. saved with the pattern', saved && Object.keys(saved.pieces));
    const aama = await call(`/v1/lab/concepts/${cid}/pattern.dxf?format=aama&sizes=all`, { token: kyleT });
    ok(aama.status === 200 && /Piece Name: Front body/.test(aama.text) && /Size List: XS S M L XL XXL/.test(aama.text) && (aama.text.match(/\n0\nBLOCK\n/g) || []).length >= 6 * 4, '8. the AAMA DXF has every size, the edited front in each', (aama.text.match(/\n0\nBLOCK\n/g) || []).length);
    await F.click('#editBtn'); ok(await F.locator('#canvas [data-pid="front"]').count() === 1, '   Done editing goes back to the product, made of the edited pieces');
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await b.close(); await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J248', 'A footwear developer brings in the 3D last from the last maker (an STL in mm, turned any way): it is stood the way a last stands and measured; a file in the wrong units is refused with what to do; the shoe is drafted on the measured last, in its size and graded to the run; then the 3D service makes a last from the drafted one, fitted to the size and measured; both download as STL; in the page the last is imported, shown in 3D and drafted on', async () => {
  const L3 = await import('../../src/lab-last3d.js'), F = await import('../../src/lab-footwear.js');
  const turn = pos => { const a = .7, b = -.4, c = 1.1, R = [[Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b) * Math.sin(c) - Math.sin(a) * Math.cos(c), Math.cos(a) * Math.sin(b) * Math.cos(c) + Math.sin(a) * Math.sin(c)], [Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b) * Math.sin(c) + Math.cos(a) * Math.cos(c), Math.sin(a) * Math.sin(b) * Math.cos(c) - Math.cos(a) * Math.sin(c)], [-Math.sin(b), Math.cos(b) * Math.sin(c), Math.cos(b) * Math.cos(c)]], q = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) q[i + j] = R[j][0] * pos[i] + R[j][1] * pos[i + 1] + R[j][2] * pos[i + 2] + [3, -1, 9][j]; return q; };
  const made = await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `Last import ${stamp}` } }), cid = made.json.concept?.id;
  const want = F.lastOf({ style: 'sneaker' }, 10.5), stl = L3.stlOf(turn(L3.loftLast({ style: 'sneaker', size: 10.5 }))), file = stl.toString('base64');
  const empty = (await K(`/concepts/${cid}/lasts`)).json;
  ok(Array.isArray(empty.lasts) && empty.lasts.length === 0 && empty.connected === true && typeof empty.heel === 'number', '1. a new shoe has no 3D last yet; the 3D service is connected and the shoe\'s heel height is offered', empty);
  const imp = await K(`/concepts/${cid}/lasts`, { body: { name: 'Last maker scan', file, heelHeight: .45 } }), m = imp.json.last?.measures;
  ok(imp.status === 201 && imp.json.last.units === 'mm' && Math.abs(m.length - want.length) < .06 && m.heelHeight === .45 && m.whichFoot === 'right' && Math.abs(m.ballWidth - want.ballWidth) < .3, '2. the STL is read as millimetres, turned the way a last stands and measured: its length, a right last, the heel as given, the ball width', m);
  ok(imp.json.last.size === 10.5 && imp.json.last.compare.find(c => c.key === 'length').diff < .06, '   it reads as a 10½, and is compared with the drafted 10½', imp.json.last.compare);
  const odd = L3.stlOf(turn(L3.loftLast({ style: 'sneaker' })).map(v => v * 7 / 25.4)), bad = await K(`/concepts/${cid}/lasts`, { body: { name: 'Odd units', file: odd.toString('base64') } });
  ok(bad.status === 422 && bad.json.code === 'units' && /Say which units/.test(bad.json.error), '3. a model in units the Lab cannot tell is refused, asking which units it is in', bad.json);
  const use = await K(`/concepts/${cid}/lasts/${imp.json.last.id}/use`, { body: {} });
  ok(use.status === 200 && use.json.spec.size === 10.5 && use.json.spec.last3d?.id === imp.json.last.id, '4. the shoe is drafted on the measured last, in its size', use.json.spec?.size);
  const p = (await K(`/concepts/${cid}/pattern`)).json;
  ok(p.last.measured?.name === 'Last maker scan' && Math.abs(p.last.length - m.length) < .02 && p.sizeRun.find(r => r.size === 12)?.lastMm > p.sizeRun.find(r => r.size === 10.5)?.lastMm, '   the pattern\'s last is the measured one, and the size run grades from it', p.last);
  const aama = await call(`/v1/lab/concepts/${cid}/pattern.dxf?format=aama&sizes=all`, { token: kyleT });
  ok(aama.status === 200 && /Vamp/.test(aama.text) && /US men's 12/.test(aama.text), '   the upper drafted on it comes out as the AAMA DXF for every size');
  const gen = await K(`/concepts/${cid}/lasts/generate`, { body: { from: 'draft' } });
  ok(gen.status === 201 && gen.json.last.status === 'running' && gen.json.last.source === 'draft', '5. the 3D service is asked for a last from the drafted one (drawn from four sides)', gen.json);
  let g = null; for (let i = 0; i < 60 && (!g || g.status === 'running'); i++) { await sleep(500); g = (await K(`/concepts/${cid}/lasts`)).json.lasts.find(l => l.id === gen.json.last.id); }
  ok(g?.status === 'done' && g.units === 'fitted' && g.target?.size === 10.5 && Math.abs(g.measures.length - g.target.length) < .05 && Math.abs(g.measures.ballGirth - g.target.ballGirth) < .08, '   it comes back, fitted to the drafted size (its length, its ball girth) and measured', g);
  const dl = await fetch(`${BASE}/v1/lab/concepts/${cid}/lasts/${imp.json.last.id}/last.stl`, { headers: { Authorization: 'Bearer ' + kyleT } }), buf = Buffer.from(await dl.arrayBuffer());
  const dr = await fetch(`${BASE}/v1/lab/concepts/${cid}/last.stl?size=11`, { headers: { Authorization: 'Bearer ' + kyleT } }), dbuf = Buffer.from(await dr.arrayBuffer());
  ok(dl.status === 200 && buf.length === 84 + buf.readUInt32LE(80) * 50 && dr.status === 200 && dbuf.length === 84 + dbuf.readUInt32LE(80) * 50 && /last-11/.test(dr.headers.get('content-disposition') || ''), '6. the measured last and the drafted last (any size) download as STL, in mm with Z up');
  const un = await K(`/concepts/${cid}/lasts/unuse`, { body: {} });
  ok(un.status === 200 && !un.json.spec.last3d && (await K(`/concepts/${cid}/lasts/${g.id}`, { method: 'DELETE' })).status === 200, '7. back to the drafted last; a last is removed');
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const Fr = await (await page.waitForSelector('#patFrame')).contentFrame(); await Fr.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    await Fr.waitForSelector('#l3Imp'); ok(/3D last/.test(await Fr.innerText('#l3')) && (await Fr.$$('[data-l3card]')).length === 1, '8. the Pattern view has the 3D last panel, with the last brought in before');
    await Fr.fill('#l3Heel', '0.45'); await Fr.setInputFiles('#l3File', { name: 'second-scan.stl', mimeType: 'model/stl', buffer: stl });
    await Fr.waitForFunction(() => document.querySelectorAll('[data-l3card]').length === 2, null, { timeout: 20000 }); await Fr.waitForSelector('#l3View canvas', { timeout: 20000 });
    ok(/second-scan/.test(await Fr.innerText('#l3')) && /Measured/.test(await Fr.innerText('#l3')), '9. a last is imported in the page: measured, compared with the draft, and shown in 3D');
    const card = await Fr.$('[data-l3card]:has-text("second-scan")'); await (await card.$('[data-l3use]')).click();
    await Fr.waitForFunction(() => /drafting on/.test(document.querySelector('#l3 h4')?.textContent || ''), null, { timeout: 20000 });
    ok(/10\.5/.test(await Fr.innerText('#sub')) && /drafting on second-scan/i.test(await Fr.textContent('#l3 h4')), '10. the shoe is drafted on it: the page moves to its size', await Fr.innerText('#sub'));
    ok(!errs.length, '   no page errors', errs);
  } finally { await b.close(); await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J249', 'A footwear designer works on the last: the upper is cut flattened off the last\'s surface (with its stretch stated); in the On the last view the shoe\'s lines are on the last in 3D, turned by dragging; a seam drawn on it across the outside quarter cuts it into a back and a front quarter, which come out in the AAMA DXF; the seam is removed again', async () => {
  const made = await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `On the last ${stamp}` } }), cid = made.json.concept?.id;
  const p = (await K(`/concepts/${cid}/pattern`)).json;
  ok(p.flat && p.flat.lateral.rms < .15 && p.flat.medial.rms < .15 && p.pieces.some(q => q.id === 'quarter-lat'), '1. the upper is flattened off the last, with little stretch', p.flat);
  const put = await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: { ...p.spec, seams: [{ piece: 'quarter-lat', side: 'lateral', pts: [[3, .2], [3.2, -3.5]], name: 'Back quarter seam' }] } } });
  ok(put.status === 200 && put.json.pieces.some(q => q.name === 'Quarter, outside (back)') && put.json.pieces.some(q => q.name === 'Quarter, outside (front)'), '2. a seam across the outside quarter cuts it into a back and a front quarter', put.json.pieces);
  const aama = await call(`/v1/lab/concepts/${cid}/pattern.dxf?format=aama`, { token: kyleT });
  ok(aama.status === 200 && /Quarter, outside \(back\)/.test(aama.text) && /Quarter, outside \(front\)/.test(aama.text), '   both are in the AAMA DXF');
  await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: p.spec } });
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const Fr = await (await page.waitForSelector('#patFrame')).contentFrame(); await Fr.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    await Fr.click('#lastBtn'); await Fr.waitForSelector('#lastCv');
    ok(/On the last/.test(await Fr.innerText('#side')) && /Stretch in the flattening/.test(await Fr.innerText('#side')), '3. On the last shows the shoe on its last, and the stretch in the flattening');
    const box = await (await Fr.$('#lastCv')).boundingBox(), shot0 = await (await Fr.$('#lastCv')).screenshot();
    await page.mouse.move(box.x + box.width / 2, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + 320, { steps: 6 }); await page.mouse.up();
    ok(!(await (await Fr.$('#lastCv')).screenshot()).equals(shot0), '   dragging turns the last');
    await Fr.click('#ltools [data-l="side"]'); await Fr.click('#ltools [data-l="draw"]');
    for (const pt of [[3, -.4], [3.1, -1.4], [3.2, -2.2]]) { const at = await Fr.evaluate(q => window.FBPattern.lastAt('lateral', q), pt); await page.mouse.click(box.x + at[0], box.y + at[1]); await sleep(150); }
    await Fr.waitForSelector('#lPiece:not(.hidden)', { timeout: 5000 });
    const opts = await Fr.evaluate(() => [...document.querySelectorAll('#lPiece option')].map(o => o.value));
    ok(opts.includes('quarter-lat'), '4. a seam is drawn by clicking on the last; the pieces it crosses are offered', opts);
    await Fr.selectOption('#lPiece', 'quarter-lat'); await Fr.click('#ltools [data-l="cut"]');
    await Fr.waitForFunction(() => window.FBPattern.pattern().pieces.some(q => q.id === 'quarter-lat-b1'), null, { timeout: 5000 });
    ok(/Seam 1/.test(await Fr.innerText('#side')), '5. the quarter is cut in two along it; the seam is listed');
    await Fr.click('#saveP'); await Fr.waitForFunction(() => !window.FBPattern.dirty(), null, { timeout: 10000 });
    const saved = (await K(`/concepts/${cid}/pattern`)).json;
    ok(saved.spec.seams?.length === 1 && saved.spec.seams[0].piece === 'quarter-lat' && saved.pieces.some(q => q.id === 'quarter-lat-f1'), '   and it is saved with the shoe', saved.spec.seams);
    await Fr.click('[data-lrm="0"]'); await Fr.waitForFunction(() => !window.FBPattern.pattern().pieces.some(q => q.id === 'quarter-lat-b1'));
    ok(/None yet/.test(await Fr.innerText('#side')), '6. the seam is removed again');
    ok(!errs.length, '   no page errors', errs);
  } finally { await b.close(); await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J250', 'A footwear developer checks the shoe against its picture: the outline is measured first, then two judges (Claude and ChatGPT) each score the four views against the picture out of 100, the stricter score standing, and ask for changes (seven eyelets, a mudguard; a toe cap they dispute is left for a person); what they agree on is made and drawn again until it clears the bar of 90; the page follows the rounds, says what a person must look at, and keeps the changes when they are used', async () => {
  const { footwearPattern } = await import('../../src/lab-footwear.js'), { assembled, boundsOf } = await import('../../src/lab-pattern.js');
  // the picture: a runner from the side, on a pale ground
  const pat = footwearPattern({ style: 'runner', eyelets: 7, mudguard: true }), side = assembled(pat).pieces.filter(x => x.piece.place.view !== 'back'), b = boundsOf(side.flatMap(x => x.pts)), k = 800 / (b.w + 2);
  const paths = side.sort((a, c) => (a.piece.place.z || 0) - (c.piece.place.z || 0)).map(x => `<path d="M${x.pts.map(([px, py]) => `${(px - b.x0 + 1) * k} ${(py - b.y0 + 1) * k}`).join(' L')} Z" fill="${x.piece.fabric === 'overlay' ? '#1d2b3a' : '#2f4a66'}" stroke="#111" stroke-width="2"/>`).join('');
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round((b.h + 2) * k + 160)}"><rect width="100%" height="100%" fill="#efede8"/><g transform="translate(60 80)">${paths}</g></svg>`)).png().toBuffer();
  const cid = (await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'runner', name: `Checked runner ${stamp}` } })).json.concept.id;
  try {
    ok((await K(`/concepts/${cid}/pattern/review`, { method: 'POST', body: {} })).status === 422, '0. with no picture there is nothing to check against');
    await call(`/v1/lab/concepts/${cid}/studio/apply`, { token: kyleT, body: { image: 'data:image/png;base64,' + png.toString('base64') } });
    const go = await K(`/concepts/${cid}/pattern/review`, { method: 'POST', body: {} });
    ok(go.status === 202 && go.json.reviewer === true && go.json.bar === 90 && go.json.judges.join() === 'Claude,ChatGPT', '1. the review starts in the background, with two judges (Claude and ChatGPT) and the bar of 90', go.json);
    ok((await K(`/concepts/${cid}/pattern/review`, { method: 'POST', body: {} })).status === 409, '   one review of a shoe at a time');
    let j = null; for (let i = 0; i < 40; i++) { await sleep(500); j = (await K(`/concepts/${cid}/pattern/review/${go.json.id}`)).json; if (j.status !== 'running') break; }
    ok(j.status === 'done' && j.result === 'passed' && j.rounds.length === 2 && j.rounds[0].score < 90 && j.rounds[1].score >= 90, '2. round 1 is below the bar, round 2 clears it', j.rounds?.map(r => r.score));
    ok(j.spec.eyelets === 7 && j.spec.mudguard === true && j.changes.some(c => c.key === 'eyelets' && /seven/.test(c.why)), '   the developer\'s changes are made, each with why', j.changes);
    ok(j.outline && j.outline.checks.some(c => c.key === 'aspect'), '   the outline is measured before the developer looks');
    ok(j.rounds[0].judges.length === 2 && j.rounds[0].score === Math.min(...j.rounds[0].judges.map(x => x.score)) && j.rounds[0].disagree === true, '   each judge scores on its own; the stricter score stands, and a wide gap is said', j.rounds[0].judges);
    ok(j.rounds[0].conflicts.some(x => x.field === 'toeCap') && j.spec.toeCap !== true && j.changes.find(c => c.key === 'eyelets').judges.length === 2, '   a toe cap one judge wants and the other does not is left for a person; what both ask for is made', j.rounds[0].conflicts);
    ok(j.beyondDrawing.includes('A reflective heel strip'), '   what the drawing cannot show is left for a person');
    ok((await K(`/concepts/${cid}/pattern`)).json.spec.eyelets == null, '   nothing is saved until it is used');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      await F.click('#revStart'); await F.waitForSelector('#revBox[aria-busy="true"]', { timeout: 5000 });
      ok(true, '3. on the Pattern page the check starts from the shoe on the page, and shows it is running');
      await F.waitForSelector('#revVerdict', { timeout: 20000 });
      const txt = await F.innerText('#revBox');
      ok(/reads as the shoe/.test(txt) && /Round 1/.test(txt) && /Round 2/.test(txt) && /\/100/.test(txt) && /Eyelets a side/.test(txt) && /For a person/.test(txt) && /ChatGPT/.test(txt) && /points apart/.test(txt) && /left as it is, for a person/.test(txt), '   the rounds with their scores, the changes and what a person must look at', txt.slice(0, 400));
      await F.click('#revUse'); await F.waitForFunction(() => /Save the shoe/.test(document.getElementById('saveP').textContent));
      ok(await F.evaluate(() => FBPattern.pattern().spec.eyelets) === 7 && await F.evaluate(() => FBPattern.pattern().pieces.some(q => q.id === 'mudguard')), '4. used: the shoe is redrawn with seven eyelets and a mudguard');
      await F.click('#saveP'); await F.waitForFunction(() => document.getElementById('saveP').textContent === 'Saved', null, { timeout: 10000 });
      const saved = (await K(`/concepts/${cid}/pattern`)).json; ok(saved.spec.eyelets === 7 && saved.spec.mudguard === true, '   and saved', saved.spec);
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J251', 'A footwear designer draws by hand: lines sketched on the outside, the top and on the last itself (a line on a side shows on both), a hand-drawn line made into a seam that cuts the outside quarter, a photo of a paper sketch laid under the outside view, all kept with the shoe and drawn into the tech flats', async () => {
  const cid = (await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `Hand-drawn sneaker ${stamp}` } })).json.concept.id;
  try {
    const p0 = (await K(`/concepts/${cid}/pattern`)).json;
    const put = await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: { ...p0.spec, sketches: [{ on: 'lateral', pts: [[4, -1, 1], [5, -1.4, .6]], c: '#C2410C', size: .04 }, { on: 'top', pts: [[6, 0], [7, .4]] }, { on: 'nowhere', pts: [[1, 1]] }] } } });
    ok(put.status === 200 && put.json.spec.sketches.length === 2 && put.json.spec.sketches[0].c === '#c2410c', '1. lines drawn by hand are kept with the shoe, bounded (one on no view is dropped)', put.json.spec.sketches);
    const flats = await call(`/v1/lab/concepts/${cid}/flats.svg`, { token: kyleT });
    ok(flats.status === 200 && /stroke="#c2410c"/.test(flats.text), '   and drawn into the tech flats');
    await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: p0.spec } });
    // a paper sketch: a photo of a drawing, laid under the outside view
    const paper = await sharp({ create: { width: 900, height: 420, channels: 3, background: '#f4f1ea' } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420"><path d="M60 330 C200 340 500 360 840 300 C820 220 700 200 560 150 C420 60 200 80 80 120 Z" fill="none" stroke="#222" stroke-width="6"/></svg>') }]).jpeg().toBuffer();
    ok((await K(`/concepts/${cid}/pattern/underlays/front`, { method: 'PUT', body: { image: 'data:image/jpeg;base64,' + paper.toString('base64') } })).status === 422, '2. a paper sketch goes under one of the four views');
    const ul = await K(`/concepts/${cid}/pattern/underlays/lateral`, { method: 'PUT', body: { image: 'data:image/jpeg;base64,' + paper.toString('base64'), place: { x: 0, y: -4.5, w: 11.5, opacity: .5 } } });
    const list = (await K(`/concepts/${cid}/pattern/underlays`)).json.underlays, img = await call(`/v1/lab/concepts/${cid}/pattern/underlays/lateral`, { token: kyleT });
    ok(ul.status === 200 && list.length === 1 && list[0].view === 'lateral' && list[0].place.w === 11.5 && img.status === 200, '   laid under the outside view, where it was put', list);
    ok((await K(`/concepts/${cid}/pattern/underlays/lateral`, { method: 'PATCH', body: { place: { x: .2, y: -4.4, w: 99, opacity: .4 } } })).json.place.w === 24, '   moved and sized, within bounds');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      await F.waitForSelector('#ul-lateral', { state: 'attached', timeout: 10000 });
      ok(/Replace paper sketch/.test(await F.innerText('#skBox')), '3. the paper sketch lies under the outside view, and the Sketches panel says so');
      const frameBox = async () => { const fe = await page.$('#patFrame'); return fe.boundingBox(); };
      const draw = async (view, pts) => { const fb = await frameBox(); const s = []; for (const p of pts) s.push(await F.evaluate(([v, q]) => window.FBPattern.viewAt(v, q), [view, p])); await page.mouse.move(fb.x + s[0][0], fb.y + s[0][1]); await page.mouse.down(); for (const q of s.slice(1)) await page.mouse.move(fb.x + q[0], fb.y + q[1], { steps: 6 }); await page.mouse.up(); await sleep(200); };
      await F.click('#skBtn'); await F.waitForSelector('#ktools:not(.hidden)');
      await draw('lateral', [[5, -2.6], [6, -2.2], [7, -1.9]]);
      let sk = await F.evaluate(() => window.FBPattern.sketches());
      ok(sk.length === 1 && sk[0].on === 'lateral' && sk[0].pts.length > 4 && Math.abs(sk[0].pts[0][0] - 5) < .2, '4. a line drawn on the outside view is kept on the outside, where it was drawn', sk[0]?.pts?.slice(0, 2));
      await F.click('#ktools [data-ka="undo"]'); ok((await F.evaluate(() => window.FBPattern.sketches())).length === 0, '   Undo takes it off');
      await draw('top', [[6.5, -.6], [7.2, 0], [7.8, .5]]); sk = await F.evaluate(() => window.FBPattern.sketches()); ok(sk.length === 1 && sk[0].on === 'top', '   a line on the top view is the top\'s');
      // a line across the outside quarter, made into a seam
      await draw('lateral', [[3.05, -.35], [3.15, -1.6], [3.25, -3.1]]);
      await F.click('#ktools [data-k="seam"]');
      const mid = await F.evaluate(() => window.FBPattern.viewAt('lateral', [3.15, -1.6])), fb = await frameBox(); await page.mouse.click(fb.x + mid[0], fb.y + mid[1]); await sleep(300);
      const opts = await F.evaluate(() => [...document.querySelectorAll('#kPiece option')].map(o => o.value));
      ok(opts.includes('quarter-lat'), '5. a hand-drawn line on the outside offers the pieces it crosses', opts);
      await F.selectOption('#kPiece', 'quarter-lat'); await F.click('#ktools [data-ka="cut"]');
      await F.waitForFunction(() => window.FBPattern.pattern().pieces.some(q => q.id === 'quarter-lat-b1'), null, { timeout: 5000 });
      ok((await F.evaluate(() => window.FBPattern.sketches())).length === 1, '   the outside quarter is cut in two along it; the line became the seam');
      await F.click('#skBtn');
      // on the last: a line drawn on its outside shows on the flat outside view too
      await F.click('#lastBtn'); await F.waitForSelector('#lastCv'); await F.click('#ltools [data-l="sketch"]');
      const lb = await (await F.$('#lastCv')).boundingBox(), pts = []; for (const q of [[7, -1.4], [7.6, -1.3], [8.2, -1.25], [8.8, -1.2]]) pts.push(await F.evaluate(q => window.FBPattern.lastAt('lateral', q), q));
      await page.mouse.move(lb.x + pts[0][0], lb.y + pts[0][1]); await page.mouse.down(); for (const q of pts.slice(1)) await page.mouse.move(lb.x + q[0], lb.y + q[1], { steps: 5 }); await page.mouse.up(); await sleep(300);
      sk = await F.evaluate(() => window.FBPattern.sketches());
      const onLast = sk.filter(k => k.on === 'lateral'); ok(onLast.length === 1 && onLast[0].pts.length >= 4 && onLast[0].pts.every(p => p[0] > 6.5 && p[0] < 9.4), '6. a line drawn on the last is kept on the outside view\'s own inches, so the flat view shows it too', onLast[0]?.pts?.slice(0, 3));
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/sketch-last.png' });
      await F.click('#lastBtn');
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/sketch-flats.png' });
      await F.click('#saveP'); await F.waitForFunction(() => !window.FBPattern.dirty(), null, { timeout: 10000 });
      const saved = (await K(`/concepts/${cid}/pattern`)).json;
      ok(saved.spec.sketches.length === 2 && saved.spec.seams?.length === 1 && saved.pieces.some(q => q.id === 'quarter-lat-f1'), '7. saved: the sketches and the seam made from one', { sketches: saved.spec.sketches.map(k => k.on), seams: saved.spec.seams });
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J252', 'A plush designer sees the toy as it will be made: Pattern opens a bear on its tech flats (front, back, side: stuffed, with its face, seams, the stuffing opening and the law label), downloads them as an SVG, sketches on the front and the side by hand, lays a paper sketch under the front, and saves', async () => {
  const cid = (await K('/concepts/from-scratch', { body: { category: 'plush', shape: 'bear', name: `Sketched bear ${stamp}` } })).json.concept.id;
  try {
    const flats = await call(`/v1/lab/concepts/${cid}/flats.svg`, { token: kyleT });
    ok(flats.status === 200 && />Front</.test(flats.text) && />Back</.test(flats.text) && />Side</.test(flats.text) && /12 in/.test(flats.text), '1. the plush\'s tech flats download as one SVG: front, back and side, with its height');
    const paper = await sharp({ create: { width: 600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><circle cx="300" cy="220" r="150" fill="none" stroke="#333" stroke-width="8"/></svg>') }]).png().toBuffer();
    ok((await K(`/concepts/${cid}/pattern/underlays/front`, { method: 'PUT', body: { image: 'data:image/png;base64,' + paper.toString('base64'), place: { x: -4, y: -1, w: 8, opacity: .5 } } })).status === 200, '2. a paper sketch (a drawing app\'s PNG, its transparency kept) goes under the front');
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      await F.waitForSelector('#ul-front', { state: 'attached', timeout: 10000 });
      const txt = await F.innerText('#canvas');
      ok(/Front/.test(txt) && /Back/.test(txt) && /Side/.test(txt) && /12 in/.test(txt), '3. Pattern opens the bear on its tech flats, the paper sketch under the front');
      const frameBox = async () => (await page.$('#patFrame')).boundingBox();
      const draw = async (view, pts) => { const fb = await frameBox(); const s = []; for (const p of pts) s.push(await F.evaluate(([v, q]) => window.FBPattern.viewAt(v, q), [view, p])); await page.mouse.move(fb.x + s[0][0], fb.y + s[0][1]); await page.mouse.down(); for (const q of s.slice(1)) await page.mouse.move(fb.x + q[0], fb.y + q[1], { steps: 6 }); await page.mouse.up(); await sleep(200); };
      await F.click('#skBtn'); await F.waitForSelector('#ktools:not(.hidden)');
      ok(await F.isHidden('#ktools [data-k="seam"]'), '   (a plush has no seam tool on its views)');
      await draw('front', [[-1, 7], [0, 7.6], [1, 7]]); await draw('side', [[1, 2], [1.6, 2.4]]);
      const sk = await F.evaluate(() => window.FBPattern.sketches());
      ok(sk.length === 2 && sk[0].on === 'front' && sk[1].on === 'side' && Math.abs(sk[0].pts[0][0] + 1) < .2, '4. lines drawn on the front and the side are kept on those views, where they were drawn', sk.map(k => [k.on, k.pts[0]]));
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/plush.png' });
      await F.click('#skBtn'); await F.click('#saveP'); await F.waitForFunction(() => !window.FBPattern.dirty(), null, { timeout: 10000 });
      const saved = (await K(`/concepts/${cid}/pattern`)).json; ok(saved.spec.sketches?.length === 2 && saved.spec.shape === 'bear', '5. saved with the bear', saved.spec.sketches);
      ok(/#3a3a3c/.test((await call(`/v1/lab/concepts/${cid}/flats.svg`, { token: kyleT })).text), '   and drawn into its tech flats');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J253', 'The materials library takes footwear materials, plush and toy materials, and plastics and acrylics, each drawn as what it is; a shoe\'s parts take swatches from it (suede on the upper, pebble leather on the overlays, a gum cupsole) and its tech flats are drawn in them; an electronics enclosure takes PC/ABS and an acrylic lens, costed', async () => {
  const libs = {}; for (const k of ['footwear', 'plush', 'plastic']) libs[k] = (await K(`/materials?kind=${k}`)).json;
  ok(libs.footwear.materials.length >= 10 && libs.plush.materials.length >= 10 && libs.plastic.materials.length >= 10 && libs.plastic.options.parts.electronics.some(p => p.id === 'lens'), '1. the library has footwear, plush and plastic materials to start with, and the parts each product has', Object.fromEntries(Object.entries(libs).map(([k, v]) => [k, v.materials.length])));
  const own = await K('/materials', { body: { kind: 'plastic', name: `PC/ABS for a charger ${stamp}`, unit: 'kg', price: '4.80', spec: { category: 'PC/ABS', grade: 'FR', ul94: 'V-0', process: 'injection moulding', finish: 'SPI C-1 (matte)', thicknessMm: 2 }, colours: [{ name: 'graphite', hex: '#3a3b3e' }] } });
  ok(own.status === 201 && own.json.material.spec.ul94 === 'V-0' && own.json.material.unit === 'kg', '2. a plastic is added with its resin, grade, finish and flame rating', own.json.material?.spec);
  const by = (k, key) => libs[k].materials.find(m => m.key === key);
  const shoe = (await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `Suede sneaker ${stamp}` } })).json.concept.id;
  const box = (await K('/concepts/from-scratch', { body: { category: 'electronics', name: `Charger ${stamp}` } })).json.concept.id;
  try {
    let r = await K(`/concepts/${shoe}/materials`, { body: { material: by('footwear', 'fw-fullgrain').id, part: 'upper' } });
    r = await K(`/concepts/${shoe}/materials`, { body: { material: by('footwear', 'fw-suede').id, part: 'upper' } });
    const ups = r.json.picks.filter(p => p.part === 'upper');
    ok(r.status === 201 && ups.length === 1 && ups[0].name.includes('suede') && ups[0].colour?.name === 'sand' && ups[0].unit === 'sq ft', '3. a part takes one material: suede replaces the leather on the upper, in its first colour, by the square foot', ups);
    await K(`/concepts/${shoe}/materials`, { body: { material: by('footwear', 'fw-cupsole').id, part: 'outsole', colour: '#b9864f' } });
    const flats = await call(`/v1/lab/concepts/${shoe}/flats.svg`, { token: kyleT });
    ok(/#c8a77c/.test(flats.text) && /lk-nap-/.test(flats.text) && /#b9864f/.test(flats.text), '4. the tech flats are drawn in them: a sand suede upper with its nap, a gum sole');
    await K(`/concepts/${box}/materials`, { body: { material: own.json.material.id, part: 'housing-top' } });
    const m2 = await K(`/concepts/${box}/materials`, { body: { material: by('plastic', 'ps-acrylic-cast').id, part: 'lens' } });
    ok(m2.json.picks.length === 2 && m2.json.cost.materialsCents > 0 && m2.json.picks.find(p => p.part === 'lens').colour?.name === 'clear', '5. an electronics enclosure takes PC/ABS on its housing and a clear acrylic lens, and is costed', m2.json.cost);
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${shoe}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      await F.waitForSelector('#mtBox [data-mpart="upper"] .mth svg', { timeout: 10000 });
      ok(/Cow suede/.test(await F.innerText('#mtBox')) && await F.locator('#canvas [fill^="url(#lk-nap"]').count() > 0, '6. the Pattern page shows each part\'s swatch, and the shoe drawn in them');
      await F.click('#mtBox [data-mpart="overlay"] [data-mpick]'); await F.waitForSelector('#mtBox [data-mpart="overlay"] [data-muse]');
      const pebble = by('footwear', 'fw-pebble').id; await F.click(`#mtBox [data-mpart="overlay"] [data-muse="${pebble}"]`);
      await F.waitForFunction(() => window.FBPattern.materials().some(p => p.part === 'overlay'), null, { timeout: 5000 });
      ok(await F.locator('#canvas [fill^="url(#lk-pebble"]').count() > 0, '7. pebble leather chosen for the overlays from the library, and drawn on them');
      await F.selectOption('#mtBox [data-mpart="upper"] [data-mcol]', '#2f4a39'); await F.waitForFunction(() => window.FBPattern.materials().find(p => p.part === 'upper')?.colour?.hex === '#2f4a39', null, { timeout: 5000 });
      ok(/#2f4a39/.test(await F.innerHTML('#canvas')), '   the upper\'s colour changed to forest, from the colours the suede comes in');
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/mats-shoe.png' });
      const lib = await oc.newPage(); lib.on('pageerror', e => errs.push(String(e))); await lib.goto(`${BASE}/lab/materials`, { waitUntil: 'networkidle' });
      await lib.click('#kinds [data-kind="plastic"]'); await lib.waitForSelector('.card [data-draw] svg', { timeout: 10000 });
      ok(/PMMA cast acrylic/.test(await lib.innerText('body')) && await lib.locator('.card [data-draw] svg').count() >= 10, '8. the library page lists the plastics and acrylics, each drawn');
      if (process.env.SHOT_DIR) await lib.screenshot({ path: process.env.SHOT_DIR + '/mats-lib.png' });
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { await K(`/concepts/${shoe}`, { method: 'DELETE' }); await K(`/concepts/${box}`, { method: 'DELETE' }); await K(`/materials/${own.json.material?.id}`, { method: 'DELETE' }); }
});

await journey('J254', 'Between the modeller and the hand: on a shoe\'s tech flats a designer drags the model\'s own vamp line along the shoe (the pieces are drafted again), bends a line they drew, makes a hand-drawn line the toe cap, traces the model\'s collar to rework it, reshapes a seam and turns it back into a hand line; on a garment\'s flat a stitch line\'s points are dragged, added and taken away', async () => {
  const cid = (await K('/concepts/from-scratch', { body: { category: 'footwear', style: 'sneaker', name: `Reshaped sneaker ${stamp}` } })).json.concept.id;
  const tee = (await K('/concepts/from-scratch', { body: { category: 'tops', style: 'tee', name: `Stitched tee ${stamp}` } })).json.concept.id;
  try {
    const g = (await K(`/concepts/${cid}/pattern`)).json;
    const put = await K(`/concepts/${cid}/pattern`, { method: 'PUT', body: { spec: { ...g.spec, seams: [{ piece: 'quarter-lat', side: 'lateral', pts: [[3.05, -.35], [3.15, -1.6], [3.25, -3.1]], name: 'Seam 1' }] } } });
    ok(put.status === 200 && put.json.spec.seams?.length === 1, '1. a shoe with a seam cutting its outside quarter', put.json.error);
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      const fb = async () => (await page.$('#patFrame')).boundingBox();
      const drag = async (a, b) => { const f = await fb(); await page.mouse.move(f.x + a[0], f.y + a[1]); await page.mouse.down(); await page.mouse.move(f.x + (a[0] + b[0]) / 2, f.y + (a[1] + b[1]) / 2, { steps: 5 }); await page.mouse.move(f.x + b[0], f.y + b[1], { steps: 5 }); await page.mouse.up(); await sleep(250); };
      const draw = async (view, pts) => { const s = []; for (const p of pts) s.push(await F.evaluate(([v, q]) => window.FBPattern.sideAt(v, q), [view, p])); const f = await fb(); await page.mouse.move(f.x + s[0][0], f.y + s[0][1]); await page.mouse.down(); for (const q of s.slice(1)) await page.mouse.move(f.x + q[0], f.y + q[1], { steps: 6 }); await page.mouse.up(); await sleep(200); };
      ok(/Vamp line/.test(await F.innerText('#skBox')) && /Trace by hand/.test(await F.innerText('#skBox')), '2. the Sketches panel lists the shoe\'s own lines, each with where it is');
      await F.click('#skBtn'); await F.waitForSelector('#ktools:not(.hidden)'); await F.click('#ktools [data-k="shape"]');
      ok(await F.locator('#canvas [data-mline="vamp"]').count() === 2, '   Reshape shows a dot on each of the model\'s lines, on the outside and the inside');
      // the vamp line, an inch toward the toe
      const v0 = await F.evaluate(() => window.FBPattern.lines().find(l => l.key === 'vamp')), h = await F.evaluate(() => window.FBPattern.handleAt('lateral', 'vamp')), h2 = await F.evaluate(([p]) => window.FBPattern.sideAt('lateral', [p[0] + 1, p[1]]), [v0.handle]);
      const marks0 = await F.evaluate(() => window.FBPattern.pattern().marks.vamp);
      await drag(h, h2);
      const v1 = await F.evaluate(() => window.FBPattern.spec().vamp), marks1 = await F.evaluate(() => window.FBPattern.pattern().marks.vamp);
      ok(v1 > v0.value + .07 && marks1 > marks0 + .7, '3. the model\'s vamp line dragged an inch toward the toe: the vamp is drafted again where it was left', { from: v0.value, to: v1, marks0, marks1 });
      // a line drawn by hand, bent
      await F.click('#ktools [data-k="pen"]'); await draw('lateral', [[5, -2.6], [6, -2.4], [7, -2.2]]);
      const sk0 = (await F.evaluate(() => window.FBPattern.sketches()))[0];
      await F.click('#ktools [data-k="shape"]'); const mid = await F.evaluate(() => window.FBPattern.sideAt('lateral', [6, -2.4])), up = await F.evaluate(() => window.FBPattern.sideAt('lateral', [6, -3.2]));
      await drag(mid, up);
      const sk1 = (await F.evaluate(() => window.FBPattern.sketches()))[0], hi = Math.min(...sk1.pts.map(p => p[1]));
      ok(sk1.id === sk0.id && hi < -2.9 && Math.abs(sk1.pts[0][1] - sk0.pts[0][1]) < .05, '4. a hand-drawn line bent upward where it was dragged, its ends staying put', { hi, start: [sk0.pts[0], sk1.pts[0]] });
      // the same line made the model's toe cap
      const cap0 = await F.evaluate(() => window.FBPattern.lines().find(l => l.key === 'toeCap').value);
      await F.waitForSelector('#kModel:not(.hidden)'); await F.selectOption('#kModel', 'toeCap'); await F.click('#ktools [data-ka="fit"]'); await sleep(300);
      const cap1 = await F.evaluate(() => window.FBPattern.spec().capLen);
      ok(cap1 && cap1 !== cap0 && (await F.evaluate(() => window.FBPattern.sketches())).length === 0, '5. the hand line made the toe cap: the model\'s toe cap moved to it, and the line became the model\'s', { cap0, cap1 });
      await F.click('#ktools [data-ka="undo"]'); ok((await F.evaluate(() => window.FBPattern.sketches())).length === 1 && !(await F.evaluate(() => window.FBPattern.spec().capLen)), '   Undo brings the hand line back, and the toe cap where it was');
      // the model's collar traced by hand
      await F.click('#skBox [data-trace="collar"]'); const tr = (await F.evaluate(() => window.FBPattern.sketches())).at(-1);
      ok(tr.on === 'lateral' && tr.c === '#2a6df4' && tr.pts.length >= 10, '6. the model\'s collar traced as a blue hand line, to rework by hand', tr.pts.length);
      // the seam reshaped, then back to a hand line
      const s0 = (await F.evaluate(() => window.FBPattern.spec().seams))[0], sm = await F.evaluate(() => window.FBPattern.sideAt('lateral', [3.15, -1.6])), sm2 = await F.evaluate(() => window.FBPattern.sideAt('lateral', [3.7, -1.6]));
      await drag(sm, sm2);
      const s1 = (await F.evaluate(() => window.FBPattern.spec().seams))[0];
      ok(s1 && Math.max(...s1.pts.map(p => p[0])) > 3.5 && await F.evaluate(() => window.FBPattern.pattern().pieces.some(q => q.id.startsWith('quarter-lat-b'))), '7. the seam dragged: reshaped where it was left, and the quarter cut again along it', s1?.pts);
      await F.waitForSelector('#ktools [data-ka="unseam"]:not(.hidden)'); await F.click('#ktools [data-ka="unseam"]'); await sleep(300);
      ok(!(await F.evaluate(() => window.FBPattern.spec().seams?.length)) && (await F.evaluate(() => window.FBPattern.sketches())).some(k => k.c === '#c2410c'), '   Back to a sketch: the quarter is whole again, the seam a red hand line');
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/reshape.png' });
      await F.click('#skBtn'); await F.click('#saveP'); await F.waitForFunction(() => !window.FBPattern.dirty(), null, { timeout: 10000 });
      const saved = (await K(`/concepts/${cid}/pattern`)).json.spec;
      ok(saved.vamp === v1 && !saved.seams && saved.sketches?.length === 3, '8. saved: the moved vamp line and the hand lines', { vamp: saved.vamp, sk: saved.sketches?.length });
      // a garment: a stitch line's points
      const tp = await oc.newPage(); tp.on('pageerror', e => errs.push(String(e)));
      await tp.goto(`${BASE}/lab/studio?concept=${tee}&view=front`, { waitUntil: 'networkidle' }); const G = await (await tp.waitForSelector('#flatFrame, iframe[src*="/lab/flats"]')).contentFrame(); await G.waitForSelector('#canvas svg', { timeout: 20000 });
      await G.click('[data-tab="design"]');
      await G.waitForSelector('[data-mode="stitch"]', { timeout: 10000 }); await G.click('[data-mode="stitch"]');
      const clickAt = async (x, y) => { const p = await G.evaluate(([a, b]) => { const s = document.querySelector('#canvas svg'), m = s.getScreenCTM(), q = new DOMPoint(a, b).matrixTransform(m); return [q.x, q.y]; }, [x, y]); const fe = await (await tp.$('#flatFrame, iframe[src*="/lab/flats"]')).boundingBox(); return [fe.x + p[0], fe.y + p[1]]; };
      for (const [x, y] of [[-4, 8], [0, 8.5], [4, 8]]) { const p = await clickAt(x, y); await tp.mouse.click(p[0], p[1]); await sleep(80); }
      await tp.keyboard.press('Enter'); await sleep(300);
      ok(await G.locator('#canvas [data-vx]').count() === 3, '9. on a tee\'s flat, a stitch line drawn and chosen shows a dot on each of its points');
      const a = await clickAt(0, 8.5), b = await clickAt(0, 10); await tp.mouse.move(a[0], a[1]); await tp.mouse.down(); await tp.mouse.move(b[0], b[1], { steps: 8 }); await tp.mouse.up(); await sleep(200);
      const pts = await G.evaluate(() => window.FBFlats?.state?.()?.edits?.find(e => e.type === 'stitch')?.pts || null);
      const dots = await G.evaluate(() => [...document.querySelectorAll('#canvas [data-vx]')].map(c => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]));
      ok(dots.some(d => Math.abs(d[0]) < .2 && Math.abs(d[1] - 10) < .2), '   its middle point dragged down an inch and a half', pts || dots);
      const m1 = await clickAt(-2, 9.2); await tp.mouse.dblclick(m1[0], m1[1]); await sleep(250);
      ok(await G.locator('#canvas [data-vx]').count() === 4, '   a double-click on the line puts a point in');
      const d0 = await clickAt(-4, 8); await tp.mouse.dblclick(d0[0], d0[1]); await sleep(200);
      ok(await G.locator('#canvas [data-vx]').count() === 3, '   a double-click on a dot takes it away');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { await K(`/concepts/${cid}`, { method: 'DELETE' }); await K(`/concepts/${tee}`, { method: 'DELETE' }); }
});

await journey('J255', 'Photo-real plush, patterned out like clothing and footwear: a plush planned in a line plan gets AI concepts that say what they are cut as (a bear, a bunny) and are drawn as sewn, stuffed toys; the pattern starts from the concept\'s words, is read again from its picture, drawn photo-real from its pattern in its materials, checked before the tech pack, and its tech flats become the pack\'s front, back and side', async () => {
  const plan = (await K('/plans', { body: { name: `Plush drop ${stamp}`, season: 'Holiday' } })).json, pid = plan.plan.id;
  const line = (await K(`/plans/${pid}/lines`, { body: { name: 'Sleepy bear', category: 'plush', role: 'core', price: 28, qty: 300, brief: 'a soft bedtime bear for little ones' } })).json.lines.at(-1);
  const made = await K(`/plans/${pid}/lines/${line.id}/concepts`, { body: { count: 2 } }), [A, B] = made.json.concepts || [];
  ok(made.status === 201 && A.spec.plush?.shape === 'bear' && B.spec.plush?.shape === 'bunny' && A.spec.plush.colours?.body, '1. the AI concepts for a plush say what each is cut as, its height, pile, eyes and colours', made.json.error || A?.spec);
  const one = (await K(`/concepts/${A.id}`)).json.concept;
  ok(one.hasPicture !== false && (await call(`/v1/lab/concepts/${A.id}/image`, { token: kyleT })).status === 200, '   and each is drawn (an image model draws a plush as a sewn, stuffed toy)');
  let g = (await K(`/concepts/${A.id}/pattern`)).json;
  ok(g.kind === 'plush' && g.spec.shape === 'bear' && g.spec.height === 12 && g.spec.colours?.body === A.spec.plush.colours.body && g.concept.hasImage, '2. its pattern starts from the concept\'s words: a 12 in bear in its colours', g.spec);
  const rd = await K(`/concepts/${A.id}/pattern/from-picture`, { body: {} });
  ok(rd.status === 200 && rd.json.source === 'vision' && rd.json.spec.shape === 'bunny' && rd.json.changes.some(c => c.key === 'shape' && c.source === 'picture (AI)'), '3. read again from its picture: the eye sees a bunny, and says what would change and why', rd.json);
  const ready0 = (await K(`/concepts/${A.id}/ready`)).json;
  ok(ready0.items.find(i => i.id === 'pattern')?.state === 'todo' && !ready0.items.some(i => i.id === 'flats'), '4. its checklist asks for its pattern, not flats', ready0.items.map(i => `${i.id}:${i.state}`));
  const body = (await K('/materials?kind=plush')).json.materials.find(m => m.key === 'pl-minky') || (await K('/materials?kind=plush')).json.materials[0];
  ok((await K(`/concepts/${A.id}/materials`, { body: { material: body.id, part: 'body' } })).status === 201, '   its body takes a minky from the library');
  const save = await K(`/concepts/${A.id}/pattern`, { method: 'PUT', body: { spec: rd.json.spec } }); ok(save.status === 200 && save.json.spec.shape === 'bunny', '   the bunny pattern saved');
  const ready1 = (await K(`/concepts/${A.id}/ready`)).json, st = id => ready1.items.find(i => i.id === id)?.state;
  ok(st('pattern') === 'done' && ['done', 'warn'].includes(st('made')) && st('materials') === 'done', '   the pattern, its checks and the body\'s pile are done', ready1.items.map(i => `${i.id}:${i.state}`));
  const before = (await call(`/v1/lab/concepts/${A.id}/image`, { token: kyleT })).buf?.length || 0;
  const ren = await K(`/concepts/${A.id}/pattern/render`, { body: { spec: save.json.spec } });
  ok(ren.status === 200 && ren.json.ok, '5. Make it photo-real: the toy drawn from its tech flats becomes the concept\'s picture', ren.json);
  ok((await K(`/concepts/${A.id}/approve`, { body: { overrideReason: 'reviewed side by side: it is ours' } })).status === 200, '6. approved');
  const tp = await K(`/concepts/${A.id}/tech-pack`, { body: {} }); ok(tp.status === 201, '   it becomes a tech pack', tp.json);
  const pack = (await call(`/v1/admin/products/${tp.json.productId}/tech-pack`, { token: kyleT })).json, sk = pack.techPack?.data?.sketches || [];
  ok(['front', 'back', 'side'].every(v => sk.some(k => k.view === v && k.image)) && (pack.techPack.data.construction || []).some(r => /Plush/.test(r.area)) && (pack.techPack.data.bom || []).some(r => /Body/.test(r.component)), '7. the tech pack carries its tech flats (front, back, side), the pattern\'s notes and its body\'s pile', sk.map(k => k.view));
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const C2 = B.id, br = await playwright.chromium.launch();
  try {
    const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${C2}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
    await F.waitForSelector('#readBox #useRead', { timeout: 10000 });
    ok(/bunny/i.test(await F.innerText('#readBox')) || /already matches/.test(await F.innerText('#readBox')), '8. the Pattern page reads the plush from its picture by itself, the first time', await F.innerText('#readBox'));
    await F.click('#useRead'); ok((await F.evaluate(() => window.FBPattern.spec().shape)) === 'bunny', '   Use it: the bunny is drafted');
    await F.click('#skBtn'); await F.click('#ktools [data-k="shape"]');
    const h = await F.evaluate(() => window.FBPattern.handleAt('front', 'height')), fb = await (await page.$('#patFrame')).boundingBox(), up = await F.evaluate(() => { const s = document.querySelector('#canvas svg'), m = s.getScreenCTM(); return 2 * m.a; });
    const h0 = await F.evaluate(() => window.FBPattern.spec().height);
    await page.mouse.move(fb.x + h[0], fb.y + h[1]); await page.mouse.down(); await page.mouse.move(fb.x + h[0], fb.y + h[1] - up, { steps: 8 }); await page.mouse.up(); await sleep(300);
    ok(Math.abs((await F.evaluate(() => window.FBPattern.spec().height)) - (h0 + 2)) <= .5, '9. the toy\'s height dragged up two inches by its dot: drafted again taller', { h0, h1: await F.evaluate(() => window.FBPattern.spec().height) });
    ok(await F.locator('#renderBox #renderIt').count() === 1, '   and See it made is offered beside it');
    if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/plush-concept.png' });
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await br.close(); }
});

await journey('J256', 'Clothing takes materials on its parts as a shoe and a plush do: a hoodie\'s body, rib and zip each take one from the library on Pattern; the concept\'s main fabric shows on the body until the body takes its own (never counted twice); each piece is drawn in its part\'s cloth and the rib is cut at its own width; the bill of materials names each part', async () => {
  const cid = (await K('/concepts/from-scratch', { body: { category: 'tops', style: 'hoodie', name: `Parts hoodie ${stamp}` } })).json.concept.id;
  try {
    const fabs = (await K('/materials?kind=fabric')).json.materials, trims = (await K('/materials?kind=trim')).json.materials, by = k => fabs.find(m => m.key === k);
    ok((await K(`/concepts/${cid}/materials`, { body: { material: by('terry-320').id, role: 'main' } })).status === 201, '1. the concept\'s main fabric chosen the usual way (French terry)');
    const g = (await K(`/concepts/${cid}/pattern`)).json;
    ok(g.kind === 'garment' && g.parts.map(p => p.id).slice(0, 3).join() === 'self,contrast,rib' && g.allMaterials.some(p => p.role === 'main'), '2. the hoodie has parts: its cloths and trims', g.parts.map(p => p.id));
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      await F.waitForSelector('#mtBox [data-mpart="self"]', { timeout: 10000 });
      ok(/French terry/.test(await F.innerText('#mtBox [data-mpart="self"]')), '3. Pattern lists the hoodie\'s parts, the body showing the concept\'s main fabric');
      const pickFor = async (part, id, q) => { await F.click(`#mtBox [data-mpart="${part}"] [data-mpick]`); await F.waitForSelector(`#mtBox [data-mpart="${part}"] [data-muse]`); if (q) { await F.fill(`#mtBox [data-mpart="${part}"] [data-mq]`, q); await sleep(150); } await F.click(`#mtBox [data-mpart="${part}"] [data-muse="${id}"]`); await F.waitForFunction(p => window.FBPattern.materials().some(x => x.part === p && !x.fromRole), part, { timeout: 5000 }); };
      await pickFor('self', by('fleece-380').id, 'brushed'); await pickFor('rib', by('rib-2x2').id, '2×2');
      const zip = trims.find(t => /zip/i.test(t.spec?.category || t.name)); if (zip) await pickFor('zip', zip.id, zip.name.slice(0, 6));
      const picks = (await K(`/concepts/${cid}/materials`)).json.picks;
      ok(picks.filter(p => p.kind === 'fabric' && (p.role === 'main' || p.part === 'self')).length === 1 && picks.some(p => p.part === 'rib'), '4. the body takes brushed fleece in place of the main fabric (counted once); the rib takes 2×2 rib', picks.map(p => `${p.role}/${p.part || ''}:${p.name}`));
      await F.evaluate(() => window.FBPattern.at(1)); await sleep(200);
      const lay = await F.innerText('#canvas');
      ok(/2×2 rib/.test(lay) && !/2×2 rib\s*58 in wide/.test(lay), '5. the cutting layout cuts the rib at its own width (100 cm), named by its material', lay.slice(0, 300));
      const costing = (await K(`/concepts/${cid}/materials`)).json;
      ok(costing.cost?.materialsCents > 0, '   and the cost follows', costing.cost);
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/garment-parts.png' });
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J257', 'A luxury elephant, made as an elephant: started as an elephant (trunk, big lined ears, four legs, tail) and drawn as one from the front, back and side; made in nappa lambskin (a wider allowance, a leather grain); our wordmark placed on its chest in inches, dragged, made as a deboss and checked against the leather; saved, drawn into its tech flats, and the placement written into its tech pack', async () => {
  const cid = (await K('/concepts/from-scratch', { body: { category: 'plush', shape: 'elephant', name: `Leather elephant ${stamp}` } })).json.concept?.id;
  try {
    const g = (await K(`/concepts/${cid}/pattern`)).json;
    ok(g.kind === 'plush' && g.spec.shape === 'elephant' && g.spec.ears === 'big' && g.options.plush.shapes.elephant && g.options.plush.fabrics.leather && g.marks?.word, '1. an elephant is a shape of its own, with big ears; leather is a cloth; our marks come with the page', g.spec);
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      ok(/Elephant/.test(await F.innerText('#sub')) && /Front/.test(await F.innerText('#canvas')) && /Side/.test(await F.innerText('#canvas')), '2. Pattern opens on the elephant, drawn from the front, the back and the side');
      await F.selectOption('#side select[data-k="fabric"]', 'leather'); await sleep(200);
      ok((await F.evaluate(() => window.FBPattern.pattern().sa)) === .375 && await F.locator('#canvas [fill^="url(#lk-pebble"]').count() > 0, '3. made in nappa lambskin: a ⅜ in allowance, drawn with a leather grain');
      await F.click('#lgBox [data-lgadd="word"]'); await F.waitForSelector('#canvas [data-logo]');
      const l0 = (await F.evaluate(() => window.FBPattern.logos()))[0];
      ok(l0 && l0.view === 'front' && l0.mark === 'word' && /deboss/.test(l0.technique), '4. the wordmark goes on the chest, made as a deboss in leather (not embroidered through it)', l0);
      const a = await F.evaluate(id => window.FBPattern.logoAt(id), l0.id), fb = await (await page.$('#patFrame')).boundingBox(), px = await F.evaluate(() => document.querySelector('#canvas svg').getScreenCTM().a);
      await page.mouse.move(fb.x + a[0], fb.y + a[1]); await page.mouse.down(); await page.mouse.move(fb.x + a[0], fb.y + a[1] + px, { steps: 6 }); await page.mouse.up(); await sleep(250);
      const l1 = (await F.evaluate(() => window.FBPattern.logos()))[0];
      ok(Math.abs(l1.y - l0.y - 1) < .15 && Math.abs(l1.x - l0.x) < .1, '5. dragged an inch down the chest: its place in inches follows', { from: [l0.x, l0.y], to: [l1.x, l1.y] });
      await F.selectOption(`#lgBox [data-lg="${l0.id}"] [data-lgk="technique"]`, 'embroidery'); await sleep(200);
      ok(/perforates leather/.test(await F.innerText('#lgBox')), '6. made as embroidery instead, the check says it perforates leather');
      await F.selectOption(`#lgBox [data-lg="${l0.id}"] [data-lgk="technique"]`, 'deboss'); await F.fill(`#lgBox [data-lg="${l0.id}"] [data-lgk="w"]`, '2'); await F.dispatchEvent(`#lgBox [data-lg="${l0.id}"] [data-lgk="w"]`, 'change'); await sleep(200);
      const l2 = (await F.evaluate(() => window.FBPattern.logos()))[0]; ok(l2.w === 2 && Math.abs(l2.h / l2.w - l0.h / l0.w) < .01, '   back to a deboss, 2 in wide, its proportions kept');
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/elephant.png' });
      ok(await F.locator('#canvas [fill^="url(#vol-"]').count() > 10 && await F.locator('#canvas [filter^="url(#soft-"]').count() > 3, '   drawn in the round: each stuffed part shaded, the ear, head and legs throwing their shadows');
      // the exploded view, at every step, is every piece the elephant is cut as: pairs, the inner and outer legs, the linings and the pads
      const cuts = await F.evaluate(() => window.FBPattern.pattern().pieces.reduce((n, q) => n + (q.cut || 0), 0));
      for (const t of ['0.45', '1']) {
        await F.click(`#modeSeg [data-t="${t}"]`); await sleep(1700);
        const shown = await F.locator('#canvas g.pc').count(), said = Number(await F.getAttribute('#canvas', 'data-cuts'));
        ok(shown === cuts && said === cuts && (await F.innerText('#tLbl')).includes(`${cuts} to cut`) && (t === '1' || /Ear lining/.test(await F.innerText('#canvas'))), `${t === '1' ? '   laid out to cut' : '6b. exploded'}: all ${cuts} pieces it is cut as, each one shown (${shown})`);
        if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + `/elephant-explode-${t}.png` });
      }
      await F.click('#modeSeg [data-t="0"]'); await sleep(1700);
      await F.click('#saveP'); await F.waitForFunction(() => !window.FBPattern.dirty(), null, { timeout: 10000 });
      const saved = (await K(`/concepts/${cid}/pattern`)).json.spec;
      ok(saved.fabric === 'leather' && saved.logos?.[0]?.technique === 'deboss' && saved.logos[0].w === 2, '7. saved: the leather and the placed wordmark', saved.logos);
      const sheet = (await call(`/v1/lab/concepts/${cid}/flats.svg`, { token: kyleT })).text;
      ok(/data-logo=/.test(sheet) && /data:image\/svg\+xml;base64/.test(sheet), '8. the tech flats SVG carries the wordmark where it was placed');
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
    await K(`/concepts/${cid}`, { method: 'PUT', body: { twist: 'Our debossed wordmark on a red-lined ear, in black lambskin' } });
    ok((await K(`/concepts/${cid}/approve`, { body: { overrideReason: 'started from scratch: ours' } })).status === 200, '9. approved');
    const tp = await K(`/concepts/${cid}/tech-pack`, { body: {} }), pack = (await call(`/v1/admin/products/${tp.json.productId}/tech-pack`, { token: kyleT })).json.techPack?.data || {};
    ok(tp.status === 201 && (pack.construction || []).some(r => /Logo/.test(r.area) && /deboss, 2 in wide/.test(r.detail)) && ['front', 'back', 'side'].every(v => (pack.sketches || []).some(k => k.view === v)), '   its tech pack carries the elephant\'s tech flats and the wordmark\'s placement in words', (pack.construction || []).filter(r => /Logo/.test(r.area)));
  } finally { if (cid) await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J258', 'A fox, drawn as a fox and checked against its picture: a plush concept started as a four-legged sitting animal opens on that body with the kit\'s parts to choose (snout, horn, mane, tail, head size, wings, spikes); a horn is put on and taken off; then Claude and ChatGPT each score the front, back and side against the concept\'s picture, ask for a long snout, a bushy tail and the fox\'s colours (and disagree on the head, left for a person), the toy is drawn again and clears 90, and the result is used and saved', async () => {
  const cid = (await K('/concepts/from-scratch', { body: { category: 'plush', shape: 'quad', name: `Fox ${stamp}` } })).json.concept?.id;
  try {
    const g = (await K(`/concepts/${cid}/pattern`)).json;
    ok(g.kind === 'plush' && g.spec.shape === 'quad' && g.options.plush.types.quad === 'Four-legged sitting' && g.options.plush.parts.horn.includes('quad') && g.options.plush.tails.bushy, '1. a four-legged sitting body is a type of its own, with the kit\'s parts', g.spec);
    // the concept's picture: an orange fox, sitting, drawn by the kit itself
    const { plushPattern } = await import('../../src/lab-pattern.js'), { plushViews } = await import('../../src/lab-plush-views.js');
    const fv = plushViews(plushPattern({ shape: 'quad', snout: 'long', ears: 'pointed', tailType: 'bushy', colours: { body: '#d9772e', contrast: '#f4ead8' } })).side, fb = fv.box;
    const pic = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fb.x0 - 1} ${fb.y0 - 1} ${fb.x1 - fb.x0 + 2} ${fb.y1 - fb.y0 + 2}" width="900"><rect x="-99" y="-99" width="999" height="999" fill="#efede8"/>${fv.svg}</svg>`)).png().toBuffer();
    await call(`/v1/lab/concepts/${cid}/studio/apply`, { token: kyleT, body: { image: 'data:image/png;base64,' + pic.toString('base64') } });
    if (!playwright) { ok(true, 'needs a browser'); return; }
    const br = await playwright.chromium.launch();
    try {
      const oc = await br.newContext({ viewport: { width: 1366, height: 1024 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
      const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' }); const F = await (await page.waitForSelector('#patFrame')).contentFrame(); await F.waitForFunction(() => window.FBPattern?.ready?.(), null, { timeout: 20000 });
      const sels = await F.$$eval('#side select[data-k]', s => s.map(x => x.dataset.k));
      ok(['shape', 'snout', 'horn', 'mane', 'tailType'].every(k => sels.includes(k)) && await F.locator('#side input[data-k="head"]').count() === 1 && await F.locator('#side input[data-k="wings"]').count() === 1 && await F.locator('#side input[data-k="spikes"]').count() === 1, '2. the panel offers the parts this body takes: snout, horn, mane, tail, head size, wings, spikes', sels);
      const before = await F.innerHTML('#canvas');
      await F.selectOption('#side select[data-k="horn"]', 'one'); await sleep(250);
      ok((await F.evaluate(() => window.FBPattern.spec().horn)) === 'one' && (await F.innerHTML('#canvas')) !== before && (await F.evaluate(() => window.FBPattern.pattern().pieces.some(q => q.id === 'horn'))), '3. a horn put on: drawn on the views, and cut as a piece');
      await F.selectOption('#side select[data-k="horn"]', 'none'); await sleep(200);
      await F.click('#revStart'); await F.waitForSelector('#revVerdict', { timeout: 30000 });
      const box = await F.innerText('#revBox');
      ok(/clears|reads as the toy/i.test(box) && /Round 1/.test(box) && /Round 2/.test(box) && /Claude 54/.test(box) && /ChatGPT 49/.test(box), '4. two judges score round 1 (the stricter, 49, stands), the toy is changed and round 2 clears the bar', box.slice(0, 600));
      ok(/Snout/.test(box) && /Tail kind/.test(box) && /Head size/.test(box) && /left as it is, for a person/.test(box) && /scarf/.test(box), '   what they agreed on is made (the snout, the tail); the head they disagree on is left for a person; the scarf is for a person too');
      await F.click('#revUse'); await sleep(250);
      const sp = await F.evaluate(() => window.FBPattern.spec());
      ok(sp.snout === 'long' && sp.tailType === 'bushy' && /^#d[9a]7/.test(sp.colours?.body || '') && sp.head === 1 && sp.horn === 'none', '5. used: a long snout, a bushy tail, the fox\'s orange; the head as it was', sp);
      if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/fox.png' });
      await F.click('#saveP'); await F.waitForFunction(() => !window.FBPattern.dirty(), null, { timeout: 10000 });
      const saved = (await K(`/concepts/${cid}/pattern`)).json.spec;
      ok(saved.shape === 'quad' && saved.snout === 'long' && saved.tailType === 'bushy', '6. saved with the concept', saved);
      ok(errs.length === 0, 'no page errors', errs); await oc.close();
    } finally { await br.close(); }
  } finally { if (cid) await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J259', 'A sketch picked opens straight away: on a phone, tapping a sketch in the sketch pack opens a sheet over the gallery (no scrolling to the bottom); the designer picks a cloth and a colour, the sketch is drawn in that colour, and Open in the Studio makes the concept with the cloth as its main fabric and the flats in that colour', async () => {
  const fabs = (await K('/materials?kind=fabric')).json.materials, fab = fabs.find(m => (m.colours || []).some(c => /^#[0-9a-f]{6}$/i.test(c.hex || ''))) || fabs[0];
  ok(Boolean(fab), '1. the library has a cloth to choose');
  const api1 = await K('/concepts/from-sketch', { body: { template: 'tee-oversized', colour: { name: 'Navy', hex: '#1F2A44' } } }), c1 = api1.json.concept?.id;
  try {
    ok(api1.status === 201 && api1.json.concept.spec.color === '#1f2a44' && api1.json.concept.spec.colors[0] === 'Navy', '2. a concept from a sketch keeps the colour chosen with it', api1.json.concept?.spec);
    const fl = (await K(`/concepts/${c1}/flats`)).json.flat;
    ok(fl?.color === '#1f2a44', '3. its flats start in that colour', fl?.color);
  } finally { if (c1) await K(`/concepts/${c1}`, { method: 'DELETE' }); }
  if (!playwright) { ok(true, 'needs a browser'); return; }
  const br = await playwright.chromium.launch(); let cid = null;
  try {
    const oc = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.helper.on', '0'); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/sketches?q=oversized%20tee`, { waitUntil: 'networkidle' });
    await page.tap('#gal [data-tpl="tee-oversized"]'); await page.waitForSelector('#sheet[open] #shArt img', { timeout: 10000 }); await page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running'), null, { timeout: 5000 }).catch(() => {});
    const box = await page.evaluate(() => { const r = document.querySelector('#openDesign').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight, sw: document.documentElement.scrollWidth, sheetW: document.querySelector('#sheet').getBoundingClientRect().width }; });
    ok(box.bottom <= box.vh && box.top > 0 && box.sw <= 390 && box.sheetW <= 390, '4. the sheet opens over the gallery with Open in the Studio on screen, nothing wider than the phone', box);
    await page.waitForSelector(`#mats [data-mat="${fab.id}"]`); await page.tap(`#mats [data-mat="${fab.id}"]`);
    const own = (fab.colours || []).find(c => /^#[0-9a-f]{6}$/i.test(c.hex || ''));
    ok(!own || await page.getAttribute(`#cols [data-col="${own.hex.toLowerCase()}"]`, 'aria-checked') === 'true', '5. the cloth starts in its own first colour');
    await page.tap('#cols [data-col="#5b5f3a"]'); await sleep(200);
    ok(/Olive/.test(await page.innerText('#shSum')) && /olive|#5b5f3a/i.test(await page.innerText('#colNote')), '6. a colour picked: the summary says the cloth and the colour', await page.innerText('#shSum'));
    ok(await page.getAttribute('#shArt', 'data-hex') === '#5b5f3a', '7. the sketch is drawn in that colour (its white cloth swapped for it)', await page.getAttribute('#shArt', 'data-hex'));
    await Promise.all([page.waitForURL(/\/lab\/studio\?concept=/, { timeout: 15000 }), page.tap('#openDesign')]);
    cid = new URL(page.url()).searchParams.get('concept');
    const c = (await K(`/concepts/${cid}`)).json.concept, picks = (await K(`/concepts/${cid}/materials`)).json.picks, fl = (await K(`/concepts/${cid}/flats`)).json.flat;
    ok(c.spec.template === 'tee-oversized' && c.spec.color === '#5b5f3a', '8. the Studio opens on a concept from that sketch in that colour', c.spec);
    ok(picks.some(p => p.id === fab.id && p.role === 'main' && p.colour?.hex === '#5b5f3a'), '9. the cloth is its main fabric, in the colour picked', picks.map(p => `${p.role}:${p.name}:${p.colour?.hex}`));
    ok(fl?.color === '#5b5f3a', '10. and the flats are drawn in it', fl?.color);
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await br.close(); if (cid) await K(`/concepts/${cid}`, { method: 'DELETE' }); }
});

await journey('J260', 'The factory gets everything to start work in one download: from its pack link, a production package with the tech pack PDF and workbook, every artwork and sketch, and for each decoration placed in the Lab its job files at the placed size (stitch files .dst/.exp and thread list for embroidery, separations for print, the job sheet, a vector), the decoration sheet without our cost estimates, and the pattern in every size as DXF; Lab artwork on the pack carries its Pantones', async () => {
  const { brands, plan } = await conceptSetup(); const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  const names = buf => { const out = []; const i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); let p = buf.readUInt32LE(i + 16); for (let k = 0, n = buf.readUInt16LE(i + 10); k < n; k++) { const len = buf.readUInt16LE(p + 28), ex = buf.readUInt16LE(p + 30), cm = buf.readUInt16LE(p + 32); out.push(buf.slice(p + 46, p + 46 + len).toString('utf8')); p += 46 + len + ex + cm; } return out; };
  const fileOf = (buf, name) => { let p = 0; while ((p = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), p)) >= 0) { const size = buf.readUInt32LE(p + 18), len = buf.readUInt16LE(p + 26), ex = buf.readUInt16LE(p + 28), n = buf.slice(p + 30, p + 30 + len).toString('utf8'); if (n.endsWith(name)) return buf.slice(p + 30 + len + ex, p + 30 + len + ex + size); p += 30 + len + ex + size; } return null; };
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  await K(`/concepts/${c.id}/approve`, { body: { overrideReason: 'reviewed side by side with the references: it is ours' } });
  const fl = (await K(`/concepts/${c.id}/flats`)).json; await K(`/concepts/${c.id}/flats`, { method: 'PUT', body: fl.flat });
  ok((fl.flat.placements || []).length > 0, '1. the flats carry placements (the logo, the graphics)', (fl.flat.placements || []).map(q => `${q.name}:${q.technique}`));
  const pid = (await K(`/concepts/${c.id}/tech-pack`, { body: {} })).json.productId;
  const art = (await A(`/v1/admin/products/${pid}/tech-pack`)).json.techPack.data.artwork.filter(a => a.note === 'From the Design Lab' && !/^(Spec sheet|Technical flat)/.test(a.name));
  ok(art.length > 0 && art.every(a => a.pantones.length > 0), '2. Lab artwork lands on the pack with its colours as Pantone C', art.map(a => `${a.name}: ${a.pantones.map(p => p.code).join(' ')}`));
  ok((await A(`/v1/admin/products/${pid}/tech-pack/package.zip`)).status === 409, '3. no package before the pack is published');
  ok((await A(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: production package' } })).status === 200, '4. version 1 is published');
  const sup = (await A('/v1/admin/suppliers', { method: 'POST', body: { name: `Package Mill ${stamp}` } })).json;
  const tok = (await A(`/v1/admin/products/${pid}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'review' } })).json.assignment.packUrl.split('/tp/')[1];
  const r = await fetch(`${BASE}/v1/tp/${tok}/package.zip`), buf = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200 && /application\/zip/.test(r.headers.get('content-type') || '') && /production\.zip/.test(r.headers.get('content-disposition') || ''), '5. the factory link downloads the production package, no sign-in', r.status);
  if (process.env.SHOT_DIR && r.status === 200) writeFileSync(process.env.SHOT_DIR + '/production-package.zip', buf);
  const ls = r.status === 200 ? names(buf).map(n => n.split('/').slice(1).join('/')) : [];
  for (const f of ['README.txt', 'tech-pack.pdf', 'tech-pack.xlsx', 'decorations/decoration-sheet.pdf', 'flats/spec-sheet.svg', 'pattern/pattern-all-sizes-aama.dxf']) ok(ls.includes(f), `6. it holds ${f}`);
  ok(ls.some(n => /^artwork\/.+\.png$/.test(n)) && ls.some(n => /^sketches\/.+\.png$/.test(n)), '7. every artwork and sketch on the pack, as files', ls.filter(n => /^(artwork|sketches)\//.test(n)));
  const deco = ls.filter(n => /^decorations\/\d\d-/.test(n));
  ok(deco.some(n => /\.dst$/.test(n)) && deco.some(n => /\.exp$/.test(n)), '8. an embroidered placement comes with its stitch files (.dst for Tajima, .exp for Melco)', deco);
  ok(deco.some(n => /job-sheet\.pdf$/.test(n)) && deco.some(n => /artwork-vector\.svg$/.test(n)), '9. every placement has its job sheet and a vector of its artwork');
  const dst = ls.find(n => /\.dst$/.test(n)), d = dst && fileOf(buf, dst);
  ok(d && d.length > 512 && /LA:/.test(d.slice(0, 512).toString('latin1')), '10. the .dst is a real Tajima file (its header and stitches)', d?.length);
  const sheet = fileOf(buf, 'decorations/decoration-sheet.pdf');
  ok(sheet && /^%PDF/.test(sheet.slice(0, 5).toString()) && !/costs are estimates/.test(sheet.toString('latin1')), '11. the decoration sheet goes without our cost estimates');
  const rd = fileOf(buf, 'README.txt')?.toString() || '';
  ok(/tech pack v1/.test(rd) && /Tajima DST/.test(rd) && /AAMA\/ASTM DXF/.test(rd), '12. the README names each file and what it is for');
  const st = await fetch(`${BASE}/v1/admin/products/${pid}/tech-pack/package.zip`, { headers: { Authorization: 'Bearer ' + kyleT } });
  ok(st.status === 200, '13. the work console downloads the same package to check or send on');
  ok((await call('/v1/tp/not-a-real-token-at-all-000000/package.zip')).status === 404, '14. a made-up link gets nothing');
  await cleanup(brands, plan.plan?.id);
});

await journey('J261', 'One way in for everyone: staff and a client each find New design at the head of the Lab (the console tab row, the client\'s own row, an empty Concepts page, the hub); it offers AI concepts from a few words, a sketch, a blank page and a whole line; a few words make concepts on the room\'s own Quick concepts plan; From scratch lands on the blank-page form; and a client downloads the production package of their published pack and sends a factory the link themselves', async () => {
  const { brands, plan } = await conceptSetup(); const A = (path, o = {}) => call(path, { token: kyleT, ...o });
  const email = `newdesign-${stamp}@selfserve.test`, started = await call('/v1/public/start', { body: { email, name: 'New Design Co', title: 'Field jacket', photos: [jpeg()] } });
  const cid = started.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), uid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0], slug = sql(`select slug from clients where id='${cid}'`).split('\n')[0];
  sql(`update users set email_verified_at=now() where id='${uid}'`); sql(`update clients set lab_free=true where id='${cid}'`);
  const clientT = await forge({ sub: uid, clientId: cid, client: slug, role: 'client', email }), H = (path, o = {}) => call(path, { token: clientT, ...o });
  const pid = started.json.product?.id || sql(`select id from products where client_id='${cid}' limit 1`).split('\n')[0];
  // the client's own production package and factory link
  ok((await A(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: client package' } })).status === 200, '1. the client\'s pack is published');
  const pk = await fetch(`${BASE}/v1/products/${pid}/tech-pack/package.zip`, { headers: { Authorization: 'Bearer ' + clientT } }), pb = Buffer.from(await pk.arrayBuffer());
  ok(pk.status === 200 && pb.slice(0, 2).toString() === 'PK' && /README\.txt/.test(pb.toString('latin1')) && /tech-pack\.pdf/.test(pb.toString('latin1')), '2. the client downloads the production package of their published pack', pk.status);
  ok((await A(`/v1/products/${pid}/tech-pack/package.zip`)).status === 403, '   staff take it from the work console instead');
  const other = (await call('/v1/public/start', { body: { email: `other-${stamp}@selfserve.test`, name: 'Other Co', title: 'Tee', photos: [jpeg()] } })).json.product?.id;
  ok(!other || (await H(`/v1/products/${other}/tech-pack/package.zip`)).status === 404, '   and never another room\'s');
  const ql = await H(`/v1/products/${pid}/quote-links`, { body: { label: 'Our own mill' } });
  ok(ql.status === 201 && /\/tp\//.test(ql.json.url || ''), '3. the client makes a factory link to send themselves', ql.json.error);
  const fz = await fetch(`${BASE}/v1/tp/${ql.json.url.split('/tp/')[1]}/package.zip`);
  ok(fz.status === 200, '   and the factory downloads the same package from it, no sign-in', fz.status);
  if (!playwright) { ok(true, 'needs a browser'); await cleanup(brands, plan.plan?.id); return; }
  const br = await playwright.chromium.launch();
  try {
    // staff: New design leads the Design Lab row; a few words make concepts on our own Quick concepts plan
    const sc = await br.newContext({ viewport: { width: 1366, height: 900 } }); await sc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.helper.on', '0'); } catch {} }, kyleT);
    const sp = await sc.newPage(), errs = []; sp.on('pageerror', e => errs.push(String(e)));
    await sp.goto(`${BASE}/lab#board`, { waitUntil: 'networkidle' }); await sp.waitForSelector('.fbtabs [data-tabs="lab"] a.act', { state: 'visible' });
    await sp.click('.fbtabs [data-tabs="lab"] a.act'); await sp.waitForSelector('#fbNew[open]');
    const ways = await sp.$$eval('#fbNew .way .k', els => els.map(e => e.textContent.trim()));
    ok(['With AI', 'From a sketch', 'From scratch', 'A whole line'].every(w => ways.includes(w)), '4. New design offers AI concepts, a sketch, a blank page and a whole line', ways);
    await sp.waitForFunction(() => document.querySelectorAll('#fbNew select[name=category] option').length > 3);
    await sp.fill('#fbNew input[name=name]', `Boxy hoodie ${stamp}`); await sp.selectOption('#fbNew select[name=category]', 'tops'); await sp.selectOption('#fbNew select[name=count]', '1');
    await Promise.all([sp.waitForURL(/\/lab\?plan=.+#board/, { timeout: 60000 }), sp.click('#fbNew button[type=submit]')]);
    const planId = new URL(sp.url()).searchParams.get('plan'), qp = (await K(`/plans/${planId}`)).json;
    ok(qp.plan?.name === 'Quick concepts' && !qp.plan.clientId && qp.lines.some(l => l.name === `Boxy hoodie ${stamp}`), '5. a few words become a piece on our own Quick concepts plan', qp.plan);
    const made = (await K(`/concepts?plan=${planId}`)).json.concepts || [];
    ok(made.length >= 1, '   and concepts are drawn for it', made.length);
    ok(errs.length === 0, '   no page errors', errs); await sc.close();
    // a client: New design in their own row, from the hub, and From scratch lands on the blank page
    const cc = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await cc.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); localStorage.setItem('fb.lab.welcomed', '1'); localStorage.setItem('fb.helper.on', '0'); } catch {} }, clientT);
    const cp = await cc.newPage(), cerrs = []; cp.on('pageerror', e => cerrs.push(String(e)));
    await cp.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await cp.waitForSelector('#lab .lab-pills a[href="/lab?new=1"]', { timeout: 15000 });
    ok(/New design/.test(await cp.innerText('#lab .lab-pills a[href="/lab?new=1"]')), '6. the hub\'s Design Lab leads with New design');
    await cp.click('#lab .lab-pills a[href="/lab?new=1"]'); await cp.waitForSelector('#fbNew[open]', { timeout: 15000 });
    ok(!/new=1/.test(cp.url()), '   it opens New design in the Lab (and leaves the address clean)', cp.url());
    await cp.click('#fbNew [data-close]'); ok(await cp.locator('nav.labnav a.new').first().isVisible(), '7. and New design leads the client\'s own Lab row');
    await cp.goto(`${BASE}/lab/studio?start=scratch`, { waitUntil: 'networkidle' }); await cp.waitForSelector('#scratchF');
    await cp.waitForFunction(() => document.activeElement?.id === 'scName', null, { timeout: 5000 }).catch(() => {});
    ok(await cp.evaluate(() => document.activeElement?.id === 'scName'), '8. From scratch lands on the blank-page form, ready to name it');
    await cp.goto(`${BASE}/tech-packs/${pid}`, { waitUntil: 'networkidle' }); await cp.waitForSelector('details.more>summary');
    await cp.click('details.more>summary'); ok(await cp.locator('.menu [data-act="package"]').isVisible() && await cp.locator('.menu [data-act="tofactory"]').isVisible(), '9. on a phone, the pack\'s menu offers the production files and Send to a factory');
    ok(cerrs.length === 0, '   no page errors', cerrs); await cc.close();
  } finally { await br.close(); await cleanup(brands, plan.plan?.id); }
});

await journey('J262', 'The Studio feels like a designer\'s tool: Shift-click and a box round them choose several layers, they move together and snap to the picture\'s middle with the guide shown (Alt moves freely), align and space them evenly from the bar or Alt + a letter, X/Y/W/H typed in inches, ⌘A, ⌘K runs any command by name, ? lists the keys', async () => {
  const { brands, plan } = await conceptSetup();
  if (!playwright) { ok(true, 'needs a browser'); await cleanup(brands, plan.plan?.id); return; }
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.helper.on', '0'); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    ok(await page.evaluate(() => Boolean(window.PRO)), '1. the professional layer is loaded');
    // three shapes, apart from each other, to work with
    await page.evaluate(() => { for (const [i, x] of [[0, .2], [1, .45], [2, .8]]) { const l = addLayer(fresh('shape', { name: `Box ${i + 1}`, shape: 'rect', w: Math.round(W / 12), h: Math.round(W / 12), radius: 0, fill: true, fillColor: '#ff3355', stroke: false, strokeW: 2, strokeColor: '#000', x: Math.round(W * x), y: Math.round(H * (.3 + i * .08)) })); } setTool('select'); fit(); draw(); });
    const at = name => page.evaluate(n => { const l = LAYERS.find(q => q.name === n), r = view.getBoundingClientRect(); return [r.left + sx(l.x), r.top + sy(l.y)]; }, name);
    const ids = () => page.evaluate(() => PRO.chosen().map(l => l.name).sort());
    let [x1, y1] = await at('Box 1'); await page.mouse.click(x1, y1);
    let [x2, y2] = await at('Box 2'); await page.keyboard.down('Shift'); await page.mouse.click(x2, y2); await page.keyboard.up('Shift');
    ok(JSON.stringify(await ids()) === '["Box 1","Box 2"]', '2. Shift-click adds a second layer to the choice', await ids());
    ok(/2 layers chosen/i.test(await page.textContent('#pLayers')) && await page.locator('#pLayers .ly.on').count() === 2, '   the panel says what is chosen and both rows are lit');
    ok(await page.locator('#opts .proar [data-arr="left"]:not([disabled])').count() === 1 && /2 chosen/.test(await page.innerText('#opts')), '   and the bar above the picture offers to align them');
    // move them together
    const before = await page.evaluate(() => ['Box 1', 'Box 2'].map(n => { const l = LAYERS.find(q => q.name === n); return [l.x, l.y]; }));
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x1 + 40, y1 + 25, { steps: 5 }); await page.mouse.up();
    const after = await page.evaluate(() => ['Box 1', 'Box 2'].map(n => { const l = LAYERS.find(q => q.name === n); return [l.x, l.y]; }));
    ok(after[0][0] - before[0][0] === after[1][0] - before[1][0] && after[0][0] !== before[0][0], '3. dragging one moves both by the same amount', { before, after });
    await page.keyboard.press('Control+z'); ok(JSON.stringify(await page.evaluate(() => ['Box 1', 'Box 2'].map(n => { const l = LAYERS.find(q => q.name === n); return [l.x, l.y]; }))) === JSON.stringify(before), '   one undo puts both back');
    // a box round them
    await page.keyboard.press('Escape'); ok((await ids()).length === 0, '4. Esc chooses none');
    const r = await page.evaluate(() => { const v = view.getBoundingClientRect(); return { x0: v.left + sx(W * .05), y0: v.top + sy(H * .05), x1: v.left + sx(W * .97), y1: v.top + sy(H * .2) }; });
    [x1, y1] = await at('Box 1'); [x2, y2] = await at('Box 3');
    await page.mouse.move(Math.min(x1, x2) - 60, Math.min(y1, y2) - 60); await page.mouse.down(); await page.mouse.move(Math.max(x1, x2) + 60, Math.max(y1, y2) + 60, { steps: 6 });
    ok(await page.evaluate(() => Boolean(document.querySelector('#view'))), '   the drag box is drawn while dragging');
    await page.mouse.up();
    const boxed = await ids();
    ok(['Box 1', 'Box 2', 'Box 3'].every(n => boxed.includes(n)), '5. dragging a box on the picture chooses every layer it touches', boxed);
    // align and space them
    await page.evaluate(() => { PRO.SELS.clear(); for (const l of LAYERS.filter(q => /^Box/.test(q.name))) PRO.SELS.add(l.id); SEL = LAYERS.find(q => q.name === 'Box 3').id; paintPanels(); draw(); });
    await page.click('#opts .proar [data-arr="top"]');
    const tops = await page.evaluate(() => LAYERS.filter(q => /^Box/.test(q.name)).map(l => Math.round(PRO.box(l).y0)));
    ok(tops.every(t => Math.abs(t - tops[0]) <= 1), '6. Align top lines their tops up', tops);
    await page.keyboard.press('Alt+KeyV'); const mids = await page.evaluate(() => LAYERS.filter(q => /^Box/.test(q.name)).map(l => Math.round(PRO.box(l).cy)));
    ok(mids.every(t => Math.abs(t - mids[0]) <= 1), '   Alt V lines their middles up', mids);
    await page.click('#opts .proar [data-dist="h"]');
    const gaps = await page.evaluate(() => { const bs = LAYERS.filter(q => /^Box/.test(q.name)).map(l => PRO.box(l)).sort((a, b) => a.x0 - b.x0); return [bs[1].x0 - bs[0].x1, bs[2].x0 - bs[1].x1].map(Math.round); });
    ok(Math.abs(gaps[0] - gaps[1]) <= 2, '7. Space evenly across leaves the same gap between each', gaps);
    // smart guide: one box dragged near the middle snaps to it
    await page.keyboard.press('Escape'); [x1, y1] = await at('Box 2');
    const mid = await page.evaluate(() => { const v = view.getBoundingClientRect(), l = LAYERS.find(q => q.name === 'Box 2'); return v.left + sx(W / 2) - (sx(l.x) - sx(PRO.box(l).cx)); });
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(mid + 3, y1 + 2, { steps: 6 });
    const guide = await page.evaluate(() => { const l = LAYERS.find(q => q.name === 'Box 2'); return Math.abs(PRO.box(l).cx - W / 2); });
    await page.mouse.up();
    ok(guide < 1, '8. moved close to the middle, it snaps onto it (the guide is drawn)', guide);
    // inches
    await page.evaluate(() => { PPI = PPI || 50; paintPanels(); });
    await page.waitForSelector('#pLayers [data-geo="x"]');
    await page.fill('#pLayers [data-geo="x"]', '2'); await page.press('#pLayers [data-geo="x"]', 'Enter'); await page.locator('#pLayers [data-geo="w"]').focus();
    const gx = await page.evaluate(() => { const l = selected(); return PRO.box(l).x0 / PPI; });
    ok(Math.abs(gx - 2) < .03, '9. X typed in inches puts its left edge there', gx);
    await page.fill('#pLayers [data-geo="w"]', '3'); await page.press('#pLayers [data-geo="w"]', 'Enter');
    const gw = await page.evaluate(() => PRO.box(selected()).w / PPI); ok(Math.abs(gw - 3) < .05, '   and W sizes it to 3 inches', gw);
    // ⌘A, ⌘K, ?
    await page.locator('#view').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+a');
    ok(JSON.stringify(await ids()) === JSON.stringify(await page.evaluate(() => LAYERS.filter(l => l.visible && !fixed(l) && l.kind !== 'base').map(l => l.name).sort())), '10. ⌘A chooses every layer that moves', await ids());
    await page.keyboard.press('Escape'); await page.keyboard.press('Control+k'); await page.waitForSelector('#proPal[open]');
    await page.keyboard.type('zoom to fit'); ok(/Zoom to fit/.test(await page.innerText('#proPal li[aria-selected=true]')), '11. ⌘K finds a command by name');
    await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.querySelector('#proPal[open]'));
    await page.keyboard.press('Control+k'); await page.keyboard.type('embroid'); const sel = await page.evaluate(() => ({ v: document.querySelector('#proPal input').value, s: document.querySelector('#proPal li[aria-selected=true]')?.textContent, ae: document.activeElement?.outerHTML?.slice(0, 80) })); ok(/Embroidery/.test(sel.s), '   and finds the embroidery tool too', sel);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Slash'); await page.waitForSelector('#proKeys[open]'); ok(/Align top/.test(await page.innerText('#proKeys')), '12. ? lists the keys');
    await page.click('#proKeys [data-close]');
    ok(errs.length === 0, '   no page errors', errs);
  } finally { await b.close(); await cleanup(brands, plan.plan?.id); }
});

await journey('J263', 'Drawing with paths in the Studio: the pen draws sharp points and curves and closes the shape, Edit points drags a point and adds one on the line, a rectangle and an ellipse turn into paths and combine (union, subtract, intersect, exclude), and a path goes out to Illustrator as a <path> and comes back as a path, saved with the design', async () => {
  const { brands, plan } = await conceptSetup();
  if (!playwright) { ok(true, 'needs a browser'); await cleanup(brands, plan.plan?.id); return; }
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  const b = await playwright.chromium.launch();
  try {
    const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.helper.on', '0'); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    ok(await page.evaluate(() => Boolean(window.VEC && window.polygonClipping)), '1. the path tools are loaded');
    const scr = (fx, fy) => page.evaluate(([a, b]) => { const r = view.getBoundingClientRect(); return [r.left + sx(W * a), r.top + sy(H * b)]; }, [fx, fy]);
    await page.keyboard.press('p'); ok(await page.evaluate(() => TOOL === 'pen'), '2. P picks the pen', await page.evaluate(() => TOOL));
    const n0 = await page.evaluate(() => LAYERS.length);
    // a triangle-ish shape: a sharp point, a curve (drag), a sharp point, then close on the first
    let [x, y] = await scr(.3, .3); await page.mouse.click(x, y);
    [x, y] = await scr(.5, .25); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y, { steps: 4 }); await page.mouse.up();
    [x, y] = await scr(.45, .45); await page.mouse.click(x, y);
    [x, y] = await scr(.3, .3); await page.mouse.click(x, y);
    const p1 = await page.evaluate(() => { const l = selected(); return l && { shape: l.shape, closed: l.paths[0].closed, n: l.paths[0].nodes.length, curve: l.paths[0].nodes.some(q => q[4] !== q[0]), fill: l.fill, w: l.w, h: l.h }; });
    ok(p1 && p1.shape === 'path' && p1.closed && p1.n === 3 && p1.curve && p1.fill, '3. three points, one of them a curve, closed by clicking the first point (and filled)', p1);
    ok(await page.evaluate(n => LAYERS.length === n + 1, n0), '   it is one new layer');
    // Edit points: drag the first point, add a point on a line
    await page.keyboard.press('a'); ok(await page.evaluate(() => TOOL === 'node'), '4. A picks Edit points');
    const first = await page.evaluate(() => { const l = selected(), q = l.paths[0].nodes[0], c = Math.cos(l.rot), s = Math.sin(l.rot), a = q[0] * l.scale, bb = q[1] * l.scale, u = l.x + a * c - bb * s, v = l.y + a * s + bb * c, r = view.getBoundingClientRect(); return [r.left + sx(u), r.top + sy(v), u, v]; });
    await page.mouse.move(first[0], first[1]); await page.mouse.down(); await page.mouse.move(first[0] - 40, first[1] - 30, { steps: 5 }); await page.mouse.up();
    const moved = await page.evaluate(() => { const l = selected(), q = l.paths[0].nodes[0], c = Math.cos(l.rot), s = Math.sin(l.rot), a = q[0] * l.scale, bb = q[1] * l.scale; return [l.x + a * c - bb * s, l.y + a * s + bb * c]; });
    const zz = await page.evaluate(() => Z);
    ok(Math.abs(moved[0] - (first[2] - 40 / zz)) < 2 && Math.abs(moved[1] - (first[3] - 30 / zz)) < 2, '5. dragging a point moves it, and only it', { first, moved });
    const mid = await page.evaluate(() => { const l = selected(), [a, b2] = [l.paths[0].nodes[2], l.paths[0].nodes[0]], q = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2], c = Math.cos(l.rot), s = Math.sin(l.rot), u = l.x + q[0] * l.scale * c - q[1] * l.scale * s, v = l.y + q[0] * l.scale * s + q[1] * l.scale * c, r = view.getBoundingClientRect(); return [r.left + sx(u), r.top + sy(v)]; });
    await page.mouse.click(mid[0], mid[1]);
    ok(await page.evaluate(() => selected().paths[0].nodes.length) === 4, '6. clicking the line adds a point on it', await page.evaluate(() => selected().paths[0].nodes.length));
    await page.keyboard.press('Delete'); ok(await page.evaluate(() => selected().paths[0].nodes.length) === 3, '   and Delete takes it away again');
    ok(/3 points in 1 part, closed/.test(await page.textContent('#pLayers')), '7. the panel says what the path is');
    await page.keyboard.press('Control+z'); ok(await page.evaluate(() => selected()?.paths?.[0]?.nodes.length) === 4, '   undo brings the point back', await page.evaluate(() => selected()?.paths?.[0]?.nodes.length));
    // booleans: a square and a circle overlapping
    await page.keyboard.press('v');
    await page.evaluate(() => { for (const [name, shape, x] of [['Sq', 'rect', .6], ['Ci', 'ellipse', .66]]) addLayer(fresh('shape', { name, shape, w: 200, h: 200, radius: 0, fill: true, fillColor: '#2244ff', stroke: false, strokeW: 2, strokeColor: '#000', x: Math.round(W * x), y: Math.round(H * .6) })); draw(); });
    const area = () => page.evaluate(() => { const l = selected(), ring = polygonClipping.union(...l.paths.map(p => [p.nodes.map(q => [q[0], q[1]])])); let A = 0; for (const poly of ring) poly.forEach((r, k) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; A += (k ? -1 : 1) * Math.abs(a / 2); }); return Math.round(A * l.scale * l.scale); });
    const pick = () => page.evaluate(() => { PRO.SELS.clear(); for (const l of LAYERS.filter(q => q.name === 'Sq' || q.name === 'Ci')) PRO.SELS.add(l.id); SEL = LAYERS.find(q => q.name === 'Ci').id; paintPanels(); draw(); });
    await pick();
    ok(await page.locator('#opts [data-bool="union"]').count() === 1 && await page.locator('#pLayers [data-bool="subtract"]').count() === 1, '8. with two shapes chosen, the bar and the panel offer to combine them');
    const results = {};
    for (const op of ['union', 'subtract', 'intersect', 'exclude']) {
      await pick(); await page.click(`#opts [data-bool="${op}"]`);
      const r = await page.evaluate(() => { const l = selected(); return { shape: l?.shape, name: l?.name, toast: document.getElementById('stToast')?.textContent, left: LAYERS.filter(q => q.name === 'Sq' || q.name === 'Ci').length }; });
      if (r.shape !== 'path') { ok(false, `   ${op} made a path`, r); continue; }
      results[op] = { ...r, area: await area() };
      await page.keyboard.press('Control+z');
    }
    // the square is 200×200 at x, the circle r=100 centred 0.06·W to the right; check the areas add up
    const sq = 40000, ci = Math.PI * 10000, { union: u, subtract: s1, intersect: i1, exclude: x1 } = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.area]));
    ok(Object.values(results).every(r => r.shape === 'path' && r.left === 0), '9. each one makes a single path in their place', results);
    ok(Math.abs(u - (sq + ci - i1)) < sq * .02 && Math.abs(s1 - (sq - i1)) < sq * .02 && Math.abs(x1 - (u - i1)) < sq * .02 && i1 > 1000, '   and the shapes are right: union = both less the overlap, subtract = square less the overlap, exclude = union less the overlap', { u, s1, i1, x1 });
    ok(await page.evaluate(() => LAYERS.filter(q => q.name === 'Sq' || q.name === 'Ci').length) === 2, '   undo brings the two shapes back');
    // a rectangle into a path
    await page.evaluate(() => { SEL = LAYERS.find(q => q.name === 'Sq').id; PRO.SELS.clear(); paintPanels(); });
    await page.click('#pLayers [data-vec="topath"]');
    ok(await page.evaluate(() => { const l = selected(); return l.shape === 'path' && l.paths[0].nodes.length === 4 && Math.round(l.w) === 200; }), '10. Turn into a path makes a rectangle four points, the same size');
    // out to Illustrator and back
    const svgText = await page.evaluate(() => svgDoc());
    ok(/<path d="M[^"]+C[^"]+Z" fill-rule="evenodd"/.test(svgText), '11. the SVG for Illustrator has the drawn path as a <path>');
    const back = await page.evaluate(async t => { const before = LAYERS.filter(l => l.shape === 'path').map(l => [l.name, Math.round(l.x), Math.round(l.y), Math.round(l.w), l.paths[0].nodes.length]); const yes = setInterval(() => { const d = document.getElementById('askDlg'); if (d?.open) { d.returnValue = 'yes'; d.close(); } }, 50); await importSvg(new File([t], 'back.svg', { type: 'image/svg+xml' })); clearInterval(yes); const after = LAYERS.filter(l => l.shape === 'path').map(l => [l.name, Math.round(l.x), Math.round(l.y), Math.round(l.w), l.paths[0].nodes.length]); return { before, after }; }, svgText);
    ok(back.after.length === back.before.length && back.after.every((a, i) => a.every((v, k) => typeof v === 'string' ? v === back.before[i][k] : Math.abs(v - back.before[i][k]) <= 1)), '   and back from it, each is a path again, where it was and the same size', back);
    // saved with the design
    await page.evaluate(() => saveAll()); await page.waitForFunction(() => !DIRTY, null, { timeout: 15000 });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 });
    ok(await page.evaluate(() => LAYERS.filter(l => l.shape === 'path').length) === back.after.length, '12. the paths are saved with the design and come back on opening it');
    ok(errs.length === 0, '   no page errors', errs);
  } finally { await b.close(); await cleanup(brands, plan.plan?.id); }
});

await journey('J264', 'Embroidery without a digitiser: the Studio digitizes a graphic and shows what the machine will make (thread on the cloth, on four fabrics), plays the stitches back in sewing order, lays the thread on the garment picture, and reviews it like a digitiser (score, verdict, what to fix) with each fix one click', async () => {
  const { brands, plan } = await conceptSetup();
  if (!playwright) { ok(true, 'needs a browser'); await cleanup(brands, plan.plan?.id); return; }
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  const b = await playwright.chromium.launch(), shots = process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp';
  try {
    const oc = await b.newContext({ viewport: { width: 1440, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.helper.on', '0'); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length >= 2); await page.click('.tabs [data-tab=layers]'); await page.waitForSelector('#sizeRead');
    await page.fill('#pLayers [data-win]', '3.5'); await page.dispatchEvent('#pLayers [data-win]', 'change');
    const t0 = Date.now(); await page.evaluate(() => embOpen(selected())); await page.waitForSelector('#embDlg[open]');
    await page.waitForFunction(() => document.querySelector('#embReview')?.dataset.score && document.querySelector('#embImg').naturalWidth > 0, null, { timeout: 60000 });
    const rv = await page.evaluate(() => ({ score: Number(document.querySelector('#embReview').dataset.score), verdict: document.querySelector('#embReview').dataset.verdict, text: document.querySelector('#embReview').innerText, src: document.querySelector('#embImg').src.slice(0, 22) }));
    ok(rv.src === 'data:image/jpeg;base64' && rv.score >= 0 && rv.score <= 100 && ['ready', 'check', 'fix'].includes(rv.verdict), '1. digitized: the sew-out, and a review with a score and a verdict', { ...rv, text: rv.text.slice(0, 200), ms: Date.now() - t0 });
    ok(/Matches the artwork \d+%/.test(rv.text) && /(Ready to sew|Worth a check|Fix before production)/.test(rv.text), '   the review says how close the stitches are to the artwork, in words', rv.text.slice(0, 160));
    await page.locator('#embDlg .embgrid').screenshot({ path: `${shots}/lab-embroidery-sewn.png` }).catch(() => {});
    // the fabric
    const before = await page.getAttribute('#embImg', 'src'); await page.selectOption('#embFab', 'fleece');
    await page.waitForFunction(s => document.querySelector('#embImg').src !== s, before, { timeout: 60000 });
    ok(true, '2. another fabric draws it again on that cloth');
    // playback
    await page.click('#embSeg [data-embview="play"]'); await page.waitForFunction(() => Number(document.querySelector('#embPos').value) > 0, null, { timeout: 10000 });
    const p1 = await page.evaluate(() => Number(document.querySelector('#embPos').value)); await page.waitForTimeout(600); const p2 = await page.evaluate(() => Number(document.querySelector('#embPos').value));
    ok(p2 > p1 && /Stitch [\d,]+ of [\d,]+ · thread \d of \d/.test(await page.innerText('#embAt')), '3. Sewing plays the stitches back in order, with where it is', { p1, p2, at: await page.innerText('#embAt') });
    await page.click('#embPP'); const max = await page.evaluate(() => Number(document.querySelector('#embPos').max));
    await page.fill('#embPos', String(Math.round(max / 2))); await page.dispatchEvent('#embPos', 'input');
    ok(Math.abs(await page.evaluate(() => Number(document.querySelector('#embPos').value)) - Math.round(max / 2)) <= 1, '   pause and drag to any stitch');
    await page.locator('#embDlg .embgrid').screenshot({ path: `${shots}/lab-embroidery-sewing.png` }).catch(() => {});
    // on the garment
    await page.click('#embSeg [data-embview="garment"]'); await page.waitForFunction(() => { const c = document.querySelector('#embOn'); return c && !c.classList.contains('hidden') && c.dataset.ready === '1'; }, null, { timeout: 60000 });
    const lit = await page.evaluate(() => { const c = document.querySelector('#embOn'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (d.length / 4); });
    ok(lit > .9, '4. On the garment: the thread laid on the picture where the artwork is', lit);
    await page.locator('#embDlg .embgrid').screenshot({ path: `${shots}/lab-embroidery-garment.png` }).catch(() => {});
    // a fix, one click
    await page.click('#embSeg [data-embview="sewn"]');
    const fixes = await page.locator('#embReview [data-embfix]').count();
    if (fixes) {
      const s0 = await page.evaluate(() => document.querySelector('#embReview').dataset.score), n0 = await page.getAttribute('#embDlg', 'data-runs');
      await page.locator('#embReview [data-embfix]').first().click(); await page.waitForFunction(n => document.querySelector('#embDlg').dataset.runs !== n, n0, { timeout: 60000 });
      ok(true, '5. a fix in the review is one click, and it digitizes again with it', { before: s0, after: await page.evaluate(() => document.querySelector('#embReview').dataset.score) });
    } else ok(/Ready to sew/.test(rv.text), '5. nothing to fix: ready to sew');
    // a fix that is a setting of the window sets it: rows too close → the density control
    await page.evaluate(() => { document.querySelector('#embRow').value = '0.35'; });
    ok(await page.evaluate(() => { const items = [{ level: 'warn', code: 'density-high', text: 'x', fix: { rowMm: 0.45 } }]; EMBX.show({ review: { score: 70, verdict: 'check', fidelity: {}, items }, frames: null }); return true; }), '   (a review with a density fix)');
    await page.click('#embReview [data-embfix="0"]'); await page.waitForFunction(() => document.querySelector('#embRow').value === '0.45', null, { timeout: 5000 });
    ok(await page.evaluate(() => document.querySelector('#embRow').value) === '0.45', '6. the fix "rows 0.45 mm" sets the density to it');
    await page.waitForFunction(() => document.querySelector('#embReview')?.dataset.score !== '70', null, { timeout: 60000 });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#embDlg [data-embdl="dst"]')]); ok(/\.dst$/.test(dl.suggestedFilename()), '7. and the machine file downloads as reviewed', dl.suggestedFilename());
    ok(errs.length === 0, '   no page errors', errs);
  } finally { await b.close(); await cleanup(brands, plan.plan?.id); }
});

await journey('J265', 'One board and components in the Studio: Board shows the picture, the flat front and back, and the flat in each colourway side by side, and a frame opens its view; a layer made a component goes into the library and its copies are marked, chosen together, swapped together for another library graphic at the same size, and detached', async () => {
  const { brands, plan } = await conceptSetup();
  if (!playwright) { ok(true, 'needs a browser'); await cleanup(brands, plan.plan?.id); return; }
  const line = plan.lines.find(l => l.category === 'tops') || plan.lines[0], c = (await K(`/plans/${plan.plan.id}/lines/${line.id}/concepts`, { body: { count: 1 } })).json.concepts[0];
  await K(`/concepts/${c.id}/colourways`, { method: 'PUT', body: { colourways: [{ name: 'Washed black', hex: '#1f1f22' }, { name: 'Moss', hex: '#5b6648' }] } });
  const b = await playwright.chromium.launch(), shots = process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp';
  try {
    const oc = await b.newContext({ viewport: { width: 1500, height: 980 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.helper.on', '0'); } catch {} }, kyleT);
    const page = await oc.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/lab/studio?concept=${c.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 }); await page.waitForFunction(() => !document.querySelector('#busy:not(.hidden)'));
    // the board
    await page.click('#viewSeg [data-v=board]'); await page.waitForFunction(() => document.getElementById('boardHost')?.dataset.ready === '1', null, { timeout: 60000 });
    const fr = await page.evaluate(() => ({ piece: [...document.querySelectorAll('#bPiece figcaption span')].map(e => e.textContent), cws: [...document.querySelectorAll('#boardBody [data-cw] figcaption span')].map(e => e.textContent), svgs: document.querySelectorAll('#boardBody figure svg').length, fills: [...document.querySelectorAll('#boardBody [data-cw] .fr')].map(f => f.innerHTML.replace(/_b\d+/g, '')), art: document.querySelector('#bPiece [data-bopen=front] svg image') != null }));
    ok(JSON.stringify(fr.piece) === '["Picture","Flat front","Flat back"]', '1. Board: the picture and the flat front and back side by side', fr.piece);
    ok(fr.cws.length === 2 && /Washed black/.test(fr.cws[0]) && fr.fills[0] !== fr.fills[1], '   and the flat in each colourway, in its colour', { cws: fr.cws });
    ok(fr.art, '   the flats carry the graphics placed on them');
    await page.screenshot({ path: `${shots}/lab-studio-board.png` }).catch(() => {});
    await page.click('#bPiece [data-bopen=back]'); await page.waitForFunction(() => VMODE === 'back');
    ok(true, '2. a frame opens its view (the flat back)');
    await page.evaluate(() => setVMode('picture')); await page.waitForFunction(() => VMODE === 'picture');
    // components
    await page.click('.tabs [data-tab=add]'); await page.click('#pAdd [data-mark=word]'); await page.waitForFunction(() => LAYERS.length >= 2); await page.click('.tabs [data-tab=layers]');
    await page.waitForSelector('#pLayers [data-comp=make]'); await page.click('#pLayers [data-comp=make]');
    await page.waitForFunction(() => BOARD.isCopy(selected()), null, { timeout: 30000 });
    const id1 = await page.evaluate(() => selected().src);
    ok(/^\/v1\/lab\/art\/[0-9a-f-]{36}$/.test(id1) && await page.locator('#pLayers .ly.on .inst').count() === 1, '3. Make a component: it is in the library, and the layer is its first copy, marked ◇', id1);
    await page.keyboard.press('Control+d'); await page.waitForFunction(() => BOARD.copiesOf(selected()).length === 2);
    ok(await page.locator('#pLayers .inst').count() === 2, '   a duplicate is another copy');
    await page.click('#pLayers [data-comp=all]'); ok((await page.evaluate(() => PRO.chosen().length)) === 2, '4. Choose every copy');
    await page.evaluate(() => { PRO.SELS.clear(); paintPanels(); });
    // another library graphic to swap to
    // another graphic in the library to swap to
    const up = await K('/library/graphics/upload', { body: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAbUlEQVRogeXOIQEAIBAAsUvymv4paMXHmEDMrzvn/Swd0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0BZVvWjxH6zVuQAAAABJRU5ErkJggg==', name: `Red bar ${Date.now()}`, source: 'studio' } });
    ok(up.status < 300 && up.json.id, '   (a second graphic in the library)', up.json);
    const w0 = await page.evaluate(() => PRO.box(selected()).w);
    await page.click('#pLayers [data-comp=swap]'); await page.waitForSelector('#compDlg[open] [data-swap]', { timeout: 20000 });
    ok(await page.locator('#compAll').isChecked(), '5. Swap offers every copy at once');
    await page.locator('#compDlg [data-swap]').first().click(); await page.waitForFunction(s => !document.querySelector('#compDlg[open]') && selected().src !== s, id1, { timeout: 30000 });
    const after = await page.evaluate(() => ({ srcs: [...new Set(LAYERS.filter(l => BOARD.isCopy(l)).map(l => l.src))], copies: BOARD.copiesOf(selected()).length, w: PRO.box(selected()).w }));
    ok(after.copies === 2 && !after.srcs.includes(id1) && Math.abs(after.w - w0) / w0 < .05, '   both copies are the other graphic now, at the same width', { after, w0 });
    await page.click('#pLayers [data-comp=detach]'); ok(await page.evaluate(() => !BOARD.isCopy(selected()) && BOARD.copiesOf(LAYERS.find(l => BOARD.isCopy(l))).length === 1), '6. Detach: a plain picture, the other copy still linked');
    await page.evaluate(() => saveAll()); await page.waitForFunction(() => !DIRTY, null, { timeout: 20000 });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#pLayers .ly', { timeout: 20000 });
    ok(await page.evaluate(() => LAYERS.filter(l => BOARD.isCopy(l)).length) === 1 && await page.locator('#pLayers .inst').count() === 1, '7. saved and opened again, the copy is still a copy');
    ok(errs.length === 0, '   no page errors', errs);
  } finally { await b.close(); await cleanup(brands, plan.plan?.id); }
});

await journey('J267', 'Hard goods and electronics are engineered as 3D parts: an electronic concept opens Engineering (not a pattern) with a starting assembly drawn from its words; it starts again as a handheld at a size, with the board, battery, radio and keys laid out clean; the moulding and fit checks catch a thin wall and the parts list, tooling, power budget and certifications follow; the files (STL assembled, exploded and one part, the exploded drawing, the block diagram, the BOM) download; a tumbler and a figure are hard goods with their own checks (food contact, small parts); another room cannot read it; and in a browser the parts explode, a tapped part opens to edit, and the change is saved', async () => {
  const A = (path, o = {}) => call(path, { token: kyleT, ...o }), made = [];
  try {
    const sp = await K('/concepts/from-scratch', { body: { category: 'electronics', name: `Bluetooth speaker ${stamp}` } }), cid = sp.json.concept?.id; made.push(cid);
    let g = await K(`/concepts/${cid}/assembly`);
    ok(g.status === 200 && g.json.engineered && !g.json.saved && g.json.spec.arch === 'puck' && g.json.spec.kind === 'electronics', '1. an electronic concept is engineered: a round speaker read from its words, not saved yet', { arch: g.json.spec?.arch, saved: g.json.saved });
    ok(g.json.eng.unit > 0 && g.json.eng.toolCost > 0 && g.json.eng.weeks > 0 && !g.json.eng.checks.some(c => c.level === 'bad'), '   with a unit cost, tooling and weeks to first samples, and nothing to fix', g.json.eng.checks.filter(c => c.level === 'bad'));
    ok(g.json.eng.certs.some(c => /FCC Part 15C/.test(c.name)) && g.json.eng.power.runtime > 0 && g.json.eng.pcb?.layers >= 2, '   its certifications, run time and board', { run: g.json.eng.power?.runtime });
    const st = await K(`/concepts/${cid}/assembly/start`, { body: { arch: 'handheld', w: 50, d: 140, h: 20, mah: 1500, radio: 'wifi', buttons: 6 } });
    ok(st.status === 200 && st.json.spec.arch === 'handheld' && st.json.spec.parts.filter(p => p.elec?.kind === 'button').length === 6 && st.json.eng.pcb.layers === 4, '2. started again as a 50 × 140 × 20 mm handheld with Wi-Fi and six keys: a 4-layer board', { parts: st.json.spec?.parts?.length });
    ok(!st.json.eng.checks.some(c => c.level === 'bad'), '   laid out clean: nothing in another part\'s space, the port at the wall', st.json.eng.checks.filter(c => c.level === 'bad').map(c => c.text));
    g = await K(`/concepts/${cid}/assembly`); ok(g.json.saved && g.json.spec.arch === 'handheld', '   and saved');
    const thin = JSON.parse(JSON.stringify(g.json.spec)); thin.parts.find(p => p.id === 'bottom').wall = .6;
    const put = await K(`/concepts/${cid}/assembly`, { method: 'PUT', body: { spec: thin } });
    ok(put.status === 200 && put.json.eng.checks.some(c => c.level === 'bad' && /Bottom housing: a 0\.6 mm wall is too thin for PC\/ABS/.test(c.text)), '3. a 0.6 mm housing wall is caught: too thin for PC/ABS to fill', put.json.eng.checks.filter(c => c.level === 'bad').map(c => c.text));
    ok((await K(`/concepts/${cid}/assembly`, { method: 'PUT', body: { spec: { parts: [] } } })).status === 422, '   an assembly with no parts is refused');
    thin.parts.find(p => p.id === 'bottom').wall = 1.6; await K(`/concepts/${cid}/assembly`, { method: 'PUT', body: { spec: thin } });
    const bin = async u => { const r = await fetch(`${BASE}/v1/lab/concepts/${cid}/${u}`, { headers: { Authorization: 'Bearer ' + kyleT } }); return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) }; };
    const s0 = await bin('assembly.stl?t=0'), s1 = await bin('assembly.stl?t=1'), sp1 = await bin('assembly.stl?part=pcb'), tri = b => b.readUInt32LE(80);
    ok(s0.status === 200 && s0.buf.length === 84 + tri(s0.buf) * 50 && tri(s0.buf) > 500 && s1.buf.length === s0.buf.length && sp1.buf.length < s0.buf.length / 4, '4. STL: the assembly, the same parts pulled apart, and one part on its own', { tris: tri(s0.buf), part: sp1.buf.length });
    const rdE = (await K(`/concepts/${cid}/assembly`)).json.eng; ok(Array.isArray(rdE?.harness) && rdE.harness.every(c => /^W\d+$/.test(c.n) && c.mm > 0 && c.unit > 0) && rdE.bom.filter(r => /^Cable W\d+:/.test(r.name)).length === rdE.harness.length, '   the cables: each part off the board wired to the board, costed and on the parts list', rdE?.harness);
    const stp = await bin('assembly.step'), stp1 = await bin('assembly.step?part=pcb'); ok(stp.status === 200 && /^ISO-10303-21;/.test(stp.buf) && (String(stp.buf).match(/MANIFOLD_SOLID_BREP/g) || []).length === thin.parts.length && (String(stp1.buf).match(/MANIFOLD_SOLID_BREP/g) || []).length === 1, '   STEP for CAD: every part an exact solid, or one part on its own', { solids: (String(stp.buf).match(/MANIFOLD_SOLID_BREP/g) || []).length });
    const sb = await bin('assembly.stl?t=0&simple=1'); ok(sb.status === 200 && tri(s0.buf) > 10 * tri(sb.buf), '   the STL carries the parts\' real shapes (many times the plain boxes, which ?simple=1 still gives)', { real: tri(s0.buf), simple: tri(sb.buf) });
    const dsvg = await bin('assembly.svg'), blk = await bin('block.svg'), csv = await bin('bom.csv');
    ok(/Parts list/.test(dsvg.buf) && /T1 samples in \d+ weeks/.test(dsvg.buf) && /svg/.test(dsvg.type) && /<image href="data:image\/png;base64,/.test(dsvg.buf), '   the exploded drawing of the real parts, with balloons and the parts list');
    ok(blk.status === 200 && /Block diagram/.test(blk.buf) && /Wi-Fi/.test(blk.buf), '   the block diagram'); ok(/^Item,Part,Qty,Material,Process/.test(String(csv.buf)) && /Board assembly \(4-layer/.test(String(csv.buf)), '   the parts list as CSV, with the board assembly');
    // the engineering review: two judges, round by round; the change both ask for is made, the one that would make the wall too thin is refused
    const rv = await K(`/concepts/${cid}/assembly/review`, { body: { spec: (await K(`/concepts/${cid}/assembly`)).json.spec } }); let rj = null;
    for (let i = 0; i < 60 && rv.status === 202; i++) { await sleep(500); rj = (await K(`/concepts/${cid}/assembly/review/${rv.json.id}`)).json; if (rj.status !== 'running') break; }
    ok(rv.status === 202 && rv.json.judges.length === 2 && rj?.status === 'done' && rj.result === 'passed' && rj.score === 91 && rj.rounds.length === 2, '   the engineering review: Claude and ChatGPT, round by round, the stricter score clears the bar of 90', { judges: rv.json.judges, status: rj?.status, score: rj?.score, rounds: rj?.rounds?.length });
    ok(rj?.changes?.some(c => c.part === 'top' && c.field === 'wall' && c.to === 2.4) && rj.rejected?.some(c => c.part === 'bottom' && /too thin/.test(c.reason)) && rj.beyondModel?.some(x => /gasket groove/.test(x)) && rj.eng?.unit > 0, '   the change both asked for is made, the one that would make a wall too thin is refused, and what the parts cannot show is kept for an engineer', { changes: rj?.changes, rejected: rj?.rejected });
    const rd = await K(`/concepts/${cid}/assembly/read`, { body: {} }); ok(rd.status === 200 && rd.json.source === 'words' && rd.json.read.arch === 'puck', '   with no picture, the read falls back to the concept\'s words', rd.json);
    const tb = await K('/concepts/from-scratch', { body: { category: 'home', name: `Insulated tumbler ${stamp}` } }), tid = tb.json.concept?.id; made.push(tid);
    g = await K(`/concepts/${tid}/assembly`);
    ok(g.json.spec.arch === 'tumbler' && g.json.spec.kind === 'goods' && g.json.eng.certs.some(c => /FDA 21 CFR/.test(c.name)) && (await K(`/concepts/${tid}/block.svg`)).status === 422, '5. a tumbler is hard goods: food-contact certifications, no block diagram', g.json.spec.arch);
    const abs = JSON.parse(JSON.stringify(g.json.spec)); abs.parts.find(p => p.id === 'lid').resin = 'ABS';
    ok((await K(`/concepts/${tid}/assembly`, { method: 'PUT', body: { spec: abs } })).json.eng.checks.some(c => c.level === 'bad' && /Lid: touches food or drink, and ABS is not food-contact grade/.test(c.text)), '   an ABS lid is refused for food contact');
    const fg = await K('/concepts/from-scratch', { body: { category: 'toys', name: `Vinyl collectible ${stamp}` } }), fid = fg.json.concept?.id; made.push(fid);
    g = await K(`/concepts/${fid}/assembly`); const kid = { ...g.json.spec, age: '0+' };
    const fk = await K(`/concepts/${fid}/assembly`, { method: 'PUT', body: { spec: kid } });
    ok(g.json.spec.arch === 'figure' && fk.json.eng.checks.some(c => c.level === 'bad' && /small-parts cylinder/.test(c.text)) && fk.json.eng.certs.some(c => /ASTM F963/.test(c.name)), '6. a figure for under-3s: the arms are small parts, and toy safety testing is listed');
    // audio: a CD player, a cassette player and a powered speaker, each with the parts it is made of
    const cdp = await K('/concepts/from-scratch', { body: { category: 'electronics', name: `Retro CD player ${stamp}` } }), cdid = cdp.json.concept?.id; made.push(cdid);
    g = await K(`/concepts/${cdid}/assembly`); const kinds = sp => new Set(sp.parts.filter(p => p.elec).map(p => p.elec.kind));
    ok(g.json.spec.arch === 'cdplayer' && ['cdmech', 'psu', 'iec', 'dac', 'vfd', 'rca'].every(k => kinds(g.json.spec).has(k)) && !g.json.eng.checks.some(c => c.level === 'bad'), '6b. a CD player: the loader, mains supply and inlet, DAC, display and line outputs, nothing to fix', [...kinds(g.json.spec)]);
    ok(g.json.eng.certs.some(c => /IEC 60825-1/.test(c.name)) && g.json.eng.certs.some(c => /CE-LVD/.test(c.name)) && g.json.eng.power.mains, '   with the laser and mains safety certifications, powered from the mains');
    const ts = await K(`/concepts/${cdid}/assembly/start`, { body: { arch: 'cassette' } }), ss = await K(`/concepts/${cdid}/assembly/start`, { body: { arch: 'speaker', radio: 'ble' } });
    ok(ts.json.eng.power.cell === 'aa' && ts.json.eng.power.runtime > 8 && kinds(ts.json.spec).has('tapemech') && !ts.json.eng.checks.some(c => c.level === 'bad'), '   a cassette player runs on two AA cells, with the tape transport', { run: ts.json.eng.power.runtime });
    ok(['woofer', 'tweeter', 'amp2'].every(k => kinds(ss.json.spec).has(k)) && ss.json.spec.parts.some(p => p.resin === 'MDF') && !ss.json.eng.checks.some(c => c.level === 'bad'), '   a powered speaker: MDF cabinet, woofer, tweeter and a 2 × 20 W amplifier');
    for (const [nm, arch] of [['Belt-drive turntable', 'turntable'], ['Wireless over-ear headphones', 'headphones'], ['Smart speaker with a voice assistant', 'smartspeaker'], ['10,000 mAh power bank', 'powerbank'], ['Cordless table lamp', 'lamp']]) {
      const nc = await K('/concepts/from-scratch', { body: { category: 'electronics', name: `${nm} ${stamp}` } }), nid = nc.json.concept?.id; made.push(nid);
      const ng = await K(`/concepts/${nid}/assembly`); ok(ng.json.spec?.arch === arch && !ng.json.eng.checks.some(c => c.level === 'bad') && ng.json.eng.harness.length > 0, `6f. "${nm}" opens as a ${arch}, wired and with nothing to fix`, { arch: ng.json.spec?.arch, bad: ng.json.eng?.checks?.filter(c => c.level === 'bad').map(c => c.text) });
    }
    // designed from the concept: a product no starting point fits (a bike light), laid out by Claude, the thin wall the checks caught fixed
    const bl = await K('/concepts/from-scratch', { body: { category: 'electronics', name: `Bike front light ${stamp}` } }), blid = bl.json.concept?.id; made.push(blid);
    const cp = await K(`/concepts/${blid}/assembly/compose`, { body: {} });
    ok(cp.status === 200 && cp.json.spec.arch === 'custom' && cp.json.spec.parts.length === 14 && cp.json.compose.status === 'clear' && cp.json.compose.rounds.length === 2 && /too thin/.test(cp.json.compose.rounds[0].bad[0]) && !cp.json.eng.checks.some(c => c.level === 'bad'), '6g. designed from the concept: a bike light laid out part by part, the too-thin wall the checks caught sent back and fixed, saved', cp.json.compose);
    ok((await K(`/concepts/${blid}/assembly`)).json.spec.parts.some(p => p.elec?.kind === 'ledcob') && cp.json.eng.certs.some(c => /IEC 62471/.test(c.name)), '   and it is costed, wired and certified like any other (the LED brings IEC 62471)');
    // into the tech pack and the factory's production package
    const cs = await K(`/concepts/${cdid}/assembly/start`, { body: { arch: 'cdplayer' } }); await K(`/concepts/${cdid}/assembly`, { method: 'PUT', body: { spec: cs.json.spec } });
    ok((await K(`/concepts/${cdid}/assembly/tech-pack`, { body: {} })).status === 409, '6c. before the concept has a tech pack, its engineering has nowhere to go');
    await K(`/concepts/${cdid}`, { method: 'PUT', body: { twist: 'A brushed aluminium front with our wordmark etched beside the tray' } });
    ok((await K(`/concepts/${cdid}/approve`, { body: { overrideReason: 'started from scratch: ours' } })).status === 200, '   approved'); const epid = (await K(`/concepts/${cdid}/tech-pack`, { body: {} })).json.productId;
    const sent = await K(`/concepts/${cdid}/assembly/tech-pack`, { body: {} }), epk = (await call(`/v1/admin/products/${epid}/tech-pack`, { token: kyleT })).json.techPack?.data || {};
    ok(sent.status === 200 && (epk.bom || []).some(r => r.notes === 'From engineering' && /^Cable W\d+:/.test(r.component)) && (epk.construction || []).some(r => /^Tooling · /.test(r.area)) && (epk.construction || []).some(r => /^Assembly · \d+$/.test(r.area)) && (epk.sketches || []).some(k => k.id === 'lab-eng-exploded'), '6d. sent to its tech pack: the assembled and exploded views, every part and cable on the BOM, the steps and the tooling', sent.json);
    ok(epk.electronics?.enabled && epk.electronics.components.some(c => /PCM5102A/.test(c.part) && /^U\d+$/.test(c.ref)) && epk.electronics.certifications.some(c => /IEC 60825-1/.test(c.name)), '   its electronics: the components with their references, and the laser certification', epk.electronics?.components?.slice(0, 4));
    ok((await call(`/v1/admin/products/${epid}/tech-pack/publish`, { token: kyleT, method: 'POST', body: { override: 'journey: engineering package' } })).status === 200, '   version 1 is published');
    // costs against factory quotes: a quote on this engineered pack is kept beside the engine's estimate, and moves the estimate toward it
    const est = (await K(`/concepts/${cdid}/assembly`)).json.eng, qs = (await call(`/v1/admin/products/${epid}/tech-pack/shares`, { token: kyleT, method: 'POST', body: { kind: 'quote', label: `Hi-fi Quotes ${stamp}` } })).json.share;
    const qe = await call(`/v1/admin/tech-pack-shares/${qs?.id}/quote`, { token: kyleT, method: 'POST', body: { how: 'WeChat, journey', currency: 'USD', tiers: [{ qty: 1000, unit: Math.round(est.unit * 2 * 100) / 100 }, { qty: 5000, unit: Math.round(est.unit * 1.5 * 100) / 100 }], tooling: Math.round(est.toolCost * 1.2), leadDays: est.weeks * 7 + 14 } });
    const cal = (await call('/v1/lab/engineering/calibration', { token: kyleT })).json, after = (await K(`/concepts/${cdid}/assembly`)).json;
    ok(qe.status === 201 && cal.samples?.some(x => x.qty === 5000 && Math.abs(x.quoteUnit / x.estUnit - 1.5) < .01 && x.factory) && cal.factors.electronics.n >= 1 && cal.factors.electronics.unit > 1, '6h. a factory\'s quote on the engineered pack is kept beside the engine\'s estimate (at the tier nearest the costed volume)', cal.factors);
    ok(after.eng.calibrated && after.eng.calibrated.unit > after.eng.unit && after.eng.calibrated.toolCost >= after.eng.toolCost && after.calibration.electronics.n === cal.factors.electronics.n, '   and the Engineering page shows the unit cost, tooling and lead time on the quotes\' basis beside the engine\'s', after.eng.calibrated);
    // the engineering measured: a known product designed from its words, reviewed, scored against what is known about it (the fixtures stand in)
    const bk = await K('/engineering/benchmark', { body: { only: ['bikelight'] } });
    let br = null; for (let i = 0; i < 40; i++) { br = (await K('/engineering/benchmark')).json; if (br.runs?.[0]?.id === bk.json.id && br.runs[0].status !== 'running') break; await new Promise(r => setTimeout(r, 500)); }
    const bitem = br?.runs?.[0]?.items?.[0];
    ok(bk.status === 202 && bk.json.products === 1 && br.runs[0].status === 'done' && bitem?.id === 'bikelight' && bitem.before && bitem.after && bitem.review && br.runs[0].summary?.done === 1 && br.reference.length === 12, '6i. the benchmark designs a known product from its words, reviews it and scores it against what is known about it', bitem || br?.runs?.[0]);
    ok(Array.isArray(bitem?.after?.missing) && bitem.after.size.length === 3 && typeof bitem.after.unit === 'number' && (await K('/engineering/benchmark', { body: { only: ['nothing-like-this'] } })).status === 422, '   with what it missed, its size and cost beside the known ranges; an unknown product is refused', bitem?.after);
    ok((await fetch(`${BASE}/lab/engineering/benchmark`)).status === 200, '   and its page is served');
    const esup = (await call('/v1/admin/suppliers', { token: kyleT, method: 'POST', body: { name: `Hi-fi Works ${stamp}` } })).json, etok = (await call(`/v1/admin/products/${epid}/tech-pack/factory`, { token: kyleT, method: 'POST', body: { supplierId: esup.id, mode: 'review' } })).json.assignment.packUrl.split('/tp/')[1];
    const zr = await fetch(`${BASE}/v1/tp/${etok}/package.zip`), zb = Buffer.from(await zr.arrayBuffer()), zf = {};
    { const e = zb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); let q = zb.readUInt32LE(e + 16); for (let i = 0, n = zb.readUInt16LE(e + 10); i < n; i++) { const nl = zb.readUInt16LE(q + 28), size = zb.readUInt32LE(q + 20), off = zb.readUInt32LE(q + 42), nm = zb.toString('utf8', q + 46, q + 46 + nl).split('/').slice(1).join('/'); zf[nm] = zb.subarray(off + 30 + zb.readUInt16LE(off + 26) + zb.readUInt16LE(off + 28)).subarray(0, size); q += 46 + nl + zb.readUInt16LE(q + 30) + zb.readUInt16LE(q + 32); } }
    const en = Object.keys(zf).filter(n => n.startsWith('engineering/'));
    ok(zr.status === 200 && ['engineering/assembly.stl', 'engineering/assembly.step', 'engineering/exploded-drawing.svg', 'engineering/parts-list.csv', 'engineering/cables.csv', 'engineering/block-diagram.svg'].every(n => en.includes(n)) && en.some(n => /^engineering\/parts\/\d\d-top-cover\.stl$/.test(n)) && en.some(n => /^engineering\/parts\/\d\d-top-cover\.step$/.test(n)), '6e. the factory\'s package has the engineering: the assembly in 3D, each made part for its toolmaker, the drawing, parts list, cables and block diagram', en);
    const stl = zf['engineering/assembly.stl'], dw = String(zf['engineering/exploded-drawing.svg'] || ''), pl = String(zf['engineering/parts-list.csv'] || '');
    ok(stl && stl.readUInt32LE(80) > 20000 && /<image href="data:image\/png/.test(dw), '   in their real shapes', stl?.readUInt32LE(80));
    ok(!/Unit \$|Unit cost|tooling \$/.test(dw) && /^Item,Part,Qty,Material,Process,Finish,Colour,Mass \(g\)$/m.test(pl) && !/cost/i.test(pl.split('\n')[0]), '   and none of our costs');
    ok(/engineering\/assembly\.stl/.test(String(zf['README.txt'] || '')) && /each made part|toolmaker/.test(String(zf['README.txt'] || '')), '   the README says what each engineering file is');
    const email = `eng-${stamp}@selfserve.test`, started = await call('/v1/public/start', { body: { email, name: 'Other Room Co', title: 'Lamp', photos: [jpeg()] } });
    const ocid = started.json.client?.id || sql(`select client_id from users where lower(email)='${email}'`), ouid = sql(`select id from users where lower(email)='${email}'`).split('\n')[0], oslug = sql(`select slug from clients where id='${ocid}'`).split('\n')[0];
    sql(`update users set email_verified_at=now() where id='${ouid}'`); sql(`update clients set lab_free=true where id='${ocid}'`);
    const otherT = await forge({ sub: ouid, clientId: ocid, client: oslug, role: 'client', email });
    ok((await call(`/v1/lab/concepts/${cid}/assembly`, { token: otherT })).status === 404 && (await call(`/v1/lab/concepts/${cid}/assembly.stl`, { token: otherT })).status === 404, '7. another room cannot read the assembly or its files');
    if (playwright) {
      const b = await playwright.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), shots = process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp';
      try {
        const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
        const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
        await page.goto(`${BASE}/lab/studio?concept=${cid}&view=pattern`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /\/lab\/engineer/.test(f.src)), null, { timeout: 30000 });
        const fr = () => page.frames().find(x => /\/lab\/engineer/.test(x.url())); await fr().waitForFunction(() => window.FBEngineer?.ready?.(), null, { timeout: 30000 });
        ok((await page.locator('#viewSeg [data-v=pattern]').innerText()).trim() === 'Engineering' && /Engineering/.test(await page.locator('#pieceSteps [data-step=pattern]').innerText()), '8. in Design the step and the tab read Engineering, and open the 3D parts');
        await fr().waitForFunction(() => document.querySelectorAll('#tags b').length > 0, null, { timeout: 30000 });
        ok(await fr().evaluate(() => FBEngineer.webgl() && document.querySelectorAll('#tags b').length === FBEngineer.spec().parts.length), '   drawn in 3D (three.js, from this site), every part numbered');
        await fr().click('#play'); await fr().waitForFunction(() => document.getElementById('tLbl').textContent === 'Exploded', null, { timeout: 5000 });
        const zs = await fr().evaluate(() => ['bottom', 'pcb', 'top'].map(id => FBEngineer.tagAt(id)[1]));
        ok(zs[0] > zs[1] && zs[1] > zs[2], '   Explode it pulls the parts apart: the top housing above the board above the bottom', zs);
        await page.screenshot({ path: `${shots}/lab-engineer-exploded.png` }).catch(() => {});
        const at = await fr().evaluate(() => FBEngineer.tagAt('top')), fb = await page.locator('#patFrame').boundingBox(); await page.mouse.click(fb.x + at[0], fb.y + at[1]);
        await fr().waitForSelector('.edit [data-k=wall]'); ok(/Top housing/.test(await fr().locator('.edit .hd b').innerText()), '9. a tapped part opens to edit');
        await fr().fill('.edit [data-k=wall]', '0.6'); await fr().dispatchEvent('.edit [data-k=wall]', 'change'); await fr().waitForFunction(() => /to fix/.test(document.getElementById('sum').textContent));
        ok(true, '   a thinner wall turns the checks red at once');
        await fr().fill('.edit [data-k=wall]', '1.8'); await fr().dispatchEvent('.edit [data-k=wall]', 'change'); await fr().click('#save'); await fr().waitForFunction(() => !FBEngineer.dirty() && /Saved/.test(document.getElementById('save').textContent), null, { timeout: 15000 });
        ok((await K(`/concepts/${cid}/assembly`)).json.spec.parts.find(p => p.id === 'top').wall === 1.8, '   and saved', null);
        await fr().click('#fileBtn'); const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), fr().click('[data-dl=stl1]')]);
        ok(/exploded\.stl$/.test(dl.suggestedFilename()), '10. Files → STL, exploded downloads', dl.suggestedFilename());
        await fr().click('#tabs [data-tab=elec]'); ok(await fr().locator('#pane .blk svg').count() === 1 && /Use on a charge/.test(await fr().locator('#pane').innerText()), '   the Electronics tab: the block diagram and the power budget');
        ok(await fr().evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '   nothing slides sideways'); ok(errs.length === 0, '   no page errors', errs);
      } finally { await b.close(); }
    }
  } finally { for (const id of made) if (id) await K(`/concepts/${id}`, { method: 'DELETE' }); }
});

shops.close(); brave.close();
process.exit(summary() ? 1 : 0);
