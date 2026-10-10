// Fund your own AI: the account's saved card pays its AI's asks, after a tap
// or (a separate opt-in) on its own inside the rules. Plus the kill switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { normalizeRules } from '../src/rules.js';
import { scriptedModel, startFakeStore } from './fakestore.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const shipping = { name: 'Riley Park', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'riley@example.com', phone: '5125550100' };
const ask = (over = {}) => ({ merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500, url: 'https://www.nike.com/t/dunk' }], ...over });

// The browser checkout can't start here, so an order lands on needs_you right away.
function app(t, { fulfill = { client: {}, launch: async () => { throw new Error('no browser in tests'); } } } = {}) {
  const provider = sandboxProvider();
  const a = buildApp({ db: openDb(':memory:'), provider, cfg, logger: false, env: { SPOT_AGENT: 'on' }, fulfill });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { a, call, provider };
}

async function account(call, email = 'riley@example.com') {
  const start = await call('POST', '/v1/auth/start', { email });
  const cookie = (await call('POST', '/v1/auth/verify', { email, code: start.body.code })).headers['set-cookie'].split(';')[0];
  const as = (method, url, payload) => call(method, url, payload, { cookie });
  await as('POST', '/v1/me', { name: 'Riley Park', shipping });
  const key = (await as('POST', '/v1/me/keys', { agent_name: 'claude' })).body;
  const ai = (method, url, payload) => call(method, url, payload, { authorization: `Bearer ${key.api_key}` });
  return { as, ai, key, cookie };
}

test('rules: pay mode', () => {
  assert.equal(normalizeRules({ pay: 'link' }), null, 'a link is the default, so no rules');
  assert.equal(normalizeRules({ pay: 'tap' }).pay, 'tap');
  assert.throws(() => normalizeRules({ pay: 'auto' }), /max per order/, 'automatic needs a cap');
  assert.equal(normalizeRules({ pay: 'auto', max_order_cents: 20000 }).pay, 'auto');
  assert.throws(() => normalizeRules({ pay: 'card' }), /pay must be/);
});

test('one tap: the AI asks, the person approves, their saved card pays', async (t) => {
  const { a, call, provider } = app(t);
  const { as, ai, key } = await account(call);

  // Tap needs a card first.
  assert.equal((await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'tap' })).status, 409);
  assert.equal((await call('POST', '/v1/me/funding', { test_card: '4242' })).status, 401, 'signed in only');
  const saved = await as('POST', '/v1/me/funding', { test_card: '4242' });
  assert.equal(saved.body.card.label, 'Visa •4242');
  assert.equal(saved.body.auto_ok, false, 'automatic is off until opted in');
  assert.equal((await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'tap', max_order_cents: 20000, stores: ['nike.com'] })).status, 200);

  const r = await ai('POST', '/v1/agent/asks', ask());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'open', 'nothing charged before the tap');
  assert.equal(r.body.for, 'self');
  assert.match(r.body.approve_link, /\/manage\?k=/);
  assert.match(r.body.next_step, /tap Approve.*Visa •4242/);
  assert.equal(provider.charges.length, 0);
  const cart = a.spot.load(r.body.ask_id);
  assert.equal(cart.requester.shipping.line1, '1 Main St', 'ships to the saved address');
  assert.equal(cart.requester.name, 'Riley Park');

  // The manage page offers the saved card to its signed-in owner only.
  const page = (await as('GET', `/v1/carts/${cart.token}/manage`)).body;
  assert.deepEqual(page.saved_card, { label: 'Visa •4242' });
  const other = await account(call, 'someone@example.com');
  assert.equal((await other.as('POST', `/v1/carts/${cart.token}/manage/pay-saved`, {})).status, 404, 'not their cart');

  const paid = await as('POST', `/v1/carts/${cart.token}/manage/pay-saved`, {});
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.cart.status, 'card_issued');
  assert.deepEqual(provider.charges.at(-1), { cart: cart.id, amount_cents: cart.total_cents, present: true });
  const got = (await ai('GET', `/v1/agent/asks/${cart.token}`)).body;
  assert.equal(got.approvals[0].approved_by, 'requester');
  assert.equal(got.approvals[0].how, 'approved_saved_card');
  assert.equal((await as('POST', `/v1/carts/${cart.token}/manage/pay-saved`, {})).status, 409, 'once');

  // A declined card says so, and the ask stays open to pay another way.
  await as('POST', '/v1/me/funding', { test_card: '0002' });
  const r2 = (await ai('POST', '/v1/agent/asks', ask())).body;
  const declined = await as('POST', `/v1/carts/${r2.ask_id}/manage/pay-saved`, {});
  assert.equal(declined.status, 402);
  assert.match(declined.body.error, /declined/);
  assert.equal(a.spot.load(r2.ask_id).status, 'open');

  // Asking for someone else still makes a link to pay.
  const forOther = (await ai('POST', '/v1/agent/asks', ask({ for: 'other', requester: { name: 'Riley' } }))).body;
  assert.equal(forOther.saved_card, undefined);
  assert.equal(forOther.approve_link, undefined);

  // Removing the card puts the key back on links.
  const removed = await as('POST', '/v1/me/funding/remove', {});
  assert.equal(removed.body.card, null);
  assert.equal((await as('GET', '/v1/me')).body.keys[0].rules.pay, 'link');
});

