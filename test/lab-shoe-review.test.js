import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { footwearPattern } from '../src/lab-footwear.js';
import { assembled, boundsOf } from '../src/lab-pattern.js';
import { reviewShoe, applyFix, fixedChecks, scoreOf, REVIEW_SCHEMA, CRITERIA, BAR } from '../src/lab-shoe-review.js';
import { silhouette } from '../src/lab-shoe-read.js';

// a picture of a known shoe: its own side view, drawn dark on a pale ground
async function shoePng(spec) {
  const pat = footwearPattern(spec), side = assembled(pat).pieces.filter(x => x.piece.place.view !== 'back'), b = boundsOf(side.flatMap(x => x.pts)), k = 800 / (b.w + 2);
  const paths = side.map(x => `<path d="M${x.pts.map(([px, py]) => `${(px - b.x0 + 1) * k} ${(py - b.y0 + 1) * k}`).join(' L')} Z" fill="#3d342c"/>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round((b.h + 2) * k + 160)}"><rect width="100%" height="100%" fill="#f1efe9"/><g transform="translate(60 80)">${paths}</g></svg>`)).png().toBuffer();
}
const all = s => CRITERIA.map(c => ({ key: c.key, score: s, note: s < 90 ? 'differs' : '' }));

test('without a reviewer only the outline and the fixed checks run, and it says so', async () => {
  const photo = await shoePng({ style: 'hightop' }), r = await reviewShoe({ spec: { style: 'sneaker' }, photo });
  assert.equal(r.status, 'checks-only'); assert.equal(r.score, null); assert.match(r.note, /needs Claude/);
  assert.equal(r.spec.style, 'hightop', 'the outline alone sees the high-top'); assert.ok(r.changes.every(c => c.by === 'outline' && c.round === 0));
  const aspect = r.checks.find(c => c.key === 'aspect'); assert.ok(aspect && typeof aspect.ok === 'boolean', 'the drawing is measured against the picture\'s outline');
});

test('the developer scores the views against the picture, its changes are made and drawn again, and the shoe clears the bar', async () => {
  const photo = await shoePng({ style: 'runner', eyelets: 7 }), seen = [];
  const ask = async (system, content, schema) => {
    seen.push({ system, content, schema });
    if (seen.length === 1) return { view: 'side', criteria: all(70), fixes: [{ field: 'eyelets', value: '7', why: 'The picture has seven pairs' }, { field: 'toeCap', value: 'maybe', why: 'not a boolean' }, { field: 'colours.sole', value: '#F2F0EA', why: 'off-white foam' }], beyondDrawing: ['A carbon plate'], summary: 'Close; the lacing runs further.' };
    return { view: 'side', criteria: all(93), fixes: [], beyondDrawing: [], summary: 'It reads as the shoe.' };
  };
  const rounds = []; const r = await reviewShoe({ spec: { style: 'runner' }, photo, ask, name: 'Racer', onRound: x => rounds.push(x.n) });
  assert.equal(r.status, 'passed'); assert.equal(r.score, 93); assert.equal(r.rounds.length, 2); assert.deepEqual(rounds, [0, 1, 2]);
  assert.equal(r.spec.eyelets, 7); assert.equal(r.spec.colours.sole, '#f2f0ea');
  assert.deepEqual(r.changes.filter(c => c.by === 'developer').map(c => c.key), ['eyelets', 'colours.sole'], 'the change that is not a true or false is refused');
  assert.ok(r.changes.find(c => c.key === 'eyelets').why.includes('seven'), 'each change says why'); assert.deepEqual(r.beyondDrawing, ['A carbon plate']);
  // the developer sees the picture and the four views, the choices, what was measured and what it already changed
  assert.equal(seen[0].schema, REVIEW_SCHEMA); assert.equal(seen[0].content.filter(b => b.type === 'image').length, 2); assert.match(seen[0].system, /footwear developer/);
  assert.match(seen[1].content.at(-1).text, /Already changed in earlier rounds: round 1: eyelets/);
});

test('two rounds in a row with no gain end it below the bar: the best shoe it saw is kept, and a person is needed', async () => {
  const photo = await shoePng({ style: 'sneaker' }); let k = 0;
  const ask = async () => { k++; return { view: 'side', criteria: all(k === 1 ? 80 : 75), fixes: [{ field: 'collar', value: String(2.5 + k * .5), why: 'try' }], beyondDrawing: [], summary: '' }; };
  const r = await reviewShoe({ spec: { style: 'sneaker' }, photo, ask });
  assert.equal(r.status, 'needs-person'); assert.equal(k, 3); assert.equal(r.score, 80); assert.match(r.note, new RegExp(`bar of ${BAR}`));
  assert.ok(!r.changes.some(c => c.by === 'developer'), 'the changes after the best round are not kept');
});

test('a change the developer asks for is bounded like any other choice; a new style brings its own heel and toe', () => {
  const s = { style: 'sneaker', heel: .45 };
  assert.equal(applyFix(s, { field: 'collar', value: '99', why: '' }).spec.collar, 10);
  assert.equal(applyFix(s, { field: 'shoelace', value: 'red' }), null); assert.equal(applyFix(s, { field: 'toe', value: 'heart' }), null); assert.equal(applyFix(s, { field: 'colours.upper', value: 'blue' }), null);
  const b = applyFix(s, { field: 'style', value: 'boot', why: 'a six-inch shaft' }); assert.equal(b.spec.style, 'boot'); assert.equal(b.spec.heel, 1.25); assert.equal(b.change.why, 'a six-inch shaft');
  assert.equal(applyFix({ style: 'sneaker', eyelets: 5 }, { field: 'eyelets', value: '5' }), null, 'no change, no fix');
});

test('the score is the developer\'s six points weighted, less what the outline measures out of line', async () => {
  assert.equal(scoreOf(all(90)), 90); assert.equal(scoreOf([{ key: 'silhouette', score: 100 }]), 25);
  const pat = footwearPattern({ style: 'runner' }), sil = await silhouette(await shoePng({ style: 'boot' })), checks = fixedChecks(pat, sil), a = checks.find(c => c.key === 'aspect');
  assert.equal(a.ok, false, 'a runner drawn for a boot\'s picture is out of line'); assert.ok(scoreOf(all(95), checks) < 95);
});
