import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, codeFrom, sleep, waitAi, forge, sql, stamp, S } from './lib.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = 'http://127.0.0.1:3123', LOG = `${S}/server-j-a.log`, call = api(BASE), runner = jpeg(), FX = (await import('./lib.mjs')).FX;
let n = 0; const em = tag => `ju${tag}-${stamp}-${++n}@chaos.test`;
const browser = await chromium.launch();
const phone = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); return { ctx, page }; };
const msg = async page => (await page.textContent('#msg')).trim();
const fill = async (page, { title = 'Layer runner', email, name = 'Chaos UI' } = {}) => { await page.fill('#title', title); await page.fill('#email', email); await page.fill('#name', name); };
const addImage = async (page, f = 'ig-screenshot.png', sel = '#photos') => { const before = await page.locator('#shots .shot').count(); await page.setInputFiles(sel, `${FX}/${f}`); await page.waitForFunction(b => document.querySelectorAll('#shots .shot').length > b, before, { timeout: 8000 }).catch(() => {}); };
async function room(tag, { wait = true } = {}) { const email = em(tag), r = await call('/v1/public/start', { body: { email, name: 'UI Room', title: 'Layer runner', photos: [runner] } }); const out = { email, token: r.json.token, id: r.json.product?.id }; if (wait) await waitAi(call, out.token, out.id); return out; }
const openEditor = async (page, token, id) => { await page.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, token); await page.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); };

