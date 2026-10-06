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
    const browser = await playwright.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="check"]'); await p.click('#tabs button[data-tab="check"]'); await p.waitForSelector('[data-hero] .chk-shots img', { timeout: 10000 });
      ok(await p.locator('[data-hero] .chk-shots img').count() === 2 && /Waiting for approval/i.test(await p.innerText('[data-hero]')), 'the Check tab shows the photo beside the hero, waiting for approval');
      ok(await p.locator('[data-hero] .hero-alts button').count() === 3 && await p.locator('[data-hero] .hero-sw span').count() >= 1, 'with the three tries and the measured colours');
      await p.click('[data-hero] .hero-alts button:nth-child(2)'); await p.waitForSelector('[data-hero] .hero-alts button:nth-child(2).on', { timeout: 8000 }); ok(true, 'picking another try works');
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j65-hero.png`, fullPage: true }).catch(() => {});
      await p.click('[data-act="heroapprove"]'); await p.waitForFunction(() => /approved/i.test(document.querySelector('[data-hero]')?.innerText || ''), null, { timeout: 8000 }); ok(true, 'approving marks it approved');
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await browser.close(); }
  } else {
    ok((await adm(`/v1/admin/tech-pack-heroes/${c.hero.id}/approve`, { method: 'POST', body: {} })).status === 200, 'approve');
  }
  // approval lets the 3D model start by itself, from the render of the pack as it passed
  let mdl = ''; for (let i = 0; i < 40 && mdl !== 'done'; i++) { mdl = sql(`select status from tech_pack_models where product_id='${m.id}' order by created_at limit 1`); await sleep(300); }
  ok(mdl === 'done' && sql(`select source from tech_pack_models where product_id='${m.id}' limit 1`) === 'render', 'once approved, the 3D model started by itself from the render', mdl);
  // new hero images replace the old one and need approving again; there is a daily limit
  const again = await adm(`/v1/admin/products/${m.id}/tech-pack/hero`, { method: 'POST', body: {} }); ok(again.status === 202, 'staff can make new hero images', again.status);
  for (let i = 0; i < 60 && sql(`select status from tech_pack_heroes where id='${again.json.id}'`) === 'generating'; i++) await sleep(300);
  ok(sql(`select status from tech_pack_heroes where id='${again.json.id}'`) === 'ready' && sql(`select count(*) from tech_pack_heroes where product_id='${m.id}' and status='approved'`) === '0', 'the new one is ready and the approval of the old one no longer stands');
  c = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json; ok(c.modelGate.ok === false && /Approve the hero image first/.test(c.modelGate.message), 'so the 3D step is closed again until it is approved');
  let last; for (let i = 0; i < 4; i++) { last = await adm(`/v1/admin/products/${m.id}/tech-pack/hero`, { method: 'POST', body: {} }); if (last.status !== 202) break; for (let k = 0; k < 60 && sql(`select status from tech_pack_heroes where id='${last.json.id}'`) === 'generating'; k++) await sleep(250); }
  ok(last.status === 429 && /4 hero images on this product today/.test(last.json.error), 'the fifth in a day is refused with a sentence', [last.status, last.json.error]);
});

const bad = summary(); process.exit(bad ? 1 : 0);
