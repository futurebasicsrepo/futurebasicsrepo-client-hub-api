import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const cartBody = (patch = {}) => ({
  requester: { name: 'Kyle', email: 'kyle@example.com', venmo: 'kyle-b' },
  merchant: { name: 'Aritzia', url: 'https://www.aritzia.com' },
  items: [{ title: 'Super Puff Shorty', variant: 'Black / M', quantity: 1, price_cents: 25000, image_url: 'https://cdn.example.com/p.jpg' }],
  extras_cents: 2100,
  note: 'birthday <3',
  ...patch,
});

function setup(provider = sandboxProvider(), extra = {}) {
  const db = openDb(':memory:');
  const app = buildApp({ db, provider, cfg, logger: false, ...extra });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { app, db, call };
}

test('card flow: create → pay → Spot’s card issued → merchant-locked single use', async (t) => {
  const { app, call } = setup();
  t.after(() => app.close());

  const created = await call('POST', '/v1/carts', cartBody());
  assert.equal(created.status, 201);
  const { cart, manage_key: k } = created.body;
  assert.equal(cart.cushion_cents, 1355, 'room for tax and price changes, 5% up to $15');
  assert.equal(cart.total_cents, 27100 + 1355 + 1084);
  assert.equal(cart.status, 'open');
  assert.match(created.body.link, /\/c\/[\w-]{12}$/);
  assert.equal(created.body.cart.requester.email, undefined, 'public view hides email');

  // The shared link renders with a preview card and escapes user text.
  const page = await call('GET', `/c/${cart.token}`);
  assert.equal(page.status, 200);
  const all = `\\$${(cart.total_cents / 100).toFixed(2)}`;
  assert.match(page.body, new RegExp(`<meta property="og:title" content="psst… can you spot Kyle ${all}\\?">`), 'the preview says who and how much');
  assert.match(page.body, new RegExp(`og:description" content="Super Puff Shorty from Aritzia · ${all} all in · one tap with Apple Pay"`));
  assert.match(page.body, /class="act stick"/, 'the pay button stays on screen');
  assert.match(page.body, new RegExp(`og:image" content="http://localhost(:80)?/c/${cart.token}/card.png"`));
  assert.match(page.body, /birthday &lt;3/);
  assert.match(page.body, /Spot Kyle \$295.39/);
  assert.match(page.body, /You're buying this from Spot as a gift for Kyle/);
  assert.match(page.body, /unused comes back/);

  // The preview image is a real PNG, drawn for this cart.
  const img = await app.inject({ method: 'GET', url: `/c/${cart.token}/card.png` });
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.deepEqual([...img.rawPayload.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(img.rawPayload.readUInt32BE(16), 1200);
  assert.equal(img.rawPayload.readUInt32BE(20), 630);
  assert.equal((await app.inject({ method: 'GET', url: '/c/nope/card.png' })).statusCode, 404);

  // Owner endpoints need the manage key.
  assert.equal((await call('GET', `/v1/carts/${cart.token}/manage?k=wrong`)).status, 404);
  // Spot's card is never shown to anyone: there is no reveal route.
  assert.equal((await call('POST', `/v1/carts/${cart.token}/manage/reveal`, { k })).status, 404);

  const paid = await call('POST', `/v1/carts/${cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.cart.status, 'card_issued');
  assert.equal(paid.body.cart.payer_name, 'Mom');

  // Paying twice is refused.
  assert.equal((await call('POST', `/v1/carts/${cart.token}/sandbox-pay`, {})).status, 409);

  const mine = await call('GET', `/v1/carts/${cart.token}/manage?k=${k}`);
  assert.equal(mine.body.cart.card_ready, true);
  assert.equal(mine.body.cart.card, undefined, 'no card details, not even the last 4');
  assert.doesNotMatch(JSON.stringify(mine.body), /sandbox_secret|"number"|cvc/);
  assert.deepEqual(mine.body.events.map((e) => e.kind), ['created', 'card_ready', 'pay', 'approval_signed', 'issue'], 'Spot’s card is made before the payer’s card is touched');

  // Wrong store, then over the limit: declined, card still live.
  const auth = (merchant_name, amount_cents) => call('POST', '/v1/sandbox/authorize', { token: cart.token, k, merchant_name, amount_cents });
  assert.equal((await auth('CASH APP*FRIEND', 27100)).body.reason, 'wrong_merchant');
  assert.equal((await auth('ARITZIA LP VANCOUVER', 99999)).body.reason, 'over_limit');

  // Right store, price drifted up a bit with tax: approved, cart completes.
  assert.equal((await auth('ARITZIA LP VANCOUVER', 27100 + 1356)).body.reason, 'over_limit', 'never more than the payer paid for the goods');
  const ok = await auth('ARITZIA LP VANCOUVER', 27480);
  assert.equal(ok.body.approved, true);
  assert.equal(ok.body.cart.status, 'completed');
  assert.equal(ok.body.cart.spent_cents, 27480);

  // Single use.
  assert.equal((await auth('ARITZIA LP VANCOUVER', 100)).body.reason, 'card_not_active');
  const after = await call('GET', `/c/${cart.token}`);
  assert.match(after.body, /Mom already spotted Kyle/);
  assert.match(after.body, /og:title" content="Mom spotted Kyle! 🎉"/);
});

test('handoff flow: venmo/cash app links, no fee, requester marks received', async (t) => {
  const { app, call } = setup();
  t.after(() => app.close());
  const { body } = await call('POST', '/v1/carts', cartBody({ settle: 'handoff', requester: { name: 'Kyle', cashtag: '$kyleb' } }));
  assert.equal(body.cart.fee_cents, 0);
  const pub = await call('GET', `/v1/carts/${body.cart.token}`);
  assert.deepEqual(pub.body.handoff.map((l) => l.kind), ['cashapp']);
  assert.equal(pub.body.handoff[0].url, 'https://cash.app/$kyleb/271.00');
  assert.equal((await call('POST', `/v1/carts/${body.cart.token}/sandbox-pay`, {})).status, 409, 'cannot pay a handoff cart through Spot');
  const done = await call('POST', `/v1/carts/${body.cart.token}/manage/received`, { k: body.manage_key });
  assert.equal(done.body.cart.status, 'completed');
});

test('expired and canceled links cannot be paid', async (t) => {
  const { app, db, call } = setup();
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  db.raw.prepare('UPDATE carts SET expires_at = 1 WHERE token = ?').run(a.cart.token);
  const r = await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, {});
  assert.equal(r.status, 409);
  assert.match(r.body.error, /expired/);

  const b = (await call('POST', '/v1/carts', cartBody())).body;
  assert.equal((await call('POST', `/v1/carts/${b.cart.token}/manage/cancel`, { k: b.manage_key })).body.cart.status, 'canceled');
  assert.equal((await call('POST', `/v1/carts/${b.cart.token}/sandbox-pay`, {})).status, 409);
});

test('refund cancels an issued card', async (t) => {
  const refunded = [];
  const provider = { ...sandboxProvider(), refund: async (c) => { refunded.push(c.id); } };
  const { app, call } = setup(provider);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, {});
  const r = await call('POST', `/v1/carts/${a.cart.token}/manage/refund`, { k: a.manage_key });
  assert.equal(r.body.cart.status, 'refunded');
  assert.equal(refunded.length, 1);
  assert.equal((await call('POST', '/v1/sandbox/authorize', { token: a.cart.token, k: a.manage_key, merchant_name: 'ARITZIA', amount_cents: 100 })).body.reason, 'card_not_active');
});

test('a card Stripe won’t make stops the payment before anything is held', async (t) => {
  const sbx = sandboxProvider();
  sbx.cardFails = 'Permission denied: financial_account_read';
  const { app, call } = setup(sbx);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  const r = await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  assert.equal(r.status, 503);
  assert.match(r.body.error, /nothing was charged/);
  const m = (await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`)).body;
  assert.equal(m.cart.status, 'open', 'no payment was started');
  assert.ok(m.events.some((e) => e.kind === 'card_not_ready'));
  assert.ok(!app.spot.load(a.cart.token).payment_ref, 'no hold was ever created');

  // Spot's Issuing balance can't cover the card: same, before the hold.
  sbx.cardFails = null;
  sbx.issuingCents = 1000;
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/pay`, {})).status, 503);
  sbx.issuingCents = 100_000;
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, { payer_name: 'Mom' })).body.cart.status, 'card_issued');
});

test('a card that won’t switch on after the hold leaves the cart paid and is retried', async (t) => {
  let fail = true;
  const sbx = sandboxProvider();
  const provider = { ...sbx, activateCard: async (ref, cents) => { if (fail) throw new Error('issuer down'); return sbx.activateCard(ref, cents); } };
  const { app, call } = setup(provider);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, {})).body.cart.status, 'paid');
  const view = () => call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  // The page checks every few seconds; the issuer is only retried once a minute.
  for (let i = 0; i < 3; i++) await view();
  let m = await view();
  assert.equal(m.body.cart.status, 'paid');
  assert.equal(m.body.events.filter((e) => e.kind === 'issue_failed').length, 1, 'not retried on every view');
  fail = false;
  assert.equal((await view()).body.cart.status, 'paid', 'still waiting out the minute');
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 61_000);
  m = await view();
  assert.equal(m.body.cart.status, 'card_issued');
  assert.equal(m.body.events.filter((e) => e.kind === 'issue_failed').length, 1);
});

// A Stripe-shaped provider around the sandbox, recording what would move.
function stripeLike(log = []) {
  const sbx = sandboxProvider();
  return {
    ...sbx,
    name: 'stripe',
    log,
    createPayment: async (c) => ({ ref: `pi_${c.token}`, client: { mode: 'stripe', client_secret: `pi_${c.token}_secret` } }),
    issueCard: async (c) => ({ ...(await sbx.issueCard(c)), ref: `ic_${c.token}` }),
    cancelCard: async (c) => { log.push(['cancel', c.card_ref]); },
    refund: async (c, amount, key) => { log.push(['refund', c.payment_ref, amount ?? 'all', key ?? null]); },
    verifyWebhook: (raw, sig) => {
      if (sig !== 'good') throw new Error('bad sig');
      return JSON.parse(raw.toString());
    },
    answerAuthorization: async (id, approved) => log.push(['answer', id, approved]),
    payerFor: async (pi) => (pi.latest_charge === 'ch_1' ? { name: 'Mom', email: 'mom@example.com', fingerprint: 'fp_mom' } : {}),
  };
}
// Stripe mode with the checkout agent on (a stand-in client), so card
// payments are accepted for any store.
const stripeSetup = (provider) => setup(provider, { env: { SPOT_AGENT: 'on' }, fulfill: { client: {} } });
const hookFor = (app) => (event, sig = 'good') => app.inject({ method: 'POST', url: '/v1/webhooks/stripe', headers: { 'stripe-signature': sig, 'content-type': 'application/json' }, payload: JSON.stringify(event) });
async function paidStripeCart(app, call, hook, body = cartBody()) {
  const a = (await call('POST', '/v1/carts', body)).body;
  await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  await hook({ type: 'payment_intent.succeeded', data: { object: { id: `pi_${a.cart.token}`, amount_received: a.cart.total_cents, latest_charge: 'ch_1', metadata: { spot_cart_id: 'x' } } } });
  return a;
}

test('stripe webhooks: payment issues Spot’s card at once (no billing step); authorizations are answered', async (t) => {
  const provider = stripeLike();
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  assert.equal(a.cart.status, 'open');
  const pay = await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  assert.equal(pay.body.client_secret, `pi_${a.cart.token}_secret`);
  // Someone is in the middle of paying (the payment can't be canceled): no edits.
  const cancelPayment = provider.cancelPayment;
  provider.cancelPayment = async () => false;
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: a.manage_key, cart: cartBody() })).status, 409, 'no edits once a payer is paying');
  provider.cancelPayment = cancelPayment;

  const hook = hookFor(app);
  assert.equal((await hook({}, 'forged')).statusCode, 400);
  const succeeded = { type: 'payment_intent.succeeded', data: { object: { id: `pi_${a.cart.token}`, amount_received: a.cart.total_cents, latest_charge: 'ch_1', metadata: { spot_cart_id: 'x' } } } };
  assert.equal((await hook(succeeded)).statusCode, 200);
  assert.equal((await hook(succeeded)).statusCode, 200, 'duplicate delivery is harmless');

  const m = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.cart.status, 'card_issued', 'Spot’s company card: nothing to ask the requester');
  assert.equal(m.body.needs_billing, undefined);
  assert.equal(m.body.cart.payer_name, 'Mom', 'payer name comes from the wallet');
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/billing`, { k: a.manage_key, billing: {} })).status, 404, 'no billing step');

  const card = `ic_${a.cart.token}`;
  const authReq = (id, name, amount, mcc) => ({ type: 'issuing_authorization.request', data: { object: { id, card: { id: card }, pending_request: { amount, currency: 'usd' }, merchant_data: { name, category_code: mcc } } } });
  await hook(authReq('iauth_0', 'ARITZIA', 5000, '6540'));
  await hook(authReq('iauth_1', 'STEAM GAMES', 5000));
  await hook(authReq('iauth_2', 'ARITZIA', 27100));
  await hook(authReq('iauth_3', 'ARITZIA', 27100));
  assert.deepEqual(provider.log.filter((x) => x[0] === 'answer'), [['answer', 'iauth_0', false], ['answer', 'iauth_1', false], ['answer', 'iauth_2', true], ['answer', 'iauth_3', false]]);
});

