// Sold out: a find is checked against the store's own stock data, a sold-out
// one is swapped for another, and "find another" follow-ups work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { captureFromText, draftFromDescription, pageDetails, parseProductHtml, readJson, salvage, stockFrom, stockOf } from '../src/capture.js';

const ld = (data) => `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head></html>`;
const SO = 'https://schema.org/';

test('a product page that says sold out is flagged, per option when the store names them', async () => {
  const gone = parseProductHtml(ld({ '@type': 'Product', name: 'Toddler Eagles Tee', offers: { '@type': 'Offer', price: '25.99', priceCurrency: 'USD', availability: `${SO}OutOfStock` } }), 'https://shop.example/tee');
  assert.equal(gone.sold_out, true);
  assert.equal(gone.needs_review, true, 'never sent without a look');
  assert.match(gone.warning, /sold out/);
  assert.equal(JSON.parse(JSON.stringify(gone)).offers, undefined, 'stock details stay on the server');
  const here = parseProductHtml(ld({ '@type': 'Product', name: 'Tee', offers: { price: '25.99', availability: 'InStock' } }), 'https://shop.example/tee');
  assert.equal(here.sold_out, undefined);

  // Sizes: 2T gone, 3T left.
  const group = ld({ '@type': 'ProductGroup', name: 'Toddler Tee', hasVariant: [
    { '@type': 'Product', size: '2T', offers: { price: '25.99', availability: `${SO}SoldOut` } },
    { '@type': 'Product', size: '3T', offers: { price: '25.99', availability: `${SO}InStock` } },
  ] });
  const page = async () => parseProductHtml(group, 'https://shop.example/tee');
  const none = async () => null;
  assert.equal(await stockOf({ url: 'https://shop.example/tee', title: 'Toddler Tee', variant: '2T' }, { fromUrl: page, product: none }), 'out');
  assert.equal(await stockOf({ url: 'https://shop.example/tee', title: 'Toddler Tee', variant: '3T' }, { fromUrl: page, product: none }), 'in');
  assert.equal(await stockOf({ url: 'https://shop.example/tee', title: 'Toddler Tee' }, { fromUrl: page, product: none }), 'in', 'some size is left');
  assert.equal(stockFrom([], '2T'), 'unknown', 'a page that says nothing proves nothing');
  // A bot wall or an unreadable page is "don't know", not "in stock".
  assert.equal(await stockOf({ url: 'https://shop.example/tee' }, { fromUrl: async () => { throw new Error('blocked'); }, product: none }), 'unknown');
});

test('Shopify stores: the variant asked for, from the store’s product data', async () => {
  const product = async () => ({ title: 'Easy Lane Tee', variants: [
    { option1: 'Natural', option2: '2T', title: 'Natural / 2T', available: false },
    { option1: 'Natural', option2: '4T', title: 'Natural / 4T', available: true },
  ] });
  const item = { url: 'https://s.example/products/tee', title: 'Easy Lane Tee' };
  assert.equal(await stockOf({ ...item, variant: 'Natural / 2T' }, { product }), 'out');
  assert.equal(await stockOf({ ...item, variant: 'Natural / 4T' }, { product }), 'in');
});

// A fake model: each answer in turn, recording what it was asked.
function model(answers) {
  const calls = [];
  const client = { beta: { messages: { create: async (req) => {
    calls.push(JSON.parse(JSON.stringify(req)));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(a) }] };
  } } } };
  return { client, calls };
}
const find = (n, extra = {}) => ({ found: true, merchant_name: 'Eagles Shop', merchant_url: 'https://shop.example', product_url: `https://shop.example/p${n}`, title: `Tee ${n}`, variant: '2T', unit_price: '$25.99', ...extra });
const stockAt = (out) => async (u) => ({ items: [{ title: 'x', image_url: `${u}.jpg` }], offers: [{ words: new Set(), in: !out.includes(u) }] });
const noShopify = async () => null;

