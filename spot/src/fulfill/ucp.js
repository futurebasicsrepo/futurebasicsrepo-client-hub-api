// Universal Commerce Protocol (ucp.dev): stores that publish
// /.well-known/ucp expose checkout as an API, so Spot orders there
// without a browser or a model.
//
//   discover   GET <store>/.well-known/ucp → the dev.ucp.shopping REST endpoint
//   resolve    POST /catalog/lookup with each item's product URL → variant ids
//   checkout   POST /checkout-sessions (items + buyer), then PUT the shipping
//              address, then PUT the cheapest shipping option per package
//   confirm    the requester sees the store's own total and taps Place order
//   pay        a card-accepting handler that tokenizes (POST <endpoint>/tokenize,
//              bound to this checkout) → POST /checkout-sessions/{id}/complete
//
// Spot acts as a UCP *platform*. Its profile (platformProfile below) is
// served at /.well-known/ucp and named in the UCP-Agent header. Whenever the
// store needs a person (requires_escalation, no handler Spot can pay with,
// a 3-D Secure challenge), the requester gets the store's continue_url: the
// checkout with cart and address already in it, plus their one-time card.
import { randomUUID } from 'node:crypto';
import { assertPublicHost } from '../capture.js';
import { usd } from '../cart.js';

export const UCP_VERSION = '2026-08-25';
const SPEC = `https://ucp.dev/${UCP_VERSION}/specification`;
const SCHEMAS = `https://ucp.dev/${UCP_VERSION}/schemas`;
const TIMEOUT_MS = 15_000;
const TERMINAL = ['completed', 'canceled'];

