// Shared commercial math for a project's products.
//
// One source of truth so the client hub's financial rollup, the client-facing
// collection PDF, and the project draft-invoice roll-up always agree on units,
// pricing and totals. The latest non-declined quote wins; missing fields fall
// back to the product's first price tier, then its configuration MOQ.

export function latestProductQuote(productId, quotes) {
  return [...(quotes || [])]
    .filter(q => q.product_id === productId && q.status !== 'declined')
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null;
}

export function productCommercials(product, quotes) {
  const quote = latestProductQuote(product.id, quotes);
  const tiers = Array.isArray(product.price_tiers) ? product.price_tiers : [];
  const tier = tiers[0] || {};
  const config = product.configuration || {};
  const units = Number(quote?.quantity ?? tier.min_quantity ?? config.moq ?? 0);
  const moq = Number(config.moq ?? tier.min_quantity ?? 0);
  const unitPriceCents = Number(quote?.wholesale_cents ?? tier.wholesale_cents ?? 0);
  const setupCents = Number(quote?.tooling_cents ?? tier.setup_cents ?? 0);
  const freightCents = Number(quote?.freight_cents ?? tier.freight_cents ?? 0);
  const srpRaw = quote?.srp_cents ?? tier.srp_cents;
  const internalUnitCostCents = Number(quote?.unit_cost_cents ?? tier.unit_cost_cents ?? 0);
  const committed = Boolean(quote && quote.status === 'issued');
  const priced = units > 0 && unitPriceCents > 0;
  return {
    quote, units, moq, unitPriceCents, setupCents, freightCents,
    srpCents: srpRaw == null ? null : Number(srpRaw), internalUnitCostCents,
    currency: quote?.currency || 'USD', committed, priced, estimated: priced && !committed,
    lineTotalCents: units * unitPriceCents + setupCents + freightCents,
    internalTotalCents: units * internalUnitCostCents + setupCents + freightCents
  };
}

export function projectFinancialRollups(projects, products, quotes, invoices, { internal = false } = {}) {
  return projects.map(project => {
    const projectProducts = products.filter(product => product.project_id === project.id);
    const productIds = new Set(projectProducts.map(product => product.id));
    const projectQuoteIds = new Set((quotes || []).filter(q => productIds.has(q.product_id)).map(q => q.id));
    const projectInvoices = invoices.filter(invoice => invoice.project_id === project.id || projectQuoteIds.has(invoice.quote_id) || productIds.has(invoice.product_id));
    let clientCostCents = 0, estimatedCents = 0, projectedRetailCents = 0, internalCostCents = 0, committedProducts = 0, estimatedProducts = 0, currency = null;
    const lines = [];
    for (const product of projectProducts) {
      const terms = productCommercials(product, quotes);
      if (!terms.priced) continue;
      clientCostCents += terms.lineTotalCents;
      internalCostCents += terms.internalTotalCents;
      if (terms.srpCents != null) projectedRetailCents += terms.units * terms.srpCents;
      if (terms.committed) committedProducts++; else { estimatedProducts++; estimatedCents += terms.lineTotalCents; }
      if (!currency) currency = terms.currency;
      lines.push({
        productId: product.id, title: product.title, units: terms.units, unitPriceCents: terms.unitPriceCents,
        setupCents: terms.setupCents, freightCents: terms.freightCents, lineTotalCents: terms.lineTotalCents,
        committed: terms.committed, estimated: terms.estimated
      });
    }
    const pricedProducts = committedProducts + estimatedProducts;
    const invoicedCents = projectInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0);
    const paidCents = projectInvoices.filter(invoice => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0);
    const outstandingCents = projectInvoices.filter(invoice => invoice.status === 'due' || invoice.status === 'draft').reduce((sum, invoice) => sum + Number(invoice.amount_cents || 0), 0);
    const base = {
      projectId: project.id, currency: currency || projectInvoices[0]?.currency || 'USD', productCount: projectProducts.length,
      pricedProducts, quotedProducts: committedProducts, committedProducts, estimatedProducts,
      quotedCents: clientCostCents, estimatedCents, projectedRetailCents, clientProfitCents: projectedRetailCents - clientCostCents,
      clientMarginPct: projectedRetailCents > 0 ? Number((((projectedRetailCents - clientCostCents) / projectedRetailCents) * 100).toFixed(1)) : null,
      invoicedCents, paidCents, outstandingCents, lines, invoices: projectInvoices.map(invoice => ({
        id: invoice.id, number: invoice.number, amount_cents: invoice.amount_cents,
        currency: invoice.currency, status: invoice.status, due_date: invoice.due_date, external_url: invoice.external_url, created_at: invoice.created_at
      }))
    };
    return internal ? {
      ...base, internalCostCents, internalProfitCents: clientCostCents - internalCostCents,
      internalMarginPct: clientCostCents > 0 ? Number((((clientCostCents - internalCostCents) / clientCostCents) * 100).toFixed(1)) : null
    } : base;
  });
}

// Adapter preserving the key names the collection PDF renderer expects.
export function clientProductTerms(product, quotes) {
  const terms = productCommercials(product, quotes);
  return {
    quote: terms.quote, units: terms.units, moq: terms.moq, unitPrice: terms.unitPriceCents,
    setup: terms.setupCents, shipping: terms.freightCents, total: terms.lineTotalCents,
    priced: terms.priced, estimated: terms.estimated
  };
}

// Build Shopify draft-order line items (and a display summary) for a set of products,
// rolling every priced product into one order. Products without a variant fall back to a
// custom line titled with the product name; setup and freight become their own lines.
export function draftOrderLinesForProducts(products, quotes, currency) {
  const lineItems = [], summary = [], skipped = [];
  let amountCents = 0;
  for (const product of products) {
    const terms = productCommercials(product, quotes);
    if (!terms.priced) { skipped.push({ productId: product.id, title: product.title, reason: 'No units and wholesale price yet' }); continue; }
    const main = { quantity: terms.units, priceOverride: { amount: (terms.unitPriceCents / 100).toFixed(2), currencyCode: currency } };
    if (product.shopify_variant_id) main.variantId = product.shopify_variant_id; else { main.title = product.title; main.requiresShipping = true; }
    lineItems.push(main);
    if (terms.setupCents > 0) lineItems.push({ title: `Setup — ${product.title}`, quantity: 1, requiresShipping: false, priceOverride: { amount: (terms.setupCents / 100).toFixed(2), currencyCode: currency } });
    if (terms.freightCents > 0) lineItems.push({ title: `Freight — ${product.title}`, quantity: 1, requiresShipping: false, priceOverride: { amount: (terms.freightCents / 100).toFixed(2), currencyCode: currency } });
    amountCents += terms.lineTotalCents;
    summary.push({
      productId: product.id, title: product.title, units: terms.units, unitPriceCents: terms.unitPriceCents,
      setupCents: terms.setupCents, freightCents: terms.freightCents, lineTotalCents: terms.lineTotalCents,
      committed: terms.committed, estimated: terms.estimated, hasVariant: Boolean(product.shopify_variant_id)
    });
  }
  return { lineItems, summary, skipped, amountCents, currency };
}
