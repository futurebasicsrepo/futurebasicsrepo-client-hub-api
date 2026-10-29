import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, defaultParams } from '../src/lab-flats.js';
import { garmentPattern, plushPattern, cleanPlush, offsetOf, areaOf, boundsOf, layoutOf, explodeAt, assembled, patternDxf, patternSvg, fillGrams, cutWords } from '../src/lab-pattern.js';
import { kindOf, cleanPatternSpec } from '../src/lab-pattern-routes.js';

const ok = pts => pts.length >= 3 && pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

test('every style the flats know drafts into whole pieces, each with a grain, a cut and a seam allowance', () => {
  for (const style of Object.keys(STYLES)) {
    const pat = garmentPattern(defaultParams(style), 'M');
    assert.ok(pat.pieces.length >= 1, style);
    for (const q of pat.pieces) { assert.ok(ok(q.sew), `${style} ${q.id}`); assert.ok(areaOf(q.sew) > .5, `${style} ${q.id} has an area`); assert.equal(q.grain.length, 2); assert.match(cutWords(q), /^Cut \d/); }
    assert.ok([.375, .5].includes(pat.sa), style);
  }
});

test('a tee: front and back on the fold, a pair of sleeves whose cap fits the armhole, a neck rib, and it grades with the size', () => {
  const p = defaultParams('tee'), M = garmentPattern(p, 'M'), XL = garmentPattern(p, 'XL'), by = (pat, id) => pat.pieces.find(q => q.id === id);
  assert.deepEqual(['front', 'back', 'sleeve', 'neck-rib'].map(id => Boolean(by(M, id))), [true, true, true, true]);
  assert.ok(by(M, 'front').fold && by(M, 'back').fold && by(M, 'sleeve').pair && by(M, 'sleeve').cut === 2);
  assert.ok(by(M, 'sleeve-2').twin && by(M, 'sleeve-2').cut === 0, 'the second sleeve is drawn on the product but never cut twice');
  const w = id => boundsOf(by(M, id).sew).w, wx = id => boundsOf(by(XL, id).sew).w;
  assert.ok(Math.abs(w('front') - p.m.chest) < .05, `the front is the chest across (${w('front')} vs ${p.m.chest})`);
  assert.ok(wx('front') - w('front') > 1.9 && wx('front') - w('front') < 2.1, 'two sizes up is 2 in wider');
  // the neck rib is shorter than the neckline it is stretched onto
  assert.ok(boundsOf(by(M, 'neck-rib').sew).w < 2 * p.m.neckWidth + 2 * p.m.neckDropFront + 4);
});

test('a hoodie has a hood in a pair and a kangaroo pocket; pants have legs in pairs, a waistband and pocket bags in pocketing', () => {
  const h = garmentPattern(defaultParams('hoodie'));
  assert.ok(h.pieces.some(q => q.id === 'hood' && q.pair) && h.pieces.some(q => q.id === 'pocket'));
  const pt = garmentPattern(defaultParams('pants'));
  assert.ok(pt.pieces.some(q => q.id === 'front' && q.cut === 2) && pt.pieces.some(q => q.id === 'back' && q.cut === 2) && pt.pieces.some(q => q.id === 'waistband'));
  assert.equal(pt.pieces.find(q => q.id === 'pocket-bag').fabric, 'pocketing');
  const back = pt.pieces.find(q => q.id === 'back'), front = pt.pieces.find(q => q.id === 'front');
  assert.ok(boundsOf(back.sew).x1 > boundsOf(front.sew).x1, 'the back crotch reaches further than the front');
  const cap = garmentPattern(defaultParams('cap'));
  assert.equal(cap.pieces.filter(q => /^panel-/.test(q.id) && q.cut).reduce((s, q) => s + q.cut, 0), 6, 'six crown panels');
});

test('the seam allowance grows the piece outward by about the allowance', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]], cut = offsetOf(sq, .5), b = boundsOf(cut);
  assert.deepEqual([b.x0, b.y0, b.x1, b.y1], [-.5, -.5, 10.5, 10.5]);
  const back = garmentPattern(defaultParams('tee')).pieces.find(q => q.id === 'back');
  assert.ok(areaOf(offsetOf(back.sew, .375)) > areaOf(back.sew));
});

test('the layout counts every cut, keeps fabrics apart, and the yardage of a tee is in the range a factory quotes', () => {
  const pat = garmentPattern(defaultParams('crewneck')), lay = layoutOf(pat, { width: 58 }), self = lay.find(g => g.fabric === 'self'), rib = lay.find(g => g.fabric === 'rib');
  const cuts = pat.pieces.filter(q => q.fabric === 'self').reduce((s, q) => s + q.cut, 0);
  assert.equal(self.items.length, cuts); assert.ok(rib && rib.items.length >= 3);
  for (const it of self.items) { const b = boundsOf(offsetOf(it.piece.sew, pat.sa)); assert.ok(it.x + b.x0 >= -1e-6 && it.x + b.x1 <= self.width + 1e-6, 'inside the cloth'); }
  const tee = layoutOf(garmentPattern(defaultParams('tee'))).find(g => g.fabric === 'self');
  assert.ok(tee.yards > .8 && tee.yards < 1.6, String(tee.yards));
});