test('refund race: an authorization during a refund is declined, and the card is canceled before money moves', async (t) => {
  const log = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const provider = { ...stripeLike(log), refund: async (c) => { log.push(['refund:start']); await gate; log.push(['refund:done', c.payment_ref]); } };
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const a = await paidStripeCart(app, call, hook);
  const refunding = call('POST', `/v1/carts/${a.cart.token}/manage/refund`, { k: a.manage_key });
  await new Promise((r) => setTimeout(r, 20));
  // Mid-refund: the store tries to charge Spot's card.
  const mid = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(mid.body.cart.status, 'refunding');
  await hook({ type: 'issuing_authorization.request', data: { object: { id: 'iauth_race', card: { id: `ic_${a.cart.token}` }, pending_request: { amount: 27100, currency: 'usd' }, merchant_data: { name: 'ARITZIA' } } } });
  assert.deepEqual(log.find((x) => x[1] === 'iauth_race'), ['answer', 'iauth_race', false]);
  release();
  const done = await refunding;
  assert.equal(done.body.cart.status, 'refunded');
  const order = log.filter((x) => ['cancel', 'refund:start'].includes(x[0])).map((x) => x[0]);
  assert.deepEqual(order, ['cancel', 'refund:start'], 'card canceled first');
});

test('a refund that fails stays `refunding` and is retried by the sweep', async (t) => {
  let fail = true;
  const log = [];
  const provider = { ...stripeLike(log), refund: async (c) => { if (fail) throw new Error('stripe down'); log.push(['refund', c.payment_ref]); } };
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const a = await paidStripeCart(app, call, hook);
  const r = await call('POST', `/v1/carts/${a.cart.token}/manage/refund`, { k: a.manage_key });
  assert.equal(r.status, 502);
  let m = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.cart.status, 'refunding', 'the card stays dead meanwhile');
  fail = false;
  await app.spot.sweepMoney(Date.now() + 10 * 60_000);
  m = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.cart.status, 'refunded');
  assert.equal(log.filter((x) => x[0] === 'refund').length, 1);
});

