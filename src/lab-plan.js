// Design Lab L2: the trend read and the line plan. Pure functions plus the one AI call that proposes an assortment; no web server, no database.
//
// The trend read is arithmetic over the library (prices, how much of each category is selling, the colours, fabrics, shapes and details that keep showing up),
// so it costs nothing and can be checked. The price ladder is held to the price anchor (Zara): where the Lab has read Zara's pieces the ladder is Zara's own
// prices; where it has not, it is an estimate from the reference brands and says so. The line plan is an assortment of pieces with a role, a price, an
// estimated landed cost and a quantity, held against the brand code's economics. Landed cost here is a ratio of the shelf price until a concept becomes a real
// tech pack, where the bill of materials gives the true number.
import { CATEGORIES, CATEGORY_IDS, cleanCategory, categoryLabel, brandCodeWords, DEFAULT_BRAND_CODE, cleanEconomics } from './lab.js';
import { ask as realAsk, providerReady, costCents } from './intel-llm.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const REF_TO_ANCHOR = 0.4; // with no anchor prices read yet, a reference brand's price is scaled by this to estimate the Zara line
export const WOMENSWEAR_ONLY = ['dresses']; // left out of a plan unless it is asked for by name: Future Basics is male-driven and unisex
export const HOT = 30;            // heat at or above this counts as "moving"

