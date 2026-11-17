import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSizes, sizesTotal, sizesWords, tierFor, matchRequest, cleanQuote, clientQuote, quoteNumber } from '../src/order-quotes.js';

const PRODUCTS = ['Cap — Green', 'Cap — Tan', 'Beanie — Green', 'Multitool', 'Long Sleeve "Yosemite"', 'T-Shirt "Taxi"', 'Water Bottle'].map((title, i) => ({ id: 'p' + i, title }));

test('sizes are read the way people write them', () => {
  assert.deepEqual(parseSizes('10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL'), { S: 10, M: 30, L: 30, XL: 20, '2XL': 5, '3XL': 5 });
  assert.deepEqual(parseSizes('S:4 M=6'), { S: 4, M: 6 });
  assert.equal(sizesTotal(parseSizes('10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL')), 100); assert.equal(sizesWords({ S: 2, M: 0, L: 1 }), '2 S, 1 L');
});

test('a quantity falls in the tier with the highest minimum at or under it', () => {
  const tiers = [{ id: 'a', min_quantity: 50 }, { id: 'b', min_quantity: 100, max_quantity: 249 }, { id: 'c', min_quantity: 250 }];
  assert.equal(tierFor(tiers, 120).tier.id, 'b'); assert.equal(tierFor(tiers, 400).tier.id, 'c');
  assert.deepEqual([tierFor(tiers, 20).tier.id, tierFor(tiers, 20).belowMin], ['a', true]); assert.equal(tierFor([], 5), null);
});

test('a request names products in its own words: an olive hat is the green cap, and the size breakdown goes with the line before it', () => {
  const picks = matchRequest('Hi, we want a single order with 3 items: - Olive hat (50) - Multitool (100) - Ouster Yosemite Long Sleeve — Natural (100), and we want 10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL', PRODUCTS);
  assert.deepEqual(picks.map(p => [p.productId, p.quantity]), [['p0', 50], ['p3', 100], ['p4', 100]]);
  assert.deepEqual(picks[2].sizes, { S: 10, M: 30, L: 30, XL: 20, '2XL': 5, '3XL': 5 }); assert.equal(picks[0].sizes, null);
  assert.deepEqual(matchRequest('Can you call me?', PRODUCTS), [], 'no products, no picks');
});

test('a quote is checked: products in the room, a quantity and a price on every line, sizes that add up', () => {
  const ok = cleanQuote({ lines: [{ productId: 'p3', quantity: 100, unitCents: 1200, unitCostCents: 800 }, { productId: 'p4', quantity: 100, sizes: { S: 10, M: 30, L: 30, XL: 20, '2XL': 5, '3XL': 5 }, unitCents: 2900, unitCostCents: 1890 }], extras: [{ label: 'Freight', cents: 15000 }, { label: '', cents: 5 }], validUntil: '2026-12-07' }, PRODUCTS);
  assert.equal(ok.value.subtotalCents, 410000); assert.equal(ok.value.totalCents, 425000); assert.equal(ok.value.extras.length, 1); assert.equal(ok.value.marginPct, 34.4); assert.equal(ok.value.validUntil, '2026-12-07');
  assert.match(cleanQuote({ lines: [{ productId: 'zz', quantity: 1, unitCents: 1 }] }, PRODUCTS).error, /not in this room/);
  assert.match(cleanQuote({ lines: [{ productId: 'p3', quantity: 0, unitCents: 1 }] }, PRODUCTS).error, /quantity/);
  assert.match(cleanQuote({ lines: [{ productId: 'p3', quantity: 5 }] }, PRODUCTS).error, /unit price/);
  assert.match(cleanQuote({ lines: [{ productId: 'p4', quantity: 100, sizes: { S: 10 }, unitCents: 1 }] }, PRODUCTS).error, /add up to 10/);
  assert.match(cleanQuote({ lines: [] }, PRODUCTS).error, /at least one/);
  assert.equal(cleanQuote({ lines: [{ productId: 'p3', quantity: 1, unitCents: 100 }] }, PRODUCTS).value.marginPct, null, 'no cost, no margin');
});

test('the client sees the lines and the total, never our costs or margin', () => {
  const v = clientQuote({ id: 'q', number: 'Q-2026-0001', status: 'sent', lines: [{ title: 'Multitool', quantity: 100, unitCents: 1200, totalCents: 120000, unitCostCents: 800 }], total_cents: 120000, cost_cents: 80000, margin_pct: 33.3, pay_url: 'https://pay' });
  assert.equal(JSON.stringify(v).includes('unitCostCents'), false); assert.equal(v.payUrl, '', 'the pay link only shows once accepted'); assert.equal(quoteNumber(7, 2026), 'Q-2026-0007');
});

