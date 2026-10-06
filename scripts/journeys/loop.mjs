// The design assistant and the developer assistant working on a pack, on a server whose draft carries a flaw the fixture reviewer finds (server E).
// The exchange runs slowly there so the pop-up can be watched.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, forge, sql, stamp } from './lib.mjs';
const BASE = 'http://127.0.0.1:3128', call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `jl${tag}-${stamp}-${++n}@chaos.test`;
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
async function room(tag) { const r = await call('/v1/public/start', { body: { email: em(tag), name: 'Loop Room', title: 'Layer runner', photos: [runner] } }); return { token: r.json.token, id: r.json.product.id, cid: r.json.client.id, email: r.json.client ? undefined : undefined, r }; }
const loopOf = async (token, id) => (await call(`/v1/products/${id}/tech-pack/draft`, { token })).json.techPack.loop;
async function waitLoop(token, id, ms = 40000) { const t0 = Date.now(); let lp = null; while (Date.now() - t0 < ms) { lp = await loopOf(token, id); if (lp && lp.status !== 'running') return lp; await sleep(400); } return lp; }

await journey('J59', 'the exchange: after the draft the developer assistant tests it, the design assistant fixes the wording, the score goes up, and every change can be undone', async () => {
  const m = await room('59'), admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  // watch it happen: the client's own feed shows the exchange growing event by event
  let seen = [], lp = null; const t0 = Date.now();
  while (Date.now() - t0 < 45000) { lp = await loopOf(m.token, m.id); if (lp) seen.push(lp.events.length); if (lp && lp.status !== 'running') break; await sleep(350); }
  ok(lp && lp.status === 'done', 'the exchange ran by itself after the draft', lp && [lp.status, lp.error]);
  ok(seen.some((x, i) => i && x > seen[i - 1]) && new Set(seen).size >= 4, 'and it could be followed while it ran: the event list grew step by step', [...new Set(seen)]);
  ok(lp.startScore === 58 && lp.finalScore === 92 && lp.rounds === 1, 'the developer assistant scored 58, the design assistant answered, and the second test scored 92', [lp.startScore, lp.finalScore, lp.rounds]);
  ok(lp.events.every((e, i) => e.id === i && e.at && e.text) && lp.events[0].agent === 'design' && lp.events.at(-1).kind === 'done', 'the events are numbered, timed and written out, from the design assistant\'s first line to "ready"');
  const kinds = lp.events.map(e => `${e.agent}:${e.kind}`); ok(['developer:verdict', 'developer:finding', 'design:decision', 'design:change'].every(k => kinds.includes(k)), 'they include a verdict, a finding, a decision and a change', kinds);
  ok(lp.events.filter(e => e.kind === 'verdict').map(e => e.score).join() === '58,92', 'the two verdicts carry their scores');
  const pack = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data;
  ok(lp.changes.length === 1 && /needs-fix/.test(lp.changes[0].from) && !/needs-fix/.test(lp.changes[0].to) && !pack.bom.some(r => /needs-fix/.test(`${r.notes} ${r.spec}`)), 'one change: what it was, what it became, and the pack carries it', lp.changes);
  ok(pack.pom.length > 0 && pack.pom.every(r => r.tolerance && Object.keys(r.values).length === pack.sizes.length), 'measurements and tolerances are whole');
  ok((await call(`/v1/admin/tech-pack-loops/${lp.id}/undo`, { method: 'POST', token: m.token, body: {} })).status === 403 && (await call(`/v1/admin/products/${m.id}/tech-pack/loop`, { method: 'POST', token: m.token, body: {} })).status === 403, 'a client can neither undo nor hand back');
  // undo
  const u = await adm(`/v1/admin/tech-pack-loops/${lp.id}/undo`, { method: 'POST', body: { changeId: lp.changes[0].id } }); ok(u.status === 200 && u.json.reverted === 1, 'staff undo the change', u.json);
  const back = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack; ok(back.data.bom.some(r => /needs-fix/.test(`${r.notes} ${r.spec}`)) && back.loop.changes[0].undone === true && back.loop.events.at(-1).kind === 'undo', 'the field is as it was, the change is marked undone, and the log says so');
  ok((await adm(`/v1/admin/tech-pack-loops/${lp.id}/undo`, { method: 'POST', body: {} })).status === 409, 'undoing again says there is nothing left');
  // a person's edit is never overwritten: hand back, then edit the field, then undo
  const go = await adm(`/v1/admin/products/${m.id}/tech-pack/loop`, { method: 'POST', body: {} }); ok(go.status === 202 && go.json.id, 'staff hand the pack back', go.json);
  const second = await adm(`/v1/admin/products/${m.id}/tech-pack/loop`, { method: 'POST', body: {} }); ok(second.status === 409, 'a second hand-back while the assistants are working is refused', second.status);
  let l2; for (let i = 0; i < 60; i++) { l2 = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json.loop; if (l2 && l2.id === go.json.id && l2.status !== 'running') break; await sleep(400); }
  ok(l2.status === 'done' && l2.startScore === 58 && l2.finalScore === 92 && l2.changes.length === 1, 'the hand-back goes through the same steps', l2 && [l2.status, l2.startScore, l2.finalScore]);
  const cur = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data; const row = cur.bom.findIndex(r => /Reconciled/.test(`${r.notes} ${r.spec}`)); cur.bom[row].spec = 'Hand-edited by staff'; await adm(`/v1/admin/products/${m.id}/tech-pack`, { method: 'PUT', body: { data: cur } });
  const stale = await adm(`/v1/admin/tech-pack-loops/${l2.id}/undo`, { method: 'POST', body: {} }); ok(stale.status === 409 && /edited since/.test(stale.json.error), 'undoing over a field a person edited since is refused with a plain message', stale.json);
  ok((await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data.bom[row].spec === 'Hand-edited by staff', 'and their edit stays');
  // activity and notifications: the exchange leaves a trace, not a flood
  ok(Number(sql(`select count(*) from activities where product_id='${m.id}' and summary like 'Design and developer assistants went over%'`)) >= 2, 'each exchange is on the product\'s activity');
  ok(sql(`select count(*) from tech_pack_checks where loop_id='${lp.id}' and status='done'`) === '2', 'each exchange ran two checks, both finished');
  // the pack now reads as the photo (92): its final render went to the 3D service by itself
  let mdl = ''; for (let i = 0; i < 40 && mdl !== 'done'; i++) { mdl = sql(`select status from tech_pack_models where product_id='${m.id}' order by created_at limit 1`); await sleep(300); }
  ok(mdl === 'done', 'the 3D model was made by itself once the pack passed', mdl);
  const mr = sql(`select source||'|'||source_score||'|'||(source_check_id=(select final_check_id from tech_pack_loops where id='${lp.id}'))::text from tech_pack_models where product_id='${m.id}' order by created_at limit 1`);
  ok(mr === 'render|92|true', 'it was made from the render of the pack as negotiated (the final check, score 92), not from the photo', mr);
  ok(lp.events.some(e => /final render to Meshy/i.test(e.text)), 'and the exchange said it was sending that render');
  // the second hand-back changed the pack again, so it earns a second model; a hand-back that changes nothing does not (J60)
  let cnt = ''; for (let i = 0; i < 20 && cnt !== '2'; i++) { cnt = sql(`select count(*) from tech_pack_models where product_id='${m.id}'`); await sleep(250); }
  ok(cnt === '2' && sql(`select count(*) from tech_pack_models where product_id='${m.id}' and source='render'`) === '2', 'a hand-back that changed the pack made a second model from its new render, and no more than that', cnt);
});

await journey('J60', 'a change that makes the score worse is taken back; a pack that reads fine is left alone', async () => {
  const m = await room('60'), admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  await waitLoop(m.token, m.id);
  // plant the hook that makes the design assistant's fix backfire
  const d = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data; d.bom[0].spec = (d.bom[0].spec || '') + ' [needs-fix]'; d.style.fabricSummary = '[make-worse] ' + (d.style.fabricSummary || '');
  await adm(`/v1/admin/products/${m.id}/tech-pack`, { method: 'PUT', body: { data: d } });
  const go = await adm(`/v1/admin/products/${m.id}/tech-pack/loop`, { method: 'POST', body: {} }); ok(go.status === 202, 'hand back', go.status);
  let lp; for (let i = 0; i < 60; i++) { lp = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json.loop; if (lp && lp.id === go.json.id && lp.status !== 'running') break; await sleep(400); }
  ok(lp.status === 'done' && lp.startScore === 58 && lp.finalScore === 58, 'the score after the change was 35, so the final score is the original 58', [lp.status, lp.startScore, lp.finalScore]);
  ok(lp.changes.length >= 1 && lp.changes.every(c => c.undone === true) && lp.events.some(e => /taking those changes back/i.test(e.text)), 'every change it tried is marked undone and the exchange says it took them back', lp.changes.length);
  ok(lp.outcome === 'needs-review' && /^Not ready: 58\/100/.test(lp.events.at(-1).text) && !lp.events.some(e => /^Ready/.test(e.text)), 'and it does not say ready: it says not ready, with the score and the bar', lp.events.at(-1).text);
  const afterWorse = sql(`select count(*) from tech_pack_models where product_id='${m.id}'`); ok(!lp.events.some(e => /to Meshy/i.test(e.text)), 'a pack that still does not look like the photo is not sent to the 3D service', afterWorse);
  const man = await adm(`/v1/admin/products/${m.id}/tech-pack/model`, { method: 'POST', body: {} }); ok(man.status === 409 && /does not look like the photo yet \(58\/100, it needs 90\)/.test(man.json.error), 'and staff pressing the button are told why, with the score and the bar', [man.status, man.json.error]);
  const ph = await adm(`/v1/admin/products/${m.id}/tech-pack/model`, { method: 'POST', body: { source: 'photo' } }); ok(ph.status === 202 || ph.status === 409, 'the client photo is a deliberate alternative', ph.status);
  const pk = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data; ok(/needs-fix/.test(pk.bom[0].spec) && !/\[worse\]/.test(JSON.stringify(pk.bom)), 'the pack is back as it was', pk.bom[0].spec);
  // a pack that reads fine
  const m2 = await room('60b'), l2 = await waitLoop(m2.token, m2.id); const a2 = await forge({ sub: sql(`select id from users where client_id='${m2.cid}' limit 1`), clientId: m2.cid, role: 'admin' });
  const pk2 = (await call(`/v1/admin/products/${m2.id}/tech-pack`, { token: a2 })).json.techPack.data; pk2.bom[0].spec = 'Mesh base with windowed overlays'; await call(`/v1/admin/products/${m2.id}/tech-pack`, { method: 'PUT', token: a2, body: { data: pk2 } });
  const g2 = await call(`/v1/admin/products/${m2.id}/tech-pack/loop`, { method: 'POST', token: a2, body: {} }); let x; for (let i = 0; i < 60; i++) { x = (await call(`/v1/admin/products/${m2.id}/tech-pack/check`, { token: a2 })).json.loop; if (x && x.id === g2.json.id && x.status !== 'running') break; await sleep(400); }
  ok(x.status === 'done' && x.startScore === 92 && x.changes.length === 0 && x.rounds === 0 && /Nothing I would change/.test(x.events.map(e => e.text).join(' ')), 'a pack that already reads fine gets no changes, and the design assistant says so', x && [x.startScore, x.changes.length, x.rounds]);
  ok(sql(`select count(*) from tech_pack_models where product_id='${m2.id}'`) === '1', 'a hand-back that changes nothing does not make another 3D model');
  void l2;
});

await journey('J61', 'the pop-up: both assistants, a live exchange, a score that counts up, and a way out', async () => {
  if (!playwright) { ok(true, 'skipped: Playwright is not available'); return; }
  const { chromium } = playwright, browser = await chromium.launch();
  try {
    for (const [name, viewport, mobile] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
      const m = await room('61' + name[0]), ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.xchg.on', { timeout: 15000 }); ok(true, `${name}: the pop-up opens as soon as the pack starts building`);
      ok(await p.locator('.xag.design').count() === 1 && await p.locator('.xag.developer').count() === 1 && await p.locator('.xchg-rail li').count() === 6, `${name}: both assistants and the six steps are there`);
      ok(await p.locator('.xchg-cta').isHidden(), `${name}: "See the tech pack" is not offered while they work`);
      await p.waitForFunction(() => document.querySelectorAll('.xchg .xm.developer').length >= 1, null, { timeout: 30000 }); ok(await p.locator('.xchg .xm.design').count() >= 1, `${name}: both assistants have spoken`);
      await p.waitForFunction(() => /^\d+$/.test(document.querySelector('.xnum')?.textContent || ''), null, { timeout: 30000 }); await p.waitForFunction(() => document.querySelector('.xchg-score.has'), null, { timeout: 5000 }); ok(true, `${name}: the score ring fills once the first test is in`);
      await p.waitForFunction(() => document.querySelectorAll('.xchg .xm.kind-finding').length >= 1, null, { timeout: 10000 }).catch(() => {}); // the findings arrive a beat after the score
      ok(await p.locator('.xchg .xm.kind-finding').count() >= 1, `${name}: the developer assistant's findings are shown`);
      const w = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, card: document.querySelector('.xchg-card').getBoundingClientRect().width })); ok(w.doc <= w.win + 1 && w.card <= w.win + 1, `${name}: nothing spills sideways`, w);
      await p.waitForSelector('.xchg.done', { timeout: 45000 }); ok(await p.locator('.xchg-cta').isVisible() && /Ready/.test(await p.innerText('.xchg-title')), `${name}: at the end it says ready and offers the pack`);
      ok(await p.locator('.xm.kind-change .xd').count() >= 1 && await p.locator('.xm.kind-change .xa').count() >= 1, `${name}: the change shows what it was and what it became`);
      await p.waitForFunction(() => document.querySelector('.xnum')?.textContent === '92', null, { timeout: 5000 }); ok(/\+34/.test(await p.innerText('.xdelta')), `${name}: the score ends at 92 with the gain shown`);
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j61-${name}-done.png` }).catch(() => {});
      await p.click('.xchg-cta'); await p.waitForSelector('.xchg', { state: 'hidden', timeout: 4000 }); ok(await p.locator('#sheet .panel.on').isVisible(), `${name}: the button closes it and the tech pack is there`);
      ok(!/needs-fix/i.test(await p.innerText('#sheet')), `${name}: the pack on screen already has the fix`);
      ok(/Tested by the developer assistant: 92\/100/.test(await p.innerText('#noteSlot')), `${name}: a note under the title records the result`);
      ok(p.errs.length === 0, `${name}: no script errors`, p.errs); await ctx.close();
    }
    // hide and escape
    const m = await room('61h'), ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, m.token);
    const p = await ctx.newPage(); await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('.xchg.on'); await p.keyboard.press('Escape'); await p.waitForSelector('.xchg', { state: 'hidden', timeout: 3000 }); ok(true, 'Escape hides the pop-up');
    await p.waitForSelector('.ai-banner [data-act="xshow"]', { timeout: 15000 }); await p.click('.ai-banner [data-act="xshow"]'); await p.waitForSelector('.xchg.on', { timeout: 3000 }); ok(true, 'and a note under the title brings it back while the assistants are still working');
    await p.click('.xchg-hide'); await p.waitForSelector('.xchg', { state: 'hidden', timeout: 3000 }); ok(true, 'the Hide button hides it');
    await ctx.close();
  } finally { await browser.close(); }
});

await journey('J62', 'the Check tab for staff: the exchange, what changed with an Undo, and a hand-back button that opens the pop-up', async () => {
  if (!playwright) { ok(true, 'skipped: Playwright is not available'); return; }
  const m = await room('62'), admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }); await waitLoop(m.token, m.id);
  const { chromium } = playwright, browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="check"]');
    ok(await p.locator('.xchg.on').count() === 0, 'staff opening a pack whose exchange has finished are not interrupted by the pop-up');
    await p.click('#tabs button[data-tab="check"]'); await p.waitForSelector('.chk-ex', { timeout: 10000 });
    ok(await p.locator('.chk-ev.design').count() >= 1 && await p.locator('.chk-ev.developer').count() >= 1 && /58 → 92/.test(await p.innerText('[data-panel="check"] .chk-h >> nth=-2').catch(() => '') + await p.innerText('[data-panel="check"]')), 'the exchange is listed with both assistants and the score going 58 → 92');
    ok(await p.locator('.chk-chg').count() === 1 && /Mesh base/.test(await p.innerText('.chk-chg')) && await p.locator('.chk-chg [data-act="undochange"]').count() === 1, 'what the design assistant changed is listed with its reason and an Undo button');
    await p.click('.chk-chg [data-act="undochange"]'); await p.waitForSelector('.chk-chg.undone', { timeout: 8000 }); ok(true, 'Undo marks it undone');
    ok(Number(sql(`select count(*) from tech_packs where product_id='${m.id}' and data::text like '%needs-fix%'`)) === 1, 'and the pack has the old wording back');
    await p.waitForSelector('[data-act="handback"]:not([disabled])'); await p.click('[data-act="handback"]'); await p.waitForSelector('.xchg.on', { timeout: 8000 }); ok(true, 'Hand back opens the pop-up');
    await p.waitForSelector('.xchg.done', { timeout: 45000 }); ok(await p.locator('.xnum').innerText() === '92', 'it runs through to 92');
    await p.click('.xchg-cta'); await p.waitForSelector('.xchg', { state: 'hidden', timeout: 4000 });
    await p.waitForFunction(() => document.querySelectorAll('.chk-chg').length >= 1 && !document.querySelector('.chk-chg.undone'), null, { timeout: 10000 }); ok(true, 'the Check tab shows the new change');
    await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j62-check-exchange.png`, fullPage: true }).catch(() => {});
    ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
  } finally { await browser.close(); }
});

