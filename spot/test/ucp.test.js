import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { payableHandler, pickVariant } from '../src/fulfill/ucp.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const shipping = { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'kyle@example.com', phone: '+15125550100' };

// A store that speaks UCP: discovery, catalog lookup, checkout with
// shipping options, a tokenizer, and completion. `mcp: true` serves it the
// way Shopify does: over MCP only, with a catalog that looks items up by
// Shopify id rather than by link (and /products/<handle>.js for the ids).
async function startUcpStore({ tokenizer = true, continueUrl = null, catalog = true, mcp = false } = {}) {
  const log = [];
  let origin;
  const sessions = new Map();
  const view = (co) => ({
    ucp: {
      version: '2026-08-25',
      capabilities: { 'dev.ucp.shopping.checkout': [{ version: '2026-08-25' }] },
      payment_handlers: tokenizer
        ? { 'com.example.processor_tokenizer': [{ id: 'proc_1', version: '2026-08-25', available_instruments: [{ type: 'card' }], config: { environment: 'sandbox', business_id: 'merchant_42', endpoint: `${origin}/tok` } }] }
        : { 'com.google.pay': [{ id: 'gpay', version: '2026-08-25', available_instruments: [{ type: 'card' }], config: {} }] },
    },
    links: [{ type: 'terms_of_service', url: `${origin}/terms` }],
    currency: 'USD',
    continue_url: continueUrl ?? `${origin}/checkout/${co.id}`,
    ...co,
  });
  const tools = { lookup_catalog: ['POST', () => '/ucp/catalog/lookup', (a) => a.catalog], create_checkout: ['POST', () => '/ucp/checkout-sessions', (a) => a.checkout], get_checkout: ['GET', (a) => `/ucp/checkout-sessions/${a.id}`], update_checkout: ['PUT', (a) => `/ucp/checkout-sessions/${a.id}`, (a) => a.checkout], complete_checkout: ['POST', (a) => `/ucp/checkout-sessions/${a.id}/complete`, (a) => a.checkout], cancel_checkout: ['POST', (a) => `/ucp/checkout-sessions/${a.id}/cancel`, () => ({})] };
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    let body = raw ? JSON.parse(raw) : undefined;
    let rpc = null;
    // MCP: one endpoint; each call is logged as the REST route it stands for.
    if (mcp && req.url === '/api/ucp/mcp') {
      rpc = body;
      const [method, path, args = () => undefined] = tools[rpc.params.name];
      req.method = method;
      req.url = path(rpc.params.arguments);
      body = args(rpc.params.arguments);
      req.headers['idempotency-key'] = rpc.params.arguments.meta['idempotency-key'];
      req.headers['request-id'] = rpc.id;
      req.headers.meta = rpc.params.arguments.meta;
    }
    log.push({ method: req.method, url: req.url, headers: req.headers, body, mcp: Boolean(rpc) });
    const send = (code, obj) => {
      res.writeHead(rpc ? 200 : code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rpc ? { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: obj, content: [{ type: 'text', text: JSON.stringify(obj) }] } } : obj));
    };
    if (req.url.startsWith('/search/suggest.json')) {
      return send(200, { resources: { results: { products: [{ title: 'Super Puff Lite', url: '/products/puffer-lite?_pos=1' }, { title: 'Super Puff', url: '/products/puffer?_pos=2&_psq=x' }] } } });
    }
    if (mcp && req.url === '/products/puffer.js') {
      return send(200, { id: 9001, title: 'Super Puff', variants: [{ id: 111, title: 'Black / S', option1: 'Black', option2: 'S', available: true, price: 25000 }, { id: 222, title: 'Black / M', option1: 'Black', option2: 'M', available: true, price: 25000 }] });
    }
    if (req.url === '/.well-known/ucp') {
      return send(200, {
        ucp: {
          version: '2026-08-25',
          services: { 'dev.ucp.shopping': mcp ? [{ version: '2026-08-25', transport: 'mcp', endpoint: `${origin}/api/ucp/mcp` }, { version: '2026-08-25', transport: 'embedded' }] : [{ version: '2026-08-25', transport: 'rest', endpoint: `${origin}/ucp/` }] },
          capabilities: {
            'dev.ucp.shopping.checkout': [{ version: '2026-08-25' }],
            'dev.ucp.shopping.fulfillment': [{ version: '2026-08-25' }],
            ...(catalog ? { 'dev.ucp.shopping.catalog.lookup': [{ version: '2026-08-25' }] } : {}),
          },
          payment_handlers: {},
        },
      });
    }
    if (req.url === '/ucp/catalog/lookup') {
      return send(200, {
        ucp: { version: '2026-08-25' },
        products: body.ids.filter((id) => !mcp && id.includes('/products/puffer')).map((id) => ({
          id: 'prod_puffer',
          title: 'Super Puff',
          variants: [
            { id: 'var_black_s', title: 'Black / S', inputs: [{ id, match: 'featured' }], availability: { available: true } },
            { id: 'var_black_m', title: 'Black / M', inputs: [{ id, match: 'featured' }], availability: { available: true } },
          ],
        })),
      });
    }
    if (req.method === 'POST' && req.url === '/ucp/checkout-sessions') {
      const co = { id: `chk_${sessions.size + 1}`, status: 'incomplete', line_items: body.line_items.map((l, i) => ({ id: `li_${i}`, item: { id: l.item.id, title: 'Super Puff', price: 25000 }, quantity: l.quantity })), totals: [{ type: 'subtotal', amount: 25000 }, { type: 'total', amount: 25000 }] };
      sessions.set(co.id, co);
      return send(201, view(co));
    }
    const m = req.url.match(/^\/ucp\/checkout-sessions\/([^/]+)(\/complete|\/cancel)?$/);
    if (m) {
      const co = sessions.get(m[1]);
      if (req.method === 'GET' && !m[2]) return send(200, view(co));
      if (req.method === 'PUT') {
        const method = body.fulfillment.methods[0];
        const picked = method.groups?.[0]?.selected_option_id;
        const dest = { id: 'dest_1', type: 'shipping_address', ...method.destinations[0] };
        const ship = picked === 'express' ? 1500 : 800;
        Object.assign(co, {
          status: picked ? 'ready_for_complete' : 'incomplete',
          fulfillment: { methods: [{ id: 'ship_1', type: 'shipping', line_item_ids: ['li_0'], selected_destination_id: 'dest_1', destinations: [dest], groups: [{ id: 'pkg_1', ...(picked ? { selected_option_id: picked } : {}), options: [{ id: 'express', title: 'Express', totals: [{ type: 'total', amount: 1500 }] }, { id: 'standard', title: 'Standard', totals: [{ type: 'total', amount: 800 }] }] }] }] },
          totals: picked ? [{ type: 'subtotal', amount: 25000 }, { type: 'fulfillment', amount: ship }, { type: 'tax', amount: 1100 }, { type: 'total', amount: 25000 + ship + 1100 }] : co.totals,
        });
        return send(200, view(co));
      }
      if (m[2] === '/complete') {
        Object.assign(co, { status: 'completed', order: { id: 'ord_777', permalink_url: `${origin}/orders/ord_777` } });
        return send(200, view(co));
      }
      if (m[2] === '/cancel') {
        co.status = 'canceled';
        return send(200, view(co));
      }
    }
    if (req.url === '/tok/tokenize') return send(200, { token: 'tok_from_store' });
    // The store's own checkout page: the payer pays the store here.
    const pay = req.url.match(/^\/checkout\/([^/]+)\/pay$/);
    if (pay && req.method === 'POST') {
      const co = sessions.get(pay[1]);
      Object.assign(co, { status: 'completed', order: { id: 'ord_888', permalink_url: `${origin}/orders/ord_888` } });
      return send(200, view(co));
    }
    send(404, { code: 'not_found', content: 'nope' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, log, close: () => new Promise((r) => server.close(r)) };
}

