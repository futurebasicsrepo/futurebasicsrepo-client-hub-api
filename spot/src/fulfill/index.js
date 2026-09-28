// Fulfilment: after the cart is paid and its one-time card exists, place
// the order at the store for the requester.
//
//   UCP store      → the store's checkout API (ucp.dev): no browser, no
//                    AI, runs even with the agent off; pays with the card
//                    through the store's tokenizer, or hands over its
//                    prefilled checkout (continue_url)
//   Shopify store  → cart + checkout built from the store's own product
//                    data (no AI), then the agent does the payment step
//   any other store → the agent starts from the product page
//   agent off / stuck → "needs you": Spot retries, or refunds the payer when
//                    it can't order in time (spot.sweepMoney). The card is
//                    Spot's and is never shown to anyone.
//
// The card number is fetched only at the payment step (getCard) and never
// logged, stored or sent to a browser; screenshots mask card fields.
// Job state lives on the cart (cart.fulfillment) so the requester's page and
// the agent API can both read it. The live browser session and the pending
// confirmation live in memory: a restart mid-checkout ends that attempt and
// the requester can start again.
import { runCheckoutAgent } from './agent.js';
import { checkoutUrl, resolveShopifyCart } from './shopify.js';
import { discover, runUcpCheckout } from './ucp.js';
import { authLimitCents } from '../cart.js';

const CONFIRM_TIMEOUT_MS = 10 * 60_000;