test('after the store charges: the card is canceled, unused money and returns go back to the payer (once), fee kept', async (t) => {
  const provider = stripeLike();
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const a = await paidStripeCart(app, call, hook);
  const token = a.cart.token;
  const card = `ic_${token}`;
  await hook({ type: 'issuing_authorization.request', data: { object: { id: 'iauth_ok', card: { id: card }, pending_request: { amount: 27800, currency: 'usd' }, merchant_data: { name: 'ARITZIA' } } } });
  const capture = { type: 'issuing_transaction.created', data: { object: { id: 'ipi_cap', card, authorization: 'iauth_ok', type: 'capture', amount: -27600, merchant_data: { name: 'ARITZIA' } } } };
  await hook(capture);
  await hook(capture);
  assert.deepEqual(provider.log.filter((x) => x[0] === 'cancel'), [['cancel', card]], 'canceled once, right after the charge');
  // The authorization closes: $276 charged of $284.55 paid for the goods.
  await hook({ type: 'issuing_authorization.updated', data: { object: { id: 'iauth_ok', card, status: 'closed', approved: true, transactions: [{ id: 'ipi_cap', type: 'capture', amount: -27600 }] } } });
  // A return later.
  const ret = { type: 'issuing_transaction.created', data: { object: { id: 'ipi_ret', card, authorization: 'iauth_ok', type: 'refund', amount: 5000, merchant_data: { name: 'ARITZIA' } } } };
  await hook(ret);
  await hook(ret);
  const refunds = provider.log.filter((x) => x[0] === 'refund');
  assert.deepEqual(refunds, [['refund', `pi_${token}`, 27100 + 1355 - 27600, 'unused_iauth_ok'], ['refund', `pi_${token}`, 5000, 'return_ipi_ret']]);
  const m = await call('GET', `/v1/carts/${token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.cart.status, 'completed');
  assert.equal(m.body.cart.refunded_cents, 855 + 5000);
  assert.deepEqual(m.body.cart.refunds.map((r) => [r.reason, r.state]), [['unused', 'done'], ['store_refund', 'done']]);
  // A full return can't refund the fee through the partial path.
  await hook({ type: 'issuing_transaction.created', data: { object: { id: 'ipi_ret2', card, type: 'refund', amount: 999999 } } });
  const after = await call('GET', `/v1/carts/${token}/manage?k=${a.manage_key}`);
  assert.equal(after.body.cart.refunded_cents, 27100 + 1355, 'capped at what was paid for the goods; the fee stays');
});

test('a reversed authorization refunds the payer in full; an expired one waits 30 days for a late charge', async (t) => {
  const provider = stripeLike();
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const approve = async (a, id) => hook({ type: 'issuing_authorization.request', data: { object: { id, card: { id: `ic_${a.cart.token}` }, pending_request: { amount: 27100, currency: 'usd' }, merchant_data: { name: 'ARITZIA' } } } });
  const a = await paidStripeCart(app, call, hook);
  await approve(a, 'iauth_a');
  await hook({ type: 'issuing_authorization.updated', data: { object: { id: 'iauth_a', card: `ic_${a.cart.token}`, status: 'reversed', approved: true, transactions: [] } } });
  const ma = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(ma.body.cart.status, 'refunded');
  assert.equal(ma.body.cart.refund_reason, 'store_reversed');

  const b = await paidStripeCart(app, call, hook);
  await approve(b, 'iauth_b');
  await hook({ type: 'issuing_authorization.updated', data: { object: { id: 'iauth_b', card: `ic_${b.cart.token}`, status: 'expired', approved: true, transactions: [] } } });
  let mb = await call('GET', `/v1/carts/${b.cart.token}/manage?k=${b.manage_key}`);
  assert.equal(mb.body.cart.status, 'completed', 'not yet: a store can still capture after expiry');
  await app.spot.sweepMoney(Date.now() + 31 * 86400_000);
  mb = await call('GET', `/v1/carts/${b.cart.token}/manage?k=${b.manage_key}`);
  assert.equal(mb.body.cart.status, 'refunded');
  assert.equal(mb.body.cart.refund_reason, 'store_never_charged');

  // Expired, then the store captures late: only the unused part comes back.
  const c = await paidStripeCart(app, call, hook);
  await approve(c, 'iauth_c');
  await hook({ type: 'issuing_authorization.updated', data: { object: { id: 'iauth_c', card: `ic_${c.cart.token}`, status: 'expired', approved: true, transactions: [] } } });
  await hook({ type: 'issuing_transaction.created', data: { object: { id: 'ipi_late', card: `ic_${c.cart.token}`, type: 'capture', amount: -27000 } } });
  await app.spot.sweepMoney(Date.now() + 10 * 60_000);
  const mc = await call('GET', `/v1/carts/${c.cart.token}/manage?k=${c.manage_key}`);
  assert.equal(mc.body.cart.status, 'completed');
  assert.equal(mc.body.cart.refunded_cents, 27100 + 1355 - 27000);
});

test('a dispute stops Spot’s card and blocks the payer’s card from Spot', async (t) => {
  const provider = stripeLike();
  const { app, db, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const a = await paidStripeCart(app, call, hook);
  await hook({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: `pi_${a.cart.token}`, reason: 'fraudulent' } } });
  assert.ok(provider.log.some((x) => x[0] === 'cancel'));
  assert.ok(db.blocks.list().some((b) => b.kind === 'card' && b.value === 'fp_mom'));
  await hook({ type: 'issuing_authorization.request', data: { object: { id: 'iauth_d', card: { id: `ic_${a.cart.token}` }, pending_request: { amount: 100, currency: 'usd' }, merchant_data: { name: 'ARITZIA' } } } });
  assert.deepEqual(provider.log.find((x) => x[1] === 'iauth_d'), ['answer', 'iauth_d', false]);
  const r = await call('POST', `/v1/carts/${a.cart.token}/manage/order`, { k: a.manage_key, shipping: { name: 'Kyle', line1: '1 Main', city: 'Austin', state: 'TX', postal_code: '78701', email: 'k@x.com' } });
  assert.equal(r.status, 409, 'nothing is ordered on a disputed payment');
});

test('the payer gets a Spot receipt and can cancel for a full refund until the order is placed', async (t) => {
  const provider = stripeLike();
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const a = await paidStripeCart(app, call, hook);
  const path = app.spot.payerPath(app.spot.load(a.cart.token));
  const p = new URL(path, 'http://x').searchParams.get('p');
  assert.equal((await call('GET', path)).status, 200);
  assert.equal((await call('GET', `/c/${a.cart.token}/receipt?p=${p.slice(0, -2)}xx`)).status, 404);
  const r = (await call('GET', `/v1/carts/${a.cart.token}/receipt?p=${p}`)).body;
  assert.equal(r.can_cancel, true);
  assert.equal(r.cart.total_cents, a.cart.total_cents);
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/receipt/cancel`, { p: 'nope' })).status, 404);
  const c = await call('POST', `/v1/carts/${a.cart.token}/receipt/cancel`, { p });
  assert.equal(c.body.cart.status, 'refunded');
  assert.ok(provider.log.some((x) => x[0] === 'refund' && x[2] === 'all'));

  // Once Spot is placing the order, nobody can cancel from under it.
  const b = await paidStripeCart(app, call, hook);
  app.spot.patch(app.spot.load(b.cart.token).id, (x) => ({ ...x, fulfillment: { state: 'awaiting_confirm' } }));
  const pb = new URL(app.spot.payerPath(app.spot.load(b.cart.token)), 'http://x').searchParams.get('p');
  assert.equal((await call('POST', `/v1/carts/${b.cart.token}/receipt/cancel`, { p: pb })).status, 409);
  assert.equal((await call('POST', `/v1/carts/${b.cart.token}/manage/refund`, { k: b.manage_key })).status, 409);
});

