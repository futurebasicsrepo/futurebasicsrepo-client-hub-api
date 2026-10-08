// Fund your own AI: an account saves its own card once, and its AI's asks
// are paid from it, one capped, store-locked Spot card per task.
//
// Two ways, set per AI key in its rules (rules.js `pay`):
//   'tap'   Spot texts/emails "Approve $84 at Nike from Visa •4242?" and one
//           tap pays. A person says yes to every purchase.
//   'auto'  Inside the key's rules, Spot pays right away and places the order
//           without asking, as long as the store's total is inside the cap.
//           A separate opt-in on the account (POST /v1/me/funding/auto with
//           agree: true), and the key needs a max per order.
//
//   POST /v1/me/funding/setup              → Stripe SetupIntent for the account page
//   POST /v1/me/funding { setup_intent }   → save it (sandbox: { test_card })
//   POST /v1/me/funding/remove             → forget it; keys go back to links
//   POST /v1/me/funding/auto { on, agree } → the separate opt-in for 'auto'
//   POST /v1/me/ai/stop | /v1/me/ai/resume → the kill switch: refuses every
//        ask from this account's AIs and refunds cards not yet used
//   POST /v1/carts/:token/manage/pay-saved → the one tap (signed in as the owner)
//
// The card number goes from the browser to Stripe; Spot keeps Stripe's ids
// and the brand, last four and expiry to show.
import { CartError } from './cart.js';
import { sessionUserId } from './accounts.js';
import { ownerCart } from './spot.js';

export const fundingOf = (db, userId) => {
  const f = userId ? db.state.get(`funding:${userId}`) : null;
  return f?.pm ? f : null;
};
export const aiStopped = (db, userId) => Boolean(userId && db.state.get(`ai_stop:${userId}`)?.at);
export const cardLabel = (f) => (f ? `${f.brand} •${f.last4}` : null);

export function fundingView(db, userId) {
  const f = fundingOf(db, userId);
  return {
    card: f ? { label: cardLabel(f), brand: f.brand, last4: f.last4, exp_month: f.exp_month, exp_year: f.exp_year, added_at: f.added_at } : null,
    auto_ok: Boolean(f?.auto_ok_at),
    ai_stopped: aiStopped(db, userId),
  };
}

const ordering = (cart) => ['starting', 'working', 'awaiting_confirm', 'placed'].includes(cart.fulfillment?.state);

export function registerFunding(app, { db, provider, spot, log = console }) {
  const json = (req) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
  };
  const me = (req) => {
    const id = sessionUserId(db, req);
    const user = id && db.users.byId(id);
    if (!user) throw new CartError('Sign in first', 401);
    return user;
  };
  // Keys whose pay mode needs something the account no longer has.
  const downgrade = (userId, from, to) => {
    for (const k of db.users.keys(userId)) {
      if (k.rules && from.includes(k.rules.pay)) db.keyRules.set(userId, k.name, { ...k.rules, pay: to });
    }
  };

  app.post('/v1/me/funding/setup', async (req) => {
    json(req);
    const user = me(req);
    const saved = db.state.get(`funding:${user.id}`);
    const out = await provider.setupFunding(user, saved);
    if (out.customer && out.customer !== saved?.customer) db.state.set(`funding:${user.id}`, { ...(saved || {}), customer: out.customer });
    return out;
  });

  app.post('/v1/me/funding', async (req) => {
    json(req);
    const user = me(req);
    const saved = db.state.get(`funding:${user.id}`);
    let card;
    try {
      card = await provider.saveFunding(user, saved, req.body || {});
    } catch (err) {
      throw new CartError(err.message || 'That card didn’t save', 400);
    }
    // A new card starts without the automatic opt-in: it's agreed per card.
    if (saved?.pm && saved.pm !== card.pm) await provider.removeFunding(saved).catch(() => {});
    db.state.set(`funding:${user.id}`, { customer: card.customer || saved?.customer || null, ...card, added_at: Date.now(), auto_ok_at: null });
    downgrade(user.id, ['auto'], 'tap');
    return fundingView(db, user.id);
  });

  app.post('/v1/me/funding/remove', async (req) => {
    json(req);
    const user = me(req);
    const saved = db.state.get(`funding:${user.id}`);
    if (saved?.pm) await provider.removeFunding(saved).catch((err) => log.error?.({ err }, 'detach failed'));
    db.state.set(`funding:${user.id}`, saved?.customer ? { customer: saved.customer } : null);
    downgrade(user.id, ['tap', 'auto'], 'link');
    return fundingView(db, user.id);
  });

  // The separate opt-in for AIs that pay on their own.
  app.post('/v1/me/funding/auto', async (req) => {
    json(req);
    const user = me(req);
    const f = fundingOf(db, user.id);
    if (req.body?.on) {
      if (!f) throw new CartError('Add your card first', 409);
      if (req.body.agree !== true) throw new CartError('Tick the box to agree that your AI can pay without asking you each time', 400);
      db.state.set(`funding:${user.id}`, { ...f, auto_ok_at: Date.now() });
    } else if (f) {
      db.state.set(`funding:${user.id}`, { ...f, auto_ok_at: null });
      downgrade(user.id, ['auto'], 'tap');
    }
    return fundingView(db, user.id);
  });

  // The kill switch. Every AI on the account stops: new asks are refused,
  // and cards already paid for but not yet used are canceled and refunded.
  app.post('/v1/me/ai/stop', async (req) => {
    json(req);
    const user = me(req);
    db.state.set(`ai_stop:${user.id}`, { at: Date.now() });
    let refunded = 0;
    let kept = 0;
    for (const c of db.users.carts(user.id, 500)) {
      if (!c.agent || !['paid', 'card_issued'].includes(c.status)) continue;
      if (ordering(c)) {
        kept++;
        continue;
      }
      try {
        await spot.refundCart(c, { reason: 'ai_stopped', by: 'requester' });
        refunded++;
      } catch (err) {
        log.error?.({ err, cart: c.id }, 'kill switch refund failed');
      }
    }
    for (const k of db.users.keys(user.id)) if (!k.revoked) db.agentEvents.add(`key:${k.name}`, user.id, 'ai_stopped', { refunded });
    return { ...fundingView(db, user.id), refunded, still_ordering: kept };
  });

  app.post('/v1/me/ai/resume', async (req) => {
    json(req);
    const user = me(req);
    db.state.set(`ai_stop:${user.id}`, null);
    for (const k of db.users.keys(user.id)) if (!k.revoked) db.agentEvents.add(`key:${k.name}`, user.id, 'ai_resumed', null);
    return fundingView(db, user.id);
  });

  // The one tap. Only the signed-in owner can charge their own card.
  app.post('/v1/carts/:token/manage/pay-saved', async (req) => {
    json(req);
    const user = me(req);
    const cart = spot.loadManaged(req.params.token, { userId: user.id });
    if (cart.user_id !== user.id) throw new CartError('Cart not found', 404);
    if (aiStopped(db, user.id) && cart.agent) throw new CartError('You stopped AI spending. Turn it back on in your account first.', 409);
    const f = fundingOf(db, user.id);
    if (!f) throw new CartError('Add your card in your account first', 409);
    const out = await spot.paySaved(cart.token, f, { present: true, how: { by: 'requester', how: 'approved_saved_card' } });
    return { cart: ownerCart(out.cart), ...(out.action ? { action: out.action } : {}) };
  });
}
