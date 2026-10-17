import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, MODULE_IDS, OPEN_IDS, PRESETS, moduleFor, isOwner, ownerList, cleanModules, parseDefault, reach, createStaffAccess } from '../src/staff-access.js';

const ENV = {};

test('the owners are Danielle and Kyle unless ACCESS_ADMIN_EMAILS says otherwise', () => {
  assert.deepEqual(ownerList(ENV).sort(), ['danielle@thefuturebasics.com', 'kyle@thefuturebasics.com']);
  assert.ok(isOwner('Kyle@TheFutureBasics.com', ENV) && !isOwner('colby@thefuturebasics.com', ENV) && !isOwner('', ENV));
  assert.ok(isOwner('pat@x.com', { ACCESS_ADMIN_EMAILS: 'pat@x.com' }) && !isOwner('kyle@thefuturebasics.com', { ACCESS_ADMIN_EMAILS: 'pat@x.com' }), 'a named list replaces the default');
  assert.ok(isOwner('anyone@acme.com', { ACCESS_ADMIN_EMAILS: '@acme.com' }), 'a whole domain can be named');
});

test('every staff route belongs to a module, and the module ids are unique and labelled', () => {
  assert.equal(new Set(MODULE_IDS).size, MODULES.length); assert.ok(MODULES.find(m => m.id === 'lab').restricted && !OPEN_IDS.includes('lab') && OPEN_IDS.length === MODULES.length - 1); assert.ok(MODULES.every(m => m.label && m.hint && m.group));
  const cases = {
    '/v1/sales/contacts/:id': 'crm', '/v1/sales/deals': 'crm', '/v1/sales/email/settings': 'crm', '/v1/sales/opportunities': 'crm', '/v1/sales/overview': 'crm', '/v1/sales/templates': 'crm',
    '/v1/sales/chats': 'messages', '/v1/sales/chats/:id/reply': 'messages', '/v1/admin/message-center': 'messages', '/v1/admin/notifications/:id/read': 'messages',
    '/v1/sales/automations': 'automations', '/v1/sales/runs/:id/stop': 'automations', '/v1/sales/contacts/:id/runs': 'automations', '/v1/sales/press/releases': 'press',
    '/v1/intel/signals': 'intel', '/v1/contracts': 'contracts', '/v1/contracts/:id/send': 'contracts', '/v1/admin/prototypes': 'prototypes', '/v1/admin/builds/:id': 'builds',
    '/v1/admin/factories': 'factories', '/v1/admin/platform/health': 'platform', '/v1/admin/shopify/status': 'platform', '/v1/brand': 'brand', '/v1/lab/items': 'lab', '/v1/lab/brands/:id/scan': 'lab',
    '/v1/admin/clients/:id': 'clients', '/v1/admin/products/:id/tech-pack': 'clients', '/v1/admin/projects/:id/messages': 'clients', '/v1/admin/learning': 'clients', '/v1/admin/dashboard': 'clients',
    '/v1/products/:id/files': 'clients', '/v1/projects/:id': 'clients', '/v1/invoices/:id/download': 'clients', '/v1/room-files/:id': 'clients',
    '/v1/admin/home': null, '/v1/staff-access/me': null, '/v1/staff-access': null, '/v1/money/invoices': null, '/v1/session': null, '/healthz': null
  };
  assert.equal(moduleFor('/v1/admin/tech-pack-billing', 'PUT'), 'owner'); assert.equal(moduleFor('/v1/admin/tech-pack-billing', 'GET'), 'clients', 'reading the payment gate stays with Clients and projects');
  for (const [pattern, want] of Object.entries(cases)) assert.equal(moduleFor(pattern), want, pattern);
});

test('a person can open only what is ticked; a new person gets the default; the owners always have everything', () => {
  const sam = reach({ email: 'sam@thefuturebasics.com', row: { modules: ['crm', 'press', 'nonsense'], blocked: false }, defaults: [], env: ENV });
  assert.deepEqual(sam.modules, ['crm', 'press']); assert.ok(sam.can('crm') && sam.can('press') && !sam.can('clients') && sam.can(null), 'null is a route that needs no module');
  const fresh = reach({ email: 'new@thefuturebasics.com', row: null, defaults: ['brand'], env: ENV });
  assert.ok(!fresh.configured && fresh.can('brand') && !fresh.can('crm'));
  assert.deepEqual(reach({ email: 'new@thefuturebasics.com', row: null, defaults: [], env: ENV }).modules, [], 'nothing until an owner says');
  const paused = reach({ email: 'sam@thefuturebasics.com', row: { modules: MODULE_IDS, blocked: true }, env: ENV });
  assert.ok(paused.blocked && !paused.can('crm') && paused.can(null) === true);
  const owner = reach({ email: 'danielle@thefuturebasics.com', row: { modules: [], blocked: true }, env: ENV });
  assert.ok(owner.owner && !owner.blocked && MODULE_IDS.every(id => owner.can(id)), 'an owner cannot be locked out by a row');
});

