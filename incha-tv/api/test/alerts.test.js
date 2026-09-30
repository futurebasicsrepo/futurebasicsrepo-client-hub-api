// Follows, push alerts and co-scorekeepers. The end-to-end part needs TEST_DATABASE_URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alertFor } from '../src/alerts.js';

const MATCH = { id: 'M1', home_name: 'Kensington FC', away_name: 'Fishtown United', home_score: 2, away_score: 1 };

test('alertFor writes goal, card and period alerts and skips the rest', () => {
  const goal = alertFor(MATCH, { type: 'goal', side: 'home', player: 'Rivera', minute: 45, stoppage: 2 });
  assert.equal(goal.title, '⚽ GOAL · Kensington FC 2–1 Fishtown United');
  assert.equal(goal.body, "Rivera for Kensington FC · 45+2'");
  assert.equal(goal.url, '/m/M1');
  assert.equal(alertFor(MATCH, { type: 'goal', side: 'away', player: '', minute: 70 }).body, "Fishtown United · 70'");
  assert.match(alertFor(MATCH, { type: 'red', side: 'away', player: 'Doyle', minute: 80 }).title, /Red card · Fishtown United/);
  assert.equal(alertFor(MATCH, { type: 'fulltime' }).title, 'Full time · Kensington FC 2–1 Fishtown United');
  assert.equal(alertFor(MATCH, { type: 'kickoff' }).title, 'Kick-off: Kensington FC vs Fishtown United');
  for (const type of ['yellow', 'note', 'second_half']) assert.equal(alertFor(MATCH, { type }), null, type);
});

const dbUrl = process.env.TEST_DATABASE_URL;

