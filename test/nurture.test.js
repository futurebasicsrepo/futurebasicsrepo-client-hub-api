import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextFreeStep, nextPaidStep, nurtureEmail, pickCaseStudy, parseCaseStudies, unsubscribeToken, validUnsubscribeToken, marketingFooter, FREE_STEPS } from '../src/nurture.js';

const H = 36e5, t0 = new Date('2026-10-04T12:00:00Z');
const at = hours => new Date(t0.getTime() + hours * H);

test('free track: nothing before day 1, then each step in order', () => {
  assert.equal(nextFreeStep({ anchorAt: t0, now: at(23) }), null);
  assert.deepEqual(nextFreeStep({ anchorAt: t0, now: at(24) }), { key: 'd1', skip: [] });
  const sends = [{ step: 'd1', status: 'sent', at: at(24) }];
  assert.equal(nextFreeStep({ anchorAt: t0, sends, now: at(71) }), null);
  assert.deepEqual(nextFreeStep({ anchorAt: t0, sends, now: at(72) }), { key: 'd3', skip: [] });
});

test('free track: a converted client gets nothing', () => {
  assert.equal(nextFreeStep({ anchorAt: t0, now: at(30), converted: true }), null);
});

test('free track: steps missed while the sweep was down are skipped, only the latest is sent', () => {
  assert.deepEqual(nextFreeStep({ anchorAt: t0, now: at(150) }), { key: 'd6', skip: ['d1', 'd3'] });
});

test('free track: never two emails inside 20 hours, skipped rows do not count as sends', () => {
  assert.equal(nextFreeStep({ anchorAt: t0, sends: [{ step: 'd1', status: 'sent', at: at(60) }], now: at(72) }), null);
  assert.deepEqual(nextFreeStep({ anchorAt: t0, sends: [{ step: 'd1', status: 'skipped', at: at(71) }], now: at(72) }), { key: 'd3', skip: [] });
});

test('free track: ends a week after the last step', () => {
  const sends = FREE_STEPS.slice(0, 4).map(s => ({ step: s.key, status: 'sent', at: at(s.afterHours) }));
  assert.deepEqual(nextFreeStep({ anchorAt: t0, sends, now: at(400) }), { key: 'd16', skip: [] });
  assert.equal(nextFreeStep({ anchorAt: t0, sends, now: at(384 + 7 * 24 + 1) }), null);
});

test('paid track: how-to after the first payment, membership pitch after the second unless a member', () => {
  assert.equal(nextPaidStep({ firstPaidAt: t0, now: at(0.25) }), null);
  assert.deepEqual(nextPaidStep({ firstPaidAt: t0, now: at(1) }), { key: 'paid_howto', skip: [] });
  assert.equal(nextPaidStep({ firstPaidAt: t0, now: at(8 * 24) }), null);
  const sends = [{ step: 'paid_howto', status: 'sent', at: at(1) }];
  assert.deepEqual(nextPaidStep({ firstPaidAt: t0, secondPaidAt: at(48), sends, now: at(50) }), { key: 'membership_pitch', skip: [] });
  assert.equal(nextPaidStep({ firstPaidAt: t0, secondPaidAt: at(48), sends, member: true, now: at(50) }), null);
  // both payments before the first sweep saw them: the pitch wins and the how-to is skipped
  assert.deepEqual(nextPaidStep({ firstPaidAt: t0, secondPaidAt: at(2), now: at(4) }), { key: 'membership_pitch', skip: ['paid_howto'] });
});

test('case studies match on product words, with an optional default', () => {
  const list = parseCaseStudies(JSON.stringify([
    { keywords: ['hoodie', 'crewneck'], title: 'Heavyweight hoodie', summary: '250 units' },
    { keywords: ['plush'], title: 'Plush run', summary: '500 units' },
    { default: true, title: 'Anything', summary: 'fallback' },
    { title: 'missing summary' }
  ]));
  assert.equal(list.length, 3);
  assert.equal(pickCaseStudy('Oversized Hoodie v2', list).title, 'Heavyweight hoodie');
  assert.equal(pickCaseStudy('Bear PLUSH', list).title, 'Plush run');
  assert.equal(pickCaseStudy('Trucker cap', list).title, 'Anything');
  assert.equal(pickCaseStudy('Cap', []), null);
  assert.deepEqual(parseCaseStudies('not json'), []);
});

test('unsubscribe tokens are tied to the client and the secret', () => {
  const id = '6f1c1d3e-2a4b-4c5d-8e9f-0a1b2c3d4e5f', tok = unsubscribeToken(id, 's3cret');
  assert.equal(validUnsubscribeToken(id, tok, 's3cret'), true);
  assert.equal(validUnsubscribeToken(id, tok, 'other'), false);
  assert.equal(validUnsubscribeToken('7f1c1d3e-2a4b-4c5d-8e9f-0a1b2c3d4e5f', tok, 's3cret'), false);
  assert.equal(validUnsubscribeToken(id, '', 's3cret'), false);
});

test('every step renders, escapes the product name and links the pack', () => {
  const ctx = { first: 'Sam', productTitle: '<Hoodie> & co', packLink: 'https://hub.example/tech-packs/1', startLink: 'https://hub.example/start', packDollars: '48', membershipUrl: 'https://shop.example/m', signer: 'Kyle' };
  for (const key of ['d1', 'd3', 'd6', 'd10', 'd16', 'paid_howto', 'membership_pitch']) {
    const m = nurtureEmail(key, ctx);
    assert.ok(m.subject, key);
    assert.ok(!m.html.includes('<Hoodie>'), `${key} escapes the title`);
    if (key !== 'd10' && key !== 'membership_pitch') assert.ok(m.html.includes(ctx.packLink), `${key} links the pack`);
  }
  assert.equal(nurtureEmail('d10', ctx).plain, true);
  assert.ok(nurtureEmail('membership_pitch', ctx).html.includes(ctx.membershipUrl));
  assert.ok(!nurtureEmail('d3', { ...ctx, membershipUrl: '' }).html.includes('$100'));
  assert.ok(nurtureEmail('d6', { ...ctx, caseStudy: { title: 'Plush run', summary: '500 units' } }).html.includes('Plush run'));
  assert.throws(() => nurtureEmail('nope', ctx));
});

test('marketing footer carries the unsubscribe link and address', () => {
  const f = marketingFooter({ unsubscribeUrl: 'https://hub.example/email/unsubscribe?c=1&t=2', address: '281 Geary St' });
  assert.ok(f.includes('c=1&amp;t=2'));
  assert.ok(f.includes('281 Geary St'));
});
