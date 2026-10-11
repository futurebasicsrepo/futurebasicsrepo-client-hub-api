import test from 'node:test';
import assert from 'node:assert/strict';
import { OPP_TYPES, describe, rank, priority, oppKey, hiddenUntil, isHidden, countsByType } from '../src/sales-opportunities.js';

const mk = (type, id, f = {}, extra = {}) => { const d = describe(type, { name: 'Dana Reyes', company: 'Salon Co', ...f }); return { key: oppKey(type, id), type, contactId: extra.contactId === undefined ? id : extra.contactId, name: 'Dana Reyes', ...d }; };

test('every kind of opportunity says why in plain words and what to do', () => {
  const cases = { chat_waiting: {}, inbound_unanswered: { text: 'Can you build a site for us?', days: 2 }, opened_live: { build: 'Spot', days: 1 }, hot_no_deal: { level: 'hot', signals: 'looked at builds 3 times' }, deal_quiet: { dealTitle: 'New site', stage: 'proposal', days: 12, value: 1200000 }, new_unworked: { days: 1, source: 'website' }, account_expansion: { company: 'Salon Co', others: 2, value: 500000 }, cross_sell_builds: {}, cross_sell_techpack: {}, gone_cold: { days: 30 } };
  for (const [type, f] of Object.entries(cases)) { const d = describe(type, { name: 'Dana Reyes', company: 'Salon Co', ...f }); assert.ok(d.reason.length > 15, type); assert.ok(d.task.length > 5, type); assert.ok(d.score >= 1 && d.score <= 100, type); assert.ok(OPP_TYPES[type], type); }
  assert.match(describe('inbound_unanswered', { name: 'Dana', text: 'Can you build a site for us?', days: 2 }).reason, /wrote to us 2 days ago.*Nobody has answered/);
  assert.match(describe('deal_quiet', { name: 'Dana', dealTitle: 'New site', stage: 'proposal', days: 12, value: 1200000 }).reason, /\$12,000.*12 days/);
});

test('scores put what is waiting on a person above what could be done', () => {
  const s = t => describe(t, { name: 'x', days: 1, level: 'hot', dealTitle: 'd', stage: 'new', others: 1 }).score;
  assert.ok(s('chat_waiting') > s('inbound_unanswered') && s('inbound_unanswered') > s('opened_live') && s('opened_live') > s('hot_no_deal') && s('hot_no_deal') > s('new_unworked') && s('new_unworked') > s('cross_sell_builds'));
  assert.ok(describe('hot_no_deal', { name: 'x', level: 'hot' }).score > describe('hot_no_deal', { name: 'x', level: 'warm' }).score);
  assert.ok(describe('deal_quiet', { name: 'x', days: 7, value: 5000000, dealTitle: 'a' }).score > describe('deal_quiet', { name: 'x', days: 7, value: 0, dealTitle: 'a' }).score, 'a bigger deal matters more');
  assert.ok(describe('deal_quiet', { name: 'x', days: 30, value: 0, dealTitle: 'a' }).score > describe('deal_quiet', { name: 'x', days: 7, value: 0, dealTitle: 'a' }).score, 'and so does a longer silence');
  assert.ok(describe('deal_quiet', { name: 'x', days: 60, value: 99999999999, dealTitle: 'a' }).score <= 100);
});

test('priority bands', () => { assert.equal(priority(95), 'now'); assert.equal(priority(80), 'now'); assert.equal(priority(79), 'week'); assert.equal(priority(60), 'week'); assert.equal(priority(59), 'later'); });

test('a person is listed once, under their strongest reason, with the others noted', () => {
  const a = mk('hot_no_deal', 'c1', { level: 'hot' }), b = mk('inbound_unanswered', 'c1', { text: 'hello', days: 1 }), c = mk('cross_sell_builds', 'c2');
  const r = rank([a, b, c]);
  assert.equal(r.length, 2); assert.equal(r[0].type, 'inbound_unanswered'); assert.deepEqual(r[0].also, ['hot_no_deal']); assert.equal(r[0].priority, 'now'); assert.equal(r[0].typeLabel, OPP_TYPES.inbound_unanswered.label); assert.equal(r[1].contactId, 'c2');
});

test('what staff set aside stays away until the date, and the next reason for that person shows', () => {
  const now = Date.parse('2026-10-12T12:00:00Z'), a = mk('inbound_unanswered', 'c1', { text: 'hi', days: 1 }), b = mk('hot_no_deal', 'c1', { level: 'hot' });
  const hidden = new Map([[a.key, { until: new Date(now + 3 * 86400_000) }]]);
  const r = rank([a, b], { hidden, now }); assert.equal(r.length, 1); assert.equal(r[0].type, 'hot_no_deal', 'the next reason takes its place');
  const later = rank([a, b], { hidden, now: now + 4 * 86400_000 }); assert.equal(later[0].type, 'inbound_unanswered', 'after the date it is back if still true');
  assert.equal(isHidden({ until: new Date(now + 1000) }, now), true); assert.equal(isHidden({ until: new Date(now - 1000) }, now), false); assert.equal(isHidden(undefined, now), false);
});

test('how long each choice hides it', () => {
  const now = Date.parse('2026-10-12T12:00:00Z'), days = d => Math.round((hiddenUntil(d.state, now, d.days) - now) / 86400_000);
  assert.equal(days({ state: 'dismissed' }), 30); assert.equal(days({ state: 'done' }), 14); assert.equal(days({ state: 'snoozed', days: 3 }), 3); assert.equal(days({ state: 'snoozed' }), 7); assert.equal(days({ state: 'snoozed', days: 5000 }), 90); assert.equal(hiddenUntil('nonsense', now), null);
});

test('the list is capped and counted', () => {
  const many = Array.from({ length: 100 }, (_, i) => mk('cross_sell_builds', `c${i}`)); assert.equal(rank(many, { limit: 20 }).length, 20);
  assert.deepEqual(countsByType([{ type: 'gone_cold' }, { type: 'gone_cold' }, { type: 'deal_quiet' }]), { deal_quiet: 1, gone_cold: 2 });
});
