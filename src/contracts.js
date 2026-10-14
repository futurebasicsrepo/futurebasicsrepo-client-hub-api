// Contracts for digital work (websites, apps, software) and for physical product development (hats, shirts, shoes, electronics): a fixed-fee agreement that is built from what the platform already knows about the deal and
// the project, circulated by a private link, signed by typing a name, and kept with an audit trail. This file is the logic with no database and no
// web server in it: the payment plan, the clauses and their merge fields, the numbers, the tamper-evident hash. contracts-routes.js stores and serves it.
//
// Money is whole cents. A payment plan is a list of installments that must add up to the fixed fee to the cent; each one is due on a date, on signing,
// or on delivery. How the client pays (ACH or card on file, or just paying each invoice) is part of the plan and part of what they agree to.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const KINDS = { website: 'Website', app: 'App or software', other: 'Other digital work', product: 'Physical product development' };
export const isProduct = kind => kind === 'product';
export const STATUSES = ['draft', 'sent', 'signed_by_client', 'executed', 'declined', 'void', 'expired'];
export const PLAN_TYPES = { full: 'Pay in full', split: 'Deposit and balance', monthly: 'Monthly payments', milestones: 'By milestone' };
export const METHODS = { invoice: 'Pay each invoice', ach: 'ACH bank debit on file', card: 'Card on file', either: 'ACH or card on file (client chooses)' };
export const EVENTS = { signing: 'On signing', delivery: 'On delivery' };
// What a payment that waits for the work to be done is called: for digital work it is delivery, for a physical product it is the approved final sample.
export const eventLabel = (event, kind) => (event === 'delivery' && isProduct(kind) ? 'On final sample approval' : EVENTS[event] || '');
export const MAX_INSTALLMENTS = 48;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const line = (v, n) => clip(v, n).replace(/\s+/g, ' ');
const isDate = s => ISO.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

export const dollars = (cents, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(cents || 0) / 100);
export const longDate = d => { if (!isDate(d)) return ''; return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); };
export const todayISO = (now = new Date()) => now.toISOString().slice(0, 10);

// The same day of the month, n months on, held to the end of a short month (31 January + 1 month = 28 February).
export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number), t = (m - 1) + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);

// ---- payment plans ----------------------------------------------------------------------------------------------------------------------------
// An installment: { label, amountCents, dueOn: 'YYYY-MM-DD' | null, event: 'signing' | 'delivery' | null }. Exactly one of dueOn / event says when.
export function buildPlan({ type = 'full', totalCents, depositCents = null, depositPct = null, months = 0, firstDueOn = null, deliveryOn = null, milestones = [], method = 'invoice', autopay = false, note = '' } = {}) {
  const total = Math.round(Number(totalCents));
  if (!Number.isFinite(total) || total <= 0) return { error: 'Set the fixed fee first' };
  if (!PLAN_TYPES[type]) return { error: 'Choose how the fee is paid' };
  const dep = depositCents != null && depositCents !== '' ? Math.round(Number(depositCents)) : depositPct != null && depositPct !== '' ? Math.round(total * Number(depositPct) / 100) : null;
  let installments = [];
  if (type === 'full') installments = [{ label: 'Payment in full', amountCents: total, dueOn: null, event: 'signing' }];
  else if (type === 'split') {
    const d = dep ?? Math.round(total / 2);
    if (d <= 0 || d >= total) return { error: 'The deposit has to be more than nothing and less than the fee' };
    installments = [{ label: 'Deposit', amountCents: d, dueOn: null, event: 'signing' }, { label: 'Balance', amountCents: total - d, dueOn: deliveryOn || null, event: deliveryOn ? null : 'delivery' }];
  } else if (type === 'monthly') {
    const n = Math.round(Number(months));
    if (!Number.isInteger(n) || n < 2 || n > MAX_INSTALLMENTS) return { error: `Monthly payments run from 2 to ${MAX_INSTALLMENTS} months` };
    if (!isDate(firstDueOn)) return { error: 'Pick the date of the first monthly payment' };
    const d = dep ?? 0; if (d < 0 || d >= total) return { error: 'The deposit has to be less than the fee' };
    const rest = total - d, base = Math.floor(rest / n), extra = rest - base * n;
    if (d > 0) installments.push({ label: 'Deposit', amountCents: d, dueOn: null, event: 'signing' });
    for (let i = 0; i < n; i++) installments.push({ label: `Payment ${i + 1} of ${n}`, amountCents: base + (i === n - 1 ? extra : 0), dueOn: addMonths(firstDueOn, i), event: null });
  } else if (type === 'milestones') {
    if (!Array.isArray(milestones) || milestones.length < 2) return { error: 'Add at least two milestones' };
    let left = total;
    installments = milestones.map((m, i) => {
      const last = i === milestones.length - 1;
      const amt = m.amountCents != null && m.amountCents !== '' ? Math.round(Number(m.amountCents)) : last ? left : Math.round(total * Number(m.pct || 0) / 100);
      left -= amt;
      return { label: line(m.label, 80) || `Milestone ${i + 1}`, amountCents: amt, dueOn: isDate(m.dueOn) ? m.dueOn : null, event: isDate(m.dueOn) ? null : (EVENTS[m.event] ? m.event : 'delivery') };
    });
  }
  const plan = { type, method: METHODS[method] ? method : 'invoice', autopay: !!autopay, installments, note: clip(note, 600) };
  const bad = checkPlan(plan, total); return bad ? { error: bad } : { plan };
}

