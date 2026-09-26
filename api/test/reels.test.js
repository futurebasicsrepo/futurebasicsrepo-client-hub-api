import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MEDIA_DIR ??= mkdtempSync(join(tmpdir(), 'incha-reel-unit-'));
const { planReel, fitFont } = await import('../src/reels.js');

const clip = (id, minute, score, { duration = 10, trimStart = null, trimEnd = null, at = '2026-09-26T12:00:00Z' } = {}) =>
  ({ id, match_minute: minute, score, duration, trim_start: trimStart, trim_end: trimEnd, published_at: at, handle: `fan_${id}`, media_key: `${id}.mp4` });

test('planReel keeps the best-voted clips, in match order, inside each trim window', () => {
  const plan = planReel([
    clip('late', 88, 5), clip('early', 12, 1), clip('nominute', null, 9),
    clip('long', 45, 3, { duration: 90, trimStart: 10, trimEnd: 70 }), clip('broken', 30, 99, { duration: 0 })
  ]);
  assert.deepEqual(plan.map(p => p.id), ['early', 'long', 'late', 'nominute'], 'minute order; unknown minutes last; zero-length skipped');
  const long = plan.find(p => p.id === 'long');
  assert.deepEqual([long.start, long.length], [50, 20], 'caps at 20s, keeping the end of the trimmed window');
  assert.equal(plan[0].caption, "12'  @fan_early");
  assert.equal(plan.at(-1).caption, '@fan_nominute');

  const many = Array.from({ length: 20 }, (_, i) => clip(`c${i}`, i, i));
  const top = planReel(many);
  assert.equal(top.length, 12);
  assert.deepEqual(top.map(p => p.id), Array.from({ length: 12 }, (_, i) => `c${i + 8}`), 'top 12 by votes, then by minute');
  assert.deepEqual(planReel([]), []);
});

test('fitFont shrinks long scorelines to fit the frame', () => {
  assert.equal(fitFont('A 1 – 0 B', 58), 58);
  const long = 'Philadelphia Union Academy U19  3 – 2  Kensington Soccer Club Reserves';
  assert.ok(fitFont(long, 58) < 58 && fitFont(long, 58) * long.length * 0.62 <= 1180);
});
