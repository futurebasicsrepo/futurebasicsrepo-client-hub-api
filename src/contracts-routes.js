// Contracts for digital work and physical product development. Staff build one from a deal and its project, send it for signature, and see who has opened and signed it; the client opens a private
// link, reads the whole agreement and signs by typing their name. See contracts.js for the rules and docs/contracts.md for the flow.
//
//   Staff (any signed-in teammate unless noted)
//   GET  /v1/contracts                      the list, newest first (?status=, ?q=)
//   GET  /v1/contracts/sources              deals and projects a contract can be made from, with the contracts already made for each
//   GET  /v1/contracts/draft?deal=|project= a contract filled in from one (nothing is saved)
//   GET  /v1/contracts/template?kind=        the standard wording for a kind (digital work or a physical product) and the product options
//   POST /v1/contracts/render               { content } → the finished text and what is still missing (nothing is saved)
//   GET|PUT /v1/contracts/settings          who signs for Future Basics, the address and the governing law the wording uses
//   POST /v1/contracts                      { content, dealId?, projectId? } → a draft
//   GET  /v1/contracts/:id   PUT /v1/contracts/:id (drafts only)   GET /v1/contracts/:id/pdf
//   POST /v1/contracts/:id/send             { message?, signNow? } email the signing link (signNow signs for Future Basics, signers only)
//   POST /v1/contracts/:id/remind | link | revise | void { reason }
//   POST /v1/contracts/:id/countersign      signers only (the people named for Money): sign for Future Basics
//   POST /v1/contracts/:id/invoices         signers only: draft an invoice for every payment in the schedule of a signed contract
//
//   The client (no sign-in: the link is the key)
//   GET  /v1/public/contracts/:token        the agreement as the client sees it      GET .../pdf
//   POST /v1/public/contracts/:token/sign { name, title, agree, esign, autopay?, method? }      POST .../decline { reason }
import { cleanContent, renderContract, sendProblems, docHash, signToken, readToken, nextNumber, checkSignature, buildPlan, planWords, schedule, defaultSections, dollars, longDate, todayISO, addDays, KINDS, TERMS, isProduct, defaultProduct, PRODUCT_CATEGORIES, INCOTERMS, PRODUCTION_MODES } from './contracts.js';
import { contractPdf } from './contract-pdf.js';
import { moneyAllowed, cleanInvoice, nextInvoiceNumber } from './money.js';
import { fireTrigger } from './sales-automations-engine.js';
import { createAutopay, authorizationText } from './autopay.js';
import { processor as paymentProcessor, tokensUrl } from './qb-payments.js';
import { createStripe, verifyWebhook as verifyStripeWebhook } from './stripe-payments.js';
import { qbConfig } from './quickbooks.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const OPEN = ['sent', 'signed_by_client'];
const STATUS_FILTER = ['draft', 'sent', 'signed_by_client', 'executed', 'declined', 'void', 'expired'];