// null when the plan is sound, else a sentence a person can act on.
export function checkPlan(plan, totalCents) {
  if (!plan || !PLAN_TYPES[plan.type]) return 'Choose how the fee is paid';
  if (!METHODS[plan.method]) return 'Choose how the client pays';
  const list = plan.installments;
  if (!Array.isArray(list) || !list.length) return 'The payment plan has no payments in it';
  if (list.length > MAX_INSTALLMENTS) return `A plan can have up to ${MAX_INSTALLMENTS} payments`;
  let sum = 0;
  for (const [i, p] of list.entries()) {
    if (!Number.isInteger(p.amountCents) || p.amountCents < 100) return `Payment ${i + 1} must be at least $1.00`;
    if (!!p.dueOn === !!p.event) return `Payment ${i + 1} needs either a date or “on signing” / “on delivery”`;
    if (p.dueOn && !isDate(p.dueOn)) return `Payment ${i + 1} has a date that is not a real date`;
    if (p.event && !EVENTS[p.event]) return `Payment ${i + 1} has an unknown trigger`;
    if (!line(p.label, 80)) return `Payment ${i + 1} needs a name`;
    sum += p.amountCents;
  }
  if (sum !== Number(totalCents)) return `The payments add up to ${dollars(sum)} but the fixed fee is ${dollars(totalCents)}`;
  const dated = list.filter(p => p.dueOn).map(p => p.dueOn);
  if (dated.some((d, i) => i && d < dated[i - 1])) return 'The payment dates must run in order';
  if (plan.autopay && !['ach', 'card', 'either'].includes(plan.method)) return 'Automatic payments need ACH or a card on file';
  return null;
}

// When each payment falls once the contract is signed on `signedOn`; a delivery payment falls on the estimated completion date (or stays open).
export function schedule(plan, { signedOn, deliveryOn = null } = {}) {
  return plan.installments.map(p => ({ ...p, falls: p.dueOn || (p.event === 'signing' ? signedOn : (deliveryOn || null)) }));
}

export function planWords(plan, currency = 'USD', kind = '') {
  const c = n => dollars(n, currency), list = plan.installments;
  const when = p => p.dueOn ? `on ${longDate(p.dueOn)}` : p.event === 'signing' ? 'on signing' : isProduct(kind) ? 'on final sample approval' : 'on delivery';
  if (plan.type === 'monthly') {
    const monthly = list.filter(p => p.dueOn), dep = list.find(p => p.event === 'signing');
    return `${dep ? `${c(dep.amountCents)} on signing, then ` : ''}${monthly.length} monthly payments of ${c(monthly[0].amountCents)}${monthly.at(-1).amountCents !== monthly[0].amountCents ? ` (the last is ${c(monthly.at(-1).amountCents)})` : ''}, from ${longDate(monthly[0].dueOn)} to ${longDate(monthly.at(-1).dueOn)}`;
  }
  return list.map(p => `${c(p.amountCents)} ${when(p)}`).join(', ');
}

export function methodParagraph(plan, providerName) {
  const m = plan.method;
  if (m === 'invoice') return `We email an invoice for each payment on its due date, with a link to pay it online. Each invoice is due within the terms printed on it.`;
  const how = m === 'ach' ? 'bank account (ACH debit)' : m === 'card' ? 'card' : 'bank account (ACH debit) or card, whichever the Client chooses when signing';
  const set = `The Client gives the details on a secure payment form shown right after signing (and again from the agreement link). The number goes straight to the payment processor, and ${providerName} does not keep card or bank numbers on its own systems.`;
  if (!plan.autopay) return `The Client pays by ${how}. ${set} Each payment is requested on its due date and the Client approves it then.`;
  return `The Client authorizes ${providerName} to charge the ${how} on file for each payment in this schedule on the date it falls due, and for no other amount. ${set} We email a notice a few days before each payment and a receipt after it. The Client can cancel this authorization or change the payment method by writing to ${providerName} at least three business days before the next payment is due. A payment that fails is tried again once, three days later; if it still fails the Client agrees to pay that installment by another method within ten days.`;
}

