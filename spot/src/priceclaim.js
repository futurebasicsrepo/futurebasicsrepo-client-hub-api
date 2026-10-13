// Asking a store for its lower price back, in one tap from the order page.
//
//   storeContact(storeUrl, policy)  where the store takes email: the address
//                                   its policy page gave (storefacts.js), else
//                                   one on its contact or policy page
//   claimMessage(cart, …)           the email to the store: the order, what was
//                                   paid, today's price, its own policy
//
// The email goes from Spot with the customer copied and as the reply-to, so
// the store's answer reaches them. When no address turns up, the customer
// gets the same words to send themselves.
import { assertPublicHost, readCapped } from './capture.js';
import { usd } from './cart.js';

const TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1_500_000;
const UA = 'Mozilla/5.0 (compatible; SpotBot/0.2; +https://spotmeplease.com/for-stores)';
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Addresses that aren't for customers, or aren't really addresses.
const NOT_FOR_US = /^(no-?reply|donotreply|privacy|legal|press|media|careers|jobs|wholesale|affiliates?|partners?|abuse|security|dmca|accessibility|investors?)@|\.(png|jpe?g|gif|webp|svg)$|@(sentry|example|domain|email)\./i;
const FOR_US = /^(support|help|service|customerservice|customer\.?service|customercare|care|hello|orders?|info|contact|team)@/i;

const rootOf = (host) => {
  const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.');
  return parts.slice(/^(co|com|org|net)$/.test(parts.at(-2) || '') && (parts.at(-1) || '').length === 2 ? -3 : -2).join('.');
};

// The best customer-service address in a page's text: on the store's own
// domain, a support-ish name first.
export function pickEmail(html, site) {
  const found = [...new Set((String(html).match(EMAIL) || []).map((e) => e.toLowerCase()))].filter((e) => !NOT_FOR_US.test(e));
  const own = found.filter((e) => rootOf(e.split('@')[1]) === site);
  return own.find((e) => FOR_US.test(e)) || own[0] || null;
}

async function page(u, { fetchImpl, allowPrivate }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = new URL(u);
    if (!allowPrivate) await assertPublicHost(url.hostname);
    const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html' } });
    if (!res.ok) return await res.body?.cancel?.().catch(() => {}), '';
    return await readCapped(res, MAX_HTML_BYTES);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// { email, contact_url }: where to send it, and the page a person would use.
export async function storeContact(storeUrl, policy = null, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
  let origin;
  try {
    origin = new URL(storeUrl).origin;
  } catch {
    return { email: null, contact_url: null };
  }
  const site = rootOf(new URL(origin).hostname);
  if (policy?.support_email && rootOf(policy.support_email.split('@')[1]) === site) return { email: policy.support_email, contact_url: `${origin}/pages/contact` };
  for (const path of [policy?.source_url, `${origin}/pages/contact`, `${origin}/pages/contact-us`, `${origin}/contact`, `${origin}/policies/refund-policy`]) {
    if (!path) continue;
    const email = pickEmail(await page(path, { fetchImpl, allowPrivate }), site);
    if (email) return { email, contact_url: path };
  }
  return { email: null, contact_url: `${origin}/pages/contact` };
}

// The email to the store, in the customer's name.
export function claimMessage(cart, { customerName = '', customerEmail = '' } = {}) {
  const pw = cart.price_watch;
  const store = cart.merchant?.name || 'your store';
  const order = cart.fulfillment?.order_number ? String(cart.fulfillment.order_number).replace(/^#?/, '#') : null;
  const bought = new Date(cart.fulfillment?.placed_at || cart.spent_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const lines = pw.drop.items.map((d) => {
    const it = cart.items?.[d.i] || {};
    return `- ${d.title}${d.variant ? ` (${d.variant})` : ''}${d.quantity > 1 ? ` × ${d.quantity}` : ''}: paid ${usd(d.paid_cents)}, now ${usd(d.now_cents)}${it.url ? ` (${it.url})` : ''}`;
  });
  const name = String(customerName || '').trim() || 'the customer';
  const subject = `Price adjustment request${order ? ` for order ${order}` : ''}`;
  const text = [
    `Hello ${store},`,
    '',
    `I bought the following on ${bought}${order ? ` (order ${order}${customerEmail ? `, under ${customerEmail}` : ''})` : customerEmail ? ` under ${customerEmail}` : ''}, and the price has since dropped:`,
    ...lines,
    '',
    `Under your price adjustment policy${pw.policy?.source_url ? ` (${pw.policy.source_url})` : ''}, could you please refund the difference of ${usd(pw.drop.cents)} to the original payment method?`,
    '',
    'Thank you,',
    name,
    '',
    `Sent for ${name} by Spot (spotmeplease.com). Replies go to ${customerEmail ? customerEmail : 'them'} directly.`,
  ].join('\n');
  return { subject, text };
}
