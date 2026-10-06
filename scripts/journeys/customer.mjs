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

const bad = summary(); process.exit(bad ? 1 : 0);
