// "Watch this": a shopper taps 👀 on any card and Spot keeps an eye on that
// product for them, about twice a day for 60 days, from the store's own data
// (the exact size and colour on Shopify stores). It tells them when:
//   price  it drops at least $1 and 3% under where they started watching
//          (or under the last drop Spot told them about)
//   back   the option they wanted was sold out and is back in stock
// Signed-in shoppers only: alerts go to their own account's email and
// confirmed phone, never to an address typed into a form. 50 at a time.
//
// watch = { id, user_id, url, state: 'on' | 'off' | 'ended', next_at, at,
//   title, image_url, variant, store, store_url,
//   start_cents, base_cents, now_cents, low_cents, stock, until, last_at,
//   alerts: [{ kind: 'price' | 'back', at, cents }] }
import { randomBytes } from 'node:crypto';
import { captureFromUrl, priceNow, shopifyProduct, stockOf } from './capture.js';
import { CartError, usd } from './cart.js';
import { emailLayout } from './notify.js';
import { isDrop } from './pricewatch.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const WATCH_DAYS = 60;
export const WATCH_MAX = 50;
const EVERY_MS = 12 * HOUR;
const BATCH = 20;

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export function createWatches({ db, notifier, baseUrl = () => '', price = priceNow, stock = stockOf, product = shopifyProduct, fromUrl = captureFromUrl, log = console }) {
  // One store read per check: the price and the stock come from the same page.
  const reader = () => {
    const once = (fn) => {
      const memo = new Map();
      return (u) => (memo.has(u) ? memo.get(u) : memo.set(u, fn(u)).get(u));
    };
    return { product: once(product), fromUrl: once(fromUrl) };
  };
  const view = (w) => ({
    id: w.id,
    url: w.url,
    title: w.title,
    image_url: w.image_url,
    variant: w.variant,
    store: w.store,
    start_cents: w.start_cents,
    now_cents: w.now_cents,
    low_cents: w.low_cents,
    stock: w.stock,
    until: w.until,
    last_at: w.last_at,
    alerts: w.alerts || [],
  });

  async function tell(w, kind, cents) {
    const u = db.users.byId(w.user_id);
    if (!u) return null;
    const base = baseUrl();
    const link = `${base}/new?url=${encodeURIComponent(w.url)}`;
    const name = w.title + (w.variant ? ` (${w.variant})` : '');
    const store = w.store || 'the store';
    const msg =
      kind === 'price'
        ? {
            subject: `📉 ${w.title} is ${usd(w.base_cents - cents)} less at ${store}`,
            text: `${name} is now ${usd(cents)} at ${store}, down from ${usd(w.base_cents)}. See it in Spot: ${link}`,
            html: emailLayout({ base, preheader: `Now ${usd(cents)}, down from ${usd(w.base_cents)}`, title: `📉 ${usd(w.base_cents - cents)} less`, lines: [`<b>${esc(name)}</b> is now <b>${usd(cents)}</b> at ${esc(store)}, down from ${usd(w.base_cents)} when Spot last looked.`], cta: { label: 'See it in Spot →', url: link }, footer: 'You’re getting this because you asked Spot to watch this. Open Spot’s Shop page to stop watching.' }),
            sms: `Spot: ${name} dropped to ${usd(cents)} at ${store} (was ${usd(w.base_cents)}). ${link}`,
          }
        : {
            subject: `👀 ${w.title} is back in stock at ${store}`,
            text: `${name} is back in stock at ${store}${cents ? `, ${usd(cents)}` : ''}. These go fast: ${link}`,
            html: emailLayout({ base, preheader: 'It’s back. These go fast', title: '👀 It’s back in stock', lines: [`<b>${esc(name)}</b> is back at ${esc(store)}${cents ? `, ${usd(cents)}` : ''}.`], cta: { label: 'Get it in Spot →', url: link }, footer: 'You’re getting this because you asked Spot to watch this. Open Spot’s Shop page to stop watching.' }),
            sms: `Spot: ${name} is back in stock at ${store}${cents ? ` (${usd(cents)})` : ''}. ${link}`,
          };
    return notifier?.send({ email: u.email || null, phone: u.phone || null, userId: u.id }, msg).catch((err) => log.warn?.({ err }, 'watch alert failed'));
  }

  // quiet: the first read when watching starts, which sets the baseline.
  async function check(w, now = Date.now(), { quiet = false } = {}) {
    if (w.state !== 'on') return w;
    if (now > w.until) return db.watches.save({ ...w, state: 'ended' });
    const item = { url: w.url, variant: w.variant || '', title: w.title };
    const r = reader();
    const [p, s] = await Promise.all([price(item, r).catch(() => null), stock(item, r).catch(() => 'unknown')]);
    const cents = p?.cents ?? null;
    if (cents) db.prices?.add(w.url, cents, now);
    let next = { ...w, last_at: now, next_at: now + EVERY_MS, now_cents: cents ?? w.now_cents, low_cents: cents ? Math.min(cents, w.low_cents ?? cents) : w.low_cents, stock: s === 'unknown' ? w.stock : s };
    // Watching started without a store price (a page Spot couldn't read): the first one it gets.
    if (!next.base_cents && cents) next = { ...next, start_cents: next.start_cents || cents, base_cents: cents };
    const alerts = [];
    if (quiet);
    else if (w.stock === 'out' && s === 'in') alerts.push(['back', cents]);
    else if (next.base_cents && cents && isDrop(next.base_cents, cents)) alerts.push(['price', cents]);
    for (const [kind, c] of alerts) {
      await tell(next, kind, c);
      next = { ...next, alerts: [...(next.alerts || []), { kind, at: now, cents: c }].slice(-20) };
      if (kind === 'price') next.base_cents = c;
    }
    return db.watches.save(next);
  }

  return {
    check,
    view,
    list: (userId) => db.watches.list(userId).map(view),
    // Start (or restart) watching; the first store read happens right away.
    async start(userId, b, now = Date.now()) {
      const url = str(b?.url, 1000);
      if (!/^https?:\/\//i.test(url)) throw new CartError('That’s not a product link');
      const title = str(b?.title, 140);
      if (!title) throw new CartError('Which product?');
      const had = db.watches.of(userId, url);
      if (had?.state !== 'on' && db.watches.count(userId) >= WATCH_MAX) throw new CartError(`You’re watching ${WATCH_MAX} things already. Stop one on the Shop page first`, 409);
      const cents = Number.isInteger(b?.price_cents) && b.price_cents > 0 ? b.price_cents : null;
      const w = db.watches.save({
        ...(had || {}),
        id: had?.id || randomBytes(9).toString('base64url'),
        user_id: userId,
        url,
        state: 'on',
        at: had?.at || now,
        next_at: now,
        title,
        image_url: /^https:\/\//i.test(str(b?.image_url, 1000)) ? str(b.image_url, 1000) : had?.image_url || null,
        variant: str(b?.variant, 80) || null,
        store: str(b?.store, 80) || null,
        store_url: str(b?.store_url, 300) || null,
        start_cents: cents,
        base_cents: cents,
        now_cents: cents,
        low_cents: cents,
        stock: ['in', 'out'].includes(b?.stock) ? b.stock : 'unknown',
        until: now + WATCH_DAYS * DAY,
        alerts: had?.alerts || [],
      });
      // The store's own price, not a search estimate, is where watching starts.
      const first = await check({ ...w, base_cents: null, start_cents: null }, now, { quiet: true }).catch(() => w);
      return view(first);
    },
    stop(userId, id) {
      const w = db.watches.byId(id);
      if (!w || w.user_id !== userId) throw new CartError('Not found', 404);
      return view(db.watches.save({ ...w, state: 'off' }));
    },
    // A few due watches per run, oldest check first.
    async sweep(now = Date.now()) {
      let n = 0;
      for (const w of db.watches.due(now, BATCH)) {
        n++;
        await check(w, now).catch((err) => (log.warn?.({ err, watch: w.id }, 'watch check failed'), db.watches.save({ ...w, next_at: now + EVERY_MS })));
      }
      return n;
    },
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
