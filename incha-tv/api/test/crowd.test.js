import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TEST_DATABASE_URL;

// Reads a Server-Sent Events stream and collects parsed events.
function listen(url) {
  const events = [];
  const controller = new AbortController();
  const done = (async () => {
    const res = await fetch(url, { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = block.match(/^event: (.+)$/m)?.[1];
        const data = block.match(/^data: (.+)$/m)?.[1];
        if (event) events.push({ event, data: JSON.parse(data) });
      }
    }
  })().catch(() => {});
  return { events, close: () => { controller.abort(); return done; } };
}
const until = async (check, ms = 4000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};

test('the crowd: watcher counts and pooled cheers over the match stream', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-crowd-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists tournament_fixtures, tournament_teams, tournaments, team_players, team_managers, mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const app = await buildApp({ logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const streams = [];
  t.after(async () => { await Promise.all(streams.map(s => s.close())); await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const { token } = json(await call('POST', '/v1/auth/signup', null, { email: 'k@x.tv', handle: 'keeper', password: 'hinchada123' }));
  const { match } = json(await call('POST', '/v1/matches', token, { home: 'Kensington FC', away: 'Fishtown United' }));

  assert.equal((await call('POST', `/v1/matches/${match.id}/cheer`, null, { kind: 'flare' })).statusCode, 409, 'no cheering before kick-off');
  await call('POST', `/v1/matches/${match.id}/events`, token, { type: 'kickoff' });
  assert.equal((await call('POST', `/v1/matches/${match.id}/cheer`, null, { kind: 'boo' })).statusCode, 400);
  assert.equal((await call('POST', '/v1/matches/nope/cheer', null, { kind: 'flare' })).statusCode, 404);

  const a = listen(`${base}/v1/matches/${match.id}/stream`);
  streams.push(a);
  await until(() => a.events.some(e => e.event === 'crowd'));
  assert.equal(a.events.find(e => e.event === 'crowd').data.watching, 1, 'a new watcher hears the count straight away');
  const b = listen(`${base}/v1/matches/${match.id}/stream`);
  streams.push(b);
  await until(() => a.events.some(e => e.event === 'crowd' && e.data.watching === 2), 4000);

  // Five quick cheers from two viewers arrive as one pooled message.
  const cheer = (kind, cid) => fetch(`${base}/v1/matches/${match.id}/cheer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, cid }) });
  const codes = await Promise.all([cheer('flare', 'tabA'), cheer('flare', 'tabA'), cheer('clap', 'tabB'), cheer('wow', 'tabB'), cheer('flare', 'tabB')]);
  assert.deepEqual(codes.map(r => r.status), [202, 202, 202, 202, 202]);
  await until(() => b.events.some(e => e.event === 'cheer'));
  const pooled = b.events.filter(e => e.event === 'cheer');
  assert.equal(pooled.length, 1, 'pooled into one message');
  assert.deepEqual(pooled[0].data.counts, { flare: 3, clap: 1, wow: 1 });
  assert.deepEqual(pooled[0].data.from.sort(), ['tabA', 'tabB']);

  // One viewer can't flood the match.
  const burst = await Promise.all(Array.from({ length: 30 }, () => cheer('clap')));
  assert.ok(burst.some(r => r.status === 429), 'rate limited');

  // Leaving updates the count for everyone else.
  await b.close();
  await until(() => a.events.some(e => e.event === 'crowd' && e.data.watching === 1), 4000);
});
