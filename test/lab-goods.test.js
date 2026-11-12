// The product types that are not garments (src/lab-goods.js): each one's flat at its base size has a closed outline, a print area inside it,
// draws as an svg, takes a graphic in its print area, keeps its measurements through a save, and has no pattern. Drinkware has a wrap laid
// flat as its second view (test/lab-wrap.test.js holds the wrap itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOODS, goodsGeom, goodsSides, hasWrap, goodsTakes } from '../src/lab-goods.js';
import { STYLES, viewsOf, sideOf, pomName, defaultParams, geometry, renderSvg, defaultPlacement, placementChecks, cleanFlat, pomTable, describe, detectStyle, measurementsFor, SIZES } from '../src/lab-flats.js';
import { kindOf, notSewn } from '../src/lab-pattern-routes.js';
import { rankFabrics } from '../src/lab-fabric-fit.js';

const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const area = poly => Math.abs(poly.reduce((a, q, i) => { const r = poly[(i + 1) % poly.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
const TYPES = Object.keys(GOODS);

test('every product type is a style of the flats: one size, drawn from its measurements, each measurement an eighth of an inch and named', () => {
  assert.ok(TYPES.length >= 60, `${TYPES.length} product types`);
  for (const k of TYPES) { const S = STYLES[k], g = GOODS[k];
    assert.ok(S && S.kind === 'goods' && S.oneSize, k); assert.ok(g.label && g.group && g.from, `${k} says what it is and where its size came from`);
    assert.ok(['other', 'accessories'].includes(S.category), `${k}: a category the Studio draws flats for (home, toys and electronics open the 3D engineer instead)`);
    for (const [m, v] of Object.entries(g.base)) { assert.ok(v > 0 && Math.round(v * 8) === v * 8, `${k}.${m} = ${v}`); assert.notEqual(pomName(k, m), m, `${k}.${m} has a name`); }
    const p = defaultParams(k); assert.deepEqual(p.m, g.base); for (const z of SIZES) assert.deepEqual(measurementsFor(p, z), g.base, `${k} is one size`);
    assert.equal(pomTable(p).length, Object.keys(g.base).length);
  }
});

test('every product type at its base size: a closed outline, a print area inside the outline, and an svg, on each side it has', () => {
  for (const k of TYPES) { const p = defaultParams(k), sides = viewsOf(k);
    assert.deepEqual(sides, goodsSides(GOODS[k])); assert.equal(sides[0], 'front');
    for (const view of ['front', 'back']) {
      const g = geometry(p, view), tag = `${k} ${view}`;
      assert.ok(g.outline.length >= 3 && g.outline.every(q => q.length === 2 && q.every(Number.isFinite)), `${tag}: an outline of points`);
      assert.ok(area(g.outline) > .5, `${tag}: the outline encloses an area`);
      assert.ok(g.parts.some(q => q.kind === 'outline' && / Z$/.test(q.d)), `${tag}: drawn closed`);
      const b = g.bounds; for (const q of g.outline) assert.ok(q[0] >= b.x0 - 1e-6 && q[0] <= b.x1 + 1e-6 && q[1] >= b.y0 - 1e-6 && q[1] <= b.y1 + 1e-6, `${tag}: inside its bounds`);
      const regions = Object.entries(g.regions);
      assert.equal(regions.length > 0, sides.includes(view), `${tag}: a print area on the sides it has, none on a side it has not`);
      for (const [name, poly] of regions) { assert.match(name, /print area$/, `${tag}: ${name}`); assert.ok(area(poly) > .2, `${tag}: ${name} has an area`);
        const c = [poly.reduce((a, q) => a + q[0], 0) / poly.length, poly.reduce((a, q) => a + q[1], 0) / poly.length];
        const outline = (g.outlines || [g.outline]).find(o => inside(c, o)); assert.ok(outline, `${tag}: ${name} is on the product`); // a cup's sides are drawn together, each with its own outline
        for (const q of poly) assert.ok(inside([c[0] + (q[0] - c[0]) * .98, c[1] + (q[1] - c[1]) * .98], outline), `${tag}: ${name} is inside the outline at ${q.map(n => n.toFixed(2))}`); }
      for (const d of g.pom) assert.ok(d.key in p.m, `${tag}: measures ${d.key}`);
      const svg = renderSvg(p, view, { showPom: true }); assert.match(svg, /^<svg [^>]*viewBox="[-\d. ]+"/); assert.ok(!/NaN|undefined/.test(svg), `${tag}: draws without gaps`);
    }
    assert.equal(goodsGeom(GOODS[k], GOODS[k].base, 'front').outline.length, geometry(p, 'front').outline.length);
  }
});

test('every product type takes a graphic in its print area, checks it, recolours and saves without losing a measurement', () => {
  for (const k of TYPES) { const p = defaultParams(k);
    for (const aspect of [1, 2.5, .5]) { const q = { id: 'a', name: 'Art', ...defaultPlacement('graphic', p, { aspect }) }, f = placementChecks(q, p, {});
      assert.ok(!f.some(x => x.level === 'fail'), `${k} at ${aspect}: ${f.map(x => x.code).join()}`); assert.ok(describe(q, p).length > 10); }
    const q = defaultPlacement('graphic', p), off = placementChecks({ id: 'b', name: 'Art', ...q, x: 500 }, p, {}); assert.equal(off[0].code, 'OFF_PIECE', `${k}: off the product is caught`);
    const saved = cleanFlat({ style: k, m: p.m, color: '#2B5D3A', template: 'none', placements: [{ id: 'a', name: 'Art', ...q }] });
    assert.equal(saved.error, undefined); assert.deepEqual(saved.params.m, p.m, `${k}: its measurements survive a save`); assert.equal(saved.params.color, '#2b5d3a'); assert.equal(saved.placements.length, 1);
    assert.deepEqual([saved.placements[0].x, saved.placements[0].y, saved.placements[0].w, saved.placements[0].h], [q.x, q.y, q.w, q.h], `${k}: its graphic stays where it was put`);
    assert.match(renderSvg(saved.params, 'front', { placements: saved.placements }), /data-pl="a"/);
    // "back" in the words: the back of a two-sided product; a cup's back is drawn beside its front (its second view is its wrap), so it stays on that view
    const bk = defaultPlacement('graphic', p, { label: 'back' });
    if (hasWrap(GOODS[k])) { assert.equal(bk.view, 'front'); assert.equal(sideOf(bk, p), GOODS[k].sides === 2 ? 'Back' : 'Front', `${k}: on its back when it has one`); assert.deepEqual(placementChecks({ id: 'b', name: 'Art', ...bk }, p, {}).filter(x => x.level === 'fail'), []); }
    else assert.equal(bk.view, viewsOf(k).length === 2 ? 'back' : 'front');
  }
  // the back of a one-sided product says it is not printed; the edge of a print area is an edge, not a seam
  assert.match(placementChecks({ id: 'a', name: 'Art', view: 'back', x: 0, y: 12, w: 4, h: 4 }, defaultParams('poster'), {})[0].text, /is on the back, which is not printed on this product/);
  const near = placementChecks({ id: 'a', name: 'Art', view: 'front', x: 0, y: 1.9, w: 2.9, h: 3.4 }, defaultParams('mug'), {}); assert.equal(near[0].code, 'NEAR_SEAM'); assert.match(near[0].text, /of the edge of the print area/);
  assert.deepEqual(placementChecks({ id: 'a', name: 'Art', view: 'front', x: 0, y: 1.875, w: 2.5, h: 3 }, defaultParams('mug'), {}), [], 'a graphic that fills most of the mug\'s side is fine');
  assert.match(placementChecks({ id: 'a', name: 'Art', view: 'front', x: 9.5, y: 8, w: 2, h: 2 }, defaultParams('tee'), {}).map(f => f.text).join(' '), /of a seam|over the edge/, 'a garment is checked as it was');
  // a typed-in size is kept (a king duvet is past a garment's 80 in), and a garment's limits are as they were
  assert.equal(cleanFlat({ style: 'bedding', m: { width: 104, height: 94 } }).params.m.width, 104); assert.equal(cleanFlat({ style: 'tee', m: { chest: 104 } }).params.m.chest, 80);
});

test('a product type has no pattern, and says so plainly; a concept started from the catalogue names its style', () => {
  for (const k of TYPES) { const c = { name: 'Nike Thing Hoodie Jacket', category: STYLES[k].category, spec: { catalog: { id: 'x' }, style: k, template: 'none' } };
    assert.equal(detectStyle(c).style, k, `${k}: its style is the one it names, whatever its name reads like`); assert.equal(detectStyle(c).template, 'none');
    assert.equal(kindOf(c, k), 'none'); assert.match(notSewn(k), /not cut and sewn, so it has no pattern and no size run/);
    assert.doesNotThrow(() => rankFabrics(k, []), `${k}: the cloth picker does not break`); }
  assert.equal(notSewn('tee'), ''); assert.equal(kindOf({ name: 'Tee', category: 'tops', spec: {} }, 'tee'), 'garment');
  // a named style without the catalogue's mark is still read from the words, as before
  assert.equal(detectStyle({ name: 'Heavy tee', category: 'tops', spec: { style: 'mug', template: 'none' } }).style, 'tee');
});

test('what the Studio offers beside a product type: cloth, labels and sewing details only for what is sewn; no wash, fit or garment sketch for any', () => {
  for (const [k, g] of Object.entries(GOODS)) { const t = goodsTakes(g), sewn = ['cloth', 'any'].includes(g.surface);
    assert.deepEqual(t, { cloth: sewn, labels: sewn, sewing: sewn, wash: false, fit: false, sketch: false }, k); }
  for (const k of ['mug', 'poster', 'phonecase', 'tumbler', 'mousepad', 'skateboard']) assert.equal(goodsTakes(GOODS[k]).cloth, false, `${k} has no cloth to choose`);
  for (const k of ['pillow', 'towel', 'apron', 'socks', 'blanket']) assert.equal(goodsTakes(GOODS[k]).labels, true, `${k} takes a sewn-in label`);
});
