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

export async function shopifyGraphql(query, variables = {}) {
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
