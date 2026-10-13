import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/server.js';
import { sandboxProvider } from '../src/providers.js';
import { describePhoto, postAsk, readPost, socialOf } from '../src/social.js';

const res = (status, body = '', headers = {}) => new Response(body, { status, headers });

test('links from social apps are known by host, and nothing else is', () => {
  assert.deepEqual(socialOf('https://vm.tiktok.com/ZMabc/'), { name: 'TikTok', marketplace: false });
  assert.equal(socialOf('https://www.instagram.com/p/xyz/').name, 'Instagram');
  assert.equal(socialOf('https://pin.it/1a2b').name, 'Pinterest');
  assert.equal(socialOf('https://www.pinterest.co.uk/pin/123/').name, 'Pinterest');
  assert.equal(socialOf('https://youtu.be/abc').name, 'YouTube');
  assert.deepEqual(socialOf('https://www.facebook.com/marketplace/item/123/'), { name: 'Facebook', marketplace: true });
  assert.equal(socialOf('https://shop.nike.com/p/1'), null);
  assert.equal(socialOf('https://notiktok.com/x'), null);
  assert.equal(socialOf('https://tiktok.com.evil.example/x'), null);
  assert.equal(socialOf('not a link'), null);
});

test('a TikTok short link: followed to the video, its caption from the embed info', async () => {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(String(u));
    if (String(u).startsWith('https://vm.tiktok.com/')) return res(301, '', { location: 'https://www.tiktok.com/@kai/video/123?is_from_webapp=1' });
    if (String(u).startsWith('https://www.tiktok.com/oembed')) return res(200, JSON.stringify({ title: 'obsessed with my new Arc&#39;teryx Beta jacket #gorpcore', author_name: 'Kai' }), { 'content-type': 'application/json' });
    return res(200, '<html><head><title>TikTok - Make Your Day</title></head></html>');
  };
  const post = await readPost('https://vm.tiktok.com/ZMabc/', { fetchImpl, allowPrivate: true });
  assert.equal(post.name, 'TikTok');
  assert.equal(post.caption, "obsessed with my new Arc'teryx Beta jacket #gorpcore");
  assert.equal(post.author, 'Kai');
  assert.equal(post.image_url, '');
  assert.match(calls[2], /oembed\?url=https%3A%2F%2Fwww\.tiktok\.com%2F%40kai%2Fvideo%2F123/, 'the embed info is asked for the video itself');
});

test('an Instagram post: its share tags, like counts dropped; a sign-in wall gives no caption', async () => {
  const page = `<meta property="og:title" content="Maya on Instagram"><meta property="og:description" content="1,204 likes, 33 comments - maya on October 1, 2026: &quot;New Vuori joggers in heather grey, so soft&quot;">`;
  const post = await readPost('https://www.instagram.com/p/xyz/', { fetchImpl: async () => res(200, page), allowPrivate: true });
  assert.equal(post.caption, 'New Vuori joggers in heather grey, so soft');
  assert.equal(post.author, 'Maya');
  const pin = await readPost('https://www.pinterest.com/pin/1/', { fetchImpl: async () => res(200, '<meta content="https://i.pinimg.com/736x/a.jpg" property="og:image"/><meta content="Pinterest" property="og:site_name"/>'), allowPrivate: true });
  assert.equal(pin.caption, '');
  assert.equal(pin.image_url, 'https://i.pinimg.com/736x/a.jpg', 'a pin with no words still has its photo');

  const wall = await readPost('https://www.instagram.com/p/xyz/', { fetchImpl: async () => res(200, '<meta property="og:title" content="Instagram"><meta name="description" content="Log in">'), allowPrivate: true });
  assert.equal(wall.caption, '');
  const down = await readPost('https://www.instagram.com/p/xyz/', { fetchImpl: async () => { throw new Error('offline'); }, allowPrivate: true });
  assert.equal(down.caption, '', 'never throws');
});

test('a short link that leaves the app is not followed', async () => {
  const calls = [];
  const post = await readPost('https://pin.it/1a2b', { fetchImpl: async (u) => (calls.push(String(u)), res(302, '', { location: 'https://evil.example/' })), allowPrivate: true });
  assert.ok(!calls.some((u) => u.includes('evil.example')), calls.join(' '));
  assert.equal(post.caption, '');
});

