import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { STYLES, SIZES, detectStyle, defaultParams, measurementsFor, pomTable, geometry, renderSvg, describe, placementChecks, defaultPlacement, cleanFlat, fmt, fmtCm } from '../src/lab-flats.js';
import { artInfo } from '../src/lab-flats-routes.js';
import { cleanRules, BASE_RULES } from '../src/lab-library.js';

test('the style, fit and details are read from the concept', () => {
  const d = (category, name, spec = {}) => detectStyle({ category, name, spec });
  assert.equal(d('tops', 'Heavyweight boxy tee').style, 'tee'); assert.equal(d('tops', 'Heavyweight boxy tee').fit, 'boxy');
  assert.equal(d('tops', 'Loopback hoodie').style, 'hoodie'); assert.equal(d('tops', 'Full zip hoodie').style, 'ziphoodie');
  assert.equal(d('tops', 'Arch crewneck sweatshirt').style, 'crewneck'); assert.equal(d('tops', 'Waffle long sleeve').style, 'longsleeve');
  assert.equal(d('outerwear', 'Coach jacket').style, 'jacket'); assert.equal(d('bottoms', 'Double pleat relaxed pant').fit, 'relaxed');
  assert.equal(d('bottoms', 'Double pleat relaxed pant').options.pleats, 2); assert.equal(d('bottoms', 'Nylon shorts').style, 'shorts');
  assert.equal(d('headwear', 'Washed six-panel cap').style, 'cap'); assert.equal(d('headwear', 'Rib beanie').style, 'beanie'); assert.equal(d('bags', 'Canvas tote').style, 'tote');
  assert.equal(d('footwear', 'Runner'), null, 'not drawn yet');
});

test('measurements come from the style and fit, and grade by size', () => {
  const reg = defaultParams('tee', 'regular'), boxy = defaultParams('tee', 'boxy');
  assert.equal(reg.m.chest, 21); assert.equal(boxy.m.chest, 23.5); assert.ok(boxy.m.length < reg.m.length && boxy.options.drop);
  assert.equal(measurementsFor(reg, 'XL').chest, 23); assert.equal(measurementsFor(reg, 'XS').length, 26); assert.equal(measurementsFor(defaultParams('cap'), 'XL').crownWidth, 8.5, 'one size does not grade');
  const pom = pomTable(reg); assert.equal(pom[0].code, 'A'); assert.deepEqual(pom[0].values.map(v => v.size), SIZES); assert.ok(!pom.some(r => r.key === 'hemRib'), 'a measurement the piece does not have is left out');
  assert.deepEqual(pomTable(defaultParams('tote'))[0].values.map(v => v.size), ['One size']);
  assert.equal(defaultParams('tee', 'regular', { cropped: true }).m.length, 24);
});

test('every style draws front and back, closed and measurable', () => {
  for (const st of Object.keys(STYLES)) for (const view of ['front', 'back']) {
    const p = defaultParams(st), g = geometry(p, view), svg = renderSvg(p, view, { showPom: true });
    assert.ok(g.outline.length >= 4 && g.outline.every(q => q.every(Number.isFinite)), `${st} ${view} outline`);
    assert.ok(Object.values(g.regions).some(r => r.length >= 3), `${st} ${view} has somewhere to place things`);
    assert.match(svg, /^<svg [^>]*viewBox="[-\d. ]+"/); assert.ok(!/NaN|undefined/.test(svg), `${st} ${view} draws without gaps`);
  }
});

