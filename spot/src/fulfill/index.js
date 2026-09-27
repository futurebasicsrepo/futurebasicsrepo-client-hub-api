// Fulfilment: after the cart is paid and its one-time card exists, place
// the order at the store for the requester.
//
//   Shopify store  → cart + checkout built from the store's own product
//                    data (no AI), then the agent does the payment step
//   any other store → the agent starts from the product page
//   agent off / stuck → "needs you": a prefilled checkout link + the card
//
// Job state lives on the cart (cart.fulfillment) so the requester's page and
// the agent API can both read it. The live browser session and the pending
// confirmation live in memory: a restart mid-checkout ends that attempt and
// the requester can start again.
import { runCheckoutAgent } from './agent.js';
import { checkoutUrl, resolveShopifyCart } from './shopify.js';

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

export function createFulfiller({ spot, provider, env = process.env, launch, client, log = console, shopify = {} }) {
  const pending = new Map(); // cartId → { resolve, timer }
  const shots = new Map(); // cartId → png Buffer
  const browsers = new Set();
  let running = 0;
  const maxJobs = Number(env.SPOT_AGENT_MAX || 2);
  const agentOn = () => env.SPOT_AGENT === 'on' && Boolean(client || env.ANTHROPIC_API_KEY);

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

    async start(cart, shippingInput) {
      if (cart.status !== 'card_issued') throw Object.assign(new Error('The card has to be ready before ordering'), { status: 409 });
      const f = cart.fulfillment;
      if (f && ['starting', 'working', 'awaiting_confirm'].includes(f.state)) throw Object.assign(new Error('Already ordering'), { status: 409 });
      if (f?.state === 'placed') throw Object.assign(new Error('Already ordered'), { status: 409 });
      const ship = validateShipping(shippingInput);
      spot.patch(cart.id, (c) => ({ ...c, requester: { ...c.requester, shipping: ship } }));
      const p = await plan(cart, ship);

      if (!p.start_url) return update(cart.id, { state: 'needs_you', method: p.method, reason: 'No store link to start from', manual_url: null, steps: [] }, 'order_needs_you');
      if (!agentOn()) {
        return update(cart.id, { state: 'needs_you', method: p.method, reason: 'Automatic checkout is off, so check out with your card below', manual_url: p.manual_url, steps: [] }, 'order_needs_you');
      }
      if (running >= maxJobs) {
        return update(cart.id, { state: 'needs_you', method: p.method, reason: 'Spot is busy, so try again in a minute or check out yourself', manual_url: p.manual_url, steps: [] }, 'order_needs_you');
      }

      const started = update(cart.id, { state: 'working', method: p.method, manual_url: p.manual_url, reason: p.note, steps: [{ text: p.method === 'shopify' ? 'Built your cart at the store' : 'Opening the store', at: Date.now() }], started_at: Date.now() }, 'order_started');
      running++;
      this._run(cart.id, p, ship).finally(() => running--);
      return started;
    },

    async _run(cartId, p, ship) {
      let browser;
      try {
        const cart = spot.byId(cartId);
        const card = await provider.revealCard(cart);
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
          card,
          startUrl: p.start_url,
          client,
          progress: (t) => step(cartId, t),
          confirm: ({ total_cents, summary, screenshot }) =>
            new Promise((resolve) => {
              if (screenshot) shots.set(cartId, screenshot);
              const timer = setTimeout(() => {
                pending.delete(cartId);
                resolve(false);
              }, CONFIRM_TIMEOUT_MS);
              timer.unref?.();
              pending.set(cartId, { resolve, timer });
              update(cartId, { state: 'awaiting_confirm', total_cents, summary, has_shot: Boolean(screenshot) }, 'order_awaiting_confirm');
            }),
        });
        if (outcome.status === 'placed') update(cartId, { state: 'placed', order_number: outcome.order_number, placed_at: Date.now() }, 'order_placed');
        else if (outcome.status === 'cancelled') update(cartId, { state: 'cancelled', reason: outcome.reason }, 'order_cancelled');
        else update(cartId, { state: 'needs_you', reason: outcome.reason }, 'order_needs_you');
      } catch (err) {
        log.error?.({ err, cart: cartId }, 'checkout agent failed');
        update(cartId, { state: 'needs_you', reason: 'Automatic checkout hit a problem, so check out with your card below' }, 'order_needs_you');
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
