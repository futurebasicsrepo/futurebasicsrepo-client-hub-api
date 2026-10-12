import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDue, authorizationText, MAX_ATTEMPTS } from '../src/autopay.js';
import { luhn, abaOk, tokensUrl, saveInstrument, charge, status, requestIdFor } from '../src/qb-payments.js';
import { qbConfig, authUrl, SCOPE, PAYMENT_SCOPE } from '../src/quickbooks.js';

const sched = [{ seq: 1, amountCents: 50000, falls: '2026-01-10' }, { seq: 2, amountCents: 25000, falls: '2026-02-10' }, { seq: 3, amountCents: 25000, falls: null }];
const row = (seq, attempt, status, extra = {}) => ({ seq, attempt, status, ...extra });

test('a payment falls due once, only with a method on file and not while paused', () => {
  const t = (today, o = {}) => planDue({ sched, today, hasMethod: true, ...o });
  assert.deepEqual(t('2026-01-09').map(p => p.state), ['scheduled', 'scheduled', 'waiting']);
  assert.equal(t('2026-01-10')[0].action, 'charge');
  assert.equal(t('2026-01-10')[1].state, 'scheduled');
  assert.equal(t('2026-01-10', { hasMethod: false })[0].action, undefined, 'nothing is charged without details on file');
  assert.equal(t('2026-01-10', { hasMethod: false })[0].state, 'due');
  assert.equal(t('2026-01-10', { paused: true })[0].action, undefined, 'paused means paused');
  assert.equal(t('2026-03-01')[2].state, 'waiting', 'a payment due on delivery waits for the delivery date');
});

test('advance notice starts three days before, and only when it could be charged', () => {
  const p = d => planDue({ sched, today: d, hasMethod: true })[1];
  assert.equal(p('2026-02-06').notice, false); assert.equal(p('2026-02-07').notice, true); assert.equal(p('2026-02-09').notice, true);
  assert.equal(planDue({ sched, today: '2026-02-08', hasMethod: false })[1].notice, false);
});

test('a paid payment is never charged again; pending is polled, never re-charged', () => {
  const plan = planDue({ sched, today: '2026-03-01', hasMethod: true, charges: [row(1, 1, 'succeeded'), row(2, 1, 'pending', { charge_id: 'E1' })] });
  assert.deepEqual(plan.map(p => p.state), ['paid', 'pending', 'waiting']);
  assert.equal(plan[0].action, undefined); assert.equal(plan[1].action, 'poll');
});

test('one retry three days later, then it stops and waits for a person', () => {
  const failed = (attempt, next) => planDue({ sched: [sched[0]], today: '2026-01-12', hasMethod: true, charges: [row(1, attempt, 'failed', { next_retry_on: next })] })[0];
  assert.equal(MAX_ATTEMPTS, 2);
  assert.deepEqual([failed(1, '2026-01-13').state, failed(1, '2026-01-13').action], ['retry', undefined], 'not before the retry date');
  assert.deepEqual([failed(1, '2026-01-12').state, failed(1, '2026-01-12').action, failed(1, '2026-01-12').attempt], ['retry', 'charge', 2]);
  assert.deepEqual([failed(2, null).state, failed(2, null).action], ['failed', undefined], 'after the second failure nothing more is charged by itself');
});

test('the authorization says what is taken, when, and how to stop', () => {
  const t = authorizationText('bank'); assert.match(t, /debit this bank account \(ACH\)/); assert.match(t, /on the date it falls due, and for no other amount/); assert.match(t, /three business days/);
  assert.match(authorizationText('card', 'Acme'), /Acme to charge this card/);
});

test('card and routing numbers are checked before anything is sent', () => {
  assert.equal(luhn('4111 1111 1111 1111'), true); assert.equal(luhn('4111 1111 1111 1112'), false); assert.equal(luhn('1234'), false);
  assert.equal(abaOk('322079353'), true); assert.equal(abaOk('322079354'), false); assert.equal(abaOk('12345'), false);
});

test('payments permission is asked for only when switched on, and the token address is the payment provider\'s', () => {
  const off = qbConfig({ QUICKBOOKS_CLIENT_ID: 'a', QUICKBOOKS_CLIENT_SECRET: 'b' }), on = qbConfig({ QUICKBOOKS_CLIENT_ID: 'a', QUICKBOOKS_CLIENT_SECRET: 'b', QUICKBOOKS_PAYMENTS: 'on', QUICKBOOKS_ENV: 'production' });
  assert.equal(new URL(authUrl(off, 's')).searchParams.get('scope'), SCOPE);
  assert.equal(new URL(authUrl(on, 's')).searchParams.get('scope'), `${SCOPE} ${PAYMENT_SCOPE}`);
  assert.equal(tokensUrl(on), 'https://api.intuit.com/quickbooks/v4/payments/tokens'); assert.equal(tokensUrl(off), 'https://sandbox.api.intuit.com/quickbooks/v4/payments/tokens');
});