test('automatic: a separate opt-in, inside the rules only, and the kill switch', async (t) => {
  const { a, call, provider } = app(t);
  const { as, ai, key } = await account(call);
  await as('POST', '/v1/me/funding', { test_card: '4242' });

  // Its own opt-in, with an explicit yes.
  assert.equal((await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'auto', max_order_cents: 20000 })).status, 409);
  assert.equal((await as('POST', '/v1/me/funding/auto', { on: true })).status, 400, 'needs agree: true');
  assert.equal((await as('POST', '/v1/me/funding/auto', { on: true, agree: true })).body.auto_ok, true);
  assert.equal((await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'auto', stores: ['nike.com'] })).status, 400, 'needs a cap');
  assert.equal((await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'auto', max_order_cents: 20000, stores: ['nike.com'] })).status, 200);

  const r = await ai('POST', '/v1/agent/asks', ask());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'card_issued', 'paid on its own');
  assert.equal(r.body.paid_from, 'Visa •4242');
  assert.equal(provider.charges.at(-1).present, false);
  assert.equal(r.body.approvals[0].approved_by, 'rules');
  assert.equal(r.body.approvals[0].how, 'paid_by_rules');
  const me = (await as('GET', '/v1/me')).body;
  assert.ok(me.keys[0].activity.some((e) => e.kind === 'paid_from_card'));

  // Outside the rules: refused, never charged.
  const before = provider.charges.length;
  assert.equal((await ai('POST', '/v1/agent/asks', ask({ items: [{ title: 'Jacket', quantity: 1, price_cents: 30000 }] }))).status, 403);
  assert.equal((await ai('POST', '/v1/agent/asks', ask({ merchant: { name: 'REI', url: 'https://www.rei.com' }, items: [{ title: 'Tent', quantity: 1, price_cents: 5000 }] }))).status, 403);
  assert.equal(provider.charges.length, before);

  // A bank that wants to check falls back to asking for the tap.
  await as('POST', '/v1/me/funding', { test_card: '3155' });
  assert.equal((await as('GET', '/v1/me')).body.funding.auto_ok, false, 'a new card needs its own opt-in');
  assert.equal((await as('GET', '/v1/me')).body.keys[0].rules.pay, 'tap');
  await as('POST', '/v1/me/funding/auto', { on: true, agree: true });
  await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'auto', max_order_cents: 20000, stores: ['nike.com'] });
  const checked = (await ai('POST', '/v1/agent/asks', ask())).body;
  assert.equal(checked.status, 'open');
  assert.match(checked.next_step, /tap Approve/);
  assert.ok((await as('GET', '/v1/me')).body.keys[0].activity.some((e) => e.kind === 'autopay_failed'));

  // Turning automatic off moves the key back to a tap.
  await as('POST', '/v1/me/funding/auto', { on: false });
  assert.equal((await as('GET', '/v1/me')).body.keys[0].rules.pay, 'tap');

  // Kill switch: the unused card is refunded and every new ask is refused.
  const firstCart = a.spot.load(r.body.ask_id);
  const stopped = await as('POST', '/v1/me/ai/stop', {});
  assert.equal(stopped.body.ai_stopped, true);
  assert.equal(stopped.body.refunded, 1);
  assert.equal(a.spot.load(firstCart.token).status, 'refunded');
  assert.ok(provider.canceled.includes(firstCart.card_ref), 'its card is canceled');
  const refused = await ai('POST', '/v1/agent/asks', ask());
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /stopped AI spending/);
  assert.equal((await as('POST', `/v1/carts/${checked.ask_id}/manage/pay-saved`, {})).status, 409, 'no tapping through it either');
  assert.equal((await as('POST', '/v1/me/ai/resume', {})).body.ai_stopped, false);
  assert.equal((await ai('POST', '/v1/agent/asks', ask())).status, 201);
});

