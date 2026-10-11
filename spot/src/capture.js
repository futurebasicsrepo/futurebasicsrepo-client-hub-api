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
  for (const node of jsonLdNodes(html)) {
    const types = [].concat(node['@type'] || []).map(String);
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
// what they typed, with any "$120" in it used as the price.
export function draftFromDescription(text) {
  const price = text.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  const title = text.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/, '').replace(/\s+/g, ' ').trim() || text;
  return {
    source: 'text',
    merchant: { name: '', url: null },
    items: [{ title: title.slice(0, 140), variant: null, quantity: 1, price_cents: price ? dollarsToCents(price[1]) : null, image_url: null, url: null }],
    needs_review: true,
  };
}

// Several picks, best first, so the requester can swipe through stores like
// a collection page instead of reading one AI answer.
const LOOKUP_SCHEMA_HINT = `{"products": [{"merchant_name": "", "merchant_url": "https://…", "product_url": "https://…", "title": "", "variant": "", "unit_price": "$0.00", "why": "short reason, under 60 characters"}]}`;
export const MAX_OPTIONS = 6;

// Follow-ups: "more" is what they said about the last finds ("in blue",
// "cheaper"), "avoid" the product links already shown, so a second ask
// finds something else instead of the same pages.
const FINDS = 3; // a search that turns up only sold-out items is retried, up to this many
const FIND_BUDGET_MS = 35_000; // no new search after this long; answer with what we have

export async function captureFromText(raw, { client, fromUrl = captureFromUrl, product = shopifyProduct, sizes = '', more = '', avoid = [], onUsage, onError, now = Date.now } = {}) {
  const { text, url } = splitText(raw);
  if (!text) throw new CaptureError('Paste a link, drop a screenshot, or describe what you want');
  more = String(more || '').trim().slice(0, 300);
  avoid = [].concat(avoid || []).map((u) => String(u).slice(0, 500)).filter((u) => /^https?:\/\//i.test(u)).slice(0, 20);
  const followUp = Boolean(more || avoid.length);
  if (url && !followUp) return fromUrl(url);
  if (!client && !process.env.ANTHROPIC_API_KEY) return draftFromDescription(text);

  const q = (x) => String(x).replace(/"/g, "'");
  const anthropic = client ?? anthropicClient();
  const messages = [
    {
      role: 'user',
      content: `Someone wants a friend to buy them this: "${q(text)}"${more ? `\nThey saw what you found last time and said: "${q(more)}"` : ''}

Using web search, find up to ${MAX_OPTIONS} products for sale at US online stores that match, from different stores where you can (the brand's own store counts). Put your recommendation first, then the next best. Use the size, colour or options they gave.${sizes ? ` If it comes in sizes and they didn't say one, use their saved size (${q(sizes).slice(0, 300)}) and put it in "variant".` : ''} Each must be in stock right now in that option: skip anything the page shows as sold out or unavailable.${avoid.length ? ` Don't suggest any of these again: ${avoid.join(' , ')}` : ''} Reply with ONLY this JSON and nothing else:
${LOOKUP_SCHEMA_HINT}
Use an empty "products" list if you can't find a specific product with a current price.`,
    },
  ];
  // One page fetch per product, shared by the stock check and the photo.
  const pages = new Map();
  const page = (u) => (pages.has(u) || pages.set(u, fromUrl(u)), pages.get(u));

  const started = now();
  const soldOut = [];
  const seen = new Set(avoid);
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
        return { ...draftFromDescription(text), warning: 'I couldn’t look that up right now. Add the store and price below' };
      }
      throw err;
    }
    if (response.stop_reason === 'refusal') break;
    const found = picksOf(response, text).filter((d) => {
      const u = d.items[0].url;
      if (u && seen.has(u)) return false;
      if (u) seen.add(u);
      return true;
    });
    if (!found.length) break;
    // Every pick is checked against the store at once; sold-out ones never show.
    const checked = await Promise.all(found.map(async (d) => ({ d, stock: await stockOf(d.items[0], { fromUrl: page, product }) })));
    const live = checked.filter((c) => c.stock !== 'out');
    soldOut.push(...checked.filter((c) => c.stock === 'out').map((c) => c.d));
    if (live.length) return withOptions(await Promise.all(live.map(async ({ d, stock }) => ({ d: await withPhoto(d, page), stock }))), soldOut);

    // All sold out at the store: tell the model and look again.
    if (find === FINDS - 1 || now() - started > FIND_BUDGET_MS) break;
    // (A paused search already left an assistant turn: the answer continues it.)
    const last = messages.at(-1);
    if (last.role === 'assistant') last.content = [...last.content, ...response.content];
    else messages.push({ role: 'assistant', content: response.content });
    const gone = checked.map(({ d }) => `${d.items[0].title}${d.items[0].variant ? ` (${d.items[0].variant})` : ''}${d.items[0].url ? ` at ${d.items[0].url}` : ''}`);
    messages.push({ role: 'user', content: `I checked the stores: ${gone.length > 1 ? 'all of those are' : 'that one is'} sold out (${gone.join('; ')}). Find different ones that are in stock right now: the same thing at other stores, or the closest matches. Reply with ONLY the JSON.` });
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
  return draftFromDescription(text);
}

// The model's answer → drafts, best first. Takes {"products": [...]} or a
// single product object.
function picksOf(response, text) {
  const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let v;
  try {
    v = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0]);
  } catch {
    return [];
  }
  const list = Array.isArray(v?.products) ? v.products : v ? [v] : [];
  return list
    .slice(0, MAX_OPTIONS)
    .map((p) => ({ p, d: draftFromLookup({ found: true, ...p }, text) }))
    .filter(({ p, d }) => p?.found !== false && d.source === 'lookup')
    .map(({ p, d }) => ({ ...d, why: String(p.why || '').trim().slice(0, 80) || null }));
}

// The recommendation is the draft (so everything that reads one draft keeps
// working); every in-stock pick, it included, rides along as `options`.
function withOptions(picks, soldOut) {
  const [top] = picks;
  const tried = soldOut.map((d) => d.items[0].url).filter(Boolean);
  return {
    ...top.d,
    ...(top.stock === 'in' ? { in_stock: true } : { warning: `I couldn’t check stock at ${top.d.merchant.name || 'that store'}. Tap “See it at the store” to make sure it’s there` }),
    options: picks.map(({ d, stock }) => ({ merchant: d.merchant, item: d.items[0], stock, why: d.why })),
    ...(tried.length ? { tried } : {}),
  };
}

// Web search runs server-side; long searches can pause the turn, so resume a couple of times.
async function search(anthropic, messages, onUsage) {
  let response;
  for (let i = 0; i < 3; i++) {
    response = await anthropic.beta.messages.create({
      model: process.env.SPOT_VISION_MODEL || 'claude-opus-5',
      max_tokens: 4000,
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
export async function withPhoto(draft, fromUrl, variantPhoto = shopifyVariantPhoto) {
  const item = draft.items?.[0];
  if (draft.source !== 'lookup' || !item?.url || item.image_url) return draft;
  let timer;
  try {
    const page = await Promise.race([fromUrl(item.url), new Promise((_, no) => (timer = setTimeout(() => no(new Error('slow')), PHOTO_WAIT_MS)))]);
    const found = page?.items?.[0];
    if (!found || page.warning) return draft;
    const image = (await colorPhoto(item, variantPhoto).catch(() => null)) || found.image_url || null;
    return { ...draft, items: [{ ...item, image_url: image, price_cents: item.price_cents || found.price_cents || null }, ...draft.items.slice(1)] };
  } catch {
    return draft;
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
