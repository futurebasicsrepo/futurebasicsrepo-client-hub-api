// "Arrives by", on a card. For a Shopify store, the real thing: the store's
// own cart is asked for its shipping rates to the shopper's saved address
// (as Spot's checkout already does for totals), and the dates the store
// gives for the cheapest and the fastest rate. Otherwise an estimate from
// the store's shipping policy (storefacts.js), in business days from today.
// Kept six hours per product and ZIP.
import { cartShippingRates } from './direct.js';
import { shopifyProduct } from './capture.js';

const HOUR = 3_600_000;
const TTL = 6 * HOUR;

// Business days from `from`, skipping weekends: the date it lands, as "2026-10-16".
export function addBusinessDays(from, n) {
  const d = new Date(from);
  d.setUTCHours(12, 0, 0, 0);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

async function variantId(p, item) {
  const { matchVariant } = await import('./fulfill/shopify.js');
  let linked = null;
  try {
    linked = new URL(item.url).searchParams.get('variant');
  } catch {}
  const vs = p.variants || [];
  const v = (linked && vs.find((x) => String(x.id) === linked)) || (item.variant ? matchVariant(vs, item.variant, p.title) : null) || (vs.length === 1 ? vs[0] : null) || vs.find((x) => x.available !== false);
  return v?.id || null;
}

export function createDelivery({ product = shopifyProduct, rates = cartShippingRates, policyOf = () => null, log = console } = {}) {
  const memo = new Map();
  async function fromStore(item, ship) {
    const p = await product(item.url).catch(() => null);
    if (!p?.variants?.length) return null;
    const id = await variantId(p, item);
    if (!id) return null;
    const got = await rates(item.url, [{ item: { id: String(id) }, quantity: 1 }], ship).catch(() => null);
    if (!got?.length) return null;
    const cheapest = [...got].sort((a, b) => a.cents - b.cents || (a.max_date || '9').localeCompare(b.max_date || '9'))[0];
    const dated = got.filter((r) => r.max_date);
    const fastest = dated.length ? [...dated].sort((a, b) => a.max_date.localeCompare(b.max_date) || a.cents - b.cents)[0] : null;
    return { source: 'store', cheapest, fastest: fastest && fastest !== cheapest && fastest.max_date < (cheapest.max_date || '9') ? fastest : null };
  }
  return {
    // ship: the shopper's saved address ({ city, state, postal_code }) or null.
    async arrives(item, ship, now = Date.now()) {
      const key = `${item.url}|${ship?.postal_code || ''}|${item.variant || ''}`;
      const hit = memo.get(key);
      if (hit && now - hit.at < TTL) return hit.value;
      let value = null;
      if (ship?.postal_code) value = await fromStore(item, ship).catch((err) => (log.warn?.({ err }, 'delivery read failed'), null));
      if (!value) {
        const pol = await Promise.resolve(policyOf(item)).catch(() => null);
        if (pol?.ship_days_max) value = { source: 'policy', min_date: addBusinessDays(now, pol.ship_days_min || pol.ship_days_max), max_date: addBusinessDays(now, pol.ship_days_max), free_over_cents: pol.free_shipping_over ?? null, source_url: pol.source_url || null };
      }
      value = value ? { ...value, to: ship?.city ? [ship.city, ship.state].filter(Boolean).join(', ') : null } : { none: true };
      memo.set(key, { at: now, value });
      if (memo.size > 2000) memo.delete(memo.keys().next().value);
      return value;
    },
  };
}
