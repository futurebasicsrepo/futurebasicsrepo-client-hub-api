// One order tracker: where each order Spot placed is, across stores.
//   From the store   orders placed through agent checkout (UCP), by Spot or
//                    by the payer on the store's own checkout: Spot asks
//                    the store for the order (Get Order), whose fulfillment
//                    events carry each shipment's status, carrier and link.
//                    About every six hours for 45 days, until delivered.
//   From its page    when the store won't answer Get Order (a Shopify store
//                    while Spot's app lacks the orders scope), the store's
//                    own order page ("View your order") is read for the
//                    carrier's tracking link or number (orderpage.js).
//   From you         a tracking number pasted on the order page: the
//                    carrier is worked out from the number.
// cart.tracking = { status, carrier, number, url, description, at, source,
//   checked_at }; the requester is emailed when it ships, is out for
//   delivery, and is delivered (events.js 'shipping_update').
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EVERY_MS = 6 * HOUR;
const ON_VIEW_MS = 15 * 60_000;
const WINDOW = 45 * DAY;
const BATCH = 10;
export const STAGES = ['ordered', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];
const PROBLEMS = ['failed_attempt', 'attempted_delivery', 'buyer_action_required', 'canceled', 'fulfillment_canceled', 'undeliverable', 'returned_to_sender', 'returning_to_sender'];
// Shopify's other event names, as Spot's stages (anything else is in transit).
const SAME = { carrier_picked_up: 'in_transit', confirmed: 'in_transit', delayed: 'in_transit', ready: 'processing', ready_for_pickup: 'out_for_delivery', picked_up: 'delivered' };

// The carrier and its tracking page, from the number's shape.
export function carrierOf(raw) {
  const n = String(raw || '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8,40}$/.test(n)) return null;
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return { carrier: 'UPS', number: n, url: `https://www.ups.com/track?tracknum=${n}` };
  if (/^(94|93|92|95|82)\d{18,24}$/.test(n) || /^[A-Z]{2}\d{9}US$/.test(n)) return { carrier: 'USPS', number: n, url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` };
  if (/^(\d{12}|\d{15}|96\d{20}|\d{20})$/.test(n)) return { carrier: 'FedEx', number: n, url: `https://www.fedex.com/fedextrack/?trknbr=${n}` };
  if (/^\d{10}$/.test(n)) return { carrier: 'DHL', number: n, url: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}` };
  return { carrier: null, number: n, url: null };
}

// The latest shipment state from a UCP order's fulfillment events.
export function fromOrder(order) {
  const events = [...(order?.fulfillment?.events || [])].filter((e) => e && e.type).sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  const last = events.at(-1);
  if (!last) return null;
  const type = String(last.type).toLowerCase();
  const status = STAGES.includes(type) ? type : PROBLEMS.includes(type) ? 'problem' : SAME[type] || 'in_transit';
  const withTracking = [...events].reverse().find((e) => e.tracking_number || e.tracking_url);
  const url = typeof withTracking?.tracking_url === 'string' && /^https:\/\//i.test(withTracking.tracking_url) ? withTracking.tracking_url.slice(0, 500) : null;
  return {
    status,
    carrier: typeof withTracking?.carrier === 'string' ? withTracking.carrier.slice(0, 40) : null,
    number: typeof withTracking?.tracking_number === 'string' ? withTracking.tracking_number.slice(0, 60) : null,
    url,
    description: typeof last.description === 'string' ? last.description.slice(0, 140) : null,
    at: Date.parse(last.occurred_at) || null,
    source: 'store',
  };
}

const rank = (s) => (s === 'problem' ? 2.5 : STAGES.indexOf(s));

// findOrderId(cart): the store's order id for a paid-at-the-store order
// that completed before Spot kept it (read back from the store's checkout).
export function createTracker({ db, spot, getOrder = async () => null, findOrderId = async () => null, readPage = async () => null, log = console }) {
  let running = false;
  function apply(cart, next, now) {
    const prev = cart.tracking || null;
    const moved = next && next.status !== prev?.status && (rank(next.status) > rank(prev?.status || 'ordered') || next.status === 'problem');
    const out = spot.patch(cart.id, (c) => ({ ...c, tracking: { ...(c.tracking || {}), ...(next || {}), checked_at: now } }), moved ? `shipping_${next.status}` : null);
    if (moved && ['shipped', 'out_for_delivery', 'delivered', 'problem'].includes(next.status)) spot.emit?.('shipping_update', cart.id, { status: next.status });
    return out;
  }
  // One order: its id from the store if Spot doesn't have it yet, then the
  // store's order now.
  async function one(c, now) {
    const id = c.id;
    if (!c.fulfillment.order_id) {
      const orderId = await findOrderId(c).catch((err) => (log.warn?.({ err, cart: id }, 'order id read failed'), null));
      if (!orderId) return apply(c, await page(c), now);
      c = spot.patch(c.id, (x) => ({ ...x, fulfillment: { ...x.fulfillment, order_id: String(orderId).slice(0, 200) } }));
    }
    // The id's shape (digits and letters masked), to see what a store didn't accept.
    const shape = String(c.fulfillment.order_id).replace(/[0-9]/g, '9').replace(/[a-z]/gi, 'a').slice(0, 60);
    const order = await getOrder(c).catch((err) => (log.warn?.({ err, cart: id, order_id_shape: shape }, 'order status read failed'), null));
    const fromStore = fromOrder(order);
    if (fromStore) return apply(c, fromStore, now);
    return apply(c, await page(c), now);
  }
  // The store's order page, when its API said nothing.
  async function page(c) {
    if (!c.fulfillment?.order_url) return null;
    const t = await readPage(c.fulfillment.order_url).catch(() => null);
    if (!t) return null;
    // Never step back: the page can lag what Spot already knew.
    return c.tracking?.status && rank(c.tracking.status) > rank(t.status) ? { ...t, status: c.tracking.status } : t;
  }
  const trackable = (c) => c?.fulfillment && c.tracking?.status !== 'delivered';
  return {
    // Orders placed through agent checkout, not yet delivered, a few a run.
    async sweep(now = Date.now()) {
      if (running) return 0;
      running = true;
      let n = 0;
      try {
        for (const id of db.idsToTrack(now - WINDOW)) {
          if (n >= BATCH) break;
          const c = db.byId(id);
          if (!trackable(c)) continue;
          if (c.tracking?.checked_at && now - c.tracking.checked_at < EVERY_MS) continue;
          n++;
          await one(c, now);
        }
      } finally {
        running = false;
      }
      return n;
    },
    // Its owner opened the order ("where's my order?"): ask the store now,
    // at most every 15 minutes, instead of waiting for the next sweep.
    async refresh(c, now = Date.now()) {
      if (!trackable(c) || (c.tracking?.checked_at && now - c.tracking.checked_at < ON_VIEW_MS)) return c;
      return one(c, now);
    },
    // A tracking number they pasted (from the store's shipping email).
    addNumber(cart, raw, now = Date.now()) {
      const t = carrierOf(raw);
      if (!t) throw Object.assign(new Error('That doesn’t look like a tracking number'), { status: 400 });
      const status = cart.tracking?.status && rank(cart.tracking.status) > rank('shipped') ? cart.tracking.status : 'shipped';
      return apply(cart, { ...t, status, description: null, at: now, source: cart.tracking?.source === 'store' ? 'store' : 'you' }, now);
    },
  };
}
