import test from 'node:test';
import assert from 'node:assert/strict';
import { teamView, TEAM_MAX } from '../src/room-team-routes.js';
import { createLabAccess } from '../src/lab-access.js';

const client = { contact_email: 'Owner@Brand.test', allowed_emails: ['owner@brand.test', 'new@brand.test', 'gone@brand.test'], email_domains: ['brand.test'] };
const users = [
  { id: 'u1', email: 'owner@brand.test', name: 'Olu', role: 'client', last_sign_in_at: '2026-10-01', email_verified_at: '2026-09-01' },
  { id: 'u2', email: 'maker@brand.test', name: '', role: 'client', invited_by: 'u1', invited_at: '2026-10-02', email_verified_at: null, last_sign_in_at: null },
  { id: 'u3', email: 'gone@brand.test', name: 'Gone', role: 'client', removed_at: '2026-10-03' },
  { id: 'u4', email: 'kyle@thefuturebasics.com', name: 'Kyle', role: 'admin' }
];

test('the team: the owner first, signed-in before invited, removed people and staff left out, addresses never signed in still listed', () => {
  const v = teamView({ client, users, you: 'u2' });
  assert.deepEqual(v.members.map(m => [m.email, m.status, m.owner, m.you]), [['owner@brand.test', 'active', true, false], ['maker@brand.test', 'invited', false, true], ['new@brand.test', 'invited', false, false]]);
  assert.equal(v.members[1].invitedBy, 'Olu'); assert.equal(v.members[2].id, null);
  assert.ok(!v.members.some(m => m.email === 'gone@brand.test'), 'a removed teammate is gone even if their address lingers');
  assert.deepEqual(v.domains, ['brand.test']); assert.equal(v.max, TEAM_MAX);
});

test('shared libraries: a room reads Future Basics\' materials, techniques, fonts and shared graphics, but changes only its own', async () => {
  const cid = '22222222-2222-4222-8222-222222222222', id = '44444444-4444-4444-8444-444444444444', seen = [];
  const pool = { query: async (q, args) => { if (/from lab_access/.test(q)) return { rows: [{ id: 'a1', client_id: cid, status: 'active' }], rowCount: 1 }; if (/select 1 from/.test(q)) { seen.push(q); return /client_id is null|or shared/.test(q) ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 }; } return { rows: [], rowCount: 0 }; } };
  const lab = createLabAccess({ pool, env: {} }), reply = () => { const r = { code: c => { r.status = c; return r; }, send: b => { r.body = b; return r; } }; return r; };
  const as = (url, method) => ({ auth: { role: 'client', clientId: cid, sub: '33333333-3333-4333-8333-333333333333' }, url, method });
  for (const url of [`/v1/lab/materials/${id}/swatch`, `/v1/lab/library/techniques/${id}/sample`, `/v1/lab/fonts/${id}/file`, `/v1/lab/art/${id}`, `/v1/lab/library/technique-photos/${id}`]) { const r = reply(); await lab.gate(as(url, 'GET'), r); assert.equal(r.status, undefined, url); }
  for (const [url, m] of [[`/v1/lab/materials/${id}`, 'PUT'], [`/v1/lab/library/techniques/${id}`, 'DELETE'], [`/v1/lab/library/graphics/${id}`, 'PUT'], [`/v1/lab/library/techniques/${id}/sample`, 'POST']]) { const r = reply(); await lab.gate(as(url, m), r); assert.equal(r.status, 404, `${m} ${url}`); }
  let r = reply(); await lab.gate(as('/v1/lab/materials', 'POST'), r); assert.equal(r.status, undefined, 'a room adds its own materials');
  r = reply(); await lab.gate(as('/v1/lab/library/techniques', 'POST'), r); assert.equal(r.status, undefined, 'and techniques');
  assert.ok(seen.some(q => /lab_art where id=\$1 and \(client_id=\$2 or shared\)/.test(q)), 'a graphic is readable when shared');
});
