import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRow, orderProjects, prototypeRow, trend, greeting, LEAD_SOURCES_EXCLUDED } from '../src/home.js';

const NOW = Date.parse('2026-10-11T12:00:00Z'), day = n => new Date(NOW - n * 86400_000).toISOString();

test('a software project is waiting on us when the client wrote last, otherwise the stage says who has the ball', () => {
  const sw = { id: 'p', client_id: 'c', client_name: 'Salon', name: 'Site', kind: 'software', stage: 'review', status: 'active', updated_at: day(1), last_author: 'admin', last_message_at: day(1), build_name: 'Salon site' };
  assert.equal(projectRow(sw, NOW).owner, 'client'); assert.equal(projectRow(sw, NOW).waitingOnUs, false); assert.equal(projectRow(sw, NOW).stageLabel, 'Client review');
  assert.equal(projectRow({ ...sw, last_author: 'client' }, NOW).owner, 'us'); assert.equal(projectRow({ ...sw, last_author: 'client' }, NOW).waitingOnUs, true);
  assert.equal(projectRow({ ...sw, stage: 'build' }, NOW).owner, 'us');
  const pr = projectRow({ id: 'q', client_id: 'c', client_name: 'Shoes', name: 'Hoodie', kind: 'product', milestone: 'Sample', status: 'active', updated_at: day(2), product_count: 3 }, NOW);
  assert.equal(pr.kind, 'product'); assert.equal(pr.stage, null); assert.equal(pr.stageLabel, 'Sample'); assert.equal(pr.productCount, 3); assert.equal(pr.quietDays, 2);
});

test('projects waiting on us come first, then ours, then the client\'s, each by recency', () => {
  const rows = [{ id: 'a', waitingOnUs: false, owner: 'client', updatedAt: day(1) }, { id: 'b', waitingOnUs: false, owner: 'us', updatedAt: day(5) }, { id: 'c', waitingOnUs: true, owner: 'us', updatedAt: day(9) }, { id: 'd', waitingOnUs: false, owner: 'us', updatedAt: day(2) }];
  assert.deepEqual(orderProjects(rows).map(r => r.id), ['c', 'd', 'b', 'a']);
});

test('a prototype says what to do next from who has looked', () => {
  const b = { id: 'x', slug: 's', name: 'Site', status: 'in-progress', visibility: 'hidden', lookers7: 0, invites: 0, views7: 0, stack: ['Node'], clients: ['Salon'] };
  assert.match(prototypeRow(b).next, /invite someone/i); assert.equal(prototypeRow(b).warm, false);
  assert.match(prototypeRow({ ...b, visibility: 'invite', invites: 2 }).next, /nudge/i);
  assert.match(prototypeRow({ ...b, lookers7: 1 }).next, /say hello/i); assert.equal(prototypeRow({ ...b, lookers7: 1 }).warm, true);
  assert.match(prototypeRow({ ...b, visibility: 'listed' }).next, /not shared/i); assert.deepEqual(prototypeRow({ ...b, clients: null }).clients, []);
});

test('the week-on-week trend reads plainly, including from nothing', () => {
  assert.deepEqual(trend(0, 0), { dir: 'flat', text: 'no change' }); assert.deepEqual(trend(3, 0), { dir: 'up', text: 'new this week' });
  assert.deepEqual(trend(5, 3), { dir: 'up', text: '+2 on last week' }); assert.deepEqual(trend(2, 6), { dir: 'down', text: '-4 on last week' }); assert.equal(trend(4, 4).dir, 'flat');
});

test('greeting follows the hour and people who are already clients are not new leads', () => {
  assert.equal(greeting(14), 'Good morning'); assert.equal(greeting(20), 'Good afternoon'); assert.equal(greeting(2), 'Good evening');
  assert.deepEqual(LEAD_SOURCES_EXCLUDED, ['hub', 'import']);
});

test('a teammate is greeted by their first name, from their name or else their email', async () => {
  const { firstName } = await import('../src/home.js');
  assert.equal(firstName('Colby Rowe', 'colby@thefuturebasics.com'), 'Colby');
  assert.equal(firstName('colby', ''), 'Colby');
  assert.equal(firstName('', 'mary.jones@thefuturebasics.com'), 'Mary');
  assert.equal(firstName('kyle@thefuturebasics.com', 'kyle@thefuturebasics.com'), 'Kyle');
  assert.equal(firstName('  Danielle   Smith ', 'x@y.z'), 'Danielle');
  assert.equal(firstName('Zoë Álvarez', ''), 'Zoë');
  assert.equal(firstName('McKenzie Lee', ''), 'McKenzie', 'a name with its own capitals is left as written');
  assert.equal(firstName('', 'ops-12345@thefuturebasics.com'), 'Ops');
  assert.equal(firstName('', ''), '');
  assert.equal(firstName('1234', ''), '');
});

test('an account row says what needs the owner in words, and the ones that need them sort first', async () => {
  const { accountRow, orderAccounts } = await import('../src/home.js');
  const NOW = Date.parse('2026-10-12T12:00:00Z');
  const busy = accountRow({ id: 'a', name: 'Busy Co', projects: 2, waiting_on_us: 1, approvals: 2, tasks_due: 0, last_message_at: '2026-10-09T12:00:00Z' }, NOW);
  assert.deepEqual(busy.needs, ['1 project waiting on you', '2 approvals waiting']); assert.equal(busy.needsYou, true); assert.equal(busy.quietDays, 3);
  const calm = accountRow({ id: 'b', name: 'Calm Co', projects: 1, waiting_on_us: 0, approvals: 0, tasks_due: 0, last_message_at: null }, NOW);
  assert.deepEqual([calm.needs, calm.needsYou, calm.quietDays], [[], false, null]);
  const task = accountRow({ id: 'c', name: 'Alpha', projects: 1, waiting_on_us: 0, approvals: 0, tasks_due: 2 }, NOW); assert.deepEqual(task.needs, ['2 tasks due']);
  assert.deepEqual(orderAccounts([calm, task, busy]).map(a => a.name), ['Busy Co', 'Alpha', 'Calm Co']);
});
