// The service layer: every cart state change goes through here, so the
// rules in cart.js are enforced the same way for HTTP routes, webhooks and
// the sandbox simulator.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CartError, config, decideAuthorization, transition, validateCart } from './cart.js';

export function createSpot({ db, provider, cfg = config(), log = console }) {
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

    create(input, { ip } = {}) {
      const v = validateCart(input, cfg);
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
        expires_at: now + cfg.expiresHours * 3600_000,
        requester_ip: ip || null,
      };
      db.insert(cart);
      return { cart, manageKey };
    },

    // Fix a link after making it (a wrong price, a missed item). Only while
    // nobody has started paying, so a payer is never charged a moved amount.
    edit(token, key, input) {
      const cart = loadManaged(token, key);
      if (cart.status !== 'open' || cart.payment_ref) throw new CartError('This cart can no longer be changed', 409);
      const v = validateCart({ ...input, requester: { ...cart.requester, ...(input?.requester || {}) } }, cfg);
      v.requester.billing = cart.requester.billing;
      const next = { ...cart, ...v, rev: (cart.rev || 1) + 1 };
      if (!db.save(next, 'open')) throw new CartError('Cart changed, try again', 409);
      db.event(cart.id, 'edited');
      return next;
    },

    needsBilling: (cart) => Boolean(provider.needsBilling && cart.settle === 'card' && !cart.requester.billing),

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
    events: (cart) => db.events(cart.id),

    // Payer opened the pay page and wants to pay by card / wallet.
    async startPayment(token) {
      const cart = load(token);
      if (cart.settle !== 'card') throw new CartError('This cart is paid directly by Venmo or Cash App', 409);
      if (cart.status !== 'open') throw new CartError(cart.status === 'expired' ? 'This cart link has expired' : 'This cart is already covered', 409);
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
      const paid = move(cart, 'pay', { paid_at: Date.now(), payer: payer || null }, { amount_cents: amountCents });
      return this.issue(paid);
    },

    // Issue the merchant-locked card. Safe to retry: a failed issue leaves
    // the cart `paid`, and the requester page retries on the next view.
    async issue(cart) {
      if (cart.status !== 'paid') return cart;
      if (this.needsBilling(cart)) {
        if (!db.events(cart.id).some((e) => e.kind === 'needs_billing')) db.event(cart.id, 'needs_billing');
        return cart;
      }
      try {
        const card = await provider.issueCard(cart);
        return move(cart, 'issue', { card_ref: card.ref, card: { ...card, ref: undefined } }, { last4: card.last4 });
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
  };
}
