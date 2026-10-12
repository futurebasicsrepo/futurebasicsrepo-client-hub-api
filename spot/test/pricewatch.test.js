// Price watch: Spot checks the store's price on its own-card orders daily for
// 30 days; drops go to staff on /admin; the payer is told only once staff
// claim it, and the store's refund goes back to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { priceNow } from '../src/capture.js';
import { isDrop } from '../src/pricewatch.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const ADMIN = 'admin-token-0123456789';
const admin = { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' };
const env = { SPOT_ADMIN_TOKEN: ADMIN, RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', PUBLIC_URL: 'https://spotmeplease.com' };
const DAY = 86_400_000;
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
};

// The store's price today, per product URL; null when it can't be read.
function app(t, prices = {}) {
  const emails = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const looked = [];
  const priceNowImpl = async (item) => {
    looked.push(item.url);
    const c = prices[item.url];
    return c == null ? null : { cents: c, source: 'store' };
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, notifyFetch, priceNowImpl });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  // A paid order the store confirmed `ago` ms back.
  const ordered = async (items, { ago = DAY, payer_email = 'mom@example.com' } = {}) => {
    const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Tecovas', url: 'https://tecovas.com' }, items })).body;
    await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom', payer_email });
    const id = a.spot.load(made.cart.token).id;
    a.spot.patch(id, (c) => ({ ...c, fulfillment: { state: 'placed', order_number: '#T1001', order_url: 'https://tecovas.com/orders/1', placed_at: Date.now() - ago } }));
    return { id, token: made.cart.token, k: made.manage_key };
  };
  return { a, call, emails, looked, ordered, prices };
}

const BOOTS = 'https://tecovas.com/products/the-cartwright?variant=1';
const HAT = 'https://tecovas.com/products/the-hat';

test('a drop is worth asking for at $1 and 3% under what was paid', () => {
  assert.equal(isDrop(29500, 26500), true);
  assert.equal(isDrop(29500, 29000), false, '$5 on $295 is under 3%');
  assert.equal(isDrop(2500, 2450), false, 'under $1');
  assert.equal(isDrop(2500, 2400), true);
  assert.equal(isDrop(2500, null), false, 'unknown price');
  assert.equal(isDrop(2500, 2500), false);
});

test('a drop lands on /admin, the payer hears nothing until staff claim it, then the store refund goes back to them', async (t) => {
  const { a, call, emails, ordered, prices } = app(t, { [BOOTS]: 29500, [HAT]: 9800 });
  const { id, token, k } = await ordered([{ title: 'The Cartwright', variant: 'Bourbon / 10', url: BOOTS, price_cents: 29500 }, { title: 'The Hat', url: HAT, price_cents: 9800 }]);
  const overview = async () => (await call('GET', '/v1/admin/overview', undefined, admin)).body;

  assert.equal(await a.priceWatch.sweep(), 1);
  let c = a.spot.byId(id);
  assert.equal(c.price_watch.state, 'watching');
  assert.deepEqual(c.price_watch.items.map((x) => [x.paid_cents, x.now_cents]), [[29500, 29500], [9800, 9800]]);
  assert.equal(await a.priceWatch.sweep(), 0, 'once a day, not every run');

  prices[BOOTS] = 24900;
  assert.equal(await a.priceWatch.sweep(Date.now() + DAY), 1);
  c = a.spot.byId(id);
  assert.equal(c.price_watch.state, 'dropped');
  assert.equal(c.price_watch.drop.cents, 4600);
  const drop = (await overview()).prices.find((p) => p.id === id);
  assert.equal(drop.drop_cents, 4600);
  assert.equal(drop.order_number, '#T1001');
  assert.equal(drop.email, 'mom@example.com');
  assert.deepEqual(drop.drops.map((x) => [x.title, x.paid_cents, x.now_cents]), [['The Cartwright', 29500, 24900]]);
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(!emails.some((m) => /asked for/i.test(m.subject)), 'nobody is told before staff claim it');

  assert.equal((await call('POST', `/v1/admin/carts/${id}/price-claimed`, {})).status, 401, 'staff only');
  const r = await call('POST', `/v1/admin/carts/${id}/price-claimed`, {}, admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call('POST', `/v1/admin/carts/${id}/price-claimed`, {}, admin)).status, 409, 'once');
  await until(() => emails.some((m) => /asked for \$46\.00 back/.test(m.subject)), 'the claim email');
  const mail = emails.find((m) => /asked for/.test(m.subject));
  assert.deepEqual(mail.to, ['mom@example.com']);
  assert.match(mail.html, /The Cartwright/);
  assert.equal((await overview()).prices.find((p) => p.id === id).state, 'claimed', 'stays listed while the store pays');

  prices[BOOTS] = 19900;
  assert.equal(await a.priceWatch.sweep(Date.now() + 3 * DAY), 0, 'claimed: no more checks');

  // The store pays it onto Spot's (paused) card: straight back to the payer.
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'capture', amount_cents: a.spot.byId(id).cart_cents });
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'refund', amount_cents: 4600 });
  c = a.spot.byId(id);
  assert.equal(c.price_watch.state, 'refunded');
  assert.deepEqual(c.refunds.filter((x) => x.reason === 'price_adjustment').map((x) => [x.amount_cents, x.state]), [[4600, 'done']]);
  await until(() => emails.some((m) => /\$46\.00 back from Spot/.test(m.subject)), 'the refund email');
  assert.match(emails.find((m) => /back from Spot/.test(m.subject)).html, /matched its lower price/);
  assert.equal((await overview()).prices.find((p) => p.id === id), undefined, 'done');
});

