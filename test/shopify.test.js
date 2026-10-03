import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactCustomerMatch, CUSTOMER_BY_EMAIL_QUERY, DRAFT_ORDER_STATUS } from '../src/shopify.js';

// Linking a self-serve room to its Shopify customer: only an exact email match may link, never a lookalike from the same domain.
const nodes = [
  { id: 'gid://shopify/Customer/1', email: 'Maya@Studio.co', displayName: 'Maya Chen' },
  { id: 'gid://shopify/Customer/2', email: 'orders@studio.co', displayName: 'Studio orders' },
  { id: 'gid://shopify/Customer/3', email: null, displayName: 'No email' }
];

test('exact email match links, case-insensitively', () => {
  assert.equal(exactCustomerMatch(nodes, ['maya@studio.co'])?.id, 'gid://shopify/Customer/1');
  assert.equal(exactCustomerMatch(nodes, [' MAYA@STUDIO.CO '])?.id, 'gid://shopify/Customer/1');
});

test('a different address on the same domain never links', () => {
  assert.equal(exactCustomerMatch(nodes, ['kai@studio.co']), null);
  assert.equal(exactCustomerMatch(nodes, ['studio.co']), null);
});

test('any of the room emails may match; empty input links nothing', () => {
  assert.equal(exactCustomerMatch(nodes, ['kai@studio.co', 'orders@studio.co'])?.id, 'gid://shopify/Customer/2');
  assert.equal(exactCustomerMatch(nodes, []), null);
  assert.equal(exactCustomerMatch(undefined, ['maya@studio.co']), null);
  assert.equal(exactCustomerMatch([{ id: 'x', email: '' }], ['']), null);
});

test('the queries ask for what the link needs', () => {
  assert.match(CUSTOMER_BY_EMAIL_QUERY, /customers\(first: \d+, query: \$query\)/);
  assert.match(CUSTOMER_BY_EMAIL_QUERY, /nodes \{ id email/);
  assert.match(DRAFT_ORDER_STATUS, /order \{[\s\S]*?customer \{ id email \}/);
});
