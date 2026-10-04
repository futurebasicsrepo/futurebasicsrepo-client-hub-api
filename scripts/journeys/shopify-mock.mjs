// A stand-in for the Shopify Admin API, for the journeys only: the parts the payment sync and the Platform page read, plus a few controls
// to put orders in the "store" and to make it fail. Started by run.sh; the server under test points at it with SHOPIFY_API_ORIGIN.
import http from 'node:http';
const port = Number(process.argv[2] || 3126);
const orders = [], state = { failing: false, n: 1000 };
const read = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const customerIdFor = email => `gid://shopify/Customer/${[...email].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1_000_000, 7)}`;
const shape = o => ({ id: o.id, name: o.name, createdAt: o.createdAt, processedAt: o.processedAt, updatedAt: o.updatedAt, displayFinancialStatus: 'PAID', email: o.email, tags: o.tags,
  totalPriceSet: { shopMoney: { amount: o.amount.toFixed(2), currencyCode: 'USD' } }, customer: { id: o.customerId, email: o.email }, lineItems: { nodes: [{ title: o.title, product: o.productGid ? { id: o.productGid } : null, customAttributes: o.attrs }] } });

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0], body = await read(req);
  if (url === '/admin/oauth/access_token') return send(res, 200, { access_token: 'mock-token', scope: 'read_orders', expires_in: 86399 });
  if (url === '/__mock/orders' && req.method === 'POST') {
    const x = JSON.parse(body || '{}'), now = x.updatedAt || new Date().toISOString(), n = ++state.n, email = String(x.email || '').toLowerCase();
    const o = { id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: now, processedAt: now, updatedAt: now, email, amount: Number(x.amount ?? 48), tags: x.tags || (x.productId ? ['future-basics-client-hub', 'fb-tech-pack'] : []),
      customerId: x.customerId || customerIdFor(email), title: x.title || (x.productId ? 'Tech pack from a photo' : 'Store order'), productGid: x.productGid || '',
      attrs: x.productId ? [{ key: 'Product', value: x.productTitle || 'Layer runner' }, { key: 'Tech pack', value: `http://127.0.0.1:${x.hubPort || 3127}/tech-packs/${x.productId}` }] : [] };
    orders.push(o); return send(res, 201, shape(o));
  }
  if (url === '/__mock/fail' && req.method === 'POST') { state.failing = JSON.parse(body || '{}').on === true; return send(res, 200, { failing: state.failing }); }
  if (url === '/__mock/state') return send(res, 200, { orders: orders.length, failing: state.failing });
  if (!url.endsWith('/graphql.json')) return send(res, 404, { error: 'not found' });
  if (state.failing) return send(res, 500, { errors: [{ message: 'mock outage' }] });
  const { query = '', variables = {} } = JSON.parse(body || '{}'), name = (query.match(/(?:query|mutation)\s+(\w+)/) || [])[1] || '';
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
  return send(res, 200, { data: {} });
}).listen(port, '127.0.0.1');
