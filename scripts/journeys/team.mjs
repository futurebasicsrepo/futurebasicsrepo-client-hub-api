// Team access, end to end over HTTP (server G): Danielle and Kyle choose which modules each person can open, and the service refuses everything else.
// A person with no row starts with nothing; a paused person is shut out; the owners cannot be changed; a client is untouched. The stored default for new
// people is put back to "everything" at the end, because the rest of the suite signs in as staff who have no row.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sql, stamp, forge } from './lib.mjs';
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
import { MODULE_IDS } from '../../src/staff-access.js';
const BASE = 'http://127.0.0.1:3130', call = api(BASE);
const room = (await call('/v1/public/start', { body: { email: `jt-${stamp}-${Math.random().toString(36).slice(2, 7)}@chaos.test`, name: 'Team Admin', title: 'Team runner', photos: [jpeg()] } })).json;
const clientId = room.client?.id || sql(`select client_id from users where lower(email)='${room.email || ''}'`);
const staffRow = email => sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${clientId}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0];
const token = async email => forge({ sub: staffRow(email), clientId, role: 'admin', email });
const PAT = `pat-${stamp}@thefuturebasics.com`, kyleT = await token('kyle@thefuturebasics.com'), danT = await token('danielle@thefuturebasics.com'), patT = await token(PAT), patId = staffRow(PAT);
const O = (path, o = {}) => call('/v1/staff-access' + path, { token: kyleT, ...o }), P = (path, o = {}) => call(path, { token: patT, ...o });
const codeOf = r => r.json?.code;

