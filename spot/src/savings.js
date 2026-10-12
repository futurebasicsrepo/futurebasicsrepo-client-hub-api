// "Spot got you $X back": money that actually came back or never left,
// added up across an account's Spots. Only what Spot did and can show:
//   price_drop  the store lowered its price after the order and paid the
//               difference back (pricewatch.js → refund reason price_adjustment)
//   code        a promo code Spot found took money off at the store's own
//               checkout (fulfill/ucp.js records code_off_cents)
// Not counted: the cushion held for tax and price changes coming back (it
// was never spent), refunds for canceled or returned orders.
const DONE = ['card_issued', 'completed'];

export function savingsOf(carts) {
  const items = [];
  for (const c of carts || []) {
    const title = c.items?.[0]?.title || 'Your order';
    const store = c.merchant?.name || '';
    for (const r of c.refunds || []) {
      if (r.reason === 'price_adjustment' && r.state === 'done' && r.amount_cents > 0) items.push({ kind: 'price_drop', cents: r.amount_cents, title, store, at: r.done_at || r.at, token: c.token });
    }
    const off = Number(c.fulfillment?.code_off_cents) || 0;
    if (off > 0 && DONE.includes(c.status)) items.push({ kind: 'code', cents: off, code: c.fulfillment.code || null, title, store, at: c.fulfillment.placed_at || c.paid_at, token: c.token });
  }
  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  const sum = (k) => items.filter((i) => !k || i.kind === k).reduce((n, i) => n + i.cents, 0);
  return { total_cents: sum(), price_drops_cents: sum('price_drop'), codes_cents: sum('code'), count: items.length, items: items.slice(0, 20) };
}