// ---- physical product development ---------------------------------------------------------------------------------------------------------------
// Hats, shirts, shoes, electronics: the fixed fee pays for our development work (design, tech pack, sampling, sourcing). Production is a separate order,
// confirmed with us in writing (mode 'through_us', the default: we order from the factory and the client only ever sees its own price), placed with the factory
// by the client (mode 'direct'), or not covered at all ('none').
export const PRODUCT_CATEGORIES = {
  apparel: { label: 'Apparel (shirts, hoodies, outerwear)', rules: 'fibre content, care and country-of-origin labels, and for children\'s clothing the safety rules on flammability, drawcords and small parts' },
  headwear: { label: 'Headwear (hats, caps)', rules: 'fibre content and country-of-origin labels, and for children\'s products the small-part and lead rules' },
  footwear: { label: 'Footwear', rules: 'material, size and country-of-origin labels, and the chemical limits for materials that touch the skin' },
  electronics: { label: 'Electronics', rules: 'electrical-safety and radio-frequency approvals for each market it is sold in (for example FCC, UL, CE and UKCA), restricted-substance rules such as RoHS, and the packing and shipping rules for lithium batteries' },
  accessories: { label: 'Bags and accessories', rules: 'material and country-of-origin labels and, where they apply, children\'s product safety labels and tests' },
  other: { label: 'Other product', rules: '' }
};
export const INCOTERMS = {
  EXW: 'ex works (the Client collects the goods at the factory)',
  FOB: 'FOB (free on board: the goods are the Client\'s responsibility once loaded at the port of departure)',
  DDP: 'DDP (delivered duty paid: the goods are delivered to the Client\'s address with duties and taxes paid)'
};
export const PRODUCTION_MODES = { through_us: 'We order from the factory and supply the goods (the client does not see factory prices)', direct: 'The client orders from the factory directly', none: 'Not covered by this agreement' };
// circumventionMonths 0 leaves the Factory introductions clause out of the contract
export const defaultProduct = () => ({ categories: [], sampleRounds: 2, circumventionMonths: 24, incoterm: 'FOB', aql: '2.5 for major defects and 4.0 for minor defects', production: { mode: 'through_us', depositPct: 50 } });
export function cleanProduct(input) {
  const i = input || {}, d = defaultProduct();
  const categories = [...new Set((Array.isArray(i.categories) ? i.categories : []).map(String).filter(k => PRODUCT_CATEGORIES[k]))];
  const rounds = Math.round(Number(i.sampleRounds ?? d.sampleRounds)), dep = Math.round(Number(i.production?.depositPct ?? d.production.depositPct));
  const hold = Math.round(Number(i.circumventionMonths ?? d.circumventionMonths));
  return { categories, sampleRounds: Math.min(10, Math.max(0, Number.isFinite(rounds) ? rounds : d.sampleRounds)), circumventionMonths: Math.min(120, Math.max(0, Number.isFinite(hold) ? hold : d.circumventionMonths)), incoterm: INCOTERMS[i.incoterm] ? i.incoterm : d.incoterm, aql: line(i.aql, 80) || d.aql,
    production: { mode: PRODUCTION_MODES[i.production?.mode] ? i.production.mode : d.production.mode, depositPct: Math.min(100, Math.max(1, Number.isFinite(dep) ? dep : d.production.depositPct)) } };
}
// The words of the production clause, which depend on who places the orders.
export function productionWords(product, map) {
  const mode = product?.production?.mode;
  if (mode === 'direct') return 'Production runs are not part of the fixed fee. When the Client is ready to produce, the Client places each order directly with the factory on the factory\'s written quotation and pays the factory directly under the factory\'s terms. Future Basics is not the manufacturer and is not a party to the factory\'s contract. As part of this agreement we give the factory the approved tech pack and the approved sample requirements, follow each order through production, arrange the inspection described below, and act for the Client in good faith to settle any problem that comes up. We do not guarantee the factory\'s work, prices or dates.';
  if (mode === 'through_us') return `Production runs are not part of the fixed fee. Future Basics places each production order with the factory itself and supplies the goods to the Client. Each run is confirmed by a written order that we send and the Client approves in writing (email is fine). It states the quantity, the unit price the Client pays, the deposit, the lead time and the shipping terms, and once approved it forms part of this agreement. Unless the order says otherwise, the Client pays a ${map.production_deposit_pct}% deposit before we place the order with the factory and the balance before the goods ship. The goods become the Client's when it has paid for them in full. Goods made to the Client's design cannot be cancelled or changed once materials are ordered or cutting has begun: the Client pays for the materials bought and the work done up to the time we are told. A quoted price can change if materials, tariffs or exchange rates move before the order is approved.

The Client pays the price on the order and deals only with us. What we pay the factory, our factory quotations and our margin are our own business and are not shown to the Client, and the Client has no right to see them.

Because we supply the goods, we answer to the Client for them: goods that do not match the approved sample and the order are reworked, replaced or credited by us, whatever arrangement we have with the factory. For goods we supply, our total liability for a defect is limited to the price the Client paid for the goods affected, in place of the limit under Limit of liability.`;
  return '';
}
const complianceDetails = product => { const rules = (product?.categories || []).map(k => PRODUCT_CATEGORIES[k]?.rules).filter(Boolean); return rules.length ? rules.join('; ') : 'any labelling, safety, testing and certification rules that apply to the product where it is sold'; };

// ---- clauses ------------------------------------------------------------------------------------------------------------------------------------
// kind 'text' is the clause's own words (with {{merge fields}}); the others are drawn from the structured parts of the contract so the numbers cannot drift.
export const TERMS = { governingLaw: '', warrantyDays: 30, cureDays: 10, reviewDays: 5, pauseDays: 10, expiresDays: 14 };

