// The studio on a server where it runs by itself (server F): the hero image is made from the photo inside the exchange, picked from three tries,
// waits for a person's approval, and only an approved one lets the 3D model start.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, forge, sql, stamp } from './lib.mjs';
const BASE = 'http://127.0.0.1:3129', call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `js${tag}-${stamp}-${++n}@chaos.test`;
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
async function room(tag) { const r = await call('/v1/public/start', { body: { email: em(tag), name: 'Studio Room', title: 'Layer runner', photos: [runner] } }); return { token: r.json.token, id: r.json.product.id, cid: r.json.client.id }; }
const loopOf = async (token, id) => (await call(`/v1/products/${id}/tech-pack/draft`, { token })).json.techPack.loop;
async function waitLoop(token, id, ms = 60000) { const t0 = Date.now(); let lp = null; while (Date.now() - t0 < ms) { lp = await loopOf(token, id); if (lp && lp.status !== 'running') return lp; await sleep(400); } return lp; }

await journey('J65', 'the hero image: made from the photo inside the exchange, three tries, waits for approval, and only an approved one lets the 3D model start', async () => {
  const m = await room('65'), admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const lp = await waitLoop(m.token, m.id);
  ok(lp && lp.status === 'done', 'the exchange ran', lp && [lp.status, lp.error]);
  const texts = lp.events.map(e => e.text);
  ok(texts.some(t => /clean reference picture/i.test(t)) && texts.some(t => /^Reference picture ready: \d+\/100 faithful to the photo/.test(t)), 'it made a reference picture from the photo first, and said how faithful it is', texts.slice(0, 4));
  ok(lp.outcome === 'passed' && /One step left: a person approves the reference picture/.test(lp.events.at(-1).text) && !/^Ready/.test(lp.events.at(-1).text), 'the score passed the bar, but it does not say ready: a person still has to approve the picture', lp.events.at(-1).text);
  ok(sql(`select count(*) from tech_pack_models where product_id='${m.id}'`) === '0', 'and no 3D model was made from an unapproved picture');
  let c = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json;
  ok(c.hero && c.hero.status === 'ready' && c.hero.candidates.length === 3 && /^data:image\/jpeg/.test(c.hero.image) && c.hero.candidates.every(a => /^data:image\/jpeg/.test(a.thumb)), 'the hero is ready with three tries, each with a picture', c.hero && [c.hero.status, c.hero.candidates.length]);
  ok(c.hero.measured.length >= 1 && c.hero.measured.every(x => /^#[0-9a-f]{6}$/.test(x.hex) && x.name), 'with the colours measured from the photo, named', c.hero.measured);
  ok(c.modelGate.ok === false && /Approve the hero image first/.test(c.modelGate.message), 'the 3D step says why it is closed', c.modelGate);
  ok(Number(sql(`select count(*) from tech_pack_checks where product_id='${m.id}' and hero_id is not null`)) >= 2, 'the tests drew their renders guided by the hero');
  const cw = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data.colorways; ok(cw.some(x => /measured from the pixels/.test(x.notes)), 'the pack\'s colourways carry colours measured from the pixels', cw.map(x => x.notes));
  ok((await call(`/v1/admin/tech-pack-heroes/${c.hero.id}/approve`, { method: 'POST', token: m.token, body: {} })).status === 403 && (await call(`/v1/admin/products/${m.id}/tech-pack/hero`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a client can neither approve nor make a hero');
  if (playwright) {
    // on a phone: the tries are big enough to see, each has a "Use this one" button, and choosing moves the tick
    const pb = await playwright.chromium.launch();
    try {
      const pctx = await pb.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await pctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const pp = await pctx.newPage(); pp.errs = []; pp.on('pageerror', e => pp.errs.push(e.message));
      await pp.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#tabs button[data-tab="check"]'); await pp.click('#tabs button[data-tab="check"]'); await pp.waitForSelector('[data-hero] .hero-alts figure', { timeout: 10000 });
      ok(await pp.locator('[data-hero] .hero-alts figure').count() === 3 && await pp.locator('[data-hero] .hero-alts figure button').count() === 3, 'on a phone the three tries each have a "Use this one" button');
      const box = await pp.locator('[data-hero] .hero-alts figure img').first().boundingBox(); ok(box.width >= 100 && box.width <= 390, 'and are big enough to judge', box);
      const third = pp.locator('[data-hero] .hero-alts figure:nth-child(3) button'); await third.scrollIntoViewIfNeeded(); await third.tap(); await pp.waitForSelector('[data-hero] .hero-alts figure:nth-child(3).on', { timeout: 8000 });
      ok(sql(`select chosen from tech_pack_heroes where product_id='${m.id}' and status in ('ready','approved') order by created_at desc limit 1`) === '2', 'tapping it chooses that one');
      ok(pp.errs.length === 0, 'no script errors', pp.errs); await pctx.close();
    } finally { await pb.close(); }
  }
  // sharing: whatever the score, staff can put the picture in the client's project so it is on their hub
  const projectId = sql(`select project_id from products where id='${m.id}'`);
  const sh = await adm(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', body: { source: 'hero', id: c.hero.id } });
  ok(sh.status === 201 && sh.json.shared, 'staff can share the hero with the client while it is still waiting for approval', [sh.status, sh.json]);
  const thread = (await call(`/v1/projects/${projectId}/thread`, { token: m.token })).json, shared = thread.messages.find(x => x.id === sh.json.messageId);
  ok(shared && shared.author_role === 'admin' && /work-in-progress/.test(shared.body) && shared.files.length === 1 && /\.jpg$/.test(shared.files[0].original_name), 'the client sees it in their project: a message from Future Basics with the picture attached', shared);
  const dl = await call(`/v1/project-files/${shared.files[0].id}/download`, { token: m.token }); ok(dl.status === 200, 'and can open the picture', dl.status);
  ok(sql(`select count(*) from notifications where client_id='${m.cid}' and title like 'New picture in%'`) === '1', 'and is notified');
  ok(sql(`select count(*) from tech_pack_heroes where id='${c.hero.id}' and shared_at is not null`) === '1', 'the card remembers it was shared');
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', token: m.token, body: { source: 'hero', id: c.hero.id } })).status === 403, 'a client cannot share on staff\'s behalf');
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', body: { source: 'nope' } })).status === 400, 'a bad request is refused plainly');
  const chk = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json.latest, sc = await adm(`/v1/admin/products/${m.id}/tech-pack/share-render`, { method: 'POST', body: { source: 'check', id: chk.id, index: 0, message: 'The latest render, from the pack alone.' } });
  ok(sc.status === 201, 'a spec-check render can be shared too', [sc.status, sc.json]);
  if (playwright) {
    const browser = await playwright.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="check"]'); await p.click('#tabs button[data-tab="check"]'); await p.waitForSelector('[data-hero] .chk-shots img', { timeout: 10000 });
      ok(await p.locator('[data-hero] .chk-shots img').count() === 2 && /Waiting for approval/i.test(await p.innerText('[data-hero]')), 'the Check tab shows the photo beside the hero, waiting for approval');
      ok(await p.locator('[data-hero] .hero-alts figure').count() === 3 && await p.locator('[data-hero] .hero-sw span').count() >= 1, 'with the three tries and the measured colours');
      await p.click('[data-hero] .hero-alts figure:nth-child(2) button'); await p.waitForSelector('[data-hero] .hero-alts figure:nth-child(2).on', { timeout: 8000 }); ok(true, 'picking another try works');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j65-hero.png`, fullPage: true }).catch(() => {});
      const before = Number(sql(`select count(*) from project_messages where project_id='${projectId}' and author_role='admin'`)); p.on('dialog', d => d.accept());
      await p.click('[data-act="heroshare"]'); for (let i = 0; i < 20 && Number(sql(`select count(*) from project_messages where project_id='${projectId}' and author_role='admin'`)) === before; i++) await sleep(300);
      ok(Number(sql(`select count(*) from project_messages where project_id='${projectId}' and author_role='admin'`)) === before + 1, 'the Share with client button, after a confirmation, posts the picture to the project');
      await p.click('[data-act="heroapprove"]'); await p.waitForFunction(() => /approved/i.test(document.querySelector('[data-hero]')?.innerText || ''), null, { timeout: 8000 }); ok(true, 'approving marks it approved');
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await browser.close(); }
  } else {
    ok((await adm(`/v1/admin/tech-pack-heroes/${c.hero.id}/approve`, { method: 'POST', body: {} })).status === 200, 'approve');
  }
  // approval lets the 3D model start by itself, from the render of the pack as it passed
  let mdl = ''; for (let i = 0; i < 40 && mdl !== 'done'; i++) { mdl = sql(`select status from tech_pack_models where product_id='${m.id}' order by created_at limit 1`); await sleep(300); }
  ok(mdl === 'done' && sql(`select source from tech_pack_models where product_id='${m.id}' limit 1`) === 'hero', 'once approved, the 3D model started by itself from the approved hero image', mdl);
  // new hero images replace the old one and need approving again; there is a daily limit
  const again = await adm(`/v1/admin/products/${m.id}/tech-pack/hero`, { method: 'POST', body: {} }); ok(again.status === 202, 'staff can make new hero images', again.status);
  for (let i = 0; i < 60 && sql(`select status from tech_pack_heroes where id='${again.json.id}'`) === 'generating'; i++) await sleep(300);
  ok(sql(`select status from tech_pack_heroes where id='${again.json.id}'`) === 'ready' && sql(`select count(*) from tech_pack_heroes where product_id='${m.id}' and status='approved'`) === '0', 'the new one is ready and the approval of the old one no longer stands');
  c = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json; ok(c.modelGate.ok === false && /Approve the hero image first/.test(c.modelGate.message), 'so the 3D step is closed again until it is approved');
  let last; for (let i = 0; i < 4; i++) { last = await adm(`/v1/admin/products/${m.id}/tech-pack/hero`, { method: 'POST', body: {} }); if (last.status !== 202) break; for (let k = 0; k < 60 && sql(`select status from tech_pack_heroes where id='${last.json.id}'`) === 'generating'; k++) await sleep(250); }
  ok(last.status === 429 && /4 hero images on this product today/.test(last.json.error), 'the fifth in a day is refused with a sentence', [last.status, last.json.error]);
});

await journey('J67', 'the colourways by labelled part: once the hero is approved the product is broken up into parts, each colourway colours the parts on their own, and the pictures arrive on the pack with their parts and Pantone C codes', async () => {
  const m = await room('67'), admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const lp = await waitLoop(m.token, m.id); ok(lp && lp.status === 'done', 'the exchange ran', lp && [lp.status, lp.error]);
  let c = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json;
  ok(c.colourways === null, 'before the hero is approved nothing has been drawn: no pictures made from a picture nobody signed off', c.colourways);
  const before = sql(`select updated_at from tech_packs where product_id='${m.id}'`);
  ok((await adm(`/v1/admin/tech-pack-heroes/${c.hero.id}/approve`, { method: 'POST', body: {} })).status === 200, 'staff approve the hero');
  for (let i = 0; i < 80; i++) { c = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json; if (c.colourways && !c.colourways.running) break; await sleep(300); }
  ok(c.colourways && c.colourways.status === 'done' && c.colourways.made >= 1, 'approving the hero starts the colourway run by itself, and it finishes with pictures', c.colourways);
  ok(/approved hero/.test(c.colourways.reference || ''), 'drawn from the approved hero', c.colourways.reference);
  const data = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data, tiles = data.renderings.filter(r => /^cw-/.test(r.id));
  ok(data.parts.length >= 3 && data.parts.every(x => x.label && /^#[0-9a-f]{6}$/.test(x.hex) && /^PANTONE .+ C$/i.test(x.code)), 'the pack lists the product part by part, each with its colour and a Pantone C code', data.parts);
  ok(tiles.length === c.colourways.made && tiles.every(t => /^data:image\/jpeg/.test(t.image) && t.parts.length === data.parts.length && t.parts.some(x => x.changed) && /Drawn from the approved hero/.test(t.note)), 'each colourway picture carries its own part-by-part colours', tiles.map(t => [t.id, t.parts.length]));
  ok(tiles.every(t => t.parts.filter(x => x.changed).every(x => /^PANTONE .+ C$/i.test(x.code))), 'with Pantone C codes matched from the hex of each part');
  ok(sql(`select updated_at from tech_packs where product_id='${m.id}'`) === before, 'pictures arriving do not count as an edit: the spec check is not made to look out of date');
  ok(c.stale === false, 'and the check is not marked stale', c.stale);
  ok((await call(`/v1/admin/products/${m.id}/tech-pack/colourways`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a client cannot start a run on staff\'s button');
  const again = await adm(`/v1/admin/products/${m.id}/tech-pack/colourways`, { method: 'POST', body: {} }); ok(again.status === 202, 'staff can draw them again', [again.status, again.json]);
  for (let i = 0; i < 80 && sql(`select status from tech_pack_colourways where id='${again.json.id}'`) === 'running'; i++) await sleep(300);
  ok(sql(`select status from tech_pack_colourways where id='${again.json.id}'`) === 'done' && (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data.renderings.filter(r => /^cw-/.test(r.id)).length === tiles.length, 'and the pictures are replaced, not doubled');
  const client = (await call(`/v1/products/${m.id}/tech-pack/draft/colourways`, { token: m.token })); ok(client.status === 200 && client.json.run && client.json.parts.length >= 3, 'the client sees the same run and parts on their draft', client.status);
  if (playwright) {
    const pb = await playwright.chromium.launch();
    try {
      const pctx = await pb.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await pctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const pp = await pctx.newPage(); pp.errs = []; pp.on('pageerror', e => pp.errs.push(e.message));
      await pp.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#sheet .panel.on');
      ok(await pp.locator('.rend .cwparts li').count() >= 3, 'on the pack, each colourway picture lists its parts and codes beneath it');
      ok(await pp.locator('.ptab tbody tr').count() >= 3, 'with the part-by-part table of the product');
      await pp.locator('.rend').first().scrollIntoViewIfNeeded(); await pp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j67-style.png` }).catch(() => {});
      await pp.click('#tabs button[data-tab="check"]'); await pp.waitForSelector('[data-colourways]', { timeout: 8000 });
      ok(/drawn from the approved hero/i.test(await pp.innerText('[data-colourways]')) && await pp.locator('[data-colourways] .ptab tbody tr').count() >= 3, 'the Check tab says what was drawn and from what, and lists the parts');
      await pp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j67-check.png` }).catch(() => {});
      const over = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(over <= 1, 'and nothing runs off a phone screen', over);
      ok(pp.errs.length === 0, 'no script errors', pp.errs); await pctx.close();
    } finally { await pb.close(); }
  }
});

const bad = summary(); process.exit(bad ? 1 : 0);
