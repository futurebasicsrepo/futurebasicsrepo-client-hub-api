import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { googleKey, aspectOf, geminiImage, googleImageConfig, veoVideo, googleVideoConfig } from '../src/google-ai.js';
import { imageConfig, openaiEdit, openaiImage } from '../src/check.js';
import { videoConfig } from '../src/lab-views.js';

const KEY = 'AIza' + 'x'.repeat(35);
const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c33' } }).png().toBuffer();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const picture = b => json({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: b.toString('base64') } }] } }] });

test('the Google key is read from the variable it was given under, and only when it looks like one', () => {
  assert.deepEqual(googleKey({ google_ai_studio: KEY }), { key: KEY, from: 'google_ai_studio' });
  assert.equal(googleKey({ GEMINI_API_KEY: KEY, google_ai_studio: 'AIza' + 'y'.repeat(35) }).from, 'GEMINI_API_KEY', 'GEMINI_API_KEY first');
  assert.equal(googleKey({ google_ai_studio: 'sk-not-google' }), null, 'something else is never sent to Google');
  assert.equal(googleKey({}), null);
});

test('a size becomes the nearest aspect ratio Google takes', () => {
  assert.equal(aspectOf('1024x1024'), '1:1'); assert.equal(aspectOf('1024x1536'), '2:3'); assert.equal(aspectOf('1536x1024'), '3:2'); assert.equal(aspectOf('720x1280'), '9:16'); assert.equal(aspectOf('nonsense'), '1:1');
});

test('an edit goes to Google with its reference pictures and comes back as a picture; an unknown model falls back once', async () => {
  const env = { google_ai_studio: KEY }, cfg = googleImageConfig(env), calls = [];
  const fetchImpl = async (_n, url, o) => { calls.push({ url, o }); return calls.length === 1 ? json({ error: { message: 'models/gemini-3-pro-image-preview is not found' } }, 404) : picture(png); };
  const out = await geminiImage({ prompt: 'make it a photo', images: [png, png], size: '1024x1536', cfg, env, fetchImpl });
  assert.deepEqual(out, png);
  assert.match(calls[0].url, /\/v1beta\/models\/gemini-3-pro-image-preview:generateContent$/); assert.match(calls[1].url, /gemini-2\.5-flash-image:generateContent$/);
  assert.equal(calls[0].o.headers['x-goog-api-key'], KEY, 'the key in a header, never in the address'); assert.ok(!calls[0].url.includes(KEY));
  const body = JSON.parse(calls[0].o.body), b2 = JSON.parse(calls[1].o.body);
  assert.equal(body.contents[0].parts.length, 3); assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'image/png');
  assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE']); assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: '2:3', imageSize: '2K' });
  assert.deepEqual(b2.generationConfig.imageConfig, { aspectRatio: '2:3' }, 'the older model is not sent a size it does not take');
  await assert.rejects(geminiImage({ prompt: 'x', cfg, env, fetchImpl: async () => json({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }) }), e => e.blocked === true);
});

test('which provider draws what: edits to Google first, words to OpenAI; one key alone does everything', () => {
  const both = imageConfig({ OPENAI_API_KEY: 'sk', google_ai_studio: KEY });
  assert.deepEqual([both.provider, both.route.edit, both.route.gen], ['openai', 'google', 'openai']);
  assert.deepEqual(imageConfig({ OPENAI_API_KEY: 'sk', google_ai_studio: KEY, IMAGE_EDIT_PROVIDER: 'openai' }).route.edit, 'openai', 'the service can say otherwise');
  const g = imageConfig({ google_ai_studio: KEY }); assert.deepEqual([g.provider, g.configured, g.route.edit, g.route.gen], ['google', true, 'google', 'google']);
  assert.deepEqual(imageConfig({ OPENAI_API_KEY: 'sk' }).route, { edit: 'openai', gen: 'openai' });
});

test('an edit that Google cannot draw is drawn by OpenAI; a masked edit goes to OpenAI', async () => {
  const saved = { fetch: globalThis.fetch, OPENAI: process.env.OPENAI_API_KEY, G: process.env.google_ai_studio };
  process.env.OPENAI_API_KEY = 'sk-test'; process.env.google_ai_studio = KEY;
  const hits = [];
  globalThis.fetch = async url => { hits.push(String(url)); if (/googleapis/.test(url)) return json({ error: { message: 'overloaded' } }, 503); return json({ data: [{ b64_json: png.toString('base64') }] }); };
  try {
    const cfg = imageConfig(process.env);
    assert.deepEqual(await openaiEdit({ images: [png], prompt: 'p', cfg }), png);
    assert.ok(/googleapis/.test(hits[0]) && /api\.openai\.com\/v1\/images\/edits/.test(hits[1]), hits.join(' '));
    hits.length = 0; await openaiEdit({ images: [png], prompt: 'p', cfg, mask: png });
    assert.ok(hits.length === 1 && /openai/.test(hits[0]), 'a mask: OpenAI only');
    hits.length = 0; await openaiImage('words', cfg);
    assert.ok(/openai\.com\/v1\/images\/generations/.test(hits[0]), 'a picture from words: OpenAI first');
  } finally { globalThis.fetch = saved.fetch; if (saved.OPENAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.OPENAI; if (saved.G === undefined) delete process.env.google_ai_studio; else process.env.google_ai_studio = saved.G; }
});

test('the walk video goes to Veo: started, asked after, fetched; a refused first frame falls back to words', async () => {
  assert.equal(videoConfig({ google_ai_studio: KEY, LAB_VIDEO_PROVIDER: 'openai', OPENAI_API_KEY: 'sk' }).provider, 'google', 'in place of the shut-down OpenAI video');
  assert.equal(videoConfig({ google_ai_studio: KEY, LAB_VIDEO_PROVIDER: 'off' }).provider, 'off');
  const env = { google_ai_studio: KEY }, cfg = googleVideoConfig(env), calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, body: o.body ? JSON.parse(o.body) : null, key: o.headers?.['x-goog-api-key'] });
    if (/predictLongRunning/.test(url)) return calls.filter(c => /predictLongRunning/.test(c.url)).length === 1 ? json({ error: { message: 'image not allowed' } }, 400) : json({ name: 'models/veo/operations/op1', done: false });
    if (/operations\/op1/.test(url)) return json({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://files.example/v.mp4' } }] } } });
    if (/files\.example/.test(url)) return new Response(Buffer.from('MP4DATA'), { status: 200 });
    return json({}, 404);
  };
  const out = await veoVideo({ prompt: 'walk', image: png, cfg, env, fetchImpl, sleep: async () => {} });
  assert.equal(out.video.toString(), 'MP4DATA'); assert.equal(out.mime, 'video/mp4');
  assert.ok(calls[0].body.instances[0].image && !calls[1].body.instances[0].image, 'refused with the frame, made from words');
  assert.equal(calls[0].body.parameters.aspectRatio, '9:16'); assert.equal(calls[0].body.parameters.durationSeconds, 8);
  assert.ok(calls.every(c => c.key === KEY));
});
