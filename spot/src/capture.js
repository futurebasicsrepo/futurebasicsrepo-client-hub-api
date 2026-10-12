// Capture: turn "something the requester is looking at" into a draft cart.
//
//   captureFromUrl(url)          product or cart page → items via JSON-LD, then
//                                Open Graph / product meta tags
//   captureFromScreenshot(img)   screenshot of any cart → items via Claude vision
//   captureFromText(text)        whatever was typed or shared: a link inside the
//                                text is fetched; otherwise Claude looks the
//                                product up on the web
//
// Both return a *draft*: the requester always reviews and can edit the items
// and total before a link is made, so a misread never charges anyone.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Anthropic, anthropicClient } from './anthropic.js';
import { dollarsToCents } from './cart.js';

const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 8000;

// ─── URL capture ────────────────────────────────────────────────────────────
export async function captureFromUrl(rawUrl, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1', sign = null, hops = 0 } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CaptureError('That link is not a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new CaptureError('Only http(s) links can be captured');
  if (!allowPrivate) await assertPublicHost(url.hostname);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let html;
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      redirect: 'manual', // a redirect could point at a private address; don't follow blindly
      // Signed (Web Bot Auth), so stores can tell Spot from other bots.
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SpotBot/0.2; +https://spotmeplease.com/for-stores)', accept: 'text/html', ...(sign ? sign(url) : {}) },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new CaptureError('The store redirected without a destination');
      if (hops >= 6) throw new CaptureError('That link redirects too many times');
      clearTimeout(timer);
      return captureFromUrl(new URL(loc, url).toString(), { fetchImpl, allowPrivate, sign, hops: hops + 1 });
    }
    if (!res.ok) throw new CaptureError(`The store returned ${res.status}`);
    html = await readCapped(res, MAX_HTML_BYTES);
  } catch (err) {
    if (err instanceof CaptureError) throw err;
    throw new CaptureError(err.name === 'AbortError' ? 'The store took too long to respond' : 'Could not reach that store');
  } finally {
    clearTimeout(timer);
  }
  return parseProductHtml(html, url.toString());
}

