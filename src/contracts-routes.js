// Contracts for digital work and physical product development. Staff build one from a deal and its project, send it for signature, and see who has opened and signed it; the client opens a private
// link, reads the whole agreement and signs with a finger (or a mouse) and their typed name. See contracts.js for the rules and docs/contracts.md for the flow.
//
//   Staff (any signed-in teammate unless noted)
//   GET  /v1/contracts                      the list, newest first (?status=, ?q=)
//   GET  /v1/contracts/sources              deals and projects a contract can be made from, with the contracts already made for each
//   GET  /v1/contracts/draft?deal=|project=|quote=|productQuote= a contract filled in from one (nothing is saved). With an order quote (named, or the deal's or
//                                           project's: accepted first, else the latest sent) it is priced per unit from the quote's lines, its other
//                                           lines (setup, freight) and the sales tax rate in Settings
//   GET  /v1/contracts/delivery?address=     the state and PA local tax an address reads as (sales tax follows where the goods are delivered)
//   GET  /v1/contracts/account-address?company=&email=&project=&client=   the client's address on file (hub account, last contract, last invoice, Shopify)
//   GET  /v1/contracts/template?kind=        the standard wording for a kind (digital work or a physical product) and the product options
//   POST /v1/contracts/render               { content } → the finished text and what is still missing (nothing is saved)
//   POST /v1/contracts/render.pdf           { content, number? } → the PDF of it, marked as a draft (nothing is saved)
//   GET|PUT /v1/contracts/settings          who signs for Future Basics, the address and the governing law the wording uses
//   POST /v1/contracts                      { content, dealId?, projectId? } → a draft
//   GET  /v1/contracts/:id   PUT /v1/contracts/:id (drafts only)   GET /v1/contracts/:id/pdf
//   POST /v1/contracts/:id/send             { message?, signNow? } email the signing link (signNow signs for Future Basics, signers only)
//   POST /v1/contracts/:id/remind | link | revise | void { reason }
//   POST /v1/contracts/:id/countersign      signers only (the people named for Money): sign for Future Basics
//   POST /v1/contracts/:id/ink              the person who signed with a typed name puts their handwritten signature on it (while it waits on the client)
//   POST /v1/contracts/:id/invoices         signers only: draft an invoice for every payment in the schedule of a signed contract
//   GET  /v1/contracts/:id/invoices/candidates   signers only: the client's Money invoices that could belong to it (same room, company, project or deal)
//   POST /v1/contracts/:id/invoices/link { invoiceId }   POST …/unlink { invoiceId }   signers only: an invoice sent outside the schedule (a Shopify
//                                           link, a deposit) belongs to the contract; only one linked by hand can be unlinked
//   POST /v1/contracts/:id/close { note? }  signers only: close it out: settled outside the signing flow (paid, never signed) or done and paid;
//                                           the deal is won at its value       POST /v1/contracts/:id/reopen   back to the status it was closed from
//
//   The client (no sign-in: the link is the key)
//   GET  /v1/public/contracts/:token        the agreement as the client sees it      GET .../pdf
//   POST /v1/public/contracts/:token/sign { name, title, agree, esign, autopay?, method?, ink? (the signature drawn with a finger, a PNG data URL) }      POST .../decline { reason }
//
// Sales: every contract is a deal (sales-deals.js syncContractDeal). Saving a draft opens one at Meeting worth the contract's total (or uses the deal it
// was made from), sending moves it to Proposal, signing by both wins it, and declining, expiring or voiding loses it unless something else on it is live.
import { addressLine } from './onboarding.js';
import { invoiceOf, sizesWords } from './order-quotes.js';
import { cleanTaxRate, taxOf, taxableOf, unitsTotal, taxRule, stateOf, localOf, US_STATES, REGISTERED_STATES, PA_LOCAL, cleanUnits, cleanContent, renderContract, sendProblems, docHash, signToken, readToken, nextNumber, checkSignature, buildPlan, planWords, dueWords, schedule, defaultSections, dollars, longDate, todayISO, addDays, KINDS, TERMS, isProduct, defaultProduct, PRODUCT_CATEGORIES, INCOTERMS, PRODUCTION_MODES } from './contracts.js';
import { contractPdf } from './contract-pdf.js';
import { pdfName, disposition } from './pdf-name.js';
import { markUrl } from './signatures.js';
import { moneyAllowed, cleanInvoice, nextInvoiceNumber, invoiceState } from './money.js';
import { syncContractDeal } from './sales-deals.js';
import { createAutopay, authorizationText } from './autopay.js';
import { processor as paymentProcessor, tokensUrl } from './qb-payments.js';
import { createStripe, verifyWebhook as verifyStripeWebhook } from './stripe-payments.js';
import { qbConfig } from './quickbooks.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const OPEN = ['sent', 'signed_by_client'];
const STATUS_FILTER = ['draft', 'sent', 'signed_by_client', 'executed', 'declined', 'void', 'expired', 'closed'];
const CLOSABLE = ['sent', 'signed_by_client', 'executed', 'expired'];

