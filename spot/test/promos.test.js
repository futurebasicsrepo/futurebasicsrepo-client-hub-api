// Promo codes: found by AI per store, tried in the store's own cart for the
// item on the card; only codes that take money off show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { cartTryCodes, codesFrom, createPromos } from '../src/promos.js';

const BOOTS = 'https://www.tecovas.com/products/the-cartwright?variant=12';
const product = async () => ({ title: 'The Cartwright', variants: [{ id: 11, option1: 'Bourbon', option2: '10', price: 24900 }, { id: 12, option1: 'Bourbon', option2: '11', price: 24900 }] });
const FOUND = { codes: [{ code: 'save15', description: '15% off sitewide', source_url: 'https://www.tecovas.com/pages/offers' }, { code: 'WELCOME10', description: '10% off first order', source_url: 'https://coupons.example/tecovas' }, { code: 'SAVE15' }, { code: 'no spaces' }, { code: 'X' }] };

test('codes from the AI: tidy, real-looking, no repeats, where they were seen', () => {
  const c = codesFrom(FOUND, 'tecovas.com');
  assert.deepEqual(c.map((x) => [x.code, x.from_store]), [['SAVE15', true], ['WELCOME10', false]]);
  assert.deepEqual(codesFrom(null, 'x.com'), []);
});

// A Shopify storefront cart: SAVE15 takes 15% off; WELCOME10 isn't applicable.
function storefront() {
  const log = [];
  let discount = '';
  const fetchImpl = async (u, init = {}) => {
    const url = new URL(u);
    log.push([init.method || 'GET', url.pathname, init.body || null]);
    if (init.method === 'HEAD') return new Response(null, { status: 200 });
    if (url.pathname === '/cart/add.js') return new Response('{}', { status: 200, headers: { 'set-cookie': 'cart=c9; path=/' } });
    if (url.pathname === '/cart/update.js') {
      discount = JSON.parse(init.body).discount;
      const ok = discount === 'SAVE15';
      return Response.json({ total_discount: 500 + (ok ? 3735 : 0), discount_codes: discount ? [{ code: discount, applicable: ok }] : [] });
    }
    if (url.pathname === '/cart/clear.js') return Response.json({});
    return new Response('nope', { status: 404 });
  };
  return { log, fetchImpl };
}

test('each code tried in a fresh cart for this item, by the store’s own count; the cart is cleared', async () => {
  const s = storefront();
  const r = await cartTryCodes(BOOTS, 12, [{ code: 'WELCOME10' }, { code: 'SAVE15' }], { fetchImpl: s.fetchImpl, allowPrivate: true });
  assert.deepEqual(r, [{ code: 'WELCOME10', applies: false, cents_off: 0 }, { code: 'SAVE15', applies: true, cents_off: 3735 }], 'an automatic $5 already on the cart doesn’t count');
  assert.deepEqual(JSON.parse(s.log.find((x) => x[1] === '/cart/add.js')[2]), { items: [{ id: 12, quantity: 1 }] });
  assert.equal(s.log.at(-1)[1], '/cart/clear.js');
});

test('for a card: working codes best first; non-Shopify stores get codes to try; checkout gets the working one first', async () => {
  const db = openDb(':memory:');
  let finds = 0;
  const s = storefront();
  const p = createPromos({ db, env: {}, find: async (site) => (finds++, site === 'tecovas.com' ? codesFrom(FOUND, site) : codesFrom({ codes: [{ code: 'TAKE10' }] }, site)), tryCodes: (u, id, codes) => cartTryCodes(u, id, codes, { fetchImpl: s.fetchImpl, allowPrivate: true }), product: async (u) => (u.includes('tecovas') ? product() : null) });
  const r = await p.forItem({ url: BOOTS, store: 'Tecovas' });
  assert.deepEqual(r.working.map((w) => [w.code, w.cents_off]), [['SAVE15', 3735]]);
  assert.equal(r.found, 2);
  assert.deepEqual(await p.forCart({ merchant: { url: 'https://www.tecovas.com' }, items: [{ url: BOOTS }] }), ['SAVE15', 'WELCOME10']);
  assert.equal(finds, 1, 'kept twelve hours per store');
  const other = await p.forItem({ url: 'https://other.com/p/1', store: 'Other' });
  assert.deepEqual(other, { found: 1, working: [], untested: [{ code: 'TAKE10', description: '' }] });
  assert.deepEqual(await createPromos({ db, env: { SPOT_PROMO_CODES: '0' } }).forItem({ url: BOOTS }), { off: true });
  assert.deepEqual(await createPromos({ db, env: { SPOT_PROMO_CODES: '0' } }).forCart({ items: [{ url: BOOTS }] }), []);
});

test('POST /v1/promos: a product link only', async (t) => {
  const s = storefront();
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: {}, capture: { product, promoFind: async (site) => codesFrom(FOUND, site), promoTry: (u, id, codes) => cartTryCodes(u, id, codes, { fetchImpl: s.fetchImpl, allowPrivate: true }) } });
  t.after(() => a.close());
  const call = async (payload) => {
    const r = await a.inject({ method: 'POST', url: '/v1/promos', payload });
    return { status: r.statusCode, body: r.json() };
  };
  assert.equal((await call({ url: 'javascript:1' })).status, 400);
  const r = await call({ url: BOOTS, store: 'Tecovas' });
  assert.equal(r.status, 200);
  assert.equal(r.body.promos.working[0].code, 'SAVE15');
});
