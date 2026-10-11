// Pushing a build's products to the client's own commerce tool (Shopify, Square or Wix). Plain functions with the network passed in, so every rule here is tested without a store.
//
// A build that sells things carries a catalog: the products its site shows (name, price, picture, description). A push makes those products in the client's store. It only ever
// ADDS: a product that an earlier push made (matched by SKU) is left alone, so nothing the client has since edited in their store is overwritten, and nothing is deleted.
// Shopify products are made as drafts. Square and Wix have no draft state in these calls, so staff are told to look before they publish.
import { createHash } from 'node:crypto';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const MAX_ITEMS = 100;
export const PUSH_PLATFORMS = ['shopify', 'square', 'wix'];

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const httpUrl = v => { const s = String(v || '').trim(); if (!s) return ''; try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 500) : null; } catch { return null; } };
const money = v => { const s = String(v ?? '').trim().replace(/^\$/, '').replace(/,/g, ''); if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null; return Number(s).toFixed(2); };

// → { value: [items] } or { error }. An item: { name, description, price: '18.50', sku, imageUrl }.
export function cleanCatalog(list) {
  if (list === undefined || list === null) return { value: [] };
  if (!Array.isArray(list)) return { error: 'The catalog is a list of products' };
  if (list.length > MAX_ITEMS) return { error: `A build can sell up to ${MAX_ITEMS} products` };
  const out = [], seen = new Set();
  for (let n = 0; n < list.length; n++) {
    const it = list[n] && typeof list[n] === 'object' ? list[n] : {}, at = `Product ${n + 1}`;
    const name = clip(it.name, 150); if (!name) return { error: `${at} needs a name` };
    const price = money(it.price); if (price === null) return { error: `${at} (${name}) needs a price such as 18.50` };
    const imageUrl = httpUrl(it.imageUrl); if (imageUrl === null) return { error: `${at} (${name}): the picture must be a web address (https://…)` };
    let sku = clip(it.sku, 64).replace(/[^A-Za-z0-9._#-]/g, '-') || `${slug(name) || 'item'}-${n + 1}`;
    if (seen.has(sku.toLowerCase())) return { error: `${at} (${name}) has the same code (SKU) as another product: ${sku}` };
    seen.add(sku.toLowerCase());
    out.push({ name, description: String(it.description ?? '').replace(/\r/g, '').trim().slice(0, 2000), price, sku, imageUrl });
  }
  return { value: out };
}
// one product per line: Name | price | sku | picture address | description (everything after the first four bars)
export function catalogFromText(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [name = '', price = '', sku = '', imageUrl = '', ...rest] = l.split('|').map(x => x.trim()); return { name, price, sku, imageUrl, description: rest.join(' | ') }; });
}
export const catalogToText = items => (items || []).map(i => [i.name, i.price, i.sku, i.imageUrl, i.description].join(' | ').replace(/( \| )+$/, '')).join('\n');

// What a push will do, before it does it. `already`: { sku: externalId } from earlier pushes to the same store.
export function planPush(items, already = {}) {
  const make = [], skip = [];
  for (const it of items || []) (already[it.sku] ? skip : make).push(it);
  return { make, skip: skip.map(i => ({ sku: i.sku, name: i.name, reason: 'An earlier push already made it there, so it is left as the client has it.' })) };
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = text => String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');

// ---------- Shopify (the client's connected store, through the same call the tech-pack export uses) ----------
export const SHOPIFY_SET = `mutation PushBuildProduct($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) {
    product { id handle status }
    userErrors { field message code }
  }
}`;
export const shopifyInput = (it, build = {}) => ({
  title: it.name, descriptionHtml: html(it.description), vendor: build.name || 'Future Basics', status: 'DRAFT', tags: ['future-basics-build', slug(build.slug || build.name)].filter(Boolean),
  productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
  variants: [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], sku: it.sku, price: it.price }],
  ...(it.imageUrl ? { files: [{ originalSource: it.imageUrl, contentType: 'IMAGE', alt: it.name.slice(0, 250) }] } : {})
});
export async function pushToShopify({ items, exec, build = {} }) {
  const results = [];
  for (const it of items) {
    try {
      const data = await exec(SHOPIFY_SET, { input: shopifyInput(it, build) }), e = data?.productSet?.userErrors;
      if (e && e.length) { results.push({ sku: it.sku, name: it.name, outcome: 'failed', reason: e.map(x => x.message).join('; ') }); continue; }
      const p = data.productSet.product; results.push({ sku: it.sku, name: it.name, outcome: 'created', externalId: p.id, note: `draft ${p.handle || ''}`.trim() });
    } catch (err) { if (err.refused || /no longer lets this app in/i.test(err.message)) throw err; results.push({ sku: it.sku, name: it.name, outcome: 'failed', reason: String(err.message).slice(0, 200) }); }
  }
  return results;
}

