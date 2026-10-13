// Discover mode: shops they wouldn't find on their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { lookupPrompt } from '../src/capture.js';

const cfg = { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 };

test('the search, in Discover mode: independent shops, no big chains unless named, not the stores already shown', () => {
  const plain = lookupPrompt({ text: 'black jeans' });
  assert.doesNotMatch(plain, /Discover mode/);
  const d = lookupPrompt({ text: 'black jeans', discover: true, skipStores: ['tecovas.com', 'cncpts.com', 'evil"; drop'] });
  assert.match(d, /Discover mode is on/);
  assert.match(d, /independent and smaller online stores/);
  assert.match(d, /Amazon, Walmart, Target/);
  assert.match(d, /unless they named one/);
  assert.match(d, /already been shown these stores, so find others: tecovas\.com, cncpts\.com, evildrop\./);
});

test('the shelf passes Discover on, with the stores a signed-in shopper has seen most', async (t) => {
  const got = [];
  const stream = async (text, o, write) => {
    got.push(o);
    write({ type: 'pick', option: { merchant: { name: 'Tecovas', url: 'https://www.tecovas.com' }, item: { title: 'Boot', url: 'https://www.tecovas.com/p/boot', image_url: 'https://cdn.example/b.jpg', price_cents: 20000 }, stock: 'in' } });
    write({ type: 'done', kind: 'products', count: 1 });
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { SPOT_AGENT: 'off' }, capture: { stream } });
  t.after(() => a.close());
  const start = await a.inject({ method: 'POST', url: '/v1/auth/start', payload: { email: 'kyle@example.com' } });
  const cookie = (await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email: 'kyle@example.com', code: start.json().code } })).headers['set-cookie'].split(';')[0];
  const call = (payload) => a.inject({ method: 'POST', url: '/v1/capture/stream', payload, headers: { cookie } });

  await call({ text: 'boots' });
  assert.equal(got[0].discover, undefined, 'off unless asked');
  await call({ text: 'boots', discover: true });
  assert.equal(got[1].discover, true);
  assert.deepEqual(got[1].skipStores, ['tecovas.com'], 'what they were shown before');
  await a.inject({ method: 'POST', url: '/v1/capture/stream', payload: { text: 'boots', discover: true } });
  assert.deepEqual(got[2].skipStores, [], 'signed out: nothing to leave out but the links already shown');
});
