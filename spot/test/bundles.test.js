// Multi-store asks: one link and one payment, a cart (and card) per store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const shipping = { name: 'Riley Park', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'riley@example.com' };
const stores = [
  { merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }] },
  { merchant: { name: 'REI', url: 'https://www.rei.com' }, items: [{ title: 'Rain shell', quantity: 1, price_cents: 9900 }, { title: 'Socks', quantity: 2, price_cents: 1200 }], extras_cents: 800 },
];

function app(t) {
  const provider = sandboxProvider();
  const a = buildApp({ db: openDb(':memory:'), provider, cfg, logger: false, env: {} });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { a, call, provider };
}

test('bundle: one link, one payment, a card per store', async (t) => {
  const { a, call, provider } = app(t);
  const r = await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, note: 'birthday!', stores });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const { bundle, link, manage_key: k } = r.body;
  assert.match(link, /\/b\/[\w-]{12}$/);
  assert.equal(bundle.stores.length, 2);
  assert.equal(bundle.total_cents, bundle.stores[0].total_cents + bundle.stores[1].total_cents);
  assert.equal(bundle.status, 'open');

  // A store's own link sends the payer to the whole bundle.
  const child = await call('GET', `/c/${bundle.stores[1].token}`);
  assert.equal(child.status, 302);
  assert.equal(child.headers.location, `/b/${bundle.token}`);
  assert.equal((await call('POST', `/v1/carts/${bundle.stores[0].token}/pay`, {})).status, 409, 'pay for the whole bundle, not one store');
  const page = await call('GET', `/b/${bundle.token}`);
  assert.match(page.body, /from <b>2 stores<\/b>/);
  assert.match(page.body, /Nike/);
  assert.match(page.body, /REI/);

  // Shipping once for every store.
  assert.equal((await call('POST', `/v1/bundles/${bundle.token}/manage/prepare`, { k: 'wrong', shipping })).status, 404);
  const prep = await call('POST', `/v1/bundles/${bundle.token}/manage/prepare`, { k, shipping });
  assert.ok(prep.body.stores.every((c) => c.requester.shipping.line1 === '1 Main St'));

  const paid = await call('POST', `/v1/bundles/${bundle.token}/sandbox-pay`, { payer_name: 'Mom', payer_email: 'mom@example.com' });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.bundle.status, 'paid');
  assert.equal(paid.body.bundle.payer_name, 'Mom');
  const carts = paid.body.bundle.stores.map((s) => a.spot.load(s.token));
  assert.ok(carts.every((c) => c.status === 'card_issued'));
  assert.notEqual(carts[0].card_ref, carts[1].card_ref, 'a card per store');
  const pi = a.spot.loadBundle(bundle.token).payment_ref;
  assert.deepEqual(carts.map((c) => c.payment_ref), [`${pi}#0`, `${pi}#1`]);

  // Each card is locked to its own store and its own amount.
  const auth = (token, merchant_name, amount_cents) => call('POST', '/v1/sandbox/authorize', { token, k, merchant_name, amount_cents });
  assert.equal((await auth(carts[0].token, 'REI', 5000)).body.approved, false, "Nike's card doesn't work at REI");

  // A second delivery of the same payment changes nothing.
  await a.spot.paymentSucceeded({ paymentRef: pi, amountCents: paid.body.bundle.total_cents, payer: { name: 'Mom' } });
  assert.equal(a.spot.load(carts[0].token).status, 'card_issued');

  // REI can't be ordered: only REI's share goes back.
  const before = provider.refunds.length;
  await a.spot.refundCart(a.spot.load(carts[1].token), { reason: 'not_ordered' });
  const refunds = provider.refunds.slice(before);
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amount_cents, carts[1].total_cents, 'always an explicit amount: never the whole payment');
  const after = (await call('GET', `/v1/bundles/${bundle.token}`)).body.bundle;
  assert.deepEqual(after.stores.map((s) => s.status), ['card_issued', 'refunded']);
  assert.equal(after.status, 'paid');

  // The payer's receipt: per store, and cancel what's left.
  const rpath = a.spot.bundlePayerPath(a.spot.loadBundle(bundle.token));
  const p = new URL(rpath, 'http://x').searchParams.get('p');
  assert.equal((await call('GET', `/v1/bundles/${bundle.token}/receipt?p=nope`)).status, 404);
  const rec = (await call('GET', `/v1/bundles/${bundle.token}/receipt?p=${encodeURIComponent(p)}`)).body;
  assert.deepEqual(rec.stores.map((s) => s.can_cancel), [true, false]);
  assert.equal(rec.stores[0].approvals.length, 1, 'a signed approval per store');
  const canceled = await call('POST', `/v1/bundles/${bundle.token}/receipt/cancel`, { p });
  assert.equal(canceled.body.bundle.status, 'refunded');
  assert.equal(provider.refunds.at(-1).amount_cents, carts[0].total_cents);
  assert.equal((await call('POST', `/v1/bundles/${bundle.token}/receipt/cancel`, { p })).status, 409);
});

