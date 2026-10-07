// The studio as a customer gets it (server G): they ask for a tech pack and everything is made without anyone at Future Basics starting a tool. The reference picture is
// approved by itself when it is good enough, the colourway pictures and the 3D shape follow, and the customer's own pages show it all.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, sql, stamp, forge } from './lib.mjs';
const BASE = 'http://127.0.0.1:3130', call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `jc${tag}-${stamp}-${++n}@chaos.test`;
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
async function room(tag) { const r = await call('/v1/public/start', { body: { email: em(tag), name: 'Studio Customer', title: 'Layer runner', photos: [runner] } }); return { token: r.json.token, id: r.json.product.id, cid: r.json.client.id }; }
const studio = async m => (await call(`/v1/products/${m.id}/tech-pack/studio`, { token: m.token })).json;

await journey('J68', 'a customer asks for a tech pack and the whole studio runs by itself: reference picture approved, colourways drawn by part, 3D shape made, and their own pages show it', async () => {
  const m = await room('68'), other = await room('68b');
  let st = null; for (let i = 0; i < 160; i++) { st = await studio(m); if (st.loop && st.loop.status === 'done' && st.hero && st.colourways && !st.colourways.running && st.model && st.model.status === 'done') break; await sleep(400); }
  ok(st.loop && st.loop.status === 'done', 'the exchange finished', st.loop && st.loop.status);
  ok(st.hero && /^data:image\/jpeg/.test(st.hero.image) && st.hero.auto === true, 'the reference picture was approved by itself, because it was good enough', st.hero && { auto: st.hero.auto, score: st.hero.score });
  const texts = st.loop.events.map(e => e.text);
  ok(texts.some(t => /^Reference picture ready and approved: \d+\/100 faithful/.test(t)) && !texts.some(t => /waits for a person to approve/.test(t)), 'the exchange says so, and does not say it is waiting for a person', texts.slice(0, 5));
  ok(st.loop.outcome === 'passed' && /^Ready/.test(st.loop.events.at(-1).text), 'so the pack can be called ready: nothing is left waiting on staff', st.loop.events.at(-1).text);
  ok(st.colourways && st.colourways.status === 'done' && st.colourways.made >= 1, 'the colourway pictures were drawn without anyone pressing a button', st.colourways);
  ok(st.tiles.length === st.colourways.made && st.tiles.every(t => /^data:image\/jpeg/.test(t.image) && t.parts.length >= 3), 'each with its parts and codes', st.tiles.map(t => [t.id, t.parts.length]));
  ok(st.model && st.model.status === 'done' && /^data:image\/jpeg/.test(st.model.thumb) && st.model.triangles > 0, 'the 3D shape was made from the approved picture', st.model && st.model.status);
  const stl = await call(`/v1/products/${m.id}/tech-pack/model/stl`, { token: m.token }); ok(stl.status === 200 && stl.ct.includes('model/stl') && stl.text.length > 84, 'the customer can load their own 3D file', [stl.status, stl.ct]);
  ok((await call(`/v1/products/${m.id}/tech-pack/model/stl`, { token: other.token })).status === 404 && (await call(`/v1/products/${m.id}/tech-pack/studio`, { token: other.token })).status === 404, 'and nobody else can reach it');
  ok((await call(`/v1/products/${m.id}/tech-pack/studio`)).status === 401, 'nor can someone who is not signed in');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Hero image approved automatically%'`) === '1', 'the approval is on the record as automatic');
  ok(sql(`select count(*) from tech_pack_models where product_id='${m.id}' and forced`) === '0', 'and nothing was forced past the bar');
  if (playwright) {
    const b = await playwright.chromium.launch();
    try {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForSelector('#techpacks .tp-card', { timeout: 10000 });
      ok(await p.locator('#techpacks .tp-card').count() === 1 && /Your tech packs/.test(await p.innerText('#techpacks')), 'the hub home lists the customer\'s tech packs, up front');
      ok((await p.getAttribute('#techpacks .tp-card', 'href')) === `/tech-packs/${m.id}` && await p.locator('#techpacks .tp-card img').count() === 1, 'each with its picture and a link that opens it');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j68-hub.png` }).catch(() => {});
      await p.click('#techpacks .tp-card'); await p.waitForSelector('#tabs button[data-tab="studio"]', { timeout: 10000 });
      ok(true, 'it opens, with a Studio tab');
      await p.click('#tabs button[data-tab="studio"]'); await p.waitForSelector('.panel[data-panel="studio"].on .chk-shots img', { timeout: 10000 });
      const t = await p.innerText('.panel[data-panel="studio"]');
      ok(/Reference picture/i.test(t) && /faithful to your photo/i.test(t), 'the Studio tab shows the reference picture beside their photo');
      ok(await p.locator('.panel[data-panel="studio"] .rend').count() === st.tiles.length && await p.locator('.panel[data-panel="studio"] .cwparts li').count() >= 3, 'the colourway pictures, each with its parts');
      ok(/Show the exchange/i.test(t), 'and how the assistants built it, turn by turn');
      await p.locator('.panel[data-panel="studio"] summary').click(); ok(await p.locator('.panel[data-panel="studio"] .chk-ev').count() >= 3, 'which opens to the turns');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j68-studio.png`, fullPage: true }).catch(() => {});
      await p.click('.panel[data-panel="studio"] .stl-prev .btn'); await p.waitForSelector('.panel[data-panel="studio"] .stl-host canvas, .panel[data-panel="studio"] .stl-msg', { timeout: 12000 });
      ok(!/could not be loaded/i.test(await p.innerText('.panel[data-panel="studio"] .stl-host')), 'the 3D shape opens in the viewer');
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(over <= 1, 'and nothing runs off a phone screen', over);
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await b.close(); }
  }
  // staff keep every tool: they can still replace the hero and draw the colourways again
  const adm = { sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' };
  const admin = await forge(adm);
  const again = await call(`/v1/admin/products/${m.id}/tech-pack/colourways`, { method: 'POST', token: admin, body: {} }); ok(again.status === 202, 'staff can still draw the colourways again', [again.status, again.json]);
  const hero = await call(`/v1/admin/products/${m.id}/tech-pack/hero`, { method: 'POST', token: admin, body: {} }); ok(hero.status === 202, 'and make new hero images', hero.status);
});