test('follows, push alerts and co-scorekeepers', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-alerts-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists tournament_fixtures, tournament_teams, tournaments, team_players, team_managers, mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();

  const sent = [];
  let gone = new Set();
  const pushSender = async (sub, payload) => {
    if (gone.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
    sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) });
  };
  const app = await buildApp({ logger: false, pushSender });
  t.after(async () => { await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signup = async handle => json(await call('POST', '/v1/auth/signup', null, { email: `${handle}@x.tv`, handle, password: 'hinchada123' })).token;
  const [keeper, helper, teamFan, matchFan, stranger] = await Promise.all(['keeper', 'helper', 'team_fan', 'match_fan', 'stranger'].map(signup));
  const subscribe = (token, name) => call('POST', '/v1/push/subscriptions', token, { endpoint: `https://push.example/${name}`, keys: { p256dh: 'BPk', auth: 'au' } });
  const flush = () => new Promise(resolve => setTimeout(resolve, 50));
  const drain = () => sent.splice(0).map(s => s.endpoint.split('/').pop()).sort();

  assert.deepEqual(json(await call('GET', '/v1/push/key')), { publicKey: null }, 'no VAPID key configured in tests');
  assert.equal((await call('POST', '/v1/push/subscriptions', teamFan, { endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } })).statusCode, 400);
  for (const [token, name] of [[keeper, 'keeper'], [helper, 'helper'], [teamFan, 'team_fan'], [matchFan, 'match_fan'], [stranger, 'stranger']]) {
    assert.equal((await subscribe(token, name)).statusCode, 201);
  }

  // A public match: team followers and match followers hear about it, the person tapping doesn't.
  const match = json(await call('POST', '/v1/matches', keeper, { home: 'Kensington FC', away: 'Fishtown United' })).match;
  assert.equal((await call('POST', '/v1/teams/fishtown-united/follow', teamFan)).statusCode, 200);
  assert.equal((await call('POST', `/v1/matches/${match.id}/follow`, matchFan)).statusCode, 200);
  assert.equal(json(await call('GET', `/v1/teams/fishtown-united`, teamFan)).following, true);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, matchFan)).match.following, true);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, stranger)).match.following, false);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, keeper)).match.following, true, 'the scorekeeper follows their match');

  await call('POST', `/v1/matches/${match.id}/events`, keeper, { type: 'kickoff' });
  await flush();
  assert.deepEqual(drain(), ['match_fan', 'team_fan'], 'kick-off goes to followers only');
  await call('POST', `/v1/matches/${match.id}/events`, keeper, { type: 'yellow', side: 'home' });
  await call('POST', `/v1/matches/${match.id}/events`, keeper, { type: 'note', player: 'Lovely day for it' });
  await flush();
  assert.deepEqual(drain(), [], 'yellows and notes are quiet');

  // Co-scorekeeper: the creator adds a helper, who can then score (and is not alerted about their own goal).
  assert.equal((await call('POST', `/v1/matches/${match.id}/events`, helper, { type: 'goal', side: 'home' })).statusCode, 404, 'not a keeper yet');
  assert.equal((await call('POST', `/v1/matches/${match.id}/keepers`, helper, { handle: 'stranger' })).statusCode, 404, 'only the creator adds keepers');
  assert.equal((await call('POST', `/v1/matches/${match.id}/keepers`, keeper, { handle: 'nobody_here' })).statusCode, 404);
  let res = await call('POST', `/v1/matches/${match.id}/keepers`, keeper, { handle: '@Helper' });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(json(res).match.keepers.map(k => k.handle), ['helper']);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, helper)).match.canScore, true);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, helper)).match.isOwner, false);
  assert.ok(json(await call('GET', '/v1/me/matches', helper)).matches.some(m => m.id === match.id), 'shows in the helper\'s matches');

  gone = new Set(['https://push.example/team_fan']); // team_fan's phone unsubscribed
  res = await call('POST', `/v1/matches/${match.id}/events`, helper, { type: 'goal', side: 'away', player: 'Doyle' });
  assert.equal(res.statusCode, 201);
  await flush();
  const goalAlerts = sent.splice(0);
  assert.deepEqual(goalAlerts.map(s => s.endpoint.split('/').pop()).sort(), ['keeper', 'match_fan'], 'the creator hears about the helper\'s goal; the helper does not');
  assert.equal(goalAlerts[0].title, '⚽ GOAL · Kensington FC 0–1 Fishtown United');
  assert.match(goalAlerts[0].body, /^Doyle for Fishtown United · \d+'$/);
  const { rows } = await pool.query(`select count(*)::int as n from push_subscriptions where endpoint = 'https://push.example/team_fan'`);
  assert.equal(rows[0].n, 0, 'expired subscriptions are removed');

  // Helper steps down; then they can't score.
  assert.equal((await call('DELETE', `/v1/matches/${match.id}/keepers/helper`, helper)).statusCode, 200);
  assert.equal((await call('POST', `/v1/matches/${match.id}/events`, helper, { type: 'goal', side: 'home' })).statusCode, 404);

  // Unfollow stops alerts (the ex-helper still follows the match they helped run).
  await call('DELETE', `/v1/matches/${match.id}/follow`, matchFan);
  await call('POST', `/v1/matches/${match.id}/events`, keeper, { type: 'halftime' });
  await flush();
  assert.deepEqual(drain(), ['helper'], 'unfollowed fans stop hearing about it');

  // Youth matches: following the team must not reveal them; only people with the match link can follow.
  await subscribe(teamFan, 'team_fan');
  await call('POST', '/v1/teams/u10-blues/follow', teamFan).then(r => assert.equal(r.statusCode, 404, 'team does not exist yet'));
  const youth = json(await call('POST', '/v1/matches', keeper, { home: 'U10 Reds', away: 'U10 Blues', youth: true })).match;
  assert.equal((await call('POST', '/v1/teams/u10-blues/follow', teamFan)).statusCode, 200);
  await call('POST', `/v1/matches/${youth.id}/follow`, matchFan);
  await call('POST', `/v1/matches/${youth.id}/events`, keeper, { type: 'kickoff' });
  await flush();
  assert.deepEqual(drain(), ['match_fan'], 'youth alerts only reach people who followed the match itself');

  // Profile hub: your matches by role, what you follow, and a public record that hides youth games.
  let mine = json(await call('GET', '/v1/me/matches', keeper));
  assert.deepEqual(mine.matches.map(m => [m.id, m.role]), [[youth.id, 'scorekeeper'], [match.id, 'scorekeeper']]);
  await call('POST', `/v1/matches/${match.id}/keepers`, keeper, { handle: 'stranger' });
  mine = json(await call('GET', '/v1/me/matches', stranger));
  assert.deepEqual(mine.matches.map(m => m.role), ['co-keeper']);
  mine = json(await call('GET', '/v1/me/matches', matchFan));
  assert.deepEqual(mine.matches, []);
  assert.deepEqual(mine.following.map(m => m.id), [youth.id], 'unfollowed earlier; still follows the youth match');
  const record = json(await call('GET', '/v1/users/keeper/matches'));
  assert.deepEqual(record.matches.map(m => m.id), [match.id], 'public record hides the youth match');
  assert.equal(json(await call('GET', '/v1/users/stranger/matches')).matches.length, 1, 'co-kept matches count too');
  assert.equal(json(await call('GET', '/v1/users/keeper')).user.matchCount, 1);
  assert.equal((await call('GET', '/v1/users/nobody/matches')).statusCode, 404);

  const follows = json(await call('GET', '/v1/me/follows', teamFan));
  assert.deepEqual(follows.teams.map(t => t.slug).sort(), ['fishtown-united', 'u10-blues']);

  // Nobody pressed Full time: the server calls it, followers hear about it, and the keeper can resume.
  const quiet = json(await call('POST', '/v1/matches', keeper, { home: 'Quiet FC', away: 'Forgetful Rovers', halfLength: 30 })).match;
  await call('POST', `/v1/matches/${quiet.id}/follow`, matchFan);
  await call('POST', `/v1/matches/${quiet.id}/events`, keeper, { type: 'kickoff' });
  await call('POST', `/v1/matches/${quiet.id}/events`, keeper, { type: 'halftime' });
  await call('POST', `/v1/matches/${quiet.id}/events`, keeper, { type: 'second_half' });
  await call('POST', `/v1/matches/${quiet.id}/events`, keeper, { type: 'goal', side: 'away' });
  await flush();
  drain();
  // Pretend the second half started 75 minutes ago and the goal went in 50 minutes ago.
  await pool.query(`update matches set period_started_at = now() - interval '75 minutes' where id = $1`, [quiet.id]);
  await pool.query(`update match_events set created_at = now() - interval '50 minutes' where match_id = $1`, [quiet.id]);
  const busy = json(await call('POST', '/v1/matches', keeper, { home: 'Busy FC', away: 'Tapping Town' })).match;
  await call('POST', `/v1/matches/${busy.id}/events`, keeper, { type: 'kickoff' });
  assert.deepEqual(await app.sweepStaleMatches(), [quiet.id], 'only the quiet, overdue match ends');
  assert.deepEqual(await app.sweepStaleMatches(), [], 'and only once');
  await flush();
  assert.deepEqual(drain(), ['keeper', 'match_fan'], 'full-time alert goes to followers, the keeper included');
  let snap = json(await call('GET', `/v1/matches/${quiet.id}`, keeper));
  assert.equal(snap.match.period, 'ft');
  assert.equal(snap.match.autoEnded, true);
  assert.equal(snap.match.awayScore, 1);
  const whistle = snap.events.at(-1);
  assert.deepEqual([whistle.type, whistle.minute, whistle.stoppage], ['fulltime', 60, 0], 'the clock stops at regulation time');
  assert.equal(json(await call('GET', `/v1/matches/${busy.id}`)).match.period, '1h');

  assert.equal((await call('POST', `/v1/matches/${quiet.id}/resume`, stranger)).statusCode, 404);
  snap = json(await call('POST', `/v1/matches/${quiet.id}/resume`, keeper));
  assert.equal(snap.match.period, '2h', 'back where it was');
  assert.equal(snap.match.autoEnded, false);
  assert.ok(!snap.events.some(e => e.type === 'fulltime'), 'the automatic whistle is gone');
  assert.equal((await call('POST', `/v1/matches/${quiet.id}/resume`, keeper)).statusCode, 400, 'nothing to resume');
  assert.deepEqual(await app.sweepStaleMatches(), [], 'a resumed match isn\u2019t ended again straight away');
  await call('POST', `/v1/matches/${quiet.id}/events`, keeper, { type: 'fulltime' });
  assert.equal((await call('POST', `/v1/matches/${quiet.id}/resume`, keeper)).statusCode, 400, 'a full time someone pressed stays');
});