test('a placement is described the way a sample room measures it', () => {
  const p = defaultParams('tee'); p.m.neckDropFront = 3.5;
  const q = { id: 'a', name: 'Logo', view: 'front', x: 4, y: 7, w: 3, h: 1.5 };
  assert.equal(describe(q, p), "6¼ in (15.9 cm) below the HPS, centre 4 in (10.2 cm) from the CF toward the wearer's left");
  assert.match(describe({ ...q, x: 0 }, p), /centred on the CF/);
  assert.match(describe({ ...q, view: 'back', x: 0, y: 6 }, p), /below the HPS on the back, centred on the CB/);
  const lp = defaultPlacement('logo', p, { aspect: 2, label: 'left sleeve' }); assert.match(describe({ ...lp, name: 'x' }, p), /wearer's left sleeve/);
  assert.match(describe({ id: 'c', name: 'x', ...defaultPlacement('graphic', defaultParams('cap'), { aspect: 2 }) }, defaultParams('cap')), /above the brim seam/);
  assert.equal(fmt(3.125), '3⅛ in'); assert.equal(fmt(.5), '½ in'); assert.equal(fmtCm(1), '1 in (2.5 cm)');
});

test('the drawing checks: on the piece, clear of seams, collars, zips and pockets, within the technique', () => {
  const tee = defaultParams('tee'), at = (p, q, rules) => placementChecks({ id: 'a', name: 'Art', view: 'front', ...q }, p, rules).map(f => f.code);
  assert.deepEqual(at(tee, { x: 0, y: 10.5, w: 10, h: 8 }, { maxW: 14, maxH: 16 }), [], 'a centred chest print, 3 in below the neckline, is fine');
  assert.ok(at(tee, { x: 0, y: 5.2, w: 6, h: 3 }).includes('KEEPOUT_NECK'), 'too close to the collar');
  assert.ok(at(tee, { x: 0, y: 12, w: 26, h: 8 }).includes('OVER_EDGE'), 'wider than the body');
  assert.ok(at(tee, { x: 30, y: 12, w: 2, h: 2 }).includes('OFF_PIECE'));
  assert.ok(at(tee, { x: 0, y: 10, w: 13, h: 10 }, { maxW: 12, maxH: 12 }).includes('TOO_WIDE'), 'bigger than an embroidery hoop');
  assert.ok(at(defaultParams('ziphoodie'), { x: 0, y: 10, w: 8, h: 5 }).includes('KEEPOUT_ZIP'), 'nothing across a zip');
  assert.ok(at(defaultParams('hoodie'), { x: 0, y: 17, w: 9, h: 6 }).includes('KEEPOUT_POCKET'), 'over the kangaroo pocket');
  assert.ok(at(defaultParams('crewneck'), { x: 0, y: 24.5, w: 8, h: 3 }).some(c => /KEEPOUT_HEM|OVER_EDGE/.test(c)), 'not on the hem rib');
  assert.ok(at(defaultParams('pants'), { x: -1, y: 5, w: 2, h: 2 }).includes('KEEPOUT_FLY'), 'not on the fly');
  for (const [st, kind] of [['cap', 'logo'], ['tee', 'logo'], ['tee', 'graphic'], ['hoodie', 'graphic'], ['pants', 'graphic'], ['beanie', 'logo'], ['tote', 'graphic']]) {
    const p = defaultParams(st), q = { id: 'd', name: 'D', ...defaultPlacement(kind, p, { aspect: 1.6 }) };
    assert.ok(!placementChecks(q, p, { maxW: 14, maxH: 16 }).some(f => f.level === 'fail'), `${st}: where a ${kind} starts can be made`);
  }
});

test('what the page sends is kept within bounds', () => {
  assert.match(cleanFlat({ style: 'kimono' }).error, /what the piece is/);
  const { params, placements } = cleanFlat({ style: 'tee', fit: 'weird', m: { chest: 900, length: 'x' }, options: { pleats: 9 }, placements: [{ id: 'a<b', name: '  Logo  ', view: 'side', x: 999, y: 4, w: .1, h: 2, art: 'nope', mark: 'cue', technique: 'embroidery' }] });
  assert.equal(params.fit, 'regular'); assert.equal(params.m.chest, 80); assert.equal(params.m.length, 28); assert.equal(params.options.pleats, 2);
  assert.deepEqual(placements[0], { id: 'p0', name: 'Logo', view: 'front', x: 60, y: 4, w: .25, h: 2, mark: 'mark', technique: 'embroidery', source: 'extra' });
});

test('the artwork is measured at the size it is placed: fine lines, inks, shading', async () => {
  const svg = (body, w = 400, h = 200) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).png().toBuffer();
  const bold = await svg('<rect x="20" y="20" width="360" height="160" fill="#141416"/>');
  const thin = await svg('<rect x="20" y="20" width="360" height="160" fill="none" stroke="#141416" stroke-width="2"/><line x1="20" y1="100" x2="380" y2="100" stroke="#141416" stroke-width="2"/>');
  const rules = cleanRules({}, 'embroidery');
  const a = await artInfo(bold, 4, 2, rules), b = await artInfo(thin, 4, 2, rules);
  assert.ok(a.fine < .03, 'a solid shape holds any technique'); assert.ok(b.fine > .5 && b.holds < 1.5, `hairlines at 4 in wide are finer than 1.5 mm (holds ${b.holds})`);
  const many = await svg(['#e11', '#1e1', '#11e', '#ee1', '#1ee', '#e1e', '#888', '#141416', '#f80'].map((c, i) => `<rect x="${i * 44}" y="0" width="44" height="200" fill="${c}"/>`).join(''));
  assert.equal((await artInfo(many, 4, 2, rules)).inks, 9);
  const grad = await svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/>');
  assert.equal((await artInfo(grad, 4, 2, rules)).gradient, true); assert.equal(a.gradient, false);
  assert.equal(BASE_RULES.embroidery.density, 1800);
});

