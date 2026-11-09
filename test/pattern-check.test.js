// The construction check (src/lab-pattern-check.js): every library sketch, drafted at every size, sews together (each seam walks its partner
// within a factory's tolerance or ease), its pieces clean outlines, into a garment that measures what the piece is specified at, and lays on its cloth. Every bag too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constructionCheck } from '../src/lab-pattern-check.js';
import { defaultParams, fitToTemplate, measurementsFor, STYLES, SIZES } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { BAG_TEMPLATES } from '../src/lab-bag-templates.js';
import { garmentPattern, bagPattern } from '../src/lab-pattern.js';

const failsOf = c => [...c.seams, ...c.meas, ...c.table.map(q => ({ name: 'cut table: ' + q.fabric, ok: q.fits }))].filter(x => x.ok === false).map(x => `${x.name} ${x.got ?? x.b}/${x.want ?? x.a}`).concat(c.cuts.map(x => `${x.piece}: ${x.why}`));

test('every library garment, at every size, sews together and measures to its spec', () => {
  const bad = []; let n = 0;
  for (const t of FLAT_TEMPLATES) {
    if (!['top', 'bottom'].includes(STYLES[t.style]?.kind)) continue;
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
});

test('every bag sews together and is the size it says', () => {
  for (const t of BAG_TEMPLATES) {
    const [w, h, d] = String(t.size).match(/[\d.]+/g).map(Number), c = constructionCheck(bagPattern({ type: t.type, w, h, d }));
    assert.ok(c.ok, `${t.id}: ${failsOf(c).join('; ')}`);
  }
});
