// Rosters and tournaments end to end. Runs only when TEST_DATABASE_URL points at a disposable Postgres database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TEST_DATABASE_URL;

test('rosters and knockout tournaments', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-cup-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists tournament_fixtures, tournament_teams, tournaments, team_players, team_managers, mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  await migrate(); // idempotent
  const app = await buildApp({ logger: false });
  t.after(async () => { await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signup = async handle => json(await call('POST', '/v1/auth/signup', null, { email: `${handle}@x.tv`, handle, password: 'hinchada123' })).token;
  const [org, ana, ben, cara, dan, eve] = [await signup('org'), await signup('ana'), await signup('ben'), await signup('cara'), await signup('dan'), await signup('eve')];

  // ---- rosters ----
  // Typing a team into a match doesn't make you its manager; the first to claim it does.
  let res = await call('POST', '/v1/matches', ben, { home: 'Kensington United', away: 'Rangers FC' });
  const friendly = json(res).match;
  let team = json(await call('GET', '/v1/teams/kensington-united'));
  assert.equal(team.canManage, false);
  assert.deepEqual(team.managers, []);
  assert.equal((await call('POST', '/v1/teams/kensington-united/players', ana, { name: 'Diego Ruiz', number: 9 })).statusCode, 403);
  assert.equal((await call('POST', '/v1/teams/kensington-united/claim', ana)).statusCode, 201);
  assert.equal((await call('POST', '/v1/teams/kensington-united/claim', ben)).statusCode, 409, 'claimed already');
  res = await call('POST', '/v1/teams/kensington-united/players', ana, { name: 'Diego Ruiz', number: 9, position: 'FW' });
  assert.equal(res.statusCode, 201);
  await call('POST', '/v1/teams/kensington-united/players', ana, { name: 'Sam Lee', number: 4 });
  assert.equal((await call('POST', '/v1/teams/kensington-united/players', ana, { name: 'Copycat', number: 9 })).statusCode, 409);
  assert.equal((await call('POST', '/v1/teams/kensington-united/players', ana, { name: '' })).statusCode, 400);
  const roster = json(await call('GET', '/v1/teams/kensington-united/roster')).players;
  assert.deepEqual(roster.map(p => p.name), ['Sam Lee', 'Diego Ruiz'], 'sorted by shirt number');
  const diego = roster.find(p => p.number === 9);
  res = await call('PATCH', `/v1/teams/kensington-united/players/${diego.id}`, ana, { position: 'ST' });
  assert.equal(json(res).players.find(p => p.id === diego.id).position, 'ST');

  // Managers add managers; anyone can step down.
  assert.equal((await call('POST', '/v1/teams/kensington-united/managers', ana, { handle: '@nobody' })).statusCode, 404);
  res = await call('POST', '/v1/teams/kensington-united/managers', ana, { handle: 'cara' });
  assert.deepEqual(json(res).managers.map(m => m.handle), ['ana', 'cara']);
  assert.equal(json(await call('DELETE', '/v1/teams/kensington-united/managers/cara', cara)).managers.length, 1);

  // The scorekeeper gets both rosters; "9" becomes Diego and counts on his stats.
  let snap = json(await call('GET', `/v1/matches/${friendly.id}`, ben));
  assert.equal(snap.rosters.home.length, 2);
  assert.equal(json(await call('GET', `/v1/matches/${friendly.id}`, ana)).rosters, undefined, 'only scorekeepers see the picker');
  await call('POST', `/v1/matches/${friendly.id}/events`, ben, { type: 'kickoff' });
  snap = json(await call('POST', `/v1/matches/${friendly.id}/events`, ben, { type: 'goal', side: 'home', player: '9' }));
  assert.equal(snap.events.at(-1).player, '#9 Diego Ruiz');
  assert.equal(snap.events.at(-1).playerId, diego.id);
  snap = json(await call('POST', `/v1/matches/${friendly.id}/events`, ben, { type: 'yellow', side: 'home', playerId: diego.id }));
  assert.equal(snap.events.at(-1).playerId, diego.id);
  assert.equal((await call('POST', `/v1/matches/${friendly.id}/events`, ben, { type: 'goal', side: 'away', playerId: diego.id })).statusCode, 400, 'not on the away roster');
  snap = json(await call('POST', `/v1/matches/${friendly.id}/events`, ben, { type: 'goal', side: 'away', player: 'Their striker' }));
  assert.equal(snap.events.at(-1).playerId, null, 'free text still works');
  team = json(await call('GET', '/v1/teams/kensington-united'));
  assert.deepEqual(team.players.find(p => p.id === diego.id).stats, { goals: 1, yellows: 1, reds: 0, matches: 1 });

  // Removed players leave the roster but keep their history.
  await call('DELETE', `/v1/teams/kensington-united/players/${diego.id}`, ana);
  assert.equal(json(await call('GET', '/v1/teams/kensington-united')).players.length, 1);
  assert.equal(json(await call('GET', `/v1/matches/${friendly.id}`)).events.find(e => e.type === 'goal').player, '#9 Diego Ruiz');

  // Youth rosters are private to managers.
  await call('PATCH', '/v1/teams/kensington-united', ana, { youth: true });
  team = json(await call('GET', '/v1/teams/kensington-united', ben));
  assert.equal(team.rosterHidden, true);
  assert.deepEqual(team.players, []);
  assert.equal(json(await call('GET', '/v1/teams/kensington-united', ana)).players.length, 1);
  await call('PATCH', '/v1/teams/kensington-united', ana, { youth: false });

  // ---- tournaments ----
  assert.equal((await call('POST', '/v1/tournaments', org, { name: '' })).statusCode, 400);
  res = await call('POST', '/v1/tournaments', org, { name: 'Summer Cup', venue: 'FDR Park', teamLimit: 5, halfLength: 20 });
  assert.equal(res.statusCode, 201);
  let cup = json(res);
  const id = cup.tournament.id;
  assert.equal(cup.tournament.status, 'registration');
  assert.equal(cup.tournament.canManage, true);
  assert.ok(json(await call('GET', '/v1/tournaments')).tournaments.some(x => x.id === id));

  // Registration: a new team comes with its roster and its registrant as manager.
  res = await call('POST', `/v1/tournaments/${id}/teams`, ben, { name: 'Fishtown FC', players: [{ name: 'Ola', number: 1 }, { name: 'Ike', number: 7 }, { name: '' }] });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(json(res).teams[0].players, 2);
  assert.equal(json(await call('GET', '/v1/teams/fishtown-fc', ben)).canManage, true);
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, ben, { name: 'Fishtown FC' })).statusCode, 409, 'already in');
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, cara, { name: 'Kensington United' })).statusCode, 409, 'someone else manages it');
  res = await call('POST', `/v1/tournaments/${id}/teams`, ana, { name: 'Kensington United', players: [{ name: 'Sam Lee', number: 4 }, { name: 'New Kid', number: 4 }] });
  assert.equal(res.statusCode, 400, 'duplicate numbers in the form');
  res = await call('POST', `/v1/tournaments/${id}/teams`, ana, { name: 'Kensington United', players: [{ name: 'Sam Lee', number: 4 }, { name: 'New Kid', number: 11 }] });
  assert.equal(res.statusCode, 201);
  assert.equal(json(await call('GET', '/v1/teams/kensington-united')).players.length, 2, 'Sam was already on it; only New Kid is added');
  await call('POST', `/v1/tournaments/${id}/teams`, cara, { name: 'Port Richmond' });
  await call('POST', `/v1/tournaments/${id}/teams`, dan, { name: 'Northern Liberties' });
  res = await call('POST', `/v1/tournaments/${id}/teams`, eve, { name: 'Point Breeze' });
  assert.equal(json(res).tournament.teamCount, 5);
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, eve, { name: 'One Too Many' })).statusCode, 409, 'full');

  // Withdraw and re-register; only the organizer starts it.
  cup = json(await call('DELETE', `/v1/tournaments/${id}/teams/point-breeze`, eve));
  assert.equal(cup.tournament.teamCount, 4);
  assert.equal((await call('DELETE', `/v1/tournaments/${id}/teams/port-richmond`, eve)).statusCode, 404);
  await call('POST', `/v1/tournaments/${id}/teams`, eve, { name: 'Point Breeze' });
  assert.equal((await call('POST', `/v1/tournaments/${id}/start`, ben)).statusCode, 404);
  assert.equal((await call('POST', `/v1/tournaments/${id}/start`, org, { seeding: 'order', order: ['fishtown-fc'] })).statusCode, 400);

  // 5 teams → an 8-team bracket: seeds 1–3 get byes, 4 v 5 plays.
  const order = ['fishtown-fc', 'kensington-united', 'port-richmond', 'northern-liberties', 'point-breeze'];
  res = await call('POST', `/v1/tournaments/${id}/start`, org, { seeding: 'order', order });
  assert.equal(res.statusCode, 200, res.body);
  cup = json(res);
  assert.equal(cup.tournament.status, 'in_progress');
  assert.deepEqual(cup.rounds.map(r => r.name), ['Quarter-finals', 'Semi-finals', 'Final']);
  const qf = cup.rounds[0].fixtures;
  assert.equal(qf.filter(f => f.bye).length, 3);
  const playIn = qf.find(f => !f.bye);
  assert.deepEqual([playIn.home.slug, playIn.away.slug], ['northern-liberties', 'point-breeze']);
  assert.equal(playIn.match.competition, 'Summer Cup · Quarter-finals');
  assert.equal(playIn.match.halfLength, 20);
  assert.equal(playIn.match.tournamentId, id);
  const [sf1, sf2] = cup.rounds[1].fixtures;
  assert.equal(sf1.home.slug, 'fishtown-fc');
  assert.equal(sf1.match, null, 'waits for the play-in');
  assert.deepEqual([sf2.home.slug, sf2.away.slug], ['kensington-united', 'port-richmond']);
  assert.ok(sf2.match, 'both byes known: the match exists');
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, eve, { name: 'Late FC' })).statusCode, 409, 'registration closed');
  assert.equal((await call('POST', `/v1/tournaments/${id}/start`, org)).statusCode, 409);

  // The organizer runs the play-in; the winner moves on at full time.
  const play = async (matchId, home, away) => {
    await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'kickoff' });
    for (let i = 0; i < home; i++) await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'goal', side: 'home' });
    for (let i = 0; i < away; i++) await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'goal', side: 'away' });
    return call('POST', `/v1/matches/${matchId}/events`, org, { type: 'fulltime' });
  };
  await play(playIn.match.id, 0, 2);
  cup = json(await call('GET', `/v1/tournaments/${id}`));
  assert.equal(cup.rounds[0].fixtures.find(f => f.id === playIn.id).winner, 'point-breeze');
  let semi1 = cup.rounds[1].fixtures[0];
  assert.equal(semi1.away.slug, 'point-breeze');
  assert.ok(semi1.match, 'the semi is created once both teams are known');

  // Undoing a goal after full time changes the result: the next match (not started) swaps teams.
  const pb = json(await call('GET', `/v1/matches/${playIn.match.id}`, org)).events.filter(e => e.type === 'goal');
  await call('DELETE', `/v1/matches/${playIn.match.id}/events/${pb[0].id}`, org);
  await call('DELETE', `/v1/matches/${playIn.match.id}/events/${pb[1].id}`, org); // 0–0 now: a draw
  cup = json(await call('GET', `/v1/tournaments/${id}`));
  assert.equal(cup.rounds[0].fixtures.find(f => f.id === playIn.id).winner, null);
  assert.equal(cup.rounds[1].fixtures[0].away, null);
  assert.equal(cup.rounds[1].fixtures[0].match, null, 'the unplayed semi is dropped');
  assert.equal((await call('GET', `/v1/matches/${semi1.match.id}`)).statusCode, 404);

  // A draw is the organizer's call (penalties).
  assert.equal((await call('POST', `/v1/tournaments/${id}/fixtures/${playIn.id}/winner`, ben, { team: 'point-breeze' })).statusCode, 404);
  assert.equal((await call('POST', `/v1/tournaments/${id}/fixtures/${playIn.id}/winner`, org, { team: 'fishtown-fc' })).statusCode, 400);
  cup = json(await call('POST', `/v1/tournaments/${id}/fixtures/${playIn.id}/winner`, org, { team: 'northern-liberties' }));
  assert.equal(cup.rounds[0].fixtures.find(f => f.id === playIn.id).decided, 'organizer');
  semi1 = cup.rounds[1].fixtures[0];
  assert.equal(semi1.away.slug, 'northern-liberties');
  assert.equal((await call('POST', `/v1/tournaments/${id}/fixtures/${qf.find(f => f.bye).id}/winner`, org, { team: 'fishtown-fc' })).statusCode, 409, 'byes are settled');

  // Semis, then the final; once a match has kicked off the earlier result is locked.
  await play(semi1.match.id, 3, 1);
  await play(sf2.match.id, 1, 2);
  cup = json(await call('GET', `/v1/tournaments/${id}`));
  const final = cup.rounds[2].fixtures[0];
  assert.deepEqual([final.home.slug, final.away.slug], ['fishtown-fc', 'port-richmond']);
  await call('POST', `/v1/matches/${final.match.id}/events`, org, { type: 'kickoff' });
  res = await call('POST', `/v1/tournaments/${id}/fixtures/${semi1.id}/winner`, org, { team: 'northern-liberties' });
  assert.equal(res.statusCode, 409, 'the final has started');
  await call('POST', `/v1/matches/${final.match.id}/events`, org, { type: 'goal', side: 'away' });
  await call('POST', `/v1/matches/${final.match.id}/events`, org, { type: 'fulltime' });
  cup = json(await call('GET', `/v1/tournaments/${id}`));
  assert.equal(cup.tournament.status, 'finished');
  assert.deepEqual(cup.tournament.champion, { slug: 'port-richmond', name: 'Port Richmond' });
  assert.equal(json(await call('GET', '/v1/tournaments?mine=1', ana)).tournaments.length, 1, 'registered teams see it under mine');

  // Youth tournaments are unlisted, and so are their matches and new teams.
  res = await call('POST', '/v1/tournaments', org, { name: 'U12 Cup', youth: true, visibility: 'public' });
  const u12 = json(res).tournament;
  assert.equal(u12.visibility, 'unlisted');
  assert.ok(!json(await call('GET', '/v1/tournaments')).tournaments.some(x => x.id === u12.id));
  await call('POST', `/v1/tournaments/${u12.id}/teams`, ana, { name: 'Little Lions', players: [{ name: 'Kid A', number: 3 }] });
  await call('POST', `/v1/tournaments/${u12.id}/teams`, ben, { name: 'Tiny Tigers' });
  assert.equal(json(await call('GET', '/v1/teams/little-lions', ben)).rosterHidden, true);
  cup = json(await call('POST', `/v1/tournaments/${u12.id}/start`, org, { seeding: 'random' }));
  assert.equal(cup.rounds.length, 1);
  assert.equal(cup.rounds[0].fixtures[0].match.youth, true);
  assert.equal((await call('DELETE', `/v1/tournaments/${u12.id}`, org)).statusCode, 409, 'started');
  const draft = json(await call('POST', '/v1/tournaments', org, { name: 'Maybe Cup' })).tournament;
  assert.equal((await call('PATCH', `/v1/tournaments/${draft.id}`, org, { teamLimit: 8, venue: 'Park' })).statusCode, 200);
  assert.equal((await call('DELETE', `/v1/tournaments/${draft.id}`, org)).statusCode, 204);
});
