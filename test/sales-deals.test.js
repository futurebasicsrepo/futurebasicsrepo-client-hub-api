import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDeal, contractStage, quoteStage, productQuoteCents, linkDeal, syncContractDeal, reconcileDeals } from '../src/sales-deals.js';

test('each document maps to a pipeline stage: a contract draft is a meeting, sent is a proposal, signed is won, the rest is lost', () => {
  assert.deepEqual(['draft', 'sent', 'signed_by_client', 'executed', 'declined', 'expired', 'void'].map(contractStage), ['meeting', 'proposal', 'proposal', 'won', 'lost', 'lost', 'lost']);
  assert.deepEqual(['issued', 'accepted', 'declined', 'superseded'].map(quoteStage), ['proposal', 'won', 'lost', null]);
  assert.equal(productQuoteCents({ quantity: 200, wholesale_cents: 1450, unit_cost_cents: 900, tooling_cents: 25000, freight_cents: 6000 }), 200 * 1450 + 31000, 'wholesale, else cost, times quantity, plus tooling and freight');
});

test('a deal takes the stage and the value of the document that moved it, and a won deal stays won', () => {
  assert.deepEqual(nextDeal(null, { stage: 'proposal', valueCents: 1200000 }), { stage: 'proposal', valueCents: 1200000 }, 'a new deal');
  assert.deepEqual(nextDeal({ stage: 'meeting', value_cents: 0 }, { stage: 'proposal', valueCents: 1200000 }), { stage: 'proposal', valueCents: 1200000 });
  assert.deepEqual(nextDeal({ stage: 'won', value_cents: 500000 }, { stage: 'proposal', valueCents: 900000 }), { stage: 'won', valueCents: 500000 }, 'a later proposal does not pull a won deal back');
  assert.deepEqual(nextDeal({ stage: 'won', value_cents: 500000 }, { stage: 'won', valueCents: 900000 }), { stage: 'won', valueCents: 900000 }, 'a second signed document sets the won value');
  assert.deepEqual(nextDeal({ stage: 'proposal', value_cents: 700000 }, { stage: 'meeting', valueCents: 800000, forwardOnly: true }), { stage: 'proposal', valueCents: 800000 }, 'a draft never pulls a deal back');
  assert.deepEqual(nextDeal({ stage: 'lost', value_cents: 700000 }, { stage: 'meeting', valueCents: 800000, forwardOnly: true }), { stage: 'meeting', valueCents: 800000 }, 'a new draft reopens a lost deal');
  assert.deepEqual(nextDeal({ stage: 'proposal', value_cents: 700000 }, { stage: 'proposal', valueCents: 0 }), { stage: 'proposal', valueCents: 700000 }, 'a document with no fee yet leaves the value alone');
  assert.deepEqual(nextDeal({ stage: 'proposal', value_cents: 700000 }, { stage: 'lost', valueCents: 700000 }), { stage: 'lost', valueCents: 700000 });
  assert.deepEqual(nextDeal({ stage: 'proposal', value_cents: 700000 }, { stage: 'lost', valueCents: 700000, otherLive: true }), { stage: 'proposal', valueCents: 700000 }, 'not lost while something else on the deal is live');
});