test('a card cart Spot can’t order within 72 hours is refunded automatically', async (t) => {
  const provider = stripeLike();
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);
  const a = await paidStripeCart(app, call, hook);
  await app.spot.sweepMoney(Date.now() + 71 * 3600_000);
  assert.equal(app.spot.load(a.cart.token).status, 'card_issued');
  await app.spot.sweepMoney(Date.now() + 73 * 3600_000);
  const cart = app.spot.load(a.cart.token);
  assert.equal(cart.status, 'refunded');
  assert.equal(cart.refund_reason, 'not_ordered');
});

test('card payments are only taken for stores Spot can order from', async (t) => {
  const { app, call } = setup(stripeLike(), { env: {}, fulfill: { ucp: { fetchImpl: async () => new Response('nope', { status: 404 }) } } });
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  const r = await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  assert.equal(r.status, 409);
  assert.match(r.body.error, /can't order from Aritzia automatically yet.*Venmo/);
});

test('capture endpoint: url via injected capturer, screenshot needs a key', async (t) => {
  const db = openDb(':memory:');
  const app = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, capture: { fromUrl: async (u) => ({ source: 'url', merchant: { name: 'X', url: u }, items: [] }) } });
  t.after(() => app.close());
  const r = await app.inject({ method: 'POST', url: '/v1/capture', payload: { url: 'https://x.com/p' } });
  assert.equal(r.json().merchant.url, 'https://x.com/p');
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const s = await app.inject({ method: 'POST', url: '/v1/capture', payload: { image: { data: 'aGk=', media_type: 'image/png' } } });
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
  assert.equal(s.statusCode, 422);
});

