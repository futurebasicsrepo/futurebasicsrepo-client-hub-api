// Pure cart logic: validation, money math, the lifecycle state machine, and
// the merchant-lock decision for issued cards. No I/O here, so it's all unit
// tested in test/cart.test.js.
//
// Lifecycle
//   open ──pay──▶ paid ──issue──▶ card_issued ──spend──▶ completed
//     │                                   (merchant-locked, single use)
//     ├──mark_received──▶ completed        (venmo / cash app handoff mode)
//     ├──cancel──▶ canceled
//     └──expire──▶ expired
//   paid / card_issued ──refund──▶ refunded

export const SETTLE_MODES = ['card', 'handoff'];

const TRANSITIONS = {
  open: { pay: 'paid', mark_received: 'completed', cancel: 'canceled', expire: 'expired' },
  paid: { issue: 'card_issued', refund: 'refunded' },
  card_issued: { spend: 'completed', refund: 'refunded' },
  completed: {},
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

  const totals = computeTotals(items, extras, settle, cfg);
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

// cart_cents = what the card is allowed to spend (items + shipping/tax estimate)
// fee_cents  = our fee, paid by the payer on top; zero in handoff mode because
//              no money moves through us
// total_cents = what the payer is charged
export function computeTotals(items, extrasCents, settle, cfg = config()) {
  const subtotal = items.reduce((s, it) => s + it.price_cents * it.quantity, 0);
  const cart = subtotal + extrasCents;
  const fee = settle === 'handoff' ? 0 : Math.round((cart * cfg.feeBps) / 10000) + cfg.feeFixedCents;
  return { subtotal_cents: subtotal, extras_cents: extrasCents, cart_cents: cart, fee_cents: fee, total_cents: cart + fee };
}

// ─── Merchant lock ──────────────────────────────────────────────────────────
// Decides a real-time card authorization. The issued card may be used once,
// at the cart's merchant, for no more than the cart amount plus a small
// tolerance (prices and tax drift a little between capture and checkout).
export const AUTH_TOLERANCE_BPS = 500; // +5%
export const AUTH_TOLERANCE_MAX_CENTS = 1500; // capped at $15

export function authLimitCents(cartCents) {
  return cartCents + Math.min(Math.round((cartCents * AUTH_TOLERANCE_BPS) / 10000), AUTH_TOLERANCE_MAX_CENTS);
}

export function decideAuthorization(cart, auth) {
  if (!cart) return { approved: false, reason: 'unknown_card' };
  if (cart.status !== 'card_issued') return { approved: false, reason: 'card_not_active' };
  if ((auth.currency || 'usd').toLowerCase() !== 'usd') return { approved: false, reason: 'currency' };
  if (!Number.isInteger(auth.amount_cents) || auth.amount_cents <= 0) return { approved: false, reason: 'amount' };
  if (auth.amount_cents > authLimitCents(cart.cart_cents)) return { approved: false, reason: 'over_limit' };
  if (!merchantMatches(cart.merchant, auth.merchant)) return { approved: false, reason: 'wrong_merchant' };
  return { approved: true, reason: 'ok' };
}

// Card networks report merchant names in messy forms ("NIKE.COM", "NIKE
// 8291 PORTLAND OR", "SQ *BLUE BOTTLE"). We match on the distinctive word
// of the store's name or domain appearing in the network name or URL.
const STOP = new Set(['the', 'inc', 'llc', 'ltd', 'co', 'com', 'shop', 'store', 'www', 'online', 'official', 'us', 'usa', 'and', 'sq', 'tst', 'paypal']);

export function merchantKeys(merchant) {
  const keys = new Set();
  const add = (s) => {
    for (const w of String(s || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) keys.add(w);
    }
  };
  add(merchant?.name);
  const host = hostOf(merchant?.url);
  if (host) add(host.replace(/^www\./, '').split('.').slice(0, -1).join(' '));
  return keys;
}

export function merchantMatches(cartMerchant, authMerchant) {
  const keys = merchantKeys(cartMerchant);
  if (!keys.size) return false;
  const hay = [authMerchant?.name, authMerchant?.url, hostOf(authMerchant?.url)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const squashed = hay.replace(/ /g, '');
  for (const k of keys) {
    if (hay.split(' ').includes(k) || squashed.includes(k)) return true;
  }
  return false;
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
