// Fast lookups: picks stream to the shelf as the model writes them; store
// checks follow as updates; a quicker model with a fallback; recent answers
// cached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { Anthropic } from '../src/anthropic.js';
import { JsonObjects, lookupCache, streamLookup } from '../src/capture.js';

test('complete objects come out of a half-written answer as their last brace lands', () => {
  const j = new JsonObjects();
  const answer = '{"kind": "products", "products": [{"title": "A {not a brace}", "url": "https://a"}, {"title": "B", "nested": {"x": 1}}, {"title": "C"';
  const got = [];
  for (const chunk of answer.match(/.{1,7}/gs)) got.push(...j.push(chunk));
  assert.deepEqual(got.map((s) => JSON.parse(s).title), ['A {not a brace}', 'B'], 'C is not finished yet');
  assert.deepEqual(j.push('}]}').map((s) => JSON.parse(s).title), ['C']);
  // Outfits are whole looks; a bare list works too.
  const k = new JsonObjects();
  assert.deepEqual(k.push('{"outfits":[{"name":"L","items":[{"title":"a"},{"title":"b"}]}]}').map((s) => JSON.parse(s).name), ['L']);
  assert.deepEqual(new JsonObjects().push('[{"title":"x"},{"title":"y"}]').map((s) => JSON.parse(s).title), ['x', 'y']);
});

// A fake streaming model: emits a search, then the answer in small chunks.
function streamer(answers, { fail = null } = {}) {
  const calls = [];
  const client = { beta: { messages: { stream: (params) => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const n = calls.length;
    const handlers = {};
    return {
      on(ev, cb) {
        (handlers[ev] ||= []).push(cb);
        return this;
      },
      async finalMessage() {
        if (fail && fail(n, params)) throw fail(n, params);
        // { parts: [...] }: a search before each part, the answer written as it's found.
        const a = answers[n - 1];
        const parts = a?.parts || [typeof a === 'string' ? a : JSON.stringify(a ?? { products: [] })];
        const text = parts.join('');
        for (const part of parts) {
          for (const cb of handlers.streamEvent || []) cb({ type: 'content_block_start', content_block: { type: 'server_tool_use' } });
          for (const chunk of part.match(/.{1,9}/gs) || []) for (const cb of handlers.text || []) cb(chunk);
        }
        return { stop_reason: 'end_turn', model: params.model, usage: {}, content: [{ type: 'text', text }] };
      },
    };
  } } } };
  return { client, calls };
}
const P = (n, store = 's') => ({ merchant_name: store, merchant_url: `https://${store}.example`, product_url: `https://${store}.example/p${n}`, title: `Tee ${n}`, unit_price: `$${n}0`, image_url: `https://cdn.example/${n}.jpg` });
const slowPage = (ms, out = []) => async (u) => {
  await new Promise((r) => setTimeout(r, ms));
  return { items: [{ title: 'x', image_url: `${u}.jpg` }], offers: [{ words: new Set(), in: !out.includes(u) }] };
};
const noShopify = async () => null;

test('picks go out before their store checks; checks follow as updates; then done', async () => {
  const { client, calls } = streamer([{ kind: 'products', products: [P(1), P(2, 'gap'), P(3, 'nike')] }]);
  const events = [];
  await streamLookup('black tee', { client, fromUrl: slowPage(30, ['https://gap.example/p2']), product: noShopify, sizes: 'tops M', shipTo: 'Austin, TX' }, (e) => events.push(e));
  const types = events.map((e) => e.type);
  assert.equal(types[0], 'searching');
  assert.deepEqual(types.slice(1, 4), ['pick', 'pick', 'pick'], 'every pick is out before any check comes back');
  assert.equal(events[1].option.item.title, 'Tee 1');
  assert.equal(events[1].option.stock, 'unknown');
  assert.equal(events[1].option.item.image_url, 'https://cdn.example/1.jpg', 'the photo the search saw, right away');
  const updates = events.filter((e) => e.type === 'update');
  assert.equal(updates.length, 3);
  assert.equal(updates.find((u) => u.url === 'https://gap.example/p2').stock, 'out');
  assert.deepEqual(events.at(-1), { type: 'done', kind: 'products', count: 3 });
  assert.equal(calls[0].model, 'claude-sonnet-5-5', 'the quicker model by default');
  assert.match(calls[0].messages[0].content, /up to 6 products/, 'a small first batch');
  assert.match(calls[0].messages[0].content, /their sizes are tops M\./);
});

test('products written between searches all reach the shelf; one listing page can hold several', async () => {
  const same = { ...P(2, 'footlocker'), product_url: 'https://footlocker.example/hoodies-under-50' };
  const answer = { parts: [`I'll look. {"kind": "products", "products": [${JSON.stringify({ ...same, title: 'Adidas hoodie' })}`, `, ${JSON.stringify({ ...same, title: 'Nike hoodie' })}, ${JSON.stringify(P(3, 'gap'))}`, `, ${JSON.stringify({ ...same, title: 'Adidas hoodie' })}]}`] };
  const { client } = streamer([answer]);
  const events = [];
  const quiet = console.log;
  console.log = () => {};
  try {
    await streamLookup('black hoodie under $50', { client, fromUrl: slowPage(1), product: noShopify }, (e) => events.push(e));
  } finally {
    console.log = quiet;
  }
  assert.deepEqual(events.filter((e) => e.type === 'pick').map((e) => e.option.item.title), ['Adidas hoodie', 'Nike hoodie', 'Tee 3'], 'a search mid-answer loses nothing; the true repeat is dropped');
  assert.equal(events.filter((e) => e.type === 'searching').length, 3);
  assert.deepEqual(events.at(-1), { type: 'done', kind: 'products', count: 3 });
});