export function defaultSections(kind = 'website') {
  const t = (id, title, body) => ({ id, title, kind: 'text', body });
  if (isProduct(kind)) return productSections(t);
  return [
    t('parties', 'Parties', 'This agreement is made on {{effective_date}} between {{provider_name}} ("Future Basics"), {{provider_address}}, and {{client_company}} (the "Client"), {{client_address}}. It covers the project described below (the "Project"): {{project_name}}.'),
    { id: 'scope', title: 'Scope of work', kind: 'scope', body: 'Future Basics will design, build and deliver the following for the Client. Anything not listed here is outside this agreement and can be added through a change request.' },
    { id: 'timeline', title: 'Timeline', kind: 'timeline', body: 'The dates below are our best plan, not a guarantee. They hold as long as the Client provides content, access, feedback and approvals within {{review_days}} business days of each request. Time the Client takes beyond that moves the dates by the same amount.' },
    { id: 'fee', title: 'Fixed fee', kind: 'fee', body: 'The fee for the Project is a fixed price. It covers the scope above and no more, and it does not change because the work takes us more or less time than we planned.' },
    { id: 'schedule', title: 'Payment schedule', kind: 'schedule', body: '' },
    t('changes', 'Changes to the scope', 'If the Client wants something that is not in the scope, either party can propose a change in writing (email is fine). We say what it adds in price and time, and the change only counts once the Client agrees to it in writing. Work already done on an agreed scope is not redone for free because a preference changed.'),
    t('client', 'What the Client provides', 'The Client provides the content, images, logins and decisions we ask for, on time, and confirms that it has the right to use everything it gives us. The Client names one person who can approve work on its behalf. If the Client goes quiet for more than {{pause_days}} days, or a payment is more than {{pause_days}} days late, we may pause the work until things are back on track and we will tell the Client in writing first.'),
    t('ownership', 'Who owns the work', 'When the Client has paid every payment in this agreement, it owns the custom designs, text, images and code we create for it under this agreement. Future Basics keeps ownership of its own tools, templates and code libraries that existed before the Project or are used across clients, and gives the Client a permanent license to use them as part of the finished work. Third-party and open-source components stay under their own licenses. Until the final payment is made the Client has a license to use the work only as agreed here. Future Basics may show the finished work in its portfolio unless the Client asks us not to in writing.'),
    { id: 'hosting', title: 'Hosting and maintenance', kind: 'hosting', body: '' },
    t('confidential', 'Confidentiality', 'Each party keeps the other\'s non-public business information private, uses it only for this Project, and returns or deletes it on request when the Project ends. This does not cover information that is already public, that the party already knew, or that the law requires it to disclose.'),
    t('warranty', 'Our promise, and its limits', 'We will do the work with the care and skill expected of a professional studio. If the Client reports a defect in what we delivered within {{warranty_days}} days of delivery, we fix it at no charge. After that, fixes are quoted as new work. Apart from this, the work is provided as it is: we do not promise results such as traffic, search ranking, sales or uptime of services we do not run, and we are not responsible for third-party services the work relies on.'),
    t('liability', 'Limit of liability', 'Neither party is liable to the other for lost profits, lost data or any indirect or consequential loss. Each party\'s total liability under this agreement is limited to the fees the Client has paid under it. This does not limit anything the law does not allow to be limited.'),
    t('termination', 'Ending the agreement', 'Either party can end this agreement by writing to the other if the other breaks it in a serious way and does not fix it within {{cure_days}} days of being told. The Client can also end it at any time by writing to us. In either case the Client pays for the work done up to the date of ending, and fees already paid for work done are not refunded. Sections on ownership, confidentiality, liability and payment of money owed continue after the agreement ends.'),
    t('general', 'General', 'This is the whole agreement between us about the Project and replaces anything said or written before it. It can only be changed in writing that both parties accept. Neither party can hand this agreement to someone else without the other\'s written consent, except to a successor of its whole business. If a part of it cannot be enforced, the rest still applies. It is governed by the laws of {{governing_law}}. Both parties agree that signing electronically has the same effect as signing on paper, that this agreement can be signed in separate copies, and that the signed electronic copy is the original.')
  ];
}

