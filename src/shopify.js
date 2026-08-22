const domain = () => String(process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
const token = () => process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const version = () => process.env.SHOPIFY_API_VERSION || '2026-07';

export const shopifyConfigured = () => Boolean(domain() && token());

export async function shopifyGraphql(query, variables = {}) {
  if (!shopifyConfigured()) throw Object.assign(new Error('Connect Shopify to Railway to enable live sync'), { statusCode: 503 });
  const response = await fetch(`https://${domain()}/admin/api/${version()}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token() },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Shopify request failed (${response.status})`), { statusCode: 502 });
  if (payload.errors?.length) throw Object.assign(new Error(payload.errors.map(x => x.message).join('; ')), { statusCode: 502 });
  return payload.data;
}

export const PRODUCT_SYNC_QUERY = `query SyncClientProducts($query: String!) {
  products(first: 50, query: $query) {
    nodes {
      id title handle status updatedAt totalInventory
      variants(first: 100) { nodes { id title sku price inventoryQuantity } }
    }
  }
}`;

export const DRAFT_ORDER_CREATE = `mutation CreateClientDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id name invoiceUrl status totalPriceSet { shopMoney { amount currencyCode } } }
    userErrors { field message }
  }
}`;

export const DRAFT_INVOICE_SEND = `mutation SendClientDraftInvoice($id: ID!, $email: EmailInput) {
  draftOrderInvoiceSend(id: $id, email: $email) {
    draftOrder { id name invoiceUrl status }
    userErrors { field message }
  }
}`;

export const DRAFT_ORDER_STATUS = `query SyncDraftOrderStatus($id: ID!) {
  draftOrder(id: $id) {
    id name invoiceUrl status updatedAt
    order { id name displayFinancialStatus displayFulfillmentStatus }
  }
}`;

export function requireNoUserErrors(payload) {
  if (payload?.userErrors?.length) throw Object.assign(new Error(payload.userErrors.map(x => x.message).join('; ')), { statusCode: 422 });
  return payload;
}