test('the exploded view starts on the product and ends in the layout', () => {
  const pat = garmentPattern(defaultParams('hoodie')), A = assembled(pat), start = explodeAt(pat, 0), end = explodeAt(pat, 1);
  assert.equal(start.length, pat.pieces.length);
  const f0 = start.find(x => x.piece.id === 'front'), a0 = A.pieces.find(x => x.piece.id === 'front');
  assert.deepEqual(f0.pts, a0.pts, 'at 0 the pieces sit on the product');
  const f1 = end.find(x => x.piece.id === 'front');
  assert.ok(boundsOf(f1.pts).x0 > A.bounds.x1, 'at 1 they are laid out beside it');
  const mid = explodeAt(pat, .45), m = mid.find(x => x.piece.id === 'pocket');
  assert.ok(boundsOf(m.pts).y1 !== boundsOf(start.find(x => x.piece.id === 'pocket').pts).y1, 'in between they have lifted off');
});

test('plush: each shape drafts its pieces, the choices are bounded, and the safety checks follow the age', () => {
  for (const shape of ['bear', 'bean', 'bunny', 'pillow']) { const p = plushPattern({ shape }); assert.ok(p.pieces.every(q => ok(q.sew)), shape); assert.equal(p.sa, .25); assert.ok(fillGrams(p) > 20, shape); }
  const bear = plushPattern({ shape: 'bear', height: 12 });
  assert.ok(['head-side', 'gusset', 'body-front', 'body-back', 'arm', 'leg', 'foot-pad', 'ear', 'muzzle'].every(id => bear.pieces.some(q => q.id === id)));
  assert.ok(bear.pieces.find(q => q.id === 'body-back').notes.some(n => /opening/.test(n)), 'the stuffing opening is marked');
  assert.ok(plushPattern({ shape: 'bear', height: 24 }).pieces.find(q => q.id === 'gusset').sew.length && boundsOf(plushPattern({ shape: 'bear', height: 24 }).pieces.find(q => q.id === 'gusset').sew).h > boundsOf(bear.pieces.find(q => q.id === 'gusset').sew).h * 1.9, 'twice as tall, twice the pieces');
  assert.deepEqual(cleanPlush({ shape: 'dragon', height: 400, ears: 'wings', eyes: 'lasers' }), { ...cleanPlush({}), height: 48 });
  assert.ok(plushPattern({ eyes: 'safety', age: '0+' }).checks.some(c => c.level === 'fail' && /Safety eyes/.test(c.msg)));
  assert.ok(!plushPattern({ eyes: 'safety', age: '3+' }).checks.some(c => c.level === 'fail'));
  assert.ok(plushPattern({ shape: 'bean', legs: true }).pieces.every(q => q.id !== 'leg'), 'a bean has no legs to choose');
});

test('the files: a DXF a pattern system reads (closed cut and sew polylines per piece, inches) and a 1:1 SVG', () => {
  const pat = garmentPattern(defaultParams('tee')), dxf = patternDxf(pat), cuts = pat.pieces.reduce((s, q) => s + q.cut, 0);
  assert.match(dxf, /^0\nSECTION\n2\nHEADER/); assert.match(dxf, /EOF\n$/);
  assert.equal((dxf.match(/\nPOLYLINE\n8\nCUT\n/g) || []).length, cuts); assert.equal((dxf.match(/\nPOLYLINE\n8\nSEW\n/g) || []).length, cuts);
  assert.ok(/\$INSUNITS\n70\n1/.test(dxf), 'inches');
  const svg = patternSvg(plushPattern({ shape: 'bean' }), { title: 'Bean <test>' });
  assert.match(svg, /width="[\d.]+in"/); assert.match(svg, /Bean &lt;test&gt;/); assert.ok(!/NaN/.test(svg));
});

test('what kind of pattern a concept is cut from', () => {
  assert.equal(kindOf({ category: 'plush' }), 'plush');
  assert.equal(kindOf({ category: 'tops', name: 'Heavy hoodie' }), 'garment');
  assert.equal(kindOf({ category: 'footwear', name: 'Court sneaker' }), 'footwear');
  assert.equal(kindOf({ category: 'toys', name: 'Figure' }), 'soon');
  assert.equal(kindOf({ category: 'electronics', name: 'Charger' }), 'soon');
  assert.equal(kindOf({ category: 'other', name: 'Thing' }, 'tee'), 'garment');
  assert.deepEqual(cleanPatternSpec('garment', { sa: 3, width: 9 }), { sa: null, width: 58 });
  assert.deepEqual(cleanPatternSpec('garment', { sa: .625, width: 60 }), { sa: .625, width: 60 });
});

import { applyEdits, cleanPatternEdits, simplifyClosed, runLength, patternDxfAama } from '../src/lab-pattern.js';

