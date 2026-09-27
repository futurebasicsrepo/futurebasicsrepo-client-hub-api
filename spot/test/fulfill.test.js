import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { checkoutUrl, matchVariant, productHandle } from '../src/fulfill/shopify.js';
import { allowedHosts, hostAllowed } from '../src/fulfill/agent.js';
import { redactText } from '../src/fulfill/snapshot.js';
import { scriptedModel, startFakeStore } from './fakestore.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const shipping = { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'kyle@example.com', phone: '5125550100' };

test('shopify: variant matching and prefilled cart permalinks', () => {
  const v = [
    { id: 1, title: 'Black / S', option1: 'Black', option2: 'S', available: true },
    { id: 2, title: 'Black / M', option1: 'Black', option2: 'M', available: true },
    { id: 3, title: 'Cream / M', option1: 'Cream', option2: 'M', available: false },
  ];
  assert.equal(matchVariant(v, 'Black / M').id, 2);
  assert.equal(matchVariant(v, 'm black').id, 2);
  assert.equal(matchVariant(v, 'Cream / M'), null, 'sold-out variants are skipped');
  assert.equal(matchVariant(v, null), null, 'ambiguous without a variant');
  assert.equal(matchVariant([v[0]], null).id, 1, 'single-variant products need no match');
  assert.equal(productHandle('https://x.com/collections/sale/products/super-puff?variant=2'), 'super-puff');
  const u = new URL(checkoutUrl('https://shop.example', [{ variant_id: 2, quantity: 1 }, { variant_id: 9, quantity: 2 }], shipping));
  assert.equal(u.pathname, '/cart/2:1,9:2');
  assert.equal(u.searchParams.get('checkout[email]'), 'kyle@example.com');
  assert.equal(u.searchParams.get('checkout[shipping_address][last_name]'), 'Riggle');
  assert.equal(u.searchParams.get('checkout[shipping_address][zip]'), '78701');
});

test('agent guardrails: allowed hosts and card redaction', () => {
  const hosts = allowedHosts({ merchant: { url: 'https://www.aritzia.com' }, items: [{ url: 'https://shop.aritzia.com/p/1' }] });
  assert.ok(hostAllowed('https://www.aritzia.com/checkout', hosts));
  assert.ok(hostAllowed('https://checkout.shopify.com/123', hosts));
  assert.ok(!hostAllowed('https://evil.example/aritzia.com', hosts));
  assert.ok(!hostAllowed('https://aritzia.com.evil.example/', hosts));
  assert.ok(!hostAllowed('https://www.google.com/', hosts));
  assert.equal(redactText('paid with 4242 4242 4242 4242 today'), 'paid with •••• (card number hidden) today');
});

