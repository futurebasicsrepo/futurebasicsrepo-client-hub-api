// Tracking from the store's own order page: the "View your order" link a
// store gives back when an order is placed (a Shopify order status page,
// say). Used when the store won't answer Get Order (tracking.js), for
// example a Shopify store while Spot's catalog app lacks the orders scope.
//
// The page is fetched like any store page (public hosts only, capped), and
// read for what a person would see: a carrier's tracking link or a
// tracking number, and words like "Delivered" or "Out for delivery".
// → { status, carrier, number, url, description, at, source: 'store_page' } | null
import { assertPublicHost, decode, readCapped } from './capture.js';
import { carrierOf } from './tracking.js';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;
const UA = 'Mozilla/5.0 (compatible; SpotBot/0.2; +https://spotmeplease.com/for-stores)';

// Carrier tracking links, and where the number sits in each.
const LINKS = [
  [/https?:\/\/(?:www\.)?ups\.com\/(?:track|WebTracking)[^"'\s<>]*?(?:tracknum|trackNums|InquiryNumber1)=([A-Z0-9]{8,40})/i, 'UPS'],
  [/https?:\/\/tools\.usps\.com\/go\/TrackConfirmAction[^"'\s<>]*?(?:tLabels|qtc_tLabels1|tRef=fullpage&tLc=\d+&text28777=&tLabels)=([A-Z0-9]{8,40})/i, 'USPS'],
  [/https?:\/\/(?:www\.)?fedex\.com\/[^"'\s<>]*?(?:trknbr|tracknumbers|trackingnumber)=([0-9]{8,34})/i, 'FedEx'],
  [/https?:\/\/(?:www\.)?dhl\.com\/[^"'\s<>]*?(?:tracking-id|AWB|tracking_number)=([A-Z0-9]{8,40})/i, 'DHL'],
  [/https?:\/\/(?:www\.)?ontrac\.com\/[^"'\s<>]*?(?:tracking|trackingnumber|number)=([A-Z0-9]{8,40})/i, 'OnTrac'],
];
// The number as data on the page (Shopify's order status state, schema.org ParcelDelivery).
const KEYS = /["'](?:trackingNumber|tracking_number|trackingCode)["']\s*:\s*["']([A-Za-z0-9-]{8,40})["']/;
const URL_KEYS = /["'](?:trackingUrl|tracking_url|trackingURL)["']\s*:\s*["'](https:\\?\/\\?\/[^"']{8,400})["']/;
const CARRIER_KEYS = /["'](?:trackingCompany|tracking_company|carrier|carrierName)["']\s*:\s*["']([A-Za-z][A-Za-z .&-]{1,39})["']/;
// "Tracking number: 1Z…" as text.
const LABELED = /tracking\s*(?:number|#|no\.?)\s*[:#]?\s*(?:<[^>]+>\s*)*([A-Z0-9]{10,34})\b/i;

const STATUS = [
  // "Delivered", "was delivered" — not "will be delivered by", "expected to be delivered".
  [/(?<!\bbe\s)(?<!\bto\s)\bdelivered\b(?!\s+(?:by|in|within|between|on\s+or))/i, 'delivered'],
  [/\bout for delivery\b/i, 'out_for_delivery'],
  [/\b(?:in transit|on its way|on the way)\b/i, 'in_transit'],
  [/\b(?:shipped|has shipped|fulfilled)\b/i, 'shipped'],
];

const text = (html) =>
  decode(
    String(html)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');

// Read one page's HTML. Exported for tests.
export function readTracking(html) {
  const raw = String(html || '');
  const unslash = (s) => s.replace(/\\\//g, '/');
  let found = null;
  for (const [re, carrier] of LINKS) {
    const m = raw.match(re);
    if (m) {
      const t = carrierOf(m[1]);
      found = { carrier, number: t?.number || m[1].toUpperCase(), url: unslash(m[0]).replace(/&amp;/g, '&').slice(0, 500) };
      break;
    }
  }
  if (!found) {
    const n = raw.match(KEYS)?.[1] || text(raw).match(LABELED)?.[1];
    const t = n ? carrierOf(n) : null;
    if (t) {
      const u = raw.match(URL_KEYS)?.[1];
      const c = raw.match(CARRIER_KEYS)?.[1];
      found = { carrier: t.carrier || (c ? c.trim() : null), number: t.number, url: u ? unslash(u).slice(0, 500) : t.url };
    }
  }
  if (!found) return null;
  const words = text(raw);
  const status = STATUS.find(([re]) => re.test(words))?.[1] || 'shipped';
  return { status, ...found, description: null, at: null, source: 'store_page' };
}

export async function trackingFromOrderPage(orderUrl, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
  let url;
  try {
    url = new URL(orderUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && !allowPrivate) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Follow redirects by hand, each host checked like a store's.
    for (let hop = 0; hop < 5; hop++) {
      if (!allowPrivate) await assertPublicHost(url.hostname);
      const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html' } });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (loc) {
        await res.body?.cancel?.().catch(() => {});
        url = new URL(loc, url);
        continue;
      }
      if (!res.ok) return await res.body?.cancel?.().catch(() => {}), null;
      return readTracking(await readCapped(res, MAX_BYTES));
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
