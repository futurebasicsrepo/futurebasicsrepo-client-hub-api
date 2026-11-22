import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptOf, receiptPdf, receiptEmail, receiptNumber } from '../src/receipt-pdf.js';

const hat = (o = {}) => ({ invoiceNumber: '1047', company: 'Example Labs Inc.', contactName: 'Sam Rivera', contactEmail: 'sam@example.test', issuedOn: '2026-11-04', currency: 'USD',
  lines: [{ description: 'Hat: development, sampling and production', qty: 1, rateCents: 500000 }], subtotalCents: 500000, taxCents: 0, totalCents: 500000, credits: [],
  payments: [{ paidOn: '2026-11-17', method: 'shopify', reference: '#1042', amountCents: 500000 }], ...o });

test('a receipt says what came in, when, how, and that nothing is left to pay', () => {
  const r = receiptOf(hat());
  assert.equal(r.number, 'R-1047'); assert.equal(receiptNumber('R-1047'), 'R-1047', 'never R-R-');
  assert.deepEqual({ paid: r.paidCents, balance: r.balanceCents, full: r.paidInFull, on: r.paidOn, method: r.method }, { paid: 500000, balance: 0, full: true, on: '2026-11-17', method: 'shopify' });
});

test('a deposit counts towards the balance; a part payment leaves the rest due; the latest payment is the one the receipt is dated by', () => {
  const part = receiptOf(hat({ credits: [{ label: 'Deposit paid', amountCents: 100000 }], payments: [{ paidOn: '2026-11-20', method: 'wire', amountCents: 150000 }, { paidOn: '2026-11-10', method: 'ach', amountCents: 50000 }] }));
  assert.deepEqual({ paid: part.paidCents, balance: part.balanceCents, full: part.paidInFull, on: part.paidOn, method: part.method }, { paid: 200000, balance: 200000, full: false, on: '2026-11-20', method: 'wire' });
  assert.equal(receiptOf(hat({ payments: [] })).paidInFull, false, 'nothing paid is never "paid in full"');
});

test('a Shopify payment shows its order number, never the checkout\'s internal id', () => {
  const r = receiptOf(hat({ payments: [{ paidOn: '2026-11-17', method: 'shopify', reference: 'shopify:gid://shopify/DraftOrder/1270714761413', note: 'Paid through the Shopify link (#1042)', amountCents: 500000 }] }));
  assert.equal(r.payments[0].reference, '#1042');
  assert.equal(receiptOf(hat({ payments: [{ paidOn: '2026-11-17', method: 'shopify', reference: 'shopify:gid://shopify/DraftOrder/1', note: 'Paid through the Shopify link', amountCents: 500000 }] })).payments[0].reference, '', 'no order number known: no reference at all');
  assert.equal(receiptOf(hat({ payments: [{ paidOn: '2026-11-17', method: 'wire', reference: 'FED-2291', amountCents: 500000 }] })).payments[0].reference, 'FED-2291', 'a bank reference is kept');
});

test('the receipt is a PDF on the letterhead, and its email names the amount and carries a file name', async () => {
  const pdf = await receiptPdf(hat());
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); assert.ok(pdf.length > 8000);
  const e = receiptEmail(hat(), { message: 'Hats ship <Friday>', esc: s => String(s).replace(/</g, '&lt;') });
  assert.equal(e.subject, 'Receipt for invoice 1047: $5,000.00 paid in full');
  assert.match(e.body, /Hi Sam/); assert.match(e.body, /\$5,000\.00/); assert.match(e.body, /Hats ship &lt;Friday>/); assert.equal(e.filename, 'Example Labs Inc. - Receipt R-1047.pdf');
  assert.match(receiptEmail(hat({ totalCents: 800000, subtotalCents: 800000 })).subject, /\$5,000\.00 received/, 'a part payment says received, not paid in full');
});