test('edit a link before anyone pays; the share card redraws', async (t) => {
  const { app, call } = setup();
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  const png1 = (await app.inject({ method: 'GET', url: `/c/${a.cart.token}/card.png` })).rawPayload;
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: 'nope', cart: cartBody() })).status, 404);
  const e = await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, {
    k: a.manage_key,
    cart: cartBody({ items: [{ title: 'Super Puff Long', quantity: 1, price_cents: 32000 }], extras_cents: 0 }),
  });
  assert.equal(e.status, 200);
  assert.equal(e.body.cart.rev, 2);
  assert.equal(e.body.cart.cart_cents, 32000);
  assert.equal(e.body.cart.requester.name, 'Kyle', 'requester is kept');
  const page = await call('GET', `/c/${a.cart.token}`);
  assert.match(page.body, /Super Puff Long/);
  const png2 = (await app.inject({ method: 'GET', url: `/c/${a.cart.token}/card.png` })).rawPayload;
  assert.notDeepEqual(png1, png2);
  await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, {});
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: a.manage_key, cart: cartBody() })).status, 409);
});

test('composer page and its script are served; text capture routes', async (t) => {
  const db = openDb(':memory:');
  const seen = [];
  const app = buildApp({
    db, provider: sandboxProvider(), cfg, logger: false,
    capture: { fromUrl: async (u) => (seen.push(u), { source: 'url', merchant: { name: 'Nike', url: 'https://nike.com' }, items: [] }) },
  });
  t.after(() => app.close());
  const home = await app.inject({ method: 'GET', url: '/new' });
  assert.match(home.body, /id="q"/);
  assert.match(home.body, /<script src="\/client\/home.js" defer><\/script>/);
  const js = await app.inject({ method: 'GET', url: '/client/home.js' });
  assert.equal(js.statusCode, 200);
  assert.match(js.headers['content-type'], /javascript/);
  new Function(js.body); // parses
  // Shared text with a link inside it goes to the link capturer.
  await app.inject({ method: 'POST', url: '/v1/capture', payload: { text: 'check this out on Nike! https://www.nike.com/t/dunk-low.' } });
  assert.deepEqual(seen, ['https://www.nike.com/t/dunk-low']);
  // A plain description without an API key becomes an editable draft.
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const d = await app.inject({ method: 'POST', url: '/v1/capture', payload: { text: 'black salomon xt-6 size 10.5 $200' } });
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
  assert.equal(d.json().items[0].title, 'black salomon xt-6 size 10.5');
  assert.equal(d.json().items[0].price_cents, 20000);
});

