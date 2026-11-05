import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { BAG_TYPES, bagShot, cleanBag } from '../src/lab-bags.js';
import { cleanSpec, imagePrompt, CATEGORY_WORDS, CATEGORY_JSON, LOGO_PLACE, composeBranding, ensureBranding } from '../src/lab-concepts.js';
import { kindsFor, viewPrompt } from '../src/lab-views.js';
import { shoeViewPrompt, makeShoeDrawings, fixtureArt, viewsOf, firstOf, traceShoe } from '../src/lab-shoe-draw.js';
import { recolourBody } from '../src/lab-shoe-draw-routes.js';

test('the bag kinds we design: backpacks, slings, totes, helmet bags, work bags, messengers, duffels, waist bags and pouches, each with its size, carry and closure', () => {
  for (const k of ['rolltop', 'backpack', 'drawstring', 'sling', 'tote', 'helmet', 'briefcase', 'messenger', 'duffel', 'waist', 'pouch']) {
    const t = BAG_TYPES[k]; assert.ok(t && t.label && t.w > 0 && t.h > 0 && t.d > 0 && t.l > 0 && t.carry && t.closure, k);
  }
  // a backpack about 1 : 1.4–1.5 width to height
  for (const k of ['rolltop', 'backpack', 'drawstring']) { const r = BAG_TYPES[k].h / BAG_TYPES[k].w; assert.ok(r >= 1.35 && r <= 1.55, `${k} ${r}`); }
});

test('a bag concept keeps its kind, size, materials, closure and colours, and nothing it should not', () => {
  assert.deepEqual(cleanBag({ type: 'rolltop', w: 12, h: 19.1, d: 6, litres: 22, body: 'laminate', closure: 'rolltop', colours: { body: '#2B2F2C', trim: 'olive', webbing: '#5d6440' }, extra: 1 }),
    { type: 'rolltop', w: 12, h: 19, d: 6, litres: 22, body: 'laminate', closure: 'rolltop', colours: { body: '#2b2f2c', webbing: '#5d6440' } });
  assert.equal(cleanBag({ type: 'suitcase' }), null); assert.deepEqual(cleanBag({ type: 'tote', w: 900, body: 'gold' }), { type: 'tote' });
  assert.deepEqual(cleanSpec({ bag: { type: 'sling', litres: 3 } }).bag, { type: 'sling', litres: 3 });
});

test('the concept writer gets a bag designer\'s brief, and the picture is a designer\'s three-quarter render on a set that suits the bag', () => {
  assert.match(CATEGORY_WORDS.bags, /one confident shape and one idea/); assert.match(CATEGORY_WORDS.bags, /one hardware family/); assert.match(CATEGORY_WORDS.bags, /two fabrics and one accent/);
  assert.match(CATEGORY_WORDS.bags, /helmet: helmet bag/); assert.doesNotMatch(CATEGORY_WORDS.bags, /Porter|Côte|On Running|Veilance|Aer\b/, 'no brand is named to the writer');
  assert.match(CATEGORY_JSON.bags, /"bag":\{"type":"rolltop\|backpack\|/);
  const roll = imagePrompt({ name: 'Ridge Rolltop', category: 'bags', spec: cleanSpec({ bag: { type: 'rolltop', body: 'laminate' } }) });
  assert.match(roll, /rolltop backpack, about 12 × 18 × 6 in \(22 L\)/); assert.match(roll, /three-quarter view from the front/); assert.match(roll, /dark, technical studio/); assert.match(roll, /slight natural sag/);
  assert.doesNotMatch(roll, /floating/, 'a bag stands on the floor'); assert.doesNotMatch(roll, /Keep these places completely plain/);
  assert.match(imagePrompt({ name: 'Field', category: 'bags', spec: cleanSpec({ bag: { type: 'helmet' } }) }), /editorial still life/);
  assert.match(imagePrompt({ name: 'Ledger', category: 'bags', spec: cleanSpec({ bag: { type: 'briefcase' } }) }), /clean, warm studio/);
  assert.match(bagShot({}), /three-quarter view/); assert.equal(LOGO_PLACE.bags[1], null, 'the logo is not pasted flat on a bag picture');
});

test('a bag picture gets no dark card: a small quiet lockup in the corner', async () => {
  const pic = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#1c1d22' } }).jpeg().toBuffer();
  const out = await composeBranding(pic, { category: 'bags', spec: ensureBranding({}, 'bags') }, { locate: async () => { throw new Error('nothing is located on a bag'); } });
  const px = async (x, y) => [...(await sharp(out).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())];
  assert.ok((await px(1024 - 40, 1024 - 40))[0] < 60, 'no card in the bottom-right corner');
});

test('a bag on the board gets a design sheet too; its drawing in panels is front, back, side and top, the front drawn first', async () => {
  assert.ok(kindsFor('bags').includes('sheet')); assert.match(viewPrompt({ name: 'Ridge', category: 'bags' }, 'sheet'), /bag design presentation board/);
  assert.deepEqual(viewsOf('bags').map(v => v.id), ['front', 'back', 'side', 'top']); assert.equal(firstOf('bags'), 'front');
  assert.match(shoeViewPrompt('front', 'Ridge', 'bags'), /straight from the FRONT/); assert.match(shoeViewPrompt('side', '', 'bags'), /gusset/); assert.match(shoeViewPrompt('top', '', 'bags'), /directly ABOVE/);
  const front = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).png().toBuffer(), calls = [];
  const edit = async ({ images, prompt }) => { calls.push({ ref: images[0], prompt }); return fixtureArt(/FRONT/.test(prompt) ? 'front' : 'side', 'bags'); };
  const art = await makeShoeDrawings({ side: front, category: 'bags', cfg: { provider: 'openai', configured: true }, edit });
  assert.equal(calls.length, 4); assert.equal(calls[0].ref, front); assert.ok(calls.slice(1).every(c => c.ref === art.front), 'back, side and top are drawn from the front drawing');
});

test('a library bag in a chosen colour: its body (its largest colour) changes on every view; trim and hardware stay', async () => {
  const dw = await traceShoe(await fixtureArt('front', 'bags')), sv = await traceShoe(await fixtureArt('side', 'bags'));
  const body = dw.panels.sort((a, b) => b.area - a.area)[0].fill, trim = dw.panels.find(p => p.fill !== body).fill;
  const out = recolourBody({ front: dw, side: sv }, '#1f3a5f');
  assert.ok(out.front.panels.some(p => p.fill === '#1f3a5f') && out.front.panels.some(p => p.fill === trim), 'the body changes, the trim stays');
  assert.ok(out.side.panels.some(p => p.fill === '#1f3a5f'), 'on the side too');
});
