import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { VIEW_KINDS, SPIN_KINDS, kindsFor, canWalk, viewPrompt, makeViews, makeWalk, videoConfig, fixtureView, walkPrompt } from '../src/lab-views.js';

const concept = { name: 'Washed boxy tee', category: 'tops', twist: 'a dropped back hem', spec: { colors: ['navy'] } };
const tinyJpeg = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).jpeg().toBuffer();

test('every kind of piece gets the flats; only pieces that are worn get the model views and a walk', () => {
  assert.equal(kindsFor('tops').length, VIEW_KINDS.length);
  assert.deepEqual(kindsFor('home'), ['flat_front', 'flat_back']);
  assert.equal(canWalk('home'), false); assert.equal(canWalk('footwear'), true);
  assert.deepEqual(SPIN_KINDS, ['model_front', 'model_34', 'model_side', 'model_back']);
});

test('prompts keep the approved design, ask for a man, never invite new logos, and frame each product its own way', () => {
  const flat = viewPrompt(concept, 'flat_front'), back = viewPrompt(concept, 'flat_back'), front = viewPrompt(concept, 'model_front'), side = viewPrompt(concept, 'model_side');
  assert.match(flat, /flat product photograph/); assert.match(flat, /Ignore the small dark inset label card/); assert.match(flat, /no logos/i);
  assert.match(back, /Add no logo, graphic or text that the reference does not show on its back/);
  assert.match(front, /a man wearing exactly this piece/); assert.match(front, /full-length/);
  assert.match(side, /same man in the very same outfit/); assert.match(side, /turned 90 degrees/);
  assert.match(viewPrompt({ ...concept, category: 'footwear' }, 'model_front'), /lower legs and feet/);
  assert.match(viewPrompt({ ...concept, category: 'headwear' }, 'model_front'), /head-and-shoulders/);
  assert.match(viewPrompt({ ...concept, category: 'footwear' }, 'flat_front'), /single shoe in side profile/);
});

test('views are drawn flats first, then the front on the model, then the other angles, each from the right references', async () => {
  const order = [], calls = [], pic = await tinyJpeg();
  const edit = async ({ images, prompt }) => { calls.push({ n: images.length, prompt }); return tinyJpeg(); };
  const done = await makeViews({ concept, picture: pic, kinds: ['model_back', 'flat_back', 'model_front', 'flat_front', 'model_34'], cfg: { provider: 'openai', configured: true, model: 'm' }, edit, onView: (k, r) => order.push([k, Boolean(r)]) });
  const kinds = order.map(o => o[0]);
  assert.deepEqual(kinds.slice(0, 2).sort(), ['flat_back', 'flat_front']); assert.equal(kinds[2], 'model_front'); assert.deepEqual(kinds.slice(3).sort(), ['model_34', 'model_back']);
  assert.equal(Object.keys(done).length, 5);
  assert.equal(calls[2].n, 2, 'the front view on the model gets the picture and the flat'); assert.equal(calls[3].n, 2, 'the other angles get the model front and the flat');
});

test('a failed front view skips the angles that depend on it, and says why', async () => {
  const notes = {}, pic = await tinyJpeg();
  const edit = async ({ prompt }) => { if (/straight from the front/.test(prompt) && /man wearing exactly/.test(prompt)) throw new Error('refused'); return tinyJpeg(); };
  await makeViews({ concept, picture: pic, kinds: ['model_front', 'model_34'], cfg: { provider: 'openai', configured: true }, edit, onView: (k, r, note) => { notes[k] = { ok: Boolean(r), note }; } });
  assert.equal(notes.model_front.ok, false); assert.match(notes.model_front.note, /refused/); assert.equal(notes.model_34.ok, false); assert.match(notes.model_34.note, /front view on the model/);
});

test('the test placeholder draws a real image for every kind, and a piece with no model never gets model views', async () => {
  for (const k of ['flat_front', 'model_34']) assert.ok((await sharp(await fixtureView(concept, k)).metadata()).width === 1024);
  const got = []; await makeViews({ concept: { ...concept, category: 'home' }, picture: await tinyJpeg(), kinds: ['flat_front', 'model_front'], cfg: { provider: 'fixture', configured: true }, onView: k => got.push(k) });
  assert.deepEqual(got, ['flat_front']);
});