test('website: landing page, fonts, demo cards and early-access list', async (t) => {
  const db = openDb(':memory:');
  const app = buildApp({ db, provider: sandboxProvider(), cfg, logger: false });
  t.after(() => app.close());
  const home = await app.inject({ method: 'GET', url: '/' });
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /yes button/);
  for (const id of ['rules', 'stores', 'trust', 'agents', 'faq']) assert.match(home.body, new RegExp(`id="${id}"`));
  assert.match(home.body, /href="\/new"/);
  assert.match(home.body, /og:image" content="http:\/\/localhost(:80)?\/site\/card-open.png"/);
  assert.match(home.body, /id="agentlog"/, 'agent demo');
  assert.match(home.body, /class="story"/, 'scroll story');
  assert.match(home.body, /id="lane2"/);
  assert.match(home.body, /class="cw-wall"/, 'group chat wall');
  assert.match(home.body, /the Spot team 🧡/, 'letter');
  assert.match(home.body, /class="marquee"/, 'examples strip');
  assert.match(home.body, /href="\/integrations"/);
  for (const f of ['bricolage-400.woff2', 'bricolage-800.woff2', 'caveat-700.woff2']) {
    const r = await app.inject({ method: 'GET', url: `/fonts/${f}` });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-type'], 'font/woff2');
  }
  assert.equal((await app.inject({ method: 'GET', url: '/fonts/../../package.json' })).statusCode, 404);
  for (const f of ['card-open.png', 'card-covered.png', 'card-agent.png']) {
    const r = await app.inject({ method: 'GET', url: `/site/${f}` });
    assert.equal(r.statusCode, 200);
    assert.equal(r.rawPayload.readUInt32BE(16), 1200);
  }
  const join = (payload) => app.inject({ method: 'POST', url: '/v1/waitlist', payload });
  assert.equal((await join({ email: 'nope' })).statusCode, 400);
  assert.equal((await join({ email: 'Kyle@Example.com', kind: 'agent' })).statusCode, 200);
  assert.equal((await join({ email: 'kyle@example.com', kind: 'creator' })).statusCode, 200);
  assert.equal((await join({ email: 'bot@example.com', company_fax: 'x' })).statusCode, 200);
  assert.equal((await join({ email: 'kyle@example.com', kind: 'notify:shopify-app' })).statusCode, 200);
  assert.equal((await join({ email: 'kyle@example.com', kind: 'notify:not-a-thing' })).statusCode, 200, 'unknown kinds fall back');
  assert.deepEqual(db.waitlist().map((w) => `${w.email} ${w.kind}`).sort(), ['kyle@example.com agent', 'kyle@example.com asker', 'kyle@example.com creator', 'kyle@example.com notify:shopify-app']);
});

