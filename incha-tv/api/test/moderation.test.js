import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TEST_DATABASE_URL;

test('moderation: reports, auto-hide, the queue, removals, bans and roles', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-mod-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  process.env.ADMIN_HANDLES = 'boss';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const app = await buildApp({ logger: false });
  await app.ready();
  t.after(async () => { delete process.env.ADMIN_HANDLES; await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signup = async handle => json(await call('POST', '/v1/auth/signup', null, { email: `${handle}@x.tv`, handle, password: 'hinchada123' })).token;
  const [boss, ana, ben, cara, dan] = [await signup('boss'), await signup('ana'), await signup('ben'), await signup('cara'), await signup('dan')];
  const report = (token, type, id, reason = 'spam', note) => call('POST', '/v1/reports', token, { type, id, reason, note });

  assert.equal(json(await call('GET', '/v1/me', boss)).user.role, 'admin', 'ADMIN_HANDLES makes an admin');
  assert.equal(json(await call('GET', '/v1/me', ana)).user.role, 'user');
  assert.equal(json(await call('GET', '/v1/reports/reasons')).reasons.length, 8);

  // A thread gets reported by three different fans and hides itself.
  const slug = 'philadelphia-union';
  const thread = json(await call('POST', `/v1/fandoms/${slug}/threads`, ana, { title: 'Buy cheap tickets here!!!', body: 'dm me', channel: 'general' })).thread;
  assert.equal((await report(null, 'thread', thread.id)).statusCode, 401);
  assert.equal((await report(ana, 'thread', thread.id)).statusCode, 400, 'not your own');
  assert.equal((await report(ben, 'thread', thread.id, 'nonsense')).statusCode, 400);
  assert.equal((await report(ben, 'thread', 'NoSuchThrd')).statusCode, 404);
  assert.equal((await report(ben, 'thread', thread.id, 'spam', 'ticket tout')).statusCode, 201);
  assert.equal((await report(ben, 'thread', thread.id, 'spam')).statusCode, 201, 'reporting twice updates, it does not count twice');
  await report(cara, 'thread', thread.id, 'spam');
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=general`)).threads.length, 1, 'two reporters: still up');
  await report(dan, 'thread', thread.id, 'harassment');
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=general`)).threads.length, 0, 'three reporters: hidden');
  assert.equal((await call('GET', `/v1/threads/${thread.id}`)).statusCode, 404, 'a hidden thread with no replies is gone');

  // The queue: moderators only.
  assert.equal((await call('GET', '/v1/mod/reports', ana)).statusCode, 403);
  let queue = json(await call('GET', '/v1/mod/reports', boss));
  assert.equal(queue.items.length, 1);
  const item = queue.items[0];
  assert.equal(item.type, 'thread');
  assert.equal(item.reporters, 3);
  assert.deepEqual(item.reasons, { spam: 2, harassment: 1 });
  assert.equal(item.autoHidden, true);
  assert.equal(item.snapshot.title, 'Buy cheap tickets here!!!');
  assert.equal(item.author, 'ana');
  assert.deepEqual(item.notes, ['ticket tout']);
  assert.equal(item.link, `/f/${slug}/t/${thread.id}`);

  // Dismiss restores it; remove takes it down for good.
  assert.equal(json(await call('POST', '/v1/mod/resolve', boss, { type: 'thread', id: thread.id, action: 'dismiss' })).resolved, 3);
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=general`)).threads.length, 1, 'dismissed: back up');
  assert.equal(json(await call('GET', '/v1/mod/reports', boss)).items.length, 0);
  await report(ben, 'thread', thread.id, 'spam');
  await call('POST', '/v1/mod/resolve', boss, { type: 'thread', id: thread.id, action: 'remove' });
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=general`)).threads.length, 0, 'removed');
  const closed = json(await call('GET', '/v1/mod/reports?status=closed', boss)).items;
  assert.ok(closed.some(i => i.id === thread.id && i.resolution === 'removed'));
  await call('POST', '/v1/mod/restore', boss, { type: 'thread', id: thread.id });
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=general`)).threads.length, 1, 'a removal can be undone');

  // A child-safety report hides immediately.
  const reply = json(await call('POST', `/v1/threads/${thread.id}/replies`, ben, { body: 'some reply' })).reply;
  await report(cara, 'reply', String(reply.id), 'minor_safety');
  const replies = json(await call('GET', `/v1/threads/${thread.id}`)).replies;
  assert.equal(replies[0].deleted, true);
  assert.equal(replies[0].body, null);

  // Posts: removal takes a clip off every feed, and its owner can't republish it.
  const { rows: [{ id: anaId }] } = await pool.query(`select id from users where handle = 'ana'`);
  await pool.query(`insert into posts (id, user_id, title, media_kind, media_key, media_mime, media_bytes, status, visibility, published_at)
    values ('PostAAAAAA', $1, 'Smoke show', 'image', 'aaaaaaaaaaaaaaaaaaaaaaaa.jpg', 'image/jpeg', 10, 'published', 'public', now())`, [anaId]);
  assert.equal(json(await call('GET', '/v1/posts?sort=new')).posts.length, 1);
  await report(ben, 'post', 'PostAAAAAA', 'copyright');
  await call('POST', '/v1/mod/resolve', boss, { type: 'post', id: 'PostAAAAAA', action: 'remove' });
  assert.equal(json(await call('GET', '/v1/posts?sort=new')).posts.length, 0);
  assert.equal((await call('POST', '/v1/posts/PostAAAAAA/publish', ana, {})).statusCode, 403);

  // Chat: hidden messages leave the history.
  const msg = json(await call('POST', `/v1/fandoms/${slug}/chat/matchday`, ben, { body: 'you lot are rubbish' })).message;
  await report(ana, 'chat', String(msg.id), 'harassment');
  await call('POST', '/v1/mod/resolve', boss, { type: 'chat', id: String(msg.id), action: 'remove' });
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/chat/matchday`)).messages.length, 0);

  // Roles: admins appoint moderators; moderators can't touch admins or each other.
  assert.equal((await call('POST', '/v1/mod/users/cara/role', ana, { role: 'moderator' })).statusCode, 403);
  assert.equal(json(await call('POST', '/v1/mod/users/cara/role', boss, { role: 'moderator' })).role, 'moderator');
  assert.equal((await call('GET', '/v1/mod/reports', cara)).statusCode, 200);
  assert.equal((await call('POST', '/v1/mod/users/boss/ban', cara, {})).statusCode, 403);
  assert.equal((await call('POST', '/v1/mod/users/dan/role', cara, { role: 'moderator' })).statusCode, 403, 'only admins appoint');

  // Bans sign the account out everywhere and block sign-in.
  assert.deepEqual(json(await call('POST', '/v1/mod/users/ben/ban', cara, { note: 'harassment in chat' })), { banned: true });
  assert.equal((await call('GET', '/v1/me', ben)).statusCode, 401);
  assert.equal((await call('POST', `/v1/fandoms/${slug}/chat/matchday`, ben, { body: 'hello?' })).statusCode, 401);
  assert.equal((await call('POST', '/v1/auth/login', null, { login: 'ben', password: 'hinchada123' })).statusCode, 403);
  await call('POST', '/v1/mod/users/ben/ban', cara, { banned: false });
  assert.equal((await call('GET', '/v1/me', ben)).statusCode, 200, 'unbanned');

  const team = json(await call('GET', '/v1/mod/team', boss));
  assert.deepEqual(team.team.map(m => `${m.handle}:${m.role}`), ['cara:moderator']);
  assert.ok(team.log.some(a => a.action === 'ban' && a.id === 'ben' && a.note === 'harassment in chat'));
});
