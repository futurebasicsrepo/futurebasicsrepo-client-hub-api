import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { lastOf, footwearPattern, cleanFootwear, cleanLast3d } from '../src/lab-footwear.js';
import { readMesh, prepareLast, loftLast, stlOf, renderViews, guessUnits, useLast, compareToDraft, orient, openShare } from '../src/lab-last3d.js';
import { buildGlb } from '../src/mesh.js';

// a last turned every which way and moved off the origin, as a scanner or a CAD file hands it over
function turned(pos, { a = .7, b = -.4, c = 1.1, k = 1, move = [1.5, -.4, 12] } = {}) {
  const R = [[Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b) * Math.sin(c) - Math.sin(a) * Math.cos(c), Math.cos(a) * Math.sin(b) * Math.cos(c) + Math.sin(a) * Math.sin(c)], [Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b) * Math.sin(c) + Math.cos(a) * Math.cos(c), Math.sin(a) * Math.sin(b) * Math.cos(c) - Math.cos(a) * Math.sin(c)], [-Math.sin(b), Math.cos(b) * Math.sin(c), Math.cos(b) * Math.cos(c)]];
  const q = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) q[i + j] = (R[j][0] * pos[i] + R[j][1] * pos[i + 1] + R[j][2] * pos[i + 2]) * k + move[j];
  return q;
}
const objOf = pos => { let v = '', f = ''; for (let t = 0; t < pos.length / 9; t++) { for (let k = 0; k < 3; k++) v += `v ${pos[t * 9 + k * 3]} ${pos[t * 9 + k * 3 + 1]} ${pos[t * 9 + k * 3 + 2]}\n`; f += `f ${t * 3 + 1}/1/1 ${t * 3 + 2}/1/1 ${t * 3 + 3}/1/1\n`; } return Buffer.from('# a last\no last\n' + v + f); };

test('a lofted last is turned and measured back to the drafted one, whatever way the file has it', () => {
  for (const style of ['sneaker', 'derby', 'boot']) {
    const spec = { style }, d = lastOf(spec), stl = stlOf(turned(loftLast(spec)));
    const p = prepareLast(stl, 'last.stl', { heelHeight: d.heelHeight }), m = p.measures;
    assert.equal(p.units, 'mm'); // stlOf writes millimetres
    assert.ok(Math.abs(m.length - d.length) < .06, `${style} length ${m.length} vs ${d.length}`);
    assert.ok(Math.abs(m.heelHeight - d.heelHeight) < .02, `${style} heel ${m.heelHeight}`);
    assert.ok(Math.abs(m.toeSpring - d.toeSpring) < .2, `${style} spring ${m.toeSpring} vs ${d.toeSpring}`);
    assert.ok(Math.abs(m.ballWidth - d.ballWidth) < .3, `${style} ball width ${m.ballWidth}`);
    assert.ok(Math.abs(m.ballGirth - d.ballGirth) < .45, `${style} ball girth ${m.ballGirth} vs ${d.ballGirth}`);
    assert.ok(Math.abs(m.ballFromHeel - d.ballFromHeel) < .4, `${style} ball ${m.ballFromHeel}`);
    assert.equal(m.whichFoot, 'right');
    assert.equal(m.heelFrom, 'given');
  }
});

test('without its heel height a last is stood on its ball: an estimate, close for a low heel', () => {
  const d = lastOf({ style: 'sneaker' }), m = prepareLast(stlOf(turned(loftLast({ style: 'sneaker' }))), 'x.stl').measures;
  assert.equal(m.heelFrom, 'estimated');
  assert.ok(Math.abs(m.heelHeight - d.heelHeight) < .15 && Math.abs(m.length - d.length) < .1, JSON.stringify([m.heelHeight, m.length]));
});

test('a left last stays a left last (turned, never mirrored)', () => {
  const pos = loftLast({ style: 'derby' }); for (let i = 2; i < pos.length; i += 3) pos[i] = -pos[i];
  for (let t = 0; t < pos.length; t += 9) for (let k = 0; k < 3; k++) { const a = pos[t + 3 + k]; pos[t + 3 + k] = pos[t + 6 + k]; pos[t + 6 + k] = a; } // a mirror turns the triangles inside out: put them back
  assert.equal(prepareLast(stlOf(turned(pos)), 'x.stl', { heelHeight: 1 }).measures.whichFoot, 'left');
});

