import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bend, smooth, nearest, insertAt, removeAt, handlesOf, modelLines, moveLine, fitLine } from '../src/lab-lines.js';
import { footwearPattern, cleanFootwear } from '../src/lab-footwear.js';
import { plushPattern } from '../src/lab-pattern.js';

const line = Array.from({ length: 41 }, (_, i) => [i * .1, 0, .7]);
test('a hand line bends where it is dragged: the point moves the whole way, its neighbours less, the far end not at all, and pressure is kept', () => {
  const b = bend(line, 20, [2, 1], .8);
  assert.deepEqual(b[20].slice(0, 2), [2, 1]); assert.ok(b[22][1] > 0 && b[22][1] < 1); assert.equal(b[0][1], 0); assert.equal(b[40][1], 0); assert.equal(b[22][2], .7);
  assert.deepEqual(bend(line, 99, [0, 0]), line, 'a point it does not have changes nothing');
});
test('smoothing keeps the ends, points can be put in and taken out, and the shaping points are found', () => {
  const zig = line.map((p, i) => [p[0], i % 2 ? .2 : 0]), s = smooth(zig, 2);
  assert.deepEqual(s[0], zig[0]); assert.deepEqual(s[40], zig[40]); assert.ok(Math.abs(s[20][1] - .1) < .06);
  const r = insertAt([[0, 0], [2, 0]], [1, .3]); assert.equal(r.i, 1); assert.deepEqual(r.pts[1], [1, 0]);
  assert.equal(removeAt([[0, 0], [1, 0]], 0).length, 2, 'a line keeps two points'); assert.equal(removeAt([[0, 0], [1, 0], [2, 0]], 1).length, 2);
  assert.equal(nearest(line, [1.04, .3]).i, 10);
  assert.deepEqual(handlesOf([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]), [0, 2, 4]);
});
test('the shoe\'s own lines each have a handle and what moves them; dragging one, or drawing where it goes, drafts the shoe again', () => {
  const pat = footwearPattern({ style: 'sneaker', mudguard: true }), ls = modelLines(pat), by = k => ls.find(l => l.key === k);
  assert.deepEqual(ls.map(l => l.key), ['vamp', 'throat', 'collar', 'toeCap', 'mudguard', 'heelOverlay']);
  // the vamp line half an inch toward the toe
  const v = moveLine(by('vamp'), .5), F = pat.last.foot; assert.ok(Math.abs(v.vamp - (by('vamp').value + .5 / F)) < .011);
  const moved = footwearPattern(cleanFootwear({ style: 'sneaker', mudguard: true, ...v })); assert.ok(moved.marks.vamp > pat.marks.vamp + .4);
  // the collar a quarter inch up (y is downward), the toe cap and the mudguard bounded
  assert.equal(moveLine(by('collar'), -.25).collar, Math.round((by('collar').value + .25) * 8) / 8);
  assert.equal(moveLine(by('toeCap'), -20).capLen, 4); assert.equal(moveLine(by('mudguard'), 5).mudH, .4);
  const tc = footwearPattern({ style: 'sneaker', capLen: 3 }); assert.ok(tc.pieces.find(q => q.id === 'toe-cap') && modelLines(tc).find(l => l.key === 'toeCap').value === 3);
  // a hand line drawn an inch behind the vamp line becomes the vamp line
  const hand = by('vamp').pts.map(([x, y]) => [x - 1, y, 1]), f = fitLine(by('vamp'), hand); assert.ok(f.vamp < by('vamp').value - .08);
  // a boot has no lacing start of its own (its shaft) and no mudguard unless asked
  assert.ok(!modelLines(footwearPattern({ style: 'boot' })).some(l => l.key === 'mudguard' || l.key === 'throat'));
});
test('a plush\'s height is a model line too: its handle sits on its front and moves up and down', () => {
  const l = modelLines(plushPattern({ shape: 'bear', height: 12 }))[0];
  assert.equal(l.key, 'height'); assert.equal(l.view, 'front'); assert.deepEqual(moveLine(l, -2), { height: 14 }); assert.deepEqual(moveLine(l, 40), { height: 4 });
  assert.deepEqual(modelLines({ kind: 'garment' }), []);
});
