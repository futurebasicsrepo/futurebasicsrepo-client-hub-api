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
  assert.deepEqual(tools.map((x) => x.name).sort(), ['create_flight_ask', 'create_spot_ask', 'get_spot_ask', 'order_spot_ask', 'search_flights']);
  const day = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
  const fares = await c.callTool({ name: 'search_flights', arguments: { origin: 'AUS', destination: 'JFK', departure_date: day } });
  assert.ok(!fares.isError, JSON.stringify(fares.content));
  const trip = await c.callTool({ name: 'create_flight_ask', arguments: { offer_id: fares.structuredContent.offers[0].offer_id, requester_name: 'Kyle' } });
  assert.ok(!trip.isError, JSON.stringify(trip.content));
  assert.match(trip.structuredContent.finish_link, /\/manage\?k=/);
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

test('for_me: agent hands the cart to its user to finish on their phone', async (t) => {
  const sent = [];
  const notifyFetch = async (url, init) => {
    sent.push({ url: String(url), init });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const a = buildApp({
    db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, notifyFetch,
    env: { ...env, RESEND_API_KEY: 're_test', SPOT_FROM_EMAIL: 'Spot <hi@spot.test>', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550000000' },
  });
  t.after(() => a.close());

  const r = await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('s3cret-a'), payload: {
    for: 'self', requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items,
    ship_to: shipping, expires_minutes: 30, notify: { email: 'kyle@example.com', phone: '(512) 555-0100' },
  } });
  assert.equal(r.statusCode, 201, r.body);
  const ask = r.json();
  assert.equal(ask.for, 'self');
  assert.match(ask.finish_link, /\/manage\?k=/);
  assert.equal(ask.requester_page, undefined);
  assert.deepEqual(ask.delivered, { email: 'sent', text: 'sent' });
  assert.match(ask.next_step, /finish on their phone/);
  const minutes = (Date.parse(ask.expires_at) - Date.now()) / 60000;
  assert.ok(minutes > 29 && minutes <= 30, 'expires in 30 minutes');

  // What went out: an email via Resend and a text via Twilio, both carrying the finish link.
  const mail = sent.find((s) => s.url === 'https://api.resend.com/emails');
  assert.equal(mail.init.headers.authorization, 'Bearer re_test');
  const mailBody = JSON.parse(mail.init.body);
  assert.deepEqual(mailBody.to, ['kyle@example.com']);
  assert.ok(mailBody.text.includes(ask.finish_link));
  const text = sent.find((s) => s.url.includes('api.twilio.com'));
  const form = new URLSearchParams(text.init.body);
  assert.equal(form.get('To'), '+15125550100');
  assert.ok(form.get('Body').includes(ask.finish_link));

  // The user opens it: shipping is prefilled from the agent, they pay, the card issues,
  // and ordering starts without another tap (checkout agent off here → a ready checkout link).
  const k = new URL(ask.finish_link).searchParams.get('k');
  const m1 = (await a.inject({ method: 'GET', url: `/v1/carts/${ask.ask_id}/manage?k=${k}` })).json();
  assert.equal(m1.cart.requester.shipping.postal_code, '78701');
  await a.inject({ method: 'POST', url: `/v1/carts/${ask.ask_id}/sandbox-pay`, payload: { payer_name: 'Kyle' } });
  const m2 = (await a.inject({ method: 'GET', url: `/v1/carts/${ask.ask_id}/manage?k=${k}` })).json();
  assert.equal(m2.cart.status, 'card_issued');
  assert.equal(m2.cart.fulfillment.state, 'needs_you');
  assert.ok(m2.events.some((e) => e.kind === 'order_needs_you'), 'ordering started automatically');
});

test('for_me: validation, missing channels, and a timed-out hold', async (t) => {
  const a = app(t);
  const post = (payload) => a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('s3cret-a'), payload: { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items, ...payload } });
  assert.equal((await post({ for: 'self', expires_minutes: 1 })).statusCode, 400);
  const r = (await post({ for: 'self', notify: { email: 'k@example.com', phone: '12' } })).json();
  assert.deepEqual(r.delivered, { email: 'not_configured', text: 'bad_number' }, 'no Resend key here; bad phone is flagged');
  const k = new URL(r.finish_link).searchParams.get('k');
  assert.equal((await a.inject({ method: 'POST', url: `/v1/carts/${r.ask_id}/manage/prepare`, payload: { k, shipping: { name: 'K' } } })).statusCode, 400);
  const page = await a.inject({ method: 'GET', url: `/c/${r.ask_id}/manage?k=${k}` });
  assert.equal(page.statusCode, 200);
});