async function setup(t, store, { agent = false } = {}) {
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: agent ? 'on' : 'off', PUBLIC_URL: 'https://spot.example' }, fulfill: { ucp: { allowPrivate: true } } });
  t.after(async () => {
    await app.close();
    await store.close();
  });
  const call = async (method, url, payload) => (await app.inject({ method, url, payload })).json();
  const made = await call('POST', '/v1/carts', {
    requester: { name: 'Kyle Riggle' },
    merchant: { name: 'Puff Co', url: store.origin },
    items: [{ title: 'Super Puff', variant: 'Black / M', quantity: 1, price_cents: 25000, url: `${store.origin}/products/puffer` }],
    extras_cents: 2500,
  });
  const token = made.cart.token;
  const k = made.manage_key;
  await call('POST', `/v1/carts/${token}/sandbox-pay`, { payer_name: 'Mom' });
  const state = async () => (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).cart.fulfillment;
  const until = async (want) => {
    for (let i = 0; i < 100; i++) {
      const f = await state();
      if (f && want.includes(f.state)) return f;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`never reached ${want}: ${JSON.stringify(await state())}`);
  };
  return { app, call, token, k, until };
}

test('Spot publishes a UCP platform profile', async (t) => {
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(() => app.close());
  const p = (await app.inject({ method: 'GET', url: '/.well-known/ucp' })).json();
  assert.match(p.ucp.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.ucp.services['dev.ucp.shopping'][0].transport, 'rest');
  assert.ok(p.ucp.capabilities['dev.ucp.shopping.checkout']);
  assert.equal(p.ucp.capabilities['dev.ucp.shopping.fulfillment'][0].extends, 'dev.ucp.shopping.checkout');
  assert.deepEqual(p.ucp.payment_handlers, {});
});

