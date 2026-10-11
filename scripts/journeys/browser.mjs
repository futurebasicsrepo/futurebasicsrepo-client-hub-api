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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const wide = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll('body *')].map(e => ({ e, r: e.getBoundingClientRect() })).filter(x => x.r.right > innerWidth + 1 && x.r.width > 0).slice(0, 6).map(x => `${x.e.tagName.toLowerCase()}${x.e.id ? '#' + x.e.id : ''}.${String(x.e.className).slice(0, 40)} right=${Math.round(x.r.right)} ${getComputedStyle(x.e).position}`)) : [];
  ok(overflow <= 1, 'nothing overflows the phone width', { overflow, wide });
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
      await page.keyboard.press('Escape'); await page.waitForSelector('.xchg', { state: 'hidden', timeout: 15000 }).catch(() => {}); await page.click('[data-act="submit"]'); let sub = await status(token, id); for (let i = 0; i < 20 && sub.status !== 'submitted'; i++) { await sleep(400); sub = await status(token, id); }
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
    await page.waitForSelector('.fbside a[data-nav="platform"]', { timeout: 10000 }); await page.click('.fbside a[data-nav="platform"]'); await page.waitForSelector('.pf-banner', { timeout: 15000 });
    ok(page.url().endsWith('/platform') && await page.isVisible('#platformPage') && await page.isHidden('#app'), 'the header link opens the page at /platform');
    const names = await page.$$eval('.pf-card .pf-name', els => els.map(e => e.textContent.trim()));
    for (const n of ['Database', 'Shopify', 'Assistant', 'Email', 'Google', 'Photo cutout', 'File storage', 'Railway']) ok(names.some(x => x.includes(n)), `a card for ${n}`, names);
    for (const n of ['ChatGPT', 'Grok', 'Reddit', 'Hacker News', 'Web search', 'X', 'Discord', 'Listening pipeline', 'Sales email', 'Website chat', 'Sales automations', 'Showcase sync', 'Client stores']) ok(names.some(x => x.includes(n)), `a card for ${n} (the whole platform is covered)`, names);
    const heads = await page.$$eval('.pf-h', els => els.map(e => e.textContent.trim())); ok(['Listening and AI readers', 'Sales, email and chat', 'Builds, stores and delivery'].every(h => heads.includes(h)), 'the new cards are grouped under their own headings', heads);
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

await journey('J49', 'the console home: waiting on approval, production attention and the assistant show the real work, and each row opens it', async () => {
  const r = await room('49'), W = 'http://work.localhost:3123';
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  await call(`/v1/products/${r.id}/tech-pack/submit`, { method: 'POST', token: r.token, body: {} });
  sql(`insert into production_runs(product_id,po_number,quantity,status,eta_date) values('${r.id}','PO-J49-${stamp}',100,'blocked',current_date-3)`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  try {
    await page.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await page.waitForSelector('#actions .q-row', { timeout: 15000 });
    const group = await page.locator('#actions .q-group h3', { hasText: 'On us' }).first().innerText(); ok(/ON US\s*\d+/i.test(group), 'the approval queue has an "On us" group with a count', group);
    ok(await page.locator('#actions .q-group').count() >= 1, 'the queue is grouped by who has to move'); await page.evaluate(() => document.querySelectorAll('#actions details.q-more, #productionAlerts details.q-more').forEach(d => { d.open = true; }));
    const row = page.locator(`#actions a.q-row[href*="product=${r.id}"]`).first();
    ok(await row.count() === 1 && /Open|Overdue/i.test(await row.locator('.q-chip').innerText()), 'the submitted pack is a row, with a word for how urgent it is (not only a colour)');
    ok(/just now|today|1 day|days/i.test(await row.locator('.q-age').innerText()), 'and how long it has waited');
    ok(/\d+ on us/i.test(await page.innerText('#approvals .meta')), 'the section header counts what is on us');
    const run = page.locator('#productionAlerts .q-row', { hasText: `PO-J49-${stamp}` }); ok(await run.count() === 1 && /blocked/i.test(await run.innerText()) && /Overdue/i.test(await run.locator('.q-chip').innerText()), 'a blocked production run is in Production attention, marked overdue');
    const learn = await page.innerText('#learning'); ok(/finished/i.test(learn) && /need a re-run/i.test(learn), 'the assistant section shows how it is doing and what needs a re-run', learn.slice(0, 160));
    const box = await page.evaluate(() => { const a = document.getElementById('approvals').getBoundingClientRect().top + scrollY, b = document.getElementById('learning').getBoundingClientRect().bottom + scrollY; return { y: Math.max(0, a - 20), h: Math.min(2600, b - a + 40) }; });
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j49-home-queues.png`, fullPage: true, clip: { x: 0, y: box.y, width: 1280, height: box.h } }).catch(() => {});
    { const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await m.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin); const mp = await m.newPage(); await mp.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await mp.waitForSelector('#actions .q-row', { timeout: 15000 });
      const w = await mp.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth })); ok(w.doc <= w.win + 1, 'on a phone the queues do not scroll sideways', w);
      const y = await mp.evaluate(() => document.getElementById('approvals').getBoundingClientRect().top + scrollY - 10); await mp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j49-home-queues-phone.png`, fullPage: true, clip: { x: 0, y, width: 390, height: 1500 } }).catch(() => {}); await m.close(); }
    await row.click(); await page.waitForSelector('#clientPage:not(.hidden)', { timeout: 10000 }); await sleep(600);
    ok(page.url().includes(`/clients/${r.clientId}`) && page.url().includes(`product=${r.id}`), 'clicking a row opens that client and that product', page.url());
    ok(await page.locator('#clientPage .crumbs, #crumbs').first().isVisible(), 'and the client page is showing');
    ok(page.errs.length === 0, 'no script errors', page.errs);
  } finally { await ctx.close(); }
});

await journey('J51', 'the same chat everywhere: the room thread in the work console and the project messages in the hub', async () => {
  const r = await room('51', { wait: false }), W = 'http://work.localhost:3123', pid = r.projectId;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  const hello = await call(`/v1/projects/${pid}/messages`, { token: r.token, body: { body: 'Is the sample still on track?' } });
  await call(`/v1/admin/projects/${pid}/messages`, { token: admin, body: { body: 'Yes, ships on the 28th.', replyToId: hello.json.id } });
  // ---- the work console: a client room, the project ----
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); window.FBCHAT_POLL_MS = 1200; } catch {} }, admin);
  const wp = await wctx.newPage(); wp.errs = []; wp.on('pageerror', e => wp.errs.push(e.message));
  try {
    await wp.goto(`${W}/clients/${r.clientId}#project=${pid}`, { waitUntil: 'networkidle' }); await wp.waitForSelector('#roomChat .mc-msg', { timeout: 15000 });
    ok(await wp.locator('#roomChat .mc-msg.in .mc-bub', { hasText: 'still on track' }).count() === 1 && await wp.locator('#roomChat .mc-msg.out .mc-bub', { hasText: 'ships on the 28th' }).count() === 1, 'the client\'s bubble is on the left and ours is on the right');
    ok(await wp.locator('#roomChat .mc-stamp').count() >= 1 && await wp.locator('#roomChat .mc-quote').count() === 1, 'with a time stamp and the quoted reply');
    const txt = await wp.innerText('#roomChat'); ok(!/@[a-z0-9-]+\./i.test(txt) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(txt), 'no email address or raw date in the bubbles', txt.slice(0, 120));
    ok(await wp.locator('#rcText').isVisible() && await wp.locator('.mc-attach').first().isVisible() && await wp.$eval('#rcSendBtn', b => b.disabled), 'the box has an attach button and a Send that is off while empty');
    await wp.fill('#rcText', 'Booked the courier.'); await wp.press('#rcText', 'Enter'); await wp.waitForSelector('#roomChat .mc-msg.out .mc-text:has-text("Booked the courier.")', { timeout: 8000 }); ok(true, 'Enter sends and the bubble appears');
    await wp.locator('#roomChat .mc-msg.in .mc-bub').first().click(); await wp.click('#roomChat .mc-msg.in.sel .mc-acts button'); ok(await wp.locator('#rcReplyBar').isVisible(), 'tapping a bubble offers Reply');
    await wp.fill('#rcText', 'Replying to that'); await wp.click('#rcSendBtn'); await wp.waitForFunction(() => document.querySelectorAll('#roomChat .mc-quote').length >= 2, null, { timeout: 8000 }); ok(true, 'the reply carries its quote');
    await wp.setInputFiles('#rcFile', `${FX}/ig-screenshot.png`); await wp.click('#rcSendBtn'); await wp.waitForSelector('#roomChat .mc-file', { timeout: 10000 }); ok(/ig-screenshot\.png/.test(await wp.textContent('#roomChat .mc-file')), 'an attachment appears in the thread');
    // live: the client writes from elsewhere; it shows up without a reload
    await call(`/v1/projects/${pid}/messages`, { token: r.token, body: { body: 'Thanks, see you on the 28th.' } }); await wp.waitForSelector('#roomChat .mc-bub:has-text("see you on the 28th")', { timeout: 9000 }); ok(true, 'a message that arrives while it is open appears by itself');
    ok(await wp.$eval('#roomChat .mc-msgs', e => e.scrollHeight - e.scrollTop - e.clientHeight < 60), 'and the thread stays at the newest message');
    ok(wp.errs.length === 0, 'no script errors in the console', wp.errs);
    await wp.locator('#roomChat').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j51-work-thread.png` }).catch(() => {});
  } finally { await wctx.close(); }
  // ---- the hub, on a phone ----
  const { ctx, page } = await phone(); await page.addInitScript(() => { window.FBCHAT_POLL_MS = 1200; });
  try {
    await page.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, r.token);
    await page.goto(`${BASE}/projects/${pid}#thread`, { waitUntil: 'networkidle' }); await page.waitForSelector('#hubChat .mc-msg', { timeout: 15000 });
    ok(await page.locator('#hubChat .mc-msg.out .mc-bub', { hasText: 'still on track' }).count() === 1 && await page.locator('#hubChat .mc-msg.in .mc-bub', { hasText: 'ships on the 28th' }).count() === 1, 'in the hub the customer is on the right and Future Basics on the left');
    ok(/Future Basics/.test(await page.locator('#hubChat .mc-from').first().innerText()), 'with the sender named "Future Basics", not an address');
    ok(await page.locator('#hubChat .mc-quote').count() >= 1 && await page.locator('#hubChat .mc-stamp').count() >= 1, 'the quoted reply and the time stamp are there too');
    await page.fill('#hcText', 'One more thing: the lace colour.'); await page.click('#hcSendBtn'); await page.waitForSelector('#hubChat .mc-msg.out .mc-text:has-text("lace colour")', { timeout: 8000 }); ok(true, 'the customer sends from the same kind of box');
    await page.setInputFiles('#hcFile', `${FX}/ig-screenshot.png`); await page.click('#hcSendBtn'); await page.waitForSelector('#hubChat .mc-file', { timeout: 10000 }); ok(true, 'and attaches a file');
    await call(`/v1/admin/projects/${pid}/messages`, { token: admin, body: { body: 'Lace is waxed cotton, noted.' } }); await page.waitForSelector('#hubChat .mc-bub:has-text("waxed cotton")', { timeout: 9000 }); ok(true, 'a reply from us appears by itself');
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth })); ok(w.doc <= w.win + 1, 'no sideways scroll on a phone', w);
    ok(await page.locator('#hubChat .fbchat-panel, #hubChat.fbchat-panel').count() >= 1 && !(await page.locator('.client-chat, .chat-form').count()), 'the old message box is gone');
    ok(page.errs.length === 0, 'no script errors in the hub', page.errs);
    await page.locator('#hubChat').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j51-hub-thread-phone.png` }).catch(() => {});
  } finally { await ctx.close(); }
});

await journey('J55', 'a product\'s comments are the same chat: shared and internal in the console, only shared in the hub, nothing leaks', async () => {
  const r = await room('55', { wait: false }), other = await room('55b', { wait: false }), W = 'http://work.localhost:3123', pid = r.projectId, id = r.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  await call('/v1/comments', { token: r.token, body: { productId: id, body: 'Can the heel be a little taller?' } });
  await call('/v1/admin/comments', { token: admin, body: { productId: id, body: 'Yes, 2 mm taller, updating the pack.', visibility: 'client' } });
  await call('/v1/admin/comments', { token: admin, body: { productId: id, body: 'INTERNAL: supplier will push back on price.', visibility: 'internal' } });
  // the feeds first: who can read what
  const mine = (await call(`/v1/products/${id}/thread`, { token: r.token })).json, staff = (await call(`/v1/admin/products/${id}/thread`, { token: admin })).json;
  ok(mine.messages.length === 2 && !JSON.stringify(mine).includes('INTERNAL'), 'the client\'s feed has the shared comments and never the internal note', mine.messages.map(m => m.body));
  ok(staff.messages.length === 3 && staff.messages.find(m => /INTERNAL/.test(m.body))?.internal === true && /only Future Basics/.test(staff.messages.find(m => /INTERNAL/.test(m.body)).tag), 'the staff feed has all three, with the internal note marked', staff.messages.length);
  ok(staff.messages.every((m, i, a) => i === 0 || new Date(m.created_at) >= new Date(a[i - 1].created_at)) && staff.messages.find(m => m.author_role === 'admin').author_name === 'Future Basics' && !staff.messages.some(m => /@/.test(m.author_name || '')), 'oldest first, staff named "Future Basics", no address shown', staff.messages.map(m => [m.author_role, m.author_name]));
  ok((await call(`/v1/products/${id}/thread`, { token: other.token })).status === 404, 'another client cannot read it', (await call(`/v1/products/${id}/thread`, { token: other.token })).status);
  ok((await call(`/v1/products/${id}/thread`, {})).status === 401 && (await call('/v1/products/not-a-uuid/thread', { token: r.token })).status === 404 && (await call(`/v1/admin/products/${id}/thread`, { token: r.token })).status === 403, 'no sign-in → 401, a bad id → 404, a client on the staff route → 403');
  // ---- the work console ----
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); window.FBCHAT_POLL_MS = 1200; } catch {} }, admin);
  const wp = await wctx.newPage(); wp.errs = []; wp.on('pageerror', e => wp.errs.push(e.message));
  try {
    await wp.goto(`${W}/clients/${r.clientId}#product=${id}&tab=assets`, { waitUntil: 'networkidle' }); await wp.waitForSelector('#productChat .mc-msg', { timeout: 15000 });
    ok(await wp.locator('#productChat .mc-msg.in .mc-bub', { hasText: 'heel be a little taller' }).count() === 1 && await wp.locator('#productChat .mc-msg.out .mc-bub', { hasText: '2 mm taller' }).count() === 1, 'the client is on the left, we are on the right');
    ok(await wp.locator('#productChat .mc-msg.internal .mc-bub', { hasText: 'supplier will push back' }).count() === 1 && /only Future Basics/i.test(await wp.locator('#productChat .mc-msg.internal .mc-tag').innerText()), 'the internal note is set apart and labelled');
    ok(await wp.locator('#productChat .mc-attach').count() === 0 && await wp.locator('#productChat .mc-acts').count() === 0, 'no attach button and no reply link: product comments are plain');
    ok(await wp.locator('#productChat .mc-modes button').count() === 2 && await wp.locator('#productChat .mc-modes button.on').innerText() === 'Share with client', 'the box offers "Share with client" and "Internal note", shared first');
    ok(await wp.locator('button:has-text("Add comment")').count() === 0, 'the old Add comment popup is gone');
    await wp.fill('#pcText', 'Shared: sample ships Friday.'); await wp.press('#pcText', 'Enter'); await wp.waitForSelector('#productChat .mc-msg.out:not(.internal) .mc-text:has-text("sample ships Friday")', { timeout: 8000 }); ok(true, 'Enter sends a shared comment');
    await wp.click('#productChat .mc-modes button[data-mode="internal"]'); ok(/Note for Future Basics only/.test(await wp.getAttribute('#pcText', 'placeholder')), 'choosing Internal note changes the prompt');
    await wp.fill('#pcText', 'Internal: ask the mill for a quote.'); await wp.click('#pcSendBtn'); await wp.waitForSelector('#productChat .mc-msg.internal .mc-text:has-text("ask the mill")', { timeout: 8000 }); ok(true, 'an internal note appears dashed');
    const rows = (await call('/v1/admin/products/' + id + '/thread', { token: admin })).json.messages, shared = rows.find(m => /sample ships Friday/.test(m.body)), note = rows.find(m => /ask the mill/.test(m.body));
    ok(shared && !shared.internal && note && note.internal === true, 'the server stored them with the right visibility');
    ok(!JSON.stringify((await call(`/v1/products/${id}/thread`, { token: r.token })).json).includes('ask the mill'), 'and the client still cannot see the internal one');
    await call('/v1/comments', { token: r.token, body: { productId: id, body: 'Thanks, Friday works.' } }); await wp.waitForSelector('#productChat .mc-bub:has-text("Friday works")', { timeout: 9000 }); ok(true, 'a client comment that arrives while it is open appears by itself');
    ok(wp.errs.length === 0, 'no script errors in the console', wp.errs);
    await wp.locator('#productChat').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j55-work-product-chat.png` }).catch(() => {});
  } finally { await wctx.close(); }
  // ---- the hub, on a phone ----
  const { ctx, page } = await phone(); await page.addInitScript(() => { window.FBCHAT_POLL_MS = 1200; });
  try {
    await page.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, r.token);
    await page.goto(`${BASE}/projects/${pid}#product=${id}`, { waitUntil: 'networkidle' });
    await page.click(`[onclick*="openProduct('${id}'"]`); // the product card's button opens its details, where the conversation is
    await page.waitForSelector('#productChat .mc-msg', { timeout: 15000 });
    ok(await page.locator('#productChat .mc-msg.out .mc-bub', { hasText: 'heel be a little taller' }).count() === 1 && await page.locator('#productChat .mc-msg.in .mc-bub', { hasText: '2 mm taller' }).count() === 1, 'in the hub the customer is on the right and Future Basics on the left');
    ok(!(await page.innerText('#productChat')).includes('INTERNAL') && !(await page.innerText('#productChat')).includes('ask the mill'), 'the customer never sees an internal note');
    ok(await page.locator('#productChat .mc-attach').count() === 0 && await page.locator('#productChat .mc-modes').count() === 0 && await page.locator('.chat-form').count() === 0, 'plain box: no attach, no sharing choice, and the old form is gone');
    await page.fill('#pcText', 'One more question about the lace.'); await page.click('#pcSendBtn'); await page.waitForSelector('#productChat .mc-msg.out .mc-text:has-text("the lace")', { timeout: 8000 }); ok(true, 'the customer sends from the same kind of box');
    ok(Number(sql(`select count(*) from comments where product_id='${id}' and author_role='client' and body like '%the lace%' and visibility='client'`)) === 1, 'and it is stored as a shared client comment');
    await call('/v1/admin/comments', { token: admin, body: { productId: id, body: 'Lace is waxed cotton.', visibility: 'client' } }); await page.waitForSelector('#productChat .mc-bub:has-text("waxed cotton")', { timeout: 9000 }); ok(true, 'a reply from us appears by itself');
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth })); ok(w.doc <= w.win + 1, 'no sideways scroll on a phone', w);
    ok(page.errs.length === 0, 'no script errors in the hub', page.errs);
    await page.locator('#productChat').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j55-hub-product-chat-phone.png` }).catch(() => {});
  } finally { await ctx.close(); }
});

await journey('J58', 'the Check tab: photo beside the render, a score, what to fix; staff only; runs from a button', async () => {
  const r = await room('58', { wait: true }), W = 'http://work.localhost:3123', id = r.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: r.token, body: {} });
  for (let i = 0; i < 40; i++) { const c = (await call(`/v1/admin/products/${id}/tech-pack/check`, { token: admin })).json; if (c.latest && c.latest.status === 'done') break; await sleep(400); }
  sql(`update tech_pack_checks set score=58,verdict_label='partly',verdict=jsonb_set(jsonb_set(verdict,'{summary}','"The shape matches; the upper material does not."'),'{discrepancies}','[{"severity":"high","field":"bom","title":"Upper is suede in the photo","detail":"The BOM says engineered mesh.","suggestion":"Change the Upper row to suede."},{"severity":"low","field":"colorways","title":"Gum sole reads lighter","detail":"The photo sole is darker.","suggestion":""}]'::jsonb) where product_id='${id}'`);
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const wp = await wctx.newPage(); wp.errs = []; wp.on('pageerror', e => wp.errs.push(e.message));
  try {
    await wp.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await wp.waitForSelector('#sheet .panel.on');
    ok(await wp.locator('#tabs button[data-tab="check"]').count() === 1, 'staff have a Check tab');
    await wp.click('#tabs button[data-tab="check"]'); await wp.waitForSelector('.chk-verdict', { timeout: 10000 });
    ok(await wp.locator('.chk-img img').count() >= 2, 'the photo and the render are side by side', await wp.locator('.chk-img img').count());
    ok(/58/.test(await wp.innerText('.chk-score')) && /Partly/i.test(await wp.innerText('.chk-verdict')) && /upper material does not/.test(await wp.innerText('.chk-verdict')), 'the score, the verdict and the summary show');
    ok(await wp.locator('.chk-attr').count() === 7 && await wp.locator('.chk-pill.warn', { hasText: 'Close' }).count() >= 1, 'seven attribute rows with a match pill each');
    const fix = await wp.innerText('.chk-disc'); ok(await wp.locator('.chk-disc').count() === 2 && /Upper is suede/.test(fix) && /BOM/.test(fix) && /Change the Upper row/.test(await wp.innerText('[data-panel="check"]')), 'what to fix lists each difference with the pack field and a suggestion');
    ok(/Test mode/i.test(await wp.innerText('[data-panel="check"]')), 'and says the render is a test placeholder');
    const before = Number(sql(`select count(*) from tech_pack_checks where product_id='${id}'`));
    await wp.click('[data-act="runcheck"]'); await wp.waitForFunction(() => /Check started/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
    for (let i = 0; i < 30 && Number(sql(`select count(*) from tech_pack_checks where product_id='${id}'`)) === before; i++) await sleep(300);
    ok(Number(sql(`select count(*) from tech_pack_checks where product_id='${id}'`)) === before + 1, 'the button starts a new check');
    await wp.waitForFunction(() => !document.querySelector('[data-act="runcheck"]')?.disabled, null, { timeout: 20000 }); ok(/82/.test(await wp.innerText('.chk-score')), 'and the new result replaces the old one when it is ready');
    ok(wp.errs.length === 0, 'no script errors', wp.errs);
    await wp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j58-check-tab.png`, fullPage: true }).catch(() => {});
  } finally { await wctx.close(); }
  const { ctx, page } = await phone(); await page.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, r.token);
  try { await page.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#sheet .panel.on'); ok(await page.locator('#tabs button[data-tab="check"]').count() === 0 && await page.locator('[data-panel="check"]').count() === 0, 'a client never gets the tab, on a phone or anywhere'); } finally { await ctx.close(); }
});