export function parseProductHtml(html, pageUrl) {
  const meta = readMeta(html);
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const merchant = {
    name: decode(meta['og:site_name'] || meta['application-name'] || '') || prettyHost(host),
    url: new URL(pageUrl).origin,
  };

  const items = [];
  const offers = [];
  const links = []; // on a listing page: the products it links to, for resolveListing
  for (const node of jsonLdNodes(html)) {
    const types = [].concat(node['@type'] || []).map(String);
    if (types.includes('ItemList') && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement.slice(0, 200)) {
        const x = el?.item && typeof el.item === 'object' ? el.item : el;
        const url = absolute(x?.url || el?.url, pageUrl);
        if (url && x?.name) links.push({ url, text: decode(String(x.name)) });
      }
    }
    if (types.includes('Product')) offers.push(...offersOf(node));
    if (types.includes('ProductGroup') && Array.isArray(node.hasVariant)) for (const v of node.hasVariant) offers.push(...offersOf({ ...v, name: v?.name || node.name }));
    if (types.includes('Product')) {
      const item = productFromLd(node, pageUrl);
      if (item) items.push(item);
    }
    if (types.includes('ProductGroup') && Array.isArray(node.hasVariant) && !items.length) {
      const first = productFromLd({ ...node.hasVariant[0], name: node.hasVariant[0]?.name || node.name, image: node.hasVariant[0]?.image || node.image }, pageUrl);
      if (first) items.push(first);
    }
  }

  let blocked = false;
  if (!items.length) {
    const cur = String(meta['product:price:currency'] || meta['og:price:currency'] || 'USD').toUpperCase();
    const price = cur === 'USD' ? dollarsToCents(meta['product:price:amount'] || meta['og:price:amount'] || meta['twitter:data1'] || '') : null;
    const title = decode(meta['og:title'] || meta['twitter:title'] || titleTag(html) || '');
    // A store's bot check ("Robot or human?", "Just a moment…") is not a product.
    blocked = BOT_WALL.test(title);
    if (title && !blocked) {
      items.push({
        title: title.slice(0, 140),
        variant: null,
        quantity: 1,
        price_cents: price && price > 0 ? price : null,
        image_url: absolute(meta['og:image'] || meta['twitter:image'], pageUrl),
        url: pageUrl,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const it of items) {
    const k = `${it.title}|${it.price_cents}`;
    if (!seen.has(k)) {
      seen.add(k);
      deduped.push(it);
    }
  }

  // No structured offers: some stores only say it in a meta tag.
  const metaStock = availabilityOf(meta['product:availability'] || meta['og:availability'] || meta['availability']);
  if (!offers.length && metaStock != null) offers.push({ words: new Set(), in: metaStock });
  const soldOut = !blocked && deduped.length > 0 && stockFrom(offers, deduped[0].variant, deduped[0].title) === 'out';

  const out = {
    source: 'url',
    merchant,
    items: deduped.slice(0, 25),
    needs_review: deduped.some((i) => !i.price_cents) || !deduped.length || soldOut,
    ...(blocked ? { warning: `${merchant.name} doesn’t let Spot read its pages. Add the item and price below` } : {}),
    ...(soldOut ? { sold_out: true, warning: `${merchant.name} shows this as sold out. Ask Spot to find another below` } : {}),
  };
  // What the page says about stock, per option, for stockOf (not sent to the browser).
  Object.defineProperty(out, 'offers', { value: offers, enumerable: false });
  Object.defineProperty(out, 'links', { value: [...links, ...anchorsOf(html, pageUrl)], enumerable: false });
  return out;
}

// ─── Stock ──────────────────────────────────────────────────────────────────
// Is it in stock? Asked of the store's own data, never of the model: a web
// search can turn up a product page long after the last one sold.
//   Shopify stores   /products/<handle>.js, each variant's `available`
//   everyone else    schema.org availability on the product page's offers
// 'in' | 'out' | 'unknown' (the store didn't say, or couldn't be read).
const OUT = new Set(['outofstock', 'soldout', 'discontinued', 'instoreonly']);
const IN = new Set(['instock', 'limitedavailability', 'onlineonly', 'preorder', 'presale', 'backorder']);
function availabilityOf(v) {
  const k = String(v || '').toLowerCase().replace(/^.*[/#]/, '').replace(/[^a-z]/g, '');
  return OUT.has(k) ? false : IN.has(k) ? true : null;
}
const wordsOf = (...xs) => new Set(xs.map((x) => String(x || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()).join(' ').split(' ').filter(Boolean));

function offersOf(node) {
  const out = [];
  for (const o of [].concat(node?.offers || [])) {
    if (!o || typeof o !== 'object') continue;
    const inStock = availabilityOf(o.availability);
    if (inStock == null) continue;
    out.push({ words: wordsOf(node.name, node.color, node.size, node.sku, o.name, o.sku, ...[].concat(node.additionalProperty || []).map((p) => p?.value)), in: inStock });
  }
  return out;
}

// The option asked for ("Natural / 2T"): just its offers, when the store
// names them; otherwise the product as a whole is in stock if any of it is.
export function stockFrom(offers, variant, title = '') {
  if (!offers?.length) return 'unknown';
  const inTitle = wordsOf(title);
  const want = [...wordsOf(variant)].filter((w) => !inTitle.has(w));
  const hits = want.length ? offers.filter((o) => want.every((w) => o.words.has(w))) : [];
  const pool = hits.length ? hits : offers;
  return pool.some((o) => o.in) ? 'in' : 'out';
}

export async function stockOf(item, { fromUrl = captureFromUrl, product = shopifyProduct } = {}) {
  if (!item?.url) return 'unknown';
  const p = await product(item.url).catch(() => null);
  if (p?.variants?.length) {
    return stockFrom(p.variants.map((v) => ({ words: wordsOf(v.option1, v.option2, v.option3, v.title), in: v.available !== false })), item.variant, p.title);
  }
  const page = await fromUrl(item.url).catch(() => null);
  if (!page || page.warning?.includes('doesn’t let Spot')) return 'unknown';
  return stockFrom(page.offers, item.variant, item.title);
}

// ─── Listing pages ──────────────────────────────────────────────────────────
// Search sees result snippets, so it sometimes links a category or search
// page ("hoodies under $50") instead of the product. Find the product it named
// on that store: Shopify's own product search first, then the page's links.
const LISTING = /\/(collections|category|categories|c|shop|browse|search|s)(\/|$)|[?&](q|k|query|keyword|keywords|searchterm|text|search)=|-l\d+\.html$/i;
export function looksLikeListing(url) {
  try {
    const u = new URL(url);
    if (/\/products\/[^/]+/.test(u.pathname)) return false;
    return LISTING.test(u.pathname + u.search);
  } catch {
    return false;
  }
}
const FILLER = new Set(['the', 'and', 'for', 'with', 'in', 'of', 'a', 'an', 'to', 'by', 'mens', 'men', 'womens', 'women', 's', 'unisex', 'new']);
const keyWords = (t) => [...wordsOf(String(t).replace(/['’]/g, ''))].filter((w) => w.length > 1 && !FILLER.has(w)).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
// How much of the product's name a link's text carries: 0..1.
export function titleMatch(title, text) {
  const want = keyWords(title);
  if (!want.length) return 0;
  const have = new Set(keyWords(text));
  const hits = want.filter((w) => have.has(w)).length;
  return hits < Math.min(2, want.length) ? 0 : hits / want.length;
}
// "women" or "men", if the words say which.
const genderOf = (s) => (/\b(wom[ae]n|ladies|her)['’]?s?\b/i.test(s) ? 'women' : /\bm[ae]n['’]?s?\b/i.test(s) ? 'men' : null);
// `match` (when a store gives more than a name: type, description) is scored;
// `text` is the name. A men's or women's page prefers that side.
const bestMatch = (title, cands, hint = null, min = 0.6) =>
  cands
    .map((c) => {
      const score = titleMatch(title, c.match || c.text);
      const g = hint && genderOf(c.text);
      return { ...c, score, rank: score + (g ? (g === hint ? 0.05 : -0.05) : 0) };
    })
    .filter((c) => c.score >= min)
    .sort((a, b) => b.rank - a.rank || a.text.length - b.text.length)[0] || null;
// Shopify's search adds tracking to its links and sizes its photos down.
const tidyUrl = (u) => {
  try {
    const x = new URL(u);
    for (const k of ['_pos', '_psq', '_psid', '_ss', '_sid', '_fid']) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return u;
  }
};
const tidyImage = (u) => (u && /\/cdn\/shop\/|cdn\.shopify\.com/.test(u) ? u.replace(/([?&])width=\d+&?/, '$1').replace(/[?&]$/, '') : u);

async function shopifySuggest(origin, q) {
  const { fetchJson } = await import('./fulfill/shopify.js');
  const r = await fetchJson(`${origin}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=6`);
  return (r?.resources?.results?.products || [])
    .map((p) => ({
      url: absolute(p.url, origin),
      text: String(p.title || ''),
      match: `${p.title || ''} ${p.product_type || ''} ${String(p.body || '').replace(/<[^>]+>/g, ' ').slice(0, 300)}`,
      price_cents: dollarsToCents(p.price) || null,
      image_url: absolute(p.image || p.featured_image?.url, origin),
    }))
    .filter((p) => p.url);
}

// The product page for an item whose link is a listing page, or null.
// { url, title, price_cents, image_url }: what that page (or the store) says.
export async function resolveListing(item, { fromUrl = captureFromUrl, suggest = shopifySuggest } = {}) {
  if (!item?.url || !item.title) return null;
  let page = null;
  if (!looksLikeListing(item.url)) {
    // A product page is fine as it is; a page with no product on it may be a listing.
    page = await fromUrl(item.url).catch(() => null);
    const own = page?.items?.[0];
    if (!page || page.warning || page.offers?.length || !page.links?.length || own?.price_cents || titleMatch(item.title, own?.title || '') >= 0.6) return null;
  }
  const origin = new URL(item.url).origin;
  const hint = genderOf(`${item.url} ${item.title}`);
  let hit = bestMatch(item.title, await suggest(origin, item.title).catch(() => []), hint);
  if (!hit) {
    page ||= await fromUrl(item.url).catch(() => null);
    hit = page && !page.warning ? bestMatch(item.title, (page.links || []).filter((l) => !looksLikeListing(l.url)), hint) : null;
  }
  if (!hit || hit.url === item.url) return null;
  const url = tidyUrl(hit.url);
  const product = await fromUrl(url).catch(() => null);
  // Its own page, if Spot can read it and it is that product (not a bot check).
  const own = product && !product.warning ? product.items?.[0] : null;
  const found = own && Math.max(titleMatch(hit.text, own.title), titleMatch(item.title, own.title)) >= 0.5 ? own : null;
  return {
    url,
    title: found?.title || hit.text.slice(0, 140),
    price_cents: found?.price_cents || hit.price_cents || null,
    image_url: tidyImage(found?.image_url || hit.image_url || null),
  };
}

const BOT_WALL = /^\s*(robot or human\??|are you (a )?(robot|human)\??|just a moment\.*…?|access denied|attention required!?|pardon our interruption|verify you are (a )?human|please verify you are a human|security check|captcha)\b/i;

function productFromLd(p, pageUrl) {
  const name = decode(String(p.name || '')).trim();
  if (!name) return null;
  const offers = [].concat(p.offers || []);
  const offerList = offers.flatMap((o) => (o?.['@type'] === 'AggregateOffer' ? [{ price: o.lowPrice ?? o.price, priceCurrency: o.priceCurrency }] : [o]));
  // Only a US-dollar price counts: €30 is not $30, so another currency leaves the price for the person to fill in.
  const usd = offerList.find((o) => !o?.priceCurrency || String(o.priceCurrency).toUpperCase() === 'USD');
  const price = usd ? dollarsToCents(usd.price ?? usd.priceSpecification?.price) : null;
  const image = [].concat(p.image || [])[0];
  return {
    title: name.slice(0, 140),
    variant: [p.color, p.size].filter(Boolean).join(' / ') || null,
    quantity: 1,
    price_cents: price && price > 0 ? price : null,
    image_url: absolute(typeof image === 'object' ? image?.url : image, pageUrl),
    url: absolute(p.url, pageUrl) || pageUrl,
  };
}

// Links on the page to the same store, with their text (or label), for
// finding a product named on a category or search page.
function anchorsOf(html, pageUrl) {
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const out = [];
  const re = /<a\b([^>]*?)href=["']([^"'#]+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 600) {
    const url = absolute(decode(m[2]), pageUrl);
    if (!url || url === pageUrl) continue;
    if (new URL(url).hostname.replace(/^www\./, '') !== host) continue;
    const label = `${m[1]} ${m[3]}`.match(/(?:aria-label|title)=["']([^"']+)["']/i)?.[1] || '';
    const text = decode(`${m[4].replace(/<[^>]+>/g, ' ')} ${label}`).replace(/\s+/g, ' ').trim();
    if (text) out.push({ url, text: text.slice(0, 200) });
  }
  return out;
}

function* jsonLdNodes(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) stack.push(...n);
      else if (n && typeof n === 'object') {
        yield n;
        if (n['@graph']) stack.push(n['@graph']);
      }
    }
  }
}

function readMeta(html) {
  const out = {};
  const re = /<meta\s+([^>]+?)\/?>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    for (const a of m[1].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[3] ?? a[4];
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content != null && !(key in out)) out[key] = attrs.content;
  }
  return out;
}

function titleTag(html) {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
}

function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function absolute(u, base) {
  if (!u || typeof u !== 'string') return null;
  try {
    const x = new URL(u, base);
    return x.protocol.startsWith('http') ? x.toString() : null;
  } catch {
    return null;
  }
}

function prettyHost(host) {
  const core = host.split('.').slice(-2, -1)[0] || host;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

async function readCapped(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total > max) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Blocks SSRF: the capture fetch must only reach public internet hosts.
export async function assertPublicHost(rawHost) {
  const hostname = rawHost.replace(/^\[|\]$/g, ''); // URL keeps IPv6 literals bracketed
  const addrs = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new CaptureError('Could not find that store');
  for (const { address } of addrs) {
    if (isPrivateAddress(address)) throw new CaptureError('That address is not allowed');
  }
}

export function isPrivateAddress(ip) {
  if (String(ip).includes(':')) {
    const g = ipv6Groups(ip);
    if (!g) return true; // can't read it: don't fetch it
    const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    const zeros = (n) => g.slice(0, n).every((x) => x === 0);
    // IPv4 hiding inside IPv6: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d),
    // NAT64 (64:ff9b::/96) and 6to4 (2002:AABB:CCDD::) all reach that IPv4.
    if (zeros(5) && g[5] === 0xffff) return isPrivateAddress(v4(g[6], g[7]));
    if (zeros(6)) return g[6] === 0 && g[7] <= 1 ? true : isPrivateAddress(v4(g[6], g[7]));
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateAddress(v4(g[6], g[7]));
    if (g[0] === 0x2002) return isPrivateAddress(v4(g[1], g[2]));
    // Unique local fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast ff00::/8.
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
  }
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 10 || a === 127 || a === 0 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
  );
}

// "::ffff:127.0.0.1" / "fe80::1%eth0" → eight 16-bit numbers, or null.
function ipv6Groups(ip) {
  let v = String(ip).toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const tail = v.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const n = tail.slice(1).map(Number);
    if (n.some((x) => x > 255)) return null;
    v = v.slice(0, -tail[0].length) + `${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`;
  }
  const halves = v.split('::');
  if (halves.length > 2) return null;
  const part = (h) => (h ? h.split(':') : []);
  const head = part(halves[0]);
  const rest = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...rest];
  if (all.length !== 8 || all.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return all.map((x) => parseInt(x, 16));
}

// ─── Screenshot capture (Claude vision) ─────────────────────────────────────
const CART_SCHEMA = {
  type: 'object',
  properties: {
    is_cart: { type: 'boolean', description: 'True if the image shows products someone intends to buy (cart, checkout, bag, product page).' },
    merchant_name: { type: 'string', description: 'Store name as shown, or empty string if not visible.' },
    merchant_domain: { type: 'string', description: 'Store domain if visible (e.g. nike.com), else empty string.' },
    currency: { type: 'string', description: 'ISO currency code of the prices, e.g. USD.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          variant: { type: 'string', description: 'Size / colour / option text, or empty string.' },
          quantity: { type: 'integer' },
          unit_price: { type: 'string', description: 'Price of ONE unit exactly as printed, e.g. "$84.50". Empty string if not visible.' },
        },
        required: ['title', 'variant', 'quantity', 'unit_price'],
        additionalProperties: false,
      },
    },
    shipping_and_tax: { type: 'string', description: 'Combined shipping + tax shown, e.g. "$7.20", or empty string if not shown.' },
  },
  required: ['is_cart', 'merchant_name', 'merchant_domain', 'currency', 'items', 'shipping_and_tax'],
  additionalProperties: false,
};

const SCREENSHOT_PROMPT = `This is a screenshot someone took of an online shopping cart, checkout, or product page. They want a friend to pay for it.

Read the items they intend to buy. Copy titles, options and prices exactly as printed; do not guess values that are not visible — use an empty string instead. If a line shows a quantity and a line total, report the per-unit price. Ignore recommended / "you may also like" products, saved-for-later items and ads.`;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function captureFromScreenshot({ data, media_type }, { client, onUsage, onError } = {}) {
  if (!IMAGE_TYPES.includes(media_type)) throw new CaptureError('Screenshot must be PNG, JPEG, WebP or GIF');
  if (!data || typeof data !== 'string') throw new CaptureError('Screenshot is empty');
  const anthropic = client ?? anthropicClient();

  // Server-side refusal fallbacks are on so a false-positive safety decline
  // on an unusual screenshot re-runs on a fallback model instead of failing.
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: process.env.SPOT_VISION_MODEL || 'claude-opus-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CART_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data } },
            { type: 'text', text: SCREENSHOT_PROMPT },
          ],
        },
      ],
    });
    onUsage?.(response.model, response.usage);
  } catch (err) {
    // The model being unreachable or misconfigured isn't the shopper's
    // problem to read about: say what they can do instead.
    onError?.(err);
    if (err instanceof Anthropic.APIError) {
      console.error('screenshot capture failed', err.status, err.message);
      throw new CaptureError('Couldn’t read screenshots right now. Paste a link or type what you want instead');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') throw new CaptureError('Could not read that screenshot — try a link or enter the items');
  if (response.stop_reason === 'max_tokens') throw new CaptureError('That cart is too long to read — try a link or enter the items');
  const text = response.content.find((b) => b.type === 'text')?.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CaptureError('Could not read that screenshot — try a link or enter the items');
  }
  return draftFromVision(parsed);
}

