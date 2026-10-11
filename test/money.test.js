import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyAccessList, moneyAllowed, parseDate, addDays, dueFromTerms, invoiceTotals, cleanInvoice, nextInvoiceNumber, invoiceState, aging, parseCsv, parseInvoiceCsv } from '../src/money.js';

test('only Danielle and Kyle see money unless the list is set', () => {
  assert.deepEqual(moneyAccessList({}), ['danielle@thefuturebasics.com', 'kyle@thefuturebasics.com']);
  assert.equal(moneyAllowed('Kyle@TheFutureBasics.com', {}), true); assert.equal(moneyAllowed('danielle@thefuturebasics.com', {}), true);
  assert.equal(moneyAllowed('colby@thefuturebasics.com', {}), false); assert.equal(moneyAllowed('', {}), false); assert.equal(moneyAllowed(null, {}), false);
  assert.equal(moneyAllowed('colby@thefuturebasics.com', { MONEY_ACCESS_EMAILS: 'a@x.com, colby@thefuturebasics.com' }), true);
  assert.equal(moneyAllowed('anyone@x.com', { MONEY_ACCESS_EMAILS: '@x.com' }), true); assert.equal(moneyAllowed('kyle@thefuturebasics.com', { MONEY_ACCESS_EMAILS: '@x.com' }), false);
  assert.deepEqual(moneyAccessList({ MONEY_ACCESS_EMAILS: '  ,  ' }), ['danielle@thefuturebasics.com', 'kyle@thefuturebasics.com']);
});

test('dates in the shapes the invoices use', () => {
  assert.equal(parseDate('3/15/2026'), '2026-03-15'); assert.equal(parseDate('03/15/26'), '2026-03-15'); assert.equal(parseDate('9.18.24'), '2024-09-18'); assert.equal(parseDate('2026-03-15'), '2026-03-15');
  assert.equal(parseDate('2/30/2026'), null); assert.equal(parseDate('soon'), null); assert.equal(parseDate(''), null);
  assert.equal(addDays('2026-03-15', 17), '2026-04-01'); assert.equal(dueFromTerms('2026-05-12', 'Net 30'), '2026-06-11'); assert.equal(dueFromTerms('2026-05-12', 'Due upon receipt'), '2026-05-12');
});

test('an invoice adds up the way the paper ones do: tax, a deposit already paid, and part due now', () => {
  // invoice 11096: 500 x $130, 8.63% tax charged, a deposit of half paid
  const t = invoiceTotals({ lines: [{ qty: 500, rateCents: 13000 }], taxRatePct: 8.63, chargeTax: true, credits: [{ label: 'Deposit paid 3/9', amountCents: 3530475 }] });
  assert.deepEqual([t.subtotalCents, t.taxCents, t.totalCents, t.balanceCents, t.dueNowCents], [6500000, 560950, 7060950, 3530475, 3530475]);
  // the same rate shown but not charged (invoice 11097), with half due now
  const u = invoiceTotals({ lines: [{ qty: 1, rateCents: 2900000 }], taxRatePct: 8.63, chargeTax: false, dueNowCents: 1450000 });
  assert.deepEqual([u.taxCents, u.totalCents, u.balanceCents, u.dueNowCents], [0, 2900000, 2900000, 1450000]);
  assert.equal(invoiceTotals({ lines: [{ qty: 3, rateCents: 1000 }], dueNowCents: 99999999 }).dueNowCents, 3000);
  assert.equal(invoiceTotals({ lines: [{ qty: 165, rateCents: 100 }, { qty: 1, rateCents: 50 }] }).subtotalCents, 16550);
});

