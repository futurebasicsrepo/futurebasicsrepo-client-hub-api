// Spot's cards all draw on one Issuing balance. Before each payment Spot
// checks that one order fits (spot.readyCard), but orders add up: every paid
// order whose card the store hasn't charged yet is money already promised.
// This watches the balance against that and tells staff before a store
// declines a card someone already paid for.
//
//   committed   the card limits of paid orders not yet charged by the store
//   short       available < committed: a paid order's card can be declined
//   low         available < committed + headroom (SPOT_ISSUING_HEADROOM_CENTS,
//               default $500): the next big payment will be refused
//
// Alerts go to SPOT_ALERT_EMAIL (or SPOT_CONTACT_EMAIL), at most once every
// six hours per kind. A payer turned away for the balance alerts too.
import { cardLimitCents, usd } from './cart.js';

const HOURS6 = 6 * 3_600_000;

export function committedCents(db) {
  return db
    .idsByStatus(['paid', 'card_issued'])
    .map((id) => db.byId(id))
    .filter((c) => c && c.settle === 'card' && c.kind !== 'flight' && !c.spent_at && !c.card_canceled)
    .reduce((n, c) => n + cardLimitCents(c), 0);
}

export function fundsState(available, committed, headroom) {
  if (available == null) return null;
  return available < committed ? 'short' : available < committed + headroom ? 'low' : 'ok';
}

export function createFunds({ db, provider, notifier, env = process.env, log = console, now = () => Date.now() }) {
  const headroom = Math.max(0, Number(env.SPOT_ISSUING_HEADROOM_CENTS) || 50000);
  async function alert(kind, subject, lines) {
    const to = env.SPOT_ALERT_EMAIL || env.SPOT_CONTACT_EMAIL;
    const key = `funds_alerted:${kind}`;
    const last = db.state.get(key);
    if (!to || !notifier || (last != null && now() - last < HOURS6)) return false;
    db.state.set(key, now());
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    await notifier.send({ email: to }, { subject, text: lines.join('\n'), html: lines.map((l) => `<p>${esc(l)}</p>`).join('') }).catch(() => {});
    return true;
  }
  return {
    headroom,
    // { available_cents, committed_cents, state } (null when the balance can't be read).
    async status() {
      const available = provider.issuingAvailableCents ? await provider.issuingAvailableCents().catch(() => null) : null;
      if (available == null) return null;
      const committed = committedCents(db);
      return { available_cents: available, committed_cents: committed, headroom_cents: headroom, state: fundsState(available, committed, headroom) };
    },
    // The half-hourly look (server sweeper).
    async check() {
      const s = await this.status();
      if (!s || s.state === 'ok') return s;
      const what = `${usd(s.available_cents)} available for Spot's cards; ${usd(s.committed_cents)} is promised to paid orders the stores haven't charged yet.`;
      if (s.state === 'short') await alert('short', '🚨 Spot can’t cover paid orders: add funds now', [what, 'A store could decline a Spot card someone already paid for. Add funds to the Business account in Stripe → Balances.']);
      else await alert('low', '⚠️ Spot’s card balance is getting low', [what, `Under ${usd(headroom)} is left for new payments, so bigger ones will be turned away. Add funds in Stripe → Balances.`]);
      log.warn?.({ ...s }, 'issuing balance low');
      return s;
    },
    // A payer was turned away because the balance didn't cover their order.
    async refused({ cart, need_cents, available_cents }) {
      return alert('refused', '⚠️ A payment was turned away: Spot’s card balance is too low', [`Someone tried to pay ${usd(need_cents)} for ${cart?.merchant?.name || 'an order'}, but only ${usd(available_cents)} is available for Spot's cards, so they were told to try later. Nothing was charged.`, 'Add funds to the Business account in Stripe → Balances.']);
    },
  };
}