test('a line with no cost on record leaves the margin blank, not 100%', () => {
  const q = cleanQuote({ lines: [{ productId: 'p3', quantity: 100, unitCents: 1850, unitCostCents: null }, { productId: 'p4', quantity: 100, unitCents: 2350, unitCostCents: 1420 }] }, PRODUCTS);
  assert.equal(q.value.costCents, null); assert.equal(q.value.marginPct, null);
});

test('sizes read smallest to largest, whatever order they were stored in', () => {
  assert.equal(sizesWords({ L: 30, M: 30, S: 10, XL: 20, '2XL': 5, '3XL': 5 }), '10 S, 30 M, 30 L, 20 XL, 5 2XL, 5 3XL');
});

test('one size: "One size", "OSFA" or "one size fits all" alone covers the whole quantity; "50 one size" counts', () => {
  assert.deepEqual(parseSizes('One size', 50), { 'One size': 50 }); assert.deepEqual(parseSizes('osfa', 20), { 'One size': 20 });
  assert.deepEqual(parseSizes('one size fits all', 12), { 'One size': 12 }); assert.deepEqual(parseSizes('50 One size'), { 'One size': 50 });
  assert.deepEqual(parseSizes('One size'), {}, 'with no quantity there is nothing to count'); assert.deepEqual(parseSizes('blue', 5), {});
  assert.equal(cleanQuote({ lines: [{ productId: 'p0', quantity: 50, sizes: { 'one size': 50 }, unitCents: 1600 }] }, PRODUCTS).value.lines[0].sizes['One size'], 50);
});

test('a product tier\'s setup and freight ride on the quote as their own lines, still marked as the tier\'s when saved', () => {
  const tierKey = '7eb2b6bb-cc3d-462f-9c2a-acee6f0979b0:setup_cents';
  const q = cleanQuote({ lines: [{ productId: 'p3', quantity: 100, unitCents: 1200 }], extras: [{ label: 'Setup · Multitool', cents: 15000, auto: tierKey }, { label: 'Freight · Multitool', cents: 4500, auto: 'drop table' }, { label: 'Rush', cents: 2000 }] }, PRODUCTS);
  assert.equal(q.value.totalCents, 120000 + 15000 + 4500 + 2000, 'every line is in the total');
  assert.deepEqual(q.value.extras.map(x => x.auto || null), [tierKey, null, null], 'only a product and fee key is kept as the line\'s source');
});

test('every fee a product carries comes to its quote: sampling while a sample is required, each decoration\'s setup, an old quote\'s tooling and freight', async () => {
  const { productFees, AUTO_FEE } = await import('../src/order-quotes.js');
  const p = { sample_fee_cents: 7500, sample_required: true, legacy: { tooling: 12000, freight: 3000 },
    decorations: [{ id: 'p1a', name: 'Wordmark', technique: 'Screen print', setupCents: 5000 }, { id: 'p2b', name: 'Back graphic', technique: 'Embroidery', setupCents: 3500 }, { id: 'x', name: 'Transfer', setupCents: 0 }, { id: 'u', name: 'Laser', setupCents: 900, unpriced: true }] };
  const f = productFees(p);
  assert.equal(f.sampleCents, 7500); assert.equal(f.toolingCents, 12000); assert.equal(f.freightCents, 3000);
  assert.deepEqual(f.decorations, [{ id: 'p1a', label: 'Wordmark (Screen print)', cents: 5000 }, { id: 'p2b', label: 'Back graphic (Embroidery)', cents: 3500 }], 'no setup, or no estimate yet, is no line');
  assert.equal(productFees({ ...p, sample_required: false }).sampleCents, 0, 'no sample, no sampling fee');
  assert.deepEqual(productFees({}), { sampleCents: 0, toolingCents: 0, freightCents: 0, decorations: [] });
  const id = '7eb2b6bb-cc3d-462f-9c2a-acee6f0979b0';
  for (const k of ['setup_cents', 'freight_cents', 'sample', 'decor:p1a']) assert.ok(AUTO_FEE.test(`${id}:${k}`), k);
  for (const k of ['decor:../x', 'sample;drop', 'other']) assert.ok(!AUTO_FEE.test(`${id}:${k}`), k);
});