export function registerContractRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, hubButton = () => '', emailEscape = s => String(s), notifyStaff = async () => false,
    signatures = null, money = null, proc = paymentProcessor, secret = 'dev', publicUrl = 'https://hub.thefuturebasics.com', workUrl = 'https://work.thefuturebasics.com', env = process.env, throttle = () => true, log = console } = d;
  const stripe = d.stripe || createStripe({ env, log });
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const pre = [authenticate, adminOnly], actorId = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const userOf = async req => (await pool.query('select id, email, name from users where id=$1', [actorId(req)]).catch(() => ({ rows: [] }))).rows[0] || null;
  async function signerOnly(req, reply) {
    const u = await userOf(req);
    if (!u || !moneyAllowed(u.email, env)) return reply.code(403).send({ error: 'Only the people who sign for Future Basics can do this' });
    req.signer = u;
  }
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const ipOf = req => String(req.ip || '').slice(0, 64), uaOf = req => String(req.headers['user-agent'] || '').slice(0, 300);
  const ev = (id, kind, { actor = '', detail = '', meta = {}, ip = '' } = {}) => pool.query('insert into contract_events(contract_id,kind,actor,detail,meta,ip) values($1,$2,$3,$4,$5::jsonb,$6)', [id, kind, actor, detail, JSON.stringify(meta), ip]).catch(e => log.warn?.({ err: e.message }, 'contract event not kept'));

  // taxRatePct: the sales tax a contract priced per unit (goods) starts with; each contract can change it
  const DEFAULTS = { providerName: 'Future Basics', providerAddress: '', signerName: '', signerTitle: '', governingLaw: '', taxRatePct: 6 };
  const settings = async () => ({ ...DEFAULTS, ...((await getSetting('contractSettings').catch(() => null)) || {}) });
  const cleanSettings = i => ({ providerName: clip(i?.providerName, 120) || DEFAULTS.providerName, providerAddress: String(i?.providerAddress ?? '').trim().slice(0, 300), signerName: clip(i?.signerName, 120), signerTitle: clip(i?.signerTitle, 120), governingLaw: clip(i?.governingLaw, 120), taxRatePct: i?.taxRatePct === undefined || i?.taxRatePct === '' ? DEFAULTS.taxRatePct : cleanTaxRate(i.taxRatePct) });

  const one = async id => (await pool.query('select c.*, d.title deal_title, p.name project_name from contracts c left join sales_deals d on d.id=c.deal_id left join projects p on p.id=c.project_id where c.id=$1', [id])).rows[0];
  // Automatic payments (autopay.js). Without the Money routes (no QuickBooks) there is nothing to charge through, and the contract simply says so.
  const autopay = money ? createAutopay({ pool, proc, stripe, getSetting, money, draftInvoices: async r => { const out = await draftInvoices(r, 'autopay'); if (out.error) await ev(r.id, 'invoices_failed', { actor: 'autopay', detail: out.error }); return out; }, reload: one, sendHubEmail, hubEmailShell, hubButton, emailEscape, notifyStaff, secret, publicUrl, workUrl, log, env }) : null;
  // A contract that was sent and ran past its date is expired from then on (found out when it is next looked at, so no clock is needed).
  async function fresh(r) {
    if (r && r.status === 'sent' && r.expires_at && new Date(r.expires_at) < new Date()) {
      const u = await pool.query(`update contracts set status='expired', updated_at=now() where id=$1 and status='sent' returning id`, [r.id]);
      if (u.rowCount) { await ev(r.id, 'expired', { detail: 'Not signed before ' + iso(r.expires_at) }); await syncContractDeal(pool, await one(r.id), { log }); r = await one(r.id); }
    }
    return r;
  }
  const linkOf = r => `${publicUrl}/sign/${signToken(secret, r.id, r.token_version)}`;
  const sigView = (s, staff = false) => s ? { name: s.name, title: s.title || '', at: s.at, ink: markUrl(s.ink), method: s.method || null, autopay: !!s.autopay, ...(staff ? { ip: s.ip || '', by: s.by || null } : {}) } : null;
  const view = (r, { staff = true } = {}) => ({
    id: r.id, number: r.number, version: r.version, supersedesId: r.supersedes_id, kind: r.kind, kindLabel: KINDS[r.kind] || '', title: r.title, status: r.status, clientCompany: r.content?.client?.company || '', signerName: r.content?.client?.signerName || '', signerEmail: r.content?.client?.signerEmail || '',
    totalCents: Number(r.total_cents), currency: r.currency, dealId: r.deal_id || null, dealTitle: r.deal_title || '', projectId: r.project_id || null, projectName: r.project_name || '', clientId: r.client_id || null, contactId: r.contact_id || null,
    sentAt: r.sent_at, sentTo: r.sent_to || '', expiresAt: r.expires_at, firstViewedAt: r.first_viewed_at, lastViewedAt: r.last_viewed_at, viewCount: r.view_count, clientSignature: sigView(r.client_signature, staff), providerSignature: sigView(r.provider_signature, staff),
    declined: r.declined || null, voidReason: r.void_reason || '', executedAt: r.executed_at, invoicesAt: r.invoices_at, closedAt: r.closed_at || null, closedBy: r.closed_by || '', closeNote: r.close_note || '', closedFrom: r.closed_from || '', quoteId: r.quote_id || null, createdAt: r.created_at, updatedAt: r.updated_at, docHash: r.doc_hash || ''
  });
  const stateFor = async r => ({ status: r.status, sentAt: r.sent_at, hash: r.doc_hash || '', clientSignature: r.client_signature, providerSignature: r.provider_signature, declined: r.declined, events: (await pool.query(`select kind, at, ip, meta from contract_events where contract_id=$1 and kind='viewed' order by at limit 1`, [r.id])).rows });
  // the PDF draws the ink itself, so it is read in with the state
  // "Comet over Delphi - Agreement FB-C-2026-004.pdf", with "(signed)" once both have signed
  const agreementName = r => pdfName(r.content?.client?.company, `Agreement ${r.number}${['executed', 'closed'].includes(r.status) ? ' (signed)' : ''}`);
  const pdfState = async r => {
    const st = await stateFor(r), withInk = async g => (g?.ink && signatures ? { ...g, inkPng: await signatures.pngOf(g.ink).catch(() => null) } : g);
    return { ...st, providerSignature: await withInk(st.providerSignature), clientSignature: await withInk(st.clientSignature) };
  };
  const renderOf = async (r, st) => renderContract({ ...r.content, number: r.number }, st || await settings());

  // ---- drafting from the platform -----------------------------------------------------------------------------------------------------------
  const kindFrom = text => (/\b(web ?site|site|landing|storefront|shop)\b/i.test(text) ? 'website' : /\b(app|software|platform|portal|dashboard|system|integration)\b/i.test(text) ? 'app' : /\b(hats?|caps?|shirts?|tees?|hoodies?|apparel|garments?|shoes?|sneakers?|footwear|boots?|electronics?|devices?|hardware|bags?|jackets?|sample|samples|factory|manufactur\w*|product development)\b/i.test(text) ? 'product' : 'other');
  // The client's address on file, for the contract's Address line: what they gave in the hub (Business address and billing), else the
  // address on their last contract, else on their last invoice, else their Shopify customer's default address. '' when there is none.
  // The contract keeps its own copy: changing it in a contract never changes the account.
  async function accountAddress({ clientId = null, projectId = null, signerEmail = '', company = '' } = {}) {
    const id = clientId || await resolveClient({ projectId, signerEmail, company }); if (!id) return { address: '', source: '' };
    const c = (await pool.query('select onboarding, shopify_default_address from clients where id=$1', [id])).rows[0]; if (!c) return { address: '', source: '' };
    const own = addressLine(c.onboarding?.address); if (own) return { address: own, source: 'account' };
    const k = (await pool.query(`select content->'client'->>'address' a from contracts where client_id=$1 and coalesce(content->'client'->>'address','')<>'' order by updated_at desc limit 1`, [id])).rows[0]?.a; if (k) return { address: k, source: 'contract' };
    const inv = (await pool.query(`select address from money_invoices where client_id=$1 and address<>'' and status<>'void' order by created_at desc limit 1`, [id])).rows[0]?.address; if (inv) return { address: inv.replace(/\s*\n\s*/g, ', '), source: 'invoice' };
    const s = c.shopify_default_address, shop = s ? [s.address1, s.address2, [s.city, s.provinceCode, s.zip].filter(Boolean).join(' '), s.countryCodeV2].filter(Boolean).join(', ') : '';
    return shop ? { address: shop, source: 'shopify' } : { address: '', source: '' };
  }
  const ADDRESS_FROM = { account: 'the client\'s account', contract: 'their last contract', invoice: 'their last invoice', shopify: 'their Shopify customer record' };

  // The order quote a contract is drawn up from: the one named, else the deal's or the project's (accepted first, then the latest sent).
  async function quoteFor({ quoteId = null, dealId = null, projectId = null, productQuoteId = null }) {
    if (quoteId) return (await pool.query('select * from order_quotes where id=$1', [quoteId])).rows[0] || null;
    if (productQuoteId) return productQuote(productQuoteId);
    if (!dealId && !projectId) return null;
    const oq = (await pool.query(`select * from order_quotes where ((deal_id is not null and deal_id=$1) or (project_id is not null and project_id=$2)) and status in ('accepted','sent') order by (status='accepted') desc, updated_at desc limit 1`, [dealId, projectId])).rows[0];
    if (oq || !dealId) return oq || null;
    const pq = (await pool.query(`select id from quotes where deal_id=$1 and status not in ('draft','declined') order by (status='accepted') desc, version desc limit 1`, [dealId])).rows[0];
    return pq ? productQuote(pq.id) : null;
  }
  // a product quote (one product, issued from its page) in the order quote's shape: its quantity at the client's unit price, tooling and freight as other lines
  async function productQuote(id) {
    const q = (await pool.query(`select q.*, p.title, p.client_id, p.project_id from quotes q join products p on p.id=q.product_id where q.id=$1`, [id])).rows[0]; if (!q) return null;
    const unit = Number(q.wholesale_cents || q.unit_cost_cents || 0);
    return { id: null, productQuoteId: q.id, number: `${q.title} v${q.version}`, title: `${q.title} quote`, status: q.status, client_id: q.client_id, project_id: q.project_id, deal_id: q.deal_id, currency: q.currency, notes: q.notes || '',
      lines: [{ title: q.title, quantity: Number(q.quantity), sizes: {}, unitCents: unit, totalCents: unit * Number(q.quantity) }],
      extras: [...(Number(q.tooling_cents) > 0 ? [{ label: `Tooling and setup · ${q.title}`, cents: Number(q.tooling_cents) }] : []), ...(Number(q.freight_cents) > 0 ? [{ label: `Freight · ${q.title}`, cents: Number(q.freight_cents) }] : [])] };
  }
  // A quote priced per unit: every product line at its quantity and unit price (sizes named), every other line (setup, freight) as charged
  // on the invoice (a comped line at $0, a discount as a negative line), and sales tax by where it is delivered (the client's address on file:
  // Pennsylvania at the rate in Settings plus any local rate, other states and abroad none). Tax is on the products only
  // (a discount lowers what is taxed); setup, freight and other fees are not taxed. The total includes the tax.
  function quotePricing(q, st, address = '') {
    const inv = invoiceOf(q);
    const units = cleanUnits([
      ...(q.lines || []).map(l => ({ item: `${l.title}${sizesWords(l.sizes) ? ` (${sizesWords(l.sizes)})` : ''}`, qty: l.quantity, unitCents: l.unitCents })),
      ...inv.extras.map(x => ({ item: x.comped ? `${x.label} (comped)` : x.label, qty: 1, unitCents: x.comped ? 0 : x.cents, taxable: false })),
      ...(inv.discount ? [{ item: inv.discount.label, qty: 1, unitCents: -inv.discount.cents }] : [])]);
    // delivered to the client's address unless the contract says otherwise: its state sets the sales tax (contracts.js taxRule)
    const delivery = { address, state: stateOf(address), local: localOf(address), exempt: false }, rule = taxRule(delivery, st.taxRatePct);
    const taxRatePct = rule.known ? rule.ratePct : 0, subtotal = unitsTotal(units), taxable = taxableOf(units), taxCents = taxOf(taxable, taxRatePct);
    const scope = [...(q.lines || []).map(l => `${Number(l.quantity).toLocaleString('en-US')} × ${l.title}${sizesWords(l.sizes) ? `, sizes ${sizesWords(l.sizes)}` : ''}${l.note ? ` (${l.note})` : ''}`),
      ...inv.extras.filter(x => !x.comped).map(x => x.label), ...String(q.notes || '').split('\n').map(x => x.trim()).filter(Boolean)];
    return { fee: { totalCents: subtotal + taxCents, currency: q.currency || 'USD', charge: 'unit', units, subtotalCents: subtotal, taxableCents: taxable, taxRatePct, taxCents, delivery }, scope };
  }

  async function draftFrom({ dealId = null, projectId = null, quoteId = null, productQuoteId = null }, st) {
    let deal = null, project = null, client = null;
    const quote = await quoteFor({ quoteId, dealId, projectId, productQuoteId });
    if (quote) { dealId = dealId || quote.deal_id || null; projectId = projectId || quote.project_id || null; }
    if (dealId) deal = (await pool.query(`select d.*, ct.name contact_name, ct.email contact_email, ct.title contact_title, coalesce(co.name, co2.name, '') company from sales_deals d left join sales_contacts ct on ct.id=d.contact_id left join sales_companies co on co.id=d.company_id left join sales_companies co2 on co2.id=ct.company_id where d.id=$1`, [dealId])).rows[0];
    if (projectId || deal?.project_id) project = (await pool.query('select * from projects where id=$1', [projectId || deal.project_id])).rows[0];
    if (project || quote) client = (await pool.query('select id, name, contact_name, contact_email from clients where id=$1', [project?.client_id || quote.client_id])).rows[0];
    if (!deal && project) deal = (await pool.query(`select d.*, ct.name contact_name, ct.email contact_email, ct.title contact_title, coalesce(co.name, co2.name, '') company from sales_deals d left join sales_contacts ct on ct.id=d.contact_id left join sales_companies co on co.id=d.company_id left join sales_companies co2 on co2.id=ct.company_id where d.project_id=$1 order by d.created_at desc limit 1`, [project.id])).rows[0] || null;
    if (!deal && !project && !quote) return null;
    const company = deal?.company || client?.name || '', projectName = project?.name || deal?.title || quote?.title || '', title = clip(quote?.title || deal?.title || projectName || (quote ? `${company} · ${quote.number}` : ''), 160);
    const onFile = await accountAddress({ clientId: client?.id || null, projectId: project?.id || null, signerEmail: deal?.contact_email || client?.contact_email || '', company });
    const priced = quote ? quotePricing(quote, st, onFile.address) : null;
    const total = priced ? priced.fee.totalCents : deal ? Number(deal.value_cents) : 0, kind = quote ? 'product' : project ? (project.kind === 'software' ? 'app' : 'product') : kindFrom(`${title} ${projectName}`);
    const plan = total > 0 ? buildPlan({ type: 'split', totalCents: total, depositPct: 50 }).plan : null;
    const content = { title, kind, provider: { name: st.providerName, address: st.providerAddress, signerName: st.signerName, signerTitle: st.signerTitle }, client: { company, address: onFile.address, signerName: deal?.contact_name || client?.contact_name || '', signerTitle: deal?.contact_title || '', signerEmail: deal?.contact_email || client?.contact_email || '' },
      project: { name: projectName }, scope: priced ? priced.scope : [title ? `Deliver: ${title}` : ''].filter(Boolean), notIncluded: [], timeline: { effectiveOn: todayISO(), startOn: '', completionOn: '' }, fee: priced ? priced.fee : { totalCents: total, currency: 'USD' }, plan, hosting: { included: false, monthlyCents: 0, note: '' }, terms: { ...TERMS, governingLaw: st.governingLaw }, sections: defaultSections(kind), ...(isProduct(kind) ? { product: defaultProduct() } : {}) };
    return { content, dealId: deal?.id || null, projectId: project?.id || null, clientId: project?.client_id || quote?.client_id || null, contactId: deal?.contact_id || null, addressFrom: ADDRESS_FROM[onFile.source] || '', quote: quote ? { id: quote.id, number: quote.number, status: quote.status } : null };
  }

  // Which payment processor takes new card and bank details (QuickBooks Payments or Stripe), and whether each is ready. Only the signers can change it.
  const paymentsView = async () => ({ processor: autopay ? await autopay.chosen() : 'quickbooks', stripe: { configured: stripe.configured(), live: stripe.live(), embedded: stripe.embedded(), webhook: Boolean(stripe.webhookSecret()), webhookUrl: `${publicUrl}/v1/stripe/webhook` }, quickbooks: { ready: autopay ? (await autopay.readiness('quickbooks')).ready : false } });
  app.get('/v1/contracts/settings', { preHandler: pre }, async () => ({ settings: await settings(), payments: await paymentsView(), tax: { states: US_STATES, registered: REGISTERED_STATES, local: PA_LOCAL } }));
  // the state (and Pennsylvania local tax) of a delivery address, as the sales tax reads it
  app.get('/v1/contracts/delivery', { preHandler: pre }, async (req) => { const a = clip(req.query?.address, 300); return { state: stateOf(a), local: localOf(a) }; });
  app.put('/v1/contracts/autopay/processor', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    const processor = req.body?.processor === 'stripe' ? 'stripe' : req.body?.processor === 'quickbooks' ? 'quickbooks' : '';
    if (!processor) return bad(reply, 'Choose QuickBooks Payments or Stripe');
    if (processor === 'stripe' && !stripe.configured()) return bad(reply, 'Stripe is not set up yet: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to the service first', 409);
    if (processor === 'stripe' && !stripe.webhookSecret()) return bad(reply, 'Add STRIPE_WEBHOOK_SECRET to the service first: Stripe tells us about bank debits that settle later', 409);
    await setSetting('autopayProcessor', { processor, by: req.signer.email, at: new Date().toISOString() });
    return { payments: await paymentsView() };
  });
  app.put('/v1/contracts/settings', { preHandler: pre }, async (req) => { const v = cleanSettings({ ...(await settings()), ...(req.body || {}) }); await setSetting('contractSettings', v); return { settings: v }; });

  app.get('/v1/contracts/sources', { preHandler: pre }, async () => {
    const deals = (await pool.query(`select d.id, d.title, d.stage, d.value_cents, d.project_id, coalesce(co.name, co2.name, '') company, ct.name contact_name from sales_deals d left join sales_contacts ct on ct.id=d.contact_id left join sales_companies co on co.id=d.company_id left join sales_companies co2 on co2.id=ct.company_id where d.stage in ('meeting','proposal','won') order by d.updated_at desc limit 80`)).rows;
    const projects = (await pool.query(`select p.id, p.name, p.kind, p.stage, c.name client from projects p join clients c on c.id=p.client_id where p.status='active' and c.slug<>'future-basics' order by p.updated_at desc limit 80`)).rows;
    const made = (await pool.query(`select id, number, status, deal_id, project_id from contracts where status not in ('void') order by created_at desc`)).rows;
    return { deals: deals.map(x => ({ id: x.id, title: x.title, stage: x.stage, valueCents: Number(x.value_cents), company: x.company, contactName: x.contact_name || '', projectId: x.project_id, contracts: made.filter(m => m.deal_id === x.id).map(m => ({ id: m.id, number: m.number, status: m.status })) })),
      projects: projects.map(x => ({ id: x.id, name: x.name, kind: x.kind === 'software' ? 'software' : 'product', client: x.client, stage: x.stage, contracts: made.filter(m => m.project_id === x.id).map(m => ({ id: m.id, number: m.number, status: m.status })) })) };
  });

  // The standard wording and the product options for a kind of agreement: the editor asks when staff switch between digital work and a physical product.
  app.get('/v1/contracts/template', { preHandler: pre }, async (req, reply) => {
    const kind = KINDS[req.query?.kind] ? req.query.kind : null; if (!kind) return bad(reply, 'Choose a kind of agreement');
    return { kind, sections: defaultSections(kind), product: isProduct(kind) ? defaultProduct() : null, options: { categories: Object.fromEntries(Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => [k, v.label])), incoterms: INCOTERMS, productionModes: PRODUCTION_MODES } };
  });

  app.get('/v1/contracts/draft', { preHandler: pre }, async (req, reply) => {
    const dealId = UUID.test(String(req.query?.deal || '')) ? req.query.deal : null, projectId = UUID.test(String(req.query?.project || '')) ? req.query.project : null, quoteId = UUID.test(String(req.query?.quote || '')) ? req.query.quote : null, productQuoteId = UUID.test(String(req.query?.productQuote || '')) ? req.query.productQuote : null;
    if (!dealId && !projectId && !quoteId && !productQuoteId) return bad(reply, 'Choose a deal, a project or a quote to start from');
    const st = await settings(), r = await draftFrom({ dealId, projectId, quoteId, productQuoteId }, st); if (!r) return bad(reply, 'Not found', 404);
    const c = cleanContent(r.content, { settings: st, lenient: true });
    return { ...r, content: c.value, problems: [...c.errors, ...sendProblems(c.value, st)] };
  });

  // The editor asks for a payment plan as it is being set up: the same builder that checks it when the contract is sent.
  // The address on file for whoever the editor names (the company, the signer's email, the project), so a blank Address fills itself
  app.get('/v1/contracts/account-address', { preHandler: pre }, async (req) => {
    const q = req.query || {}, projectId = UUID.test(String(q.project || '')) ? q.project : null, clientId = UUID.test(String(q.client || '')) ? q.client : null;
    const r = await accountAddress({ clientId, projectId, signerEmail: clip(q.email, 254), company: clip(q.company, 200) });
    return { address: r.address, from: ADDRESS_FROM[r.source] || '' };
  });

  app.post('/v1/contracts/plan', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, total = Math.round(Number(b.totalCents));
    const r = buildPlan({ type: b.type, totalCents: total, depositPct: b.depositPct === '' ? null : b.depositPct, depositCents: b.depositCents === '' ? null : b.depositCents, months: b.months, firstDueOn: b.firstDueOn || null, deliveryOn: b.deliveryOn || null, milestones: Array.isArray(b.milestones) ? b.milestones : [], method: b.method, autopay: b.autopay === true, note: b.note, balanceOn: b.kind === 'product' ? b.balanceOn : null });
    if (r.error) return bad(reply, r.error); return { plan: r.plan, summary: planWords(r.plan, 'USD', KINDS[b.kind] ? b.kind : '') };
  });

  app.post('/v1/contracts/render', { preHandler: pre }, async (req) => {
    const st = await settings(), c = cleanContent(req.body?.content, { settings: st, lenient: true });
    return { content: c.value, rendered: renderContract({ ...c.value, number: clip(req.body?.number, 40) || 'Draft' }, st), problems: [...c.errors, ...sendProblems(c.value, st)] };
  });

  // the PDF of what is in the editor right now, saved or not: the same document the client downloads, marked as a draft
  app.post('/v1/contracts/render.pdf', { preHandler: pre }, async (req, reply) => {
    const st = await settings(), c = cleanContent(req.body?.content, { settings: st, lenient: true }), number = clip(req.body?.number, 40) || 'Draft';
    const buf = await contractPdf(renderContract({ ...c.value, number }, st), { status: 'draft', hash: '', sentAt: null, clientSignature: null, providerSignature: null, declined: null, events: [] });
    return reply.type('application/pdf').header('content-disposition', disposition(pdfName(req.body?.content?.client?.company, `Agreement ${number} (draft)`))).header('cache-control', 'no-store').send(buf);
  });

  // A client's room (and one of its projects): its agreements with the invoices each brings, and the room's other invoices from Money, so staff
  // invoice a signed contract from where they are working (src/admin.html, Invoices & payments and the project page). Drafts are left to Contracts.
  app.get('/v1/contracts/room/:clientId', { preHandler: pre }, async (req, reply) => {
    const cid = req.params.clientId, pid = UUID.test(String(req.query?.project || '')) ? req.query.project : null; if (!UUID.test(cid)) return bad(reply, 'Not found', 404);
    const rows = (await pool.query(`select * from contracts where (client_id=$1 or (client_id is null and lower(content->'client'->>'signerEmail') in (select lower(email) from users where client_id=$1))) and status in ('sent','signed_by_client','executed','closed') and ($2::uuid is null or project_id=$2) order by coalesce(executed_at, sent_at, created_at) desc limit 50`, [cid, pid])).rows;
    const invs = (await pool.query(`select i.id, i.number, i.status, i.total_cents, i.credits, i.due_on, i.pay_url, i.contract_id, i.contract_seq, coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id), 0)::bigint paid
      from money_invoices i where i.status<>'void' and (i.contract_id = any($1::uuid[]) or (i.client_id=$2 and i.contract_id is null and ($3::uuid is null or i.project_id=$3))) order by i.contract_seq nulls last, i.issued_on desc, i.number desc limit 200`, [rows.map(r => r.id), cid, pid])).rows;
    const today = todayISO(), iv = i => { const st = invoiceState({ ...i, due_on: iso(i.due_on) }, Number(i.paid), today); return { id: i.id, number: i.number, state: st.state, totalCents: Number(i.total_cents), owedCents: st.owedCents, dueOn: iso(i.due_on), payUrl: i.pay_url || '' }; };
    return { agreements: rows.map(r => { const c = r.content, plan = c.plan; return { id: r.id, number: r.number, title: r.title, status: r.status, totalCents: Number(r.total_cents), currency: r.currency, projectId: r.project_id, executedAt: r.executed_at, autopay: !!plan.autopay, plan: planWords(plan, r.currency, c.kind),
      needsInvoicing: r.status === 'executed' && !r.invoices_at, dueOnSigningCents: plan.autopay ? 0 : plan.installments.filter(p => p.event === 'signing').reduce((n, p) => n + Number(p.amountCents), 0), payOnSigningReady: payable(r), invoices: invs.filter(i => i.contract_id === r.id).map(iv) }; }),
      others: invs.filter(i => !i.contract_id).map(iv) };
  });
  app.get('/v1/contracts', { preHandler: pre }, async (req) => {
    for (const x of (await pool.query(`update contracts set status='expired', updated_at=now() where status='sent' and expires_at < now() returning *`)).rows) { await ev(x.id, 'expired', { detail: 'Not signed before ' + iso(x.expires_at) }); await syncContractDeal(pool, x, { log }); }
    const q = clip(req.query?.q, 80).toLowerCase(), status = STATUS_FILTER.includes(req.query?.status) ? req.query.status : '';
    const rows = (await pool.query(`select c.*, d.title deal_title, p.name project_name from contracts c left join sales_deals d on d.id=c.deal_id left join projects p on p.id=c.project_id where ($1='' or c.status=$1) order by c.created_at desc limit 300`, [status])).rows;
    const list = rows.map(r => view(r)).filter(v => !q || `${v.number} ${v.title} ${v.clientCompany} ${v.signerName}`.toLowerCase().includes(q));
    const open = list.filter(v => ['sent', 'signed_by_client'].includes(v.status));
    return { contracts: list, counts: { draft: list.filter(v => v.status === 'draft').length, awaitingClient: list.filter(v => v.status === 'sent').length, awaitingUs: list.filter(v => v.status === 'signed_by_client').length, executed: list.filter(v => v.status === 'executed').length, openCents: open.reduce((s, v) => s + v.totalCents, 0) } };
  });

  // Which client room a contract belongs to, so it shows up in their hub: from the project, else the signer's own sign-in, else the client's contact or allowed emails, else the company name.
  async function resolveClient({ projectId = null, signerEmail = '', company = '' } = {}) {
    if (projectId) { const c = (await pool.query('select client_id from projects where id=$1', [projectId])).rows[0]?.client_id; if (c) return c; }
    const email = String(signerEmail || '').trim().toLowerCase();
    if (email) {
      const byUser = (await pool.query(`select u.client_id from users u join clients c on c.id=u.client_id where lower(u.email)=$1 and c.slug<>'future-basics' and c.archived_at is null limit 1`, [email])).rows[0]?.client_id; if (byUser) return byUser;
      const byClient = (await pool.query(`select id from clients where slug<>'future-basics' and archived_at is null and (lower(contact_email)=$1 or $1=any(allowed_emails)) order by created_at limit 2`, [email])).rows; if (byClient.length === 1) return byClient[0].id;
    }
    const name = String(company || '').trim().toLowerCase();
    if (name) { const byName = (await pool.query(`select id from clients where slug<>'future-basics' and archived_at is null and lower(name)=$1 limit 2`, [name])).rows; if (byName.length === 1) return byName[0].id; }
    return null;
  }

  async function save(req, reply, existing) {
    const st = await settings(), c = cleanContent(req.body?.content, { settings: st, lenient: true });
    if (!c.value.title) return bad(reply, 'Give the contract a title');
    const dealId = UUID.test(String(req.body?.dealId || '')) ? req.body.dealId : existing?.deal_id || null, projectId = UUID.test(String(req.body?.projectId || '')) ? req.body.projectId : existing?.project_id || null;
    let clientId = existing?.client_id || null, contactId = existing?.contact_id || null;
    const quoteId = UUID.test(String(req.body?.quoteId || '')) ? req.body.quoteId : existing?.quote_id || null;
    if (projectId) clientId = (await pool.query('select client_id from projects where id=$1', [projectId])).rows[0]?.client_id || clientId;
    if (!clientId) clientId = await resolveClient({ projectId, signerEmail: c.value.client?.signerEmail, company: c.value.client?.company });
    if (dealId) contactId = (await pool.query('select contact_id from sales_deals where id=$1', [dealId])).rows[0]?.contact_id || contactId;
    if (existing) {
      await pool.query('update contracts set title=$2, kind=$3, content=$4::jsonb, total_cents=$5, currency=$6, deal_id=$7, project_id=$8, client_id=$9, contact_id=$10, quote_id=$11, updated_at=now() where id=$1', [existing.id, c.value.title, c.value.kind, JSON.stringify(c.value), c.value.fee.totalCents, c.value.fee.currency, dealId, projectId, clientId, contactId, quoteId]);
      await ev(existing.id, 'edited', { actor: (await userOf(req))?.email || '' });
      await syncContractDeal(pool, await one(existing.id), { actorId: actorId(req), log });
      return existing.id;
    }
    const year = new Date().getUTCFullYear();
    for (let tries = 0; tries < 5; tries++) {
      const number = nextNumber((await pool.query('select number from contracts')).rows.map(r => r.number), year);
      try {
        const id = (await pool.query(`insert into contracts(number,kind,title,content,total_cents,currency,deal_id,project_id,client_id,contact_id,created_by,quote_id) values($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12) returning id`, [number, c.value.kind, c.value.title, JSON.stringify(c.value), c.value.fee.totalCents, c.value.fee.currency, dealId, projectId, clientId, contactId, actorId(req), quoteId])).rows[0].id;
        await ev(id, 'created', { actor: (await userOf(req))?.email || '', detail: number });
        await syncContractDeal(pool, await one(id), { actorId: actorId(req), log }); return id;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    return bad(reply, 'Could not number the contract. Try again.', 409);
  }
  const detail = async (r) => {
    const st = await settings(), rendered = await renderOf(r, st), invoices = (await pool.query(`select i.id, i.number, i.status, i.total_cents, i.due_on, i.contract_seq, coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id),0)::bigint paid_cents from money_invoices i where i.contract_id=$1 order by i.contract_seq nulls last, i.created_at`, [r.id])).rows;
    const live = invoices.filter(i => i.status !== 'void'), money = { invoicedCents: live.reduce((a, i) => a + Number(i.total_cents), 0), paidCents: live.reduce((a, i) => a + Number(i.paid_cents), 0) };
    const ap = autopay ? await autopay.overview(r) : null, rd = ap ? await autopay.readiness() : null;
    const onFile = r.status === 'draft' && !String(r.content?.client?.address || '').trim() ? await accountAddress({ clientId: r.client_id, projectId: r.project_id, signerEmail: r.content?.client?.signerEmail, company: r.content?.client?.company }) : null;
    return { contract: view(r), content: r.content, rendered, accountAddress: onFile?.address ? { address: onFile.address, from: ADDRESS_FROM[onFile.source] } : null, autopay: ap ? { ...ap, ready: rd.ready, notReadyWhy: rd.why } : null, problems: r.status === 'draft' ? [...cleanContent(r.content, { settings: st, lenient: true }).errors, ...sendProblems(r.content, st)] : [],
      events: (await pool.query('select kind, actor, detail, at, ip from contract_events where contract_id=$1 order by at, id', [r.id])).rows.map(e => ({ kind: e.kind, actor: e.actor, detail: e.detail, at: e.at, ip: e.ip })),
      link: OPEN.includes(r.status) || r.status === 'executed' ? linkOf(r) : null, invoices: invoices.map(i => ({ id: i.id, number: i.number, status: i.status, totalCents: Number(i.total_cents), paidCents: Number(i.paid_cents), dueOn: iso(i.due_on), seq: i.contract_seq, linked: i.contract_seq == null })), money };
  };

  app.post('/v1/contracts', { preHandler: pre }, async (req, reply) => { const id = await save(req, reply, null); if (typeof id !== 'string') return; return reply.code(201).send(await detail(await one(id))); });
  app.get('/v1/contracts/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404); return detail(r); });
  app.put('/v1/contracts/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (r.status !== 'draft') return bad(reply, 'A contract that has been sent cannot be edited: what was sent is what is signed. Use Revise to make a new version.', 409);
    const id = await save(req, reply, r); if (typeof id !== 'string') return; return detail(await one(id));
  });
  app.get('/v1/contracts/:id/pdf', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    const buf = await contractPdf(await renderOf(r), await pdfState(r));
    return reply.type('application/pdf').header('content-disposition', disposition(agreementName(r), { inline: req.query?.dl !== '1' })).header('cache-control', 'no-store').send(buf);
  });

  // ---- sending, reminding, replacing the link ------------------------------------------------------------------------------------------------
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
  async function mailSigner(r, { reminder = false, message = '', senderName = '', replyTo = '' } = {}) {
    const c = r.content, plan = c.plan, link = linkOf(r), until = longDate(iso(r.expires_at));
    const body = `<p>Hi ${emailEscape(firstName(c.client.signerName))},</p><p>${reminder ? 'A reminder: ' : ''}${emailEscape(senderName || c.provider.name)} has sent you an agreement to review and sign: <b>${emailEscape(c.title)}</b> (${emailEscape(r.number)}).</p>`
      + `<p>Fixed fee <b>${emailEscape(dollars(c.fee.totalCents, c.fee.currency))}</b>, paid ${emailEscape(planWords(plan, c.fee.currency, c.kind))}.</p>${message ? `<p style="padding:10px 14px;border-left:3px solid #4bff9a;background:#f5f5f2">${emailEscape(message).replace(/\n/g, '<br>')}</p>` : ''}`
      + `<p>You read the whole agreement on the page and sign it with your finger. It takes a couple of minutes and works on a phone.</p>${hubButton(link, 'Review and sign')}<p style="font-size:12px;color:#717177">The link is yours alone and works until ${emailEscape(until)}. Questions? Just reply to this email.</p>`;
    return sendHubEmail({ to: c.client.signerEmail, subject: `${reminder ? 'Reminder: ' : ''}Please review and sign: ${c.title} (${r.number})`, html: hubEmailShell(`Please review and sign: ${c.title}`, body), replyTo: replyTo || undefined });
  }

  app.post('/v1/contracts/:id/send', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; let r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (!['draft', 'sent'].includes(r.status)) return bad(reply, r.status === 'expired' ? 'This contract has expired. Revise it to send a fresh copy.' : `A ${r.status.replace(/_/g, ' ')} contract cannot be sent`, 409);
    const st = await settings(), u = await userOf(req), c = cleanContent(r.content, { settings: st });
    if (c.error) return bad(reply, c.error); const problems = sendProblems(c.value, st); if (problems.length) return bad(reply, problems[0]);
    if (!r.client_id) { const cid = await resolveClient({ projectId: r.project_id, signerEmail: c.value.client.signerEmail, company: c.value.client.company }); if (cid) { await pool.query('update contracts set client_id=$2 where id=$1', [r.id, cid]); r.client_id = cid; } }
    const signNow = req.body?.signNow === true;
    if (signNow && !(u && moneyAllowed(u.email, env))) return bad(reply, 'Only the people who sign for Future Basics can sign for it', 403);
    const rendered = renderContract({ ...c.value, number: r.number }, st), hash = docHash(rendered), days = c.value.terms.expiresDays, message = clip(req.body?.message, 1000);
    if (r.status === 'draft') {
      await pool.query(`update contracts set content=$2::jsonb, status='sent', doc_hash=$3, sent_at=now(), sent_to=$4, expires_at=now() + ($5 || ' days')::interval, updated_at=now() where id=$1`, [r.id, JSON.stringify(c.value), hash, c.value.client.signerEmail, String(days)]);
      await ev(r.id, 'sent', { actor: u?.email || '', detail: c.value.client.signerEmail, meta: { hash } });
      if (signNow) { const ink = await signatures?.markFor(req.auth?.sub).catch(() => null), sig = { name: c.value.provider.signerName, title: c.value.provider.signerTitle, at: new Date().toISOString(), ip: ipOf(req), ua: uaOf(req), by: u.email, hash, ...(ink ? { ink } : {}) }; await pool.query('update contracts set provider_signature=$2::jsonb where id=$1', [r.id, JSON.stringify(sig)]); await ev(r.id, 'signed_provider', { actor: u.email, detail: sig.name, ip: sig.ip }); }
    } else { await pool.query(`update contracts set expires_at=now() + ($2 || ' days')::interval, updated_at=now() where id=$1`, [r.id, String(days)]); await ev(r.id, 'resent', { actor: u?.email || '', detail: c.value.client.signerEmail }); }
    r = await one(r.id); await syncContractDeal(pool, r, { actorId: actorId(req), log }); // the deal moves to Proposal at the contract's value, and says so
    r = await one(r.id); const ok = await mailSigner(r, { message, senderName: u?.name || '', replyTo: u?.email || '' });
    return { ...(await detail(r)), emailed: !!ok };
  });

  app.post('/v1/contracts/:id/remind', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (r.status !== 'sent') return bad(reply, 'Only a contract that is waiting for the client\'s signature can be sent as a reminder', 409);
    if (r.last_reminder_at && Date.now() - new Date(r.last_reminder_at).getTime() < 20 * 3600_000) return bad(reply, 'A reminder went out less than a day ago', 429);
    const u = await userOf(req); await pool.query('update contracts set last_reminder_at=now(), updated_at=now() where id=$1', [r.id]); await ev(r.id, 'reminded', { actor: u?.email || '', detail: r.sent_to });
    return { emailed: !!(await mailSigner(r, { reminder: true, senderName: u?.name || '', replyTo: u?.email || '' })) };
  });

  // A link that went astray can be replaced: the old one stops working at once.
  app.post('/v1/contracts/:id/link', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (![...OPEN, 'executed'].includes(r.status)) return bad(reply, 'There is no link for a contract that is not out for signature', 409);
    if (req.body?.replace === true) { await pool.query('update contracts set token_version=token_version+1, updated_at=now() where id=$1', [r.id]); await ev(r.id, 'link_replaced', { actor: (await userOf(req))?.email || '' }); }
    return { link: linkOf(await one(r.id)) };
  });

  app.post('/v1/contracts/:id/revise', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'draft') return bad(reply, 'It is still a draft: just edit it', 409); if (r.status === 'closed') return bad(reply, 'It is closed out. Reopen it first.', 409); if (r.status === 'executed') return bad(reply, 'A fully signed contract stands. Changes go through a new agreement or a change request.', 409);
    const db = await pool.connect();
    try {
      await db.query('begin'); const base = r.number.replace(/-v\d+$/, ''), nextV = (await db.query(`select coalesce(max(version),1)+1 v from contracts where number=$1 or number like $2`, [base, base + '-v%'])).rows[0].v;
      const id = (await db.query(`insert into contracts(number,version,supersedes_id,kind,title,content,total_cents,currency,deal_id,project_id,client_id,contact_id,created_by) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13) returning id`, [`${base}-v${nextV}`, nextV, r.id, r.kind, r.title, JSON.stringify({ ...r.content, timeline: { ...r.content.timeline, effectiveOn: todayISO() } }), r.total_cents, r.currency, r.deal_id, r.project_id, r.client_id, r.contact_id, actorId(req)])).rows[0].id;
      if (r.status !== 'void') await db.query(`update contracts set status='void', void_reason=$2, updated_at=now() where id=$1`, [r.id, `Replaced by version ${nextV}`]);
      await db.query('commit');
      const u = await userOf(req); await ev(id, 'created', { actor: u?.email || '', detail: `Version ${nextV}, replaces ${r.number}` }); await ev(r.id, 'voided', { actor: u?.email || '', detail: `Replaced by version ${nextV}` });
      await syncContractDeal(pool, await one(id), { actorId: actorId(req), log });
      return reply.code(201).send(await detail(await one(id)));
    } catch (e) { await db.query('rollback').catch(() => {}); throw e; } finally { db.release(); }
  });

  app.post('/v1/contracts/:id/void', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'executed') return bad(reply, 'A fully signed contract cannot be voided here', 409); if (r.status === 'closed') return bad(reply, 'It is closed out. Reopen it first.', 409); if (r.status === 'void') return bad(reply, 'It is already void', 409);
    const reason = clip(req.body?.reason, 300); await pool.query(`update contracts set status='void', void_reason=$2, updated_at=now() where id=$1`, [r.id, reason]);
    await ev(r.id, 'voided', { actor: (await userOf(req))?.email || '', detail: reason }); await syncContractDeal(pool, await one(r.id), { actorId: actorId(req), log }); return detail(await one(r.id));
  });

  // ---- signing for Future Basics -----------------------------------------------------------------------------------------------------------------
  async function execute(r, req) {
    await pool.query(`update contracts set status='executed', executed_at=now(), updated_at=now() where id=$1 and status in ('sent','signed_by_client')`, [r.id]);
    await ev(r.id, 'executed', { detail: 'Both parties have signed' });
    await syncContractDeal(pool, await one(r.id), { log }); // the deal is won at the contract's value (opened first if there was none), before the invoices are drafted with it
    // without automatic payments, what is due on signing is asked for now on our pay page, so its invoice is drafted now whatever the method
    if (r.content.plan.method !== 'invoice' || payable(r)) { const now = await one(r.id); if (now && !now.invoices_at) { const out = await draftInvoices(now, 'on signing'); if (out.error) await ev(r.id, 'invoices_failed', { actor: 'on signing', detail: out.error }); } }
    if (autopay && r.content.plan.autopay && await autopay.activeMethod(r.id)) autopay.runFor(r.id).catch(() => {}); // details were added before Future Basics signed: what is already due is taken now
    const owed = await askForPayment(await one(r.id)).catch(e => { log.warn?.({ contracts: true, err: String(e.message).slice(0, 200) }, 'the payment due on signing could not be asked for'); return []; });
    const fresh2 = await one(r.id), c = fresh2.content, link = linkOf(fresh2);
    // the signed agreement goes with the email as a PDF (both signatures, the fingerprint and the audit trail), so the client has the file itself
    const signedPdf = await contractPdf(await renderOf(fresh2), await pdfState(fresh2)).catch(e => { log.warn?.({ contracts: true, err: String(e.message).slice(0, 200) }, 'the signed PDF could not be made for the email'); return null; });
    await sendHubEmail({ to: c.client.signerEmail, subject: `Signed by both parties: ${c.title} (${r.number})`, html: hubEmailShell(`Signed: ${c.title}`, `<p>Hi ${emailEscape(firstName(c.client.signerName))},</p><p>The agreement <b>${emailEscape(c.title)}</b> (${emailEscape(r.number)}) is now signed by both parties.</p>${payHtml(owed, c.fee.currency)}<p>${signedPdf ? 'The signed copy is attached as a PDF. You can also open it any time:' : 'You can open it and download the signed copy any time:'}</p>${hubButton(link, 'Open the signed agreement')}<p style="font-size:12px;color:#717177">Keep this email: ${signedPdf ? 'the attachment and the link are' : 'the link is'} your copy.</p>`), ...(signedPdf ? { attachments: [{ filename: agreementName(fresh2), content: signedPdf }] } : {}) }).catch(() => {});
    await notifyStaff(`Signed by both parties: ${r.number} (${c.client.company})`, `<p><b>${emailEscape(c.title)}</b> is fully signed (${emailEscape(dollars(r.total_cents, r.currency))}).</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}<p>${owed.length ? `${emailEscape(c.client.signerName || 'The client')} was asked to pay ${emailEscape(dollars(owed.reduce((n, o) => n + o.amountCents, 0), c.fee.currency))} now, on our pay page (invoice ${emailEscape(owed.map(o => o.number).join(', '))}). ` : ''}${fresh2.invoices_at ? 'The invoices are drafted from the payment schedule and show in Money. Next: start the project.' : 'Next: draft the invoices from the payment schedule, and start the project.'}</p>`);
  }

  // ---- the payment due on signing, asked for on our pay page ---------------------------------------------------------------------------------------
  // A fully signed contract without automatic payments: each payment due on signing (or on a date already come) is sent as an invoice to be paid on
  // our pay page, with Apple Pay first, then a card or the bank (src/pay.html, money-routes.js stripePayLink). → [{ number, amountCents, url }]
  const payable = r => !!(money?.stripePayLink && money.stripeReady?.() && !r.content.plan.autopay);
  async function askForPayment(r) {
    if (!r || r.status !== 'executed' || !payable(r)) return [];
    const today = todayISO(), signedOn = iso(r.client_signature?.at || r.executed_at) || today;
    const seqs = schedule(r.content.plan, { signedOn, deliveryOn: iso(r.delivered_on) || null }).map((p, i) => ({ ...p, seq: i + 1 })).filter(p => p.event === 'signing' || (p.falls && p.falls <= today)).map(p => p.seq);
    if (!seqs.length) return [];
    const rows = (await pool.query(`select id, number, total_cents from money_invoices where contract_id=$1 and contract_seq = any($2::int[]) and status not in ('paid','void') order by contract_seq`, [r.id, seqs])).rows;
    const out = []; for (const i of rows) { const url = await money.stripePayLink(i.id); if (url) out.push({ number: i.number, amountCents: Number(i.total_cents), url }); }
    if (out.length) await ev(r.id, 'payment_asked', { actor: 'on signing', detail: out.map(o => `${o.number}: ${dollars(o.amountCents, r.content.fee.currency)}`).join(', ') });
    return out;
  }
  // what the client still owes now on a fully signed contract, payable on our pay page: shown on the signing page
  async function owedNow(r) {
    if (r.status !== 'executed' || r.content.plan.autopay) return null;
    const rows = (await pool.query(`select i.number, i.pay_url, i.total_cents - coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id), 0) owed from money_invoices i
      where i.contract_id=$1 and i.pay_channel='stripe' and i.pay_url<>'' and i.status not in ('paid','void','draft') and i.due_on <= current_date order by i.contract_seq`, [r.id])).rows.filter(i => Number(i.owed) > 0);
    return rows.length ? { amountCents: rows.reduce((n, i) => n + Number(i.owed), 0), invoices: rows.map(i => ({ number: i.number, amountCents: Number(i.owed), url: i.pay_url })) } : null;
  }
  const payHtml = (owed, currency) => owed.length ? `<p style="margin:18px 0 6px"><b>Payment due now: ${emailEscape(dollars(owed.reduce((n, o) => n + o.amountCents, 0), currency))}</b>. Pay with Apple Pay, a card or your bank:</p>${owed.map(o => hubButton(o.url, owed.length > 1 ? `Pay ${dollars(o.amountCents, currency)} (invoice ${o.number})` : `Pay ${dollars(o.amountCents, currency)} now`)).join('')}` : '';

  // Future Basics signed with a typed name (the signer had no handwritten signature yet): the same person can put their ink on that signature,
  // while the contract still waits on the client. The text, its fingerprint and the time of signing do not change; the audit trail records it.
  app.post('/v1/contracts/:id/ink', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    const ps = r.provider_signature; if (!ps) return bad(reply, 'Future Basics has not signed this contract yet', 409);
    if (ps.ink) return bad(reply, 'This signature already carries a handwritten signature', 409);
    if (!OPEN.includes(r.status)) return bad(reply, 'The handwritten signature can be added only while the contract waits on the client', 409);
    if (String(ps.by || '').toLowerCase() !== String(req.signer.email || '').toLowerCase()) return bad(reply, `Only ${ps.name || 'the person who signed'} can add their handwritten signature`, 403);
    const ink = await signatures?.markFor(req.auth?.sub).catch(() => null); if (!ink) return bad(reply, 'Add your signature first (Settings, My signature)', 409);
    const u = await pool.query(`update contracts set provider_signature = provider_signature || jsonb_build_object('ink', $2::text, 'inkAt', now()), updated_at=now() where id=$1 and provider_signature is not null and not (provider_signature ? 'ink')`, [r.id, ink]);
    if (!u.rowCount) return bad(reply, 'This signature already carries a handwritten signature', 409);
    await ev(r.id, 'signed_provider_ink', { actor: req.signer.email, detail: ps.name, ip: ipOf(req) });
    return detail(await one(r.id));
  });

  app.post('/v1/contracts/:id/countersign', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (!OPEN.includes(r.status)) return bad(reply, r.status === 'draft' ? 'Send the contract first (or sign for Future Basics when you send it)' : `A ${r.status.replace(/_/g, ' ')} contract cannot be signed`, 409);
    if (r.provider_signature) return bad(reply, 'Future Basics has already signed this contract', 409);
    const name = clip(req.body?.name, 120) || r.content.provider.signerName || req.signer.name, title = clip(req.body?.title, 120) || r.content.provider.signerTitle;
    if (!name || name.length < 2) return bad(reply, 'Type the name of the person signing for Future Basics');
    // the signer's own handwritten signature in ink, when they have one (src/signatures.js): the contract keeps the mark it was signed with
    const ink = await signatures?.markFor(req.auth?.sub).catch(() => null), sig = { name, title, at: new Date().toISOString(), ip: ipOf(req), ua: uaOf(req), by: req.signer.email, hash: r.doc_hash, ...(ink ? { ink } : {}) };
    const u = await pool.query(`update contracts set provider_signature=$2::jsonb, updated_at=now() where id=$1 and provider_signature is null`, [r.id, JSON.stringify(sig)]); if (!u.rowCount) return bad(reply, 'Future Basics has already signed this contract', 409);
    await ev(r.id, 'signed_provider', { actor: req.signer.email, detail: name, ip: sig.ip });
    if (r.status === 'signed_by_client') await execute(r, req);
    return detail(await one(r.id));
  });

  // ---- invoices from the payment schedule -----------------------------------------------------------------------------------------------------------
  // One draft invoice for every payment in the schedule. A contract with automatic payments gets them from the payments job (the charges need them); otherwise a signer asks.
  async function draftInvoices(r, actor, userId = null) {
    const c = r.content, signedOn = iso(r.client_signature?.at || r.executed_at) || todayISO(), plan = schedule(c.plan, { signedOn, deliveryOn: iso(r.delivered_on) || c.timeline.completionOn || null });
    const db = await pool.connect(); const made = [];
    try {
      await db.query('begin'); await db.query('select pg_advisory_xact_lock(7731)');
      const used = (await db.query('select number from money_invoices')).rows.map(x => x.number), contact = r.contact_id ? (await db.query('select name, email from sales_contacts where id=$1', [r.contact_id])).rows[0] : null;
      const payNote = c.plan.method === 'invoice' || !c.plan.autopay ? '' : `Paid by ${c.plan.method === 'ach' ? 'ACH bank debit' : c.plan.method === 'card' ? 'card' : (r.client_signature?.method === 'card' ? 'card' : 'ACH bank debit')} on file${c.plan.autopay ? ' (automatic payments authorized)' : ''}.`;
      // priced with sales tax: each payment is its share before tax plus the tax on it, so the invoice carries the tax as tax
      const taxed = c.fee?.charge === 'unit' && Number(c.fee.taxCents) > 0 && Number(c.fee.taxRatePct) > 0;
      const preTax = amount => { const base = Math.round(amount * 100 / (100 + Number(c.fee.taxRatePct))); for (const d of [0, 1, -1, 2, -2]) { const x = base + d; if (x > 0 && x + taxOf(x, c.fee.taxRatePct) === amount) return x; } return null; };
      // each payment's share of the products (taxed) and of shipping, setup and services (not taxed), so the invoice taxes only the products;
      // the not-taxed share takes the odd cent so the invoice comes to the payment exactly. With nothing outside the products and no exact
      // pre-tax amount, the tax is a line of its own instead.
      const rate = Number(c.fee.taxRatePct), untaxed = taxed ? Math.max(0, Number(c.fee.subtotalCents) - Number(c.fee.taxableCents ?? c.fee.subtotalCents)) : 0;
      const label = (p, what = '') => `${c.title}: ${p.label}${what} (agreement ${r.number})`;
      const paymentLines = p => {
        const A = p.amountCents; if (!taxed) return { lines: [{ description: label(p), qty: 1, rateCents: A }] };
        let n = Math.round(A * untaxed / Number(c.fee.totalCents)), pre = preTax(A - n);
        if (pre == null && n > 0) { pre = Math.round((A - n) * 100 / (100 + rate)); n = A - pre - taxOf(pre, rate); }
        if (pre != null && pre > 0 && n >= 0) return { tax: true, lines: [{ description: label(p, untaxed ? ', products' : ''), qty: 1, rateCents: pre }, ...(n > 0 ? [{ description: label(p, ', shipping, setup and services (not taxed)'), qty: 1, rateCents: n, taxable: false }] : [])] };
        const split = Math.round(A * 100 / (100 + rate));
        return { lines: [{ description: label(p), qty: 1, rateCents: split }, { description: `Sales tax (${rate}% on products)`, qty: 1, rateCents: A - split }] };
      };
      let n = 0;
      for (const p of plan) {
        // the tax as tax on the invoice; when no pre-tax amount rounds to this payment exactly, the tax is its own line instead
        n++; const pl = paymentLines(p); const number = nextInvoiceNumber([...used, ...made.map(m => m.number)]), due = p.falls || todayISO();
        const inv = cleanInvoice({ number, company: c.client.company, contactName: c.client.signerName, contactEmail: c.client.signerEmail, address: c.client.address, issuedOn: todayISO(), dueOn: due < todayISO() ? todayISO() : due, terms: `Per agreement ${r.number}`,
          lines: pl.lines, ...(pl.tax ? { taxRatePct: rate, chargeTax: true } : {}), notes: [payNote, p.event === 'delivery' && !p.dueOn ? dueWords(c.kind, c.plan).note : ''].filter(Boolean).join(' '), currency: c.fee.currency, workKind: isProduct(c.kind) ? 'product' : 'software', projectId: r.project_id });
        if (inv.error) throw new Error(inv.error); const v = inv.value;
        const row = (await db.query(`insert into money_invoices(number,company,contact_name,contact_email,address,issued_on,terms,due_on,lines,tax_rate,charge_tax,credits,due_now_label,due_now_cents,subtotal_cents,tax_cents,total_cents,notes,currency,status,source,created_by,client_id,contact_id,deal_id,project_id,work_kind,contract_id,contract_seq)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,'draft','app',$20,$21,$22,$23,$24,$25,$26,$27) returning id, number`, [v.number, v.company, v.contactName || contact?.name || '', v.contactEmail || contact?.email || '', v.address, v.issuedOn, v.terms, v.dueOn, JSON.stringify(v.lines), v.taxRatePct, v.chargeTax, JSON.stringify(v.credits), v.dueNowLabel, v.dueNowCents, v.subtotalCents, v.taxCents, v.totalCents, v.notes, v.currency, userId, r.client_id, r.contact_id, r.deal_id, r.project_id, isProduct(c.kind) ? 'product' : 'software', r.id, n])).rows[0];
        made.push({ id: row.id, number: row.number });
      }
      await db.query('update contracts set invoices_at=now(), updated_at=now() where id=$1', [r.id]); await db.query('commit');
    } catch (e) { await db.query('rollback').catch(() => {}); return { error: e.message || 'Could not draft the invoices' }; } finally { db.release(); }
    await ev(r.id, 'invoices_drafted', { actor, detail: `${made.length} invoice${made.length === 1 ? '' : 's'}: ${made.map(m => m.number).join(', ')}` });
    return { made };
  }
  app.post('/v1/contracts/:id/invoices', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (r.status !== 'executed') return bad(reply, 'Invoices are drafted from a contract that both parties have signed', 409);
    if (r.invoices_at) return bad(reply, 'The invoices for this contract were already drafted', 409);
    const out = await draftInvoices(r, req.signer.email, req.signer.id); if (out.error) return bad(reply, out.error, 422);
    // what is already due (the payment on signing) is asked for now, on our pay page, by email
    const owed = await askForPayment(await one(r.id)).catch(() => []), c = r.content;
    if (owed.length) await sendHubEmail({ to: c.client.signerEmail, subject: `Payment due: ${c.title} (${r.number})`, html: hubEmailShell(`Payment due: ${c.title}`, `<p>Hi ${emailEscape(firstName(c.client.signerName))},</p><p>Thank you for signing <b>${emailEscape(c.title)}</b> (${emailEscape(r.number)}).</p>${payHtml(owed, c.fee.currency)}<p style="font-size:12px;color:#717177">Questions? Just reply to this email.</p>`) }).catch(() => {});
    return { ...(await detail(await one(r.id))), made: out.made, asked: owed.map(o => ({ number: o.number, amountCents: o.amountCents })) };
  });

  // What the client's page needs to take payment details: only once they have signed an agreement with automatic payments.
  const payInfo = async r => {
    if (!autopay || !r.content.plan.autopay || !r.client_signature?.autopay || !['signed_by_client', 'executed'].includes(r.status)) return null;
    const rd = await autopay.readiness(), m = await autopay.activeMethod(r.id), kind = (r.content.plan.method === 'either' ? r.client_signature.method : r.content.plan.method) === 'card' ? 'card' : 'bank', ov = await autopay.overview(r);
    const hosted = (await autopay.chosen()) === 'stripe';
    if (hosted && kind === 'card' && !m && stripe.embedded()) stripe.registerDomain(new URL(publicUrl).host).catch(() => {}); // Apple Pay shows in the form only on a domain Stripe knows: register it before the form loads (once per process)
    return { kind, ready: rd.ready, hosted, embedded: hosted && stripe.embedded(), publishableKey: hosted && stripe.embedded() ? stripe.publishableKey() : null, processor: await autopay.chosen(), testMode: hosted ? !stripe.live() : qbConfig(env).mode !== 'production', tokensUrl: rd.ready && !hosted ? tokensUrl(qbConfig(env)) : null, method: m ? { label: m.label, kind: m.kind } : null, authorization: authorizationText(kind, r.content.provider?.name || 'Future Basics'), paused: ov.paused,
      upcoming: ov.installments.map(i => ({ label: i.label, amountCents: i.amountCents, falls: i.falls, state: i.state, waits: dueWords(r.content.kind, r.content.plan).on })) };
  };

  // ---- automatic payments: staff -------------------------------------------------------------------------------------------------------------------
  const apOnly = async (req, reply) => { if (!needId(req, reply)) return null; const r = await fresh(await one(req.params.id)); if (!r) { bad(reply, 'Not found', 404); return null; } if (!autopay || !r.content.plan.autopay) { bad(reply, 'This contract does not have automatic payments', 409); return null; } return r; };
  app.post('/v1/contracts/:id/autopay/pause', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    const r = await apOnly(req, reply); if (!r) return; if (r.autopay_paused_at) return bad(reply, 'Automatic payments are already paused', 409);
    await pool.query('update contracts set autopay_paused_at=now(), autopay_paused_by=$2, updated_at=now() where id=$1', [r.id, req.signer.email]); await ev(r.id, 'autopay_paused', { actor: req.signer.email, detail: clip(req.body?.reason, 300) });
    return detail(await one(r.id));
  });
  app.post('/v1/contracts/:id/autopay/resume', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    const r = await apOnly(req, reply); if (!r) return; if (!r.autopay_paused_at) return bad(reply, 'Automatic payments are not paused', 409);
    await pool.query('update contracts set autopay_paused_at=null, autopay_paused_by=null, updated_at=now() where id=$1', [r.id]); await ev(r.id, 'autopay_resumed', { actor: req.signer.email });
    return detail(await one(r.id));
  });
  app.post('/v1/contracts/:id/autopay/charge', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    const r = await apOnly(req, reply); if (!r) return; if (r.status !== 'executed') return bad(reply, 'Payments are taken once both parties have signed', 409);
    if (r.autopay_paused_at) return bad(reply, 'Automatic payments are paused: resume them first', 409);
    const seq = Number(req.body?.seq); if (!Number.isInteger(seq) || seq < 1) return bad(reply, 'Which payment?');
    const out = await autopay.chargeNow(r, seq, { today: env.AUTOPAY_TEST_CLOCK === '1' && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.today || '')) ? req.body.today : undefined }); if (out.error) return bad(reply, out.error, out.status || 409);
    await ev(r.id, 'autopay_charge_now', { actor: req.signer.email, detail: `payment ${seq}: ${out.result}` });
    return { ...(await detail(await one(r.id))), result: out.result };
  });
  app.post('/v1/contracts/:id/autopay/request-details', { preHandler: pre }, async (req, reply) => {
    const r = await apOnly(req, reply); if (!r) return; if (!['signed_by_client', 'executed'].includes(r.status) || !r.client_signature?.autopay) return bad(reply, 'The client has to sign first', 409);
    if (await autopay.activeMethod(r.id)) return bad(reply, 'Payment details are already on file', 409);
    const c = r.content, sent = await sendHubEmail({ to: c.client.signerEmail, subject: `Add your payment details: ${c.title} (${r.number})`, html: hubEmailShell('Add your payment details', `<p>Hi ${emailEscape(firstName(c.client.signerName))},</p><p>To finish setting up the automatic payments for <b>${emailEscape(c.title)}</b>, please add your ${r.content.plan.method === 'card' || r.client_signature.method === 'card' ? 'card' : 'bank account'} on your agreement page. It goes straight to our payment provider: we never see or keep the number.</p>${hubButton(linkOf(r), 'Add payment details')}`) }).catch(() => false);
    await ev(r.id, 'payment_details_requested', { actor: (await userOf(req))?.email || '', detail: c.client.signerEmail });
    return { ok: true, sent: Boolean(sent) };
  });
  app.post('/v1/contracts/:id/delivered', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404); if (r.status !== 'executed') return bad(reply, 'The work is delivered under a signed agreement', 409);
    const on = req.body?.on ? String(req.body.on).slice(0, 10) : todayISO(); if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(on))) return bad(reply, 'That is not a date');
    await pool.query('update contracts set delivered_on=$2, updated_at=now() where id=$1', [r.id, on]); await ev(r.id, 'delivered', { actor: req.signer.email, detail: `${dueWords(r.content?.kind, r.content?.plan).done} on ${on}: payments due on ${dueWords(r.content?.kind, r.content?.plan).moment} fall due now` });
    return detail(await one(r.id));
  });
  // Run the payments job now (the job runs by itself every hour). `today` is honoured only on the journey servers.
  app.post('/v1/contracts/autopay/run', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!autopay) return bad(reply, 'Automatic payments are not set up', 409);
    return { ok: true, ...(await autopay.run({ today: env.AUTOPAY_TEST_CLOCK === '1' && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.today || '')) ? req.body.today : undefined })) };
  });


  // ---- the client's hub: their agreements, what is waiting on them, and the way to sign or add payment details from there ----------------------------------------
  // Only the person named as signer gets the signing link; other people at the client see the agreement and who it is waiting on. A staff preview of the hub gets no links.
  // ---- invoices sent outside the schedule, and closing a contract out ------------------------------------------------------------------------
  // An invoice can be made in Money on its own (a Shopify link for the work) and paid without the contract ever being signed. A signer links it
  // to the contract, so the contract shows what was invoiced and paid, and closes the contract out: settled, with how it was settled on record.
  const moneyRow = async id => (UUID.test(String(id || '')) ? (await pool.query('select id, number, status, total_cents, contract_id, contract_seq, client_id, deal_id, project_id from money_invoices where id=$1', [id])).rows[0] : null);
  app.get('/v1/contracts/:id/invoices/candidates', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await one(req.params.id); if (!r) return bad(reply, 'Not found', 404);
    const rows = (await pool.query(`select i.id, i.number, i.company, i.status, i.total_cents, i.issued_on, coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id),0)::bigint paid_cents
        from money_invoices i where i.contract_id is null and i.status <> 'void'
          and ((i.client_id is not null and i.client_id=$1) or (i.project_id is not null and i.project_id=$2) or (i.deal_id is not null and i.deal_id=$3) or (lower(i.company)=lower($4) and $4<>''))
        order by i.issued_on desc nulls last, i.created_at desc limit 40`, [r.client_id, r.project_id, r.deal_id, String(r.content?.client?.company || '').trim()])).rows;
    return { invoices: rows.map(i => ({ id: i.id, number: i.number, company: i.company, status: i.status, totalCents: Number(i.total_cents), paidCents: Number(i.paid_cents), issuedOn: iso(i.issued_on) })) };
  });
  app.post('/v1/contracts/:id/invoices/:op', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await one(req.params.id); if (!r) return bad(reply, 'Not found', 404);
    const op = req.params.op; if (!['link', 'unlink'].includes(op)) return bad(reply, 'Not found', 404);
    const inv = await moneyRow(req.body?.invoiceId); if (!inv) return bad(reply, 'Choose an invoice', 404);
    if (op === 'link') {
      if (inv.contract_id && inv.contract_id !== r.id) return bad(reply, `Invoice ${inv.number} already belongs to another contract`, 409);
      if (inv.status === 'void') return bad(reply, 'A void invoice cannot be linked', 409);
      await pool.query('update money_invoices set contract_id=$2, client_id=coalesce(client_id,$3), deal_id=coalesce(deal_id,$4), project_id=coalesce(project_id,$5), updated_at=now() where id=$1', [inv.id, r.id, r.client_id, r.deal_id, r.project_id]);
      await ev(r.id, 'invoice_linked', { actor: req.signer.email, detail: `Invoice ${inv.number} (${dollars(inv.total_cents, r.currency)})` });
    } else {
      if (inv.contract_id !== r.id) return bad(reply, 'That invoice is not on this contract', 409);
      if (inv.contract_seq != null) return bad(reply, 'Invoices drafted from the payment schedule stay with their contract', 409);
      await pool.query('update money_invoices set contract_id=null, updated_at=now() where id=$1', [inv.id]);
      await ev(r.id, 'invoice_unlinked', { actor: req.signer.email, detail: `Invoice ${inv.number}` });
    }
    return detail(await one(r.id));
  });
  app.post('/v1/contracts/:id/close', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (!CLOSABLE.includes(r.status)) return bad(reply, r.status === 'closed' ? 'It is already closed out' : r.status === 'draft' ? 'A draft has nothing to close: send it, or void it' : `A ${r.status.replace(/_/g, ' ')} contract cannot be closed out`, 409);
    const d = await detail(r), signed = r.status === 'executed', paid = d.money.paidCents, invNums = d.invoices.filter(i => i.status !== 'void').map(i => i.number);
    const how = `${signed ? 'Signed by both parties' : r.client_signature ? 'Signed by the client only' : 'Not signed'}; ${paid > 0 ? `${dollars(paid, r.currency)} of ${dollars(r.total_cents, r.currency)} paid${invNums.length ? ` (invoice ${invNums.join(', ')})` : ''}` : 'nothing paid on a linked invoice'}`;
    const note = clip(req.body?.note, 500);
    await pool.query(`update contracts set status='closed', closed_from=$2, closed_at=now(), closed_by=$3, close_note=$4, updated_at=now() where id=$1`, [r.id, r.status, req.signer.email, note]);
    await ev(r.id, 'closed', { actor: req.signer.email, detail: `${how}${note ? `. ${note}` : ''}`, meta: { from: r.status, paidCents: paid, invoices: invNums } });
    await syncContractDeal(pool, await one(r.id), { actorId: actorId(req), log }); // closed out: the deal is won at the contract's value
    return detail(await one(r.id));
  });
  app.post('/v1/contracts/:id/reopen', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await one(req.params.id); if (!r) return bad(reply, 'Not found', 404);
    if (r.status !== 'closed') return bad(reply, 'Only a closed contract can be reopened', 409);
    const back = CLOSABLE.includes(r.closed_from) ? r.closed_from : 'sent';
    await pool.query(`update contracts set status=$2, closed_at=null, closed_by=null, closed_from=null, updated_at=now() where id=$1`, [r.id, back]);
    await ev(r.id, 'reopened', { actor: req.signer.email, detail: `Back to ${back.replace(/_/g, ' ')}` });
    return detail(await one(r.id));
  });

  async function hubContracts({ clientId, userId, preview = false }) {
    if (!clientId) return [];
    const me = String((await pool.query('select email from users where id=$1', [userId]).catch(() => ({ rows: [] }))).rows[0]?.email || '').toLowerCase();
    // Everything for this client, plus anything addressed to the signed-in person's own email wherever it was filed (a staff preview never matches on email).
    const byEmail = Boolean(me) && !preview;
    const rows = (await pool.query(`select * from contracts where (client_id=$1 or ($2::boolean and lower(content->'client'->>'signerEmail')=$3)) and status in ('sent','signed_by_client','executed') order by coalesce(executed_at, sent_at, created_at) desc`, [clientId, byEmail, me])).rows, out = [];
    for (let r of rows) {
      r = await fresh(r); if (!r || !['sent', 'signed_by_client', 'executed'].includes(r.status)) continue;
      const c = r.content, mine = Boolean(me) && me === String(c.client.signerEmail || '').toLowerCase(), token = signToken(secret, r.id, r.token_version), link = mine && !preview ? `${publicUrl}/sign/${token}` : null;
      const method = c.plan.autopay && autopay ? await autopay.activeMethod(r.id) : null, wantsDetails = Boolean(autopay && c.plan.autopay && r.client_signature?.autopay && ['signed_by_client', 'executed'].includes(r.status) && !method);
      // each payment in the plan, and where it stands: paid, invoiced (with its pay link), or still to come (a draft invoice is not shown to the client)
      const inv = (await pool.query(`select i.id, i.number, i.status, i.total_cents, i.due_on, i.contract_seq, i.pay_url, coalesce((select sum(p.amount_cents) from money_payments p where p.invoice_id=i.id),0)::bigint paid_cents
          from money_invoices i where i.contract_id=$1 and i.status<>'void' order by i.contract_seq, i.created_at`, [r.id]).catch(() => ({ rows: [] }))).rows;
      const signedOn = iso(r.client_signature?.at || r.executed_at), deliveryOn = iso(r.delivered_on) || c.timeline?.completionOn || null;
      const payments = schedule(c.plan, { signedOn, deliveryOn }).map((p, n) => {
        const i = inv.find(x => Number(x.contract_seq) === n + 1 && x.status !== 'draft'), paid = i && (i.status === 'paid' || Number(i.paid_cents) >= Number(i.total_cents));
        return { seq: n + 1, label: p.label || '', amountCents: Number(p.amountCents) || 0, when: p.dueOn ? 'on ' + longDate(p.dueOn) : p.event === 'signing' ? 'on signing' : dueWords(c.kind, c.plan).when, falls: p.falls || null,
          state: paid ? 'paid' : i ? 'invoiced' : 'upcoming', invoice: i ? { number: i.number, dueOn: iso(i.due_on), payUrl: paid ? '' : i.pay_url || '' } : null };
      });
      const shown = inv.filter(x => x.status !== 'draft'), invoicedCents = shown.reduce((a, x) => a + Number(x.total_cents), 0), paidCents = shown.reduce((a, x) => a + (x.status === 'paid' ? Number(x.total_cents) : Math.min(Number(x.paid_cents), Number(x.total_cents))), 0);
      out.push({ id: r.id, number: r.number, title: r.title, status: r.status, totalCents: Number(r.total_cents), currency: r.currency, sentAt: r.sent_at, executedAt: r.executed_at, expiresAt: r.expires_at, signerName: c.client.signerName || '',
        payments, invoicedCents, paidCents, method: c.plan.method || 'invoice', projectId: r.project_id || null,
        youAreSigner: mine, link, pdfUrl: link ? `/v1/public/contracts/${token}/pdf` : null, summary: planWords(c.plan, r.currency, c.kind), autopay: Boolean(c.plan.autopay), cardOnFile: method ? method.label : null,
        needs: r.status === 'sent' ? 'sign' : wantsDetails ? 'details' : null });
    }
    return out;
  }

  // ---- the client ------------------------------------------------------------------------------------------------------------------------------------
  async function byToken(req, reply) {
    if (!throttle(`contract:${req.ip}`, { limit: 120, windowMs: 3600_000 }) || !throttle('contract:all', { limit: 4000, windowMs: 3600_000 })) { bad(reply, 'Too many tries from here. Please wait a few minutes.', 429); return null; }
    const t = readToken(secret, req.params.token), r = t ? await fresh(await one(t.id)) : null;
    if (!r || r.token_version !== t.version) { bad(reply, 'This link is not valid any more. Ask the sender for a new one.', 404); return null; }
    return r;
  }
  app.get('/v1/public/contracts/:token', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    const closed = ['void', 'draft'].includes(r.status);
    if (closed) return reply.header('cache-control', 'no-store').send({ status: r.status === 'draft' ? 'void' : r.status, number: r.number, title: r.title });
    if (!(await pool.query(`select 1 from contract_events where contract_id=$1 and kind='viewed' and ip=$2 and at > now() - interval '10 minutes'`, [r.id, ipOf(req)])).rowCount) {
      await pool.query('update contracts set first_viewed_at=coalesce(first_viewed_at, now()), last_viewed_at=now(), view_count=view_count+1 where id=$1', [r.id]); await ev(r.id, 'viewed', { actor: 'client', ip: ipOf(req), meta: { ua: uaOf(req) } });
      if (!r.first_viewed_at && r.status === 'sent') await notifyStaff(`${r.content.client.signerName || 'The client'} opened ${r.number}`, `<p><b>${emailEscape(r.title)}</b> was just opened for the first time.</p>`);
    }
    const rendered = await renderOf(r), c = r.content;
    return reply.header('cache-control', 'no-store').send({ status: r.status, number: r.number, title: r.title, rendered, expiresAt: r.expires_at, sentAt: r.sent_at, canSign: r.status === 'sent', plan: { method: c.plan.method, autopay: !!c.plan.autopay },
      pay: await payInfo(r), payNow: await owedNow(r), dueOnSigningCents: payable(r) ? c.plan.installments.filter(p => p.event === 'signing').reduce((n, p) => n + Number(p.amountCents), 0) : 0, signer: { name: c.client.signerName, title: c.client.signerTitle, email: c.client.signerEmail }, clientSignature: sigView(r.client_signature), providerSignature: sigView(r.provider_signature), declined: r.declined ? { at: r.declined.at } : null, executedAt: r.executed_at, hash: r.doc_hash });
  });
  app.get('/v1/public/contracts/:token/pdf', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return; if (['void', 'draft'].includes(r.status)) return bad(reply, 'This agreement is no longer open', 404);
    const buf = await contractPdf(await renderOf(r), await pdfState(r));
    return reply.type('application/pdf').header('content-disposition', disposition(agreementName(r), { inline: req.query?.dl !== '1' })).header('cache-control', 'no-store').send(buf);
  });
  app.post('/v1/public/contracts/:token/sign', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (r.status !== 'sent') return bad(reply, r.status === 'expired' ? 'This agreement has expired. Ask the sender for a new one.' : r.client_signature ? 'This agreement has already been signed.' : 'This agreement is not open for signing.', 409);
    const rendered = await renderOf(r); if (docHash(rendered) !== r.doc_hash) return bad(reply, 'This agreement has changed since it was sent. Ask the sender for a new link.', 409);
    const s = checkSignature(req.body, r.content); if (s.error) return bad(reply, s.error);
    const sig = { ...s.value, at: new Date().toISOString(), ip: ipOf(req), ua: uaOf(req), hash: r.doc_hash, agree: true, esign: true, email: r.content.client.signerEmail };
    // signed with a finger (or a pen, or a mouse) as well as the typed name: the drawing becomes the ink on the page and the PDF
    if (req.body?.ink != null && signatures?.inkFromDrawing) { const m = await signatures.inkFromDrawing(req.body.ink); if (m.error) return bad(reply, m.error); sig.ink = m.id; }
    const u = await pool.query(`update contracts set client_signature=$2::jsonb, status='signed_by_client', updated_at=now() where id=$1 and status='sent' returning provider_signature`, [r.id, JSON.stringify(sig)]);
    if (!u.rowCount) return bad(reply, 'This agreement has already been signed.', 409);
    await ev(r.id, 'signed_client', { actor: sig.name, detail: sig.title, ip: sig.ip, meta: { ua: sig.ua, method: sig.method || null, autopay: !!sig.autopay } });
    if (!r.deal_id) { await syncContractDeal(pool, await one(r.id), { log }); Object.assign(r, await one(r.id)); }
    if (r.contact_id) await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta) values($1,$2,'system',$3,$4::jsonb)`, [r.contact_id, r.deal_id, `${sig.name} signed agreement ${r.number}`, JSON.stringify({ contractId: r.id })]).catch(() => {});
    if (u.rows[0].provider_signature) await execute(r, req);
    else await notifyStaff(`${sig.name} signed ${r.number}: it needs your signature`, `<p><b>${emailEscape(r.title)}</b> (${emailEscape(dollars(r.total_cents, r.currency))}) was signed by ${emailEscape(r.content.client.company)}. It becomes final when Future Basics signs too.</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract and sign')}`);
    const now = await one(r.id);
    return { ok: true, status: now.status, executed: now.status === 'executed', signedAt: sig.at };
  });
  app.post('/v1/public/contracts/:token/payment-method', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (!throttle(`contract-pay:${req.ip}`, { limit: 20, windowMs: 3600_000 })) return bad(reply, 'Too many tries from here. Please wait a few minutes.', 429);
    if (!autopay) return bad(reply, 'Automatic payments are not set up', 409);
    const kind = req.body?.kind === 'card' ? 'card' : req.body?.kind === 'bank' ? 'bank' : '', token = String(req.body?.token || '');
    if (!kind) return bad(reply, 'Choose a card or a bank account'); if (!/^[\w.\-=+/]{8,4000}$/.test(token)) return bad(reply, 'The payment details did not arrive. Try again.');
    const out = await autopay.saveMethod(r, { kind, token, ip: ipOf(req), ua: uaOf(req) });
    if (out.notReady) await notifyStaff(`${r.content.client.company} tried to add payment details for ${r.number}`, `<p>${emailEscape(out.notReady)}</p>${hubButton(`${workUrl}/money#settings`, 'Open Money settings')}`);
    if (out.error) return bad(reply, out.error, out.status || 422);
    if (r.status === 'executed') await autopay.runFor(r.id).catch(() => {}); // a payment already due (the deposit on signing) is taken now, not at the next hourly run
    return { ok: true, method: out.method };
  });
  // ---- Stripe: the client adds their card (Apple Pay and Google Pay come with it) or bank account on Stripe's own page, and comes back here ----
  app.post('/v1/public/contracts/:token/payment-session', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (!throttle(`contract-pay-start:${req.ip}`, { limit: 30, windowMs: 3600_000 })) return bad(reply, 'Too many tries from here. Please wait a few minutes.', 429);
    if (!autopay || (await autopay.chosen()) !== 'stripe') return bad(reply, 'Automatic payments are not set up', 409);
    if (req.body?.agree !== true) return bad(reply, 'Please tick the box to authorize the payments');
    const out = await autopay.startStripeSetup(r, { returnUrl: `${publicUrl}/sign/${req.params.token}`, kind: req.body?.kind === 'card' ? 'card' : req.body?.kind === 'bank' ? 'bank' : null, ip: ipOf(req) });
    if (out.notReady) await notifyStaff(`${r.content.client.company} tried to add payment details for ${r.number}`, `<p>${emailEscape(out.notReady)}</p>${hubButton(`${workUrl}/money#settings`, 'Open Money settings')}`);
    if (out.error) return bad(reply, out.error, out.status || 422);
    return { ok: true, url: out.url };
  });
  // the same, in Stripe's Payment Element on our own signing page: a SetupIntent the page confirms with Stripe.js (needs STRIPE_PUBLISHABLE_KEY)
  app.post('/v1/public/contracts/:token/payment-intent', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (!throttle(`contract-pay-start:${req.ip}`, { limit: 30, windowMs: 3600_000 })) return bad(reply, 'Too many tries from here. Please wait a few minutes.', 429);
    if (!autopay || (await autopay.chosen()) !== 'stripe' || !stripe.embedded()) return bad(reply, 'Automatic payments are not set up', 409);
    if (req.body?.agree !== true) return bad(reply, 'Please tick the box to authorize the payments');
    const out = await autopay.startStripeSetup(r, { embedded: true, domain: new URL(publicUrl).host, kind: req.body?.kind === 'card' ? 'card' : req.body?.kind === 'bank' ? 'bank' : null, ip: ipOf(req) });
    if (out.notReady) await notifyStaff(`${r.content.client.company} tried to add payment details for ${r.number}`, `<p>${emailEscape(out.notReady)}</p>${hubButton(`${workUrl}/money#settings`, 'Open Money settings')}`);
    if (out.error) return bad(reply, out.error, out.status || 422);
    return reply.header('cache-control', 'no-store').send({ ok: true, clientSecret: out.clientSecret, publishableKey: out.publishableKey, kind: out.kind });
  });
  app.post('/v1/public/contracts/:token/payment-intent/complete', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (!throttle(`contract-pay-back:${req.ip}`, { limit: 40, windowMs: 3600_000 })) return bad(reply, 'Too many tries from here. Please wait a few minutes.', 429);
    const intentId = String(req.body?.setupIntentId || ''); if (!/^seti_[\w]{8,200}$/.test(intentId)) return bad(reply, 'The payment form did not say what happened. Try again.');
    if (!autopay || !stripe.configured()) return bad(reply, 'Automatic payments are not set up', 409);
    const out = await autopay.completeStripeIntent(r, intentId, { ip: ipOf(req), ua: uaOf(req) });
    if (out.pending) return reply.code(202).send({ ok: true, pending: true, message: out.message });
    if (out.error) return bad(reply, out.error, out.status || 422);
    if (!out.already && r.status === 'executed') await autopay.runFor(r.id).catch(() => {}); // a payment already due (the deposit on signing) is taken now
    return { ok: true, method: out.method };
  });
  app.post('/v1/public/contracts/:token/payment-session/complete', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (!throttle(`contract-pay-back:${req.ip}`, { limit: 40, windowMs: 3600_000 })) return bad(reply, 'Too many tries from here. Please wait a few minutes.', 429);
    const sessionId = String(req.body?.sessionId || ''); if (!/^cs_[\w]{8,300}$/.test(sessionId)) return bad(reply, 'The payment page did not say what happened. Try again.');
    if (!autopay || !stripe.configured()) return bad(reply, 'Automatic payments are not set up', 409);
    const out = await autopay.completeStripePage(r, sessionId, { ip: ipOf(req), ua: uaOf(req) });
    if (out.pending) return reply.code(202).send({ ok: true, pending: true, message: out.message });
    if (out.error) return bad(reply, out.error, out.status || 422);
    if (!out.already && r.status === 'executed') await autopay.runFor(r.id).catch(() => {}); // a payment already due (the deposit on signing) is taken now
    return { ok: true, method: out.method };
  });
  // Stripe tells us what happened (details saved, a bank account confirmed, a debit settled or refused). Signed with the webhook secret; anything else is refused.
  app.post('/v1/stripe/webhook', { preParsing: async (req, _reply, payload) => { const chunks = []; for await (const c of payload) chunks.push(c); req.rawBody = Buffer.concat(chunks); const { Readable } = await import('node:stream'); return Readable.from(req.rawBody); } }, async (req, reply) => {
    const raw = req.rawBody?.toString('utf8') || '';
    if (!verifyStripeWebhook({ rawBody: raw, header: req.headers['stripe-signature'], secret: stripe.webhookSecret() })) return bad(reply, 'Bad signature', 401);
    let evt; try { evt = JSON.parse(raw); } catch { return bad(reply, 'Bad body', 400); }
    // an invoice paid on our pay page (money-routes.js): its payment is recorded there
    if (evt?.data?.object?.metadata?.invoice && money?.stripeInvoiceEvent) {
      try { return { ok: true, ...(await money.stripeInvoiceEvent(evt)) }; }
      catch (e) { log.warn?.({ stripe: true, err: String(e.message).slice(0, 200), type: evt?.type }, 'Stripe webhook for an invoice failed'); return reply.code(500).send({ error: 'Try again' }); }
    }
    if (!autopay) return { ok: true };
    try { const out = await autopay.stripeEvent(evt); return { ok: true, ...(out?.ignored ? { ignored: out.ignored } : {}) }; }
    catch (e) { log.warn?.({ stripe: true, err: String(e.message).slice(0, 200), type: evt?.type }, 'Stripe webhook failed'); return reply.code(500).send({ error: 'Try again' }); }
  });
  app.post('/v1/public/contracts/:token/decline', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return; if (r.status !== 'sent') return bad(reply, 'This agreement is not open for signing.', 409);
    const reason = clip(req.body?.reason, 500), decl = { at: new Date().toISOString(), reason, ip: ipOf(req) };
    const u = await pool.query(`update contracts set status='declined', declined=$2::jsonb, updated_at=now() where id=$1 and status='sent'`, [r.id, JSON.stringify(decl)]); if (!u.rowCount) return bad(reply, 'This agreement is not open for signing.', 409);
    await ev(r.id, 'declined', { actor: r.content.client.signerName, detail: reason, ip: decl.ip });
    await syncContractDeal(pool, await one(r.id), { log });
    await notifyStaff(`${r.content.client.signerName || 'The client'} declined ${r.number}`, `<p><b>${emailEscape(r.title)}</b> was declined${reason ? `: ${emailEscape(reason)}` : '.'}</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}`);
    return { ok: true };
  });
  return { autopay, draftInvoices, hubContracts, resolveClient };
}