test('integrations page and the downloadable browser extension', async (t) => {
  const { zip, extensionFiles } = await import('../src/extension.js');
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false });
  t.after(() => app.close());
  const page = await app.inject({ method: 'GET', url: '/integrations' });
  assert.equal(page.statusCode, 200);
  for (const id of ['extension', 'mcp', 'api', 'shopify', 'website', 'bookmarklet', 'soon']) assert.match(page.body, new RegExp(`id="${id}"`));
  assert.match(page.body, /url_encode \}\}/, 'shopify liquid snippet present');
  assert.match(page.body, /data-notify="marketplace"/);
  assert.match(page.body, /&quot;url&quot;: &quot;http:\/\/localhost(:80)?\/mcp&quot;/, 'MCP config shows this server');

  const r = await app.inject({ method: 'GET', url: '/downloads/spot-extension.zip' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'application/zip');
  assert.match(r.headers['content-disposition'], /spot-extension-\d+\.\d+\.\d+\.zip/);
  // Read the zip's central directory and check every file is there, intact.
  const buf = r.rawPayload;
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const names = [];
  const { crc32 } = await import('node:zlib');
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 46, p + 46 + n).toString();
    const local = buf.readUInt32LE(p + 42);
    const size = buf.readUInt32LE(p + 20);
    const data = buf.subarray(local + 30 + buf.readUInt16LE(local + 26), local + 30 + buf.readUInt16LE(local + 26) + size);
    assert.equal(crc32(data), buf.readUInt32LE(p + 16), `crc ${name}`);
    names.push(name);
    if (name === 'manifest.json') {
      const m = JSON.parse(data);
      assert.equal(m.manifest_version, 3);
      assert.deepEqual(m.permissions.sort(), ['activeTab', 'contextMenus'], 'no host permissions');
    }
    if (name === 'background.js') assert.match(data.toString(), /const SPOT = "http:\/\/localhost(:80)?";/, 'server address baked in');
    p += 46 + n;
  }
  assert.deepEqual(names.sort(), ['README.txt', 'background.js', 'icons/icon128.png', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'manifest.json']);
  new Function(extensionFiles('https://x.test')['background.js']); // parses
  assert.equal(zip({ 'a.txt': 'hi' }).readUInt32LE(0), 0x04034b50);
});