await journey('J64', 'the bar is 90: the exchange goes on round after round until it gets there, and a pack that cannot is never called ready', async () => {
  const m = await room('64'), admin = await forge({ sub: sql(`select id from users where client_id='${m.cid}' limit 1`), clientId: m.cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  await waitLoop(m.token, m.id);
  const run = async () => { const go = await adm(`/v1/admin/products/${m.id}/tech-pack/loop`, { method: 'POST', body: {} }); let lp; for (let i = 0; i < 120; i++) { lp = (await adm(`/v1/admin/products/${m.id}/tech-pack/check`)).json.loop; if (lp && lp.id === go.json.id && lp.status !== 'running') break; await sleep(400); } return lp; };
  const setPack = async (fabric) => { const d = (await adm(`/v1/admin/products/${m.id}/tech-pack`)).json.techPack.data; d.style.fabricSummary = fabric; d.bom.forEach(r => { r.spec = (r.spec || '').replace(/\s*\[needs-fix\]/g, ''); r.notes = ''; }); await adm(`/v1/admin/products/${m.id}/tech-pack`, { method: 'PUT', body: { data: d } }); };
  // a pack that improves each round: 60 → 72 → 84 → 95, so it takes three rounds, and only then is it ready
  await setPack('[climb] Mesh upper');
  const up = await run();
  ok(up.status === 'done' && up.startScore === 60 && up.finalScore === 95 && up.rounds === 3 && up.outcome === 'passed', 'a pack that starts at 60 is worked on for three rounds and ends at 95: ready', up && [up.status, up.startScore, up.finalScore, up.rounds, up.outcome]);
  ok(up.events.filter(e => e.kind === 'verdict').map(e => e.score).join() === '60,72,84,95', 'every test is on the record: 60, 72, 84, 95', up.events.filter(e => e.kind === 'verdict').map(e => e.score));
  ok(/^Ready: 95\/100, above the bar of 90/.test(up.events.at(-1).text) && up.events.some(e => /Round 2/.test(e.text)), 'it says ready only at the end, and shows the later rounds', up.events.at(-1).text);
  ok(up.events.filter(e => e.kind === 'verdict').slice(1, 3).every(e => /Still short of 90/.test(e.text)), 'and the tests below the bar say they are still short of 90');
  const modelsBefore = sql(`select count(*) from tech_pack_models where product_id='${m.id}'`);
  // a pack that never improves: two rounds with no gain and it stops, calling itself not ready
  await setPack('[stuck] Mesh upper');
  const st = await run();
  ok(st.status === 'done' && st.startScore === 62 && st.finalScore === 62 && st.rounds === 2 && st.outcome === 'needs-review', 'a pack stuck at 62 gets two rounds, then the exchange stops and hands it to a person', st && [st.status, st.startScore, st.finalScore, st.rounds, st.outcome]);
  const last = st.events.at(-1); ok(last.kind === 'done' && /^Not ready: 62\/100, and the bar is 90/.test(last.text) && !st.events.some(e => /^Ready/.test(e.text)), 'the last line says not ready, with the score and the bar, and nothing says ready', last.text);
  ok(st.events.some(e => /Still open:/.test(e.text)), 'and it lists what is still open');
  const q = (await adm('/v1/admin/dashboard')).json.queues, mine = (q.approvals || []).filter(x => x.kind === 'check' && x.productId === m.id);
  ok(mine.length === 1 && /not ready \(62\/100, the bar is 90\)/.test(mine[0].title), 'the console queue lists it as not ready, with the score and the bar', mine.map(x => x.title));
  ok(Number(sql(`select count(*) from notifications where entity_id='${m.id}' and title like 'Needs a person:%'`)) === 0, 'and it is not a message: only a pack far from its photo is');
  ok(sql(`select count(*) from tech_pack_models where product_id='${m.id}'`) === modelsBefore, 'and no 3D model is made from a pack below the bar');
  // staff see it on the screen too
  if (playwright) {
    const { chromium } = playwright, browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
      await p.goto(`${BASE}/tech-packs/${m.id}`, { waitUntil: 'networkidle' }); await p.waitForSelector('#tabs button[data-tab="check"]'); await p.click('#tabs button[data-tab="check"]'); await p.waitForSelector('.chk-ex', { timeout: 10000 });
      ok(/Not ready · the bar is 90/i.test(await p.innerText('[data-panel="check"]')), 'the Check tab says Not ready, with the bar');
      await p.waitForSelector('[data-act="handback"]:not([disabled])'); await p.click('[data-act="handback"]'); await p.waitForSelector('.xchg.on', { timeout: 8000 });
      await p.waitForSelector('.xchg.done', { timeout: 60000 });
      ok(/Not ready/i.test(await p.innerText('.xchg-title')) && /Review the pack/.test(await p.innerText('.xchg-cta')) && /below the bar of 90/.test(await p.innerText('.xchg-wait')), 'the pop-up ends on "Not ready: needs a person", never "Ready"', await p.innerText('.xchg-title'));
      await p.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j64-not-ready.png` }).catch(() => {});
      ok(p.errs.length === 0, 'no script errors', p.errs); await ctx.close();
    } finally { await browser.close(); }
  }
});

const bad = summary(); process.exit(bad ? 1 : 0);
