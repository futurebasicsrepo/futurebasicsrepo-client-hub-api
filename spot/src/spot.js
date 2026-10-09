// The service layer: every cart state change goes through here, so the
// rules in cart.js are enforced the same way for HTTP routes, webhooks and
// the sandbox simulator.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { agentLabel } from './approvals.js';
import { CartError, computeTotals, config, decideAuthorization, goodsCents, transition, validateCart } from './cart.js';
import { flightTitle, flightVariant, publicFlight, validateTravelers } from './flights.js';
import { minutesUntilCutoff, trainTitle, trainVariant, validateRiders, validateTrain } from './trains.js';
import { validateShipping } from './fulfill/index.js';

const ISSUE_RETRY_MS = 60_000;

export function createSpot({ db, provider, flights = null, risk = null, cfg = config(), log = console, onCardIssued = () => {} }) {
  const hash = (k) => createHash('sha256').update(k).digest('hex');
  // Private links in notifications: an HMAC of the token stands in for the
  // manage key (which Spot only keeps hashed). The secret lives in the DB.
  const linkSecret = db.setting ? db.setting('link_secret', () => randomBytes(32).toString('hex')) : randomBytes(32).toString('hex');
  const manageSig = (token) => `s${createHmac('sha256', linkSecret).update(`manage:${token}`).digest('base64url').slice(0, 32)}`;
  // The payer's receipt link (in their receipt email): lets them cancel for a
  // full refund until Spot places the order.
  const payerSig = (token) => `p${createHmac('sha256', linkSecret).update(`payer:${token}`).digest('base64url').slice(0, 32)}`;
  const HOUR = 3600_000;
  const orderDeadlineMs = Number(process.env.SPOT_ORDER_DEADLINE_HOURS || 72) * HOUR;
  // Once Spot is placing the order (or has), a cancel could race the store charge.
  const ordering = (cart) => ['starting', 'working', 'awaiting_confirm', 'placed'].includes(cart.fulfillment?.state);

  function load(token) {
    const cart = db.byToken(String(token || ''));
    if (!cart) throw new CartError('Cart not found', 404);
    if (cart.status === 'open' && cart.expires_at < Date.now()) return expire(cart);
    return cart;
  }

  // `key` is the private manage key, or { k, userId }: a signed-in owner
  // gets in without the key.
  function loadManaged(token, key) {
    const cart = load(token);
    const auth = key && typeof key === 'object' ? key : { k: key };
    if (auth.userId && cart.user_id && cart.user_id === auth.userId) return cart;
    const k = String(auth.k || '');
    const a = Buffer.from(hash(k));
    const b = Buffer.from(cart.manage_hash);
    if (a.length === b.length && timingSafeEqual(a, b)) return cart;
    const sig = Buffer.from(manageSig(cart.token));
    const got = Buffer.from(k);
    if (sig.length === got.length && timingSafeEqual(sig, got)) return cart;
    throw new CartError('Cart not found', 404);
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

    create(input, { ip, userId } = {}, limits = cfg, opts = {}) {
      const v = validateCart(input, limits);
      if (!opts.skipRisk) risk?.checkCreate(ip);
      const now = Date.now();
      const manageKey = opts.manageKey || randomBytes(24).toString('base64url');
      const cart = {
        ...v,
        ...(opts.extra || {}),
        id: randomUUID(),
        token: randomBytes(9).toString('base64url'), // 12-char public link id
        manage_hash: hash(manageKey),
        status: 'open',
        rev: 1,
        created_at: now,
        expires_at: now + (v.expires_minutes ? v.expires_minutes * 60_000 : cfg.expiresHours * 3600_000),
        requester_ip: ip || null,
        user_id: userId || null,
      };
      db.insert(cart);
      return { cart, manageKey };
    },

    // A flight an agent found for its user. The traveler finishes on their
    // phone: who's flying, then pay; Spot books it with the airline. The
    // link lives no longer than the airline holds the fare.
    createFlight(offer, input = {}, { ip, userId } = {}) {
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
          kind: 'flight',
          for: 'self',
          expires_minutes: Math.max(5, minutes),
        },
        { ip, userId },
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

    // A specific train, found by the AI on the operator's site. Always for
    // the asker themselves; they add who's riding, pay, and Spot buys it.
    createTrain(input = {}, { ip, userId } = {}) {
      const train = validateTrain(input.train);
      const fare = Math.round(Number(input.fare_cents));
      if (!(fare > 0)) throw new CartError('fare_cents is required: the total fare for all passengers, as shown on the operator’s site');
      const left = minutesUntilCutoff(train);
      if (left < 5) throw new CartError('That train leaves too soon for Spot to buy it. Pick a later one.', 410);
      const asked = input.expires_minutes ? Number(input.expires_minutes) : null;
      const minutes = Math.min(...[left, asked, 72 * 60].filter((x) => Number.isFinite(x) && x > 0));
      const op = String(input.merchant?.name || 'Amtrak').slice(0, 60);
      const url = input.merchant?.url || (op.toLowerCase() === 'amtrak' ? 'https://www.amtrak.com' : null);
      const { cart, manageKey } = this.create(
        {
          requester: input.requester,
          merchant: { name: op, url },
          items: [{ title: trainTitle(op, train), variant: trainVariant(train), quantity: 1, price_cents: fare, ...(train.booking_url ? { url: train.booking_url } : {}) }],
          note: input.note,
          settle: 'card',
          for: 'self',
          expires_minutes: Math.max(5, minutes),
        },
        { ip, userId },
      );
      let next = { ...cart, kind: 'train', train };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      if (input.riders?.length && input.contact) {
        try {
          next = this.setRidersNow(next, input.riders, input.contact);
        } catch {
          // Partial details from the agent: the rider fills the rest in.
        }
      }
      return { cart: next, manageKey };
    },

    // Who's riding, and the email the e-ticket goes to. Instead of shipping.
    setRiders(token, key, body = {}) {
      return this.setRidersNow(loadManaged(token, key), body.riders, body.contact);
    },
    setRidersNow(cart, ridersIn, contactIn) {
      if (cart.kind !== 'train') throw new CartError('Not a train ticket', 400);
      if (cart.status !== 'open') throw new CartError('This ticket is already paid', 409);
      const { riders, contact } = validateRiders(ridersIn, contactIn, cart.train.passengers);
      const name = `${riders[0].given_name} ${riders[0].family_name}`;
      const next = { ...cart, train: { ...cart.train, riders, contact }, requester: { ...cart.requester, email: cart.requester.email || contact.email, ticket: { name, email: contact.email, phone: contact.phone } } };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'riders_set');
      return next;
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
        const totals = computeTotals(items, 0, 'card', cfg, { cushion: false });
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
        const booked = move(started, 'book', { flight: { ...started.flight, booking } }, { booking_reference: booking.booking_reference });
        this.emit('booked', booked.id);
        return booked;
      } catch (err) {
        log.error?.({ err, cart: cart.id }, 'flight booking failed');
        const reason = err.status === 410 ? 'The airline released the fare before it could be booked.' : `The airline couldn't book it: ${err.message}`;
        db.event(cart.id, 'booking_failed', { code: err.code || null, message: err.message });
        try {
          const noted = this.patch(started.id, (c) => ({ ...c, flight: { ...c.flight, error: reason } }));
          const refunded = await this.refundCart(noted, { reason: 'booking_failed', quiet: true });
          this.emit('booking_failed', refunded.id);
          return refunded;
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
      const next = { ...cart, ...v, rev: (cart.rev || 1) + 1 };
      // Changed items aren't the store's cart any more.
      if (cart.source && JSON.stringify(v.items) !== JSON.stringify(cart.items)) next.source = { ...cart.source, verified: false, edited: true };
      if (cart.bundle_id) {
        const others = db.bundles.carts(cart.bundle_id).filter((c) => c.id !== cart.id).reduce((n, c) => n + c.cart_cents, 0);
        if (others + next.cart_cents > cfg.maxCartCents) throw new CartError(`Spot takes up to $${(cfg.maxCartCents / 100).toFixed(0)} per ask for now, across all its stores`);
      }
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'edited');
      return next;
    },

    onCardIssued,

    // "For me" carts: the requester confirms where it ships before paying.
    prepare(token, key, shippingInput) {
      const cart = loadManaged(token, key);
      if (cart.status !== 'open') throw new CartError('This cart is already paid', 409);
      if (cart.kind === 'flight') throw new CartError('Flights don\'t ship. Add who\'s flying instead.', 400);
      if (cart.kind === 'train') throw new CartError('Train tickets don\'t ship. Add who\'s riding instead.', 400);
      const shipping = validateShipping(shippingInput);
      const next = { ...cart, requester: { ...cart.requester, shipping, email: cart.requester.email || shipping.email } };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'shipping_set');
      return next;
    },

    // "Ask someone else to pay": a for-me cart becomes a shareable ask. Only
    // store orders (fares are booked for the traveler's own card session),
    // and only while nothing is paid. A payment the requester started and
    // left is reused by the payer, so it doesn't block the switch.
    reassign(token, key) {
      const cart = loadManaged(token, key);
      if (cart.for !== 'self') return cart;
      if (cart.status !== 'open') throw new CartError('This cart is already paid', 409);
      if (cart.kind === 'flight' || cart.kind === 'train') throw new CartError('Tickets are paid by the traveler for now', 400);
      if (cart.bundle_id) throw new CartError('Multi-store asks can’t be sent on yet', 400);
      if (!['card', 'direct'].includes(cart.settle)) throw new CartError('This cart can’t be sent on', 400);
      const { saved_card: _c, saved_pay: _p, ...rest } = cart;
      const next = { ...rest, for: 'other' };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'reassigned');
      return next;
    },

    load,
    loadManaged,
    // The requester's private page, for messages sent to the requester.
    privatePath: (cart) => `/c/${cart.token}/manage?k=${manageSig(cart.token)}`,
    // The payer's receipt page, for the payer's receipt email.
    payerPath: (cart) => `/c/${cart.token}/receipt?p=${payerSig(cart.token)}`,
    payerOk(token, p) {
      const a = Buffer.from(payerSig(String(token)));
      const b = Buffer.from(String(p || ''));
      return a.length === b.length && timingSafeEqual(a, b);
    },
    // Set by the server: can Spot place orders at this cart's store? Card
    // payments are only taken for carts Spot can actually buy.
    canOrder: async () => true,
    // Set by the server: tells people when something happens (events.js).
    emit: () => {},

    // Attach a Spot made before signing in (proved by its private key).
    claim(token, key, userId) {
      const cart = loadManaged(token, { k: key });
      if (cart.user_id === userId) return cart;
      if (cart.user_id) throw new CartError('That Spot belongs to another account', 409);
      return this.patch(cart.id, (c) => ({ ...c, user_id: userId }), 'claimed');
    },
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
      if (cart.bundle_id) throw new CartError('This cart is part of a bundle. Pay for the whole bundle from its link.', 409);
      if (cart.status !== 'open') throw new CartError(cart.status === 'expired' ? 'This cart link has expired' : 'This cart is already covered', 409);
      if (cart.kind === 'flight' && !cart.flight.travelers) throw new CartError('Add who\'s flying first', 409);
      if (cart.kind === 'train' && !cart.train.riders) throw new CartError('Add who\'s riding first', 409);
      if (cart.kind !== 'flight' && !cart.payment_ref && !(await this.canOrder(cart))) {
        throw new CartError(`Spot can't order from ${cart.merchant.name} automatically yet, so it can't take a card payment for this cart.${cart.requester.venmo || cart.requester.cashtag ? ' Send it straight to them on Venmo or Cash App instead.' : ''}`, 409);
      }
      const { ref, client } = await provider.createPayment(cart);
      if (ref !== cart.payment_ref) {
        const next = { ...cart, payment_ref: ref };
        if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      }
      return client;
    },

    // Called by the Stripe webhook (or the sandbox) once money has landed.
    async paymentSucceeded({ paymentRef, amountCents, payer, approval = null }) {
      const bundle = db.bundles?.byPayment(paymentRef);
      if (bundle) return this._bundlePaid(bundle, amountCents, payer);
      const cart = db.byPayment(paymentRef);
      if (!cart) throw new CartError('Unknown payment', 404);
      if (cart.status !== 'open') return cart; // duplicate webhook delivery
      if (amountCents !== cart.total_cents) {
        db.event(cart.id, 'amount_mismatch', { expected: cart.total_cents, got: amountCents });
        throw new CartError('Payment amount does not match cart', 409);
      }
      // The payer's email is kept only to say thanks when the gift is ordered;
      // it is never shown to the requester.
      const paid = move(cart, 'pay', { paid_at: Date.now(), payer: payer?.name ? { name: payer.name } : null, payer_contact: payer?.email ? { email: String(payer.email).toLowerCase() } : null }, { amount_cents: amountCents });
      const verdict = risk ? risk.assessPayment(paid, payer || {}) : { action: 'ok' };
      if (verdict.action === 'refund') {
        db.event(cart.id, 'risk_refund', { reason: verdict.reason });
        const noted = this.patch(paid.id, (c) => ({ ...c, risk: verdict }));
        return this.refundCart(noted, { reason: 'risk', quiet: true });
      }
      // Spot is the seller: the payer gets a receipt from Spot, with a link
      // to cancel for a full refund until the order is placed.
      // Sign the approval first so the receipt can link it.
      // A saved-card payment says how it was approved (a tap, or the rules).
      const how = approval || paid.saved_pay || { by: paid.for === 'self' ? 'requester' : 'payer', how: 'paid_spot' };
      this.emit('approved', paid.id, { by: how.by, how: how.how, amount_cents: amountCents });
      this.emit('receipt', paid.id);
      if (verdict.action === 'hold') {
        return this.patch(cart.id, (c) => ({ ...c, hold: { reason: verdict.reason, at: Date.now() } }), 'held_for_review');
      }
      if (paid.kind !== 'flight' && paid.for !== 'self') this.emit('covered', paid.id);
      return paid.kind === 'flight' ? this.bookFlight(paid) : this.issue(paid);
    },

    // Pay an ask with its account's own saved card (funding.js). `how` says
    // who said yes: { by: 'requester', how: 'approved_saved_card' } after a
    // tap, or { by: 'rules', how: 'paid_by_rules' } when the account opted in
    // to its AI paying on its own. `present`: the person is on the page, so
    // their bank can ask them to verify (then `action` goes back to Stripe.js).
    async paySaved(token, funding, { present = false, how }) {
      const cart = load(token);
      if (cart.settle !== 'card' || cart.bundle_id || cart.kind === 'flight' || cart.for !== 'self') throw new CartError('This ask can’t be paid with a saved card', 409);
      if (cart.status !== 'open') throw new CartError(cart.status === 'expired' ? 'This ask has expired' : 'This ask is already paid', 409);
      if (cart.kind === 'train' ? !cart.train.riders : !cart.requester?.shipping) throw new CartError(cart.kind === 'train' ? 'Add who’s riding first' : 'Add where it ships first', 409);
      if (!(await this.canOrder(cart))) throw new CartError(`Spot can't order from ${cart.merchant.name} automatically yet, so it can't charge your card for it.`, 409);
      const ready = this.patch(cart.id, (c) => ({ ...c, saved_pay: how }));
      const r = await provider.chargeSaved(ready, funding, { present });
      if (r.ref && r.ref !== ready.payment_ref) {
        const cur = db.byId(cart.id);
        if (!db.save({ ...cur, payment_ref: r.ref }, 'open')) throw new CartError('Cart changed, try again', 409);
      }
      if (r.status === 'succeeded') {
        const payer = { name: cart.requester.name?.split(' ')[0] || null, email: (cart.requester.shipping || cart.train?.contact)?.email || null, fingerprint: funding.fingerprint || null };
        return { cart: await this.paymentSucceeded({ paymentRef: r.ref, amountCents: cart.total_cents, payer, approval: how }) };
      }
      if (r.status === 'requires_action') return { cart: db.byId(cart.id), action: r.client };
      db.event(cart.id, 'saved_card_failed', { reason: r.error || null });
      throw new CartError(r.error || 'The payment didn’t go through', 402);
    },

    // From /admin: a held payment checks out, so carry on as if it was never held.
    async release(cartId) {
      const cart = db.byId(cartId);
      if (!cart?.hold || cart.status !== 'paid') throw new CartError('Nothing held on this cart', 409);
      const next = this.patch(cart.id, (c) => ({ ...c, hold: null, released_at: Date.now() }), 'released');
      if (next.kind !== 'flight' && next.for !== 'self' && !next.bundle_id) this.emit('covered', next.id);
      return next.kind === 'flight' ? this.bookFlight(next) : this.issue(next);
    },

    // From /admin: refund whatever the payer hasn't had back yet and cancel
    // the card. Also retries a refund stuck in `refunding`.
    async adminRefund(cartId) {
      const cart = db.byId(cartId);
      if (!cart) throw new CartError('Cart not found', 404);
      if (!['paid', 'card_issued', 'completed', 'refunding'].includes(cart.status) || !cart.payment_ref) throw new CartError(`Can't refund a cart that is ${cart.status}`, 409);
      return this.refundCart(cart, { reason: 'admin', by: 'admin' });
    },

    // ─── Pay the store directly (settle 'direct', see direct.js) ─────────
    // Set by the server: the UCP client that builds and follows store checkouts.
    direct: null,

    // The payer taps "Pay <store>": build the store's checkout (reused for 30
    // minutes) and send them to it. Spot never takes this payment.
    async directStart(token, { email = null, name = null } = {}) {
      const cart = load(token);
      if (cart.settle !== 'direct') throw new CartError('This cart isn’t paid at the store', 409);
      if (cart.status !== 'open') throw new CartError(cart.status === 'expired' ? 'This cart link has expired' : 'This cart is already taken care of', 409);
      if (!this.direct) throw new CartError('Paying the store directly isn’t available right now', 503);
      const d = cart.direct;
      if (d?.checkout_id && Date.now() - d.started_at < 30 * 60_000) {
        const now = await this.directSync(token);
        if (now.status !== 'open') throw new CartError('This cart is already taken care of', 409);
        if (now.direct?.checkout_id) return { continue_url: now.direct.continue_url, total_cents: now.direct.total_cents };
      }
      const started = await this.direct.start(cart, { email });
      this.patch(cart.id, (c) => ({ ...c, direct: { ...started, started_at: Date.now(), payer_email: email ? String(email).toLowerCase() : null, payer_name: name ? String(name).trim().slice(0, 40) || null : null } }), 'store_checkout_started');
      return { continue_url: started.continue_url, total_cents: started.total_cents };
    },

    // Ask the store how its checkout is going. When the store says it's
    // completed, the cart completes with the store's order.
    async directSync(token, { force = false } = {}) {
      const cart = load(token);
      const d = cart.direct;
      if (cart.settle !== 'direct' || cart.status !== 'open' || !d?.checkout_id || !this.direct) return cart;
      if (!force && d.checked_at && Date.now() - d.checked_at < 5000) return cart;
      let st;
      try {
        st = await this.direct.status(d);
      } catch (err) {
        log.warn?.({ err, cart: cart.id }, 'store checkout status failed');
        return this.patch(cart.id, (c) => ({ ...c, direct: { ...c.direct, checked_at: Date.now() } }));
      }
      if (st.status === 'completed') {
        const done = move(db.byId(cart.id), 'store_paid', {
          paid_at: Date.now(),
          payer: cart.payer || (d.payer_name ? { name: d.payer_name } : null),
          payer_contact: d.payer_email ? { email: d.payer_email } : cart.payer_contact || null,
          fulfillment: { state: 'placed', method: 'direct', order_number: st.order_number, order_url: st.order_url, total_cents: st.total_cents, placed_at: Date.now() },
        }, { order_number: st.order_number });
        this.emit('approved', done.id, { by: cart.for === 'self' ? 'requester' : 'payer', amount_cents: st.total_cents, how: 'paid_at_store' });
        this.emit('ordered', done.id);
        return done;
      }
      if (st.status === 'canceled') return this.patch(cart.id, (c) => ({ ...c, direct: null }), 'store_checkout_canceled');
      return this.patch(cart.id, (c) => ({ ...c, direct: { ...c.direct, checked_at: Date.now(), total_cents: st.total_cents ?? c.direct.total_cents } }));
    },

    // Follow open store checkouts (from the server's sweeper).
    async sweepDirect() {
      for (const id of db.idsDirectOpen()) {
        const cart = db.byId(id);
        if (cart) await this.directSync(cart.token, { force: true }).catch(() => {});
      }
    },

    // ─── Refunds ─────────────────────────────────────────────────────────
    // Refund the payer everything not yet refunded and cancel Spot's card.
    // The cart moves to `refunding` BEFORE any money moves, so a card
    // authorization arriving meanwhile is declined (it needs card_issued);
    // the card is canceled before the payment is refunded. If Stripe fails,
    // the cart stays `refunding` and the sweeper (or /admin) retries; the
    // idempotency key makes a retry safe.
    async refundCart(cart, { reason = 'refund', by = null, quiet = false } = {}) {
      const cur = cart.status === 'refunding' ? cart : move(cart, 'begin_refund', { refund_reason: reason, refund_started_at: Date.now() }, { reason, by });
      const already = cur.refunded_cents || 0;
      try {
        await provider.cancelCard(cur);
        // A bundle's carts share one payment: always name this cart's share.
        if (cur.total_cents - already > 0) await provider.refund(cur, already || cur.bundle_id ? cur.total_cents - already : undefined, already ? 'rest' : undefined);
      } catch (err) {
        log.error?.({ err, cart: cur.id }, 'refund failed');
        db.event(cur.id, 'refund_failed', { message: err.message });
        throw new CartError('The refund didn’t go through just now. It’s queued and will be retried.', 502);
      }
      const done = move(cur, 'refund', { refunded_at: Date.now(), refunded_cents: cur.total_cents, card_canceled: cur.card_ref ? Date.now() : null }, { amount_cents: cur.total_cents - already });
      if (!quiet) this.emit('refunded', done.id);
      return done;
    },

    // Give back part of the goods money (unused cushion, a store return)
    // without changing the cart's state. Never more than the payer paid for
    // the goods: the fee is only refunded with the whole payment. `key`
    // makes it happen once however often the triggering webhook arrives.
    async refundPart(cartId, amountCents, key, reason) {
      const cart = db.byId(cartId);
      if (!cart?.payment_ref || cart.status === 'refunded' || cart.status === 'refunding') return cart;
      if ((cart.refunds || []).some((r) => r.key === key)) return cart;
      const amount = Math.min(Math.round(amountCents), goodsCents(cart) - (cart.refunded_cents || 0));
      if (amount <= 0) return cart;
      // Record first, so a second delivery can't refund twice; then move money.
      const claimed = this.patch(cart.id, (c) => ({ ...c, refunded_cents: (c.refunded_cents || 0) + amount, refunds: [...(c.refunds || []), { key, reason, amount_cents: amount, at: Date.now(), state: 'pending' }] }), 'partial_refund');
      return this._sendPart(claimed, key);
    },

    async _sendPart(cart, key) {
      const r = (cart.refunds || []).find((x) => x.key === key);
      const mark = (state, extra) => this.patch(cart.id, (c) => ({ ...c, refunds: (c.refunds || []).map((x) => (x.key === key ? { ...x, state, ...extra } : x)) }));
      try {
        await provider.refund(cart, r.amount_cents, key);
        const done = mark('done', { done_at: Date.now() });
        this.emit('refunded_part', done.id, { amount_cents: r.amount_cents, reason: r.reason, key });
        return done;
      } catch (err) {
        log.error?.({ err, cart: cart.id }, 'partial refund failed');
        db.event(cart.id, 'refund_failed', { message: err.message, key });
        return mark('failed', { error: err.message });
      }
    },

    // ─── Issuing money events (Stripe webhooks, or the sandbox) ─────────
    // A store charge (capture) or store refund on Spot's card.
    async recordIssuingTxn({ id, card, authorization = null, type, amount, merchant = null }) {
      const cart = db.byCard(card);
      if (!cart) return null;
      const cents = Math.abs(Math.round(amount));
      if (!db.issuing.add({ id, cart_id: cart.id, authorization, type, amount_cents: cents, merchant })) return cart;
      db.event(cart.id, type === 'refund' ? 'store_refund' : 'store_charged', { amount_cents: cents, merchant });
      if (type === 'capture') {
        let cur = cart;
        if (cur.status === 'card_issued') {
          // Charged without an authorization we approved (a "force capture").
          try {
            cur = move(cur, 'spend', { spent_at: Date.now(), spent_cents: cents, spent_merchant: merchant });
          } catch {
            cur = db.byId(cart.id);
          }
          db.event(cart.id, 'force_capture', { amount_cents: cents });
        }
        if (['refunding', 'refunded'].includes(cur.status)) {
          // Money left Spot's card after the payer was refunded: a human looks.
          return this.patch(cart.id, (c) => ({ ...c, alert: { kind: 'charged_after_refund', amount_cents: cents, at: Date.now() } }), 'charged_after_refund');
        }
        // Single use: once the store has charged, nothing else can.
        return this._cancelOnce(cur);
      }
      if (type === 'refund') {
        const next = await this.refundPart(cart.id, cents, `return_${id}`, 'store_refund');
        return next;
      }
      return cart;
    },

    async _cancelOnce(cart) {
      if (cart.card_canceled || !cart.card_ref) return cart;
      try {
        await provider.cancelCard(cart);
        return this.patch(cart.id, (c) => ({ ...c, card_canceled: Date.now() }), 'card_canceled');
      } catch (err) {
        log.error?.({ err, cart: cart.id }, 'card cancel failed');
        return cart;
      }
    },

    // The store's authorization finished. Whatever it didn't charge goes back
    // to the payer: all of it if the store reversed it, the unused part
    // otherwise. An expired authorization can still be captured for a while,
    // so that refund waits (see sweep).
    async authorizationClosed({ id, card, status, approved, transactions = [] }) {
      const cart = db.byCard(card);
      if (!cart || !approved || !['closed', 'reversed', 'expired'].includes(status)) return cart;
      for (const t of transactions) await this.recordIssuingTxn({ ...t, card, authorization: id });
      let cur = db.byId(cart.id);
      if (cur.status !== 'completed') return cur;
      cur = await this._cancelOnce(cur);
      const { captured } = db.issuing.totals(cur.id);
      if (!captured) {
        if (status === 'expired') return this.patch(cur.id, (c) => ({ ...c, release_after: Date.now() + 30 * 24 * HOUR }), 'authorization_expired');
        return this.refundCart(cur, { reason: status === 'reversed' ? 'store_reversed' : 'store_released' });
      }
      const unused = goodsCents(cur) - captured;
      return unused > 0 ? this.refundPart(cur.id, unused, `unused_${id}`, 'unused') : cur;
    },

    // The payer disputed their payment with their bank. Stop the card, block
    // the payer's card from Spot, and flag it for a human.
    async dispute(paymentRef, reason = null) {
      const carts = db.byPaymentAll ? db.byPaymentAll(paymentRef) : [db.byPayment(paymentRef)].filter(Boolean);
      if (!carts.length) return null;
      let first = null;
      for (const cart of carts) {
        let cur = this.patch(cart.id, (c) => ({ ...c, dispute: { at: Date.now(), reason } }), 'disputed');
        cur = await this._cancelOnce(cur);
        first = first || cur;
      }
      const fp = carts.map((c) => db.risk?.paymentFor?.(c.id)?.fingerprint).find(Boolean);
      if (fp && db.blocks) db.blocks.add('card', fp, `Disputed a payment (cart ${carts[0].token})`);
      return first;
    },

    // The payer cancels from their receipt, until Spot places the order.
    async payerCancel(token, p) {
      if (!this.payerOk(token, p)) throw new CartError('Cart not found', 404);
      const cart = load(token);
      if (cart.kind === 'flight') throw new CartError('Flights are booked right away, so they can’t be canceled here. Contact us.', 409);
      if (!['paid', 'card_issued'].includes(cart.status)) throw new CartError(cart.status === 'refunded' ? 'This was already refunded' : 'This order can no longer be canceled', 409);
      if (ordering(cart)) throw new CartError('Spot is placing this order right now, so it can’t be canceled. Contact us about a return.', 409);
      return this.refundCart(cart, { reason: 'payer_canceled', by: 'payer' });
    },

    // Housekeeping, run from the server's sweeper:
    //  - retry refunds stuck in `refunding` and partial refunds that failed
    //  - refund carts Spot couldn't order within the deadline
    //  - refund authorizations that expired without a charge, after 30 days
    async sweepMoney(now = Date.now()) {
      const done = [];
      for (const id of db.idsForMoneySweep()) {
        const cart = db.byId(id);
        try {
          if (cart.status === 'refunding' && now - (cart.refund_started_at || 0) > 5 * 60_000) done.push(await this.refundCart(cart, { reason: cart.refund_reason || 'retry' }));
          else if (['paid', 'card_issued'].includes(cart.status) && cart.kind !== 'flight' && !cart.hold && !cart.dispute && !ordering(cart) && now - (cart.issued_at || cart.paid_at || now) > orderDeadlineMs) {
            done.push(await this.refundCart(cart, { reason: 'not_ordered' }));
          } else if (cart.status === 'completed' && cart.release_after) {
            // An expired authorization: a late capture settles it (refund the
            // unused part); none within 30 days means a full refund.
            const { captured } = db.issuing.totals(cart.id);
            if (captured) {
              const settled = this.patch(cart.id, (c) => ({ ...c, release_after: null }));
              const unused = goodsCents(settled) - captured;
              if (unused > 0) done.push(await this.refundPart(cart.id, unused, 'unused_late', 'unused'));
            } else if (now > cart.release_after) {
              done.push(await this.refundCart(this.patch(cart.id, (c) => ({ ...c, release_after: null })), { reason: 'store_never_charged' }));
            }
          }
          for (const r of cart.refunds || []) if (r.state === 'failed' && now - r.at > 5 * 60_000) done.push(await this._sendPart(db.byId(id), r.key));
        } catch (err) {
          log.error?.({ err, cart: id }, 'money sweep failed');
        }
      }
      return done.length;
    },

    // Issue the merchant-locked card. Safe to retry: a failed issue leaves
    // the cart `paid`, and the requester page retries on the next view, at
    // most once a minute (the page checks every few seconds).
    async issue(cart, { retry = false } = {}) {
      if (cart.status !== 'paid' || cart.kind === 'flight' || cart.hold || cart.dispute) return cart;
      if (retry) {
        const last = db.events(cart.id).filter((e) => e.kind === 'issue_failed').at(-1);
        if (last && Date.now() - last.at < ISSUE_RETRY_MS) return cart;
      }
      try {
        const card = await provider.issueCard(cart);
        const issued = move(cart, 'issue', { card_ref: card.ref, card: { ...card, ref: undefined }, issued_at: Date.now() }, { last4: card.last4 });
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

    // Real-time authorization of a charge on an issued card.
    authorize(cardRef, auth) {
      const cart = db.byCard(cardRef);
      const decision = cart?.dispute ? { approved: false, reason: 'disputed' } : decideAuthorization(cart, auth);
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

    // The requester cancels and gives the payer their money back, until Spot
    // places the order.
    async refund(token, key) {
      const cart = loadManaged(token, key);
      if (!['paid', 'card_issued'].includes(cart.status)) throw new CartError(`Can't refund a cart that is ${cart.status}`, 409);
      if (ordering(cart)) throw new CartError('Spot is placing this order right now. Try again if it stops.', 409);
      return this.refundCart(cart, { reason: 'requester_canceled', by: 'requester' });
    },

    // ─── Bundles: one ask across several stores ──────────────────────────
    // A cart per store (each its own card, order, refunds and deadline),
    // one link and one payment. If one store can't be ordered, only that
    // store's share is refunded.
    createBundle(input, { ip, userId } = {}) {
      const b = input && typeof input === 'object' ? input : {};
      const stores = Array.isArray(b.stores) ? b.stores : [];
      if (stores.length < 2) throw new CartError('A multi-store ask needs carts from at least two stores');
      if (stores.length > MAX_BUNDLE_STORES) throw new CartError(`Up to ${MAX_BUNDLE_STORES} stores in one ask`);
      if (b.settle && b.settle !== 'card') throw new CartError('Multi-store asks are paid on Spot, in one payment', 400);
      const forWhom = b.for === 'self' ? 'self' : 'other';
      const each = (st) => ({ requester: b.requester, merchant: st?.merchant, items: st?.items, extras_cents: st?.extras_cents, note: b.note, settle: 'card', for: forWhom, expires_minutes: b.expires_minutes });
      const valid = stores.map((st) => validateCart(each(st), cfg));
      const goods = valid.reduce((n, v) => n + v.cart_cents, 0);
      if (goods > cfg.maxCartCents) throw new CartError(`Spot takes up to $${(cfg.maxCartCents / 100).toFixed(0)} per ask for now, across all its stores`);
      risk?.checkCreate(ip);
      const manageKey = randomBytes(24).toString('base64url');
      const id = randomUUID();
      const token = randomBytes(9).toString('base64url');
      const carts = stores.map((st, i) => this.create(each(st), { ip, userId }, cfg, { manageKey, skipRisk: true, extra: { bundle_id: id, bundle_index: i } }).cart);
      db.bundles.insert({ id, token, manage_hash: hash(manageKey), created_at: Date.now(), doc: { for: forWhom, requester: { name: carts[0].requester.name }, note: carts[0].note || null, count: carts.length } });
      for (const c of carts) db.event(c.id, 'bundled', { bundle: token });
      return { bundle: this.loadBundle(token), manageKey };
    },

    loadBundle(token) {
      const b = db.bundles.byToken(String(token || ''));
      if (!b) throw new CartError('Not found', 404);
      const carts = db.bundles.carts(b.id).map((c) => (c.status === 'open' && c.expires_at < Date.now() ? expire(c) : c));
      return { ...b, carts, status: bundleStatus(carts) };
    },

    // The same private key opens the bundle and each of its store carts.
    loadBundleManaged(token, key) {
      const b = this.loadBundle(token);
      const auth = key && typeof key === 'object' ? key : { k: key };
      if (auth.userId && b.carts[0]?.user_id === auth.userId) return b;
      const a = Buffer.from(hash(String(auth.k || '')));
      const m = Buffer.from(b.manage_hash);
      if (a.length === m.length && timingSafeEqual(a, m)) return b;
      const sig = Buffer.from(manageSig(b.token));
      const got = Buffer.from(String(auth.k || ''));
      if (sig.length === got.length && timingSafeEqual(sig, got)) return b;
      throw new CartError('Not found', 404);
    },
    bundlePrivatePath: (b) => `/b/${b.token}/manage?k=${manageSig(b.token)}`,
    bundlePayerPath: (b) => `/b/${b.token}/receipt?p=${payerSig(b.token)}`,
    bundleOf: (cart) => (cart?.bundle_id ? db.bundles.byId(cart.bundle_id) : null),

    // One payment for every store: the intent is for the bundle's total, and
    // each store's cart holds "<payment>#<n>" so refunds go back per store.
    async startBundlePayment(token) {
      const b = this.loadBundle(token);
      if (b.status !== 'open') throw new CartError(b.status === 'expired' ? 'This link has expired' : 'This is already covered', 409);
      if (b.for === 'self' && !b.carts[0].requester.shipping) throw new CartError('Add where it ships first', 409);
      for (const c of b.carts) {
        if (!(await this.canOrder(c))) throw new CartError(`Spot can't order from ${c.merchant.name} automatically yet, so it can't take a payment for this ask.`, 409);
      }
      const total = b.carts.reduce((n, c) => n + c.total_cents, 0);
      const { ref, client } = await provider.createPayment({ id: b.id, total_cents: total, requester: b.carts[0].requester, merchant: { name: storesLabel(b.carts) }, payment_ref: b.payment_ref, bundle: true });
      if (ref !== b.payment_ref) db.bundles.setPayment(b.id, ref);
      b.carts.forEach((c, i) => {
        const pr = `${ref}#${i}`;
        if (c.payment_ref !== pr && !db.save({ ...c, payment_ref: pr }, 'open')) throw new CartError('Cart changed, try again', 409);
      });
      return client;
    },

    async _bundlePaid(bundle, amountCents, payer) {
      const carts = db.bundles.carts(bundle.id);
      const open = carts.filter((c) => c.status === 'open');
      if (!open.length) return carts[0]; // duplicate webhook delivery
      const total = carts.reduce((n, c) => n + c.total_cents, 0);
      if (amountCents !== total) {
        for (const c of carts) db.event(c.id, 'amount_mismatch', { expected: total, got: amountCents });
        throw new CartError('Payment amount does not match cart', 409);
      }
      const at = Date.now();
      const who = { paid_at: at, payer: payer?.name ? { name: payer.name } : null, payer_contact: payer?.email ? { email: String(payer.email).toLowerCase() } : null };
      const paid = [];
      for (const c of carts) {
        if (c.status === 'open') {
          paid.push(move(c, 'pay', who, { amount_cents: c.total_cents, bundle: bundle.token }));
        } else {
          // Expired or canceled before the money landed: give that share back.
          db.event(c.id, 'paid_while_closed', { status: c.status });
          await provider.refund(c, c.total_cents, 'closed').catch((err) => log.error?.({ err, cart: c.id }, 'refund of closed bundle cart failed'));
        }
      }
      const verdict = risk ? risk.assessPayment({ ...paid[0], total_cents: paid.reduce((n, c) => n + c.total_cents, 0) }, payer || {}) : { action: 'ok' };
      if (verdict.action === 'refund') {
        for (const c of paid) {
          db.event(c.id, 'risk_refund', { reason: verdict.reason });
          await this.refundCart(this.patch(c.id, (x) => ({ ...x, risk: verdict })), { reason: 'risk', quiet: true });
        }
        return db.byId(paid[0].id);
      }
      for (const c of paid) this.emit('approved', c.id, { by: c.for === 'self' ? 'requester' : 'payer', how: 'paid_spot', amount_cents: c.total_cents });
      this.emit('receipt', paid[0].id, { bundle: bundle.id });
      if (verdict.action === 'hold') {
        for (const c of paid) this.patch(c.id, (x) => ({ ...x, hold: { reason: verdict.reason, at: Date.now() } }), 'held_for_review');
        return db.byId(paid[0].id);
      }
      if (paid[0].for !== 'self') this.emit('covered', paid[0].id, { bundle: bundle.id });
      for (const c of paid) await this.issue(c);
      return db.byId(paid[0].id);
    },

    // Shipping for every store at once.
    prepareBundle(token, key, shippingInput) {
      const b = this.loadBundleManaged(token, key);
      if (b.status !== 'open') throw new CartError('This is already paid', 409);
      const shipping = validateShipping(shippingInput);
      for (const c of b.carts) {
        const next = { ...c, requester: { ...c.requester, shipping, email: c.requester.email || shipping.email } };
        if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
        db.event(c.id, 'shipping_set');
      }
      return this.loadBundle(token);
    },

    cancelBundle(token, key) {
      const b = this.loadBundleManaged(token, key);
      if (b.status !== 'open') throw new CartError('Only an unpaid ask can be canceled', 409);
      for (const c of b.carts) if (c.status === 'open') move(c, 'cancel');
      return this.loadBundle(token);
    },

    // The payer (from their receipt) or the requester cancels whatever
    // hasn't been ordered yet; stores already ordering keep going.
    async refundBundle(token, { p = null, key = null } = {}) {
      const b = p != null ? this.loadBundle(token) : this.loadBundleManaged(token, key);
      if (p != null && !this.payerOk(b.token, p)) throw new CartError('Not found', 404);
      const can = b.carts.filter((c) => ['paid', 'card_issued'].includes(c.status) && !ordering(c));
      if (!can.length) throw new CartError('Nothing here can be canceled any more', 409);
      for (const c of can) await this.refundCart(c, { reason: p != null ? 'payer_canceled' : 'requester_canceled', by: p != null ? 'payer' : 'requester' });
      return this.loadBundle(token);
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

const MAX_BUNDLE_STORES = 5;

export function bundleStatus(carts) {
  const s = carts.map((c) => c.status);
  if (s.every((x) => x === 'open')) return 'open';
  if (s.every((x) => ['open', 'expired'].includes(x))) return 'expired';
  if (s.every((x) => ['open', 'expired', 'canceled'].includes(x))) return 'canceled';
  if (s.every((x) => x === 'refunded')) return 'refunded';
  if (s.every((x) => ['completed', 'refunded'].includes(x))) return 'completed';
  return 'paid';
}

export const storesLabel = (carts) => (carts.length > 2 ? `${carts[0].merchant.name}, ${carts[1].merchant.name} +${carts.length - 2}` : carts.map((c) => c.merchant.name).join(' + '));

// A bundle as anyone with its link may see it.
export function publicBundle(b) {
  const sum = (k) => b.carts.reduce((n, c) => n + (c[k] || 0), 0);
  return {
    token: b.token,
    status: b.status,
    for: b.for,
    requester: { name: b.requester.name },
    note: b.note,
    stores: b.carts.map((c) => ({ ...publicCart(c), requester: undefined, note: undefined })),
    merchant: { name: storesLabel(b.carts) },
    items: b.carts.flatMap((c) => c.items),
    subtotal_cents: sum('subtotal_cents'),
    extras_cents: sum('extras_cents'),
    cart_cents: sum('cart_cents'),
    cushion_cents: sum('cushion_cents'),
    fee_cents: sum('fee_cents'),
    total_cents: sum('total_cents'),
    expires_at: Math.min(...b.carts.map((c) => c.expires_at)),
    payer_name: b.carts.find((c) => c.payer?.name)?.payer.name || null,
    built_by: b.carts[0]?.agent ? agentLabel(b.carts[0].agent) : null,
  };
}

// What anyone holding the public link may see. No emails, no addresses,
// no card data.
export function publicCart(cart) {
  return {
    token: cart.token,
    status: cart.status,
    rev: cart.rev || 1,
    for: cart.for || 'other',
    kind: cart.kind || 'goods',
    flight: publicFlight(cart.flight),
    // Trains: the journey only; who's riding is for the owner (ownerCart).
    train: cart.train ? { from: cart.train.from, to: cart.train.to, depart_at: cart.train.depart_at, arrive_at: cart.train.arrive_at, service: cart.train.service, number: cart.train.number, fare_class: cart.train.fare_class, passengers: cart.train.passengers } : null,
    settle: cart.settle,
    requester: { name: cart.requester.name, venmo: cart.requester.venmo, cashtag: cart.requester.cashtag },
    merchant: cart.merchant,
    note: cart.note,
    items: cart.items,
    subtotal_cents: cart.subtotal_cents,
    extras_cents: cart.extras_cents,
    cart_cents: cart.cart_cents,
    cushion_cents: cart.cushion_cents || 0,
    fee_cents: cart.fee_cents,
    // Paid on the store's own checkout: can the payer go ahead yet?
    pay_at_store: cart.settle === 'direct' ? { ready: Boolean(cart.requester.shipping), started: Boolean(cart.direct?.checkout_id), store_total_cents: cart.direct?.total_cents ?? null } : null,
    total_cents: cart.total_cents,
    expires_at: cart.expires_at,
    payer_name: cart.payer?.name || null,
    // Provenance: which AI put this together, or which store's button sent it.
    built_by: cart.agent ? agentLabel(cart.agent) : null,
    source: cart.source ? { kind: cart.source.kind, name: cart.source.name || null, verified: Boolean(cart.source.verified) } : null,
    // Sent to an approver by the requester's own spending rules.
    via_approver: Boolean(cart.approver),
  };
}

export function ownerCart(cart) {
  return {
    ...publicCart(cart),
    requester: { ...cart.requester, billing: undefined },
    // Spot's card is Spot's: the requester only learns that ordering can start.
    card_ready: Boolean(cart.card_ref),
    paid_at: cart.paid_at || null,
    spent_at: cart.spent_at || null,
    spent_cents: cart.spent_cents ?? null,
    spent_merchant: cart.spent_merchant || null,
    fulfillment: cart.fulfillment || null,
    held: Boolean(cart.hold),
    disputed: Boolean(cart.dispute),
    refund_reason: cart.refund_reason || null,
    refunded_cents: cart.refunded_cents || 0,
    refunds: (cart.refunds || []).map(({ reason, amount_cents, state, at }) => ({ reason, amount_cents, state, at })),
    travelers: cart.flight?.travelers?.map(({ given_name, family_name, born_on, gender }) => ({ given_name, family_name, born_on, gender })) || null,
    contact: cart.flight?.contact || cart.train?.contact || null,
    riders: cart.train?.riders || null,
  };
}
