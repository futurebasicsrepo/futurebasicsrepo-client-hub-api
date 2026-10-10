// The tech pack as a Shopify product. Two halves:
//   buildShopifyExport(...)  turns a published pack into a plan (options, variants, metafields, pictures) and says what is missing; it touches nothing.
//   exportToShopify(...)     carries a plan out through whatever `exec(query, variables)` it is given, so the same engine serves the one connected store today and a
//                            merchant's own store when the install flow exists.
// Who owns what after the first export: the pack owns the specification (SKU, barcode, cost, weight, HS code, origin, the techpack.* metafields); Shopify owns what the
// merchant sells it as (title, description, tags, status) and the price once it has been changed there. A re-export therefore never deletes anything, never touches
// title, description, tags or status, and only sets a price when the pack's price moved since the last export.
import './commercial.js';
import { normalizeTechPack } from './techpack.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null; };
const NS = 'techpack';
const mf = (key, value, type) => (value === '' || value == null ? null : { namespace: NS, key, value: String(value), type });

export const PRODUCT_SET = `mutation ExportPackProductSet($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) {
    product { id handle status variants(first: 250) { nodes { id sku } } }
    userErrors { field message code }
  }
}`;
export const PACK_VARIANTS_QUERY = `query PackProductVariants($id: ID!) {
  product(id: $id) { id handle status variants(first: 250) { nodes { id sku selectedOptions { name value } } } }
}`;
export const PACK_PRODUCT_UPDATE = `mutation ExportPackProductUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id handle status } userErrors { field message } }
}`;
export const PACK_VARIANTS_CREATE = `mutation ExportPackVariantsCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id sku } userErrors { field message code } }
}`;
export const PACK_VARIANTS_UPDATE = `mutation ExportPackVariantsUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id sku } userErrors { field message code } }
}`;

