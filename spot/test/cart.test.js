import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKED_CATEGORIES, authLimitCents, computeTotals, goodsCents, decideAuthorization, dollarsToCents, handoffLinks,
  merchantMatches, transition, validateCart,
} from '../src/cart.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const base = () => ({
  requester: { name: 'Kyle', email: 'k@x.com', venmo: '@kyle-b' },
  merchant: { name: 'Nike', url: 'https://www.nike.com' },
  items: [{ title: 'Pegasus 41', variant: '10.5', quantity: 1, price_cents: 14000 }],
  extras_cents: 1200,
});

test('totals: fee is on items + extras; the payer also covers the cushion (unused comes back); zero for handoff', () => {
  const items = [{ price_cents: 2500, quantity: 2 }];
  assert.deepEqual(computeTotals(items, 500, 'card', cfg), { subtotal_cents: 5000, extras_cents: 500, cart_cents: 5500, cushion_cents: 275, fee_cents: 220, total_cents: 5995 });
  assert.equal(computeTotals(items, 500, 'card', cfg, { cushion: false }).total_cents, 5720, 'flights: exact fare, no cushion');
  const h = computeTotals(items, 0, 'handoff', cfg);
  assert.equal(h.fee_cents, 0);
  assert.equal(h.cushion_cents, 0);
  // The card can never spend more than the payer paid for the goods.
  const big = computeTotals([{ price_cents: 100000, quantity: 1 }], 0, 'card', cfg);
  assert.equal(big.cushion_cents, 1500);
  assert.equal(authLimitCents(big.cart_cents), goodsCents(big));
});

test('validate: normalises a good cart', () => {
  const v = validateCart(base(), cfg);
  assert.equal(v.settle, 'card');
  assert.equal(v.requester.venmo, 'kyle-b');
  assert.equal(v.cart_cents, 15200);
  assert.equal(v.cushion_cents, 760);
  assert.equal(v.total_cents, 15200 + 760 + 608);
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
  // Never on one generic word of the store's name.
  assert.ok(!merchantMatches({ name: 'Blue Bottle Coffee' }, { name: 'STARBUCKS COFFEE 1234' }));
  assert.ok(!merchantMatches({ name: 'Blue Bottle Coffee' }, { name: 'BLUE APRON' }));
  // How big stores show up on statements.
  assert.ok(merchantMatches({ name: 'Amazon', url: 'https://www.amazon.com' }, { name: 'AMZN Mktp US' }));
  assert.ok(merchantMatches({ name: 'Walmart' }, { name: 'WM SUPERCENTER #123' }));
  assert.ok(merchantMatches({ name: 'Gap', url: 'https://www.gap.com' }, { name: 'GAP US 1234' }), 'short names match as a whole word');
  assert.ok(!merchantMatches({ name: 'Gap', url: 'https://www.gap.com' }, { name: 'SINGAPORE AIR' }));
});

test('authorization: cash-like merchants are declined by category', () => {
  const cart = { status: 'card_issued', cart_cents: 10000, merchant: { name: 'Target', url: 'https://target.com' } };
  const at = (merchant) => decideAuthorization(cart, { amount_cents: 5000, currency: 'usd', merchant: { name: 'TARGET 1234', ...merchant } });
  assert.equal(at({}).reason, 'ok');
  assert.equal(at({ category_code: '6540' }).reason, 'blocked_category', 'stored value load');
  assert.equal(at({ category_code: '6051' }).reason, 'blocked_category', 'quasi-cash');
  assert.equal(at({ category: 'wires_money_orders' }).reason, 'blocked_category');
  assert.ok(BLOCKED_CATEGORIES.includes('non_fi_stored_value_card_purchase_load'));
});

test('validate: card carts refuse gift cards and other cash equivalents', () => {
  const withItem = (title, settle = 'card') => validateCart({ ...base(), settle, items: [{ title, price_cents: 5000 }] }, cfg);
  for (const t of ['Target GiftCard $50', 'Amazon eGift Card', 'Vanilla Visa Gift Card', 'Prepaid Visa $100', 'Apple Gift Card', 'Bitcoin voucher']) {
    assert.throws(() => withItem(t), /gift cards|cash equivalents/, t);
  }
  assert.ok(withItem('Gift wrap ribbon set'), 'not a gift card');
  assert.ok(withItem('Nike Air Max 90'));
  assert.ok(withItem('Amazon eGift Card', 'handoff'), 'money never goes through Spot for handoff');
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

test('state machine: every full refund passes through `refunding`', () => {
  for (const from of ['paid', 'card_issued', 'completed']) assert.equal(transition(from, 'begin_refund', 'card'), 'refunding');
  assert.equal(transition('refunding', 'refund', 'card'), 'refunded');
  assert.throws(() => transition('card_issued', 'refund', 'card'), /Can't refund/, 'no shortcut past refunding');
  assert.throws(() => transition('refunding', 'spend', 'card'), /Can't spend/, 'no charge once a refund has started');
});
