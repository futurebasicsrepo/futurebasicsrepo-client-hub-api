import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFromScreenshot, captureFromUrl, draftFromVision, isPrivateAddress, parseProductHtml } from '../src/capture.js';

const LD_PAGE = `<html><head><title>ignored</title>
<meta property="og:site_name" content="Aritzia">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"Super Puff&trade; Shorty","color":"Black","image":["/img/puff.jpg"],"offers":{"@type":"Offer","price":"250.00","priceCurrency":"USD"}}]}</script>
</head></html>`;

const OG_PAGE = `<html><head><title>Fallback</title>
<meta property="og:title" content="Linen Shirt &amp; Co">
<meta property="og:image" content="https://cdn.example.com/shirt.jpg">
<meta property="product:price:amount" content="68.00">
</head></html>`;

test('parses JSON-LD products inside @graph', () => {
  const d = parseProductHtml(LD_PAGE, 'https://www.aritzia.com/us/en/product/super-puff/123.html');
  assert.equal(d.merchant.name, 'Aritzia');
  assert.equal(d.merchant.url, 'https://www.aritzia.com');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].price_cents, 25000);
  assert.equal(d.items[0].variant, 'Black');
  assert.equal(d.items[0].image_url, 'https://www.aritzia.com/img/puff.jpg');
  assert.equal(d.needs_review, false);
});

test('falls back to Open Graph product tags', () => {
  const d = parseProductHtml(OG_PAGE, 'https://shop.example.com/p/1');
  assert.equal(d.merchant.name, 'Example');
  assert.deepEqual([d.items[0].title, d.items[0].price_cents], ['Linen Shirt & Co', 6800]);
});

test('flags items with no price for review', () => {
  const d = parseProductHtml('<meta property="og:title" content="Mystery">', 'https://x.com/a');
  assert.equal(d.items[0].price_cents, null);
  assert.equal(d.needs_review, true);
});

test('fetches through redirects and blocks private hosts', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/old')) return new Response(null, { status: 301, headers: { location: '/new' } });
    return new Response(OG_PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const d = await captureFromUrl('https://shop.example.com/old', { fetchImpl, allowPrivate: true });
  assert.deepEqual(calls, ['https://shop.example.com/old', 'https://shop.example.com/new']);
  assert.equal(d.items[0].price_cents, 6800);
  await assert.rejects(captureFromUrl('http://127.0.0.1/admin', { fetchImpl }), /not allowed/);
  await assert.rejects(captureFromUrl('http://[::1]/', { fetchImpl }), /not allowed/);
  await assert.rejects(captureFromUrl('file:///etc/passwd', { fetchImpl }), /http/);
});

test('private address ranges', () => {
  for (const ip of ['10.0.0.1', '172.16.3.4', '192.168.1.1', '169.254.169.254', '127.0.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1', '100.64.0.1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});

test('vision output becomes a draft that always needs review', () => {
  const d = draftFromVision({
    is_cart: true, merchant_name: 'SSENSE', merchant_domain: 'ssense.com', currency: 'USD',
    items: [{ title: 'Wool Coat', variant: 'M', quantity: 1, unit_price: '$1,120.00' }, { title: 'Socks', variant: '', quantity: 3, unit_price: '' }],
    shipping_and_tax: '$98.40',
  });
  assert.equal(d.merchant.url, 'https://ssense.com');
  assert.equal(d.items[0].price_cents, 112000);
  assert.equal(d.items[1].price_cents, null);
  assert.equal(d.items[1].quantity, 3);
  assert.equal(d.extras_cents, 9840);
  assert.equal(d.needs_review, true);
  assert.throws(() => draftFromVision({ is_cart: false, items: [] }), /doesn't look like a cart/);
});

test('screenshot capture sends a structured-output vision request', async () => {
  let sent;
  const client = { beta: { messages: { create: async (req) => {
    sent = req;
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ is_cart: true, merchant_name: 'Nike', merchant_domain: '', currency: 'USD', items: [{ title: 'Dunk Low', variant: '10', quantity: 1, unit_price: '$115.00' }], shipping_and_tax: '' }) }] };
  } } } };
  const d = await captureFromScreenshot({ data: 'aGk=', media_type: 'image/png' }, { client });
  assert.equal(d.items[0].price_cents, 11500);
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.messages[0].content[0].type, 'image');
  await assert.rejects(captureFromScreenshot({ data: 'x', media_type: 'image/tiff' }, { client }), /PNG/);
  const refusing = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  await assert.rejects(captureFromScreenshot({ data: 'aGk=', media_type: 'image/png' }, { client: refusing }), /Could not read/);
});
