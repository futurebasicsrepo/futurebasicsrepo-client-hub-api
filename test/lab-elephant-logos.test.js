// An elephant is drafted as one (not the nearest bear), a luxury plush can be leather, and logos sit in inches on a plush's or a shoe's views,
// checked against what their technique can make and where they land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plushPattern, cleanPlush, PLUSH_FABRICS } from '../src/lab-pattern.js';
import { plushViews } from '../src/lab-plush-views.js';
import { plushProposal } from '../src/lab-plush-read.js';
import { footwearPattern } from '../src/lab-footwear.js';
import { footwearViews } from '../src/lab-footwear-views.js';
import { cleanLogos, logoChecks, logoWords, logoMarkup } from '../src/lab-logos.js';

test('an elephant is drafted as an elephant: head and trunk in one with a gusset, big lined ears, a body, four legs on pads, a tail', () => {
  const p = plushPattern({ shape: 'elephant', height: 14 }), ids = p.pieces.filter(q => q.cut > 0).map(q => q.id);
  assert.deepEqual(ids, ['head-side', 'gusset', 'ear', 'ear-lining', 'body-side', 'underbody', 'leg-front', 'leg-hind', 'foot-pad', 'tail']);
  assert.equal(p.spec.ears, 'big'); assert.equal(p.pieces.find(q => q.id === 'ear-lining').fabric, 'contrast'); assert.equal(p.pieces.find(q => q.id === 'foot-pad').cut, 4);
  const v = plushViews(p, { colours: { body: '#1c1b1c', contrast: '#a8141c' } });
  for (const k of ['front', 'back', 'side']) { assert.ok(v[k].svg.length > 2000, k); assert.ok(v[k].box.y1 > 13 && v[k].box.y1 < 14.5, `${k} stands ${v[k].box.y1} in`); }
  assert.match(v.front.svg, /#a8141c/, 'the ear linings and pads in the contrast');
});
test('a luxury plush can be leather or suede: it is sewn with a wider allowance, its notes say how, and a baby toy in leather is flagged', () => {
  assert.ok(PLUSH_FABRICS.leather && PLUSH_FABRICS.suede && PLUSH_FABRICS.velvet);
  const p = plushPattern({ shape: 'elephant', fabric: 'leather', age: '0+' });
  assert.equal(p.sa, .375); assert.ok(p.pieces.some(q => q.fabric === 'leather')); assert.ok(p.notes.some(n => /leather needle/.test(n)));
  assert.ok(p.checks.some(c => c.level === 'warn' && /chrome-free/.test(c.msg)));
  assert.match(plushViews(p).front.svg, /lk-pebble-/, 'drawn with a leather grain');
  assert.equal(plushPattern({ shape: 'bear' }).sa, .25);
});
test('the picture of an elephant is read as an elephant, and a character the pattern has no shape for keeps its name over the nearest shape', () => {
  const p = plushProposal({}, { plush: true, animal: 'Elephant', shape: 'elephant', heightIn: 14, ears: 'big', arms: false, legs: true, tail: true, fabric: 'leather', eyes: 'embroidered', colours: { body: '#1c1b1c', contrast: '#a8141c' }, why: 'A black elephant with red-lined ears' });
  assert.equal(p.spec.shape, 'elephant'); assert.equal(p.spec.animal, 'elephant'); assert.equal(p.spec.fabric, 'leather');
  const fox = plushPattern(cleanPlush({ shape: 'bean', animal: 'fox' })); assert.match(fox.label, /^Fox · drafted as: Bean/);
  assert.equal(plushPattern({ shape: 'elephant', animal: 'elephant' }).label.startsWith('Elephant ('), true);
});
test('logos are kept on the views a product has, bounded, and drawn the right way round on a shoe\'s inside', () => {
  const ls = cleanLogos([{ view: 'front', x: 0, y: 9, w: 2, h: .6, mark: 'word' }, { view: 'lateral', x: 1, y: 1, w: 1, h: 1, mark: 'cue' }, { view: 'back', x: 0, y: 5, w: 40, h: 1, art: 'nope' }], 'plush');
  assert.equal(ls.length, 1); assert.equal(ls[0].technique, 'embroidery'); assert.equal(ls[0].name, 'Wordmark');
  assert.equal(cleanLogos([{ view: 'top', x: 4, y: 0, w: 1, h: .3, mark: 'lockup', technique: 'deboss' }], 'footwear')[0].technique, 'deboss');
  const m = logoMarkup([{ id: 'g1', view: 'medial', x: 2, y: -1, w: 1, h: .4, mark: 'cue' }], 'medial', p => p, { 'mark:cue': 'data:x' }, 10);
  assert.match(m, /x="7.5"/, 'mirrored about the inside view, the artwork itself not flipped'); assert.doesNotMatch(m, /scale\(-1/);
  assert.equal(logoMarkup([{ id: 'g1', view: 'front', x: 0, y: 0, w: 1, h: 1, mark: 'cue' }], 'front', p => p, {}), '', 'nothing without its picture');
});
test('each logo is checked: its technique\'s sizes, the cloth (no embroidery on leather, no deboss on pile), the piece of a shoe it lands on, a seam under it', () => {
  const plush = plushPattern({ shape: 'elephant', fabric: 'leather', logos: [{ view: 'front', x: 0, y: 9, w: 1.5, h: .5, mark: 'word', technique: 'embroidery' }, { view: 'back', x: 0, y: 8, w: 9, h: 2, mark: 'cue', technique: 'deboss' }] });
  const c = logoChecks(plush, plush.spec.logos);
  assert.ok(c.g1.some(f => f.level === 'warn' && /perforates leather/.test(f.msg)) && c.g1.some(f => /On the body/.test(f.msg)));
  assert.ok(c.g2.some(f => f.level === 'fail' && /over the 3 in/.test(f.msg)));
  const pile = plushPattern({ shape: 'bear', logos: [{ view: 'front', x: 0, y: 8, w: 1, h: .4, mark: 'cue', technique: 'deboss' }] });
  assert.ok(logoChecks(pile, pile.spec.logos).g1.some(f => f.level === 'fail' && /cannot be debossed/.test(f.msg)));
  const shoe = footwearPattern({ style: 'sneaker', logos: [{ view: 'lateral', x: 2, y: -1.6, w: 1.2, h: .4, mark: 'cue', technique: 'deboss' }, { view: 'lateral', x: 30, y: -1, w: 1, h: .3, mark: 'cue' }] }), sc = logoChecks(shoe, shoe.spec.logos);
  assert.ok(sc.g1.some(f => /Debossed on the flat heel overlay/.test(f.msg))); assert.ok(sc.g2.some(f => f.level === 'fail' && /off the upper/.test(f.msg)));
  assert.match(logoWords(shoe, shoe.spec.logos[0]), /outside, on the heel overlay; its centre 2 in from the heel, 1 5\/8 in above the ground/);
  assert.equal((footwearViews(shoe, { hrefs: { 'mark:cue': 'data:x' } }).lateral.svg.match(/data-logo/g) || []).length, 2);
});