export function validateShipping(s) {
  const f = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const out = {
    name: f(s?.name, 80),
    line1: f(s?.line1, 120),
    line2: f(s?.line2, 120),
    city: f(s?.city, 60),
    state: f(s?.state, 30),
    postal_code: f(s?.postal_code, 12),
    email: f(s?.email, 200).toLowerCase(),
    phone: f(s?.phone, 30),
  };
  const missing = ['name', 'line1', 'city', 'state', 'postal_code', 'email'].filter((k) => !out[k]);
  if (missing.length) throw Object.assign(new Error(`Shipping needs: ${missing.join(', ')}`), { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw Object.assign(new Error('That email looks wrong'), { status: 400 });
  return out;
}

export function createFulfiller({ spot, provider, env = process.env, launch, client, log = console, shopify = {}, ucp = {} }) {
  const pending = new Map(); // cartId → { resolve, timer }
  const shots = new Map(); // cartId → png Buffer
  const browsers = new Set();
  let running = 0;
  const maxJobs = Number(env.SPOT_AGENT_MAX || 2);
  const agentOn = () => env.SPOT_AGENT === 'on' && Boolean(client || env.ANTHROPIC_API_KEY);
  // The card's billing address: Spot's business address, as on the company
  // cardholder ("line1|city|state|zip"). Stores check it against the card.
  const billing = (() => {
    const [line1, city, state, postal_code] = String(env.SPOT_CARD_BILLING || '').split('|').map((x) => x.trim());
    return line1 && city && state && postal_code ? { name: env.SPOT_LEGAL_NAME || 'Spot', line1, city, state, postal_code } : null;
  })();
  const cardFor = (cartId) => () => provider.revealCard(spot.byId(cartId));

  const launchBrowser =
    launch ||
    (async () => {
      const { chromium } = await import('playwright');
      return chromium.launch({ args: ['--no-sandbox'] });
    });

  function update(cartId, patch, event) {
    return spot.patch(cartId, (c) => ({ ...c, fulfillment: { ...(c.fulfillment || {}), ...patch, updated_at: Date.now() } }), event);
  }

  function step(cartId, text) {
    spot.patch(cartId, (c) => {
      const f = c.fulfillment || {};
      const steps = [...(f.steps || []), { text, at: Date.now() }].slice(-12);
      return { ...c, fulfillment: { ...f, steps, updated_at: Date.now() } };
    });
  }

  // Waits (up to 10 minutes) for the requester to tap Place order.
  function askConfirm(cartId, { total_cents, summary, screenshot }) {
    return new Promise((resolve) => {
      if (screenshot) shots.set(cartId, screenshot);
      const timer = setTimeout(() => {
        pending.delete(cartId);
        resolve(false);
      }, CONFIRM_TIMEOUT_MS);
      timer.unref?.();
      pending.set(cartId, { resolve, timer });
      update(cartId, { state: 'awaiting_confirm', total_cents, summary, has_shot: Boolean(screenshot) }, 'order_awaiting_confirm');
      spot.emit?.('confirm_needed', cartId);
    });
  }

  function finish(cartId, outcome) {
    if (outcome.status === 'placed') {
      update(cartId, { state: 'placed', order_number: outcome.order_number, order_url: outcome.order_url || null, placed_at: Date.now() }, 'order_placed');
      spot.emit?.('ordered', cartId);
    } else if (outcome.status === 'cancelled') update(cartId, { state: 'cancelled', reason: outcome.reason }, 'order_cancelled');
    else {
      update(cartId, { state: 'needs_you', reason: outcome.reason, ...(outcome.manual_url ? { manual_url: outcome.manual_url } : {}) }, 'order_needs_you');
      spot.emit?.('needs_you', cartId);
    }
  }

  const ucpStore = (cart) => {
    const url = cart.merchant.url || cart.items.find((i) => i.url)?.url;
    return url ? discover(url, { fetchImpl: ucp.fetchImpl, allowPrivate: ucp.allowPrivate }) : null;
  };

  async function plan(cart, ship) {
    const resolved = await resolveShopifyCart(cart, shopify).catch(() => null);
    if (resolved?.lines) {
      const url = checkoutUrl(resolved.origin, resolved.lines, ship);
      return { method: 'shopify', start_url: url, manual_url: url };
    }
    const url = cart.items.find((i) => i.url)?.url || cart.merchant.url;
    return { method: 'agent', start_url: url || null, manual_url: url || null, note: resolved?.unresolved ? `Couldn't match the size/option for "${resolved.unresolved}"` : null };
  }

  return {
    agentEnabled: agentOn,

    // Can Spot buy at this cart's store at all? (Checked before taking the
    // payer's money.) UCP stores work without the browser agent.
    async canOrder(cart) {
      if (agentOn()) return true;
      return Boolean(await Promise.resolve(ucpStore(cart)).catch(() => null));
    },

    async start(cart, shippingInput) {
      if (cart.status !== 'card_issued') throw Object.assign(new Error(cart.status === 'open' ? 'Nobody has paid for this yet' : 'Spot’s card for this order isn’t ready yet'), { status: 409 });
      if (cart.dispute) throw Object.assign(new Error('This payment is disputed, so Spot won’t order it'), { status: 409 });
      const f = cart.fulfillment;
      if (f && ['starting', 'working', 'awaiting_confirm'].includes(f.state)) throw Object.assign(new Error('Already ordering'), { status: 409 });
      if (f?.state === 'placed') throw Object.assign(new Error('Already ordered'), { status: 409 });
      const ship = validateShipping(shippingInput);
      spot.patch(cart.id, (c) => ({ ...c, requester: { ...c.requester, shipping: ship } }));
      const store = await ucpStore(cart);
      if (store) {
        const started = update(cart.id, { state: 'working', method: 'ucp', manual_url: null, reason: null, steps: [{ text: `${cart.merchant.name} supports agent checkout (UCP)`, at: Date.now() }], started_at: Date.now() }, 'order_started');
        running++;
        this._runUcp(cart.id, store, ship).finally(() => running--);
        return started;
      }
      const p = await plan(cart, ship);

      if (!p.start_url) return update(cart.id, { state: 'needs_you', method: p.method, reason: 'No store link to start from', manual_url: null, steps: [] }, 'order_needs_you');
      if (!agentOn()) {
        return update(cart.id, { state: 'needs_you', method: p.method, reason: 'Automatic ordering is off right now', manual_url: p.manual_url, steps: [] }, 'order_needs_you');
      }
      if (running >= maxJobs) {
        return update(cart.id, { state: 'needs_you', method: p.method, reason: 'Spot is busy. Try again in a minute', manual_url: p.manual_url, steps: [] }, 'order_needs_you');
      }

      const started = update(cart.id, { state: 'working', method: p.method, manual_url: p.manual_url, reason: p.note, steps: [{ text: p.method === 'shopify' ? 'Built your cart at the store' : 'Opening the store', at: Date.now() }], started_at: Date.now() }, 'order_started');
      running++;
      this._run(cart.id, p, ship).finally(() => running--);
      return started;
    },

    // UCP first; if the store's catalog doesn't know the items, fall back to
    // the Shopify / browser routes as if UCP weren't there.
    async _runUcp(cartId, store, ship) {
      try {
        const cart = spot.byId(cartId);
        const outcome = await runUcpCheckout({
          discovery: store,
          cart,
          shipping: ship,
          getCard: cardFor(cartId),
          billing,
          profileUrl: typeof ucp.profileUrl === 'function' ? ucp.profileUrl() : ucp.profileUrl || `${env.PUBLIC_URL || 'http://localhost:3000'}/.well-known/ucp`,
          limit: authLimitCents(cart.cart_cents),
          fetchImpl: ucp.fetchImpl,
          allowPrivate: ucp.allowPrivate,
          sign: ucp.sign,
          progress: (t) => step(cartId, t),
          confirm: (c) => askConfirm(cartId, c),
        });
        if (outcome) return finish(cartId, outcome);
        const p = await plan(cart, ship);
        if (!agentOn() || !p.start_url) {
          return update(cartId, { state: 'needs_you', method: p.method, reason: p.start_url ? 'Automatic ordering is off right now' : 'No store link to start from', manual_url: p.manual_url }, 'order_needs_you');
        }
        step(cartId, 'Ordering through the store page instead');
        update(cartId, { method: p.method, manual_url: p.manual_url });
        return await this._run(cartId, p, ship);
      } catch (err) {
        log.error?.({ err, cart: cartId }, 'ucp checkout failed');
        update(cartId, { state: 'needs_you', reason: 'Automatic ordering hit a problem. Try again' }, 'order_needs_you');
      } finally {
        const w = pending.get(cartId);
        if (w) {
          clearTimeout(w.timer);
          pending.delete(cartId);
        }
      }
    },

    async _run(cartId, p, ship) {
      let browser;
      try {
        const cart = spot.byId(cartId);
        browser = await launchBrowser();
        browsers.add(browser);
        // Narrow window: stores serve their compact layout, and the confirm
        // screenshot stays readable on the requester's phone.
        const context = await browser.newContext({ locale: 'en-US', viewport: { width: 520, height: 1000 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const outcome = await runCheckoutAgent({
          page,
          cart,
          shipping: ship,
          getCard: cardFor(cartId),
          billing,
          startUrl: p.start_url,
          client,
          progress: (t) => step(cartId, t),
          confirm: (c) => askConfirm(cartId, c),
        });
        finish(cartId, outcome);
      } catch (err) {
        log.error?.({ err, cart: cartId }, 'checkout agent failed');
        update(cartId, { state: 'needs_you', reason: 'Automatic ordering hit a problem. Try again' }, 'order_needs_you');
      } finally {
        const w = pending.get(cartId);
        if (w) {
          clearTimeout(w.timer);
          pending.delete(cartId);
        }
        if (browser) browsers.delete(browser);
        await browser?.close().catch(() => {});
      }
    },

    // "For me" carts: the requester already gave their shipping address, so
    // ordering starts the moment the card is issued.
    async autoStart(cart) {
      if (cart.for !== 'self' || !cart.requester?.shipping || cart.status !== 'card_issued' || cart.fulfillment) return null;
      return this.start(cart, cart.requester.shipping);
    },

    confirm(cart, place) {
      const w = pending.get(cart.id);
      if (!w || cart.fulfillment?.state !== 'awaiting_confirm') throw Object.assign(new Error('Nothing is waiting for you to confirm'), { status: 409 });
      clearTimeout(w.timer);
      pending.delete(cart.id);
      update(cart.id, { state: place ? 'working' : 'cancelled', ...(place ? {} : { reason: 'You chose not to place the order' }) });
      if (place) spot.emit?.('approved', cart.id, { by: 'requester', how: 'placed_order', amount_cents: cart.fulfillment?.total_cents });
      w.resolve(Boolean(place));
      return spot.byId(cart.id);
    },

    screenshot: (cart) => shots.get(cart.id) || null,

    // Server shutdown: nothing is placed without a person, so waiting
    // checkouts are declined and their browsers closed.
    async close() {
      for (const [, w] of pending) {
        clearTimeout(w.timer);
        w.resolve(false);
      }
      pending.clear();
      await Promise.all([...browsers].map((b) => b.close().catch(() => {})));
    },
  };
}