test('the pay page shows where every dollar goes: items, shipping + tax, room for tax, card processing, Spot fee', async (t) => {
  const { buildApp } = await import('../src/server.js');
  const { openDb } = await import('../src/db.js');
  const { sandboxProvider } = await import('../src/providers.js');
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), logger: false, env: {} });
  t.after(() => a.close());
  const made = (await a.inject({ method: 'POST', url: '/v1/carts', payload: { requester: { name: 'Kyle' }, merchant: { name: 'Yoseka Stationery' }, items: [{ title: 'Uni Jetstream Pen', price_cents: 275 }], extras_cents: 800 } })).json();
  const c = made.cart;
  const page = (await a.inject({ url: `/c/${c.token}` })).body;
  const $ = (n) => `\\$${(n / 100).toFixed(2)}`;
  assert.match(page, new RegExp(`Item</span><b>${$(275)}`));
  assert.match(page, new RegExp(`Shipping \\+ tax<small>[^<]*</small></span><b>${$(800)}`));
  assert.match(page, /Room for price changes/);
  assert.ok(c.fee_keep_cents > 0 && c.fee_keep_cents < c.fee_cents);
  assert.match(page, new RegExp(`Card processing<small>card network, not Spot</small></span><b>${$(c.fee_cents - c.fee_keep_cents)}`));
  assert.match(page, new RegExp(`Spot fee</span><b>${$(c.fee_keep_cents)}`));
  assert.match(page, new RegExp(`Total</span><b>${$(c.total_cents)}`));
});

test('opening the pay page doesn’t lock the link: an edit cancels the unpaid payment and the next visit charges the new total', async (t) => {
  const provider = stripeLike();
  const canceled = [];
  provider.cancelPayment = async (ref) => (canceled.push(ref), true);
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  const body = cartBody();
  body.items[0].price_cents += 100;
  const edited = await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: a.manage_key, cart: body });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.deepEqual(canceled, [`pi_${a.cart.token}`]);
  assert.equal(app.spot.load(a.cart.token).payment_ref, null, 'the next visit starts a payment for the new total');
  assert.ok(edited.body.cart.total_cents > a.cart.total_cents);
});

test('money that lands on a canceled link goes back, and a disputed payment is never refunded twice', async (t) => {
  const log = [];
  const provider = stripeLike(log);
  provider.cancelPayment = async () => true;
  const { app, call } = stripeSetup(provider);
  t.after(() => app.close());
  const hook = hookFor(app);

  // The requester cancels while the payer is in Apple Pay; the money lands anyway.
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/cancel`, { k: a.manage_key })).status, 200);
  const landed = { type: 'payment_intent.succeeded', data: { object: { id: `pi_${a.cart.token}`, amount_received: a.cart.total_cents, latest_charge: 'ch_1', metadata: { spot_cart_id: 'x' } } } };
  assert.equal((await hook(landed)).statusCode, 200);
  assert.deepEqual(log.filter((x) => x[0] === 'refund'), [['refund', `pi_${a.cart.token}`, a.cart.total_cents, 'closed']]);
  await hook(landed); // Stripe retries: the same idempotent refund, never a second payment kept
  assert.equal(app.spot.load(a.cart.token).status, 'canceled');

  // Disputed with the bank: the requester's refund button would pay them twice.
  const b = await paidStripeCart(app, call, hook);
  await hook({ type: 'charge.dispute.created', data: { object: { payment_intent: `pi_${b.cart.token}`, reason: 'fraudulent' } } });
  const r = await call('POST', `/v1/carts/${b.cart.token}/manage/refund`, { k: b.manage_key });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /disputed/);
});

test('an edit can’t switch how a link is paid (that would drop the fee from a Spot-bought cart)', async (t) => {
  const { app, call } = setup(sandboxProvider());
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  const r = await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: a.manage_key, cart: cartBody({ settle: 'handoff' }) });
  assert.equal(r.status, 409);
  const same = await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: a.manage_key, cart: cartBody({ settle: 'card' }) });
  assert.equal(same.status, 200);
  assert.ok(same.body.cart.fee_cents > 0, 'still priced as Spot buys it');
});
