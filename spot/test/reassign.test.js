// "Ask someone else to pay": the AI made a cart for you, and you send it on
// to someone else instead of paying it yourself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const auth = { authorization: 'Bearer s3cret-a' };
const items = [{ title: 'Dunk Low', variant: '10.5', quantity: 1, price_cents: 11500, url: 'https://www.nike.com/t/dunk-low' }];
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_API_KEYS: 'claude:s3cret-a' } });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const ask = async (payload, url = '/v1/agent/asks') => {
    const r = (await a.inject({ method: 'POST', url, headers: auth, payload })).json();
    return { token: r.ask_id, k: new URL(r.finish_link).searchParams.get('k') };
  };
  return { a, call, ask };
}

test('a for-me cart becomes a link someone else pays', async (t) => {
  const { a, call, ask } = app(t);
  const { token, k } = await ask({ for: 'self', requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items });
  const before = a.spot.load(token);

  assert.equal((await call('POST', `/v1/carts/${token}/manage/reassign`, { k: 'wrong' })).status, 404);
  const r = await call('POST', `/v1/carts/${token}/manage/reassign`, { k });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.cart.for, 'other');
  assert.match(r.body.link, new RegExp(`/c/${token}$`));
  assert.match(r.body.share_message, /^psst… can you spot me\? 👀 Dunk Low from Nike\n/);
  assert.equal(a.spot.load(token).total_cents, before.total_cents, 'same price for whoever pays');
  assert.equal((await call('POST', `/v1/carts/${token}/manage/reassign`, { k })).status, 200, 'again is a no-op');

  // Someone else pays; the requester hears they're covered and picks where it ships.
  assert.equal((await call('POST', `/v1/carts/${token}/sandbox-pay`, { payer_name: 'Mom' })).status, 200);
  const page = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body;
  assert.equal(page.cart.for, 'other');
  assert.equal(page.cart.payer_name, 'Mom');
  assert.ok(page.events.some((e) => e.kind === 'reassigned'));
  assert.equal((await call('POST', `/v1/carts/${token}/manage/reassign`, { k })).status, 200, 'already someone else’s: nothing to do');
});

test('tickets and paid carts stay with the requester', async (t) => {
  const { call, ask } = app(t);
  const train = await ask({
    requester: { name: 'Kyle' }, fare_cents: 5300,
    train: { from: 'PHL', to: 'NYP', depart_at: `${day(2)}T05:58`, passengers: 1 },
  }, '/v1/agent/trains/asks');
  assert.equal((await call('POST', `/v1/carts/${train.token}/manage/reassign`, { k: train.k })).status, 400);

  const paid = await ask({ for: 'self', requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items });
  await call('POST', `/v1/carts/${paid.token}/sandbox-pay`, {});
  assert.equal((await call('POST', `/v1/carts/${paid.token}/manage/reassign`, { k: paid.k })).status, 409);
});

test('whoever gets the link can say "not this time": the requester hears, and the ask stays open', async (t) => {
  const sent = [];
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {}, notifyFetch: async (url, init) => { sent.push(String(init?.body || '')); return new Response('{}', { status: 200 }); } });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle', email: 'kyle@example.com' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items })).body;
  const token = made.cart.token;
  assert.match((await call('GET', `/c/${token}`)).body, /Not this time/);

  const no = await call('POST', `/v1/carts/${token}/decline`, { name: 'Danielle' });
  assert.equal(no.status, 200, JSON.stringify(no.body));
  const mine = (await call('GET', `/v1/carts/${token}/manage?k=${made.manage_key}`)).body;
  assert.equal(mine.cart.status, 'open', 'Kyle can still pay it or send it on');
  assert.ok(mine.events.some((e) => e.kind === 'declined'));
  assert.equal(a.spot.load(token).declines[0].name, 'Danielle');

  // Once it's paid, there's nothing to decline.
  await call('POST', `/v1/carts/${token}/sandbox-pay`, {});
  assert.equal((await call('POST', `/v1/carts/${token}/decline`, {})).status, 409);
});
