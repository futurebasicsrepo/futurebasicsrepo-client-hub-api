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
  const r = await jobFile(await mark(), { name: 'Crest', technique: tech('plastisol'), widthIn: 4, garmentColour: '#1d2540' });
  assert.equal(r.job.colours.length, 3);
  assert.deepEqual(r.job.colours.map(c => c.pantone), ['PANTONE 711 C', 'White', 'PANTONE Neutral Black C']);
  assert.ok(r.job.colours[0].coverage > .5 && Math.abs(r.job.colours.reduce((s, c) => s + c.coverage, 0) - 1) < .01, 'coverage adds up');
  assert.deepEqual(r.job.size, { widthIn: 4, heightIn: 2.67, widthMm: 102, heightMm: 68, px: [1200, 800], dpi: 300 });
  assert.equal(r.job.print.screens, 4); assert.equal(r.job.print.meshCount, 156); assert.ok(!r.job.print.halftone && r.job.print.lpi === 0, 'solid spot colours: no halftone');
  assert.deepEqual(r.job.print.order, ['Underbase (white), then flash', '2. White', '1. PANTONE 711 C', '3. PANTONE Neutral Black C'], 'lightest first, the darkest last');
  const f = r.files.map(x => x.name);
  for (const n of ['artwork-300dpi.png', 'ink-01-pantone-711-c.png', 'film-01-pantone-711-c.png', 'ink-02-white.png', 'film-03-pantone-neutral-black-c.png', 'underbase.png', 'job.json', 'job-sheet.pdf', 'README.txt']) assert.ok(f.includes(n), n);
  const film = await sharp(r.files.find(x => x.name === 'film-01-pantone-711-c.png').data).raw().toBuffer({ resolveWithObject: true });
  // films carry a half-inch margin (150 px) with registration marks; the art sits inside it
  const M = 150, FW = 1200 + 2 * M, at = (img, x, y) => img.data[((y + M) * FW + x + M) * img.info.channels];
  assert.equal(film.info.width, FW); assert.equal(film.info.height, 800 + 2 * M);
  assert.equal(at(film, 5, 5), 255, 'the film is white where there is no ink'); assert.equal(at(film, 300, 400), 0, 'and black where the red ink goes');
  assert.equal(film.data[(Math.round(M / 2) * FW + Math.round(FW / 2)) * 3], 0, 'a registration mark in the top margin');
  const ub = await sharp(r.files.find(x => x.name === 'underbase.png').data).raw().toBuffer({ resolveWithObject: true });
  assert.equal(at(ub, 600, 400), 255, 'the underbase leaves the black bar out: nothing light prints there');
  assert.equal(at(ub, 300, 400), 0, 'and sits under the red');
  // choked: half a point (2 px) inside the outer edge of the red disc (at x = 240)
  assert.equal(at(ub, 241, 400), 255); assert.equal(at(film, 241, 400), 0, 'the red reaches its edge, the underbase stops short of it'); assert.equal(at(ub, 244, 400), 0);
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

