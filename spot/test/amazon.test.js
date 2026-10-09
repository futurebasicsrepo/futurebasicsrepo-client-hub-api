// Stores that don't allow AI checkout (Amazon): Spot can't buy there, so an
// ask is paid to the requester's Venmo / Cash App and they buy it themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { blocksAgents } from '../src/cart.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const amazon = { merchant: { name: 'Amazon', url: 'https://www.amazon.com' }, items: [{ title: 'AirPods Pro', quantity: 1, price_cents: 18900, url: 'https://www.amazon.com/dp/B0D1XD1ZV3' }] };
const auth = { authorization: 'Bearer s3cret-a' };

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_API_KEYS: 'claude:s3cret-a' } });
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

test('which stores Spot can’t buy from', () => {
  assert.ok(blocksAgents({ name: 'Amazon' }));
  assert.ok(blocksAgents({ name: 'Shop' }, [{ url: 'https://www.amazon.co.uk/dp/x' }]));
  assert.ok(blocksAgents({ name: 'Link', url: 'https://amzn.to/abc' }));
  assert.ok(!blocksAgents({ name: 'Nike', url: 'https://www.nike.com' }));
  assert.ok(!blocksAgents({ name: 'Notamazon', url: 'https://notamazon.example' }));
});

test('an AI ask for Amazon goes to the requester’s Venmo', async (t) => {
  const { a, call } = app(t);
  const none = await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, ...amazon }, auth);
  assert.equal(none.status, 409);
  assert.match(none.body.error, /requester_venmo/);

  const r = await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle', venmo: '@kyle-r' }, ...amazon }, auth);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.next_step, /doesn’t allow AI checkout.*Venmo/);
  const cart = a.spot.load(r.body.ask_id);
  assert.equal(cart.settle, 'handoff');
  assert.equal(cart.fee_cents, 0, 'no Spot fee: the money never goes through Spot');
  const page = await call('GET', `/c/${cart.token}`);
  assert.match(page.body, /venmo\.com\/u\/kyle-r\?txn=pay&amp;amount=189\.00/);

  // Not for the user's own asks: Spot can't buy it for them either.
  assert.equal((await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, ...amazon, for: 'self' }, auth)).status, 409);
});

test('a handle saved in the account is used, and Spot never buys at Amazon', async (t) => {
  const { a, call, signIn } = app(t);
  const H = { cookie: await signIn('kyle@example.com') };
  assert.equal((await call('POST', '/v1/me', { venmo: 'not a handle!' }, H)).status, 400);
  const me = await call('POST', '/v1/me', { cashtag: '$kyler' }, H);
  assert.equal(me.body.user.cashtag, 'kyler');
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'Claude' }, H)).body.api_key;
  const r = await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, ...amazon, for: 'other' }, { authorization: `Bearer ${key}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(a.spot.load(r.body.ask_id).requester.cashtag, 'kyler');

  // The web form and multi-store asks can't pick "Spot buys it" for Amazon.
  const web = await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, ...amazon, settle: 'card' });
  assert.equal(web.status, 400);
  assert.match(web.body.error, /Venmo \/ Cash App/);
  assert.equal((await call('POST', '/v1/carts', { requester: { name: 'Kyle', venmo: 'kyle-r' }, ...amazon, settle: 'handoff' })).status, 201);
  const nike = { merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }] };
  assert.equal((await call('POST', '/v1/bundles', { requester: { name: 'Kyle' }, stores: [nike, amazon] })).status, 400);
});
