import test from 'node:test';
import assert from 'node:assert/strict';
import { qbConfig, signState, readState, authUrl, invoicePayload, customerPayload, methodOf, SCOPE } from '../src/quickbooks.js';
import { quickbooksVerdict, coverageConfig } from '../src/platform-coverage.js';

test('the QuickBooks settings come from the environment: sandbox unless production is said', () => {
  const none = qbConfig({}, 'https://work.example.com/'); assert.equal(none.ready, false); assert.equal(none.mode, 'sandbox'); assert.equal(none.redirectUri, 'https://work.example.com/v1/money/quickbooks/callback');
  const sb = qbConfig({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 'sec', QUICKBOOKS_ENV: 'sandbox' }); assert.deepEqual([sb.ready, sb.apiOrigin, sb.appOrigin], [true, 'https://sandbox-quickbooks.api.intuit.com', 'https://app.sandbox.qbo.intuit.com']);
  const pr = qbConfig({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 'sec', QUICKBOOKS_ENV: 'production' }); assert.deepEqual([pr.mode, pr.apiOrigin, pr.authOrigin, pr.oauthOrigin], ['production', 'https://quickbooks.api.intuit.com', 'https://appcenter.intuit.com', 'https://oauth.platform.intuit.com']);
  assert.equal(qbConfig({ QUICKBOOKS_ENV: 'live' }).mode, 'sandbox'); assert.equal(qbConfig({ QUICKBOOKS_API_ORIGIN: 'http://127.0.0.1:1/' }).apiOrigin, 'http://127.0.0.1:1'); assert.equal(qbConfig({ QUICKBOOKS_REDIRECT_URI: 'https://x/cb' }).redirectUri, 'https://x/cb');
});

test('the sign-in state is signed, tied to a person, and runs out', () => {
  const now = 1_000_000, st = signState('secret', 'user-1', now); assert.equal(readState('secret', st, now + 1000).u, 'user-1');
  assert.equal(readState('other', st, now + 1000), null); assert.equal(readState('secret', st, now + 11 * 60_000), null); assert.equal(readState('secret', st + 'x', now), null);
  const [body, sig] = st.split('.'); assert.equal(readState('secret', `${Buffer.from(JSON.stringify({ u: 'admin', exp: now + 99999 })).toString('base64url')}.${sig}`, now), null); assert.equal(readState('secret', 'garbage', now), null); assert.equal(readState('secret', '', now), null);
  const cfg = qbConfig({ QUICKBOOKS_CLIENT_ID: 'my id', QUICKBOOKS_CLIENT_SECRET: 's' }, 'https://work.example.com'), u = new URL(authUrl(cfg, 'STATE'));
  assert.deepEqual([u.origin + u.pathname, u.searchParams.get('client_id'), u.searchParams.get('response_type'), u.searchParams.get('scope'), u.searchParams.get('state'), u.searchParams.get('redirect_uri')], ['https://appcenter.intuit.com/connect/oauth2', 'my id', 'code', SCOPE, 'STATE', 'https://work.example.com/v1/money/quickbooks/callback']);
});

test('an invoice becomes a QuickBooks invoice: lines, tax as its own line, a deposit as the Deposit, online payments on', () => {
  const inv = { number: '11096', issued_on: '2026-03-15', due_on: '2026-04-01', contact_email: 'ap@x.com', notes: 'Cost Centre 1201', lines: [{ description: 'World x Future Basics Cytoshift', qty: 500, rateCents: 13000 }], tax_rate: 8.63, tax_cents: 560950, credits: [{ label: 'Deposit', amountCents: 3530475 }] };
  const p = invoicePayload(inv, { customerId: '55', itemId: '7' });
  assert.deepEqual([p.DocNumber, p.TxnDate, p.DueDate, p.CustomerRef.value, p.Deposit, p.BillEmail.Address, p.CustomerMemo.value, p.AllowOnlineCreditCardPayment, p.AllowOnlineACHPayment, p.GlobalTaxCalculation], ['11096', '2026-03-15', '2026-04-01', '55', 35304.75, 'ap@x.com', 'Cost Centre 1201', true, true, 'NotApplicable']);
  assert.equal(p.Line.length, 2); assert.deepEqual([p.Line[0].Amount, p.Line[0].SalesItemLineDetail.Qty, p.Line[0].SalesItemLineDetail.UnitPrice, p.Line[0].SalesItemLineDetail.ItemRef.value, p.Line[1].Description, p.Line[1].Amount], [65000, 500, 130, '7', 'Sales tax (8.63%)', 5609.5]);
  const plain = invoicePayload({ ...inv, tax_cents: 0, credits: [], contact_email: '', notes: '', number: 'A'.repeat(40) }, { customerId: '1', itemId: '2', onlinePayments: false });
  assert.deepEqual([plain.Line.length, plain.Deposit, plain.BillEmail, plain.CustomerMemo, plain.AllowOnlineCreditCardPayment, plain.DocNumber.length], [1, undefined, undefined, undefined, undefined, 21]);
});

