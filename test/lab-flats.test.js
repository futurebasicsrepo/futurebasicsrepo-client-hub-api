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
  const { drawingOf, templateOf, defaultTemplate, templatesFor, fitToTemplate } = await import('../src/lab-flats.js');
  const { existsSync } = await import('node:fs');
  // every drawing in the pack, men's and women's
  assert.ok(FLAT_TEMPLATES.length >= 350, `${FLAT_TEMPLATES.length} sketches`);
  assert.ok(FLAT_TEMPLATES.some(t => t.range === 'womens') && FLAT_TEMPLATES.some(t => t.range === 'mens'));
  assert.equal(new Set(FLAT_TEMPLATES.map(t => t.id)).size, FLAT_TEMPLATES.length, 'every sketch has its own id');
  for (const t of FLAT_TEMPLATES) {
    assert.ok(STYLES[t.style], `${t.id} is a style the Lab knows`);
    assert.ok(existsSync(new URL(`../src/flat-templates/${t.file}`, import.meta.url)), `${t.id} has its file`);
    assert.ok(existsSync(new URL(`../src/flat-templates/thumbs/${t.id}.webp`, import.meta.url)), `${t.id} has its thumbnail`);
    const p = fitToTemplate({ ...defaultParams(t.style), template: t.id });
    for (const view of ['front', 'back']) {
      if (!t.views[view]) continue;
      const d = drawingOf(p, view); assert.ok(d, `${t.id} ${view} is drawn from the sketch`);
      assert.ok(Object.values(d.box).every(Number.isFinite) && d.box.x0 < 0 && d.box.x1 > 0, `${t.id} ${view}: the centre line is inside the view`);
      const w = d.box.x1 - d.box.x0, kind = STYLES[t.style].kind, m = p.m;
      // the view is about as wide as the piece: wider than the body, not absurdly so
      if (kind === 'top') assert.ok(w >= m.chest - .01 && w < m.chest * 3.2, `${t.id} ${view} is ${w.toFixed(1)} in across for a ${m.chest} in chest`);
      if (kind === 'bottom') assert.ok(w > m.waist * .9 && w < m.waist * 3.2, `${t.id} ${view} is ${w.toFixed(1)} in across for a ${m.waist} in waist`);
      assert.ok(d.sy / d.sx >= .879 && d.sy / d.sx <= 1.121, 'never visibly stretched');
    }
    assert.match(renderSvg(p, 'front'), new RegExp(`<image href="/lab/flat-templates/${t.file}"`));
  }
  assert.equal(defaultTemplate('tee', 'boxy'), 'tee-boxy'); assert.equal(defaultTemplate('tee', 'regular'), 'tee-classic'); assert.equal(defaultTemplate('pants', 'regular', 'nylon cargo pant'), 'pt-cargo');
  assert.equal(defaultTemplate('beanie'), null); assert.deepEqual(templatesFor('tote'), []);
  const d = (category, name) => detectStyle({ category, name });
  assert.equal(d('tops', 'Heavyweight boxy tee').template, 'tee-heavyweight-boxy-tee'); assert.equal(d('outerwear', 'Nylon bomber').template, 'jk-bomber'); assert.equal(d('bottoms', 'Washed denim jeans').template, 'pt-jean');
  // what the page sends: a sketch of another style falls back to the style's own; "none" keeps the simple outline
  assert.equal(cleanFlat({ style: 'tee', template: 'pt-cargo' }).params.template, 'tee-classic');
  const none = cleanFlat({ style: 'hoodie', template: 'none' }).params; assert.equal(none.template, 'none'); assert.equal(templateOf(none), null); assert.ok(!/<image /.test(renderSvg(none, 'front')));
  assert.equal(cleanFlat({ style: 'beanie' }).params.template, undefined);
  // the service puts the sketch inside the file
  assert.match(renderSvg(defaultParams('cap'), 'front', { templateHref: f => `data:x;${f}` }), /href="data:x;cap-6panel\.svg"/);
});

