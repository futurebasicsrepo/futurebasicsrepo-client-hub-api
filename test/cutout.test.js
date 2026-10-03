import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cutoutProvider, cutoutEnabled, removeBackground, cutoutQuality, cutoutOnWhite, cutoutFromPhoto, placeCutout } from '../src/cutout.js';

async function scene() {
  const w = 240, h = 160, rgb = Buffer.alloc(w * h * 3, 255);
  for (let y = 30; y < 130; y++) for (let x = 40; x < 200; x++) { const i = (y * w + x) * 3; rgb[i] = 120; rgb[i + 1] = 124; rgb[i + 2] = 130; }
  const png = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}
const alphaPng = async (w, h, paint) => { const rgba = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; rgba[i] = 100; rgba[i + 1] = 100; rgba[i + 2] = 100; rgba[i + 3] = paint(x, y) ? 255 : 0; } return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(); };
const withEnv = async (vars, fn) => { const prev = {}; for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; if (v == null) delete process.env[k]; else process.env[k] = v; } try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };

test('provider follows the keys, the fixture wins for tests', async () => {
  await withEnv({ CUTOUT_FIXTURE: null, CUTOUT_PROVIDER: null, REMOVE_BG_API_KEY: null, PHOTOROOM_API_KEY: null }, async () => { assert.equal(cutoutProvider(), ''); assert.equal(cutoutEnabled(), false); });
  await withEnv({ CUTOUT_FIXTURE: null, CUTOUT_PROVIDER: null, REMOVE_BG_API_KEY: 'k', PHOTOROOM_API_KEY: null }, async () => assert.equal(cutoutProvider(), 'removebg'));
  await withEnv({ CUTOUT_FIXTURE: null, CUTOUT_PROVIDER: null, REMOVE_BG_API_KEY: null, PHOTOROOM_API_KEY: 'k' }, async () => assert.equal(cutoutProvider(), 'photoroom'));
  await withEnv({ CUTOUT_FIXTURE: null, CUTOUT_PROVIDER: 'photoroom', REMOVE_BG_API_KEY: 'k' }, async () => assert.equal(cutoutProvider(), 'photoroom'));
  await withEnv({ CUTOUT_FIXTURE: '1' }, async () => assert.equal(cutoutProvider(), 'fixture'));
});

test('the fixture provider returns a PNG with the product opaque and the background clear', async () => {
  await withEnv({ CUTOUT_FIXTURE: '1' }, async () => {
    const png = await removeBackground(await scene());
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    assert.equal(alpha(5, 5), 0); assert.equal(alpha(120, 80), 255);
    const q = await cutoutQuality(png); assert.equal(q.ok, true, JSON.stringify(q)); assert.ok(q.coverage > 0.3 && q.coverage < 0.6); assert.ok(q.fill > 0.95); assert.ok(q.roughness < 6);
  });
  await assert.rejects(() => removeBackground('nope'), /No readable photo/);
});

test('the quality gate refuses an empty, a full and a ragged mask', async () => {
  const tiny = await cutoutQuality(await alphaPng(200, 200, (x, y) => x < 10 && y < 10)); assert.equal(tiny.ok, false); assert.match(tiny.reasons.join(), /too little/);
  const full = await cutoutQuality(await alphaPng(200, 200, () => true)); assert.equal(full.ok, false); assert.match(full.reasons.join(), /nothing was removed/);
  const holes = await cutoutQuality(await alphaPng(200, 200, (x, y) => (x + y) % 2 === 0 && x > 20 && x < 180 && y > 20 && y < 180)); assert.equal(holes.ok, false); assert.match(holes.reasons.join(), /ragged|holes/);
  const good = await cutoutQuality(await alphaPng(200, 200, (x, y) => Math.hypot(x - 100, y - 100) < 60)); assert.equal(good.ok, true);
});

test('on white: trimmed to the product with air, as a JPEG data URL', async () => {
  const png = await alphaPng(400, 300, (x, y) => x > 100 && x < 300 && y > 100 && y < 200);
  const url = await cutoutOnWhite(png, { max: 400 }); assert.match(url, /^data:image\/jpeg;base64,/);
  const meta = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata();
  assert.ok(meta.width < 260 && meta.width > 200 && meta.height < 140 && meta.height > 100, `trimmed to the shape plus padding (${meta.width}×${meta.height})`);
  const { data, info } = await sharp(Buffer.from(url.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 245 && data[1] > 245 && data[2] > 245, `the air around the product is white, not black (${data[0]},${data[1]},${data[2]})`);
  const c = ((info.height >> 1) * info.width + (info.width >> 1)) * 3; assert.ok(data[c] < 130, 'the product itself keeps its colour');
});

test('cutoutFromPhoto + placeCutout: a Cut-out view after the photo, the cover rendering ahead of the tiles', async () => {
  await withEnv({ CUTOUT_FIXTURE: '1' }, async () => {
    const photo = await scene(), c = await cutoutFromPhoto(photo);
    assert.equal(c.provider, 'fixture'); assert.equal(c.quality.ok, true); assert.match(c.image, /^data:image\/jpeg/);
    const pack = { sketches: [{ id: 'p1', view: 'front', label: 'Reference photo', image: photo, callouts: [{ n: 1, label: 'x' }] }, { id: 'cutout-old', view: 'detail', label: 'Cut-out · background removed', image: 'old', callouts: [] }, { id: 'p2', view: 'detail', label: 'Back', image: photo, callouts: [] }],
      renderings: [{ id: 'cutout-white', name: 'old', note: '', image: 'old' }, { id: 'cw-volt', name: 'Colourway — Volt', note: '', image: 't' }] };
    placeCutout(pack, c);
    assert.deepEqual(pack.sketches.map(s => s.id.replace(/^cutout-.*/, 'cutout')), ['p1', 'cutout', 'p2']);
    assert.equal(pack.sketches[0].callouts.length, 1, 'callouts stay on the reference photo');
    assert.deepEqual(pack.renderings.map(r => r.id), ['cutout-white', 'cw-volt']); assert.equal(pack.renderings[0].image, c.image); assert.match(pack.renderings[0].note, /fixture/);
  });
});

test('remove.bg request carries the key, the file and the png format', async () => {
  const realFetch = globalThis.fetch; let seen = null;
  globalThis.fetch = async (url, init) => { seen = { url, key: init.headers['X-Api-Key'], fields: [...init.body.keys()] }; return new Response(await alphaPng(50, 50, (x, y) => Math.hypot(x - 25, y - 25) < 15), { status: 200 }); };
  try {
    await withEnv({ CUTOUT_FIXTURE: null, CUTOUT_PROVIDER: null, REMOVE_BG_API_KEY: 'secret-k', PHOTOROOM_API_KEY: null }, async () => {
      const png = await removeBackground(await scene()); assert.ok((await cutoutQuality(png)).ok);
      assert.equal(seen.url, 'https://api.remove.bg/v1.0/removebg'); assert.equal(seen.key, 'secret-k'); assert.deepEqual(seen.fields.sort(), ['format', 'image_file', 'size']);
    });
    globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ title: 'Insufficient credits' }] }), { status: 402 });
    await withEnv({ CUTOUT_FIXTURE: null, CUTOUT_PROVIDER: null, REMOVE_BG_API_KEY: 'k' }, () => assert.rejects(async () => removeBackground(await scene()), /remove\.bg 402 — Insufficient credits/));
  } finally { globalThis.fetch = realFetch; }
});