test('a sold-out find is swapped for one in stock, and never shown', async () => {
  const { client, calls } = model([find(1), find(2)]);
  const d = await captureFromText('toddler eagles shirt 2T', { client, fromUrl: stockAt(['https://shop.example/p1']), product: noShopify });
  assert.equal(calls.length, 2, 'looked again');
  assert.equal(d.items[0].title, 'Tee 2');
  assert.equal(d.in_stock, true);
  assert.equal(d.sold_out, undefined);
  assert.equal(d.items[0].image_url, 'https://shop.example/p2.jpg');
  assert.match(calls[0].messages[0].content, /Skip anything you saw marked sold out/, 'sold out is skipped; stock is checked by Spot, not demanded of the model');
  const retry = calls[1].messages.at(-1);
  assert.equal(retry.role, 'user');
  assert.match(retry.content, /that one is sold out \(Tee 1 \(2T\) at https:\/\/shop\.example\/p1\)/);
  assert.equal(calls[1].messages.at(-2).role, 'assistant', 'the model sees its own answer before the correction');
});

test('if everything is sold out, it says so and shows what it tried', async () => {
  const { client, calls } = model([find(1), find(2), find(3)]);
  const all = ['https://shop.example/p1', 'https://shop.example/p2', 'https://shop.example/p3'];
  const d = await captureFromText('toddler eagles shirt', { client, fromUrl: stockAt(all), product: noShopify });
  assert.equal(calls.length, 3, 'three tries, then stop');
  assert.equal(d.sold_out, true);
  assert.equal(d.needs_review, true);
  assert.deepEqual(d.tried, all);
  assert.match(d.warning, /Everything I found is sold out \(3 checked\)/);
});

test('stock the store doesn’t publish: shown, with a nudge to check', async () => {
  const { client } = model([find(1)]);
  const d = await captureFromText('toddler eagles shirt', { client, fromUrl: async () => ({ items: [{ title: 'x' }] }), product: noShopify });
  assert.equal(d.in_stock, undefined);
  assert.match(d.warning, /couldn’t check stock at Eagles Shop/);
});

test('a follow-up says what to change and skips what was already shown', async () => {
  const { client, calls } = model([find(4)]);
  const fetched = [];
  const fromUrl = async (u) => (fetched.push(u), { items: [{ title: 'x' }], offers: [{ words: new Set(), in: true }] });
  // Even when the original ask was a link, a follow-up searches.
  const d = await captureFromText('Toddler Eagles Tee from Eagles Shop https://shop.example/p1', { client, fromUrl, product: noShopify, more: 'in green, under $30', avoid: ['https://shop.example/p1', 'javascript:alert(1)'] });
  assert.equal(d.items[0].title, 'Tee 4');
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /just said: "in green, under \$30"/);
  assert.match(prompt, /Earlier in this chat they asked for: "Toddler Eagles Tee/);
  assert.match(prompt, /don't suggest them again: https:\/\/shop\.example\/p1/);
  assert.doesNotMatch(prompt, /javascript:/);
  assert.deepEqual(fetched, ['https://shop.example/p4'], 'the store page is read once, for stock and photo');
});

test('the composer sends follow-ups through, and an AI can’t make an ask for a sold-out item', async (t) => {
  const seen = [];
  let soldOut = false;
  const fromText = async (text, o = {}) => {
    seen.push({ text, more: o.more, avoid: o.avoid });
    return { source: 'lookup', merchant: { name: 'Eagles Shop', url: 'https://shop.example' }, items: [{ title: 'Tee', variant: '2T', quantity: 1, price_cents: 2599, image_url: null, url: 'https://shop.example/p1' }], needs_review: true, ...(soldOut ? { sold_out: true, tried: ['https://shop.example/p1'] } : {}) };
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_AGENT: 'on' }, capture: { fromText } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.json(), headers: r.headers };
  };
  const r = await call('POST', '/v1/capture', { text: 'toddler eagles shirt', more: 'in green', avoid: ['https://shop.example/p1', 7] });
  assert.equal(r.status, 200);
  assert.deepEqual(seen.at(-1), { text: 'toddler eagles shirt', more: 'in green', avoid: ['https://shop.example/p1'] });

  const start = await call('POST', '/v1/auth/start', { email: 'riley@example.com' });
  const cookie = (await call('POST', '/v1/auth/verify', { email: 'riley@example.com', code: start.body.code })).headers['set-cookie'].split(';')[0];
  const key = (await call('POST', '/v1/me/keys', { agent_name: 'claude' }, { cookie })).body;
  soldOut = true;
  const ask = await call('POST', '/v1/agent/asks', { requester: { name: 'Riley' }, text: 'toddler eagles shirt' }, { authorization: `Bearer ${key.api_key}` });
  assert.equal(ask.status, 422);
  assert.match(ask.body.error, /Tee is sold out at Eagles Shop/);
});

