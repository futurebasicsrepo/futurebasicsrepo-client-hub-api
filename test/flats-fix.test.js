// One tap to fix what the flats check found (fixPlacement in src/lab-flats.js): each fix clears its finding, makes nothing else worse, and
// changes the placement the least it takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, placementChecks, fixPlacement, fixLabel, regionOf, geometry, STYLES } from '../src/lab-flats.js';

const hoodie = defaultParams('hoodie');
const logo = o => ({ id: 'a', name: 'Logo', view: 'front', x: 0, y: 8, w: 4, h: 3, ...o });
const level = (f, lv) => f.filter(x => x.level === lv).length;
// apply the fix for one finding and check it did what it says
function fixed(q, p, code, opts = {}) {
  const f = placementChecks(q, p, opts.rules || {}).find(x => x.code === code); assert.ok(f, `the check finds ${code}`);
  assert.ok(fixLabel(f), `${code} has a button`);
  const r = fixPlacement(q, p, f, opts); assert.ok(r, `${code} has a fix`);
  const c = { ...q, ...r.set }, after = placementChecks(c, p, opts.rules || {});
  assert.ok(!after.some(x => x.code === code), `${code} is gone`);
  assert.equal(level(after, 'fail'), 0, `nothing fails after: ${JSON.stringify(after)}`);
  return { c, r, after };
}

test('every finding the check makes has a button, and only those', () => {
  for (const code of ['OFF_PIECE', 'OVER_EDGE', 'NEAR_SEAM', 'OVERLAP', 'TOO_WIDE', 'TOO_TALL', 'CAP_SIZE', 'TECHNIQUE', 'KEEPOUT_POCKET', 'KEEPOUT_ZIP', 'TINY', 'FINE_DETAIL']) assert.ok(fixLabel({ code }), code);
  for (const code of ['INKS', 'GRADIENT', 'STITCHES']) assert.equal(fixLabel({ code }), null, `${code} is fixed in the artwork, not by moving it`);
});

test('a graphic over the side seam is moved in, the least it takes, and stays on the body', () => {
  const q = logo({ x: 9, w: 6, h: 4 }), { c, r } = fixed(q, hoodie, 'OVER_EDGE');
  assert.equal(c.w, q.w); assert.equal(c.y, q.y, 'moved only across');
  assert.ok(c.x < q.x && c.x > 5, `x ${c.x}`);
  assert.equal(regionOf(c, geometry(hoodie, 'front')), 'body');
  assert.match(r.words, /^Logo moved .* toward the wearer's right\.$/);
});

test('a graphic over the kangaroo pocket is moved clear of it', () => {
  const { c } = fixed(logo({ y: 17, w: 8, h: 4 }), hoodie, 'KEEPOUT_POCKET');
  assert.ok(c.y < 17);
});

test('a graphic off the piece is put on it, keeping its height where it can', () => {
  const { c } = fixed(logo({ x: 30, w: 4, h: 4 }), hoodie, 'OFF_PIECE');
  assert.equal(c.y, 8);
});

test('too wide for the technique: made to fit, keeping its shape', () => {
  const rules = { maxW: 12, maxH: 12 }, q = logo({ w: 14, h: 6 }), { c } = fixed(q, hoodie, 'TOO_WIDE', { rules });
  assert.equal(c.w, 12); assert.ok(Math.abs(c.w / c.h - q.w / q.h) < .05);
});

test('a cap front graphic too big for the crown is sized to what a cap takes', () => {
  const cap = Object.keys(STYLES).find(k => STYLES[k].kind === 'cap'), p = defaultParams(cap), q = { id: 'a', name: 'Logo', view: 'front', x: 0, y: -1.8, w: 6, h: 2 };
  const f = placementChecks(q, p, {}).find(x => x.code === 'CAP_SIZE'); assert.ok(f);
  const r = fixPlacement(q, p, f, {}); assert.ok(r); assert.ok(r.set.w <= 4.75 && r.set.h <= 2.5, JSON.stringify(r.set));
});

test('two graphics on top of each other: the one fixed moves clear of the other', () => {
  const a = logo({ id: 'a', y: 7 }), b = logo({ id: 'b', name: 'Wordmark', y: 8 });
  const r = fixPlacement(a, hoodie, { code: 'OVERLAP' }, { others: [a, b] }); assert.ok(r);
  const c = { ...a, ...r.set }; assert.ok(!(Math.abs(c.x - b.x) * 2 < c.w + b.w && Math.abs(c.y - b.y) * 2 < c.h + b.h), 'no longer overlapping');
});

test('a technique not made on the product is swapped for the first one that is', () => {
  const q = logo({}), techniques = [{ id: 't1', name: 'Mug wrap', base: 'sublimation', madeOn: ['ceramic'] }, { id: 't2', name: 'Screen print', base: 'screen print', madeOn: ['cloth'] }];
  const r = fixPlacement(q, hoodie, { code: 'TECHNIQUE' }, { techniques });
  assert.ok(r); assert.deepEqual(r.set, { techniqueId: 't2', technique: 'screen print' });
  assert.equal(fixPlacement(q, hoodie, { code: 'TECHNIQUE' }, { techniques: techniques.slice(0, 1) }), null);
});

test('too small to read, or detail too fine to hold: made bigger, to what the check asked for', () => {
  const q = logo({ w: .5, h: .25 }), r = fixPlacement(q, hoodie, { code: 'TINY' }, {}); assert.ok(r);
  assert.ok(r.set.w >= .75 && r.set.h >= .3, JSON.stringify(r.set)); assert.match(r.words, /made bigger/);
  const g = fixPlacement(logo({ w: 2, h: 1 }), hoodie, { code: 'FINE_DETAIL', grow: 3 }, {}); assert.ok(g); assert.equal(g.set.w, 3);
});

test('when nothing close by clears it, there is no fix rather than a worse one', () => {
  const q = logo({ w: 40, h: 40 }), f = placementChecks(q, hoodie, {}).find(x => x.code === 'OVER_EDGE');
  // even at half its size it cannot sit on the body
  assert.equal(fixPlacement(q, hoodie, f, {}), null);
});
