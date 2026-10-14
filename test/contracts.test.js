import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, checkPlan, addMonths, planWords, methodParagraph, defaultSections, renderContract, cleanContent, sendProblems, docHash, signToken, readToken, nextNumber, checkSignature, fill, schedule, dollars, isProduct, eventLabel, cleanProduct, defaultProduct, KINDS } from '../src/contracts.js';

const base = () => ({ title: 'Salon website', kind: 'website', client: { company: 'Olive Salon', address: '1 Main St, Norristown PA', signerName: 'Olive Owner', signerTitle: 'Owner', signerEmail: 'Olive@Salon.test' }, project: { name: 'Salon website' },
  scope: ['A five-page website', 'Online booking link', 'Contact form'], fee: { totalCents: 1_200_000 }, timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '2026-12-15' },
  terms: { governingLaw: 'Pennsylvania' }, provider: { name: 'Future Basics', address: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder' } });
const withPlan = (c, o) => ({ ...c, plan: buildPlan({ totalCents: c.fee.totalCents, ...o }).plan });

test('a monthly plan adds up to the fixed fee to the cent, with the odd cents on the last payment, and a deposit when asked', () => {
  const r = buildPlan({ type: 'monthly', totalCents: 1_000_001, months: 3, firstDueOn: '2026-12-01', depositPct: 25, method: 'ach', autopay: true });
  assert.ok(r.plan, r.error); const sum = r.plan.installments.reduce((s, p) => s + p.amountCents, 0); assert.equal(sum, 1_000_001);
  assert.equal(r.plan.installments[0].event, 'signing'); assert.equal(r.plan.installments.length, 4);
  assert.deepEqual(r.plan.installments.slice(1).map(p => p.dueOn), ['2026-12-01', '2027-01-01', '2027-02-01']);
  assert.equal(checkPlan(r.plan, 1_000_001), null);
});

test('month ends hold: 31 January plus a month is 28 February, and the next payment goes back to the 31st', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28'); assert.equal(addMonths('2027-01-31', 2), '2027-03-31'); assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
  const p = buildPlan({ type: 'monthly', totalCents: 600_000, months: 3, firstDueOn: '2027-01-31' }).plan; assert.deepEqual(p.installments.map(x => x.dueOn), ['2027-01-31', '2027-02-28', '2027-03-31']);
});

test('every kind of plan is checked: wrong totals, bad dates, autopay without a method, too many payments', () => {
  assert.match(buildPlan({ type: 'monthly', totalCents: 100_000, months: 1, firstDueOn: '2026-12-01' }).error, /2 to 48/);
  assert.match(buildPlan({ type: 'monthly', totalCents: 100_000, months: 3 }).error, /first monthly payment/);
  assert.match(buildPlan({ type: 'split', totalCents: 100_000, depositCents: 100_000 }).error, /deposit/);
  assert.match(buildPlan({ type: 'full', totalCents: 0 }).error, /fixed fee/);
  const ok = buildPlan({ type: 'split', totalCents: 100_000 }).plan; assert.equal(ok.installments[0].amountCents, 50_000);
  assert.match(checkPlan({ ...ok, installments: [{ ...ok.installments[0], amountCents: 40_000 }, ok.installments[1]] }, 100_000), /add up to \$900\.00 but the fixed fee is \$1,000\.00/);
  assert.match(checkPlan({ ...ok, autopay: true, method: 'invoice' }, 100_000), /ACH or a card/);
  assert.match(checkPlan({ ...ok, installments: [{ ...ok.installments[0], dueOn: '2026-02-30', event: null }, ok.installments[1]] }, 100_000), /not a real date/);
  assert.match(checkPlan({ ...ok, installments: [{ ...ok.installments[0], dueOn: '2026-12-01' }, ok.installments[1]] }, 100_000), /either a date or/);
  const ms = buildPlan({ type: 'milestones', totalCents: 90_000, milestones: [{ label: 'Design approved', pct: 30, event: 'signing' }, { label: 'Build done', pct: 40, dueOn: '2027-01-10' }, { label: 'Launch' }] });
  assert.ok(ms.plan, ms.error); assert.deepEqual(ms.plan.installments.map(p => p.amountCents), [27_000, 36_000, 27_000]);
});

test('the plan reads back in plain words and the payment-method paragraph says exactly what the client authorizes', () => {
  const p = buildPlan({ type: 'monthly', totalCents: 1_200_000, months: 6, firstDueOn: '2026-12-01', depositCents: 300_000, method: 'either', autopay: true }).plan;
  assert.match(planWords(p), /\$3,000\.00 on signing, then 6 monthly payments of \$1,500\.00, from December 1, 2026 to May 1, 2027/);
  const m = methodParagraph(p, 'Future Basics'); assert.match(m, /authorizes Future Basics to charge the bank account \(ACH debit\) or card/); assert.match(m, /does not keep card or bank numbers/); assert.match(m, /three business days/);
  assert.match(methodParagraph({ ...p, autopay: false, method: 'invoice' }, 'Future Basics'), /email an invoice for each payment/);
  assert.deepEqual(schedule(p, { signedOn: '2026-11-02', deliveryOn: '2026-12-15' })[0].falls, '2026-11-02');
});

test('clauses fill from the contract, and a field with no value is reported instead of printed as blank', () => {
  const c = withPlan(base(), { type: 'full' });
  const r = fill('Between {{client_company}} and {{provider_name}} under {{governing_law}} {{nope}}', { client_company: 'Olive Salon', provider_name: 'Future Basics', governing_law: '' });
  assert.equal(r.text, 'Between Olive Salon and Future Basics under {{governing_law}} {{nope}}'); assert.deepEqual(r.missing.sort(), ['governing_law', 'nope']);
  const { value, error } = cleanContent(c); assert.ok(value, error);
  const doc = renderContract({ ...value, number: 'FB-C-2026-001' }); assert.deepEqual(doc.missing, []);
  const parties = doc.sections.find(s => s.id === 'parties').body; assert.match(parties, /Olive Salon/); assert.match(parties, /Future Basics \("Future Basics"\)/);
  assert.equal(doc.sections.find(s => s.id === 'fee').totalText, '$12,000.00'); assert.equal(doc.sections.find(s => s.id === 'scope').items.length, 3);
  assert.ok(!doc.sections.some(s => s.id === 'hosting'), 'hosting only appears when it is included');
  const host = renderContract({ ...value, hosting: { included: true, monthlyCents: 9900, note: '' } }); assert.match(host.sections.find(s => s.id === 'hosting').body, /\$99\.00 a month/);
});

test('what staff type is cleaned and checked, and a contract that is not ready says what is missing', () => {
  assert.match(cleanContent({ ...withPlan(base(), { type: 'full' }), client: { company: 'X', signerName: 'A', signerEmail: 'nope' } }).error, /email address/);
  assert.match(cleanContent({ ...withPlan(base(), { type: 'full' }), scope: [] }).error, /Scope of work/);
  assert.match(cleanContent({ ...base() }).error, /how the fee is paid/);
  assert.match(cleanContent({ ...withPlan(base(), { type: 'full' }), fee: { totalCents: 500_000 } }).error, /add up to/);
  const { value } = cleanContent(withPlan(base(), { type: 'full' })); assert.equal(value.client.signerEmail, 'olive@salon.test'); assert.equal(value.sections.length, defaultSections().length);
  assert.deepEqual(sendProblems(value), []);
  const bare = cleanContent({ ...withPlan(base(), { type: 'full' }), terms: {}, provider: { name: 'Future Basics' } }).value;
  const pr = sendProblems(bare); assert.ok(pr.some(x => /who signs for Future Basics/.test(x)) && pr.some(x => /law governs/.test(x)) && pr.some(x => /Future Basics' address/.test(x)), pr.join(' | '));
  assert.match(cleanContent({ ...withPlan(base(), { type: 'full' }), sections: [{ id: 'a', title: 'Only', kind: 'text', body: 'x' }] }).error, /scope of work/);
});

test('the hash changes with a single word, links are long and only their hash is kept, numbers count up within the year', () => {
  const { value } = cleanContent(withPlan(base(), { type: 'full' })); const a = docHash(renderContract(value));
  assert.equal(a, docHash(renderContract(JSON.parse(JSON.stringify(value))))); assert.match(a, /^[0-9a-f]{64}$/);
  const v2 = JSON.parse(JSON.stringify(value)); v2.scope[0] = 'A five-page website.'; assert.notEqual(a, docHash(renderContract(v2)));
  const id = '3f2c0d6e-8a41-4c53-9b7e-1d2a3b4c5d6e', t = signToken('secret', id, 1);
  assert.deepEqual(readToken('secret', t), { id, version: 1 }); assert.equal(signToken('secret', id, 1), t, 'the same link every time, so a reminder can send it again');
  assert.equal(readToken('other', t), null); assert.equal(readToken('secret', t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')), null); assert.equal(readToken('secret', t.replace('.1.', '.2.')), null); assert.equal(readToken('secret', 'x'), null);
  assert.notEqual(signToken('secret', id, 2), t); assert.ok(t.length > 80);
  assert.equal(nextNumber([], 2026), 'FB-C-2026-001'); assert.equal(nextNumber(['FB-C-2026-001', 'FB-C-2026-009', 'FB-C-2025-044'], 2026), 'FB-C-2026-010'); assert.equal(nextNumber(['FB-C-2026-009'], 2027), 'FB-C-2027-001');
});

test('signing needs a name and both consents; automatic payments need their own, and the choice of ACH or card is recorded', () => {
  const plain = cleanContent(withPlan(base(), { type: 'full' })).value, auto = cleanContent(withPlan(base(), { type: 'monthly', months: 4, firstDueOn: '2026-12-01', method: 'either', autopay: true })).value;
  assert.match(checkSignature({ name: 'O', agree: true, esign: true }, plain).error, /full name/);
  assert.match(checkSignature({ name: '123', agree: true, esign: true }, plain).error, /full name/);
  assert.match(checkSignature({ name: 'Olive Owner', esign: true }, plain).error, /read and agree/);
  assert.match(checkSignature({ name: 'Olive Owner', agree: true }, plain).error, /electronically/);
  assert.deepEqual(checkSignature({ name: ' Olive  Owner ', title: 'Owner', agree: true, esign: true }, plain).value, { name: 'Olive Owner', title: 'Owner' });
  assert.match(checkSignature({ name: 'Olive Owner', agree: true, esign: true, method: 'ach' }, auto).error, /authorize the automatic payments/);
  assert.match(checkSignature({ name: 'Olive Owner', agree: true, esign: true, autopay: true }, auto).error, /ACH or card/);
  assert.deepEqual(checkSignature({ name: 'Olive Owner', agree: true, esign: true, autopay: true, method: 'card' }, auto).value, { name: 'Olive Owner', title: '', autopay: true, method: 'card' });
  assert.equal(dollars(1_200_000), '$12,000.00');
});

import { contractPdf } from '../src/contract-pdf.js';
test('the contract prints as a PDF on the letterhead, and once signed it has a certificate page with the fingerprint', async () => {
  const { value } = cleanContent(withPlan(base(), { type: 'monthly', months: 6, firstDueOn: '2026-12-01', depositPct: 20, method: 'ach', autopay: true }));
  const rendered = renderContract({ ...value, number: 'FB-C-2026-001', hosting: { included: true, monthlyCents: 9900, note: '' } });
  const pages = buf => (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  const draft = await contractPdf(rendered, { status: 'draft' }); assert.equal(draft.subarray(0, 5).toString(), '%PDF-'); assert.ok(draft.length > 8000);
  const hash = docHash(rendered), at = '2026-11-02T15:04:00Z';
  const signed = await contractPdf(rendered, { status: 'executed', hash, sentAt: '2026-11-01T10:00:00Z', clientSignature: { name: 'Olive Owner', title: 'Owner', at, ip: '203.0.113.9', ua: 'Mozilla/5.0 (iPhone)', esign: true, agree: true, method: 'ach', autopay: true }, providerSignature: { name: 'Kyle Riggle', title: 'Founder', at: '2026-11-01T10:00:00Z', ip: '198.51.100.2', ua: 'x' }, events: [{ kind: 'viewed', at: '2026-11-02T14:50:00Z', ip: '203.0.113.9', meta: { ua: 'Mozilla/5.0 (iPhone)' } }] });
  assert.equal(pages(signed), pages(draft) + 1, 'one page more: the certificate');
  const odd = await contractPdf(renderContract({ ...value, client: { ...value.client, company: '株式会社 Olive' }, number: 'FB-C-2026-002' }), { status: 'sent' }); assert.equal(odd.subarray(0, 5).toString(), '%PDF-');
});

// ---- physical product agreements ----
const prod = (o = {}) => ({ ...base(), title: 'Trail hat', kind: 'product', project: { name: 'Trail hat' }, scope: ['A complete tech pack', 'Two rounds of samples'], product: { categories: ['headwear'], production: { mode: 'direct' }, ...(o.product || {}) }, ...o, plan: buildPlan({ type: 'split', totalCents: 1_200_000 }).plan });

test('a physical product agreement has its own clauses: samples, production, quality, compliance, shipping, tooling', () => {
  assert.equal(KINDS.product, 'Physical product development'); assert.ok(isProduct('product') && !isProduct('website'));
  const ids = defaultSections('product').map(s => s.id), digital = defaultSections().map(s => s.id);
  for (const id of ['samples', 'production', 'quality', 'compliance', 'shipping']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('hosting'), 'no hosting clause for a hat'); assert.ok(digital.includes('hosting') && !digital.includes('samples'), 'the digital wording is unchanged');
});

test('a product contract renders with every merge field filled and nothing left to fix but the usual details', () => {
  const c = cleanContent(prod(), { settings: { providerName: 'Future Basics' } }); assert.ok(c.value, JSON.stringify(c.errors));
  const r = renderContract({ ...c.value, number: 'FB-C-2026-009' }); assert.deepEqual(r.missing, []);
  const text = JSON.stringify(r.sections);
  assert.match(text, /up to 2 rounds of samples/); assert.match(text, /FOB/); assert.match(text, /2\.5 for major defects/); assert.match(text, /small-part and lead rules/);
  assert.match(r.sections.find(s => s.id === 'production').body, /places each order directly with the factory/);
  assert.deepEqual(sendProblems(c.value, {}), [], 'a product contract can be sent when the usual details are there');
});

test('who places production orders changes the production clause, and "not covered" leaves it out', () => {
  const via = renderContract(cleanContent(prod({ product: { production: { mode: 'through_us', depositPct: 40 } } })).value);
  assert.match(via.sections.find(s => s.id === 'production').body, /a 40% deposit before we place the order/);
  const none = renderContract(cleanContent(prod({ product: { production: { mode: 'none' } } })).value);
  assert.ok(!none.sections.some(s => s.id === 'production'));
});

test('electronics add the electrical and battery rules; several categories are all listed', () => {
  const r = renderContract(cleanContent(prod({ product: { categories: ['electronics', 'apparel'] } })).value), t = r.sections.find(s => s.id === 'compliance').body;
  assert.match(t, /FCC, UL, CE and UKCA/); assert.match(t, /lithium batteries/); assert.match(t, /flammability/);
  const plain = renderContract(cleanContent(prod({ product: { categories: [] } })).value).sections.find(s => s.id === 'compliance').body;
  assert.match(plain, /any labelling, safety, testing and certification rules/);
});

test('product options are cleaned: unknown categories and shipping terms fall back, numbers are held in range', () => {
  const p = cleanProduct({ categories: ['hats', 'footwear', 'footwear'], sampleRounds: 99, incoterm: 'CIF', aql: '', production: { mode: 'sell it', depositPct: 500 } });
  assert.deepEqual(p.categories, ['footwear']); assert.equal(p.sampleRounds, 10); assert.equal(p.incoterm, defaultProduct().incoterm); assert.equal(p.aql, defaultProduct().aql);
  assert.deepEqual(p.production, { mode: 'direct', depositPct: 100 });
  assert.equal(cleanContent(prod()).value.hosting.included, false, 'a product contract never carries hosting');
  assert.equal(cleanContent(withPlan(base(), { type: 'full' })).value.product, undefined, 'a digital contract carries no product block');
});

test('a payment that waits for the work reads "on final sample approval" for a product and "on delivery" for digital work', () => {
  assert.equal(eventLabel('delivery', 'product'), 'On final sample approval'); assert.equal(eventLabel('delivery', 'website'), 'On delivery'); assert.equal(eventLabel('signing', 'product'), 'On signing');
  const plan = buildPlan({ type: 'split', totalCents: 1_000_000 }).plan;
  assert.match(planWords(plan, 'USD', 'product'), /on final sample approval/); assert.match(planWords(plan, 'USD'), /on delivery/);
  const sch = renderContract(cleanContent(prod()).value).sections.find(s => s.kind === 'schedule');
  assert.equal(sch.rows[1].when, 'On final sample approval'); assert.match(sch.summary, /on final sample approval/);
});