test('the invoice form is checked and tidied', () => {
  const ok = cleanInvoice({ company: '  Tools for Humanity Corporation ', contactEmail: 'Billing@X.com', issuedOn: '3/15/2026', terms: 'Net 30', lines: [{ description: 'Retail Support\nServices - March', qty: 1, rate: '$23,000' }], notes: 'Service Period 3/1/26-3/31/26' }, { today: '2026-03-20' });
  assert.equal(ok.error, undefined); assert.deepEqual([ok.value.company, ok.value.contactEmail, ok.value.issuedOn, ok.value.dueOn, ok.value.totalCents, ok.value.dueNowLabel], ['Tools for Humanity Corporation', 'billing@x.com', '2026-03-15', '2026-04-14', 2300000, 'Total due']);
  assert.equal(cleanInvoice({ company: 'X', lines: [{ description: 'a', qty: 1, rate: 5 }], credits: [{ label: 'Deposit', amount: 2 }] }, { today: '2026-01-01' }).value.dueNowLabel, 'Final payment due');
  const bad = (o, re) => assert.match(cleanInvoice({ company: 'X', lines: [{ description: 'a', qty: 1, rate: 5 }], ...o }, { today: '2026-01-01' }).error, re);
  assert.match(cleanInvoice({ lines: [] }).error, /who the invoice is for/); bad({ lines: [] }, /at least one line/); bad({ lines: [{ description: '', qty: 1, rate: 5 }] }, /description/); bad({ lines: [{ description: 'a', qty: 0, rate: 5 }] }, /quantity/);
  bad({ lines: [{ description: 'a', qty: 1, rate: 'abc' }] }, /rate/); bad({ issuedOn: '13/45/2026' }, /invoice date/); bad({ issuedOn: '2026-03-10', dueOn: '2026-03-01' }, /before the invoice date/); bad({ taxRatePct: 90 }, /tax rate/);
  bad({ credits: [{ label: 'Deposit', amount: 99 }] }, /more than the invoice total/); bad({ credits: [{ label: '', amount: 2 }] }, /label/);
});

test('the next number follows the highest plain number', () => {
  assert.equal(nextInvoiceNumber(['11105', '11106', '1193']), '11107'); assert.equal(nextInvoiceNumber(['INV-9', 'x']), '1001'); assert.equal(nextInvoiceNumber([]), '1001');
});

test('what is owed, and what is late', () => {
  const inv = (o = {}) => ({ total_cents: 100000, status: 'sent', due_on: '2026-03-01', credits: [], ...o }), today = '2026-04-01';
  assert.deepEqual(invoiceState(inv(), 0, today), { owedCents: 100000, state: 'overdue', overdue: true, daysOverdue: 31 });
  assert.equal(invoiceState(inv({ due_on: '2026-04-15' }), 0, today).state, 'open');
  assert.deepEqual([invoiceState(inv(), 40000, today).owedCents, invoiceState(inv({ due_on: '2026-04-15' }), 40000, today).state], [60000, 'part-paid']);
  assert.equal(invoiceState(inv(), 100000, today).state, 'paid'); assert.equal(invoiceState(inv({ status: 'paid' }), 0, today).owedCents, 0);
  assert.equal(invoiceState(inv({ status: 'void' }), 0, today).owedCents, 0); assert.equal(invoiceState(inv({ status: 'draft' }), 0, today).state, 'draft');
  assert.deepEqual([invoiceState(inv({ status: 'unrecorded' }), 0, today).state, invoiceState(inv({ status: 'unrecorded' }), 0, today).overdue], ['unrecorded', false]);
  assert.equal(invoiceState(inv({ credits: [{ amountCents: 30000 }] }), 0, today).owedCents, 70000);
  const b = aging([{ owedCents: 5, daysOverdue: 0 }, { owedCents: 10, daysOverdue: 5 }, { owedCents: 20, daysOverdue: 31 }, { owedCents: 40, daysOverdue: 75 }, { owedCents: 80, daysOverdue: 200 }, { owedCents: 0, daysOverdue: 9 }]);
  assert.deepEqual(b.map(x => [x.cents, x.count]), [[5, 1], [10, 1], [20, 1], [40, 1], [80, 1]]);
});

