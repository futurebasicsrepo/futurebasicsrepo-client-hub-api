// The construction check (src/lab-pattern-check.js): every library sketch, drafted at every size, sews together (each seam walks its partner
// within a factory's tolerance or ease), its pieces clean outlines, into a garment that measures what the piece is specified at, and lays on its cloth. Every bag too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constructionCheck } from '../src/lab-pattern-check.js';
import { defaultParams, fitToTemplate, measurementsFor, STYLES, SIZES } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { BAG_TEMPLATES } from '../src/lab-bag-templates.js';
import { garmentPattern, bagPattern } from '../src/lab-pattern.js';

const failsOf = c => [...c.seams, ...c.meas, ...c.table.map(q => ({ name: 'cut table: ' + q.fabric, ok: q.fits }))].filter(x => x.ok === false).map(x => `${x.name} ${x.got ?? x.b}/${x.want ?? x.a}`).concat(c.cuts.map(x => `${x.piece}: ${x.why}`), c.missing.map(x => `missing ${x.need} (${x.for})`));

test('every library garment, at every size, sews together and measures to its spec', () => {
  const bad = []; let n = 0;
  for (const t of FLAT_TEMPLATES) {
    if (!['top', 'bottom', 'cap', 'beanie', 'tote'].includes(STYLES[t.style]?.kind)) continue;
    const p = fitToTemplate({ ...defaultParams(t.style), template: t.id });
    for (const size of SIZES) {
      const pat = garmentPattern(p, size); if (!pat?.block) continue; n++;
      const c = constructionCheck(pat, { m: measurementsFor(p, size), style: t.style });
      if (!c.ok) bad.push(`${t.id} ${size}: ${failsOf(c).join('; ')}`);
    }
  }
  assert.ok(n > 1500, `checked ${n}`);
  assert.deepEqual(bad, []);
});

test('the check finds a seam that does not walk and a garment cut to the wrong size', () => {
  const p = fitToTemplate({ ...defaultParams('tee'), template: 'tee-classic' }), pat = garmentPattern(p, 'M');
  assert.ok(constructionCheck(pat, { m: p.m, style: 'tee' }).ok);
  const wrong = constructionCheck(pat, { m: { ...p.m, chest: p.m.chest + 2 }, style: 'tee' });
  assert.ok(!wrong.ok && wrong.meas.some(x => /chest/i.test(x.name) && !x.ok), 'a chest 2 in off is caught');
  const short = structuredClone(pat); short.block.back.sew = short.block.back.sew.map(([x, y]) => [x, y * .9]); short.block.back.at = Object.fromEntries(Object.entries(short.block.back.at).map(([k, [x, y]]) => [k, [x, y * .9]]));
  assert.ok(constructionCheck(short, { m: p.m, style: 'tee' }).seams.some(s => !s.ok), 'a back cut short no longer walks the front');
  const bent = structuredClone(pat), f = bent.pieces.find(q => q.id === 'front'); f.sew = [f.sew[0], f.sew[2], f.sew[1], ...f.sew.slice(3)];
  assert.ok(constructionCheck(bent, { m: p.m, style: 'tee' }).cuts.some(x => x.piece === 'Front'), 'an outline that crosses itself is caught');
  const bare = structuredClone(pat); bare.trims = bare.trims.filter(t => t.item !== 'Main label');
  assert.ok(constructionCheck(bare, { m: p.m, style: 'tee' }).missing.some(x => x.need === 'Main label'), 'a garment without its label is caught');
});

test('collars, stands and hoods walk the neckline, and every feature brings what it is made with', () => {
  const at = (style, id) => { const p = fitToTemplate({ ...defaultParams(style), template: id }), pat = garmentPattern(p, 'M'); return { pat, c: constructionCheck(pat, { m: p.m, style }) }; };
  const sh = at('shirt', 'shirt-button-down-shirt'); assert.ok(sh.c.seams.some(s => s.name === 'Collar stand onto the neckline' && s.ok) && sh.c.seams.some(s => s.name === 'Collar onto the neckline' && s.ok));
  assert.ok(['collar-fuse', 'stand-fuse', 'cuff-fuse', 'sleeve-placket'].every(i => sh.pat.pieces.some(q => q.id === i)), 'a shirt: its collar, stand and cuffs fused, its sleeve plackets');
  const hd = at('hoodie', 'hood-classic'); assert.ok(hd.c.seams.some(s => s.name === 'Hood side onto the neckline' && s.ok) && hd.pat.pieces.some(q => q.id === 'hood-lining') && hd.pat.trims.some(t => t.item === 'Drawcord'));
  const ch = at('pants', 'pt-tailored-trousers'); assert.ok(ch.pat.pieces.some(q => q.id === 'fly') && ch.pat.trims.some(t => /zip/i.test(t.item)) && ch.pat.pieces.some(q => q.id === 'waistband-fuse'));
  const bl = at('jacket', 'jk-blazer'); assert.ok(bl.pat.pieces.some(q => q.id === 'under-sleeve-lining') && bl.pat.pieces.find(q => q.id === 'sleeve-lining').sew.length > 5, 'a blazer’s sleeve lining is cut from its sleeves');
});

