import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTag, cleanTags, cleanSegment, AUTO_TAGS, cleanContact, cleanDeal, cleanTask, cleanActivity, cleanEmail, heat, staleDays, pipelineSummary, nextBusinessDay, parseCsv, STAGES, OPEN_STAGES } from '../src/sales.js';

test('a contact needs a name or an email and is cleaned', () => {
  assert.match(cleanContact({}).error, /name or an email/);
  assert.match(cleanContact({ email: 'nope' }).error, /not an email/);
  const c = cleanContact({ name: '  Dana   Reyes ', email: ' Dana@Salon.COM ', tags: 'VIP, Salon; salon', source: 'bogus', emailOk: false, companyName: 'Salon Co' }).value;
  assert.deepEqual([c.name, c.email, c.tags, c.source, c.email_ok, c.companyName], ['Dana Reyes', 'dana@salon.com', ['vip', 'salon'], 'manual', false, 'Salon Co']);
  assert.equal(cleanContact({ email: 'a@b.co' }).value.name, '', 'an email alone is enough');
  assert.deepEqual(cleanContact({ phone: ' 555 ' }, { partial: true }).value, { phone: '555' }, 'an update only touches what it sends');
  assert.equal(cleanEmail('x@y'), '');
});

test('a deal: stage, money, dates, and a reason when it is lost', () => {
  assert.match(cleanDeal({}).error, /title/);
  const d = cleanDeal({ title: 'Salon site', value: '$12,500', expectedClose: '2026-12-01' }).value;
  assert.deepEqual([d.stage, d.value_cents, d.expected_close], ['new', 1250000, '2026-12-01']);
  assert.match(cleanDeal({ title: 'x', stage: 'maybe' }).error, /Stage must be/); assert.match(cleanDeal({ title: 'x', value: '-5' }).error, /money/);
  assert.match(cleanDeal({ title: 'x', expectedClose: '2026-13-40' }).error, /date/); assert.match(cleanDeal({ title: 'x', expectedClose: 'soon' }).error, /date/);
  assert.equal(cleanDeal({ title: 'x', expectedClose: '' }).value.expected_close, null);
  assert.equal(cleanDeal({ title: 'x', stage: 'lost' }).needsReason, true, 'lost needs a reason');
  assert.equal(cleanDeal({ title: 'x', stage: 'lost', lostReason: 'Went with their nephew' }).value.lost_reason, 'Went with their nephew');
  assert.deepEqual(cleanDeal({ stage: 'meeting' }, { partial: true }).value, { stage: 'meeting' });
});

test('tasks and logged activity', () => {
  assert.match(cleanTask({}).error, /title/); assert.equal(cleanTask({ title: 'Call', dueAt: '2026-10-12' }).value.due_at, '2026-10-12T09:00:00.000Z');
  assert.match(cleanTask({ title: 'x', dueAt: 'tomorrow-ish' }).error, /not a date/); assert.equal(cleanTask({ done: true }, { partial: true }).value.done, true);
  assert.match(cleanActivity({ kind: 'note', text: '  ' }).error, /what happened/); assert.equal(cleanActivity({ kind: 'showcase_view', text: 'x' }).value.kind, 'note', 'only human kinds can be logged by hand');
});

test('how warm a lead is: recent and meaningful beats old and minor', () => {
  const now = Date.parse('2026-10-11T12:00:00Z'), ago = d => new Date(now - d * 86400_000).toISOString();
  assert.equal(heat([], now).level, 'none');
  assert.equal(heat([{ kind: 'showcase_view', at: ago(1) }], now).level, 'warm');
  assert.equal(heat([{ kind: 'showcase_demo', at: ago(0.1) }, { kind: 'showcase_view', at: ago(0.2) }], now).level, 'hot');
  assert.equal(heat([{ kind: 'showcase_view', at: ago(40) }], now).level, 'cold', 'it cools by half every week');
  assert.equal(heat([{ kind: 'note', at: ago(0) }, { kind: 'system', at: ago(0) }], now).level, 'none', 'notes and system lines are not interest');
  assert.equal(heat([{ kind: 'email_in', at: ago(0) }], now).level, 'hot', 'a reply is the warmest thing there is');
  assert.equal(staleDays(ago(9), now), 9); assert.equal(staleDays('garbage', now), 0);
});

