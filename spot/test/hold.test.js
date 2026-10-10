// Hold, then charge: the payer's card is only held until the store accepts
// the order, so an order Spot can't place is released, never refunded. And
// nothing is held at all until Spot's own card exists and the store has
// priced the cart (shipping and tax) for the address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider, stripeProvider } from '../src/providers.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const body = { requester: { name: 'Kyle' }, merchant: { name: 'SKLZ', url: 'https://sklz.com' }, items: [{ title: 'Pro Mini Hoop', price_cents: 3499 }] };
const tick = () => new Promise((r) => setImmediate(r));

function app(t, provider = sandboxProvider(), extra = {}) {
  const emails = [];
  const a = buildApp({ db: openDb(':memory:'), provider, cfg, logger: false, env: { SPOT_AGENT: 'off', ...(extra.env || {}) }, ...extra, notifyFetch: async (url, init) => (emails.push(JSON.parse(init.body)), { ok: true, json: async () => ({ id: 'e1' }) }) });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call, provider, emails };
}

async function paid(call, a) {
  const made = (await call('POST', '/v1/carts', body)).body;
  const r = await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom', payer_email: 'mom@example.com' });
  assert.equal(r.body.cart.status, 'card_issued');
  return { token: made.cart.token, k: made.manage_key, cart: a.spot.load(made.cart.token) };
}

test('the payer’s card is held, and charged only when the store accepts the order', async (t) => {
  const { a, call, provider } = app(t);
  const { token, k, cart } = await paid(call, a);
  assert.equal(provider.captured.size, 0, 'paying only holds the money');
  assert.ok(provider.activated.includes(cart.card_ref), 'the card made before the hold was switched on');

  const auth = await call('POST', '/v1/sandbox/authorize', { token, k, merchant_name: 'SKLZ', amount_cents: 3600 });
  assert.equal(auth.body.approved, true);
  await tick();
  assert.ok(provider.captured.has(cart.payment_ref), 'the store took the order: the hold is captured');
  assert.ok(a.spot.load(token).payment_captured_at);
  assert.ok(a.spot.events(cart).some((e) => e.kind === 'payment_captured'));

  // The store charges less than held: the unused part is refunded (it was captured).
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'capture', amount_cents: 3400 });
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'closed' });
  const back = provider.refunds.filter((r) => r.cart === cart.id);
  assert.equal(back.length, 1);
  assert.equal(back[0].released, undefined, 'after the capture it’s a refund');
  assert.equal(provider.captured.size, 1, 'captured once');
});