// A small Sales database: companies, contacts, deals and their timeline, and the contracts that point at deals.
function salesDb({ contracts = [], clients = [] } = {}) {
  const t = { companies: [], contacts: [], deals: [], activities: [], contracts, clients, triggers: [] };
  let n = 0; const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const query = async (sql, a = []) => {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (/^select id, name, contact_email, contact_name, owner_id from clients/.test(sql)) return { rows: t.clients.filter(c => c.id === a[0]) };
    if (/^select id from sales_companies where lower\(name\)/.test(sql)) return { rows: t.companies.filter(c => c.name.toLowerCase() === a[0].toLowerCase()) };
    if (/^insert into sales_companies/.test(sql)) { const c = { id: id(), name: a[0] }; t.companies.push(c); return { rows: [c] }; }
    if (/^select id from sales_contacts where lower\(email\)/.test(sql)) return { rows: t.contacts.filter(c => c.email === a[0]) };
    if (/^select id from sales_contacts where client_id/.test(sql)) return { rows: t.contacts.filter(c => c.client_id === a[0]) };
    if (/^insert into sales_contacts/.test(sql)) { const c = { id: id(), name: a[0], email: a[1], company_id: a[2], source: a[3], client_id: a[4] }; t.contacts.push(c); return { rows: [c] }; }
    if (/^update sales_contacts/.test(sql)) return { rows: [] };
    if (/^select id, stage, value_cents, contact_id from sales_deals where id/.test(sql) || /^select stage, value_cents from sales_deals where id/.test(sql)) return { rows: t.deals.filter(d => d.id === a[0]) };
    if (/^insert into sales_deals/.test(sql)) { const d = { id: id(), contact_id: a[0], company_id: a[1], title: a[2], stage: a[3], value_cents: a[4], source: a[5], project_id: a[6], lost_reason: a[9] }; t.deals.push(d); return { rows: [d] }; }
    if (/^update sales_deals set stage=\$2, value_cents=\$3/.test(sql)) { const d = t.deals.find(x => x.id === a[0]); Object.assign(d, { stage: a[1], value_cents: a[2], lost_reason: a[1] === 'lost' ? a[7] : '' }); d.contact_id ||= a[3]; return { rows: [] }; }
    if (/^update sales_deals set contact_id=coalesce/.test(sql)) return { rows: [] };
    if (/^insert into sales_activities/.test(sql)) { t.activities.push({ deal: a[1], text: a[2] }); return { rows: [] }; }
    if (/^select exists\(select 1 from contracts where deal_id/.test(sql)) return { rows: [{ live: t.contracts.some(k => k.deal_id === a[0] && k.id !== a[1] && ['draft', 'sent', 'signed_by_client', 'executed'].includes(k.status)) }] };
    if (/^update contracts set deal_id/.test(sql)) { const k = t.contracts.find(x => x.id === a[0]); k.deal_id = a[1]; k.contact_id ||= a[2]; return { rows: [] }; }
    if (/^select \* from contracts where/.test(sql)) return { rows: t.contracts.filter(k => (k.deal_id && !(k.status === 'void' && /^Replaced by version/.test(k.void_reason || ''))) || (!k.deal_id && ['sent', 'signed_by_client', 'executed'].includes(k.status)) || (!k.deal_id && k.status === 'draft' && k.total_cents > 0)) };
    if (/from quotes q where q.deal_id is null/.test(sql)) return { rows: [] };
    if (/automation|sales_automations/.test(sql)) { t.triggers.push(sql); return { rows: [] }; }
    return { rows: [], rowCount: 0 };
  };
  return { query, t };
}
const contract = (o = {}) => ({ id: 'k1', number: 'FB-2026-014', title: 'Spring capsule', status: 'draft', total_cents: 4800000, client_id: null, project_id: null, deal_id: null, contact_id: null,
  content: { client: { company: 'Common Ground', signerName: 'Ada Client', signerEmail: 'ada@client.test' } }, ...o });

test('a contract made without a deal opens one in Sales, worth the contract, tied to the signer and the company, and remembers it', async () => {
  const k = contract(), db = salesDb({ contracts: [] }); db.t.contracts.push(k);
  const dealId = await syncContractDeal(db, k);
  assert.ok(dealId); assert.equal(k.deal_id, dealId, 'the contract keeps its deal, so its invoices carry it');
  const d = db.t.deals[0];
  assert.deepEqual({ stage: d.stage, value: d.value_cents, source: d.source }, { stage: 'meeting', value: 4800000, source: 'contract' });
  assert.match(d.title, /Common Ground · FB-2026-014 · Spring capsule/);
  assert.equal(db.t.companies[0].name, 'Common Ground'); assert.equal(db.t.contacts[0].email, 'ada@client.test'); assert.equal(d.contact_id, db.t.contacts[0].id);
  assert.equal(await syncContractDeal(db, k), dealId, 'saving the draft again keeps the same deal'); assert.equal(db.t.deals.length, 1);
  assert.equal(db.t.activities.length, 1, 'and says nothing new when nothing changed');
  k.status = 'sent'; await syncContractDeal(db, k); assert.equal(d.stage, 'proposal', 'sending makes it a proposal in the pipeline');
  k.status = 'executed'; k.total_cents = 5000000; await syncContractDeal(db, k);
  assert.deepEqual({ stage: d.stage, value: d.value_cents }, { stage: 'won', value: 5000000 }, 'signed by both: won at the signed value');
  assert.equal(db.t.activities.length, 3);
});

test('a declined contract loses its deal, unless a newer version is still out; a replaced version hands its deal on quietly', async () => {
  const db = salesDb(); const v1 = contract({ status: 'sent' }); db.t.contracts.push(v1);
  const dealId = await syncContractDeal(db, v1);
  const v2 = contract({ id: 'k2', number: 'FB-2026-014-v2', status: 'draft', deal_id: dealId }); db.t.contracts.push(v2);
  v1.status = 'void'; v1.void_reason = 'Replaced by version 2'; const said = db.t.activities.length;
  await syncContractDeal(db, v1); assert.equal(db.t.activities.length, said, 'the replaced version says nothing'); assert.equal(db.t.deals[0].stage, 'proposal');
  v2.status = 'sent'; v1.status = 'declined';
  await syncContractDeal(db, v1); assert.equal(db.t.deals[0].stage, 'proposal', 'v2 is still out, so the deal is not lost');
  v2.status = 'declined'; v2.declined = { reason: 'Budget moved to next year' };
  await syncContractDeal(db, v2); assert.equal(db.t.deals[0].stage, 'lost'); assert.match(db.t.deals[0].lost_reason, /Budget moved to next year/);
});

test('a contract made from a deal moves that deal instead of opening another', async () => {
  const db = salesDb(); db.t.deals.push({ id: 'd-1', stage: 'meeting', value_cents: 0, contact_id: 'c-1' });
  const k = contract({ deal_id: 'd-1', status: 'sent' }); db.t.contracts.push(k);
  assert.equal(await syncContractDeal(db, k), 'd-1'); assert.equal(db.t.deals.length, 1);
  assert.deepEqual({ stage: db.t.deals[0].stage, value: db.t.deals[0].value_cents }, { stage: 'proposal', value: 4800000 });
});

test('the catch-up ties in contracts made before, and a second run changes nothing', async () => {
  const db = salesDb(); db.t.contracts.push(contract({ status: 'sent' }), contract({ id: 'k9', number: 'FB-2026-009', status: 'declined' }));
  const first = await reconcileDeals(db, { log: { warn() {}, info() {} } });
  assert.equal(first.contracts, 1, 'the sent one is in the pipeline; the declined one had nothing to close');
  assert.equal(db.t.deals.length, 1); assert.equal(db.t.deals[0].stage, 'proposal'); assert.equal(db.t.deals[0].value_cents, 4800000);
  const said = db.t.activities.length, second = await reconcileDeals(db, { log: { warn() {}, info() {} } });
  assert.deepEqual(second, { contracts: 0, quotes: 0, orderQuotes: 0 }); assert.equal(db.t.activities.length, said);
});

test('a draft with no fee yet opens no deal; it opens one once it has a fee', async () => {
  const db = salesDb(); const k = contract({ total_cents: 0 }); db.t.contracts.push(k);
  assert.equal(await syncContractDeal(db, k), null); assert.equal(db.t.deals.length, 0);
  k.total_cents = 900000; assert.ok(await syncContractDeal(db, k)); assert.equal(db.t.deals[0].value_cents, 900000);
});

test('a failure to reach Sales never breaks the contract: the deal is skipped and logged', async () => {
  const warned = []; const out = await linkDeal({ query: async () => { throw new Error('down'); } }, { stage: 'proposal', log: { warn: (o, m) => warned.push(m) } });
  assert.equal(out.dealId, null); assert.deepEqual(warned, ['deal not tracked']);
});
