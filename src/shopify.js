import { timed } from './telemetry.js';
const domain = () => String(process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
const staticToken = () => process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const version = () => process.env.SHOPIFY_API_VERSION || '2026-07';
let cachedToken={value:'',expiresAt:0},tokenRequest=null;

export const shopifyConfigured = () => Boolean(domain() && (staticToken() || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)));

async function accessToken(){
  if(staticToken())return staticToken();
  if(cachedToken.value&&Date.now()<cachedToken.expiresAt-300_000)return cachedToken.value;
  if(tokenRequest)return tokenRequest;
  tokenRequest=(async()=>{
    const response=await fetch(`https://${domain()}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
      grant_type:'client_credentials',client_id:process.env.SHOPIFY_CLIENT_ID||'',client_secret:process.env.SHOPIFY_CLIENT_SECRET||''
    })});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.access_token)throw Object.assign(new Error(payload.error_description||payload.error||`Shopify authentication failed (${response.status})`),{statusCode:502});
    cachedToken={value:payload.access_token,expiresAt:Date.now()+Number(payload.expires_in||86399)*1000};return cachedToken.value;
  })();
  try{return await tokenRequest}finally{tokenRequest=null}
}

export const shopifyGraphql = (query, variables = {}) => timed('shopify', () => shopifyGraphqlRaw(query, variables));
async function shopifyGraphqlRaw(query, variables = {}) {
  if (!shopifyConfigured()) throw Object.assign(new Error('Connect Shopify to Railway to enable live sync'), { statusCode: 503 });
  const request=async()=>fetch(`https://${domain()}/admin/api/${version()}/graphql.json`, {method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':await accessToken()},body:JSON.stringify({query,variables})});
  let response=await request();
  if(response.status===401&&!staticToken()){cachedToken={value:'',expiresAt:0};response=await request()}
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Shopify request failed (${response.status})`), { statusCode: 502 });
  if (payload.errors?.length) throw Object.assign(new Error(payload.errors.map(x => x.message).join('; ')), { statusCode: 502 });
  return payload.data;
}

export const SHOP_CONNECTION_QUERY=`query ClientHubConnection { shop { name myshopifyDomain } }`;
// The scopes the store has granted this app right now (no scope needed to ask). The status route compares them with what the hub uses.
export const APP_SCOPES_QUERY=`query ClientHubScopes { currentAppInstallation { accessScopes { handle } } }`;
export const missingScopes=(granted,required)=>{const have=new Set((granted||[]).map(String));
  // write_x implies read_x in Shopify, so a granted write covers its read
  return (required||[]).filter(r=>!have.has(r)&&!have.has(r.replace(/^read_/,'write_')))};

export const PRODUCT_SYNC_QUERY = `query SyncClientProducts($query: String!) {
  products(first: 50, query: $query) {
    nodes {
      id title handle status updatedAt totalInventory descriptionHtml vendor productType
      featuredMedia { preview { image { url altText width height } } }
      variants(first: 100) { nodes { id title sku price inventoryQuantity } }
    }
  }
}`;

export const PRODUCT_IDS_SYNC_QUERY = `query SyncClientProductsById($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id title handle status updatedAt totalInventory descriptionHtml vendor productType
      featuredMedia { preview { image { url altText width height } } }
      variants(first: 100) { nodes { id title sku price inventoryQuantity } }
    }
  }
}`;

export const CUSTOMER_SYNC_QUERY = `query SyncClientCustomer($id: ID!) {
  customer(id: $id) {
    id displayName firstName lastName numberOfOrders
    defaultEmailAddress { emailAddress }
    defaultPhoneNumber { phoneNumber }
    amountSpent { amount currencyCode }
    defaultAddress { address1 address2 city provinceCode zip countryCodeV2 phone }
  }
}`;

export const PRODUCT_CREATE = `mutation PublishClientProduct($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id title handle status totalInventory variants(first: 1) { nodes { id } } }
    userErrors { field message }
  }
}`;

export const PRODUCT_UPDATE = `mutation UpdateClientProduct($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle status totalInventory variants(first: 1) { nodes { id } } }
    userErrors { field message }
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
    totalPriceSet { shopMoney { amount currencyCode } }
    order { id name displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } }
  }
}`;

// The customer on a paid order, asked for separately: it needs the read_customers scope, and a store without that
// scope must still see its orders as paid. Never fold this into the status query.
export const ORDER_CUSTOMER_QUERY = `query PaidOrderCustomer($id: ID!) {
  order(id: $id) { id customer { id email } }
}`;
// Find the store customer behind a room by email; exact match only, so a shared domain never links the wrong person.
export const CUSTOMER_BY_EMAIL_QUERY = `query ClientCustomerByEmail($query: String!) {
  customers(first: 10, query: $query) { nodes { id email displayName } }
}`;
export function exactCustomerMatch(nodes, emails) {
  const want = new Set((emails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean));
  if (!want.size) return null;
  return (nodes || []).find(n => n && n.id && want.has(String(n.email || '').trim().toLowerCase())) || null;
}

export const DRAFT_ORDER_DELETE = `mutation DeleteClientDraftOrder($input: DraftOrderDeleteInput!) {
  draftOrderDelete(input: $input) { deletedId userErrors { field message } }
}`;

export function requireNoUserErrors(payload) {
  if (payload?.userErrors?.length) throw Object.assign(new Error(payload.userErrors.map(x => x.message).join('; ')), { statusCode: 422 });
  return payload;
}

export function requireNoOrderCancelErrors(payload) {
  if (payload?.orderCancelUserErrors?.length) throw Object.assign(new Error(payload.orderCancelUserErrors.map(x => x.message).join('; ')), { statusCode: 422 });
  return payload;
}

// --- Make-an-offer: product context, draft-order checkout, capture/release ---

export const OFFER_CONTEXT_QUERY = `query OfferContext($variantId: ID!) {
  productVariant(id: $variantId) {
    id title price availableForSale
    image { url }
    product {
      id title handle status
      accepts: metafield(namespace: "custom", key: "accepts_offers") { value }
      minPercent: metafield(namespace: "custom", key: "offer_min_percent") { value }
    }
  }
}`;

export const ORDER_TRANSACTIONS_QUERY = `query OfferOrderTransactions($id: ID!) {
  order(id: $id) {
    id name displayFinancialStatus
    transactions(first: 10) {
      id kind status gateway
      amountSet { shopMoney { amount currencyCode } }
      parentTransaction { id }
    }
  }
}`;

export const ORDER_CAPTURE = `mutation CaptureOffer($input: OrderCaptureInput!) {
  orderCapture(input: $input) {
    transaction { id kind status }
    userErrors { field message }
  }
}`;

export const ORDER_CANCEL = `mutation CancelOfferOrder($orderId: ID!, $refund: Boolean!, $reason: OrderCancelReason!, $staffNote: String) {
  orderCancel(orderId: $orderId, restock: true, reason: $reason, refundMethod: { originalPaymentMethodsRefund: $refund }, notifyCustomer: false, staffNote: $staffNote) {
    job { id done }
    orderCancelUserErrors { field message }
  }
}`;

// --- Studio membership: the client's recent paid orders, to see whether a membership renewal is current ---
export const CUSTOMER_MEMBERSHIP_QUERY = `query ClientMembership($id: ID!, $query: String!) {
  customer(id: $id) {
    orders(first: 10, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes { id name createdAt displayFinancialStatus lineItems(first: 20) { nodes { title product { id } sellingPlan { name } } } }
    }
  }
}`;

// --- Tech pack checkout product: one hidden product, a variant per pack so checkout shows the client's own photo ---
export const VARIANTS_BULK_CREATE = `mutation CreatePackVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } }
}`;
export const VARIANTS_BULK_UPDATE = `mutation UpdatePackVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } }
}`;
export const VARIANTS_BULK_DELETE = `mutation DeletePackVariant($productId: ID!, $variantsIds: [ID!]!) {
  productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) { userErrors { field message } }
}`;
