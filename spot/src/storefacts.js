// What a product card shows beyond the pick itself, from data that's only
// cheap to get now that an AI can read any store's pages:
//   now      the store's price for the exact option, from its own data
//   was      the store's own "compare at" price, when it's on sale
//   options  the sizes and colours it comes in, and which are in stock
//   seen     the lowest and highest price Spot has seen for the page
//   policy   the store's price-adjustment and return policy, read by AI off
//            the store's own policy pages (search and fetch limited to its
//            site), kept a month. Never shown without the page it came from.
// Options, now and was come from Shopify stores' /products/<handle>.js; other
// stores get seen and policy.
import { readJson, rootOf, shopifyProduct } from './capture.js';
import { Anthropic, anthropicClient } from './anthropic.js';

const DAY = 86_400_000;
const POLICY_TTL = 30 * DAY;
const POLICY_RETRY = DAY; // a read that found nothing is tried again tomorrow
const POLICY_AT_ONCE = 3;
const MAX_ITEMS = 12;

export const siteOf = (url) => {
  try {
    return rootOf(new URL(url).hostname) || null;
  } catch {
    return null;
  }
};

// The answer, checked: whole days in range, booleans only when the page
// said so, and the source on the store's own site (or nothing is kept).
export function policyFrom(v, site) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.source_url !== 'string' || siteOf(v.source_url) !== site || !/^https:\/\//i.test(v.source_url)) return null;
  const days = (n) => (Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 365 ? Number(n) : null);
  const yes = (b) => (b === true ? true : b === false ? false : null);
  const out = {
    price_adjustment: yes(v.price_adjustment),
    adjustment_days: days(v.adjustment_days),
    adjustment_how: typeof v.adjustment_how === 'string' ? v.adjustment_how.trim().slice(0, 140) || null : null,
    returns_days: days(v.returns_days),
    free_returns: yes(v.free_returns),
    source_url: v.source_url.slice(0, 500),
    // Standard shipping, order to door, in business days; free over $X.
    ship_days_min: days(v.ship_days_min),
    ship_days_max: days(v.ship_days_max),
    free_shipping_over: Number.isFinite(Number(v.free_shipping_over)) && Number(v.free_shipping_over) >= 0 && Number(v.free_shipping_over) < 10000 && v.free_shipping_over !== null && v.free_shipping_over !== '' ? Math.round(Number(v.free_shipping_over) * 100) : null,
  };
  if (out.ship_days_min && out.ship_days_max && out.ship_days_min > out.ship_days_max) [out.ship_days_min, out.ship_days_max] = [out.ship_days_max, out.ship_days_min];
  if (!out.ship_days_max) out.ship_days_min = null;
  if (out.price_adjustment !== true) out.adjustment_days = null;
  return out.price_adjustment == null && out.returns_days == null && out.free_returns == null ? null : out;
}

async function readPolicy(site, name, { client, onUsage, onError } = {}) {
  const anthropic = client ?? anthropicClient();
  const who = name ? `${name} (${site})` : site;
  const content = `Find ${who}'s own customer policies on its own site:
1. Price adjustments: if ${site} lowers its price after someone buys, does it refund the difference? For how many days after purchase, and how do you ask?
2. Returns: how many days, and are returns free?
3. Standard shipping in the US: how many business days from order to delivery (processing plus transit), and the order total over which shipping is free.
Read the policy page itself (help center, FAQ, returns or price policy). Price matching a competitor is not a price adjustment.
Reply with ONLY this JSON:
{"price_adjustment": true | false | null, "adjustment_days": number or null, "adjustment_how": "a few words, e.g. contact customer service with your order number" or "", "returns_days": number or null, "free_returns": true | false | null, "ship_days_min": number or null, "ship_days_max": number or null, "free_shipping_over": dollars as a number (0 if always free) or null, "source_url": "the https address of the policy page you read, on ${site}"}
Say true or false only when the page says so (for example "we do not offer price adjustments"); null when it doesn't say.`;
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
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_domains: [site] },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, allowed_domains: [site], max_content_tokens: 20000 },
        ],
        messages,
      });
      onUsage?.(response.model, response.usage);
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    return policyFrom(readJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')), site);
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) return undefined; // try again next time, not tomorrow
    throw err;
  }
}

