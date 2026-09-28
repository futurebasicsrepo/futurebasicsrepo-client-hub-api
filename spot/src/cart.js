// Pure cart logic: validation, money math, the lifecycle state machine, and
// the merchant-lock decision for issued cards. No I/O here, so it's all unit
// tested in test/cart.test.js.
//
// Lifecycle (card carts: the payer buys the cart from Spot, and Spot orders
// it from the store with its own single-use card)
//   open ──pay──▶ paid ──issue──▶ card_issued ──spend──▶ completed
//     │                        (Spot's card: merchant-locked, single use)
//     ├──mark_received──▶ completed        (venmo / cash app handoff mode)
//     ├──cancel──▶ canceled
//     └──expire──▶ expired
//   paid / card_issued / completed ──begin_refund──▶ refunding ──refund──▶ refunded
//   paid ──book──▶ completed               (flights: booked straight with the airline)
//
// A full refund always passes through `refunding` BEFORE any money moves, so
// an authorization that arrives mid-refund finds the card no longer active.
// Partial refunds (unused cushion, store returns) don't change the state;
// they add up in refunded_cents.

export const SETTLE_MODES = ['card', 'handoff'];

const TRANSITIONS = {
  open: { pay: 'paid', mark_received: 'completed', cancel: 'canceled', expire: 'expired' },
  paid: { issue: 'card_issued', book: 'completed', begin_refund: 'refunding' },
  card_issued: { spend: 'completed', begin_refund: 'refunding' },
  // A reversed or never-captured authorization, or a full return.
  completed: { begin_refund: 'refunding' },
  // Stays here if the payment provider fails mid-refund; retried from /admin.
  refunding: { refund: 'refunded' },
  canceled: {},
  expired: {},
  refunded: {},
};

export function transition(state, action, mode) {
  const next = TRANSITIONS[state]?.[action];
  if (!next) throw new CartError(`Can't ${action.replace('_', ' ')} a cart that is ${state}`, 409);
  // Handoff carts never take money through us, so they can't be "paid"; card
  // carts can't be closed by the requester just saying they got paid.
  if (mode === 'handoff' && action === 'pay') throw new CartError('This cart is paid directly by Venmo or Cash App', 409);
  if (mode === 'card' && action === 'mark_received') throw new CartError('Card carts complete when the card is used', 409);
  return next;
}

export class CartError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function config(env = process.env) {
  return {
    feeBps: int(env.SPOT_FEE_BPS, 400), // 4% payer fee
    feeFixedCents: int(env.SPOT_FEE_FIXED_CENTS, 0),
    maxCartCents: int(env.SPOT_MAX_CART_CENTS, 50000), // $500 cap per link while fraud controls are young
    maxFlightCents: int(env.SPOT_MAX_FLIGHT_CENTS, 200000), // flights are paid by the traveler themselves
    expiresHours: int(env.SPOT_EXPIRES_HOURS, 72),
  };
}