test('staff can dismiss a drop; a price back up clears it; past 30 days it stops', async (t) => {
  const { a, call, looked, ordered, prices } = app(t, { [HAT]: 9800 });
  const one = await ordered([{ title: 'The Hat', url: HAT, price_cents: 12000 }]);
  await a.priceWatch.sweep();
  assert.equal(a.spot.byId(one.id).price_watch.state, 'dropped');
  assert.equal((await call('POST', `/v1/admin/carts/${one.id}/price-dismiss`, {}, admin)).status, 200);
  assert.equal(a.spot.byId(one.id).price_watch.state, 'dismissed');
  assert.equal((await call('GET', '/v1/admin/overview', undefined, admin)).body.prices.length, 0);

  const two = await ordered([{ title: 'The Hat', url: HAT, price_cents: 12000 }]);
  await a.priceWatch.sweep();
  assert.equal(a.spot.byId(two.id).price_watch.state, 'dropped');
  prices[HAT] = 12000;
  await a.priceWatch.sweep(Date.now() + DAY);
  assert.equal(a.spot.byId(two.id).price_watch.state, 'watching', 'back up: nothing to claim today');
  assert.equal(a.spot.byId(two.id).price_watch.items[0].low_cents, 9800, 'the low is kept');

  const old = await ordered([{ title: 'The Hat', url: HAT, price_cents: 12000 }], { ago: 31 * DAY });
  prices[HAT] = 8000;
  looked.length = 0;
  await a.priceWatch.sweep(Date.now() + 2 * DAY);
  assert.equal(a.spot.byId(old.id).price_watch, undefined, 'past the window: never checked');
  assert.ok(looked.length > 0);
});

test('only Spot-card orders the store took, not open, refunded or unreadable ones', async (t) => {
  const { a, call, ordered } = app(t, {});
  // Not ordered yet.
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Tecovas' }, items: [{ title: 'Belt', url: 'https://tecovas.com/products/belt', price_cents: 9000 }] })).body;
  await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  // Ordered, but the store page can't be read today.
  const blind = await ordered([{ title: 'Boots', url: 'https://tecovas.com/products/x', price_cents: 20000 }]);
  assert.equal(await a.priceWatch.sweep(), 1);
  assert.equal(a.spot.byId(a.spot.load(made.cart.token).id).price_watch, undefined);
  const pw = a.spot.byId(blind.id).price_watch;
  assert.equal(pw.state, 'watching');
  assert.equal(pw.items[0].now_cents, null);
});

test('priceNow reads the exact option bought on Shopify, else a single price on the page', async () => {
  const product = async () => ({ title: 'The Cartwright', variants: [{ id: 1, option1: 'Bourbon', option2: '10', price: 24900, available: false }, { id: 2, option1: 'Bourbon', option2: '11', price: 29500, available: true }, { id: 3, option1: 'Midnight', option2: '10', price: 29500 }] });
  assert.deepEqual(await priceNow({ url: 'https://x.com/products/c', variant: 'Bourbon / 10' }, { product }), { cents: 24900, source: 'store' }, 'sold out still counts');
  assert.deepEqual(await priceNow({ url: 'https://x.com/products/c?variant=2', variant: '' }, { product }), { cents: 29500, source: 'store' });
  assert.equal(await priceNow({ url: 'https://x.com/products/c', variant: 'Bourbon' }, { product }), null, 'two options at different prices');
  const one = async () => ({ title: 'Hat', variants: [{ id: 1, option1: 'S', price: 9800 }, { id: 2, option1: 'M', price: 9800 }] });
  assert.deepEqual(await priceNow({ url: 'https://x.com/products/h' }, { product: one }), { cents: 9800, source: 'store' });

  const none = async () => null;
  assert.deepEqual(await priceNow({ url: 'https://y.com/p' }, { product: none, fromUrl: async () => ({ items: [{ price_cents: 5000 }] }) }), { cents: 5000, source: 'page' });
  assert.equal(await priceNow({ url: 'https://y.com/p' }, { product: none, fromUrl: async () => ({ items: [{ price_cents: 5000 }, { price_cents: 6000 }] }) }), null);
  assert.equal(await priceNow({ url: 'https://y.com/p' }, { product: none, fromUrl: async () => ({ items: [], warning: 'Y doesn’t let Spot read its pages' }) }), null);
  assert.equal(await priceNow({ title: 'no link' }), null);
});