test('the invoice an accepted quote becomes: other lines comped at $0, a discount off the total, never below nothing', async () => {
  const { invoiceOf, cleanInvoiceAdjust, clientQuote } = await import('../src/order-quotes.js');
  const q = { status: 'accepted', subtotal_cents: 600000, total_cents: 625500, lines: [], extras: [{ label: 'Setup · Tee', cents: 15000 }, { label: 'Sampling · Tee', cents: 7500 }, { label: 'Freight · Tee', cents: 3000 }] };
  const plain = invoiceOf(q); assert.equal(plain.totalCents, 625500); assert.equal(plain.adjusted, false);
  const c = cleanInvoiceAdjust({ comped: [1, 1, 9, -1, 'x'], discount: { label: ' Launch ', cents: 20000 } }, q);
  assert.deepEqual(c.value, { comped: [1], discount: { label: 'Launch', cents: 20000 } }, 'only real lines, once each');
  const inv = invoiceOf({ ...q, invoice_adjust: c.value });
  assert.equal(inv.compedCents, 7500); assert.equal(inv.totalCents, 625500 - 7500 - 20000); assert.equal(inv.extras[1].comped, true); assert.equal(inv.adjusted, true);
  assert.match(cleanInvoiceAdjust({ discount: { cents: 700000 } }, q).error, /more than the invoice/);
  assert.deepEqual(cleanInvoiceAdjust({}, q).value, { comped: [] });
  const seen = clientQuote({ ...q, invoice_adjust: c.value });
  assert.deepEqual(seen.invoice, { comped: ['Sampling · Tee'], discount: { label: 'Launch', cents: 20000 }, totalCents: 598000 }, 'the client sees what was comped and the discount');
  assert.equal(clientQuote(q).invoice, undefined);
});

test('comping and discounting at the invoice stage changes the same Shopify draft order: same link, new total', async () => {
  const Fastify = (await import('fastify')).default, { registerOrderQuoteRoutes } = await import('../src/order-quote-routes.js');
  const QID = '11111111-2222-4333-8444-555555555555', CID = '22222222-2222-4333-8444-555555555555';
  let quote = { id: QID, client_id: CID, client_name: 'Room', number: 'Q-2026-0009', status: 'accepted', currency: 'USD', subtotal_cents: 100000, total_cents: 125000, lines: [{ productId: 'p1', title: 'Tee', quantity: 100, unitCents: 1000, totalCents: 100000 }],
    extras: [{ label: 'Setup · Tee', cents: 15000 }, { label: 'Sampling · Tee', cents: 10000 }], shopify_draft_order_id: 'gid://shopify/DraftOrder/7', shopify_draft_order_name: '#D7', pay_url: 'https://pay.test/d7' };
  let paid = false, invoiceRow = null; const updates = [], creates = [];
  const pool = { query: async (sql, args = []) => {
    if (/from order_quotes q join clients c/.test(sql)) return { rows: [quote] };
    if (/from invoices where client_id=\$1 and shopify_draft_order_id=\$2 and status='paid'/.test(sql)) return { rowCount: paid ? 1 : 0, rows: [] };
    if (/^update order_quotes set invoice_adjust/.test(sql)) { quote = { ...quote, invoice_adjust: JSON.parse(args[1]) }; return { rows: [quote] }; }
    if (/^select name, contact_email/.test(sql)) return { rows: [{ name: 'Room' }] };
    if (/select id, shopify_variant_id from products/.test(sql)) return { rows: [] };
    if (/^insert into invoices/.test(sql)) { invoiceRow = { number: args[2], amount: args[3], url: args[5] }; return { rows: [] }; }
    return { rows: [], rowCount: 0 };
  } };
  const app = Fastify();
  registerOrderQuoteRoutes(app, { pool, authenticate: async () => {}, adminOnly: async () => {}, log: { warn() {} },
    makeDraftOrder: async input => { creates.push(input); return { id: 'new', name: '#D8', invoiceUrl: 'https://pay.test/d8' }; },
    updateDraftOrder: async (id, input) => { updates.push({ id, input }); return { id, name: '#D7', invoiceUrl: 'https://pay.test/d7' }; } });
  const put = body => app.inject({ method: 'PUT', url: `/v1/admin/order-quotes/${QID}/invoice`, payload: body });
  const r = await put({ comped: [1], discount: { label: 'Friends rate', cents: 5000 } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(creates.length, 0, 'no second draft order'); assert.equal(updates[0].id, 'gid://shopify/DraftOrder/7');
  const titles = updates[0].input.lineItems.map(l => `${l.title}=${l.originalUnitPriceWithCurrency.amount}`);
  assert.deepEqual(titles, ['Tee=10.00', 'Setup · Tee=150.00', 'Sampling · Tee (comped)=0.00']);
  assert.deepEqual(updates[0].input.appliedDiscount, { title: 'Friends rate', description: 'Friends rate', value: 50, valueType: 'FIXED_AMOUNT' });
  assert.deepEqual(invoiceRow, { number: '#D7', amount: 125000 - 10000 - 5000, url: 'https://pay.test/d7' }, 'same invoice, new amount');
  assert.equal(r.json().quote.invoice.totalCents, 110000);
  paid = true; assert.equal((await put({ comped: [0] })).statusCode, 409, 'a paid invoice is not changed');
  paid = false; quote = { ...quote, status: 'sent' }; assert.equal((await put({ comped: [0] })).statusCode, 409, 'before acceptance, the quote is edited instead');
});