test('UCP store: ordered through its checkout API, no browser, agent off', async (t) => {
  const store = await startUcpStore();
  const { call, token, k, until } = await setup(t, store);
  await call('POST', `/v1/carts/${token}/manage/order`, { k, shipping });
  const waiting = await until(['awaiting_confirm', 'needs_you']);
  assert.equal(waiting.state, 'awaiting_confirm', JSON.stringify(waiting));
  assert.equal(waiting.method, 'ucp');
  assert.equal(waiting.total_cents, 25000 + 800 + 1100, 'cheapest shipping picked');
  assert.match(waiting.summary, /shipping \$8\.00 · tax \$11\.00/);

  // Nothing is paid before the requester taps Place order.
  assert.ok(!store.log.some((r) => r.url.endsWith('/complete') || r.url.startsWith('/tok')));
  await call('POST', `/v1/carts/${token}/manage/order/confirm`, { k, place: true });
  const done = await until(['placed', 'needs_you']);
  assert.equal(done.state, 'placed', JSON.stringify(done));
  assert.equal(done.order_number, 'ord_777');
  assert.equal(done.order_url, `${store.origin}/orders/ord_777`);

  const reqs = store.log.filter((r) => r.url.startsWith('/ucp/'));
  for (const r of reqs) {
    assert.equal(r.headers['ucp-agent'], 'profile="https://spot.example/.well-known/ucp"');
    assert.ok(r.headers['request-id']);
    if (r.method !== 'GET') assert.ok(r.headers['idempotency-key']);
  }
  const lookup = reqs.find((r) => r.url === '/ucp/catalog/lookup');
  assert.deepEqual(lookup.body.ids, [`${store.origin}/products/puffer`]);
  const create = reqs.find((r) => r.method === 'POST' && r.url === '/ucp/checkout-sessions');
  assert.deepEqual(create.body.line_items, [{ item: { id: 'var_black_m' }, quantity: 1 }], 'matched Black / M');
  assert.equal(create.body.buyer.email, 'kyle@example.com');
  const [setAddr, pick] = reqs.filter((r) => r.method === 'PUT');
  assert.deepEqual(setAddr.body.fulfillment.methods[0].destinations[0], { first_name: 'Kyle', last_name: 'Riggle', street_address: '1 Main St', address_locality: 'Austin', address_region: 'TX', postal_code: '78701', address_country: 'US', phone_number: '+15125550100' });
  assert.equal(pick.body.fulfillment.methods[0].selected_destination_id, 'dest_1');
  assert.deepEqual(pick.body.fulfillment.methods[0].groups, [{ id: 'pkg_1', selected_option_id: 'standard' }]);
  assert.deepEqual(pick.body.line_items, [{ id: 'li_0', item: { id: 'var_black_m' }, quantity: 1 }], 'PUT resends full state');

  const tok = store.log.find((r) => r.url === '/tok/tokenize');
  assert.equal(tok.body.credential.type, 'pan');
  assert.match(tok.body.credential.number, /^\d{16}$/);
  assert.deepEqual(tok.body.binding, { type: 'dev.ucp.shopping.checkout', id: 'chk_1' });
  assert.deepEqual(tok.body.identity, { access_token: 'merchant_42' });
  const complete = reqs.find((r) => r.url.endsWith('/complete'));
  const inst = complete.body.payment.instruments[0];
  assert.equal(inst.handler_id, 'proc_1');
  assert.deepEqual(inst.credential, { type: 'token', token: 'tok_from_store' });
  assert.ok(!JSON.stringify(complete.body).includes(tok.body.credential.number), 'the card number only goes to the tokenizer');
});

