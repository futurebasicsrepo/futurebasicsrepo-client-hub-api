import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookRecipe } from '../src/lab-recipe.js';
import { garmentPattern, placed, boundsOf, areaOf } from '../src/lab-pattern.js';
import { drawingOf } from '../src/lab-flats.js';

test('a shearling aviator is measured like one and its pattern has what it is made of', () => {
  const r = cookRecipe({ base: 'jacket', addons: ['neck-shearling'] });
  assert.ok(garmentPattern(r.params).pieces.some(q => q.id === 'strap'), 'the chest strap');
  assert.ok(r.params.m.length > 26 && r.params.m.length < 31, `body length ${r.params.m.length}`); // was 37 1/4 from a misread sketch
  const pat = garmentPattern(r.params), by = id => pat.pieces.find(q => q.id === id);
  assert.equal(by('collar').fabric, 'shearling'); assert.equal(by('hem-rib').fabric, 'shearling'); assert.equal(by('cuff').fabric, 'shearling');
  assert.ok(!by('neck-rib'), 'no knit rib under a shearling collar');
  assert.ok(by('welt') && by('pocket-bag'), 'welt pockets and their bags');
  // the hem band shows across the front only, as wide as the body
  const hb = boundsOf(placed(by('hem-rib'))); assert.ok(Math.abs(hb.w - r.params.m.chest) < .01);
  // each cuff sits on the end of its sleeve
  for (const [s, c] of [['sleeve', 'cuff'], ['sleeve-2', 'cuff-2']]) {
    // the cuff's top edge touches the sleeve's outline, far from the shoulder
    const sl = placed(by(s)), cf = placed(by(c)), near = q => Math.min(...sl.map(p => Math.hypot(p[0] - q[0], p[1] - q[1])));
    assert.ok(Math.min(...cf.map(near)) < 1.2, `${c} on the sleeve end`); assert.ok(Math.min(...cf.map(q => q[1])) > 12, `${c} at the wrist, not the shoulder`);
  }
  // on the product a long sleeve hangs as the flats draw it: close to the body, down past the hem band's top, not held out at an angle
  const sb = boundsOf(placed(by('sleeve'))), m = r.params.m;
  assert.ok(sb.x1 - m.chest / 2 < 9, `the sleeve stays near the body (${(sb.x1 - m.chest / 2).toFixed(1)} in out)`);
  assert.ok(sb.y1 > m.length - m.hemRib - 3, 'it falls to the hip, as on the flats');
  assert.ok(areaOf(by('sleeve').shown) < areaOf(by('sleeve').sew), 'seen flat, less than the cut piece');
  // the back view has what wraps round to it, shown and not cut again
  for (const id of ['sleeve-back', 'sleeve-2-back', 'cuff-back', 'cuff-2-back', 'hem-rib-back', 'collar-back']) { const q = by(id); assert.ok(q && q.place.view === 'back' && q.cut === 0 && q.copy, id); }
  // the fix corrects only the length: the sketch stays laid over inches as measured, so colour blocks and graphics already placed stay on it
  const d = drawingOf(r.params, 'front'); assert.equal(d.v.chest, 134.91); assert.equal(d.v.hpsY, 98.42);
});

test('a colour block stays on its part of the drawing when the length changes how the sketch is laid over inches', async () => {
  const { remapEdits, defaultParams } = await import('../src/lab-flats.js');
  const from = { ...defaultParams('jacket'), template: 'jk-shearling-aviator-jacket' }; from.m.length = 37.25;
  const to = { ...from, m: { ...from.m, length: 29.5 } };
  const block = { id: 'b1', type: 'block', view: 'front', color: '#a83a2a', pts: [[-4, 1], [4, 1], [4, 6], [-4, 6]] }, dot = { id: 'd', type: 'detail', kind: 'button', view: 'back', x: 1, y: 10, w: .5, h: .5 };
  const [b2, d2] = remapEdits([block, dot], from, to);
  const svg = (p, v, [x, y]) => { const d = drawingOf(p, v); return [x * d.sx + d.ox, y * d.sy + d.oy]; };
  for (let i = 0; i < 4; i++) { const a = svg(from, 'front', block.pts[i]), b = svg(to, 'front', b2.pts[i]); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < .01, 'block corner on the same spot of the sketch'); }
  const a = svg(from, 'back', [dot.x, dot.y]), b = svg(to, 'back', [d2.x, d2.y]); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < .01);
  assert.deepEqual(remapEdits([block], from, from), [block], 'nothing moves when nothing changed');
});

test('a lined jacket is cut with its facings, lining, fusing, zip guard and pocket facings, and lists its trims', () => {
  const r = cookRecipe({ base: 'jacket', addons: ['neck-shearling'] }), pat = garmentPattern(r.params), by = id => pat.pieces.find(q => q.id === id), m = r.params.m;
  for (const id of ['front-facing', 'back-facing', 'front-lining', 'back-lining', 'sleeve-lining', 'zip-guard', 'pocket-facing', 'inside-welt', 'inside-bag', 'under-collar']) assert.ok(by(id)?.cut > 0, id);
  for (const id of ['front-facing-fuse', 'back-facing-fuse', 'under-collar-fuse', 'welt-fuse', 'zip-guard-fuse', 'strap-fuse']) assert.equal(by(id)?.fabric, 'fusing', id);
  assert.equal(by('front-lining').fabric, 'lining'); assert.equal(by('sleeve-lining').fabric, 'lining');
  // the lining is the shell less the facing: narrower than the front by the facing's band, and its back has the 1 in centre-back pleat
  const fb = boundsOf(by('front').sew), lb = boundsOf(by('front-lining').sew), ff = boundsOf(by('front-facing').sew);
  const facingAtHem = Math.max(...by('front-facing').sew.filter(([, y]) => y > fb.y1 - 1).map(([x]) => x)); assert.ok(Math.abs(lb.x0 - facingAtHem) < .01, 'the lining starts where the facing ends');
  assert.ok(Math.abs(lb.x1 - fb.x1) < .01, 'and reaches the side seam');
  assert.equal(boundsOf(by('back-lining').sew).x0, -1, 'centre-back pleat');
  // the sleeve lining: the underarm raised, a jump pleat at the cuff
  const sb = boundsOf(by('sleeve').sew), slb = boundsOf(by('sleeve-lining').sew); assert.ok(slb.y1 - sb.y1 > .4, 'longer for the jump pleat');
  // hidden on the product, under the shell
  assert.ok(['front-lining', 'sleeve-lining', 'under-collar'].every(id => by(id).hidden));
  // the trims: a separating zip sized to the front, eyelets for the strap, the labels and where they go
  const zip = pat.trims.find(t => t.item === 'Separating zip'); assert.ok(zip && /open-end/.test(zip.spec)); assert.match(zip.spec, new RegExp(`${Math.round(m.length + 0 - m.neckDropFront - .5)}|\\d+ in`));
  for (const t of ['Eyelets', 'Main label', 'Care and content label', 'Hanger loop', 'Seam tape']) assert.ok(pat.trims.some(x => x.item === t), t);
  // an unlined knit has none of it
  // an unlined knit has none of it: only what every garment carries (its labels, thread and the tape over its back neck seam)
  const tee = garmentPattern(cookRecipe({ base: 'tee' }).params); assert.ok(!tee.pieces.some(q => q.fabric === 'lining')); assert.deepEqual(tee.trims.map(t => t.item), ['Main label', 'Size label', 'Care and content label', 'Thread', 'Back neck tape']);
});
