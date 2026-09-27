// The service layer: every cart state change goes through here, so the
// rules in cart.js are enforced the same way for HTTP routes, webhooks and
// the sandbox simulator.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CartError, computeTotals, config, decideAuthorization, transition, validateCart } from './cart.js';
import { flightTitle, flightVariant, publicFlight, validateTravelers } from './flights.js';
import { validateShipping } from './fulfill/index.js';

export function createSpot({ db, provider, flights = null, risk = null, cfg = config(), log = console, onCardIssued = () => {} }) {
  const hash = (k) => createHash('sha256').update(k).digest('hex');

  function load(token) {
    const cart = db.byToken(String(token || ''));
    if (!cart) throw new CartError('Cart not found', 404);
    if (cart.status === 'open' && cart.expires_at < Date.now()) return expire(cart);
    return cart;
  }

  function loadManaged(token, key) {
    const cart = load(token);
    const a = Buffer.from(hash(String(key || '')));
    const b = Buffer.from(cart.manage_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new CartError('Cart not found', 404);
    return cart;
  }

  // Applies a state transition and persists it. Throws if another request
  // moved the cart first, so two webhooks can never both issue a card.
  function move(cart, action, patch = {}, detail) {
    const from = cart.status;
    const next = { ...cart, ...patch, status: transition(from, action, cart.settle) };
    if (!db.save(next, from)) throw new CartError('Cart changed, try again', 409);
    db.event(cart.id, action, detail);
    return next;
  }

  function expire(cart) {
    try {
      return move(cart, 'expire');
    } catch {
      return db.byId(cart.id);
    }
  }

  return {
    provider,

    create(input, { ip } = {}, limits = cfg) {
      const v = validateCart(input, limits);
      risk?.checkCreate(ip);
      // The billing address is only needed to issue the card, which happens
      // after someone pays, so creating a link never asks for it.
      const billing = input?.requester?.billing;
      if (billing && hasBilling(billing)) v.requester.billing = cleanBilling(billing);
      const now = Date.now();
      const manageKey = randomBytes(24).toString('base64url');
      const cart = {
        ...v,
        id: randomUUID(),
        token: randomBytes(9).toString('base64url'), // 12-char public link id
        manage_hash: hash(manageKey),
        status: 'open',
        rev: 1,
        created_at: now,
        expires_at: now + (v.expires_minutes ? v.expires_minutes * 60_000 : cfg.expiresHours * 3600_000),
        requester_ip: ip || null,
      };
      db.insert(cart);
      return { cart, manageKey };
    },

    // A flight an agent found for its user. The traveler finishes on their
    // phone: who's flying, then pay; Spot books it with the airline. The
    // link lives no longer than the airline holds the fare.
    createFlight(offer, input = {}, { ip } = {}) {
      if (!offer?.id || !offer.total_cents) throw new CartError('Pick a flight offer first');
      const hold = offer.expires_at ? Math.floor((Date.parse(offer.expires_at) - Date.now()) / 60_000) : null;
      if (hold !== null && hold < 5) throw new CartError('That fare is about to expire. Search again.', 410);
      const asked = input.expires_minutes ? Number(input.expires_minutes) : null;
      const minutes = Math.min(...[hold, asked, 72 * 60].filter((x) => Number.isFinite(x) && x > 0));
      const { cart, manageKey } = this.create(
        {
          requester: input.requester,
          merchant: { name: offer.airline.name },
          items: [{ title: flightTitle(offer), variant: flightVariant(offer), quantity: 1, price_cents: offer.total_cents }],
          note: input.note,
          settle: 'card',
          for: 'self',
          expires_minutes: Math.max(5, minutes),
        },
        { ip },
        { ...cfg, maxCartCents: cfg.maxFlightCents ?? cfg.maxCartCents },
      );
      let next = { ...cart, kind: 'flight', flight: { offer } };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      if (input.travelers?.length && input.contact) {
        try {
          next = this.setTravelersNow(next, input.travelers, input.contact);
        } catch {
          // Partial details from the agent: the traveler fills the rest in.
        }
      }
      return { cart: next, manageKey };
    },

    // Save who's flying and re-check the fare with the airline before the
    // traveler pays. If the price moved, the cart moves with it and the
    // page shows the new total before anyone is charged.
    async setTravelers(token, key, body = {}) {
      const cart = loadManaged(token, key);
      if (cart.kind !== 'flight') throw new CartError('Not a flight', 400);
      if (cart.status !== 'open') throw new CartError('This trip is already paid', 409);
      let next = this.setTravelersNow(cart, body.travelers, body.contact);
      const fresh = await flights.offer(cart.flight.offer.id).catch((err) => {
        if (err.status === 410) expire(db.byId(cart.id));
        throw err;
      });
      const was = cart.total_cents;
      if (fresh.total_cents !== cart.flight.offer.total_cents) {
        const items = [{ ...next.items[0], price_cents: fresh.total_cents }];
        const totals = computeTotals(items, 0, 'card', cfg);
        if (totals.cart_cents > (cfg.maxFlightCents ?? cfg.maxCartCents)) throw new CartError('The fare went up past what Spot can take for now', 409);
        next = { ...next, items, ...totals, rev: (next.rev || 1) + 1, flight: { ...next.flight, offer: { ...fresh, passengers: next.flight.offer.passengers } } };
        if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
        db.event(cart.id, 'fare_changed', { from: was, to: next.total_cents });
      }
      return { cart: next, price_changed: next.total_cents !== was ? { from_cents: was, to_cents: next.total_cents } : null };
    },

    setTravelersNow(cart, travelers, contact) {
      const v = validateTravelers(cart.flight.offer.passengers, travelers, contact);
      const next = { ...cart, flight: { ...cart.flight, ...v }, requester: { ...cart.requester, email: cart.requester.email || v.contact.email } };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'travelers_set');
      return next;
    },

    // Book the paid fare. Runs once: a crash mid-booking leaves the cart
    // `paid` with booking_started set, for a human to check in Duffel rather
    // than risking a second ticket. If the airline says no, the traveler is
    // refunded straight away.
    async bookFlight(cart) {
      if (cart.status !== 'paid' || cart.hold || cart.flight?.booking_started) return cart;
      const started = this.patch(cart.id, (c) => ({ ...c, flight: { ...c.flight, booking_started: Date.now() } }), 'booking_started');
      try {
        const booking = await flights.book(started.flight);
        return move(started, 'book', { flight: { ...started.flight, booking } }, { booking_reference: booking.booking_reference });
      } catch (err) {
        log.error?.({ err, cart: cart.id }, 'flight booking failed');
        const reason = err.status === 410 ? 'The airline released the fare before it could be booked.' : `The airline couldn't book it: ${err.message}`;
        db.event(cart.id, 'booking_failed', { code: err.code || null, message: err.message });
        try {
          await provider.refund(started);
          return move(started, 'refund', { refunded_at: Date.now(), flight: { ...started.flight, error: reason } });
        } catch (e) {
          log.error?.({ err: e, cart: cart.id }, 'refund after failed booking failed');
          return this.patch(cart.id, (c) => ({ ...c, flight: { ...c.flight, error: `${reason} Your refund is being processed by hand.` } }), 'refund_failed');
        }
      }
    },

    // Fix a link after making it (a wrong price, a missed item). Only while
    // nobody has started paying, so a payer is never charged a moved amount.
    edit(token, key, input) {
      const cart = loadManaged(token, key);
      if (cart.status !== 'open' || cart.payment_ref || cart.kind === 'flight') throw new CartError('This cart can no longer be changed', 409);
      const v = validateCart({ ...input, requester: { ...cart.requester, ...(input?.requester || {}) } }, cfg);
      v.requester.billing = cart.requester.billing;
      const next = { ...cart, ...v, rev: (cart.rev || 1) + 1 };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'edited');
      return next;
    },

    onCardIssued,

    // "For me" carts: the requester confirms where it ships before paying.
    // Their shipping address doubles as the card's billing address.
    prepare(token, key, shippingInput) {
      const cart = loadManaged(token, key);
      if (cart.status !== 'open') throw new CartError('This cart is already paid', 409);
      if (cart.kind === 'flight') throw new CartError('Flights don\'t ship. Add who\'s flying instead.', 400);
      const shipping = validateShipping(shippingInput);
      const billing = cart.requester.billing || { line1: shipping.line1, city: shipping.city, state: shipping.state, postal_code: shipping.postal_code };
      const next = { ...cart, requester: { ...cart.requester, shipping, billing, email: cart.requester.email || shipping.email } };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'shipping_set');
      return next;
    },

    needsBilling: (cart) => Boolean(provider.needsBilling && cart.settle === 'card' && cart.kind !== 'flight' && !cart.requester.billing),

    // Requester adds their billing address after being paid; issues the card.
    async addBilling(token, key, billing) {
      const cart = loadManaged(token, key);
      if (!hasBilling(billing)) throw new CartError('Street, city, state and ZIP are all needed');
      if (!['open', 'paid'].includes(cart.status)) throw new CartError('Your card is already set up', 409);
      const next = { ...cart, requester: { ...cart.requester, billing: cleanBilling(billing) } };
      if (!db.save(next, cart.status)) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'billing_added');
      return next.status === 'paid' ? this.issue(next) : next;
    },

    load,
    loadManaged,
    byId: (id) => db.byId(id),

    // Change a cart's document without changing its status (fulfilment
    // progress, shipping). Re-reads and retries if the status moved under us,
    // e.g. the store charging the card mid-checkout.
    patch(cartId, fn, event) {
      for (let i = 0; i < 5; i++) {
        const cart = db.byId(cartId);
        if (!cart) throw new CartError('Cart not found', 404);
        const next = fn(cart);
        if (db.save({ ...next, status: cart.status }, cart.status)) {
          if (event) db.event(cartId, event);
          return db.byId(cartId);
        }
      }
      throw new CartError('Cart changed, try again', 409);
    },
    events: (cart) => db.events(cart.id),

    // Payer opened the pay page and wants to pay by card / wallet.
    async startPayment(token) {
      const cart = load(token);
      if (cart.settle !== 'card') throw new CartError('This cart is paid directly by Venmo or Cash App', 409);
      if (cart.status !== 'open') throw new CartError(cart.status === 'expired' ? 'This cart link has expired' : 'This cart is already covered', 409);
      if (cart.kind === 'flight' && !cart.flight.travelers) throw new CartError('Add who\'s flying first', 409);
      const { ref, client } = await provider.createPayment(cart);
      if (ref !== cart.payment_ref) {
        const next = { ...cart, payment_ref: ref };
        if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      }
      return client;
    },

    // Called by the Stripe webhook (or the sandbox) once money has landed.
    async paymentSucceeded({ paymentRef, amountCents, payer }) {
      const cart = db.byPayment(paymentRef);
      if (!cart) throw new CartError('Unknown payment', 404);
      if (cart.status !== 'open') return cart; // duplicate webhook delivery
      if (amountCents !== cart.total_cents) {
        db.event(cart.id, 'amount_mismatch', { expected: cart.total_cents, got: amountCents });
        throw new CartError('Payment amount does not match cart', 409);
      }
      const paid = move(cart, 'pay', { paid_at: Date.now(), payer: payer?.name ? { name: payer.name } : null }, { amount_cents: amountCents });
      const verdict = risk ? risk.assessPayment(paid, payer || {}) : { action: 'ok' };
      if (verdict.action === 'refund') {
        db.event(cart.id, 'risk_refund', { reason: verdict.reason });
        await provider.refund(paid);
        return move(paid, 'refund', { refunded_at: Date.now(), risk: verdict });
      }
      if (verdict.action === 'hold') {
        return this.patch(cart.id, (c) => ({ ...c, hold: { reason: verdict.reason, at: Date.now() } }), 'held_for_review');
      }
      return paid.kind === 'flight' ? this.bookFlight(paid) : this.issue(paid);
    },

    // From /admin: a held payment checks out, so carry on as if it was never held.
    async release(cartId) {
      const cart = db.byId(cartId);
      if (!cart?.hold || cart.status !== 'paid') throw new CartError('Nothing held on this cart', 409);
      const next = this.patch(cart.id, (c) => ({ ...c, hold: null, released_at: Date.now() }), 'released');
      return next.kind === 'flight' ? this.bookFlight(next) : this.issue(next);
    },

    // From /admin: refund the payer (paid or card issued) and cancel the card.
    async adminRefund(cartId) {
      const cart = db.byId(cartId);
      if (!cart) throw new CartError('Cart not found', 404);
      if (!['paid', 'card_issued'].includes(cart.status)) throw new CartError(`Can't refund a cart that is ${cart.status}`, 409);
      await provider.refund(cart);
      return move(cart, 'refund', { refunded_at: Date.now(), hold: null }, { by: 'admin' });
    },

    // Issue the merchant-locked card. Safe to retry: a failed issue leaves
    // the cart `paid`, and the requester page retries on the next view.
    async issue(cart) {
      if (cart.status !== 'paid' || cart.kind === 'flight' || cart.hold) return cart;
      if (this.needsBilling(cart)) {
        if (!db.events(cart.id).some((e) => e.kind === 'needs_billing')) db.event(cart.id, 'needs_billing');
        return cart;
      }
      try {
        const card = await provider.issueCard(cart);
        const issued = move(cart, 'issue', { card_ref: card.ref, card: { ...card, ref: undefined } }, { last4: card.last4 });
        // "For me" carts go straight on to ordering once the card exists.
        try {
          await this.onCardIssued(issued);
        } catch (err) {
          log.error?.({ err, cart: cart.id }, 'auto-order failed to start');
        }
        return db.byId(cart.id);
      } catch (err) {
        log.error?.({ err, cart: cart.id }, 'card issue failed');
        db.event(cart.id, 'issue_failed', { message: err.message });
        return db.byId(cart.id);
      }
    },

    async revealCard(cart) {
      if (cart.status !== 'card_issued') throw new CartError('No active card on this cart', 409);
      return provider.revealCard(cart);
    },

    // Real-time authorization of a charge on an issued card.
    authorize(cardRef, auth) {
      const cart = db.byCard(cardRef);
      const decision = decideAuthorization(cart, auth);
      if (cart) {
        db.event(cart.id, decision.approved ? 'auth_approved' : 'auth_declined', {
          reason: decision.reason,
          merchant: auth.merchant?.name || null,
          amount_cents: auth.amount_cents,
        });
        if (decision.approved) {
          try {
            move(cart, 'spend', { spent_at: Date.now(), spent_cents: auth.amount_cents, spent_merchant: auth.merchant?.name || null });
          } catch {
            // Lost a race with another authorization: the card is single use.
            return { approved: false, reason: 'card_not_active' };
          }
        }
      }
      return decision;
    },

    markReceived(token, key) {
      return move(loadManaged(token, key), 'mark_received', { received_at: Date.now() });
    },

    async cancel(token, key) {
      const cart = loadManaged(token, key);
      return move(cart, 'cancel');
    },

    async refund(token, key) {
      const cart = loadManaged(token, key);
      if (!['paid', 'card_issued'].includes(cart.status)) throw new CartError(`Can't refund a cart that is ${cart.status}`, 409);
      await provider.refund(cart);
      return move(cart, 'refund', { refunded_at: Date.now() });
    },

    sweepExpired() {
      let n = 0;
      for (const id of db.openExpiredIds()) {
        const cart = db.byId(id);
        if (cart) {
          expire(cart);
          n++;
        }
      }
      return n;
    },
  };
}

