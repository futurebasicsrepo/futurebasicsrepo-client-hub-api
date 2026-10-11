import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItem, placeholdersIn, cleanCoverage, pitchPlan, isMedia, beatsOf, PITCH_BATCH } from '../src/press.js';
import { draftFacts, draftSystem, cleanDraft, draftPress } from '../src/press-draft.js';

test('an item needs a title, and ready needs a subject and a message', () => {
  assert.match(cleanItem({ title: '  ' }).error, /title/i);
  assert.match(cleanItem({ title: 'T', status: 'ready', subject: 'S' }).error, /subject and a message/i);
  const ok = cleanItem({ title: ' Launch ', kind: 'release', subject: 'S', body: 'B', status: 'ready', buildId: 'nope' }).value;
  assert.equal(ok.title, 'Launch'); assert.equal(ok.kind, 'release'); assert.equal(ok.status, 'ready'); assert.equal(ok.build_id, null);
  assert.equal(cleanItem({ title: 'T', kind: 'weird', status: 'sent' }).value.kind, 'pitch');
  assert.equal(cleanItem({ title: 'T', status: 'sent' }).value.status, 'draft');
});

test('bracketed capitals are placeholders, ordinary brackets are not', () => {
  assert.deepEqual(placeholdersIn('Hi [QUOTE FROM KYLE] and [DATE] and [DATE] and [CITY, DATE]'), ['[QUOTE FROM KYLE]', '[DATE]', '[CITY, DATE]']);
  assert.deepEqual(placeholdersIn('see [1] or [note] or [ok] or {{first_name|there}}'), []);
  assert.deepEqual(placeholdersIn(null), []);
});

test('coverage needs an outlet, a web address and a real date', () => {
  assert.match(cleanCoverage({}).error, /outlet/i);
  assert.match(cleanCoverage({ outlet: 'X', url: 'javascript:alert(1)' }).error, /web address/i);
  assert.match(cleanCoverage({ outlet: 'X', publishedOn: '2026-02-30' }).error, /date/i);
  const v = cleanCoverage({ outlet: ' Retail Dive ', url: 'https://example.com/a', publishedOn: '2026-10-14', title: 'T' }).value;
  assert.equal(v.outlet, 'Retail Dive'); assert.equal(v.published_on, '2026-10-14'); assert.equal(v.url, 'https://example.com/a');
});

test('the media list is the press tag; beats come from beat- tags', () => {
  assert.ok(isMedia(['press', 'x'])); assert.ok(!isMedia(['x'])); assert.ok(!isMedia(null));
  assert.deepEqual(beatsOf(['press', 'beat-retail', 'beat-ai']), ['retail', 'ai']);
});

const P = (id, o = {}) => ({ id, name: id, email: `${id}@x.test`, tags: ['press'], ...o });
test('a pitch plan skips the unsuitable and says why', () => {
  const plan = pitchPlan({ people: [P('a'), P('b', { tags: [] }), P('c', { email: '' }), P('d', { suppressed: 'bounced' }), P('e', { unsubscribed: true }), P('f'), P('g', { suppressed: 'complained' })], already: new Set(['f']), left: 10 });
  assert.deepEqual(plan.send.map(p => p.id), ['a']);
  const why = Object.fromEntries(plan.skip.map(s => [s.id, s.reason]));
  assert.match(why.b, /media list/); assert.match(why.c, /no email/i); assert.match(why.d, /bounced/i); assert.match(why.e, /not to be emailed/i); assert.match(why.f, /already/i); assert.match(why.g, /spam/i);
});

test('a pitch plan stops at the daily limit and at the batch size', () => {
  const people = Array.from({ length: 40 }, (_, n) => P(`p${n}`));
  assert.equal(pitchPlan({ people, left: 100 }).send.length, PITCH_BATCH);
  const lim = pitchPlan({ people: people.slice(0, 5), left: 2 }); assert.equal(lim.send.length, 2); assert.match(lim.skip[0].reason, /limit/i);
  const none = pitchPlan({ people: people.slice(0, 2), left: 0 }); assert.equal(none.send.length, 0); assert.match(none.skip[0].reason, /limit/i);
  const batch = pitchPlan({ people, left: 100 }); assert.match(batch.skip[0].reason, /batch/i);
});

test('the draft prompt forbids inventing facts and carries only what it was given', () => {
  const facts = draftFacts({ build: { name: 'Cuesea', sector: 'Beauty', status: 'live', tagline: 'Salon booking', summary: 'A site.', highlights: [{ title: 'Booking', text: 'online' }], stack: ['Shopify'] }, angle: 'Small salons', audience: 'Retail trade press' });
  assert.match(facts, /Cuesea/); assert.match(facts, /Booking \(online\)/); assert.match(facts, /Built with: Shopify/); assert.match(facts, /Small salons/);
  const sys = draftSystem('release', facts); assert.match(sys, /Never invent a quote/); assert.match(sys, /\[QUOTE FROM KYLE\]/); assert.match(sys, /FACTS:/);
  assert.match(draftSystem('pitch', facts), /\{\{first_name\|there\}\}/);
});

test('a cleaned draft has no markdown, no foreign links, and merge fields only in a pitch', () => {
  const raw = { subject: '**Big** news\nnow', body: 'See https://evil.example/x and https://builds.thefuturebasics.com/a\n\n\n\nHi {{first_name|there}} `code`' };
  const rel = cleanDraft(raw, 'release'); assert.equal(rel.subject, 'Big news now'); assert.ok(!/evil/.test(rel.body)); assert.match(rel.body, /builds\.thefuturebasics\.com/); assert.ok(!/\{\{/.test(rel.body)); assert.ok(!/`|\*\*/.test(rel.body));
  assert.match(cleanDraft(raw, 'pitch').body, /\{\{first_name\|there\}\}/);
});

test('drafting works through an injected assistant and refuses an empty answer', async () => {
  const d = await draftPress({ kind: 'pitch', angle: 'x', ask: async () => ({ subject: 'S', body: 'B [DATE]' }) }); assert.deepEqual(d, { subject: 'S', body: 'B [DATE]' });
  await assert.rejects(draftPress({ kind: 'pitch', angle: 'x', ask: async () => ({ subject: '', body: '' }) }), /usable/);
});
