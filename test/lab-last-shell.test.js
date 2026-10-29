import test from 'node:test';
import assert from 'node:assert/strict';
import { lastOf, footwearPattern, cleanFootwear, cleanSeams } from '../src/lab-footwear.js';
import { shellOf, flattenPoint, onSurface, cutOutline, splitPiece } from '../src/lab-last-shell.js';
import { boundsOf, areaOf } from '../src/lab-pattern.js';

test('the last\'s sides are peeled flat with little stretch, lying over the side view', () => {
  for (const style of ['sneaker', 'derby', 'boot']) {
    const sh = shellOf(lastOf({ style }));
    for (const side of ['lateral', 'medial']) {
      const h = sh[side]; assert.equal(h.pts.length, (h.n + 1) * (h.m + 1));
      assert.ok(h.stretch.rms < .15 && h.stretch.max < .35, `${style} ${side} ${JSON.stringify(h.stretch)}`);
      // the feather line flattens close to where the side view has it (it is lined up on the side view)
      const d = Array.from({ length: h.n + 1 }, (_, i) => { const f = h.flat[i * (h.m + 1)], p = h.pts[i * (h.m + 1)]; return Math.hypot(f[0] - p[0], f[1] + p[1]); });
      assert.ok(d.reduce((a, b) => a + b, 0) / d.length < 1.2, `${style} ${side} feather line`);
    }
  }
});

test('a side-view point is found on the surface, at the height it shows', () => {
  const l = lastOf({ style: 'derby' }), sh = shellOf(l);
  for (const [x, y] of [[3, -1], [6, -1.5], [8.5, -.6]]) {
    const p = onSurface(sh.lateral, [x, y]); assert.ok(Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] + y) < .02 && p[2] > 0, JSON.stringify(p));
    assert.ok(onSurface(sh.medial, [x, y])[2] < 0, 'the inside is the negative side');
  }
  const a = flattenPoint(sh.lateral, [5, -1]), b = flattenPoint(sh.lateral, [5, -2]); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > .95, 'an inch up the side is at least an inch flat');
});

test('pieces are cut flattened off the last: taller over the curve of the side than the side view shows; flatten: false keeps the side view', () => {
  const flat = footwearPattern({ style: 'sneaker' }), side = footwearPattern({ style: 'sneaker', flatten: false });
  assert.ok(flat.flat && flat.flat.lateral.rms > 0 && !side.flat);
  const q = id => [flat.pieces.find(p => p.id === id), side.pieces.find(p => p.id === id)];
  for (const id of ['quarter-lat', 'quarter-med', 'vamp']) {
    const [f, s] = q(id); assert.ok(f.flattened && !s.flattened);
    assert.ok(areaOf(f.sew) > areaOf(s.sew) * .98, `${id} flat ${areaOf(f.sew)} side ${areaOf(s.sew)}`);
    assert.deepEqual(f.shown, s.shown, `${id} still shows on the shoe as before`);
  }
  // the vamp is cut whole: its flattened outline is still mirrored about its centre line
  const v = q('vamp')[0].sew; assert.ok(Math.abs(areaOf(v.slice(0, Math.ceil(v.length / 2))) - areaOf(v.slice(Math.floor(v.length / 2)))) / areaOf(v) < .25);
  assert.equal(flat.pieces.find(p => p.id === 'insole').sew.length, side.pieces.find(p => p.id === 'insole').sew.length, 'the bottom pieces are not flattened again');
});

test('an outline is cut in two along a line, which is carried on to meet its edges', () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]], parts = cutOutline(sq, [[2, 1], [2, 3]]);
  assert.ok(parts && Math.abs(areaOf(parts[0]) + areaOf(parts[1]) - 16) < 1e-6 && Math.abs(areaOf(parts[0]) - 8) < 1e-6);
  assert.equal(cutOutline(sq, [[5, 5], [6, 6]]), null);
  const kinked = cutOutline(sq, [[1, -1], [1.5, 2], [3, 5]]); assert.ok(kinked && Math.abs(areaOf(kinked[0]) + areaOf(kinked[1]) - 16) < 1e-6);
});

test('a seam drawn on the last cuts the quarter into a back and a front, both flattened, and survives saving', () => {
  const seams = cleanSeams([{ piece: 'quarter-lat', side: 'lateral', pts: [[3, .2], [3.2, -3.5]], name: 'Back quarter seam' }, { piece: 'nope' }, { piece: 'x', pts: [[1, 1]] }]);
  assert.equal(seams.length, 1); assert.equal(seams[0].id, 's1');
  const spec = cleanFootwear({ style: 'sneaker', seams }), pat = footwearPattern(spec), ids = pat.pieces.map(p => p.id);
  assert.ok(!ids.includes('quarter-lat') && ids.includes('quarter-lat-b1') && ids.includes('quarter-lat-f1') && ids.includes('quarter-med'), ids.join());
  const [b, f] = ['quarter-lat-b1', 'quarter-lat-f1'].map(id => pat.pieces.find(p => p.id === id));
  assert.ok(b.name === 'Quarter, outside (back)' && f.name === 'Quarter, outside (front)' && b.flattened === 'lateral' && boundsOf(b.shown).x1 < boundsOf(f.shown).x1);
  assert.deepEqual(cleanFootwear(JSON.parse(JSON.stringify(spec))).seams, spec.seams);
  const miss = footwearPattern({ style: 'sneaker', seams: [{ piece: 'quarter-lat', pts: [[20, 1], [21, 2]] }] });
  assert.ok(miss.pieces.some(p => p.id === 'quarter-lat') && miss.notes.some(n => /does not cross/.test(n)));
  assert.equal(splitPiece(pat.pieces.find(p => p.id === 'counter'), { pts: [[30, 30], [31, 31]] }), null);
});
