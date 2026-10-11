import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProfile, geocode, packState, projectIndicator, runIndicator, factoryLight, pinsFor, TYPE_KEYS, SKILL_KEYS, PRODUCT_TYPES } from '../src/factories.js';

test('every product type is a family the tech packs know', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/categories.js', import.meta.url), 'utf8'));
  for (const k of TYPE_KEYS) assert.ok(src.includes(`'${k}'`), `${k} is a family or group in categories.js`);
  assert.equal(new Set(TYPE_KEYS).size, TYPE_KEYS.length);
  assert.ok(PRODUCT_TYPES.length >= 4 && SKILL_KEYS.length >= 15);
});

test('a profile keeps known product types, allows own skills, and says what is wrong', () => {
  const ok = cleanProfile({ productTypes: ['top', 'nonsense', 'top', 'plush'], skills: ['knit', 'Waterproof Taping!', ''], website: 'acme.cn', leadTimeDays: '45' }).p;
  assert.deepEqual(ok.productTypes, ['top', 'plush']);
  assert.deepEqual(ok.skills, ['knit', 'waterproof taping']);
  assert.equal(ok.website, 'https://acme.cn'); assert.equal(ok.leadTimeDays, 45);
  assert.match(cleanProfile({ leadTimeDays: 9999 }).error, /Lead time/);
  assert.match(cleanProfile({ website: 'https://no spaces' }).error, /website/);
  assert.match(cleanProfile({ lat: 95, lng: 10 }).error, /pin/);
  assert.match(cleanProfile({ lat: 10 }).error, /pin/);
  assert.deepEqual(cleanProfile({}).p, {});
});

test('the pin comes from the city, then the country, unless it was set by hand', () => {
  assert.deepEqual(geocode('Shenzhen, Guangdong', 'China'), { lat: 22.54, lng: 114.06, from: 'city' });
  assert.equal(geocode('', 'Portugal').from, 'country');
  assert.equal(geocode('Qwertyville', 'Portugal').from, 'country');
  assert.equal(geocode('Qwertyville', 'Nowhere'), null);
  assert.equal(geocode('Tirupur, India', '').lat, 11.11);
  const a = cleanProfile({ city: 'Ningbo', country: 'China' }, {}).p; assert.equal(a.lat, 29.87); assert.equal(a.geoManual, false);
  const hand = cleanProfile({ lat: '10.5', lng: '20.25' }, { city: 'Ningbo' }).p; assert.deepEqual([hand.lat, hand.lng, hand.geoManual], [10.5, 20.25, true]);
  const kept = cleanProfile({ city: 'Hanoi' }, { geoManual: true }).p; assert.equal('lat' in kept, false); // a hand-set pin is not moved by a city edit
  const back = cleanProfile({ lat: '', lng: '' }, { city: 'Hanoi', country: 'Vietnam', geoManual: true }).p; assert.deepEqual([back.lat, back.lng, back.geoManual], [21.03, 105.85, false]);
});

test('where a pack stands', () => {
  assert.equal(packState({ kind: 'quote' }), 'needs-quote');
  assert.equal(packState({ kind: 'quote', quotedAt: '2026-01-01' }), 'quoted');
  assert.equal(packState({ kind: 'quote', waivedAt: '2026-01-01' }), 'closed');
  assert.equal(packState({ kind: 'review' }), 'to-review');
  assert.equal(packState({ kind: 'review', factorySigned: true }), 'signed');
  assert.equal(packState({ kind: 'review', lockedAt: 'x' }), 'signed');
});

test('project and run indicators say when something has slipped', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  assert.equal(projectIndicator({ status: 'sampling', target_date: '2026-10-01' }, now).late, true);
  assert.equal(projectIndicator({ status: 'sampling', target_date: '2026-10-15' }, now).daysLeft, 4);
  assert.equal(projectIndicator({ status: 'completed', target_date: '2026-10-01' }, now).late, false);
  assert.equal(projectIndicator({ status: 'concept' }, now).late, false);
  assert.equal(projectIndicator(null, now), null);
  assert.equal(runIndicator({ status: 'in-production', eta_date: '2026-10-01' }, now).late, true);
  assert.equal(runIndicator({ status: 'delivered', eta_date: '2026-10-01' }, now).late, false);
});

test('a factory has one light', () => {
  assert.equal(factoryLight({}), 'idle');
  assert.equal(factoryLight({ packs: 2 }), 'active');
  assert.equal(factoryLight({ packs: 2, waiting: 1 }), 'waiting');
  assert.equal(factoryLight({ packs: 2, needAction: 1, needsAction: 1 }), 'waiting');
  assert.equal(factoryLight({ packs: 2, waiting: 1, lateRuns: 1 }), 'late');
  assert.equal(factoryLight({ lateProjects: 1 }), 'late');
});

test('factories in the same place share a pin that shows the worst light', () => {
  const pins = pinsFor([
    { key: 'a', name: 'A', lat: 22.54, lng: 114.06, light: 'active', counts: { packs: 2 } },
    { key: 'b', name: 'B', lat: 22.55, lng: 114.07, light: 'late', counts: { packs: 1 } },
    { key: 'c', name: 'C', lat: 45.46, lng: 9.19, light: 'idle', counts: { packs: 0 } },
    { key: 'd', name: 'D', lat: null, lng: null, light: 'idle', counts: { packs: 0 } }
  ]);
  assert.equal(pins.length, 2);
  const shenzhen = pins.find(p => p.ids.includes('a'));
  assert.deepEqual(shenzhen.ids, ['a', 'b']); assert.equal(shenzhen.light, 'late'); assert.equal(shenzhen.work, 3);
});