function productSections(t) {
  return [
    t('parties', 'Parties', 'This agreement is made on {{effective_date}} between {{provider_name}} ("Future Basics"), {{provider_address}}, and {{client_company}} (the "Client"), {{client_address}}. It covers the product development project described below (the "Project"): {{project_name}}.'),
    { id: 'scope', title: 'Scope of work', kind: 'scope', body: 'Future Basics will carry out the following development work for the Client. Anything not listed here is outside this agreement and can be added through a change request.' },
    { id: 'timeline', title: 'Timeline', kind: 'timeline', body: 'The dates below are our best plan, not a guarantee. They hold as long as the Client gives content, approvals and feedback within {{review_days}} business days of each request. They also depend on factory sampling and production times, materials, customs and freight, which are outside our control. Time the Client takes, or a delay outside our control, moves the dates by the same amount.' },
    { id: 'fee', title: 'Fixed fee', kind: 'fee', body: 'The fee is a fixed price for our development work described in the scope above: design, tech packs, sampling management and sourcing. It does not include the cost of samples, materials, tooling, production, inspection, testing, certification, freight, duties or taxes unless the scope says it does, and it does not change because the work takes us more or less time than we planned.' },
    { id: 'schedule', title: 'Payment schedule', kind: 'schedule', body: '' },
    t('changes', 'Changes to the scope', 'If the Client wants something that is not in the scope, either party can propose a change in writing (email is fine). We say what it adds in price and time, and the change only counts once the Client agrees to it in writing. Work already done on an approved design or sample is not redone for free because a preference changed.'),
    t('samples', 'Samples and approval', 'The fixed fee includes up to {{sample_rounds}} rounds of samples. A round is one set of samples made from the tech pack and the Client\'s feedback on the round before it. Extra rounds, and the cost of the samples themselves, materials and shipping, are quoted before we order them unless the scope says they are included. The Client approves each sample, or lists the changes it wants, in writing within {{review_days}} business days. The sample the Client approves in writing, together with the tech pack, is the standard that production is made and inspected against (the "approved sample"). Production does not start until the Client has approved a pre-production sample, and a change after that approval can change the price and the dates.'),
    { id: 'production', title: 'Production runs', kind: 'production', body: '' },
    t('quality', 'Quality and inspection', 'Production is checked against the approved sample and the tech pack. Unless an order says otherwise, finished goods are inspected before they ship, to an acceptable quality level of {{aql}}. We arrange the inspection, either ourselves or through a third-party inspector whose cost we quote first, and we share the report. Goods that fail are reworked or remade by the factory before they ship, unless the Client approves the difference in writing. A defect the inspection report did not show must be reported in writing, with photos, within {{warranty_days}} days of the goods arriving. Who answers to the Client for defects in the goods is set out under Production runs.'),
    t('client', 'What the Client provides', 'The Client provides the artwork, logos, content, specifications and decisions we ask for, on time, and confirms that it has the right to use everything it gives us. The Client names one person who can approve work and samples on its behalf. If the Client goes quiet for more than {{pause_days}} days, or a payment is more than {{pause_days}} days late, we may pause the work until things are back on track and we will tell the Client in writing first.'),
    t('compliance', 'Where the product is sold', 'The Client decides where the product will be sold and is responsible for it meeting the legal requirements there. That includes {{compliance_details}}. We flag requirements we know of, and we put what the Client tells us on the tech pack and on the factory\'s order, but we are not a testing laboratory or a certification body and we do not give legal advice. Testing and certification are paid for by the Client, and a product is not approved for sale just because it was made or shipped.'),
    t('ownership', 'Who owns the work', 'When the Client has paid every payment in this agreement, it owns the designs, patterns, tech packs, artwork and other custom work we create for it under this agreement. Future Basics keeps ownership of its own tools, templates, base patterns and know-how, and of anything that existed before the Project or is used across clients, and gives the Client a permanent license to use them as part of the finished product. Tooling, molds and lasts paid for by the Client belong to the Client, even when the factory holds them, and we will help arrange their transfer. Samples belong to the Client once they are paid for. The Client confirms that it owns or may use the logos, names and artwork it gives us, and covers claims that this material infringes someone else\'s rights. Future Basics may show photos of the finished product in its portfolio unless the Client asks us not to in writing.'),
    t('shipping', 'Shipping, duties and risk', 'Unless an order says otherwise, goods are shipped on {{incoterm_text}} terms. Freight, insurance, import duties, taxes and customs fees are the Client\'s cost unless an order says they are included, and the Client is the importer of record unless we agree otherwise in writing. Risk of loss or damage passes at the point named in those terms, and we recommend that the Client insures the goods in transit. Dates for production and shipping are estimates: delays by factories, carriers, customs, weather or other causes outside our control are not a breach by us.'),
    t('confidential', 'Confidentiality', 'Each party keeps the other\'s non-public business information private, uses it only for this Project, and returns or deletes it on request when the Project ends. The Client\'s designs and plans are shared with factories only as far as needed to make samples and goods, and we ask factories to keep them private. Our supplier details and prices are our confidential information too. This does not cover information that is already public, that the party already knew, or that the law requires it to disclose.'),
    { id: 'circumvention', title: 'Factory introductions', kind: 'circumvention', body: 'The factories we use, and what we pay them, are our confidential information. For {{circumvention_months}} months after the date of this agreement (or after the last order under it, if that is later), the Client will not, directly or through anyone else, contact a factory we have introduced or named to it in connection with the Project, or order the products covered by this agreement, or a substantially similar product, from that factory, except through us. This does not apply to a factory the Client already worked with before we introduced it and told us about in writing before the introduction. If the Client breaks this section, we may recover our losses, including the margin we would have earned on those orders.' },
    t('warranty', 'Our promise, and its limits', 'We will do the work with the care and skill expected of a professional product development studio. If the Client reports a defect in what we delivered (tech packs, patterns, specifications) within {{warranty_days}} days of delivery, we fix it at no charge. After that, fixes are quoted as new work. We do not promise sales or other commercial results, that a product will pass any test, approval or certification, that it can be sold in any particular country, or that a factory will meet its dates. Factories are independent businesses: our part is to choose them carefully, brief them well, follow the order and inspect the goods, and who answers to the Client for the goods is set out under Production runs.'),
    t('liability', 'Limit of liability', 'Neither party is liable to the other for lost profits, lost sales, lost data or any indirect or consequential loss. Each party\'s total liability under this agreement is limited to the fees the Client has paid us under it for development work. This does not limit anything the law does not allow to be limited. The Client is responsible for the product it sells under its own name, including claims from its customers, recalls and action by regulators, except to the extent they are caused by our breach of this agreement, and should carry product liability insurance before it sells the product.'),
    t('termination', 'Ending the agreement', 'Either party can end this agreement by writing to the other if the other breaks it in a serious way and does not fix it within {{cure_days}} days of being told. The Client can also end it at any time by writing to us. In either case the Client pays for the work done up to the date of ending, for samples and materials already ordered, and for any production order already placed or in progress, and fees already paid for work done are not refunded. Sections on ownership, confidentiality, liability and payment of money owed continue after the agreement ends.'),
    t('general', 'General', 'This is the whole agreement between us about the Project and replaces anything said or written before it. It can only be changed in writing that both parties accept. Neither party can hand this agreement to someone else without the other\'s written consent, except to a successor of its whole business. If a part of it cannot be enforced, the rest still applies. It is governed by the laws of {{governing_law}}. Both parties agree that signing electronically has the same effect as signing on paper, that this agreement can be signed in separate copies, and that the signed electronic copy is the original.')
  ];
}