test('several picks across stores: sold-out ones dropped, the recommendation first', async () => {
  const pick = (n, store) => ({ merchant_name: store, merchant_url: `https://${store}.example`, product_url: `https://${store}.example/p${n}`, title: `Tee ${n}`, variant: '3T', unit_price: `$2${n}.00`, why: `reason ${n}` });
  const { client, calls } = model([{ products: [pick(1, 'eagles'), pick(2, 'fanatics'), pick(3, 'nike'), pick(4, 'target'), { found: false }] }]);
  const d = await captureFromText('toddler eagles shirt', { client, fromUrl: stockAt(['https://fanatics.example/p2']), product: noShopify });
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /up to 12 products/);
  assert.deepEqual(d.options.map((o) => o.item.title), ['Tee 1', 'Tee 3', 'Tee 4'], 'sold out at Fanatics: not shown');
  assert.deepEqual(d.options.map((o) => o.merchant.name), ['eagles', 'nike', 'target']);
  assert.equal(d.options[0].why, 'reason 1');
  assert.equal(d.options[0].stock, 'in');
  assert.equal(d.options[1].item.image_url, 'https://nike.example/p3.jpg', 'each has its photo');
  assert.equal(d.items[0].title, 'Tee 1', 'the draft is the recommendation');
  assert.deepEqual(d.tried, ['https://fanatics.example/p2']);
});

test('a follow-up never repeats a product already shown', async () => {
  const pick = (n) => ({ merchant_name: 'S', merchant_url: 'https://s.example', product_url: `https://s.example/p${n}`, title: `Tee ${n}`, unit_price: '$20' });
  const { client } = model([{ products: [pick(1), pick(2), pick(3)] }]);
  const d = await captureFromText('toddler eagles shirt', { client, fromUrl: stockAt([]), product: noShopify, more: 'cheaper', avoid: ['https://s.example/p1'] });
  assert.deepEqual(d.options.map((o) => o.item.url), ['https://s.example/p2', 'https://s.example/p3']);
});

test('the composer page has the picks shelf and its follow-up box', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_AGENT: 'off' } });
  t.after(() => a.close());
  const html = (await a.inject({ method: 'GET', url: '/new' })).body;
  for (const id of ['picks', 'thread', 'askMore', 'more2', 'backPicks', 'nameSheet', 'sheetName']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /data-face="[^"]*\/assets\/spot-face\.webp\?v=/);
});