export function platformProfile(base) {
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        'dev.ucp.shopping': [{ version: UCP_VERSION, transport: 'rest', spec: `${SPEC}/overview/`, schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/rest.openapi.json` }],
      },
      capabilities: {
        'dev.ucp.shopping.checkout': [{ version: UCP_VERSION, spec: `${SPEC}/shopping/checkout/`, schema: `${SCHEMAS}/shopping/checkout.json` }],
        'dev.ucp.shopping.fulfillment': [{ version: UCP_VERSION, spec: `${SPEC}/shopping/extensions/fulfillment/`, schema: `${SCHEMAS}/shopping/fulfillment.json`, extends: 'dev.ucp.shopping.checkout' }],
        'dev.ucp.shopping.catalog.lookup': [{ version: UCP_VERSION, spec: `${SPEC}/shopping/catalog/lookup/`, schema: `${SCHEMAS}/shopping/catalog_lookup.json` }],
      },
      payment_handlers: {},
    },
  };
}

export class UcpError extends Error {
  constructor(message, { code = null, continueUrl = null, status = null } = {}) {
    super(message);
    this.code = code;
    this.continueUrl = continueUrl;
    this.httpStatus = status;
  }
}

async function guard(url, allowPrivate) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !allowPrivate) throw new UcpError('UCP endpoints must be HTTPS');
  if (!allowPrivate) await assertPublicHost(u.hostname);
  return u;
}

async function send(fetchImpl, url, init, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal, redirect: 'error' });
  } finally {
    clearTimeout(t);
  }
}

// Links from the store end up as buttons on the requester's page: web
// links only.
function link(u, allowPrivate) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || (allowPrivate && x.protocol === 'http:') ? x.toString() : null;
  } catch {
    return null;
  }
}

// ─── Discovery ──────────────────────────────────────────────────────────────
export async function discover(storeUrl, { fetchImpl = fetch, allowPrivate = false } = {}) {
  let origin;
  try {
    origin = new URL(storeUrl).origin;
  } catch {
    return null;
  }
  try {
    const u = await guard(`${origin}/.well-known/ucp`, allowPrivate);
    // Short: every order checks this, and most stores don't have one yet.
    const res = await send(fetchImpl, u, { headers: { accept: 'application/json' } }, 4000);
    if (!res.ok) return null;
    const profile = await res.json();
    const ucp = profile?.ucp;
    const rest = (ucp?.services?.['dev.ucp.shopping'] || []).find((s) => s?.transport === 'rest' && s.endpoint);
    if (!rest) return null;
    const caps = ucp.capabilities || {};
    if (Object.keys(caps).length && !caps['dev.ucp.shopping.checkout']) return null;
    return {
      origin,
      endpoint: String(rest.endpoint).replace(/\/+$/, ''),
      version: rest.version || ucp.version,
      lookup: Boolean(caps['dev.ucp.shopping.catalog.lookup']),
      fulfillment: !Object.keys(caps).length || Boolean(caps['dev.ucp.shopping.fulfillment']),
    };
  } catch {
    return null;
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────
export function ucpClient({ endpoint, profileUrl, fetchImpl = fetch, allowPrivate = false }) {
  return async function call(method, path, body) {
    const u = await guard(`${endpoint}${path}`, allowPrivate);
    const headers = { accept: 'application/json', 'ucp-agent': `profile="${profileUrl}"`, 'request-id': randomUUID() };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['idempotency-key'] = randomUUID();
    }
    const res = await send(fetchImpl, u, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new UcpError(json.content || `The store answered ${res.status}`, { code: json.code, continueUrl: json.continue_url, status: res.status });
    // Business errors come back as 200 with ucp.status "error".
    if (json?.ucp?.status === 'error') {
      const m = json.messages?.find((x) => x.type === 'error') || json.messages?.[0];
      throw new UcpError(m?.content || 'The store refused', { code: m?.code, continueUrl: json.continue_url });
    }
    return json;
  };
}

// ─── Items ──────────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Picks the variant for a cart item: an exact match on the URL we asked
// about, else the one whose title carries the item's size/colour, else the
// store's featured pick (only when the item names no variant).
export function pickVariant(product, item, inputId) {
  const variants = (product?.variants || []).filter((v) => v.availability?.available !== false);
  const exact = variants.find((v) => v.inputs?.some((i) => i.id === inputId && i.match === 'exact'));
  if (exact) return exact;
  const want = norm(item.variant).split(' ').filter(Boolean);
  if (want.length) {
    return variants.find((v) => {
      const have = norm([v.title, ...(v.options || []).map((o) => o.label || o.value)].join(' ')).split(' ');
      return want.every((w) => have.includes(w));
    }) || null;
  }
  return variants.find((v) => v.inputs?.some((i) => i.id === inputId)) || (variants.length === 1 ? variants[0] : null);
}

async function resolveItems(call, cart) {
  const ids = cart.items.map((i) => i.url).filter(Boolean);
  if (ids.length !== cart.items.length) return null;
  const res = await call('POST', '/catalog/lookup', { ids, context: { address_country: 'US' } });
  const lines = [];
  for (const item of cart.items) {
    const product = (res.products || []).find((p) => p.variants?.some((v) => v.inputs?.some((i) => i.id === item.url)));
    const v = product && pickVariant(product, item, item.url);
    if (!v) return { unresolved: item.title };
    lines.push({ item: { id: v.id }, quantity: item.quantity });
  }
  return { lines };
}

// ─── Checkout ───────────────────────────────────────────────────────────────
const totalOf = (co) => co?.totals?.find((t) => t.type === 'total')?.amount ?? null;

function address(ship) {
  const [first, ...rest] = ship.name.split(' ');
  return {
    first_name: first,
    last_name: rest.join(' ') || first,
    street_address: ship.line1,
    ...(ship.line2 ? { extended_address: ship.line2 } : {}),
    address_locality: ship.city,
    address_region: ship.state,
    postal_code: ship.postal_code,
    address_country: 'US',
    ...(ship.phone ? { phone_number: ship.phone } : {}),
  };
}

function buyer(ship) {
  const a = address(ship);
  return { email: ship.email, first_name: a.first_name, last_name: a.last_name, ...(a.phone_number ? { phone_number: a.phone_number } : {}) };
}

// PUT replaces the session, so every update resends the whole state.
function state(co, ship, fulfillment) {
  return {
    buyer: buyer(ship),
    line_items: co.line_items.map((li) => ({ id: li.id, item: { id: li.item.id }, quantity: li.quantity })),
    ...(fulfillment ? { fulfillment } : {}),
  };
}

// Cheapest option in every package, keeping the store's destination id.
function selectShipping(co) {
  const methods = co.fulfillment?.methods || [];
  const ship = methods.find((m) => m.type === 'shipping');
  if (!ship) return null;
  const dest = ship.destinations?.find((d) => d.id === ship.selected_destination_id) || ship.destinations?.[0];
  const groups = (ship.groups || []).map((g) => {
    const cheapest = [...(g.options || [])].sort((a, b) => (totalOf(a) ?? Infinity) - (totalOf(b) ?? Infinity))[0];
    return { id: g.id, selected_option_id: g.selected_option_id || cheapest?.id };
  });
  return {
    methods: [{ ...(ship.id ? { id: ship.id } : {}), type: 'shipping', ...(ship.line_item_ids ? { line_item_ids: ship.line_item_ids } : {}), ...(dest?.id ? { selected_destination_id: dest.id } : {}), destinations: ship.destinations, ...(groups.length ? { groups } : {}) }],
  };
}

// A handler Spot can pay with: takes cards and names a tokenizer endpoint
// (the shared UCP Tokenization API). Anything else needs the requester.
export function payableHandler(co) {
  for (const [name, entries] of Object.entries(co?.ucp?.payment_handlers || {})) {
    for (const h of entries || []) {
      const cards = (h.available_instruments || []).some((i) => i.type === 'card');
      const endpoint = h.config?.endpoint || h.config?.tokenization_endpoint;
      if (cards && endpoint) return { name, id: h.id, endpoint: String(endpoint).replace(/\/+$/, ''), config: h.config };
    }
  }
  return null;
}

function blocked(co, fallback) {
  const m = (co?.messages || []).find((x) => x.severity === 'requires_buyer_input' || x.severity === 'requires_buyer_review' || x.type === 'error');
  return m?.content || fallback;
}

// Returns null when UCP can't take this cart (items not in the store's
// catalog), so the caller falls back to the other ways of ordering.
export async function runUcpCheckout(opts) {
  const out = await checkout(opts);
  if (out) {
    if ('manual_url' in out) out.manual_url = link(out.manual_url, opts.allowPrivate);
    if ('order_url' in out) out.order_url = link(out.order_url, opts.allowPrivate);
  }
  return out;
}

async function checkout({ discovery, cart, shipping, card, profileUrl, limit, confirm, progress = () => {}, fetchImpl = fetch, allowPrivate = false }) {
  const call = ucpClient({ endpoint: discovery.endpoint, profileUrl, fetchImpl, allowPrivate });
  if (!discovery.lookup) return null;
  const resolved = await resolveItems(call, cart).catch(() => null);
  if (!resolved?.lines) return null;
  progress(`Found your items in ${cart.merchant.name}'s catalog`);

  let co;
  try {
    co = await call('POST', '/checkout-sessions', { line_items: resolved.lines, buyer: buyer(shipping) });
    progress('Started checkout with the store');
    if (discovery.fulfillment) {
      co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, shipping, { methods: [{ type: 'shipping', destinations: [address(shipping)] }] }));
      const pick = selectShipping(co);
      if (pick) co = await call('PUT', `/checkout-sessions/${encodeURIComponent(co.id)}`, state(co, shipping, pick));
      progress('Added your address and the cheapest shipping');
    }
  } catch (err) {
    return { status: 'needs_you', method: 'ucp', reason: `${cart.merchant.name}'s checkout said: ${err.message}`, manual_url: err.continueUrl || co?.continue_url || null };
  }

  const manual = co.continue_url || null;
  if (co.status === 'requires_escalation' || co.status === 'incomplete' || TERMINAL.includes(co.status)) {
    return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: blocked(co, `${cart.merchant.name} needs you to finish this checkout`), manual_url: manual };
  }
  const total = totalOf(co);
  if (co.currency && co.currency !== 'USD') return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: `The store priced this in ${co.currency}`, manual_url: manual };
  if (total == null) return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: "The store didn't give a total", manual_url: manual };
  if (total > limit) return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: `The store's total is ${usd(total)}, above the card limit of ${usd(limit)}`, manual_url: manual };

  const handler = payableHandler(co);
  if (!handler) {
    return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: `${cart.merchant.name}'s checkout is ready with your cart and address. Pay there with your one-time card`, manual_url: manual };
  }

  const lines = co.line_items.map((li) => `${li.quantity}× ${li.item?.title || 'item'}`).join(', ');
  const ship = co.totals.find((t) => t.type === 'fulfillment')?.amount;
  const tax = co.totals.find((t) => t.type === 'tax')?.amount;
  const summary = [lines, ship != null ? `shipping ${usd(ship)}` : null, tax != null ? `tax ${usd(tax)}` : null, `to ${shipping.line1}, ${shipping.city}`].filter(Boolean).join(' · ');
  progress('Waiting for you to confirm');
  if (!(await confirm({ total_cents: total, summary, screenshot: null }))) {
    await call('POST', `/checkout-sessions/${encodeURIComponent(co.id)}/cancel`, {}).catch(() => {});
    return { status: 'cancelled', method: 'ucp', reason: 'You chose not to place the order' };
  }

  progress('Placing your order');
  try {
    const tok = await guard(`${handler.endpoint}/tokenize`, allowPrivate);
    const tr = await send(fetchImpl, tok, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'ucp-agent': `profile="${profileUrl}"` },
      body: JSON.stringify({
        credential: { type: 'pan', number: card.number, expiry_month: card.exp_month, expiry_year: card.exp_year, cvc: card.cvc, name: cart.requester.name },
        binding: { type: 'dev.ucp.shopping.checkout', id: co.id },
        ...(handler.config?.business_id ? { identity: { access_token: handler.config.business_id } } : {}),
      }),
    });
    const { token } = await tr.json().catch(() => ({}));
    if (!tr.ok || !token) throw new UcpError("The store's card processor didn't accept the card");
    const b = cart.requester.billing;
    co = await call('POST', `/checkout-sessions/${encodeURIComponent(co.id)}/complete`, {
      payment: {
        instruments: [{
          id: `spot_${cart.id}`,
          handler_id: handler.id,
          type: 'card',
          selected: true,
          display: { brand: String(cart.card?.brand || 'visa').toLowerCase(), last_digits: String(card.number).slice(-4) },
          ...(b ? { billing_address: { street_address: b.line1, address_locality: b.city, address_region: b.state, postal_code: b.postal_code, address_country: 'US' } } : {}),
          credential: { type: 'token', token },
        }],
      },
    });
    for (let i = 0; i < 10 && co.status === 'complete_in_progress'; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      co = await call('GET', `/checkout-sessions/${encodeURIComponent(co.id)}`);
    }
  } catch (err) {
    return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: `Paying didn't go through: ${err.message}`, manual_url: err.continueUrl || manual };
  }
  if (co.status === 'completed') {
    return { status: 'placed', method: 'ucp', checkout_id: co.id, order_number: co.order?.id || null, order_url: co.order?.permalink_url || null };
  }
  return { status: 'needs_you', method: 'ucp', checkout_id: co.id, reason: blocked(co, `${cart.merchant.name} needs you to finish paying`), manual_url: co.continue_url || manual };
}
