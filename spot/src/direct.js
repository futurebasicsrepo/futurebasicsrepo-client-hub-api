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
//   quote(cart, ship)      → { total_cents, subtotal_cents, shipping_cents, tax_cents } | null
import { buyer, discover, orderRef, shipTo, link, resolveItems, selectShipping, state, totalOf, ucpClient } from './fulfill/ucp.js';
import { CartError } from './cart.js';

export function createDirect({ profileUrl, fetchImpl = fetch, allowPrivate = false, sign = null, shopifyAuth = null } = {}) {
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
  // With a buyer on the page, Shopify stores get Spot's agent token (and that buyer's IP).
  const client = async (d, buyerIp = null) => {
    const auth = buyerIp && shopifyAuth ? await shopifyAuth.headersFor(d.endpoint, buyerIp).catch(() => null) : null;
    return ucpClient({ endpoint: d.endpoint, transport: d.transport, profileUrl: typeof profileUrl === 'function' ? profileUrl() : profileUrl, fetchImpl, allowPrivate, sign, auth });
  };

  return {
    async supports(url) {
      const d = url ? await discovery(url) : null;
      return Boolean(d?.lookup);
    },

    // Before a link goes out: the store finds every item, in that size or
    // colour, in stock. Returns the items with their product links filled in.
    async verify(cart, { buyerIp = null } = {}) {
      const d = cart.merchant?.url ? await discovery(cart.merchant.url) : null;
      if (!d?.lookup) return { ok: false, reason: 'no_direct' };
      const r = await resolveItems(await client(d, buyerIp), cart, { fetchImpl, allowPrivate }).catch(() => null);
      if (r?.lines) return { ok: true, items: r.items || cart.items };
      return { ok: false, reason: r?.not_found ? 'not_found' : r?.choose ? 'choose' : r?.unresolved ? 'unavailable' : 'not_found', choose: r?.choose || null, item: r?.unresolved || cart.items.find((i) => !i.url)?.title || cart.items[0]?.title };
    },

    // What the store will really charge for this cart shipped to `ship`:
    // its own checkout with the cheapest shipping and the tax for that
    // address, read and then cancelled. Null when the store can't say, so
    // the caller keeps the estimate.
    async quote(cart, ship, { buyerIp = null } = {}) {
      const d = ship && cart.merchant?.url ? await discovery(cart.merchant.url) : null;
      if (!d?.lookup) return null;
      let call = null;
      let co = null;
      try {
        call = await client(d, buyerIp);
        const resolved = await resolveItems(call, cart, { fetchImpl, allowPrivate });
        if (!resolved?.lines) return null;
        co = await call('POST', '/checkout-sessions', { line_items: resolved.lines, buyer: buyer(ship) });
        if (d.fulfillment) {
          co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, ship, shipTo(co, ship)));
          const pick = selectShipping(co);
          if (pick) co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, ship, pick));
          // A total without a chosen shipping option leaves shipping out.
          const shipping = (co.fulfillment?.methods || []).find((m) => m.type === 'shipping');
          if (!shipping?.groups?.length || !shipping.groups.every((g) => g.selected_option_id)) return null;
        }
        const total = totalOf(co);
        if (total == null || (co.currency && co.currency !== 'USD')) return null;
        const amount = (type) => co.totals?.find((t) => t.type === type)?.amount ?? null;
        return { total_cents: total, subtotal_cents: amount('subtotal'), shipping_cents: amount('fulfillment') ?? 0, tax_cents: amount('tax') ?? 0 };
      } catch (err) {
        console.error('store quote failed', cart.merchant?.url, err?.message);
        return null;
      } finally {
        if (co?.id && call) await call('POST', `/checkout-sessions/${encodeURIComponent(co.id)}/cancel`, {}).catch(() => {});
      }
    },

    // Builds the store's checkout for this cart: its items, shipped to the
    // requester. The buyer is the payer (the store sends them its receipt).
    async start(cart, opts = {}) {
      try {
        return await this._start(cart, opts);
      } catch (err) {
        if (err instanceof CartError) throw err;
        // The store's checkout failed: say so plainly (and log why), never "Something went wrong".
        console.error('direct start failed', cart.token, err?.message);
        throw new CartError(`${cart.merchant.name}’s checkout didn’t answer just now. Try again in a minute.`, 502);
      }
    },

    async _start(cart, { email = null, buyerIp = null } = {}) {
      const d = await discovery(cart.merchant.url);
      if (!d?.lookup) throw new CartError(`${cart.merchant.name} doesn’t take direct checkout`, 409);
      const ship = cart.requester.shipping;
      if (!ship) throw new CartError(`${cart.requester.name} hasn’t said where to ship it yet`, 409);
      const call = await client(d, buyerIp);
      const resolved = await resolveItems(call, cart, { fetchImpl, allowPrivate }).catch(() => null);
      if (!resolved?.lines) {
        console.error('direct start: items not resolved', cart.token, JSON.stringify(resolved));
        throw new CartError(
          resolved?.choose
            ? `${cart.requester.name} still needs to pick a ${resolved.choose.name.toLowerCase()} for "${resolved.unresolved}" (${resolved.choose.values.join(', ')}). Ask them to send a new link.`
            : resolved?.unresolved
              ? `${cart.merchant.name} doesn’t have "${resolved.unresolved}" in that size or color right now`
              : `${cart.merchant.name} couldn’t find these items`,
          409,
        );
      }
      const who = { ...ship, email: email || ship.email };
      let co = await call('POST', '/checkout-sessions', { line_items: resolved.lines, buyer: buyer(who) });
      if (d.fulfillment) {
        co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, who, shipTo(co, ship)));
        const pick = selectShipping(co);
        if (pick) co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, who, pick));
      }
      const continueUrl = link(co.continue_url, allowPrivate);
      if (!continueUrl) throw new CartError(`${cart.merchant.name} didn’t give a checkout page to pay on`, 502);
      return { checkout_id: co.id, endpoint: d.endpoint, transport: d.transport, buyer_ip: buyerIp || null, continue_url: continueUrl, total_cents: totalOf(co), currency: co.currency || 'USD' };
    },

    async status(direct) {
      const d = { endpoint: direct.endpoint, transport: direct.transport || 'rest' };
      // Same buyer as the checkout was made for, so the same tier can read it.
      const co = await (await client(d, direct.buyer_ip || null))('GET', `/checkout-sessions/${encodeURIComponent(direct.checkout_id)}`);
      return {
        status: co.status,
        total_cents: totalOf(co),
        order_number: orderRef(co.order),
        order_url: link(co.order?.permalink_url, allowPrivate),
      };
    },
  };
}
