import test from 'node:test';
import assert from 'node:assert/strict';
import { payoutRow, payoutTotals, needsScope } from '../src/shopify-payouts.js';

const m = a => ({ amount: String(a), currencyCode: 'USD' });
const node = (id, issuedAt, net, charges, extra = {}) => ({ id, issuedAt, status: 'PAID', transactionType: 'DEPOSIT', net: m(net), summary: { chargesGross: m(charges), refundsFeeGross: m(extra.refunds ?? 0), adjustmentsGross: m(0), advanceGross: m(0), reservedFundsGross: m(0), retriedPayoutsGross: m(0) } });

test('a payout row: fees are what is left between the money that moved and what was paid out', () => {
  const r = payoutRow(node('gid://shopify/ShopifyPaymentsPayout/1', '2026-10-01T05:00:00Z', 967.10, 1000));
  assert.deepEqual([r.issuedOn, r.status, r.kind, r.netCents, r.grossCents, r.feeCents], ['2026-10-01', 'paid', 'deposit', 96710, 100000, 3290]);
  const refunded = payoutRow(node('2', '2026-10-02T00:00:00Z', 400, 500, { refunds: -60 }));
  assert.deepEqual([refunded.grossCents, refunded.refundsCents, refunded.feeCents], [44000, -6000, 4000], 'refunds reduce what moved, the rest is fees');
});

test('totals cover paid deposits inside the window only', () => {
  const rows = [node('1', '2026-10-01T00:00:00Z', 970, 1000), node('2', '2026-09-20T00:00:00Z', 485, 500), node('3', '2026-06-01T00:00:00Z', 97, 100), { ...node('4', '2026-10-05T00:00:00Z', 50, 50), status: 'SCHEDULED' }].map(payoutRow);
  const t = payoutTotals(rows, '2026-10-12', 30);
  assert.deepEqual([t.payouts, t.grossCents, t.feeCents, t.netCents, t.feePct], [2, 150000, 4500, 145500, 3]);
  assert.equal(payoutTotals([], '2026-10-12', 30).feePct, null);
});

test('a refusal for a missing scope is recognised', () => {
  assert.ok(needsScope('Access denied for shopifyPaymentsAccount field. Required access: the `read_shopify_payments` or the `read_shopify_payments_accounts` access scope.'));
  assert.ok(!needsScope('Shopify request failed (502)'));
});
