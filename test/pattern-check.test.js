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
