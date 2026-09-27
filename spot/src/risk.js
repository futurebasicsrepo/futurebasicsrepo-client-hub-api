// Fraud controls. Stripe Radar screens each card payment first; these rules
// cover what Radar can't see: how a card is being used across Spot links,
// and how much money is flowing to one requester.
//
//   create   links per IP per day, and blocked IPs
//   payment  blocked card or email → refund at once
//            card paying too many links, or too much, in 24h → hold
//            requester receiving too much in 24h            → hold
//            first payment from a card above a threshold      → hold
//
// A held cart stays `paid`: no card is issued and no flight is booked until
// someone releases or refunds it from /admin.
import { CartError, usd } from './cart.js';

const DAY = 24 * 3600_000;

function int(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

export function riskLimits(env = process.env) {
  return {
    linksPerIpDay: int(env.SPOT_MAX_LINKS_PER_IP_DAY, 30),
    paymentsPerCardDay: int(env.SPOT_MAX_PAYMENTS_PER_CARD_DAY, 3),
    centsPerCardDay: int(env.SPOT_MAX_CARD_CENTS_DAY, 100_000),
    receivedCentsPerRequesterDay: int(env.SPOT_MAX_RECEIVED_CENTS_DAY, 150_000),
    firstPaymentHoldCents: int(env.SPOT_FIRST_PAYMENT_HOLD_CENTS, 40_000),
  };
}

export function createRisk({ db, env = process.env }) {
  const lim = riskLimits(env);
  const blocked = (kind, value) => db.blocks.reason(kind, value ? String(value).toLowerCase() : value);

  return {
    limits: lim,

    // Called before a link is made.
    checkCreate(ip) {
      if (!ip) return;
      if (blocked('ip', ip)) throw new CartError('Spot isn’t available from this network', 403);
      if (db.risk.countIp(ip, 'create', Date.now() - DAY) >= lim.linksPerIpDay) {
        throw new CartError('That’s a lot of Spots for one day. Try again tomorrow, or email us.', 429);
      }
      db.risk.noteIp(ip, 'create');
    },

    // Called once money has landed. Returns { action: 'ok' | 'hold' | 'refund', reason }.
    assessPayment(cart, payer = {}) {
      const fp = payer.fingerprint || null;
      const email = payer.email ? String(payer.email).toLowerCase() : null;
      const since = Date.now() - DAY;
      const amount = cart.total_cents;
      let out = { action: 'ok', reason: null };

      if (blocked('card', fp)) out = { action: 'refund', reason: 'Blocked card' };
      else if (blocked('email', email)) out = { action: 'refund', reason: 'Blocked payer email' };
      else if (blocked('ip', cart.requester_ip)) out = { action: 'refund', reason: 'Blocked requester network' };
      else {
        if (fp) {
          const card = db.risk.byFingerprint(fp, since);
          if (card.n + 1 > lim.paymentsPerCardDay) out = { action: 'hold', reason: `This card paid ${card.n + 1} Spots in 24h` };
          else if (card.cents + amount > lim.centsPerCardDay) out = { action: 'hold', reason: `This card paid ${usd(card.cents + amount)} in 24h` };
          else if (card.n === 0 && amount > lim.firstPaymentHoldCents && cart.for !== 'self') out = { action: 'hold', reason: `First payment from this card is ${usd(amount)}` };
        }
        if (out.action === 'ok' && cart.requester_ip && cart.for !== 'self') {
          const got = db.risk.byRequesterIp(cart.requester_ip, since);
          if (got.cents + amount > lim.receivedCentsPerRequesterDay) out = { action: 'hold', reason: `Requester received ${usd(got.cents + amount)} in 24h` };
        }
      }
      db.risk.recordPayment({ cart_id: cart.id, fingerprint: fp, payer_email: email, requester_ip: cart.requester_ip, amount_cents: amount });
      return out;
    },

    sweep() {
      db.risk.pruneIp(Date.now() - 2 * DAY);
    },
  };
}