export function draftFromVision(v) {
  if (!v?.is_cart || !Array.isArray(v.items) || !v.items.length) {
    throw new CaptureError("That doesn't look like a cart — try a link or enter the items");
  }
  const currencyOk = !v.currency || v.currency.toUpperCase() === 'USD';
  const items = v.items.slice(0, 25).map((it) => {
    const price = dollarsToCents(it.unit_price);
    return {
      title: String(it.title || '').slice(0, 140),
      variant: it.variant || null,
      quantity: Math.min(Math.max(Number.parseInt(it.quantity, 10) || 1, 1), 20),
      price_cents: price && price > 0 ? price : null,
      image_url: null,
      url: null,
    };
  });
  const domain = String(v.merchant_domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return {
    source: 'screenshot',
    merchant: {
      name: v.merchant_name || (domain ? prettyHost(domain) : ''),
      url: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? `https://${domain}` : null,
    },
    items,
    extras_cents: dollarsToCents(v.shipping_and_tax) || 0,
    needs_review: true, // always confirm what a model read off an image
    warning: currencyOk ? null : `Prices look like ${v.currency}; Spot works in USD for now`,
  };
}

// ─── Text capture ───────────────────────────────────────────────────────────
// The composer is one box. Shared text from apps often wraps the link in a
// sentence ("Check out this on Nike! https://…"), so pull the link out first.
const URL_IN_TEXT = /https?:\/\/[^\s<>"')]+/i;

export function splitText(raw) {
  const text = String(raw || '').trim().slice(0, 2000);
  const url = text.match(URL_IN_TEXT)?.[0]?.replace(/[.,!?]+$/, '') || null;
  return { text, url };
}

// Draft for a description when no lookup is possible: one item named after
// what they typed, with any "$120" in it used as the price. "under $50" is a
// budget, not a price, so it stays in the words.
const BUDGET = /\b(under|below|less than|max|up to|no more than|budget|around|about|cheaper than)\s*\$/i;
export function draftFromDescription(text) {
  const price = BUDGET.test(text) ? null : text.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  const title = (price ? text.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/, '') : text).replace(/\s+/g, ' ').trim() || text;
  return {
    source: 'text',
    merchant: { name: '', url: null },
    items: [{ title: title.slice(0, 140), variant: null, quantity: 1, price_cents: price ? dollarsToCents(price[1]) : null, image_url: null, url: null }],
    needs_review: true,
  };
}

// Several picks, best first, so the requester can swipe through stores like
// a collection page instead of reading one AI answer. Asks for a look ("outfits
// for Coachella") come back as outfits: whole looks, pieces from any store.
const PRODUCT_HINT = `{"merchant_name": "", "merchant_url": "https://…", "product_url": "https://… its own page if you saw it, else the store page you found it on", "title": "", "variant": "", "unit_price": "$0.00", "image_url": "https://… or empty", "why": "short reason, under 60 characters"}`;
const LOOKUP_SCHEMA_HINT = `{"kind": "products", "products": [${PRODUCT_HINT}]}  or  {"kind": "outfits", "outfits": [{"name": "short look name", "why": "one line", "items": [${PRODUCT_HINT}]}]}`;
export const MAX_OPTIONS = 12; // per batch; the shelf asks for more as they swipe
export const MAX_OUTFITS = 4;

const q = (x) => String(x).replace(/"/g, "'");
// What the model is asked, for a whole answer (captureFromText) or a batch on
// the shelf (streamLookup: `count` products, a couple of outfits at a time).
export function lookupPrompt({ text, more = '', sizes = '', shipTo = '', avoid = [], count = MAX_OPTIONS, outfits = MAX_OUTFITS }) {
  return `Someone is shopping and typed: "${q(text)}"${more ? `\nThey saw what you found and said: "${q(more)}"` : ''}

Using web search, find things for sale at US online stores that match. Read it the way a great personal shopper would: a budget ("under $50") is a price limit, an occasion or place ("for Coachella", "beach wedding") sets the style.
- If they want a look, an outfit, or clothes for an occasion or a trip, reply with outfits (as many as they ask for, up to ${outfits}): each a complete look of 3 to 5 pieces (for example top or dress, bottoms, shoes, one accessory) that suit the occasion, pieces from any stores.
- Otherwise reply with up to ${count} products, from as many different stores as you can (the brand's own store counts), your recommendation first.
${sizes || shipTo ? `What you know about them:${sizes ? ` their sizes are ${q(sizes).slice(0, 300)}.` : ''}${shipTo ? ` They live in ${q(shipTo).slice(0, 80)}, so only pick stores that ship there.` : ''}\n` : ''}Use the size, colour or options they gave.${sizes ? ` For every clothing or shoe piece they didn't give a size for, pick the right one from their sizes (adult or kids' sizing to match what they asked for) and put it in "variant".` : ' Put the size or option you picked in "variant".'} Skip anything you saw marked sold out, but don't hold back for want of proof: Spot checks each store's own page for stock, size and price before anyone pays. Products named in roundups, gift guides, or category and search pages count: use them, with the best link you have and the price you saw (or your best estimate). Give each product's main photo in "image_url" if you saw its address, else leave it empty.${avoid.length ? ` They've already seen these, so don't suggest them again: ${avoid.join(' , ')}` : ''} Reply with ONLY this JSON and nothing else, writing each product as soon as you've found it:
${LOOKUP_SCHEMA_HINT}
Never answer a shopping request with an empty list: give your best picks from what you found, even if you're unsure of stock or the exact price.`;
}

// Follow-ups: "more" is what they said about the last finds ("in blue",
// "cheaper"), "avoid" the product links already shown, so a second ask (or
// the next batch) finds something else instead of the same pages.
const FINDS = 3; // a search that turns up only sold-out items is retried, up to this many
const FIND_BUDGET_MS = 35_000; // no new search after this long; answer with what we have

export async function captureFromText(raw, { client, fromUrl = captureFromUrl, product = shopifyProduct, sizes = '', shipTo = '', more = '', avoid = [], onUsage, onError, now = Date.now } = {}) {
  const { text, url } = splitText(raw);
  if (!text) throw new CaptureError('Paste a link, drop a screenshot, or describe what you want');
  more = String(more || '').trim().slice(0, 300);
  avoid = [].concat(avoid || []).map((u) => String(u).slice(0, 500)).filter((u) => /^https?:\/\//i.test(u)).slice(-60);
  const followUp = Boolean(more || avoid.length);
  if (url && !followUp) return fromUrl(url);
  if (!client && !process.env.ANTHROPIC_API_KEY) return draftFromDescription(text);

  const anthropic = client ?? anthropicClient();
  const messages = [{ role: 'user', content: lookupPrompt({ text, more, sizes, shipTo, avoid }) }];
  // One page fetch per product, shared by the stock check and the photo.
  const pages = new Map();
  const page = (u) => (pages.has(u) || pages.set(u, fromUrl(u)), pages.get(u));

  const started = now();
  const soldOut = [];
  const seen = new Set(avoid);
  const fresh = (d) => {
    const u = d.items[0].url;
    if (u && seen.has(u)) return false;
    if (u) seen.add(u);
    return true;
  };
  for (let find = 0; find < FINDS; find++) {
    let response;
    try {
      response = await search(anthropic, messages, onUsage);
    } catch (err) {
      // Can't look it up right now: let them fill in the store and price.
      onError?.(err);
      if (err instanceof Anthropic.APIError) {
        console.error('text lookup failed', err.status, err.message);
        if (soldOut.length) break;
        return { ...draftFromDescription(text), not_found: true, warning: 'I couldn’t look that up right now. Try again in a minute, or paste a link' };
      }
      throw err;
    }
    if (response.stop_reason === 'refusal') break;
    const answer = picksOf(response, text);
    const found = answer.outfits ? null : answer.products.filter(fresh);
    const looks = answer.outfits ? answer.outfits.map((o) => ({ ...o, items: o.items.filter(fresh) })).filter((o) => o.items.length) : null;
    if (!found?.length && !looks?.length) {
      if (find === FINDS - 1 || now() - started > FIND_BUDGET_MS / 2) break;
      const last = messages.at(-1);
      if (last.role === 'assistant') last.content = [...last.content, ...response.content];
      else messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: `That gave me nothing I could show. Give your best picks from what you found, even from roundups or category pages, and even if you couldn't confirm stock or the exact price: Spot checks the store pages itself, and close is better than nothing. Reply with ONLY the JSON, exactly in this shape:\n${LOOKUP_SCHEMA_HINT}` });
      continue;
    }

    // Every pick is checked against its store at once; sold-out ones never show.
    const check = async (d) => ({ d: await withPhoto(d, page, undefined, d.hint_image), stock: await stockOf(d.items[0], { fromUrl: page, product }) });
    if (looks) {
      const outfits = (await Promise.all(looks.map(async (o) => ({ ...o, items: await Promise.all(o.items.map(check)) }))))
        .map((o) => {
          soldOut.push(...o.items.filter((c) => c.stock === 'out').map((c) => c.d));
          return { ...o, items: o.items.filter((c) => c.stock !== 'out') };
        })
        .filter((o) => o.items.length >= 2);
      if (outfits.length) return withOutfits(outfits, soldOut);
    } else {
      const checked = await Promise.all(found.map(check));
      const live = checked.filter((c) => c.stock !== 'out');
      soldOut.push(...checked.filter((c) => c.stock === 'out').map((c) => c.d));
      if (live.length) return withOptions(live, soldOut);
    }

    // All sold out at the store: tell the model and look again.
    if (find === FINDS - 1 || now() - started > FIND_BUDGET_MS) break;
    // (A paused search already left an assistant turn: the answer continues it.)
    const last = messages.at(-1);
    if (last.role === 'assistant') last.content = [...last.content, ...response.content];
    else messages.push({ role: 'assistant', content: response.content });
    const gone = soldOut.slice(-12).map((d) => `${d.items[0].title}${d.items[0].variant ? ` (${d.items[0].variant})` : ''}${d.items[0].url ? ` at ${d.items[0].url}` : ''}`);
    messages.push({ role: 'user', content: `I checked the stores: ${gone.length > 1 ? 'these are' : 'that one is'} sold out (${gone.join('; ')}). Find different ones that are in stock right now: the same thing at other stores, or the closest matches. Reply with ONLY the JSON.` });
  }
  // Everything found was sold out: show the last one, marked, so they can
  // say what else would do.
  if (soldOut.length) {
    const last = await withPhoto(soldOut.at(-1), page);
    return {
      ...last,
      sold_out: true,
      tried: soldOut.map((d) => d.items[0].url).filter(Boolean),
      warning: soldOut.length > 1 ? `Everything I found is sold out (${soldOut.length} checked). Tell me what else would work below` : `That one’s sold out at ${last.merchant.name || 'the store'}. Tell me what else would work below`,
    };
  }
  // Nothing usable came back: say so, and leave what they typed as the item
  // (never "under $50" as its price) so they can fill it in or try again.
  return { ...draftFromDescription(text), not_found: true, warning: followUp ? 'I couldn’t find anything new for that. Try saying it another way' : 'I couldn’t find that one. Try different words, or paste a link' };
}