export const SECTION_KINDS = ['text', 'scope', 'timeline', 'fee', 'schedule', 'hosting', 'production', 'circumvention'];

// The facts a clause can use, from the contract itself.
export function mergeMap(c, settings = {}) {
  const terms = { ...TERMS, ...(c.terms || {}) }, p = c.provider || {}, cl = c.client || {};
  return {
    provider_name: p.name || settings.providerName || 'Future Basics', provider_address: p.address || settings.providerAddress || '', provider_signer: p.signerName || '', provider_title: p.signerTitle || '',
    client_company: cl.company || '', client_address: cl.address || '', client_name: cl.signerName || '', client_title: cl.signerTitle || '', client_email: cl.signerEmail || '',
    project_name: c.project?.name || c.title || '', effective_date: longDate(c.timeline?.effectiveOn) || '', start_date: longDate(c.timeline?.startOn) || '', completion_date: longDate(c.timeline?.completionOn) || '',
    total_fee: dollars(c.fee?.totalCents, c.fee?.currency), governing_law: terms.governingLaw || settings.governingLaw || '', warranty_days: String(terms.warrantyDays), cure_days: String(terms.cureDays),
    review_days: String(terms.reviewDays), pause_days: String(terms.pauseDays),
    sample_rounds: String(c.product?.sampleRounds ?? defaultProduct().sampleRounds), aql: c.product?.aql || defaultProduct().aql, incoterm_text: INCOTERMS[c.product?.incoterm] || INCOTERMS.FOB,
    production_deposit_pct: String(c.product?.production?.depositPct ?? defaultProduct().production.depositPct), circumvention_months: String(c.product?.circumventionMonths ?? defaultProduct().circumventionMonths), compliance_details: complianceDetails(c.product)
  };
}
export function fill(text, map) {
  const missing = new Set();
  const out = String(text ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => { if (!(k in map)) { missing.add(k); return m; } if (map[k] === '') { missing.add(k); return m; } return map[k]; });
  return { text: out, missing: [...missing] };
}

// The finished document: every clause with its words filled in and the structured parts drawn. This, and nothing else, is what is hashed, shown, signed and printed.
export function renderContract(c, settings = {}) {
  const map = mergeMap(c, settings), missing = new Set(), out = [];
  const say = s => { const r = fill(s, map); r.missing.forEach(k => missing.add(k)); return r.text; };
  for (const s of c.sections || []) {
    const body = say(s.body);
    if (s.kind === 'text') out.push({ id: s.id, title: s.title, kind: 'text', body });
    else if (s.kind === 'scope') out.push({ id: s.id, title: s.title, kind: 'scope', body, items: (c.scope || []).slice(), notIncluded: (c.notIncluded || []).slice() });
    else if (s.kind === 'timeline') out.push({ id: s.id, title: s.title, kind: 'timeline', body, rows: [['Agreement date', longDate(c.timeline?.effectiveOn)], ['Work begins', longDate(c.timeline?.startOn)], [isProduct(c.kind) ? 'Estimated final sample approval' : 'Estimated completion', longDate(c.timeline?.completionOn)]].filter(r => r[1]) });
    else if (s.kind === 'fee') out.push({ id: s.id, title: s.title, kind: 'fee', body, totalCents: c.fee.totalCents, currency: c.fee.currency, totalText: dollars(c.fee.totalCents, c.fee.currency) });
    else if (s.kind === 'schedule') out.push({ id: s.id, title: s.title, kind: 'schedule', body: [say(s.body), methodParagraph(c.plan, map.provider_name), c.plan.note].filter(Boolean).join('\n\n'), summary: planWords(c.plan, c.fee.currency, c.kind),
      rows: c.plan.installments.map(p => ({ label: p.label, amountCents: p.amountCents, amountText: dollars(p.amountCents, c.fee.currency), when: p.dueOn ? longDate(p.dueOn) : eventLabel(p.event, c.kind) })), method: c.plan.method, autopay: !!c.plan.autopay });
    else if (s.kind === 'circumvention') { if (c.product?.circumventionMonths > 0) out.push({ id: s.id, title: s.title, kind: 'text', body }); }
    else if (s.kind === 'production') { const w = productionWords(c.product, map); if (w) out.push({ id: s.id, title: s.title, kind: 'text', body: [say(s.body), w].filter(Boolean).join('\n\n') }); }
    else if (s.kind === 'hosting') { if (c.hosting?.included && c.hosting.monthlyCents > 0) out.push({ id: s.id, title: s.title, kind: 'text', body: [say(s.body) || `After launch, Future Basics hosts and maintains the finished work for ${dollars(c.hosting.monthlyCents, c.fee.currency)} a month, billed monthly, starting the month after delivery. It covers hosting, security updates, backups and monitoring. Either party can end hosting with 30 days' written notice, and on request we hand over the files so the Client can host elsewhere.`, c.hosting.note].filter(Boolean).join('\n\n') }); }
  }
  return { number: c.number || '', title: c.title, kind: c.kind, parties: { provider: { name: map.provider_name, address: map.provider_address, signerName: map.provider_signer, signerTitle: map.provider_title }, client: { company: map.client_company, address: map.client_address, signerName: map.client_name, signerTitle: map.client_title, signerEmail: map.client_email } }, fee: c.fee, sections: out, missing: [...missing] };
}