test("the search a post becomes: the caption, the brand's own store first, their words kept, the link left out", () => {
  const ask = postAsk({ name: 'TikTok', caption: 'my new Arc’teryx Beta jacket', author: 'Kai' }, 'this in black https://vm.tiktok.com/ZMabc/');
  assert.match(ask, /^this in black\. Find the product in this TikTok post by Kai \(its caption says "my new Arc’teryx Beta jacket"\)/);
  assert.match(postAsk({ name: 'Pinterest', caption: '', seen: 'Arc’teryx Beta jacket in black' }), /this Pinterest post \(its photo shows Arc’teryx Beta jacket in black\)/);
  assert.match(ask, /brand's own online store first/);
  assert.doesNotMatch(ask, /https?:/);
  assert.doesNotMatch(postAsk({ name: 'TikTok', caption: 'x jacket' }, "Check out Kai's video! #TikTok https://vm.tiktok.com/Z/"), /Check out/, 'the app’s share text is dropped');
  assert.match(postAsk({ name: 'Facebook', marketplace: true, caption: 'Herman Miller Aeron size B' }), /find the same product new at stores/);
});

test('the shelf: a shared post is searched for what it shows, or says to screenshot it', async (t) => {
  const asked = [];
  const stream = async (text, o, write) => {
    asked.push(text);
    write({ type: 'pick', option: { merchant: { name: 'Arc’teryx' }, item: { title: 'Beta Jacket', url: 'https://arcteryx.example/beta', image_url: 'https://cdn.arcteryx.example/b.jpg', price_cents: 40000 }, stock: 'in' } });
    write({ type: 'done', kind: 'products', count: 1 });
  };
  let reads = 0;
  const readPostStub = async (url) => (reads++, url.includes('instagram') ? { name: 'Instagram', url, caption: '', author: '', image_url: '' } : url.includes('pin') ? { name: 'Pinterest', url, caption: '', author: '', image_url: 'https://i.pinimg.com/a.jpg' } : { name: 'TikTok', url, caption: 'my new Arc’teryx Beta jacket', author: 'Kai', image_url: '' });
  const describeStub = async (post) => (post.image_url ? 'black Arc’teryx Beta shell jacket' : '');
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_AGENT: 'off' }, capture: { stream, readPost: readPostStub, describePhoto: describeStub } });
  t.after(() => a.close());
  const call = async (text) => (await a.inject({ method: 'POST', url: '/v1/capture/stream', payload: { text } })).body.trim().split('\n').map((l) => JSON.parse(l));

  const lines = await call('https://vm.tiktok.com/ZMabc/');
  assert.deepEqual(lines[0], { type: 'post', name: 'TikTok', author: 'Kai', caption: 'my new Arc’teryx Beta jacket', seen: '' });
  assert.equal(lines[1].type, 'pick');
  assert.match(asked[0], /^Find the product in this TikTok post by Kai/);
  await call('https://vm.tiktok.com/ZMabc/');
  assert.equal(reads, 1, 'the next batch reuses the read');

  const wall = await call('https://www.instagram.com/p/xyz/');
  assert.equal(wall.at(-1).type, 'done');
  assert.equal(wall.at(-1).not_found, true);
  assert.match(wall.at(-1).warning, /Instagram didn’t show Spot what’s in that post\. Screenshot it/);
  assert.equal(asked.length, 2, 'nothing searched for a post it couldn’t read');

  // A pin with no words: found from its photo.
  const pin = await call('https://pin.it/1a2b');
  assert.equal(pin[0].seen, 'black Arc’teryx Beta shell jacket');
  assert.match(asked.at(-1), /its photo shows black Arc’teryx Beta shell jacket/);

  // The one-card path says the same.
  const one = await a.inject({ method: 'POST', url: '/v1/capture', payload: { text: 'https://www.instagram.com/p/xyz/' } });
  assert.equal(one.json().not_found, true);
  assert.match(one.json().warning, /Screenshot it/);

  // A typed ask is untouched.
  await call('pink running shoes');
  assert.equal(asked.at(-1), 'pink running shoes');
});

test('the photo, described: brand and model in a line, nothing when it shows no product', async () => {
  const seen = [];
  const client = (line, stop = 'end_turn') => ({ beta: { messages: { create: async (req) => (seen.push(req), { model: 'm', usage: {}, stop_reason: stop, content: [{ type: 'text', text: line }] }) } } });
  const img = async () => res(200, Buffer.from('jpegbytes'), { 'content-type': 'image/jpeg' });
  const opts = (line) => ({ client: client(line), fetchImpl: img, allowPrivate: true });
  assert.equal(await describePhoto({ name: 'Pinterest', image_url: 'https://i.pinimg.com/a.jpg', caption: '' }, opts('Arc’teryx Beta jacket, black')), 'Arc’teryx Beta jacket, black');
  assert.deepEqual(seen[0].messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from('jpegbytes').toString('base64') } }, 'Spot sends the photo itself; the image hosts turn the model away');
  assert.equal(await describePhoto({ name: 'TikTok', image_url: 'https://p16.example/a.jpg', caption: 'my dog' }, opts('NONE')), '');
  assert.equal(await describePhoto({ name: 'TikTok', image_url: '' }, opts('x')), '', 'no photo, no call');
  assert.equal(await describePhoto({ name: 'TikTok', image_url: 'https://p16.example/a.jpg' }, { ...opts('x'), fetchImpl: async () => res(200, '<html>', { 'content-type': 'text/html' }) }), '', 'not an image, no call');
  assert.equal(await describePhoto({ name: 'TikTok', image_url: 'https://p16.example/a.jpg' }, { ...opts('x'), fetchImpl: async () => res(404) }), '');
  assert.equal(seen.length, 2);
});
