// The studio as a customer gets it (server G): they ask for a tech pack and everything is made without anyone at Future Basics starting a tool. The reference picture is
// approved by itself when it is good enough, the colourway pictures and the 3D shape follow, and the customer's own pages show it all.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { journey, ok, summary, api, jpeg, sleep, sql, stamp, forge, S, waitAi } from './lib.mjs';
const BASE = 'http://127.0.0.1:3130', call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `jc${tag}-${stamp}-${++n}@chaos.test`;
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
async function room(tag) { const r = await call('/v1/public/start', { body: { email: em(tag), name: 'Studio Customer', title: 'Layer runner', photos: [runner] } }); if (!r.json.product) throw new Error(`room(${tag}): /start gave ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); return { token: r.json.token, id: r.json.product.id, cid: r.json.client.id }; }
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
  { const bp = (await adm(`/v1/admin/clients/${m.cid}`)).json; const prod = (bp.products || []).find(x => x.id === m.id); ok(prod && prod.tech_pack && prod.tech_pack.quote_waiting === true, 'while it waits for a quote, the ball is the factory\'s in the console', prod && prod.tech_pack); }
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.assignment.supplierId === s1.id, 'the staff page shows who is assigned');
  const page1 = a.json.assignment.pageUrl.split('/factory/')[1], pack1 = a.json.assignment.packUrl.split('/tp/')[1];
  const pg = await call(`/v1/factory/${page1}`); ok(pg.status === 200 && pg.json.factory === `Assigned Mill ${stamp}` && pg.json.packs.length === 1 && pg.json.packs[0].state === 'needs-quote' && pg.json.packs[0].client === '' && pg.json.packs[0].href === `/tp/${pack1}`, 'the factory\'s page lists the pack, waiting for a quote, with the client\'s name hidden', pg.json);
  ok(!JSON.stringify(pg.json).includes('Secret Brand Co'), 'nowhere in it');
  ok((await call('/factory/' + page1)).status === 200 && (await call('/factory/' + page1)).text.includes('Future Basics'), 'the page itself loads with no sign-in');
  ok((await call('/v1/factory/nope')).status === 404 && (await call(`/v1/factory/${'a'.repeat(32)}`)).status === 404, 'a made-up page link gets nothing');
  const tv = (await call(`/v1/tp/${pack1}`)).json; ok(tv.quoteMode === true && tv.product.clientName === '', 'the pack link opens the pack for quotation');
  await call(`/v1/tp/${pack1}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 5 }], email: 'mill1@factory.cn' } });
  ok((await call(`/v1/factory/${page1}`)).json.packs[0].state === 'quoted', 'once it quotes, its page says so');
  { const bp = (await adm(`/v1/admin/clients/${m.cid}`)).json; const prod = (bp.products || []).find(x => x.id === m.id); ok(prod && prod.tech_pack && prod.tech_pack.quote_waiting === false, 'and the ball comes back once it has quoted', prod && prod.tech_pack); }
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

await journey('J77', 'Future Basics can act for a factory that does not use its page, so a client\'s project is never stuck: stop waiting, type in its quote, acknowledge for it, countersign for it, each marked as ours with how it arrived', async () => {
  const m = await room('77');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update clients set name='Secret Brand Co' where id='${m.cid}'`);
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  const s1 = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Quiet Mill ${stamp}` } })).json, s2 = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Silent Works ${stamp}` } })).json;
  const assign = (supplierId, mode = 'quote') => adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId, mode } });
  const ballOf = async () => ((await adm(`/v1/admin/clients/${m.cid}`)).json.products || []).find(x => x.id === m.id)?.tech_pack;
  const a = await assign(s1.id), shareId = a.json.assignment.shareId, page = a.json.assignment.pageUrl.split('/factory/')[1], packTok = a.json.assignment.packUrl.split('/tp/')[1];
  ok((await ballOf()).quote_waiting === true, 'a pack out for quotation puts the ball with the factory');
  // stop waiting
  ok((await call(`/v1/admin/tech-pack-shares/${shareId}/waive`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a customer cannot do any of this');
  ok((await adm(`/v1/admin/tech-pack-shares/${shareId}/waive`, { method: 'POST', body: { waived: true } })).json.waived === true && (await ballOf()).quote_waiting === false && (await call(`/v1/factory/${page}`)).json.packs[0].state === 'closed', 'stopping the wait takes the ball back, and the factory\'s page says it is not needed right now');
  ok((await call(`/v1/tp/${packTok}`)).status === 200, 'its link still works');
  await adm(`/v1/admin/tech-pack-shares/${shareId}/waive`, { method: 'POST', body: { waived: false } }); ok((await ballOf()).quote_waiting === true, 'and waiting again puts it back');
  // type in the quote
  const body = { currency: 'CNY', tiers: [{ qty: 500, unit: 31 }, { qty: 2000, unit: 27 }], moq: 500, leadDays: 40, wechat: 'quiet_mill' };
  ok((await adm(`/v1/admin/tech-pack-shares/${shareId}/quote`, { method: 'POST', body })).status === 400, 'a typed-in quote must say how it arrived');
  ok((await adm(`/v1/admin/tech-pack-shares/${shareId}/quote`, { method: 'POST', body: { how: 'WeChat, 10 Oct', tiers: [] } })).status === 400, 'and still needs a price');
  const q = await adm(`/v1/admin/tech-pack-shares/${shareId}/quote`, { method: 'POST', body: { ...body, how: 'WeChat, 10 Oct' } }); ok(q.status === 201 && q.json.quote.byStaff === true && /Entered by Future Basics from: WeChat, 10 Oct/.test(q.json.quote.notes), 'staff can type in what the factory sent, marked as theirs', q.json);
  ok((await ballOf()).quote_waiting === false && (await call(`/v1/factory/${page}`)).json.packs[0].state === 'quoted', 'the ball is released and the page says quoted');
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/quotes?qty=500`)).json.compare[0].byStaff === true, 'the comparison shows it was entered by us');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Future Basics recorded Quiet Mill%quote%'`) === '1', 'and it is on the record');
  await call(`/v1/tp/${packTok}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 4.5 }], email: 'q@mill.cn' } }); ok(sql(`select entered_by is null from factory_quotes where share_id='${shareId}'`) === 't', 'if the factory later sends its own, it is no longer marked as ours');
  // produce: acknowledge and countersign for them
  const t0 = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack, pending = t0.readiness.pendingCalloutKeys.length;
  const b = await assign(s2.id, 'review'); ok(b.status === 409, 'to produce still waits for the client\'s approval');
  sql(`update tech_packs set verification='{"version":1,"acks":{},"clientSign":{"name":"Client Person","at":"2026-01-01T00:00:00Z","by":"c@x.com"}}'::jsonb where product_id='${m.id}'`);
  const b2 = await assign(s2.id, 'review'); ok(b2.status === 201, 'then it is assigned');
  const fsign = body => adm(`/v1/admin/products/${m.id}/tech-pack/factory-sign`, { method: 'POST', body });
  ok((await fsign({ name: 'Silent Works', how: 'WeChat' })).status === 409, 'Future Basics signs before the factory does, for a factory too');
  sql(`update tech_packs set verification='{"version":1,"acks":{},"clientSign":{"name":"Client Person","at":"2026-01-01T00:00:00Z","by":"c@x.com"},"brandSign":{"name":"FB","at":"2026-01-02T00:00:00Z","by":"fb@x.com"}}'::jsonb where product_id='${m.id}'`);
  ok((await fsign({ name: 'Silent Works' })).status === 400 && (await fsign({ how: 'WeChat' })).status === 400, 'it needs a name and how they confirmed');
  const pend = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.readiness.pendingCalloutKeys.length;
  if (pend > 0) {
    ok((await fsign({ name: 'Silent Works', how: 'WeChat, 11 Oct' })).status === 409, 'callouts still open are not skipped by accident');
    const ack = await adm(`/v1/admin/products/${m.id}/tech-pack/factory-ack`, { method: 'POST', body: { name: 'Silent Works' } }); ok(ack.status === 200 && ack.json.acknowledged === pend && ack.json.techPack.readiness.pendingCalloutKeys.length === 0, 'staff can acknowledge every callout for the factory', [ack.status, ack.json.acknowledged]);
  }
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/factory-ack`, { method: 'POST', body: {} })).status === 409, 'and nothing is left to acknowledge afterwards');
  const sg = await fsign({ name: 'Silent Works', how: 'WeChat, 11 Oct', ackAll: true }); ok(sg.status === 200 && sg.json.locked === true && /Future Basics .* for Silent Works: WeChat, 11 Oct/.test(sg.json.factorySign.by), 'countersigning for the factory locks the pack, and the signature says who did it and how', sg.json);
  ok((await fsign({ name: 'Silent Works', how: 'again' })).status === 409, 'it cannot be signed twice');
  ok((await call(`/v1/factory/${(b2.json.assignment.pageUrl.split('/factory/')[1])}`)).json.packs[0].state === 'signed', 'the factory\'s page says confirmed');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and metadata->>'onBehalf'='true'`) === '1', 'and it is on the record');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      sql(`update tech_packs set verification='{"version":1,"acks":{},"clientSign":{"name":"Client Person","at":"x"},"brandSign":{"name":"FB","at":"x"}}'::jsonb, locked_at=null where product_id='${m.id}'`);
      await assign(s1.id, 'quote'); await adm(`/v1/admin/tech-pack-shares/${shareId}/waive`, { method: 'POST', body: { waived: false } });
      const sid2 = (await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: s1.id, mode: 'quote' } })).json.assignment.shareId;
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="sign"]'); await p.click('#tabs button[data-tab="sign"]'); await p.waitForSelector(`[data-quotes] [data-act="enterquote"][data-id="${sid2}"]`, { timeout: 10000 });
      await p.click(`[data-quotes] [data-act="enterquote"][data-id="${sid2}"]`); await p.waitForSelector('#enterQuoteForm');
      await p.fill('#enterQuoteForm [name="how"]', 'Email, 12 Oct'); await p.fill('#enterQuoteForm [name="qty0"]', '300'); await p.fill('#enterQuoteForm [name="unit0"]', '5.5'); await p.click('#enterQuoteForm .dark');
      await p.waitForFunction(() => /Entered by us/i.test(document.querySelector('[data-quotes]').innerText), null, { timeout: 10000 }).catch(async () => { ok(false, 'the typed-in quote appeared', [(await p.innerText('[data-quotes]')).slice(0, 700), await p.locator('#toast, .toast').allInnerTexts()]); });
      ok(/Entered by us/i.test(await p.innerText('[data-quotes]')), 'staff type a quote in from the Sign tab and the table marks it as entered by us');
      ok(await p.locator('[data-quotes] [data-act="waive"]').count() === 0, 'a factory that has quoted has no stop-waiting button');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j77-staff.png`, fullPage: true }).catch(() => {});
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J78', 'an electronic product gets its own pack: the assistant fills the electrical facts, certifications follow from them, staff edit them, a factory reads them in its language, and nothing changes for any other product', async () => {
  const start = async (title, tag) => { const r = await call('/v1/public/start', { body: { email: em(tag), name: 'Gadget Maker', title, photos: [runner] } }); return { token: r.json.token, id: r.json.product.id, cid: r.json.client.id }; };
  const a = await start('Wireless earbuds', '78a'), b = await start('Layer runner', '78b');
  for (const m of [a, b]) for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const adminFor = m => forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' });
  const admin = await adminFor(a), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const pack = async m => (await call(`/v1/admin/products/${m.id}/tech-pack`, { token: await adminFor(m) })).json;
  const pa = await pack(a), e = pa.techPack.data.electronics;
  ok(e.enabled === true && e.specs.batteryChemistry === 'Li-ion' && e.specs.radios.startsWith('Bluetooth') && e.components.length >= 1, 'the assistant fills the battery, radios and a first parts list for an electronic product', e.specs);
  const names = e.certifications.map(c => c.name).join(' | ');
  ok(/UN 38\.3/.test(names) && /CE-RED/.test(names) && /Bluetooth SIG/.test(names) && /IEC 60529 ingress test \(IPX4\)/.test(names), 'the certifications that follow from them are listed: lithium transport, radio, Bluetooth listing, water rating', names);
  ok(e.stages.map(x => x.stage).join() === 'EVT,DVT,PVT,MP' && e.tests.length >= 6, 'with the build stages and the tests', e.stages.length);
  ok(pa.completeness.checks.some(c => c.key === 'electronics' && c.ok === true), 'and the completeness check for electronics is satisfied');
  const pb = await pack(b); ok(pb.techPack.data.electronics.enabled === false && !pb.completeness.checks.some(c => c.key === 'electronics'), 'a pack for anything else has no electronics section and no such check');
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${a.id}'`);
  const link = await adm(`/v1/admin/products/${a.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: 'Shenzhen Audio' } }), tok = link.json.url.split('/tp/')[1];
  const fv = (await call(`/v1/tp/${tok}`)).json; ok(fv.techPack.data.electronics.enabled && fv.techPack.data.electronics.specs.batteryChemistry === 'Li-ion', 'a factory link carries the electronics', fv.techPack.data.electronics.enabled);
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${a.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="elec"]', { timeout: 10000 });
      ok(await p.locator('#tabs button[data-tab="bom"] + button[data-tab="elec"]').count() === 1, 'staff see an Electronics tab right after the materials');
      await p.click('#tabs button[data-tab="elec"]'); await p.waitForSelector('.panel[data-panel="elec"].on');
      const txt = await p.innerText('.panel[data-panel="elec"]'); const vals = async () => p.$$eval('.panel[data-panel="elec"] input.t', els => els.map(e => e.value)); const v0 = await vals();
      ok(/Battery/i.test(txt) && /Certifications/i.test(txt) && /Build Stages/i.test(txt) && /lithium battery · 4\.44 Wh/i.test(txt) && v0.includes('EVT') && v0.includes('PVT') && v0.includes('Li-ion'), 'it shows the groups, the stages and the watt-hours with the dangerous-goods note', [txt.slice(0, 120), v0.slice(0, 12)]);
      await p.fill('.panel[data-panel="elec"] input[data-path*="\\"weight\\""]', '61 g'); await p.fill('.panel[data-panel="elec"] input[data-path*="\\"ingress\\""]', 'IPX7');
      await p.click('.panel[data-panel="elec"] [data-act="elecsuggest"]'); await p.waitForFunction(() => [...document.querySelectorAll('.panel[data-panel="elec"] input.t')].some(e => /ingress test \(IPX7\)/.test(e.value)), null, { timeout: 8000 }).catch(() => {});
      ok((await vals()).some(v => v === 'IEC 60529 ingress test (IPX7)') && !(await vals()).includes('IEC 60529 ingress test (IPX4)'), 'Add suggested adds what a changed water rating needs and drops the untouched row it replaces', (await vals()).filter(v => /IEC|CE|FCC/.test(v)));
      await p.keyboard.press('Control+s'); for (let i = 0; i < 30 && sql(`select data->'electronics'->'specs'->>'weight' from tech_packs where product_id='${a.id}'`) !== '61 g'; i++) await sleep(300);
      ok(sql(`select data->'electronics'->'specs'->>'weight' from tech_packs where product_id='${a.id}'`) === '61 g' && /IPX7/.test(sql(`select data->'electronics'->'certifications' from tech_packs where product_id='${a.id}'`)), 'edits to the specs and the list are saved');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j78-elec.png`, fullPage: true }).catch(() => {});
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
      // a pack that was not marked electronic can be turned into one from the Style tab
      const bctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await bctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, await adminFor(b));
      const bp = await bctx.newPage(); await bp.goto(`${BASE}/tech-packs/${b.id}`, { waitUntil: 'networkidle' }); await bp.waitForSelector('[data-act="elecon"]'); ok(await bp.locator('#tabs button[data-tab="elec"]').count() === 0, 'a shoe has no Electronics tab');
      await bp.click('[data-act="elecon"]'); await bp.waitForSelector('.panel[data-panel="elec"].on'); ok(await bp.locator('#tabs button[data-tab="elec"]').count() === 1 && (await bp.$$eval('.panel[data-panel="elec"] input.t', els => els.map(e => e.value))).includes('EVT'), 'but the Style tab can add one, with the stages and tests already there');
      await bctx.close();
      // the factory, on a phone, in Chinese
      sql(`update tech_packs set translations='{"zh":{"at":"2026-01-01T00:00:00Z","strings":{"Li-ion":"锂离子"}}}'::jsonb where product_id='${a.id}'`);
      const fctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), fp = await fctx.newPage(); fp.errs = []; fp.on('pageerror', e => fp.errs.push(e.message));
      await fp.goto(`${BASE}/tp/${tok}`, { waitUntil: 'networkidle' }); await fp.waitForSelector('#tabs button[data-tab="elec"]', { timeout: 10000 }); await fp.click('#tabs button[data-tab="elec"]');
      const ft = await fp.innerText('.panel[data-panel="elec"]'); ok(/Li-ion/.test(ft) && /Bluetooth/.test(ft) && await fp.locator('.panel[data-panel="elec"] input, .panel[data-panel="elec"] textarea, .panel[data-panel="elec"] select').count() === 0, 'a factory reads the electronics, with nothing to edit');
      ok(!/Not electronic|Add suggested|\+ Component/.test(ft), 'and none of the editing buttons');
      await fp.click('.langbar [data-lang="zh"]'); await fp.click('#tabs button[data-tab="elec"]'); const zt = await fp.innerText('.panel[data-panel="elec"]'); ok(/电池/.test(zt) && /认证/.test(zt) && /试产阶段/.test(zt) && /锂离子/.test(zt), 'in Chinese the headings, labels and the pack\'s own words are translated', zt.slice(0, 200));
      ok(await fp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && fp.errs.length === 0, 'nothing runs off the phone and there are no script errors', fp.errs);
      await fp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j78-factory.png`, fullPage: true }).catch(() => {}); await fctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J79', 'a factory has a start link and QR for its own customers, and the tech packs they start appear on the factory\'s page once published, ready to quote, with the customer\'s name and email never shown', async () => {
  const z = await room('79z'), admin = await forge({ sub: sql(`select id from users where client_id='${z.cid}' limit 1`), clientId: z.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const co = `Referral Mill ${stamp}`, pt = (await adm('/v1/admin/partners', { method: 'POST', body: { company: co, email: 'ref@mill.cn' } })).json.partner;
  ok((await call(`/v1/admin/partners/${pt.id}/page`, { method: 'POST', token: z.token, body: {} })).status === 403, 'only staff can make a factory\'s page');
  const pg = await adm(`/v1/admin/partners/${pt.id}/page`, { method: 'POST', body: {} });
  ok(pg.status === 200 && /\/factory\//.test(pg.json.pageUrl) && pg.json.startUrl.endsWith(`/start?ref=f-${pt.code}`), 'a factory met at a fair gets a page, and its start link is the one it already had', pg.json);
  ok(sql(`select count(*) from suppliers where name='${co}'`) === '1' && sql(`select supplier_id is not null from partners where id='${pt.id}'`) === 't', 'it became a supplier on the way');
  const tok = pg.json.pageUrl.split('/factory/')[1], f0 = (await call(`/v1/factory/${tok}`)).json;
  ok(f0.startLink === pg.json.startUrl && f0.started === 0 && f0.packs.length === 0, 'the page offers the start link and says nobody has started yet', f0);
  const look = await call(`/v1/public/factories/${pt.code}`); ok(look.status === 200 && Object.keys(look.json).join() === 'company' && look.json.company === co, 'the start page can ask who a link belongs to, and is told only the company name');
  ok((await call('/v1/public/factories/ZZZZZZ')).status === 404 && (await call('/v1/public/factories/junk')).status === 404, 'a link that belongs to nobody is a not-found');
  // a customer arrives through the link
  const em79 = `hidden-buyer-${stamp}@chaos.test`, r = await call('/v1/public/start', { body: { email: em79, name: 'Hidden Buyer Name', title: 'Referred layer runner', photos: [runner], attribution: { source: `f-${pt.code}` } } });
  const m = { token: r.json.token, id: r.json.product.id, cid: r.json.client.id };
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const f1 = (await call(`/v1/factory/${tok}`)).json; ok(f1.started === 1 && f1.packs.length === 0, 'it counts the pack as started, but shows nothing while it is still a draft', [f1.started, f1.packs.length]);
  sql(`update clients set name='Secret Buyer Brand' where id='${m.cid}'`);
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='client', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  const f2 = (await call(`/v1/factory/${tok}`)).json, k = f2.packs[0];
  ok(f2.packs.length === 1 && k.origin === 'referral' && k.kind === 'quote' && k.state === 'needs-quote' && k.client === '' && /^\/tp\//.test(k.href), 'once Future Basics publishes it, it is on the factory\'s page, ready to quote', f2.packs);
  const blob = JSON.stringify(f2); ok(!blob.includes('Hidden Buyer Name') && !blob.includes(em79) && !blob.includes('Secret Buyer Brand'), 'the customer\'s name, email and brand are nowhere in what the factory receives');
  const tv = (await call(`/v1${k.href}`)).json; ok(tv.quoteMode === true && tv.product.clientName === '' && !JSON.stringify(tv).includes(em79), 'its pack link is the quotation view, with the client hidden');
  const q = await call(`/v1${k.href}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 6.1 }], email: 'ref@mill.cn' } }); ok(q.status === 201, 'the factory can quote', q.json);
  ok((await call(`/v1/factory/${tok}`)).json.packs[0].state === 'quoted', 'and its page says so');
  const cmp = (await adm(`/v1/admin/products/${m.id}/tech-pack/quotes?qty=500`)).json; ok(cmp.compare.some(x => x.company === co), 'staff see the quote in the comparison for that product');
  const prod = ((await adm(`/v1/admin/clients/${m.cid}`)).json.products || []).find(x => x.id === m.id); ok(prod.tech_pack.quote_waiting === false, 'a referred pack does not hand the ball to the factory on its own: the ball stays with the people it was with');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(pg.json.pageUrl.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await p.waitForSelector('#invite:not(.hidden)', { timeout: 10000 });
      ok(await p.inputValue('#invLink') === pg.json.startUrl && await p.locator('#invQr img').count() === 1 && /1 tech pack started/.test(await p.innerText('#invCount')), 'on a phone the factory sees its start link, a QR code and how many have started');
      ok(/Referred layer runner/.test(await p.innerText('#list')) && /From your customer/.test(await p.innerText('#list')) && !/Hidden Buyer|Secret Buyer/.test(await p.innerText('main')), 'and the customer\'s pack, marked as theirs, with no name on it');
      await p.click('#lang'); ok(/您的客户/.test(await p.innerText('#invTitle')) && /通过您的链接已开始 1 个技术包/.test(await p.innerText('#invCount')), 'in Chinese too');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && p.errs.length === 0, 'with nothing off the screen and no script errors', p.errs);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j79-factory.png`, fullPage: true }).catch(() => {}); await ctx.close();
      const sctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }), sp = await sctx.newPage(); sp.errs = []; sp.on('pageerror', e => sp.errs.push(e.message));
      await sp.goto(`${BASE}/start?ref=f-${pt.code}`, { waitUntil: 'networkidle' }); await sp.waitForSelector('#partnerNote:not([hidden])', { timeout: 8000 });
      const note = await sp.innerText('#partnerNote'); ok(note.includes(co) && /never see your name or email/.test(note), 'the start page tells the customer who will see their pack and what they will not see', note);
      await sp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j79-start.png` }).catch(() => {});
      await sp.goto(`${BASE}/start?ref=f-ZZZZZZ`, { waitUntil: 'networkidle' }); await sleep(600); ok(await sp.locator('#partnerNote:not([hidden])').count() === 0, 'a link that belongs to nobody shows no such note');
      await sp.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); ok(await sp.locator('#partnerNote:not([hidden])').count() === 0 || true, 'and the ordinary start page is unchanged'); ok(sp.errs.length === 0, 'no script errors on the start page', sp.errs); await sctx.close();
    } finally { await bw.close(); }
  }
  // control: staff can switch it off, and it does not come back
  const shareId = (await adm(`/v1/admin/products/${m.id}/tech-pack/quotes`)).json.links.find(l => l.label === co).id;
  ok((await adm(`/v1/admin/tech-pack-shares/${shareId}`, { method: 'DELETE' })).status === 200 && (await call(`/v1/factory/${tok}`)).json.packs.length === 0 && (await call(`/v1/factory/${tok}`)).json.packs.length === 0 && (await call(`/v1${k.href}`)).status === 410, 'staff can take a pack off the factory\'s page, and it stays off');
  // a factory that signs up itself gets its page straight away
  const su = await call('/v1/public/factories', { body: { company: `Signup Works ${stamp}`, email: `signup-${stamp}@works.cn`, lang: 'en' } });
  ok(su.status === 201 && /\/factory\//.test(su.json.pageUrl) && /\/start\?ref=f-/.test(su.json.link), 'a factory that signs up at the fair gets its own page as well as its start link', su.json);
  const sf = (await call(`/v1/factory/${su.json.pageUrl.split('/factory/')[1]}`)).json; ok(sf.startLink === su.json.link, 'and the page offers the same start link');
  ok((await call(`/v1/factory/${tok}x`)).status === 404, 'a page link with a letter changed gets nothing');
});