test('self-serve keys: minted once, work over REST, and have daily quotas', async (t) => {
  const a = app(t, { env: { ...env, SPOT_KEY_ASKS_PER_DAY: '2', SPOT_KEY_MESSAGES_PER_DAY: '1' } });
  assert.equal((await a.inject({ method: 'POST', url: '/v1/agent/keys', payload: { email: 'nope' } })).statusCode, 400);
  const r = await a.inject({ method: 'POST', url: '/v1/agent/keys', payload: { email: 'Dev@Example.com', agent_name: 'Trip Bot!' } });
  assert.equal(r.statusCode, 201);
  const { api_key, name, mcp_url } = r.json();
  assert.match(api_key, /^spot_[\w-]{32}$/);
  assert.match(name, /^trip-bot-[0-9a-f]{6}$/);
  assert.match(mcp_url, /\/mcp$/);

  const ask = (payload) => a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth(api_key), payload });
  const base = { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 11500 }] };
  const first = await ask({ ...base, for: 'self', notify: { email: 'kyle@example.com' } });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().delivered.email, 'not_configured');
  // Messages quota (1) is spent; asks quota (2) is not.
  assert.equal((await ask({ ...base, for: 'self', notify: { email: 'kyle@example.com' } })).statusCode, 429);
  assert.equal((await ask(base)).statusCode, 429, 'the refused ask above still counted');
  const mine = await a.inject({ method: 'GET', url: '/v1/agent/asks/none', headers: auth(api_key) });
  assert.equal(mine.statusCode, 404);
  // Partner keys from SPOT_API_KEYS have no quota, and keys are per agent.
  assert.equal((await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('s3cret-a'), payload: base })).statusCode, 201);
  const id = first.json().ask_id;
  assert.equal((await a.inject({ method: 'GET', url: `/v1/agent/asks/${id}`, headers: auth('s3cret-a') })).statusCode, 404);
  assert.equal((await a.inject({ method: 'GET', url: `/v1/agent/asks/${id}`, headers: auth(api_key) })).statusCode, 200);

  const off = app(t, { env: { ...env, SPOT_OPEN_KEYS: 'off' } });
  assert.equal((await off.inject({ method: 'POST', url: '/v1/agent/keys', payload: { email: 'dev@example.com' } })).statusCode, 404);
});

test('custom domain: page views move to PUBLIC_URL, APIs and webhooks do not', async (t) => {
  const a = app(t, { env: { ...env, PUBLIC_URL: 'https://spotmeplease.com', MCP_REGISTRY_AUTH: 'v=MCPv1; k=ed25519; p=abc' } });
  const get = (host, url, method = 'GET') => a.inject({ method, url, headers: { host } });
  let r = await get('www.spotmeplease.com', '/new?x=1');
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location, 'https://spotmeplease.com/new?x=1');
  r = await get('spot-production-7896.up.railway.app', '/c/abc');
  assert.equal(r.headers.location, 'https://spotmeplease.com/c/abc');
  assert.notEqual((await get('spotmeplease.com', '/')).statusCode, 301);
  assert.equal((await get('spot-production-7896.up.railway.app', '/health')).statusCode, 200);
  assert.notEqual((await get('www.spotmeplease.com', '/v1/carts/abc')).statusCode, 301);
  assert.notEqual((await get('spot-production-7896.up.railway.app', '/v1/webhooks/stripe', 'POST')).statusCode, 301);
  assert.notEqual((await get('other.example', '/')).statusCode, 301);
  r = await get('spotmeplease.com', '/.well-known/mcp-registry-auth');
  assert.equal(r.body, 'v=MCPv1; k=ed25519; p=abc');
});

test('texts: branded, say how to opt out, and STOP replies stop them', async (t) => {
  const { createHmac } = await import('node:crypto');
  const sent = [];
  const notifyFetch = async (url, init) => {
    sent.push(new URLSearchParams(String(init.body)).get('Body'));
    return new Response('{}', { status: 200 });
  };
  const twilio = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15125550000', PUBLIC_URL: 'https://spotmeplease.com' };
  const a = app(t, { notifyFetch, env: { ...env, ...twilio } });
  const base = { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk', price_cents: 11500 }], for: 'self' };
  const ask = () => a.inject({ method: 'POST', url: '/v1/agent/asks', headers: auth('s3cret-a'), payload: { ...base, notify: { phone: '512-555-0100' } } });

  assert.equal((await ask()).json().delivered.text, 'sent');
  assert.match(sent[0], /^Spot: Your cart is ready/);
  assert.match(sent[0], /Reply STOP to opt out\.$/);

  const inbound = (body, sign = true) => {
    const params = Object.keys(body).sort().map((k) => k + body[k]).join('');
    const sig = createHmac('sha1', 'tok').update('https://spotmeplease.com/v1/webhooks/twilio' + params).digest('base64');
    return a.inject({ method: 'POST', url: '/v1/webhooks/twilio', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(sign ? { 'x-twilio-signature': sig } : {}) }, payload: new URLSearchParams(body).toString() });
  };
  assert.equal((await inbound({ From: '+15125550100', Body: 'STOP' }, false)).statusCode, 403, 'unsigned is refused');
  const stop = await inbound({ From: '+15125550100', Body: ' Stop ' });
  assert.equal(stop.statusCode, 200);
  assert.match(stop.body, /<Response><\/Response>/);
  assert.equal((await ask()).json().delivered.text, 'opted_out');
  assert.equal(sent.length, 1, 'nothing sent after STOP');
  await inbound({ From: '+15125550100', Body: 'start' });
  assert.equal((await ask()).json().delivered.text, 'sent');
});

test('terms and privacy pages', async (t) => {
  const a = app(t, { env: { ...env, SPOT_LEGAL_NAME: 'The Future Basics LLC' } });
  const terms = await a.inject({ method: 'GET', url: '/terms' });
  assert.equal(terms.statusCode, 200);
  assert.match(terms.body, /The Future Basics LLC/);
  assert.match(terms.body, /Reply <b>STOP<\/b>|reply <b>STOP<\/b>/);
  const privacy = await a.inject({ method: 'GET', url: '/privacy' });
  assert.match(privacy.body, /No mobile information will be shared with third parties or affiliates for marketing or promotional purposes/);
});
