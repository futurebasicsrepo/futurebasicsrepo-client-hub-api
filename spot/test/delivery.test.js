// "Arrives by": the store's own delivery dates to the shopper's saved
// address, else its usual shipping time in business days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { addBusinessDays, createDelivery } from '../src/delivery.js';

const BOOTS = 'https://www.tecovas.com/products/the-cartwright';
const product = async () => ({ title: 'The Cartwright', variants: [{ id: 11, option1: 'Bourbon', option2: '10', price: 24900 }, { id: 12, option1: 'Bourbon', option2: '11', price: 24900 }] });
const RATES = [
  { name: 'Standard', cents: 0, min_date: '2026-10-16', max_date: '2026-10-20' },
  { name: 'Express', cents: 2500, min_date: '2026-10-14', max_date: '2026-10-14' },
  { name: 'Overnight', cents: 4500, min_date: '2026-10-14', max_date: '2026-10-14' },
];
const PHILLY = { city: 'Philadelphia', state: 'PA', postal_code: '19103' };

test('business days skip weekends', () => {
  assert.equal(addBusinessDays(Date.parse('2026-10-16T15:00:00Z'), 1), '2026-10-19', 'Friday + 1 = Monday');
  assert.equal(addBusinessDays(Date.parse('2026-10-12T15:00:00Z'), 5), '2026-10-19');
  assert.equal(addBusinessDays(Date.parse('2026-10-12T15:00:00Z'), 0), '2026-10-12');
});

test('the store’s own dates for the option asked: cheapest, and the fastest for what it costs', async () => {
  let asked = null;
  const d = createDelivery({ product, rates: async (url, lines, ship) => ((asked = { url, lines, ship }), RATES) });
  const r = await d.arrives({ url: BOOTS, variant: 'Bourbon / 11' }, PHILLY);
  assert.equal(asked.lines[0].item.id, '12', 'the size asked for');
  assert.equal(asked.ship.postal_code, '19103');
  assert.equal(r.source, 'store');
  assert.deepEqual(r.cheapest, RATES[0]);
  assert.deepEqual(r.fastest, RATES[1], 'the cheaper of the two fastest');
  assert.equal(r.to, 'Philadelphia, PA');
  const noDates = createDelivery({ product, rates: async () => [{ name: 'Ground', cents: 895, min_date: null, max_date: null }] });
  const g = await noDates.arrives({ url: BOOTS }, PHILLY);
  assert.equal(g.cheapest.cents, 895);
  assert.equal(g.fastest, null);
});

test('no address or no store data: the store’s usual shipping time; nothing at all: none', async () => {
  const policyOf = () => ({ ship_days_min: 3, ship_days_max: 5, free_shipping_over: 7500, source_url: 'https://www.tecovas.com/pages/shipping' });
  const d = createDelivery({ product, rates: async () => null, policyOf });
  const now = Date.parse('2026-10-12T15:00:00Z');
  const r = await d.arrives({ url: BOOTS }, null, now);
  assert.deepEqual(r, { source: 'policy', min_date: '2026-10-15', max_date: '2026-10-19', free_over_cents: 7500, source_url: 'https://www.tecovas.com/pages/shipping', to: null });
  assert.deepEqual(await createDelivery({ product: async () => null, rates: async () => null }).arrives({ url: 'https://x.com/p' }, PHILLY), { none: true });
});

test('kept six hours per product and ZIP', async () => {
  let n = 0;
  const d = createDelivery({ product, rates: async () => (n++, RATES) });
  const t0 = Date.now();
  await d.arrives({ url: BOOTS }, PHILLY, t0);
  await d.arrives({ url: BOOTS }, PHILLY, t0 + 3_600_000);
  assert.equal(n, 1);
  await d.arrives({ url: BOOTS }, { ...PHILLY, postal_code: '78701' }, t0);
  assert.equal(n, 2);
  await d.arrives({ url: BOOTS }, PHILLY, t0 + 7 * 3_600_000);
  assert.equal(n, 3);
});

test('POST /v1/delivery uses the signed-in shopper’s saved address, never one sent in', async (t) => {
  let shipTo = null;
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {}, capture: { product, shipRates: async (url, lines, ship) => ((shipTo = ship), RATES) } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.json(), headers: r.headers };
  };
  assert.equal((await call('POST', '/v1/delivery', { url: 'nope' })).status, 400);
  const anon = await call('POST', '/v1/delivery', { url: BOOTS, shipping: { postal_code: '90210' } });
  assert.deepEqual(anon.body.delivery, { none: true });
  assert.equal(shipTo, null, 'no address of theirs, no store call');
  const start = await call('POST', '/v1/auth/start', { email: 'kyle@example.com' });
  const v = await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: start.body.code });
  const H = { cookie: v.headers['set-cookie'].split(';')[0] };
  assert.equal((await call('POST', '/v1/me', { shipping: { name: 'Kyle', line1: '1 Main St', city: 'Philadelphia', state: 'PA', postal_code: '19103' } }, H)).status, 200);
  const mine = await call('POST', '/v1/delivery', { url: BOOTS, shipping: { postal_code: '90210' } }, H);
  assert.equal(mine.body.delivery.cheapest.max_date, '2026-10-20');
  assert.equal(shipTo.postal_code, '19103');
});
