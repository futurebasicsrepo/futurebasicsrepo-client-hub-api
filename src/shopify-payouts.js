// Shopify Payments payouts: what Shopify paid into the bank, and what it kept in fees. Read-only; needs the app's `read_shopify_payments_payouts` scope.
export const PAYOUTS_QUERY = `query MoneyPayouts($after: String) {
  shopifyPaymentsAccount { payouts(first: 50, after: $after, reverse: true, sortKey: ISSUED_AT) {
    nodes { id legacyResourceId issuedAt status transactionType net { amount currencyCode }
      summary { chargesGross { amount } refundsFeeGross { amount } adjustmentsGross { amount } advanceGross { amount } reservedFundsGross { amount } retriedPayoutsGross { amount } } }
    pageInfo { hasNextPage endCursor } } } }`;

const cents = m => Math.round(Number(m?.amount || 0) * 100);

// One payout as a row. The fees are what is left between the money that moved (sales, refunds, adjustments, held and retried funds) and what was paid out,
// so they are right whichever way Shopify signs each fee line.
export function payoutRow(n) {
  const s = n?.summary || {}, net = cents(n?.net), charges = cents(s.chargesGross), refunds = cents(s.refundsFeeGross);
  const gross = charges + refunds + cents(s.adjustmentsGross) + cents(s.advanceGross) + cents(s.reservedFundsGross) + cents(s.retriedPayoutsGross);
  return { shopifyId: String(n?.id || ''), issuedOn: String(n?.issuedAt || '').slice(0, 10), status: String(n?.status || '').toLowerCase(), kind: String(n?.transactionType || '').toLowerCase(),
    currency: String(n?.net?.currencyCode || 'USD'), netCents: net, grossCents: gross, chargesCents: charges, refundsCents: refunds, feeCents: gross - net };
}

// What the Money page shows over a window: gross sales, fees (and what share of sales they are) and what reached the bank.
export function payoutTotals(rows, today, days) {
  const from = new Date(`${today}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - days); const since = from.toISOString().slice(0, 10);
  const mine = rows.filter(r => r.kind !== 'withdrawal' && r.status === 'paid' && r.issuedOn >= since), sum = k => mine.reduce((a, r) => a + Number(r[k] || 0), 0);
  const gross = sum('grossCents'), fees = sum('feeCents');
  return { payouts: mine.length, grossCents: gross, feeCents: fees, netCents: sum('netCents'), feePct: gross > 0 ? Math.round((fees / gross) * 1000) / 10 : null };
}

// Shopify's refusal for a missing scope reads "Access denied for shopifyPaymentsAccount field ... read_shopify_payments".
export const needsScope = msg => /access denied|access scope|read_shopify_payments/i.test(String(msg || ''));
