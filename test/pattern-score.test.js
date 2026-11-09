// The silhouette yardstick (scripts/pattern-score.mjs): drafted patterns for the styles we trust stay close to their sketches. A floor here
// catches a drafting change that quietly pulls a block away from the drawings (the binding strip once took the tank from 88 to 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('pattern score: tanks and shorts stay close to their sketches', () => {
  const out = mkdtempSync(join(tmpdir(), 'pscore-'));
  try {
    execFileSync(process.execPath, ['scripts/pattern-score.mjs', '--style', 'tank,shorts', '--out', out], { stdio: 'pipe' });
    const { summary } = JSON.parse(readFileSync(join(out, 'score.json'), 'utf8'));
    assert.equal(summary.errors, 0);
    for (const s of ['tank', 'shorts']) {
      const r = summary.byStyle[s];
      assert.ok(r && r.n > 0, `${s} scored`);
      assert.ok(r.shape >= 80, `${s} shape ${r.shape}`);
      assert.ok(r.proportions >= 82, `${s} proportions ${r.proportions}`);
      assert.ok(r.features == null || r.features >= 95, `${s} features ${r.features}`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('a top takes the shoulder and sleeve traced off its sketch, set again (never added twice) when a sketch is picked', async () => {
  const { TEMPLATE_PROPORTIONS: TP } = await import('../src/lab-template-proportions.js');
  const { fitToTemplate, defaultParams } = await import('../src/lab-flats.js');
  const [id, tp] = Object.entries(TP).find(([, v]) => Number.isFinite(v.sleeveAngle) && v.shoulder) || [];
  assert.ok(id, 'some top has a traced shoulder and sleeve');
  const { FLAT_TEMPLATES } = await import('../src/lab-flat-templates.js'), style = FLAT_TEMPLATES.find(t => t.id === id).style, base = defaultParams(style).m;
  const p = fitToTemplate({ ...defaultParams(style), template: id });
  assert.equal(p.m.shoulder, Math.round((base.shoulder + tp.shoulder) * 8) / 8);
  assert.equal(p.options.sleeveAngle, tp.sleeveAngle);
  const again = fitToTemplate(p); assert.equal(again.m.shoulder, p.m.shoulder, 'picked again: the same, not twice the change');
  const other = FLAT_TEMPLATES.find(t => t.style === style && !TP[t.id]);
  if (other) { const q = fitToTemplate({ ...p, template: other.id }); assert.equal(q.m.shoulder, base.shoulder); assert.equal(q.options.sleeveAngle, undefined); }
});

test('a bodysuit is cut round the leg to a gusset, a dress follows its sketch to the hem', async () => {
  const { fitToTemplate, defaultParams } = await import('../src/lab-flats.js');
  const { garmentPattern, boundsOf } = await import('../src/lab-pattern.js');
  const pat = (style, template) => garmentPattern(fitToTemplate({ ...defaultParams(style), template }));
  const widthAt = (pts, y) => { const xs = []; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } return Math.max(...xs) - Math.min(...xs); };
  const bs = pat('bodysuit', 'bs-crew-tee-bodysuit'), f = bs.pieces.find(q => q.id === 'front'), b = boundsOf(f.sew);
  assert.ok(widthAt(f.sew, b.y1 - .05) < 5, 'the crotch is narrow');
  assert.ok(widthAt(f.sew, b.y1 - .05) < widthAt(f.sew, b.y0 + b.h * .6) * .4, 'the leg is cut away below the hip');
  assert.ok(bs.pieces.some(q => q.id === 'gusset') && bs.trims.some(t => t.item === 'Snap tape') && bs.trims.some(t => t.item === 'Leg elastic'));
  assert.ok(bs.pieces.some(q => q.id === 'sleeve'), 'a tee bodysuit has the sleeves its sketch draws');
  const aline = pat('dress', 'dr-strapless-mini-dress').pieces.find(q => q.id === 'front'), col = pat('dress', 'dr-strapless-column-dress').pieces.find(q => q.id === 'back');
  const flare = p => { const bb = boundsOf(p.sew); return widthAt(p.sew, bb.y1 - 1) / widthAt(p.sew, bb.y0 + bb.h * .35); };
  assert.ok(flare(aline) > 1.2, 'an A-line sketch flares to its hem');
  assert.ok(flare(col) < 1.1, 'a column sketch stays straight');
});

test('strapless and strappy tops, swim, a bikini set and a mini dress are cut as such', async () => {
  const { fitToTemplate, defaultParams } = await import('../src/lab-flats.js');
  const { garmentPattern, boundsOf } = await import('../src/lab-pattern.js');
  const fit = (style, template) => fitToTemplate({ ...defaultParams(style), template }), pat = (s, t) => garmentPattern(fit(s, t)), ids = p => p.pieces.map(q => q.id);
  const tube = pat('cami', 'cami-tube-top'); assert.ok(boundsOf(tube.pieces.find(q => q.id === 'front').sew).y0 < 1.5, 'a strapless top starts at its top edge'); assert.ok(!ids(tube).includes('strap') && tube.trims.some(t => t.item === 'Gripper elastic'));
  const slip = pat('dress', 'dr-slip-maxi-dress'); assert.ok(ids(slip).includes('strap') && ids(slip).includes('strap-2'), 'a slip dress hangs on straps');
  const sw = pat('swimsuit', 'sw-cami-swimsuit'); assert.ok(ids(sw).includes('front-lining') && sw.trims.some(t => t.item === 'Swim elastic'));
  const fr = sw.pieces.find(q => q.id === 'front'), b = boundsOf(fr.sew); assert.ok(b.w > 8 && fr.sew.filter(([, y]) => y > b.y1 - .1).every(([x]) => Math.abs(x) < 3), 'a swimsuit is cut round the leg to the crotch');
  const tri = pat('bikini', 'bk-triangle-string-bikini'); assert.ok(['cup', 'underband', 'brief-front', 'brief-back'].every(i => ids(tri).includes(i)), 'a bikini is a top and a brief');
  assert.ok(ids(pat('bikini', 'bk-bandeau-tie-bikini')).includes('bandeau'));
  const mini = fit('dress', 'dr-strapless-mini-dress').m.length; assert.ok(mini > 30 && mini < 35, `a mini dress is above the knee, not cropped (${mini})`);
});

test('every kind of bag is drafted: panels, its gusset, how it is carried and closed, linings and hardware', async () => {
  const { bagPattern, BAG_KINDS, patternSvg, assembled } = await import('../src/lab-pattern.js');
  const { kindOf, cleanBagSpec } = await import('../src/lab-pattern-routes.js');
  for (const type of BAG_KINDS) {
    const p = bagPattern({ type }), ids = p.pieces.map(q => q.id);
    assert.equal(p.kind, 'bag'); assert.ok(p.pieces.every(q => q.sew.length >= 3 && q.sew.flat().every(Number.isFinite)), `${type} pieces are closed`);
    assert.ok(ids.includes(type === 'duffel' ? 'body' : 'front'), `${type} has its body`); assert.ok(p.trims.length >= 3, `${type} lists its hardware`);
    assert.ok(patternSvg(p).includes('<svg') && assembled(p).pieces.length, `${type} lays out and assembles`);
  }
  const bp = bagPattern({ type: 'backpack', w: 12, h: 17, d: 5.5 });
  assert.ok(['zip-gusset', 'base-gusset', 'strap', 'front-pocket', 'sleeve'].every(i => bp.pieces.some(q => q.id === i)), 'a zip backpack: clamshell gusset, straps, front pocket, laptop sleeve');
  assert.ok(bp.trims.some(t => t.item === 'Zip' && /two-way/.test(t.spec)));
  const tote = bagPattern({ type: 'tote', w: 16, h: 14, d: 5.5 }), g = tote.pieces.find(q => q.id === 'gusset');
  // down a side, across the bottom and up the other: the panel's edge less its open top (its corners are rounded, so a little under 2h + w)
  const gl = Math.max(...g.sew.map(([x]) => x)); assert.ok(gl > 2 * 14 + 16 - 1.5 && gl <= 2 * 14 + 16, `the gusset runs down a side, across the bottom and up the other (${gl})`);
  assert.equal(kindOf({ category: 'bags', name: 'Field tote' }), 'bag');
  assert.equal(cleanBagSpec({}, 'Night rolltop pack').type, 'rolltop'); assert.equal(cleanBagSpec({ type: 'duffel', w: 99 }).w, undefined, 'a size out of range is dropped');
});