test('automatic: the order is placed without a tap when the store total is inside the cap', { timeout: 90_000 }, async (t) => {
  const store = await startFakeStore();
  t.after(() => store.close());
  const m = scriptedModel({ misbehave: false });
  const { a, call } = app(t, { fulfill: { client: m.client, shopify: { allowPrivate: true } } });
  const { as, ai, key } = await account(call);
  await as('POST', '/v1/me/funding', { test_card: '4242' });
  await as('POST', '/v1/me/funding/auto', { on: true, agree: true });
  await as('POST', `/v1/me/keys/${key.name}/rules`, { pay: 'auto', max_order_cents: 30000 });
  const r = await ai('POST', '/v1/agent/asks', {
    merchant: { name: 'Aritzia', url: store.origin },
    items: [{ title: 'Super Puff Shorty', variant: 'Black / M', quantity: 1, price_cents: 25000, url: `${store.origin}/products/super-puff` }],
    extras_cents: 1250,
  });
  assert.equal(r.body.status, 'card_issued', JSON.stringify(r.body));
  const end = Date.now() + 60_000;
  let f;
  for (;;) {
    f = a.spot.load(r.body.ask_id).fulfillment;
    if (['placed', 'needs_you', 'awaiting_confirm'].includes(f?.state) || Date.now() > end) break;
    await new Promise((z) => setTimeout(z, 250));
  }
  assert.equal(f.state, 'placed', f?.reason);
  assert.equal(store.orders.length, 1);
  const got = (await ai('GET', `/v1/agent/asks/${r.body.ask_id}`)).body;
  assert.deepEqual(got.approvals.map((x) => [x.approved_by, x.how]), [['rules', 'paid_by_rules'], ['rules', 'placed_order']]);
});

test('a saved Stripe customer from other keys (test mode) is replaced, not a dead end', async () => {
  const { stripeProvider } = await import('../src/providers.js');
  const p = stripeProvider({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
  const made = [];
  p.stripe.customers.create = async () => (made.push(1), { id: `cus_new${made.length}` });
  p.stripe.setupIntents.create = async ({ customer }) => {
    if (customer === 'cus_testmode') throw Object.assign(new Error("No such customer: 'cus_testmode'"), { type: 'StripeInvalidRequestError', code: 'resource_missing' });
    return { client_secret: `seti_${customer}_secret` };
  };
  const out = await p.setupFunding({ id: 'u1', email: 'k@x.co' }, { customer: 'cus_testmode' });
  assert.equal(out.customer, 'cus_new1');
  assert.equal(out.client_secret, 'seti_cus_new1_secret');
});

test('Stripe Issuing on newer financial accounts: Spot finds the open account and retries', async () => {
  const { stripeProvider } = await import('../src/providers.js');
  const p = stripeProvider({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_ISSUING_CARDHOLDER: 'ich_1' });
  const calls = [];
  p.stripe.issuing.cards.create = async (body, opts) => {
    calls.push({ body, opts });
    if (!body.financial_account_v2) throw Object.assign(new Error('The v2 financial account id must be specified.'), { type: 'StripeInvalidRequestError', code: 'parameter_missing', param: 'financial_account_v2' });
    return { id: 'ic_1', brand: 'Visa', last4: '4242', exp_month: 1, exp_year: 2030 };
  };
  let listed = 0;
  p.stripe.rawRequest = async (method, path, params, opts) => (listed++, assert.equal(path, '/v2/money_management/financial_accounts'), assert.match(opts.apiVersion, /^\d{4}-\d\d-\d\d\.preview$/, 'the list is a preview API'), { data: [{ id: 'fa_closed', status: 'closed' }, { id: 'fa_live', status: 'open' }] });
  const card = await p.issueCard({ id: 'cart1', cart_cents: 3499 });
  assert.equal(card.ref, 'ic_1');
  assert.equal(calls[1].body.financial_account_v2, 'fa_live');
  assert.equal(calls[1].opts.idempotencyKey, 'spot-card-cart1-fa_live', 'a new body gets a new idempotency key');
  await p.issueCard({ id: 'cart2', cart_cents: 1000 });
  assert.equal(listed, 1, 'found once, then remembered');
  assert.equal(calls.at(-1).body.financial_account_v2, 'fa_live');

  const q = stripeProvider({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_ISSUING_CARDHOLDER: 'ich_1', STRIPE_ISSUING_FINANCIAL_ACCOUNT: 'fa_set' });
  q.stripe.issuing.cards.create = async (body) => (assert.equal(body.financial_account_v2, 'fa_set'), { id: 'ic_2' });
  await q.issueCard({ id: 'cart3', cart_cents: 1000 });

  const r = stripeProvider({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_ISSUING_CARDHOLDER: 'ich_1' });
  r.stripe.issuing.cards.create = p.stripe.issuing.cards.create;
  r.stripe.rawRequest = async () => ({ data: [{ id: 'fa_a', status: 'open' }, { id: 'fa_b', status: 'open' }] });
  await assert.rejects(r.issueCard({ id: 'cart4', cart_cents: 1000 }), /2 are open: set STRIPE_ISSUING_FINANCIAL_ACCOUNT/);
});