await journey('J69', 'the product\'s own page in the hub shows its file: tech pack, reference picture, colourways with codes, 3D shape; the blank fields fill from the pack; a staff draft is shown only to staff previewing', async () => {
  const m = await room('69');
  let st = null; for (let i = 0; i < 160; i++) { st = await studio(m); if (st.loop && st.loop.status === 'done' && st.colourways && !st.colourways.running && st.model && st.model.status === 'done') break; await sleep(400); }
  ok(st.visible === true && st.state.label === 'Your tech pack draft' && st.details.colourways.length >= 1, 'the customer\'s own pack is visible, with its details', st.state);
  const card = (await call(`/v1/products/${m.id}/tech-pack/studio?view=card`, { token: m.token })).json;
  ok(card.tiles.length >= 1 && card.tiles.every(t => /^data:image\/jpeg/.test(t.image) && t.image.length < 60000 && t.parts.length >= 1) && card.loop === null, 'the card version carries small pictures and no exchange, so a page of products stays light', card.tiles.map(t => t.image.length));
  const uid = sql(`select id from users where client_id='${m.cid}' limit 1`), preview = await forge({ sub: uid, clientId: m.cid, role: 'client', preview: true });
  // a staff-made pack that is not published: the customer sees nothing of it; staff previewing see it, marked as a draft
  sql(`update tech_packs set initiated_by='brand' where product_id='${m.id}'`);
  ok((await call(`/v1/products/${m.id}/tech-pack/studio`, { token: m.token })).status === 404, 'a staff draft is hidden from the customer');
  const pv = await call(`/v1/products/${m.id}/tech-pack/studio?view=card`, { token: preview }); ok(pv.status === 200 && pv.json.staffDraft === true && /staff draft/i.test(pv.json.state.label), 'but staff previewing the hub see it, marked as a draft', [pv.status, pv.json.state]);
  ok(sql(`select count(*) from tech_packs where product_id='${m.id}' and published_at is null`) === '1');
  // publishing it makes it the customer's to see
  sql(`update tech_packs set published_at=now(), version=1, published_data=data where product_id='${m.id}'`);
  const pub = (await call(`/v1/products/${m.id}/tech-pack/studio?view=card`, { token: m.token })).json; ok(pub.visible && pub.staffDraft === false && pub.state.label === 'Tech pack v1' && pub.tiles.length >= 1, 'once published, the customer sees it, with its colourway pictures', pub.state);
  if (playwright) {
    const b = await playwright.chromium.launch();
    try {
      const pid = sql(`select project_id from products where id='${m.id}'`);
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForSelector('#techpacks .tp-card');
      await p.evaluate(([a, c]) => window.openProject ? window.openProject(a, false) : null, [pid, m.id]); await p.waitForSelector('.project-product, #projectPageBody', { timeout: 10000 });
      await p.evaluate(id => { const el = document.querySelector(`[data-sel="products"]`); if (el) el.click(); }, m.id);
      await p.waitForSelector('.project-product .pfile .pf', { timeout: 10000 });
      const t = await p.innerText('.project-product');
      ok(/Tech pack v1/.test(t) && await p.locator('.project-product .pf-fig').count() >= 3, 'the product card in the project shows its file: the tech pack, the reference picture, the colourways', await p.locator('.project-product .pf-fig').count());
      ok(!/Material:\s*TBD/i.test(t) && !/Colorways:\s*TBD/i.test(t), 'and the blank material and colourway fields are filled from the pack', t.slice(t.indexOf('Material'), t.indexOf('Material') + 120));
      ok((await p.getAttribute('.project-product .tpstrip', 'href')) === `/tech-packs/${m.id}`, 'with a link that opens the tech pack');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j69-card.png`, fullPage: true }).catch(() => {});
      await p.click('.project-product .card-actions button'); await p.waitForSelector('#productDialog[open] .pfile .pf', { timeout: 10000 });
      ok(await p.locator('#productDialog .pf-fig').count() >= 3, 'the full product details open with the same file');
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await b.close(); }
  }
});

await journey('J70', 'the left nav says who has the ball: client, Future Basics or the factory, with a moving marker that follows the tech pack and stands still for reduced motion', async () => {
  const m = await room('70'); await sleep(500);
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), pid = sql(`select project_id from products where id='${m.id}'`);
  if (!playwright) return;
  const b = await playwright.chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    const who = async () => { await p.goto(`${BASE}/clients/${m.cid}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.workbar .wb.sub .ball', { timeout: 10000 }); return [await p.getAttribute('.workbar .wb.sub .ball', 'data-ball'), (await p.innerText('.workbar .wb.sub .ball')).trim(), await p.getAttribute('.workbar .wb.sub .ball', 'title')]; };
    let w = await who(); ok(w[0] === 'client' && w[1] === 'Client' && /drafting/i.test(w[2]), 'while the customer drafts their pack, the ball is theirs', w);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ball i')).animationName !== 'none'), 'and the marker moves');
    await p.locator('.workbar').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j70-nav.png` }).catch(() => {});
    await p.emulateMedia({ reducedMotion: 'reduce' }); ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ball i')).animationName === 'none'), 'it stands still when the person asked for reduced motion');
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    sql(`update tech_packs set status='submitted', submitted_at=now() where product_id='${m.id}'`); w = await who(); ok(w[0] === 'future-basics' && w[1] === 'Future Basics' && /publishes v1/.test(w[2]), 'once they submit it, the ball is Future Basics\'s', w);
    sql(`update tech_packs set published_at=now(), version=1, published_data=data, verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`); w = await who(); ok(w[0] === 'client' && /review and sign/.test(w[2]), 'published, it is back with the client to sign', w);
    sql(`update tech_packs set verification='{"version":1,"acks":{},"clientSign":{"name":"A Client","at":"x"}}'::jsonb where product_id='${m.id}'`); w = await who(); ok(w[0] === 'future-basics' && /sign/.test(w[2]), 'once the client has signed, Future Basics signs next', w);
    sql(`update tech_packs set verification='{"version":1,"acks":{},"clientSign":{"name":"A Client","at":"x"},"brandSign":{"name":"FB","at":"x"}}'::jsonb where product_id='${m.id}'`); w = await who(); ok(w[0] === 'factory' && w[1] === 'Factory', 'and then the factory', w);
    // the customer's own hub says "Your move" when it is theirs
    sql(`update tech_packs set verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
    const cctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await cctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
    const c = await cctx.newPage(); await c.goto(`${BASE}/projects/${pid}#product=${m.id}`, { waitUntil: 'networkidle' }); await c.waitForSelector('.workbar .wb.sub .ball', { timeout: 10000 });
    ok(/Your move/.test(await c.innerText('.workbar .wb.sub .ball')), 'in their own hub it reads "Your move"');
    ok(p.errs.length === 0, 'no script errors', p.errs); await cctx.close(); await ctx.close();
  } finally { await b.close(); }
});

await journey('J71', 'a factory is asked to quote: a private link with the client hidden, no signing, a quote form, a revised quote, and staff compare the quotes side by side', async () => {
  const m = await room('71');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  // a pack that is published but that the client has not approved: a signing link is refused, a quotation link is not
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  sql(`update clients set name='Secret Brand Co' where id='${m.cid}'`);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { label: 'Mill X' } })).status === 409, 'a link to read and sign still waits for the client\'s approval');
  const a = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: 'Mill A Guangzhou' } }); ok(a.status === 201 && /\/tp\//.test(a.json.url), 'a link for quotation does not', [a.status, a.json]);
  const tokA = a.json.url.split('/tp/')[1], view = (await call(`/v1/tp/${tokA}`)).json;
  ok(view.quoteMode === true && view.product.clientName === '' && view.product.projectName === null, 'the factory sees the pack marked for quotation, without the client\'s name', [view.quoteMode, view.product.clientName]);
  ok(!JSON.stringify(view).includes('Secret Brand Co') && !view.techPack.verification.clientSign && view.techPack.revisions.length === 0 && view.techPack.data.style.designer === '', 'nor a signature, a staff note or the designer: the name is nowhere in what it receives');
  ok((await call(`/v1/tp/${tokA}/ack`, { body: { key: 'x:1' } })).status === 403 && (await call(`/v1/tp/${tokA}/sign`, { body: { name: 'Mill A' } })).status === 403, 'and cannot acknowledge or sign through it');
  const bad = await call(`/v1/tp/${tokA}/quote`, { body: { email: 'a@mill.cn', tiers: [] } }); ok(bad.status === 400 && /at least one price/.test(bad.json.error), 'a quote with no price is sent back with a sentence', [bad.status, bad.json.error]);
  ok((await call(`/v1/tp/${tokA}/quote`, { body: { tiers: [{ qty: 500, unit: 5 }] } })).status === 400, 'and so is one with no way to reach the factory');
  const q1 = await call(`/v1/tp/${tokA}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: '5.20' }, { qty: 2000, unit: '4.60' }], moq: 500, sampleCost: 90, sampleDays: 12, leadDays: 35, tooling: 400, incoterm: 'FOB', paymentTerms: '30% deposit', email: 'sales@milla.cn', wechat: 'milla' } });
  ok(q1.status === 201 && q1.json.quote.tiers.length === 2, 'a good quote is saved', [q1.status, q1.json]);
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='factory-quote'`) === '1' && sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Mill A Guangzhou quoted%'`) === '1', 'staff are told');
  const rev = await call(`/v1/tp/${tokA}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: '4.90' }], moq: 500, email: 'sales@milla.cn' } }); ok(rev.status === 200 && rev.json.quote.revisions === 1, 'the same link can revise its quote, and the first is kept', [rev.status, rev.json.quote?.revisions]);
  ok((await call(`/v1/tp/${tokA}`)).json.quote.tiers[0].unit === 4.9, 'the factory sees its own latest quote when it comes back');
  const b = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: 'Mill B Shenzhen' } }), tokB = b.json.url.split('/tp/')[1];
  await call(`/v1/tp/${tokB}/quote`, { body: { currency: 'CNY', tiers: [{ qty: 500, unit: 30 }, { qty: 3000, unit: 26 }], moq: 1000, leadDays: 40, wechat: 'millb_sz' } });
  const cmp = (await adm(`/v1/admin/products/${m.id}/tech-pack/quotes?qty=500`)).json;
  ok(cmp.quotes.length === 2 && cmp.links.length === 2 && cmp.links.every(l => l.quoted), 'staff see both links answered', cmp.links);
  ok(cmp.compare[0].company === 'Mill B Shenzhen' && cmp.compare[0].lowest === true && cmp.compare[0].unitUsd === 4.2 && cmp.compare[1].atUnit === 4.9, 'ranked by approximate dollar price at the quantity picked (CNY 30 is about USD 4.20)', cmp.compare.map(r => [r.company, r.unitUsd]));
  ok(cmp.compare[0].under === true, 'and a quote priced from a higher minimum than the quantity says so', cmp.compare[0].under);
  ok((await call(`/v1/products/${m.id}/tech-pack/studio`, { token: m.token })).status === 200, 'the customer\'s own pages are untouched');
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/quotes`, { token: m.token })).status === 403, 'a customer cannot read the quotes');
  const del = await call(`/v1/admin/tech-pack-shares/${(await adm(`/v1/admin/products/${m.id}/tech-pack/quotes`)).json.links.find(l => l.label === 'Mill B Shenzhen').id}`, { method: 'DELETE', token: admin }); ok(del.status === 200 && (await call(`/v1/tp/${tokB}`)).status === 410, 'a revoked link stops working at once');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const pctx = await bw.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), p = await pctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tp/${tokA}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="quote"]', { timeout: 10000 });
      ok(await p.locator('#tabs button[data-tab="sign"]').count() === 0 && /Request for quotation/i.test(await p.innerText('#noteSlot')), 'on a phone the factory gets a Quote tab, no Sign tab, and a line saying what to do');
      await p.click('#tabs button[data-tab="calls"]'); ok(await p.locator('.ackbtn').count() === 0, 'and no acknowledge buttons');
      await p.click('#tabs button[data-tab="quote"]'); await p.waitForSelector('#quoteForm');
      ok(/Free for factories/i.test(await p.innerText('.panel[data-panel="quote"]')) && /Quote sent/i.test(await p.innerText('.panel[data-panel="quote"]')), 'the form says it is free, and shows the quote already sent', (await p.innerText('.panel[data-panel="quote"]')).slice(0, 160));
      await p.fill('[name="unit0"]', '4.75'); await p.fill('[name="leadDays"]', '30'); await p.click('[data-act="sendquote"]');
      for (let i = 0; i < 20 && sql(`select tiers->0->>'unit' from factory_quotes where company like 'Mill A%'`) !== '4.75'; i++) await sleep(300);
      ok(sql(`select tiers->0->>'unit'||'|'||lead_days from factory_quotes where company like 'Mill A%'`) === '4.75|30', 'editing and sending from the page updates the quote');
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(over <= 1, 'with nothing running off the screen', over);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j71-quote.png`, fullPage: true }).catch(() => {});
      ok(p.errs.length === 0, 'no script errors', p.errs); await pctx.close();
      const actx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await actx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await actx.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#tabs button[data-tab="sign"]'); await ap.click('#tabs button[data-tab="sign"]'); await ap.waitForSelector('[data-quotes] .ptab tbody tr', { timeout: 10000 });
      ok(/Mill A Guangzhou/.test(await ap.innerText('[data-quotes]')) && /Lowest/i.test(await ap.innerText('[data-quotes]')), 'staff see the quotations table with the lowest marked');
      await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j71-staff.png`, fullPage: true }).catch(() => {});
      ok(ap.errs.length === 0, 'no script errors on the staff side', ap.errs); await actx.close();
    } finally { await bw.close(); }
  }
});

