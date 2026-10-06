import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getJar, credit, createJar, parseAmount, setCheer, countSince, recentPayments } from '../src/db.js';

test('seeds the three demo devices', () => {
  const db = openDb(':memory:');
  assert.equal(getJar(db, 'mia').kind, 'piggy');
  assert.deepEqual(getJar(db, 'grace').presets, [100, 300, 500]);
});

test('a payment is credited once even if Stripe reports it twice', () => {
  const db = openDb(':memory:');
  const before = getJar(db, 'mia').balance_cents;
  assert.equal(credit(db, { id: 'pi_1', slug: 'mia', amount_cents: 500 }).balance_cents, before + 500);
  assert.equal(credit(db, { id: 'pi_1', slug: 'mia', amount_cents: 500 }), null);
  assert.equal(getJar(db, 'mia').balance_cents, before + 500);
});

test('new jars get a device key and validated fields', () => {
  const db = openDb(':memory:');
  const j = createJar(db, { slug: 'st-marks', kind: 'plate', name: "St Mark's" });
  assert.match(j.device_key, /^[0-9a-f]{32}$/);
  assert.throws(() => createJar(db, { slug: 'Bad Slug', kind: 'plate', name: 'x' }), /slug/);
  assert.throws(() => createJar(db, { slug: 'ok', kind: 'vase', name: 'x' }), /kind/);
});

test('amounts are whole cents inside the limits', () => {
  assert.equal(parseAmount(300), 300);
  assert.equal(parseAmount('1250'), 1250);
  for (const bad of [99, 50001, 1.5, 'abc', null]) assert.throws(() => parseAmount(bad), /Amount/);
});

test('a payment takes one cheer, and only for its own jar', () => {
  const db = openDb(':memory:');
  credit(db, { id: 'pi_c', slug: 'mia', amount_cents: 300 });
  assert.equal(setCheer(db, { id: 'pi_c', slug: 'grace', cheer: '🙏' }), false);
  assert.equal(setCheer(db, { id: 'pi_c', slug: 'mia', cheer: '🎉' }), true);
  assert.equal(setCheer(db, { id: 'pi_c', slug: 'mia', cheer: '💖' }), false);
  assert.equal(recentPayments(db, 'mia', 1)[0].cheer, '🎉');
});

test('counts payments since a moment', () => {
  const db = openDb(':memory:');
  const t = Date.now();
  credit(db, { id: 'pi_a', slug: 'corner-cafe', amount_cents: 100 });
  credit(db, { id: 'pi_b', slug: 'corner-cafe', amount_cents: 300 });
  assert.equal(countSince(db, 'corner-cafe', t - 1000), 2);
  assert.equal(countSince(db, 'corner-cafe', Date.now() + 1000), 0);
});
