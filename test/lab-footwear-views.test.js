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
    if (FW_STYLES[style].laced) assert.ok((v.lateral.svg.match(/<circle/g) || []).length === pat.marks.eyelets.length && (v.top.svg.match(/<circle/g) || []).length === pat.marks.eyelets.length * 2, `${style} eyelets`);
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
