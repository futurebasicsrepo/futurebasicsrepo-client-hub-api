// Payments: one row per order a client has paid in the store. The ledger is ours, so a card can say what a client has paid without
// waiting on a manual Shopify sync, and the Platform page can say whether the sync is keeping up.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const attr = (order, key) => {
  for (const line of order?.lineItems?.nodes || []) for (const a of line?.customAttributes || []) if (String(a?.key).toLowerCase() === key.toLowerCase()) return String(a.value || '');
  return '';
};
const cents = amount => Math.round(Number(amount || 0) * 100);

// A Shopify order, read into the shape the ledger keeps. Tech pack checkouts carry the product's address in a line-item attribute, which is
// how a payment finds its pack even when the customer's email differs from the room's.
export function paymentFromOrder(order, { membershipProductId = '' } = {}) {
  if (!order?.id) return null;
  const packUrl = attr(order, 'Tech pack'), lineProducts = (order.lineItems?.nodes || []).map(l => l?.product?.id).filter(Boolean);
  const tags = (order.tags || []).map(t => String(t).toLowerCase());
  const isPack = Boolean(packUrl) || tags.includes('fb-tech-pack');
  const isMembership = !isPack && membershipProductId && lineProducts.some(id => String(id) === String(membershipProductId) || String(id).endsWith(`/${membershipProductId}`));
  const first = order.lineItems?.nodes?.[0]?.title || 'Store order', more = (order.lineItems?.nodes?.length || 0) - 1;
  const productName = attr(order, 'Product');
  const money = order.totalPriceSet?.shopMoney || {};
  return {
    orderId: order.id,
    orderName: order.name || '',
    amountCents: cents(money.amount),
    currency: money.currencyCode || 'USD',
    paidAt: order.processedAt || order.createdAt || order.updatedAt || null,
    updatedAt: order.updatedAt || null,
    kind: isPack ? 'tech-pack' : isMembership ? 'membership' : 'order',
    title: isPack ? `Tech pack${productName ? ` · ${productName}` : ''}` : isMembership ? 'Studio membership' : `${first}${more > 0 ? ` + ${more} more` : ''}`,
    productId: UUID.test(packUrl) ? packUrl.match(UUID)[0].toLowerCase() : null,
    email: String(order.customer?.email || order.email || '').trim().toLowerCase(),
    customerId: order.customer?.id || null
  };
}

// Which room an order belongs to: the linked store customer first, then the pack's own product, then an exact email on the room.
export async function clientForPayment(q, p) {
  if (p.customerId) { const r = (await q.query('select id,shopify_customer_id,contact_email,allowed_emails from clients where shopify_customer_id=$1 limit 1', [p.customerId])).rows[0]; if (r) return r; }
  if (p.productId) { const r = (await q.query('select c.id,c.shopify_customer_id,c.contact_email,c.allowed_emails from products pr join clients c on c.id=pr.client_id where pr.id=$1', [p.productId])).rows[0]; if (r) return r; }
  if (p.email) { const r = (await q.query(`select id,shopify_customer_id,contact_email,allowed_emails from clients where slug<>'future-basics' and (lower(contact_email)=$1 or $1=any(allowed_emails)) order by (status='active') desc limit 1`, [p.email])).rows[0]; if (r) return r; }
  return null;
}

// Inserts the payment once per order. A row that came from the one-time backfill (price assumed, no order number) is completed by the real order.
export async function recordPayment(q, { clientId, productId = null, techPackId = null, kind = 'order', title = '', amountCents, currency = 'USD', orderId = null, orderName = '', paidAt = null, source = 'sync' }) {
  const r = await q.query(`insert into payments(client_id,product_id,tech_pack_id,kind,title,amount_cents,currency,shopify_order_id,shopify_order_name,paid_at,source)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::timestamptz,now()),$11)
    on conflict(shopify_order_id) where shopify_order_id is not null do update set amount_cents=excluded.amount_cents,shopify_order_name=coalesce(nullif(excluded.shopify_order_name,''),payments.shopify_order_name),
      title=coalesce(nullif(excluded.title,''),payments.title),paid_at=excluded.paid_at,source=excluded.source where payments.source='backfill'
    returning (xmax=0) as inserted`, [clientId, productId, techPackId, kind, title || null, amountCents, currency, orderId, orderName || null, paidAt, source]);
  return { inserted: r.rows[0]?.inserted === true, changed: r.rowCount > 0 };
}

// The one-time fill: packs already marked paid before there was a ledger. The price is what the pack was sold at; the real order completes the row later.
export async function backfillTechPackPayments(q, priceCents) {
  const r = await q.query(`insert into payments(client_id,product_id,tech_pack_id,kind,title,amount_cents,currency,shopify_order_id,paid_at,source)
    select tp.client_id,tp.product_id,tp.id,'tech-pack','Tech pack · '||p.title,$1,'USD',tp.pay_order_id,tp.paid_at,'backfill'
    from tech_packs tp join products p on p.id=tp.product_id
    where tp.paid_at is not null and tp.billing='single' and not exists(select 1 from payments x where x.tech_pack_id=tp.id or (tp.pay_order_id is not null and x.shopify_order_id=tp.pay_order_id))`, [priceCents]);
  return r.rowCount;
}

// What the Platform page shows about the sync, from the sync's own state and the ledger.
export function paymentSyncStatus({ configured, state = {}, stats = {}, now = Date.now(), everyMs = 5 * 60 * 1000 }) {
  if (!configured) return { status: 'off', summary: 'Not connected, so no payments can be read from the store.' };
  const last = state.lastOkAt ? new Date(state.lastOkAt).getTime() : 0, age = last ? now - last : null;
  if (state.lastError && (!last || age > 3 * everyMs)) return { status: 'down', summary: `The payment sync is failing: ${state.lastError}`.slice(0, 220) };
  if (stats.paidButLocked > 0) return { status: 'warn', summary: `${stats.paidButLocked} tech ${stats.paidButLocked === 1 ? 'pack was' : 'packs were'} paid for in the store but ${stats.paidButLocked === 1 ? 'is' : 'are'} still locked.` };
  if (!last) return { status: 'warn', summary: 'The payment sync has not completed a run yet.' };
  if (age > 4 * everyMs) return { status: 'warn', summary: `The last successful sync was ${Math.round(age / 60000)} minutes ago; it should run every ${Math.round(everyMs / 60000)}.` };
  if (state.lastError) return { status: 'warn', summary: `The last run failed (${state.lastError}); an earlier one succeeded ${Math.round(age / 60000)} minutes ago.` };
  return { status: 'ok', summary: stats.count ? `Reading the store every ${Math.round(everyMs / 60000)} minutes. ${stats.count} ${stats.count === 1 ? 'payment' : 'payments'} recorded.` : `Reading the store every ${Math.round(everyMs / 60000)} minutes. No payments recorded yet.` };
}
