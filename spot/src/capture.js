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

// What the store asks for this item today, in cents, for the price watch
// (pricewatch.js). Also from the store's own data: the exact option bought
// on Shopify stores (sold out or not), else the product page's price.
// null when it can't be told: a blocked page, a gone product, or options
// at different prices and no way to tell which one was bought.
export async function priceNow(item, { fromUrl = captureFromUrl, product = shopifyProduct } = {}) {
  if (!item?.url) return null;
  const ok = (cents, source) => (Number.isInteger(cents) && cents > 0 ? { cents, source } : null);
  const p = await product(item.url).catch(() => null);
  if (p?.variants?.length) {
    const { matchVariant } = await import('./fulfill/shopify.js');
    let linked = null;
    try {
      linked = new URL(item.url).searchParams.get('variant');
    } catch {}
    const all = p.variants.map((v) => ({ ...v, available: true }));
    const v = (linked && all.find((x) => String(x.id) === linked)) || matchVariant(all, item.variant, p.title);
    const prices = new Set(p.variants.map((x) => Number(x.price)));
    return ok(v ? Number(v.price) : prices.size === 1 ? [...prices][0] : null, 'store');
  }
  const page = await fromUrl(item.url).catch(() => null);
  if (!page || page.warning?.includes('doesn’t let Spot')) return null;
  const seen = new Set((page.items || []).map((i) => i.price_cents).filter(Boolean));
  return ok(seen.size === 1 ? [...seen][0] : null, 'page');
}

