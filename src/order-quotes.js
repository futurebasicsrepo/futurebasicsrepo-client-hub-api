// Quotes across several products (an order: "50 olive hats, 100 multitools, 100 long sleeves in these sizes"): built by staff from the products
// in a client's room, sent to the client, tracked as a deal in Sales, and turned into a payment link when the client accepts. Plain functions;
// the routes are in src/order-quote-routes.js.

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const cents = v => { if (v === null || v === undefined || v === '') return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : null; };

// "10 S, 30 M, 30 L, 20 XL" or "S:10 M:30" → { S: 10, M: 30, ... } (the order sizes appear in is kept)
export function parseSizes(text) {
  const out = {}, s = String(text || ''), norm = k => k.toUpperCase().replace(/^XXXL$/, '3XL').replace(/^XXL$/, '2XL');
  // "S:10 M=30" first (a colon or equals sign says which way round it is), else "10 S, 30 M"
  if (/[:=]/.test(s)) for (const m of s.matchAll(/\b(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|5XL|OS)\s*[:=]\s*(\d+)/gi)) out[norm(m[1])] = (out[norm(m[1])] || 0) + Number(m[2]);
  if (!Object.keys(out).length) for (const m of s.matchAll(/(\d+)\s*(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|5XL|OS)\b/gi)) out[norm(m[2])] = (out[norm(m[2])] || 0) + Number(m[1]);
  return out;
}
export const sizesTotal = sizes => Object.values(sizes || {}).reduce((a, n) => a + (Number(n) || 0), 0);
// sizes in the order people read them (the database keeps them in its own order)
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OS'];
export const sizeRank = k => { const i = SIZE_ORDER.indexOf(String(k).toUpperCase()); return i < 0 ? 99 : i; };
export const sizesWords = sizes => Object.entries(sizes || {}).filter(([, n]) => Number(n) > 0).sort((a, b) => sizeRank(a[0]) - sizeRank(b[0])).map(([k, n]) => `${n} ${k}`).join(', ');

// The tier a quantity falls in (the highest minimum at or under it; below every minimum, the smallest tier with a warning)
export function tierFor(tiers, qty) {
  const list = [...(tiers || [])].sort((a, b) => (a.min_quantity ?? a.minQuantity) - (b.min_quantity ?? b.minQuantity)); if (!list.length) return null;
  const q = Number(qty) || 0, fit = list.filter(t => (t.min_quantity ?? t.minQuantity) <= q && (!(t.max_quantity ?? t.maxQuantity) || q <= (t.max_quantity ?? t.maxQuantity))).pop();
  return fit ? { tier: fit, belowMin: false } : { tier: list[0], belowMin: q < (list[0].min_quantity ?? list[0].minQuantity) };
}