await journey('J190', 'Team access: owners give each person modules, everyone else is refused the rest, paused people are shut out, and owners and clients are untouched', async () => {
  try {
    // only the owners can see or change it
    ok((await call('/v1/staff-access')).status === 401 && (await call('/v1/staff-access', { token: room.token })).status === 403, 'signed out and client sessions cannot read it');
    ok((await P('/v1/staff-access')).status === 403 && /Danielle and Kyle/.test((await P('/v1/staff-access')).json.error) && (await P(`/v1/staff-access/users/${patId}`, { method: 'PUT', body: { modules: MODULE_IDS } })).status === 403, 'a teammate cannot read or change who sees what');
    const list = await O(''); ok(list.status === 200 && list.json.modules.length === MODULE_IDS.length && list.json.presets.length >= 3 && list.json.team.some(p => p.email === PAT) && list.json.team.filter(p => p.owner).length >= 2, 'the owners see the modules, the presets and the whole team', list.json.error);

    // the owners say what new people start with: nothing
    ok((await O('/defaults', { method: 'PUT', body: { modules: [] } })).status === 200 && (await O('')).json.defaults.length === 0, 'new people start with nothing');
    await sql(`delete from staff_access where user_id='${patId}'`);
    const me0 = (await P('/v1/staff-access/me')).json; ok(me0.owner === false && me0.modules.length === 0 && me0.blocked === false, 'a new person has no modules yet', me0);
    ok((await O('/me')).json.waiting >= 1 && (await O('/me')).json.owner === true && (await O('/me')).json.modules.length === MODULE_IDS.length, 'the owners are told someone is waiting, and always have everything');
    const denied = await P('/v1/sales/contacts'); ok(denied.status === 403 && codeOf(denied) === 'MODULE_ACCESS' && denied.json.module === 'crm' && /Contacts and sales/.test(denied.json.error) && /Kyle or Danielle/.test(denied.json.error), 'a new person is refused the contacts, and told who to ask', denied.json);
    ok((await P('/v1/admin/home')).status === 200, 'My day is open to everyone on the team');
    const newest = (await O('')).json.team.find(p => p.email === PAT); ok(newest && !newest.configured && newest.usingDefault && newest.modules.length === 0, 'the list shows them as new, on the default');

    // give one module
    const set = await O(`/users/${patId}`, { method: 'PUT', body: { modules: ['crm'], note: 'Sales, started today' } }); ok(set.status === 200 && set.json.person.modules.join() === 'crm', 'an owner gives one module', set.json);
    ok((await P('/v1/sales/contacts')).status === 200 && (await P('/v1/sales/overview')).status === 200 && (await P('/v1/sales/deals')).status < 400, 'the sales modules now open');
    const refusals = { '/v1/contracts': 'contracts', '/v1/intel/overview': 'intel', '/v1/admin/factories': 'factories', '/v1/admin/dashboard': 'clients', '/v1/admin/message-center': 'messages', '/v1/admin/platform/health': 'platform', '/v1/admin/prototypes': 'prototypes', '/v1/admin/builds': 'builds', '/v1/sales/press': 'press', '/v1/sales/automations': 'automations', '/v1/sales/chats': 'messages', '/v1/brand': 'brand' };
    for (const [path, mod] of Object.entries(refusals)) { const r = await P(path); ok(r.status === 403 && r.json.module === mod, `${path} is refused: it belongs to ${mod}`, [r.status, r.json]); }
    const shared = await P(`/v1/products/00000000-0000-4000-8000-000000000000/files`); ok(shared.status === 403 && shared.json.module === 'clients', 'the routes staff share with clients are held to the clients module too', [shared.status, shared.json]);
    ok((await P('/v1/money/invoices')).status === 403, 'Money is still its own list: not given by a module');
    const home = (await P('/v1/admin/home')).json; ok(Array.isArray(home.projects) && home.projects.length === 0 && home.waiting.approvals === 0 && home.signals.total === 0, 'My day leaves out what they cannot open (projects, signals)');

    // more modules, a preset-sized set
    ok((await O(`/users/${patId}`, { method: 'PUT', body: { modules: ['crm', 'clients', 'brand'] } })).status === 200 && (await P('/v1/admin/dashboard')).status === 200 && (await P('/v1/brand')).status === 200 && (await P('/v1/contracts')).status === 403, 'more modules open exactly what was added');

    // pause and resume
    ok((await O(`/users/${patId}`, { method: 'PUT', body: { blocked: true } })).status === 200, 'an owner pauses someone');
    const paused = await P('/v1/sales/contacts'); ok(paused.status === 403 && codeOf(paused) === 'STAFF_PAUSED', 'a paused person is refused everything', paused.json);
    ok(codeOf(await P('/v1/admin/home')) === 'STAFF_PAUSED' && (await P('/v1/staff-access/me')).json.blocked === true, 'even My day, but they can still read that they are paused');
    ok((await O(`/users/${patId}`, { method: 'PUT', body: { blocked: false } })).status === 200 && (await P('/v1/sales/contacts')).status === 200, 'resuming brings back exactly what they had');
    ok((await O('')).json.team.find(p => p.email === PAT).modules.join() === 'crm,clients,brand' || (await O('')).json.team.find(p => p.email === PAT).modules.length === 3, 'pausing and resuming did not touch the modules');

    // what cannot be done
    const owners = (await O('')).json.team.filter(p => p.owner), kid = owners[0].id;
    ok((await O(`/users/${kid}`, { method: 'PUT', body: { modules: [] } })).status === 409, 'an owner cannot be restricted or paused');
    ok((await O(`/users/${patId}`, { method: 'PUT', body: { modules: ['crm', 'nothing-like-this'] } })).status === 422 && (await O(`/users/${patId}`, { method: 'PUT', body: { modules: 'crm' } })).status === 422, 'an unknown module or a bad list is refused');
    ok((await O('/users/00000000-0000-4000-8000-000000000000', { method: 'PUT', body: { modules: [] } })).status === 404 && (await O(`/users/${sql(`select id from users where role='client' limit 1`).split('\n')[0]}`, { method: 'PUT', body: { modules: [] } })).status === 404, 'only staff can be given modules');
    ok((await O('/defaults', { method: 'PUT', body: { modules: ['crm', 'zzz'] } })).status === 422, 'the default is checked the same way');

    // the default for newcomers
    ok((await O('/defaults', { method: 'PUT', body: { modules: ['brand'] } })).status === 200, 'the owners set what new people start with');
    const newbie = `newbie-${stamp}@thefuturebasics.com`, nT = await token(newbie);
    ok((await call('/v1/brand', { token: nT })).status === 200 && (await call('/v1/sales/contacts', { token: nT })).status === 403, 'a brand-new person gets that default, and nothing more');

    // the owners are never held back, and a client session is untouched
    ok((await call('/v1/sales/contacts', { token: kyleT })).status === 200 && (await call('/v1/admin/dashboard', { token: danT })).status === 200 && (await call('/v1/contracts', { token: kyleT })).status === 200, 'the owners reach everything');
    ok((await call('/v1/dashboard', { token: room.token })).status === 200, 'a client still reaches their own room');

    // the record
    const log = (await O('/log')).json.log; ok(log.length >= 5 && log.some(x => x.person === PAT && x.by === 'kyle@thefuturebasics.com' && x.added.includes('Contacts and sales')) && log.some(x => x.person === PAT && x.paused) && log.some(x => x.person === PAT && x.resumed), 'every change is recorded with who made it', log.slice(0, 3));
  } finally {
    await O('/defaults', { method: 'PUT', body: { modules: MODULE_IDS } }); // the rest of the suite signs in as staff with no row
    await sql(`delete from staff_access where user_id='${patId}'`);
  }
});