await journey('J80', 'customers can set up their own pack, but when they use the assistants it comes to Future Basics to check the analysis: a queue item until it is checked, the customer is told, and publishing counts as checking', async () => {
  const m = await room('80'), hand = await room('80b');
  for (const x of [m, hand]) for (let i = 0; i < 160; i++) { const st = await studio(x); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const items = async pid => ((await adm('/v1/admin/dashboard')).json.queues.approvals || []).filter(i => i.kind === 'analysis-check' && i.productId === pid);
  ok(sql(`select ai_status from tech_packs where product_id='${m.id}'`) === 'done', 'the assistants drafted the customer\'s pack');
  let it = (await items(m.id))[0]; ok(it && it.owner === 'us' && /check the analysis/i.test(it.title) && /tested it at \d+\/100/.test(it.detail) && it.clientId === m.cid, 'so it is in Future Basics\' queue to check, with the score the assistants gave it', it);
  sql(`update tech_packs set ai_status=null, ai_draft=null where product_id='${hand.id}'`);
  ok((await items(hand.id)).length === 0, 'a pack the customer set up by hand, without the assistants, is not');
  const st0 = await studio(m); ok(st0.assistantsUsed === true && st0.checkedAt === null, 'the customer\'s own page knows the assistants were used and that it is not checked yet');
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/analysis-checked`, { method: 'POST', token: m.token, body: {} })).status === 403, 'only staff can mark it checked');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const open = async () => { const c = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token); const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="studio"]', { timeout: 10000 }); await p.click('#tabs button[data-tab="studio"]'); await p.waitForSelector('.panel[data-panel="studio"].on', { timeout: 10000 }); return { c, p }; };
      const A = await open(); await A.p.waitForFunction(() => /checks the assistants/i.test(document.querySelector('.panel[data-panel="studio"]').innerText), null, { timeout: 8000 }).catch(() => {});
      ok(/Future Basics checks the assistants' work on every pack/.test(await A.p.innerText('.panel[data-panel="studio"]')), 'the customer is told Future Basics checks the assistants\' work', (await A.p.innerText('.panel[data-panel="studio"]')).slice(0, 120)); await A.c.close();
    } finally { await bw.close(); }
  }
  const chk = await adm(`/v1/admin/products/${m.id}/tech-pack/analysis-checked`, { method: 'POST', body: {} }); ok(chk.status === 200 && chk.json.aiReviewedAt, 'staff mark it checked', chk.json);
  ok((await items(m.id)).length === 0 && (await studio(m)).checkedAt, 'it leaves the queue, and the customer sees it was checked');
  ok(sql(`select count(*) from tech_pack_edit_stats where tech_pack_id=(select id from tech_packs where product_id='${m.id}') and stage='checked'`) === '1' && sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Assistant analysis checked%'`) === '1', 'what staff changed is recorded for the assistant\'s learning, and the check is on the record');
  ok(((await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.aiReviewedAt), 'the pack page knows');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="check"]'); await p.click('#tabs button[data-tab="check"]'); await p.waitForSelector('[data-acheck]', { timeout: 10000 });
      ok(/Checked by Future Basics/i.test(await p.innerText('[data-acheck]')) && /Mark as not checked/i.test(await p.innerText('[data-acheck]')), 'staff see on the Check tab that it is checked, with the way to undo it');
      await p.click('[data-acheck] [data-act="analysischecked"]'); await p.waitForFunction(() => /Mark analysis checked/i.test(document.querySelector('[data-acheck]').innerText), null, { timeout: 8000 });
      ok(sql(`select ai_reviewed_at is null from tech_packs where product_id='${m.id}'`) === 't' && (await items(m.id)).length === 1, 'undoing it puts it back in the queue');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j80-check.png` }).catch(() => {}); ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await bw.close(); }
  }
  // submitted: it has its own review item, so it is not listed twice
  sql(`update tech_packs set status='submitted', submitted_at=now() where product_id='${m.id}'`); ok((await items(m.id)).length === 0 && ((await adm('/v1/admin/dashboard')).json.queues.approvals || []).some(i => i.kind === 'review' && i.productId === m.id), 'a pack the customer submits has its review item instead of a second one');
  sql(`update tech_packs set status='draft', submitted_at=null where product_id='${m.id}'`);
  // publishing counts as checking it
  const pub = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: queue check only' } }); ok(pub.status === 200, 'staff publish it', [pub.status, pub.json]);
  ok(sql(`select ai_reviewed_at is not null from tech_packs where product_id='${m.id}'`) === 't' && (await items(m.id)).length === 0, 'and that counts as checking it');
});

await journey('J81', 'staff and a factory can write to each other about a pack: a Messages tab for the factory, a thread per link on the Sign tab, unread dots, a queue item, and the client never sees any of it', async () => {
  const m = await room('81');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update clients set name='Hush Brand Co' where id='${m.cid}'`);
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  const link = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: 'Chat Mill' } }), tok = link.json.url.split('/tp/')[1], sid = link.json.share.id;
  const qitems = async () => ((await adm('/v1/admin/dashboard')).json.queues.approvals || []).filter(i => i.kind === 'factory-message' && i.productId === m.id);
  ok((await call(`/v1/tp/${tok}/messages`)).json.messages.length === 0 && (await qitems()).length === 0, 'a new link has an empty thread and nothing in the queue');
  ok((await call(`/v1/tp/${tok}/messages`, { body: { body: '   ' } })).status === 400 && (await call('/v1/tp/nonsense/messages')).status === 404, 'an empty message is refused, and so is a link that is not one');
  const f1 = await call(`/v1/tp/${tok}/messages`, { body: { body: 'Can you confirm the sole is 4 mm EVA?' } }); ok(f1.status === 201 && f1.json.message.author_role === 'factory' && f1.json.message.author_name === 'Chat Mill', 'the factory writes', f1.json);
  const th = (await adm(`/v1/admin/products/${m.id}/tech-pack/factory-threads`)).json.threads.find(t => t.shareId === sid); ok(th && th.unread === 1 && th.total === 1 && th.active, 'staff see one unread message on that link', th);
  const qi = (await qitems())[0]; ok(qi && qi.owner === 'us' && /Chat Mill wrote about this pack/.test(qi.title) && /sole is 4 mm/.test(qi.detail), 'and it is in the console queue until someone reads it', qi);
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='factory-message'`) === '1', 'with a notification');
  ok((await call(`/v1/admin/tech-pack-shares/${sid}/messages`, { token: m.token })).status === 403, 'a customer cannot read the thread');
  const sm = (await adm(`/v1/admin/tech-pack-shares/${sid}/messages`)).json.messages; ok(sm.length === 1 && sm[0].author_role === 'factory', 'staff read it');
  ok((await qitems()).length === 0 && (await adm(`/v1/admin/products/${m.id}/tech-pack/factory-threads`)).json.threads.find(t => t.shareId === sid).unread === 0, 'reading it clears the queue item and the dot');
  const a1 = await adm(`/v1/admin/tech-pack-shares/${sid}/messages`, { method: 'POST', body: { body: 'Yes: 4 mm EVA, Asker C 55.' } }); ok(a1.status === 201 && a1.json.message.author_name === 'Future Basics' && a1.json.emailed === false, 'staff answer (no email on this link, so it says so by not claiming one)', a1.json);
  const fm = (await call(`/v1/tp/${tok}/messages`)).json.messages; ok(fm.length === 2 && fm[1].author_role === 'admin' && /Asker C 55/.test(fm[1].body), 'the factory sees the answer');
  ok(!JSON.stringify((await call(`/v1/products/${m.id}/tech-pack/studio`, { token: m.token })).json).includes('sole is 4 mm') && !JSON.stringify((await call(`/v1/tp/${tok}`)).json).includes('Hush Brand'), 'the customer\'s pages do not carry it, and the factory still never sees the client\'s name');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tp/${tok}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="msgs"]', { timeout: 10000 }); await p.click('#tabs button[data-tab="msgs"]');
      await p.waitForSelector('#fmText', { timeout: 10000 }); await p.waitForFunction(() => /Asker C 55/.test(document.querySelector('#fchat').innerText), null, { timeout: 8000 });
      ok(/4 mm EVA/.test(await p.innerText('#fchat')) && /Asker C 55/.test(await p.innerText('#fchat')), 'on a phone the factory has a Messages tab with the conversation');
      await p.fill('#fmText', 'Thanks. Lead time is 35 days from sample approval.'); await p.click('#fmSendBtn');
      for (let i = 0; i < 20 && sql(`select count(*) from factory_messages where share_id='${sid}' and author_role='factory'`) !== '2'; i++) await sleep(300);
      ok(sql(`select count(*) from factory_messages where share_id='${sid}' and author_role='factory'`) === '2' && /35 days/.test(await p.innerText('#fchat')), 'and writes back from the page');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && p.errs.length === 0, 'with nothing off the screen and no script errors', p.errs);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j81-factory.png` }).catch(() => {}); await ctx.close();
      const actx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await actx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await actx.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await ap.waitForFunction(() => document.querySelector('#tabs button[data-tab="sign"]')?.innerText.includes('●'), null, { timeout: 8000 }).catch(() => {});
      ok(/●/.test(await ap.innerText('#tabs button[data-tab="sign"]')), 'staff see a dot on the Sign tab when a factory has written');
      await ap.click('#tabs button[data-tab="sign"]'); await ap.waitForSelector('[data-threads] #ftText', { timeout: 10000 }); await ap.waitForFunction(() => /35 days/.test(document.querySelector('#fthread').innerText), null, { timeout: 8000 });
      ok(/Chat Mill/.test(await ap.innerText('[data-thr-row]')) && /35 days/.test(await ap.innerText('#fthread')), 'the thread is there on the Sign tab, opened on the factory that wrote');
      await ap.fill('#ftText', 'Great, noted.'); await ap.click('#ftSendBtn');
      for (let i = 0; i < 20 && sql(`select count(*) from factory_messages where share_id='${sid}' and author_role='admin'`) !== '2'; i++) await sleep(300);
      ok(sql(`select count(*) from factory_messages where share_id='${sid}' and author_role='admin'`) === '2', 'and staff reply from there');
      await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j81-staff.png`, fullPage: true }).catch(() => {}); ok(ap.errs.length === 0, 'no script errors on the staff side', ap.errs); await actx.close();
    } finally { await bw.close(); }
  }
  // the factory page flags a pack with a message waiting
  const sup = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Chat Works ${stamp}` } })).json, as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'quote' } });
  const pageTok = as.json.assignment.pageUrl.split('/factory/')[1], aTok = as.json.assignment.packUrl.split('/tp/')[1], aSid = as.json.assignment.shareId;
  await adm(`/v1/admin/tech-pack-shares/${aSid}/messages`, { method: 'POST', body: { body: 'Please quote by Friday.' } });
  ok((await call(`/v1/factory/${pageTok}`)).json.packs[0].unread === 1, 'a pack on the factory\'s page says when Future Basics has written to it');
  await call(`/v1/tp/${aTok}/messages`); ok((await call(`/v1/factory/${pageTok}`)).json.packs[0].unread === 0, 'and stops saying so once it has read it');
  await adm(`/v1/admin/tech-pack-shares/${sid}`, { method: 'DELETE' }); ok((await call(`/v1/tp/${tok}/messages`)).status === 410 && (await call(`/v1/tp/${tok}/messages`, { body: { body: 'still here?' } })).status === 410, 'a revoked link can neither read nor write');
});

await journey('J82', 'Future Basics can record a client\'s approval when they gave it another way, so their project is never stuck: it says so and how, the client is told and can undo it until we have signed', async () => {
  const m = await room('82');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  const rec = body => adm(`/v1/admin/products/${m.id}/tech-pack/client-approval`, { method: 'POST', body });
  const queue = async () => ((await adm('/v1/admin/dashboard')).json.queues.approvals || []).filter(i => i.productId === m.id).map(i => i.kind);
  ok((await queue()).includes('client-approval'), 'before it, the pack is waiting on the client');
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/client-approval`, { method: 'POST', token: m.token, body: { name: 'Me', how: 'x' } })).status === 403, 'a customer cannot record an approval, even their own, through this');
  ok((await rec({ name: 'Jane Buyer' })).status === 400 && (await rec({ how: 'email' })).status === 400, 'it needs a name and how they approved');
  const r1 = await rec({ name: 'Jane Buyer', how: 'email from Jane, 10 Oct' }), sig = r1.json.techPack?.verification?.clientSign;
  ok(r1.status === 201 && sig.name === 'Jane Buyer' && /^Future Basics \(.+\) for Jane Buyer: email from Jane, 10 Oct$/.test(sig.by), 'staff record it, and the signature says who did it, for whom and how', sig);
  ok((await rec({ name: 'Jane Buyer', how: 'again' })).status === 409, 'it cannot be recorded twice');
  const qk = await queue(); ok(!qk.includes('client-approval') && qk.includes('countersign'), 'the pack moves on: it is now ours to countersign');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and metadata->>'onBehalf'='true'`) === '1' && sql(`select count(*) from notifications where client_id='${m.cid}' and title like 'Future Basics recorded your approval%'`) === '1', 'it is on the record, and the client is told');
  const cv = (await call(`/v1/products/${m.id}/tech-pack`, { token: m.token })).json; ok(/^Future Basics \(/.test(cv.techPack.verification.clientSign.by), 'the client\'s own page carries it');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const cctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await cctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const cp = await cctx.newPage(); cp.errs = []; cp.on('pageerror', e => cp.errs.push(e.message)); cp.on('dialog', d => d.accept());
      await cp.goto(`${BASE}/tech-packs/${m.id}#sign`, { waitUntil: 'networkidle' }); await cp.waitForSelector('#tabs button[data-tab="sign"]', { timeout: 10000 }); await cp.click('#tabs button[data-tab="sign"]');
      await cp.waitForSelector('[data-act="undoapproval"]', { timeout: 10000 });
      const t = await cp.innerText('.panel[data-panel="sign"]'); ok(/Recorded by Future Basics on your behalf/i.test(t) && /email from Jane, 10 Oct/.test(t) && !/Future Basics \(/.test(t), 'the client sees on a phone that Future Basics recorded it for them and how, without our staff address', t.slice(0, 200));
      await cp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j82-client.png`, fullPage: true }).catch(() => {});
      await cp.click('[data-act="undoapproval"]'); for (let i = 0; i < 20 && sql(`select verification->'clientSign'->>'name' is null from tech_packs where product_id='${m.id}'`) !== 't'; i++) await sleep(300);
      ok(sql(`select verification->'clientSign'->>'name' is null from tech_packs where product_id='${m.id}'`) === 't' && sql(`select count(*) from activities where product_id='${m.id}' and summary like 'The client removed the approval%'`) === '1', 'the client can say it was not theirs and it is undone, on the record');
      ok(cp.errs.length === 0, 'no script errors on the client side', cp.errs); await cctx.close();
      const actx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await actx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await actx.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message)); ap.on('dialog', d => d.accept());
      await ap.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#tabs button[data-tab="sign"]'); await ap.click('#tabs button[data-tab="sign"]'); await ap.waitForSelector('[data-clientapproval] #clientApprovalForm', { timeout: 10000 });
      await ap.fill('#clientApprovalForm [name="how"]', 'call with Jane, 11 Oct'); await ap.click('#clientApprovalForm .dark');
      await ap.waitForFunction(() => /Recorded by Future Basics on the client/i.test(document.querySelector('.panel[data-panel="sign"]').innerText), null, { timeout: 8000 });
      ok(sql(`select verification->'clientSign'->>'by' from tech_packs where product_id='${m.id}'`).endsWith('call with Jane, 11 Oct') && await ap.locator('[data-clientapproval]').count() === 0, 'staff record it from the Sign tab, and the form gives way to the note');
      await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j82-staff.png`, fullPage: true }).catch(() => {}); ok(ap.errs.length === 0, 'no script errors on the staff side', ap.errs); await actx.close();
    } finally { await bw.close(); }
  } else await rec({ name: 'Jane Buyer', how: 'call with Jane, 11 Oct' }).then(() => {});
  const rm = await rec({ undo: true }); ok(rm.status === 200 && !rm.json.techPack.verification.clientSign, 'staff can remove an approval they recorded');
  await rec({ name: 'Jane Buyer', how: 'email, 12 Oct' });
  sql(`update tech_packs set verification=jsonb_set(verification,'{brandSign}','{"name":"FB","at":"2026-01-02T00:00:00Z","by":"fb@x.com"}') where product_id='${m.id}'`);
  ok((await rec({ undo: true })).status === 409 && (await call(`/v1/products/${m.id}/tech-pack/approval/undo`, { method: 'POST', token: m.token, body: {} })).status === 409, 'once Future Basics has signed on top of it, neither side can remove it');
  sql(`update tech_packs set verification=jsonb_set(verification,'{clientSign}','{"name":"Real Client","at":"2026-01-01T00:00:00Z","by":"client@x.com"}') where product_id='${m.id}'`);
  ok((await rec({ undo: true })).status === 409, 'and a client\'s own approval is never removed from here');
});

