import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { footwearPattern, FW_STYLES, cleanFootwear } from '../src/lab-footwear.js';
import { assembled, boundsOf } from '../src/lab-pattern.js';
import { silhouette, sideView, shapeOf, proposal, readShoe, READ_SCHEMA } from '../src/lab-shoe-read.js';

// a picture of a known shoe: its own side view, drawn dark on a pale ground
async function shoePng(style, { toeLeft = true, bg = '#f1efe9', spec = {} } = {}) {
  const pat = footwearPattern({ style, ...spec }), side = assembled(pat).pieces.filter(x => x.piece.place.view !== 'back'), b = boundsOf(side.flatMap(x => x.pts)), k = 800 / (b.w + 2);
  const tx = ([x, y]) => [toeLeft ? (b.x1 - x + 1) * k : (x - b.x0 + 1) * k, (y - b.y0 + 1) * k];
  const paths = side.sort((a, c) => (a.piece.place.z || 0) - (c.piece.place.z || 0)).map(x => `<path d="M${x.pts.map(tx).map(q => q.join(' ')).join(' L')} Z" fill="${['rubber', 'eva'].includes(x.piece.fabric) ? '#e4e2dc' : '#3d342c'}" stroke="#1d1a17" stroke-width="2"/>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round((b.h + 2) * k + 160)}"><rect width="100%" height="100%" fill="${bg}"/><g transform="translate(60 80)">${paths}</g></svg>`)).png().toBuffer();
}

test('the outline: the shoe is found on its ground, which way the toe points, and its edges from heel to toe', async () => {
  const l = await silhouette(await shoePng('sneaker', { toeLeft: true })), r = await silhouette(await shoePng('sneaker', { toeLeft: false }));
  assert.equal(l.toeLeft, true); assert.equal(r.toeLeft, false);
  assert.ok(sideView(l) && l.aspect > 2 && l.aspect < 3.2, `a sneaker from the side (${l.aspect})`);
  assert.equal(l.profile.length, 49); assert.ok(l.profile[2].top > l.profile[46].top, 'the heel end stands taller than the toe');
  assert.ok(l.x0 > 60 && l.x0 < 200 && l.x1 > 700, 'its box in the picture');
  assert.equal(await silhouette(await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } }).png().toBuffer()), null, 'an empty picture has no shoe');
});

test('the outline measures the collar and suggests the style a shape can tell: low, high-top, boot', async () => {
  for (const [style, want] of [['sneaker', null], ['hightop', 'hightop'], ['boot', 'boot']]) {
    const sil = await silhouette(await shoePng(style)), p = proposal({ style: 'sneaker' }, sil, null), S = FW_STYLES[style];
    assert.equal(shapeOf(sil, 11, 1.1).suggests, want, style); // read as if it stood on a sneaker's cupsole, as the reader does before it knows the style
    assert.equal(p.spec.style, want || 'sneaker'); assert.ok(Math.abs(p.spec.collar - S.collar) <= .5, `${style}: collar ${p.spec.collar} for ${S.collar}`);
    assert.ok(p.spec.picture && p.spec.picture.x1 > p.spec.picture.x0, 'the picture\'s place is kept, to lay it over the shoe');
  }
  // a front view (as tall as it is wide) is not read as a side
  const front = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="100%" height="100%" fill="#fff"/><ellipse cx="250" cy="260" rx="110" ry="190" fill="#333"/></svg>')).png().toBuffer();
  assert.equal(sideView(await silhouette(front)), false);
});