export function registerContractRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, sendHubEmail = async () => false, hubEmailShell = (t, b) => b, hubButton = () => '', emailEscape = s => String(s), notifyStaff = async () => false,
    money = null, proc = paymentProcessor, secret = 'dev', publicUrl = 'https://hub.thefuturebasics.com', workUrl = 'https://work.thefuturebasics.com', env = process.env, throttle = () => true, log = console } = d;
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

  const DEFAULTS = { providerName: 'Future Basics', providerAddress: '', signerName: '', signerTitle: '', governingLaw: '' };
  const settings = async () => ({ ...DEFAULTS, ...((await getSetting('contractSettings').catch(() => null)) || {}) });
  const cleanSettings = i => ({ providerName: clip(i?.providerName, 120) || DEFAULTS.providerName, providerAddress: String(i?.providerAddress ?? '').trim().slice(0, 300), signerName: clip(i?.signerName, 120), signerTitle: clip(i?.signerTitle, 120), governingLaw: clip(i?.governingLaw, 120) });

  const one = async id => (await pool.query('select c.*, d.title deal_title, p.name project_name from contracts c left join sales_deals d on d.id=c.deal_id left join projects p on p.id=c.project_id where c.id=$1', [id])).rows[0];
  // Automatic payments (autopay.js). Without the Money routes (no QuickBooks) there is nothing to charge through, and the contract simply says so.
  const autopay = money ? createAutopay({ pool, proc, stripe, getSetting, money, draftInvoices: async r => { const out = await draftInvoices(r, 'autopay'); if (out.error) await ev(r.id, 'invoices_failed', { actor: 'autopay', detail: out.error }); return out; }, reload: one, sendHubEmail, hubEmailShell, hubButton, emailEscape, notifyStaff, secret, publicUrl, workUrl, log, env }) : null;
  // A contract that was sent and ran past its date is expired from then on (found out when it is next looked at, so no clock is needed).
  async function fresh(r) {
    if (r && r.status === 'sent' && r.expires_at && new Date(r.expires_at) < new Date()) {
      const u = await pool.query(`update contracts set status='expired', updated_at=now() where id=$1 and status='sent' returning id`, [r.id]);
      if (u.rowCount) { await ev(r.id, 'expired', { detail: 'Not signed before ' + iso(r.expires_at) }); r = await one(r.id); }
    }
    return r;
  }
  const linkOf = r => `${publicUrl}/sign/${signToken(secret, r.id, r.token_version)}`;
  const sigView = (s, staff = false) => s ? { name: s.name, title: s.title || '', at: s.at, method: s.method || null, autopay: !!s.autopay, ...(staff ? { ip: s.ip || '', by: s.by || null } : {}) } : null;
  const view = (r, { staff = true } = {}) => ({
    id: r.id, number: r.number, version: r.version, supersedesId: r.supersedes_id, kind: r.kind, kindLabel: KINDS[r.kind] || '', title: r.title, status: r.status, clientCompany: r.content?.client?.company || '', signerName: r.content?.client?.signerName || '', signerEmail: r.content?.client?.signerEmail || '',
    totalCents: Number(r.total_cents), currency: r.currency, dealId: r.deal_id || null, dealTitle: r.deal_title || '', projectId: r.project_id || null, projectName: r.project_name || '', clientId: r.client_id || null, contactId: r.contact_id || null,
    sentAt: r.sent_at, sentTo: r.sent_to || '', expiresAt: r.expires_at, firstViewedAt: r.first_viewed_at, lastViewedAt: r.last_viewed_at, viewCount: r.view_count, clientSignature: sigView(r.client_signature, staff), providerSignature: sigView(r.provider_signature, staff),
    declined: r.declined || null, voidReason: r.void_reason || '', executedAt: r.executed_at, invoicesAt: r.invoices_at, createdAt: r.created_at, updatedAt: r.updated_at, docHash: r.doc_hash || ''
  });
  const stateFor = async r => ({ status: r.status, sentAt: r.sent_at, hash: r.doc_hash || '', clientSignature: r.client_signature, providerSignature: r.provider_signature, declined: r.declined, events: (await pool.query(`select kind, at, ip, meta from contract_events where contract_id=$1 and kind='viewed' order by at limit 1`, [r.id])).rows });
  const renderOf = async (r, st) => renderContract({ ...r.content, number: r.number }, st || await settings());

  // ---- drafting from the platform -----------------------------------------------------------------------------------------------------------
  const kindFrom = text => (/\b(web ?site|site|landing|storefront|shop)\b/i.test(text) ? 'website' : /\b(app|software|platform|portal|dashboard|system|integration)\b/i.test(text) ? 'app' : /\b(hats?|caps?|shirts?|tees?|hoodies?|apparel|garments?|shoes?|sneakers?|footwear|boots?|electronics?|devices?|hardware|bags?|jackets?|sample|samples|factory|manufactur\w*|product development)\b/i.test(text) ? 'product' : 'other');
  async function draftFrom({ dealId = null, projectId = null }, st) {
    let deal = null, project = null, client = null;
    if (dealId) deal = (await pool.query(`select d.*, ct.name contact_name, ct.email contact_email, ct.title contact_title, coalesce(co.name, co2.name, '') company from sales_deals d left join sales_contacts ct on ct.id=d.contact_id left join sales_companies co on co.id=d.company_id left join sales_companies co2 on co2.id=ct.company_id where d.id=$1`, [dealId])).rows[0];
    if (projectId || deal?.project_id) project = (await pool.query('select * from projects where id=$1', [projectId || deal.project_id])).rows[0];
    if (project) client = (await pool.query('select id, name, contact_name, contact_email from clients where id=$1', [project.client_id])).rows[0];
    if (!deal && project) deal = (await pool.query(`select d.*, ct.name contact_name, ct.email contact_email, ct.title contact_title, coalesce(co.name, co2.name, '') company from sales_deals d left join sales_contacts ct on ct.id=d.contact_id left join sales_companies co on co.id=d.company_id left join sales_companies co2 on co2.id=ct.company_id where d.project_id=$1 order by d.created_at desc limit 1`, [project.id])).rows[0] || null;
    if (!deal && !project) return null;
    const company = deal?.company || client?.name || '', projectName = project?.name || deal?.title || '', title = clip(deal?.title || projectName, 160);
    const total = deal ? Number(deal.value_cents) : 0, kind = project ? (project.kind === 'software' ? 'app' : 'product') : kindFrom(`${title} ${projectName}`);
    const plan = total > 0 ? buildPlan({ type: 'split', totalCents: total, depositPct: 50 }).plan : null;
    const content = { title, kind, provider: { name: st.providerName, address: st.providerAddress, signerName: st.signerName, signerTitle: st.signerTitle }, client: { company, address: '', signerName: deal?.contact_name || client?.contact_name || '', signerTitle: deal?.contact_title || '', signerEmail: deal?.contact_email || client?.contact_email || '' },
      project: { name: projectName }, scope: [title ? `Deliver: ${title}` : ''].filter(Boolean), notIncluded: [], timeline: { effectiveOn: todayISO(), startOn: '', completionOn: '' }, fee: { totalCents: total, currency: 'USD' }, plan, hosting: { included: false, monthlyCents: 0, note: '' }, terms: { ...TERMS, governingLaw: st.governingLaw }, sections: defaultSections(kind), ...(isProduct(kind) ? { product: defaultProduct() } : {}) };
    return { content, dealId: deal?.id || null, projectId: project?.id || null, clientId: project?.client_id || null, contactId: deal?.contact_id || null };
  }

  // Which payment processor takes new card and bank details (QuickBooks Payments or Stripe), and whether each is ready. Only the signers can change it.
  const paymentsView = async () => ({ processor: autopay ? await autopay.chosen() : 'quickbooks', stripe: { configured: stripe.configured(), live: stripe.live(), webhook: Boolean(stripe.webhookSecret()), webhookUrl: `${publicUrl}/v1/stripe/webhook` }, quickbooks: { ready: autopay ? (await autopay.readiness('quickbooks')).ready : false } });
  app.get('/v1/contracts/settings', { preHandler: pre }, async () => ({ settings: await settings(), payments: await paymentsView() }));
  app.put('/v1/contracts/autopay/processor', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    const processor = req.body?.processor === 'stripe' ? 'stripe' : req.body?.processor === 'quickbooks' ? 'quickbooks' : '';
    if (!processor) return bad(reply, 'Choose QuickBooks Payments or Stripe');
    if (processor === 'stripe' && !stripe.configured()) return bad(reply, 'Stripe is not set up yet: add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to the service first', 409);
    if (processor === 'stripe' && !stripe.webhookSecret()) return bad(reply, 'Add STRIPE_WEBHOOK_SECRET to the service first: Stripe tells us about bank debits that settle later', 409);
    await setSetting('autopayProcessor', { processor, by: req.signer.email, at: new Date().toISOString() });
    return { payments: await paymentsView() };
  });
  app.put('/v1/contracts/settings', { preHandler: pre }, async (req) => { const v = cleanSettings(req.body); await setSetting('contractSettings', v); return { settings: v }; });

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
    const dealId = UUID.test(String(req.query?.deal || '')) ? req.query.deal : null, projectId = UUID.test(String(req.query?.project || '')) ? req.query.project : null;
    if (!dealId && !projectId) return bad(reply, 'Choose a deal or a project to start from');
    const st = await settings(), r = await draftFrom({ dealId, projectId }, st); if (!r) return bad(reply, 'Not found', 404);
    const c = cleanContent(r.content, { settings: st, lenient: true });
    return { ...r, content: c.value, problems: [...c.errors, ...sendProblems(c.value, st)] };
  });

  // The editor asks for a payment plan as it is being set up: the same builder that checks it when the contract is sent.
  app.post('/v1/contracts/plan', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, total = Math.round(Number(b.totalCents));
    const r = buildPlan({ type: b.type, totalCents: total, depositPct: b.depositPct === '' ? null : b.depositPct, depositCents: b.depositCents === '' ? null : b.depositCents, months: b.months, firstDueOn: b.firstDueOn || null, deliveryOn: b.deliveryOn || null, milestones: Array.isArray(b.milestones) ? b.milestones : [], method: b.method, autopay: b.autopay === true, note: b.note });
    if (r.error) return bad(reply, r.error); return { plan: r.plan, summary: planWords(r.plan, 'USD', KINDS[b.kind] ? b.kind : '') };
  });

  app.post('/v1/contracts/render', { preHandler: pre }, async (req) => {
    const st = await settings(), c = cleanContent(req.body?.content, { settings: st, lenient: true });
    return { content: c.value, rendered: renderContract({ ...c.value, number: clip(req.body?.number, 40) || 'Draft' }, st), problems: [...c.errors, ...sendProblems(c.value, st)] };
  });

  app.get('/v1/contracts', { preHandler: pre }, async (req) => {
    await pool.query(`update contracts set status='expired', updated_at=now() where status='sent' and expires_at < now()`);
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
    if (projectId) clientId = (await pool.query('select client_id from projects where id=$1', [projectId])).rows[0]?.client_id || clientId;
    if (!clientId) clientId = await resolveClient({ projectId, signerEmail: c.value.client?.signerEmail, company: c.value.client?.company });
    if (dealId) contactId = (await pool.query('select contact_id from sales_deals where id=$1', [dealId])).rows[0]?.contact_id || contactId;
    if (existing) {
      await pool.query('update contracts set title=$2, kind=$3, content=$4::jsonb, total_cents=$5, currency=$6, deal_id=$7, project_id=$8, client_id=$9, contact_id=$10, updated_at=now() where id=$1', [existing.id, c.value.title, c.value.kind, JSON.stringify(c.value), c.value.fee.totalCents, c.value.fee.currency, dealId, projectId, clientId, contactId]);
      await ev(existing.id, 'edited', { actor: (await userOf(req))?.email || '' });
      return existing.id;
    }
    const year = new Date().getUTCFullYear();
    for (let tries = 0; tries < 5; tries++) {
      const number = nextNumber((await pool.query('select number from contracts')).rows.map(r => r.number), year);
      try {
        const id = (await pool.query(`insert into contracts(number,kind,title,content,total_cents,currency,deal_id,project_id,client_id,contact_id,created_by) values($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11) returning id`, [number, c.value.kind, c.value.title, JSON.stringify(c.value), c.value.fee.totalCents, c.value.fee.currency, dealId, projectId, clientId, contactId, actorId(req)])).rows[0].id;
        await ev(id, 'created', { actor: (await userOf(req))?.email || '', detail: number }); return id;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    return bad(reply, 'Could not number the contract. Try again.', 409);
  }
  const detail = async (r) => {
    const st = await settings(), rendered = await renderOf(r, st), invoices = (await pool.query(`select id, number, status, total_cents, due_on, contract_seq from money_invoices where contract_id=$1 order by contract_seq, created_at`, [r.id])).rows;
    const ap = autopay ? await autopay.overview(r) : null, rd = ap ? await autopay.readiness() : null;
    return { contract: view(r), content: r.content, rendered, autopay: ap ? { ...ap, ready: rd.ready, notReadyWhy: rd.why } : null, problems: r.status === 'draft' ? [...cleanContent(r.content, { settings: st, lenient: true }).errors, ...sendProblems(r.content, st)] : [],
      events: (await pool.query('select kind, actor, detail, at, ip from contract_events where contract_id=$1 order by at, id', [r.id])).rows.map(e => ({ kind: e.kind, actor: e.actor, detail: e.detail, at: e.at, ip: e.ip })),
      link: OPEN.includes(r.status) || r.status === 'executed' ? linkOf(r) : null, invoices: invoices.map(i => ({ id: i.id, number: i.number, status: i.status, totalCents: Number(i.total_cents), dueOn: iso(i.due_on), seq: i.contract_seq })) };
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
    const buf = await contractPdf(await renderOf(r), await stateFor(r));
    return reply.type('application/pdf').header('content-disposition', `inline; filename="${r.number}.pdf"`).header('cache-control', 'no-store').send(buf);
  });

  // ---- sending, reminding, replacing the link ------------------------------------------------------------------------------------------------
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
  async function mailSigner(r, { reminder = false, message = '', senderName = '', replyTo = '' } = {}) {
    const c = r.content, plan = c.plan, link = linkOf(r), until = longDate(iso(r.expires_at));
    const body = `<p>Hi ${emailEscape(firstName(c.client.signerName))},</p><p>${reminder ? 'A reminder: ' : ''}${emailEscape(senderName || c.provider.name)} has sent you an agreement to review and sign: <b>${emailEscape(c.title)}</b> (${emailEscape(r.number)}).</p>`
      + `<p>Fixed fee <b>${emailEscape(dollars(c.fee.totalCents, c.fee.currency))}</b>, paid ${emailEscape(planWords(plan, c.fee.currency, c.kind))}.</p>${message ? `<p style="padding:10px 14px;border-left:3px solid #4bff9a;background:#f5f5f2">${emailEscape(message).replace(/\n/g, '<br>')}</p>` : ''}`
      + `<p>You read the whole agreement on the page and sign by typing your name. It takes a couple of minutes and works on a phone.</p>${hubButton(link, 'Review and sign')}<p style="font-size:12px;color:#717177">The link is yours alone and works until ${emailEscape(until)}. Questions? Just reply to this email.</p>`;
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
      if (signNow) { const sig = { name: c.value.provider.signerName, title: c.value.provider.signerTitle, at: new Date().toISOString(), ip: ipOf(req), ua: uaOf(req), by: u.email, hash }; await pool.query('update contracts set provider_signature=$2::jsonb where id=$1', [r.id, JSON.stringify(sig)]); await ev(r.id, 'signed_provider', { actor: u.email, detail: sig.name, ip: sig.ip }); }
    } else { await pool.query(`update contracts set expires_at=now() + ($2 || ' days')::interval, updated_at=now() where id=$1`, [r.id, String(days)]); await ev(r.id, 'resent', { actor: u?.email || '', detail: c.value.client.signerEmail }); }
    r = await one(r.id); const ok = await mailSigner(r, { message, senderName: u?.name || '', replyTo: u?.email || '' });
    if (r.contact_id) await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,'system',$3,$4::jsonb,$5)`, [r.contact_id, r.deal_id, `Sent agreement ${r.number} for signature (${dollars(r.total_cents, r.currency)})`, JSON.stringify({ contractId: r.id }), actorId(req)]).catch(() => {});
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
    if (r.status === 'draft') return bad(reply, 'It is still a draft: just edit it', 409); if (r.status === 'executed') return bad(reply, 'A fully signed contract stands. Changes go through a new agreement or a change request.', 409);
    const db = await pool.connect();
    try {
      await db.query('begin'); const base = r.number.replace(/-v\d+$/, ''), nextV = (await db.query(`select coalesce(max(version),1)+1 v from contracts where number=$1 or number like $2`, [base, base + '-v%'])).rows[0].v;
      const id = (await db.query(`insert into contracts(number,version,supersedes_id,kind,title,content,total_cents,currency,deal_id,project_id,client_id,contact_id,created_by) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13) returning id`, [`${base}-v${nextV}`, nextV, r.id, r.kind, r.title, JSON.stringify({ ...r.content, timeline: { ...r.content.timeline, effectiveOn: todayISO() } }), r.total_cents, r.currency, r.deal_id, r.project_id, r.client_id, r.contact_id, actorId(req)])).rows[0].id;
      if (r.status !== 'void') await db.query(`update contracts set status='void', void_reason=$2, updated_at=now() where id=$1`, [r.id, `Replaced by version ${nextV}`]);
      await db.query('commit');
      const u = await userOf(req); await ev(id, 'created', { actor: u?.email || '', detail: `Version ${nextV}, replaces ${r.number}` }); await ev(r.id, 'voided', { actor: u?.email || '', detail: `Replaced by version ${nextV}` });
      return reply.code(201).send(await detail(await one(id)));
    } catch (e) { await db.query('rollback').catch(() => {}); throw e; } finally { db.release(); }
  });

  app.post('/v1/contracts/:id/void', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (r.status === 'executed') return bad(reply, 'A fully signed contract cannot be voided here', 409); if (r.status === 'void') return bad(reply, 'It is already void', 409);
    const reason = clip(req.body?.reason, 300); await pool.query(`update contracts set status='void', void_reason=$2, updated_at=now() where id=$1`, [r.id, reason]);
    await ev(r.id, 'voided', { actor: (await userOf(req))?.email || '', detail: reason }); return detail(await one(r.id));
  });

  // ---- signing for Future Basics -----------------------------------------------------------------------------------------------------------------
  async function execute(r, req) {
    await pool.query(`update contracts set status='executed', executed_at=now(), updated_at=now() where id=$1 and status in ('sent','signed_by_client')`, [r.id]);
    await ev(r.id, 'executed', { detail: 'Both parties have signed' });
    if (r.deal_id) {
      const deal = (await pool.query('select id, stage, contact_id from sales_deals where id=$1', [r.deal_id])).rows[0];
      if (deal && !['won', 'lost'].includes(deal.stage)) {
        await pool.query(`update sales_deals set stage='won', closed_at=now(), last_activity_at=now(), updated_at=now() where id=$1`, [deal.id]);
        if (deal.contact_id) { await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta) values($1,$2,'stage',$3,$4::jsonb)`, [deal.contact_id, deal.id, `Moved from ${deal.stage} to won: ${r.number} was signed by both parties`, JSON.stringify({ from: deal.stage, to: 'won', contractId: r.id })]).catch(() => {}); await fireTrigger(pool, { type: 'deal_stage', contactId: deal.contact_id, dealId: deal.id, stage: 'won' }, { deliberate: true }).catch(() => {}); }
      }
    }
    if (autopay && r.content.plan.autopay && await autopay.activeMethod(r.id)) autopay.runFor(r.id).catch(() => {}); // details were added before Future Basics signed: what is already due is taken now
    const fresh2 = await one(r.id), c = fresh2.content, link = linkOf(fresh2);
    await sendHubEmail({ to: c.client.signerEmail, subject: `Signed by both parties: ${c.title} (${r.number})`, html: hubEmailShell(`Signed: ${c.title}`, `<p>Hi ${emailEscape(firstName(c.client.signerName))},</p><p>The agreement <b>${emailEscape(c.title)}</b> (${emailEscape(r.number)}) is now signed by both parties. You can open it and download the signed copy any time:</p>${hubButton(link, 'Open the signed agreement')}<p style="font-size:12px;color:#717177">Keep this email: the link is your copy.</p>`) }).catch(() => {});
    await notifyStaff(`Signed by both parties: ${r.number} (${c.client.company})`, `<p><b>${emailEscape(c.title)}</b> is fully signed (${emailEscape(dollars(r.total_cents, r.currency))}).</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}<p>Next: draft the invoices from the payment schedule, and start the project.</p>`);
  }

  app.post('/v1/contracts/:id/countersign', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!needId(req, reply)) return; const r = await fresh(await one(req.params.id)); if (!r) return bad(reply, 'Not found', 404);
    if (!OPEN.includes(r.status)) return bad(reply, r.status === 'draft' ? 'Send the contract first (or sign for Future Basics when you send it)' : `A ${r.status.replace(/_/g, ' ')} contract cannot be signed`, 409);
    if (r.provider_signature) return bad(reply, 'Future Basics has already signed this contract', 409);
    const name = clip(req.body?.name, 120) || r.content.provider.signerName || req.signer.name, title = clip(req.body?.title, 120) || r.content.provider.signerTitle;
    if (!name || name.length < 2) return bad(reply, 'Type the name of the person signing for Future Basics');
    const sig = { name, title, at: new Date().toISOString(), ip: ipOf(req), ua: uaOf(req), by: req.signer.email, hash: r.doc_hash };
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
      const payNote = c.plan.method === 'invoice' ? '' : `Paid by ${c.plan.method === 'ach' ? 'ACH bank debit' : c.plan.method === 'card' ? 'card' : (r.client_signature?.method === 'card' ? 'card' : 'ACH bank debit')} on file${c.plan.autopay ? ' (automatic payments authorized)' : ''}.`;
      let n = 0;
      for (const p of plan) {
        n++; const number = nextInvoiceNumber([...used, ...made.map(m => m.number)]), due = p.falls || todayISO();
        const inv = cleanInvoice({ number, company: c.client.company, contactName: c.client.signerName, contactEmail: c.client.signerEmail, address: c.client.address, issuedOn: todayISO(), dueOn: due < todayISO() ? todayISO() : due, terms: `Per agreement ${r.number}`,
          lines: [{ description: `${c.title}: ${p.label} (agreement ${r.number})`, qty: 1, rateCents: p.amountCents }], notes: [payNote, p.event === 'delivery' && !p.dueOn ? (isProduct(c.kind) ? 'Due when the final sample is approved.' : 'Due when the work is delivered.') : ''].filter(Boolean).join(' '), currency: c.fee.currency, workKind: isProduct(c.kind) ? 'product' : 'software', projectId: r.project_id });
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
    return { ...(await detail(await one(r.id))), made: out.made };
  });

  // What the client's page needs to take payment details: only once they have signed an agreement with automatic payments.
  const payInfo = async r => {
    if (!autopay || !r.content.plan.autopay || !r.client_signature?.autopay || !['signed_by_client', 'executed'].includes(r.status)) return null;
    const rd = await autopay.readiness(), m = await autopay.activeMethod(r.id), kind = (r.content.plan.method === 'either' ? r.client_signature.method : r.content.plan.method) === 'card' ? 'card' : 'bank', ov = await autopay.overview(r);
    const hosted = (await autopay.chosen()) === 'stripe';
    return { kind, ready: rd.ready, hosted, processor: await autopay.chosen(), testMode: hosted ? !stripe.live() : qbConfig(env).mode !== 'production', tokensUrl: rd.ready && !hosted ? tokensUrl(qbConfig(env)) : null, method: m ? { label: m.label, kind: m.kind } : null, authorization: authorizationText(kind, r.content.provider?.name || 'Future Basics'), paused: ov.paused,
      upcoming: ov.installments.map(i => ({ label: i.label, amountCents: i.amountCents, falls: i.falls, state: i.state })) };
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
    await pool.query('update contracts set delivered_on=$2, updated_at=now() where id=$1', [r.id, on]); await ev(r.id, 'delivered', { actor: req.signer.email, detail: `${isProduct(r.content?.kind) ? 'Final sample approved' : 'Delivered'} on ${on}: payments due on ${isProduct(r.content?.kind) ? 'final sample approval' : 'delivery'} fall due now` });
    return detail(await one(r.id));
  });
  // Run the payments job now (the job runs by itself every hour). `today` is honoured only on the journey servers.
  app.post('/v1/contracts/autopay/run', { preHandler: [...pre, signerOnly] }, async (req, reply) => {
    if (!autopay) return bad(reply, 'Automatic payments are not set up', 409);
    return { ok: true, ...(await autopay.run({ today: env.AUTOPAY_TEST_CLOCK === '1' && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.today || '')) ? req.body.today : undefined })) };
  });


  // ---- the client's hub: their agreements, what is waiting on them, and the way to sign or add payment details from there ----------------------------------------
  // Only the person named as signer gets the signing link; other people at the client see the agreement and who it is waiting on. A staff preview of the hub gets no links.
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
      out.push({ id: r.id, number: r.number, title: r.title, status: r.status, totalCents: Number(r.total_cents), currency: r.currency, sentAt: r.sent_at, executedAt: r.executed_at, expiresAt: r.expires_at, signerName: c.client.signerName || '',
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
      pay: await payInfo(r), signer: { name: c.client.signerName, title: c.client.signerTitle, email: c.client.signerEmail }, clientSignature: sigView(r.client_signature), providerSignature: sigView(r.provider_signature), declined: r.declined ? { at: r.declined.at } : null, executedAt: r.executed_at, hash: r.doc_hash });
  });
  app.get('/v1/public/contracts/:token/pdf', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return; if (['void', 'draft'].includes(r.status)) return bad(reply, 'This agreement is no longer open', 404);
    const buf = await contractPdf(await renderOf(r), await stateFor(r));
    return reply.type('application/pdf').header('content-disposition', `inline; filename="${r.number}.pdf"`).header('cache-control', 'no-store').send(buf);
  });
  app.post('/v1/public/contracts/:token/sign', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return;
    if (r.status !== 'sent') return bad(reply, r.status === 'expired' ? 'This agreement has expired. Ask the sender for a new one.' : r.client_signature ? 'This agreement has already been signed.' : 'This agreement is not open for signing.', 409);
    const rendered = await renderOf(r); if (docHash(rendered) !== r.doc_hash) return bad(reply, 'This agreement has changed since it was sent. Ask the sender for a new link.', 409);
    const s = checkSignature(req.body, r.content); if (s.error) return bad(reply, s.error);
    const sig = { ...s.value, at: new Date().toISOString(), ip: ipOf(req), ua: uaOf(req), hash: r.doc_hash, agree: true, esign: true, email: r.content.client.signerEmail };
    const u = await pool.query(`update contracts set client_signature=$2::jsonb, status='signed_by_client', updated_at=now() where id=$1 and status='sent' returning provider_signature`, [r.id, JSON.stringify(sig)]);
    if (!u.rowCount) return bad(reply, 'This agreement has already been signed.', 409);
    await ev(r.id, 'signed_client', { actor: sig.name, detail: sig.title, ip: sig.ip, meta: { ua: sig.ua, method: sig.method || null, autopay: !!sig.autopay } });
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
    if (!autopay) return { ok: true };
    try { const out = await autopay.stripeEvent(evt); return { ok: true, ...(out?.ignored ? { ignored: out.ignored } : {}) }; }
    catch (e) { log.warn?.({ stripe: true, err: String(e.message).slice(0, 200), type: evt?.type }, 'Stripe webhook failed'); return reply.code(500).send({ error: 'Try again' }); }
  });
  app.post('/v1/public/contracts/:token/decline', async (req, reply) => {
    const r = await byToken(req, reply); if (!r) return; if (r.status !== 'sent') return bad(reply, 'This agreement is not open for signing.', 409);
    const reason = clip(req.body?.reason, 500), decl = { at: new Date().toISOString(), reason, ip: ipOf(req) };
    const u = await pool.query(`update contracts set status='declined', declined=$2::jsonb, updated_at=now() where id=$1 and status='sent'`, [r.id, JSON.stringify(decl)]); if (!u.rowCount) return bad(reply, 'This agreement is not open for signing.', 409);
    await ev(r.id, 'declined', { actor: r.content.client.signerName, detail: reason, ip: decl.ip });
    await notifyStaff(`${r.content.client.signerName || 'The client'} declined ${r.number}`, `<p><b>${emailEscape(r.title)}</b> was declined${reason ? `: ${emailEscape(reason)}` : '.'}</p>${hubButton(`${workUrl}/contracts?open=${r.id}`, 'Open the contract')}`);
    return { ok: true };
  });
  return { autopay, draftInvoices, hubContracts, resolveClient };
}