function int(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

const HANDLE = /^[A-Za-z0-9_-]{2,30}$/;

// Normalise and validate a create-cart payload. Throws CartError on bad input.
export function validateCart(input, cfg = config()) {
  const b = input && typeof input === 'object' ? input : {};
  const requester = b.requester && typeof b.requester === 'object' ? b.requester : {};
  const name = str(requester.name, 60);
  if (!name) throw new CartError('Your name is required');
  const email = str(requester.email, 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CartError('That email looks wrong');

  const merchant = str(b.merchant?.name ?? b.merchant, 80);
  if (!merchant) throw new CartError('Which store is this cart from?');
  const merchantUrl = safeUrl(b.merchant?.url ?? b.merchant_url);

  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (!rawItems.length) throw new CartError('Add at least one item');
  if (rawItems.length > 25) throw new CartError('A cart can hold up to 25 items');
  const items = rawItems.map((it, i) => {
    const title = str(it?.title, 140);
    if (!title) throw new CartError(`Item ${i + 1} needs a name`);
    const qty = Number.parseInt(it?.quantity ?? 1, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new CartError(`Item ${i + 1} quantity must be 1–20`);
    const price = cents(it?.price_cents);
    if (price === null || price < 1) throw new CartError(`Item ${i + 1} needs a price`);
    return {
      title,
      variant: str(it?.variant, 80) || null,
      quantity: qty,
      price_cents: price,
      image_url: safeUrl(it?.image_url),
      url: safeUrl(it?.url),
    };
  });

  const extras = cents(b.extras_cents ?? 0);
  if (extras === null) throw new CartError('Shipping and tax estimate must be a dollar amount');

  const settle = SETTLE_MODES.includes(b.settle) ? b.settle : 'card';
  // 'self': the requester pays their own cart (an agent built it and handed
  // it over to finish on their phone). 'other' (default): someone else pays.
  const forWhom = b.for === 'self' ? 'self' : 'other';
  if (forWhom === 'self' && settle !== 'card') throw new CartError('Your own carts are paid by card');
  let expiresMinutes = null;
  if (b.expires_minutes != null) {
    expiresMinutes = Number.parseInt(b.expires_minutes, 10);
    if (!Number.isInteger(expiresMinutes) || expiresMinutes < 5 || expiresMinutes > 72 * 60) throw new CartError('expires_minutes must be between 5 and 4320');
  }
  const venmo = str(requester.venmo, 31).replace(/^@/, '');
  const cashtag = str(requester.cashtag, 31).replace(/^\$/, '');
  if (venmo && !HANDLE.test(venmo)) throw new CartError('Venmo handle looks wrong');
  if (cashtag && !HANDLE.test(cashtag)) throw new CartError('Cash App $cashtag looks wrong');
  if (settle === 'handoff' && !venmo && !cashtag) throw new CartError('Add a Venmo handle or $cashtag to get paid directly');

  if (settle === 'card') {
    const bad = items.find((it) => cashlikeItem(`${it.title} ${it.variant || ''}`));
    if (bad) throw new CartError(`Spot can't buy gift cards, prepaid cards or other cash equivalents ("${bad.title}")`);
  }

  const totals = computeTotals(items, extras, settle, cfg, { cushion: b.kind !== 'flight' });
  if (totals.cart_cents > cfg.maxCartCents) {
    throw new CartError(`Carts are capped at ${usd(cfg.maxCartCents)} for now`);
  }

  return {
    requester: { name, email: email || null, venmo: venmo || null, cashtag: cashtag || null },
    merchant: { name: merchant, url: merchantUrl },
    note: str(b.note, 280) || null,
    for: forWhom,
    expires_minutes: expiresMinutes,
    items,
    settle,
    ...totals,
  };
}

// cart_cents    = the goods: items + shipping/tax estimate
// cushion_cents = room for tax and price changes at the store (card carts,
//                 not flights). The payer pays it up front; whatever the
//                 store doesn't charge comes back to them.
// fee_cents     = our fee, paid by the payer on top; zero in handoff mode
//                 because no money moves through us
// total_cents   = what the payer is charged
export function computeTotals(items, extrasCents, settle, cfg = config(), { cushion = true } = {}) {
  const subtotal = items.reduce((s, it) => s + it.price_cents * it.quantity, 0);
  const cart = subtotal + extrasCents;
  const fee = settle === 'handoff' ? 0 : Math.round((cart * cfg.feeBps) / 10000) + cfg.feeFixedCents;
  const room = settle === 'card' && cushion ? cushionCents(cart) : 0;
  return { subtotal_cents: subtotal, extras_cents: extrasCents, cart_cents: cart, cushion_cents: room, fee_cents: fee, total_cents: cart + room + fee };
}

// What the payer paid toward the goods (everything but the fee). Carts made
// before the cushion existed have none.
export function goodsCents(cart) {
  return cart.cart_cents + (cart.cushion_cents || 0);
}

// ─── Merchant lock ──────────────────────────────────────────────────────────
// Decides a real-time authorization on Spot's card. It may be used once, at
// the cart's store, for no more than the cart plus the cushion (prices and
// tax drift a little between capture and checkout), and never at a cash-like
// merchant.
export const AUTH_TOLERANCE_BPS = 500; // +5%
export const AUTH_TOLERANCE_MAX_CENTS = 1500; // capped at $15

export function cushionCents(cartCents) {
  return Math.min(Math.round((cartCents * AUTH_TOLERANCE_BPS) / 10000), AUTH_TOLERANCE_MAX_CENTS);
}

export function authLimitCents(cartCents) {
  return cartCents + cushionCents(cartCents);
}

// Cash and cash-like merchants, by Stripe Issuing category (enforced by the
// card network through spending controls) and by MCC (checked again here, in
// the real-time webhook). Gift cards sold by ordinary retailers carry the
// retailer's category, so carts also refuse gift-card items (validateCart).
export const BLOCKED_CATEGORIES = [
  'automated_cash_disburse', // 6011 ATMs
  'manual_cash_disburse', // 6010
  'financial_institutions', // 6012
  'non_fi_money_orders', // 6051 quasi-cash, crypto, money orders
  'wires_money_orders', // 4829 money transfers
  'non_fi_stored_value_card_purchase_load', // 6540 prepaid and gift card loads
  'security_brokers_dealers', // 6211
  'betting_casino_gambling', // 7995
  'government_licensed_online_casions_online_gambling_us_region_only', // 7801 (Stripe's spelling)
  'government_licensed_horse_dog_racing_us_region_only', // 7802
  'government_owned_lotteries_us_region_only', // 7800
  'government_owned_lotteries_non_us_region', // 9406
  'pawn_shops', // 5933
  'timeshares', // 7012
  'dating_escort_services', // 7273
  'massage_parlors', // 7297
];
export const BLOCKED_MCCS = new Set(['6010', '6011', '6012', '6051', '4829', '6540', '6211', '7995', '7801', '7802', '7800', '9406', '5933', '7012', '7273', '7297']);

export function decideAuthorization(cart, auth) {
  if (!cart) return { approved: false, reason: 'unknown_card' };
  if (cart.status !== 'card_issued') return { approved: false, reason: 'card_not_active' };
  if ((auth.currency || 'usd').toLowerCase() !== 'usd') return { approved: false, reason: 'currency' };
  if (!Number.isInteger(auth.amount_cents) || auth.amount_cents <= 0) return { approved: false, reason: 'amount' };
  const m = auth.merchant || {};
  if (BLOCKED_MCCS.has(String(m.category_code || '')) || BLOCKED_CATEGORIES.includes(m.category)) return { approved: false, reason: 'blocked_category' };
  if (auth.amount_cents > authLimitCents(cart.cart_cents)) return { approved: false, reason: 'over_limit' };
  if (!merchantMatches(cart.merchant, m)) return { approved: false, reason: 'wrong_merchant' };
  return { approved: true, reason: 'ok' };
}

// Card networks report merchant names in messy forms ("NIKE.COM", "NIKE
// 8291 PORTLAND OR", "SQ *BLUE BOTTLE", "AMZN Mktp US"). We match on the
// store's domain name and its whole name (or first two words), never on a
// single generic word, so "Blue Bottle Coffee" doesn't match any coffee shop.
const STOP = new Set(['the', 'inc', 'llc', 'ltd', 'co', 'com', 'shop', 'store', 'www', 'online', 'official', 'us', 'usa', 'and', 'sq', 'tst', 'paypal']);
// How some big stores appear on card statements.
const ALIASES = {
  amazon: ['amzn', 'amazon'],
  walmart: ['walmart', 'wmsupercenter', 'wmtcom'],
  target: ['target'],
  bestbuy: ['bestbuy', 'bbycom'],
  homedepot: ['homedepot', 'thdcom'],
  apple: ['applecom', 'appleinc', 'applestore'],
  costco: ['costco'],
  nordstrom: ['nordstrom', 'nordrack'],
  macys: ['macys'],
};

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));

export function merchantKeys(merchant) {
  const keys = new Set();
  const name = words(merchant?.name);
  if (name.length) {
    keys.add(name.join(''));
    if (name.length > 2) keys.add(name.slice(0, 2).join(''));
  }
  const host = hostOf(merchant?.url);
  if (host) {
    const labels = host.replace(/^www\./, '').split('.');
    // The label before the public suffix: nike.com → nike, shop.nike.co.uk → nike.
    const reg = labels.length > 2 && labels.at(-2).length <= 3 ? labels.at(-3) : labels.at(-2);
    if (reg) keys.add(reg.replace(/[^a-z0-9]/g, ''));
  }
  for (const k of [...keys]) for (const a of ALIASES[k] || []) keys.add(a);
  return new Set([...keys].filter((k) => k.length >= 3));
}

export function merchantMatches(cartMerchant, authMerchant) {
  const keys = merchantKeys(cartMerchant);
  if (!keys.size) return false;
  const hay = [authMerchant?.name, authMerchant?.url, hostOf(authMerchant?.url)].filter(Boolean).join(' ').toLowerCase();
  const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
  const squashed = tokens.join('');
  for (const k of keys) {
    // Short keys must be a whole word; longer ones may run into other text.
    if (k.length < 5 ? tokens.includes(k) : squashed.includes(k)) return true;
  }
  return false;
}

// Items Spot won't buy on its card: gift cards and other cash equivalents.
const CASHLIKE = /\b(e-?gift|gift\s*cards?|giftcards?|gift\s*certificates?|prepaid\s*(visa|mastercard|card|debit)|reload(able)?\s*(card|pack)|money\s*orders?|vanilla\s*(visa|gift)|visa\s*gift|amex\s*gift|mastercard\s*gift|bitcoin|crypto|store\s*credit)\b/i;
export function cashlikeItem(title) {
  return CASHLIKE.test(String(title || ''));
}

// ─── Handoff links ──────────────────────────────────────────────────────────
export function handoffLinks(cart) {
  const amount = (cart.cart_cents / 100).toFixed(2);
  const note = `Spot: ${cart.merchant.name} cart`;
  const links = [];
  if (cart.requester.venmo) {
    links.push({
      kind: 'venmo',
      label: `Venmo @${cart.requester.venmo}`,
      url: `https://venmo.com/u/${encodeURIComponent(cart.requester.venmo)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`,
    });
  }
  if (cart.requester.cashtag) {
    links.push({
      kind: 'cashapp',
      label: `Cash App $${cart.requester.cashtag}`,
      url: `https://cash.app/$${encodeURIComponent(cart.requester.cashtag)}/${amount}`,
    });
  }
  return links;
}

// ─── helpers ────────────────────────────────────────────────────────────────
export function usd(c) {
  return `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Accepts integer cents, or a dollar string/number via `dollarsToCents`.
function cents(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
}

export function dollarsToCents(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const m = String(v ?? '').replace(/[,\s]/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(Number(m[1]) * 100) : null;
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function safeUrl(v) {
  if (typeof v !== 'string' || !v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