// The sizes and colours, each value marked in stock or not; just the ones
// with a choice (a single "Default Title" isn't one).
export function optionsOf(p) {
  const names = (p.options || []).map((o) => (typeof o === 'string' ? o : o?.name)).filter(Boolean);
  const out = [];
  names.slice(0, 3).forEach((name, i) => {
    const key = `option${i + 1}`;
    const vals = new Map();
    for (const v of p.variants || []) {
      const val = v[key];
      if (val == null || val === '') continue;
      vals.set(val, vals.get(val) || v.available !== false);
    }
    if (vals.size > 1) out.push({ name: String(name).slice(0, 40), values: [...vals].slice(0, 40).map(([value, inStock]) => ({ value: String(value).slice(0, 40), in: inStock })) });
  });
  return out;
}

// The variant a card is about: the link's ?variant=, else its option words.
async function variantOf(p, item) {
  const { matchVariant } = await import('./fulfill/shopify.js');
  let linked = null;
  try {
    linked = new URL(item.url).searchParams.get('variant');
  } catch {}
  const all = (p.variants || []).map((v) => ({ ...v, available: true }));
  return (linked && all.find((x) => String(x.id) === linked)) || (item.variant ? matchVariant(all, item.variant, p.title) : null) || (all.length === 1 ? all[0] : null);
}

export function createStoreFacts({ db, client = null, product = shopifyProduct, read = readPolicy, onUsage, onError, log = console } = {}) {
  const inflight = new Map();
  let running = 0;
  const queue = [];
  const next = () => {
    while (running < POLICY_AT_ONCE && queue.length) {
      const job = queue.shift();
      running++;
      job().finally(() => {
        running--;
        next();
      });
    }
  };

  // Cached, or null with a read started in the background.
  function policy(site, name, now = Date.now()) {
    if (!site) return { policy: null, pending: false };
    const got = db.policies.get(site);
    const fresh = got && now - got.at < (got.unknown ? POLICY_RETRY : POLICY_TTL);
    if (!fresh && !inflight.has(site)) {
      const p = new Promise((resolve) =>
        queue.push(() =>
          read(site, name, { client, onUsage, onError })
            .then((doc) => {
              if (doc !== undefined) db.policies.set(site, doc || { unknown: true }, Date.now());
            })
            .catch((err) => log.warn?.({ err, site }, 'store policy read failed'))
            .finally(() => (inflight.delete(site), resolve())),
        ),
      );
      inflight.set(site, p);
      next();
    }
    const doc = got && !got.unknown ? (({ at, unknown, ...d }) => d)(got) : null;
    return { policy: doc, pending: !fresh && inflight.has(site) };
  }

  async function one(item, now) {
    const url = String(item?.url || '');
    if (!/^https?:\/\//i.test(url)) return null;
    const site = siteOf(url);
    const out = { url, now_cents: null, was_cents: null, options: [], seen: null, policy: null, policy_pending: false };
    const p = await product(url).catch(() => null);
    if (p?.variants?.length) {
      out.options = optionsOf(p);
      const v = await variantOf(p, item);
      const price = Number(v?.price);
      const was = Number(v?.compare_at_price);
      if (Number.isInteger(price) && price > 0) {
        out.now_cents = price;
        db.prices.add(url, price, now);
        if (Number.isInteger(was) && was > price) out.was_cents = was;
      }
    }
    out.seen = db.prices.of(url, 90, now);
    const pol = policy(site, item.store ? String(item.store).slice(0, 80) : '', now);
    out.policy = pol.policy;
    out.policy_pending = pol.pending;
    return out;
  }

  return {
    policy,
    // Card facts for up to a dozen products at once.
    async facts(items, now = Date.now()) {
      const list = [].concat(items || []).slice(0, MAX_ITEMS);
      return (await Promise.all(list.map((it) => one(it, now).catch(() => null)))).filter(Boolean);
    },
    // A store's policy when it's already known (the price watch's window).
    known(site) {
      const got = site && db.policies.get(site);
      return got && !got.unknown ? got : null;
    },
    // The policy, reading it first if Spot hasn't yet (up to `ms`).
    async whenKnown(site, name = '', ms = 25000) {
      if (!site) return null;
      policy(site, name);
      const p = inflight.get(site);
      if (p) await Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
      const got = db.policies.get(site);
      return got && !got.unknown ? got : null;
    },
    settled: () => Promise.all(inflight.values()),
  };
}
