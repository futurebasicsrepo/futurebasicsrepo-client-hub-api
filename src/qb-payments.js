// QuickBooks Payments: keep a client's card or bank account on file and charge it. This is the only file that knows Intuit's payments API, so moving to another
// processor later means writing the same few functions for it (see the `processor` shape at the bottom) and nothing else changes.
//
//   * The card or bank number is typed on OUR page but goes straight from the browser to Intuit, which hands back a one-time token. The number never reaches this
//     server, a log or the database. The server only ever holds the token, then the id of the card or account saved on file at Intuit.
//   * Every call carries a Request-Id, so asking twice for the same charge can never take the money twice.
//   * Needs the QuickBooks connection to have been made with the payments permission (QUICKBOOKS_PAYMENTS=on, then connect again) and a QuickBooks Payments account.
import { randomUUID } from 'node:crypto';
import { authed } from './quickbooks.js';

export const PATH = { tokens: '/quickbooks/v4/payments/tokens', charges: '/quickbooks/v4/payments/charges', echecks: '/quickbooks/v4/payments/echecks' };
export const tokensUrl = cfg => `${cfg.paymentsOrigin}${PATH.tokens}`;
const usd = cents => (Math.round(Number(cents)) / 100).toFixed(2);

// ---- checks made in the browser before anything is sent (and again here on what comes back) ----
export const luhn = num => { const d = String(num).replace(/\D/g, ''); if (d.length < 12 || d.length > 19) return false; let sum = 0; for (let i = 0; i < d.length; i++) { let n = Number(d[d.length - 1 - i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; } return sum % 10 === 0; };
export const abaOk = r => { const d = String(r).replace(/\D/g, ''); if (d.length !== 9) return false; const n = [...d].map(Number); return (3 * (n[0] + n[3] + n[6]) + 7 * (n[1] + n[4] + n[7]) + (n[2] + n[5] + n[8])) % 10 === 0; };

// ---- what Intuit sends back, in one plain shape ----
const failure = (res, j, fallback) => {
  const e = j?.errors?.[0] || {}, detail = String(e.detail || e.message || fallback || `answered ${res.status}`).slice(0, 240);
  return Object.assign(new Error(`QuickBooks Payments: ${detail}`), { status: res.status, code: e.code || '', refused: res.status === 401 || res.status === 403, tid: res.headers?.get?.('intuit_tid') || '' });
};
async function call(ctx, cfg, path, { method = 'GET', body, requestId } = {}) {
  const res = await authed(ctx, `${cfg.paymentsOrigin}${path}`, { method, headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'Request-Id': requestId || randomUUID() }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    ctx.log?.warn?.({ quickbooks: true, payments: true, status: res.status, intuit_tid: res.headers?.get?.('intuit_tid') || '', code: j?.errors?.[0]?.code, method, path: path.replace(/\/[0-9A-Za-z-]{8,}/g, '/{id}') }, 'QuickBooks Payments call failed');
    throw failure(res, j);
  }
  return j;
}

// A card or bank account saved on file for one QuickBooks customer, from the one-time token the browser got. → { id, kind, last4, label, exp }
export async function saveInstrument(ctx, { customerId, kind, token, requestId }) {
  if (!token) throw new Error('The payment details did not arrive. Try again.');
  const isCard = kind === 'card', seg = isCard ? 'cards' : 'bank-accounts';
  const j = await call(ctx, ctx.cfg, `/quickbooks/v4/customers/${encodeURIComponent(customerId)}/${seg}/createFromToken`, { method: 'POST', body: { value: token }, requestId });
  if (!j.id) throw new Error('QuickBooks Payments did not save the details');
  const last4 = String(isCard ? j.number : j.accountNumber || '').replace(/\D/g, '').slice(-4);
  if (isCard) { const brand = String(j.cardType || 'Card'); return { id: String(j.id), kind, last4, brand, exp: j.expMonth && j.expYear ? `${String(j.expMonth).padStart(2, '0')}/${String(j.expYear).slice(-2)}` : '', label: `${brand} ending ${last4}` }; }
  const type = /SAVINGS/i.test(j.accountType || '') ? 'Savings' : 'Checking';
  return { id: String(j.id), kind, last4, brand: type, exp: '', label: `${type} account ending ${last4}` };
}
export async function removeInstrument(ctx, { customerId, kind, id }) {
  try { await call(ctx, ctx.cfg, `/quickbooks/v4/customers/${encodeURIComponent(customerId)}/${kind === 'card' ? 'cards' : 'bank-accounts'}/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; } catch (e) { if (e.status === 404) return true; throw e; }
}

// Take one payment. The Request-Id is ours and stays the same for the same attempt, so a repeat is answered with the first result, never charged again.
// → { id, status: 'succeeded' | 'pending' | 'declined', reason }. A card is answered at once; a bank debit is pending until the bank settles it (a few days).
export async function charge(ctx, { kind, instrumentId, amountCents, currency = 'USD', requestId, description = '' }) {
  const desc = String(description).slice(0, 100);
  if (kind === 'card') {
    const j = await call(ctx, ctx.cfg, PATH.charges, { method: 'POST', requestId, body: { amount: usd(amountCents), currency, cardOnFile: instrumentId, capture: true, description: desc, context: { mobile: false, isEcommerce: true } } });
    const st = String(j.status || '').toUpperCase();
    if (st === 'CAPTURED' || st === 'SETTLED') return { id: String(j.id), status: 'succeeded', reason: '' };
    return { id: String(j.id || ''), status: 'declined', reason: String(j.errors?.[0]?.message || j.declineReason || `The card was not accepted (${st.toLowerCase() || 'declined'})`).slice(0, 240) };
  }
  const j = await call(ctx, ctx.cfg, PATH.echecks, { method: 'POST', requestId, body: { bankAccountOnFile: instrumentId, amount: usd(amountCents), paymentMode: 'WEB', description: desc } });
  return echeckState(j);
}
const echeckState = j => {
  const st = String(j.status || '').toUpperCase();
  if (st === 'SUCCEEDED' || st === 'SETTLED') return { id: String(j.id), status: 'succeeded', reason: '' };
  if (st === 'PENDING' || st === 'ISSUED') return { id: String(j.id), status: 'pending', reason: '' };
  return { id: String(j.id || ''), status: 'declined', reason: String(j.errors?.[0]?.message || j.declineReason || `The bank did not accept the debit (${st.toLowerCase() || 'declined'})`).slice(0, 240) };
};
// Where a pending bank debit stands now (card payments are never pending).
export async function status(ctx, { kind, chargeId }) {
  if (kind === 'card') { const j = await call(ctx, ctx.cfg, `${PATH.charges}/${encodeURIComponent(chargeId)}`); return String(j.status || '').toUpperCase() === 'CAPTURED' ? { id: chargeId, status: 'succeeded', reason: '' } : { id: chargeId, status: 'declined', reason: 'The card was not accepted' }; }
  return echeckState(await call(ctx, ctx.cfg, `${PATH.echecks}/${encodeURIComponent(chargeId)}`));
}

// The processor the autopay rules talk to (autopay.js knows only this shape).
export const processor = { name: 'quickbooks', saveInstrument, removeInstrument, charge, status };