test('outfits: whole looks for an occasion, sold-out pieces dropped, thin looks dropped', async () => {
  const piece = (n, store, extra = {}) => ({ merchant_name: store, merchant_url: `https://${store}.example`, product_url: `https://${store}.example/p${n}`, title: `Piece ${n}`, unit_price: `$${n}0.00`, ...extra });
  const { client, calls } = model([{ kind: 'outfits', outfits: [
    { name: 'Desert boho', why: 'Breezy for the heat', items: [piece(1, 'free'), piece(2, 'levis'), piece(3, 'steve'), piece(4, 'fossil')] },
    { name: 'Neon night', why: 'For the late sets', items: [piece(5, 'urban'), piece(6, 'urban')] },
  ] }]);
  const d = await captureFromText('outfits for coachella', { client, fromUrl: stockAt(['https://levis.example/p2', 'https://urban.example/p6']), product: noShopify });
  assert.match(calls[0].messages[0].content, /outfits \(as many as they ask for, up to 4\)/);
  assert.match(calls[0].messages[0].content, /an occasion or place \("for Coachella"/);
  assert.equal(d.kind, 'outfits');
  assert.deepEqual(d.outfits.map((o) => o.name), ['Desert boho'], 'a look left with one piece is dropped');
  assert.deepEqual(d.outfits[0].items.map((o) => o.item.title), ['Piece 1', 'Piece 3', 'Piece 4'], 'the sold-out jeans are gone');
  assert.deepEqual(d.outfits[0].items.map((o) => o.merchant.name), ['free', 'steve', 'fossil']);
  assert.equal(d.items[0].title, 'Piece 1', 'the draft is the first piece');
});

test('an answer that isn\'t clean JSON is still read; a budget is never a price', async () => {
  assert.deepEqual(readJson('Sure! ```json\n{"products": [{"title": "a",}],}\n```'), { products: [{ title: 'a' }] });
  // Cut off mid-list: the whole products are kept.
  const cut = '{"products": [{"title": "Hoodie A", "product_url": "https://a.example/h", "unit_price": "$40"}, {"title": "Hoodie B", "product_url": "https://b.example/h", "unit_pr';
  assert.deepEqual(salvage(cut).map((p) => p.title), ['Hoodie A']);
  const { client } = model([]);
  client.beta.messages.create = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: cut }] });
  const quiet = console.error;
  console.error = () => {};
  try {
    const d = await captureFromText('black hoodie under $50', { client, fromUrl: stockAt([]), product: noShopify });
    assert.deepEqual(d.options.map((o) => o.item.title), ['Hoodie A']);
  } finally {
    console.error = quiet;
  }
  const typed = draftFromDescription('black hoodie under $50');
  assert.equal(typed.items[0].price_cents, null, 'under $50 is a budget');
  assert.equal(typed.items[0].title, 'black hoodie under $50');
  assert.equal(draftFromDescription('black hoodie $50').items[0].price_cents, 5000);
});

test('nothing found: it says so instead of pretending what they typed is the item', async () => {
  const { client } = model([{ products: [] }]);
  const d = await captureFromText('black hoodie under $50', { client, fromUrl: stockAt([]), product: noShopify });
  assert.match(d.warning, /couldn’t find that one/);
  assert.equal(d.items[0].price_cents, null);
});

test('a photo the search saw is used when the store won\'t let Spot read its page', async () => {
  const { client } = model([{ products: [{ merchant_name: 'Nike', merchant_url: 'https://nike.example', product_url: 'https://nike.example/p1', title: 'Hoodie', unit_price: '$45', image_url: 'https://static.nike.example/h.jpg' }, { merchant_name: 'Gap', merchant_url: 'https://gap.example', product_url: 'https://gap.example/p2', title: 'Hoodie 2', unit_price: '$40', image_url: 'javascript:alert(1)' }] }]);
  const d = await captureFromText('black hoodie', { client, fromUrl: async () => { throw new Error('403'); }, product: noShopify });
  assert.equal(d.options[0].item.image_url, 'https://static.nike.example/h.jpg');
  assert.equal(d.options[0].stock, 'unknown');
  assert.equal(d.options[1].item.image_url, null, 'only https photos');
});

