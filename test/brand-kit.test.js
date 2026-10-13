import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { assetFiles, assetFile, catalogue, colorFacts, COLORS, kitZip, GROUPS } from '../src/brand-kit.js';

const files = assetFiles();
const magic = { png: b => b.subarray(1, 4).toString() === 'PNG', jpg: b => b[0] === 0xff && b[1] === 0xd8, webp: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', pdf: b => b.subarray(0, 5).toString() === '%PDF-',
  tiff: b => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d), ico: b => b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1, svg: b => b.toString('utf8', 0, 200).includes('<svg'), woff2: b => b.subarray(0, 4).toString() === 'wOF2', ttf: b => b.readUInt32BE(0) === 0x00010000 || b.subarray(0, 4).toString() === 'true', css: b => b.length > 20, json: b => Boolean(JSON.parse(b.toString())), txt: b => b.length > 100 };

test('every file name is unique and sits in a known group', () => {
  assert.equal(new Set(files).size, files.length);
  const groups = new Set(GROUPS.map(g => g.id)); for (const g of catalogue().groups) assert.ok(groups.has(g.id) && g.items.length, g.id);
  assert.equal(catalogue().groups.reduce((n, g) => n + g.items.length, 0), files.length);
});
test('web and print file types are both there', () => {
  const ext = new Set(files.map(f => f.split('.').pop())); for (const e of ['svg', 'pdf', 'png', 'jpg', 'webp', 'tiff', 'ico', 'woff2', 'ttf']) assert.ok(ext.has(e), e);
  const items = catalogue().groups.find(g => g.id === 'logo').items; assert.ok(items.some(i => i.kind === 'web') && items.some(i => i.kind === 'print'));
});
test('every file builds, and is the type its name says', async () => {
  for (const f of files) { const a = await assetFile(f), ext = f.split('.').pop(); assert.ok(a.buffer.length > 50, f); assert.ok(magic[ext](a.buffer), `${f} does not look like a .${ext}`); }
});
test('print rasters are 300 dpi and wide; the white logo has no background', async () => {
  for (const f of files.filter(x => /300dpi\.(png|tiff|jpg)$/.test(x))) { const m = await sharp((await assetFile(f)).buffer).metadata(); assert.equal(m.width, 4000, f); assert.equal(Math.round(m.density), 300, f); }
  const w = await sharp((await assetFile('future-basics-wordmark-white-1200.png')).buffer).metadata(); assert.ok(w.hasAlpha);
  const j = await sharp((await assetFile('future-basics-wordmark-ink-on-white-300dpi.jpg')).buffer).metadata(); assert.equal(j.hasAlpha, false);
});
test('sizes are what the platforms ask for', async () => {
  const dim = async f => { const m = await sharp((await assetFile(f)).buffer).metadata(); return [m.width, m.height]; };
  assert.deepEqual(await dim('profile-picture-ink-1080.png'), [1080, 1080]); assert.deepEqual(await dim('link-preview-1200x630.png'), [1200, 630]);
  assert.deepEqual(await dim('linkedin-banner-1584x396.png'), [1584, 396]); assert.deepEqual(await dim('x-header-1500x500.png'), [1500, 500]);
  assert.deepEqual(await dim('apple-touch-icon-180.png'), [180, 180]); assert.deepEqual(await dim('icon-maskable-512.png'), [512, 512]);
  const ico = (await assetFile('favicon.ico')).buffer; assert.equal(ico.readUInt16LE(4), 3); // 16, 32, 48
});
test('the one-colour print PDF is CMYK black, the others are RGB', async () => {
  const cmyk = (await assetFile('future-basics-wordmark-black-cmyk.pdf')).buffer.toString('latin1'), rgb = (await assetFile('future-basics-wordmark-ink-rgb.pdf')).buffer.toString('latin1');
  assert.match(cmyk, /DeviceCMYK/); assert.match(cmyk, /0 0 0 1 (k|scn)/); assert.doesNotMatch(rgb, /DeviceCMYK/); assert.match(rgb, /DeviceRGB|0\.0784 0\.0784 0\.0863 (rg|scn)/);
});
test('colours: the hub palette, with RGB, CMYK and a Pantone chip', () => {
  assert.equal(COLORS.find(c => c.id === 'ink').hex, '#141416'); assert.equal(COLORS.find(c => c.id === 'cue').hex, '#4BFF9A');
  const ink = colorFacts().find(c => c.id === 'ink'); assert.deepEqual(ink.rgb, [20, 20, 22]); assert.equal(ink.cmyk.length, 4); assert.match(ink.pantone, /^PANTONE /);
  assert.equal(colorFacts().find(c => c.id === 'paper').pantone, '');
});
test('the colour and font files carry the real values', async () => {
  const css = (await assetFile('future-basics-colors.css')).buffer.toString(); assert.match(css, /--fb-ink: #141416;/); assert.match(css, /--fb-cue: #4bff9a;/);
  const fonts = (await assetFile('future-basics-fonts.css')).buffer.toString(); assert.match(fonts, /url\(\.\/space-grotesk-latin\.woff2\)/); assert.doesNotMatch(fonts, /url\(\/fonts\//);
});
test('the kit zip holds every file in folders, and nothing else', async () => {
  const z = await kitZip(); assert.equal(z.subarray(0, 2).toString(), 'PK');
  const eocd = z.length - 22; assert.equal(z.readUInt32LE(eocd), 0x06054b50); assert.equal(z.readUInt16LE(eocd + 10), files.length);
  assert.ok(z.toString('latin1').includes('Future Basics brand kit/Wordmark/Print/future-basics-wordmark-black-cmyk.pdf'));
});
test('an unknown file is not found', async () => { assert.equal(await assetFile('../server.js'), null); assert.equal(await assetFile('nope.png'), null); });
