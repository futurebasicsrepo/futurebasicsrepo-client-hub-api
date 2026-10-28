// The Design Lab, end to end over HTTP and in a browser (server A, which reads shops from the journey stand-in server on 3134 and searches through the
// stand-in on 3133): it is closed to everyone but the owners and whoever they tick it for, it reads a shop's own feed, falls back to web and image search when a
// site says no, keeps no duplicates, obeys robots.txt, and the library, brand code and watchlist behave.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { journey, ok, summary, api, jpeg, png, sql, stamp, forge, FX, sharp } from './lib.mjs';
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
const mkBrand = async (name, site, role = 'reference') => (await K('/brands', { body: { name: `${name} ${stamp}`, site, role } })).json.brand;

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
    await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#items .card');
    ok(/Design Lab/.test(await page.innerText('.hero h1')) && (await page.locator('#items .card').count()) >= 3, 'the library opens with pieces in it');
    ok((await page.locator('#catPills .pill').allInnerTexts()).some(t => /Footwear/.test(t)) && (await page.locator('#catPills .pill').allInnerTexts()).some(t => /Headwear/.test(t)), 'the category filter covers hats and footwear, not only clothes');
    await page.waitForFunction(() => { const a = document.querySelector('.fbside a[data-nav="Design Lab"]'); return a && !a.hidden; }, null, { timeout: 8000 }).catch(() => {});
    ok(await page.locator('.fbside a[data-module="lab"]:not([hidden])').count() === 1 && await page.locator('#labTabs a').count() === 8, 'the owner sees the Design Lab in the menu as one entry, with its eight sections as tabs on the page', [await page.locator('.fbside a[data-module="lab"]:not([hidden])').count(), await page.locator('#labTabs a').count()]);
    await page.locator('#labTabs a[href="#plans"]').first().click(); await page.waitForFunction(() => { const r = document.getElementById('plans').getBoundingClientRect(); return r.top >= 0 && r.top < 300; }, null, { timeout: 8000 }).catch(() => {});
    ok(await page.evaluate(() => { const r = document.getElementById('plans').getBoundingClientRect(); return r.top >= 0 && r.top < 300; }), 'the menu\'s Line plans link takes you to the plans section, not just the top of the page', await page.evaluate(() => document.getElementById('plans').getBoundingClientRect().top));
    await page.locator('#labTabs a[href="#library"]').first().click(); await page.waitForFunction(() => document.getElementById('library').getBoundingClientRect().top < 300, null, { timeout: 8000 }).catch(() => {});
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
    ok(await pp.locator('.fbside a[data-module="lab"]:not([hidden])').count() === 0, 'the menu does not show them the Design Lab');
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
    await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle' }); await page.waitForSelector('#trendGrid .tc');
    const topsCard = page.locator('#trendGrid .tc', { hasText: 'Tops and jersey' }); ok(await topsCard.count() === 1 && /our ladder/i.test(await topsCard.innerText()) && /zara/i.test(await topsCard.innerText()) && /heat/i.test(await topsCard.innerText()), 'What\'s moving shows the tops with the Zara prices, our ladder and the pieces that are moving');
    ok(await page.locator('#labTabs a[href="#plans"]').count() === 1, 'the page has a Line plans tab');
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
    ok(await page.locator('#labTabs a[href="#board"]').count() === 1, 'the page has a Concepts tab');
    await page.locator(`#planView tr[data-line="${line.id}"] [data-mk]`).click(); await say(page, 'longer back'); await page.waitForFunction(() => document.querySelectorAll('#cgrid .cc').length >= 3, null, { timeout: 30000 });
    ok(await page.locator('#cgrid .cc').count() === 3 && await page.locator('#cgrid .cc img').count() === 3 && /clear|look closely|too close/i.test(await page.locator('#cgrid .cc').first().innerText()), 'three concept cards appear with their pictures and their check');
    ok(/in_concept|in concept/i.test(await page.locator(`#planView tr[data-line="${line.id}"]`).innerText()) || /3 concepts/.test(await page.locator(`#planView tr[data-line="${line.id}"]`).innerText()), 'the plan row now counts its concepts');
    await page.locator('#cgrid .cc').first().click(); await page.waitForSelector('#cd[open] [data-cf]'); await page.waitForFunction(() => document.querySelector('#cd .big img'), null, { timeout: 8000 });
    ok(await page.locator('#cd .ref').count() >= 1 && /side by side|drawn from/i.test(await page.innerText('#cd')), 'the concept opens with the pieces it was drawn from beside it');
    ok(/internal woven label/i.test(await page.locator('#cd .brd').innerText()) && await page.locator('#cd .brd [data-b="mark"]').count() === 1 && await page.locator('#cd .gfx').count() >= 0, 'the concept window shows the logo choice and the woven label that is always added');
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
    await page.locator('#labTabs a[href="#code"]').first().click(); await page.waitForFunction(() => document.getElementById('code').getBoundingClientRect().top < 300, null, { timeout: 8000 }).catch(() => {});
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
    ok(await page.locator('#labTabs a[href="#assort"]').count() === 1 && await page.locator('#aBoard .at').count() >= 3, 'the Assortment board is a tab and shows a tile for each concept');
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
    ok(tl.status === 200 && T.length >= 19 && tl.json.kinds.length === 5 && tl.json.kinds.every(k => T.some(t => t.kind === k.id)), 'the starting techniques cover embroidery, print, heat transfer, patches and wear', T.length);
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
    await Promise.all([page.waitForURL(/\/lab\/library/), page.click('#labTabs a[href="/lab/library"]')]);
    await page.waitForSelector('#app:not(.hidden)');
    ok(await page.locator('.labtabs a.on').innerText() === 'Graphics and techniques', 'the library is a section of the Lab');

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
    const tiles = await page.locator('#tList .tcard').count(); ok(tiles >= 19 && await page.locator('#tList h2').count() === 5, 'every technique is shown, grouped by kind', tiles);
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
    ok(j.print && j.print.screens === 4 && j.print.underbase && j.print.halftone && j.print.lpi === 55 && j.print.meshCount === 156, '   a plastisol print on a dark garment: four screens (three colours and the underbase), 55 lpi, 156 mesh', j.print);
    ok(j.size.widthIn === 4 && j.size.widthMm === 102 && j.size.px[0] === 1200 && pr.json.files.some(f => f.name === 'underbase.png') && pr.json.files.some(f => f.name === 'job-sheet.pdf'), '   at 4 in wide, 300 dpi, with the underbase file and the job sheet', pr.json.files.map(f => f.name));
    const light = (await K(`/library/graphics/${gid}/job?preview=1&widthIn=4&garment=%23f4f1ea`)).json.job; ok(light.print.underbase === false && light.print.screens === 3, '   on a light garment there is no underbase: three screens');
    const emb = (await K(`/library/graphics/${gid}/job?preview=1&widthIn=3&technique=${tech('satin-embroidery').id}`)).json.job;
    ok(emb.embroidery && emb.embroidery.threads.length === 3 && emb.embroidery.stitch === 'satin stitch' && emb.embroidery.stitchEstimate > 1000 && /backing|away/.test(emb.embroidery.backing), '3. made as satin embroidery instead: three threads to match, the stitch, backing and a stitch count', emb.embroidery);
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
        ok(/4 screens incl\. underbase · 55 lpi · mesh 156/.test(await page.innerText('#gjInfo')), '6. in a browser the graphic\'s window sums up the job: colours as Pantone chips, screens, halftone and mesh', await page.innerText('#gjInfo'));
        await page.selectOption('#gjTech', tech('satin-embroidery').id); await page.waitForFunction(() => /stitches/.test(document.querySelector('#gjInfo').textContent), null, { timeout: 20000 }); ok(/satin stitch · about [\d,]+ stitches/.test(await page.innerText('#gjInfo')), '   change the technique and it is an embroidery job with a stitch count');
        await page.fill('#gjWidth', '12'); await page.waitForFunction(() => /12 × /.test(document.querySelector('#gjInfo').textContent), null, { timeout: 20000 }); ok(/over the usual|stitches: heavy/.test(await page.innerText('#gjInfo')), '   too big for the technique and it says so', await page.innerText('#gjInfo'));
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
    ok(lib.status === 200 && lib.json.materials.length >= 30 && lib.json.options.kinds.length === 3 && lib.json.options.tag.shapes.includes('shield'), '1. the library opens with the starting fabrics, trims and tags', lib.json.materials?.length);
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
    await page.waitForSelector('.fbn-toast:not(.err)', { timeout: 5000 }); ok(/Save the setting: done/.test(await page.innerText('.fbn-stack')) && await page.locator('#fbOk.fbn-ok').count() === 1, 'when it worked: a tick on the button and a note', await page.innerText('.fbn-stack'));
    await page.click('#fbBad'); await page.waitForSelector('.fbn-toast.err', { timeout: 5000 });
    ok(/Do the impossible:/.test(await page.innerText('.fbn-toast.err')) && await page.locator('#fbBad.fbn-err').count() === 1, 'when it failed: a red mark on the button and a note that says what failed', await page.innerText('.fbn-toast.err'));
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
    await Promise.all([page.waitForURL(/\/lab\/flats\?concept=/), page.click('#cd [data-cflats]')]);
    await page.waitForSelector('#canvas svg [data-pl]', { timeout: 15000 });
    const sketch = await page.locator('#canvas svg image[href^="/lab/flat-templates/"]').getAttribute('href').catch(() => null);
    ok(sketch && (await fetch(BASE + sketch)).status === 200 && /not saved yet/i.test(await page.innerText('#saved')), 'the flats open on a professional flat sketch, worked out from the concept, waiting to be saved', sketch);
    const logoCard = page.locator('#pPl .pl').first(); ok(/below the HPS/.test(await logoCard.innerText()), 'the logo says where it sits, in inches from the HPS', await logoCard.innerText());
    // drag the logo up against the collar: the measurement follows and the check catches it
    const g = page.locator('#canvas [data-pl]').first(), bb = await g.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 - 60, 120, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => /problem/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(/problem/.test(await page.innerText('#status')) && /collar|neck|edge|piece/i.test(await page.innerText('#pPl')), 'dragged against the collar, it says it cannot be made and why', await page.innerText('#status'));
    // put it back by typing
    await page.locator('#pPl .pl').first().locator('[data-k=top]').fill('6'); await page.locator('#pPl .pl').first().locator('[data-k=x]').fill('4');
    await page.waitForFunction(() => !/problem/.test(document.getElementById('status').textContent), null, { timeout: 5000 }).catch(() => {});
    ok(!/problem/.test(await page.innerText('#status')), 'typed back to 6 in below the HPS and 4 in off centre, it can be made', await page.innerText('#status'));
    // a graphic from the library, on the back
    await page.click('[data-view=back]'); await page.waitForSelector('#libTiles [data-lib]', { timeout: 10000 }).catch(() => {});
    if (await page.locator('#libTiles [data-lib]').count()) { const n = await page.locator('#pPl .pl').count(); await page.click('#libTiles [data-lib]'); await page.waitForFunction(k => document.querySelectorAll('#pPl .pl').length === k + 1, n);
      ok(/below the HPS on the back/.test(await page.locator('#pPl .pl.on').innerText()), 'a library graphic goes on the back, measured from the HPS', await page.locator('#pPl .pl.on').innerText()); }
    else ok(true, 'no library graphics to add here');
    // the garment: fit and a measurement
    await page.click('.tabs [data-tab=garment]'); await page.selectOption('#gFit', 'oversized');
    const chest = Number(await page.locator('[data-m=chest]').inputValue()); ok(chest >= 24, 'an oversized fit widens the chest', chest);
    const tpl = await page.locator('#gGal [data-tpl][aria-pressed="true"]').getAttribute('data-tpl'); ok(/oversized|boxy/.test(tpl), 'and draws it from the oversized sketch', tpl);
    ok(await page.locator('#gGal [data-tpl] img').count() >= 10, 'the sketch gallery shows this style\'s sketches as thumbnails', await page.locator('#gGal [data-tpl]').count());
    await page.click('#gGal [data-tpl="none"]'); ok(await page.locator('#canvas svg path').count() > 5 && !(await page.locator('#canvas svg image[href^="/lab/flat-templates/"]').count()), 'the simple outline is still there to choose');
    await page.waitForSelector('.fbn-toast'); ok(/simple outline/i.test(await page.innerText('.fbn-stack')), 'and picking it says so', await page.innerText('.fbn-stack'));
    // any sketch in the pack: search women's halter, and the piece becomes that style
    await page.fill('#gQ', 'halter swimsuit'); await page.waitForFunction(() => document.querySelectorAll('#gGal [data-tpl]').length >= 1 && [...document.querySelectorAll('#gGal [data-tpl]')].every(b => /halter/i.test(b.textContent)));
    const sw = await page.locator('#gGal [data-tpl]').first().getAttribute('data-tpl'); await page.click(`#gGal [data-tpl="${sw}"]`);
    ok(await page.locator('#gStyle').inputValue() === 'swimsuit' && (await page.locator('#canvas svg image[href^="/lab/flat-templates/"]').getAttribute('href')).includes(sw), 'a sketch of another style, found by searching, changes the piece to it', sw);
    await page.fill('#gQ', ''); await page.selectOption('#gStyle', 'tee'); await page.selectOption('#gFit', 'oversized');
    await page.click(`#gGal [data-tpl="${tpl}"]`);
    await page.locator('[data-m=length]').fill('31'); await page.click('.tabs [data-tab=pom]');
    const pom = await page.innerText('#pPom'); ok(/Body length/.test(pom) && /\b31\b/.test(pom) && /XXL/.test(pom), 'the points of measure are graded across the sizes', pom.slice(0, 200));
    // design: a colour, a pocket in a double-needle topstitch, a stitch line drawn point by point, an area redrawn by the image model
    await page.click('.tabs [data-tab=design]'); await page.click('[data-color="#1f2a44"]');
    ok(await page.locator('#canvas svg filter').count() >= 1, 'a colour recolours the sketch');
    await page.click('[data-adddet="pocket-patch"]'); ok(await page.locator('#canvas [data-ed]').count() === 1 && /Patch pocket/.test(await page.innerText('#pDesign')), 'a patch pocket is added where it usually goes, and listed');
    await page.selectOption('.ed [data-ek=stitch]', 'double'); ok(/topstitch double needle/.test(await page.innerText('#pDesign')), 'its topstitch changes to double needle');
    // a part from the pack's own add-on sheets: a zip puller, placed and named
    await page.click('[data-pkind="zips"]'); const nEd = await page.locator('#canvas [data-ed]').count(); await page.click('[data-addpart]');
    ok(await page.locator('#canvas [data-ed]').count() === nEd + 1 && await page.locator('#canvas svg image[href^="/lab/flat-parts/"]').count() === 1 && /add-on sheet/.test(await page.innerText('#pDesign')), 'a zip from the pack\'s add-on sheet goes on the flat and is written up');
    await page.click('.ed.on [data-edel]'); ok(await page.locator('#canvas [data-ed]').count() === nEd, 'and comes off again');
    const cb = await page.locator('#canvas > svg').boundingBox();
    await page.click('[data-mode=stitch]'); await page.mouse.click(cb.x + cb.width * .35, cb.y + cb.height * .8); await page.mouse.click(cb.x + cb.width * .65, cb.y + cb.height * .8); await page.keyboard.press('Enter');
    ok(/Double needle line/.test(await page.innerText('#pDesign')), 'a stitch line is drawn point by point');
    await page.click('[data-mode=ai]'); await page.mouse.move(cb.x + cb.width * .4, cb.y + cb.height * .45); await page.mouse.down(); await page.mouse.move(cb.x + cb.width * .6, cb.y + cb.height * .62, { steps: 6 }); await page.mouse.up();
    await page.click('[data-sugg="Remove the pocket"]'); await page.click('#aiGo');
    await page.waitForFunction(() => /Redrawn area/.test(document.getElementById('pDesign').textContent), null, { timeout: 30000 });
    ok(await page.locator('#canvas svg image[href^="blob:"]').count() >= 1, 'an area is redrawn by the image model and laid on the sketch');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-flats-design.png` }).catch(() => {});
    await page.click('#save'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('saved').textContent), null, { timeout: 15000 });
    const row = sql(`select params->>'fit' || ':' || (params->'m'->>'length') from lab_flats where concept_id='${c.id}'`); ok(row === 'oversized:31', 'saved, as changed', row);
    const eds = sql(`select (params->>'color') || ':' || jsonb_array_length(params->'edits') from lab_flats where concept_id='${c.id}'`); ok(eds === '#1f2a44:3', 'with its colour and its three changes', eds);
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#sheet')]); await popup.waitForLoadState(); ok(/Spec sheet/.test(await popup.title()), 'the spec sheet opens to print', await popup.title()); await popup.close();
    await page.click('.tabs [data-tab=pl]'); await page.click('[data-view=front]'); await page.check('#showPom');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/lab-flats.png` }).catch(() => {});
    ok(errs.length === 0, 'no page errors', errs); await oc.close();
  } finally { await cleanup(brands, plan.plan?.id); await b.close(); }
});

shops.close(); brave.close();
process.exit(summary() ? 1 : 0);
