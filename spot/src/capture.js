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
import Anthropic from '@anthropic-ai/sdk';
import { dollarsToCents } from './cart.js';

const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 8000;

// ─── URL capture ────────────────────────────────────────────────────────────
export async function captureFromUrl(rawUrl, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
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
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SpotBot/0.1; +https://spot.cart)', accept: 'text/html' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new CaptureError('The store redirected without a destination');
      clearTimeout(timer);
      return captureFromUrl(new URL(loc, url).toString(), { fetchImpl, allowPrivate });
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
  for (const node of jsonLdNodes(html)) {
    const types = [].concat(node['@type'] || []).map(String);
    if (types.includes('Product')) {
      const item = productFromLd(node, pageUrl);
      if (item) items.push(item);
    }
    if (types.includes('ProductGroup') && Array.isArray(node.hasVariant) && !items.length) {
      const first = productFromLd({ ...node.hasVariant[0], name: node.hasVariant[0]?.name || node.name, image: node.hasVariant[0]?.image || node.image }, pageUrl);
      if (first) items.push(first);
    }
  }

  if (!items.length) {
    const price = dollarsToCents(meta['product:price:amount'] || meta['og:price:amount'] || meta['twitter:data1'] || '');
    const title = decode(meta['og:title'] || meta['twitter:title'] || titleTag(html) || '');
    if (title) {
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

  return {
    source: 'url',
    merchant,
    items: deduped.slice(0, 25),
    needs_review: deduped.some((i) => !i.price_cents) || !deduped.length,
  };
}

function productFromLd(p, pageUrl) {
  const name = decode(String(p.name || '')).trim();
  if (!name) return null;
  const offers = [].concat(p.offers || []);
  const offerList = offers.flatMap((o) => (o?.['@type'] === 'AggregateOffer' ? [{ price: o.lowPrice ?? o.price, priceCurrency: o.priceCurrency }] : [o]));
  const usd = offerList.find((o) => !o?.priceCurrency || String(o.priceCurrency).toUpperCase() === 'USD') || offerList[0];
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
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
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

export async function captureFromScreenshot({ data, media_type }, { client } = {}) {
  if (!IMAGE_TYPES.includes(media_type)) throw new CaptureError('Screenshot must be PNG, JPEG, WebP or GIF');
  if (!data || typeof data !== 'string') throw new CaptureError('Screenshot is empty');
  const anthropic = client ?? new Anthropic();

  // Server-side refusal fallbacks are on so a false-positive safety decline
  // on an unusual screenshot re-runs on a fallback model instead of failing.
  const response = await anthropic.beta.messages.create({
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

const LOOKUP_SCHEMA_HINT = `{"found": true|false, "merchant_name": "", "merchant_url": "https://…", "product_url": "https://…", "title": "", "variant": "", "unit_price": "$0.00"}`;

export async function captureFromText(raw, { client, fromUrl = captureFromUrl } = {}) {
  const { text, url } = splitText(raw);
  if (!text) throw new CaptureError('Paste a link, drop a screenshot, or describe what you want');
  if (url) return fromUrl(url);
  if (!client && !process.env.ANTHROPIC_API_KEY) return draftFromDescription(text);

  const anthropic = client ?? new Anthropic();
  const messages = [
    {
      role: 'user',
      content: `Someone wants a friend to buy them this: "${text.replace(/"/g, "'")}"

Find it for sale at one US online store (prefer the brand's own store), using web search. Use the size, colour or options they gave. Reply with ONLY this JSON and nothing else:
${LOOKUP_SCHEMA_HINT}
Set "found" to false if you can't find a specific product with a current price.`,
    },
  ];
  // Web search runs server-side; long searches can pause the turn, so resume a couple of times.
  let response;
  for (let i = 0; i < 3; i++) {
    response = await anthropic.beta.messages.create({
      model: process.env.SPOT_VISION_MODEL || 'claude-opus-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
      messages,
    });
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  if (response.stop_reason === 'refusal') return draftFromDescription(text);
  const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = out.match(/\{[\s\S]*\}/)?.[0];
  let v;
  try {
    v = JSON.parse(json);
  } catch {
    return draftFromDescription(text);
  }
  return draftFromLookup(v, text);
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