test('an order Spot can’t place is released, never charged: the payer is told so', async (t) => {
  const { a, call, provider, emails } = app(t, sandboxProvider(), { env: { SPOT_AGENT: 'off', RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>' } });
  const { token, cart } = await paid(call, a);
  const p = new URL(a.spot.payerPath(cart), 'http://x').searchParams.get('p');
  const r = await call('POST', `/v1/carts/${token}/receipt/cancel`, { p });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cart.status, 'refunded');
  assert.ok(provider.released.includes(cart.payment_ref), 'the hold was released');
  assert.equal(provider.captured.size, 0, 'nothing was ever captured');
  assert.ok(provider.canceled.includes(cart.card_ref), 'Spot’s card is canceled');
  const after = a.spot.load(token);
  assert.equal(after.released, true);
  await tick();
  const mail = emails.find((m) => /Not charged/.test(m.subject || ''));
  assert.ok(mail, `the payer hears they weren’t charged: ${emails.map((m) => m.subject).join(' | ')}`);
  assert.match(mail.text, /never charged/);
});

test('a capture that fails is retried by the sweep, never lost', async (t) => {
  const provider = sandboxProvider();
  let down = true;
  const real = provider.capturePayment.bind(provider);
  provider.capturePayment = async (ref) => {
    if (down) throw new Error('Stripe is down');
    return real(ref);
  };
  const { a, call } = app(t, provider);
  const { token, k, cart } = await paid(call, a);
  await call('POST', '/v1/sandbox/authorize', { token, k, merchant_name: 'SKLZ', amount_cents: 3600 });
  await tick();
  assert.ok(a.spot.load(token).capture_due, 'marked for a retry');
  assert.equal(provider.captured.size, 0);
  down = false;
  await a.spot.sweepMoney(Date.now() + 2 * 60_000);
  assert.ok(provider.captured.has(cart.payment_ref));
  const after = a.spot.load(token);
  assert.ok(after.payment_captured_at);
  assert.equal(after.capture_due, null);
});

test('a store that can price its checkout must, before anything is held', async (t) => {
  const { a, call } = app(t);
  a.spot.quoter = async () => null;
  a.spot.quotable = async () => true;
  const made = (await call('POST', '/v1/carts', body)).body;
  await call('POST', `/v1/carts/${made.cart.token}/manage/prepare`, { k: made.manage_key, shipping: { name: 'Kyle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'k@example.com' } });
  const r = await call('POST', `/v1/carts/${made.cart.token}/pay`, {});
  assert.equal(r.status, 503);
  assert.match(r.body.error, /SKLZ didn’t confirm its shipping and tax just now, so nothing was charged/);
  assert.ok(!a.spot.load(made.cart.token).payment_ref, 'no hold');

  // It answers: the cart is priced at the store’s real total and the hold goes ahead.
  a.spot.quoter = async () => ({ total_cents: 4589, subtotal_cents: 3499, shipping_cents: 750, tax_cents: 340 });
  const ok = await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  assert.equal(ok.body.cart.status, 'card_issued');
  assert.equal(a.spot.load(made.cart.token).quote.total_cents, 4589);

  // A store that can't price its checkout (no UCP) keeps the estimate.
  a.spot.quoter = async () => null;
  a.spot.quotable = async () => false;
  const other = (await call('POST', '/v1/carts', body)).body;
  await call('POST', `/v1/carts/${other.cart.token}/manage/prepare`, { k: other.manage_key, shipping: { name: 'Kyle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'k@example.com' } });
  assert.equal((await call('POST', `/v1/carts/${other.cart.token}/sandbox-pay`, { payer_name: 'Mom' })).body.cart.status, 'card_issued');
});

test('a ready card for a link nobody paid is canceled with the link', async (t) => {
  const { call, provider } = app(t);
  const made = (await call('POST', '/v1/carts', body)).body;
  await call('POST', `/v1/carts/${made.cart.token}/pay`, {});
  await call('POST', `/v1/carts/${made.cart.token}/manage/cancel`, { k: made.manage_key });
  await tick();
  assert.ok(provider.canceled.some((ref) => ref.startsWith('sbx_card_')), 'the switched-off card is canceled too');
});

// The Stripe calls themselves, against a stand-in for the Stripe client.
function fakeStripe(pi) {
  const calls = [];
  const p = stripeProvider({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_ISSUING_CARDHOLDER: 'ich_1', STRIPE_ISSUING_FINANCIAL_ACCOUNT: 'fa_1' });
  p.stripe.paymentIntents = {
    retrieve: async (id) => (calls.push(['retrieve', id]), { id, ...pi }),
    cancel: async (id, params, opts) => (calls.push(['cancel', id, opts?.idempotencyKey]), { id, status: 'canceled' }),
    capture: async (id, params, opts) => (calls.push(['capture', id, params, opts?.idempotencyKey]), { id, status: 'succeeded' }),
    create: async (params) => (calls.push(['create', params]), { id: 'pi_new', status: 'requires_payment_method', client_secret: 's' }),
  };
  p.stripe.refunds = { create: async (params) => (calls.push(['refund', params]), { id: 're_1' }) };
  p.stripe.issuing = { cards: { create: async (params, opts) => (calls.push(['card', params, opts?.idempotencyKey]), { id: 'ic_1', brand: 'Visa', last4: '4242' }), update: async (id, params) => (calls.push(['card_update', id, params]), {}) } };
  p.stripe.rawRequest = async () => ({ balance: { available: { usd: { value: 12345, currency: 'usd' } } } });
  return { p, calls };
}
const cart = { id: 'c1', payment_ref: 'pi_1', total_cents: 4000, requester: { name: 'Kyle' }, merchant: { name: 'SKLZ' }, cart_cents: 3499 };

test('Stripe: a held payment is released, part of one captures only the rest, a captured one is refunded', async () => {
  let { p, calls } = fakeStripe({ status: 'requires_capture', amount_capturable: 4000 });
  assert.equal(await p.refund(cart), 'released');
  assert.deepEqual(calls.at(-1), ['cancel', 'pi_1', 'spot-release-pi_1']);

  ({ p, calls } = fakeStripe({ status: 'requires_capture', amount_capturable: 4000 }));
  assert.equal(await p.refund(cart, 500, 'unused'), 'released');
  assert.deepEqual(calls.at(-1), ['capture', 'pi_1', { amount_to_capture: 3500 }, 'spot-capture-pi_1']);

  ({ p, calls } = fakeStripe({ status: 'succeeded', amount_received: 4000 }));
  assert.equal(await p.refund(cart, 500, 'unused'), 'refunded');
  assert.equal(calls.at(-1)[0], 'refund');
  assert.equal(calls.at(-1)[1].amount, 500);

  ({ p, calls } = fakeStripe({ status: 'canceled' }));
  assert.equal(await p.refund(cart), 'released', 'already released: nothing to do');
  assert.equal(calls.length, 1);
});

test('Stripe: holds are made with manual capture, captured once, and the card is made switched off', async () => {
  let { p, calls } = fakeStripe({ status: 'requires_capture', amount_capturable: 4000 });
  await p.createPayment({ ...cart, payment_ref: null });
  assert.equal(calls.find((c) => c[0] === 'create')[1].capture_method, 'manual');
  assert.equal(await p.capturePayment('pi_1#0'), 'captured');
  assert.deepEqual(calls.at(-1), ['capture', 'pi_1', {}, 'spot-capture-pi_1']);
  ({ p, calls } = fakeStripe({ status: 'succeeded' }));
  assert.equal(await p.capturePayment('pi_1'), 'already');
  assert.equal(calls.length, 1);

  await p.issueCard(cart, { ready: true });
  const made = calls.find((c) => c[0] === 'card');
  assert.equal(made[1].status, 'inactive');
  assert.equal(made[2], 'spot-card-c1-ready-fa_1');
  await p.activateCard('ic_1', 4000);
  assert.equal(calls.at(-1)[2].status, 'active');
  assert.equal(calls.at(-1)[2].spending_controls.spending_limits[0].amount, 4000);
  assert.equal(await p.issuingAvailableCents(), 12345);
});

test('a held payment moves the cart on from the webhook, or from the pay page if the webhook is slow', async (t) => {
  const sbx = sandboxProvider();
  const provider = {
    ...sbx,
    name: 'stripe',
    createPayment: async (c) => ({ ref: `pi_${c.token}`, client: { mode: 'stripe' } }),
    retrievePayment: async (ref) => ({ id: ref, status: 'requires_capture', amount_capturable: held, metadata: { spot_cart_id: 'x' } }),
    verifyWebhook: (raw) => JSON.parse(raw.toString()),
    payerFor: async () => ({ name: 'Mom' }),
  };
  let held = 0;
  const { a, call } = app(t, provider, { env: { SPOT_AGENT: 'on' }, fulfill: { client: {} } });
  const one = (await call('POST', '/v1/carts', body)).body;
  await call('POST', `/v1/carts/${one.cart.token}/pay`, {});
  held = a.spot.load(one.cart.token).total_cents;
  const r = await call('POST', `/v1/carts/${one.cart.token}/paid`, {});
  assert.equal(r.body.status, 'card_issued', 'the pay page moved it on without the webhook');

  const two = (await call('POST', '/v1/carts', body)).body;
  await call('POST', `/v1/carts/${two.cart.token}/pay`, {});
  const total = a.spot.load(two.cart.token).total_cents;
  const hook = await a.inject({ method: 'POST', url: '/v1/webhooks/stripe', headers: { 'stripe-signature': 'x', 'content-type': 'application/json' }, payload: JSON.stringify({ type: 'payment_intent.amount_capturable_updated', data: { object: { id: `pi_${two.cart.token}`, amount_capturable: total, metadata: { spot_cart_id: 'x' } } } }) });
  assert.equal(hook.statusCode, 200);
  assert.equal(a.spot.load(two.cart.token).status, 'card_issued');
});
