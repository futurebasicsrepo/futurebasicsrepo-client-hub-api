import test from 'node:test';
import assert from 'node:assert/strict';
import { quantile, nice, trendRead, priceLadder, roleMix, marginOf, defaultCost, cleanLine, lineWarnings, planSummary, normaliseLines, generateLines, planFixture, planCsv, REF_TO_ANCHOR } from '../src/lab-plan.js';
import { cleanBrandCode, cleanEconomics, DEFAULT_BRAND_CODE } from '../src/lab.js';

const NOW = new Date('2026-10-17T12:00:00Z');
const row = (o) => ({ id: `i${Math.random()}`, title: 'x', category: 'tops', price: 50, heat: null, firstSeenAt: '2026-10-10T00:00:00Z', attrs: {}, brand: 'Ref', role: 'reference', ...o });

test('quantiles and shelf prices', () => {
  assert.equal(quantile([], .5), null); assert.equal(quantile([10], .5), 10); assert.equal(quantile([10, 20, 30, 40], .5), 25); assert.equal(quantile([10, 20, 30, 40, 50], .25), 20);
  assert.equal(nice(37.4), 38); assert.equal(nice(43), 45); assert.equal(nice(96), 95); assert.equal(nice(148), 150); assert.equal(nice(3), 8); assert.equal(nice(0), null); assert.equal(nice('x'), null);
});

test('the trend read: prices, how much is moving, what keeps showing up, the best movers', () => {
  const rows = [
    ...[78, 98, 110, 130].map(p => row({ price: p, category: 'tops', heat: p > 100 ? 70 : 0, attrs: { colors: ['Navy', 'cream'], fabric: 'Cotton', silhouette: 'boxy', details: ['rib collar'] } })),
    ...[30, 40, 45].map(p => row({ price: p, category: 'tops', brand: 'Zara', role: 'price', heat: 10, attrs: { colors: ['navy'], fabric: 'cotton' } })),
    row({ category: 'headwear', price: null, brand: 'Search', heat: null }), row({ category: 'bags', role: 'cuts', price: 2000 }),
    row({ category: 'tops', price: 60, firstSeenAt: '2025-01-01T00:00:00Z' })
  ];
  const t = trendRead(rows, { now: NOW }), tops = t.categories.find(c => c.id === 'tops');
  assert.equal(t.total, rows.length); assert.equal(tops.count, 8); assert.equal(tops.reference.n, 5); assert.equal(tops.anchor.n, 3);
  assert.equal(tops.hotCount, 2); assert.equal(tops.withHeat, 7); assert.equal(tops.hotShare, 0.29); assert.ok(tops.newShare > 0.8 && tops.newShare < 0.9, tops.newShare);
  assert.equal(tops.colors[0].name.toLowerCase(), 'navy'); assert.equal(tops.colors[0].n, 7, 'Navy and navy count together');
  assert.equal(tops.fabrics[0].n, 7); assert.equal(tops.movers[0].heat, 70); assert.equal(tops.movers.length, 4);
  assert.equal(t.categories.find(c => c.id === 'headwear').count, 1); assert.equal(t.categories.find(c => c.id === 'footwear').count, 0);
  assert.equal(t.categories.find(c => c.id === 'bags').reference, null, 'luxury "cuts only" brands do not set our price evidence');
  assert.ok(t.movers.length && t.movers[0].heat === 70);
});

test('the price ladder follows the price anchor when it has been read, and says so when it is only an estimate', () => {
  const a = priceLadder({ anchor: { n: 4, p25: 29, median: 39, p75: 49 }, reference: { n: 9, p25: 80, median: 100, p75: 140 } });
  assert.deepEqual(a, { basis: 'anchor', entry: 30, core: 40, cap: 50, n: 4 }, 'the anchor wins over the references');
  const e = priceLadder({ anchor: { n: 2, p25: 1, median: 1, p75: 1 }, reference: { n: 5, p25: 80, median: 100, p75: 150 } });
  assert.equal(e.basis, 'estimated'); assert.equal(e.core, nice(100 * REF_TO_ANCHOR)); assert.equal(e.cap, nice(150 * REF_TO_ANCHOR));
  assert.equal(priceLadder({ anchor: null, reference: { n: 2, p25: 1, median: 1, p75: 1 } }), null, 'two pieces are not evidence');
});

test('role mix always adds up and keeps a hero', () => {
  for (const n of [1, 3, 6, 8, 12, 16, 24, 30]) { const m = roleMix(n); assert.equal(m.core + m.trend + m.hero + m.entry, n, `n=${n}`); assert.ok(m.hero >= 1 && m.core >= 0); }
  assert.deepEqual(roleMix(12), { core: 4, trend: 4, hero: 2, entry: 2 });
});