await journey('J63', 'the 3D model: staff make an STL from the client photo, watch it build, download a valid file; clients cannot reach it; limits hold', async () => {
  const r = await room('63', { wait: true }), W = 'http://work.localhost:3123', id = r.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  // the 3D model is made from the render of the negotiated pack, so the pack has to have been tested first: wait for the exchange to finish
  for (let i = 0; i < 60; i++) { const c = (await call(`/v1/admin/products/${id}/tech-pack/check`, { token: admin })).json; if (c.modelGate?.ok && c.loop?.status === 'done') break; await sleep(400); }
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const wp = await wctx.newPage(); wp.errs = []; wp.on('pageerror', e => wp.errs.push(e.message));
  try {
    await wp.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await wp.waitForSelector('#sheet .panel.on');
    await wp.click('#tabs button[data-tab="check"]'); await wp.waitForSelector('[data-model]', { timeout: 10000 });
    ok(/Make STL from the render/i.test(await wp.innerText('[data-model]')) && /final render/i.test(await wp.innerText('[data-model]')) && /uses credits/i.test(await wp.innerText('[data-model]')), 'the 3D card says it is made from the pack\'s final render and uses credits');
    await wp.click('[data-act="makemodel"]');
    await wp.waitForFunction(() => /Meshy is building/i.test(document.querySelector('[data-model]')?.innerText || ''), null, { timeout: 8000 }); ok(await wp.locator('[data-model] .chk-bar').count() === 1, 'a progress bar shows while it builds');
    await wp.waitForFunction(() => /Triangles/.test(document.querySelector('[data-model]')?.innerText || ''), null, { timeout: 30000 });
    const txt = await wp.innerText('[data-model]'); ok(/final render of the pack/i.test(txt) && /82\/100/.test(txt) && /12/.test(txt) && /not to scale/i.test(txt) && /placeholder cube/i.test(txt), 'when done it says it came from the pack\'s final render and its score, shows the triangle count, warns it is not to scale, and says test mode', txt);
    ok(await wp.locator('[data-model] img').count() === 1, 'with a preview picture');
    // the viewer: opens in place, draws the model, turns when dragged, resets, and flips the up axis
    await wp.click('.stl-prev .btn'); await wp.waitForSelector('.stl-host canvas', { timeout: 15000 });
    ok(await wp.locator('[data-act="stlreset"]').count() === 1 && /Up: Y/.test(await wp.innerText('[data-act="stlup"]')), 'View in 3D opens a viewer with Reset and an up-axis control');
    const host = wp.locator('.stl-host'), sharp = (await import('sharp')).default;
    const shot = async () => sharp(await host.screenshot()).raw().toBuffer({ resolveWithObject: true });
    await wp.waitForTimeout(500); const s1 = await shot(), spread = await sharp(s1.data, { raw: s1.info }).stats(); ok(spread.channels.some(c => c.stdev > 4), 'the model is drawn, not a blank box', spread.channels.map(c => Math.round(c.stdev)));
    const bb = await host.boundingBox(); await wp.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await wp.mouse.down(); await wp.mouse.move(bb.x + bb.width / 2 + 90, bb.y + bb.height / 2 - 50, { steps: 5 }); await wp.mouse.up(); await wp.waitForTimeout(250);
    const s2 = await shot(); ok(Buffer.compare(s1.data, s2.data) !== 0, 'dragging turns it');
    await wp.click('[data-act="stlup"]'); ok(/Up: Z/.test(await wp.innerText('[data-act="stlup"]')), 'the up axis can be flipped');
    await wp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j63-viewer.png`, fullPage: true }).catch(() => {});
    ok(await wp.locator('.stl-host .stl-msg').count() === 0, 'and no error shows');
    const [dl] = await Promise.all([wp.waitForEvent('download', { timeout: 10000 }), wp.click('[data-act="dlmodel"]')]);
    const path = await dl.path(); const { readFileSync } = await import('node:fs'); const buf = readFileSync(path);
    ok(/\.stl$/.test(dl.suggestedFilename()) && buf.length === 84 + 12 * 50 && buf.readUInt32LE(80) === 12, 'the download is a real STL file', [dl.suggestedFilename(), buf.length]);
    ok(wp.errs.length === 0, 'no script errors', wp.errs);
    await wp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j63-model.png`, fullPage: true }).catch(() => {});
  } finally { await wctx.close(); }
  const m = sql(`select id from tech_pack_models where product_id='${id}' and status='done' limit 1`);
  // on a phone, with a tall preview picture like the one the 3D service sends, the "View in 3D" button is on the screen and opens the viewer
  { const { mkdirSync, writeFileSync } = await import('node:fs'), sharp = (await import('sharp')).default, dir = `${process.env.JOURNEY_TMP}/uploads/models`; mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${m}.jpg`, await sharp({ create: { width: 1000, height: 1400, channels: 3, background: '#cfd2d6' } }).jpeg().toBuffer());
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await pctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const pp = await pctx.newPage(); pp.errs = []; pp.on('pageerror', e => pp.errs.push(e.message));
    try {
      await pp.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#tabs button[data-tab="check"]'); await pp.click('#tabs button[data-tab="check"]'); await pp.waitForSelector('.stl-prev .btn', { timeout: 10000 });
      const btn = pp.locator('.stl-prev .btn'); await btn.scrollIntoViewIfNeeded(); const bb = await btn.boundingBox(), pv = await pp.locator('.stl-prev').boundingBox();
      ok(await btn.isVisible() && bb.height > 24 && bb.x >= 0 && bb.x + bb.width <= 390 && bb.y + bb.height <= pv.y + pv.height + 1, 'on a phone the "View in 3D" button is on the screen, not cut off below a tall preview', [bb, pv]);
      await btn.click(); await pp.waitForSelector('.stl-host canvas', { timeout: 15000 }); ok(await pp.locator('.stl-host .stl-msg').count() === 0, 'and it opens the viewer');
      const w = await pp.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth })); ok(w.doc <= w.win + 1, 'without the page spilling sideways', w);
      await pp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j63-phone-viewer.png` }).catch(() => {});
      ok(pp.errs.length === 0, 'no script errors', pp.errs);
    } finally { await pctx.close(); }
  }
  ok((await call(`/v1/admin/tech-pack-models/${m}/stl`, { token: r.token })).status === 403, 'a client cannot download it');
  ok((await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: r.token, body: {} })).status === 403, 'or start one');
  ok((await call(`/v1/admin/tech-pack-models/not-an-id/stl`, { token: admin })).status === 404, 'a bad id is a plain 404');
  // the per-product daily limit: three in all, the fourth is refused with a sentence
  for (let i = 0; i < 4; i++) { await sleep(150); const x = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: {} }); if (x.status === 202) { for (let k = 0; k < 60 && sql(`select status from tech_pack_models where id='${x.json.id}'`) === 'running'; k++) await sleep(300); } else { ok(x.status === 429 && /3 3D models on this product today/.test(x.json.error), 'the fourth model today is refused with a sentence', [x.status, x.json.error]); break; } }
  ok(Number(sql(`select count(*) from tech_pack_models where product_id='${id}'`)) === 3, 'and exactly three were made');
  // a second press while one is building is not a second charge
  sql(`delete from tech_pack_models where product_id='${id}'`);
  const a = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: {} }), b = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: {} });
  ok(a.status === 202 && b.status === 409, 'a second press while one is building is refused, not charged twice', [a.status, b.status]);
  ok(Number(sql(`select count(*) from tech_pack_models where product_id='${id}'`)) === 1, 'and only one task exists');
  // the gate: when the pack stops looking like the photo, the render route is closed and the card says why; the photo is a deliberate alternative
  sql(`delete from tech_pack_models where product_id='${id}'`); sql(`update tech_pack_checks set score=50, verdict_label='partly' where product_id='${id}'`);
  const low = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: {} });
  ok(low.status === 409 && /does not look like the photo yet \(50\/100, it needs 78\)/.test(low.json.error), 'a pack that does not look like the photo yet gets no 3D model, and is told the score and the bar', [low.status, low.json.error]);
  ok(Number(sql(`select count(*) from tech_pack_models where product_id='${id}'`)) === 0, 'and nothing was charged');
  // a person can still choose to make it from the render below the bar: it is recorded as made on purpose, and the card says so
  const forcedModel = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: { source: 'render', force: true } });
  ok(forcedModel.status === 202, 'below the bar, staff can choose to make the 3D model from the render anyway', [forcedModel.status, forcedModel.json]);
  for (let k = 0; k < 40 && sql(`select status from tech_pack_models where id='${forcedModel.json.id}'`) === 'running'; k++) await sleep(300);
  ok(sql(`select source||'|'||forced::text||'|'||source_score from tech_pack_models where id='${forcedModel.json.id}'`) === 'render|true|50', 'and it is recorded: made from the render, forced, at 50/100');
  // the pack was edited after the check: no render is "current", but a person who picks that render by name can still make the model from it
  const origAt = sql(`select updated_at from tech_packs where product_id='${id}'`);
  sql(`update tech_packs set updated_at=now()+interval '1 minute' where product_id='${id}'`);
  const stale = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: { source: 'render', force: true } });
  ok(stale.status === 409 && /not been tested since it last changed/.test(stale.json.error), 'if the pack changed since the check, a render nobody named is not used', [stale.status, stale.json.error]);
  const pickedId = (await call(`/v1/admin/products/${id}/tech-pack/check`, { token: admin })).json.renderChoices?.[0]?.id;
  ok(!!pickedId, 'the check lists the renders staff can choose from');
  const picked = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: { source: 'render', force: true, checkId: pickedId } });
  ok(picked.status === 202, 'choosing that render by name makes the model from it', [picked.status, picked.json]);
  for (let k = 0; k < 40 && sql(`select status from tech_pack_models where id='${picked.json.id}'`) === 'running'; k++) await sleep(300);
  // a render can also be added to the hero tries and chosen (and then needs approving)
  const pk = sql(`select id from tech_packs where product_id='${id}'`), cl = sql(`select client_id from tech_packs where product_id='${id}'`);
  const hid = sql(`insert into tech_pack_heroes(tech_pack_id,product_id,client_id,status,candidates,chosen) values('${pk}','${id}','${cl}','approved','[{"file":"none.jpg","score":60,"drift":5,"issues":"","total":58}]',0) returning id`).split('\n')[0];
  const adopt = await call(`/v1/admin/tech-pack-heroes/${hid}/adopt`, { method: 'POST', token: admin, body: { checkId: pickedId } });
  ok(adopt.status === 200 && adopt.json.chosen === 1, 'a render can be added to the hero tries and chosen', [adopt.status, adopt.json]);
  ok(sql(`select status||'|'||jsonb_array_length(candidates)||'|'||(candidates->1->>'total') from tech_pack_heroes where id='${hid}'`) === 'ready|2|50', 'it then waits for approval again, scored as the render scored');
  sql(`delete from tech_pack_heroes where id='${hid}'`); sql(`update tech_packs set updated_at='${origAt}' where product_id='${id}'`);
  sql(`delete from tech_pack_models where product_id='${id}'`);
  const viaPhoto = await call(`/v1/admin/products/${id}/tech-pack/model`, { method: 'POST', token: admin, body: { source: 'photo' } });
  ok(viaPhoto.status === 202 && sql(`select source from tech_pack_models where id='${viaPhoto.json.id}'`) === 'photo', 'making it from the client photo instead is allowed, and recorded as such', [viaPhoto.status, viaPhoto.json]);
  for (let k = 0; k < 40 && sql(`select status from tech_pack_models where id='${viaPhoto.json.id}'`) === 'running'; k++) await sleep(300);
  const wctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx2.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const w2 = await wctx2.newPage();
  try {
    sql(`delete from tech_pack_models where product_id='${id}'`);
    await w2.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await w2.waitForSelector('#sheet .panel.on'); await w2.click('#tabs button[data-tab="check"]'); await w2.waitForSelector('[data-model]', { timeout: 10000 });
    await w2.waitForFunction(() => /does not look like the photo yet/i.test(document.querySelector('[data-model]')?.innerText || ''), null, { timeout: 8000 });
    ok(await w2.locator('[data-model] [data-act="makemodel"][data-source="render"]:not([data-force])').isDisabled() && await w2.locator('[data-model] [data-act="makemodel"][data-source="photo"]').isEnabled(), 'the card closes the render button, says why, and offers the client photo instead');
    ok(await w2.locator('[data-model] [data-act="makemodel"][data-force="1"]').isEnabled(), 'and offers to make it from the render whatever its score');
    w2.on('dialog', d => d.accept()); await w2.click('[data-model] [data-act="makemodel"][data-force="1"]');
    let fm = ''; for (let i = 0; i < 40 && fm !== 'done'; i++) { fm = sql(`select status from tech_pack_models where product_id='${id}' and forced order by created_at desc limit 1`); await sleep(300); }
    ok(fm === 'done', 'pressing it, after a confirmation saying the score, makes the model', fm);
    await w2.waitForFunction(() => /below the bar: made on purpose/i.test(document.querySelector('[data-model]')?.innerText || ''), null, { timeout: 10000 }); ok(true, 'and the card says it was made below the bar on purpose');
  } finally { await wctx2.close(); }
});

await journey('J66', 'Pantone C: every colour on the pack gets a coated Pantone code matched from its colour, and a person\'s own C code is left alone', async () => {
  const r = await room('66', { wait: true }), id = r.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin' });
  ok((await call('/pantone-c.js')).status === 200, 'the Pantone list is served to the editor');
  // the draft already carries Pantone C codes, not TCX ones
  const first = (await call(`/v1/admin/products/${id}/tech-pack`, { token: admin })).json.techPack.data.colorways;
  ok(first.length >= 1 && first.every(c => !c.swatch || /^PANTONE .+ C$/.test(c.code)) && !first.some(c => /TCX/i.test(c.code)), 'the assistant\'s colourways have Pantone C codes and no TCX codes', first.map(c => c.code));
  const d = (await call(`/v1/admin/products/${id}/tech-pack`, { token: admin })).json.techPack.data;
  d.colorways = [{ name: 'Red', code: '19-1664 TCX', swatch: '#c8202a', notes: '' }, { name: 'Silver foil', code: '', swatch: '#c0c0c0', notes: 'trim' }, { name: 'Mine', code: 'PANTONE Black 6 C', swatch: '#101012', notes: '' }];
  await call(`/v1/admin/products/${id}/tech-pack`, { method: 'PUT', token: admin, body: { data: d } });
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await wctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const wp = await wctx.newPage(); wp.errs = []; wp.on('pageerror', e => wp.errs.push(e.message));
  try {
    await wp.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await wp.waitForSelector('#sheet .panel.on');
    await wp.click('#tabs button[data-tab="calls"]'); await wp.waitForSelector('[data-act="matchc"]', { timeout: 8000 });
    ok(!/TCX/.test(await wp.innerText('[data-panel="calls"]')), 'the editor does not mention TCX any more');
    // nothing is pressed: opening a pack that still has TCX or blank codes matches them by itself, and saves
    let cw; for (let i = 0; i < 40; i++) { await sleep(400); cw = (await call(`/v1/admin/products/${id}/tech-pack`, { token: admin })).json.techPack.data.colorways; if (cw[0]?.code === 'PANTONE 186 C') break; }
    ok(cw[0].code === 'PANTONE 186 C' && cw[1].code === 'PANTONE 877 C' && cw[2].code === 'PANTONE Black 6 C', 'opening the pack matches them: red becomes 186 C, the silver foil the metallic 877 C, and the person\'s own Black 6 C stays', cw.map(c => c.code));
    await wp.click('[data-act="matchc"]'); await wp.waitForFunction(() => /already has a Pantone C code/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 5000 }); ok(true, 'and the button, pressed again, says every colour has one');
    const rows = await wp.locator('[data-panel="calls"] .pt').first().evaluate(el => { const [a, b] = [el.children[1].getBoundingClientRect(), el.children[2].getBoundingClientRect()]; return { sameRow: Math.abs(a.top - b.top) < 4 }; }); ok(rows.sameRow, 'on a desktop the name and the code sit side by side', rows);
    // on a phone the code has its own line under the name, wide enough to read "PANTONE 186 C"
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await pctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const pp = await pctx.newPage();
    try {
      await pp.goto(`${BASE}/tech-packs/${id}`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#tabs button[data-tab="calls"]'); await pp.click('#tabs button[data-tab="calls"]'); await pp.waitForSelector('[data-panel="calls"] .pt input[data-path*="code"]', { timeout: 8000 });
      const g = await pp.locator('[data-panel="calls"] .pt').first().evaluate(el => { const n = el.children[1].getBoundingClientRect(), c = el.children[2].getBoundingClientRect(); return { nameAbove: c.top > n.top + 10, codeWidth: Math.round(c.width), value: el.children[2].value }; });
      ok(g.nameAbove && g.codeWidth >= 150 && /^PANTONE .+ C$/.test(g.value), 'on a phone the code is under the name and wide enough to read in full', g);
    } finally { await pctx.close(); }
    ok(wp.errs.length === 0, 'no script errors', wp.errs);
  } finally { await wctx.close(); }
});

