import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { viewsToDraw, viewPrompt, placeViews, viewSketch, isDrawnView, makeViews } from '../src/views.js';
import { normalizeTechPack, techPackCompleteness, techPackReadiness, missingViews, emptyTechPack } from '../src/techpack.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const hero = () => sharp({ create: { width: 320, height: 240, channels: 3, background: '#7a8cc0' } }).jpeg().toBuffer();
const pack = (category, styleName, sketches = []) => { const d = emptyTechPack(); d.style.category = category; d.style.styleName = styleName; d.sketches = sketches; return normalizeTechPack(d); };

test('the checklist names the views and the product from what was uploaded', () => {
  const shoe = techPackCompleteness(pack('Footwear', 'Layer runner', [{ id: 'a', view: 'lateral', image: png }]));
  const hoodie = techPackCompleteness(pack('Apparel', 'Heavy hoodie'));
  assert.ok(shoe.missing.some(m => /lateral \+ medial/i.test(m)), shoe.missing.join('|'));
  assert.ok(!shoe.missing.some(m => /garment/i.test(m)), 'a shoe is not a garment');
  assert.ok(hoodie.missing.some(m => /front \+ back/i.test(m)), hoodie.missing.join('|'));
  const ready = techPackReadiness(pack('Footwear', 'Layer runner'));
  assert.ok(!ready.checks.some(c => /garment/i.test(c.label)), ready.checks.map(c => c.label).join('|'));
});

test('only the views still missing are drawn, lateral before medial', () => {
  assert.deepEqual(viewsToDraw(['medial', 'lateral']).map(v => v.view), ['lateral', 'medial']);
  assert.deepEqual(viewsToDraw([]), []);
  assert.deepEqual(missingViews(pack('Footwear', 'Layer runner', [{ id: 'a', view: 'lateral', image: png }])), ['medial']);
  assert.match(viewPrompt({ title: 'Layer runner', view: 'medial' }), /INNER side/);
  assert.match(viewPrompt({ title: 'Tee', view: 'back' }), /BACK view/);
});

test('a drawn view never replaces an uploaded picture and a newer drawing replaces the older one', async () => {
  const sk = await viewSketch({ view: 'medial', label: 'Medial (inner side)', buffer: await hero() }, 'abcd-1234');
  assert.ok(isDrawnView(sk) && sk.image.startsWith('data:image/'));
  const p = pack('Footwear', 'Layer runner', [{ id: 'up', view: 'lateral', image: png }]);
  assert.deepEqual(placeViews(p, [sk]).added, ['medial']);
  assert.equal(p.sketches.length, 2);
  const again = placeViews(p, [{ ...sk, id: 'hv-medial-other' }]);
  assert.equal(p.sketches.filter(s => s.view === 'medial').length, 1, 'one medial view');
  assert.equal(p.sketches.find(s => s.view === 'medial').id, 'hv-medial-other');
  const own = pack('Footwear', 'x', [{ id: 'mine', view: 'medial', image: png }]);
  assert.deepEqual(placeViews(own, [sk]).added, [], 'an uploaded medial view is kept');
  assert.equal(own.sketches[0].id, 'mine');
});

test('makeViews (fixture) draws both views, saves each as it passes, and the pack then has none missing', async () => {
  const saved = [];
  const out = await makeViews({ hero: await hero(), photo: null, views: viewsToDraw(['lateral', 'medial']), meta: { title: 'Layer runner' }, cfg: { provider: 'fixture', configured: true }, n: 2, min: 80, onView: async m => saved.push(m.view) });
  assert.deepEqual(out.made.map(m => m.view), ['lateral', 'medial']);
  assert.deepEqual(saved, ['lateral', 'medial']);
  assert.equal(out.skipped.length, 0);
  const p = pack('Footwear', 'Layer runner');
  for (const m of out.made) placeViews(p, [await viewSketch(m, 'hero-id-1')]);
  assert.deepEqual(missingViews(p), []);
});

test('a view that is not good enough is left out and said so', async () => {
  const out = await makeViews({ hero: await hero(), views: viewsToDraw(['medial']), cfg: { provider: 'fixture', configured: true }, n: 1, min: 99 });
  assert.equal(out.made.length, 0);
  assert.match(out.skipped[0].reason, /Only \d+\/100/);
  const h = await hero(); await assert.rejects(() => makeViews({ hero: h, views: [], cfg: { configured: false } }), /No image model/);
});