test('two placements on top of each other are pointed out', async () => {
  const { overlapChecks } = await import('../src/lab-flats.js');
  const a = { id: 'a', name: 'Logo', view: 'front', x: 4, y: 7, w: 3, h: 1 }, b = { id: 'b', name: 'Art', view: 'front', x: 0, y: 9, w: 10, h: 8 }, c = { ...a, id: 'c', view: 'back' };
  const o = overlapChecks([a, b, c]); assert.equal(o.a[0].code, 'OVERLAP'); assert.match(o.b[0].text, /Art overlaps Logo/); assert.deepEqual(o.c, [], 'the back is another side');
});

test('pieces are drawn from the flat sketches, lined up with their measurements', async () => {
  const { FLAT_TEMPLATES } = await import('../src/lab-flat-templates.js');
  const { drawingOf, templateOf, defaultTemplate, templatesFor } = await import('../src/lab-flats.js');
  const { existsSync } = await import('node:fs');
  assert.ok(FLAT_TEMPLATES.length >= 25);
  for (const t of FLAT_TEMPLATES) {
    assert.ok(existsSync(new URL(`../src/flat-templates/${t.file}`, import.meta.url)), `${t.id} has its file`);
    const p = { ...defaultParams(t.style), template: t.id };
    for (const view of ['front', 'back']) {
      const d = drawingOf(p, view); assert.ok(d, `${t.id} ${view} is drawn from the sketch`);
      assert.ok(Object.values(d.box).every(Number.isFinite) && d.box.x0 < 0 && d.box.x1 > 0, `${t.id} ${view}: the centre line is inside the view`);
      const w = d.box.x1 - d.box.x0, kind = STYLES[t.style].kind, m = p.m;
      // the view is about as wide as the piece: wider than the body, not absurdly so
      if (kind === 'top') assert.ok(w > m.chest && w < m.chest * 3.2, `${t.id} ${view} is ${w.toFixed(1)} in across for a ${m.chest} in chest`);
      if (kind === 'bottom') assert.ok(w > m.waist * .9 && w < m.waist * 3.2, `${t.id} ${view} is ${w.toFixed(1)} in across for a ${m.waist} in waist`);
      assert.ok(d.sy / d.sx >= .879 && d.sy / d.sx <= 1.121, 'never visibly stretched');
    }
    assert.match(renderSvg(p, 'front'), new RegExp(`<image href="/lab/flat-templates/${t.file}"`));
  }
  assert.equal(defaultTemplate('tee', 'boxy'), 'tee-boxy'); assert.equal(defaultTemplate('tee', 'regular'), 'tee-classic'); assert.equal(defaultTemplate('pants', 'regular', 'nylon cargo pant'), 'pt-cargo');
  assert.equal(defaultTemplate('beanie'), null); assert.deepEqual(templatesFor('tote'), []);
  const d = (category, name) => detectStyle({ category, name });
  assert.equal(d('tops', 'Heavyweight boxy tee').template, 'tee-boxy'); assert.equal(d('outerwear', 'Nylon bomber').template, 'jk-bomber'); assert.equal(d('bottoms', 'Washed denim jeans').template, 'pt-jean');
  // what the page sends: a sketch of another style falls back to the style's own; "none" keeps the simple outline
  assert.equal(cleanFlat({ style: 'tee', template: 'pt-cargo' }).params.template, 'tee-classic');
  const none = cleanFlat({ style: 'hoodie', template: 'none' }).params; assert.equal(none.template, 'none'); assert.equal(templateOf(none), null); assert.ok(!/<image /.test(renderSvg(none, 'front')));
  assert.equal(cleanFlat({ style: 'beanie' }).params.template, undefined);
  // the service puts the sketch inside the file
  assert.match(renderSvg(defaultParams('cap'), 'front', { templateHref: f => `data:x;${f}` }), /href="data:x;cap-6panel\.svg"/);
});
