import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plushProposal, readPlush, PLUSH_READ_SCHEMA } from '../src/lab-plush-read.js';
import { plushPattern, cleanPlush } from '../src/lab-pattern.js';
import sharp from 'sharp';

const seen = { plush: true, view: 'front', shape: 'bunny', heightIn: 15.2, ears: 'long', arms: true, legs: false, tail: true, fabric: 'minky', eyes: 'safety', colours: { body: '#EFE6DA', contrast: '#f4c6cf' }, why: 'A cream bunny with long ears' };
test('a plush read from its picture: the shape, its height to the half inch, its parts and colours, each change with where it came from', () => {
  const p = plushProposal({}, seen);
  assert.equal(p.spec.shape, 'bunny'); assert.equal(p.spec.height, 15); assert.equal(p.spec.tail, true); assert.deepEqual(p.spec.colours, { body: '#efe6da', contrast: '#f4c6cf' });
  assert.ok(p.changes.every(c => c.source === 'picture (AI)')); assert.equal(p.why, 'A cream bunny with long ears');
  // under-3s keep embroidered eyes, whatever the picture shows
  assert.equal(p.spec.eyes, 'embroidered');
  assert.equal(plushProposal({ age: '3+' }, seen).spec.eyes, 'safety');
});
test('the concept\'s own words come first and the picture goes over them; a picture that is not a plush is ignored; the colours draw the toy', () => {
  const p = plushProposal({}, null, { shape: 'pillow', height: 14, fabric: 'fleece' });
  assert.equal(p.spec.shape, 'pillow'); assert.equal(p.spec.fabric, 'fleece'); assert.ok(p.changes.every(c => c.source === 'concept'));
  const q = plushProposal({}, { ...seen, shape: 'bean' }, { shape: 'pillow', height: 14 }); assert.equal(q.spec.shape, 'bean'); assert.equal(q.from.shape, 'picture (AI)');
  assert.equal(plushProposal({ shape: 'bear' }, { ...seen, plush: false }).changes.length, 0);
  assert.deepEqual(cleanPlush({ colours: { body: '#ABCDEF', contrast: 'red' } }).colours, { body: '#abcdef' });
  assert.ok(plushPattern({ shape: 'bear', colours: { body: '#123456' } }).spec.colours.body === '#123456');
});
test('the eye is asked with the picture and the schema, and nothing is asked without it', async () => {
  const img = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).png().toBuffer();
  let got = null; const r = await readPlush(img, { ask: async (sys, content, schema) => { got = { sys, content, schema }; return seen; }, name: 'Barley' });
  assert.equal(r, seen); assert.equal(got.schema, PLUSH_READ_SCHEMA); assert.equal(got.content[0].type, 'image'); assert.match(got.content[1].text, /Barley/);
  assert.equal(await readPlush(img, {}), null);
});
