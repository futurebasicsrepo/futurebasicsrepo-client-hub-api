// QuickBooks Online for the Money hub: sign in once through Intuit, then create and send an invoice there and read payments back.
// Plain functions with the network passed in, so every rule is tested against a stand-in server and never needs a live account.
//   Keys come from the service environment only: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_ENV (sandbox | production).
//   The tokens Intuit hands back are stored sealed (see shopify-merchant.js sealer) and are never sent to a browser or written to a log.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCOPE = 'com.intuit.quickbooks.accounting';
export const MINOR = '75';
const b64 = b => Buffer.from(b).toString('base64url');
const origin = (name, dflt, env) => String(env[name] || dflt).replace(/\/$/, '');

export function qbConfig(env = process.env, workUrl = 'https://work.thefuturebasics.com') {
  const clientId = env.QUICKBOOKS_CLIENT_ID || '', clientSecret = env.QUICKBOOKS_CLIENT_SECRET || '', mode = env.QUICKBOOKS_ENV === 'production' ? 'production' : 'sandbox';
  return { ready: Boolean(clientId && clientSecret), clientId, clientSecret, mode, redirectUri: env.QUICKBOOKS_REDIRECT_URI || `${String(workUrl).replace(/\/$/, '')}/v1/money/quickbooks/callback`,
    authOrigin: origin('QUICKBOOKS_AUTH_ORIGIN', 'https://appcenter.intuit.com', env), oauthOrigin: origin('QUICKBOOKS_OAUTH_ORIGIN', 'https://oauth.platform.intuit.com', env), revokeOrigin: origin('QUICKBOOKS_REVOKE_ORIGIN', 'https://developer.api.intuit.com', env),
    apiOrigin: origin('QUICKBOOKS_API_ORIGIN', mode === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com', env),
    appOrigin: origin('QUICKBOOKS_APP_ORIGIN', mode === 'production' ? 'https://app.qbo.intuit.com' : 'https://app.sandbox.qbo.intuit.com', env),
    // Intuit's discovery document names the current sign-in endpoints. A stand-in server (any *_ORIGIN override) has none, so it is skipped there.
    discoveryUrl: env.QUICKBOOKS_DISCOVERY_URL ?? (['AUTH', 'OAUTH', 'REVOKE'].some(k => env[`QUICKBOOKS_${k}_ORIGIN`]) ? '' : `https://developer.api.intuit.com/.well-known/openid${mode === 'production' ? '' : '_sandbox'}_configuration`) };
}

// The endpoints of the OAuth2 flow, from the discovery document (kept for a day), or the ones written here when it cannot be read.
const cache = new Map();
export async function endpoints(cfg, fetchImpl = fetch, now = Date.now()) {
  const fallback = { auth: `${cfg.authOrigin}/connect/oauth2`, token: `${cfg.oauthOrigin}/oauth2/v1/tokens/bearer`, revoke: `${cfg.revokeOrigin}/v2/oauth2/tokens/revoke`, from: 'built-in' };
  if (!cfg.discoveryUrl) return fallback;
  const hit = cache.get(cfg.discoveryUrl); if (hit && hit.until > now) return hit.value;
  let value = fallback;
  try {
    const res = await fetchImpl(cfg.discoveryUrl, { headers: { Accept: 'application/json' } }), j = await res.json();
    const ok = u => typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\.intuit\.com\//i.test(u); // only an Intuit address is ever trusted with the client secret
    if (res.ok && ok(j.authorization_endpoint) && ok(j.token_endpoint)) value = { auth: j.authorization_endpoint, token: j.token_endpoint, revoke: ok(j.revocation_endpoint) ? j.revocation_endpoint : fallback.revoke, from: 'discovery' };
  } catch { /* the built-in addresses */ }
  cache.set(cfg.discoveryUrl, { value, until: now + (value.from === 'discovery' ? 86_400_000 : 300_000) });
  return value;
}
export const forgetEndpoints = () => cache.clear();

// The `state` of the sign-in: who started it and when, signed, so only a sign-in this service began can finish.
export function signState(secret, userId, now = Date.now()) { const body = b64(JSON.stringify({ u: userId, exp: now + 10 * 60_000, n: randomBytes(8).toString('hex') })); return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`; }
export function readState(secret, state, now = Date.now()) {
  const [body, sig] = String(state || '').split('.'); if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest(), got = Buffer.from(sig, 'base64url'); if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const j = JSON.parse(Buffer.from(body, 'base64url').toString()); return j.exp > now && j.u ? j : null; } catch { return null; }
}
export const authUrl = (cfg, state, ep) => `${ep?.auth || `${cfg.authOrigin}/connect/oauth2`}?${new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', scope: SCOPE, redirect_uri: cfg.redirectUri, state })}`;

const basic = cfg => `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
const tidOf = res => { try { return res.headers?.get?.('intuit_tid') || ''; } catch { return ''; } };
async function tokenCall(cfg, form, fetchImpl) {
  const ep = await endpoints(cfg, fetchImpl);
  const res = await fetchImpl(ep.token, { method: 'POST', headers: { Authorization: basic(cfg), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }).catch(() => { throw new Error('Could not reach QuickBooks to sign in'); });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw Object.assign(new Error(res.status === 400 || res.status === 401 ? 'QuickBooks refused the sign-in (the code expired, or the Client ID and Secret do not match the app)' : `QuickBooks answered ${res.status} to the sign-in`), { refused: res.status === 400 || res.status === 401, status: res.status, tid: tidOf(res), code: j.error });
  const now = Date.now();
  return { accessToken: j.access_token, refreshToken: j.refresh_token, accessExpiresAt: new Date(now + (Number(j.expires_in) || 3600) * 1000), refreshExpiresAt: new Date(now + (Number(j.x_refresh_token_expires_in) || 8_640_000) * 1000) };
}
export const exchangeCode = (cfg, code, fetchImpl = fetch) => tokenCall(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }, fetchImpl);
export const refreshTokens = (cfg, refreshToken, fetchImpl = fetch) => tokenCall(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl);
export async function revoke(cfg, token, fetchImpl = fetch) { try { const ep = await endpoints(cfg, fetchImpl); await fetchImpl(ep.revoke, { method: 'POST', headers: { Authorization: basic(cfg), Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); return true; } catch { return false; } }

// A call to the accounting API for one connected company. ctx: { cfg, conn: { realmId, accessToken, refreshToken, accessExpiresAt }, save(tokens), fetchImpl }.
// An expired access token is refreshed first (and the new pair saved: Intuit rotates the refresh token); a 401 is retried once after a refresh.
export async function qb(ctx, path, { method = 'GET', body, raw = false, query = {} } = {}) {
  const { cfg, conn, fetchImpl = fetch } = ctx;
  const refresh = async () => { const t = await refreshTokens(cfg, conn.refreshToken, fetchImpl); Object.assign(conn, t); await ctx.save?.(t); };
  if (!conn.accessToken || new Date(conn.accessExpiresAt).getTime() < Date.now() + 60_000) await refresh();
  const url = `${cfg.apiOrigin}/v3/company/${encodeURIComponent(conn.realmId)}${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ ...query, minorversion: MINOR })}`;
  const go = () => fetchImpl(url, { method, headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : raw ? { 'Content-Type': 'application/octet-stream' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }).catch(() => { throw new Error('Could not reach QuickBooks'); });
  let res = await go(); if (res.status === 401) { await refresh(); res = await go(); }
  const j = await res.json().catch(() => ({})), tid = tidOf(res);
  if (!res.ok) {
    const e = j.Fault?.Error?.[0], detail = String(e?.Detail || e?.Message || `answered ${res.status}`).slice(0, 220);
    // every failed call is logged with what Intuit support asks for (the intuit_tid, the status, the code, the path): never a token or a body
    ctx.log?.warn?.({ quickbooks: true, status: res.status, intuit_tid: tid, code: e?.code, fault: e?.Message, detail: e?.Detail, method, path: path.split('?')[0].replace(/\/\d+$/, '/{id}') }, 'QuickBooks call failed');
    throw Object.assign(new Error(res.status === 401 ? 'QuickBooks no longer accepts this connection: connect it again' : `QuickBooks: ${detail}`), { status: res.status, code: e?.code, refused: res.status === 401, tid });
  }
  return j;
}
const esc = v => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export const query = (ctx, sql) => qb(ctx, '/query', { query: { query: sql } }).then(j => j.QueryResponse || {});

export async function companyInfo(ctx) { const j = await qb(ctx, `/companyinfo/${encodeURIComponent(ctx.conn.realmId)}`); const c = j.CompanyInfo || {}; return { name: c.CompanyName || c.LegalName || '', legalName: c.LegalName || '', country: c.Country || '' }; }

// ---------- what we send ----------
const usd = cents => Math.round(Number(cents)) / 100;
// An invoice row (money_invoices, snake_case) → the QuickBooks invoice. Tax is sent as its own line (the amount we charged), a deposit already paid as QuickBooks's own Deposit.
export function invoicePayload(inv, { customerId, itemId, itemName = 'Services', onlinePayments = true } = {}) {
  const lines = (inv.lines || []).map(l => ({ Amount: usd(Math.round(Number(l.qty) * Number(l.rateCents))), DetailType: 'SalesItemLineDetail', Description: String(l.description).slice(0, 4000), SalesItemLineDetail: { ItemRef: { value: itemId, name: itemName }, Qty: Number(l.qty), UnitPrice: usd(l.rateCents) } }));
  if (Number(inv.tax_cents) > 0) lines.push({ Amount: usd(inv.tax_cents), DetailType: 'SalesItemLineDetail', Description: `Sales tax (${Number(inv.tax_rate)}%)`, SalesItemLineDetail: { ItemRef: { value: itemId, name: itemName }, Qty: 1, UnitPrice: usd(inv.tax_cents) } });
  const deposit = (inv.credits || []).reduce((a, c) => a + Number(c.amountCents || 0), 0);
  return { CustomerRef: { value: customerId }, DocNumber: String(inv.number).slice(0, 21), TxnDate: String(inv.issued_on).slice(0, 10), DueDate: String(inv.due_on).slice(0, 10), Line: lines, GlobalTaxCalculation: 'NotApplicable',
    ...(inv.contact_email ? { BillEmail: { Address: inv.contact_email } } : {}), ...(inv.notes ? { CustomerMemo: { value: String(inv.notes).slice(0, 1000) } } : {}), ...(deposit > 0 ? { Deposit: usd(deposit) } : {}),
    PrivateNote: 'Created from Future Basics Money', ...(onlinePayments ? { AllowOnlineCreditCardPayment: true, AllowOnlineACHPayment: true } : {}) };
}
export function customerPayload(inv) {
  const lines = String(inv.address || '').split('\n').map(s => s.trim()).filter(Boolean), last = lines[lines.length - 1] || '', m = /^(.*?),?\s+([A-Za-z]{2})[ ,]+(\d{5}(?:-\d{4})?)$/.exec(last);
  return { DisplayName: String(inv.company).slice(0, 100), CompanyName: String(inv.company).slice(0, 100), ...(inv.contact_name ? { GivenName: String(inv.contact_name).split(' ')[0].slice(0, 25), FamilyName: String(inv.contact_name).split(' ').slice(1).join(' ').slice(0, 25) } : {}), ...(inv.contact_email ? { PrimaryEmailAddr: { Address: inv.contact_email } } : {}),
    ...(lines.length ? { BillAddr: m ? { Line1: lines[0].slice(0, 500), ...(lines.length > 2 ? { Line2: lines[1].slice(0, 500) } : {}), City: m[1].slice(0, 255), CountrySubDivisionCode: m[2].toUpperCase(), PostalCode: m[3] } : { Line1: lines[0].slice(0, 500), ...(lines[1] ? { Line2: lines[1].slice(0, 500) } : {}) } } : {}) };
}

// The customer by name, made when there is none.
export async function ensureCustomer(ctx, inv) {
  const found = (await query(ctx, `select Id, DisplayName from Customer where DisplayName = '${esc(String(inv.company).slice(0, 100))}' maxresults 1`)).Customer?.[0];
  if (found) return { id: found.Id, created: false };
  const j = await qb(ctx, '/customer', { method: 'POST', body: customerPayload(inv) }); return { id: j.Customer.Id, created: true };
}
// A service item to hang the lines on: the first one the company has, else a new "Services" on its first income account.
export async function ensureItem(ctx) {
  const it = (await query(ctx, `select Id, Name from Item where Type = 'Service' and Active = true maxresults 1`)).Item?.[0]; if (it) return { id: it.Id, name: it.Name };
  const acct = (await query(ctx, `select Id from Account where AccountType = 'Income' and Active = true maxresults 1`)).Account?.[0]; if (!acct) throw new Error('QuickBooks has no income account to put the invoice on: add one in QuickBooks first');
  const j = await qb(ctx, '/item', { method: 'POST', body: { Name: 'Services', Type: 'Service', IncomeAccountRef: { value: acct.Id } } }); return { id: j.Item.Id, name: j.Item.Name };
}
// Make the invoice in QuickBooks, optionally have QuickBooks email it. → { id, docNumber, syncToken, emailed }
export async function pushInvoice(ctx, inv, { send = false, onlinePayments = true } = {}) {
  const customer = await ensureCustomer(ctx, inv), item = await ensureItem(ctx);
  const j = await qb(ctx, '/invoice', { method: 'POST', body: invoicePayload(inv, { customerId: customer.id, itemId: item.id, itemName: item.name, onlinePayments }) }), made = j.Invoice;
  let emailed = false; if (send && inv.contact_email) { await qb(ctx, `/invoice/${encodeURIComponent(made.Id)}/send`, { method: 'POST', raw: true, query: { sendTo: inv.contact_email } }); emailed = true; }
  return { id: made.Id, docNumber: made.DocNumber, syncToken: made.SyncToken, emailed, customerId: customer.id, customerCreated: customer.created };
}

// Payments QuickBooks has recorded since a time, as { id, paidOn, amountCents, customer, reference, method, applied: [{ invoiceId, amountCents }], unappliedCents }.
export async function paymentsSince(ctx, sinceIso) {
  const out = []; let start = 1;
  for (let page = 0; page < 20; page++) {
    const r = await query(ctx, `select * from Payment where MetaData.LastUpdatedTime > '${esc(sinceIso)}' order by MetaData.LastUpdatedTime startposition ${start} maxresults 100`), list = r.Payment || [];
    for (const p of list) {
      const applied = []; for (const l of p.Line || []) for (const t of l.LinkedTxn || []) if (t.TxnType === 'Invoice') applied.push({ invoiceId: String(t.TxnId), amountCents: Math.round(Number(l.Amount) * 100) });
      out.push({ id: String(p.Id), paidOn: String(p.TxnDate || '').slice(0, 10), amountCents: Math.round(Number(p.TotalAmt) * 100), customer: p.CustomerRef?.name || '', reference: p.PaymentRefNum || '', method: String(p.PaymentMethodRef?.name || '').toLowerCase(), applied, unappliedCents: Math.round(Number(p.UnappliedAmt || 0) * 100) });
    }
    if (list.length < 100) break; start += 100;
  }
  return out;
}
export const methodOf = name => (/ach|bank|echeck/.test(name) ? 'ach' : /card|visa|master|amex|credit/.test(name) ? 'card' : /wire/.test(name) ? 'wire' : /check|cheque/.test(name) ? 'check' : /cash/.test(name) ? 'cash' : 'quickbooks');
