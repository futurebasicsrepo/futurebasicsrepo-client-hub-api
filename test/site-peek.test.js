import test from 'node:test';
import assert from 'node:assert/strict';
import { readPage, peekSite, siteStack } from '../src/site-peek.js';

const SHOP = `<html><head><title>Field Supply</title><meta property="og:site_name" content="Ouster Field Supply"><meta property="og:image" content="//cdn.shopify.com/s/files/share.jpg">
<script>Shopify.shop = "ouster-field.myshopify.com"; Shopify.theme = {"name":"Dawn","id":1};</script><script src="https://static.klaviyo.com/onsite.js"></script></head><body class="template-password"></body></html>`;

test('a Shopify store behind its password page: platform, shop, theme, tools, share picture', () => {
  const f = readPage(SHOP, 'https://fieldsupply.example.com/password', { 'CF-Ray': 'x' });
  assert.equal(f.platform, 'shopify'); assert.equal(f.hostLabel, 'Shopify', 'a Shopify store behind Cloudflare is hosted on Shopify');
  assert.equal(f.shop, 'ouster-field.myshopify.com'); assert.equal(f.theme, 'Dawn'); assert.equal(f.password, true);
  assert.equal(f.title, 'Ouster Field Supply'); assert.equal(f.image, 'https://cdn.shopify.com/s/files/share.jpg'); assert.deepEqual(f.tools, ['Klaviyo']);
});

test('a Next.js site on Vercel', () => {
  const f = readPage('<script id="__NEXT_DATA__"></script><script src="/_next/static/x.js"></script>', 'https://x.example.com/', { 'x-vercel-id': 'iad1' });
  assert.equal(f.platformLabel, 'Next.js'); assert.equal(f.hostLabel, 'Vercel'); assert.equal(f.password, false); assert.equal(f.image, '');
});

test('the look fetches the page then its picture, and a site that does not answer is reported, not thrown', async () => {
  const png = Buffer.alloc(900, 1), lookup = async () => [{ address: '93.184.216.34' }];
  const fetchImpl = async url => url.includes('share.jpg')
    ? { status: 200, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => png }
    : { status: 200, headers: new Headers({ 'content-type': 'text/html' }), arrayBuffer: async () => Buffer.from(SHOP) };
  const r = await peekSite('https://fieldsupply.example.com', { fetchImpl, lookup });
  assert.equal(r.facts.status, 200); assert.equal(r.facts.theme, 'Dawn'); assert.equal(r.image.type, 'image/png'); assert.equal(r.image.body.length, 900);
  const down = await peekSite('https://gone.example.com', { fetchImpl: async () => { throw new Error('refused'); }, lookup });
  assert.match(down.facts.error, /could not be reached/); assert.equal(down.image, null);
  const priv = await peekSite('https://inside.example.com', { fetchImpl, lookup: async () => [{ address: '10.0.0.5' }] });
  assert.ok(priv.facts.error, 'a private address is never fetched');
});

test('the stack tile: password page, store connection, the monitor beats the last look', () => {
  const facts = readPage(SHOP, 'https://fieldsupply.example.com/password', {});
  const locked = siteStack({ url: 'https://fieldsupply.example.com', facts: { ...facts, status: 200, ms: 300 } }, []);
  assert.equal(locked.state, 'locked'); assert.equal(locked.live, 'Pre-launch'); assert.equal(locked.platform, 'Shopify');
  assert.deepEqual(locked.store, { state: 'none', word: 'Not connected', detail: 'ouster-field.myshopify.com' }); assert.ok(locked.chips.includes('Theme: Dawn'));
  const ok = siteStack({ url: 'https://x', facts: { ...facts, password: false, status: 200 } }, [{ status: 'connected', shop: 'ouster-field.myshopify.com', name: 'Ouster' }]);
  assert.equal(ok.store.word, 'Connected'); assert.equal(ok.live, 'Live');
  const built = siteStack({ url: 'https://x', hosting: 'railway', stack: ['Next.js', 'Postgres'], catalog: 4, monitor: { state: 'slow', response_ms: 2400, up30: 99.2 }, facts: { status: 200, ms: 100 } });
  assert.equal(built.state, 'slow'); assert.equal(built.ms, 2400); assert.equal(built.up30, 99.2); assert.equal(built.platform, 'Next.js'); assert.equal(built.hosting, 'Railway'); assert.equal(built.store, null); assert.equal(built.products, 4);
  assert.equal(siteStack({ url: '' }).live, 'Not online yet');
});
