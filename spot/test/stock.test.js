// Sold out: a find is checked against the store's own stock data, a sold-out
// one is swapped for another, and "find another" follow-ups work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { captureFromText, parseProductHtml, stockFrom, stockOf } from '../src/capture.js';

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
  assert.match(calls[0].messages[0].content, /must be in stock right now/);
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
  assert.match(prompt, /They saw what you found last time and said: "in green, under \$30"/);
  assert.match(prompt, /Don't suggest any of these again: https:\/\/shop\.example\/p1/);
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
  assert.match(calls[0].messages[0].content, /up to 6 products/);
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
  for (const id of ['picks', 'thread', 'askMore', 'more2', 'backPicks']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /data-face="[^"]*\/assets\/spot-face\.webp\?v=/);
});