test('page details: each blocked page read at once, on the quicker model, for photo, stock and price', async () => {
  const calls = [];
  const answers = {
    'https://nike.example/p1': { image_url: 'https://static.nike.example/p1.jpg', in_stock: true, unit_price: '$45.00' },
    'https://dicks.example/p2': { image_url: '', in_stock: false, unit_price: '' },
  };
  const client = { beta: { messages: { create: async (req) => {
    calls.push(req);
    const url = Object.keys(answers).find((u) => req.messages[0].content.includes(u));
    return { stop_reason: 'end_turn', model: req.model, usage: {}, content: [{ type: 'text', text: JSON.stringify(answers[url]) }] };
  } } } };
  const r = await pageDetails(['https://nike.example/p1', { url: 'https://dicks.example/p2', title: 'Polarized sunglasses', variant: 'Black' }, 'nope'], { client });
  assert.equal(calls.length, 2, 'one call per page, side by side');
  assert.equal(calls[0].model, 'claude-haiku-5-5', 'the quickest model reads the page');
  assert.deepEqual(calls[0].thinking, { type: 'disabled' });
  assert.equal(calls[0].fallbacks, undefined, 'Haiku takes no server-side fallback');
  assert.equal(calls[0].tools[0].type, 'web_fetch_20250910', 'the plain fetch, no filtering step');
  assert.match(calls[1].messages[0].content, /It should be \(or list\) "Polarized sunglasses", in Black\. If it's a list or search page, report on that product\./);
  assert.deepEqual(r.pages, [
    { url: 'https://nike.example/p1', image_url: 'https://static.nike.example/p1.jpg', stock: 'in', price_cents: 4500 },
    { url: 'https://dicks.example/p2', image_url: null, stock: 'out', price_cents: null },
  ]);
});

test('page details: Haiku turns the request down, Sonnet reads it', async () => {
  const { Anthropic } = await import('../src/anthropic.js');
  const models = [];
  const client = { beta: { messages: { create: async (req) => {
    models.push(req.model);
    if (/haiku/.test(req.model)) throw new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'tool not supported' } }, 'tool not supported', new Headers());
    return { stop_reason: 'end_turn', model: req.model, usage: {}, content: [{ type: 'text', text: '{"image_url":"https://cdn.example/x.jpg","in_stock":true}' }] };
  } } } };
  const quiet = console.error;
  console.error = () => {};
  try {
    const r = await pageDetails(['https://shop.example/p'], { client });
    assert.deepEqual(models, ['claude-haiku-5-5', 'claude-sonnet-5-5']);
    assert.equal(r.pages[0].image_url, 'https://cdn.example/x.jpg');
  } finally {
    console.error = quiet;
  }
});

test('the shelf asks for photos and stock of pages Spot couldn\'t read', async (t) => {
  const seen = [];
  const details = async (urls) => (seen.push(urls), { pages: [{ url: urls[0], image_url: 'https://cdn.example/a.jpg', stock: 'in', price_cents: null }] });
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_AGENT: 'off' }, capture: { details } });
  t.after(() => a.close());
  const r = await a.inject({ method: 'POST', url: '/v1/capture/details', payload: { urls: ['https://nike.example/p1', 42, ...Array.from({ length: 12 }, (_, i) => `https://x.example/${i}`)] } });
  assert.equal(r.statusCode, 200);
  assert.equal(seen[0].length, 8, 'eight at a time, strings only');
  assert.equal(seen[0][0], 'https://nike.example/p1');
  assert.equal(r.json().pages[0].image_url, 'https://cdn.example/a.jpg');
});

test('every search uses their saved sizes and where things ship, and says so', async (t) => {
  const seen = [];
  const fromText = async (text, o = {}) => (seen.push(o), { source: 'lookup', kind: 'products', merchant: { name: 'S' }, items: [{ title: 'Hoodie', variant: 'M', quantity: 1, price_cents: 4000, url: 'https://s.example/h' }], options: [{ merchant: { name: 'S' }, item: { title: 'Hoodie', variant: 'M', quantity: 1, price_cents: 4000, url: 'https://s.example/h' }, stock: 'in' }] });
  const details = async (urls) => (seen.push({ details: urls }), { pages: [] });
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_AGENT: 'off' }, capture: { fromText, details } });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.json(), headers: r.headers };
  };
  // Signed out: nothing to use.
  const anon = await call('POST', '/v1/capture', { text: 'black hoodie' });
  assert.equal(anon.body.profile, undefined);
  assert.deepEqual([seen[0].sizes, seen[0].shipTo], ['', '']);

  const start = await call('POST', '/v1/auth/start', { email: 'kyle@example.com' });
  const cookie = (await call('POST', '/v1/auth/verify', { email: 'kyle@example.com', code: start.body.code })).headers['set-cookie'].split(';')[0];
  await call('POST', '/v1/me', { sizes: { tops: 'M', shoes: 'US 10.5' }, shipping: { name: 'Kyle R', line1: '1 Main St', city: 'Austin,', state: 'TX', postal_code: '78701', email: 'kyle@example.com' } }, { cookie });
  const r = await call('POST', '/v1/capture', { text: 'black hoodie' }, { cookie });
  assert.equal(seen.at(-1).sizes, 'tops M, shoes US 10.5');
  assert.equal(seen.at(-1).shipTo, 'Austin, TX', 'a stray comma in the city doesn’t double up');
  assert.deepEqual(r.body.profile, { sizes: 'tops M, shoes US 10.5', ship_to: 'Austin, TX' }, 'the shelf can say what it used');

  // Stock checks are for the size picked.
  await call('POST', '/v1/capture/details', { urls: [{ url: 'https://nike.example/p1', variant: 'M' }, 'https://x.example/2'] });
  assert.deepEqual(seen.at(-1).details, [{ url: 'https://nike.example/p1', variant: 'M' }, 'https://x.example/2']);
});

