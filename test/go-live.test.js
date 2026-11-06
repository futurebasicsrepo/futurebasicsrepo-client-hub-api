import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GO_LIVE, TEMPLATE_KEYS, templateFor } from '../src/go-live.js';

test('each go-live checklist has work on both sides, with unique titles', () => {
  for (const k of TEMPLATE_KEYS) {
    const items = GO_LIVE[k].items;
    assert.ok(items.some(i => i.who === 'client') && items.some(i => i.who === 'fb'), k);
    assert.ok(items.every(i => ['client', 'fb'].includes(i.who) && i.title && i.title.length <= 200), k);
    assert.equal(new Set(items.map(i => i.title)).size, items.length, `${k}: a title repeated would be skipped as already there`);
  }
});

test('a Shopify build or store address takes the store launch, anything else the website launch', () => {
  assert.equal(templateFor({ hosting: 'shopify' }), 'shopify');
  assert.equal(templateFor({ url: 'https://cg12concept.myshopify.com/password' }), 'shopify');
  assert.equal(templateFor({ hosting: 'railway', url: 'https://example.com' }), 'site');
  assert.equal(templateFor(), 'site');
});