test('the video model is used only when connected, and the walk waits for it, then fetches the finished clip', async () => {
  assert.equal(videoConfig({}).configured, false); assert.match(videoConfig({}).note, /no video model/);
  assert.equal(videoConfig({ LAB_VIDEO_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }).configured, true);
  assert.equal(videoConfig({ LAB_VIDEO_PROVIDER: 'off', OPENAI_API_KEY: 'k' }).configured, false);
  await assert.rejects(makeWalk({ concept, frame: await tinyJpeg(), cfg: videoConfig({}) }), /no video model/i);
  const seen = []; let polls = 0;
  const fetchImpl = async (url, o = {}) => {
    seen.push(`${o.method || 'GET'} ${url.replace('https://v.test', '')}`);
    if (url.endsWith('/v1/videos')) return new Response(JSON.stringify({ id: 'vid_1', status: 'queued' }), { status: 200 });
    if (url.endsWith('/content')) return new Response(Buffer.from('MP4BYTES'), { status: 200 });
    return new Response(JSON.stringify({ id: 'vid_1', status: ++polls >= 2 ? 'completed' : 'in_progress' }), { status: 200 });
  };
  const cfg = { ...videoConfig({ LAB_VIDEO_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }), origin: 'https://v.test' };
  const w = await makeWalk({ concept, frame: await tinyJpeg(), cfg, fetchImpl, sleep: async () => {}, env: { OPENAI_API_KEY: 'k' } });
  assert.equal(w.video.toString(), 'MP4BYTES'); assert.equal(w.mime, 'video/mp4'); assert.equal(seen[0], 'POST /v1/videos'); assert.ok(seen.at(-1).endsWith('/content'));
  const failing = async (url) => (url.endsWith('/v1/videos') ? new Response(JSON.stringify({ id: 'v', status: 'failed', error: { message: 'policy' } }), { status: 200 }) : new Response('{}', { status: 200 }));
  await assert.rejects(makeWalk({ concept, frame: await tinyJpeg(), cfg, fetchImpl: failing, sleep: async () => {}, env: { OPENAI_API_KEY: 'k' } }), /policy/);
  assert.match(walkPrompt(concept), /walks steadily toward the camera/);
  const gone = async () => new Response('', { status: 404 }), openai = videoConfig({ LAB_VIDEO_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
  await assert.rejects(makeWalk({ concept, frame: await tinyJpeg(), cfg: openai, fetchImpl: gone, sleep: async () => {}, env: { OPENAI_API_KEY: 'k' } }), /shut down its video model/);
});

test('the walk is framed without a face, and when the picture is refused it is made from words alone', async () => {
  const seen = []; let n = 0;
  const fetchImpl = async (url, o = {}) => {
    if (url.endsWith('/v1/videos')) { n++; seen.push(o.body.get('input_reference') ? 'with picture' : 'words only'); return n === 1 ? new Response('{"error":{"message":"faces are not allowed"}}', { status: 400 }) : new Response(JSON.stringify({ id: 'v', status: 'completed' }), { status: 200 }); }
    if (url.endsWith('/content')) return new Response(Buffer.from('MP4'), { status: 200 });
    return new Response(JSON.stringify({ id: 'v', status: 'completed' }), { status: 200 });
  };
  const cfg = { ...videoConfig({ LAB_VIDEO_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }), origin: 'https://v.test' };
  const w = await makeWalk({ concept: { ...concept, spec: { description: 'a washed tee', colors: ['navy'] } }, frame: await tinyJpeg(), cfg, fetchImpl, sleep: async () => {}, env: { OPENAI_API_KEY: 'k' } });
  assert.deepEqual(seen, ['with picture', 'words only']); assert.equal(w.video.toString(), 'MP4');
  assert.match(walkPrompt(concept), /from the shoulders down/); assert.doesNotMatch(walkPrompt(concept), /his face/);
});
