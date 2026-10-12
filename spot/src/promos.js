// Promo codes, tried for you. An AI finds a store's current codes (its own
// site first, then reputable coupon pages); kept twelve hours per store.
//   On the card   Shopify stores: each code is tried in a fresh storefront
//                 cart for that exact item (the store's own answer, then the
//                 cart is cleared), and only codes that take money off show.
//   At checkout   Spot sends the codes to stores whose agent checkout takes
//                 them (UCP discount extension, fulfill/ucp.js) and keeps the
//                 best that applies. The store charges less; the payer gets
//                 the difference back like any underspend.
// SPOT_PROMO_CODES=0 turns both off.
import { readJson, shopifyProduct } from './capture.js';
import { storeOrigin } from './direct.js';
import { Anthropic, anthropicClient } from './anthropic.js';
import { siteOf } from './storefacts.js';

const HOUR = 3_600_000;
const TTL = 12 * HOUR;
const RETRY = HOUR;
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/i;

export function codesFrom(v, site) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(v?.codes) ? v.codes : []) {
    const code = typeof c?.code === 'string' ? c.code.trim().toUpperCase() : '';
    if (!CODE.test(code) || seen.has(code)) continue;
    seen.add(code);
    const src = typeof c.source_url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(c.source_url) ? c.source_url.slice(0, 500) : null;
    out.push({ code, description: typeof c.description === 'string' ? c.description.replace(/\s+/g, ' ').trim().slice(0, 80) : '', source_url: src, from_store: Boolean(src && siteOf(src) === site) });
  }
  return out.slice(0, 6);
}

async function findCodes(site, store, { client, onUsage, onError } = {}) {
  const anthropic = client ?? anthropicClient();
  const name = String(store || '').replace(/[\n"]/g, ' ').slice(0, 80);
  const content = `Find promo codes that work right now on ${name ? `${name} (${site})` : site} for an online order shipped in the US.
Look at ${site} itself first (banners, welcome offers, promotions pages), then recent, reputable coupon pages.
Leave out codes that are expired, app-only, in-store only, single-use, or need student, military or account verification.
Reply with ONLY this JSON: {"codes": [{"code": "CODE", "description": "what it takes off, a few words", "source_url": "https address where you saw it"}]}
Up to 6, most likely to work first. {"codes": []} if you find none.`;
  const messages = [{ role: 'user', content }];
  try {
    let response;
    for (let i = 0; i < 3; i++) {
      response = await anthropic.beta.messages.create({
        model: process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1500,
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
    return codesFrom(readJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')), site);
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) return undefined;
    throw err;
  }
}

// Each code in a fresh storefront cart holding just this variant: how much
// it takes off, by the store's own count (an automatic discount the cart
// already has doesn't count). The cart is cleared after.
export async function cartTryCodes(productUrl, variantId, codes, { fetchImpl = fetch, allowPrivate = false } = {}) {
  let origin;
  try {
    origin = await storeOrigin(new URL(productUrl).origin, { fetchImpl, allowPrivate });
  } catch {
    return null;
  }
  if (!origin) return null;
  const json = { 'content-type': 'application/json', accept: 'application/json' };
  const add = await fetchImpl(`${origin}/cart/add.js`, { method: 'POST', headers: json, body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }), redirect: 'error', signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!add?.ok) return null;
  const set = typeof add.headers.getSetCookie === 'function' ? add.headers.getSetCookie() : [add.headers.get('set-cookie')].filter(Boolean);
  const cookie = set.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) return null;
  const update = async (discount) => {
    const r = await fetchImpl(`${origin}/cart/update.js`, { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ discount }), redirect: 'error', signal: AbortSignal.timeout(8000) }).catch(() => null);
    return r?.ok ? r.json().catch(() => null) : null;
  };
  const out = [];
  try {
    const base = await update('');
    const before = Number(base?.total_discount) || 0;
    for (const { code } of codes.slice(0, 6)) {
      const c = await update(code);
      if (!c) continue;
      const hit = (c.discount_codes || []).find((d) => String(d.code).toUpperCase() === code);
      const off = (Number(c.total_discount) || 0) - before;
      out.push({ code, applies: Boolean(hit?.applicable) && off > 0, cents_off: hit?.applicable && off > 0 ? off : 0 });
    }
  } finally {
    await fetchImpl(`${origin}/cart/clear.js`, { method: 'POST', headers: { cookie, accept: 'application/json' }, signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
  return out;
}

export function createPromos({ db, client = null, find = findCodes, tryCodes = cartTryCodes, product = shopifyProduct, onUsage, onError, log = console, env = process.env } = {}) {
  const off = () => env.SPOT_PROMO_CODES === '0';
  const inflight = new Map();
  async function codes(site, store, now = Date.now()) {
    if (!site) return [];
    const got = db.promos.get(site);
    if (got && now - got.at < (got.codes.length ? TTL : RETRY)) return got.codes;
    if (!inflight.has(site)) {
      inflight.set(
        site,
        find(site, store, { client, onUsage, onError })
          .then((list) => {
            if (list === undefined) return got?.codes || [];
            db.promos.set(site, { codes: list }, Date.now());
            return list;
          })
          .catch((err) => (log.warn?.({ err, site }, 'promo codes read failed'), got?.codes || []))
          .finally(() => inflight.delete(site)),
      );
    }
    return inflight.get(site);
  }
  return {
    // For a card: codes that took money off this item just now (Shopify
    // stores), best first; `found` = how many Spot had to try.
    async forItem(item, now = Date.now()) {
      if (off()) return { off: true };
      const site = siteOf(item.url);
      const list = await codes(site, item.store, now);
      if (!list.length) return { found: 0, working: [] };
      const p = await product(item.url).catch(() => null);
      if (!p?.variants?.length) return { found: list.length, working: [], untested: list.map((c) => ({ code: c.code, description: c.description })) };
      const { matchVariant } = await import('./fulfill/shopify.js');
      let linked = null;
      try {
        linked = new URL(item.url).searchParams.get('variant');
      } catch {}
      const v = (linked && p.variants.find((x) => String(x.id) === linked)) || (item.variant ? matchVariant(p.variants, item.variant, p.title) : null) || p.variants.find((x) => x.available !== false) || p.variants[0];
      const tried = (await tryCodes(item.url, v.id, list).catch(() => null)) || [];
      const working = tried
        .filter((t) => t.applies)
        .sort((a, b) => b.cents_off - a.cents_off)
        .map((t) => ({ ...t, description: list.find((c) => c.code === t.code)?.description || '' }));
      // What works, remembered for checkout.
      if (working.length) db.promos.set(site, { codes: [...working.map((w) => list.find((c) => c.code === w.code)), ...list.filter((c) => !working.some((w) => w.code === c.code))] }, db.promos.get(site)?.at || now);
      return { found: list.length, working, tested: true };
    },
    // For checkout: up to three codes to try, the ones seen working first.
    async forCart(cart) {
      if (off()) return [];
      const site = siteOf(cart.items?.find((i) => i?.url)?.url || cart.merchant?.url || '');
      return (await codes(site, cart.merchant?.name || '').catch(() => [])).slice(0, 3).map((c) => c.code);
    },
  };
}