// ---------- Square: one batch call, items and their single variation made together ----------
export const SQUARE_ORIGIN = 'https://connect.squareup.com', SQUARE_VERSION = '2026-09-16';
export const squareObjects = (items, currency = 'USD') => items.map(it => ({
  type: 'ITEM', id: `#${it.sku}`, present_at_all_locations: true,
  item_data: { name: it.name, ...(it.description ? { description: it.description.slice(0, 4096) } : {}), variations: [{ type: 'ITEM_VARIATION', id: `#${it.sku}-v`, present_at_all_locations: true,
    item_variation_data: { item_id: `#${it.sku}`, name: 'Regular', sku: it.sku, pricing_type: 'FIXED_PRICING', price_money: { amount: Math.round(Number(it.price) * 100), currency } } }] }
}));
export async function pushToSquare({ items, token, currency = 'USD', origin = SQUARE_ORIGIN, version = SQUARE_VERSION, fetchImpl = fetch, key }) {
  if (!items.length) return [];
  const res = await fetchImpl(`${origin}/v2/catalog/batch-upsert`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Square-Version': version },
    body: JSON.stringify({ idempotency_key: String(key || createHash('sha256').update(items.map(i => i.sku).join()).digest('hex')).slice(0, 128), batches: [{ objects: squareObjects(items, currency) }] }) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Square no longer accepts the saved access token. Connect Square again.'), { refused: true, statusCode: 409 });
  if (!res.ok || (j.errors && j.errors.length && !(j.objects || []).length)) throw Object.assign(new Error(`Square refused it: ${(j.errors || []).map(e => e.detail || e.code).join('; ') || res.status}`.slice(0, 300)), { statusCode: 502 });
  const ids = new Map((j.id_mappings || []).map(m => [m.client_object_id, m.object_id]));
  return items.map(it => ids.get(`#${it.sku}`) ? { sku: it.sku, name: it.name, outcome: 'created', externalId: ids.get(`#${it.sku}`) } : { sku: it.sku, name: it.name, outcome: 'failed', reason: 'Square did not say it made this one' });
}

// ---------- Wix (Stores Catalog V3, one product per call; a picture is imported into the site's media first) ----------
export const WIX_ORIGIN = 'https://www.wixapis.com';
export const wixProduct = (it, mediaUrl = '') => ({
  name: it.name, productType: 'PHYSICAL', physicalProperties: {}, visible: true, ...(it.description ? { plainDescription: it.description } : {}),
  ...(mediaUrl ? { media: { itemsInfo: { items: [{ url: mediaUrl, altText: it.name.slice(0, 200) }] } } } : {}),
  variantsInfo: { variants: [{ sku: it.sku, price: { actualPrice: { amount: it.price } }, physicalProperties: {}, visible: true }] }
});
export async function pushToWix({ items, apiKey, siteId = '', origin = WIX_ORIGIN, fetchImpl = fetch }) {
  const headers = { 'Content-Type': 'application/json', Authorization: apiKey, ...(siteId ? { 'wix-site-id': siteId } : {}) }, results = [];
  const call = async (path, method, body) => { const r = await fetchImpl(`${origin}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }); const j = await r.json().catch(() => ({})); return { r, j }; };
  const first = await call('/stores/v3/provision/version', 'GET');
  if (first.r.status === 401 || first.r.status === 403) throw Object.assign(new Error('Wix no longer accepts the saved API key. Connect Wix again.'), { refused: true, statusCode: 409 });
  if (first.r.ok && JSON.stringify(first.j).includes('V1_CATALOG')) throw Object.assign(new Error('This Wix site uses the older Stores catalog (V1), which this push does not write to yet.'), { statusCode: 422 });
  for (const it of items) {
    try {
      let mediaUrl = '', note = '';
      if (it.imageUrl) { const m = await call('/site-media/v1/files/import', 'POST', { url: it.imageUrl, mimeType: /\.png(\?|$)/i.test(it.imageUrl) ? 'image/png' : 'image/jpeg', displayName: `${slug(it.name) || 'product'}.jpg`, mediaType: 'IMAGE' }); if (m.r.ok && m.j.file?.url && m.j.file.operationStatus !== 'FAILED') mediaUrl = m.j.file.url; else note = 'made without its picture (Wix could not import it)'; }
      const { r, j } = await call('/stores/v3/products', 'POST', { product: wixProduct(it, mediaUrl) });
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Wix no longer accepts the saved API key. Connect Wix again.'), { refused: true, statusCode: 409 });
      if (!r.ok || !j.product?.id) { results.push({ sku: it.sku, name: it.name, outcome: 'failed', reason: String(j.message || j.details?.validationError?.fieldViolations?.[0]?.description || `Wix answered ${r.status}`).slice(0, 200) }); continue; }
      results.push({ sku: it.sku, name: it.name, outcome: 'created', externalId: j.product.id, ...(note ? { note } : {}) });
    } catch (err) { if (err.refused) throw err; results.push({ sku: it.sku, name: it.name, outcome: 'failed', reason: String(err.message).slice(0, 200) }); }
  }
  return results;
}

export const summarize = results => ({ created: results.filter(r => r.outcome === 'created').length, failed: results.filter(r => r.outcome === 'failed').length, skipped: results.filter(r => r.outcome === 'skipped').length });
