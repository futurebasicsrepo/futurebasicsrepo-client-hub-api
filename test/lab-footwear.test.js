import test from 'node:test';
import assert from 'node:assert/strict';
import { footLength, lastOf, sizeRun, footwearPattern, cleanFootwear, tooling, hideArea, lastSvg, FW_STYLES } from '../src/lab-footwear.js';
import { layoutOf, explodeAt, assembled, boundsOf, areaOf, patternDxf } from '../src/lab-pattern.js';
import { guessShoe } from '../src/lab-pattern-routes.js';

const ok = pts => pts.length >= 3 && pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

test('sizes: a US size is a third of an inch of foot, and the size systems agree', () => {
  assert.ok(Math.abs(footLength('us-m', 9) - 31 / 3) < 1e-9);
  assert.ok(Math.abs(footLength('us-m', 10) - footLength('us-m', 9) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(footLength('us-w', 10.5) - footLength('us-m', 9)) < .2, "a women's 10½ is about a men's 9");
  assert.ok(Math.abs(footLength('mm', 265) - 265 / 25.4) < 1e-9);
  const eu = lastOf({ system: 'eu', size: 42 }), us = lastOf({ system: 'us-m', size: 9 });
  assert.ok(Math.abs(eu.length - us.length) < .35, `EU 42 and US 9 are about one last (${eu.length} vs ${us.length})`);
});

test('the last: its length is the foot and the toe allowance; girth grows a quarter inch a size and a width; heel and spring are as chosen', () => {
  const l = lastOf({ style: 'sneaker', size: 9, width: 'D' });
  assert.ok(Math.abs(l.length - (31 / 3 + .5)) < .001); assert.equal(l.ballGirth, 9.375);
  assert.equal(lastOf({ size: 10 }).ballGirth - l.ballGirth, .25); assert.equal(lastOf({ size: 9, width: 'EE' }).ballGirth - l.ballGirth, .5);
  assert.ok(lastOf({ toe: 'pointed' }).length > l.length + .7);
  assert.ok(ok(l.side) && ok(l.bottom)); const b = boundsOf(l.side);
  assert.ok(Math.abs(b.x1 - l.length) < .05 && b.y0 < -3.5, 'the side view is the last, its length long and over 3½ in tall');
  const d = lastOf({ style: 'derby' }); assert.equal(d.heelHeight, FW_STYLES.derby.heel);
  assert.ok(Math.abs(d.lastBottom(0) + d.heelHeight) < 1e-9 && Math.abs(d.lastBottom(d.L) + d.toeSpring) < .01, 'the heel sits up by the heel height, the toe by the spring');
});

test('the size run: every size in steps, its last and girth graded, a sole mould for each pair of half sizes', () => {
  const run = sizeRun({ runFrom: 7, runTo: 13 });
  assert.equal(run.length, 13); assert.deepEqual([run[0].size, run.at(-1).size], [7, 13]);
  assert.ok(run.every((r, i) => !i || r.lastMm > run[i - 1].lastMm), 'longer every step');
  assert.equal(new Set(run.map(r => r.mould)).size, 7);
  assert.equal(sizeRun({ runFrom: 7, runTo: 13, halves: false }).length, 7);
  const t = tooling({ runFrom: 7, runTo: 13 }); assert.equal(t.moulds, 7); assert.ok(t.mouldCost[0] > 0 && t.lastPairs === 13);
});

test('every style drafts its upper: vamp, quarters inside and out, linings, stiffeners, insole and sockliner; laced styles get eyestays and a tongue', () => {
  for (const style of Object.keys(FW_STYLES)) {
    const pat = footwearPattern({ style }), ids = pat.pieces.map(q => q.id);
    for (const id of ['vamp', 'quarter-lat', 'quarter-med', 'quarter-lining', 'vamp-lining', 'counter', 'toe-puff', 'insole', 'sockliner', 'sole']) assert.ok(ids.includes(id), `${style} has ${id}`);
    assert.equal(ids.includes('tongue'), FW_STYLES[style].laced, `${style} tongue`); assert.equal(ids.includes('eyestay'), FW_STYLES[style].laced);
    for (const q of pat.pieces) { assert.ok(ok(q.sew) && areaOf(q.sew) > .1, `${style} ${q.id} cut shape`); if (q.shown) assert.ok(ok(q.shown), `${style} ${q.id} on the shoe`); }
    assert.ok(pat.pieces.find(q => q.id === 'sole').component && pat.pieces.find(q => q.id === 'sole').cut === 0, 'the sole is moulded, not cut');
  }
  assert.ok(footwearPattern({ style: 'chelsea' }).pieces.some(q => q.id === 'gore' && q.cut === 4));
  assert.ok(footwearPattern({ style: 'loafer' }).pieces.some(q => q.id === 'apron'));
  assert.ok(!footwearPattern({ style: 'sneaker', toeCap: false }).pieces.some(q => q.id === 'toe-cap'));
});

test('the vamp is cut whole and wider than the half that shows on the side; the pattern grades with the size', () => {
  const p9 = footwearPattern({ size: 9 }), p12 = footwearPattern({ size: 12 }), v9 = p9.pieces.find(q => q.id === 'vamp');
  assert.ok(areaOf(v9.sew) > areaOf(v9.shown) * 1.6, 'cut whole: about twice what shows on one side');
  const q9 = boundsOf(p9.pieces.find(q => q.id === 'quarter-lat').sew), q12 = boundsOf(p12.pieces.find(q => q.id === 'quarter-lat').sew);
  assert.ok(q12.w > q9.w + .5, 'three sizes up, the quarter is longer');
  const sizeArg = footwearPattern({ size: 9 }, 11).last; assert.equal(sizeArg.size, 11);
});

test('the exploded view and the layout work for a shoe: pieces off the side and the bottom, moulded parts stay out of the cutting', () => {
  const pat = footwearPattern({ style: 'runner' }), A = assembled(pat), lay = layoutOf(pat);
  assert.ok(A.backDx > 0, 'the bottom view sits beside the side view');
  assert.ok(!lay.some(g => g.items.some(it => it.piece.component)), 'no moulded part in the cutting');
  assert.ok(lay.some(g => g.fabric === 'upper') && lay.some(g => g.fabric === 'lining') && lay.some(g => g.fabric === 'foam'));
  for (const t of [0, .3, .7, 1]) assert.ok(explodeAt(pat, t, lay).every(x => ok(x.pts)), `t ${t}`);
  const hide = hideArea(pat); assert.ok(hide.upper > 1 && hide.upper < 6, `a pair of runners takes a few square feet of upper (${hide.upper})`);
  assert.match(patternDxf(pat), /Vamp - Cut 2/);
});

test('cleaning the choices, the last drawing, and reading a style from the words', () => {
  const c = cleanFootwear({ style: 'stiletto', system: 'us-m', size: 99, width: 'Z', heel: 9, runFrom: 12, runTo: 4 });
  assert.equal(c.style, 'sneaker'); assert.equal(c.size, 18); assert.equal(c.width, 'D'); assert.equal(c.heel, 4); assert.ok(c.runTo >= c.runFrom);
  assert.equal(cleanFootwear({ system: 'us-w' }).width, 'B'); assert.equal(cleanFootwear({ system: 'eu' }).size, 42);
  const svg = lastSvg({ style: 'boot' }); assert.match(svg, /last length/); assert.match(svg, /ball girth/); assert.ok(!/NaN/.test(svg));
  assert.equal(guessShoe({ name: 'Suede Chelsea boot' }), 'chelsea'); assert.equal(guessShoe({ name: 'Penny loafer' }), 'loafer'); assert.equal(guessShoe({ name: 'Court shoe' }), 'sneaker'); assert.equal(guessShoe({ name: 'Trail runner' }), 'runner');
});
