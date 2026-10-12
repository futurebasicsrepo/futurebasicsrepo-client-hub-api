// Card facts: options, the store's price now and on sale, prices Spot has
// seen, and the store's policies read by AI off its own site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { ownerCart } from '../src/spot.js';
import { createStoreFacts, optionsOf, policyFrom, siteOf } from '../src/storefacts.js';

const DAY = 86_400_000;
const BOOTS = 'https://shop.tecovas.com/products/the-cartwright';
const boots = {
  title: 'The Cartwright',
  options: [{ name: 'Color', values: ['Bourbon', 'Midnight'] }, { name: 'Size', values: ['9', '10', '11'] }],
  variants: [
    { id: 1, option1: 'Bourbon', option2: '9', price: 24900, compare_at_price: 29500, available: true },
    { id: 2, option1: 'Bourbon', option2: '10', price: 24900, compare_at_price: 29500, available: false },
    { id: 3, option1: 'Midnight', option2: '11', price: 29500, compare_at_price: null, available: true },
  ],
};
const TECOVAS = { price_adjustment: true, adjustment_days: 14, adjustment_how: 'email support with your order number', returns_days: 30, free_returns: true, source_url: 'https://www.tecovas.com/pages/returns' };

test('a policy is kept only with a source on the store’s own site, and sane numbers', () => {
  assert.equal(siteOf(BOOTS), 'tecovas.com');
  assert.equal(siteOf('https://www.marksandspencer.co.uk/x'), 'marksandspencer.co.uk');
  assert.deepEqual(policyFrom(TECOVAS, 'tecovas.com'), { ...TECOVAS, adjustment_how: 'email support with your order number', ship_days_min: null, ship_days_max: null, free_shipping_over: null });
  assert.deepEqual((({ ship_days_min, ship_days_max, free_shipping_over }) => ({ ship_days_min, ship_days_max, free_shipping_over }))(policyFrom({ ...TECOVAS, ship_days_min: 5, ship_days_max: 2, free_shipping_over: 75 }, 'tecovas.com')), { ship_days_min: 2, ship_days_max: 5, free_shipping_over: 7500 });
  assert.equal(policyFrom({ ...TECOVAS, source_url: 'https://www.reddit.com/r/boots' }, 'tecovas.com'), null, 'not the store’s page');
  assert.equal(policyFrom({ ...TECOVAS, source_url: 'http://tecovas.com/p' }, 'tecovas.com'), null, 'https only');
  assert.equal(policyFrom({ ...TECOVAS, adjustment_days: 900 }, 'tecovas.com').adjustment_days, null);
  assert.equal(policyFrom({ ...TECOVAS, price_adjustment: false }, 'tecovas.com').adjustment_days, null, 'no window without a policy');
  assert.equal(policyFrom({ price_adjustment: 'maybe', source_url: 'https://tecovas.com/p' }, 'tecovas.com'), null, 'says nothing');
  assert.equal(policyFrom(null, 'tecovas.com'), null);
});

test('options: each choice with what’s in stock; a lone default isn’t one', () => {
  assert.deepEqual(optionsOf(boots), [
    { name: 'Color', values: [{ value: 'Bourbon', in: true }, { value: 'Midnight', in: true }] },
    { name: 'Size', values: [{ value: '9', in: true }, { value: '10', in: false }, { value: '11', in: true }] },
  ]);
  assert.deepEqual(optionsOf({ options: ['Title'], variants: [{ option1: 'Default Title' }] }), []);
});

