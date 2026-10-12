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

test('each pick goes out once its store check is back, with the store’s own photo and stock; then done', async () => {
  const { client, calls } = streamer([{ kind: 'products', products: [P(1), P(2, 'gap'), P(3, 'nike')] }]);
  const events = [];
  await streamLookup('black tee', { client, fromUrl: slowPage(30, ['https://gap.example/p2']), product: noShopify, sizes: 'tops M', shipTo: 'Austin, TX' }, (e) => events.push(e));
  const types = events.map((e) => e.type);
  assert.equal(types[0], 'searching');
  assert.equal(types.indexOf('checking'), types.lastIndexOf('checking'), 'said once');
  assert.ok(types.indexOf('checking') < types.indexOf('pick'));
  const picks = events.filter((e) => e.type === 'pick').map((e) => e.option);
  assert.deepEqual(picks.map((o) => o.item.title).sort(), ['Tee 1', 'Tee 2', 'Tee 3']);
  const tee1 = picks.find((o) => o.item.title === 'Tee 1');
  assert.equal(tee1.item.image_url, 'https://s.example/p1.jpg', 'the store’s own photo, not the one the AI noted');
  assert.equal(tee1.stock, 'in');
  assert.equal(picks.find((o) => o.item.title === 'Tee 2').stock, 'out');
  assert.equal(events.filter((e) => e.type === 'update').length, 0, 'nothing to patch: each card is whole when it goes up');
  assert.deepEqual(events.at(-1), { type: 'done', kind: 'products', count: 3 });
  assert.equal(calls[0].model, 'claude-sonnet-5-5', 'the quicker model by default');
  assert.match(calls[0].messages[0].content, /up to 6 products/, 'a small first batch');
  assert.match(calls[0].messages[0].content, /their sizes are tops M\./);
  assert.match(calls[0].messages[0].content, /Never answer a shopping request with an empty list/);
  assert.match(calls[0].messages[0].content, /Prefer the brand's own online store and shops that sell direct/, 'stores Spot can buy from and show');
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
  // A store's home page, or a guide about products, isn't a product page either.
  for (const u of ['https://www.smithoptics.com', 'https://www.quayaustralia.com/', 'https://www.costadelmar.com/en-us/', 'https://www.rei.com/learn/expert-advice/best-sunglasses.html', 'https://sunski.com/blogs/news/x']) assert.equal(looksLikeListing(u), true, u);
  for (const u of ['https://www.costadelmar.com/en-us/rinconcito/6S9117.html', 'https://www.walmart.com/ip/x/123', 'https://www.target.com/p/x/-/A-1', 'https://www.amazon.com/dp/B00']) assert.equal(looksLikeListing(u), false, u);
  assert.equal(cleanVariant('Your size, White'), 'White');
  assert.equal(cleanVariant('Black / your size'), 'Black');
  assert.equal(cleanVariant('M, Light Gray'), 'M, Light Gray');
});

test('on the shelf: a listing link goes up as the product’s own link, name, price and photo, and the cache keeps it', async () => {
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
  const vessi = events.find((e) => e.type === 'pick' && e.option.merchant.name === 'vessi').option;
  assert.deepEqual({ url: vessi.item.url, title: vessi.item.title, price_cents: vessi.item.price_cents, variant: vessi.item.variant }, { url: 'https://vessi.example/products/weekend', title: 'Weekend Sneaker', price_cents: 13500, variant: 'White' });
  assert.ok(vessi.item.image_url, 'with its photo');
  assert.equal(events.filter((e) => e.type === 'pick').length, 2);
  // Asked again: the product page, straight from the cache.
  const again = [];
  await streamLookup('waterproof sneakers', { client, fromUrl: slowPage(1), product: noShopify, resolve, cache }, (e) => again.push(e));
  const cached = again.find((e) => e.type === 'pick' && e.option.merchant.name === 'vessi');
  assert.equal(cached.option.item.url, 'https://vessi.example/products/weekend');
  assert.equal(cached.option.item.price_cents, 13500);
});

test('photos from an image search: the store’s own result first, nothing unrelated, off without a key', async () => {
  const { photoSearch } = await import('../src/capture.js');
  const asked = [];
  const brave = (results) => async (url, init) => (asked.push({ url, key: init.headers['x-subscription-token'] }), { ok: true, json: async () => ({ results }) });
  const results = [
    { title: 'Ray-Ban Wayfarer review blog', url: 'https://blog.example/rayban', properties: { url: 'https://blog.example/w.jpg' }, meta_url: { hostname: 'blog.example' } },
    { title: 'Ray-Ban Original Wayfarer Classic Sunglasses', url: 'https://www.ray-ban.com/usa/sunglasses/rb2140', properties: { url: 'https://assets.ray-ban.com/w.png' }, meta_url: { hostname: 'www.ray-ban.com' } },
  ];
  const img = await photoSearch({ title: 'Ray-Ban Original Wayfarer Classic', store: 'Ray-Ban', url: 'https://www.ray-ban.com/usa/x' }, { fetchImpl: brave(results), key: 'k' });
  assert.equal(img, 'https://assets.ray-ban.com/w.png', 'the store’s own site');
  assert.match(asked[0].url, /images\/search\?q=Ray-Ban%20Original%20Wayfarer%20Classic%20Ray-Ban/);
  assert.equal(asked[0].key, 'k');
  // Another site's photo only when it's plainly the same product.
  assert.equal(await photoSearch({ title: 'Oakley Holbrook polarized sunglasses', url: 'https://www.dickssportinggoods.com/f/x' }, { fetchImpl: brave(results), key: 'k' }), null);
  assert.equal(await photoSearch({ title: 'Ray-Ban Original Wayfarer Classic Sunglasses', url: 'https://www.walmart.com/ip/1' }, { fetchImpl: brave(results), key: 'k' }), 'https://assets.ray-ban.com/w.png');
  // No key: no search. A failing search: no photo, no error.
  assert.equal(await photoSearch({ title: 'x y z' }, { fetchImpl: () => assert.fail('not asked'), key: '' }), null);
  assert.equal(await photoSearch({ title: 'Ray-Ban Wayfarer' }, { fetchImpl: async () => ({ ok: false, status: 429 }), key: 'k' }).catch(() => 'threw'), null);
});

test('photos are the product: no logos, no look-alike sites, no other model', async () => {
  const { photoSearch, specificWords } = await import('../src/capture.js');
  const brave = (results) => async () => ({ ok: true, json: async () => ({ results }) });
  const r = (title, host, img) => ({ title, url: `https://${host}/p`, properties: { url: img }, meta_url: { hostname: host } });
  // A store's logo is never the product's photo.
  const logo = [r('Sunski Dipsea Polarized Sunglasses', 'sunski.com', 'https://sunski.com/cdn/logo-black.png')];
  assert.equal(await photoSearch({ title: 'Sunski Dipsea Polarized Sunglasses', store: 'Sunski', url: 'https://sunski.com/products/dipsea' }, { fetchImpl: brave(logo), key: 'k' }), null);
  // A look-alike of the brand's site isn't the brand.
  const fake = [r('Costa Del Mar Caleta Polarized Sunglasses', 'costa--sunglasses.com', 'https://costa--sunglasses.com/caleta.jpg')];
  assert.equal(await photoSearch({ title: 'Costa Caleta Polarized Sunglasses', store: 'Costa Del Mar', url: 'https://www.dickssportinggoods.com/p/1' }, { fetchImpl: brave(fake), key: 'k' }), null);
  const real = [...fake, r('Costa Del Mar Caleta Polarized Sunglasses', 'www.costadelmar.com', 'https://www.costadelmar.com/caleta.jpg')];
  assert.equal(await photoSearch({ title: 'Costa Caleta Polarized Sunglasses', store: 'Costa Del Mar', url: 'https://www.dickssportinggoods.com/p/1' }, { fetchImpl: brave(real), key: 'k' }), 'https://www.costadelmar.com/caleta.jpg');
  // Same brand, another model: not this one.
  const other = [r('Tifosi Stella Polarized Sunglasses', 'tifosioptics.com', 'https://tifosioptics.com/stella.jpg')];
  assert.equal(await photoSearch({ title: 'Tifosi Swank Polarized Sunglasses', store: 'Tifosi', url: 'https://tifosioptics.com/products/swank' }, { fetchImpl: brave(other), key: 'k' }), null);
  // Nothing specific to go on: only a known store's photo, never an article's.
  const article = [r('Polarized sunglasses: what they do', 'www.aao.org', 'https://www.aao.org/polarized.jpg')];
  assert.equal(await photoSearch({ title: 'Polarized sunglasses' }, { fetchImpl: brave(article), key: 'k' }), null);
  assert.deepEqual(specificWords('Tifosi Swank Polarized Sunglasses', { url: 'https://tifosioptics.com/x' }), ['swank']);
  assert.deepEqual(specificWords('Polarized sunglasses'), []);
});

test('a listing link moves only to the same product, not one whose description matches', async () => {
  const { resolveListing } = await import('../src/capture.js');
  const suggest = async () => [
    { url: 'https://tifosioptics.com/products/stella', text: 'Stella', named: true, match: 'Stella Sunglasses Tifosi polarized swank style lens', price_cents: 3995 },
  ];
  const r = await resolveListing({ url: 'https://tifosioptics.com/collections/sunglasses', title: 'Tifosi Swank Polarized Sunglasses' }, { fromUrl: async () => null, suggest });
  assert.equal(r, null);
});

test('a page’s photo: not a category banner, not a logo', async () => {
  const { withPhoto } = await import('../src/capture.js');
  const d = (url) => ({ source: 'lookup', items: [{ title: 'Quay High Key', url, image_url: '' }] });
  const page = (img) => async () => ({ items: [{ title: 'x', image_url: img }] });
  const none = async () => null;
  const banner = await withPhoto(d('https://www.quayaustralia.com/collections/sunglasses'), page('https://quay.example/banner.jpg'), none);
  assert.equal(banner.items[0].image_url, null);
  const logo = await withPhoto(d('https://sunski.com/products/dipsea'), page('https://sunski.com/cdn/sunski-logo.png'), none);
  assert.equal(logo.items[0].image_url, null);
  const ok = await withPhoto(d('https://sunski.com/products/dipsea'), page('https://sunski.com/cdn/dipsea.jpg'), none);
  assert.equal(ok.items[0].image_url, 'https://sunski.com/cdn/dipsea.jpg');
});

test('on the shelf: a store that turns Spot away gets the photo from its page in Brave’s index, else an image search, else no card', async () => {
  const { client } = streamer([{ kind: 'products', products: [{ ...P(1, 'walmart'), image_url: '' }, { ...P(2, 'target'), image_url: '' }, { ...P(3, 'kmart'), image_url: 'https://ai.example/made-up.jpg' }] }]);
  const blocked = async () => ({ items: [{ title: 'Robot or human?' }], warning: 'Walmart doesn’t let Spot read its pages', offers: [] });
  const asked = [];
  const pdp = async (q) => (asked.push(q), q.url.includes('walmart') ? { url: 'https://walmart.example/ip/tee-1/123', title: 'Tee 1', image_url: 'https://i5.walmartimages.example/tee.jpg', thumb: 'https://imgs.brave.example/t.jpg' } : null);
  const photos = async (q) => (q.url.includes('target') ? 'https://target.scene7.example/tee2.jpg' : null);
  const verify = async (u) => !u.includes('made-up');
  const events = [];
  const quiet = [console.log, console.error];
  console.log = console.error = () => {};
  try {
    await streamLookup('black tee', { client, fromUrl: blocked, product: noShopify, resolve: async () => null, pdp, photos, verify }, (e) => events.push(e));
  } finally {
    [console.log, console.error] = quiet;
  }
  assert.deepEqual(asked[0], { title: 'Tee 1', url: 'https://walmart.example/p1' });
  const picks = events.filter((e) => e.type === 'pick').map((e) => e.option.item);
  const tee1 = picks.find((i) => i.title === 'Tee 1');
  assert.equal(tee1.image_url, 'https://i5.walmartimages.example/tee.jpg');
  assert.equal(tee1.url, 'https://walmart.example/ip/tee-1/123', 'the product’s own page, as the index has it');
  assert.equal(picks.find((i) => i.title === 'Tee 2').image_url, 'https://target.scene7.example/tee2.jpg');
  assert.equal(picks.find((i) => i.title === 'Tee 3'), undefined, 'a made-up photo address is no photo: not shown');
  assert.deepEqual(events.at(-1), { type: 'done', kind: 'products', count: 2 });
});

test('a link that never gets to the product’s own page (a home page, an article) isn’t shown, photo or not', async () => {
  const home = { ...P(1, 'smith'), product_url: 'https://www.smithoptics.com/' };
  const { client } = streamer([{ kind: 'products', products: [home, P(2, 'gap')] }]);
  const events = [];
  const quiet = console.log;
  console.log = () => {};
  try {
    await streamLookup('sunglasses', { client, fromUrl: slowPage(1), product: noShopify, resolve: async () => null, pdp: async () => null, photos: async () => null, verify: async () => true }, (e) => events.push(e));
  } finally {
    console.log = quiet;
  }
  assert.deepEqual(events.filter((e) => e.type === 'pick').map((e) => e.option.item.url), ['https://gap.example/p2']);
});

test('no photo for any of them: said plainly, no blank cards; a look keeps the pieces that have one', async () => {
  const none = { fromUrl: async () => ({ items: [{ title: 'x' }], offers: [] }), product: noShopify, resolve: async () => null, pdp: async () => null, photos: async () => null, verify: async () => false };
  const quiet = console.log;
  console.log = () => {};
  try {
    const events = [];
    await streamLookup('black tee', { client: streamer([{ kind: 'products', products: [P(1), P(2)] }]).client, ...none }, (e) => events.push(e));
    assert.equal(events.filter((e) => e.type === 'pick').length, 0);
    assert.equal(events.at(-1).not_found, true);
    assert.match(events.at(-1).warning, /couldn’t get their photos/);
    const look = { kind: 'outfits', outfits: [{ name: 'Weekend', items: [P(1), P(2, 'gap'), P(3, 'nike')] }, { name: 'Night', items: [P(4), P(5, 'gap')] }] };
    const withSome = { ...none, fromUrl: async (u) => ({ items: [{ title: 'x', image_url: /p[14]$/.test(u) ? null : `${u}.jpg` }], offers: [] }) };
    const got = [];
    await streamLookup('weekend outfit', { client: streamer([look]).client, ...withSome }, (e) => got.push(e));
    const outfits = got.filter((e) => e.type === 'outfit').map((e) => e.outfit);
    assert.deepEqual(outfits.map((o) => [o.name, o.items.length]), [['Weekend', 2]], 'two pieces with photos is still a look; one is not');
  } finally {
    console.log = quiet;
  }
});

test('the product’s page from Brave’s index: same store, a product page named for it, its own photo (not a logo)', async () => {
  const { pageSearch } = await import('../src/capture.js');
  const asked = [];
  const brave = (results) => async (url, init) => (asked.push({ url, key: init.headers['x-subscription-token'] }), { ok: true, json: async () => ({ web: { results } }) });
  const r = (title, url, thumbnail) => ({ title, url, thumbnail });
  const results = [
    r('Sunglasses - Walmart.com', 'https://www.walmart.com/browse/sunglasses/123', { original: 'https://i5.walmartimages.com/cat.jpg', src: 'https://imgs.search.brave.com/a' }),
    r('Walmart.com | Save Money. Live Better.', 'https://www.walmart.com/ip/x/1', { original: 'https://www.walmart.com/logo.png', src: 'https://imgs.search.brave.com/l', logo: true }),
    r('Ray-Ban RB4165 Justin Sunglasses - Walmart.com', 'https://www.walmart.com/ip/Ray-Ban-Justin/777', { original: 'https://i5.walmartimages.com/justin.jpg', src: 'https://imgs.search.brave.com/j' }),
    r('Ray-Ban RB2140 Original Wayfarer Sunglasses - Walmart.com', 'https://www.walmart.com/ip/Ray-Ban-Wayfarer/555', { original: 'https://i5.walmartimages.com/wayfarer.jpg', src: 'https://imgs.search.brave.com/w' }),
    r('Ray-Ban RB2140 Original Wayfarer - Lookalike', 'https://www.walmart-deals.example/ip/1', { original: 'https://x.example/w.jpg' }),
  ];
  const hit = await pageSearch({ title: 'Ray-Ban Original Wayfarer Sunglasses', url: 'https://www.walmart.com/search?q=wayfarer' }, { fetchImpl: brave(results), key: 'k' });
  assert.deepEqual(hit, { url: 'https://www.walmart.com/ip/Ray-Ban-Wayfarer/555', title: 'Ray-Ban RB2140 Original Wayfarer Sunglasses', image_url: 'https://i5.walmartimages.com/wayfarer.jpg', thumb: 'https://imgs.search.brave.com/w' });
  assert.match(decodeURIComponent(asked[0].url), /web\/search\?q=Ray-Ban Original Wayfarer Sunglasses site:walmart\.com/);
  assert.equal(asked[0].key, 'k');
  // Another model at that store, or only a logo: nothing.
  assert.equal(await pageSearch({ title: 'Ray-Ban Clubmaster Sunglasses', url: 'https://www.walmart.com/ip/1' }, { fetchImpl: brave(results), key: 'k' }), null);
  // The exact page we had wins, when it's there.
  const same = await pageSearch({ title: 'Ray-Ban Justin Sunglasses', url: 'https://www.walmart.com/ip/Ray-Ban-Justin/777?athbdg=1' }, { fetchImpl: brave(results), key: 'k' });
  assert.equal(same.url, 'https://www.walmart.com/ip/Ray-Ban-Justin/777');
  // No key, or a failing search: nothing, no error.
  assert.equal(await pageSearch({ title: 'x y', url: 'https://a.com/p' }, { fetchImpl: () => assert.fail('not asked'), key: '' }), null);
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await pageSearch({ title: 'x y', url: 'https://a.com/p' }, { fetchImpl: async () => ({ ok: false, status: 429 }), key: 'k' }), null);
  } finally {
    console.error = quiet;
  }
});

