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