test('margin, cost estimate and cleaning a line', () => {
  assert.equal(marginOf(5000, 1400), 72); assert.equal(marginOf(0, 100), null); assert.equal(marginOf(5000, null), null); assert.equal(defaultCost(5000, 0.28), 1400); assert.equal(defaultCost(null, 0.28), null);
  assert.equal(cleanLine({ name: ' Boxy tee ', category: 'tops', price: '38', qty: '300' }).priceCents, 3800); assert.equal(cleanLine({ name: ' Boxy tee ' }).name, 'Boxy tee');
  for (const bad of [{}, { name: 'x', category: 'nope' }, { name: 'x', role: 'nope' }, { name: 'x', price: 'abc' }, { name: 'x', price: -5 }, { name: 'x', qty: 1.5 }, { name: 'x', qty: -1 }, { name: 'x', status: 'zzz' }, { name: 'x', cost: 'free' }]) assert.ok(cleanLine(bad).error, JSON.stringify(bad));
  const base = { category: 'tops', role: 'core', name: 'Tee', brief: '', twist: '', rationale: '', priceCents: 3800, costCents: 1000, qty: 100, refs: [], status: 'planned' };
  assert.equal(cleanLine({ qty: 200 }, base).priceCents, 3800, 'only what is sent changes'); assert.equal(cleanLine({ cost: null }, base).costCents, null, 'null puts the cost back to the estimate'); assert.equal(cleanLine({ price: '' }, base).priceCents, null);
});

test('flags: above the anchor line, thin margin, no price; a dropped piece is not flagged', () => {
  const ladder = { basis: 'anchor', entry: 28, core: 40, cap: 50 }, econ = { costRatio: 0.28, minMarginPct: 60 };
  assert.deepEqual(lineWarnings({ category: 'tops', priceCents: 4500, costCents: null, status: 'planned' }, ladder, econ), []);
  const above = lineWarnings({ category: 'tops', priceCents: 6500, costCents: null, status: 'planned' }, ladder, econ); assert.equal(above.length, 1); assert.match(above[0].text, /Above the Zara line for tops and jackets|Above the Zara line for tops/i);
  assert.match(lineWarnings({ category: 'tops', priceCents: 4500, costCents: 3000, status: 'planned' }, ladder, econ)[0].text, /Margin 33.3% is under the 60%/);
  assert.match(lineWarnings({ category: 'tops', priceCents: null, status: 'planned' }, ladder, econ)[0].text, /No price/);
  assert.deepEqual(lineWarnings({ category: 'tops', priceCents: 9900, status: 'dropped' }, ladder, econ), []);
  assert.match(lineWarnings({ category: 'tops', priceCents: 6500, status: 'planned' }, { ...ladder, basis: 'estimated' }, econ)[0].text, /estimated Zara line/);
});

test('the plan summary counts what is live, the money, and what is lopsided or missing', () => {
  const L = (o) => ({ category: 'tops', role: 'core', name: 'n', priceCents: 4000, costCents: null, qty: 100, status: 'planned', ...o });
  const lines = [L({}), L({}), L({}), L({}), L({ category: 'outerwear', role: 'hero', priceCents: 12000, qty: 50 }), L({ status: 'dropped' }), L({ qty: 0 })];
  const s = planSummary(lines, { tops: { basis: 'anchor', cap: 50, entry: 20, core: 35 } }, { costRatio: 0.25, minMarginPct: 60 });
  assert.equal(s.count, 6); assert.equal(s.dropped, 1); assert.equal(s.units, 450); assert.equal(s.revenueCents, 4000 * 400 + 12000 * 50); assert.equal(s.costCents, Math.round(1000 * 400 + 3000 * 50)); assert.equal(s.blendedMarginPct, 75);
  assert.equal(s.priceMin, 40); assert.equal(s.priceMax, 120); assert.deepEqual(s.byCategory, { tops: 5, outerwear: 1 });
  assert.ok(s.notes.some(n => /83% of the plan is tops/.test(n)) && s.notes.some(n => /No entry price point/.test(n)) && s.notes.some(n => /no quantity/.test(n)) && !s.notes.some(n => /No hero/.test(n)));
  assert.equal(planSummary([], {}).count, 0);
});

