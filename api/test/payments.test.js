import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShopifyGateway, orderReference, toCents } from '../src/payments.js';

const SECRET = 'whsec_test';
const sign = body => createHmac('sha256', SECRET).update(body).digest('base64');

test('gateway: configuration, signatures and order parsing', async () => {
  assert.equal(createShopifyGateway({ storeDomain: '', adminToken: '', webhookSecret: '' }).configured, false);
  const calls = [];
  const gw = createShopifyGateway({
    storeDomain: 'https://incha.myshopify.com/', adminToken: 'shpat_x', webhookSecret: SECRET, apiVersion: '2026-07',
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ data: { draftOrderCreate: { draftOrder: { id: 'gid://shopify/DraftOrder/1', name: '#D1', invoiceUrl: 'https://incha.myshopify.com/1/invoices/abc' }, userErrors: [] } } }) };
    }
  });
  assert.equal(gw.configured, true);
  const out = await gw.createCheckout({ reference: 'REF123', title: 'Summer Cup · entry for Kensington', amountCents: 5000, currency: 'USD', email: 'a@x.tv' });
  assert.equal(out.url, 'https://incha.myshopify.com/1/invoices/abc');
  assert.equal(calls[0].url, 'https://incha.myshopify.com/admin/api/2026-07/graphql.json');
  assert.equal(calls[0].init.headers['x-shopify-access-token'], 'shpat_x');
  const input = calls[0].body.variables.input;
  assert.deepEqual(input.lineItems[0].originalUnitPriceWithCurrency, { amount: '50.00', currencyCode: 'USD' });
  assert.equal(input.lineItems[0].requiresShipping, false);
  assert.deepEqual(input.customAttributes, [{ key: 'incha_entry', value: 'REF123' }]);
  assert.ok(input.tags.includes('incha-entry-REF123'));

  const failing = createShopifyGateway({ storeDomain: 's.myshopify.com', adminToken: 't', webhookSecret: SECRET,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { draftOrderCreate: { draftOrder: null, userErrors: [{ message: 'Price is invalid' }] } } }) }) });
  await assert.rejects(failing.createCheckout({ reference: 'r', title: 't', amountCents: 1 }), /Price is invalid/);

  const body = Buffer.from(JSON.stringify({ id: 1 }));
  assert.equal(gw.verifyWebhook(body, sign(body)), true);
  assert.equal(gw.verifyWebhook(body, sign(Buffer.from('other'))), false);
  assert.equal(gw.verifyWebhook(body, undefined), false);

  assert.equal(orderReference({ note_attributes: [{ name: 'incha_entry', value: 'A1' }] }), 'A1');
  assert.equal(orderReference({ tags: 'incha-tournament, incha-entry-B2' }), 'B2');
  assert.equal(orderReference({ tags: '' }), null);
  assert.equal(toCents('12.50'), 1250);
  assert.deepEqual(gw.parseOrder({ admin_graphql_api_id: 'gid://shopify/Order/9', name: '#1001', current_total_price: '50.00', currency: 'USD', note_attributes: [{ name: 'incha_entry', value: 'A1' }] }),
    { reference: 'A1', orderId: 'gid://shopify/Order/9', orderName: '#1001', amountCents: 5000, currency: 'USD', financialStatus: null, cancelled: false });
});

const dbUrl = process.env.TEST_DATABASE_URL;

