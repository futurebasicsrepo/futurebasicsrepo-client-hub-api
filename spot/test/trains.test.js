// Train tickets: the AI picks a train, the rider adds who's riding (not a
// shipping address), pays, and Spot buys that train on the operator's site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { systemPrompt } from '../src/fulfill/agent.js';
import { minutesUntilCutoff, validateTrain } from '../src/trains.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const auth = { authorization: 'Bearer s3cret-a' };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const train = (over = {}) => ({
  from: 'Philadelphia (30th Street) - PHL',
  to: 'New York (Moynihan Train Hall) - NYP',
  depart_at: `${day(2)}T05:58`,
  arrive_at: `${day(2)}T07:26`,
  service: 'Northeast Regional',
  number: '110',
  passengers: 2,
  ...over,
});

function app(t, env = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_API_KEYS: 'claude:s3cret-a', ...env } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call };
}

test('validation: stations, local time, passengers, a fare, and not too late', async (t) => {
  assert.throws(() => validateTrain({ from: 'PHL', to: 'NYP', depart_at: 'tomorrow 6am' }), /depart_at/);
  assert.throws(() => validateTrain({ from: 'PHL', to: '', depart_at: '2026-10-09T05:58' }), /stations/);
  assert.throws(() => validateTrain({ from: 'PHL', to: 'NYP', depart_at: '2026-10-09T05:58', passengers: 9 }), /1 to 6/);
  assert.equal(validateTrain({ from: 'PHL', to: 'NYP', depart_at: '2026-10-09T05:58' }).fare_class, 'Coach');
  // Read as UTC−4: 05:58 local is 09:58Z, so the cut-off is 09:13Z.
  assert.equal(minutesUntilCutoff({ depart_at: '2026-10-09T05:58' }, Date.parse('2026-10-09T09:00:00Z')), 13);

  const { call } = app(t);
  assert.equal((await call('POST', '/v1/agent/trains/asks', { requester: { name: 'Kyle' }, train: train() }, auth)).status, 400, 'needs a fare');
  const late = await call('POST', '/v1/agent/trains/asks', { requester: { name: 'Kyle' }, train: train({ depart_at: new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16) }), fare_cents: 5300 }, auth);
  assert.equal(late.status, 410);
  assert.match(late.body.error, /leaves too soon/);
});

test('rider flow: who’s riding instead of shipping, pay, then Spot buys the ticket', async (t) => {
  const { a, call } = app(t);
  const r = await call('POST', '/v1/agent/trains/asks', { requester: { name: 'Kyle' }, train: train(), fare_cents: 10600, note: 'earliest train' }, auth);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.for, 'self');
  assert.equal(r.body.items[0].title, 'Amtrak Northeast Regional 110: Philadelphia (30th Street) - PHL → New York (Moynihan Train Hall) - NYP');
  assert.match(r.body.items[0].variant, /5:58 AM–7:26 AM · Coach · 2 passengers$/);
  assert.match(r.body.finish_link_note, /who's riding/);
  const k = new URL(r.body.finish_link).searchParams.get('k');
  const token = r.body.ask_id;
  const cart = a.spot.load(token);
  assert.equal(cart.kind, 'train');
  assert.match(cart.merchant.url, /^https:\/\/www\.amtrak\.com\/?$/);
  assert.ok(cart.expires_at < Date.parse(`${day(2)}T09:58:00Z`), 'closes before the train leaves');

  // The page gets the journey; it doesn't ship and can't be paid before riders.
  const page = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(page.train.service, 'Northeast Regional');
  assert.equal(page.train.passengers, 2);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/prepare`, { k, shipping: { name: 'K' } })).status, 400);
  assert.equal((await call('POST', `/v1/carts/${token}/sandbox-pay`, {})).status, 409);
  const one = await call('POST', `/v1/carts/${token}/manage/riders`, { k, riders: [{ given_name: 'Kyle', family_name: 'Riggle' }], contact: { email: 'kyle@example.com' } });
  assert.equal(one.status, 400);
  assert.match(one.body.error, /all 2 riders/);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/riders`, { k: 'wrong', riders: [], contact: {} })).status, 404);
  const set = await call('POST', `/v1/carts/${token}/manage/riders`, {
    k,
    riders: [{ given_name: 'Kyle', family_name: 'Riggle' }, { given_name: 'Sam', family_name: 'Riggle' }],
    contact: { email: 'Kyle@Example.com', phone: '2155550100' },
  });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.deepEqual(set.body.cart.riders.map((x) => x.given_name), ['Kyle', 'Sam']);
  assert.equal(set.body.cart.contact.email, 'kyle@example.com');

  // Paid → card → ordering starts on its own (here the agent is off, so it waits for a person).
  assert.equal((await call('POST', `/v1/carts/${token}/sandbox-pay`, {})).status, 200);
  const after = a.spot.load(token);
  assert.equal(after.status, 'card_issued');
  assert.equal(after.fulfillment.state, 'needs_you');
  assert.match(after.fulfillment.manual_url, /^https:\/\/www\.amtrak\.com\/?$/);
  assert.equal(after.requester.shipping, undefined, 'no shipping address on a ticket');

  // What Spot's checkout is told to buy.
  const prompt = systemPrompt(after, { name: 'Kyle Riggle', email: 'kyle@example.com', phone: '', riders: after.train.riders }, null);
  assert.match(prompt, /Northeast Regional 110, one-way, from Philadelphia/);
  assert.match(prompt, /at 05:58 \(local station time\), arriving 07:26/);
  assert.match(prompt, /1\. Kyle Riggle\n2\. Sam Riggle/);
  assert.match(prompt, /Never pick a different train/);
  assert.doesNotMatch(prompt, /Ship to/);
});

test('the AI can prefill riders; live keys keep trains off until turned on', async (t) => {
  const { a, call } = app(t);
  const r = await call('POST', '/v1/agent/trains/asks', {
    requester: { name: 'Kyle' },
    train: train({ passengers: 1 }),
    fare_cents: 5300,
    riders: [{ given_name: 'Kyle', family_name: 'Riggle' }],
    contact: { email: 'kyle@example.com' },
  }, auth);
  assert.equal(r.status, 201);
  assert.equal(a.spot.load(r.body.ask_id).train.riders[0].family_name, 'Riggle');
  assert.equal((await call('POST', `/v1/carts/${r.body.ask_id}/sandbox-pay`, {})).status, 200, 'ready to pay straight away');

  const live = app(t, { STRIPE_SECRET_KEY: 'sk_live_x' });
  const off = await live.call('POST', '/v1/agent/trains/asks', { requester: { name: 'Kyle' }, train: train(), fare_cents: 5300 }, auth);
  assert.equal(off.status, 403);
});
