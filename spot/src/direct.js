// Pay the store directly (settle: 'direct').
//
// For stores that speak UCP (ucp.dev), Spot builds the store's own checkout
// (the cart's items, shipped to the requester) and hands the payer the
// store's checkout link (continue_url). The payer pays the store there, so
// the store is the seller and merchant of record, and Spot never holds the
// money or sees a card number. Spot then follows the checkout until the
// store reports it completed, and the cart completes with the store's order.
//
//   supports(url)          → does this store take UCP checkout?
//   start(cart, { email }) → { checkout_id, continue_url, total_cents }
//   status(checkoutId)     → { status, order_number, order_url, total_cents }
import { buyer, discover, shipTo, link, resolveItems, selectShipping, state, totalOf, ucpClient } from './fulfill/ucp.js';
import { CartError } from './cart.js';

export function createDirect({ profileUrl, fetchImpl = fetch, allowPrivate = false, sign = null } = {}) {
  const found = new Map(); // origin → { at, discovery } (stores rarely change)
  async function discovery(url) {
    let origin;
    try {
      origin = new URL(url).origin;
    } catch {
      return null;
    }
    const hit = found.get(origin);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.discovery;
    const d = await discover(origin, { fetchImpl, allowPrivate }).catch(() => null);
    found.set(origin, { at: Date.now(), discovery: d });
    if (found.size > 1000) found.delete(found.keys().next().value);
    return d;
  }
  const client = (d) => ucpClient({ endpoint: d.endpoint, transport: d.transport, profileUrl: typeof profileUrl === 'function' ? profileUrl() : profileUrl, fetchImpl, allowPrivate, sign });

  return {
    async supports(url) {
      const d = url ? await discovery(url) : null;
      return Boolean(d?.lookup);
    },

    // Builds the store's checkout for this cart: its items, shipped to the
    // requester. The buyer is the payer (the store sends them its receipt).
    async start(cart, { email = null } = {}) {
      const d = await discovery(cart.merchant.url);
      if (!d?.lookup) throw new CartError(`${cart.merchant.name} doesn’t take direct checkout`, 409);
      const ship = cart.requester.shipping;
      if (!ship) throw new CartError(`${cart.requester.name} hasn’t said where to ship it yet`, 409);
      const call = client(d);
      const resolved = await resolveItems(call, cart, { fetchImpl, allowPrivate }).catch(() => null);
      if (!resolved?.lines) throw new CartError(resolved?.unresolved ? `${cart.merchant.name} doesn’t have "${resolved.unresolved}" in that size or color right now` : `${cart.merchant.name} couldn’t find these items`, 409);
      const who = { ...ship, email: email || ship.email };
      let co = await call('POST', '/checkout-sessions', { line_items: resolved.lines, buyer: buyer(who) });
      if (d.fulfillment) {
        co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, who, shipTo(co, ship)));
        const pick = selectShipping(co);
        if (pick) co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, who, pick));
      }
      const continueUrl = link(co.continue_url, allowPrivate);
      if (!continueUrl) throw new CartError(`${cart.merchant.name} didn’t give a checkout page to pay on`, 502);
      return { checkout_id: co.id, endpoint: d.endpoint, transport: d.transport, continue_url: continueUrl, total_cents: totalOf(co), currency: co.currency || 'USD' };
    },

    async status(direct) {
      const d = { endpoint: direct.endpoint, transport: direct.transport || 'rest' };
      const co = await client(d)('GET', `/checkout-sessions/${encodeURIComponent(direct.checkout_id)}`);
      return {
        status: co.status,
        total_cents: totalOf(co),
        order_number: co.order?.id || null,
        order_url: link(co.order?.permalink_url, allowPrivate),
      };
    },
  };
}
