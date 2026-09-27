// Money providers. Both expose the same small interface so the server
// doesn't care which one is running:
//
//   name                         'sandbox' | 'stripe'
//   createPayment(cart)          → { ref, client }   what the pay page needs
//   issueCard(cart)              → { ref, brand, last4, exp_month, exp_year }
//   revealCard(cart)             → { number, cvc, exp_month, exp_year }
//   refund(cart)                 → void
//
// Sandbox moves no money: it's for demos and tests, and it's what runs when
// no Stripe keys are set. Stripe uses a PaymentIntent (card, Apple Pay,
// Google Pay through the Payment Element) to take the payer's money, then
// Stripe Issuing to mint a single-use virtual card for the requester.
import { randomInt } from 'node:crypto';
import Stripe from 'stripe';
import { authLimitCents } from './cart.js';

export function pickProvider(env = process.env) {
  if (env.STRIPE_SECRET_KEY) return stripeProvider(env);
  return sandboxProvider();
}

// ─── Sandbox ────────────────────────────────────────────────────────────────
export function sandboxProvider() {
  return {
    name: 'sandbox',
    async createPayment(cart) {
      return { ref: `sbx_pi_${cart.id}`, client: { mode: 'sandbox' } };
    },
    async issueCard(cart) {
      const number = luhnNumber('4000009', 16);
      const now = new Date();
      return {
        ref: `sbx_card_${cart.id}`,
        brand: 'Visa',
        last4: number.slice(-4),
        exp_month: now.getMonth() + 1,
        exp_year: now.getFullYear() + 1,
        // Sandbox only: fake details kept with the cart so the requester page can show them.
        sandbox_secret: { number, cvc: String(randomInt(100, 999)) },
      };
    },
    async revealCard(cart) {
      return { ...cart.card.sandbox_secret, exp_month: cart.card.exp_month, exp_year: cart.card.exp_year };
    },
    async refund() {},
  };
}

function luhnNumber(prefix, length) {
  const digits = prefix.split('').map(Number);
  while (digits.length < length - 1) digits.push(randomInt(0, 10));
  let sum = 0;
  for (let i = digits.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) {
    let d = digits[i];
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  digits.push((10 - (sum % 10)) % 10);
  return digits.join('');
}

// ─── Stripe ─────────────────────────────────────────────────────────────────
export function stripeProvider(env = process.env) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  return {
    name: 'stripe',
    stripe,
    needsBilling: true, // Issuing cardholders need a billing address

    async createPayment(cart) {
      // Reuse the intent if the payer reloads the page.
      if (cart.payment_ref) {
        let existing = await stripe.paymentIntents.retrieve(cart.payment_ref);
        // A flight fare can move after the intent was made; follow it until paid.
        if (existing.amount !== cart.total_cents && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
          existing = await stripe.paymentIntents.update(existing.id, { amount: cart.total_cents });
        }
        if (existing.status !== 'canceled') return { ref: existing.id, client: clientFor(existing, env) };
      }
      const pi = await stripe.paymentIntents.create(
        {
          amount: cart.total_cents,
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
          description: `Spot cart for ${cart.requester.name} at ${cart.merchant.name}`,
          metadata: { spot_cart_id: cart.id },
        },
        { idempotencyKey: `spot-pi-${cart.id}` },
      );
      return { ref: pi.id, client: clientFor(pi, env) };
    },

    async issueCard(cart) {
      const b = cart.requester.billing;
      if (!b) throw new Error('Card carts need the requester billing address in Stripe mode');
      const cardholder = await stripe.issuing.cardholders.create(
        {
          type: 'individual',
          name: cart.requester.name,
          email: cart.requester.email || undefined,
          billing: { address: { line1: b.line1, city: b.city, state: b.state, postal_code: b.postal_code, country: 'US' } },
          individual: {
            first_name: cart.requester.name.split(' ')[0],
            last_name: cart.requester.name.split(' ').slice(1).join(' ') || cart.requester.name,
            card_issuing: { user_terms_acceptance: { date: Math.floor(cart.created_at / 1000), ip: cart.requester_ip || '0.0.0.0' } },
          },
        },
        { idempotencyKey: `spot-ch-${cart.id}` },
      );
      // The network-level cap backs up the real-time merchant lock in the
      // issuing_authorization.request webhook: even if our webhook is down,
      // the card can't be run for more than the cart.
      const card = await stripe.issuing.cards.create(
        {
          cardholder: cardholder.id,
          currency: 'usd',
          type: 'virtual',
          status: 'active',
          spending_controls: { spending_limits: [{ amount: authLimitCents(cart.cart_cents), interval: 'all_time' }] },
          metadata: { spot_cart_id: cart.id },
        },
        { idempotencyKey: `spot-card-${cart.id}` },
      );
      return { ref: card.id, brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year };
    },

    async revealCard(cart) {
      // Test mode can expand the full number. Live mode must show it with
      // Stripe Issuing Elements instead, so card data never touches this server.
      const card = await stripe.issuing.cards.retrieve(cart.card_ref, { expand: ['number', 'cvc'] });
      return { number: card.number, cvc: card.cvc, exp_month: card.exp_month, exp_year: card.exp_year };
    },

    async refund(cart) {
      if (cart.payment_ref) await stripe.refunds.create({ payment_intent: cart.payment_ref }, { idempotencyKey: `spot-refund-${cart.id}` });
      if (cart.card_ref) await stripe.issuing.cards.update(cart.card_ref, { status: 'canceled' });
    },

    // Apple Pay / Google Pay / card forms carry the payer's name, so the pay
    // page never has to ask for it. The card fingerprint (same card → same
    // value, wallet or not) feeds the fraud rules in risk.js.
    async payerFor(pi) {
      const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
      if (!chargeId) return {};
      const charge = await stripe.charges.retrieve(chargeId);
      return {
        name: charge.billing_details?.name?.split(' ')[0] || null,
        email: charge.billing_details?.email || charge.receipt_email || null,
        fingerprint: charge.payment_method_details?.card?.fingerprint || null,
      };
    },

    verifyWebhook(rawBody, signature) {
      if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },

    async answerAuthorization(authId, approved, amountCents) {
      if (approved) await stripe.issuing.authorizations.approve(authId, amountCents ? { amount: amountCents } : {});
      else await stripe.issuing.authorizations.decline(authId);
    },
  };
}

function clientFor(pi, env) {
  return { mode: 'stripe', publishable_key: env.STRIPE_PUBLISHABLE_KEY, client_secret: pi.client_secret };
}