// pack: published pack data. product: { title, client_slug?, vendor? }. cost: unit cost in dollars from the accepted quote or price tier ('' when unknown).
// media: [{ key, kind, name, mime, url }] signed links. hubUrl: link back to the pack. now: ISO time.
export function buildShopifyExport({ pack, product = {}, version = 1, cost = '', media = [], hubUrl = '', now = new Date().toISOString() }) {
  const d = normalizeTechPack(pack), C = globalThis.FBCommercial, c = C.normalize(d.commercial), issues = [];
  const err = text => issues.push({ level: 'error', text }), warn = text => issues.push({ level: 'warning', text });
  const variantsIn = C.syncVariants(d); // every size and colour in the pack, the team's own SKUs, barcodes and prices kept, blanks filled
  const sizes = [...new Set(variantsIn.map(v => v.size).filter(Boolean))], colours = [...new Set(variantsIn.map(v => v.colour).filter(Boolean))];
  const options = [sizes.length && { name: 'Size', values: sizes }, colours.length && { name: 'Colour', values: colours }].filter(Boolean);
  const origin = C.countryCode(d.care.countryOfOrigin), hs = String(c.hsCode || '').replace(/\D/g, ''), weight = Number(c.weightGrams) || 0, costOk = money(cost);
  const seenSku = new Set(), variants = variantsIn.map(v => {
    const saved = v, price = money(saved.price || c.retailPrice), compare = money(c.compareAtPrice);
    if (!saved.sku) err(`No SKU for ${[v.colour, v.size].filter(Boolean).join(' ') || 'the product'}: press Generate SKUs on the Materials tab.`);
    else if (seenSku.has(saved.sku)) err(`The SKU ${saved.sku} is used twice.`); else seenSku.add(saved.sku);
    if (!price) err(`No price for ${[v.colour, v.size].filter(Boolean).join(' ') || 'the product'}: set a retail price on the Materials tab.`);
    return { size: v.size, colour: v.colour, sku: saved.sku || '', barcode: saved.barcode || '', price: price || '0.00', compareAtPrice: compare && Number(compare) > Number(price || 0) ? compare : null,
      cost: costOk, weightGrams: weight || null, hs: hs || null, origin: origin || null };
  });
  if (!variants.length) err('The pack has no sizes or colours to make variants from.');
  if (variants.length > 250) err('Shopify takes up to 250 variants on one product.');
  if (!weight) warn('No weight: shipping rates will not work until one is set.');
  if (!hs) warn('No HS code: customs paperwork will have to be filled in by hand.');
  if (!origin) warn('No country of origin Shopify can read: write it under Labels, Packaging & Care.');
  if (!costOk) warn('No unit cost: margin will not show in Shopify.');
  if (variants.length && !variants.some(v => v.barcode)) warn('No barcodes yet.');
  const files = media.filter(m => ['hero', 'view', 'rendering'].includes(m.kind) && /^image\/(png|jpe?g|webp)$/i.test(m.mime)).slice(0, 8)
    .map((m, i) => ({ originalSource: m.url, contentType: 'IMAGE', alt: String(m.name || d.style.styleName || product.title || '').slice(0, 250), filename: `${String(d.style.styleNumber || 'pack').replace(/[^A-Za-z0-9-]/g, '')}-${i + 1}.${/png/i.test(m.mime) ? 'png' : /webp/i.test(m.mime) ? 'webp' : 'jpg'}` }));
  if (!files.length) warn('No pictures in the pack to put on the product.');
  const pom = d.pom.map(r => ({ code: r.code, name: r.name, how: r.how, tolerance: r.tolerance, values: r.values }));
  const metafields = [
    mf('style_number', d.style.styleNumber, 'single_line_text_field'), mf('pack_version', version, 'number_integer'), mf('pack_url', hubUrl, 'url'), mf('exported_at', now, 'date_time'),
    mf('fibre', d.care.fiber, 'single_line_text_field'), mf('care', d.care.instructions, 'multi_line_text_field'), mf('country_of_origin', d.care.countryOfOrigin, 'single_line_text_field'),
    mf('sizes', d.sizes.join(', '), 'single_line_text_field'),
    mf('materials', d.bom.length ? JSON.stringify(d.bom.map(r => ({ component: r.component, material: r.material, spec: r.spec, color: r.color, placement: r.placement }))) : '', 'json'),
    mf('construction', d.construction.length ? JSON.stringify(d.construction) : '', 'json'), mf('measurements', pom.length ? JSON.stringify({ sampleSize: d.style.sampleSize, points: pom }) : '', 'json'),
    mf('inspection', d.inspection.aql || d.inspection.standard ? JSON.stringify({ aql: d.inspection.aql, level: d.inspection.level, standard: d.inspection.standard }) : '', 'json')
  ].filter(Boolean);
  const description = String(d.style.description || '').split(/\n{2,}|\r\n\r\n/).map(s => s.trim()).filter(Boolean).map(s => `<p>${esc(s)}</p>`).join('');
  return {
    title: String(d.style.styleName || product.title || 'Untitled product').slice(0, 255), descriptionHtml: description, vendor: product.vendor || 'Future Basics', productType: String(d.style.category || '').slice(0, 255),
    tags: ['tech-pack', d.style.styleNumber, d.style.season, product.client_slug].filter(Boolean).map(String).slice(0, 10), options, variants, metafields, files, issues,
    errors: issues.filter(i => i.level === 'error'), warnings: issues.filter(i => i.level === 'warning'), version
  };
}

// What the plan will do, in the words a person reads before pressing the button.
export function planSummary(plan, existing = null) {
  return { title: plan.title, version: plan.version, mode: existing ? 'update' : 'create', options: plan.options.map(o => `${o.name}: ${o.values.join(', ')}`), variants: plan.variants.length, files: plan.files.length, metafields: plan.metafields.length, warnings: plan.warnings.map(w => w.text), errors: plan.errors.map(e => e.text) };
}

const optionValues = v => [v.size && { optionName: 'Size', name: v.size }, v.colour && { optionName: 'Colour', name: v.colour }].filter(Boolean);
const inventoryItem = (v, { withSku = true } = {}) => ({ ...(withSku ? { sku: v.sku } : {}), tracked: true, requiresShipping: true, ...(v.cost ? { cost: v.cost } : {}), ...(v.weightGrams ? { measurement: { weight: { value: v.weightGrams, unit: 'GRAMS' } } } : {}), ...(v.hs ? { harmonizedSystemCode: v.hs } : {}), ...(v.origin ? { countryCodeOfOrigin: v.origin } : {}) });
const userErrors = (payload, what) => { const e = payload && payload.userErrors; if (e && e.length) throw Object.assign(new Error(`Shopify refused the ${what}: ${e.map(x => x.message).join('; ')}`), { statusCode: 422, userErrors: e }); return payload; };