test('UCP store with no handler Spot can pay: needs a retry (no card is handed out)', async (t) => {
  const store = await startUcpStore({ tokenizer: false });
  const { call, token, k, until } = await setup(t, store);
  await call('POST', `/v1/carts/${token}/manage/order`, { k, shipping });
  const f = await until(['needs_you', 'awaiting_confirm']);
  assert.equal(f.state, 'needs_you');
  assert.equal(f.method, 'ucp');
  assert.equal(f.manual_url, `${store.origin}/checkout/chk_1`);
  assert.match(f.reason, /can't take Spot's card automatically/);
});

test('UCP links are web links only', async (t) => {
  const store = await startUcpStore({ tokenizer: false, continueUrl: 'javascript:alert(1)' });
  const { call, token, k, until } = await setup(t, store);
  await call('POST', `/v1/carts/${token}/manage/order`, { k, shipping });
  const f = await until(['needs_you']);
  assert.equal(f.manual_url, null);
});

test('items the UCP catalog does not know fall back to the usual route', async (t) => {
  const store = await startUcpStore({ catalog: false });
  const { call, token, k, until } = await setup(t, store);
  await call('POST', `/v1/carts/${token}/manage/order`, { k, shipping });
  const f = await until(['needs_you']);
  assert.equal(f.method, 'agent');
  assert.match(f.reason, /Automatic ordering is off/);
  assert.ok(!store.log.some((r) => r.url === '/ucp/checkout-sessions'), 'no checkout was opened');
});

test('variant picking and handler choice', () => {
  const product = { variants: [{ id: 'a', title: 'Cream / M', inputs: [{ id: 'u', match: 'featured' }] }, { id: 'b', title: 'Black / M', inputs: [{ id: 'u', match: 'featured' }] }, { id: 'c', title: 'Black / L', availability: { available: false } }] };
  assert.equal(pickVariant(product, { variant: 'm black' }, 'u').id, 'b');
  assert.equal(pickVariant(product, { variant: 'Black / L' }, 'u'), null, 'sold out');
  assert.equal(pickVariant(product, { variant: null }, 'u').id, 'a', 'featured when no variant asked for');
  assert.equal(pickVariant({ variants: [{ id: 'x', inputs: [{ id: 'u', match: 'exact' }] }] }, { variant: 'whatever' }, 'u').id, 'x');
  assert.equal(payableHandler({ ucp: { payment_handlers: { g: [{ id: 'g', available_instruments: [{ type: 'card' }], config: {} }] } } }), null);
  assert.equal(payableHandler({ ucp: { payment_handlers: { p: [{ id: 'p', available_instruments: [{ type: 'card' }], config: { endpoint: 'https://t.example/' } }] } } }).endpoint, 'https://t.example');
});


// ─── Pay the store directly ────────────────────────────────────────────────
async function directSetup(t, store) {
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { PUBLIC_URL: 'https://spot.example' }, fulfill: { ucp: { allowPrivate: true } } });
  t.after(async () => {
    await app.close();
    await store.close();
  });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { app, call };
}
const directCart = (origin, patch = {}) => ({
  requester: { name: 'Kyle Riggle' },
  merchant: { name: 'Puff Co', url: origin },
  items: [{ title: 'Super Puff', variant: 'Black / M', quantity: 1, price_cents: 25000, url: `${origin}/products/puffer` }],
  extras_cents: 2500,
  settle: 'direct',
  ...patch,
});