await journey('J75', 'a factory sees the 3D shape only when Future Basics switches it on for that link, can download it, and staff can send the shape, the quotations and the pack to the client\'s portal', async () => {
  const m = await room('75'), other = await room('75b');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done' && st.model && st.model.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  sql(`update clients set name='Secret Brand Co' where id='${m.cid}'`);
  // a factory already in the supplier list: pick it, and the link takes its name and email and is tied to it
  const sup = await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Old Friend Mill ${stamp}`, contactEmail: 'Sales@OldFriend.cn', country: 'China' } });
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.suppliers.some(x => x.id === sup.json.id && x.email === 'Sales@OldFriend.cn'), 'the pack page offers the suppliers staff already have');
  const ps = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', supplierId: sup.json.id, sendEmail: false } });
  ok(ps.status === 201 && ps.json.share.label === `Old Friend Mill ${stamp}` && ps.json.share.email === 'sales@oldfriend.cn' && ps.json.share.supplierId === sup.json.id, 'a link for a factory you already use takes its name and email and is tied to it', ps.json.share);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', supplierId: '00000000-0000-4000-8000-000000000000' } })).status === 400 && (await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', supplierId: 'junk' } })).status === 400, 'a supplier that does not exist is refused');
  const send = body => adm(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', body });
  ok((await send({ source: 'quotes' })).status === 409, 'quotations cannot be sent before any factory has quoted');
  const a = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: 'Mill A' } }), tokA = a.json.url.split('/tp/')[1];
  const b = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: 'Mill B', includeModel: true } }), tokB = b.json.url.split('/tp/')[1];
  ok(a.json.share.includeModel === false && b.json.share.includeModel === true, 'a link does not include the 3D shape unless staff say so');
  ok((await call(`/v1/tp/${tokA}`)).json.model === null && (await call(`/v1/tp/${tokA}/model/stl`)).status === 404 && (await call(`/v1/tp/${tokA}/model/thumb`)).status === 404, 'so the first factory is shown none of it and cannot fetch the file');
  const vb = (await call(`/v1/tp/${tokB}`)).json; ok(vb.model && /^data:image\/jpeg/.test(vb.model.thumb) && vb.model.triangles > 0, 'the second gets a preview and the size of the file', vb.model && Object.keys(vb.model));
  const stl = await call(`/v1/tp/${tokB}/model/stl`); ok(stl.status === 200 && stl.ct.includes('model/stl') && stl.text.length > 84, 'and can load the file with no sign-in', [stl.status, stl.ct]);
  ok(!JSON.stringify(vb).includes('Secret Brand Co'), 'the client\'s name is still nowhere in what it receives');
  ok((await call(`/v1/tp/nonsense-token/model/stl`)).status === 404, 'a made-up link gets nothing');
  const ids = (await adm(`/v1/admin/products/${m.id}/tech-pack/quotes`)).json.links, idA = ids.find(l => l.label === 'Mill A').id;
  ok((await call(`/v1/admin/tech-pack-shares/${idA}`, { method: 'PATCH', token: m.token, body: { includeModel: true } })).status === 403, 'a customer cannot switch it on');
  ok((await adm(`/v1/admin/tech-pack-shares/${idA}`, { method: 'PATCH', body: { includeModel: 'yes' } })).status === 400, 'a switch that is not on or off is refused');
  const on = await adm(`/v1/admin/tech-pack-shares/${idA}`, { method: 'PATCH', body: { includeModel: true } }); ok(on.status === 200 && on.json.share.includeModel === true && (await call(`/v1/tp/${tokA}/model/stl`)).status === 200, 'staff can switch it on later for the first factory');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and summary='3D shape opened to Mill A'`) === '1', 'and it is on the record');
  await adm(`/v1/admin/tech-pack-shares/${idA}`, { method: 'PATCH', body: { includeModel: false } }); ok((await call(`/v1/tp/${tokA}/model/stl`)).status === 404, 'and off again, at once');
  // factories quote, then staff send the work to the client's portal
  await call(`/v1/tp/${tokA}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 5.2 }], moq: 500, leadDays: 35, email: 'a@mill.cn' } });
  await call(`/v1/tp/${tokB}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 4.4 }], moq: 300, leadDays: 40, email: 'b@mill.cn' } });
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', token: m.token, body: { source: 'model' } })).status === 403 && (await send({ source: 'nope' })).status === 400, 'only staff can send, and only what exists');
  const sm = await send({ source: 'model' }); ok(sm.status === 201 && sm.json.files === 2, 'the 3D shape goes to the client portal as a preview and a file', [sm.status, sm.json]);
  const fid = sql(`select pf.id from project_files pf join project_messages pm on pm.id=pf.message_id where pm.id='${sm.json.messageId}' and pf.mime_type='model/stl'`);
  const dl = await call(`/v1/project-files/${fid}/download`, { token: m.token }); ok(dl.status === 200 && dl.ct.includes('model/stl') && dl.text.length > 84, 'the customer downloads the STL from their own project', dl.status);
  ok((await call(`/v1/project-files/${fid}/download`, { token: other.token })).status === 404, 'and nobody else can');
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='project-file' and title like 'New 3D shape in%'`) === '1', 'they are told');
  const sq = await send({ source: 'quotes' }), qbody = sql(`select body from project_messages where id='${sq.json.messageId}'`);
  ok(sq.status === 201 && /Factory A: USD 4.4/.test(qbody) && /Factory B: USD 5.2/.test(qbody) && !/Mill/.test(qbody) && !/Secret/.test(qbody), 'the quotations go cheapest first with the factories shown as Factory A, B', qbody);
  const sn = await send({ source: 'quotes', showNames: true }); ok(/1\. Mill B: USD 4.4/.test(sql(`select body from project_messages where id='${sn.json.messageId}'`)), 'and with their names only when staff choose');
  const st = await send({ source: 'techpack' }); ok(st.status === 201 && sql(`select body from project_messages where id='${st.json.messageId}'`).includes(`/tech-packs/${m.id}`), 'the tech pack link goes too');
  sql(`update tech_packs set published_at=null where product_id='${m.id}'`); ok((await send({ source: 'techpack' })).status === 409, 'but not before the pack is published'); sql(`update tech_packs set published_at=now() where product_id='${m.id}'`);
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const open = async tok => { const c = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true }), p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(`${BASE}/tp/${tok}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="art"]', { timeout: 10000 }); await p.click('#tabs button[data-tab="art"]'); return { c, p }; };
      const A = await open(tokA); ok(await A.p.locator('[data-fmodel]').count() === 0, 'on the first factory\'s page there is no 3D section'); await A.c.close();
      const B = await open(tokB); await B.p.waitForSelector('[data-fmodel] .stl-prev', { timeout: 10000 });
      ok(/3D shape/i.test(await B.p.innerText('[data-fmodel]')) && /not to scale/i.test(await B.p.innerText('[data-fmodel]')), 'on the second there is a 3D section that says it is not to scale');
      await B.p.click('[data-fmodel] .stl-prev .btn'); await B.p.waitForSelector('[data-fmodel] .stl-host canvas, [data-fmodel] .stl-msg', { timeout: 15000 });
      ok(!/could not be loaded/i.test(await B.p.innerText('[data-fmodel] .stl-host')), 'it opens in the viewer');
      const [d] = await Promise.all([B.p.waitForEvent('download', { timeout: 10000 }), B.p.click('[data-act="dlfactorymodel"]')]); ok(/\.stl$/.test(d.suggestedFilename()), 'and downloads as an STL file', d.suggestedFilename());
      ok(await B.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && B.p.errs.length === 0, 'with nothing off the screen and no script errors', B.p.errs); await B.c.close();
      const actx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await actx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await actx.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#tabs button[data-tab="sign"]'); await ap.click('#tabs button[data-tab="sign"]'); await ap.waitForSelector('#quoteLinkForm select[name="supplierId"]', { timeout: 10000 });
      await ap.selectOption('#quoteLinkForm select[name="supplierId"]', sup.json.id);
      ok(await ap.inputValue('#quoteLinkForm [name="label"]') === `Old Friend Mill ${stamp}` && await ap.inputValue('#quoteLinkForm [name="email"]') === 'Sales@OldFriend.cn', 'staff pick a factory they use and the name and email fill in');
      ok(ap.errs.length === 0, 'no script errors on the staff side', ap.errs); await actx.close();
    } finally { await bw.close(); }
  }
});

