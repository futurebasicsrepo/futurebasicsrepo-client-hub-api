import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { textPath, TYPE_FONTS } from '../src/lab-type.js';
import { cleanProgram, cleanMotif, generateProgram, programFixture } from '../src/lab-program.js';
import { programWords, resolveMotifs, generateConcepts, conceptFixture, artworkFiles, ensureBranding, closeness, productBrief } from '../src/lab-concepts.js';
import { cleanBrandCode, brandCodeWords, DEFAULT_BRAND_CODE } from '../src/lab.js';
import { trendRead } from '../src/lab-plan.js';

const ENV = { ANTHROPIC_API_KEY: 'k', AI_FIXTURE: 'x' };

test('lettering becomes outlines from our own fonts: sized, aligned and tracked, never a font name', () => {
  assert.deepEqual(Object.keys(TYPE_FONTS).sort(), ['grotesk', 'grotesk-bold', 'grotesk-light', 'mono']);
  const a = textPath({ text: 'FB 26', font: 'grotesk-bold', size: 40, x: 100, y: 100 }), mid = textPath({ text: 'FB 26', font: 'grotesk-bold', size: 40, x: 100, y: 100, anchor: 'middle' }), end = textPath({ text: 'FB 26', font: 'grotesk-bold', size: 40, x: 100, y: 100, anchor: 'end' });
  assert.ok(a.d.startsWith('M') && a.d.length > 300 && /^[MLCQZ0-9. \-]+$/.test(a.d), 'only path commands'); assert.ok(a.width > 60 && a.width < 140, a.width);
  const first = Number(/^M([^ L]+)/.exec(a.d)[1]), firstMid = Number(/^M([^ L]+)/.exec(mid.d)[1]), firstEnd = Number(/^M([^ L]+)/.exec(end.d)[1]);
  assert.ok(firstMid < first && firstEnd < firstMid, 'middle and end alignment move the text left');
  assert.ok(textPath({ text: 'FB', size: 40, tracking: 10 }).width > textPath({ text: 'FB', size: 40 }).width + 9, 'tracking spreads the letters');
  assert.ok(textPath({ text: 'FB', font: 'nonsense', size: 40 }).d.length > 50, 'an unknown font falls back'); assert.equal(textPath({ text: '' }).d, '');
  assert.notEqual(textPath({ text: 'FB', font: 'mono', size: 40 }).d, textPath({ text: 'FB', font: 'grotesk-bold', size: 40 }).d, 'the fonts differ');
});

const MOTIF = (o = {}) => ({ name: 'FB crest', kind: 'crest', idea: 'A small shield with our initials', placements: ['left chest', 'moon'], svg: '<svg viewBox="0 0 200 240"><path d="M20 20 H180 V120 Q100 230 20 120 Z" fill="#1F3A5F"/><text x="100" y="125" font-family="grotesk-bold" font-size="64" text-anchor="middle" fill="#F2EBDD">FB</text></svg>', ...o });
test('a graphic program is cleaned: motifs with ids, drawings as outlines, a palette in real colours', () => {
  const p = cleanProgram({ name: ' Quiet Varsity ', story: 's', rules: 'r', palette: [{ name: 'Navy', hex: '#1f3a5f' }, { name: 'Bad', hex: 'blue' }, { name: 'Short', hex: '#fff' }], motifs: [MOTIF(), MOTIF({ name: 'Numeral', kind: 'numerals', idea: 'The year', placements: ['front centre'] }), { name: 'No idea' }, MOTIF({ name: 'Scripty', idea: 'x', svg: '<svg><script>x</script></svg>' }), ...Array.from({ length: 12 }, (_, i) => MOTIF({ name: 'M' + i, idea: 'i' }))] });
  assert.equal(p.name, 'Quiet Varsity'); assert.deepEqual(p.palette, [{ name: 'Navy', hex: '#1F3A5F' }, { name: 'Short', hex: '#FFFFFF' }]); assert.equal(p.motifs.length, 8, 'at most eight motifs');
  assert.equal(new Set(p.motifs.map(m => m.id)).size, 8, 'every motif has its own id'); assert.deepEqual(p.motifs[0].texts, ['FB']); assert.ok(!/<text/.test(p.motifs[0].svg)); assert.deepEqual(p.motifs[0].placements, ['left chest'], 'unknown placements are dropped');
  assert.equal(p.motifs.find(m => m.name === 'Scripty').svg, '', 'a drawing that cannot be trusted is dropped but the idea stays');
  assert.equal(cleanProgram(null), null); assert.equal(cleanProgram({}), null); assert.equal(cleanMotif({ name: 'x', idea: 'y', kind: 'weird' }, 2).kind, 'icon'); assert.equal(cleanMotif({ name: 'x', idea: 'y' }, 2).id, 'm3');
});

