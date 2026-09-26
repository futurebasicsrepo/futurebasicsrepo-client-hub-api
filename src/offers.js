// Make-an-offer: validation + the buyer/store negotiation state machine.
// Pure functions so the negotiation rules are unit-testable without a database or Shopify.
//
// Scope (see PR description for the full write-up): a buyer opens with one offer and pays
// for it immediately through a real Shopify checkout (that's where the card is captured —
// it never touches our server). The store then has 24h to accept, counter, or decline. If the
// store counters, the buyer has 24h to accept (pay the counter price through a fresh checkout)
// or decline. Either side missing its 24h window auto-expires the offer. This bounds the
// negotiation to two rounds; it does not support the buyer countering back.

import { formatCents } from './consign.js';

export { formatCents };

export const OPEN_STATUSES = ['awaiting_payment', 'pending_review', 'countered'];
export const CLOSED_STATUSES = ['accepted', 'declined', 'expired', 'cancelled'];
export const RESPONSE_WINDOW_HOURS = 24;
export const PAYMENT_WINDOW_HOURS = 2;

const text = (fields, name, max) => String(fields[name] ?? '').trim().slice(0, max);
const bad = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export const respondByFromNow = () => new Date(Date.now() + RESPONSE_WINDOW_HOURS * 3600 * 1000);
export const paymentDueByFromNow = () => new Date(Date.now() + PAYMENT_WINDOW_HOURS * 3600 * 1000);

export function normalizeOfferSubmission(fields) {
  const buyerName = text(fields, 'buyer_name', 120), buyerEmail = text(fields, 'buyer_email', 200).toLowerCase();
  if (buyerName.length < 2) throw bad('Tell us your name.');
  if (!/^\S+@\S+\.\S+$/.test(buyerEmail)) throw bad('A valid email is required so we can send your offer.');
  const quantity = Math.max(1, Math.min(10, Math.round(Number(fields.quantity)) || 1));
  return {
    buyer_name: buyerName, buyer_email: buyerEmail, buyer_phone: text(fields, 'buyer_phone', 40) || null,
    quantity, note: text(fields, 'note', 600) || null
  };
}

/**
 * @param {number|string} value  offered amount, in cents
 * @param {{listPriceCents?: number, minPercent?: number}} bounds
 */
export function normalizeOfferAmount(value, { listPriceCents, minPercent = 50 } = {}) {
  const cents = Math.round(Number(value));
  if (!Number.isFinite(cents) || cents < 100 || cents > 100_000_000) throw bad('Offer should be between $1 and $1,000,000.');
  if (listPriceCents) {
    const floor = Math.ceil(listPriceCents * minPercent / 100);
    if (cents < floor) throw bad(`Offers below ${formatCents(floor)} (${minPercent}% of list) aren't accepted for this item.`);
    if (cents >= listPriceCents) throw bad('That’s at or above the list price — just buy it at full price.');
  }
  return cents;
}

/**
 * Decide what a party's action does to an offer already on the books.
 * The initial 'offer' isn't modeled here — it's a plain insert (see the /v1/public/offers route),
 * same as consign.js leaves the opening submission out of nextOfferState.
 * @param {object} offer  row with status, current_amount_cents, awaiting_counter_payment
 * @param {{by:'buyer'|'store'|'system', action:'paid'|'counter'|'accept'|'decline'|'expire'|'cancel', amountCents?:number, note?:string, bounds?:object}} move
 * @returns {{move:object, patch:object, settlement: null|'capture'|'release_hold'|'create_counter_checkout'}}
 */
