// The engine's costs, checked against what factories actually quote. Each time a factory quotes a tech pack whose product was engineered in
// the Lab, the quote is kept beside the engine's estimate for that assembly at that moment (a sample). From the samples, for electronics and
// for other goods apart: how far the quotes run from the estimates, for the unit price, the tooling and the lead time.
//   sampleOf(E, quote)        → { kind, volume, qty, estUnit, quoteUnit, estTool, quoteTool, estWeeks, quoteWeeks } or null (no usable price)
//   factorsOf(samples, kind)  → { n, unit, tool, weeks } : each the median of quote ÷ estimate, pulled toward 1 while samples are few
//                               (weight n / (n + 3)) and kept between 0.4 and 2.5; 1 with no samples
//   calibrated(E, f)          → { unit, toolCost, weeks, n, factors } the engine's figures on the quotes' basis
// A factory's unit price is what it charges (its margin included); the engine's unit is what the product costs to make. The unit factor
// carries that gap too, which is what a buyer wants to know. Quotes in another currency than USD are kept but not counted.
const r2 = v => Math.round(v * 100) / 100, hund = v => Math.round(v / 100) * 100, clamp = v => Math.min(2.5, Math.max(.4, v));
// the quote's price at the tier nearest the volume the engine costed (by ratio: 4,000 is nearer 5,000 than 2,000 is)
export function sampleOf(E, q) {
  const tiers = (q?.tiers || []).map(t => ({ qty: Number(t.qty), unit: Number(t.unit) })).filter(t => t.qty > 0 && t.unit > 0), vol = Number(E?.spec?.volume) || 5000;
  if (!tiers.length || !(E?.unit > 0)) return null;
  const tier = tiers.reduce((a, b) => (Math.abs(Math.log(b.qty / vol)) < Math.abs(Math.log(a.qty / vol)) ? b : a));
  return { kind: E.spec.kind === 'electronics' ? 'electronics' : 'goods', volume: vol, qty: tier.qty, currency: String(q.currency || 'USD').toUpperCase(),
    estUnit: E.unit, quoteUnit: tier.unit, estTool: E.toolCost || 0, quoteTool: Number(q.tooling) > 0 ? Number(q.tooling) : null, estWeeks: E.weeks || 0, quoteWeeks: Number(q.lead_days ?? q.leadDays) > 0 ? r2(Number(q.lead_days ?? q.leadDays) / 7) : null };
}
const median = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const factor = ratios => { const r = ratios.filter(x => Number.isFinite(x) && x > 0); if (!r.length) return 1; const w = r.length / (r.length + 3); return r2(clamp(Math.exp(Math.log(median(r)) * w))); };
export function factorsOf(samples, kind) {
  const s = (samples || []).filter(x => x && x.kind === kind && x.currency === 'USD');
  return { n: s.length, unit: factor(s.map(x => x.quoteUnit / x.estUnit)), tool: factor(s.filter(x => x.quoteTool && x.estTool).map(x => x.quoteTool / x.estTool)), weeks: factor(s.filter(x => x.quoteWeeks && x.estWeeks).map(x => x.quoteWeeks / x.estWeeks)),
    nTool: s.filter(x => x.quoteTool && x.estTool).length, nWeeks: s.filter(x => x.quoteWeeks && x.estWeeks).length };
}
export function calibrated(E, f) {
  if (!f?.n) return null;
  return { unit: r2(E.unit * f.unit), toolCost: hund(E.toolCost * f.tool), weeks: Math.round(E.weeks * f.weeks), n: f.n, factors: { unit: f.unit, tool: f.tool, weeks: f.weeks }, nTool: f.nTool, nWeeks: f.nWeeks };
}
