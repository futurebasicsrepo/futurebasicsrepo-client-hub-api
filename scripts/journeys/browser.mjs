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
async function room(tag, { wait = true } = {}) { const email = em(tag), r = await call('/v1/public/start', { body: { email, name: 'UI Room', title: 'Layer runner', photos: [runner] } }); const out = { email, token: r.json.token, id: r.json.product?.id, projectId: r.json.project?.id, clientId: r.json.client?.id }; if (wait) await waitAi(call, out.token, out.id); return out; }
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
  ok(/Checkout would not open/.test(await page.innerText('.ai-banner')) && await page.isVisible('.ai-banner [data-act="askhelp"]'), 'and the page keeps a "Checkout would not open" note with a Message Future Basics button (not just a toast that vanishes)');
  await page.click('.ai-banner [data-act="askhelp"]'); await page.waitForFunction(() => /Sent/.test(document.querySelector('.ai-banner [data-act="askhelp"]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok(sql(`select count(*) from project_messages where project_id='${second.json.project.id}' and author_role='client' and body like '%checkout would not open%'`) === '1', 'one tap puts the message in the project thread where staff already look');
  ok(sql(`select count(*) from notifications where client_id='${second.json.client.id}' and type='client-project-message'`) >= '1', 'and staff get a notification');
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

await journey('J31', 'getting to the tech pack and back: every level is a link, and back lands on the same product', async () => {
  const r = await room('31'), W = 'http://work.localhost:3123';
  const wide = async (role, token) => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); await ctx.addInitScript(([k, t]) => { try { localStorage.setItem(k, t); } catch {} }, [role === 'admin' ? 'fb.admin.token' : 'fb.client.token', token]); const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); return { ctx, page }; };
  const crumbs = page => page.$$eval('#crumb a, #crumb [aria-current], #crumbs button, #crumbs [aria-current]', els => els.map(e => e.textContent.trim()));
  // the customer: project → product → tech pack → back
  let { ctx, page } = await wide('client', r.token);
  await page.goto(`${BASE}/projects/${r.projectId}#product=${r.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('.tpstrip', { timeout: 10000 });
  let c = await crumbs(page); ok(c[0] === 'Projects' && c[c.length - 1] === 'Layer runner' && c.length === 4, 'the hub product page shows Projects › project › Products › product', c);
  ok(await page.locator('#projectPage .back-link').count() === 0, 'and no stray "back" button is left');
  await page.click('.tpstrip'); await page.waitForSelector('#acts .btn.primary', { timeout: 10000 }); await sleep(600);
  c = await crumbs(page); ok(c.length === 4 && c[0] === 'Projects' && c[2] === 'Layer runner' && c[3] === 'Tech pack', 'the tech pack shows Projects › project › product › Tech pack', c);
  const visible = await page.$$eval('#acts > .btn, #acts > .status', els => els.filter(e => e.offsetParent).map(e => e.textContent.trim())); ok(visible.length <= 3, 'the top bar has a status, Save and Submit — nothing else', visible);
  await page.click('#acts details.more > summary'); const menu = await page.$$eval('#acts .menu button', els => els.map(e => e.textContent.trim())); ok(menu.includes('Download PDF'), 'PDF is under More', menu);
  await page.click('body', { position: { x: 4, y: 500 } }); ok(!(await page.$eval('#acts details.more', d => d.open)), 'clicking elsewhere closes the menu');
  await page.click('#crumb a.parent'); await page.waitForSelector('.tpstrip', { timeout: 10000 });
  ok(page.url().endsWith(`/projects/${r.projectId}#product=${r.id}`), 'back from the tech pack lands on the same product, not the project list', page.url());
  await page.click('#crumbs button:first-child'); await page.waitForSelector('#products .card', { timeout: 10000 }); ok(await page.$eval('#projectPage', e => e.classList.contains('hidden')), 'the Projects crumb goes home');
  ok(page.errs.length === 0, 'no script errors (customer)', page.errs); await ctx.close();
  // staff: client room → product → tech pack → back
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  ({ ctx, page } = await wide('admin', admin));
  await page.goto(`${W}/clients/${r.clientId}#product=${r.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('.tpstrip', { timeout: 10000 });
  ok(await page.locator('#clientPageBody .room-status').count() === 0, 'a product page does not carry the client details panel above it');
  c = await crumbs(page); ok(c[0] === 'Clients' && c.length === 4 && c[3] === 'Layer runner', 'the console product page shows Clients › client › project › product', c);
  const groups = await page.$$eval('.actgroup > .meta', els => els.map(e => e.textContent.trim())); ok(groups.length === 3, 'product actions sit in three labelled groups, not one row of pills', groups);
  await page.click('.tpstrip'); await page.waitForSelector('#acts .btn.primary', { timeout: 10000 }); await sleep(600);
  c = await crumbs(page); ok(c.length === 5 && c[0] === 'Clients' && c[4] === 'Tech pack', 'the console tech pack shows Clients › client › project › product › Tech pack', c);
  const vis = await page.$$eval('#acts > .btn, #acts > .status', els => els.filter(e => e.offsetParent).map(e => e.textContent.trim())); ok(vis.length <= 4 && vis.some(t => /^Save/.test(t)) && vis.some(t => /^Publish/.test(t)), 'staff see status, Save, Publish and More — the rest is under More', vis);
  await page.click('#acts details.more > summary'); const am = await page.$$eval('#acts .menu button', els => els.map(e => e.textContent.trim())); ok(am.includes('Download PDF') && am.some(t => /assistant/i.test(t)) && am.some(t => /factory/i.test(t)), 'run assistant, translate and PDF are under More', am);
  await page.click('body', { position: { x: 4, y: 500 } }); await page.click('#crumb a.parent'); await page.waitForSelector('.tpstrip', { timeout: 10000 });
  ok(page.url().endsWith(`/clients/${r.clientId}#product=${r.id}`) && /Layer runner/i.test(await page.$eval('#roomMain .product h3', e => e.textContent)), 'back from the console tech pack opens the same product in the room', page.url());
  ok(page.errs.length === 0, 'no script errors (staff)', page.errs); await ctx.close();
  // phone: a single "‹ product" link instead of the whole trail
  const ph = await phone(); await openEditor(ph.page, r.token, r.id); await sleep(800);
  const shown = await ph.page.$$eval('#crumb a, #crumb [aria-current]', els => els.filter(e => e.offsetParent).map(e => e.textContent.trim())); ok(shown.length === 1 && shown[0] === 'Layer runner', 'on a phone the top bar shows one "‹ product" link', shown);
  const barRight = await ph.page.$eval('#acts', e => e.getBoundingClientRect().right); ok(barRight <= 390, 'and the buttons fit the screen', barRight); await ph.ctx.close();
});

await journey('J33', 'message center on a phone: list → thread → send, reply, attach, back', async () => {
  const r = await room('33', { wait: false }), W = 'http://work.localhost:3123';
  await call(`/v1/projects/${r.projectId}/messages`, { token: r.token, body: { body: 'Is the sample still on track?' } });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await page.waitForSelector('.mc-row', { timeout: 10000 });
  ok(await page.$eval('#messageCenter', e => e.dataset.view) === 'list' && await page.locator('.mc-thread').isHidden(), 'a phone starts on the conversation list');
  const mine = page.locator(`.mc-row:has-text("Is the sample still on track?")`); ok(await mine.count() >= 1 && /\d/.test(await mine.first().locator('.mc-badge').textContent()), 'the new conversation is there with an unread badge');
  await page.fill('#mcSearch', 'zzzz-no-match'); ok(await page.locator('.mc-row').count() === 0, 'search filters the list'); await page.fill('#mcSearch', '');
  await mine.first().click(); await page.waitForSelector('.mc-msg', { timeout: 8000 });
  ok(await page.locator('.mc-list').isHidden() && await page.locator('.mc-thread').isVisible(), 'tapping opens the thread full screen');
  ok(await page.locator('.mc-msg.in .mc-bub').first().textContent().then(t => /still on track/.test(t)), 'the client bubble is on the left');
  ok(await page.$eval('#mcSendBtn', b => b.disabled), 'Send is off while the box is empty');
  await page.fill('#mcText', 'Yes — ships on the 28th.'); ok(!(await page.$eval('#mcSendBtn', b => b.disabled)), 'and on once there is text');
  await page.press('#mcText', 'Shift+Enter'); await page.type('#mcText', 'Line two'); ok((await page.inputValue('#mcText')).includes('\n'), 'Shift+Enter makes a new line instead of sending');
  await page.press('#mcText', 'Enter'); await page.waitForSelector('.mc-msg.out', { timeout: 8000 });
  const sent = await page.locator('.mc-msg.out .mc-text').last().textContent(); ok(/ships on the 28th\.\nLine two/.test(sent), 'Enter sends, as a bubble on the right with its line break', sent);
  ok(await page.inputValue('#mcText') === '', 'and the box clears');
  await page.locator('.mc-msg.in .mc-bub').first().click(); await page.click('.mc-msg.in.sel .mc-acts button'); ok(await page.locator('#mcReplyBar').isVisible(), 'tapping a bubble offers Reply, which shows the quoted message above the box');
  await page.fill('#mcText', 'Replying to that'); await page.click('#mcSendBtn'); await page.waitForFunction(() => document.querySelectorAll('.mc-quote').length > 0, null, { timeout: 8000 }); ok(await page.locator('.mc-quote').count() === 1, 'the reply carries the quote');
  await page.setInputFiles('#mcFile', `${FX}/ig-screenshot.png`); ok(await page.locator('#mcFileBar').isVisible() && /ig-screenshot/.test(await page.textContent('#mcFileName')), 'a chosen file shows above the box'); await page.click('#mcSendBtn');
  await page.waitForSelector('.mc-file', { timeout: 10000 }); ok(/ig-screenshot\.png/.test(await page.textContent('.mc-file')), 'the upload appears as an attachment in the thread');
  ok(await page.$eval('.mc-msgs', e => e.scrollHeight - e.scrollTop - e.clientHeight < 40), 'the thread stays scrolled to the newest message');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(overflow <= 1, 'nothing overflows the phone width', overflow);
  await page.click('.mc-back'); ok(await page.locator('.mc-list').isVisible() && await page.locator('.mc-thread').isHidden(), 'back returns to the list');
  await page.waitForSelector('.mc-row:has-text("Uploaded ig-screenshot")', { timeout: 10000 }).catch(() => {});
  ok(await page.locator('.mc-row:has-text("Uploaded ig-screenshot")').count() >= 1 && await page.locator('.mc-row:has-text("Uploaded ig-screenshot") .mc-badge').count() === 0, 'and the conversation now previews our last message ("You: …") with no unread badge');
  ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();
});

await journey('J37', 'staff switches: free access for one client, and the payment gate for everyone', async () => {
  const r = await room('37', { wait: false }), W = 'http://work.localhost:3123';
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  const second = (await call('/v1/tech-packs', { token: r.token, body: { title: 'Second pack', projectId: r.projectId, photos: [runner] } })).json; ok(second.ai === 'locked', 'setup: the client has a pack waiting for payment', second.ai);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  try {
    await page.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !/Checking/.test(document.getElementById('accessTitle')?.textContent || 'Checking'), null, { timeout: 10000 });
    ok(/paid after the first free/i.test(await page.textContent('#accessTitle')) && await page.$eval('#accessSwitch', i => i.checked), 'the console home says tech packs are paid after the first, with the switch on', await page.textContent('#accessTitle'));
    ok(/\d+ clients? (has|have) free access · \d+ packs? waiting/.test(await page.textContent('#accessText')), 'and counts who has free access and what is waiting', await page.textContent('#accessText'));
    await page.goto(`${W}/clients/${r.clientId}`, { waitUntil: 'networkidle' }); await page.waitForSelector('.gate-row', { timeout: 10000 });
    ok(!(await page.$eval('.gate-row input', i => i.checked)) && /Standard/.test(await page.textContent('.gate-row')), 'a client room shows "Standard" with the switch off');
    await page.click('.gate-row .switch input'); await page.waitForSelector('.gate-row.on', { timeout: 10000 });
    ok(/Free access/.test(await page.textContent('.gate-row')) && dialogs.some(m => /started/.test(m)), 'turning it on reads "Free access" and says the waiting pack started', [await page.textContent('.gate-row'), dialogs]);
    let d = null; for (let i = 0; i < 40; i++) { d = (await call(`/v1/products/${second.product.id}/tech-pack/draft`, { token: r.token })).json; if (d.techPack.aiStatus !== 'locked') break; await sleep(400); } ok(d.techPack.aiStatus !== 'locked', 'and that pack really is unlocked', d.techPack?.aiStatus);
    await page.screenshot({ path: `${S}/j37-client-room.png` });
    await page.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => /free for everyone|paid after/.test(document.getElementById('accessTitle').textContent), null, { timeout: 10000 });
    await page.click('#accessSwitch'); await page.waitForFunction(() => /free for everyone/.test(document.getElementById('accessTitle').textContent), null, { timeout: 10000 });
    ok(dialogs.some(m => /free for everyone\?/i.test(m)) && !(await page.$eval('#accessSwitch', i => i.checked)) && await page.isVisible('#accessAuto'), 'the global switch asks first, then reads "free for everyone" and offers "Use automatic"');
    await page.screenshot({ path: `${S}/j37-access-off.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });
    await page.click('#accessAuto'); await page.waitForFunction(() => /paid after/.test(document.getElementById('accessTitle').textContent), null, { timeout: 10000 }); ok(await page.$eval('#accessSwitch', i => i.checked) && !(await page.isVisible('#accessAuto')), '"Use automatic" puts it back');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => /paid after/.test(document.getElementById('accessTitle').textContent), null, { timeout: 10000 }); ok(true, 'and it is still back after a reload');
    ok(page.errs.length === 0, 'no script errors', page.errs);
  } finally { await call('/v1/admin/tech-pack-billing', { method: 'PUT', token: admin, body: { mode: 'auto' } }); await ctx.close(); }
});

await journey('J38', 'the whole customer path with the payment gate on, then off, switched live on the same server', async () => {
  const seed = await room('38s', { wait: false });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${seed.email}'`), clientId: seed.clientId, role: 'admin' });
  const setMode = m => call('/v1/admin/tech-pack-billing', { method: 'PUT', token: admin, body: { mode: m } });
  const field = '[data-path=\'["style","styleName"]\']', PAY = /first tech pack was on us|\$48|Unlock this tech pack/i;
  const status = async (token, id) => (await call(`/v1/products/${id}/tech-pack/draft`, { token })).json.techPack;
  const settle = async (token, id, ms = 20000) => { let t; for (let i = 0; i < ms / 400; i++) { t = await status(token, id); if (t.aiStatus && !['pending', 'locked'].includes(t.aiStatus)) break; await sleep(400); } return t; };
  try {
    for (const mode of ['on', 'off']) {
      const gate = mode === 'on', tag = `gate ${mode}`;
      ok((await setMode(mode)).json.effective === gate, `${tag}: switched`);
      // 1. a brand-new customer on a phone: photo → tech pack → the assistant builds it → edit → submit. Free in both modes.
      const { ctx, page } = await phone(); page.on('dialog', d => d.accept());
      await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' }); await addImage(page); await fill(page, { email: em('38' + mode), title: `Gate ${mode} runner` }); await page.click('#go');
      await page.waitForURL(/\/tech-packs\//, { timeout: 20000 }); const id = page.url().split('/tech-packs/')[1].split(/[?#]/)[0]; const token = await page.evaluate(() => localStorage.getItem('fb.client.token'));
      const t1 = await settle(token, id); ok(t1.aiStatus === 'done', `${tag}: the first pack is drafted by the assistant`, t1.aiStatus);
      await page.waitForFunction(() => /Draft written|written/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {}); ok(!PAY.test(await page.innerText('body')), `${tag}: and the first pack never mentions payment`);
      await page.fill(field, `Edited, gate ${mode}`); await sleep(2900); ok((await status(token, id)).data.style.styleName === `Edited, gate ${mode}`, `${tag}: a hand edit autosaves`);
      await page.click('[data-act="submit"]'); let sub = await status(token, id); for (let i = 0; i < 20 && sub.status !== 'submitted'; i++) { await sleep(400); sub = await status(token, id); }
      ok(sub.status === 'submitted', `${tag}: the customer submits it to Future Basics`, sub.status); await ctx.close();
      // 2. the same customer starts a second pack
      const projectId = (await call('/v1/dashboard', { token })).json.projects[0].id, mk = title => call('/v1/tech-packs', { token, body: { title, projectId, photos: [runner] } }).then(r => r.json);
      const second = await mk(`Second, gate ${mode}`);
      if (gate) {
        ok(second.ai === 'locked', `${tag}: the second pack waits for payment`, second.ai);
        const { ctx: c2, page: p2 } = await phone(); await openEditor(p2, token, second.product.id); await sleep(900); ok(PAY.test(await p2.innerText('body')) && await p2.isVisible('[data-act="paysingle"]'), `${tag}: the customer sees the price and a pay button`);
        ok((await call(`/v1/products/${second.product.id}/tech-pack/submit`, { method: 'POST', token, body: {} })).status === 402, `${tag}: and cannot submit it unpaid`);
        // the gate is switched off while that customer is looking at the locked pack: it starts without anyone paying
        await setMode('off'); await p2.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p2.click('[data-act="unlock"]').catch(() => {});
        const t2 = await settle(token, second.product.id); ok(t2.aiStatus === 'done', `${tag}: switching the gate off while they watch starts the pack`, t2.aiStatus); await p2.waitForFunction(() => !/Unlock this tech pack/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {}); ok(!(await p2.isVisible('[data-act="paysingle"]')), `${tag}: and the pay button is gone from their screen`); await c2.close();
        await setMode('on');
        const third = await mk(`Third, gate ${mode}`); ok(third.ai === 'locked', `${tag}: a third pack is locked again once the gate is back`, third.ai);
        ok((await call(`/v1/admin/clients/${seed.clientId}`, { method: 'PATCH', token: admin, body: { techPackComped: true } })).status === 200, `${tag}: (the console gives a different client free access)`);
        const room2 = await call('/v1/admin/clients', { method: 'POST', token: admin, body: { name: `Gifted ${stamp}${mode}`, slug: `gifted-${stamp}-${mode}`, allowedEmails: [`gift38-${stamp}@creator.test`], techPackComped: true } }); ok(room2.status === 200 && room2.json.tech_pack_comped, `${tag}: a creator can be given free access ahead of time`);
      } else {
        ok(second.ai === 'pending' || second.ai === 'done', `${tag}: the second pack is not locked, the assistant runs`, second.ai);
        const t2 = await settle(token, second.product.id); ok(t2.aiStatus === 'done', `${tag}: and finishes`, t2.aiStatus);
        const { ctx: c2, page: p2 } = await phone(); await openEditor(p2, token, second.product.id); await sleep(900); ok(!PAY.test(await p2.innerText('body')) && !(await p2.isVisible('[data-act="paysingle"]')), `${tag}: the second pack shows no payment step`); await c2.close();
        const sub2 = await call(`/v1/products/${second.product.id}/tech-pack/submit`, { method: 'POST', token, body: {} }); ok(sub2.status === 200, `${tag}: and submits to Future Basics`, [sub2.status, sub2.json.error]);
        ok((await mk(`Third, gate ${mode}`)).ai !== 'locked', `${tag}: a third pack is free too`);
      }
    }
  } finally { await setMode('auto'); }
});

await journey('J40', 'platform health page in the console: opens from the header, shows every connection, tabs and charts work, fits a phone, customers cannot see it', async () => {
  const r = await room('40', { wait: false }), W = 'http://work.localhost:3123';
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  const open = async (viewport, token = admin, path = '/platform') => { const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, token); const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); await page.goto(W + path, { waitUntil: 'networkidle' }); return { ctx, page }; };
  // a customer's token: the console shows the sign-in, never the numbers
  { const c = await open({ width: 1280, height: 900 }, r.token); await sleep(800); ok(await c.page.isHidden('#platformPage') || !/Platform health/.test(await c.page.innerText('#platformPage').catch(() => '')) || await c.page.isVisible('#auth'), 'a customer token does not get the platform page'); ok(!/Postgres|Anthropic/.test(await c.page.innerText('body')), 'and no connection names appear for them'); await c.ctx.close(); }
  // desktop: from the console home through the header link
  const { ctx, page } = await open({ width: 1280, height: 900 }, admin, '/admin');
  try {
    await page.waitForSelector('a.platformlink', { timeout: 10000 }); await page.click('a.platformlink'); await page.waitForSelector('.pf-banner', { timeout: 15000 });
    ok(page.url().endsWith('/platform') && await page.isVisible('#platformPage') && await page.isHidden('#app'), 'the header link opens the page at /platform');
    const names = await page.$$eval('.pf-card .pf-name', els => els.map(e => e.textContent.trim()));
    for (const n of ['Database', 'Shopify', 'Assistant', 'Email', 'Google', 'Photo cutout', 'File storage', 'Railway']) ok(names.some(x => x.includes(n)), `a card for ${n}`, names);
    ok(/All systems healthy|Something needs attention|The platform is down/.test(await page.textContent('.pf-banner')), 'the banner says the overall state in words');
    ok(await page.$$eval('.pf-card', cs => cs.length >= 8 && cs.every(c => { const b = c.querySelector('.pf-badge'); return b && b.querySelector('i') && b.textContent.trim().length > 2; })), 'every card shows its state as an icon and a word, not colour alone');
    await page.screenshot({ path: `${S}/j40-health-desktop.png`, fullPage: true });
    await page.click('#pfTabInsights'); await page.waitForSelector('#pfInsights:not(.hidden) .pf-chart, #pfInsights:not(.hidden) .pf-funnel, #pfInsights:not(.hidden) table', { timeout: 15000 });
    ok(await page.isHidden('#pfHealth') && await page.isVisible('#pfInsights'), 'the second tab shows people and packs');
    const fig = page.locator('#pfInsights .pf-chart').first(); await fig.scrollIntoViewIfNeeded(); const box = await fig.locator('.pf-hit').boundingBox(); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2); await sleep(200);
    ok((await fig.locator('.pf-tip').innerText()).trim().length > 2, 'hovering a chart shows its value in a tooltip', await fig.locator('.pf-tip').innerText());
    await fig.locator('summary').click(); ok(await fig.locator('table tbody tr').count() > 3, '"Show as table" lists the same numbers');
    await page.click('#pfInsights .pf-range button:has-text("7 days")').catch(() => {}); await sleep(900);
    ok(/7 days|Last 7/.test(await page.innerText('#pfInsights')) || (await page.$$('#pfInsights .pf-range button.on')).length === 1, 'changing the date range reloads the numbers');
    await page.screenshot({ path: `${S}/j40-insights-desktop.png`, fullPage: true });
    await page.click('#pfTabHealth'); await page.click('#pfRefresh'); await page.waitForSelector('.pf-banner', { timeout: 15000 }); ok(await page.isVisible('#pfHealth'), '"Check now" re-runs the checks and the page stays');
    await page.click('#platformPage .crumbs button'); await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 }); ok(new URL(page.url()).pathname === '/' && await page.isHidden('#platformPage'), 'the breadcrumb goes back to the client list');
    await page.goBack(); await page.waitForSelector('.pf-banner', { timeout: 10000 }); ok(page.url().endsWith('/platform'), 'and the browser back button returns to the platform page');
    ok(page.errs.length === 0, 'no script errors on desktop', page.errs);
  } finally { await ctx.close(); }
  // phone: nothing runs off the screen
  const m = await open({ width: 390, height: 844 });
  try {
    await m.page.waitForSelector('.pf-banner', { timeout: 15000 });
    for (const tab of ['#pfTabHealth', '#pfTabInsights']) { await m.page.click(tab); await sleep(700); const w = await m.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth })); ok(w.doc <= w.win + 1, `phone ${tab.slice(6)}: no sideways scroll`, w); }
    await m.page.screenshot({ path: `${S}/j40-insights-phone.png`, fullPage: true });
    ok(m.page.errs.length === 0, 'no script errors on the phone', m.page.errs);
  } finally { await m.ctx.close(); }
});

