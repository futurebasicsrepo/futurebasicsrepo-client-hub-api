// Automatic payments on a signed contract, through QuickBooks Payments (server G, with a stand-in for Intuit on port 3133): the client's card or bank account goes
// from the browser to the payment provider and only a token reaches us; each payment is taken on its due date, once; a declined card is retried once and then left to a person;
// a bank debit settles later; a payment that was taken is booked in QuickBooks and the ledger exactly once, even when QuickBooks is down at that moment.
import http from 'node:http';
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, sql, stamp, forge } from './lib.mjs';
import { buildPlan } from '../../src/contracts.js';
import { signWebhook } from '../../src/stripe-payments.js';
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
const BASE = 'http://127.0.0.1:3130', MOCK = 'http://127.0.0.1:3133', call = api(BASE);
const mk = async () => (await call('/v1/public/start', { body: { email: `ja-${stamp}-${Math.random().toString(36).slice(2, 7)}@chaos.test`, name: 'Autopay Admin', title: 'Autopay runner', photos: [jpeg()] } })).json;
const room = await mk(), clientId = room.client?.id;
const staff = async email => sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${clientId}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0];
const kyle = await forge({ sub: await staff('kyle@thefuturebasics.com'), clientId, role: 'admin', email: 'kyle@thefuturebasics.com' }), colby = await forge({ sub: await staff('colby@thefuturebasics.com'), clientId, role: 'admin', email: 'colby@thefuturebasics.com' });
const C = (path, o = {}) => call('/v1/contracts' + path, { token: colby, ...o }), K = (path, o = {}) => call('/v1/contracts' + path, { token: kyle, ...o });
const tokenOf = link => String(link).split('/sign/')[1], P = (token, path = '', o = {}) => call(`/v1/public/contracts/${token}${path}`, o);
const outbox = async to => (await call(`/v1/dev/outbox?to=${encodeURIComponent(to)}`)).json.emails || [];
const SIGNER = `pay-${stamp}@salon.test`, SIGNER2 = `pay2-${stamp}@salon.test`, SIGNER3 = `pay3-${stamp}@salon.test`, SIGNER4 = `pay4-${stamp}@salon.test`, SIGNER5 = `pay5-${stamp}@salon.test`, SIGNER6 = `pay6-${stamp}@salon.test`;
const body = (n, email, plan, over = {}) => ({ title: `Autopay site ${n} ${stamp}`, kind: 'website', client: { company: `Pay Salon ${n} ${stamp}`, address: '1 Main St, Norristown PA 19401', signerName: 'Pat Payer', signerTitle: 'Owner', signerEmail: email }, project: { name: 'Salon website' }, scope: ['A five-page website', 'Booking link'], fee: { totalCents: 300000 }, timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '2027-02-15' }, plan, ...over });
const sign = (o = {}) => ({ name: 'Pat Payer', title: 'Owner', agree: true, esign: true, autopay: true, ...o });
const CARD = { card: { number: '4111111111111111', expMonth: '08', expYear: '2031', cvc: '123', name: 'Pat Payer', address: { postalCode: '19401', country: 'US' } } };
const BANK = { bankAccount: { name: 'Pat Payer', routingNumber: '322079353', accountNumber: '11000000333456781', accountType: 'BUSINESS_CHECKING', phone: '2155550123' } };