// a stand-in for the payment provider
function bank() {
  const calls = [], answers = [];
  const fetchImpl = async (url, init = {}) => { calls.push({ url, method: init.method || 'GET', headers: init.headers, body: init.body ? JSON.parse(init.body) : null }); const a = answers.shift() || { status: 200, body: {} }; return { ok: a.status < 400, status: a.status, headers: { get: () => 'tid1' }, json: async () => a.body }; };
  return { calls, answers, ctx: { cfg: { paymentsOrigin: 'https://pay.test' }, conn: { realmId: '1', accessToken: 'AT', refreshToken: 'RT', accessExpiresAt: new Date(Date.now() + 3600_000) }, fetchImpl } };
}
test('saving a card on file sends only the one-time token and keeps only the last four digits', async () => {
  const b = bank(); b.answers.push({ status: 201, body: { id: 'C1', number: 'xxxxxxxxxxxx4242', cardType: 'Visa', expMonth: '8', expYear: '2030' } });
  const r = await saveInstrument(b.ctx, { customerId: '55', kind: 'card', token: 'tok_123456789', requestId: 'r1' });
  assert.deepEqual(r, { id: 'C1', kind: 'card', last4: '4242', brand: 'Visa', exp: '08/30', label: 'Visa ending 4242' });
  assert.equal(b.calls[0].url, 'https://pay.test/quickbooks/v4/customers/55/cards/createFromToken'); assert.deepEqual(b.calls[0].body, { value: 'tok_123456789' }); assert.equal(b.calls[0].headers['Request-Id'], 'r1'); assert.equal(b.calls[0].headers.Authorization, 'Bearer AT');
  b.answers.push({ status: 201, body: { id: 'B1', accountNumber: 'xxxxx6781', accountType: 'PERSONAL_SAVINGS' } });
  assert.equal((await saveInstrument(b.ctx, { customerId: '55', kind: 'bank', token: 'tok_abcdefgh' })).label, 'Savings account ending 6781');
  await assert.rejects(() => saveInstrument(b.ctx, { customerId: '55', kind: 'card', token: '' }), /did not arrive/);
});
test('a card payment answers at once; a bank debit is pending until it settles; a refusal says why', async () => {
  const b = bank();
  b.answers.push({ status: 201, body: { id: 'CH1', status: 'CAPTURED' } });
  assert.deepEqual(await charge(b.ctx, { kind: 'card', instrumentId: 'C1', amountCents: 123456, requestId: 'q1', description: 'x' }), { id: 'CH1', status: 'succeeded', reason: '' });
  assert.equal(b.calls[0].url, 'https://pay.test/quickbooks/v4/payments/charges'); assert.equal(b.calls[0].body.amount, '1234.56'); assert.equal(b.calls[0].body.cardOnFile, 'C1'); assert.equal(b.calls[0].headers['Request-Id'], 'q1');
  b.answers.push({ status: 201, body: { id: 'CH2', status: 'DECLINED' } });
  assert.equal((await charge(b.ctx, { kind: 'card', instrumentId: 'C1', amountCents: 100, requestId: 'q2' })).status, 'declined');
  b.answers.push({ status: 201, body: { id: 'E1', status: 'PENDING' } });
  assert.deepEqual(await charge(b.ctx, { kind: 'bank', instrumentId: 'B1', amountCents: 5000, requestId: 'q3' }), { id: 'E1', status: 'pending', reason: '' });
  assert.equal(b.calls[2].url, 'https://pay.test/quickbooks/v4/payments/echecks'); assert.equal(b.calls[2].body.bankAccountOnFile, 'B1'); assert.equal(b.calls[2].body.paymentMode, 'WEB');
  b.answers.push({ status: 200, body: { id: 'E1', status: 'SUCCEEDED' } }); assert.equal((await status(b.ctx, { kind: 'bank', chargeId: 'E1' })).status, 'succeeded');
  b.answers.push({ status: 200, body: { id: 'E1', status: 'DECLINED' } }); assert.equal((await status(b.ctx, { kind: 'bank', chargeId: 'E1' })).status, 'declined');
  b.answers.push({ status: 400, body: { errors: [{ code: 'PMT-4000', message: 'bad', detail: 'The amount is invalid' }] } });
  await assert.rejects(() => charge(b.ctx, { kind: 'card', instrumentId: 'C1', amountCents: 1, requestId: 'q4' }), e => e.status === 400 && /The amount is invalid/.test(e.message) && e.code === 'PMT-4000');
});

test('the Request-Id sent to Intuit is never longer than 40 characters, and the same attempt always gets the same one', async () => {
  const long = `fb-ch-0b1f3a52-6a1e-4c0f-9c3a-5a7a0d3a9a11-12-2`;
  assert.ok(long.length > 40); assert.ok(requestIdFor(long).length <= 40); assert.equal(requestIdFor(long), requestIdFor(long)); assert.notEqual(requestIdFor(long), requestIdFor(long.replace(/-2$/, '-3')));
  assert.equal(requestIdFor('short-id'), 'short-id'); assert.ok(requestIdFor('').length <= 40);
  const b = bank(); b.answers.push({ status: 201, body: { id: 'C1', number: 'xxxxxxxxxxxx4242', cardType: 'Visa' } });
  await saveInstrument(b.ctx, { customerId: '55', kind: 'card', token: 'tok_123456789', requestId: `fb-pm-${'a'.repeat(36)}-${'b'.repeat(36)}` });
  assert.ok(b.calls[0].headers['Request-Id'].length <= 40, b.calls[0].headers['Request-Id']);
  b.answers.push({ status: 201, body: { id: 'CH1', status: 'CAPTURED' } });
  await charge(b.ctx, { kind: 'card', instrumentId: 'C1', amountCents: 100, requestId: long });
  const again = b.calls.length; b.answers.push({ status: 201, body: { id: 'CH1', status: 'CAPTURED' } });
  await charge(b.ctx, { kind: 'card', instrumentId: 'C1', amountCents: 100, requestId: long });
  assert.equal(b.calls[1].headers['Request-Id'], b.calls[again].headers['Request-Id']);
});
