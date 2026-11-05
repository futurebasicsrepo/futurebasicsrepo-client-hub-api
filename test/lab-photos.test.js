import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { MATERIAL_PHOTOS, photoFor, photoById, creditOf } from '../src/lab-photos.js';
import { photoJpeg, photoShade } from '../src/lab-photo-tint.js';
import { BUILTIN_MATERIALS, cleanMaterial, FABRIC_CONSTRUCTIONS } from '../src/lab-materials.js';

test('every photo in the list has its file, a free licence and a credit', () => {
  assert.equal(new Set(MATERIAL_PHOTOS.map(p => p.id)).size, MATERIAL_PHOTOS.length);
  for (const p of MATERIAL_PHOTOS) {
    assert.ok(existsSync(new URL(`../src/material-photos/${p.id}.jpg`, import.meta.url)), p.id);
    assert.match(p.credit.licence, /^(CC0|CC BY(-SA)? [34]\.0)$/, p.id);
    assert.match(p.credit.url, /^https:\/\/(polyhaven\.com|ambientcg\.com|commons\.wikimedia\.org)\//, p.id);
    if (p.credit.licence !== 'CC0') assert.ok(p.credit.by && !/contributor/i.test(p.credit.by), `${p.id} names its author`);
  }
  assert.match(creditOf(photoById('ripstop')), /Flyout.*Wikimedia Commons.*CC BY-SA 3\.0.*recoloured/);
  assert.match(creditOf(photoById('zip-metal')), /Woodbine9/);
  assert.doesNotMatch(creditOf(photoById('zip-metal')), /recoloured/); // trims keep their own colours
});

test('a fabric gets a photo from what it is: weight, construction and finish', () => {
  const f = (construction, o = {}) => photoFor({ kind: 'fabric', spec: { construction, ...o }, colours: o.colours || [] });
  assert.equal(f('denim', { finish: 'raw' }), 'denim-raw');
  assert.equal(f('denim', { finish: 'stone washed' }), 'denim-washed');
  assert.equal(f('denim', { finish: 'overdyed' }), 'denim');
  assert.equal(f('duck canvas', { weightGsm: 610 }), 'duck');
  assert.equal(f('canvas', { weightGsm: 240 }), 'canvas-light');
  assert.equal(f('canvas', { weightGsm: 340 }), 'canvas');
  assert.equal(f('polar fleece'), 'polar');
  assert.equal(f('brushed fleece'), 'sweat');
  assert.equal(f('French terry'), 'terry');
  assert.equal(f('single jersey', { colours: [{ name: 'heather grey', hex: '#9a9a9c' }] }), 'melange');
  assert.equal(f('single jersey'), 'jersey');
  assert.equal(f('nylon ripstop'), 'ripstop');
  assert.equal(f('cotton ripstop'), 'ripstop');
  assert.equal(f('nylon taslan'), 'nylon');
  assert.equal(f('rib 2×2'), ''); // no honest photo: the drawing stays
  assert.equal(f('denim', { photo: 'twill' }), 'twill'); // chosen by hand
  assert.equal(f('denim', { photo: 'none' }), ''); // the drawing, by choice
  assert.equal(photoFor({ kind: 'trim', spec: { category: 'zip', material: 'brass teeth', finish: 'antique brass' } }), 'zip-metal');
  assert.equal(photoFor({ kind: 'trim', spec: { category: 'zip', material: 'brass teeth', finish: 'antique nickel' } }), '');
  assert.equal(photoFor({ kind: 'tag', spec: {} }), '');
});

test('the starting library has denim, fleece, terry, knits, polyesters, ripstop, nylon and canvas at several weights, nearly all with a photo', () => {
  const fabrics = BUILTIN_MATERIALS.filter(m => m.kind === 'fabric');
  for (const m of fabrics) { assert.ok(FABRIC_CONSTRUCTIONS.includes(m.spec.construction), m.key); assert.ok(!cleanMaterial(m).error, m.key); }
  const family = re => fabrics.filter(m => re.test(`${m.spec.construction} ${m.spec.composition}`));
  for (const [name, re, n] of [['denim', /denim|chambray/, 8], ['fleece', /fleece|sherpa/, 6], ['terry', /terry|loopback/, 5], ['knits', /jersey|interlock|piqué|waffle|rib|knit|tricot/, 10], ['polyester', /polyester/, 8], ['ripstop', /ripstop/, 5], ['nylon', /nylon|cordura/, 6], ['canvas', /canvas/, 6]]) {
    const got = family(re); assert.ok(got.length >= n, `${name}: ${got.length}`);
    assert.ok(new Set(got.map(m => m.spec.weightGsm)).size >= Math.min(3, got.length), `${name} comes in several weights`);
  }
  const withPhoto = fabrics.filter(m => photoFor(m)).length;
  assert.ok(withPhoto / fabrics.length > .9, `${withPhoto} of ${fabrics.length} fabrics have a photo`);
  assert.equal(cleanMaterial({ kind: 'fabric', name: 'Test', spec: { photo: 'nonsense' } }).material.spec.photo, '');
  assert.equal(cleanMaterial({ kind: 'fabric', name: 'Test', spec: { photo: 'denim' } }).material.spec.photo, 'denim');
});

test('a photo is recoloured to the material colour and keeps its texture', async () => {
  const stats = async hex => (await sharp(await photoJpeg('canvas', hex, 160)).stats()).channels;
  const black = await stats('#141416'), bone = await stats('#e9e3d4'), indigo = await stats('#2b3a5c');
  assert.ok(black[0].mean < 60 && bone[0].mean > 180, `black ${black[0].mean}, bone ${bone[0].mean}`);
  assert.ok(indigo[2].mean > indigo[0].mean + 15, 'navy reads blue');
  assert.ok(black[0].stdev > 2 && bone[0].stdev > 4, 'the weave still shows');
  const m = await sharp(await photoJpeg('denim', '2b3a5c', 320)).metadata(); assert.equal(m.width, 320); assert.equal(m.format, 'jpeg');
  assert.equal(await photoJpeg('nope', '#000000'), null);
  assert.ok(await photoJpeg('zip-metal', '#ff0000', 160)); // trims come as they are
});

test('a shading tile is grey, light on average, and mirrored so it repeats without a seam', async () => {
  const buf = await photoShade('denim-raw', 320); assert.ok(buf);
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 320); assert.equal(info.height, 320);
  let m = 0; for (const v of data) m += v; m /= data.length;
  assert.ok(m > 205 && m < 245, `the mean sits just under white, so a colour multiplied by it keeps its value (got ${m.toFixed(1)})`);
  let lo = 255; for (const v of data) lo = Math.min(lo, v); assert.ok(lo < m - 20, 'and the weave still has light and dark');
  // the left edge matches the right edge and the top the bottom: the tile meets its neighbours without a line
  let dx = 0, dy = 0; for (let i = 0; i < 320; i++) { dx += Math.abs(data[i * 320] - data[i * 320 + 319]); dy += Math.abs(data[i] - data[319 * 320 + i]); }
  assert.ok(dx / 320 < 6 && dy / 320 < 6, `edges match (${(dx / 320).toFixed(1)}, ${(dy / 320).toFixed(1)})`);
  assert.equal(await photoShade('no-such-photo'), null);
});
