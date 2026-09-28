// Trust: spending rules and approvers for AI keys, the AI activity log,
// signed approvals, and signed requests to stores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { createSigning, verifyApproval, verifyRequest } from '../src/signing.js';
import { checkRules, domainOf, normalizeRules } from '../src/rules.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const nike = (price_cents) => [{ title: 'Dunk Low', variant: '10.5', quantity: 1, price_cents, url: 'https://www.nike.com/t/dunk-low' }];
const shipping = { name: 'Sam Lee', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'sam@example.com' };

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const signIn = async (email) => {
    const start = await call('POST', '/v1/auth/start', { email });
    const v = await call('POST', '/v1/auth/verify', { email, code: start.body.code });
    return v.headers['set-cookie'].split(';')[0];
  };
  return { a, call, signIn };
}

test('rules: limits, store allowlist, and when to send to the approver', () => {
  assert.equal(domainOf('https://www.Nike.com/t/x'), 'nike.com');
  assert.equal(normalizeRules({}), null, 'no rules is no rules');
  assert.throws(() => normalizeRules({ max_order_cents: 5 }), /between/);
  const r = normalizeRules({ max_order_cents: 5000, monthly_cents: 20000, stores: ['nike.com', 'https://www.target.com/'], approver: 'over_limit' });
  assert.deepEqual(r.stores, ['nike.com', 'target.com']);
  assert.deepEqual(checkRules(r, { cents: 4000, storeUrl: 'https://store.nike.com/x' }), { ok: true });
  assert.equal(checkRules(r, { cents: 4000, storeUrl: 'https://evilnike.com' }).ok, false, 'suffix match is on a dot boundary');
  assert.equal(checkRules(r, { cents: 6000, storeUrl: 'https://nike.com', hasApprover: false }).ok, false);
  assert.equal(checkRules(r, { cents: 6000, storeUrl: 'https://nike.com', hasApprover: true }).route, true);
  assert.match(checkRules(r, { cents: 4000, storeUrl: 'https://nike.com', spentThisMonth: 18000 }).reason, /monthly/);
  // A store outside the list is never sent to the approver: it's refused.
  assert.equal(checkRules(r, { cents: 100, storeUrl: 'https://walmart.com', hasApprover: true }).ok, false);
  assert.equal(checkRules({ ...r, approver: 'always' }, { cents: 100, storeUrl: 'https://nike.com', hasApprover: true }).route, true);
});

