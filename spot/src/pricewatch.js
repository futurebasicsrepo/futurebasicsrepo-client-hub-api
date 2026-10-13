// Price watch. After an order is placed (with Spot's card, or paid on the
// store's own checkout), Spot checks the store's price once a day for the
// store's price-adjustment window (30 days by default, SPOT_PRICE_WATCH_DAYS).
// A real drop is listed on /admin. When the store's policy says it refunds
// a lower price, the customer is emailed and asks in one tap from their
// order page (priceclaim.js emails the store for them); staff can still
// claim any drop by hand. The payer hears once it's been asked for: nobody
// is promised money we haven't asked for. On a Spot-card order the refund
// lands on Spot's paused card (spot.js keeps it for SPOT_CARD_KEEP_DAYS) and
// goes straight back to the payer; paid at the store, the store refunds the
// payer's card itself.
//
// cart.price_watch = {
//   until, last_at,
//   state: 'watching' | 'dropped' | 'claimed' | 'dismissed' | 'refunded',
//   items: [{ i, title, variant, url, quantity, paid_cents, now_cents, low_cents, source, at }],
//   drop: { cents, found_at, items: [{ i, title, variant, paid_cents, now_cents, quantity }] } | null,
//   policy: { price_adjustment, days, how, source_url } | null   (the store's, when known)
//   claimed_at, dismissed_at, refunded_cents
// }
import { priceNow } from './capture.js';
import { CartError } from './cart.js';

const DAY = 86_400_000;
const EVERY_MS = 20 * 3_600_000; // about once a day, drifting so it isn't always the same hour
const BATCH = 15; // stores checked per run; the server runs it every 30 minutes

// Worth asking a store for: at least $1 and 3% under what was paid.
export const isDrop = (paid, now) => Number.isInteger(now) && now > 0 && paid - now >= Math.max(100, Math.round(paid * 0.03));

// The store's own window when its policy page gives one (storefacts.js),
// up to 90 days; otherwise SPOT_PRICE_WATCH_DAYS.
const MAX_DAYS = 90;