test('a photo address from elsewhere counts only if it is an image on a public https host', async () => {
  const { imageOk } = await import('../src/capture.js');
  const res = (status, type, location) => ({ ok: status < 300, status, headers: new Map(Object.entries({ 'content-type': type, ...(location ? { location } : {}) })), body: null });
  assert.equal(await imageOk('https://93.184.215.14/a.jpg', { fetchImpl: async () => res(200, 'image/jpeg') }), true);
  assert.equal(await imageOk('https://93.184.215.14/a.jpg', { fetchImpl: async () => res(200, 'text/html') }), false);
  assert.equal(await imageOk('https://93.184.215.14/a.jpg', { fetchImpl: async () => res(404, 'image/jpeg') }), false);
  assert.equal(await imageOk('http://93.184.215.14/a.jpg', { fetchImpl: async () => res(200, 'image/jpeg') }), false);
  assert.equal(await imageOk('https://127.0.0.1/a.jpg', { fetchImpl: async () => res(200, 'image/jpeg') }), false);
  const hops = [res(302, '', 'https://10.0.0.5/a.jpg')];
  assert.equal(await imageOk('https://93.184.215.14/a.jpg', { fetchImpl: async () => hops.shift() || res(200, 'image/jpeg') }), false, 'not redirected inside');
});