// existing: { id, lastPrices: { sku: '89.00' } } when this pack was exported before, else null. exec(query, variables) → the data object.
export async function exportToShopify({ plan, exec, existing = null }) {
  if (plan.errors.length) throw Object.assign(new Error(plan.errors[0].text), { statusCode: 422, issues: plan.errors });
  if (!existing) {
    const input = { title: plan.title, descriptionHtml: plan.descriptionHtml, vendor: plan.vendor, productType: plan.productType, tags: plan.tags, status: 'DRAFT', metafields: plan.metafields,
      ...(plan.options.length ? { productOptions: plan.options.map(o => ({ name: o.name, values: o.values.map(name => ({ name })) })) } : {}),
      variants: plan.variants.map(v => ({ optionValues: optionValues(v).length ? optionValues(v) : [{ optionName: 'Title', name: 'Default Title' }], sku: v.sku, barcode: v.barcode || undefined, price: v.price, ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}), inventoryItem: inventoryItem(v, { withSku: false }) })),
      ...(plan.files.length ? { files: plan.files } : {}) };
    const data = await exec(PRODUCT_SET, { input });
    const p = userErrors(data.productSet, 'product').product;
    const prices = Object.fromEntries(plan.variants.map(v => [v.sku, v.price]));
    return { mode: 'create', productId: p.id, handle: p.handle, status: p.status, variants: { created: plan.variants.length, updated: 0, untouched: 0, notInPack: [] }, files: plan.files.length, lastPrices: prices };
  }
  const data = await exec(PACK_VARIANTS_QUERY, { id: existing.id });
  if (!data.product) throw Object.assign(new Error('That product is no longer in the store. Remove the link and export again to create a new one.'), { statusCode: 409 });
  const live = data.product.variants.nodes, bySku = new Map(live.filter(n => n.sku).map(n => [n.sku, n])), last = existing.lastPrices || {};
  // the specification and the techpack.* facts, never title, description, tags or status; nothing is removed
  userErrors((await exec(PACK_PRODUCT_UPDATE, { product: { id: existing.id, metafields: plan.metafields } })).productUpdate, 'product update');
  const toUpdate = [], toCreate = [], inPack = new Set();
  for (const v of plan.variants) {
    inPack.add(v.sku); const hit = bySku.get(v.sku);
    if (hit) toUpdate.push({ id: hit.id, barcode: v.barcode || undefined, ...(String(last[v.sku] ?? '') !== v.price ? { price: v.price } : {}), ...(v.compareAtPrice && String(last[v.sku] ?? '') !== v.price ? { compareAtPrice: v.compareAtPrice } : {}), inventoryItem: inventoryItem(v, { withSku: false }) });
    else toCreate.push({ optionValues: optionValues(v), barcode: v.barcode || undefined, price: v.price, ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}), inventoryItem: inventoryItem(v) });
  }
  if (toUpdate.length) userErrors((await exec(PACK_VARIANTS_UPDATE, { productId: existing.id, variants: toUpdate })).productVariantsBulkUpdate, 'variant update');
  if (toCreate.length) userErrors((await exec(PACK_VARIANTS_CREATE, { productId: existing.id, variants: toCreate })).productVariantsBulkCreate, 'new variants');
  const prices = { ...last, ...Object.fromEntries(plan.variants.filter(v => !bySku.has(v.sku) || String(last[v.sku] ?? '') !== v.price).map(v => [v.sku, v.price])) };
  return { mode: 'update', productId: existing.id, handle: data.product.handle, status: data.product.status, variants: { created: toCreate.length, updated: toUpdate.length, untouched: 0, notInPack: live.filter(n => n.sku && !inPack.has(n.sku)).map(n => n.sku) }, files: 0, lastPrices: prices,
    note: plan.files.length ? 'Pictures are added when the product is first created; change them in Shopify.' : '' };
}
