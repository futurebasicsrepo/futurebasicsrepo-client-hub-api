import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TEST_DATABASE_URL;

test('fandom communities: members, threads with nested replies, votes and live chat', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-community-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists bracket_slots, tournament_teams, tournaments, team_players, team_managers, mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const app = await buildApp({ logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let abort;
  t.after(async () => { abort?.abort(); await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signup = async handle => json(await call('POST', '/v1/auth/signup', null, { email: `${handle}@x.tv`, handle, password: 'hinchada123' })).token;
  const [ana, ben] = [await signup('ana'), await signup('ben')];
  const { rows: [{ slug }] } = await pool.query(`select slug from fandoms where slug = 'philadelphia-union'`);

  // The hub: channels, members, joining.
  let hub = json(await call('GET', `/v1/fandoms/${slug}/hub`, ana));
  assert.deepEqual(hub.channels.map(c => `${c.slug}:${c.kind}`), ['general:threads', 'matchday:chat', 'transfers:threads', 'away-days:threads', 'banter:threads']);
  assert.equal(hub.fandom.joined, false);
  assert.deepEqual(json(await call('POST', `/v1/fandoms/${slug}/join`, ana)), { joined: true, memberCount: 1 });
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/hub`, ana)).fandom.joined, true);
  assert.equal((await call('GET', '/v1/fandoms/nope/hub')).statusCode, 404);

  // Threads.
  assert.equal((await call('POST', `/v1/fandoms/${slug}/threads`, null, { title: 'Hi', channel: 'general' })).statusCode, 401);
  assert.equal((await call('POST', `/v1/fandoms/${slug}/threads`, ana, { title: 'Hi there', channel: 'matchday' })).statusCode, 400, 'chat channels have no threads');
  assert.equal((await call('POST', `/v1/fandoms/${slug}/threads`, ana, { title: 'x', channel: 'general' })).statusCode, 400, 'needs a title');
  const first = json(await call('POST', `/v1/fandoms/${slug}/threads`, ana, { title: '  Best away end   in MLS?  ', body: 'Mine is Columbus.', channel: 'away-days' })).thread;
  assert.equal(first.title, 'Best away end in MLS?');
  assert.equal(first.author.handle, 'ana');
  const second = json(await call('POST', `/v1/fandoms/${slug}/threads`, ben, { title: 'Summer window thread', channel: 'transfers' })).thread;
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/hub`)).fandom.memberCount, 2, 'posting joins you');
  let list = json(await call('GET', `/v1/fandoms/${slug}/threads?channel=away-days`, ben));
  assert.deepEqual(list.threads.map(x => x.id), [first.id], 'threads stay in their channel');
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=transfers&sort=new`)).threads[0].id, second.id);

  // Votes, once per person.
  assert.deepEqual(json(await call('POST', `/v1/threads/${first.id}/vote`, ben, { value: 1 })), { score: 1, viewerHasVoted: true });
  assert.deepEqual(json(await call('POST', `/v1/threads/${first.id}/vote`, ben, { value: 1 })), { score: 1, viewerHasVoted: true });
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=away-days`, ben)).threads[0].viewerHasVoted, true);

  // Nested replies, depth-capped.
  const r1 = json(await call('POST', `/v1/threads/${first.id}/replies`, ben, { body: 'Subaru Park, obviously.' })).reply;
  assert.equal(r1.depth, 0);
  let parent = r1;
  for (let i = 1; i <= 7; i++) {
    parent = json(await call('POST', `/v1/threads/${first.id}/replies`, i % 2 ? ana : ben, { body: `level ${i}`, parentId: parent.id })).reply;
  }
  assert.equal(parent.depth, 6, 'past the limit, replies sit beside their parent');
  assert.equal((await call('POST', `/v1/threads/${first.id}/replies`, ana, { body: 'x', parentId: 999999 })).statusCode, 400);
  assert.deepEqual(json(await call('POST', `/v1/replies/${r1.id}/vote`, ana, { value: 1 })), { score: 1, viewerHasVoted: true });
  assert.deepEqual(json(await call('POST', `/v1/replies/${r1.id}/vote`, ana, { value: 0 })), { score: 0, viewerHasVoted: false });
  let full = json(await call('GET', `/v1/threads/${first.id}`, ana));
  assert.equal(full.replies.length, 8);
  assert.equal(full.thread.replyCount, 8);
  assert.equal(full.thread.canDelete, true);
  assert.equal(json(await call('GET', `/v1/threads/${first.id}`, ben)).thread.canDelete, false);

  // Deleting: only your own; a deleted thread with replies stays readable as [removed].
  assert.equal((await call('DELETE', `/v1/replies/${r1.id}`, ana)).statusCode, 404);
  assert.equal((await call('DELETE', `/v1/replies/${r1.id}`, ben)).statusCode, 204);
  assert.equal((await call('DELETE', `/v1/threads/${first.id}`, ben)).statusCode, 404);
  assert.equal((await call('DELETE', `/v1/threads/${first.id}`, ana)).statusCode, 204);
  full = json(await call('GET', `/v1/threads/${first.id}`));
  assert.equal(full.thread.title, '[removed]');
  assert.equal(full.replies.find(r => r.id === r1.id).deleted, true);
  assert.equal(json(await call('GET', `/v1/fandoms/${slug}/threads?channel=away-days`)).threads.length, 0, 'removed threads leave the list');

  // Live chat: history plus a live stream.
  assert.equal((await call('GET', `/v1/fandoms/${slug}/chat/general`)).statusCode, 404, 'general is a threads channel');
  abort = new AbortController();
  const events = [];
  const stream = await fetch(`${base}/v1/fandoms/${slug}/chat/matchday/stream`, { signal: abort.signal });
  (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of stream.body) {
      for (const block of decoder.decode(chunk).split('\n\n')) {
        const event = block.match(/^event: (.+)$/m)?.[1];
        if (event) events.push({ event, data: JSON.parse(block.match(/^data: (.+)$/m)[1]) });
      }
    }
  })().catch(() => {});
  const until = async check => { for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 20)); assert.ok(check()); };
  await until(() => events.some(e => e.event === 'online' && e.data.online === 1));
  const sent = json(await call('POST', `/v1/fandoms/${slug}/chat/matchday`, ben, { body: 'VAMOS UNION' }));
  assert.equal(sent.message.body, 'VAMOS UNION');
  await until(() => events.some(e => e.event === 'message' && e.data.body === 'VAMOS UNION'));
  const history = json(await call('GET', `/v1/fandoms/${slug}/chat/matchday`));
  assert.deepEqual(history.messages.map(m => m.body), ['VAMOS UNION']);
  assert.equal(history.online, 1);
  const flood = [];
  for (let i = 0; i < 8; i++) flood.push((await call('POST', `/v1/fandoms/${slug}/chat/matchday`, ben, { body: `msg ${i}` })).statusCode);
  assert.ok(flood.includes(429), 'chat is rate limited');
});