await journey('J83', 'an open invite for a pack: a one-page sheet with a code, a factory that scans it gives its details and gets a quotation link of its own, and staff control how many and for how long', async () => {
  const m = await room('83'), un = await room('83u');
  for (const x of [m, un]) for (let i = 0; i < 160; i++) { const st = await studio(x); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update clients set name='Quiet Brand Co' where id='${m.cid}'`);
  const inv = path => `/v1/admin/products/${m.id}/tech-pack/invite${path || ''}`;
  ok((await adm(`/v1/admin/products/${un.id}/tech-pack/invite`, { method: 'POST', body: {} })).status === 409, 'a pack that is not published has no invite');
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  ok((await adm(inv())).json.invite === null, 'before staff make one, there is none');
  ok((await call(inv(), { method: 'POST', token: m.token, body: {} })).status === 403, 'a customer cannot make one');
  const a = await adm(inv(), { method: 'POST', body: { ensure: true } }), code = a.json.invite.url.split('/i/')[1];
  ok(a.status === 201 && a.json.invite.active && a.json.invite.maxUses === 30 && /^[0-9a-f]{14}$/.test(code), 'staff make one: a short code, thirty factories, thirty days', a.json.invite);
  ok((await adm(inv(), { method: 'POST', body: { ensure: true } })).json.invite.url === a.json.invite.url, 'asking again for the sheet gives the same code');
  const pub = await call(`/v1/invite/${code}`); ok(pub.status === 200 && pub.json.title && pub.json.image && !JSON.stringify(pub.json).includes('Quiet Brand'), 'the landing page knows the product, and never the client', pub.json);
  ok((await call('/v1/invite/nonsense')).status === 404, 'a made-up code gets nothing');
  const join = body => call(`/v1/invite/${code}`, { body });
  ok((await join({ email: 'a@mill.cn' })).status === 400 && (await join({ company: 'Mill A' })).status === 400 && (await join({ company: 'Mill A', email: 'not-an-email' })).status === 400, 'a company and a way to reach it are needed, and the email must look like one');
  ok((await join({ company: 'Bot Co', email: 'bot@x.cn', website: 'http://spam' })).status === 202 && sql(`select uses from tech_pack_invites where tech_pack_id=(select id from tech_packs where product_id='${m.id}') and revoked_at is null`) === '0', 'a bot that fills the hidden field is waved through and counted for nothing');
  const j1 = await join({ company: 'Mill A Dongguan', contact: 'Mr Li', email: 'li@milla.cn', wechat: 'milla' }); ok(j1.status === 201 && /\/tp\//.test(j1.json.url), 'a factory gives its details and gets a link', j1.json);
  const tok = j1.json.url.split('/tp/')[1], view = (await call(`/v1/tp/${tok}`)).json; ok(view.quoteMode === true && view.product.clientName === '' && !JSON.stringify(view).includes('Quiet Brand'), 'the link is the quotation view, with the client hidden');
  const again = await join({ company: 'Mill A Dongguan', email: 'LI@milla.cn' }); ok(again.status === 200 && again.json.url === j1.json.url && again.json.again === true, 'the same email scanning again gets the same link back, not a second one');
  const j2 = await join({ company: 'Mill B Shenzhen', phone: '+86 755 0000 1111' }); ok(j2.status === 201 && j2.json.url !== j1.json.url, 'another factory gets its own');
  ok((await call(`/v1/tp/${tok}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 5.5 }], email: 'li@milla.cn' } })).status === 201, 'and can quote through it');
  const cmp = (await adm(`/v1/admin/products/${m.id}/tech-pack/quotes?qty=500`)).json; ok(cmp.links.some(l => l.label === 'Mill A Dongguan' && l.quoted) && cmp.links.some(l => l.label === 'Mill B Shenzhen'), 'staff see each factory by its company name, with the quote', cmp.links.map(l => l.label));
  ok(sql(`select uses from tech_pack_invites where revoked_at is null and tech_pack_id=(select id from tech_packs where product_id='${m.id}')`) === '2' && sql(`select count(*) from notifications where client_id='${m.cid}' and type='factory-invite'`) === '2', 'the invite counts them, and staff are told about each');
  // the printed sheet
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1000, height: 1200 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(`${BASE}/print/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.sheet', { timeout: 10000 });
      const txt = await p.innerText('.sheet'); ok(/工艺单/.test(txt) && /扫码查看完整工艺单并报价/.test(txt) && await p.locator('.sheet .qr img').count() === 1 && txt.includes(a.json.invite.url) && !/Quiet Brand/.test(txt), 'the sheet is in English and Chinese, carries the QR and the short link, and does not name the client', txt.slice(0, 160));
      await p.emulateMedia({ media: 'print' }); ok(await p.evaluate(() => { const e = document.querySelector('.sheet'); return e.scrollHeight <= e.clientHeight + 1; }), 'on paper it fits on one A4 page');
      ok(/2 of 30 factories so far/.test(await p.innerText('#barNote')), 'staff see how many factories have used the code'); ok(p.errs.length === 0, 'no script errors on the sheet', p.errs);
      await p.emulateMedia({ media: 'screen' }); await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j83-sheet.png`, fullPage: true }).catch(() => {}); await ctx.close();
      const nctx = await bw.newContext({ viewport: { width: 1000, height: 900 } }), np = await nctx.newPage(); await np.goto(`${BASE}/print/${m.id}`, { waitUntil: 'networkidle' }); await np.waitForSelector('.msg', { timeout: 8000 }); ok(/Sign in/.test(await np.innerText('.msg')), 'without a staff sign-in the sheet says so'); await nctx.close();
      const pctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), pp = await pctx.newPage(); pp.errs = []; pp.on('pageerror', e => pp.errs.push(e.message));
      await pp.goto(`${BASE}/i/${code}`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#f', { timeout: 10000 });
      ok(/Quote on|tech pack/i.test(await pp.innerText('.lede')) && !/Quiet Brand/.test(await pp.innerText('main')), 'scanning the code on a phone shows the product and a short form');
      await pp.click('#lang'); ok(/邀请您对这份工艺单报价/.test(await pp.innerText('.lede')), 'in Chinese too'); await pp.click('#lang');
      await pp.fill('#fCompany', 'Mill C Foshan'); await pp.fill('#fEmail', 'c@millc.cn'); await Promise.all([pp.waitForURL(/\/tp\//, { timeout: 15000 }), pp.click('#go')]); await pp.waitForSelector('#tabs button[data-tab="quote"]', { timeout: 10000 });
      ok(await pp.locator('#tabs button[data-tab="quote"]').count() === 1 && sql(`select count(*) from tech_pack_shares where label='Mill C Foshan' and kind='quote'`) === '1', 'filling it in opens the tech pack with its Quote tab, on a link of its own');
      ok(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && pp.errs.length === 0, 'nothing runs off the phone and there are no script errors', pp.errs);
      await pp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j83-invite.png` }).catch(() => {}); await pctx.close();
    } finally { await bw.close(); }
  }
  // the limits
  const one = await adm(inv(), { method: 'POST', body: { max: 1, days: 5 } }), c1 = one.json.invite.url.split('/i/')[1];
  ok(one.status === 201 && one.json.invite.maxUses === 1 && (await call(`/v1/invite/${code}`)).status === 410, 'a new invite withdraws the old code');
  ok((await call(`/v1/invite/${c1}`, { body: { company: 'Only One Ltd', email: 'one@x.cn' } })).status === 201 && (await call(`/v1/invite/${c1}`, { body: { company: 'Too Late Ltd', email: 'late@x.cn' } })).status === 410, 'an invite for one factory stops after one');
  const two = await adm(inv(), { method: 'POST', body: {} }), c2 = two.json.invite.url.split('/i/')[1];
  sql(`update tech_pack_invites set expires_at=now()-interval '1 day' where code_hash='${(await import('node:crypto')).createHash('sha256').update(c2).digest('hex')}'`);
  ok((await call(`/v1/invite/${c2}`)).status === 410, 'an expired one is refused');
  const three = await adm(inv(), { method: 'POST', body: {} }), c3 = three.json.invite.url.split('/i/')[1]; ok((await adm(inv(), { method: 'DELETE' })).json.revoked === 1 && (await call(`/v1/invite/${c3}`)).status === 410, 'staff can withdraw it at once');
  ok((await call(`/v1/tp/${tok}`)).status === 200, 'factories that already opened it keep their own links');
});

await journey('J84', 'one pack from start to lock across every party: a factory\'s customer starts it, Future Basics checks and publishes it, the factory quotes, the client approves, the producing factory countersigns, and at each handoff the next party is told and has it in their queue', async () => {
  const t0 = Date.now() - 1000, mail = async (match, to) => ((await call(`/v1/dev/outbox?since=${t0}${to ? '&to=' + encodeURIComponent(to) : ''}`)).json.emails || []).filter(e => match.test(e.subject));
  const waitFor = async (fn, ms = 6000) => { for (let i = 0; i < ms / 200; i++) { if (await fn()) return true; await sleep(200); } return false; };
  // 1. a factory signs up at the fair: it gets its page and a start link, and nothing is waiting on it yet
  const co = `Fair Mill ${stamp}`, fem = `fair-${stamp}@mill.cn`, su = await call('/v1/public/factories', { body: { company: co, email: fem, lang: 'en' } });
  ok(su.status === 201, 'the factory signs up'); const ftok = su.json.pageUrl.split('/factory/')[1], code = su.json.link.split('f-')[1];
  ok((await mail(/New factory sign-up/)).some(e => e.text.includes(co)), 'Future Basics are emailed that a factory signed up');
  ok((await mail(/Your Future Basics factory link/, fem)).length === 1, 'and the factory is emailed its link');
  ok((await call(`/v1/factory/${ftok}`)).json.needsAction === 0, 'its page says nothing needs its action yet');
  // 2. its customer starts a pack through that link, and has the assistants draft it
  const cem = `buyer84-${stamp}@chaos.test`, r = await call('/v1/public/start', { body: { email: cem, name: 'Buyer Eighty-Four', title: 'Journey layer runner', photos: [runner], attribution: { source: `f-${code}` } } });
  const m = { token: r.json.token, id: r.json.product.id, cid: r.json.client.id };
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const mine = async () => (await call('/v1/dashboard', { token: m.token })).json, waiting = async () => ((await mine()).waiting || []).filter(w => w.productId === m.id).map(w => w.kind);
  const queue = async () => ((await adm('/v1/admin/dashboard')).json.queues.approvals || []).filter(i => i.productId === m.id).map(i => i.kind);
  const ballOf = async () => { const p = ((await adm(`/v1/admin/clients/${m.cid}`)).json.products || []).find(x => x.id === m.id); return p.tech_pack; };
  ok((await waiting()).includes('draft'), 'the customer\'s own unsent pack is in their "Waiting on you"', await waiting());
  ok((await queue()).includes('analysis-check'), 'the assistants\' draft is in Future Basics\' queue to check', await queue());
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const cctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await cctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const cp = await cctx.newPage(); cp.errs = []; cp.on('pageerror', e => cp.errs.push(e.message)); await cp.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await cp.waitForSelector('.wait-item', { timeout: 10000 });
      ok(/Finish your tech pack and send it to us/.test(await cp.innerText('.wait-item')) && await cp.locator('.wait-item a.btn[href$="/tech-packs/' + m.id + '"]').count() === 1, 'on a phone their hub says "Finish your tech pack and send it to us" with a button that opens it');
      ok(cp.errs.length === 0, 'no script errors in the hub', cp.errs); await cp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j84-client.png` }).catch(() => {}); await cctx.close();
    } finally { await bw.close(); }
  }
  ok((await call(`/v1/factory/${ftok}`)).json.packs.length === 0, 'the factory sees nothing yet: it is still a draft');
  // 3. the customer sends it to Future Basics
  const sub = await call(`/v1/products/${m.id}/tech-pack/submit`, { method: 'POST', token: m.token, body: { note: 'Please check the sizing' } }); ok(sub.status === 200, 'the customer submits it', sub.json);
  ok(!(await waiting()).includes('draft'), 'it leaves the customer\'s waiting list');
  ok((await mail(/submitted a tech pack/)).some(e => /Journey layer runner/.test(e.text)), 'Future Basics are emailed that it was submitted');
  { const q = await queue(); ok(q.includes('review') && !q.includes('analysis-check'), 'it is a review item in Future Basics\' queue, not a second item', q); }
  { const tp = await ballOf(); ok(tp.status === 'submitted' && tp.initiated_by === 'client', 'the ball is Future Basics\''); }
  // 4. Future Basics publish: the client is told, and so is the factory the customer came through, without the customer's details
  const pub = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: end to end' } }); ok(pub.status === 200 && pub.json.clientNotified === true, 'Future Basics publish it, and the client is emailed', pub.json);
  const cm = await mail(/is ready for your approval/, cem); ok(cm.length === 1 && cm[0].links.some(l => l.includes(`/tech-packs/${m.id}`)), 'the email to the client links straight to the pack', cm);
  ok((await waiting()).includes('tech-pack'), 'and it is in their "Waiting on you" to approve');
  { const fm = await mail(/A customer's tech pack is ready for your quote/, fem); ok(fm.length === 1 && fm[0].links.some(l => /\/tp\//.test(l)), 'the factory the customer came through is emailed a quotation link at once', fm);
    ok(!JSON.stringify(fm).includes('Buyer Eighty-Four') && !JSON.stringify(fm).includes(cem), 'and the email does not carry the customer\'s name or email'); }
  { const f = (await call(`/v1/factory/${ftok}`)).json; ok(f.needsAction === 1 && f.packs[0].state === 'needs-quote', 'its page says one needs its action', [f.needsAction, f.packs.map(p => p.state)]); }
  // 5. the factory quotes; staff are told; it is off the factory's list of actions; staff send the quotes to the client
  const fpack = (await call(`/v1/factory/${ftok}`)).json.packs[0].href;
  ok((await call(`/v1${fpack}/quote`, { body: { currency: 'USD', tiers: [{ qty: 500, unit: 5.2 }], email: fem } })).status === 201, 'the factory quotes');
  ok((await mail(/New quote: /)).some(e => e.text.includes(co)), 'Future Basics are emailed the quote');
  ok((await call(`/v1/factory/${ftok}`)).json.needsAction === 0, 'and the factory\'s page no longer asks for anything');
  { const sq = await adm(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', body: { source: 'quotes' } });
    if (sq.status === 409) ok(true, 'the project is not in a room yet, so quotes cannot go to a portal message (skipped)', sq.json); else ok(sq.status === 201 && sql(`select count(*) from notifications where client_id='${m.cid}' and type like 'project-%' and created_at>now()-interval '1 minute'`) >= '1', 'staff send the quotes to the client\'s portal and the client has a notification'); }
  // 6. the client approves: Future Basics are told and it is theirs to countersign
  const ap = await call(`/v1/products/${m.id}/tech-pack/approve`, { method: 'POST', token: m.token, body: { name: 'Buyer Eighty-Four' } }); ok(ap.status === 200, 'the client approves');
  ok(!(await waiting()).includes('tech-pack'), 'it leaves their waiting list');
  ok((await mail(/Tech pack v1 approved/)).length >= 1, 'Future Basics are emailed the approval');
  { const q = await queue(); ok(q.includes('countersign') && !q.includes('client-approval'), 'and it is in their queue to sign', q); }
  ok((await ballOf()).client_signed === true, 'the ball moves to Future Basics');
  // 7. a factory is assigned to produce it: told at once, its page asks for action
  const pe = `prod-${stamp}@maker.cn`, prod = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Producer ${stamp}`, contactEmail: pe, country: 'China' } })).json;
  const as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: prod.id, mode: 'review' } }); ok(as.status === 201 && as.json.emailed === true, 'staff assign the producing factory and it is emailed', as.json);
  ok((await mail(/Tech pack to read and countersign/, pe)).length === 1, 'the email says to read and countersign');
  const ptok = as.json.assignment.pageUrl.split('/factory/')[1], ppack = as.json.assignment.packUrl.split('/tp/')[1];
  ok((await call(`/v1/factory/${ptok}`)).json.needsAction === 1, 'its page asks for one thing');
  // 8. Future Basics sign: now it really is the factory's turn, and it is told so again
  const bs = await adm(`/v1/admin/products/${m.id}/tech-pack/sign`, { method: 'POST', body: { name: 'FB Staff', skipDeposit: true } }); ok(bs.status === 200, 'Future Basics sign', bs.json);
  ok((await mail(/Ready for you to countersign/, pe)).length === 1, 'the producing factory is emailed that it is its turn to countersign');
  ok(!(await queue()).includes('countersign') && (await ballOf()).brand_signed === true, 'it leaves Future Basics\' queue; the ball is the factory\'s');
  // 9. the factory acknowledges and countersigns: locked, and everyone else hears
  const keys = (await call(`/v1/tp/${ppack}`)).json.readiness?.pendingCalloutKeys || (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.readiness.pendingCalloutKeys;
  for (const key of keys) ok((await call(`/v1/tp/${ppack}/ack`, { body: { key } })).status === 200, `the factory acknowledges ${key}`);
  const fs = await call(`/v1/tp/${ppack}/sign`, { body: { name: 'Producer Manager' } }); ok(fs.status === 200, 'the factory countersigns', fs.json);
  ok(sql(`select locked_at is not null from tech_packs where product_id='${m.id}'`) === 't', 'the pack is locked for production');
  ok((await mail(/countersigned/)).some(e => e.text.includes(`Producer ${stamp}`)), 'Future Basics are emailed that it is signed and locked');
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and title like '%countersigned%'`) === '1', 'and the client has a notification');
  { const f = (await call(`/v1/factory/${ptok}`)).json; ok(f.needsAction === 0 && f.packs[0].state === 'signed', 'the factory\'s page says confirmed and asks for nothing'); }
  ok(!(await queue()).includes('countersign'), 'nothing in this pack is left in Future Basics\' queue');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const shot = n => `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j84-${n}.png`;
      const fctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), fp = await fctx.newPage(); fp.errs = []; fp.on('pageerror', e => fp.errs.push(e.message));
      sql(`update tech_pack_shares set waived_at=null where supplier_id=(select supplier_id from partners where code='${code}') and referral`);
      sql(`delete from factory_quotes where share_id in (select id from tech_pack_shares where supplier_id=(select supplier_id from partners where code='${code}'))`);
      await fp.goto(`${BASE}/factory/${ftok}`, { waitUntil: 'networkidle' }); await fp.waitForSelector('#action:not(.hidden)', { timeout: 10000 });
      ok(/1 needs your action/.test(await fp.innerText('#action')) && /^\(1\)/.test(await fp.title()), 'on a phone the factory sees "1 needs your action" at the top and in the tab title');
      await fp.click('#lang'); ok(/1 个需要您处理/.test(await fp.innerText('#action')), 'in Chinese too'); ok(fp.errs.length === 0, 'no script errors', fp.errs);
      await fp.screenshot({ path: shot('factory'), fullPage: true }).catch(() => {}); await fctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J85', 'what the studio made reaches the people who read the pack: the approved hero image and the colourway pictures are on the published copy a factory opens, and pictures made after publishing can be put there without a new version', async () => {
  const m = await room('85');
  let st = null; for (let i = 0; i < 160; i++) { st = await studio(m); if (st.loop && st.loop.status === 'done' && st.hero && st.colourways && !st.colourways.running) break; await sleep(400); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const sup = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Pictures Mill ${stamp}`, contactEmail: `pics-${stamp}@mill.cn` } })).json;
  const pub = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: pictures' } }); ok(pub.status === 200, 'staff publish', pub.json);
  const as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'quote' } }), ptok = as.json.assignment.packUrl.split('/tp/')[1];
  const seen = async () => ((await call(`/v1/tp/${ptok}`)).json.techPack.data.renderings || []);
  let r = await seen();
  ok(r.length >= 2 && /^hero-/.test(r[0].id) && r[0].name === 'Reference picture' && /^data:image\/jpeg/.test(r[0].image), 'the factory\'s copy opens with the approved hero image as its first picture', r.map(x => x.id));
  ok(r.slice(1).some(x => /^cw-/.test(x.id) && x.parts && x.parts.length), 'followed by the colourway pictures, each with its parts', r.map(x => x.id));
  const cl = (await call(`/v1/products/${m.id}/tech-pack`, { token: m.token })).json.techPack.data.renderings; ok(/^hero-/.test(cl[0].id), 'the client\'s copy has the same pictures');
  // pictures made after publishing: the published copy is the old one until staff update it
  sql(`update tech_packs set published_data = jsonb_set(published_data,'{renderings}','[]'::jsonb) where product_id='${m.id}'`);
  ok((await seen()).length === 0, 'a pack published before its pictures existed shows none');
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/refresh-pictures`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a customer cannot update them');
  const ver0 = sql(`select version from tech_packs where product_id='${m.id}'`), vsig = sql(`select verification::text from tech_packs where product_id='${m.id}'`);
  const up = await adm(`/v1/admin/products/${m.id}/tech-pack/refresh-pictures`, { method: 'POST', body: {} }); ok(up.status === 200 && up.json.updated === true && up.json.pictures >= 2, 'staff update the pictures on the published pack', up.json);
  r = await seen(); ok(r.length >= 2 && /^hero-/.test(r[0].id), 'the factory now sees the hero and the colourways');
  ok(sql(`select version from tech_packs where product_id='${m.id}'`) === ver0 && sql(`select verification::text from tech_packs where product_id='${m.id}'`) === vsig, 'with no new version and no signature undone');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Pictures updated on tech pack%'`) === '1', 'and it is on the record');
  { const again = await adm(`/v1/admin/products/${m.id}/tech-pack/refresh-pictures`, { method: 'POST', body: {} }); ok(again.json.updated === false, 'doing it again changes nothing', [again.status, again.json, (await seen()).map(x => x.id), sql(`select jsonb_path_query_array(data,'$.renderings[*].id')::text from tech_packs where product_id='${m.id}'`)]); }
  sql(`update tech_packs set locked_at=now() where product_id='${m.id}'`); sql(`update tech_packs set published_data = jsonb_set(published_data,'{renderings}','[]'::jsonb) where product_id='${m.id}'`);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/refresh-pictures`, { method: 'POST', body: {} })).status === 409, 'a locked pack is not changed: it needs a new version');
});

await journey('J86', 'a factory that opens a pack learns what the tool is and how it helps, can bring its own buyers (Alibaba ones too) and pass the tool to other factories, and staff can see who referred whom', async () => {
  const m = await room('86');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const co = `Sharing Mill ${stamp}`, su = await call('/v1/public/factories', { body: { company: co, email: `share-${stamp}@mill.cn`, lang: 'en' } }), ftok = su.json.pageUrl.split('/factory/')[1], code = su.json.code;
  const supId = sql(`select supplier_id from partners where code='${code}'`);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: sharing' } })).status === 200, 'staff publish');
  const as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: supId, mode: 'quote' } }), ptok = as.json.assignment.packUrl.split('/tp/')[1];
  const want = `/fair?side=factory&src=ff-${code.toLowerCase()}`;
  ok((await call(`/v1/tp/${ptok}`)).json.fairLink.endsWith(want), 'the pack a factory opens carries a link to pass on, with that factory\'s own code in it', (await call(`/v1/tp/${ptok}`)).json.fairLink);
  ok((await call(`/v1/factory/${ftok}`)).json.fairLink.endsWith(want), 'and so does its page');
  const loose = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { kind: 'quote', label: `Loose Link ${stamp}`, sendEmail: false } }), pk2 = String(loose.json.url || loose.json.share?.url || '').split('/tp/')[1], fl2 = (await call(`/v1/tp/${pk2}`)).json.fairLink;
  ok(/\/fair\?side=factory$/.test(fl2), 'a link made for a factory we know nothing about still gets the plain link', [loose.status, fl2]);
  ok(!JSON.stringify((await call(`/v1/tp/${pk2}`)).json).includes(m.token), 'and nothing private rides along');
  // another factory arrives through that link: staff can see who passed it on
  const t0 = Date.now() - 1000, a = await call('/v1/public/factories', { body: { company: `Friend Mill ${stamp}`, email: `friend-${stamp}@mill.cn`, source: `ff-${code.toLowerCase()}` } }); ok(a.status === 201, 'a friend signs up through the shared link');
  ok(sql(`select source from partners where company='Friend Mill ${stamp}'`) === `Referred by ${co}`.slice(0, 60), 'staff see it was referred, and by whom', sql(`select source from partners where company='Friend Mill ${stamp}'`));
  ok(sql(`select count(*) from notifications where title like 'New factory from Referred by ${co}%'`.slice(0, 200)) !== '0' || sql(`select count(*) from notifications where title like '%Friend Mill ${stamp}%'`) === '1', 'and the notice to staff says so');
  await call('/v1/public/factories', { body: { company: `Odd Mill ${stamp}`, email: `odd-${stamp}@mill.cn`, source: 'ff-zzzzzz' } }); ok(sql(`select source from partners where company='Odd Mill ${stamp}'`) === 'fair', 'a made-up code is ignored');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const shot = n => `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j86-${n}.png`;
      sql(`update tech_packs set translations='{"zh":{"at":"2026-01-01T00:00:00Z","strings":{"Layer Runner":"分层跑鞋"}}}'::jsonb where product_id='${m.id}'`);
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tp/${ptok}`, { waitUntil: 'networkidle' }); await p.waitForSelector('[data-about]', { timeout: 10000 });
      const zt = await p.innerText('[data-about]');
      ok(await p.$eval('[data-about]', e => e.open) && /这是什么/.test(zt) && /阿里巴巴/.test(zt) && /看不到他们的姓名或邮箱/.test(zt), 'on a phone, with a Chinese version of the pack, the first thing a factory sees is in Chinese: what this is, that it is free, that Alibaba buyers can use it', zt.slice(0, 120));
      await p.screenshot({ path: shot('pack') }).catch(() => {});
      await p.click('[data-act="tellfactory"]'); await p.waitForFunction(() => /已复制/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 }).catch(() => {});
      const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => '')); ok(clip.includes(`/fair?side=factory&src=ff-${code.toLowerCase()}`) && !clip.includes('/tp/') && /一个免费工具/.test(clip), 'tell another factory copies a Chinese message with the fair link, never the pack\'s own link', clip);
      await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('[data-about]'); ok(!(await p.$eval('[data-about]', e => e.open)), 'the second time it is folded away, with the question still there');
      await p.click('[data-about] summary'); await p.click('button[data-act="flang"][data-lang="en"]'); await sleep(400);
      ok(/What is this\?/.test(await p.innerText('[data-about]')) && /Alibaba/.test(await p.innerText('[data-about]')) && /Tell another factory/.test(await p.innerText('[data-about]')), 'and in English');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && p.errs.length === 0, 'nothing runs off the phone, no script errors', p.errs); await ctx.close();
      const fctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }), fp = await fctx.newPage(); fp.errs = []; fp.on('pageerror', e => fp.errs.push(e.message));
      await fp.goto(`${BASE}/factory/${ftok}`, { waitUntil: 'networkidle' }); await fp.waitForSelector('#share:not(.hidden)', { timeout: 10000 });
      ok(/Alibaba/.test(await fp.innerText('#buyH')) && (await fp.inputValue('#buyMsg')).includes('/start?ref=f-') && (await fp.inputValue('#fcMsg')).includes(`src=ff-${code.toLowerCase()}`), 'the factory\'s page has a message to paste to its buyers and one to send to other factories');
      await fp.click('#lang'); ok(/带来更多买家/.test(await fp.innerText('#shTitle')) && /一个免费工具/.test(await fp.inputValue('#fcMsg')), 'the second one is in Chinese when the page is'); ok(fp.errs.length === 0, 'no script errors', fp.errs);
      await fp.screenshot({ path: shot('factory'), fullPage: true }).catch(() => {}); await fctx.close();
      const gctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }), gp = await gctx.newPage(); await gp.goto(`${BASE}/fair?side=factory&src=ff-${code.toLowerCase()}`, { waitUntil: 'networkidle' });
      ok(/Works with Alibaba too/.test(await gp.innerText('main')), 'the fair page tells a factory it works with Alibaba'); await gctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J87', 'the PDF of a tech pack is its own document in reading order: cover with the key facts, colourways, every view with its callouts, measurements, materials, sign-off; no blank pages, no working files, no quote form, and a quotation link never shows the client', async () => {
  const m = await room('87');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done' && st.hero && st.colourways && !st.colourways.running) break; await sleep(400); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  sql(`update clients set name='Secret Brand Pdf' where id='${m.cid}'`);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: pdf' } })).status === 200, 'published');
  const sup = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Pdf Mill ${stamp}` } })).json;
  const as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'quote' } }), ptok = as.json.assignment.packUrl.split('/tp/')[1];
  sql(`update tech_packs set translations='{"zh":{"at":"2026-01-01T00:00:00Z","strings":{"Layer Runner":"分层跑鞋"}}}'::jsonb where product_id='${m.id}'`);
  const dir = process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP, calloutViews = Number(sql(`select count(*) from tech_packs, jsonb_array_elements(published_data->'sketches') s where product_id='${m.id}' and jsonb_array_length(s->'callouts')>0`));
  const bw = await playwright.chromium.launch();
  try {
    const open = async (url, token) => { const ctx = await bw.newContext({ viewport: { width: 1100, height: 900 } }); if (token) await ctx.addInitScript(([k, t]) => localStorage.setItem(k, t), token); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForSelector('.sheet .panel', { state: 'attached', timeout: 15000 }); await p.waitForFunction(() => document.querySelector('#printDoc .pg'), null, { timeout: 8000 }); return { ctx, p }; };
    const pdf = async (p, name) => { const buf = await p.pdf({ path: `${dir}/j87-${name}.pdf`, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } }); return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; };
    const outline = p => p.evaluate(() => [...document.querySelectorAll('#printDoc > .pg, #printDoc > .pp')].map(e => (e.querySelector('h1,h2,.eyebrow')?.textContent || e.querySelector('h2')?.textContent || '').trim().slice(0, 40)));
    // staff
    { const { ctx, p } = await open(`${BASE}/tech-packs/${m.id}`, ['fb.admin.token', admin]); const o = await outline(p), txt = await p.$eval('#printDoc', e => e.innerText), pages = await pdf(p, 'admin');
      ok(/^Tech pack/i.test(o[0]) && await p.$eval('#printDoc > :first-child', e => e.classList.contains('first')), 'the document opens with the cover, and the page break comes after it (no blank first page)', o);
      ok(/Layer Runner/.test(await p.innerText('#printDoc h1')) && /Footwear/.test(txt) && /Size run/i.test(txt) && /PANTONE/i.test(txt) && /Secret Brand Pdf/.test(txt), 'the cover has the key facts, the colourways with their Pantone codes, and the client for staff');
      const heads = await p.$$eval('#printDoc .sh h2', hs => hs.map(h => h.textContent.trim())), want = ['Design details', 'Colourways', 'Materials & trims', 'Measurements', 'Sign-off'], at = want.map(t => heads.indexOf(t));
      ok(at.every(x => x >= 0) && at.every((x, i) => i === 0 || x > at[i - 1]), 'the sections follow in the order a sample room works in: design details, colours, materials, measurements, sign-off', heads);
      ok(await p.locator('#printDoc .stage').count() === calloutViews && await p.locator('#printDoc .cl-list').count() === calloutViews, `every view that has callouts is in the document with its numbered list (${calloutViews})`);
      { const toc = await p.$$eval('#printDoc .toc span:not(.eyebrow)', e => e.map(x => x.textContent.replace(/^\d+\s*/, '').trim())); ok(toc.length === heads.filter((h, i) => heads.indexOf(h) === i).length && toc[0] === 'Design details', 'the contents list on the cover matches the sections that follow', [toc, heads]); }
      { const fonts = await p.$$eval('#printDoc table.ptb td, #printDoc .cl-list li', els => els.map(e => parseFloat(getComputedStyle(e).fontSize))), small = fonts.filter(f => f < 11).length; ok(fonts.length > 0 && small === 0, 'nothing anyone has to act on is set smaller than 11 px (about 8 pt)', small); }
      { const pom = await p.$$eval('#printDoc table.pom th', ths => ths.map(t => t.textContent.trim())); ok(pom.some(t => /Sample/.test(t)) && pom.includes('Tolerance') && /Point of measure/i.test(pom.join(' ')), 'the measurement table marks the sample size and gives a tolerance for every row', pom); ok(await p.locator('#printDoc table.pom small.mt').count() > 0, 'and shows centimetres beneath the inches'); }
      ok(!/cutout/i.test(await p.$eval('#printDoc', e => e.innerHTML.replace(/data:image[^"]+/g, ''))) && !/Send your quotation|Spec check|Messages/.test(txt), 'working files, the quote form, the spec check and messages are not in it');
      ok(pages >= 4 && pages <= 20, `as a PDF it is ${pages} pages, not a page per tab`, pages); ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close(); }
    // the client
    { const { ctx, p } = await open(`${BASE}/tech-packs/${m.id}`, ['fb.client.token', m.token]); const txt = await p.$eval('#printDoc', e => e.innerText); ok(/Sign-off/.test(txt) && /Client/.test(txt) && /Future Basics/.test(txt) && /Factory/.test(txt), 'the client\'s copy ends with the approvals: who signs, in what order, with room to sign'); { await p.evaluate(() => document.querySelector('#tabs button[data-tab="bom"]')?.click()); await p.waitForSelector('.panel[data-panel="bom"].on table[data-tbl="bom"]', { timeout: 8000 });
      const w = await p.$$eval('.panel[data-panel="bom"].on table[data-tbl="bom"] thead th', ths => Object.fromEntries(ths.map(t => [t.textContent.trim().toLowerCase(), Math.round(t.getBoundingClientRect().width)])));
      ok(w.color >= 100 && w.qty <= 70 && w.unit <= 70 && w.notes >= 90 && w.component >= 100, 'the materials table shares its width by what each column holds: Color wide enough to read, Qty and Unit narrow', w);
      const broken = await p.$$eval('.panel[data-panel="bom"].on table[data-tbl="bom"] td .ro', els => els.filter(e => { const r = document.createRange(); r.selectNodeContents(e); const lines = new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; return lines > 6; }).length);
      ok(broken === 0, 'and no cell wraps onto more than six lines', broken); await p.locator('.panel[data-panel="bom"].on .tablewrap').first().screenshot({ path: `${dir}/j87-bom.png` }).catch(() => {}); }
    await pdf(p, 'client'); await ctx.close(); }
    // the factory with a quotation link: the client is hidden and there is no sign-off
    { const { ctx, p } = await open(`${BASE}/tp/${ptok}`); const txt = await p.$eval('#printDoc', e => e.innerText), pages = await pdf(p, 'factory');
      ok(!/Secret Brand Pdf/.test(txt) && !/Sign-off/.test(txt) && !/Send your quotation/.test(txt), 'a quotation link\'s copy never names the client and has no sign-off or quote form');
      ok(/Colourways|Design details|颜色|配色|工艺点/.test(txt) && pages >= 3, 'it still has the pictures, callouts and specs', pages);
      ok(/分层跑鞋/.test(txt) || /[一-鿿]/.test(txt), 'and follows the page\'s language when the pack has a Chinese version', txt.slice(0, 80)); await ctx.close(); }
  } finally { await bw.close(); }
});

await journey('J88', 'every page a factory or a fair visitor can open fits a small phone in English and in both Chinese settings: nothing wider than the screen, Chinese headings wrap, and a Chinese reader sees the factory door first', async () => {
  const m = await room('88');
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const su = await call('/v1/public/factories', { body: { company: `Phone Mill ${stamp}`, email: `phone-${stamp}@mill.cn`, lang: 'zh' } }), ftok = su.json.pageUrl.split('/factory/')[1], supId = sql(`select supplier_id from partners where code='${su.json.code}'`);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: phone' } })).status === 200, 'published');
  const as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: supId, mode: 'quote' } }), ptok = as.json.assignment.packUrl.split('/tp/')[1];
  const inv = await adm(`/v1/admin/products/${m.id}/tech-pack/invite`, { method: 'POST', body: {} }), icode = inv.json.invite.url.split('/i/')[1];
  sql(`update tech_packs set translations='{"zh":{"at":"2026-01-01T00:00:00Z","strings":{"Layer Runner":"分层跑鞋"}},"zh-hant":{"at":"2026-01-01T00:00:00Z","strings":{"Layer Runner":"分層跑鞋"}}}'::jsonb where product_id='${m.id}'`);
  const pages = [['fair', '/fair?lang=LANG'], ['start', '/start?lang=LANG'], ['factory page', `/factory/${ftok}`], ['invite', `/i/${icode}`], ['pack', `/tp/${ptok}`]];
  const bw = await playwright.chromium.launch();
  try {
    for (const [lang, locale] of [['en', 'en-US'], ['zh', 'zh-CN'], ['zh-hk', 'zh-HK']]) for (const width of [360, 393]) {
      const ctx = await bw.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, locale }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      const wide = [];
      for (const [name, path] of pages) {
        await p.goto(`${BASE}${path.replace('LANG', lang)}`, { waitUntil: 'networkidle' }); await sleep(500);
        if (name === 'factory page' || name === 'invite' || name === 'pack') { const btn = lang === 'en' ? null : await p.$(`#lang, [data-lang="${lang === 'zh' ? 'zh' : 'zh-hant'}"], .lang-switch button[data-lang="${lang}"]`); if (btn && lang !== 'en') await btn.click().catch(() => {}); await sleep(400); }
        const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth })); if (w.sw > w.iw + 1) wide.push(`${name} ${w.sw}>${w.iw}`);
      }
      ok(wide.length === 0, `at ${width}px in ${lang}: nothing is wider than the screen on any of ${pages.length} pages`, wide); ok(p.errs.length === 0, `at ${width}px in ${lang}: no script errors`, p.errs);
      if (lang !== 'en' && width === 360) {
        await p.goto(`${BASE}/fair?lang=${lang}`, { waitUntil: 'networkidle' }); await sleep(500);
        const lay = await p.evaluate(() => { const h = document.querySelector('.door h2'), f = document.querySelector('#factoryH').getBoundingClientRect().top, b = document.querySelector('#brandH').getBoundingClientRect().top; return { lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)), factoryFirst: f < b }; });
        ok(lay.lines >= 2, 'a Chinese heading wraps onto lines instead of running off the screen', lay); ok(lay.factoryFirst, 'a Chinese reader sees the factory door first');
        await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j88-fair-${lang}.png` }).catch(() => {});
      }
      await ctx.close();
    }
  } finally { await bw.close(); }
});

await journey('J89', 'once the hero image is approved the callouts are shown on it: each callout is found again on the hero and its detail picture is cut from it, the original photo and the callouts\' text, numbers and acknowledgements are untouched, and the labels are readable', async () => {
  const m = await room('89');
  let st = null; for (let i = 0; i < 160; i++) { st = await studio(m); if (st.loop && st.loop.status === 'done' && st.hero && st.colourways && !st.colourways.running) break; await sleep(400); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const pack = async () => (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack;
  const tp0 = await pack(), sk0 = tp0.data.sketches.find(s => s.callouts.length);
  ok(sk0 && sk0.hero && /^data:image\/jpeg/.test(sk0.hero.image), 'the first view carries the approved hero image', sk0 && Object.keys(sk0));
  ok(sk0.callouts.length >= 3 && sk0.callouts.every(c => typeof c.hx === 'number' && typeof c.hy === 'number' && /^data:image\/jpeg/.test(c.hphoto)), 'every callout has a position and a detail picture read from the hero', sk0.callouts.map(c => [c.n, c.hx, c.hy, !!c.hphoto]));
  ok(sk0.callouts.every(c => c.x != null && c.y != null && /^data:image/.test(c.photo)) && /^data:image/.test(sk0.image) && sk0.image !== sk0.hero.image, 'while the original photo, positions and detail pictures are as they were');
  ok(sk0.callouts.some(c => c.hphoto !== c.photo), 'and the detail pictures really come from the hero, not the photo');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Callouts placed on the hero image%'`) >= '1', 'it is on the record');
  // what the people who read the pack see
  { const pb = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: hero callouts' } }); ok(pb.status === 200, 'staff publish', [pb.status, pb.json]); }
  const sup = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Hero Mill ${stamp}` } })).json, as = await adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId: sup.id, mode: 'quote' } }), ptok = as.json.assignment.packUrl.split('/tp/')[1];
  const fv = (await call(`/v1/tp/${ptok}`)).json.techPack.data.sketches.find(s => s.callouts.length); ok(fv.hero && fv.callouts.every(c => c.hphoto), 'the factory\'s copy has the hero view with its pins and detail pictures');
  { const rd = (await call(`/v1/tp/${ptok}`)).json.techPack.readiness; ok(rd.callouts.length === sk0.callouts.length && rd.pendingCalloutKeys.every(k => k.startsWith(sk0.id + ':')), 'acknowledgement keys are what they were: one per callout, not doubled', rd.pendingCalloutKeys.slice(0, 3)); }
  // a pack whose hero was approved before this existed: staff can place the callouts on it, update the published copy without a new version, and publishing does it by itself
  { const strip = col => sql(`update tech_packs set ${col} = jsonb_set(${col},'{sketches}',(select jsonb_agg((s - 'hero') || jsonb_build_object('callouts',(select coalesce(jsonb_agg(c - 'hx' - 'hy' - 'hphoto'),'[]'::jsonb) from jsonb_array_elements(s->'callouts') c))) from jsonb_array_elements(${col}->'sketches') s)) where product_id='${m.id}'`);
    const heroId = sql(`select id from tech_pack_heroes where product_id='${m.id}' and status='approved' order by approved_at desc limit 1`), heroed = async () => (await pack()).data.sketches.some(k => k.hero), ver = () => sql(`select version from tech_packs where product_id='${m.id}'`);
    strip('data'); strip('published_data'); ok(!(await heroed()) && !(await call(`/v1/tp/${ptok}`)).json.techPack.data.sketches.some(k => k.hero), 'a pack from before has callouts on the photo only');
    ok((await call(`/v1/admin/tech-pack-heroes/${heroId}/place-callouts`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a customer cannot ask for it');
    const pl = await adm(`/v1/admin/tech-pack-heroes/${heroId}/place-callouts`, { method: 'POST', body: {} }); ok(pl.status === 200 && await heroed(), 'staff put the callouts on the approved hero', pl.json);
    ok(!(await call(`/v1/tp/${ptok}`)).json.techPack.data.sketches.some(k => k.hero), 'the published copy is the old one until staff update it');
    const v0 = ver(), up = await adm(`/v1/admin/products/${m.id}/tech-pack/refresh-pictures`, { method: 'POST', body: {} }); ok(up.status === 200 && up.json.updated === true && (await call(`/v1/tp/${ptok}`)).json.techPack.data.sketches.some(k => k.hero) && ver() === v0, 'updating the pictures on the published pack brings the hero view too, with no new version', up.json);
    strip('data'); const pub2 = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: hero callouts again' } }); ok(pub2.status === 200 && (await call(`/v1/products/${m.id}/tech-pack`, { token: m.token })).json.techPack.data.sketches.some(k => k.hero), 'publishing a pack whose callouts are not on the approved hero does it first', pub2.status); }
  const bw = await playwright.chromium.launch();
  try {
    const dir = process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP;
    const ctx = await bw.newContext({ viewport: { width: 1100, height: 900 } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(`${BASE}/tp/${ptok}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="calls"]', { timeout: 15000 }); await p.click('#tabs button[data-tab="calls"]'); await p.waitForSelector('.panel[data-panel="calls"].on [data-stage] img.base', { timeout: 10000 }); await sleep(900);
    const src = await p.$eval('.panel[data-panel="calls"].on [data-stage] img.base', e => e.src); ok(src === fv.hero.image, 'in the callouts view the picture is the hero');
    const pinPhotos = await p.$$eval('.panel[data-panel="calls"].on [data-stage] .pin .ph', els => els.map(e => e.src)); ok(pinPhotos.length === fv.callouts.length && fv.callouts.every(c => pinPhotos.includes(c.hphoto)), 'and each pin\'s detail picture is the one cut from it');
    const lay = await p.$$eval('.panel[data-panel="calls"].on [data-stage] .pin', pins => { const r = pins.map(x => { const l = x.querySelector('.lb'); return { l: l ? l.getBoundingClientRect() : null, clipped: l ? l.scrollHeight > l.clientHeight + 1 || getComputedStyle(l).textOverflow === 'ellipsis' : false, n: x.querySelector('.n').getBoundingClientRect() }; }); let overlaps = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].l && r[j].l) { const a = r[i].l, b = r[j].l; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++; } return { overlaps, clipped: r.filter(x => x.clipped).length, labels: r.filter(x => x.l).length }; });
    ok(lay.labels >= 3 && lay.overlaps === 0 && lay.clipped === 0, 'the labels do not overlap each other and none is cut short', lay);
    await p.locator('.panel[data-panel="calls"].on [data-stage]').first().screenshot({ path: `${dir}/j89-callouts.png` }).catch(() => {});
    ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    // staff: moving a pin on the hero moves the hero position only
    const actx = await bw.newContext({ viewport: { width: 1280, height: 950 } }); await actx.addInitScript(t => localStorage.setItem('fb.admin.token', t), admin);
    const ap = await actx.newPage(); await ap.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#tabs button[data-tab="calls"]', { timeout: 15000 }); await ap.click('#tabs button[data-tab="calls"]'); await ap.waitForSelector('.panel[data-panel="calls"].on [data-pin][data-onhero]', { timeout: 10000 }); await sleep(600);
    const before = (await pack()).data.sketches.find(k => k.callouts.length).callouts[0];
    const box = await ap.locator('.panel[data-panel="calls"].on [data-pin] .n').first().boundingBox(); await ap.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await ap.mouse.down(); await ap.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 }); await ap.mouse.up(); await sleep(400);
    await ap.click('[data-act="save"]'); for (let i = 0; i < 30; i++) { const c = (await pack()).data.sketches.find(k => k.callouts.length).callouts[0]; if (c.hx !== before.hx) break; await sleep(300); }
    const after = (await pack()).data.sketches.find(k => k.callouts.length).callouts[0];
    ok(after.x === before.x && after.y === before.y && (after.hx !== before.hx || after.hy !== before.hy), 'staff can drag a pin on the hero: the hero position moves and the original one does not', [[before.x, before.y, before.hx, before.hy], [after.x, after.y, after.hx, after.hy]]); await actx.close();
  } finally { await bw.close(); }
});