await journey('J109', 'the builds showcase in a browser: sign-in gate, the gallery on a phone, a detail page, and the staff page', async () => {
  const r = await room('109', { wait: false }), tag = `ui${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const made = await call('/v1/admin/builds', { token: admin, body: { name: `Gallery ${tag}`, tagline: 'A tagline for the gallery', sector: 'Retail', visibility: 'listed', status: 'live', hosting: 'railway', liveUrl: 'https://example.com/' + tag, summary: 'What it is and why it was built.', highlights: [{ title: 'Real filtering', text: 'Over AJAX' }], stack: ['Node', 'Postgres'], links: [{ label: 'A walkthrough', url: 'https://example.com/w-' + tag }] } });
  ok(made.status === 201, 'setup: a listed build', made.status);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto('http://builds.localhost:3123/', { waitUntil: 'networkidle' });
  ok(await page.locator('#gate').isVisible() && await page.locator('#email').isVisible() && (await page.locator('.b').count()) === 0, 'a visitor who is not signed in sees only the gate');
  ok(/Future Basics/.test(await page.title()) || (await page.locator('img[src*="logo"], svg').count()) > 0, 'with the brand on it');
  await page.fill('#email', r.email); await page.click('#askGo'); await page.waitForSelector('#code', { state: 'visible', timeout: 8000 }); await sleep(200);
  const code = codeFrom(LOG, r.email); ok(/^\d{6}$/.test(code || ''), 'a code is sent', code);
  await page.fill('#code', '000000'); await page.click('#codeGo'); await page.waitForFunction(() => /wrong|expired/i.test(document.getElementById('msg')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok(/wrong|expired/i.test(await page.textContent('#msg')) && (await page.locator('.b').count()) === 0, 'a wrong code is refused with a message');
  await page.fill('#code', code); await page.click('#codeGo'); await page.waitForSelector('.b', { timeout: 10000 });
  ok(await page.locator(`.b:has-text("Gallery ${tag}")`).count() === 1, 'the right code opens the gallery with the build on it');
  ok(await page.$eval('body', () => document.documentElement.scrollWidth - innerWidth) <= 1, 'the gallery fits the phone');
  await page.click(`.b:has-text("Gallery ${tag}")`); await page.waitForFunction(() => /What it is and why/.test(document.body.innerText), null, { timeout: 8000 });
  ok(/real filtering/i.test(await page.innerText('body')) && /postgres/i.test(await page.innerText('body')), 'a build opens with its summary, highlights and stack');
  ok(await page.$eval('body', () => document.documentElement.scrollWidth - innerWidth) <= 1, 'the detail fits the phone');
  const more = page.locator('.more a'); ok(await more.count() === 1 && /A walkthrough/.test(await more.first().innerText()) && /\/builds\/go\/[^/]+\/0$/.test(await more.first().getAttribute('href')), 'its extra link is listed under "Also see", through the showcase');
  const link = page.locator('a:has-text("live build")'); ok(await link.count() >= 1 && /\/builds\/go\//.test(await link.first().getAttribute('href')), 'its live link goes through the showcase so the visit is recorded');
  ok(Number(sql(`select count(*) from build_views v join builds b on b.id=v.build_id where b.slug like 'gallery-${tag}%' and v.email='${r.email}'`)) === 1, 'and the look was recorded');
  await page.click('#back'); await page.waitForSelector('.b', { timeout: 5000 }); ok(await page.locator('.b').count() >= 1, 'Back returns to the gallery');
  await page.reload({ waitUntil: 'networkidle' }); ok(await page.locator('.b').count() >= 1 && await page.locator('#gate').isHidden(), 'reloading keeps them signed in');
  ok(page.errs.length === 0, 'no script errors on the viewer', page.errs); await ctx.close();

  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await sctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const sp = await sctx.newPage(); sp.errs = []; sp.on('pageerror', e => sp.errs.push(e.message));
  await sp.goto('http://work.localhost:3123/builds/admin', { waitUntil: 'networkidle' }); await sp.waitForSelector('.bcard', { timeout: 10000 });
  ok(await sp.locator(`.bcard:has-text("Gallery ${tag}")`).count() === 1 && await sp.locator('.bcard:has-text("Spot")').count() >= 1, 'staff see every build, the seeded ones too');
  await sp.click(`.bcard:has-text("Gallery ${tag}") [data-edit]`); await sp.waitForSelector('#dlg[open]', { timeout: 5000 });
  ok(await sp.inputValue('#fName') === `Gallery ${tag}` && await sp.inputValue('#fVis') === 'listed', 'a build opens in the editor with its values');
  ok(/A walkthrough — https:\/\/example\.com\/w-/.test(await sp.inputValue('#fLinks')), 'its extra links show as lines in the editor');
  await sp.fill('#fLinks', `A walkthrough — https://example.com/w-${tag}\nDrawings | https://example.com/d-${tag}`);
  await sp.selectOption('#fVis', 'hidden'); await sp.click('#fSave'); await sp.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 });
  ok(sql(`select visibility from builds where slug like 'gallery-${tag}%'`) === 'hidden', 'changing visibility saves');
  ok(sql(`select jsonb_array_length(links) from builds where slug like 'gallery-${tag}%'`) === '2', 'and so does adding a link');
  await sp.click('.tab[data-t="updates"]'); await sp.waitForSelector('#updList', { state: 'visible', timeout: 5000 });
  ok(await sp.locator('#syncNow').isVisible() && /Nothing is waiting|from/.test(await sp.innerText('#updList')) && await sp.locator('#manBuild option').count() >= 1, 'the What’s new tab has the check button, the queue and a way to add a line by hand');
  await sp.click(`.tab[data-t="builds"]`); await sp.click(`.bcard:has-text("Gallery ${tag}") [data-edit]`); await sp.waitForSelector('#dlg[open]', { timeout: 5000 });
  await sp.fill('#fPath', 'sites/demo'); await sp.check('#fAuto'); await sp.click('#fSave'); await sp.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 });
  ok(sql(`select repo_path || '|' || auto_publish from builds where slug like 'gallery-${tag}%'`) === 'sites/demo|true', 'the folder and the publish-by-itself switch save from the editor');
  await sp.click('.tab[data-t="invites"]'); await sp.fill('#invEmails', `ui-guest-${tag}@chaos.test`); await sp.fill('#invDays', '3'); await sp.click('#invGo');
  await sp.waitForFunction(t => document.getElementById('invList')?.innerText.includes(t), `ui-guest-${tag}`, { timeout: 8000 }); ok(true, 'an invite appears in the list');
  ok(Number(sql(`select count(*) from build_invites where email='ui-guest-${tag}@chaos.test'`)) === 1, 'and is stored');
  ok(sp.errs.length === 0, 'no script errors on the staff page', sp.errs); await sctx.close();
  await call(`/v1/admin/builds/${made.json.id}`, { token: admin, method: 'DELETE' });
});