export function nextOfferMove(offer, move) {
  const { by, action } = move;
  if (!['buyer', 'store', 'system'].includes(by)) throw bad('Unknown party.');
  if (CLOSED_STATUSES.includes(offer.status)) throw bad(`This offer is ${offer.status}; no further action.`, 409);
  const note = String(move.note ?? '').trim().slice(0, 600) || null;

  if (action === 'paid') {
    if (by !== 'system') throw bad('Only payment confirmation can advance this offer.');
    if (offer.status !== 'awaiting_payment') throw bad('This offer is not awaiting payment.', 409);
    const finalRound = Boolean(offer.awaiting_counter_payment);
    return {
      move: { by: 'system', kind: 'paid', amount_cents: offer.current_amount_cents, note: note || 'Checkout completed' },
      patch: finalRound
        ? { status: 'accepted', agreed_cents: offer.current_amount_cents, awaiting_counter_payment: false }
        : { status: 'pending_review', respond_by: respondByFromNow() },
      settlement: finalRound ? 'capture' : null
    };
  }
  if (action === 'counter') {
    if (by !== 'store') throw bad('Only the shop can counter an offer.');
    if (offer.status !== 'pending_review') throw bad('There is no offer awaiting your response.', 409);
    const amount = normalizeOfferAmount(move.amountCents, move.bounds);
    return {
      move: { by: 'store', kind: 'counter', amount_cents: amount, note },
      patch: { status: 'countered', current_amount_cents: amount, respond_by: respondByFromNow() },
      settlement: 'release_hold'
    };
  }
  if (action === 'accept') {
    if (by === 'store') {
      if (offer.status !== 'pending_review') throw bad('There is no offer awaiting your response.', 409);
      return {
        move: { by: 'store', kind: 'accept', amount_cents: offer.current_amount_cents, note },
        patch: { status: 'accepted', agreed_cents: offer.current_amount_cents },
        settlement: 'capture'
      };
    }
    if (by === 'buyer') {
      if (offer.status !== 'countered') throw bad('There is no counter to accept.', 409);
      return {
        move: { by: 'buyer', kind: 'accept', amount_cents: offer.current_amount_cents, note },
        patch: { status: 'awaiting_payment', awaiting_counter_payment: true, payment_due_by: paymentDueByFromNow() },
        settlement: 'create_counter_checkout'
      };
    }
    throw bad('Unknown party.');
  }
  if (action === 'decline') {
    if (by === 'store') {
      if (offer.status !== 'pending_review') throw bad('There is no offer awaiting your response.', 409);
      return { move: { by: 'store', kind: 'decline', amount_cents: offer.current_amount_cents, note }, patch: { status: 'declined' }, settlement: 'release_hold' };
    }
    if (by === 'buyer') {
      if (offer.status !== 'countered') throw bad('There is nothing to decline.', 409);
      return { move: { by: 'buyer', kind: 'decline', amount_cents: offer.current_amount_cents, note }, patch: { status: 'declined' }, settlement: null };
    }
    throw bad('Unknown party.');
  }
  if (action === 'expire') {
    if (by !== 'system') throw bad('Only the system can expire an offer.');
    if (offer.status === 'pending_review') {
      return { move: { by: 'system', kind: 'expire', amount_cents: offer.current_amount_cents, note: note || '24-hour response window elapsed' }, patch: { status: 'expired' }, settlement: 'release_hold' };
    }
    if (offer.status === 'countered') {
      return { move: { by: 'system', kind: 'expire', amount_cents: offer.current_amount_cents, note: note || '24-hour response window elapsed' }, patch: { status: 'expired' }, settlement: null };
    }
    throw bad('Nothing to expire.', 409);
  }
  if (action === 'cancel') {
    if (offer.status !== 'awaiting_payment') throw bad('Nothing to cancel.', 409);
    const status = offer.awaiting_counter_payment ? 'expired' : 'cancelled';
    return { move: { by, kind: 'cancel', amount_cents: offer.current_amount_cents, note: note || 'Checkout was never completed' }, patch: { status }, settlement: null };
  }
  throw bad('Unknown action.');
}

export function offerView(row, moves, { audience = 'buyer' } = {}) {
  const base = {
    id: row.id, product_title: row.product_title, variant_title: row.variant_title, image_url: row.image_url,
    quantity: row.quantity, list_price_cents: row.list_price_cents, current_amount_cents: row.current_amount_cents,
    agreed_cents: row.agreed_cents, status: row.status, respond_by: row.respond_by, created_at: row.created_at, updated_at: row.updated_at,
    moves: moves.map(m => ({ by: m.by, kind: m.kind, amount_cents: m.amount_cents, note: m.note, created_at: m.created_at }))
  };
  if (audience === 'staff') Object.assign(base, {
    token: row.token, buyer_name: row.buyer_name, buyer_email: row.buyer_email, buyer_phone: row.buyer_phone,
    staff_notes: row.staff_notes, source: row.source, shopify_order_id: row.shopify_order_id, shopify_order_name: row.shopify_order_name
  });
  return base;
}