// The model's answer → { products } or { outfits }, best first. Reads
// {"products": [...]}, {"outfits": [...]}, a single product object, JSON in a
// code fence, and an answer cut off mid-list (it keeps the whole products).
function picksOf(response, text) {
  const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const v = readJson(out);
  if (!v) {
    console.error('lookup answer unreadable', response.stop_reason, out.slice(0, 300).replace(/\s+/g, ' '));
    return { products: salvage(out).map((p) => pick(p, text)).filter(Boolean).slice(0, MAX_OPTIONS) };
  }
  const looks = first(v, ['outfits', 'looks']);
  if (Array.isArray(looks) && looks.length) {
    const outfits = looks
      .slice(0, MAX_OUTFITS)
      .map((o) => ({ name: String(o?.name || o?.title || 'A look').trim().slice(0, 60), why: String(o?.why || o?.description || '').trim().slice(0, 120) || null, items: [].concat(first(o || {}, ['items', 'pieces', 'products']) || []).slice(0, 6).map((p) => pick(p, text)).filter(Boolean) }))
      .filter((o) => o.items.length >= 2);
    if (outfits.length) return { outfits };
  }
  const list = first(v, ['products', 'items', 'results']);
  const products = (Array.isArray(list) ? list : v.title || v.name ? [v] : []).slice(0, MAX_OPTIONS).map((p) => pick(p, text)).filter(Boolean);
  // Readable but nothing usable in it: say what it looked like, so the next
  // miss can be fixed from the logs.
  if (!products.length) console.error('lookup answer had no picks', response.stop_reason, Object.keys(v).join(','), out.slice(0, 400).replace(/\s+/g, ' '));
  return { products };
}
// "Your size, White" when their sizes aren't known: say only what was picked.
export const cleanVariant = (v) =>
  typeof v === 'string'
    ? v.replace(/\b(?:in\s+)?(?:your|their)\s+size\b/gi, '').replace(/\s*([,/;])\s*(?=[,/;]|$)/g, '').replace(/^[\s,/;·-]+|[\s,/;·-]+$/g, '').trim()
    : v;