test('a CSV of past invoices: quoted commas, one invoice over several rows, statuses, and rows that cannot be read', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  const csv = ['Invoice,Date,Company,Description,Amount,Terms,Paid', '1148,9/18/2024,"Ding Yun Shanghai Technology Co., Ltd.",New Shipment Received - Article IF9703,$165.00,Due on Receipt,', '1148,9/18/2024,"Ding Yun Shanghai Technology Co., Ltd.",New Shipment Received - Article IF9704,$165.00,Due on Receipt,',
    '11099,4/1/2026,Tools for Humanity Corporation,Retail Support Services - April,"$23,000.00",Net 30,5/20/2026', ',3/3/2026,No Number Inc,Something,$10,,', '5,3/3/2026,,Missing company,$10,,', '6,3/3/2026,Bad Amount,Thing,,,'].join('\n');
  const r = parseInvoiceCsv(csv, { today: '2026-06-01' });
  assert.equal(r.invoices.length, 3); const [a, b, c] = r.invoices;
  assert.deepEqual([a.value.number, a.value.lines.length, a.value.totalCents, a.status], ['1148', 2, 33000, 'unrecorded']);
  assert.deepEqual([b.value.number, b.value.dueOn, b.value.totalCents, b.status, b.paidOn], ['11099', '2026-05-01', 2300000, 'paid', '2026-05-20']);
  assert.equal(c.value.number, ''); assert.equal(c.value.company, 'No Number Inc');
  assert.equal(r.errors.length, 2); assert.match(r.errors.map(e => e.error).join('|'), /who the invoice is for/); assert.match(r.errors.map(e => e.error).join('|'), /No amount/);
  assert.match(parseInvoiceCsv('Foo,Bar\n1,2').errors[0].error, /company column and an amount column/); assert.match(parseInvoiceCsv('Company').errors[0].error, /header row/);
  assert.equal(parseInvoiceCsv('Company,Amount,Status\nA,10,Unpaid\nB,10,void\nC,10,paid\n').invoices.map(x => x.status).join(), 'sent,void,paid');
});

test('a CSV can carry tax, a deposit already paid, and the amount due now', () => {
  const csv = ['Invoice,Date,Due date,Terms,Company,Description,Qty,Rate,Tax rate,Tax,Deposit,Deposit label,Due now,Due now label', '11096,3/15/2026,4/1/2026,Due upon receipt,Tools for Humanity Corporation,World x Future Basics Cytoshift,500,"$130.00",8.63%,"$5,609.50","$35,304.75",Deposit Paid 3/9,,Final Payment Due',
    '11097,3/15/2026,4/15/2026,Net 30,Tools for Humanity Corporation,Retail Strategy,1,"$29,000.00",8.63%,$0.00,,,"$14,500.00",Due Now'].join('\n');
  const r = parseInvoiceCsv(csv, { today: '2026-06-01' }); assert.deepEqual(r.errors, []); const [a, b] = r.invoices.map(x => x.value);
  assert.deepEqual([a.taxCents, a.totalCents, a.creditsCents, a.balanceCents, a.dueNowCents, a.dueNowLabel, a.credits[0].label], [560950, 7060950, 3530475, 3530475, 3530475, 'Final Payment Due', 'Deposit Paid 3/9']);
  assert.deepEqual([b.taxRatePct, b.chargeTax, b.taxCents, b.totalCents, b.dueNowCents, b.dueNowLabel], [8.63, false, 0, 2900000, 1450000, 'Due Now']);
});

test('an invoice keeps its kind of work and project (they decide the payment link), and ignores what is not valid', () => {
  const base = { company: 'Acme', lines: [{ description: 'Work', qty: 1, rate: 100 }] };
  assert.equal(cleanInvoice({ ...base, workKind: 'software' }).value.workKind, 'software');
  assert.equal(cleanInvoice({ ...base, workKind: 'product' }).value.workKind, 'product');
  assert.equal(cleanInvoice({ ...base, workKind: 'hardware' }).value.workKind, '');
  assert.equal(cleanInvoice(base).value.workKind, '');
  assert.equal(cleanInvoice({ ...base, projectId: '0a1b2c3d-0000-4000-8000-000000000000' }).value.projectId, '0a1b2c3d-0000-4000-8000-000000000000');
  assert.equal(cleanInvoice({ ...base, projectId: 'not-an-id' }).value.projectId, null);
});