test('a customer is made from the invoice: name, email and a US address read into its parts', () => {
  const c = customerPayload({ company: 'Tools for Humanity Corporation', contact_name: 'Eliza Chiang', contact_email: 'a@b.com', address: '548 Market St, PMB 49951\nSan Francisco, CA 94104' });
  assert.deepEqual([c.DisplayName, c.GivenName, c.FamilyName, c.PrimaryEmailAddr.Address, c.BillAddr.Line1, c.BillAddr.Line2, c.BillAddr.City, c.BillAddr.CountrySubDivisionCode, c.BillAddr.PostalCode], ['Tools for Humanity Corporation', 'Eliza', 'Chiang', 'a@b.com', '548 Market St, PMB 49951', undefined, 'San Francisco', 'CA', '94104']);
  const odd = customerPayload({ company: 'Ding Yun', address: '5th Floor, No.2 Maji Road\nPudong District, Shanghai, China' }); assert.deepEqual([odd.BillAddr.Line1, odd.BillAddr.Line2, odd.BillAddr.City], ['5th Floor, No.2 Maji Road', 'Pudong District, Shanghai, China', undefined]);
  assert.equal(customerPayload({ company: 'No Address Co' }).BillAddr, undefined);
});

test('how QuickBooks names a payment method maps onto ours', () => {
  assert.deepEqual(['ACH', 'Visa', 'Check', 'Wire transfer', 'Cash', '', 'Mystery'].map(x => methodOf(x.toLowerCase())), ['ach', 'card', 'check', 'wire', 'cash', 'quickbooks', 'quickbooks']);
});

test('the QuickBooks health card says what to do next', () => {
  const now = Date.parse('2026-10-11T12:00:00Z'), base = { company: 'Future Basics', mode: 'production', status: 'connected', last_error: '', last_sync_at: '2026-10-11T11:40:00Z', refresh_expires_at: '2027-01-01T00:00:00Z' };
  assert.equal(quickbooksVerdict({ configured: false, sealing: true, row: null, now }).status, 'off'); assert.match(quickbooksVerdict({ configured: true, sealing: false, row: null, now }).summary, /SHOPIFY_TOKEN_KEY/);
  assert.match(quickbooksVerdict({ configured: true, sealing: true, row: null, now }).summary, /Press Connect QuickBooks/);
  assert.equal(quickbooksVerdict({ configured: true, sealing: true, row: { ...base, status: 'needs-reconnect' }, now }).status, 'down');
  assert.match(quickbooksVerdict({ configured: true, sealing: true, row: { ...base, refresh_expires_at: '2026-10-20T00:00:00Z' }, now }).summary, /runs out in 9 days/);
  assert.match(quickbooksVerdict({ configured: true, sealing: true, row: { ...base, last_error: 'QuickBooks: bad request' }, now }).summary, /last call failed: QuickBooks: bad request/);
  assert.match(quickbooksVerdict({ configured: true, sealing: true, row: { ...base, last_sync_at: '2026-10-11T05:00:00Z' }, now }).summary, /not been read since/);
  const ok = quickbooksVerdict({ configured: true, sealing: true, row: base, now }); assert.equal(ok.status, 'ok'); assert.match(ok.summary, /Connected to Future Basics \(live books\)/);
  assert.match(quickbooksVerdict({ configured: true, sealing: true, row: { ...base, mode: 'sandbox' }, now }).summary, /sandbox: test books/);
  const by = e => Object.fromEntries(coverageConfig({ env: e }).map(r => [r.id, r.status]));
  assert.deepEqual([by({}).quickbooks, by({ QUICKBOOKS_CLIENT_ID: 'a' }).quickbooks, by({ QUICKBOOKS_CLIENT_ID: 'a', QUICKBOOKS_CLIENT_SECRET: 'b', QUICKBOOKS_ENV: 'sandbox' }).quickbooks, by({ QUICKBOOKS_CLIENT_ID: 'a', QUICKBOOKS_CLIENT_SECRET: 'b' }).quickbooks], ['info', 'warn', 'ok', 'warn']);
});