// ---- the stand-in for Intuit: sign-in, the books, and the payment provider ----
const qbm = { invoices: [], customers: [], payments: [], tokens: {}, instruments: {}, charges: [], echecks: {}, deleted: [], seen: [], declines: 0, paymentsDown: false, settle: false, refreshes: 0 };
const send = (res, c, b) => { res.writeHead(c, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, request-id', 'access-control-allow-methods': 'POST, GET, OPTIONS' }); res.end(JSON.stringify(b)); };
const mock = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'), raw = Buffer.concat(chunks).toString(), auth = req.headers.authorization || '', rid = req.headers['request-id'] || '';
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const j = () => { try { return JSON.parse(raw || '{}'); } catch { return {}; } };
    if (u.pathname !== '/quickbooks/v4/payments/tokens') qbm.seen.push(raw);
    if (u.pathname === '/oauth2/v1/tokens/bearer') { const f = new URLSearchParams(raw); if (f.get('grant_type') === 'authorization_code') return f.get('code') === 'GOOD-CODE' ? send(res, 200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, x_refresh_token_expires_in: 8640000 }) : send(res, 400, { error: 'invalid_grant' }); qbm.refreshes++; return send(res, 200, { access_token: `AT${qbm.refreshes + 1}`, refresh_token: `RT${qbm.refreshes + 1}`, expires_in: 3600, x_refresh_token_expires_in: 8640000 }); }
    // the browser asks for a one-time token: no sign-in needed, the number goes only here
    if (u.pathname === '/quickbooks/v4/payments/tokens') {
      const b = j(), t = `tok_${Math.random().toString(36).slice(2, 12)}`;
      if (b.card) { if (!/^\d{12,19}$/.test(b.card.number || '') || !b.card.cvc) return send(res, 400, { errors: [{ code: 'PMT-4000', message: 'bad card' }] }); qbm.tokens[t] = { kind: 'card', number: b.card.number }; }
      else if (b.bankAccount) { if (!/^\d{9}$/.test(b.bankAccount.routingNumber || '') || !b.bankAccount.phone) return send(res, 400, { errors: [{ code: 'PMT-4000', message: 'bad bank account' }] }); qbm.tokens[t] = { kind: 'bank', number: b.bankAccount.accountNumber, type: b.bankAccount.accountType }; }
      else return send(res, 400, { errors: [{ message: 'nothing to tokenize' }] });
      return send(res, 201, { value: t });
    }
    if (u.pathname.startsWith('/quickbooks/v4/')) {
      if (!/^Bearer AT\d$/.test(auth)) return send(res, 401, { errors: [{ code: 'AuthenticationFailed' }] });
      if (!rid) return send(res, 400, { errors: [{ code: 'PMT-4000', message: 'Request-Id is required', detail: 'requestId' }] });
      if (rid.length > 40) return send(res, 400, { errors: [{ code: 'PMT-4000', message: 'requestId is too long', detail: 'requestId' }] }); // what Intuit does
      let m = /^\/quickbooks\/v4\/customers\/(\d+)\/(cards|bank-accounts)\/createFromToken$/.exec(u.pathname);
      if (m && req.method === 'POST') { const t = qbm.tokens[j().value]; if (!t) return send(res, 400, { errors: [{ code: 'PMT-5000', message: 'unknown token', detail: 'unknown token' }] }); delete qbm.tokens[j().value]; const id = `${m[2] === 'cards' ? 'CARD' : 'BANK'}${Object.keys(qbm.instruments).length + 1}`; qbm.instruments[id] = { ...t, customer: m[1] };
        return send(res, 201, m[2] === 'cards' ? { id, number: `xxxxxxxxxxxx${t.number.slice(-4)}`, cardType: t.number.startsWith('4') ? 'Visa' : 'MasterCard', expMonth: '08', expYear: '2031' } : { id, accountNumber: `xxxxx${t.number.slice(-4)}`, accountType: t.type }); }
      m = /^\/quickbooks\/v4\/customers\/(\d+)\/(cards|bank-accounts)\/([A-Z0-9]+)$/.exec(u.pathname); if (m && req.method === 'DELETE') { qbm.deleted.push(m[3]); return send(res, 204, {}); }
      if (u.pathname === '/quickbooks/v4/payments/charges' && req.method === 'POST') {
        const b = j(), prev = qbm.charges.find(c => c.rid === rid); if (prev) return send(res, 201, prev.answer);
        const inst = qbm.instruments[b.cardOnFile]; if (!inst) return send(res, 400, { errors: [{ code: 'PMT-5001', message: 'unknown card', detail: 'The card is not on file' }] });
        const declined = qbm.declines > 0 || /0002$/.test(inst.number); if (qbm.declines > 0) qbm.declines--;
        const answer = { id: `CH${qbm.charges.length + 1}`, status: declined ? 'DECLINED' : 'CAPTURED', amount: b.amount, authCode: '1' }; qbm.charges.push({ rid, body: b, answer }); return send(res, 201, answer);
      }
      if (u.pathname === '/quickbooks/v4/payments/echecks' && req.method === 'POST') {
        const b = j(), prev = Object.values(qbm.echecks).find(c => c.rid === rid); if (prev) return send(res, 201, { id: prev.id, status: prev.status });
        const inst = qbm.instruments[b.bankAccountOnFile]; if (!inst) return send(res, 400, { errors: [{ message: 'unknown account' }] });
        const id = `EC${Object.keys(qbm.echecks).length + 1}`; qbm.echecks[id] = { id, rid, body: b, status: 'PENDING', polls: 0 }; return send(res, 201, { id, status: 'PENDING' });
      }
      m = /^\/quickbooks\/v4\/payments\/echecks\/(EC\d+)$/.exec(u.pathname); if (m) { const e = qbm.echecks[m[1]]; if (!e) return send(res, 404, {}); e.polls++; if (qbm.settle) e.status = 'SUCCEEDED'; return send(res, 200, { id: e.id, status: e.status }); }
      return send(res, 404, {});
    }
    if (u.pathname.startsWith('/v3/company/123/')) {
      if (!/^Bearer AT\d$/.test(auth)) return send(res, 401, { Fault: { Error: [{ Message: 'AuthenticationFailed' }] } });
      const sub = u.pathname.replace('/v3/company/123', '');
      if (sub === '/companyinfo/123') return send(res, 200, { CompanyInfo: { CompanyName: 'Sandbox Company', LegalName: 'Sandbox Company', Country: 'US' } });
      if (sub === '/query') { const q = u.searchParams.get('query') || ''; if (/from Customer/.test(q)) return send(res, 200, { QueryResponse: { Customer: qbm.customers.filter(c => q.includes(`'${c.DisplayName}'`)).map(c => ({ Id: c.Id, DisplayName: c.DisplayName })) } }); if (/from Item/.test(q)) return send(res, 200, { QueryResponse: { Item: [{ Id: '7', Name: 'Services' }] } }); if (/from Payment/.test(q)) return send(res, 200, { QueryResponse: { Payment: [] } }); return send(res, 200, { QueryResponse: {} }); }
      if (sub === '/customer' && req.method === 'POST') { const b = j(), c = { Id: String(55 + qbm.customers.length), DisplayName: b.DisplayName }; qbm.customers.push(c); return send(res, 200, { Customer: { Id: c.Id } }); }
      if (sub === '/invoice' && req.method === 'POST') { const b = j(), id = String(9001 + qbm.invoices.length); qbm.invoices.push({ id, body: b }); return send(res, 200, { Invoice: { Id: id, DocNumber: b.DocNumber, SyncToken: '0' } }); }
      const g = /^\/invoice\/(\d+)$/.exec(sub); if (g && req.method === 'GET') return send(res, 200, { Invoice: { Id: g[1], InvoiceLink: `https://pay.test/i/${g[1]}` } });
      if (sub === '/payment' && req.method === 'POST') { if (qbm.paymentsDown) return send(res, 500, { Fault: { Error: [{ Message: 'Service unavailable', Detail: 'try later' }] } }); const b = j(), id = String(7000 + qbm.payments.length); qbm.payments.push({ id, body: b }); return send(res, 200, { Payment: { Id: id } }); }
    }
    send(res, 404, {});
  });
});
await new Promise(r => mock.listen(3133, '127.0.0.1', r));

