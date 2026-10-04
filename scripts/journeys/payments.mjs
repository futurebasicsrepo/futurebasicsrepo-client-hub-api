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

const bad = summary(); process.exit(bad ? 1 : 0);
