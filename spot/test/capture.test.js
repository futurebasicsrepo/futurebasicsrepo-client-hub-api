import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureFromText, draftFromLookup, splitText, captureFromScreenshot, captureFromUrl, draftFromVision, isPrivateAddress, parseProductHtml } from '../src/capture.js';

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

test('splitText pulls the link out of shared text', () => {
  assert.deepEqual(splitText('  Check out Dunk Low on Nike! https://nike.com/t/dunk?x=1. '), { text: 'Check out Dunk Low on Nike! https://nike.com/t/dunk?x=1.', url: 'https://nike.com/t/dunk?x=1' });
  assert.equal(splitText('xt-6 in 10.5').url, null);
});

test('web lookup result becomes a draft that needs review', () => {
  const d = draftFromLookup({ found: true, merchant_name: 'Salomon', merchant_url: 'https://www.salomon.com', product_url: 'https://www.salomon.com/en-us/xt-6', title: 'XT-6', variant: 'Black / 10.5', unit_price: '$200.00' }, 'xt6');
  assert.deepEqual([d.merchant.name, d.merchant.url, d.items[0].price_cents, d.needs_review], ['Salomon', 'https://www.salomon.com', 20000, true]);
  assert.equal(draftFromLookup({ found: false }, 'mystery thing $5').items[0].title, 'mystery thing');
  assert.equal(draftFromLookup({ found: true, title: 'x', product_url: 'javascript:alert(1)', unit_price: '$1' }, 'x').items[0].url, null);
});

test('text lookup asks Claude with web search and resumes paused turns', async () => {
  const calls = [];
  const client = { beta: { messages: { create: async (req) => {
    calls.push(req);
    if (calls.length === 1) return { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }] };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here you go: {"found":true,"merchant_name":"Salomon","merchant_url":"https://salomon.com","product_url":"https://salomon.com/xt6","title":"XT-6","variant":"10.5","unit_price":"$200"}' }] };
  } } } };
  const pages = [];
  const fromUrl = async (u) => (pages.push(u), { items: [{ title: 'XT-6', price_cents: 20000, image_url: 'https://salomon.com/xt6.jpg' }] });
  const d = await captureFromText('salomon xt-6 in 10.5', { client, fromUrl, sizes: 'shoes US 10.5' });
  assert.equal(calls.length, 2);
  assert.match(calls[0].messages[0].content, /saved size \(shoes US 10\.5\)/, 'saved sizes go in the prompt');
  assert.deepEqual(pages, ['https://salomon.com/xt6']);
  assert.equal(d.items[0].image_url, 'https://salomon.com/xt6.jpg', 'the photo comes from the product page');
  assert.equal(calls[0].tools[0].type, 'web_search_20260209');
  assert.equal(calls[1].messages.at(-1).role, 'assistant', 'paused turn is continued');
  assert.equal(d.items[0].price_cents, 20000);
});

test('when the AI is unavailable, typing what you want still works and screenshots say why', async () => {
  const { Anthropic, anthropicClient } = await import('../src/anthropic.js');
  const { captureFromText, captureFromScreenshot } = await import('../src/capture.js');
  const down = { beta: { messages: { create: async () => { throw new Anthropic.BadRequestError(400, undefined, 'This API key is not scoped to a workspace', new Headers()); } } } };
  const quiet = console.error;
  console.error = () => {};
  try {
    const d = await captureFromText('black salomon xt-6 size 10.5 $200', { client: down });
    assert.equal(d.needs_review, true);
    assert.equal(d.items[0].price_cents, 20000);
    assert.match(d.warning, /couldn’t look that up/);
    await assert.rejects(captureFromScreenshot({ data: 'aGk=', media_type: 'image/png' }, { client: down }), /Couldn’t read screenshots right now/);
  } finally {
    console.error = quiet;
  }
  // A key without a workspace names one on every request.
  assert.equal(anthropicClient({ ANTHROPIC_WORKSPACE_ID: 'wrkspc_1' })._options.defaultHeaders['anthropic-workspace-id'], 'wrkspc_1');
});

test('a store’s bot check is not a product: no fake item, and a clear note to fill it in', async () => {
  const wall = '<html><head><title>Robot or human?</title></head><body>Activate and hold the button to confirm that you’re human.</body></html>';
  const d = parseProductHtml(wall, 'https://www.walmart.com/ip/123');
  assert.equal(d.items.length, 0);
  assert.equal(d.needs_review, true);
  assert.match(d.warning, /Walmart doesn’t let Spot read its pages/);
  for (const t of ['Just a moment...', 'Access Denied', 'Pardon Our Interruption']) {
    assert.equal(parseProductHtml(`<title>${t}</title>`, 'https://shop.example.com/p').items.length, 0, t);
  }
  // A real product called "Security Check Kit" with structured data still works.
  assert.equal(parseProductHtml(LD_PAGE, 'https://www.aritzia.com/us/en/product/super-puff/123.html').warning, undefined);

  // Redirect chains (affiliate short links) are followed, but not forever.
  const loop = async (u) => new Response(null, { status: 302, headers: { location: `${new URL(u).origin}/again` } });
  await assert.rejects(() => captureFromUrl('https://short.example/x', { fetchImpl: loop, allowPrivate: true }), /redirects too many times/);
});
