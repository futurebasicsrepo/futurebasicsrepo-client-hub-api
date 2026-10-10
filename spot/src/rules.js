// Spending rules for an account's AI keys, and the account's approver.
//
// Each AI key an account connects can carry rules:
//   max_order_cents  no single ask over this
//   monthly_cents    this key's asks this month add up to no more than this
//   stores           only these stores (domains; "nike.com" also allows www.nike.com)
//   pay              how an ask inside the rules gets paid (see funding.js):
//                    'link'  a link to pay (the default; anyone can pay it)
//                    'tap'   the account's own saved card, after the person
//                            taps Approve on the text or email
//                    'auto'  the account's own saved card, right away. A
//                            separate opt-in on the account, and it needs a
//                            max_order_cents: that caps every task's card.
//   approver         'never'      break a rule → refused (the AI is told why)
//                    'over_limit' break a limit → it goes to the approver to pay
//                    'always'     every ask goes to the approver to pay
//
// The approver is a person the account names (a parent, a partner, a
// finance inbox). They confirm by email before anything is sent to them,
// and they can say no to any ask. Approvers never see a card number: they
// pay with Spot (or at the store) like any payer, and their yes is signed.
import { CartError } from './cart.js';

const APPROVER = ['never', 'over_limit', 'always'];
export const PAY = ['link', 'tap', 'auto'];

export function normalizeRules(b = {}) {
  const cents = (v, name) => {
    if (v == null || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 100 || n > 1_000_000_00) throw new CartError(`${name} must be between $1 and $1,000,000`);
    return n;
  };
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new CartError('Rules must be an object');
  // A bad list is refused, never read as "no store rule" (that would allow every store).
  if (b.stores != null && !Array.isArray(b.stores)) throw new CartError('stores must be a list of store domains, like ["nike.com"]');
  const stores = [];
  for (const raw of b.stores || []) {
    const d = domainOf(String(raw));
    if (!d || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d) || d.split('.').some((p) => !p)) throw new CartError(`"${String(raw).slice(0, 60)}" isn’t a store domain, like nike.com`);
    if (!stores.includes(d)) stores.push(d);
  }
  if (stores.length > 50) throw new CartError('Up to 50 stores');
  const approver = b.approver == null ? 'never' : String(b.approver);
  if (!APPROVER.includes(approver)) throw new CartError(`approver must be one of ${APPROVER.join(', ')}`);
  const pay = b.pay == null ? 'link' : String(b.pay);
  if (!PAY.includes(pay)) throw new CartError(`pay must be one of ${PAY.join(', ')}`);
  const out = { max_order_cents: cents(b.max_order_cents, 'max_order_cents'), monthly_cents: cents(b.monthly_cents, 'monthly_cents'), stores, approver, pay };
  if (out.monthly_cents && out.max_order_cents && out.monthly_cents < out.max_order_cents) throw new CartError('The monthly limit can’t be lower than the per-order limit');
  if (pay === 'auto' && !out.max_order_cents) throw new CartError('Set a max per order before letting your AI pay on its own: it caps every card');
  const empty = !out.max_order_cents && !out.monthly_cents && !out.stores.length && out.approver === 'never' && pay === 'link';
  return empty ? null : out;
}

// "https://www.Nike.com/t/xyz" → "nike.com"; "nike.com" → "nike.com".
export function domainOf(s) {
  const raw = String(s || '').trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

const storeAllowed = (stores, url) => {
  const d = domainOf(url);
  return Boolean(d) && stores.some((s) => d === s || d.endsWith(`.${s}`));
};

export const monthStart = (now = new Date()) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

// → { ok: true } | { ok: true, route: true, reason } | { ok: false, reason }
export function checkRules(rules, { cents, storeUrl, spentThisMonth = 0, hasApprover = false }) {
  if (!rules) return { ok: true };
  let reason = null;
  let limit = false;
  if (rules.stores?.length && !storeAllowed(rules.stores, storeUrl)) reason = `This AI can only shop at ${rules.stores.join(', ')}`;
  else if (rules.max_order_cents && cents > rules.max_order_cents) {
    reason = `Over this AI's limit of $${(rules.max_order_cents / 100).toFixed(2)} per order`;
    limit = true;
  } else if (rules.monthly_cents && spentThisMonth + cents > rules.monthly_cents) {
    reason = `Over this AI's monthly limit of $${(rules.monthly_cents / 100).toFixed(2)} ($${(spentThisMonth / 100).toFixed(2)} used)`;
    limit = true;
  }
  if (rules.approver === 'always' && hasApprover) return { ok: true, route: true, reason: reason || 'This AI sends every order to an approver' };
  if (!reason) return { ok: true };
  if (limit && rules.approver === 'over_limit' && hasApprover) return { ok: true, route: true, reason };
  return { ok: false, reason };
}

// The account's approver, from settings state. Only confirmed ones count.
export function approverOf(db, userId) {
  if (!userId || !db?.state) return null;
  const a = db.state.get(`approver:${userId}`);
  return a?.confirmed_at ? { email: a.email, name: a.name } : null;
}