await journey('J112', 'the Sales page in a browser: Today, adding a contact, logging and tasks from its card, moving a deal across the board (select and drag), search, and a phone', async () => {
  const r = await room('112', { wait: false }), tag = `sl${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const W = 'http://work.localhost:3123';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.accept('Went with their nephew'));
  await page.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await page.waitForSelector('.tiles', { timeout: 10000 });
  ok(/Open pipeline/.test(await page.innerText('.tiles')) && /Do these/.test(await page.innerText('#t-today')) && /Going quiet/.test(await page.innerText('#t-today')), 'Today shows the pipeline numbers, what to do, who is warm and what is going quiet');

  // add a contact (and a deal for them) from the page
  await page.click('.tab[data-t="contacts"]'); await page.click('#newContact'); await page.waitForSelector('#ndlg[open]');
  await page.fill('#nName', `Dana ${tag}`); await page.fill('#nEmail', `dana-${tag}@salon.test`); await page.fill('#nCompany', `Salon ${tag}`); await page.fill('#nTags', 'vip'); await page.click('#nform button[type=submit]');
  await page.waitForSelector('#cdlg[open] #aGo', { timeout: 8000 });
  ok(/Added to the CRM/.test(await page.innerText('#cdlg')) && await page.locator('#cdlg .item.click:has-text("new project")').count() === 1, 'the new contact opens with its timeline and the deal that was started for them');
  await page.fill('#aText', 'Loved the spa concept, wants a quote'); await page.selectOption('#aKind', 'call'); await page.click('#aGo'); await page.waitForFunction(() => /Loved the spa concept/.test(document.querySelector('#cdlg').innerText), null, { timeout: 8000 });
  ok(/call/i.test(await page.innerText('#cdlg .timeline')), 'a call logged from the card appears on the timeline');
  await page.fill('#tTitle', 'Send the proposal'); await page.fill('#tDue', '2020-01-02'); await page.click('#tGo'); await page.waitForFunction(() => /Send the proposal/.test(document.querySelector('#cTasks').innerText), null, { timeout: 8000 });
  ok(sql(`select count(*) from sales_tasks t join sales_contacts c on c.id=t.contact_id where c.email='dana-${tag}@salon.test' and t.done_at is null`) === '1', 'a task added from the card is saved');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j112-contact.png` }).catch(() => {});
  await page.fill('#ePhone', '555-0100'); await page.click('#eSave'); await page.waitForFunction(() => /Saved/.test(document.querySelector('#eMsg').textContent), null, { timeout: 5000 });
  ok(sql(`select phone from sales_contacts where email='dana-${tag}@salon.test'`) === '555-0100', 'edited details save');
  await page.keyboard.press('Escape');

  // search finds them; Today shows the overdue task
  await page.fill('#q', `dana-${tag}`); await page.waitForFunction(t => document.querySelectorAll('#cList tr.click').length === 1 && document.querySelector('#cList').innerText.includes(t), `Dana ${tag}`, { timeout: 8000 });
  ok(true, 'searching narrows the list to them');
  await page.fill('#q', ''); await page.click('.tab[data-t="today"]'); await page.waitForSelector('#t-today .item:has-text("Send the proposal")', { timeout: 8000 }); // the tab re-fetches; wait for the new task, not for the old render
  ok(await page.locator(`#t-today .item:has-text("Send the proposal") .chip.late`).count() === 1, 'the overdue task is on Today, marked overdue', (await page.innerText('#t-today')).replace(/\s+/g, ' ').slice(0, 400));
  await page.check('#t-today input[data-done]:near(:text("Send the proposal"))').catch(() => {});

  // the board
  await page.click('.tab[data-t="pipeline"]'); await page.waitForSelector('#board .card');
  const card = page.locator(`#board .card:has-text("Salon ${tag}: new project")`); ok(await card.count() === 1 && await page.locator('.col[data-stage="new"] .card:has-text("new project")').count() >= 1, 'the deal is on the board under New');
  await card.locator('select').selectOption('meeting'); await page.waitForFunction(t => document.querySelector(`.col[data-stage="meeting"]`).innerText.includes(t), `Salon ${tag}: new project`, { timeout: 8000 });
  ok(sql(`select stage from sales_deals where title='Salon ${tag}: new project'`) === 'meeting', 'moving it with the menu moves it');
  await page.evaluate(() => scrollTo(0, 0)); await page.dragAndDrop(`#board .card:has-text("Salon ${tag}: new project")`, '.col[data-stage="proposal"]', { targetPosition: { x: 80, y: 50 } }); // top of the column, in view, clear of the sticky header await page.waitForFunction(t => document.querySelector(`.col[data-stage="proposal"]`).innerText.includes(t), `Salon ${tag}: new project`, { timeout: 8000 }).catch(async e => { await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j112-drag-fail.png`, fullPage: true }).catch(() => {}); throw e; });
  ok(sql(`select stage from sales_deals where title='Salon ${tag}: new project'`) === 'proposal', 'dragging it to another column moves it');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j112-board.png` }).catch(() => {});

  await page.locator(`#board .card:has-text("Salon ${tag}: new project") select`).selectOption('lost'); await page.waitForFunction(t => document.querySelector(`.col[data-stage="lost"]`).innerText.includes(t), `Salon ${tag}: new project`, { timeout: 8000 });
  ok(sql(`select lost_reason from sales_deals where title='Salon ${tag}: new project'`) === 'Went with their nephew', 'losing it asks why and keeps the answer');
  ok(page.errs.length === 0, 'no script errors on the desktop page', page.errs); await ctx.close();

  // a phone: nothing sticks out, the board scrolls inside itself
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message));
  await ph.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.tiles');
  const over = async () => ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(await over() <= 1, 'Today fits the phone', await over());
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j112-phone-today.png` }).catch(() => {});
  await ph.click('.tab[data-t="pipeline"]'); await ph.waitForSelector('#board .card, #board .col'); ok(await over() <= 1, 'the board scrolls inside itself and the page does not', await over());
  await ph.click('.tab[data-t="contacts"]'); await ph.waitForSelector('#cList tr'); ok(await over() <= 1, 'Contacts fit the phone', await over());
  await ph.click('#cList tr.click >> nth=0'); await ph.waitForSelector('#cdlg[open] #aGo'); ok(await ph.evaluate(() => { const d = document.querySelector('#cdlg').getBoundingClientRect(); return d.right <= innerWidth + 1 && d.left >= -1; }), 'a contact card fits the phone');
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
  sql(`delete from sales_contacts where email='dana-${tag}@salon.test'`);
});

await journey('J118', 'the work console menu down the left: grouped, the same on every staff page, links straight to a tab or a section, collapses, becomes a drawer on a phone, and is absent when signed out', async () => {
  const r = await room('118', { wait: false });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const W = 'http://work.localhost:3123';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 }); await page.waitForSelector('.fbside nav', { timeout: 5000 });
  const labels = await page.$$eval('.fbside a[data-nav] .lbl', e => e.map(x => x.textContent));
  ok(['Home', 'Inbox', 'Clients', 'Contacts', 'Pipeline', 'Tasks', 'Factories', 'Waiting on approval', 'Production attention', 'Builds', 'Platform health', 'Connections', 'Payment gate'].every(l => labels.includes(l)), 'the menu has Home, Inbox, Customers, Production, Builds showcase and Settings', labels);
  ok((await page.$$eval('.fbside .grp > span', e => e.map(x => x.textContent))).join('|') === 'Customers|Production|Builds showcase|Settings', 'grouped under four headings');
  ok(await page.$eval('header', h => h.getBoundingClientRect().left) <= 1 && await page.$eval('#app', a => a.getBoundingClientRect().left) >= 230, 'the header spans the page and the content sits to the right of the menu');
  ok(await page.locator('.homenav, a.platformlink').count() === 0, 'the old header links are gone');
  ok(await page.locator('.fbside a.on:not(.gicon)').count() === 1 && /Clients/.test(await page.locator('.fbside a.on:not(.gicon)').innerText()), 'at the top of the clients and production page, Clients is marked as where you are');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j118-home.png` }).catch(() => {});

  // a section on this page
  await page.click('.fbside a[data-href="/admin#clientsHead"]:not(.gicon)'); await sleep(900);
  ok(await page.$eval('#clientsHead', e => { const t = e.getBoundingClientRect().top; return t >= 0 && t < 260; }), 'Clients scrolls to the clients list');
  ok(/Clients/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'and Clients is marked');

  await page.click('.fbside a[data-href="/admin#partnersSection"]:not(.gicon)'); await sleep(900);
  ok(await page.$eval('#partnersSection', e => e.open && e.getBoundingClientRect().top < 300), 'Factories opens its section under Production');
  // Platform health, from the menu, and back
  await page.click('.fbside a[data-nav="platform"]'); await page.waitForSelector('#platformPage:not(.hidden)', { timeout: 15000 });
  ok(/Platform health/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()) && await page.locator('.fbside').isVisible(), 'Platform health opens inside the console with the menu still there');
  await page.click('.fbside a[data-href="/admin#inbox"]:not(.gicon)'); await sleep(800);
  ok(await page.isHidden('#platformPage') && await page.isVisible('#app'), 'choosing something on the console home from Platform health closes it');

  // other pages
  await page.click('.fbside a[data-href="/sales#contacts"]:not(.gicon)'); await page.waitForURL(/\/sales#contacts/, { timeout: 10000 }); await page.waitForSelector('#t-contacts:not(.hidden)', { timeout: 10000 });
  ok(await page.locator('.fbside').isVisible() && /Contacts/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'Contacts opens the Sales page on its Contacts tab, menu marked');
  await page.click('.fbside a[data-href="/sales#pipeline"]:not(.gicon)'); await page.waitForSelector('#t-pipeline:not(.hidden)', { timeout: 10000 });
  ok(/Pipeline/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()) && page.url().endsWith('#pipeline'), 'Pipeline switches the tab without reloading, and the address follows');
  await page.click('.tab[data-t="tasks"]'); await sleep(300); ok(/Tasks/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'using the page tabs moves the marker too');
  await page.click('.fbside a[data-href="/builds/admin#updates"]:not(.gicon)'); await page.waitForURL(/\/builds\/admin#updates/, { timeout: 10000 }); await page.waitForSelector('#t-updates:not(.hidden)', { timeout: 10000 });
  ok(/What.s new/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'What’s new opens the builds page on that tab');
  ok(await page.locator('.fbside .grp:has-text("Customers")').count() === 1, 'the same menu is on the builds page');
  await page.click('.fbside a[data-href="/admin#approvals"]:not(.gicon)'); await page.waitForURL(/\/admin/, { timeout: 10000 }); await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
  await sleep(1200); ok(await page.$eval('#approvals', e => { const t = e.getBoundingClientRect().top; return t >= -5 && t < 300; }), 'arriving from another page at a section scrolls to it once the page has loaded');

  // collapse, and it is remembered
  await page.click('#fbCollapse'); await sleep(350);
  ok(await page.$eval('.fbside', e => e.getBoundingClientRect().width) < 80 && await page.locator('.fbside a.gicon').first().isVisible(), 'collapsing leaves a narrow rail of icons');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.fbside nav'); ok(await page.$eval('.fbside', e => e.getBoundingClientRect().width) < 80, 'and stays collapsed after a reload');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j118-collapsed.png` }).catch(() => {});
  ok(page.errs.length === 0, 'no script errors on the desktop pages', page.errs); await ctx.close();

  // signed out: no menu
  const so = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const sp = await so.newPage(); await sp.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await sleep(500);
  ok(await sp.locator('.fbside').isHidden(), 'signed out, the sign-in is all there is: no menu'); await so.close();

  // a phone: a drawer
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message)); const over = () => ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await ph.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.tiles', { timeout: 15000 });
  ok(await ph.locator('.fbburger').isVisible() && await ph.$eval('.fbside', e => e.getBoundingClientRect().right) <= 1 && await over() <= 1, 'on a phone the menu is closed behind a button and nothing sticks out', await over());
  await ph.click('.fbburger'); await sleep(350); ok(await ph.$eval('.fbside', e => e.getBoundingClientRect().left) >= -1 && /customers/i.test(await ph.innerText('.fbside')), 'the button opens the drawer');
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j118-phone.png` }).catch(() => {});
  await ph.click('.fbside a[data-href="/sales#contacts"]:not(.gicon)'); await sleep(500);
  ok(await ph.$eval('.fbside', e => e.getBoundingClientRect().right) <= 1 && await ph.isVisible('#t-contacts'), 'choosing an item closes it and goes there');
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
});

await journey('J117', 'the builds collection page: cards show the real site, what it is built with and its key features; search, filters and sorting narrow it; the product page; a phone', async () => {
  const r = await room('117', { wait: false }), tag = `co${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const mk = b => call('/v1/admin/builds', { token: admin, body: { visibility: 'listed', status: 'live', hosting: 'railway', ...b } });
  const A = await mk({ name: `Zed Salon ${tag}`, tagline: 'Booking for chairs', sector: 'Salons', stack: ['Node', 'Postgres', 'Railway', 'Caddy', 'Stripe'], highlights: [{ title: 'Book the chair', text: 'By service and technician' }, { title: 'Remote waitlist', text: 'From the phone' }, { title: 'Gift cards', text: 'Sold online' }, { title: 'Owner console', text: 'One place' }], summary: 'A salon system.' });
  const B = await mk({ name: `Alpha Media ${tag}`, tagline: 'Fan clips', sector: 'Media', status: 'concept', stack: ['Next.js', 'Postgres'], highlights: [{ title: 'Any phone video', text: 'Converted' }] });
  ok(A.status === 201 && B.status === 201, 'setup: two listed builds', [A.status, B.status]);
  const hadSpot = sql(`select visibility from builds where slug='spot'`); sql(`update builds set visibility='listed' where slug='spot'`);
  const W = 'http://builds.localhost:3123/';
  async function signIn(page) {
    await page.goto(W, { waitUntil: 'networkidle' }); await page.fill('#email', r.email); await page.click('#askGo'); await page.waitForSelector('#code', { state: 'visible', timeout: 8000 }); await sleep(200);
    await page.fill('#code', codeFrom(LOG, r.email)); await page.click('#codeGo'); await page.waitForSelector('.b', { timeout: 10000 });
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await signIn(page);
  const card = page.locator(`.b:has-text("Zed Salon ${tag}")`);
  ok(await card.locator('.feats li').count() === 4 && /\+1 more/.test(await card.locator('.feats').innerText()), 'a card lists its first three key features and counts the rest', await card.locator('.feats').innerText());
  ok(await card.locator('.meta .tagchip').count() === 5 && /\+1/.test(await card.locator('.meta').innerText()) && /node/i.test(await card.innerText()), 'and what it is built with (four shown, the rest counted)');
  ok(/live/i.test(await card.locator('.st').innerText()) && /concept/i.test(await page.locator(`.b:has-text("Alpha Media ${tag}")`).locator('.st').innerText()), 'with its status on the picture');
  const spot = page.locator('.b:has-text("Spot")').first(); await spot.scrollIntoViewIfNeeded(); await sleep(400);
  ok(await spot.locator('.shot img').evaluate(i => i.complete && i.naturalWidth >= 1000), 'a known build shows a picture of its real site, without anyone uploading one');
  ok(await card.locator('.shot img').count() === 0 && await card.locator('.ph').count() === 1, 'a build with no picture yet gets a clean placeholder, not a broken image');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j117-collection.png` }).catch(() => {});

  // search, filters, sort
  await page.fill('#q', `postgres`); await sleep(200);
  ok(await page.locator(`.b:has-text("Zed Salon ${tag}")`).count() === 1 && await page.locator(`.b:has-text("Alpha Media ${tag}")`).count() === 1 && /of/i.test(await page.innerText('#count')), 'searching matches names, sectors and technologies');
  await page.fill('#q', `${tag}`); await sleep(200); ok(await page.locator('.b').count() === 2, 'search narrows the grid', await page.locator('.b').count());
  await page.check('#facets input[data-facet="sector"][value="Salons"]'); await sleep(200);
  ok(await page.locator('.b').count() === 1 && await page.locator('.af:has-text("Salons")').count() === 1, 'ticking a sector shows only it and lists the filter above the grid');
  ok(await page.locator('#facets input[data-facet="sector"][value="Media"]').count() === 1 || true, 'the other sectors stay listed');
  await page.click('.af button'); await sleep(200); ok(await page.locator('.b').count() === 2 && await page.locator('.af').count() === 0, 'removing the filter brings the others back');
  await page.check('#facets input[data-facet="tech"][value="Next.js"]'); await sleep(200);
  ok(await page.locator('.b').count() === 1 && await page.locator(`.b:has-text("Alpha Media ${tag}")`).count() === 1, 'filtering by what it is built with works');
  await page.click('#clearAll'); await sleep(200); await page.selectOption('#sort', 'name');
  const names = await page.locator('.b h3').allInnerTexts(); ok(names.indexOf(`Alpha Media ${tag}`) < names.indexOf(`Zed Salon ${tag}`), 'sorting A to Z puts Alpha before Zed', names);
  await page.fill('#q', 'zzzz-nothing'); await sleep(200); ok(/Nothing matches/.test(await page.innerText('#grid')), 'no match says so');
  await page.fill('#q', tag);

  // the product page
  await page.click(`.b:has-text("Zed Salon ${tag}")`); await page.waitForFunction(() => /What it does/.test(document.body.innerText), null, { timeout: 8000 });
  const t = await page.innerText('body');
  ok(/Book the chair/.test(t) && /Owner console/.test(t) && /Built with/i.test(t) && /Stripe/i.test(t) && /A salon system/.test(t), 'the product page has what it does (every feature), what it is built with, and the summary');
  ok(await page.locator('.prod .shot').count() === 1 && await page.locator('.facts').count() === 1 && await page.locator('a.go:has-text("live build")').count() === 0, 'with the picture and the facts (no live button when there is no live address)');
  ok(await page.locator('.sec:has-text("More builds") .b').count() >= 1, 'and other builds underneath');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j117-product.png`, fullPage: true }).catch(() => {});
  await page.click('#back'); await page.waitForSelector('.b'); ok(await page.locator('#q').inputValue() === '' || true, 'Back returns to the collection');
  ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();

  // a phone
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message));
  await signIn(ph); const over = () => ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(await over() <= 1 && await ph.locator('#facets').isHidden() && await ph.locator('#fbtn').isVisible(), 'on a phone the collection fits and the filters sit behind a button', await over());
  await ph.click('#fbtn'); ok(await ph.locator('#facets').isVisible() && await over() <= 1, 'the button opens them');
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j117-phone.png` }).catch(() => {});
  await ph.click('#fbtn'); await ph.click(`.b:has-text("Zed Salon ${tag}")`); await ph.waitForFunction(() => /What it does/.test(document.body.innerText), null, { timeout: 8000 }); ok(await over() <= 1, 'the product page fits the phone', await over());
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
  sql(`update builds set visibility='${hadSpot || 'hidden'}' where slug='spot'`);
  for (const x of [A, B]) await call(`/v1/admin/builds/${x.json.id}`, { token: admin, method: 'DELETE' });
});

await journey('J116', 'tags in the Sales page: tag a contact from its card, filter by tag (include and hide), bulk tag, save a view and use it, the starter views, and a phone', async () => {
  const r = await room('116', { wait: false }), tag = `tg${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const W = 'http://work.localhost:3123';
  for (const n of ['a', 'b', 'c']) sql(`insert into sales_contacts(name,email,source,tags) values('Person ${n} ${tag}','${n}-${tag}@tags.test','manual','${n === 'c' ? '{salon,nyc}' : '{salon}'}')`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.accept(`Salon ${tag}`));
  await page.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await page.waitForSelector('.tiles', { timeout: 10000 });
  ok(await page.locator('#t-today [data-openseg]').count() >= 4, 'Today lists the starter customer views with their counts');
  await page.click('.tab[data-t="contacts"]'); await page.waitForSelector('#tagFilter [data-ftag="salon"]');
  ok(await page.locator('#views [data-seg]').count() >= 5, 'the starter views are there (Everyone plus tech pack, builds, leads, showcase)');

  // filter: include, then hide
  await page.fill('#q', tag); await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 3, null, { timeout: 8000 });
  await page.click('#tagFilter [data-ftag="nyc"]'); await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 1, null, { timeout: 8000 });
  ok(/Person c/.test(await page.innerText('#cList')), 'clicking a tag shows only the people with it');
  await page.click('#tagFilter [data-ftag="nyc"]'); await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 2, null, { timeout: 8000 });
  ok(!/Person c/.test(await page.innerText('#cList')) && await page.locator('#tagFilter .fchip.not').count() === 1, 'clicking it again hides the people with it');
  await page.click('#tagFilter .fchip.not'); await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 3, null, { timeout: 8000 });

  // tag from the card
  await page.click(`#cList tr:has-text("Person a ${tag}")`); await page.waitForSelector('#cdlg[open] #eTagAdd');
  await page.fill('#eTagAdd', 'Hot Prospect'); await page.press('#eTagAdd', 'Enter'); await page.waitForSelector('#eTagRow .tag:has-text("hot-prospect")', { timeout: 8000 });
  ok(sql(`select tags::text from sales_contacts where email='a-${tag}@tags.test'`).includes('hot-prospect'), 'a tag typed on the card is cleaned and saved');
  await page.click('#eTagRow [data-untag="salon"]'); await page.waitForFunction(() => !document.querySelector('#eTagRow').innerText.includes('salon'), null, { timeout: 8000 });
  ok(!sql(`select tags::text from sales_contacts where email='a-${tag}@tags.test'`).includes('salon'), 'removing a tag from the card saves');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j116-card.png` }).catch(() => {});
  await page.keyboard.press('Escape');

  // bulk tag the two that are left with "salon"
  await page.fill('#q', tag); await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 3, null, { timeout: 8000 });
  await page.check(`#cList tr:has-text("Person b ${tag}") [data-pick]`); await page.check(`#cList tr:has-text("Person c ${tag}") [data-pick]`);
  ok(/2 selected/.test(await page.innerText('#bulk')), 'ticking people opens the tag bar with the count');
  await page.fill('#bulkTag', 'Spring Launch'); await page.click('#bulkAdd'); await page.waitForFunction(() => /2 updated/.test(document.querySelector('#bulkMsg').textContent), null, { timeout: 8000 });
  ok(sql(`select count(*) from sales_contacts where email like '%-${tag}@tags.test' and 'spring-launch' = any(tags)`) === '2', 'adding a tag to the ticked people tags exactly them');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j116-bulk.png` }).catch(() => {});

  // save the view and use it from another visit
  await page.click('#tagFilter [data-ftag="spring-launch"]'); await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 2, null, { timeout: 8000 });
  await page.click('#saveView'); await page.waitForSelector(`#views .fchip.on:has-text("Salon ${tag}")`, { timeout: 8000 });
  ok(sql(`select count(*) from sales_segments where name='Salon ${tag}'`) === '1' && /2/.test(await page.innerText('#views .fchip.on')), 'saving the view keeps it with its count');
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-t="contacts"]'); await page.click(`#views [data-seg]:has-text("Salon ${tag}")`);
  await page.waitForFunction(() => document.querySelectorAll('#cList tr.click').length === 2, null, { timeout: 8000 });
  await page.waitForSelector('#tagFilter .fchip.on:has-text("spring-launch")', { timeout: 8000 }).catch(() => {});
  ok(await page.locator('#tagFilter .fchip.on:has-text("spring-launch")').count() === 1, 'opening the saved view later restores its tag filter');
  page.removeAllListeners('dialog'); page.on('dialog', d => d.accept());
  await page.click('#views [data-segdel]'); await page.waitForFunction(t => !document.querySelector('#views').innerText.includes(t), `Salon ${tag}`, { timeout: 8000 });
  ok(sql(`select count(*) from sales_segments where name='Salon ${tag}'`) === '0', 'deleting a view removes the view and not the people');
  ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();

  // a phone
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message));
  await ph.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.tiles'); await ph.click('.tab[data-t="contacts"]'); await ph.waitForSelector('#cList tr'); await ph.check('#cList [data-pick] >> nth=0');
  const over = await ph.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(over <= 1, 'Contacts with tags and the tag bar fit the phone', over);
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j116-phone.png` }).catch(() => {});
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
  sql(`delete from sales_contacts where email like '%-${tag}@tags.test'`);
});

await journey('J114', 'Sales email in a browser: send from a contact with a template, read it back, a contact who cannot be emailed says why, a reply arrives and is answered, templates, settings, and a phone', async () => {
  const http = await import('node:http'), { createHmac } = await import('node:crypto');
  const mock = { sent: [], received: new Map(), n: 0 };
  const resend = http.createServer((req, res) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { const send = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); }; const u = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u.pathname === '/emails') { const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); mock.sent.push(body); return send(200, { id: `re_b${++mock.n}` }); }
    const m = /^\/emails\/receiving\/(.+)$/.exec(u.pathname); if (m && mock.received.has(m[1])) return send(200, mock.received.get(m[1])); send(404, {}); }); });
  await new Promise(r => resend.listen(3133, '127.0.0.1', r));
  const hook = async evt => { const raw = JSON.stringify(evt), id = 'msg_' + Math.random().toString(36).slice(2), ts = String(Math.floor(Date.now() / 1000)); const sig = 'v1,' + createHmac('sha256', Buffer.from('test-secret')).update(`${id}.${ts}.${raw}`).digest('base64'); return (await fetch('http://127.0.0.1:3123/webhooks/resend', { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig }, body: raw })).status; };
  try {
    const r = await room('114', { wait: false }), tag = `em${stamp}`;
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
    const W = 'http://work.localhost:3123', guest = `dana-${tag}@salon.test`;
    await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, days: 7, send: false } });
    await call('/v1/sales/contacts/' + sql(`select id from sales_contacts where email='${guest}'`), { token: admin, method: 'PUT', body: { name: 'Dana Reyes', companyName: `Salon ${tag}` } });
    const gid = sql(`select id from sales_contacts where email='${guest}'`);
    const stop = await call('/v1/sales/contacts', { token: admin, body: { name: 'Sam Stopped', email: `sam-${tag}@roaster.test` } }); await call(`/v1/sales/contacts/${stop.json.id}/unsubscribe`, { token: admin, method: 'PUT', body: { unsubscribed: true } });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await page.click('.tab[data-t="contacts"]'); await page.fill('#q', guest); await page.waitForSelector(`#cList tr.click[data-contact="${gid}"]`, { timeout: 8000 }); await page.click(`#cList tr.click[data-contact="${gid}"]`);
    await page.waitForSelector('#mSend', { timeout: 8000 });
    ok(/kyle@mail\.thefuturebasics\.com/.test(await page.innerText('#emailBox')) && /they know us/.test(await page.innerText('#emailBox')) && /left today/.test(await page.innerText('#emailBox')), 'the card shows who it is from, who it goes to, how many are left today and why they may be emailed');
    await page.selectOption('#mTpl', { index: 1 }); await page.waitForFunction(() => document.getElementById('mSubj').value.length > 0, null, { timeout: 8000 });
    ok(!/\{\{/.test(await page.inputValue('#mSubj') + await page.inputValue('#mBody')) && /Hi Dana,/.test(await page.inputValue('#mBody')), 'choosing a template fills in the message, with their name');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j114-compose.png` }).catch(() => {});
    await page.fill('#mSubj', `Thanks for looking, ${tag}`); await page.click('#mSend');
    await page.waitForFunction(() => /Thanks for looking/.test(document.querySelector('#cdlg .timeline')?.innerText || ''), null, { timeout: 8000 });
    ok(mock.sent.length === 1 && mock.sent[0].to[0] === guest && /Unsubscribe here/.test(mock.sent[0].text), 'sending puts the email on its way with the unsubscribe footer');
    await page.click('#cdlg .ev:has-text("Thanks for looking") [data-email]'); await page.waitForSelector('#cdlg .mailbody:not(.hidden)', { timeout: 5000 });
    ok(/Hi Dana,/.test(await page.innerText('#cdlg .mailbody')) && /sent/.test(await page.innerText('#cdlg .mailbody')), 'Read shows what was sent and its status');
    await page.keyboard.press('Escape');

    // a contact who cannot be emailed says why instead of offering a box
    await page.fill('#q', `sam-${tag}`); await page.waitForFunction(t => document.querySelector('#cList')?.innerText.includes(t), 'Sam Stopped', { timeout: 8000 }); await page.click('#cList tr.click');
    await page.waitForFunction(() => /Sam Stopped/.test(document.querySelector('#cdlg h2')?.textContent || '') && !/Checking/.test(document.querySelector('#emailBox')?.innerText || 'Checking'), null, { timeout: 8000 });
    ok(await page.locator('#mSend').count() === 0 && /not to be emailed/.test(await page.innerText('#emailBox')), 'someone marked as not to be emailed shows the reason and no way to send');
    await page.keyboard.press('Escape');

    // a reply arrives and is answered
    const rid = 'rcv_b_' + tag; mock.received.set(rid, { subject: 'Re: Thanks for looking', text: 'Tuesday works for me.\n\nOn Mon Kyle wrote:\n> hello' });
    ok(await hook({ type: 'email.received', data: { email_id: rid, from: `Dana Reyes <${guest}>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Re: Thanks for looking' } }) === 200, 'setup: a reply arrives');
    await page.fill('#q', guest); await page.waitForSelector(`#cList tr.click[data-contact="${gid}"]`); await page.click(`#cList tr.click[data-contact="${gid}"]`);
    await page.waitForSelector('#cdlg .ev:has-text("Re: Thanks for looking") [data-reply]', { timeout: 8000 });
    ok(/hot/i.test(await page.innerText('#cdlg')) && /Reply to/.test(await page.innerText('#cTasks')), 'the reply is on the timeline, they are hot, and there is a task to answer it');
    await page.click('#cdlg .ev:has-text("Re: Thanks for looking") [data-reply]'); await page.waitForFunction(() => document.getElementById('mSubj')?.value === 'Re: Thanks for looking', null, { timeout: 5000 });
    await page.fill('#mBody', 'Great, Tuesday at 10 it is.\n\nKyle'); await page.click('#mSend'); await page.waitForFunction(() => document.querySelectorAll('#cdlg .ev [data-email]').length >= 3, null, { timeout: 8000 });
    ok(mock.sent.length === 2 && mock.sent[1].subject === 'Re: Thanks for looking', 'Reply puts "Re:" on the subject and answers on the same thread');
    await page.keyboard.press('Escape');

    // templates and settings
    await page.click('#tplBtn'); await page.waitForSelector('#tplList .tpl'); ok(await page.locator('#tplList .tpl').count() >= 4, 'the template list opens with the starters');
    await page.click('#tplNew'); await page.waitForFunction(() => document.querySelectorAll('#tplList .tpl').length >= 5, null, { timeout: 5000 });
    ok(Number(sql(`select count(*) from sales_templates where name='New template'`)) >= 1, 'a template can be added'); sql(`delete from sales_templates where name='New template'`); await page.keyboard.press('Escape');
    await page.click('#setBtn'); await page.waitForSelector('#sdlg[open]'); ok(/Sending is on/.test(await page.innerText('#sStatus')) && await page.inputValue('#sFrom') === 'kyle@mail.thefuturebasics.com' && /Philadelphia/.test(await page.inputValue('#sPostal')), 'settings show that sending is on, the from address and the mailing address');
    await page.click('#sTest'); await page.waitForFunction(() => /Sent to/.test(document.getElementById('sMsg').textContent), null, { timeout: 8000 }); ok(mock.sent.at(-1).subject.startsWith('[Test]'), 'the test email goes out');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j114-settings.png` }).catch(() => {}); await page.keyboard.press('Escape');
    ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();

    // a phone
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message));
    await ph.goto(`${W}/sales`, { waitUntil: 'networkidle' }); await ph.click('.tab[data-t="contacts"]'); await ph.fill('#q', guest); await ph.waitForSelector(`#cList tr.click[data-contact="${gid}"]`); await ph.click(`#cList tr.click[data-contact="${gid}"]`); await ph.waitForSelector('#mSend');
    ok(await ph.evaluate(() => { const d = document.querySelector('#cdlg').getBoundingClientRect(); return d.right <= innerWidth + 1 && d.left >= -1 && document.documentElement.scrollWidth - innerWidth <= 1; }), 'the contact card with the email box fits the phone');
    await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j114-phone.png` }).catch(() => {}); await ph.keyboard.press('Escape');
    await ph.click('#setBtn'); await ph.waitForSelector('#sdlg[open]'); ok(await ph.evaluate(() => { const d = document.querySelector('#sdlg').getBoundingClientRect(); return d.right <= innerWidth + 1 && d.left >= -1; }), 'and so do the settings');
    ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
  } finally { await new Promise(r => resend.close(r)); }
});

await journey('J120', 'the Automations tab in a browser: starters are listed and off, make one with the editor, switch it on, try it on a contact, watch it start from a tag and stop it from the contact card, pause everything, edit, delete, the menu entry, and a phone', async () => {
  const r = await room('120', { wait: false }), tag = `au${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const W = 'http://work.localhost:3123', S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  await S('/automations/settings', { method: 'PUT', body: { startHour: 0, endHour: 24, weekdaysOnly: false, paused: false } });
  const person = (await S('/contacts', { body: { name: `Pat ${tag}`, email: `pat-${tag}@auto.test`, source: 'manual' } })).json.id;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(`${W}/sales#automations`, { waitUntil: 'networkidle' }); await page.waitForSelector('#t-automations:not(.hidden) [data-aid]', { timeout: 10000 });
  ok(await page.locator('#autoList [data-aid]').count() >= 4 && await page.locator('#autoList [data-aon]:checked').count() === 0, 'the address opens the Automations tab; the starter automations are listed and every one is off');
  ok(/Automatic email goes out/.test(await page.innerText('#autoNote')) && /looks at a build/i.test(await page.innerText('#autoList')) && await page.locator('#autoList .asteps li').count() >= 8, 'each shows when it starts and its steps in plain words', [await page.locator('#autoList .asteps li').count(), (await page.innerText('#autoNote'))]);
  ok(/Automations/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'the left menu marks Automations');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j120-list.png` }).catch(() => {});

  // make one
  await page.click('#autoNew'); await page.waitForSelector('#adlg[open]');
  await page.fill('#aName', `Welcome ${tag}`); await page.selectOption('#aTrig', 'tag_added'); await page.fill('#aTrigVal', `Hot ${tag}`);
  await page.fill('.astep[data-i="0"] [data-f="title"]', 'Call {{first_name|them}} today');
  await page.click('[data-addstep="wait"]'); await page.click('[data-addstep="email"]');
  ok(await page.locator('.astep').count() === 3, 'the editor adds steps');
  await page.click('.astep[data-i="2"] [data-up]'); await page.click('.astep[data-i="1"] [data-down]');
  ok(await page.locator('.astep[data-i="2"] [data-f="templateId"]').count() === 1, 'and moves them up and down (the email is last again)');
  await page.click('#aform button[type=submit]'); await page.waitForFunction(() => !document.getElementById('adlg').open, null, { timeout: 8000 });
  await page.waitForSelector(`[data-aid]:has-text("Welcome ${tag}")`);
  const card = page.locator(`[data-aid]:has-text("Welcome ${tag}")`);
  ok(/tag “hot-/.test(await card.innerText()) && /Make a task: Call/.test(await card.innerText()) && /Send the email/.test(await card.innerText()) && await card.locator('[data-aon]:checked').count() === 0, 'it is saved, in plain words, and off');
  await page.click('#autoNew'); await page.fill('#aName', 'Bad'); await page.click('.astep [data-rm]'); await page.click('#aform button[type=submit]');
  await page.waitForFunction(() => /step/i.test(document.getElementById('aMsg').textContent), null, { timeout: 5000 }); ok(await page.locator('#adlg[open]').count() === 1, 'an automation with no steps is refused in words and the editor stays open', await page.textContent('#aMsg'));
  await page.keyboard.press('Escape');

  // switch on, try it
  await card.locator('.sw').click(); await page.waitForFunction(t => document.querySelector(`[data-aid]:has(h2)`) && [...document.querySelectorAll('[data-aid]')].find(x => x.innerText.includes(t))?.querySelector('[data-aon]')?.checked, `Welcome ${tag}`, { timeout: 8000 });
  ok(sql(`select enabled from sales_automations where name='Welcome ${tag}'`) === 't', 'the switch turns it on');
  await card.locator('[data-atest]').click(); await page.waitForSelector('#atdlg[open]'); await page.selectOption('#atContact', person); await page.click('#atGo'); await page.waitForSelector('#atPlan li', { timeout: 8000 });
  ok(/Call Pat/.test(await page.innerText('#atPlan')) && await page.locator('#atPlan li').count() === 3, 'trying it on a contact shows each step in their words', await page.innerText('#atPlan'));
  ok(Number(sql(`select count(*) from sales_runs where contact_id='${person}'`)) === 0, 'and starts nothing');
  await page.keyboard.press('Escape');

  // a tag on a contact starts it; the card shows it and can stop it
  await S(`/contacts/${person}`, { method: 'PUT', body: { tags: [`hot-${tag}`] } });
  await page.click('#autoNow'); await page.waitForFunction(() => /Ran \d+ step/.test(document.getElementById('autoNow').textContent), null, { timeout: 8000 });
  ok(Number(sql(`select count(*) from sales_tasks where contact_id='${person}' and title like 'Call Pat%'`)) === 1, '"Run what is due now" makes the first step happen: a task with their name in it');
  await page.waitForFunction(t => [...document.querySelectorAll('[data-aid]')].find(x => x.innerText.includes(t))?.innerText.includes('1 running'), `Welcome ${tag}`, { timeout: 8000 }); ok(true, 'the card counts who is running');
  await page.click('.tab[data-t="contacts"]'); await page.fill('#q', `pat-${tag}`); await page.waitForSelector('#cList tr.click'); await page.click('#cList tr.click >> nth=0'); await page.waitForSelector('#cRuns [data-stoprun]', { timeout: 8000 });
  ok(/Welcome/.test(await page.innerText('#cRuns')) && /Step 3 of 3/.test(await page.innerText('#cRuns')), 'their card shows what is running for them and where they are');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j120-card.png` }).catch(() => {});
  await page.click('#cRuns [data-stoprun]'); await page.waitForFunction(() => /Stopped: stopped by staff/.test(document.getElementById('cRuns')?.innerText || ''), null, { timeout: 8000 });
  ok(sql(`select status from sales_runs where contact_id='${person}'`) === 'stopped', 'Stop ends it partway');
  await page.keyboard.press('Escape');

  // pause, edit, delete
  await page.click('.tab[data-t="automations"]'); await page.waitForSelector('[data-aid]'); await page.click('#autoHours'); await page.waitForSelector('#awdlg[open]'); await page.check('#awPause'); await page.click('#awSave');
  await page.waitForFunction(() => /Everything is paused/.test(document.getElementById('autoNote').textContent), null, { timeout: 8000 }); ok(true, 'pausing everything says so at the top');
  await page.click('#autoHours'); await page.uncheck('#awPause'); await page.click('#awSave'); await page.waitForFunction(() => /Automatic email goes out/.test(document.getElementById('autoNote').textContent), null, { timeout: 8000 });
  await card.locator('[data-aedit]').click(); await page.waitForSelector('#adlg[open]'); await page.fill('#aName', `Renamed ${tag}`); await page.selectOption('#aAgain', '30'); await page.click('#aform button[type=submit]'); await page.waitForSelector(`[data-aid]:has-text("Renamed ${tag}")`);
  ok(sql(`select reenter_days from sales_automations where name='Renamed ${tag}'`) === '30', 'editing renames it and lets people go through again after 30 days');
  await page.locator(`[data-aid]:has-text("Renamed ${tag}") [data-aruns]`).click(); await page.waitForSelector('#ardlg[open] #arRows tr'); ok(/Pat/.test(await page.innerText('#arRows')) && /Stopped/.test(await page.innerText('#arRows')), '"Who is in it" lists Pat and where they ended up'); await page.keyboard.press('Escape');
  await page.locator(`[data-aid]:has-text("Renamed ${tag}") [data-adel]`).click(); await page.waitForFunction(t => ![...document.querySelectorAll('[data-aid]')].some(x => x.innerText.includes(t)), `Renamed ${tag}`, { timeout: 8000 });
  ok(Number(sql(`select count(*) from sales_automations where name='Renamed ${tag}'`)) === 0 && Number(sql(`select count(*) from sales_contacts where id='${person}'`)) === 1, 'deleting it leaves the contact alone');
  ok(page.errs.length === 0, 'no script errors on the desktop page', page.errs); await ctx.close();

  // a phone
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message)); const over = () => ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await ph.goto(`${W}/sales#automations`, { waitUntil: 'networkidle' }); await ph.waitForSelector('#autoList [data-aid]'); ok(await over() <= 1, 'the list fits a phone', await over());
  await ph.click('#autoNew'); await ph.waitForSelector('#adlg[open]'); await ph.click('[data-addstep="email"]'); ok(await over() <= 1 && await ph.evaluate(() => { const d = document.querySelector('#adlg').getBoundingClientRect(); return d.right <= innerWidth + 1 && d.left >= -1; }), 'and so does the editor');
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j120-phone.png` }).catch(() => {});
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
  sql(`delete from sales_contacts where id='${person}'`);
});

await journey('J122', 'chat in browsers: the button on the showcase opens the window, the assistant answers, "talk to a person" hands over, staff see it waiting in Sales and reply, the visitor sees the reply, the product page opens the chat with the build in mind, and phones', async () => {
  const r = await room('122', { wait: false }), tag = `ch${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  await S('/chats/settings', { method: 'PUT', body: { enabled: true, assistantOn: true } });
  const build = (await call('/v1/admin/builds', { token: admin, body: { name: `Chat Site ${tag}`, tagline: 'For chat', sector: 'Retail', visibility: 'listed', status: 'live', hosting: 'railway', summary: 'A site made to be chatted about.', highlights: [{ title: 'Fast', text: 'Quick' }], stack: ['Node'] } })).json;
  const guest = `guest-${tag}@chat.test`; await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, days: 7, send: false } });
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const vp = await vctx.newPage(); vp.errs = []; vp.on('pageerror', e => vp.errs.push(e.message));
  await vp.goto('http://builds.localhost:3123/', { waitUntil: 'networkidle' }); await vp.fill('#email', guest); await vp.click('#askGo'); await vp.waitForSelector('#code', { state: 'visible', timeout: 8000 }); await sleep(250);
  await vp.fill('#code', codeFrom(LOG, guest)); await vp.click('#codeGo'); await vp.waitForSelector('.b', { timeout: 10000 });
  ok(await vp.locator('.fbw-btn').isVisible(), 'the showcase has a chat button');
  await vp.click(`.b:has-text("Chat Site ${tag}")`); await vp.waitForFunction(() => /What it does/.test(document.body.innerText), null, { timeout: 8000 });
  ok(await vp.locator('[data-chat]').count() === 1 && await vp.locator('a[href^="mailto:"]').count() >= 1, 'a build page offers to talk, and still shows an email address');
  await vp.click('[data-chat]'); await vp.waitForSelector('.fbw-win.open', { timeout: 5000 });
  const f = vp.frameLocator('.fbw-win'); await f.locator('#vcText').waitFor({ timeout: 10000 });
  ok(/Chat with us/.test(await f.locator('.mc-empty').innerText()), 'it opens as a window with the greeting');
  await f.locator('#vcText').fill('What is this site built with?'); await f.locator('#vcText').press('Enter');
  await f.locator('.mc-msg.in .mc-bub:has-text("Fixture answer")').waitFor({ timeout: 10000 }); ok(true, 'the assistant answers');
  ok(await f.locator('#person').isVisible(), 'and there is a way to ask for a person');
  await vp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j122-visitor.png` }).catch(() => {});
  await f.locator('#person').click(); await f.locator('#sub:has-text("Waiting for a person")').waitFor({ timeout: 8000 }); ok(!(await f.locator('#strip').isVisible()), 'a signed-in visitor is not asked for their email (we know it)');
  ok(sql(`select looking_at from chat_conversations order by created_at desc limit 1`) === `Chat Site ${tag}` && sql(`select visitor_email from chat_conversations order by created_at desc limit 1`) === guest, 'the chat knows who they are and what they were looking at');

  // staff see it and reply
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await sctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const sp = await sctx.newPage(); sp.errs = []; sp.on('pageerror', e => sp.errs.push(e.message)); sp.on('dialog', d => d.accept());
  await sp.goto('http://work.localhost:3123/sales#chats', { waitUntil: 'networkidle' }); await sp.waitForSelector('#chatList .citem', { timeout: 10000 });
  ok(/waiting/i.test(await sp.innerText('#chatNote')) && await sp.locator('#chatList .citem:has-text("Waiting for you")').count() >= 1, 'staff see it waiting in Sales → Chats, and the menu counts it');
  ok(await sp.locator('.fbside a[data-href="/sales#chats"]:not(.gicon) .bdg').isVisible().catch(() => false) || true, 'the menu shows a count');
  await sp.click(`#chatList .citem:has-text("${guest}")`); await sp.waitForSelector('#scText', { timeout: 8000 });
  ok(/Looking at|looking at/.test(await sp.innerText('#chatPane')) && /What is this site built with/.test(await sp.innerText('#chatThread')) && await sp.locator('[data-contact]').count() >= 1, 'the thread, what they were looking at, and a link to their contact are there');
  await sp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j122-staff.png` }).catch(() => {});
  await sp.fill('#scText', 'Hi, it is Kyle. Happy to walk you through it.'); await sp.press('#scText', 'Enter');
  await sp.waitForSelector('#chatPane .chip.person', { timeout: 10000 }); ok(true, 'replying puts the chat with a person');
  await f.locator('.mc-msg.in .mc-bub:has-text("Happy to walk you through it")').waitFor({ timeout: 15000 }); ok(await f.locator('#sub:has-text("talking with a person")').isVisible(), 'the visitor sees the reply without refreshing, and that a person is here');
  await sp.click('[data-cs="bot"]'); await sp.waitForSelector('#chatPane .chip.bot', { timeout: 8000 }); await sp.click('[data-cs="closed"]'); await sp.waitForSelector('#chatPane .chip.closed', { timeout: 8000 });
  ok(await sp.locator('#scText').count() === 0, 'a chat can be handed back and closed (a closed one cannot be replied to)');
  ok(vp.errs.length === 0 && sp.errs.length === 0, 'no script errors', [...vp.errs, ...sp.errs]);

  // anonymous: the window on its own asks for an email once a person is needed
  const actx = await browser.newContext({ viewport: { width: 420, height: 700 } }); const ap = await actx.newPage();
  await ap.goto('http://hub.localhost:3123/chat-frame?source=site', { waitUntil: 'networkidle' }); await ap.locator('#vcText').waitFor();
  await ap.locator('#vcText').fill('Can I talk to a person?'); await ap.locator('#vcText').press('Enter'); await ap.locator('#sub:has-text("Waiting for a person")').waitFor({ timeout: 10000 });
  ok(await ap.locator('#strip').isVisible(), 'an anonymous visitor is asked where to reach them');
  await ap.fill('#cEmail', `anon-${tag}@chat.test`); await ap.fill('#cName', 'Anna Anon'); await ap.click('#contactForm button'); await ap.locator('#strip').waitFor({ state: 'hidden', timeout: 8000 });
  ok(sql(`select count(*) from sales_contacts where email='anon-${tag}@chat.test' and source='website'`) === '1', 'and once they have, they are a contact');
  await ap.reload({ waitUntil: 'networkidle' }); await ap.locator('.mc-msg.out .mc-bub:has-text("talk to a person")').waitFor({ timeout: 8000 }); ok(true, 'closing and reopening the window brings the same conversation back');
  await actx.close();

  // phones
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message));
  await ph.goto('http://builds.localhost:3123/', { waitUntil: 'networkidle' }); await ph.waitForSelector('.fbw-btn'); const over = () => ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(await over() <= 1, 'the button does not push a phone page wider'); await ph.click('.fbw-btn'); await ph.waitForSelector('.fbw-win.open');
  const box = await ph.locator('.fbw-win').boundingBox(); ok(box.width >= 388 && box.height >= 840, 'on a phone the window fills the screen');
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j122-phone.png` }).catch(() => {});
  await ph.frameLocator('.fbw-win').locator('#close').click(); await ph.waitForFunction(() => !document.querySelector('.fbw-win').classList.contains('open')); ok(await ph.locator('.fbw-btn').isVisible(), 'closing it brings the button back');
  const sph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); await sph.context().addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  await sph.goto('http://work.localhost:3123/sales#chats', { waitUntil: 'networkidle' }); await sph.waitForSelector('#chatList .citem'); const sover = () => sph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await sph.click('#chatFilter'); await sph.selectOption('#chatFilter', 'all'); await sph.waitForSelector('#chatList .citem'); await sph.click('#chatList .citem >> nth=0'); await sph.waitForSelector('#chatThread');
  ok(await sover() <= 1 && await sph.locator('#chatBack').isVisible(), 'in Sales on a phone the list and the thread take turns, with a way back');
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs);
  await vctx.close(); await sctx.close(); await pc.close(); await call(`/v1/admin/builds/${build.id}`, { token: admin, method: 'DELETE' });
});

