import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentFromOrder, paymentSyncStatus } from '../src/payments.js';
import { packItems, assistantRerunItems, sortItems } from '../src/queues.js';

const order = (extra = {}) => ({ id: 'gid://shopify/Order/9', name: '#1009', processedAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:05Z', email: 'Kyle@Example.com', tags: ['future-basics-client-hub', 'fb-tech-pack'],
  totalPriceSet: { shopMoney: { amount: '48.00', currencyCode: 'USD' } }, customer: { id: 'gid://shopify/Customer/5', email: 'kyle@example.com' },
  lineItems: { nodes: [{ title: 'Tech pack from a photo', product: null, customAttributes: [{ key: 'Product', value: 'V2 Runner' }, { key: 'Tech pack', value: 'https://hub.thefuturebasics.com/tech-packs/0a1b2c3d-1111-2222-3333-444455556666' }] }] }, ...extra });

test('a tech pack order is read into a payment with the product it was for', () => {
  const p = paymentFromOrder(order());
  assert.equal(p.kind, 'tech-pack'); assert.equal(p.amountCents, 4800); assert.equal(p.orderName, '#1009'); assert.equal(p.title, 'Tech pack · V2 Runner');
  assert.equal(p.productId, '0a1b2c3d-1111-2222-3333-444455556666'); assert.equal(p.email, 'kyle@example.com'); assert.equal(p.customerId, 'gid://shopify/Customer/5');
});
test('a membership and an ordinary store order are told apart', () => {
  const member = paymentFromOrder({ ...order({ tags: [] }), lineItems: { nodes: [{ title: 'Studio membership', product: { id: 'gid://shopify/Product/777' }, customAttributes: [] }] } }, { membershipProductId: '777' });
  assert.equal(member.kind, 'membership'); assert.equal(member.title, 'Studio membership');
  const mug = paymentFromOrder({ ...order({ tags: [] }), lineItems: { nodes: [{ title: 'Mug', product: { id: 'gid://shopify/Product/1' }, customAttributes: [] }, { title: 'Cap', product: null, customAttributes: [] }] } }, { membershipProductId: '777' });
  assert.equal(mug.kind, 'order'); assert.equal(mug.title, 'Mug + 1 more'); assert.equal(mug.productId, null);
});
test('odd orders never throw', () => {
  assert.equal(paymentFromOrder(null), null); assert.equal(paymentFromOrder({}), null);
  const bare = paymentFromOrder({ id: 'x', totalPriceSet: null, lineItems: null });
  assert.equal(bare.amountCents, 0); assert.equal(bare.kind, 'order');
});

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0), min = m => new Date(NOW - m * 60000).toISOString();
test('payment sync status: honest in every state', () => {
  const s = (o) => paymentSyncStatus({ configured: true, now: NOW, ...o });
  assert.equal(paymentSyncStatus({ configured: false }).status, 'off');
  assert.equal(s({ state: { lastOkAt: min(2) }, stats: { count: 3 } }).status, 'ok');
  assert.match(s({ state: { lastOkAt: min(2) }, stats: { count: 3 } }).summary, /3 payments recorded/);
  assert.equal(s({ state: {}, stats: {} }).status, 'warn');                                              // never completed a run
  assert.equal(s({ state: { lastOkAt: min(30) }, stats: {} }).status, 'warn');                           // stale
  assert.equal(s({ state: { lastOkAt: min(2), lastError: 'boom' }, stats: {} }).status, 'warn');         // latest run failed, earlier fine
  assert.equal(s({ state: { lastOkAt: min(60), lastError: 'boom' }, stats: {} }).status, 'down');        // failing for a long time
  assert.equal(s({ state: { lastError: 'boom' }, stats: {} }).status, 'down');                           // never worked
  const locked = s({ state: { lastOkAt: min(2) }, stats: { paidButLocked: 2 } });
  assert.equal(locked.status, 'warn'); assert.match(locked.summary, /2 tech packs were paid for in the store but are still locked/);
});

const row = (o) => ({ tp_id: 't1', client_id: 'c1', client_name: 'Kyle Riggle', product_id: 'p1', product_title: 'V2 Runner', version: 1, status: 'published', submitted_at: null, published_at: min(60), locked_at: null, verification: {}, ai_status: 'done', updated_at: min(60), ...o });
test('the tech pack chain puts each pack with the person who has to move', () => {
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  const kinds = rs => packItems(rs).map(i => `${i.kind}:${i.owner}`);
  assert.deepEqual(kinds([row({ status: 'submitted', published_at: null, submitted_at: ago(1) })]), ['review:us']);
  assert.deepEqual(kinds([row({})]), ['client-approval:client']);
  assert.deepEqual(kinds([row({ verification: { clientSign: { name: 'A', at: ago(1) } } })]), ['countersign:us']);
  assert.deepEqual(kinds([row({ verification: { clientSign: { name: 'A', at: ago(2) }, brandSign: { name: 'B', at: ago(1) } } })]), ['factory-signature:factory']);
  assert.deepEqual(kinds([row({ locked_at: ago(1), verification: { clientSign: {}, brandSign: {}, factorySign: {} } })]), []);   // fully signed: done
  assert.deepEqual(kinds([row({ status: 'draft', published_at: null })]), []);                                                      // a draft is the client's own business
});
test('how long something has waited decides how loud it is', () => {
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  assert.equal(packItems([row({ status: 'submitted', published_at: null, submitted_at: ago(0.2) })])[0].severity, 'normal');
  assert.equal(packItems([row({ status: 'submitted', published_at: null, submitted_at: ago(3) })])[0].severity, 'urgent');
  assert.equal(packItems([row({ published_at: ago(1) })])[0].severity, 'info');
  assert.equal(packItems([row({ published_at: ago(8) })])[0].severity, 'urgent');
});
test('items sort urgent first, then the longest waiting', () => {
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  const sorted = sortItems([{ severity: 'info', since: ago(9), key: 'a' }, { severity: 'urgent', since: ago(1), key: 'b' }, { severity: 'urgent', since: ago(5), key: 'c' }, { severity: 'normal', since: ago(2), key: 'd' }]);
  assert.deepEqual(sorted.map(i => i.key), ['c', 'b', 'd', 'a']);
});
test('a failed assistant run becomes a re-run item that says whose fault it was', () => {
  const [ours] = assistantRerunItems([{ tp_id: 't', ai_error: 'The assistant could not run just now. This is on our side, not your photo', ai_started_at: min(30), client_id: 'c', client_name: 'K', product_id: 'p', product_title: 'P' }]);
  assert.match(ours.title, /could not run on this pack/); assert.equal(ours.owner, 'us'); assert.equal(ours.kind, 'rerun');
  const [photo] = assistantRerunItems([{ tp_id: 't', ai_error: 'We could not make out a product in this photo', ai_started_at: min(30), client_id: 'c', client_name: 'K', product_id: 'p', product_title: 'P' }]);
  assert.match(photo.title, /could not read the photo/); assert.equal(photo.owner, 'client'); assert.equal(photo.kind, 'photo'); assert.equal(photo.severity, 'info');
});