// ---- the trend read ---------------------------------------------------------------------------------------------------------------------------
export const quantile = (sorted, q) => { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
const stats = prices => { const s = prices.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? { n: s.length, p25: quantile(s, .25), median: quantile(s, .5), p75: quantile(s, .75), min: s[0], max: s[s.length - 1] } : null; };
const tally = (lists, n = 5) => {
  const m = new Map();
  for (const l of lists) for (const raw of Array.isArray(l) ? l : [l]) { const k = clip(raw, 60).toLowerCase(); if (!k) continue; const e = m.get(k) || { name: clip(raw, 60), n: 0 }; e.n++; m.set(k, e); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, n);
};
// Round a price to something a shelf would carry.
export const nice = p => { const x = Number(p); if (!Number.isFinite(x) || x <= 0) return null; return Math.max(8, x < 40 ? Math.round(x / 2) * 2 : x < 100 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10); };

// rows: { id, title, category, price (dollars or null), heat, firstSeenAt, attrs, brand, role }. → what the library says about each category.
export function trendRead(rows, { now = new Date() } = {}) {
  const by = new Map(CATEGORY_IDS.map(id => [id, []]));
  for (const r of rows) (by.get(r.category) || by.get('other')).push(r);
  const month = 30 * 86_400_000;
  const categories = CATEGORIES.map(c => {
    const rs = by.get(c.id);
    if (!rs.length) return { id: c.id, label: c.label, count: 0 };
    const refs = rs.filter(r => r.role !== 'price' && r.role !== 'cuts'), anchor = rs.filter(r => r.role === 'price');
    const hot = rs.filter(r => (r.heat ?? -1) >= HOT), fresh = rs.filter(r => now - new Date(r.firstSeenAt) < month);
    const attrs = rs.map(r => r.attrs || {});
    const movers = [...rs].filter(r => r.heat != null).sort((a, b) => b.heat - a.heat).slice(0, 4).map(r => ({ id: r.id, title: r.title, brand: r.brand || '', price: r.price, heat: r.heat }));
    const out = { id: c.id, label: c.label, count: rs.length, brands: tally(rs.map(r => r.brand), 4), reference: stats(refs.map(r => r.price)), anchor: stats(anchor.map(r => r.price)),
      withHeat: rs.filter(r => r.heat != null).length, hotCount: hot.length, hotShare: rs.filter(r => r.heat != null).length ? Math.round((hot.length / rs.filter(r => r.heat != null).length) * 100) / 100 : null,
      newShare: Math.round((fresh.length / rs.length) * 100) / 100, colors: tally(attrs.map(a => a.colors)), fabrics: tally(attrs.map(a => a.fabric)), silhouettes: tally(attrs.map(a => a.silhouette)), details: tally(attrs.map(a => a.details), 6), graphics: tally(attrs.map(a => a.graphics), 6), movers };
    out.ladder = priceLadder(out);
    return out;
  });
  const filled = categories.filter(c => c.count);
  return { total: rows.length, categories, movers: filled.flatMap(c => c.movers.map(m => ({ ...m, category: c.id }))).sort((a, b) => b.heat - a.heat).slice(0, 8),
    colors: tally(rows.map(r => (r.attrs || {}).colors), 8), fabrics: tally(rows.map(r => (r.attrs || {}).fabric), 8), silhouettes: tally(rows.map(r => (r.attrs || {}).silhouette), 8) };
}

// The price points our pieces in a category are held to: entry, core and the cap (nothing above it). From the price anchor's own prices when the Lab has read
// enough of them; otherwise estimated from the reference brands and marked as such.
export function priceLadder(cat) {
  const a = cat.anchor, r = cat.reference;
  if (a && a.n >= 3) return { basis: 'anchor', entry: nice(a.p25), core: nice(a.median), cap: nice(a.p75), n: a.n };
  if (r && r.n >= 3) return { basis: 'estimated', entry: nice(r.p25 * REF_TO_ANCHOR), core: nice(r.median * REF_TO_ANCHOR), cap: nice(r.p75 * REF_TO_ANCHOR), n: r.n };
  return null;
}

// ---- the plan ---------------------------------------------------------------------------------------------------------------------------------
export const ROLES = [
  { id: 'core', label: 'Core', hint: 'Evergreen pieces that sell every season' },
  { id: 'trend', label: 'Trend', hint: 'Shapes and details the market is moving on now' },
  { id: 'hero', label: 'Hero', hint: 'A statement piece that carries the season' },
  { id: 'entry', label: 'Entry', hint: 'The lowest price point, to bring people in' }
];
export const ROLE_IDS = ROLES.map(r => r.id);
export const LINE_STATUSES = ['planned', 'dropped', 'in_concept', 'approved', 'tech_pack'];
export const START_QTY = { core: 500, trend: 300, hero: 150, entry: 500 }; // starting quantities, near a factory's usual minimum: change them
export function roleMix(size) {
  const n = Math.max(1, Math.round(size)), hero = Math.max(1, Math.round(n * .15)), trend = Math.round(n * .3), entry = Math.round(n * .15);
  return { core: Math.max(0, n - hero - trend - entry), trend, hero, entry };
}
export const marginOf = (priceCents, costCents) => priceCents > 0 && costCents != null ? Math.round((1 - costCents / priceCents) * 1000) / 10 : null;
export const defaultCost = (priceCents, ratio) => (priceCents > 0 ? Math.round(priceCents * ratio) : null);

const cents = v => { if (v === null || v === '' || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 100_000 ? Math.round(n * 100) : undefined; };
const qtyOf = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : undefined; };
// Clean one line typed by a person. `price` and `cost` are in dollars. Only the fields sent are changed when `base` is given.
export function cleanLine(input, base = null) {
  const b = input && typeof input === 'object' ? input : {}, out = base ? { ...base } : { category: 'other', role: 'core', name: '', brief: '', twist: '', rationale: '', priceCents: null, costCents: null, qty: 0, refs: [], status: 'planned' };
  if (b.category !== undefined) { const c = cleanCategory(b.category); if (!c) return { error: `Category must be one of ${CATEGORY_IDS.join(', ')}` }; out.category = c; }
  if (b.role !== undefined) { if (!ROLE_IDS.includes(b.role)) return { error: 'Role must be core, trend, hero or entry' }; out.role = b.role; }
  if (b.name !== undefined) out.name = clip(b.name, 100);
  for (const k of ['brief', 'twist', 'rationale']) if (b[k] !== undefined) out[k] = clip(b[k], k === 'rationale' ? 500 : 400);
  if (b.price !== undefined) { const c = cents(b.price); if (c === undefined) return { error: 'That price does not look right' }; out.priceCents = c; }
  if (b.cost !== undefined) { const c = cents(b.cost); if (c === undefined) return { error: 'That cost does not look right' }; out.costCents = c; }
  if (b.qty !== undefined) { const q = qtyOf(b.qty); if (q === undefined) return { error: 'The quantity must be a whole number' }; out.qty = q; }
  if (b.status !== undefined) { if (!LINE_STATUSES.includes(b.status)) return { error: 'Unknown status' }; out.status = b.status; }
  if (!out.name) return { error: 'Give the piece a name' };
  return out;
}

// What is wrong with one line, in words: above the price anchor's line, thin margin, no price.
export function lineWarnings(line, ladder, econ = DEFAULT_BRAND_CODE.economics, anchorName = 'Zara') {
  const w = [];
  if (line.status === 'dropped') return w;
  if (!(line.priceCents > 0)) w.push({ kind: 'price', text: 'No price yet' });
  else {
    if (ladder?.cap && line.priceCents > ladder.cap * 100) w.push({ kind: 'above', text: `Above the ${ladder.basis === 'anchor' ? anchorName : 'estimated ' + anchorName} line for ${categoryLabel(line.category).toLowerCase()} ($${ladder.cap})` });
    const m = marginOf(line.priceCents, line.costCents ?? defaultCost(line.priceCents, econ.costRatio));
    if (m != null && m < econ.minMarginPct) w.push({ kind: 'margin', text: `Margin ${m}% is under the ${econ.minMarginPct}% floor` });
  }
  return w;
}

// The plan as a whole: counts, prices, margin, money, and what is missing or lopsided.
export function planSummary(lines, ladders = {}, econ = DEFAULT_BRAND_CODE.economics, anchorName = 'Zara') {
  const live = lines.filter(l => l.status !== 'dropped'), byCategory = {}, byRole = {};
  let units = 0, revenue = 0, cost = 0, priced = 0, marginSum = 0, marginN = 0, warnings = 0;
  const prices = [];
  for (const l of live) {
    byCategory[l.category] = (byCategory[l.category] || 0) + 1; byRole[l.role] = (byRole[l.role] || 0) + 1;
    const c = l.costCents ?? defaultCost(l.priceCents, econ.costRatio);
    if (l.priceCents > 0) { priced++; prices.push(l.priceCents / 100); units += l.qty; revenue += l.priceCents * l.qty; if (c != null) { cost += c * l.qty; const m = marginOf(l.priceCents, c); if (m != null) { marginSum += m; marginN++; } } }
    warnings += lineWarnings(l, ladders[l.category], econ, anchorName).length;
  }
  const notes = [];
  if (live.length >= 6) { const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]; if (top && top[1] / live.length > 0.4) notes.push(`${Math.round((top[1] / live.length) * 100)}% of the plan is ${categoryLabel(top[0]).toLowerCase()}: the line leans one way`); }
  if (live.length >= 4 && !byRole.hero) notes.push('No hero piece');
  if (live.length >= 4 && !byRole.core) notes.push('No core pieces: nothing evergreen');
  if (live.length >= 4 && !byRole.entry) notes.push('No entry price point');
  if (live.some(l => l.qty === 0)) notes.push('Some pieces have no quantity yet, so the totals leave them out');
  prices.sort((a, b) => a - b);
  return { count: live.length, dropped: lines.length - live.length, byCategory, byRole, units, revenueCents: revenue, costCents: Math.round(cost), grossCents: Math.round(revenue - cost), blendedMarginPct: revenue ? Math.round((1 - cost / revenue) * 1000) / 10 : null,
    avgMarginPct: marginN ? Math.round((marginSum / marginN) * 10) / 10 : null, priceMin: prices[0] ?? null, priceMax: prices[prices.length - 1] ?? null, priceMedian: quantile(prices, .5), unpriced: live.length - priced, lineWarnings: warnings, notes };
}