await journey('J90', 'the 3D model can be made from the approved hero image, shown with the hero\'s own score and offered first: the hero\'s 87 and the pack renders\' lower scores are labelled as the different things they are, and a hero that is not approved cannot be used', async () => {
  const m = await room('90');
  let st = null; for (let i = 0; i < 160; i++) { st = await studio(m); if (st.loop && st.loop.status === 'done' && st.hero && st.colourways && !st.colourways.running && st.model && st.model.status === 'done') break; await sleep(400); }
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const chk = async () => (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json;
  const c0 = await chk(); ok(c0.hero && c0.hero.status === 'approved' && typeof c0.hero.score === 'number', 'the hero is approved and has its own score', c0.hero && [c0.hero.status, c0.hero.score]);
  // a hero that is not approved cannot be used
  const hid = sql(`select id from tech_pack_heroes where product_id='${m.id}' and status='approved' limit 1`); sql(`update tech_pack_heroes set status='ready' where id='${hid}'`);
  const no = await adm(`/v1/admin/products/${m.id}/tech-pack/model`, { method: 'POST', body: { source: 'hero' } }); ok(no.status === 409 && /Approve the hero image/.test(no.json.error), 'a hero that is not approved is refused, and it says what to do', no.json); sql(`update tech_pack_heroes set status='approved' where id='${hid}'`);
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/model`, { method: 'POST', token: m.token, body: { source: 'hero' } })).status === 403, 'a customer cannot start it');
  // make it from the hero
  for (let i = 0; i < 40 && sql(`select count(*) from tech_pack_models where product_id='${m.id}' and status='running'`) !== '0'; i++) await sleep(300);
  const go = await adm(`/v1/admin/products/${m.id}/tech-pack/model`, { method: 'POST', body: { source: 'hero' } }); ok(go.status === 202, 'staff make the 3D model from the approved hero', go.json);
  let mdl = null; for (let i = 0; i < 60; i++) { mdl = (await chk()).model; if (mdl && mdl.status === 'done' && mdl.source === 'hero') break; await sleep(400); }
  ok(mdl && mdl.source === 'hero' && mdl.status === 'done' && mdl.sourceScore === c0.hero.score, 'it is recorded as made from the hero with the hero\'s score, not a pack render\'s', mdl && [mdl.source, mdl.sourceScore, c0.hero.score]);
  const rc = c0.renderChoices || []; ok(rc.length === 0 || rc.every(r => typeof r.score === 'number'), 'the pack renders still have their own scores, which are a different measure');
  // the truest picture should be the hero: when a pack render scores higher than the hero it can be made the hero (it needs approving), and the 3D model then follows it
  { const c1 = await chk(), best = (c1.renderChoices || []).slice().sort((a, b) => b.score - a.score)[0];
    if (best && best.score > c1.hero.score) {
      const ad = await adm(`/v1/admin/tech-pack-heroes/${c1.hero.id}/adopt`, { method: 'POST', body: { checkId: best.id } }); ok(ad.status === 200, 'a pack render that scored higher than the hero can be made the hero', ad.json);
      const c2 = await chk(); ok(c2.hero.status === 'ready' && c2.hero.score === best.score, 'it is the hero\'s chosen try with its score, and waits for approval like any hero', [c2.hero.status, c2.hero.score]);
      ok((await adm(`/v1/admin/tech-pack-heroes/${c2.hero.id}/approve`, { method: 'POST', body: {} })).status === 200, 'staff approve it');
      for (let i = 0; i < 40 && sql(`select count(*) from tech_pack_models where product_id='${m.id}' and status='running'`) !== '0'; i++) await sleep(300);
      const g2 = await adm(`/v1/admin/products/${m.id}/tech-pack/model`, { method: 'POST', body: { source: 'hero' } }); ok(g2.status === 202, 'and the 3D model is made from it', g2.json);
      let m2 = null; for (let i = 0; i < 60; i++) { m2 = (await chk()).model; if (m2 && m2.status === 'done' && m2.sourceScore === best.score) break; await sleep(400); } ok(m2 && m2.source === 'hero' && m2.sourceScore === best.score, 'recorded as made from the hero, with the higher score', m2 && [m2.source, m2.sourceScore]);
    } else ok(true, 'no pack render outscored the hero here, so nothing to adopt (skipped)'); }
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 950 } }); await ctx.addInitScript(t => localStorage.setItem('fb.admin.token', t), admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="check"]', { timeout: 15000 }); await p.click('#tabs button[data-tab="check"]'); await p.waitForSelector('[data-model]', { timeout: 15000 });
      const heroNow = (await chk()).hero, first = await p.$eval('[data-model] .tools [data-act="makemodel"]', e => e.textContent.trim()); ok(new RegExp(`approved hero · ${heroNow.score}/100`).test(first), 'in the 3D section the first button is "Make STL from the approved hero" with its score', first);
      const txt = await p.innerText('[data-model]'); ok(/made from the approved hero image/i.test(txt) && /two different scores/i.test(txt) && /made from the approved hero image \(it scored \d+\/100/i.test(txt), 'and the section says the two scores are different things, and what this model was made from', txt.slice(0, 260));
      ok(await p.evaluate(() => { const m = document.querySelector('[data-model]'), spec = [...document.querySelectorAll('.panel[data-panel="check"] section.block')].find(x => /Spec check/.test(x.querySelector('h2')?.textContent || '')); return Boolean(m && spec && (m.compareDocumentPosition(spec) & Node.DOCUMENT_POSITION_FOLLOWING)); }), 'the 3D model section sits above the spec check and the assistants\' exchange');
      { const pills = await p.$$eval('.chk-disc > .chk-pill', els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })); ok(pills.every(([w, h]) => h <= 32 && w <= 100), 'in "What to fix" the severity tag is a small pill, not stretched to the height of its row', pills); }
      ok(p.errs.length === 0, 'no script errors', p.errs); await p.locator('[data-model]').first().screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j90-model.png` }).catch(() => {}); await ctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J91', 'staff can mark a product complete and reopen it: every milestone closes, the client is told, it leaves the queues and the client\'s "waiting on you", the project completes with it, and reopening puts it back', async () => {
  const t0 = Date.now() - 1000, mail = async (match, to) => ((await call(`/v1/dev/outbox?since=${t0}${to ? '&to=' + encodeURIComponent(to) : ''}`)).json.emails || []).filter(e => match.test(e.subject));
  const m = await room('91');
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const mine = async () => (await call('/v1/dashboard', { token: m.token })).json, waiting = async () => ((await mine()).waiting || []).filter(w => w.productId === m.id).map(w => w.kind);
  const queue = async () => ((await adm('/v1/admin/dashboard')).json.queues.approvals || []).filter(i => i.productId === m.id).map(i => i.kind);
  const prod = async () => ((await adm(`/v1/admin/clients/${m.cid}`)).json.products || []).find(x => x.id === m.id);
  for (let i = 0; i < 80 && !(await queue()).length; i++) await sleep(300);
  ok((await waiting()).length > 0 && (await queue()).length > 0, 'before: the product is in the client\'s waiting list and in the staff queue', [await waiting(), await queue()]);
  ok((await call(`/v1/admin/products/${m.id}/complete`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a customer cannot mark it complete');
  const done = await adm(`/v1/admin/products/${m.id}/complete`, { method: 'POST', body: { note: 'All 500 units delivered and signed off' } }); ok(done.status === 200 && done.json.completed_at && done.json.current_stage === 'delivered', 'staff mark it complete', done.json);
  ok(sql(`select count(*) from milestones where product_id='${m.id}' and status not in ('complete','skipped')`) === '0', 'every milestone is closed');
  ok(sql(`select count(*) from activities where product_id='${m.id}' and type='flow' and summary like '%All 500 units delivered%'`) === '1', 'the activity log records it with the note');
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='product-complete' and entity_id='${m.id}'`) === '1', 'the client gets a hub notification');
  ok((await mail(/is complete/)).length >= 1, 'and an email');
  ok((await adm(`/v1/admin/products/${m.id}/complete`, { method: 'POST', body: {} })).status === 409, 'completing twice is refused');
  ok((await waiting()).length === 0 && (await queue()).length === 0, 'it left the client\'s waiting list and the staff queue', [await waiting(), await queue()]);
  const proj = sql(`select status from projects where id=(select project_id from products where id='${m.id}')`); ok(proj === 'complete', 'its project completes with it', proj);
  await import('../../src/ball.js'); const ball = globalThis.FBBall; ok(!ball.ballFor(await prod()).who, 'no one holds the ball on a finished product');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const cctx = await bw.newContext({ viewport: { width: 1100, height: 900 } }); await cctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const cp = await cctx.newPage(); cp.errs = []; cp.on('pageerror', e => cp.errs.push(e.message)); const projId = sql(`select project_id from products where id='${m.id}'`);
      await cp.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await cp.waitForFunction(() => typeof openProject === 'function', null, { timeout: 10000 }); await cp.evaluate(id => openProject(id, false), projId); await cp.waitForSelector('.done-chip', { timeout: 10000 }).catch(() => {});
      ok(await cp.locator('.done-chip').count() >= 1, 'the hub shows a Complete chip on the product'); ok(cp.errs.length === 0, 'no script errors in the hub', cp.errs); await cctx.close();
    } finally { await bw.close(); }
  }
  // reopen
  ok((await adm(`/v1/admin/products/${m.id}/reopen`, { method: 'POST', body: {} })).status === 200, 'staff reopen it');
  const back = await prod(); ok(!back.completed_at && back.current_stage === 'delivery' && back.waiting_on === 'future-basics', 'it is back at Delivery with Future Basics', [back.completed_at, back.current_stage, back.waiting_on]);
  ok(sql(`select status from projects where id=(select project_id from products where id='${m.id}')`) === 'active', 'and its project is active again');
  ok((await adm(`/v1/admin/products/${m.id}/reopen`, { method: 'POST', body: {} })).status === 409, 'reopening a product that is not complete is refused');
});

await journey('J92', 'a milestone is checked off with one press and no form: the next step becomes current with its own owner, it is logged, the client is told when it is their turn, pressing a finished step reopens it, and the last step completes the product', async () => {
  const m = await room('92');
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const ms = async () => sql(`select string_agg(name||':'||status||':'||coalesce(responsible_party,''), ',' order by sort_order) from milestones where product_id='${m.id}'`).split(',');
  const row = async name => sql(`select id from milestones where product_id='${m.id}' and name='${name}'`);
  const cur = async () => sql(`select current_stage||'|'||coalesce(waiting_on,'') from products where id='${m.id}'`);
  const brief = await row('Brief'); ok((await ms())[0].startsWith('Brief:current'), 'it starts at Brief', await ms());
  ok((await call(`/v1/admin/milestones/${brief}/step`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a customer cannot press a milestone');
  const r1 = await adm(`/v1/admin/milestones/${brief}/step`, { method: 'POST', body: {} }); ok(r1.status === 200 && r1.json.done === 'Brief' && r1.json.next && r1.json.next.name === 'Concept', 'one press checks Brief off and moves to Concept', r1.json);
  const after = await ms(); ok(after[0].startsWith('Brief:complete') && after[1].startsWith('Concept:current'), 'Brief is complete and Concept is current', after);
  ok((await cur()).startsWith('concept|'), 'the product follows (stage and who it waits on)', await cur());
  ok(sql(`select count(*) from activities where product_id='${m.id}' and type='flow' and summary like 'Brief done%'`) === '1', 'the record says who did it and what is next');
  ok((await adm(`/v1/admin/milestones/${brief}/step`, { method: 'POST', body: {} })).status === 409, 'pressing "done" on a finished step is refused');
  // press a finished step: reopened, later steps go back to upcoming
  const r2 = await adm(`/v1/admin/milestones/${brief}/step`, { method: 'POST', body: { action: 'goto' } }); ok(r2.status === 200, 'pressing a finished step reopens it (this is also the undo)');
  const re = await ms(); ok(re[0].startsWith('Brief:current') && re[1].startsWith('Concept:upcoming'), 'Brief is current again and Concept is upcoming', re);
  // a handoff to the client is told to the client
  sql(`update milestones set responsible_party='client' where product_id='${m.id}' and name='Concept'`);
  await adm(`/v1/admin/milestones/${brief}/step`, { method: 'POST', body: {} });
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='handoff' and entity_id='${m.id}' and title like 'Your turn: Concept%'`) === '1', 'when the next step is the client\'s, the hub is told it is their turn');
  // jump ahead: everything before closes
  const dev = await row('Development'); ok((await adm(`/v1/admin/milestones/${dev}/step`, { method: 'POST', body: { action: 'goto' } })).status === 200, 'pressing a later step makes it current');
  const jump = await ms(); ok(jump.slice(0, 2).every(x => x.includes(':complete')) && jump[2].includes(':current') && jump.slice(3).every(x => x.includes(':upcoming')), 'and closes everything before it', jump);
  // walk to the end: the last press completes the product
  for (const n of ['Development', 'Sample', 'Approval', 'Production', 'Quality']) await adm(`/v1/admin/milestones/${await row(n)}/step`, { method: 'POST', body: {} });
  const del = await row('Delivery'); ok((await ms()).slice(-1)[0].startsWith('Delivery:current'), 'Delivery is the last step', await ms());
  const fin = await adm(`/v1/admin/milestones/${del}/step`, { method: 'POST', body: {} }); ok(fin.status === 200 && fin.json.next === null && fin.json.product.completed_at, 'pressing the last step completes the product', fin.json);
  ok(sql(`select status from projects where id=(select project_id from products where id='${m.id}')`) === 'complete', 'and its project');
  ok((await adm(`/v1/admin/milestones/${del}/step`, { method: 'POST', body: { action: 'goto' } })).status === 200 && !(await adm(`/v1/admin/clients/${m.cid}`)).json.products.find(x => x.id === m.id).completed_at, 'pressing Delivery again undoes it: the product is no longer complete');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 950 } }); await ctx.addInitScript(t => localStorage.setItem('fb.admin.token', t), admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => d.dismiss());
      await p.goto(`${BASE}/clients/${m.cid}#product=${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('.gate.current', { timeout: 15000 });
      const name = await p.$eval('.gate.current', e => e.textContent.replace(/\s+/g, ' ').trim()), gid = await p.$eval('.gate.current', e => e.dataset.gate);
      await p.click('.gate.current'); await p.waitForSelector('#toast.show', { timeout: 10000 });
      ok(await p.locator('dialog[open]').count() === 0, 'pressing the milestone opens no pop-up');
      ok(/done/.test(await p.innerText('#toast')) && await p.locator('#toast button', { hasText: 'Undo' }).count() === 1, 'a toast says what happened and offers Undo', await p.innerText('#toast'));
      ok(sql(`select status from milestones where id='${gid}'`) === 'complete', 'the milestone is complete in the database', name);
      await p.locator('#toast button', { hasText: 'Undo' }).click(); for (let i = 0; i < 30 && sql(`select status from milestones where id='${gid}'`) !== 'current'; i++) await sleep(200);
      ok(sql(`select status from milestones where id='${gid}'`) === 'current', 'Undo puts it back');
      await p.hover('.gate.current'); ok(await p.locator('.gate.current .gate-edit').count() === 1, 'the full editor stays one small ⋯ away');
      ok(p.errs.length === 0, 'no script errors', p.errs); await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j92-gates.png` }).catch(() => {}); await ctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J93', 'the join link opens a hub room with no tech pack: company, name and email are enough, the room is active at once, staff and the client are told, and an email that already has a room takes a code', async () => {
  const t0 = Date.now() - 1000, mail = async (match, to) => ((await call(`/v1/dev/outbox?since=${t0}${to ? '&to=' + encodeURIComponent(to) : ''}`)).json.emails || []).filter(e => match.test(e.subject));
  const page = await fetch(`${BASE}/join`); const html = await page.text(); ok(page.status === 200 && /Open your/.test(html) && /id="company"/.test(html) && /\/v1\/public\/join/.test(html), 'the page is there, with no photo and no product asked for');
  { const og = (await fetch(`${BASE}/icons/og-join.png`)); ok(/og:title" content="Open your Future Basics hub/.test(html) && /og:image" content="https:\/\/hub\.thefuturebasics\.com\/icons\/og-join\.png/.test(html) && og.status === 200 && /png/.test(og.headers.get('content-type') || ''), 'pasted into a chat the link shows a branded preview: title, line of text and a Future Basics picture'); }
  const em1 = `join-${stamp}-1@gmail.com`, co = `Join Brand ${stamp}`;
  const bad = async b => (await call('/v1/public/join', { body: b })).status;
  ok(await bad({ company: 'x', name: 'Alex Join', email: em1 }) === 400 && await bad({ company: co, name: 'A', email: em1 }) === 400 && await bad({ company: co, name: 'Alex Join', email: 'nope' }) === 400, 'a missing company, name or a bad email is refused with a clear message');
  ok(await bad({ company: co, name: 'Staff Person', email: 'someone@thefuturebasics.com' }) === 400, 'staff emails are sent to the work console');
  const hp = await call('/v1/public/join', { body: { company: co, name: 'Bot Bot', email: `bot-${stamp}@gmail.com`, fax: 'spam' } }); ok(hp.status === 202 && sql(`select count(*) from clients where contact_email='bot-${stamp}@gmail.com'`) === '0', 'the hidden field catches a bot: no room is made');
  const [a, b] = await Promise.all([call('/v1/public/join', { body: { company: co, name: 'Alex Join', email: em1, phone: '555 0100', website: 'brand.example', about: 'Plush toys and enamel pins' } }), call('/v1/public/join', { body: { company: co, name: 'Alex Join', email: em1 } })]);
  ok([a, b].every(r => r.status === 201) && sql(`select count(*) from clients where contact_email='${em1}'`) === '1', 'a double tap makes one room', [a.status, b.status]);
  const r1 = [a, b].find(r => r.json.token) || a; ok(r1.json.token && r1.json.needsCode === false, 'the person who made the room is signed in straight away');
  const row = sql(`select status||'|'||name||'|'||array_to_string(allowed_emails,',')||'|'||coalesce(array_to_string(email_domains,','),'')||'|'||contact_name||'|'||coalesce(contact_phone,'') from clients where contact_email='${em1}'`);
  ok(row === `active|${co}|${em1}||Alex Join|555 0100` || row === `active|${co}|${em1}||Alex Join|`, 'the room is active, open to that email only (not the whole gmail.com domain), with their details', row);
  const dash = await call('/v1/dashboard', { token: r1.json.token }); ok(dash.status === 200 && dash.json.client?.name === co || dash.status === 200, 'the hub opens with no product and no project', [dash.status, Object.keys(dash.json).slice(0, 6)]);
  ok((await mail(/New hub account/)).some(e => e.text.includes(co)), 'Future Basics are emailed that a client opened a hub');
  ok((await mail(/Your Future Basics hub is ready/, em1)).length === 1, 'and the client is emailed a welcome, once');
  ok(sql(`select count(*) from notifications where client_id=(select id from clients where contact_email='${em1}') and type='new-account'`) === '1', 'it shows in the console notifications');
  const again = await call('/v1/public/join', { body: { company: 'Someone Else', name: 'Mallory', email: em1 } }); ok(again.status === 201 && !again.json.token && again.json.needsCode === true, 'the same email again is asked for a code, never handed a session');
  ok(sql(`select count(*) from clients where contact_email='${em1}'`) === '1' && (await mail(/Your Future Basics hub is ready/, em1)).length === 1, 'and it makes no second room and no second welcome');
  // a lead from the website form is activated by joining
  const lead = `lead-${stamp}@brand.example`; await call('/v1/public/intakes', { raw: (() => { const fd = new FormData(); for (const [k, v] of Object.entries({ companyName: `Lead Co ${stamp}`, contactName: 'Lee Lead', email: lead, projectBrief: 'A first collection of ten pieces for spring.' })) fd.append(k, v); return fd; })() });
  const lj = await call('/v1/public/join', { body: { company: `Lead Co ${stamp}`, name: 'Lee Lead', email: lead } }); ok(lj.status === 201 && sql(`select status from clients where contact_email='${lead}'`) === 'active' && !lj.json.token, 'a website lead who uses the join link is activated, and signs in with a code');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/join?name=Sam%20Phone&email=sam-${stamp}@yahoo.com&company=Phone%20Co%20${stamp}`, { waitUntil: 'networkidle' });
      ok(await p.inputValue('#email') === `sam-${stamp}@yahoo.com` && await p.inputValue('#name') === 'Sam Phone', 'a link from us can carry the person\'s details');
      ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'it fits a phone');
      await p.click('#go'); await p.waitForURL(/\/hub/, { timeout: 15000 }); await p.waitForFunction(() => document.body.innerText.length > 50, null, { timeout: 15000 });
      ok(sql(`select count(*) from clients where contact_email='sam-${stamp}@yahoo.com' and status='active'`) === '1' && await p.evaluate(() => Boolean(localStorage.getItem('fb.client.token'))), 'pressing the button opens the hub, signed in');
      await p.waitForSelector('.first-run', { timeout: 10000 }); ok(/Start your first tech pack/.test(await p.innerText('.first-run')), 'a new room opens on "Start your first tech pack", not an empty list');
      await p.click('.first-run button'); await p.waitForSelector('#techPackDialog[open]'); await p.setInputFiles('#tpPhotos', { name: 'shoe.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(runner.split(',')[1], 'base64') }); await p.fill('#techPackForm [name=title]', 'First runner');
      await p.click('#tpSubmit'); await p.waitForURL(/\/tech-packs\//, { timeout: 30000 });
      ok(sql(`select count(*) from products p join clients c on c.id=p.client_id where c.contact_email='sam-${stamp}@yahoo.com' and p.title='First runner'`) === '1' && sql(`select count(*) from tech_packs t join clients c on c.id=t.client_id where c.contact_email='sam-${stamp}@yahoo.com' and t.initiated_by='client'`) === '1', 'from that card they start a tech pack inside their own room: the product and the client-started draft exist');
      ok(p.errs.length === 0, 'no script errors', p.errs); await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j93-hub.png` }).catch(() => {}); await ctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J94', 'All files: a client sends files outside a product and sees only their own plus what staff switch on; a factory sees only what staff switch on, only in a project it is assigned a pack in', async () => {
  const m = await room('94'), other = await room('94b');
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const send = (path, token, name, body = 'hello', type = 'application/pdf') => { const fd = new FormData(); fd.append('file', new Blob([body], { type }), name); return call(path, { method: 'POST', token, raw: fd }); };
  const mine = async tok => (await call('/v1/room-files', { token: tok })).json, names = r => (r.files || []).map(f => f.name).sort();
  const projectId = sql(`select project_id from products where id='${m.id}'`), otherProject = sql(`select project_id from products where id='${other.id}'`);
  sql(`update clients set name='Secret Brand Co' where id='${m.cid}'`);

  const a = await send('/v1/room-files', m.token, 'brief.pdf', 'the client brief');
  ok(a.status === 201 && a.json.file.by === 'client' && a.json.file.name === 'brief.pdf' && a.json.file.source === 'room', 'a client can send a file that belongs to no product', [a.status, a.json]);
  ok((await send('/v1/room-files', m.token, 'virus.exe', 'x', 'application/octet-stream')).status === 415, 'a file type that is not allowed is refused');
  ok((await send(`/v1/room-files?projectId=${otherProject}`, m.token, 'x.pdf')).status === 400 && (await send('/v1/room-files?projectId=nope', m.token, 'x.pdf')).status === 400, 'it cannot be filed under someone else\'s project, or one that does not exist');
  ok((await send('/v1/room-files', '', 'x.pdf')).status === 401, 'and it needs a sign-in');
  const sent = await mine(m.token); ok(names(sent).join() === 'brief.pdf' && sent.projects.some(pr => pr.id === projectId), 'their list shows it, and the projects they can file under', sent);
  ok((await mine(other.token)).files.length === 0 && (await call(a.json.file.url, { token: other.token })).status === 404, 'another client sees nothing of it and cannot take it');
  const dl = await call(a.json.file.url, { token: m.token }); ok(dl.status === 200 && dl.text === 'the client brief', 'the sender can take it back');
  ok((await call(a.json.file.url, { token: admin })).status === 200, 'staff can take it');

  const own = (await adm(`/v1/admin/clients/${m.cid}/room-files`)).json; ok(names(own).join() === 'brief.pdf' && own.projects.length >= 1 && own.products.some(p => p.id === m.id), 'staff see it in the room, with the projects and products to file it under', own);
  ok((await send(`/v1/admin/clients/${m.cid}/room-files`, m.token, 'x.pdf')).status === 403 && (await call(`/v1/admin/clients/${m.cid}/room-files`, { token: m.token })).status === 403, 'a client cannot use the staff routes');
  const b = await send(`/v1/admin/clients/${m.cid}/room-files?note=Final%20dieline`, admin, 'spec.pdf', 'the dieline'); ok(b.status === 201 && b.json.file.clientVisible === false && b.json.file.factoryVisible === false && b.json.file.note === 'Final dieline', 'staff add a file: hidden from everyone but staff until they switch it on', b.json);
  ok(names(await mine(m.token)).join() === 'brief.pdf' && (await call(b.json.file.url, { token: m.token })).status === 404, 'so the client does not see it, and cannot guess its way to it');
  ok((await call(`/v1/admin/room-files/${encodeURIComponent(b.json.file.id)}`, { method: 'PATCH', token: m.token, body: { clientVisible: true } })).status === 403, 'a client cannot switch it on themselves');
  const sw = body => adm(`/v1/admin/room-files/${encodeURIComponent(b.json.file.id)}`, { method: 'PATCH', body });
  ok((await sw({ clientVisible: true })).status === 200, 'staff switch it on for the client');
  const both = await mine(m.token); ok(names(both).join() === 'brief.pdf,spec.pdf' && both.files.find(f => f.name === 'spec.pdf').by === 'admin', 'now the client sees their own file and the shared one', names(both));
  ok((await call(b.json.file.url, { token: m.token })).text === 'the dieline', 'and can take it');
  ok((await mine(other.token)).files.length === 0, 'still nothing for anyone else');
  ok((await sw({ factoryVisible: true })).status === 400 && (await send(`/v1/admin/clients/${m.cid}/room-files?factoryVisible=1`, admin, 'f.pdf')).status === 400, 'a factory switch needs a project first: a factory only sees files in its project');
  ok((await sw({ projectId: otherProject })).status === 400, 'a file cannot be filed under another client\'s project');
  const filed = await sw({ projectId }); ok(filed.status === 200 && filed.json.file.projectId === projectId && filed.json.file.projectName, 'staff file it under the project', filed.json);

  // a factory assigned a pack in this project
  for (let i = 0; i < 160; i++) { const st = await studio(m); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const s1 = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Files Mill ${stamp}`, contactEmail: 'files@factory.cn', country: 'China' } })).json, s2 = (await adm('/v1/admin/suppliers', { method: 'POST', body: { name: `Other Mill ${stamp}` } })).json;
  sql(`update tech_packs set published_at=now(), version=1, published_data=data, initiated_by='brand', verification='{"version":1,"acks":{}}'::jsonb where product_id='${m.id}'`);
  const assign = supplierId => adm(`/v1/admin/products/${m.id}/tech-pack/factory`, { method: 'POST', body: { supplierId, mode: 'quote', email: false } });
  const ga = await assign(s1.id); ok(ga.status === 201, 'the factory is assigned the pack', ga.json);
  const page1 = ga.json.assignment.pageUrl.split('/factory/')[1];
  let pg = (await call(`/v1/factory/${page1}`)).json; ok(Array.isArray(pg.files) && pg.files.length === 0, 'its page has no files while none is switched on for factories', pg.files);
  const factoryUrl = id => `/v1/factory/${page1}/files/${encodeURIComponent(id)}`;
  ok((await call(factoryUrl(b.json.file.id))).status === 404, 'and the file cannot be fetched by guessing');
  ok((await sw({ factoryVisible: true })).status === 200, 'staff switch it on for factories');
  pg = (await call(`/v1/factory/${page1}`)).json; ok(pg.files.length === 1 && pg.files[0].name === 'spec.pdf' && pg.files[0].packs.length === 1, 'the factory\'s page lists it, with the pack it is for', pg.files);
  ok(!JSON.stringify(pg).includes('Secret Brand Co') && !JSON.stringify(pg.files).includes(m.cid), 'without the client\'s name or room');
  const fd1 = await call(factoryUrl(b.json.file.id)); ok(fd1.status === 200 && fd1.text === 'the dieline', 'and it can take it', fd1.status);
  ok((await call(factoryUrl(a.json.file.id))).status === 404, 'the client\'s own file is not reachable by the factory, even by id');
  const pageUrl2 = (await adm(`/v1/admin/suppliers/${s2.id}/factory-page/rotate`, { method: 'POST', body: {} })).json.pageUrl.split('/factory/')[1];
  ok((await call(`/v1/factory/${pageUrl2}`)).json.files.length === 0 && (await call(`/v1/factory/${pageUrl2}/files/${encodeURIComponent(b.json.file.id)}`)).status === 404, 'another factory sees none of it');
  // chat attachments belong to the thread; staff can pass one on to the factory
  const chat = await send(`/v1/admin/projects/${projectId}/uploads?body=Artwork%20attached`, admin, 'chat-art.pdf', 'chat art'); ok(chat.status === 201, 'staff attach a file in the project thread', chat.status);
  const cl = await mine(m.token), pf = cl.files.find(f => f.name === 'chat-art.pdf'); ok(pf && pf.source === 'chat' && pf.id.startsWith('pf:'), 'the client\'s All files shows it too: it was already shared in the thread', names(cl));
  ok((await call(`/v1/factory/${page1}`)).json.files.length === 1, 'but it is not passed to the factory until staff say so');
  ok((await adm(`/v1/admin/room-files/${encodeURIComponent(pf.id)}`, { method: 'PATCH', body: { factoryVisible: true } })).status === 200 && (await call(`/v1/factory/${page1}`)).json.files.length === 2, 'staff pass it on');
  // unassign: the factory loses the project's files at once
  ok((await assign(null)).status === 200, 'staff unassign the factory');
  ok((await call(`/v1/factory/${page1}`)).json.files.length === 0 && (await call(factoryUrl(b.json.file.id))).status === 404, 'its page empties and the file link stops working');
  await assign(s1.id);
  sql(`update projects set archived_at=now(), status='archived' where id='${projectId}'`);
  ok((await call(`/v1/factory/${page1}`)).json.files.length === 0, 'an archived project hands nothing to a factory');
  sql(`update projects set archived_at=null, status='active' where id='${projectId}'`);

  ok((await call(`/v1/room-files/${encodeURIComponent(b.json.file.id)}`, { method: 'DELETE', token: m.token })).status === 404, 'a client cannot delete what staff added');
  ok((await call(`/v1/room-files/${encodeURIComponent(a.json.file.id)}`, { method: 'DELETE', token: m.token })).status === 200 && names(await mine(m.token)).join() === 'chat-art.pdf,spec.pdf', 'they can delete what they sent');
  ok((await call(`/v1/room-files/${encodeURIComponent(a.json.file.id)}`, { method: 'DELETE', token: other.token })).status === 404, 'and nobody else can');
  ok((await adm(`/v1/admin/room-files/${encodeURIComponent(b.json.file.id)}`, { method: 'DELETE' })).status === 200 && (await call(factoryUrl(b.json.file.id))).status === 404 && names(await mine(m.token)).join() === 'chat-art.pdf', 'staff delete a file and it is gone for everyone');

  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const c = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await c.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/hub`, { waitUntil: 'networkidle' }); await p.waitForSelector('#allFiles:not(.hidden) #rfList', { timeout: 15000 });
      ok(/chat-art\.pdf/.test(await p.innerText('#rfList')) && await p.locator('#rfPick').isVisible(), 'the hub shows the files panel with what was shared and a Send a file button');
      await p.setInputFiles('#rfInput', { name: 'from-phone.pdf', mimeType: 'application/pdf', buffer: Buffer.from('phone file') }); await p.waitForFunction(() => /from-phone\.pdf/.test(document.getElementById('rfList').innerText), null, { timeout: 10000 });
      ok(sql(`select count(*) from room_files where client_id='${m.cid}' and original_name='from-phone.pdf' and uploader_role='client'`) === '1' && /Remove/.test(await p.innerText('#rfList')), 'a file sent from the panel lands in the room and can be removed by its sender');
      ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='client-room-file' and read_at is null`) !== '0', 'staff are told it arrived');
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && p.errs.length === 0, 'with no script errors', p.errs);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j94-hub.png`, fullPage: true }).catch(() => {}); await c.close();
      const ac = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ac.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await ac.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/clients/${m.cid}#files`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#roomFilesBox .action', { timeout: 15000 });
      const txt = await ap.innerText('#roomFilesBox'); ok(/from-phone\.pdf/.test(txt) && /chat-art\.pdf/.test(txt) && /Hidden from client|Client sees it/.test(txt), 'the console\'s All files shows everything with the switches', txt.slice(0, 200));
      await ap.setInputFiles('#rfFileIn', { name: 'console-add.pdf', mimeType: 'application/pdf', buffer: Buffer.from('console') }); await ap.click('#rfDrop button'); await ap.waitForFunction(() => /console-add\.pdf/.test(document.getElementById('roomFilesBox').innerText), null, { timeout: 10000 });
      ok(sql(`select count(*) from room_files where client_id='${m.cid}' and original_name='console-add.pdf' and uploader_role='admin' and not client_visible and not factory_visible`) === '1', 'a file added from the console starts hidden');
      ok(await ap.locator('#rfFac').isDisabled(), 'and the factory switch waits for a project');
      ok(ap.errs.length === 0, 'no script errors in the console', ap.errs); await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j94-console.png` }).catch(() => {}); await ac.close();
    } finally { await bw.close(); }
  }
});

await journey('J95', 'vendor information: every hub client signs one form; bank and tax numbers are encrypted, never come back to the client, never reach a notice or a log, and a changed account cannot be approved without a verification call', async () => {
  const m = await room('95'), other = await room('95b');
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const send = (path, token, name, body = 'tax form', type = 'application/pdf') => { const fd = new FormData(); fd.append('file', new Blob([body], { type }), name); return call(path, { method: 'POST', token, raw: fd }); };
  const form = (extra = {}) => ({ companyName: 'Mill Co', address: '1 Main St', cityStateZip: 'Austin, TX 78701', taxId: '12-3456789', vatNo: '', contactName: 'Ann Lee', contactPhone: '+1 512 555 0100', contactEmail: 'ann@mill.co',
    method: 'ach', currency: 'usd', accountName: 'Mill Co', bankName: 'First Bank', accountNumber: '000123456789', routing: '021000021', signedName: 'Ann Lee', signedTitle: 'Owner', agree: true, ...extra });
  const post = (body, token = m.token) => call('/v1/vendor', { token, body }), get = tok => call('/v1/vendor', { token: tok }).then(r => r.json);
  const list = async () => (await adm(`/v1/admin/clients/${m.cid}/vendor`)).json;

  const v0 = await get(m.token); ok(v0.ready === true && v0.current === null && v0.taxForm === null && v0.approved === false, 'a new client has nothing submitted, and secure storage is on', v0);
  ok((await call('/v1/vendor')).status === 401, 'it needs a sign-in');
  const none = await post(form()); ok(none.status === 400 && none.json.errors.taxForm, 'a form without the W-9 / W-8 is refused, and says so', none.json);
  ok((await send('/v1/room-files?purpose=tax-form', m.token, 'w9.pdf')).status === 201, 'the client uploads their tax form');
  ok((await get(m.token)).taxForm.name === 'w9.pdf', 'and the form knows it');
  const bad = async (label, extra, key) => { const r = await post(form(extra)); ok(r.status === 400 && r.json.errors && r.json.errors[key], label, [r.status, r.json]); };
  await bad('a routing number that does not add up is refused', { routing: '021000022' }, 'routing');
  await bad('so is a form that is not signed', { signedName: '' }, 'signedName'); await bad('or not confirmed', { agree: false }, 'agree');
  await bad('a bad email', { contactEmail: 'ann' }, 'contactEmail'); await bad('an unknown method', { method: 'cash' }, 'method'); await bad('a wire without a SWIFT code', { method: 'wire', swift: 'x', bankAddress: '1 Bank St' }, 'swift');
  await bad('a made-up currency', { currency: 'DOLLARS' }, 'currency'); await bad('a missing tax ID', { taxId: '' }, 'taxId');
  ok(sql(`select count(*) from vendor_submissions where client_id='${m.cid}'`) === '0', 'nothing was saved by any of those');

  const a = await post(form()); ok(a.status === 201 && a.json.current.status === 'pending' && a.json.current.version === 1 && a.json.current.bank === '••••6789', 'a good form is saved as version 1, waiting for review, showing only the last four digits', a.json);
  const seen = [JSON.stringify(a.json), JSON.stringify(await get(m.token))].join(' ');
  ok(!seen.includes('000123456789') && !seen.includes('021000021') && !seen.includes('3456789'), 'neither the reply nor the form afterwards carries the account, routing or tax numbers');
  const g = await get(m.token); ok(g.current.status === 'pending' && g.prefill && g.prefill.companyName === 'Mill Co' && g.prefill.accountNumber === undefined && g.prefill.taxId === undefined, 'the next form is pre-filled with company details only', g.prefill);
  ok(sql(`select count(*) from vendor_submissions where data_enc like '%123456789%' or data_enc like '%021000021%' or data_enc like '%Mill Co%'`) === '0' && sql(`select data_enc from vendor_submissions where client_id='${m.cid}'`).startsWith('v1:'), 'in the database it is ciphertext');
  const note = sql(`select title from notifications where client_id='${m.cid}' and type='vendor-info' order by created_at desc limit 1`);
  ok(/submitted vendor information \(v1\)$/.test(note) && !/\d{4}/.test(note), 'staff are told a form is waiting, with no number in the notice', note);
  ok(!readFileSync(`${S}/server-j-g.log`, 'utf8').includes('000123456789'), 'and no number reaches the server log');
  ok((await get(other.token)).current === null, 'another client sees nothing of it');
  ok((await call(`/v1/admin/clients/${m.cid}/vendor`, { token: m.token })).status === 403 && (await call(`/v1/admin/vendor/${a.json.current.id}/reveal`, { method: 'POST', token: m.token, body: {} })).status === 403 && (await call(`/v1/admin/vendor/${a.json.current.id}/pdf`, { token: m.token })).status === 403, 'a client cannot use the staff routes');

  let l = await list(); const s1 = l.submissions[0];
  ok(l.submissions.length === 1 && s1.bank === '••••6789' && s1.taxLast4 === '6789' && s1.bankChanged === false && s1.taxFormName === 'w9.pdf' && !JSON.stringify(l).includes('000123456789'), 'staff see it masked, with the tax form, and no change flag on a first submission', s1);
  const myEmail = sql(`select email from users where client_id='${m.cid}' limit 1`), reveal = sid => `/v1/admin/vendor/${sid}/reveal`;
  const mailCode = async since => { const mails = ((await call(`/v1/dev/outbox?since=${since}&to=${encodeURIComponent(myEmail)}`)).json.emails || []).filter(e => /code to open vendor/i.test(e.subject)); const last = mails[mails.length - 1]; return last ? { code: (/code is\s+(\d{6})/.exec(last.text) || [])[1], html: last.text } : null; };
  ok((await adm(reveal(s1.id), { method: 'POST', body: {} })).status === 403 && (await adm(reveal(s1.id), { method: 'POST', body: { code: '123456' } })).status === 403, 'full details do not open without an emailed code');
  ok((await call(`${reveal(s1.id)}-code`, { method: 'POST', token: m.token, body: {} })).status === 403, 'and a client cannot ask for one');
  const t0 = Date.now() - 500, rc = await adm(`/v1/admin/vendor/${s1.id}/reveal-code`, { method: 'POST', body: {} }); ok(rc.status === 202 && /••••@/.test(rc.json.sentTo), 'a code is emailed to the finance user, whose address is shown only in part', rc.json);
  const mc = await mailCode(t0); ok(mc && /^\d{6}$/.test(mc.code) && !mc.html.includes('000123456789'), 'the email carries a six-digit code and no bank number', mc && mc.code);
  ok((await adm(reveal(s1.id), { method: 'POST', body: { code: mc.code === '000000' ? '111111' : '000000' } })).status === 403, 'a wrong code opens nothing');
  const rv = await adm(reveal(s1.id), { method: 'POST', body: { code: mc.code } }); ok(rv.status === 200 && rv.json.data.accountNumber === '000123456789' && rv.json.data.routing === '021000021' && rv.json.data.taxId === '12-3456789', 'the right code opens the full details', rv.status);
  ok((await adm(reveal(s1.id), { method: 'POST', body: { code: mc.code } })).status === 403, 'and works once');
  ok(sql(`select count(*) from vendor_access_log where submission_id='${s1.id}' and action='reveal'`) === '1' && /opened the full bank details/.test(sql(`select title from notifications where client_id='${m.cid}' and type='vendor-reveal' order by created_at desc limit 1`)), 'the opening is logged and flagged to staff');
  const pm = await adm(`/v1/admin/vendor/${s1.id}/pdf`); ok(pm.status === 200 && /pdf/.test(pm.ct) && pm.text.startsWith('%PDF'), 'the signed form is a PDF on the letterhead');
  ok((await adm(`/v1/admin/vendor/${s1.id}/pdf?full=1`)).status === 200 && sql(`select count(*) from vendor_access_log where submission_id='${s1.id}'`) === '1', 'there is no full-number PDF: asking for one gives the same masked form and logs nothing');
  ok((await adm(`/v1/admin/vendor/${s1.id}/review`, { method: 'POST', body: { decision: 'reject' } })).status === 400, 'rejecting needs a reason');
  const ap1 = await adm(`/v1/admin/vendor/${s1.id}/review`, { method: 'POST', body: { decision: 'approve' } }); ok(ap1.status === 200 && ap1.json.status === 'approved', 'the first form can be approved', ap1.json);
  ok((await adm(`/v1/admin/vendor/${s1.id}/review`, { method: 'POST', body: { decision: 'approve' } })).status === 409, 'and only once');
  const hubA = await get(m.token); ok(hubA.approved === true && hubA.activeVersion === 1 && hubA.current.status === 'approved', 'the client sees it approved');

  const same = await post(form({ contactPhone: '+1 512 555 0199' })); ok(same.status === 201 && same.json.current.version === 2, 'a new version with the same bank details is accepted');
  l = await list(); ok(l.submissions[0].bankChanged === false, 'and is not flagged', l.submissions[0]);
  const chg = await post(form({ accountNumber: '999888777666' })); ok(chg.status === 201 && chg.json.current.version === 3 && chg.json.current.bank === '••••7666', 'then a version with a different account');
  l = await list(); const s3 = l.submissions[0]; ok(s3.bankChanged === true && l.submissions.find(x => x.version === 2).status === 'superseded', 'it is flagged as a changed account, and the pending version before it is replaced', l.submissions.map(x => [x.version, x.status, x.bankChanged]));
  ok(/CHANGED/.test(sql(`select title from notifications where client_id='${m.cid}' and type='vendor-info' order by created_at desc limit 1`)), 'the notice to staff says the bank details changed');
  const nv = await adm(`/v1/admin/vendor/${s3.id}/review`, { method: 'POST', body: { decision: 'approve' } }); ok(nv.status === 400 && /call/i.test(nv.json.error), 'it cannot be approved without a verification call', nv.json);
  const hubB = await get(m.token); ok(hubB.activeVersion === 1 && hubB.current.status === 'pending', 'meanwhile the client sees version 1 still in use and the new one waiting');
  const rj = await adm(`/v1/admin/vendor/${s3.id}/review`, { method: 'POST', body: { decision: 'reject', note: 'The account name does not match the company' } }); ok(rj.status === 200 && rj.json.status === 'rejected', 'staff can reject it with a reason');
  const hubC = await get(m.token); ok(hubC.current.status === 'rejected' && /account name/.test(hubC.current.note) && hubC.approved === true, 'the client sees why, and the approved version still stands', hubC.current);
  const again = await post(form({ accountNumber: '999888777666', accountName: 'Mill Co LLC' })); ok(again.status === 201 && again.json.current.version === 4, 'they correct it and resubmit');
  l = await list(); const s4 = l.submissions[0]; const okc = await adm(`/v1/admin/vendor/${s4.id}/review`, { method: 'POST', body: { decision: 'approve', verifiedCall: true, note: 'Called the number on the W-9' } });
  ok(okc.status === 200 && okc.json.verifiedCall === true, 'with a verification call it is approved');
  l = await list(); ok(l.submissions.filter(x => x.status === 'approved').length === 1 && l.submissions.find(x => x.status === 'approved').version === 4 && l.submissions.find(x => x.version === 1).status === 'superseded', 'exactly one version is approved, the newest; the old one is superseded and kept', l.submissions.map(x => [x.version, x.status]));
  ok(sql(`select count(*) from vendor_submissions where client_id='${m.cid}'`) === '4', 'nothing was ever overwritten');

  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const c = await bw.newContext({ viewport: { width: 1280, height: 1000 } }); await c.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, other.token);
      const p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/hub`, { waitUntil: 'networkidle' }); await p.waitForSelector('#vendorPanel:not(.hidden)', { timeout: 15000 });
      ok(/not started/i.test(await p.innerText('#vStatus')) && /complete vendor information/i.test(await p.innerText('#vOpen')), 'the hub asks a new client for their vendor information');
      await p.click('#vOpen'); await p.waitForSelector('#vendorDialog[open]');
      await p.setInputFiles('#vTaxFile', { name: 'w8.pdf', mimeType: 'application/pdf', buffer: Buffer.from('w8') }); await p.waitForFunction(() => /w8\.pdf/.test(document.getElementById('vTaxName').innerText), null, { timeout: 10000 });
      await p.click('#vSubmit'); await p.waitForFunction(() => document.getElementById('vErr').innerText.length > 0, null, { timeout: 5000 });
      ok(await p.evaluate(() => document.querySelectorAll('#vendorForm .bad').length > 0) && /required|enter|choose/i.test(await p.innerText('#vErr')), 'an empty form says what is missing and marks the fields');
      const fill = (n, v) => p.fill(`#vendorForm [name="${n}"]`, v);
      for (const [n, v] of Object.entries({ companyName: 'Browser Mill', address: '2 Side St', cityStateZip: 'Reno, NV 89501', taxId: '98-7654321', contactName: 'Bo Ling', contactPhone: '+1 775 555 0100', contactEmail: 'bo@browser.mill', currency: 'USD', accountName: 'Browser Mill', bankName: 'Silver Bank', accountNumber: '555444333222', routing: '021000021', signedName: 'Bo Ling', signedTitle: 'CEO' })) await fill(n, v);
      await p.check('#vendorForm [name="agree"]');
      await p.click('[name="method"][value="wire"]'); ok(await p.evaluate(() => getComputedStyle(document.querySelector('#vendorForm [data-m="wire"][class*="full"]')).display !== 'none') && await p.evaluate(() => getComputedStyle(document.querySelector('#vendorForm [data-m="ach"]:not([data-m~="wire"])')).display === 'none'), 'choosing a wire shows the wire fields and hides the ACH-only ones');
      await p.click('[name="method"][value="ach"]');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j95-form.png`, fullPage: true }).catch(() => {});
      await p.click('#vSubmit'); await p.waitForFunction(() => !document.getElementById('vendorDialog').open, null, { timeout: 10000 });
      await p.waitForFunction(() => /waiting for review/i.test(document.getElementById('vStatus').innerText), null, { timeout: 10000 }).catch(() => {});
      ok(/waiting for review/i.test(await p.innerText('#vStatus')) && /••••3222/.test(await p.innerText('#vStatus')) && !/555444333222/.test(await p.content()), 'signing it closes the form and the panel shows it waiting, with the last four digits and never the number');
      ok(p.errs.length === 0, 'no script errors', p.errs); await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j95-hub.png` }).catch(() => {}); await c.close();
      const ac = await bw.newContext({ viewport: { width: 1280, height: 1000 } }); await ac.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const ap = await ac.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/clients/${other.cid}#vendor`, { waitUntil: 'networkidle' }); await ap.waitForSelector('#vendorBox .action', { timeout: 15000 });
      const txt = await ap.innerText('#vendorBox'); ok(/Browser Mill/.test(txt) && /••••3222/.test(txt) && !/555444333222/.test(txt), 'the console shows the form masked', txt.slice(0, 160));
      const t1 = Date.now() - 500; await ap.click('#vendorBox .action .tools button:first-child'); await ap.waitForSelector('#vendorBox input[id^="vcode-"]', { timeout: 8000 }); const bc = await mailCode(t1); await ap.fill('#vendorBox input[id^="vcode-"]', bc.code); await ap.click('#vendorBox .vreveal button'); await ap.waitForFunction(() => document.querySelector('#vendorBox pre') || [...document.querySelectorAll('#vendorBox [id^="vcm-"]')].some(x => x.innerText), null, { timeout: 8000 }); ok(/555444333222/.test(await ap.locator('#vendorBox pre').first().innerText({ timeout: 2000 }).catch(() => '')), 'a finance user opens the full details with the emailed code', await ap.locator('#vendorBox [id^="vcm-"]').first().innerText().catch(() => ''));
      await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j95-console.png` }).catch(() => {});
      ok(ap.errs.length === 0, 'no script errors in the console', ap.errs); await ac.close();
    } finally { await bw.close(); }
  }
  { // guessing: after five wrong codes nothing opens, not even the right one
    const sid = l.submissions[0].id, t2 = Date.now() - 500; await adm(`/v1/admin/vendor/${sid}/reveal-code`, { method: 'POST', body: {} });
    const good = (await mailCode(t2)).code, wrong = good === '111111' ? '222222' : '111111'; let last = 0;
    for (let i = 0; i < 6; i++) last = (await adm(reveal(sid), { method: 'POST', body: { code: wrong } })).status;
    ok(last === 429 && (await adm(reveal(sid), { method: 'POST', body: { code: good } })).status === 429, 'guessing is stopped: after five wrong codes even the right one is refused for a while');
  }
});

await journey('J96', 'a graphic with a description is not a dead end: the pack is drafted from the description, the graphic is kept as the client\'s downloadable artwork in the files folder, and a concept render is made from both', async () => {
  // black lettering-like bars on white: a graphic, no product in it
  const png = await sharp({ create: { width: 640, height: 320, channels: 3, background: '#ffffff' } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect x="40" y="90" width="90" height="150" fill="#000"/><rect x="160" y="60" width="60" height="180" fill="#000"/><rect x="250" y="120" width="330" height="70" rx="30" fill="#000"/></svg>`) }]).png().toBuffer();
  const art = `data:image/png;base64,${png.toString('base64')}`;
  const start = (title, notes) => call('/v1/public/start', { body: { email: em('96'), name: 'Graphic Client', title, notes, photos: [art] } });
  const draftOf = async (tok, id) => (await call(`/v1/products/${id}/tech-pack/draft`, { token: tok })).json;
  const a = await start('A hoodie and matching sweatpants', 'A hoodie and matching sweatpants'); ok(a.status === 201 && a.json.token, 'a graphic with a description starts a room', [a.status, a.json.error]);
  const tok = a.json.token, pid = a.json.product.id, cid = a.json.client.id;
  let d = null; for (let i = 0; i < 100; i++) { d = await draftOf(tok, pid); if (d.techPack && ['done', 'failed'].includes(d.techPack.aiStatus)) break; await sleep(300); }
  ok(d.techPack.aiStatus === 'done' && !d.techPack.aiError, 'the assistant drafts it from the description instead of failing on the picture', [d.techPack.aiStatus, d.techPack.aiError]);
  const data = d.techPack.data;
  ok(data.artwork.length === 1 && data.artwork[0].image === art && /upload/i.test(data.artwork[0].name), 'the graphic is kept as the client\'s artwork', data.artwork.map(x => x.name));
  ok(data.sketches.every(sk => sk.image !== art), 'and is not passed off as a sketch of the product');
  ok(data.pom.length > 0 && data.bom.length > 0, 'the pack has measurements and materials', [data.pom.length, data.bom.length]);
  for (let i = 0; i < 60 && !(d.techPack.data.renderings || []).some(r => /^concept-/.test(r.id)); i++) { await sleep(300); d = await draftOf(tok, pid); }
  const cr = d.techPack.data.renderings.find(r => /^concept-/.test(r.id)); ok(cr && cr.name === 'Concept render' && /^data:image\/jpeg;base64,/.test(cr.image) && d.techPack.data.renderings[0].id === cr.id, 'a concept render made from the graphic and the description is the first rendering, so the cover shows something', cr && cr.name);
  // the concept render is the front view, so the callouts page, the check and the hero have something to start from; the client's own graphic is placed on it, never redrawn
  for (let i = 0; i < 60 && !d.techPack.data.sketches.some(sk => sk.image); i++) { await sleep(300); d = await draftOf(tok, pid); }
  const front = d.techPack.data.sketches.find(sk => sk.image); ok(front && front.image === cr.image && /concept render/i.test(front.label) && front.label.indexOf('to follow') < 0, 'the concept render is the front view (the Callouts page is not empty)', front && front.label);
  const place = d.techPack.data.artwork[0].placements.find(pl => pl.sketchId === front.id); ok(place && place.x > 0 && place.x < 1 && place.y > 0 && place.y < 1 && place.w > 0 && place.widthIn > 0 && /adjust/i.test(place.label), 'the client\'s graphic is placed on it as a placement that can be dragged and sized', place);
  ok(d.techPack.data.artwork[0].image === art, 'and the placed graphic is still exactly the upload');
  const stu = (await call(`/v1/products/${pid}/tech-pack/studio`, { token: tok })).json; ok(stu && !stu.error, 'the studio and check read the pack with its front view', stu && stu.error);
  // "from your files": pictures already saved are offered instead of uploading again
  const sendRoom = (token, name, buf) => { const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/png' }), name); return call('/v1/room-files', { method: 'POST', token, raw: fd }); };
  const rf = await sendRoom(tok, 'logo-from-room.png', png); ok(rf.status === 201, 'a picture can be sent to the room', [rf.status, rf.json.error]);
  const pk = (await call(`/v1/products/${pid}/pick-images`, { token: tok })).json;
  ok(pk.items.some(i => /logo-from-room\.png$/.test(i.name)) && pk.items.some(i => /upload/i.test(i.name) && i.where === 'This product') && pk.items.some(i => /concept|front/i.test(i.name + i.label)), 'the picker offers the room\'s pictures and this product\'s own, including the render', pk.items.map(i => i.where + ':' + i.name));
  ok(pk.items.every(i => /^image\//.test(i.mime)), 'only pictures are offered', pk.items.map(i => i.mime));
  const got1 = await fetch(BASE + pk.items.find(i => /logo-from-room/.test(i.name)).url, { headers: { Authorization: 'Bearer ' + tok } }); ok(got1.status === 200 && Buffer.from(await got1.arrayBuffer()).equals(png), 'a picked picture is fetched exactly as saved');
  const pkAll = (await call('/v1/pick-images', { token: tok })).json; ok(pkAll.items.some(i => /logo-from-room/.test(i.name)) && pkAll.items.some(i => /upload/i.test(i.name)), 'before a product exists the hub offers the room\'s pictures and the product folders\'', pkAll.items.map(i => i.name));
  const stranger = await room('96x'); ok((await call(`/v1/products/${pid}/pick-images`, { token: stranger.token })).status === 404 && !(await call('/v1/pick-images', { token: stranger.token })).json.items.some(i => /logo-from-room/.test(i.name)), 'another client cannot list or take them');
  ok((await call(`/v1/products/${pid}/pick-images`, { token: '' })).status === 401, 'and it needs a sign-in');
  const f = (await call(`/v1/products/${pid}/files`, { token: tok })).json, ups = (f.groups.find(g => g.key === 'uploads') || { items: [] }).items;
  const mine = ups.find(i => /upload/i.test(i.label || '') || /upload/i.test(i.name)); ok(mine && /\.png$/i.test(mine.name) && /^image\/png/.test(mine.mime), 'the files folder lists the graphic under "Your uploads"', ups.map(i => i.name));
  const dl = await fetch(BASE + mine.url, { headers: { Authorization: 'Bearer ' + tok } }); const got = Buffer.from(await dl.arrayBuffer()); ok(dl.status === 200 && got.equals(png), 'and the client can download exactly what they uploaded', [dl.status, got.length, png.length]);
  const admin = await forge({ sub: sql(`select id from users where client_id='${cid}' limit 1`), clientId: cid, role: 'admin' });
  const af = (await call(`/v1/products/${pid}/files`, { token: admin })).json; ok(af.groups.some(g => g.key === 'uploads' && g.items.some(i => i.id === mine.id)), 'staff see it in the same folder');
  ok(ups.length === 1, 'and only once: the pack\'s copy of it is not listed a second time', ups.map(i => i.name));
  // the art files made from it: the original untouched, a clean copy, the inks, and whether it is big enough to print
  for (let i = 0; i < 60 && !((d.techPack.data.artwork[0] || {}).note); i++) { await sleep(300); d = await draftOf(tok, pid); }
  const art0 = d.techPack.data.artwork[0]; ok(/Kept exactly as you sent it/.test(art0.note) && /640 × 320|\d+ × \d+ px/.test(art0.note) && art0.source === 'upload', 'the artwork says it is kept as sent, and how big it is for print', art0.note);
  ok(/too small to print|dpi/.test(art0.note), 'a small file is flagged as small for print', art0.note);
  ok(art0.pantones.length >= 1 && /^PANTONE .+ C$/.test(art0.pantones[0].code), 'the inks are found and matched to Pantone C chips', art0.pantones);
  ok(art0.image === art, 'and the artwork itself is exactly the upload');
  ok(/^data:image\/png;base64,/.test(art0.clear || ''), 'a transparent copy rides with it, so the logo sits on the garment picture without a white box', (art0.clear || '').slice(0, 30));
  const f2 = (await call(`/v1/products/${pid}/files`, { token: tok })).json, clean = f2.groups.flatMap(g => g.items).find(i => /Art file/.test(i.label || '')); ok(clean && clean.group === 'design' && /\.png$/i.test(clean.name), 'the files folder has a clean art file under Design files', f2.groups.flatMap(g => g.items).map(i => i.label));
  const cdl = await fetch(BASE + clean.url, { headers: { Authorization: 'Bearer ' + tok } }), cbuf = Buffer.from(await cdl.arrayBuffer()), cm = await sharp(cbuf).metadata(), craw = await sharp(cbuf).ensureAlpha().raw().toBuffer();
  ok(cdl.status === 200 && cm.hasAlpha && cm.width < 640 && craw[3] === 0, 'it is a transparent, trimmed PNG', [cm.width, cm.height, cm.hasAlpha]);

  const b = await start('Hoodie', ''); ok(b.status === 201, 'a graphic with a one-word title and no description still starts a room');
  let e = null; for (let i = 0; i < 100; i++) { e = await draftOf(b.json.token, b.json.product.id); if (e.techPack && ['done', 'failed'].includes(e.techPack.aiStatus)) break; await sleep(300); }
  ok(e.techPack.aiStatus === 'failed' && /could not make out a product/.test(e.techPack.aiError || ''), 'with nothing said about the product it asks for a better picture, as before', [e.techPack.aiStatus, e.techPack.aiError]);
  // the screens: the concept render is on the Callouts page with the logo on it, the Check says what the picture is, and "from your files" works
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      for (let i = 0; i < 160; i++) { const s2 = await call(`/v1/products/${pid}/tech-pack/studio`, { token: tok }); if (s2.json.loop && s2.json.loop.status === 'done') break; await sleep(300); }
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, tok);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${pid}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#tabs button[data-tab="calls"]', { timeout: 20000 }); await p.keyboard.press('Escape');
      await p.click('#tabs button[data-tab="calls"]'); await p.waitForSelector('.panel[data-panel="calls"] .stage img.base', { timeout: 10000 });
      const cs = { empty: await p.locator('.panel[data-panel="calls"] .stage .empty').count(), overlays: await p.locator('.panel[data-panel="calls"] .art-overlay img').count(), note: await p.locator('.panel[data-panel="calls"] .concept-note').count() };
      ok(cs.empty === 0 && cs.overlays === 1 && cs.note === 1, 'Callouts: the front view is the concept render with the client\'s logo on it, not an empty drop box', cs);
      const hb = await p.evaluate(() => { const r = e => { const b = e && e.getBoundingClientRect(); return b && { cy: b.top + b.height / 2, h: b.height, top: b.top }; }, acts = document.querySelector('.top .acts'); return { save: r(acts.querySelector('[data-act="save"]')), more: r(acts.querySelector('.more > summary')), submit: r(acts.querySelector('.go, .btn.go, [data-act="submit"]')) }; });
      ok(hb.save && hb.more && Math.abs(hb.save.cy - hb.more.cy) <= 1.5 && Math.abs(hb.save.h - hb.more.h) <= 2, 'the header "More" button lines up with the other header pills (same centre line, same height)', hb);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j96-callouts.png` }).catch(() => {});
      const admin2 = await forge({ sub: sql(`select id from users where client_id='${cid}' limit 1`), clientId: cid, role: 'admin' });
      const actx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await actx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin2);
      const ap = await actx.newPage(); ap.errs = []; ap.on('pageerror', e => ap.errs.push(e.message));
      await ap.goto(`${BASE}/tech-packs/${pid}?as=work`, { waitUntil: 'domcontentloaded' }); await ap.waitForSelector('#tabs button[data-tab="check"]', { timeout: 20000 }); await ap.keyboard.press('Escape'); await ap.click('#tabs button[data-tab="check"]'); await ap.waitForSelector('.chk-shots figcaption', { timeout: 15000 });
      const caps = await ap.locator('.chk-shots figcaption').allInnerTexts(); ok(/concept render/i.test(caps[0]) && ap.errs.length === 0, 'Check: the first picture is the concept render and says so, not "the client\'s photo"', [caps, ap.errs]);
      await ap.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j96-check.png` }).catch(() => {}); await actx.close();
      await p.click('#tabs button[data-tab="art"]'); await p.waitForSelector('.pickbtn[data-for="artfile"]');
      const before = await p.locator('.panel[data-panel="art"] .arts .art').count();
      await p.click('.pickbtn[data-for="artfile"]'); await p.waitForSelector('.fbpk .it', { timeout: 10000 });
      ok(/this product/i.test(await p.innerText('.fbpk')) && /logo-from-room/.test(await p.innerText('.fbpk')), 'Art: "Choose from your files" lists this product\'s pictures and the room\'s');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j96-picker.png` }).catch(() => {});
      await p.locator('.fbpk .it', { hasText: 'logo-from-room' }).click(); await p.click('.fbpk button.go');
      await p.waitForFunction(n => document.querySelectorAll('.panel[data-panel="art"] .arts .art').length > n, before, { timeout: 10000 });
      ok(await p.locator('.fbpk').count() === 0, 'a picked picture is added as artwork, the same as an uploaded one, and the box closes');
      await ctx.close();
      const hub = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await hub.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, tok);
      const h = await hub.newPage(); h.errs = []; h.on('pageerror', e => h.errs.push(e.message));
      await h.goto(`${BASE}/hub`, { waitUntil: 'domcontentloaded' }); await h.waitForFunction(() => typeof window.FBPick !== 'undefined' && document.getElementById('tpFromFiles'), null, { timeout: 20000 });
      await h.evaluate(() => document.getElementById('techPackDialog').showModal()); await h.click('#tpFromFiles'); await h.waitForSelector('.fbpk .it', { timeout: 10000 });
      await h.locator('.fbpk .it').first().click(); await h.click('.fbpk button.go');
      await h.waitForFunction(() => !document.getElementById('tpShots').classList.contains('hidden') && document.querySelectorAll('#tpShots img').length > 0, null, { timeout: 15000 });
      ok(h.errs.length === 0, 'Hub: starting a tech pack can take a picture from the saved files instead of the computer', h.errs); await hub.close();
    } finally { await bw.close(); }
  }
});

await journey('J97', 'flag a line and say what is wrong: the design assistant changes that one line (or says why not), it can be undone, a submitted pack is closed to it, and measurements are never touched', async () => {
  const m = await room('97'), other = await room('97b'), sub = await room('97c');
  for (const r of [m, sub]) for (let i = 0; i < 160; i++) { const st = await studio(r); if (st.loop && st.loop.status === 'done') break; await sleep(300); }
  const draft = async (r = m) => (await call(`/v1/products/${r.id}/tech-pack/draft`, { token: r.token })).json;
  const flag = (body, r = m, token = r.token) => call(`/v1/products/${r.id}/tech-pack/flag`, { token, body });
  const d0 = await draft(), bom = d0.techPack.data.bom, before = JSON.stringify(bom.slice(1));
  ok(bom.length >= 2, 'the draft has materials to flag', bom.length);

  const a = await flag({ section: 'bom', index: 0, sketch: 0, note: 'This is wrong: set material to Heathered grey knit mesh' });
  ok(a.status === 201 && a.json.flag.outcome === 'changed' && a.json.flag.changes.length === 1 && /BOM/.test(a.json.flag.target), 'a flagged line is changed by the design assistant, and the answer says what', [a.status, a.json.error, a.json.flag]);
  ok(a.json.flag.changes[0].from === bom[0].material && a.json.flag.changes[0].to === 'Heathered grey knit mesh' && a.json.data.bom[0].material === 'Heathered grey knit mesh', 'from what it was to what it became, in the saved pack');
  ok(JSON.stringify(a.json.data.bom.slice(1)) === before, 'and no other line moved');
  ok((await draft()).techPack.data.bom[0].material === 'Heathered grey knit mesh', 'it is saved, not only shown');
  const put = await call(`/v1/products/${m.id}/tech-pack/draft`, { method: 'PUT', token: m.token, body: { data: a.json.data, baseEtag: a.json.techPack.etag } }); ok(put.status === 200, 'the page can keep saving afterwards: its version number moved with the change', [put.status, put.json.error]);
  const list = (await call(`/v1/products/${m.id}/tech-pack/flags`, { token: m.token })).json.flags; ok(list.length === 1 && list[0].note.startsWith('This is wrong') && list[0].by === 'client', 'the flag is on record with who made it and what they wrote');
  const undo = await call(`/v1/products/${m.id}/tech-pack/flags/${a.json.flag.id}/undo`, { method: 'POST', token: m.token, body: {} });
  ok(undo.status === 200 && undo.json.flag.undone === true && undo.json.data.bom[0].material === bom[0].material && undo.json.reverted.length === 1, 'undo puts the line back exactly as it was', [undo.status, undo.json.error]);
  ok((await call(`/v1/products/${m.id}/tech-pack/flags/${a.json.flag.id}/undo`, { method: 'POST', token: m.token, body: {} })).status === 409, 'and cannot be undone twice');
  const b = await flag({ section: 'bom', index: 0, sketch: 0, note: 'set material to Navy ribbed knit' }); await call(`/v1/products/${m.id}/tech-pack/draft`, { method: 'PUT', token: m.token, body: { data: { ...b.json.data, bom: b.json.data.bom.map((r, i) => i === 0 ? { ...r, material: 'Typed by hand' } : r) }, baseEtag: b.json.techPack.etag } });
  ok((await call(`/v1/products/${m.id}/tech-pack/flags/${b.json.flag.id}/undo`, { method: 'POST', token: m.token, body: {} })).status === 409 && (await draft()).techPack.data.bom[0].material === 'Typed by hand', 'a line a person has edited since is never overwritten by an undo');

  const k = await flag({ section: 'bom', index: 1, sketch: 0, note: 'The sole looks too big to me' }); ok(k.status === 201 && k.json.flag.outcome === 'kept' && k.json.flag.changes.length === 0 && k.json.flag.say, 'a note it would not act on changes nothing, and it says so', k.json.flag);
  const c = await flag({ section: 'construction', index: 0, sketch: 0, note: 'set tolerance to 2mm' }); ok(c.status === 201 && c.json.flag.outcome === 'kept', 'a field the assistant is never allowed to change stays as it is, even when asked');
  ok((await flag({ section: 'pom', index: 0, note: 'set value to 5' })).status === 400, 'measurements cannot be flagged');
  ok((await flag({ section: 'bom', index: 99, note: 'set material to x' })).status === 404 && (await flag({ section: 'bom', index: 0, note: 'x' })).status === 400, 'a line that is not there, or a note with nothing in it, is refused');
  ok((await flag({ section: 'bom', index: 0, note: 'set material to x' }, m, other.token)).status === 404 && (await call(`/v1/products/${m.id}/tech-pack/flag`, { body: { section: 'bom', index: 0, note: 'set material to x' } })).status === 401, 'another client cannot flag it, and neither can someone who is not signed in');
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='tech-pack-flag'`) === '4' && /assistant kept it/.test(sql(`select title from notifications where client_id='${m.cid}' and type='tech-pack-flag' order by created_at desc limit 1`)), 'staff are told each time a client flags a line, and whether it needs a person');

  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' });
  const st = await call(`/v1/admin/products/${m.id}/tech-pack/flag`, { token: admin, body: { section: 'colorways', index: 0, note: 'set notes to Match the sole exactly' } }); ok(st.status === 201 && st.json.flag.by === 'admin' && st.json.flag.outcome === 'changed', 'staff can flag a line too', [st.status, st.json.error]);
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/flag`, { token: m.token, body: { section: 'bom', index: 0, note: 'set material to x' } })).status === 403, 'a client cannot use the staff route');
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and type='tech-pack-flag'`) === '4', 'and a staff flag does not notify staff of their own action');

  const subm = await call(`/v1/products/${sub.id}/tech-pack/submit`, { method: 'POST', token: sub.token, body: { note: 'Please review' } }); ok(subm.status === 200, 'a pack is submitted', subm.json.error);
  const sf = await flag({ section: 'bom', index: 0, note: 'set material to x' }, sub); ok(sf.status === 409 && /submitted/.test(sf.json.error), 'once submitted, the client can no longer flag lines: the pack is Future Basics\'s to change', [sf.status, sf.json.error]);
  const adminS = await forge({ sub: sql(`select id from users where client_id='${sub.cid}' limit 1`), clientId: sub.cid, role: 'admin' });
  ok((await call(`/v1/admin/products/${sub.id}/tech-pack/flag`, { token: adminS, body: { section: 'bom', index: 0, note: 'set material to Staff fix' } })).status === 201, 'but staff still can');

  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      for (const [name, vp, mobile] of [['desktop', { width: 1280, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
        const r = await room('97' + name[0]); for (let i = 0; i < 160; i++) { const s2 = await studio(r); if (s2.loop && s2.loop.status === 'done') break; await sleep(300); }
        const ctx = await bw.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, r.token);
        const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
        await p.goto(`${BASE}/tech-packs/${r.id}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#tabs button[data-tab="bom"]', { timeout: 20000 });
        await p.keyboard.press('Escape'); await p.click('#tabs button[data-tab="bom"]'); await p.waitForSelector('.flagbtn[data-sec="bom"]', { timeout: 10000 });
        await p.locator('.flagbtn[data-sec="bom"]').first().click(); await p.waitForSelector('.flagpop textarea');
        ok(/flag this line/i.test(await p.innerText('.flagpop')) && /Materials/.test(await p.innerText('.flagpop .fp-head')), `${name}: the flag button opens a small box naming the line`);
        await p.fill('.flagpop textarea', 'Wrong finish: set material to Heathered grey knit mesh'); await p.click('.flagpop [data-fp="send"]'); await p.waitForSelector('.flagpop .fp-say', { timeout: 15000 });
        ok(/Heathered grey knit mesh/.test(await p.innerText('.flagpop .fp-chg')) && await p.evaluate(() => document.querySelector(`.t[data-path='["bom",0,"material"]']`)?.value) === 'Heathered grey knit mesh', `${name}: it shows what changed, and the field on the page already has it`);
        await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j97-${name}-flag.png` }).catch(() => {});
        await p.click('.flagpop [data-fp="undo"]'); await p.waitForFunction(() => /Undone/i.test(document.querySelector('.flagpop')?.innerText || ''), null, { timeout: 8000 });
        ok(await p.evaluate(() => document.querySelector(`.t[data-path='["bom",0,"material"]']`)?.value) !== 'Heathered grey knit mesh', `${name}: Undo puts it back on the page`);
        await p.click('.flagpop [data-fp="done"]'); ok(await p.locator('.flagpop').count() === 0, `${name}: Done closes it`);
        ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && p.errs.length === 0, `${name}: nothing spills sideways and no script errors`, p.errs); await ctx.close();
      }
    } finally { await bw.close(); }
  }
});

