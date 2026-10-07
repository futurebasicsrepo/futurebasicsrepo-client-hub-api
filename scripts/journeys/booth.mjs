// Fair notes on a phone (server G, which has the fixture card reader): scan a card, confirm, save, find it again, keep notes when the wifi is gone, turn a factory into a supplier.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, sql, stamp, forge } from './lib.mjs';
const BASE = 'http://127.0.0.1:3130', call = api(BASE);
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
const cardDataUrl = () => jpeg(), cardBuf = () => Buffer.from(jpeg().split(',')[1], 'base64');
const mk = async () => { const r = await call('/v1/public/start', { body: { email: `jb-${stamp}-${Math.random().toString(36).slice(2, 7)}@chaos.test`, name: 'Booth Admin', title: 'Booth runner', photos: [jpeg()] } }); return forge({ sub: sql(`select id from users where client_id='${r.json.client.id}' limit 1`), clientId: r.json.client.id, role: 'admin' }); };
const admin = await mk(), co = `Booth Mill ${stamp}`;

await journey('J73', 'a factory met at a fair is kept: the card is read for confirming, only the company is required, duplicates are flagged, and a factory becomes a supplier', async () => {
  ok((await call('/v1/admin/partners')).status === 401, 'the list is staff only');
  const sc = await call('/v1/admin/partners/scan', { method: 'POST', token: admin, body: { image: cardDataUrl() } });
  ok(sc.status === 200 && sc.json.fields.company && sc.json.fields.wechat, 'a card photo comes back as fields to confirm', sc.json);
  ok((await call('/v1/admin/partners/scan', { method: 'POST', token: admin, body: { image: 'nope' } })).status === 400, 'something that is not a photo is refused');
  ok((await call('/v1/admin/partners', { method: 'POST', token: admin, body: { notes: 'no name' } })).status === 400, 'a company name is the only thing required');
  const a = await call('/v1/admin/partners', { method: 'POST', token: admin, body: { company: co, contactName: 'Zhang', makes: ['Footwear', 'EVA soles'], rating: 4, source: 'Canton Fair 2026', moqNote: 'MOQ 300' } });
  ok(a.status === 201 && a.json.partner.company === co && a.json.partner.rating === 4, 'it saves with just what there was time for', a.json);
  const d = await call('/v1/admin/partners', { method: 'POST', token: admin, body: { company: co } });
  ok(d.status === 409, 'the same factory twice is flagged', d.status);
  const p = await call(`/v1/admin/partners/${a.json.partner.id}`, { method: 'PATCH', token: admin, body: { notes: 'Ask for Zhang; showed foam samples', rating: 5 } });
  ok(p.status === 200 && p.json.partner.rating === 5 && /foam/.test(p.json.partner.notes) && p.json.partner.company === co, 'notes and rating can be added later without losing the rest', p.json);
  const s = await call(`/v1/admin/partners/${a.json.partner.id}/supplier`, { method: 'POST', token: admin });
  ok(s.status === 201 && s.json.supplierId, 'it becomes a supplier record', s.json);
  ok((await call(`/v1/admin/partners/${a.json.partner.id}/supplier`, { method: 'POST', token: admin })).json.already === true, 'and only once');
  ok(sql(`select count(*) from suppliers where name='${co}'`) === '1', 'one supplier row');
  const l = await call('/v1/admin/partners', { token: admin }); ok(l.json.partners.some(x => x.company === co && x.supplierId), 'the list shows it');
  ok((await call('/booth')).status === 200, 'the page is served');
});

if (playwright) await journey('J74', 'on a phone: scan, check the fields, tap what they make, rate, save; and with no connection the notes wait on the phone and send when it is back', async () => {
  const b = await playwright.chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.goto(`${BASE}/booth`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
    await page.setInputFiles('#card', { name: 'card.jpg', mimeType: 'image/jpeg', buffer: cardBuf() });
    await page.waitForFunction(() => document.querySelector('[name=company]').value.length > 0, null, { timeout: 10000 });
    ok(/Fixture Mill/.test(await page.inputValue('[name=company]')) && await page.inputValue('[name=wechat]') === 'liwei_fx', 'the card fills the form');
    ok(/Check each field/.test(await page.innerText('#scanMsg')), 'and says to check each field');
    await page.fill('[name=company]', `Phone Mill ${stamp}`); await page.click('#makes .chip[data-m="Bags"]'); await page.click('#stars button[data-n="4"]');
    await page.fill('[name=notes]', 'Showed canvas bags'); await page.click('#save');
    await page.waitForFunction(c => document.querySelector('#list').innerText.includes(c), `Phone Mill ${stamp}`, { timeout: 10000 });
    ok(sql(`select count(*) from partners where company='Phone Mill ${stamp}' and rating=4 and makes like '%Bags%'`) === '1', 'saved with the tap-chosen tags and stars');
    ok(await page.inputValue('[name=company]') === '', 'the form is ready for the next factory');
    await ctx.setOffline(true);
    await page.fill('[name=company]', `Offline Mill ${stamp}`); await page.click('#save');
    await page.waitForSelector('#outbox:not(.hidden)', { timeout: 10000 });
    ok(/waiting for a connection/.test(await page.innerText('#outboxText')) && sql(`select count(*) from partners where company='Offline Mill ${stamp}'`) === '0', 'with no connection it is kept on the phone, not lost and not claimed saved');
    await ctx.setOffline(false); if (await page.locator('#outbox:not(.hidden)').count()) await page.click('#sendNow', { timeout: 2000 }).catch(() => {}); // the phone also sends by itself when it is back online
    await page.waitForSelector('#outbox.hidden', { state: 'attached', timeout: 15000 });
    for (let i = 0; i < 20 && sql(`select count(*) from partners where company='Offline Mill ${stamp}'`) !== '1'; i++) await sleep(250);
    ok(sql(`select count(*) from partners where company='Offline Mill ${stamp}'`) === '1', 'back online it is sent');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scrolling on a phone');
    ok(!page.errs.length, 'no page errors', page.errs);
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j74-booth.png` }).catch(() => {});
  } finally { await b.close(); }
});

const bad = summary(); process.exit(bad ? 1 : 0);