test('the eye\'s reading (AI) sets the style and the lines; the outline still measures the collar; each change says where it came from', async () => {
  const sil = await silhouette(await shoePng('hightop')), vision = { footwear: true, view: 'side', style: 'hightop', toe: 'round', toeCap: false, mudguard: true, heelOverlay: true, upper: 'suede', sole: 'cupsole', eyelets: 8, vamp: .58, throat: .24, collarIn: 5, heelIn: .5, soleIn: 1.25, colours: { upper: '#3D342C', overlay: '#111111', sole: '#f2f0ea', lining: 'red' }, why: 'A suede high-top with a mudguard.' };
  const p = proposal(cleanFootwear({ style: 'sneaker' }), sil, vision);
  assert.equal(p.spec.style, 'hightop'); assert.equal(p.spec.mudguard, true); assert.equal(p.spec.upper, 'suede'); assert.equal(p.spec.eyelets, 8); assert.equal(p.spec.vamp, .58);
  assert.deepEqual(p.spec.colours, { upper: '#3d342c', overlay: '#111111', sole: '#f2f0ea' }, 'a colour that is not a hex is left out');
  assert.equal(p.from.style, 'picture (AI)'); assert.equal(p.from.collar, 'picture (shape)', 'the outline measures the collar over the eye\'s guess');
  assert.ok(p.changes.some(c => c.key === 'style' && c.from === 'sneaker' && c.to === 'hightop'));
  const pat = footwearPattern(p.spec), ids = pat.pieces.map(q => q.id);
  assert.ok(ids.includes('mudguard') && !ids.includes('toe-cap') && /8 eyelets/.test(pat.pieces.find(q => q.id === 'eyestay').notes[0]), 'the pattern follows: a mudguard, no toe cap, 8 eyelets');
  assert.ok(Math.abs(boundsOf(pat.pieces.find(q => q.id === 'vamp').shown).x0 - (pat.last.F * .58 - .35)) < .1, 'the vamp line where the picture has it');
  assert.equal(proposal({ style: 'derby' }, null, { ...vision, footwear: false }).changes.length, 0, 'not a shoe: nothing changes');
});

test('the vision call is asked for the reading, with the picture and the styles, and its schema covers every part', async () => {
  let seen = null; const ask = async (system, content, schema) => { seen = { system, content, schema }; return { ok: true }; };
  await readShoe(await shoePng('runner'), { ask, name: 'Trail runner' });
  assert.match(seen.system, /footwear developer/); assert.equal(seen.content[0].type, 'image'); assert.match(seen.content[1].text, /Trail runner/); assert.match(seen.content[1].text, /"hightop"/);
  assert.deepEqual(seen.schema, READ_SCHEMA); assert.ok(['vamp', 'throat', 'collarIn', 'colours', 'mudguard', 'sole'].every(k => READ_SCHEMA.required.includes(k)));
  assert.equal(await readShoe(Buffer.alloc(0), {}), null, 'no reader, no reading');
});

test('what a picture sets is bounded', () => {
  const c = cleanFootwear({ collar: 99, vamp: .1, throat: 2, eyelets: 40, soleHeight: -1, sole: 'jelly', colours: { upper: 'blue', sole: '#ABCDEF' }, picture: { imgW: 10, imgH: 10, x0: 5, y0: 5, x1: 2, y1: 9 } });
  assert.equal(c.collar, 10); assert.equal(c.vamp, .4); assert.equal(c.throat, .6); assert.equal(c.eyelets, 14); assert.equal(c.soleHeight, .25);
  assert.ok(!('sole' in c)); assert.deepEqual(c.colours, { sole: '#abcdef' }); assert.ok(!('picture' in c), 'a picture box that is back to front is dropped');
});

test('a thick-soled racer: the collar is read above the insole (the sole comes off), and the toe spring is taken from the outline', async () => {
  const sil = await silhouette(await shoePng('runner', { spec: { soleHeight: 1.5, spring: 1.25 } })), p = proposal({ style: 'runner' }, sil, null);
  assert.equal(p.spec.style, 'runner', 'a thick sole is not read as a high-top');
  assert.ok(Math.abs(p.spec.collar - FW_STYLES.runner.collar) <= .5, `collar ${p.spec.collar}`);
  assert.ok(p.changes.some(c => c.key === 'spring' && c.source === 'picture (shape)') && p.spec.spring >= 1, `spring ${p.spec.spring}`);
});
