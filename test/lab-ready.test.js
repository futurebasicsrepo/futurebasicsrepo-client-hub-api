import test from 'node:test';
import assert from 'node:assert/strict';
import { readiness } from '../src/lab-ready.js';

const base = { id: 'c1', status: 'draft', spec: {}, twist: '', has_image: false, closeness: null, product_id: null };
const by = (r, id) => r.items.find(i => i.id === id);

test('a fresh concept: the picture, the flats, the fabric, the twist and the approval are still to do', () => {
  const r = readiness({ concept: base });
  assert.equal(r.ready, false); assert.equal(r.isPack, false); assert.equal(r.next, null);
  for (const id of ['picture', 'flats', 'made', 'materials', 'twist', 'approved']) assert.equal(by(r, id).state, 'todo', id);
  assert.equal(by(r, 'placed').state, 'done'); assert.equal(by(r, 'close'), undefined);
  assert.deepEqual(by(r, 'flats').go, { view: 'front' }); assert.deepEqual(by(r, 'picture').go, { view: 'picture' });
  assert.match(by(r, 'twist').go.href, /\/lab\?concept=c1/);
});

test('graphics on the picture without a place on the garment are worth a look, and do not hold it up', () => {
  const doc = { layers: [{ kind: 'base' }, { kind: 'mark', name: 'Wordmark', placement: 'left chest' }, { kind: 'text', name: 'Type' }, { kind: 'paint', name: 'Hidden', visible: false }] };
  const r = readiness({ concept: base, studioDoc: doc });
  assert.equal(by(r, 'placed').state, 'warn'); assert.match(by(r, 'placed').note, /1 layer .*Type/);
});

test('a concept with everything done is ready, and offers the tech pack', () => {
  const c = { ...base, status: 'approved', has_image: true, twist: 'A cut-and-sewn yoke that is ours alone', spec: { materials: [{ kind: 'fabric', role: 'main', name: 'Jersey' }] } };
  const r = readiness({ concept: c, studioDoc: { layers: [] }, flat: { check: { summary: { fail: 0, warn: 0 } } } });
  assert.equal(r.ready, true); assert.equal(r.done, r.total); assert.equal(r.next.label, 'Send to the tech pack');
});

test('problems on the flats hold it up; things to check do not', () => {
  const c = { ...base, status: 'approved', has_image: true, twist: 'A cut-and-sewn yoke that is ours alone', spec: { materials: [{ kind: 'fabric', role: 'main' }] } };
  assert.equal(by(readiness({ concept: c, flat: { check: { summary: { fail: 2 } } } }), 'made').state, 'todo');
  const w = readiness({ concept: c, flat: { check: { summary: { fail: 0, warn: 1 } } } });
  assert.equal(by(w, 'made').state, 'warn'); assert.equal(w.ready, true);
});

test('too close shows as worth a look; a tech pack points at the pack', () => {
  const r = readiness({ concept: { ...base, closeness: { verdict: 'too_close' } } }); assert.equal(by(r, 'close').state, 'warn');
  const p = readiness({ concept: { ...base, status: 'tech_pack', product_id: 'p9' } });
  assert.equal(p.isPack, true); assert.equal(p.next.href, '/tech-packs/p9'); assert.equal(by(p, 'approved').state, 'done');
});

test('materials without a fabric are a warning, not missing', () => {
  assert.equal(by(readiness({ concept: { ...base, spec: { materials: [{ kind: 'trim', role: 'trim' }] } } }), 'materials').state, 'warn');
});
