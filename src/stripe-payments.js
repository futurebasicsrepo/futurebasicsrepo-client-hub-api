// Stripe as the payment processor for automatic payments: cards (with Apple Pay and Google Pay) and US bank accounts (ACH). Same seam as qb-payments.js, so autopay.js
// does not know which one it is talking to. Money that was taken is still booked in QuickBooks by autopay.js; this file only knows Stripe.
//
//   * The client adds their details on Stripe's own page (Checkout in setup mode), never on ours: the number, the bank login and the wallet sheet all stay with Stripe,
//     so none of it can reach this server, a log or the database. We keep only the ids Stripe hands back (a customer, a payment method) and the last four digits.
//   * Every charge carries an Idempotency-Key that is the same for the same attempt, so asking twice can never take the money twice.
//   * A card answers at once. A bank debit is "processing" for a few business days, then it settles or fails (read by polling, and sooner when the webhook arrives).
//   * No SDK: the API is plain form-encoded HTTPS, and the base address can be pointed at a stand-in for tests (STRIPE_API_BASE).
import { createHmac, timingSafeEqual } from 'node:crypto';

const usd = cents => Math.round(Number(cents));
// Stripe's form encoding: nested objects as a[b]=c and lists as a[]=c (or a[0][b]=c for lists of objects).
export function encode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (x && typeof x === 'object' ? encode(x, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(x)}`)));
    else if (typeof v === 'object') encode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}

// The Stripe-Signature header is `t=<time>,v1=<hmac>[,v1=...]` over `<time>.<raw body>`. Refuses old ones (replays) and anything that does not match.
export function verifyWebhook({ rawBody, header, secret, now = Date.now(), toleranceSec = 300 }) {
  if (!secret || !header) return false;
  const parts = String(header).split(',').map(s => s.trim().split('=')), t = parts.find(p => p[0] === 't')?.[1], sigs = parts.filter(p => p[0] === 'v1').map(p => p[1]);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const want = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return sigs.some(s => { try { const b = Buffer.from(s, 'hex'); return b.length === want.length && timingSafeEqual(b, want); } catch { return false; } });
}
export const signWebhook = ({ rawBody, secret, t = Math.floor(Date.now() / 1000) }) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`; // for tests

export function createStripe({ env = process.env, fetchImpl = (...a) => fetch(...a), log = console } = {}) {
  const key = () => String(env.STRIPE_SECRET_KEY || '').trim(), base = () => String(env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
  const configured = () => /^(sk|rk)_(test|live)_/.test(key()) || (Boolean(env.STRIPE_API_BASE) && Boolean(key()));
  const live = () => /_live_/.test(key());
  const webhookSecret = () => String(env.STRIPE_WEBHOOK_SECRET || '').trim();

  async function call(path, { method = 'GET', form, idempotencyKey, expand = [] } = {}) {
    const q = expand.map(e => `expand[]=${encodeURIComponent(e)}`).join('&'), url = `${base()}/v1${path}${method === 'GET' && q ? `?${q}` : ''}`;
    const body = method !== 'GET' ? encode({ ...form, ...(expand.length ? { expand } : {}) }).join('&') : undefined;
    const res = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${key()}`, ...(body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey).slice(0, 255) } : {}) }, body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = j?.error || {}, detail = String(e.message || `Stripe answered ${res.status}`).slice(0, 240);
      log.warn?.({ stripe: true, status: res.status, type: e.type, code: e.code, decline_code: e.decline_code, message: detail, method, path: path.replace(/\/[a-z]{2,4}_[0-9A-Za-z]{6,}/g, '/{id}') }, 'Stripe call failed');
      throw Object.assign(new Error(`Stripe: ${detail}`), { status: res.status, code: e.code || '', declineCode: e.decline_code || '', type: e.type || '', detail, refused: res.status === 401 || res.status === 403, paymentIntent: e.payment_intent || null });
    }
    return j;
  }

  // ---- saving details: the client is sent to Stripe's page, then comes back ----
  async function ensureCustomer({ id = '', email = '', name = '', metadata = {} } = {}) {
    if (id) return { id };
    const c = await call('/customers', { method: 'POST', form: { email, name, metadata } });
    return { id: String(c.id) };
  }
  // kind: 'card' (cards, Apple Pay and Google Pay come with it) | 'bank' (US bank account by ACH). → { id, url }
  async function startSetup({ customerId, kind, successUrl, cancelUrl, metadata = {}, idempotencyKey }) {
    const form = { mode: 'setup', currency: 'usd', customer: customerId, success_url: successUrl, cancel_url: cancelUrl, payment_method_types: [kind === 'bank' ? 'us_bank_account' : 'card'], metadata,
      setup_intent_data: { metadata },
      ...(kind === 'bank' ? { payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method'] } } } } : {}) };
    const s = await call('/checkout/sessions', { method: 'POST', form, idempotencyKey });
    return { id: String(s.id), url: String(s.url) };
  }
  const instrumentOf = pm => {
    if (!pm) return null;
    if (pm.type === 'us_bank_account') { const b = pm.us_bank_account || {}, type = /savings/i.test(b.account_type || '') ? 'Savings' : 'Checking'; return { id: String(pm.id), kind: 'bank', last4: String(b.last4 || ''), brand: b.bank_name || type, exp: '', label: `${type} account ending ${b.last4 || '????'}` }; }
    const c = pm.card || {}, wallet = c.wallet?.type, brand = ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' })[c.brand] || 'Card';
    const w = wallet === 'apple_pay' ? 'Apple Pay · ' : wallet === 'google_pay' ? 'Google Pay · ' : '';
    return { id: String(pm.id), kind: 'card', last4: String(c.last4 || ''), brand, wallet: wallet || '', exp: c.exp_month && c.exp_year ? `${String(c.exp_month).padStart(2, '0')}/${String(c.exp_year).slice(-2)}` : '', label: `${w}${brand} ending ${c.last4 || '????'}` };
  };
  // What a finished setup saved. complete: the details are saved and usable. verifying: a bank account waiting for the client to confirm the two small test deposits.
  const setupRead = (si, customer, metadata) => {
    const pm = si?.payment_method && typeof si.payment_method === 'object' ? si.payment_method : null;
    return { complete: Boolean(si && si.status === 'succeeded' && pm), verifying: Boolean(si && si.status === 'requires_action' && /microdeposit/.test(si.next_action?.type || '')), customerId: String(customer || si?.customer || ''), metadata: { ...(si?.metadata || {}), ...(metadata || {}) }, instrument: si?.status === 'succeeded' ? instrumentOf(pm) : null };
  };
  async function readSetup(sessionId) {
    const s = await call(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { expand: ['setup_intent.payment_method'] });
    return setupRead(s.setup_intent && typeof s.setup_intent === 'object' ? s.setup_intent : null, s.customer, s.metadata);
  }
  async function readIntent(id) { return setupRead(await call(`/setup_intents/${encodeURIComponent(id)}`, { expand: ['payment_method'] })); }
  async function removeInstrument(_ctx, { id }) { try { await call(`/payment_methods/${encodeURIComponent(id)}/detach`, { method: 'POST', form: {} }); return true; } catch (e) { if (e.status === 404) return true; throw e; } }

  // ---- taking a payment ----
  // → { id, status: 'succeeded' | 'pending' | 'declined', reason }. A card answers at once; a bank debit is pending until it settles.
  const piState = pi => {
    const st = String(pi.status || '');
    if (st === 'succeeded') return { id: String(pi.id), status: 'succeeded', reason: '' };
    if (st === 'processing') return { id: String(pi.id), status: 'pending', reason: '' };
    const why = pi.last_payment_error?.message || (st === 'requires_action' ? 'The card needs the cardholder to confirm this payment' : `The payment was not accepted (${st.replace(/_/g, ' ') || 'declined'})`);
    return { id: String(pi.id || ''), status: 'declined', reason: String(why).slice(0, 240) };
  };
  async function charge(_ctx, { kind, instrumentId, customerId, amountCents, currency = 'USD', requestId, description = '', metadata = {} }) {
    try {
      const pi = await call('/payment_intents', { method: 'POST', idempotencyKey: requestId, form: { amount: usd(amountCents), currency: String(currency).toLowerCase(), customer: customerId, payment_method: instrumentId, payment_method_types: [kind === 'bank' ? 'us_bank_account' : 'card'], off_session: true, confirm: true, description: String(description).slice(0, 300), metadata } });
      return piState(pi);
    } catch (e) {
      // a card the bank said no to comes back as a 402 with the payment attached: that is a decline, not a failure to ask
      if (e.status === 402 || e.type === 'card_error') return { id: String(e.paymentIntent?.id || ''), status: 'declined', reason: e.detail };
      throw e;
    }
  }
  async function status(_ctx, { chargeId }) { return piState(await call(`/payment_intents/${encodeURIComponent(chargeId)}`)); }
  // What Stripe kept as its fee on a payment, and what reaches the bank. → { feeCents, netCents } or null while Stripe has not worked it out yet.
  async function fees(chargeId) {
    const pi = await call(`/payment_intents/${encodeURIComponent(chargeId)}`, { expand: ['latest_charge.balance_transaction'] }), bt = pi.latest_charge?.balance_transaction;
    return bt && typeof bt === 'object' ? { feeCents: Number(bt.fee || 0), netCents: Number(bt.net || 0), payoutId: '' } : null;
  }

  return { name: 'stripe', configured, live, webhookSecret, ensureCustomer, startSetup, readSetup, readIntent, instrumentOf, removeInstrument, charge, status, fees, saveInstrument: async () => { throw new Error('Stripe details are added on the Stripe page'); } };
}