// ---- the stand-in for Stripe: customers, Checkout pages (setup mode), payment methods, payment intents (idempotent), fees ----
const stm = { customers: [], sessions: {}, intents: {}, byKey: {}, detached: [], seen: [], n: 0 };
const PMS = {
  pm_card_ok: { id: 'pm_card_ok', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2031, wallet: { type: 'apple_pay' } } },
  pm_card_declined: { id: 'pm_card_declined', type: 'card', card: { brand: 'visa', last4: '0002', exp_month: 12, exp_year: 2031 } },
  pm_bank_ok: { id: 'pm_bank_ok', type: 'us_bank_account', us_bank_account: { account_type: 'checking', bank_name: 'STRIPE TEST BANK', last4: '6789' } },
};
const stripeMock = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'), raw = Buffer.concat(chunks).toString(), form = new URLSearchParams(raw), json = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    stm.seen.push({ method: req.method, path: u.pathname, raw, auth: req.headers.authorization, idem: req.headers['idempotency-key'] || '' });
    if (!/^Bearer sk_test_/.test(req.headers.authorization || '')) return json(401, { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } });
    const g = k => form.get(k), meta = () => Object.fromEntries([...form.entries()].filter(([k]) => /^metadata\[/.test(k)).map(([k, v]) => [k.slice(9, -1), v]));
    if (u.pathname === '/v1/customers' && req.method === 'POST') { const id = `cus_${++stm.n}`; stm.customers.push({ id, email: g('email'), name: g('name') }); return json(200, { id }); }
    if (u.pathname === '/v1/checkout/sessions' && req.method === 'POST') { const id = `cs_test_${++stm.n}x${Math.random().toString(36).slice(2, 8)}`; stm.sessions[id] = { id, params: Object.fromEntries(form.entries()), types: form.getAll('payment_method_types[]'), metadata: meta(), customer: g('customer'), status: 'open', url: `http://127.0.0.1:3135/pay/${id}` }; return json(200, { id, url: stm.sessions[id].url }); }
    let m = /^\/v1\/checkout\/sessions\/(cs_[\w]+)$/.exec(u.pathname);
    if (m) { const s = stm.sessions[m[1]]; if (!s) return json(404, { error: { message: 'No such session' } }); return json(200, { id: s.id, status: s.status, mode: 'setup', customer: s.customer, metadata: s.metadata, setup_intent: s.si || null }); }
    m = /^\/v1\/setup_intents\/(seti_[\w]+)$/.exec(u.pathname); if (m) { const s = Object.values(stm.sessions).find(x => x.si?.id === m[1]); return s ? json(200, s.si) : json(404, { error: { message: 'No such setup intent' } }); }
    if (u.pathname === '/v1/payment_intents' && req.method === 'POST') {
      const key = req.headers['idempotency-key']; if (key && stm.byKey[key]) return json(stm.byKey[key].code, stm.byKey[key].body);
      const pm = g('payment_method'), id = `pi_${++stm.n}`, amount = Number(g('amount')), reply = (code, body, pi) => { if (key) stm.byKey[key] = { code, body }; if (pi) stm.intents[id] = pi; return json(code, body); };
      if (!PMS[pm]) return reply(400, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such PaymentMethod: '${pm}'` } });
      if (g('off_session') !== 'true' || g('confirm') !== 'true' || !g('customer') || g('currency') !== 'usd') return reply(400, { error: { type: 'invalid_request_error', message: 'bad request' } });
      if (pm === 'pm_card_declined') { const pi = { id, status: 'requires_payment_method', amount, last_payment_error: { message: 'Your card was declined.' } }; return reply(402, { error: { type: 'card_error', code: 'card_declined', decline_code: 'generic_decline', message: 'Your card was declined.', payment_intent: pi } }, pi); }
      const bank = pm === 'pm_bank_ok', pi = { id, status: bank ? 'processing' : 'succeeded', amount, pm, meta: meta(), types: form.getAll('payment_method_types[]') };
      return reply(200, pi, pi);
    }
    m = /^\/v1\/payment_intents\/(pi_\d+)$/.exec(u.pathname);
    if (m) { const pi = stm.intents[m[1]]; if (!pi) return json(404, { error: { message: 'No such payment_intent' } }); const fee = Math.round(pi.amount * (pi.pm === 'pm_bank_ok' ? 0.008 : 0.029)) + (pi.pm === 'pm_bank_ok' ? 0 : 30); return json(200, { ...pi, latest_charge: pi.status === 'succeeded' ? { balance_transaction: { fee, net: pi.amount - fee } } : null }); }
    m = /^\/v1\/payment_methods\/(pm_\w+)\/detach$/.exec(u.pathname); if (m && req.method === 'POST') { stm.detached.push(m[1]); return json(200, { id: m[1] }); }
    json(404, { error: { message: `Unrecognized request URL (${req.method}: ${u.pathname})` } });
  });
});
await new Promise(r => stripeMock.listen(3135, '127.0.0.1', r));
// the client finishes on Stripe's page: the payment method is saved against the customer and the session completes
const stripeFinish = (sessionId, pm, over = {}) => { const s = stm.sessions[sessionId]; s.status = 'complete'; s.si = { id: `seti_${sessionId.slice(8, 20).replace(/\W/g, '')}`, status: 'succeeded', customer: s.customer, metadata: s.metadata, payment_method: PMS[pm], ...over }; return s.si; };
const hook = async (type, object, { secret = 'whsec_journey', badSig = false } = {}) => { const rawBody = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object } }); return fetch(`${BASE}/v1/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': badSig ? 't=1,v1=00' : signWebhook({ rawBody, secret }) }, body: rawBody }); };

const today = new Date().toISOString().slice(0, 10);
// the tokens a browser would get: the number goes to the provider, never to us
const tokenFor = async b => (await (await fetch(`${MOCK}/quickbooks/v4/payments/tokens`, { method: 'POST', headers: { 'content-type': 'application/json', 'request-id': `t-${Math.random()}` }, body: JSON.stringify(b) })).json()).value;
const connect = async () => { const con = (await call('/v1/money/quickbooks/connect', { token: kyle, body: {} })).json; const st = new URL(con.url).searchParams.get('state'); const r = await fetch(`${BASE}/v1/money/quickbooks/callback?code=GOOD-CODE&realmId=123&state=${encodeURIComponent(st)}`, { redirect: 'manual' }); return { scope: new URL(con.url).searchParams.get('scope'), loc: r.headers.get('location') || '' }; };
const run = async (day, who = kyle) => (await call('/v1/contracts/autopay/run', { token: who, body: { today: day } })).json;
const planCard = buildPlan({ type: 'monthly', totalCents: 300000, months: 3, firstDueOn: '2027-01-05', depositPct: 20, method: 'card', autopay: true }).plan;
const planBank = buildPlan({ type: 'split', totalCents: 300000, depositPct: 50, method: 'ach', autopay: true }).plan;
const make = async (n, email, plan, over = {}) => { const c = (await C('', { body: { content: body(n, email, plan, over) } })).json.contract; const l = (await C(`/${c.id}/send`, { body: {} })).json.link; return { id: c.id, number: c.number, token: tokenOf(l), link: l }; };
const owed = id => sql(`select coalesce(sum(total_cents),0) - coalesce((select sum(amount_cents) from money_payments where invoice_id in (select id from money_invoices where contract_id='${id}')),0) from money_invoices where contract_id='${id}'`);

try {
  await journey('J167', 'Automatic payments through QuickBooks Payments: details go to the provider and only a token reaches us, each payment is taken once on its due date and booked in QuickBooks, a decline is retried once then left to a person, a bank debit settles later', async () => {
    await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
    const A = await make('A', SIGNER, planCard);
    ok((await P(A.token, '/sign', { body: sign({ autopay: false }) })).status === 422, 'automatic payments need the client to authorize them when signing');
    ok((await P(A.token, '/sign', { body: sign() })).status === 200, 'the client signs, authorizing automatic payments');

    // nothing can be taken before QuickBooks is connected with the payments permission
    const pay0 = (await P(A.token)).json.pay; ok(pay0 && pay0.kind === 'card' && pay0.ready === false && pay0.method === null && /debit|charge this card/.test(pay0.authorization), 'the client\'s page asks for a card, and says payment details cannot be taken yet', pay0);
    const early = await P(A.token, '/payment-method', { body: { kind: 'card', token: await tokenFor(CARD) } });
    ok(early.status === 503 && /cannot be taken just yet/.test(early.json.error) && !/QUICKBOOKS/.test(early.json.error), 'trying to add details before QuickBooks is connected is refused kindly, without internals', early.json);
    ok((await outbox('')).some(e => /tried to add payment details/.test(e.subject) && e.subject.includes(A.number)), 'staff are told a client tried, and why it did not work');
    const d0 = (await K(`/${A.id}`)).json; ok(d0.autopay && d0.autopay.ready === false && /QuickBooks is not connected/.test(d0.autopay.notReadyWhy) && d0.autopay.method === null, 'the contract page says what is missing before payments can be taken', d0.autopay && d0.autopay.notReadyWhy);

    // connect, asking for the payments permission too
    const cn = await connect(); ok(/com\.intuit\.quickbooks\.accounting com\.intuit\.quickbooks\.payment/.test(cn.scope) && /qb=connected/.test(cn.loc), 'QuickBooks is connected asking for the accounting and the payments permission', cn);
    const st = (await call('/v1/money/quickbooks/status', { token: kyle })).json; ok(st.payments.granted === true && st.payments.requested === true && st.payments.needsReconnect === false, 'Money settings say payments are allowed');
    ok((await K(`/${A.id}/countersign`, { body: {} })).status === 200, 'Future Basics countersigns: the agreement is final');
    const dr = await run(today); ok(dr.charged === 0, 'with no details on file nothing is charged');
    const inv = (await K(`/${A.id}`)).json; if (inv.invoices.length !== 4) console.log('DEBUG', JSON.stringify(inv.events.map(e => [e.kind, e.detail])), JSON.stringify(dr));
    ok(inv.invoices.length === 4, 'the invoices for every payment were drafted for the payments job', inv.invoices.length);
    ok(inv.autopay.installments.map(i => i.state).join() === 'due,scheduled,scheduled,scheduled', 'the deposit is due now and the three monthly payments are scheduled', inv.autopay.installments.map(i => i.state));

    // the client adds a card: only the token reaches us
    ok((await P(A.token, '/payment-method', { body: { kind: 'bank', token: await tokenFor(BANK) } })).status === 422, 'a bank account is refused when the agreement is paid by card');
    ok((await P(A.token, '/payment-method', { body: { kind: 'card', token: 'no spaces allowed!!' } })).status === 422, 'something that is not a token is refused');
    const nv = await P(A.token, '/payment-method', { body: { kind: 'card', token: 'tok_neverissued' } }); ok(nv.status === 422 && /not accepted \(unknown token\)/.test(nv.json.error), 'a token the provider does not know is refused, saying what the provider said', nv.json);
    const evs = (await K(`/${A.id}`)).json.events; ok(evs.some(e => e.kind === 'payment_method_failed' && /unknown token/.test(e.detail) && /PMT-5000/.test(e.detail)) && (await outbox('')).some(e => /Saving payment details failed/.test(e.subject) && /unknown token/.test(e.text)), 'what the provider said is on the contract\'s trail and in an email to staff, so the cause is visible without digging in logs');
    const saved = await P(A.token, '/payment-method', { body: { kind: 'card', token: await tokenFor(CARD) } });
    ok(saved.status === 200 && saved.json.method.label === 'Visa ending 1111' && saved.json.method.last4 === '1111', 'the card is saved on file and shown as "Visa ending 1111"', saved.json);
    ok(!qbm.seen.some(b => b.includes('4111111111111111')) && sql(`select count(*) from contract_payment_methods where consent::text like '%4111111%' or label like '%4111111%'`) === '0' && !JSON.stringify(saved.json).includes('4111111111111111'), 'the card number never reached us: not in anything we sent, stored or returned');
    const am = sql(`select kind||'|'||last4||'|'||instrument_id||'|'||(consent->>'by')||'|'||(consent->>'text' like '%charge this card%')::text from contract_payment_methods where contract_id='${A.id}' and status='active'`); ok(am === 'card|1111|CARD1|Pat Payer|true', 'we keep the provider\'s id, the last four digits and the authorization that was shown', am);

    // saving the card took the deposit that was already due, straight away, once, and booked it
    const ch1 = qbm.charges; ok(ch1.length === 1 && ch1[0].body.amount === '600.00' && ch1[0].body.cardOnFile === 'CARD1' && /^fb-[0-9a-f]{36}$/.test(ch1[0].rid), 'the deposit was taken as soon as the card was saved ($600.00, with its own request id)', ch1.map(c => [c.body.amount, c.rid]));
    ok(qbm.invoices.length === 1 && qbm.payments.length === 1 && qbm.payments[0].body.TotalAmt === 600 && qbm.payments[0].body.Line[0].LinkedTxn[0].TxnId === qbm.invoices[0].id && qbm.payments[0].body.PaymentRefNum === 'CH1', 'it is recorded in QuickBooks as a payment on that invoice, with the charge id', qbm.payments.map(p => p.body));
    ok(sql(`select count(*) from money_payments where qb_id='${qbm.payments[0].id}:${qbm.invoices[0].id}' and source='quickbooks' and method='card' and amount_cents=60000`) === '1', 'and in our ledger, once, under the key the QuickBooks sync uses');
    ok(sql(`select status from money_invoices where contract_id='${A.id}' and contract_seq=1`) === 'paid', 'the invoice is paid');
    const mail = await outbox(SIGNER); ok(mail.some(e => /Receipt: \$600\.00/.test(e.subject)) && mail.some(e => /Payment details saved/.test(e.subject)), 'the client got a receipt, and a note that the card was saved');
    const again = await run(today); ok(again.charged === 0 && qbm.charges.length === 1 && qbm.payments.length === 1, 'running the job again the same day takes nothing more');
    ok(sql(`select count(*) from contract_charges where contract_id='${A.id}'`) === '1', 'one attempt on record');

    // the advance notice, three days before the first monthly payment
    const n0 = await run('2027-01-01'); ok(n0.notices === 0 && (await outbox(SIGNER)).filter(e => /Upcoming payment/.test(e.subject)).length === 0, 'no notice yet more than three days before');
    const n1 = await run('2027-01-02'); ok(n1.notices === 1 && (await outbox(SIGNER)).filter(e => /Upcoming payment: \$800\.00 on January 5, 2027/.test(e.subject)).length === 1, 'three days before, the client is told what will be taken, when and from which card');
    await run('2027-01-03'); ok((await outbox(SIGNER)).filter(e => /Upcoming payment/.test(e.subject)).length === 1, 'the notice is sent once');
    ok(qbm.charges.length === 1, 'and nothing is taken before the due date');

    // due date: a decline, then the one retry, then a person
    qbm.declines = 2; const d1 = await run('2027-01-05'); ok(d1.charged === 1 && qbm.charges.length === 2 && qbm.charges[1].answer.status === 'DECLINED', 'on the due date the card is tried, and declined');
    let ov = (await K(`/${A.id}`)).json.autopay.installments[1]; ok(ov.state === 'retry' && ov.attempts[0].status === 'failed', 'the payment shows as retrying', ov);
    const fm = await outbox(SIGNER); ok(fm.some(e => /\$800\.00 did not go through/.test(e.subject)) && fm.some(e => /\$800\.00 did not go through/.test(e.subject) && /try once more on January 8, 2027/.test(e.text)), 'the client is told, and told when the second try is', fm.map(e => e.subject));
    ok((await outbox('')).some(e => /Autopay declined: \$800\.00/.test(e.subject)), 'staff are told');
    await run('2027-01-06'); await run('2027-01-07'); ok(qbm.charges.length === 2, 'no second try before the retry date');
    const d2 = await run('2027-01-08'); ok(d2.charged === 1 && qbm.charges.length === 3, 'three days later there is exactly one retry');
    ov = (await K(`/${A.id}`)).json.autopay.installments[1]; ok(ov.state === 'failed' && ov.attempts.length === 2, 'after the second decline it stops: a person has to follow up', ov);
    ok((await outbox(SIGNER)).some(e => /We could not take \$800\.00/.test(e.subject)) && (await outbox('')).some(e => /Autopay failed twice: \$800\.00/.test(e.subject)), 'the client and staff are told it needs a person');
    await run('2027-01-20'); await run('2027-02-02'); ok(qbm.charges.length === 3 && sql(`select status from money_invoices where contract_id='${A.id}' and contract_seq=2`) === 'sent', 'nothing more is charged by itself, and the invoice stays open');

    // the client puts in a new card; a signer takes the payment
    const t2 = { card: { ...CARD.card, number: '4242424242424242' } };
    const rep = await P(A.token, '/payment-method', { body: { kind: 'card', token: await tokenFor(t2) } }); ok(rep.status === 200 && rep.json.method.label === 'Visa ending 4242' && qbm.deleted.includes('CARD1') && sql(`select count(*) from contract_payment_methods where contract_id='${A.id}' and status='active'`) === '1', 'a new card replaces the old one, and the old one is removed from the provider');
    ok((await C(`/${A.id}/autopay/charge`, { body: { seq: 2, today: '2027-02-02' } })).status === 403, 'only the people who sign for Future Basics can take a payment by hand');
    ok((await K(`/${A.id}/autopay/charge`, { body: { seq: 3, today: '2027-02-02' } })).status === 409, 'a payment that is not due yet cannot be taken early: the agreement says on its due date');
    ok((await K(`/${A.id}/autopay/charge`, { body: { seq: 1, today: '2027-02-02' } })).status === 409, 'a payment already taken cannot be taken again');
    const cn2 = await K(`/${A.id}/autopay/charge`, { body: { seq: 2, today: '2027-02-02' } }); ok(cn2.status === 200 && cn2.json.result === 'succeeded' && qbm.charges.length === 4 && qbm.charges[3].body.cardOnFile === 'CARD2', 'a signer takes the failed payment from the new card', cn2.json.error || cn2.json.result);

    // pause: nothing is taken while paused; resume: it is
    ok((await C(`/${A.id}/autopay/pause`, { body: {} })).status === 403 && (await K(`/${A.id}/autopay/pause`, { body: { reason: 'Client asked' } })).status === 200, 'a signer can pause automatic payments');
    const p1 = await run('2027-03-05'); ok(p1.charged === 0 && qbm.charges.length === 4, 'while paused nothing is taken on the due date');
    ok((await K(`/${A.id}/autopay/resume`, { body: {} })).status === 200, 'and resume them');
    const p2 = await run('2027-03-05'); ok(p2.charged === 2 && qbm.charges.length === 6 && qbm.payments.length === 4, 'after resuming, the two payments that fell due while paused (February\'s and March\'s) are taken, once each');
    await run('2027-03-06'); ok(qbm.charges.length === 6 && owed(A.id) === '0', 'nothing is left to take, and every invoice is paid');
    ok(sql(`select count(*) from money_invoices where contract_id='${A.id}' and status='paid'`) === '4', 'all four invoices are paid');
    ok((await outbox(SIGNER)).filter(e => /Receipt:/.test(e.subject)).length === 4 && (await outbox(SIGNER)).some(e => /last payment/.test(e.text)), 'four receipts, the last one saying the schedule is complete');
    const tr = (await K(`/${A.id}`)).json.events.map(e => e.kind); ok(['payment_method_saved', 'autopay_paid', 'autopay_failed', 'autopay_paused', 'autopay_resumed', 'autopay_charge_now', 'autopay_upcoming'].every(k => tr.includes(k)), 'the trail records every step', [...new Set(tr)]);
    // the page the client sees
    const cp = (await P(A.token)).json.pay; ok(cp.method && cp.method.label === 'Visa ending 4242' && cp.upcoming.every(u => u.state === 'paid'), 'the client\'s page shows the card on file and every payment as paid');
    const csp = (await fetch(`${BASE}/sign/${A.token}`)).headers.get('content-security-policy') || ''; ok(csp.includes("connect-src 'self' http://127.0.0.1:3133"), 'the signing page may talk to the payment provider and nowhere else', csp);
  });

  await journey('J168', 'Automatic payments by bank: the debit is pending until the bank settles it, nothing is taken before delivery is recorded, and a payment taken while QuickBooks is down is booked later, once', async () => {
    const B = await make('B', SIGNER2, planBank, { timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '' } });
    ok((await P(B.token, '/sign', { body: sign({ name: 'Pat Payer' }) })).status === 200 && (await K(`/${B.id}/countersign`, { body: {} })).status === 200, 'signed by both');
    const pay = (await P(B.token)).json.pay; ok(pay.kind === 'bank' && pay.ready && /debit this bank account \(ACH\)/.test(pay.authorization) && /three business days/.test(pay.authorization), 'the page asks for a bank account and shows the authorization wording', pay.kind);
    ok((await P(B.token, '/payment-method', { body: { kind: 'card', token: await tokenFor(CARD) } })).status === 422, 'a card is refused when the agreement is paid by bank debit');
    qbm.paymentsDown = true; const base = qbm.payments.length;
    const saved = await P(B.token, '/payment-method', { body: { kind: 'bank', token: await tokenFor(BANK) } });
    ok(saved.status === 200 && saved.json.method.label === 'Checking account ending 6781' && saved.json.method.last4 === '6781', 'the bank account is saved and shown as "Checking account ending 6781"', saved.json);
    ok(!qbm.seen.some(b => b.includes('11000000333456781') || b.includes('322079353')) && sql(`select count(*) from contract_payment_methods where consent::text like '%6781%' and label like '%11000000%'`) === '0', 'the account and routing numbers never reached us');
    // the deposit was due on signing: the debit goes to the bank and stays pending
    ok(Object.keys(qbm.echecks).length === 1 && qbm.echecks.EC1.body.paymentMode === 'WEB' && qbm.echecks.EC1.body.amount === '1500.00' && qbm.echecks.EC1.body.bankAccountOnFile === 'BANK3', 'the deposit was sent to the bank as a $1,500.00 debit', qbm.echecks);
    let ov = (await K(`/${B.id}`)).json.autopay; ok(ov.installments[0].state === 'pending' && ov.installments[1].state === 'waiting', 'it shows as with the bank, and the balance waits for delivery', ov.installments.map(i => i.state));
    ok(qbm.payments.length === base && sql(`select count(*) from money_payments where invoice_id in (select id from money_invoices where contract_id='${B.id}')`) === '0' && (await outbox(SIGNER2)).every(e => !/Receipt/.test(e.subject)), 'nothing is booked and no receipt goes out while the debit is only pending');
    const w0 = await run(today); ok(w0.polled === 1 && Object.keys(qbm.echecks).length === 1, 'the job asks the bank how it is going and does not send it twice');
    // the bank settles it, but QuickBooks is down at that moment
    qbm.settle = true; const before = qbm.payments.length;
    const w1 = await run(today); ov = (await K(`/${B.id}`)).json.autopay;
    ok(w1.polled === 1 && ov.installments[0].state === 'paid' && qbm.payments.length === before, 'the debit settled: the payment is marked taken');
    ok(ov.installments[0].attempts[0].notBooked === true && /Service unavailable|QuickBooks/.test(ov.installments[0].attempts[0].bookError || '') && sql(`select count(*) from money_payments where invoice_id in (select id from money_invoices where contract_id='${B.id}')`) === '0', 'but QuickBooks was down: it says "taken, not yet in QuickBooks" and nothing was booked twice or lost');
    ok((await outbox(SIGNER2)).some(e => /Receipt: \$1,500\.00/.test(e.subject)), 'the client still gets their receipt');
    qbm.paymentsDown = false;
    const w2 = await run(today); ok(w2.booked === 1 && qbm.payments.length === before + 1 && qbm.payments.at(-1).body.PaymentRefNum === 'EC1', 'when QuickBooks is back the next run books it, once');
    await run(today); ok(qbm.payments.length === before + 1 && sql(`select count(*) from money_payments where invoice_id in (select id from money_invoices where contract_id='${B.id}')`) === '1', 'and never again');
    // the balance is due on delivery
    const w3 = await run('2027-02-20'); ok(w3.charged === 0, 'nothing is taken for the balance until delivery is recorded, whatever the date');
    ok((await C(`/${B.id}/delivered`, { body: { on: '2027-02-15' } })).status === 403, 'only a signer records delivery');
    const dl = await K(`/${B.id}/delivered`, { body: { on: '2027-02-15' } }); ok(dl.status === 200 && dl.json.autopay.installments[1].falls === '2027-02-15', 'delivery recorded: the balance now has a due date', dl.json.autopay && dl.json.autopay.installments[1]);
    const w4 = await run('2027-02-15'); ok(w4.charged === 1 && Object.keys(qbm.echecks).length === 2 && qbm.echecks.EC2.body.amount === '1500.00', 'the balance is debited on that day');
    await run('2027-02-16'); ok((await K(`/${B.id}`)).json.autopay.installments[1].state === 'paid' && owed(B.id) === '0' && qbm.payments.length === before + 2, 'it settles, is booked, and the contract is paid in full');
    ok((await K(`/${B.id}/autopay/request-details`, { body: {} })).status === 409, 'asking for details that are already on file is refused');
  });

  await journey('J169', 'Automatic payments in a browser: the card form checks what it can before anything is sent, the number goes only to the payment provider, and the client lands on a page that says it is set up', async () => {
    if (!playwright) { ok(true, 'no browser available: skipped'); return; }
    const E = await make('E', `pay3-${stamp}@salon.test`, planCard);
    const browser = await playwright.chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }), page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
      const reqs = []; page.on('request', r => { if (r.method() === 'POST') reqs.push({ url: r.url(), data: r.postData() || '' }); });
      await page.goto(`${BASE}/sign/${E.token}`, { waitUntil: 'networkidle' });
      await page.fill('#sName', 'Pat Payer'); await page.check('#sAuto'); await page.check('#sAgree'); await page.check('#sEsign'); await page.click('#sGo');
      await page.waitForSelector('#payBox .payform', { timeout: 10000 });
      ok(/Add your card/.test(await page.locator('#payBox h2').innerText()) && await page.locator('#payBox table tbody tr').count() === 4, 'right after signing the page asks for a card and shows the four payments it is for');
      ok(await page.locator('#pGo').isDisabled(), 'the button stays off until the authorization is ticked');
      const cvc = await page.locator('#cCvc').boundingBox(), zip = await page.locator('#cZip').boundingBox(); ok(cvc.x + cvc.width <= 390 && zip.x + zip.width <= 390, 'every box stays inside a phone screen (the security code no longer spills over)', [cvc, zip]);
      ok(/Test mode/.test(await page.locator('#payBox').innerText()) && /4111 1111 1111 1111/.test(await page.locator('#payBox .testnote').innerText()), 'on test books the form says to use the test card');
      await page.fill('#cNum', '4111111111111111'); ok(await page.inputValue('#cNum') === '4111 1111 1111 1111', 'the card number is grouped as it is typed');
      await page.fill('#cNum', ''); await page.locator('#cNum').pressSequentially('4111111111111111'); ok(await page.inputValue('#cNum') === '4111 1111 1111 1111', 'typed one key at a time it ends up whole, not cut short');
      await page.locator('#cNum').evaluate(el => el.setSelectionRange(9, 9)); await page.keyboard.press('Backspace'); await page.keyboard.type('1'); ok(await page.inputValue('#cNum') === '4111 1111 1111 1111', 'a digit fixed in the middle goes where the cursor is');
      await page.fill('#cNum', '378282246310005'); ok(await page.inputValue('#cNum') === '3782 822463 10005', 'an American Express number is grouped 4-6-5');
      await page.fill('#cExp', '0831'); ok(await page.inputValue('#cExp') === '08/31', 'the expiry gets its slash by itself');
      await page.fill('#cExp', '9'); ok(await page.inputValue('#cExp') === '09/', 'a month typed as 9 becomes 09');
      await page.fill('#cExp', '10/2029'); ok(await page.inputValue('#cExp') === '10/29', 'an expiry filled in by the phone as 10/2029 becomes 10/29');
      await page.fill('#cCvc', '12a3'); ok(await page.inputValue('#cCvc') === '123', 'the security code takes digits only');
      if (process.env.JOURNEY_SHOT_DIR) await page.locator('#payBox').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR}/autopay-card-form.png` });
      await page.fill('#cName', 'Pat Payer'); await page.fill('#cNum', '4111 1111 1111 1112'); await page.fill('#cExp', '08/31'); await page.fill('#cCvc', '123'); await page.fill('#cZip', '19401'); await page.check('#pAuth');
      const n0 = reqs.length; await page.click('#pGo'); await page.waitForTimeout(300);
      ok(/does not look right/.test(await page.locator('#pMsg').innerText()) && reqs.length === n0, 'a card number that fails the check is stopped on the page, with nothing sent anywhere');
      await page.fill('#cNum', '4111 1111 1111 1111'); await page.fill('#cExp', '01/20'); await page.click('#pGo'); await page.waitForTimeout(200);
      ok(/expired/.test(await page.locator('#pMsg').innerText()), 'an expired card is stopped too');
      await page.fill('#cExp', '08/31'); await page.click('#pGo');
      await page.waitForFunction(() => /set up/i.test(document.querySelector('#payBox h2')?.textContent || ''), null, { timeout: 15000 });
      ok(/Visa ending 1111/.test(await page.locator('#payBox').innerText()), 'it ends on "Automatic payments are set up" with the card shown as Visa ending 1111');
      const tok = reqs.find(r => r.url.startsWith(MOCK) && r.url.endsWith('/tokens')), ours = reqs.find(r => r.url.endsWith('/payment-method'));
      ok(tok && tok.data.includes('4111111111111111') && ours && !ours.data.includes('4111') && /"token":"tok_/.test(ours.data), 'the card number went to the payment provider only; what reached us is the one-time token');
      ok(await page.locator('#cNum').count() === 0, 'and the form is gone from the page');
      ok(page.errs.length === 0, 'no page errors', page.errs);
      // staff see it on the contract
      await C(`/${E.id}/countersign`, { body: {} }).catch(() => {}); await K(`/${E.id}/countersign`, { body: {} });
      const sctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }); await sctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyle);
      const sp = await sctx.newPage(); await sp.goto(`${BASE}/contracts?open=${E.id}`, { waitUntil: 'networkidle' }); await sp.waitForSelector('#apBox', { timeout: 10000 });
      const txt = await sp.locator('#apBox').evaluate(el => el.textContent.replace(/\s+/g, ' ')); ok(/Visa ending 1111/i.test(txt) && /Paid/i.test(txt) && /Scheduled/i.test(txt) && /Pause automatic payments/i.test(txt), 'staff see the card on file, which payment is paid, which are scheduled, and the pause button', txt.slice(0, 200));
      if (process.env.JOURNEY_SHOT_DIR) await sp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR}/autopay-staff.png` });
    } finally { await browser.close(); }
  });

  await journey('J172', 'Payment details still owed: the signer is emailed an hour after signing and reminded every three days, three times at most, and never again once the details are on file', async () => {
    const D = await make('D', SIGNER3, planCard);
    ok((await P(D.token, '/sign', { body: sign() })).status === 200 && (await K(`/${D.id}/countersign`, { body: {} })).status === 200, 'signed by both, with automatic payments agreed and no details yet');
    const asks = async () => (await outbox(SIGNER3)).filter(e => /Add your payment details/.test(e.subject));
    await run(new Date().toISOString().slice(0, 10)); ok((await asks()).length === 0, 'nothing is sent in the first hour: they may be adding them right now');
    await run('2030-01-01'); ok((await asks()).length === 1 && !/^Reminder/.test((await asks())[0].subject), 'later, one email asks for the details');
    await run('2030-01-02'); ok((await asks()).length === 1, 'and a second run the next day sends nothing more');
    await run('2030-01-04'); ok((await asks()).length === 2 && (await asks()).filter(e => /^Reminder/.test(e.subject)).length === 1, 'three days on there is a reminder');
    await run('2030-01-07'); await run('2030-01-10'); ok((await asks()).length === 4, 'three reminders in all');
    await run('2030-01-13'); await run('2030-02-20'); ok((await asks()).length === 4, 'and then it stops');
    const E2 = await make('E2', SIGNER3.replace('pay3', 'pay4'), planCard); await P(E2.token, '/sign', { body: sign() }); await K(`/${E2.id}/countersign`, { body: {} });
    await connect(); ok((await P(E2.token, '/payment-method', { body: { kind: 'card', token: await tokenFor(CARD) } })).status === 200, 'another client adds a card');
    await run('2031-01-01'); ok((await outbox(SIGNER3.replace('pay3', 'pay4'))).every(e => !/Add your payment details/.test(e.subject)), 'and is never asked once the details are on file');
  });

  await journey('J173', 'Automatic payments through Stripe: cards (with Apple Pay), and bank debits, are added on Stripe\'s own page, charged once on their due date, and every payment is booked in QuickBooks with Stripe\'s fee kept', async () => {
    const set = await K('/autopay/processor', { method: 'PUT', body: { processor: 'stripe' } }); ok(set.status === 200 && set.json.payments.processor === 'stripe' && set.json.payments.stripe.configured, 'staff switch automatic payments to Stripe', set.json);
    ok((await C('/autopay/processor', { method: 'PUT', body: { processor: 'quickbooks' } })).status === 403, 'only a signer can switch it back');
    const F = await make('F', SIGNER4, planCard); ok((await P(F.token, '/sign', { body: sign() })).status === 200 && (await K(`/${F.id}/countersign`, { body: {} })).status === 200, 'a card contract is signed by both');
    const pay = (await P(F.token)).json.pay; ok(pay.hosted && pay.processor === 'stripe' && pay.ready && pay.tokensUrl === null && pay.kind === 'card', 'the client page uses the Stripe page, not our own card form', pay);
    ok((await P(F.token, '/payment-session', { body: {} })).status === 422, 'the client has to tick the authorization first');
    const ps = await P(F.token, '/payment-session', { body: { agree: true, kind: 'bank' } }); ok(ps.status === 422, 'asking for a bank account on a card contract is refused');
    const st = await P(F.token, '/payment-session', { body: { agree: true, kind: 'card' } }); ok(st.status === 200 && /\/pay\/cs_test_/.test(st.json.url), 'the client is sent to Stripe\'s page', st.json);
    const sid = st.json.url.split('/pay/')[1], sess = stm.sessions[sid];
    ok(sess.params.mode === 'setup' && sess.params.currency === 'usd' && sess.types.join() === 'card' && sess.metadata.contract === F.id && sess.params.success_url.includes(`/sign/${F.token}`) && sess.params.success_url.includes('{CHECKOUT_SESSION_ID}') && stm.customers.some(c => c.id === sess.customer && c.email === SIGNER4), 'a setup session for a card, for this contract and this signer, that returns to the agreement page', sess.params);
    ok(sql(`select count(*) from contract_payment_methods where contract_id='${F.id}'`) === '0', 'nothing is saved until Stripe says so');
    const early = await P(F.token, '/payment-session/complete', { body: { sessionId: sid } }); ok(early.status === 409, 'coming back without finishing on Stripe saves nothing', early.json);
    stripeFinish(sid, 'pm_card_ok');
    const other = await make('F2', SIGNER5, planCard); await P(other.token, '/sign', { body: sign() }); await K(`/${other.id}/countersign`, { body: {} });
    const sid2 = (await P(other.token, '/payment-session', { body: { agree: true, kind: 'card' } })).json.url.split('/pay/')[1]; stripeFinish(sid2, 'pm_card_ok');
    ok((await P(F.token, '/payment-session/complete', { body: { sessionId: sid2 } })).status === 403, 'another agreement\'s payment page cannot be used on this one');
    const done = await P(F.token, '/payment-session/complete', { body: { sessionId: sid } }); ok(done.status === 200 && done.json.method.label === 'Apple Pay · Visa ending 4242' && done.json.method.last4 === '4242', 'back from Stripe the card is kept, and named for what it is (Apple Pay)', done.json);
    ok(sql(`select processor||'|'||kind||'|'||instrument_id from contract_payment_methods where contract_id='${F.id}' and status='active'`) === 'stripe|card|pm_card_ok', 'kept as a Stripe payment method, with only its id and last four digits');
    // the deposit that fell due on signing is taken at once
    const pi = Object.values(stm.intents).find(x => x.meta?.contract === F.number && x.meta.seq === '1'); const req1 = stm.seen.find(x => x.path === '/v1/payment_intents' && x.raw.includes(encodeURIComponent(F.number)));
    ok(pi && pi.amount === 60000 && pi.status === 'succeeded' && /idempotency|fb-ch-/.test(req1.idem) && req1.raw.includes('off_session=true') && req1.raw.includes('confirm=true') && req1.raw.includes('payment_method_types%5B%5D=card'), 'the deposit is charged off-session for $600.00 with a fixed idempotency key', { pi, idem: req1?.idem });
    const qbPay = qbm.payments.at(-1); ok(qbPay && qbPay.body.TotalAmt === 600 && qbPay.body.PaymentRefNum === pi.id.slice(0, 21) && /Stripe/.test(qbPay.body.PrivateNote), 'it is booked in QuickBooks as a payment on the invoice, referenced by the Stripe payment', qbPay);
    ok(sql(`select count(*) from money_payments where reference='${pi.id}' and source='quickbooks' and method='card' and amount_cents=60000`) === '1', 'and in our ledger, once');
    await sleep(500); ok(sql(`select fee_cents||'|'||net_cents from contract_charges where contract_id='${F.id}' and seq=1`) === '1770|58230', 'Stripe\'s fee ($17.70) and what reaches the bank ($582.30) are kept with the payment', sql(`select fee_cents||'|'||net_cents from contract_charges where contract_id='${F.id}' and seq=1`));
    const mail = await outbox(SIGNER4); ok(mail.some(e => /Receipt: \$600\.00/.test(e.subject)) && mail.some(e => /Payment details saved/.test(e.subject)), 'the client got a receipt and a note that the details are saved');
    const again = await run(today); ok(stm.seen.filter(x => x.path === '/v1/payment_intents' && x.raw.includes(encodeURIComponent(F.number))).length === 1, 'running the job again takes nothing more');
    // Stripe's webhook: refuses what is not signed by Stripe, and a repeat changes nothing
    ok((await hook('checkout.session.completed', { id: sid, mode: 'setup', metadata: { contract: F.id } }, { badSig: true })).status === 401 && (await hook('checkout.session.completed', { id: sid, mode: 'setup', metadata: { contract: F.id } }, { secret: 'whsec_other' })).status === 401, 'a webhook not signed by Stripe is refused');
    ok((await hook('checkout.session.completed', { id: sid, mode: 'setup', metadata: { contract: F.id } })).status === 200 && sql(`select count(*) from contract_payment_methods where contract_id='${F.id}'`) === '1', 'a repeated "details saved" from Stripe changes nothing');
    // a client who never made it back to our page is still saved, from Stripe's own word
    const G2 = await make('G2', SIGNER6, planCard); await P(G2.token, '/sign', { body: sign() }); await K(`/${G2.id}/countersign`, { body: {} });
    if (playwright) {
      const br = await playwright.chromium.launch(); const errs = [];
      try { const pg = await (await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage(); pg.on('pageerror', e => errs.push(String(e)));
        await pg.goto(`${BASE}/sign/${G2.token}`, { waitUntil: 'networkidle' }); await pg.waitForSelector('#pGo', { timeout: 10000 });
        const txt = await pg.locator('#payBox').innerText(); ok(/Apple Pay/.test(txt) && /Google Pay/.test(txt) && /Continue to secure payment/.test(txt) && !(await pg.locator('#cNum').count()), 'on a phone the page offers Apple Pay, Google Pay or a card on the secure page, and has no card form of its own');
        ok(await pg.locator('#pGo').isDisabled(), 'the button waits for the authorization'); await pg.check('#pAuth'); ok(await pg.locator('#pGo').isEnabled(), 'and wakes once it is ticked');
        await Promise.all([pg.waitForURL(/127\.0\.0\.1:3135\/pay\/cs_test_/, { timeout: 10000 }).catch(() => {}), pg.click('#pGo')]); ok(/3135\/pay\/cs_test_/.test(pg.url()), 'pressing it takes them to Stripe\'s page', pg.url());
        ok(errs.length === 0, 'no page errors', errs);
      } finally { await br.close(); }
    }
    const sid3 = (await P(G2.token, '/payment-session', { body: { agree: true, kind: 'card' } })).json.url.split('/pay/')[1]; stripeFinish(sid3, 'pm_card_ok');
    ok((await hook('checkout.session.completed', { id: sid3, mode: 'setup', metadata: { contract: G2.id } })).status === 200 && sql(`select label from contract_payment_methods where contract_id='${G2.id}' and status='active'`) === 'Apple Pay · Visa ending 4242', 'a client who closed the tab on Stripe\'s page is still saved, by Stripe\'s webhook');
    // changing the card detaches the old one at Stripe
    const sid4 = (await P(F.token, '/payment-session', { body: { agree: true, kind: 'card' } })).json.url.split('/pay/')[1]; stripeFinish(sid4, 'pm_card_declined');
    ok((await P(F.token, '/payment-session/complete', { body: { sessionId: sid4 } })).status === 200 && stm.detached.includes('pm_card_ok') && sql(`select count(*) from contract_payment_methods where contract_id='${F.id}' and status='active'`) === '1', 'a new card replaces the old one, which is removed at Stripe');
    // a card the bank refuses: tried again once, then left to a person
    await run('2027-01-05'); const fm = await outbox(SIGNER4); ok(fm.some(e => /\$800\.00 did not go through/.test(e.subject) && /declined/i.test(e.text)), 'a declined card is told plainly, with the reason from the bank');
    await run('2027-01-08'); ok((await outbox(SIGNER4)).some(e => /We could not take \$800\.00/.test(e.subject)) && (await outbox('')).some(e => /Autopay failed twice: \$800\.00/.test(e.subject)), 'after one retry the client and staff are told it needs a person');
    // bank debits: a bank account on Stripe, pending until the bank settles it
    const B2 = await make('B2', SIGNER2.replace('pay2', 'pay2s'), planBank, { timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '' } });
    await P(B2.token, '/sign', { body: sign({ name: 'Pat Payer' }) }); await K(`/${B2.id}/countersign`, { body: {} });
    const bsr = await P(B2.token, '/payment-session', { body: { agree: true, kind: 'bank' } }); ok(bsr.status === 200, 'the bank contract opens Stripe', bsr.json); const bs = bsr.json.url.split('/pay/')[1], bsess = stm.sessions[bs];
    ok(bsess.types.join() === 'us_bank_account' && bsess.params['payment_method_options[us_bank_account][financial_connections][permissions][]'] === 'payment_method', 'a bank contract opens Stripe\'s bank page (instant bank sign-in, or account numbers)');
    stripeFinish(bs, 'pm_bank_ok', { status: 'requires_action', next_action: { type: 'verify_with_microdeposits' } }); stm.sessions[bs].si.payment_method = PMS.pm_bank_ok;
    const pend = await P(B2.token, '/payment-session/complete', { body: { sessionId: bs } }); ok(pend.status === 202 && pend.json.pending && sql(`select count(*) from contract_payment_methods where contract_id='${B2.id}'`) === '0', 'a bank account waiting for its test deposits is not kept yet, and the client is told what happens next', pend.json);
    stm.sessions[bs].si.status = 'succeeded'; delete stm.sessions[bs].si.next_action;
    ok((await hook('setup_intent.succeeded', { id: stm.sessions[bs].si.id, metadata: { contract: B2.id } })).status === 200 && sql(`select label from contract_payment_methods where contract_id='${B2.id}' and status='active'`) === 'Checking account ending 6789', 'once the bank confirms, Stripe tells us and the account is kept');
    const dep = Object.values(stm.intents).find(x => x.meta?.contract === B2.number); ok(dep && dep.amount === 150000 && dep.status === 'processing' && dep.types.join() === 'us_bank_account', 'the $1,500.00 deposit goes to the bank as an ACH debit and is processing', dep);
    const ov2 = (await K(`/${B2.id}`)).json.autopay; ok(ov2.installments[0].state === 'pending', 'it shows as with the bank', ov2.installments.map(i => i.state));
    const beforeBooked = qbm.payments.length; dep.status = 'succeeded';
    ok((await hook('payment_intent.succeeded', { id: dep.id })).status === 200, 'Stripe says the debit settled');
    await sleep(500); ok(qbm.payments.length === beforeBooked + 1 && sql(`select count(*) from money_payments where reference='${dep.id}'`) === '1' && (await outbox(SIGNER2.replace('pay2', 'pay2s'))).some(e => /Receipt: \$1,500\.00/.test(e.subject)), 'it is then booked in QuickBooks and the ledger, and the client gets a receipt');
    ok(!stm.seen.some(x => /4111|4242424242424242|11000000333456781|322079353/.test(x.raw)), 'no card or bank number ever reached us or Stripe through us');
    const back = await K('/autopay/processor', { method: 'PUT', body: { processor: 'quickbooks' } }); ok(back.status === 200 && back.json.payments.processor === 'quickbooks', 'and staff can switch back to QuickBooks Payments');
  });
} finally { mock.close(); stripeMock.close(); }
const bad = summary(); process.exit(bad ? 1 : 0);