test('pay the store directly: Spot builds the store’s checkout, the payer pays the store, Spot never holds the money', async (t) => {
  const store = await startUcpStore();
  const { app, call } = await directSetup(t, store);
  assert.deepEqual((await call('GET', `/v1/stores/check?url=${encodeURIComponent(store.origin)}`)).body, { pay_at_store: true });

  const made = (await call('POST', '/v1/carts', directCart(store.origin))).body;
  assert.equal(made.cart.fee_cents, 0, 'no Spot fee: the store is the seller');
  assert.equal(made.cart.cushion_cents, 0);
  assert.equal(made.cart.total_cents, 27500);
  const { token } = made.cart;
  const k = made.manage_key;

  // Not payable until the requester says where it ships.
  let page = await call('GET', `/c/${token}`);
  assert.match(page.body, /Waiting for Kyle Riggle to add where it ships/);
  assert.equal((await call('POST', `/v1/carts/${token}/direct/start`, {})).status, 409);
  assert.equal((await call('POST', `/v1/carts/${token}/sandbox-pay`, {})).status, 409, 'Spot never takes this payment');
  await call('POST', `/v1/carts/${token}/manage/prepare`, { k, shipping });

  page = await call('GET', `/c/${token}`);
  assert.match(page.body, /Pay Puff Co \$275\.00/);
  assert.match(page.body, /Spot never touches your money and adds no fee/);

  const started = await call('POST', `/v1/carts/${token}/direct/start`, { name: 'Mom', email: 'Mom@Example.com' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.continue_url, `${store.origin}/checkout/chk_1`, 'the payer goes to the store’s own checkout');
  assert.equal(started.body.total_cents, 25000 + 800 + 1100, 'the store’s real total, cheapest shipping');
  const created = store.log.find((r) => r.method === 'POST' && r.url === '/ucp/checkout-sessions');
  assert.equal(created.body.buyer.email, 'mom@example.com', 'the payer is the buyer, so the store emails them its receipt');
  const put = store.log.filter((r) => r.method === 'PUT').at(-1);
  assert.equal(put.body.fulfillment.methods[0].destinations[0].street_address, '1 Main St', 'shipped to the requester');
  assert.ok(!store.log.some((r) => r.url === '/tok/tokenize' || r.url.endsWith('/complete')), 'Spot never pays or completes: the payer does, on the store’s page');

  // Starting again reuses the same checkout.
  assert.equal((await call('POST', `/v1/carts/${token}/direct/start`, {})).body.continue_url, started.body.continue_url);
  assert.equal((await call('GET', `/v1/carts/${token}/direct/status`)).body.cart.status, 'open');

  // The payer pays on the store's page; Spot's sweep notices.
  await fetch(`${store.origin}/checkout/chk_1/pay`, { method: 'POST' });
  await app.spot.sweepDirect();
  const mine = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body;
  assert.equal(mine.cart.status, 'completed');
  assert.equal(mine.cart.payer_name, 'Mom');
  assert.equal(mine.cart.fulfillment.state, 'placed');
  assert.equal(mine.cart.fulfillment.method, 'direct');
  assert.equal(mine.cart.fulfillment.order_number, 'ord_888');
  assert.equal(mine.cart.card_ready, false, 'no card was ever issued');
});

test('pay the store directly: only for stores that take UCP checkout', async (t) => {
  const store = await startUcpStore();
  const { call } = await directSetup(t, store);
  const r = await call('POST', '/v1/carts', directCart('http://127.0.0.1:1', {}));
  assert.equal(r.status, 409);
  assert.match(r.body.error, /doesn’t take direct checkout/);
  assert.equal((await call('POST', '/v1/carts', directCart(store.origin, { merchant: { name: 'Puff Co' } }))).status, 409, 'needs the store’s website');
});

// Shopify stores serve UCP over MCP only, and their catalog looks items up
// by Shopify id, so Spot resolves product links through /products/<handle>.js.
test('Shopify-style store (UCP over MCP): ordered through its checkout tools', async (t) => {
  const store = await startUcpStore({ mcp: true });
  const { call, token, k, until } = await setup(t, store);
  await call('POST', `/v1/carts/${token}/manage/order`, { k, shipping });
  const waiting = await until(['awaiting_confirm', 'needs_you']);
  assert.equal(waiting.state, 'awaiting_confirm', JSON.stringify(waiting));
  assert.equal(waiting.method, 'ucp');
  assert.equal(waiting.total_cents, 25000 + 800 + 1100);
  await call('POST', `/v1/carts/${token}/manage/order/confirm`, { k, place: true });
  const done = await until(['placed', 'needs_you']);
  assert.equal(done.state, 'placed', JSON.stringify(done));
  assert.equal(done.order_number, 'ord_777');

  const calls = store.log.filter((r) => r.mcp);
  assert.ok(calls.length >= 5, 'every checkout step went over MCP');
  for (const r of calls) {
    assert.deepEqual(r.headers.meta['ucp-agent'], { profile: 'https://spot.example/.well-known/ucp' });
    if (r.method !== 'GET') assert.ok(r.headers['idempotency-key']);
  }
  assert.ok(store.log.some((r) => r.url === '/products/puffer.js'), 'looked the link up on the storefront');
  const create = calls.find((r) => r.url === '/ucp/checkout-sessions');
  assert.deepEqual(create.body.line_items, [{ item: { id: 'gid://shopify/ProductVariant/222' }, quantity: 1 }], 'Black / M by Shopify id');
  const [setAddr] = calls.filter((r) => r.method === 'PUT');
  assert.deepEqual(setAddr.body.fulfillment.methods[0].line_item_ids, ['li_0'], 'Shopify needs the lines the address covers');
  assert.ok(calls.some((r) => r.url.endsWith('/complete')));
});

test('Shopify-style store: the payer pays the store directly on its own checkout', async (t) => {
  const store = await startUcpStore({ mcp: true });
  const { app, call } = await directSetup(t, store);
  assert.deepEqual((await call('GET', `/v1/stores/check?url=${encodeURIComponent(store.origin)}`)).body, { pay_at_store: true });
  const made = (await call('POST', '/v1/carts', directCart(store.origin))).body;
  const { token } = made.cart;
  await call('POST', `/v1/carts/${token}/manage/prepare`, { k: made.manage_key, shipping });
  const started = await call('POST', `/v1/carts/${token}/direct/start`, { name: 'Mom', email: 'mom@example.com' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.continue_url, `${store.origin}/checkout/chk_1`);
  assert.ok(store.log.filter((r) => r.url.startsWith('/ucp/')).every((r) => r.mcp));

  await fetch(`${store.origin}/checkout/chk_1/pay`, { method: 'POST' });
  await app.spot.sweepDirect();
  const mine = (await call('GET', `/v1/carts/${token}/manage?k=${made.manage_key}`)).body;
  assert.equal(mine.cart.status, 'completed', 'status checks go over MCP too');
  assert.equal(mine.cart.fulfillment.order_number, 'ord_888');
});

test('Shopify-style store with no card tokenizer: falls back to ordering through the store page', async (t) => {
  const store = await startUcpStore({ mcp: true, tokenizer: false });
  const { call, token, k, until } = await setup(t, store);
  await call('POST', `/v1/carts/${token}/manage/order`, { k, shipping });
  // Agent off here, so it stops at "needs you" with the store's own checkout.
  const f = await until(['needs_you']);
  assert.equal(f.method, 'ucp');
  assert.equal(f.manual_url, `${store.origin}/checkout/chk_1`);
});

test('signed-in asks use the saved address, so the pay-at-store link works right away; and the requester can pay it themselves', async (t) => {
  const store = await startUcpStore();
  const { app } = await directSetup(t, store);
  const call = async (method, url, payload, headers = {}) => {
    const r = await app.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const start = await call('POST', '/v1/auth/start', { email: 'kyle@example.com' });
  const cookie = (await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: start.body.code })).headers['set-cookie'].split(';')[0];
  await call('POST', '/v1/me', { name: 'Kyle Riggle', shipping: { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701' } }, { cookie });
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'Claude' }, { cookie })).body.api_key;
  const auth = { authorization: `Bearer ${key}` };

  const ask = await call('POST', '/v1/agent/asks', directCart(store.origin), auth);
  assert.equal(ask.status, 201, JSON.stringify(ask.body));
  const token = ask.body.ask_id;
  const page = await call('GET', `/c/${token}`);
  assert.doesNotMatch(page.body, /Waiting for/, 'no waiting on an address the account already has');
  assert.match(page.body, /Pay Puff Co/);
  assert.match(ask.body.requester_page_note, /pay it themselves/);

  // Pay it yourself: the ask becomes the requester's own order.
  const k = new URL(ask.body.requester_page).searchParams.get('k');
  const manage = await call('GET', `/c/${token}/manage?k=${k}`);
  assert.match(manage.body, /Pay it yourself/);
  const claimed = await call('POST', `/v1/carts/${token}/manage/pay-yourself`, { k });
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.equal(claimed.body.cart.for, 'self');
  assert.equal(claimed.body.cart.requester.shipping.line1, '1 Main St');

  // From "Ready for you" on the account page: signed in, no key in the URL.
  const back = await call('POST', `/v1/carts/${token}/manage/reassign`, {}, { cookie });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.cart.for, 'other');
  assert.match(back.body.share_message, /\/c\//);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/pay-yourself`, { k: 'wrong' })).status >= 400, true);
});

test('an older pay-at-store ask picks up the address its owner saved later, so the payer isn’t stuck', async (t) => {
  const store = await startUcpStore();
  const { app } = await directSetup(t, store);
  const call = async (method, url, payload, headers = {}) => {
    const r = await app.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const start = await call('POST', '/v1/auth/start', { email: 'kyle@example.com' });
  const cookie = (await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: start.body.code })).headers['set-cookie'].split(';')[0];
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'Claude' }, { cookie })).body.api_key;
  const ask = await call('POST', '/v1/agent/asks', directCart(store.origin), { authorization: `Bearer ${key}` });
  const token = ask.body.ask_id;
  assert.match((await call('GET', `/c/${token}`)).body, /Waiting for Kyle Riggle to add where it ships/, 'no address saved yet');

  await call('POST', '/v1/me', { shipping: { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701' } }, { cookie });
  const page = await call('GET', `/c/${token}`);
  assert.doesNotMatch(page.body, /Waiting for/);
  assert.match(page.body, /Pay Puff Co/);
});

test('before a link goes out: items are found by name, and a cart the store can’t fill is refused', async (t) => {
  const store = await startUcpStore();
  const { app } = await directSetup(t, store);
  const call = async (method, url, payload, headers = {}) => {
    const r = await app.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  const key = (await call('POST', '/v1/agent/keys', { email: 'dev@example.com', agent_name: 'Claude' })).body.api_key;
  const auth = { authorization: `Bearer ${key}` };
  const named = (title, variant) => directCart(store.origin, { items: [{ title, variant, quantity: 1, price_cents: 25000 }] });

  // No product link: Spot finds it on the store by name (not the Lite).
  const ok = await call('POST', '/v1/agent/asks', named('Super Puff (Black)', 'Black / M'), auth);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const cart = app.spot.load(ok.body.ask_id);
  assert.equal(cart.items[0].url, `${store.origin}/products/puffer`, 'the link it found is kept for checkout');

  // Not on the store: refused with how to fix it, and no link exists.
  const missing = await call('POST', '/v1/agent/asks', named('Mystery Jacket', 'Black / M'), auth);
  assert.equal(missing.status, 422);
  assert.match(missing.body.error, /Couldn’t find "Mystery Jacket" on Puff Co/);

  // On the store, but not in that size: refused too.
  const size = await call('POST', '/v1/agent/asks', directCart(store.origin, { items: [{ title: 'Super Puff', variant: 'Red / XL', quantity: 1, price_cents: 25000, url: `${store.origin}/products/puffer` }] }), auth);
  assert.equal(size.status, 422);
  assert.match(size.body.error, /doesn’t have "Super Puff" in that size or color/);
});

test('size/colour words that are part of the product name don’t block the match', async () => {
  const { matchVariant } = await import('../src/fulfill/shopify.js');
  const variants = [{ id: 1, title: 'Black', option1: 'Black', available: true }, { id: 2, title: 'Blue', option1: 'Blue', available: true }];
  assert.equal(matchVariant(variants, '0.5mm / Black', 'Uni Jetstream Ballpoint Pen - 0.5mm')?.id, 1);
  assert.equal(matchVariant(variants, '0.5mm / Red', 'Uni Jetstream Ballpoint Pen - 0.5mm'), null);
});

test('affiliate links: only when a person goes to the store, disclosed, never on Spot’s own card', async (t) => {
  const { createAffiliate } = await import('../src/affiliate.js');
  const off = createAffiliate({});
  assert.deepEqual(off.wrap('https://shop.example/p'), { url: 'https://shop.example/p', via: null }, 'no key: the link is untouched');
  const sovrn = createAffiliate({ SPOT_AFFILIATE_KEY: 'k1', SPOT_AMAZON_TAG: 'spot-20' });
  assert.equal(sovrn.wrap('https://shop.example/p?x=1', { ref: 'abc' }).url, 'https://redirect.viglink.com?key=k1&u=https%3A%2F%2Fshop.example%2Fp%3Fx%3D1&cuid=abc');
  assert.equal(sovrn.wrap('https://www.amazon.com/dp/B01?th=1').url, 'https://www.amazon.com/dp/B01?th=1&tag=spot-20', 'Amazon gets the Associates tag, not the network');
  assert.match(createAffiliate({ SPOT_AFFILIATE_KEY: 'k1', SPOT_AFFILIATE_NETWORK: 'skimlinks' }).wrap('https://shop.example/p').url, /^https:\/\/go\.skimresources\.com\/\?id=k1&xs=1&url=https%3A%2F%2Fshop\.example%2Fp/);

  // Pay at the store: the payer's trip to the checkout goes through the network.
  const store = await startUcpStore();
  const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { PUBLIC_URL: 'https://spot.example', SPOT_AFFILIATE_KEY: 'k1' }, fulfill: { ucp: { allowPrivate: true } } });
  t.after(async () => {
    await app.close();
    await store.close();
  });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, payload });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const made = (await call('POST', '/v1/carts', directCart(store.origin))).body;
  await call('POST', `/v1/carts/${made.cart.token}/manage/prepare`, { k: made.manage_key, shipping });
  assert.match((await call('GET', `/c/${made.cart.token}`)).body, /Spot may earn a commission from Puff Co\. Your price is the same\./);
  const started = await call('POST', `/v1/carts/${made.cart.token}/direct/start`, { name: 'Mom' });
  assert.equal(started.body.continue_url, `https://redirect.viglink.com?key=k1&u=${encodeURIComponent(`${store.origin}/checkout/chk_1`)}&cuid=${made.cart.token}`);
  const events = (await call('GET', `/v1/carts/${made.cart.token}/manage?k=${made.manage_key}`)).body.events;
  assert.ok(events.some((e) => e.kind === 'affiliate_link'));

  // Spot buys with its own card: no disclosure, no affiliate link anywhere.
  const card = (await call('POST', '/v1/carts', directCart(store.origin, { settle: 'card' }))).body;
  assert.doesNotMatch((await call('GET', `/c/${card.cart.token}`)).body, /commission/);
  assert.equal((await call('GET', `/c/${card.cart.token}/buy/0`)).status, 404);

  // Venmo/Cash App: the requester's own trip to the store carries the tag.
  const h = (await call('POST', '/v1/carts', directCart(store.origin, { settle: 'handoff', requester: { name: 'Kyle', venmo: 'kyle-r' } }))).body;
  const go = await call('GET', `/c/${h.cart.token}/buy/0`);
  assert.equal(go.status, 302);
  assert.match(go.headers.location, /^https:\/\/redirect\.viglink\.com\?key=k1&u=/);
});
