import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOfferSubmission, normalizeOfferAmount, nextOfferMove } from '../src/offers.js';

const offer = (status, amount, extra = {}) => ({ status, current_amount_cents: amount, awaiting_counter_payment: false, ...extra });

test('submission requires name and email', () => {
  assert.throws(() => normalizeOfferSubmission({}), /name/);
  assert.throws(() => normalizeOfferSubmission({ buyer_name: 'Kai', buyer_email: 'nope' }), /email/);
  const ok = normalizeOfferSubmission({ buyer_name: 'Kai', buyer_email: 'K@X.io', quantity: '2' });
  assert.equal(ok.buyer_email, 'k@x.io');
  assert.equal(ok.quantity, 2);
});

test('offer amount must be sane and, given bounds, within the allowed window', () => {
  assert.throws(() => normalizeOfferAmount(5), /between/);
  assert.throws(() => normalizeOfferAmount('abc'), /between/);
  assert.throws(() => normalizeOfferAmount(4000, { listPriceCents: 10000, minPercent: 50 }), /below/);
  assert.throws(() => normalizeOfferAmount(10000, { listPriceCents: 10000 }), /list price/);
  assert.equal(normalizeOfferAmount(6000, { listPriceCents: 10000, minPercent: 50 }), 6000);
});

test('payment confirmation moves an open offer into store review with a 24h clock', () => {
  const m = nextOfferMove(offer('awaiting_payment', 6000), { by: 'system', action: 'paid' });
  assert.equal(m.patch.status, 'pending_review');
  assert.ok(m.patch.respond_by instanceof Date);
  assert.equal(m.settlement, null);
  assert.throws(() => nextOfferMove(offer('pending_review', 6000), { by: 'system', action: 'paid' }), /not awaiting payment/);
  assert.throws(() => nextOfferMove(offer('awaiting_payment', 6000), { by: 'buyer', action: 'paid' }), /payment confirmation/);
});

test('paying the counter (final round) closes the deal and captures', () => {
  const m = nextOfferMove(offer('awaiting_payment', 8000, { awaiting_counter_payment: true }), { by: 'system', action: 'paid' });
  assert.equal(m.patch.status, 'accepted');
  assert.equal(m.patch.agreed_cents, 8000);
  assert.equal(m.settlement, 'capture');
});

test('only the store can counter, and only while pending review', () => {
  const m = nextOfferMove(offer('pending_review', 6000), { by: 'store', action: 'counter', amountCents: 8000 });
  assert.equal(m.patch.status, 'countered');
  assert.equal(m.patch.current_amount_cents, 8000);
  assert.equal(m.settlement, 'release_hold');
  assert.throws(() => nextOfferMove(offer('pending_review', 6000), { by: 'buyer', action: 'counter', amountCents: 8000 }), /Only the shop/);
  assert.throws(() => nextOfferMove(offer('countered', 6000), { by: 'store', action: 'counter', amountCents: 9000 }), /awaiting your response/);
});

test('store accepting captures; buyer accepting a counter opens a fresh checkout', () => {
  const storeAccept = nextOfferMove(offer('pending_review', 6000), { by: 'store', action: 'accept' });
  assert.equal(storeAccept.patch.status, 'accepted');
  assert.equal(storeAccept.settlement, 'capture');

  const buyerAccept = nextOfferMove(offer('countered', 8000), { by: 'buyer', action: 'accept' });
  assert.equal(buyerAccept.patch.status, 'awaiting_payment');
  assert.equal(buyerAccept.patch.awaiting_counter_payment, true);
  assert.equal(buyerAccept.settlement, 'create_counter_checkout');
  assert.throws(() => nextOfferMove(offer('pending_review', 6000), { by: 'buyer', action: 'accept' }), /counter to accept/);
});

test('declines release any hold and close the ticket', () => {
  const storeDecline = nextOfferMove(offer('pending_review', 6000), { by: 'store', action: 'decline' });
  assert.equal(storeDecline.patch.status, 'declined');
  assert.equal(storeDecline.settlement, 'release_hold');
  const buyerDecline = nextOfferMove(offer('countered', 8000), { by: 'buyer', action: 'decline' });
  assert.equal(buyerDecline.patch.status, 'declined');
  assert.equal(buyerDecline.settlement, null);
});

test('expiry only fires for the system, on an open turn, and releases a store-side hold', () => {
  assert.throws(() => nextOfferMove(offer('pending_review', 6000), { by: 'buyer', action: 'expire' }), /Only the system/);
  const storeExpiry = nextOfferMove(offer('pending_review', 6000), { by: 'system', action: 'expire' });
  assert.equal(storeExpiry.patch.status, 'expired');
  assert.equal(storeExpiry.settlement, 'release_hold');
  const buyerExpiry = nextOfferMove(offer('countered', 8000), { by: 'system', action: 'expire' });
  assert.equal(buyerExpiry.patch.status, 'expired');
  assert.equal(buyerExpiry.settlement, null);
});

test('an abandoned checkout cancels (or expires, if it was the counter round)', () => {
  const abandoned = nextOfferMove(offer('awaiting_payment', 6000), { by: 'system', action: 'cancel' });
  assert.equal(abandoned.patch.status, 'cancelled');
  const abandonedCounter = nextOfferMove(offer('awaiting_payment', 8000, { awaiting_counter_payment: true }), { by: 'system', action: 'cancel' });
  assert.equal(abandonedCounter.patch.status, 'expired');
});

test('closed tickets reject further moves', () => {
  assert.throws(() => nextOfferMove(offer('accepted', 6000), { by: 'store', action: 'counter', amountCents: 100 }), /accepted/);
  assert.throws(() => nextOfferMove(offer('declined', 6000), { by: 'buyer', action: 'accept' }), /declined/);
});
