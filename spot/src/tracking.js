// One order tracker: where each order Spot placed is, across stores.
//   From the store   orders placed through agent checkout (UCP): Spot asks
//                    the store for the order (Get Order), whose fulfillment
//                    events carry each shipment's status, carrier and link.
//                    About every six hours for 45 days, until delivered.
//   From you         a tracking number pasted on the order page: the
//                    carrier is worked out from the number.
// cart.tracking = { status, carrier, number, url, description, at, source,
//   checked_at }; the requester is emailed when it ships, is out for
//   delivery, and is delivered (events.js 'shipping_update').
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EVERY_MS = 6 * HOUR;
const WINDOW = 45 * DAY;
const BATCH = 10;
export const STAGES = ['ordered', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];
const PROBLEMS = ['failed_attempt', 'canceled', 'undeliverable', 'returned_to_sender'];

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
  const status = STAGES.includes(type) ? type : PROBLEMS.includes(type) ? 'problem' : 'in_transit';
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

export function createTracker({ db, spot, getOrder = async () => null, log = console }) {
  let running = false;
  function apply(cart, next, now) {
    const prev = cart.tracking || null;
    const moved = next && next.status !== prev?.status && (rank(next.status) > rank(prev?.status || 'ordered') || next.status === 'problem');
    const out = spot.patch(cart.id, (c) => ({ ...c, tracking: { ...(c.tracking || {}), ...(next || {}), checked_at: now } }), moved ? `shipping_${next.status}` : null);
    if (moved && ['shipped', 'out_for_delivery', 'delivered', 'problem'].includes(next.status)) spot.emit?.('shipping_update', cart.id, { status: next.status });
    return out;
  }
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
          if (!c?.fulfillment?.order_id || c.tracking?.status === 'delivered') continue;
          if (c.tracking?.checked_at && now - c.tracking.checked_at < EVERY_MS) continue;
          n++;
          const order = await getOrder(c).catch((err) => (log.warn?.({ err, cart: id }, 'order status read failed'), null));
          apply(c, fromOrder(order), now);
        }
      } finally {
        running = false;
      }
      return n;
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