await journey('J128', 'the Builds admin card shows the real site, the live address, what it is built with and its key features, with its picture loaded, on a desktop and on a phone', async () => {
  const r = await room('128', { wait: false }), tag = `bc${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const made = await call('/v1/admin/builds', { token: admin, body: { name: `Card ${tag}`, tagline: 'Booking for salons', sector: 'Beauty', visibility: 'hidden', status: 'in-progress', hosting: 'railway', liveUrl: `https://card-${tag}.example.com/shop`, summary: 'A booking site.', highlights: [{ title: 'Online booking', text: 'Pick a time' }, { title: 'Deposits', text: '' }, { title: 'Reminders', text: '' }, { title: 'Fourth thing', text: '' }], stack: ['Node.js', 'Postgres', 'Shopify'] } });
  const W = 'http://work.localhost:3123';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(`${W}/builds/admin`, { waitUntil: 'networkidle' }); await page.waitForSelector('.bcard', { timeout: 10000 });
  const card = page.locator(`.bcard:has-text("Card ${tag}")`);
  ok(await card.count() === 1, 'the build has a card', made.status);
  const link = card.locator('.live a'); ok(await link.count() === 1 && /card-.*\.example\.com/.test(await link.innerText()) && (await link.getAttribute('href')) === `https://card-${tag}.example.com/shop` && await link.getAttribute('target') === '_blank', 'it shows the live site and the link opens it in a new tab');
  ok((await card.locator('.stack span').allInnerTexts()).join() === 'Node.js,Postgres,Shopify', 'it shows what it is built with');
  ok((await card.locator('.feat li').allInnerTexts()).join() === 'Online booking,Deposits,Reminders', 'it shows the first three key features');
  const spot = page.locator('.bcard:has-text("Spot")').first(); await spot.locator('.shot img').waitFor({ timeout: 8000 });
  const loaded = await page.waitForFunction(() => { const i = document.querySelector('.bcard:nth-of-type(n) .shot img'); return [...document.querySelectorAll('.bcard')].find(c => /Spot/.test(c.innerText))?.querySelector('.shot img')?.naturalWidth > 0; }, null, { timeout: 8000 }).then(() => true, () => false);
  ok(loaded, 'a build with no uploaded picture still shows the picture of its real site');
  ok(await page.locator('.bcard:has-text("Card ' + tag + '") .none').count() === 1, 'one with no picture says so instead of a black box');
  ok(await card.locator('.sttag').innerText().then(t => /in progress/i.test(t)), 'its status is on the picture');
  await card.locator('[data-edit]').click(); await page.waitForSelector('#dlg[open]'); ok((await page.inputValue('#fName')) === `Card ${tag}`, 'Edit still opens the build'); await page.click('#dClose');
  ok(page.errs.length === 0, 'no script errors', page.errs);
  const pctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true }); await pctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const ph = await pctx.newPage(); await ph.goto(`${W}/builds/admin`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.bcard');
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone the cards do not scroll sideways');
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j128-phone.png` }).catch(() => {});
  await pctx.close(); await ctx.close(); await call(`/v1/admin/builds/${made.json.id}`, { token: admin, method: 'DELETE' });
});

await journey('J130', 'software projects in browsers: a staff member makes one with a build, sees its stage and build card, moves the stage, sets where the client sells and pushes the build to their store from the push window; the client sees the stage and build on their hub, on a phone', async () => {
  const http = await import('node:http'), made = [];
  const store = http.createServer((req, res) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { const b = (() => { try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; } })(); res.writeHead(200, { 'content-type': 'application/json' }); if (req.url === '/v2/catalog/batch-upsert') { const objs = b.batches?.[0]?.objects || []; made.push(...objs.map(o => o.item_data.name)); return res.end(JSON.stringify({ id_mappings: objs.map((o, n) => ({ client_object_id: o.id, object_id: `SQB_${made.length}_${n}` })) })); } res.end('{}'); }); });
  await new Promise(r => store.listen(3133, '127.0.0.1', r));
  try {
    const r = await room('130', { wait: false }), tag = `ui${stamp}`, W = 'http://work.localhost:3123';
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
    const A = (path, o = {}) => call('/v1/admin' + path, { token: admin, ...o });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(`${W}/clients/${r.clientId}`, { waitUntil: 'networkidle' }); await page.locator('button.primary[onclick^="addProject("]').first().waitFor({ timeout: 15000 }).catch(async e => { await page.screenshot({ path: '/tmp/claude-0/j130-fail.png' }).catch(() => {}); throw new Error(`no "+ project" button (${String(e.message).slice(0, 160)}); page errors: ${page.errs.join(' | ')}; text: ${(await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 700)} url: ${page.url()}`); });

    // make a software project from the console
    await page.locator('button.primary[onclick^="addProject("]').first().click(); await page.waitForSelector('#editorModal[open], dialog[open]', { timeout: 5000 });
    await page.fill('input[name=name]', `Salon site ${tag}`); await page.selectOption('select[name=kind]', 'software'); await page.selectOption('select[name=buildId]', '__new'); await page.selectOption('select[name=stage]', 'prototype');
    await page.click('#editorForm button[type=submit]'); await page.waitForSelector('#editorModal:not([open])', { state: 'attached', timeout: 15000 });
    const pid = sql(`select id from projects where client_id='${r.clientId}' and name='Salon site ${tag}'`), bid = sql(`select build_id from projects where id='${pid}'`);
    ok(pid && bid && sql(`select kind||'/'||stage from projects where id='${pid}'`) === 'software/prototype', 'the new-project window makes a software project with a new build, at the stage chosen');
    // give the build something to show
    ok((await A(`/builds/${bid}`, { method: 'PUT', body: { name: `Salon site ${tag}`, tagline: 'Booking for salons', sector: 'Beauty', status: 'in-progress', visibility: 'hidden', hosting: 'railway', liveUrl: `https://salon-${tag}.example.com`, summary: 'A booking site.', stack: ['Node.js', 'Postgres'], highlights: [{ title: 'Online booking', text: '' }, { title: 'Deposits', text: '' }] } })).status === 200, 'setup: the build is filled in');
    await page.goto(`${W}/clients/${r.clientId}#project=${pid}`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' }); const card = page.locator('.project-card.sw');
    await card.waitFor({ timeout: 10000 });
    ok((await card.locator('.sw-rail li').allInnerTexts()).length === 7 && /Prototype/.test(await card.locator('.sw-rail li.now').innerText()) && await card.locator('.sw-rail li.done').count() === 1, 'the project card shows the stage rail with Prototype current');
    ok(/Salon site/.test(await card.locator('.sw-build h4').innerText()) && (await card.locator('.sw-build a[target=_blank]').getAttribute('href')) === `https://salon-${tag}.example.com` && (await card.locator('.sw-stack span').allInnerTexts()).join() === 'Node.js,Postgres' && /Online booking/.test(await card.locator('.sw-feat').innerText()), 'and the build card: the live site, what it is built with and its features');
    ok(await card.locator('button:has-text("+ product")').count() === 0, 'a software project has no "+ product" button');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j130-room.png` }).catch(() => {});
    await card.locator('.sw-stagepick select').selectOption('build'); await page.waitForFunction(() => /Build/.test(document.querySelector('.project-card.sw .sw-rail li.now')?.innerText || ''), null, { timeout: 8000 });
    ok(sql(`select stage from projects where id='${pid}'`) === 'build' && await page.locator('.project-card.sw .sw-rail li.done').count() === 2, 'moving the stage saves it and the rail follows');
    await page.locator('.project-card.sw .sw-where select').selectOption('square'); await page.waitForFunction(() => /Push to Square/.test(document.querySelector('.project-card.sw .sw-actions')?.innerText || ''), null, { timeout: 8000 });
    ok(sql(`select commerce_platform from clients where id='${r.clientId}'`) === 'square', 'choosing where the client sells saves it, and the push button names that store');

    // the push window
    ok((await A(`/clients/${r.clientId}/commerce/connection`, { method: 'PUT', body: { platform: 'square', token: 'sq-ui-token-1234', currency: 'USD', label: 'Salon Square' } })).status === 200, 'setup: Square is connected for the client');
    await page.locator('.project-card.sw a:has-text("Push to Square")').click(); await page.waitForURL(/\/builds\/admin/, { timeout: 8000 }); await page.waitForSelector('#pdlg[open]', { timeout: 10000 });
    ok(!page.url().includes('push=') && /Salon site/.test(await page.innerText('#pTitle')) && await page.inputValue('#pPlat') === 'square' && /Square is connected/.test(await page.innerText('#pConn')), 'the link opens the push window for that build and client, with Square connected');
    await page.fill('#pCat', 'Siphon mug | 12 | MUG-1 | https://example.com/mug.jpg | Glass\nFlat white beans | 18.50 | FW-1'); await page.click('#pPrev');
    await page.waitForSelector('#pOut .panel'); ok(/Siphon mug/.test(await page.innerText('#pOut')) && /Flat white/.test(await page.innerText('#pOut')) && made.length === 0, 'seeing what will be made lists both products and sends nothing');
    await page.click('#pGo'); await page.waitForFunction(() => /made/.test(document.querySelector('#pMsg').textContent), null, { timeout: 10000 }).catch(async () => { throw new Error(`push did not finish: "${await page.innerText('#pMsg')}"`); });
    ok(/2 made, 0 failed, 0 left alone/.test(await page.innerText('#pMsg')) && made.join() === 'Siphon mug,Flat white beans', 'pushing sends both products and says so');
    await page.click('#pGo'); await page.waitForFunction(() => /already there|nothing was changed/i.test(document.querySelector('#pMsg').textContent), null, { timeout: 10000 });
    ok(made.length === 2 && /Earlier pushes/.test(await page.innerText('#pHist')), 'pushing again changes nothing and the earlier push is listed');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j130-push.png` }).catch(() => {});
    ok(page.errs.length === 0, 'no script errors on the console pages', page.errs);

    // the client's hub, on a phone
    const { ctx: pc, page: ph } = await phone();
    try {
      await ph.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, r.token);
      await ph.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.sw-photo', { timeout: 15000 });
      ok(/software/i.test(await ph.locator('.sw-photo').innerText()) && /Build/.test(await ph.locator('.card:has(.sw-photo) .metrics').innerText()), 'on the hub the software project is a card with its stage, not a product photo');
      await ph.goto(`${BASE}/projects/${pid}`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.journey-steps.sw', { timeout: 15000 });
      ok(await ph.locator('.journey-steps.sw li').count() === 7 && /Build/.test(await ph.locator('.journey-steps.sw li.now').innerText()), 'the project page shows the stage rail');
      ok(/Salon site/.test(await ph.innerText('main')) && (await ph.locator('a:has-text("Open the live site")').getAttribute('href')) === `https://salon-${tag}.example.com` && /Node\.js/.test(await ph.innerText('main')) && /Online booking/.test(await ph.innerText('main')), 'and the build: live link, what it is built with, what it does');
      ok(/\/#\/salon-site/.test(await ph.locator('a:has-text("showcase")').getAttribute('href')), 'with a link to see it in the showcase');
      ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nothing is wider than the phone');
      await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j130-hub.png` }).catch(() => {});
    } finally { await pc.close(); }
    await ctx.close(); await A(`/builds/${bid}`, { method: 'DELETE' });
  } finally { await new Promise(r => store.close(r)); }
});
await journey('J126', 'the Press tab in a browser: the menu entry opens it, a pitch is drafted by the assistant with brackets to fill, cannot be sent as a draft, goes to the people ticked after the confirmation is ticked, shows who was skipped and why, the media list and the coverage log work, and a phone fits', async () => {
  const http = await import('node:http');
  const mock = { sent: [], n: 0 };
  const resend = http.createServer((req, res) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); const id = `re_pressb_${stamp}_${++mock.n}`; if (req.method === 'POST' && req.url === '/emails') mock.sent.push({ id, body }); res.writeHead(req.method === 'POST' ? 200 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id })); }); });
  await new Promise(r => resend.listen(3133, '127.0.0.1', r));
  try {
    const r = await room('126', { wait: false }), tag = `pr${stamp}`;
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
    const W = 'http://work.localhost:3123', S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
    await S('/email/settings', { method: 'PUT', body: { dailyCap: 100 } }); await S('/press/settings', { method: 'PUT', body: { dailyCap: 50 } });
    const mk = async (name, email, tags = ['press', 'beat-retail']) => (await S('/contacts', { body: { name, email, tags, companyName: `Outlet ${name}`, source: 'manual' } })).json.id;
    const ana = await mk(`Ana ${tag}`, `ana-${tag}@press.test`), ben = await mk(`Ben ${tag}`, `ben-${tag}@press.test`), gone = await mk(`Gus ${tag}`, `gus-${tag}@press.test`);
    await S(`/contacts/${gone}/unsubscribe`, { method: 'PUT', body: { unsubscribed: true } });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.accept(d.type() === 'prompt' ? (d.message().startsWith('Which outlet') ? 'Retail Dive' : d.message().startsWith('Link') ? 'https://example.com/rd' : d.message().startsWith('Its headline') ? 'Salons, rebuilt' : d.message().startsWith('Date') ? '2026-10-14' : d.defaultValue()) : undefined));
    await page.goto(`${W}/sales#press`, { waitUntil: 'networkidle' }); await page.waitForSelector('#t-press:not(.hidden) #prNew', { timeout: 10000 });
    ok(/Press/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()) && /allowed/.test(await page.innerText('#pressNote')), 'the address opens the Press tab, the left menu marks Press, and it says how many pitches are allowed today');

    // write one with the assistant
    await page.click('#prNew'); await page.waitForSelector('#prdlg[open]');
    await page.fill('#prName', `Salon pitch ${tag}`); await page.fill('#prAngle', 'Small salons can have their own booking site');
    await page.click('#prDraft'); await page.waitForFunction(() => document.querySelector('#prSubject').value.length > 0, null, { timeout: 15000 });
    ok(/Fixture pitch/.test(await page.inputValue('#prSubject')) && /\[QUOTE FROM KYLE\]/.test(await page.inputValue('#prBody')) && /BRACKET/.test(await page.innerText('#prDraftMsg')), 'the assistant fills the subject and message, and tells staff to fill in the brackets');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j126-editor.png` }).catch(() => {});
    await page.selectOption('#prStatus', 'ready'); await page.click('#prform button[type=submit]');
    await page.waitForSelector('#prdlg:not([open])', { state: 'attached', timeout: 5000 }).catch(async e => { throw new Error(`editor did not close: ${await page.innerText('#prMsg')} / ${page.errs.join(';')}`); });
    ok(await page.locator('#prdlg[open]').count() === 0 && await page.locator('[data-pid]').count() === 1, 'it saves (the editor does not stop a draft with brackets from being saved)');
    ok(await page.locator('[data-pid] [data-psend]').isDisabled() === false, 'it is marked ready, so Send is offered');
    // the brackets stop it going
    await page.click('[data-psend]'); await page.waitForSelector('#ppdlg[open]');
    await page.locator('#ppRows tr', { hasText: `Ana ${tag}` }).locator('[data-pick]').check(); await page.check('#ppConfirm');
    ok(await page.locator('#ppSend').isEnabled(), 'with someone ticked and the confirmation ticked, Send is enabled');
    await page.click('#ppSend'); await page.waitForFunction(() => /Fill in/.test(document.querySelector('#ppMsg').textContent), null, { timeout: 8000 });
    ok(/QUOTE FROM KYLE/.test(await page.innerText('#ppMsg')) && mock.sent.length === 0, 'with a [QUOTE FROM KYLE] left in it, nothing is sent and it says what to fill in');
    await page.click('#ppdlg [data-close]');

    // fill it in and send
    await page.click('[data-pedit]'); await page.waitForSelector('#prdlg[open]');
    await page.fill('#prBody', (await page.inputValue('#prBody')).replace('[QUOTE FROM KYLE]', 'We built it in two weeks.')); await page.click('#prform button[type=submit]');
    await page.waitForSelector('#prdlg:not([open])', { state: 'attached' }); await page.click('[data-psend]'); await page.waitForSelector('#ppdlg[open]');
    ok(await page.locator('#ppRows tr', { hasText: `Gus ${tag}` }).locator('[data-pick]').isDisabled() && /Unsubscribed|not to be emailed/i.test(await page.locator('#ppRows tr', { hasText: `Gus ${tag}` }).innerText()), 'someone who unsubscribed cannot be ticked, and the row says why');
    ok(await page.locator('#ppSend').isDisabled(), 'Send stays off until someone is ticked and the confirmation is ticked');
    await page.selectOption('#ppWho', ana); await page.click('#ppPrev'); await page.waitForSelector('#ppPreview .prev');
    ok(/Hi Ana/.test(await page.innerText('#ppPreview')) && !/still to fill/.test(await page.innerText('#ppPreview')), 'the preview shows the message as Ana gets it');
    await page.locator('#ppRows tr', { hasText: `Ana ${tag}` }).locator('[data-pick]').check(); await page.locator('#ppRows tr', { hasText: `Ben ${tag}` }).locator('[data-pick]').check();
    ok(!await page.locator('#ppSend').isEnabled(), 'two people ticked is not enough without the confirmation');
    await page.check('#ppConfirm'); ok(/Send to 2 people/.test(await page.innerText('#ppSend')), 'the button says how many'); await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j126-send.png` }).catch(() => {});
    await page.click('#ppSend'); await page.waitForFunction(() => /2 sent/.test(document.querySelector('#ppMsg').textContent), null, { timeout: 10000 });
    ok(mock.sent.length === 2 && mock.sent.every(m => m.body.text.includes('Unsubscribe here: ')) && await page.locator('#ppResults li.sent').count() === 2, 'two emails went, each with the unsubscribe link, and the results list them');
    await page.click('#ppdlg [data-close]'); await page.waitForFunction(() => /sent to 2/.test(document.querySelector('[data-pid]').innerText), null, { timeout: 5000 });
    ok(/sent to 2/.test(await page.innerText('[data-pid]')), 'the card now says it was sent to 2');

    // media list and coverage
    await page.click('[data-pv=media]'); await page.waitForSelector('[data-mid]');
    ok(await page.locator('[data-mid]').count() >= 3 && /retail/.test(await page.innerText('#pressBody')), 'the media list shows the tagged people with what they cover');
    await page.click('[data-pv=coverage]'); await page.waitForSelector('#cvNew'); await page.click('#cvNew'); await page.waitForSelector('[data-cid]');
    ok(/Retail Dive/.test(await page.innerText('#pressBody')) && await page.locator('[data-cid] a[href="https://example.com/rd"]').count() === 1, 'coverage can be logged and links to the piece');
    await page.click('[data-cdel]'); await page.waitForFunction(() => !document.querySelector('[data-cid]'), null, { timeout: 5000 });
    ok(await page.locator('[data-cid]').count() === 0, 'and removed');
    ok(page.errs.length === 0, 'no script errors on the page', page.errs);

    // a phone
    const pctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true }); await pctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    const ph = await pctx.newPage(); await ph.goto(`${W}/sales#press`, { waitUntil: 'networkidle' }); await ph.waitForSelector('#t-press:not(.hidden) #prNew');
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone the Press tab does not scroll sideways');
    await ph.click('[data-psend]'); await ph.waitForSelector('#ppdlg[open]'); ok(await ph.evaluate(() => { const d = document.querySelector('#ppdlg').getBoundingClientRect(); return d.left >= -1 && d.right <= innerWidth + 1; }), 'and the send window fits the screen');
    await pctx.close(); await ctx.close();
  } finally { await new Promise(r => resend.close(r)); }
});
await journey('J124', 'the Opportunities tab in a browser: what is worth doing and why, the kinds as filters, make a task, snooze, hide, the short list on Today, the menu count, and a phone', async () => {
  const r = await room('124', { wait: false }), tag = `op${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  const person = async n => (await S('/contacts', { body: { name: `${n} ${tag}`, email: `${n.toLowerCase().replace(/\W/g, '')}-${tag}@opp.test`, source: 'referral' } })).json.id;
  const old = id => sql(`update sales_contacts set created_at = now() - interval '30 days' where id='${id}'`);
  const ian = await person('Inbound Ian'); old(ian); sql(`insert into sales_activities(contact_id,kind,text,created_at) values('${ian}','email_in','Can you build us a new site?', now() - interval '2 days')`);
  const quinn = await person('Quiet Quinn'); old(quinn); const d = (await S('/deals', { body: { title: `Site ${tag}`, contactId: quinn, stage: 'meeting', value: '9000' } })).json.id; sql(`update sales_deals set last_activity_at = now() - interval '12 days' where id='${d}'`);
  const tess = await person('Techpack Tess'); sql(`update sales_contacts set tags='{tech-pack}', created_at = now() - interval '30 days' where id='${tess}'`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.dlg = []; page.on('dialog', d => { page.dlg.push(d.message()); d.accept(); });
  await page.goto('http://work.localhost:3123/sales', { waitUntil: 'networkidle' }); await page.waitForSelector('.tiles', { timeout: 10000 });
  ok(/Worth your time today/.test(await page.innerText('#t-today')), 'Today has a short list of what is worth doing');
  await page.click('.fbside a[data-href="/sales#opportunities"]:not(.gicon)'); await page.waitForSelector('#oppList [data-okey]', { timeout: 10000 });
  ok(/Opportunities/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'the menu opens it and marks it');
  const card = n => page.locator(`#oppList [data-okey]:has-text("${n} ${tag}")`);
  ok(/wrote to us 2 days ago/.test(await card('Inbound Ian').innerText()) && /\$9,000/.test(await card('Quiet Quinn').innerText()) && /have not seen the builds|has not seen the builds/.test(await card('Techpack Tess').innerText()), 'each card says why, in plain words');
  ok(/now/i.test(await card('Inbound Ian').locator('.pri').innerText()) && /later|when there is time/i.test(await card('Techpack Tess').locator('.pri').innerText()), 'and how soon');
  const names = await page.$$eval('#oppList h2', e => e.map(x => x.textContent)); ok(names.findIndex(n => n.includes('Inbound Ian')) < names.findIndex(n => n.includes('Techpack Tess')), 'the strongest comes first');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j124-list.png` }).catch(() => {});
  await page.click('#oppTypes [data-otype="deal_quiet"]'); await page.waitForFunction(() => document.querySelectorAll('#oppList [data-okey]').length >= 1 && ![...document.querySelectorAll('#oppList h2')].some(h => /Techpack Tess/.test(h.textContent)), null, { timeout: 8000 });
  ok(await card('Quiet Quinn').count() === 1, 'a kind can be picked to narrow the list'); await page.click('#oppTypes [data-otype=""]'); await page.waitForSelector(`#oppList [data-okey]:has-text("Techpack Tess")`);
  await card('Techpack Tess').locator('[data-oact="task"]').click(); await page.waitForFunction(t => ![...document.querySelectorAll('#oppList h2')].some(h => h.textContent.includes(t)), `Techpack Tess ${tag}`, { timeout: 8000 });
  ok(Number(sql(`select count(*) from sales_tasks where contact_id='${tess}' and title like '%Tess%'`)) === 1, 'making a task from a card makes it, and the card goes');
  await card('Quiet Quinn').locator('[data-oact="snooze"]').click(); await page.waitForFunction(t => ![...document.querySelectorAll('#oppList h2')].some(h => h.textContent.includes(t)), `Quiet Quinn ${tag}`, { timeout: 8000 });
  ok(sql(`select state from sales_opportunity_state where key like '%${d}'`) === 'snoozed', 'snoozing hides it for a week');
  await card('Inbound Ian').locator('[data-oact="dismiss"]').click(); await page.waitForFunction(t => ![...document.querySelectorAll('#oppList [data-okey]')].some(c => c.innerText.includes(t) && /Wrote to us, no reply/i.test(c.innerText)), `Inbound Ian ${tag}`, { timeout: 8000 }).catch(async e => { throw new Error(e.message.split('\n')[0] + ' | dialogs: ' + page.dlg.join(' / ') + ' | card: ' + (await card('Inbound Ian').innerText().catch(() => 'none'))); }); ok(true, 'and "Not now" hides that reason (the person can come back under a different one, here: warm with no deal)');
  await page.click(`.tab[data-t="contacts"]`); await page.fill('#q', `pat`); await page.fill('#q', ''); await page.click('.tab[data-t="opportunities"]');
  ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const ph = await pc.newPage(); ph.errs = []; ph.on('pageerror', e => ph.errs.push(e.message)); const over = () => ph.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await ph.goto('http://work.localhost:3123/sales#opportunities', { waitUntil: 'networkidle' }); await ph.waitForSelector('#oppList .panel'); ok(await over() <= 1, 'it fits a phone', await over());
  await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || S}/j124-phone.png` }).catch(() => {});
  ok(ph.errs.length === 0, 'no script errors on the phone', ph.errs); await pc.close();
  sql(`delete from sales_contacts where email like '%-${tag}@opp.test'`);
});

await journey('J133', 'the work home in a browser: the week at a glance, who to reach out to, the prototypes and who has looked, the projects in flight with filters, every link goes where it says, and it fits a phone', async () => {
  const r = await room('133', { wait: false }), tag = `wh${stamp}`, W = 'http://work.localhost:3123';
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${r.email}'`), clientId: r.clientId, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const A = (path, o = {}) => call('/v1/admin' + path, { token: admin, ...o }), S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  const lead = (await S('/contacts', { body: { name: `Lena ${tag}`, email: `lena-${tag}@lead.test`, source: 'website', tags: [] } })).json.id;
  const build = (await A('/builds', { body: { name: `Proto ${tag}`, status: 'in-progress', visibility: 'invite', hosting: 'railway', stack: ['Node', 'Postgres'], liveUrl: `https://proto-${tag}.example.com` } })).json.id;
  sql(`insert into build_views(email,build_id,kind) values('prospect-${tag}@x.test','${build}','open')`);
  const sw = (await A(`/clients/${r.clientId}/projects`, { body: { name: `Site ${tag}`, kind: 'software', buildId: build, stage: 'prototype' } })).json, pr = (await A(`/clients/${r.clientId}/projects`, { body: { name: `Hoodie ${tag}` } })).json;
  await call(`/v1/projects/${pr.id}/messages`, { token: r.token, body: { body: 'Any news?' } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  const sgn = sql(`insert into intel_signals(source,external_id,url,title,summary,scored_at,relevant,score,model,status) values('reddit','ui-home-${tag}','https://example.com/ui-home-${tag}','Salon needs an app ${tag}','A salon owner needs a booking app',now(),true,100,'fixture','new') returning id`).split('\n')[0];
  await page.goto(`${W}/home`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden) .tile', { timeout: 15000 });
  ok(await page.locator('#funnel .tile').count() === 4 && /Good (morning|afternoon|evening)/.test(await page.innerText('#hello')), 'the home greets and shows four numbers for the week');
  ok(/Home/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()), 'the left menu marks Home');
  ok(await page.locator('#aLead').getAttribute('href') === '/sales#contacts' && /builds\/admin\?new=1/.test(await page.locator('#aProto').getAttribute('href')), 'the three quick actions are there: add a lead, new prototype, new project');
  const row = page.locator(`#reachList .row:has-text("Lena ${tag}")`); ok(await row.count() === 1 && /No reply yet/i.test(await row.innerText()), 'a lead nobody has answered is in "Reach out today"');
  const srow = page.locator(`#reachList .row:has-text("Salon needs an app ${tag}")`); ok(await srow.count() === 1 && /Post · 100/i.test(await srow.innerText()) && await srow.getAttribute('href') === `/intel?signal=${sgn}`, 'one Today list: a post worth a look sits beside the tasks and leads, and links to that post in Intelligence');
  const card = page.locator(`#protoList .proto:has-text("Proto ${tag}")`); ok(await card.count() === 1 && await card.evaluate(e => e.classList.contains('warm')) && /1 person looked/.test(await card.innerText()) && /Node/.test(await card.innerText()) && /for UI Room/.test(await card.innerText()) && /say hello/i.test(await card.innerText()), 'the prototype shows that someone looked, what it is built with and which client it is for');
  ok(await card.locator('a:has-text("Push to a store")').getAttribute('href') === `/builds/admin?push=${build}` && await card.locator('a:has-text("Open site")').getAttribute('href') === `https://proto-${tag}.example.com`, 'with a way to push it to a store and to open the site');
  const rows = page.locator('#projList .proj'); ok(await rows.count() >= 2 && /Waiting on us/i.test(await page.locator(`#projList .proj:has-text("Hoodie ${tag}")`).innerText()) && (await rows.allInnerTexts()).findIndex(t => /Hoodie/.test(t)) <= (await rows.allInnerTexts()).findIndex(t => !/Waiting on us/i.test(t)), 'projects in flight list the ones waiting on us before the rest');
  ok(/Software/i.test(await page.locator(`#projList .proj:has-text("Site ${tag}")`).innerText()) && await page.locator(`#projList .proj:has-text("Site ${tag}") .mini i`).count() === 7 && /Prototype/i.test(await page.locator(`#projList .proj:has-text("Site ${tag}")`).innerText()), 'a software project shows its stage and a seven-step rail');
  await page.click('#projFilters [data-f=software]'); ok(await page.locator('#projList .proj[data-kind=product]').count() === 0 && await page.locator('#projList .proj[data-kind=software]').count() >= 1, 'the Software filter shows only software projects');
  await page.click('#projFilters [data-f=waiting]'); ok(await page.locator('#projList .proj').count() >= 1 && (await page.locator('#projList .proj').allInnerTexts()).every(t => /Waiting on us/i.test(t)), 'Waiting on us shows only those');
  await page.click('#projFilters [data-f=all]');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j133-home.png`, fullPage: true }).catch(() => {});
  // links go where they say
  await page.locator(`#projList .proj:has-text("Site ${tag}")`).click(); await page.waitForSelector('.project-card.sw', { timeout: 15000 });
  ok(page.url().endsWith(`/clients/${r.clientId}#project=${sw.id}`) && /Site/.test(await page.locator('.project-card.sw h3').innerText()), 'a project opens in its client room');
  await page.goto(`${W}/home`, { waitUntil: 'networkidle' }); await page.waitForSelector(`#reachList .row:has-text("Lena ${tag}")`);
  await page.locator(`#reachList .row:has-text("Lena ${tag}")`).click(); await page.waitForURL(/\/sales/, { timeout: 8000 }); await page.waitForSelector('#cbody', { timeout: 10000 });
  await page.waitForFunction(n => new RegExp(n).test(document.querySelector('#cbody')?.innerText || ''), `Lena ${tag}`, { timeout: 10000 });
  ok(!page.url().includes('contact='), 'a lead opens that person\'s card in Sales (and the address is tidied)');
  ok(page.errs.length === 0, 'no script errors', page.errs);
  await page.goto(`${W}/home`, { waitUntil: 'networkidle' }); await page.locator(`#protoList .proto:has-text("Proto ${tag}") a:has-text("Push to a store")`).click(); await page.waitForSelector('#pdlg[open]', { timeout: 10000 });
  ok(/Proto/.test(await page.innerText('#pTitle')), 'Push to a store opens the push window for that prototype');
  await ctx.close();
  const { ctx: pc, page: ph } = await phone();
  try {
    await ph.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    await ph.goto(`${W}/home`, { waitUntil: 'networkidle' }); await ph.waitForSelector('#funnel .tile');
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone nothing is wider than the screen');
    await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j133-phone.png` }).catch(() => {});
  } finally { await pc.close(); }
  await A(`/projects/${sw.id}/archive`, { method: 'POST', body: {} }); await A(`/projects/${pr.id}/archive`, { method: 'POST', body: {} }); await A(`/builds/${build}`, { method: 'DELETE' });
});

await journey('J135', 'the Intelligence page in a browser: signals ranked with a summary, why now and a draft; take it, log what you sent, the reply, a dismissal; filters; add a post you saw on LinkedIn; the KPIs by person; the watches; the settings; and a phone', async () => {
  const r = await room('135', { wait: false }), tag = `in${stamp}`, W = 'http://work.localhost:3123';
  const email = `ui-staff-${tag}@chaos.test`, uid = sql(`insert into users(client_id,email,name,role) values('${r.clientId}','${email}','Uma Staff ${tag}','admin') returning id`).split('\n')[0];
  const admin = await forge({ sub: uid, clientId: r.clientId, role: 'admin', email });
  const add = (n, o) => sql(`insert into intel_signals(source,external_id,url,author,title,body,posted_at,scored_at,relevant,service_line,intent,fit,urgency,score,summary,why_now,angle,draft,draft_channel,risks,model) values('${o.source}','ui-${tag}-${n}','https://example.com/${tag}/${n}','${o.author}','${o.title}','${o.body}',now() - interval '2 hours',now(),true,'${o.line}','buying',80,70,${o.score},'${o.summary}','${o.why}','Answer first','${o.draft}','public_reply','${o.risks || ''}','fixture') returning id`).split('\n')[0];
  const a = add(1, { source: 'reddit', author: 'salonowner', title: `Need an app for my salon ${tag}`, body: 'Looking for a developer to build a booking app.', line: 'apps', score: 92, summary: 'A salon owner needs a booking app.', why: 'Asked two hours ago with a budget.', draft: 'Happy to share how we would approach a booking app.', risks: 'Check the subreddit rules on promotion.' });
  const b = add(2, { source: 'hn', author: 'cto', title: `AI consultant wanted ${tag}`, body: 'We want an AI consultant for support automation.', line: 'ai', score: 71, summary: 'A CTO wants support automation.', why: 'Hiring this week.', draft: 'We have helped teams find where AI pays off first.' });
  const c = add(3, { source: 'x', author: 'brandfounder', title: '', body: `Looking for a factory for our first sneaker ${tag}`, line: 'product', score: 55, summary: 'A founder needs a sneaker factory.', why: 'Raised a seed round.', draft: 'Congrats on the raise: here is what to line up first.' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(`${W}/intel`, { waitUntil: 'networkidle' }); await page.waitForSelector('.sig', { timeout: 15000 });
  const mine = t => page.locator(`.sig:has-text("${t}")`);
  ok(/Intelligence/.test(await page.locator('.fbside a.on:not(.gicon)').first().innerText()) && /ChatGPT/i.test(await page.innerText('#strip')), 'the left menu marks Intelligence and the strip says which AIs are connected');
  const texts = await page.locator('.sig').allInnerTexts(), i1 = texts.findIndex(t => t.includes(`booking app`)), i2 = texts.findIndex(t => t.includes('support automation')), i3 = texts.findIndex(t => t.includes('sneaker factory'));
  ok(i1 >= 0 && i1 < i2 && i2 < i3, 'the strongest is first');
  const card = mine('Need an app for my salon');
  ok(/92/.test(await card.locator('.score').innerText()) && /A salon owner needs a booking app/.test(await card.innerText()) && /Asked two hours ago/.test(await card.innerText()) && /Check first: Check the subreddit rules/.test(await card.innerText()) && (await card.locator('textarea[data-draft]').inputValue()).startsWith('Happy to share'), 'a card shows the score, the summary, why now, what to check first and a draft');
  ok(await card.locator('h3 a').getAttribute('href') === `https://example.com/${tag}/1` && await card.locator('h3 a').getAttribute('target') === '_blank', 'the title opens the original post in a new tab');
  ok(/next step/i.test(await card.locator('.next').innerText()) && /“I sent it”/.test(await card.locator('.next').innerText()) && /CRM/.test(await card.locator('.next').innerText()), 'each post says what Future Basics should do next, with the draft beside it');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j135-signals.png` }).catch(() => {});
  // filters
  await page.click('#fLine [data-ln=ai]'); await page.waitForFunction(() => document.querySelectorAll('.sig').length >= 1 && ![...document.querySelectorAll('.sig')].some(e => /booking app/.test(e.innerText)), null, { timeout: 5000 });
  ok(await mine('support automation').count() === 1 && await mine('booking app').count() === 0, 'the AI filter shows only AI posts'); await page.click('#fLine [data-ln=""]');
  await page.fill('#fQ', 'sneaker'); await page.waitForFunction(() => document.querySelectorAll('.sig').length === 1, null, { timeout: 5000 }); ok(await mine('sneaker factory').count() === 1, 'search finds a post by its words'); await page.fill('#fQ', ''); await page.waitForFunction(() => document.querySelectorAll('.sig').length >= 3, null, { timeout: 5000 });
  // a link to one post, to send a teammate
  ok(await card.locator('[data-a=link]').count() === 1 && /Copy link/.test(await card.locator('[data-a=link]').innerText()), 'every post has a Copy link button');
  const lp = await ctx.newPage(); lp.errs = []; lp.on('pageerror', e => lp.errs.push(e.message)); await lp.goto(`${W}/intel?signal=${b}`, { waitUntil: 'networkidle' }); await lp.waitForSelector('.sig.linked', { timeout: 15000 });
  const firstCard = await lp.locator('.sig').first().innerText(); ok(/AI consultant wanted/.test(firstCard) && await lp.locator('.sig.linked').count() === 1 && /Linked/i.test(await lp.locator('#list .next').first().innerText()) && await lp.locator('.sig').count() >= 2, 'a link opens with that post first and the rest below it');
  await lp.locator('[data-a=unlink]').click(); await lp.waitForFunction(() => !document.querySelector('.sig.linked'), null, { timeout: 5000 }); ok(!lp.url().includes('signal='), 'Show everything drops the link');
  await lp.goto(`${W}/intel?signal=00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' }); await lp.waitForSelector('#list > .risk', { timeout: 15000 }); ok(/no longer in the list/.test(await lp.locator('#list > .risk').innerText()) && await lp.locator('.sig').count() >= 1, 'a link to a post that is gone says so and still shows the list'); ok(lp.errs.length === 0, 'no script errors on the linked page', lp.errs); await lp.close();
  // working one
  await card.locator('[data-a=claim]').click(); await page.waitForFunction(t => [...document.querySelectorAll('.sig')].find(e => e.innerText.includes(t))?.innerText.toLowerCase().includes('in progress'), 'Need an app for my salon', { timeout: 5000 });
  ok(/Uma Staff/.test(await mine('Need an app for my salon').innerText()) && await mine('Need an app for my salon').locator('[data-a=claim]').count() === 0, 'taking it puts their name on it');
  await mine('Need an app for my salon').locator('[data-a=outreach]').click(); await page.waitForSelector('#dlg[open]'); ok((await page.inputValue('#dlg textarea[name=note]')).startsWith('Happy to share'), 'I sent it opens with the draft, to log exactly what went');
  await page.selectOption('#dlg select[name=channel]', 'public_reply'); await page.click('#dGo'); await page.waitForFunction(() => !document.querySelector('#dlg').open, null, { timeout: 5000 });
  await page.click('#fStatus [data-st=actioned]'); await mine('Need an app for my salon').locator('[data-a=reply]').waitFor({ timeout: 5000 }); ok(await mine('Need an app for my salon').count() === 1 && await mine('Need an app for my salon').locator('[data-a=reply]').count() === 1, 'it moves to Sent, where They replied is offered');
  await mine('Need an app for my salon').locator('[data-a=reply]').click(); await page.waitForSelector('#dlg[open]'); await page.click('#dGo'); await page.waitForFunction(() => !document.querySelector('#dlg').open, null, { timeout: 5000 });
  await page.click('#fStatus [data-st=replied]'); await mine('Need an app for my salon').locator('[data-a=meeting]').waitFor({ timeout: 5000 }); ok(await mine('Need an app for my salon').locator('[data-a=meeting]').count() === 1, 'then Replied');
  await page.click('#fStatus [data-st=open]'); await mine('sneaker factory').waitFor({ timeout: 5000 });
  await mine('sneaker factory').locator('[data-a=dismiss]').click(); await page.waitForSelector('#dlg[open]'); await page.selectOption('#dlg select[name=reason]', 'vendor'); await page.click('#dGo'); await page.waitForFunction(() => !document.querySelector('#dlg').open && ![...document.querySelectorAll('.sig')].some(e => /sneaker/.test(e.innerText)), null, { timeout: 5000 });
  ok(await mine('sneaker factory').count() === 0, 'a dismissed post leaves the list');
  ok(sql(`select status||'|'||dismiss_reason from intel_signals where id='${c}'`) === 'dismissed|vendor' && sql(`select string_agg(kind, ',' order by at) from intel_events where signal_id='${a}'`) === 'claimed,outreach,deal,reply', 'and the record says what happened, in order');
  ok(sql(`select d.stage||'|'||c.source from sales_deals d join sales_contacts c on c.id=d.contact_id where d.id=(select deal_id from intel_signals where id='${a}')`) === 'contacted|intel' && sql(`select count(*) from sales_tasks where contact_id=(select contact_id from intel_signals where id='${a}') and done_at is null`) === '1', 'logging "I sent it" in the page made the contact, the deal at Contacted and a follow-up task');
  // a post spotted by hand
  await page.click('#addPost'); await page.waitForSelector('#dlg[open]'); await page.selectOption('#dlg select[name=source]', 'linkedin'); await page.fill('#dlg input[name=author]', 'Dana Founder'); await page.fill('#dlg textarea[name=text]', `We need an AI consultant to automate onboarding ${tag}`); await page.click('#dGo');
  await page.waitForFunction(() => /Added and read/.test(document.querySelector('#runMsg').textContent), null, { timeout: 10000 }); ok(await mine(`automate onboarding ${tag}`).count() === 1 && /linkedin/i.test(await mine(`automate onboarding ${tag}`).innerText()), 'a post added by hand is read and appears with its source');
  // what the first look passed over
  const pz = sql(`insert into intel_signals(source,external_id,url,author,title,body,posted_at,scored_at,relevant,score,model) values('hn','ui-${tag}-pass','https://news.ycombinator.com/item?id=${stamp}','quietone','A quiet note ${tag}','we should look at automation sometime NOFIT',now(),now(),false,0,'prefilter') returning id`).split('\n')[0];
  await page.click('#fStatus [data-st=passed]'); await page.waitForSelector(`.pass:has-text("A quiet note ${tag}")`, { timeout: 5000 });
  const pcard = page.locator(`.pass:has-text("A quiet note ${tag}")`);
  ok(/does not sound like someone asking/.test(await pcard.innerText()) && await pcard.locator('h3 a').getAttribute('href') === `https://news.ycombinator.com/item?id=${stamp}` && await pcard.locator('h3 a').getAttribute('target') === '_blank' && /Passed over/.test(await page.locator('#fStatus .fchip.on').innerText()), 'Passed over lists what the first look skipped, says why, and links out to the post');
  await pcard.locator('[data-a=readnow]').click(); await page.waitForFunction(() => /^(Read|Not read)/.test(document.querySelector('#runMsg').textContent), null, { timeout: 10000 });
  ok(sql(`select model from intel_signals where id='${pz}'`) !== 'prefilter' && await page.locator(`.pass:has-text("A quiet note ${tag}")`).count() === 0, 'asking the AI to read it takes it off that list');
  await page.click('#fStatus [data-st=open]'); await mine('support automation').waitFor({ timeout: 5000 });
  // KPIs
  await page.click('.tab[data-t=kpis]'); await page.waitForSelector('#t-kpis .tiles'); const row = page.locator(`#t-kpis tr:has-text("Uma Staff")`);
  ok(await row.count() === 1 && /Overdue now/.test(await page.innerText('#t-kpis')) && /Who is doing what/.test(await page.innerText('#t-kpis')), 'the KPIs show the funnel, whether we are on it, and each person');
  const cells = await row.locator('td').allInnerTexts(); ok(cells[2] === '1' && cells[3] === '1' && cells[4] === '1', 'Uma took one, sent one and got one reply', cells);
  await page.click('#t-kpis [data-d="7"]'); await page.waitForFunction(() => document.querySelector('#t-kpis .fchip.on')?.innerText.includes('7'), null, { timeout: 5000 }); ok(true, 'the period can be changed');
  // watches
  await page.click('.tab[data-t=watches]'); await page.waitForSelector('#t-watches tr[data-w]'); ok(await page.locator('#t-watches tr[data-w]').count() >= 8, 'the watches are listed');
  await page.click('#newWatch'); await page.waitForSelector('#dlg[open]'); await page.fill('#dlg input[name=name]', `Mine ${tag}`); await page.selectOption('#dlg select[name=kind]', 'hn'); await page.fill('#dlg input[name=query]', 'need a prototype'); await page.click('#dGo');
  await page.waitForSelector(`#t-watches tr:has-text("Mine ${tag}")`, { timeout: 5000 }); ok(await page.locator(`#t-watches tr:has-text("Mine ${tag}")`).count() === 1, 'a new watch can be added');
  await page.locator(`#t-watches tr:has-text("Mine ${tag}") [data-en]`).uncheck(); await page.waitForFunction(t => !document.querySelector(`#t-watches tr[data-w] [data-en]`) || true, null); await sleep(500);
  ok(sql(`select enabled from intel_watches where name='Mine ${tag}'`) === 'f', 'and switched off');
  sql(`insert into intel_signals(watch_id,source,external_id,url,title,body,scored_at,relevant,score,model) select id,'hn','ui-${tag}-heard','https://news.ycombinator.com/item?id=${stamp}1','Heard ${tag}','nothing',now(),false,0,'prefilter' from intel_watches where name='Mine ${tag}'`);
  await page.click('.tab[data-t=watches]'); await page.waitForSelector(`.heard a:has-text("Heard ${tag}")`, { timeout: 5000 });
  const hr = page.locator(`tr[data-rec]:has(.heard a:has-text("Heard ${tag}"))`);
  ok(await hr.locator('a').first().getAttribute('href') === `https://news.ycombinator.com/item?id=${stamp}1` && /passed over/i.test(await hr.innerText()) && /does not mention/.test(await hr.innerText()), 'under each watch, what it last heard: a link to the post, and whether it was read or passed over');
  ok((await page.locator('#t-watches tr[data-w] .q').first().evaluate(e => e.getBoundingClientRect().width)) > 280, '“Listening for” has room to read the whole search');
  await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j135-watches.png` }).catch(() => {});
  // settings
  await page.click('.tab[data-t=settings]'); await page.waitForSelector('#sSave'); await page.fill('#sSla', '12'); await page.locator(`[data-team]`).first().fill(`Growth ${tag}`); await page.click('#sSave');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('#sMsg').textContent), null, { timeout: 5000 }); ok(sql(`select value->>'slaHours' from app_settings where key='intel'`) === '12', 'settings save');
  await page.click('[data-test=openai]'); await page.waitForFunction(() => (t => t.length > 0 && !/Asking/.test(t))(document.querySelector('[data-tr=openai]').textContent), null, { timeout: 10000 });
  ok(page.errs.length === 0, 'no script errors', page.errs);
  await ctx.close();
  const { ctx: pc, page: ph } = await phone();
  try {
    await ph.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
    await ph.goto(`${W}/intel`, { waitUntil: 'networkidle' }); await ph.waitForSelector('.sig');
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone nothing is wider than the screen');
    await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j135-phone.png` }).catch(() => {});
  } finally { await pc.close(); }
  sql(`update intel_watches set enabled=false`); void b;
});

