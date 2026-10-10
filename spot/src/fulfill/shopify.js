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
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let u = new URL(url);
    // Redirects are followed by hand, so each hop is checked for a public host.
    for (let hop = 0; ; hop++) {
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      if (!allowPrivate) await assertPublicHost(u.hostname);
      const res = await fetchImpl(u, { signal: ctrl.signal, redirect: 'manual', headers: { accept: 'application/json' } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || hop >= 4) return null;
        u = new URL(loc, u);
        continue;
      }
      if (!res.ok) return null;
      // Shopify serves /products/<handle>.js as JSON with a text/javascript type.
      if (!/json|javascript/.test(res.headers.get('content-type') || '')) return null;
      const chunks = [];
      let size = 0;
      for await (const c of res.body || []) {
        size += c.length;
        if (size > 2 * 1024 * 1024) return null;
        chunks.push(Buffer.from(c));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
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
export function matchVariant(variants, wanted, productTitle = '') {
  const hits = variantHits(variants, wanted, productTitle);
  return hits.length === 1 ? hits[0] : null;
}

// Every in-stock variant that has all the words asked for (all of them, if
// nothing was asked). One hit is a match; several mean a choice is missing.
function variantHits(variants, wanted, productTitle = '') {
  const available = variants.filter((v) => v.available !== false);
  const pool = available.length ? available : variants;
  if (pool.length <= 1) return pool;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
  // "0.5mm / Black" on "Jetstream Pen - 0.5mm": the 0.5mm is the product, Black is the variant.
  const inTitle = new Set(norm(productTitle).split(' '));
  const want = norm(wanted).split(' ').filter((w) => w && !inTitle.has(w));
  if (!want.length) return pool;
  return pool.filter((v) => {
    const opts = [v.option1, v.option2, v.option3, ...(v.title || '').split('/')].map(norm).filter(Boolean);
    const words = new Set(opts.flatMap((o) => o.split(' ')));
    return want.every((w) => words.has(w) || opts.includes(w));
  });
}

const SIZEISH = /^(\d*x{0,3}[sml]|\d*xl|one size|os|\d+(\.\d+)?( ?(w|wide|us|uk|eu))?|\d+ ?x ?\d+)$/i;

// What's still to pick when several variants fit, e.g. { name: 'Size',
// values: ['S', 'M', 'L'] }: the first option that differs between them.
export function missingChoice(product, wanted) {
  const hits = variantHits(product.variants || [], wanted, product.title);
  if (hits.length < 2) return null;
  const names = (product.options || []).map((o) => (typeof o === 'string' ? o : o?.name));
  for (let i = 0; i < 3; i++) {
    const values = [...new Set(hits.map((v) => v[`option${i + 1}`]).filter(Boolean))];
    if (values.length > 1) return { name: names[i] || (values.every((x) => SIZEISH.test(x)) ? 'Size' : 'option'), values: values.slice(0, 12) };
  }
  return null;
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
    const variant = matchVariant(product.variants, item.variant, product.title);
    if (!variant) return { origin, unresolved: item.title, choose: missingChoice(product, item.variant) };
    lines.push({ variant_id: variant.id, quantity: item.quantity, title: `${product.title}${variant.title && variant.title !== 'Default Title' ? ` — ${variant.title}` : ''}`, price_cents: variant.price });
  }
  return { origin, lines };
}

// An item the AI named but didn't link: the store's own search, then the
// product whose every title word is in the item's name (the longest such
// title wins, so "Jetstream Pen" doesn't beat "Jetstream Prime Pen" unless
// the item says Prime). Returns the product link, or null.
export async function findShopifyProduct(origin, title, opts) {
  const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().split(' ').filter(Boolean);
  const want = new Set(tokens(title));
  if (!want.size) return null;
  const q = new URLSearchParams({ q: String(title).replace(/\([^)]*\)/g, ' ').slice(0, 120), 'resources[type]': 'product', 'resources[limit]': '10' });
  const d = await fetchJson(`${origin}/search/suggest.json?${q}`, opts).catch(() => null);
  const found = d?.resources?.results?.products || [];
  let best = null;
  for (const p of found) {
    const t = tokens(p.title);
    if (!t.length || !t.every((w) => want.has(w))) continue;
    if (!best || t.length > best.n) best = { n: t.length, url: new URL(String(p.url || '').split('?')[0], origin).toString() };
  }
  return best?.url || null;
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
