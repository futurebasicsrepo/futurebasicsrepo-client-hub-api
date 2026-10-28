import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import '../src/stl-viewer.js';
import { fixtureGlb, buildGlb, fixtureStl, pollMesh, fetchAsset } from '../src/mesh.js';
import { glbInfo } from '../src/lab-tryon-routes.js';
import { fontInfo } from '../src/lab-studio-routes.js';

const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
test('a textured GLB is built and read back: the slab, its picture, and the UVs that paint the front', async () => {
  const jpg = await sharp({ create: { width: 48, height: 48, channels: 3, background: '#336699' } }).jpeg().toBuffer(), glb = fixtureGlb(jpg);
  assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(8), glb.length, 'the header carries the file length');
  const m = globalThis.FBStl.parseGlb(ab(glb));
  assert.equal(m.triangles, 12); assert.deepEqual(m.size.map(s => Math.round(s * 100) / 100), [1, 1, 0.16]); assert.equal(m.texture.mime, 'image/jpeg'); assert.equal(m.texture.bytes.length, jpg.length);
  assert.ok(m.uvs.length === 12 * 3 * 2 && m.uvs.every(v => v >= 0 && v <= 1), 'every corner has a place on the picture');
  assert.equal(globalThis.FBStl.isGlb(ab(glb)), true); assert.equal(globalThis.FBStl.isGlb(ab(fixtureStl())), false);
  assert.equal(globalThis.FBStl.parseAny(ab(fixtureStl())).triangles, 12, 'an STL still reads as before');
  assert.deepEqual(glbInfo(glb), { triangles: 12, textured: true, size: [1, 1, 0.16] });
  assert.equal(glbInfo(Buffer.from('not a model')), null);
  const plain = buildGlb({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] });
  assert.deepEqual(glbInfo(plain), { triangles: 1, textured: false, size: [1, 1, 0] });
});
test('a GLB with node transforms, stride and no normals still reads: the geometry is placed and flat normals are made', () => {
  // one triangle, scaled by 2 and moved by 10 on a node, indices as uint16, no normals
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), idx = Buffer.from(new Uint16Array([0, 1, 2, 0]).buffer);
  const bin = Buffer.concat([pos, idx]);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ children: [1], translation: [10, 0, 0] }, { mesh: 0, scale: [2, 2, 2] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }] };
  const jb = Buffer.from(JSON.stringify(json)), jp = (4 - jb.length % 4) % 4, head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + jp + 8 + bin.length, 8); head.writeUInt32LE(jb.length + jp, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const m = globalThis.FBStl.parseGlb(ab(Buffer.concat([head, jb, Buffer.alloc(jp, 0x20), bh, bin])));
  assert.equal(m.triangles, 1); assert.deepEqual([...m.positions.slice(0, 3)], [10, 0, 0]); assert.deepEqual([...m.positions.slice(3, 6)], [12, 0, 0]); assert.deepEqual([...m.normals.slice(0, 3)], [0, 0, 1]); assert.equal(m.texture, null); assert.equal(m.uvs[0], -1, 'no picture: the corner says so');
});
test('the stand-in 3D service hands back a textured model as well as the STL', async () => {
  const cfg = { provider: 'fixture', configured: true, model: 'fixture' };
  const r = await pollMesh('fixture-0', { cfg }); assert.equal(r.status, 'done'); assert.equal(r.glbUrl, 'fixture:glb'); assert.equal(r.stlUrl, 'fixture:stl');
  const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).jpeg().toBuffer();
  assert.equal(glbInfo(await fetchAsset('fixture:glb', { kind: 'glb', cfg, texture: jpg })).textured, true);
  assert.equal(glbInfo(await fetchAsset('fixture:glb', { kind: 'glb', cfg })).textured, false);
});
test('a font file is told by its first bytes, and anything else is refused', () => {
  assert.deepEqual(fontInfo(Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(12)])), { format: 'ttf', mime: 'font/ttf' });
  assert.deepEqual(fontInfo(Buffer.concat([Buffer.from('OTTO'), Buffer.alloc(12)])), { format: 'otf', mime: 'font/otf' });
  assert.deepEqual(fontInfo(Buffer.concat([Buffer.from('wOFF'), Buffer.alloc(12)])), { format: 'woff', mime: 'font/woff' });
  assert.deepEqual(fontInfo(Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(12)])), { format: 'woff2', mime: 'font/woff2' });
  assert.equal(fontInfo(Buffer.from('%PDF-1.4 not a font at all')), null); assert.equal(fontInfo(Buffer.from('wOF2')), null);
});
