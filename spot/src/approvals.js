// Signed approvals: when a person says yes to a purchase (pays, pays the
// store directly, or taps Place order), Spot records exactly what they
// approved and signs it (signing.js). The approval travels with the order:
// the receipt links it, agents get it from get_spot_ask, and stores or
// anyone else can check it against /.well-known/spot-keys.json.
//
// Payload (JWT-style claims plus Spot's own):
//   iss  Spot's origin          sub  the cart (ask) id      jti  approval id
//   iat  when                    approved_by  payer | requester
//   how  paid_spot | paid_at_store | placed_order
//   merchant, items, amount_cents, currency, agent (the AI that asked, if any)
import { randomBytes } from 'node:crypto';
import { verifyApproval } from './signing.js';

export function createApprovals({ db, spot, signing, baseUrl, log = console }) {
  return {
    record(cartId, { by, how, amount_cents } = {}) {
      try {
        const cart = spot.byId(cartId);
        if (!cart) return null;
        const id = `apv_${randomBytes(12).toString('base64url')}`;
        const payload = {
          iss: baseUrl(),
          sub: cart.token,
          jti: id,
          iat: Math.floor(Date.now() / 1000),
          approved_by: by,
          how,
          merchant: { name: cart.merchant.name, url: cart.merchant.url || null },
          items: cart.items.map((i) => ({ title: i.title, variant: i.variant || null, quantity: i.quantity, price_cents: i.price_cents })),
          amount_cents: amount_cents ?? cart.total_cents,
          currency: 'USD',
          agent: cart.agent ? agentLabel(cart.agent) : null,
        };
        const jws = signing.signApproval(payload);
        db.approvals.add({ id, cart_id: cart.id, jws });
        db.event(cart.id, 'approval_signed', { id, by, how });
        return id;
      } catch (err) {
        log.error?.({ err, cart: cartId }, 'approval signing failed');
        return null;
      }
    },
    read: (jws) => verifyApproval(jws, signing.approvalKeys()),
    ofCart: (cartId) => db.approvals.ofCart(cartId),
    // What people and receipts show: who approved, how, when, and the link.
    summary(cartId) {
      return db.approvals.ofCart(cartId).map((a) => {
        const p = verifyApproval(a.jws, signing.approvalKeys()) || {};
        return { id: a.id, approved_by: p.approved_by || null, how: p.how || null, amount_cents: p.amount_cents ?? null, agent: p.agent || null, at: new Date(a.at).toISOString(), url: `${baseUrl()}/approvals/${a.id}` };
      });
    },
  };
}

// "key:claude-3f2a1c" → "claude"; partner names stay as they are.
export function agentLabel(agent) {
  const name = String(agent || '').replace(/^key:/, '');
  return name.replace(/-[0-9a-f]{6}$/, '') || null;
}
