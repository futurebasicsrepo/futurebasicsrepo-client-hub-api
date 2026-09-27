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

function setup(provider = sandboxProvider()) {
  const db = openDb(':memory:');
  const app = buildApp({ db, provider, cfg, logger: false });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { app, db, call };
}

test('card flow: create → pay → card issued → merchant-locked single use', async (t) => {
  const { app, call } = setup();
  t.after(() => app.close());

  const created = await call('POST', '/v1/carts', cartBody());
  assert.equal(created.status, 201);
  const { cart, manage_key: k } = created.body;
  assert.equal(cart.total_cents, 27100 + 1084);
  assert.equal(cart.status, 'open');
  assert.match(created.body.link, /\/c\/[\w-]{12}$/);
  assert.equal(created.body.cart.requester.email, undefined, 'public view hides email');

  // The shared link renders with a preview card and escapes user text.
  const page = await call('GET', `/c/${cart.token}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /<meta property="og:title" content="psst… can you spot Kyle\?">/);
  assert.match(page.body, /og:description" content="Super Puff Shorty from Aritzia · \$271.00 · tap to cover it"/);
  assert.match(page.body, new RegExp(`og:image" content="http://localhost(:80)?/c/${cart.token}/card.png"`));
  assert.match(page.body, /birthday &lt;3/);
  assert.match(page.body, /Spot Kyle \$281.84/);

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
  assert.equal((await call('POST', `/v1/carts/${cart.token}/manage/reveal`, { k })).status, 409, 'no card before payment');

  const paid = await call('POST', `/v1/carts/${cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.cart.status, 'card_issued');
  assert.equal(paid.body.cart.payer_name, 'Mom');

  // Paying twice is refused.
  assert.equal((await call('POST', `/v1/carts/${cart.token}/sandbox-pay`, {})).status, 409);

  const mine = await call('GET', `/v1/carts/${cart.token}/manage?k=${k}`);
  assert.equal(mine.body.cart.card.brand, 'Visa');
  assert.deepEqual(mine.body.events.map((e) => e.kind), ['created', 'pay', 'issue']);

  const card = await call('POST', `/v1/carts/${cart.token}/manage/reveal`, { k });
  assert.match(card.body.number, /^\d{16}$/);
  assert.equal(card.body.number.slice(-4), mine.body.cart.card.last4);

  // Wrong store, then over the limit: declined, card still live.
  const auth = (merchant_name, amount_cents) => call('POST', '/v1/sandbox/authorize', { token: cart.token, k, merchant_name, amount_cents });
  assert.equal((await auth('CASH APP*FRIEND', 27100)).body.reason, 'wrong_merchant');
  assert.equal((await auth('ARITZIA LP VANCOUVER', 99999)).body.reason, 'over_limit');

  // Right store, price drifted up a bit with tax: approved, cart completes.
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
  const provider = { ...sandboxProvider(), refund: async (c) => refunded.push(c.id) };
  const { app, call } = setup(provider);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, {});
  const r = await call('POST', `/v1/carts/${a.cart.token}/manage/refund`, { k: a.manage_key });
  assert.equal(r.body.cart.status, 'refunded');
  assert.equal(refunded.length, 1);
  assert.equal((await call('POST', '/v1/sandbox/authorize', { token: a.cart.token, k: a.manage_key, merchant_name: 'ARITZIA', amount_cents: 100 })).body.reason, 'card_not_active');
});

test('a failed card issue leaves the cart paid and is retried', async (t) => {
  let fail = true;
  const sbx = sandboxProvider();
  const provider = { ...sbx, issueCard: async (c) => { if (fail) throw new Error('issuer down'); return sbx.issueCard(c); } };
  const { app, call } = setup(provider);
  t.after(() => app.close());
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/sandbox-pay`, {})).body.cart.status, 'paid');
  fail = false;
  const m = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.cart.status, 'card_issued');
  assert.ok(m.body.events.some((e) => e.kind === 'issue_failed'));
});

test('stripe webhooks: payment succeeded issues card; authorization request is answered', async (t) => {
  const sbx = sandboxProvider();
  const answers = [];
  const provider = {
    ...sbx,
    name: 'stripe',
    createPayment: async (c) => ({ ref: 'pi_123', client: { mode: 'stripe', client_secret: 'pi_123_secret' } }),
    issueCard: async (c) => ({ ...(await sbx.issueCard(c)), ref: 'ic_abc' }),
    verifyWebhook: (raw, sig) => {
      if (sig !== 'good') throw new Error('bad sig');
      return JSON.parse(raw.toString());
    },
    answerAuthorization: async (id, approved) => answers.push([id, approved]),
    needsBilling: true,
    payerNameFor: async (pi) => (pi.latest_charge === 'ch_1' ? 'Mom' : null),
  };
  const { app, call } = setup(provider);
  t.after(() => app.close());
  // Links need no billing address up front…
  const a = (await call('POST', '/v1/carts', cartBody())).body;
  assert.equal(a.cart.status, 'open');
  const pay = await call('POST', `/v1/carts/${a.cart.token}/pay`, {});
  assert.equal(pay.body.client_secret, 'pi_123_secret');
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/edit`, { k: a.manage_key, cart: cartBody() })).status, 409, 'no edits once a payer has started');

  const hook = (event, sig = 'good') => app.inject({ method: 'POST', url: '/v1/webhooks/stripe', headers: { 'stripe-signature': sig, 'content-type': 'application/json' }, payload: JSON.stringify(event) });
  assert.equal((await hook({}, 'forged')).statusCode, 400);

  const succeeded = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_123', amount_received: a.cart.total_cents, latest_charge: 'ch_1', metadata: { spot_cart_id: 'x' } } } };
  assert.equal((await hook(succeeded)).statusCode, 200);
  assert.equal((await hook(succeeded)).statusCode, 200, 'duplicate delivery is harmless');

  // …so after payment the requester is asked for it, then the card issues.
  let m = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.cart.status, 'paid');
  assert.equal(m.body.needs_billing, true);
  assert.equal(m.body.cart.payer_name, 'Mom', 'payer name comes from the wallet');
  assert.equal((await call('POST', `/v1/carts/${a.cart.token}/manage/billing`, { k: a.manage_key, billing: { line1: '1 Main St' } })).status, 400);
  const billed = await call('POST', `/v1/carts/${a.cart.token}/manage/billing`, { k: a.manage_key, billing: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701' } });
  assert.equal(billed.body.cart.status, 'card_issued');
  m = await call('GET', `/v1/carts/${a.cart.token}/manage?k=${a.manage_key}`);
  assert.equal(m.body.needs_billing, false);
  assert.deepEqual(m.body.events.map((e) => e.kind).filter((k) => ['needs_billing', 'billing_added', 'issue'].includes(k)), ['needs_billing', 'billing_added', 'issue']);

  const authReq = (id, name, amount) => ({ type: 'issuing_authorization.request', data: { object: { id, card: { id: 'ic_abc' }, pending_request: { amount, currency: 'usd' }, merchant_data: { name } } } });
  await hook(authReq('iauth_1', 'STEAM GAMES', 5000));
  await hook(authReq('iauth_2', 'ARITZIA', 27100));
  await hook(authReq('iauth_3', 'ARITZIA', 27100));
  assert.deepEqual(answers, [['iauth_1', false], ['iauth_2', true], ['iauth_3', false]]);
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
  const home = await app.inject({ method: 'GET', url: '/' });
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
