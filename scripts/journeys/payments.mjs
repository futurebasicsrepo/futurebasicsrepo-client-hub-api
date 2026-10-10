// The payment sync, end to end against a stand-in store (shopify-mock.mjs): a tech pack paid for in the store reaches the ledger, the
// client's card and the pack itself without anyone pressing a button, and the Platform page tells the truth about it, including when it breaks.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, forge, sql, stamp, waitAi } from './lib.mjs';
const BASE = 'http://127.0.0.1:3127', MOCK = 'http://127.0.0.1:3126', call = api(BASE), runner = jpeg();
const mock = async (path, body) => (await fetch(MOCK + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
const email = `pay-${stamp}@chaos.test`;
let CID = '';
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}

await journey('J46', 'a tech pack paid for in the store reaches the card, the pack and the Platform page without anyone pressing sync', async () => {
  const r1 = await call('/v1/public/start', { body: { email, name: 'Pay Tester', title: 'First pack', photos: [runner] } });
  ok(r1.status === 201 && r1.json.token, 'setup: a customer starts their first (free) pack', r1.status);
  const token = r1.json.token, cid = r1.json.client.id, pid = r1.json.project.id; CID = cid; await waitAi(call, token, r1.json.product.id);
  const second = (await call('/v1/tech-packs', { token, body: { title: 'Second pack, paid in the store', projectId: pid, photos: [runner] } })).json; ok(second.ai === 'locked', 'setup: the second pack waits for payment', second.ai);
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${email}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const card = async () => (await adm('/v1/admin/dashboard')).json.clients.find(c => c.id === cid);
  const before = await card(); ok(Number(before.paid_cents) === 0 && Number(before.payment_count) === 0, 'before the payment: the card has nothing paid', [before.paid_cents, before.payment_count]);

  // the customer pays $48 in the store and closes the tab: the hub is never told
  const order = await mock('/__mock/orders', { email, amount: 48, productId: second.product.id, productTitle: 'Second pack, paid in the store' });
  ok(order.name?.startsWith('#'), 'setup: the order exists in the store', order.name);
  const run = await adm('/v1/admin/payments/sync', { method: 'POST' }); ok(run.status === 200 && run.json.changed >= 1, 'the payment sync finds the order', [run.status, run.json]);
  ok(sql(`select count(*) from payments where client_id='${cid}' and kind='tech-pack' and amount_cents=4800 and shopify_order_name='${order.name}'`) === '1', 'it is in the ledger once, with the order number and the amount');
  let st = ''; for (let i = 0; i < 30; i++) { st = (await call(`/v1/products/${second.product.id}/tech-pack/draft`, { token })).json.techPack?.aiStatus; if (st && st !== 'locked') break; await sleep(400); }
  ok(st && st !== 'locked', 'the locked pack was unlocked by the payment, and the assistant runs', st);
  const after = await card(); ok(Number(after.paid_cents) === 4800 && Number(after.payment_count) === 1, 'the client card shows $48 paid, one payment', [after.paid_cents, after.payment_count]);
  ok(Number(after.total_spent_cents) === 4800, 'and the store spend was refreshed too, with no button', after.total_spent_cents);
  const again = await adm('/v1/admin/payments/sync', { method: 'POST' }); ok(again.status === 200 && again.json.changed === 0 && sql(`select count(*) from payments where client_id='${cid}'`) === '1', 'running it again changes nothing and never double counts', [again.json.changed]);
  const room = (await adm(`/v1/admin/clients/${cid}`)).json; ok(room.payments?.length === 1 && /Second pack/.test(room.payments[0].title) && Number(room.payments[0].amount_cents) === 4800, 'the room lists the payment with what it was for', room.payments);

  // an order we cannot place is kept visible, not dropped
  await mock('/__mock/orders', { email: `stranger-${stamp}@nowhere.test`, amount: 20, title: 'A mug' });
  await adm('/v1/admin/payments/sync', { method: 'POST' });
  let h = (await adm('/v1/admin/platform/health?fresh=1')).json, pay = h.checks.find(c => c.id === 'payments');
  ok(pay && pay.status === 'ok' && /Reading the store/.test(pay.summary), 'the Platform page has a payments check and it is healthy', pay && [pay.status, pay.summary]);
  ok(h.payments.recent.some(r => r.client_name && Number(r.amount_cents) === 4800) && h.payments.unmatched.some(u => /nowhere\.test/.test(u.email)), 'it lists recent payments and the order it could not place in a room', [h.payments.recent.length, h.payments.unmatched]);
  ok(pay.facts.some(([k, v]) => k === 'In the ledger' && /\d+ payments? · \$/.test(v)) && pay.facts.some(([k]) => k === 'Paid but still locked'), 'with the ledger and the locked-after-paid count in its facts', pay.facts);

  // the store stops answering: the page must say so, not stay green
  await mock('/__mock/fail', { on: true });
  const failed = await adm('/v1/admin/payments/sync', { method: 'POST' }); ok(failed.status === 502, 'a failing store makes the sync fail loudly', failed.status);
  h = (await adm('/v1/admin/platform/health?fresh=1')).json; pay = h.checks.find(c => c.id === 'payments');
  ok(['warn', 'down'].includes(pay.status) && /fail/i.test(pay.summary), 'and the payments check turns amber or red and says why', [pay.status, pay.summary]);
  ok(h.checks.find(c => c.id === 'shopify').status !== 'ok', 'the store connection is not green either');
  await mock('/__mock/fail', { on: false });
  await adm('/v1/admin/payments/sync', { method: 'POST' }); h = (await adm('/v1/admin/platform/health?fresh=1')).json; ok(h.checks.find(c => c.id === 'payments').status === 'ok', 'once the store is back, the next run turns it green again');

  // a pack that was paid for but is still locked is the exact failure to catch
  sql(`update tech_packs set ai_status='locked',paid_at=now() where product_id='${second.product.id}'`);
  h = (await adm('/v1/admin/platform/health?fresh=1')).json; pay = h.checks.find(c => c.id === 'payments');
  ok(pay.status === 'warn' && /paid for in the store but .* still locked/i.test(pay.summary), 'a paid pack that is still locked turns the check amber', [pay.status, pay.summary]);
  sql(`update tech_packs set ai_status='done' where product_id='${second.product.id}'`);
});

await journey('J47', 'the console shows payments: the client card, the room, and the Platform page', async () => {
  if (!playwright) { ok(true, 'skipped: Playwright is not available'); return; }
  const cid = CID; ok(Boolean(cid), 'setup: the paying client exists');
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${email}'`), clientId: cid, role: 'admin' });
  const browser = await playwright.chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
  const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); const W = 'http://work.localhost:3127';
  try {
    await page.goto(`${W}/admin`, { waitUntil: 'networkidle' }); await page.waitForSelector('.client-card', { timeout: 15000 });
    const cardText = await page.locator('.client-card', { hasText: 'pay-' }).first().innerText().catch(() => '');
    ok(/\$48/.test(cardText) && /paid/i.test(cardText), 'the client card shows $48 paid', cardText.slice(0, 200));
    await page.goto(`${W}/clients/${cid}#invoices`, { waitUntil: 'networkidle' }); await page.waitForSelector('text=Payments received', { timeout: 15000 });
    const room = await page.innerText('#roomMain'); ok(/\$48/.test(room) && /Second pack/.test(room) && /order #/i.test(room), 'the room lists the payment with its order number', room.slice(0, 220));
    await page.goto(`${W}/platform`, { waitUntil: 'networkidle' }); await page.waitForSelector('.pf-banner', { timeout: 15000 });
    ok(await page.locator('.pf-card .pf-name', { hasText: 'Shopify payments' }).count() === 1, 'the Platform page has the Shopify payments card');
    const t = await page.innerText('#pfHealth'); ok(/Payments/.test(t) && /\$48/.test(t) && /Sync payments now/.test(t), 'and the payments table with a Sync now button', t.slice(0, 80));
    await page.locator('#pfHealth').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j47-platform-payments.png` }).catch(() => {});
    ok(page.errs.length === 0, 'no script errors', page.errs);
  } finally { await ctx.close(); await browser.close(); }
});

const bad = await journey('J103', 'the published pack as a Shopify product: preview, a draft with every variant, a re-export that deletes nothing and leaves the merchant\'s price alone', async () => {
  const mail = `shop-${stamp}@chaos.test`, r = await call('/v1/public/start', { body: { email: mail, name: 'Shop Tester', title: 'Heavy hoodie', photos: [runner] } }); ok(r.status === 201, 'setup: a customer starts a pack', r.status);
  const tok = r.json.token, cid = r.json.client.id, pid = r.json.product.id; await waitAi(call, tok, pid);
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${mail}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const products = async () => (await (await fetch(MOCK + '/__mock/products')).json()).products;
  const X = `/v1/admin/products/${pid}/tech-pack/shopify-export`;
  ok((await adm(X)).status === 409, 'an unpublished pack cannot be exported: the store gets the published version');
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: shopify export' } })).status === 200, 'staff publish');
  // no price yet: the preview says what blocks it, the export refuses with the same words
  let pv = await adm(X, { body: { preview: true } }); ok(pv.status === 200 && pv.json.preview && pv.json.summary.errors.some(e => /No price/.test(e)) && pv.json.summary.mode === 'create', 'the preview says what blocks it (no price) and that it would create', pv.json.summary);
  const ex1 = await adm(X, { body: {} }); ok(ex1.status === 422 && /No price/.test(ex1.json.error), 'and the export refuses with the same words, nothing is sent', [ex1.status, ex1.json.error]);
  ok((await products()).length === 0, 'the store has nothing');
  // price, weight, HS code, origin and SKUs go in the pack (as the client would)
  let d = (await adm(`/v1/admin/products/${pid}/tech-pack`)).json; const data = structuredClone(d.techPack.data), sizes = data.sizes.length, colours = Math.max(1, data.colorways.length);
  data.commercial = { retailPrice: '89', compareAtPrice: '120', weightGrams: '420', hsCode: '611020', currency: 'USD', variants: [] }; data.care.countryOfOrigin = 'Made in Vietnam'; data.style.styleName = 'Heavy hoodie'; data.style.description = 'Boxy fit.\n\nBrushed fleece inside.';
  ok((await adm(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data } })).status === 200, 'staff put the commercial facts in the pack');
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: v2 with price' } })).status === 200, 'and publish the next version');
  pv = await adm(X, { body: { preview: true } }); ok(pv.json.summary.errors.length === 0 && pv.json.summary.variants === sizes * colours && pv.json.summary.options.length >= 1 && pv.json.summary.version === 2, 'the preview is clean: one variant per size and colour', pv.json.summary);
  ok((await products()).length === 0, 'a preview sends nothing');
  // the export
  const ex = await adm(X, { body: {} }); ok(ex.status === 201 && ex.json.report.mode === 'create' && ex.json.report.variants.created === sizes * colours && /admin\.shopify\.com/.test(ex.json.report.adminUrl), 'the export creates the product', [ex.status, ex.json.error, ex.json.report]);
  let ps = await products(), p = ps[0]; ok(ps.length === 1 && p.status === 'DRAFT' && p.variants.length === sizes * colours && p.title === 'Heavy hoodie', 'a DRAFT product with every variant is in the store', [ps.length, p && p.status, p && p.variants.length]);
  const v0 = p.variants[0]; ok(v0.sku && v0.price === '89.00' && v0.inventoryItem.measurement.weight.value === 420 && v0.inventoryItem.harmonizedSystemCode === '611020' && v0.inventoryItem.countryCodeOfOrigin === 'VN', 'each variant carries SKU, price, weight, HS code and origin', v0);
  ok(p.metafields.some(m => m.namespace === 'techpack' && m.key === 'style_number') && p.metafields.some(m => m.key === 'pack_url') && p.descriptionHtml === '<p>Boxy fit.</p><p>Brushed fleece inside.</p>', 'the specification metafields and the description are on it');
  const row = sql(`select shopify_product_id||'|'||coalesce(shopify_status,'') from products where id='${pid}'`); ok(row.startsWith(p.id) && /DRAFT/.test(row), 'the product is linked to the Shopify product', row);
  const st = (await adm(X)).json; ok(st.last && st.last.mode === 'create' && st.last.version === 2 && st.behind === false && st.last.productId === p.id, 'the pack page can say what was exported and that it is up to date', st.last);
  // the merchant edits in Shopify; the pack changes a measurement and the weight; re-export
  await fetch(MOCK + '/__mock/product-edit', { method: 'POST', body: JSON.stringify({ id: p.id, price: '95.00', title: 'Heavy hoodie (Autumn)', addVariant: 'MERCHANT-ONLY' }) });
  d = (await adm(`/v1/admin/products/${pid}/tech-pack`)).json; const d2 = structuredClone(d.techPack.data); d2.commercial.weightGrams = '450'; d2.care.fiber = '100% organic cotton';
  ok((await adm(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data: d2 } })).status === 200, 'staff change the weight and the fibre in the pack');
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: v3' } })).status === 200, 'and publish v3');
  ok((await adm(X)).json.behind === true, 'the pack page now says the store is behind the pack');
  const re = await adm(X, { body: {} }); ok(re.status === 200 && re.json.report.mode === 'update' && re.json.report.variants.updated === sizes * colours && re.json.report.variants.created === 0 && re.json.report.variants.notInPack.join() === 'MERCHANT-ONLY', 'the re-export updates every variant, creates none, and reports the one it does not know', [re.status, re.json.error, re.json.report]);
  ps = await products(); p = ps[0]; ok(ps.length === 1 && p.title === 'Heavy hoodie (Autumn)' && p.variants.length === sizes * colours + 1, 'it did not make a second product, did not retitle it and did not delete the merchant\'s variant', [ps.length, p.title, p.variants.length]);
  ok(p.variants.filter(v => v.sku !== 'MERCHANT-ONLY').every(v => v.price === '95.00' && v.inventoryItem.measurement.weight.value === 450), 'the merchant\'s price stands and the new weight is on every variant', p.variants.map(v => [v.price, v.inventoryItem.measurement && v.inventoryItem.measurement.weight && v.inventoryItem.measurement.weight.value]));
  ok(JSON.parse(p.metafields.find(m => m.key === 'pack_version').value) === 3 && p.metafields.find(m => m.key === 'fibre').value === '100% organic cotton', 'the specification metafields are current (v3, the new fibre)');
  ok(Number(sql(`select count(*) from shopify_exports where product_id='${pid}'`)) === 2 && Number(sql(`select count(*) from activities where product_id='${pid}' and summary like '%on Shopify%'`)) === 2, 'both exports are on record, and in the activity log');
  ok((await adm(X)).json.behind === false, 'and the store is no longer behind');
  // the same thing from the work console: the menu item, the preview, the update, the link
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, admin);
      const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
      await pg.goto(`http://work.localhost:3127/tech-packs/${pid}`, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('#acts details.more summary', { timeout: 20000 }); await pg.keyboard.press('Escape');
      await pg.click('#acts details.more summary'); await pg.click('[data-act="shopify"]'); await pg.waitForSelector('dialog.shopify [data-sx="go"]', { timeout: 10000 });
      const txt = await pg.innerText('dialog.shopify'); ok(/up to date/i.test(txt) && /never removes a variant/i.test(txt) && /Update on Shopify/.test(txt) && /Open the product in Shopify/.test(txt), 'the dialog says what was sent last and what an update will and will not do', txt.slice(0, 260));
      await pg.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j103-dialog.png` }).catch(() => {});
      await pg.click('dialog.shopify [data-sx="go"]'); await pg.waitForFunction(() => /Product updated/.test(document.querySelector('dialog.shopify')?.innerText || ''), null, { timeout: 15000 });
      ok(/left alone/.test(await pg.innerText('dialog.shopify')) && /MERCHANT-ONLY/.test(await pg.innerText('dialog.shopify')) && await pg.locator('dialog.shopify a[href*="admin.shopify.com"]').count() === 1 && pg.errs.length === 0, 'pressing it updates the product and reports the merchant\'s own variant it left alone', pg.errs);
      await ctx.close();
    } finally { await bw.close(); }
  }
  // the store is down: said plainly, nothing recorded
  await mock('/__mock/fail', { on: true }); const down = await adm(X, { body: {} }); await mock('/__mock/fail', { on: false });
  ok(down.status >= 400 && down.status < 600 && Number(sql(`select count(*) from shopify_exports where product_id='${pid}'`)) === 3, 'with the store down it fails with a message and records no export', [down.status, down.json.error]);
  ok((await call(X, { token: tok })).status === 403 && (await call(X, { token: tok, body: {} })).status === 403, 'the client cannot run it');
});

await journey('J104', 'a customer connects their own Shopify store and sends a published pack to it: a forged callback gets nothing, our cost never leaves, a revoked store asks to reconnect', async () => {
  const APP = 'journey-app-secret', { createHmac } = await import('node:crypto');
  const mock2 = async (path, body) => (await fetch(MOCK + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
  const storeProducts = async token => (await (await fetch(`${MOCK}/__mock/products?token=${encodeURIComponent(token)}`)).json()).products;
  const mainCount = async () => (await (await fetch(MOCK + '/__mock/products')).json()).products.length;
  const mail = `merch-${stamp}@chaos.test`, r = await call('/v1/public/start', { body: { email: mail, name: 'Merchant Tester', title: 'Merchant hoodie', photos: [runner] } }); ok(r.status === 201, 'setup: a customer starts a pack', r.status);
  const tok = r.json.token, cid = r.json.client.id, pid = r.json.product.id; await waitAi(call, tok, pid);
  const other = await call('/v1/public/start', { body: { email: `merch2-${stamp}@chaos.test`, name: 'Someone Else', title: 'Another hoodie', photos: [runner] } }); const tok2 = other.json.token;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${mail}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  // a published pack with commercial facts, and a price tier whose internal cost must never reach the customer's store
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: merchant' } })).status === 200, 'staff publish');
  const d = (await adm(`/v1/admin/products/${pid}/tech-pack`)).json, data = structuredClone(d.techPack.data), n = data.sizes.length * Math.max(1, data.colorways.length);
  data.commercial = { retailPrice: '89', compareAtPrice: '120', weightGrams: '420', hsCode: '611020', currency: 'USD', variants: [] }; data.care.countryOfOrigin = 'Made in Vietnam'; data.style.styleName = 'Merchant hoodie';
  ok((await adm(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data } })).status === 200 && (await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: merchant v2' } })).status === 200, 'with price, weight, HS code and origin, v2 is published');
  sql(`insert into price_tiers(product_id,min_quantity,unit_cost_cents,wholesale_cents,srp_cents) values('${pid}',100,1111,2150,8900)`);

  // the hub: what can be connected, and what a bad address does
  let st = await call('/v1/shopify/stores', { token: tok }); ok(st.status === 200 && st.json.ready === true && st.json.stores.length === 0, 'the hub says stores can be connected and none are', st.json);
  ok((await call('/v1/shopify/stores')).status === 401, 'and asks for a sign-in');
  for (const bad of ['', 'evil.com', 'shop.myshopify.com.evil.com', 'https://evil.com/a.myshopify.com']) ok((await call('/v1/shopify/connect', { token: tok, body: { shop: bad } })).status === 422, `a bad address is refused: ${bad || '(empty)'}`);
  const go = async (shop, t = tok) => { const c = await call('/v1/shopify/connect', { token: t, body: { shop } }); const u = c.json.url ? new URL(c.json.url) : null; return { c, u, state: u && u.searchParams.get('state') }; };
  const sign = q => ({ ...q, hmac: createHmac('sha256', APP).update(Object.keys(q).sort().map(k => `${k}=${q[k]}`).join('&')).digest('hex') });
  const back = async q => { const res = await fetch(`${BASE}/v1/shopify/callback?${new URLSearchParams(q)}`, { redirect: 'manual' }); return { status: res.status, loc: res.headers.get('location') || '' }; };
  const now = () => String(Math.floor(Date.now() / 1000)), stores = () => Number(sql(`select count(*) from client_shopify_stores where client_id='${cid}' and status<>'removed'`));
  const a = await go('Merchant-One.myshopify.com'); ok(a.c.status === 200 && a.u.host === 'merchant-one.myshopify.com' && a.u.pathname === '/admin/oauth/authorize' && a.u.searchParams.get('client_id') === 'journey-app' && /write_products/.test(a.u.searchParams.get('scope')) && a.state.length >= 30, 'connecting sends the merchant to their own shop\'s authorize page with our app, scopes and a random state', a.c.json);
  const why = l => (l.match(/why=([a-z-]+)/) || [])[1];
  // forged and broken callbacks connect nothing
  let x = await back({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: a.state, timestamp: now(), hmac: 'f'.repeat(64) }); ok(why(x.loc) === 'bad-signature' && stores() === 0, 'a callback with a wrong signature is refused', x);
  x = await back({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: a.state, timestamp: now() }); ok(why(x.loc) === 'bad-signature' && stores() === 0, 'a callback with no signature is refused');
  x = await back({ ...sign({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: a.state, timestamp: now() }), shop: 'merchant-two.myshopify.com' }); ok(why(x.loc) === 'bad-signature' && stores() === 0, 'changing the shop after signing is refused');
  x = await back(sign({ code: 'goodcode1', shop: 'merchant-two.myshopify.com', state: a.state, timestamp: now() })); ok(why(x.loc) === 'state' && stores() === 0, 'a validly signed callback for a different shop than the one that started it is refused', x);
  x = await back(sign({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: 'made-up-state', timestamp: now() })); ok(why(x.loc) === 'state' && stores() === 0, 'a state we never issued is refused');
  x = await back(sign({ code: 'goodcode1', shop: 'evil.com', state: a.state, timestamp: now() })); ok(why(x.loc) === 'bad-shop' && stores() === 0, 'a non-Shopify host is refused');
  x = await back(sign({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: a.state, timestamp: String(Math.floor(Date.now() / 1000) - 7200) })); ok(why(x.loc) === 'expired' && stores() === 0, 'a stale timestamp is refused');
  const old = await go('merchant-old.myshopify.com'); sql(`update shopify_oauth_states set expires_at=now()-interval '1 minute' where state='${old.state}'`);
  x = await back(sign({ code: 'goodcode1', shop: 'merchant-old.myshopify.com', state: old.state, timestamp: now() })); ok(why(x.loc) === 'state' && stores() === 0, 'an expired state is refused');
  const bc = await go('merchant-bad.myshopify.com'); x = await back(sign({ code: 'badcode', shop: 'merchant-bad.myshopify.com', state: bc.state, timestamp: now() })); ok(why(x.loc) === 'code' && stores() === 0, 'a code Shopify does not accept connects nothing');
  const ns = await go('merchant-ns.myshopify.com'); x = await back(sign({ code: 'noscope1', shop: 'merchant-ns.myshopify.com', state: ns.state, timestamp: now() })); ok(why(x.loc) === 'scopes' && stores() === 0, 'an install without permission to write products connects nothing');
  ok(x.loc.startsWith('http://127.0.0.1:3127/'), 'and every refusal lands back on the hub, not on a blank page', x.loc);
  // the real one
  x = await back(sign({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: a.state, timestamp: now(), host: 'YWRtaW4=' })); ok(/shopify=connected/.test(x.loc) && stores() === 1, 'the real callback connects the store', x);
  x = await back(sign({ code: 'goodcode1', shop: 'merchant-one.myshopify.com', state: a.state, timestamp: now() })); ok(why(x.loc) === 'state' && stores() === 1, 'the same callback cannot be replayed');
  const sealed = sql(`select token_sealed from client_shopify_stores where client_id='${cid}'`); ok(/^v1\./.test(sealed) && !sealed.includes('mock-merchant') && !sealed.includes('goodcode1'), 'the token is sealed in the database', sealed.slice(0, 20));
  const hooks = (await (await fetch(MOCK + '/__mock/webhooks')).json()).hooks; ok(hooks['mock-merchant-goodcode1'] === 'http://127.0.0.1:3127/shopify/webhooks', 'the uninstall webhook was registered with the store', hooks);
  st = await call('/v1/shopify/stores', { token: tok }); const store = st.json.stores[0]; ok(st.json.stores.length === 1 && store.shop === 'merchant-one.myshopify.com' && store.name === 'Mock Merchant Store' && store.status === 'connected' && !/token|secret|mock-merchant/i.test(st.text), 'the hub lists it with its name and never any token', st.json);
  // nobody else can see it, use it or remove it
  ok((await call('/v1/shopify/stores', { token: tok2 })).json.stores.length === 0, 'another customer sees no stores');
  const X = `/v1/products/${pid}/tech-pack/shopify-export`;
  ok((await call(`${X}?storeId=${store.id}`, { token: tok2 })).status === 404 && (await call(X, { token: tok2, body: { storeId: store.id } })).status === 404, 'another customer cannot export this pack, or through this store');
  ok((await call(`/v1/shopify/stores/${store.id}`, { token: tok2, method: 'DELETE' })).status === 404 && stores() === 1, 'or disconnect it');
  ok((await call(X, { token: tok })).status === 200 && (await call(`/v1/products/${pid}/tech-pack/shopify-export`)).status === 401, 'the owner can ask, a stranger with no sign-in cannot');
  // the export, to their own store
  const before = await mainCount(); let gx = await call(X, { token: tok }); ok(gx.json.store?.shop === 'merchant-one.myshopify.com' && gx.json.summary.mode === 'create' && gx.json.summary.variants === n && gx.json.needsStore === false, 'with one store connected the pack page already knows where it will go', gx.json.summary);
  const pv = await call(X, { token: tok, body: { preview: true } }); ok(pv.status === 200 && pv.json.preview && (await storeProducts('mock-merchant-goodcode1')).length === 0, 'a preview sends nothing');
  const ex = await call(X, { token: tok, body: {} }); ok(ex.status === 201 && ex.json.report.mode === 'create' && ex.json.report.variants.created === n && /admin\.shopify\.com\/store\/merchant-one\//.test(ex.json.report.adminUrl), 'the export creates the draft on THEIR store', [ex.status, ex.json.error, ex.json.report]);
  const mine = await storeProducts('mock-merchant-goodcode1'); ok(mine.length === 1 && mine[0].status === 'DRAFT' && mine[0].variants.length === n && mine[0].title === 'Merchant hoodie', 'a DRAFT with every variant is in their store', [mine.length, mine[0] && mine[0].status]);
  ok(await mainCount() === before, 'and nothing was made on the Future Basics store');
  ok(mine[0].variants.every(v => v.inventoryItem.cost === '21.50'), 'their cost is what they pay Future Basics (the wholesale price), not our internal cost', mine[0].variants.map(v => v.inventoryItem.cost));
  ok(!JSON.stringify(mine).includes('11.11') && !JSON.stringify(mine).includes('1111'), 'our internal unit cost appears nowhere in their store');
  ok(sql(`select coalesce(shopify_product_id,'-') from products where id='${pid}'`) === '-', 'the product record is not linked to the customer\'s Shopify product (that link is Future Basics\' own store)');
  ok(sql(`select count(*) from shopify_exports where product_id='${pid}' and store_id='${store.id}'`) === '1' && sql(`select count(*) from activities where product_id='${pid}' and summary like '%merchant-one.myshopify.com%'`) === '1', 'the export is on record against that store');
  // staff exporting to Future Basics' own store is a separate history
  const adminGet = await adm(`/v1/admin/products/${pid}/tech-pack/shopify-export`); ok(adminGet.json.last === null && adminGet.json.stores.length === 1 && adminGet.json.stores[0].id === store.id, 'staff see their own store has no export yet, and the customer\'s store as an option', adminGet.json.stores);
  // the merchant changes the price in Shopify; the customer re-sends: the specification updates, the price stands
  await mock2('/__mock/product-edit', { id: mine[0].id, price: '95.00', title: 'Merchant hoodie (Autumn)' });
  const re = await call(X, { token: tok, body: {} }); ok(re.status === 200 && re.json.report.mode === 'update' && re.json.report.variants.created === 0 && re.json.report.variants.updated === n, 're-sending updates, creates nothing', [re.status, re.json.error, re.json.report]);
  const after = await storeProducts('mock-merchant-goodcode1'); ok(after.length === 1 && after[0].title === 'Merchant hoodie (Autumn)' && after[0].variants.every(v => v.price === '95.00'), 'it did not retitle the product or touch the price the merchant set', [after[0].title, after[0].variants.map(v => v.price)]);
  // staff can send the same pack to the customer's store too, and it carries on from the same product
  const sx = await adm(`/v1/admin/products/${pid}/tech-pack/shopify-export`, { body: { storeId: store.id } }); ok(sx.status === 200 && sx.json.report.mode === 'update' && sx.json.report.productId === mine[0].id, 'staff can send to the customer\'s store, and it continues the same product', [sx.status, sx.json.error]);
  // the page
  if (playwright) {
    const bw = await playwright.chromium.launch();
    try {
      const ctx = await bw.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, tok);
      const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message));
      await pg.goto(`${BASE}/?shopify=error&why=state`, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('#shopPanel:not(.hidden)', { timeout: 20000 });
      const panel = await pg.innerText('#shopPanel'); ok(/merchant-one\.myshopify\.com/i.test(panel) && /Connected/i.test(panel) && /Disconnect/i.test(panel) && /already used or has expired/i.test(panel), 'the hub shows the store, its state, and the plain-words reason a sign-in failed', panel.slice(0, 260));
      ok(!/\?shopify=/.test(pg.url()), 'and cleans the address bar', pg.url());
      await pg.locator('#shopPanel').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j104-hub.png` }).catch(() => {});
      await pg.goto(`${BASE}/tech-packs/${pid}`, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('#acts details.more summary', { timeout: 20000 });
      await pg.click('#acts details.more summary'); await pg.click('[data-act="shopify"]'); await pg.waitForSelector('dialog.shopify [data-sx="go"]', { timeout: 10000 });
      const txt = await pg.innerText('dialog.shopify'); ok(/Send to my Shopify store/.test(txt) && /merchant-one\.myshopify\.com/.test(txt) && /Update on Shopify/.test(txt) && /never removes a variant/.test(txt), 'the customer\'s pack menu opens the dialog for their store', txt.slice(0, 240));
      await pg.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j104-dialog.png` }).catch(() => {});
      await pg.click('dialog.shopify [data-sx="go"]'); await pg.waitForFunction(() => /Product updated/.test(document.querySelector('dialog.shopify')?.innerText || ''), null, { timeout: 15000 });
      ok(await pg.locator('dialog.shopify a[href*="merchant-one"]').count() === 1 && pg.errs.length === 0, 'pressing it updates their product and links to it', pg.errs);
      await ctx.close();
    } finally { await bw.close(); }
  }
  // the store is revoked in Shopify (token refused): the next send says so and the hub asks to reconnect
  await mock2('/__mock/revoke', { token: 'mock-merchant-goodcode1' });
  const dead = await call(X, { token: tok, body: {} }); ok(dead.status === 409 && /Reconnect/.test(dead.json.error), 'a refused token says to reconnect', [dead.status, dead.json.error]);
  ok(sql(`select status from client_shopify_stores where id='${store.id}'`) === 'needs-reconnect' && (await call('/v1/shopify/stores', { token: tok })).json.stores[0].status === 'needs-reconnect', 'and the store is marked for reconnecting in the hub');
  ok((await call(X, { token: tok, body: {} })).status === 409, 'it stays blocked until reconnected');
  const re2 = await go('merchant-one.myshopify.com'); x = await back(sign({ code: 'goodcode1~2', shop: 'merchant-one.myshopify.com', state: re2.state, timestamp: now() }));
  ok(/shopify=connected/.test(x.loc) && stores() === 1 && sql(`select id||status from client_shopify_stores where client_id='${cid}' and status<>'removed'`) === store.id + 'connected', 'reconnecting the same store reuses its row (one store, connected again)', x);
  const again = await call(X, { token: tok, body: {} }); ok(again.status === 200 && again.json.report.mode === 'update', 'and the pack carries on updating the same product', [again.status, again.json.error]);
  // the webhook: only Shopify can say the app was removed
  const body = JSON.stringify({ id: 1 }), good = createHmac('sha256', APP).update(body).digest('base64');
  const hook = (sig, shop = 'merchant-one.myshopify.com', topic = 'app/uninstalled') => fetch(`${BASE}/shopify/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Hmac-Sha256': sig, 'X-Shopify-Topic': topic, 'X-Shopify-Shop-Domain': shop }, body });
  ok((await hook('bad')).status === 401 && (await hook('')).status === 401 && stores() === 1, 'a webhook with a wrong signature is refused and changes nothing');
  ok((await hook(good)).status === 200 && stores() === 0 && sql(`select coalesce(token_sealed,'-') from client_shopify_stores where id='${store.id}'`) === '-', 'a signed uninstall webhook removes the store and wipes its token');
  const gone = await call(X, { token: tok }); ok(gone.status === 200 && gone.json.needsStore === true && gone.json.stores.length === 0 && (await call(X, { token: tok, body: {} })).status === 409, 'the pack page then asks them to connect a store, and nothing is sent', gone.json.needsStore);
  ok((await hook(good, 'unknown-shop.myshopify.com', 'customers/data_request')).status === 200 && (await hook(good, 'unknown-shop.myshopify.com', 'shop/redact')).status === 200, 'the privacy topics are answered');
  // disconnect from the hub
  const b = await go('merchant-three.myshopify.com'); await back(sign({ code: 'goodcode3', shop: 'merchant-three.myshopify.com', state: b.state, timestamp: now() })); ok(stores() === 1, 'a second store connects');
  const sid = sql(`select id from client_shopify_stores where client_id='${cid}' and status<>'removed'`), del = await call(`/v1/shopify/stores/${sid}`, { token: tok, method: 'DELETE' });
  ok(del.status === 200 && stores() === 0 && sql(`select coalesce(token_sealed,'-') from client_shopify_stores where id='${sid}'`) === '-', 'disconnecting from the hub removes the store and wipes the token', del.json);
  ok((await call(`/v1/shopify/stores/${sid}`, { token: tok, method: 'DELETE' })).status === 404, 'and doing it twice is a clean 404');
});

await journey('J105', 'the tech pack header carries the brand like the rest of the hub: logo and suffix for customer, staff and factory, the way home, the breadcrumb on its own row, the tab bar under it, and nothing overflowing on a phone', async () => {
  if (!playwright) { ok(true, 'skipped: Playwright is not available'); return; }
  const mail = `hdr-${stamp}@chaos.test`, r = await call('/v1/public/start', { body: { email: mail, name: 'Header Tester', title: 'Header hoodie', photos: [runner] } }); ok(r.status === 201, 'setup: a customer starts a pack', r.status);
  const tok = r.json.token, cid = r.json.client.id, pid = r.json.product.id; await waitAi(call, tok, pid);
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${mail}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: header' } })).status === 200, 'staff publish');
  ok((await call(`/v1/products/${pid}/tech-pack/approve`, { method: 'POST', token: tok, body: { name: 'Pat Client' } })).status === 200, 'the client approves');
  const sh = await adm(`/v1/admin/products/${pid}/tech-pack/shares`, { method: 'POST', body: { label: 'Header Mill', email: `headermill-${stamp}@chaos.test` } }), ftok = sh.json.url ? sh.json.url.split('/tp/')[1] : ''; ok(Boolean(ftok), 'setup: a factory link', [sh.status, sh.json]);
  const shot = (n, pg) => pg.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP}/j105-${n}.png`, clip: { x: 0, y: 0, width: pg.viewportSize().width, height: Math.min(pg.viewportSize().height, pg.viewportSize().width < 700 ? 800 : 300) } }).catch(() => {});
  const bw = await playwright.chromium.launch();
  const probe = pg => pg.evaluate(() => {
    const q = s => document.querySelector(s), box = e => { const b = e && e.getBoundingClientRect(); return b && { top: b.top, bottom: b.bottom, left: b.left, width: b.width, height: b.height }; };
    const hd = q('header.top'), logo = q('.top .brand-logo'), loaded = Boolean(logo && logo.complete && logo.naturalWidth > 0), suf = q('.top .brand-suffix'), home = q('#homeLink'), cr = q('#crumb'), tabs = q('#tabs');
    return { header: box(hd), logo: box(logo), logoSrc: logo && logo.getAttribute('src'), loaded, suffix: suf && getComputedStyle(suf).display !== 'none' ? suf.innerText.trim() : '', href: home && home.getAttribute('href'), label: home && home.getAttribute('aria-label'),
      crumbs: box(cr), crumbText: cr ? cr.innerText.trim() : '', mstatus: Boolean(q('#crumb .mstatus') && q('#crumb .mstatus').offsetParent), headStatus: Boolean(q('.top .acts .status') && q('.top .acts .status').offsetParent), headSave: Boolean(q('.top .acts [data-act="save"]') && q('.top .acts [data-act="save"]').offsetParent),
      tabBtns: [...document.querySelectorAll('#tabs button')].map(b => { const r = b.getBoundingClientRect(), l = b.querySelector('b').getBoundingClientRect(); return { l: r.left, r: r.right, labelFits: l.width <= r.width + 0.5, on: b.classList.contains('on'), bg: getComputedStyle(b).backgroundColor }; }), tabsBottom: tabs && tabs.getBoundingClientRect().bottom, innerH: innerHeight, innerW: innerWidth, crumbPos: cr && getComputedStyle(cr).position, headerPos: hd && getComputedStyle(hd).position, tabs: box(tabs), overflow: document.documentElement.scrollWidth - innerWidth, oldBrand: Boolean(q('.top .brand')) };
  });
  try {
    const open = async (role, token, url, w, h) => { const ctx = await bw.newContext({ viewport: { width: w, height: h } }); if (token) await ctx.addInitScript(([k, t]) => { try { localStorage.setItem(k, t); } catch {} }, [role === 'admin' ? 'fb.admin.token' : 'fb.client.token', token]); await ctx.route('**/future_basics_true_vector_fixed.svg*', route => route.fulfill({ path: new URL('./fixtures/fb-logo.svg', import.meta.url).pathname, contentType: 'image/svg+xml' })); const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); await pg.goto(url, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('#tabs button', { timeout: 20000 }); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); return { ctx, pg }; };
    // customer, desktop
    let { ctx, pg } = await open('client', tok, `${BASE}/tech-packs/${pid}`, 1280, 860); let m = await probe(pg);
    ok(m.logo && m.logo.width >= 120 && m.loaded && /future_basics/.test(m.logoSrc) && !m.oldBrand, 'customer: the Future Basics logo is in the bar and draws (the same file as the hub)', [m.logo, m.logoSrc, m.loaded]);
    ok(/Client Hub/i.test(m.suffix) && m.href === '/' && /client hub/i.test(m.label), 'customer: "/ Client Hub" and the logo goes to the hub', [m.suffix, m.href]);
    ok(Math.abs(m.header.height - 72) <= 1 && m.headerPos === 'sticky', 'customer: the bar is the hub\'s 72px and stays put', [m.header.height, m.headerPos]);
    ok(m.crumbs.top >= m.tabs.bottom - 1 && m.crumbPos !== 'sticky' && m.crumbs.height > 0 && /Tech pack/i.test(m.crumbText) && /Projects/i.test(m.crumbText), 'customer: the breadcrumb sits in the page under the tab bar and scrolls away', [m.crumbs, m.tabs, m.crumbText]);
    const on = m.tabBtns.filter(b => b.on); ok(on.length === 1 && on[0].bg === 'rgb(75, 255, 154)' && m.tabBtns.every(b => b.labelFits), 'customer: the tab row is brand pills, the open tab in the brand green, every label fits', m.tabBtns.map(b => [b.on, b.bg, b.labelFits]));
    await pg.evaluate(() => scrollTo(0, 700)); await pg.waitForTimeout(250); const st = await pg.evaluate(() => ({ tabs: document.querySelector('#tabs').getBoundingClientRect().top, head: document.querySelector('header.top').getBoundingClientRect().bottom }));
    ok(Math.abs(st.tabs - st.head) <= 1.5, 'customer: scrolled down, the tab bar sits directly under the bar (no gap, no overlap)', st);
    await pg.evaluate(() => scrollTo(0, 0)); await shot('client', pg); ok(pg.errs.length === 0, 'customer: no script errors', pg.errs); await ctx.close();
    // staff, desktop
    ({ ctx, pg } = await open('admin', admin, `http://work.localhost:3127/tech-packs/${pid}`, 1280, 860)); m = await probe(pg);
    ok(m.logo && m.logo.width >= 120 && /^\/ ?Work$/i.test(m.suffix) && /\/$/.test(m.href || '') && /work/i.test(m.label), 'staff: logo, "/ Work", and the logo goes to the console', [m.suffix, m.href, m.label]);
    ok(m.crumbs.top >= m.tabs.bottom - 1 && /Clients/i.test(m.crumbText) && /Tech pack/i.test(m.crumbText), 'staff: the long breadcrumb (Clients › room › project › product) sits in the page, not in the bar', m.crumbText);
    await pg.click('#acts details.more summary'); ok(await pg.isVisible('[data-act="airun"]'), 'staff: Run assistant is in More on a published pack too (it redrafts the working copy, not the published versions)');
    await shot('staff', pg); ok(pg.errs.length === 0, 'staff: no script errors', pg.errs); await ctx.close();
    // factory, desktop
    ({ ctx, pg } = await open('factory', '', `${BASE}/tp/${ftok}`, 1280, 860)); m = await probe(pg);
    ok(m.logo && m.logo.width >= 120 && /Tech pack/i.test(m.suffix) && !m.href && /^Future Basics$/.test(m.label), 'factory: logo and "/ Tech pack", and no link (a factory has no hub)', [m.suffix, m.href]);
    ok(/Working on/i.test(m.crumbText) && m.crumbs.top >= m.tabs.bottom - 1, 'factory: the "working on" line is in the page under the tabs', m.crumbText);
    await shot('factory', pg); ok(pg.errs.length === 0, 'factory: no script errors', pg.errs); await ctx.close();
    // phone
    for (const [role, token, url, name] of [['client', tok, `${BASE}/tech-packs/${pid}`, 'client'], ['admin', admin, `http://work.localhost:3127/tech-packs/${pid}`, 'staff'], ['factory', '', `${BASE}/tp/${ftok}`, 'factory']]) {
      ({ ctx, pg } = await open(role, token, url, 390, 800)); m = await probe(pg);
      ok(m.logo && m.logo.width >= 120 && m.logo.left >= 0 && m.suffix === '' && m.overflow <= 0, `${name} on a phone: the logo fits, the suffix steps aside, nothing scrolls sideways`, [m.logo, m.suffix, m.overflow]);
      ok(m.header.height <= 62 && m.header.bottom <= m.crumbs.top + 1 && !m.headStatus && !m.headSave && m.mstatus, `${name} on a phone: one slim bar (logo and the main buttons), the status and breadcrumb in the page row below`, [m.header.height, m.headStatus, m.headSave, m.mstatus]);
      ok(m.tabsBottom >= m.innerH - 1 && m.tabBtns.every(b => b.l >= 0 && b.r <= m.innerW + 0.5 && b.labelFits), `${name} on a phone: the tab dock is at the bottom and every tab and label fits the screen`, [m.tabsBottom, m.innerH, m.tabBtns.map(b => [Math.round(b.l), Math.round(b.r), b.labelFits])]);
      await shot(`${name}-phone`, pg); ok(pg.errs.length === 0, `${name} on a phone: no script errors`, pg.errs); await ctx.close();
    }
  } finally { await bw.close(); }
});