test('signing: approvals verify against the published keys; tampering fails', () => {
  const db = openDb(':memory:');
  const s = createSigning({ db, env: {}, origin: () => 'https://spotmeplease.com' });
  const jws = s.signApproval({ sub: 'abc', amount_cents: 1200 });
  assert.equal(verifyApproval(jws, s.approvalKeys()).amount_cents, 1200);
  const [h, , sig] = jws.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'abc', amount_cents: 99999 })).toString('base64url')}.${sig}`;
  assert.equal(verifyApproval(forged, s.approvalKeys()), null);
  // Keys persist in the database: the same key after a restart.
  assert.equal(createSigning({ db, env: {}, origin: () => 'x' }).approvalKeys().keys[0].kid, s.approvalKeys().keys[0].kid);

  const headers = s.signRequest('https://shop.example/ucp/checkout-sessions');
  assert.equal(headers['signature-agent'], '"https://spotmeplease.com"');
  assert.match(headers['signature-input'], /tag="web-bot-auth"/);
  assert.equal(verifyRequest(headers, 'shop.example', s.requestKeys()), true);
  assert.equal(verifyRequest(headers, 'other.example', s.requestKeys()), false, 'bound to the store it was sent to');
});

test('well-known: signed directory of request keys, and approval keys', async (t) => {
  const { call } = app(t);
  const dir = await call('GET', '/.well-known/http-message-signatures-directory');
  assert.equal(dir.status, 200);
  assert.match(dir.headers['content-type'], /http-message-signatures-directory\+json/);
  const keys = dir.body;
  assert.equal(keys.keys[0].crv, 'Ed25519');
  assert.match(dir.headers['signature-input'], /tag="http-message-signatures-directory"/);
  assert.equal(verifyRequest(dir.headers, 'localhost:80', keys) || verifyRequest(dir.headers, 'localhost', keys), true);
  const ak = await call('GET', '/.well-known/spot-keys.json');
  assert.equal(ak.body.keys[0].alg, 'EdDSA');
});

test('paying signs an approval; the receipt, the agent and a public page show it', async (t) => {
  const { a, call } = app(t);
  const key = (await call('POST', '/v1/agent/keys', { email: 'dev@example.com', agent_name: 'claude' })).body.api_key;
  const ask = (await call('POST', '/v1/agent/asks', { requester: { name: 'Sam' }, merchant: { name: 'Nike' }, items: nike(4000) }, { authorization: `Bearer ${key}` })).body;
  await call('POST', `/v1/carts/${ask.ask_id}/sandbox-pay`, { payer_name: 'Mom', payer_email: 'mom@example.com' });
  const got = (await call('GET', `/v1/agent/asks/${ask.ask_id}`, undefined, { authorization: `Bearer ${key}` })).body;
  assert.equal(got.approvals.length, 1);
  assert.equal(got.approvals[0].approved_by, 'payer');
  assert.equal(got.approvals[0].agent, 'claude');
  assert.equal(got.approval_url, got.approvals[0].url);

  const id = got.approvals[0].id;
  const rec = (await call('GET', `/v1/approvals/${id}`)).body;
  const keys = (await call('GET', '/.well-known/spot-keys.json')).body;
  const p = verifyApproval(rec.approval, keys);
  assert.equal(p.sub, ask.ask_id);
  assert.equal(p.how, 'paid_spot');
  assert.equal(p.items[0].title, 'Dunk Low');
  const page = await call('GET', `/approvals/${id}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /Put together by <b>claude<\/b>/);
  assert.equal((await call('GET', '/approvals/apv_nope')).status, 404);

  // The payer's receipt carries it too.
  const cart = a.spot.load(ask.ask_id);
  const receipt = (await call('GET', `${a.spot.payerPath(cart).replace('/c/', '/v1/carts/')}`)).body;
  assert.equal(receipt.cart.built_by, 'claude');
  assert.equal(receipt.approvals[0].id, id);
});

test('account rules: over the limit is refused, logged, and shown on the account', async (t) => {
  const { call, signIn } = app(t);
  const cookie = await signIn('sam@example.com');
  const k = (await call('POST', '/v1/me/keys', { agent_name: 'claude' }, { cookie })).body;
  const bearer = { authorization: `Bearer ${k.api_key}` };
  // Routing to an approver needs one first.
  assert.equal((await call('POST', `/v1/me/keys/${k.name}/rules`, { max_order_cents: 5000, approver: 'over_limit' }, { cookie })).status, 409);
  const set = await call('POST', `/v1/me/keys/${k.name}/rules`, { max_order_cents: 5000, stores: ['nike.com'] }, { cookie });
  assert.equal(set.status, 200);
  assert.equal(set.body.keys[0].rules.max_order_cents, 5000);
  // Someone else's account can't touch it.
  const other = await signIn('eve@example.com');
  assert.equal((await call('POST', `/v1/me/keys/${k.name}/rules`, { max_order_cents: 999999 }, { cookie: other })).status, 404);

  const over = await call('POST', '/v1/agent/asks', { requester: { name: 'Sam' }, merchant: { name: 'Nike' }, items: nike(9000) }, bearer);
  assert.equal(over.status, 403);
  assert.match(over.body.error, /\$50\.00 per order/);
  const elsewhere = await call('POST', '/v1/agent/asks', { requester: { name: 'Sam' }, merchant: { name: 'Target', url: 'https://www.target.com' }, items: [{ title: 'Lamp', quantity: 1, price_cents: 2000, url: 'https://www.target.com/p/lamp' }] }, bearer);
  assert.equal(elsewhere.status, 403);
  assert.match(elsewhere.body.error, /only shop at nike\.com/);
  const ok = await call('POST', '/v1/agent/asks', { requester: { name: 'Sam' }, merchant: { name: 'Nike' }, items: nike(4000), for: 'self' }, bearer);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));

  const me = (await call('GET', '/v1/me', undefined, { cookie })).body;
  const kinds = me.keys[0].activity.map((e) => e.kind);
  assert.deepEqual(kinds.slice(0, 3), ['ask_created', 'blocked_by_rule', 'blocked_by_rule']);
  assert.equal(me.keys[0].month_cents, ok.body.cart_cents);

  // Disconnect: the key stops working at once.
  await call('POST', `/v1/me/keys/${k.name}/revoke`, {}, { cookie });
  assert.equal((await call('GET', `/v1/agent/asks/${ok.body.ask_id}`, undefined, bearer)).status, 401);
});