test('the drawing can be changed: colour, colour blocks, details, stitching, redrawn areas', async () => {
  const { DETAILS, STITCHES, defaultDetail, detailSvg, stitchSvg, cleanEdits, describeEdit, lineFor } = await import('../src/lab-flats.js');
  const hood = { ...defaultParams('hoodie'), template: 'hood-classic' };
  for (const k of Object.keys(DETAILS)) {
    const e = { id: 'd', type: 'detail', view: 'front', stitch: 'double', thread: '#e0218a', color: '', count: 2, flip: false, ...defaultDetail(k, hood, 'front') }, o = detailSvg(e);
    assert.ok(o.body.length > 20 && !/NaN|undefined/.test(o.body + o.stitch), `${k} draws`);
    assert.ok(e.y - e.h / 2 > -1, `${k} starts on the piece, not above it`);
    assert.match(describeEdit(e, hood), /^Front: /);
  }
  for (const k of Object.keys(STITCHES)) assert.ok(!/NaN/.test(stitchSvg([[0, 0], [4, 0], [4, 3]], k, '#e0218a')) && stitchSvg([[0, 0], [4, 0]], k).includes('<path'), `${k} draws`);
  assert.equal(lineFor('#111111') === '#141416', false, 'a dark piece gets light lines'); assert.equal(lineFor('#f4f1ea'), '#141416');
  // what the page sends is kept within bounds; a block needs a colour, a stitch line two points, a redrawn area its picture
  const ed = cleanEdits([{ type: 'detail', kind: 'pocket-patch', x: 999, y: 4, w: 5, h: 6, thread: 'red', stitch: 'nope' }, { type: 'stitch', pts: [[0, 0]] }, { type: 'block', pts: [[0, 0], [1, 0], [1, 1]] },
    { type: 'block', view: 'back', pts: [[0, 0], [1, 0], [1, 1]], color: '#A02A20' }, { type: 'ai', art: 'x' }, { type: 'detail', kind: 'cape' }]);
  assert.equal(ed.length, 2); assert.deepEqual([ed[0].x, ed[0].thread, ed[0].stitch], [60, '', 'single']); assert.equal(ed[1].color, '#a02a20'); assert.equal(ed[1].view, 'back');
  const { params } = cleanFlat({ style: 'pants', template: 'pt-pleat', color: '#1F2A44', edits: [{ type: 'detail', kind: 'pleat', view: 'front', x: 3, y: 6, w: .1, h: 9, count: 2 }, { type: 'stitch', view: 'front', pts: [[-8, 1], [8, 1]], stitch: 'double', thread: '#e0218a' }] });
  assert.equal(params.color, '#1f2a44'); assert.equal(params.edits.length, 2);
  const svg = renderSvg(params, 'front', { editable: true, selectedEdit: params.edits[0].id });
  assert.match(svg, /<filter id="fb-front-pt-pleat-t"/, 'the piece is recoloured'); assert.match(svg, /data-ed="e0"/); assert.match(svg, /stroke="#e0218a"/, 'the contrast thread');
  assert.ok(!/<filter/.test(renderSvg({ ...params, color: '' }, 'back')), 'no colour, no filter; edits on the front stay off the back');
  assert.match(describeEdit(params.edits[0], params), /Front: Double pleat/); assert.match(describeEdit(params.edits[1], params), /Double needle in #e0218a thread/);
});

test('the whole pack: women\'s styles, shirts, polos, tanks, vests, coats; each sketch starts at its own proportions', async () => {
  const { fitToTemplate, pomTable, geometry, pomName } = await import('../src/lab-flats.js');
  const d = (category, name) => detectStyle({ category, name }).style;
  assert.equal(d('dresses', 'Slip midi dress'), 'dress'); assert.equal(d('bottoms', 'Pleated tennis skirt'), 'skirt'); assert.equal(d('bottoms', 'Ribbed leggings'), 'leggings');
  assert.equal(d('tops', 'Halter bikini'), 'bikini'); assert.equal(d('tops', 'Scoop one-piece swimsuit'), 'swimsuit'); assert.equal(d('tops', 'Square-neck bodysuit'), 'bodysuit');
  assert.equal(d('tops', 'Racerback sports bra'), 'bra'); assert.equal(d('tops', 'Lace cami'), 'cami'); assert.equal(d('tops', 'Ribbed tank'), 'tank');
  assert.equal(d('tops', 'Camp collar shirt'), 'shirtss'); assert.equal(d('tops', 'Oxford button-down'), 'shirt'); assert.equal(d('tops', 'Boxy t-shirt'), 'tee'); assert.equal(d('tops', 'Pique polo'), 'polo');
  assert.equal(d('outerwear', 'Wool overcoat'), 'coat'); assert.equal(d('outerwear', 'Puffer vest'), 'vest'); assert.equal(d('headwear', 'Washed bucket hat'), 'bucket'); assert.equal(d('tops', 'Harvest crew sweatshirt'), 'crewneck');
  // a concept's own words pick the sketch: a pleated skirt gets the pleated one
  assert.equal(detectStyle({ category: 'bottoms', name: 'Pleated tennis skirt' }).template, 'sk-pleated-tennis-skirt');
  // a skirt is measured as a skirt
  const sk = defaultParams('skirt'); assert.ok(geometry(sk, 'front').regions.skirt); assert.equal(pomName('skirt', 'length'), 'Length from the top of the waistband');
  assert.ok(pomTable(sk).some(r => r.name === 'Sweep (hem width), flat')); assert.ok(!pomTable(defaultParams('tank')).some(r => r.key === 'sleeve'), 'a tank has no sleeve length');
  // a cropped sketch starts shorter than the classic one; a maxi dress longer than a mini
  const len = (style, template) => fitToTemplate({ ...defaultParams(style), template }).m.length;
  assert.ok(len('tee', 'tee-cropped-tee') < len('tee', 'tee-classic'), 'cropped tee is shorter');
  assert.ok(len('dress', 'dr-slip-maxi-dress') > len('dress', 'dr-strapless-mini-dress') + 8, 'maxi is much longer than mini');
  const inseam = template => fitToTemplate({ ...defaultParams('shorts'), template }).m.inseam;
  assert.ok(inseam('sh-long-jorts') > inseam('sh-running-shorts'), 'long jorts have a longer inseam than running shorts');
});

test('add-on parts from the pack: pockets, zips, collars, trims and buttons placed on a flat', async () => {
  const { FLAT_PARTS, PART_KINDS, partOf, defaultPart, cleanEdits, describeEdit } = await import('../src/lab-flats.js');
  const { existsSync } = await import('node:fs');
  assert.ok(FLAT_PARTS.length >= 100, `${FLAT_PARTS.length} parts`);
  for (const k of Object.keys(PART_KINDS)) assert.ok(FLAT_PARTS.some(q => q.kind === k), `there are ${k}`);
  for (const q of FLAT_PARTS) assert.ok(existsSync(new URL(`../src/flat-parts/${q.file}`, import.meta.url)) && q.aspect > 0, `${q.id} has its picture`);
  const tee = { ...defaultParams('tee'), template: 'tee-classic' }, pocket = FLAT_PARTS.find(q => q.kind === 'pockets');
  const e = { id: 'p1', ...defaultPart(pocket.id, tee, 'front') };
  assert.ok(e.w > 2 && e.w < 9 && e.y > 4, 'a pocket lands on the chest at a pocket size');
  const [clean] = cleanEdits([e, { type: 'part', part: 'nope', x: 0, y: 0, w: 1, h: 1 }]); assert.equal(cleanEdits([e, { type: 'part', part: 'nope' }]).length, 1, 'an unknown part is dropped');
  assert.equal(clean.part, pocket.id);
  const svg = renderSvg({ ...tee, edits: [clean] }, 'front', { partHref: f => `data:part;${f}` });
  assert.match(svg, new RegExp(`href="data:part;${pocket.file}"`), 'the part is drawn on the flat, inside the recoloured drawing');
  assert.match(describeEdit(clean, tee), /add-on sheet/); assert.equal(partOf(pocket.id).kind, 'pockets');
});

test('the sketch follows the concept: its family from the name, silhouette and fabric, its features scored, and nothing it never asked for', async () => {
  const { detectStyle, defaultTemplate, rankTemplates, conceptTokens, candidateTemplates } = await import('../src/lab-flats.js');
  const boot = { category: 'bottoms', name: 'Earth Utility Boot', spec: { silhouette: 'Mid-rise boot cut with a clean seat', fabric: '11oz cotton twill with a garment-dye', description: 'A boot cut in a tobacco-brown garment-dye with a light ripstop lining in the pockets and a water-resistant finish. It has a worn-in look, so it works for rain and work', details: ['Surface abrasion on the seat and front thighs', 'Rust hem-stitch and bar tacks'] } };
  const d = detectStyle(boot); assert.equal(d.style, 'pants'); assert.equal(d.template, 'pt-chino', 'a plain boot-cut twill pant is not drawn from a cargo or a double-knee');
  const words = [boot.name, boot.spec.silhouette, boot.spec.fabric, boot.spec.description, ...boot.spec.details].join(' '), strong = [boot.name, boot.spec.silhouette, boot.spec.fabric].join(' ');
  const tok = conceptTokens(words, strong); assert.ok(tok.has('flared') && tok.has('chinos') && !tok.has('track'), 'boot cut reads as flared, twill as chinos, and the ripstop pocket lining does not make it a track pant');
  const ranked = rankTemplates('pants', 'regular', words, strong); assert.ok(ranked.slice(0, 10).some(t => t.id === 'pt-flared-jeans'), 'the flared sketch is among the candidates the picture is judged against');
  const cands = candidateTemplates(ranked); assert.ok(cands.length >= 4 && cands.some(t => t.id === 'pt-flared-jeans') && !cands.some(t => /double-knee|cargo/.test(t.id)), 'the sketches put to the picture: the flare is there, no cargo or double-knee', cands.map(t => t.id + ':' + t.score));
  for (const [w, id] of [['straight chino', 'pt-chino'], ['relaxed carpenter jean', 'pt-carpenter-jeans'], ['wide leg jean', 'pt-wide-leg-jeans'], ['balloon jean', 'pt-balloon-jeans'], ['painter pant in canvas', 'pt-painter-pants'], ['track pant with side stripe', 'pt-side-stripe-track-pants'], ['heavyweight fleece sweatpant', 'pt-jogger']]) assert.equal(defaultTemplate('pants', 'regular', w), id, w);
  assert.equal(defaultTemplate('pants', 'regular', ''), 'pt-chino', 'nothing said: the style\'s default');
});

test('a piece that reads as footwear is not drawn as a pant, whatever line it sits in; boot-cut and cargo pants still are', async () => {
  const { detectStyle, looksLikeFootwear } = await import('../src/lab-flats.js');
  assert.equal(looksLikeFootwear({ name: 'Earth Utility Boot', category: 'bottoms', spec: { silhouette: 'lace-up boot with a lug sole' } }), true);
  assert.equal(detectStyle({ name: 'Earth Utility Boot', category: 'bottoms', spec: { silhouette: 'lace-up boot with a lug sole' } }), null);
  assert.equal(detectStyle({ name: 'Court Sneaker', category: 'footwear', spec: {} }), null);
  assert.equal(detectStyle({ name: 'Boot-cut Utility Pant', category: 'bottoms', spec: { silhouette: 'boot cut' } })?.style, 'pants');
  assert.equal(detectStyle({ name: 'Utility Cargo', category: 'bottoms', spec: { description: 'cargo pants to wear with boots' } })?.style, 'pants');
});

test('a jacket is drawn as a jacket whichever line it sits in: a trucker in a Tops line is not a sweatshirt', async () => {
  const { detectStyle } = await import('../src/lab-flats.js');
  const t = detectStyle({ name: 'Field Log Trucker', category: 'tops', spec: { silhouette: 'boxy denim trucker' } });
  assert.equal(t?.style, 'jacket'); assert.equal(t?.template, 'jk-trucker', 'drawn from the trucker sketch');
  assert.equal(detectStyle({ name: 'Night Bomber', category: 'tops', spec: {} })?.style, 'jacket');
  assert.equal(detectStyle({ name: 'Crew Sweat', category: 'tops', spec: { silhouette: 'crewneck sweatshirt' } })?.style, 'crewneck', 'a sweatshirt is still a sweatshirt');
  assert.equal(detectStyle({ name: 'Heavy Tee', category: 'tops', spec: {} })?.style, 'tee');
});

test('a tall graphic down the back of a tee ends above the hem, keeping its shape, whether placed by its words or sized from the picture', async () => {
  const F = await import('../src/lab-flats.js'), p = { ...F.defaultParams('tee'), size: 'M' }, m = F.measurementsFor(p, 'M');
  const q = { ...F.defaultPlacement('graphic', p, { aspect: 0.45, label: 'full back' }), name: 'route' };
  assert.ok(q.y + q.h / 2 <= m.length - 2 + 1e-6 && q.h <= 16, `ends ${q.y + q.h / 2} in down a ${m.length} in back`);
  assert.ok(Math.abs(q.w / q.h - 0.45) < 0.02 && !F.placementChecks(q, p).some(c => c.level === 'fail'));
  const big = F.fitTall({ view: 'back', x: 0, y: 5 + 12, w: 11, h: 24 }, p);
  assert.ok(big.y - big.h / 2 === 5 && big.y + big.h / 2 <= m.length - 2 && Math.abs(big.w / big.h - 11 / 24) < 0.02, JSON.stringify(big));
});

test('a graphic on a flat can be turned to match the picture: kept to the half degree, drawn turned, checked by its turned outline and named in the words', async () => {
  const F = await import('../src/lab-flats.js'), p = { ...F.defaultParams('tee'), size: 'M' };
  const c = F.cleanFlat({ style: 'tee', placements: [{ id: 'a', view: 'front', x: 0, y: 9, w: 8, h: 5, rot: 372.3 }, { id: 'b', view: 'front', x: 0, y: 14, w: 3, h: 2, rot: 0 }] });
  assert.equal(c.placements[0].rot, 12.5); assert.ok(!('rot' in c.placements[1]), 'a straight graphic carries no turn');
  const q = { ...c.placements[0], name: 'Route' };
  assert.match(F.renderSvg(p, 'front', { placements: [q], selected: 'a' }), /rotate\(12\.5 0 9\)[\s\S]*data-rot="a"/);
  assert.match(F.describe(q, p), /turned 12\.5° clockwise$/);
  const straight = F.placementChecks({ ...q, rot: 0 }, p).some(f => f.code === 'KEEPOUT_NECK' || f.level === 'fail'), turned = F.placementChecks({ ...q, rot: 90 }, p).some(f => f.level === 'fail');
  assert.ok(!straight && turned, 'turned on end, the same graphic reaches the neck and the check says so');
});