test('STL (binary and text), OBJ and GLB are read; the units are guessed or given', () => {
  const pos = turned(loftLast({ style: 'runner' }), { k: 1 }), bin = stlOf(pos.map(v => v / 25.4)); // stlOf writes mm: these corners come out in inches
  assert.equal(readMesh(bin, 'a.stl').format, 'stl');
  const txt = Buffer.from('solid a\n' + Array.from({ length: pos.length / 9 }, (_, t) => `facet normal 0 0 0\nouter loop\n${[0, 1, 2].map(k => `vertex ${pos[t * 9 + k * 3]} ${pos[t * 9 + k * 3 + 1]} ${pos[t * 9 + k * 3 + 2]}`).join('\n')}\nendloop\nendfacet`).join('\n') + '\nendsolid a\n');
  const a = prepareLast(txt, 'a.stl', { heelHeight: .4 }); assert.equal(a.units, 'in'); assert.ok(Math.abs(a.measures.length - lastOf({ style: 'runner' }).length) < .06);
  const o = prepareLast(objOf(pos.map(v => v * 2.54)), 'a.obj', { heelHeight: .4 }); assert.equal(o.units, 'cm'); assert.equal(o.format, 'obj');
  assert.ok(Math.abs(o.measures.length - a.measures.length) < .02);
  assert.equal(guessUnits(275), 'mm'); assert.equal(guessUnits(.28), 'm'); assert.equal(guessUnits(80), null);
  assert.throws(() => prepareLast(objOf(pos.map(v => v * 7)), 'a.obj'), e => e.code === 'units');
  assert.throws(() => prepareLast(objOf(pos.map(v => v * 7)), 'a.obj', { units: 'mm' }), /not a last/); // 76 mm long: the units given are wrong
  const ix = Uint32Array.from({ length: pos.length / 3 }, (_, i) => i), glb = buildGlb({ positions: Array.from(pos.map(v => v * .0254)), normals: new Array(pos.length).fill(0), uvs: new Array(pos.length / 3 * 2).fill(0), indices: Array.from(ix) });
  const g = prepareLast(glb, 'a.glb', { heelHeight: .4 }); assert.equal(g.format, 'glb'); assert.equal(g.units, 'm'); assert.ok(Math.abs(g.measures.length - a.measures.length) < .02);
  assert.throws(() => readMesh(Buffer.from('this is not a model at all, just words'.repeat(4)), 'notes.txt'), /STL, OBJ or GLB/);
});

test('a model with no units (the 3D service) is fitted to the size: its length, then its ball girth', () => {
  const d = lastOf({ style: 'sneaker', size: 11 }), raw = turned(loftLast({ style: 'sneaker' }), { k: .0371 }); // arbitrary units, a different size
  const p = prepareLast(stlOf(raw.map(v => v / 25.4)), 'gen.stl', { fit: { length: d.length, ballGirth: d.ballGirth }, heelHeight: d.heelHeight });
  assert.equal(p.units, 'fitted');
  assert.ok(Math.abs(p.measures.length - d.length) < .03 && Math.abs(p.measures.ballGirth - d.ballGirth) < .05, JSON.stringify([p.measures.length, p.measures.ballGirth]));
});

test('the shoe drafts on a measured last, in its size and graded to the others', () => {
  const m = prepareLast(stlOf(turned(loftLast({ style: 'boot', size: 10.5 }))), 'x.stl', { heelHeight: 1.25 }).measures;
  const spec = useLast({ style: 'boot', size: 8 }, m, { name: 'Scan 10.5' });
  assert.equal(spec.size, 10.5); assert.equal(spec.heel, 1.25); assert.ok(spec.last3d && spec.last3d.name === 'Scan 10.5');
  assert.deepEqual(cleanFootwear(JSON.parse(JSON.stringify(spec))).last3d, spec.last3d); // survives saving
  const here = lastOf(spec), up = lastOf(spec, 12), draft12 = lastOf({ style: 'boot' }, 12), draft105 = lastOf({ style: 'boot' }, 10.5);
  assert.ok(Math.abs(here.length - m.length) < .01 && here.measured.name === 'Scan 10.5');
  assert.ok(Math.abs(up.length - here.length - (draft12.length - draft105.length)) < .01); // the length grades as the draft does
  assert.ok(Math.abs(up.ballGirth - here.ballGirth - .375) < .13); // ¼ in a full size
  const pat = footwearPattern(spec); assert.ok(pat.pieces.length >= 12 && pat.last.measured);
  assert.ok(compareToDraft(m, spec).every(r => Number.isFinite(r.diff)));
  assert.equal(cleanLast3d({ length: 11 }), null); // half a measurement is no last
});

test('the pictures for the 3D service: four shaded views of the last on white', async () => {
  const views = await renderViews(orient(loftLast({ style: 'derby' })), { size: 256 });
  assert.equal(views.length, 4);
  for (const v of views) { const { info, data } = await sharp(v).raw().toBuffer({ resolveWithObject: true }); assert.equal(info.width, 256); let ink = 0; for (let i = 0; i < data.length; i += info.channels) if (data[i] < 240) ink++; assert.ok(ink > 256 * 256 * .05, 'the last fills part of the picture'); }
});

test('holes in the surface are found and said, not fatal', () => {
  const pos = loftLast({ style: 'sneaker' });
  assert.ok(openShare(pos) < .002, 'the loft is closed');
  const holey = new Float32Array(pos.length - 9 * 40); holey.set(pos.subarray(0, 9 * 1000)); holey.set(pos.subarray(9 * 1040), 9 * 1000);
  const p = prepareLast(stlOf(holey), 'scan.stl', { heelHeight: .45 });
  assert.ok(p.open > .002 && p.warnings.some(w => /holes/.test(w)), JSON.stringify(p.warnings));
  assert.ok(Math.abs(p.measures.length - lastOf({ style: 'sneaker' }).length) < .06);
});
