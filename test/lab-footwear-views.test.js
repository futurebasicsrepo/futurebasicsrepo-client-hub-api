import test from 'node:test';
import assert from 'node:assert/strict';
import { footwearPattern, FW_STYLES } from '../src/lab-footwear.js';
import { footwearViews, viewsLayout, flatsSheet } from '../src/lab-footwear-views.js';

test('every style is drawn from four sides: outside, inside, top and bottom', () => {
  for (const style of Object.keys(FW_STYLES)) {
    const pat = footwearPattern({ style }), v = footwearViews(pat);
    for (const k of ['lateral', 'medial', 'top', 'bottom']) {
      const b = v[k].box; assert.ok(b.x1 - b.x0 > pat.last.length * .9 && b.x1 - b.x0 < pat.last.length + 2, `${style} ${k} width ${b.x1 - b.x0}`);
      assert.ok(!/NaN|Infinity/.test(v[k].svg), `${style} ${k} draws only numbers`);
    }
    assert.ok(v.lateral.box.y1 - v.lateral.box.y0 > 3 && v.top.box.y1 - v.top.box.y0 > 3 && v.top.box.y1 - v.top.box.y0 < 5.5, `${style} proportions`);
    assert.ok(/data-pid="vamp"/.test(v.lateral.svg) && /data-pid="quarter-lat"/.test(v.lateral.svg) && !/data-pid="quarter-med"/.test(v.lateral.svg) && /data-pid="quarter-med"/.test(v.medial.svg), `${style}: each side shows its own quarter`);
    if (FW_STYLES[style].laced) assert.ok((v.lateral.svg.match(/<circle/g) || []).length === pat.marks.eyelets.length && ((n, e) => pat.marks.shaft ? n >= 8 && n <= e * 2 : n === e * 2)((v.top.svg.match(/<circle/g) || []).length, pat.marks.eyelets.length), `${style} eyelets`);
    assert.ok(/<clipPath id="fbt\d+o">/.test(v.top.svg), `${style}: from above the foot opening shows, with the sockliner inside it`);
  }
});

test('the sheet lays the four views out without overlapping, and a stitched sole stands on a heel', () => {
  const pat = footwearPattern({ style: 'boot' }), lay = viewsLayout(footwearViews(pat)), [L, M, T, B] = lay.items.map(i => i.box);
  const apart = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
  assert.ok(apart(L, M) && apart(L, T) && apart(T, B) && apart(M, B));
  const svg = flatsSheet(pat, { title: 'Test boot' }); assert.ok(/Lateral \(outside\)/.test(svg) && /Medial \(inside\)/.test(svg) && /Top/.test(svg) && /Bottom/.test(svg) && /Test boot/.test(svg));
  // the boot's sole leaves the ground under the waist (a heel block and a thin sole), a runner's stays on it
  const lowestUnderWaist = st => { const p = footwearPattern({ style: st }), m = /<path d="(M[^"]+)" fill="#f3f0e8"/.exec(footwearViews(p).lateral.svg), pts = m[1].slice(1).split(' L').map(q => q.split(' ').map(Number)), w = pts.filter(q => q[0] > p.last.F * .4 && q[0] < p.last.F * .55); return Math.max(...w.map(q => q[1])) - (p.ground || 0); };
  assert.ok(lowestUnderWaist('boot') < -.15, 'the boot\'s waist is off the ground'); assert.ok(lowestUnderWaist('runner') > -.05, 'the runner\'s sole is on the ground under the waist');
});

test('from above the shoe is foot-shaped: a narrow round heel, widest across the ball, the toe a little to the inside; a boot has a level collar on a real shaft', () => {
  const pat = footwearPattern({ style: 'runner' }), top = footwearViews(pat).top, L = pat.last.length;
  const outline = [...top.svg.matchAll(/<path d="(M[^"]+)" fill="#f1f0ec|<path d="(M[^"]+)" fill="#f4f4f2/g)][0], pts = (outline[1] || outline[2]).slice(1).replace(' Z', '').split(' L').map(q => q.split(' ').map(Number));
  const width = x => { const near = pts.filter(q => Math.abs(q[0] - x) < .25); return Math.max(...near.map(q => q[1])) - Math.min(...near.map(q => q[1])); };
  assert.ok(width(L * .15) < width(L * .7) * .72 && width(L * .7) > 3.2 && width(L * .7) < 4.6, `heel ${width(L * .15)} against ball ${width(L * .7)}`);
  assert.ok(width(L * .45) > width(L * .15), 'the upper does not pinch in at the waist from above');
  const boot = footwearPattern({ style: 'boot' }), c = boot.marks.collar, top0 = c[0][1], front = c[c.length - 1];
  assert.ok(front[0] > 3 && Math.abs(front[1] - top0) < .5, `the boot's collar runs level about 3½ in to the front of the leg (${front})`);
  const e = boot.marks.eyelets; assert.ok(e[0][1] < top0 + 1 && e[e.length - 1][0] > boot.marks.vamp - 1, 'the lacing runs from the top of the shaft down to the vamp');
});
