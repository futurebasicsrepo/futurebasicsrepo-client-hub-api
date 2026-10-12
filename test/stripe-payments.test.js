import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, verifyWebhook, signWebhook, createStripe } from '../src/stripe-payments.js';

test('encode: Stripe form encoding for nested objects and lists', () => {
  const s = encode({ mode: 'setup', payment_method_types: ['card'], metadata: { contract: 'c1', n: 2 }, payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method'] } } }, skip: undefined, none: null, off_session: true }).join('&');
  assert.match(s, /mode=setup/); assert.match(s, /payment_method_types%5B%5D=card/); assert.match(s, /metadata%5Bcontract%5D=c1/); assert.match(s, /metadata%5Bn%5D=2/);
  assert.match(s, /payment_method_options%5Bus_bank_account%5D%5Bfinancial_connections%5D%5Bpermissions%5D%5B%5D=payment_method/); assert.match(s, /off_session=true/); assert.doesNotMatch(s, /skip|none/);
});

test('webhook signature: accepts a good one, refuses a wrong secret, a changed body, a missing header and an old timestamp', () => {
  const rawBody = '{"id":"evt_1","type":"payment_intent.succeeded"}', secret = 'whsec_x', t = Math.floor(Date.now() / 1000), header = signWebhook({ rawBody, secret, t });
  assert.equal(verifyWebhook({ rawBody, header, secret }), true);
  assert.equal(verifyWebhook({ rawBody, header, secret: 'whsec_y' }), false);
  assert.equal(verifyWebhook({ rawBody: rawBody + ' ', header, secret }), false);
  assert.equal(verifyWebhook({ rawBody, header: '', secret }), false);
  assert.equal(verifyWebhook({ rawBody, header, secret: '' }), false);
  assert.equal(verifyWebhook({ rawBody, header: signWebhook({ rawBody, secret, t: t - 3600 }), secret }), false);
  assert.equal(verifyWebhook({ rawBody, header: `t=${t},v1=zz`, secret }), false);
});

test('instruments are named for what they are, wallets included', () => {
  const st = createStripe({ env: { STRIPE_SECRET_KEY: 'sk_test_x' } });
  assert.equal(st.instrumentOf({ id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 3, exp_year: 2031, wallet: { type: 'google_pay' } } }).label, 'Google Pay · Visa ending 4242');
  assert.equal(st.instrumentOf({ id: 'pm_2', type: 'card', card: { brand: 'amex', last4: '0005', exp_month: 11, exp_year: 2030 } }).exp, '11/30');
  const b = st.instrumentOf({ id: 'pm_3', type: 'us_bank_account', us_bank_account: { account_type: 'savings', bank_name: 'X', last4: '6789' } });
  assert.deepEqual([b.kind, b.label, b.last4], ['bank', 'Savings account ending 6789', '6789']);
});

test('configured only with a Stripe key, and live only with a live one', () => {
  assert.equal(createStripe({ env: {} }).configured(), false);
  assert.equal(createStripe({ env: { STRIPE_SECRET_KEY: 'nope' } }).configured(), false);
  const t = createStripe({ env: { STRIPE_SECRET_KEY: 'sk_test_abc' } }), l = createStripe({ env: { STRIPE_SECRET_KEY: 'sk_live_abc' } });
  assert.deepEqual([t.configured(), t.live(), l.configured(), l.live()], [true, false, true, true]);
});

test('a card the bank refuses is a decline, not a failure to ask; a bad key is a refusal', async () => {
  const mk = (status, body) => createStripe({ env: { STRIPE_SECRET_KEY: 'sk_test_x' }, log: {}, fetchImpl: async () => ({ ok: status < 400, status, headers: { get: () => '' }, json: async () => body }) });
  const d = await mk(402, { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.', payment_intent: { id: 'pi_9' } } }).charge(null, { kind: 'card', instrumentId: 'pm_1', customerId: 'cus_1', amountCents: 100, requestId: 'k' });
  assert.deepEqual([d.status, d.id, d.reason], ['declined', 'pi_9', 'Your card was declined.']);
  await assert.rejects(mk(401, { error: { message: 'Invalid API Key' } }).charge(null, { kind: 'card', instrumentId: 'pm_1', customerId: 'cus_1', amountCents: 100, requestId: 'k' }), e => e.refused === true);
  const p = await mk(200, { id: 'pi_1', status: 'processing' }).charge(null, { kind: 'bank', instrumentId: 'pm_1', customerId: 'cus_1', amountCents: 100, requestId: 'k' });
  assert.deepEqual([p.status, p.id], ['pending', 'pi_1']);
});
