// Store reach: every store a pick comes from, for anyone, on /admin/health.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const ADMIN = 'admin-token-0123456789';
const admin = { authorization: `Bearer ${ADMIN}` };
const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };
const pick = (store, host, path) => ({ type: 'pick', option: { merchant: { name: store, url: `https://${host}` }, item: { title: path, url: `https://${host}/products/${path}`, image_url: 'https://cdn.example/x.jpg', price_cents: 5000 }, stock: 'in' } });

test('every store shown counts once, picks add up, and the top stores’ share says how flat results are', async (t) => {
  const db = openDb(':memory:');
  // Shown to a signed-in shopper before reach was kept: counted from the start.
  db.raw.prepare('INSERT INTO seen_products (user_id, url, doc, at) VALUES (?, ?, ?, ?)').run('u1', 'https://www.oldshop.com/p/1', JSON.stringify({ merchant: { name: 'Old Shop', url: 'https://www.oldshop.com' }, item: { url: 'https://www.oldshop.com/p/1' } }), Date.now() - 40 * 86_400_000);
  const stream = async (text, o, write) => {
    write(pick('Tecovas', 'www.tecovas.com', 'boot'));
    write(pick('Tecovas', 'shop.tecovas.com', 'hat'));
    write({ type: 'outfit', outfit: { name: 'Look', items: [pick('Feature', 'feature.com', 'tee').option, pick('Concepts', 'cncpts.com', 'jeans').option] } });
    write({ type: 'done', kind: 'products', count: 3 });
  };
  const a = buildApp({ db, provider: sandboxProvider(), cfg, logger: false, env: { SPOT_ADMIN_TOKEN: ADMIN, SPOT_AGENT: 'off' }, capture: { stream } });
  t.after(() => a.close());
  await a.inject({ method: 'POST', url: '/v1/capture/stream', payload: { text: 'boots' } });

  // An order placed at one of them.
  const made = (await a.inject({ method: 'POST', url: '/v1/carts', payload: { requester: { name: 'Kyle' }, merchant: { name: 'Tecovas', url: 'https://www.tecovas.com' }, items: [{ title: 'Boot', price_cents: 5000 }] } })).json();
  await a.inject({ method: 'POST', url: `/v1/carts/${made.cart.token}/sandbox-pay`, payload: { payer_name: 'Mom' } });
  const id = a.spot.load(made.cart.token).id;
  a.spot.patch(id, (c) => ({ ...c, fulfillment: { state: 'placed', placed_at: Date.now() } }));

  const h = (await a.inject({ method: 'GET', url: '/v1/admin/health', headers: admin })).json();
  assert.equal(h.stores.shown, 4, 'tecovas (both hosts), feature, cncpts, and the old one');
  assert.equal(h.stores.new_7d, 3);
  assert.equal(h.stores.ordered, 1);
  assert.equal(h.stores.picks, 5);
  assert.equal(h.stores.top[0].site, 'tecovas.com');
  assert.equal(h.stores.top[0].shown, 2);
  assert.equal(h.stores.top10_share, 1);
  assert.equal((await a.inject({ method: 'GET', url: '/v1/admin/health' })).statusCode, 401);
});
