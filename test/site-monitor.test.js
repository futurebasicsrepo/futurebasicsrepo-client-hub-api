import test from 'node:test';
import assert from 'node:assert/strict';
import { nextState, alertsFor, answered, daysLeft, registrable, limits } from '../src/site-monitor.js';
import { sitesVerdict } from '../src/platform-coverage.js';

const lim = limits({ SITE_SLOW_MS: '1000' }), T = new Date('2026-10-12T12:00:00Z');
const step = (prev, res) => ({ ...prev, ...nextState(prev, { at: T, ...res }, lim) });

test('one failure is a blip, two in a row is down, and the first good answer brings it back', () => {
  let s = step({ state: 'up' }, { ok: false });
  assert.deepEqual([s.state, s.fails], ['up', 1]);
  s = step(s, { ok: false }); assert.deepEqual([s.state, s.fails, !!s.down_since], ['down', 2, true]);
  const since = s.down_since; s = step(s, { ok: false }); assert.equal(s.down_since, since, 'the time it went down is kept');
  s = step(s, { ok: true, ms: 120 }); assert.deepEqual([s.state, s.fails, s.down_since], ['up', 0, null]);
  assert.equal(step({}, { ok: false }).state, 'unknown', 'a first failure of a site never checked is not yet down');
});

test('three slow answers in a row is slow; a quick one clears it', () => {
  let s = { state: 'up' }; for (let i = 0; i < 2; i++) s = step(s, { ok: true, ms: 2000 }); assert.equal(s.state, 'up');
  s = step(s, { ok: true, ms: 2000 }); assert.equal(s.state, 'slow');
  assert.equal(step(s, { ok: true, ms: 100 }).state, 'up');
});

test('a sign-in wall counts as up, an error page does not', () => {
  assert.deepEqual([200, 301, 401, 403].map(answered), [true, true, true, true]);
  assert.deepEqual([404, 500, 503].map(answered), [false, false, false]);
});

test('alerts are said once, and again after the problem was fixed', () => {
  const down = { state: 'down', fails: 2, down_since: T };
  let r = alertsFor({ state: 'up', alerts: {} }, down, { name: 'Pine', lim }); assert.deepEqual(r.alerts.map(a => [a.key, a.severity]), [['down', 'critical']]);
  r = alertsFor({ state: 'down', alerts: r.sent }, { ...down, fails: 3 }, { name: 'Pine', lim }); assert.equal(r.alerts.length, 0, 'not said twice');
  r = alertsFor({ state: 'down', alerts: r.sent }, { state: 'up', fails: 0 }, { name: 'Pine', lim }); assert.deepEqual(r.alerts.map(a => a.key), ['recovered']); assert.equal(r.sent.down, undefined);
  r = alertsFor({ state: 'up', alerts: r.sent }, down, { name: 'Pine', lim }); assert.equal(r.alerts.length, 1, 'a second outage is said again');
});

test('a certificate or domain running out warns at 21 / 30 days, is urgent at 7, and clears when renewed', () => {
  const now = Date.parse('2026-10-12T12:00:00Z'), inDays = n => new Date(now + n * 86400000), up = { state: 'up', fails: 0 };
  let r = alertsFor({ state: 'up', alerts: {} }, up, { certAt: inDays(20), now, name: 'Pine', lim }); assert.deepEqual(r.alerts.map(a => [a.key, a.severity]), [['cert21', 'warning']]);
  r = alertsFor({ state: 'up', alerts: r.sent }, up, { certAt: inDays(6), now, name: 'Pine', lim }); assert.deepEqual(r.alerts.map(a => [a.key, a.severity]), [['cert7', 'critical']]);
  r = alertsFor({ state: 'up', alerts: r.sent }, up, { certAt: inDays(80), now, name: 'Pine', lim }); assert.deepEqual([r.alerts.length, r.sent.cert7, r.sent.cert21], [0, undefined, undefined]);
  const d = alertsFor({ state: 'up', alerts: {} }, up, { domainAt: inDays(25), now, name: 'Pine', lim }); assert.deepEqual(d.alerts.map(a => a.key), ['domain30']);
  assert.equal(alertsFor({ state: 'up', alerts: {} }, up, { certAt: null, domainAt: null, now, lim }).alerts.length, 0, 'nothing known, nothing said');
  assert.equal(daysLeft(inDays(10), now), 10);
});

test('the registry name of a site: last two labels, three under a country domain', () => {
  assert.deepEqual(['www.pineco.com', 'pineco.com', 'shop.pineco.co.uk', 'a.b.pineco.io'].map(registrable), ['pineco.com', 'pineco.com', 'pineco.co.uk', 'pineco.io']);
});

test('the health verdict: off with nothing watched, down beats everything, then warnings, then ok', () => {
  const now = Date.parse('2026-10-12T12:00:00Z'), ok = n => ({ name: n, state: 'up', checkedAt: new Date(now - 60_000), certDays: 80, domainDays: 200 });
  assert.equal(sitesVerdict({ sites: [], now }).status, 'off');
  assert.equal(sitesVerdict({ sites: [ok('A'), ok('B')], now }).status, 'ok');
  assert.match(sitesVerdict({ sites: [ok('A'), { ...ok('B'), state: 'down' }], now }).summary, /1 site is down: B/);
  assert.match(sitesVerdict({ sites: [ok('A'), { ...ok('B'), certDays: 9 }], now }).summary, /1 certificate running out soon \(B\)/);
  assert.equal(sitesVerdict({ sites: [{ ...ok('A'), state: 'slow' }], now }).status, 'warn');
  assert.equal(sitesVerdict({ sites: [{ ...ok('A'), checkedAt: new Date(now - 3 * 3600_000) }], now }).status, 'warn');
});