export function createPriceWatch({ db, spot, price = priceNow, policyOf = () => null, days = Number(process.env.SPOT_PRICE_WATCH_DAYS || 30), log = console }) {
  const windowMs = days * DAY;
  const policyFor = (c) => {
    try {
      return policyOf(c) || null;
    } catch {
      return null;
    }
  };
  const windowOf = (pol) => (pol?.price_adjustment && pol.adjustment_days ? Math.min(pol.adjustment_days, MAX_DAYS) * DAY : windowMs);
  const boughtAt = (c) => c.fulfillment?.placed_at || c.spent_at || null;
  // Only orders Spot paid with its own card and the store accepted, still
  // intact: nothing returned, disputed or refunded in full.
  // Paid on the store's own checkout counts too: the store refunds the
  // payer's card directly, so the customer asks (claimByCustomer).
  const watchable = (c) =>
    c &&
    (c.settle === 'card' ? ['card_issued', 'completed'].includes(c.status) && (c.fulfillment?.state === 'placed' || c.spent_at) : c.settle === 'direct' && c.status === 'completed' && c.fulfillment?.state === 'placed') &&
    (c.kind || 'goods') === 'goods' &&
    !c.dispute &&
    !(c.refunds || []).some((r) => r.reason === 'store_refund');
  let running = false;
  // A drop the customer can ask for: the store's policy says it refunds the
  // difference, and the window hasn't closed.
  const eligible = (c, now = Date.now()) => c?.price_watch?.state === 'dropped' && c.price_watch.policy?.price_adjustment === true && now <= c.price_watch.until;

  async function check(cart, now = Date.now()) {
    const at = boughtAt(cart);
    if (!watchable(cart) || !at) return cart;
    const pol = policyFor(cart);
    const until = at + windowOf(pol);
    const prev = cart.price_watch || { state: 'watching', items: [] };
    if (now > until || !['watching', 'dropped'].includes(prev.state)) return cart;
    const items = [];
    for (const [i, it] of (cart.items || []).entries()) {
      if (!it?.url || !it.price_cents) continue;
      const got = await price(it).catch(() => null);
      const before = prev.items?.find((x) => x.i === i);
      const nowCents = got?.cents ?? null;
      if (nowCents) db.prices?.add(it.url, nowCents, now);
      const lows = [before?.low_cents, nowCents].filter((x) => x != null);
      items.push({
        i,
        title: it.title,
        variant: it.variant || null,
        url: it.url,
        quantity: it.quantity || 1,
        paid_cents: it.price_cents,
        now_cents: nowCents,
        low_cents: lows.length ? Math.min(...lows) : null,
        source: got?.source || null,
        at: now,
      });
    }
    // Ask for today's price: most stores only match a price that's still live.
    const dropped = items.filter((x) => isDrop(x.paid_cents, x.now_cents));
    const cents = dropped.reduce((n, x) => n + (x.paid_cents - x.now_cents) * x.quantity, 0);
    const drop = dropped.length ? { cents, found_at: prev.drop?.found_at || now, items: dropped.map(({ i, title, variant, paid_cents, now_cents, quantity }) => ({ i, title, variant, paid_cents, now_cents, quantity })) } : null;
    const fresh = drop && prev.state !== 'dropped';
    const next = spot.patch(
      cart.id,
      (c) => {
        const cur = c.price_watch || prev;
        // Staff acted while the store was being read: theirs stands.
        if (!['watching', 'dropped'].includes(cur.state)) return c;
        const policy = pol ? { price_adjustment: pol.price_adjustment, days: pol.adjustment_days || null, how: pol.adjustment_how || null, source_url: pol.source_url || null, support_email: pol.support_email || null } : cur.policy || null;
        return { ...c, price_watch: { ...cur, until, last_at: now, items, drop, policy, state: drop ? 'dropped' : 'watching' } };
      },
      fresh ? 'price_drop' : null,
    );
    if (fresh) log.info?.({ cart: cart.id, cents }, 'price drop found');
    // The store says it refunds a lower price and it's still in time: tell
    // the customer, who can ask in one tap.
    if (fresh && eligible(next, now)) spot.emit?.('price_drop', cart.id, { cents });
    return next;
  }

  return {
    check,
    eligible,
    windowMs,
    // A few orders per run, those not checked for the longest first.
    async sweep(now = Date.now()) {
      if (running) return 0;
      running = true;
      let n = 0;
      try {
        for (const id of db.idsForPriceWatch(now - Math.max(windowMs, MAX_DAYS * DAY))) {
          if (n >= BATCH) break;
          const c = db.byId(id);
          const pw = c?.price_watch;
          if (!watchable(c) || (pw && !['watching', 'dropped'].includes(pw.state))) continue;
          if (pw?.last_at && now - pw.last_at < EVERY_MS) continue;
          n++;
          await check(c, now).catch((err) => log.warn?.({ err, cart: id }, 'price check failed'));
        }
      } finally {
        running = false;
      }
      return n;
    },

    // For /admin: drops to claim (still inside the store's window), and
    // claims sent that the store hasn't paid yet.
    list(now = Date.now()) {
      const out = [];
      for (const id of db.idsPriceDrops()) {
        const c = db.byId(id);
        const pw = c?.price_watch;
        if (!pw) continue;
        if (pw.state === 'dropped' && now > pw.until) continue;
        if (pw.state === 'claimed' && now - pw.claimed_at > windowMs) continue;
        out.push(c);
      }
      return out.sort((a, b) => (a.price_watch.state === b.price_watch.state ? b.price_watch.drop.cents - a.price_watch.drop.cents : a.price_watch.state === 'dropped' ? -1 : 1));
    },

    // Staff asked the store for the difference: now the payer is told.
    claim(id, now = Date.now()) {
      const c = db.byId(id);
      if (c?.price_watch?.state !== 'dropped') throw new CartError('No price drop to claim on this order', 409);
      const next = spot.patch(id, (x) => ({ ...x, price_watch: { ...x.price_watch, state: 'claimed', claimed_at: now } }), 'price_claimed');
      spot.emit?.('price_claimed', id, { cents: next.price_watch.drop.cents });
      return next;
    },

    // The customer asked from their order page (priceclaim.js): `send` emails
    // the store and says whether it went ({ sent, to }), or they sent it
    // themselves (self). The payer hears it was asked for.
    async claimByCustomer(id, { send = null, self = false } = {}, now = Date.now()) {
      const c = db.byId(id);
      if (c?.price_watch?.state === 'claimed') return { cart: c, sent: true, to: c.price_watch.claim?.to || null };
      if (!eligible(c, now)) throw new CartError(c?.price_watch?.state === 'dropped' ? 'This one can’t be asked for any more' : 'No price drop to ask for on this order', 409);
      let to = null;
      if (!self) {
        const r = await send(c);
        if (!r?.sent) return { cart: c, sent: false, ...r };
        to = r.to;
      }
      const next = spot.patch(id, (x) => ({ ...x, price_watch: { ...x.price_watch, state: 'claimed', claimed_at: now, claim: { by: self ? 'customer_self' : 'customer', to, at: now } } }), 'price_claimed');
      spot.emit?.('price_claimed', id, { cents: next.price_watch.drop.cents });
      return { cart: next, sent: true, to };
    },

    // Not worth it, or the store said no: stop watching this order.
    dismiss(id, now = Date.now()) {
      const c = db.byId(id);
      if (!['dropped', 'claimed'].includes(c?.price_watch?.state)) throw new CartError('Nothing to dismiss on this order', 409);
      return spot.patch(id, (x) => ({ ...x, price_watch: { ...x.price_watch, state: 'dismissed', dismissed_at: now } }), 'price_dismissed');
    },
  };
}