async function setup(t, { env = { SPOT_AGENT: 'on' }, model } = {}) {
  const store = await startFakeStore();
  const m = model || scriptedModel();
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, fulfill: { client: m.client, shopify: { allowPrivate: true } } });
  t.after(async () => {
    await app.close();
    await store.close();
  });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.rawPayload };
  };
  const created = await call('POST', '/v1/carts', {
    requester: { name: 'Kyle' },
    merchant: { name: 'Aritzia', url: store.origin },
    items: [{ title: 'Super Puff Shorty', variant: 'Black / M', quantity: 1, price_cents: 25000, url: `${store.origin}/products/super-puff` }],
    extras_cents: 1250,
  });
  const { cart, manage_key: k } = created.body;
  await call('POST', `/v1/carts/${cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  const manage = () => call('GET', `/v1/carts/${cart.token}/manage?k=${k}`);
  const waitFor = async (pred, ms = 45_000) => {
    const end = Date.now() + ms;
    for (;;) {
      const r = await manage();
      if (pred(r.body)) return r.body;
      if (Date.now() > end) throw new Error(`timed out; last: ${JSON.stringify(r.body.cart.fulfillment)}`);
      await new Promise((z) => setTimeout(z, 250));
    }
  };
  return { store, model: m, call, cart, k, manage, waitFor };
}

test('order it for me: shopify cart → agent fills checkout → requester confirms → placed', { timeout: 90_000 }, async (t) => {
  const { store, model, call, cart, k, waitFor } = await setup(t);
  const card = (await call('POST', `/v1/carts/${cart.token}/manage/reveal`, { k })).body;

  assert.equal((await call('POST', `/v1/carts/${cart.token}/manage/order`, { k, shipping: { name: 'Kyle' } })).status, 400, 'shipping is validated');
  const started = await call('POST', `/v1/carts/${cart.token}/manage/order`, { k, shipping });
  assert.equal(started.status, 200);
  assert.equal(started.body.cart.fulfillment.method, 'shopify');
  assert.match(started.body.cart.fulfillment.manual_url, /\/cart\/112:1\?/);
  assert.equal((await call('POST', `/v1/carts/${cart.token}/manage/order`, { k, shipping })).status, 409, 'one checkout at a time');

  // Agent stops before the final tap, with the store's real total.
  const waiting = await waitFor((b) => b.cart.fulfillment?.state === 'awaiting_confirm');
  assert.equal(waiting.cart.fulfillment.total_cents, 26250);
  assert.equal(store.orders.length, 0, 'nothing placed before the requester confirms');
  const shot = await call('GET', `/v1/carts/${cart.token}/manage/order/shot.png?k=${k}`);
  assert.equal(shot.status, 200);
  assert.deepEqual([...shot.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  await call('POST', `/v1/carts/${cart.token}/manage/order/confirm`, { k, place: true });
  const done = await waitFor((b) => ['placed', 'needs_you'].includes(b.cart.fulfillment?.state));
  assert.equal(done.cart.fulfillment.state, 'placed', done.cart.fulfillment.reason);
  assert.equal(done.cart.fulfillment.order_number, '1042');

  // What the store received.
  const o = store.orders[0];
  assert.equal(o.lines, '112:1', 'right variant, from the Shopify product data');
  assert.equal(o.email, 'kyle@example.com');
  assert.equal(o.zip, '78701');
  assert.equal(o.ship, 'standard');
  assert.equal(o.news, undefined, 'never opted into marketing');
  assert.equal(o.card.n, card.number);
  assert.equal(o.card.c, card.cvc);
  assert.equal(o.card.e, `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`);

  // Guardrails held: the off-site click was undone, typing into the card field was refused,
  // and the card never appeared in anything sent to the model.
  const sent = JSON.stringify(model.requests);
  assert.match(sent, /went off the store's site/);
  assert.match(sent, /That is a payment field\. Use fill_payment instead\./);
  assert.ok(!sent.includes(card.number), 'card number never sent to the model');
  assert.ok(!sent.includes(card.number.slice(-8)), 'not even part of it');
  assert.ok(!new RegExp(`"${card.cvc}"`).test(sent), 'cvc never sent to the model');
  const events = (await call('GET', `/v1/carts/${cart.token}/manage?k=${k}`)).body.events.map((e) => e.kind);
  assert.deepEqual(events.filter((e) => e.startsWith('order_')), ['order_started', 'order_awaiting_confirm', 'order_placed']);
});

test('requester says no: nothing is placed', { timeout: 90_000 }, async (t) => {
  const { store, call, cart, k, waitFor } = await setup(t, { model: scriptedModel({ misbehave: false }) });
  await call('POST', `/v1/carts/${cart.token}/manage/order`, { k, shipping });
  await waitFor((b) => b.cart.fulfillment?.state === 'awaiting_confirm');
  await call('POST', `/v1/carts/${cart.token}/manage/order/confirm`, { k, place: false });
  const done = await waitFor((b) => b.cart.fulfillment?.state === 'cancelled');
  assert.match(done.cart.fulfillment.reason, /chose not to/);
  await new Promise((z) => setTimeout(z, 500));
  assert.equal(store.orders.length, 0);
});

test('agent off: requester gets a prefilled checkout link instead', async (t) => {
  const { call, cart, k } = await setup(t, { env: {} });
  const r = await call('POST', `/v1/carts/${cart.token}/manage/order`, { k, shipping });
  assert.equal(r.body.cart.fulfillment.state, 'needs_you');
  const u = new URL(r.body.cart.fulfillment.manual_url);
  assert.equal(u.pathname, '/cart/112:1');
  assert.equal(u.searchParams.get('checkout[shipping_address][address1]'), '1 Main St');
  const m = (await call('GET', `/v1/carts/${cart.token}/manage?k=${k}`)).body;
  assert.equal(m.agent_enabled, false);
});

test('order before the card exists is refused', async (t) => {
  const store = await startFakeStore();
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(async () => {
    await app.close();
    await store.close();
  });
  const c = (await app.inject({ method: 'POST', url: '/v1/carts', payload: { requester: { name: 'K' }, merchant: 'Aritzia', items: [{ title: 'x', price_cents: 100 }] } })).json();
  const r = await app.inject({ method: 'POST', url: `/v1/carts/${c.cart.token}/manage/order`, payload: { k: c.manage_key, shipping } });
  assert.equal(r.statusCode, 409);
});

test('a store total above the card limit stops before bothering the requester', { timeout: 90_000 }, async (t) => {
  const { store, call, cart, k, waitFor } = await setup(t, { model: scriptedModel({ misbehave: false, total: '$999.00' }) });
  await call('POST', `/v1/carts/${cart.token}/manage/order`, { k, shipping });
  const done = await waitFor((b) => b.cart.fulfillment?.state === 'needs_you');
  assert.match(done.cart.fulfillment.reason, /\$999\.00, above the card limit of \$275\.63/);
  assert.equal(store.orders.length, 0);
});

test('for_me cart: pay on the phone and the checkout agent starts by itself', { timeout: 90_000 }, async (t) => {
  const store = await startFakeStore();
  const m = scriptedModel({ misbehave: false });
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'on' }, fulfill: { client: m.client, shopify: { allowPrivate: true } } });
  t.after(async () => { await app.close(); await store.close(); });
  const c = (await app.inject({ method: 'POST', url: '/v1/carts', payload: {
    for: 'self', requester: { name: 'Kyle' }, merchant: { name: 'Aritzia', url: store.origin },
    items: [{ title: 'Super Puff Shorty', variant: 'Black / M', quantity: 1, price_cents: 25000, url: `${store.origin}/products/super-puff` }], extras_cents: 1250,
  } })).json();
  assert.equal(c.cart.for, 'self');
  await app.inject({ method: 'POST', url: `/v1/carts/${c.cart.token}/manage/prepare`, payload: { k: c.manage_key, shipping } });
  await app.inject({ method: 'POST', url: `/v1/carts/${c.cart.token}/sandbox-pay`, payload: {} });
  const end = Date.now() + 45_000;
  let f;
  for (;;) {
    f = (await app.inject({ method: 'GET', url: `/v1/carts/${c.cart.token}/manage?k=${c.manage_key}` })).json().cart.fulfillment;
    if (f?.state === 'awaiting_confirm' || f?.state === 'needs_you' || Date.now() > end) break;
    await new Promise((z) => setTimeout(z, 250));
  }
  assert.equal(f.state, 'awaiting_confirm', f?.reason);
  assert.equal(f.method, 'shopify');
});