// ---- checking what staff type ------------------------------------------------------------------------------------------------------------------
export function cleanContent(input, { settings = {}, lenient = false } = {}) {
  const i = input || {}, errors = [];
  const kind = KINDS[i.kind] ? i.kind : 'other';
  const title = line(i.title, 160); if (!title) errors.push('Give the contract a title');
  const provider = { name: line(i.provider?.name || settings.providerName || 'Future Basics', 120), address: clip(i.provider?.address || settings.providerAddress, 300), signerName: line(i.provider?.signerName || settings.signerName, 120), signerTitle: line(i.provider?.signerTitle || settings.signerTitle, 120) };
  const cl = i.client || {};
  const client = { company: line(cl.company, 160), address: clip(cl.address, 300), signerName: line(cl.signerName, 120), signerTitle: line(cl.signerTitle, 120), signerEmail: line(cl.signerEmail, 200).toLowerCase() };
  if (!client.company) errors.push('Who is the contract with? Add the client\'s company');
  if (!client.signerName) errors.push('Add the name of the person who will sign for the client');
  if (!EMAIL.test(client.signerEmail)) errors.push('Add the signer\'s email address: that is where the signing link goes');
  const total = Math.round(Number(i.fee?.totalCents));
  if (!Number.isFinite(total) || total <= 0) errors.push('Set the fixed fee'); else if (total > 5_000_000_00) errors.push('That fee looks too large to be right');
  const currency = String(i.fee?.currency || 'USD').toUpperCase().slice(0, 3);
  const scope = (Array.isArray(i.scope) ? i.scope : String(i.scope || '').split('\n')).map(s => line(s, 400)).filter(Boolean).slice(0, 60);
  if (!scope.length) errors.push('List what is being delivered under Scope of work');
  const notIncluded = (Array.isArray(i.notIncluded) ? i.notIncluded : String(i.notIncluded || '').split('\n')).map(s => line(s, 400)).filter(Boolean).slice(0, 30);
  const tl = i.timeline || {};
  const timeline = { effectiveOn: isDate(tl.effectiveOn) ? tl.effectiveOn : todayISO(), startOn: isDate(tl.startOn) ? tl.startOn : '', completionOn: isDate(tl.completionOn) ? tl.completionOn : '' };
  if (timeline.startOn && timeline.completionOn && timeline.completionOn < timeline.startOn) errors.push('The estimated completion is before the start');
  const plan = i.plan ? { type: i.plan.type, method: i.plan.method, autopay: !!i.plan.autopay, note: clip(i.plan.note, 600), installments: (Array.isArray(i.plan.installments) ? i.plan.installments : []).map(p => ({ label: line(p.label, 80), amountCents: Math.round(Number(p.amountCents)), dueOn: isDate(p.dueOn) ? p.dueOn : null, event: p.event && EVENTS[p.event] ? p.event : null })) } : null;
  if (plan && Number.isFinite(total) && total > 0) { const bad = checkPlan(plan, total); if (bad) errors.push(bad); } else if (!plan) errors.push('Choose how the fee is paid');
  const hosting = { included: !isProduct(kind) && !!i.hosting?.included, monthlyCents: Math.max(0, Math.round(Number(i.hosting?.monthlyCents) || 0)), note: clip(i.hosting?.note, 600) };
  if (hosting.included && hosting.monthlyCents <= 0) errors.push('Hosting is included: set its monthly price, or turn it off');
  const t = i.terms || {}, terms = { governingLaw: line(t.governingLaw || settings.governingLaw, 120), warrantyDays: Math.min(365, Math.max(0, Math.round(Number(t.warrantyDays ?? TERMS.warrantyDays)))), cureDays: Math.min(90, Math.max(1, Math.round(Number(t.cureDays ?? TERMS.cureDays)))), reviewDays: Math.min(30, Math.max(1, Math.round(Number(t.reviewDays ?? TERMS.reviewDays)))), pauseDays: Math.min(90, Math.max(1, Math.round(Number(t.pauseDays ?? TERMS.pauseDays)))), expiresDays: Math.min(90, Math.max(1, Math.round(Number(t.expiresDays ?? TERMS.expiresDays)))) };
  const product = isProduct(kind) ? cleanProduct(i.product) : null;
  let sections = Array.isArray(i.sections) && i.sections.length ? i.sections : defaultSections(kind);
  if (sections.length > 30) errors.push('A contract can have up to 30 clauses');
  const seen = new Set();
  sections = sections.slice(0, 30).map((s, n) => {
    const kind2 = SECTION_KINDS.includes(s.kind) ? s.kind : 'text', id = String(s.id || `c${n + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || `c${n + 1}`;
    if (seen.has(id)) errors.push(`Two clauses share the id “${id}”`); seen.add(id);
    return { id, title: line(s.title, 120), kind: kind2, body: clip(s.body, 8000) };
  });
  if (sections.some(s => !s.title)) errors.push('Every clause needs a title');
  for (const need of ['scope', 'fee', 'schedule']) if (!sections.some(s => s.kind === need)) errors.push(`The contract needs its ${need === 'schedule' ? 'payment schedule' : need === 'fee' ? 'fixed fee' : 'scope of work'} clause`);
  if (errors.length && !lenient) return { error: errors[0], errors };
  return { errors, value: { title, kind, provider, client, project: { name: line(i.project?.name || title, 160) }, scope, notIncluded, timeline, fee: { totalCents: Number.isFinite(total) && total > 0 ? total : 0, currency }, plan: plan || { type: 'full', method: 'invoice', autopay: false, note: '', installments: [{ label: 'Payment in full', amountCents: Math.max(100, Number.isFinite(total) ? total : 0), dueOn: null, event: 'signing' }] }, hosting, terms, sections, ...(product ? { product } : {}) } };
}

// What still has to be filled in before a contract can go out (empty merge fields, unset legal terms).
export function sendProblems(c, settings = {}) {
  const r = renderContract(c, settings), p = [];
  if (!(c.provider?.signerName)) p.push('Add who signs for Future Basics (Contracts, Settings)');
  if (r.missing.includes('governing_law')) p.push('Say which state\'s law governs the contract (Contracts, Settings)');
  if (r.missing.includes('provider_address')) p.push('Add Future Basics\' address (Contracts, Settings)');
  if (r.missing.includes('client_address')) p.push('Add the client\'s address');
  for (const k of r.missing) if (!['governing_law', 'provider_address', 'client_address'].includes(k)) p.push(`The wording uses {{${k}}}, which has no value`);
  return p;
}

// ---- trust: a hash of what was signed, a link nobody can guess ----------------------------------------------------------------------------
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v ?? null);
export const docHash = rendered => createHash('sha256').update(stable({ ...rendered, missing: undefined })).digest('hex');
// The signing link carries the contract's id and a signature made with the server's secret (and the link's version, so a link can be replaced): nothing is
// stored, a link can be sent again unchanged, and nobody can make one for another contract.
const mac = (secret, id, v) => createHmac('sha256', String(secret)).update(`contract-link:${id}:${v}`).digest('base64url');
export const signToken = (secret, id, version = 1) => `${id}.${version}.${mac(secret, id, version)}`;
export function readToken(secret, token) {
  const m = String(token || '').match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,6})\.([A-Za-z0-9_-]{43})$/i); if (!m) return null;
  const want = Buffer.from(mac(secret, m[1].toLowerCase(), m[2])), got = Buffer.from(m[3]);
  return want.length === got.length && timingSafeEqual(want, got) ? { id: m[1].toLowerCase(), version: Number(m[2]) } : null;
}
export const nextNumber = (existing, year = new Date().getUTCFullYear()) => {
  const used = existing.map(n => String(n).match(new RegExp(`^FB-C-${year}-(\\d+)$`))).filter(Boolean).map(m => Number(m[1]));
  return `FB-C-${year}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
};

// What the client may type to sign. The typed name is the signature; the checkboxes are the consent that makes it one.
export function checkSignature(body, c) {
  const name = line(body?.name, 120), title = line(body?.title, 120);
  if (name.length < 2 || !/\p{L}/u.test(name)) return { error: 'Type your full name to sign' };
  if (body?.agree !== true) return { error: 'Tick the box to say you have read and agree to this contract' };
  if (body?.esign !== true) return { error: 'Tick the box to agree to sign electronically' };
  const out = { name, title };
  if (c.plan.autopay) { if (body?.autopay !== true) return { error: 'Tick the box to authorize the automatic payments, or ask us to remove them' }; out.autopay = true; }
  if (c.plan.method === 'either') { if (!['ach', 'card'].includes(body?.method)) return { error: 'Choose ACH or card for the payments' }; out.method = body.method; }
  else if (['ach', 'card'].includes(c.plan.method)) out.method = c.plan.method;
  return { value: out };
}