test('approver: confirms by email, then over-limit asks go to them to pay', async (t) => {
  const { a, call, signIn } = app(t);
  const cookie = await signIn('teen@example.com');
  await call('POST', '/v1/me', { name: 'Jo', shipping }, { cookie });
  const k = (await call('POST', '/v1/me/keys', { agent_name: 'claude' }, { cookie })).body;
  const bearer = { authorization: `Bearer ${k.api_key}` };

  const asked = await call('POST', '/v1/me/approver', { email: 'parent@example.com', name: 'Pat' }, { cookie });
  assert.equal(asked.status, 200);
  assert.equal(asked.body.approver.confirmed, false);
  // Not confirmed yet: can't route to them.
  assert.equal((await call('POST', `/v1/me/keys/${k.name}/rules`, { max_order_cents: 5000, approver: 'over_limit' }, { cookie })).status, 409);
  // The page is a button, not a GET that agrees.
  const link = new URL(asked.body.confirm_link);
  assert.equal((await call('GET', link.pathname + link.search)).status, 200);
  assert.equal((await call('GET', '/v1/me', undefined, { cookie })).body.approver.confirmed, false);
  assert.equal((await call('POST', '/v1/approver/confirm', { u: link.searchParams.get('u'), t: 'wrong' })).status, 404);
  const yes = await call('POST', '/v1/approver/confirm', { u: link.searchParams.get('u'), t: link.searchParams.get('t') });
  assert.equal(yes.body.for, 'Jo');

  assert.equal((await call('POST', `/v1/me/keys/${k.name}/rules`, { max_order_cents: 5000, approver: 'over_limit' }, { cookie })).status, 200);
  const r = await call('POST', '/v1/agent/asks', { requester: { name: 'Jo' }, merchant: { name: 'Nike' }, items: nike(9000), for: 'self' }, bearer);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.for, 'other', 'someone else pays: the approver');
  assert.equal(r.body.sent_to_approver.name, 'Pat');
  assert.match(r.body.next_step, /Sent to Pat to approve/);
  assert.equal(r.body.finish_link, undefined);
  const cart = a.spot.load(r.body.ask_id);
  assert.equal(cart.requester.shipping.line1, '1 Main St', 'ships to the user');
  const pub = (await call('GET', `/v1/carts/${r.body.ask_id}`)).body;
  assert.equal(pub.cart?.via_approver ?? pub.via_approver, true);

  // Under the limit still goes to the user.
  const small = await call('POST', '/v1/agent/asks', { requester: { name: 'Jo' }, merchant: { name: 'Nike' }, items: nike(1000), for: 'self' }, bearer);
  assert.equal(small.body.for, 'self');

  // Removing the approver turns routing back into refusing.
  await call('POST', '/v1/me/approver/remove', {}, { cookie });
  assert.equal((await call('POST', '/v1/agent/asks', { requester: { name: 'Jo' }, merchant: { name: 'Nike' }, items: nike(9000) }, bearer)).status, 403);
});