// What anyone holding the public link may see. No emails, no billing address,
// no card data.
function hasBilling(b) {
  return Boolean(b) && [b.line1, b.city, b.state, b.postal_code].every((x) => typeof x === 'string' && x.trim());
}

function cleanBilling(b) {
  const f = (x, n) => String(x).trim().slice(0, n);
  return { line1: f(b.line1, 120), city: f(b.city, 60), state: f(b.state, 30), postal_code: f(b.postal_code, 12) };
}

export function publicCart(cart) {
  return {
    token: cart.token,
    status: cart.status,
    rev: cart.rev || 1,
    for: cart.for || 'other',
    kind: cart.kind || 'goods',
    flight: publicFlight(cart.flight),
    settle: cart.settle,
    requester: { name: cart.requester.name, venmo: cart.requester.venmo, cashtag: cart.requester.cashtag },
    merchant: cart.merchant,
    note: cart.note,
    items: cart.items,
    subtotal_cents: cart.subtotal_cents,
    extras_cents: cart.extras_cents,
    cart_cents: cart.cart_cents,
    fee_cents: cart.fee_cents,
    total_cents: cart.total_cents,
    expires_at: cart.expires_at,
    payer_name: cart.payer?.name || null,
  };
}

export function ownerCart(cart) {
  return {
    ...publicCart(cart),
    requester: { ...cart.requester, billing: undefined },
    card: cart.card ? { brand: cart.card.brand, last4: cart.card.last4, exp_month: cart.card.exp_month, exp_year: cart.card.exp_year } : null,
    paid_at: cart.paid_at || null,
    spent_at: cart.spent_at || null,
    spent_cents: cart.spent_cents ?? null,
    spent_merchant: cart.spent_merchant || null,
    fulfillment: cart.fulfillment || null,
    held: Boolean(cart.hold),
    travelers: cart.flight?.travelers?.map(({ given_name, family_name, born_on, gender }) => ({ given_name, family_name, born_on, gender })) || null,
    contact: cart.flight?.contact || null,
  };
}
