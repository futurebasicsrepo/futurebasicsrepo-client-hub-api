// Live checks: every outside service, for real, at no cost. These use fakes
// shaped like today's real failures: a $0 Issuing balance, a key without the
// financial-account permission, a webhook missing an event, a rejected 10DLC
// campaign, and a store whose shipping wasn't in the price.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { STRIPE_EVENTS, createLiveChecks } from '../src/livechecks.js';

const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });

function fakeStripe({ events = STRIPE_EVENTS, faBalance = 0, faForbidden = false } = {}) {
  return {
    name: 'stripe',
    stripe: {
      balance: { retrieve: async () => ({ available: [{ currency: 'usd', amount: 0 }], pending: [{ currency: 'usd', amount: 3874 }] }) },
      webhookEndpoints: { list: async () => ({ data: [{ url: 'https://spotmeplease.com/v1/webhooks/stripe', status: 'enabled', enabled_events: events }] }) },
      issuing: { cardholders: { retrieve: async (id) => ({ id, status: 'active', requirements: { past_due: [] } }) } },
      rawRequest: async (method, path, params, opts) => {
        assert.match(opts.apiVersion, /\.preview$/);
        if (faForbidden) throw Object.assign(new Error('Permission denied. Enabling financial_account_read…'), { type: 'StripePermissionError', statusCode: 403 });
        return { id: 'fa_1', balance: { available: { usd: { value: faBalance, currency: 'usd' } } } };
      },
    },
  };
}

const env = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_ISSUING_CARDHOLDER: 'ich_1',
  STRIPE_ISSUING_FINANCIAL_ACCOUNT: 'fa_1',
  SPOT_CHECK_PRODUCT_URL: 'https://sklz.com/products/pro-mini-hoop',
  SPOT_CARD_BILLING: '1 Main St|Austin|TX|78701',
  RESEND_API_KEY: 're_x',
  SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>',
  TWILIO_ACCOUNT_SID: 'AC1',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM: '+15550000000',
  TWILIO_MESSAGING_SERVICE_SID: 'MG1',
};

function fetchFake({ campaign = 'FAILED', domain = 'verified' } = {}) {
  return async (url) => {
    if (url === 'https://api.resend.com/domains') return json({ data: [{ name: 'spotmeplease.com', status: domain }] });
    if (url.includes('api.twilio.com')) return json({ status: 'active' });
    if (url.includes('/Compliance/Usa2p')) return json({ compliance: [{ campaign_status: campaign, errors: campaign === 'FAILED' ? [{ error_code: 30886 }] : [] }] });
    if (url.endsWith('/products/pro-mini-hoop.js')) return json({ title: 'Pro Mini Hoop', variants: [{ available: true, price: 3499 }] });
    return json({}, 404);
  };
}

const direct = {
  supports: async () => true,
  quote: async (cart, ship) => (cart.items[0].url && ship.postal_code ? { total_cents: 4249, subtotal_cents: 3499, shipping_cents: 750, tax_cents: 0 } : null),
};

const byName = (run) => Object.fromEntries(run.results.map((r) => [r.name, r]));

test('live checks catch today’s failures, and say how to fix each', async () => {
  const db = openDb(':memory:');
  const seen = { ok: [], fail: [] };
  const metrics = { ok: (n) => seen.ok.push(n), fail: (n) => seen.fail.push(n) };
  const live = createLiveChecks({ env, db, provider: fakeStripe({ events: STRIPE_EVENTS.filter((e) => e !== 'issuing_authorization.request'), faBalance: 0 }), direct, metrics, fetchImpl: fetchFake(), launchBrowser: null });
  const r = byName(await live.run());

  assert.equal(r.database.state, 'ok');
  assert.equal(r.stripe.state, 'ok');
  assert.match(r.stripe.detail, /\$38\.74 pending/);
  assert.equal(r.stripe_webhook.state, 'fail');
  assert.match(r.stripe_webhook.detail, /issuing_authorization\.request/, 'a missing event means card approvals never arrive');
  assert.equal(r.issuing.state, 'fail', '$0 available: every store declines the card');
  assert.match(r.issuing.fix, /Add funds/);
  assert.equal(r.ucp_quote.state, 'ok');
  assert.match(r.ucp_quote.detail, /\$34\.99 \+ \$7\.50 shipping \+ \$0\.00 tax = \$42\.49/);
  assert.equal(r.resend.state, 'ok');
  assert.equal(r.twilio.state, 'fail');
  assert.match(r.twilio.detail, /failed.*30886/);
  assert.equal(r.duffel.state, 'off');
  assert.equal(r.duffel.fix, 'DUFFEL_ACCESS_TOKEN');
  assert.equal(r.checkout_agent.state, 'off');

  assert.ok(seen.fail.includes('issuing') && seen.fail.includes('twilio'), 'failures show on the services list too');
  assert.ok(seen.ok.includes('stripe'));
  assert.equal(live.last().failing, 3);
  assert.doesNotMatch(JSON.stringify(live.last()), /sk_test_x|whsec_x|re_x|tok\b/, 'no secrets in results');
});

