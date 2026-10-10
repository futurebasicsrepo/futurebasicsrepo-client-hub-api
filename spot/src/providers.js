// Money providers. Both expose the same small interface so the server
// doesn't care which one is running:
//
//   name                         'sandbox' | 'stripe'
//   createPayment(cart)          → { ref, client }   what the pay page needs;
//                                  a hold on the payer's card, not a charge
//   capturePayment(ref)          → 'captured' | 'already' | 'canceled'
//                                  (once the store accepts the order)
//   issueCard(cart, { ready })   → { ref, brand, last4, exp_month, exp_year }
//                                  (ready: made switched off, before the hold)
//   activateCard(ref, cents)     → void   (switch a ready card on)
//   issuingAvailableCents()      → number | null   (what Spot's cards can spend)
//   revealCard(cart)             → { number, cvc, exp_month, exp_year }
//                                  (checkout only: never sent to a browser)
//   cancelCard(cart)             → void
//   setCardLimit(ref, cents)     → void   (Spot covering a difference)
//   refund(cart, amountCents?, key?) → 'released' | 'refunded'
//                                  (whole payment when no amount; a hold is
//                                  released rather than refunded)
//
// An account's own saved card, for paying its AI's asks (funding.js):
//   setupFunding(user, saved?)   → { mode, customer?, client_secret? }
//   saveFunding(user, saved, input) → { customer?, pm, brand, last4, exp_month, exp_year, fingerprint }
//   chargeSaved(cart, funding, { present }) → { ref, status, client?, error? }
//                                  status: succeeded | requires_action | failed
//   removeFunding(funding)       → void
//
// Spot is the seller of a card cart: the payer buys it from Spot, and Spot
// orders it from the store with its own single-use virtual card (Stripe
// Issuing, one company cardholder), shipping to the requester.
//
// Sandbox moves no money: it's for demos and tests, and it's what runs when
// no Stripe keys are set.
import { randomInt } from 'node:crypto';
import Stripe from 'stripe';
import { BLOCKED_CATEGORIES, cardLimitCents } from './cart.js';

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
    async cancelPayment() {
      return true;
    },
    // Payments are holds until captured. Tests set `issuingCents` to play a
    // short Issuing balance, or `cardFails` to play a card Stripe won't make.
    captured: new Set(),
    released: [],
    issuingCents: null,
    cardFails: null,
    async issuingAvailableCents() {
      return this.issuingCents;
    },
    async capturePayment(ref) {
      if (this.released.includes(ref)) return 'canceled';
      if (this.captured.has(ref)) return 'already';
      this.captured.add(ref);
      return 'captured';
    },
    async issueCard(cart, { ready = false } = {}) {
      if (this.cardFails) throw new Error(this.cardFails);
      const number = luhnNumber('4000009', 16);
      const now = new Date();
      return {
        ...(ready ? { status: 'inactive' } : {}),
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
    // Saved cards are pretend too. Test card ending 0002 is declined and
    // 3155 asks for bank verification, like Stripe's test cards.
    async setupFunding() {
      return { mode: 'sandbox' };
    },
    async saveFunding(user, saved, input = {}) {
      const last4 = /^\d{4}$/.test(String(input.test_card || '')) ? String(input.test_card) : '4242';
      const now = new Date();
      return { pm: `sbx_pm_${last4}_${randomInt(1e5, 1e6)}`, brand: 'Visa', last4, exp_month: now.getMonth() + 1, exp_year: now.getFullYear() + 3, fingerprint: `sbx_fp_${last4}` };
    },
    charges: [],
    async chargeSaved(cart, funding, { present = false } = {}) {
      const ref = `sbx_pi_saved_${cart.id}`;
      if (funding.last4 === '0002') return { ref, status: 'failed', error: 'Your card was declined.' };
      if (funding.last4 === '3155' && !present) return { ref, status: 'failed', error: 'Your bank wants to check this payment. Approve it on your phone instead.' };
      this.charges.push({ cart: cart.id, amount_cents: cart.total_cents, present });
      this.charges.splice(0, this.charges.length - 200);
      return { ref, status: 'held' };
    },
    async removeFunding() {},
    // What would have moved, for tests and the sandbox demo.
    refunds: [],
    canceled: [],
    async cancelCard(cart) {
      if (cart.card_ref) this.canceled.push(cart.card_ref);
      this.canceled.splice(0, this.canceled.length - 200);
    },
    limits: new Map(),
    async setCardLimit(ref, cents) {
      this.limits.set(ref, cents);
    },
    activated: [],
    async activateCard(ref, cents) {
      this.activated.push(ref);
      this.limits.set(ref, cents);
    },
    // A hold not yet captured is released (nothing was ever charged);
    // anything else is refunded.
    async refund(cart, amountCents, key) {
      if (!cart.payment_ref) return null;
      const ref = String(cart.payment_ref).split('#')[0];
      const held = !this.captured.has(ref);
      this.refunds.push({ cart: cart.id, amount_cents: amountCents ?? null, key: key || null, ...(held ? { released: true } : {}) });
      this.refunds.splice(0, this.refunds.length - 200);
      if (held && !amountCents) this.released.push(ref);
      return held && !amountCents ? 'released' : 'refunded';
    },
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
  const cardholderId = env.STRIPE_ISSUING_CARDHOLDER || null;
  // Issuing on Stripe's newer financial accounts needs the account cards
  // draw from. Set STRIPE_ISSUING_FINANCIAL_ACCOUNT (fa_…), or Spot uses the
  // account's one open financial account when Stripe asks for it.
  let financialAccount = env.STRIPE_ISSUING_FINANCIAL_ACCOUNT || null;
  let balanceSeen = null;
  // Listing them is a preview API: Stripe only answers it on the matching
  // .preview version of the API this SDK speaks.
  const PREVIEW_VERSION = `${Stripe.API_VERSION.split('.')[0]}.preview`;
  async function findFinancialAccount() {
    const res = await stripe.rawRequest('GET', '/v2/money_management/financial_accounts', {}, { apiVersion: PREVIEW_VERSION });
    const open = (res?.data || []).filter((a) => !a.status || a.status === 'open');
    if (open.length !== 1) throw new Error(`Stripe Issuing needs a financial account, and ${open.length ? `${open.length} are open` : 'none is open'}: set STRIPE_ISSUING_FINANCIAL_ACCOUNT (fa_…)`);
    return open[0].id;
  }
  const needsFinancialAccount = (err) => err?.code === 'parameter_missing' && /financial_account/.test(err?.param || err?.message || '');

  return {
    name: 'stripe',
    stripe,

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
          // A hold, not a charge: captured once the store accepts the order
          // (see capturePayment), released if Spot can't buy it.
          capture_method: 'manual',
          automatic_payment_methods: { enabled: true },
          description: `Spot cart for ${cart.requester.name} at ${cart.merchant.name}`,
          metadata: { spot_cart_id: cart.id, ...(cart.bundle ? { spot_bundle: '1' } : {}) },
        },
        { idempotencyKey: `spot-hold-${cart.id}-${cart.rev || 1}` },
      );
      return { ref: pi.id, client: clientFor(pi, env) };
    },

    // Stop a payment nobody has finished, so it can't charge an old amount.
    // false: someone is paying it right now (or already has).
    async cancelPayment(ref) {
      const pi = await stripe.paymentIntents.retrieve(ref);
      if (pi.status === 'canceled') return true;
      if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) return false;
      await stripe.paymentIntents.cancel(ref);
      return true;
    },

    // One company cardholder (Spot itself), made once in the Stripe dashboard.
    // Cards are Spot's, used by Spot's checkout to buy what customers bought
    // from Spot; nobody outside Spot ever sees the number.
    // ready: made before the payer pays, switched off until the hold is in
    // (activateCard), so a card Stripe won't make stops the payment instead
    // of failing after it.
    async issueCard(cart, { ready = false } = {}) {
      if (!cardholderId) throw new Error('STRIPE_ISSUING_CARDHOLDER is not set (Spot\'s company cardholder id, ich_…)');
      // Spending controls are enforced by the network, and back up the
      // real-time checks in the issuing_authorization.request webhook: even if
      // our webhook is down, the card can't go over the cart or be used at a
      // cash-like merchant.
      const create = (fa) =>
        stripe.issuing.cards.create(
          {
            cardholder: cardholderId,
            currency: 'usd',
            type: 'virtual',
            status: ready ? 'inactive' : 'active',
            ...(fa ? { financial_account_v2: fa } : {}),
            spending_controls: {
              spending_limits: [{ amount: cardLimitCents(cart), interval: 'all_time' }],
              blocked_categories: BLOCKED_CATEGORIES,
            },
            metadata: { spot_cart_id: cart.id },
          },
          // A different body needs its own key; the account never changes for a cart.
          { idempotencyKey: `spot-card-${cart.id}${ready ? '-ready' : ''}${fa ? `-${fa}` : ''}` },
        );
      let card;
      try {
        card = await create(financialAccount);
      } catch (err) {
        if (financialAccount || !needsFinancialAccount(err)) throw err;
        financialAccount = await findFinancialAccount();
        card = await create(financialAccount);
      }
      return { ref: card.id, brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year };
    },
    async activateCard(ref, cents) {
      await stripe.issuing.cards.update(ref, {
        status: 'active',
        spending_controls: { spending_limits: [{ amount: cents, interval: 'all_time' }], blocked_categories: BLOCKED_CATEGORIES },
      });
    },

    // What Spot's cards can spend right now (the Issuing financial account's
    // available balance), or null when Stripe won't say. Read at most once a
    // minute: it's checked before every payment.
    async issuingAvailableCents() {
      if (!financialAccount) return null;
      if (balanceSeen && Date.now() - balanceSeen.at < 60_000) return balanceSeen.cents;
      try {
        const fa = await stripe.rawRequest('GET', `/v2/money_management/financial_accounts/${financialAccount}`, {}, { apiVersion: PREVIEW_VERSION });
        const cents = Number(fa?.balance?.available?.usd?.value ?? fa?.balance?.available?.usd ?? NaN);
        balanceSeen = { at: Date.now(), cents: Number.isFinite(cents) ? cents : null };
      } catch {
        balanceSeen = { at: Date.now(), cents: null };
      }
      return balanceSeen.cents;
    },

    async retrievePayment(ref) {
      return stripe.paymentIntents.retrieve(String(ref).split('#')[0]);
    },
    // Take the money held on the payer's card. Safe to repeat.
    async capturePayment(ref) {
      const id = String(ref).split('#')[0];
      const pi = await stripe.paymentIntents.retrieve(id);
      if (pi.status === 'succeeded') return 'already';
      if (pi.status === 'canceled') return 'canceled';
      if (pi.status !== 'requires_capture') throw new Error(`Payment ${id} is ${pi.status}, not held`);
      await stripe.paymentIntents.capture(id, {}, { idempotencyKey: `spot-capture-${id}` });
      return 'captured';
    },

    // For Spot's own checkout only, at the moment it pays. The number passes
    // through this server's memory (PCI DSS scope); it is never logged,
    // stored, or sent to a browser.
    async revealCard(cart) {
      const card = await stripe.issuing.cards.retrieve(cart.card_ref, { expand: ['number', 'cvc'] });
      return { number: card.number, cvc: card.cvc, exp_month: card.exp_month, exp_year: card.exp_year };
    },

    // Raise (or lower) a card's network spending limit, keeping its blocks.
    async setCardLimit(ref, cents) {
      await stripe.issuing.cards.update(ref, {
        spending_controls: { spending_limits: [{ amount: cents, interval: 'all_time' }], blocked_categories: BLOCKED_CATEGORIES },
      });
    },

    async cancelCard(cart) {
      if (!cart.card_ref) return;
      try {
        await stripe.issuing.cards.update(cart.card_ref, { status: 'canceled' });
      } catch (err) {
        // Already canceled is fine.
        if (!/cancel/i.test(err.message || '')) throw err;
      }
    },

    // The whole payment, or part of it (unused cushion, a store return). A
    // hold not yet captured is released instead, so nothing ever shows as a
    // charge on the payer's card: all of it, or (part of it) by capturing
    // only the rest. 'released' or 'refunded' says which.
    async refund(cart, amountCents, key) {
      if (!cart.payment_ref) return null;
      const id = String(cart.payment_ref).split('#')[0];
      const pi = await stripe.paymentIntents.retrieve(id);
      if (pi.status === 'canceled') return 'released';
      if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status) && !amountCents) {
        await stripe.paymentIntents.cancel(id);
        return 'released';
      }
      if (pi.status === 'requires_capture') {
        const keep = amountCents ? pi.amount_capturable - amountCents : 0;
        if (keep <= 0) {
          await stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `spot-release-${id}` });
          return 'released';
        }
        await stripe.paymentIntents.capture(id, { amount_to_capture: keep }, { idempotencyKey: `spot-capture-${id}` });
        return 'released';
      }
      await stripe.refunds.create(
        // A bundle's store carts hold "<payment>#<n>"; refunds go to the payment.
        { payment_intent: String(cart.payment_ref).split('#')[0], ...(amountCents ? { amount: amountCents } : {}), metadata: { spot_cart_id: cart.id } },
        { idempotencyKey: key ? `spot-refund-${cart.id}-${key}` : `spot-refund-${cart.id}` },
      );
      return 'refunded';
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

    // ─── The account's own saved card ───────────────────────────────────
    // A Stripe customer per account, and a SetupIntent the account page
    // confirms with Stripe.js: the card number goes to Stripe, never here.
    async setupFunding(user, saved) {
      const make = () => stripe.customers.create({ email: user.email || undefined, name: user.name || undefined, metadata: { spot_user_id: user.id } }).then((c) => c.id);
      let customer = saved?.customer || (await make());
      // Cards only: no Link, BLIK or bank redirects, which can't pay later off-session.
      const intent = (c) => stripe.setupIntents.create({ customer: c, usage: 'off_session', payment_method_types: ['card'], metadata: { spot_user_id: user.id } });
      let si;
      try {
        si = await intent(customer);
      } catch (err) {
        // A customer saved under other keys (test mode, or an old account) isn't
        // known here: start a new one rather than failing every time.
        if (err?.code !== 'resource_missing' || !saved?.customer) throw err;
        customer = await make();
        si = await intent(customer);
      }
      return { mode: 'stripe', customer, publishable_key: env.STRIPE_PUBLISHABLE_KEY, client_secret: si.client_secret };
    },
    async saveFunding(user, saved, input = {}) {
      const si = await stripe.setupIntents.retrieve(String(input.setup_intent || ''), { expand: ['payment_method'] });
      if (si.status !== 'succeeded' || si.metadata?.spot_user_id !== user.id) throw new Error('That card setup didn’t finish');
      const pm = si.payment_method;
      const card = pm?.card || {};
      return { customer: typeof si.customer === 'string' ? si.customer : si.customer?.id, pm: pm.id, brand: card.brand ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card', last4: card.last4 || '', exp_month: card.exp_month || null, exp_year: card.exp_year || null, fingerprint: card.fingerprint || null };
    },
    // present: the person is on the page right now (they tapped Approve), so
    // their bank can ask them to verify. Otherwise it's an off-session charge.
    async chargeSaved(cart, funding, { present = false } = {}) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: cart.total_cents,
            currency: 'usd',
            customer: funding.customer,
            payment_method: funding.pm,
            confirm: true,
            capture_method: 'manual',
            ...(present ? { automatic_payment_methods: { enabled: true, allow_redirects: 'never' } } : { off_session: true }),
            description: `Spot: ${cart.requester.name}'s AI at ${cart.merchant.name}`,
            metadata: { spot_cart_id: cart.id, spot_saved_card: '1' },
          },
          { idempotencyKey: `spot-saved-hold-${cart.id}-${cart.rev || 1}-${present ? 'p' : 'o'}` },
        );
        if (pi.status === 'requires_capture') return { ref: pi.id, status: 'held' };
        if (pi.status === 'succeeded') return { ref: pi.id, status: 'succeeded' };
        if (pi.status === 'requires_action') return { ref: pi.id, status: 'requires_action', client: clientFor(pi, env) };
        return { ref: pi.id, status: 'failed', error: 'The payment didn’t go through.' };
      } catch (err) {
        const pi = err.raw?.payment_intent;
        if (present && pi?.status === 'requires_action') return { ref: pi.id, status: 'requires_action', client: clientFor(pi, env) };
        return { ref: pi?.id || null, status: 'failed', error: err.type === 'StripeCardError' ? err.message : 'The payment didn’t go through.' };
      }
    },
    async removeFunding(funding) {
      if (funding?.pm) await stripe.paymentMethods.detach(funding.pm).catch(() => {});
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