test('the search is told their sizes and city; page reads check the size', async () => {
  const { client, calls } = model([{ products: [] }]);
  await captureFromText('outfits for coachella', { client, fromUrl: stockAt([]), product: noShopify, sizes: 'tops M, pants 32, shoes US 10.5', shipTo: 'Austin, TX' });
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /their sizes are tops M, pants 32, shoes US 10\.5\./);
  assert.match(prompt, /They live in Austin, TX, so only pick stores that ship there/);
  assert.match(prompt, /For every clothing or shoe piece they didn't give a size for, pick the right one from their sizes/);

  const seen = [];
  const dc = { beta: { messages: { create: async (req) => (seen.push(req), { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }) } } };
  await pageDetails([{ url: 'https://nike.example/p1', variant: 'Black / M' }, 'https://x.example/2'], { client: dc });
  assert.match(seen[0].messages[0].content, /web_fetch: https:\/\/nike\.example\/p1\nSize or option: Black \/ M\./);
  assert.doesNotMatch(seen[1].messages[0].content, /Size or option/);
});

test('a reply in its own words is still read: name/url/store/price, looks of pieces', async () => {
  const { client } = model([{ looks: [{ title: 'Hong Kong in spring', description: 'Light layers', pieces: [
    { name: 'Linen shirt', url: 'https://uniqlo.example/l', store: 'Uniqlo', price: '$39.90' },
    { name: 'Wide trousers', url: 'https://cos.example/t', store: 'COS', price: '$89' },
    { name: 'White sneakers', link: 'https://veja.example/s', retailer: 'Veja', price: '$150', size: 'US 10.5' },
  ] }] }]);
  const d = await captureFromText('two outfits for china, going to hong kong', { client, fromUrl: stockAt([]), product: noShopify });
  assert.equal(d.kind, 'outfits');
  assert.equal(d.outfits[0].name, 'Hong Kong in spring');
  assert.deepEqual(d.outfits[0].items.map((o) => [o.merchant.name, o.item.title, o.item.price_cents, o.item.variant]), [['Uniqlo', 'Linen shirt', 3990, null], ['COS', 'Wide trousers', 8900, null], ['Veja', 'White sneakers', 15000, 'US 10.5']]);
});

test('an empty answer gets one more, looser try; still nothing: it says so and is never a cart', async () => {
  const quiet = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const good = { products: [{ merchant_name: 'S', merchant_url: 'https://s.example', product_url: 'https://s.example/1', title: 'Rain jacket', unit_price: '$80' }] };
    const one = model([{ kind: 'outfits', outfits: [] }, good]);
    const d = await captureFromText('two outfits for china', { client: one.client, fromUrl: stockAt([]), product: noShopify });
    assert.equal(one.calls.length, 2, 'asked again');
    assert.match(one.calls[1].messages.at(-1).content, /close is better than nothing/);
    assert.equal(d.options[0].item.title, 'Rain jacket');
    assert.ok(logged.some((l) => /lookup answer had no picks .*outfits/.test(l)), 'what came back is logged');

    const none = model([{ products: [] }]);
    const n = await captureFromText('two outfits for china', { client: none.client, fromUrl: stockAt([]), product: noShopify });
    assert.equal(n.not_found, true);
    assert.match(n.warning, /couldn’t find that one/);
  } finally {
    console.error = quiet;
  }
});
