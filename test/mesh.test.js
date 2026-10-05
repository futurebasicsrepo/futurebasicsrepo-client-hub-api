import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { meshConfig, stlInfo, fixtureStl, photoForMesh, fetchAsset, pollMesh, startMesh } from '../src/mesh.js';

test('the provider follows the environment', () => {
  assert.equal(meshConfig({}).provider, 'none');
  assert.equal(meshConfig({ MESHY_API_KEY: 'k' }).provider, 'meshy');
  assert.equal(meshConfig({ MESHY_API_KEY: 'k' }).model, 'meshy-6');
  assert.equal(meshConfig({ MESHY_API_KEY: 'k', MESH_MODEL: 'meshy-7.1' }).model, 'meshy-7.1');
  assert.equal(meshConfig({ MESHY_API_KEY: 'k', MESH_DISABLED: 'true' }).configured, false);
  assert.equal(meshConfig({ AI_FIXTURE: 'x' }).provider, 'fixture');
  assert.equal(meshConfig({ AI_FIXTURE: 'x', MESHY_API_KEY: 'k' }).provider, 'meshy'); // a real key wins over the fixture
});

test('a binary STL is read and measured', () => {
  const info = stlInfo(fixtureStl());
  assert.equal(info.triangles, 12); assert.deepEqual(info.size, [1, 1, 1]); assert.equal(info.format, 'binary');
});

test('an ASCII STL is read and measured', () => {
  const t = 'solid x\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 2 0 0\n   vertex 0 3 0\n  endloop\n endfacet\nendsolid x\n' + ' '.repeat(40);
  const info = stlInfo(Buffer.from(t));
  assert.equal(info.triangles, 1); assert.deepEqual(info.size, [2, 3, 0]); assert.equal(info.format, 'ascii');
});

test('anything that is not an STL is refused', () => {
  assert.equal(stlInfo(Buffer.from('<html>not a model</html>'.padEnd(200, ' '))), null);
  assert.equal(stlInfo(Buffer.alloc(10)), null);
  assert.equal(stlInfo(Buffer.alloc(300)), null); // zero triangles
  const b = fixtureStl(); b.writeFloatLE(NaN, 96); assert.equal(stlInfo(b), null); // a vertex that is not a number
  assert.equal(stlInfo(fixtureStl().subarray(0, 200)), null); // truncated
});

test('a photo is made into a jpeg the service accepts', async () => {
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 4, background: { r: 200, g: 10, b: 10, alpha: 0.5 } } }).png().toBuffer();
  const out = await photoForMesh('data:image/png;base64,' + png.toString('base64'));
  assert.match(out, /^data:image\/jpeg;base64,/);
  const meta = await sharp(Buffer.from(out.split(',')[1], 'base64')).metadata();
  assert.equal(meta.format, 'jpeg'); assert.ok(Math.max(meta.width, meta.height) <= 1600);
  assert.equal(await photoForMesh('data:text/plain;base64,aGk='), null);
  assert.equal(await photoForMesh(''), null);
});

test('the fixture provider makes a model after a moment', async () => {
  const cfg = { provider: 'fixture', configured: true };
  const { taskId } = await startMesh({ imageDataUrl: 'x', cfg });
  const first = await pollMesh(taskId, { cfg });
  assert.equal(first.status, 'running');
  await new Promise(r => setTimeout(r, 1300));
  const done = await pollMesh(taskId, { cfg });
  assert.equal(done.status, 'done');
  assert.equal(stlInfo(await fetchAsset(done.stlUrl, { kind: 'stl', cfg })).triangles, 12);
});

test('downloads only come from the vendor over https', async () => {
  const cfg = { provider: 'meshy', configured: true };
  await assert.rejects(fetchAsset('http://assets.meshy.ai/a.stl', { cfg }), /trust/);
  await assert.rejects(fetchAsset('https://evil.example.com/a.stl', { cfg }), /trust/);
  await assert.rejects(fetchAsset('https://meshy.ai.evil.com/a.stl', { cfg }), /trust/);
  await assert.rejects(fetchAsset('not a url', { cfg }), /bad link/);
});

test('no key, no task', async () => {
  await assert.rejects(startMesh({ imageDataUrl: 'x', cfg: { provider: 'none', configured: false } }), /MESHY_API_KEY/);
});
