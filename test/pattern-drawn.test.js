// A top's pattern against its flat (src/lab-pattern-drawn.js): the pieces put together laid over the sketch's silhouette. The pattern proof holds
// every library top to its baseline (npm run pattern:proof); these pin what was found wrong when the check was first run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate } from '../src/lab-flats.js';
import { drawnFit, drawnStyle, DRAWN_BASELINE } from '../src/lab-pattern-drawn.js';

const start = id => { const t = FLAT_TEMPLATES.find(x => x.id === id); return fitToTemplate({ ...defaultParams(t.style), template: id }); };

test('every top in the library has a baseline against its flat, and a bikini (a top over a brief) is not compared', () => {
  const tops = FLAT_TEMPLATES.filter(t => drawnStyle(t.style)).map(t => t.id);
  assert.ok(tops.length > 250); assert.deepEqual(tops.filter(id => DRAWN_BASELINE[id] == null), []);
  assert.ok(!drawnStyle('bikini') && drawnStyle('pants'), 'a bikini is not compared; trousers are, from the waist down');
});

test('jackets and shirts: their sleeves hang at the angle their flats draw, not straight down', async () => {
  for (const id of ['jk-zip', 'shirt-classic-shirt']) {
    const p = start(id), f = await drawnFit(p);
    assert.ok(p.options.sleeveAngle >= 15, `${id}: drawn at ${p.options.sleeveAngle}°`);
    assert.ok(f.iou >= .78, `${id}: ${f.iou} against its flat (about 0.71 when they hung straight)`);
  }
});

test('a vest, a cami, a swimsuit and a strapless dress are measured to their outline, not to a panel line inside it', async () => {
  const fixes = readFileSync(new URL('../scripts/flat-templates/chest-fixes.tsv', import.meta.url), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
  assert.ok(fixes.length >= 60);
  for (const [id, view, chest] of fixes) assert.equal(FLAT_TEMPLATES.find(t => t.id === id).views[view].chest, Number(chest), `${id} ${view}`);
  for (const id of ['vest-snap-utility-vest', 'cami-babydoll-cami', 'cami-corset-top', 'dr-strapless-column-dress']) {
    const f = await drawnFit(start(id)); assert.ok(f.iou >= .7, `${id}: ${f.iou} against its flat (it was under 0.5 measured to a panel line)`);
  }
});

test('a sweatshirt on a polo collar is cut with a long sleeve and a rib cuff', () => {
  for (const id of ['polo-rugby-collar-sweatshirt', 'polo-henley-sweatshirt', 'polo-johnny-collar-sweatshirt']) {
    const m = start(id).m; assert.ok(m.sleeve > 20 && m.cuffRib >= 2.5, `${id}: sleeve ${m.sleeve} in, cuff ${m.cuffRib} in`);
  }
  assert.ok(start('polo-classic-polo').m.sleeve < 12, 'a polo keeps its short sleeve');
});

// ---- bottoms (src/lab-pattern-drawn.js compares them from the waist down) ----
import { garmentPattern } from '../src/lab-pattern.js';
import { constructionCheck } from '../src/lab-pattern-check.js';
import { measurementsFor, skirtFlare } from '../src/lab-flats.js';

test('every library bottom is held to its flat too, and the zip-pocket joggers have a silhouette to be held to', async () => {
  const bottoms = FLAT_TEMPLATES.filter(t => ['pants', 'shorts', 'skirt', 'leggings'].includes(t.style));
  assert.ok(bottoms.length > 100 && bottoms.every(t => drawnStyle(t.style) && DRAWN_BASELINE[t.id] != null));
  const f = await drawnFit(start('pt-zip-pocket-joggers')); assert.ok(f.iou >= .7, `${f.iou} (0.17 when its mask was empty)`);
});

test('a flared skirt takes its sweep from its sketch, and the check measures it at that flare', () => {
  for (const id of ['sk-flared-midi-skirt', 'sk-flared-mini-skirt']) {
    const p = start(id), m = measurementsFor(p, 'M'), pat = garmentPattern(p, 'M');
    assert.ok(skirtFlare(p) > 1 && skirtFlare(p) < 1.3, `${id}: drawn at ${skirtFlare(p)}× its hip`);
    assert.ok(pat.block.front.flare < 1.3, `${id}: cut at ${pat.block.front.flare}× (1.45 before)`);
    assert.ok(constructionCheck(pat, { m, style: p.style, edges: true }).ok);
  }
});

test('a jogger\'s rib cuff is part of its inseam, and a flared leg narrows to the knee its sketch draws', () => {
  const p = start('pt-paneled-cuffed-joggers'), m = measurementsFor(p, 'M'), pat = garmentPattern(p, 'M');
  assert.equal(pat.block.front.cuff, 2.75); assert.ok(constructionCheck(pat, { m, style: p.style, edges: true }).ok);
  const legEnd = Math.max(...pat.pieces.find(x => x.id === 'front').sew.map(q => q[1]));
  assert.ok(legEnd + 2.75 < m.rise + m.inseam, 'the leg stops a cuff short');
  const fl = start('pt-flared-track-pants'); assert.ok(fl.options.kneeRatio < .9, `knee ${fl.options.kneeRatio} of the hem`);
});

test('a sketch named with zip pockets, a curved hem or cuffed ankles is drafted with them, over a reading that missed them', () => {
  const zp = garmentPattern(start('pt-zip-pocket-joggers'), 'M');
  assert.ok(zp.pieces.some(x => x.id === 'zip-pocket') && !zp.pieces.some(x => x.id === 'pocket-opening') && zp.trims.some(t => t.item === 'Pocket zip'));
  assert.ok(constructionCheck(zp, { m: measurementsFor(start('pt-zip-pocket-joggers'), 'M'), style: 'pants', edges: true }).ok);
  assert.equal(garmentPattern(start('sh-curved-hem-sweat-shorts'), 'M').construction.hem, 'curved');
  assert.equal(garmentPattern(start('pt-cuffed-sweatpants'), 'M').construction.ankle, 'cuff');
  assert.equal(garmentPattern(start('pt-cargo-joggers'), 'M').construction.ankle, 'open', 'where both readers saw an open ankle, the name does not add a cuff');
});
