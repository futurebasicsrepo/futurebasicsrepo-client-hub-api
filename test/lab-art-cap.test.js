import test from 'node:test';
import assert from 'node:assert/strict';
import { artCap, artCapVerdict } from '../src/lab-art-routes.js';

test('the daily artwork limit: 40 by default, set by LAB_DAILY_ART, off when negative', () => {
  assert.equal(artCap({}), 40);
  assert.equal(artCap({ LAB_DAILY_ART: '5' }), 5);
  assert.equal(artCap({ LAB_DAILY_ART: 'lots' }), 40, 'a value that is not a number keeps the default');
  assert.equal(artCapVerdict(39, 1, 40), true, 'the 40th fits');
  assert.equal(artCapVerdict(40, 1, 40), 40, 'the 41st is refused and the message names the limit');
  assert.equal(artCapVerdict(38, 3, 40), 40, 'a batch of three that would pass the limit is refused whole');
  assert.equal(artCapVerdict(1e6, 3, -1), true, 'a negative limit turns it off');
});
