// Quotations from factories, through a private link and no account. The rules live here so the form, the server and the comparison agree.
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const CURRENCIES = ['USD', 'CNY', 'HKD', 'EUR'];
export const INCOTERMS = ['EXW', 'FOB', 'FCA', 'CIF', 'DAP', 'DDP'];
// Rough rates to USD, only to rank quotes quoted in different currencies. They are shown as approximate and can be set with FX_<CODE>_USD.
export const fxToUsd = (code, env = process.env) => ({ USD: 1, CNY: Number(env.FX_CNY_USD) || 0.14, HKD: Number(env.FX_HKD_USD) || 0.128, EUR: Number(env.FX_EUR_USD) || 1.08 }[code] || 1);

const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : NaN; };
const int = v => { const n = num(v); return n == null ? null : Number.isFinite(n) ? Math.round(n) : NaN; };

// → { q } with clean values, or { error } with a sentence the factory can act on.
export function cleanQuote(b = {}, { requireContact = true } = {}) {
  const currency = CURRENCIES.includes(String(b.currency).toUpperCase()) ? String(b.currency).toUpperCase() : 'USD';
  const tiers = [];
  for (const t of Array.isArray(b.tiers) ? b.tiers.slice(0, 5) : []) {
    const qty = int(t?.qty), unit = num(t?.unit);
    if ((t?.qty === '' || t?.qty == null) && (t?.unit === '' || t?.unit == null)) continue;
    if (!Number.isFinite(qty) || qty < 1) return { error: 'Each price row needs a quantity of 1 or more' };
    if (!Number.isFinite(unit) || unit <= 0 || unit > 1e6) return { error: 'Each price row needs a unit price above zero' };
    tiers.push({ qty, unit: Math.round(unit * 10000) / 10000 });
  }
  if (!tiers.length) return { error: 'Add at least one price: a quantity and what one unit costs' };
  tiers.sort((a, b) => a.qty - b.qty);
  for (let i = 1; i < tiers.length; i++) if (tiers[i].qty === tiers[i - 1].qty) return { error: 'Two price rows have the same quantity' };
  const moq = int(b.moq), sampleDays = int(b.sampleDays), leadDays = int(b.leadDays), sampleCost = num(b.sampleCost), tooling = num(b.tooling);
  for (const [v, lab] of [[moq, 'minimum order'], [sampleDays, 'sample time'], [leadDays, 'production time']]) if (Number.isNaN(v) || (v != null && (v < 0 || v > 100000))) return { error: `Check the ${lab}: it should be a whole number` };
  for (const [v, lab] of [[sampleCost, 'sample cost'], [tooling, 'tooling cost']]) if (Number.isNaN(v) || (v != null && (v < 0 || v > 1e8))) return { error: `Check the ${lab}: it should be a number` };
  const email = clip(b.email, 200).toLowerCase() || null, wechat = clip(b.wechat, 80) || null, phone = clip(b.phone, 60) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Check the email address' };
  if (requireContact && !email && !wechat && !phone) return { error: 'Leave a way to reach you: email, WeChat or phone' };
  const incoterm = clip(b.incoterm, 12).toUpperCase() || null;
  let validUntil = clip(b.validUntil, 10) || null; if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) validUntil = null;
  return { q: { company: clip(b.company, 160) || null, contactName: clip(b.contactName, 140) || null, email, wechat, phone, currency, tiers, moq, sampleCost, sampleDays, leadDays, tooling,
    incoterm: incoterm && (INCOTERMS.includes(incoterm) || incoterm.length <= 12) ? incoterm : null, paymentTerms: clip(b.paymentTerms, 200) || null, validUntil, notes: clip(b.notes, 1500) || null } };
}

// The unit price a quote gives at a quantity: the tier at or below it. Below the smallest tier it gives that tier's price and says the quantity is under what they priced.
export function unitAt(q, qty) {
  const tiers = [...(q.tiers || [])].sort((a, b) => a.qty - b.qty); if (!tiers.length) return null;
  let pick = null; for (const t of tiers) if (t.qty <= qty) pick = t;
  const under = !pick, t = pick || tiers[0];
  return { unit: t.unit, tierQty: t.qty, under: under || (q.moq != null && qty < q.moq) };
}

// Quotes side by side at one quantity, cheapest first (by the approximate US dollar price); the sample and tooling are shown, not hidden in the unit.
export function compareQuotes(quotes, qty, env = process.env) {
  const rows = (quotes || []).map(q => {
    const at = unitAt(q, qty); if (!at) return null;
    const rate = fxToUsd(q.currency, env);
    return { ...q, atUnit: at.unit, atTier: at.tierQty, under: at.under, unitUsd: Math.round(at.unit * rate * 10000) / 10000, total: Math.round((at.unit * qty + (q.tooling || 0)) * 100) / 100 };
  }).filter(Boolean);
  rows.sort((a, b) => a.unitUsd - b.unitUsd);
  if (rows.length) rows[0].lowest = true;
  return rows;
}
// The quantity to compare at when staff have not picked one: the smallest quantity every quote gives a price for.
export const defaultCompareQty = quotes => { const first = (quotes || []).map(q => Math.min(...(q.tiers || []).map(t => t.qty))).filter(Number.isFinite); return first.length ? Math.max(...first) : 500; };