test('the assistant\'s answer is made safe: real categories only, prices held to the ladder, starting cost and quantity, only references that exist', () => {
  const trends = { categories: [{ id: 'tops', ladder: { basis: 'anchor', entry: 28, core: 40, cap: 50 } }, { id: 'outerwear', ladder: null }] };
  const out = normaliseLines({ summary: ' A plan ', lines: [
    { category: 'tops', role: 'core', name: 'Boxy tee', price: 95, brief: 'b', twist: 't', rationale: 'r', refs: ['m1', 'm9', 'm1'] },
    { category: 'tops', role: 'weird', name: 'Rib polo', price: 3 },
    { category: 'outerwear', role: 'hero', name: 'Quilted liner', price: 'lots' },
    { category: 'footwear', role: 'core', name: 'Not allowed' }, { category: 'nope', name: 'Bad' }, { category: 'tops', name: '' }
  ] }, { trends, econ: { costRatio: 0.3, minMarginPct: 60 }, refMap: new Map([['m1', 'uuid-1']]), allowed: ['tops', 'outerwear'], size: 10 });
  assert.equal(out.summary, 'A plan'); assert.equal(out.lines.length, 3);
  const [a, b, c] = out.lines; assert.equal(a.priceCents, 5000, 'capped at the anchor line'); assert.equal(a.costCents, null, 'the cost stays an estimate that follows the brand code'); assert.equal(a.qty, 500); assert.deepEqual(a.refs, ['uuid-1']);
  assert.equal(b.role, 'core'); assert.ok(b.priceCents >= 2200 && b.priceCents <= 5000, 'a price far under the entry point is lifted: ' + b.priceCents);
  assert.equal(c.priceCents, 4000, 'no ladder and no usable price: a modest default'); assert.equal(c.qty, 150);
  assert.equal(normaliseLines({ lines: Array.from({ length: 20 }, (_, i) => ({ category: 'tops', name: 'n' + i })) }, { trends, size: 5 }).lines.length, 5, 'never more than the size asked for');
  assert.deepEqual(normaliseLines({}, { trends }).lines, []);
});

test('generating a plan: needs the AI, passes the brand code, ladder and movers, and returns safe lines with the cost counted', async () => {
  const trends = trendRead([...[30, 40, 45].map(p => row({ category: 'tops', price: p, brand: 'Zara', role: 'price', heat: 5 })), ...[80, 100, 120].map(p => row({ category: 'tops', price: p, heat: 60, title: 'Hot ' + p })), ...[200, 220, 260].map(p => row({ category: 'outerwear', price: p, heat: 40 }))], { now: NOW });
  await assert.rejects(() => generateLines({ trends, env: {} }), /not connected/);
  let seen = null;
  const out = await generateLines({ trends, size: 8, season: 'Fall 2027', brief: 'quiet heritage', code: DEFAULT_BRAND_CODE, env: { ANTHROPIC_API_KEY: 'k', AI_FIXTURE: 'x' }, askImpl: async a => { seen = a; return { json: planFixture({ user: a.user }), usage: { input: 5000, output: 2000 } }; } });
  assert.match(seen.system, /Zara/); assert.match(seen.system, /never name a brand's product/); assert.match(seen.user, /Fall 2027/); assert.match(seen.user, /quiet heritage/); assert.match(seen.user, /<digest>/);
  assert.equal(out.lines.length, 8); assert.ok(out.lines.every(l => l.priceCents > 0 && l.costCents === null && l.qty > 0 && l.refs.every(r => /^i/.test(r)))); assert.ok(out.lines.some(l => l.refs.length), 'movers become references to real library pieces'); assert.ok(out.costCents > 0);
  const tops = out.lines.filter(l => l.category === 'tops'); assert.ok(tops.every(l => l.priceCents <= 5000), 'held to the Zara line');
  assert.equal(out.lines.filter(l => l.role === 'hero').length, roleMix(8).hero);
});

test('the CSV opens cleanly in a spreadsheet: quoted, and nothing that starts like a formula', () => {
  const csv = planCsv({ name: 'Fall "27"', season: 'FW' }, [{ category: 'tops', role: 'core', name: '=HYPERLINK("x")', brief: 'a, b', twist: 'line\nbreak', rationale: '', priceCents: 3800, costCents: null, qty: 100, status: 'planned' }], { costRatio: 0.28 });
  assert.match(csv, /^"Fall ""27"" · FW"\r\n/); assert.match(csv, /'=HYPERLINK\(""x""\)/); assert.match(csv, /"a, b"/); assert.match(csv, /"line\nbreak"/); assert.match(csv, /38\.00,10\.64,72,100,planned\r\n$/);
});

test('economics are part of the brand code and stay sane', () => {
  assert.deepEqual(DEFAULT_BRAND_CODE.economics, { costRatio: 0.28, minMarginPct: 60 });
  assert.deepEqual(cleanEconomics({ costRatio: 5, minMarginPct: -3 }), { costRatio: 0.28, minMarginPct: 60 }, 'out-of-range values fall back');
  assert.deepEqual(cleanEconomics({ costRatio: '0.33', minMarginPct: '55' }), { costRatio: 0.33, minMarginPct: 55 });
  assert.equal(cleanBrandCode({ economics: { costRatio: 0.2 } }, { ...DEFAULT_BRAND_CODE, economics: { costRatio: 0.3, minMarginPct: 50 } }).economics.minMarginPct, 50, 'what is not sent stays');
  assert.equal(cleanBrandCode({}).economics.costRatio, 0.28);
});