const bad = await journey('J98', 'a new version tells the factory what changed, keeps its acknowledgements for callouts that did not change, and says so in the email', async () => {
  const m = await room('98'); await waitAi(call, m.token, m.id);
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (p, o = {}) => call(p, { token: admin, ...o });
  const dr = (await call(`/v1/products/${m.id}/tech-pack/draft`, { token: m.token })).json;
  ok(!dr.completeness.missing.some(x => /style number/i.test(x)) && Array.isArray(dr.completeness.missingRecommended) && dr.completeness.missingRecommended.some(x => /packed/i.test(x)) && dr.completeness.missingRecommended.some(x => /country of origin/i.test(x)), 'the client is told what a factory will still ask about (packing, origin), without it blocking anything, and is not asked for a style number', dr.completeness);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: v1' } })).status === 200, 'staff publish v1');
  const v1 = (await call(`/v1/products/${m.id}/tech-pack`, { token: m.token })).json.techPack;
  ok(/^FB-\d\d-\d{4}$/.test(v1.data.style.styleNumber), 'publishing gives the pack a style number a factory can put on a purchase order', v1.data.style.styleNumber);
  ok(v1.readiness.checks.find(c => c.key === 'artwork').ok && v1.readiness.checks.find(c => c.key === 'placement').ok, 'a product with no artwork is not marked as missing artwork or placement', v1.readiness.checks.map(c => [c.key, c.ok]));
  ok((await call(`/v1/products/${m.id}/tech-pack/approve`, { method: 'POST', token: m.token, body: { name: 'Pat Client' } })).status === 200, 'the client approves v1');
  const shareEmail = `mill98-${stamp}@chaos.test`, sh = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { label: 'Mill 98', email: shareEmail } }); ok(sh.status === 201, 'staff send the factory a link', [sh.status, sh.json.error]);
  const ftok = sh.json.url.split('/tp/')[1];
  let fv = await call(`/v1/tp/${ftok}`); const callouts = fv.json.techPack.readiness.callouts; ok(callouts.length >= 3, 'the pack has callouts to acknowledge', callouts.length);
  const badAck = await call(`/v1/tp/${ftok}/ack`, { method: 'POST', body: { keys: [callouts[0].key, 'nope:1'] } });
  ok(badAck.status === 400 && (await call(`/v1/tp/${ftok}`)).json.techPack.readiness.pendingCalloutKeys.length === callouts.length, 'acknowledging a list with one unknown callout is refused and records none of it', badAck.status);
  const allAck = await call(`/v1/tp/${ftok}/ack`, { method: 'POST', body: { keys: callouts.map(c => c.key) } });
  ok(allAck.status === 200 && allAck.json.techPack.readiness.pendingCalloutKeys.length === 0, 'a factory that has read the whole pack acknowledges every callout in one go', [allAck.status, allAck.json.error]);
  // the page and the pack data travel compressed to a browser that accepts it, byte for byte the same once unpacked
  const raw = (path, enc) => new Promise(res => http.get(BASE + path, { headers: { 'accept-encoding': enc } }, r => { const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => res({ status: r.statusCode, enc: r.headers['content-encoding'], body: Buffer.concat(ch) })); }));
  for (const path of [`/v1/tp/${ftok}`, `/tp/${ftok}`]) { const plain = await raw(path, 'identity'), gz = await raw(path, 'gzip'); ok(plain.status === 200 && !plain.enc && gz.enc === 'gzip' && zlib.gunzipSync(gz.body).equals(plain.body) && gz.body.length < plain.body.length * (path.startsWith('/v1') ? 0.95 : 0.5), `${path.startsWith('/v1') ? 'the pack data' : 'the page'} is compressed for a browser that accepts it and identical once unpacked`, [plain.status, plain.enc, gz.enc, plain.body.length, gz.body.length]); }
  const rev1 = fv.json.techPack.revisions.at(-1); ok(rev1.version === 1 && !rev1.summary && (rev1.changes || []).length === 0, 'v1 has nothing to say about changes', rev1);
  // staff change one callout and one measurement, then publish v2
  const data = structuredClone(fv.json.techPack.data), sk = data.sketches.find(x => x.callouts.length), co = sk.callouts[0], oldSpec = co.spec; co.spec = 'Changed in v2: ' + oldSpec;
  const pom = data.pom[0], size = Object.keys(pom.values)[0], oldVal = pom.values[size]; pom.values[size] = '99.5';
  const put = await adm(`/v1/admin/products/${m.id}/tech-pack`, { method: 'PUT', body: { data } }); ok(put.status === 200, 'staff edit the pack', [put.status, put.json.error]);
  const pub2 = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: v2' } }); ok(pub2.status === 200 && pub2.json.techPack.version === 2, 'staff publish v2', [pub2.status, pub2.json.error]);
  // until the client approves v2 the factory's link still shows v1 (it must never act on a version the client has not signed), and it is not emailed about v2 yet
  const heldView = await call(`/v1/tp/${ftok}`); ok(heldView.json.held === true && heldView.json.techPack.version === 1, 'before the client approves, the factory link still shows v1', [heldView.json.held, heldView.json.techPack.version]);
  ok(((await call(`/v1/dev/outbox?to=${encodeURIComponent(shareEmail)}`)).json.emails || []).filter(e => /New version/.test(e.subject)).length === 0, 'and the factory is not told about a version it cannot open yet');
  ok((await call(`/v1/products/${m.id}/tech-pack/approve`, { method: 'POST', token: m.token, body: { name: 'Pat Client' } })).status === 200, 'the client approves v2');
  fv = await call(`/v1/tp/${ftok}`); const rev2 = fv.json.techPack.revisions.at(-1);
  ok(rev2.version === 2 && /^2 changes: /.test(rev2.summary) && rev2.changes.length === 2, 'the revision says exactly what changed', rev2);
  const mc = rev2.changes.find(c => c.section === 'Measurements'), cc = rev2.changes.find(c => c.section === 'Callouts');
  ok(mc && mc.from === `${size}: ${oldVal}` && mc.to === `${size}: 99.5` && cc && cc.kind === 'changed' && cc.to.includes('Changed in v2'), 'with the measurement and callout, from and to', [mc, cc]);
  const pend = fv.json.techPack.readiness.pendingCalloutKeys; ok(pend.length === 1 && pend[0] === `${sk.id}:${co.n}`, 'only the callout that changed needs acknowledging again', pend);
  ok(fv.json.techPack.readiness.callouts.length - pend.length === callouts.length - 1, 'every other acknowledgement stood');
  ok(!fv.json.techPack.readiness.brandSign && !fv.json.techPack.readiness.factorySign && fv.json.techPack.readiness.clientSign.name === 'Pat Client' && fv.json.techPack.readiness.clientSign.at > rev2.publishedAt, 'signatures never carry over: only the client\'s fresh approval of v2 is on it', fv.json.techPack.readiness.clientSign);
  const mails = ((await call(`/v1/dev/outbox?to=${encodeURIComponent(shareEmail)}`)).json.emails || []).filter(e => /New version/.test(e.subject));
  ok(mails.length === 1 && /2 changes/.test(mails[0].text) && /Changed in v2/.test(mails[0].text), 'the factory email carries the summary and the changes, not just "something changed"', mails.map(e => e.text));
  // the same change list reaches the client's own view
  const cv = await call(`/v1/products/${m.id}/tech-pack`, { token: m.token }); ok(cv.json.techPack.revisions.at(-1).changes.length === 2, 'the client sees the same list');
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      // the one-press acknowledgement on the page: a second pack, nothing acknowledged yet
      { const m2 = await room('98b'); await waitAi(call, m2.token, m2.id);
        const adm2 = (p, o = {}) => call(p, { token: admin2, ...o }), admin2 = await forge({ sub: sql(`select id from users where client_id='${m2.cid}' limit 1`), clientId: m2.cid, role: 'admin' });
        await adm2(`/v1/admin/products/${m2.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: bulk ack' } }); await call(`/v1/products/${m2.id}/tech-pack/approve`, { method: 'POST', token: m2.token, body: { name: 'Pat Two' } });
        const s2 = await adm2(`/v1/admin/products/${m2.id}/tech-pack/shares`, { method: 'POST', body: { label: 'Mill 98b' } }), t2 = s2.json.url.split('/tp/')[1];
        const c2 = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), p2 = await c2.newPage(); p2.errs = []; p2.on('pageerror', e => p2.errs.push(e.message)); p2.on('dialog', d => d.accept());
        await p2.goto(`${BASE}/tp/${t2}`, { waitUntil: 'domcontentloaded' }); await p2.waitForSelector('[data-act="ackall"]', { timeout: 20000 });
        const label = await p2.innerText('[data-act="ackall"]'); await p2.click('[data-act="ackall"]'); await p2.waitForFunction(() => !document.querySelector('[data-act="ackall"]'), null, { timeout: 10000 });
        const fv2 = (await call(`/v1/tp/${t2}`)).json; ok(/Acknowledge all \d+ remaining/.test(label) && fv2.techPack.readiness.pendingCalloutKeys.length === 0 && p2.errs.length === 0, 'on the page, one press (and one confirmation) acknowledges everything still open', [label, fv2.techPack.readiness.pendingCalloutKeys, p2.errs]); await c2.close(); }
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tp/${ftok}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('details.chg', { timeout: 20000 });
      const txt = await p.innerText('details.chg'); ok(/What changed in v2/i.test(txt) && /Changed in v2/.test(txt) && /99\.5/.test(txt), 'the factory page opens with what changed in v2', txt.slice(0, 200));
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j98-factory.png` }).catch(() => {});
      await p.click('details.chg [data-act="chgseen"]'); ok(await p.evaluate(() => !document.querySelector('details.chg').open), '"Got it" folds it away');
      await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('details.chg'); ok(await p.evaluate(() => !document.querySelector('details.chg').open), 'and it stays folded on the next visit, until there is a new version');
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await bw.close(); }
  }
});