test('module lists are cleaned and the starting default can be everything, a list, or nothing', () => {
  assert.deepEqual(cleanModules(['press', 'crm', 'crm', 'x']), ['crm', 'press'], 'the page order, once each, real ids only'); assert.deepEqual(cleanModules('crm'), []);
  assert.deepEqual(parseDefault('all'), OPEN_IDS); assert.deepEqual(parseDefault('crm, brand'), ['crm', 'brand']); assert.deepEqual(parseDefault('crm, lab'), ['crm'], 'the Design Lab is never a default'); assert.deepEqual(parseDefault(''), []); assert.deepEqual(parseDefault(undefined), []);
  assert.ok(PRESETS.every(p => p.modules.every(m => MODULE_IDS.includes(m))) && PRESETS.find(p => p.id === 'everything').modules.length === OPEN_IDS.length && !PRESETS.some(p => p.modules.includes('lab')) && PRESETS.find(p => p.id === 'nothing').modules.length === 0);
});

function fake(rows, settings = {}) {
  const pool = { query: async (sql, [id]) => ({ rows: rows[id] ? [rows[id]] : [] }) };
  return createStaffAccess({ pool, env: ENV, getSetting: async k => settings[k] ?? null, setSetting: async (k, v) => { settings[k] = v; }, now: (() => { let t = 0; return () => (t += 50_000); })() });
}
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333', OWN = '44444444-4444-4444-8444-444444444444';
const req = (sub, url, role = 'admin') => ({ auth: { sub, role, email: '' }, routeOptions: { url } });

test('check refuses a staff request for a module the person was not given, says which, and lets everything else through', async () => {
  const sa = fake({ [U1]: { email: 'sam@thefuturebasics.com', modules: ['crm'], blocked: false }, [U2]: { email: 'pat@thefuturebasics.com', modules: null, blocked: null }, [OWN]: { email: 'kyle@thefuturebasics.com', modules: null, blocked: null } });
  assert.equal(await sa.check(req(U1, '/v1/sales/contacts')), null);
  const no = await sa.check(req(U1, '/v1/admin/clients/:id')); assert.equal(no.status, 403); assert.equal(no.body.code, 'MODULE_ACCESS'); assert.equal(no.body.module, 'clients'); assert.match(no.body.error, /Clients and projects.*Kyle or Danielle/);
  assert.equal(await sa.check(req(U1, '/v1/admin/home')), null, 'My day is for everyone'); assert.equal(await sa.check(req(U1, '/v1/staff-access/me')), null);
  assert.equal((await sa.check(req(U2, '/v1/sales/contacts'))).status, 403, 'a person with no row starts with nothing');
  assert.equal(await sa.check(req(OWN, '/v1/admin/clients/:id')), null, 'an owner is never refused');
  assert.equal(await sa.check({ auth: { sub: 'preview-session', role: 'admin' }, routeOptions: { url: '/v1/sales/contacts' } }), null, 'the staff preview is not a real person and is not restricted');
});

test('changing the payment gate is for the owners only', async () => {
  const sa = fake({ [U1]: { email: 'sam@thefuturebasics.com', modules: MODULE_IDS, blocked: false }, [OWN]: { email: 'kyle@thefuturebasics.com', modules: null, blocked: null } });
  const put = { auth: { sub: U1, role: 'admin' }, method: 'PUT', routeOptions: { url: '/v1/admin/tech-pack-billing' } };
  const r = await sa.check(put); assert.equal(r.status, 403); assert.equal(r.body.code, 'OWNER_ONLY');
  assert.equal(await sa.check({ ...put, method: 'GET' }), null); assert.equal(await sa.check({ ...put, auth: { sub: OWN, role: 'admin' } }), null);
});

test('a paused person is refused everything except reading their own access', async () => {
  const sa = fake({ [U1]: { email: 'sam@thefuturebasics.com', modules: MODULE_IDS, blocked: true } });
  const r = await sa.check(req(U1, '/v1/sales/contacts')); assert.equal(r.status, 403); assert.equal(r.body.code, 'STAFF_PAUSED');
  assert.equal((await sa.check(req(U1, '/v1/admin/home'))).body.code, 'STAFF_PAUSED');
  assert.equal(await sa.check(req(U1, '/v1/staff-access/me')), null); assert.equal(await sa.check(req(U1, '/v1/session')), null);
});

test('the default for new people is the owners\' stored choice, then STAFF_ACCESS_DEFAULT, then nothing', async () => {
  const settings = {}; const none = fake({ [U3]: { email: 'new@thefuturebasics.com', modules: null, blocked: null } }, settings);
  assert.deepEqual(await none.defaults(), []); assert.equal((await none.check(req(U3, '/v1/brand'))).status, 403);
  assert.deepEqual(await none.setDefaults(['brand', 'zzz']), ['brand']); assert.equal(await none.check(req(U3, '/v1/brand')), null, 'the stored default applies to people with no row');
  const withEnv = createStaffAccess({ pool: { query: async () => ({ rows: [] }) }, env: { STAFF_ACCESS_DEFAULT: 'all' }, getSetting: async () => null, setSetting: async () => {} });
  assert.deepEqual(await withEnv.defaults(), OPEN_IDS, 'everything does not hand out the held-back Design Lab');
  assert.deepEqual(await none.setDefaults(['brand', 'lab']), ['brand'], 'saving the default drops the Design Lab');
});