// ─── Photos by image search ─────────────────────────────────────────────────
// Big stores (Amazon, Walmart, Ray-Ban…) don't let anyone read their pages,
// AI included, so their photos come from an image search (Brave): the
// product's name and store, a result from that store's own site first, else
// one that's plainly the same product. Off without BRAVE_SEARCH_API_KEY.
const PHOTO_SEARCH_MS = 4000;
// The site a page belongs to: shop.tecovas.com → tecovas.com, but
// marksandspencer.co.uk stays whole.
export const rootOf = (host) => {
  const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.');
  return parts.slice(/^(co|com|org|net|ac|gov)$/.test(parts.at(-2) || '') && (parts.at(-1) || '').length === 2 ? -3 : -2).join('.');
};
const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};
const LOGO = /logo|favicon|placeholder|sprite|og[-_]?default|social[-_]?share/i;
const TRUSTED_STORES = new Set(['amazon.com', 'walmart.com', 'target.com', 'nordstrom.com', 'zappos.com', 'rei.com', 'dickssportinggoods.com', 'macys.com', 'bestbuy.com', 'kohls.com', 'dsw.com', 'footlocker.com', 'nike.com', 'adidas.com', 'uniqlo.com', 'gap.com', 'oldnavy.com', 'hm.com', 'zara.com', 'jcrew.com', 'madewell.com', 'everlane.com', 'urbanoutfitters.com', 'anthropologie.com', 'llbean.com', 'backcountry.com', 'sunglasshut.com', 'ssense.com', 'asos.com', 'abercrombie.com', 'levi.com', 'patagonia.com', 'thenorthface.com', 'costco.com', 'homedepot.com', 'lowes.com', 'wayfair.com', 'ulta.com', 'sephora.com', 'bloomingdales.com', 'saksfifthavenue.com', 'revolve.com', 'shopbop.com', 'zalando.com', 'publiclands.com', 'moosejaw.com', 'evo.com']);
// The brand's own site: its name, squeezed together, is the site's name
// (costadelmar.com for Costa Del Mar; not costa--sunglasses.com).
const brandSite = (store, host) => {
  const name = String(store || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const label = String(host || '').split('.')[0].replace(/[^a-z0-9]/g, '');
  return name.length >= 3 && (label === name || (name.length >= 5 && label.startsWith(name)));
};
// Or the brand a title leads with, named exactly (ray-ban.com for
// "Ray-Ban Original Wayfarer"; never costa--sunglasses.com for "Costa").
const titleBrandSite = (title, host) => {
  const words = String(title || '').toLowerCase().split(/\s+/).filter(Boolean);
  const label = String(host || '').split('.')[0].replace(/[^a-z0-9]/g, '');
  return [1, 2, 3].some((n) => {
    const name = words.slice(0, n).join('').replace(/[^a-z0-9]/g, '');
    return name.length >= 4 && label === name;
  });
};
export async function photoSearch({ title, store = '', url = '' }, { fetchImpl = fetch, key = process.env.BRAVE_SEARCH_API_KEY } = {}) {
  if (!key || !title) return null;
  const q = `${title} ${store}`.trim().slice(0, 200);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PHOTO_SEARCH_MS);
  try {
    const res = await fetchImpl(`https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(q)}&count=20&safesearch=strict&country=us`, { headers: { accept: 'application/json', 'x-subscription-token': key }, signal: ctrl.signal });
    if (!res.ok) {
      console.error('photo search failed', res.status);
      return null;
    }
    const j = await res.json();
    const want = rootOf(hostOf(url));
    const specific = specificWords(title, { store, url });
    const found = (j?.results || [])
      .map((r) => ({
        img: [r?.properties?.url, r?.thumbnail?.src].find((u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u)),
        host: rootOf(r?.meta_url?.hostname || hostOf(r?.url)),
        name: `${r?.title || ''}`,
        score: titleMatch(title, `${r?.title || ''}`),
      }))
      .filter((r) => r.img && !LOGO.test(r.img) && namesIt(specific, r.name));
    // The store's own site first. Otherwise only a store people know (or
    // the brand's own site), never a look-alike, and only for a name
    // specific enough to be sure it's the same product.
    const known = (r) => TRUSTED_STORES.has(r.host) || brandSite(store, r.host) || titleBrandSite(title, r.host);
    const hit = found.find((r) => want && r.host === want && r.score >= 0.4) || found.find((r) => known(r) && r.score >= 0.75 && keyWords(title).length >= 3);
    return hit ? hit.img.slice(0, 1000) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The product's own page at that store, from Brave's web index. Brave has
// already read pages that turn Spot away (Walmart, Target, Amazon…), and
// each result carries that page's own photo. { url, title, image_url, thumb }
// for a product page on the same site named for this product, else null.
// A category or search link gets the product's real page this way too.
export async function pageSearch({ title, url }, { fetchImpl = fetch, key = process.env.BRAVE_SEARCH_API_KEY } = {}) {
  const root = rootOf(hostOf(url));
  if (!key || !title || !root) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PHOTO_SEARCH_MS);
  try {
    const q = `${String(title).slice(0, 150)} site:${root}`;
    const res = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=us&safesearch=strict&result_filter=web`, { headers: { accept: 'application/json', 'x-subscription-token': key }, signal: ctrl.signal });
    if (!res.ok) {
      console.error('page search failed', res.status);
      return null;
    }
    const j = await res.json();
    const specific = specificWords(title, { url });
    const bare = (u) => String(u || '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
    const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 1000) : null);
    const found = (j?.web?.results || [])
      .map((r) => {
        const name = pageTitle(r?.title, root);
        const original = https(r?.thumbnail?.original);
        const thumb = https(r?.thumbnail?.src);
        const logo = r?.thumbnail?.logo || LOGO.test(original || '');
        // Brand sites title a page "Pehu | Maui Jim": weigh the name and the
        // link's own words, without the brand the site already is.
        const said = `${name} ${slugOf(r?.url)}`;
        return { url: https(r?.url), name, image_url: logo ? null : original || thumb, thumb: logo ? null : thumb, score: Math.max(titleMatch(title, name), titleMatch(sansSite(title, root), said)), same: bare(r?.url) === bare(url), said };
      })
      .filter((r) => r.url && sameSite(r.url, url) && !looksLikeListing(r.url) && namesIt(specific, r.said));
    const hit = found.find((r) => r.same && r.score >= 0.4) || found.filter((r) => r.score >= 0.6).sort((a, b) => b.score - a.score)[0];
    return hit ? { url: hit.url, title: hit.name, image_url: hit.image_url, thumb: hit.thumb } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
// A page address's words: /us/en/sunglasses/pehu-polarized/MJ602.html → "us en sunglasses pehu polarized mj602".
const slugOf = (u) => {
  try {
    return decodeURIComponent(new URL(u).pathname).replace(/\.(html?|php|aspx?)$/i, '').replace(/[^a-z0-9]+/gi, ' ');
  } catch {
    return '';
  }
};
// The store's own site, not another part of it (a brand's blog at
// livealoha.mauijim.com is not www.mauijim.com).
const sameSite = (a, b) => {
  const h = (u) => hostOf(u).toLowerCase().replace(/^www\./, '');
  return h(a) === h(b);
};
// The name without the words the site's own name already says.
const sansSite = (title, root) => {
  const label = String(root).split('.')[0].replace(/[^a-z0-9]/g, '');
  return String(title || '').split(/\s+/).filter((w) => !(w.length > 2 && label.includes(w.toLowerCase().replace(/[^a-z0-9]/g, '')))).join(' ') || title;
};
// "Original Wayfarer Sunglasses - Walmart.com" → "Original Wayfarer Sunglasses".
function pageTitle(t, root) {
  const label = String(root).split('.')[0].replace(/[^a-z0-9]/g, '');
  const parts = String(t || '').replace(/<[^>]+>/g, '').split(/\s+[|–—-]\s+/);
  while (parts.length > 1 && (parts.at(-1).toLowerCase().replace(/[^a-z0-9]/g, '').includes(label) || /^(shop|buy|free shipping|official)/i.test(parts.at(-1).trim()))) parts.pop();
  return decode(parts.join(' - ')).trim().slice(0, 140);
}

// A photo address from somewhere other than the store's page (the AI's
// note, a search): only if it really is an image. Best effort, quick.
export async function imageOk(u, { fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    let at = new URL(u);
    for (let hop = 0; hop < 3; hop++) {
      if (at.protocol !== 'https:') return false;
      await assertPublicHost(at.hostname);
      const res = await fetchImpl(at.href, { method: 'GET', redirect: 'manual', headers: { range: 'bytes=0-0', accept: 'image/*' }, signal: ctrl.signal });
      res.body?.cancel?.().catch?.(() => {});
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        at = new URL(res.headers.get('location'), at);
        continue;
      }
      return res.ok && /^image\//i.test(res.headers.get('content-type') || '');
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Listing pages ──────────────────────────────────────────────────────────
// Search sees result snippets, so it sometimes links a category or search
// page ("hoodies under $50") instead of the product. Find the product it named
// on that store: Shopify's own product search first, then the page's links.
const EDITORIAL = /\/(learn|blogs?|articles?|guides?|expert-advice|stories|journal|news|reviews?|pages)(\/|$)/i;
const LISTING = /\/(collections|category|categories|c|shop|browse|search|s)(\/|$)|[?&](q|k|query|keyword|keywords|searchterm|text|search|cn)=|-l\d+\.html$/i;
export function looksLikeListing(url) {
  try {
    const u = new URL(url);
    if (/\/products\/[^/]+/.test(u.pathname)) return false;
    // The store's home page, or a guide or story about products: not one.
    if (/^\/?([a-z]{2}([-_][a-z]{2})?\/?)?$/i.test(u.pathname) || EDITORIAL.test(u.pathname)) return true;
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
// Words that say what kind of thing it is, not which one: two different
// sunglasses share them, so they can't tell products apart.
const GENERIC = new Set(['sunglasse', 'glasse', 'polarized', 'sneaker', 'shoe', 'boot', 'sandal', 'slide', 'hoodie', 'sweatshirt', 'shirt', 'tee', 'top', 'pant', 'jean', 'short', 'dress', 'skirt', 'jacket', 'coat', 'sweater', 'cardigan', 'bag', 'backpack', 'hat', 'cap', 'sock', 'black', 'white', 'grey', 'gray', 'blue', 'red', 'green', 'brown', 'navy', 'pink', 'classic', 'original', 'kid', 'adult', 'size', 'pack', 'set']);
// The words that name this product: not generic, not the store (its name
// or its web address). "Tifosi Swank Polarized Sunglasses" at tifosioptics.com → swank.
export function specificWords(title, { store = '', url = '' } = {}) {
  const host = hostOf(url).toLowerCase();
  const brand = new Set(keyWords(store));
  const words = keyWords(title).filter((w) => !GENERIC.has(w) && !brand.has(w) && !(w.length > 2 && host.includes(w)));
  // A name usually leads with its brand ("Ray-Ban Clubmaster"): the brand
  // alone doesn't make it this product, when there's more to go on.
  const lead = new Set(keyWords(String(title).trim().split(/\s+/)[0] || ''));
  const rest = words.filter((w) => !lead.has(w));
  return rest.length ? rest : words;
}
// A candidate names the same product when its own name (not just its
// description) has one of those words, if there are any.
const namesIt = (specific, text) => !specific.length || keyWords(text).some((w) => specific.includes(w));
const bestMatch = (title, cands, hint = null, min = 0.6, specific = []) =>
  cands
    .map((c) => {
      const score = titleMatch(title, c.match || c.text);
      const g = hint && genderOf(c.text);
      return { ...c, score, rank: score + (g ? (g === hint ? 0.05 : -0.05) : 0) };
    })
    .filter((c) => c.score >= min && namesIt(specific, c.text))
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
      named: true, // the store's own product name, without a size
      match: `${p.title || ''} ${p.product_type || ''} ${String(p.body || '').replace(/<[^>]+>/g, ' ').slice(0, 300)}`,
      price_cents: dollarsToCents(p.price) || null,
      image_url: absolute(p.image || p.featured_image?.url, origin),
    }))
    .filter((p) => p.url);
}

// "Tree Runner - Mist - Size 8", "Midi Dress | Navy - XXS": the name, not the
// default size the page opened on.
const SIZE_TAIL = /\s*[-|/,]\s*(?:size\s*)?(?:x{0,3}s|s|m|l|x{0,3}l|\d{1,2}(?:\.5)?|\d{1,2}[tTmM]|one size)\s*$/i;
export const withoutSize = (t) => String(t || '').replace(/\s*[-|,]\s*size\s*\S+\s*$/i, '').replace(SIZE_TAIL, '').trim();

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
  const specific = specificWords(item.title, { url: item.url });
  let hit = bestMatch(item.title, await suggest(origin, item.title).catch(() => []), hint, 0.6, specific);
  if (!hit) {
    page ||= await fromUrl(item.url).catch(() => null);
    hit = page && !page.warning ? bestMatch(item.title, (page.links || []).filter((l) => !looksLikeListing(l.url)), hint, 0.6, specific) : null;
  }
  if (!hit || hit.url === item.url) return null;
  const url = tidyUrl(hit.url);
  const product = await fromUrl(url).catch(() => null);
  // Its own page, if Spot can read it and it is that product (not a bot check).
  const own = product && !product.warning ? product.items?.[0] : null;
  const found = own && Math.max(titleMatch(hit.text, own.title), titleMatch(item.title, own.title)) >= 0.5 ? own : null;
  return {
    url,
    // The product's name, not the size its page happens to show first.
    title: withoutSize(hit.named ? hit.text : found?.title || hit.text).slice(0, 140),
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

export function readMeta(html) {
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

export function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
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

export async function readCapped(res, max) {
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
const PRODUCT_HINT = `{"merchant_name": "", "merchant_url": "https://…", "product_url": "https://… its own page if you saw it, else the store page you found it on", "title": "its name as the store sells it (brand and model), not a description", "variant": "", "unit_price": "$0.00", "image_url": "https://… or empty", "why": "short reason, under 60 characters"}`;
const LOOKUP_SCHEMA_HINT = `{"kind": "products", "products": [${PRODUCT_HINT}]}  or  {"kind": "outfits", "outfits": [{"name": "short look name", "why": "one line", "items": [${PRODUCT_HINT}]}]}`;
export const MORE_MAX = 1700; // what they said after the first ask: up to the last few follow-ups, one per line
export const MAX_OPTIONS = 12; // per batch; the shelf asks for more as they swipe
export const MAX_OUTFITS = 4;

const q = (x) => String(x).replace(/"/g, "'");
// What the model is asked, for a whole answer (captureFromText) or a batch on
// the shelf (streamLookup: `count` products, a couple of outfits at a time).
export function lookupPrompt({ text, more = '', sizes = '', shipTo = '', taste = '', avoid = [], count = MAX_OPTIONS, outfits = MAX_OUTFITS }) {
  // Follow-ups lead: what they just said is the ask, the earlier asks only
  // fill in what it leaves out ("cheaper", "in blue", "more like these").
  const said = String(more || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const now = said.pop();
  return `${now ? `Someone is shopping and just said: "${q(now)}"
Earlier in this chat they asked for: ${[text, ...said].map((l) => `"${q(l)}"`).join(', then ')}
What they just said is what to find. If it names a kind of thing, stores, brands or a style, find exactly that and ignore the earlier asks (keep only a budget or sizes); stores they name are where to look. Only if it just adjusts the last finds ("cheaper", "in blue", "more like these") keep finding what they were last looking for, adjusted. Search the web for it now; don't reuse what you found before.` : `Someone is shopping and typed: "${q(text)}"`}

Using web search, find things for sale at US online stores that match. Read it the way a great personal shopper would: a budget ("under $50") is a price limit, an occasion or place ("for Coachella", "beach wedding") sets the style.
- If they want a look, an outfit, or clothes for an occasion or a trip, reply with outfits (as many as they ask for, up to ${outfits}): each a complete look of 3 to 5 pieces (for example top or dress, bottoms, shoes, one accessory) that suit the occasion, pieces from any stores. Every piece is a real product you found for sale ("Steve Madden Jypsey Heel", not "strappy heels"), with its own link.
- Otherwise reply with up to ${count} products, from as many different stores as you can (the brand's own store counts), your recommendation first.
Prefer the brand's own online store and shops that sell direct (many run on Shopify) over marketplaces like Amazon, Walmart, Target or eBay: Spot can buy from those and show their photos. Use a big marketplace only when it's clearly the best or only place to get it.
${sizes || shipTo ? `What you know about them:${sizes ? ` their sizes are ${q(sizes).slice(0, 300)}.` : ''}${shipTo ? ` They live in ${q(shipTo).slice(0, 80)}, so only pick stores that ship there.` : ''}\n` : ''}${taste ? `${String(taste).slice(0, 600)}\n` : ''}Use the size, colour or options they gave.${sizes ? ` For every clothing or shoe piece they didn't give a size for, pick the right one from their sizes (adult or kids' sizing to match what they asked for) and put it in "variant".` : ' Put the size or option you picked in "variant".'} Skip anything you saw marked sold out, but don't hold back for want of proof: Spot checks each store's own page for stock, size and price before anyone pays. Products named in roundups, gift guides, or category and search pages count: use them, with a link on the selling store's own site (the product's page if you saw it, else that store's home page: Spot finds the product there) and the price you saw (or your best estimate). Give each product's main photo in "image_url" if you saw its address, else leave it empty.${avoid.length ? ` They've already seen these, so don't suggest them again: ${avoid.join(' , ')}` : ''} Reply with ONLY this JSON and nothing else, writing each product as soon as you've found it:
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
  more = String(more || '').trim().slice(0, MORE_MAX);
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
// "… Western Boots | Boot Barn": the store's name isn't part of the product's.
export const withoutStore = (t, store) => {
  const name = typeof store === 'string' ? store.trim() : '';
  if (!name) return t;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(t).replace(new RegExp(`\\s+[|–—-]\\s*${esc}\\s*$`, 'i'), '').trim() || t;
};
// Search-result clutter in a name: "Options Options - Simple Modern 18oz…",
// "Deal, Hawsaiy 12oz Kids Bottle… From $8".
export const tidyTitle = (t) =>
  decode(String(t || ''))
    .replace(/\s*[|,-]?\s*price:?\s*\$\s?\d[\d.,]*\s*$/i, '')
    .replace(/^(?:(?:options|deal|sponsored|best\s*seller|clearance|rollback|popular pick)\s*[,:|–-]\s*|options\s+(?=options))+/i, '')
    .replace(/\s+(?:from|now|was|only)\s+\$\s?\d[\d.,]*.*$/i, '')
    .trim();
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
  p.title = withoutStore(tidyTitle(p.title), p.merchant_name);
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
  // Each: a page address, or { url, variant, title } (the size or option
  // picked; the product's name, for a category or search page).
  const byUrl = new Map();
  for (const u of [].concat(urls || [])) {
    const url = String(typeof u === 'string' ? u : u?.url || '');
    if (/^https?:\/\//i.test(url) && !byUrl.has(url)) byUrl.set(url, { variant: typeof u === 'object' && u?.variant ? String(u.variant).slice(0, 80) : '', title: typeof u === 'object' && u?.title ? String(u.title).slice(0, 140) : '' });
  }
  const list = [...byUrl.keys()].slice(0, DETAILS_MAX);
  if (!list.length || (!client && !process.env.ANTHROPIC_API_KEY)) return { pages: [] };
  const anthropic = client ?? anthropicClient();
  // One page per call, all at once, on the quicker model: a shelf of photos
  // in the time one page takes, not one after another (15–50s before).
  // An image search alongside each read: the AI rarely gets a photo from a
  // store that blocks readers, the image search usually does.
  const pages = await Promise.all(
    list.map(async (url) => {
      const { title } = byUrl.get(url);
      const [read, indexed, img] = await Promise.all([pageDetail(anthropic, url, byUrl.get(url), { onUsage, onError }), title ? pageSearch({ title, url }).catch(() => null) : null, title ? photoSearch({ title, url }).catch(() => null) : null]);
      // The store's page as Brave's index has it beats an image search.
      const photo = indexed?.image_url || img;
      if (!read) return photo ? { url, image_url: photo, stock: 'unknown', price_cents: null } : null;
      return { ...read, image_url: read.image_url || photo };
    }),
  );
  return { pages: pages.filter(Boolean) };
}
async function pageDetail(anthropic, url, { variant, title }, { onUsage, onError }) {
  const q = (x) => x.replace(/[\n"]/g, ' ');
  const content = `Open this page with web_fetch: ${url}
${title ? `It should be (or list) "${q(title)}"${variant ? `, in ${q(variant)}` : ''}. If it's a list or search page, report on that product.` : variant ? `Size or option: ${q(variant)}.` : ''}
Reply with ONLY this JSON: {"image_url": "the product's main photo, its full https address, or empty", "in_stock": true or false or null, "unit_price": "$0.00 or empty"}
Use empty or null for anything the page doesn't show or couldn't be opened.`;
  // The plain fetch: one page, read once (no filtering step after it).
  const tools = [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2, max_content_tokens: 20000 }];
  const messages = [{ role: 'user', content }];
  // Haiku first (the quickest: reading one page needs no more), thinking off;
  // Sonnet if Haiku turns the request down.
  const fast = process.env.SPOT_DETAILS_MODEL || 'claude-haiku-5-5';
  const steady = process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5';
  const ask = (model) =>
    /haiku/.test(model)
      ? anthropic.beta.messages.create({ model, max_tokens: 600, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, tools, messages })
      : anthropic.beta.messages.create({ model, max_tokens: 600, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' }, tools, messages });
  let response;
  const started = Date.now();
  try {
    try {
      response = await ask(fast);
    } catch (err) {
      if (!(err instanceof Anthropic.APIError) || fast === steady || ![400, 404].includes(err.status)) throw err;
      console.error('page details: quick model declined, using', steady, err.status, err.message);
      response = await ask(steady);
    }
    onUsage?.(response.model, response.usage);
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) {
      console.error('page details failed', err.status, err.message);
      return null;
    }
    throw err;
  }
  const v = readJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  // How often a photo comes back, and how fast: what to tune before launch.
  console.log('page details', `${Date.now() - started}ms`, response.model, new URL(url).hostname, v?.image_url ? 'photo' : 'no photo');
  if (!v) return null;
  const price = dollarsToCents(v.unit_price);
  return {
    url,
    image_url: typeof v.image_url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(v.image_url) ? v.image_url.slice(0, 1000) : null,
    stock: v.in_stock === true ? 'in' : v.in_stock === false ? 'out' : 'unknown',
    price_cents: price && price > 0 ? price : null,
  };
}

// ─── Streaming lookup ───────────────────────────────────────────────────────
// The shelf shows each pick the moment the model has written it, not after
// the whole answer and every store check (≈40s to the first card before).
// Events, in order:
//   { type: 'searching' }                          a web search started
//   { type: 'checking' }                           the first pick is written; its photo is being found
//   { type: 'pick', option } | { type: 'outfit', outfit }   each once its store check is back,
//                                                  with its photo (no photo: not shown)
//   { type: 'done', kind, count, not_found?, warning? }
export const FIRST_BATCH = 8; // quick to write (picks with no real photo or page are left out); the shelf asks for more as they swipe
const CHECK_MS = 9000; // one pick's store check, at most
const CHECK_WAIT_MS = 10_000; // store checks still out after the answer get this long

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

export async function streamLookup(raw, { client, fromUrl = captureFromUrl, product = shopifyProduct, resolve = resolveListing, photos = photoSearch, pdp = pageSearch, verify = imageOk, sizes = '', shipTo = '', taste = '', more = '', avoid = [], count = FIRST_BATCH, cache = null, onUsage, onError, now = Date.now } = {}, emit = () => {}) {
  const { text } = splitText(raw);
  if (!text) throw new CaptureError('Paste a link, drop a screenshot, or describe what you want');
  more = String(more || '').trim().slice(0, MORE_MAX);
  avoid = [].concat(avoid || []).map((u) => String(u).slice(0, 500)).filter((u) => /^https?:\/\//i.test(u)).slice(-60);
  count = Math.max(1, Math.min(MAX_OPTIONS, count | 0 || FIRST_BATCH));
  const followUp = Boolean(more || avoid.length);
  const nothing = () => emit({ type: 'done', kind: null, count: 0, not_found: true, warning: followUp ? 'I couldn’t find anything new for that. Try saying it another way' : 'I couldn’t find that one. Try different words, or paste a link' });
  if (!client && !process.env.ANTHROPIC_API_KEY) return nothing();

  const key = cache && JSON.stringify([text.toLowerCase(), more.toLowerCase(), avoid, sizes, shipTo, taste, count]);
  const cached = key && cache.get(key);
  if (cached) {
    for (const e of cached) emit(e);
    return;
  }

  const anthropic = client ?? anthropicClient();
  const outfitsWanted = Math.max(1, Math.min(MAX_OUTFITS, Math.ceil(count / 3)));
  const messages = [{ role: 'user', content: lookupPrompt({ text, more, sizes, shipTo, taste, avoid, count, outfits: outfitsWanted }) + QUICK }];
  const pages = new Map();
  const page = (u) => (pages.has(u) || pages.set(u, fromUrl(u)), pages.get(u));
  const seen = new Set(avoid);
  const sent = []; // what went out, kept up to date for the cache
  const checks = [];
  const stats = { searches: 0, steps: 0, objects: 0, unusable: 0, repeats: 0, dropped: 0, notProduct: 0, slow: 0, photos: {} };
  let taken = 0; // picks and looks written so far (each shown once its check is back)
  let closed = false;
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
  // Every card has the product's real photo, or it isn't shown: each pick
  // goes out once its store check is back (≈1–3s), with the photo, stock and
  // the product's own link. Where the photo comes from, best first:
  //  1. the store's page, read by Spot (its colour's photo on Shopify);
  //  2. the store's page as Brave's index has it (stores that turn Spot away);
  //  3. the photo the AI noted, if it really is an image;
  //  4. an image search, only for a plain match from a store people know.
  // A category or search link moves to the product's own page on the way.
  const check = async (d0) => {
    const it0 = d0.items[0];
    const r = await resolve(it0, { fromUrl: page }).catch(() => null);
    let d = r ? { ...d0, items: [{ ...it0, url: r.url, title: r.title, price_cents: r.price_cents || it0.price_cents, image_url: r.image_url || null }, ...d0.items.slice(1)] } : { ...d0, items: [{ ...it0, image_url: null }, ...d0.items.slice(1)] };
    const [withPic, stock0, found] = await Promise.all([
      withPhoto(d, page, undefined, null).catch(() => d),
      stockOf(d.items[0], { fromUrl: page, product }).catch(() => 'unknown'),
      pdp({ title: d.items[0].title, url: d.items[0].url }).catch(() => null),
    ]);
    let it = withPic.items[0];
    let stock = stock0;
    let from = it.image_url ? 'page' : null;
    if (!it.image_url && found) {
      // Brave's copy of the product's page: its photo, and its link if the
      // one we had wasn't the product's own page.
      // The store's own image address; Brave's copy of it if that won't load here.
      const img = found.image_url && (await verify(found.image_url)) ? found.image_url : found.thumb;
      if (img) {
        if (found.url !== it.url) (it = { ...it, url: found.url }), (stock = 'unknown');
        it = { ...it, image_url: img };
        from = 'index';
      } else if (found.url !== it.url) {
        // The product's page, with no photo in the index: Spot reads that page.
        const read = await withPhoto({ ...d, items: [{ ...it, url: found.url, image_url: null }, ...d.items.slice(1)] }, page, undefined, null).catch(() => null);
        if (read?.items[0].image_url) (it = { ...it, url: found.url, image_url: read.items[0].image_url }), (stock = 'unknown'), (from = 'page');
      }
    }
    if (!it.image_url && d0.hint_image && (await verify(d0.hint_image))) (it = { ...it, image_url: d0.hint_image }), (from = 'noted');
    if (!it.image_url) {
      const img = await photos({ title: it.title, store: d.merchant?.name || '', url: it.url }).catch(() => null);
      if (img && (await verify(img))) (it = { ...it, image_url: img }), (from = 'image search');
    }
    if (!it.image_url) return stats.dropped++, null;
    // No link, or still a home page, category or article: nothing to show or buy.
    if (!it.url || looksLikeListing(it.url)) return stats.notProduct++, null;
    stats.photos[from] = (stats.photos[from] || 0) + 1;
    let why = d0.why;
    // The store's own price beats the estimate search gave.
    if (r?.price_cents && why) why = why.replace(/\s*\(?est(?:imated|\.)? price\)?/i, '').trim() || null;
    // As it goes out: no page-markup leftovers ("Women&#x27;s", "&amp;hei=").
    return { merchant: d.merchant, item: { ...it, title: tidyTitle(it.title) || it.title, image_url: it.image_url.replace(/^http:\/\//i, 'https://').replace(/&amp;/g, '&') }, stock, why };
  };
  // Each check, capped, so one slow store doesn't hold the rest.
  const checked = (d) => {
    let timer;
    return Promise.race([check(d).catch(() => null), new Promise((r) => (timer = setTimeout(() => (stats.slow++, r(null)), CHECK_MS)))]).finally(() => clearTimeout(timer));
  };
  const show = (e) => {
    if (closed) return;
    sent.push(e);
    emit(structuredClone(e));
  };
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
      // A piece can be in more than one look (the same heel goes with two
      // dresses): only repeats within this look, or already-seen links, are out.
      const inLook = new Set();
      const items = pieces
        .slice(0, 6)
        .map((p) => pick(p, text))
        .filter(Boolean)
        .filter((d) => {
          const k = `${d.items[0].url}|${String(d.items[0].title).toLowerCase()}`;
          if ((d.items[0].url && avoid.includes(d.items[0].url)) || inLook.has(k)) return stats.repeats++, false;
          return inLook.add(k), seen.add(k), true;
        });
      if (items.length < 2) return stats.unusable++;
      kind = 'outfits';
      if (!taken++) emit({ type: 'checking' });
      const name = String(o.name || o.title || 'A look').trim().slice(0, 60);
      const why = String(o.why || o.description || '').trim().slice(0, 120) || null;
      // A look goes out with the pieces that have their photo (two at least).
      checks.push(
        Promise.all(items.map(checked)).then((got) => {
          const ok = got.filter(Boolean);
          if (ok.length >= 2) show({ type: 'outfit', outfit: { name, why, items: ok } });
          else stats.dropped++;
        }),
      );
      return;
    }
    if (kind === 'outfits') return;
    const d = pick(o, text);
    if (!d) return stats.unusable++;
    if (!fresh(d)) return;
    kind = 'products';
    if (!taken++) emit({ type: 'checking' });
    checks.push(checked(d).then((option) => option && show({ type: 'pick', option })));
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
      if (err instanceof Anthropic.APIError && (err.status === 404 || /model/i.test(err.message)) && model !== big && !taken) {
        console.error('lookup model unavailable, using', big, err.status, err.message);
        model = big;
        attempt--;
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        console.error('stream lookup failed', err.status, err.message);
        if (!taken) return emit({ type: 'done', kind: null, count: 0, not_found: true, warning: 'I couldn’t look that up right now. Try again in a minute, or paste a link' });
        break;
      }
      throw err;
    }
    if (taken || response?.stop_reason === 'refusal' || attempt === 1 || now() - started > FIND_BUDGET_MS / 2) break;
    // Nothing usable came back: say what it looked like, then one looser try.
    const out = (response?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    console.error('lookup answer had no picks', response?.stop_reason, out.slice(0, 400).replace(/\s+/g, ' '));
    const last = messages.at(-1);
    if (last.role === 'assistant') last.content = [...last.content, ...(response?.content || [])];
    else messages.push({ role: 'assistant', content: response?.content || [] });
    messages.push({ role: 'user', content: `That gave me nothing I could show. Give your best picks from what you found, even from roundups or category pages, and even if you couldn't confirm stock or the exact price: Spot checks the store pages itself, and close is better than nothing. Reply with ONLY the JSON, exactly in this shape:\n${LOOKUP_SCHEMA_HINT}` });
  }
  if (!taken) {
    console.log('stream lookup', `${now() - started}ms`, model, JSON.stringify({ ...stats, sent: 0, asked: count }), said.slice(-500).replace(/\s+/g, ' '));
    return nothing();
  }
  // The last store checks: each is capped, so this is a few seconds at most.
  let timer;
  await Promise.race([Promise.all(checks), new Promise((r) => (timer = setTimeout(r, CHECK_WAIT_MS)))]);
  clearTimeout(timer);
  closed = true;
  console.log('stream lookup', `${now() - started}ms`, model, JSON.stringify({ ...stats, taken, sent: sent.length, asked: count }), sent.length < Math.min(count, 3) ? said.slice(-500).replace(/\s+/g, ' ') : '');
  // Found some, but none with a real photo: say so, rather than show blanks.
  if (!sent.length) return emit({ type: 'done', kind: null, count: 0, not_found: true, warning: followUp ? 'I couldn’t find anything new with a photo. Try saying it another way' : 'I found a few, but couldn’t get their photos. Try different words, or paste a link' });
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
export async function shopifyProduct(url) {
  const { loadShopifyProduct } = await import('./fulfill/shopify.js');
  const product = await loadShopifyProduct(url, {});
  return product && { title: product.title, variants: product.variants, options: product.options };
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
    // A category page's picture is a banner, and a page's share image can be
    // the store's logo: neither is this product.
    const own = found.image_url && !looksLikeListing(item.url) && !LOGO.test(found.image_url) ? found.image_url : null;
    const image = (await colorPhoto(item, variantPhoto).catch(() => null)) || own || hint || null;
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
