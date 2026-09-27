import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, normalizePostEdit, parseRange, randomId, signMedia, slugify, verifyMediaSig, verifyPassword
} from '../src/lib.js';

test('randomId is base62 with the requested length', () => {
  for (let i = 0; i < 50; i++) assert.match(randomId(10), /^[A-Za-z0-9]{10}$/);
  assert.match(randomId(24), /^[A-Za-z0-9]{24}$/);
});

test('slugify folds accents and punctuation', () => {
  assert.equal(slugify('México '), 'mexico');
  assert.equal(slugify('World Cup 2026!!'), 'world-cup-2026');
  assert.equal(slugify('¡¡!!'), '');
});

test('passwords round-trip and reject wrong input', async () => {
  const stored = await hashPassword('en las buenas');
  assert.ok(await verifyPassword('en las buenas', stored));
  assert.ok(!(await verifyPassword('en las malas', stored)));
  assert.ok(!(await verifyPassword('x', 'garbage')));
});

test('media signatures expire and bind to the key', () => {
  const secret = 'test-secret';
  const exp = Math.floor(Date.now() / 1000) + 60;
  const sig = signMedia('abc.mp4', exp, secret);
  assert.ok(verifyMediaSig('abc.mp4', exp, sig, secret));
  assert.ok(!verifyMediaSig('other.mp4', exp, sig, secret));
  assert.ok(!verifyMediaSig('abc.mp4', exp, sig, 'wrong'));
  assert.ok(!verifyMediaSig('abc.mp4', exp, sig, secret, (exp + 1) * 1000));
  assert.ok(!verifyMediaSig('abc.mp4', undefined, sig, secret));
});

test('parseRange handles open, closed, suffix and bad ranges', () => {
  assert.equal(parseRange(undefined, 100), null);
  assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseRange('bytes=100-', 100), 'invalid');
  assert.equal(parseRange('bytes=5-2', 100), 'invalid');
  assert.equal(parseRange('bytes=0-1,5-6', 100), 'invalid');
});

test('normalizePostEdit validates only supplied fields', () => {
  assert.deepEqual(normalizePostEdit({ title: '  Derby   day ' }), { values: { title: 'Derby day' }, errors: [] });
  assert.equal(normalizePostEdit({ visibility: 'secret' }).errors.length, 1);
  assert.equal(normalizePostEdit({ filter: 'sepia' }).errors.length, 1);
  assert.deepEqual(normalizePostEdit({ trimStart: 2, trimEnd: 8 }, { duration: 10 }).errors, []);
  assert.equal(normalizePostEdit({ trimStart: 2, trimEnd: 2.2 }).errors.length, 1);
  assert.equal(normalizePostEdit({ trimStart: 0, trimEnd: 12 }, { duration: 10 }).errors.length, 1);
  assert.deepEqual(normalizePostEdit({ trimStart: null, trimEnd: null }).values, { trimStart: null, trimEnd: null });
});
