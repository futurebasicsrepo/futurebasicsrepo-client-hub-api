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

test('the embedded form needs a publishable key of the same mode as the secret key', () => {
  const mk = (sk, pk) => createStripe({ env: { STRIPE_SECRET_KEY: sk, ...(pk ? { STRIPE_PUBLISHABLE_KEY: pk } : {}) } });
  assert.deepEqual([mk('sk_test_a').embedded(), mk('sk_test_a', 'pk_test_b').embedded(), mk('sk_live_a', 'pk_live_b').embedded()], [false, true, true]);
  assert.deepEqual([mk('sk_live_a', 'pk_test_b').embedded(), mk('sk_test_a', 'pk_live_b').publishableKey(), mk('sk_test_a', 'nope').embedded()], [false, '', false], 'a test key never pairs with a live one');
});

test('the embedded form starts a SetupIntent for later payments, and registers the domain for Apple Pay once', async () => {
  const seen = [];
  const s = createStripe({ env: { STRIPE_SECRET_KEY: 'sk_test_x' }, log: {}, fetchImpl: async (url, o) => { seen.push({ url, body: decodeURIComponent(o.body || '') });
    if (url.endsWith('/payment_method_domains') && seen.filter(x => x.url.endsWith('/payment_method_domains')).length === 2) return { ok: false, status: 400, json: async () => ({ error: { message: 'Domain hub.example.com already exists' } }) };
    return { ok: true, status: 200, json: async () => (url.endsWith('/setup_intents') ? { id: 'seti_1', client_secret: 'seti_1_secret_z' } : { id: 'pmd_1' }) }; } });
  const card = await s.startIntent({ customerId: 'cus_1', kind: 'card', metadata: { contract: 'c1' } });
  assert.deepEqual(card, { id: 'seti_1', clientSecret: 'seti_1_secret_z' });
  assert.match(seen[0].body, /customer=cus_1/); assert.match(seen[0].body, /usage=off_session/); assert.match(seen[0].body, /payment_method_types\[\]=card/); assert.match(seen[0].body, /metadata\[contract\]=c1/);
  await s.startIntent({ customerId: 'cus_1', kind: 'bank' });
  assert.match(seen[1].body, /payment_method_types\[\]=us_bank_account/); assert.match(seen[1].body, /financial_connections\]\[permissions\]\[\]=payment_method/);
  assert.equal(await s.registerDomain('https://hub.example.com/sign/x'), true);
  assert.equal(await s.registerDomain('hub.example.com'), true, 'asked again in the same process: not sent again');
  assert.equal(seen.filter(x => x.url.endsWith('/payment_method_domains')).length, 1);
  assert.match(seen.at(-1).body, /domain_name=hub\.example\.com$/);
  assert.equal(await s.registerDomain('127.0.0.1:3100'), false, 'a local address is never sent');
  assert.equal(await s.registerDomain('localhost'), false);
  assert.equal(await s.registerDomain('pay.example.com'), true, 'a domain Stripe already has counts as registered');
});
