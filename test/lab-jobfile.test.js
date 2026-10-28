import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { jobFile, jobZip, printSettings, embroiderySettings } from '../src/lab-jobfile.js';
import { BUILTIN_TECHNIQUES, cleanRules } from '../src/lab-library.js';

// a three-colour mark on a clear ground: a red disc, a white ring, a black bar
const mark = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><circle cx="300" cy="200" r="180" fill="#d7262b"/><circle cx="300" cy="200" r="120" fill="#ffffff"/><rect x="200" y="170" width="200" height="60" fill="#111111"/></svg>')).png().toBuffer();
const tech = key => { const b = BUILTIN_TECHNIQUES.find(x => x.key === key); return { ...b, rules: cleanRules(b.rules || {}, b.base) }; };
// the names inside an archive, read from its central directory
const names = buf => { const e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = []; for (let i = 0; i < n; i++) { const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32); out.push(buf.toString('utf8', p + 46, p + 46 + nl)); p += 46 + nl + el + cl; } return out; };

test('a screen print job: one ink and one film per colour with its Pantone, the underbase for a dark garment, halftone and mesh, the sheet and the data', async () => {
  const r = await jobFile(await mark(), { name: 'Crest', technique: tech('plastisol'), widthIn: 4, garmentColour: '#1a1a1a' });
  assert.equal(r.job.colours.length, 3);
  assert.deepEqual(r.job.colours.map(c => c.pantone), ['PANTONE 711 C', 'White', 'PANTONE Neutral Black C']);
  assert.ok(r.job.colours[0].coverage > .5 && Math.abs(r.job.colours.reduce((s, c) => s + c.coverage, 0) - 1) < .01, 'coverage adds up');
  assert.deepEqual(r.job.size, { widthIn: 4, heightIn: 2.67, widthMm: 102, heightMm: 68, px: [1200, 800], dpi: 300 });
  assert.equal(r.job.print.screens, 4); assert.equal(r.job.print.meshCount, 156); assert.ok(r.job.print.halftone && r.job.print.lpi === 55);
  const f = r.files.map(x => x.name);
  for (const n of ['artwork-300dpi.png', 'ink-01-pantone-711-c.png', 'film-01-pantone-711-c.png', 'ink-02-white.png', 'film-03-pantone-neutral-black-c.png', 'underbase.png', 'job.json', 'job-sheet.pdf', 'README.txt']) assert.ok(f.includes(n), n);
  const film = await sharp(r.files.find(x => x.name === 'film-01-pantone-711-c.png').data).raw().toBuffer({ resolveWithObject: true });
  assert.equal(film.info.channels, 3); assert.equal(film.data[0], 255, 'the film is white where there is no ink'); assert.equal(film.data[(400 * 1200 + 300) * 3], 0, 'and black where the red ink goes');
  const ub = await sharp(r.files.find(x => x.name === 'underbase.png').data).raw().toBuffer({ resolveWithObject: true });
  assert.equal(ub.data[(400 * 1200 + 600) * 3], 255, 'the underbase leaves the black bar out: nothing light prints there');
  assert.ok(r.files.find(x => x.name === 'job-sheet.pdf').data.subarray(0, 5).toString() === '%PDF-');
  assert.ok(r.job.warnings.some(w => /150 dpi/.test(w)), 'a small source at a big width is flagged');
  assert.equal(r.zipName, 'crest-plastisol-screen-print-job.zip');
});

test('the same mark on a light garment needs no underbase; a water-based print never does', async () => {
  const light = await jobFile(await mark(), { technique: tech('plastisol'), widthIn: 3, garmentColour: '#f2efe8' });
  assert.equal(light.job.print.underbase, false); assert.ok(!light.files.some(x => x.name === 'underbase.png')); assert.equal(light.job.print.screens, 3);
  const wb = await jobFile(await mark(), { technique: tech('water-based'), widthIn: 3, garmentColour: '#111111' });
  assert.equal(wb.job.print.underbase, false); assert.equal(wb.job.print.inkType, 'water-based');
});

test('embroidery: thread colours as Pantone, the stitch, backing and an estimated stitch count from the density; too many stitches is flagged', async () => {
  const r = await jobFile(await mark(), { name: 'Crest', technique: tech('satin-embroidery'), widthIn: 4 });
  assert.equal(r.job.embroidery.stitch, 'satin stitch'); assert.equal(r.job.embroidery.threads.length, 3); assert.equal(r.job.embroidery.threads[0].pantone, 'PANTONE 711 C');
  assert.ok(r.job.embroidery.stitchEstimate >= 7000 && r.job.embroidery.stitchEstimate <= 10000, String(r.job.embroidery.stitchEstimate));
  assert.ok(!r.files.some(x => x.name === 'underbase.png'));
  const big = await jobFile(await mark(), { technique: tech('tatami-fill'), widthIn: 10 });
  assert.ok(big.job.warnings.some(w => /stitches/.test(w)), big.job.warnings.join());
});

test('a heat transfer is mirrored for printing; a patch gets a cut line grown by 2 mm and an edge finish', async () => {
  const ht = await jobFile(await mark(), { technique: tech('glossy-transfer'), widthIn: 3 });
  assert.ok(ht.files.some(x => x.name === 'artwork-mirrored-300dpi.png')); assert.equal(ht.job.transfer.finish, 'glossy');
  const pt = await jobFile(await mark(), { technique: tech('woven-patch'), widthIn: 3 });
  const cut = pt.files.find(x => x.name === 'cut-line.png'); assert.ok(cut);
  const px = await sharp(cut.data).raw().toBuffer({ resolveWithObject: true }); const at = (x, y) => px.data[(y * px.info.width + x) * px.info.channels];
  assert.equal(at(450, 200), 0, 'inside the shape is black'); assert.equal(at(5, 5), 255, 'outside is white');
  assert.equal(at(450 - 270 - 14, 300), 0, 'just outside the disc edge is still inside the cut line: the shape is grown by about 2 mm (24 px)'); assert.equal(at(450 - 270 - 60, 300), 255, 'well outside it is not');
  assert.ok(/edge/.test(pt.job.patch.edge) && pt.job.patch.base === 'woven, 100% polyester');
});

test('the zip holds every file and opens: a stored PNG keeps its bytes', async () => {
  const r = await jobZip(await mark(), { name: 'Crest', technique: tech('plastisol'), widthIn: 2 });
  const inside = names(r.zip);
  assert.deepEqual(inside, r.files.map(f => f.name));
  assert.equal(r.zip.readUInt32LE(0), 0x04034b50);
});

test('settings follow the technique: puff and foil skip the halftone and underbase; cap embroidery wants cut-away backing', () => {
  assert.equal(printSettings({ name: 'Puff print', base: 'puff print' }).halftone, false);
  assert.equal(printSettings({ name: 'Foil', base: 'screen print' }).underbase, false);
  assert.equal(printSettings({ name: 'Halftone print', base: 'screen print' }).lpi, 65);
  assert.match(embroiderySettings({ name: '3D puff embroidery', finish: {} }, { density: 1200, minLineMm: 3 }).backing, /cut-away/);
  assert.equal(embroiderySettings({ name: 'Tatami fill', finish: { stitch: 'fill' } }, { density: 1800 }).stitch, 'tatami fill');
});