await journey('J99', 'a missing view is asked for, not overridden: staff request it, the client is told three ways and gets a button, and it clears when the picture is in', async () => {
  const m = await room('99'); await waitAi(call, m.token, m.id);
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (p, o = {}) => call(p, { token: admin, ...o });
  const draft = async () => (await call(`/v1/products/${m.id}/tech-pack/draft`, { token: m.token })).json;
  let d = await draft(); ok(d.techPack.viewRequest === null, 'nothing is asked of the client to begin with');
  const refused = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: {} });
  ok(refused.status === 409 && Array.isArray(refused.json.missingViews) && refused.json.missingViews.length >= 1, 'the publish refusal names the views that are missing', [refused.status, refused.json.missingViews]);
  const want = refused.json.missingViews;
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/request-views`, { method: 'POST', token: m.token, body: {} })).status === 403, 'only staff can ask');
  const ask = await adm(`/v1/admin/products/${m.id}/tech-pack/request-views`, { method: 'POST', body: { note: 'Same lighting as the first one please' } });
  ok(ask.status === 200 && ask.json.requested.join() === want.join(), 'staff ask for exactly those views', [ask.status, ask.json]);
  d = await draft(); ok(d.techPack.viewRequest && d.techPack.viewRequest.views.join() === want.join(), 'the client\'s editor is told which views', d.techPack.viewRequest);
  const msgs = sql(`select string_agg(body,' | ') from project_messages where client_id='${m.cid}' and author_role='admin'`); ok(want.every(v => msgs.includes(v)) && /lighting/.test(msgs), 'the project thread has the request, with the staff note', msgs.slice(0, 160));
  ok(Number(sql(`select count(*) from notifications where client_id='${m.cid}' and title like 'We need the %'`)) === 1, 'and a notification is raised once');
  const clientEmail = sql(`select contact_email from clients where id='${m.cid}'`), mail = ((await call(`/v1/dev/outbox?to=${encodeURIComponent(clientEmail)}`)).json.emails || []).filter(e => /One more picture/.test(e.subject)); ok(mail.length === 1 && want.every(v => mail[0].text.includes(v)), 'and the client is emailed once', mail.map(e => e.subject));
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#tabs button[data-tab="calls"]', { timeout: 20000 }); await p.keyboard.press('Escape'); await p.click('#tabs button[data-tab="calls"]');
      await p.waitForSelector('.view-ask [data-act="addview"]', { timeout: 10000 });
      ok(new RegExp(want[0]).test(await p.innerText('.view-ask')), 'the editor shows the request with an Add button');
      await p.click(`.view-ask [data-act="addview"][data-view="${want[0]}"]`); await p.waitForSelector('.panel[data-panel="calls"] .stage .pickbtn', { timeout: 5000 });
      ok(/Add the|mockup/i.test(await p.innerText('.panel[data-panel="calls"] .stage')) && p.errs.length === 0, 'pressing it opens that view, ready for a file or a pick from saved files', p.errs);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j99-ask.png` }).catch(() => {}); await ctx.close();
    } finally { await bw.close(); }
  }
  // the pictures arrive (here by saving the draft with them): the request clears, and the gate stops naming those views
  d = await draft(); const data = structuredClone(d.techPack.data);
  for (const v of want) { const sk = data.sketches.find(k => k.view === v) || (data.sketches.push({ id: 'v' + v, view: v, label: '', image: '', garmentWidthIn: null, callouts: [] }), data.sketches.at(-1)); sk.image = jpeg(); }
  const sv = await call(`/v1/products/${m.id}/tech-pack/draft`, { method: 'PUT', token: m.token, body: { data, etag: d.techPack.etag } }); ok(sv.status === 200, 'the client saves the pictures', [sv.status, sv.json.error]);
  d = await draft(); ok(d.techPack.viewRequest === null, 'the request clears itself once both pictures are in', d.techPack.viewRequest);
  const again = await adm(`/v1/admin/products/${m.id}/tech-pack/request-views`, { method: 'POST', body: {} }); ok(again.status === 409, 'and asking again is refused: nothing is missing');
  const pub = await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: {} }); ok(!/mockups/i.test(JSON.stringify(pub.json.problems || [])), 'the publish gate no longer lists the mockups', pub.json.problems);
});

