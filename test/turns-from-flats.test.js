import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { makeViews, FROM_FLATS } from '../src/lab-views.js';

test('the turns drawn from the flats take the flats as their references and follow them', async () => {
  const png = c => sharp({ create: { width: 64, height: 64, channels: 3, background: c } }).png().toBuffer();
  const front = await png('#ff0000'), back = await png('#00ff00'), picture = await png('#0000ff'), calls = [];
  const edit = async ({ images, prompt }) => { calls.push({ images, prompt }); return png('#888888'); };
  const done = await makeViews({ concept: { name: 'Sky aviator', category: 'outerwear', spec: {} }, picture, flats: { front, back }, kinds: ['model_front', 'model_34', 'model_back'], cfg: { provider: 'openai', configured: true }, edit, onView: () => {} });
  assert.ok(done.model_front && done.model_34 && done.model_back);
  const first = calls[0]; assert.equal(first.images[0], front); assert.equal(first.images[1], back); assert.equal(first.images[2], picture);
  assert.ok(first.prompt.startsWith(FROM_FLATS));
  const backCall = calls.find(c => c.images[1] === back && c.images[2] === front); assert.ok(backCall, 'the back turn leads with the back flat');
  assert.ok(calls.slice(1).every(c => c.images[0] === done.model_front), 'later turns keep the front turn as their first reference');
});

test('every turn is handed each graphic it faces, named with its size and place, and one that leaves a graphic out is drawn again', async () => {
  const png = c => sharp({ create: { width: 64, height: 64, channels: 3, background: c } }).png().toBuffer();
  const front = await png('#ff0000'), back = await png('#00ff00'), picture = await png('#0000ff'), mark = await png('#111111'), tour = await png('#eeeeee'), calls = [], notes = {};
  const graphics = [
    { view: 'front', name: 'Wordmark', art: mark, words: 'Wordmark: 3D puff embroidery, 6⅞ wide × ½ tall, on the front, left chest' },
    { view: 'back', name: 'Tour graphic', art: tour, words: 'Tour graphic: screen print, 14⅜ wide × 11½ tall, on the back, centred 9¾ below the HPS' }
  ];
  const edit = async ({ images, prompt }) => { calls.push({ images, prompt }); return png('#888888'); };
  // the reader says the back turn left the tour graphic out, both times
  const looks = []; const look = async ({ kind, graphics: gs }) => { looks.push(kind); return { missing: kind === 'model_back' ? gs.map(g => g.name) : [] }; };
  await makeViews({ concept: { name: 'Sky aviator', category: 'outerwear', spec: {} }, picture, flats: { front, back, graphics }, kinds: ['model_front', 'model_34', 'model_side', 'model_back'], cfg: { provider: 'openai', configured: true }, edit, look, onView: (k, r, note) => { notes[k] = note; } });
  const byLast = art => calls.filter(c => c.images[c.images.length - 1] === art);
  assert.equal(byLast(mark).length, 2, 'the front and three-quarter turns carry the front wordmark art last');
  assert.ok(byLast(mark).every(c => /GRAPHICS/.test(c.prompt) && c.prompt.includes('6⅞ wide') && !c.prompt.includes('Tour graphic')));
  const backs = byLast(tour); assert.equal(backs.length, 2, 'the back turn missing its graphic is drawn once more');
  assert.match(backs[1].prompt, /The last attempt left out Tour graphic/);
  assert.ok(!calls.some(c => c.images.includes(mark) && c.images.includes(tour)), 'a turn gets only the graphics it faces');
  assert.ok(!looks.includes('model_side'), 'the side turn is not read for graphics');
  assert.match(notes.model_back, /Tour graphic may be missing/); assert.equal(notes.model_front, '');
});
