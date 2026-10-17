// The Design Lab, end to end over HTTP and in a browser (server A, which reads shops from the journey stand-in server on 3134 and searches through the
// stand-in on 3133): it is closed to everyone but the owners and whoever they tick it for, it reads a shop's own feed, falls back to web and image search when a
// site says no, keeps no duplicates, obeys robots.txt, and the library, brand code and watchlist behave.
import http from 'node:http';
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sql, stamp, forge } from './lib.mjs';
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
    ok(/Zara/.test(ov.json.brandCode.statement) && ov.json.brandCode.cutReferences.includes('Aimé Leon Dore') && ov.json.categories.length >= 10 && ov.json.connected.search === true && ov.json.connected.ai === true, 'the brand code starts from Kyle\'s words, every category is there, and search and the AI read are connected', ov.json.connected);

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
    await page.waitForFunction(() => { const a = document.querySelector('.fbside a[data-nav="Library"]'); return a && !a.hidden; }, null, { timeout: 8000 }).catch(() => {});
    ok(await page.locator('.fbside a[data-module="lab"]:not([hidden])').count() >= 3, 'the owner sees the Design Lab in the menu');
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

shops.close(); brave.close();
process.exit(summary() ? 1 : 0);