await journey('J106', 'a pack drawn from a description can be re-run by staff, even once published: the concept render stays the front view with its callouts and detail pictures, and a graphic in a sketch slot does not stop the render from being the front view', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 640, height: 320, channels: 3, background: '#ffffff' } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect x="40" y="90" width="90" height="150" fill="#000"/><rect x="160" y="60" width="60" height="180" fill="#000"/></svg>`), top: 0, left: 0 }]).png().toBuffer();
  const art = `data:image/png;base64,${png.toString('base64')}`, mail = `rr-${stamp}@chaos.test`;
  const a = await call('/v1/public/start', { body: { email: mail, name: 'Rerun Tester', title: 'A hoodie and matching sweatpants', notes: 'A hoodie and matching sweatpants', photos: [art] } }); ok(a.status === 201, 'a graphic with a description starts a room', a.status);
  const cid = a.json.client.id, pid = a.json.product.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${mail}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const pack = async () => (await adm(`/v1/admin/products/${pid}/tech-pack`)).json.techPack;
  const settle = async () => { await sleep(1500); for (let i = 0; i < 160; i++) { const d = await pack(); if (d && ['done', 'failed'].includes(d.aiStatus)) { await sleep(2500); const e = await pack(); if (['done', 'failed'].includes(e.aiStatus)) break; } else await sleep(300); } for (let i = 0; i < 120; i++) { const c = (await adm(`/v1/admin/products/${pid}/tech-pack/check`)).json; if (c.loop && ['done', 'failed'].includes(c.loop.status)) break; await sleep(400); } await sleep(1500); return pack(); };
  let d = await settle(), front = d.data.sketches.find(k => k.image);
  ok(front && /concept render/i.test(front.label) && front.image !== art && front.callouts.length > 0, 'first run: the concept render is the front view and has callouts', front && [front.label, front.callouts.length]);
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: rerun' } })).status === 200, 'staff publish');
  const r = await adm(`/v1/admin/products/${pid}/tech-pack/ai`, { method: 'POST' }); ok(r.status === 200 && r.json.aiStatus === 'pending', 'staff re-run it on the published pack', [r.status, r.json]);
  d = await settle(); front = d.data.sketches.find(k => k.image && /concept render/i.test(k.label)) || d.data.sketches.find(k => k.image);
  ok(d.aiStatus === 'done' && front && front.image !== art && front.callouts.length > 0 && front.callouts.some(c => c.photo || c.hphoto), 're-run: the render is still the front view, with callouts and detail pictures on them', front && [front.label, front.callouts.length, front.callouts.filter(c => c.photo || c.hphoto).length]);
  ok(d.data.artwork.length >= 1 && d.data.artwork.some(x => x.image === art), 'and the client\'s graphic is still their artwork');
  // Adam's pack: the render was made earlier and sits with the colour renderings, the front view is still "to follow", and the upload is filed without a source
  const oldRender = (await sharp({ create: { width: 800, height: 800, channels: 3, background: '#9aa3ad' } }).jpeg().toBuffer()).toString('base64');
  const data = structuredClone(d.data); data.sketches = [{ id: 'view-legacy', view: 'front', label: 'Front view — concept render to follow', image: '', garmentWidthIn: null, callouts: [] }];
  data.renderings = [{ id: 'concept-old', name: 'Concept render', note: 'Made from your graphic and your description. A first idea, not a final design.', image: `data:image/jpeg;base64,${oldRender}`, parts: [] }]; data.artwork = data.artwork.map(x => ({ ...x, source: '' }));
  ok((await adm(`/v1/admin/products/${pid}/tech-pack`, { method: 'PUT', body: { data } })).status === 200, 'setup: a pack with the render among the colour renderings, a blank front view and an upload with no source');
  ok((await adm(`/v1/admin/products/${pid}/tech-pack/ai`, { method: 'POST' })).status === 200, 'staff run the assistant again');
  d = await settle(); front = d.data.sketches.find(k => k.image);
  ok(front && /^data:image\/jpeg/.test(front.image) && !/to follow/i.test(front.label), 'the front view now has the render (the Callouts page is no longer empty)', front && front.label);
  ok(front && front.callouts.length > 0 && front.callouts.some(c => c.photo || c.hphoto), 'with the callouts pinned on it and detail pictures on them, from the one run', front && [front.callouts.length, front.callouts.filter(c => c.photo || c.hphoto).length]);
});

summary(); process.exit(bad ? 1 : 0);
