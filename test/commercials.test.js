import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  productCommercials, projectFinancialRollups, clientProductTerms, draftOrderLinesForProducts, latestProductQuote
} from '../src/commercials.js';

// A project with three products exercising every pricing path:
//  - quoted:    an issued quote (committed)
//  - tiered:    no quote, priced from a price tier (estimate)
//  - unpriced:  no quote, no tier -> excluded from every total
const project = { id: 'proj-1' };
const products = [
  { id: 'p-quoted', project_id: 'proj-1', title: 'Quoted Tee', shopify_variant_id: 'gid://shopify/ProductVariant/1',
    price_tiers: [{ min_quantity: 100, unit_cost_cents: 400, wholesale_cents: 900, srp_cents: 1800, setup_cents: 5000, freight_cents: 2000 }],
    configuration: { moq: 100 } },
  { id: 'p-tiered', project_id: 'proj-1', title: 'Tiered Cap',
    price_tiers: [{ min_quantity: 50, unit_cost_cents: 300, wholesale_cents: 700, srp_cents: 1500, setup_cents: 2500, freight_cents: 1000 }],
    configuration: { moq: 50 } },
  { id: 'p-unpriced', project_id: 'proj-1', title: 'Idea Bottle', price_tiers: [], configuration: {} }
];
const quotes = [
  { id: 'q1', product_id: 'p-quoted', version: 1, status: 'issued', quantity: 250,
    unit_cost_cents: 380, wholesale_cents: 850, srp_cents: 1800, tooling_cents: 6000, freight_cents: 2500, currency: 'USD' },
  // a superseded/declined quote that must be ignored in favor of the issued v1
  { id: 'q0', product_id: 'p-quoted', version: 2, status: 'declined', quantity: 999,
    unit_cost_cents: 1, wholesale_cents: 1, tooling_cents: 0, freight_cents: 0, currency: 'USD' }
];

test('latest non-declined quote wins over higher declined version', () => {
  assert.equal(latestProductQuote('p-quoted', quotes).id, 'q1');
});

test('quoted product uses quote fields; line total = units*wholesale + setup + freight', () => {
  const t = productCommercials(products[0], quotes);
  assert.equal(t.units, 250);
  assert.equal(t.unitPriceCents, 850);
  assert.equal(t.setupCents, 6000);
  assert.equal(t.freightCents, 2500);
  assert.equal(t.committed, true);
  assert.equal(t.estimated, false);
  assert.equal(t.lineTotalCents, 250 * 850 + 6000 + 2500); // 221000
});

test('tiered product with no quote is an estimate priced from the tier', () => {
  const t = productCommercials(products[1], quotes);
  assert.equal(t.units, 50);
  assert.equal(t.unitPriceCents, 700);
  assert.equal(t.committed, false);
  assert.equal(t.estimated, true);
  assert.equal(t.lineTotalCents, 50 * 700 + 2500 + 1000); // 38500
});

test('product with neither quote nor tier is not priced and is excluded', () => {
  const t = productCommercials(products[2], quotes);
  assert.equal(t.priced, false);
  assert.equal(t.lineTotalCents, 0);
});

test('RECONCILIATION: hub rollup total == PDF total == draft-invoice total', () => {
  const [rollup] = projectFinancialRollups([project], products, quotes, [], { internal: true });

  // PDF path sums clientProductTerms.total across priced products (mirrors projectCollectionPdf).
  const pdfTotal = products.reduce((sum, p) => {
    const terms = clientProductTerms(p, quotes);
    return terms.priced ? sum + terms.total : sum;
  }, 0);

  // Draft-invoice path sums the line items that would be sent to Shopify.
  const draft = draftOrderLinesForProducts(products, quotes, 'USD');

  const expected = 221000 + 38500; // quoted + tiered, unpriced excluded
  assert.equal(rollup.quotedCents, expected, 'hub rollup');
  assert.equal(pdfTotal, expected, 'PDF total');
  assert.equal(draft.amountCents, expected, 'draft invoice total');
  assert.equal(rollup.quotedCents, pdfTotal);
  assert.equal(pdfTotal, draft.amountCents);
});

test('rollup breaks out committed vs estimated and counts priced products', () => {
  const [rollup] = projectFinancialRollups([project], products, quotes, []);
  assert.equal(rollup.pricedProducts, 2);
  assert.equal(rollup.committedProducts, 1);
  assert.equal(rollup.estimatedProducts, 1);
  assert.equal(rollup.estimatedCents, 38500);
  assert.equal(rollup.quotedCents, 259500);
});

test('draft invoice: variant line vs custom line, plus setup/freight lines', () => {
  const draft = draftOrderLinesForProducts(products, quotes, 'USD');
  // p-quoted: main(variant) + setup + freight = 3 lines; p-tiered: main(custom) + setup + freight = 3 lines
  assert.equal(draft.lineItems.length, 6);
  assert.equal(draft.summary.length, 2);
  assert.equal(draft.skipped.length, 1);
  assert.equal(draft.skipped[0].productId, 'p-unpriced');

  const quotedMain = draft.lineItems[0];
  assert.equal(quotedMain.variantId, 'gid://shopify/ProductVariant/1');
  assert.equal(quotedMain.quantity, 250);
  assert.equal(quotedMain.priceOverride.amount, '8.50');

  const tieredMain = draft.lineItems.find(l => l.title === 'Tiered Cap');
  assert.ok(tieredMain, 'product without a variant becomes a custom-title line');
  assert.equal(tieredMain.requiresShipping, true);
  assert.ok(draft.lineItems.some(l => l.title === 'Setup — Tiered Cap'));
  assert.ok(draft.lineItems.some(l => l.title === 'Freight — Tiered Cap'));
});

test('mixed currencies are detectable so the endpoint can refuse them', () => {
  const eurProducts = [products[0], { ...products[1], id: 'p-eur', price_tiers: products[1].price_tiers }];
  const eurQuotes = [...quotes, { id: 'q-eur', product_id: 'p-eur', version: 1, status: 'issued', quantity: 10, unit_cost_cents: 1, wholesale_cents: 100, tooling_cents: 0, freight_cents: 0, currency: 'EUR' }];
  const currencies = [...new Set(eurProducts.map(p => latestProductQuote(p.id, eurQuotes)?.currency).filter(Boolean))];
  assert.deepEqual(currencies.sort(), ['EUR', 'USD']);
});
