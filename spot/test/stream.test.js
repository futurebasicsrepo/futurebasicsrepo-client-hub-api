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
  assert.match(calls[0].messages[0].content, /Never answer a shopping request with an empty list/);
  assert.doesNotMatch(calls[0].messages[0].content, /must be in stock/, 'stock is checked by Spot, not a reason to return nothing');
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

test('a category or search page in place of the product: the product on that store, found and swapped in', async () => {
  const { resolveListing, parseProductHtml, looksLikeListing, cleanVariant } = await import('../src/capture.js');
  // Shopify's product search knows it: its own page gives the real price and photo.
  const productPage = { items: [{ title: 'Weekend Sneaker - Waterproof - Size 8', price_cents: 13500, image_url: 'https://cdn.vessi.example/w.jpg', url: 'https://vessi.example/products/weekend' }], offers: [{ words: new Set(), in: true }], links: [] };
  const r = await resolveListing(
    { url: 'https://vessi.example/collections/womens', title: 'Weekend Waterproof Sneakers' },
    { fromUrl: async (u) => (u === 'https://vessi.example/products/weekend' ? productPage : null), suggest: async () => [{ url: 'https://vessi.example/products/cityscape', text: 'Cityscape Classic' }, { url: 'https://vessi.example/products/weekend', text: 'Weekend Sneaker - Waterproof', named: true }] },
  );
  assert.deepEqual(r, { url: 'https://vessi.example/products/weekend', title: 'Weekend Sneaker - Waterproof', price_cents: 13500, image_url: 'https://cdn.vessi.example/w.jpg' }, "the store's name for it, not the size its page opened on");

  // Not Shopify: the listing page's own links, by name.
  const listing = parseProductHtml(
    `<html><head><title>Women's outerwear</title><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","url":"/us/en/products/E123","name":"AIRism UV Protection Cardigan"}]}</script></head>
     <body><a href="/us/en/women">Women</a><a href="/us/en/products/E999" aria-label="Pocketable UV Protection Parka"><img></a><a href="https://other.example/x">UV Protection Cardigan</a></body></html>`,
    'https://shop.example/us/en/women/outerwear',
  );
  assert.deepEqual(listing.links.map((l) => l.url), ['https://shop.example/us/en/products/E123', 'https://shop.example/us/en/women', 'https://shop.example/us/en/products/E999'], 'same store only; labels count as text');
  const pages = { 'https://shop.example/us/en/women/outerwear': listing, 'https://shop.example/us/en/products/E123': { items: [{ title: 'AIRism UV Protection Cardigan', price_cents: 2990, image_url: null }], offers: [{ words: new Set(), in: true }], links: [] } };
  const r2 = await resolveListing({ url: 'https://shop.example/us/en/women/outerwear', title: 'UV Protection Cardigan' }, { fromUrl: async (u) => pages[u] || null, suggest: async () => [] });
  assert.equal(r2.url, 'https://shop.example/us/en/products/E123');
  assert.equal(r2.price_cents, 2990);
  const { withoutSize } = await import('../src/capture.js');
  assert.equal(withoutSize("Men's Tree Runner - Mist (White Sole) - Size 8"), "Men's Tree Runner - Mist (White Sole)");
  assert.equal(withoutSize('Scoop-Neck Midi Dress | Deep Navy - XXS'), 'Scoop-Neck Midi Dress | Deep Navy');
  assert.equal(withoutSize('Air Max 90'), 'Air Max 90');

  // A real product page stays: it has offers, or a price, or its own name.
  const real = { items: [{ title: 'Tee', price_cents: 2000 }], offers: [{ words: new Set(), in: true }], links: [{ url: 'https://shop.example/p/2', text: 'Black Tee Two' }] };
  assert.equal(await resolveListing({ url: 'https://shop.example/p/1', title: 'Black Tee' }, { fromUrl: async () => real, suggest: async () => { throw new Error('not asked'); } }), null);
  // Nothing on the store by that name: leave it.
  assert.equal(await resolveListing({ url: 'https://shop.example/search?q=tee', title: 'Linen Shirt' }, { fromUrl: async () => listing, suggest: async () => [] }), null);

  assert.equal(looksLikeListing('https://www.amazon.com/s?k=umbrella'), true);
  assert.equal(looksLikeListing('https://shop.example/collections/a/products/b'), false);
  assert.equal(cleanVariant('Your size, White'), 'White');
  assert.equal(cleanVariant('Black / your size'), 'Black');
  assert.equal(cleanVariant('M, Light Gray'), 'M, Light Gray');
});

test('on the shelf: a moved link goes out as an update with the product\'s own link, name and price, and the cache keeps it', async () => {
  const listingUrl = 'https://vessi.example/collections/womens';
  const { client } = streamer([{ kind: 'products', products: [{ ...P(1, 'vessi'), product_url: listingUrl, title: 'Weekend Sneakers', unit_price: '$129', variant: 'Your size, White' }, P(2, 'gap')] }]);
  const resolve = async (it) => (it.url === listingUrl ? { url: 'https://vessi.example/products/weekend', title: 'Weekend Sneaker', price_cents: 13500, image_url: 'https://cdn.vessi.example/w.jpg' } : null);
  const cache = lookupCache();
  const events = [];
  const quiet = console.log;
  console.log = () => {};
  try {
    await streamLookup('waterproof sneakers', { client, fromUrl: slowPage(1), product: noShopify, resolve, cache }, (e) => events.push(e));
  } finally {
    console.log = quiet;
  }
  const first = events.find((e) => e.type === 'pick');
  assert.equal(first.option.item.url, listingUrl, 'the card goes up at once, with what search found');
  assert.equal(first.option.item.variant, 'White', 'no "your size"');
  const moved = events.find((e) => e.type === 'update' && e.new_url);
  assert.deepEqual({ url: moved.url, new_url: moved.new_url, title: moved.title, price_cents: moved.price_cents, image_url: moved.image_url }, { url: listingUrl, new_url: 'https://vessi.example/products/weekend', title: 'Weekend Sneaker', price_cents: 13500, image_url: 'https://cdn.vessi.example/w.jpg' });
  assert.equal(events.filter((e) => e.type === 'update' && !e.new_url).length, 1, 'the other card just gets its check');
  // Asked again: the product page, straight from the cache.
  const again = [];
  await streamLookup('waterproof sneakers', { client, fromUrl: slowPage(1), product: noShopify, resolve, cache }, (e) => again.push(e));
  const cached = again.find((e) => e.type === 'pick');
  assert.equal(cached.option.item.url, 'https://vessi.example/products/weekend');
  assert.equal(cached.option.item.price_cents, 13500);
});