test('a key without the financial-account permission fails (Stripe won’t make cards without it), with the exact fix', async () => {
  const live = createLiveChecks({ env, db: openDb(':memory:'), provider: fakeStripe({ faForbidden: true }), direct, fetchImpl: fetchFake({ campaign: 'VERIFIED' }) });
  const r = byName(await live.run(['issuing', 'twilio']));
  assert.equal(r.issuing.state, 'fail');
  assert.match(r.issuing.fix, /Financial Accounts: Read/);
  assert.equal(r.twilio.state, 'ok');
});

test('no financial account set on the service, and a key that can’t look it up: fails with both fixes', async () => {
  const { STRIPE_ISSUING_FINANCIAL_ACCOUNT, ...noFa } = env;
  const live = createLiveChecks({ env: noFa, db: openDb(':memory:'), provider: fakeStripe({ faForbidden: true }), direct, fetchImpl: fetchFake({ campaign: 'VERIFIED' }) });
  const r = byName(await live.run(['issuing']));
  assert.equal(r.issuing.state, 'fail');
  assert.match(r.issuing.detail, /isn’t set on this service/);
  assert.match(r.issuing.fix, /STRIPE_ISSUING_FINANCIAL_ACCOUNT.*Financial Accounts: Read/);
});

test('a funded account, all events, an approved campaign: all green; a store that can’t quote is broken', async () => {
  const live = createLiveChecks({ env, db: openDb(':memory:'), provider: fakeStripe({ faBalance: 20000 }), direct: { ...direct, quote: async () => null }, fetchImpl: fetchFake({ campaign: 'VERIFIED' }) });
  const r = byName(await live.run());
  for (const n of ['stripe', 'stripe_webhook', 'issuing', 'resend', 'twilio']) assert.equal(r[n].state, 'ok', `${n}: ${r[n].detail}`);
  assert.match(r.issuing.detail, /\$200\.00 available/);
  assert.equal(r.ucp_quote.state, 'fail', 'no quote means carts would be charged an estimate');
});

test('a check that hangs or throws is reported, the rest still run', async () => {
  const provider = fakeStripe({ faBalance: 20000 });
  provider.stripe.balance.retrieve = async () => {
    throw new Error('connect ETIMEDOUT with sk_live_abc123');
  };
  const live = createLiveChecks({ env, db: openDb(':memory:'), provider, direct, fetchImpl: fetchFake() });
  const r = byName(await live.run());
  assert.equal(r.stripe.state, 'fail');
  assert.match(r.stripe.detail, /ETIMEDOUT/);
  assert.doesNotMatch(r.stripe.detail, /sk_live_abc123/, 'keys are scrubbed from errors');
  assert.equal(r.issuing.state, 'ok');
});

test('/admin/health: staff run the checks; a broken one turns the banner to attention', async (t) => {
  const ADMIN = 'admin-token-0123456789';
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 0, feeFixedCents: 200, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { SPOT_ADMIN_TOKEN: ADMIN, SPOT_AGENT: 'off' } });
  t.after(() => a.close());
  const admin = { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' };
  assert.equal((await a.inject({ method: 'POST', url: '/v1/admin/health/check', payload: {}, headers: { 'content-type': 'application/json' } })).statusCode, 401);
  const run = await a.inject({ method: 'POST', url: '/v1/admin/health/check', payload: {}, headers: admin });
  assert.equal(run.statusCode, 200, run.body);
  const r = byName(run.json());
  assert.equal(r.database.state, 'ok');
  assert.equal(r.stripe.state, 'off', 'sandbox: Stripe isn’t set up');
  assert.equal((await a.inject({ method: 'POST', url: '/v1/admin/health/check', payload: {}, headers: admin })).statusCode, 429, 'not more than every 30 seconds');
  const h = (await a.inject({ method: 'GET', url: '/v1/admin/health', headers: admin })).json();
  assert.equal(h.live.results.length, run.json().results.length);
  assert.equal(h.attention >= h.live.failing, true);
  const page = await a.inject({ method: 'GET', url: '/admin/health', headers: admin });
  assert.match(page.body, /Run checks/);
});