test('embroidery: the design is digitized; the stitch files, a preview, the thread sequence as Pantone and the real stitch count go in the pack', async () => {
  const r = await jobFile(await mark(), { name: 'Crest', technique: tech('satin-embroidery'), widthIn: 4 });
  assert.equal(r.job.embroidery.stitch, 'satin stitch'); assert.equal(r.job.embroidery.threads.length, 3); assert.equal(r.job.embroidery.threads[0].pantone, 'PANTONE 711 C');
  const e = r.job.embroidery; assert.ok(e.stitches > 2500 && e.stitches < 20000, String(e.stitches)); assert.equal(e.colourChanges, 2); assert.ok(e.trims >= 3 && e.minutes > 0);
  const f = r.files.map(x => x.name); for (const n of ['crest.dst', 'crest.exp', 'stitch-preview.png']) assert.ok(f.includes(n), n);
  assert.ok(!f.some(n => n.startsWith('film-')), 'no films for thread');
  const dst = r.files.find(x => x.name === 'crest.dst').data; assert.equal(dst.slice(0, 3).toString(), 'LA:');
  assert.ok(!r.files.some(x => x.name === 'underbase.png'));
  const big = await jobFile(await mark(), { technique: tech('tatami-fill'), widthIn: 16 });
  assert.equal(big.job.size.widthIn, 12, 'held to the largest the technique sews'); assert.ok(big.job.embroidery.stitches > e.stitches * 6, 'three times the width, nine times the area');
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

test('a gradient is screened: the films carry halftone dots at their own angles, the ink layers keep the smooth tone', async () => {
  const grad = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#f6a623"/><stop offset="1" stop-color="#c2185b"/></linearGradient></defs><rect x="20" y="20" width="560" height="360" fill="url(#g)"/></svg>')).png().toBuffer();
  const r = await jobFile(grad, { name: 'Fade', technique: tech('plastisol'), widthIn: 2, garmentColour: '#f2efe8' });
  assert.equal(r.job.colours.length, 2, 'two inks: the ends of the gradient, not a band per step'); assert.ok(r.job.tones && r.job.print.halftone && r.job.print.lpi === 55);
  assert.notEqual(r.job.colours[0].angle, r.job.colours[1].angle);
  const film = await sharp(r.files.find(x => x.name === r.job.colours[0].film).data).raw().toBuffer({ resolveWithObject: true }), M = 150, W = film.info.width;
  let blacks = 0, n = 0; for (let x = 250; x < 350; x++) for (let y = 250; y < 350; y++) { n++; if (!film.data[((y + M) * W + x + M) * 3]) blacks++; }
  assert.ok(blacks / n > .15 && blacks / n < .85, `the middle of the fade is dots, not solid or empty: ${Math.round(blacks / n * 100)}%`);
});

test('every colour gets its plate however small, soft edges make no ghost outlines, and a JPG background is not printed', async () => {
  const badge = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="#ffffff"/><circle cx="600" cy="600" r="560" fill="#111111"/><circle cx="600" cy="600" r="470" fill="#f4f1ea"/><text x="600" y="660" font-family="DejaVu Sans" font-weight="bold" font-size="190" text-anchor="middle" fill="#c8202a">BASICS</text><polygon points="600,180 625,250 700,250 640,292 662,362 600,320 538,362 560,292 500,250 575,250" fill="#f2c200"/></svg>')).jpeg({ quality: 85 }).toBuffer();
  const r = await jobFile(badge, { name: 'Badge', technique: tech('plastisol'), widthIn: 4, garmentColour: '#24304f' });
  const names = r.job.colours.map(c => c.pantone);
  assert.equal(r.job.colours.length, 4, names.join()); assert.ok(r.job.colours.some(c => /^#f/.test(c.hex) && c.coverage < .03), 'the small yellow star has its own plate');
  assert.ok(r.job.knockouts.some(k => /background/.test(k.why)), 'the white around the badge is the picture background');
  // the red plate carries the lettering only: nothing along the ring where black meets cream
  const red = r.job.colours.find(c => /186|185|1795|485|7621|199|032/.test(c.pantone) || c.hex === '#c8202a' || /^#c[89]/.test(c.hex));
  const film = await sharp(r.files.find(x => x.name === red.film).data).raw().toBuffer({ resolveWithObject: true }), M = 150, W = film.info.width;
  let ghost = 0; for (let a = 0; a < 360; a++) { const t = a * Math.PI / 180; for (const rr of [466, 470, 474]) { const x = Math.round(600 + rr * Math.cos(t)) , y = Math.round(600 + rr * Math.sin(t)); if (!film.data[((y + M) * W + x + M) * 3]) ghost++; } }
  assert.equal(ghost, 0, 'no ghost ring on the red film');
});