test('the pipeline: counts, open value and a forecast weighted by the odds', () => {
  const s = pipelineSummary([{ stage: 'new', value_cents: 100000 }, { stage: 'proposal', value_cents: 500000 }, { stage: 'won', value_cents: 300000 }, { stage: 'lost', value_cents: 900000 }, { stage: 'meeting', value_cents: null }]);
  assert.equal(s.openCount, 3); assert.equal(s.openValueCents, 600000); assert.equal(s.wonCents, 300000);
  assert.equal(s.forecastCents, 10000 + 300000, '10% of the new deal and 60% of the proposal'); assert.deepEqual(s.stages.map(x => x.stage), STAGES);
  assert.equal(pipelineSummary([]).forecastCents, 0); assert.deepEqual(OPEN_STAGES, ['new', 'contacted', 'meeting', 'proposal']);
});

test('a follow-up lands on the next working day', () => {
  assert.equal(nextBusinessDay(new Date('2026-10-09T15:00:00Z')).toISOString(), '2026-10-12T09:00:00.000Z', 'Friday → Monday');
  assert.equal(nextBusinessDay(new Date('2026-10-11T08:00:00Z')).toISOString(), '2026-10-12T09:00:00.000Z', 'Sunday → Monday');
  assert.equal(nextBusinessDay(new Date('2026-10-13T08:00:00Z')).toISOString(), '2026-10-14T09:00:00.000Z');
});

test('pasted CSV: quotes, commas inside quotes, CRLF, loose headers, blank lines', () => {
  const rows = parseCsv('﻿Name, E-mail ,Company\r\n"Reyes, Dana",dana@salon.com,"Salon ""Co"""\r\n\r\nSam,sam@roaster.co,\n');
  assert.deepEqual(rows, [{ name: 'Reyes, Dana', email: 'dana@salon.com', company: 'Salon "Co"' }, { name: 'Sam', email: 'sam@roaster.co', company: '' }]);
  assert.deepEqual(parseCsv(''), []); assert.deepEqual(parseCsv('a,b'), []);
});

test('tags are short lower-case labels, whatever is typed', () => {
  assert.equal(cleanTag('Tech Pack'), 'tech-pack'); assert.equal(cleanTag('  VIP!! '), 'vip'); assert.equal(cleanTag('a_b  c'), 'a-b-c'); assert.equal(cleanTag('region:NYC'), 'region:nyc'); assert.equal(cleanTag('---'), ''); assert.equal(cleanTag('x'.repeat(50)).length, 30); assert.equal(cleanTag(null), '');
  assert.deepEqual(cleanTags('Tech Pack, builds; BUILDS\n vip'), ['tech-pack', 'builds', 'vip']); assert.deepEqual(cleanTags(['A', 'a ', '', 'B b']), ['a', 'b-b']); assert.equal(cleanTags(Array.from({ length: 40 }, (_, i) => 't' + i)).length, 20, 'twenty at most');
  assert.deepEqual(cleanContact({ name: 'x', tags: 'Tech Pack, VIP' }).value.tags, ['tech-pack', 'vip']); assert.deepEqual(AUTO_TAGS, ['client', 'lead', 'tech-pack']);
});

test('a saved view needs a name and something to filter by', () => {
  assert.match(cleanSegment({}).error, /name/); assert.match(cleanSegment({ name: 'Empty', filter: {} }).error, /at least one/);
  const v = cleanSegment({ name: '  Salons  ', filter: { tags: 'Tech Pack, salon', excludeTags: ['Lead'], source: 'bogus', q: ' dana ' } }).value;
  assert.deepEqual(v, { name: 'Salons', filter: { q: 'dana', tags: ['tech-pack', 'salon'], excludeTags: ['lead'], source: '' } });
  assert.equal(cleanSegment({ name: 'From showcase', filter: { source: 'showcase' } }).value.filter.source, 'showcase');
});