test('edits: a piece edited in one size is kept exactly there, and follows the drafted piece in another size; removed and added pieces', () => {
  const p = defaultParams('tee'), M = garmentPattern(p, 'M'), XL = garmentPattern(p, 'XL'), fr = M.pieces.find(q => q.id === 'front'), b = boundsOf(fr.sew);
  const sew = simplifyClosed(fr.sew, .015).map(([x, y]) => [x, y > 20 ? y + 1 : y]);
  const edits = cleanPatternEdits({ size: 'M', pieces: { front: { sew, notches: [[0, 10]], box: [b.x0, b.y0, b.w, b.h], sa: .5, name: 'Front body', grain: 90 } }, removed: ['neck-rib'], added: [{ id: 'xpocket', sew: [[0, 0], [5, 0], [5, 6], [0, 6]], name: 'Patch pocket', cut: 2 }] });
  const e = applyEdits(M, edits), f = e.pieces.find(q => q.id === 'front');
  assert.deepEqual(f.sew, sew, 'exactly as edited in its own size'); assert.equal(f.name, 'Front body'); assert.equal(f.sa, .5); assert.ok(f.edited);
  assert.ok(Math.abs(f.grain[0][1] - f.grain[1][1]) < .01, 'grain turned to 90 degrees: across the piece');
  assert.ok(!e.pieces.some(q => q.id === 'neck-rib') && e.pieces.some(q => q.id === 'xpocket' && q.cut === 2 && q.added));
  const fx = applyEdits(XL, edits).pieces.find(q => q.id === 'front'), bx = boundsOf(XL.pieces.find(q => q.id === 'front').sew), be = boundsOf(sew);
  assert.ok(Math.abs(boundsOf(fx.sew).w - be.w * bx.w / b.w) < .01, 'in XL it grows with the drafted front');
  assert.equal(applyEdits(M, null), M);
});

test('cleaning edits: bounded, and nothing kept from junk', () => {
  assert.equal(cleanPatternEdits({}), null); assert.equal(cleanPatternEdits({ pieces: { front: { sew: [[0, 0], [1, 1]] } } }), null, 'two points is not a piece');
  const c = cleanPatternEdits({ pieces: { 'Bad Id!': { sew: [[0, 0], [1, 0], [1, 1]] }, front: { sew: [[0, 0], [1e9, 0], [1, 1]], sa: 7, cut: 99, fabric: 'gold', grain: 450 } }, removed: ['x;drop'] });
  assert.deepEqual(Object.keys(c.pieces), ['front']); assert.equal(c.pieces.front.sew[1][0], 400); assert.ok(!('sa' in c.pieces.front)); assert.equal(c.pieces.front.cut, 24); assert.ok(!('fabric' in c.pieces.front)); assert.equal(c.pieces.front.grain, 90); assert.deepEqual(c.removed, []);
});

test('a run of an outline is measured forward round it, and the outline is simplified without losing its shape', () => {
  const sq = [[0, 0], [4, 0], [4, 3], [0, 3]];
  assert.equal(runLength(sq, 0, 2), 7); assert.equal(runLength(sq, 2, 0), 7); assert.equal(runLength(sq, 3, 1), 7);
  const hood = garmentPattern(defaultParams('hoodie')).pieces.find(q => q.id === 'hood').sew, s = simplifyClosed(hood, .015);
  assert.ok(s.length < hood.length && s.length >= 8); assert.ok(Math.abs(areaOf(s) - areaOf(hood)) / areaOf(hood) < .01, 'area within 1%');
});

test('AAMA DXF: a block a piece and a size with its text, the standard layers, inserts, metric or English', () => {
  const p = defaultParams('pants'), pats = ['S', 'M', 'L'].map(z => garmentPattern(p, z)), dxf = patternDxfAama(pats, { style: 'Pleated pant', units: 'in' });
  const blocks = (dxf.match(/\n0\nBLOCK\n/g) || []).length, perSize = pats[0].pieces.filter(q => q.cut > 0).length;
  assert.equal(blocks, perSize * 3); assert.equal((dxf.match(/\n0\nINSERT\n/g) || []).length, blocks);
  for (const t of ['Style Name: Pleated pant', 'Units: ENGLISH', 'Size List: S M L', 'Piece Name: Front leg', 'Quantity: 2 (pairs)', 'Material: POCKETING']) assert.ok(dxf.includes(t), t);
  for (const layer of ['1', '2', '4', '7', '14']) assert.ok(new RegExp(`\\n8\\n${layer}\\n`).test(dxf), `layer ${layer}`);
  assert.match(dxf, /\$ACADVER\n1\nAC1009/); assert.match(dxf, /EOF\n$/);
  const mm = patternDxfAama(pats[1], { units: 'mm' }); assert.ok(mm.includes('Units: METRIC') && mm.includes('$MEASUREMENT\n70\n1'));
  const xs = s => [...s.matchAll(/\nVERTEX\n8\n14\n10\n(-?[\d.]+)/g)].map(m => Number(m[1]));
  assert.ok(Math.abs(Math.max(...xs(mm)) / Math.max(...xs(patternDxfAama(pats[1]))) - 25.4) < .01, 'millimetres are inches times 25.4');
});
