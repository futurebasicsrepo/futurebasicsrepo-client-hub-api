// Spending rules for an account's AI keys, and the account's approver.
//
// Each AI key an account connects can carry rules:
//   max_order_cents  no single ask over this
//   monthly_cents    this key's asks this month add up to no more than this
//   stores           only these stores (domains; "nike.com" also allows www.nike.com)
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

export function normalizeRules(b = {}) {
  const cents = (v, name) => {
    if (v == null || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 100 || n > 1_000_000_00) throw new CartError(`${name} must be between $1 and $1,000,000`);
    return n;
  };
  const stores = Array.isArray(b.stores)
    ? [...new Set(b.stores.map((s) => domainOf(String(s))).filter(Boolean))].slice(0, 50)
    : [];
  const approver = b.approver == null ? 'never' : String(b.approver);
  if (!APPROVER.includes(approver)) throw new CartError(`approver must be one of ${APPROVER.join(', ')}`);
  const out = { max_order_cents: cents(b.max_order_cents, 'max_order_cents'), monthly_cents: cents(b.monthly_cents, 'monthly_cents'), stores, approver };
  const empty = !out.max_order_cents && !out.monthly_cents && !out.stores.length && out.approver === 'never';
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