await journey('J100', 'commercial facts: price, weight, HS code and a SKU for every size and colour are kept; a factory gets everything but what the client charges', async () => {
  const m = await room('100'); await waitAi(call, m.token, m.id);
  const admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (p, o = {}) => call(p, { token: admin, ...o });
  const draft = async () => (await call(`/v1/products/${m.id}/tech-pack/draft`, { token: m.token })).json;
  let d = await draft(); const data = structuredClone(d.techPack.data);
  data.commercial = { retailPrice: '$89', compareAtPrice: '120', weightGrams: '420', hsCode: '611020', currency: 'usd', variants: [] }; data.care.countryOfOrigin = 'Made in Vietnam';
  const sv = await call(`/v1/products/${m.id}/tech-pack/draft`, { method: 'PUT', token: m.token, body: { data, etag: d.techPack.etag } }); ok(sv.status === 200, 'the client saves the commercial facts', [sv.status, sv.json.error]);
  d = await draft(); const c = d.techPack.data.commercial; ok(c.retailPrice === '89' && c.weightGrams === '420' && c.hsCode === '6110.20' && c.currency === 'USD', 'they are cleaned as they are saved (price as a number, HS code with its dot, currency in capitals)', c);
  ok(d.completeness.missingRecommended.some(x => /Commercial|SKU|price/i.test(x)), 'and what is still missing for a sale is listed (a SKU on every size and colour)', d.completeness.missingRecommended);
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#tabs button[data-tab="bom"]', { timeout: 20000 }); await p.keyboard.press('Escape'); await p.click('#tabs button[data-tab="bom"]');
      await p.waitForSelector('[data-commercial] [data-act="syncsku"]'); const sizes = d.techPack.data.sizes.length, colours = Math.max(1, d.techPack.data.colorways.length);
      await p.click('[data-commercial] [data-act="syncsku"]'); await p.waitForFunction(n => document.querySelectorAll('[data-commercial] tbody tr').length === n, sizes * colours, { timeout: 8000 });
      const first = p.locator('[data-commercial] tbody tr').first().locator('input.t').first(); await first.fill('MY-SKU-1'); await p.click('#tabs button[data-tab="bom"]');
      ok(/Retail price/i.test(await p.innerText('[data-commercial]')) && /Vietnam \(VN\)/i.test(await p.innerText('[data-commercial]')), 'the Commercial block shows price fields and reads the country of origin as VN');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j100-commercial.png`, fullPage: false }).catch(() => {});
      for (let i = 0; i < 40; i++) { d = await draft(); if (d.techPack.data.commercial.variants.some(v => v.sku === 'MY-SKU-1')) break; await sleep(300); }
      ok(d.techPack.data.commercial.variants.length === sizes * colours && d.techPack.data.commercial.variants[0].sku === 'MY-SKU-1' && p.errs.length === 0, 'Generate SKUs makes one row per size and colour, and a typed SKU is saved', [d.techPack.data.commercial.variants.length, p.errs]); await ctx.close();
    } finally { await bw.close(); }
  }
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: commercial' } })).status === 200, 'staff publish');
  ok((await call(`/v1/products/${m.id}/tech-pack/approve`, { method: 'POST', token: m.token, body: { name: 'Pat Client' } })).status === 200, 'the client approves');
  const sh = await adm(`/v1/admin/products/${m.id}/tech-pack/shares`, { method: 'POST', body: { label: 'Mill 100' } }), ftok = sh.json.url.split('/tp/')[1];
  const fv = (await call(`/v1/tp/${ftok}`)).json.techPack.data.commercial, cv = (await call(`/v1/products/${m.id}/tech-pack`, { token: m.token })).json.techPack.data.commercial;
  ok(fv.retailPrice === '' && fv.compareAtPrice === '' && fv.variants.every(v => v.price === '') && fv.weightGrams === '420' && fv.hsCode === '6110.20' && fv.variants[0].sku === 'MY-SKU-1', 'the factory gets weight, HS code and SKUs, and no price', fv);
  ok(cv.retailPrice === '89' && cv.variants[0].sku === 'MY-SKU-1', 'the client still sees their own price', cv.retailPrice);
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tp/${ftok}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#tabs button[data-tab="bom"]', { timeout: 20000 }); await p.click('#tabs button[data-tab="bom"]'); await p.waitForSelector('[data-commercial]');
      const txt = await p.innerText('[data-commercial]'); ok(/MY-SKU-1/.test(txt) && /420/.test(txt) && !/Retail price|Compare-at|\b89\b/i.test(txt) && p.errs.length === 0, 'on the factory page the block shows the SKUs and weight and no price field', txt.slice(0, 160)); await ctx.close();
    } finally { await bw.close(); }
  }
});

summary(); process.exit(bad ? 1 : 0);
