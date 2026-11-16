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
  assert.ok(!drawnStyle('bikini') && !drawnStyle('pants'));
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