test('bundle: limits, a wrong amount, disputes and canceling before payment', async (t) => {
  const { a, call } = app(t);
  assert.equal((await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores: stores.slice(0, 1) })).status, 400, 'two stores at least');
  const big = [stores[0], { merchant: { name: 'REI' }, items: [{ title: 'Tent', quantity: 1, price_cents: 45000 }] }];
  const over = await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores: big });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /across all its stores/);
  assert.equal((await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores, settle: 'handoff' })).status, 400);

  const { bundle, manage_key: k } = (await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores })).body;
  await call('POST', `/v1/bundles/${bundle.token}/pay`, {});
  const pi = a.spot.loadBundle(bundle.token).payment_ref;
  await assert.rejects(a.spot.paymentSucceeded({ paymentRef: pi, amountCents: 100, payer: {} }), /does not match/);

  const other = (await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores })).body;
  const c = await call('POST', `/v1/bundles/${other.bundle.token}/manage/cancel`, { k: other.manage_key });
  assert.equal(c.body.bundle.status, 'canceled');
  assert.equal((await call('POST', `/v1/bundles/${other.bundle.token}/pay`, {})).status, 409);

  // A dispute stops every store's card.
  await call('POST', `/v1/bundles/${bundle.token}/sandbox-pay`, { test_card: 'card_x' });
  await a.spot.dispute(pi, 'fraudulent');
  const carts = a.spot.loadBundle(bundle.token).carts;
  assert.ok(carts.every((x) => x.dispute && x.card_canceled));
  assert.ok(k);
});

test('bundle from an AI: rules cover every store, get and order', async (t) => {
  const { a, call } = app(t);
  const start = await call('POST', '/v1/auth/start', { email: 'riley@example.com' });
  const cookie = (await call('POST', '/v1/auth/verify', { email: 'riley@example.com', code: start.body.code })).headers['set-cookie'].split(';')[0];
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'claude' }, { cookie })).body;
  const bearer = { authorization: `Bearer ${key.api_key}` };
  await call('POST', `/v1/me/keys/${key.name}/rules`, { stores: ['nike.com'] }, { cookie });
  const blocked = await call('POST', '/v1/agent/asks', { requester: { name: 'Riley' }, stores }, bearer);
  assert.equal(blocked.status, 403, 'REI is not on the list');
  assert.match(blocked.body.error, /only shop at nike\.com/);
  await call('POST', `/v1/me/keys/${key.name}/rules`, { stores: ['nike.com', 'rei.com'], max_order_cents: 40000 }, { cookie });

  const r = await call('POST', '/v1/agent/asks', { requester: { name: 'Riley' }, stores }, bearer);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'multi_store');
  assert.equal(r.body.stores.length, 2);
  assert.match(r.body.link, /\/b\//);
  assert.match(r.body.requester_page, /\/b\/.+\/manage\?k=/);
  assert.match(r.body.next_step, /One payment covers all 2 stores/);

  const got = await call('GET', `/v1/agent/asks/${r.body.ask_id}`, undefined, bearer);
  assert.equal(got.body.status, 'open');
  assert.equal((await call('POST', `/v1/agent/asks/${r.body.ask_id}/order`, { shipping }, bearer)).status, 409, 'nobody paid yet');
  await call('POST', `/v1/bundles/${r.body.ask_id}/sandbox-pay`, { payer_name: 'Mom' });
  const paid = (await call('GET', `/v1/agent/asks/${r.body.ask_id}`, undefined, bearer)).body;
  assert.equal(paid.status, 'paid');
  assert.equal(paid.approvals.length, 2, 'a signed approval per store');
  const ordered = await call('POST', `/v1/agent/asks/${r.body.ask_id}/order`, { shipping }, bearer);
  assert.equal(ordered.status, 200, JSON.stringify(ordered.body));
  assert.ok(ordered.body.stores.every((s) => s.order), 'each store has its own order state');

  // Another agent can't see it.
  const other = (await call('POST', '/v1/agent/keys', { email: 'x@example.com' })).body.api_key;
  assert.equal((await call('GET', `/v1/agent/asks/${r.body.ask_id}`, undefined, { authorization: `Bearer ${other}` })).status, 404);
  const me = (await call('GET', '/v1/me', undefined, { cookie })).body;
  assert.equal(me.keys[0].activity.find((e) => e.kind === 'ask_created').detail.stores, 2);
  assert.ok(a);
});

test('bundle for yourself: ship first, then pay once', async (t) => {
  const { call } = app(t);
  const { bundle, manage_key: k } = (await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores, for: 'self' })).body;
  assert.equal((await call('POST', `/v1/bundles/${bundle.token}/pay`, {})).status, 409);
  await call('POST', `/v1/bundles/${bundle.token}/manage/prepare`, { k, shipping });
  const page = await call('GET', `/b/${bundle.token}/manage?k=${k}`);
  assert.equal(page.status, 200);
  const paid = await call('POST', `/v1/bundles/${bundle.token}/sandbox-pay`, {});
  assert.equal(paid.body.bundle.status, 'paid');
});