// Which of the room's products a request names, and how many: "Olive hat (50)", "Multitool (100)", "Yosemite Long Sleeve — Natural (100)"
const STOP = new Set(['the', 'and', 'with', 'for', 'our', 'ouster', 'pack', 'tee', 'shirt']);
// words clients use for what we call something else
const SAME = { hat: 'cap', hats: 'cap', caps: 'cap', olive: 'green', natural: 'bone', tees: 'tee', bottles: 'bottle', stickers: 'sticker', pens: 'pen', pencils: 'pencil' };
const words = s => String(s || '').toLowerCase().replace(/[“”"']/g, '').split(/[^a-z0-9]+/).map(w => SAME[w] || w).filter(w => w.length > 2 && !STOP.has(w));
export function matchRequest(text, products) {
  const lines = String(text || '').split(/\n|(?<=\))\s*[-•,;]\s*|\s+-\s+/).map(clean).filter(Boolean), picks = [];
  for (const line of lines) {
    const lw = new Set(words(line)), lineSizes = parseSizes(line);
    // a part that only lists sizes ("and we want 10 S, 30 M…") belongs to the product just before it
    if (Object.keys(lineSizes).length && picks.length && !products.some(p => words(p.title).some(w => lw.has(w)))) { const last = picks[picks.length - 1]; if (!last.sizes) { last.sizes = lineSizes; last.quantity = last.quantity || sizesTotal(lineSizes); } continue; }
    if (!lw.size) continue;
    let best = null;
    for (const p of products) { const pw = words(p.title); const hit = pw.filter(w => lw.has(w)).length; const score = pw.length ? hit / pw.length + hit * 0.1 : 0; if (hit && (!best || score > best.score)) best = { p, score }; }
    if (!best || best.score < 0.5 || picks.some(x => x.productId === best.p.id)) continue;
    const qty = Number((line.match(/\((\d[\d,]*)\)/) || line.match(/\b(\d[\d,]*)\s*(?:pcs|pieces|units|x)\b/i) || line.match(/^(\d[\d,]*)\s/) || [])[1]?.replace(/,/g, '')) || null;
    const sizes = parseSizes(line);
    picks.push({ productId: best.p.id, quantity: qty || (sizesTotal(sizes) || null), sizes: Object.keys(sizes).length ? sizes : null, from: line.slice(0, 160) });
  }
  return picks;
}

// Clean a quote from staff: each line a product in the room, a quantity, a unit price; extras (setup, freight) as labelled amounts.
export function cleanQuote(input = {}, products = []) {
  const byId = new Map(products.map(p => [p.id, p])), lines = [], errors = [];
  for (const l of Array.isArray(input.lines) ? input.lines : []) {
    const p = byId.get(l.productId); if (!p) { errors.push('A line names a product that is not in this room'); continue; }
    const sizes = l.sizes && typeof l.sizes === 'object' ? Object.fromEntries(Object.entries(l.sizes).map(([k, n]) => [clean(k).toUpperCase().slice(0, 8), Math.max(0, Math.round(Number(n) || 0))]).filter(([k, n]) => k && n > 0)) : {};
    const quantity = Math.round(Number(l.quantity) || sizesTotal(sizes)); const unit = cents(l.unitCents);
    if (!(quantity > 0)) { errors.push(`${p.title}: a quantity is needed`); continue; }
    if (unit == null) { errors.push(`${p.title}: a unit price is needed`); continue; }
    if (Object.keys(sizes).length && sizesTotal(sizes) !== quantity) errors.push(`${p.title}: the sizes add up to ${sizesTotal(sizes)}, not ${quantity}`);
    lines.push({ productId: p.id, title: clean(l.title) || p.title, quantity, sizes, unitCents: unit, totalCents: unit * quantity, unitCostCents: cents(l.unitCostCents), tierId: l.tierId || null, note: clean(l.note).slice(0, 300) });
  }
  const extras = (Array.isArray(input.extras) ? input.extras : []).map(x => ({ label: clean(x.label).slice(0, 80), cents: cents(x.cents) })).filter(x => x.label && x.cents > 0);
  if (!lines.length && !errors.length) errors.push('Pick at least one product');
  const subtotal = lines.reduce((a, l) => a + l.totalCents, 0), extrasCents = extras.reduce((a, x) => a + x.cents, 0);
  const cost = lines.every(l => l.unitCostCents != null) ? lines.reduce((a, l) => a + l.unitCostCents * l.quantity, 0) : null;
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(input.validUntil || '')) ? input.validUntil : null;
  return errors.length ? { error: errors[0], errors } : { value: { lines, extras, subtotalCents: subtotal, totalCents: subtotal + extrasCents, costCents: cost, marginPct: cost != null && subtotal ? Math.round((subtotal - cost) / subtotal * 1000) / 10 : null, notes: clean(input.notes).slice(0, 2000), validUntil } };
}

// The client's view of a quote: no costs, no margins
export const clientQuote = q => ({ id: q.id, number: q.number, status: q.status, title: q.title || '', lines: (q.lines || []).map(l => ({ title: l.title, quantity: l.quantity, sizes: l.sizes || {}, unitCents: l.unitCents, totalCents: l.totalCents, note: l.note || '' })),
  extras: q.extras || [], totalCents: Number(q.total_cents), currency: q.currency || 'USD', notes: q.notes || '', validUntil: q.valid_until instanceof Date ? q.valid_until.toISOString().slice(0, 10) : q.valid_until || null, sentAt: q.sent_at, acceptedAt: q.accepted_at, reply: q.reply || '', payUrl: q.status === 'accepted' ? q.pay_url || '' : '' });

export const quoteNumber = (n, year = new Date().getUTCFullYear()) => `Q-${year}-${String(n).padStart(4, '0')}`;