test('generating a program: needs the AI, is told to go deep and to be original, and is checked for other brands', async () => {
  await assert.rejects(() => generateProgram({ env: {} }), /not connected/);
  let seen; const trends = trendRead([{ id: 'a', title: 'Crest polo', category: 'tops', price: 90, heat: 50, firstSeenAt: '2026-10-01T00:00:00Z', attrs: { graphics: ['embroidered crest', 'stripe at the cuff'] }, brand: 'R', role: 'reference' }], { now: new Date('2026-10-17') });
  const out = await generateProgram({ plan: { name: 'Fall 27', season: 'FW27', brief: 'quiet heritage' }, lines: [{ name: 'Boxy tee', category: 'tops', role: 'core', status: 'planned' }, { name: 'Dropped', category: 'bags', role: 'core', status: 'dropped' }], trends, note: 'lean on numerals', env: ENV, askImpl: async a => { seen = a; return { json: programFixture({ user: a.user }), usage: { input: 4000, output: 5000 } }; } });
  assert.match(seen.system, /taken their graphic programs deep/); assert.match(seen.system, /every mark is OURS/); assert.match(seen.system, /NEVER copy or imitate/); assert.match(seen.system, /not limited to our logo or its line and dot, nor to the logo colours/); assert.match(seen.system, /Male-driven and unisex/);
  assert.match(seen.user, /Boxy tee \(category tops/); assert.ok(!/Dropped/.test(seen.user), 'a dropped piece is not designed for'); assert.match(seen.user, /embroidered crest/, 'what the references put on these pieces is shown, for the range and not to copy'); assert.match(seen.user, /Steer: lean on numerals/);
  assert.equal(out.program.name, 'Quiet Varsity'); assert.ok(out.program.motifs.length >= 4 && new Set(out.program.motifs.map(m => m.kind)).size >= 4, 'several kinds of motif'); assert.ok(out.program.motifs.some(m => m.texts.length), 'with original lettering'); assert.ok(out.program.motifs.every(m => m.svg && !/<text/.test(m.svg))); assert.ok(out.costCents > 0);
  const named = await generateProgram({ lines: [{ name: 'Tee', category: 'tops', role: 'core' }], env: ENV, askImpl: async () => ({ json: { name: 'P', story: 's', motifs: [{ name: 'Polo pony', kind: 'icon', idea: 'a polo pony on the chest', svg: '<svg viewBox="0 0 100 100"><rect width="9" height="9"/></svg>' }, { name: 'Ok', kind: 'icon', idea: 'a plain bar', svg: '<svg viewBox="0 0 100 100"><rect width="9" height="9"/></svg>' }] }, usage: {} }) });
  assert.deepEqual(named.dropped, ['polo pony'], 'a motif that names or describes someone else\'s mark loses its drawing'); assert.equal(named.program.motifs.find(m => m.name === 'Polo pony').svg, '');
  assert.equal((await generateProgram({ lines: [], env: ENV, askImpl: async () => ({ json: {}, usage: {} }) })).program, null);
});

test('concepts apply the program\'s motifs by id and take their drawing, words and kind; they can still choose where', async () => {
  const program = cleanProgram(programFixture({ user: '' })), words = programWords(program);
  assert.match(words, /Graphic program "Quiet Varsity"/); assert.match(words, /m1 "FB crest" \(crest, reads "FB"/); assert.match(words, /Palette: Navy #1F3A5F/);
  const r = resolveMotifs([{ motif: 'm1', placement: 'front chest', technique: 'embroidery' }, { motif: 'zz', name: 'New one', idea: 'own' }, { name: 'Free', idea: 'own' }], program);
  assert.equal(r[0].name, 'FB crest'); assert.equal(r[0].kind, 'crest'); assert.deepEqual(r[0].texts, ['FB']); assert.ok(r[0].svg.includes('<path')); assert.equal(r[0].placement, 'front chest', 'the concept chooses where'); assert.equal(r[1].svg, undefined, 'an unknown id is left as it was'); assert.equal(resolveMotifs(null, program).length, 0);
  let call; const g = await generateConcepts({ line: { name: 'Tee', category: 'tops', role: 'core' }, program, count: 3, env: ENV, askImpl: async a => { call = a; return { json: conceptFixture({ user: a.user }), usage: {} }; } });
  assert.match(call.user, /Motifs \(apply them by id\)/); assert.match(call.user, /m3 "Band stripes"/);
  assert.equal(g.concepts[0].spec.graphics[0].name, 'FB crest'); assert.ok(g.concepts[0].spec.graphics[0].svg.includes('<path') && g.concepts[0].spec.graphics[0].motif === 'm1'); assert.equal(g.concepts[1].spec.graphics[0].kind, 'stripes'); assert.equal(g.concepts[2].spec.graphics.length, 0);
  assert.equal(g.concepts[0].programName, 'Quiet Varsity');
  const brief = productBrief({ name: 'Tee', category: 'tops', programName: 'Quiet Varsity', spec: g.concepts[0].spec }, {}); assert.match(brief, /Graphic program:<\/strong> Quiet Varsity/); assert.match(brief, /FB crest \(crest, left chest, embroidery[^)]*\) reading &quot;FB&quot;/);
});

test('what the graphics say is read by the check against copying', () => {
  const spec = ensureBranding({ description: 'd', graphics: [{ name: 'Crest', kind: 'crest', idea: 'a shield', placement: 'front chest', technique: 'embroidery', texts: ['POLO CLUB'] }] }, 'tops');
  assert.equal(closeness({ name: 'Tee', twist: 'ours', spec }, []).verdict, 'clear', 'the words alone are not a brand');
  const bad = ensureBranding({ description: 'd', graphics: [{ name: 'Crest', kind: 'crest', idea: 'a shield', placement: 'front chest', technique: 'embroidery', texts: ['GUCCI 1921'] }] }, 'tops'); const c = closeness({ name: 'Tee', twist: 'ours', spec: bad }, []);
  assert.equal(c.verdict, 'too_close'); assert.ok(c.hits.includes('Gucci'));
});

test('the artwork for the tech pack: the logo, the woven label and each graphic as transparent files', async () => {
  const spec = ensureBranding({ branding: { logo: { mark: 'lockup' } }, graphics: [{ name: 'Crest', kind: 'crest', idea: 'a shield', placement: 'left chest', technique: 'embroidery', texts: ['FB'], svg: MOTIF().svg }] }, 'tops');
  const files = await artworkFiles({ category: 'tops', spec }); assert.equal(files.length, 3); assert.match(files[0].name, /Future Basics logo · Wordmark and cue mark/); assert.equal(files[1].name, 'Future Basics internal woven label'); assert.match(files[2].name, /Graphic · Crest \(FB\)/);
  for (const f of files) { assert.match(f.image, /^data:image\/png;base64,/); const m = await sharp(Buffer.from(f.image.split(',')[1], 'base64')).metadata(); assert.ok(m.width >= 600 && m.height > 20, f.name); }
  const g = await sharp(Buffer.from(files[2].image.split(',')[1], 'base64')).metadata(); assert.equal(g.hasAlpha, true, 'a graphic has a transparent background');
  assert.equal((await artworkFiles({ category: 'tops', spec: {} })).length, 2, 'a concept with no graphics still has the logo and the label');
});

test('the library reads the graphics the references use, and the brand code says how deep ours go', () => {
  const rows = [{ id: 'a', title: 't', category: 'tops', price: 90, heat: 50, firstSeenAt: '2026-10-01T00:00:00Z', attrs: { graphics: ['Embroidered crest', 'embroidered crest', 'varsity numerals'] }, brand: 'R', role: 'reference' }];
  const tops = trendRead(rows, { now: new Date('2026-10-17') }).categories.find(c => c.id === 'tops'); assert.deepEqual(tops.graphics.map(g => [g.name.toLowerCase(), g.n]), [['embroidered crest', 2], ['varsity numerals', 1]]);
  assert.match(DEFAULT_BRAND_CODE.graphicsApproach, /deep, original graphic program/); assert.match(DEFAULT_BRAND_CODE.graphicsApproach, /Never copy/); assert.match(brandCodeWords(cleanBrandCode({})), /Graphics: A deep, original graphic program/);
  assert.equal(cleanBrandCode({ graphicsApproach: ' Go deeper ' }).graphicsApproach, 'Go deeper'); assert.match(cleanBrandCode({}).graphicsApproach, /crests and emblems/);
});