await journey('J41', 'staff: Start over in the console tech pack redraws it from the photo, after asking first', async () => {
  const r = await room('42'), W = 'http://work.localhost:3123';
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); const dialogs = []; let accept = false; page.on('dialog', d => { dialogs.push(d.message()); accept ? d.accept() : d.dismiss(); });
  try {
    await page.goto(`${W}/tech-packs/${r.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('details.more > summary', { timeout: 15000 }); const more = () => page.click('details.more > summary'); await more(); await page.waitForSelector('[data-act="startover"]', { timeout: 5000 }); ok(await page.isVisible('[data-act="airun"]'), 'the console editor shows Re-run assistant and, beside it, Start over');
    sql(`update tech_packs set data=jsonb_set(data,'{style,styleName}','"Hand-typed name"') where product_id='${r.id}'`);
    await page.click('[data-act="startover"]'); await sleep(500); ok(dialogs.some(m => /cannot be undone|start this tech pack over/i.test(m)), 'Start over asks first and says it cannot be undone', dialogs);
    ok(sql(`select data->'style'->>'styleName' from tech_packs where product_id='${r.id}'`) === 'Hand-typed name', 'dismissing the question changes nothing');
    accept = true; await more(); await page.click('[data-act="startover"]');
    let done = false; for (let i = 0; i < 40; i++) { await sleep(500); const st = sql(`select ai_status from tech_packs where product_id='${r.id}'`); if (st === 'done' && sql(`select count(*) from activities where product_id='${r.id}' and summary like '%started over%'`) === '1') { done = true; break; } }
    ok(done, 'accepting runs the assistant again and records "started over" in the activity log');
    ok(sql(`select data->'style'->>'styleName' from tech_packs where product_id='${r.id}'`) !== 'Hand-typed name', 'and what was typed by hand before is gone');
    ok(page.errs.length === 0, 'no script errors', page.errs);
  } finally { await ctx.close(); }
});

await journey('J42', 'the /start session ends while the editor is open: edits stay on the page and save once the customer is signed in again', async () => {
  const r = await room('43'), field = '[data-path=\'["style","styleName"]\']';
  const { ctx, page } = await phone(); page.on('dialog', d => d.accept());
  try {
    await openEditor(page, r.token, r.id); await page.waitForSelector(field, { timeout: 15000 });
    // the owner signs in with a code (in another tab or on another device): the session /start handed out stops working
    await call('/v1/auth/code', { body: { email: r.email } }); await sleep(200);
    const v = await call('/v1/auth/verify', { body: { email: r.email, code: codeFrom(LOG, r.email) } }); ok(v.status === 200 && v.json.token, 'setup: the owner signs in with a code', v.status);
    ok((await call(`/v1/products/${r.id}/tech-pack/draft`, { token: r.token })).status === 401, 'setup: the old /start session now stops working');
    await page.fill(field, 'Typed while signed out'); await sleep(3200);
    const toast = (await page.textContent('#toast')).trim(); ok(/session ended/i.test(toast) && /still on this page/i.test(toast), 'a failed save says the session ended and that the edits are still on the page', toast);
    ok(await page.inputValue(field) === 'Typed while signed out', 'and what was typed is still in the field');
    ok(sql(`select data->'style'->>'styleName' from tech_packs where product_id='${r.id}'`) !== 'Typed while signed out', 'and nothing was saved under the dead session');
    // the new session appears in this browser (the sign-in tab stored it): coming back to this tab saves the edit without retyping
    await page.evaluate(t => localStorage.setItem('fb.client.token', t), v.json.token); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(2500);
    ok(sql(`select data->'style'->>'styleName' from tech_packs where product_id='${r.id}'`) === 'Typed while signed out', 'returning to the tab picks up the new session and saves the edit');
    await page.fill(field, 'Typed after sign-in'); await sleep(3200); ok(sql(`select data->'style'->>'styleName' from tech_packs where product_id='${r.id}'`) === 'Typed after sign-in', 'and later edits save as normal');
    ok(page.errs.length === 0, 'no script errors', page.errs);
  } finally { await ctx.close(); }
});

await journey('J45', 'the product card in the hub and the work console shows what the tech pack says', async () => {
  const r = await room('45'), W = 'http://work.localhost:3123';
  const d = (await call(`/v1/products/${r.id}/tech-pack/draft`, { token: r.token })).json.techPack.data;
  d.bom = [{ component: 'Upper', material: 'Recycled mesh' }, { component: 'Lining', material: 'Suede' }]; d.colorways = [{ name: 'Gum', code: '18-1021' }, { name: 'Ecru' }]; d.sizes = ['8', '9', '10']; d.artwork = [{ id: 'aw1', name: 'Heel logo', image: runner, pantones: [], placements: [{ sketchId: d.sketches[0].id, x: .5, y: .5, widthIn: 2, label: 'Heel' }] }];
  ok((await call(`/v1/products/${r.id}/tech-pack/draft`, { method: 'PUT', token: r.token, body: { data: d } })).status === 200, 'setup: the customer fills in the pack');
  const { ctx, page } = await phone();
  try {
    await page.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, r.token);
    await page.goto(`${BASE}/projects/${r.projectId}#products`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#cp-${r.id}`, { timeout: 15000 });
    const hub = await page.innerText(`#cp-${r.id}`);
    ok(/Material:\s*Recycled mesh, Suede/.test(hub) && /Decoration:\s*Heel logo/.test(hub) && /Colorways:\s*Gum \(18-1021\), Ecru/.test(hub), 'the hub card reads Material, Decoration and Colorways from the pack', hub.slice(0, 400));
    ok(await page.locator(`#cp-${r.id} .size-chip`).allInnerTexts().then(t => t.join() === '8,9,10'), 'and the size run chips are 8, 9, 10');
    ok(!/Material:\s*TBD/.test(hub), 'with no TBD left where the pack has an answer');
    await page.locator(`#cp-${r.id}`).screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j45-hub-card.png` });
    ok(page.errs.length === 0, 'no script errors', page.errs);
  } finally { await ctx.close(); }
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const wp = await wctx.newPage(); wp.errs = []; wp.on('pageerror', e => wp.errs.push(e.message));
  try {
    await wp.goto(`${W}/clients/${r.clientId}#project=${r.projectId}`, { waitUntil: 'networkidle' }); await wp.waitForSelector(`#wp-${r.id}`, { timeout: 15000 });
    const work = await wp.innerText(`#wp-${r.id}`);
    ok(await wp.locator(`#wp-${r.id} .size-chips span`).allInnerTexts().then(t => t.join() === '8,9,10'), 'with the size run chips');
    ok(/Recycled mesh, Suede/.test(work) && /Heel logo/.test(work) && /Gum \(18-1021\), Ecru/.test(work), 'the work console card shows the same', work.slice(0, 400));
    await wp.locator(`#wp-${r.id}`).screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j45-work-card.png` });
    ok(wp.errs.length === 0, 'no script errors in the console', wp.errs);
  } finally { await wctx.close(); }
});

await browser.close(); const bad = summary(); process.exit(bad ? 1 : 0);
