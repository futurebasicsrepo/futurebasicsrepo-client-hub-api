// Tournament entry fees through incha's Shopify store.
//
// Flow: a team manager asks to pay → we create a Shopify draft order (one custom line item, no shipping,
// tagged and stamped with the entry's reference) and send them to its invoice checkout. When Shopify
// takes the money it calls our webhook (orders/paid); we verify the HMAC signature and mark the entry
// paid. Cancellations and refunds mark it refunded. Nothing here stores card data; Shopify owns checkout.
//
// Configure with SHOPIFY_STORE_DOMAIN (e.g. incha.myshopify.com), SHOPIFY_ADMIN_TOKEN (a custom app's
// Admin API token with write_draft_orders + read_orders), SHOPIFY_WEBHOOK_SECRET, and optionally
// SHOPIFY_API_VERSION. Until those are set the gateway reports itself unconfigured and organizers can
// still record cash/comp payments by hand.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_API_VERSION = '2026-07';
export const REFERENCE_KEY = 'incha_entry';
export const TAG_PREFIX = 'incha-entry-';

const DRAFT_ORDER_CREATE = `
  mutation InchaEntryCheckout($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id name invoiceUrl }
      userErrors { field message }
    }
  }`;

/** "12.50" / 12.5 → 1250 cents (null when not a number). */
export const toCents = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const fromCents = cents => (cents / 100).toFixed(2);

/** The entry reference stamped on an order: a note attribute, or failing that, a tag. */
export function orderReference(order) {
  const attrs = order?.note_attributes ?? order?.customAttributes ?? [];
  const hit = attrs.find(a => (a.name ?? a.key) === REFERENCE_KEY);
  if (hit?.value) return String(hit.value);
  const tags = Array.isArray(order?.tags) ? order.tags : String(order?.tags ?? '').split(',');
  const tag = tags.map(t => t.trim()).find(t => t.startsWith(TAG_PREFIX));
  return tag ? tag.slice(TAG_PREFIX.length) : null;
}

export function createShopifyGateway({
  storeDomain = process.env.SHOPIFY_STORE_DOMAIN,
  adminToken = process.env.SHOPIFY_ADMIN_TOKEN,
  webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET,
  apiVersion = process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION,
  fetchImpl = globalThis.fetch
} = {}) {
  const domain = String(storeDomain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const configured = Boolean(domain && adminToken && webhookSecret);

  return {
    provider: 'shopify',
    configured,

    /** Creates a one-off checkout for an entry fee. Returns { url, draftOrderId, name }. */
    async createCheckout({ reference, title, amountCents, currency = 'USD', email, note }) {
      if (!configured) throw Object.assign(new Error('Online payment isn’t set up yet.'), { statusCode: 503 });
      const input = {
        lineItems: [{
          title: String(title).slice(0, 255),
          quantity: 1,
          originalUnitPriceWithCurrency: { amount: fromCents(amountCents), currencyCode: currency },
          requiresShipping: false,
          taxable: false,
          customAttributes: [{ key: REFERENCE_KEY, value: reference }]
        }],
        customAttributes: [{ key: REFERENCE_KEY, value: reference }],
        tags: ['incha-tournament', `${TAG_PREFIX}${reference}`],
        note: note ? String(note).slice(0, 5000) : undefined,
        email: email || undefined,
        presentmentCurrencyCode: currency
      };
      const res = await fetchImpl(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shopify-access-token': adminToken },
        body: JSON.stringify({ query: DRAFT_ORDER_CREATE, variables: { input } }),
        signal: AbortSignal.timeout(15_000)
      });
      const body = await res.json().catch(() => ({}));
      const result = body?.data?.draftOrderCreate;
      const problem = !res.ok ? `Shopify ${res.status}` : body?.errors?.[0]?.message || result?.userErrors?.[0]?.message;
      if (problem || !result?.draftOrder?.invoiceUrl) {
        throw Object.assign(new Error(`Couldn’t start checkout (${problem || 'no invoice URL'}).`), { statusCode: 502 });
      }
      return { url: result.draftOrder.invoiceUrl, draftOrderId: result.draftOrder.id, name: result.draftOrder.name };
    },

    /** Checks X-Shopify-Hmac-Sha256: base64 HMAC-SHA256 of the raw request body with the webhook secret. */
    verifyWebhook(rawBody, signature) {
      if (!webhookSecret || !rawBody || !signature) return false;
      const expected = createHmac('sha256', webhookSecret).update(rawBody).digest();
      let given;
      try { given = Buffer.from(String(signature), 'base64'); } catch { return false; }
      return given.length === expected.length && timingSafeEqual(given, expected);
    },

    /** The bits of an order webhook we act on. */
    parseOrder(order) {
      return {
        reference: orderReference(order),
        orderId: order?.admin_graphql_api_id ?? (order?.id != null ? String(order.id) : null),
        orderName: order?.name ?? null,
        amountCents: toCents(order?.current_total_price ?? order?.total_price),
        currency: order?.currency ?? null,
        financialStatus: order?.financial_status ?? null,
        cancelled: Boolean(order?.cancelled_at)
      };
    }
  };
}