await journey('J20', 'phone: /start with every mistake a customer can make, then success', async () => {
  const { ctx, page } = await phone(); await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' });
  await page.setInputFiles('#photos', `${FX}/notes.txt`); await sleep(500); ok(/not an image/i.test(await msg(page)), 'a text file → "That file is not an image"', await msg(page));
  await page.setInputFiles('#photos', `${FX}/broken.png`); await sleep(900); const afterBroken = await page.locator('#shots .shot').count(); ok(afterBroken === 0, 'a broken PNG is not added as a photo', afterBroken); ok((await msg(page)).length > 0, 'and the page says something about it', await msg(page));
  await fill(page, { email: em('20') }); await page.click('#go'); ok(/add an image/i.test(await msg(page)), 'submit with no image → asks for an image', await msg(page));
  await addImage(page); await page.fill('#title', ''); await page.fill('#email', em('20')); await page.click('#go'); ok(/tell us what it is/i.test(await msg(page)), 'no title → "Tell us what it is"', await msg(page));
  await page.fill('#title', 'Layer runner'); await page.fill('#email', 'x@y'); await page.click('#go'); ok(/email/i.test(await msg(page)), 'bad email → asks for an email', await msg(page));
  for (let i = 0; i < 5; i++) await addImage(page, i % 2 ? 'pinterest-screenshot.png' : 'ig-screenshot.png', '#photosMore'); const count = await page.locator('#shots .shot').count(); ok(count === 4, 'six attempts end at four images', count); ok(/up to 4/i.test(await msg(page)), 'with a message about the limit', await msg(page));
  await page.click('#shots .shot:nth-child(2) button[data-act="rm"]'); ok(await page.locator('#shots .shot').count() === 3, 'the × removes an image'); ok(/3 of 4/.test(await page.textContent('#shotCount')), 'and the counter follows', await page.textContent('#shotCount'));
  const email = em('20'); await fill(page, { email }); await page.click('#go'); await page.waitForURL(/\/tech-packs\//, { timeout: 15000 }); ok(/\/tech-packs\//.test(page.url()), 'a good submit opens the tech pack');
  await page.waitForSelector('.ai-banner', { timeout: 10000 }).catch(() => {}); await page.waitForFunction(() => /Draft written|written/i.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
  const text = await page.innerText('body'); ok(/Reference photo|CALLOUTS|Callouts/i.test(text), 'the editor renders', text.slice(0, 80)); ok(page.errs.length === 0, 'no script errors on either page', page.errs); await ctx.close();
});

await journey('J21', 'phone: no signal on submit, nothing is lost, retry works', async () => {
  const { ctx, page } = await phone(); await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); await addImage(page); const email = em('21'); await fill(page, { email, title: 'Offline runner', name: 'Offline Olive' });
  await page.route('**/v1/public/start', r => r.abort('internetdisconnected')); await page.click('#go'); await page.waitForFunction(() => /could not reach/i.test(document.querySelector('#msg').textContent), null, { timeout: 8000 }).catch(() => {});
  ok(/could not reach future basics/i.test(await msg(page)), 'no connection → "Could not reach Future Basics"', await msg(page)); ok(await page.isEnabled('#go'), 'the button is usable again'); ok((await page.inputValue('#title')) === 'Offline runner' && (await page.inputValue('#email')) === email && (await page.inputValue('#name')) === 'Offline Olive', 'the typed fields are still there'); ok(await page.locator('#shots .shot').count() === 1, 'and so is the image');
  await page.unroute('**/v1/public/start'); await page.click('#go'); await page.waitForURL(/\/tech-packs\//, { timeout: 15000 }); ok(/\/tech-packs\//.test(page.url()), 'back online: the same submit goes through'); await ctx.close();
});

await journey('J22', 'phone: the server answers badly (too large, restarting, throttled, broken) and the page stays usable', async () => {
  const { ctx, page } = await phone(); await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); await addImage(page); await fill(page, { email: em('22') });
  const cases = [[413, 'text/html', '<html><body>413 Request Entity Too Large</body></html>', /too large|smaller|remove one/i, '413 from a proxy (HTML)'], [502, 'text/html', '<html>Bad Gateway</html>', /restarting|try again/i, '502 from the proxy'], [503, 'text/html', '<html>Service Unavailable</html>', /restarting|try again/i, '503'], [504, 'text/html', 'x', /too long|try again/i, '504'],
    [429, 'application/json', JSON.stringify({ error: 'Too many submissions. Please try again in an hour.' }), /too many/i, '429 JSON'], [500, 'application/json', JSON.stringify({ error: 'Internal server error' }), /our side|try again/i, '500 JSON'], [400, 'application/json', JSON.stringify({ error: 'Photo 1 could not be opened — re-save it as a JPG or PNG and try again' }), /could not be opened/i, '400 with a message'], [200, 'text/plain', 'not json at all', /./, 'a 200 that is not JSON']];
  for (const [status, ct, body, re, label] of cases) { await page.route('**/v1/public/start', r => r.fulfill({ status, contentType: ct, body })); await page.click('#go'); await page.waitForFunction(() => document.querySelector('#msg').textContent.length > 0 || document.querySelector('#goLabel').textContent.startsWith('Opening'), null, { timeout: 5000 }).catch(() => {});
    const m = await msg(page); ok(re.test(m) && !/undefined|\[object|<html/i.test(m), `${label} → a readable message`, m); ok(await page.isEnabled('#go') || status === 200, `${label} → the button is usable again`); await page.unroute('**/v1/public/start'); await page.evaluate(() => { document.querySelector('#msg').textContent = ''; document.querySelector('#go').disabled = false; document.querySelector('#goLabel').textContent = 'Create my tech pack'; }); }
  ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();
});

await journey('J23', 'phone: double-tapping Create makes one draft', async () => {
  const { ctx, page } = await phone(); await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); await addImage(page); const email = em('23'); await fill(page, { email });
  await page.evaluate(() => { const b = document.querySelector('#go'); b.click(); b.click(); b.click(); }); await page.waitForURL(/\/tech-packs\//, { timeout: 15000 }); await sleep(800);
  const products = Number(sql(`select count(*) from products p join clients c on c.id=p.client_id where lower(c.contact_email)='${email}'`)); ok(products === 1, 'three taps → one draft', products); await ctx.close();
});

await journey('J24', 'phone: expired, missing and wrong sessions on the editor link', async () => {
  const r = await room('24', { wait: false }); const expired = await forge({ sub: 'x', clientId: 'x', role: 'client' }, { exp: Math.floor(Date.now() / 1000) - 60 });
  for (const [label, token] of [['expired token', expired], ['no token', null], ['garbage token', 'not.a.token']]) {
    const { ctx, page } = await phone(); if (token) await page.addInitScript(t => localStorage.setItem('fb.client.token', t), token); await page.goto(`${BASE}/tech-packs/${r.id}`, { waitUntil: 'networkidle' }); await sleep(600);
    const text = (await page.innerText('body')).replace(/\s+/g, ' '); ok(/sign in|session|expired|open the client hub/i.test(text), `${label} → a sign-in prompt, not a blank or broken page`, text.slice(0, 140)); ok(await page.locator('a[href]').filter({ hasText: /sign in|open the client hub|hub/i }).count() > 0, `${label} → with a link to sign in`); ok(page.errs.length === 0, `${label} → no script errors`, page.errs); await ctx.close(); }
  const { ctx, page } = await phone(); await page.goto(`${BASE}/tech-packs/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' }); await sleep(500); const t = (await page.innerText('body')).replace(/\s+/g, ' '); ok(t.length > 10 && !/undefined|\[object/i.test(t), 'a product that does not exist → a readable page', t.slice(0, 120)); await ctx.close();
});

await journey('J25', 'phone: a returning customer on the code card (resend, wrong email, wrong code, pasted code)', async () => {
  const owner = await room('25', { wait: false }); const { ctx, page } = await phone(); await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); await addImage(page); await fill(page, { email: owner.email, title: 'Second pack' }); await page.click('#go');
  await page.waitForSelector('#codeCard:not(.hidden)', { timeout: 10000 }); ok(await page.isVisible('#codeCard'), 'a known email shows the code card'); ok((await page.textContent('#codeEmail')).includes(owner.email), 'and says where the code went');
  await page.fill('#code', '000000'); await page.click('#codeForm button'); await page.waitForFunction(() => document.querySelector('#codeMsg').textContent.length > 0, null, { timeout: 5000 }); ok(/invalid|expired/i.test(await page.textContent('#codeMsg')), 'a wrong code → a message, not a dead page', await page.textContent('#codeMsg'));
  await page.click('#resend'); await page.waitForFunction(() => /new code/i.test(document.querySelector('#codeMsg').textContent), null, { timeout: 5000 }).catch(() => {}); ok(/new code/i.test(await page.textContent('#codeMsg')), '"Send a new code" works and says so', await page.textContent('#codeMsg'));
  await sleep(200); const code = codeFrom(LOG, owner.email); ok(/^\d{6}$/.test(code || ''), 'a fresh code was emailed', code);
  await page.fill('#code', `${code.slice(0, 3)} ${code.slice(3)}`); await page.click('#codeForm button'); await page.waitForURL(/\/tech-packs\//, { timeout: 10000 }); ok(/\/tech-packs\//.test(page.url()), 'a code pasted as "123 456" opens the draft');
  const p2 = await phone(); await p2.page.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); await addImage(p2.page); await fill(p2.page, { email: owner.email, title: 'Third pack' }); await p2.page.click('#go'); await p2.page.waitForSelector('#codeCard:not(.hidden)');
  await p2.page.click('#changeEmail'); ok(await p2.page.isVisible('#startForm') && !(await p2.page.isVisible('#codeCard')), '"Use a different email" returns to the form'); ok((await p2.page.inputValue('#title')) === 'Third pack' && await p2.page.locator('#shots .shot').count() === 1, 'with the image and title kept');
  ok(page.errs.length === 0 && p2.page.errs.length === 0, 'no script errors', [...page.errs, ...p2.page.errs]); await ctx.close(); await p2.ctx.close();
});

await journey('J26', 'phone: a locked second pack, an "I\'ve paid" press too early, payments down, then paid', async () => {
  const owner = await room('26'); const second = await call('/v1/public/start', { body: { email: owner.email, title: 'Locked pack', photos: [runner] } }); await call('/v1/auth/code', { body: { email: owner.email } }); await sleep(200);
  const v = await call('/v1/auth/verify', { body: { email: owner.email, code: codeFrom(LOG, owner.email) } }); const token = v.json.token, id = second.json.product.id;
  const { ctx, page } = await phone(); await openEditor(page, token, id); await sleep(800); const text = await page.innerText('body'); ok(/first tech pack was on us|\$48|Unlock this tech pack/i.test(text), 'the locked pack explains the price and offers to unlock', text.slice(0, 120));
  const toast = async () => { await sleep(500); return (await page.textContent('#toast')).trim(); };
  await page.click('[data-act="unlock"]'); ok(/not reached us|moment/i.test(await toast()), '"I\'ve paid" before paying → "Payment has not reached us yet"', await toast());
  await page.click('[data-act="paysingle"]'); await sleep(500); const dlg = await page.locator('#payChoice').count(); if (dlg) { await page.click('[data-act="paysinglego"]'); } await sleep(900); const t2 = await toast(); ok(/not set up|message Future Basics|checkout/i.test(t2) && !/Internal|undefined/i.test(t2), 'payments unavailable → a human message', t2);
  sql(`update tech_packs set paid_at=now(),pay_order_id='ui-${stamp}',billing='single' where product_id='${id}'`); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.click('[data-act="unlock"]').catch(() => {}); await page.waitForFunction(() => /Building your tech pack|Draft written/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {}); const tp = await waitAi(call, token, id); ok(tp.json.techPack.aiStatus === 'done', 'once paid, the assistant builds the pack', tp.json.techPack.aiStatus); ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();
});

await journey('J27', 'two tabs on one draft: the older tab cannot overwrite the newer one', async () => {
  const r = await room('27'); const a = await phone(), b = await phone(); await openEditor(a.page, r.token, r.id); await openEditor(b.page, r.token, r.id); await sleep(600);
  const field = '[data-path=\'["style","styleName"]\']'; const typeIn = async (pg, text) => { await pg.fill(field, text); await sleep(2800); };
  await typeIn(a.page, 'Written in tab A'); const first = (await call(`/v1/products/${r.id}/tech-pack/draft`, { token: r.token })).json.techPack.data.style.styleName; ok(first === 'Written in tab A', 'tab A autosaves', first);
  await typeIn(b.page, 'Written in tab B (stale)'); const toast = (await b.page.textContent('#toast')).trim(); ok(/changed in another tab|reload/i.test(toast), 'the stale tab is told, in words', toast);
  const shown = await b.page.inputValue(field); ok(shown === 'Written in tab A', 'it reloads and now shows the newer version', shown);
  const server = (await call(`/v1/products/${r.id}/tech-pack/draft`, { token: r.token })).json.techPack.data.style.styleName; ok(server === 'Written in tab A', 'and the server kept the newer version', server);
  await typeIn(b.page, 'Tab B after reload'); const after = (await call(`/v1/products/${r.id}/tech-pack/draft`, { token: r.token })).json.techPack.data.style.styleName; ok(after === 'Tab B after reload', 'after the reload tab B can save again', after);
  ok(a.page.errs.length === 0 && b.page.errs.length === 0, 'no script errors', [...a.page.errs, ...b.page.errs]); await a.ctx.close(); await b.ctx.close();
});

await browser.close(); const bad = summary(); process.exit(bad ? 1 : 0);
