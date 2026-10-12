// Same product, cheaper elsewhere. An AI searches other stores for this
// exact product (same brand, model and colour); Spot then reads each store's
// own price where it can (Shopify data or the product page), so a "verified"
// price is the store's, not the search's. Offers at least $1 under the card's
// price are kept, cheapest first; none means Spot looked and this is the
// best price it found. Kept a day per product page (prices move).
//
// result = { offers: [{ store, url, cents, verified, in_stock }], checked_at }
import { dollarsToCents } from './cart.js';
import { looksLikeListing, priceNow, readJson } from './capture.js';
import { Anthropic, anthropicClient } from './anthropic.js';
import { siteOf } from './storefacts.js';

const DAY = 86_400_000;
const MAX = 3;

async function findOffers({ url, title, store, variant }, { client, onUsage, onError } = {}) {
  const anthropic = client ?? anthropicClient();
  const q = (x) => String(x || '').replace(/[\n"]/g, ' ').slice(0, 160);
  const content = `Find this exact product for sale at other US online stores:
"${q(title)}"${variant ? ` (${q(variant)})` : ''}, now at ${q(store) || 'its store'}: ${url}
Same brand, same model, same colour. Not a similar product, a used one, or a marketplace reseller listing. Reputable stores only (the brand's own site, big retailers, well-known specialty shops).
Reply with ONLY this JSON:
{"offers": [{"store": "store name", "url": "https address of the product page", "price": "$0.00", "in_stock": true | false | null}]}
Up to 5, cheapest first. {"offers": []} if you can't find it elsewhere.`;
  const messages = [{ role: 'user', content }];
  try {
    let response;
    for (let i = 0; i < 3; i++) {
      response = await anthropic.beta.messages.create({
        model: process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
        messages,
      });
      onUsage?.(response.model, response.usage);
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    const v = readJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    return Array.isArray(v?.offers) ? v.offers : [];
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) return undefined;
    throw err;
  }
}

// What the search found, checked and priced from each store's own data.
export async function checkOffers(found, { url, variant, price_cents }, { price = priceNow } = {}) {
  const here = siteOf(url);
  const seen = new Set();
  const out = [];
  for (const o of (found || []).slice(0, 8)) {
    const u = typeof o?.url === 'string' ? o.url.trim() : '';
    const site = siteOf(u);
    if (!/^https:\/\//i.test(u) || !site || site === here || seen.has(site) || looksLikeListing(u)) continue;
    seen.add(site);
    const said = dollarsToCents(o.price);
    const got = await price({ url: u, variant: variant || '' }).catch(() => null);
    const cents = got?.cents || said;
    if (!cents || cents <= 0) continue;
    out.push({ store: String(o.store || site).trim().slice(0, 60), url: u.slice(0, 1000), cents, verified: Boolean(got?.cents), in_stock: o.in_stock === true ? true : o.in_stock === false ? false : null });
  }
  const floor = price_cents ? price_cents - 100 : Infinity;
  return out.filter((o) => o.cents <= floor && o.in_stock !== false).sort((a, b) => a.cents - b.cents).slice(0, MAX);
}

export function createCompare({ db, client = null, find = findOffers, price = priceNow, onUsage, onError, log = console } = {}) {
  const inflight = new Map();
  return {
    async offers(item, now = Date.now()) {
      const key = `${item.url}|${item.variant || ''}|${item.price_cents || ''}`;
      const got = db.compares.get(key);
      if (got && now - got.at < DAY) return { offers: got.offers, checked_at: got.at };
      if (!inflight.has(key)) {
        inflight.set(
          key,
          find(item, { client, onUsage, onError })
            .then(async (found) => {
              if (found === undefined) return null;
              const offers = await checkOffers(found, item, { price });
              db.compares.set(key, { offers }, now);
              return { offers, checked_at: now };
            })
            .catch((err) => (log.warn?.({ err, url: item.url }, 'compare failed'), null))
            .finally(() => inflight.delete(key)),
        );
      }
      return inflight.get(key);
    },
  };
}
