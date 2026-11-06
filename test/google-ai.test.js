import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { googleKey, googleKeyProblem, checkGoogleKey, aspectOf, geminiImage, googleImageConfig, veoVideo, googleVideoConfig } from '../src/google-ai.js';
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
  // a variable named for Gemini is taken as set, whatever the key's format; quotes pasted round it come off
  assert.deepEqual(googleKey({ GEMINI_API_KEY: 'AQ.Ab8RN6' + 'z'.repeat(30) }), { key: 'AQ.Ab8RN6' + 'z'.repeat(30), from: 'GEMINI_API_KEY' });
  assert.equal(googleKey({ GEMINI_API_KEY: `"${KEY}"` }).key, KEY);
  assert.equal(googleKey({ GEMINI_API_KEY: 'has a space in it but long enough' }), null);
  assert.match(googleKeyProblem({ GEMINI_API_KEY: 'short' }), /GEMINI_API_KEY is set but is not used: it is too short/);
  assert.ok(!googleKeyProblem({ GEMINI_API_KEY: 'short' }).includes('short ('), 'the value is never repeated');
  assert.equal(googleKeyProblem({ GEMINI_API_KEY: KEY }), null);
});

test('the key check asks Google once, with the key in a header', async () => {
  let seen; const r = await checkGoogleKey({ GEMINI_API_KEY: KEY }, async (url, o) => { seen = { url, key: o.headers['x-goog-api-key'] }; return new Response('{}', { status: 200 }); });
  assert.deepEqual(r, { ok: true, status: 200 }); assert.match(seen.url, /\/v1beta\/models\?pageSize=1$/); assert.equal(seen.key, KEY);
  assert.deepEqual(await checkGoogleKey({ GEMINI_API_KEY: KEY }, async () => new Response('{}', { status: 400 })), { ok: false, status: 400 });
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

test('a Veo model Google no longer offers is replaced by the best one the key has, and the walk is made with it', async () => {
  const { veoVideo, rankVeo, _resetVeo } = await import('../src/google-ai.js'); _resetVeo();
  assert.deepEqual(rankVeo(['veo-2.0-generate-001', 'veo-3.1-fast-generate-001', 'veo-3.1-generate-preview', 'veo-3.1-generate-001', 'veo-3.0-generate-001']),
    ['veo-3.1-generate-001', 'veo-3.1-generate-preview', 'veo-3.1-fast-generate-001', 'veo-3.0-generate-001', 'veo-2.0-generate-001']);
  const asked = [];
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o), arrayBuffer: async () => new ArrayBuffer(4) });
  const fetchImpl = async (url, o = {}) => {
    asked.push(`${o.method || 'GET'} ${url.replace('https://g.test', '')}`);
    if (url.includes(':predictLongRunning')) return url.includes('veo-3.1-generate-preview') ? json({ error: { code: 404, message: 'models/veo-3.1-generate-preview is not found for API version v1beta' } }, 404) : json({ name: 'operations/1', done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://g.test/file.mp4' } }] } } });
    if (url.includes('/v1beta/models?')) return json({ models: [{ name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/veo-3.0-generate-001', supportedGenerationMethods: ['predictLongRunning'] }, { name: 'models/veo-3.1-generate-001', supportedGenerationMethods: ['predictLongRunning'] }] });
    return json({});
  };
  const out = await veoVideo({ prompt: 'walk', cfg: { model: 'veo-3.1-generate-preview', origin: 'https://g.test', aspect: '9:16', seconds: '8' }, env: { GEMINI_API_KEY: KEY }, fetchImpl, sleep: async () => {} });
  assert.equal(out.model, 'veo-3.1-generate-001');
  assert.ok(asked.some(a => a.includes('/v1beta/models/veo-3.1-generate-001:predictLongRunning')));
  _resetVeo();
});

test('a key with no Veo model says so, and how to get one, instead of only the 404', async () => {
  const { veoVideo, _resetVeo } = await import('../src/google-ai.js'); _resetVeo();
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  const fetchImpl = async url => url.includes(':predictLongRunning') ? json({ error: { code: 404, message: 'not found' } }, 404)
    : json({ models: [{ name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
  await assert.rejects(veoVideo({ prompt: 'walk', cfg: { model: 'veo-3.1-generate-preview', origin: 'https://g.test', aspect: '9:16', seconds: '8' }, env: { GEMINI_API_KEY: KEY }, fetchImpl, sleep: async () => {} }),
    e => /no Veo video model/.test(e.message) && /paid Gemini API plan/.test(e.message) && /2 Google models/.test(e.message));
  _resetVeo();
});
