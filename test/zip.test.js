import test from 'node:test';
import assert from 'node:assert/strict';
import { zip, crc32 } from '../src/zip.js';

// A reader for the zip files this module writes, so the test does not trust the writer to check itself.
function read(buf) {
  const eocd = buf.length - 22; assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
  const n = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16), out = []; let p = cdOff;
  for (let i = 0; i < n; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42), name = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    assert.equal(buf.readUInt32LE(off), 0x04034b50);
    const ln = buf.readUInt16LE(off + 26), data = buf.subarray(off + 30 + ln, off + 30 + ln + size);
    assert.equal(crc32(data), crc, `crc of ${name}`);
    out.push({ name, data }); p += 46 + nl;
  }
  return out;
}

test('crc32 matches the standard check value', () => assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926));

test('a zip holds every file, byte for byte, with its folder path and a UTF-8 name', () => {
  const files = [{ name: 'Product-files/1 Tech pack/layer-runner-tech-pack-v2.pdf', data: Buffer.from('%PDF-1.7 test') }, { name: 'Product-files/4 3D model/shape.stl', data: Buffer.alloc(5000, 7) }, { name: 'Product-files/2 Your uploads/标志.png', data: Buffer.from([0, 1, 2, 255]) }, { name: 'Product-files/empty.txt', data: Buffer.alloc(0) }];
  const out = read(zip(files));
  assert.deepEqual(out.map(o => o.name), files.map(f => f.name));
  out.forEach((o, i) => assert.deepEqual(Buffer.from(o.data), files[i].data));
});

test('an empty zip is still a valid zip', () => assert.deepEqual(read(zip([])), []));