// The Money routes: download and email, refused before anything is paid
async function moneyApp({ paidCents = 500000, sent = true } = {}) {
  const Fastify = (await import('fastify')).default, { registerMoneyRoutes } = await import('../src/money-routes.js');
  const ID = '11111111-2222-4333-8444-555555555555', mails = [], writes = [];
  const row = { id: ID, number: '1047', company: 'Example Labs Inc.', contact_name: 'Sam Rivera', contact_email: 'sam@example.test', address: '', issued_on: '2026-11-04', due_on: '2026-11-18', terms: 'Net 14',
    lines: [{ description: 'Hat', qty: 1, rateCents: 500000 }], tax_rate: 0, charge_tax: false, credits: [], subtotal_cents: 500000, tax_cents: 0, total_cents: 500000, currency: 'USD',
    status: paidCents >= 500000 ? 'paid' : 'sent', paid_cents: paidCents, project_name: 'Merch', receipt_sent_at: null, receipt_sent_to: null };
  const pool = { query: async (sql, a = []) => {
    if (/select email from users/.test(sql)) return { rows: [{ email: 'staff@example.test' }] };
    if (/from money_invoices i where i\.id=\$1/.test(sql)) return { rows: [row] };
    if (/from money_payments where invoice_id=\$1/.test(sql)) return { rows: paidCents ? [{ amount_cents: paidCents, paid_on: '2026-11-17', method: 'shopify', reference: '#1042', note: '' }] : [] };
    if (/update money_invoices set receipt_sent_at/.test(sql)) { writes.push(a); row.receipt_sent_at = new Date(); row.receipt_sent_to = a[1]; return { rows: [] }; }
    return { rows: [], rowCount: 0 };
  } };
  const app = Fastify();
  registerMoneyRoutes(app, { pool, authenticate: async req => { req.auth = { sub: '5bfe85dd-23e4-4700-a524-9db42b7d9bf7', role: 'admin' }; }, adminOnly: async () => {}, getSetting: async () => null, setSetting: async () => {},
    env: { MONEY_ACCESS_EMAILS: 'staff@example.test' }, log: { warn() {}, info() {} }, sendHubEmail: async m => { mails.push(m); return sent; }, hubEmailShell: (t, b) => `<h1>${t}</h1>${b}`, emailEscape: s => String(s) });
  return { app, ID, mails, writes };
}

test('Money: a paid invoice downloads its receipt and emails it to the client with the PDF attached, and remembers it was sent', async () => {
  const { app, ID, mails, writes } = await moneyApp();
  const pdf = await app.inject({ method: 'GET', url: `/v1/money/invoices/${ID}/receipt.pdf` });
  assert.equal(pdf.statusCode, 200); assert.match(pdf.headers['content-type'], /application\/pdf/); assert.match(pdf.headers['content-disposition'], /^inline; filename="Example Labs Inc\. - Receipt R-1047\.pdf"; filename\*=UTF-8''Example%20Labs%20Inc\.%20-%20Receipt%20R-1047\.pdf$/);
  const sent = await app.inject({ method: 'POST', url: `/v1/money/invoices/${ID}/receipt`, payload: { message: 'Thank you!' } });
  assert.equal(sent.statusCode, 200, sent.body); assert.equal(sent.json().sentTo, 'sam@example.test', 'to the contact on the invoice unless told otherwise');
  assert.equal(mails.length, 1); assert.equal(mails[0].to, 'sam@example.test'); assert.equal(mails[0].replyTo, 'staff@example.test', 'replies go to whoever sent it');
  assert.match(mails[0].subject, /Receipt for invoice 1047/); assert.match(mails[0].html, /Thank you!/);
  assert.equal(mails[0].attachments[0].filename, 'Example Labs Inc. - Receipt R-1047.pdf'); assert.equal(Buffer.from(mails[0].attachments[0].content).subarray(0, 4).toString(), '%PDF');
  assert.equal(writes.length, 1); assert.ok(sent.json().invoice.receiptSentAt);
  const other = await app.inject({ method: 'POST', url: `/v1/money/invoices/${ID}/receipt`, payload: { to: 'AP@Example.test' } });
  assert.equal(other.json().sentTo, 'ap@example.test', 'or to another address'); assert.equal((await app.inject({ method: 'POST', url: `/v1/money/invoices/${ID}/receipt`, payload: { to: 'not an email' } })).statusCode, 422);
});

test('Money: nothing paid, no receipt; and a receipt that could not be emailed is not marked sent', async () => {
  const none = await moneyApp({ paidCents: 0 });
  assert.equal((await none.app.inject({ method: 'GET', url: `/v1/money/invoices/${none.ID}/receipt.pdf` })).statusCode, 409);
  assert.equal((await none.app.inject({ method: 'POST', url: `/v1/money/invoices/${none.ID}/receipt`, payload: {} })).statusCode, 409); assert.equal(none.mails.length, 0);
  const down = await moneyApp({ sent: false }), r = await down.app.inject({ method: 'POST', url: `/v1/money/invoices/${down.ID}/receipt`, payload: {} });
  assert.equal(r.statusCode, 503); assert.match(r.json().error, /not set up/); assert.equal(down.writes.length, 0);
});

test('a PDF is named for the client, what it is and its number, and the header keeps the exact name', async () => {
  const { pdfName, disposition } = await import('../src/pdf-name.js');
  assert.equal(pdfName('Comet over Delphi', 'Agreement FB-C-2026-004 (signed)'), 'Comet over Delphi - Agreement FB-C-2026-004 (signed).pdf');
  assert.equal(pdfName('A/B: "Studio"', 'Receipt R-12'), 'A B Studio - Receipt R-12.pdf', 'characters a file name cannot hold are dropped');
  assert.equal(pdfName('', 'Invoice 1001'), 'Invoice 1001.pdf');
  assert.equal(disposition('Café Ñ - Invoice 7.pdf'), `inline; filename="Cafe N - Invoice 7.pdf"; filename*=UTF-8''Caf%C3%A9%20%C3%91%20-%20Invoice%207.pdf`);
  assert.match(disposition('X.pdf', { inline: false }), /^attachment; /);
});