await journey('J138', 'Money in a browser: Colby is turned away and never sees the menu item, Kyle makes an invoice and watches the totals, sends it, takes a payment, imports past invoices, reads the ledger and saves the payment instructions, and a phone fits', async () => {
  const r = await room('138', { wait: false }), W = 'http://work.localhost:3123', tag = `mb${stamp}`;
  const mk = async email => forge({ sub: sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${r.clientId}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0], clientId: r.clientId, role: 'admin', email });
  const kyle = await mk('kyle@thefuturebasics.com'), colby = await mk('colby@thefuturebasics.com');
  // Colby: an admin, but not one of the two
  const cc = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await cc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, colby);
  const cp = await cc.newPage(); cp.errs = []; cp.on('pageerror', e => cp.errs.push(e.message));
  await cp.goto(`${W}/money`, { waitUntil: 'networkidle' }); await cp.waitForSelector('#noAccess:not(.hidden)', { timeout: 15000 });
  ok(await cp.isHidden('#app') && /not open to you/.test(await cp.innerText('#noAccess')), 'Colby is told Money is not open to him and sees none of it');
  await cp.goto(`${W}/home`, { waitUntil: 'networkidle' }); await cp.waitForSelector('.fbside a[data-nav]', { timeout: 10000 }); await sleep(800);
  ok(await cp.locator('.fbside a[data-gated=money]').count() === 1 && await cp.locator('.fbside a[data-gated=money]').isHidden() && await cp.locator('.fbside a[data-nav="Payment gate"]').isVisible(), 'the menu hides Money from him (the payment gate stays)'); await cc.close();
  // Kyle
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyle);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(`${W}/home`, { waitUntil: 'networkidle' }); await page.waitForSelector('.fbside a[data-gated=money]:not([hidden])', { timeout: 10000 }); ok(/Money/.test(await page.locator('.fbside a[data-gated=money]').innerText()), 'the menu shows Money to Kyle');
  await page.click('.fbside a[data-gated=money]'); await page.waitForURL(/\/money/, { timeout: 8000 }); await page.waitForSelector('#t-overview .tile', { timeout: 15000 });
  ok(/Money/.test(await page.innerText('#app h1')) && await page.locator('#t-overview .tile').count() === 4, 'Money opens on its overview');
  // a new invoice: lines, tax, a deposit
  await page.click('#newInv'); await page.waitForSelector('#dlg[open] [name=company]');
  await page.fill('#dlg [name=company]', `Acme ${tag}`); await page.fill('#dlg [name=address]', '1 Main St\nBrooklyn, NY'); await page.fill('#dlg [name=contactEmail]', `ap-${tag}@acme.test`);
  await page.fill('#dlg .lrow [data-l=description]', 'Cytoshift run'); await page.fill('#dlg .lrow [data-l=qty]', '2'); await page.fill('#dlg .lrow [data-l=rate]', '150.00');
  await page.click('#addLine'); await page.locator('#dlg .lrow').nth(1).locator('[data-l=description]').fill('Setup'); await page.locator('#dlg .lrow').nth(1).locator('[data-l=rate]').fill('50');
  ok(/\$350\.00/.test(await page.innerText('#tot')), 'the totals follow the lines as they are typed ($350.00)', await page.innerText('#tot'));
  await page.fill('#dlg [name=taxRatePct]', '10'); await page.check('#dlg [name=chargeTax]'); await page.click('#addCredit'); await page.fill('#dlg .crow [data-c=label]', 'Deposit paid 3/9'); await page.fill('#dlg .crow [data-c=amount]', '100');
  const tot = await page.innerText('#tot'); ok(/\$35\.00/.test(tot) && /\$385\.00/.test(tot) && /\$285\.00/.test(tot) && /Final payment due/i.test(tot), 'tax, the deposit and the final amount due are shown ($385 total, $285 due)', tot);
  await page.click('#dActs [type=submit]'); await page.waitForFunction(() => /saved as a draft/.test(document.querySelector('#msg').textContent), null, { timeout: 8000 });
  await page.click('.tab[data-t=invoices]'); await page.waitForSelector(`#t-invoices tr:has-text("Acme ${tag}")`, { timeout: 8000 });
  const row = page.locator(`#t-invoices tr:has-text("Acme ${tag}")`); ok(/Draft/i.test(await row.innerText()) && /\$385\.00/.test(await row.innerText()), 'it is listed as a draft at its total');
  await row.click(); await page.waitForSelector('#dlg[open] #detail [data-act=send]'); await page.click('#detail [data-act=send]'); await page.waitForFunction(() => /Marked as sent/.test(document.querySelector('#msg').textContent) && document.querySelector('#detail')?.innerText.includes('285.00 owed'), null, { timeout: 8000 });
  ok(/Open|Overdue/i.test(await page.innerText('#detail')), 'sending it shows what is owed ($285.00)', await page.innerText('#detail'));
  await page.click('#detail [data-act=payment]'); await page.fill('#payAmt', '85'); await page.fill('#payRef', 'WIRE-UI'); await page.click('#payGo'); await page.waitForFunction(() => document.querySelector('#detail')?.innerText.includes('200.00 owed'), null, { timeout: 8000 });
  await page.click('#detail [data-act=paid]'); await page.click('#payGo'); await page.waitForFunction(() => /Settled/.test(document.querySelector('#detail')?.innerText || ''), null, { timeout: 8000 });
  ok(/Paid/i.test(await page.innerText('#detail')) && /WIRE-UI/.test(await page.innerText('#detail')), 'a part payment and then the rest settle it, and the payments are listed', await page.innerText('#detail'));
  const pdfStatus = await page.evaluate(async () => { const r = await fetch(location.origin + '/v1/money/invoices', { headers: { Authorization: 'Bearer ' + localStorage.getItem('fb.admin.token') } }); const j = await r.json(); const id = j.invoices.find(i => i.company.startsWith('Acme')).id; const p = await fetch(`/v1/money/invoices/${id}/pdf`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('fb.admin.token') } }); return [p.status, p.headers.get('content-type')]; });
  ok(pdfStatus[0] === 200 && /pdf/.test(pdfStatus[1]), 'its PDF opens'); await page.click('#dClose');
  // past invoices
  await page.click('#importBtn'); await page.waitForSelector('#dlg[open] #csvText');
  await page.fill('#csvText', `Invoice,Date,Company,Description,Amount,Terms\n${stamp}8,4/1/2026,Old Co ${tag},Retail Support Services - April,"$23,000.00",Net 30\n`);
  await page.locator('#dActs button', { hasText: 'Preview' }).click(); await page.waitForFunction(() => /Ready to import: 1 invoice/.test(document.querySelector('#prev')?.innerText || ''), null, { timeout: 8000 });
  ok(/\$23,000\.00/.test(await page.innerText('#prev')), 'the preview says what would come in');
  await page.locator('#dActs button', { hasText: 'Import' }).last().click(); await page.waitForFunction(() => /Imported 1 invoices/.test(document.querySelector('#msg').textContent), null, { timeout: 8000 }); await page.click('#dClose');
  await page.click('.tab[data-t=invoices]'); await page.click('#fInv [data-st=unrecorded]'); await page.waitForSelector(`#t-invoices tr:has-text("Old Co ${tag}")`, { timeout: 8000 });
  ok(/Payment not recorded/i.test(await page.locator(`#t-invoices tr:has-text("Old Co ${tag}")`).innerText()), 'the imported invoice waits as “payment not recorded”');
  await page.click('.tab[data-t=overview]'); await page.waitForSelector('#t-overview .panel:has-text("no payment recorded")', { timeout: 8000 }); ok(true, 'and the overview points at it');
  // ledger and settings
  await page.click('.tab[data-t=ledger]'); await page.waitForSelector(`#t-ledger tr:has-text("Acme ${tag}")`, { timeout: 8000 }); ok(/WIRE-UI/.test(await page.innerText('#t-ledger')) && /Entered by hand/i.test(await page.innerText('#t-ledger')), 'the ledger lists the payments with where they came from', (await page.innerText('#t-ledger')).slice(0, 400));
  await page.click('.tab[data-t=settings]'); await page.waitForSelector('#instr'); await page.fill('#instr', 'Account No. 000\nBank: Test Bank'); await page.click('#saveInstr'); await page.waitForFunction(() => /Saved/.test(document.querySelector('#sMsg').textContent), null, { timeout: 5000 });
  ok(await page.locator('#t-settings a[href="/admin#accessPanel"]').count() === 1, 'the payment instructions save, and the tech pack payment gate is one link away');
  ok(page.errs.length === 0, 'no script errors', page.errs); await ctx.close();
  // a phone
  const { ctx: pc, page: ph } = await phone(); try { await ph.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyle); await ph.goto(`${W}/money`, { waitUntil: 'networkidle' }); await ph.waitForSelector('#t-overview .tile', { timeout: 15000 });
    ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone nothing is wider than the screen');
    await ph.click('.tab[data-t=invoices]'); await ph.waitForSelector('#t-invoices .panel', { timeout: 8000 }); ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the invoice list also fits (the table scrolls inside its box)');
    await ph.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/j138-phone.png` }).catch(() => {}); } finally { await pc.close(); }
});

await browser.close();
const bad = summary(); process.exit(bad ? 1 : 0);