// Models don't always use the exact keys asked for: take the usual synonyms.
const first = (o, keys) => keys.map((k) => o[k]).find((v) => v != null && v !== '');
function pick(p, text) {
  if (!p || typeof p !== 'object' || p.found === false) return null;
  p = {
    ...p,
    title: first(p, ['title', 'name', 'product_name', 'product']),
    product_url: first(p, ['product_url', 'url', 'link', 'product_link', 'href']),
    merchant_name: first(p, ['merchant_name', 'store', 'merchant', 'retailer', 'store_name', 'brand']),
    merchant_url: first(p, ['merchant_url', 'store_url', 'retailer_url']),
    unit_price: first(p, ['unit_price', 'price', 'sale_price']),
    variant: cleanVariant(first(p, ['variant', 'size', 'option'])),
    image_url: first(p, ['image_url', 'image', 'photo', 'img']),
  };
  if (typeof p.title !== 'string' || typeof p.merchant_name === 'object') p.title = typeof p.title === 'string' ? p.title : '';
  const d = draftFromLookup({ found: true, ...p }, text);
  if (d.source !== 'lookup') return null;
  const img = typeof p.image_url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(p.image_url) ? p.image_url.slice(0, 1000) : null;
  return { ...d, why: String(p.why || '').trim().slice(0, 80) || null, hint_image: img };
}
export function readJson(out) {
  const body = String(out).replace(/```(?:json)?/gi, '');
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(body.slice(a, b + 1));
  } catch {
    try {
      return JSON.parse(body.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1')); // trailing commas
    } catch {
      return null;
    }
  }
}
// Each complete {...} that names a product page, from text that isn't valid JSON as a whole.
export function salvage(out) {
  const found = [];
  const s = String(out);
  for (let i = s.indexOf('{'); i >= 0 && found.length < MAX_OPTIONS; i = s.indexOf('{', i + 1)) {
    let depth = 0;
    let str = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (str) {
        if (c === '\\') j++;
        else if (c === '"') str = false;
      } else if (c === '"') str = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const o = JSON.parse(s.slice(i, j + 1));
          if (o && o.product_url && o.title) {
            found.push(o);
            i = j;
          }
        } catch {}
        break;
      }
    }
  }
  return found;
}

const optionOf = ({ d, stock }) => ({ merchant: d.merchant, item: d.items[0], stock, why: d.why });

// The recommendation is the draft (so everything that reads one draft keeps
// working); every in-stock pick, it included, rides along as `options`.
function withOptions(picks, soldOut) {
  const [top] = picks;
  const tried = soldOut.map((d) => d.items[0].url).filter(Boolean);
  return {
    ...top.d,
    kind: 'products',
    ...(top.stock === 'in' ? { in_stock: true } : { warning: `I couldn’t check stock at ${top.d.merchant.name || 'that store'}. Tap “See it at the store” to make sure it’s there` }),
    options: picks.map(optionOf),
    ...(tried.length ? { tried } : {}),
  };
}

// Outfits: the draft is the first look's first piece; the looks ride along.
function withOutfits(outfits, soldOut) {
  const tried = soldOut.map((d) => d.items[0].url).filter(Boolean);
  const first = outfits[0].items[0];
  return {
    ...first.d,
    kind: 'outfits',
    outfits: outfits.map((o) => ({ name: o.name, why: o.why, items: o.items.map(optionOf) })),
    ...(tried.length ? { tried } : {}),
  };
}

// Pages Spot's own reader is turned away from (big stores behind bot
// protection): the model opens them with its web fetch tool and reports the
// photo, stock and price. Best effort: anything it can't tell stays unknown.
const DETAILS_MAX = 8;
export async function pageDetails(urls, { client, onUsage, onError } = {}) {
  // Each: a page address, or { url, variant } when a size or option was picked.
  const byUrl = new Map();
  for (const u of [].concat(urls || [])) {
    const url = String(typeof u === 'string' ? u : u?.url || '');
    if (/^https?:\/\//i.test(url) && !byUrl.has(url)) byUrl.set(url, typeof u === 'object' && u?.variant ? String(u.variant).slice(0, 80) : '');
  }
  const list = [...byUrl.keys()].slice(0, DETAILS_MAX);
  if (!list.length || (!client && !process.env.ANTHROPIC_API_KEY)) return { pages: [] };
  const anthropic = client ?? anthropicClient();
  const messages = [
    {
      role: 'user',
      content: `Open each of these product pages with web_fetch and report, for each: the main product photo's full https address, whether it can be bought right now (in stock, in the size or option given), and the current price.
${list.map((u, i) => `${i + 1}. ${u}${byUrl.get(u) ? ` (size or option: ${byUrl.get(u).replace(/[\n"]/g, ' ')})` : ''}`).join('\n')}
Reply with ONLY this JSON and nothing else:
{"pages": [{"url": "the address above", "image_url": "https://… or empty", "in_stock": true or false or null, "unit_price": "$0.00 or empty"}]}
Use empty or null for anything the page doesn't show or couldn't be opened.`,
    },
  ];
  let response;
  try {
    for (let i = 0; i < 3; i++) {
      response = await anthropic.beta.messages.create({
        model: process.env.SPOT_DETAILS_MODEL || process.env.SPOT_VISION_MODEL || 'claude-opus-5',
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: list.length + 2 }],
        messages,
      });
      onUsage?.(response.model, response.usage);
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) {
      console.error('page details failed', err.status, err.message);
      return { pages: [] };
    }
    throw err;
  }
  const v = readJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const asked = new Set(list);
  const pages = [].concat(v?.pages || [])
    .filter((p) => p && asked.has(String(p.url)))
    .map((p) => {
      const price = dollarsToCents(p.unit_price);
      return {
        url: String(p.url),
        image_url: typeof p.image_url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(p.image_url) ? p.image_url.slice(0, 1000) : null,
        stock: p.in_stock === true ? 'in' : p.in_stock === false ? 'out' : 'unknown',
        price_cents: price && price > 0 ? price : null,
      };
    });
  return { pages };
}

// ─── Streaming lookup ───────────────────────────────────────────────────────
// The shelf shows each pick the moment the model has written it, not after
// the whole answer and every store check (≈40s to the first card before).
// Events, in order:
//   { type: 'searching' }                          a web search started
//   { type: 'pick', option } | { type: 'outfit', outfit }   as each is written
//   { type: 'update', url, stock, image_url, price_cents }  a store check came back
//   { type: 'done', kind, count, not_found?, warning? }
export const FIRST_BATCH = 6; // quick to write; the shelf asks for more as they swipe
const CHECK_WAIT_MS = 8000; // store checks still out after the answer get this long

// Complete JSON objects, as text streams in: each one in the answer's list
// ({"products": [{…}, {…}]} or a bare [{…}]), the moment its last brace lands.
export class JsonObjects {
  constructor() {
    this.reset();
  }
  reset() {
    this.emitted = 0; // objects out since the last reset
    this.buf = '';
    this.stack = [];
    this.starts = [];
    this.str = false;
    this.esc = false;
  }
  push(text) {
    const out = [];
    for (const c of String(text)) {
      this.buf += c;
      if (this.str) {
        if (this.esc) this.esc = false;
        else if (c === '\\') this.esc = true;
        else if (c === '"') this.str = false;
        continue;
      }
      if (c === '"' && this.stack.length) this.str = true;
      else if (c === '{' || c === '[') {
        this.stack.push(c);
        this.starts.push(this.buf.length - 1);
      } else if ((c === '}' || c === ']') && this.stack.length) {
        const open = this.stack.pop();
        const from = this.starts.pop();
        const top = this.stack.join('');
        if (open === '{' && c === '}' && (top === '{[' || top === '[')) out.push(this.buf.slice(from)), this.emitted++;
        if (!this.stack.length) this.buf = '';
      }
    }
    return out;
  }
}

const SEARCHES = 3; // per batch on the shelf; more come as they swipe
const QUICK = `\nBe quick: at most ${SEARCHES} searches (one search often turns up several stores), then write the answer.`;

// Recent answers, so asking the same thing again is instant.
export function lookupCache({ max = 200, ttl = 30 * 60_000, now = Date.now } = {}) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit || now() - hit.at > ttl) return map.delete(key), null;
      return hit.events;
    },
    set(key, events) {
      map.set(key, { at: now(), events });
      while (map.size > max) map.delete(map.keys().next().value);
    },
  };
}

export async function streamLookup(raw, { client, fromUrl = captureFromUrl, product = shopifyProduct, resolve = resolveListing, sizes = '', shipTo = '', more = '', avoid = [], count = FIRST_BATCH, cache = null, onUsage, onError, now = Date.now } = {}, emit = () => {}) {
  const { text } = splitText(raw);
  if (!text) throw new CaptureError('Paste a link, drop a screenshot, or describe what you want');
  more = String(more || '').trim().slice(0, 300);
  avoid = [].concat(avoid || []).map((u) => String(u).slice(0, 500)).filter((u) => /^https?:\/\//i.test(u)).slice(-60);
  count = Math.max(1, Math.min(MAX_OPTIONS, count | 0 || FIRST_BATCH));
  const followUp = Boolean(more || avoid.length);
  const nothing = () => emit({ type: 'done', kind: null, count: 0, not_found: true, warning: followUp ? 'I couldn’t find anything new for that. Try saying it another way' : 'I couldn’t find that one. Try different words, or paste a link' });
  if (!client && !process.env.ANTHROPIC_API_KEY) return nothing();

  const key = cache && JSON.stringify([text.toLowerCase(), more.toLowerCase(), avoid, sizes, shipTo, count]);
  const cached = key && cache.get(key);
  if (cached) {
    for (const e of cached) emit(e);
    return;
  }

  const anthropic = client ?? anthropicClient();
  const outfitsWanted = Math.max(1, Math.min(MAX_OUTFITS, Math.ceil(count / 3)));
  const messages = [{ role: 'user', content: lookupPrompt({ text, more, sizes, shipTo, avoid, count, outfits: outfitsWanted }) + QUICK }];
  const pages = new Map();
  const page = (u) => (pages.has(u) || pages.set(u, fromUrl(u)), pages.get(u));
  const seen = new Set(avoid);
  const sent = []; // what went out, kept up to date for the cache
  const checks = [];
  const stats = { searches: 0, steps: 0, objects: 0, unusable: 0, repeats: 0 };
  let kind = null;
  // Pages they've already seen are out; in this answer, the same page and
  // title twice is a repeat (one listing page can hold several products).
  const fresh = (d) => {
    const u = d.items[0].url;
    const k = `${u}|${String(d.items[0].title).toLowerCase()}`;
    if ((u && avoid.includes(u)) || seen.has(k)) return stats.repeats++, false;
    seen.add(k);
    return true;
  };
  // Photo and stock from the store's own page, after the card is already up.
  // A category or search page in place of the product: the product itself
  // first (its link, price and photo), then the checks on that page.
  const check = (d, opt) =>
    checks.push(
      resolve(d.items[0], { fromUrl: page })
        .catch(() => null)
        .then((r) => {
          if (!r) return { d, moved: null };
          const was = d.items[0].url;
          d = { ...d, items: [{ ...d.items[0], url: r.url, title: r.title, price_cents: r.price_cents || d.items[0].price_cents, image_url: r.image_url || null }, ...d.items.slice(1)] };
          return { d, moved: { from: was, r } };
        })
        .then(({ d, moved }) => Promise.all([withPhoto(d, page, undefined, null).catch(() => d), stockOf(d.items[0], { fromUrl: page, product }).catch(() => 'unknown'), moved]))
        .then(([withPic, stock, moved]) => {
          const it = withPic.items[0];
          const u = { type: 'update', url: moved ? moved.from : it.url, stock, image_url: it.image_url && it.image_url !== opt.item.image_url ? it.image_url : null, price_cents: !opt.item.price_cents && it.price_cents ? it.price_cents : null };
          if (moved) {
            // The store's own price beats the estimate search gave.
            Object.assign(u, { new_url: it.url, title: it.title, price_cents: it.price_cents || null });
            Object.assign(opt.item, { url: it.url, title: it.title });
            if (it.price_cents) (opt.item.price_cents = it.price_cents), opt.why && (opt.why = opt.why.replace(/\s*\(?est(?:imated|\.)? price\)?/i, '').trim() || null);
          }
          opt.stock = stock;
          if (u.image_url) opt.item.image_url = u.image_url;
          if (u.price_cents) opt.item.price_cents = u.price_cents;
          emit(u);
        }),
    );
  const optionOfDraft = (d) => ({ merchant: d.merchant, item: { ...d.items[0], image_url: d.hint_image || null }, stock: 'unknown', why: d.why });
  const take = (json) => {
    let o;
    stats.objects++;
    try {
      o = JSON.parse(json);
    } catch {
      return stats.unusable++;
    }
    const pieces = first(o, ['items', 'pieces', 'products']);
    if (Array.isArray(pieces)) {
      if (kind === 'products') return;
      const items = pieces.slice(0, 6).map((p) => pick(p, text)).filter(Boolean).filter(fresh);
      if (items.length < 2) return stats.unusable++;
      kind = 'outfits';
      const outfit = { name: String(o.name || o.title || 'A look').trim().slice(0, 60), why: String(o.why || o.description || '').trim().slice(0, 120) || null, items: items.map(optionOfDraft) };
      sent.push({ type: 'outfit', outfit });
      emit({ type: 'outfit', outfit: structuredClone(outfit) }); // as it is now; the checks update `sent` for the cache
      items.forEach((d, i) => check(d, outfit.items[i]));
      return;
    }
    if (kind === 'outfits') return;
    const d = pick(o, text);
    if (!d) return stats.unusable++;
    if (!fresh(d)) return;
    kind = 'products';
    const option = optionOfDraft(d);
    sent.push({ type: 'pick', option });
    emit({ type: 'pick', option: structuredClone(option) });
    check(d, option);
  };

  let model = process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5';
  const big = process.env.SPOT_VISION_MODEL || 'claude-opus-5';
  const started = now();
  let said = ''; // the last reply's text, for the log
  for (let attempt = 0; attempt < 2; attempt++) {
    const objects = new JsonObjects();
    let response;
    try {
      for (let i = 0; i < 4; i++) {
        const stream = anthropic.beta.messages.stream({
          model,
          max_tokens: 12000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          // The plain search: the filtering version adds a code step after
          // each search, which roughly doubled the wait. A few searches in
          // all, continuations included.
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.max(1, SEARCHES - stats.searches) }],
          messages,
        });
        stream.on('streamEvent', (ev) => {
          // A search starting before any product means what came before was
          // thinking out loud. After one, the answer is being written as it's
          // found: keep its place so the products after the search still parse.
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'server_tool_use') {
            if (!objects.emitted) objects.reset();
            if (ev.content_block.name === 'web_search') stats.searches++;
            else stats.steps++;
            emit({ type: 'searching' });
          }
        });
        stream.on('text', (delta) => {
          for (const json of objects.push(delta)) take(json);
        });
        response = await stream.finalMessage();
        onUsage?.(response.model, response.usage);
        said = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (response.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: response.content });
      }
    } catch (err) {
      onError?.(err);
      // The quicker model isn't on this account: the bigger one, once.
      if (err instanceof Anthropic.APIError && (err.status === 404 || /model/i.test(err.message)) && model !== big && !sent.length) {
        console.error('lookup model unavailable, using', big, err.status, err.message);
        model = big;
        attempt--;
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        console.error('stream lookup failed', err.status, err.message);
        if (!sent.length) return emit({ type: 'done', kind: null, count: 0, not_found: true, warning: 'I couldn’t look that up right now. Try again in a minute, or paste a link' });
        break;
      }
      throw err;
    }
    if (sent.length || response?.stop_reason === 'refusal' || attempt === 1 || now() - started > FIND_BUDGET_MS / 2) break;
    // Nothing usable came back: say what it looked like, then one looser try.
    const out = (response?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    console.error('lookup answer had no picks', response?.stop_reason, out.slice(0, 400).replace(/\s+/g, ' '));
    const last = messages.at(-1);
    if (last.role === 'assistant') last.content = [...last.content, ...(response?.content || [])];
    else messages.push({ role: 'assistant', content: response?.content || [] });
    messages.push({ role: 'user', content: `That gave me nothing I could show. Give your best picks from what you found, even from roundups or category pages, and even if you couldn't confirm stock or the exact price: Spot checks the store pages itself, and close is better than nothing. Reply with ONLY the JSON, exactly in this shape:\n${LOOKUP_SCHEMA_HINT}` });
  }
  console.log('stream lookup', `${now() - started}ms`, model, JSON.stringify({ ...stats, sent: sent.length, asked: count }), sent.length < Math.min(count, 3) ? said.slice(-500).replace(/\s+/g, ' ') : '');
  if (!sent.length) return nothing();
  // Store checks still out: a few more seconds, so their photos and stock land before "done".
  let timer;
  await Promise.race([Promise.all(checks), new Promise((r) => (timer = setTimeout(r, CHECK_WAIT_MS)))]);
  clearTimeout(timer);
  const done = { type: 'done', kind, count: sent.length };
  emit(done);
  if (key) cache.set(key, [...sent, done]);
}

// Web search runs server-side; long searches can pause the turn, so resume a couple of times.
async function search(anthropic, messages, onUsage, model = process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5') {
  const big = process.env.SPOT_VISION_MODEL || 'claude-opus-5';
  try {
    return await searchWith(anthropic, messages, onUsage, model);
  } catch (err) {
    // The quicker model isn't on this account: the bigger one.
    if (!(err instanceof Anthropic.APIError) || model === big || !(err.status === 404 || /model/i.test(err.message))) throw err;
    console.error('lookup model unavailable, using', big, err.status, err.message);
    return searchWith(anthropic, messages, onUsage, big);
  }
}
async function searchWith(anthropic, messages, onUsage, model) {
  let response;
  for (let i = 0; i < 3; i++) {
    response = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000, // a dozen products or four outfits, written out
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages,
    });
    onUsage?.(response.model, response.usage);
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  return response;
}

// The photo of the colour asked for, not the product's first one: Shopify
// stores list each variant's own image at /products/<handle>.js.
async function shopifyProduct(url) {
  const { loadShopifyProduct } = await import('./fulfill/shopify.js');
  const product = await loadShopifyProduct(url, {});
  return product && { title: product.title, variants: product.variants };
}
const shopifyVariantPhoto = shopifyProduct;
async function colorPhoto(item, variantPhoto) {
  if (!item.variant || !variantPhoto) return null;
  const product = await variantPhoto(item.url);
  if (!product?.variants?.length) return null;
  // Every variant with all the words asked for (sold out ones too: they
  // still have a photo). "Black" on Black / S…2XL is fine if they share one.
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
  const inTitle = new Set(norm(product.title).split(' '));
  const want = norm(item.variant).split(' ').filter((w) => w && !inTitle.has(w));
  if (!want.length) return null;
  const photoOf = (v) => v.featured_image?.src || (typeof v.featured_image === 'string' ? v.featured_image : null);
  const hits = product.variants.filter((v) => {
    const words = new Set([v.option1, v.option2, v.option3, v.title].map(norm).join(' ').split(' '));
    return want.every((w) => words.has(w));
  });
  const photos = [...new Set(hits.map(photoOf).filter(Boolean))];
  const src = photos.length === 1 ? photos[0] : null;
  return src ? absolute(src, item.url) : null;
}

// Search finds the page, not a reliable image URL: read the photo (and the
// price, if search missed it) off the product page itself. Best effort.
const PHOTO_WAIT_MS = 6000;
// `hint` is a photo address the search itself turned up: used only when the
// page can't be read (its own photo is the one to trust).
export async function withPhoto(draft, fromUrl, variantPhoto = shopifyVariantPhoto, hint = null) {
  const item = draft.items?.[0];
  if (draft.source !== 'lookup' || !item?.url || item.image_url) return draft;
  const fallback = () => (hint ? { ...draft, items: [{ ...item, image_url: hint }, ...draft.items.slice(1)] } : draft);
  let timer;
  try {
    const page = await Promise.race([fromUrl(item.url), new Promise((_, no) => (timer = setTimeout(() => no(new Error('slow')), PHOTO_WAIT_MS)))]);
    const found = page?.items?.[0];
    if (!found || page.warning) return fallback();
    const image = (await colorPhoto(item, variantPhoto).catch(() => null)) || found.image_url || hint || null;
    return { ...draft, items: [{ ...item, image_url: image, price_cents: item.price_cents || found.price_cents || null }, ...draft.items.slice(1)] };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

export function draftFromLookup(v, text) {
  if (!v?.found || !v.title) return draftFromDescription(text);
  const safe = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : null;
    } catch {
      return null;
    }
  };
  const site = safe(v.merchant_url) || safe(v.product_url);
  const merchantUrl = site ? new URL(site).origin : null;
  const price = dollarsToCents(v.unit_price);
  return {
    source: 'lookup',
    merchant: { name: String(v.merchant_name || '').slice(0, 80) || (merchantUrl ? prettyHost(new URL(merchantUrl).hostname.replace(/^www\./, '')) : ''), url: merchantUrl },
    items: [{ title: String(v.title).slice(0, 140), variant: v.variant || null, quantity: 1, price_cents: price && price > 0 ? price : null, image_url: null, url: safe(v.product_url) }],
    needs_review: true, // prices found by search are a guess until the requester confirms
  };
}

export class CaptureError extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
  }
}
