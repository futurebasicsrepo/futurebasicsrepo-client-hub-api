// Shopify stores: no AI needed to build the order.
//
// Every Shopify store serves its product data at /products/<handle>.js and
// accepts "cart permalinks" (/cart/<variant>:<qty>,…) that open checkout
// with the cart already built and the contact + shipping fields prefilled.
// What Shopify does not allow (for a store you don't own) is paying without
// a person or a browser on the payment step, so this module gets the order
// to that step; the checkout agent or the requester does the last tap.
import { assertPublicHost } from '../capture.js';

const TIMEOUT_MS = 6000;

export async function fetchJson(url, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
  const u = new URL(url);
  if (!allowPrivate) await assertPublicHost(u.hostname);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(u, { signal: ctrl.signal, redirect: 'follow', headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    // Shopify serves /products/<handle>.js as JSON with a text/javascript type.
    if (!/json|javascript/.test(res.headers.get('content-type') || '')) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// /products/<handle> anywhere in the path (collections/x/products/y, /en-us/products/y…)
export function productHandle(url) {
  try {
    return new URL(url).pathname.match(/\/products\/([^/?#]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

export async function loadShopifyProduct(productUrl, opts) {
  const handle = productHandle(productUrl);
  if (!handle) return null;
  const origin = new URL(productUrl).origin;
  const p = await fetchJson(`${origin}/products/${handle}.js`, opts);
  if (!p || !Array.isArray(p.variants)) return null;
  return { origin, handle, title: p.title, variants: p.variants };
}

// Pick the variant the requester meant. Captured variant text looks like
// "Black / M" or "10.5"; Shopify variants have option1..3 and a title.
export function matchVariant(variants, wanted) {
  const available = variants.filter((v) => v.available !== false);
  const pool = available.length ? available : variants;
  if (pool.length === 1 || !wanted) return pool.length === 1 ? pool[0] : null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
  const want = norm(wanted).split(' ').filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const v of pool) {
    const opts = [v.option1, v.option2, v.option3, ...(v.title || '').split('/')].map(norm).filter(Boolean);
    const words = new Set(opts.flatMap((o) => o.split(' ')));
    const score = want.filter((w) => words.has(w) || opts.includes(w)).length;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return bestScore === want.length ? best : null;
}

// Resolve every cart item to a Shopify variant. Returns null unless the
// whole cart is from one Shopify store and every line resolves.
export async function resolveShopifyCart(cart, opts) {
  const lines = [];
  let origin = null;
  for (const item of cart.items) {
    if (!item.url) return null;
    const product = await loadShopifyProduct(item.url, opts);
    if (!product) return null;
    if (origin && origin !== product.origin) return null;
    origin = product.origin;
    const variant = matchVariant(product.variants, item.variant);
    if (!variant) return { origin, unresolved: item.title };
    lines.push({ variant_id: variant.id, quantity: item.quantity, title: `${product.title}${variant.title && variant.title !== 'Default Title' ? ` — ${variant.title}` : ''}`, price_cents: variant.price });
  }
  return { origin, lines };
}

// Cart permalink with contact + shipping prefilled.
export function checkoutUrl(origin, lines, shipping) {
  const path = lines.map((l) => `${l.variant_id}:${l.quantity}`).join(',');
  const q = new URLSearchParams();
  if (shipping) {
    const [first, ...rest] = String(shipping.name || '').trim().split(/\s+/);
    const pairs = {
      'checkout[email]': shipping.email,
      'checkout[shipping_address][first_name]': first,
      'checkout[shipping_address][last_name]': rest.join(' '),
      'checkout[shipping_address][address1]': shipping.line1,
      'checkout[shipping_address][address2]': shipping.line2,
      'checkout[shipping_address][city]': shipping.city,
      'checkout[shipping_address][province]': shipping.state,
      'checkout[shipping_address][zip]': shipping.postal_code,
      'checkout[shipping_address][country]': 'US',
      'checkout[shipping_address][phone]': shipping.phone,
    };
    for (const [k, v] of Object.entries(pairs)) if (v) q.set(k, v);
  }
  const qs = q.toString();
  return `${origin}/cart/${path}${qs ? `?${qs}` : ''}`;
}