// ---- asking for an assortment -----------------------------------------------------------------------------------------------------------------
// The test stand-in: a plan built from the trend digest in the prompt, so journeys are predictable.
export function planFixture({ user }) {
  let digest = {}; try { digest = JSON.parse(/<digest>([\s\S]*?)<\/digest>/.exec(user)?.[1] || '{}'); } catch { /* an empty digest gives an empty plan */ }
  const want = digest.mix || { core: 2, trend: 1, hero: 1, entry: 1 }, cats = (digest.categories || []).filter(c => c.count).map(c => c.id), pool = cats.length ? cats : ['tops', 'outerwear'];
  const lines = []; let i = 0;
  for (const role of ['core', 'trend', 'hero', 'entry']) for (let k = 0; k < (want[role] || 0); k++, i++) {
    const cat = pool[i % pool.length], c = (digest.categories || []).find(x => x.id === cat) || {};
    lines.push({ category: cat, role, name: `${role[0].toUpperCase()}${role.slice(1)} ${categoryLabel(cat).toLowerCase()} ${k + 1}`, brief: `A ${(c.silhouettes || [])[0] || 'relaxed'} ${categoryLabel(cat).toLowerCase()} in ${(c.fabrics || [])[0] || 'cotton'}`, twist: 'Our own small detail at the hem, no logo from anywhere else', rationale: `The library shows ${c.count || 0} pieces here`, price: role === 'hero' ? ((c.ladder || {}).cap || 60) * 1.5 : (c.ladder || {}).core || 45, refs: (c.movers || []).slice(0, 2).map(m => m.ref) });
  }
  return { summary: `A ${want.core + want.trend + want.hero + want.entry}-piece plan from the library (stand-in).`, lines };
}