await journey('J191', 'Team access in a browser: the owners open the page and give a person modules, the menu hides what a person cannot open, and a page that belongs to a module says so', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  const b = await playwright.chromium.launch(); const errs = [];
  try {
    // the owners' page
    const oc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await oc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyleT);
    const page = await oc.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await O('/defaults', { method: 'PUT', body: { modules: [] } }); await sql(`delete from staff_access where user_id='${patId}'`);
    await page.goto(`${BASE}/team`, { waitUntil: 'networkidle' }); await page.waitForSelector('#team .who');
    await page.waitForFunction(() => document.querySelector('.fbside a[data-nav="Team access"]') && !document.querySelector('.fbside a[data-nav="Team access"]').hidden, null, { timeout: 8000 }).catch(() => {});
    { const h1 = await page.innerText('.hero h1'), links = await page.locator('.fbside a[data-nav="Team access"]:not([hidden])').count(); ok(/Who sees what/.test(h1) && links === 1, 'the Team access page opens for an owner, with its place in the menu', [h1, links, await page.locator('.fbside').count()]); }
    const card = page.locator(`.who[data-id="${patId}"]`); ok(await card.count() === 1 && /no access yet/i.test(await card.locator('.chip').innerText()) && await card.evaluate(n => n.open), 'a new person is listed, open, and marked as having no access yet');
    await card.locator('[data-preset="sales"]').click(); ok(await card.locator('input[data-m="crm"]').isChecked() && !(await card.locator('input[data-m="clients"]').isChecked()), 'the Sales preset ticks the sales modules and not the client ones');
    await card.locator('input[data-m="crm"]').uncheck(); await card.locator('input[data-m="contracts"]').check(); await card.locator('[data-note]').fill('Browser journey'); await card.locator('[data-save]').click();
    await page.waitForFunction(id => /Saved/.test(document.querySelector(`.who[data-id="${id}"] .msg`)?.textContent || ''), patId, { timeout: 8000 });
    const saved = (await O('')).json.team.find(p => p.email === PAT); ok(saved.configured && saved.modules.includes('contracts') && !saved.modules.includes('crm') && saved.note === 'Browser journey', 'saving keeps exactly what was ticked, and the note', saved);
    ok(/Contracts/.test(await page.innerText('#log')) && /by kyle@/.test(await page.innerText('#log')), 'the change shows under Recent changes');
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/team-access.png`, fullPage: false }).catch(() => {});

    // a person with only Contracts and Brand
    await O(`/users/${patId}`, { method: 'PUT', body: { modules: ['contracts', 'brand'] } });
    const pc = await b.newContext({ viewport: { width: 1280, height: 900 } }); await pc.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, patT);
    const pp = await pc.newPage(); pp.on('pageerror', e => errs.push(String(e)));
    await pp.goto(`${BASE}/contracts`, { waitUntil: 'networkidle' }); await pp.waitForSelector('.fbside');
    await pp.waitForFunction(() => document.querySelector('.fbside a[data-module="contracts"]') && !document.querySelector('.fbside a[data-module="contracts"]').hidden, null, { timeout: 8000 });
    const shown = await pp.$$eval('.fbside a:not(.gicon):not([hidden])', as => as.map(a => a.textContent.trim()));
    ok(shown.includes('Contracts') && shown.includes('Brand and assets') && shown.includes('My day') && !shown.includes('Pipeline') && !shown.includes('Factories') && !shown.includes('Team access') && !shown.includes('Payment gate') && !shown.includes('Platform health'), 'the menu shows only My day, Contracts and Brand', shown.join(' | '));
    ok(await pp.locator('.fbside .grp:has(a[data-module="crm"]):visible').count() === 0 || (await pp.locator('.fbside .grp:visible').allInnerTexts()).every(t => !/Contacts/.test(t)), 'groups with nothing to open are hidden');
    await pp.goto(`${BASE}/factories`, { waitUntil: 'networkidle' }); await pp.waitForSelector('#fbWall', { timeout: 8000 });
    ok(/not turned on for you/.test(await pp.innerText('#fbWall')) && /Factories/.test(await pp.innerText('#fbWall')) && /Kyle or Danielle/.test(await pp.innerText('#fbWall')), 'a page they were not given says so and who to ask');
    await pp.goto(`${BASE}/team`, { waitUntil: 'networkidle' }); ok(await pp.locator('#fbWall, #needSignin:not(.hidden)').count() >= 1, 'the Team access page is closed to them');
    await pc.close();
    ok(errs.length === 0, 'no page errors', errs);
  } finally {
    await O('/defaults', { method: 'PUT', body: { modules: MODULE_IDS } }); await sql(`delete from staff_access where user_id='${patId}'`); await b.close();
  }
});

const badCount = summary(); process.exit(badCount ? 1 : 0);
