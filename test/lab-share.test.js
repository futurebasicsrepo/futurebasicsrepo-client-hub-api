import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPin, hashToken, commentShape } from '../src/lab-share-routes.js';

test('a pin is a spot on the picture or the flats, held inside the picture and rounded; anything else is no pin', () => {
  assert.deepEqual(cleanPin({ on: 'picture', x: 0.33333, y: 1.4 }), { on: 'picture', x: 0.333, y: 1 });
  assert.deepEqual(cleanPin({ on: 'flats', x: '0.5', y: '-2' }), { on: 'flats', x: 0.5, y: 0 });
  assert.deepEqual(cleanPin({ on: 'elsewhere', x: 0.2, y: 0.2 }), { on: 'picture', x: 0.2, y: 0.2 });
  assert.equal(cleanPin({ on: 'picture', x: 'a', y: 0.2 }), null); assert.equal(cleanPin(null), null); assert.equal(cleanPin('x'), null);
});
test('the link token is kept as a hash, and a comment row comes out in one shape', () => {
  assert.match(hashToken('abc'), /^[0-9a-f]{64}$/); assert.notEqual(hashToken('abc'), hashToken('abd'));
  const c = commentShape({ id: '7', name: 'Ana (client)', body: 'Lower the pocket', at: 't', by_client: true, via: 'share', pin: { on: 'picture', x: .4, y: .6 }, resolved_at: null });
  assert.deepEqual(c, { id: 7, name: 'Ana (client)', body: 'Lower the pocket', at: 't', byClient: true, via: 'share', pin: { on: 'picture', x: .4, y: .6 }, resolvedAt: null });
});
