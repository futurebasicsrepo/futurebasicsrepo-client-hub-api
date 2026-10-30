import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDoc, editPrompt, artPrompt } from '../src/lab-studio-routes.js';

const pic = 'data:image/png;base64,iVBORw0KGgo=';
const doc = (o = {}) => ({ w: 1024, h: 1536, layers: [{ id: 'a', kind: 'base', src: pic }, { id: 'b', kind: 'text', text: 'FUTURE BASICS' }], ...o });

test('a studio design is kept within bounds', () => {
  assert.equal(cleanDoc(doc()).doc.layers.length, 2);
  assert.equal(cleanDoc(doc({ selected: 'b' })).doc.selected, 'b');
  for (const src of ['brand:mark', 'brand:lockup', '/v1/lab/art/0e5b2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b', 'data:image/jpeg;base64,AAAA', '/lab/flat-parts/pockets-1-3.webp']) assert.ok(cleanDoc(doc({ layers: [{ id: 'x', kind: 'image', src }] })).doc, src);
  for (const src of ['https://evil.test/a.png', 'javascript:alert(1)', 'data:text/html;base64,AAAA', '/v1/admin/clients', 'brand:other', '/lab/flat-parts/../server.js', '/lab/flat-templates/tee-classic.svg']) assert.match(cleanDoc(doc({ layers: [{ id: 'x', kind: 'image', src }] })).error, /outside the design/, src);
  assert.match(cleanDoc(doc({ layers: [{ id: 'x', kind: 'iframe' }] })).error, /unknown kind/);
  assert.match(cleanDoc(doc({ layers: [] })).error, /no layers/);
  assert.match(cleanDoc(doc({ w: 20 })).error, /no size/);
  assert.match(cleanDoc(doc({ h: 9000 })).error, /no size/);
  assert.match(cleanDoc(doc({ layers: [{ id: 'x', kind: 'text', text: 'x'.repeat(401) }] })).error, /too long/);
  assert.match(cleanDoc(null).error, /Nothing to save/);
});

test('the AI is told to keep everything outside the painted area, and never to borrow another brand', () => {
  assert.match(editPrompt('washed olive', { masked: true }), /only the transparent area of the mask/);
  assert.doesNotMatch(editPrompt('washed olive', { masked: false }), /mask/);
  assert.match(editPrompt('washed olive', { masked: false }), /What to change: washed olive/);
  for (const p of [editPrompt('x', { masked: false }), artPrompt('a bolt')]) assert.match(p, /any other company's name, logo or trade dress/);
  assert.match(artPrompt('a bolt'), /transparent background/);
});

test('a drawn path is kept, within bounds: six numbers a point, 40,000 points at most', () => {
  const path = paths => doc({ layers: [{ id: 'a', kind: 'base' }, { id: 'p', kind: 'shape', shape: 'path', paths }] });
  assert.ok(cleanDoc(path([{ closed: true, nodes: [[0, 0, 0, 0, 0, 0], [10, 0, 10, 0, 10, 0], [5, 8, 4, 8, 6, 8]] }])).doc);
  assert.match(cleanDoc(path([{ closed: true, nodes: [[0, 0, 0, 0, 0]] }])).error, /not readable/);
  assert.match(cleanDoc(path([{ closed: true, nodes: [[0, 0, 0, 0, 0, 'x']] }])).error, /not readable/);
  assert.match(cleanDoc(path([{ closed: true, nodes: Array.from({ length: 40001 }, () => [0, 0, 0, 0, 0, 0]) }])).error, /too many points/);
});
