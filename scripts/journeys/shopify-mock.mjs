// A stand-in for the Shopify Admin API, for the journeys only: the parts the payment sync and the Platform page read, plus a few controls
// to put orders in the "store" and to make it fail. Started by run.sh; the server under test points at it with SHOPIFY_API_ORIGIN.
import http from 'node:http';
const port = Number(process.argv[2] || 3126);
const orders = [], products = new Map(), state = { failing: false, n: 1000 };
// Merchant stores (tokens from the authorization-code install) each get their own catalogue; the server's own token keeps the main one.
const stores = new Map(), revoked = new Set(), hooks = new Map();
// a token "mock-merchant-x~2" is a reconnect of the same store as "mock-merchant-x": the catalogue is the store's, not the token's
const pmap = tok => { const k = String(tok).split('~')[0]; return String(tok).startsWith('mock-merchant-') ? (stores.get(k) || stores.set(k, new Map()).get(k)) : products; };
const allMaps = () => [products, ...stores.values()];
const read = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const customerIdFor = email => `gid://shopify/Customer/${[...email].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1_000_000, 7)}`;
const shape = o => ({ id: o.id, name: o.name, createdAt: o.createdAt, processedAt: o.processedAt, updatedAt: o.updatedAt, displayFinancialStatus: 'PAID', email: o.email, tags: o.tags,
  totalPriceSet: { shopMoney: { amount: o.amount.toFixed(2), currencyCode: 'USD' } }, customer: { id: o.customerId, email: o.email }, lineItems: { nodes: [{ title: o.title, product: o.productGid ? { id: o.productGid } : null, customAttributes: o.attrs }] } });

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0], body = await read(req);
  if (url === '/admin/oauth/access_token') {
    if (body.trim().startsWith('{')) { // the install: authorization code → offline token for that store
      const x = JSON.parse(body); if (!x.code || /^bad/.test(x.code)) return send(res, 400, { error: 'invalid_request', error_description: 'The authorization code was not valid' });
      return send(res, 200, { access_token: `mock-merchant-${x.code}`, scope: /^noscope/.test(x.code) ? 'read_products' : 'read_products,write_products' });
    }
    return send(res, 200, { access_token: 'mock-token', scope: 'read_orders', expires_in: 86399 });
  }
  if (url === '/__mock/revoke' && req.method === 'POST') { revoked.add(JSON.parse(body || '{}').token); return send(res, 200, { ok: true }); }
  if (url === '/__mock/webhooks') return send(res, 200, { hooks: Object.fromEntries(hooks) });
  if (url === '/__mock/orders' && req.method === 'POST') {
    const x = JSON.parse(body || '{}'), now = x.updatedAt || new Date().toISOString(), n = ++state.n, email = String(x.email || '').toLowerCase();
    const o = { id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: now, processedAt: now, updatedAt: now, email, amount: Number(x.amount ?? 48), tags: x.tags || (x.productId ? ['future-basics-client-hub', 'fb-tech-pack'] : []),
      customerId: x.customerId || customerIdFor(email), title: x.title || (x.productId ? 'Tech pack from a photo' : 'Store order'), productGid: x.productGid || '',
      attrs: x.productId ? [{ key: 'Product', value: x.productTitle || 'Layer runner' }, { key: 'Tech pack', value: `http://127.0.0.1:${x.hubPort || 3127}/tech-packs/${x.productId}` }] : [] };
    orders.push(o); return send(res, 201, shape(o));
  }
  if (url === '/__mock/fail' && req.method === 'POST') { state.failing = JSON.parse(body || '{}').on === true; return send(res, 200, { failing: state.failing }); }
  if (url === '/__mock/state') return send(res, 200, { orders: orders.length, failing: state.failing });
  if (url === '/__mock/products') { const tok = new URL(req.url, 'http://x').searchParams.get('token') || ''; return send(res, 200, { products: [...(tok ? pmap(tok) : products).values()] }); }
  if (url === '/__mock/product-edit' && req.method === 'POST') { // the merchant changes things in the store: { id, price?, title?, addVariant? }
    const x = JSON.parse(body || '{}'), p = allMaps().map(m => m.get(x.id)).find(Boolean); if (!p) return send(res, 404, { error: 'no such product' });
    if (x.title) p.title = x.title; if (x.price) p.variants.forEach(v => { v.price = x.price; }); if (x.addVariant) p.variants.push({ id: `gid://shopify/ProductVariant/${++state.n}`, sku: x.addVariant, price: '1.00', selectedOptions: [], inventoryItem: {} });
    return send(res, 200, p);
  }
  if (!url.endsWith('/graphql.json')) return send(res, 404, { error: 'not found' });
  const tokenHeader = String(req.headers['x-shopify-access-token'] || ''), P = pmap(tokenHeader);
  if (revoked.has(tokenHeader)) return send(res, 401, { errors: 'Invalid API key or access token' });
  if (state.failing) return send(res, 500, { errors: [{ message: 'mock outage' }] });
  const { query = '', variables = {} } = JSON.parse(body || '{}'), name = (query.match(/(?:query|mutation)\s+(\w+)/) || [])[1] || '';
  if (name === 'PackShopInfo') return send(res, 200, { data: { shop: { name: 'Mock Merchant Store', myshopifyDomain: 'merchant.myshopify.com', currencyCode: 'USD' }, currentAppInstallation: { accessScopes: [{ handle: 'read_products' }, { handle: 'write_products' }] } } });
  if (name === 'PackAppUninstalledWebhook') { hooks.set(tokenHeader, variables.uri); return send(res, 200, { data: { webhookSubscriptionCreate: { webhookSubscription: { id: 'gid://shopify/WebhookSubscription/1' }, userErrors: [] } } }); }
  if (name === 'ClientHubConnection') return send(res, 200, { data: { shop: { name: 'Mock Store', myshopifyDomain: 'mock.myshopify.com' } } });
  if (name === 'ClientHubScopes') return send(res, 200, { data: { currentAppInstallation: { accessScopes: ['read_products', 'write_products', 'read_inventory', 'read_customers', 'write_draft_orders', 'read_draft_orders', 'read_orders'].map(handle => ({ handle })) } } });
  if (name === 'PaidOrders') {
    const since = (String(variables.query || '').match(/updated_at:>='([^']+)'/) || [])[1] || '1970-01-01', from = Number(variables.after || 0);
    const all = orders.filter(o => o.updatedAt >= since).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)), page = all.slice(from, from + 50), more = from + 50 < all.length;
    return send(res, 200, { data: { orders: { pageInfo: { hasNextPage: more, endCursor: more ? String(from + 50) : null }, nodes: page.map(shape) } } });
  }
  if (name === 'SyncClientCustomer') {
    const mine = orders.filter(o => o.customerId === variables.id);
    if (!mine.length) return send(res, 200, { data: { customer: null } });
    return send(res, 200, { data: { customer: { id: variables.id, displayName: mine[0].email, firstName: '', lastName: '', numberOfOrders: String(mine.length), defaultEmailAddress: { emailAddress: mine[0].email }, defaultPhoneNumber: null, amountSpent: { amount: mine.reduce((a, o) => a + o.amount, 0).toFixed(2), currencyCode: 'USD' }, defaultAddress: null } } });
  }
  if (name === 'ClientCustomerByEmail') {
    const email = (String(variables.query || '').match(/"([^"]+)"/) || [])[1] || '', hit = orders.find(o => o.email === email.toLowerCase());
    return send(res, 200, { data: { customers: { nodes: hit ? [{ id: hit.customerId, email: hit.email, displayName: hit.email }] : [] } } });
  }
  // ---- products: the parts the tech pack export uses ----
  const vOut = v => ({ id: v.id, sku: v.sku, selectedOptions: v.selectedOptions });
  const optsOf = vals => (vals || []).map(o => ({ name: o.optionName, value: o.name }));
  if (name === 'ExportPackProductSet') {
    const i = variables.input, id = `gid://shopify/Product/${++state.n}`;
    if (!i.title) return send(res, 200, { data: { productSet: { product: null, userErrors: [{ field: ['input', 'title'], message: 'Title can\'t be blank', code: 'BLANK' }] } } });
    const p = { id, handle: String(i.title).toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: i.status || 'DRAFT', title: i.title, descriptionHtml: i.descriptionHtml, vendor: i.vendor, productType: i.productType, tags: i.tags, options: i.productOptions || [], metafields: i.metafields || [], files: i.files || [],
      variants: (i.variants || []).map(v => ({ id: `gid://shopify/ProductVariant/${++state.n}`, sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice, barcode: v.barcode, inventoryItem: v.inventoryItem || {}, selectedOptions: optsOf(v.optionValues) })) };
    P.set(id, p); return send(res, 200, { data: { productSet: { product: { id, handle: p.handle, status: p.status, variants: { nodes: p.variants.map(vOut) } }, userErrors: [] } } });
  }
  if (name === 'PackProductVariants') { const p = P.get(variables.id); return send(res, 200, { data: { product: p ? { id: p.id, handle: p.handle, status: p.status, variants: { nodes: p.variants.map(vOut) } } : null } }); }
  if (name === 'ExportPackProductUpdate') { const x = variables.product, p = P.get(x.id); if (!p) return send(res, 200, { data: { productUpdate: { product: null, userErrors: [{ field: ['id'], message: 'Product not found' }] } } });
    for (const k of ['title', 'descriptionHtml', 'tags', 'status', 'vendor']) if (k in x) p[k] = x[k]; for (const m of x.metafields || []) { const at = p.metafields.findIndex(y => y.namespace === m.namespace && y.key === m.key); if (at >= 0) p.metafields[at] = m; else p.metafields.push(m); }
    return send(res, 200, { data: { productUpdate: { product: { id: p.id, handle: p.handle, status: p.status }, userErrors: [] } } }); }
  if (name === 'ExportPackVariantsUpdate') { const p = P.get(variables.productId); for (const v of variables.variants) { const t = p.variants.find(y => y.id === v.id); if (!t) continue; if (v.price) t.price = v.price; if (v.compareAtPrice) t.compareAtPrice = v.compareAtPrice; if ('barcode' in v) t.barcode = v.barcode; t.inventoryItem = { ...t.inventoryItem, ...(v.inventoryItem || {}) }; }
    return send(res, 200, { data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [] } } }); }
  if (name === 'ExportPackVariantsCreate') { const p = P.get(variables.productId); for (const v of variables.variants) p.variants.push({ id: `gid://shopify/ProductVariant/${++state.n}`, sku: v.inventoryItem && v.inventoryItem.sku, price: v.price, barcode: v.barcode, inventoryItem: v.inventoryItem || {}, selectedOptions: optsOf(v.optionValues) });
    return send(res, 200, { data: { productVariantsBulkCreate: { productVariants: [], userErrors: [] } } }); }
  return send(res, 200, { data: {} });
}).listen(port, '127.0.0.1');