export function generateSystem(code) {
  return `You are the head of product for Future Basics, building a season's line plan. Future Basics sells affordable, considered clothing, headwear, footwear and accessories: the cuts and attitude of luxury and heritage brands at a price held to a fast-fashion anchor, in simpler materials.\n${brandCodeWords(code)}\nRules: the line is male-driven and unisex: design for men first (men's sizing, proportions and fits) in pieces anyone can wear, and plan no womenswear-only pieces such as dresses or skirts. Every piece is OUR design. Describe a shape, fabric and detail in plain words; never name a brand's product, copy a logo, print or distinctive artwork, and make the "twist" a specific idea that is ours, not a reference to someone else's. Stay at or under each category's price cap. Prefer shapes the market is moving on and details that keep appearing, in materials simpler than the references. Be concrete and brief.`;
}
// → { summary, lines: [...clean lines, ready to save], costCents }. `trends` is a trendRead result.
export async function generateLines({ trends, code = DEFAULT_BRAND_CODE, brief = '', season = '', size = 12, categories = [], askImpl = realAsk, env = process.env, fetchImpl = fetch } = {}) {
  if (!providerReady('anthropic', env)) throw new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)');
  const n = Math.min(Math.max(Math.round(size) || 12, 1), 30), mix = roleMix(n), allowed = (categories.length ? categories : CATEGORY_IDS.filter(c => !WOMENSWEAR_ONLY.includes(c))).filter(c => CATEGORY_IDS.includes(c));
  const econ = cleanEconomics(code.economics), refMap = new Map(); let r = 0;
  const digest = { mix, season: clip(season, 40), economics: econ, categories: trends.categories.filter(c => c.count && allowed.includes(c.id)).map(c => ({
    id: c.id, label: c.label, count: c.count, hotShare: c.hotShare, newShare: c.newShare, ladder: c.ladder, colors: c.colors.map(x => x.name), fabrics: c.fabrics.map(x => x.name), silhouettes: c.silhouettes.map(x => x.name), details: c.details.map(x => x.name),
    movers: c.movers.map(m => { const key = `m${++r}`; refMap.set(key, m.id); return { ref: key, title: m.title, brand: m.brand, price: m.price, heat: m.heat }; }) })) };
  digest.categories.forEach(c => { c.silhouettes = c.silhouettes.slice(0, 4); });
  const user = `Plan ${n} pieces${season ? ` for ${clip(season, 40)}` : ''}${brief ? `: ${clip(brief, 600)}` : ''}.\nRole mix to aim for: ${Object.entries(mix).map(([k, v]) => `${v} ${k}`).join(', ')}.\nCategories you may use: ${allowed.join(', ')}.\nWhat the library says (prices are dollars; "cap" is the most a piece in that category may cost; a category with no ladder has no price evidence, so choose a modest price):\n<digest>${JSON.stringify(digest)}</digest>\n\nAnswer {"summary":"two sentences on the idea of the plan","lines":[{"category":"id","role":"core|trend|hero|entry","name":"short product name","brief":"silhouette, fabric, key details, one sentence","twist":"our own idea that makes it ours","rationale":"why, in terms of what the library shows","price":number,"refs":["m1"]}]}`;
  const res = await askImpl({ provider: 'anthropic', system: generateSystem(code), user, json: true, maxTokens: 7000, env, fetchImpl, fixture: planFixture });
  return { ...normaliseLines(res.json || {}, { trends, econ, refMap, allowed, size: n }), costCents: costCents('anthropic', res.usage?.input || 0, res.usage?.output || 0, env) };
}
// Turn the model's answer into lines we are willing to save: real categories and roles, prices held to the ladder, a starting cost and quantity.
export function normaliseLines(json, { trends, econ = DEFAULT_BRAND_CODE.economics, refMap = new Map(), allowed = CATEGORY_IDS, size = 12 } = {}) {
  const ladders = Object.fromEntries((trends?.categories || []).filter(c => c.ladder).map(c => [c.id, c.ladder])), lines = [];
  for (const x of Array.isArray(json.lines) ? json.lines : []) {
    if (lines.length >= size) break;
    const category = cleanCategory(x.category); if (!category || !allowed.includes(category)) continue;
    const name = clip(x.name, 100); if (!name) continue;
    const role = ROLE_IDS.includes(x.role) ? x.role : 'core', ladder = ladders[category];
    let price = Number(x.price); if (!Number.isFinite(price) || price <= 0) price = ladder?.core ?? 40;
    if (ladder?.cap) price = Math.min(price, ladder.cap); price = Math.min(Math.max(nice(price) ?? 40, ladder?.entry ? Math.min(ladder.entry, ladder.cap) * 0.8 : 8), 600);
    price = nice(price); if (ladder?.cap) price = Math.min(price, ladder.cap);
    const priceCents = Math.round(price * 100);
    lines.push({ category, role, name, brief: clip(x.brief, 400), twist: clip(x.twist, 400), rationale: clip(x.rationale, 500), priceCents, costCents: null, qty: START_QTY[role], refs: [...new Set((Array.isArray(x.refs) ? x.refs : []).map(k => refMap.get(String(k))).filter(Boolean))].slice(0, 6), status: 'planned' });
  }
  return { summary: clip(json.summary, 600), lines };
}

// A plan as CSV for a spreadsheet or a factory conversation. Quoting follows RFC 4180, and a cell that starts like a formula is neutralised.
const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function planCsv(plan, lines, econ = DEFAULT_BRAND_CODE.economics) {
  const head = ['Category', 'Role', 'Name', 'Brief', 'Our twist', 'Why', 'Target price', 'Est. landed cost', 'Margin %', 'Quantity', 'Status'];
  const rows = lines.map(l => { const c = l.costCents ?? defaultCost(l.priceCents, econ.costRatio); return [categoryLabel(l.category), l.role, l.name, l.brief, l.twist, l.rationale, l.priceCents != null ? (l.priceCents / 100).toFixed(2) : '', c != null ? (c / 100).toFixed(2) : '', marginOf(l.priceCents, c) ?? '', l.qty, l.status]; });
  return [[`${plan.name}${plan.season ? ' · ' + plan.season : ''}`], head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