await journey('J76', 'a factory is assigned to a product: the product\'s supplier is set, the factory gets a page of everything assigned to it and a private link to each pack, and reassigning, unassigning or rotating switches the old access off at once', async () => {
  const m = await room('76');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update clients set name='Secret Brand Co' where id='${m.cid}'`);
  const s1 = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Assigned Mill ${stamp}`, contactEmail: 'mill1@factory.cn', country: 'China' } })).json, s2 = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Second Mill ${stamp}` } })).json;
  const assign = (supplierId, mode = 'quote', token = admin) => call(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', token, body: { supplierId, mode } });
  sql(`update tech_packs set published_at=null where product_id='${m.id}'`);
  ok((await assign(s1.id)).status === 409, 'a pack that is not published cannot be assigned: it is what the factory would see');
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  ok((await assign(s1.id, 'quote', m.token)).status === 403, 'a customer cannot assign a factory');
  ok((await assign('junk')).status === 400 && (await assign('00000000-0000-4000-8000-000000000000')).status === 400, 'a factory that is not in the list is refused');
  const rv = await assign(s1.id, 'review'); ok(rv.status === 409 && /approves version 1/.test(rv.json.error), 'to produce waits for the client\'s approval, and says what to do meanwhile', rv.json.error);
  const a = await assign(s1.id, 'quote'); ok(a.status === 201 && a.json.assignment.active && a.json.assignment.mode === 'quote' && /\/factory\//.test(a.json.assignment.pageUrl) && /\/tp\//.test(a.json.assignment.packUrl), 'assigning for quotation gives the factory a page and a pack link', a.json);
  ok(sql(`select supplier_id from product_configurations where product_id='${m.id}'`) === s1.id, 'and the product\'s own supplier is that factory');
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.assignment.supplierId === s1.id, 'the staff page shows who is assigned');
  const page1 = a.json.assignment.pageUrl.split('/factory/')[1], pack1 = a.json.assignment.packUrl.split('/tp/')[1];
  const pg = await call(`/v1/factory/${page1}`); ok(pg.status === 200 && pg.json.factory === `Assigned Mill ${stamp}` && pg.json.packs.length === 1 && pg.json.packs[0].state === 'needs-quote' && pg.json.packs[0].client === '' && pg.json.packs[0].href === `/tp/${pack1}`, 'the factory\'s page lists the pack, waiting for a quote, with the client\'s name hidden', pg.json);
  ok(!JSON.stringify(pg.json).includes('Secret Brand Co'), 'nowhere in it');
  ok((await call('/factory/' + page1)).status === 200 && (await call('/factory/' + page1)).text.includes('Future Basics'), 'the page itself loads with no sign-in');
  ok((await call('/v1/factory/nope')).status === 404 && (await call(`/v1/factory/${'a'.repeat(32)}`)).status === 404, 'a made-up page link gets nothing');
  const tv = (await call(`/v1/tp/${pack1}`)).json; ok(tv.quoteMode === true && tv.product.clientName === '', 'the pack link opens the pack for quotation');
  await call(`/v1/tp/${pack1}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 5 }], email: 'mill1@factory.cn' } });
  ok((await call(`/v1/factory/${page1}`)).json.packs[0].state === 'quoted', 'once it quotes, its page says so');
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/quotes`)).json.compare.some(r => r.company === `Assigned Mill ${stamp}`), 'and staff see the quote in the comparison');
  const same = await assign(s1.id, 'quote'); ok(same.json.assignment.packUrl === a.json.assignment.packUrl, 'assigning the same factory again keeps its link');
  // reassign: the old factory loses the pack, the new one gets it
  const b = await assign(s2.id, 'quote'), page2 = b.json.assignment.pageUrl.split('/factory/')[1];
  ok(b.status === 201 && (await call(`/v1/tp/${pack1}`)).status === 410 && (await call(`/v1/factory/${page1}`)).json.packs.length === 0, 'reassigning switches the old factory\'s link off at once and empties its page');
  ok((await call(`/v1/factory/${page2}`)).json.packs.length === 1 && sql(`select supplier_id from product_configurations where product_id='${m.id}'`) === s2.id, 'the new factory has it, and is the product\'s supplier');
  // produce, once the client has approved
  sql(`update tech_packs set verification='{"version":1,"acks":{},"clientSign":{"name":"Client Person","at":"2026-01-01T00:00:00Z","by":"c@x.com"}}'::jsonb where product_id='${m.id}'`);
  const pr = await assign(s2.id, 'review'); ok(pr.status === 201 && pr.json.assignment.mode === 'review', 'after the client approves, the factory can be assigned to produce it');
  const pg2 = (await call(`/v1/factory/${page2}`)).json; ok(pg2.packs.length === 1 && pg2.packs[0].kind === 'review' && pg2.packs[0].state === 'to-review' && pg2.packs[0].client === 'Secret Brand Co', 'its page now says to read and confirm, and shows who it is for');
  const rv2 = (await call(`/v1/tp/${pr.json.assignment.packUrl.split('/tp/')[1]}`)).json; ok(!rv2.quoteMode && rv2.techPack.verification.clientSign, 'and the pack link is the one to read and sign');
  // the factory page link
  ok((await call(`/v1/admin/suppliers/${s2.id}/factory-page/email`, { method: 'POST', token: admin, body: {} })).status === 400, 'emailing a factory that has no email asks for one');
  const rot = await call(`/v1/admin/suppliers/${s2.id}/factory-page/rotate`, { method: 'POST', token: admin, body: {} }); ok(rot.status === 200 && rot.json.pageUrl !== b.json.assignment.pageUrl && (await call(`/v1/factory/${page2}`)).status === 404 && (await call(`/v1/factory/${rot.json.pageUrl.split('/factory/')[1]}`)).json.packs.length === 1, 'a new page link switches the old one off and keeps everything on it');
  ok((await call(`/v1/admin/suppliers/${s2.id}/factory-page/rotate`, { method: 'POST', token: m.token, body: {} })).status === 403, 'only staff can');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(rot.json.pageUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await p.waitForSelector('.pack', { timeout: 10000 });
      const txt = await p.innerText('main'); ok(/Second Mill/.test(txt) && /To read and confirm/i.test(txt), 'on a phone the factory sees its name and the pack waiting for it', txt.slice(0, 160));
      await p.click('#lang'); ok(/技术包|确认/.test(await p.innerText('main')), 'and can switch to Chinese');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j76-factory.png` }).catch(() => {});
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && p.errs.length === 0, 'nothing runs off the screen and there are no script errors', p.errs);
      await p.click('.pack'); await p.waitForSelector('#tabs button[data-tab="sign"]', { timeout: 10000 }); ok(/\/tp\//.test(p.url()), 'tapping it opens the pack to read and sign'); await ctx.close();
      const actx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await actx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await actx.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#tabs button[data-tab="sign"]'); await ap.click('#tabs button[data-tab="sign"]'); await ap.waitForSelector('[data-assign]', { timeout: 10000 });
      ok(/Second Mill/.test(await ap.innerText('[data-assign]')) && await ap.locator('[data-assign] [data-fp]').inputValue() === rot.json.pageUrl, 'staff see who is assigned and the factory\'s page link');
      ok(await ap.locator('[data-assign] #assignForm select[name="supplierId"] option').count() >= 3, 'with the factories to choose from');
      await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j76-staff.png`, fullPage: true }).catch(() => {});
      ok(ap.errs.length === 0, 'no script errors on the staff side', ap.errs); await actx.close();
    } finally { await bw.close(); }
  }
  const un = await assign(null); const pageNow = rot.json.pageUrl.split('/factory/')[1];
  ok(un.status === 200 && un.json.assignment === null && (await call(`/v1/factory/${pageNow}`)).json.packs.length === 0 && (await call(`/v1/tp/${pr.json.assignment.packUrl.split('/tp/')[1]}`)).status === 410 && sql(`select supplier_id is null from product_configurations where product_id='${m.id}'`) === 't', 'unassigning empties the factory\'s page, switches its pack link off and clears the supplier');
});

const bad = summary(); process.exit(bad ? 1 : 0);
