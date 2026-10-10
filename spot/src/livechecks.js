// Live checks for /admin/health: "Run checks" calls every outside service
// Spot depends on, for real, in ways that cost nothing and change nothing,
// and says plainly what's wrong and how to fix it. Passive counters say a
// service worked the last time someone used it; these say it works now,
// before a customer finds out it doesn't.
//
// Each check returns { state: 'ok' | 'warn' | 'fail' | 'off', detail, fix? }.
//   ok    works
//   warn  works, but something will bite (low balance, missing permission)
//   fail  broken: a real order would fail here
//   off   not set up (the variable to set is in `fix`)
//
// The store-quote check needs a product to price and an address to ship it
// to: SPOT_CHECK_PRODUCT_URL (a product page on a store with agent
// checkout, e.g. a Shopify store) and SPOT_CARD_BILLING (Spot's address).
// Spot builds that store's checkout, reads shipping and tax, and cancels it.
import Stripe from 'stripe';
import { anthropicClient } from './anthropic.js';
import { usd } from './cart.js';

const TIMEOUT_MS = 20_000;
const MIN_BALANCE_CENTS = 5000;

const within = (p, ms = TIMEOUT_MS) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer in ${ms / 1000}s`)), ms).unref?.())]);
const msg = (err) => String(err?.message || err || 'failed').replace(/\b(sk|rk|pk|whsec|re|shpat)_[A-Za-z0-9_]+/g, '[key]').slice(0, 240);
const permission = (err) => err?.type === 'StripePermissionError' || err?.statusCode === 403 || /permission/i.test(err?.message || '');

// The Stripe events Spot acts on (server.js webhook).
export const STRIPE_EVENTS = ['payment_intent.succeeded', 'issuing_authorization.request', 'issuing_transaction.created', 'issuing_authorization.updated', 'charge.dispute.created'];

export function createLiveChecks({ env = process.env, provider, db, direct = null, shopifyAuth = null, backups = null, launchBrowser = null, fetchImpl = fetch, publicUrl = null, metrics = null }) {
  const stripe = provider?.name === 'stripe' ? provider.stripe : null;
  const has = (...keys) => keys.every((k) => Boolean(env[k]));

  const checks = [
    {
      name: 'database',
      label: 'Database',
      async run() {
        const at = Date.now();
        db.state.set('health:probe', at);
        if (db.state.get('health:probe') !== at) return { state: 'fail', detail: 'Wrote a value and read back something else' };
        return { state: 'ok', detail: 'Read and write work' };
      },
    },
    {
      name: 'stripe',
      label: 'Stripe payments',
      async run() {
        if (!stripe) return { state: 'off', detail: 'Not using Stripe (sandbox)', fix: 'STRIPE_SECRET_KEY' };
        const b = await stripe.balance.retrieve();
        const usdAvail = (b.available || []).find((x) => x.currency === 'usd')?.amount ?? 0;
        const pending = (b.pending || []).find((x) => x.currency === 'usd')?.amount ?? 0;
        return { state: 'ok', detail: `Key works · payments balance ${usd(usdAvail)} available, ${usd(pending)} pending` };
      },
    },
    {
      name: 'stripe_webhook',
      label: 'Stripe webhooks',
      async run() {
        if (!stripe) return { state: 'off', detail: 'Not using Stripe', fix: 'STRIPE_SECRET_KEY' };
        if (!env.STRIPE_WEBHOOK_SECRET) return { state: 'fail', detail: 'No signing secret, so Spot rejects every webhook', fix: 'STRIPE_WEBHOOK_SECRET' };
        let list;
        try {
          list = await stripe.webhookEndpoints.list({ limit: 50 });
        } catch (err) {
          if (permission(err)) return { state: 'warn', detail: 'The key can’t read webhook settings, so this can’t check them', fix: 'Give Spot’s Stripe key Webhook Endpoints: Read' };
          throw err;
        }
        const ours = (list.data || []).filter((w) => /\/v1\/webhooks\/stripe\/?$/.test(w.url));
        if (!ours.length) return { state: 'fail', detail: 'No Stripe webhook points at /v1/webhooks/stripe: payments and card approvals never reach Spot', fix: 'Add the endpoint in Stripe → Developers → Webhooks' };
        const live = ours.filter((w) => w.status === 'enabled');
        if (!live.length) return { state: 'fail', detail: 'Spot’s webhook endpoint is disabled in Stripe', fix: 'Enable it in Stripe → Developers → Webhooks' };
        const events = new Set(live.flatMap((w) => w.enabled_events || []));
        const missing = events.has('*') ? [] : STRIPE_EVENTS.filter((e) => !events.has(e));
        if (missing.length) return { state: 'fail', detail: `Spot’s webhook doesn’t get: ${missing.join(', ')}`, fix: 'Add those events to the endpoint in Stripe' };
        if (publicUrl && !live.some((w) => w.url.startsWith(publicUrl))) return { state: 'warn', detail: `The endpoint is ${live[0].url}, not on ${publicUrl}` };
        return { state: 'ok', detail: `${live[0].url} · all ${STRIPE_EVENTS.length} events Spot needs` };
      },
    },
    {
      name: 'issuing',
      label: 'Stripe Issuing (Spot cards)',
      async run() {
        if (!stripe) return { state: 'off', detail: 'Not using Stripe', fix: 'STRIPE_SECRET_KEY' };
        if (!env.STRIPE_ISSUING_CARDHOLDER) return { state: 'fail', detail: 'No cardholder: Spot can’t make cards', fix: 'STRIPE_ISSUING_CARDHOLDER' };
        const ch = await stripe.issuing.cardholders.retrieve(env.STRIPE_ISSUING_CARDHOLDER);
        if (ch.status !== 'active') return { state: 'fail', detail: `Cardholder ${ch.id} is ${ch.status}`, fix: 'Activate it in Stripe → Issuing → Cardholders' };
        const reqs = ch.requirements?.past_due || [];
        if (reqs.length) return { state: 'fail', detail: `Cardholder needs: ${reqs.join(', ')}` };
        const fa = env.STRIPE_ISSUING_FINANCIAL_ACCOUNT;
        if (!fa) return { state: 'ok', detail: `Cardholder ${ch.id} active · cards draw from Stripe’s Issuing balance` };
        let acct;
        try {
          acct = await stripe.rawRequest('GET', `/v2/money_management/financial_accounts/${encodeURIComponent(fa)}`, {}, { apiVersion: `${Stripe.API_VERSION.split('.')[0]}.preview` });
        } catch (err) {
          if (permission(err)) return { state: 'warn', detail: `Cardholder active · can’t read ${fa}’s balance to warn before cards get declined`, fix: 'Give Spot’s Stripe key Money Management → Financial Accounts: Read' };
          throw err;
        }
        const avail = Number(acct?.balance?.available?.usd?.value ?? acct?.balance?.available?.usd ?? NaN);
        if (!Number.isFinite(avail)) return { state: 'ok', detail: `Cardholder active · ${fa} open` };
        if (avail < MIN_BALANCE_CENTS) return { state: avail <= 0 ? 'fail' : 'warn', detail: `Only ${usd(avail)} available in ${fa}: stores will decline Spot’s cards`, fix: 'Add funds to the Business account in Stripe → Balances' };
        return { state: 'ok', detail: `Cardholder active · ${usd(avail)} available for Spot cards` };
      },
    },
    {
      name: 'ucp_quote',
      label: 'Store checkout quote (shipping + tax)',
      async run() {
        const product = env.SPOT_CHECK_PRODUCT_URL;
        const [line1, city, state, postal_code] = String(env.SPOT_CARD_BILLING || '').split('|').map((x) => x.trim());
        if (!product) return { state: 'off', detail: 'No product to price', fix: 'SPOT_CHECK_PRODUCT_URL (a product page on a Shopify store)' };
        if (!line1 || !postal_code) return { state: 'off', detail: 'No address to price shipping to', fix: 'SPOT_CARD_BILLING (line1|city|state|zip)' };
        if (!direct?.quote) return { state: 'off', detail: 'Store checkout isn’t available on this server' };
        const origin = new URL(product).origin;
        if (!(await direct.supports(origin))) return { state: 'fail', detail: `${origin} doesn’t answer agent checkout (UCP) right now` };
        const price = await productPrice(product, fetchImpl).catch(() => null);
        const cart = { merchant: { name: new URL(product).hostname, url: origin }, items: [{ title: price?.title || 'Test item', quantity: 1, price_cents: price?.cents || 100, url: product }] };
        const q = await direct.quote(cart, { name: env.SPOT_LEGAL_NAME || 'Spot Check', line1, city, state, postal_code, email: env.SPOT_CONTACT_EMAIL || 'check@spotmeplease.com' });
        if (!q) return { state: 'fail', detail: `Couldn’t get a total from ${origin}’s checkout: carts there would be charged an estimate` };
        return { state: 'ok', detail: `${cart.items[0].title}: ${usd(q.subtotal_cents ?? 0)} + ${usd(q.shipping_cents)} shipping + ${usd(q.tax_cents)} tax = ${usd(q.total_cents)} (checkout cancelled)` };
      },
    },
    {
      name: 'shopify_token',
      label: 'Shopify agent token',
      async run() {
        if (!shopifyAuth || !has('SHOPIFY_CATALOG_CLIENT_ID', 'SHOPIFY_CATALOG_CLIENT_SECRET')) return { state: 'off', detail: 'Spot calls Shopify stores as an anonymous agent', fix: 'SHOPIFY_CATALOG_CLIENT_ID / _SECRET' };
        const t = await shopifyAuth.token();
        return t ? { state: 'ok', detail: 'Got a token' } : { state: 'fail', detail: 'Shopify refused the client id and secret', fix: 'Check them in the Shopify Dev Dashboard → Catalogs' };
      },
    },
    {
      name: 'anthropic',
      label: 'Claude',
      async run() {
        if (!has('ANTHROPIC_API_KEY') && !has('ANTHROPIC_AUTH_TOKEN')) return { state: 'off', detail: 'No key: no screenshot reading, lookups or checkout agent', fix: 'ANTHROPIC_API_KEY' };
        const client = anthropicClient(env);
        const page = await client.models.list({ limit: 20 });
        const ids = (page.data || []).map((m) => m.id);
        return { state: 'ok', detail: `Key works · ${ids.length} models available` };
      },
    },
    {
      name: 'checkout_agent',
      label: 'Spot’s checkout browser',
      async run() {
        if (!launchBrowser) return { state: 'off', detail: 'No browser on this server' };
        if (String(env.SPOT_AGENT || '').toLowerCase() === 'off') return { state: 'off', detail: 'Automatic ordering is turned off', fix: 'SPOT_AGENT (remove "off")' };
        const browser = await launchBrowser();
        try {
          const page = await browser.newPage();
          await page.setContent('<p id="ok">ready</p>');
          const text = await page.textContent('#ok');
          return text === 'ready' ? { state: 'ok', detail: 'Browser starts and renders a page' } : { state: 'fail', detail: 'Browser started but couldn’t render' };
        } finally {
          await browser.close().catch(() => {});
        }
      },
    },
    {
      name: 'resend',
      label: 'Email (Resend)',
      async run() {
        if (!env.RESEND_API_KEY) return { state: 'off', detail: 'No email: codes and receipts can’t be sent', fix: 'RESEND_API_KEY' };
        const res = await fetchImpl('https://api.resend.com/domains', { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          // A send-only key can't list domains; it still sends.
          if (/restricted|sending/i.test(body.message || body.name || '')) return { state: 'warn', detail: 'Send-only key: can’t check the domain from here' };
          return { state: 'fail', detail: `Resend refused the key (${res.status})`, fix: 'RESEND_API_KEY' };
        }
        if (!res.ok) throw new Error(`Resend ${res.status}`);
        const from = /@([^>\s]+)/.exec(env.SPOT_FROM_EMAIL || '')?.[1];
        if (!from) return { state: 'warn', detail: 'Emails go from Resend’s test address, which only reaches your own inbox', fix: 'SPOT_FROM_EMAIL on a verified domain' };
        const d = (body.data || []).find((x) => x.name === from || from.endsWith(`.${x.name}`));
        if (!d) return { state: 'fail', detail: `${from} isn’t a domain in Resend: emails from it will be refused` };
        return d.status === 'verified' ? { state: 'ok', detail: `Sending from ${from} (verified)` } : { state: 'fail', detail: `${from} is ${d.status} in Resend`, fix: 'Finish its DNS records in Resend → Domains' };
      },
    },
    {
      name: 'twilio',
      label: 'Texts (Twilio)',
      async run() {
        const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = env;
        if (!sid || !token || !from) return { state: 'off', detail: 'No texts', fix: 'TWILIO_ACCOUNT_SID / _AUTH_TOKEN / _FROM' };
        const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
        const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, { headers: { authorization: auth } });
        if (res.status === 401) return { state: 'fail', detail: 'Twilio refused the account SID and token', fix: 'TWILIO_ACCOUNT_SID / _AUTH_TOKEN' };
        const acct = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Twilio ${res.status}`);
        if (acct.status !== 'active') return { state: 'fail', detail: `Twilio account is ${acct.status}` };
        const svc = env.TWILIO_MESSAGING_SERVICE_SID;
        if (!svc) return { state: 'warn', detail: 'Account active · can’t see the 10DLC campaign (US texts are blocked until it’s approved)', fix: 'TWILIO_MESSAGING_SERVICE_SID, to check the campaign here' };
        const c = await fetchImpl(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(svc)}/Compliance/Usa2p`, { headers: { authorization: auth } });
        const cb = await c.json().catch(() => ({}));
        const camp = (cb.compliance || cb.us_app_to_person || [])[0] || null;
        const status = String(camp?.campaign_status || '').toUpperCase();
        if (!camp) return { state: 'fail', detail: 'No 10DLC campaign on the messaging service: US texts won’t deliver', fix: 'Register one in Twilio → Messaging → Regulatory Compliance' };
        if (status === 'VERIFIED') return { state: 'ok', detail: 'Account active · 10DLC campaign approved' };
        return { state: 'fail', detail: `10DLC campaign is ${status.toLowerCase() || 'not approved'}${camp.errors?.length ? ` (${camp.errors.map((e) => e.error_code || e.code).join(', ')})` : ''}: US texts won’t deliver`, fix: 'Fix and resubmit the campaign in Twilio' };
      },
    },
    {
      name: 'duffel',
      label: 'Flights (Duffel)',
      async run() {
        if (!env.DUFFEL_ACCESS_TOKEN) return { state: 'off', detail: 'No flights', fix: 'DUFFEL_ACCESS_TOKEN' };
        const res = await fetchImpl('https://api.duffel.com/air/airlines?limit=1', { headers: { authorization: `Bearer ${env.DUFFEL_ACCESS_TOKEN}`, 'duffel-version': 'v2', accept: 'application/json' } });
        if (res.status === 401) return { state: 'fail', detail: 'Duffel refused the token', fix: 'DUFFEL_ACCESS_TOKEN' };
        if (!res.ok) throw new Error(`Duffel ${res.status}`);
        return { state: 'ok', detail: `Token works${/^duffel_test_/.test(env.DUFFEL_ACCESS_TOKEN) ? ' (test mode: no real tickets)' : ''}` };
      },
    },
    {
      name: 'backups',
      label: 'Database backups',
      async run() {
        const st = backups?.status?.();
        if (!st) return { state: 'off', detail: 'Backups aren’t running on this server' };
        const ok = st.last_ok;
        if (!ok) return { state: 'fail', detail: 'No good backup yet' };
        const hours = (Date.now() - ok.at) / 3600_000;
        if (hours > 26) return { state: 'fail', detail: `Last good backup ${Math.round(hours)} hours ago` };
        return { state: st.bucket ? 'ok' : 'warn', detail: `Last good backup ${Math.max(1, Math.round(hours))} h ago${st.bucket ? ', copied to the bucket' : ', on the same volume only'}`, ...(st.bucket ? {} : { fix: 'Add a Railway bucket (docs/go-live.md)' }) };
      },
    },
  ];

  return {
    names: checks.map((c) => c.name),
    async run(only = null) {
      const pick = only ? checks.filter((c) => only.includes(c.name)) : checks;
      const results = await Promise.all(
        pick.map(async (c) => {
          const t0 = Date.now();
          let r;
          try {
            r = await within(c.run());
          } catch (err) {
            r = { state: 'fail', detail: msg(err) };
          }
          const out = { name: c.name, label: c.label, ms: Date.now() - t0, ...r };
          if (out.state === 'ok') metrics?.ok(c.name);
          else if (out.state === 'fail') metrics?.fail(c.name, new Error(out.detail));
          return out;
        }),
      );
      const run = { at: Date.now(), results, failing: results.filter((r) => r.state === 'fail').length, warnings: results.filter((r) => r.state === 'warn').length };
      db.state.set('health:live', run);
      return run;
    },
    last: () => db.state.get('health:live'),
  };
}

// A Shopify product's title and first available price, from its .js
// endpoint (any store: falls back to $1, only shipping and tax matter).
async function productPrice(url, fetchImpl) {
  const u = new URL(url);
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return null;
  const res = await fetchImpl(`${u.origin}/products/${m[1]}.js`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const p = await res.json();
  const v = (p.variants || []).find((x) => x.available) || p.variants?.[0];
  return v ? { title: p.title, cents: Number(v.price) } : null;
}