test('every bag sews together and is the size it says', () => {
  for (const t of BAG_TEMPLATES) {
    const [w, h, d] = String(t.size).match(/[\d.]+/g).map(Number), c = constructionCheck(bagPattern({ type: t.type, w, h, d }));
    assert.ok(c.ok, `${t.id}: ${failsOf(c).join('; ')}`);
  }
});

test('headwear is cut to the shape it is sewn into: cap panels a sixth of the dome, a bucket hat\'s band and brim parts of rings, a beanie\'s crown and cuff on the piece', () => {
  const made = style => { const p = defaultParams(style), pat = garmentPattern(p, 'One size'), m = measurementsFor(p, 'M'); return { pat, m, style, c: constructionCheck(pat, { m, style }) }; };
  const bad = c => [...c.seams, ...c.meas].filter(x => x.ok === false).map(x => x.name);
  const cap = made('cap'); assert.ok(cap.c.ok, failsOf(cap.c).join('; '));
  assert.equal(cap.c.seams.filter(x => /round the dome/.test(x.name) && x.ok).length, 3, 'the six panels are walked round the dome at three heights');
  const back = cap.pat.pieces.find(q => q.id === 'panel-back'), front = cap.pat.pieces.find(q => q.id === 'panel-front'), foot = q => Math.max(...q.sew.filter(([, y]) => y > Math.max(...q.sew.map(v => v[1])) - .01).map(([x]) => x)) - Math.min(...q.sew.filter(([, y]) => y > Math.max(...q.sew.map(v => v[1])) - .01).map(([x]) => x));
  assert.ok(Math.abs(foot(front) - foot(back) - 1.125) < .01, 'the back opening is cut from each back panel\'s foot');
  // a panel drawn wider than a sixth of the dome (as it used to be) is caught
  const fat = made('cap'); fat.pat.block.panel.sew = fat.pat.block.panel.sew.map(([x, y]) => { const ph = fat.pat.block.panel.at.br[1], f = y / ph; return [x * (1 + .45 * (1 - f)), y]; });
  assert.ok(bad(constructionCheck(fat.pat, { m: fat.m, style: 'cap' })).some(n => /round the dome/.test(n)), 'panels too wide towards the button are caught');
  const bk = made('bucket'); assert.ok(bk.c.ok, failsOf(bk.c).join('; '));
  const brim = bk.pat.block.brim, bw = Math.max(...brim.sew.map(([x]) => x)) - Math.min(...brim.sew.map(([x]) => x));
  assert.ok(bw < 16 && bk.c.meas.some(x => /at the centre/.test(x.name) && x.ok) && bk.c.meas.some(x => /at the side seams/.test(x.name) && x.ok), 'the brim is half a ring, the same length at its seams as at its centre');
  // a straight-sided brim (as it used to be: longer at its ends than its middle) is caught
  const flat = made('bucket'), b = flat.pat.block.brim; b.sew = [[0, 0], [11.5, 0], [14.5, 2.25], [-3, 2.25]]; b.at = { i0: [0, 0], i1: [11.5, 0], o1: [14.5, 2.25], o0: [-3, 2.25] };
  assert.ok(bad(constructionCheck(flat.pat, { m: flat.m, style: 'bucket' })).some(n => /Brim length at the side seams/.test(n)), 'a trapezoid brim is caught');
  const bn = made('beanie'); assert.ok(bn.c.ok, failsOf(bn.c).join('; '));
  const body = bn.pat.pieces.find(q => q.id === 'body'); assert.ok(body.notches.length === 2 && body.sew.length > 20, 'the cuff fold is marked and the crown is petals');
  const short = made('beanie'); short.pat.pieces.find(q => q.id === 'body').at.foldL = [0, short.pat.pieces.find(q => q.id === 'body').at.foldL[1] + 1];
  assert.ok(bad(constructionCheck(short.pat, { m: short.m, style: 'beanie' })).some(n => /Cuff/.test(n)), 'a cuff fold in the wrong place is caught');
  const tt = made('tote'); assert.ok(tt.c.ok && tt.c.seams.length === 2, failsOf(tt.c).join('; '));
  const skew = made('tote'), tb = skew.pat.pieces.find(q => q.id === 'body'); tb.sew = tb.sew.map(([x, y]) => [x, y > 30 ? y + 1 : y]); tb.at.bl = [tb.at.bl[0], tb.at.bl[1] + 1]; tb.at.br = [tb.at.br[0], tb.at.br[1] + 1];
  assert.ok(bad(constructionCheck(skew.pat, { m: skew.m, style: 'tote' })).some(n => /Side seam/.test(n)), 'a tote whose back is longer than its front is caught');
});

