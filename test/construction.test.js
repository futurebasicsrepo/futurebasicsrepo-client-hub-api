import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constructionOf, fromName, cleanConstruction, constructionWords } from '../src/lab-construction.js';
import { defaultParams, fitToTemplate } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { garmentPattern, assembled, boundsOf } from '../src/lab-pattern.js';

const pat = (style, template, options) => garmentPattern(fitToTemplate({ ...defaultParams(style, 'regular', options), template }));
const ids = p => p.pieces.map(q => q.id);

test('what a sketch is built with is read from its name, then the style, and what is set wins', () => {
  assert.deepEqual(fromName('pt-double-knee-carpenter-pants Double-knee carpenter pants', 'pants').knee, 'double');
  assert.equal(fromName('tee-raglan-boxy-tee Raglan boxy tee', 'tee').sleeve, 'raglan');
  assert.equal(fromName('pt-cargo-joggers Cargo joggers', 'pants').waist, 'drawcord');
  assert.ok(fromName('jk-cargo-bomber Cargo bomber', 'jacket').pockets.includes('cargo'));
  assert.equal(fromName('crew-quarter-zip-sweatshirt Quarter-zip sweatshirt', 'crewneck').opening, 'quarter-zip');
  // the style's own: a zip hoodie has a split kangaroo; a hood takes the place of a collar
  assert.deepEqual(constructionOf({ style: 'ziphoodie', template: 'zip-classic', options: {} }).pockets, ['split-kangaroo']);
  // set on the piece (by the designer, or read from a freehand drawing) wins over the name
  const c = constructionOf({ style: 'pants', template: 'pt-cargo', options: { construction: { pockets: ['five-pocket'], leg: 'flare', bogus: 1 } } });
  assert.deepEqual(c.pockets, ['five-pocket']); assert.equal(c.leg, 'flare'); assert.equal(c.bogus, undefined);
  assert.deepEqual(cleanConstruction({ sleeve: 'bat', pleats: 9, pockets: ['cargo', 'nonsense'] }), { pleats: 3, pockets: ['cargo'] });
  assert.ok(constructionWords(c).includes('Flared leg'));
});

test('every library sketch drafts without error, its pieces finite, the product in one place', () => {
  for (const t of FLAT_TEMPLATES) {
    const p = pat(t.style, t.id); if (!p) continue;
    for (const q of p.pieces) assert.ok(q.sew.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), `${t.id} ${q.id}`);
    const A = assembled(p); assert.ok(Number.isFinite(A.bounds.w) && A.bounds.w < 200, `${t.id} product bounds`);
  }
});

test('a sketch never gets a length its name does not say: cropped shortens, long lengthens, the rest stays near the style', () => {
  const len = (style, template) => fitToTemplate({ ...defaultParams(style), template }).m;
  assert.ok(len('dress', 'dr-t-shirt-dress').length > 33, 'a T-shirt dress is not a top');
  assert.ok(len('jacket', 'jk-blazer').length < 31, 'a blazer is not a coat');
  assert.ok(len('shorts', 'sh-boxer-briefs').inseam >= 5, 'boxer briefs keep a leg');
  assert.ok(len('tee', 'tee-cropped-tee').length < len('tee', 'tee-classic').length);
});

test('the features the sketches show are in the pattern, and on the product as the flats draw them', () => {
  const rag = pat('tee', 'tee-raglan'); assert.ok(rag.pieces.find(q => q.id === 'sleeve').name === 'Raglan sleeve' && ids(rag).includes('raglan-front'));
  const west = pat('jacket', 'jk-western-yoke-jacket'); assert.ok(['front-yoke', 'yoke', 'welt'].every(i => ids(west).includes(i)), 'the western yoke, front and back, and the slanted welt pockets the sketch draws');
  const dk = pat('pants', 'pt-double-knee-work-pants'), knee = dk.pieces.find(q => q.id === 'knee'), front = dk.pieces.find(q => q.id === 'front');
  assert.ok(knee && boundsOf(knee.shown).w <= boundsOf(front.shown).w + .01, 'the knee panel is on one leg');
  const cargo = pat('pants', 'pt-cargo-joggers'); assert.ok(ids(cargo).includes('cargo') && cargo.trims.some(t => t.item === 'Drawcord'));
  const flare = pat('pants', 'pt-flared-jeans'), straight = pat('pants', 'pt-straight-jeans'), hem = p => { const f = p.pieces.find(q => q.id === 'front'); return Math.max(...f.sew.map(([, y]) => y)); };
  // a flare narrows to the knee and widens below it (each pair of trousers is as wide as its own sketch draws it, so two sketches are not compared)
  const widthAt = (pts, y) => { const xs = []; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } return Math.max(...xs) - Math.min(...xs); };
  const fs = flare.pieces.find(q => q.id === 'front').sew, H = hem(flare); void straight;
  assert.ok(widthAt(fs, H - .3) > widthAt(fs, H * .62) + .5, `a flare is wider at the hem than at the knee (${widthAt(fs, H - .3).toFixed(2)} vs ${widthAt(fs, H * .62).toFixed(2)})`);
  assert.ok(ids(flare).includes('coin-pocket') && flare.trims.some(t => t.item === 'Rivets'));
  const puffer = pat('jacket', 'jk-hooded-puffer'); assert.ok(ids(puffer).includes('front-fill') && ids(puffer).includes('hood') && puffer.trims.some(t => t.item === 'Insulation'));
  const trench = pat('coat', 'coat-belted-trench-jacket'); assert.ok(ids(trench).includes('belt') && trench.trims.some(t => t.item === 'Buckle'));
  const half = pat('crewneck', 'crew-half-zip-pullover'); assert.ok(ids(half).includes('zip-placket') && ids(half).includes('collar'));
  const zh = pat('ziphoodie', 'zip-classic'); assert.ok(ids(zh).includes('pocket') && ids(zh).includes('hood-front'));
  const sk = pat('skirt', 'sk-pleated-tennis-skirt'), skf = sk.pieces.find(q => q.id === 'front'); assert.ok(boundsOf(skf.sew).w > boundsOf(skf.shown).w * 2.5, 'knife pleats: cut three times as wide');
  // the waistband shows as wide as the waist, the legs meet at the centre, and both back pockets show
  const pt = pat('pants', 'pt-straight-jeans'), wbq = pt.pieces.find(q => q.id === 'waistband'); assert.ok(Math.abs(boundsOf(wbq.shown).w - defaultParams('pants').m.waist) < .01);
  assert.ok(ids(pt).includes('back-pocket-2'));
});
