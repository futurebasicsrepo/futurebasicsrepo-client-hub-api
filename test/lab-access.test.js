import test from 'node:test';
import assert from 'node:assert/strict';
import { meterOf, pricingFrom, UNITS, createLabAccess } from '../src/lab-access.js';
import { paymentFromOrder } from '../src/payments.js';

const access = { included_ai: 40, ai_price_cents: 250, unpaid_cap_cents: 15000 };

test('pricing comes from the environment, with sane defaults and a switch', () => {
  const p = pricingFrom({});
  assert.deepEqual([p.enabled, p.feeCents, p.days, p.includedAi, p.aiPriceCents, p.billAtCents, p.unpaidCapCents], [true, 49900, 90, 40, 250, 2500, 15000]);
  const q = pricingFrom({ DESIGN_LAB_SELF_SERVE: 'off', DESIGN_LAB_PRICE_CENTS: '79900', DESIGN_LAB_DAYS: '0', DESIGN_LAB_INCLUDED_AI: 'lots', DESIGN_LAB_AI_PRICE_CENTS: '-5' });
  assert.equal(q.enabled, false); assert.equal(q.feeCents, 79900); assert.equal(q.days, 1); assert.equal(q.includedAi, 40); assert.equal(q.aiPriceCents, 250);
});

test('the meter: included, over, billed, paid, and the cap', () => {
  assert.deepEqual(meterOf({ access, usedUnits: 12 }), { used: 12, included: 40, left: 28, overUnits: 0, aiPriceCents: 250, overCents: 0, billedUnits: 0, unbilledUnits: 0, unbilledCents: 0, unpaidCents: 0, owedCents: 0, capCents: 15000, blocked: false });
  const over = meterOf({ access, usedUnits: 50 }); assert.equal(over.overUnits, 10); assert.equal(over.overCents, 2500); assert.equal(over.unbilledCents, 2500); assert.equal(over.owedCents, 2500); assert.equal(over.blocked, false);
  const billed = meterOf({ access, usedUnits: 50, invoices: [{ units: 10, amount_cents: 2500, paid_at: null }] }); assert.equal(billed.unbilledUnits, 0); assert.equal(billed.unpaidCents, 2500); assert.equal(billed.owedCents, 2500);
  const paid = meterOf({ access, usedUnits: 54, invoices: [{ units: 10, amount_cents: 2500, paid_at: '2026-10-01' }] }); assert.equal(paid.unpaidCents, 0); assert.equal(paid.unbilledUnits, 4); assert.equal(paid.owedCents, 1000);
  const capped = meterOf({ access: { ...access, unpaid_cap_cents: 600 }, usedUnits: 43 }); assert.equal(capped.owedCents, 750); assert.equal(capped.blocked, true);
  assert.equal(meterOf({ access: { ...access, unpaid_cap_cents: 0 }, usedUnits: 400 }).blocked, false, 'no cap means never blocked');
  assert.equal(meterOf({ access: null, usedUnits: 3 }).included, 0);
});

test('a walk and a 3D model count for more than a picture', () => {
  assert.equal(UNITS.studio, 1); assert.equal(UNITS.walk, 4); assert.equal(UNITS.tryon, 3);
});

test('the gate: staff pass; a client with no live access is told what the Lab costs; the research side and client assignment refuse a client', async () => {
  const rows = { active: [], owns: [] }, calls = [];
  const pool = { query: async (q, args) => { calls.push(q); if (/from lab_access where client_id=\$1 and status='active'/.test(q)) return { rows: rows.active, rowCount: rows.active.length }; if (/select 1 from lab_/.test(q)) return { rows: rows.owns, rowCount: rows.owns.length }; return { rows: [], rowCount: 0 }; } };
  const lab = createLabAccess({ pool, env: {} });
  const reply = () => { const r = { code: c => { r.status = c; return r; }, send: b => { r.body = b; return r; } }; return r; };
  const staff = { auth: { role: 'admin', sub: '11111111-1111-4111-8111-111111111111' }, url: '/v1/lab/brands', method: 'POST' };
  let r = reply(); await lab.gate(staff, r); assert.equal(r.status, undefined); assert.equal(staff.lab.admin, true); assert.equal(lab.scope(staff), null);
  const cid = '22222222-2222-4222-8222-222222222222', client = { auth: { role: 'client', clientId: cid, sub: '33333333-3333-4333-8333-333333333333' }, url: '/v1/lab/plans', method: 'GET' };
  r = reply(); await lab.gate(client, r); assert.equal(r.status, 403); assert.equal(r.body.code, 'LAB_LOCKED'); assert.equal(r.body.pricing.feeCents, 49900);
  rows.active = [{ id: 'a1', client_id: cid, status: 'active', included_ai: 40, ai_price_cents: 250, unpaid_cap_cents: 15000 }];
  r = reply(); await lab.gate(client, r); assert.equal(r.status, undefined); assert.equal(lab.scope(client), cid);
  for (const [url, method] of [['/v1/lab/brands', 'POST'], ['/v1/lab/taste', 'GET'], ['/v1/lab/clients', 'GET'], ['/v1/lab/items', 'GET'], ['/v1/lab/plans/x/client', 'PUT']]) {
    r = reply(); await lab.gate({ ...client, url, method }, r); assert.equal(r.status, 403, url); assert.equal(r.body.code, 'LAB_STAFF_ONLY');
  }
  r = reply(); await lab.gate({ ...client, url: '/v1/lab/materials', method: 'GET' }, r); assert.equal(r.status, undefined, 'the shared libraries are readable');
  r = reply(); await lab.gate({ ...client, url: '/v1/lab/concepts/44444444-4444-4444-8444-444444444444/studio?x=1', method: 'GET' }, r); assert.equal(r.status, 404, 'a concept that is not theirs is not found');
  rows.owns = [{ 1: 1 }]; r = reply(); await lab.gate({ ...client, url: '/v1/lab/concepts/44444444-4444-4444-8444-444444444444/studio', method: 'PUT' }, r); assert.equal(r.status, undefined, 'their own concept passes');
  r = reply(); await lab.gate({ ...client, auth: { ...client.auth, preview: true }, url: '/v1/lab/plans', method: 'POST' }, r); assert.equal(r.status, 403, 'a client preview is read-only');
});

test('a paid Shopify order tagged for the Lab is recognised by the payment sync', () => {
  const order = (tags, amount) => ({ id: 'gid://shopify/Order/12', name: '#1012', processedAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:05Z', email: 'a@b.test', tags, totalPriceSet: { shopMoney: { amount, currencyCode: 'USD' } }, customer: null, lineItems: { nodes: [{ title: 'Design Lab · 90 days', product: null, customAttributes: [] }] } });
  const fee = paymentFromOrder(order(['future-basics-client-hub', 'fb-design-lab', 'client-acme'], '499.00')); assert.equal(fee.kind, 'design-lab'); assert.equal(fee.amountCents, 49900); assert.equal(fee.title, 'Design Lab access');
  const ai = paymentFromOrder(order(['future-basics-client-hub', 'fb-design-lab-ai'], '25.00')); assert.equal(ai.kind, 'design-lab-ai'); assert.equal(ai.title, 'Design Lab · AI generations');
  assert.equal(paymentFromOrder(order(['future-basics-client-hub', 'fb-tech-pack', 'fb-design-lab'], '48.00')).kind, 'tech-pack', 'a tech pack tag wins');
});