test('facts: the store’s price and sale price for the option asked, prices seen, and a policy read once in the background', async () => {
  const db = openDb(':memory:');
  let reads = 0;
  const read = async (site, name) => (reads++, assert.equal(site, 'tecovas.com'), assert.equal(name, 'Tecovas'), TECOVAS);
  const sf = createStoreFacts({ db, product: async () => boots, read });
  const t0 = Date.now();
  const [f] = await sf.facts([{ url: BOOTS, variant: 'Bourbon / 9', store: 'Tecovas' }], t0);
  assert.equal(f.now_cents, 24900);
  assert.equal(f.was_cents, 29500);
  assert.equal(f.options.length, 2);
  assert.equal(f.policy, null);
  assert.equal(f.policy_pending, true, 'being read');
  await sf.settled();
  const [g] = await sf.facts([{ url: BOOTS, variant: 'Bourbon / 9', store: 'Tecovas' }], t0 + 1);
  assert.deepEqual(g.policy, TECOVAS);
  assert.equal(g.policy_pending, false);
  await sf.facts([{ url: 'https://tecovas.com/products/hat', store: 'Tecovas' }], t0 + 2);
  assert.equal(reads, 1, 'one read per store a month');
  await sf.facts([{ url: BOOTS, store: 'Tecovas' }], t0 + 31 * DAY);
  await sf.settled();
  assert.equal(reads, 2, 're-read after a month');

  // Prices seen, a day at a time.
  db.prices.add(BOOTS, 29500, t0 - 10 * DAY);
  db.prices.add(BOOTS, 27500, t0 - 5 * DAY);
  const [h] = await sf.facts([{ url: BOOTS, variant: 'Midnight / 11' }], t0);
  assert.equal(h.now_cents, 29500);
  assert.equal(h.was_cents, null, 'not on sale');
  assert.deepEqual({ low: h.seen.low_cents, high: h.seen.high_cents, days: h.seen.days }, { low: 24900, high: 29500, days: 3 });
  const [none] = await sf.facts([{ url: BOOTS, variant: 'Bourbon' }], t0);
  assert.equal(none.now_cents, null, 'two sizes at one price, but which one is unclear: no price claimed');
});

test('a store whose policy can’t be found is asked again tomorrow, not every time', async () => {
  const db = openDb(':memory:');
  let reads = 0;
  const sf = createStoreFacts({ db, product: async () => null, read: async () => (reads++, null) });
  const t0 = Date.now();
  await sf.facts([{ url: 'https://nopolicy.com/p' }], t0);
  await sf.settled();
  const [f] = await sf.facts([{ url: 'https://nopolicy.com/p' }], t0 + 1000);
  assert.equal(f.policy, null);
  assert.equal(f.policy_pending, false);
  assert.equal(reads, 1);
  await sf.facts([{ url: 'https://nopolicy.com/p' }], t0 + DAY + 1);
  await sf.settled();
  assert.equal(reads, 2);
});

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {}, capture: { product: async () => boots, policy: async () => TECOVAS }, priceNowImpl: async () => ({ cents: 24900, source: 'store' }) });
  t.after(() => a.close());
  const call = async (method, url, payload) => {
    const r = await a.inject({ method, url, payload });
    return { status: r.statusCode, body: r.json() };
  };
  return { a, call };
}

test('POST /v1/facts: only web links, a dozen at most', async (t) => {
  const { a, call } = app(t);
  const r = await call('POST', '/v1/facts', { items: [{ url: BOOTS, variant: 'Bourbon / 9', store: 'Tecovas' }, { url: 'javascript:alert(1)' }, { url: 42 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.facts.length, 1);
  assert.equal(r.body.facts[0].was_cents, 29500);
  await a.storeFacts.settled();
  assert.deepEqual((await call('POST', '/v1/facts', { items: [{ url: BOOTS }] })).body.facts[0].policy, TECOVAS);
  assert.equal((await call('POST', '/v1/facts', { items: Array.from({ length: 30 }, (_, i) => ({ url: `${BOOTS}?i=${i}` })) })).body.facts.length, 12);
  assert.equal((await call('POST', '/v1/facts', {})).body.facts.length, 0);
});

test('the price watch runs for the store’s own window, and the requester sees it’s on (never an unclaimed drop)', async (t) => {
  const { a, call } = app(t);
  a.storeFacts.policy('tecovas.com', 'Tecovas');
  await a.storeFacts.settled();
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle' }, merchant: { name: 'Tecovas', url: 'https://tecovas.com' }, items: [{ title: 'The Cartwright', variant: 'Bourbon / 9', url: BOOTS, price_cents: 29500 }] })).body;
  await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  const id = a.spot.load(made.cart.token).id;
  const placed = Date.now() - DAY;
  a.spot.patch(id, (c) => ({ ...c, fulfillment: { state: 'placed', order_number: '#1', placed_at: placed } }));
  await a.priceWatch.sweep();
  const c = a.spot.byId(id);
  assert.equal(c.price_watch.until, placed + 14 * DAY, 'Tecovas adjusts for 14 days');
  assert.equal(c.price_watch.policy.days, 14);
  assert.equal(c.price_watch.state, 'dropped');
  assert.deepEqual(ownerCart(c).price_watch, { state: 'watching', until: placed + 14 * DAY, last_at: c.price_watch.last_at, claimed_cents: null, refunded_cents: null });
  a.priceWatch.claim(id);
  assert.equal(ownerCart(a.spot.byId(id)).price_watch.claimed_cents, 4600);
});