test('a bag is put together from its pieces: every seam walked, every edge used once, every zip in its opening', () => {
  const pc = (p, id) => p.pieces.find(q => q.id === id), names = c => [...c.seams, ...c.meas].filter(x => x.ok === false).map(x => x.name).concat(c.missing.map(x => 'Missing ' + x.need));
  // every kind, at its own size and at smaller, larger, shallower and deeper ones: a bag is sized by whoever designs it
  for (const t of BAG_TEMPLATES) { const [w0, h0, d0] = String(t.size).match(/[\d.]+/g).map(Number);
    for (const [kw, kh, kd] of [[1, 1, 1], [.6, .6, .4], [.6, 1.7, 1], [1.7, .6, 1.5], [1.3, 1.3, .7], [1.7, 1.7, 1.5], [1, 1, .15]]) {
      const spec = { type: t.type, w: Math.round(w0 * kw * 4) / 4, h: Math.round(h0 * kh * 4) / 4, d: Math.max(.5, Math.round(d0 * kd * 4) / 4) }, c = constructionCheck(bagPattern(spec));
      assert.ok(c.ok, `${t.id} at ${spec.w} × ${spec.h} × ${spec.d}: ${failsOf(c).join('; ')}`);
      assert.ok(c.seams.every(x => x.ok !== null) && c.meas.every(x => x.ok !== null), `${t.id}: every seam and measurement could be made`);
    } }
  // what a factory needs, drafted: a zip gusset in two halves that make the depth with the zip between them; a lining with its gusset; a
  // detachable strap's hooks with rings to clip to; a puller to each slider
  const bp = bagPattern({ type: 'backpack' }), zg = pc(bp, 'zip-gusset'), half = Math.max(...zg.sew.map(([, y]) => y));
  assert.equal(zg.cut, 2); assert.ok(Math.abs(2 * half + .5 - 5.5) < .13, `two halves and the zip make the depth (${half})`);
  assert.ok(['lining', 'lining-zip-gusset', 'lining-base'].every(i => pc(bp, i)?.fabric === 'lining'), 'the clamshell lining is its panels, its zip gusset and its base');
  assert.ok(constructionCheck(bp).seams.length >= 15, 'a clamshell is walked seam by seam, shell and lining');
  for (const type of ['helmet', 'briefcase', 'messenger', 'duffel', 'pouch']) { const p = bagPattern({ type }), n = k => p.trims.filter(x => x.item === k).reduce((a, x) => a + Number(x.qty), 0); assert.ok(n('D-ring') >= n('Swivel hook') && n('Swivel hook') === 2, `${type}: a ring for each hook`); }
  const wb = bagPattern({ type: 'briefcase' }); assert.equal(wb.trims.find(x => x.item === 'Zip puller').qty, 3, 'a two-way zip and a pocket zip: three sliders, three pullers');
  assert.ok(pc(bagPattern({ type: 'messenger' }), 'flap').sew.some(([, y]) => y > 4 + 7), 'a messenger flap crosses the 4 in top and comes well down the front');
  // a bag too shallow for a zip gusset in halves has its zip sewn straight to the panels
  const thin = bagPattern({ type: 'pouch', d: .75 }); assert.ok(!pc(thin, 'top-panel') && thin.assembly.some(e => e.zip != null && e.a[0] === 'front'), 'a shallow pouch zips panel to panel'); assert.ok(constructionCheck(thin).ok);

  // broken on purpose: each has to be caught, and by the check that is about it
  const broken = [
    ['a gusset 1 in short', 'tote', p => { const g = pc(p, 'gusset'); g.sew = g.sew.map(([x, y]) => [x > 1 ? x - 1 : x, y]); g.at.b = [g.at.b[0] - 1, g.at.b[1]]; g.at.c = [g.at.c[0] - 1, g.at.c[1]]; }, /Front panel round the gusset/],
    ['a zip gusset half too wide', 'backpack', p => { const g = pc(p, 'zip-gusset'); g.sew = g.sew.map(([x, y]) => [x, y > 1 ? y + .5 : y]); g.at.c = [g.at.c[0], g.at.c[1] + .5]; g.at.d = [g.at.d[0], g.at.d[1] + .5]; }, /Zip gusset across/],
    ['a seam left out', 'messenger', p => { p.assembly = p.assembly.filter(e => e.name !== 'Back panel round the gusset'); }, /No edge left unsewn/],
    ['an edge sewn twice', 'pouch', p => { p.assembly.push({ ...p.assembly.find(e => e.name === 'Front panel round the gusset') }); }, /No edge left unsewn/],
    ['a zip longer than its opening', 'briefcase', p => { p.assembly.find(e => e.zip != null).zip += 3; }, /zip in its opening/],
    ['a pocket hanging off its panel', 'sling', p => { const e = p.assembly.find(x => x.id === 'front-pocket'); e.at = [e.at[0], e.at[1] + 2]; }, /Front pocket on the front panel/],
    ['a handle too short to rise', 'tote', p => { const h = pc(p, 'handle'); h.sew = h.sew.map(([x, y]) => [x, y > 1 ? y - 12 : y]); }, /Handle rises/],
    ['handle ends on a seam', 'helmet', p => { const e = p.assembly.find(x => /Handle ends on the front/.test(x.name)); e.boxes = e.boxes.map(([x0, y0, x1, y1]) => [x0 - 4.5, y0, x1 - 4.5, y1]); }, /Handle ends on the front panel/],
    ['a flap that stops at the top', 'messenger', p => { const f = pc(p, 'flap'); f.sew = f.sew.map(([x, y]) => [x, y * .35]); }, /Flap reaches/],
    ['hooks with no rings', 'duffel', p => { p.trims = p.trims.filter(x => x.item !== 'D-ring'); }, /D-rings/],
    ['a zip with no puller', 'waist', p => { p.trims = p.trims.filter(x => x.item !== 'Zip puller'); }, /zip puller/],
    ['a lining with no gusset', 'tote', p => { p.pieces = p.pieces.filter(q => q.id !== 'lining-gusset'); }, /lining's gusset/],
    ['too little binding tape', 'rolltop', p => { p.trims.find(x => x.item === 'Binding tape').qty = '20 in'; }, /Binding tape/],
    ['a body too short for its ends', 'duffel', p => { const g = pc(p, 'body'); g.sew = g.sew.map(([x, y]) => [x, y > 1 ? y - 1 : y]); g.at.c = [g.at.c[0], g.at.c[1] - 1]; g.at.d = [g.at.d[0], g.at.d[1] - 1]; }, /Body round one end/],
    ['a panel narrower than the size', 'pouch', p => { const g = pc(p, 'front'); g.sew = g.sew.map(([x, y]) => [x * (7 / 7.5), y]); }, /Width/],
    ['straps too short', 'backpack', p => { p.assembly.find(e => e.straps).webbing = 4; }, /Shoulder straps let out/]];
  for (const [what, type, hurt, re] of broken) { const p = bagPattern({ type }); hurt(p); const c = constructionCheck(p); assert.ok(!c.ok && names(c).some(x => re.test(x)), `${what} is caught (${names(c).join('; ') || 'nothing failed'})`); }
});

test('caps, bucket hats, beanies and totes: seams walked, sized to spec, with what they are made with', () => {
  for (const style of Object.keys(STYLES).filter(k => ['cap', 'beanie', 'tote'].includes(STYLES[k].kind))) {
    const p = defaultParams(style), pat = garmentPattern(p), c = constructionCheck(pat, { m: measurementsFor(p, pat.size), style });
    assert.ok(c.ok && c.made >= 4, `${style}: ${failsOf(c).join('; ')}`);
  }
  const cap = garmentPattern(defaultParams('cap')), cc = constructionCheck(cap, { m: defaultParams('cap').m, style: 'cap' });
  assert.ok(['Crown seams: panel to panel', 'Brim onto the crown', 'Sweatband round the head opening', 'Brim board inside the brim'].every(n => cc.seams.some(s => s.name === n && s.ok)));
  assert.ok(['Top button', 'Back closure', 'Embroidered eyelets', 'Crown seam tape'].every(i => cap.trims.some(t => t.item === i)) && !cap.trims.some(t => t.item === 'Size label'), 'a one-size cap: its button, closure, eyelets and seam tape, no size label');
  // a brim cut a size too wide, or a tote cut without its turn-backs, is caught
  const wide = constructionCheck(cap, { m: { ...defaultParams('cap').m, brimWidth: 8.5 }, style: 'cap' }); assert.ok(!wide.ok && wide.meas.some(x => x.name === 'Brim width' && !x.ok));
  const tp = defaultParams('tote'), tote = structuredClone(garmentPattern(tp)), body = tote.pieces.find(q => q.id === 'body'); body.sew = body.sew.map(([x, y]) => [x, y > 1 ? y - 3 : y]);
  assert.ok(constructionCheck(tote, { m: tp.m, style: 'tote' }).meas.some(x => /Height/.test(x.name) && !x.ok), 'a tote cut without its turn-backs comes out short');
});
