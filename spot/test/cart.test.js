import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authLimitCents, computeTotals, decideAuthorization, dollarsToCents, handoffLinks,
  merchantMatches, transition, validateCart,
} from '../src/cart.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const base = () => ({
  requester: { name: 'Kyle', email: 'k@x.com', venmo: '@kyle-b' },
  merchant: { name: 'Nike', url: 'https://www.nike.com' },
  items: [{ title: 'Pegasus 41', variant: '10.5', quantity: 1, price_cents: 14000 }],
  extras_cents: 1200,
});

test('totals: fee is on items + extras, zero for handoff', () => {
  const items = [{ price_cents: 2500, quantity: 2 }];
  assert.deepEqual(computeTotals(items, 500, 'card', cfg), { subtotal_cents: 5000, extras_cents: 500, cart_cents: 5500, fee_cents: 220, total_cents: 5720 });
  assert.equal(computeTotals(items, 0, 'handoff', cfg).fee_cents, 0);
});

test('validate: normalises a good cart', () => {
  const v = validateCart(base(), cfg);
  assert.equal(v.settle, 'card');
  assert.equal(v.requester.venmo, 'kyle-b');
  assert.equal(v.cart_cents, 15200);
  assert.equal(v.total_cents, 15200 + 608);
});

test('validate: rejects bad input', () => {
  const bad = (patch, re) => assert.throws(() => validateCart({ ...base(), ...patch }, cfg), re);
  bad({ requester: {} }, /name is required/);
  bad({ merchant: '' }, /Which store/);
  bad({ items: [] }, /at least one item/);
  bad({ items: [{ title: 'x', price_cents: 0 }] }, /needs a price/);
  bad({ items: [{ title: 'x', price_cents: 12.5 }] }, /needs a price/);
  bad({ items: [{ title: 'x', price_cents: 100, quantity: 50 }] }, /quantity/);
  bad({ items: [{ title: 'x', price_cents: 60000 }] }, /capped/);
  bad({ settle: 'handoff', requester: { name: 'K' } }, /Venmo handle or \$cashtag/);
  bad({ requester: { name: 'K', venmo: 'no spaces allowed' } }, /Venmo handle/);
  assert.equal(validateCart({ ...base(), items: [{ title: 'x', price_cents: 100, image_url: 'javascript:alert(1)' }] }, cfg).items[0].image_url, null);
});

test('state machine', () => {
  assert.equal(transition('open', 'pay', 'card'), 'paid');
  assert.equal(transition('paid', 'issue', 'card'), 'card_issued');
  assert.equal(transition('card_issued', 'spend', 'card'), 'completed');
  assert.equal(transition('open', 'mark_received', 'handoff'), 'completed');
  assert.throws(() => transition('completed', 'spend', 'card'), /Can't spend/);
  assert.throws(() => transition('open', 'pay', 'handoff'), /Venmo/);
  assert.throws(() => transition('open', 'mark_received', 'card'), /card is used/);
  assert.throws(() => transition('expired', 'pay', 'card'), /expired/);
});

test('merchant matching handles messy network names', () => {
  const nike = { name: 'Nike', url: 'https://www.nike.com' };
  assert.ok(merchantMatches(nike, { name: 'NIKE.COM' }));
  assert.ok(merchantMatches(nike, { name: 'NIKE 8291 PORTLAND OR' }));
  assert.ok(merchantMatches({ name: 'Blue Bottle Coffee' }, { name: 'SQ *BLUE BOTTLE' }));
  assert.ok(merchantMatches({ name: 'Aritzia', url: 'https://aritzia.com' }, { name: 'ARITZIA LP', url: 'aritzia.com' }));
  assert.ok(merchantMatches({ name: 'Glossier', url: 'https://www.glossier.com' }, { name: 'WWW.GLOSSIER.COM' }));
  assert.ok(!merchantMatches(nike, { name: 'BEST BUY 00123' }));
  assert.ok(!merchantMatches(nike, { name: 'AMAZON MKTPL' }));
  assert.ok(!merchantMatches({ name: 'The Shop' }, { name: 'THE SHOP ANYWHERE' }), 'stopwords alone never match');
});

test('authorization: single use, merchant locked, capped', () => {
  const cart = { status: 'card_issued', cart_cents: 10000, merchant: { name: 'Nike', url: 'https://nike.com' } };
  const at = (amount_cents, name, extra = {}) => decideAuthorization({ ...cart, ...extra }, { amount_cents, currency: 'usd', merchant: { name } });
  assert.equal(authLimitCents(10000), 10500);
  assert.equal(authLimitCents(100000), 101500, 'tolerance capped at $15');
  assert.deepEqual(at(10000, 'NIKE.COM'), { approved: true, reason: 'ok' });
  assert.equal(at(10500, 'NIKE.COM').approved, true);
  assert.equal(at(10501, 'NIKE.COM').reason, 'over_limit');
  assert.equal(at(5000, 'CASH APP*JOHN').reason, 'wrong_merchant');
  assert.equal(at(5000, 'NIKE.COM', { status: 'completed' }).reason, 'card_not_active');
  assert.equal(decideAuthorization(cart, { amount_cents: 100, currency: 'eur', merchant: { name: 'NIKE' } }).reason, 'currency');
  assert.equal(decideAuthorization(null, {}).reason, 'unknown_card');
});

test('handoff links prefill amount and note', () => {
  const links = handoffLinks({ cart_cents: 8450, merchant: { name: 'Aritzia' }, requester: { venmo: 'kyle-b', cashtag: 'kyleb' } });
  assert.equal(links[0].url, 'https://venmo.com/u/kyle-b?txn=pay&amount=84.50&note=Spot%3A%20Aritzia%20cart');
  assert.equal(links[1].url, 'https://cash.app/$kyleb/84.50');
});

test('dollarsToCents', () => {
  assert.equal(dollarsToCents('$1,234.5'), 123450);
  assert.equal(dollarsToCents('84.99'), 8499);
  assert.equal(dollarsToCents(19.99), 1999);
  assert.equal(dollarsToCents(''), null);
});