test('paid tournament entry: checkout, webhook, manual payments, refunds', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-pay-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  process.env.ADMIN_HANDLES = 'staff';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists payment_events, bracket_slots, tournament_teams, tournaments, team_players, team_managers, mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const created = [];
  const gateway = createShopifyGateway({
    storeDomain: 'incha.myshopify.com', adminToken: 'shpat_x', webhookSecret: SECRET,
    fetchImpl: async (_url, init) => {
      const ref = JSON.parse(init.body).variables.input.customAttributes[0].value;
      created.push(ref);
      return { ok: true, status: 200, json: async () => ({ data: { draftOrderCreate: { draftOrder: { id: `gid://shopify/DraftOrder/${created.length}`, name: `#D${created.length}`, invoiceUrl: `https://incha.myshopify.com/invoices/${ref}` }, userErrors: [] } } }) };
    }
  });
  const app = await buildApp({ logger: false, payments: gateway });
  t.after(async () => { delete process.env.ADMIN_HANDLES; await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signup = async handle => json(await call('POST', '/v1/auth/signup', null, { email: `${handle}@x.tv`, handle, password: 'hinchada123' })).token;
  const [staff, org, ana, ben, cat] = await Promise.all(['staff', 'org', 'ana', 'ben', 'cat'].map(signup));
  const hook = (topic, payload, { id = `${topic}-${Math.random()}`, secret = SECRET } = {}) => {
    const body = JSON.stringify(payload);
    return app.inject({ method: 'POST', url: '/v1/payments/shopify/webhook', payload: body, headers: {
      'content-type': 'application/json', 'x-shopify-topic': topic, 'x-shopify-webhook-id': id,
      'x-shopify-hmac-sha256': createHmac('sha256', secret).update(body).digest('base64') } });
  };
  const order = (ref, total = '50.00', extra = {}) => ({ id: 777, admin_graphql_api_id: 'gid://shopify/Order/777', name: '#1001', current_total_price: total, currency: 'USD', note_attributes: [{ name: 'incha_entry', value: ref }], ...extra });

  // Only incha staff can charge.
  assert.equal((await call('POST', '/v1/tournaments', org, { name: 'Org Cup', entryFee: 20 })).statusCode, 403);
  assert.equal((await call('POST', '/v1/tournaments', staff, { name: 'Bad', entryFee: -1 })).statusCode, 400);
  let res = await call('POST', '/v1/tournaments', staff, { name: 'Paid Cup', entryFee: '50', capacity: 2, approval: 'auto' });
  assert.equal(res.statusCode, 201);
  let cup = json(res);
  const id = cup.tournament.id;
  assert.equal(cup.tournament.entryFeeCents, 5000);
  assert.equal(cup.tournament.payOnline, true);

  // Entering doesn't get you in: you owe the fee.
  await call('POST', `/v1/tournaments/${id}/teams`, ana, { name: 'Ana FC' });
  cup = json(await call('GET', `/v1/tournaments/${id}`, ana));
  assert.deepEqual([cup.teams[0].status, cup.teams[0].payment.status, cup.teams[0].payment.amountCents], ['pending', 'unpaid', 5000]);
  assert.equal(json(await call('GET', `/v1/tournaments/${id}`, null)).teams.length, 0, 'unpaid entries are private');
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams/ana-fc/checkout`, ben)).statusCode, 404, 'only the team pays');
  res = await call('POST', `/v1/tournaments/${id}/teams/ana-fc/checkout`, ana);
  assert.equal(res.statusCode, 200);
  const ref = created[0];
  assert.equal(json(res).url, `https://incha.myshopify.com/invoices/${ref}`);
  assert.equal(json(await call('POST', `/v1/tournaments/${id}/teams/ana-fc/checkout`, ana)).reused, true, 'double tap reuses the checkout');
  assert.equal(created.length, 1);
  assert.equal((await call('DELETE', `/v1/tournaments/${id}/teams/ana-fc`, ana)).statusCode, 400, 'can’t silently withdraw mid-payment');

  // Webhooks: signature, amount and duplicates are checked.
  assert.equal((await hook('orders/paid', order(ref), { secret: 'wrong' })).statusCode, 401);
  assert.equal(json(await hook('orders/paid', order(ref, '5.00'))).outcome, 'held: paid 500 of 5000');
  assert.equal(json(await hook('orders/paid', order('nope'))).outcome, 'ignored: unknown reference');
  res = await hook('orders/paid', order(ref), { id: 'evt-1' });
  assert.equal(json(res).outcome, 'paid');
  assert.equal(json(await hook('orders/paid', order(ref), { id: 'evt-1' })).duplicate, true);
  cup = json(await call('GET', `/v1/tournaments/${id}`, staff));
  assert.deepEqual([cup.teams[0].status, cup.teams[0].payment.status, cup.teams[0].payment.orderName], ['approved', 'paid', '#1001'], 'auto-approved on payment');
  assert.equal(cup.tournament.collectedCents, 5000);
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams/ana-fc/checkout`, ana)).statusCode, 409);

  // Cash at the field: the organizer records it; approval needs it first when approving by hand.
  await call('POST', `/v1/tournaments/${id}/teams`, ben, { name: 'Ben FC' });
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams/ben-fc/payment`, ben, { status: 'paid' })).statusCode, 404, 'organizer only');
  cup = json(await call('POST', `/v1/tournaments/${id}/teams/ben-fc/payment`, staff, { status: 'paid', note: 'Cash' }));
  assert.deepEqual([cup.teams.find(e => e.slug === 'ben-fc').status, cup.teams.find(e => e.slug === 'ben-fc').payment.note], ['approved', 'Cash']);
  // Full now: a late payer stays pending so the organizer can refund.
  await call('POST', `/v1/tournaments/${id}/teams`, cat, { name: 'Cat FC' });
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, cat, { name: 'Cat Two' })).statusCode, 400, 'full');

  // Refund in Shopify: the entry drops back out while sign-ups are open.
  assert.equal(json(await hook('refunds/create', { id: 55, order_id: 777 })).outcome, 'refunded');
  cup = json(await call('GET', `/v1/tournaments/${id}`, staff));
  assert.deepEqual([cup.teams.find(e => e.slug === 'ana-fc').status, cup.teams.find(e => e.slug === 'ana-fc').payment.status], ['pending', 'refunded']);

  // Manual approval tournaments block approving unpaid teams; fees can't change once money moved.
  const manual = json(await call('POST', '/v1/tournaments', staff, { name: 'Manual Cup', entryFee: 10 })).tournament;
  await call('POST', `/v1/tournaments/${manual.id}/teams`, ana, { name: 'Ana FC' });
  assert.match(json(await call('PATCH', `/v1/tournaments/${manual.id}/teams/ana-fc`, staff, { status: 'approved' })).error, /hasn’t paid/);
  assert.equal((await call('POST', `/v1/tournaments/${manual.id}/teams/ana-fc/payment`, staff, { status: 'waived' })).statusCode, 200);
  assert.equal((await call('PATCH', `/v1/tournaments/${manual.id}/teams/ana-fc`, staff, { status: 'approved' })).statusCode, 200);
  assert.equal((await call('PATCH', `/v1/tournaments/${id}`, staff, { entryFee: 60 })).statusCode, 400);

  // Free tournaments are untouched.
  const free = json(await call('POST', '/v1/tournaments', org, { name: 'Free Cup', approval: 'auto' })).tournament;
  await call('POST', `/v1/tournaments/${free.id}/teams`, ben, { name: 'Ben FC' });
  const freeView = json(await call('GET', `/v1/tournaments/${free.id}`, ben));
  assert.deepEqual([freeView.teams[0].status, freeView.teams[0].payment, freeView.tournament.payOnline], ['approved', null, false]);
  assert.equal((await call('POST', `/v1/tournaments/${free.id}/teams/ben-fc/checkout`, ben)).statusCode, 400);
});
