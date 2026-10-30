import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFactoryPackage, packPictures, readme } from '../src/factory-package.js';

const png = n => `data:image/png;base64,${Buffer.from(`png-${n}`).toString('base64')}`;
// the names in a stored (uncompressed) zip, read from its central directory
const names = buf => { const out = []; let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const n = buf.readUInt16LE(i + 10); let p = buf.readUInt32LE(i + 16);
  for (let k = 0; k < n; k++) { const len = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), com = buf.readUInt16LE(p + 32); out.push(buf.slice(p + 46, p + 46 + len).toString('utf8')); p += 46 + len + extra + com; } return out; };

test('the pack pictures come out as files, named for what they are, each name once', () => {
  const files = packPictures({ artwork: [{ name: 'Chest logo', image: png(1), clear: png(2) }, { name: 'Chest logo', image: png(3) }, { name: 'Bad', image: 'https://x/y.png' }], sketches: [{ label: 'Front', image: png(4) }] });
  assert.deepEqual(files.map(f => f.name), ['artwork/chest-logo.png', 'artwork/chest-logo-transparent.png', 'artwork/chest-logo-2.png', 'sketches/front.png']);
  assert.equal(files[0].data.toString(), 'png-1');
});

test('a Lab design: the PDF, workbook, pictures and every production file in one folder, with a README that names each', () => {
  const lab = { files: [{ name: 'decorations/01-chest-logo/chest-logo.dst', data: Buffer.from('dst') }, { name: 'decorations/01-chest-logo/job-sheet.pdf', data: Buffer.from('pdf') }, { name: 'pattern/pattern-all-sizes-aama.dxf', data: Buffer.from('dxf') }], notes: [] };
  const p = buildFactoryPackage({ data: { artwork: [{ name: 'Chest logo', image: png(1) }] }, title: 'Heavy Hoodie', version: 3, publishedAt: '2026-10-01T00:00:00Z', pdf: Buffer.from('%PDF'), sheets: Buffer.from('xlsx'), lab });
  assert.equal(p.name, 'heavy-hoodie-v3-production.zip');
  const inZip = names(p.zip);
  for (const f of ['README.txt', 'tech-pack.pdf', 'tech-pack.xlsx', 'artwork/chest-logo.png', 'decorations/01-chest-logo/chest-logo.dst', 'pattern/pattern-all-sizes-aama.dxf']) assert.ok(inZip.includes(`heavy-hoodie-v3-production/${f}`), f);
  assert.match(p.readme, /Tajima DST/); assert.match(p.readme, /AAMA\/ASTM DXF/); assert.match(p.readme, /tech pack v3/);
  assert.doesNotMatch(p.readme, /changed after this version/);
});

test('a pack made outside the Lab says why there are no decoration or pattern files; a design changed since publishing says the PDF governs', () => {
  assert.match(buildFactoryPackage({ data: {}, title: 'Cap', version: 1 }).readme, /not designed in the Future Basics Design Lab/);
  assert.match(readme({ title: 'Cap', version: 2, files: [], stale: true }), /changed after this version was published[\s\S]*the PDF governs/);
  assert.match(readme({ title: 'Cap', version: 2, files: [], notes: ['Back graphic: no artwork file to make it from'] }), /Notes[\s\S]*Back graphic/);
});
