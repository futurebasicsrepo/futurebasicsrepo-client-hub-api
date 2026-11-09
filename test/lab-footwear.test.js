import test from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS } from '../src/lab-footwear.js';
import { footLength, lastOf, sizeRun, footwearPattern, cleanFootwear, tooling, hideArea, lastSvg, FW_STYLES, PADDING, lastingOf, components } from '../src/lab-footwear.js';
import { layoutOf, explodeAt, assembled, boundsOf, areaOf, patternDxf } from '../src/lab-pattern.js';
import { guessShoe } from '../src/lab-pattern-routes.js';

const ok = pts => pts.length >= 3 && pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

// closed shoes (pulled over a last, with a back); sandals, clogs, moulded slides and mules are tested on their own below
const CLOSED = Object.keys(FW_STYLES).filter(k => !FW_STYLES[k].open && !FW_STYLES[k].backless);

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

test('every closed style drafts its upper: vamp, quarters inside and out, linings, stiffeners, an insole board or a strobel sock, and a sockliner; laced styles get eyestays and a tongue', () => {
  for (const style of CLOSED) {
    const pat = footwearPattern({ style }), ids = pat.pieces.map(q => q.id);
    for (const id of ['vamp', 'quarter-lat', 'quarter-med', 'quarter-lining', 'vamp-lining', 'heel-grip', 'collar-backer', 'counter', 'toe-puff', lastingOf({ style }) === 'strobel' ? 'strobel' : 'insole', 'sockliner', 'sole']) assert.ok(ids.includes(id), `${style} has ${id}`);
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
  assert.match(patternDxf(pat), /\n1\nVamp\n[^]*?\n1\nCut 2/); // the name, then how many
});

test('cleaning the choices, the last drawing, and reading a style from the words', () => {
  const c = cleanFootwear({ style: 'stiletto', system: 'us-m', size: 99, width: 'Z', heel: 9, runFrom: 12, runTo: 4 });
  assert.equal(c.style, 'sneaker'); assert.equal(c.size, 18); assert.equal(c.width, 'D'); assert.equal(c.heel, 4); assert.ok(c.runTo >= c.runFrom);
  assert.equal(cleanFootwear({ system: 'us-w' }).width, 'B'); assert.equal(cleanFootwear({ system: 'eu' }).size, 42);
  const svg = lastSvg({ style: 'boot' }); assert.match(svg, /last length/); assert.match(svg, /ball girth/); assert.ok(!/NaN/.test(svg));
  assert.equal(guessShoe({ name: 'Suede Chelsea boot' }), 'chelsea'); assert.equal(guessShoe({ name: 'Penny loafer' }), 'loafer'); assert.equal(guessShoe({ name: 'Court shoe' }), 'sneaker'); assert.equal(guessShoe({ name: 'Trail runner' }), 'runner');
});

test('inside the shoe: the tongue has a lining and its foam; the padding follows the style; runners and hikers are strobel-lasted', () => {
  for (const style of CLOSED) {
    const ids = footwearPattern({ style }).pieces.map(q => q.id), P = PADDING[style];
    if (FW_STYLES[style].laced) { assert.ok(ids.includes('tongue-lining') && ids.includes('eyestay-backer'), `${style}: tongue lining and eyestay backer`); assert.equal(ids.includes('tongue-foam'), P.tongue > 0, `${style}: tongue foam`); }
    assert.equal(ids.includes('collar-foam'), P.collar > 0, `${style}: collar foam only where it is padded`);
    assert.equal(ids.includes('strobel'), !ids.includes('insole'), `${style}: one or the other under the foot`);
  }
  assert.equal(lastingOf({ style: 'runner' }), 'strobel'); assert.equal(lastingOf({ style: 'hiker' }), 'strobel'); assert.equal(lastingOf({ style: 'derby' }), 'board');
  assert.ok(PADDING.derby.collar === 0 && PADDING.hiker.collar > PADDING.sneaker.collar, 'a dress shoe is unpadded, a hiking boot padded more than a court shoe');
  // a strobel upper is stitched at its edge (3/16 in), a board-lasted one folds ⅝ in under: the runner's vamp reaches less far under the foot
  const deep = st => { const q = footwearPattern({ style: st }).pieces.find(x => x.id === 'vamp'); return Math.max(...q.sew.map(p => p[1])) - Math.max(...q.shown.map(p => p[1])); };
  assert.ok(deep('runner') < deep('sneaker') - .3, `strobel ${deep('runner')} vs lasted ${deep('sneaker')}`);
});

test('warm and waterproof: an insulated lining adds an insulation layer, a membrane a sewn bootie; a hiking boot is waterproof by default; both reach the bill of materials', () => {
  const ids = o => footwearPattern(o).pieces.map(q => q.id);
  assert.ok(ids({ style: 'boot', lining: 'insulated' }).includes('quarter-insulation') && ids({ style: 'boot', lining: 'insulated' }).includes('vamp-insulation'));
  assert.ok(!ids({ style: 'boot' }).includes('quarter-insulation'));
  assert.ok(ids({ style: 'hiker' }).includes('membrane-vamp') && cleanFootwear({ style: 'hiker' }).membrane === true);
  assert.ok(!ids({ style: 'hiker', membrane: false }).includes('membrane-vamp') && ids({ style: 'chelsea', membrane: true }).includes('membrane-quarter'));
  assert.equal(cleanFootwear({ style: 'chelsea', lining: 'shearling' }).lining, 'shearling');
  const bom = c => components(c).map(x => x.name).join(' | ');
  assert.match(bom({ style: 'hiker' }), /Strobel sock.*Waterproof membrane bootie/); assert.match(bom({ style: 'boot', lining: 'insulated' }), /Insole board.*Insulation/);
  assert.match(bom({ style: 'derby' }), /Collar and tongue foam/); assert.doesNotMatch(bom({ style: 'loafer' }), /Collar and tongue foam/);
});

test('sandals, clogs and moulded slides: straps or a vamp tucked under a footbed (no lasting), the footbed and outsole made not cut, moulded shoes injected whole', () => {
  const ids = (st, v, o = {}) => footwearPattern({ style: st, variant: v, ...o }).pieces.map(q => q.id);
  for (const st of ['sandal', 'footbed-clog', 'moulded']) for (const v of Object.keys(VARIANTS[st])) {
    const pat = footwearPattern({ style: st, variant: v }), I = pat.pieces.map(q => q.id);
    assert.equal(pat.open, FW_STYLES[st].open, `${st} ${v} is open footwear`); assert.equal(lastingOf(pat.spec), 'none');
    assert.ok(!I.includes('insole') && !I.includes('strobel') && !I.includes('quarter-lat'), `${st} ${v}: not lasted, no quarters`);
    for (const q of pat.pieces) { assert.ok(areaOf(q.sew) > .05 && q.sew.every(p => p.every(Number.isFinite)), `${st} ${v} ${q.id} shape`); if (q.shown) assert.ok(q.shown.every(p => p.every(Number.isFinite)), `${st} ${v} ${q.id} on the shoe`); }
    const sole = pat.pieces.find(q => q.id === 'sole'); assert.ok(sole.component && sole.cut === 0, `${st} ${v}: the footbed or the shoe is made, not cut`);
    for (const q of pat.pieces.filter(x => /^strap|-strap$|^spine$/.test(x.id) && !/-lining$/.test(x.id) && x.cut)) assert.ok(I.includes(`${q.id}-lining`), `${st} ${v}: ${q.id} is lined`);
    assert.ok(pat.components.length >= 3 && pat.tooling.note && pat.checks.length >= 2, `${st} ${v}: components, tooling and checks`);
  }
  // two straps, each split at its buckle; a thong's post; a fisherman's closed heel; a suede clog's buckle strap; a wooden clog nailed, no outsole
  assert.ok(['strap-toe-long', 'strap-toe-buckle', 'strap-instep-long', 'strap-instep-buckle', 'footbed-cover', 'outsole'].every(k => ids('sandal', 'two-strap').includes(k)));
  assert.ok(ids('sandal', 'thong').includes('toe-post') && ids('sandal', 'thong').includes('strap-lat') && ids('sandal', 'thong').includes('strap-med'));
  assert.ok(['heel-strap', 'ankle-strap', 'buckle-tab', 'counter', 'spine'].every(k => ids('sandal', 'fisherman').includes(k)) && ids('sandal', 'fisherman').filter(k => /^strap-\d$/.test(k)).length === 5);
  assert.ok(ids('footbed-clog', 'suede').includes('vamp') && ids('footbed-clog', 'suede').includes('strap-long') && !ids('footbed-clog', 'wood').includes('outsole') && !ids('footbed-clog', 'wood').includes('strap-long'));
  // a strap's length is the way over the foot, and grows with the size
  const len = sz => { const q = footwearPattern({ style: 'sandal', variant: 'multi', size: sz }).pieces.find(x => x.id === 'strap-2'); return Math.max(...q.sew.map(p => p[0])) - Math.min(...q.sew.map(p => p[0])); };
  assert.ok(len(9) > 6 && len(9) < 12 && len(12) > len(8), `strap ${len(8)} → ${len(12)}`);
  // a recovery slide is one piece, nothing cut; a pool slide's strap is the one cut part; a moulded clog's heel strap rides on it; moulds, no lasts
  assert.ok(footwearPattern({ style: 'moulded', variant: 'recovery' }).pieces.every(q => !q.cut));
  assert.deepEqual(footwearPattern({ style: 'moulded', variant: 'slide' }).pieces.filter(q => q.cut).map(q => q.id), ['strap', 'strap-lining']);
  assert.ok(ids('moulded', 'clog').includes('heel-strap'));
  const t = tooling({ style: 'moulded', variant: 'clog' }); assert.ok(t.lastPairs === 0 && t.moulds === t.sizes && t.mouldCost[0] >= t.sizes * 3000, 'an injection mould a size, no lasts');
  assert.equal(cleanFootwear({ style: 'sandal', variant: 'nope' }).variant, 'two-strap', 'an unknown variant falls back to the style\'s own');
});

test('a mule is a closed toe with no back: sides start a third of the way along, no counter, heel grip or back tab; a loafer mule keeps its apron, a sneaker mule its laces', () => {
  for (const v of Object.keys(VARIANTS.mule)) {
    const pat = footwearPattern({ style: 'mule', variant: v }), I = pat.pieces.map(q => q.id);
    assert.ok(pat.backless && ['vamp', 'quarter-lat', 'quarter-med', 'toe-puff', 'insole', 'sole'].every(k => I.includes(k)), `mule ${v} pieces`);
    assert.ok(!['counter', 'heel-grip', 'back-tab', 'heel-overlay', 'collar-foam'].some(k => I.includes(k)), `mule ${v}: nothing at the back`);
    const q = pat.pieces.find(x => x.id === 'quarter-lat'); assert.ok(Math.min(...q.shown.map(p => p[0])) > pat.last.F * .25, `mule ${v}: the side starts forward of the heel`);
    assert.ok(!pat.components.some(c => /counter/i.test(c.name)) || pat.components.some(c => /Toe puff/.test(c.name)));
  }
  assert.ok(footwearPattern({ style: 'mule', variant: 'loafer' }).pieces.some(q => q.id === 'apron'));
  const sn = footwearPattern({ style: 'mule', variant: 'sneaker' }); assert.ok(sn.pieces.some(q => q.id === 'tongue') && sn.marks.eyelets.length >= 4 && sn.sole.type === 'cupsole');
  assert.equal(cleanFootwear({ style: 'mule', variant: 'heeled' }).heel, 2.25);
});
