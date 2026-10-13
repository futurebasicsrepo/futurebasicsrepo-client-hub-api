import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { themeFiles, zipOf, crc32, signThemeToken, readThemeToken, THEMES, themeKeys } from '../src/theme-pack.js';

// read a zip back the way an unzipper would: the central directory, then each file, checking its size and checksum
function unzip(buf) {
  const eocd = buf.length - 22; assert.equal(buf.readUInt32LE(eocd), 0x06054b50); const n = buf.readUInt16LE(eocd + 10); let o = buf.readUInt32LE(eocd + 16); const out = {};
  for (let i = 0; i < n; i++) {
    assert.equal(buf.readUInt32LE(o), 0x02014b50); const method = buf.readUInt16LE(o + 10), crc = buf.readUInt32LE(o + 16), csize = buf.readUInt32LE(o + 20), usize = buf.readUInt32LE(o + 24), nl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30), cl = buf.readUInt16LE(o + 32), lo = buf.readUInt32LE(o + 42);
    const name = buf.subarray(o + 46, o + 46 + nl).toString(), lnl = buf.readUInt16LE(lo + 26), lel = buf.readUInt16LE(lo + 28), start = lo + 30 + lnl + lel, raw = buf.subarray(start, start + csize), data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(data.length, usize, name); assert.equal(crc32(data), crc, name); out[name] = data; o += 46 + nl + el + cl;
  }
  return out;
}

test('a zip holds every file, byte for byte, in the order given', () => {
  const files = [{ name: 'layout/theme.liquid', data: Buffer.from('<html>{{ content_for_layout }}</html>'.repeat(40)) }, { name: 'assets/logo.svg', data: Buffer.from('<svg/>') }, { name: 'assets/ünï.txt', data: Buffer.from('') }, { name: 'assets/random.bin', data: Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7919) % 256)) }];
  const out = unzip(zipOf(files)); assert.deepEqual(Object.keys(out), files.map(f => f.name));
  for (const f of files) assert.deepEqual(out[f.name], f.data);
});

test('the same files always make the same zip', () => { const f = [{ name: 'a/b.txt', data: Buffer.from('hello hello hello') }]; assert.deepEqual(zipOf(f), zipOf(f)); });

test('crc32 matches the standard check value', () => assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926));

test('only the folders a theme may hold are packed, in a fixed order, with hidden files and notes left out', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'theme-')); for (const d of ['layout', 'sections', 'assets', 'docs']) mkdirSync(path.join(dir, d));
  writeFileSync(path.join(dir, 'README.md'), 'notes'); writeFileSync(path.join(dir, 'layout/theme.liquid'), 'x'); writeFileSync(path.join(dir, 'sections/b.liquid'), 'b'); writeFileSync(path.join(dir, 'sections/a.liquid'), 'a'); writeFileSync(path.join(dir, 'sections/.DS_Store'), 'junk'); writeFileSync(path.join(dir, 'docs/x.md'), 'no');
  assert.deepEqual(themeFiles('x', dir).map(f => f.name), ['layout/theme.liquid', 'sections/a.liquid', 'sections/b.liquid']);
  assert.deepEqual(themeFiles('x', path.join(dir, 'nope')), []);
});

test('the Common Ground theme ships in the repository with its layout, templates and sections', () => {
  assert.ok(themeKeys().includes('common-ground')); const names = themeFiles('common-ground').map(f => f.name);
  for (const must of ['layout/theme.liquid', 'templates/index.json', 'config/settings_schema.json', 'sections/header.liquid']) assert.ok(names.includes(must), must);
  assert.ok(names.every(n => /^(assets|config|layout|locales|sections|snippets|templates)\//.test(n)));
  assert.equal(THEMES['common-ground'].name, 'Common Ground');
});

test('the address Shopify fetches from is good for that theme, a few minutes, and only with our secret', () => {
  const now = 1_800_000_000_000, t = signThemeToken('secret', 'common-ground', 15 * 60_000, now);
  assert.equal(readThemeToken('secret', t, now + 60_000), 'common-ground'); assert.equal(readThemeToken('secret', `${t}.zip`, now + 60_000), 'common-ground');
  assert.equal(readThemeToken('other', t, now + 60_000), null); assert.equal(readThemeToken('secret', t, now + 16 * 60_000), null);
  assert.equal(readThemeToken('secret', t.replace('common-ground', 'other-theme'), now), null); assert.equal(readThemeToken('secret', 'garbage', now), null); assert.equal(readThemeToken('secret', '', now), null);
});
