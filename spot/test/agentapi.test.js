import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const env = { SPOT_API_KEYS: 'claude:s3cret-a, shopbot:s3cret-b' };
const items = [{ title: 'Dunk Low', variant: '10.5', quantity: 1, price_cents: 11500, url: 'https://www.nike.com/t/dunk-low' }];
const shipping = { name: 'Kyle Riggle', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'kyle@example.com' };

function app(t, extra = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, ...extra });
  t.after(() => a.close());
  return a;
}
const auth = (key) => ({ authorization: `Bearer ${key}` });

test('REST: an agent creates an ask, tracks it, and orders it once paid', async (t) => {
  const a = app(t);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/agent/asks', payload: {} })).statusCode, 401);
  assert.equal((await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('nope'), payload: {} })).statusCode, 401);

  const r = await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('s3cret-a'), payload: { requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items } });
  assert.equal(r.statusCode, 201);
  const ask = r.json();
  assert.equal(ask.status, 'open');
  assert.match(ask.link, /\/c\/[\w-]{12}$/);
  assert.match(ask.share_message, /^psst… can you spot me\? 👀 Dunk Low from Nike\n/);
  assert.match(ask.requester_page, /\/manage\?k=/);
  assert.match(ask.next_step, /Send the link/);

  // Another agent can't see it.
  assert.equal((await a.inject({ method: 'GET', url: `/v1/agent/asks/${ask.ask_id}`, headers: auth('s3cret-b') })).statusCode, 404);
  // Can't order before anyone pays.
  assert.equal((await a.inject({ method: 'POST', url: `/v1/agent/asks/${ask.ask_id}/order`, headers: auth('s3cret-a'), payload: { shipping } })).statusCode, 409);

  await a.inject({ method: 'POST', url: `/v1/carts/${ask.ask_id}/sandbox-pay`, payload: { payer_name: 'Mom' } });
  const paid = (await a.inject({ method: 'GET', url: `/v1/agent/asks/${ask.ask_id}`, headers: auth('s3cret-a') })).json();
  assert.equal(paid.status, 'card_issued');
  assert.equal(paid.payer_name, 'Mom');
  assert.match(paid.next_step, /order_spot_ask/);
  assert.equal(paid.requester_page, undefined, 'the private page is only handed out once');

  // Agent is off on this server, so ordering hands back a prefilled manual path.
  const o = (await a.inject({ method: 'POST', url: `/v1/agent/asks/${ask.ask_id}/order`, headers: auth('s3cret-a'), payload: { shipping } })).json();
  assert.equal(o.order.state, 'needs_you');
  assert.match(o.next_step, /check out themselves/);
});

test('REST: a description it cannot price comes back as a draft to complete', async (t) => {
  const a = app(t, { capture: { fromText: async () => ({ merchant: { name: '' }, items: [{ title: 'xt-6', quantity: 1, price_cents: null }] }) } });
  const r = await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('s3cret-a'), payload: { requester: { name: 'Kyle' }, text: 'salomon xt-6' } });
  assert.equal(r.statusCode, 422);
  assert.equal(r.json().draft.items[0].title, 'xt-6');
});

test('MCP: tools are listed and callable over streamable HTTP', async (t) => {
  const a = app(t);
  await a.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${a.server.address().port}`;

  const connect = async (key) => {
    const c = new Client({ name: 'test-agent', version: '1.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: auth(key) } }));
    t.after(() => c.close());
    return c;
  };
  await assert.rejects(connect('wrong'), /401|Bad API key|Unauthorized/i);

  const c = await connect('s3cret-a');
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ['create_spot_ask', 'get_spot_ask', 'order_spot_ask']);
  assert.ok(tools.find((x) => x.name === 'order_spot_ask').inputSchema.properties.shipping);

  const created = await c.callTool({ name: 'create_spot_ask', arguments: { requester_name: 'Kyle', merchant_name: 'Nike', merchant_url: 'https://www.nike.com', items, note: 'birthday 🎂' } });
  assert.ok(!created.isError, JSON.stringify(created.content));
  const ask = created.structuredContent;
  assert.equal(ask.total_cents, 11960);
  assert.match(ask.share_card_url, /\/card\.png$/);

  const got = await c.callTool({ name: 'get_spot_ask', arguments: { ask_id: ask.ask_id } });
  assert.equal(got.structuredContent.status, 'open');

  const early = await c.callTool({ name: 'order_spot_ask', arguments: { ask_id: ask.ask_id, shipping } });
  assert.equal(early.isError, true);
  assert.match(early.content[0].text, /card has to be ready/);

  const other = await connect('s3cret-b');
  const hidden = await other.callTool({ name: 'get_spot_ask', arguments: { ask_id: ask.ask_id } });
  assert.equal(hidden.isError, true);

  const r = await fetch(`${base}/mcp`, { headers: auth('s3cret-a') });
  assert.equal(r.status, 405);
});