test('plain search, a few in all: a paused turn carries on with what is left', async () => {
  const calls = [];
  let n = 0;
  const client = { beta: { messages: { stream: (params) => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const handlers = {};
    const me = ++n;
    return {
      on(ev, cb) {
        (handlers[ev] ||= []).push(cb);
        return this;
      },
      async finalMessage() {
        const start = (name) => { for (const cb of handlers.streamEvent || []) cb({ type: 'content_block_start', content_block: { type: 'server_tool_use', name } }); };
        if (me === 1) {
          start('web_search');
          start('web_search');
          return { stop_reason: 'pause_turn', model: params.model, usage: {}, content: [] };
        }
        start('web_search');
        const text = JSON.stringify({ products: [P(1), P(2, 'gap')] });
        for (const cb of handlers.text || []) cb(text);
        return { stop_reason: 'end_turn', model: params.model, usage: {}, content: [{ type: 'text', text }] };
      },
    };
  } } } };
  const events = [];
  const quiet = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    await streamLookup('black tee', { client, fromUrl: slowPage(1), product: noShopify }, (e) => events.push(e));
  } finally {
    console.log = quiet;
  }
  assert.deepEqual(calls.map((c) => c.tools[0].type), ['web_search_20250305', 'web_search_20250305'], 'no code step after every search');
  assert.deepEqual(calls.map((c) => c.tools[0].max_uses), [3, 1], 'the second leg gets what is left');
  assert.match(calls[0].messages[0].content, /at most 3 searches/);
  assert.equal(events.filter((e) => e.type === 'pick').length, 2);
  assert.match(lines.find((l) => l.startsWith('stream lookup')), /"searches":3,"steps":0/);
});

test('the quicker model missing on the account: the bigger one, without a fuss', async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const { client, calls } = streamer([null, { products: [P(1)] }], { fail: (n) => n === 1 && new Anthropic.NotFoundError(404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-sonnet-5-5' } }, 'model: claude-sonnet-5-5', new Headers()) });
    const events = [];
    await streamLookup('black tee', { client, fromUrl: slowPage(1), product: noShopify }, (e) => events.push(e));
    assert.deepEqual(calls.map((c) => c.model), ['claude-sonnet-5-5', 'claude-opus-5']);
    assert.equal(events.filter((e) => e.type === 'pick').length, 1);
  } finally {
    console.error = quiet;
  }
});

test('nothing found: one looser try, then a plain "couldn\'t find"; outfits stream as whole looks', async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const { client, calls } = streamer([{ products: [] }, { products: [] }]);
    const events = [];
    await streamLookup('two outfits for china', { client, fromUrl: slowPage(1), product: noShopify }, (e) => events.push(e));
    assert.equal(calls.length, 2);
    assert.equal(events.at(-1).not_found, true);
    assert.match(events.at(-1).warning, /couldn’t find that one/);
  } finally {
    console.error = quiet;
  }
  const { client } = streamer([{ looks: [{ title: 'Hong Kong, November', pieces: [P(1, 'uniqlo'), P(2, 'cos'), P(3, 'veja')] }] }]);
  const events = [];
  await streamLookup('two outfits for hong kong', { client, fromUrl: slowPage(1), product: noShopify }, (e) => events.push(e));
  const look = events.find((e) => e.type === 'outfit').outfit;
  assert.equal(look.name, 'Hong Kong, November');
  assert.deepEqual(look.items.map((o) => o.merchant.name), ['uniqlo', 'cos', 'veja']);
  assert.equal(events.at(-1).kind, 'outfits');
});

test('the same ask again comes back instantly, with what the checks found', async () => {
  const cache = lookupCache();
  const { client, calls } = streamer([{ products: [P(1)] }]);
  const run = async () => {
    const ev = [];
    await streamLookup('Black Tee', { client, fromUrl: slowPage(1), product: noShopify, cache }, (e) => ev.push(e));
    return ev;
  };
  await run();
  const again = await run();
  assert.equal(calls.length, 1, 'no second search');
  assert.equal(again[0].type, 'pick');
  assert.equal(again[0].option.stock, 'in', 'the cached card has its store check');
  assert.equal(again.at(-1).type, 'done');
});

test('the endpoint streams one JSON line per event, with what it used first', async (t) => {
  const stream = async (text, o, write) => {
    write({ type: 'pick', option: { merchant: { name: 'S' }, item: { title: text, url: 'https://s.example/1' }, stock: 'unknown' } });
    write({ type: 'done', kind: 'products', count: 1, seen: o.sizes });
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_AGENT: 'off' }, capture: { stream } });
  t.after(() => a.close());
  const call = (payload, headers = {}) => a.inject({ method: 'POST', url: '/v1/capture/stream', payload, headers });
  const anon = await call({ text: 'black tee' });
  assert.equal(anon.statusCode, 200);
  assert.match(anon.headers['content-type'], /ndjson/);
  assert.deepEqual(anon.body.trim().split('\n').map((l) => JSON.parse(l).type), ['pick', 'done']);

  const start = await a.inject({ method: 'POST', url: '/v1/auth/start', payload: { email: 'kyle@example.com' } });
  const cookie = (await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email: 'kyle@example.com', code: start.json().code } })).headers['set-cookie'].split(';')[0];
  await a.inject({ method: 'POST', url: '/v1/me', payload: { sizes: { tops: 'M' } }, headers: { cookie } });
  const lines = (await call({ text: 'black tee' }, { cookie })).body.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { type: 'profile', profile: { sizes: 'tops M', ship_to: '' } });
  assert.equal(lines.at(-1).seen, 'tops M');
  assert.equal((await call({ text: '  ' })).statusCode, 422, 'nothing typed');
});
